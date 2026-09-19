# Paul Town — Remaining Art Production Manifest (2026-09-18)

Authoritative list of every Batch 1 artwork file still outstanding, derived from the
LIVE state of `docs/design/town/manifest/env-art-batch1.spec.json`,
`env-art-manifest.json`, `scripts/town-art/ingest.py` and
`docs/design/town/mockup/paul-town-recompose.html` on 2026-09-18.

- Accepted (staged) assets: **14** — fence-gate, fence-straight, hedge-straight,
  flower-cluster-mixed, grass-patch-light, path-straight, path-straight-narrow,
  path-curve-gentle, path-curve-strong, path-fork, path-junction, path-end,
  path-end-entrance, river-straight.
- Outstanding: **24** = 22 `missing` + `grass-base` (rejected: seam) +
  `wildflower-scatter` (rejected: budget). Every asset is a SEPARATE image file;
  the spec defines no sprite sheets.
- Contracts below are frozen (no spec/budget change). Style lock for all:
  storybook illustration, cozy British village, 3/4 top-down view (~30° from above),
  warm daylight from the upper-left, soft natural shadows, painterly but clean edges,
  **no outline strokes, no noise/grain, no photo/3D look**, matching the accepted
  pieces (ivy cottage, blue book shop, round trees, the accepted lane/fence/hedge tiles).

## 0. Validator rules by kind (apply to every asset of that kind)

| kind | processing | rejects | budget |
|---|---|---|---|
| **sprite** | alpha-bbox crop → contain-fit into the target with 5 % margin, bottom-centre anchored | RGB without alpha; content touching a source edge with alpha > 200 ("clipped"); content bbox aspect > 40 % off target; margin < 4 % after fit; lossless WebP over budget (no lossy fallback); duplicate content hash | 40,960 B |
| **tile** | whole-canvas Lanczos resize to target — **no crop, no stretch** | source aspect > 40 % off target (less is silently stretched → deliver the exact ratio); seam score > 18/255 on `seamAxis` (mean abs RGB of opposite edges); over budget | 81,920 B |
| **patch** | resize (contain-fit, uniform, if aspect > 1 % off) | RGB without alpha; aspect > 40 % off; over budget | 61,440 B |
| **band** | forced RGB, whole-canvas resize | any pixel alpha < 250; aspect > 40 % off; over budget after lossy q92 fallback | 204,800 B |

Deliver PNG. Transparent assets: RGBA, background alpha 0, no painted checkerboard,
halo ≤ 2 px, artwork alpha ≥ 240. Opaque assets: RGB. Recommended source = 4× target.
For sprites keep ≥ 6 % empty transparent margin on all four sides of the source.

## BATCH A — essential terrain / world continuity (7)

| # | key / filename | kind | source → target | ratio | RGB(A) | edges / seam | budget |
|---|---|---|---|---|---|---|---|
| A1 | `grass-base` / grass-base.png | tile | 1024×1024 → 512×512 | 1:1 | RGB opaque | seamless **x and y**, ≤ 18/255 both | 122,880 B (lossy fallback ok) |
| A2 | `sky-hills` / sky-hills.png | band | 2048×520 → 1024×260 | 3.94:1 | RGB opaque | none; bottom 15 % plain meadow green | 204,800 B |
| A3 | `grass-patch-dark` / grass-patch-dark.png | patch | 1600×1120 → 400×280 | 1.43:1 | RGBA | none; fully feathered irregular edge | 61,440 B |
| A4 | `grass-patch-worn` / grass-patch-worn.png | patch | 1600×800 → 400×200 | 2:1 | RGBA | none; feathered | 61,440 B |
| A5 | `wildflower-scatter` / wildflower-scatter.png | patch | 1280×960 → 320×240 | 1.33:1 | RGBA | none | 61,440 B (frozen — the 17.png candidate at 96 KB stays rejected unless the owner extends the budget) |
| A6 | `river-bend` / river-bend.png | tile | 1024×1024 → 256×256 | 1:1 | RGBA | connects **bottom** (water centre x 50 %) and **top** (water centre x ≈ 72 %), ≈ 30° right bend; no seam check | 81,920 B |
| A7 | `river-highlight` / river-highlight.png | patch | 1024×512 → 256×128 | 2:1 | RGBA | none; feathered | 61,440 B |

Details:
- **A1 grass-base**: uniform lush meadow lawn, ≤ 3 tonal steps (≈ #6FAE3E / #7BB648 / #9BCF5A), subtle tufts and clover, no focal features, no flowers/rocks/paths/shadows/vignette. Generate in true tileable mode; 23.png failed only the left↔right wrap (x 23.44, y 16.96). Used as the CSS ground of the whole world at every level (128 px per tile); everything else draws on it.
- **A2 sky-hills**: rolling English hills fading to blue-green haze, small tree clumps, 2–4 soft cumulus in pale blue sky, eye-level distant horizon (the only non-top-down asset). Bottom ~15 % must be plain meadow green matching grass-base (no horizon line/hedgerow/haze touching the bottom edge); nothing crossing the top edge; no buildings/roads/water/sun/text. Placed once at world y 0–12 % full width (390×99 px at 390), behind school/tower. 24.png failed only the ratio (2.54:1); re-export bottom-aligned at 2048×520.
- **A3 grass-patch-dark**: irregular soft-edged patch of shaded/deeper green grass (≈ #4F8F32–#5E9C3A), no flowers/rocks; edge fully feathered to alpha 0 so it melts into grass-base. Overlay under tree groups and the left edge; several placements at 120–200 px.
- **A4 grass-patch-worn**: elongated soft patch of thinner, worn grass with warm earth showing (≈ #A9A06A / #B8A26E), feathered; no stones/flowers. Placed along both sides of the foreground lane. Depends on grass-base + path-straight colours.
- **A5 wildflower-scatter**: a LOOSE scatter of tiny white/yellow meadow flowers with a few grass tufts on a mostly transparent canvas (≥ 60 % transparent — that is how it fits 60 KB); no dense lawn, no rocks. Overlay ×4 on the home lawn / foreground at 80–120 px.
- **A6 river-bend**: same water (bright blue with white ripple lines), rocky banks, reeds as the accepted river-straight; water band 56 % wide at both connecting edges with banks ≤ 22 % each side; banks run flat through top and bottom edges, nothing straddles them; left/right ≥ 3 % clear. Native right bend; mirrored in-engine for left bends. Placed once at the river bend; depends on river-straight (band width/colour must match).
- **A7 river-highlight**: soft white/pale-cyan ripple sparkle overlay, feathered oval, ≥ 70 % transparent; no rocks/banks. Overlaid on the river water at ~46 px, repeated along the run.

## BATCH B — path / fence / landscape connectors (7)

| # | key / filename | kind | source → target | ratio | RGB(A) | edges / seam | budget |
|---|---|---|---|---|---|---|---|
| B1 | `fence-straight-short` / fence-straight-short.png | tile | 512×384 → 128×96 | 4:3 | RGBA | pickets run flat through **left and right** edges; rail heights identical to the accepted fence-straight | 81,920 B |
| B2 | `fence-corner` / fence-corner.png | sprite | 512×512 → 128×128 | 1:1 | RGBA | none (sprite); ≥ 6 % clear all sides | 40,960 B |
| B3 | `hedge-end` / hedge-end.png | sprite | 512×512 → 128×128 | 1:1 | RGBA | hedge body enters from the **left** (cut flat), rounded cap on the right; ≥ 6 % clear top/right/bottom, left may be flat but not touching the source edge (leave 6 % transparent) | 40,960 B |
| B4 | `hedge-straight-tall` / hedge-straight-tall.png | tile | 1024×640 → 256×160 | 1.6:1 | RGBA | seamless **x** (left↔right ≤ 18/255); bottom-centre anchored, foliage may touch bottom edge | 81,920 B |
| B5 | `flower-bed-border` / flower-bed-border.png | tile | 1280×448 → 320×112 | 2.857:1 | RGBA | seamless **x** (left↔right ≤ 18/255) | 81,920 B |
| B6 | `riverbank-reeds` / riverbank-reeds.png | sprite | 768×384 → 192×96 | 2:1 | RGBA | none; ≥ 6 % clear | 40,960 B |
| B7 | `riverbank-reeds-stones` / riverbank-reeds-stones.png | sprite | 768×384 → 192×96 | 2:1 | RGBA | none; ≥ 6 % clear | 40,960 B |

Details:
- **B1**: half-length copy of the accepted white picket fence (same picket width, spacing, rail heights, rose/ivy density — use `docs/design/town/mockup/batch1/fence-straight.webp` as the reference); placed beside each garden-curve corner at 32 px; no posts at the ends (pickets cut flat).
- **B2**: a white corner post (slightly taller cap) with three pickets leaving to each side in a gentle V (~120° between runs) so it reads correctly at any bend; small planting at its foot; no cast shadow outside the sprite. Placed unrotated at the 4 garden-curve bends at 32 px.
- **B3**: rounded end cap of the trimmed hedge (same green/leaf texture and height as the accepted hedge-straight), optional small flowers; placed at the two home hedge ends at 32 px, rotated to the fence tangent.
- **B4**: taller version of the accepted hedge (same texture/colour, ~25 % taller); no flowers on the top face; tileable horizontally. Back run outside the home fence (world y ≤ 51.5).
- **B5**: a continuous strip of mixed cottage flowers (pink/white/yellow, lavender) with a low stone or soil edge, seen 3/4 top-down; tileable left↔right; used inside the front fence run at 80 px, rotated to the fence.
- **B6/B7**: clump of reeds/bulrushes with grass tufts (B7 adds pale pebbles at the base), same greens/rock style as the accepted river banks; bottom-centre anchored; placed along the village-side river bank at 32–48 px, always visible.

## BATCH C — vegetation / environmental dressing (7)

| # | key / filename | kind | source → target | ratio | RGB(A) | budget |
|---|---|---|---|---|---|---|
| C1 | `shrub-round` / shrub-round.png | sprite | 640×512 → 160×128 | 1.25:1 | RGBA | 40,960 B |
| C2 | `shrub-round-small` / shrub-round-small.png | sprite | 512×384 → 128×96 | 1.33:1 | RGBA | 40,960 B |
| C3 | `shrub-wide` / shrub-wide.png | sprite | 896×448 → 224×112 | 2:1 | RGBA | 40,960 B |
| C4 | `flower-cluster-pink` / flower-cluster-pink.png | sprite | 640×448 → 160×112 | 1.43:1 | RGBA | 40,960 B |
| C5 | `flower-cluster-yellow` / flower-cluster-yellow.png | sprite | 640×448 → 160×112 | 1.43:1 | RGBA | 40,960 B |
| C6 | `flower-pot` / flower-pot.png | sprite | 512×512 → 128×128 | 1:1 | RGBA | 40,960 B |
| C7 | `flower-pot-tall` / flower-pot-tall.png | sprite | 512×512 → 128×128 | 1:1 | RGBA | 40,960 B |

All: no connecting edges, ≥ 6 % clear margin all sides, bottom-centre anchored, soft
contact shadow allowed only inside the sprite footprint, no cast shadow beyond it.
- **C1–C3**: rounded leafy shrubs (C3 a wide low one), same leaf style/greens as the accepted hedge and flower-cluster-mixed, optional tiny white blossoms; placement pool 6–8 around the cottage/fence, 4 along the lane, 4 in the foreground; rendered 26–48 px.
- **C4/C5**: clumps like the accepted flower-cluster-mixed but single-colour dominant (pink roses/peonies; yellow daisies/buttercups) with the same grass base and 1–2 small rocks; same placement pool.
- **C6**: terracotta pot with trailing geraniums/petunias; **C7**: tall stone/terracotta planter with lavender or a small bay; C6 ×4 at the café terrace and book-shop front (locked regions, Lv3/Lv5), C7 once near the square (57,60) at ~26 px.

## BATCH D — landmark / building replacements

**None outstanding in the Batch 1 spec.** My House, Book Shop, Café, bridge, school and
clock tower already use accepted catalog art; `british-cottage` remains a DEFERRED owner
decision and is not part of this manifest.

## BATCH E — spec-only variants not placed by the harness (3, optional, lowest priority)

| # | key / filename | kind | source → target | ratio | RGB(A) | budget | note |
|---|---|---|---|---|---|---|---|
| E1 | `fence-post` / fence-post.png | sprite | 256×448 → 64×112 | 1:1.75 | RGBA | 40,960 B | single white post; posts are already baked into fence tiles — never placed today |
| E2 | `fence-gate-closed` / fence-gate-closed.png | sprite | 768×512 → 192×128 | 1.5:1 | RGBA | 40,960 B | closed variant of the accepted gate (same pillars/lanterns); the lane passes through the open gate — never placed today |
| E3 | `hedge-corner` / hedge-corner.png | sprite | 512×512 → 128×128 | 1:1 | RGBA | 40,960 B | 90° hedge corner; the two hedge runs do not meet — never placed today |

Generating these completes the spec but changes nothing on screen until a placement
exists; they can be deferred without affecting any preview.

## Order of generation
A1 → A2 → A3/A4/A5 → A6/A7 → B1–B7 → C1–C7 → (E1–E3). A1 and A2 unlock the biggest
visual change (real ground + horizon); B depends on the accepted fence/hedge/river
references; C is independent dressing.
