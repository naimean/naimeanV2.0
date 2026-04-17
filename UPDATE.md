# Update Log: naimeanV2.0

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

## In Progress
- Debug overlay alignment and button clickability
- Shrink and center shadow box, align overlays

## Next Steps
1. Add entertaining mini-games or interactive experiences
2. Integrate Discord OAuth for registration/authentication
3. Implement message board (shoutbox) for registered users
4. Discord widget overlay and join prompt
5. Video/sound/static overlay sequencing (beyond current static/audio)
6. Final UI/UX polish based on user feedback
7. Accessibility review (keyboard, ARIA, color contrast)
8. Add more C64-style effects (optional)
9. Prepare for deployment (static hosting)
10. Update documentation

# Deployment Plan
- Ensure all assets are present and optimized
- Test on major browsers and mobile
- Deploy to static hosting (e.g., GitHub Pages, Vercel, Netlify)
- Push all changes to GitHub main branch

---

# Update Log

## 2026-04-15
- Data light moved down 3px and right 5px for precise placement
- Power button border removed, glow effect retained
- White color now blue-tinted to match Commodore palette
- Animated shadow layer improvements
- README, PLAN, and UPDATE docs refreshed

## Previous Updates
- Interactive power button and CRT-on animation
- Animated shadow layer and flicker logic

---
_Automated update by GitHub Copilot_
