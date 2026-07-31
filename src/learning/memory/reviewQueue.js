// src/learning/memory/reviewQueue.js — "오늘의 복습 대상" 큐 빌더 + 기존
// 복습 신호(스펠링 오답 큐/누적 오답수/자기신고 상태)를 이 모듈이 쓰는
// 신호 shape으로 변환하는 어댑터.
//
// import는 형제 순수 모듈만(leitner.js/difficulty.js, 둘 다 명시적 .js
// 확장자 — Node ESM 리졸버가 확장자 없는 상대 경로를 못 읽으므로 이
// 파일들끼리는 항상 .js를 붙인다. 덕분에 이 파일은 번들 없이 plain Node
// 하네스가 바로 import 가능).
import { isDue, daysOverdue } from './leitner.js'

// ── 복습 4종 동선 단일화 지점 ────────────────────────────────────────────
// docs/reading/10-product-review-top100.md #16(복습 큐에 간격 도입),
// #33(missedCounts 기반 약점 단어 가중), #37(복습 언어·모델 통일)이
// 요구하는 "여러 갈래로 흩어진 복습 개념을 하나로 묶는" 지점이 바로
// buildReviewQueue다. 아래 signalsFromX 어댑터 3개가 그 통합의 입력측.
// 4번째 동선인 "가이드 세션 재시도"(정답 못 맞히면 같은 세션 안에서 다시
// 묻는 것)는 이 큐의 입력이 아니라 planner/sessionPlanner.js가 세션
// 안에서 결정하는 옵션(options.retries)이다 — 여기서 다루지 않는다.
function hashString(seedStr, wordId) {
  // djb2 계열(sentenceLearning.js/paulTown.js hashString과 같은 알고리즘
  // 족) — 다만 목적이 다르다(배열 셔플이 아니라 "동률 타이브레이크용
  // 안정적 정수 키" 하나만 필요). shuffleDeterministic은 재사용 대상이
  // 아니라 sessionPlanner.js의 "아이템 순서 섞기" 전용으로 남겨둔다(계획
  // 상 이 파일은 leitner+difficulty만 import).
  let h = 5381
  const str = `${seedStr ?? ''}:${wordId ?? ''}`
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h
}

function compareByOverdueThenDifficultyThenHash(boxes, difficultyByWord, todayStr, seed) {
  return (a, b) => {
    const overdueA = daysOverdue(boxes[a], todayStr)
    const overdueB = daysOverdue(boxes[b], todayStr)
    if (overdueA !== overdueB) return overdueB - overdueA // 오래 묵은 순(내림차순)
    const diffA = Number(difficultyByWord[a]) || 0
    const diffB = Number(difficultyByWord[b]) || 0
    if (diffA !== diffB) return diffB - diffA // 난이도 내림차순
    return hashString(seed, a) - hashString(seed, b) // 결정론 타이브레이크
  }
}

// buildReviewQueue({ boxes, wordStatus, difficultyByWord, allWordIds,
//   todayStr, cap, seed }) → wordId[] (우선순위 순).
//
// 1단계: 이미 박스 항목이 있고(boxes[id] 존재) 오늘 기준 due인 단어 —
//        가장 오래 밀린 순 → 동률이면 난이도 desc → 동률이면 해시 순.
// 2단계: 박스 항목이 아예 없는(한 번도 안 본) 단어 중 word_status가
//        skipped/mastered가 아닌 것만 채워 넣음(§6.3 "동률/우선순위" 2단계
//        규칙 그대로) — 여기서도 난이도 desc → 해시 순.
// 3단계: cap(세션당 노출 상한, §6.3 — 실제 밴드 결정은 호출부 책임)으로
//        자르기. cap 생략 시 전체 반환.
//
// 주의(의도된 비대칭): skipped/mastered 제외는 "한 번도 안 본 단어" 채움
// 단계에만 적용한다 — 이미 박스가 있는 due 단어는(설령 학생이 그 뒤에
// word_status를 skipped로 바꿨더라도) Leitner 스케줄이 이미 추적 중인
// 항목이라 여기서 걸러내지 않는다. 이 비대칭은 실수가 아니라 설계
// 선택이다.
export function buildReviewQueue({ boxes = {}, wordStatus = {}, difficultyByWord = {}, allWordIds = [], todayStr, cap, seed = '' } = {}) {
  const ids = Array.isArray(allWordIds) ? allWordIds : []
  const dueIds = []
  const neverSeenIds = []

  for (const wordId of ids) {
    const entry = boxes[wordId]
    if (entry) {
      if (isDue(entry, todayStr)) dueIds.push(wordId)
    } else {
      neverSeenIds.push(wordId)
    }
  }

  const cmp = compareByOverdueThenDifficultyThenHash(boxes, difficultyByWord, todayStr, seed)
  const dueSorted = dueIds.slice().sort(cmp)

  const fillCmp = (a, b) => {
    const diffA = Number(difficultyByWord[a]) || 0
    const diffB = Number(difficultyByWord[b]) || 0
    if (diffA !== diffB) return diffB - diffA
    return hashString(seed, a) - hashString(seed, b)
  }
  const fillSorted = neverSeenIds
    .filter((wordId) => wordStatus[wordId] !== 'skipped' && wordStatus[wordId] !== 'mastered')
    .slice()
    .sort(fillCmp)

  const queue = [...dueSorted, ...fillSorted]
  return Number.isFinite(cap) ? queue.slice(0, cap) : queue
}

// ── 신호 어댑터(기존 blob 필드 → 이 모듈이 쓰는 신호 shape) ────────────────
// slugToId: { [slug]: wordId } 객체 또는 (slug) => wordId 함수. 매핑이
// 안 되는 slug는 절대 "그 slug 자체가 곧 wordId"라고 추측하지 않고
// 조용히 버린다(추측 금지 — 오매핑으로 엉뚱한 단어 난이도를 올리는 것을
// 방지).
function resolveWordId(slugToId, slug) {
  if (typeof slugToId === 'function') return slugToId(slug)
  if (slugToId && typeof slugToId === 'object') return slugToId[slug]
  return undefined
}

// signalsFromSpellingQueue(queue, slugToId) — useStudent.js의
// spellingReviewQueue(자정을 넘겨도 유지되는 오답 복습 대기열, wordId
// 배열)를 { [wordId]: { inReviewQueue: true } }로 변환.
export function signalsFromSpellingQueue(queue = [], slugToId = {}) {
  const out = {}
  for (const slug of Array.isArray(queue) ? queue : []) {
    const wordId = resolveWordId(slugToId, slug)
    if (!wordId) continue
    out[wordId] = { ...(out[wordId] || {}), inReviewQueue: true }
  }
  return out
}

// signalsFromMissedCounts(missedCounts, slugToId) — attachment/
// attachmentCore.js:61-76의 missedCounts({ wordId(slug) -> 역대 오답
// 횟수 } shape)를 { [wordId]: { missedCount } }로 변환.
export function signalsFromMissedCounts(missedCounts = {}, slugToId = {}) {
  const out = {}
  for (const [slug, count] of Object.entries(missedCounts || {})) {
    const wordId = resolveWordId(slugToId, slug)
    if (!wordId) continue
    out[wordId] = { ...(out[wordId] || {}), missedCount: Number(count) || 0 }
  }
  return out
}

// signalsFromWordStatus(map) — word_status는 slug가 아니라 이미
// wordId(UUID, words.dbId)로 키가 잡혀 있다(wordLibrary.js:2092
// `wordStatus[w.dbId]` 참고) — 다른 두 어댑터와 달리 slugToId 매핑이
// 필요 없다. { [wordId]: { status } }로 변환.
export function signalsFromWordStatus(map = {}) {
  const out = {}
  for (const [wordId, status] of Object.entries(map || {})) {
    if (!wordId) continue
    out[wordId] = { status }
  }
  return out
}
