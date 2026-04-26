#!/usr/bin/env node
// scripts/download-ejs-cores.js
//
// Downloads / refreshes the EmulatorJS core .data files for every system
// used by the arcade.  In EmulatorJS 4.x the .data file is the complete core
// (WASM binary + metadata bundled together); there are no separate .js/.wasm
// files to fetch.
//
// Both the standard (-wasm.data) and legacy (-legacy-wasm.data) variants are
// downloaded.  EmulatorJS selects the legacy variant on browsers where WebGL2
// is unavailable (common on mobile/iOS under memory pressure).  Without the
// legacy files in R2, EmulatorJS falls back to the external CDN which can be
// slow or blocked on mobile networks.
//
// The .data files are gitignored; they are downloaded in CI and uploaded to R2.
//
// Usage:
//   node scripts/download-ejs-cores.js
//
// Files are saved to public/assets/retroarch/cores/.  Existing files are
// skipped so re-runs are fast.  Set FORCE=1 to re-download even if the file
// exists.

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORES_DIR = path.join(__dirname, '..', 'public', 'assets', 'retroarch', 'cores');
const CDN_BASE = 'https://cdn.emulatorjs.org/stable/data/cores/';
const FORCE = process.env.FORCE === '1';

// All cores currently used by the arcade (must match the .data files in CORES_DIR).
// Scoped to pre-N64 hardware (systems released before the Nintendo 64, June 1996).
// mgba (GBA, 2001) and mupen64plus_next (N64, 1996) are intentionally excluded.
const CORES = [
  'a5200',         // Atari 5200 (1982)
  'beetle_vb',     // Virtual Boy (1995)
  'fceumm',        // NES/Famicom (1983)
  'gambatte',      // Game Boy (1989)
  'genesis_plus_gx', // Sega Genesis/Mega Drive (1988)
  'handy',         // Atari Lynx (1989)
  'mednafen_pce',  // TurboGrafx-16 / PC Engine (1987)
  'nestopia',      // NES/Famicom (1983)
  'picodrive',     // Sega Genesis / CD / 32X (1988–1994)
  'prosystem',     // Atari 7800 (1984)
  'snes9x',        // SNES / Super Famicom (1990)
  'stella2014',    // Atari 2600 (1977)
  'vice_x128',     // Commodore 128 (1985)
  'vice_x64',      // Commodore 64 (1982)
  'vice_x64sc',    // Commodore 64SC (1982)
  'vice_xpet',     // Commodore PET (1977)
  'vice_xplus4',   // Commodore Plus/4 (1984)
  'vice_xvic',     // Commodore VIC-20 (1980)
];

// EmulatorJS selects either the non-legacy or legacy core variant based on
// whether the browser supports WebGL2.  On mobile browsers (especially iOS)
// WebGL2 detection can fail even on capable hardware, causing EmulatorJS to
// request the -legacy-wasm.data file.  Both variants must be present in R2 so
// the fallback is served locally instead of hitting the CDN (which is slow /
// blocked on some mobile networks → 30-second timeout).
const CORE_VARIANTS = [
  '-wasm.data',        // WebGL2-capable browsers (non-legacy)
  '-legacy-wasm.data', // Legacy fallback for browsers without WebGL2
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
    for (const variant of CORE_VARIANTS) {
      const filename = `${core}${variant}`;
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

