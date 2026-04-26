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
   - Cache `loader.js`, `emulator.min.js`, and `emulator.min.css` in `public/assets/emulatorjs/` so the arcade is not dependent on CDN availability.
   - _Status: done_

5. **Keyboard/gamepad control overlay**
   - Show a brief on-screen control reference when a game first loads so users know how to play.
   - _Status: done_

---

_Last updated: 2026-04-25_
