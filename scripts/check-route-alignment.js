/**
 * check-route-alignment.js
 *
 * Verifies that:
 *   1. PROXY_PATHS in src/index.js and run_worker_first in wrangler.toml are
 *      exactly in sync (bidirectional check).
 *   2. The router worker declares the expected custom-domain routes.
 *   3. The naimean-api worker declares the expected /api/* route.
 *
 * Usage (from repo root):
 *   node scripts/check-route-alignment.js
 *
 * Exit 0 = in sync.  Exit 1 = drift detected (details written to stderr).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
const routerToml = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const apiToml = fs.readFileSync(path.join(root, 'naimean-api/wrangler.toml'), 'utf8');
const EXPECTED_ROUTER_ROUTES = ['naimean.com/*', 'www.naimean.com/*'];
const EXPECTED_API_ROUTES = ['naimean.com/api/*'];

const proxyMatch = src.match(/const PROXY_PATHS\s*=\s*\[([^\]]+)\]/);
if (!proxyMatch) {
  process.stderr.write('PROXY_PATHS not found in src/index.js\n');
  process.exit(1);
}

const workerFirstMatch = routerToml.match(/run_worker_first\s*=\s*\[([^\]]+)\]/);
if (!workerFirstMatch) {
  process.stderr.write('run_worker_first not found in wrangler.toml\n');
  process.exit(1);
}

const extract = (s) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const proxyPaths = extract(proxyMatch[1]);
const workerFirstPaths = extract(workerFirstMatch[1]);
// Each [[routes]] block is isolated by splitting on the next TOML section header.
const extractRoutePatterns = (toml) => toml
  .split(/\[\[routes\]\]/)
  .slice(1)
  .map((section) => {
    const currentSection = section.split(/\n\[[^\n]*\]/)[0];
    const match = currentSection.match(/pattern\s*=\s*"([^"]+)"/);
    return match ? match[1] : '';
  })
  .filter(Boolean);
const routerRoutes = extractRoutePatterns(routerToml);
const apiRoutes = extractRoutePatterns(apiToml);

let ok = true;
for (const p of proxyPaths) {
  if (!workerFirstPaths.includes(p)) {
    process.stderr.write('PROXY_PATHS has "' + p + '" but run_worker_first does not\n');
    ok = false;
  }
}
for (const p of workerFirstPaths) {
  if (!proxyPaths.includes(p)) {
    process.stderr.write('run_worker_first has "' + p + '" but PROXY_PATHS does not\n');
    ok = false;
  }
}

for (const route of EXPECTED_ROUTER_ROUTES) {
  if (!routerRoutes.includes(route)) {
    process.stderr.write('wrangler.toml is missing router route "' + route + '"\n');
    ok = false;
  }
}

for (const route of EXPECTED_API_ROUTES) {
  if (!apiRoutes.includes(route)) {
    process.stderr.write('naimean-api/wrangler.toml is missing API route "' + route + '"\n');
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log('Route alignment OK: ' + proxyPaths.join(', '));
console.log('Router routes OK: ' + EXPECTED_ROUTER_ROUTES.join(', '));
console.log('API routes OK: ' + EXPECTED_API_ROUTES.join(', '));
