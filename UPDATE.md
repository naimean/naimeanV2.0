# Update Log: naimeanV2.0

# Vision & User Flow

- User freehands `naimean.com` in browser -> lands on the C64-themed landing page
- Entertaining games/experiences keep the user engaged
- Discord remains the main community/auth hub — current invite: `https://discord.gg/kTkD7N3JN` (30-day Guest invite; accepted guests get upgraded to Peon role)
- Discord OAuth and local email auth both exist in the repo today
- Cloudflare Workers own routing, auth, persistence, and API behavior

# Technical/Design Constraints

- Pure HTML/CSS/JS for the main site (no frontend framework, no bundler, no TypeScript)
- Cloudflare Workers for routing, auth, persistence, and APIs
- D1 for durable storage with small operational footprint
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
- D1-backed counter, layout overrides, registered users, and API entries
- Separate `naimean-api` Worker under `/api/*`

## In Progress
- Finishing Cloudflare handoff alignment across repo docs
- Closing the gap between server-side `/go/*` redirects and remaining client-side direct tool URLs
- Turning the recommendation backlog into a more concrete operations roadmap

## Next Steps
1. Set the four missing `barrelrollcounter-worker` secrets
2. Finish Cloudflare handoff validation with Felipe
3. Decide whether `ROUTER_SECRET` should be implemented or retired from docs
4. Move all tool launches behind `/go/*`
5. Add stronger Cloudflare monitoring / WAF / Zero Trust controls
6. Verify D1 schemas directly if Cloudflare metadata drift continues

# Deployment Plan
- Ensure all required Cloudflare resources exist before merge-to-main deploys
- Validate on `naimean.com/*`, `www.naimean.com/*`, `uploads.naimean.com/*`, and `naimean.com/api/*`
- Keep Worker docs aligned with actual route/config/runtime behavior
- Push code changes only after existing validation passes

---

# Update Log

## Emulator Feature Synopsis (as of 2026-04-26)

The EmulatorJS arcade integration is now feature-complete. All eight items from `EMULATOR_PLAN.md` are shipped:

1. **ROM filenames as display names** — the game list shows the raw filename (minus extension) instead of a separate translated `name` field, keeping the UI and the actual file in perfect sync.
2. **Platform section headers** — games are grouped visually under their console label (NES, SNES, GB, etc.) so the list stays navigable as more ROMs are added.
3. **Simplified `manifest.json`** — plain filename arrays per system replace the old `{ name, file }` object format; the display name derives directly from the filename.
4. **Self-hosted EmulatorJS on Cloudflare R2** — `loader.js`, `emulator.min.js`, and `emulator.min.css` are self-hosted in `public/assets/retroarch/`. All 20 core `.data` files (~23 MB) live in the `retroarch-cores` R2 bucket to avoid git bloat. The edge router (`src/index.js`) intercepts `/assets/retroarch/cores/*.data` requests, serves from R2 with ETag/304 cache validation, and applies `Cache-Control: public, max-age=31536000, immutable`. CI uploads/refreshes cores on every push to main via `scripts/upload-cores-to-r2.js`.
5. **Keyboard/gamepad control overlay** — a brief on-screen control reference appears when a game first loads.
6. **Escape key closes arcade overlay** — pressing Escape (when not in fullscreen) dismisses the picker/player entirely rather than only exiting fullscreen.
7. **Per-system keyboard controls in the hint overlay** — the controls hint shows the correct button layout for the active system (NES, SNES, GBA, N64, Sega Genesis, etc.) and updates the title accordingly.
8. **Remember last-played game** — the last launched game (`system` + `file`) is saved to `localStorage` and auto-selected when the arcade reopens.

The asset tree for the arcade is:
```
public/assets/retroarch/
  loader.js
  emulator.min.js
  emulator.min.css
  cores/          <- .gitignored; served from R2 at runtime
  compression/    <- 7z decompression utilities

public/assets/roms/
  manifest.json   <- filename-only arrays per system
  nes/            <- Legend of Zelda, Super Mario Bros 2, 3, Duck Hunt combo
  snes/, gb/, gba/, n64/, segaMD/, atari2600/ (ready for ROMs)
```

## 2026-04-26 (cores migrated from git to Cloudflare R2 — cache busting)
- Moved all 20 EmulatorJS core `.data` archives (~23 MB) out of git and into the Cloudflare R2 bucket `retroarch-cores` to prevent git bloat.
- Added `CORES` R2 binding in `wrangler.toml`; added `/assets/retroarch/cores/` to `run_worker_first` so the edge worker intercepts core requests.
- `src/index.js` now serves `/assets/retroarch/cores/*.data` from R2 with:
  - ETag (R2 content hash) for HTTP cache validation
  - 304 Not Modified support when `If-None-Match` matches (cache busting — browsers skip re-download if the core hasn't changed)
  - `Cache-Control: public, max-age=31536000, immutable` for efficient long-lived caching
- Added `scripts/upload-cores-to-r2.js` (no external deps) to upload/refresh cores in R2 via the Cloudflare REST API.
- CI (`deploy-workers` job) now downloads cores and uploads them to R2 on every push to main.
- Removed the core download step from the GitHub Pages `deploy` job (cores are no longer needed in the Pages artifact).
- Added `public/assets/retroarch/cores/*.data` to `.gitignore`; binary blobs removed from git tracking.
- Updated `EMULATOR_PLAN.md` item 4 to reflect the R2-based architecture.

## 2026-04-26 (retroarch asset reorganisation)
- Moved all self-hosted EmulatorJS assets from `public/assets/emulatorjs/` to `public/assets/retroarch/`.
  - Cores (`.data` header files) are now at `public/assets/retroarch/cores/`; core audit reports live under `public/assets/retroarch/cores/reports/`.
  - Compression utilities moved to `public/assets/retroarch/compression/`.
  - `loader.js`, `emulator.min.js`, and `emulator.min.css` are now served from `public/assets/retroarch/`.
- Updated `LOCAL_EJS_PATH` constant in `public/script.js` from `/assets/emulatorjs/` to `/assets/retroarch/`.
- Updated path comment in `src/index.js` to reflect the new location.
- Updated `EMULATOR_PLAN.md` item 4 to reference the new `public/assets/retroarch/` tree.

## 2026-04-24 (Discord invite refresh + polish backlog)
- Updated Discord invite link to `https://discord.gg/kTkD7N3JN` (30-day Guest invite); added `DISCORD_FALLBACK_INVITE_URL` constant in `public/script.js` and `public/chapel.html` so the invite link is always reachable even if the Discord widget API does not return an `instant_invite`.
- Fix: chapel roll audio now seeks to compensate for the navigation delay so the rickroll audio continuation feels seamless (#322).
- Fix: rock roll continuation timing set to 5 s at 50 % volume followed by a 3 s fade-out (#321).
- Fix: `incrementRickrollCount` is now fire-and-forget so the rickroll redirect is not delayed by a slow network (#319).
- Fix: mobile submit and hint bars now constrain to shadow-layer right-1px; boot-input-row extended to shadow-layer right-1px (#320).
- Fix: zelda secret audio volume set to 50 % (#318).
- Feat: Discord invite window is automatically closed when the user returns to chapel after following the invite link (#317).
- Fix: 3-second submit delay added when the boot screen opens from the static-video transition (#316).
- Fix: chapel trapdoor Discord auth popup no longer hijacks the post-login redirect route (#315).

## 2026-04-23 (Cloudflare infrastructure handoff refresh)
- Rewrote `CLOUDFLARE_README.md` to mirror the current Cloudflare infrastructure handoff: account ID, worker inventory, D1/KV IDs, route priority, GitHub Actions expectations, manual deploy steps, known issues, and hardening recommendations
- Updated `README.md` so the main repo explainer now reflects the current Cloudflare account, route map, storage inventory, missing secrets, undocumented secrets, and revised recommendation backlog
- Updated `FELIPE_HANDOFF.md` with explicit production blockers, missing-secret callouts, account/ID references, D1 verification commands, and hardening follow-ups
- Updated `naimean-README.md` so the repo CV reflects the newer Cloudflare resource inventory and current operational caveats
- Updated `PLAN.md` to prioritize missing secrets, undocumented secret inventory, D1 verification, `naimean-sessions`, and the production-routing requirement through `naimeanv2`
- Removed older/outdated assumptions from the docs in favor of the current Cloudflare handoff state

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
