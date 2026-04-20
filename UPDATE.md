# Update Log: naimeanV2.0

# Vision & User Flow

- User freehands naimean.com in browser → lands on C64-themed landing page
- Entertaining games/experiences to keep user engaged
- Clear call-to-action: join Discord (main community hub)
- Discord is used for authentication (Auth0 or OAuth)
- Message board (shoutbox): only registered (Discord-authenticated) users can post
- Discord join prompt and widget overlay

# Technical/Design Constraints

- Pure HTML/CSS/JS (no frameworks)
- All overlays (shadow, power button, data light) absolutely positioned within fixed-size, relatively positioned container
- No flexbox for overlays; fixed pixel sizes for C64 image and overlays
- All media assets optimized for fast load

# Features (Current & Planned)

## Current
- Commodore 64-themed landing page
- Interactive power button with CRT-on effect
- Animated shadow layer
- Data (flicker) light next to power button
- Static video/audio overlay (merged with FFmpeg)

## In Progress
- Debug overlay alignment and button clickability
- Shrink and center shadow box, align overlays

## Next Steps
1. Add entertaining mini-games or interactive experiences
2. Integrate Discord OAuth for registration/authentication
3. Implement message board (shoutbox) for registered users
4. Discord widget overlay and join prompt
5. Video/sound/static overlay sequencing (beyond current static/audio)
6. Final UI/UX polish based on user feedback
7. Accessibility review (keyboard, ARIA, color contrast)
8. Add more C64-style effects (optional)
9. Prepare for deployment (static hosting)
10. Update documentation

# Deployment Plan
- Ensure all assets are present and optimized
- Test on major browsers and mobile
- Deploy to static hosting (e.g., GitHub Pages, Vercel, Netlify)
- Push all changes to GitHub main branch

---

# Update Log

## 2026-04-20 (P1: Cloudflare CI checks)
- Added endpoint contract tests to `cloudflare-worker/worker.test.js`: imported the real worker handler with a minimal mock D1 binding and exercised `GET /get`, `POST /hit`, `POST /increment`, `GET /auth/session`, `POST /auth/logout`, `OPTIONS` preflight, method-not-allowed (405), `GET /go/:tool` unauthenticated (401), and required security-header presence. Test suite grows from 17 → 26 passing tests.
- Strengthened wrangler config validation in `.github/workflows/github-pages.yml`: added `compatibility_date` format check (YYYY-MM-DD), `run_worker_first` key presence, `[[d1_databases]]` binding in the counter worker config, and `schema.sql` file existence.
- Replaced the single `/auth` route spot-check with a full bidirectional route-alignment step: verifies every entry in `PROXY_PATHS` appears in `run_worker_first` and vice versa, so config drift between the edge router and the wrangler proxy list is caught in CI.


- Added CSRF same-origin guard on POST `/auth/logout` — blocks cross-origin cookie-clearing attacks while preserving same-site browser behaviour
- Fixed `wrangler.toml` `run_worker_first` list: added `/auth` so auth routes are guaranteed worker-handled; removed unimplemented `/board*` and `/uploads/*` entries to eliminate route/config drift
- Updated `cloudflare-worker/wrangler.toml` compatibility date from `2024-01-01` to `2026-04-18` to match the frontend worker
- Strengthened `src/index.js` edge security headers: all responses now receive `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS regardless of content-type; HTML gets the strict document CSP and a `no-cache` directive; versioned media/font assets get a `max-age=31536000, immutable` cache-control header
- Added `cloudflare-worker/worker.test.js` — 14 unit tests for pure worker utility functions (cookie parsing, base64url, sanitizeReturnPath, CORS helpers) using Node.js built-in test runner
- Tightened CORS allowlisting by environment in `cloudflare-worker/worker.js`: production no longer applies hostname-suffix wildcard matching unless `CORS_ALLOW_PROD_ORIGIN_SUFFIXES=true` is explicitly set
- Upgraded `.github/workflows/github-pages.yml` CI: added `lint-and-check` job with JS syntax validation (`node --check`) for all four source files, wrangler config field checks, route-alignment assertion, worker unit test run, and asset existence checks; `deployment-check` and `deploy` jobs now depend on `lint-and-check`
- Accessibility: added `role="log"` and `aria-live="polite"` to shoutbox messages container; added `aria-label` to shoutbox submit button and boot inline-submit button; wrapped page in `<main>` landmark; added `fetchpriority="high"` to hero C64 image
- Focus-visible styles: added visible keyboard focus ring to power button and all boot-submit buttons

## 2026-04-20
- Started highest-priority roadmap item by adding a shoutbox mini-game command flow
- Added in-screen system/game status messages and number-guess gameplay (`C:\Naimean\play`)
- Preserved existing `C:\Naimean\please` unlock behavior while allowing mini-game replay
- Started Discord OAuth integration foundation with new `/auth/discord/*`, `/auth/session`, and `/auth/logout` worker routes
- Added shoutbox auth command wiring (`C:\Naimean\login`, `C:\Naimean\logout`) and in-screen auth status messaging
- Added Discord OAuth callback result handling in the boot/shoutbox flow with one-time URL cleanup and status feedback
- Started next P0 security item by enforcing edge security headers (CSP/HSTS + baseline browser hardening headers) across frontend and API worker responses
- Started the next priority hardening item by moving counter write flow to POST-first (`/increment`, `/hit`) with legacy GET fallback compatibility
- Started the next priority hardening item by tightening CORS allowlisting with environment-aware origin controls and no default wildcard suffix matching
- Started the next recommendation project by enforcing POST-only counter writes for `/hit` and `/increment` (legacy GET write path removed)

## 2026-04-15
- Data light moved down 3px and right 5px for precise placement
- Power button border removed, glow effect retained
- White color now blue-tinted to match Commodore palette
- Animated shadow layer improvements
- README, PLAN, and UPDATE docs refreshed

## Previous Updates
- Interactive power button and CRT-on animation
- Animated shadow layer and flicker logic

---
_Automated update by GitHub Copilot_
