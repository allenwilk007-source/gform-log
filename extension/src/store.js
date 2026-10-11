// Where records live. chrome.storage.sync first, so every desktop Chrome (or every Edge) signed in to
// the same account sees one merged list. When sync is full, the rest stays in this browser only.
import { mergeRecords, sameEnough } from './forms.js';

const PREFIX = 'f:';
const SYNC_FULL = 'syncFull';

export async function deviceName() {
  const { deviceName: saved } = await chrome.storage.local.get('deviceName');
  if (saved) return saved;
  const ua = globalThis.navigator?.userAgentData;
  const brands = (ua?.brands ?? []).map((b) => b.brand);
  const browser = brands.find((b) => /edge/i.test(b)) ? 'Edge' : brands.find((b) => /brave/i.test(b)) ? 'Brave' : 'Chrome';
  const name = `${browser} on ${ua?.platform || 'this computer'}`;
  await chrome.storage.local.set({ deviceName: name });
  return name;
}

export async function setDeviceName(name) {
  const clean = String(name ?? '').trim().slice(0, 40);
  if (clean) await chrome.storage.local.set({ deviceName: clean });
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
  await chrome.storage.sync.remove(Object.keys(sync).filter((k) => k.startsWith(PREFIX)));
  await chrome.storage.local.remove([...Object.keys(local).filter((k) => k.startsWith(PREFIX)), SYNC_FULL, 'status']);
}

export async function loadStatus() {
  return (await chrome.storage.local.get('status')).status ?? {};
}

export async function saveStatus(status) {
  await chrome.storage.local.set({ status });
}
