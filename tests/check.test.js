import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAll, checkOne, idsToCheck } from '../extension/src/check.js';

const rec = (extra = {}) => ({ t: '', l: 0, s: 0, c: 0, p: true, e: false, d: [], ...extra });
const page = (url, body = '', status = 200) => ({ url, status, text: async () => body });

test('skips forms only ever seen in the editor', () => {
  const records = new Map([['a', rec()], ['b', rec({ p: false, e: true })], ['c', rec({ p: false, e: true, s: 5 })]]);
  assert.deepEqual(idsToCheck(records), ['a', 'c']);
});

test('names each outcome and never throws', async () => {
  assert.equal(await checkOne('x', rec(), async (u) => page(u, '<form action="/forms/d/e/x/formResponse">')), 'open');
  assert.equal(await checkOne('x', rec(), async () => page('https://docs.google.com/forms/d/e/x/closedform')), 'closed');
  assert.equal(await checkOne('x', rec(), async (u) => page(u, '', 404)), 'deleted');
  assert.equal(await checkOne('x', rec(), async () => { throw new TypeError('Failed to fetch'); }), 'unreachable');
});

test('sends the user\'s own sign-in with each request', async () => {
  let opts;
  await checkOne('x', rec(), async (u, o) => ((opts = o), page(u)));
  assert.equal(opts.credentials, 'include');
});

test('checks every form, at most three at once, saving after each', async () => {
  const records = new Map(Array.from({ length: 7 }, (_, i) => [`f${i}`, rec()]));
  let inFlight = 0;
  let peak = 0;
  const fetchFn = async (u) => {
    peak = Math.max(peak, ++inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return page(u, /f3/.test(u) ? 'no longer accepting responses' : '/formResponse');
  };
  const saves = [];
  const { status, total } = await checkAll(records, { fetchFn, now: () => 42, save: async (s, p) => saves.push([Object.keys(s).length, p]) });
  assert.equal(total, 7);
  assert.equal(peak, 3);
  assert.deepEqual(status.f3, { state: 'closed', at: 42 });
  assert.equal(status.f0.state, 'open');
  assert.equal(saves.length, 7);
  assert.deepEqual(saves.at(-1), [7, { done: 7, total: 7 }]);
});

test('an empty list finishes at once', async () => {
  assert.deepEqual(await checkAll(new Map(), { fetchFn: async () => assert.fail('no fetch') }), { status: {}, total: 0 });
});
