// Pure logic: no chrome.* calls here, so it runs under `node --test` as well as in the extension.

// docs.google.com/forms/d/e/<published id>/viewform       a respondent link
// docs.google.com/forms/d/e/<published id>/formResponse   the page after pressing Submit
// docs.google.com/forms/d/e/<published id>/alreadyresponded  "you've already responded"
// docs.google.com/forms/d/e/<published id>/closedform     "no longer accepting responses"
// docs.google.com/forms/d/<edit id>/edit                  a form you can edit
// An optional /u/<n>/ before /d/ picks which signed-in account was used.
const FORM_RE = /^https?:\/\/docs\.google\.com\/forms\/(?:u\/\d+\/)?d\/(e\/)?([A-Za-z0-9_-]{20,})(?:\/([A-Za-z]+))?/;

/** Seen again within this window, a visit does not count as news, which keeps sync writes rare. */
export const LAST_SEEN_GRANULARITY_MS = 60 * 60 * 1000;
const MAX_TITLE = 120;
const MAX_DEVICES = 8;

export function parseFormUrl(url) {
  const m = FORM_RE.exec(String(url ?? ''));
  if (!m) return null;
  const published = Boolean(m[1]);
  const id = m[2];
  const page = (m[3] ?? '').toLowerCase();
  return {
    id,
    published,
    page,
    editor: !published && page === 'edit',
    submitted: page === 'formresponse' || page === 'alreadyresponded',
    closed: page === 'closedform',
  };
}

/** The link to open a form as a respondent, or to edit it when that is all that was seen. */
export function formLink(id, rec) {
  if (rec.p) return `https://docs.google.com/forms/d/e/${id}/viewform`;
  return `https://docs.google.com/forms/d/${id}/${rec.e ? 'edit' : 'viewform'}`;
}

const GENERIC_TITLES = new Set(['', 'google forms', 'google forms: sign-in', 'sign in - google accounts', 'untitled form']);

export function cleanTitle(title) {
  const t = String(title ?? '')
    .replace(/\s+-\s+Google Forms$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return GENERIC_TITLES.has(t.toLowerCase()) ? '' : t.slice(0, MAX_TITLE);
}

/**
 * One stored record, kept short because chrome.storage.sync allows only about 100 KB in total.
 *   t  title            l  last seen (ms)        s  submitted at (ms), 0 if never seen
 *   c  seen closed (ms) p  published id          e  editor link seen
 *   d  device names
 */
export function recordFromVisit(parsed, title, at, device) {
  return {
    t: cleanTitle(title),
    l: at || 0,
    s: parsed.submitted ? at || 1 : 0,
    c: parsed.closed ? at || 1 : 0,
    p: parsed.published,
    e: parsed.editor,
    d: device ? [device] : [],
  };
}

/** Combines two records for the same form. Order does not matter, so devices can merge in any order. */
export function mergeRecords(a, b) {
  if (!a) return b;
  if (!b) return a;
  const newer = (b.l || 0) >= (a.l || 0) ? b : a;
  const older = newer === a ? b : a;
  const devices = [...new Set([...(a.d ?? []), ...(b.d ?? [])])].sort().slice(0, MAX_DEVICES);
  return {
    t: newer.t || older.t || '',
    l: Math.max(a.l || 0, b.l || 0),
    s: Math.max(a.s || 0, b.s || 0),
    c: Math.max(a.c || 0, b.c || 0),
    p: Boolean(a.p || b.p),
    e: Boolean(a.e || b.e),
    d: devices,
  };
}

/** True when `next` adds nothing worth a sync write over `prev`. */
export function sameEnough(prev, next) {
  if (!prev) return false;
  return (
    prev.t === next.t &&
    prev.s === next.s &&
    prev.c === next.c &&
    prev.p === next.p &&
    prev.e === next.e &&
    (prev.d ?? []).join('\n') === (next.d ?? []).join('\n') &&
    next.l - prev.l < LAST_SEEN_GRANULARITY_MS
  );
}

/** History items ({url, title, lastVisitTime, device?}) to a Map of form id -> record. */
export function recordsFromHistory(items, device) {
  const out = new Map();
  for (const item of items) {
    const parsed = parseFormUrl(item.url);
    if (!parsed) continue;
    const rec = recordFromVisit(parsed, item.title, Math.round(item.lastVisitTime || 0), item.device ?? device);
    out.set(parsed.id, mergeRecords(out.get(parsed.id), rec));
  }
  return out;
}

/**
 * Google Takeout's Chrome history (BrowserHistory.json, or History.json in older exports) to
 * history items. Takeout names devices only by an opaque client id, so each becomes "Takeout <id>".
 * Throws when the file does not look like Takeout Chrome history.
 */
export function takeoutHistoryItems(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  let list = Array.isArray(data) ? data : data?.['Browser History'];
  if (!Array.isArray(list)) list = Object.values(data ?? {}).find((v) => Array.isArray(v) && v.some((x) => x?.url));
  if (!Array.isArray(list)) throw new Error('This is not a Google Takeout Chrome history file (no "Browser History" list).');
  return list
    .filter((x) => x && typeof x.url === 'string')
    .map((x) => ({
      url: x.url,
      title: x.title ?? '',
      lastVisitTime: Number(x.time_usec) / 1000 || 0,
      device: `Takeout ${String(x.client_id ?? 'unknown').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'unknown'}`,
    }));
}

/** Reads a fetched respondent page and says whether the form takes responses. */
export function statusFromPage(finalUrl, html) {
  const url = String(finalUrl ?? '');
  if (/\/closedform\b/.test(url)) return 'closed';
  if (/accounts\.google\.com/.test(url)) return 'sign-in needed';
  if (/\/alreadyresponded\b/.test(url)) return 'already responded';
  const text = String(html ?? '');
  if (/no longer accepting responses/i.test(text)) return 'closed';
  if (/you've already responded|you have already responded/i.test(text)) return 'already responded';
  if (/\/formResponse/.test(text)) return 'open';
  return 'unknown';
}

const CSV_HEAD = ['title', 'submitted', 'submitted at', 'last seen', 'seen closed', 'devices', 'link'];
const iso = (ms) => (ms ? new Date(ms).toISOString() : '');
const csvCell = (v) => {
  const s = String(v ?? '');
  // A leading = + - @ would run as a formula in Excel; prefix a quote so it stays text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(entries) {
  const lines = [CSV_HEAD.join(',')];
  for (const [id, r] of entries) {
    lines.push(
      [r.t, r.s ? 'yes' : '', iso(r.s > 1 ? r.s : 0), iso(r.l), iso(r.c > 1 ? r.c : 0), (r.d ?? []).join('; '), formLink(id, r)]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
