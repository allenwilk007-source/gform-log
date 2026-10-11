import { formLink, recordsFromHistory, takeoutHistoryItems, toCsv } from './forms.js';
import { ago, buildView } from './view.js';
import { clearAll, deviceName, loadAll, loadCheckRun, loadStatus, setDeviceName, syncProblem, upsert } from './store.js';

const $ = (id) => document.getElementById(id);
/** Builds an element. Text goes in through textContent only, never as HTML. */
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

let records = new Map();
let status = {};
let checkRun = null;
let filter = 'all';

function notice(text) {
  $('notice').hidden = !text;
  $('notice').textContent = text ?? '';
}

function card({ id, rec, submitted, open }) {
  const title = el('a', {
    className: rec.t ? 'title' : 'title untitled',
    href: formLink(id, rec),
    target: '_blank',
    rel: 'noopener',
    textContent: rec.t || 'Untitled form',
  });
  const seen = [rec.l > 1 && `Last opened ${ago(rec.l)}`, (rec.d ?? []).join(', ')].filter(Boolean).join(' · ');
  const submittedMark = el('span', {
    className: `mark ${submitted ? 'submitted' : 'not-submitted'}`,
    textContent: submitted ? 'Submitted' : 'Not submitted',
    title: submitted && rec.s > 1 ? `Submitted ${new Date(rec.s).toLocaleString()}` : '',
  });
  const openMark = el('span', { className: `mark ${open.key}`, textContent: open.label, title: open.hint });
  return el(
    'li',
    { className: 'card' },
    el('div', { className: 'card-main' }, title, el('div', { className: 'meta', textContent: seen })),
    el('div', { className: 'marks' }, submittedMark, openMark),
  );
}

function statusLine() {
  if (!checkRun) return 'Whether each form is open is checked automatically once a day.';
  if (checkRun.running) return `Checking which forms are open: ${checkRun.done ?? 0} of ${checkRun.total || '…'}`;
  if (checkRun.error) return `The last check failed: ${checkRun.error}`;
  return `Checked ${ago(checkRun.finished)}. Checked again automatically once a day.`;
}

const EMPTY = {
  all: 'No Google Forms found yet. Open a form in this browser and it appears here.',
  open: 'No open forms. Forms show here once a check finds them taking responses.',
  submitted: 'No submitted forms yet.',
  closed: 'No closed forms.',
};

function render() {
  const { rows, counts } = buildView(records, status, { filter, query: $('q').value, showEditor: $('showEditor').checked });
  for (const b of document.querySelectorAll('[data-filter]')) b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
  for (const c of document.querySelectorAll('[data-count]')) c.textContent = counts[c.dataset.count];
  $('list').replaceChildren(...rows.map(card));
  $('empty').hidden = rows.length > 0;
  $('empty').textContent = $('q').value.trim() ? 'No forms match your search.' : EMPTY[filter];
  $('checked').textContent = statusLine();
  $('check').disabled = Boolean(checkRun?.running);
  $('check').textContent = checkRun?.running ? 'Checking…' : 'Check now';
}

async function refresh() {
  [records, status, checkRun] = await Promise.all([loadAll(), loadStatus(), loadCheckRun()]);
  const problem = await syncProblem();
  if (problem) notice(`Some forms are kept only in this browser because sync storage is full: ${problem}`);
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

for (const b of document.querySelectorAll('[data-filter]')) {
  b.addEventListener('click', () => {
    filter = b.dataset.filter;
    render();
  });
}
$('q').addEventListener('input', render);
$('showEditor').addEventListener('change', render);

$('check').addEventListener('click', (e) =>
  busy(e.currentTarget, async () => {
    // The background worker does the work, so it carries on if this tab is closed.
    const r = await chrome.runtime.sendMessage({ type: 'check' });
    if (r?.error) throw new Error(r.error);
    notice(`Checked ${r.total} form(s).`);
  }),
);

$('rescan').addEventListener('click', (e) =>
  busy(e.currentTarget, async () => {
    const r = await chrome.runtime.sendMessage({ type: 'scan', since: 0 });
    if (r?.error) throw new Error(r.error);
    notice(`Read ${r.scanned} history entries and found ${r.forms} form(s).`);
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
  const { rows } = buildView(records, status, { filter, query: $('q').value, showEditor: $('showEditor').checked });
  const blob = new Blob([toCsv(rows.map((r) => [r.id, r.rec]))], { type: 'text/csv' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'google-forms.csv' });
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

$('device').addEventListener('change', (e) => setDeviceName(e.target.value));
chrome.storage.onChanged.addListener(() => refresh());

$('device').value = await deviceName();
await refresh();
