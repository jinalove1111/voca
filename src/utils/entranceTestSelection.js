// 입실시험 "어느 시험을 볼 것인가" 판정 — 단일 진실 공급원(순수 함수,
// 네트워크/DB 무접촉). 대상 자격(누가 볼 수 있는가)은 entranceEligibility.js,
// 그중 무엇을 보여줄지는 이 파일이 책임진다.
//
// ── 왜 이 파일이 생겼나 (2026-08-12 실사고) ────────────────────────────
// 학생 화면은 자기 scope의 오늘 시험을 전부 가져온 뒤 findActiveTest()로
// **created_at이 가장 이른 active 하나**를 골랐다. 학생이 실제로 어느 교재를
// 공부하는지는 전혀 보지 않는 선택이었다.
// 실측: Song(4f3e0b72…)은 "중2 능률 김기택"과 "중2 YMB 박준원" 두 교재에
// 동시에 배정돼 있었고, 아침 08:25에 열린 김기택 시험이 종료되지 않은 채
// 하루 종일 살아 있어서 12:20에 열린 YMB 시험을 **영영 가렸다**. Song은 반
// 친구들과 다른 시험을 봤고(0/10), YMB 시험 명단에는 나타나지 않았다.
//
// ── 운영 원칙(2026-08-11 확정, entranceEligibility.js와 동일) ──────────
// "학생의 반 ≠ 학생이 공부할 수 있는 모든 교재." 중2 학생도 고1 교재를
// 배정받아 공부할 수 있고 반은 그대로다. 따라서 학년/반 이름으로 시험을
// 거르면 안 되고, **실제 학습 교재와 개별 배정**이 우선이다.
//
// ── 우선순위(운영자 확정) ─────────────────────────────────────────────
//   1순위 CURRENT_TEXTBOOK_AND_UNIT — 지금 공부 중인 교재 + 현재 유닛 일치
//   2순위 ASSIGNED_TEXTBOOK         — 개별 배정된 교재(SCA.textbook_id)
//   3순위 CLASS_DEFAULT_TEXTBOOK    — 소속 반의 기본 교재(class_textbooks)
//   4순위 IN_SCOPE_ONLY             — 자격은 있으나 위 어디에도 안 걸림
// 같은 순위가 2개 이상 남으면 **임의로 고르지 않고** 학생에게 고르게 한다
// (needsChoice) — 조용한 임의 선택이 이번 사고의 본질이기 때문이다.
//
// ── DB 스키마 제약(정직한 기록) ───────────────────────────────────────
// entrance_tests에는 textbook_id도 unit_id도 **없다**(컬럼: id, class_id,
// date, status, direction, question_count, time_limit_seconds, words,
// created_at — supabase_v1_8_entrance_test.sql). 그래서
//   - 교재 축: test.class_id -> 그 반이 소유한 교재로 **정확히** 역해석된다.
//   - 유닛 축: 기록이 없어 words 스냅샷으로 역추적할 수밖에 없다(호출부가
//     resolveTestUnitId로 주입). 역추적이 모호하면 null이고, 그러면 1순위
//     판정이 성립하지 않아 자연히 2순위 이하로 내려간다 — 즉 **모르면
//     끼워맞추지 않는다**.
// 유닛 축을 구조적으로 확실히 하려면 entrance_tests.unit_id 컬럼이 맞고,
// 그 마이그레이션은 준비만 하고 실행하지 않는다(규칙 8, 운영자 승인 필요).

export const TIER = {
  CURRENT_TEXTBOOK_AND_UNIT: 1,
  ASSIGNED_TEXTBOOK: 2,
  CLASS_DEFAULT_TEXTBOOK: 3,
  IN_SCOPE_ONLY: 4,
}

export const TIER_LABEL = {
  1: '지금 공부 중인 교재·유닛',
  2: '개별 배정된 교재',
  3: '반 기본 교재',
  4: '응시 자격 있음',
}

const asArray = (v) => (Array.isArray(v) ? v.filter(Boolean) : [])

// 시험 하나를 우선순위 티어로 분류한다. context는 전부 호출부 주입 —
// 이 모듈은 wordLibrary/Supabase를 알지 못한다(테스트 용이성).
export function classifyEntranceTest(test, context = {}) {
  const {
    currentTextbookId = null,
    currentUnitId = null,
    assignedTextbookIds = [],
    classDefaultTextbookIds = [],
    resolveTestTextbookId = () => null,
    resolveTestUnitId = () => null,
  } = context

  const textbookId = test ? resolveTestTextbookId(test) : null
  const unitId = test ? resolveTestUnitId(test) : null

  let tier = TIER.IN_SCOPE_ONLY
  if (textbookId && currentTextbookId && textbookId === currentTextbookId
      && unitId && currentUnitId && unitId === currentUnitId) {
    tier = TIER.CURRENT_TEXTBOOK_AND_UNIT
  } else if (textbookId && asArray(assignedTextbookIds).includes(textbookId)) {
    tier = TIER.ASSIGNED_TEXTBOOK
  } else if (textbookId && asArray(classDefaultTextbookIds).includes(textbookId)) {
    tier = TIER.CLASS_DEFAULT_TEXTBOOK
  }
  return { test, tier, textbookId, unitId }
}

// 오늘 내 scope의 시험 목록에서 "지금 볼 시험"을 정한다.
//
// 반환:
//   pending     — 아직 응시하지 않은 active 시험(티어 오름차순 -> created_at
//                 오름차순). 기존 findActiveTest의 created_at 순서를 티어
//                 안에서 그대로 유지해, 티어가 같으면 예전과 같은 순서다.
//   chosen      — 최상위 티어 후보가 정확히 1개일 때 그 시험. 2개 이상이면
//                 null(임의 선택 금지).
//   needsChoice — 최상위 티어 후보가 2개 이상 => 학생에게 선택 UI를 띄운다.
//   topTier     — 최상위 티어 값(후보 없으면 null).
//   completed   — 오늘 내 scope에서 이미 응시를 마친 시험(결과 화면용).
//
// 이미 응시한 시험은 pending에서 제외한다(기존 정책 유지 — 재응시 유도 금지).
// 전부 응시했으면 chosen은 null이고 호출부는 기존대로 결과 화면을 보여준다.
export function selectEntranceTest({ tests = [], takenTestIds = [], context = {} } = {}) {
  const taken = new Set(asArray(takenTestIds))
  const all = asArray(tests)
  const completed = all.filter((t) => taken.has(t.id))

  const ranked = all
    .filter((t) => t && t.status === 'active' && !taken.has(t.id))
    .map((t) => classifyEntranceTest(t, context))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      // 같은 티어 안에서는 기존 동작(생성 순)을 유지 — created_at이 없거나
      // 같으면 원래 배열 순서가 그대로 남도록 0을 돌려준다.
      const at = a.test?.createdAt || ''
      const bt = b.test?.createdAt || ''
      return at < bt ? -1 : at > bt ? 1 : 0
    })

  if (ranked.length === 0) {
    return { pending: [], chosen: null, needsChoice: false, topTier: null, completed }
  }
  const topTier = ranked[0].tier
  const top = ranked.filter((r) => r.tier === topTier)
  return {
    pending: ranked,
    chosen: top.length === 1 ? ranked[0].test : null,
    needsChoice: top.length > 1,
    topTier,
    completed,
  }
}

// 학생이 선택 UI에서 이미 고른 시험이 아직 유효하면 그 선택을 유지한다.
// 5초 폴링이 매번 selectEntranceTest를 다시 돌리기 때문에 이 함수가 없으면
// 학생이 고른 시험이 폴링 한 번에 되돌아간다(= 시험 도중 새로고침/포커스
// 복귀 때 다른 시험으로 바뀌는 사고). 고른 시험이 더 이상 후보가 아니면
// (종료됐거나 이미 제출) 선택을 버리고 일반 규칙으로 돌아간다.
export function resolvePickedTest(selection, chosenId) {
  if (!selection) return null
  const still = (selection.pending || []).find((p) => p.test?.id === chosenId)
  return still ? still.test : (selection.chosen || null)
}

// ── 관리자 출제 범위 규칙 ──────────────────────────────────────────────
// "오늘의 단어 배정이 있고 유닛 단어와 교집합이 있으면 그 서브셋, 아니면
// 유닛 전체"(v1.3 getStudentWords 폴백과 같은 규칙). 예전엔 이 규칙이
// EntranceTestAdmin의 useMemo 안에만 있어서 테스트가 불가능했고, 라벨이
// 실제 사용된 유닛이 아니라 요청한 이름을 찍어 화면이 거짓말을 했다.
//
// unitWords는 **반드시 unit_id로 조회한 그 유닛의 단어**여야 한다(이름
// 조회 금지 — 동명 유닛 혼입 방지, wordLibrary.getWordsByUnitId 참고).
// label은 항상 실제 유닛 이름(unitName)으로 만든다.
export function computeEntranceSourceWords({
  unitWords = [], unitName = '', assignedSlugs = [], slugOf = (w) => w,
} = {}) {
  const usable = (unitWords || []).filter((w) => w && w.word && w.meaning)
  const assigned = new Set((assignedSlugs || []).filter(Boolean))
  if (assigned.size > 0) {
    const filtered = usable.filter((w) => assigned.has(slugOf(w.word)))
    if (filtered.length > 0) {
      return { words: filtered, label: `오늘의 단어 배정 (${filtered.length}개)`, mode: 'assignment' }
    }
  }
  return { words: usable, label: `${unitName} 전체 (${usable.length}개)`, mode: 'unit' }
}
