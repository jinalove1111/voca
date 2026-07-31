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
import { readFileSync } from 'node:fs'
import * as leitner from '../../src/learning/memory/leitner.js'
import * as difficulty from '../../src/learning/memory/difficulty.js'
import * as reviewQueue from '../../src/learning/memory/reviewQueue.js'

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

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  memory-engine — Memory Engine 순수 코어 (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  memory-engine — ${failed}건: ${failures.join(', ')}`); process.exit(1)
