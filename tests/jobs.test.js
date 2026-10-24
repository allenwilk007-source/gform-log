import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formLink, recordsFromHistory } from '../extension/src/forms.js';
import { cleanJobTitle, isJobKey, JOB_HOSTS, jobLabel, jobLink, jobStatus, parseJobUrl } from '../extension/src/jobs.js';

const U = '0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';

test('Greenhouse: job pages, sent applications, embeds and the EU board', () => {
  assert.deepEqual(parseJobUrl('https://job-boards.greenhouse.io/Acme/jobs/4012345678'), { key: 'gh:acme/4012345678', site: 'gh', company: 'acme', id: '4012345678', submitted: false });
  assert.equal(parseJobUrl('https://job-boards.greenhouse.io/acme/jobs/4012345678/confirmation').submitted, true);
  assert.equal(parseJobUrl('https://boards.greenhouse.io/acme/jobs/4012345678/confirmation?gh_src=x').submitted, true);
  assert.equal(parseJobUrl('https://job-boards.eu.greenhouse.io/acme/jobs/1/confirmation').key, 'gh:acme/1');
  assert.equal(parseJobUrl('https://boards.greenhouse.io/embed/job_app?for=acme&token=777').key, 'gh:acme/777');
  assert.equal(parseJobUrl('https://boards.greenhouse.io/acme'), null, 'a whole board is not one job');
  assert.equal(parseJobUrl('https://boards.greenhouse.io/embed/job_app?for=acme&token=x'), null);
});

test('Lever and Ashby', () => {
  assert.deepEqual(parseJobUrl(`https://jobs.lever.co/acme/${U}/thanks`), { key: `lv:acme/${U}`, site: 'lv', company: 'acme', id: U, submitted: true });
  assert.equal(parseJobUrl(`https://jobs.lever.co/acme/${U}/apply`).submitted, false);
  assert.equal(parseJobUrl(`https://jobs.eu.lever.co/acme/${U}/thanks`).key, `lve:acme/${U}`);
  assert.equal(parseJobUrl('https://jobs.lever.co/acme/not-a-uuid'), null);
  assert.deepEqual(parseJobUrl(`https://jobs.ashbyhq.com/acme/${U}/application`), { key: `ab:acme/${U}`, site: 'ab', company: 'acme', id: U, submitted: false });
});

test('look-alike and unsafe addresses are ignored', () => {
  for (const u of [
    `http://jobs.lever.co/acme/${U}/thanks`,
    `https://jobs.lever.co.evil.example/acme/${U}/thanks`,
    `https://evil.example/jobs.lever.co/acme/${U}/thanks`,
    'https://greenhouse.io.evil.example/acme/jobs/1/confirmation',
    'https://boards.greenhouse.io/<script>/jobs/1/confirmation',
    'not a url',
    null,
  ]) {
    assert.equal(parseJobUrl(u), null, String(u));
  }
});

test('links, labels and titles', () => {
  assert.equal(jobLink('gh:acme/1'), 'https://job-boards.greenhouse.io/acme/jobs/1');
  assert.equal(jobLink(`lv:acme/${U}`), `https://jobs.lever.co/acme/${U}`);
  assert.equal(jobLink(`lve:acme/${U}`), `https://jobs.eu.lever.co/acme/${U}`);
  assert.equal(jobLink(`ab:acme/${U}`), `https://jobs.ashbyhq.com/acme/${U}`);
  assert.equal(formLink('gh:acme/1', {}), 'https://job-boards.greenhouse.io/acme/jobs/1');
  assert.deepEqual(jobLabel(`ab:acme/${U}`), { site: 'Ashby', company: 'acme' });
  assert.ok(isJobKey('gh:a/1') && !isJobKey('1FAIpQLSc_abc'));
  assert.equal(cleanJobTitle('Job Application for Data Analyst at Acme'), 'Data Analyst at Acme');
});

test('only sent applications are taken from history; viewed postings are not', () => {
  const recs = recordsFromHistory([
    { url: 'https://job-boards.greenhouse.io/acme/jobs/1', title: 'Job Application for Analyst at Acme', lastVisitTime: 10 },
    { url: 'https://job-boards.greenhouse.io/acme/jobs/1/confirmation', title: 'Job Application for Analyst at Acme', lastVisitTime: 20 },
    { url: 'https://job-boards.greenhouse.io/acme/jobs/2', title: 'Just looking', lastVisitTime: 30 },
    { url: `https://jobs.lever.co/acme/${U}/thanks`, title: 'Thank you', lastVisitTime: 40 },
  ], 'PC');
  assert.deepEqual([...recs.keys()].sort(), ['gh:acme/1', `lv:acme/${U}`]);
  assert.deepEqual(recs.get('gh:acme/1'), { t: 'Analyst at Acme', l: 20, s: 20, c: 0, p: true, e: false, d: ['PC'] });
  assert.equal(recs.get(`lv:acme/${U}`).t, '', 'a generic thank-you title is dropped');
});

test('whether a posting is still up', () => {
  const key = 'gh:acme/1';
  assert.equal(jobStatus(key, 'https://job-boards.greenhouse.io/acme/jobs/1', 200), 'open');
  assert.equal(jobStatus(key, 'https://job-boards.greenhouse.io/acme?error=true', 200), 'closed', 'sent back to the board');
  assert.equal(jobStatus(key, 'https://job-boards.greenhouse.io/acme/jobs/1', 404), 'closed');
  assert.equal(jobStatus(key, 'https://job-boards.greenhouse.io/acme/jobs/1', 503), 'unknown');
  assert.equal(jobStatus(`ab:acme/${U}`, `https://jobs.ashbyhq.com/acme/${U}`, 200), 'unknown', 'Ashby pages load either way');
});

test('the manifest watches exactly the job sites the code understands', () => {
  const m = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));
  const want = JOB_HOSTS.map((h) => `https://${h}/*`).sort();
  assert.deepEqual([...m.content_scripts[0].matches].sort(), want);
  for (const h of want) assert.ok(m.host_permissions.includes(h), h);
  for (const h of JOB_HOSTS) assert.ok(parseJobUrl(`https://${h}/` + (h.includes('greenhouse') ? 'a/jobs/1' : `a/${U}`)), h);
});
