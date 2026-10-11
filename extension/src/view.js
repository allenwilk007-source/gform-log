// What the list page shows for each form, kept apart from the page so it can be unit tested.
// Every form gets two marks: did you submit it, and is it open right now.

/** Open-or-closed mark: {key, label, hint}. `key` is open, closed or unknown. */
export function openMark(check, rec) {
  const state = check?.state;
  switch (state) {
    case 'open':
      return { key: 'open', label: 'Open', hint: 'Taking responses' };
    case 'already responded':
      return { key: 'open', label: 'Open', hint: 'Taking responses, but only one per person, and you have answered' };
    case 'closed':
      return { key: 'closed', label: 'Closed', hint: 'No longer taking responses' };
    case 'deleted':
      return { key: 'closed', label: 'Closed', hint: 'The form has been deleted' };
    case 'sign-in needed':
      return { key: 'unknown', label: 'Sign in to check', hint: 'Sign in to the Google account this form needs, then check again' };
    case 'unreachable':
      return { key: 'unknown', label: 'Not checked', hint: 'Google could not be reached during the last check' };
    case 'unknown':
      return { key: 'unknown', label: 'Unclear', hint: "The form's page did not say whether it is open" };
    default:
      // Never checked yet, but seen closed while browsing.
      if (rec?.c) return { key: 'closed', label: 'Closed', hint: 'Seen closed while browsing' };
      return { key: 'unknown', label: 'Not checked yet', hint: 'Checked automatically once a day' };
  }
}

/** True when you sent a response: seen submitting, or the form says you already responded. */
export function wasSubmitted(rec, check) {
  return Boolean(rec?.s) || check?.state === 'already responded';
}

export const FILTERS = ['all', 'open', 'submitted', 'closed'];

function matches(filter, item) {
  if (filter === 'open') return item.open.key === 'open';
  if (filter === 'closed') return item.open.key === 'closed';
  if (filter === 'submitted') return item.submitted;
  return true;
}

// Open forms you have not answered come first: those are the ones still worth acting on.
const rank = (item) => (item.open.key === 'open' ? (item.submitted ? 1 : 0) : item.open.key === 'unknown' ? 2 : 3);

/**
 * The rows to show, and the counts for each filter tab.
 * Forms seen only in the editor are left out unless `showEditor` is set.
 */
export function buildView(records, status, { filter = 'all', query = '', showEditor = false } = {}) {
  const q = query.trim().toLowerCase();
  const items = [];
  for (const [id, rec] of records) {
    if (rec.e && !rec.s && !showEditor) continue;
    if (q && !(rec.t || '').toLowerCase().includes(q)) continue;
    items.push({ id, rec, submitted: wasSubmitted(rec, status[id]), open: openMark(status[id], rec) });
  }
  const counts = Object.fromEntries(FILTERS.map((f) => [f, items.filter((i) => matches(f, i)).length]));
  const rows = items.filter((i) => matches(filter, i)).sort((a, b) => rank(a) - rank(b) || (b.rec.l || 0) - (a.rec.l || 0));
  return { rows, counts };
}

/** "3 min ago", "yesterday", "Oct 4". */
export function ago(ms, now = Date.now()) {
  if (!(ms > 1)) return '';
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
