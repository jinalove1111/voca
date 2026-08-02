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
//
// 2026-08-02 확장(docs/reading/07-encouragement-messages.md, "코드
// 미적용" 자산 500개 중 일부를 실제로 적용) — 문서의 카테고리 매핑
// 그대로: A(정답)→success, D(훌륭해)→levelup, E(미션 완료)→complete.
// B(재도전)는 기존 fail 풀(사과·안심 톤)과 encourage 풀(도전 격려 톤)
// 양쪽에 어울려 앞부분은 fail로, 뒷부분+C(거의 다 왔어)는 encourage로
// 나눠 옮겼다 — 문서 톤 가이드(처벌/비교/압박/손실 위협 언어 금지)를
// 그대로 따르는 문장만 골랐고, 구조/호출부/pickNoRepeat 로직은 무변경.
const MESSAGE_POOLS = {
  success: [
    '잘했어요!', '최고예요!', 'Perfect!', 'Great!', 'Excellent!', '완벽해요!',
    '정답이에요! 차분하게 잘 골랐어요.', '훌륭한 답이에요! 뜻을 제대로 기억했네요.',
    '맞았어요! 철자까지 정확했어요.', '정답! 눈이 반짝이는 게 폴한테도 보여요.',
    '정답이에요! 보기 하나하나 잘 비교했군요.', '맞아요! 어려운 단어였는데 기억하고 있었네요.',
    '맞았어요! 뜻과 소리를 둘 다 기억했네요.', '맞혔어요! 읽고, 생각하고, 답하고 — 완벽한 순서였어요.',
    '맞았어요! 자신 있게 답하는 모습이 좋았어요.', '맞아요! 폴이 살짝 감동했어요.',
    '정답이에요! 손끝까지 집중한 게 느껴졌어요.', '정답이에요! 어려운 발음의 단어도 척척이네요.',
    '맞혔어요! 기억을 끝까지 더듬어 찾아낸 답이네요.', '맞았어요! 소리 내어 읽은 보람이 있네요.',
    '정답! 이 기세라면 오늘 목표는 거뜬하겠어요.', '정답이에요! 침착함이 최고의 무기라는 걸 보여줬어요.',
    '맞아요! 정확하게 알고 답한 게 느껴져요.', '맞았어요! 폴이 별 하나를 마음속으로 더 줄게요.',
    '정답! 단어의 첫 글자만 보고도 알아챘네요.', '맞혔어요! 이제 이 단어로 문장도 만들 수 있겠어요.',
    '정답이에요! 손을 들고 답하듯 씩씩했어요.', '맞아요! 조심스럽지만 정확한 답이었어요.',
    '정답! 목소리 내어 읽던 그 단어였죠?', '맞았어요! 정확한 답 하나가 큰 자신감이 돼요.',
  ],
  fail: [
    '괜찮아요!', '아쉬워요, 정답을 확인해봐요', '미안해하지 않아도 돼요!', '다음엔 꼭 맞힐 거예요!',
    '괜찮아요! 한 번 더 천천히 봐요.', '틀려도 배우는 중이라는 뜻이에요. 다시 가볼까요?',
    '아직 끝난 게 아니에요. 폴이 옆에 있을게요.', '이 단어가 조금 낯설었나 봐요. 다시 만나보면 돼요.',
    '실수는 기억에 오래 남는 좋은 선생님이에요. 한 번 더!', '천천히 해도 괜찮아요. 다시 도전해봐요.',
    '문장을 소리 내어 읽고 다시 골라볼까요?', '폴도 처음엔 이 단어를 헷갈렸답니다. 다시 해봐요.',
    '지금 틀린 덕분에 다음엔 안 틀릴 거예요.', '한 번 더 보면 분명 보일 거예요.',
    '다시 한번! 이번엔 첫 글자부터 차근차근요.', '괜찮아요, 생각할 시간은 충분해요.',
    '답을 듣고 나서 다시 골라봐도 좋아요.', '어려운 문제였어요. 다시 도전하는 게 진짜 용기예요.',
    '조금 헷갈렸죠? 뜻을 다시 확인하고 가봐요.', '한 글자씩 다시 살펴볼까요? 폴이 기다릴게요.',
    '틀린 답도 공부의 한 조각이에요. 다시 가요!', '이번엔 소리를 먼저 들어보고 답해볼까요?',
    '괜찮아요! 다시 하는 사람만 늘 수 있어요.', '폴은 재도전하는 모습이 제일 멋지다고 생각해요.',
  ],
  levelup: [
    '레벨업!', '한 단계 성장했어요!', '축하해요, 레벨업!',
    '훌륭해요! 오늘 실력이 한 단계 올라섰어요.', '놀라워요! 어려운 단어를 이렇게 척척 해내다니요.',
    '대단한 성장이에요! 폴이 다 기록해 두고 있어요.', '감탄했어요! 폴이 모자를 벗고 인사할게요.',
    '훌륭해요! 문제를 푸는 눈빛이 달라졌어요.', '최고 수준이에요! 이 단어들은 완전 정복이네요.',
    '훌륭한 발전이에요! 지난주보다 훨씬 단단해졌어요.', '완벽했어요! 처음부터 끝까지 스스로 해냈어요.',
    '멋져요! 단어 마스터라는 말이 딱 어울려요.', '훌륭해요! 폴이 아는 가장 성실한 학생 중 한 명이에요.',
    '훌륭해요! 오답이었던 단어가 이제 자신 있는 단어가 됐네요.', '훌륭해요! 폴의 눈에는 미래의 영어 고수가 보여요.',
    '완벽한 성장 곡선이에요! 폴이 그래프를 그려주고 싶네요.', '멋진 완주였어요! 처음의 다짐을 끝까지 지켰네요.',
    '대단해요! 이 페이스로 유닛 하나를 통째로 끝냈어요.', '대단한 도전 정신이에요! 어려운 단계도 겁내지 않았어요.',
    "멋져요! 네 사전에 '포기'라는 단어는 없나 봐요.", '놀라워요! 폴이 준비한 문제가 모자랄 지경이에요.',
    '멋진 성과예요! 스스로 만든 결과라 더 값져요.', '대단해요! 어려움을 만나도 흔들리지 않았어요.',
    '대단해요! 스스로 복습까지 챙기는 모습이 프로예요.', '멋져요! 폴은 오늘 네 덕분에 더 좋은 선생님이 됐어요.',
    '훌륭해요! 네 노력이 오늘의 주인공이에요.', '완벽했어요! 이보다 좋은 마무리는 없을 거예요.',
  ],
  encourage: [
    '거의 다 왔어요!', '다시 한번 생각해보세요!', '조금만 더 힘내요!', '할 수 있어요, 파이팅!', '한 번 더 도전!',
    '다시 한번 해봐요. 이 단어는 곧 네 편이 될 거예요.', '다음 시도가 진짜예요. 한 번 더 가봐요!',
    '이 문제는 원래 어려운 문제예요. 다시 천천히요.', '다시 해볼까요? 이번엔 힌트를 잘 살펴봐요.',
    '아까보다 분명 가까워졌어요. 한 번 더!', '한 번 틀렸다고 달라지는 건 없어요. 다시 가봐요.',
    '다음 시도에서 맞히면 기억에 두 배로 남아요.', '헷갈린 부분만 다시 보면 금방이에요.',
    '폴과 함께 다시 읽어봐요. 준비됐나요?', '다시 도전하면 폴이 힌트를 조금 더 보여줄게요.',
    '거의 다 왔어요! 딱 한 걸음 남았어요.', '거의 완성이에요! 마무리만 남았어요.',
    '정상이 보여요! 몇 걸음만 더 가요.', '반 이상 왔어요 — 아니, 거의 전부 왔어요!',
    '발음이 거의 완벽했어요! 한 번만 더 또렷하게요.', '거의 맞힌 답이었어요. 다음 답은 분명 정답이에요.',
    '정답까지 딱 한 획 차이였어요!', '여기까지 온 것만으로도 대단한데, 끝까지 가면 더 멋져요!',
    '거의 정답! 소리는 맞았고 글자만 살짝 달랐어요.', '정답의 문고리를 잡았어요. 이제 돌리기만 해요!',
    '좋은 흐름이에요! 이대로 마지막까지 가봐요.', '거의 왔어요! 이 단어만 넘으면 내리막길이에요.',
    '거의 맞았어요! 단어의 가운데 부분만 다시 봐요.', '거의 정답이었어요! 감은 완전히 잡았어요.',
    '거의 왔어요! 마무리는 언제나 네 몫, 응원은 폴 몫이에요.',
  ],
  complete: [
    '미션 완료!', '오늘도 해냈어요!', '수고했어요!',
    '미션 완료! 오늘도 약속을 지켰네요.', '다 해냈어요! 이 기분, 오래 기억해요.',
    '오늘 몫을 다 해냈어요! 남은 시간은 마음껏 쉬어요.', '오늘도 끝까지 해냈어요! 폴은 그게 제일 기뻐요.',
    '오늘의 미션을 모두 마쳤어요! 정말 성실했어요.', '미션 클리어! 폴이 기쁨의 티타임을 준비할게요.',
    '해냈어요! 오늘의 완료가 내일의 자신감이 돼요.', '미션 성공! 조용히, 그러나 확실하게 해냈어요.',
    '오늘의 미션 클리어! 기록은 폴이 잘 보관할게요.', '미션 완료! 내일의 너에게 좋은 선물을 남겼어요.',
    '미션 완료! 폴이 오늘의 하이라이트를 기억해 둘게요.', '끝까지 완주! 폴의 박수 소리가 들리나요?',
    '미션 클리어! 배운 단어들이 머릿속에 잘 정리됐어요.', '오늘의 미션 끝! 이렇게 또 하나의 벽돌을 쌓았어요.',
    '다 끝냈어요! 쉬는 것도 공부의 한 부분이에요.', '미션 완료! 처음부터 끝까지 네 힘으로 해냈어요.',
    '미션 클리어! 폴의 하루 중 가장 뿌듯한 순간이에요.', '다 했어요! 폴이 오늘의 완료를 축하하며 살짝 목례할게요.',
    '오늘의 미션 클리어! 정직하게 걸어온 하루였어요.', '다 끝냈어요! 이 뿌듯함은 오늘 하루 종일 유효해요.',
    '미션 완료! 오늘의 너에게 백 점을 줄게요.', '끝까지 해냈어요! 마무리가 이렇게 멋질 수가요.',
    '다 해냈어요! 오늘의 완료 기록이 반짝이고 있어요.', '오늘의 미션 끝! 폴과 하이파이브 한 번 해요!',
  ],
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
let _reactionAudio = null
export function stopReactionSound() {
  if (_reactionAudio) {
    try { _reactionAudio.pause() } catch {}
    _reactionAudio = null
  }
}

export function playReactionSound(reaction) {
  if (!reaction?.sound) return
  stopReactionSound()
  const audio = new Audio(reaction.sound)
  audio.volume = 0.75
  _reactionAudio = audio
  audio.play()?.catch(() => {})
}
