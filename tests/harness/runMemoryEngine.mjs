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

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  memory-engine — Memory Engine 순수 코어 (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  memory-engine — ${failed}건: ${failures.join(', ')}`); process.exit(1)
