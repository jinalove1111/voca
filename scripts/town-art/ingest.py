#!/usr/bin/env python3
"""scripts/town-art/ingest.py — Paul Town V2 environment art batch ingest
pipeline (2026-09-17, engineering prep, fail-closed).

Design tooling only. Not wired into the app, not a build step, never touches
`src/assets/town/` (canonical production assets) — this script only reads
raw candidate files from an operator-supplied `--src` folder, validates and
normalizes them against
`docs/design/town/manifest/env-art-batch1.spec.json`, and writes processed
output into a git-ignored staging folder (`art-staging/<name>/` by default)
plus an `ingest-report.json`. It then updates
`docs/design/town/manifest/env-art-manifest.json` in place (status only:
missing -> staged/rejected) unless `--dry-run` is given.

This supersedes `docs/design/town/mockup/batch1/processBatch1.py` for the
env-art batches going forward (same crop/fit/repad and resize-only logic,
generalized to read canvases/kinds/margins from the spec JSON instead of a
hardcoded dict, plus the new REJECT-closed validation gates below). The old
file is left untouched for its original batch1/ workflow.

Usage:
    python scripts/town-art/ingest.py --src <raw folder> \\
        [--staging art-staging/batch1] \\
        [--spec docs/design/town/manifest/env-art-batch1.spec.json] \\
        [--dry-run] [--allow-partial] [--clean-edges]

Pipeline per raw file (`*.png`/`*.webp` in --src):
  1. Match to a spec entry by case-insensitive basename prefix (longest key
     wins on ambiguity, e.g. `path-straight-narrow` before `path-straight`).
     No match -> REJECT "no spec key".
  2. Open + format check (PNG or WebP magic via Pillow's own detection).
  3. Alpha-mode check: mode must have an alpha channel iff spec transparent
     is YES; if transparent is NO but the source actually has real (non-full)
     transparency, REJECT (`band`/sky kinds are explicitly required opaque).
  4. Upscale-limit check: if reaching the target canvas would need >1.5x
     upscale on either axis, REJECT "too small".
  5. Sprite-only: raw whole-image aspect vs target aspect >12% off -> WARN
     (not reject, crop/fit handles it); alpha-content-bbox aspect vs target
     >40% off -> REJECT; content touching the *source* image's own edge with
     alpha>200 -> REJECT "clipped" (no amount of crop/fit can safely recover
     a subject that was already cut off upstream).
  6. Normalize: sprites = alpha-bbox crop -> contain-fit into px2x with a 5%
     margin -> bottom-center paste (center for `anchor: center`), optional
     `--clean-edges` pre-pass (alpha<8 -> 0, no colour change to alpha>0
     pixels); tiles/patches/band = resize to px2x (opaque flatten for
     `transparent: false` entries). If the resulting margins are still below
     the spec's `marginPctMin` (shouldn't normally happen given the 5%
     margin, but guards anchor/rounding edge cases), repad tighter and WARN.
  7. Duplicate check: sha256 of the *normalized* RGBA pixel bytes, across the
     whole run — a later file whose normalized content byte-matches an
     earlier ACCEPTED file is REJECTed as a duplicate.
  8. Seam check (tile kind with a `seamAxis` only): mean abs RGB diff between
     the relevant opposite edges of the *normalized* canvas; REJECT if
     >18/255 on the required axis.
  9. Encode: lossless WebP first; if over `maxBytes2x`, retry at WebP
     quality=92 lossy — but ONLY for entries with `transparent: false`
     (never lossy-degrade an alpha channel); still over budget -> REJECT
     "too large".
 10. Write `<staging>/<key>.webp` (accepted encoding), `<staging>/<key>.png`,
     `<staging>/<key>-1x.webp` (half-size, lossless).

Also writes `<staging>/ingest-report.json` (per-file status/reasons/px/
alpha/margins/seam/bytes/sha256) and prints a plain-text table. Exit code 1
if any file REJECTed, unless `--allow-partial`. Manifest updates (unless
`--dry-run`): ACCEPTED keys -> `status: "staged"` + `stagedPath`/`sha256` (staged WebP file hash)/`contentHash` (pixel hash)/
`bytes2x`; REJECTed keys that matched a spec key -> `status: "rejected"` +
`rejectionReasons`; every other entry (not touched by this run) is left
exactly as-is.

Zero non-Pillow dependencies (Pillow is already installed on this machine —
do not `pip install` anything, CLAUDE.md rule 6).
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SPEC = ROOT / "docs" / "design" / "town" / "manifest" / "env-art-batch1.spec.json"
DEFAULT_STAGING = ROOT / "art-staging" / "batch1"
MANIFEST_PATH = ROOT / "docs" / "design" / "town" / "manifest" / "env-art-manifest.json"

UPSCALE_MAX = 1.5
SPRITE_ASPECT_WARN_PCT = 12.0
CONTENT_ASPECT_REJECT_PCT = 40.0
EDGE_ALPHA_CLIP_THRESHOLD = 200
SEAM_MAX = 18.0  # /255
SPRITE_MARGIN_RATIO = 0.05  # contain-fit margin (handoff self-check line: ">=5% empty margin")
LOSSY_FALLBACK_QUALITY = 92
LOSSY_FALLBACK_STEPS = (92, 88, 85)  # 2026-09-18 owner decision "grass: q85": opaque tile/band only, never below 85
RAW_EXTENSIONS = {".png", ".webp"}


# ── small pure helpers ──────────────────────────────────────────────────────

def has_alpha_mode(img):
    return img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)


def real_transparency_present(img):
    """True iff the image actually has any non-fully-opaque pixel (not just an alpha channel)."""
    if not has_alpha_mode(img):
        return False
    a = img.convert("RGBA").split()[-1]
    lo, _hi = a.getextrema()
    return lo < 250


ALPHA_BBOX_MIN = 4  # 2026-09-18 hardening: alpha<=4 is invisible and must not inflate the content bbox


def alpha_bbox(img):
    """Bounding box of VISIBLE content (alpha > ALPHA_BBOX_MIN). An alpha=1 'ghost'
    layer over the canvas (seen on 38.png) previously made the bbox near-square and
    let a 1.58:1 sprite pass the 40% aspect gate as a false PASS."""
    a = img.convert("RGBA").split()[-1]
    return a.point(lambda v: 255 if v > ALPHA_BBOX_MIN else 0).getbbox()


def sha256_of_canvas(canvas):
    return hashlib.sha256(canvas.convert("RGBA").tobytes()).hexdigest()


def touches_source_edge(img, bbox, threshold=EDGE_ALPHA_CLIP_THRESHOLD):
    """Which sides of bbox sit flush on the source image's own edge AND have
    alpha>threshold pixels along that edge (i.e. the subject looks cut off in
    the raw capture, not just close to the margin)."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    a = rgba.split()[-1]
    px = a.load()
    l, t, r, b = bbox
    touched = []
    if l == 0 and any(px[0, y] > threshold for y in range(t, b)):
        touched.append("left")
    if t == 0 and any(px[x, 0] > threshold for x in range(l, r)):
        touched.append("top")
    if r == w and any(px[w - 1, y] > threshold for y in range(t, b)):
        touched.append("right")
    if b == h and any(px[x, h - 1] > threshold for x in range(l, r)):
        touched.append("bottom")
    return touched


def seam_score(canvas, axis):
    """Mean abs RGB diff between opposite edges of the normalized canvas.
    axis='y' -> compare top row vs bottom row (vertical repeat, e.g. a lane
    tile running bottom-to-top); axis='x' -> left column vs right column;
    axis='xy' -> the worse of both (e.g. grass-base, seamless on both axes)."""
    rgb = canvas.convert("RGB")
    w, h = rgb.size
    px = rgb.load()

    def y_score():
        total = 0.0
        for x in range(w):
            top = px[x, 0]
            bot = px[x, h - 1]
            total += sum(abs(a - b) for a, b in zip(top, bot)) / 3
        return total / max(w, 1)

    def x_score():
        total = 0.0
        for y in range(h):
            left = px[0, y]
            right = px[w - 1, y]
            total += sum(abs(a - b) for a, b in zip(left, right)) / 3
        return total / max(h, 1)

    if axis == "y":
        return y_score()
    if axis == "x":
        return x_score()
    if axis == "xy":
        return max(x_score(), y_score())
    return 0.0


def clean_edges(rgba_img):
    """--clean-edges pre-pass: set alpha<8 to 0; never touch colour of alpha>0 pixels."""
    rgba = rgba_img.copy()
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 8:
                px[x, y] = (r, g, b, 0)
    return rgba


def rel_or_abs(path_obj):
    """Path relative to ROOT when possible (the normal in-repo case), else
    the absolute path as a string (e.g. an operator/smoke-test --staging dir
    living outside the repo, such as a scratch/temp folder)."""
    resolved = path_obj.resolve()
    try:
        return str(resolved.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return str(resolved).replace("\\", "/")


def match_spec_key(filename, spec_keys):
    base = Path(filename).stem.lower()
    for key in sorted(spec_keys, key=len, reverse=True):
        if base.startswith(key.lower()):
            return key
    return None


# ── normalization ────────────────────────────────────────────────────────────

def normalize_sprite(img, target_w, target_h, anchor, do_clean_edges):
    rgba = img.convert("RGBA")
    if do_clean_edges:
        rgba = clean_edges(rgba)
    bbox = alpha_bbox(rgba)
    if bbox is None:
        raise ValueError("fully transparent -- no alpha content to crop to")
    cropped = rgba.crop(bbox)
    return _fit_and_paste(cropped, target_w, target_h, anchor, SPRITE_MARGIN_RATIO)


def _fit_and_paste(content_rgba, target_w, target_h, anchor, margin_ratio):
    cw, ch = content_rgba.size
    margin_w = target_w * margin_ratio
    margin_h = target_h * margin_ratio
    avail_w = max(1.0, target_w - 2 * margin_w)
    avail_h = max(1.0, target_h - 2 * margin_h)
    scale = min(avail_w / cw, avail_h / ch, 1.0 if margin_ratio == 0 else float("inf"))
    new_w = max(1, round(cw * scale))
    new_h = max(1, round(ch * scale))
    resized = content_rgba.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    x = (target_w - new_w) // 2
    y = (target_h - new_h) // 2 if anchor == "center" else target_h - round(margin_h) - new_h
    y = max(0, min(y, target_h - new_h))
    canvas.paste(resized, (x, y), resized)
    margins = {
        "left": x / target_w * 100,
        "right": (target_w - x - new_w) / target_w * 100,
        "top": y / target_h * 100,
        "bottom": (target_h - y - new_h) / target_h * 100,
    }
    return canvas, margins


def repad_if_needed(canvas, margins, margin_pct_min, anchor):
    if margin_pct_min <= 0 or min(margins.values()) >= margin_pct_min:
        return canvas, margins, False
    bbox = canvas.split()[-1].getbbox()
    if bbox is None:
        return canvas, margins, False
    cropped = canvas.crop(bbox)
    target_w, target_h = canvas.size
    new_canvas, new_margins = _fit_and_paste(cropped, target_w, target_h, anchor, margin_pct_min / 100.0)
    return new_canvas, new_margins, True


def resize_only(img, target_w, target_h, force_opaque):
    if force_opaque:
        out = img.convert("RGB")
    else:
        out = img.convert("RGBA" if has_alpha_mode(img) else "RGB")
    return out.resize((target_w, target_h), Image.LANCZOS)


# ── encoding ─────────────────────────────────────────────────────────────────

def encode_within_budget(canvas, max_bytes, allow_lossy_fallback):
    """Returns (bytes, mode_str) or raises ValueError if over budget."""
    import io

    buf = io.BytesIO()
    canvas.save(buf, "WEBP", lossless=True)
    data = buf.getvalue()
    if len(data) <= max_bytes:
        return data, "lossless"
    if allow_lossy_fallback:
        tried = []
        for q in LOSSY_FALLBACK_STEPS:
            buf2 = io.BytesIO()
            canvas.convert("RGB").save(buf2, "WEBP", lossless=False, quality=q)
            data2 = buf2.getvalue()
            tried.append(f"q{q}={len(data2)}B")
            if len(data2) <= max_bytes:
                return data2, f"lossy(q{q})"
        raise ValueError(
            f"too large: lossless={len(data)}B, lossy {', '.join(tried)}, budget={max_bytes}B"
        )
    raise ValueError(f"too large: lossless={len(data)}B, budget={max_bytes}B (no lossy fallback -- has alpha)")


# ── per-file pipeline ────────────────────────────────────────────────────────

class RejectError(Exception):
    pass


def process_one(raw_path, key, entry, args, seen_hashes, assigned_keys):
    warnings = []
    target_w, target_h = entry["px2x"]
    transparent_expected = bool(entry["transparent"])
    kind = entry["kind"]
    anchor = entry["anchor"]
    margin_pct_min = entry["marginPctMin"]
    seam_axis = entry.get("seamAxis")
    max_bytes = entry["maxBytes2x"]

    try:
        img = Image.open(raw_path)
        img.load()
    except Exception as e:
        raise RejectError(f"could not open image: {e}")

    if img.format not in ("PNG", "WEBP"):
        raise RejectError(f"unsupported format={img.format} (expected PNG or WebP)")

    src_w, src_h = img.size
    alpha_present = has_alpha_mode(img)

    if transparent_expected and not alpha_present:
        raise RejectError(f"missing alpha channel (mode={img.mode}) but spec requires transparent=YES")
    if not transparent_expected and real_transparency_present(img):
        # 2026-09-18 owner decision "grass: flatten" (opaque-spec assets ONLY): an
        # input that carries alpha is flattened to RGB (its painted colour kept,
        # alpha discarded) before validation/output instead of being rejected.
        # Transparent-spec kinds (sprites, patches, river, ...) are untouched.
        img = img.convert("RGB")
        alpha_present = False
        warnings.append("opaque spec: source alpha channel flattened to RGB (colour kept, alpha discarded)")

    scale_w = target_w / src_w
    scale_h = target_h / src_h
    if scale_w > UPSCALE_MAX or scale_h > UPSCALE_MAX:
        raise RejectError(
            f"too small: source {src_w}x{src_h} would need >{UPSCALE_MAX}x upscale to reach {target_w}x{target_h}"
        )

    if kind == "sprite":
        raw_aspect = src_w / src_h
        target_aspect = target_w / target_h
        aspect_diff_pct = abs(raw_aspect - target_aspect) / target_aspect * 100
        if aspect_diff_pct > SPRITE_ASPECT_WARN_PCT:
            warnings.append(
                f"raw aspect ratio differs {aspect_diff_pct:.1f}% from target {target_w}x{target_h} (crop/fit will handle it)"
            )
        bbox = alpha_bbox(img) if alpha_present else (0, 0, src_w, src_h)
        if bbox is None:
            raise RejectError("fully transparent -- no alpha content")
        l, t, r, b = bbox
        content_aspect = (r - l) / max(1, (b - t))
        content_diff_pct = abs(content_aspect - target_aspect) / target_aspect * 100
        if content_diff_pct > CONTENT_ASPECT_REJECT_PCT:
            raise RejectError(
                f"content bbox aspect deviates {content_diff_pct:.1f}% from target (>{CONTENT_ASPECT_REJECT_PCT}%)"
            )
        if alpha_present:
            edges = touches_source_edge(img, bbox)
            if edges:
                raise RejectError(f"clipped: content touches source edge(s) {edges} with alpha>{EDGE_ALPHA_CLIP_THRESHOLD}")

    margins = None
    repadded = False
    if kind == "sprite":
        canvas, margins = normalize_sprite(img, target_w, target_h, anchor, args.clean_edges)
        canvas, margins, repadded = repad_if_needed(canvas, margins, margin_pct_min, anchor)
        if repadded:
            warnings.append(f"repadded to satisfy marginPctMin={margin_pct_min}%")
    else:
        # 2026-09-17: never stretch. A tile/patch/band whose source aspect
        # deviates from the target by more than CONTENT_ASPECT_REJECT_PCT would
        # be distorted by resize_only -> REJECT (fix the spec dims or the art).
        raw_aspect_tpb = src_w / max(1, src_h)
        target_aspect_tpb = target_w / max(1, target_h)
        tpb_diff_pct = abs(raw_aspect_tpb - target_aspect_tpb) / target_aspect_tpb * 100
        if tpb_diff_pct > CONTENT_ASPECT_REJECT_PCT:
            raise RejectError(
                f"aspect mismatch {tpb_diff_pct:.1f}% (source {src_w}x{src_h} vs target {target_w}x{target_h}) -- resize would stretch; not allowed"
            )
        force_opaque = (kind == "band") or (not transparent_expected)
        if kind == "band" and tpb_diff_pct > 1.0:
            # 2026-09-18 owner decision "sky: 2" (band kind ONLY): never stretch/squash a
            # band -- bottom-aligned cover crop to the target aspect. Source taller than
            # the band: keep the full width, drop excess rows from the TOP (sky), keep
            # the bottom meadow transition. Source wider than the band: keep the full
            # height, crop the sides symmetrically. Tiles/patches/sprites unchanged.
            if raw_aspect_tpb < target_aspect_tpb:
                crop_h = max(1, round(src_w / target_aspect_tpb))
                box = (0, src_h - crop_h, src_w, src_h)
            else:
                crop_w = max(1, round(src_h * target_aspect_tpb))
                left = (src_w - crop_w) // 2
                box = (left, 0, left + crop_w, src_h)
            img = img.crop(box)
            src_w, src_h = img.size
            warnings.append(f"band aspect differs {tpb_diff_pct:.1f}% -- bottom-aligned cover crop to {src_w}x{src_h} (no stretch)")
        if kind == "patch" and not force_opaque and tpb_diff_pct > 1.0:
            # transparent patch with a slightly different aspect: contain-fit on a
            # transparent canvas (uniform scale, centred) instead of stretching.
            rgba = img.convert("RGBA")
            scale = min(target_w / src_w, target_h / src_h)
            fw, fh = max(1, round(src_w * scale)), max(1, round(src_h * scale))
            fitted = rgba.resize((fw, fh), Image.LANCZOS)
            canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
            canvas.paste(fitted, ((target_w - fw) // 2, (target_h - fh) // 2), fitted)
            warnings.append(f"patch aspect differs {tpb_diff_pct:.1f}% -- contain-fit (uniform scale), not stretched")
        else:
            canvas = resize_only(img, target_w, target_h, force_opaque)

    content_hash = sha256_of_canvas(canvas)
    if content_hash in seen_hashes:
        raise RejectError(f"duplicate of {seen_hashes[content_hash]} (identical normalized content)")

    seam_val = None
    if kind == "tile" and seam_axis:
        seam_val = seam_score(canvas, seam_axis)
        if seam_val > SEAM_MAX:
            raise RejectError(f"seam score {seam_val:.2f}/255 exceeds {SEAM_MAX} on axis={seam_axis}")

    allow_lossy = not transparent_expected
    try:
        encoded, encode_mode = encode_within_budget(canvas, max_bytes, allow_lossy)
    except ValueError as e:
        raise RejectError(str(e))

    if key in assigned_keys:
        raise RejectError(f"spec key '{key}' already accepted from {assigned_keys[key]}")

    return {
        "canvas": canvas,
        "encoded": encoded,
        "encode_mode": encode_mode,
        "content_hash": content_hash,
        "margins": margins,
        "seam": seam_val,
        "src_px": [src_w, src_h],
        "alpha_present": alpha_present,
        "warnings": warnings,
    }


def write_outputs(staging_dir, key, result):
    staging_dir.mkdir(parents=True, exist_ok=True)
    webp_path = staging_dir / f"{key}.webp"
    png_path = staging_dir / f"{key}.png"
    webp1x_path = staging_dir / f"{key}-1x.webp"

    webp_path.write_bytes(result["encoded"])
    result["canvas"].save(png_path, "PNG")
    w, h = result["canvas"].size
    half = result["canvas"].resize((max(1, w // 2), max(1, h // 2)), Image.LANCZOS)
    half.save(webp1x_path, "WEBP", lossless=True)
    return webp_path


# ── manifest update ──────────────────────────────────────────────────────────

def update_manifest(accepted, rejected, staging_dir):
    if not MANIFEST_PATH.is_file():
        print(f"WARN   manifest not found at {MANIFEST_PATH}, skipping manifest update")
        return
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    assets = manifest.get("assets", {})
    for key, info in accepted.items():
        if key not in assets:
            continue
        webp_path = staging_dir / f"{key}.webp"
        assets[key]["status"] = "staged"
        assets[key]["stagedPath"] = rel_or_abs(webp_path)
        assets[key]["sha256"] = hashlib.sha256(info["encoded"]).hexdigest()  # staged WebP file hash (what validateEnvArtManifest.mjs checks)
        assets[key]["contentHash"] = info["content_hash"]  # normalized-RGBA pixel hash (duplicate-check key, informational)
        assets[key]["bytes2x"] = len(info["encoded"])
        assets[key].pop("rejectionReasons", None)
    for key, reasons in rejected.items():
        if key in assets:
            # a rejected key must not keep staged fields from an earlier accepted run
            assets[key]["stagedPath"] = None
            assets[key]["sha256"] = None
            assets[key]["bytes2x"] = None
            assets[key].pop("contentHash", None)
        if key not in assets:
            continue
        if key in accepted:
            # Same spec key had both a rejected candidate AND a later-accepted
            # one in this run (e.g. a duplicate-of-itself fixture, or a bad
            # first attempt superseded by a good retry) -- the ACCEPTED
            # outcome wins; do not clobber its "staged" status back to
            # "rejected". Surface the rejection reasons as a note instead so
            # they aren't silently lost.
            note = f"{len(reasons)} other candidate(s) for this key were rejected in the same run: {reasons}"
            existing_notes = assets[key].get("notes") or ""
            assets[key]["notes"] = f"{existing_notes} | {note}".strip(" |")
            continue
        assets[key]["status"] = "rejected"
        assets[key]["rejectionReasons"] = reasons
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="folder of raw candidate PNG/WebP files")
    ap.add_argument("--staging", default=str(DEFAULT_STAGING), help="output staging folder (default: art-staging/batch1)")
    ap.add_argument("--spec", default=str(DEFAULT_SPEC), help="expected-file spec JSON")
    ap.add_argument("--dry-run", action="store_true", help="process + stage files but do not update env-art-manifest.json")
    ap.add_argument("--allow-partial", action="store_true", help="exit 0 even if some files were rejected")
    ap.add_argument("--clean-edges", action="store_true", help="pre-pass: set alpha<8 to 0 before cropping sprites")
    args = ap.parse_args()

    src_dir = Path(args.src)
    staging_dir = Path(args.staging)
    spec_path = Path(args.spec)

    if not src_dir.is_dir():
        print(f"ERROR  --src is not a directory: {src_dir}")
        sys.exit(1)
    if not spec_path.is_file():
        print(f"ERROR  --spec file not found: {spec_path}")
        sys.exit(1)

    with open(spec_path, "r", encoding="utf-8") as f:
        spec_doc = json.load(f)
    spec_assets = spec_doc["assets"]
    spec_keys = list(spec_assets.keys())

    raw_files = sorted(
        p for p in src_dir.iterdir()
        if p.is_file() and p.suffix.lower() in RAW_EXTENSIONS
    )

    print(f"src: {src_dir}")
    print(f"staging: {staging_dir}")
    print(f"spec: {spec_path} ({len(spec_keys)} expected keys)")
    print(f"raw files found: {len(raw_files)}\n")

    seen_hashes = {}
    assigned_keys = {}
    report_files = []
    accepted = {}
    rejected = {}

    for raw_path in raw_files:
        key = match_spec_key(raw_path.name, spec_keys)
        if key is None:
            print(f"REJECT {raw_path.name:<32} no spec key (basename does not match any expected asset_key prefix)")
            report_files.append({
                "file": raw_path.name, "matched_key": None, "status": "REJECTED",
                "reasons": ["no spec key"],
            })
            continue

        entry = spec_assets[key]
        try:
            result = process_one(raw_path, key, entry, args, seen_hashes, assigned_keys)
        except RejectError as e:
            print(f"REJECT {raw_path.name:<32} -> {key:<24} {e}")
            report_files.append({
                "file": raw_path.name, "matched_key": key, "status": "REJECTED",
                "reasons": [str(e)],
            })
            rejected.setdefault(key, []).append(str(e))
            # 2026-09-17: a key rejected in THIS run must not leave outputs from an
            # earlier accepted run behind (they would read as "staged" on disk).
            if not args.dry_run:
                for stale in (staging_dir / f"{key}.png", staging_dir / f"{key}.webp", staging_dir / f"{key}-1x.webp"):
                    if stale.exists():
                        stale.unlink()
                        print(f"         removed stale staged output {stale.name}")
            continue

        if args.dry_run:
            webp_path = staging_dir / f"{key}.webp"  # path only -- dry-run never writes staging files
        else:
            webp_path = write_outputs(staging_dir, key, result)
        seen_hashes[result["content_hash"]] = key
        assigned_keys[key] = raw_path.name
        accepted[key] = result

        status = "WARN" if result["warnings"] else "ACCEPTED"
        detail = f"src={result['src_px'][0]}x{result['src_px'][1]} out={entry['px2x'][0]}x{entry['px2x'][1]} alpha={result['alpha_present']} bytes={len(result['encoded'])}({result['encode_mode']})"
        if result["margins"]:
            m = result["margins"]
            detail += f" margins(L/T/R/B)={m['left']:.1f}%/{m['top']:.1f}%/{m['right']:.1f}%/{m['bottom']:.1f}%"
        if result["seam"] is not None:
            detail += f" seam={result['seam']:.2f}/255"
        print(f"{status:<8} {raw_path.name:<32} -> {key:<24} {detail}")
        for w in result["warnings"]:
            print(f"  WARN   {w}")

        report_files.append({
            "file": raw_path.name,
            "matched_key": key,
            "status": status,
            "reasons": result["warnings"],
            "source_px": result["src_px"],
            "output_px": list(entry["px2x"]),
            "alpha": result["alpha_present"],
            "margins": result["margins"],
            "seam": result["seam"],
            "bytes2x": len(result["encoded"]),
            "encoding": result["encode_mode"],
            "sha256": hashlib.sha256(result["encoded"]).hexdigest(),
            "contentHash": result["content_hash"],
            "stagedPath": rel_or_abs(webp_path),
        })

    reject_count = sum(1 for f in report_files if f["status"] == "REJECTED")
    accept_count = sum(1 for f in report_files if f["status"] in ("ACCEPTED", "WARN"))
    print(f"\n{len(report_files)} raw file(s) processed -- accepted {accept_count}, rejected {reject_count}")

    report = {
        "generated": "ingest.py run",
        "src": str(src_dir),
        "staging": str(staging_dir),
        "spec": str(spec_path),
        "dry_run": args.dry_run,
        "allow_partial": args.allow_partial,
        "clean_edges": args.clean_edges,
        "files": report_files,
        "summary": {"accepted": accept_count, "rejected": reject_count, "total": len(report_files)},
    }
    staging_dir.mkdir(parents=True, exist_ok=True)
    with open(staging_dir / "ingest-report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        f.write("\n")

    if args.dry_run:
        print("\n--dry-run: env-art-manifest.json NOT updated")
    else:
        update_manifest(accepted, rejected, staging_dir)
        print(f"\nmanifest updated: {MANIFEST_PATH.relative_to(ROOT)}")

    if reject_count > 0 and not args.allow_partial:
        sys.exit(1)


if __name__ == "__main__":
    main()
