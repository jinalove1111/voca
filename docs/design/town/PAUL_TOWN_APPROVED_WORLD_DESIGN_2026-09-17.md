# PAUL TOWN — APPROVED WORLD DESIGN (2026-09-17)

**Status:** DESIGN ONLY — no code, no DB, no economy change. Supersedes the
band-stack *presentation* of V2 (PR #61/#60); keeps the V2 engine, the six
districts and their unlock levels, the `LOTS` model, the 47 placement cells and
the placement record format.

**Approved visual target:** `Downloads/영국교사폴/final village.png` (operator,
2026-09-17). It is a concept/reference image — NOT a background, NOT to be
sliced. It defines layout, perspective, scale, density, asset list and style.

**Style lock:** the seven P0 production assets already deployed (my-house,
book-shop, tree, flower-garden, street-lamp, red-post-box, bench) are the
style key: 3/4 storybook view, warm British village, soft painted edges,
light from upper-left, mid-high saturation, real alpha. Everything below must
match them. No photo textures, no emoji, no protected IP.

---

## 1. WORLD LAYOUT

### 1.1 Dimensions and scroll
- Logical world: **100 × 190 units** (x → right, y → down; both in % of world
  width for x and % of world height for y). Portrait, aspect 1 : 1.9.
- At 360 / 390 / 430 px width the world is 684 / 741 / 817 px tall → on a phone
  most of the village is visible in one screen with a short **vertical scroll**.
  This replaces the current 5.15 : 1 band stack (which forced a 4-screen scroll
  of mostly empty terrain).
- The world height is **constant across levels**. Locked regions are shown as
  distant/hazy landscape in place (see §4), not appended as new bands. This is
  the single biggest structural change from the current V2 (`sceneHeightUnits`
  becomes constant; district offsets become fixed region boxes).
- No card container: the world bleeds edge-to-edge horizontally (negative page
  gutter), no rounded frame, no dotted border, no inset shadow. Top edge fades
  into sky; bottom edge fades into foreground foliage.

### 1.2 Regions (world coordinates, x 0–100 / y 0–190 scaled to 0–100 → given as % of world height)

| Region | Box (x0–x1, y0–y1 in % of world) | Unlock | Notes |
|---|---|---|---|
| Sky & distant hills | 0–100, 0–12 | always | painted backdrop band, non-interactive |
| Clock Tower green | 66–86, 6–26 | Lv8 | tower on a rise, LEFT of the river (on land) — corrected 2026-09-17 after wireframe v2 review |
| English School hill | 28–64, 8–26 | Lv7 | school on terraced hill, steps down to path |
| River | centre-line (93,12) → (88,26) → (86,34) bridge → (91,44) → (94,60) → (95,100); water ≈10 units wide, banks ≈2 | Lv6 (visible from Lv1 as scenery) | hugs the far right edge; gentle S-curve, never a straight strip. Corrected 2026-09-17 |
| Bridge | 76–96, 29–38 | Lv6 | stone arch spanning the river at (86,34), path continues NW to school |
| Café terrace | 56–78, 36–50 | Lv5 | café + umbrella tables facing the square |
| Village square | 40–70, 40–64 | Lv5 | fountain centre, benches, lamps, flower pots |
| Book Shop corner | 68–88, 46–66 | Lv3 | shop faces the square; its right edge stays ≥2 units clear of the river bank. Corrected 2026-09-17 |
| **My House & garden** | 2–46, 24–66 | Lv1 | cottage on a low rise, front garden, picket fence, gate |
| Lawn / connector | 44–58, 56–70 | Lv1 | the fork where house path meets square path |
| Foreground | 0–100, 66–100 | Lv1 | Paul, 4-arm signpost, big flowers/hedges, sea exit |

### 1.3 My House (primary landmark)
- Lot anchor (bottom-center): **(22, 53)**, rendered width **34 % of world width**
  (within the 25–35 % target; at 390 px ≈ 133 px wide, ≈ 166 px tall).
- Sits on a gentle rise; ground contact shadow; garden soil + flower beds on
  both sides; white picket fence around the front garden (x 4–42, y 52–64) with
  a gate at **(33, 61)**; "My House" wooden sign at (14, 60); ivy on the left
  wall (learning hook).
- Front door at the cottage's bottom-centre (22, 53). The path **starts here**.

### 1.4 Main path geometry (cobblestone, tiled, tapering with depth)
Centre-line as a polyline of (x, y) world points; width in % of world width.

```
DOOR      (22,53) w 6   → doorstep flagstones
          (27,58) w 7
GATE      (33,61) w 8   → passes through the fence gate
          (44,65) w 9
FORK A    (50,62) w 9   → three branches:
  ├─ SQUARE  (55,57) ring around fountain r≈8, w 8 → café front (68,47) w 7
  │          → (78,40) w 6 → BRIDGE (84,34) w 6 → (74,26) w 5 → SCHOOL steps (50,26) w 4
  ├─ SHOP    (60,68) w 8 → (72,67) w 7 → BOOK SHOP front (78,63) w 7
  └─ SEA     (47,76) w 9 → (52,84) w 9 → (64,90) w 10 → SEA SIGN (80,92) w 10 → curves to the bank and off-screen right (100,96)
             (the SEA branch must curve — never a straight vertical strip alongside the river)
```
- Widths shrink with y (depth): 10 in the foreground → 4 at the school.
- Rendered from tile assets (straight / curve / fork / end) with soft grass
  edge; never a full-width strip, never a disconnected stub.
- Branches beyond a locked landmark are drawn but hazed (see §4).

### 1.5 Depth / z-index zones
| Zone | y range | object scale | z (objects layer 10 + rank) |
|---|---|---|---|
| Background | 0–28 | 0.55–0.65 | lowest |
| Mid-back | 28–45 | 0.70–0.82 | |
| Mid | 45–66 | 0.85–1.00 | My House, square, shop |
| Foreground | 66–100 | 1.00–1.20 | Paul, signpost, big flowers |

Layer order (existing `Z_LAYERS` kept, two inserted): ground 0 → water 1 →
path 2 → patches/garden 3 → objects 10 + y-rank → fog masks 40 (per region) →
overlay 90 → popover 100. Overlap is by y (baseline lower = in front), which
`zIndexFor` already provides.

### 1.6 Mobile viewport behaviour
- Initial scroll: My House region centred (y ≈ 45 % of world) so the first
  frame is cottage + garden + the fork toward the square.
- HUD (level/$/nav) stays sticky above the world; world scrolls beneath.
- 200 % zoom: world width stays 100 % of viewport; no horizontal scroll (same
  guarantee as today's S6 scenario).
- Tap targets ≥ 44 px on all interactive decorations (existing rule).

### 1.7 Paul (existing official asset only)
- Position: foreground bottom-left, anchor (10, 92), scale 1.2, drawn from the
  existing `src/assets/paul/paul_hello.png` (waving) with the existing speech
  bubble component ("Welcome to Paul Town! 오늘도 멋진 하루예요!").
- Reaction states reuse `paulReactions.js` (levelup → `paul_levelup.png`,
  purchase → `paul_great.png`). No new Paul face is generated.

### 1.8 Future entrances (architecture only — not implemented)
- **EXPLORE (탐험하기):** in-world wooden sign "To the Sea →" at (86, 92) where
  the SEA branch leaves the screen; plus the bottom-nav slot already shown in
  the reference. Sign renders from Lv1 as scenery; tapping does nothing until
  Explore exists.
- **FRIENDS' TOWNS (친구 마을):** HUD button + bottom-nav slot (reference top-right
  and bottom-right). Not a world location. Render as disabled/coming-soon until
  the read-only visitor mode exists (`PAUL_TOWN_WORLD_BLUEPRINT_V1` §6:
  `mode: 'owner' | 'visitor'`, visitor = no place/move/store/purchase, no owner
  currency, no destructive interaction).

---

## 2. FIXED LANDMARKS (not draggable; positions owned by the world)

| id (existing LOTS) | anchor (x,y) | width % | unlock | ownership |
|---|---|---|---|---|
| my-house | (22, 53) | 34 | Lv1 | always built (free) |
| book-shop | (78, 63) | 20 | Lv3 | purchased → built (unchanged) — moved off the river 2026-09-17. Accepted deviation (contract test, 2026-09-17): right edge x=88 sits 0.9 u into the 2 u bank strip and 1.1 u clear of the water — a riverside shop; anchor stays frozen |
| cafe | (67, 47) | 20 | Lv5 | purchased → built |
| stone-fountain | (55, 55) | 12 | Lv5 | purchased → built |
| bridge | (86, 34) | 20 | Lv6 | purchased → built |
| english-school | (46, 24) | 30 | Lv7 | purchased → built |
| clock-tower | (76, 21) | 12 | Lv8 | purchased → built — moved onto land 2026-09-17 |

Fence rule (added 2026-09-17): the front-garden picket fence follows a rounded,
slightly irregular closed curve hugging the garden (corner radius ≥ 6 units,
front edge bowed outward) with a low hedge planted outside its left and back
sides — never a rectangle. The gate is the only opening and the lane passes
through it.

Also fixed (scenery, no ownership): picket fence + gate, hedges/stone walls,
river + banks, main path network, village-square paving, "My House" sign,
4-arm signpost ("Learn / Grow / Be Kind / Go Further", (34, 84)), sea sign.
Locked landmarks show as hazy silhouettes in place (§4).

## 3. CUSTOMIZABLE OBJECTS (existing catalog, unchanged prices/levels)

tree (Lv1), bench (Lv1), town-sign (Lv1), shop-lamp (Lv1), cat (Lv2),
street-lamp (Lv2), red-post-box (Lv2), flower-garden (Lv3), puppy (Lv4),
owl (Lv4), british-cottage (Lv1 — see open decision), plus future seasonal
objects / trophies / souvenirs via the same catalog path. Placed via the
existing inventory → place / move / store flow; records stay `(x, y)` cells.

## 4. LEVEL PROGRESSION (uses existing star thresholds)

| Lv (stars) | Newly revealed | How locked areas look before |
|---|---|---|
| 1 (0) | My House, garden, fence, path to fork, lawn, foreground, sea sign, river as scenery | — |
| 3 (50) | Book Shop corner opens (lot for-sale → built on purchase) | shop silhouette in haze, small wooden sign "Lv.3" on the path |
| 5 (200) | Village square + Café terrace | square hazed, fountain silhouette |
| 6 (350) | Bridge | bridge silhouette over the river, gate post with "Lv.6" sign |
| 7 (550) | English School hill | school silhouette on the hill, hazy steps |
| 8 (800) | Clock Tower green | tower silhouette in the far haze |
| 9–10 | reserved headroom (no content) | — |

Locked treatment = in-world: soft radial haze mask over the region (CSS,
procedural), greyscale-blurred landmark art, a small wooden sign at the path
entry ("Lv.N에서 열려요"). No UI card, no top fog band. Fog copy reuses the
existing `fogState()` strings.

Non-economic "world comes alive" hooks (existing `gardenRichness` data, no new
fields): flower beds bloom (stage 0→4 sprites), ivy grows on the cottage wall,
windows light at dusk/after a completed session, birds on the fence, richer
lawn patches. Same `richness` prop as today.

## 5. PLACEMENT ZONES (47 cells, invisible in idle)

The 47 existing cell ids keep their `(x,y)` identity; only their world anchor
moves. Distribution (anchor lists live in `SPOT_MAP` when implemented):

| Zone | cells | scale | notes |
|---|---|---|---|
| Front garden (inside fence) | 10 | 0.95–1.05 | flowers, post box, bench, pets |
| House lawn / rise (outside fence) | 8 | 0.9–1.0 | trees, lamp |
| Lawn connector | 5 | 0.95 | |
| Village square ring | 8 | 0.85–0.9 | benches, lamps, pots (Lv5 region; usable from Lv1 as lawn) |
| Café terrace edge | 3 | 0.85 | |
| Book Shop front | 4 | 0.85 | |
| Riverbank | 3 | 0.8 | |
| School lawn | 3 | 0.65 | reveals with Lv7 |
| Tower green | 2 | 0.6 | reveals with Lv8 |
| Foreground verge | 1 | 1.15 | big showpiece item |

Idle mode: **no marker of any kind** — items look planted. Edit mode only: a
soft warm ground-glow ellipse under each free anchor (no circle ring, no tile).
After placement the glow disappears. `freeAnchors()`/`anchorFor()` unchanged
in signature.

## 6. FUTURE EXPLORE — entrance only
Sea sign at (86, 92) + bottom-nav slot. Later: a separate scene reached from
this exit; no Town mutation. Not built now.

## 7. FUTURE FRIEND TOWNS — entrance only
HUD/bottom-nav slot. Later: `TownScene mode='visitor'` renders another
student's placements read-only via a SELECT-only RPC scoped to the same class
(blueprint §6). Rules: cannot move/delete/buy/spend/modify; visit → admire →
return. Not built now.

---

## 8. ASSET PLAN (production, individual transparent assets, one style)

Naming follows existing folders; environment pieces go under `backgrounds/`
(non-catalog, exempt from the catalog-orphan audit). All 2x canvases; 1x =
half. "Persp." = 3/4 storybook, light upper-left. Anchor = bottom-center
unless noted. Footprint = rendered width at 390 px.

### 8.1 Keep as-is (already P0-final, style key)
| asset_key | file | 2x | alpha | footprint | variants | level |
|---|---|---|---|---|---|---|
| buildings/my-house | my-house.webp | 256×320 | YES | 133 px | -lights (P1) | Lv1 |
| buildings/book-shop | book-shop.webp | 256×320 | YES | 86 px | -lights (P1) | Lv3 |
| nature/tree | tree.webp | 192×256 | YES | 46–56 px | -round, -tall (P1) | Lv1 |
| nature/flower-garden | flower-garden.webp | 192×128 | YES | 64 px | bloom stages reuse garden-stage-0..4 | Lv3 |
| decorations/street-lamp | street-lamp.webp | 144×288 | YES | 22 px | -on (P1) | Lv2 |
| decorations/red-post-box | red-post-box.webp | 144×216 | YES | 22 px | — | Lv2 |
| decorations/bench | bench.webp | 144×96 | YES | 47 px | — | Lv1 |

### 8.2 Regenerate in the style key (existing keys, older art must be replaced)
| asset_key | file | 2x | alpha | footprint | variants | level |
|---|---|---|---|---|---|---|
| buildings/cafe | cafe.webp | 256×320 | YES | 78 px | -lights | Lv5 |
| decorations/stone-fountain | stone-fountain.webp | 192×192 | YES | 47 px | water sparkle overlay (CSS) | Lv5 |
| special/bridge | bridge.webp | 320×160 | YES | 86 px | — | Lv6 |
| special/english-school | english-school.webp | 320×256 | YES | 117 px | -lights | Lv7 |
| special/clock-tower | clock-tower.webp | 192×512 | YES | 47 px | -lights | Lv8 |
| animals/cat, puppy, owl | *.webp | 144×108 / 144×108 / 144×192 | YES | 28 px | idle pose only | Lv2/4/4 |
| decorations/town-sign | town-sign.webp | 144×216 | YES | 28 px | blank board | Lv1 |
| decorations/shop-lamp | shop-lamp.webp | 144×288 | YES | 22 px | — | Lv1 |
| nature/garden-stage-0..4 | garden-stage-N.webp | 128×128 | YES | 40 px | 5 stages (learning hook) | Lv1 |

### 8.3 New environment set (`backgrounds/`, non-catalog) — this is what makes it a village
| asset_key | file | 2x | alpha | persp./anchor | footprint | notes |
|---|---|---|---|---|---|---|
| backgrounds/sky-hills | sky-hills.webp | 1024×260 | NO | flat band, top | 100 % w | painted sky + distant hills, top 12 % |
| backgrounds/grass-base | grass-base.webp | 512×512 | NO | tile, fill | seamless | soft painted grass, not photo |
| backgrounds/grass-patch-1..3 | grass-patch-N.webp | 400×280 | YES (soft) | overlay | 30–50 % w | tonal variation, 3 variants |
| backgrounds/garden-soil | garden-soil.webp | 400×200 | YES | overlay | 25–40 % w | under flower beds / around cottage |
| backgrounds/path-straight | path-straight.webp | 256×256 | YES | tile | path w | cobblestone, soft grass edge |
| backgrounds/path-curve | path-curve.webp | 256×256 | YES | tile, rotatable | path w | 90° curve |
| backgrounds/path-fork | path-fork.webp | 256×256 | YES | tile | path w | T/Y fork |
| backgrounds/path-end | path-end.webp | 256×128 | YES | tile | path w | doorstep / sign stop |
| backgrounds/square-paving | square-paving.webp | 512×384 | YES | overlay | 30 % w | round paved square under fountain |
| backgrounds/river-straight | river-straight.webp | 256×256 | YES | tile | 12 % w | water + banks |
| backgrounds/river-bend | river-bend.webp | 256×256 | YES | tile, rotatable | 12 % w | |
| backgrounds/river-sparkle | river-sparkle.webp | 256×256 | YES | overlay | — | optional; CSS shimmer acceptable |
| backgrounds/fence-straight | fence-straight.webp | 256×96 | YES | horizontal strip | — | white picket |
| backgrounds/fence-gate | fence-gate.webp | 192×128 | YES | bottom-center | 8 % w | the front gate |
| backgrounds/fence-corner | fence-corner.webp | 128×128 | YES | | | |
| backgrounds/hedge-straight | hedge-straight.webp | 256×128 | YES | strip | — | trimmed hedge |
| backgrounds/hedge-end | hedge-end.webp | 128×128 | YES | | | |
| backgrounds/stone-wall | stone-wall.webp | 256×112 | YES | strip | — | low dry-stone wall (riverbank/school) |
| backgrounds/shrub-1..2 | shrub-N.webp | 160×128 | YES | bottom-center | 20–30 px | filler greenery |
| backgrounds/flower-cluster-1..3 | flower-cluster-N.webp | 160×112 | YES | bottom-center | 20–35 px | scenery flowers (not purchasable) |
| backgrounds/tree-back-1..2 | tree-back-N.webp | 192×256 | YES | bottom-center | 30–40 px | background trees, lower contrast |
| backgrounds/sign-my-house | sign-my-house.webp | 192×128 | YES | bottom-center | 32 px | board blank; text via CSS label |
| backgrounds/signpost-4arm | signpost-4arm.webp | 192×320 | YES | bottom-center | 44 px | arms blank; labels via CSS |
| backgrounds/sign-sea | sign-sea.webp | 224×160 | YES | bottom-center | 48 px | Explore entrance; text via CSS |
| backgrounds/sign-locked | sign-locked.webp | 128×160 | YES | bottom-center | 26 px | small wooden "Lv.N" sign (text via CSS) |
| backgrounds/cafe-terrace | cafe-terrace.webp | 320×192 | YES | bottom-center | 70 px | umbrella + 2 tables, in front of café |
| backgrounds/school-steps | school-steps.webp | 320×160 | YES | bottom-center | 60 px | terraced steps below the school |

Text is never baked into signs (CSS labels over blank boards) so Korean/English
copy stays editable and the IP rule holds. Fog/haze, glow, water shimmer and
ground shadows are procedural CSS, not assets.

Total new/regenerated: ~38 files; keep 7. Production order: **8.3 terrain +
path + fence + signs first** (they define whether it reads as a village), then
8.2 buildings, then variants.

---

## 9. EXISTING V2 ENGINE REUSED (unchanged)
`TownScreenV2.jsx` state + the five mutation entry points (place/move/store,
purchase, claimWelcome); `townShop`/`townCatalog.js`/`townLevel.js` (prices,
levels, stars); `studentData` persistence and the `(x,y)` placement record;
`LOTS`/`lotState`; `SPOT_MAP` cell identity + `anchorFor`/`freeAnchors`;
`TOWN_ASSETS`/`townAsset`/`spriteFor`/`TownSprite` resolver; `gardenRichness`
hooks; `fogState()` copy; `paulTownV2` flag gate in `App.jsx`; lazy chunking;
V1 untouched; official Paul assets.

## 10. WHAT MUST CHANGE FROM CURRENT V2 (presentation only)
1. Band stack → one continuous world canvas (100×190) with overlapping regions
   and a diagonal river; `sceneHeightUnits` constant; district offsets → region
   boxes.
2. Remove the card: no rounded frame, no dotted hedge border, edge bleed.
3. Ground: painted terrain from tiles/patches/soil; hard district seams gone.
4. Path: starts at the front door, through the gate, tiled cobblestone with
   curves/forks, tapering; the doorstep stub and the beside-the-house route go.
5. Fog: per-region in-world haze + wooden sign; the top fog band goes.
6. Garden oval → in-terrain garden bed (soil + stage sprite), no outline.
7. `SPOT_MAP` anchors re-mapped to §5 zones with depth scale; edit-mode markers
   become soft ground glows.
8. `LOTS` anchors/widths → §2 table.
9. HUD/bottom-nav: reserved slots for 탐험하기 / 친구 마을 (disabled).
10. Paul guide placed in the foreground with the existing asset.

## 11. GATES
- **DB CHANGE REQUIRED:** NO
- **ECONOMY CHANGE REQUIRED:** NO (same items, prices, levels, ownership; one
  open decision: `british-cottage` catalog item's role in a world with a fixed
  My House — recommend converting it to a decoration-scale "garden cottage
  ornament" or retiring it; owner decision)
- **SAFE TO BEGIN ARTWORK PRODUCTION:** YES — start with §8.3 terrain/path/
  fence/sign set, validated per `PAUL_TOWN_ASSET_CONTRACT.md` with
  `scripts/validateTownAssetCandidate.mjs` (real alpha, ≥4 % margins).

Implementation waits for an owner-approved mockup built from this spec.
