#!/usr/bin/env node
// scripts/download-ejs-cores.js
//
// Downloads the EmulatorJS core binaries (.js + .wasm) for every system
// used by the arcade.  These files are excluded from git (see .gitignore)
// and must be fetched before deployment or local development.
//
// Usage:
//   node scripts/download-ejs-cores.js
//
// Files are saved to public/assets/retroarc/cores/ alongside the .data
// header files that are already committed.  Existing files are skipped so
// re-runs are fast.  Set FORCE=1 to re-download even if the file exists.

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORES_DIR = path.join(__dirname, '..', 'public', 'assets', 'retroarc', 'cores');
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

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (!FORCE && fs.existsSync(dest)) {
      console.log(`  skip  ${path.basename(dest)} (already exists)`);
      resolve();
      return;
    }
    const tmp = dest + '.tmp';
    const file = fs.createWriteStream(tmp);
    const cleanup = () => {
      try { file.close(); } catch (_) {}
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
        resolve();
      });
    }).on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading EmulatorJS core binaries…');
  console.log(`Source:      ${CDN_BASE}`);
  console.log(`Destination: ${CORES_DIR}`);
  console.log(`Force re-download: ${FORCE ? 'yes' : 'no'}\n`);

  let skipped = 0;
  let downloaded = 0;
  let failures = 0;

  for (const core of CORES) {
    const base = `${core}-wasm`;
    for (const ext of ['.js', '.wasm']) {
      const filename = base + ext;
      const url = CDN_BASE + filename;
      const dest = path.join(CORES_DIR, filename);
      try {
        const existed = !FORCE && fs.existsSync(dest);
        await downloadFile(url, dest);
        if (existed) {
          skipped++;
        } else {
          downloaded++;
        }
      } catch (err) {
        console.warn(`  WARN  ${filename}: ${err.message}`);
        failures++;
      }
    }
  }

  console.log(`\nResults: ${downloaded} downloaded, ${skipped} skipped, ${failures} failed.`);
  if (failures > 0) {
    console.warn('Some core binaries could not be downloaded (see warnings above).');
    process.exit(1);
  } else {
    console.log('All core binaries are present.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
