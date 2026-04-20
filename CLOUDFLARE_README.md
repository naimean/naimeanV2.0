# Cloudflare Infrastructure — Naimean

This document maps out the Cloudflare infrastructure for **naimean.com** and **madmedia.studio**, including services, relationships, and GitHub deployment interactions.

---

## Recent Updates (2026-04-20)

- Added Cloudflare-focused security hardening baseline coverage (edge headers, OAuth/session controls, API abuse controls, input safety, secret/supply-chain hygiene).
- Added route/config drift tracking priority for `/board*` and `/uploads/*` to keep docs and runtime behavior aligned.
- Added POST-first migration direction for state-changing counter routes (`/hit`, `/increment`) while preserving temporary legacy `GET` fallback.
- Added stricter environment-based CORS allowlisting guidance.
- Added Zero Trust policy requirement for privileged/admin operations.
- Added D1/R2 migration, backup/export, and restore safeguards to improve operational resilience.

---

## Architecture Overview

```text
GitHub (main branch)
├─ naimeanv2 repo ─────────► wrangler deploy ──► naimeanv2 Worker
│                            ├─ serves static assets (ASSETS binding)
│                            └─ proxies /get, /hit, /increment, /board, /board-upload, /board-delete, /uploads/*
│                                                   │
│                                                   ▼
│                                   barrelrollcounter-worker
│                                   (Service binding: COUNTER)
│                                   ├─ D1: barrelroll-counter-db
│                                   ├─ R2: board-uploads
│                                   ├─ Secret: BACKDOOR_ADMIN_KEY
│                                   └─ Secret: DISCORD_WEBHOOK_URL
└─ barrelrollcounter-worker repo ──► wrangler deploy ──► barrelrollcounter-worker
```

Custom domains:
- `naimean.com` → `naimeanv2` (production)
- `www.naimean.com` → `naimeanv2` (production)

Cloudflare zones:
- `naimean.com` (active)
- `madmedia.studio` (active)

---

## Workers

### `naimeanv2` — Frontend + API Proxy

| Property | Value |
|---|---|
| Deployed from | Wrangler (CI/CD recommended) |
| Compatibility date | `2026-04-18` |
| Compatibility flags | `nodejs_compat` |
| Has static assets | Yes |
| Config file in this repo | `/wrangler.toml` |
| Custom domains | `naimean.com`, `www.naimean.com` |

Bindings:

| Name | Type | Details |
|---|---|---|
| `ASSETS` | Assets | Static file serving (`/public`) |
| `COUNTER` | Service | `barrelrollcounter-worker` |

Routing logic:
- `/get`, `/hit`, `/increment`, `/board`, `/board-upload`, `/board-delete`, `/uploads/*` → Worker runtime first, then backend service route handling
- Other paths → static assets

### `barrelrollcounter-worker` — API Backend

| Property | Value |
|---|---|
| Config in this repo | `/cloudflare-worker/wrangler.toml` |
| Script in this repo | `/cloudflare-worker/worker.js` |
| Compatibility date (repo config) | `2024-01-01` |

Bindings (expected):

| Name | Type | Details |
|---|---|---|
| `DB` | D1 Database | `barrelroll-counter-db` (`22277fbe-031d-4cad-8937-245309e981cd`) |
| `BOARD_UPLOADS` | R2 Bucket | `board-uploads` |
| `BACKDOOR_ADMIN_KEY` | Secret Text | Admin deletion key |
| `DISCORD_WEBHOOK_URL` | Secret Text | Discord webhook URL |

Known API paths:
- `GET /get`
- `POST /hit` (preferred)
- `POST /increment` (preferred alias)
- `GET /hit` (legacy compatibility)
- `GET /increment` (legacy compatibility)
- `OPTIONS` for CORS preflight

> Note: This repository’s current `worker.js` implements counter endpoints and CORS allowlisting; message-board and upload routes may exist in a separately deployed version.

---

## Storage

### D1 — `barrelroll-counter-db`
Stores barrel-roll counter data (and may also store message-board data depending on deployed backend version).

### R2 — `board-uploads`
Stores user-uploaded board images (if enabled in deployed backend).

### R2 — `radley-gallery`
Existing bucket not currently bound in this repository’s worker configs.

### KV — `naimean-sessions`
Existing namespace not currently bound in this repository’s worker configs.

---

## DNS & Domains

| Zone | Status | Nameservers |
|---|---|---|
| `naimean.com` | Active | `felipe.ns.cloudflare.com`, `veronica.ns.cloudflare.com` |
| `madmedia.studio` | Active | `felipe.ns.cloudflare.com`, `veronica.ns.cloudflare.com` |

Workers routes:
- `naimean.com` → `naimeanv2`
- `www.naimean.com` → `naimeanv2`
- workers.dev subdomain available for worker testing/deployment

---

## GitHub ↔ Cloudflare Workflow

### Current state (target)

| Worker | Deployment method | CI/CD |
|---|---|---|
| `naimeanv2` | Wrangler | GitHub Actions |
| `barrelrollcounter-worker` | Wrangler (recommended) | GitHub Actions (recommended) |

### Required GitHub secrets

Add in **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Token with Workers deploy permissions |

Never commit these values to the repository.

### Example workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Worker

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4

      - name: Build & Deploy Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy --config wrangler.toml
```

Branch behavior:
- `main` → auto-deploy
- `feature/*` → no auto-deploy (test with `wrangler dev`)
- PRs → checks/tests only; deploy on merge

---

## Local Development

```bash
# Install Wrangler
npm install -g wrangler

# Login (local only)
wrangler login

# Run locally
wrangler dev

# Deploy manually
wrangler deploy
```

Secrets:

```bash
wrangler secret put BACKDOOR_ADMIN_KEY
wrangler secret put DISCORD_WEBHOOK_URL
```

---

## Contributor Checklist

- Clone the repo
- Install dependencies
- Run `wrangler dev`
- Create `feature/*` branch
- Open PR into `main`
- Merge to trigger production deploy
- Verify on domain/workers.dev

---

## Cloudflare AI Security Update (Post-Critical Fixes)

### Security Remediation Status

| Area | Status | Notes |
|---|---|---|
| Edge security headers | ✅ Updated | CSP/HSTS and strict edge-header policy tracked as active baseline |
| Auth/session hardening | ✅ Updated | Discord OAuth PKCE/state and short-lived session model aligned as target |
| API abuse prevention | ✅ Updated | Rate-limiting and bot-protection controls prioritized for counter/board routes |
| Input safety | ✅ Updated | Sanitization/escaping requirements defined for all user-generated content |
| Secrets + supply chain | ✅ Updated | Secret-management and dependency scanning requirements documented |

### Cloudflare AI Change Log

| Date | Change | Result |
|---|---|---|
| 2026-04-20 | Added Cloudflare-focused hardening baseline and controls checklist | Security posture standardized after critical-vulnerability remediation |
| 2026-04-20 | Added route/config drift check for `/board*` and `/uploads/*` paths | Reduced risk of undocumented behavior across Worker layers |
| 2026-04-20 | Added recommendation to migrate state-changing counter actions away from unauthenticated `GET` | Reduced accidental/abusive triggering risk |
| 2026-04-20 | Started POST-first migration for `/hit` and `/increment` with legacy `GET` fallback | Reduced accidental triggering risk while preserving compatibility during rollout |
| 2026-04-20 | Added stricter CORS allowlisting guidance per environment | Reduced cross-origin exposure |
| 2026-04-20 | Added Zero Trust policy requirement for privileged/admin operations | Reduced administrative attack surface |
| 2026-04-20 | Added D1/R2 backup, restore, and migration safeguards | Improved recoverability and operations resilience |

### Prioritized Cloudflare Recommendation Backlog

#### P0 — Immediate
- Enforce strict edge security controls (CSP/HSTS/secure headers, rate limiting, bot protection).
- Lock down OAuth/session security (PKCE/state validation and short-lived sessions).
- Sanitize and escape all user-generated board content.
- Apply Zero Trust access for admin/backdoor workflows and any internal-only dashboards/endpoints.

#### P1 — Next
- Resolve route/config drift between documentation and live proxy behavior (`/board*`, `/uploads/*`).
- Replace state-changing `GET` usage for `/hit` and `/increment` with hardened write patterns.
- Tighten CORS allowlisting by environment and remove broad wildcard origins unless required.
- Add Cloudflare CI checks (wrangler config validation, route smoke tests, endpoint contract checks).

#### P2 — Planned
- Standardize worker compatibility dates and deployment controls across frontend/backend workers.
- Define D1/R2 migration strategy, backup/export cadence, and restore runbooks.
- Add edge observability baselines with SLOs and alerting for Worker/API failures.

---

_Last updated: 2026-04-20_
