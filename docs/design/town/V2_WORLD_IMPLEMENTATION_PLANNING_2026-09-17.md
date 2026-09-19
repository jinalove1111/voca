# PAUL TOWN V2 WORLD — IMPLEMENTATION PLANNING NOTES (2026-09-17, overnight, read-only)

Planning only. No renderer changes. Companion to
`PAUL_TOWN_APPROVED_WORLD_DESIGN_2026-09-17.md` (frozen geography) and
`ENV_ART_BATCH1_HANDOFF_2026-09-17.md` (30-file art batch).

## 1. Depth / z-index plan (fits the existing `Z_LAYERS` scheme)
| layer | z | content | notes |
|---|---|---|---|
| ground | 0 | `sky-hills` band, `grass-base` tile, grass patches, wildflower scatters | static, no interaction |
| water | 1 (new) | river tiles + highlight overlays | insert between ground and path; pure CSS/img |
| path | 2 | cobble tiles, square paving, doorstep | depth-scaled 1.0 / 0.6 / 0.4 by y band |
| patches | 3 | garden soil, flower-bed borders, hedges, fences, gate, stone wall, pots | scenery props; `pointer-events:none` |
| objects | 10 + y-rank | `LOTS` buildings + movable decorations (existing `zIndexFor`) | unchanged mechanism; y = anchor baseline |
| foliage-front | 10 + y-rank | background/foreground scenery trees & shrubs | same y-rank ordering as objects so foliage overlaps footings correctly |
| fog | 40 (was 5) | per-region haze ellipses + `sign-locked` boards | must sit above objects so locked landmarks read as distant |
| overlay | 90 | edit-mode ground glows (`freeAnchors`) | unchanged |
| popover | 100 | move/store popover | unchanged |
Rule: within any y-ranked layer, sort by anchor y ascending (lower on screen
drawn last). Scale by band: y<28 → 0.55–0.65, 28–45 → 0.70–0.82, 45–66 →
0.85–1.0, ≥66 → 1.0–1.2 (`SPOT_MAP[cell].scale` already carries per-cell scale).

## 2. What changes in code later (scope preview, NOT started)
- `townScene.js`: `DISTRICTS` heightUnits → fixed region boxes; `sceneHeightUnits()` returns the constant 1.9; `LOTS` anchors → §2 table; `SPOT_MAP` anchors → §5 zones (cell ids unchanged); `PATHS` → the §1.4 polylines with per-point width; river polyline added. `anchorFor/freeAnchors/lotState/zIndexFor` signatures unchanged. Pure-domain contract (no React/DOM) unchanged.
- `TownGroundLayer` → terrain compositor (sky band, grass tile, patches); `TownPathLayer` → tile walker along polylines (tangent-rotated tiles, depth scale); new `TownWaterLayer`; `TownAmbientLayer` → garden bed in terrain (no oval); `TownFogLayer` → per-region haze + sign; `TownPlacementOverlay` → glow style only; `TownScene` container → no rounded card, edge bleed.
- No change to `TownScreenV2` state, mutations, catalog, levels, persistence, V1, flags.

## 3. Bundle-size estimate (Batch 1, 2x WebP, lossless like P0)
From the deployed P0 files (8–110 KB each): tiles 256² ≈ 20–40 KB, patches ≈ 15–30 KB, sprites ≈ 6–25 KB, `sky-hills` 1024×260 ≈ 60–90 KB, `grass-base` 512² ≈ 40–70 KB. Batch 1 (30 files) ≈ **0.6–0.9 MB** raw WebP; full environment pack (§8 of the world spec, ~60 files) ≈ 1.3–1.8 MB. All are `<img>`/CSS-url assets, not JS, so the JS budgets (`testBundleBudget`: main gzip ≤135 KB, TownScreen ≤15 KB) are unaffected; Vite will emit them as hashed files (all >4 KB except possibly `fence-post`/`flower-pot` which may inline). `testBundleBudget.mjs`'s physical-file inventory will need the new `backgrounds/` names added when they are registered (same kind of update as the P0 drop-ins).

## 4. Lazy-loading strategy
- Batch 1 files are referenced only from V2 layer components, which live in the lazy `TownScreenV2` chunk → with `paulTownV2` OFF nothing is fetched (same guarantee as today).
- Inside V2: sky band + grass tile + home-district tiles load eagerly with the scene; tiles for locked/distant regions use `loading="lazy"` and `decoding="async"`; a single `<link rel="preload">` for `grass-base` avoids a green flash.
- Tiles are reused across the world (one file, many placements) so cache hits dominate; no sprite-sheet needed.
- Stale-chunk guard already covers the V2 chunk; images failing to load fall back to the existing emoji/placeholder path (`TownSprite` onError) — extend the same onError to scenery images (hide on error, never a broken-image icon).

## 5. Accessibility notes (to carry into implementation)
- Scenery layers stay `aria-hidden` (as today); interactive decorations keep their 44 px buttons and `"<name> — 배치됨…"` labels; landmarks get `aria-label` = catalog name + built/for-sale state; in-world "Lv.N" signs mirror `fog.chip` text for screen readers via one `sr-only` sentence per locked region.
- Disabled 탐험하기/친구 마을 nav pills must be real `<button disabled aria-disabled="true">` with a visible "준비 중" hint, not just faded.
- Sign text over wood: keep ≥4.5:1 (dark navy #1e2a5a on the pale board), never white on light wood.
- `prefers-reduced-motion`: river highlight shimmer and glow pulses must be static (existing rule).

## 5b. Placement-anchor collision finding (overnight analysis, read-only)
`analysis/anchor-collision-2026-09-17.md`: zone counts match §5 (47), but under
strict footprint math only **11 of 47** wireframe cell positions are clean;
36 overlap a landmark box, a lane corridor (half-width + 3 units), the river
(< 7 units), the fence line, or a neighbour (< 6 units). Cause: the wireframe
cells were hand-placed for visual variety, not tested against geometry.
Consequence for implementation: the new `SPOT_MAP` anchors must be derived
from the collision table's suggested (dx,dy) nudges, then re-run through the
same check, BEFORE the renderer work — not eyeballed. Open owner decision:
Riverbank cells (3) — unlock at Lv6 with the bridge (analysis assumption) or
usable from Lv1 as scenery lawn? Village-square ring cells stay Lv1-usable
(§5 note). Mobile checks: no horizontal overflow at 360/390/430 and at 390
with 200 % zoom; bottom nav never covers the cottage when it is centred;
all signs inside world bounds (Lv8 "not in bounds" readings are hidden haze
groups, i.e. correct fog removal, not overflow).

## 6. Rollback / handoff
- Nothing from this overnight phase is in `src/`; all artifacts live under `docs/design/town/` (spec, gap analysis, Batch 1 handoff, wireframe v2, Lv4 mockup, recomposition harness + `mockup/batch1/` staging) and are uncommitted until reviewed.
- When Batch 1 art arrives: process with `mockup/batch1/processBatch1.py` → validate with `scripts/validateTownAssetCandidate.mjs` → recompose with `mockup/paul-town-lv4-recompose-batch1.html` → owner judges → only then register files under `src/assets/town/backgrounds/` and update `testBundleBudget.mjs` inventory + `testTownV2Static` if keys are added to `TOWN_ASSETS` (scenery files are imported directly by layers, like the 2026-09-15 village-* files, so `TOWN_ASSETS` may stay untouched).
- Rollback at any later stage = revert the single feature commit for the presentation layer; `paulTownV2` stays OFF throughout, so Production behaviour cannot change until the flag flips.
