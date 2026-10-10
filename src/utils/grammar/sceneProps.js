// 2026-10-10 Scene v2 그림 레지스트리(순수 데이터, import 없음). 내용 담당은 여기 있는 키만 쓴다.
// { ko, kind: 'character'|'animal'|'object', asset?: Town 자산 키, w, h } — w·h는 viewBox(360x220) 기준 크기(h는 바닥에서 위로 올라오는 높이).
// asset이 없으면 Stage.jsx가 임시 SVG 도형을 그린다(paul은 Paul 이미지).
const c = (ko, w = 34, h = 58) => ({ ko, kind: 'character', w, h })
const a = (ko, w, h, asset) => ({ ko, kind: 'animal', w, h, ...(asset ? { asset } : {}) })
const o = (ko, w, h, asset) => ({ ko, kind: 'object', w, h, ...(asset ? { asset } : {}) })

export const PROPS = {
  paul: c('폴', 58, 62), cookie: a('쿠키', 54, 40, 'animals/puppy'),
  mia: c('미아'), tom: c('톰'), mom: c('엄마'), dad: c('아빠'), teacher: c('선생님'), kid: c('아이', 28, 48), grandma: c('할머니'), driver: c('운전기사'),
  dog: a('강아지', 54, 40, 'animals/puppy'), cat: a('고양이', 40, 34, 'animals/cat'), owl: a('올빼미', 34, 38, 'animals/owl'), bird: a('새', 22, 18), fish: a('물고기', 26, 16),
  tree: o('나무', 48, 64, 'nature/tree'), bench: o('벤치', 54, 36, 'decorations/bench'), flower: o('꽃', 36, 30, 'nature/flower-garden'), lamp: o('가로등', 22, 64, 'decorations/street-lamp'),
  postbox: o('우체통', 24, 40, 'decorations/red-post-box'), fountain: o('분수', 54, 48, 'decorations/stone-fountain'), house: o('집', 80, 70, 'buildings/my-house'),
  school: o('학교', 90, 72, 'special/english-school'), cafe: o('카페', 80, 68, 'buildings/cafe'), shop: o('가게', 80, 68, 'buildings/book-shop'),
  bridge: o('다리', 100, 44, 'special/bridge'), tower: o('시계탑', 36, 80, 'special/clock-tower'),
  ball: o('공', 16, 16), box: o('상자', 30, 24), book: o('책', 22, 16), bag: o('가방', 24, 28), pencil: o('연필', 28, 8), cup: o('컵', 16, 18), apple: o('사과', 16, 16),
  bike: o('자전거', 40, 26), car: o('자동차', 52, 26), bus: o('버스', 64, 34), phone: o('휴대폰', 12, 20), chair: o('의자', 24, 34), table: o('탁자', 48, 30), bed: o('침대', 60, 30),
  door: o('문', 30, 56), umbrella: o('우산', 34, 30), hat: o('모자', 26, 16), letter: o('편지', 24, 16), cake: o('케이크', 26, 22), pizza: o('피자', 26, 22), milk: o('우유', 14, 22),
  egg: o('달걀', 12, 16), key: o('열쇠', 24, 10), map: o('지도', 28, 20), clock: o('시계', 22, 22), guitar: o('기타', 20, 44), kite: o('연', 24, 30), tv: o('텔레비전', 40, 30),
  computer: o('컴퓨터', 38, 32), window: o('창문', 34, 40), desk: o('책상', 52, 32), board: o('칠판', 70, 40), money: o('돈', 24, 12), ticket: o('표', 24, 14), gift: o('선물', 22, 22),
  shoes: o('신발', 26, 12), jacket: o('재킷', 28, 30), homework: o('숙제', 22, 28), newspaper: o('신문', 28, 20), medal: o('메달', 14, 26), trophy: o('트로피', 20, 26),
}

// 동작 배지(임시 이모지). 영어 글자는 그림에 넣지 않는다.
export const ACTIONS = {
  run: { ko: '달리기', emoji: '🏃' }, walk: { ko: '걷기', emoji: '🚶' }, read: { ko: '읽기', emoji: '📖' }, eat: { ko: '먹기', emoji: '🍽️' }, drink: { ko: '마시기', emoji: '🥤' },
  sleep: { ko: '자기', emoji: '😴' }, play: { ko: '놀기', emoji: '⚽' }, sing: { ko: '노래하기', emoji: '🎤' }, swim: { ko: '수영', emoji: '🏊' }, cook: { ko: '요리', emoji: '🍳' },
  study: { ko: '공부', emoji: '✏️' }, write: { ko: '쓰기', emoji: '📝' }, draw: { ko: '그리기', emoji: '🖍️' }, clean: { ko: '청소', emoji: '🧹' }, sit: { ko: '앉기', emoji: '🪑' },
  jump: { ko: '뛰기', emoji: '🤸' }, dance: { ko: '춤추기', emoji: '💃' }, talk: { ko: '말하기', emoji: '💬' }, ride: { ko: '타기', emoji: '🚲' }, wash: { ko: '씻기', emoji: '🧼' },
  open: { ko: '열기', emoji: '🔓' }, close: { ko: '닫기', emoji: '🔒' }, watch: { ko: '보기', emoji: '👀' }, listen: { ko: '듣기', emoji: '👂' }, cry: { ko: '울기', emoji: '😢' },
  laugh: { ko: '웃기', emoji: '😆' }, wait: { ko: '기다리기', emoji: '⏳' }, think: { ko: '생각하기', emoji: '🤔' }, buy: { ko: '사기', emoji: '🛍️' }, call: { ko: '전화', emoji: '📞' },
  drive: { ko: '운전', emoji: '🚗' }, paint: { ko: '칠하기', emoji: '🎨' }, fix: { ko: '고치기', emoji: '🔧' }, help: { ko: '돕기', emoji: '🤝' }, carry: { ko: '들기', emoji: '📦' }, wave: { ko: '손 흔들기', emoji: '👋' }, like: { ko: '좋아해요', emoji: '❤️' },
}

// 안에 넣을 수 있는 통(in이면 앞벽이 물건 아랫부분을 가림)
export const CONTAINERS = ['box', 'bag', 'cup']
export const RELATIONS = ['in', 'on', 'under', 'next to', 'behind', 'in front of']
export const CHARACTERS = ['paul', 'cookie', 'mia', 'tom', 'mom', 'dad', 'teacher', 'kid', 'grandma', 'driver']
export const BACKGROUNDS = ['park', 'home', 'school', 'street', 'plain']

// 공원(bg 'park') 장면에서만 쓰는 실제 그림 상자 크기(viewBox 360x220, h는 바닥에서 위로). 비율은 art kit(manifest) 원본 비율과 같다(찌그러짐 없음).
// dog=cookie-stand 213x256, tree 256x256, bench 256x244, flower=sunflower-pot 175x256. 다른 배경(home·school·street·plain)과 다른 물건은 위 PROPS 그대로.
export const PARK_DIMS = { dog: { w: 61, h: 73 }, tree: { w: 90, h: 90 }, bench: { w: 76, h: 73 }, flower: { w: 46, h: 67 } }
// 공원 무대 배치(360x220): 발이 닿는 바닥선, Paul 상자(키 79 = 앉은 Cookie 73보다 크고 나무 90보다 작음), Paul 오른쪽 빈 잔디 폭, 만들기에서 놓은 물건의 최대 너비(4칸이 겹침 15% 안에 들어가도록 나무 90→76)
export const PARK_GROUND = 198
export const PARK_PAUL = { x: 2, w: 74, h: 79 }
export const PARK_FREE = { x0: 82, x1: 356 }
export const PARK_PLACED_MAX = 76
export const dimsFor = (bg) => (bg === 'park' ? PARK_DIMS : undefined)
// 장면 물건 키(+같은 물건 번호 i) → 공원 그림 키(PARK_ART의 키). 강아지는 서 있는/앉은 Cookie를 번갈아 써서 여러 마리가 따로따로 보이게 한다. 없으면 null(기존 그림 유지).
export const parkArtKey = (obj, i = 0) => (obj === 'dog' ? (i % 2 === 0 ? 'cookie-stand' : 'cookie-sit') : obj === 'tree' || obj === 'bench' || obj === 'flower' ? obj : null)
// 화면 배율이 1보다 크면 @2x(서버·기본은 1x). a = { src, src2x }
export const parkSrc = (a, dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) => (dpr > 1 ? a.src2x : a.src)
