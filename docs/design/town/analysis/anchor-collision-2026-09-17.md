# Paul Town V2 -- 47-cell placement-anchor collision analysis (2026-09-17)

Source: docs/design/town/wireframe/paul-town-world-wireframe-v2.html CELLS array (authoritative positions, not invented) + PAUL_TOWN_APPROVED_WORLD_DESIGN_2026-09-17.md sections 1.2/1.3/1.4/2/5.

Method: decoration footprint 8 wide x 6 tall (raw world units) at the cell scale, anchored bottom-center at the cell (x, y_raw), same convention as landmarks/trees in the wireframe code. All positions are converted from the spec pct-space (x = pct-of-width = raw x directly; y = pct-of-height, raw y = y_pct * 1.9) into one uniform raw-unit space (world is 100x190 raw units, 1 unit = 3.9px at 390px width) before any distance/overlap math, per the wireframe file own inline comment. Landmark boxes: anchor bottom-center, width per section 2, height = 1.25x width for buildings (including clock-tower), 0.5x width for the bridge, 1.0x width for the fountain. Path/river/fence collisions use nearest-point-on-polyline distance vs. the stated thresholds (path: half local width + 3; river: flat 7; fence: flat 3 as a footprint-height buffer, since the fence has no width dimension in spec). Cell-cell: anchor-to-anchor distance < 6.

## Zone counts (must match section 5: 10/8/5/8/3/4/3/3/2/1 = 47)

| zone | cells found | spec count |
|---|---|---|
| Front garden | 10 | 10 |
| House lawn/rise | 8 | 8 |
| Lawn connector | 5 | 5 |
| Village square ring | 8 | 8 |
| Cafe terrace edge | 3 | 3 |
| Book Shop front | 4 | 4 |
| Riverbank | 3 | 3 |
| School lawn | 3 | 3 |
| Tower green | 2 | 2 |
| Foreground verge | 1 | 1 |

Total: 47/47 -- matches section 5 exactly.

## Summary

- Clean cells (no collision of any of the 5 kinds): 11/47
- Colliding cells (at least one flagged overlap): 36/47
- Most collisions are landmark-box or path-corridor overlaps concentrated in the Front garden, House lawn, Village square ring, and Cafe/Book Shop zones -- expected, since the wireframe cell positions were hand-picked for visual variety around those focal landmarks rather than against exact box/ribbon math, and the checked clearances (path: half-width+3, river: 7, cell-cell: 6) are generous relative to an 8x6 footprint.

## Locked-region cells (only usable once the region unlocks)

| zone | unlock level | cell ids |
|---|---|---|
| Cafe terrace edge | Lv5 | C32, C33, C34 |
| Book Shop front | Lv3 | C35, C36, C37, C38 |
| Riverbank | Lv6 | C39, C40, C41 |
| School lawn | Lv7 | C42, C43, C44 |
| Tower green | Lv8 | C45, C46 |

Note: Village square ring cells (C24-C31) sit inside the Lv5 Village-square region box, but section 5 explicitly marks that zone "usable from Lv1 as lawn" -- so they are listed above as Lv1-unlocked in the per-cell table, not as a locked zone. Riverbank unlock is inferred as Lv6 (the interactive River/Bridge unlock) since section 1.2 lists the river region itself as "visible from Lv1 as scenery" but functionally Lv6; this is the one assumption in this analysis, flagged for confirmation. All other 32 cells (Front garden, House lawn, Lawn connector, Village square ring, Foreground verge) are Lv1.

## Per-cell table

| cell | zone | x | y (pct) | scale | unlock | collisions | suggested nudge dx,dy (pct-space) |
|---|---|---|---|---|---|---|---|
| C01 | Front garden | 7 | 55 | 1 | Lv1 | landmark:my-house | (-5.8, +0.8) |
| C02 | Front garden | 11 | 61 | 1 | Lv1 | clean | — |
| C03 | Front garden | 9 | 58 | 1 | Lv1 | cell:C10 d=5.0 | (-2, +0) |
| C04 | Front garden | 16 | 63 | 1 | Lv1 | clean | — |
| C05 | Front garden | 38 | 54 | 1 | Lv1 | landmark:my-house; fence d=1.6 | (+8.7, -0.3) |
| C06 | Front garden | 40 | 60 | 1 | Lv1 | path:TRUNK d=5.5 thr=7.2; fence d=1.3; cell:C16 d=5.5 | (-2.3, +0.3) |
| C07 | Front garden | 35 | 63 | 1 | Lv1 | path:TRUNK d=2.0 thr=7.1 | (-4, +0.3) |
| C08 | Front garden | 30 | 54 | 1 | Lv1 | landmark:my-house; path:TRUNK d=6.2 thr=6.3 | (+2.7, -0.5) |
| C09 | Front garden | 19 | 54 | 1 | Lv1 | landmark:my-house; path:TRUNK d=3.5 thr=6.0 | (-8.7, +0.8) |
| C10 | Front garden | 14 | 58 | 1 | Lv1 | cell:C03 d=5.0 | (+2, +0) |
| C11 | House lawn/rise | 3 | 58 | 0.95 | Lv1 | fence d=0.9 | (-3, +0) |
| C12 | House lawn/rise | 3 | 48 | 0.95 | Lv1 | landmark:my-house | (-5.4, -1.4) |
| C13 | House lawn/rise | 3 | 40 | 0.95 | Lv1 | landmark:my-house | (-3.7, -2.5) |
| C14 | House lawn/rise | 44 | 48 | 0.95 | Lv1 | clean | — |
| C15 | House lawn/rise | 44 | 40 | 0.95 | Lv1 | cell:C30 d=5.5 | (-1.4, -0.7) |
| C16 | House lawn/rise | 44 | 58 | 0.95 | Lv1 | fence d=2.0; cell:C06 d=5.5; cell:C19 d=4.3; cell:C25 d=1.0 | (+1.5, -1.7) |
| C17 | House lawn/rise | 20 | 26 | 0.95 | Lv1 | clean | — |
| C18 | House lawn/rise | 33 | 28 | 0.95 | Lv1 | clean | — |
| C19 | Lawn connector | 46 | 60 | 0.95 | Lv1 | path:SQUARE_A d=5.3 thr=7.4; cell:C16 d=4.3; cell:C25 d=3.9 | (-1.5, +0.5) |
| C20 | Lawn connector | 50 | 65 | 0.95 | Lv1 | path:SEA d=0.6 thr=7.5 | (+0, +2.1) |
| C21 | Lawn connector | 54 | 68 | 0.95 | Lv1 | path:SHOP d=4.5 thr=7.1 | (+1.3, +2) |
| C22 | Lawn connector | 48 | 68 | 0.95 | Lv1 | path:SEA d=0.7 thr=7.5 | (-0.7, +2.1) |
| C23 | Lawn connector | 56 | 63 | 0.95 | Lv1 | path:SHOP d=3.3 thr=7.3 | (+3.8, +0.6) |
| C24 | Village square ring | 42 | 45 | 0.875 | Lv1 | landmark:my-house | (+4.8, -1.9) |
| C25 | Village square ring | 45 | 58 | 0.875 | Lv1 | cell:C16 d=1.0; cell:C19 d=3.9 | (+1.5, -1) |
| C26 | Village square ring | 50 | 48 | 0.875 | Lv1 | clean | — |
| C27 | Village square ring | 60 | 42 | 0.875 | Lv1 | landmark:cafe; cell:C33 d=4.3; cell:C34 d=2.0 | (-2.5, -3.5) |
| C28 | Village square ring | 65 | 50 | 0.875 | Lv1 | landmark:book-shop; path:SQUARE_A d=0.7 thr=6.6 | (-0.6, -4.6) |
| C29 | Village square ring | 58 | 60 | 0.875 | Lv1 | path:SQUARE_A d=5.3 thr=7.2 | (+3.6, -0.9) |
| C30 | Village square ring | 48 | 42 | 0.875 | Lv1 | cell:C15 d=5.5 | (+1.4, +0.7) |
| C31 | Village square ring | 63 | 58 | 0.875 | Lv1 | clean | — |
| C32 | Cafe terrace edge | 60 | 48 | 0.85 | Lv5 | landmark:cafe; path:SQUARE_A d=5.5 thr=6.6 | (-4.4, -1.1) |
| C33 | Cafe terrace edge | 62 | 44 | 0.85 | Lv5 | landmark:cafe; cell:C27 d=4.3; cell:C34 d=5.5 | (-1.6, -0.7) |
| C34 | Cafe terrace edge | 58 | 42 | 0.85 | Lv5 | landmark:cafe; cell:C27 d=2.0; cell:C33 d=5.5 | (-7.6, -3) |
| C35 | Book Shop front | 71 | 64 | 0.85 | Lv3 | landmark:book-shop; path:SHOP d=4.3 thr=6.5 | (-1.9, +1.2) |
| C36 | Book Shop front | 75 | 67 | 0.85 | Lv3 | path:SHOP d=2.4 thr=6.5 | (+3.7, +0.7) |
| C37 | Book Shop front | 82 | 66 | 0.85 | Lv3 | cell:C38 d=4.8; cell:C40 d=4.4 | (-3, +1.3) |
| C38 | Book Shop front | 85 | 64 | 0.85 | Lv3 | landmark:book-shop; cell:C37 d=4.8; cell:C40 d=2.1 | (+6.1, -0.9) |
| C39 | Riverbank | 83 | 45 | 0.8 | Lv6 | clean | — |
| C40 | Riverbank | 86 | 65 | 0.8 | Lv6 | landmark:book-shop; cell:C37 d=4.4; cell:C38 d=2.1 | (+8.2, +1.8) |
| C41 | Riverbank | 87 | 85 | 0.8 | Lv6 | clean | — |
| C42 | School lawn | 38 | 24 | 0.65 | Lv7 | landmark:english-school | (-6, +0) |
| C43 | School lawn | 58 | 24 | 0.65 | Lv7 | landmark:english-school; path:SQUARE_B d=3.8 thr=5.2 | (+6.4, -2.1) |
| C44 | School lawn | 48 | 30 | 0.65 | Lv7 | clean | — |
| C45 | Tower green | 78 | 18 | 0.6 | Lv8 | landmark:clock-tower | (+2, -3) |
| C46 | Tower green | 82 | 12 | 0.6 | Lv8 | clean | — |
| C47 | Foreground verge | 70 | 95 | 1.15 | Lv1 | path:SEA d=7.9 thr=8.0 | (+1.2, +2) |
