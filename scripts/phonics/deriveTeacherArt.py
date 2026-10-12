"""PAUL PHONICS teacher art: the SAME town Paul originals at ORIGINAL resolution (scale 1.0). Nothing is generated,
redrawn or downscaled here: the script only trims the fully transparent margin and converts PNG -> WebP (alpha kept).
Usage: python scripts/phonics/deriveTeacherArt.py [DOWNLOADS_DIR]
NOTE: the lesson screen uses the STANDING export as a TEMPORARY substitute for the pointing pose in the operator reference (no pointing frame was supplied).
Hashes are the ones recorded in src/assets/town/character/NOTICE.md; aborts on mismatch.
"""
import hashlib, sys
from pathlib import Path
from PIL import Image

DL = Path(sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\jinal\Downloads')
OUT = Path(__file__).resolve().parents[2] / 'src' / 'assets' / 'phonics' / 'teacher'
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
    fig = im.crop(box)  # 1:1 pixels — only the fully transparent margin is removed; no resampling, no repainting
    out = OUT / name
    fig.save(out, 'WEBP', quality=95, method=6)
    print(f'{name}: sha256 OK, original {im.width}x{im.height} -> transparent margin trimmed {fig.width}x{fig.height} (scale 1.0), {out.stat().st_size} bytes')
