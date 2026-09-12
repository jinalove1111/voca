// src/utils/town/townDiscovery.js — Paul Town British World, Discovery
// System(순수 도메인, 2026-09-12). 설계 원문: docs/design/town/DISCOVERY_SYSTEM.md
//
// import 0 — React/supabase 없음, Date.now/Math.random 사용 안 함(순수 결정론).
// Discovery는 flavor only다: 별(⭐)/Paul Dollar(💵)를 지급/차감하지 않고,
// progress_data에 아무것도 쓰지 않는다(읽음 표시 없음, 매번 그날의 문장을
// 다시 계산해서 보여준다).
//
// 결정론 시드 = `${studentId}:${placeKey}:${dayKey}` -> djb2 해시 % 예시 수.
// 이 djb2+dayKey 패턴은 src/utils/attachment/paulTown.js의
// pickTodaysDiscovery()가 이미 쓰는 것과 동일한 정신(CLAUDE.md 규칙 3 —
// 검증된 패턴 재사용, 새로 발명하지 않음). 학생 식별은 오직 UUID
// (studentId)로만 하고 이름을 시드에 넣지 않는다(CLAUDE.md 규칙 4).

// ── 결정론 해시(djb2) — src/utils/attachment/paulTown.js와 동일 알고리즘 ──
function hashString(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

/** now(Date) -> 로컬 자정 경계 dayKey 문자열. offsetDays로 과거 날짜도 조회 가능. */
export function dayKeyFor(now = new Date(), offsetDays = 0) {
  const base = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - offsetDays)
  return d.toDateString()
}

// ── 장소 정의 — docs/design/town/DISCOVERY_SYSTEM.md §3/§4와 1:1 대응 ──
// itemId: null이면 "제안 장소"(현재 town_items 카탈로그에 없음, 콘텐츠만
// 준비). 코드/문서 어디에도 이 파일은 town_items를 조회하지 않는다(순수
// 상수 + 순수 함수, DB 접근 0).
export const DISCOVERY_PLACES = [
  { placeKey: 'book-shop', itemId: 'book-shop', topic: 'British word/fact' },
  { placeKey: 'post-box', itemId: 'red-post-box', topic: 'Mini message' },
  { placeKey: 'clock-tower', itemId: 'clock-tower', topic: 'Time expressions' },
  { placeKey: 'garden', itemId: 'flower-garden', topic: 'Nature words' },
  { placeKey: 'school', itemId: 'english-school', topic: 'Mini challenge' },
  { placeKey: 'cafe', itemId: 'cafe', topic: 'Ordering expressions' },
  { placeKey: 'tea-shop', itemId: null, topic: 'Food vocabulary (proposal)' },
  { placeKey: 'train-platform', itemId: null, topic: 'Travel expressions (proposal)' },
  { placeKey: 'market', itemId: null, topic: 'Shopping expressions (proposal)' },
  { placeKey: 'library', itemId: null, topic: 'Reading expressions (proposal)' },
]

// itemId -> placeKey 역방향 조회(카탈로그에 실제 존재하는 6곳만).
const ITEM_TO_PLACE = Object.fromEntries(
  DISCOVERY_PLACES.filter((p) => p.itemId).map((p) => [p.itemId, p.placeKey])
)

/** town_items.id(예: 'book-shop') -> placeKey. 매핑 없으면 null(크래시 없음). */
export function placeKeyForItemId(itemId) {
  return (typeof itemId === 'string' && ITEM_TO_PLACE[itemId]) || null
}

// ── 콘텐츠 — docs/design/town/DISCOVERY_SYSTEM.md §4와 동기화 대상 ──
// 각 배열 원소: { en, ko } — 전부 2줄 이내, 초등/중등 학생 기준 무해한
// 일반 상식/어휘만(브랜드 IP 0, 폭력/공포/오컬트 0).
export const DISCOVERY_CONTENT = {
  'book-shop': [
    { en: "A group of books is called a 'library'.", ko: "책이 모인 곳을 '도서관'이라고 해요." },
    { en: "British people say 'full stop', not 'period'.", ko: "영국에서는 마침표를 'full stop'이라고 해요." },
    { en: "'Colour' is the British spelling of 'color'.", ko: "'Colour'는 'color'의 영국식 철자예요." },
    { en: "A 'chapter' is one part of a book.", ko: "'Chapter'는 책의 한 부분이에요." },
    { en: "'Author' means the person who writes a book.", ko: "'Author'는 책을 쓴 사람이라는 뜻이에요." },
    { en: "In the UK, a bookshop is sometimes called a 'bookshop', not 'bookstore'.", ko: "영국에서는 서점을 'bookstore' 대신 'bookshop'이라고도 해요." },
    { en: "'Fairy tale' means a magical story for children.", ko: "'Fairy tale'은 아이들을 위한 마법 같은 이야기예요." },
    { en: "The word 'story' comes from an old word meaning 'history'.", ko: "'Story'라는 말은 '역사'를 뜻하는 옛말에서 왔어요." },
  ],
  'post-box': [
    { en: 'British post boxes are painted bright red.', ko: '영국 우체통은 빨간색으로 칠해져 있어요.' },
    { en: "'Post' is the British word for 'mail'.", ko: "영국에서는 'mail' 대신 'post'라고 해요." },
    { en: "A 'stamp' goes on a letter before you send it.", ko: "편지를 보내기 전엔 'stamp(우표)'를 붙여요." },
    { en: "'Dear' is how British letters often begin.", ko: "영국 편지는 보통 'Dear'로 시작해요." },
    { en: "'Yours sincerely' is a polite way to end a letter.", ko: "'Yours sincerely'는 편지를 정중하게 끝내는 말이에요." },
    { en: "A 'postcard' is a short message you can send without an envelope.", ko: "'Postcard'는 봉투 없이 보낼 수 있는 짧은 편지예요." },
    { en: "'Envelope' is the paper cover for a letter.", ko: "'Envelope'는 편지를 담는 종이 봉투예요." },
    { en: "'Address' tells the post box where to send your letter.", ko: "'Address'는 편지를 어디로 보낼지 알려줘요." },
  ],
  'clock-tower': [
    { en: "'O'clock' means 'of the clock' — an old English phrase.", ko: "'O'clock'은 '시계의'라는 뜻의 오래된 영어 표현이에요." },
    { en: "'Half past' means 30 minutes after the hour.", ko: "'Half past'는 정각에서 30분이 지났다는 뜻이에요." },
    { en: "'Quarter to' means 15 minutes before the hour.", ko: "'Quarter to'는 정각까지 15분 남았다는 뜻이에요." },
    { en: 'Big Ben is the nickname of a famous London clock bell.', ko: '빅벤은 런던의 유명한 시계 종의 별명이에요.' },
    { en: "'Noon' means 12 o'clock in the daytime.", ko: "'Noon'은 낮 12시를 뜻해요." },
    { en: "'Midnight' means 12 o'clock at night.", ko: "'Midnight'은 밤 12시를 뜻해요." },
    { en: "A clock has an 'hour hand' and a 'minute hand'.", ko: '시계에는 \'시침\'과 \'분침\'이 있어요.' },
    { en: "'Tick-tock' is the sound a clock makes.", ko: "'Tick-tock'은 시계가 가는 소리예요." },
  ],
  garden: [
    { en: "A 'garden' in Britain often means a small yard with flowers.", ko: "영국에서 'garden'은 꽃이 있는 작은 마당을 뜻해요." },
    { en: "'Bloom' means a flower opening up.", ko: "'Bloom'은 꽃이 피는 것을 뜻해요." },
    { en: "A 'petal' is one part of a flower.", ko: "'Petal'은 꽃잎을 뜻해요." },
    { en: "'Soil' is the ground plants grow in.", ko: "'Soil'은 식물이 자라는 흙이에요." },
    { en: "A 'bee' helps flowers grow by visiting them.", ko: "'Bee(벌)'는 꽃을 찾아다니며 자라도록 도와줘요." },
    { en: "'Bud' means a flower before it opens.", ko: "'Bud'는 아직 피지 않은 꽃봉오리예요." },
    { en: "'Sunshine' helps every garden grow.", ko: "'Sunshine(햇빛)'은 정원을 자라게 해줘요." },
    { en: "'Watering can' is used to give plants water.", ko: "'Watering can'은 식물에 물을 줄 때 쓰는 물뿌리개예요." },
  ],
  school: [
    { en: "Mini challenge: how do you say '안녕' in English?", ko: "미니 챌린지: '안녕'을 영어로 하면? (Hello!)" },
    { en: "Mini challenge: what's the opposite of 'big'?", ko: "미니 챌린지: 'big'의 반대말은? (Small!)" },
    { en: 'Mini challenge: how do you spell the color of the sky?', ko: '미니 챌린지: 하늘 색을 영어로 쓰면? (Blue!)' },
    { en: 'Mini challenge: what do you call a baby dog?', ko: '미니 챌린지: 강아지 아기를 영어로 하면? (Puppy!)' },
    { en: 'Mini challenge: how many days are in a week?', ko: '미니 챌린지: 일주일은 며칠일까요? (Seven!)' },
    { en: "Mini challenge: what's the English word for '사과'?", ko: "미니 챌린지: '사과'는 영어로? (Apple!)" },
    { en: 'Mini challenge: what comes after Monday?', ko: '미니 챌린지: 월요일 다음은? (Tuesday!)' },
    { en: "Mini challenge: how do you say 'thank you' politely?", ko: "미니 챌린지: '고맙습니다'를 정중하게 하면? (Thank you very much!)" },
  ],
  cafe: [
    { en: "'Could I have...?' is a polite way to order.", ko: "'Could I have...?'는 정중하게 주문하는 표현이에요." },
    { en: "'Take away' means food to go in British English.", ko: "영국에서는 포장을 'take away'라고 해요." },
    { en: "'For here or to go?' asks how you'll eat your food.", ko: "'For here or to go?'는 여기서 먹을지 포장할지 묻는 말이에요." },
    { en: "'Biscuit' means 'cookie' in British English.", ko: "영국에서는 쿠키를 'biscuit'이라고 해요." },
    { en: 'Afternoon tea is a British tradition with tea and small snacks.', ko: '애프터눈 티는 차와 작은 간식을 즐기는 영국 전통이에요.' },
    { en: "'May I...?' is a polite way to ask for something.", ko: "'May I...?'는 무언가를 정중하게 부탁하는 말이에요." },
    { en: "'Please' and 'thank you' make any order sound kind.", ko: "'Please'와 'thank you'는 주문을 더 친절하게 만들어요." },
    { en: "A 'menu' shows what food you can order.", ko: "'Menu'는 주문할 수 있는 음식을 보여줘요." },
  ],
  'tea-shop': [
    { en: "'Tea time' is a British tradition in the afternoon.", ko: "'Tea time'은 영국의 오후 전통이에요." },
    { en: "'Scone' is a small British bread often eaten with tea.", ko: "'Scone'은 차와 함께 먹는 작은 영국식 빵이에요." },
    { en: "'Milk and sugar?' is a common tea question.", ko: "'Milk and sugar?'는 차에 자주 묻는 말이에요." },
    { en: "'Kettle' is used to boil water for tea.", ko: "'Kettle'은 차를 끓일 물을 데우는 도구예요." },
    { en: "'Biscuit' often goes well with tea.", ko: "'Biscuit'은 차와 잘 어울려요." },
    { en: "'Cup and saucer' are used together for tea.", ko: "'Cup and saucer'는 차를 마실 때 함께 써요." },
    { en: "'Warm' is how good tea should feel.", ko: "좋은 차는 'warm(따뜻)'해야 해요." },
    { en: "'Sip' means to drink a little bit slowly.", ko: "'Sip'은 조금씩 천천히 마시는 것을 뜻해요." },
  ],
  'train-platform': [
    { en: "'Platform' is where you wait for a train.", ko: "'Platform'은 기차를 기다리는 곳이에요." },
    { en: "'Ticket' lets you get on the train.", ko: "'Ticket'이 있어야 기차를 탈 수 있어요." },
    { en: "'Departure' means the train is leaving.", ko: "'Departure'는 기차가 떠난다는 뜻이에요." },
    { en: "'Arrival' means the train has come.", ko: "'Arrival'은 기차가 도착했다는 뜻이에요." },
    { en: "'Mind the gap' is a famous safety phrase in the UK.", ko: "'Mind the gap'은 영국의 유명한 안전 안내 문구예요." },
    { en: "'Luggage' means the bags you travel with.", ko: "'Luggage'는 여행할 때 가지고 다니는 가방이에요." },
    { en: "'Journey' means a trip from one place to another.", ko: "'Journey'는 한 곳에서 다른 곳으로 가는 여행을 뜻해요." },
    { en: "'All aboard!' means it's time to get on.", ko: "'All aboard!'는 탈 시간이라는 뜻이에요." },
  ],
  market: [
    { en: "'How much is this?' asks the price.", ko: "'How much is this?'는 가격을 물어보는 말이에요." },
    { en: "'Basket' is used to carry things you buy.", ko: "'Basket'은 산 물건을 담는 바구니예요." },
    { en: "'Fresh' means newly made or picked.", ko: "'Fresh'는 갓 만들어지거나 갓 딴 것을 뜻해요." },
    { en: "'Bargain' means a good, low price.", ko: "'Bargain'은 값싸고 좋은 물건을 뜻해요." },
    { en: "'Receipt' is the paper that shows what you bought.", ko: "'Receipt'는 무엇을 샀는지 보여주는 종이예요." },
    { en: "'Change' means the money you get back.", ko: "'Change'는 거스름돈을 뜻해요." },
    { en: "'Stall' is a small shop in a market.", ko: "'Stall'은 시장 안의 작은 가게예요." },
    { en: "'Vegetable' and 'fruit' are common market words.", ko: "'Vegetable'과 'fruit'는 시장에서 자주 쓰는 단어예요." },
  ],
  library: [
    { en: "'Quiet, please' is often said in a library.", ko: "도서관에서는 'Quiet, please(조용히 해주세요)'라고 자주 말해요." },
    { en: "'Borrow' means to take a book and bring it back later.", ko: "'Borrow'는 책을 빌려서 나중에 돌려주는 것을 뜻해요." },
    { en: "'Return' means to bring something back.", ko: "'Return'은 무언가를 다시 가져다 놓는 것을 뜻해요." },
    { en: "'Shelf' is where books are kept.", ko: "'Shelf'는 책을 꽂아두는 곳이에요." },
    { en: "'Librarian' is the person who works in a library.", ko: "'Librarian'은 도서관에서 일하는 사람이에요." },
    { en: "'Novel' means a long story book.", ko: "'Novel'은 긴 이야기책을 뜻해요." },
    { en: "'Page' is one sheet in a book.", ko: "'Page'는 책의 한 장을 뜻해요." },
    { en: "'Bookmark' helps you remember where you stopped reading.", ko: "'Bookmark'는 어디까지 읽었는지 기억하게 도와줘요." },
  ],
}

/**
 * 결정론 발견 문장 선택 — 별/PD 지급 없음, 네트워크 0, progress_data 쓰기 0.
 * 시드 = `${studentId||'anon'}:${placeKey}:${dayKey}`(학생 이름 사용 안 함).
 * @param {string} placeKey - DISCOVERY_PLACES의 placeKey
 * @param {string|null|undefined} studentId - students.id(UUID). 없으면 'anon'.
 * @param {Date} [now] - 기본 현재 시각(호출부가 override 가능, 테스트 결정론).
 * @returns {{ placeKey:string, en:string, ko:string }|null} 알 수 없는
 *   placeKey/콘텐츠 없음이면 null(크래시 없음).
 */
export function pickDiscovery(placeKey, studentId, now = new Date()) {
  const list = typeof placeKey === 'string' ? DISCOVERY_CONTENT[placeKey] : null
  if (!Array.isArray(list) || list.length === 0) return null

  const sid = typeof studentId === 'string' && studentId.length > 0 ? studentId : 'anon'
  const seed = `${sid}:${placeKey}:${dayKeyFor(now)}`
  const idx = hashString(seed) % list.length
  const entry = list[idx]
  return { placeKey, en: entry.en, ko: entry.ko }
}

/** town_items.id로 바로 조회하는 편의 함수(placeKeyForItemId + pickDiscovery). */
export function pickDiscoveryForItem(itemId, studentId, now = new Date()) {
  const placeKey = placeKeyForItemId(itemId)
  if (!placeKey) return null
  return pickDiscovery(placeKey, studentId, now)
}
