#!/usr/bin/env node
// Renders the Chrome Web Store images into store/: three 1280x800 screenshots of the list page
// filled with made-up sample data, and the 440x280 promo tile. Run: node tools/store-screenshots.mjs
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { chromium } = await import('playwright');
const EXT = resolve('extension');
const DAY = 86400_000;
const now = Date.now();
const U = (n) => `${n}0000000-0000-4000-8000-00000000000${n}`.slice(-36).replace(/^.{8}/, `${n}${n}${n}${n}${n}${n}${n}${n}`);

// Made-up sample data: no real people, forms or companies' real postings.
const records = {
  '1FAIpQLSc_SampleVolunteerSignUpSampleVolunteerSignUp': { t: 'Spring Volunteer Sign-up', l: now - 2 * 3600_000, s: 0, c: 0, p: true, e: false, d: ['Laptop Chrome'] },
  '1FAIpQLSd_SampleScholarshipApplicationSampleScholars': { t: 'Community Scholarship Application', l: now - 1 * DAY, s: now - 1 * DAY, c: 0, p: true, e: false, d: ['Laptop Chrome', 'Desktop Edge'] },
  'gh:northwind/4012345678': { t: 'Data Analyst Intern at Northwind', l: now - 2 * DAY, s: now - 2 * DAY, c: 0, p: true, e: false, d: ['Desktop Edge'] },
  [`lv:contoso/${U(1)}`]: { t: 'Contoso - Software Engineering Intern', l: now - 4 * DAY, s: now - 4 * DAY, c: 0, p: true, e: false, d: ['Laptop Chrome'] },
  '1FAIpQLSe_SampleClubInterestFormSampleClubInterestFo': { t: 'Robotics Club Interest Form', l: now - 5 * DAY, s: 0, c: 0, p: true, e: false, d: ['Laptop Chrome'] },
  [`ab:fabrikam/${U(2)}`]: { t: 'Research Assistant @ Fabrikam', l: now - 6 * DAY, s: now - 6 * DAY, c: 0, p: true, e: false, d: ['Laptop Chrome'] },
  '1FAIpQLSf_SampleEventRSVPSampleEventRSVPSampleEventRS': { t: 'Career Fair RSVP', l: now - 12 * DAY, s: now - 12 * DAY, c: now - 3 * DAY, p: true, e: false, d: ['Desktop Edge'] },
  'gh:tailspin/4098765432': { t: 'Marketing Intern at Tailspin', l: now - 20 * DAY, s: now - 20 * DAY, c: 0, p: true, e: false, d: ['Laptop Chrome'] },
};
const at = now - 25 * 60_000;
const status = {
  '1FAIpQLSc_SampleVolunteerSignUpSampleVolunteerSignUp': { state: 'open', at },
  '1FAIpQLSd_SampleScholarshipApplicationSampleScholars': { state: 'open', at },
  'gh:northwind/4012345678': { state: 'open', at },
  [`lv:contoso/${U(1)}`]: { state: 'open', at },
  '1FAIpQLSe_SampleClubInterestFormSampleClubInterestFo': { state: 'open', at },
  [`ab:fabrikam/${U(2)}`]: { state: 'unknown', at },
  '1FAIpQLSf_SampleEventRSVPSampleEventRSVPSampleEventRS': { state: 'closed', at },
  'gh:tailspin/4098765432': { state: 'closed', at },
};

const profile = await mkdtemp(join(tmpdir(), 'store-shots-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/list.html`);
  await page.waitForTimeout(1500); // let the first history scan finish so it cannot overwrite the sample
  await page.evaluate(
    async ({ records, status, at }) => {
      await chrome.alarms.clearAll();
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      await chrome.storage.sync.set(Object.fromEntries(Object.entries(records).map(([k, v]) => [`f:${k}`, v])));
      await chrome.storage.local.set({
        status,
        deviceName: 'Laptop Chrome',
        checkRun: { running: false, trigger: 'daily', started: at - 4000, finished: at, done: 8, total: 8 },
        cloud: { email: 'you@example.com', lastSync: Date.now() - 120_000, error: '', running: false },
      });
    },
    { records, status, at },
  );
  await page.reload();
  await page.waitForSelector('#list .card');
  await page.screenshot({ path: 'store/screenshot-1-list.png' });

  await page.click('[data-filter="open"]');
  await page.screenshot({ path: 'store/screenshot-2-open.png' });

  await page.click('[data-filter="all"]');
  await page.click('summary');
  await page.$eval('#cloud-h', (n) => n.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'store/screenshot-3-sharing.png' });

  // 440x280 small promo tile.
  const icon = readFileSync('extension/icons/icon-128.png').toString('base64');
  const tile = await context.newPage();
  await tile.setViewportSize({ width: 440, height: 280 });
  await tile.setContent(`<!doctype html><body style="margin:0;width:440px;height:280px;display:flex;align-items:center;gap:20px;padding:0 32px;box-sizing:border-box;
    background:linear-gradient(135deg,#5b3cc4,#3d2696);font-family:system-ui,'Segoe UI',sans-serif;color:#fff">
    <img src="data:image/png;base64,${icon}" width="96" height="96" style="border-radius:22px;box-shadow:0 6px 18px rgba(0,0,0,.25)">
    <div><div style="font-size:34px;font-weight:700;letter-spacing:-.01em">Form History</div>
    <div style="font-size:17px;opacity:.9;margin-top:6px;line-height:1.35">Every form you answered and every job you applied to, in one list.</div></div></body>`);
  await tile.screenshot({ path: 'store/promo-tile-440x280.png' });
  console.log('Wrote store/screenshot-1-list.png, screenshot-2-open.png, screenshot-3-sharing.png, promo-tile-440x280.png');
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
