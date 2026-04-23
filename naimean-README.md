# naimean — Repository Curriculum Vitae

## Identity
- **Repository:** `naimean/naimeanV2.0`
- **Type:** interactive personal website + Cloudflare edge application
- **Frontend style:** vanilla HTML/CSS/JS scene pages
- **Primary platform:** Cloudflare Workers + D1
- **Static delivery:** GitHub Pages artifact served through Cloudflare `ASSETS`

---

## Professional summary

`naimeanV2.0` is a hybrid repo that combines a hand-built interactive web experience with production-minded Cloudflare edge services.

For visitors, it feels like a retro Commodore 64-themed puzzle site.
For operators, it behaves like a small edge application with:

- Worker-based routing
- D1-backed persistence
- Discord OAuth + email auth
- authenticated redirect handling
- route/config validation in CI
- Cloudflare deployment automation

---

## Core story of the codebase

This repository did **not** start life as a conventional app. The frontend scenes came first, and the Workers were added as the site needed durable state, auth, and deploy-time control.

That history explains the structure:

- the **frontend** remains static, handcrafted, and scene-driven
- the **Workers** own the parts that need secrets, cookies, redirects, or storage
- the **docs** matter more than usual because Cloudflare bindings/routes are part of the architecture, not just deployment details

---

## User journey snapshot

1. User lands on `public/index.html`
2. User powers on the C64 scene and interacts with the boot/shoutbox flow
3. User can trigger Discord/email auth, a mini-game, or the prank/rickroll path
4. The flow transitions into `chapel.html`, then `bedroom_antechamber.html`, then `bedroom.html` or the level chain
5. Persistent state is served through Workers rather than embedded directly in the static site

---

## Technical stack

- **Runtime:** Cloudflare Workers
- **Databases:** Cloudflare D1 (`barrelroll-counter-db`, `naimean-db`)
- **Additional binding:** Workers KV for `naimean-api`
- **Frontend:** vanilla HTML/CSS/JavaScript
- **Tests:** Node built-in test runner
- **Validation:** `node --check`
- **CI/CD:** GitHub Actions + Wrangler deploys + GitHub Pages deploy

---

## Component inventory

### 1) Edge router Worker (`src/index.js`)
**Role:** production entrypoint for most traffic.

**Responsibilities:**
- proxies `/get`, `/hit`, `/increment`, `/auth`, `/go`, and `/layout`
- serves all other paths from `ASSETS`
- adds document/API CSP and baseline browser hardening headers
- provides extensionless HTML fallback for static pages

**Why it matters:**
This Worker keeps the domain controlled at the edge without mixing business logic into the static site.

---

### 2) Router config (`wrangler.toml`)
**Role:** binds `ASSETS`, `COUNTER`, and worker-first paths.

**Important current fact:**
`run_worker_first` must match `PROXY_PATHS` in `src/index.js`, and CI checks that with `scripts/check-route-alignment.js`.

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

**Why it matters:**
This is where the repo stopped being “just a static site” and became a real edge app.

---

### 4) Main backend config (`cloudflare-worker/wrangler.toml`)
**Role:** binds D1 and documents required secrets.

**Important caveat:**
`ROUTER_SECRET` is still documented here, but current runtime code does not consume it.

---

### 5) Main D1 schema (`cloudflare-worker/schema.sql`)
**Tables:**
- `rickroll_counter`
- `layout_overrides`
- `registered_users`

**Why it matters:**
This schema shows the three durable concerns the main backend currently owns: metric state, scene layout state, and local account state.

---

### 6) Main backend tests (`cloudflare-worker/worker.test.js`)
**Role:** regression tests for auth/counter/layout helpers and endpoint contracts.

**Coverage themes:**
- cookies and token helpers
- CORS/origin logic
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
This is the repo’s cleaner API lane and signals a move toward separating fun-site backend logic from general app API logic.

---

### 8) API Worker config (`naimean-api/wrangler.toml` + `naimean-api/package.json`)
**Role:** defines route, D1, KV, and Wrangler tooling for `naimean-api`.

**Important current fact:**
The repo is still lightweight, but it is no longer accurate to describe it as having no package manifests anywhere because `naimean-api/package.json` exists.

---

### 9) Static homepage (`public/index.html`)
**Role:** main interactive shell.

**Contains:**
- C64 artwork
- power button
- boot screen
- shoutbox area
- Discord overlay/widget frame
- media overlays
- auth/debug/main script includes

---

### 10) Main scene logic (`public/script.js`)
**Role:** orchestrates the homepage state machine.

**Current domains of logic:**
- power state
- boot/shoutbox command parsing
- counter sync with local fallback
- Discord/email auth integration hooks
- mini-game behavior
- prank/rickroll flow
- scene transitions
- legacy direct tool-button URLs

**Important caveat:**
The UI still contains direct hardcoded tool destinations even though `/go/*` exists server-side.

---

### 11) Shared auth UI (`public/auth.js`)
**Role:** floating auth chip, popup login flow, session refresh hooks, logout interaction.

**Why it matters:**
This keeps auth behavior reusable across otherwise-static pages.

---

### 12) Diagnostics (`public/diagnostics.js`)
**Role:** hidden terminal-style in-browser diagnostics panel.

**Activation:**
- `?diag=1`
- `Ctrl+Shift+D`
- `localStorage['naimean-diag'] = '1'`
- `NaimeanDiag.toggle()`

---

### 13) Scene pages (`public/*.html`)
**Notable pages:**
- `chapel.html` — counter display, continuation behavior, layout tooling hooks
- `bedroom_antechamber.html` — transition scene and route split to bedroom / level path
- `bedroom.html` — horizontal-scroll room scene
- `first_level.html` through `ninth_level.html` — image + nav progression

**Why they matter:**
These pages show that the frontend is organized around scenes and hotspots, not components.

---

### 14) CI/CD (`.github/workflows/github-pages.yml`)
**Role:** validates and deploys the repo.

**Current jobs cover:**
- `node --check`
- `node --test cloudflare-worker/worker.test.js`
- wrangler field checks
- route alignment checks
- GitHub Pages deployment
- Worker deploys for all three Workers

---

### 15) Documentation set
- `README.md` — main repository explanation and current recommendation backlog
- `CLOUDFLARE_README.md` — Cloudflare runbook and infra notes
- `FELIPE_HANDOFF.md` — practical ops handoff for Felipe
- `PLAN.md` — roadmap + recommendation list
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
- optional owner restriction secret: `OWNER_DISCORD_ID`

### API runtime
- config: `naimean-api/wrangler.toml`
- route: `naimean.com/api/*`
- D1 binding: `DB` -> `naimean-db`
- KV binding: `KV`

---

## Security posture snapshot

Current hardening already present in code:

- edge-enforced security headers
- separate document/API CSP strategy
- signed cookies for session and OAuth state
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
- finish moving tool launches to `/go/*`
- resolve the `ROUTER_SECRET` docs/runtime mismatch
- add edge WAF/rate limits and monitoring

### Next
- add e2e coverage for auth + layout flows
- align all docs on payload shapes and required secrets
- decide whether the API KV binding should be used or removed

### Planned
- improve observability and restore runbooks
- continue media optimization and scene maintainability work

---

## Closing statement

`naimeanV2.0` is best understood as a small Cloudflare application wrapped around a handcrafted interactive website: static where that keeps the experience nimble, dynamic only where persistence, auth, and operational control are actually needed.
