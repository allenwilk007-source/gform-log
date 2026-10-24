// Every browser and device the list has heard from. Pure logic only; src/store.js keeps them.
//
// A device is known in one of four ways:
//   extension    Form History runs there and has reported in (through Chrome sync or Google Drive)
//   chrome-sync  Chrome lists it among this account's devices, with its open tabs
//   history-sync one entry standing for every other device whose history Chrome syncs here
//   takeout      named in an imported Google Takeout file
//   history      named on items in the list, but has not reported in (an older version, or renamed)
import { recordsFromHistory } from './forms.js';

const MAX_NAME = 60;
const MAX_AKA = 5;
/** An extension device that has not reported in for this long is shown as gone quiet. */
export const QUIET_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const VIA = new Set(['extension', 'chrome-sync', 'history-sync']);

/**
 * The device name given to visits Chrome synced in from the account's other devices. Chrome says a
 * visit came from elsewhere, but not from which device, so they all share this one name.
 */
export const SYNCED_NAME = 'Synced from other devices';
export const SYNCED_ID = 'history-sync';
const text = (s, max = MAX_NAME) => String(s ?? '').trim().slice(0, max);

/** One registry entry, with only known fields, in a fixed key order so equal entries print equal. */
export function cleanDevice(d) {
  const name = text(d?.name);
  if (!name || !VIA.has(d?.via)) return null;
  const aka = [...new Set((Array.isArray(d.aka) ? d.aka : []).map((n) => text(n)).filter((n) => n && n !== name))].slice(0, MAX_AKA);
  return { name, aka, browser: text(d.browser, 20), platform: text(d.platform, 20), via: d.via, seen: Math.max(0, Number(d.seen) || 0) };
}

/** {id: entry}. For each id the entry seen most recently wins, so merging is order-independent. */
export function mergeDevices(a = {}, b = {}) {
  const out = {};
  for (const id of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const x = cleanDevice(a?.[id]);
    const y = cleanDevice(b?.[id]);
    const win = !x ? y : !y ? x : y.seen > x.seen || (y.seen === x.seen && JSON.stringify(y) > JSON.stringify(x)) ? y : x;
    if (win) out[id] = win;
  }
  return out;
}

/**
 * What chrome.sessions.getDevices() reports: the account's other Chrome devices (phones included)
 * with the tabs they had open. Gives registry entries, and records for any form or sent application
 * among those tabs.
 */
export function fromChromeSync(sessionDevices = []) {
  const devices = {};
  const items = [];
  for (const dev of sessionDevices ?? []) {
    const name = text(dev?.deviceName);
    if (!name) continue;
    let seen = 0;
    for (const s of dev.sessions ?? []) {
      // Chrome gives seconds here, not milliseconds.
      const at = (Number(s?.lastModified) || 0) * 1000;
      seen = Math.max(seen, at);
      const tabs = s?.window?.tabs ?? (s?.tab ? [s.tab] : []);
      for (const t of tabs) if (t?.url) items.push({ url: t.url, title: t.title, lastVisitTime: at, device: name });
    }
    devices[`cs:${name}`] = cleanDevice({ name, via: 'chrome-sync', seen });
  }
  return { devices, records: recordsFromHistory(items) };
}

/**
 * Splits one history entry by where its visits happened: in this browser, or on another device and
 * synced here by Chrome (chrome.history.getVisits marks those isLocal: false). Without visit
 * details, everything counts as this browser's.
 */
export function splitByOrigin(item, visits, here) {
  const last = (vs) => Math.max(...vs.map((v) => v.visitTime || 0));
  const local = (visits ?? []).filter((v) => v.isLocal !== false);
  const synced = (visits ?? []).filter((v) => v.isLocal === false);
  if (!synced.length) return [{ ...item, device: here }];
  const out = [{ ...item, lastVisitTime: last(synced), device: SYNCED_NAME }];
  if (local.length) out.push({ ...item, lastVisitTime: last(local), device: here });
  return out;
}

const ORDER = { extension: 0, 'chrome-sync': 1, 'history-sync': 2, history: 3, takeout: 4 };

/**
 * The devices to show: every registry entry, plus every device name found on an item but missing
 * from the registry. Each has the names its items carry (current and earlier ones).
 */
export function deviceList(devices, records, selfId) {
  const rows = [];
  const byName = new Map();
  for (const [id, d] of Object.entries(devices ?? {})) {
    const row = { id, name: d.name, names: [d.name, ...d.aka], via: d.via, seen: d.seen, self: id === selfId, browser: d.browser, platform: d.platform };
    rows.push(row);
    for (const n of row.names) if (!byName.has(n) || row.self) byName.set(n, row);
  }
  for (const rec of records.values()) {
    for (const n of rec.d ?? []) {
      let row = byName.get(n);
      if (!row) {
        row = { id: `name:${n}`, name: n, names: [n], via: n.startsWith('Takeout ') ? 'takeout' : 'history', seen: 0, self: false };
        rows.push(row);
        byName.set(n, row);
      }
      if (row.via === 'history' || row.via === 'takeout') row.seen = Math.max(row.seen, rec.l || 0);
    }
  }
  return rows.sort((a, b) => b.self - a.self || ORDER[a.via] - ORDER[b.via] || b.seen - a.seen || a.name.localeCompare(b.name));
}

/** True when an item was seen on this device under any of its names. */
export const seenOn = (rec, row) => (rec.d ?? []).some((n) => row.names.includes(n));
