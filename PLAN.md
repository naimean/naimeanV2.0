# Development Plan: naimeanV2.0

## Vision

- Keep `naimean.com` feeling like a memorable interactive experience rather than a generic app shell
- Preserve the no-build, vanilla-web stack where it still helps speed and control
- Use Cloudflare Workers only for the parts that truly need state, auth, routing, secrets, or persistence
- Keep the Cloudflare handoff accurate enough that the stack can be operated without reverse-engineering the repo first

---

## Current state snapshot

### Working today
- C64 homepage, prank flow, chapel, bedroom, and level sequence
- edge router Worker (`naimeanv2`)
- main backend Worker (`barrelrollcounter-worker`)
- separate `/api/*` Worker (`naimean-api`)
- D1-backed counter, layout overrides, registered users, and API entries
- Discord OAuth PKCE flow and email auth flow
- worker-side rate limiting and CI-backed route-alignment checks
- GitHub Actions deployment of Pages + all three Workers
- self-hosted EmulatorJS arcade with 8 completed plan items
- EmulatorJS core `.data` files stored in Cloudflare R2 (`retroarch-cores`) and served from the edge with ETag cache validation
- ROM library with per-system directories and `manifest.json`
- `radley-gallery` R2 bucket bound as `UPLOADS` for `uploads.naimean.com`

### Current rough edges
- R2 bucket existence and CI token R2:Edit permissions have not been confirmed in the Cloudflare account
- `uploads.naimean.com` upload-write behavior is still pending a final storage/binding configuration
- `naimean-sessions` KV namespace exists in Cloudflare but is not bound anywhere
- Cloudflare metadata reportedly showed `num_tables: 0` for both D1 databases and should be verified directly
- `ROUTER_SECRET` is documented in older docs/comments but not used by current runtime code

---

## Active documentation objective

- Keep `README.md`, `CLOUDFLARE_README.md`, `FELIPE_HANDOFF.md`, and `naimean-README.md` aligned with the current Cloudflare inventory
- Keep the recommendation backlog current enough to function as a real operations follow-up list
- Make undocumented-but-live secrets visible in docs without ever committing their values

---

## Detailed recommendation backlog

## P0 — Immediate priority (security, operational clarity, handoff risk)

- [ ] **Add Cloudflare edge protections on dynamic routes**
  - WAF managed rules on the `naimean.com` zone
  - edge rate limits for `/hit`, `/increment`, `/auth/*`, `/layout`, and `/api/*`
  - keep app-level rate limiting as defense in depth

- [ ] **Add monitoring that matches the auto-deploy model**
  - alert on Worker 5xx spikes
  - alert on deploy failures
  - add logging / retention / aggregation for all three Workers

- [ ] **Lock down privileged/internal flows further**
  - put Zero Trust or equivalent controls in front of `/go/*`
  - plan the same for any future admin or layout-management surface

- [ ] **Confirm R2 bucket existence and CI permissions**
  - verify `retroarch-cores` and `radley-gallery` buckets exist in the Cloudflare account
  - confirm `CLOUDFLARE_API_TOKEN` in GitHub Actions includes R2:Edit permission
  - validate CI uploads succeed on the next push to main

- [ ] **Set optional backend secrets if needed**
  - `OWNER_DISCORD_ID` — if `/layout` writes should be restricted to one Discord account
  - `TOOL_URL_WHITEBOARD`, `TOOL_URL_CAPEX`, `TOOL_URL_SNOW` — if built-in `/go/*` destinations need overrides

## P1 — Near-term priority (stability, test confidence, ops maturity)

- [ ] **Document the operational secret inventory cleanly**
  - keep `BACKDOOR_ADMIN_KEY`, `DISCORD_WEBHOOK_URL`, and `API_TOKEN` called out in handoff docs
  - avoid undocumented runtime dependencies

- [ ] **Verify D1 state directly and record the procedure**
  - run `sqlite_master` table checks if Cloudflare metadata lags
  - add the direct verification commands to the ops routine
  - confirm schemas remain reproducible from committed SQL files

- [ ] **Decide the fate of `naimean-sessions`**
  - bind it if it is still needed
  - otherwise delete or retire it to reduce infra surface area

- [ ] **Normalize docs and deployment validation**
  - keep all docs aligned on `/layout`, `/api/health`, route priority, IDs, and secret inventory
  - keep DNS guidance explicit: production must route through `naimeanv2`, not directly to GitHub Pages

- [ ] **Add D1 backup/export and restore runbooks**
  - formalize export cadence for both databases
  - document restore and migration sequencing expectations

- [ ] **Expand test coverage for the Cloudflare surface**
  - Discord popup auth completion flow
  - chapel auth gate and `/layout` load/save behavior
  - `naimean-api` contract tests for `/api/health` and `/api/data`

- [ ] **Validate and document the R2 + `uploads.naimean.com` pipeline**
  - confirm upload-write behavior once storage binding is configured
  - document the end-to-end flow from upload tool to R2 to CDN URL

## P2 — Planned priority (maintainability, product quality, performance)

- [ ] **Create a real preview/staging path**
  - workers.dev smoke-test path or protected staging hostname
  - validate auth, D1, and route changes before merge-to-main

- [ ] **Improve observability conventions**
  - add request IDs / correlation hints where useful
  - standardize error logging across Workers
  - document what “healthy” looks like for each service

- [ ] **Refactor large scene logic carefully**
  - split some `public/script.js` responsibilities without adding bundling/tooling churn
  - keep the no-build experience intact if possible

- [ ] **Improve content and media delivery**
  - modern image/video formats where practical
  - lazy-load assets not needed on first paint
  - keep first interaction fast

- [ ] **Keep the experience polished**
  - improve onboarding/hinting for first-time users
  - continue mobile interaction refinement
  - continue accessibility passes across hotspot and keyboard flows

- [ ] **Expand the ROM library**
  - add SNES, GBA, GB, N64, and Sega titles to `manifest.json`
  - keep ROM file naming consistent with the display-name-from-filename convention

---

## Optional future options

- [ ] add a dedicated admin or scene-layout management UI instead of relying on in-scene tooling alone
- [ ] create environment-specific Wrangler configs if preview/prod divergence increases
- [ ] move some scene metadata into config files if hotspot complexity keeps growing
- [ ] add a small post-deploy smoke-test harness for key public routes
- [ ] create a periodic infrastructure review checklist to catch doc/config/resource drift

---

## Success criteria for the next ops phase

- the Cloudflare handoff matches the real production resource inventory
- missing secrets and undocumented secrets are no longer surprise dependencies
- future operators can verify D1 state, route priority, and deploy prerequisites without guessing
- the recommendation backlog reflects real operational/security gaps rather than stale assumptions

---

_Last updated: 2026-04-26_
