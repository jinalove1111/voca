// P9(2026-09-03, docs/REWARD_LOOP_AUDIT_2026-09-03.md §12) — 관리자
// StudentDirectory 카드에 학생별 보상 정보를 "최소" 노출하기 위한 순수
// 파생 모듈. import 없음(zero imports) — supabase/React 어느 쪽도 이
// 파일 안에서 직접 건드리지 않는다. 호출부(StudentDirectory.jsx)가 이미
// fetchDashboardData로 받아온 student_progress 원본 행(select *)을 그대로
// 넘기면, 화면에 필요한 값만 뽑아 한 줄 문자열로 접는다.
//
// CLAUDE.md 규칙 4/11 — 이 파일도, 이 파일이 읽는 progressRow도 학생 식별에
// 이름을 쓰지 않고(호출부가 이미 UUID로 조회한 결과를 그대로 넘김),
// pin_hash/pin_fail_count/pin_locked_until 어느 컬럼도 참조하지 않는다
// (student_progress 테이블 자체에 그 컬럼들이 없음 — PIN은 별도 students
// 테이블 컬럼이고, 그쪽은 api/*.js 서버 전용이라 여기 관여할 이유가
// 애초에 없다).
//
// gardenPoints 공식은 src/hooks/useStudent.js의 computeGardenPoints
// (cleared ∪ completedWords ∪ clearedWords의 distinct union size)와 동일
// 의미론을 이 모듈 안에서 독립적으로 재구현한다 — src/utils/attachment/**
// 는 이번 세션에서 다른 에이전트가 동시 작업 중인 소유 파일이라(파일당
// 소유권 원칙, 규칙 16) import하지 않는다. 공식 자체가 3줄짜리 순수
// 집합 연산이라 재구현 비용/드리프트 리스크가 낮다고 판단했다(값이 갈리면
// 두 구현 다 "distinct union size"라는 같은 정의를 따르므로 나란히
// 고치면 됨).
//
// reward_type/stars_delta/created_at 필드명은 src/utils/rewardEngine.js
// buildRewardEntry()가 실제로 저장하는 shape과 1:1(그 파일 헤더 주석
// "supabase_v3_36의 reward_ledger 컬럼과 1:1 대응" 참고) — 여기서는 그
// 모듈도 import하지 않고 필드명만 그대로 재사용한다(zero-imports 제약).

function asArray(v) {
  return Array.isArray(v) ? v : []
}

function asFiniteNumber(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// useStudent.js computeGardenPoints와 동일 정의 — 3개 배열의 distinct union 크기.
function computeGardenPointsLocal(clearedArr, completedArr, clearedWordArr) {
  return new Set([
    ...asArray(clearedArr),
    ...asArray(completedArr),
    ...asArray(clearedWordArr),
  ]).size
}

// rewardLedger(append-only 배열)에서 created_at 기준 가장 최근 항목 1개를
// 고른다. created_at이 없거나 파싱 불가한 항목도 배열 순서상 마지막이면
// 그냥 "최근"으로 취급(파싱 실패로 항목 자체를 버리지 않음 — 오래된/손상된
// 레코드에서도 카드가 조용히 "보상 없음"이 되지 않게).
function pickLastReward(rewardLedger) {
  const list = asArray(rewardLedger).filter((e) => e && typeof e === 'object')
  if (list.length === 0) return null

  let best = null
  let bestTime = -Infinity
  list.forEach((entry, index) => {
    const parsed = Date.parse(entry.created_at)
    const time = Number.isFinite(parsed) ? parsed : index // 파싱 실패 시 배열 순서로 대체
    if (best === null || time >= bestTime) {
      best = entry
      bestTime = time
    }
  })
  if (!best) return null

  const type = typeof best.reward_type === 'string' && best.reward_type.length > 0
    ? best.reward_type
    : '(알 수 없음)'
  const stars = asFiniteNumber(best.stars_delta, 0)
  const date = typeof best.created_at === 'string' && best.created_at.length >= 10
    ? best.created_at.slice(0, 10)
    : null
  return { type, stars, date }
}

// progressRow: student_progress 테이블 select('*') 결과 1행(또는 null/
// undefined — 아직 학습 기록이 없는 학생). progress_data가 없거나
// rewardLedger/hatInventory 등 신규 필드가 아직 없는 레거시 레코드도
// 던지지 않고 전부 0/null로 안전하게 접는다.
//
// xp는 이 함수가 직접 조회하지 않는다(zero-imports 제약 + 배치 쿼리
// 원칙) — 호출부가 fetchXpTotals(wordLibrary.js, 기존 관리자 배치 헬퍼)로
// 이미 따로 구해둔 값이 있으면 progressRow.xpTotal 필드에 얹어서 넘기면
// 되고, 없으면 xp: null로 돌아간다(카드는 그 경우 XP 줄을 아예 생략).
export function summarizeStudentRewards(progressRow) {
  const row = progressRow && typeof progressRow === 'object' ? progressRow : {}
  const pd = row.progress_data && typeof row.progress_data === 'object' ? row.progress_data : {}

  const totalStars = asFiniteNumber(row.total_stars, 0)
  // streak_count가 우선(동기화 시점 기준 최신 denormalized 값, wordLibrary.js
  // syncStudentProgress 참고) — 레거시 행(v1.3 시절, streak_count 이전)은
  // streak 컬럼으로 폴백.
  const streak = Object.prototype.hasOwnProperty.call(row, 'streak_count')
    ? asFiniteNumber(row.streak_count, 0)
    : asFiniteNumber(row.streak, 0)
  const gardenPoints = computeGardenPointsLocal(pd.cleared, pd.completedWords, pd.clearedWords)
  const hatCount = asArray(pd.hatInventory).length
  const lastStudiedDate = typeof row.last_studied_date === 'string' && row.last_studied_date.length > 0
    ? row.last_studied_date
    : null
  const lastReward = pickLastReward(pd.rewardLedger)
  const xp = Number.isFinite(Number(row.xpTotal)) ? Number(row.xpTotal) : null

  return { totalStars, streak, gardenPoints, hatCount, lastStudiedDate, lastReward, xp }
}

// StudentDirectory.jsx 카드 안에 그대로 렌더할 한 줄(모바일에서 줄바꿈은
// 허용, 문자열 자체는 항상 한 줄 — 세그먼트를 " · "로만 이어붙임).
export function formatAdminRewardLine(summary) {
  const s = summary && typeof summary === 'object' ? summary : {}
  const segments = []
  segments.push(`⭐ ${asFiniteNumber(s.totalStars, 0)}`)
  segments.push(`🔥 ${asFiniteNumber(s.streak, 0)}일`)
  segments.push(`🌱 정원 ${asFiniteNumber(s.gardenPoints, 0)}`)
  segments.push(`🎩 ${asFiniteNumber(s.hatCount, 0)}`)
  segments.push(`최근 학습 ${s.lastStudiedDate || '없음'}`)
  segments.push(
    s.lastReward
      ? `최근 보상 ${s.lastReward.type}(+${asFiniteNumber(s.lastReward.stars, 0)}) ${s.lastReward.date || ''}`.trim()
      : '최근 보상 없음'
  )
  if (typeof s.xp === 'number') {
    segments.push(`XP ${s.xp}`)
  }
  return segments.join(' · ')
}
