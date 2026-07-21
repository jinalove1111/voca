// tests/harness/runDailyRitual.mjs — "3분 데일리 리추얼" 세션 플래너 하네스.
//
// 다른 verify:* 하네스(runQuiz.mjs 등)는 registry.mjs를 거쳐 기존
// scripts/testX.mjs를 child_process로 실행하는 얇은 래퍼지만, 이 하네스는
// 검증 대상(src/utils/dailyRitual.js)이 TESTING.md 카테고리 1의 "완전 순수
// 모듈"(React/네트워크/import.meta.env 없음)이라 번들/빌드 단계 없이 직접
// import해서 이 파일 안에서 단언한다 — 이번 작업의 파일 소유 범위가
// tests/harness/ 하나로 제한돼 있어 scripts/에 test 파일을 새로 만들 수
// 없다는 제약도 이유(registry의 "checks는 scripts/*.mjs" 관례 대신
// 자기완결형 단일 파일). 출력 포맷(PASS/FAIL/summary/exit code)은
// runDomain.mjs와 동일하게 맞춘다.
//
// 로직 재구현 없음 — 항상 실제 소스(src/utils/dailyRitual.js)를 import.
import {
  SESSION_SIZE_BANDS,
  ADAPTATION_THRESHOLDS,
  bandForTotal,
  planSessionSize,
  planSessionCount,
  sessionProgressDisplay,
} from '../../src/utils/dailyRitual.js'

let passed = 0
let failed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\n=== [harness:dailyRitual] 3분 데일리 리추얼 — 적응형 마이크로 세션 플래너 ===')

// ── 1) 밴드 경계 — 운영자 규칙 그대로인지 (10,20 / 21,40 / 41,70 / 71,100) ──
console.log('\n-- 1) 밴드 경계')
const boundaryExpect = [
  [10, 5, 10], [20, 5, 10],
  [21, 8, 12], [40, 8, 12],
  [41, 10, 15], [70, 10, 15],
  [71, 12, 20], [100, 12, 20],
]
for (const [total, minSize, maxSize] of boundaryExpect) {
  const b = bandForTotal(total)
  check(`총량 ${total} → 밴드 [${minSize}-${maxSize}]`,
    b && b.minSize === minSize && b.maxSize === maxSize,
    `got ${JSON.stringify(b)}`)
  const size = planSessionSize({ totalWords: total, remainingWords: total })
  const mid = Math.round((minSize + maxSize) / 2)
  check(`총량 ${total} 첫 세션(null 신호) = 밴드 중간값 ${mid}`, size === mid, `got ${size}`)
}

// ── 2) 엣지 — <10은 한 세션에 전부, >100은 최상위 밴드로 클램프 ──
console.log('\n-- 2) 엣지(<10 / >100)')
for (const total of [1, 2, 5, 9]) {
  const size = planSessionSize({ totalWords: total, remainingWords: total })
  check(`총량 ${total}(<10) → 한 세션에 전부(${total})`, size === total, `got ${size}`)
}
check('총량 9 → bandForTotal null(밴드 미적용)', bandForTotal(9) === null)
for (const total of [101, 150, 500]) {
  const b = bandForTotal(total)
  check(`총량 ${total}(>100) → 최상위 밴드 [12-20]로 클램프`,
    b && b.minSize === 12 && b.maxSize === 20, `got ${JSON.stringify(b)}`)
  const size = planSessionSize({ totalWords: total, remainingWords: total })
  check(`총량 ${total} 첫 세션 크기 = 최상위 밴드 중간값 16`, size === 16, `got ${size}`)
}
check('총량 0 → 세션 크기 0', planSessionSize({ totalWords: 0, remainingWords: 0 }) === 0)

// ── 3) 적응 — 축소/확대/밴드 클램프 ──
console.log('\n-- 3) 적응(축소/확대/클램프)')
{
  const base = { totalWords: 60, remainingWords: 60 } // 밴드 [10-15], mid 13
  check('낮은 정답률(0.5) → 밴드 최소 10',
    planSessionSize({ ...base, recentAccuracy: 0.5, recentPaceMsPerWord: 30000 }) === 10)
  check('느린 페이스(60s/단어) → 밴드 최소 10 (정답률 좋아도)',
    planSessionSize({ ...base, recentAccuracy: 0.95, recentPaceMsPerWord: 60000 }) === 10)
  check('높은 정답률(0.95) + 빠른 페이스(15s) → 밴드 최대 15',
    planSessionSize({ ...base, recentAccuracy: 0.95, recentPaceMsPerWord: 15000 }) === 15)
  check('높은 정답률만(페이스 null) → 확대 안 함, 중간값 13',
    planSessionSize({ ...base, recentAccuracy: 0.95 }) === 13)
  check('빠른 페이스만(정답률 null) → 확대 안 함, 중간값 13',
    planSessionSize({ ...base, recentPaceMsPerWord: 15000 }) === 13)
  check('둘 다 null(첫 세션) → 중간값 13',
    planSessionSize({ ...base }) === 13)
  // 극단값도 밴드 밖으로 절대 못 나감
  const worst = planSessionSize({ ...base, recentAccuracy: 0, recentPaceMsPerWord: 10 * 60 * 1000 })
  const best = planSessionSize({ ...base, recentAccuracy: 1, recentPaceMsPerWord: 1 })
  check('극단 최악 신호도 밴드 최소(10) 아래로 안 내려감', worst === 10, `got ${worst}`)
  check('극단 최고 신호도 밴드 최대(15) 위로 안 올라감', best === 15, `got ${best}`)
  // 경계값 자체(=)는 중립 — 임계값 상수와의 비교가 초과/미만인지 확인
  check('정답률이 정확히 lowAccuracy(0.7)면 축소 안 함(미만만 축소)',
    planSessionSize({ ...base, recentAccuracy: ADAPTATION_THRESHOLDS.lowAccuracy }) === 13)
  check('페이스가 정확히 slowPace(45s)면 축소 안 함(초과만 축소)',
    planSessionSize({ ...base, recentPaceMsPerWord: ADAPTATION_THRESHOLDS.slowPaceMsPerWord }) === 13)
}

// ── 4) remainingWords < 밴드 최소 → 남은 것 전부(0이 아님, 초과도 아님) ──
console.log('\n-- 4) 남은 단어가 밴드 최소보다 적을 때')
{
  const size = planSessionSize({ totalWords: 60, remainingWords: 3 })
  check('총량 60, 남은 3 → 3 (밴드 최소 10보다 작아도 남은 것 전부)', size === 3, `got ${size}`)
  const size1 = planSessionSize({ totalWords: 100, remainingWords: 1, recentAccuracy: 0.2, recentPaceMsPerWord: 99999 })
  check('남은 1개면 어떤 신호에서도 1 반환(0 금지 — 손실 불가 불변)', size1 === 1, `got ${size1}`)
}

// ── 5) 손실 없음 — 세션 크기의 합 === 배정 총량 (여러 총량 × 피드백 패턴) ──
console.log('\n-- 5) 세션 합 = 총량(단어 손실 없음)')
const feedbackPatterns = [
  { name: '첫세션 신호 없음(전부 null)', fn: () => ({ recentAccuracy: null, recentPaceMsPerWord: null }) },
  { name: '항상 힘들어함', fn: () => ({ recentAccuracy: 0.4, recentPaceMsPerWord: 70000 }) },
  { name: '항상 잘함', fn: () => ({ recentAccuracy: 0.98, recentPaceMsPerWord: 12000 }) },
  {
    name: '들쭉날쭉(세션마다 교대)',
    fn: (i) => (i % 2 === 0
      ? { recentAccuracy: 0.98, recentPaceMsPerWord: 12000 }
      : { recentAccuracy: 0.5, recentPaceMsPerWord: 60000 }),
  },
]
for (const total of [1, 5, 9, 10, 15, 20, 21, 33, 40, 41, 55, 70, 71, 88, 100, 120, 250]) {
  for (const pattern of feedbackPatterns) {
    let remaining = total
    let sum = 0
    let sessions = 0
    let allSizesValid = true
    while (remaining > 0 && sessions < 1000) {
      const signals = sessions === 0 ? { recentAccuracy: null, recentPaceMsPerWord: null } : pattern.fn(sessions)
      const size = planSessionSize({ totalWords: total, remainingWords: remaining, ...signals })
      if (size < 1 || size > remaining) { allSizesValid = false; break }
      sum += size
      remaining -= size
      sessions++
    }
    check(`총량 ${total} · ${pattern.name} → 합 ${sum} === ${total} (세션 ${sessions}개, 크기 항상 1..remaining)`,
      allSizesValid && sum === total && remaining === 0,
      `sum=${sum}, remaining=${remaining}, valid=${allSizesValid}`)
  }
}

// ── 6) planSessionCount ──
console.log('\n-- 6) planSessionCount')
check('남은 0 → 0세션', planSessionCount(0, 10) === 0)
check('남은 30, 크기 10 → 3세션', planSessionCount(30, 10) === 3)
check('남은 31, 크기 10 → 4세션(올림)', planSessionCount(31, 10) === 4)
check('크기 0/이상값 → 1로 방어(무한 세션 금지)', planSessionCount(10, 0) === 10)

// ── 7) 진행 표시 — K <= N, M <= T가 어떤 시뮬레이션에서도 유지 ──
console.log('\n-- 7) 진행 표시 불변(K<=N, M<=T)')
{
  let violations = 0
  for (const total of [10, 21, 41, 60, 71, 100]) {
    for (const startOffset of [0, Math.floor(total / 2), total]) {
      let completedWords = startOffset
      let sessionsCompleted = 0
      // 시뮬레이션: 남은 단어를 세션 단위로 소진하며 매 스텝 표시값 확인
      let guard = 0
      while (guard++ < 1000) {
        const remaining = total - completedWords
        const size = planSessionSize({ totalWords: total, remainingWords: remaining })
        const plannedSize = Math.max(1, size)
        // 세션 도중(단어 하나씩 완료될 때마다)의 표시도 전부 확인
        for (let w = 0; w <= size; w++) {
          const d = sessionProgressDisplay({
            sessionsCompleted,
            wordsCompleted: completedWords + w,
            totalWords: total,
            plannedSessionSize: plannedSize,
          })
          if (d.sessionNumber > d.sessionCount || d.wordsCompleted > d.totalWords || d.wordsCompleted < 0) violations++
        }
        if (remaining === 0) break
        completedWords += size
        sessionsCompleted++
      }
    }
  }
  check('모든 시뮬레이션 스텝에서 K<=N, 0<=M<=T', violations === 0, `${violations}건 위반`)
  // 전부 완료 직후에도 K > N이 되지 않음(클램프 확인)
  const d = sessionProgressDisplay({ sessionsCompleted: 4, wordsCompleted: 60, totalWords: 60, plannedSessionSize: 15 })
  check('전부 완료 후에도 K<=N (클램프)', d.sessionNumber <= d.sessionCount, JSON.stringify(d))
  // 과잉 입력 클램프
  const d2 = sessionProgressDisplay({ sessionsCompleted: 0, wordsCompleted: 999, totalWords: 60, plannedSessionSize: 15 })
  check('M이 T를 절대 초과하지 않음(과잉 입력 클램프)', d2.wordsCompleted === 60, JSON.stringify(d2))
}

// ── 8) 상수 무결성 — 밴드 데이터가 서로 겹치거나 구멍나지 않는지 ──
console.log('\n-- 8) 밴드 상수 무결성')
{
  let contiguous = true
  for (let i = 1; i < SESSION_SIZE_BANDS.length; i++) {
    if (SESSION_SIZE_BANDS[i].minTotal !== SESSION_SIZE_BANDS[i - 1].maxTotal + 1) contiguous = false
  }
  check('밴드 구간이 연속(겹침/구멍 없음)', contiguous)
  check('모든 밴드에서 minSize <= maxSize', SESSION_SIZE_BANDS.every((b) => b.minSize <= b.maxSize))
  check('모든 밴드에서 maxSize <= maxTotal(한 세션이 배정 총량을 못 넘음)',
    SESSION_SIZE_BANDS.every((b) => b.maxSize <= b.minTotal))
}

// ── summary (runDomain.mjs와 동일 포맷) ──
console.log('\n=== summary ===')
if (failed === 0) {
  console.log(`  PASS  dailyRitual — 세션 플래너 순수 로직 (${passed}개 단언)`)
} else {
  console.log(`  FAIL  dailyRitual — 실패 ${failed}/${passed + failed}: ${failures.join(', ')}`)
}
process.exit(failed === 0 ? 0 : 1)
