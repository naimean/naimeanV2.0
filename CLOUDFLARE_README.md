# Cloudflare Infrastructure — Naimean

This document maps out the Cloudflare infrastructure for **naimean.com** and **madmedia.studio**, including services, relationships, and GitHub deployment interactions.

---

## Recent Updates (2026-04-20)

- Added Cloudflare-focused security hardening baseline coverage (edge headers, OAuth/session controls, API abuse controls, input safety, secret/supply-chain hygiene).
- Added route/config drift tracking priority for `/board*` and `/uploads/*` to keep docs and runtime behavior aligned.
- Retired legacy `GET` write aliases for counter routes; state-changing counter routes now require `POST`.
- Added stricter environment-based CORS allowlisting guidance.
- Added Zero Trust policy requirement for privileged/admin operations.
- Added D1/R2 migration, backup/export, and restore safeguards to improve operational resilience.

---

## Architecture Overview

```text
GitHub (main branch)
├─ naimeanv2 repo ─────────► wrangler deploy ──► naimeanv2 Worker
│                            ├─ serves static assets (ASSETS binding)
│                            └─ proxies /get, /hit, /increment, /auth, /go
│                                                   │
│                                                   ▼
│                                   barrelrollcounter-worker
│                                   (Service binding: COUNTER)
│                                   ├─ D1: barrelroll-counter-db
│                                   └─ Secrets: ROUTER_SECRET, SESSION_SECRET,
│                                               DISCORD_CLIENT_ID/SECRET/REDIRECT_URI,
│                                               TOOL_URL_WHITEBOARD/CAPEX/SNOW
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
- `/get`, `/hit`, `/increment`, `/auth`, `/go` → Worker runtime first, proxied to `barrelrollcounter-worker`
- Other paths → static assets

### `barrelrollcounter-worker` — API Backend

| Property | Value |
|---|---|
| Config in this repo | `/cloudflare-worker/wrangler.toml` |
| Script in this repo | `/cloudflare-worker/worker.js` |
| Compatibility date (repo config) | `2026-04-18` |

Bindings (expected):

| Name | Type | Details |
|---|---|---|
| `DB` | D1 Database | `barrelroll-counter-db` (`22277fbe-031d-4cad-8937-245309e981cd`) |
| `ROUTER_SECRET` | Secret Text | Shared secret for internal route authentication |
| `SESSION_SECRET` | Secret Text | HMAC key for signed session tokens |
| `DISCORD_CLIENT_ID` | Secret Text | Discord OAuth app client ID |
| `DISCORD_CLIENT_SECRET` | Secret Text | Discord OAuth app client secret |
| `DISCORD_REDIRECT_URI` | Secret Text | Discord OAuth callback URL |
| `TOOL_URL_WHITEBOARD` | Secret Text | Internal redirect target for `/go/whiteboard` |
| `TOOL_URL_CAPEX` | Secret Text | Internal redirect target for `/go/capex` |
| `TOOL_URL_SNOW` | Secret Text | Internal redirect target for `/go/snow` |

Optional environment variables:

| Name | Purpose |
|---|---|
| `CORS_ALLOWED_ORIGINS` | Comma-separated explicit origins to add to the CORS allowlist |
| `CORS_ALLOWED_ORIGIN_SUFFIXES` | Comma-separated hostname suffixes for scoped wildcard-like CORS behavior |
| `CORS_ALLOW_PROD_ORIGIN_SUFFIXES` | Set to `true` only when production suffix matching is strictly required; production now disables suffix matching by default |
| `APP_ENV` / `ENVIRONMENT` | Set to a non-`production` value to also allow localhost development origins |

Known API paths:
- `GET  /get` — return current counter value
- `POST /hit` — increment counter, return new value
- `POST /increment` — alias of `/hit`
- `GET  /auth/session` — return current session info
- `GET  /auth/discord/login` — initiate Discord OAuth PKCE flow
- `GET  /auth/discord/callback` — complete Discord OAuth flow
- `POST /auth/logout` — clear session cookie
- `GET  /go/whiteboard` — authenticated redirect to whiteboard tool
- `GET  /go/capex` — authenticated redirect to CapEx tool
- `GET  /go/snow` — authenticated redirect to ServiceNow tool
- `OPTIONS` — CORS preflight for any of the above

---

## Storage

### D1 — `barrelroll-counter-db`
Stores barrel-roll counter data and Discord OAuth session records.

### R2 — `radley-gallery`
Existing bucket not currently bound in this repository's worker configs.

### KV — `naimean-sessions`
Existing namespace not currently bound in this repository's worker configs.

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

### Current state

| Worker | Deployment method | CI/CD |
|---|---|---|
| `naimeanv2` | Wrangler | GitHub Actions |
| `barrelrollcounter-worker` | Wrangler | GitHub Actions |

### Required GitHub secrets

Add in **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (secret or Actions variable) |
| `CLOUDFLARE_API_TOKEN` | Token with Workers deploy permissions |

Never commit these values to the repository.

### Existing workflow in this repo

Worker deploy automation is already wired in `.github/workflows/github-pages.yml` via the `deploy-workers` job using `cloudflare/wrangler-action@v3.15.0` with explicit Wrangler v4:

```yaml
deploy-workers:
  if: github.event_name != 'pull_request'
  needs: lint-and-check
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: cloudflare/wrangler-action@v3.15.0
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID || vars.CLOUDFLARE_ACCOUNT_ID }}
        wranglerVersion: "4.84.0"
        workingDirectory: .
    - uses: cloudflare/wrangler-action@v3.15.0
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID || vars.CLOUDFLARE_ACCOUNT_ID }}
        wranglerVersion: "4.84.0"
        workingDirectory: cloudflare-worker
```

### `deploy-workers` failure troubleshooting

If logs show `The process '/usr/local/bin/npx' failed with exit code 1`, check the first Cloudflare API error in the same log block:
- `Authentication error [code: 10000]` means token/account configuration is wrong (not a missing `package.json` dependency issue in this repo).
- Ensure `CLOUDFLARE_API_TOKEN` has Worker deploy permissions for the target account.
- Ensure account ID is provided via `CLOUDFLARE_ACCOUNT_ID` secret/variable.

Branch behavior:
- `main` → auto-deploy
- `feature/*` → no auto-deploy (test with `wrangler dev`)
- PRs → checks/tests only; deploy on merge

---

## Local Development

```bash
# This repo has no package.json and no npm dependencies.
# Only Wrangler CLI is required for local Worker/dev/deploy commands.

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
wrangler secret put ROUTER_SECRET
wrangler secret put SESSION_SECRET
wrangler secret put DISCORD_CLIENT_ID
wrangler secret put DISCORD_CLIENT_SECRET
wrangler secret put DISCORD_REDIRECT_URI
wrangler secret put TOOL_URL_WHITEBOARD
wrangler secret put TOOL_URL_CAPEX
wrangler secret put TOOL_URL_SNOW
```

---

## Contributor Checklist

- Clone the repo
- Install Wrangler CLI
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
| 2026-04-20 | Enforced strict edge security headers on frontend proxy and backend API worker responses | P0 hardening started for CSP/HSTS/secure-header baseline |
| 2026-04-20 | Added Cloudflare-focused hardening baseline and controls checklist | Security posture standardized after critical-vulnerability remediation |
| 2026-04-20 | Added route/config drift check for `/board*` and `/uploads/*` paths | Reduced risk of undocumented behavior across Worker layers |
| 2026-04-20 | Added recommendation to migrate state-changing counter actions away from unauthenticated `GET` | Reduced accidental/abusive triggering risk |
| 2026-04-20 | Retired legacy `GET` counter-write aliases and enforced `POST` for `/hit` and `/increment` | Reduced accidental/abusive triggering risk for state-changing routes |
| 2026-04-20 | Tightened CORS allowlisting by environment: production suffix matching now requires explicit opt-in | Reduced wildcard-origin exposure in production |
| 2026-04-20 | Added stricter CORS allowlisting guidance per environment | Reduced cross-origin exposure |
| 2026-04-20 | Added Zero Trust policy requirement for privileged/admin operations | Reduced administrative attack surface |
| 2026-04-20 | Added D1/R2 backup, restore, and migration safeguards | Improved recoverability and operations resilience |
| 2026-04-20 | Added `deploy-workers` CI job using `cloudflare/wrangler-action@v3.15.0` to automate `wrangler deploy` for both workers on push to main | Workers now deploy automatically; requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (secret/variable) |

### Prioritized Cloudflare Recommendation Backlog

#### P0 — Immediate
- Enforce strict edge security controls (CSP/HSTS/secure headers, rate limiting, bot protection). *(In progress: CSP/HSTS/secure headers now enforced on edge/API responses)*
- Lock down OAuth/session security (PKCE/state validation and short-lived sessions).
- Sanitize and escape all user-generated board content.
- ✅ Wire up automated `wrangler deploy` for both workers in GitHub Actions CI. *(deploy-workers job added using cloudflare/wrangler-action@v3.15.0; requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID secret/variable)*
- Apply Zero Trust access for admin/backdoor workflows and any internal-only dashboards/endpoints.

#### P1 — Next
- ✅ Route/config drift resolved: documentation now matches live proxy behavior (no `/board*` or `/uploads/*` routes).
- ✅ State-changing counter writes now require `POST` for `/hit` and `/increment`.
- ✅ Tighten CORS allowlisting by environment and remove broad wildcard origins unless required. *(Production suffix matching now disabled by default; explicit opt-in required via `CORS_ALLOW_PROD_ORIGIN_SUFFIXES=true`.)*
- Add Cloudflare CI checks (wrangler config validation, route smoke tests, endpoint contract checks).

#### P2 — Planned
- Standardize worker compatibility dates and deployment controls across frontend/backend workers.
- Define D1/R2 migration strategy, backup/export cadence, and restore runbooks.
- Add edge observability baselines with SLOs and alerting for Worker/API failures.

---

_Last updated: 2026-04-20_
