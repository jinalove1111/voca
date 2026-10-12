"""PAUL PHONICS teacher art: larger (384x512) export of the SAME town Paul originals. No repainting.
Usage: python scripts/phonics/deriveTeacherArt.py [DOWNLOADS_DIR]
Hashes are the ones recorded in src/assets/town/character/NOTICE.md; aborts on mismatch.
"""
import hashlib, sys
from pathlib import Path
from PIL import Image

DL = Path(sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\jinal\Downloads')
OUT = Path(__file__).resolve().parents[2] / 'src' / 'assets' / 'phonics' / 'teacher'
W, H = 384, 512
SRC = {
    'phonics-teacher-stand.webp': ('ChatGPT Image Sep 24, 2026, 08_23_24 PM.png', '56f4082a45d2010383f1cb7a49d6058438c68742a508c67c0bf8684841f77f0f'),
    'phonics-teacher-sit.webp': ('ChatGPT Image Sep 24, 2026, 08_25_51 PM.png', 'e8d801666406de4f1d0285fbb997302072a90280ac92f1c3c3c25ff9cc398f71'),
}

OUT.mkdir(parents=True, exist_ok=True)
for name, (src, want) in SRC.items():
    p = DL / src
    got = hashlib.sha256(p.read_bytes()).hexdigest()
    if got != want:
        sys.exit(f'ABORT: sha256 mismatch for {p}\n  expected {want}\n  actual   {got}')
    im = Image.open(p).convert('RGBA')
    box = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    fig = im.crop(box)
    s = min(W / fig.width, H / fig.height)
    nw, nh = max(1, round(fig.width * s)), max(1, round(fig.height * s))
    fig = fig.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.paste(fig, ((W - nw) // 2, H - nh))  # centred horizontally, feet on the bottom row
    out = OUT / name
    canvas.save(out, 'WEBP', quality=90, method=6)
    print(f'{name}: sha256 OK, figure {nw}x{nh} -> canvas {W}x{H}, {out.stat().st_size} bytes')
