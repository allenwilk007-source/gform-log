import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authUrl, docText, DRIVE_SCOPE, emptyDoc, isClientId, mergeDocs, parseDoc, tokenFromRedirect } from '../extension/src/cloud.js';
import { AuthError, createDrive } from '../extension/src/drive.js';

const rec = (extra = {}) => ({ t: 'T', l: 100, s: 0, c: 0, p: true, e: false, d: ['Chrome'], ...extra });
const doc = (records, extra = {}) => ({ ...emptyDoc(), records, ...extra });

test('Chrome and Edge lists merge into one, in either order, any number of times', () => {
  const chrome = doc({ a: rec({ d: ['Chrome'] }), b: rec({ t: 'Only Chrome' }) });
  const edge = doc({ a: rec({ d: ['Edge'], s: 150, l: 150 }), c: rec({ t: 'Only Edge', d: ['Edge'] }) });
  const ab = mergeDocs(chrome, edge);
  assert.equal(docText(ab), docText(mergeDocs(edge, chrome)), 'order does not matter');
  assert.equal(docText(mergeDocs(ab, edge)), docText(ab), 'merging again changes nothing');
  assert.deepEqual(Object.keys(ab.records).sort(), ['a', 'b', 'c']);
  assert.deepEqual(ab.records.a.d, ['Chrome', 'Edge']);
  assert.equal(ab.records.a.s, 150, 'submitted in Edge counts everywhere');
});

test('"Forget everything" in one browser wins over older copies elsewhere', () => {
  const offlineEdge = doc({ old: rec({ l: 100 }), newer: rec({ l: 300 }) });
  const clearedChrome = doc({}, { clearedAt: 200 });
  const merged = mergeDocs(offlineEdge, clearedChrome);
  assert.deepEqual(Object.keys(merged.records), ['newer'], 'only forms seen after the clear survive');
  assert.equal(merged.clearedAt, 200);
});

test('the newest open/closed check wins, and only for forms still listed', () => {
  const a = doc({ x: rec() }, { status: { x: { state: 'open', at: 1 }, gone: { state: 'open', at: 9 } } });
  const b = doc({ x: rec() }, { status: { x: { state: 'closed', at: 5 } } });
  assert.deepEqual(mergeDocs(a, b).status, { x: { state: 'closed', at: 5 } });
});

test('docText ignores key order', () => {
  assert.equal(docText(doc({ a: rec(), b: rec() })), docText(doc({ b: rec(), a: rec() })));
});

test('reads the shared file, and rejects anything else', () => {
  assert.deepEqual(parseDoc(JSON.stringify(doc({ a: rec() }))).records.a, rec());
  assert.throws(() => parseDoc('nope'), /not valid JSON/);
  assert.throws(() => parseDoc('{"v":2,"records":{}}'), /unknown version/);
});

test('client IDs', () => {
  assert.ok(isClientId(' 123-abc.apps.googleusercontent.com '));
  assert.ok(!isClientId('GOCSPX-secret'));
  assert.ok(!isClientId(''));
});

test('sign-in asks only for the hidden app folder, and reads the token back', () => {
  const url = new URL(authUrl({ clientId: 'c.apps.googleusercontent.com', redirectUri: 'https://x.chromiumapp.org/', hint: 'me@x.com', silent: true }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('scope'), DRIVE_SCOPE);
  assert.equal(url.searchParams.get('response_type'), 'token');
  assert.equal(url.searchParams.get('prompt'), 'none');
  assert.equal(url.searchParams.get('login_hint'), 'me@x.com');
  assert.equal(new URL(authUrl({ clientId: 'c', redirectUri: 'r' })).searchParams.has('prompt'), false);

  assert.deepEqual(tokenFromRedirect('https://x.chromiumapp.org/#access_token=abc&expires_in=60&token_type=Bearer', 1000), { token: 'abc', expires: 61_000 });
  assert.throws(() => tokenFromRedirect('https://x.chromiumapp.org/#error=access_denied'), /access_denied/);
  assert.throws(() => tokenFromRedirect('https://x.chromiumapp.org/#'), /no access token/);
});

test('Drive client: request shapes, and an expired token is told apart', async () => {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, ...opts });
    if (url.includes('/about')) return Response.json({ user: { emailAddress: 'me@x.com' } });
    if (url.includes('/files?spaces=')) return Response.json({ files: [{ id: 'f1' }] });
    if (url.includes('alt=media')) return new Response('{"v":1}');
    if (url.includes('uploadType=multipart')) return Response.json({ id: 'new' });
    return new Response(null, { status: 200 });
  };
  const drive = createDrive({ token: 'tok', fetchFn });
  assert.equal(await drive.email(), 'me@x.com');
  assert.deepEqual(await drive.find("it's.json"), [{ id: 'f1' }]);
  assert.match(decodeURIComponent(calls.at(-1).url), /spaces=appDataFolder&q=name = 'it\\'s.json' and trashed = false/);
  assert.equal(await drive.read('f1'), '{"v":1}');
  assert.equal(await drive.create('l.json', '{"v":1}'), 'new');
  const created = calls.at(-1);
  assert.equal(created.method, 'POST');
  assert.match(created.body, /"parents":\["appDataFolder"\]/);
  assert.match(created.body, /\{"v":1\}/);
  await drive.update('f1', 'x');
  assert.equal(calls.at(-1).method, 'PATCH');
  await drive.remove('f2');
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.ok(calls.every((c) => c.headers.Authorization === 'Bearer tok'));

  const expired = createDrive({ token: 'old', fetchFn: async () => new Response(null, { status: 401 }) });
  await assert.rejects(expired.find('x'), AuthError);
  const broken = createDrive({ token: 't', fetchFn: async () => new Response(null, { status: 500 }) });
  await assert.rejects(broken.find('x'), /answered 500/);
});

test('sharing errors say what to fix', async () => {
  const { explainSharingError } = await import('../extension/src/cloud.js');
  const uri = 'https://x.chromiumapp.org/';
  assert.match(explainSharingError('Google sign-in did not finish. The user did not approve access.', uri), /closed before sign-in finished/);
  assert.match(explainSharingError('Google sign-in did not finish. Authorization page could not be loaded.', uri), /Authorized redirect URI is not exactly https:\/\/x\.chromiumapp\.org\//);
  assert.match(explainSharingError('Google sign-in failed: access_denied', uri), /Test users/);
  assert.match(explainSharingError('Google Drive answered 403.', uri), /Google Drive API/);
  assert.equal(explainSharingError('Something new', uri), 'Something new');
});

test('an orphaned sign-in window is explained', async () => {
  const { explainSharingError } = await import('../extension/src/cloud.js');
  assert.match(explainSharingError('Google sign-in did not finish. Only one web auth flow is allowed at a time.', 'u'), /still open.*chrome:\/\/restart/);
});
