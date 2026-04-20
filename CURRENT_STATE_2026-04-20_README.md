# Naimean Current State — 2026-04-20

## Repository + Runtime Topology
- **Primary edge worker:** `src/index.js` (Cloudflare Worker `naimeanv2`)  
  - Serves static files from `public/` via `ASSETS`.
  - Proxies API-style routes to service binding `COUNTER` (`barrelrollcounter-worker`).
- **Backend worker:** `cloudflare-worker/worker.js` (`barrelrollcounter-worker`)
  - D1-backed counter endpoints (`/get`, `/hit`, `/increment`).
  - CORS allowlist includes `naimean.com`, `www.naimean.com`, localhost, and selected subdomains.
- **Static site:** `public/`
  - Main interactive experience: `index.html`, `script.js`, `styles.css`.
  - Secondary scenes and progression pages: `chapel.html`, `bedroom.html`, `bedroom_antechamber.html`, `first_level.html` … `ninth_level.html`.
  - Media assets (images/video/audio) under `public/assets/`.

## Configuration State
- **Root worker config:** `wrangler.toml`
  - `name = "naimeanv2"`
  - `main = "src/index.js"`
  - assets binding uses `public/`
  - service binding `COUNTER -> barrelrollcounter-worker`
- **Backend worker config:** `cloudflare-worker/wrangler.toml`
  - D1 binding `DB` to `barrelroll-counter-db`
  - schema file `cloudflare-worker/schema.sql` seeds `rickroll_counter`.
- **GitHub Actions:** `.github/workflows/github-pages.yml`
  - PR check verifies required assets.
  - Push to main/master deploys GitHub Pages from `public/`.

## Application Behavior Snapshot
- C64-themed boot flow with staged overlays and media sequencing.
- Client-side command gating + puzzle progression.
- Rickroll counter fetched and incremented through worker endpoints, with local fallback caching.
- Discord widget/embed and invite resolution logic integrated client-side.
- Scene navigation uses hidden hotspots and fade transitions.
- Diagnostics panel available with keyboard/query/localStorage toggles (`diagnostics.js`).

## Security/Operational Posture (Current)
- Positive:
  - Some CORS restriction in backend worker.
  - Secrets expected to be managed in Cloudflare (not hardcoded in repo).
- Gaps:
  - No visible automated lint/test suite beyond lightweight workflow checks.
  - No CSP/security-header policy enforcement in current edge worker code.
  - High amount of business logic and external URL handling in large client script.
  - Documentation and config include references to routes/features not fully consistent everywhere.

## Development Setup
- No package manifest/toolchain in repo root (`package.json` absent).
- Dev container config exists (`.devcontainer/devcontainer.json`), base Ubuntu image.
- VS Code workspace settings include Git auto-fetch/rebase preferences.

## Immediate Work Started (post-review)
- Began implementation work by aligning worker proxy route handling in `src/index.js` with configured `run_worker_first` API path set (including board/upload route family).
