import { checkAll, DAILY_ALARM, DAY_MINUTES } from './check.js';
import { parseFormUrl, recordFromApplication, recordsFromHistory } from './forms.js';
import { parseJobUrl } from './jobs.js';
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
  const applied = parseJobUrl(url);
  if (!parseFormUrl(url) && !applied?.submitted) return;
  // A job's thank-you page rarely names the job; prefer the title noted when Submit was pressed.
  if (applied) title = (await pendingTitle(applied.key)) || title;
  await upsert(recordsFromHistory([{ url, title, lastVisitTime: at }], await deviceName()));
}

/** The job title noted when Submit was pressed on a job page, kept in memory for ten minutes. */
async function pendingTitle(key) {
  const { pending } = await chrome.storage.session.get('pending');
  const hit = pending?.[key];
  return hit && Date.now() - hit.at < 10 * 60 * 1000 ? hit.title : '';
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

// Pages worth watching: Google Forms, and the job sites whose addresses show a sent application.
// Any frame counts, so a form or a Greenhouse application embedded in another site is seen too.
const WATCHED = {
  url: [
    { hostEquals: 'docs.google.com', pathContains: '/forms/' },
    { hostSuffix: 'greenhouse.io' },
    { hostSuffix: 'lever.co' },
    { hostEquals: 'jobs.ashbyhq.com' },
  ],
};

// Several listeners for the same thing on purpose: history may skip the page shown after a form is
// submitted, webNavigation sees every committed navigation whether or not history keeps it, and
// single-page sites change the address without a navigation at all.
chrome.history.onVisited.addListener((item) => rememberVisit(item.url, item.title, item.lastVisitTime || Date.now()));
chrome.webNavigation.onCommitted.addListener(({ url }) => rememberVisit(url, '', Date.now()), WATCHED);
chrome.webNavigation.onHistoryStateUpdated.addListener(({ url }) => rememberVisit(url, '', Date.now()), WATCHED);
// Titles are not known when a page starts loading, so pick one up once it has finished.
chrome.webNavigation.onCompleted.addListener(async ({ url, tabId, frameId }) => {
  if (frameId !== 0) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.title) rememberVisit(url, tab.title, Date.now());
}, WATCHED);

// Messages from content/apply.js. The address comes from Chrome, not from the message, so a page
// cannot claim to be another job. A form embedded in a company's own page has a bland title of its
// own, so the company page's title is used instead.
const titleFor = (sender, title) => (sender?.frameId ? sender.tab?.title || title : title);

/** Submit was pressed on a job page: note the job's title for the confirmation page to use. */
async function rememberApplying(sender, title) {
  const applied = parseJobUrl(sender?.url);
  if (!applied || !title) return;
  const { pending = {} } = await chrome.storage.session.get('pending');
  pending[applied.key] = { title: titleFor(sender, title), at: Date.now() };
  await chrome.storage.session.set({ pending });
}

/** A thank-you message appeared after Submit. */
async function rememberApplication(sender, title) {
  const applied = parseJobUrl(sender?.url);
  if (!applied) return;
  await upsert(new Map([[applied.key, recordFromApplication(titleFor(sender, title), Date.now(), await deviceName())]]));
}

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('list.html') }));

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const answer = (p) => p.then(reply, (e) => reply({ error: String(e?.message ?? e) }));
  if (msg?.type === 'scan') return answer(scanHistory(msg.since ?? 0)), true;
  if (msg?.type === 'check') return answer(runCheck('button')), true;
  if (msg?.type === 'sync') return answer(syncNow()), true;
  if (msg?.type === 'signOut') return answer(signOut()), true;
  if (msg?.type === 'applying') return answer(rememberApplying(sender, String(msg.title ?? '').slice(0, 300))), true;
  if (msg?.type === 'applied') return answer(rememberApplication(sender, String(msg.title ?? '').slice(0, 300))), true;
  return false;
});
