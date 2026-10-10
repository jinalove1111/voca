# Batch 1 staging folder

Drop the processed Batch 1 environment art files here (2x WebP, lossless;
matching PNG optional but produced by `processBatch1.py` alongside). Source
of truth for specs: `docs/design/town/ENV_ART_BATCH1_HANDOFF_2026-09-17.md`
§1 + §1.9. **2026-09-17 163차:** the first five validated files (fence-gate, fence-straight,
hedge-straight, flower-cluster-mixed, path-straight) are committed here as
harness inputs; the rest still render as placeholders. Nothing
is registered in `TOWN_ASSETS`/`assetManifest.js` until the batch passes the
acceptance test in the handoff §4-5).

**2026-09-17 update:** this table is no longer a hand-picked subset of the
handoff — it is kept in sync with the *authoritative* expected-file list the
recompose harness (`paul-town-lv4-recompose-batch1.html`) actually computes
at runtime from every `placePx()`/`placeWorld()` call in its script (plus
`grass-base` and `sky-hills`, which are CSS/`<img>`-driven rather than
`placePx`-driven but are registered into the same set). If you add/remove a
placement in the harness's `<script>`, update this table to match — the
legend's "N / total" count and this table's row count must always agree.
**Current total: 35 files** (table; the recompose harness legend counts **33** since 2026-09-17 164차 — `path-junction` and `path-curve-strong` are no longer placed: one shared `path-fork` tile at the fork vertex and one `path-curve-gentle` tile per ≥45° polyline vertex replaced them).

| # | filename | px (2x) | purpose |
|---|---|---|---|
| 1 | sky-hills.webp | 1024×260 | opaque distant-landscape band, top 12% of the world (§1.9) |
| 2 | grass-base.webp | 512×512 | seamless tiled grass base, fills the whole world (128px/tile on screen) |
| 3 | grass-patch-light.webp | 400×280 | sun-lit tonal overlay patch, near the lane / cottage rise |
| 4 | grass-patch-dark.webp | 400×280 | shaded tonal overlay patch, under tree groups |
| 5 | grass-patch-worn.webp | 400×200 | worn/thin grass overlay, hugs the lane edges |
| 6 | wildflower-scatter.webp | 320×240 | loose white/yellow wildflower overlay, foreground + home lawn |
| 7 | path-straight.webp | 256×256 | cobblestone lane tile, straight, repeats/rotates along the centre-line |
| 8 | path-straight-narrow.webp | 256×256 | lane tile, narrower cobbles for the farthest depth band (near the school, worldY≤34) |
| 9 | path-curve-gentle.webp | 256×256 | lane tile, ~30° bend |
| 10 | path-curve-strong.webp | 256×256 | lane tile, ~90° bend |
| 11 | path-fork.webp | 256×256 | lane tile, Y split (fork A, 50,62) |
| 12 | path-junction.webp | 256×256 | lane tile, T split (approximates where the shop spur leaves) |
| 13 | path-end.webp | 256×160 | lane tile, rounded flagstone doorstep (front door, 22,53) |
| 14 | path-end-entrance.webp | 256×176 | lane tile, widened paved apron (sea sign, 80,92) |
| 15 | fence-straight.webp | 256×96 | white picket fence segment, repeats along the garden curve |
| 16 | fence-straight-short.webp | 128×96 | 2-picket fence segment, used immediately next to each corner |
| 17 | fence-corner.webp | 128×128 | picket fence 90° corner piece (placed at the 4 garden-curve bends) |
| 18 | fence-gate.webp | 192×128 | garden gate, open ~20°, at (33,61) |
| 19 | hedge-straight.webp | 256×128 | trimmed box hedge segment, left run (outside the fence, wx≤9) |
| 20 | hedge-straight-tall.webp | 256×160 | taller trimmed hedge segment, back run (outside the fence, wy≤51.5) |
| 21 | hedge-end.webp | 128×128 | hedge rounded end cap |
| 22 | shrub-round.webp | 160×128 | round garden shrub filler |
| 23 | shrub-round-small.webp | 128×96 | smaller round shrub filler, alternated in for size variety |
| 24 | shrub-wide.webp | 224×112 | low spreading shrub filler |
| 25 | flower-cluster-pink.webp | 160×112 | pink hydrangea/rose clump |
| 26 | flower-cluster-yellow.webp | 160×112 | daisy/buttercup clump |
| 27 | flower-cluster-mixed.webp | 192×112 | mixed cottage-garden border clump |
| 28 | flower-bed-border.webp | 320×112 | low planting strip, inside the front fence run |
| 29 | flower-pot.webp | 128×128 | terracotta pot, café terrace edge (×2) + book-shop front (×2) |
| 30 | flower-pot-tall.webp | 128×128 | tall urn variant, near the square (57,60) |
| 31 | river-straight.webp | 256×256 | river tile, straight, water ≈55% of tile width |
| 32 | river-bend.webp | 256×256 | river tile, gentle S/30° bend |
| 33 | river-highlight.webp | 256×128 | soft white ripple/glint overlay, scattered on the water |
| 34 | riverbank-reeds.webp | 192×96 | reeds + grass tuft, near (village-side) bank |
| 35 | riverbank-reeds-stones.webp | 192×96 | pebbled reeds variant, alternated in on 2 of the 5 reed spots |

Batch files that exist in the handoff spec but are **not** placed by this
harness (so they are correctly absent from the count above, and won't show
up as "missing" in the legend even if you never provide them):
`fence-post.webp` (no dedicated placement in this Lv4 view — the picket
posts are baked into `fence-straight`/`fence-corner`) and
`fence-gate-closed.webp` (the lane passes through the gate in this scene, so
only the open `fence-gate` is used). `hedge-corner.webp` is also unused for
the same reason (the harness's two hedge runs don't currently meet at a
shared corner). If a future composition needs any of these, add the
placement call in the harness and re-add the row here.

Once files are here: open
`docs/design/town/mockup/paul-town-lv4-recompose-batch1.html` directly in a
browser (file://) — no build step, no dev server.
