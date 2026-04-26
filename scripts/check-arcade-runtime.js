/**
 * scripts/check-arcade-runtime.js
 *
 * Verifies that all required arcade runtime files exist locally and that the
 * manifest/systems data is internally consistent.
 *
 * Checks:
 *   1. Required static files exist under public/
 *   2. Every system key in manifest.json exists in systems.json
 *   3. Every ROM path listed in manifest.json points to a local file
 *   4. Every system with ROMs has a non-null core configured
 *   5. Warns when systems are configured but have no ROMs
 *   6. Warns when GBA / N64 have null cores (expected experimental gap)
 *
 * Usage (from repo root):
 *   node scripts/check-arcade-runtime.js
 *
 * Exit 0 = OK (warnings are printed but do not fail).
 * Exit 1 = one or more hard failures detected.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const root       = path.resolve(__dirname, '..');
const publicDir  = path.join(root, 'public');
const romsDir    = path.join(publicDir, 'assets', 'roms');
const systemsPath = path.join(publicDir, 'assets', 'arcade', 'systems.json');
const manifestPath = path.join(publicDir, 'assets', 'roms', 'manifest.json');

// ── Hard-required files ──────────────────────────────────────────────────────

const REQUIRED_FILES = [
  path.join(publicDir, 'assets', 'retroarch', 'loader.js'),
  path.join(publicDir, 'assets', 'retroarch', 'emulator.min.js'),
  path.join(publicDir, 'assets', 'retroarch', 'emulator.min.css'),
  manifestPath,
  systemsPath,
  path.join(publicDir, 'arcade-shell.html'),
];

// ── Helpers ──────────────────────────────────────────────────────────────────

let failCount = 0;
let warnCount = 0;

function fail(msg) {
  process.stderr.write('[FAIL] ' + msg + '\n');
  failCount++;
}

function warn(msg) {
  process.stdout.write('[WARN] ' + msg + '\n');
  warnCount++;
}

function ok(msg) {
  process.stdout.write('[ OK ] ' + msg + '\n');
}

// ── 1. Required files ────────────────────────────────────────────────────────

for (const f of REQUIRED_FILES) {
  if (fs.existsSync(f)) {
    ok(path.relative(root, f));
  } else {
    fail('Missing required file: ' + path.relative(root, f));
  }
}

// ── 2. Load JSON configs ─────────────────────────────────────────────────────

let systems  = null;
let manifest = null;

try {
  systems = JSON.parse(fs.readFileSync(systemsPath, 'utf8'));
  ok('systems.json parsed — ' + Object.keys(systems).length + ' systems');
} catch (err) {
  fail('Could not parse systems.json: ' + err.message);
}

try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  ok('manifest.json parsed — ' + Object.keys(manifest).length + ' entries');
} catch (err) {
  fail('Could not parse manifest.json: ' + err.message);
}

// ── 3–6. Cross-validation ────────────────────────────────────────────────────

if (systems && manifest) {

  // 3. Every manifest system key must exist in systems.json
  for (const systemId of Object.keys(manifest)) {
    if (!systems[systemId]) {
      fail('manifest.json has system "' + systemId + '" but systems.json does not');
    }
  }

  // 4–6. Per-system checks
  for (const systemId of Object.keys(systems)) {
    const cfg  = systems[systemId];
    const roms = Array.isArray(manifest[systemId])
      ? manifest[systemId].filter(function(r) { return r && typeof r === 'string'; })
      : [];

    // 5. Warn: system has no ROMs
    if (roms.length === 0) {
      warn('System "' + systemId + '" has no ROMs in manifest.json');
    }

    // 6. Warn: GBA / N64 null cores are expected but flagged
    if ((systemId === 'gba' || systemId === 'n64') && !cfg.core) {
      warn(systemId.toUpperCase() + ' core is null — experimental system, skipping core check');
    }

    if (roms.length > 0) {
      // 4. System with ROMs must have a non-null core
      if (!cfg.core || typeof cfg.core !== 'string') {
        fail('System "' + systemId + '" has ' + roms.length + ' ROM(s) but core is null in systems.json');
      }

      // 3b. Each ROM file must exist locally
      for (const romFile of roms) {
        const romPath = path.join(romsDir, systemId, romFile);
        if (!fs.existsSync(romPath)) {
          fail('ROM not found locally: ' + path.relative(root, romPath));
        }
      }
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

process.stdout.write('\n');
process.stdout.write('Warnings: ' + warnCount + '\n');
process.stdout.write('Failures: ' + failCount + '\n');

if (failCount > 0) {
  process.stderr.write('\nArcade runtime check FAILED — ' + failCount + ' error(s) found.\n');
  process.exit(1);
}

process.stdout.write('Arcade runtime check OK.\n');
