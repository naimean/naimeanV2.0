#!/usr/bin/env node
// scripts/download-ejs-cores.js
//
// Downloads / refreshes the EmulatorJS core .data files for every system
// used by the arcade.  In EmulatorJS 4.x the .data file is the complete core
// (WASM binary + metadata bundled together); there are no separate .js/.wasm
// files to fetch.
//
// The .data files ARE committed to git so this script is only needed when you
// want to pull updated core versions from the EmulatorJS CDN.
//
// Usage:
//   node scripts/download-ejs-cores.js
//
// Files are saved to public/assets/retroarch/cores/ alongside the .data
// files that are already committed.  Existing files are skipped so
// re-runs are fast.  Set FORCE=1 to re-download even if the file exists.

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORES_DIR = path.join(__dirname, '..', 'public', 'assets', 'retroarch', 'cores');
const CDN_BASE = 'https://cdn.emulatorjs.org/stable/data/cores/';
const FORCE = process.env.FORCE === '1';

// All cores currently used by the arcade (must match the .data files in CORES_DIR).
const CORES = [
  'a5200',
  'beetle_vb',
  'fceumm',
  'gambatte',
  'genesis_plus_gx',
  'handy',
  'mednafen_pce',
  'mgba',
  'mupen64plus_next',
  'nestopia',
  'picodrive',
  'prosystem',
  'snes9x',
  'stella2014',
  'vice_x128',
  'vice_x64',
  'vice_x64sc',
  'vice_xpet',
  'vice_xplus4',
  'vice_xvic',
];

/**
 * Downloads a single file from `url` and saves it to `dest`.
 * Skips the download (resolves immediately) if the file already exists and
 * FORCE is not set.  Uses a `.tmp` sibling while downloading and renames on
 * success to avoid leaving a partial file on failure.
 *
 * @param {string} url  - Full HTTPS URL to fetch.
 * @param {string} dest - Absolute destination path.
 * @returns {Promise<boolean>} Resolves with `true` if a new file was downloaded,
 *                             `false` if it was skipped.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (!FORCE && fs.existsSync(dest)) {
      console.log(`  skip  ${path.basename(dest)} (already exists)`);
      resolve(false);
      return;
    }
    const tmp = dest + '.tmp';
    const file = fs.createWriteStream(tmp);
    const cleanup = () => {
      try { file.close(); } catch (_) {}
      // Best-effort removal of the temp file; ignore errors (e.g. already gone).
      try { fs.unlinkSync(tmp); } catch (_) {}
    };
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        cleanup();
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        cleanup();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        fs.renameSync(tmp, dest);
        const stat = fs.statSync(dest);
        const kb = Math.round(stat.size / 1024);
        console.log(`  ok    ${path.basename(dest)} (${kb} KB)`);
        resolve(true);
      });
    }).on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading EmulatorJS core .data files (EmulatorJS 4.x)…');
  console.log('Note: In EJS 4.x each .data file is the complete core (WASM bundled in).');
  console.log(`Source:      ${CDN_BASE}`);
  console.log(`Destination: ${CORES_DIR}`);
  console.log(`Force re-download: ${FORCE ? 'yes' : 'no'}\n`);

  let skipped = 0;
  let downloaded = 0;
  let failures = 0;

  for (const core of CORES) {
    const filename = `${core}-wasm.data`;
    const url = CDN_BASE + filename;
    const dest = path.join(CORES_DIR, filename);
    try {
      const wasDownloaded = await downloadFile(url, dest);
      if (wasDownloaded) {
        downloaded++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.warn(`  WARN  ${filename}: ${err.message}`);
      failures++;
    }
  }

  console.log(`\nResults: ${downloaded} downloaded, ${skipped} skipped, ${failures} failed.`);
  if (failures > 0) {
    console.warn('Some core .data files could not be downloaded (see warnings above).');
    process.exit(1);
  } else {
    console.log('All core .data files are present.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

