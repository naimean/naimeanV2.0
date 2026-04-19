# Development Plan: naimeanV2.0

# Vision & User Flow

- User freehands naimean.com in browser → lands on C64-themed landing page
- Entertaining games/experiences to keep user engaged
- Clear call-to-action: join Discord (main community hub)
- Discord is used for authentication (Auth0 or OAuth)
- Message board (shoutbox): only registered (Discord-authenticated) users can post
- Discord join prompt and widget overlay

# Technical/Design Constraints

- Pure HTML/CSS/JS (no frameworks)
- All overlays (shadow, power button, data light) absolutely positioned within fixed-size, relatively positioned container
- No flexbox for overlays; fixed pixel sizes for C64 image and overlays
- All media assets optimized for fast load

# Features (Current & Planned)

## Current
- Commodore 64-themed landing page
- Interactive power button with CRT-on effect
- Animated shadow layer
- Data (flicker) light next to power button
- Static video/audio overlay (merged with FFmpeg)
- Shoutbox mini-game command loop (guessing game)

## In Progress
- Debug overlay alignment and button clickability
- Shrink and center shadow box, align overlays

## Next Steps
1. Integrate Discord OAuth for registration/authentication
2. Implement message board (shoutbox) for registered users
3. Discord widget overlay and join prompt
4. Video/sound/static overlay sequencing (beyond current static/audio)
5. Final UI/UX polish based on user feedback
6. Accessibility review (keyboard, ARIA, color contrast)
7. Add more C64-style effects (optional)
8. Prepare for deployment (static hosting)
9. Update documentation

# Deployment Plan
- Ensure all assets are present and optimized
- Test on major browsers and mobile
- Deploy to static hosting (e.g., GitHub Pages, Vercel, Netlify)
- Push all changes to GitHub main branch

---
_Last updated: 2026-04-19_
