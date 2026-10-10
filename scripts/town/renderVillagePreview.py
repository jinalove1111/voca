"""Grammar Village placement preview (QA aid, not shipped). Network 0.
Reads the same data as the app (src/utils/grammar/village.js, exported to JSON via node) and composes every district at 720 px width
with kit @2x art at the given anchors. Place tap boxes are outlined (red = has missions, orange = soon) with the place id.
Usage: python scripts/town/renderVillagePreview.py [outDir]
Writes <outDir>/<district>.png and <outDir>/sheet.png (all districts side by side, each 360 px wide).
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / "src/assets/town/kit"
DEFAULT_OUT = Path(r"C:\Users\jinal\AppData\Local\Temp\claude\C--voca\4dd777a3-9f93-4c78-a984-4f4ee328e279\scratchpad\townimg\village")
W = 720
LABEL = 5  # width-units reserved under a place for its name label (matches scripts/testGrammarVillage.mjs)
BAND = {"path": (214, 196, 150), "water": (120, 178, 214)}


def load_data():
    js = "import('./src/utils/grammar/village.js').then(m=>console.log(JSON.stringify(m.VILLAGE_DISTRICTS)))"
    out = subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True).stdout
    return json.loads(out)


def font(size):
    for f in ("malgun.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def art(target):
    return Image.open(KIT / f"{target}@2x.webp").convert("RGBA")


def render(d):
    H = round(W / d["aspect"])
    img = Image.new("RGBA", (W, H), hexrgb(d["ground"]) + (255,))
    if d["backdrop"]:  # object-fit: cover, centred horizontally, top-aligned
        bg = art(d["backdrop"])
        sc = max(W / bg.width, H / bg.height)
        bg = bg.resize((round(bg.width * sc), round(bg.height * sc)))
        img.paste(bg.crop(((bg.width - W) // 2, 0, (bg.width - W) // 2 + W, H)), (0, 0))
    dr = ImageDraw.Draw(img)
    for b in d["bands"]:
        dr.rectangle([0, H * b["y"] / 100, W, H * (b["y"] + b["h"]) / 100], fill=BAND[b["kind"]])
    items = [("place", p) for p in d["places"]] + [("decor", p) for p in d["decor"]]
    items.sort(key=lambda it: it[1]["y"])
    boxes = []
    for kind, it in items:
        a = art(it["art"])
        pw = round(it["w"] * W / 100)
        ph = round(pw * a.height / a.width)
        a = a.resize((pw, ph), Image.LANCZOS)
        ax, ay = it["x"] * W / 100, it["y"] * H / 100
        img.alpha_composite(a, (round(ax - pw / 2), round(ay - ph)))
        boxes.append((kind, it, ax - pw / 2, ay - ph, ax + pw / 2, ay))
    f, fs = font(15), font(12)
    for kind, it, x0, y0, x1, y1 in boxes:
        if kind != "place":
            continue
        col = (220, 40, 40) if it["unitIds"] else (235, 140, 20)
        dr.rectangle([x0, y0, x1, y1], outline=col, width=2)
        lab = y1 + LABEL * W / 100
        dr.rectangle([x0, y1, x1, lab], outline=col, width=1)
        dr.text((x0 + 3, y1 + 2), it["nameKo"], fill=(40, 40, 40), font=fs)
        dr.text((x0 + 3, y0 + 2), it["id"] + (f" ({len(it['unitIds'])})" if it["unitIds"] else " soon"), fill=col, font=f)
    dr.rectangle([0, 0, 200, 22], fill=(255, 255, 255, 220))
    dr.text((6, 3), f"{d['id']}  aspect {d['aspect']}", fill=(0, 0, 0), font=f)
    return img.convert("RGB")


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    out.mkdir(parents=True, exist_ok=True)
    imgs = []
    for d in load_data():
        im = render(d)
        im.save(out / f"{d['id']}.png")
        imgs.append(im)
    half = [im.resize((360, round(im.height * 360 / im.width)), Image.LANCZOS) for im in imgs]
    sheet = Image.new("RGB", (360 * len(half) + 8 * (len(half) - 1), max(i.height for i in half)), (255, 255, 255))
    for i, im in enumerate(half):
        sheet.paste(im, (i * 368, 0))
    sheet.save(out / "sheet.png")
    print("wrote", out)


if __name__ == "__main__":
    main()
