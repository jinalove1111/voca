#!/usr/bin/env python
"""
stripCheckerboard.py

Converts an RGB PNG whose "transparent" areas were exported as a baked-in
(and slightly blurred/JPEG-noisy) white/light-grey checkerboard into a true
RGBA PNG, preserving the artwork pixels EXACTLY (no recolor, no resample,
no redesign) and turning only the background checkerboard transparent.

Algorithm (see PROJECT task notes for the full rationale):
  1. A pixel is "checker-like" iff chroma = max(r,g,b) - min(r,g,b) is <=
     --chroma-max AND min(r,g,b) >= --luma-min. Both are near-neutral,
     near-white/light-grey tests tuned for a soft/blurred checkerboard.
  2. "Background" = the set of checker-like pixels 4-connected to the image
     border (flood fill from every border pixel, explicit stack, no
     recursion). Interior grey rocks / white flowers are NOT connected to
     the border through checker-like pixels (the artwork outline breaks the
     chain), so they survive as opaque artwork even though they may
     individually pass the checker-like color test.
  3. Anything checker-like that the flood fill did NOT reach is treated as
     artwork (kept fully opaque) -- this is what "closes" small enclosed
     checker-colored holes inside the artwork.
  4. Edge treatment: alpha = 255 for interior artwork, alpha = 0 for
     background, and a single-pixel boundary ring (an artwork pixel with at
     least one background/out-of-bounds 4-neighbor) is set to alpha = 128 so
     the cut edge is not razor-hard at mobile scale. RGB values are never
     touched for any pixel that stays visible (alpha > 0); fully transparent
     pixels get RGB reset to (0,0,0) purely so the RGBA PNG/WebP compresses
     smaller (they are invisible either way).
  5. Saved as an RGBA PNG, same basename, in --out.

Numpy (if importable) is used ONLY to vectorize step 1's per-pixel chroma/
luma test, which is an embarrassingly parallel elementwise computation. The
flood fill (step 2) and connected-component labeling (used for the report
only) always operate on a plain Python bytearray mask via explicit
stack-based traversal, so the tool's *correctness* never depends on numpy
being installed. If numpy is not importable, step 1 falls back to a pure
Python loop over Image.getdata().

CLI:
    python scripts/town-art/stripCheckerboard.py --src <dir-or-file> --out <dir> \
        [--chroma-max 14] [--luma-min 185] [--dry-run]

Run this BEFORE ingest.py whenever the raw export is RGB with a baked-in
checkerboard instead of real alpha. See README.md's "RGB export with baked
checkerboard" section.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:  # pragma: no cover - exercised only when numpy is absent
    HAVE_NUMPY = False


def find_png_files(src: Path) -> list[Path]:
    if src.is_file():
        return [src]
    return sorted(p for p in src.iterdir() if p.is_file() and p.suffix.lower() == ".png")


def compute_checker_mask(pixels, width: int, height: int, chroma_max: int, luma_min: int) -> bytearray:
    """Return a flat bytearray (len == width*height, row-major) where 1 means
    the pixel is checker-like (near-neutral, near-white/light-grey)."""
    n = width * height
    if HAVE_NUMPY:
        arr = np.asarray(pixels, dtype=np.int16)  # pixels is an (h, w, 3) array here
        r = arr[:, :, 0]
        g = arr[:, :, 1]
        b = arr[:, :, 2]
        mx = np.maximum(np.maximum(r, g), b)
        mn = np.minimum(np.minimum(r, g), b)
        chroma = mx - mn
        mask_bool = (chroma <= chroma_max) & (mn >= luma_min)
        return bytearray(mask_bool.astype(np.uint8).tobytes())
    # Pure-Python fallback: pixels is a flat list of (r, g, b) tuples from getdata()
    mask = bytearray(n)
    for i, (r, g, b) in enumerate(pixels):
        mx = r if r >= g else g
        mx = mx if mx >= b else b
        mn = r if r <= g else g
        mn = mn if mn <= b else b
        if (mx - mn) <= chroma_max and mn >= luma_min:
            mask[i] = 1
    return mask


def flood_fill_background(checker_mask: bytearray, width: int, height: int) -> bytearray:
    """4-connected flood fill of checker-like pixels starting from every
    border pixel. Returns a bytearray (1 = background) of len width*height."""
    n = width * height
    visited = bytearray(n)
    background = bytearray(n)
    stack: list[int] = []

    def seed(i: int) -> None:
        if checker_mask[i] and not visited[i]:
            visited[i] = 1
            stack.append(i)

    for x in range(width):
        seed(x)  # top row
        seed((height - 1) * width + x)  # bottom row
    for y in range(height):
        seed(y * width)  # left col
        seed(y * width + (width - 1))  # right col

    while stack:
        i = stack.pop()
        background[i] = 1
        x = i % width
        y = i // width
        if x > 0:
            j = i - 1
            if checker_mask[j] and not visited[j]:
                visited[j] = 1
                stack.append(j)
        if x < width - 1:
            j = i + 1
            if checker_mask[j] and not visited[j]:
                visited[j] = 1
                stack.append(j)
        if y > 0:
            j = i - width
            if checker_mask[j] and not visited[j]:
                visited[j] = 1
                stack.append(j)
        if y < height - 1:
            j = i + width
            if checker_mask[j] and not visited[j]:
                visited[j] = 1
                stack.append(j)

    return background


def label_components(mask: bytearray, width: int, height: int, min_size: int = 1) -> list[int]:
    """4-connected component sizes for a boolean bytearray mask."""
    n = width * height
    visited = bytearray(n)
    sizes: list[int] = []
    for start in range(n):
        if not mask[start] or visited[start]:
            continue
        visited[start] = 1
        stack = [start]
        size = 0
        while stack:
            i = stack.pop()
            size += 1
            x = i % width
            y = i // width
            if x > 0:
                j = i - 1
                if mask[j] and not visited[j]:
                    visited[j] = 1
                    stack.append(j)
            if x < width - 1:
                j = i + 1
                if mask[j] and not visited[j]:
                    visited[j] = 1
                    stack.append(j)
            if y > 0:
                j = i - width
                if mask[j] and not visited[j]:
                    visited[j] = 1
                    stack.append(j)
            if y < height - 1:
                j = i + width
                if mask[j] and not visited[j]:
                    visited[j] = 1
                    stack.append(j)
        if size >= min_size:
            sizes.append(size)
    return sizes


def build_alpha_and_bbox(artwork: bytearray, width: int, height: int):
    """Single pass: alpha channel (255 interior / 128 boundary ring / 0
    background) plus the bbox of all alpha>0 pixels."""
    n = width * height
    alpha = bytearray(n)
    min_x = min_y = None
    max_x = max_y = None
    for i in range(n):
        if not artwork[i]:
            continue
        x = i % width
        y = i // width
        interior = True
        if x == 0 or not artwork[i - 1]:
            interior = False
        elif x == width - 1 or not artwork[i + 1]:
            interior = False
        elif y == 0 or not artwork[i - width]:
            interior = False
        elif y == height - 1 or not artwork[i + width]:
            interior = False
        alpha[i] = 255 if interior else 128
        if min_x is None or x < min_x:
            min_x = x
        if max_x is None or x > max_x:
            max_x = x
        if min_y is None or y < min_y:
            min_y = y
        if max_y is None or y > max_y:
            max_y = y
    return alpha, (min_x, min_y, max_x, max_y)


def process_file(path: Path, out_dir: Path, chroma_max: int, luma_min: int, dry_run: bool) -> bool:
    """Returns True on success."""
    try:
        img = Image.open(path).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] {path.name}: could not open ({exc})")
        return False

    width, height = img.size
    n = width * height

    if HAVE_NUMPY:
        pixel_source = np.asarray(img)  # (h, w, 3) uint8
        flat_rgb = list(img.getdata())  # needed later to build RGBA output
    else:
        flat_rgb = list(img.getdata())
        pixel_source = flat_rgb

    checker_mask = compute_checker_mask(pixel_source, width, height, chroma_max, luma_min)
    background = flood_fill_background(checker_mask, width, height)
    artwork = bytearray(n)
    for i in range(n):
        artwork[i] = 0 if background[i] else 1

    alpha, (min_x, min_y, max_x, max_y) = build_alpha_and_bbox(artwork, width, height)

    component_sizes = label_components(artwork, width, height, min_size=50)
    component_sizes.sort(reverse=True)

    bg_count = sum(background)
    bg_pct = 100.0 * bg_count / n

    print(f"[{path.name}]")
    print(f"  size: {width}x{height}")
    print(f"  background: {bg_count}/{n} px ({bg_pct:.2f}%)")
    print(f"  artwork components >=50px: {len(component_sizes)} (sizes: {component_sizes[:10]})")
    if min_x is None:
        print("  bbox: NONE (no opaque pixels found)")
        print("  WARNING: no opaque artwork pixels detected at all")
    else:
        print(f"  bbox: x[{min_x},{max_x}] y[{min_y},{max_y}] (of {width}x{height})")
        touches_edge = min_x == 0 or min_y == 0 or max_x == width - 1 or max_y == height - 1
        if touches_edge:
            print("  WARNING: artwork bbox touches an image edge (artwork may be clipped)")
    if bg_pct < 5.0:
        print("  WARNING: background % < 5% (flood fill likely failed to reach the checkerboard)")

    if dry_run:
        print("  (dry-run: no files written)")
        return True

    out_dir.mkdir(parents=True, exist_ok=True)
    out_data = []
    for i in range(n):
        a = alpha[i]
        if a == 0:
            out_data.append((0, 0, 0, 0))
        else:
            r, g, b = flat_rgb[i]
            out_data.append((r, g, b, a))

    out_img = Image.new("RGBA", (width, height))
    out_img.putdata(out_data)
    out_path = out_dir / path.name
    out_img.save(out_path, "PNG")
    print(f"  -> wrote {out_path}")

    # 25%-scale contact preview composited over solid magenta, for eyeballing
    # the boundary quality. NOT an input to anything downstream.
    magenta_bg = Image.new("RGB", (width, height), (255, 0, 255))
    magenta_bg.paste(out_img, mask=out_img.split()[3])
    preview_size = (max(1, width // 4), max(1, height // 4))
    preview = magenta_bg.resize(preview_size, Image.LANCZOS)
    check_path = out_dir / f"{path.stem}-check.png"
    preview.save(check_path, "PNG")
    print(f"  -> wrote {check_path} (25% magenta contact preview)")

    return True


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", required=True, help="A single PNG file or a directory of PNG files")
    parser.add_argument("--out", required=True, help="Output directory for the RGBA PNGs")
    parser.add_argument("--chroma-max", type=int, default=14, help="max(r,g,b)-min(r,g,b) threshold (default 14)")
    parser.add_argument("--luma-min", type=int, default=185, help="min(r,g,b) threshold (default 185)")
    parser.add_argument("--dry-run", action="store_true", help="Compute and print stats only; write nothing")
    args = parser.parse_args(argv)

    src = Path(args.src)
    out_dir = Path(args.out)

    if not src.exists():
        print(f"ERROR: --src path does not exist: {src}")
        return 1

    files = find_png_files(src)
    if not files:
        print(f"ERROR: no .png files found at {src}")
        return 1

    print(f"numpy available: {HAVE_NUMPY}")
    print(f"chroma-max={args.chroma_max} luma-min={args.luma_min} dry-run={args.dry_run}")
    print(f"processing {len(files)} file(s) -> {out_dir}")
    print()

    ok = True
    for f in files:
        success = process_file(f, out_dir, args.chroma_max, args.luma_min, args.dry_run)
        ok = ok and success
        print()

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
