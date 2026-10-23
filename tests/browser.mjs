// Loads the real extension into Chromium and drives it against fake Google Forms pages.
// Nothing reaches Google: every docs.google.com request is answered by the routes below.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The open/closed check runs in the extension's background worker. Playwright only routes a
// service worker's requests to the fake pages below when this switch is on.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= '1';
const { chromium } = await import('playwright');

const EXT = resolve('extension');
// Fixed by the "key" in manifest.json, so it is the same on every computer (see tests/manifest.test.js).
const EXPECTED_ID = 'mganadollnpacccnbhcmnjcebjkcikek';
const OPEN = '1FAIpQLSc_OpenOpenOpenOpenOpenOpenOpenOpenOpenOpenOpen';
const CLOSED = '1FAIpQLSd_ClosedClosedClosedClosedClosedClosedClosedC';
const OLD = '1FAIpQLSe_OldOldOldOldOldOldOldOldOldOldOldOldOldOldO';
const NASTY = '1FAIpQLSf_NastyNastyNastyNastyNastyNastyNastyNastyNast';
const base = (id) => `https://docs.google.com/forms/d/e/${id}`;
const page = (title, body) => `<!doctype html><title>${title}</title><body>${body}</body>`;

const profile = await mkdtemp(join(tmpdir(), 'gform-log-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let failed = false;
try {
  await context.route('https://docs.google.com/**', (route) => {
    const url = new URL(route.request().url());
    const html = (title, body) => route.fulfill({ contentType: 'text/html', body: page(title, body) });
    // Google answers a closed form's viewform with a redirect to closedform. Playwright cannot route the
    // request after a faked redirect, so the fake page redirects itself and also carries Google's wording.
    if (url.pathname.startsWith(`/forms/d/e/${CLOSED}/viewform`))
      return html('Closed Survey - Google Forms', `No longer accepting responses<script>location.replace('${base(CLOSED)}/closedform')</script>`);
    if (url.pathname.endsWith('/closedform')) return html('Closed Survey - Google Forms', 'This form is no longer accepting responses.');
    if (url.pathname.endsWith('/formResponse')) return html('Volunteer Sign-up - Google Forms', 'Your response has been recorded.');
    if (url.pathname.startsWith(`/forms/d/e/${NASTY}`)) return html('&lt;img src=x onerror=alert(1)&gt; - Google Forms', '');
    return html('Volunteer Sign-up - Google Forms',
      `<form method="post" action="${base(OPEN)}/formResponse"><input name="entry.1" value="hi"><button>Submit</button></form>`);
  });

  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extId = new URL(worker.url()).host;
  assert.equal(extId, EXPECTED_ID, 'the manifest key fixes the extension ID');

  const list = await context.newPage();
  await list.goto(`chrome-extension://${extId}/list.html`);
  await list.waitForFunction(() => /^Nothing yet\./.test(document.getElementById('empty').textContent));

  // The daily open/closed check is scheduled on install.
  const alarm = await list.evaluate(() => chrome.alarms.get('daily-open-check'));
  assert.equal(alarm?.periodInMinutes, 24 * 60, 'daily alarm is set');

  // 1. Something already in history before the extension looked: found by a rescan.
  await list.evaluate((url) => chrome.history.addUrl({ url }), `${base(OLD)}/viewform`);

  // 2. Live: open a form and submit it with a real POST, the way Google Forms does.
  const tab = await context.newPage();
  await tab.goto(`${base(OPEN)}/viewform?usp=sf_link`);
  await Promise.all([tab.waitForURL(/formResponse/), tab.click('button')]);
  await tab.goto(`${base(CLOSED)}/viewform`);
  await tab.waitForURL(/closedform/);
  await tab.goto(`${base(NASTY)}/viewform`);
  await tab.waitForTimeout(500);

  await list.bringToFront();
  await list.click('summary'); // "More options" holds the rescan, import and CSV buttons.
  await list.click('#rescan');
  await list.waitForFunction(() => /found \d+ form/.test(document.getElementById('notice').textContent));

  // Each card reads [title, submitted mark, open mark, "Last opened … · browsers"].
  const rows = () =>
    list.$$eval('#list .card', (cards) =>
      cards.map((c) => [c.querySelector('.title').textContent, ...[...c.querySelectorAll('.mark')].map((m) => m.textContent), c.querySelector('.meta').textContent]),
    );
  let table = await rows();
  console.log('after browsing + rescan:', table);
  const byTitle = (t) => table.find((r) => r[0] === t);
  assert.equal(table.length, 4, 'four forms');
  assert.equal(byTitle('Volunteer Sign-up')?.[1], 'Submitted', 'the submitted form is marked submitted');
  assert.equal(byTitle('Closed Survey')?.[1], 'Not submitted');
  assert.equal(byTitle('Closed Survey')?.[2], 'Closed', 'redirect to closedform is remembered');
  assert.equal(byTitle('Volunteer Sign-up')?.[2], 'Not checked yet');
  assert.ok(byTitle('Untitled form'), 'history-only form is listed');
  assert.ok(byTitle('<img src=x onerror=alert(1)>'), 'hostile title shown as text');
  assert.equal(await list.$$eval('#list img', (x) => x.length), 0, 'no HTML injected');
  assert.match(byTitle('Volunteer Sign-up')[3], /Last opened .* · Chrome on /, 'when and where it was seen');
  assert.equal(table.at(-1)[0], 'Closed Survey', 'closed forms sort last');

  // 3. Open/closed check, run by the background worker when the daily alarm fires. Fire it now
  //    (unpacked extensions may use short alarm delays) instead of waiting a day.
  await list.evaluate(() => chrome.alarms.create('daily-open-check', { delayInMinutes: 0.05, periodInMinutes: 24 * 60 }));
  await list.waitForFunction(() => /^Checked /.test(document.getElementById('checked').textContent), null, { timeout: 30_000 });
  table = await rows();
  console.log('after daily check:', table);
  assert.equal(byTitle('Volunteer Sign-up')[2], 'Open');
  assert.equal(byTitle('Closed Survey')[2], 'Closed');
  assert.equal(byTitle('<img src=x onerror=alert(1)>')[2], 'Unclear');
  assert.deepEqual(
    table.map((r) => r[0]),
    ['Untitled form', 'Volunteer Sign-up', '<img src=x onerror=alert(1)>', 'Closed Survey'],
    'open and unanswered first, then open and answered, then unclear, then closed',
  );
  const tabCount = (f) => list.$eval(`[data-count="${f}"]`, (n) => n.textContent);
  assert.deepEqual([await tabCount('all'), await tabCount('open'), await tabCount('submitted'), await tabCount('closed')], ['4', '2', '1', '1']);
  assert.equal((await list.evaluate(() => chrome.storage.local.get('checkRun'))).checkRun.trigger, 'daily');

  // The button runs the same check on demand.
  await list.click('#check');
  await list.waitForFunction(() => /^Checked \d+ items?\./.test(document.getElementById('notice').textContent));
  assert.equal((await list.evaluate(() => chrome.storage.local.get('checkRun'))).checkRun.trigger, 'button');

  // 4. Takeout import adds a phone's history.
  const takeout = { 'Browser History': [{ url: `${base('1FAIpQLSg_PhonePhonePhonePhonePhonePhonePhonePhonePhon')}/formResponse`, title: 'Phone Form - Google Forms', time_usec: Date.now() * 1000, client_id: 'PHONE01' }] };
  await list.setInputFiles('#takeout', { name: 'BrowserHistory.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(takeout)) });
  await list.waitForFunction(() => /Takeout file/.test(document.getElementById('notice').textContent));
  table = await rows();
  assert.match(byTitle('Phone Form')?.[3], /Takeout PHONE0$/);
  assert.equal(byTitle('Phone Form')?.[1], 'Submitted');

  // 5. Filters and CSV.
  await list.click('[data-filter="submitted"]');
  table = await rows();
  assert.deepEqual(table.map((r) => r[0]).sort(), ['Phone Form', 'Volunteer Sign-up']);
  const [download] = await Promise.all([list.waitForEvent('download'), list.click('#csv')]);
  const csv = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  assert.equal(csv.trim().split('\r\n').length, 3, 'header plus the two submitted forms');

  // 6. A bad file is reported, not thrown.
  await list.setInputFiles('#takeout', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
  await list.waitForFunction(() => /Could not read that file/.test(document.getElementById('notice').textContent));

  await list.setViewportSize({ width: 390, height: 800 });
  await list.click('[data-filter="all"]');
  await list.click('summary'); // fold "More options" away again for the screenshots
  await list.screenshot({ path: 'tests/screenshot-mobile.png', fullPage: true });
  await list.setViewportSize({ width: 1100, height: 600 });
  await list.screenshot({ path: 'tests/screenshot-desktop.png', fullPage: true });
  await list.emulateMedia({ colorScheme: 'dark' });
  await list.screenshot({ path: 'tests/screenshot-desktop-dark.png', fullPage: true });
  console.log('browser test passed');
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
