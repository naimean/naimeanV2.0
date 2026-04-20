# naimean — Repository Curriculum Vitae

## Identity
- **Name:** `naimeanV2.0`
- **Type:** Personal website + interactive experience + edge API integration
- **Primary runtime:** Cloudflare Workers (edge)
- **Primary frontend:** Static vanilla HTML/CSS/JavaScript
- **Static asset host target:** GitHub Pages (`public/`)
- **Repository role:** Contains both:
  1. **Frontend/router worker** (`src/index.js`) that serves static content and proxies API/auth routes
  2. **Backend API/auth worker** (`cloudflare-worker/worker.js`) that manages counter state, OAuth session flow, and protected redirects

---

## Professional Summary (What this repo does for users)
This repository delivers a **retro Commodore 64-style web experience** for visitors, with cinematic interactions (power-on boot flow, static/video/audio overlays, puzzle-like command input, chapel and level navigation), while also providing practical backend capabilities:
- persistent counter tracking (rickroll/barrel-roll count),
- Discord OAuth login/session/logout,
- authenticated redirects to internal tools,
- strict edge and API response security headers.

For end users, the main function is: **visit the site, experience an interactive game-like interface, optionally authenticate via Discord, and navigate themed scenes while the backend safely tracks and serves state.**

---

## Core User Experience Journey
1. User visits `index.html` (C64 interface).
2. User powers on the screen and interacts with boot/shoutbox commands (`C:\Naimean\...`).
3. User can:
   - trigger mini-game logic,
   - trigger Discord OAuth (`login/logout` commands),
   - run the unlock command (`please`) to continue scene progression.
4. User transitions to `chapel.html`, `bedroom_antechamber.html`, `bedroom.html`, and the numbered level pages.
5. Counter values are read/incremented through `/get` and `/increment` (POST for writes).
6. Optional authenticated redirects are available via `/go/*` routes.

---

## Skills & Technical Stack
- **Runtime:** Cloudflare Workers (V8 isolate runtime)
- **Worker compatibility mode:** `nodejs_compat` (router worker)
- **Data store:** Cloudflare D1 (SQLite)
- **Frontend:** Vanilla HTML, CSS, JS (no framework, no bundler, no TypeScript)
- **Testing:** Node built-in test runner (`node --test`)
- **Syntax validation:** `node --check`
- **CI/CD:** GitHub Actions (syntax checks, tests, Pages deployment)

---

## Component CV (Detailed)

### 1) Edge Router Worker (`/src/index.js`)
**Role:** Secure edge entrypoint and dispatcher.

**Responsibilities:**
- Defines proxy routes via `PROXY_PATHS`:
  - `/get`
  - `/hit`
  - `/increment`
  - `/auth`
  - `/go`
- Routes requests:
  - matching proxy paths ➜ `env.COUNTER.fetch(request)` (service binding)
  - all others ➜ `env.ASSETS.fetch(request)` (static asset serving)
- Applies security headers to *every* response.

**Security configuration implemented:**
- `Content-Security-Policy`:
  - HTML: document CSP (`DOCUMENT_CSP`)
  - Non-HTML/API: strict API CSP (`API_CSP`)
- Baseline headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` (restrictive)
- `Strict-Transport-Security` on HTTPS responses.

**Caching policy behavior:**
- HTML: `no-cache, must-revalidate` (if absent)
- Immutable static media/font extensions: `public, max-age=31536000, immutable` (if absent and status `200`)

**Primary configuration source:** `/wrangler.toml`

---

### 2) Router Worker Configuration (`/wrangler.toml`)
**Purpose:** Binds the edge router worker, static assets, and backend service.

**Key fields:**
- `name = "naimeanv2"`
- `main = "src/index.js"`
- `compatibility_date = "2026-04-18"`
- `compatibility_flags = ["nodejs_compat"]`

**Assets binding:**
- `[assets]`
  - `directory = "./public"`
  - `binding = "ASSETS"`
  - `run_worker_first = ["/get", "/hit", "/increment", "/auth", "/go"]`

**Service binding:**
- `[[services]]`
  - `binding = "COUNTER"`
  - `service = "barrelrollcounter-worker"`

**Important alignment rule:**
- `run_worker_first` paths must stay in sync with `PROXY_PATHS` in `src/index.js`.

---

### 3) Backend Counter/Auth Worker (`/cloudflare-worker/worker.js`)
**Role:** API backend for counter, Discord OAuth session flow, and authenticated tool redirects.

**Responsibilities:**
- Counter API:
  - `GET /get` ➜ read counter value
  - `POST /hit` and `POST /increment` ➜ increment + return value
- OAuth/session API:
  - `GET /auth/session`
  - `GET /auth/discord/login`
  - `GET /auth/discord/callback`
  - `POST /auth/logout`
- Authenticated redirect API:
  - `GET /go/whiteboard`
  - `GET /go/capex`
  - `GET /go/snow`
- CORS handling and `OPTIONS` preflight support
- Applies strict API security headers on responses

**Security and auth controls present:**
- Signed token approach for session and OAuth-state cookies
- PKCE (`code_verifier`, `code_challenge`) and `state` validation
- Cookie handling with `HttpOnly`, `SameSite`, optional `Secure`
- Return-path sanitization to block open redirects/CRLF injection
- CORS allowlist logic with environment-aware suffix behavior
- CSRF-oriented origin check for logout
- HTTPS-only redirect destination enforcement for `/go/*`

**Error handling behavior:**
- Unsupported methods/routes return JSON error with proper status
- Try/catch around runtime dispatch returns `500` JSON error on failures

---

### 4) Backend Worker Configuration (`/cloudflare-worker/wrangler.toml`)
**Purpose:** Defines backend worker deployment and D1 binding.

**Key fields:**
- `name = "barrelrollcounter-worker"`
- `main = "worker.js"`
- `compatibility_date = "2026-04-18"`

**D1 binding:**
- `[[d1_databases]]`
  - `binding = "DB"`
  - `database_name = "barrelroll-counter-db"`
  - `database_id = "22277fbe-031d-4cad-8937-245309e981cd"`

**Operational notes embedded in file:**
- reminders for `wrangler d1 execute ...schema.sql`
- reminders for setting secrets (`ROUTER_SECRET`, tool URLs, etc.)

---

### 5) D1 Schema (`/cloudflare-worker/schema.sql`)
**Data model:**
- Table `rickroll_counter`
  - `id TEXT PRIMARY KEY`
  - `value INTEGER NOT NULL DEFAULT 0`
- Seed row:
  - `('rickrolls', 0)` via `INSERT OR IGNORE`

**Purpose:** ensures increment logic has a guaranteed existing row.

---

### 6) Backend Tests (`/cloudflare-worker/worker.test.js`)
**Role:** Regression tests for pure helper logic.

**Coverage areas:**
- hostname suffix validation
- cookie parsing and serialization
- return-path sanitization
- base64url encode/decode helpers
- origin normalization and CORS suffix policy behavior

**Run command:**
- `node --test cloudflare-worker/worker.test.js`

---

### 7) Static Frontend Entry (`/public/index.html`)
**Role:** Main interactive shell for visitors.

**Contains:**
- C64 artwork and overlays
- power button controls
- boot screen + command form
- shoutbox command interface
- Discord widget iframe overlay
- quick-link buttons (whiteboard/capex/snow)
- static/video overlays for transitions
- script includes for:
  - `diagnostics.js`
  - `script.js`

**Accessibility additions visible in markup:**
- `main` landmark
- `aria-live` on status/counter areas
- role-based labels for command feed and controls

---

### 8) Frontend Behavior Engine (`/public/script.js`)
**Role:** Main client-side application logic.

**Major functional domains:**
- boot/power state orchestration
- media transitions (static, power-off, prank video)
- command parser for `C:\Naimean\...`
- mini-game lifecycle (start/guess/attempts/win/loss)
- auth command wiring (`login`, `logout`) to `/auth/*`
- rickroll count read/increment sync with network + local fallback
- role-based visibility for quick-link controls
- chapel scene transition triggers and persisted playback handoff
- guarded input prefix behavior for boot and shoutbox commands

**API calls from this file:**
- `/get`
- `/increment` (POST)
- `/auth/session`
- `/auth/logout`
- `/auth/discord/login` (redirect flow)
- `/go/whiteboard`, `/go/capex`, `/go/snow` (opened in new tab)

---

### 9) Frontend Diagnostics Console (`/public/diagnostics.js`)
**Role:** Optional in-browser diagnostics panel for runtime troubleshooting.

**Activation options:**
- `?diag=1`
- keyboard shortcut `Ctrl+Shift+D`
- `localStorage['naimean-diag']='1'`
- `NaimeanDiag.toggle()` from console

**Capabilities:**
- timestamped runtime logs
- key-value state panel
- show/hide/minimize controls
- lightweight injected terminal-style overlay

---

### 10) Frontend Styling (`/public/styles.css`)
**Role:** Presentation layer for C64-themed interface and transitions.

**Key style systems:**
- C64 screen geometry variables (`--screen-left/top/width/height`)
- overlay stack ordering (`z-index` strategy)
- boot/shoutbox control styling
- focus-visible accessibility styles
- fallback styling when base image fails to load (`.base-image-missing`)

---

### 11) Narrative/Scene Pages (`/public/*.html`)
**Role:** Themed navigation experience beyond the main C64 shell.

**Notable pages:**
- `chapel.html`:
  - long stitched scene with hotspot navigation
  - ambient congregation audio
  - continuation media behavior and invite redirect logic
  - local + remote counter display
- `bedroom_antechamber.html`:
  - hotspot-based navigation to chapel/bedroom/levels
  - fade transitions and generated door audio
- `bedroom.html`:
  - horizontally scrollable scene with doorway hotspot
- level chain:
  - `level_one.html` redirect helper to `first_level.html`
  - `first_level.html` through `ninth_level.html` provide linear forward/back navigation across level images

---

### 12) Static Media (`/public/assets`)
**Role:** Core user-facing visual/audio/video payloads.

**Includes:**
- hero/environment images (`commodore64.jpg`, `chapel_stacked.png`, `bedroom*.png`, `*_level.png`)
- transition and effect videos (`joinourdiscord.mp4`, `static.mp4`, `power-off.mp4`, `notarickroll.mp4`)
- sound assets (`wrong.mp3`, `congregation.mp3`, `zelda-secret.mp3`)

---

### 13) CI/CD Workflow (`/.github/workflows/github-pages.yml`)
**Role:** Enforces basic quality checks and deploys Pages.

**Triggers:** push, pull_request, workflow_dispatch

**Jobs:**
- `lint-and-check`:
  - syntax checks (`node --check`) for worker/frontend JS
  - worker unit tests
  - wrangler file field assertions
  - route alignment checks (`/auth` presence)
  - asset existence checks
- `deployment-check` (PR)
- `dependency-review` (PR)
- `deploy` (non-PR) to GitHub Pages using uploaded `public/` artifact

---

### 14) Copilot Setup Workflow (`/.github/workflows/copilot-setup-steps.yml`)
**Role:** Minimal setup workflow for Copilot coding agent readiness.

**Current setup actions:**
- checkout repository
- install Node.js 22

---

### 15) Development Container (`/.devcontainer/devcontainer.json`)
**Role:** Standardized cloud/local containerized dev environment.

**Configuration highlights:**
- Base image: Ubuntu devcontainer
- post-start sync command pulls latest repo state with rebase/autostash

---

### 16) Repository Policy/Docs Files
- `README.md`: project summary and high-level updates
- `CLOUDFLARE_README.md`: infrastructure mapping, Cloudflare architecture and hardening notes
- `PLAN.md`: roadmap and planned work items
- `UPDATE.md`: change log and progression history
- `.gitignore`: excludes environment and Wrangler local state files (`.wrangler`, `.env*`, `.dev.vars*`)

---

## Configuration Inventory (Quick Reference)

### Router Worker Runtime Config
- File: `/wrangler.toml`
- Main script: `src/index.js`
- Static binding: `ASSETS` -> `./public`
- Service binding: `COUNTER` -> `barrelrollcounter-worker`
- Worker-first paths: `/get`, `/hit`, `/increment`, `/auth`, `/go`

### Backend Worker Runtime Config
- File: `/cloudflare-worker/wrangler.toml`
- Main script: `cloudflare-worker/worker.js`
- D1 binding: `DB` -> `barrelroll-counter-db`

### Backend Secret/Env Inputs (expected by code)
- `SESSION_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `TOOL_URL_WHITEBOARD`
- `TOOL_URL_CAPEX`
- `TOOL_URL_SNOW`
- `CORS_ALLOWED_ORIGINS`
- `CORS_ALLOWED_ORIGIN_SUFFIXES`
- `CORS_ALLOW_PROD_ORIGIN_SUFFIXES`
- `APP_ENV` / `ENVIRONMENT`

---

## API Contract Snapshot

### Counter
- `GET /get` -> `{ "value": <number> }`
- `POST /hit` -> `{ "value": <number> }`
- `POST /increment` -> `{ "value": <number> }`

### Auth
- `GET /auth/session` -> authenticated status + optional user profile
- `GET /auth/discord/login` -> redirects to Discord OAuth authorize endpoint
- `GET /auth/discord/callback` -> validates flow, sets/clears cookies, redirects back with auth result query
- `POST /auth/logout` -> clears session cookie

### Tool Redirects
- `GET /go/whiteboard`
- `GET /go/capex`
- `GET /go/snow`

(Requires authenticated session; redirects are server-controlled and HTTPS-validated.)

---

## Security Posture Snapshot
- Edge-enforced security headers for all responses
- Distinct CSP for HTML vs API/non-HTML
- HSTS on secure transport
- OAuth PKCE + state model for Discord flow
- Signed token cookies for session/OAuth state
- Return path sanitization and strict redirect constraints
- CORS allowlisting with production-safe defaults
- POST-only counter write operations

---

## Local Validation Commands
```bash
node --check src/index.js
node --check cloudflare-worker/worker.js
node --check public/script.js
node --check public/diagnostics.js
node --test cloudflare-worker/worker.test.js
```

---

## Deployment Summary
- **Static frontend content:** deployed as GitHub Pages artifact from `public/`
- **Router worker:** deployed via Wrangler using root `wrangler.toml`
- **Backend worker:** deployed via Wrangler using `cloudflare-worker/wrangler.toml`

---

## CV Closing Statement
`naimeanV2.0` is a hybrid entertainment + edge-application repository that combines immersive front-end storytelling with secure Cloudflare Worker routing, API, and OAuth session capabilities. It is intentionally lightweight (vanilla web stack, minimal dependencies) while still implementing production-minded concerns: route control, response hardening, CORS discipline, authenticated redirects, and testable utility logic.
