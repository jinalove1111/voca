# batch1-pending — NOT contract-passed (owner decision pending)

These files passed the transparency/aspect/seam checks but FAIL the Batch 1
byte budget (`env-art-batch1.spec.json` maxBytes2x) as lossless WebP:

| file | lossless bytes | budget | over |
|---|---|---|---|
| path-curve-gentle.webp | 84,366 | 81,920 (tile 80 KB) | +3 % |
| path-fork.webp | 92,062 | 81,920 (tile 80 KB) | +12 % |

They are NOT in `art-staging/`, NOT `staged` in the manifest, and are loaded by the
recompose harness ONLY with `?assets=batch1-pending` (banner says so) so the owner
can see the real artwork while deciding: raise the budgets, allow lossy-with-alpha,
or re-export. Generated 2026-09-17 with the same resize rules as ingest.py
(tile: exact-aspect resize; patch: contain-fit, no stretch). Delete this folder once
the decision is applied and the files go through `ingest.py` normally.

2026-09-17 update: `grass-patch-light` was accepted through `ingest.py` under the owner-approved 128 KB patch budget (114,648 B) and now lives in `../batch1/`; its pending copy was removed. Remaining pending: path-curve-gentle, path-fork (regeneration targets: square 256×256 contract).

2026-09-17 update 2: `path-curve-gentle` (14.png, 61,516 B) and `path-fork` (15.png, 74,432 B) were regenerated on the square contract and accepted through `ingest.py`; pending copies removed. This folder is now empty apart from this README; only `river-straight` is still outstanding (regeneration target: 256×256 vertical seamless).
