# Felipe — Cloudflare Setup Handoff

Hi Felipe! This document walks you through everything that needs to happen on the Cloudflare (and GitHub) side to get the full naimean.com stack running and secured. It's split into two phases: **Phase 1 — must-do before the next production push** and **Phase 2 — security hardening** (can be done shortly after the site is live, but shouldn't be left open for long).

All the Workers and config files are already in this repository. Deployment to Cloudflare is automated via GitHub Actions on every push to `main`, so once the credentials and resources below are in place, everything deploys without manual intervention.

---

## Phase 1 — Must-Do Before the Next Deploy

These items are hard blockers. If they're missing, the automatic deploy job will fail or the site will be broken at runtime.

### 1. GitHub Actions secrets

The `deploy-workers` CI job needs two secrets to authenticate with Cloudflare. Add them in the repository at **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Where to find the value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → use the *Edit Cloudflare Workers* template and scope it to the `naimean.com` zone and your account |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right-side panel on the Workers & Pages overview page |

> **Why this matters:** Every push to `main` triggers the `deploy-workers` job in `.github/workflows/github-pages.yml`. That job runs `wrangler deploy` for all three workers using these credentials. Without them the job exits with an authentication error and nothing reaches Cloudflare.

---

### 2. Verify all three Workers exist in Cloudflare

Go to **Workers & Pages** in the Cloudflare dashboard and confirm these three worker names exist (they will be created on first successful deploy, but their bindings need to be configured beforehand):

| Worker name | Purpose |
|---|---|
| `naimeanv2` | Edge router — serves static assets and proxies API routes |
| `barrelrollcounter-worker` | Counter + Discord OAuth + session + tool-launcher backend |
| `naimean-api` | AI agent API (`/api/*` routes on naimean.com) |

> **Why this matters:** `naimeanv2` calls `barrelrollcounter-worker` via a **service binding** named `COUNTER`. If that binding is absent or the target worker name is wrong the entire site's API layer (counter, auth, `/go/*` redirects) will return errors. The three worker names must exactly match what is in the `wrangler.toml` files.

---

### 3. Create and bind the D1 databases

Two D1 databases are needed.

#### `barrelroll-counter-db`
Used by `barrelrollcounter-worker` for the rickroll counter, layout overrides, and registered users.

```bash
# Create the database (one time)
wrangler d1 create barrelroll-counter-db

# Note the database_id in the output — it should match cloudflare-worker/wrangler.toml:
#   database_id = "22277fbe-031d-4cad-8937-245309e981cd"
# If the IDs differ, update cloudflare-worker/wrangler.toml and commit the change.

# Apply the schema (one time)
wrangler d1 execute barrelroll-counter-db --file=cloudflare-worker/schema.sql
```

#### `naimean-db`
Used by `naimean-api` for the AI agent entries table.

```bash
# Create the database (one time)
wrangler d1 create naimean-db

# Note the database_id — it should match naimean-api/wrangler.toml:
#   database_id = "0871f90d-f7e3-467a-a1f9-4e74ac8aef42"
# If the IDs differ, update naimean-api/wrangler.toml and commit.

# Apply the schema (one time)
wrangler d1 execute naimean-db --file=naimean-api/migrations/0000_create_entries.sql
```

> **Why this matters:** Both workers query their respective D1 databases on every request. If the tables don't exist the workers return 500 errors immediately. The schema files are already in the repo and are safe to run repeatedly (`CREATE TABLE IF NOT EXISTS`).

---

### 4. Create the KV namespace for `naimean-api`

```bash
wrangler kv namespace create KV
# Note the id in the output — it should match naimean-api/wrangler.toml:
#   id = "dff7175059ce478eab8c910949ca330f"
# Update the toml and commit if they differ.
```

> **Why this matters:** `naimean-api`'s wrangler.toml declares a KV binding — if the namespace doesn't exist Wrangler will refuse to deploy.

---

### 5. Set Worker secrets for `barrelrollcounter-worker`

Run these from the repo root (from the `cloudflare-worker/` directory, or add `--name barrelrollcounter-worker`). Never commit the values.

```bash
# Signs session tokens and OAuth cookies — generate with: openssl rand -hex 32
wrangler secret put SESSION_SECRET --name barrelrollcounter-worker

# Signs internal requests between naimeanv2 and this worker — generate with: openssl rand -hex 32
wrangler secret put ROUTER_SECRET --name barrelrollcounter-worker

# From your Discord app at https://discord.com/developers/applications
wrangler secret put DISCORD_CLIENT_ID --name barrelrollcounter-worker
wrangler secret put DISCORD_CLIENT_SECRET --name barrelrollcounter-worker
wrangler secret put DISCORD_REDIRECT_URI --name barrelrollcounter-worker
# DISCORD_REDIRECT_URI value should be: https://naimean.com/auth/discord/callback

# Restrict POST /layout to your Discord account (find your numeric ID in Discord:
# Settings → Advanced → Developer Mode → right-click your username → Copy User ID)
wrangler secret put OWNER_DISCORD_ID --name barrelrollcounter-worker

# Destination URLs for the authenticated /go/* launcher
wrangler secret put TOOL_URL_WHITEBOARD --name barrelrollcounter-worker
wrangler secret put TOOL_URL_CAPEX --name barrelrollcounter-worker
wrangler secret put TOOL_URL_SNOW --name barrelrollcounter-worker
```

> **Why this matters:** The auth flow (Discord OAuth PKCE, session cookies) and the `/go/*` tool-launcher redirects are entirely driven by these secrets. Missing any one of them results in auth failures or blank/errored redirects. `ROUTER_SECRET` must match on both the edge worker and this worker — they share it for internal request validation.

---

### 6. Set Worker secrets for `naimean-api`

```bash
# Bearer token required for all protected /api/* endpoints — generate with: openssl rand -hex 32
wrangler secret put API_TOKEN --name naimean-api
```

> **Why this matters:** Without `API_TOKEN` configured, the worker returns `503 — API_TOKEN is not configured` on every request to protected routes.

---

### 7. Verify custom domain routing

In the Cloudflare dashboard under **Workers & Pages → naimeanv2 → Settings → Domains & Routes**, confirm:

| Route / Domain | Worker |
|---|---|
| `naimean.com` | `naimeanv2` |
| `www.naimean.com` | `naimeanv2` |

For `naimean-api`, the route `naimean.com/api/*` is declared in `naimean-api/wrangler.toml` and will be registered automatically on deploy. Confirm it appears under **Workers Routes** for the `naimean.com` zone.

> **Why this matters:** The edge worker is the entry point for the entire site. If the domain is pointing somewhere else (or not pointing at all), none of the site traffic hits the worker.

---

## Phase 2 — Security Hardening

These items protect the live site against abuse and lock down privileged operations. They don't block the initial deploy but should be completed promptly after the site is confirmed working.

### 8. Enable WAF managed rules + rate limiting

In the Cloudflare dashboard under **Security → WAF**:

- Enable **Cloudflare Managed Ruleset** for the `naimean.com` zone.
- Add a **Rate Limiting rule** targeting:
  - `POST /hit` and `POST /increment` — limit to ~10 requests/minute per IP to prevent counter flooding.
  - `GET /auth/*` and `POST /auth/*` — limit to ~20 requests/minute per IP to protect the OAuth flow.

> **Why this matters:** The rickroll counter endpoints are publicly accessible and unauthenticated. Without rate limiting, anyone can script thousands of hits per second. The auth endpoints are a target for credential-stuffing and OAuth abuse.

---

### 9. Apply Cloudflare Zero Trust access policies for admin operations

In **Zero Trust → Access → Applications**, create a policy that restricts access to any admin or internal endpoints (e.g., `/go/*` tool-launcher, any future `/admin/*` routes) to your team's identity provider or email list.

> **Why this matters:** The `/go/*` routes redirect authenticated users to internal tools (whiteboard, CapEx, ServiceNow). While they require a valid session cookie today, Zero Trust provides a defense-in-depth layer so internal tools are never exposed directly to unauthenticated internet traffic, even if a session bug is introduced.

---

### 10. Add Cloudflare Turnstile bot protection on user-input endpoints

When the shoutbox (planned server-side feature in the security backlog) is implemented, add a [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) widget to the submission form. The site key and secret key are obtained from the Cloudflare dashboard under **Turnstile**.

> **Why this matters:** The shoutbox will accept user-generated content stored in D1. Without bot protection, it becomes a spam/abuse target on day one.

---

### 11. Set up D1 backup/export cadence

D1 does not automatically export or snapshot data by default. Set up a recurring task (manual or via a Cloudflare Cron Trigger worker) to export the `barrelroll-counter-db` database periodically:

```bash
# Manual export (run periodically or before any schema migration)
wrangler d1 export barrelroll-counter-db --output=backup-$(date +%Y%m%d).sql
```

Store exports in R2 (`radley-gallery` bucket or a dedicated backup bucket) or a secure external location.

> **Why this matters:** Auto-deploy on every `main` push means a bad schema migration could run against production immediately. Having a recent export means you can restore to a known-good state without data loss.

---

### 12. Enable Worker alerting and basic monitoring

In the Cloudflare dashboard under **Workers & Pages → naimeanv2 (or barrelrollcounter-worker) → Metrics**:

- Set up **email or webhook notifications** for error rate spikes (Workers Analytics — `5xx` rate).
- Consider enabling **Logpush** to R2 or an external log aggregator for persistent Worker logs.

> **Why this matters:** The deploy pipeline is fully automated — a bad deploy goes live immediately. Alerting gives you early warning before a user reports an outage.

---

## Quick Reference: All Secrets Summary

| Worker | Secret | Notes |
|---|---|---|
| `barrelrollcounter-worker` | `SESSION_SECRET` | HMAC key for session/OAuth cookies; `openssl rand -hex 32` |
| `barrelrollcounter-worker` | `ROUTER_SECRET` | Shared with edge worker for internal auth; `openssl rand -hex 32` |
| `barrelrollcounter-worker` | `DISCORD_CLIENT_ID` | From Discord developer portal |
| `barrelrollcounter-worker` | `DISCORD_CLIENT_SECRET` | From Discord developer portal |
| `barrelrollcounter-worker` | `DISCORD_REDIRECT_URI` | `https://naimean.com/auth/discord/callback` |
| `barrelrollcounter-worker` | `OWNER_DISCORD_ID` | Your numeric Discord user ID; restricts `POST /layout` to owner only |
| `barrelrollcounter-worker` | `TOOL_URL_WHITEBOARD` | Internal whiteboard tool URL |
| `barrelrollcounter-worker` | `TOOL_URL_CAPEX` | Internal CapEx tool URL |
| `barrelrollcounter-worker` | `TOOL_URL_SNOW` | ServiceNow URL |
| `naimean-api` | `API_TOKEN` | Bearer token for protected `/api/*` routes; `openssl rand -hex 32` |
| GitHub Actions | `CLOUDFLARE_API_TOKEN` | Wrangler deploy permissions |
| GitHub Actions | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

---

## Verification Checklist

After completing Phase 1, run through these checks to confirm the stack is healthy:

- [ ] Push a trivial commit to `main` → GitHub Actions `deploy-workers` job passes (green)
- [ ] `curl https://naimean.com/get` → returns `{"value": 0}` (or current counter)
- [ ] `curl -X POST https://naimean.com/hit` → returns incremented counter value
- [ ] `curl https://naimean.com/auth/session` → returns `{"authenticated": false}` (not a 500)
- [ ] `curl https://naimean.com/auth/discord/login` → redirects to Discord OAuth (not a 500)
- [ ] `curl https://naimean.com/api/health` → returns `{"ok": true, "service": "naimean-api", ...}`
- [ ] `naimean.com` loads the C64 homepage in the browser

---

_Last updated: 2026-04-21_
