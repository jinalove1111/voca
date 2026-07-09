// Project Paul의 브랜드 마스코트 "폴 선생님" 리액션 레지스트리.
//
// CTO 설계 변경(2026-07-08): 스프라이트 시트를 잘라 쓰는 방식은 폐기하고
// 개별 PNG Asset 방식으로 관리함 — 실제 이미지 파일은 src/assets/paul/
// index.js 한 곳에서만 import하고, 이 파일은 그 named export만 가져다
// "어떤 상황에 어떤 캐릭터/메시지"를 쓸지 데이터로 정의함.
//
// 아직 없는 캐릭터는 여기 등록하지 않음 — 존재하지 않는 파일을 가리키는
// 이모지 대체 같은 건 없음(요청사항: "브랜드 캐릭터가 없으면 기능이
// 실패한 것으로 간주"). 실제 개별 PNG가 준비되면 src/assets/paul/
// index.js에 한 줄 추가 + 아래 PAUL_REACTIONS에 항목 추가하면 끝.
import {
  paulHappy, paulBest, paulPerfect, paulGreat, paulExcellent, paulLevelup,
  paulThinking, paulAlmost, paulSad, paulCry, paulSorry, paulOneMore, paulRetry,
  paulHello, paulLetsLearn, paulStudy, paulReading, paulLove, paulPonder,
  paulBrand, paulBrandLove,
} from '../assets/paul'

// 2026-07-09: 아래 21개는 전부 원본이 스프라이트 시트에서 잘라낸 저해상도
// 소스(natural size 111~191px — 512px 문턱값 미달)라, 정식 고해상도 PNG로
// 교체되기 전까지는 큰 사이즈(md/lg)에서 화질이 다소 흐릿하게 보일 수
// 있다. 한 차례 전체 비활성화했었으나(운영자 지시), "캐릭터가 안 보이는
// 것보다 저해상도라도 보이는 게 낫다"는 판단으로 다시 활성화함 — 화질
// 개선은 고해상도 공식 PNG가 준비되는 대로 이 배열의 image만 교체하면
// 됨(구조 변경 불필요).
export const PAUL_REACTIONS = [
  // ── Success ─────────────────────────────────────────────────────────────
  { id: 'happy',     category: 'success', image: paulHappy,     message: '잘했어요!',   sound: '/success.wav', rarity: 'common' },
  { id: 'best',      category: 'success', image: paulBest,      message: '최고예요!',   sound: '/success.wav', rarity: 'common' },
  { id: 'perfect',   category: 'success', image: paulPerfect,   message: 'Perfect!',   sound: '/success.wav', rarity: 'common' },
  { id: 'great',     category: 'success', image: paulGreat,     message: 'Great!',     sound: '/success.wav', rarity: 'common' },
  { id: 'excellent', category: 'success', image: paulExcellent, message: 'Excellent!', sound: '/success.wav', rarity: 'common' },
  { id: 'levelup',   category: 'success', image: paulLevelup,   message: '레벨업!',     sound: '/success.wav', rarity: 'rare' },

  // ── Fail (오답이지만 절대 혼내지 않음) ───────────────────────────────────
  { id: 'thinking',  category: 'fail', image: paulThinking, message: '다시 한번 생각해보세요!', sound: null, rarity: 'common' },
  { id: 'almost',    category: 'fail', image: paulAlmost,   message: '거의 다 왔어요!',         sound: null, rarity: 'common' },
  { id: 'sad',       category: 'fail', image: paulSad,      message: '괜찮아요, 정답을 확인해봐요', sound: null, rarity: 'common' },
  { id: 'cry',       category: 'fail', image: paulCry,      message: '한 번 더 해볼까요?',       sound: null, rarity: 'common' },
  { id: 'sorry',     category: 'fail', image: paulSorry,    message: '아쉬워요!',               sound: null, rarity: 'common' },
  { id: 'one_more',  category: 'fail', image: paulOneMore,  message: '한 번 더 해볼까요?',       sound: null, rarity: 'common' },
  { id: 'retry',     category: 'fail', image: paulRetry,    message: '다시 해봐요!',             sound: null, rarity: 'common' },

  // ── Study (인사/모드 안내) ───────────────────────────────────────────────
  { id: 'hello',      category: 'study', image: paulHello,     message: '안녕하세요!',   sound: null, rarity: 'common' },
  { id: 'lets_learn', category: 'study', image: paulLetsLearn, message: "Let's learn!", sound: null, rarity: 'common' },
  { id: 'study',      category: 'study', image: paulStudy,     message: '공부 시작!',    sound: null, rarity: 'common' },
  { id: 'reading',    category: 'study', image: paulReading,   message: '함께 읽어봐요!', sound: null, rarity: 'common' },
  { id: 'love',       category: 'study', image: paulLove,      message: '응원해요!',     sound: null, rarity: 'common' },
  { id: 'ponder',     category: 'study', image: paulPonder,    message: '생각해 보세요!', sound: null, rarity: 'common' },
  { id: 'brand',      category: 'study', image: paulBrand,     message: '폴이지 보카!',   sound: null, rarity: 'common' },
  { id: 'brand_love', category: 'study', image: paulBrandLove, message: '폴이지 보카!',   sound: null, rarity: 'common' },
]

// 원래 요청받은 전체 캐릭터 목록 중, 아직 개별 PNG가 없어서 위에 등록되지
// 못한 것들 — 콘솔에 한 번만 경고. src/assets/paul/index.js에 실제 PNG를
// import 추가하고 위 PAUL_REACTIONS에 항목을 추가하면 됨.
const REQUESTED_BUT_MISSING = [
  'celebrate', 'star', 'cheerup', 'its_ok', 'fight',
  'writing', 'speaking', 'mission', 'good_job', 'birthday',
  'super', 'astronaut', 'detective', 'magician', 'professor', 'sports',
  'artist', 'chef', 'musician', 'ninja',
]
if (REQUESTED_BUT_MISSING.length > 0) {
  console.warn(
    `[Paul] ${REQUESTED_BUT_MISSING.length}개 캐릭터 PNG가 아직 없어서 사용할 수 없습니다 (이모지 대체 없음 — 요청 시 아무것도 표시되지 않고 이 경고가 뜹니다):`,
    REQUESTED_BUT_MISSING.join(', ')
  )
}

export function getReactionById(id) {
  const found = PAUL_REACTIONS.find(r => r.id === id) || null
  if (!found && REQUESTED_BUT_MISSING.includes(id)) {
    console.warn(`[Paul] "${id}" 캐릭터는 아직 개별 PNG가 없어 표시할 수 없습니다.`)
  }
  return found
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

// 이미지가 속한 3개 카테고리(success/fail/study) 안에서 랜덤 하나 — 직전과
// 같은 캐릭터는 연속으로 안 나옴. resolveReaction() 내부에서만 쓰는 하위
// 헬퍼(카테고리 매칭만 함, id·별칭 폴백은 안 함) — 바깥에서 카테고리 랜덤이
// 필요하면 pickReaction()(아래, resolveReaction의 별칭)을 쓸 것.
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
// (hello, lets_learn, study, reading, love, ponder, brand, brand_love)는
// 상황이 고유해서 랜덤 메시지 풀 없이 자기 자신의 고정 message를 그대로 씀.
const ID_TO_MSG_CATEGORY = {
  happy: 'success', best: 'success', perfect: 'success', great: 'success', excellent: 'success',
  levelup: 'levelup',
  thinking: 'encourage', almost: 'encourage', one_more: 'encourage', retry: 'encourage',
  sad: 'fail', cry: 'fail', sorry: 'fail',
}

// 메시지 카테고리 이름(fail/encourage — levelup·success는 이미 카테고리/
// id 이름과 겹침)을 type으로 직접 불렀을 때 어떤 이미지 후보들 중에서
// 뽑을지 — ID_TO_MSG_CATEGORY의 역인덱스. "미션완료(complete)"에 대응하는
// 전용 이미지가 아직 없어서, 성공 카테고리 이미지를 재사용하되 문구만
// "미션 완료!" 계열로 나가게 함.
const MSG_CATEGORY_TO_IDS = Object.entries(ID_TO_MSG_CATEGORY).reduce((acc, [id, cat]) => {
  (acc[cat] ||= []).push(id)
  return acc
}, {})
MSG_CATEGORY_TO_IDS.complete = PAUL_REACTIONS.filter(r => r.category === 'success').map(r => r.id)

// PaulReaction의 `type` prop 하나로 아래 세 가지를 전부 커버하는 통합
// 리졸버:
//   1. type이 정확한 id면(예: "thinking") 그 이미지를 그대로 씀
//   2. type이 카테고리 이름이면("success"/"fail"/"study") 그 안에서 랜덤
//   3. type이 메시지 카테고리 별칭이면("encourage"/"complete") 그 카테고리에
//      속한 이미지들 중 랜덤
// 이미지가 정해지면, 그 id가 메시지 카테고리를 갖고 있을 때만 메시지도
// 별도로 랜덤 교체 — 없으면 그 리액션 고유의 기본 문구 사용.
// 어떤 경로로도 못 찾으면 null — 호출부(PaulReaction)가 이모지 등으로
// 대신 채우지 않고 그냥 아무것도 안 그림 + 콘솔 경고.
export function resolveReaction(type) {
  if (!type) return null
  let base = getReactionById(type) || pickByFolder(type)
  if (!base && MSG_CATEGORY_TO_IDS[type]) {
    const candidates = PAUL_REACTIONS.filter(r => MSG_CATEGORY_TO_IDS[type].includes(r.id))
    base = pickNoRepeat(candidates, `img-alias:${type}`, r => r.id)
  }
  if (!base) {
    if (REQUESTED_BUT_MISSING.includes(type)) {
      console.warn(`[Paul] type="${type}"는 아직 개별 PNG가 없어 표시할 수 없습니다.`)
    }
    return null
  }
  const msgCategory = ID_TO_MSG_CATEGORY[base.id]
  const message = msgCategory ? (pickMessage(msgCategory) || base.message) : base.message
  return { ...base, message }
}

// 이전 버전(퀴즈/쓰기/레벨업미션/미니게임/단어학습에 이미 붙여놓은 호출부)
// 이 쓰던 이름을 그대로 유지 — resolveReaction()의 별칭.
export function pickReaction(type) {
  return resolveReaction(type)
}

// HeroReaction은 순수 프레젠테이션 컴포넌트라 효과음을 재생하지 않는다
// (예전 PaulReaction은 자기 안에서 재생했음) — 리액션을 고르는 시점에
// 호출부가 이 함수를 직접 불러 재생한다. 화면이 이미 자기 효과음을
// 재생했으면(예: playSuccessSound() 중복 방지) 그냥 호출을 생략하면 됨.
export function playReactionSound(reaction) {
  if (!reaction?.sound) return
  const audio = new Audio(reaction.sound)
  audio.volume = 0.75
  audio.play()?.catch(() => {})
}
