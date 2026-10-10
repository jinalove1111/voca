"""Build optimized WebP town art kit from the operator's PNG originals.

Run: python scripts/town/buildTownKit.py [--root DIR] [--dl DIR]   (idempotent)
Env: TOWN_KIT_ROOT / TOWN_KIT_DL override the Dropbox defaults.
Originals are only read. Output goes ONLY to src/assets/town/kit/.
Sprites: alpha-trim, 2% pad, <=256 (1x) / <=512 (2x) longest side, q82 -> stepwise 70 if over budget.
Backdrops (backgrounds/*): 768 / 1536 wide, RGB, q80 -> stepwise 70.
"""
import argparse, json, os, sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = (HERE.parents[1] / "src" / "assets" / "town" / "kit").resolve()
BASE = r"C:\Users\jinal\Dropbox\PC (4)"
SPRITE_BUDGET = (40 * 1024, 120 * 1024)
BACKDROP_BUDGET = (90 * 1024, 260 * 1024)
SKIP = {"character/paul-portrait": "portrait of a person - operator confirmation pending"}
EDGE_PX = 12

ap = argparse.ArgumentParser()
ap.add_argument("--root", default=os.environ.get("TOWN_KIT_ROOT", BASE))
ap.add_argument("--dl", default=os.environ.get("TOWN_KIT_DL", BASE + r"\Downloads"))
args = ap.parse_args()
DIRS = {"root": Path(args.root), "dl": Path(args.dl)}

rows = []
for line in (HERE / "kit_map.tsv").read_text(encoding="utf-8").splitlines():
    if not line.strip() or line.startswith("#"):
        continue
    src, name, target, place, use = line.split("\t")
    rows.append((src, name, target, place, use))

missing = [f"{DIRS[s] / (n + '.png')}" for s, n, t, _, _ in rows if t not in SKIP and not (DIRS[s] / (n + ".png")).is_file()]
if missing:
    sys.exit("missing sources:\n  " + "\n  ".join(missing))


def save(im, path, q, alpha):
    path.parent.mkdir(parents=True, exist_ok=True)
    kw = dict(quality=q, method=6)
    if alpha:
        kw["alpha_quality"] = 90
    im.save(path, "WEBP", **kw)
    return path.stat().st_size


def fit(im, limit):
    s = min(1.0, limit / max(im.size))
    if s >= 1.0:
        return im
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def encode(im1, im2, p1, p2, q0, budget, alpha, flags):
    """Lower quality stepwise (never below 70) until both files meet budget."""
    q = q0
    while True:
        b1, b2 = save(im1, p1, q, alpha), save(im2, p2, q, alpha)
        if (b1 <= budget[0] and b2 <= budget[1]) or q <= 70:
            break
        q = max(70, q - 4)
    if q != q0:
        flags.append(f"lowered-quality:{q}")
    if b1 > budget[0] or b2 > budget[1]:
        flags.append("over-budget")
    return q, b1, b2


targets = {}
for src, name, target, place, use in rows:
    ent = {"target": target, "sourceFile": name + ".png", "place": place, "use": use}
    if target in SKIP:
        ent.update(skipped=True, reason=SKIP[target])
        targets[target] = ent
        continue
    flags = []
    im = Image.open(DIRS[src] / (name + ".png"))
    p1, p2 = OUT / f"{target}.webp", OUT / f"{target}@2x.webp"
    if target.startswith("backgrounds/"):
        im = im.convert("RGB")
        w = 768
        im1 = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im2 = im.resize((w * 2, round(im.height * w * 2 / im.width)), Image.LANCZOS)
        q, b1, b2 = encode(im1, im2, p1, p2, 80, BACKDROP_BUDGET, False, flags)
        alpha = False
    else:
        alpha = "A" in im.getbands()
        if not alpha:
            flags.append("no-alpha-channel")
        im = im.convert("RGBA")
        a = im.getchannel("A").point(lambda v: 255 if v > 8 else 0)
        bbox = a.getbbox()
        if not bbox:
            sys.exit(f"fully transparent: {name}")
        W, H = im.size
        # edge-touch / opaque corners measured on the ORIGINAL canvas
        if any(a.getpixel(c) for c in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1))):
            flags.append("opaque-corner")
        edges = {
            "top": a.crop((0, 0, W, 1)), "bottom": a.crop((0, H - 1, W, H)),
            "left": a.crop((0, 0, 1, H)), "right": a.crop((W - 1, 0, W, H)),
        }
        for side, e in edges.items():
            if e.histogram()[255] > EDGE_PX:
                flags.append(f"touches-edge:{side}")
        crop = im.crop(bbox)
        pad = round(max(crop.size) * 0.02)
        cv = Image.new("RGBA", (crop.width + 2 * pad, crop.height + 2 * pad), (0, 0, 0, 0))
        cv.paste(crop, (pad, pad))
        im1, im2 = fit(cv, 256), fit(cv, 512)
        q, b1, b2 = encode(im1, im2, p1, p2, 82, SPRITE_BUDGET, True, flags)
        alpha = True
    ent.update(alpha=alpha, w=im1.width, h=im1.height, w2x=im2.width, h2x=im2.height,
               bytes=b1, bytes2x=b2, quality=q, flags=sorted(flags))
    targets[target] = ent

done = [t for t in targets.values() if not t.get("skipped")]
manifest = {
    "targets": dict(sorted(targets.items())),
    "totals": {
        "count": len(targets), "built": len(done), "skipped": len(targets) - len(done),
        "bytes": sum(t["bytes"] for t in done), "bytes2x": sum(t["bytes2x"] for t in done),
    },
}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"built {len(done)} skipped {manifest['totals']['skipped']} bytes {manifest['totals']['bytes']} + 2x {manifest['totals']['bytes2x']}")
for t in done:
    if t["flags"]:
        print(f"  FLAG {t['target']}: {', '.join(t['flags'])}")
