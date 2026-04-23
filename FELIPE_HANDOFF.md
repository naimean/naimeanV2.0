# Felipe — Cloudflare Setup Handoff

Hi Felipe — this is the current handoff for the `naimean.com` stack as it exists in the repository today. It focuses on what you need to configure in Cloudflare/GitHub, what is already automated, and what is still in a transitional state.

---

## Before you start: important current-state caveats

These are worth knowing **before** you spend time wiring things up:

1. **`/layout` is a live route now.** The router currently proxies `/get`, `/hit`, `/increment`, `/auth`, `/go`, and `/layout`.
2. **`ROUTER_SECRET` is documented, but current runtime code does not consume it.** Keep that in mind if you are trying to trace an internal-auth mechanism that does not seem to exist.
3. **`naimean-api` is part of this repo and deploys from this repo.** It is not an external service anymore.
4. **The current `/api/health` payload is `{ "status": "ok", "timestamp": "..." }`.** If you validate against an older `ok/service` response shape, the check will look wrong even though the worker is healthy.
5. **The backend supports `/go/*` redirects, but the browser still has legacy hardcoded tool URLs in `public/script.js`.** So the redirect worker path is present, but not yet the only route being used by the UI.

---

## Phase 1 — must-do before the next production push

These items are hard blockers for a healthy deploy.

### 1. Add the GitHub Actions deploy secrets

In GitHub repository settings, add:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Lets GitHub Actions run `wrangler deploy` |
| `CLOUDFLARE_ACCOUNT_ID` | Identifies the Cloudflare account for Wrangler |

### Why this matters

`.github/workflows/github-pages.yml` deploys **three Workers** on push to `main`/`master`:

- `naimeanv2`
- `barrelrollcounter-worker`
- `naimean-api`

If either secret is missing, `deploy-workers` fails immediately.

---

### 2. Verify the three Worker names Cloudflare will deploy

Expected Worker names:

| Worker | Purpose |
|---|---|
| `naimeanv2` | edge router + static asset entrypoint |
| `barrelrollcounter-worker` | counter/auth/layout/tool backend |
| `naimean-api` | separate `/api/*` Worker |

### Why this matters

- the router uses a service binding named `COUNTER` that must point at `barrelrollcounter-worker`
- `naimean-api` has its own route and storage bindings and is deployed independently

---

### 3. Verify the domain and route mapping

Expected routing in Cloudflare:

| Route / domain | Target |
|---|---|
| `naimean.com` | `naimeanv2` |
| `www.naimean.com` | `naimeanv2` |
| `naimean.com/api/*` | `naimean-api` |

### Why this matters

If the root domain points somewhere else, none of the auth/counter/layout behavior hits the router Worker.

---

### 4. Create and initialize the storage resources

## A. `barrelroll-counter-db`

Used by `barrelrollcounter-worker`.

```bash
wrangler d1 create barrelroll-counter-db
wrangler d1 execute barrelroll-counter-db --file=cloudflare-worker/schema.sql
```

What it stores:

- `rickroll_counter`
- `layout_overrides`
- `registered_users`

Expected `database_id` in `cloudflare-worker/wrangler.toml`:

- `22277fbe-031d-4cad-8937-245309e981cd`

## B. `naimean-db`

Used by `naimean-api`.

```bash
wrangler d1 create naimean-db
wrangler d1 execute naimean-db --file=naimean-api/migrations/0000_create_entries.sql
```

Expected `database_id` in `naimean-api/wrangler.toml`:

- `0871f90d-f7e3-467a-a1f9-4e74ac8aef42`

## C. KV namespace for `naimean-api`

```bash
wrangler kv namespace create KV
```

Expected `id` in `naimean-api/wrangler.toml`:

- `dff7175059ce478eab8c910949ca330f`

### Why this matters

Wrangler deploys fail if required D1/KV bindings are missing, and runtime requests fail if the tables do not exist.

---

### 5. Set Worker secrets on `barrelrollcounter-worker`

```bash
# Session / OAuth signing
wrangler secret put SESSION_SECRET --name barrelrollcounter-worker

# Discord OAuth app
wrangler secret put DISCORD_CLIENT_ID --name barrelrollcounter-worker
wrangler secret put DISCORD_CLIENT_SECRET --name barrelrollcounter-worker
wrangler secret put DISCORD_REDIRECT_URI --name barrelrollcounter-worker

# Restrict POST /layout to a specific Discord account (optional but recommended)
wrangler secret put OWNER_DISCORD_ID --name barrelrollcounter-worker

# Redirect destinations for authenticated /go/* paths
wrangler secret put TOOL_URL_WHITEBOARD --name barrelrollcounter-worker
wrangler secret put TOOL_URL_CAPEX --name barrelrollcounter-worker
wrangler secret put TOOL_URL_SNOW --name barrelrollcounter-worker

# Still documented in repo comments / docs, but not consumed by current runtime code
wrangler secret put ROUTER_SECRET --name barrelrollcounter-worker
```

### Critical value to get exactly right

`DISCORD_REDIRECT_URI` should match the Discord developer portal callback **exactly**, typically:

- `https://naimean.com/auth/discord/callback`

---

### 6. Run the practical verification checks

After deploy succeeds, confirm:

- [ ] `curl https://naimean.com/get` returns JSON with `value`
- [ ] `curl -X POST https://naimean.com/hit` increments successfully
- [ ] `curl https://naimean.com/auth/session` returns JSON, not a 500
- [ ] `curl https://naimean.com/auth/discord/login` redirects to Discord
- [ ] `curl 'https://naimean.com/layout?page=chapel'` returns JSON
- [ ] `curl https://naimean.com/api/health` returns `{ "status": "ok", "timestamp": "..." }`
- [ ] the homepage loads at `https://naimean.com`
- [ ] the latest `deploy-workers` GitHub Actions job is green

---

## Phase 2 — security and operations hardening

These items should be done soon after the basic stack is live.

### 7. Put WAF and edge rate limits in front of the dynamic routes

Recommended first targets:

- `POST /hit`
- `POST /increment`
- `GET /auth/*`
- `POST /auth/*`
- `GET /layout`
- `POST /layout`
- `/api/*`

### Why this matters

The Worker already has application-level rate limiting, but Cloudflare edge controls give better abuse handling and reduce load before requests even reach the Worker.

---

### 8. Add Zero Trust / Access controls for privileged internal flows

Best candidates:

- `/go/*`
- any future admin route
- any future layout/admin tooling surface

### Why this matters

Even with session-based authorization, Zero Trust gives a second gate for internal resources.

---

### 9. Add monitoring, alerting, and log retention

Recommended:

- Workers error-rate alerts
- log retention via Logpush or an external aggregator
- explicit monitoring of:
  - `/get`
  - `/hit`
  - `/auth/session`
  - `/layout`
  - `/api/health`

### Why this matters

This repo auto-deploys on push to `main`, so fast failure visibility matters.

---

### 10. Add D1 backup/export cadence for both databases

```bash
wrangler d1 export barrelroll-counter-db --output=barrelroll-counter-db-$(date +%Y%m%d).sql
wrangler d1 export naimean-db --output=naimean-db-$(date +%Y%m%d).sql
```

### Why this matters

If a schema change or bad deploy lands, restores are much easier if exports already exist.

---

### 11. Set up a preview/staging validation path

Recommended options:

- workers.dev validation for pre-merge testing
- a staging hostname under Cloudflare
- protected GitHub environments for production deploy approval

### Why this matters

Auth, D1, and route changes are the highest-risk changes in this repo. A preview lane lowers production risk.

---

### 12. Close the current docs/runtime gaps

Recommended cleanup items:

- decide whether to implement or remove `ROUTER_SECRET`
- update the frontend so all tool launches consistently use `/go/*`
- keep all docs aligned on `/layout`, `naimean-api`, and `/api/health`

### Why this matters

Right now the repo is understandable, but a few transitional details can confuse ops handoff if they are not called out explicitly.

---

## Quick-reference summary

### GitHub secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Worker secrets

- `SESSION_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `OWNER_DISCORD_ID`
- `TOOL_URL_WHITEBOARD`
- `TOOL_URL_CAPEX`
- `TOOL_URL_SNOW`
- `ROUTER_SECRET` *(documented, but not consumed by current runtime code)*

### Must-exist Cloudflare resources

- Workers: `naimeanv2`, `barrelrollcounter-worker`, `naimean-api`
- D1: `barrelroll-counter-db`, `naimean-db`
- KV: `KV` bound to `naimean-api`
- Routes: `naimean.com`, `www.naimean.com`, `naimean.com/api/*`

---

_Last updated: 2026-04-23_
