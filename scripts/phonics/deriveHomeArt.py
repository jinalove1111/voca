"""PAUL PHONICS 첫 화면 그림 파생: 운영자 승인 원본에서 직사각형 잘라내기(1:1, 리샘플 없음) + WebP 변환만 한다.
사용: python scripts/phonics/deriveHomeArt.py [원본경로]   (원본은 읽기만 한다)"""
import hashlib, os, sys
from PIL import Image

SRC = r'c:\Users\jinal\Dropbox\PC (4)\pic3\a25b0d9d-4f13-4dd0-ac71-82f35f8b3d1f.png'
SHA = '9556d23b1b04dc937770a6fd07dd9072982421dee6cde39f1ab165a9423d9221'
W, H = 1672, 941
# 이름: (x0, y0, x1, y1) 원본 픽셀. 단 하나의 표 — 데스크톱 클릭 영역(%)도 여기서 출력한다.
RECTS = {
    'full': (0, 0, W, H),
    'sign': (700, 38, 1645, 335),
    'teacher': (0, 0, 708, 941),
    'card-phonics': (704, 352, 990, 692),
    'card-speak': (996, 345, 1298, 696),
    'card-play': (1306, 340, 1630, 700),
}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'assets', 'phonics', 'home')

src = sys.argv[1] if len(sys.argv) > 1 else SRC
raw = open(src, 'rb').read()
if hashlib.sha256(raw).hexdigest() != SHA:
    sys.exit('sha256 불일치 — 중단')
im = Image.open(src).convert('RGB')
assert im.size == (W, H), im.size
os.makedirs(OUT, exist_ok=True)
for name, (x0, y0, x1, y1) in RECTS.items():
    p = os.path.join(OUT, f'phonics-home-{name}.webp')
    im.crop((x0, y0, x1, y1)).save(p, 'WEBP', quality=90, method=6)
    print(f'{name:13} rect=({x0},{y0},{x1},{y1}) {x1 - x0}x{y1 - y0} {os.path.getsize(p)} bytes')
print('hit areas, percent of 1672x941 (copy into CSS)')
for name, (x0, y0, x1, y1) in RECTS.items():
    if name.startswith('card-'):
        print(f'{name:13} left:{x0 / W * 100:.3f}%;top:{y0 / H * 100:.3f}%;width:{(x1 - x0) / W * 100:.3f}%;height:{(y1 - y0) / H * 100:.3f}%')
