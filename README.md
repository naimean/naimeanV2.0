# Naimean V2.0

A Cloudflare-first personal website: static scene pages served through an edge router Worker, backed by a counter/auth/layout Worker and a separate `/api/*` Worker.

> **He boiled for our sins.**

---

## What this repository is

This repo is four production pieces living together:

1. **`naimeanv2`** — the edge router Worker in `src/index.js`
2. **`barrelrollcounter-worker`** — the main backend Worker in `cloudflare-worker/worker.js`
3. **`naimean-api`** — the standalone API Worker in `naimean-api/src/worker.js`
4. **`public/`** — the static scene-based site served through GitHub Pages and the `ASSETS` binding

The split is intentional: the static site stays lightweight, while secrets, cookies, auth, storage, and protected redirects stay in Workers.

---

## Production architecture

```text
Browser
  │
  ▼
naimean.com / www.naimean.com
  │
  ▼
naimeanv2
  ├─ /get, /hit, /increment, /auth/*, /go/*, /layout -> barrelrollcounter-worker
  ├─ /api/*                                           -> naimean-api
  └─ everything else                                  -> ASSETS -> public/
```

### Repo-managed routes

- `naimean.com/*` -> `naimeanv2`
- `www.naimean.com/*` -> `naimeanv2`
- `naimean.com/api/*` -> `naimean-api`

### Critical deployment rule

`naimean.com` must not point directly at GitHub Pages in production. If Cloudflare routing is bypassed, auth, `/layout`, `/go/*`, and proxied backend routes silently break.

---

## Repository map

| Path | Role | Why it matters |
|---|---|---|
| `src/index.js` | edge router Worker | controls security headers, proxy decisions, and static fallback behavior |
| `wrangler.toml` | edge router config | binds `ASSETS`, `COUNTER`, and `run_worker_first` |
| `cloudflare-worker/worker.js` | main backend Worker | auth, counter, layout, and `/go/*` redirects |
| `cloudflare-worker/schema.sql` | main D1 schema | creates `rickroll_counter`, `layout_overrides`, `registered_users` |
| `cloudflare-worker/wrangler.toml` | main backend config | binds `barrelroll-counter-db` |
| `naimean-api/src/worker.js` | API Worker | owns `/api/health` and `/api/data` |
| `naimean-api/migrations/0000_create_entries.sql` | API D1 schema | creates `entries` |
| `naimean-api/wrangler.toml` | API config | binds `naimean-db` and `naimean-kv` |
| `public/` | static website | all HTML, CSS, media, and browser JS |
| `.github/workflows/github-pages.yml` | CI/CD | validates syntax/tests/configs and deploys Pages + all Workers |
| `CLOUDFLARE_README.md` | Cloudflare infra runbook | canonical Cloudflare inventory and deploy notes |
| `FELIPE_HANDOFF.md` | ops handoff | practical setup and validation checklist |
| `naimean-README.md` | repository CV | high-context narrative inventory |
| `PLAN.md` | backlog | recommendations and follow-up priorities |
| `UPDATE.md` | change log | documentation refresh history |

---

## Cloudflare footprint

### Workers

| Worker | Role | Route |
|---|---|---|
| `naimeanv2` | edge router | `naimean.com/*`, `www.naimean.com/*` |
| `barrelrollcounter-worker` | counter/auth/layout/tool backend | service-bound from `naimeanv2` |
| `naimean-api` | standalone REST API | `naimean.com/api/*` |

### D1 databases

| Database | ID | Used by |
|---|---|---|
| `barrelroll-counter-db` | `22277fbe-031d-4cad-8937-245309e981cd` | `barrelrollcounter-worker` |
| `naimean-db` | `0871f90d-f7e3-467a-a1f9-4e74ac8aef42` | `naimean-api` |

### KV namespaces

| Namespace | ID | Status |
|---|---|---|
| `naimean-kv` | `dff7175059ce478eab8c910949ca330f` | bound to `naimean-api` |
| `naimean-sessions` | `8d766501be57403ab84a9f3a3112e8d5` | legacy/unbound; current usage unknown |

### Cloudflare account

- account name: `Naimean@hotmail.com's Account`
- account ID: `85d52ed1ca1933df067bf0c167d65a84`

---

## Router Worker (`src/index.js`)

The router is intentionally thin.

### Current proxied paths

```js
const PROXY_PATHS = ["/get", "/hit", "/increment", "/auth", "/go", "/layout"];
```

That list must stay aligned with `run_worker_first` in `wrangler.toml`. CI enforces this with `scripts/check-route-alignment.js`.

### Responsibilities

- forward proxied dynamic routes to `barrelrollcounter-worker`
- serve everything else from the `ASSETS` binding
- apply security headers and CSPs consistently
- provide extensionless `.html` fallback for static pages

---

## Main backend (`cloudflare-worker/worker.js`)

### Current endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/get` | return current rickroll count |
| `POST` | `/hit` | increment count |
| `POST` | `/increment` | alias of `/hit` |
| `GET` | `/auth/session` | return session state |
| `POST` | `/auth/register` | create email-backed account |
| `POST` | `/auth/emaillogin` | email/password login |
| `GET` | `/auth/discord/login` | start Discord OAuth PKCE flow |
| `GET` | `/auth/discord/callback` | finish Discord OAuth flow |
| `POST` | `/auth/logout` | clear session cookie |
| `GET` | `/layout?page=<page>` | read layout overrides |
| `POST` | `/layout` | save layout overrides |
| `GET` | `/go/whiteboard` | authenticated redirect |
| `GET` | `/go/capex` | authenticated redirect |
| `GET` | `/go/snow` | authenticated redirect |

### Main backend secret inventory

| Secret | Current status |
|---|---|
| `SESSION_SECRET` | set |
| `DISCORD_CLIENT_ID` | set |
| `DISCORD_CLIENT_SECRET` | set |
| `DISCORD_REDIRECT_URI` | set |
| `OWNER_DISCORD_ID` | missing |
| `TOOL_URL_WHITEBOARD` | optional override; repo code has HTTPS fallback |
| `TOOL_URL_CAPEX` | optional override; repo code has HTTPS fallback |
| `TOOL_URL_SNOW` | optional override; repo code has HTTPS fallback |
| `BACKDOOR_ADMIN_KEY` | operational/out-of-band; not consumed by current repo code |
| `DISCORD_WEBHOOK_URL` | operational/out-of-band; not consumed by current repo code |

### Backend caveats

- `ROUTER_SECRET` is legacy documentation only; current runtime code does not consume it
- homepage tool launches now go through authenticated `/go/*` redirects in `public/script.js`
- `/layout` is a required live route and must always remain in router/docs/config alignment

---

## API Worker (`naimean-api/src/worker.js`)

### Current endpoints

| Method | Path | Current response |
|---|---|---|
| `GET` | `/api/health` | `{ "status": "ok", "timestamp": "..." }` |
| `GET` | `/api/data` | latest 50 D1-backed entries |
| `POST` | `/api/data` | creates a new entry |

### Runtime resources

- D1: `naimean-db`
- KV: `naimean-kv`
- no runtime API secret is consumed by `naimean-api/src/worker.js`; `/api/*` is public in the repo as currently implemented

---

## Static frontend (`public/`)

The frontend is scene-based, not framework/component-based.

### Shared scripts

- `public/script.js` — homepage state machine and puzzle flow
- `public/auth.js` — shared auth chip / popup login flow
- `public/diagnostics.js` — diagnostics panel

### Core pages

- `public/index.html`
- `public/chapel.html`
- `public/bedroom_antechamber.html`
- `public/bedroom.html`
- `public/first_level.html` through `public/ninth_level.html`
- `public/auth_popup_complete.html`

---

## CI/CD and validation

Workflow file:

- `.github/workflows/github-pages.yml`

### What CI does

- `node --check` for repository JS files
- `node --test cloudflare-worker/worker.test.js`
- validates all three `wrangler.toml` files
- checks `PROXY_PATHS` ↔ `run_worker_first` alignment and validates expected worker route patterns
- deploys `public/` to GitHub Pages
- deploys `naimeanv2`, `barrelrollcounter-worker`, and `naimean-api`

### GitHub Actions secrets required

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Token permissions required

- Workers Scripts: Account Edit
- D1: Account Edit
- Workers KV Storage: Account Edit
- Account Settings: Account Read

---

## Recommended reading order

1. `CLOUDFLARE_README.md`
2. `FELIPE_HANDOFF.md`
3. `wrangler.toml`
4. `src/index.js`
5. `cloudflare-worker/wrangler.toml`
6. `cloudflare-worker/worker.js`
7. `naimean-api/wrangler.toml`
8. `naimean-api/src/worker.js`
9. `public/index.html`
10. `public/script.js`
11. `PLAN.md`
12. `UPDATE.md`

---

## Local validation commands

```bash
node --check src/index.js
node --check cloudflare-worker/worker.js
node --check public/script.js
node --check public/diagnostics.js
node --check naimean-api/src/worker.js
node --check naimean-api/src/agents/naimean-agent.js
node --test cloudflare-worker/worker.test.js
```

---

## Recommendation backlog

### P0 — immediate cleanup / risk reduction

- [ ] Set `OWNER_DISCORD_ID` on `barrelrollcounter-worker` if `/layout` writes must be locked to one Discord account
- [ ] Set `TOOL_URL_WHITEBOARD`, `TOOL_URL_CAPEX`, and `TOOL_URL_SNOW` only if the built-in `/go/*` destinations should be overridden
- [ ] Enable Cloudflare WAF managed rules on the `naimean.com` zone
- [ ] Add edge rate limits for `/hit`, `/increment`, `/auth/*`, `/layout`, and `/api/*`
- [ ] Put Zero Trust in front of privileged/internal tool flows
- [ ] Add Worker alerting / logging / dashboard checks so deploy failures and 5xx spikes are visible quickly

### P1 — near-term stability and operations

- [ ] Document `BACKDOOR_ADMIN_KEY` and `DISCORD_WEBHOOK_URL` consistently across handoff docs
- [ ] Verify both D1 schemas directly if Cloudflare metadata still reports `num_tables: 0`
- [ ] Keep worker route declarations in `wrangler.toml` aligned with the Cloudflare dashboard state
- [ ] Normalize docs so every handoff file agrees on routes, payloads, database IDs, and secret inventory
- [ ] Decide whether `naimean-sessions` should be bound, repurposed, or deleted
- [ ] Add a real D1 backup/export cadence and restore runbook for both databases

### P2 — product and maintainability

- [ ] Add end-to-end coverage for Discord popup auth, chapel auth gates, `/layout`, and `/api/*`
- [ ] Create a staging/preview route or `workers.dev` validation lane for auth and D1 changes
- [ ] Break large scene logic into clearer modules where possible without adding unnecessary build tooling
- [ ] Improve observability conventions such as request IDs and structured error logging
- [ ] Continue accessibility, media, and polish work across scene pages

---

## One-sentence summary

`naimeanV2.0` is a static interactive website wrapped in a small Cloudflare application: the edge router controls traffic, the backend Workers own state and auth, and the docs are part of the runtime handoff.
