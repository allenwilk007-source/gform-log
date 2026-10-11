import { formLink, recordsFromHistory, takeoutHistoryItems, toCsv } from './forms.js';
import { ago, buildView } from './view.js';
import { clearAll, deviceName, loadAll, loadCheckRun, loadStatus, setDeviceName, syncProblem, upsert } from './store.js';
import { loadCloud, setClientId } from './sync.js';

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
let cloud = null;
let editingClient = false;
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

function renderCloud() {
  const signedIn = Boolean(cloud.email);
  const stage = signedIn ? 'on' : cloud.clientId && !editingClient ? 'signin' : 'setup';
  $('cloud-setup').hidden = stage !== 'setup';
  $('cloud-signin').hidden = stage !== 'signin';
  $('cloud-on').hidden = stage !== 'on';
  $('redirect').textContent = chrome.identity.getRedirectURL();
  if (stage === 'setup' && !$('client-id').value) $('client-id').value = cloud.clientId;

  const line = $('cloud-line');
  line.className = '';
  $('cloud-open').hidden = signedIn && !cloud.error;
  if (!signedIn) {
    $('cloud-text').textContent = 'Not shared with your other browsers yet.';
    $('cloud-open').textContent = 'Set up';
  } else if (cloud.error) {
    line.className = 'warn';
    $('cloud-text').textContent = `Sharing stopped: ${cloud.error}`;
    $('cloud-open').textContent = 'Fix';
  } else {
    line.className = 'ok';
    $('cloud-text').textContent = cloud.running ? 'Syncing with your other browsers…' : `Shared through Google Drive. Synced ${ago(cloud.lastSync) || 'not yet'}.`;
  }
  $('cloud-status').textContent = `Signed in as ${cloud.email}.` + (cloud.lastSync ? ` Last synced ${ago(cloud.lastSync)}.` : '') + (cloud.error ? ` ${cloud.error}` : '');
  $('sync').disabled = Boolean(cloud.running);
}

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
  renderCloud();
}

async function refresh() {
  [records, status, checkRun, cloud] = await Promise.all([loadAll(), loadStatus(), loadCheckRun(), loadCloud()]);
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

$('cloud-open').addEventListener('click', () => {
  $('more').open = true;
  $('cloud-h').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('save-client').addEventListener('click', (e) =>
  busy(e.currentTarget, async () => {
    await setClientId($('client-id').value);
    editingClient = false;
    notice('Saved. Now sign in with Google.');
  }),
);
$('change-client').addEventListener('click', () => {
  editingClient = true;
  renderCloud();
});
const syncWith = (interactive) => async (e) =>
  busy(e.currentTarget, async () => {
    const r = await chrome.runtime.sendMessage({ type: 'sync', interactive });
    if (r?.error) throw new Error(r.error);
    if (r?.state === 'synced') notice(`Synced. The shared list has ${r.forms} form(s).`);
  });
$('signin').addEventListener('click', syncWith(true));
$('sync').addEventListener('click', syncWith(true));
$('signout').addEventListener('click', (e) =>
  busy(e.currentTarget, async () => {
    await chrome.runtime.sendMessage({ type: 'signOut' });
    notice('Signed out. This browser keeps its own list but no longer shares it.');
  }),
);
chrome.storage.onChanged.addListener(() => refresh());

$('device').value = await deviceName();
await refresh();
