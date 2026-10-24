// Loads the real extension against fake Greenhouse, Lever and Ashby pages, and a fake company
// careers page with an embedded Greenhouse form. Nothing reaches the real sites.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= '1';
const { chromium } = await import('playwright');

const EXT = resolve('extension');
const EXT_ID = 'mganadollnpacccnbhcmnjcebjkcikek';
const LEVER = '0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';
const ASHBY = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const ASHBY_FAIL = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

const html = (title, body) => ({ contentType: 'text/html', body: `<!doctype html><title>${title}</title><body>${body}</body>` });
const form = (action, label = 'Submit application') =>
  `<form method="post" action="${action}"><input name="name" value="Ada"><button type="submit">${label}</button></form>`;

// A client-side form like Ashby's: Submit swaps the page content without changing the address.
const spa = (intro, outcome) => `<main><p>${intro}</p><input id="name" value="Ada">
  <button id="go" type="button">Submit Application</button></main>
  <script>document.getElementById('go').onclick = () => setTimeout(() => {
    document.querySelector('main').innerHTML = ${JSON.stringify(outcome)};
  }, 200);</script>`;

async function fakeSites(route) {
  const url = new URL(route.request().url());
  const path = url.pathname;
  // Greenhouse: the address changes to /confirmation.
  if (url.host === 'job-boards.greenhouse.io') {
    if (path === '/acme/jobs/111') return route.fulfill(html('Job Application for Data Analyst at Acme', form('/acme/jobs/111/confirmation')));
    if (path === '/acme/jobs/111/confirmation') return route.fulfill(html('Job Application for Data Analyst at Acme', '<h1>Thank you for applying.</h1>'));
    if (path === '/acme/jobs/222') return route.fulfill(html('Job Application for Designer at Acme', '<p>Just looking at this one.</p>'));
  }
  // Greenhouse embedded in a company's own site.
  if (url.host === 'boards.greenhouse.io' && path === '/embed/job_app') {
    return route.fulfill(html('Embedded application', spa('Apply for Backend Engineer', '<h2>Thank you for applying!</h2><p>Your application has been submitted.</p>')));
  }
  if (url.host === 'careers.example.com') {
    return route.fulfill(html('Careers at Initech', '<h1>Backend Engineer</h1><iframe src="https://boards.greenhouse.io/embed/job_app?for=initech&token=333" width="600" height="300"></iframe>'));
  }
  // Lever: /apply, then the address changes to /thanks. The posting itself is gone (404) later.
  if (url.host === 'jobs.lever.co') {
    if (path.endsWith('/apply')) return route.fulfill(html('Globex - Support Engineer', form(`/globex/${LEVER}/thanks`)));
    if (path.endsWith('/thanks')) return route.fulfill(html('Globex', '<h3>Application submitted!</h3>'));
    return route.fulfill({ status: 404, body: 'Not found' });
  }
  // Ashby: same address before and after.
  if (url.host === 'jobs.ashbyhq.com') {
    if (path.includes(ASHBY_FAIL)) {
      return route.fulfill(html('Product Manager @ Hooli', spa('Thank you for your interest in applying to Hooli.', '<p>Please fill in all required fields.</p><p>Thank you for your interest in applying to Hooli.</p>')));
    }
    return route.fulfill(html('Researcher @ Umbrella', spa('Researcher role.', '<h2>Thank you for applying!</h2><p>Your application was successfully submitted.</p>')));
  }
  return route.fulfill({ status: 404, body: '' });
}

let failed = false;
const profile = await mkdtemp(join(tmpdir(), 'gform-jobs-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
  await context.route(/^https:\/\/(job-boards\.greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|careers\.example\.com)\//, fakeSites);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  assert.equal(new URL(worker.url()).host, EXT_ID);
  const tab = await context.newPage();

  // Greenhouse: submit, landing on /confirmation.
  await tab.goto('https://job-boards.greenhouse.io/acme/jobs/111');
  await Promise.all([tab.waitForURL(/confirmation/), tab.click('button')]);
  // Greenhouse: only viewed, never applied.
  await tab.goto('https://job-boards.greenhouse.io/acme/jobs/222');
  // Lever: submit, landing on /thanks.
  await tab.goto(`https://jobs.lever.co/globex/${LEVER}/apply`);
  await Promise.all([tab.waitForURL(/thanks/), tab.click('button')]);
  // Ashby: submit, thank-you message, same address.
  await tab.goto(`https://jobs.ashbyhq.com/umbrella/${ASHBY}/application`);
  await tab.click('#go');
  await tab.waitForSelector('text=successfully submitted');
  // Ashby: the page already thanked you for your interest; Submit fails validation. Must not count.
  await tab.goto(`https://jobs.ashbyhq.com/hooli/${ASHBY_FAIL}/application`);
  await tab.click('#go');
  await tab.waitForSelector('text=required fields');
  // Greenhouse embedded on a company's own careers page.
  await tab.goto('https://careers.example.com/jobs/backend');
  const frame = tab.frameLocator('iframe');
  await frame.locator('#go').click();
  await frame.locator('text=has been submitted').waitFor();
  await tab.waitForTimeout(400);

  const list = await context.newPage();
  await list.goto(`chrome-extension://${EXT_ID}/list.html`);
  const cards = () =>
    list.$$eval('#list .card', (cs) =>
      cs.map((c) => ({ title: c.querySelector('.title').textContent, href: c.querySelector('.title').href, marks: [...c.querySelectorAll('.mark')].map((m) => m.textContent), meta: c.querySelector('.meta').textContent })),
    );
  await list.waitForFunction(() => document.querySelectorAll('#list .card').length >= 4, null, { timeout: 10_000 });
  let c = await cards();
  console.log(c);
  const by = (t) => c.find((x) => x.title === t);

  assert.equal(c.length, 4, 'four applications: no viewed-only posting, no failed submit');
  assert.ok(by('Data Analyst at Acme'), 'Greenhouse, by address');
  assert.match(by('Data Analyst at Acme').meta, /^Greenhouse · Applied /);
  assert.equal(by('Data Analyst at Acme').href, 'https://job-boards.greenhouse.io/acme/jobs/111');
  assert.ok(by('Globex - Support Engineer'), 'Lever, by address, titled from the page where Submit was pressed');
  assert.ok(by('Researcher @ Umbrella'), 'Ashby, by the thank-you message');
  assert.equal(by('Careers at Initech')?.href, 'https://job-boards.greenhouse.io/initech/jobs/333', 'embedded Greenhouse form, titled from the company page');
  assert.ok(!c.some((x) => /Hooli|Designer/.test(x.title)), 'neither the failed submit nor the viewed posting');
  assert.ok(c.every((x) => x.marks[0] === 'Submitted'), 'all marked submitted');

  // The "Tracks" row counts each source, and clicking one filters the list.
  const chips = await list.$$eval('#sources .source', (bs) => bs.map((b) => b.textContent));
  assert.deepEqual(chips, ['Everything4', 'Google Forms0', 'Greenhouse2', 'Lever1', 'Ashby1']);
  await list.click('#sources .source[data-src="gh"]');
  assert.deepEqual((await cards()).map((x) => x.title).sort(), ['Careers at Initech', 'Data Analyst at Acme']);
  await list.click('#sources .source[data-src="forms"]');
  assert.match(await list.$eval('#empty', (n) => n.textContent), /^No Google Forms yet\./);
  await list.click('#sources .source:first-child');
  c = await cards();

  // Is each posting still up?
  await list.click('#check');
  await list.waitForFunction(() => /^Checked \d+ items?\./.test(document.getElementById('notice').textContent), null, { timeout: 30_000 });
  c = await cards();
  console.log('after check', c.map((x) => [x.title, x.marks[1]]));
  assert.equal(by('Data Analyst at Acme').marks[1], 'Open');
  assert.equal(by('Globex - Support Engineer').marks[1], 'Closed', 'Lever posting now 404');
  assert.equal(by('Researcher @ Umbrella').marks[1], 'Unclear', 'Ashby cannot be told from its page');

  await list.setViewportSize({ width: 1000, height: 700 });
  await list.screenshot({ path: 'tests/screenshot-jobs.png', fullPage: true });
  console.log('jobs test passed');
} catch (e) {
  failed = true;
  console.error(e);
  const page = context.pages().find((p) => p.url().startsWith('chrome-extension://'));
  if (page) console.error('stored:', JSON.stringify(await page.evaluate(() => chrome.storage.sync.get(null)).catch((x) => String(x)), null, 1));
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
