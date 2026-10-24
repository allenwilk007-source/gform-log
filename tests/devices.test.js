import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDevice, deviceList, fromChromeSync, mergeDevices, seenOn, splitByOrigin, SYNCED_NAME } from '../extension/src/devices.js';
import { recordsFromHistory } from '../extension/src/forms.js';
import { buildView } from '../extension/src/view.js';
import { docText, emptyDoc, mergeDocs, parseDoc } from '../extension/src/cloud.js';

const rec = (extra = {}) => ({ t: 'T', l: 100, s: 0, c: 0, p: true, e: false, d: [], ...extra });
const dev = (name, seen, extra = {}) => cleanDevice({ name, via: 'extension', seen, ...extra });

test('device entries keep only known fields, and the newest copy of each wins in any order', () => {
  assert.equal(cleanDevice({ name: '', via: 'extension' }), null);
  assert.equal(cleanDevice({ name: 'X', via: 'made-up' }), null);
  assert.deepEqual(cleanDevice({ name: ' Laptop ', aka: ['Laptop', 'Old', 'Old'], via: 'extension', seen: '5', junk: 1 }), {
    name: 'Laptop', aka: ['Old'], browser: '', platform: '', via: 'extension', seen: 5,
  });
  const a = { pc: dev('PC', 1), edge: dev('Edge', 9) };
  const b = { pc: dev('PC renamed', 5), bad: { name: 'x' } };
  const ab = mergeDevices(a, b);
  assert.deepEqual(ab, mergeDevices(b, a), 'order does not matter');
  assert.deepEqual(Object.keys(ab).sort(), ['edge', 'pc']);
  assert.equal(ab.pc.name, 'PC renamed');
});

test("Chrome sync's device list gives devices, and the forms and sent applications in their open tabs", () => {
  const { devices, records } = fromChromeSync([
    {
      deviceName: 'Pixel 8',
      sessions: [
        { lastModified: 2000, window: { tabs: [{ url: 'https://docs.google.com/forms/d/e/1FAIpQLSc_PhonePhonePhonePhonePhonePhonePhonePhoneP/viewform', title: 'Club sign-up - Google Forms' }, { url: 'https://news.example/' }] } },
        { lastModified: 3000, tab: { url: 'https://job-boards.greenhouse.io/acme/jobs/42/confirmation', title: 'Thanks' } },
      ],
    },
    { deviceName: 'Work PC', sessions: [] },
    { deviceName: '', sessions: [{ lastModified: 1, tab: { url: 'https://docs.google.com/forms/d/e/1FAIpQLSc_NoNameNoNameNoNameNoNameNoNameNoNameNoNam/viewform' } }] },
  ]);
  assert.deepEqual(Object.keys(devices).sort(), ['cs:Pixel 8', 'cs:Work PC']);
  assert.equal(devices['cs:Pixel 8'].seen, 3_000_000, 'seconds become milliseconds');
  assert.equal(devices['cs:Pixel 8'].via, 'chrome-sync');
  assert.deepEqual([...records.keys()].sort(), ['1FAIpQLSc_PhonePhonePhonePhonePhonePhonePhonePhoneP', 'gh:acme/42']);
  assert.deepEqual(records.get('1FAIpQLSc_PhonePhonePhonePhonePhonePhonePhonePhoneP').d, ['Pixel 8']);
  assert.equal(records.get('1FAIpQLSc_PhonePhonePhonePhonePhonePhonePhonePhoneP').t, 'Club sign-up');
});

test('the device list covers every registered device and every name found on items', () => {
  const devices = {
    me: dev('Chrome on Windows', 50, { aka: ['Old name'] }),
    edge: dev('Edge on Windows', 40),
    'cs:Pixel 8': cleanDevice({ name: 'Pixel 8', via: 'chrome-sync', seen: 30 }),
  };
  const records = new Map([
    ['a', rec({ d: ['Old name'], l: 10 })],
    ['b', rec({ d: ['Takeout ab12cd'], l: 20 })],
    ['c', rec({ d: ['Laptop from v0.5'], l: 70 })],
  ]);
  const rows = deviceList(devices, records, 'me');
  assert.deepEqual(
    rows.map((r) => [r.name, r.via, r.self]),
    [
      ['Chrome on Windows', 'extension', true],
      ['Edge on Windows', 'extension', false],
      ['Pixel 8', 'chrome-sync', false],
      ['Laptop from v0.5', 'history', false],
      ['Takeout ab12cd', 'takeout', false],
    ],
  );
  assert.ok(seenOn(records.get('a'), rows[0]), 'an item seen under an earlier name still belongs to this browser');
  assert.equal(rows.find((r) => r.via === 'history').seen, 70);
});

test('the list filters by device, and device and source counts follow each other', () => {
  const devices = deviceList({ pc: dev('PC', 1), phone: cleanDevice({ name: 'Phone', via: 'chrome-sync', seen: 1 }) }, new Map(), 'pc');
  const records = new Map([
    ['form1', rec({ d: ['PC'] })],
    ['form2', rec({ d: ['PC', 'Phone'] })],
    ['gh:acme/1', rec({ d: ['Phone'], s: 5 })],
  ]);
  const ids = (opts) => buildView(records, {}, { devices, ...opts }).rows.map((r) => r.id).sort();
  assert.deepEqual(ids({ device: 'phone' }), ['form2', 'gh:acme/1']);
  assert.deepEqual(ids({ device: 'pc' }), ['form1', 'form2']);
  const all = buildView(records, {}, { devices });
  assert.deepEqual(all.deviceCounts, { all: 3, pc: 2, phone: 2 });
  assert.deepEqual(buildView(records, {}, { devices, source: 'gh' }).deviceCounts, { all: 1, pc: 0, phone: 1 }, 'device counts follow the chosen source');
  assert.equal(buildView(records, {}, { devices, device: 'pc' }).sourceCounts.gh, 0, 'source counts follow the chosen device');
});

test('the shared file carries devices, merges them, and forgets them with everything else', () => {
  const chrome = { ...emptyDoc(), devices: { c: dev('Chrome', 100) } };
  const edge = { ...emptyDoc(), devices: { e: dev('Edge', 200), c: dev('Chrome', 50) } };
  const merged = mergeDocs(chrome, edge);
  assert.deepEqual(Object.keys(merged.devices).sort(), ['c', 'e']);
  assert.equal(merged.devices.c.seen, 100);
  assert.equal(docText(merged), docText(mergeDocs(edge, chrome)));
  assert.deepEqual(parseDoc(docText(merged)).devices, merged.devices);
  assert.deepEqual(parseDoc(JSON.stringify({ v: 1, records: {} })).devices, {}, 'a file from an older version has none');
  assert.deepEqual(Object.keys(mergeDocs(merged, { ...emptyDoc(), clearedAt: 150 }).devices), ['e'], '"Forget everything" drops devices last seen before it');
});

test('history Chrome synced in from other devices is credited to them, not to this browser', () => {
  const url = 'https://docs.google.com/forms/d/e/1FAIpQLSc_PhonePhonePhonePhonePhonePhonePhonePhoneP/viewform';
  const item = { url, title: 'Phone poll - Google Forms', lastVisitTime: 900 };
  assert.deepEqual(splitByOrigin(item, [], 'PC'), [{ ...item, device: 'PC' }], 'no visit details: this browser');
  assert.deepEqual(splitByOrigin(item, [{ visitTime: 900, isLocal: true }], 'PC').map((i) => i.device), ['PC']);
  const onlyPhone = splitByOrigin(item, [{ visitTime: 500, isLocal: false }, { visitTime: 900, isLocal: false }], 'PC');
  assert.deepEqual(onlyPhone.map((i) => [i.device, i.lastVisitTime]), [[SYNCED_NAME, 900]]);
  const both = splitByOrigin(item, [{ visitTime: 300, isLocal: true }, { visitTime: 900, isLocal: false }], 'PC');
  const rec = recordsFromHistory(both, 'PC').get('1FAIpQLSc_PhonePhonePhonePhonePhonePhonePhonePhoneP');
  assert.deepEqual(rec.d, ['PC', SYNCED_NAME].sort());
  assert.equal(rec.l, 900);

  const rows = deviceList({ 'history-sync': cleanDevice({ name: SYNCED_NAME, via: 'history-sync', seen: 900 }) }, new Map([['x', { ...rec }]]), 'me');
  assert.equal(rows.find((r) => r.name === SYNCED_NAME).via, 'history-sync');
});
