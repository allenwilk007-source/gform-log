import { explainSharingError } from './cloud.js';
import { deviceList, QUIET_AFTER_MS } from './devices.js';
import { formLink, recordsFromHistory, takeoutHistoryItems, toCsv } from './forms.js';
import { isJobKey, jobLabel } from './jobs.js';
import { ago, buildView, NOT_YET, sourceOf, SOURCES } from './view.js';
import { clearAll, deviceId, deviceName, loadAll, loadCheckRun, loadDevices, loadStatus, setDeviceName, syncProblem, upsert } from './store.js';
import { hasFreshToken, loadCloud, setClientId, signIn } from './sync.js';

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
let devices = [];
let selfId = '';
let filter = 'all';
let source = 'all';
let device = 'all';

function notice(text) {
  $('notice').hidden = !text;
  $('notice').textContent = text ?? '';
}

function card({ id, rec, submitted, open }) {
  const job = isJobKey(id) ? jobLabel(id) : null;
  const title = el('a', {
    className: rec.t ? 'title' : 'title untitled',
    href: formLink(id, rec),
    target: '_blank',
    rel: 'noopener',
    textContent: rec.t || (job ? `Application at ${job.company}` : 'Untitled form'),
  });
  const seen = [rec.l > 1 && `${job ? 'Applied' : 'Last opened'} ${ago(rec.l)}`, (rec.d ?? []).join(', ')].filter(Boolean).join(' · ');
  const meta = el('div', { className: 'meta' }, el('span', { className: 'site', textContent: job ? job.site : 'Google Forms' }), seen ? ` · ${seen}` : '');
  const submittedMark = el('span', {
    className: `mark ${submitted ? 'submitted' : 'not-submitted'}`,
    textContent: submitted ? 'Submitted' : 'Not submitted',
    title: submitted && rec.s > 1 ? `Submitted ${new Date(rec.s).toLocaleString()}` : '',
  });
  const openMark = el('span', { className: `mark ${open.key}`, textContent: open.label, title: open.hint });
  const item = el(
    'li',
    { className: 'card' },
    el('div', { className: 'card-main' }, title, meta),
    el('div', { className: 'marks' }, submittedMark, openMark),
  );
  item.dataset.src = sourceOf(id);
  return item;
}

/** The "Tracks" row: one button per source, with its count, that filters the list. */
function renderSources(sourceCounts) {
  const button = (id, name, n) => {
    const b = el('button', { className: 'source', type: 'button' });
    if (id !== 'all') {
      b.dataset.src = id;
      b.append(el('span', { className: 'dot' }));
    }
    b.append(name, el('span', { className: 'n', textContent: String(n) }));
    b.setAttribute('aria-pressed', String(source === id));
    b.addEventListener('click', () => {
      source = id;
      render();
    });
    return b;
  };
  $('sources').replaceChildren(button('all', 'Everything', sourceCounts.all), ...SOURCES.map((s) => button(s.id, s.name, sourceCounts[s.id])));
  $('not-yet').textContent = `Not tracked yet: ${NOT_YET.join(', ')}.`;
}

/** How each device is known, in words: "This browser · synced 3 min ago". */
function deviceLine(d, now = Date.now()) {
  if (d.self) return cloud?.email ? `This browser · synced ${ago(cloud.lastSync) || 'not yet'}` : 'This browser';
  if (d.via === 'extension') {
    const quiet = now - d.seen > QUIET_AFTER_MS;
    return `${quiet ? 'Quiet since' : 'Reported'} ${ago(d.seen)} · Form History installed`;
  }
  if (d.via === 'chrome-sync') return `Open tabs via Chrome sync · ${ago(d.seen) || 'no tabs'}`;
  if (d.via === 'history-sync') return `History via Chrome sync · last ${ago(d.seen)}`;
  if (d.via === 'takeout') return 'From a Google Takeout file';
  return `Named on items, last ${ago(d.seen) || 'unknown'} · not reporting in`;
}

/** The "Devices" row: one button per browser or device the list knows, with its count, that filters the list. */
function renderDevices(deviceCounts) {
  const now = Date.now();
  const button = (d) => {
    const b = el('button', { className: 'device', type: 'button' });
    const all = d.id === 'all';
    b.dataset.via = all ? 'all' : d.via;
    if (!all && d.via === 'extension' && !d.self && now - d.seen > QUIET_AFTER_MS) b.classList.add('quiet');
    b.append(
      el('span', { className: 'device-top' }, el('span', { className: 'device-name', textContent: all ? 'All devices' : d.name }), el('span', { className: 'n', textContent: String(deviceCounts[d.id] ?? 0) })),
      el('span', { className: 'device-line', textContent: all ? `${devices.length} known` : deviceLine(d, now) }),
    );
    if (!all && d.names.length > 1) b.title = `Also called: ${d.names.slice(1).join(', ')}`;
    b.setAttribute('aria-pressed', String(device === d.id));
    b.addEventListener('click', () => {
      device = d.id;
      render();
    });
    return b;
  };
  $('devices').replaceChildren(button({ id: 'all' }), ...devices.map(button));
  const others = devices.filter((d) => d.via === 'extension' && !d.self).length;
  $('devices-hint').textContent = cloud?.email
    ? `Missing a computer? Install Form History there and sign in with Google under More options › Share. ${others ? '' : 'None has reported in yet. '}` +
      'Phones and other Chromes on your Google account add their history and open tabs here when Chrome sync of history is on. Safari, Firefox and in-app browsers cannot be seen.'
    : 'Only this browser and the devices Chrome sync lists are shown. To add Edge or another computer, sign in with Google under More options › Share, in each browser.';
}

function emptyMessage() {
  if ($('q').value.trim()) return 'Nothing matches your search.';
  if (device !== 'all') return 'Nothing seen on this device with these filters.';
  const s = SOURCES.find((x) => x.id === source);
  if (s && filter === 'all') {
    return s.id === 'forms'
      ? 'No Google Forms yet. Open any form (docs.google.com/forms) and it appears here.'
      : `No ${s.name} applications yet. Apply for a job on ${s.where} and it appears here once sent. Postings you only read are not listed.`;
  }
  return EMPTY[filter];
}

function statusLine() {
  if (!checkRun) return 'Whether each form is open is checked automatically once a day.';
  if (checkRun.running) return `Checking which forms are open: ${checkRun.done ?? 0} of ${checkRun.total || '…'}`;
  if (checkRun.error) return `The last check failed: ${checkRun.error}`;
  return `Checked ${ago(checkRun.finished)}. Checked again automatically once a day.`;
}

const EMPTY = {
  all: 'Nothing yet. Open a Google Form, or apply for a job on Greenhouse, Lever or Ashby, and it appears here.',
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
  // With a client ID built in, people never need to see or change it.
  $('change-client').hidden = Boolean(cloud.builtInClient);
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

function viewOptions() {
  return { filter, source, device, devices, query: $('q').value, showEditor: $('showEditor').checked };
}

function render() {
  if (device !== 'all' && !devices.some((d) => d.id === device)) device = 'all';
  const { rows, counts, sourceCounts, deviceCounts } = buildView(records, status, viewOptions());
  renderSources(sourceCounts);
  renderDevices(deviceCounts);
  for (const b of document.querySelectorAll('[data-filter]')) b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
  for (const c of document.querySelectorAll('[data-count]')) c.textContent = counts[c.dataset.count];
  $('list').replaceChildren(...rows.map(card));
  $('empty').hidden = rows.length > 0;
  $('empty').textContent = emptyMessage();
  $('checked').textContent = statusLine();
  $('check').disabled = Boolean(checkRun?.running);
  $('check').textContent = checkRun?.running ? 'Checking…' : 'Check now';
  renderCloud();
}

async function refresh() {
  let known;
  [records, status, checkRun, cloud, known, selfId] = await Promise.all([loadAll(), loadStatus(), loadCheckRun(), loadCloud(), loadDevices(), deviceId()]);
  devices = deviceList(known, records, selfId);
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
    notice(`Checked ${r.total} ${r.total === 1 ? 'item' : 'items'}.`);
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
  const { rows } = buildView(records, status, viewOptions());
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
$('save-client').addEventListener('click', async () => {
  try {
    await setClientId($('client-id').value);
    editingClient = false;
    cloudMsg('Saved. Now sign in with Google.', 'info');
    notice('Saved. Now sign in with Google.');
  } catch (err) {
    cloudMsg(String(err?.message ?? err));
  }
  await refresh();
});
$('change-client').addEventListener('click', () => {
  editingClient = true;
  renderCloud();
});
/** A message inside the sharing panel, where the person who just clicked is looking. */
function cloudMsg(text, kind = 'error') {
  $('cloud-msg').hidden = !text;
  $('cloud-msg').className = `cloud-msg ${kind === 'info' ? 'info' : ''}`;
  $('cloud-msg').textContent = text ?? '';
}

/** Signs in here first if this browser has no live token, then has the background worker sync. */
async function signInAndSync(e) {
  const button = e.currentTarget;
  button.disabled = true;
  try {
    if (!(await hasFreshToken())) {
      cloudMsg('Google sign-in is open in a new window. If you cannot see it, look on the taskbar: it may be behind this one. Finish it there.', 'info');
      await signIn();
    }
    cloudMsg('Syncing…', 'info');
    const r = await chrome.runtime.sendMessage({ type: 'sync' });
    if (r?.error) throw new Error(r.error);
    if (r?.state === 'signed-out') throw new Error('Sign-in did not finish. Check the client ID, then try again.');
    cloudMsg('');
    notice(`Synced. The shared list has ${r.forms} form(s).`);
  } catch (err) {
    cloudMsg(explainSharingError(err?.message ?? err, chrome.identity.getRedirectURL()));
  } finally {
    button.disabled = false;
    await refresh();
  }
}
$('signin').addEventListener('click', signInAndSync);
$('sync').addEventListener('click', signInAndSync);
$('signout').addEventListener('click', (e) =>
  busy(e.currentTarget, async () => {
    await chrome.runtime.sendMessage({ type: 'signOut' });
    notice('Signed out. This browser keeps its own list but no longer shares it.');
  }),
);
chrome.storage.onChanged.addListener(() => refresh());

$('device').value = await deviceName();
await refresh();
// Ask Chrome for this account's other devices now, rather than waiting for the half-hourly look.
chrome.runtime.sendMessage({ type: 'devices' }).catch(() => {});
