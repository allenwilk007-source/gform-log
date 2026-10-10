import { parseFormUrl, recordsFromHistory } from './forms.js';
import { deviceName, upsert } from './store.js';

const DAY = 24 * 60 * 60 * 1000;

/** Reads this browser's own history since `since` and stores every Google Form in it. */
export async function scanHistory(since = 0) {
  // An empty text query returns every page; filtering here is more reliable than Chrome's word search.
  const items = await chrome.history.search({ text: '', startTime: since, maxResults: 1_000_000 });
  const records = recordsFromHistory(items, await deviceName());
  const { written, local } = await upsert(records);
  return { scanned: items.length, forms: records.size, written, local };
}

async function rememberVisit(url, title, at) {
  if (!parseFormUrl(url)) return;
  await upsert(recordsFromHistory([{ url, title, lastVisitTime: at }], await deviceName()));
}

// The first install reads all history Chrome still has. Each browser start catches up on the last week.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') scanHistory(0);
});
chrome.runtime.onStartup.addListener(() => scanHistory(Date.now() - 7 * DAY));

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
  if (msg?.type === 'scan') {
    scanHistory(msg.since ?? 0).then(reply, (e) => reply({ error: String(e?.message ?? e) }));
    return true;
  }
  return false;
});
