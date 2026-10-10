# PAUL TOWN — ENVIRONMENT ART BATCH 1 (production handoff, 2026-09-17)

**Scope:** the 8 environment components that prove the visual language — grass
base, grass patches, cobblestone path system, picket fence, garden gate, hedge,
flower/shrub clusters, river + banks. Nothing else (no Café/School/Tower, no
My House, no Book Shop, no Paul).

**Geography:** frozen — `PAUL_TOWN_APPROVED_WORLD_DESIGN_2026-09-17.md` (world
100×190, My House (22,53) w34, Book Shop (78,63) w20, river on the far right,
lane from the front door through the gate). Assets are composed INTO that
geometry; they do not redefine it.

**Generation:** external (same pipeline as the P0 seven). Split-prompt rule:
ONE subject per prompt, failure-critical constraints first, never a combined
sheet. Each result is validated here with `scripts/validateTownAssetCandidate.mjs`
(real alpha, ≥4 % margins for sprites; seamlessness for tiles), processed to
the exact canvases below, and recomposed into the Lv4 mockup before anything
is registered.

**Staging folder:** `docs/design/town/mockup/batch1/` (NOT `src/assets/` —
nothing is registered in `TOWN_ASSETS` until the batch passes the acceptance
test).

---

## 0. STYLE LOCK (prepend to every prompt)

> Storybook illustration for a children's English-learning game, cozy British
> village, 3/4 top-down view (about 30° from above, slight isometric), warm
> daylight, light from the upper-left, soft natural shadows, rich but readable
> colours, painterly but clean edges, no outline strokes, whimsical and
> premium. Must match these existing pieces exactly in style: ivy-covered
> stone cottage with slate roof, blue-fronted book shop with striped awning,
> round leafy tree with flowers at its base, black British street lamp, red
> pillar post box, wooden park bench. No photographs, no photo textures, no
> emoji, no clip-art, no text, no watermark, no franchise/IP references.

Negative list (append to every prompt): `photo, photorealistic, 3D render,
emoji, clip art, vector flat, text, letters, watermark, signature, frame,
border, checkerboard, gradient background, black background, white background`.

Self-check line (append to every transparent asset): `Export PNG-32 with a real
alpha channel; the background must be genuinely transparent (not white, not
checkerboard); keep ≥5 % empty margin on every side; the object must be
complete and not cropped.`

---

## 1. ASSET SPECIFICATIONS

Anchor = bottom-center unless stated. "Rendered" = width on a 390 px screen.
All files are 2x; 1x is derived here (half size).

### 1.1 GRASS / TERRAIN BASE
| asset_key | filename | px (2x) | transparent | perspective | anchor | tile/repeat | rendered | variants |
|---|---|---|---|---|---|---|---|---|
| backgrounds/grass-base | grass-base.webp | 512×512 | NO | top-down painted | fill | seamless tile, both axes | 128 px per tile (4× across the world) | — |

### 1.2 GRASS VARIATION PATCHES
| asset_key | filename | px | transparent | perspective | anchor | tile | rendered | variants |
|---|---|---|---|---|---|---|---|---|
| backgrounds/grass-patch-light | grass-patch-light.webp | 400×280 | YES (feathered) | top-down | center | overlay, no repeat | 120–200 px | — |
| backgrounds/grass-patch-dark | grass-patch-dark.webp | 400×280 | YES (feathered) | top-down | center | overlay | 120–200 px | — |
| backgrounds/grass-patch-worn | grass-patch-worn.webp | 400×200 | YES (feathered) | top-down | center | overlay, placed along path edges | 100–160 px | — |
| backgrounds/wildflower-scatter | wildflower-scatter.webp | 320×240 | YES | top-down | center | overlay | 80–120 px | — |

### 1.3 COBBLESTONE PATH SYSTEM (all tiles share one cobble scale and colour)
| asset_key | filename | px | transparent | perspective | anchor | tile/repeat | rendered | variants |
|---|---|---|---|---|---|---|---|---|
| backgrounds/path-straight | path-straight.webp | 256×256 | YES (grass-edge feather on both sides) | top-down, path runs bottom→top | center | repeat along path; rotate freely | 64 px tile; path width ≈ 40 px foreground | -narrow (width 60 %) for distance |
| backgrounds/path-curve-gentle | path-curve-gentle.webp | 256×256 | YES | enters bottom-center, exits top-right at ~30° | center | rotatable/mirrorable | 64 px | — |
| backgrounds/path-curve-strong | path-curve-strong.webp | 256×256 | YES | enters bottom-center, exits right-center (90°) | center | rotatable/mirrorable | 64 px | — |
| backgrounds/path-fork | path-fork.webp | 256×256 | YES | enters bottom-center, exits top-left and top-right (Y) | center | rotatable | 64 px | — |
| backgrounds/path-junction | path-junction.webp | 256×256 | YES | enters bottom, exits top and right (T) | center | rotatable | 64 px | — |
| backgrounds/path-end | path-end.webp | 256×160 | YES | path ends in a rounded flagstone doorstep | bottom-center | none | 64 px | -entrance (widens into a small paved apron) |

Taper toward distance is achieved in composition by scaling the same tiles
(100 % foreground → 60 % near the bridge → 40 % near the school); the
`-narrow` straight variant keeps cobble size believable at distance.

### 1.4 PICKET FENCE
| asset_key | filename | px | transparent | perspective | anchor | tile | rendered | variants |
|---|---|---|---|---|---|---|---|---|
| backgrounds/fence-straight | fence-straight.webp | 256×96 | YES | 3/4 view, seen slightly from above | bottom-left | repeat-x along a curve (segment 64 px) | 64 px per segment, 24 px tall | -short (2 pickets, 128×96) for corners |
| backgrounds/fence-corner | fence-corner.webp | 128×128 | YES | 3/4 view, turns 90° | bottom-center | none | 32 px | mirrored in composition |
| backgrounds/fence-post | fence-post.webp | 64×112 | YES | 3/4 view | bottom-center | none | 16 px | — |

### 1.5 GARDEN GATE
| asset_key | filename | px | transparent | perspective | anchor | tile | rendered | variants |
|---|---|---|---|---|---|---|---|---|
| backgrounds/fence-gate | fence-gate.webp | 192×128 | YES | 3/4 view, gate open inward ~20° | bottom-center | none | 48 px | -closed |

### 1.6 HEDGE
| asset_key | filename | px | transparent | perspective | anchor | tile | rendered | variants |
|---|---|---|---|---|---|---|---|---|
| backgrounds/hedge-straight | hedge-straight.webp | 256×128 | YES | 3/4 view, trimmed box hedge | bottom-left | repeat-x (segment 64 px) | 64 px, 32 px tall | -tall (256×160) |
| backgrounds/hedge-end | hedge-end.webp | 128×128 | YES | rounded end cap | bottom-center | none | 32 px | mirrored |
| backgrounds/hedge-corner | hedge-corner.webp | 128×128 | YES | 90° turn | bottom-center | none | 32 px | — |

### 1.7 FLOWER / SHRUB CLUSTERS
| asset_key | filename | px | transparent | perspective | anchor | tile | rendered | variants |
|---|---|---|---|---|---|---|---|---|
| backgrounds/shrub-round | shrub-round.webp | 160×128 | YES | 3/4 view | bottom-center | none | 24–40 px | -small (128×96) |
| backgrounds/shrub-wide | shrub-wide.webp | 224×112 | YES | 3/4 view, low spreading | bottom-center | none | 40–56 px | — |
| backgrounds/flower-cluster-pink | flower-cluster-pink.webp | 160×112 | YES | 3/4 view, hydrangea/rose mix | bottom-center | none | 24–40 px | — |
| backgrounds/flower-cluster-yellow | flower-cluster-yellow.webp | 160×112 | YES | daisies/buttercups | bottom-center | none | 24–40 px | — |
| backgrounds/flower-cluster-mixed | flower-cluster-mixed.webp | 192×112 | YES | mixed border planting | bottom-center | none | 32–48 px | — |
| backgrounds/flower-bed-border | flower-bed-border.webp | 320×112 | YES | low planting strip along a fence/wall | bottom-left | repeat-x | 80 px | — |

### 1.8 RIVER WATER + BANKS
| asset_key | filename | px | transparent | perspective | anchor | tile | rendered | variants |
|---|---|---|---|---|---|---|---|---|
| backgrounds/river-straight | river-straight.webp | 256×256 | YES (bank feather into grass on both sides) | top-down, water runs bottom→top, width ≈ 55 % of tile | center | repeat along the river curve; rotatable | 64 px tile; water ≈ 36 px | — |
| backgrounds/river-bend | river-bend.webp | 256×256 | YES | gentle S / 30° bend | center | rotatable/mirrorable | 64 px | — |
| backgrounds/river-highlight | river-highlight.webp | 256×128 | YES (mostly transparent) | soft white ripples/glints | center | overlay, scattered | 40–64 px | — |
| backgrounds/riverbank-reeds | riverbank-reeds.webp | 192×96 | YES | reeds + grass tuft, 3/4 view | bottom-center | none | 32–48 px | -stones (pebbles) |

### 1.9 ADDED 2026-09-17 after the new visual target (see ENV_ART_GAP_ANALYSIS)
| asset_key | filename | px | transparent | perspective | anchor | tile | rendered | variants |
|---|---|---|---|---|---|---|---|---|
| backgrounds/sky-hills | sky-hills.webp | 1024×260 | NO | distant landscape band, eye-level horizon | top-left, full width | stretch-x to world width, no repeat | 390×99 px (top 12 % of the world) | — |
| backgrounds/flower-pot | flower-pot.webp | 128×128 | YES | 3/4 view | bottom-center | none | 20–28 px | -tall |

Batch 1 total: **35 files to generate** — the authoritative list is
`docs/design/town/mockup/batch1/README.md` (every distinct filename the
recomposition harness actually places, base + variants incl. `sky-hills`,
`flower-pot`, `flower-pot-tall`, `path-end-entrance`, `path-straight-narrow`,
`fence-straight-short`, `hedge-straight-tall`, `shrub-round-small`,
`riverbank-reeds-stones`). Three further spec'd files (`fence-post`,
`fence-gate-closed`, `hedge-corner`) are not placed by the Lv4 composition
but are accepted by `processBatch1.py` (38 total) for later scenes.

**Prompt tightening from the new target (applies to §2):** cobbles are warm
sandy stone with darker mossy joints (not grey); pickets are chunky,
slightly weathered white with visible posts and a rail; hills are a cool
blue-green haze with distant tree clumps; river water is clear blue with
white rapids near rocks; flower borders are dense mixed cottage colours
(pink, lavender, white, yellow). Add to the style lock §0: "vegetation is
dense, layered and slightly oversized, like a storybook cottage garden".

**P21 sky-hills** — "A wide distant landscape band of rolling green English
hills fading to cool blue-green haze at the horizon, small clumps of distant
trees, soft cumulus clouds in a pale blue sky, painted, seen from slightly
above; no buildings, no path, no foreground; fully opaque; wide panoramic
canvas."

**P22 flower-pot / -tall** — "A terracotta garden pot [| tall urn] full of
mixed pink, white and yellow flowers with trailing leaves, 3/4 view, soft
ground shadow, transparent background."

---

## 2. PROMPTS (one subject each; style lock §0 + negative list + self-check appended)

**P1 grass-base** — "Seamless top-down painted grass texture tile, lush green
English meadow grass with subtle lighter and darker tufts, tiny variation,
no flowers, no objects, no visible repeat seam; edges must tile perfectly on
all four sides; fully opaque; square canvas."

**P2 grass-patch-light / -dark / -worn** — "An irregular soft-edged patch of
[sun-lit lighter | shaded darker | worn, thinner, slightly sandy] grass,
top-down, painted, feathered transparent edges all around, no hard outline,
no objects. Only the patch on a transparent background."

**P3 wildflower-scatter** — "A loose scatter of tiny white and yellow meadow
wildflowers in short grass, top-down, painted, soft feathered transparent
edges, no objects."

**P4 path-straight** — "A straight old British village cobblestone lane
running from the bottom edge to the top edge, top-down view, irregular
rounded warm-grey and sandy cobbles with mossy joints, soft grass feathering
along both long edges so it blends into a lawn; the lane fills about 60 % of
the width; transparent outside the lane; must tile seamlessly top-to-bottom."

**P5 path-curve-gentle** — "The same cobblestone lane entering at the bottom
centre and curving smoothly to exit at the top-right corner (about 30°),
top-down, grass-feathered edges, transparent elsewhere; cobble size and
colour identical to the straight tile."

**P6 path-curve-strong** — "The same lane entering at the bottom centre and
curving 90° to exit at the right edge centre; same cobbles; transparent
elsewhere."

**P7 path-fork** — "The same lane entering at the bottom centre and splitting
into two branches exiting at the top-left and top-right corners (Y shape);
same cobbles; transparent elsewhere."

**P8 path-junction** — "The same lane entering at the bottom centre,
continuing to the top centre, with a side lane branching to the right edge
(T shape); same cobbles; transparent elsewhere."

**P9 path-end / -entrance** — "The same cobblestone lane arriving from the
bottom and ending in [a rounded flagstone doorstep | a small paved apron that
widens], top-down, grass feathering, transparent elsewhere."

**P10 fence-straight / -short** — "A low white wooden picket fence, [4 | 2]
pickets with a horizontal rail, seen in 3/4 view slightly from above, a
little worn paint, soft ground shadow beneath; horizontal, evenly spaced so
it repeats end to end; transparent background."

**P11 fence-corner / fence-post** — "[A white picket fence turning a 90°
corner | a single white wooden fence post], 3/4 view slightly from above,
soft ground shadow, transparent background."

**P12 fence-gate / -closed** — "A small white wooden garden gate between two
posts, [half open inward | closed], 3/4 view slightly from above, matching
the picket fence exactly, soft ground shadow, transparent background."

**P13 hedge-straight / -tall / -end / -corner** — "A neatly trimmed dark
green box hedge, [straight horizontal segment | taller straight segment |
rounded end cap | 90° corner], 3/4 view slightly from above, dense leafy
texture, soft ground shadow, ends cut cleanly so segments repeat; transparent
background."

**P14 shrub-round / -small / shrub-wide** — "A [round | small round | low
wide spreading] leafy green garden shrub, 3/4 view, painted, soft ground
shadow, transparent background."

**P15 flower-cluster-pink / -yellow / -mixed** — "A small clump of garden
flowers in leafy greenery, [pink hydrangeas and roses | white daisies and
yellow buttercups | mixed cottage-garden colours], 3/4 view, soft ground
shadow, transparent background."

**P16 flower-bed-border** — "A low strip of cottage-garden border planting
(leaves with small pink, white and yellow flowers) that could run along the
base of a fence, 3/4 view, horizontal, ends cut cleanly so it repeats,
transparent background."

**P17 river-straight** — "A gentle English countryside stream running from
the bottom edge to the top edge, top-down, soft blue-green water with subtle
lighter ripples, irregular natural banks of grass and a few pebbles on both
sides feathering into transparency, water about 55 % of the width; must tile
seamlessly top-to-bottom; transparent outside the banks."

**P18 river-bend** — "The same stream entering at the bottom centre and
bending smoothly about 30° to exit at the top-right, same water and banks,
transparent outside."

**P19 river-highlight** — "Only soft white water glints and small ripples,
painted, on a fully transparent background, no water body, no outline."

**P20 riverbank-reeds / -stones** — "A small tuft of green reeds and grass
[with a few pale pebbles], 3/4 view, soft ground shadow, transparent
background."

---

## 3. COMPOSITION MAP (how Batch 1 lands in the frozen Lv4 geometry)

- Grass base tiles the whole world; light patches near the lane and around
  the cottage rise; dark patches under tree groups and along the left edge;
  worn patches hugging both sides of the lane in the foreground; wildflower
  scatters ×4 in the foreground and home lawn.
- Lane: path-end (doorstep) at the door (22,53) → curve-gentle → gate at
  (33,61) → straight → fork at (50,62) → square/shop/sea branches from the
  §1.4 polyline, tiles scaled 100 % → 60 % → 40 % with depth.
- Fence: straight segments repeated along the rounded garden curve (4–42 ×
  52–64), corners at the bends, gate at (33,61) where the lane crosses,
  flower-bed-border along the inside of the front run; hedge-straight/-end
  outside the left and back runs.
- Clusters: 6–8 around the cottage base and fence, 4 along the lane, 3 near
  the Book Shop, 4 in the foreground; shrubs between.
- River: bend + straight tiles along (93,12)→(88,26)→(86,34)→(91,44)→
  (94,60)→(95,100), highlight overlays ×6, reeds ×5 on the near bank.

## 4. VALIDATION (before recomposition)
1. `node scripts/validateTownAssetCandidate.mjs <asset_key> <file>` for every
   sprite (real alpha, ≥4 % margins; repad where 0–4 %).
2. Tiles (grass-base, path-straight, river-straight): seam test — place two
   copies edge to edge and inspect; any visible seam = REGENERATE.
3. Style check against the P0 seven in one contact sheet (viewing angle,
   light direction, saturation, edge softness, cobble/leaf scale).
4. Only then: recompose into `mockup/paul-town-lv4-recompose-batch1.html`.

## 5. ACCEPTANCE (strict)
Illustrated, not constructed from UI shapes? My House embedded in a garden?
Lane part of the landscape? River natural? Foreground/mid/background depth?
Approaching the reference? If any NO → name the component and regenerate it
before Batch 2.
