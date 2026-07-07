// Project Paul의 브랜드 마스코트 "폴 선생님" 리액션 레지스트리 — 데이터
// 기반 구조라 관리자가 assets/paul/paul_*.png(투명 배경)를 public/assets/
// paul/ 에 추가하기만 하면 코드 수정 없이 바로 반영됨. 아직 실제 PNG가
// 없는 동안에는 PaulReaction.jsx가 image 로드 실패 시 자동으로 emoji로
// 대체 표시함(onError fallback) — 이 파일은 그 스왑 대상 목록.
//
// category는 두 용도로 쓰임:
//   1. pickReaction(category)로 "그 상황에 맞는 랜덤 리액션" 하나를 뽑을 때
//   2. 같은 카테고리 안에서는 직전에 보여준 것과 다른 것이 나오도록(연속
//      반복 방지) 추적하는 단위
// id는 SpellingQuestion의 오답 4단계처럼 "이 상황엔 반드시 이 리액션"이
// 정해진 곳에서 getReactionById()로 직접 지정할 때 씀.
export const PAUL_REACTIONS = [
  // ── 성공(정답을 맞혔을 때) — 랜덤 순환 ──────────────────────────────────
  { id: 'happy',     category: 'success', image: '/assets/paul/paul_happy.png',     emoji: '😊', message: '잘했어요!',   sound: '/success.wav', rarity: 'common' },
  { id: 'best',      category: 'success', image: '/assets/paul/paul_best.png',      emoji: '👍', message: '최고예요!',   sound: '/success.wav', rarity: 'common' },
  { id: 'perfect',   category: 'success', image: '/assets/paul/paul_perfect.png',   emoji: '🤩', message: 'Perfect!',   sound: '/success.wav', rarity: 'common' },
  { id: 'great',     category: 'success', image: '/assets/paul/paul_great.png',     emoji: '👏', message: 'Great!',     sound: '/success.wav', rarity: 'common' },
  { id: 'excellent', category: 'success', image: '/assets/paul/paul_excellent.png', emoji: '😎', message: 'Excellent!', sound: '/success.wav', rarity: 'common' },

  // ── 레벨업/별/XP/트로피/연속정답/미션완료 — 큰 축하 순간 ────────────────
  { id: 'levelup',   category: 'levelup', image: '/assets/paul/paul_levelup.png',   emoji: '🏆', message: '레벨업!',     sound: '/success.wav', rarity: 'rare' },

  // ── 격려(오답이지만 혼내지 않음) — 랜덤 순환 + 쓰기 4단계는 id로 직접 지정
  { id: 'thinking',  category: 'encourage', image: '/assets/paul/paul_thinking.png', emoji: '🤔', message: '다시 한번 생각해보세요!', sound: null, rarity: 'common' },
  { id: 'almost',    category: 'encourage', image: '/assets/paul/paul_almost.png',   emoji: '💪', message: '거의 다 왔어요!',         sound: null, rarity: 'common' },
  { id: 'retry',     category: 'encourage', image: '/assets/paul/paul_retry.png',    emoji: '🔊', message: '발음을 들어볼까요?',      sound: null, rarity: 'common' },
  { id: 'sad',       category: 'encourage', image: '/assets/paul/paul_sad.png',      emoji: '😢', message: '괜찮아요, 정답을 확인해봐요', sound: null, rarity: 'common' },
  { id: 'cry',       category: 'encourage', image: '/assets/paul/paul_cry.png',      emoji: '🥲', message: '한 번 더 해볼까요?',       sound: null, rarity: 'common' },

  // ── 인사/응원/시작 — 화면 진입 등 가벼운 순간 ───────────────────────────
  { id: 'welcome', category: 'greeting', image: '/assets/paul/paul_welcome.png', emoji: '👋', message: '안녕하세요!',   sound: null, rarity: 'common' },
  { id: 'study',   category: 'greeting', image: '/assets/paul/paul_study.png',   emoji: '📖', message: "Let's learn!", sound: null, rarity: 'common' },
  { id: 'cheer',   category: 'greeting', image: '/assets/paul/paul_cheer.png',   emoji: '❤️', message: '응원해요!',     sound: null, rarity: 'common' },
  { id: 'love',    category: 'greeting', image: '/assets/paul/paul_love.png',    emoji: '💜', message: '폴이지보카!',   sound: null, rarity: 'common' },
]

export function getReactionById(id) {
  return PAUL_REACTIONS.find(r => r.id === id) || null
}

// 카테고리별 "마지막으로 보여준 id" — 모듈 전역(speech.js의 _currentAudio
// 같은 기존 싱글톤 패턴과 동일)이라 화면이 바뀌어도 "같은 캐릭터 연속
// 반복 방지"가 계속 유지됨.
const _lastShownByCategory = {}

// 해당 카테고리 안에서 직전과 다른 것을 무작위로 고름. 카테고리에 1개뿐
// 이면(levelup처럼) 그냥 그걸 반환 — 반복 방지는 2개 이상일 때만 의미있음.
export function pickReaction(category) {
  const pool = PAUL_REACTIONS.filter(r => r.category === category)
  if (pool.length === 0) return null
  const last = _lastShownByCategory[category]
  const candidates = pool.length > 1 ? pool.filter(r => r.id !== last) : pool
  const picked = candidates[Math.floor(Math.random() * candidates.length)]
  _lastShownByCategory[category] = picked.id
  return picked
}
