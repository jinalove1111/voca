#!/usr/bin/env python3
"""processBatch1.py — Paul Town environment art Batch 1 processing pipeline.

Design tooling only (docs/design/town/mockup/batch1/). Not wired into the
app, not a build step, not registered anywhere — it only prepares files for
manual drop-in review via paul-town-lv4-recompose-batch1.html.

Usage:
    python processBatch1.py --src <folder of raw PNGs>

Reads every *.png in --src, matches each to one of the BATCH1_SPEC expected
filenames (docs/design/town/ENV_ART_BATCH1_HANDOFF_2026-09-17.md §1) by
case-insensitive basename prefix, and writes a processed 2x .webp (lossless)
+ .png into this folder (docs/design/town/mockup/batch1/), matching the
target canvas size from the handoff table.

Three processing categories (per the handoff spec):
  - tiles (grass-base, path-straight, river-straight): resize to target
    WITHOUT cropping; report a seam score (mean abs diff between the
    left/right edge columns and top/bottom edge rows) — informational only,
    never fails the run.
  - sprites (transparent YES, everything else): crop to the alpha bounding
    box, proportionally contain-fit into the target canvas with >=5% margin
    on every side, bottom-center anchored, pasted onto a transparent canvas.
  - patches/scatters/highlight (grass-patch-*, wildflower-scatter,
    river-highlight): resize to target WITHOUT cropping (they are feathered
    overlays already designed to fill their canvas).

Any file whose PNG has no alpha channel (mode not in RGBA/LA/PA) when the
spec says transparent YES is skipped with a REJECT line — never silently
processed as opaque.

No external dependencies beyond Pillow (already installed on this machine,
CLAUDE.md rule 6 — do not pip install anything).
"""

import argparse
import sys
from pathlib import Path

from PIL import Image

OUT_DIR = Path(__file__).resolve().parent

# ── Batch 1 expected files (asset_key -> spec) ──────────────────────────────
# px = target 2x canvas (w, h); transparent = handoff §1 "transparent" column;
# category = tile | sprite | patch (drives processing rule, see module docstring).

TILE_KEYS = {"grass-base", "path-straight", "river-straight"}
PATCH_KEYS = {"grass-patch-light", "grass-patch-dark", "grass-patch-worn", "wildflower-scatter", "river-highlight", "sky-hills"}

# 2026-09-17 — extended to match the recompose harness's authoritative
# EXPECTED_KEYS list (docs/design/town/mockup/paul-town-lv4-recompose-batch1.html,
# derived from what it actually places) after the §1.9 visual-target
# reconciliation. Keep this dict, the harness's BATCH1_FILES manifest and
# batch1/README.md in sync — see the README's 2026-09-17 update note.
BATCH1_SPEC = {
    "sky-hills": (1024, 260, False),
    "grass-base": (512, 512, False),
    "grass-patch-light": (400, 280, True),
    "grass-patch-dark": (400, 280, True),
    "grass-patch-worn": (400, 200, True),
    "wildflower-scatter": (320, 240, True),
    "path-straight": (256, 256, True),
    "path-straight-narrow": (256, 256, True),
    "path-curve-gentle": (256, 256, True),
    "path-curve-strong": (256, 256, True),
    "path-fork": (256, 256, True),
    "path-junction": (256, 256, True),
    "path-end": (256, 160, True),
    "path-end-entrance": (256, 176, True),
    "fence-straight": (256, 96, True),
    "fence-straight-short": (128, 96, True),
    "fence-corner": (128, 128, True),
    "fence-post": (64, 112, True),
    "fence-gate": (192, 128, True),
    "fence-gate-closed": (192, 128, True),
    "hedge-straight": (256, 128, True),
    "hedge-straight-tall": (256, 160, True),
    "hedge-end": (128, 128, True),
    "hedge-corner": (128, 128, True),
    "shrub-round": (160, 128, True),
    "shrub-round-small": (128, 96, True),
    "shrub-wide": (224, 112, True),
    "flower-cluster-pink": (160, 112, True),
    "flower-cluster-yellow": (160, 112, True),
    "flower-cluster-mixed": (192, 112, True),
    "flower-bed-border": (320, 112, True),
    "flower-pot": (128, 128, True),
    "flower-pot-tall": (128, 128, True),
    "river-straight": (256, 256, True),
    "river-bend": (256, 256, True),
    "river-highlight": (256, 128, True),
    "riverbank-reeds": (192, 96, True),
    "riverbank-reeds-stones": (192, 96, True),
}

MARGIN_RATIO = 0.05  # >=5% margin on every side for sprites, per the handoff self-check line


def category_of(key):
    if key in TILE_KEYS:
        return "tile"
    if key in PATCH_KEYS:
        return "patch"
    return "sprite"


def find_matches(src_dir):
    """Match every *.png in src_dir to an expected key by case-insensitive
    basename prefix. Longest-prefix wins on ambiguity (e.g. 'path-straight'
    must not swallow a file actually meant for a longer key that happens to
    share a shorter common prefix — there are none among the BATCH1_SPEC keys today,
    but the rule is kept general on purpose)."""
    raw_files = sorted([p for p in src_dir.iterdir() if p.is_file() and p.suffix.lower() == ".png"])
    keys_by_len = sorted(BATCH1_SPEC.keys(), key=len, reverse=True)
    matches = {}  # key -> list of candidate paths
    unmatched = []
    for raw in raw_files:
        base = raw.stem.lower()
        found = None
        for key in keys_by_len:
            if base.startswith(key.lower()):
                found = key
                break
        if found:
            matches.setdefault(found, []).append(raw)
        else:
            unmatched.append(raw)
    return matches, unmatched


def seam_score(img):
    """Mean abs RGB difference between left/right edge columns and
    top/bottom edge rows. Informational only — never fails the run."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    lr = sum(sum(abs(a - b) for a, b in zip(px[0, y], px[w - 1, y])) / 3 for y in range(h)) / max(h, 1)
    tb = sum(sum(abs(a - b) for a, b in zip(px[x, 0], px[x, h - 1])) / 3 for x in range(w)) / max(w, 1)
    return lr, tb


def process_tile(img, target_w, target_h):
    out = img.convert("RGBA" if img.mode in ("RGBA", "LA", "PA") else "RGB")
    out = out.resize((target_w, target_h), Image.LANCZOS)
    lr, tb = seam_score(out)
    return out, {"seam_lr": lr, "seam_tb": tb}


def process_patch(img, target_w, target_h):
    out = img.convert("RGBA")
    out = out.resize((target_w, target_h), Image.LANCZOS)
    return out, {}


def process_sprite(img, target_w, target_h):
    rgba = img.convert("RGBA")
    bbox = rgba.split()[-1].getbbox()
    if bbox is None:
        raise ValueError("fully transparent — no alpha content to crop to")
    cropped = rgba.crop(bbox)
    cw, ch = cropped.size

    margin_w = target_w * MARGIN_RATIO
    margin_h = target_h * MARGIN_RATIO
    avail_w = target_w - 2 * margin_w
    avail_h = target_h - 2 * margin_h
    scale = min(avail_w / cw, avail_h / ch)
    new_w = max(1, round(cw * scale))
    new_h = max(1, round(ch * scale))
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    x = (target_w - new_w) // 2
    y = target_h - round(margin_h) - new_h  # bottom-center anchor, >=5% bottom margin by construction
    canvas.paste(resized, (x, y), resized)

    margins = {
        "left": x / target_w * 100,
        "right": (target_w - x - new_w) / target_w * 100,
        "top": y / target_h * 100,
        "bottom": (target_h - y - new_h) / target_h * 100,
    }
    return canvas, {"margins": margins}


def main():
    ap = argparse.ArgumentParser(description="Process raw Batch 1 PNGs into 2x webp/png in docs/design/town/mockup/batch1/")
    ap.add_argument("--src", required=True, help="folder of raw PNG candidates")
    args = ap.parse_args()

    src_dir = Path(args.src)
    if not src_dir.is_dir():
        print(f"ERROR  --src is not a directory: {src_dir}")
        sys.exit(1)

    matches, unmatched = find_matches(src_dir)

    print(f"src: {src_dir}")
    print(f"out: {OUT_DIR}")
    print(f"expected keys: {len(BATCH1_SPEC)}  matched: {len(matches)}  unmatched raw files: {len(unmatched)}\n")

    processed = 0
    rejected = 0
    skipped = 0

    for key in sorted(BATCH1_SPEC.keys()):
        target_w, target_h, transparent_expected = BATCH1_SPEC[key]
        cat = category_of(key)
        candidates = matches.get(key)
        if not candidates:
            print(f"SKIP   {key:<24} no matching raw file found")
            skipped += 1
            continue
        if len(candidates) > 1:
            print(f"NOTE   {key:<24} {len(candidates)} candidate raw files matched — using {candidates[0].name}, ignoring {[c.name for c in candidates[1:]]}")
        raw_path = candidates[0]

        try:
            img = Image.open(raw_path)
            img.load()
        except Exception as e:
            print(f"REJECT {key:<24} could not open {raw_path.name}: {e}")
            rejected += 1
            continue

        src_w, src_h = img.size
        has_alpha = img.mode in ("RGBA", "LA", "PA")

        if transparent_expected and not has_alpha:
            print(f"REJECT {key:<24} spec requires transparent=YES but {raw_path.name} has mode={img.mode} (no alpha channel)")
            rejected += 1
            continue

        try:
            if cat == "tile":
                out, info = process_tile(img, target_w, target_h)
            elif cat == "patch":
                out, info = process_patch(img, target_w, target_h)
            else:
                out, info = process_sprite(img, target_w, target_h)
        except Exception as e:
            print(f"REJECT {key:<24} processing failed for {raw_path.name}: {e}")
            rejected += 1
            continue

        webp_path = OUT_DIR / f"{key}.webp"
        png_path = OUT_DIR / f"{key}.png"
        out.save(webp_path, "WEBP", lossless=True)
        out.save(png_path, "PNG")

        alpha_str = "YES" if has_alpha else "NO"
        detail = f"src={src_w}x{src_h} out={target_w}x{target_h} alpha={alpha_str}"
        if cat == "tile":
            detail += f" seam_lr={info['seam_lr']:.2f} seam_tb={info['seam_tb']:.2f}"
        elif cat == "sprite":
            m = info["margins"]
            detail += f" margins(L/T/R/B)={m['left']:.1f}%/{m['top']:.1f}%/{m['right']:.1f}%/{m['bottom']:.1f}%"
        print(f"OK     {key:<24} {detail}")
        processed += 1

    if unmatched:
        print("\nunmatched raw files (no expected key prefix matched):")
        for u in unmatched:
            print(f"  - {u.name}")

    print(f"\nprocessed={processed} rejected={rejected} skipped={skipped} (expected total={len(BATCH1_SPEC)})")


if __name__ == "__main__":
    main()
