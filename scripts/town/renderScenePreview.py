"""scripts/town/renderScenePreview.py - park picture geometry preview (Pillow). Network 0.

HONEST SCOPE: this is NOT a browser test. It takes the item boxes that renderScenePreview.mjs resolves with the SAME pure
layout functions Stage.jsx uses, draws park-backdrop with the same `xMidYMax slice` crop, and pastes the kit @2x art into
each box with `xMidYMax meet`. It only checks geometry (cropping, feet on the meadow, counts), aspect ratio and alpha
transparency. SVG rendering, CSS, touch and accessibility are NOT covered.

usage: python scripts/town/renderScenePreview.py [outDir]
writes <name>.png (720x440), <name>_360.png (360x220 downscale) and sheet_360.png (contact sheet of all pictures).
"""
import json, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
KIT = os.path.join(ROOT, 'src', 'assets', 'town', 'kit')
DEFAULT_OUT = r'C:\Users\jinal\AppData\Local\Temp\claude\C--voca\4dd777a3-9f93-4c78-a984-4f4ee328e279\scratchpad\townimg\preview'
OUT = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
K = 2  # 720x440 = viewBox 360x220 x 2
ART = {'cookie-stand': 'character/cookie-stand', 'cookie-sit': 'character/cookie-sit', 'tree': 'nature/tree', 'bench': 'props/bench', 'flower': 'props/sunflower-pot'}

data = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'scripts', 'town', 'renderScenePreview.mjs')] + sys.argv[2:], cwd=ROOT))
os.makedirs(OUT, exist_ok=True)

def load(path):
    return Image.open(path).convert('RGBA')

# backdrop: preserveAspectRatio xMidYMax slice into 360x220 -> scale = max(360/768, 220/512), bottom/center aligned
bd = load(os.path.join(KIT, 'backgrounds', 'park-backdrop@2x.webp'))
bs = max(360 / 768, 220 / 512) * K
bw, bh = round(768 * bs), round(512 * bs)
backdrop = bd.resize((bw, bh), Image.LANCZOS)
bx, by = (360 * K - bw) // 2, 220 * K - bh
paul = load(os.path.join(ROOT, 'src', 'assets', 'paul', 'paul_happy.png'))
cache = {}

def meet(img, x, y, w, h):
    """paste img into box (center x, bottom y, w, h) with xMidYMax meet"""
    bw_, bh_ = w * K, h * K
    s = min(bw_ / img.width, bh_ / img.height)
    iw, ih = max(1, round(img.width * s)), max(1, round(img.height * s))
    return img.resize((iw, ih), Image.LANCZOS), round(x * K - iw / 2), round(y * K - ih)

try:
    font = ImageFont.truetype('arialbd.ttf', 22)
except Exception:
    font = ImageFont.load_default()
small = ImageFont.load_default()

def render(p):
    canvas = Image.new('RGBA', (360 * K, 220 * K), (255, 255, 255, 255))
    canvas.paste(backdrop, (bx, by))
    # spots (dashed "+" boxes) under items, like Stage
    d = ImageDraw.Draw(canvas, 'RGBA')
    for s in p['spots']:
        sz = s['size']
        d.rectangle([(s['x'] - sz / 2) * K, (s['y'] - sz + 4) * K, (s['x'] + sz / 2) * K, (s['y'] + 4) * K], fill=(255, 255, 255, 140), outline=(14, 165, 233, 255), width=3)
        d.text((s['x'] * K - 6, (s['y'] - sz * 0.6) * K), '+', fill=(2, 132, 199, 255), font=font)
    # Paul
    pi, px, py = meet(paul, p['paul']['x'] + p['paul']['w'] / 2, p['paul']['y'] + p['paul']['h'], p['paul']['w'], p['paul']['h'])
    canvas.alpha_composite(pi, (px, py))
    for it in p['items']:
        # shadow ellipse rx=w/2.2 ry=4 black 12%
        sh = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse([(it['x'] - it['w'] / 2.2) * K, (it['y'] - 4) * K, (it['x'] + it['w'] / 2.2) * K, (it['y'] + 4) * K], fill=(0, 0, 0, 31))
        canvas.alpha_composite(sh)
        if it['art']:
            key = it['art']
            if key not in cache:
                cache[key] = load(os.path.join(KIT, ART[key] + '@2x.webp'))
            im, ox, oy = meet(cache[key], it['x'], it['y'], it['w'], it['h'])
            canvas.alpha_composite(im, (ox, oy))
        if it.get('cookieTag'):
            ImageDraw.Draw(canvas).text((it['x'] * K, (it['y'] + 14) * K), 'Cookie', fill=(31, 41, 55, 255), font=font, anchor='mm')
    return canvas.convert('RGB')

# out-of-frame report (box edges vs 360x220)
report = []
tiles = []
for p in data['pictures']:
    img = render(p)
    img.save(os.path.join(OUT, p['name'] + '.png'))
    small_img = img.resize((360, 220), Image.LANCZOS)
    small_img.save(os.path.join(OUT, p['name'] + '_360.png'))
    tiles.append((p['name'], small_img))
    for it in p['items']:
        if it['x'] - it['w'] / 2 < 0 or it['x'] + it['w'] / 2 > 360 or it['y'] - it['h'] < 0 or it['y'] > 220:
            report.append(f"{p['name']}: {it['obj']}{it['i']} box outside 360x220")
cols = 3
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * 364, rows * 244), (240, 240, 240))
sd = ImageDraw.Draw(sheet)
for n, (name, t) in enumerate(tiles):
    cx, cy = (n % cols) * 364 + 2, (n // cols) * 244 + 2
    sheet.paste(t, (cx, cy + 20))
    sd.text((cx + 2, cy + 4), name, fill=(0, 0, 0), font=small)
sheet.save(os.path.join(OUT, 'sheet_360.png'))
print(f'wrote {len(tiles)} pictures (+_360 each) and sheet_360.png to {OUT}')
print('\n'.join(report) if report else 'no item box outside 360x220')
