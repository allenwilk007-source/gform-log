// Keeps this browser's list and the shared file in Google Drive in step. Each run downloads the
// file, merges it with what this browser knows, saves the result here, and uploads it if it grew.
// Because merging never loses anything, two browsers syncing at the same moment cannot lose a form
// for good: whichever upload lands second is repaired by the next run of the other browser.
import { authUrl, docText, DOC_NAME, isClientId, mergeDocs, parseDoc, tokenFromRedirect } from './cloud.js';
import { GOOGLE_CLIENT_ID } from './config.js';
import { AuthError, createDrive } from './drive.js';
import { sameEnough } from './forms.js';
import { forgetBefore, loadAll, loadClearedAt, loadStatus, saveStatus, upsert } from './store.js';

export const SYNC_ALARM = 'cloud-sync';
export const SYNC_SOON_ALARM = 'cloud-sync-soon';
export const SYNC_EVERY_MINUTES = 30;

// ---- settings and state ------------------------------------------------------------------------

export async function loadCloud() {
  const [{ cloud }, { googleClientId }] = await Promise.all([chrome.storage.local.get('cloud'), chrome.storage.sync.get('googleClientId')]);
  // A client ID someone pasted wins over the built-in one, so a developer can test their own.
  const clientId = googleClientId || GOOGLE_CLIENT_ID;
  return { clientId, builtInClient: !googleClientId && Boolean(GOOGLE_CLIENT_ID), email: '', lastSync: 0, error: '', running: false, ...cloud };
}

async function saveCloud(patch) {
  const { cloud } = await chrome.storage.local.get('cloud');
  await chrome.storage.local.set({ cloud: { ...cloud, ...patch } });
}

/** Saved to sync storage, so every Chrome on the account gets it. Edge needs it entered once. */
export async function setClientId(value) {
  const id = String(value ?? '').trim();
  if (!isClientId(id)) throw new Error('That does not look like a Google client ID. It ends in .apps.googleusercontent.com');
  await chrome.storage.sync.set({ googleClientId: id });
}

// ---- sign-in -----------------------------------------------------------------------------------

/** True while this browser holds a token with more than a minute left. */
export async function hasFreshToken() {
  const { auth } = await chrome.storage.session.get('auth');
  return Boolean(auth?.token && auth.expires > Date.now() + 60_000);
}

/**
 * Opens Google's sign-in window. Called from the list page, not the background worker: the page
 * stays open while the person signs in, whereas Chrome may stop an idle background worker partway
 * through and leave the window orphaned, blocking every later attempt.
 */
export async function signIn() {
  const { clientId, email } = await loadCloud();
  if (!clientId) throw new Error('Save a Google client ID first.');
  const url = authUrl({ clientId, redirectUri: chrome.identity.getRedirectURL(), hint: email });
  let redirected;
  try {
    redirected = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  } catch (e) {
    throw new Error(`Google sign-in did not finish. ${e?.message ?? ''}`.trim());
  }
  // Session storage lives in memory only, so the token never reaches the disk.
  await chrome.storage.session.set({ auth: tokenFromRedirect(redirected) });
}

/** The current token, renewed quietly if it is about to run out. Null when never signed in here. */
async function getToken() {
  const { auth } = await chrome.storage.session.get('auth');
  if (auth?.token && auth.expires > Date.now() + 60_000) return auth.token;
  const { clientId, email } = await loadCloud();
  if (!clientId || !email) return null;
  const url = authUrl({ clientId, redirectUri: chrome.identity.getRedirectURL(), hint: email, silent: true });
  let fresh;
  try {
    const redirected = await chrome.identity.launchWebAuthFlow({ url, interactive: false, abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 15_000 });
    fresh = tokenFromRedirect(redirected);
  } catch {
    // Renewing needs the person (signed out of Google, or access withdrawn).
    throw new AuthError('Google sign-in needs renewing.');
  }
  await chrome.storage.session.set({ auth: fresh });
  return fresh.token;
}

export async function signOut() {
  const { auth } = await chrome.storage.session.get('auth');
  await chrome.storage.session.remove('auth');
  await saveCloud({ email: '', lastSync: 0, error: '' });
  if (auth?.token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(auth.token)}`, { method: 'POST' }).catch(() => {});
  }
}

// ---- the sync itself ---------------------------------------------------------------------------

async function localDoc() {
  const [records, status, clearedAt] = await Promise.all([loadAll(), loadStatus(), loadClearedAt()]);
  return { v: 1, clearedAt, records: Object.fromEntries(records), status };
}

async function applyLocally(merged, local) {
  if (merged.clearedAt > local.clearedAt) await forgetBefore(merged.clearedAt);
  const changed = new Map(Object.entries(merged.records).filter(([id, r]) => !sameEnough(local.records[id], r)));
  if (changed.size) await upsert(changed);
  if (JSON.stringify(merged.status) !== JSON.stringify(local.status)) await saveStatus(merged.status);
}

let running = null;

/** One sync run. Never opens a window: problems come back as { state: 'error', error }. */
export function syncNow() {
  running ??= (async () => {
    try {
      const token = await getToken();
      if (!token) return { state: 'signed-out' };
      await saveCloud({ running: true });
      const drive = createDrive({ token });
      const email = (await loadCloud()).email || (await drive.email());

      const files = await drive.find(DOC_NAME);
      let remote = { v: 1, clearedAt: 0, records: {}, status: {} };
      for (const f of files) remote = mergeDocs(remote, parseDoc(await drive.read(f.id)));
      const local = await localDoc();
      const merged = mergeDocs(remote, local);

      await applyLocally(merged, local);
      const text = docText(merged);
      if (!files.length) await drive.create(DOC_NAME, text);
      else if (files.length > 1 || docText(remote) !== text) await drive.update(files[0].id, text);
      for (const extra of files.slice(1)) await drive.remove(extra.id);

      await saveCloud({ email, lastSync: Date.now(), error: '', running: false });
      return { state: 'synced', forms: Object.keys(merged.records).length };
    } catch (e) {
      if (e instanceof AuthError) await chrome.storage.session.remove('auth');
      const error = e instanceof AuthError ? 'Google sign-in has expired. Sign in again.' : String(e?.message ?? e);
      await saveCloud({ error, running: false });
      return { state: 'error', error };
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Called when this browser's list changes: sync a minute later, so a burst of visits is one upload. */
export async function syncSoon() {
  const { email } = await loadCloud();
  if (email) chrome.alarms.create(SYNC_SOON_ALARM, { delayInMinutes: 1 });
}
