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
- Mobile responsive and accessible

## Usage
- Click the power button to boot up the system
- Enter the correct command in the boot prompt to unlock secrets
- Use the shoutbox for hints and Discord invite

## Development
- All code and assets are in this repo
- Edit `styles.css`, `index.html`, and `script.js` for UI/logic changes
- See PLAN.md and UPDATE.md for roadmap and changelog

## Deployment
- Static hosting (GitHub Pages, Vercel, Netlify, etc.)
- To deploy: push to main branch and enable GitHub Pages

### Optional: Cloudflare Worker image stitch endpoint
- A Worker endpoint is included at `worker/stitch.js` with route `/stitch`
- Local/dev deploy config is in `wrangler.toml`
- Chapel view now attempts to load a stitched image from `/stitch?src=/assets/chapel.png&width=1024&height=1536`
- If the endpoint is unavailable, it automatically falls back to `assets/chapel_stacked.png`
- To use a different Worker URL, set `window.NAIMEAN_STITCH_ENDPOINT` before `chapel.html` runs

---
He boiled for our sins
