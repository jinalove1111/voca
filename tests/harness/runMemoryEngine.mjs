// tests/harness/runMemoryEngine.mjs — Memory Engine(Leitner 박스 모델 +
// 난이도/복습 큐 + 저장 코덱/백엔드 + 세션 플래너 + 메트릭) 순수 코어
// 하네스. runLearningEngine.mjs/runReading.mjs와 동일한 자기완결형 관례 —
// src/learning/memory·planner·metrics·ai의 순수 모듈만 이 파일에서 직접
// 단언한다. 아래 각 섹션은 구현 커밋(C1~C5) 순서대로 추가된다 — 이 파일은
// 매 커밋마다 이전 섹션은 그대로 두고 새 섹션만 append한다.
//
// 번들 필요 여부(파일별로 다름, 각 파일 헤더 주석 참고):
//   - memory/leitner.js·difficulty.js·storage/reviewDataCodec.js: import 0,
//     plain Node ESM이 그대로 로드 가능.
//   - memory/reviewQueue.js·storage/reviewDataBackend.js: 형제 파일을
//     명시적 .js 확장자로 import하므로(Node ESM 리졸버 요구사항 충족 위한
//     의도적 선택) 마찬가지로 플레인 로드 가능 — 번들 불필요.
//   - planner/sessionPlanner.js: src/utils/sentenceLearning.js의
//     shuffleDeterministic을 기존 코드베이스 관례(확장자 없는 상대 import)
//     그대로 재사용하므로, registry.js와 동일하게 esbuild 인메모리 번들이
//     필요하다(runLearningEngine.mjs 9-28행과 동일 관례).
//   - metrics/memoryMetrics.js: memory/leitner.js만 import(.js 확장자) —
//     번들 불필요.
//   - metrics/emit.js: productEvents.js(IO, 모듈 스코프에서 실 Supabase
//     클라이언트 생성)를 import하므로 plain Node에서 import 시점에 크래시
//     한다(다른 IO 래퍼와 동일한 제약, 파일 헤더 주석 참고) — 이 하네스는
//     emit.js를 import하지 않고 소스 레벨 검사만 한다(정직한 커버리지
//     경계, CLAUDE.md 규칙 18).
//   - ai/memoryPlugPoints.js: import 0, plain Node ESM 로드 가능.
import { readFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'
import { fromExample } from '../../src/learning/adapters/learningItem.js'
import * as leitner from '../../src/learning/memory/leitner.js'
import * as difficulty from '../../src/learning/memory/difficulty.js'
import * as reviewQueue from '../../src/learning/memory/reviewQueue.js'
import * as reviewDataCodec from '../../src/learning/memory/storage/reviewDataCodec.js'
import * as reviewDataBackend from '../../src/learning/memory/storage/reviewDataBackend.js'

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

console.log('\n=== [harness:memory-engine] Memory Engine — 순수 코어 ===')

// ── C1: leitner.js — 박스 모델(§6.3) ───────────────────────────────────────
console.log('\n-- leitner.js: 간격 표 / 승급·강등 규칙')
check('BOX_INTERVALS_DAYS는 §6.3 표 그대로 [0,1,3,7,14,30]',
  JSON.stringify(leitner.BOX_INTERVALS_DAYS) === JSON.stringify([0, 1, 3, 7, 14, 30]))
check('MAX_BOX=5', leitner.MAX_BOX === 5)

const e0 = leitner.emptyEntry()
check('emptyEntry(): level 0, nextReviewAt null, correctStreak 0',
  e0.level === 0 && e0.nextReviewAt === null && e0.correctStreak === 0 && e0.lastResult === null)

const afterCorrect0 = leitner.applyResult(e0, true, '2026-08-01')
check('신규 단어 정답 → 박스 1, nextReviewAt=오늘+1일',
  afterCorrect0.level === 1 && afterCorrect0.nextReviewAt === '2026-08-02')

const atMax = { level: 5, nextReviewAt: '2026-08-01', lastResult: 'correct', lastReviewedAt: '2026-07-01', correctStreak: 9 }
const stillMax = leitner.applyResult(atMax, true, '2026-08-01')
check('박스 5(최대)에서 정답 → 5 유지(클램프, 6단계 밖으로 안 나감)', stillMax.level === 5)
check('박스 5에서 정답 → nextReviewAt=오늘+30일(간격표 마지막 값)', stillMax.nextReviewAt === '2026-08-31')

const midEntry = { level: 3, nextReviewAt: '2026-07-20', lastResult: 'correct', lastReviewedAt: '2026-07-13', correctStreak: 2 }
const afterWrong = leitner.applyResult(midEntry, false, '2026-08-01')
check('박스 3에서 오답 → 정확히 2(한 단계만 강등, 절대 0 아님)', afterWrong.level === 2)
check('오답 후 correctStreak은 0으로 리셋', afterWrong.correctStreak === 0)
check('오답 후 nextReviewAt=오늘+간격표[2]=3일', afterWrong.nextReviewAt === '2026-08-04')

const afterWrongAtZero = leitner.applyResult({ level: 0 }, false, '2026-08-01')
check('박스 0에서 오답 → 0 미만으로 내려가지 않음(바닥 클램프)', afterWrongAtZero.level === 0)

check('applyResult는 순수(같은 입력 → 같은 출력)',
  JSON.stringify(leitner.applyResult(midEntry, false, '2026-08-01')) === JSON.stringify(afterWrong))

// promoteGate 훅 — 기본은 no-op(항상 승급 허용), 커스텀 게이트가 false를
// 돌려주면 레벨 그대로 유지(단, correctStreak은 정답이므로 여전히 +1).
const blockedPromote = leitner.applyResult({ level: 3, correctStreak: 0 }, true, '2026-08-01', { promoteGate: () => false })
check('opts.promoteGate가 false를 돌려주면 레벨 승급을 막음(그대로 3 유지)', blockedPromote.level === 3)
check('promoteGate가 막아도 correctStreak은 정답이므로 +1', blockedPromote.correctStreak === 1)
const allowedPromote = leitner.applyResult({ level: 3, correctStreak: 0 }, true, '2026-08-01')
check('opts 생략(기본 no-op 게이트) → 정상 승급(4)', allowedPromote.level === 4)

check('isDue: nextReviewAt 없음(한 번도 안 본 단어) → true(신규 취급)',
  leitner.isDue(null, '2026-08-01') === true && leitner.isDue({ level: 0, nextReviewAt: null }, '2026-08-01') === true)
check('isDue: nextReviewAt이 오늘보다 과거 → true', leitner.isDue({ nextReviewAt: '2026-07-30' }, '2026-08-01') === true)
check('isDue: nextReviewAt이 오늘 → true(당일 포함)', leitner.isDue({ nextReviewAt: '2026-08-01' }, '2026-08-01') === true)
check('isDue: nextReviewAt이 미래 → false', leitner.isDue({ nextReviewAt: '2026-08-05' }, '2026-08-01') === false)

check('daysOverdue: 미래 예정 항목은 0', leitner.daysOverdue({ nextReviewAt: '2026-08-05' }, '2026-08-01') === 0)
check('daysOverdue: 5일 지난 항목 → 5', leitner.daysOverdue({ nextReviewAt: '2026-07-27' }, '2026-08-01') === 5)
check('daysOverdue: 한 번도 안 본 단어(신규)는 0(밀린 게 아니라 신규)',
  leitner.daysOverdue({ level: 0, nextReviewAt: null }, '2026-08-01') === 0)

const leitnerSrc = readFileSync(new URL('../../src/learning/memory/leitner.js', import.meta.url), 'utf8')
check('leitner.js는 Date.now() 미사용(결정론 — 오늘 날짜는 항상 인자로 받음)', !leitnerSrc.includes('Date.now('))
check('leitner.js는 Math.random 미사용', !leitnerSrc.includes('Math.random'))
check('leitner.js는 import 0(순수 모듈)', !/^import /m.test(leitnerSrc))

// ── C2: difficulty.js — 난이도 점수 / 승급 게이트 튜닝 ─────────────────────
console.log('\n-- difficulty.js: computeDifficulty / promoteGateFor')
const weightSum = Object.values(difficulty.DIFFICULTY_WEIGHTS).reduce((a, b) => a + b, 0)
check('DIFFICULTY_WEIGHTS 합계는 정확히 1.0(점수가 0~1 범위를 벗어나지 않도록)', Math.abs(weightSum - 1) < 1e-9)

check('computeDifficulty: 입력 전부 없음(신규 단어) → 0보다 큼(lowLevel+statusUnknown 가산)',
  difficulty.computeDifficulty({}) > 0)
check('computeDifficulty: 항상 0~1 범위', (() => {
  const cases = [{}, { missedCount: 100, wrongToday: true, inReviewQueue: true, status: 'unknown', level: 0 }, { missedCount: 0, level: 5, status: 'mastered' }]
  return cases.every((c) => { const d = difficulty.computeDifficulty(c); return d >= 0 && d <= 1 })
})())
check('computeDifficulty: missedCount가 늘수록 단조 비감소(다른 입력 고정)', (() => {
  const base = { wrongToday: false, inReviewQueue: false, status: 'known', level: 3 }
  const scores = [0, 1, 2, 5, 20, 100].map((missedCount) => difficulty.computeDifficulty({ ...base, missedCount }))
  return scores.every((s, i) => i === 0 || s >= scores[i - 1])
})())
check('computeDifficulty: 같은 입력 → 항상 같은 출력(타이스테이블/결정론)',
  difficulty.computeDifficulty({ missedCount: 3, level: 2 }) === difficulty.computeDifficulty({ missedCount: 3, level: 2 }))
check('computeDifficulty: level>=2이고 status가 known이면 lowLevel/statusUnknown 가산 없음(가장 낮은 부류)',
  difficulty.computeDifficulty({ missedCount: 0, wrongToday: false, inReviewQueue: false, status: 'known', level: 3 }) === 0)

check('PROMOTE_GATE_TUNING은 기본 OFF(enabled:false) — 미래 튜닝 상수만 존재',
  difficulty.PROMOTE_GATE_TUNING.enabled === false)
const identityGate = difficulty.promoteGateFor(0.9)
check('promoteGateFor: 기본(OFF) 상태에서는 difficulty가 높아도 항상 true(identity)',
  identityGate({ level: 4, correctStreak: 0 }, 5) === true)

const difficultySrc = readFileSync(new URL('../../src/learning/memory/difficulty.js', import.meta.url), 'utf8')
check('difficulty.js는 import 0(순수 모듈)', !/^import /m.test(difficultySrc))
check('difficulty.js는 Math.random 미사용', !difficultySrc.includes('Math.random'))

// ── C2: reviewQueue.js — 복습 큐 빌더 + 신호 어댑터 ─────────────────────────
console.log('\n-- reviewQueue.js: buildReviewQueue / signalsFromX 어댑터')
const today = '2026-08-01'
const boxes = {
  overdue10: { level: 2, nextReviewAt: '2026-07-22' }, // 10일 밀림
  overdue3: { level: 3, nextReviewAt: '2026-07-29' },   // 3일 밀림
  overdueTieHigh: { level: 1, nextReviewAt: '2026-07-29' }, // 3일 밀림, 난이도로 타이브레이크
  overdueTieLow: { level: 1, nextReviewAt: '2026-07-29' },
  notDueYet: { level: 4, nextReviewAt: '2026-08-10' },
}
const difficultyByWord = { overdue10: 0.5, overdue3: 0.5, overdueTieHigh: 0.9, overdueTieLow: 0.1 }
const wordStatus = { neverSeenSkipped: 'skipped', neverSeenMastered: 'mastered', neverSeenNormal: 'unknown' }
const allWordIds = ['overdue10', 'overdue3', 'overdueTieHigh', 'overdueTieLow', 'notDueYet', 'neverSeenSkipped', 'neverSeenMastered', 'neverSeenNormal']

const q1 = reviewQueue.buildReviewQueue({ boxes, wordStatus, difficultyByWord, allWordIds, todayStr: today, seed: 's1' })
check('가장 오래 밀린 단어가 큐 맨 앞(overdue10=10일 밀림)', q1[0] === 'overdue10')
check('미래 예정(notDueYet)은 due 구간에 없음(never-seen fill 뒤에도 없음 — 아예 큐 밖)', !q1.includes('notDueYet'))
check('never-seen 중 skipped/mastered는 큐에서 제외', !q1.includes('neverSeenSkipped') && !q1.includes('neverSeenMastered'))
check('never-seen 중 정상(unknown)은 큐에 포함(due 항목들 뒤에)', q1.includes('neverSeenNormal'))
const idxTieHigh = q1.indexOf('overdueTieHigh')
const idxTieLow = q1.indexOf('overdueTieLow')
check('동일 밀림일수 타이브레이크: 난이도 높은 쪽(overdueTieHigh=0.9)이 낮은 쪽(0.1)보다 먼저',
  idxTieHigh !== -1 && idxTieLow !== -1 && idxTieHigh < idxTieLow)

const q1Again = reviewQueue.buildReviewQueue({ boxes, wordStatus, difficultyByWord, allWordIds, todayStr: today, seed: 's1' })
check('buildReviewQueue는 결정론(같은 입력·같은 seed → 바이트 동일 순서)', JSON.stringify(q1) === JSON.stringify(q1Again))

const q1Cap = reviewQueue.buildReviewQueue({ boxes, wordStatus, difficultyByWord, allWordIds, todayStr: today, seed: 's1', cap: 2 })
check('cap이 있으면 정확히 그 길이로 자름', q1Cap.length === 2 && q1Cap[0] === q1[0] && q1Cap[1] === q1[1])

check('signalsFromSpellingQueue: 매핑 안 되는 slug는 조용히 드롭(추측 금지)',
  (() => {
    const out = reviewQueue.signalsFromSpellingQueue(['known-slug', 'unmapped-slug'], { 'known-slug': 'word-uuid-1' })
    return out['word-uuid-1']?.inReviewQueue === true && Object.keys(out).length === 1
  })())
check('signalsFromMissedCounts: slugToId 함수 형태도 지원 + 미매핑 드롭',
  (() => {
    const out = reviewQueue.signalsFromMissedCounts({ a: 3, b: 5 }, (slug) => (slug === 'a' ? 'word-a-id' : undefined))
    return out['word-a-id']?.missedCount === 3 && Object.keys(out).length === 1
  })())
check('signalsFromWordStatus: wordId 키를 그대로 status로 매핑(slug 변환 없음)',
  (() => {
    const out = reviewQueue.signalsFromWordStatus({ 'word-x': 'known', 'word-y': 'unknown' })
    return out['word-x'].status === 'known' && out['word-y'].status === 'unknown'
  })())

const reviewQueueSrc = readFileSync(new URL('../../src/learning/memory/reviewQueue.js', import.meta.url), 'utf8')
check('reviewQueue.js는 형제 모듈(leitner/difficulty)만 import', (() => {
  const imports = [...reviewQueueSrc.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
  return imports.length > 0 && imports.every((p) => p === './leitner.js' || p === './difficulty.js')
})())
check('reviewQueue.js는 Math.random 미사용(타이브레이크는 결정론 해시)', !reviewQueueSrc.includes('Math.random'))

// ── C3: reviewDataCodec.js — schema v1 인코딩/디코딩/병합 ───────────────────
console.log('\n-- reviewDataCodec.js: decode/encode/merge')
const empty = reviewDataCodec.emptyState()
check('emptyState(): spellingWrongToday=[], memoryEngine v1 boxes={}',
  Array.isArray(empty.spellingWrongToday) && empty.spellingWrongToday.length === 0
  && empty.memoryEngine.version === 1 && Object.keys(empty.memoryEngine.boxes).length === 0)

check('decodeReviewData(null) → emptyState()과 동일', JSON.stringify(reviewDataCodec.decodeReviewData(null)) === JSON.stringify(empty))
check('decodeReviewData(undefined) → emptyState()과 동일', JSON.stringify(reviewDataCodec.decodeReviewData(undefined)) === JSON.stringify(empty))

const legacyRaw = { spellingWrongToday: ['w1', 'w2'] } // Writing MVP 시절 형태(memoryEngine 없음)
const decodedLegacy = reviewDataCodec.decodeReviewData(legacyRaw)
check('decodeReviewData: legacy 필드(spellingWrongToday만) 있으면 그대로 보존',
  JSON.stringify(decodedLegacy.spellingWrongToday) === JSON.stringify(['w1', 'w2']))
check('decodeReviewData: legacy엔 memoryEngine 없음 → emptyState.memoryEngine으로 채움',
  decodedLegacy.memoryEngine.version === 1 && Object.keys(decodedLegacy.memoryEngine.boxes).length === 0)

const badVersionRaw = { spellingWrongToday: [], memoryEngine: { version: 99, boxes: { w1: { level: 3 } } }, someFutureKey: 'kept' }
const decodedBadVersion = reviewDataCodec.decodeReviewData(badVersionRaw)
check('decodeReviewData: 버전 불일치는 memoryEngine을 빈 상태로 취급(손상 데이터로 크래시 안 함)',
  decodedBadVersion.memoryEngine.version === 1 && Object.keys(decodedBadVersion.memoryEngine.boxes).length === 0)
check('decodeReviewData: 알 수 없는 키(someFutureKey)는 그대로 보존', decodedBadVersion.someFutureKey === 'kept')

const goodRaw = { spellingWrongToday: ['x'], memoryEngine: { version: 1, updatedAt: '2026-07-30', boxes: { w1: { level: 2, nextReviewAt: '2026-08-05', lastResult: 'correct', lastReviewedAt: '2026-07-30', correctStreak: 2 } } }, otherAppKey: 42 }
const decodedGood = reviewDataCodec.decodeReviewData(goodRaw)
check('decodeReviewData: 정상 v1 데이터는 boxes/updatedAt/기타 키 그대로 보존',
  decodedGood.memoryEngine.boxes.w1.level === 2 && decodedGood.memoryEngine.updatedAt === '2026-07-30' && decodedGood.otherAppKey === 42)

const stateToEncode = { spellingWrongToday: ['y'], memoryEngine: { version: 1, updatedAt: '2026-08-01', boxes: { w2: { level: 1, nextReviewAt: '2026-08-02', lastResult: 'correct', lastReviewedAt: '2026-08-01', correctStreak: 1 } } } }
const encodedOverExisting = reviewDataCodec.encodeReviewData({ someFutureKey: 'must-survive', memoryEngine: { version: 1, updatedAt: '2026-07-01', boxes: { w1: { level: 5 } } } }, stateToEncode)
check('encodeReviewData: read-merge-write — 기존의 알 수 없는 키(someFutureKey) 보존', encodedOverExisting.someFutureKey === 'must-survive')
check('encodeReviewData: memoryEngine.boxes는 state 값으로 완전히 교체(기존 w1 대신 새 w2만)',
  encodedOverExisting.memoryEngine.boxes.w2.level === 1 && !encodedOverExisting.memoryEngine.boxes.w1)
check('encodeReviewData: existingRaw가 null이어도 크래시 없이 안전(신규 행)',
  reviewDataCodec.encodeReviewData(null, stateToEncode).memoryEngine.boxes.w2.level === 1)

const mergeA = { spellingWrongToday: ['a'], memoryEngine: { version: 1, updatedAt: '2026-07-20', boxes: {
  shared: { level: 3, nextReviewAt: '2026-08-01', lastReviewedAt: '2026-07-25', correctStreak: 1 }, // a가 더 높은 레벨
  onlyA: { level: 1, nextReviewAt: '2026-08-01', lastReviewedAt: '2026-07-20', correctStreak: 0 },
  tieNewer: { level: 2, nextReviewAt: '2026-08-01', lastReviewedAt: '2026-07-29', correctStreak: 1 }, // 동률(레벨2) + 더 최근
} } }
const mergeB = { spellingWrongToday: ['b'], memoryEngine: { version: 1, updatedAt: '2026-07-28', boxes: {
  shared: { level: 1, nextReviewAt: '2026-08-01', lastReviewedAt: '2026-07-28', correctStreak: 0 }, // b가 더 낮은 레벨
  onlyB: { level: 4, nextReviewAt: '2026-08-01', lastReviewedAt: '2026-07-28', correctStreak: 3 },
  tieNewer: { level: 2, nextReviewAt: '2026-08-01', lastReviewedAt: '2026-07-20', correctStreak: 0 }, // 동률(레벨2) + 더 과거
} } }
const merged = reviewDataCodec.mergeStates(mergeA, mergeB)
check('mergeStates: 레벨 높은 쪽이 이김(shared → a의 level 3)', merged.memoryEngine.boxes.shared.level === 3)
check('mergeStates: 한쪽에만 있는 단어는 그대로 보존(onlyA/onlyB 둘 다 존재)',
  merged.memoryEngine.boxes.onlyA.level === 1 && merged.memoryEngine.boxes.onlyB.level === 4)
check('mergeStates: 레벨 동률이면 더 최근 lastReviewedAt이 이김(tieNewer → a의 07-29)',
  merged.memoryEngine.boxes.tieNewer.lastReviewedAt === '2026-07-29')
check('mergeStates: spellingWrongToday는 합집합(파괴적 축소 없음)',
  merged.spellingWrongToday.includes('a') && merged.spellingWrongToday.includes('b'))
check('mergeStates: updatedAt은 더 최근 값', merged.memoryEngine.updatedAt === '2026-07-28')

const codecSrc = readFileSync(new URL('../../src/learning/memory/storage/reviewDataCodec.js', import.meta.url), 'utf8')
check('reviewDataCodec.js는 import 0(순수 모듈)', !/^import /m.test(codecSrc))
check('reviewDataCodec.js는 Math.random/Date.now 미사용', !codecSrc.includes('Math.random') && !codecSrc.includes('Date.now('))

// ── C3: reviewDataBackend.js — IO(로컬 미러 + 클라우드 자가치유 병합) ──────
console.log('\n-- reviewDataBackend.js: load/save(주입된 mock client/storage만 사용, 실 네트워크 0)')
function makeMemoryStorage(initial = {}) {
  const store = { ...initial }
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v }, _dump: () => store }
}
function makeMockClient({ row = null, onUpdate = null, selectError = null } = {}) {
  return {
    from(table) {
      void table
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: selectError }) }) }),
        update: (payload) => { if (onUpdate) onUpdate(payload); return { eq: async () => ({ error: null }) } },
      }
    },
  }
}

const noStorage = makeMemoryStorage()
const loadedEmpty = await reviewDataBackend.load('student-1', { storage: noStorage })
check('load: client/로컬 둘 다 없음 → emptyState()', JSON.stringify(loadedEmpty) === JSON.stringify(reviewDataCodec.emptyState()))

const localOnlyStorage = makeMemoryStorage()
await reviewDataBackend.save('student-2', { spellingWrongToday: [], memoryEngine: { version: 1, updatedAt: '2026-08-01', boxes: { w1: { level: 2, nextReviewAt: '2026-08-05', lastReviewedAt: '2026-08-01', correctStreak: 1 } } } }, '2026-08-01T00:00:00Z', { storage: localOnlyStorage })
const loadedLocalOnly = await reviewDataBackend.load('student-2', { storage: localOnlyStorage })
check('save(client 없음) → 로컬에 반영되고 load가 그대로 읽어옴', loadedLocalOnly.memoryEngine.boxes.w1.level === 2)

let updatePayload = null
const cloudRow = { review_data: { spellingWrongToday: [], memoryEngine: { version: 1, updatedAt: '2026-07-20', boxes: { wCloud: { level: 1, nextReviewAt: '2026-08-01', lastReviewedAt: '2026-07-20', correctStreak: 0 } } } } }
const client1 = makeMockClient({ row: cloudRow, onUpdate: (p) => { updatePayload = p } })
const localWithProgress = makeMemoryStorage()
await reviewDataBackend.save('student-3', { spellingWrongToday: [], memoryEngine: { version: 1, updatedAt: '2026-08-01', boxes: { wCloud: { level: 3, nextReviewAt: '2026-08-10', lastReviewedAt: '2026-08-01', correctStreak: 2 } } } }, '2026-08-01T00:00:00Z', { storage: localWithProgress }) // 먼저 로컬에 기록(진짜 흐름 흉내)
const savePromise = reviewDataBackend.save('student-3', { spellingWrongToday: [], memoryEngine: { version: 1, updatedAt: '2026-08-01', boxes: { wCloud: { level: 3, nextReviewAt: '2026-08-10', lastReviewedAt: '2026-08-01', correctStreak: 2 } } } }, '2026-08-01T00:00:00Z', { client: client1, storage: localWithProgress })
await savePromise
check('save: client 있고 기존 행 있으면 fire-and-forget UPDATE 호출됨', updatePayload !== null && updatePayload.review_data.memoryEngine.boxes.wCloud.level === 3)

let updateCalledForNoRow = false
const client2 = makeMockClient({ row: null, onUpdate: () => { updateCalledForNoRow = true } })
await reviewDataBackend.save('student-4', reviewDataCodec.emptyState(), '2026-08-01T00:00:00Z', { client: client2, storage: makeMemoryStorage() })
check('save: 클라우드에 기존 행이 없으면 UPDATE를 호출하지 않고 조용히 스킵(새 행을 만들지 않음)', updateCalledForNoRow === false)

const localMergeStorage = makeMemoryStorage()
await reviewDataBackend.save('student-5', { spellingWrongToday: ['local-word'], memoryEngine: { version: 1, updatedAt: '2026-08-01', boxes: { wShared: { level: 4, nextReviewAt: '2026-08-15', lastReviewedAt: '2026-08-01', correctStreak: 3 } } } }, '2026-08-01T00:00:00Z', { storage: localMergeStorage })
const client3 = makeMockClient({ row: { review_data: { spellingWrongToday: ['cloud-word'], memoryEngine: { version: 1, updatedAt: '2026-07-15', boxes: { wShared: { level: 1, nextReviewAt: '2026-08-01', lastReviewedAt: '2026-07-15', correctStreak: 0 }, wCloudOnly: { level: 2, nextReviewAt: '2026-08-01', lastReviewedAt: '2026-07-15', correctStreak: 1 } } } } } })
const mergedLoad = await reviewDataBackend.load('student-5', { client: client3, storage: localMergeStorage })
check('load: 로컬+클라우드 병합 — 로컬이 더 진전(level 4)된 shared 단어가 이김', mergedLoad.memoryEngine.boxes.wShared.level === 4)
check('load: 클라우드에만 있던 단어(wCloudOnly)도 보존', mergedLoad.memoryEngine.boxes.wCloudOnly?.level === 2)
check('load: spellingWrongToday도 합집합', mergedLoad.spellingWrongToday.includes('local-word') && mergedLoad.spellingWrongToday.includes('cloud-word'))

const clientNotReady = makeMockClient({ row: null, selectError: { code: '42703', message: 'column review_data does not exist' } })
const notReadyLoad = await reviewDataBackend.load('student-6', { client: clientNotReady, storage: makeMemoryStorage() })
check('load: 42703(컬럼 부재) 에러는 크래시 없이 emptyState 수준으로 폴백', JSON.stringify(notReadyLoad) === JSON.stringify(reviewDataCodec.emptyState()))

const throwingClient = { from: () => { throw new Error('network down') } }
let loadThrew = false
try { await reviewDataBackend.load('student-7', { client: throwingClient, storage: makeMemoryStorage() }) } catch { loadThrew = true }
check('load: client 자체가 throw해도 하네스로 전파되지 않음(절대 throw 안 함)', loadThrew === false)

const backendSrc = readFileSync(new URL('../../src/learning/memory/storage/reviewDataBackend.js', import.meta.url), 'utf8')
check('reviewDataBackend.js는 형제 코덱 모듈만 import(supabaseClient.js 직접 import 없음)', (() => {
  const imports = [...backendSrc.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
  return imports.length > 0 && imports.every((p) => p === './reviewDataCodec.js')
})())
check('reviewDataBackend.js 헤더가 wordLibrary.js:1697 클로버 + 플래그온 전제조건을 문서화',
  backendSrc.includes('wordLibrary.js:1697') && backendSrc.includes('플래그온 전제조건'))
check('reviewDataBackend.js 헤더가 §7.2 word_review_schedule 대안을 SQL 미작성으로 문서화',
  backendSrc.includes('word_review_schedule') && backendSrc.includes('의도적으로 작성하지 않는다'))

// ── C4: planner/sessionPlanner.js — (mode,item,options) 플랜 방출 ─────────
// sentenceLearning.js의 shuffleDeterministic을 확장자 없이 import하므로
// registry.js와 동일하게 esbuild 인메모리 번들이 필요하다(runLearningEngine
// .mjs 9-28행과 동일 관례). registry.js도 같이 번들해 "sessionPlanner가
// 방출하는 모드 이름이 전부 Learning Engine 레지스트리에 실재하는지"까지
// 교차 검증한다(플랜이 존재하지 않는 모드를 만들어내면 즉시 FAIL).
console.log('\n-- planner/sessionPlanner.js: planDailySession / planReviewSession')
mkdirSync('scripts/.tmp', { recursive: true })
await esbuild.build({
  entryPoints: ['src/learning/planner/sessionPlanner.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/sessionPlanner.memoryEngine.bundle.mjs',
})
const sessionPlanner = await import(pathToFileURL('scripts/.tmp/sessionPlanner.memoryEngine.bundle.mjs').href)

await esbuild.build({
  entryPoints: ['src/learning/engine/registry.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/registry.memoryEngine.bundle.mjs',
})
const { MODES } = await import(pathToFileURL('scripts/.tmp/registry.memoryEngine.bundle.mjs').href)
const MODE_NAMES = new Set(Object.keys(MODES))

const itemA = fromExample({ id: 'wordA', targetWord: 'apple', englishSentence: 'I eat an apple.', koreanTranslation: '나는 사과를 먹는다' })
const itemB = fromExample({ id: 'wordB', targetWord: 'banana', englishSentence: 'I eat a banana.', koreanTranslation: '나는 바나나를 먹는다' })
const itemC = fromExample({ id: 'wordC', targetWord: 'cherry', englishSentence: 'I eat a cherry.', koreanTranslation: '나는 체리를 먹는다' })

const dailyBoxes = { wordA: { level: 0 }, wordB: { level: 4 } } // wordA=신규/저박스, wordB=고박스, wordC=박스 없음(신규 취급)
const dailyPlan = sessionPlanner.planDailySession({ items: [itemA, itemB, itemC], boxes: dailyBoxes, seed: 'daily-seed' })
check('planDailySession: 모든 단계의 mode가 Learning Engine 레지스트리에 실재함',
  dailyPlan.every((step) => MODE_NAMES.has(step.mode)))
check('planDailySession: 신규/저박스(wordA, level 0) → learn+fill_blank 둘 다 등장',
  dailyPlan.some((s) => s.item.id === 'wordA' && s.mode === 'learn') && dailyPlan.some((s) => s.item.id === 'wordA' && s.mode === 'fill_blank'))
check('planDailySession: 고박스(wordB, level 4) → fill_blank만(learn 없음)',
  dailyPlan.some((s) => s.item.id === 'wordB' && s.mode === 'fill_blank') && !dailyPlan.some((s) => s.item.id === 'wordB' && s.mode === 'learn'))
check('planDailySession: 박스 없음(wordC, 한 번도 안 봄) → 신규 취급되어 learn 포함',
  dailyPlan.some((s) => s.item.id === 'wordC' && s.mode === 'learn'))
check('planDailySession: 각 단계의 item은 LearningItem 정규형 shape 그대로 보존',
  dailyPlan.every((s) => typeof s.item.id === 'string' && s.item.contentType === 'example' && typeof s.item.text === 'string'))
check('planDailySession: 기본 options.retries=1이 각 단계에 채워짐', dailyPlan.every((s) => s.options.retries === 1))

const enrichedPlan = sessionPlanner.planDailySession({ items: [itemB], boxes: dailyBoxes, seed: 'x', options: { enrich: true } })
check('planDailySession: options.enrich=true면 고박스 단어도 listen/write까지 추가',
  ['fill_blank', 'listen', 'write'].every((m) => enrichedPlan.some((s) => s.mode === m)))

const dailyPlanAgain = sessionPlanner.planDailySession({ items: [itemA, itemB, itemC], boxes: dailyBoxes, seed: 'daily-seed' })
check('planDailySession: 결정론(같은 입력·같은 seed → 바이트 동일)', JSON.stringify(dailyPlan) === JSON.stringify(dailyPlanAgain))

const itemsById = { wordA: itemA, wordB: itemB, wordC: itemC }
const reviewBoxes = { wordA: { level: 0 }, wordB: { level: 3 }, wordC: { level: 5 } }
const reviewPlan = sessionPlanner.planReviewSession({ queueWordIds: ['wordA', 'wordB', 'wordC'], itemsById, boxes: reviewBoxes, seed: 'review-seed', cap: 12 })
check('planReviewSession: 저박스(wordA) → learn+fill_blank', reviewPlan.some((s) => s.item.id === 'wordA' && s.mode === 'learn'))
check('planReviewSession: 고박스(wordB/wordC) → fill_blank만', ['wordB', 'wordC'].every((id) => !reviewPlan.some((s) => s.item.id === id && s.mode === 'learn')))
check('planReviewSession: 카탈로그에 없는 wordId는 조용히 건너뜀(추측 없이 드롭)',
  sessionPlanner.planReviewSession({ queueWordIds: ['unknownWord'], itemsById, boxes: {}, seed: 's' }).length === 0)

const cappedQueue = ['wordA', 'wordB', 'wordC', 'wordD', 'wordE']
const cappedItemsById = { ...itemsById, wordD: fromExample({ id: 'wordD', targetWord: 'date', englishSentence: 'x', koreanTranslation: 'y' }), wordE: fromExample({ id: 'wordE', targetWord: 'egg', englishSentence: 'x', koreanTranslation: 'y' }) }
const cappedPlan = sessionPlanner.planReviewSession({ queueWordIds: cappedQueue, itemsById: cappedItemsById, boxes: reviewBoxes, seed: 's', cap: 2 })
const cappedWordIds = new Set(cappedPlan.map((s) => s.item.id))
check('planReviewSession: cap이 단어 수 기준으로 정확히 적용됨(cap=2 → wordD/E는 절대 등장 안 함)',
  !cappedWordIds.has('wordD') && !cappedWordIds.has('wordE') && cappedWordIds.size === 2)

const reviewPlanAgain = sessionPlanner.planReviewSession({ queueWordIds: ['wordA', 'wordB', 'wordC'], itemsById, boxes: reviewBoxes, seed: 'review-seed', cap: 12 })
check('planReviewSession: 결정론(같은 입력 → 바이트 동일)', JSON.stringify(reviewPlan) === JSON.stringify(reviewPlanAgain))

const sessionPlannerSrc = readFileSync(new URL('../../src/learning/planner/sessionPlanner.js', import.meta.url), 'utf8')
check('sessionPlanner.js는 Math.random 미사용(결정론 — shuffleDeterministic만 사용)', !sessionPlannerSrc.includes('Math.random'))
check('sessionPlanner.js는 세션 "크기" 로직을 재구현하지 않음(SESSION_SIZE_BANDS 미포함, dailyRitual.js 책임 유지)',
  !sessionPlannerSrc.includes('SESSION_SIZE_BANDS'))

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  memory-engine — Memory Engine 순수 코어 (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  memory-engine — ${failed}건: ${failures.join(', ')}`); process.exit(1)
