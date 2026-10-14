"""PAUL PHONICS 학습 화면 그림 파생: 운영자 승인 원본(123.png)에서 직사각형 잘라내기(1:1, 리샘플 없음) + WebP 변환만 한다.
사용: python scripts/phonics/deriveLessonArt.py [원본경로]   (원본은 읽기만 한다)"""
import hashlib, os, sys
from PIL import Image

SRC = r'C:\Users\jinal\Dropbox\PC (4)\pic3\123.png'
SHA = 'f4c5e2f13585450b60093b30002a824894e6c6f356849c13e4bddf0e620dfcd4'
W, H = 1586, 992
# 이름: (x0, y0, x1, y1) 원본 픽셀.
# scene: 창문/화분/선반/칠판 왼쪽/선생님(카드 왼쪽 테두리 x=708까지). 말풍선 조각(x640~708,y131~221)이 일부 포함되며 실제 말풍선이 덮는다.
# wall: 오른쪽 8px 폭 세로 띠(벽→나무틀→칠판→나무틀→벽/바닥). repeat-x로 칠판을 이어 붙이는 데 쓴다.
RECTS = {
    'scene': (75, 100, 708, 806),
    'wall': (1486, 100, 1494, 806),
}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'assets', 'phonics', 'lesson')

src = sys.argv[1] if len(sys.argv) > 1 else SRC
raw = open(src, 'rb').read()
if hashlib.sha256(raw).hexdigest() != SHA:
    sys.exit('sha256 불일치 — 중단')
im = Image.open(src).convert('RGB')
assert im.size == (W, H), im.size
os.makedirs(OUT, exist_ok=True)
for name, (x0, y0, x1, y1) in RECTS.items():
    p = os.path.join(OUT, f'phonics-lesson-{name}.webp')
    im.crop((x0, y0, x1, y1)).save(p, 'WEBP', quality=90, method=6)
    print(f'{name:6} rect=({x0},{y0},{x1},{y1}) {x1 - x0}x{y1 - y0} {os.path.getsize(p)} bytes')
