# Update Log: naimeanV2.0

# Vision & User Flow

- User freehands naimean.com in browser → lands on C64-themed landing page
- Entertaining games/experiences to keep user engaged
- Clear call-to-action: join Discord (main community hub)
- Discord is used for authentication (OAuth and local email auth both now exist in the repo)
- Message board / shoutbox remains a future server-side feature
- Discord join prompt and widget overlay

# Technical/Design Constraints

- Pure HTML/CSS/JS for the main site (no frontend framework, no bundler, no TypeScript)
- Cloudflare Workers for routing, auth, persistence, and APIs
- D1 for small-footprint durable storage
- Static scenes remain handcrafted and hotspot-driven
- Minimal dependency footprint; `naimean-api/` carries its own Wrangler `package.json`

# Features (Current & Planned)

## Current
- Commodore 64-themed landing page
- Interactive power button with CRT-on effect
- Animated shadow layer
- Static/prank video/audio flow
- Discord OAuth flow
- Email registration/login flow
- D1-backed counter, layout overrides, and registered users
- Separate `naimean-api` Worker under `/api/*`

## In Progress
- Continuing docs/runtime cleanup around Cloudflare handoff details
- Closing the gap between server-side `/go/*` redirects and remaining legacy client-side direct tool URLs
- Expanding recommendation backlog into a more practical operations roadmap

## Next Steps
1. Finish Cloudflare handoff validation with Felipe
2. Decide whether `ROUTER_SECRET` should be implemented or retired from docs
3. Move all tool launches behind `/go/*`
4. Add stronger Cloudflare monitoring / WAF / Zero Trust controls
5. Add broader e2e coverage for auth, layout, and API flows
6. Continue UI/UX, accessibility, and media optimization work

# Deployment Plan
- Ensure all required Cloudflare resources exist before merge-to-main deploys
- Validate on `naimean.com`, `www.naimean.com`, and `naimean.com/api/*`
- Keep Worker docs aligned with actual route/config behavior
- Push changes to `main` only after CI is green

---

# Update Log

## 2026-04-23 (documentation and handoff refresh)
- Rewrote `README.md` as a detailed repository explainer with current runtime architecture, repo structure, Cloudflare setup notes, and current transitional caveats
- Refreshed `CLOUDFLARE_README.md` so it now reflects the real route surface (`/layout`, `/api/*`), Worker layout, storage bindings, and current Cloudflare-side caveats
- Refreshed `FELIPE_HANDOFF.md` with a current Cloudflare checklist, validation steps, and explicit warnings about `ROUTER_SECRET`, `/layout`, and `/api/health`
- Updated `naimean-README.md` so the repo CV reflects the current Workers, auth stack, scene pages, and docs set
- Reworked `PLAN.md` recommendation backlog with newer operational/security items and clearer priority groupings
- Documented current docs/runtime mismatches explicitly, including the unused `ROUTER_SECRET` and the remaining legacy hardcoded tool URLs in `public/script.js`

## 2026-04-21 (P0: worker-side rate limiting)
- Started next achievable recommendation task by defining a release checklist in `README.md` covering cross-browser, mobile, accessibility, regression, CI, and deployment sanity checks.
- Added IP-keyed sliding-window rate limiting to `cloudflare-worker/worker.js` for all API routes: 10 req/min on POST `/hit`+`/increment` (shared bucket), 5 req/min on `/auth/discord/login` and `/auth/discord/callback`, 10 req/min on `/auth/logout`, 30 req/min on `/auth/session`, `/go/*`, and 60 req/min on GET `/get`.
- Rate limiter returns 429 with a `Retry-After` header computed at check time (no timestamp race).
- `CF-Connecting-IP` is used as the client key (Cloudflare-injected, not spoofable); falls back to `X-Forwarded-For` for non-Cloudflare environments.
- Periodic stale-entry eviction (every 500 new-entry creations) bounds isolate memory usage.
- Rate limiting can be disabled per-deployment via `RATE_LIMIT_ENABLED=false` (used in test env).
- Added endpoint contract tests and layout/email-auth coverage to `cloudflare-worker/worker.test.js`.
- Strengthened wrangler config validation in `.github/workflows/github-pages.yml` with compatibility-date checks, route-alignment checks, binding checks, and schema existence checks.
- Added `deploy-workers` CI job to automate `wrangler deploy` for `naimeanv2`, `barrelrollcounter-worker`, and `naimean-api` on push to main/master; requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Added CSRF same-origin guard on POST `/auth/logout`.
- Updated worker/runtime docs around route alignment and Cloudflare deployment.
- Strengthened `src/index.js` edge security headers across all response types.
- Added `cloudflare-worker/worker.test.js` — unit and contract tests using the Node.js built-in test runner.
- Tightened CORS allowlisting by environment in `cloudflare-worker/worker.js`.
- Upgraded `.github/workflows/github-pages.yml` CI with JS syntax validation, wrangler config checks, route-alignment assertion, worker tests, and asset existence checks.
- Accessibility: added `role="log"`, `aria-live="polite"`, `aria-label`s, `<main>`, `fetchpriority="high"`, and visible keyboard focus styles.

## 2026-04-20
- Started highest-priority roadmap item by adding a shoutbox mini-game command flow.
- Added in-screen system/game status messages and number-guess gameplay (`C:\Naimean\play`).
- Preserved existing `C:\Naimean\please` unlock behavior while allowing mini-game replay.
- Started Discord OAuth integration foundation with new `/auth/discord/*`, `/auth/session`, and `/auth/logout` worker routes.
- Added shoutbox auth command wiring (`C:\Naimean\login`, `C:\Naimean\logout`) and in-screen auth status messaging.
- Added Discord OAuth callback result handling in the boot/shoutbox flow with one-time URL cleanup and status feedback.
- Started edge security-header hardening across frontend and API worker responses.
- Moved counter write flow to POST-only.
- Tightened CORS allowlisting with environment-aware origin controls.

## 2026-04-15
- Data light moved down 3px and right 5px for precise placement.
- Power button border removed, glow effect retained.
- White color now blue-tinted to match Commodore palette.
- Animated shadow layer improvements.
- README, PLAN, and UPDATE docs refreshed.

## Previous Updates
- Interactive power button and CRT-on animation
- Animated shadow layer and flicker logic

---
_Automated update by GitHub Copilot_
