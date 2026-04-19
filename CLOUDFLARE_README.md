# Cloudflare Infrastructure — Naimean

This document maps out the Cloudflare infrastructure for **naimean.com** and **madmedia.studio**, including services, relationships, and GitHub deployment interactions.

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
- `GET /hit`
- `GET /increment`
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

