# Felipe — Cloudflare Setup Handoff

Hi Felipe — this is the practical setup and verification checklist for the `naimean.com` Cloudflare stack as of 2026-04-23.

Cloudflare account:

- account name: `Naimean@hotmail.com's Account`
- account ID: `85d52ed1ca1933df067bf0c167d65a84`

---

## Current-state caveats worth knowing first

1. `/layout` is a live production route and must stay proxied through `naimeanv2`.
2. `ROUTER_SECRET` is still mentioned in some older docs/comments, but current runtime code does not consume it.
3. `naimean-api` is part of this repo and deploys from this repo.
4. `GET /api/health` currently returns `{ "status": "ok", "timestamp": "..." }`.
5. The backend supports `/go/*`, but the frontend still contains legacy hardcoded tool URLs.
6. Four main-backend secrets are still missing today: `OWNER_DISCORD_ID`, `TOOL_URL_WHITEBOARD`, `TOOL_URL_CAPEX`, `TOOL_URL_SNOW`.

---

## Phase 1 — production blockers / must-do items

### 1. Confirm the three deployed Workers

| Worker | Purpose |
|---|---|
| `naimeanv2` | edge router + static asset entrypoint |
| `barrelrollcounter-worker` | auth/counter/layout/tool backend |
| `naimean-api` | standalone `/api/*` Worker |

### 2. Confirm route mapping

| Route / domain | Target |
|---|---|
| `naimean.com/*` | `naimeanv2` |
| `www.naimean.com/*` | `naimeanv2` |
| `naimean.com/api/*` | `naimean-api` |

Critical: `naimean.com` must not point directly to GitHub Pages in production.

### 3. Confirm storage resources

#### A. `barrelroll-counter-db`

- database ID: `22277fbe-031d-4cad-8937-245309e981cd`
- used by: `barrelrollcounter-worker`
- schema file: `cloudflare-worker/schema.sql`

```bash
wrangler d1 execute barrelroll-counter-db --file=cloudflare-worker/schema.sql
```

#### B. `naimean-db`

- database ID: `0871f90d-f7e3-467a-a1f9-4e74ac8aef42`
- used by: `naimean-api`
- schema file: `naimean-api/migrations/0000_create_entries.sql`

```bash
wrangler d1 execute naimean-db --file=naimean-api/migrations/0000_create_entries.sql
```

#### C. `naimean-kv`

- namespace ID: `dff7175059ce478eab8c910949ca330f`
- binding: `KV` on `naimean-api`

### 4. Set the required GitHub Actions secrets

In GitHub repo settings, add:

| Secret | Value | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | lets Actions run `wrangler deploy` |
| `CLOUDFLARE_ACCOUNT_ID` | `85d52ed1ca1933df067bf0c167d65a84` | targets the correct account |

Recommended token permissions:

- Workers Scripts: Account Edit
- D1: Account Edit
- Workers KV Storage: Account Edit
- Account Settings: Account Read

### 5. Set Worker secrets

#### `barrelrollcounter-worker`

Already set:

- `SESSION_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `BACKDOOR_ADMIN_KEY` *(undocumented runtime secret; keep value out of repo)*
- `DISCORD_WEBHOOK_URL` *(undocumented runtime secret; keep value out of repo)*

Still missing and needed:

- `OWNER_DISCORD_ID`
- `TOOL_URL_WHITEBOARD`
- `TOOL_URL_CAPEX`
- `TOOL_URL_SNOW`

Commands:

```bash
wrangler secret put SESSION_SECRET --name barrelrollcounter-worker
wrangler secret put DISCORD_CLIENT_ID --name barrelrollcounter-worker
wrangler secret put DISCORD_CLIENT_SECRET --name barrelrollcounter-worker
wrangler secret put DISCORD_REDIRECT_URI --name barrelrollcounter-worker
wrangler secret put OWNER_DISCORD_ID --name barrelrollcounter-worker
wrangler secret put TOOL_URL_WHITEBOARD --name barrelrollcounter-worker
wrangler secret put TOOL_URL_CAPEX --name barrelrollcounter-worker
wrangler secret put TOOL_URL_SNOW --name barrelrollcounter-worker
```

Critical exact-match value:

- `DISCORD_REDIRECT_URI` should be `https://naimean.com/auth/discord/callback` unless the Discord app callback is intentionally changed everywhere.

#### `naimean-api`

Already set:

- `API_TOKEN` *(documented here so it is not forgotten, but value remains out-of-band)*

### 6. Run post-deploy validation

- [ ] `curl https://naimean.com/get` returns JSON with `value`
- [ ] `curl -X POST https://naimean.com/hit` increments successfully
- [ ] `curl https://naimean.com/auth/session` returns JSON, not a 500
- [ ] `curl https://naimean.com/auth/discord/login` redirects to Discord
- [ ] `curl 'https://naimean.com/layout?page=chapel'` returns JSON
- [ ] `curl https://naimean.com/api/health` returns `{ "status": "ok", "timestamp": "..." }`
- [ ] the homepage loads at `https://naimean.com`
- [ ] the latest `deploy-workers` GitHub Actions job is green

### 7. Verify actual D1 tables if metadata looks wrong

If Cloudflare UI/API metadata still reports `num_tables: 0`, verify directly:

```bash
wrangler d1 execute barrelroll-counter-db --command "SELECT name FROM sqlite_master WHERE type='table'"
wrangler d1 execute naimean-db --command "SELECT name FROM sqlite_master WHERE type='table'"
```

---

## Phase 2 — hardening and cleanup

### 8. Put edge protections in front of dynamic routes

Recommended first targets:

- `/hit`
- `/increment`
- `/auth/*`
- `/layout`
- `/api/*`

Use Cloudflare WAF managed rules plus edge rate limits.

### 9. Protect privileged tool flows further

Best candidates:

- `/go/*`
- any future admin/layout management surface

Use Zero Trust or equivalent Cloudflare access controls.

### 10. Add monitoring and alerting

Recommended:

- Worker error-rate alerts
- logging / retention / aggregation
- visibility for deploy failures and 5xx spikes on all three Workers

### 11. Decide what to do with `naimean-sessions`

Current state:

- namespace ID: `8d766501be57403ab84a9f3a3112e8d5`
- not bound to any Worker
- usage unknown

### 12. Keep docs aligned with runtime reality

Especially keep these synchronized:

- `/layout` is required
- `ROUTER_SECRET` is currently unused
- `/go/*` still has frontend migration work left
- undocumented secrets (`BACKDOOR_ADMIN_KEY`, `DISCORD_WEBHOOK_URL`, `API_TOKEN`) still exist operationally

---

## Quick-reference summary

### Workers

- `naimeanv2`
- `barrelrollcounter-worker`
- `naimean-api`

### Storage

- D1: `barrelroll-counter-db`
- D1: `naimean-db`
- KV: `naimean-kv`

### Missing secrets to fix first

- `OWNER_DISCORD_ID`
- `TOOL_URL_WHITEBOARD`
- `TOOL_URL_CAPEX`
- `TOOL_URL_SNOW`

---

_Last updated: 2026-04-23_
