"""Build optimized WebP object pictures from the operator's 151 PNGs (pics2).

Run: python scripts/pictureWords/buildPictureWords.py [--root DIR]   (idempotent)
Env: PICTURE_WORDS_ROOT overrides the Dropbox default.
Originals are only read. Output goes ONLY to src/assets/pictureWords/.
Each image: alpha-trim, 2% pad, fit 256x256, WebP q82 -> stepwise down (then shrink) until <= 40 KB. 1x only.
"""
import argparse, json, os, re, sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = (HERE.parents[1] / "src" / "assets" / "pictureWords").resolve()
BASE = r"C:\Users\jinal\Dropbox\PC (4)\pics2"
BUDGET = 40 * 1024
KOREAN = {"양배추": "kr-cabbage", "현미경": "kr-microscope"}

ap = argparse.ArgumentParser()
ap.add_argument("--root", default=os.environ.get("PICTURE_WORDS_ROOT", BASE))
root = Path(ap.parse_args().root)

rows = json.loads((HERE / "source" / "verdicts.json").read_text(encoding="utf-8"))
missing = [r["file"] for r in rows if not (root / r["file"]).is_file()]
if missing:
    sys.exit("missing sources:\n  " + "\n  ".join(missing))


def slug(stem):
    if stem in KOREAN:
        return KOREAN[stem]
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]", "-", stem.lower())).strip("-")


def encode(im, path):
    """Lower quality stepwise (>=60), then shrink 10% steps, until under budget."""
    while True:
        for q in (82, 78, 74, 70, 66, 62, 60):
            im.save(path, "WEBP", quality=q, method=6, alpha_quality=90)
            if path.stat().st_size <= BUDGET:
                return im
        im = im.resize((max(1, round(im.width * 0.9)), max(1, round(im.height * 0.9))), Image.LANCZOS)


used, assets = set(), {}
for r in rows:
    stem = r["file"][:-4]
    a = base = slug(stem)
    n = 2
    while a in used:
        a, n = f"{base}-{n}", n + 1
    used.add(a)
    im = Image.open(root / r["file"]).convert("RGBA")
    bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        sys.exit(f"fully transparent: {r['file']}")
    crop = im.crop(bbox)
    pad = round(max(crop.size) * 0.02)
    cv = Image.new("RGBA", (crop.width + 2 * pad, crop.height + 2 * pad), (0, 0, 0, 0))
    cv.paste(crop, (pad, pad))
    s = min(1.0, 256 / max(cv.size))
    cv = cv.resize((max(1, round(cv.width * s)), max(1, round(cv.height * s))), Image.LANCZOS)
    p = OUT / f"{a}.webp"
    p.parent.mkdir(parents=True, exist_ok=True)
    cv = encode(cv, p)
    assets[r["id"]] = {"asset": a, "w": cv.width, "h": cv.height, "bytes": p.stat().st_size, "sourceFile": r["file"]}

keep = {v["asset"] + ".webp" for v in assets.values()}
for f in OUT.glob("*.webp"):
    if f.name not in keep:
        f.unlink()
tb = sum(v["bytes"] for v in assets.values())
manifest = {"assets": dict(sorted(assets.items())),
            "totals": {"count": len(assets), "bytes": tb, "maxBytes": max(v["bytes"] for v in assets.values())}}
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{len(assets)} webp, {tb} bytes total, max {manifest['totals']['maxBytes']}")
