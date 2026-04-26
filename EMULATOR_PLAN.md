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
   - Cores (`.data` header files) and compression utilities are also stored under `public/assets/retroarc/cores/` and `public/assets/retroarc/compression/` respectively.
   - Full core binaries (`.js` + `.wasm`) are downloaded at deploy time by `scripts/download-ejs-cores.js` and excluded from git; `EJS_pathtodata` now points entirely to the self-hosted path.
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
