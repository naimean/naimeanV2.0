# Naimean V2.0

A Commodore 64-themed interactive personal website — rickroll trap, Discord community hub, and private tool launcher — deployed on Cloudflare Workers backed by GitHub Pages.

> **He boiled for our sins.**

---

## Vision

- User types `naimean.com` into their browser → lands on a C64-themed landing page
- Entertaining puzzles and experiences keep them engaged
- Clear call-to-action: join the Discord community
- Discord OAuth gates the authenticated shoutbox and internal tool links
- Private tool redirects (Whiteboard, Cap-Ex, ServiceNow) require a valid session

---

## Architecture

Two Cloudflare Workers collaborate at runtime. GitHub Pages hosts the static files.

```
Browser
  │
  ▼
naimeanv2 (edge router — src/index.js)
  │
  ├─ /get, /hit, /increment, /auth/*, /go/*  ──────────► barrelrollcounter-worker
  │   (Service binding: COUNTER)                          (cloudflare-worker/worker.js)
  │                                                              │
  │                                                      D1: barrelroll-counter-db
  │                                                      Discord OAuth API (v10)
  │
  └─ everything else  ──────────────────────────────────► ASSETS binding
                                                          (GitHub Pages / public/)
```

Custom domains:
- `naimean.com` → `naimeanv2`
- `www.naimean.com` → `naimeanv2`

Cloudflare zones: `naimean.com`, `madmedia.studio` (both active, nameservers: `felipe.ns.cloudflare.com`, `veronica.ns.cloudflare.com`)

---

## Worker 1 — Edge Router (`src/index.js`)

~80 lines. One job: route and stamp security headers.

**Routing:**
- `PROXY_PATHS = ["/get", "/hit", "/increment", "/auth", "/go"]` → forwarded to `barrelrollcounter-worker` via the `COUNTER` service binding
- All other paths → served from the `ASSETS` binding (GitHub Pages static files)

**Security headers applied to every response:**

| Header | HTML pages | API / all other |
|---|---|---|
| `Content-Security-Policy` | Full `DOCUMENT_CSP` (fonts, Discord iframes, self scripts) | Strict `API_CSP` (`default-src 'none'`) |
| `Cache-Control` | `no-cache, must-revalidate` | `public, max-age=31536000, immutable` for media/fonts |
| `X-Content-Type-Options` | `nosniff` | `nosniff` |
| `X-Frame-Options` | `DENY` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera/mic/geo/etc all `()` | same |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (HTTPS only) | same |

Config: `wrangler.toml` (root). `run_worker_first` list in wrangler.toml must stay in sync with `PROXY_PATHS` in `src/index.js` — CI enforces this.

---

## Worker 2 — Counter / Auth / Go-Redirect (`cloudflare-worker/worker.js`)

~770 lines. All business logic lives here.

### API Endpoints

| Method | Path | Auth required | What it does |
|---|---|---|---|
| `GET` | `/get` | No | Returns `{ value: N }` — current rickroll count |
| `POST` | `/hit` | No | Atomically increments count, returns `{ value: N }` |
| `POST` | `/increment` | No | Alias of `/hit` |
| `GET` | `/auth/session` | No | Returns `{ authenticated, user }` from session cookie |
| `GET` | `/auth/discord/login` | No | Starts Discord OAuth2 PKCE flow → redirects to Discord |
| `GET` | `/auth/discord/callback` | No (validates state+PKCE) | Completes OAuth, sets session cookie, redirects back |
| `POST` | `/auth/logout` | No (CSRF-guarded) | Clears session cookie |
| `GET` | `/go/whiteboard` | ✅ Session cookie | 303 redirect to Whiteboard URL |
| `GET` | `/go/capex` | ✅ Session cookie | 303 redirect to Cap-Ex URL |
| `GET` | `/go/snow` | ✅ Session cookie | 303 redirect to ServiceNow URL |
| `OPTIONS` | any of the above | No | CORS preflight |

### Session Tokens

Homemade signed tokens (no external JWT library). Format: `base64url(JSON payload) + "." + HMAC-SHA256(payload, SESSION_SECRET)`. Verified via `crypto.subtle` in the Workers runtime. Session TTL: 7 days. OAuth flow TTL: 10 minutes.

### Discord OAuth (PKCE)

1. `GET /auth/discord/login` → generates `state` (18-byte random) + `codeVerifier` (48-byte random), derives `codeChallenge = sha256(codeVerifier)`, stores signed `naimean_discord_oauth` cookie, redirects to Discord's `/oauth2/authorize`
2. Discord redirects back to `GET /auth/discord/callback` with `code` + `state`
3. Worker validates state, exchanges `code`+`codeVerifier` for access token, fetches `/users/@me`, creates 7-day `naimean_session` cookie, redirects to `/?auth=success`

### CORS

Allowed in production: `naimean.com`, `www.naimean.com`, `naimean.github.io`. Localhost origins added automatically when `APP_ENV` ≠ `production`. Hostname suffix wildcard requires explicit `CORS_ALLOW_PROD_ORIGIN_SUFFIXES=true` in production.

### Required Cloudflare Secrets

Set via `wrangler secret put <NAME>`:

| Secret | Purpose |
|---|---|
| `SESSION_SECRET` | HMAC key for signed session + OAuth cookies |
| `DISCORD_CLIENT_ID` | Discord OAuth app client ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth app client secret |
| `DISCORD_REDIRECT_URI` | Discord OAuth callback URL |
| `ROUTER_SECRET` | Shared secret for internal route authentication |
| `TOOL_URL_WHITEBOARD` | Destination URL for `/go/whiteboard` |
| `TOOL_URL_CAPEX` | Destination URL for `/go/capex` |
| `TOOL_URL_SNOW` | Destination URL for `/go/snow` (hardcoded ServiceNow SAML fallback baked in if unset) |

### Optional Environment Variables

| Variable | Purpose |
|---|---|
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins to add to the CORS allowlist |
| `CORS_ALLOWED_ORIGIN_SUFFIXES` | Comma-separated hostname suffixes for scoped wildcard CORS |
| `CORS_ALLOW_PROD_ORIGIN_SUFFIXES` | Set `true` to enable suffix matching in production |
| `APP_ENV` / `ENVIRONMENT` | Set to non-`production` to allow localhost origins |

---

## Database

One D1 SQLite table (`cloudflare-worker/schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS rickroll_counter (
  id    TEXT    PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO rickroll_counter (id, value) VALUES ('rickrolls', 0);
```

One row (`id = 'rickrolls'`). The `UPDATE … RETURNING value` trick makes increments atomic without a separate SELECT.

Initialize: `wrangler d1 execute barrelroll-counter-db --file=cloudflare-worker/schema.sql`

Database ID: `22277fbe-031d-4cad-8937-245309e981cd`

Other Cloudflare storage (not currently bound in this repo):
- **R2** — `radley-gallery` bucket
- **KV** — `naimean-sessions` namespace

---

## Static Pages (`public/`)

All files in `public/` are deployed to GitHub Pages and served via the `ASSETS` binding.

| File | Description |
|---|---|
| `index.html` | Main page — Commodore 64 UI |
| `script.js` | All C64 interactivity (~45 KB) |
| `diagnostics.js` | Hidden debug panel (activate: `?diag=1` or `Ctrl+Shift+D`) |
| `styles.css` | Global stylesheet |
| `chapel.html` | Rickroll destination — the Chapel |
| `bedroom.html` | Horizontally-scrolling bedroom scene |
| `bedroom_antechamber.html` | Antechamber between chapel and bedroom (procedural door-close audio) |
| `first_level.html` – `ninth_level.html` | Nine puzzle levels; full-viewport image + Back/Forward nav |
| `level_one.html` | Alias used by antechamber "Descend to first level" link |
| `assets/` | Images (`.png`/`.jpg`), videos (`.mp4`), audio (`.mp3`) |

---

## The C64 Homepage — State Machine

The homepage is a photograph of a Commodore 64. All UI layers are positioned absolutely over the image.

### States

1. **Cold start** — C64 image visible, shadow layer over screen, power button in the corner. Screen is OFF.

2. **Power button click** → `runInitialPowerOnSequence()`:
   - Shows Discord widget iframe overlay for 3 seconds
   - Plays a short static TV noise clip (`assets/static.mp4`)
   - Shows the blue "Nedry Gate" boot screen

3. **Nedry Gate (boot screen)** — input locked to prefix `C:\Naimean\User\`:
   - Typing a suffix checks `BOOT_ROLE_VISIBILITY_BY_USER` (hardcoded user codes: `ADMIN`, `RCA`, `MAD`, `JV`, `KB`, `JY`, `RD`, `JS`, `JD`, `DL`, `EW`, `RAD`, `SED`) and shows/hides quick-launch buttons (Whiteboard, Cap-Ex, ServiceNow) per role
   - Submitting an unknown code → wrong-answer sound, reset
   - Submitting a known code → `runNedryGateSequence()`: plays `assets/joinourdiscord.mp4`, transitions to the shoutbox terminal

4. **Power button (second click, after 5s cooldown)** → `runPowerOffPrank()`:
   - Plays power-off video overlay
   - Transitions through static
   - Plays prank video (`assets/notarickroll.mp4`)
   - After 5s: increments rickroll counter via `POST /increment`, saves video playback state to `sessionStorage`, navigates to `chapel.html`

5. **Shoutbox terminal** (after Nedry gate) — input locked to `C:\Naimean\`:

   | Input | Effect |
   |---|---|
   | `C:\Naimean\please` / `Please` | Plays Zelda secret chime, prank video, increments counter, goes to `chapel.html` |
   | `login` / `signin` / `discord` | Redirects to `GET /auth/discord/login` |
   | `logout` / `signout` | Calls `POST /auth/logout`, clears session |
   | `play` / `game` / `start` | Starts 1–9 number-guessing mini-game (5 attempts) |
   | A number (1–9) while game active | Validates guess, gives "too high/low" feedback |
   | Anything else | Wrong-answer sound, reset |

   - A hint ("You didn't say the magic word.") is hidden behind a cover that gradually reveals as you move the mouse across it; clicking reveals it fully
   - Auth status message shown on open; Discord OAuth outcomes (`?auth=success/error`) consumed from URL and displayed as one-time status messages

6. **Quick-launch buttons** (Whiteboard, Cap-Ex, Snow):
   - `window.open('/go/<tool>', '_blank')` → worker verifies session cookie → 303 redirect to tool URL

7. **Return bypass button** — invisible, positioned over the C64 screen:
   - Click or `Enter` key (while screen is off) → black fade → `chapel.html`

### Rickroll Counter Display

The boot screen shows a 2-digit counter. On load, `script.js` calls `GET /get` (no-cache timestamp appended) and displays the result. Value is cached to `localStorage` as a fallback if the API is unreachable. When the prank fires, `POST /increment` is called before navigation.

---

## The Chapel (`chapel.html`)

Chapel scene with stitched PNG layers, warm torch bloom CSS overlays (`mix-blend-mode: lighten`), and a pulsing animated power light over a miniature C64 on the altar.

- **Rickroll counter** shown on a "TV screen" (reads `GET /get` on load)
- **Rock-roll continuation** — if `sessionStorage` has a saved video playback position from the prank, the video resumes from that position before congregation audio starts
- **Discord invite redirect** — if the `naimean-discord-invite-redirect-pending` flag is set in `sessionStorage`, queries the Discord Widget API for a live invite link and opens it (falls back to in-page Discord iframe widget)
- **Chapel return button** — invisible hotspot over the C64 screen → black fade → `index.html`
- **Trapdoor button** — invisible hotspot at the bottom → `bedroom_antechamber.html`
- **Congregation audio** (`assets/congregation.mp3`) plays on arrival

---

## Level Sequence

```
index.html
  └─► chapel.html (prank destination)
        └─► bedroom_antechamber.html
              ├─► bedroom.html (horizontal-scroll inertia scene)
              └─► first_level.html ↔ second_level.html ↔ … ↔ ninth_level.html
```

Nine level pages share a template: full-viewport image, 72px nav bar with Back/Forward. No JS, no API calls — pure static.

`bedroom.html` has a `requestAnimationFrame`-based inertia scroller with mouse-wheel and click-nudge support. Clicking the doorway hotspot returns to the antechamber.

---

## Worker 3 — naimean-api (`naimean.com/api/*`)

A standalone Cloudflare Worker deployed separately from this repo. Route: `naimean.com/api/*` → `naimean-api`.

### API Endpoints

| Method | Path | Description | Body |
|---|---|---|---|
| `GET` | `/api/health` | Health check | — |
| `GET` | `/api/data` | List all entries | — |
| `POST` | `/api/data` | Create an entry | `{ "title": "...", "content": "..." }` |

### Database

| Resource | Name | ID |
|---|---|---|
| D1 Database | `naimean-db` | `0871f90d-f7e3-467a-a1f9-4e74ac8aef42` |

Schema — table `entries`:

| Column | Type | Description |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Auto-generated ID |
| `title` | `TEXT` | Entry title |
| `content` | `TEXT` | Entry content |
| `created_at` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | Creation timestamp |

### Cloudflare Resources

| Resource | Name | ID |
|---|---|---|
| Worker | `naimean-api` | — |
| D1 Database | `naimean-db` | `0871f90d-f7e3-467a-a1f9-4e74ac8aef42` |
| Zone | `naimean.com` | `dc46eab0761d2ce7e372ea996e8735ea` |
| Workers Route | `naimean.com/api/*` | `8be1b1b6388944e4910a6def585e4f15` |

### Deployment (naimean-api)

Deployed from its own repository via Cloudflare Wrangler. `wrangler.toml` key config:

```toml
name = "naimean-api"
main = "src/worker.js"
compatibility_date = "2026-04-14"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "naimean-db"
database_id = "0871f90d-f7e3-467a-a1f9-4e74ac8aef42"
```

### API Token Permissions (naimean-api CI/CD)

The `CLOUDFLARE_API_TOKEN` for that repo requires:
- **Account-level:** Workers Scripts: Edit, D1: Edit, Account Settings: Read
- **Zone-level (naimean.com):** Workers Routes: Edit

---

## CI/CD Workflows (`.github/workflows/`)

### `github-pages.yml` — Main Pipeline

Triggers: push to `main`/`master`, PRs against them, manual dispatch.

| Job | When | Steps |
|---|---|---|
| `lint-and-check` | Always | `node --check` all 4 JS files; `node --test worker.test.js`; grep-validates both `wrangler.toml` files; asserts `/auth` exists in both `run_worker_first` and `PROXY_PATHS`; checks required static assets exist |
| `deployment-check` | PR only | Verifies assets, configures GitHub Pages (dry-run) |
| `dependency-review` | PR only | `actions/dependency-review-action` — catches vulnerable dependency additions |
| `deploy` | Push to main only (after `lint-and-check`) | Uploads `public/` as a GitHub Pages artifact and deploys it — no build step, no node_modules |

### `copilot-setup-steps.yml`

Sets up Node.js 22 for the Copilot coding agent environment. Only runs when the workflow file itself changes or on manual dispatch.

### Required GitHub Secrets (for automated Wrangler deploy — not yet wired up)

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Token with Workers deploy permissions |

---

## Local Development

```bash
# Install Wrangler globally
npm install -g wrangler

# Login (local only — never commit credentials)
wrangler login

# Run edge router locally
wrangler dev

# Run counter worker locally
cd cloudflare-worker && wrangler dev

# Set secrets
wrangler secret put SESSION_SECRET
wrangler secret put DISCORD_CLIENT_ID
wrangler secret put DISCORD_CLIENT_SECRET
wrangler secret put DISCORD_REDIRECT_URI
wrangler secret put ROUTER_SECRET
wrangler secret put TOOL_URL_WHITEBOARD
wrangler secret put TOOL_URL_CAPEX
wrangler secret put TOOL_URL_SNOW

# Initialize the D1 database (once)
wrangler d1 execute barrelroll-counter-db --file=cloudflare-worker/schema.sql

# Run worker unit tests
node --test cloudflare-worker/worker.test.js

# Syntax-check all JS files
node --check src/index.js
node --check cloudflare-worker/worker.js
node --check public/script.js
node --check public/diagnostics.js
```

---

## Deployment

| Component | Method | Trigger |
|---|---|---|
| Static files (`public/`) | GitHub Pages via `actions/deploy-pages` | Push to `main` |
| `naimeanv2` edge worker | Manual `wrangler deploy` | Not yet automated in CI |
| `barrelrollcounter-worker` | Manual `wrangler deploy` from `cloudflare-worker/` | Not yet automated in CI |

---

## Diagnostics Console

Activate on any page:
- Add `?diag=1` to the URL
- Run `NaimeanDiag.toggle()` from the browser console
- Press `Ctrl+Shift+D`
- Set `localStorage['naimean-diag'] = '1'` and reload

Public API: `NaimeanDiag.log(msg)`, `NaimeanDiag.set(key, value)`, `NaimeanDiag.del(key)`, `NaimeanDiag.toggle()`, `NaimeanDiag.isActive()`

---

## Security Backlog

### P0 — Immediate

- [ ] Add Cloudflare WAF managed rules + rate limiting on `/hit`, `/increment`, `/auth/*` endpoints
- [ ] Add Cloudflare Turnstile (bot protection) on any user-input or upload endpoints
- [ ] Add Cloudflare Zero Trust / One Access policies for admin/backdoor operations and any non-public dashboards
- [x] Wire up automated `wrangler deploy` for both workers in GitHub Actions CI (requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets in repo)

### P1 — Near-Term

- [ ] Add Cloudflare-focused CI checks: wrangler config validation, route smoke tests, endpoint contract checks on PRs
- [ ] Add automated integration/e2e test coverage for core flows (boot, overlays, auth, shoutbox)
- [ ] Add error logging and performance monitoring (client + edge) with alerting and SLOs
- [ ] Define a release checklist (cross-browser, mobile, accessibility, regression)
- [ ] Implement server-side shoutbox: Discord-authenticated users post messages; persisted in D1 or R2; moderated; requires sanitization and escaping of all user-generated content
- [ ] Move role-visibility config (`BOOT_ROLE_VISIBILITY_BY_USER`) out of public client JS — it currently leaks internal usernames; serve it from a session-authenticated API endpoint instead

### P2 — Planned

- [ ] Convert heavy images/video to modern formats (WebP/AVIF, optimized MP4/WebM)
- [ ] Minify/compress CSS/JS; defer non-critical scripts; preload critical assets
- [ ] Lazy-load non-critical media and overlays after first meaningful render
- [ ] Define D1/R2 operational safeguards: migration strategy, scheduled exports, restore runbooks
- [ ] Add edge observability baselines (Worker logs, latency/error SLOs, alerting for counter/API failures)
- [ ] Standardize Worker compatibility dates and deployment controls across both workers
- [ ] Improve onboarding with a short "how to interact" prompt on first visit

### Completed ✅

- [x] Strict edge security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-Content-Type-Options) on all responses
- [x] Discord OAuth2 PKCE + state validation + short-lived signed session tokens
- [x] POST-only counter writes (`/hit`, `/increment`) — legacy GET write path removed
- [x] CSRF guard on `POST /auth/logout`
- [x] CORS allowlisting tightened: production suffix matching disabled by default; explicit opt-in via env var
- [x] `/auth` route added to `run_worker_first` in `wrangler.toml`; removed unimplemented `/board*` / `/uploads/*` entries
- [x] Worker unit tests (14 tests, Node.js built-in test runner)
- [x] CI: `lint-and-check` job with JS syntax validation, wrangler config checks, route-alignment assertion, unit test run, asset existence checks
- [x] `dependency-review-action` on PRs
- [x] Accessibility: `role="log"`, `aria-live="polite"`, `aria-label`s, `<main>` landmark, `fetchpriority="high"` on hero image, visible keyboard focus rings
- [x] `hardcoded tool URLs removed from client JS; `/go/*` routes with session-auth gate handle redirects server-side
- [x] Immutable cache headers on versioned media/font assets; `no-cache` on HTML
- [x] Automated `wrangler deploy` for both workers in GitHub Actions CI (`deploy-workers` job using `cloudflare/wrangler-action@v3.15.0`; requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets)

---

## Changelog

### 2026-04-20 (hardening + CI + accessibility)
- CSRF same-origin guard on `POST /auth/logout`
- Fixed `wrangler.toml` `run_worker_first`: added `/auth`, removed unimplemented `/board*` and `/uploads/*`
- Updated `cloudflare-worker/wrangler.toml` compatibility date to `2026-04-18`
- Strengthened `src/index.js` edge security headers across all content types
- Added `cloudflare-worker/worker.test.js` — 14 unit tests using Node.js built-in test runner
- Tightened CORS allowlisting: production no longer applies hostname-suffix wildcard matching unless `CORS_ALLOW_PROD_ORIGIN_SUFFIXES=true`
- Upgraded CI: `lint-and-check` job with JS syntax validation, wrangler config checks, route-alignment assertion, worker unit tests, asset checks; `dependency-review-action` on PRs
- Accessibility: `role="log"`, `aria-live`, `aria-label`s, `<main>` landmark, `fetchpriority="high"`, keyboard focus rings

### 2026-04-20
- Shoutbox mini-game command flow (`C:\Naimean\play`) with number-guess gameplay and replay support
- Discord OAuth integration foundation: `/auth/discord/*`, `/auth/session`, `/auth/logout` worker routes
- Shoutbox auth command wiring (`login`, `logout`) and in-screen auth status/outcome messaging
- Edge security headers (CSP/HSTS + baseline browser headers) across frontend and API worker responses
- Counter write flow moved to POST-only; legacy GET write path removed

### 2026-04-15
- Data light moved down 3px, right 5px for precise placement
- Power button border removed; glow effect retained; color blue-tinted to match Commodore palette
- Animated shadow layer improvements

### Earlier
- Interactive power button and CRT-on animation
- Animated shadow layer and flicker logic

---

_Last updated: 2026-04-20_
