# Development Plan: naimeanV2.0

## Vision

- Keep `naimean.com` feeling like a memorable interactive experience rather than a generic app shell
- Preserve the no-build, vanilla-web stack where it still helps speed and control
- Use Cloudflare Workers only for the parts that truly need state, auth, routing, secrets, or persistence
- Make the Cloudflare handoff clean enough that Felipe can operate and extend the stack without reverse-engineering the repo first

---

## Current state snapshot

### Working today
- C64 homepage, prank flow, chapel, bedroom, and level sequence
- edge router Worker (`naimeanv2`)
- main backend Worker (`barrelrollcounter-worker`)
- separate `/api/*` Worker (`naimean-api`)
- D1-backed counter, layout overrides, and registered users
- Discord OAuth PKCE flow and email auth flow
- worker-side rate limiting and CI-backed route-alignment checks
- GitHub Actions deployment of Pages + all three Workers

### Current rough edges
- frontend still contains legacy hardcoded tool URLs even though `/go/*` exists server-side
- `ROUTER_SECRET` is documented in infra docs/comments but not used by current runtime code
- docs had drifted around `/layout`, `naimean-api`, and `/api/health` response shape
- scene logic remains intentionally monolithic in places, especially `public/script.js`

---

## Active documentation objective

- Keep `README.md`, `CLOUDFLARE_README.md`, `FELIPE_HANDOFF.md`, and `naimean-README.md` aligned with the current code
- Keep the recommendation backlog current enough that it can be used as an actual follow-up list rather than historical notes

---

## Detailed recommendation backlog

## P0 — Immediate priority (security, operational clarity, handoff risk)

- [ ] **Finish the `/go/*` migration**
  - Remove the remaining direct hardcoded Whiteboard / CapEx / ServiceNow URLs from `public/script.js`
  - Make server-controlled redirects the single production path
  - Confirm the secrets in Cloudflare are the only source of truth for destinations

- [ ] **Resolve the `ROUTER_SECRET` ambiguity**
  - Either implement real worker-to-worker validation with it
  - Or remove it from the documented security model and handoff instructions
  - Update all docs once the decision is made

- [ ] **Add Cloudflare edge controls on dynamic routes**
  - WAF managed rules
  - edge rate limits for `/hit`, `/increment`, `/auth/*`, `/layout`, and `/api/*`
  - bot controls where future write-heavy or user-input routes are introduced

- [ ] **Add monitoring that matches how the repo deploys**
  - alert on Worker 5xx spikes
  - alert on failed deploys
  - add lightweight log retention / Logpush / aggregation
  - explicitly watch `naimeanv2`, `barrelrollcounter-worker`, and `naimean-api`

- [ ] **Lock down privileged/internal flows further**
  - put Zero Trust or similar controls in front of `/go/*`
  - plan the same for any future admin or layout-management surface

## P1 — Near-term priority (stability, test confidence, ops maturity)

- [ ] **Add end-to-end auth coverage**
  - Discord popup login completion flow
  - `auth_popup_complete.html` postMessage + fallback navigation behavior
  - chapel trapdoor auth gate
  - logout flow and session refresh behavior

- [ ] **Add end-to-end layout coverage**
  - `GET /layout` for valid and invalid pages
  - `POST /layout` with owner restriction enabled
  - chapel load/save behavior across viewport changes

- [ ] **Add test coverage for `naimean-api`**
  - `/api/health`
  - `/api/data` list/create behavior
  - failure handling around D1 binding and bad input

- [ ] **Create a real preview/staging path**
  - workers.dev smoke-test path or staging hostname
  - validate auth, D1, and route changes before merge-to-main
  - optionally require protected environment approval for production deploys

- [ ] **Normalize docs and validation payloads**
  - keep all docs aligned on `/layout`
  - keep all docs aligned on `naimean-api`
  - keep all docs aligned on `GET /api/health` payload shape
  - keep GitHub/Cloudflare handoff docs synchronized with current runtime reality

- [ ] **Decide the fate of the `naimean-api` KV binding**
  - use it for a concrete feature
  - or remove it until it is actually needed to reduce infra surface area

## P2 — Planned priority (maintainability, product quality, performance)

- [ ] **Refactor large scene logic carefully**
  - split out some `public/script.js` responsibilities without introducing unnecessary bundling/tooling
  - keep the no-build developer experience if possible

- [ ] **Improve content and media delivery**
  - modern image/video formats
  - preload only the assets that truly help first interaction
  - lazy-load scene media that is not needed on first paint

- [ ] **Strengthen data operations**
  - formalize export cadence for both D1 databases
  - document restore runbooks
  - document migration sequencing and rollback expectations

- [ ] **Improve observability conventions**
  - add request IDs / correlation hints where useful
  - standardize error logging shape across Workers
  - document what “healthy” looks like for each deployed service

- [ ] **Revisit client-exposed role logic**
  - decide whether `BOOT_ROLE_VISIBILITY_BY_USER` can remain public
  - or move visibility logic behind a session-authenticated API if it becomes sensitive

- [ ] **Keep the experience polished**
  - better onboarding/hinting for first-time users
  - mobile interaction refinement
  - accessibility pass across scene hotspots and keyboard flows

---

## Optional future options

These are not must-do items, but they are reasonable options if the repo grows:

- [ ] add a dedicated admin or scene-layout management UI instead of relying on in-scene tooling alone
- [ ] create environment-specific Wrangler configs if preview/prod divergence increases
- [ ] move some static scene metadata into JSON/config files if hotspot complexity keeps growing
- [ ] add a small smoke-test harness for key public routes after every deploy
- [ ] consider an explicit incident/runbook doc if Cloudflare operations become shared among multiple people

---

## Success criteria for the next documentation/ops phase

- Felipe can configure Cloudflare from the docs without guessing
- the docs match the current runtime behavior
- the recommendation backlog reflects the actual highest-risk gaps, not historical assumptions
- future contributors can tell which issues are product polish vs. real operational/security work

---

_Last updated: 2026-04-23_
