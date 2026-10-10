import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanTitle, formLink, mergeRecords, parseFormUrl, recordsFromHistory, sameEnough,
  statusFromPage, takeoutHistoryItems, toCsv, LAST_SEEN_GRANULARITY_MS,
} from '../extension/src/forms.js';

const PUB = '1FAIpQLSc_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const EDIT = '1xYzEditIdEditIdEditIdEditIdEditIdEditId123';

test('parses respondent, submitted, closed and editor links', () => {
  assert.deepEqual(parseFormUrl(`https://docs.google.com/forms/d/e/${PUB}/viewform?usp=sf_link`),
    { id: PUB, published: true, page: 'viewform', editor: false, submitted: false, closed: false });
  assert.equal(parseFormUrl(`https://docs.google.com/forms/d/e/${PUB}/formResponse`).submitted, true);
  assert.equal(parseFormUrl(`https://docs.google.com/forms/u/1/d/e/${PUB}/alreadyresponded`).submitted, true);
  assert.equal(parseFormUrl(`https://docs.google.com/forms/d/e/${PUB}/closedform`).closed, true);
  assert.equal(parseFormUrl(`https://docs.google.com/forms/d/${EDIT}/edit#responses`).editor, true);
  assert.equal(parseFormUrl(`https://docs.google.com/forms/d/${EDIT}/viewform`).editor, false);
});

test('ignores everything that is not a form', () => {
  for (const u of ['https://example.com/', 'https://docs.google.com/document/d/abc/edit', 'https://forms.gle/AbC123',
    `https://evil.example/docs.google.com/forms/d/e/${PUB}/viewform`, `http://docs.google.com.evil.example/forms/d/e/${PUB}/viewform`, null, undefined]) {
    assert.equal(parseFormUrl(u), null, String(u));
  }
});

test('cleans titles and drops the generic ones', () => {
  assert.equal(cleanTitle('Volunteer Sign-up - Google Forms'), 'Volunteer Sign-up');
  assert.equal(cleanTitle('Google Forms'), '');
  assert.equal(cleanTitle('Google Forms: Sign-in'), '');
  assert.equal(cleanTitle('  Club   Survey 🎉 '), 'Club Survey 🎉');
  assert.equal(cleanTitle('x'.repeat(500)).length, 120);
});

test('merges visits of one form across URLs and devices', () => {
  const recs = recordsFromHistory([
    { url: `https://docs.google.com/forms/d/e/${PUB}/viewform`, title: 'Volunteer Sign-up', lastVisitTime: 1000 },
    { url: `https://docs.google.com/forms/d/e/${PUB}/formResponse`, title: 'Google Forms', lastVisitTime: 2000 },
    { url: `https://docs.google.com/forms/d/e/${PUB}/viewform`, title: '', lastVisitTime: 3000, device: 'Phone' },
    { url: 'https://example.com', title: 'x', lastVisitTime: 5 },
  ], 'Laptop');
  assert.equal(recs.size, 1);
  assert.deepEqual(recs.get(PUB), { t: 'Volunteer Sign-up', l: 3000, s: 2000, c: 0, p: true, e: false, d: ['Laptop', 'Phone'] });
});

test('merge is order-independent and keeps the newest real title', () => {
  const a = { t: 'Old name', l: 10, s: 0, c: 0, p: true, e: false, d: ['A'] };
  const b = { t: 'New name', l: 20, s: 15, c: 0, p: false, e: false, d: ['B'] };
  assert.deepEqual(mergeRecords(a, b), mergeRecords(b, a));
  assert.equal(mergeRecords(a, b).t, 'New name');
  assert.equal(mergeRecords(a, { ...b, t: '' }).t, 'Old name');
  assert.equal(mergeRecords(undefined, a), a);
});

test('only meaningful changes cause a sync write', () => {
  const r = { t: 'T', l: 0, s: 0, c: 0, p: true, e: false, d: ['A'] };
  assert.equal(sameEnough(r, { ...r, l: LAST_SEEN_GRANULARITY_MS - 1 }), true);
  assert.equal(sameEnough(r, { ...r, l: LAST_SEEN_GRANULARITY_MS }), false);
  assert.equal(sameEnough(r, { ...r, s: 5 }), false);
  assert.equal(sameEnough(r, { ...r, d: ['A', 'B'] }), false);
  assert.equal(sameEnough(undefined, r), false);
});

test('builds the right link to open a form', () => {
  assert.equal(formLink(PUB, { p: true }), `https://docs.google.com/forms/d/e/${PUB}/viewform`);
  assert.equal(formLink(EDIT, { p: false, e: true }), `https://docs.google.com/forms/d/${EDIT}/edit`);
  assert.equal(formLink(EDIT, { p: false, e: false }), `https://docs.google.com/forms/d/${EDIT}/viewform`);
});

test('reads Google Takeout Chrome history, current and older layouts', () => {
  const entry = { url: `https://docs.google.com/forms/d/e/${PUB}/formResponse`, title: 'T', time_usec: 1_700_000_000_000_000, client_id: 'ab+c/12345678==' };
  const items = takeoutHistoryItems(JSON.stringify({ 'Browser History': [entry, { title: 'no url' }] }));
  assert.deepEqual(items, [{ url: entry.url, title: 'T', lastVisitTime: 1_700_000_000_000, device: 'Takeout abc123' }]);
  assert.equal(takeoutHistoryItems({ Other: [entry] }).length, 1);
  assert.throws(() => takeoutHistoryItems('{"foo": 1}'), /not a Google Takeout/);
  assert.throws(() => takeoutHistoryItems('not json'));
});

test('tells open, closed and sign-in pages apart', () => {
  assert.equal(statusFromPage(`https://docs.google.com/forms/d/e/${PUB}/closedform`, ''), 'closed');
  assert.equal(statusFromPage('https://accounts.google.com/v3/signin/identifier?continue=x', ''), 'sign-in needed');
  assert.equal(statusFromPage('https://docs.google.com/forms/d/e/x/viewform', 'The form X is no longer accepting responses.'), 'closed');
  assert.equal(statusFromPage('https://docs.google.com/forms/d/e/x/viewform', '<form action="https://docs.google.com/forms/d/e/x/formResponse">'), 'open');
  assert.equal(statusFromPage('https://docs.google.com/forms/d/e/x/viewform', '<html></html>'), 'unknown');
});

test('CSV quotes commas and neutralises spreadsheet formulas', () => {
  const csv = toCsv([[PUB, { t: '=HYPERLINK("x"), "hi"', l: 0, s: 1, c: 0, p: true, d: ['A', 'B'] }]]);
  const [, row] = csv.trim().split('\r\n');
  assert.ok(row.startsWith(`"'=HYPERLINK(""x""), ""hi""",yes,`), row);
  assert.ok(row.endsWith(`A; B,https://docs.google.com/forms/d/e/${PUB}/viewform`), row);
});
