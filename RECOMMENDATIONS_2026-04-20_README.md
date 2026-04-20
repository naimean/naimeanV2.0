# Naimean Recommendations — 2026-04-20

Scoring model:
- **Benefit:** 1 (low) to 5 (high)
- **Risk:** 1 (low) to 5 (high)
- **Priority score:** `Benefit - Risk` (higher = better near-term move)

> Per request, the **highest-risk option is excluded** from this file.

## Prioritized Recommendations (highest priority first)

1. **Align edge-proxy route mapping with configured API paths**
   - Benefit: **5**
   - Risk: **1**
   - Priority score: **+4**
   - Why: Prevents route drift between `wrangler.toml` and `src/index.js`, reducing broken API behavior risk.
   - Status: **Started**.

2. **Add automated CI validation for JavaScript syntax + worker route contract**
   - Benefit: **4**
   - Risk: **1**
   - Priority score: **+3**
   - Why: Catches regressions early in a repo with heavy client-side logic and edge-routing behavior.

3. **Standardize Cloudflare deployment path (single source of truth in CI)**
   - Benefit: **4**
   - Risk: **2**
   - Priority score: **+2**
   - Why: Reduces deployment drift between GitHub Pages checks and worker runtime behavior.

4. **Add security response headers at edge (CSP, frame-ancestors, no-sniff, referrer-policy) with staged rollout**
   - Benefit: **5**
   - Risk: **3**
   - Priority score: **+2**
   - Why: Material risk reduction for XSS/clickjacking/content-type abuse; staged rollout limits breakage risk.

5. **Refactor large front-end scripts into modular files by feature**
   - Benefit: **3**
   - Risk: **2**
   - Priority score: **+1**
   - Why: Improves maintainability and lowers future defect probability.

6. **Add observability baseline (edge + client error telemetry and endpoint health checks)**
   - Benefit: **3**
   - Risk: **2**
   - Priority score: **+1**
   - Why: Speeds incident diagnosis for media-heavy interactions and route-dependent experiences.

7. **Accessibility hardening pass on hidden-hotspot navigation and keyboard paths**
   - Benefit: **3**
   - Risk: **2**
   - Priority score: **+1**
   - Why: Improves usability and reduces accessibility compliance risk.
