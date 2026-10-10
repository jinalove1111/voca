"""Build 256x256 hat PNGs from the operator's 1254x1254 originals.

Run: python scripts/hats/buildHatAssets.py   (idempotent)
Originals are copied to art-staging/hats/original/ (gitignored -> local backup only).
"""
import json, shutil, sys
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\jinal\Dropbox\PC (4)\Downloads")
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "assets" / "hats"
BACKUP = ROOT / "art-staging" / "hats" / "original"
SIZE, MARGIN_PCT, MAX_BYTES = 256, 6, 48 * 1024
COLORS = ["navy", "green", "pink", "gold", "blue", "purple", "red", "orange"]  # 모자1..8

OUT.mkdir(parents=True, exist_ok=True)
BACKUP.mkdir(parents=True, exist_ok=True)
manifest = {"generatedFrom": [], "size": SIZE, "marginPct": MARGIN_PCT, "hats": {}}

for i, color in enumerate(COLORS, 1):
    name = f"모자{i}.png"
    src = SRC / name
    if not src.exists():
        sys.exit(f"missing source: {name}")
    manifest["generatedFrom"].append(name)
    shutil.copyfile(src, BACKUP / f"paul-hat-{color}.png")
    im = Image.open(src).convert("RGBA")
    bbox = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    crop = im.crop(bbox)
    side = max(crop.size)
    margin = round(side * MARGIN_PCT / 100)
    canvas_side = side + 2 * margin
    canvas = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
    canvas.paste(crop, ((canvas_side - crop.width) // 2, (canvas_side - crop.height) // 2))
    out = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    dest = OUT / f"paul-hat-{color}.png"
    out.save(dest, optimize=True)
    if dest.stat().st_size > MAX_BYTES:
        q = out.quantize(colors=256, method=Image.Quantize.FASTOCTREE).convert("RGBA")
        tmp = OUT / f".tmp-{color}.png"
        q.save(tmp, optimize=True)
        if tmp.stat().st_size < dest.stat().st_size:
            tmp.replace(dest)
        else:
            tmp.unlink()
    final = Image.open(dest).convert("RGBA")
    alpha = final.getchannel("A")
    opaque = alpha.point(lambda a: 255 if a > 8 else 0).histogram()[255] / (SIZE * SIZE)
    manifest["hats"][color] = {
        "file": dest.name, "bytes": dest.stat().st_size,
        "width": final.width, "height": final.height,
        "alphaBbox": list(alpha.point(lambda a: 255 if a > 8 else 0).getbbox()),
        "cornerAlpha": alpha.getpixel((0, 0)), "opaqueRatio": round(opaque, 4),
    }

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"{'color':8} {'file':22} {'bytes':>7} {'size':>9} {'opaque':>7} bbox")
for c, h in manifest["hats"].items():
    print(f"{c:8} {h['file']:22} {h['bytes']:>7} {h['width']}x{h['height']:>4} {h['opaqueRatio']:>7} {h['alphaBbox']}")
