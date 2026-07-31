// src/learning/metrics/memoryMetrics.js — Memory Engine 관찰용 순수 집계 +
// 이벤트 이름 상수. import는 형제 순수 모듈 memory/leitner.js(.js 확장자,
// MAX_BOX/isDue 재사용 — 임계값/due 판정을 여기서 재구현하지 않음)만 —
// 번들 불필요, plain Node 하네스가 바로 import 가능.
//
// MEM_EV는 productEvents.js(analyticsMath.js의 EV 상수와 동일 관례)가
// 쓰는 "이벤트 이름만" 상수다 — supabase_v3_2_product_events.sql:13-19가
// 보여주듯 product_events 테이블에는 payload 컬럼이 없다(day-level 집계
// 전용, 개인정보/세부 데이터 0). 그래서 MEM_EV 값들도 "무슨 일이 있었다"
// 만 담고 "어떤 단어였다/몇 번이었다" 같은 세부는 절대 담지 않는다.
import { MAX_BOX, isDue } from '../memory/leitner.js'

export const MEM_EV = {
  memoryReviewSessionStarted: 'memory_review_session_started',
  memoryReviewSessionCompleted: 'memory_review_session_completed',
  memoryBoxPromoted: 'memory_box_promoted',
  memoryBoxDemoted: 'memory_box_demoted',
}

// computeBoxDistribution(boxes) — 박스 레벨(0~MAX_BOX)별 단어 수 분포.
// 학생/반 전체가 지금 어느 박스에 몰려 있는지(예: 대부분 0~1이면 아직
// 숙달어가 적다는 뜻) 한눈에 보기 위한 순수 집계.
export function computeBoxDistribution(boxes = {}) {
  const dist = {}
  for (let level = 0; level <= MAX_BOX; level++) dist[level] = 0
  for (const entry of Object.values(boxes || {})) {
    const level = Math.max(0, Math.min(MAX_BOX, Number(entry?.level) || 0))
    dist[level] = (dist[level] || 0) + 1
  }
  return dist
}

// computeDueLoad(boxes, todayStr) — 오늘 기준 복습 대상(due) 단어 수.
// memory/leitner.js의 isDue 판정을 그대로 재사용(중복 재구현 금지).
export function computeDueLoad(boxes = {}, todayStr) {
  let due = 0
  for (const entry of Object.values(boxes || {})) {
    if (isDue(entry, todayStr)) due++
  }
  return due
}

// computeReviewReturnRate(rows) — MEM_EV.memoryReviewSessionCompleted
// 이벤트가 있었던 날 기준 "정확히 1일 뒤에도 아무 활동이든 있었는지"
// 비율(0~1). rows: { anon_id, event, day(YYYY-MM-DD) } 배열(product_events
// 원본 행 shape과 동일 — analyticsMath.js computeReturnRates와 같은
// 입력 계약). 이 파일은 그 범용 함수를 재사용하지 않고 n=1/단일 이벤트로
// 범위를 좁힌 작은 독립 구현을 쓴다 — 목적이 좁혀서(관찰 대상이 memory
// review 세션 하나뿐) 굳이 다중 이벤트/다중 n을 다루는 범용 로직을
// 끌어와 이 모듈을 supabase-비의존 leitner.js 하나 외에 다른 IO-인접
// 모듈까지 추가로 묶을 필요가 없기 때문(계획 문서가 명시적으로 재사용을
// 요구한 것은 shuffleDeterministic 하나뿐 — sessionPlanner.js 참고).
const DAY_MS = 24 * 60 * 60 * 1000
function addOneDay(dayStr) {
  const [y, m, d] = String(dayStr).split('-').map(Number)
  const next = new Date(Date.UTC(y, (m || 1) - 1, d || 1) + DAY_MS)
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

export function computeReviewReturnRate(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  const activityDays = new Map() // anon_id -> Set(day)
  for (const r of list) {
    if (!r?.anon_id || !r?.day) continue
    if (!activityDays.has(r.anon_id)) activityDays.set(r.anon_id, new Set())
    activityDays.get(r.anon_id).add(r.day)
  }
  const completions = list.filter((r) => r?.event === MEM_EV.memoryReviewSessionCompleted)
  if (completions.length === 0) return 0
  let hit = 0
  for (const c of completions) {
    const targetDay = addOneDay(c.day)
    if (activityDays.get(c.anon_id)?.has(targetDay)) hit++
  }
  return hit / completions.length
}
