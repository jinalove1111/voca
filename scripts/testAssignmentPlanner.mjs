// Verifies src/utils/assignmentPlanner.js — pure planner logic for the 숙제
// "자동 생성" feature (pickNextAssignment/planBulkDates). No Supabase/React
// involved (weeklyReport.js purity style, scripts/testWeeklyReport.mjs
// precedent) — imported directly, no bundling/stubbing needed.
import { readFileSync } from 'node:fs'
import { pickNextAssignment, planBulkDates } from '../src/utils/assignmentPlanner.js'

let failures = 0
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

const w = (word) => ({ word, meaning: word + '뜻' })
const UNIT = [w('apple'), w('banana'), w('cherry'), w('durian'), w('elderberry')]

console.log('\n1. 기본 — 이력 없이 다음 count개를 position 순서대로')
{
  const picked = pickNextAssignment({ unitWords: UNIT, recentAssignedSlugSets: [], count: 3 })
  check('처음 3개(apple,banana,cherry)', JSON.stringify(picked) === JSON.stringify(['apple', 'banana', 'cherry']), picked)
}

console.log('\n2. 최근 이력 반영 — 이미 배정한 슬러그는 건너뛰고 이어서')
{
  const picked = pickNextAssignment({
    unitWords: UNIT,
    recentAssignedSlugSets: [new Set(['apple', 'banana', 'cherry'])],
    count: 2,
  })
  check('다음 2개(durian,elderberry)', JSON.stringify(picked) === JSON.stringify(['durian', 'elderberry']), picked)
}

console.log('\n3. 유닛 전체 소진 -> 처음부터 다시(복습 회차), 빈 배열 반환 안 함')
{
  const allAssigned = new Set(UNIT.map((x) => x.word.toLowerCase()))
  const picked = pickNextAssignment({ unitWords: UNIT, recentAssignedSlugSets: [allAssigned], count: 3 })
  check('전부 이미 배정됐어도 처음 3개로 복습 회차', JSON.stringify(picked) === JSON.stringify(['apple', 'banana', 'cherry']), picked)
  check('빈 배열이 아님(학생 방치 없음)', picked.length === 3)
}

console.log('\n4. stale 슬러그(현재 유닛에 없는 옛 슬러그) 무시 — 크래시 없음, 가용 풀에 영향 없음')
{
  const picked = pickNextAssignment({
    unitWords: UNIT,
    recentAssignedSlugSets: [new Set(['zebra', 'apple'])], // zebra는 이 유닛에 없음
    count: 2,
  })
  check('stale 슬러그(zebra) 무시하고 banana부터', JSON.stringify(picked) === JSON.stringify(['banana', 'cherry']), picked)
}

console.log('\n5. count가 유닛 크기보다 큼 -> 1차 통과 후 복습 회차로 채워 count개 반환(중복 허용, 크래시 없음)')
{
  const picked = pickNextAssignment({ unitWords: UNIT, recentAssignedSlugSets: [], count: 7 })
  check('count(7)만큼 정확히 반환', picked.length === 7, picked)
  check('앞 5개는 유닛 순서 그대로', JSON.stringify(picked.slice(0, 5)) === JSON.stringify(['apple', 'banana', 'cherry', 'durian', 'elderberry']))
  check('나머지 2개는 복습 회차로 처음부터 다시(apple,banana)', JSON.stringify(picked.slice(5)) === JSON.stringify(['apple', 'banana']), picked)
}

console.log('\n6. 경계값 — 빈 유닛/count 0')
{
  check('빈 unitWords -> 빈 배열', JSON.stringify(pickNextAssignment({ unitWords: [], count: 5 })) === '[]')
  check('count 0 -> 빈 배열', JSON.stringify(pickNextAssignment({ unitWords: UNIT, count: 0 })) === '[]')
  check('unitWords 누락(undefined) -> 크래시 없이 빈 배열', JSON.stringify(pickNextAssignment({ count: 5 })) === '[]')
}

console.log('\n7. 결정론 — 같은 입력이면 항상 같은 출력')
{
  const args = { unitWords: UNIT, recentAssignedSlugSets: [new Set(['apple'])], count: 3 }
  const a = pickNextAssignment(args)
  const b = pickNextAssignment(args)
  check('두 번 호출 결과 동일', JSON.stringify(a) === JSON.stringify(b))
}

console.log('\n8. planBulkDates — 날짜별 연속 구간 배정(겹치지 않게 순서대로)')
{
  const plan = planBulkDates({ unitWords: UNIT, recentAssignedSlugSets: [], dates: ['2026-08-01', '2026-08-02', '2026-08-03'], count: 2 })
  check('2026-08-01 = apple,banana', JSON.stringify(plan['2026-08-01']) === JSON.stringify(['apple', 'banana']), plan)
  check('2026-08-02 = cherry,durian(이전 날짜와 안 겹침)', JSON.stringify(plan['2026-08-02']) === JSON.stringify(['cherry', 'durian']), plan)
  check('2026-08-03 = elderberry + 복습 회차로 apple(유닛 5개를 2개씩 나누다 마지막 구간에서 소진)', JSON.stringify(plan['2026-08-03']) === JSON.stringify(['elderberry', 'apple']), plan)
}

console.log('\n9. planBulkDates — 기존 최근 이력(recentAssignedSlugSets)이 첫 날짜부터 반영됨')
{
  const plan = planBulkDates({
    unitWords: UNIT,
    recentAssignedSlugSets: [new Set(['apple', 'banana'])],
    dates: ['2026-08-01', '2026-08-02'],
    count: 2,
  })
  check('첫 날짜는 이미 배정된 apple/banana를 건너뛰고 cherry,durian', JSON.stringify(plan['2026-08-01']) === JSON.stringify(['cherry', 'durian']), plan)
  check('둘째 날짜는 이어서 elderberry + 복습 회차 apple', JSON.stringify(plan['2026-08-02']) === JSON.stringify(['elderberry', 'apple']), plan)
}

console.log('\n10. planBulkDates — 빈 dates/빈 유닛 경계값')
{
  check('빈 dates -> 빈 객체', JSON.stringify(planBulkDates({ unitWords: UNIT, dates: [], count: 2 })) === '{}')
  const plan2 = planBulkDates({ unitWords: [], dates: ['2026-08-01'], count: 2 })
  check('빈 유닛 -> 각 날짜가 빈 배열', JSON.stringify(plan2['2026-08-01']) === '[]', plan2)
}

console.log('\n11. 순수성(코드 레벨) — 외부 클라이언트/React 의존성 없음, 무작위/비결정 요소 없음, import 0')
{
  const src = readFileSync(new URL('../src/utils/assignmentPlanner.js', import.meta.url), 'utf8')
  // 오탐 방지 — "실사용 패턴"만 정밀 검사(tests/harness/runLearningEngine.mjs의
  // SUPABASE_USAGE_RE와 동일 관례). 헤더 주석이 이 파일의 순수성 자체를
  // 설명하며 관련 단어를 텍스트로 언급하므로, 단순 문자열 포함 검사는 그
  // 설명 문장 때문에 오탐(false FAIL)한다.
  check('import 0 순수 모듈', !/^import /m.test(src))
  check('무작위 함수 실사용 없음(결정론)', !/Math\s*\.\s*random\s*\(/.test(src))
  check('DB 클라이언트 실사용 없음(import 경로/실제 호출 패턴만 정밀 검사)', !/from\s+['"][^'"]*supabase[^'"]*['"]|supabase\s*\.\s*(from|auth|rpc|storage|channel)\s*\(|createClient\s*\(/i.test(src))
  check('현재 시각 참조(비결정) 실사용 없음', !/Date\s*\.\s*now\s*\(|\.toISOString\s*\(|new\s+Date\s*\(/.test(src))
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
