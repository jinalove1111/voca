# Paul Town V2 — Mobile UX, Performance Budget, Stale-Chunk Compatibility (2026-09-17, local review)

Read-only engineering review for the future V2 world renderer. Estimates are
labelled ESTIMATE; measured values are labelled MEASURED (from the current
`dist/` build of `main` a97dc05).

## 1. Mobile UX engineering review (360 / 390 / 430)

| Area | Finding | Recommendation (safe) |
|---|---|---|
| Portrait scroll | World 100×190 → 684/741/817 px tall; HUD sticky above; page scroll (not inner scroll) | Keep page scroll; initial scroll to My House region (y≈45 %); no nested scroll containers (avoids iOS momentum bugs) |
| Touch targets | MEASURED: 44 px rule already present in HUD (2), object layer (3), placement overlay (1) | Keep; decorations at depth scale <0.7 must still wrap a 44 px button even if the sprite is 24 px |
| Shop/Inventory nav | Bottom sheet (`TownSheet`) with backdrop; "마을에 놓기" auto-closes sheet | Unchanged; ensure sheet max-height leaves the cottage visible when placing (currently 78 vh — OK) |
| Item selection / move / store | Popover with 이동/보관 (44 px) on tap in idle mode | Unchanged; in the dense world, open the popover ABOVE the item when anchor y>85 % (foreground) to avoid the bottom nav |
| Bottom navigation | 5 pills (내 마을·상점·보관함·탐험하기·친구 마을); wireframe check: never overlaps the cottage when centred | Reserve 64 px + safe-area inset at the bottom of the world so the sea sign/Paul are not under the nav on short viewports |
| Paul placement | Foreground bottom-left (10,92), ≈110 px tall | On 360 px, cap Paul at 96 px so the signpost stays clear; bubble text max 2 lines |
| Long labels / Korean | Sign labels are CSS text over blank boards (§8.3) | Board width from text measurement; min font 11 px; Korean labels tested at 430 for 2-line wrap |
| Safe areas / browser chrome | MEASURED: `index.html` has no `viewport-fit=cover`/`env(safe-area-inset-*)` | ADD when implementing: `viewport-fit=cover`, bottom nav padding `env(safe-area-inset-bottom)`; do not change global nav tonight |
| 200 % zoom | Wireframe: no horizontal overflow at 390 @ 200 % | Keep world width = 100 vw; never set min-width on the world |

## 2. Performance budget

MEASURED today: V2 chunk 31.0 KB (gzip ≈ 10 KB), V1 TownScreen 11.1 KB,
TownInventory 36.1 KB; town WebPs 24 files = 420 KB total; 0 base64 images
inlined in the V2 chunk.

ESTIMATE for the world renderer + Batch 1 (2x lossless WebP):
| Bucket | Files | Bytes | Notes |
|---|---|---|---|
| Initial Town load (Lv1 home district) | sky-hills, grass-base, 3 patches, ~8 path tiles (shared files ≈4), fence ×3, gate, hedge ×2, 6 clusters/shrubs, my-house, tree | ≈ 380–520 KB | target ≤ 600 KB on first open; sky+grass ≈ 200 KB of it |
| Additional district reveal (per level) | 2–6 new files (landmark + local scenery) | ≈ 60–180 KB each | fetched only when the region unlocks (`unlockVisibility: region`) |
| Shop thumbnails | reuse 1x WebPs of catalog items (already loaded once) | 0 extra | no separate thumbnail set |
| Full asset cache (Batch 1 + P0 + later batches) | ≈ 60–70 files | ≈ 1.3–1.8 MB | cached by hashed filename; immutable |

Rules: WebP everywhere (alpha kinds lossless; opaque sky/grass may use lossy
q92 if >200 KB); no PNG in production; 1x variants served on `<img srcset>`
for DPR 1 devices; tiles reused, never duplicated per placement; nothing from
the world library loads at login (V2 chunk is lazy and flag-gated); Town chunk
isolation preserved (assets imported only from V2 layer files); cache-safe
versioning = Vite content hashes (already the case).

## 3. Stale-chunk compatibility (no reopening of fixed work)
- The fixed failure class: a lazily imported JS chunk 404s after a deploy →
  `React.lazy` rejects → `AppErrorBoundary`/`vite:preloadError` →
  `staleChunkRecovery` reloads once (60 s guard). MEASURED: guard present in
  `src/App.jsx`, `src/main.jsx`, `src/utils/staleChunkRecovery.js`; 102/102
  unit tests; `[stale-chunk]` E2E in the release gate.
- V2 world assets are `<img>`/CSS-url resources, not dynamic imports: a stale
  image URL yields an `<img onerror>` (TownSprite falls back once to the
  emoji; scenery must fall back to hide/CSS per the manifest `fallback`
  field). It can never throw a ChunkLoadError, so it cannot trigger or defeat
  the recovery guard. The V2 JS chunk itself is already covered.
- Coverage gap check: none for JS chunks. One LOCAL gap worth adding later:
  an e2e assertion that a 404-ing scenery image hides cleanly (no broken-image
  icon, no console error storm). Not added tonight (renderer not implemented).

## 4. Verified vs estimated
Verified tonight: chunk sizes, WebP totals, onError path, guard presence,
44 px rules, wireframe overflow/nav checks. Estimated: all Batch 1 byte
figures and per-level reveal costs (no painted files exist yet).
