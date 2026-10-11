import { formLink, recordsFromHistory, takeoutHistoryItems, toCsv } from './forms.js';
import { clearAll, deviceName, loadAll, loadCheckRun, loadStatus, setDeviceName, syncProblem, upsert } from './store.js';

const $ = (id) => document.getElementById(id);
let records = new Map();
let status = {};
let checkRun = null;

const when = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmt = (ms) => (ms > 1 ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

function notice(text) {
  $('notice').hidden = !text;
  $('notice').textContent = text ?? '';
}

function visible() {
  const q = $('q').value.trim().toLowerCase();
  return [...records]
    .filter(([, r]) => !$('submittedOnly').checked || r.s)
    .filter(([, r]) => !$('hideEditor').checked || !r.e || r.s)
    .filter(([id, r]) => !q || r.t.toLowerCase().includes(q) || id.toLowerCase().includes(q))
    .sort(([, a], [, b]) => (b.s ? 1 : 0) - (a.s ? 1 : 0) || b.l - a.l);
}

function cell(row, text, cls) {
  const td = row.insertCell();
  td.textContent = text;
  if (cls) td.className = cls;
  return td;
}

function render() {
  const rows = visible();
  const body = $('rows');
  body.replaceChildren();
  for (const [id, r] of rows) {
    const tr = body.insertRow();
    const name = tr.insertCell();
    const a = document.createElement('a');
    a.href = formLink(id, r);
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = r.t || '(no title recorded)';
    name.append(a);
    if (r.e) name.append(Object.assign(document.createElement('div'), { className: 'small', textContent: 'you can edit this form' }));
    cell(tr, r.s ? (r.s > 1 ? fmt(r.s) : 'yes') : '', r.s ? 'yes' : '');
    const st = status[id]?.state ?? (r.c ? 'closed' : '');
    cell(tr, st, st === 'closed' ? 'closed' : st === 'open' ? 'open' : '');
    cell(tr, fmt(r.l));
    cell(tr, (r.d ?? []).join(', '), 'small');
  }
  const total = records.size;
  const submitted = [...records.values()].filter((r) => r.s).length;
  $('summary').textContent = total
    ? `${total} form(s) found, ${submitted} submitted. Showing ${rows.length}.`
    : 'No Google Forms found yet. Rescan, or import a Takeout file.';
  $('checked').textContent = !checkRun
    ? 'Open or closed is checked once a day, starting a few minutes after install.'
    : checkRun.running
      ? `Checking which forms are still open: ${checkRun.done ?? 0} of ${checkRun.total ?? '?'}…`
      : checkRun.error
        ? `The last open/closed check failed: ${checkRun.error}`
        : `Open or closed last checked ${when(checkRun.finished)}. Checked again automatically once a day.`;
}

async function refresh() {
  [records, status, checkRun] = await Promise.all([loadAll(), loadStatus(), loadCheckRun()]);
  const problem = await syncProblem();
  if (problem) notice(`Some records are kept only in this browser because sync storage refused them: ${problem}`);
  render();
}

async function busy(button, work) {
  button.disabled = true;
  try {
    await work();
  } catch (e) {
    notice(String(e?.message ?? e));
  } finally {
    button.disabled = false;
    await refresh();
  }
}

$('rescan').addEventListener('click', (e) =>
  busy(e.currentTarget, async () => {
    const r = await chrome.runtime.sendMessage({ type: 'scan', since: 0 });
    if (r?.error) throw new Error(r.error);
    notice(`Read ${r.scanned} history entries and found ${r.forms} form(s).`);
  }),
);

$('check').addEventListener('click', (e) =>
  busy(e.currentTarget, async () => {
    // The background worker does the work, so it carries on if this tab is closed.
    const r = await chrome.runtime.sendMessage({ type: 'check' });
    if (r?.error) throw new Error(r.error);
    notice(`Checked ${r.total} form(s).`);
  }),
);

$('takeout').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const items = takeoutHistoryItems(await file.text());
    const found = recordsFromHistory(items);
    await upsert(found);
    notice(`Takeout file: ${items.length} history entries, ${found.size} Google Form(s).`);
  } catch (err) {
    notice(`Could not read that file. ${err?.message ?? err}`);
  }
  e.target.value = '';
  await refresh();
});

$('csv').addEventListener('click', () => {
  const blob = new Blob([toCsv(visible())], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'google-forms.csv' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('clear').addEventListener('click', (e) =>
  busy(e.currentTarget, async () => {
    if (!confirm('Forget every recorded form, here and in every synced browser?')) return;
    await clearAll();
    notice('Forgotten. Rescan to start again.');
  }),
);

for (const id of ['q', 'submittedOnly', 'hideEditor']) $(id).addEventListener('input', render);
$('device').addEventListener('change', (e) => setDeviceName(e.target.value));
chrome.storage.onChanged.addListener(() => refresh());

$('device').value = await deviceName();
await refresh();
