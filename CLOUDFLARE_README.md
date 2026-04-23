# Cloudflare Infrastructure — Naimean

This document is the Cloudflare-side runbook for `naimean.com`. It explains what is deployed, what must exist in Cloudflare, how GitHub Actions fits in, and what is currently true about the runtime vs. what is still transitional.

---

## Current architecture

```text
GitHub repository
  ├─ public/                         -> GitHub Pages artifact + ASSETS binding
  ├─ src/index.js                    -> naimeanv2
  ├─ cloudflare-worker/worker.js     -> barrelrollcounter-worker
  └─ naimean-api/src/worker.js       -> naimean-api

Browser
  -> naimeanv2
      -> /get, /hit, /increment, /auth/*, /go/*, /layout
         -> barrelrollcounter-worker
      -> /api/*
         -> naimean-api
      -> everything else
         -> ASSETS / public/
```

### Why it is structured this way

Cloudflare is being used as the production control plane:

- the **router Worker** owns domain entrypoint behavior and security headers
- the **main backend Worker** owns secrets, cookies, redirects, and D1-backed features
- the **API Worker** isolates `/api/*` into its own deployable unit
- the **static site** stays simple and framework-free

---

## Workers and routes

## 1) `naimeanv2`

### Purpose

- primary entrypoint for `naimean.com`
- serves static assets from `public/`
- forwards selected routes to the main backend Worker
- stamps security headers on every response

### Config source

- `wrangler.toml`

### Current worker-first paths

- `/get`
- `/hit`
- `/increment`
- `/auth`
- `/go`
- `/layout`

### Bindings

| Binding | Type | Target |
|---|---|---|
| `ASSETS` | Assets | `./public` |
| `COUNTER` | Service | `barrelrollcounter-worker` |

### Important note

`run_worker_first` in `wrangler.toml` must match `PROXY_PATHS` in `src/index.js`. CI already checks this.

---

## 2) `barrelrollcounter-worker`

### Purpose

- rickroll counter API
- Discord OAuth and signed session cookies
- email registration/login
- layout override API
- authenticated `/go/*` redirects
- worker-side rate limiting and CORS handling

### Config source

- `cloudflare-worker/wrangler.toml`

### D1 binding

| Binding | Database |
|---|---|
| `DB` | `barrelroll-counter-db` |

### Current routes owned by this Worker

| Method | Path |
|---|---|
| `GET` | `/get` |
| `POST` | `/hit` |
| `POST` | `/increment` |
| `GET` | `/auth/session` |
| `POST` | `/auth/register` |
| `POST` | `/auth/emaillogin` |
| `GET` | `/auth/discord/login` |
| `GET` | `/auth/discord/callback` |
| `POST` | `/auth/logout` |
| `GET` | `/layout?page=<page>` |
| `POST` | `/layout` |
| `GET` | `/go/whiteboard` |
| `GET` | `/go/capex` |
| `GET` | `/go/snow` |
| `OPTIONS` | all of the above |

### Expected secrets / env vars

#### Required in practice

- `SESSION_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `OWNER_DISCORD_ID` *(needed if layout writes should be restricted to one Discord account)*
- `TOOL_URL_WHITEBOARD`
- `TOOL_URL_CAPEX`
- `TOOL_URL_SNOW`

#### Optional runtime configuration

- `CORS_ALLOWED_ORIGINS`
- `CORS_ALLOWED_ORIGIN_SUFFIXES`
- `CORS_ALLOW_PROD_ORIGIN_SUFFIXES`
- `APP_ENV`
- `ENVIRONMENT`
- `RATE_LIMIT_ENABLED`

#### Transitional / caveat item

- `ROUTER_SECRET` is still documented in comments and handoff docs, but the current committed runtime code does **not** read or validate it

---

## 3) `naimean-api`

### Purpose

- clean `/api/*` surface separate from the legacy fun-site backend
- currently exposes health and simple D1-backed data routes

### Config source

- `naimean-api/wrangler.toml`

### Route

- `naimean.com/api/*`

### Bindings

| Binding | Type | Target |
|---|---|---|
| `DB` | D1 | `naimean-db` |
| `KV` | Workers KV | namespace bound as `KV` |

### Current endpoints

| Method | Path | Current response |
|---|---|---|
| `GET` | `/api/health` | `{ "status": "ok", "timestamp": "..." }` |
| `GET` | `/api/data` | latest 50 `entries` rows |
| `POST` | `/api/data` | creates an entry, returns `{ "success": true }` |

### Important note

The KV binding exists today mostly as forward-looking infrastructure. The current committed API worker does not actively use it yet.

---

## Cloudflare resources expected

### Domains / routes

| Route / domain | Worker |
|---|---|
| `naimean.com` | `naimeanv2` |
| `www.naimean.com` | `naimeanv2` |
| `naimean.com/api/*` | `naimean-api` |

### Databases

| Database | Used by |
|---|---|
| `barrelroll-counter-db` | `barrelrollcounter-worker` |
| `naimean-db` | `naimean-api` |

### Additional storage

| Resource | Status |
|---|---|
| `KV` for `naimean-api` | required for deploy |
| `radley-gallery` R2 bucket | referenced in docs as existing, not currently bound in worker configs |
| `naimean-sessions` KV namespace | referenced in docs as existing, not currently bound in worker configs |

---

## GitHub -> Cloudflare deployment flow

Workflow file:

- `.github/workflows/github-pages.yml`

### What deploys today

- GitHub Pages artifact from `public/`
- `naimeanv2`
- `barrelrollcounter-worker`
- `naimean-api`

### GitHub secrets required

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Why this matters

If these are missing, `deploy-workers` fails before anything reaches Cloudflare. If Cloudflare-side resources are missing or mismatched, Wrangler deploys fail even if GitHub auth is correct.

---

## Current runtime caveats Felipe should know

### 1. `/layout` is now part of the live route surface
Some older docs only described `/get`, `/hit`, `/increment`, `/auth`, and `/go`. Current code also proxies `/layout`, and Cloudflare expectations should match that.

### 2. `ROUTER_SECRET` is a docs/runtime mismatch today
It is still called out in comments and handoff material, but the current main backend Worker does not consume it. Decide whether to implement it or stop presenting it as an active control.

### 3. Client-side tool links are still transitional
The backend supports `/go/*`, but the browser UI still contains direct hardcoded Whiteboard / CapEx / ServiceNow URLs in `public/script.js`. Operationally, that means Cloudflare-side redirect secrets are not yet the only path users can take.

### 4. `naimean-api` is in this repo and deploys from this repo
Some older wording implied it was external or separate. It lives under `naimean-api/` here and is deployed by the same GitHub Actions workflow.

### 5. Health-check payload shape should be documented correctly
Current `GET /api/health` returns `status` + `timestamp`, not the older `ok/service` shape some docs referenced.

---

## Cloudflare-side validation checklist

After resources are in place, verify:

- [ ] `naimean.com` loads the C64 homepage through `naimeanv2`
- [ ] `curl https://naimean.com/get` returns JSON with `value`
- [ ] `curl -X POST https://naimean.com/hit` increments successfully
- [ ] `curl https://naimean.com/auth/session` returns a non-500 JSON payload
- [ ] `curl https://naimean.com/auth/discord/login` redirects to Discord
- [ ] `curl 'https://naimean.com/layout?page=chapel'` returns JSON, even if empty
- [ ] `curl https://naimean.com/api/health` returns `{ "status": "ok", "timestamp": "..." }`
- [ ] the latest `deploy-workers` GitHub Actions run is green

---

## Local development notes

- the main site remains dependency-light and build-free
- `naimean-api/` does include a `package.json` for Wrangler
- local validation currently relies on `node --check` and `node --test`, not on a full lint/build toolchain

---

## Prioritized Cloudflare recommendation backlog

### P0 — immediate

- [ ] Put Cloudflare WAF managed rules and edge rate limits in front of `/hit`, `/increment`, `/auth/*`, `/layout`, and `/api/*`
- [ ] Decide whether `ROUTER_SECRET` should become a real worker-to-worker control or be removed from the documented security model
- [ ] Move all user-facing tool launches to `/go/*` so Cloudflare-side secrets become the single source of truth
- [ ] Add monitoring / Logpush / alerting for 5xx spikes on `naimeanv2`, `barrelrollcounter-worker`, and `naimean-api`
- [ ] Put Zero Trust or equivalent access controls in front of privileged internal tool flows

### P1 — next

- [ ] Create a staging route or workers.dev validation path for auth and D1 changes before merge-to-main
- [ ] Add Cloudflare-side smoke checks for `/layout` and `/api/health` to the deployment verification routine
- [ ] Align all handoff docs so routes, secrets, and payload shapes are consistent
- [ ] Decide whether the `naimean-api` KV binding should be used soon or removed until needed
- [ ] Add explicit D1 backup/export cadence and restore drills for both databases

### P2 — planned

- [ ] Add structured logging / request IDs / error grouping conventions across all Workers
- [ ] Split prod vs. preview configuration more cleanly if the Cloudflare footprint grows
- [ ] Add periodic infrastructure review to catch doc/config drift early
- [ ] Reassess whether some scene-configuration/state features should move into a clearer admin surface over time

---

_Last updated: 2026-04-23_
