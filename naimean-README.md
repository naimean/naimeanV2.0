# naimean — Repository Curriculum Vitae

## Identity
- **Repository:** `naimean/naimeanV2.0`
- **Type:** interactive personal website + Cloudflare edge application
- **Frontend style:** vanilla HTML/CSS/JS scene pages
- **Primary platform:** Cloudflare Workers + D1 + GitHub Pages
- **Cloudflare account:** `Naimean@hotmail.com's Account` (`85d52ed1ca1933df067bf0c167d65a84`)

---

## Professional summary

`naimeanV2.0` is a hybrid repo: a handcrafted interactive site wrapped in a small but real Cloudflare application.

For visitors it feels like a retro C64-themed puzzle site.
For operators it behaves like an edge stack with:

- Worker-based routing
- two D1-backed services
- one KV-backed API deployment footprint
- Discord OAuth + email auth
- authenticated tool redirects
- Cloudflare-first deployment automation
- documentation-heavy infra handoff requirements

---

## Core story of the codebase

The static scenes came first. Workers were added only where the site needed secrets, persistence, auth, redirects, or route control. That history still explains the repo:

- the **frontend** stays static and handcrafted
- the **Workers** own state, auth, redirects, and APIs
- the **docs** matter because Cloudflare resources are part of the architecture, not just deployment trivia

---

## User journey snapshot

1. User lands on `public/index.html`
2. User interacts with the power-on / boot / shoutbox flow
3. User can trigger Discord auth, email auth, mini-game flows, or the prank/rickroll path
4. The experience moves through chapel, bedroom antechamber, bedroom, and level pages
5. Persistent state and privileged redirects are served through Workers instead of embedded in the static site

---

## Technical stack

- **Runtime:** Cloudflare Workers
- **Databases:** D1 (`barrelroll-counter-db`, `naimean-db`)
- **KV:** `naimean-kv` bound to `naimean-api`; `naimean-sessions` exists but is currently unbound
- **Frontend:** vanilla HTML/CSS/JS
- **Tests:** Node built-in test runner
- **Validation:** `node --check`
- **CI/CD:** GitHub Actions + Wrangler + GitHub Pages

---

## Component inventory

### 1) Edge router Worker (`src/index.js`)
**Role:** production entrypoint for most site traffic.

**Responsibilities:**
- proxies `/get`, `/hit`, `/increment`, `/auth`, `/go`, and `/layout`
- serves all other paths from `ASSETS`
- adds CSP and baseline security headers
- provides extensionless `.html` fallback

**Why it matters:**
It keeps Cloudflare domain control centralized without mixing business logic into the static site.

---

### 2) Router config (`wrangler.toml`)
**Role:** binds `ASSETS`, `COUNTER`, repo-managed custom-domain routes, and worker-first paths.

**Important fact:**
`run_worker_first` must match `PROXY_PATHS`, and CI checks that with `scripts/check-route-alignment.js`.

---

### 3) Main backend Worker (`cloudflare-worker/worker.js`)
**Role:** counter/auth/layout/tool backend.

**Current responsibilities:**
- counter reads/writes
- Discord OAuth PKCE flow
- email registration/login
- signed session cookies
- `/layout` get/save
- authenticated `/go/*` redirects
- rate limiting, CORS, payload validation, and API security headers

**Important operational fact:**
The Worker depends on D1 plus auth secrets. `OWNER_DISCORD_ID` and `TOOL_URL_*` are optional overrides in current repo code.

---

### 4) Main backend config (`cloudflare-worker/wrangler.toml`)
**Role:** binds `barrelroll-counter-db`.

**Important caveat:**
`ROUTER_SECRET` is still documented in older comments/docs, but current runtime code does not consume it.

---

### 5) Main D1 schema (`cloudflare-worker/schema.sql`)
**Tables:**
- `rickroll_counter`
- `layout_overrides`
- `registered_users`

**Why it matters:**
These are the repo's primary durable concerns: metric state, scene layout state, and email-auth account state.

---

### 6) Main backend tests (`cloudflare-worker/worker.test.js`)
**Role:** regression and contract tests for auth/counter/layout helpers and routes.

**Coverage themes:**
- cookies and token helpers
- method enforcement
- rate limiting
- Discord login redirect behavior
- layout read/write contracts
- email auth contracts

---

### 7) API Worker (`naimean-api/src/worker.js`)
**Role:** separate `/api/*` service.

**Current endpoints:**
- `GET /api/health`
- `GET /api/data`
- `POST /api/data`

**Why it matters:**
It is the repo's cleaner API lane and owns its own D1 + KV footprint.

---

### 8) API Worker config (`naimean-api/wrangler.toml`)
**Role:** defines route, D1, and KV bindings.

**Current infra facts:**
- D1: `naimean-db` (`0871f90d-f7e3-467a-a1f9-4e74ac8aef42`)
- KV: `naimean-kv` (`dff7175059ce478eab8c910949ca330f`)
- no runtime API secret is enforced by `naimean-api/src/worker.js`

---

### 9) Static homepage (`public/index.html`)
**Role:** main interactive shell.

**Contains:**
- C64 artwork and overlays
- power button / boot screen
- shoutbox area
- Discord overlay/widget frame
- auth/debug/main script includes

---

### 10) Main scene logic (`public/script.js`)
**Role:** homepage state machine.

**Current domains of logic:**
- power state
- boot/shoutbox command parsing
- counter sync with local fallback
- auth integration hooks
- mini-game behavior
- prank/rickroll flow
- scene transitions
- authenticated `/go/*` tool-button launches

**Important caveat:**
The UI now launches tools through `/go/*`, so backend auth gates and frontend behavior are aligned.

---

### 11) Shared auth UI (`public/auth.js`)
**Role:** floating auth chip, popup login flow, logout/session refresh hooks.

---

### 12) Diagnostics (`public/diagnostics.js`)
**Role:** hidden in-browser diagnostics panel.

---

### 13) Scene pages (`public/*.html`)
**Notable pages:**
- `chapel.html`
- `bedroom_antechamber.html`
- `bedroom.html`
- `first_level.html` through `ninth_level.html`

These pages show the frontend is organized around scenes and hotspots, not components.

---

### 14) CI/CD (`.github/workflows/github-pages.yml`)
**Role:** validates and deploys the repo.

**Current jobs cover:**
- `node --check`
- `node --test cloudflare-worker/worker.test.js`
- wrangler field checks
- route-alignment checks for proxy paths and expected worker routes
- schema-file sanity checks for expected tables
- GitHub Pages deploy
- Worker deploys for all three Workers

---

### 15) Documentation set
- `README.md` — main repository explainer and recommendation backlog
- `CLOUDFLARE_README.md` — Cloudflare resource inventory and runbook
- `FELIPE_HANDOFF.md` — practical setup checklist
- `PLAN.md` — recommendation backlog and operations roadmap
- `UPDATE.md` — change log

---

## Configuration quick reference

### Router runtime
- config: `wrangler.toml`
- static assets: `public/`
- service binding: `COUNTER` -> `barrelrollcounter-worker`
- worker-first paths: `/get`, `/hit`, `/increment`, `/auth`, `/go`, `/layout`

### Main backend runtime
- config: `cloudflare-worker/wrangler.toml`
- D1 binding: `DB` -> `barrelroll-counter-db`
- optional overrides: `OWNER_DISCORD_ID`, `TOOL_URL_WHITEBOARD`, `TOOL_URL_CAPEX`, `TOOL_URL_SNOW`
- operational/out-of-band secrets not consumed by current repo code: `BACKDOOR_ADMIN_KEY`, `DISCORD_WEBHOOK_URL`

### API runtime
- config: `naimean-api/wrangler.toml`
- route: `naimean.com/api/*`
- D1 binding: `DB` -> `naimean-db`
- KV binding: `KV` -> `naimean-kv`
- auth model: public `/api/*` endpoints; no runtime `API_TOKEN` enforcement in repo code

---

## Security posture snapshot

Current hardening already present in code:

- edge-enforced security headers
- separate document/API CSP strategy
- signed cookies for sessions and OAuth state
- Discord PKCE + state validation
- PBKDF2 password hashing for email auth
- same-origin logout guard
- environment-aware CORS allowlisting
- POST-only counter writes
- worker-side rate limiting
- HTTPS-only validation for redirect destinations

---

## Recommendation highlights

### Immediate
- decide whether `OWNER_DISCORD_ID` should be configured for stricter `/layout` writes
- set `TOOL_URL_*` only if the built-in `/go/*` destinations should be overridden
- add WAF, edge rate limits, monitoring, and Zero Trust protections

### Next
- document the previously undocumented secrets everywhere ops handoff matters
- verify D1 schemas directly if metadata drift continues
- decide whether `naimean-sessions` should survive

### Planned
- improve observability and restore runbooks
- add staging/preview validation paths
- continue scene maintainability and accessibility work

---

## Closing statement

`naimeanV2.0` is best understood as a small Cloudflare production stack wrapped around a handcrafted interactive website: static where that keeps the experience nimble, dynamic where auth, persistence, routing, and operational control are actually needed.
