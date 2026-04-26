#!/usr/bin/env node
// scripts/upload-cores-to-r2.js
//
// Uploads EmulatorJS core .data files to the Cloudflare R2 bucket `retroarch-cores`.
// Uses the Cloudflare REST API directly (no external dependencies — Node.js built-ins only).
//
// Prerequisites:
//   - .data files present under public/assets/retroarch/cores/
//     (run node scripts/download-ejs-cores.js first if needed)
//   - CLOUDFLARE_API_TOKEN env var with R2:Write permission on the bucket
//   - CLOUDFLARE_ACCOUNT_ID env var
//
// Usage:
//   node scripts/upload-cores-to-r2.js
//
// Environment variables:
//   FORCE=1        Re-upload even if the file is already present.
//   PURGE=1        Delete ALL existing objects from retroarch-cores before uploading.
//                  Use this to replace previously unzipped (broken) cores with the
//                  correct 7z-compressed .data archives.
//   TYPO_BUCKET=   Name of a misnamed R2 bucket to purge and delete (e.g. a bucket
//                  created with a typo during a previous deploy). All objects in that
//                  bucket are deleted, then the bucket itself is deleted.

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORES_DIR = path.join(__dirname, '..', 'public', 'assets', 'retroarch', 'cores');
const BUCKET = 'retroarch-cores';
const FORCE = process.env.FORCE === '1';
const PURGE = process.env.PURGE === '1';
const TYPO_BUCKET = process.env.TYPO_BUCKET || '';

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!API_TOKEN || !ACCOUNT_ID) {
  console.error('Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set.');
  process.exit(1);
}

// All cores used by the arcade (must match the .data files in CORES_DIR).
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

// Both the non-legacy and legacy variant of each core are uploaded so that
// EmulatorJS can fall back to the legacy core on browsers without WebGL2
// (common on mobile/iOS) without hitting the external CDN.
const CORE_VARIANTS = [
  '-wasm.data',        // WebGL2-capable browsers (non-legacy)
  '-legacy-wasm.data', // Legacy fallback for browsers without WebGL2
];

/**
 * Lists all object keys in an R2 bucket, following pagination cursors.
 * Returns an array of key strings.
 */
function listObjects(bucket) {
  return new Promise((resolve, reject) => {
    const keys = [];
    function fetchPage(cursor) {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const options = {
        hostname: 'api.cloudflare.com',
        path: `/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${bucket}/objects${qs}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
        },
      };
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 404) {
            // Bucket does not exist — treat as empty (may have already been deleted).
            resolve(keys);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`listObjects HTTP ${res.statusCode}: ${body}`));
            return;
          }
          let parsed;
          try { parsed = JSON.parse(body); } catch (e) {
            reject(new Error(`listObjects: invalid JSON — ${e.message}`));
            return;
          }
          const result = parsed.result || {};
          const objects = result.objects || [];
          for (const obj of objects) {
            if (obj.key) keys.push(obj.key);
          }
          if (result.truncated && result.cursor) {
            fetchPage(result.cursor);
          } else {
            resolve(keys);
          }
        });
      });
      req.on('error', reject);
      req.end();
    }
    fetchPage(null);
  });
}

/**
 * Deletes a single object from an R2 bucket.
 */
function deleteObject(bucket, key) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${bucket}/objects/${encodeURIComponent(key)}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve();
        } else {
          reject(new Error(`deleteObject HTTP ${res.statusCode} for ${key}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Deletes an R2 bucket. The bucket must be empty before deletion.
 * Treats 404 as success (bucket was already deleted).
 */
function deleteBucket(bucket) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${bucket}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 204 || res.statusCode === 404) {
          // 404 means the bucket was already deleted — treat as success.
          resolve();
        } else {
          reject(new Error(`deleteBucket HTTP ${res.statusCode} for ${bucket}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Purges all objects from a bucket, then deletes the bucket itself.
 * If the bucket does not exist (404), logs a notice and returns without error.
 */
async function purgeAndDeleteBucket(bucket) {
  console.log(`\nPurging all objects from bucket: ${bucket}`);
  const keys = await listObjects(bucket);
  if (keys.length === 0) {
    console.log(`  (bucket is already empty or does not exist)`);
  }
  for (const key of keys) {
    await deleteObject(bucket, key);
    console.log(`  deleted  ${key}`);
  }
  console.log(`Deleting bucket: ${bucket}`);
  await deleteBucket(bucket);
  console.log(`  bucket ${bucket} deleted.\n`);
}

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
  console.log(`Force re-upload:   ${FORCE ? 'yes' : 'no'}`);
  console.log(`Purge before upload: ${PURGE ? 'yes' : 'no'}`);
  if (TYPO_BUCKET) {
    console.log(`Typo bucket to delete: ${TYPO_BUCKET}`);
  }
  console.log('');

  // Step 1: If TYPO_BUCKET is set, purge all objects from it and delete it.
  // purgeAndDeleteBucket handles the 404 case (bucket already gone) gracefully.
  if (TYPO_BUCKET) {
    await purgeAndDeleteBucket(TYPO_BUCKET);
  }

  // Step 2: If PURGE=1, delete all existing objects from retroarch-cores so stale or
  // incorrectly unzipped files are completely removed before the correct versions are
  // uploaded.
  if (PURGE) {
    console.log(`Purging all existing objects from bucket: ${BUCKET}`);
    let purgeKeys;
    try {
      purgeKeys = await listObjects(BUCKET);
    } catch (err) {
      console.error(`Failed to list objects in ${BUCKET}: ${err.message}`);
      process.exit(1);
    }
    if (purgeKeys.length === 0) {
      console.log('  (bucket is already empty)');
    }
    for (const key of purgeKeys) {
      try {
        await deleteObject(BUCKET, key);
        console.log(`  purged  ${key}`);
      } catch (err) {
        console.error(`  FAIL purge ${key}: ${err.message}`);
        process.exit(1);
      }
    }
    console.log(`Purge complete (${purgeKeys.length} objects removed).\n`);
  }

  // Step 3: Upload the correct (7z-compressed) .data core archives.
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const core of CORES) {
    for (const variant of CORE_VARIANTS) {
      const filename = `${core}${variant}`;
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
