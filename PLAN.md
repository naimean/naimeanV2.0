# Development Plan: naimeanV2.0

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

# Cloudflare Interaction Improvement Plan

1. Align proxy routes in `/src/index.js` with `run_worker_first` in `/wrangler.toml`
   - Today, wrangler lists `/board`, `/board-upload`, `/board-delete`, and `/uploads/*`, but router code only proxies `/get`, `/hit`, and `/increment`.
   - Action: keep route lists in sync to prevent behavior mismatches between config and runtime.

2. Consolidate API endpoint resolution logic used in `public/script.js` and `public/chapel.html`
   - Both files implement near-identical endpoint candidate + fetch fallback logic.
   - Action: centralize shared logic into one reusable frontend module to reduce drift and bugs.

3. Standardize backend worker binding expectations
   - `/cloudflare-worker/worker.js` serves non-counter paths via `env.ASSETS.fetch(request)`, but `cloudflare-worker/wrangler.toml` only declares D1 binding.
   - Action: either add `ASSETS` binding to backend config or remove backend static serving path for clarity.

4. Add explicit API contract documentation for all worker routes
   - `/get`, `/hit`, `/increment` are implemented and used, while board/upload routes are configured upstream but not represented in router code.
   - Action: document implemented vs planned routes to avoid integration confusion.

5. Introduce Cloudflare-focused CI checks
   - Current CI validates static assets for GitHub Pages deployment only.
   - Action: add a Cloudflare deploy-check workflow (wrangler config validation, route consistency checks, optional `wrangler deploy --dry-run` where available).

6. Improve secrets/config parity checks
   - Cloudflare and GitHub deploy guidance exists, but enforcement is manual.
   - Action: add pre-deploy checklist/automation for required secrets and bindings (`COUNTER`, `DB`, and any future upload bindings).

---
_Last updated: 2026-04-16_
