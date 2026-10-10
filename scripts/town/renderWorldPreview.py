"""scripts/town/renderWorldPreview.py - Paul Town hybrid world top-down layout preview (Pillow). Network 0.

HONEST SCOPE: not a browser test. Reads the world data through dumpWorld.mjs (the real worldMap.js), draws ground per zone,
paths, solid footprints (faint outlines), kit @2x art pasted at the anchors (height h * 6 px, width from the manifest aspect),
y-sorted, with soft ellipse shadows. Geometry / scale / overlap only; CSS, the camera and touch are NOT covered.

usage: python scripts/town/renderWorldPreview.py [outDir]
writes world.png (1920x1440), world_small.png (960 wide), plaza.png, park.png, school.png
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
KIT = os.path.join(ROOT, 'src', 'assets', 'town', 'kit')
DEFAULT_OUT = r'C:\Users\jinal\AppData\Local\Temp\claude\C--voca\4dd777a3-9f93-4c78-a984-4f4ee328e279\scratchpad\townimg\world'
OUT = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
S = 6  # px per world unit
os.makedirs(OUT, exist_ok=True)

data = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'scripts', 'town', 'dumpWorld.mjs')], cwd=ROOT))
manifest = json.load(open(os.path.join(KIT, 'manifest.json'), encoding='utf8'))['targets']
W, H = data['WORLD_W'] * S, data['WORLD_H'] * S

def font(sz):
    for f in (r'C:\Windows\Fonts\malgunbd.ttf', r'C:\Windows\Fonts\malgun.ttf', 'arialbd.ttf'):
        try:
            return ImageFont.truetype(f, sz)
        except Exception:
            pass
    return ImageFont.load_default()

GROUND = {'paving': (226, 216, 196), 'grass': (170, 205, 140), 'yard': (196, 222, 160), 'street': (214, 205, 188),
          'garden': (184, 214, 150), 'water': (166, 204, 222), 'farm': (200, 212, 144)}
PATH = (246, 238, 214)

canvas = Image.new('RGBA', (W, H), (255, 255, 255, 255))
d = ImageDraw.Draw(canvas, 'RGBA')
for z in data['ZONES']:
    r = z['rect']
    d.rectangle([r['x'] * S, r['y'] * S, (r['x'] + r['w']) * S, (r['y'] + r['h']) * S], fill=GROUND[z['ground']] + (255,))
# plaza paving tiles hint + school yard sand
for z in data['ZONES']:
    r = z['rect']
    if z['id'] == 'plaza':
        for gx in range(r['x'], r['x'] + r['w'], 8):
            d.line([gx * S, r['y'] * S, gx * S, (r['y'] + r['h']) * S], fill=(210, 199, 176, 90), width=1)
        for gy in range(r['y'], r['y'] + r['h'], 8):
            d.line([r['x'] * S, gy * S, (r['x'] + r['w']) * S, gy * S], fill=(210, 199, 176, 90), width=1)
for z in data['ZONES']:
    r = z['rect']
    d.rectangle([r['x'] * S, r['y'] * S, (r['x'] + r['w']) * S, (r['y'] + r['h']) * S], outline=(90, 110, 90, 150), width=3)
# paths
for p in data['PATHS']:
    pts = [(q['x'] * S, q['y'] * S) for q in p['points']]
    w = int(p['width'] * S)
    d.line(pts, fill=PATH + (255,), width=w, joint='curve')
    for q in pts:
        d.ellipse([q[0] - w / 2, q[1] - w / 2, q[0] + w / 2, q[1] + w / 2], fill=PATH + (255,))
# footprints
for s in data['solids']:
    if s['id'].startswith('zone-'):
        continue
    d.rectangle([s['x0'] * S, s['y0'] * S, s['x1'] * S, s['y1'] * S], outline=(60, 60, 60, 110), width=1)

cache = {}
def art(target, hpx):
    k = (target, hpx)
    if k in cache:
        return cache[k]
    m = manifest[target]
    im = Image.open(os.path.join(KIT, target + '@2x.webp')).convert('RGBA')
    w = max(1, round(hpx * m['w'] / m['h']))
    cache[k] = im.resize((w, max(1, round(hpx))), Image.LANCZOS)
    return cache[k]

def shadows(items):
    layer = Image.new('L', (W, H), 0)
    sd = ImageDraw.Draw(layer)
    for o in items:
        if o['art'] in ('props/stepping-stones', 'props/garden-gate'):
            continue
        im = art(o['art'], o['h'] * S)
        sw = im.width * 0.8
        sh = max(6, sw * 0.22)
        sd.ellipse([o['x'] * S - sw / 2, o['y'] * S - sh / 2, o['x'] * S + sw / 2, o['y'] * S + sh / 2], fill=95)
    layer = layer.filter(ImageFilter.GaussianBlur(4))
    black = Image.new('RGBA', (W, H), (40, 50, 40, 255))
    black.putalpha(layer)
    return black

def paste(items, extra=None):
    order = sorted(items + (extra or []), key=lambda o: o['y'])
    for o in order:
        if o.get('paul'):
            draw_paul(o['x'], o['y'])
            continue
        im = art(o['art'], o['h'] * S)
        canvas.alpha_composite(im, (round(o['x'] * S - im.width / 2), round(o['y'] * S - im.height)))

def draw_paul(x, y):
    px, py, hh = x * S, y * S, 12 * S
    dd = ImageDraw.Draw(canvas, 'RGBA')
    dd.ellipse([px - 22, py - 5, px + 22, py + 5], fill=(40, 50, 40, 90))
    dd.rounded_rectangle([px - 17, py - hh * 0.62, px + 17, py - 6], radius=10, fill=(40, 62, 110, 255))
    dd.ellipse([px - 15, py - hh, px + 15, py - hh * 0.62 + 4], fill=(246, 214, 178, 255), outline=(60, 40, 30, 255), width=2)
    dd.pieslice([px - 16, py - hh - 2, px + 16, py - hh * 0.8], 180, 360, fill=(90, 60, 40, 255))

ready = [o for o in data['OBJECTS']]
soon = data['SOON_OBJECTS']
gates = [{'art': g['art'], 'x': g['x'], 'y': g['y'], 'h': g['h']} for g in data['GATES']]

# soon zones: planned content, then a veil
canvas.alpha_composite(shadows(soon))
paste(soon)
veil = Image.new('RGBA', (W, H), (0, 0, 0, 0))
vd = ImageDraw.Draw(veil)
for z in data['ZONES']:
    if z['status'] == 'soon':
        r = z['rect']
        vd.rectangle([r['x'] * S, r['y'] * S, (r['x'] + r['w']) * S, (r['y'] + r['h']) * S], fill=(236, 232, 224, 150))
canvas.alpha_composite(veil)
# ready content (+ gates + Paul), y-sorted
canvas.alpha_composite(shadows(ready + gates))
paste(ready + gates, [{'paul': True, 'x': data['SPAWN']['x'], 'y': data['SPAWN']['y']}])

# markers and labels
d = ImageDraw.Draw(canvas, 'RGBA')
f1, f2 = font(30), font(22)
for z in data['ZONES']:
    r = z['rect']
    label = z['nameKo'] + ('  (준비 중)' if z['status'] == 'soon' else '')
    d.text((r['x'] * S + 10, r['y'] * S + 6), label, font=f1, fill=(30, 50, 80, 235), stroke_width=3, stroke_fill=(255, 255, 255, 220))
for g in data['GATES']:
    d.text((g['x'] * S - 30, g['y'] * S + 4), '준비 중', font=f2, fill=(110, 60, 40, 255), stroke_width=3, stroke_fill=(255, 255, 255, 230))
for p in data['PLACES']:
    e = p['entrance']
    d.ellipse([e['x'] * S - 12, e['y'] * S - 12, e['x'] * S + 12, e['y'] * S + 12], outline=(214, 60, 120, 255), width=4, fill=(255, 255, 255, 140))
    d.text((e['x'] * S + 16, e['y'] * S - 12), p['nameKo'], font=f2, fill=(160, 30, 80, 255), stroke_width=3, stroke_fill=(255, 255, 255, 230))
for z in data['ZONES']:
    if z['entrance']:
        e = z['entrance']
        d.rectangle([e['x'] * S - 8, e['y'] * S - 8, e['x'] * S + 8, e['y'] * S + 8], outline=(20, 110, 180, 255), width=4)
sp = data['SPAWN']
d.polygon([(sp['x'] * S, sp['y'] * S + 14), (sp['x'] * S - 14, sp['y'] * S + 34), (sp['x'] * S + 14, sp['y'] * S + 34)], fill=(230, 150, 20, 255))
d.text((sp['x'] * S + 20, sp['y'] * S + 16), 'SPAWN', font=f2, fill=(150, 90, 0, 255), stroke_width=3, stroke_fill=(255, 255, 255, 230))

out = canvas.convert('RGB')
out.save(os.path.join(OUT, 'world.png'))
out.resize((960, 720), Image.LANCZOS).save(os.path.join(OUT, 'world_small.png'))
def crop(name, x0, y0, x1, y1):
    out.crop((x0 * S, y0 * S, x1 * S, y1 * S)).save(os.path.join(OUT, name))
crop('plaza.png', 95, 40, 225, 160)
crop('park.png', 0, 50, 125, 190)
crop('school.png', 205, 50, 320, 190)
print('wrote', OUT)
