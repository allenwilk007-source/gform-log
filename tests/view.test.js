import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ago, buildView, openMark, wasSubmitted } from '../extension/src/view.js';

const rec = (extra = {}) => ({ t: 'T', l: 0, s: 0, c: 0, p: true, e: false, d: [], ...extra });

test('every check result maps to open, closed or unknown', () => {
  const key = (state, r) => openMark(state && { state }, r).key;
  assert.equal(key('open'), 'open');
  assert.equal(key('already responded'), 'open');
  assert.equal(key('closed'), 'closed');
  assert.equal(key('deleted'), 'closed');
  for (const s of ['sign-in needed', 'unreachable', 'unknown', undefined]) assert.equal(key(s), 'unknown', String(s));
  assert.equal(key(undefined, rec({ c: 5 })), 'closed', 'seen closed while browsing counts before any check');
  assert.equal(openMark(undefined, rec()).label, 'Not checked yet');
});

test('a form saying you already responded counts as submitted', () => {
  assert.equal(wasSubmitted(rec(), { state: 'already responded' }), true);
  assert.equal(wasSubmitted(rec({ s: 9 }), undefined), true);
  assert.equal(wasSubmitted(rec(), { state: 'open' }), false);
});

test('filters, counts, search and order', () => {
  const records = new Map([
    ['closed', rec({ t: 'Old survey', l: 50, c: 1 })],
    ['answered', rec({ t: 'Signed up', l: 40, s: 40 })],
    ['todo', rec({ t: 'Club poll', l: 10 })],
    ['unchecked', rec({ t: 'Mystery', l: 60 })],
    ['mine', rec({ t: 'My own form', l: 99, p: false, e: true })],
  ]);
  const status = { answered: { state: 'open' }, todo: { state: 'open' } };
  const ids = (opts) => buildView(records, status, opts).rows.map((r) => r.id);

  assert.deepEqual(ids(), ['todo', 'answered', 'unchecked', 'closed'], 'open+unanswered, open+answered, unknown, closed');
  assert.deepEqual(buildView(records, status).counts, { all: 4, open: 2, submitted: 1, closed: 1 });
  assert.deepEqual(ids({ filter: 'open' }), ['todo', 'answered']);
  assert.deepEqual(ids({ filter: 'submitted' }), ['answered']);
  assert.deepEqual(ids({ filter: 'closed' }), ['closed']);
  assert.deepEqual(ids({ query: 'POLL' }), ['todo']);
  assert.ok(ids({ showEditor: true }).includes('mine'), 'your own forms appear only when asked for');
});

test('relative times', () => {
  const now = Date.UTC(2026, 9, 11, 12);
  assert.equal(ago(now - 20_000, now), 'just now');
  assert.equal(ago(now - 5 * 60_000, now), '5 min ago');
  assert.equal(ago(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(ago(now - 26 * 3600_000, now), 'yesterday');
  assert.equal(ago(now - 4 * 86400_000, now), '4 days ago');
  assert.equal(ago(0, now), '');
});
