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
- Integrate Discord OAuth foundation routes and shoutbox auth command flow
- Enforce edge security headers baseline (CSP/HSTS and strict browser headers)

## Next Steps
1. Add entertaining mini-games or interactive experiences
2. Integrate Discord OAuth for registration/authentication ✅ (PKCE/state/session/logout hardening complete)
3. Implement message board (shoutbox) for registered users (server-side backend TBD)
4. Discord widget overlay and join prompt
5. Video/sound/static overlay sequencing (beyond current static/audio)
6. Final UI/UX polish based on user feedback ✅ (focus-visible, aria-labels, main landmark added)
7. Accessibility review (keyboard, ARIA, color contrast) ✅ (role=log, aria-live, focus-visible styles)
8. Add more C64-style effects (optional)
9. Prepare for deployment (static hosting) ✅ (CI guardrails, route alignment, cache headers)
10. Update documentation ✅

## Planned Feature Spec — Bedroom Selector (Dark Fantasy Scene)

### Goal
- Build an interactive **Bedroom Selector** directly inside the `bedroom_antechamber` scene at the foot of the stairs (between the stair landing and bedroom doorway) so it feels diegetic and in-world.

### Tech Stack / Scope
- Plain HTML, CSS, and JavaScript only
- No frameworks
- No backend logic yet
- Submit action placeholder: play `assets/wrong.mp3`

### Files / Context
- Background image: `assets/bedroom_antechamber.png`
- Placeholder sound: `assets/wrong.mp3`

### Build Requirements
1. Scene container using the `bedroom_antechamber` image
2. Interactive Bedroom Selector hotspot near the bedroom door area
3. Hidden/collapsible selector panel that opens from hotspot/door click
4. Panel content:
   - Dropdown label: **Bedroom Style**
   - Textarea label: **Bedroom Creator**
   - Submit button
5. Submit behavior:
   - Play `assets/wrong.mp3`
   - `console.log` dropdown + textarea values
6. Support desktop and mobile

### Visual/Interaction Direction
- Dark cave/fantasy tone
- Warm gold/amber near bedroom, deep blue/purple elsewhere
- Door should feel interactive with subtle glow/shimmer/pulse
- Optional lightweight floating particles near doorway on active state
- Clicking door opens panel
- Panel can emerge from doorway/floor/unfold like magical plaque/rune slab
- Smooth, atmospheric transitions (not tacky)
- Avoid generic floating modern-form look

### Form Content
- Bedroom Style options:
  - Cozy Modern
  - Gothic Stone
  - Royal Chamber
  - Ruined Cell
  - Fungal Sanctuary
  - Torchlit Monk Cell
- Textarea placeholder:
  - `Describe the bedroom you want... colors, mood, furniture, candles, windows, drapery, creepy details, whatever.`
- Button text: **Submit**

### UX Requirements
- Door hotspot is easy to tap on mobile
- Panel remains readable on small screens
- Animations degrade gracefully on mobile
- Click outside panel closes it
- Escape key closes it on desktop
- Panel should not cover full artwork unless screen size requires

### Deliverables
1. Full HTML
2. Full CSS
3. Full JavaScript
4. No placeholder snippets
5. Intuitive class/id names
6. Copy/paste ready output
7. Brief comments only where needed

# Deployment Plan
- Ensure all assets are present and optimized
- Test on major browsers and mobile
- Deploy to static hosting (e.g., GitHub Pages, Vercel, Netlify)
- Push all changes to GitHub main branch

# Recommendations for Naimean.com

## P0 — Immediate Priority (Security + Abuse Prevention)
- Enforce strict Content Security Policy (CSP), HSTS, and secure headers at the edge (Cloudflare). ✅
- Use Discord OAuth with PKCE/state validation and short-lived session tokens. ✅
- Add Cloudflare WAF + bot protections (managed rules, rate limits, and Turnstile where user input/upload endpoints exist).
- Add rate limiting and bot protection for shoutbox/auth endpoints.
- Sanitize and escape all user-generated shoutbox content to prevent XSS. ✅
- Add secret management and dependency vulnerability scanning in CI. ✅ (dependency-review-action added to PR workflow)
- Move privileged external tool links and role logic out of public client code; enforce authorization server-side for any internal resources. ✅ (hardcoded tool URLs removed from client; /go/* routes added with session auth gate)
- Add Cloudflare One / Zero Trust Access policies for admin/backdoor operations and any non-public dashboards/endpoints.

## P1 — Near-Term Priority (Stability + Delivery Confidence)
- Align Cloudflare route documentation/config with actual proxy behavior (`/board*` and `/uploads/*` are documented/configured but not currently proxied in `src/index.js`).
- Replace state-changing `GET` counter endpoints (`/hit`, `/increment`) with `POST` (or require signed requests) to reduce abuse and accidental triggering.
- Tighten CORS allowlisting by environment and remove broad wildcard origins (e.g., unrestricted `*.pages.dev`) unless strictly required.
- Add Cloudflare-focused CI checks (wrangler config validation, route smoke tests, and endpoint contract checks) on pull requests.
- Add automated test coverage for core flows (boot, overlays, auth, shoutbox posting).
- Set up linting/formatting checks for HTML/CSS/JS in pull requests.
- Add error logging and performance monitoring (client + edge) with alerting.
- Use a defined release checklist (cross-browser, mobile, accessibility, regression checks).
- Add clear ownership and issue templates for bug reporting/triage.

## P2 — Planned Priority (Performance + Product Quality)
- Convert heavy images/video to modern formats (WebP/AVIF, optimized MP4/WebM).
- Enable CDN caching with versioned assets and long cache-control headers.
- Minify/compress CSS/JS and defer non-critical scripts.
- Lazy-load non-critical media and overlays after first meaningful render.
- Preload critical assets (hero image, key CSS, essential audio) to improve startup time.
- Improve onboarding with a short “how to interact” prompt on first visit.
- Add clearer loading/boot feedback states so users know what is happening.
- Optimize mobile touch targets and spacing around interactive controls.
- Provide keyboard-accessible interaction paths and visible focus indicators.
- Add lightweight in-context hints for puzzles/interactions to reduce drop-off.
- Standardize Worker compatibility dates and deployment controls across frontend/backend workers to reduce drift.
- Define D1/R2 operational safeguards: migration strategy, scheduled backups/exports, and restore runbooks.
- Add edge observability baselines (Worker logs, latency/error SLOs, and alerting for counter/API failures).

---
_Last updated: 2026-04-20_
