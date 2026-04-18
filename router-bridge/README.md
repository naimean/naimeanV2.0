# Router Bridge

Local Node.js script that runs on any always-on device **at the house** (PC, Raspberry Pi, old laptop). It polls the Cloudflare Worker every 30 seconds and, when a reboot command is queued from the website, logs into the RS200 and triggers a reboot — no port-forwarding required.

## How it works

```
naimean.com/router.html  →  POST /router/reboot  →  Cloudflare Worker (D1: pending = 1)
                                                              ↑ polls every 30s
                                                    bridge.js (this script, local device)
                                                              ↓ pending = true
                                                    RS200 admin API → reboot
                                                    POST /router/ack → D1: pending = 0
```

## Setup

### 1. Prerequisites

- Node.js **18 or later** — [nodejs.org](https://nodejs.org)
- The device must stay on and connected to the RS200's network

### 2. Install dependencies

```bash
cd router-bridge
npm install
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable            | Description                                                  |
|---------------------|--------------------------------------------------------------|
| `WORKER_URL`        | Cloudflare Worker URL (already set to the correct default)   |
| `ROUTER_SECRET`     | The secret you set with `wrangler secret put ROUTER_SECRET`  |
| `ROUTER_IP`         | RS200 LAN IP (usually `192.168.1.1`)                         |
| `ROUTER_USER`       | Router admin username (usually `admin`)                      |
| `ROUTER_PASS`       | Router admin password                                        |

The `.env` file stays on this machine — it is never sent anywhere.

### 4. Set the Cloudflare Worker secret

On your dev machine (one time only):

```bash
cd cloudflare-worker
wrangler secret put ROUTER_SECRET
# paste the same secret you put in .env, then press Enter
```

### 5. Run

**Manual (test):**
```bash
node bridge.js
```

**With pm2 (auto-restart, survives crashes):**
```bash
npm install -g pm2
pm2 start bridge.js --name router-bridge
pm2 save
pm2 startup   # follow the printed command to enable on boot
```

**With systemd (Linux / Raspberry Pi):**

Create `/etc/systemd/system/router-bridge.service`:

```ini
[Unit]
Description=Naimean Router Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/naimeanV2.0/router-bridge
ExecStart=/usr/bin/node bridge.js
Restart=on-failure
RestartSec=15

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable router-bridge
sudo systemctl start router-bridge
sudo systemctl status router-bridge
```

## Troubleshooting

### "Router login failed (HTTP 403)"
The RS200 may require you to first log in via the browser admin page and accept a terms/update prompt before the REST API becomes available.

### "Router login succeeded but no session cookie was returned"
Your firmware may use a different login endpoint. Open the RS200 admin page in a browser, open DevTools → Network, log in, and look at what URL and response headers the login request uses. Update `ROUTER_LOGIN_PATH` in `.env` accordingly.

### "Reboot command failed"
Similarly, inspect the Network tab when clicking "Reboot" in the router's own admin UI to find the correct reboot endpoint, and update `ROUTER_REBOOT_PATH` in `.env`.

### The bridge sees `pending: true` but the router doesn't reboot
Check the bridge logs (`pm2 logs router-bridge`). If login succeeds but the reboot call fails, see the firmware troubleshooting notes above.
