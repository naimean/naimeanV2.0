# Naimean V2.0

A Cloudflare-first personal website that mixes a static Commodore 64-style interactive experience with Worker-powered auth, persistence, protected tool redirects, and a small separate `/api/*` service.

> **He boiled for our sins.**

---

## What this repository is

This repo is really **four things living together**:

1. **The edge router Worker** (`src/index.js`) that sits in front of the domain
2. **The main backend Worker** (`cloudflare-worker/worker.js`) that owns counter/auth/layout/tool-launcher logic
3. **A second API Worker** (`naimean-api/src/worker.js`) that owns `naimean.com/api/*`
4. **A static scene-based site** (`public/`) that contains the C64 homepage, chapel, bedroom, and level sequence

That split explains most of the codebase organization: the frontend stays lightweight and static, while the parts that need secrets, cookies, storage, or redirects live in Workers.

---

## Why the code is organized this way

The project started as a **hand-crafted interactive website**, not as a framework app. The code still reflects that origin:

- **Static HTML/CSS/JS** was the fastest way to build the scenes, precise hotspots, media timing, and puzzle interactions
- **Cloudflare Workers** were added only where the static site needed server behavior: counter writes, auth, sessions, redirects, and persistence
- **D1** was enough for the small amount of durable data the site needs, so there was no reason to introduce a heavier backend stack
- **GitHub Pages + Cloudflare** keeps the static portion simple while still letting the domain be controlled at the edge

The result is a repo that feels part art project, part edge application, and part operations handoff.

---

## Runtime architecture

```text
Browser
  │
  ▼
naimeanv2 (edge router Worker)
  │
  ├─ /get, /hit, /increment, /auth/*, /go/*, /layout
  │      └─► barrelrollcounter-worker
  │             ├─ D1: barrelroll-counter-db
  │             ├─ session cookies / Discord OAuth / email auth
  │             ├─ layout overrides
  │             └─ authenticated tool redirects
  │
  ├─ /api/*
  │      └─► naimean-api
  │             ├─ D1: naimean-db
  │             └─ KV binding reserved for future use
  │
  └─ everything else
         └─► ASSETS binding -> public/
```

### Production entrypoints

- `naimean.com` -> `naimeanv2`
- `www.naimean.com` -> `naimeanv2`
- `naimean.com/api/*` -> `naimean-api`

### Current Cloudflare zones called out in docs

- `naimean.com`
- `madmedia.studio`

---

## Repository map

| Path | Role | Why it matters |
|---|---|---|
| `src/index.js` | Edge router Worker | First code hit in production for most traffic |
| `wrangler.toml` | Edge router config | Defines `ASSETS`, `COUNTER`, and worker-first paths |
| `cloudflare-worker/worker.js` | Main backend Worker | Counter, Discord/email auth, layout API, `/go/*` redirects, rate limits |
| `cloudflare-worker/schema.sql` | Main D1 schema | Creates `rickroll_counter`, `layout_overrides`, and `registered_users` |
| `cloudflare-worker/wrangler.toml` | Main backend config | Declares D1 binding and documents required secrets |
| `naimean-api/src/worker.js` | Separate API Worker | Owns `/api/health` and `/api/data` |
| `naimean-api/migrations/0000_create_entries.sql` | API D1 schema | Creates the `entries` table |
| `naimean-api/wrangler.toml` | API Worker config | Declares route, D1 binding, and KV binding |
| `public/` | Static website | All interactive scenes, shared JS, CSS, and assets |
| `.github/workflows/github-pages.yml` | CI/CD | Syntax checks, tests, route-alignment checks, Pages deploy, Worker deploys |
| `CLOUDFLARE_README.md` | Infra runbook | Best operational reference for Cloudflare-side setup |
| `FELIPE_HANDOFF.md` | Ops handoff | Felipe-specific setup, validation, and caveats |
| `naimean-README.md` | Repo CV / narrative inventory | Alternate high-context summary of the codebase |
| `PLAN.md` | Roadmap + recommendation backlog | Current recommendation list and follow-up priorities |
| `UPDATE.md` | Update log | Change history and recent documentation refresh notes |

---

## Worker 1 — edge router (`src/index.js`)

The router Worker is intentionally small. Its job is:

- proxy dynamic routes to `barrelrollcounter-worker`
- serve static assets from `public/`
- add security headers consistently
- provide extensionless `.html` fallback behavior for static pages

### Current proxied paths

```js
const PROXY_PATHS = ["/get", "/hit", "/increment", "/auth", "/go", "/layout"];
```

That list must stay in sync with `run_worker_first` in the root `wrangler.toml`. CI enforces this with `scripts/check-route-alignment.js`.

### Why this layer exists

This keeps routing and header policy centralized without mixing business logic into the static site. The router is thin on purpose: it reduces blast radius, keeps the asset flow simple, and makes Cloudflare domain behavior easier to understand.

### Security header strategy

- **HTML** responses get the document CSP plus `Cache-Control: no-cache, must-revalidate`
- **API / non-HTML** responses get a strict API CSP
- immutable media/font assets get long-lived cache headers
- baseline browser hardening headers are applied to every response

---

## Worker 2 — main backend (`cloudflare-worker/worker.js`)

This is the main application backend.

### Current endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/get` | Return current rickroll count |
| `POST` | `/hit` | Increment count |
| `POST` | `/increment` | Alias of `/hit` |
| `GET` | `/auth/session` | Return current session state |
| `POST` | `/auth/register` | Create an email-backed account |
| `POST` | `/auth/emaillogin` | Sign in with email/password |
| `GET` | `/auth/discord/login` | Start Discord OAuth PKCE flow |
| `GET` | `/auth/discord/callback` | Finish Discord OAuth flow |
| `POST` | `/auth/logout` | Clear session cookie |
| `GET` | `/layout?page=<page>` | Read layout overrides |
| `POST` | `/layout` | Save layout overrides |
| `GET` | `/go/whiteboard` | Authenticated redirect |
| `GET` | `/go/capex` | Authenticated redirect |
| `GET` | `/go/snow` | Authenticated redirect |
| `OPTIONS` | above routes | CORS preflight |

### Key backend features

#### 1. Counter
The original persisted feature. It now uses `POST` for writes, which is the correct direction for abuse resistance and cleaner HTTP semantics.

#### 2. Session/auth stack
The Worker supports **two auth paths**:

- **Discord OAuth with PKCE**
- **email registration + login backed by D1**

Session tokens are **homegrown signed cookies** using HMAC rather than JWT libraries, which matches the repo's lightweight/no-dependency style.

#### 3. Layout API
The chapel scene can load and save hotspot/layout overrides through `/layout`.

This is important because it explains why the backend is not just a counter worker anymore: it also acts as a lightweight scene-configuration service.

#### 4. Authenticated `/go/*` redirects
The Worker can gate internal tool redirects behind a valid session and only redirect to HTTPS destinations.

### Backend security posture

The Worker contains most of the repo's hardening work:

- signed OAuth and session cookies
- Discord PKCE + state verification
- PBKDF2 password hashing for email auth
- same-origin logout guard
- rate limiting by client IP and route bucket
- environment-aware CORS allowlists
- validation on layout payloads and redirect targets
- strict API response headers

### Current backend caveats

- `ROUTER_SECRET` is still documented in several docs and comments, but the current committed runtime code does **not** consume it
- `/go/*` exists server-side, but the browser UI still contains legacy **hardcoded direct tool URLs** in `public/script.js`; the repo is in a transitional state between direct client links and fully server-controlled redirects

---

## Worker 3 — `naimean-api` (`naimean-api/src/worker.js`)

This is a separate Cloudflare Worker routed at `naimean.com/api/*`.

### Current endpoints

| Method | Path | Current response |
|---|---|---|
| `GET` | `/api/health` | `{ "status": "ok", "timestamp": "..." }` |
| `GET` | `/api/data` | Latest 50 D1-backed entries |
| `POST` | `/api/data` | Creates a new entry from `{ title, content }` |

### Why it matters

This Worker is the cleanest example of the repo moving toward a more conventional API surface. Instead of shoving every future endpoint into the legacy fun-site backend, `/api/*` has its own deployment unit, D1 database, and KV binding.

### Current Cloudflare resources for `naimean-api`

- Worker name: `naimean-api`
- Route: `naimean.com/api/*`
- D1 database: `naimean-db`
- KV namespace binding: `KV`

### Important note

`naimean-api` already has its own `package.json` to pin Wrangler, so the repo is still low-dependency, but it is no longer accurate to say there are **no** package manifests anywhere.

---

## Static frontend organization (`public/`)

The site is organized as **scene pages**, not as reusable framework components.

### Shared browser scripts

- `public/script.js` — main homepage state machine and puzzle logic
- `public/auth.js` — shared floating auth chip / popup login flow
- `public/diagnostics.js` — hidden browser-side diagnostics panel

### Core pages

- `public/index.html` — Commodore 64 homepage
- `public/chapel.html` — chapel scene, counter display, layout editor hooks
- `public/bedroom_antechamber.html` — scene bridge between chapel and bedroom / level chain
- `public/bedroom.html` — horizontally scrolling bedroom scene
- `public/first_level.html` through `public/ninth_level.html` — image-based level sequence
- `public/level_one.html` — alias entry point used by the antechamber
- `public/auth_popup_complete.html` — popup OAuth completion bridge

### Why the frontend feels monolithic

`public/script.js` is large because the homepage is effectively one big **state machine**:

- power-on sequence
- boot input locking
- Discord overlay timing
- auth commands and status messaging
- mini-game behavior
- prank/rickroll flow
- counter sync with local fallback
- media timing and navigation handoff

That code is less like a modern SPA and more like choreography for an interactive scene.

---

## Data model

## Main backend D1 database: `barrelroll-counter-db`

Created by `cloudflare-worker/schema.sql`.

### Tables

- `rickroll_counter`
- `layout_overrides`
- `registered_users`

### Why these tables exist

- `rickroll_counter` keeps the core joke/metric persistent
- `layout_overrides` lets chapel hotspot tuning survive deploys and viewport changes
- `registered_users` supports email-based auth without introducing a separate auth service

## API Worker D1 database: `naimean-db`

Created by `naimean-api/migrations/0000_create_entries.sql`.

### Table

- `entries`

### Why it exists

This supports the standalone `/api/data` service and gives the repo a cleaner lane for future app-style features.

---

## CI/CD and validation

Workflow file:

- `.github/workflows/github-pages.yml`

### What CI does today

- syntax checks with `node --check`
- worker tests with `node --test cloudflare-worker/worker.test.js`
- wrangler config field checks
- route-alignment verification between router code and config
- GitHub Pages deployment of `public/`
- Worker deployment for:
  - `naimeanv2`
  - `barrelrollcounter-worker`
  - `naimean-api`

### Why CI is shaped this way

There is no build pipeline for the main site, so CI focuses on what actually matters here:

- JavaScript syntax safety
- config drift safety
- contract safety for the backend Worker
- deployment authentication correctness

---

## What Felipe needs configured on the Cloudflare side

This is the practical handoff summary.

### Workers expected

- `naimeanv2`
- `barrelrollcounter-worker`
- `naimean-api`

### Routes/domains expected

- `naimean.com` -> `naimeanv2`
- `www.naimean.com` -> `naimeanv2`
- `naimean.com/api/*` -> `naimean-api`

### D1 resources expected

- `barrelroll-counter-db`
- `naimean-db`

### KV resource expected

- `KV` namespace bound to `naimean-api`

### GitHub Actions secrets expected

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### `barrelrollcounter-worker` secrets expected

- `SESSION_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `OWNER_DISCORD_ID`
- `TOOL_URL_WHITEBOARD`
- `TOOL_URL_CAPEX`
- `TOOL_URL_SNOW`
- `ROUTER_SECRET` *(still documented, though not consumed by current runtime code)*

### Important Cloudflare caveats

1. `/layout` is a real live proxied route and must stay configured with the router
2. `DISCORD_REDIRECT_URI` must exactly match the callback configured in the Discord developer portal
3. `naimean-api` has its own D1 + KV bindings and is deployed separately from the other two Workers even though it lives in the same repo
4. the current `GET /api/health` response is `{ "status": "ok", "timestamp": "..." }`, so validation docs should not expect a different payload shape

For the step-by-step ops checklist, use `FELIPE_HANDOFF.md`.

---

## Recommended reading order

If someone is brand new to the repo, the best order is:

1. `FELIPE_HANDOFF.md`
2. `CLOUDFLARE_README.md`
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

- [ ] Finish the move away from client-side hardcoded tool URLs and make all tool launches go through `/go/*`
- [ ] Decide whether `ROUTER_SECRET` should be implemented for real internal request validation or removed from docs/secrets inventory
- [ ] Add Cloudflare WAF managed rules and edge rate limits for `/hit`, `/increment`, `/auth/*`, `/layout`, and `/api/*`
- [ ] Put Zero Trust in front of any privileged/internal tool flows
- [ ] Add Worker alerting / Logpush / dashboard checks so deploy failures and 5xx spikes are visible immediately

### P1 — near-term stability and operations

- [ ] Add end-to-end coverage for Discord popup auth, chapel trapdoor auth gate, and `/layout` save/load behavior
- [ ] Add API contract tests for `naimean-api`
- [ ] Create a real staging/preview route or `workers.dev` validation path for auth and D1 changes
- [ ] Normalize documentation so every handoff doc agrees on routes, payloads, and required secrets
- [ ] Decide whether the `naimean-api` KV binding should be used soon or removed until needed

### P2 — product and maintainability

- [ ] Break large scene logic into clearer modules where possible without introducing unnecessary build tooling
- [ ] Move role/quick-link visibility rules out of client code if they are considered sensitive
- [ ] Optimize media further (modern formats, lazy loading, preload strategy)
- [ ] Add a clear restore runbook for D1 data and documented migration procedures
- [ ] Add lightweight observability conventions such as request IDs and structured error logging

---

## One-sentence summary

`naimeanV2.0` is a hybrid interactive website and Cloudflare edge application: a static, scene-driven frontend backed by small Workers that handle auth, persistence, routing, and operational control.
