// Where records live. chrome.storage.sync first, so every desktop Chrome (or every Edge) signed in to
// the same account sees one merged list. When sync is full, the rest stays in this browser only.
import { cleanDevice, mergeDevices } from './devices.js';
import { mergeRecords, sameEnough } from './forms.js';

const PREFIX = 'f:';
const DEVICE_PREFIX = 'dev:';
const SYNC_FULL = 'syncFull';
/** How often this browser's entry is rewritten in sync storage, which limits writes per hour. */
const DEVICE_SYNC_EVERY_MS = 60 * 60 * 1000;

function describeBrowser() {
  const ua = globalThis.navigator?.userAgentData;
  const brands = (ua?.brands ?? []).map((b) => b.brand);
  const browser = brands.find((b) => /edge/i.test(b)) ? 'Edge' : brands.find((b) => /brave/i.test(b)) ? 'Brave' : 'Chrome';
  return { browser, platform: ua?.platform || '' };
}

export async function deviceName() {
  const { deviceName: saved } = await chrome.storage.local.get('deviceName');
  if (saved) return saved;
  const { browser, platform } = describeBrowser();
  const name = `${browser} on ${platform || 'this computer'}`;
  await chrome.storage.local.set({ deviceName: name });
  return name;
}

/** Renaming keeps the old name as an alias, so items already seen here still count as this device's. */
export async function setDeviceName(name) {
  const clean = String(name ?? '').trim().slice(0, 40);
  if (!clean) return;
  const before = await deviceName();
  const { deviceAka = [] } = await chrome.storage.local.get('deviceAka');
  const aka = [...new Set([before, ...deviceAka])].filter((n) => n !== clean).slice(0, 5);
  await chrome.storage.local.set({ deviceName: clean, deviceAka: aka });
  await touchDevice({ force: true });
}

/** A random id for this browser, made once. Names can repeat (two "Chrome on Windows"); ids do not. */
export async function deviceId() {
  const { deviceId: saved } = await chrome.storage.local.get('deviceId');
  if (saved) return saved;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

/** Every device known here: what other browsers reported through sync storage or Drive, and this one. */
export async function loadDevices() {
  const [sync, { devices }] = await Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get('devices')]);
  const reported = Object.fromEntries(Object.entries(sync).filter(([k]) => k.startsWith(DEVICE_PREFIX)).map(([k, v]) => [k.slice(DEVICE_PREFIX.length), v]));
  return mergeDevices(devices ?? {}, reported);
}

export async function saveDevices(devices) {
  await chrome.storage.local.set({ devices });
}

/**
 * Records that this browser is alive. The local copy is always current; the copy in sync storage,
 * which other Chromes on the account read, is rewritten at most once an hour unless something changed.
 */
export async function touchDevice({ force = false } = {}) {
  const [id, name, { deviceAka = [] }] = await Promise.all([deviceId(), deviceName(), chrome.storage.local.get('deviceAka')]);
  const entry = cleanDevice({ name, aka: deviceAka, ...describeBrowser(), via: 'extension', seen: Date.now() });
  const known = await loadDevices();
  await saveDevices(mergeDevices(known, { [id]: entry }));
  const key = DEVICE_PREFIX + id;
  const { [key]: shared } = await chrome.storage.sync.get(key);
  const changed = !shared || shared.name !== entry.name || JSON.stringify(shared.aka) !== JSON.stringify(entry.aka);
  if (force || changed || entry.seen - (shared.seen || 0) > DEVICE_SYNC_EVERY_MS) {
    await chrome.storage.sync.set({ [key]: entry }).catch(() => {});
  }
  return { id, entry };
}

/** All records as [id, record] pairs, merged across sync and local. */
export async function loadAll() {
  const [sync, local] = await Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get(null)]);
  const out = new Map();
  for (const area of [sync, local]) {
    for (const [k, v] of Object.entries(area)) {
      if (!k.startsWith(PREFIX)) continue;
      const id = k.slice(PREFIX.length);
      out.set(id, mergeRecords(out.get(id), v));
    }
  }
  return out;
}

/** Merges new records into storage. Writes only what changed, in one call, to stay inside sync's write limits. */
export async function upsert(records) {
  if (!records.size) return { written: 0, local: 0 };
  const keys = [...records.keys()].map((id) => PREFIX + id);
  const [sync, local] = await Promise.all([chrome.storage.sync.get(keys), chrome.storage.local.get(keys)]);
  const changes = {};
  for (const [id, rec] of records) {
    const key = PREFIX + id;
    const prev = mergeRecords(sync[key], local[key]);
    const next = mergeRecords(prev, rec);
    if (!sameEnough(prev, next)) changes[key] = next;
  }
  const n = Object.keys(changes).length;
  if (!n) return { written: 0, local: 0 };
  try {
    await chrome.storage.sync.set(changes);
    return { written: n, local: 0 };
  } catch (err) {
    // Over quota or over the write rate. Keep everything locally so nothing is lost.
    await chrome.storage.local.set({ ...changes, [SYNC_FULL]: String(err?.message ?? err) });
    return { written: n, local: n };
  }
}

export async function syncProblem() {
  return (await chrome.storage.local.get(SYNC_FULL))[SYNC_FULL] ?? '';
}

export async function clearAll() {
  const [sync, local] = await Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get(null)]);
  await chrome.storage.sync.remove(Object.keys(sync).filter((k) => k.startsWith(PREFIX) || k.startsWith(DEVICE_PREFIX)));
  await chrome.storage.local.remove([...Object.keys(local).filter((k) => k.startsWith(PREFIX)), SYNC_FULL, 'status', 'checkRun', 'devices']);
  // Remembered so the shared list in Google Drive forgets these forms too, in every browser.
  await chrome.storage.local.set({ clearedAt: Date.now() });
}

export async function loadClearedAt() {
  return (await chrome.storage.local.get('clearedAt')).clearedAt ?? 0;
}

/** Applies a "Forget everything" made in another browser: drops every form last seen before it. */
export async function forgetBefore(clearedAt) {
  const [sync, local] = await Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get(null)]);
  const stale = (area) =>
    Object.entries(area)
      .filter(([k, v]) => (k.startsWith(PREFIX) && (v?.l || 0) <= clearedAt) || (k.startsWith(DEVICE_PREFIX) && (v?.seen || 0) <= clearedAt))
      .map(([k]) => k);
  await chrome.storage.sync.remove(stale(sync));
  await chrome.storage.local.remove(stale(local));
  await chrome.storage.local.set({ clearedAt });
  const devices = await loadDevices();
  await saveDevices(Object.fromEntries(Object.entries(devices).filter(([, d]) => d.seen > clearedAt)));
}

export async function loadStatus() {
  return (await chrome.storage.local.get('status')).status ?? {};
}

export async function saveStatus(status) {
  await chrome.storage.local.set({ status });
}

/** Progress and outcome of the latest open/closed check: {running, trigger, started, finished, done, total, error}. */
export async function loadCheckRun() {
  return (await chrome.storage.local.get('checkRun')).checkRun ?? null;
}

export async function saveCheckRun(checkRun) {
  await chrome.storage.local.set({ checkRun });
}
