// Project Paul의 브랜드 마스코트 "폴 선생님" 리액션 레지스트리 — 데이터
// 기반 구조라 관리자가 assets/paul/paul_*.png(투명 배경)를 public/assets/
// paul/ 에 추가하기만 하면 코드 수정 없이 바로 반영됨.
//
// 이 18개는 실제로 public/assets/paul/에 있는 PNG 파일명과 정확히 1:1로
// 맞춘 목록(파일이 없는 항목을 넣으면 emoji로 대체 표시되어 "이모지가
// 보이면 안 된다"는 요구사항을 못 지키게 되므로, 실제 존재하는 파일만
// 등록함). paul_brand.png는 관리자가 만든 매니페스트/README에는 있지만
// 실제 파일은 아직 폴더에 없음 — 그래서 이 항목만 지금은 emoji(🐾)로
// 보임, 나중에 파일이 추가되면 자동으로 바뀜.
export const PAUL_REACTIONS = [
  // ── Success ─────────────────────────────────────────────────────────────
  { id: 'happy',     category: 'success', image: '/assets/paul/paul_happy.png',     emoji: '😊', message: '잘했어요!',   sound: '/success.wav', rarity: 'common' },
  { id: 'best',      category: 'success', image: '/assets/paul/paul_best.png',      emoji: '👍', message: '최고예요!',   sound: '/success.wav', rarity: 'common' },
  { id: 'perfect',   category: 'success', image: '/assets/paul/paul_perfect.png',   emoji: '🤩', message: 'Perfect!',   sound: '/success.wav', rarity: 'common' },
  { id: 'great',     category: 'success', image: '/assets/paul/paul_great.png',     emoji: '👏', message: 'Great!',     sound: '/success.wav', rarity: 'common' },
  { id: 'excellent', category: 'success', image: '/assets/paul/paul_excellent.png', emoji: '😎', message: 'Excellent!', sound: '/success.wav', rarity: 'common' },
  { id: 'levelup',   category: 'success', image: '/assets/paul/paul_levelup.png',   emoji: '🏆', message: '레벨업!',     sound: '/success.wav', rarity: 'rare' },

  // ── Retry / Wrong (오답이지만 절대 혼내지 않음) ─────────────────────────
  { id: 'thinking',  category: 'retry', image: '/assets/paul/paul_thinking.png', emoji: '🤔', message: '다시 한번 생각해보세요!', sound: null, rarity: 'common' },
  { id: 'almost',    category: 'retry', image: '/assets/paul/paul_almost.png',   emoji: '💪', message: '거의 다 왔어요!',         sound: null, rarity: 'common' },
  { id: 'sad',       category: 'retry', image: '/assets/paul/paul_sad.png',      emoji: '😢', message: '괜찮아요, 정답을 확인해봐요', sound: null, rarity: 'common' },
  { id: 'cry',       category: 'retry', image: '/assets/paul/paul_cry.png',      emoji: '🥲', message: '한 번 더 해볼까요?',       sound: null, rarity: 'common' },
  { id: 'sorry',     category: 'retry', image: '/assets/paul/paul_sorry.png',    emoji: '🙏', message: '아쉬워요!',               sound: null, rarity: 'common' },
  { id: 'one_more',  category: 'retry', image: '/assets/paul/paul_one_more.png', emoji: '❤️', message: '한 번 더 해볼까요?',       sound: null, rarity: 'common' },

  // ── Etc (인사/모드 안내/브랜드) ──────────────────────────────────────────
  { id: 'hello',      category: 'etc', image: '/assets/paul/paul_hello.png',      emoji: '👋', message: '안녕하세요!',     sound: null, rarity: 'common' },
  { id: 'lets_learn', category: 'etc', image: '/assets/paul/paul_lets_learn.png', emoji: '📖', message: "Let's learn!",  sound: null, rarity: 'common' },
  { id: 'study',      category: 'etc', image: '/assets/paul/paul_study.png',      emoji: '✏️', message: '공부 시작!',      sound: null, rarity: 'common' },
  { id: 'reading',    category: 'etc', image: '/assets/paul/paul_reading.png',    emoji: '📚', message: '함께 읽어봐요!',   sound: null, rarity: 'common' },
  { id: 'love',       category: 'etc', image: '/assets/paul/paul_love.png',       emoji: '💜', message: '응원해요!',       sound: null, rarity: 'common' },
  { id: 'brand',      category: 'etc', image: '/assets/paul/paul_brand.png',      emoji: '🐾', message: '폴이지보카!',     sound: null, rarity: 'common' },
]

export function getReactionById(id) {
  return PAUL_REACTIONS.find(r => r.id === id) || null
}

// 카테고리/메시지 풀마다 "마지막으로 뽑힌 것"을 따로 추적하는 공용
// no-repeat 랜덤 선택기 — 모듈 전역(speech.js의 _currentAudio 같은 기존
// 싱글톤 패턴과 동일)이라 화면이 바뀌어도 "연속 반복 방지"가 유지됨.
const _lastShown = {}
function pickNoRepeat(items, poolKey, getKey) {
  if (!items || items.length === 0) return null
  const last = _lastShown[poolKey]
  const candidates = items.length > 1 ? items.filter(x => getKey(x) !== last) : items
  const picked = candidates[Math.floor(Math.random() * candidates.length)]
  _lastShown[poolKey] = getKey(picked)
  return picked
}

// 이미지가 속한 3개 카테고리(success/retry/etc) 안에서 랜덤 하나 — 직전과
// 같은 캐릭터는 연속으로 안 나옴. resolveReaction() 내부에서만 쓰는
// 하위 헬퍼(카테고리 매칭만 함, id·별칭 폴백은 안 함) — 바깥에서 카테고리
// 랜덤이 필요하면 pickReaction()(아래, resolveReaction의 별칭)을 쓸 것.
function pickByFolder(category) {
  const pool = PAUL_REACTIONS.filter(r => r.category === category)
  return pickNoRepeat(pool, `img:${category}`, r => r.id)
}

// 메시지는 이미지와 완전히 독립적으로 5개 카테고리(성공/실패/레벨업/
// 격려/미션완료)에서 따로 랜덤 뽑음 — 같은 캐릭터가 나와도 문구는 매번
// 달라질 수 있음.
const MESSAGE_POOLS = {
  success:   ['잘했어요!', '최고예요!', 'Perfect!', 'Great!', 'Excellent!', '완벽해요!'],
  fail:      ['괜찮아요!', '아쉬워요, 정답을 확인해봐요', '미안해하지 않아도 돼요!', '다음엔 꼭 맞힐 거예요!'],
  levelup:   ['레벨업!', '한 단계 성장했어요!', '축하해요, 레벨업!'],
  encourage: ['거의 다 왔어요!', '다시 한번 생각해보세요!', '조금만 더 힘내요!', '할 수 있어요, 파이팅!', '한 번 더 도전!'],
  complete:  ['미션 완료!', '오늘도 해냈어요!', '수고했어요!'],
}

export function pickMessage(msgCategory) {
  const pool = MESSAGE_POOLS[msgCategory]
  if (!pool) return null
  return pickNoRepeat(pool, `msg:${msgCategory}`, m => m)
}

// 각 id가 어떤 "메시지 카테고리"에 속하는지 — 이미지(3개 카테고리)와
// 메시지(5개 카테고리)가 서로 다른 분류라서 필요한 매핑. 여기 없는 id
// (hello, lets_learn, study, reading, love, brand)는 상황이 고유해서
// 랜덤 메시지 풀 없이 자기 자신의 고정 message를 그대로 씀.
const ID_TO_MSG_CATEGORY = {
  happy: 'success', best: 'success', perfect: 'success', great: 'success', excellent: 'success',
  levelup: 'levelup',
  thinking: 'encourage', almost: 'encourage', one_more: 'encourage',
  sad: 'fail', cry: 'fail', sorry: 'fail',
}

// 메시지 카테고리 이름(fail/encourage — levelup·success는 이미 카테고리/
// id 이름과 겹침)을 type으로 직접 불렀을 때 어떤 이미지 후보들 중에서
// 뽑을지 — ID_TO_MSG_CATEGORY의 역인덱스. "미션완료(complete)"에 대응하는
// 전용 이미지가 아직 없어서, 성공 폴더 이미지를 재사용하되 문구만
// "미션 완료!" 계열로 나가게 함.
const MSG_CATEGORY_TO_IDS = Object.entries(ID_TO_MSG_CATEGORY).reduce((acc, [id, cat]) => {
  (acc[cat] ||= []).push(id)
  return acc
}, {})
MSG_CATEGORY_TO_IDS.complete = PAUL_REACTIONS.filter(r => r.category === 'success').map(r => r.id)

// PaulReaction의 `type` prop 하나로 아래 세 가지를 전부 커버하는 통합
// 리졸버:
//   1. type이 정확한 id면(예: "thinking") 그 이미지를 그대로 씀
//   2. type이 카테고리 이름이면("success"/"retry"/"etc") 그 안에서 랜덤
//   3. type이 메시지 카테고리 별칭이면("fail"/"encourage"/"complete") 그
//      카테고리에 속한 이미지들 중 랜덤
// 이미지가 정해지면, 그 id가 메시지 카테고리를 갖고 있을 때만 메시지도
// 별도로 랜덤 교체 — 없으면 그 리액션 고유의 기본 문구 사용.
export function resolveReaction(type) {
  if (!type) return null
  let base = getReactionById(type) || pickByFolder(type)
  if (!base && MSG_CATEGORY_TO_IDS[type]) {
    const candidates = PAUL_REACTIONS.filter(r => MSG_CATEGORY_TO_IDS[type].includes(r.id))
    base = pickNoRepeat(candidates, `img-alias:${type}`, r => r.id)
  }
  if (!base) return null
  const msgCategory = ID_TO_MSG_CATEGORY[base.id]
  const message = msgCategory ? (pickMessage(msgCategory) || base.message) : base.message
  return { ...base, message }
}

// 이전 버전(퀴즈/쓰기/레벨업미션/미니게임/단어학습에 이미 붙여놓은 호출부)
// 이 쓰던 이름을 그대로 유지 — resolveReaction()의 별칭. 예전엔 category
// 이름만 받았지만(success/encourage/levelup 등) resolveReaction이 id·
// 카테고리·메시지별칭을 모두 처리하므로 기존 호출부(pickReaction
// ('encourage'), pickReaction('levelup') 등)가 하나도 안 깨짐 — 오히려
// 메시지까지 랜덤화되는 효과를 덤으로 얻음.
export function pickReaction(type) {
  return resolveReaction(type)
}
