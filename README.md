# Naimean V2.0

A Commodore 64-themed interactive landing page with retro effects, puzzles, and Discord integration.

## Features
- C64-style UI with CRT-on animation
- Interactive power button and animated shadow layer
- Data (flicker) light next to power button
- Boot input and button styled in Commodore blue/white
- Discord widget overlay
- Video/sound/static overlay sequencing
- Shoutbox with hint system and Discord join prompt
- Shoutbox mini-game command flow with number-guess gameplay (`C:\Naimean\play`)
- Discord OAuth worker-route foundation and in-screen auth command/status flow
- POST-only counter write flow (`/hit`, `/increment`)
- Mobile responsive and accessible

## Usage
- Click the power button to boot up the system
- Enter the correct command in the boot prompt to unlock secrets
- Use the shoutbox for hints and Discord invite

## Development
- All code and assets are in this repo
- Pages: `chapel.html` (chapel experience), `bedroom_antechamber.html` (bedroom scene), `index.html` (placeholder landing)
- Main C64 boot experience: `script.js` + `styles.css` (linked to the boot page)
- Assets live in the `assets/` directory
- See PLAN.md and UPDATE.md for roadmap and changelog
- See `CLOUDFLARE_README.md` for Cloudflare architecture and deployment details
- Cloudflare edge hardening baseline now includes strict response headers (CSP/HSTS/secure headers)

## Recent Updates (2026-04-20)
- Added shoutbox mini-game flow and replay support while preserving existing unlock behavior.
- Added Discord OAuth integration foundation (`/auth/discord/*`, `/auth/session`, `/auth/logout`) with callback result handling and one-time URL cleanup.
- Added edge security-header hardening baseline (CSP/HSTS + secure header policy target).
- Started hardening the next recommendation item by enforcing POST-only writes for counter endpoints.
- Documented and prioritized Cloudflare security and deployment recommendations in `CLOUDFLARE_README.md`.

## Deployment
- Static hosting (GitHub Pages, Vercel, Netlify, etc.)
- GitHub deployment check runs on pull requests via `.github/workflows/github-pages.yml`
- GitHub Pages deploy runs on pushes to `main`/`master`

---
He boiled for our sins
