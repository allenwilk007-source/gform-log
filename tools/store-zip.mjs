#!/usr/bin/env node
// Builds form-history-store.zip for uploading to the Chrome Web Store or Edge Add-ons.
//
// It differs from the extension folder in one way: the manifest's "key" is removed, because each
// store assigns its own ID on the first upload (after that, copy the store's public key into
// extension/manifest.json so unpacked copies keep the same ID). It refuses to build while
// src/config.js has no built-in Google client ID, since people installing from a store could
// not sign in. Needs the `zip` command.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'form-history-store.zip');

const config = readFileSync(join(root, 'extension/src/config.js'), 'utf8');
if (/GOOGLE_CLIENT_ID = ''/.test(config) && !process.argv.includes('--allow-no-client')) {
  console.error('extension/src/config.js has no GOOGLE_CLIENT_ID. Store users could not sign in to share their list.');
  console.error('Fill it in, or pass --allow-no-client to build anyway.');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'form-history-store-'));
try {
  cpSync(join(root, 'extension'), work, { recursive: true, filter: (p) => !/\/\.[^/]+$/.test(p) });
  const manifestPath = join(work, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  delete manifest.key;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  if (existsSync(out)) rmSync(out);
  execFileSync('zip', ['-qr', out, '.'], { cwd: work, stdio: 'inherit' });
  console.log(`Built ${out} (version ${manifest.version}, no "key" field).`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
