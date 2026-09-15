# Paul Town — P0 아트워크 생성 핸드오프 (ART GENERATION HANDOFF, P0 ONLY)
## 2026-09-16 — 한글 요약 헤더

이 문서는 이미지 생성 워크플로우에 그대로 붙여넣기 위한 **영문 프롬프트
패키지**다. 대상은 `FINAL_ARTWORK_SPEC_2026-09-16.md` 2.1~2.2절의 P0-A
9개 + P0-B 7개, 총 16개 파일(12개 프롬프트 블록 — `garden-stage-0..4`는
5단계를 한 블록에 함께 서술)이다. 순서: (0) 스타일-키 마스터 오버뷰
이미지 1장(비납품, 참조 전용) → (1) P0-A 9개 → (2) P0-B 7개. 모든
프롬프트 앞에 "GLOBAL MATCHED-SET BLOCK"을 그대로 붙여 넣어야 세트 전체
일관성이 유지된다. 이미지 생성/코드/DB 변경 없음 — 이 문서는 순수
프롬프트 스펙이다. 근거는 `WORLD_DESIGN_BRIEF.md`와
`FINAL_ARTWORK_SPEC_2026-09-16.md`이며, 두 문서와 다르면 그쪽이 우선한다.

> **2026-09-16 lead override**: 아래 GLOBAL MATCHED-SET BLOCK의 STYLE/
> TEXTURE 지시문은 최초 작성 시 참고 이미지(`마을그림.png`)를 컴포지션
> 전용으로 한정하고 디테일 레벨은 단순한 카툰풍으로 낮춰 잡았었다.
> 운영자(lead)가 이를 명시적으로 뒤집어, 참고 이미지를 **1차 비주얼
> 레퍼런스**로 삼아 "프리미엄", "촘촘하지만 읽히는(dense but readable)",
> "레이어드/깊이감 있는", "하나로 통일된 일러스트 스타일"을 요구했다.
> 아래 STYLE/TEXTURE 블록과 Step 0 프롬프트는 그 지시에 맞춰 재작성됐다
> — "no hard outlines"/"not photorealistic"/"child-friendly"는 그대로
> 유지하되, 디테일 레벨은 참고 이미지 수준으로 올렸다. `animals/cat`·
> `animals/puppy`·`animals/owl`도 더 이상 스타일 앵커가 아니므로(현재
> 카툰 스타일보다 더 풍부한 디테일이 목표), 어떤 프롬프트에서도 그
> 세 자산을 참조하지 않는다.

---

## GLOBAL MATCHED-SET BLOCK (prepend to every single prompt below)

```
STYLE: Rich, premium painterly British storybook village illustration —
match the density, warmth, and finish level of a detailed painted
storybook-village illustration: textured warm stone walls, clustered
lush foliage (ivy, flower boxes, layered greenery), softly glowing warm
windows, richly painted soft shading and depth. This is the PRIMARY
visual reference register — dense but readable, layered, one consistent
illustration style across the whole set, premium quality, warm and cozy
and educational tone, never dark or scary, child-friendly. Still: no
hard black outlines, and still not photorealistic (this is a painted
illustration, not a photo) — but do NOT simplify into a flat, minimal,
or generic cute-cartoon register. Keep brushwork soft-painterly with
rounded forms, but render real material texture and layered detail
within that painterly technique.

CAMERA: Fixed 3/4 top-down angle, elevation approximately 30 degrees
(a little more top-down than typical storybook art, so the building
roof-top and front are both visible at once, and so stacked scene bands
placed above each other do not occlude one another). Same exact camera
angle across every single asset in this set — no exceptions.

LIGHTING: Single fixed light source from the upper-left, warm
late-afternoon golden light. Soft, evenly diffused — not harsh
directional sunlight. Same light direction on every asset in this set.

SHADOWS: No baked directional cast shadows (shadows must not stretch
sideways). Only a very faint soft contact shadow directly under the
object's base is allowed, opacity 15% or less, slightly offset toward
the bottom-right, heavily blurred. Do not paint a strong ground shadow —
it will be layered separately at runtime.

PALETTE (use only these colors, mix as needed): warm cream (#fdebd0,
#f6e3c8), soft moss (#cfe3c0), sage green (#8fb37a), warm stone (#d9d2c5,
#b9ab95), muted navy (#1e2a5a), burgundy (#7a2e3a), warm amber (#e0a73a),
soft gold (#c9a227), wood brown (#8b6f3e). Exception: the red post box
keeps traditional British pillar-box red instead of burgundy.

TEXTURE: Rich painterly digital illustration with real material texture
— visible stone/brick grain, layered clustered foliage rendered as
readable leaf-clumps (not a flat green blob), soft directional shading
that suggests form and depth, warm glowing window light. Detail density
should match the primary reference image's richness, not a simplified
flat-cartoon look — but keep every individual detail large enough to
stay legible at small on-screen sizes: avoid painting micro-detail
(single leaves, single brick lines, fine hatching) any smaller than
roughly 2px at the asset's final 1x display size (see each block's
render size); put the fine detail in the 2x master canvas and confirm
it still reads cleanly when downscaled to 1x. Consistent across every
asset in the matched set.

FORBIDDEN (apply to every asset, no exceptions): no photographic or
photo-collage elements, no stock photography, no emoji, no hard black
outlines, no text, no letters, no numbers, no logos, no watermark, no
crests, no coats of arms, no Harry Potter or Hogwarts elements, no
wizard hats, no lightning bolt scars, no recognizable real-world or
copyrighted franchise architecture or props, no human faces, no
realistic human figures, no photorealism, no drop shadow, no vignette,
no glow around the edges of the object, no busy background, no clutter,
no additional unrelated objects in frame, no scary or dark horror
elements, no multiple unrelated objects combined into one image, no
collage, no representation of "Paul" or any mascot character.

IP SAFETY: This is an original British-storybook-village-themed
illustration set for a children's English-learning app. Do not reference
or imitate any existing franchise, film, game, or copyrighted fictional
setting. Shop signage, where present, is pictorial only (a simple icon
shape) — never lettering or wordmarks.

TRANSPARENCY (sprites/overlays only — plates are the exception, see each
block): Export on a fully transparent background, premultiplied alpha,
single isolated object only (no ground patch, no scene elements, no
extra props unless explicitly listed), at least 4% transparent margin
on every side of the canvas so the silhouette is never cropped.

CANVAS: see canvas size specified in each block below (this is the
MASTER 2x-equivalent resolution to render at).
```

---

## STEP 0 — Style-Key Master Overview (NOT SHIPPED — reference only)

Generate this ONE image first. Do not treat it as a deliverable asset —
it exists purely so every subsequent P0 prompt can be generated "with
this same image as a style/consistency reference" if the generation tool
supports image-conditioned prompting. If the tool does not support
reference-image conditioning, use this image as a manual visual
checklist while reviewing each subsequent asset (1.6절, `FINAL_ARTWORK_
SPEC_2026-09-16.md`).

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 1080×1920 (vertical, portrait)

SUBJECT: An ORIGINAL cozy British storybook village, seen from the
locked camera angle, showing all six districts stacked bottom-to-top in
a single continuous vertical scene, exactly in this order from the
bottom of the frame to the top:
1. (bottom, largest/nearest) A small home cottage with a front garden,
   hedge boundary on left/right/bottom, a stone path from a front gate
   curving from bottom-center up toward the right side of the frame.
2. A narrow lane with a bookshop building on the left-mid side and a
   small reading garden on the right, the path entering from the
   bottom-right (matching where district 1's path exited) and exiting
   toward the top-left of this band.
3. An open village square with a café building on the right side and a
   round stone fountain in the center, flower beds ringing the square,
   the path entering bottom-left (matching district 2's exit) and
   circling the fountain before exiting top-center.
4. A stream crossed by a small stone bridge at the center, the path
   entering bottom-center and crossing the bridge before continuing
   straight up.
5. An English village school building set center-left with a small
   courtyard and school garden, the path entering bottom-center and
   exiting toward the top-right.
6. (top, smallest/farthest, only band that shows sky) A tall stone clock
   tower in a small square, with soft distant green hills and rooftops
   and a pale warm sky with soft clouds behind it, the path entering
   from the bottom-right and ending at the tower's square.

Each district band is noticeably smaller in scale than the one below it
(the cottage in band 1 should look large and dominant; the clock tower
area in band 6 should look distant and small), creating a strong sense
of depth as the eye travels up the image. The path is a single
continuous winding cobblestone ribbon connecting all six bands with no
gaps. Buildings, hedges, trees, and flower beds may all be present in
this reference image (unlike the individual sprite/plate assets that
follow, which must isolate elements) — this single image is only a
consistency reference showing how the whole world should feel together.

DENSITY AND FINISH (explicit, 2026-09-16 lead override): match the
density, richness, and finish level of the primary reference village
illustration this project is modeled on — warm textured stone building
facades, clustered layered foliage and flower boxes on windowsills,
softly glowing warm window light throughout, a village that feels lived
in, populated, and premium rather than sparse or minimal. This must be
an ENTIRELY ORIGINAL composition and set of buildings/props (do not
reproduce, crop, or closely copy any specific existing artwork) — only
the level of detail, richness, and painterly finish should match that
reference standard, layered and readable rather than simplified into a
flat cute-cartoon look.

This image will NOT be shipped in the app. It exists only to keep every
following individual asset visually consistent with one another.
```

---

## P0-A ASSETS (9 files, generate in this order)

### 1. `env/plate-home.webp` (opaque plate)

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 1080×1242 (aspect ratio 1:1.15)

TYPE: Opaque, full-bleed background plate — this is NOT a sprite, do not
apply the transparency instruction from the global block. Fill the
entire canvas edge-to-edge with painted scene content, no transparent
areas at all.

SUBJECT: The "My Home" district — bottom-most, nearest slice of the
continuous village scene from Step 0's band 1. Paint ONLY the
environment: soft mossy lawn ground, a low hedge or stone boundary along
the left, right, and bottom edges of the frame, a winding cobblestone
path that enters the bottom edge of the frame at horizontal center (50%
of width) directly in front of a small garden gate, curves gently, and
exits the top edge of the frame at 78% of the width (upper-right area).
Include exactly one empty rectangular building-lot foundation (a simple
raised stone/dirt footprint outline, no building on it) positioned
roughly centered in the lower-middle portion of the band, sized to later
hold a small cottage sprite. Include two small circular or oval patches
of bare bedded soil (flower-bed foundations, no flowers painted in them
yet) near the path, sized to later hold a garden-growth overlay. Do NOT
paint any building, any tree, any bench, any lamp, any post box, any
sign, or any animal — those are separate sprite layers added later. The
ground may have gentle color variation and soft texture but no
directional cast shadows other than very soft, faint contact darkening
right at the lot foundation and flower-bed edges.

LIGHT: warm late-afternoon light from upper-left, consistent with the
global block.

TRANSPARENCY: NONE — this plate is fully opaque, full-bleed painted
scene content on all four edges.

FILE NAME: env/plate-home.webp
```

### 2. `env/plate-fog-horizon.webp` (opaque plate, reusable)

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 1080×346 (aspect ratio 1:0.32)

TYPE: Opaque, full-bleed background plate.

SUBJECT: A generic misty horizon band representing "locked, not yet
unlocked" territory beyond the current district. Paint a continuation of
a cobblestone path fading gently upward into soft white-cream mist, with
a very soft, low-contrast, desaturated silhouette suggestion of a
generic distant lane and a few indistinct hedge/tree shapes barely
visible through the haze — nothing identifiable as any specific building
(this plate is reused above ANY locked district regardless of which one
it actually is, so it must not depict a specific building silhouette).
The bottom edge of this plate must read as "misty lawn with the path
continuing" so it can be placed directly above any other plate's top
edge and feel continuous. The top edge fades to a soft uniform warm-cream
mist with no hard edge.

LIGHT: same warm upper-left light, but heavily diffused by the mist so
contrast is very low.

TRANSPARENCY: NONE — opaque plate, but the bottom portion should read as
increasingly hazy/misty toward the top (this is achieved with paint, not
alpha).

FILE NAME: env/plate-fog-horizon.webp
```

### 3. `buildings/my-house.webp`

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 768×640 (aspect ratio 6:5)

SUBJECT: A single cozy British storybook cottage — the player's home.
Must show: a front door, two or three small warm-lit windows, a chimney,
a small peaked or thatched roof, and a tiny doorstep/threshold area
immediately in front of the door. This sprite is ONLY the cottage
building and its immediate doorstep — do NOT paint the surrounding
garden, hedge, or path; those live in the plate (see asset 1) so garden
overlays and decorations can be placed around this sprite independently.
Scale reference: within its own canvas, the cottage silhouette should
fill roughly 85-95% of the canvas height so that, when this canvas is
placed next to the tree canvas (asset 4) at the same display scale, the
cottage reads as roughly 2.4x taller than the tree. This is the single
most important "world-defining" sprite in the set — every other building
and prop's apparent scale is judged against this one.

PERSPECTIVE: same 3/4 top-down ~30 degree camera as global block, single
centered building.

TRANSPARENCY: fully transparent background, isolated single object, no
ground patch, no garden, no path segment included in this file.

FILE NAME: buildings/my-house.webp
```

### 4. `nature/tree.webp`

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 384×512 (aspect ratio 3:4)

SUBJECT: A single storybook deciduous tree with a rounded leafy canopy
and a visible trunk, standing alone. Within its own canvas, the tree
silhouette should fill roughly 70-80% of the canvas height (deliberately
large within its own frame, per the scale-reference rule above) so that
when compared side-by-side with the cottage (asset 3) at matching
display scale, the tree reads clearly smaller than the cottage
(cottage ≈2.4x taller).

PERSPECTIVE: same global camera, single isolated tree, no other objects,
no ground patch, no shadow other than the faint contact shadow rule.

TRANSPARENCY: fully transparent background, isolated single object.

FILE NAME: nature/tree.webp
```

### 5. `nature/flower-garden.webp`

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 384×192 (aspect ratio 2:1)

SUBJECT: A single low, wide flower garden bed — a cluster of small
storybook flowers (soft gold and warm accent tones within the palette)
growing from a low mound of soil, wider than it is tall, sitting flat
against the ground. This is a purchasable/placeable decoration (distinct
from the fixed baked flower-bed soil patches in the home plate — this
one is a standalone object a player can place anywhere).

PERSPECTIVE: same global camera, single isolated object, no surrounding
lawn or path visible, just the bed and its flowers.

TRANSPARENCY: fully transparent background, isolated single object.

FILE NAME: nature/flower-garden.webp
```

### 6. `decorations/bench.webp`

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 320×224 (aspect ratio 10:7)

SUBJECT: A single small wooden park bench, warm wood-brown tones
(#8b6f3e) with a subtle muted-navy accent if desired, simple slatted
seat and backrest, standing alone with nothing on or beside it — no
lamp, no sign, no books, no flowers, no pot, no bird, no other prop
combined into the frame. Absolutely nothing else in the image besides
the bench itself.

PERSPECTIVE: same global camera, single isolated object.

TRANSPARENCY: fully transparent background, isolated single object, NO
background glow, NO vignette, NO soft radial brightness gradient of any
kind anywhere in the canvas outside the bench's own shading — the
background must be perfectly flat transparency with zero baked light
falloff. (This exact defect — a faint radial glow across the whole
canvas — has repeatedly caused this specific asset to be rejected in
past batches; be strict about a completely flat, glow-free transparent
field around the object.)

FILE NAME: decorations/bench.webp
```

### 7. `decorations/street-lamp.webp`

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 160×576 (aspect ratio 5:18, very tall and slim)

SUBJECT: A single tall, slim, free-standing street lamp post (NOT
wall-mounted — a standalone post rising from a small base), wood-brown
or muted-navy post with a soft gold trim lamp head at the top. The glass
of the lamp head should read as neutral/unlit (no warm amber glow baked
in — the lit version is a separate overlay asset, not part of this
batch). This should be the slimmest, tallest-proportioned prop in the
whole decoration set.

PERSPECTIVE: same global camera, single isolated object, no wall
bracket, no sign, no flower pot attached.

TRANSPARENCY: fully transparent background, isolated single object.

FILE NAME: decorations/street-lamp.webp
```

### 8. `decorations/red-post-box.webp`

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 160×352 (aspect ratio 5:11, roughly 2:3)

SUBJECT: A single traditional British red pillar post box, cylindrical
body with a domed top and a small posting slot, standing alone on a tiny
base. PALETTE EXCEPTION: use traditional pillar-box red for the body
instead of burgundy (#7a2e3a) — this is the one approved deviation from
the shared palette; soft gold (#c9a227) trim accents are fine.

PERSPECTIVE: same global camera, single isolated object.

TRANSPARENCY: fully transparent background, isolated single object.

FILE NAME: decorations/red-post-box.webp
```

### 9. `ui/lot-sign.webp`

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 160×192 (aspect ratio 5:6)

SUBJECT: A single small wooden "for sale" signpost — a simple carved
wood post with a small blank rectangular sign board on top, propped into
the ground, standing alone. The sign board surface must be completely
blank/empty — no text, no letters, no numbers, no icon, no price, just
plain wood grain. This sign is shown standing on an empty, unowned
building lot in the game UI (the price itself is shown elsewhere in the
shop UI, not painted onto the sign).

PERSPECTIVE: same global camera, single isolated object.

TRANSPARENCY: fully transparent background, isolated single object.

FILE NAME: ui/lot-sign.webp
```

---

## P0-B ASSETS (7 files, generate after P0-A is approved)

### 10. `nature/garden-stage-0.webp` through `garden-stage-4.webp` (one block, 5 stage variants)

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 448×224 each (aspect ratio 2:1), all five stages use the exact
same canvas size, camera angle, and circular/oval bed shape and anchor
point so they can swap in place of one another as a smooth growth
progression.

SUBJECT: A small round flower-bed growth-stage overlay, matched to sit
on top of the baked flower-bed soil patch already painted into
env/plate-home.webp (asset 1). Generate five separate images, one per
stage, all sharing the identical bed outline/shape/camera/anchor so only
the plant content changes:

- Stage 0 (seed): bare soil with a single tiny seed or the faintest hint
  of a sprout just breaking the surface. Mostly soil, minimal green.
- Stage 1 (sprout): a few small green sprouts poking up, still mostly
  soil visible.
- Stage 2 (flower): a handful of small blooming flowers, soil mostly
  covered by greenery now.
- Stage 3 (bloom): a fuller flower bed in bloom, dense flowers and
  leaves, soil barely visible.
- Stage 4 (full bloom): a lush, fully bloomed flower bed with abundant
  flowers, plus a small bird perched at the edge for extra life.

PERSPECTIVE: same global camera, viewed as a small round bed set into
the ground (not a standalone potted object — it should look like it
belongs embedded in soil).

TRANSPARENCY: fully transparent background outside the bed shape itself,
isolated overlay content only, no surrounding lawn painted beyond the
bed's own edge.

FILE NAMES: nature/garden-stage-0.webp, nature/garden-stage-1.webp,
nature/garden-stage-2.webp, nature/garden-stage-3.webp,
nature/garden-stage-4.webp
```

### 11. `env/plate-bookshop-lane.webp` (opaque plate)

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 1080×918 (aspect ratio 1:0.85)

TYPE: Opaque, full-bleed background plate — no transparency, fill the
entire canvas.

SUBJECT: The "Book Shop Lane" district — the second slice of the
continuous village scene, sitting directly above the home plate. Paint
ONLY the environment: a narrower cobblestone lane winding between soft
hedges/lawn, entering the bottom edge of the frame at 78% of the width
(matching exactly where env/plate-home.webp's path exits at the top,
asset 1) and exiting the top edge of the frame at 22% of the width.
Include exactly one empty rectangular building-lot foundation
(left-of-center in the lower-middle area) sized to later hold a bookshop
sprite. Include a small soft grassy "reading garden" patch area on the
right side of the lane (just ground/lawn texture, no bench/lamp/post box
painted in — those are separate spot decorations added later). Do NOT
paint any building, tree, bench, lamp, post box, or sign directly — only
the ground, path, hedges, and the one empty lot foundation.

LIGHT: same warm upper-left light as the rest of the set.

TRANSPARENCY: NONE — opaque, full-bleed plate.

FILE NAME: env/plate-bookshop-lane.webp
```

### 12. `buildings/book-shop.webp`

```
[GLOBAL MATCHED-SET BLOCK above]

CANVAS: 704×704 (aspect ratio 1:1)

SUBJECT: A single cozy British storybook bookshop building, with a small
round or bay window showing hints of books inside (no readable text), a
warm-lit interior glow, a simple pictorial shop sign shape only (a small
book-icon-shaped sign, no lettering), a peaked roof. Single centered
building, isolated, matching the same painterly register and camera as
buildings/my-house.webp (asset 3) so the two sit believably in the same
world — the bookshop should read as clearly a real building of similar
construction quality to the cottage, just a different structure/purpose.

PERSPECTIVE: same 3/4 top-down ~30 degree camera as the rest of the set.

TRANSPARENCY: fully transparent background, isolated single building, no
surrounding lane, hedge, or lot foundation included in this file (those
live in the plate, asset 11).

FILE NAME: buildings/book-shop.webp
```

---

## Plate continuity reminder (apply when generating any plate above)

All plates in this batch (`plate-home`, `plate-fog-horizon`,
`plate-bookshop-lane`) are slices of ONE continuous painted village, not
independent illustrations. When generating each one:
- Treat the bottom edge of `plate-bookshop-lane` as literally continuing
  from the top edge of `plate-home` — the path must exit `plate-home` at
  78% width and enter `plate-bookshop-lane` at that same 78% width, the
  hedge/lawn tone should feel like the same lighting moment, not a
  different time of day or a different color grade.
- `plate-fog-horizon` is generic and reusable above ANY locked district —
  its bottom edge (misty lawn + path continuing) must plausibly sit above
  the top edge of `plate-home` (Lv1–2, before the lane unlocks) AND above
  the top edge of `plate-bookshop-lane` (Lv3–4, before the square
  unlocks) without looking wrong in either case. Do not paint anything
  distinctive enough that it visually "commits" to being a specific
  upcoming district.
- Lots are foundations only (no buildings) in every plate — this lets the
  same plate serve both a "not yet purchased" state (empty lot + separate
  `ui/lot-sign.webp` overlay) and an "owned" state (empty lot + a building
  sprite placed on it) without ever needing to regenerate the plate
  itself.

---

## Final consistency review checklist (run after all 16 files are generated)

- [ ] Side-by-side scale check: place `buildings/my-house.webp` and
      `nature/tree.webp` at the same display scale — does the cottage
      read as roughly 2.4x taller than the tree (per the scale-reference
      rule)? Does `buildings/book-shop.webp` look like a believable
      building next to `buildings/my-house.webp` (same construction
      quality/detail level, not a different art style)?
- [ ] Light direction check: lay all 16 files out in a grid — does every
      single one have its brightest highlight on the upper-left and its
      (faint, if any) shadow toward the lower-right? Flag any outlier.
- [ ] Palette sampling: pick 5-10 random color swatches from each asset —
      do they fall within the palette table in
      `FINAL_ARTWORK_SPEC_2026-09-16.md` §1.4 (with the red-post-box
      exception noted, no other exceptions)?
- [ ] Alpha/transparency check: for every sprite/overlay (everything
      except the two opaque plates and plate-fog-horizon), run
      `node scripts/validateTownAssetCandidate.mjs <assetKey> <filePath>`
      and confirm real alpha channel present, ≥4% margin on all sides,
      no fully-opaque canvas.
- [ ] Glow/vignette manual check (cannot be automated, see
      `FINAL_ARTWORK_SPEC_2026-09-16.md` §4.2): view each sprite over
      both a light and a dark background — is there any faint radial
      brightness gradient anywhere in the "transparent" area outside the
      object's own silhouette? Reject and regenerate if so. Apply extra
      scrutiny to `decorations/bench.webp` specifically (known repeat
      failure pattern on this exact asset_key).
- [ ] Plate seam check: stack `plate-home.webp` under
      `plate-bookshop-lane.webp` and under `plate-fog-horizon.webp`
      (Lv1 state) — does the path line up at 78% width and does the
      hedge/lawn tone feel continuous across the seam?
- [ ] Text/IP check: zoom into every sign, window, and building facade —
      confirm zero text, zero logos, zero franchise references anywhere
      across all 16 files.

---

_작성: 2026-09-16. 근거: `WORLD_DESIGN_BRIEF.md`,
`FINAL_ARTWORK_SPEC_2026-09-16.md`,
`docs/design/town/PAUL_TOWN_ASSET_CONTRACT.md`,
`scripts/validateTownAssetCandidate.mjs`. 이미지 생성 도구에 그대로
붙여넣기 위한 프롬프트 문서이며, 이 세션에서는 실제 이미지 생성을
수행하지 않았다._
