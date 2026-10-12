// The shared list that Chrome and Edge both read and write: one JSON file in the hidden app-data
// folder of the user's own Google Drive. Pure logic only; src/sync.js does the talking.
import { mergeRecords } from './forms.js';

export const DOC_NAME = 'form-history.json';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/**
 * { v, clearedAt, records: {id: record}, status: {id: {state, at}} }
 * clearedAt: when someone pressed "Forget everything". Anything last seen before it is gone
 * everywhere, so a browser that was offline at the time cannot bring it back.
 */
export function emptyDoc() {
  return { v: 1, clearedAt: 0, records: {}, status: {} };
}

export function parseDoc(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The shared list in Google Drive is not valid JSON.');
  }
  if (data?.v !== 1 || typeof data.records !== 'object' || data.records === null) {
    throw new Error('The shared list in Google Drive is from an unknown version.');
  }
  return { ...emptyDoc(), ...data, status: data.status ?? {} };
}

function mergeStatus(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, s] of Object.entries(b)) if (!out[id] || (s?.at || 0) > (out[id]?.at || 0)) out[id] = s;
  return out;
}

/** Combines two copies of the list. Order does not matter, and merging a copy twice changes nothing. */
export function mergeDocs(a, b) {
  const clearedAt = Math.max(a.clearedAt || 0, b.clearedAt || 0);
  const records = {};
  for (const id of new Set([...Object.keys(a.records), ...Object.keys(b.records)])) {
    const r = mergeRecords(a.records[id], b.records[id]);
    if ((r.l || 0) > clearedAt) records[id] = r;
  }
  const status = Object.fromEntries(Object.entries(mergeStatus(a.status, b.status)).filter(([id]) => id in records));
  return { v: 1, clearedAt, records, status };
}

/** Stable text for a doc, so two equal docs compare equal whatever order their keys arrived in. */
export function docText(doc) {
  const sorted = (obj) => Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
  return JSON.stringify({ v: 1, clearedAt: doc.clearedAt || 0, records: sorted(doc.records), status: sorted(doc.status) });
}

export const isClientId = (s) => /^[\w.-]+\.apps\.googleusercontent\.com$/.test(String(s ?? '').trim());

/** Google's sign-in page for an access token that can only touch this app's own Drive folder. */
export function authUrl({ clientId, redirectUri, hint, silent }) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: redirectUri,
    scope: DRIVE_SCOPE,
    ...(hint ? { login_hint: hint } : {}),
    ...(silent ? { prompt: 'none' } : {}),
  });
  return url.toString();
}

/** Reads the token out of the address Google sends the browser back to. */
export function tokenFromRedirect(redirected, now = Date.now()) {
  const hash = new URL(redirected).hash.replace(/^#/, '');
  const p = new URLSearchParams(hash);
  if (p.get('error')) throw new Error(`Google sign-in failed: ${p.get('error')}`);
  const token = p.get('access_token');
  if (!token) throw new Error('Google sign-in returned no access token.');
  const seconds = Number(p.get('expires_in')) || 3600;
  return { token, expires: now + seconds * 1000 };
}

/** Turns Chrome's and Google's terse sign-in and Drive errors into what to do about them. */
export function explainSharingError(message, redirectUri) {
  const m = String(message ?? '');
  if (/only one web auth flow/i.test(m)) {
    return (
      'A Google sign-in window from an earlier attempt is still open. Find it (it may be behind this window or ' +
      'on the taskbar), read what it says, then close it and try again. If you cannot find it, restart the browser.'
    );
  }
  if (/did not approve|cancel|closed/i.test(m)) {
    return 'The Google window was closed before sign-in finished. Click "Sign in with Google" again.';
  }
  if (/could not be loaded|invalid_client|redirect_uri/i.test(m)) {
    return (
      'Google refused the sign-in. Usually the client ID is wrong, or the client is not a "Web application", ' +
      `or its Authorized redirect URI is not exactly ${redirectUri} (with the slash at the end). Check both under Google Auth Platform › Clients.`
    );
  }
  if (/access_denied/i.test(m)) {
    return 'Google denied access. While the app is in Testing, only test users can sign in: add your address under Google Auth Platform › Audience › Test users.';
  }
  if (/answered 403/.test(m)) {
    return 'Google Drive refused access. Turn on the Google Drive API in the same Google Cloud project (APIs & Services › Library), wait a minute, then try again.';
  }
  return m;
}
