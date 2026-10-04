# PAUL TOWN — GAP ANALYSIS vs NEW VISUAL TARGET (2026-09-17, overnight)

**Compared:** (A) frozen World Layout — `PAUL_TOWN_APPROVED_WORLD_DESIGN_2026-09-17.md`;
(B) previous Lv4 SVG mockup — `mockup/lv4-390.png`; (C) new approved visual
target — `Downloads/영국교사폴/village2.png` (art direction only; its badge
levels, currency and Paul rendering are NOT product truth).

## 1. Geography check (A vs C) — NO REDESIGN NEEDED
The reference places My House left-centre, the fountain square centre, Book
Shop right, Café centre-right above the square, bridge upper-right with the
river running down the right edge, School on a hill upper-centre, Clock Tower
in the upper-right skyline, "To the Sea" bottom-right, Paul bottom-left, the
4-arm signpost bottom-centre. Every one of these matches the frozen regions
and landmark anchors. Differences are presentational only. The only product
conflict is cosmetic: the reference badge shows Café at Lv.6; the engine's
rule (Lv5) stands.

## 2. What keeps the mockup (B) from the target (C) — ranked by impact
1. **Terrain is flat.** C has painted grass with tonal variation, worn earth
   near lanes, and flower borders lining almost every lane edge. B is a
   gradient with blur blobs. → grass-base tile + patches + `flower-bed-border`
   along lane edges (not only the fence) + wildflower scatter.
2. **No planting mass.** C layers hedges, shrubs and flower clumps around every
   building base and along the fence; foliage overlaps building footings.
   B has speck-sized clusters. → shrub/cluster set at real scale (24–56 px),
   placed overlapping footings; hedge and border strips.
3. **Path reads as a ribbon.** C has warm sandy cobbles with dark joints, wide
   in the foreground, edge-planted, visibly tiled stone. B is a flat fill with
   a faint pattern. → cobble tile system (straight/curves/fork/junction/end),
   depth-scaled, with worn-grass patches on both edges.
4. **Fence reads as a line.** C: chunky white pickets, rail, posts, planting
   behind. B: thin scalloped stroke. → fence tiles with posts/corners/gate.
5. **No atmospheric depth.** C: bluish-green rolling hills and distant trees
   behind the school and tower; landmarks farther away are smaller, cooler,
   softer. B: flat green to the top edge. → `sky-hills` backdrop moved INTO
   Batch 1 (it is the single cheapest depth win) + background tree row.
6. **River is a slab.** C: blue water with white rapids, stone banks, rocks,
   reeds, a weir under the bridge. B: flat blue stroke. → river tiles with
   feathered banks, highlight/rapids overlay, reeds/stones.
7. **Locked landmarks are grey smears.** C paints them fully and adds a lock
   badge. Spec keeps in-world signs (no UI cards), but the haze should be
   lighter: render locked landmarks at ~70 % saturation with a soft haze,
   plus the wooden "Lv.N" sign — not greyscale blur. (Presentation tweak;
   `fogState()` copy unchanged.)
8. **Props density on the square.** C: lamps, benches, flower pots, tables.
   These are mostly the existing movable catalog items (bench, lamp, post box,
   flower garden) — the engine already supports them; the mockup simply
   places too few. Scenery pots (`flower-pot`) added as a small Batch 1 extra.

Items 1–6 are exactly Batch 1. Item 5 adds one file; item 8 adds one file.

## 3. Reconciliation of the 28-asset package (minimal changes)
- **Added to Batch 1 (2 files):** `backgrounds/sky-hills` (1024×260, opaque,
  top band, blue-green rolling hills with distant trees — the depth cue);
  `backgrounds/flower-pot` (128×128, alpha, terracotta pot with flowers —
  scenery prop for the square/café edge).
- **Prompt adjustments (no spec change):** cobbles = warm sandy stone with
  darker mossy joints (not grey); pickets = chunky, slightly weathered white
  with visible posts and rail; hills = cool blue-green haze; river = clear
  blue with white rapids near rocks; flower borders = dense mixed cottage
  colours (pink, lavender, white, yellow). Style lock §0 gains one line:
  "vegetation is dense, layered and slightly oversized like a storybook
  cottage garden".
- **Unchanged:** all 28 canvases, anchors, tile behaviours, the frozen
  geography, the 47 placement cells, level rules, catalog, prices.
- Batch 1 total: **30 files.**

## 4. Not changed on purpose
Paul (official asset only), My House and Book Shop art, catalog/prices/levels,
`british-cottage` (deferred), Explore/Friends (slots only), the renderer.
