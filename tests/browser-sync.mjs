// Two separate browser profiles stand in for Chrome and Edge. Each signs in, records its own forms,
// and syncs through one fake Google Drive held in this process. Nothing reaches Google.
//
// Google's sign-in window itself is not driven here: Chrome opens it from inside the extension,
// too early for Playwright to intercept, so it would reach the real Google. The test hands each
// browser a token the way a finished sign-in leaves it. The sign-in address and the reading of
// Google's reply are covered by tests/cloud.test.js.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= '1';
const { chromium } = await import('playwright');

const EXT = resolve('extension');
const EXT_ID = 'mganadollnpacccnbhcmnjcebjkcikek';
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const FROM_CHROME = '1FAIpQLSc_ChromeChromeChromeChromeChromeChromeChromeC';
const FROM_EDGE = '1FAIpQLSd_EdgeEdgeEdgeEdgeEdgeEdgeEdgeEdgeEdgeEdgeEdgeE';
const form = (id) => `https://docs.google.com/forms/d/e/${id}`;

// ---- a fake Google: sign-in page and the Drive app-data folder ---------------------------------
const drive = { files: new Map(), next: 1, liveTokens: new Set(), issued: 0, requests: [] };

async function fakeGoogle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  if (url.host === 'oauth2.googleapis.com') return route.fulfill({ status: 200, body: '' });

  // www.googleapis.com
  const token = (req.headers().authorization ?? '').replace(/^Bearer /, '');
  if (!drive.liveTokens.has(token)) return json({ error: 'expired' }, 401);
  drive.requests.push(`${req.method()} ${url.pathname}`);
  if (url.pathname === '/drive/v3/about') return json({ user: { emailAddress: 'tester@example.com' } });
  if (url.pathname === '/drive/v3/files' && req.method() === 'GET') {
    assert.equal(url.searchParams.get('spaces'), 'appDataFolder');
    const files = [...drive.files].map(([id, f]) => ({ id, modifiedTime: new Date(f.modified).toISOString() }));
    return json({ files: files.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime)) });
  }
  if (url.pathname === '/upload/drive/v3/files' && req.method() === 'POST') {
    const body = req.postData();
    const [meta, content] = body.split(/\r\n--[^\r\n]+/).slice(0, 2).map((part) => part.slice(part.indexOf('\r\n\r\n') + 4));
    assert.deepEqual(JSON.parse(meta).parents, ['appDataFolder']);
    const id = `file-${drive.next++}`;
    drive.files.set(id, { content, modified: Date.now() });
    return json({ id });
  }
  const one = url.pathname.match(/^\/(?:upload\/)?drive\/v3\/files\/([^/]+)$/);
  if (one) {
    const id = decodeURIComponent(one[1]);
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: drive.files.get(id).content });
    if (req.method() === 'PATCH') {
      drive.files.set(id, { content: req.postData(), modified: Date.now() });
      return json({ id });
    }
    if (req.method() === 'DELETE') {
      drive.files.delete(id);
      return route.fulfill({ status: 204 });
    }
  }
  return json({ error: `unexpected ${req.method()} ${url.pathname}` }, 400);
}

async function fakeForms(route) {
  const url = new URL(route.request().url());
  const title = url.pathname.includes(FROM_EDGE) ? 'Edge Survey' : 'Chrome Survey';
  if (url.pathname.endsWith('/formResponse')) return route.fulfill({ contentType: 'text/html', body: `<title>${title} - Google Forms</title>Recorded.` });
  return route.fulfill({
    contentType: 'text/html',
    body: `<title>${title} - Google Forms</title><form method="post" action="${url.origin}${url.pathname.replace(/\/[^/]*$/, '')}/formResponse"><button>Submit</button></form>`,
  });
}

// ---- one "browser" -----------------------------------------------------------------------------
async function openBrowser(name) {
  const profile = await mkdtemp(join(tmpdir(), 'gform-sync-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await context.route(/^https:\/\/(www\.googleapis\.com|oauth2\.googleapis\.com)\//, fakeGoogle);
  await context.route('https://docs.google.com/**', fakeForms);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  assert.equal(new URL(worker.url()).host, EXT_ID);
  const list = await context.newPage();
  list.on('dialog', (d) => d.accept());
  await list.goto(`chrome-extension://${EXT_ID}/list.html`);
  await list.click('summary'); // "More options" holds the browser's name and the sharing panel
  await list.fill('#device', name);
  await list.dispatchEvent('#device', 'change');
  return { name, context, profile, list };
}

/** Empties the notice line, so the next wait sees only what the next action says. */
const clearNotice = (b) => b.list.$eval('#notice', (n) => (n.textContent = ''));
const notice = (b, re) => b.list.waitForFunction((src) => new RegExp(src).test(document.getElementById('notice').textContent), re.source);
const cloudLine = (b) => b.list.$eval('#cloud-text', (n) => n.textContent);
const cards = (b) =>
  b.list.$$eval('#list .card', (cs) => cs.map((c) => ({ title: c.querySelector('.title').textContent, marks: [...c.querySelectorAll('.mark')].map((m) => m.textContent), meta: c.querySelector('.meta').textContent })));

const devicesShown = (b) =>
  b.list.$$eval('#devices .device', (ds) => ds.map((d) => ({ name: d.querySelector('.device-name').textContent, n: d.querySelector('.n').textContent, line: d.querySelector('.device-line').textContent })));

async function submitForm(b, id) {
  const tab = await b.context.newPage();
  await tab.goto(`${form(id)}/viewform`);
  await Promise.all([tab.waitForURL(/formResponse/), tab.click('button')]);
  await tab.waitForTimeout(400);
  await tab.close();
}

/** What a finished Google sign-in leaves behind: a one-hour token in memory-only session storage. */
async function giveToken(b) {
  const token = `tok-${++drive.issued}`;
  drive.liveTokens.add(token);
  await b.list.evaluate((t) => chrome.storage.session.set({ auth: { token: t, expires: Date.now() + 3600_000 } }), token);
}

async function signIn(b) {
  await b.list.bringToFront();
  assert.match(await cloudLine(b), /Not shared/);
  await b.list.click('#cloud-open'); // "Set up" opens More options at the sharing panel
  assert.equal(await b.list.$eval('#redirect', (n) => n.textContent), `https://${EXT_ID}.chromiumapp.org/`);
  await b.list.fill('#client-id', CLIENT_ID);
  await clearNotice(b);
  await b.list.click('#save-client');
  await notice(b, /Now sign in/);
  await giveToken(b);
  await clearNotice(b);
  await b.list.click('#signin');
  await notice(b, /^Synced\./);
}

async function syncNow(b) {
  await b.list.bringToFront();
  await clearNotice(b);
  await b.list.click('#sync');
  await notice(b, /^Synced\./);
}

const sharedDoc = () => {
  assert.equal(drive.files.size, 1, 'exactly one shared file');
  return JSON.parse([...drive.files.values()][0].content);
};

let failed = false;
const browsers = [];
try {
  const chromeB = await openBrowser('Chrome laptop');
  const edgeB = await openBrowser('Edge laptop');
  browsers.push(chromeB, edgeB);

  // Each browser answers its own form, before either is signed in.
  await submitForm(chromeB, FROM_CHROME);
  await submitForm(edgeB, FROM_EDGE);

  // Chrome signs in first and uploads its list; Edge signs in and gets Chrome's form at once.
  await signIn(chromeB);
  assert.deepEqual(Object.keys(sharedDoc().records), [FROM_CHROME]);
  await signIn(edgeB);
  assert.deepEqual(Object.keys(sharedDoc().records).sort(), [FROM_CHROME, FROM_EDGE].sort());
  assert.match(await cloudLine(edgeB), /Shared through Google Drive\. Synced just now\./);

  // Chrome syncs again and now has Edge's form too: one list in both.
  await syncNow(chromeB);
  for (const b of [chromeB, edgeB]) {
    const c = await cards(b);
    console.log(b.name, c);
    assert.deepEqual(c.map((x) => x.title).sort(), ['Chrome Survey', 'Edge Survey'], `${b.name} shows both forms`);
    assert.ok(c.every((x) => x.marks[0] === 'Submitted'), `${b.name}: both marked submitted`);
    assert.match(c.find((x) => x.title === 'Edge Survey').meta, /Edge laptop/);
    assert.match(c.find((x) => x.title === 'Chrome Survey').meta, /Chrome laptop/);
  }
  assert.ok(!drive.requests.some((r) => r.startsWith('GET /drive/v3/files/') && !r.includes('file-')), 'only the app folder is read');

  // Each browser lists the other under Devices, and clicking a device shows only what it saw.
  assert.deepEqual(Object.values(sharedDoc().devices).map((d) => d.name).sort(), ['Chrome laptop', 'Edge laptop']);
  for (const [b, other, otherForm] of [[chromeB, 'Edge laptop', 'Edge Survey'], [edgeB, 'Chrome laptop', 'Chrome Survey']]) {
    await b.list.bringToFront();
    const shown = await devicesShown(b);
    console.log(b.name, 'devices:', shown);
    assert.equal(shown[0].name, 'All devices');
    assert.equal(shown[1].name, b.name, 'this browser comes first');
    assert.match(shown[1].line, /^This browser · synced/);
    const o = shown.find((d) => d.name === other);
    assert.ok(o, `${b.name} lists ${other}`);
    assert.match(o.line, /Reported just now · Form History installed/);
    assert.equal(o.n, '1');
    await b.list.click(`.device:has-text("${other}")`);
    assert.deepEqual((await cards(b)).map((x) => x.title), [otherForm], `${b.name}: filtered to ${other}`);
    await b.list.click('.device:has-text("All devices")');
  }
  await chromeB.list.setViewportSize({ width: 900, height: 700 });
  await chromeB.list.screenshot({ path: 'tests/screenshot-devices.png' });

  // An expired sign-in is reported, and pressing Sync now signs in again.
  drive.liveTokens.clear();
  await edgeB.list.bringToFront();
  await edgeB.list.click('#sync');
  await edgeB.list.waitForFunction(() => /Sharing stopped: Google sign-in has expired/.test(document.getElementById('cloud-text').textContent));
  assert.deepEqual(await edgeB.list.evaluate(() => chrome.storage.session.get('auth')), {}, 'the dead token is dropped');
  await giveToken(edgeB);
  await syncNow(edgeB);
  assert.match(await cloudLine(edgeB), /Synced just now/);

  // "Forget everything" in Chrome empties Edge's list too, at Edge's next sync. Chrome's token died
  // with the others above, so it signs in again first.
  await giveToken(chromeB);
  await chromeB.list.bringToFront();
  await clearNotice(chromeB);
  await chromeB.list.click('#clear');
  await notice(chromeB, /Forgotten/);
  await syncNow(chromeB);
  assert.deepEqual(sharedDoc().records, {});
  assert.ok(sharedDoc().clearedAt > 0);
  await syncNow(edgeB);
  assert.deepEqual(await cards(edgeB), [], 'Edge forgot them too');

  // Signing out stops sharing but keeps this browser working on its own.
  await clearNotice(edgeB);
  await edgeB.list.click('#signout');
  await notice(edgeB, /Signed out/);
  assert.match(await cloudLine(edgeB), /Not shared/);

  await chromeB.list.bringToFront();
  await chromeB.list.setViewportSize({ width: 900, height: 900 });
  await chromeB.list.$eval('#cloud-h', (n) => n.scrollIntoView());
  await chromeB.list.screenshot({ path: 'tests/screenshot-sharing.png' });
  console.log('sync test passed');
} catch (e) {
  failed = true;
  console.error(e);
  console.error('debug: issued tokens', drive.issued, 'drive requests', drive.requests);
  for (const b of browsers) {
    console.error(b.name, 'notice:', await b.list.$eval('#notice', (n) => n.textContent).catch(() => '?'));
    console.error(b.name, 'cloud:', JSON.stringify(await b.list.evaluate(() => chrome.storage.local.get('cloud')).catch(() => '?')));
    console.error(b.name, 'pages:', b.context.pages().map((p) => p.url()));
  }
} finally {
  for (const b of browsers) {
    await b.context.close();
    await rm(b.profile, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
