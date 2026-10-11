import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Chrome derives an extension's ID from the manifest key: the first 128 bits of the SHA-256 of the
// public key, written with the letters a-p. Changing the key changes the ID, and every installed
// copy would lose its synced list, so this test fails loudly if that happens.
export const EXTENSION_ID = 'mganadollnpacccnbhcmnjcebjkcikek';

test('the manifest key gives the published extension ID', () => {
  const { key, permissions } = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
  assert.equal(id, EXTENSION_ID);
  assert.ok(permissions.includes('alarms'));
});
