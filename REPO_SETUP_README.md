# Naimean Repo Setup & Cloudflare Interaction Guide

This guide is derived from `CLOUDFLARE_README.md` and maps how this repository is set up, how key functions interact, and how Cloudflare routes requests.

## 1) Repository Setup

### Core files
- Frontend/static assets: `/public`
- Frontend logic: `/public/script.js`
- Chapel page logic: `/public/chapel.html`
- Front router Worker entry: `/src/index.js`
- Front router Worker config: `/wrangler.toml`
- Counter backend Worker: `/cloudflare-worker/worker.js`
- Counter backend Worker config: `/cloudflare-worker/wrangler.toml`
- Counter schema: `/cloudflare-worker/schema.sql`

### Cloudflare bindings in this repo
- `ASSETS` (static files from `/public`)
- `COUNTER` (service binding to `barrelrollcounter-worker`)
- `DB` (D1 binding in backend worker config)

## 2) Cloudflare Runtime Interaction

### Edge routing flow
1. Browser requests `https://naimean.com/...`
2. `naimeanv2` Worker (`/src/index.js`) receives the request.
3. If path starts with `/get`, `/hit`, or `/increment`, request is forwarded to `env.COUNTER.fetch(request)`.
4. All other paths are served from `env.ASSETS.fetch(request)` (the static site in `/public`).

## 3) Function-Level Interaction Map

### Router Worker (`/src/index.js`)
- `fetch(request, env, ctx)`:
  - Uses `PROXY_PATHS = ["/get", "/hit", "/increment"]`
  - Proxies counter API paths to backend service binding (`COUNTER`)
  - Serves static files via `ASSETS` for non-proxy paths

### Backend Worker (`/cloudflare-worker/worker.js`)
- `fetch(request, env)`:
  - Recognizes counter routes (`/get`, `/hit`, `/increment`)
  - Handles CORS preflight (`OPTIONS`)
  - Returns JSON responses and no-cache headers
- `getCount(db)`:
  - Reads current counter value from D1 (`rickroll_counter`)
- `incrementCount(db)`:
  - Atomically increments counter in D1 and returns new value
- `corsHeaders(origin)` / `isAllowedOrigin(origin)`:
  - Applies origin allowlist logic for browser requests
- `jsonResponse(data, status, origin)`:
  - Standardizes JSON output and response headers

### Frontend (`/public/script.js`)
- `buildRickrollApiUrls(pathname)`:
  - Builds endpoint candidates: current origin first, legacy workers.dev fallback second
- `fetchRickrollCount(urls, options)`:
  - Tries each candidate endpoint until one succeeds
- `renderDiscordRickrollCount()`:
  - Reads remote `/get` value first, local fallback second
- `incrementRickrollCount()`:
  - Increments via `/increment`, then updates local display/cache logic
- `resolveDiscordInviteUrl()`:
  - Calls Discord widget API directly (`discord.com`) to resolve invite links

### Chapel page (`/public/chapel.html`)
- `buildRickrollApiUrls(pathname)`:
  - Same endpoint candidate strategy as `script.js`
- `fetchRickrollCount(urls)`:
  - Requests `/get` and parses numeric/JSON responses
- `renderRickrollCount()`:
  - Renders local fallback first, then remote value
- `resolveDiscordInviteUrl()`:
  - Uses Discord widget API with timeout/abort behavior

## 4) Cloudflare Data & Infrastructure Touchpoints

- D1 table: `rickroll_counter` (seeded by `/cloudflare-worker/schema.sql`)
- Front Worker custom domains: `naimean.com`, `www.naimean.com` (per Cloudflare setup doc)
- Legacy fallback endpoint still used by frontend:
  - `https://barrelrollcounter-worker.naimean.workers.dev`

## 5) Deployment and Validation in this Repo

- Current GitHub Action (`.github/workflows/github-pages.yml`) validates required static assets and deploys `public/` to GitHub Pages.
- Cloudflare deployment guidance and secrets are documented in `CLOUDFLARE_README.md`.

