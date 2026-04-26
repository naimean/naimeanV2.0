#!/usr/bin/env node
// scripts/upload-cores-to-r2.js
//
// Uploads EmulatorJS core .data files to the Cloudflare R2 bucket `retroarc-cores`.
// Uses the Cloudflare REST API directly (no external dependencies — Node.js built-ins only).
//
// Prerequisites:
//   - .data files present under public/assets/retroarc/cores/
//     (run node scripts/download-ejs-cores.js first if needed)
//   - CLOUDFLARE_API_TOKEN env var with R2:Write permission on the bucket
//   - CLOUDFLARE_ACCOUNT_ID env var
//
// Usage:
//   node scripts/upload-cores-to-r2.js
//
// Set FORCE=1 to re-upload even if the file is already present.

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORES_DIR = path.join(__dirname, '..', 'public', 'assets', 'retroarc', 'cores');
const BUCKET = 'retroarc-cores';
const FORCE = process.env.FORCE === '1';

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!API_TOKEN || !ACCOUNT_ID) {
  console.error('Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set.');
  process.exit(1);
}

// All cores used by the arcade (must match the .data files in CORES_DIR).
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
 * Checks whether an object already exists in the R2 bucket via HEAD request.
 * Returns true if the object exists, false otherwise.
 */
function objectExists(key) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`,
      method: 'HEAD',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
      },
    };
    const req = https.request(options, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

/**
 * Uploads a single file to R2 via the Cloudflare REST API (PUT).
 * Returns a promise that resolves when the upload is complete.
 */
function uploadFile(key, localPath) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(localPath);
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          const kb = Math.round(fileBuffer.length / 1024);
          console.log(`  ok    ${key} (${kb} KB)`);
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode} for ${key}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

async function main() {
  console.log(`Uploading EmulatorJS cores to R2 bucket: ${BUCKET}`);
  console.log(`Source directory:  ${CORES_DIR}`);
  console.log(`Force re-upload:   ${FORCE ? 'yes' : 'no'}\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const core of CORES) {
    const filename = `${core}-wasm.data`;
    const localPath = path.join(CORES_DIR, filename);

    if (!fs.existsSync(localPath)) {
      console.warn(`  MISSING  ${filename} — run download-ejs-cores.js first`);
      failed++;
      continue;
    }

    if (!FORCE && await objectExists(filename)) {
      console.log(`  skip  ${filename} (already in R2)`);
      skipped++;
      continue;
    }

    try {
      await uploadFile(filename, localPath);
      uploaded++;
    } catch (err) {
      console.error(`  FAIL  ${filename}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All cores are present in R2.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
