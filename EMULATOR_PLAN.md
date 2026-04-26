# Emulator Plan

## Overview

Improvements and housekeeping items for the arcade/emulator feature built on [EmulatorJS](https://emulatorjs.org/).

---

## Plan Items

1. **Show exact ROM filenames in the game list UI**
   - Display the raw filename (minus extension) instead of a separate translated `name` field.
   - Removes a layer of indirection that can cause the UI label and the actual ROM file to drift out of sync.
   - _Status: done_

2. **Add platform/system section headers in the game list**
   - Group entries visually under their console label (NES, SNES, GB, etc.) so the list is easier to browse as more ROMs are added.
   - _Status: done_

3. **Simplify `manifest.json` to filename-only arrays**
   - Drop the `{ name, file }` object format and use plain filename strings per system.
   - The display name is derived directly from the filename, so the extra `name` field is no longer needed.
   - _Status: done_

4. **Self-host EmulatorJS core assets**
   - Cache `loader.js`, `emulator.min.js`, and `emulator.min.css` in `public/assets/retroarc/` so the arcade is not dependent on CDN availability.
   - In EmulatorJS 4.x all cores ship as a single `{core}-wasm.data` file (WASM binary is bundled in; there are no separate `.js`/`.wasm` files).
   - All 20 core `.data` files are stored in the **Cloudflare R2 bucket `retroarc-cores`** to avoid bloating the git repository (~23 MB of binary blobs).
   - The edge router (`src/index.js`) intercepts every `/assets/retroarc/cores/*.data` request and serves the file from R2 with:
     - `ETag` header (R2 content hash) enabling HTTP cache validation
     - `304 Not Modified` responses when `If-None-Match` matches — avoiding full re-downloads (cache busting)
     - `Cache-Control: public, max-age=31536000, immutable` for long-lived browser caching
   - `scripts/upload-cores-to-r2.js` (no external deps) uploads/refreshes cores in R2 using the Cloudflare REST API.
   - `scripts/download-ejs-cores.js` can still be used to refresh local `.data` files before re-uploading to R2 when a new EmulatorJS release ships.
   - CI (`deploy-workers` job) downloads cores and uploads them to R2 on every push to main so R2 always stays current.
   - `EJS_pathtodata` in `public/script.js` still points to `/assets/retroarc/` — EmulatorJS constructs the full `.data` URL transparently; the edge worker intercepts and re-routes to R2.
   - _Status: done_

5. **Keyboard/gamepad control overlay**
   - Show a brief on-screen control reference when a game first loads so users know how to play.
   - _Status: done_

6. **Escape key closes arcade overlay**
   - Pressing Escape when the arcade is open (and not in fullscreen mode) now closes the overlay.
   - Previously Escape only exited fullscreen; now it also dismisses the picker/player entirely.
   - _Status: done_

7. **Per-system keyboard controls in the hint overlay**
   - The controls hint now shows the correct button layout for the active system (NES, SNES, GBA, N64, Sega Genesis, etc.) instead of a single hardcoded mapping.
   - The title updates to reflect the system name (e.g. "SNES CONTROLS", "N64 CONTROLS").
   - _Status: done_

8. **Remember last-played game across sessions**
   - The last launched game (`system` + `file`) is saved to `localStorage`.
   - When the arcade is reopened, that game is automatically pre-selected in the list so the user can resume quickly without scrolling.
   - _Status: done_

---

_Last updated: 2026-04-26_
