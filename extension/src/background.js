import { checkAll, DAILY_ALARM, DAY_MINUTES } from './check.js';
import { parseFormUrl, recordsFromHistory } from './forms.js';
import { deviceName, loadAll, loadStatus, saveCheckRun, saveStatus, upsert } from './store.js';
import { SYNC_ALARM, SYNC_EVERY_MINUTES, SYNC_SOON_ALARM, signOut, syncNow, syncSoon } from './sync.js';

const DAY = 24 * 60 * 60 * 1000;

/** Reads this browser's own history since `since` and stores every Google Form in it. */
export async function scanHistory(since = 0) {
  // An empty text query returns every page; filtering here is more reliable than Chrome's word search.
  const items = await chrome.history.search({ text: '', startTime: since, maxResults: 1_000_000 });
  const records = recordsFromHistory(items, await deviceName());
  const { written, local } = await upsert(records);
  return { scanned: items.length, forms: records.size, written, local };
}

let checking = null;
/** Checks whether each form still takes responses. A second call while one runs joins the first. */
export function runCheck(trigger) {
  checking ??= (async () => {
    const started = Date.now();
    await saveCheckRun({ running: true, trigger, started, done: 0, total: 0 });
    try {
      const records = await loadAll();
      const before = await loadStatus();
      const { total } = await checkAll(records, {
        save: async (partial, progress) => {
          await saveStatus({ ...before, ...partial });
          await saveCheckRun({ running: true, trigger, started, ...progress });
        },
      });
      await saveCheckRun({ running: false, trigger, started, finished: Date.now(), done: total, total });
      return { total };
    } catch (e) {
      await saveCheckRun({ running: false, trigger, started, finished: Date.now(), error: String(e?.message ?? e) });
      throw e;
    }
  })().finally(() => {
    checking = null;
  });
  return checking;
}

async function ensureAlarms() {
  if (!(await chrome.alarms.get(DAILY_ALARM))) {
    // First run a few minutes after install or start, then once a day.
    chrome.alarms.create(DAILY_ALARM, { delayInMinutes: 5, periodInMinutes: DAY_MINUTES });
  }
  if (!(await chrome.alarms.get(SYNC_ALARM))) {
    chrome.alarms.create(SYNC_ALARM, { delayInMinutes: 1, periodInMinutes: SYNC_EVERY_MINUTES });
  }
}

async function rememberVisit(url, title, at) {
  if (!parseFormUrl(url)) return;
  await upsert(recordsFromHistory([{ url, title, lastVisitTime: at }], await deviceName()));
}

// The first install reads all history Chrome still has. Each browser start catches up on the last week.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') scanHistory(0);
  ensureAlarms();
});
chrome.runtime.onStartup.addListener(async () => {
  ensureAlarms();
  await scanHistory(Date.now() - 7 * DAY);
  syncNow();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DAILY_ALARM) runCheck('daily');
  if (alarm.name === SYNC_ALARM || alarm.name === SYNC_SOON_ALARM) syncNow();
});

// Any change to the list here (a new form, a check result, "Forget everything") is shared a minute later.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session') return;
  if (Object.keys(changes).some((k) => k.startsWith('f:') || k === 'status' || k === 'clearedAt')) syncSoon();
});

// Two listeners for the same thing on purpose: history may skip the page shown after a form is
// submitted, while webNavigation sees every committed navigation whether or not history keeps it.
chrome.history.onVisited.addListener((item) => rememberVisit(item.url, item.title, item.lastVisitTime || Date.now()));
chrome.webNavigation.onCommitted.addListener(
  ({ url, frameId }) => {
    if (frameId === 0) rememberVisit(url, '', Date.now());
  },
  { url: [{ hostEquals: 'docs.google.com', pathContains: '/forms/' }] },
);
// Titles are not known when a page starts loading, so pick one up once it has finished.
chrome.webNavigation.onCompleted.addListener(
  async ({ url, tabId, frameId }) => {
    if (frameId !== 0) return;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.title) rememberVisit(url, tab.title, Date.now());
  },
  { url: [{ hostEquals: 'docs.google.com', pathContains: '/forms/' }] },
);

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('list.html') }));

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const answer = (p) => p.then(reply, (e) => reply({ error: String(e?.message ?? e) }));
  if (msg?.type === 'scan') return answer(scanHistory(msg.since ?? 0)), true;
  if (msg?.type === 'check') return answer(runCheck('button')), true;
  if (msg?.type === 'sync') return answer(syncNow({ interactive: Boolean(msg.interactive) })), true;
  if (msg?.type === 'signOut') return answer(signOut()), true;
  return false;
});
