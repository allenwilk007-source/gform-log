// The open/closed check, shared by the daily alarm and the "Check which are still open" button.
// It runs in the background worker either way, so closing the list page does not stop it.
import { formLink, statusFromPage } from './forms.js';
import { isJobKey, jobStatus } from './jobs.js';

export const DAILY_ALARM = 'daily-open-check';
export const DAY_MINUTES = 24 * 60;
const PARALLEL = 3;

/** Forms worth checking: anything you may answer. Forms seen only in the editor are skipped. */
export function idsToCheck(records) {
  return [...records].filter(([, r]) => !r.e || r.s).map(([id]) => id);
}

/** Loads one form as the signed-in user and names its state. Never throws. */
export async function checkOne(id, rec, fetchFn = fetch) {
  try {
    const res = await fetchFn(formLink(id, rec), { credentials: 'include' });
    if (isJobKey(id)) return jobStatus(id, res.url, res.status);
    if (res.status === 404) return 'deleted';
    return statusFromPage(res.url, await res.text());
  } catch {
    return 'unreachable';
  }
}

/**
 * Checks every form, a few at a time. `save` is called after each form with the status so far.
 * Saving that often also keeps the extension's background worker awake through a long run.
 */
export async function checkAll(records, { fetchFn = fetch, save, now = Date.now } = {}) {
  const ids = idsToCheck(records);
  const status = {};
  const queue = [...ids];
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      while (queue.length) {
        const id = queue.shift();
        status[id] = { state: await checkOne(id, records.get(id), fetchFn), at: now() };
        done += 1;
        await save?.({ ...status }, { done, total: ids.length });
      }
    }),
  );
  return { status, total: ids.length };
}
