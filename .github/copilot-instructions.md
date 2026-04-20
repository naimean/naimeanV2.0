# Copilot Instructions for naimeanV2.0

## Project overview
This is a personal website deployed as a **Cloudflare Worker** (edge router) backed by a **GitHub Pages** static site and a separate **D1-powered counter/auth worker**.

- `src/index.js` — edge router worker: forwards `/get`, `/hit`, `/increment`, `/auth`, `/go` to the `barrelrollcounter-worker` service; serves everything else from the `ASSETS` binding (GitHub Pages static files). Applies security headers to every response.
- `cloudflare-worker/worker.js` — the counter/auth worker: uses a D1 SQLite database (`barrelroll-counter-db`).
- `public/` — static HTML, CSS and JS files served via GitHub Pages (and the ASSETS binding in Cloudflare). No framework, no bundler — plain vanilla HTML/CSS/JS.
- `wrangler.toml` — config for the edge router worker.
- `cloudflare-worker/wrangler.toml` — config for the counter/auth worker.

## Stack
- **Runtime**: Cloudflare Workers (V8 isolates), Node.js compat mode
- **Database**: Cloudflare D1 (SQLite at the edge)
- **Frontend**: Vanilla HTML/CSS/JS — no React, no Vue, no bundler, no TypeScript
- **Deployment**: `wrangler deploy` for workers; GitHub Pages for static assets
- **Tests**: Node.js built-in test runner (`node --test cloudflare-worker/worker.test.js`)
- **Lint/syntax check**: `node --check <file>` (no ESLint or Prettier configured)
- **No package.json / no npm dependencies** — the project has zero Node module dependencies

## Code conventions
- All JS uses **ES module syntax** (`import`/`export default`)
- No TypeScript — plain `.js` files only
- No build step; what you write is what gets deployed
- Security headers are applied at the edge in `src/index.js` — do not add inline security logic to individual HTML pages
- CSP strings are defined as constants at the top of `src/index.js`; update them there, not inline
- Cache-Control logic lives in `applyEdgeSecurityHeaders()` — keep it there
- `PROXY_PATHS` in `src/index.js` and `run_worker_first` in `wrangler.toml` must stay in sync

## What "good code" looks like here
- Minimal surface area — no new dependencies, no framework churn
- Security-first: maintain strict CSP, security headers, and input validation in `cloudflare-worker/worker.js`
- Keep `src/index.js` as a thin routing/header layer — business logic belongs in `cloudflare-worker/worker.js`
- Tests go in `cloudflare-worker/worker.test.js` using `node:test` and `node:assert`
- HTML pages in `public/` should not include inline `<script>` tags that bypass CSP; use `public/script.js` for shared logic

## How to run tests
```sh
node --test cloudflare-worker/worker.test.js
```

## How to check JS syntax
```sh
node --check src/index.js
node --check cloudflare-worker/worker.js
node --check public/script.js
node --check public/diagnostics.js
```

## Deployment (not automated — requires Cloudflare credentials)
```sh
# Edge router
wrangler deploy

# Counter/auth worker (from cloudflare-worker/)
cd cloudflare-worker && wrangler deploy
```
