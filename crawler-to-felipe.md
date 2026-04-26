# Crawler to Felipe

Hey Felipe,

I wanted to take some time to catch you up on where things stand with the Cloudflare stack for `naimean.com`, drop some context about recent work, and give you a straight list of things that still need attention on your side. This is less of a formal handoff and more of a "here's what I know, here's what I'm not sure about, and here's what I'd do next if I were you" letter.

---

## Where things stand right now

The site is running. The three Workers are deployed, the two D1 databases are live, and GitHub Actions deploys everything on push. Discord OAuth, email auth, rate limiting, and the `/go/*` tool redirects are all wired up and working. The emulator arcade is complete — eight planned items shipped, cores living in R2, cache busting working correctly.

The documentation has been thoroughly refreshed. `README.md`, `CLOUDFLARE_README.md`, `FELIPE_HANDOFF.md`, `PLAN.md`, and `naimean-README.md` all reflect the current state of the stack. If you ever need to hand this off to someone else or recover from a bad deploy, those docs are the starting point.

That said, there are a handful of open threads on the Cloudflare/ops side that I haven't been able to close from this end. Those are the things I need you to look at.

---

## Things I need you to handle on the Cloudflare side

### 1. Confirm the R2 buckets exist and that the CI token can write to them

The `wrangler.toml` now binds two R2 buckets:

| Binding | Bucket name | Purpose |
|---|---|---|
| `CORES` | `retroarch-cores` | EmulatorJS core `.data` files (~23 MB) |
| `UPLOADS` | `radley-gallery` | Upload-tool output for `uploads.naimean.com` |

CI uploads the EmulatorJS cores to `retroarch-cores` on every push to main. If the bucket doesn't exist or the token doesn't have R2:Edit permission, that job will silently fail and the arcade will break on the next deploy.

**Please do:**
- Log into the Cloudflare dashboard and confirm both buckets exist under R2
- Check the `CLOUDFLARE_API_TOKEN` GitHub Actions secret and verify it includes R2:Edit (or Workers R2 Storage: Account Edit) in its permission set
- Run a test push or manually trigger the `deploy-workers` CI job and confirm the R2 upload step passes

If the buckets don't exist yet, create them now. The bucket names are exact: `retroarch-cores` and `radley-gallery`.

---

### 2. Turn on WAF managed rules and edge rate limiting

Right now there is nothing in front of the dynamic endpoints at the Cloudflare edge. App-level rate limiting exists in the Worker, but that's defense-in-depth — it doesn't stop abuse from ever hitting the Worker.

**Please do:**
- Enable Cloudflare WAF managed rules on the `naimean.com` zone
- Add edge rate limiting rules for these paths:
  - `/hit` and `/increment` (POST) — counter writes
  - `/auth/*` (all methods) — auth endpoints
  - `/layout` (POST) — layout saves
  - `/api/*` (all methods) — public API

For rate limit values, start conservative: 20 req/min per IP on auth and writes, 100 req/min on GET endpoints. Tighten from there once you see real traffic patterns.

---

### 3. Put Zero Trust in front of `/go/*`

The `/go/*` routes redirect authenticated users to internal tools (Whiteboard, CapEx tracker, ServiceNow). Auth is checked server-side in the Worker, which is good. But Zero Trust would add a second layer before the request ever reaches the Worker, and that's worth doing.

**Please do:**
- Set up a Cloudflare Access policy for `naimean.com/go/*`
- Decide which identity provider to use (Discord is already set up for the site's own auth, but Cloudflare Access can use its own)
- Consider doing the same for any future admin or layout-management paths

---

### 4. Add monitoring and alerting

There is currently no visibility into Worker errors or deploy failures beyond what GitHub Actions shows. If a Worker starts throwing 5xx errors at 3am, nobody will know until a user reports it.

**Please do:**
- Set up Worker error-rate alerts in the Cloudflare dashboard (Workers > Analytics > Alerts)
- Enable Cloudflare Logpush or Workers Trace Events for the three Workers so there is a log trail for debugging
- Set an alert for the GitHub Actions `deploy-workers` job as well (GitHub can send notifications to email/Slack/Discord on workflow failure)

---

### 5. Verify the D1 schemas if metadata still looks wrong

There was a known issue where the Cloudflare dashboard was reporting `num_tables: 0` for both D1 databases even though the schemas had been applied. The data was fine — it was a metadata display bug — but it's worth confirming directly.

Run these from wherever you have `wrangler` access:

```bash
wrangler d1 execute barrelroll-counter-db --command "SELECT name FROM sqlite_master WHERE type='table'"
wrangler d1 execute naimean-db --command "SELECT name FROM sqlite_master WHERE type='table'"
```

You should see `rickroll_counter`, `layout_overrides`, and `registered_users` in the first one, and `entries` in the second. If anything is missing, the schema files are in the repo and a single command re-applies them:

```bash
wrangler d1 execute barrelroll-counter-db --file=cloudflare-worker/schema.sql
wrangler d1 execute naimean-db --file=naimean-api/migrations/0000_create_entries.sql
```

---

### 6. Decide what to do with `naimean-sessions`

There is a KV namespace called `naimean-sessions` (ID: `8d766501be57403ab84a9f3a3112e8d5`) in the account. It is not bound to any Worker. I don't know if it was used at some point and then replaced, or if it was created speculatively and never used.

**Options:**
- If it's still needed for something, bind it and document what it does
- If it isn't, delete it — unused resources in Cloudflare are a small but real footprint cost and a source of confusion during future audits

Either decision is fine. Just make it and update the docs.

---

### 7. Set the optional backend secrets if you want the behavior

These secrets are optional — the Worker has fallback behavior — but they unlock specific features:

| Secret | Worker | Effect when set |
|---|---|---|
| `OWNER_DISCORD_ID` | `barrelrollcounter-worker` | restricts `POST /layout` to your Discord account only |
| `TOOL_URL_WHITEBOARD` | `barrelrollcounter-worker` | overrides the built-in HTTPS fallback for `/go/whiteboard` |
| `TOOL_URL_CAPEX` | `barrelrollcounter-worker` | overrides the built-in HTTPS fallback for `/go/capex` |
| `TOOL_URL_SNOW` | `barrelrollcounter-worker` | overrides the built-in HTTPS fallback for `/go/snow` |

If the tool URLs in the Worker fallbacks are already the right destinations, you don't need to set these. If you need to override them with internal URLs, set them now.

---

### 8. Add a D1 backup cadence

Both D1 databases are live production state with no documented backup/export routine. Cloudflare D1 does not have automatic backups in the same way as a managed Postgres service.

**Please do:**
- Set up a periodic export of both databases (weekly or monthly, depending on how much the data changes)
- Document the restore procedure and test it at least once before you need it in anger

A simple `wrangler d1 export` to a local file and then upload to R2 or an S3-compatible bucket is enough to get started.

---

## A few things to keep an eye on

- `BACKDOOR_ADMIN_KEY` and `DISCORD_WEBHOOK_URL` are operational secrets that exist in the Worker environment but are not consumed by the current repo code. They're tracked out-of-band. Whatever they do, make sure someone besides you knows what they're for.
- The production rule: `naimean.com` must always route through `naimeanv2`. If DNS is ever changed so the domain points directly at GitHub Pages, auth, `/layout`, `/go/*`, and the arcade cores all break silently. Don't do it. Don't let a well-meaning registrar or DNS auto-fix do it either.
- The `naimean.com/api/*` route has higher priority than `naimean.com/*` in Cloudflare. If routes are ever recreated from scratch, verify the API route wins. The routing table in `CLOUDFLARE_README.md` has the details.

---

## What's working well and doesn't need your attention right now

- The Workers are all deploying from CI correctly
- The auth stack (Discord OAuth + email) is solid
- The rate limiting is in place at the app level
- The arcade is complete and the R2 architecture is sound (it just needs the buckets confirmed)
- The docs are accurate — use them

---

That's the full picture. The big ones on your list are the R2 confirmation, the WAF/rate-limit setup, and the monitoring. Everything else is cleanup and hardening that can happen on a normal ops cadence.

Let me know if anything in here is unclear or if the state on your end looks different from what I've described.

Take care,

— Copilot, on behalf of the repo

---

_Document: crawler to felipe_
_Last updated: 2026-04-26_
