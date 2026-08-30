// 관리자 분석 패널 — 1000행 절단 회귀 (2026-08-30)
//
// 실측 배경(라이브 읽기 전용):
//   · 이 Supabase 프로젝트의 PostgREST max-rows 는 **1000** 이다.
//     words 테이블(1,656행)에 `?limit=20000` 을 걸어도 실제로는 1000행만
//     돌아온다 — 즉 `.limit(n)` 은 상한을 올려주지 않는다.
//   · AnalyticsPanel 의 product_events 조회는 60일 창에 `.limit(20000)` 만
//     걸려 있는데, 그 창의 실제 행 수는 **5,634** 다. 지금 이 순간에도
//     1000행만 받아 4개 지표를 계산하고 있다:
//       computeReturnRates / computeGardenRevisits /
//       computeFeatureCounts / computeAvgSessionMinutes
//     재방문율·평균 세션 시간은 anon_id 단위 비율이라, 잘림은 단순
//     과소집계가 아니라 **사용자 자체가 통째로 빠지는** 왜곡을 만든다.
//   · word_status 는 2,771행(현재 status=mastered 는 0행이라 아직 미발현),
//     student_progress 190행 / student_class_assignments 482행은 현재 안전.
//     상한을 넘는 순간 같은 왜곡이 생기므로 함께 페이지네이션한다.
//
// 이 저장소는 같은 사고를 이미 두 번 겪었다 — words 1093행 절단(2026-08-12)과
// students 1000행 절단(refreshStudents). 그때 만들어진 selectAllRows /
// selectAllStudents 패턴이 이미 wordLibrary.js 에 있는데 관리자 패널만
// 그 패턴을 쓰지 않았다. 이 수정은 새 방식을 만들지 않고 그 헬퍼를 재사용한다.
//
// **결정적 정렬이 페이지네이션의 전제다**(wordLibrary.js selectAllRows 위
// 주석). 정렬 키에 tie 가 있으면 페이지 경계에서 행이 누락/중복된다.
// product_events 에는 고유 컬럼 id 가 있으므로(라이브 확인) 그것을 정렬
// 키로 쓴다 — 정렬 없이 페이지네이션만 붙이면 오히려 새 버그가 된다.
//
// 하네스: 정적 소스 계약 + 순수 페이지네이션 시뮬레이션. 실제 DB 접촉 0,
// 네트워크 0(라이브 수치는 위 주석에 실측으로 남기고, 테스트는 오프라인).
// 등록: npm run verify:analytics-pagination
import fs from 'node:fs'

let failures = 0, asserted = 0
function check(label, cond, detail) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`); failures++ }
}

const SRC = fs.readFileSync('src/components/admin/AnalyticsPanel.jsx', 'utf8')
// 주석 오탐 방지. CRLF 체크아웃이라 `.` 가 \r 을 매칭하지 않는 점에 주의
// (/\/\/.*$/ 는 CRLF 파일에서 주석을 못 지운다 — 문자클래스로 명시한다).
const codeOnly = SRC.split(/\r?\n/).map((l) => l.replace(/\/\/[^\r\n]*/, '')).join('\n')

console.log('\n=== 관리자 분석 패널 — 1000행 절단 계약 ===\n')

console.log('1. product_events — 60일 창 전량 수집')
{
  check('product_events 조회가 존재한다', /from\('product_events'\)/.test(codeOnly))
  check('`.limit(20000)` 같은 헛된 상한에 의존하지 않는다',
    !/\.limit\(\s*\d{4,}\s*\)/.test(codeOnly),
    (codeOnly.match(/\.limit\(\s*\d+\s*\)/) || [''])[0])
  check('페이지네이션 헬퍼를 쓴다(selectAllRows)', /selectAllRows/.test(codeOnly))
  check('결정적 정렬 키가 걸려 있다(id)', /\.order\(\s*'id'/.test(codeOnly))
}

console.log('\n2. 나머지 3개 집계 조회도 절단에 안전한가')
{
  for (const t of ['student_progress', 'word_status', 'student_class_assignments']) {
    const idx = codeOnly.indexOf(`from('${t}')`)
    check(`${t} 조회가 존재한다`, idx >= 0)
    if (idx < 0) continue
    // 해당 조회가 selectAllRows 로 감싸져 있는지 — 같은 줄 앞부분에서 확인
    const lineStart = codeOnly.lastIndexOf('\n', idx) + 1
    const lineEnd = codeOnly.indexOf('\n', idx)
    const line = codeOnly.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
    check(`${t} 조회가 selectAllRows 로 감싸져 있다`, /selectAllRows/.test(line), line.trim().slice(0, 110))
    check(`${t} 조회에 결정적 정렬이 있다`, /\.order\(/.test(line), line.trim().slice(0, 110))
  }
}

console.log('\n3. wordLibrary 의 selectAllRows 가 재사용 가능하게 export 된다')
{
  const wl = fs.readFileSync('src/utils/wordLibrary.js', 'utf8')
  check('selectAllRows 가 export 된다', /export async function selectAllRows|export \{[^}]*selectAllRows/.test(wl))
  check('SELECT_PAGE_SIZE 가 1000 그대로다(실측 max-rows 와 일치)', /SELECT_PAGE_SIZE = 1000/.test(wl))
}

console.log('\n4. 페이지네이션 알고리즘 시뮬레이션 (순수, DB 접촉 0)')
{
  // 서버 상한 1000을 그대로 재현하는 가짜 조회기
  const MAXROWS = 1000
  function makeServer(total) {
    const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }))
    return (from, to) => {
      const end = Math.min(to + 1, from + MAXROWS, rows.length)
      return rows.slice(from, Math.max(from, end))
    }
  }
  function selectAll(server) {
    const PAGE = 1000
    let all = [], from = 0
    for (;;) {
      const page = server(from, from + PAGE - 1)
      all = all.concat(page)
      if (page.length < PAGE) break
      from += PAGE
    }
    return all
  }
  for (const total of [0, 1, 999, 1000, 1001, 2771, 5634]) {
    const got = selectAll(makeServer(total))
    check(`${total}행 -> 전량 ${total}행 수집`, got.length === total, String(got.length))
    check(`${total}행 -> 중복 없음`, new Set(got.map((r) => r.id)).size === total)
  }
  // 대조군 — 페이지네이션 없이 한 번만 요청하면 실제로 잘린다(현재 동작)
  const naive = makeServer(5634)(0, 19999)
  check('[대조군] limit(20000) 단발 요청은 1000행에서 잘린다(현재 버그 재현)', naive.length === 1000, String(naive.length))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 관리자 분석 지표가 1000행에서 잘리지 않는다')
