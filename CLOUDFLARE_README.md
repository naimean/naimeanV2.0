# Cloudflare Infrastructure — Naimean

Account: `Naimean@hotmail.com's Account` (`85d52ed1ca1933df067bf0c167d65a84`)

This is the Cloudflare-side runbook for `naimean.com`. It mirrors the current production resource inventory, route layout, storage bindings, secrets expectations, and GitHub Actions deployment behavior.

---

## Architecture overview

```text
Browser
  │
  ▼
naimean.com / www.naimean.com / uploads.naimean.com
  │
  ▼
┌─────────────────────────────┐
│  naimeanv2 (edge router)    │
│  Route: naimean.com/*       │
│  Route: www.naimean.com/*   │
│  Route: uploads.naimean.com/* │
│                             │
│  PROXY_PATHS:               │
│    /get  /hit  /increment   │
│    /auth  /go  /layout      │
│                             │
│  path in PROXY_PATHS        │──▶ env.COUNTER ──▶ barrelrollcounter-worker
│  anything else              │──▶ env.ASSETS  ──▶ static assets from public/
└─────────────────────────────┘

naimean.com/api/*
  │
  ▼
┌─────────────────────────────┐
│  naimean-api (REST API)     │
│  Route: naimean.com/api/*   │
│                             │
│  GET  /api/health           │
│  GET  /api/data             │
│  POST /api/data             │
└─────────────────────────────┘
```

Key principle: `naimeanv2` stays intentionally thin. It handles routing, security headers, and static asset serving; business logic lives in `barrelrollcounter-worker` and `naimean-api`.

---

## Workers

## 1) `naimeanv2` — edge router

| Property | Value |
|---|---|
| Name | `naimeanv2` |
| Role | edge router / traffic cop |
| Source | `src/index.js` |
| Config | `wrangler.toml` |
| Routes | `naimean.com/*`, `www.naimean.com/*`, `uploads.naimean.com/*` (declared in root `wrangler.toml`) |
| Last deployed | 2026-04-23 |

### Bindings

| Binding | Type | Target |
|---|---|---|
| `ASSETS` | Worker Assets | static files from `public/` |
| `COUNTER` | Service binding | `barrelrollcounter-worker` |

### Behavior

- if the request path matches `PROXY_PATHS` (`/get`, `/hit`, `/increment`, `/auth`, `/go`, `/layout`), forward to `env.COUNTER`
- otherwise, serve from `env.ASSETS`
- apply CSP and security headers to every response
- attempt `.html` fallback for extensionless routes

### Critical invariant

`PROXY_PATHS` in `src/index.js` **must** stay aligned with `run_worker_first` in `wrangler.toml`. CI enforces this with `scripts/check-route-alignment.js`.

---

## 2) `barrelrollcounter-worker` — main backend

| Property | Value |
|---|---|
| Name | `barrelrollcounter-worker` |
| Role | auth, counter, layout, tool redirects |
| Source | `cloudflare-worker/worker.js` |
| Config | `cloudflare-worker/wrangler.toml` |
| Routes | none; called through the `COUNTER` service binding |
| Last deployed | 2026-04-23 |

### Binding

| Binding | Type | Target |
|---|---|---|
| `DB` | D1 | `barrelroll-counter-db` (`22277fbe-031d-4cad-8937-245309e981cd`) |

### Endpoint surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/get` | read rickroll counter |
| `POST` | `/hit` | increment counter |
| `POST` | `/increment` | increment counter alias |
| `GET` | `/auth/session` | check active session |
| `POST` | `/auth/register` | email registration |
| `POST` | `/auth/emaillogin` | email login |
| `GET` | `/auth/discord/login` | start Discord OAuth PKCE flow |
| `GET` | `/auth/discord/callback` | Discord OAuth callback |
| `POST` | `/auth/logout` | CSRF-protected logout |
| `GET` | `/go/whiteboard` | authenticated redirect |
| `GET` | `/go/capex` | authenticated redirect |
| `GET` | `/go/snow` | authenticated redirect |
| `GET` | `/layout` | get layout overrides |
| `POST` | `/layout` | save layout overrides |

### Secrets status

| Secret | Status | Purpose |
|---|---|---|
| `SESSION_SECRET` | ✅ set | HMAC signing for session cookies |
| `DISCORD_CLIENT_ID` | ✅ set | Discord OAuth client ID |
| `DISCORD_CLIENT_SECRET` | ✅ set | Discord OAuth client secret |
| `DISCORD_REDIRECT_URI` | ✅ set | must match `https://naimean.com/auth/discord/callback` |
| `OWNER_DISCORD_ID` | optional | restricts `POST /layout` to one Discord account when set |
| `TOOL_URL_WHITEBOARD` | optional | overrides the built-in HTTPS fallback for `/go/whiteboard` |
| `TOOL_URL_CAPEX` | optional | overrides the built-in HTTPS fallback for `/go/capex` |
| `TOOL_URL_SNOW` | optional | overrides the built-in HTTPS fallback for `/go/snow` |
| `BACKDOOR_ADMIN_KEY` | operational/out-of-band | not consumed by current repo code |
| `DISCORD_WEBHOOK_URL` | operational/out-of-band | not consumed by current repo code |

`SESSION_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_REDIRECT_URI` are the required runtime secrets in repo code. `OWNER_DISCORD_ID` and `TOOL_URL_*` are optional behavior overrides.

---

## 3) `naimean-api` — standalone `/api/*` worker

| Property | Value |
|---|---|
| Name | `naimean-api` |
| Role | standalone REST API |
| Source | `naimean-api/src/worker.js` |
| Config | `naimean-api/wrangler.toml` |
| Routes | `naimean.com/api/*` |
| Last deployed | 2026-04-23 |

### Bindings

| Binding | Type | Target |
|---|---|---|
| `DB` | D1 | `naimean-db` (`0871f90d-f7e3-467a-a1f9-4e74ac8aef42`) |
| `KV` | KV namespace | `naimean-kv` (`dff7175059ce478eab8c910949ca330f`) |

### Runtime auth model

`naimean-api/src/worker.js` does not consume `API_TOKEN`. As currently implemented in the repo, `/api/*` is public and relies on validation plus security headers rather than token auth.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | health check |
| `GET` | `/api/data` | fetch entries |
| `POST` | `/api/data` | create entry |

---

## Storage resources

## D1 databases

### `barrelroll-counter-db`

| Property | Value |
|---|---|
| ID | `22277fbe-031d-4cad-8937-245309e981cd` |
| Binding | `DB` on `barrelrollcounter-worker` |
| Schema | `cloudflare-worker/schema.sql` |

Tables:

- `rickroll_counter`
- `layout_overrides`
- `registered_users`

Initialize or restore with:

```bash
wrangler d1 execute barrelroll-counter-db --file=cloudflare-worker/schema.sql
```

### `naimean-db`

| Property | Value |
|---|---|
| ID | `0871f90d-f7e3-467a-a1f9-4e74ac8aef42` |
| Binding | `DB` on `naimean-api` |
| Schema | `naimean-api/migrations/0000_create_entries.sql` |

Table:

- `entries`

Initialize or restore with:

```bash
wrangler d1 execute naimean-db --file=naimean-api/migrations/0000_create_entries.sql
```

## KV namespaces

| Namespace | ID | Binding | Status |
|---|---|---|---|
| `naimean-kv` | `dff7175059ce478eab8c910949ca330f` | `KV` on `naimean-api` | required for deploy |
| `naimean-sessions` | `8d766501be57403ab84a9f3a3112e8d5` | none | undocumented legacy resource; current usage unknown |

---

## Route map

| Pattern | Worker | Priority |
|---|---|---|
| `naimean.com/api/*` | `naimean-api` | higher / more specific |
| `naimean.com/*` | `naimeanv2` | lower / catch-all |
| `www.naimean.com/*` | `naimeanv2` | lower / catch-all |
| `uploads.naimean.com/*` | `naimeanv2` | lower / catch-all |

Cloudflare should naturally pick the more specific `/api/*` route first, but if routes are ever recreated, verify the specific API route still wins.

Critical: `naimean.com` must **not** point directly at GitHub Pages in production. If it bypasses `naimeanv2`, auth, proxy, `/layout`, and `/go/*` flows silently break.

---

## GitHub Actions -> Cloudflare integration

Workflow file:

- `.github/workflows/github-pages.yml`

### Required GitHub Actions secrets

| Secret | Value | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with Cloudflare deploy permissions | deploys all three Workers |
| `CLOUDFLARE_ACCOUNT_ID` | `85d52ed1ca1933df067bf0c167d65a84` | targets the correct account |

### Required API token permissions

| Permission | Resource | Access |
|---|---|---|
| Workers Scripts | Account | Edit |
| D1 | Account | Edit |
| Workers KV Storage | Account | Edit |
| Account Settings | Account | Read |

### CI/CD flow

On push, GitHub Actions currently does the following:

1. syntax checks with `node --check`
2. tests with `node --test cloudflare-worker/worker.test.js`
3. validates all three `wrangler.toml` files
4. verifies route alignment with `scripts/check-route-alignment.js`
5. deploys `public/` to GitHub Pages
6. deploys Workers from:
   - repo root -> `naimeanv2`
   - `cloudflare-worker/` -> `barrelrollcounter-worker`
   - `naimean-api/` -> `naimean-api`

### What GitHub Actions does not manage

- D1 schema migrations
- Worker secrets
- manual post-deploy validation
- DNS records

---

## Manual deployment / recovery procedure

### Deploy the Workers

```bash
cd /path/to/repo/root
npx wrangler deploy

cd cloudflare-worker
npx wrangler deploy

cd ../naimean-api
npx wrangler deploy
```

### First-time database setup

```bash
npx wrangler d1 execute barrelroll-counter-db --file=cloudflare-worker/schema.sql
npx wrangler d1 execute naimean-db --file=naimean-api/migrations/0000_create_entries.sql
```

### Secrets to set manually

```bash
# barrelrollcounter-worker
npx wrangler secret put SESSION_SECRET
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_REDIRECT_URI
# Optional overrides:
npx wrangler secret put OWNER_DISCORD_ID
npx wrangler secret put TOOL_URL_WHITEBOARD
npx wrangler secret put TOOL_URL_CAPEX
npx wrangler secret put TOOL_URL_SNOW
```

---

## Security model snapshot

### Headers applied by `naimeanv2`

- HTML responses get the document CSP, Google Fonts allowances, and the looser rules needed by current pages
- non-HTML responses get the strict API CSP: `default-src 'none'`
- cache behavior is handled centrally at the router layer

### Auth handled by `barrelrollcounter-worker`

| Mechanism | Details |
|---|---|
| Session cookies | HMAC-signed with `SESSION_SECRET` |
| Discord OAuth | OAuth2 + PKCE + signed temporary OAuth cookie |
| Email auth | PBKDF2 password hashing in `registered_users` |
| CSRF | logout requires CSRF validation |
| Rate limiting | applied to auth and write endpoints |

### Headers handled by `naimean-api`

- strict API CSP (`default-src 'none'`)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy` deny list
- `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
- HSTS on HTTPS responses

---

## Known issues and watch-outs

1. `ROUTER_SECRET` is still documented in some older material but is not consumed by current runtime code
2. `naimean-sessions` exists but is unbound and undocumented
3. `BACKDOOR_ADMIN_KEY` and `DISCORD_WEBHOOK_URL` are tracked operationally, but they are not consumed by current repo code
4. D1 API metadata reportedly showed `num_tables: 0`; verify actual tables directly if there is any doubt
5. `/layout` is live and must always be treated as a required proxied route
6. `/go/*` now routes through the backend worker from the homepage, so frontend and backend behavior are aligned

Recommended verification for the D1 metadata concern:

```bash
wrangler d1 execute barrelroll-counter-db --command "SELECT name FROM sqlite_master WHERE type='table'"
wrangler d1 execute naimean-db --command "SELECT name FROM sqlite_master WHERE type='table'"
```

---

## Recommended hardening backlog

### P0 — immediate

- [ ] decide whether `OWNER_DISCORD_ID` should be configured for stricter `/layout` write access
- [ ] set `TOOL_URL_*` only if the default `/go/*` destinations should be overridden
- [ ] enable Cloudflare WAF managed rules on the `naimean.com` zone
- [ ] add edge rate limits for `/hit`, `/increment`, `/auth/*`, `/layout`, and `/api/*`
- [ ] put Zero Trust in front of privileged/internal tool destinations
- [ ] add Worker logging, error alerts, and failure visibility

### P1 — next

- [ ] document `BACKDOOR_ADMIN_KEY` and `DISCORD_WEBHOOK_URL` everywhere handoff docs inventory secrets
- [ ] verify both D1 schemas directly and record the result in the ops validation flow
- [ ] decide whether `naimean-sessions` should be rebound, repurposed, or deleted
- [ ] keep root and API worker route declarations in `wrangler.toml` aligned with the Cloudflare dashboard state
- [ ] add a documented D1 backup/export cadence for both databases
- [ ] keep all Cloudflare/GitHub handoff docs aligned on routes, payloads, and secret inventory

### P2 — planned

- [ ] add structured logging and request IDs across Workers
- [ ] maintain a periodic infrastructure review to catch route/doc/config drift early
- [ ] consider a protected staging or preview route for auth and D1 changes

---

## Quick reference: what lives where

| Concern | Cloudflare resource | GitHub source |
|---|---|---|
| Edge routing | `naimeanv2` | `src/index.js` + `wrangler.toml` |
| Auth + counter + layout | `barrelrollcounter-worker` | `cloudflare-worker/worker.js` + `cloudflare-worker/wrangler.toml` |
| REST API | `naimean-api` | `naimean-api/src/worker.js` + `naimean-api/wrangler.toml` |
| Counter/users/layout data | `barrelroll-counter-db` | `cloudflare-worker/schema.sql` |
| Entries data | `naimean-db` | `naimean-api/migrations/0000_create_entries.sql` |
| KV storage | `naimean-kv` | `naimean-api/wrangler.toml` |
| Static site | GitHub Pages + Worker Assets | `public/` |
| Route config | Worker routes in Cloudflare | each `wrangler.toml` |
| Secrets | Cloudflare secret store | not committed in repo |
| CI/CD | GitHub Actions | `.github/workflows/github-pages.yml` |

---

_Last updated: 2026-04-23_
