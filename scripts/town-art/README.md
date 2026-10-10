# scripts/town-art/ — Paul Town V2 environment art ingest (2026-09-17)

Engineering prep only. Not wired into the app, not a build step. Owns two
files: `ingest.py` (the pipeline) and this README.

## What this replaces

`docs/design/town/mockup/batch1/processBatch1.py` did the same job for the
original Batch 1 workflow (crop/fit/repad for sprites, resize + seam score
for tiles, resize-only for patches; reject-on-missing-alpha). `ingest.py`
supersedes it for env-art batches going forward: same core logic, but it
reads canvases/kinds/margins/byte-budgets from
`docs/design/town/manifest/env-art-batch1.spec.json` instead of a hardcoded
Python dict, and adds several fail-closed gates `processBatch1.py` didn't
have (duplicate-hash detection, seam-score REJECT threshold instead of
informational-only, upscale limit, edge-clip detection, byte budgets with a
disciplined lossy fallback). `processBatch1.py` itself is untouched — this
is a new, stricter tool living alongside it, not a rewrite of it.

## Usage

```
python scripts/town-art/ingest.py --src <folder of raw PNG/WebP candidates>
```

Optional flags:
- `--staging <dir>` — output folder (default `art-staging/batch1`, which is
  git-ignored — see `.gitignore`; nothing here is the canonical asset, it is
  a review staging area).
- `--spec <file>` — expected-file spec JSON (default
  `docs/design/town/manifest/env-art-batch1.spec.json`).
- `--dry-run` — process and stage files, print the report, but do NOT write
  status changes into `docs/design/town/manifest/env-art-manifest.json`.
  Useful for a smoke test that must not perturb the real manifest's
  all-`missing` initial state.
- `--allow-partial` — exit 0 even if some raw files were rejected (default:
  exit 1 on any reject, fail-closed).
- `--clean-edges` — pre-pass on sprite candidates: set `alpha<8` pixels to 0
  before cropping to the alpha bounding box (never changes the colour of any
  `alpha>0` pixel). Off by default since it's a lossy cleanup step the
  operator should opt into deliberately.

## What it does (per raw file)

Match by case-insensitive filename prefix to a spec `asset_key` -> validate
(format, alpha-mode-matches-spec, upscale limit, sprite aspect/edge-clip
checks) -> normalize (sprite: alpha-crop + contain-fit + anchor paste + repad
if needed; tile/patch/band: resize only) -> duplicate-content check (sha256
of the *normalized* pixel bytes) -> seam check (tiles with a `seamAxis`) ->
encode within the spec's `maxBytes2x` (lossless WebP, falling back to
quality-92 lossy only for `transparent: false` entries, never for alpha) ->
write `<staging>/<key>.webp` + `<key>.png` + `<key>-1x.webp` (half-size).

Never touches `src/assets/town/` — that folder only gets new files when an
operator manually reviews the staged output and registers it, exactly like
the existing `processBatch1.py` / `paul-town-lv4-recompose-batch1.html`
workflow.

Full per-gate rationale and exact numeric thresholds are documented in
`ingest.py`'s module docstring — read that before changing any threshold.

## Once art arrives

```
python scripts/town-art/ingest.py --src <raw folder>
```

Then: `node scripts/testEnvArtManifest.mjs` to confirm the manifest is still
schema-valid after the status updates, review `<staging>/ingest-report.json`
+ the staged files, and only then hand off to the existing
`paul-town-lv4-recompose-batch1.html` recompose/registration step.

## If a raw export is RGB with a baked-in checkerboard (no real alpha)

Some art tool exports come back as plain RGB PNGs where the "transparent"
area was flattened onto a soft/blurred white-and-light-grey checkerboard
instead of actually being transparent. `ingest.py` expects real alpha for
`transparent: true` spec entries, so this must be fixed first:

```
python scripts/town-art/stripCheckerboard.py --src <raw folder or file> --out <rgba folder>
```

It flood-fills the border-connected checkerboard to transparent while
leaving interior grey rocks / white flowers / any other checker-colored
detail that's fully enclosed by the artwork's outline untouched (they're not
reachable from the image border through checker-colored pixels, so they
survive), and does not alter the RGB of any pixel that stays visible. Two
thresholds control what counts as "checker-like":

- `--chroma-max` (default 14): max(r,g,b) - min(r,g,b) must be at or below
  this for a pixel to be considered part of the checkerboard.
- `--luma-min` (default 185): min(r,g,b) must be at or above this.

Run it **before** `ingest.py`, pointing `--out` at a new folder, then run
`ingest.py --src <that rgba folder>` as usual. It also writes a
`<name>-check.png` next to each output — a 25%-scale preview composited over
solid magenta, purely for eyeballing edge quality; it is not consumed by
`ingest.py` or anything else.

Validated on the 2026-09 batch (`grass-patch-light`, `path-curve-gentle`,
`path-fork`): the defaults (14 / 185) cleanly removed the checkerboard in a
single flood fill (1–2 connected artwork components, no checkerboard
residue) while keeping white daisies and grey rocks that touch the artwork's
outline intact. Tightening the thresholds (tried `--chroma-max 10
--luma-min 200`) made things *worse*, not better — the checkerboard's
light-grey cells dip as low as ~185–199 in spots, so a stricter `--luma-min`
stops matching parts of the checkerboard itself, which then survive as
dozens of small stray opaque flecks scattered through the background. Keep
the defaults unless a future export's checkerboard tones measurably differ.
