// scripts/pilotStudentDiag.mjs — Pilot 학생 1명 진단 CLI (2026-09-11, TASK 10)
//
// ★ READ-ONLY 보장 ★
// 이 파일은 anon key로 HTTP GET/HEAD만 보낸다. POST/PATCH/PUT/DELETE 경로가
// 존재하지 않고, supabase-js도 쓰지 않으며(raw fetch만), RPC(POST
// /rest/v1/rpc/*)도 절대 호출하지 않는다 — studentHealthCheck.mjs와 동일한
// "구조적으로 쓰기 경로 자체가 없다" 원칙(그 파일 헤더 참고).
//
// 학생 식별은 항상 UUID(student_id)로만 한다(CLAUDE.md 규칙 4) — 이름으로
// 조회하는 옵션은 의도적으로 만들지 않았다.
//
// PIN 컬럼(pin_hash/pin_fail_count/pin_locked_until/pin_setup_allowed)은
// 이 파일 어디에서도 select하지 않는다(CLAUDE.md 규칙 11) — students 조회는
// 항상 명시적 컬럼 목록만 쓰고 `select=*`를 쓰지 않는다.
//
// reward_ledger/dollar_ledger/town_purchases/star_purchases/reward_totals/
// dollar_balances는 anon에 GRANT가 전혀 없어(정책 0 + GRANT 0) 이 스크립트
// 로는 절대 값을 볼 수 없다 — 이 스크립트는 그 사실을 "실패"로 감추지 않고
// HTTP 상태 코드를 그대로 보여주며 "SQL 파일 필요"라고 명시한다. 실제 값이
// 필요하면 production_pilot_student_diagnostic.sql을 Supabase 대시보드
// SQL Editor(service_role)에서 운영자가 직접 실행해야 한다.
//
// 사용법:
//   node scripts/pilotStudentDiag.mjs --student <uuid>   해당 학생 진단
//   node scripts/pilotStudentDiag.mjs --self-test        네트워크 0, 픽스처로
//                                                          포맷터만 검증(CI/등록용)
//   node scripts/pilotStudentDiag.mjs --student <uuid> --mask-names
//                                                          이름을 첫 글자+***로 마스킹
//                                                          (CI/GITHUB_ACTIONS 환경이면
//                                                           플래그 없이도 자동 적용)
//
// exit code: --self-test는 픽스처 단언이 전부 PASS면 0, 하나라도 FAIL이면 1.
//   --student 라이브 조회는 조회 자체가 성공하면 0(학생 데이터의 좋고
//   나쁨을 판정하는 게이트가 아니라 순수 진단 도구이기 때문 — studentHealthCheck.mjs
//   와 달리 PASS/FAIL 판정이 없다), 네트워크/자격증명 오류면 1.
import fs from 'node:fs'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}
const SELF_TEST = flag('--self-test')
const STUDENT_ID = opt('--student')
const IS_CI = !!(process.env.CI || process.env.GITHUB_ACTIONS)
const MASK_NAMES = flag('--mask-names') || IS_CI

// prodCheck.mjs/studentHealthCheck.mjs의 maskName()과 동일 규칙(첫 글자
// + ***, 빈 값은 "(이름없음)")을 이 파일에서도 독립적으로 정의한다 — 세
// 스크립트는 서로 import하지 않는 별도 CLI라 표시용 순수 함수의 독립
// 정의까지 막을 이유가 없다(CLAUDE.md 규칙 3은 이미 검증된 "로직"의
// 재구현을 금지하는 것이지, 이런 3줄짜리 표시 함수의 파일 소유권 분리를
// 막지 않는다 — studentHealthCheck.mjs 헤더의 동일 판단 참고).
function maskName(name) {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) return '(이름없음)'
  return `${n[0]}***`
}

const SQL_ONLY_NOTE = 'service_role 전용(정책 0 + GRANT 0) — production_pilot_student_diagnostic.sql을 Supabase 대시보드 SQL Editor에서 실행해야 값을 볼 수 있습니다.'

// ── 순수 포맷터 — report 객체(라이브 조회 결과든 --self-test 픽스처든
// 형태만 같으면 무엇이든) 를 사람이 읽을 텍스트로 바꾼다. 네트워크 호출
// 없음(순수 함수) — --self-test가 이 함수만 픽스처로 검증한다.
export function renderReport(report, { mask } = { mask: false }) {
  const lines = []
  const displayName = (n) => (mask ? maskName(n) : (n ?? '(없음)'))

  lines.push('=== Pilot Student Diagnostic (anon key, READ-ONLY) ===')
  lines.push(`student_id: ${report.studentId}`)
  lines.push('')

  lines.push('-- students --')
  if (!report.student) {
    lines.push('  조회 결과 없음 — UUID 오타이거나 삭제된 학생일 수 있습니다.')
  } else {
    lines.push(`  이름: ${displayName(report.student.name)}`)
    lines.push(`  반(class_id 조인): ${report.student.className ?? '(없음)'}`)
    lines.push(`  class_id: ${report.student.class_id ?? '(없음)'}`)
    lines.push(`  current_unit_id: ${report.student.current_unit_id ?? '(없음)'}`)
  }
  lines.push('')

  lines.push('-- student_progress --')
  if (!report.progress) {
    lines.push('  행 없음(아직 클라우드 백업 전이거나 신규 학생일 수 있음)')
  } else {
    const p = report.progress
    lines.push(`  total_stars: ${p.total_stars}`)
    lines.push(`  total_xp: ${p.total_xp}`)
    lines.push(`  last_studied_date: ${p.last_studied_date}`)
    lines.push(`  updated_at: ${p.updated_at}`)
    lines.push(`  progress_data.townPlacements 길이: ${p.townPlacementsLen}`)
    lines.push(`  progress_data.townRemovedIds 길이: ${p.townRemovedIdsLen}`)
    lines.push(`  progress_data.rewardLedger(로컬 미러) 항목 수: ${p.rewardLedgerLocalLen}`)
    lines.push(`  progress_data.round.starGrantLog 길이: ${p.starGrantLogLen}`)
  }
  lines.push('')

  lines.push(`-- xp_ledger 최근 ${report.xpLedger.recent.length}건(최대 20) + 누적 합계 --`)
  lines.push(`  xp_sum(전체 합계, 20건 제한 없음): ${report.xpLedger.sum}`)
  for (const row of report.xpLedger.recent) {
    lines.push(`  ${row.created_at}  ${row.event_type}  +${row.amount}  (source_event_id=${row.source_event_id})`)
  }
  lines.push('')

  lines.push(`-- word_status 개수(HEAD count=exact) -- ${report.wordStatusCount ?? '(조회 실패)'}`)
  lines.push('')

  lines.push(`-- entrance_test_results 최근 ${report.entranceResults.length}건(최대 5) --`)
  for (const row of report.entranceResults) {
    lines.push(`  ${row.submitted_at}  score=${row.score}/${row.total}  missed=${Array.isArray(row.missed_words) ? row.missed_words.length : '?'}개`)
  }
  lines.push('')

  lines.push('=== service_role 전용 — 이 스크립트로는 볼 수 없음(SQL 파일 필요) ===')
  for (const t of report.requiresSql) {
    lines.push(`  ${t.table}: HTTP ${t.status}  — ${SQL_ONLY_NOTE}`)
  }

  return lines.join('\n')
}

// ── --self-test: 네트워크 0, 픽스처로 renderReport()/maskName()만 검증 ──
function runSelfTest() {
  let passed = 0
  let failed = 0
  const check = (name, cond, detail = '') => {
    if (cond) { passed++; console.log(`  PASS  ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
  }

  console.log('=== pilotStudentDiag --self-test (네트워크 0, 픽스처 기반) ===')

  // 1) maskName 순수 함수 계약
  check('maskName("예지") === "예***"', maskName('예지') === '예***')
  check('maskName("") === "(이름없음)"', maskName('') === '(이름없음)')
  check('maskName(undefined) === "(이름없음)"', maskName(undefined) === '(이름없음)')

  // 2) renderReport — 정상 케이스 픽스처(실명/실 UUID 아님, 합성 데이터)
  const fixture = {
    studentId: '11111111-1111-1111-1111-111111111111',
    student: { name: '예지', className: '합성테스트반', class_id: '22222222-2222-2222-2222-222222222222', current_unit_id: '33333333-3333-3333-3333-333333333333' },
    progress: {
      total_stars: 120, total_xp: 340, last_studied_date: '2026-09-10', updated_at: '2026-09-10T12:00:00Z',
      townPlacementsLen: 3, townRemovedIdsLen: 1, rewardLedgerLocalLen: 42, starGrantLogLen: 5,
    },
    xpLedger: { sum: 340, recent: [{ created_at: '2026-09-10T09:00:00Z', event_type: 'daily-login', amount: 5, source_event_id: 'evt-1' }] },
    wordStatusCount: 87,
    entranceResults: [{ submitted_at: '2026-09-09T01:00:00Z', score: 8, total: 10, missed_words: ['apple'] }],
    requiresSql: [
      { table: 'reward_ledger', status: 401 },
      { table: 'dollar_ledger', status: 401 },
      { table: 'town_purchases', status: 401 },
      { table: 'star_purchases', status: 401 },
    ],
  }

  const rendered = renderReport(fixture, { mask: false })
  check('학생 이름(마스킹 없음)이 출력에 그대로 나타난다', rendered.includes('이름: 예지'))
  check('반 이름이 출력에 나타난다', rendered.includes('합성테스트반'))
  check('total_stars 값이 출력에 나타난다', rendered.includes('total_stars: 120'))
  check('total_xp 값이 출력에 나타난다', rendered.includes('total_xp: 340'))
  check('townPlacements 길이가 출력에 나타난다', rendered.includes('townPlacements 길이: 3'))
  check('xp_sum이 출력에 나타난다', rendered.includes('xp_sum(전체 합계, 20건 제한 없음): 340'))
  check('word_status 개수가 출력에 나타난다', rendered.includes('word_status 개수(HEAD count=exact) -- 87'))
  check('entrance_test_results 점수가 출력에 나타난다', rendered.includes('score=8/10'))
  for (const t of fixture.requiresSql) {
    check(`${t.table}는 service_role 전용 안내가 출력된다`, rendered.includes(`${t.table}: HTTP 401`) && rendered.includes('SQL 파일'))
  }

  const maskedRendered = renderReport(fixture, { mask: true })
  check('mask:true 이면 이름이 마스킹된다', maskedRendered.includes('이름: 예***') && !maskedRendered.includes('이름: 예지'))

  // 3) renderReport — 학생/진행도 행이 아예 없는 케이스(신규/삭제된 UUID)
  const emptyFixture = {
    studentId: '99999999-9999-9999-9999-999999999999',
    student: null,
    progress: null,
    xpLedger: { sum: 0, recent: [] },
    wordStatusCount: 0,
    entranceResults: [],
    requiresSql: [],
  }
  const emptyRendered = renderReport(emptyFixture, { mask: false })
  check('students 행 없음 케이스에서 크래시 없이 안내 문구가 나온다', emptyRendered.includes('조회 결과 없음'))
  check('student_progress 행 없음 케이스에서 크래시 없이 안내 문구가 나온다', emptyRendered.includes('행 없음(아직 클라우드 백업 전이거나 신규 학생일 수 있음)'))

  console.log(`\n${failed === 0 ? 'ALL SELF-TEST CHECKS PASSED' : 'SELF-TEST FAILED'} — ${passed} passed, ${failed} failed`)
  process.exitCode = failed === 0 ? 0 : 1
}

if (SELF_TEST) {
  runSelfTest()
} else {
  await runLive()
}

// ── 라이브 조회(네트워크 있음) — 아래부터는 --self-test 경로에서 절대
// 실행되지 않는다(위 if/else가 분기 진입 자체를 막는다 — self-test는
// fetch를 참조하지도 호출하지도 않는다). ────────────────────────────────
async function runLive() {
  if (!STUDENT_ID) {
    console.error('사용법: node scripts/pilotStudentDiag.mjs --student <uuid>  (또는 --self-test)')
    process.exitCode = 1
    return
  }

  let BASE = process.env.VITE_SUPABASE_URL || ''
  let KEY = process.env.VITE_SUPABASE_ANON_KEY || ''
  if (!BASE || !KEY) {
    try {
      const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/).filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
      BASE = BASE || env.VITE_SUPABASE_URL
      KEY = KEY || env.VITE_SUPABASE_ANON_KEY
    } catch { /* .env 없음 — 아래에서 처리 */ }
  }
  if (!BASE || !KEY) {
    console.error('FAIL — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없어 라이브 조회를 할 수 없습니다.')
    process.exitCode = 1
    return
  }
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
  const TIMEOUT_MS = 20000

  async function getJson(path) {
    const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: H, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return { ok: false, status: res.status, data: null }
    return { ok: true, status: res.status, data: await res.json() }
  }

  async function headCount(path) {
    const res = await fetch(`${BASE}/rest/v1/${path}`, {
      method: 'HEAD',
      headers: { ...H, Prefer: 'count=exact' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const range = res.headers.get('content-range')
    const total = range && range.includes('/') ? Number(range.split('/')[1]) : null
    return { ok: res.ok, status: res.status, total }
  }

  async function headOnly(path) {
    const res = await fetch(`${BASE}/rest/v1/${path}`, { method: 'HEAD', headers: H, signal: AbortSignal.timeout(TIMEOUT_MS) })
    return { ok: res.ok, status: res.status }
  }

  const asArray = (v) => (Array.isArray(v) ? v : [])

  try {
    // students — PIN 4컬럼은 절대 select 목록에 넣지 않는다(CLAUDE.md 규칙 11).
    const studentRes = await getJson(`students?id=eq.${STUDENT_ID}&select=id,name,class_id,current_unit_id,classes(name)`)
    const studentRow = studentRes.ok && Array.isArray(studentRes.data) ? studentRes.data[0] : null
    const student = studentRow
      ? { name: studentRow.name, className: studentRow.classes?.name ?? null, class_id: studentRow.class_id, current_unit_id: studentRow.current_unit_id }
      : null

    // student_progress
    const progressRes = await getJson(`student_progress?student_id=eq.${STUDENT_ID}&select=total_stars,total_xp,last_studied_date,updated_at,progress_data`)
    const progressRow = progressRes.ok && Array.isArray(progressRes.data) ? progressRes.data[0] : null
    const pd = progressRow?.progress_data || {}
    const progress = progressRow
      ? {
          total_stars: progressRow.total_stars,
          total_xp: progressRow.total_xp,
          last_studied_date: progressRow.last_studied_date,
          updated_at: progressRow.updated_at,
          townPlacementsLen: asArray(pd.townPlacements).length,
          townRemovedIdsLen: asArray(pd.townRemovedIds).length,
          rewardLedgerLocalLen: asArray(pd.rewardLedger).length,
          starGrantLogLen: asArray(pd.round?.starGrantLog).length,
        }
      : null

    // xp_ledger — 최근 20건(표시용) + 전체 합계(별도 조회, amount만)
    const xpRecentRes = await getJson(`xp_ledger?student_id=eq.${STUDENT_ID}&select=event_type,amount,source_event_id,created_at&order=created_at.desc&limit=20`)
    const xpAllRes = await getJson(`xp_ledger?student_id=eq.${STUDENT_ID}&select=amount`)
    const xpSum = xpAllRes.ok ? asArray(xpAllRes.data).reduce((acc, r) => acc + (Number(r.amount) || 0), 0) : null

    // word_status — 개수만 필요하므로 HEAD count=exact(본문 전송 없음)
    const wordStatusRes = await headCount(`word_status?student_id=eq.${STUDENT_ID}&select=word_id`)

    // entrance_test_results — 최근 5건
    const entranceRes = await getJson(`entrance_test_results?student_id=eq.${STUDENT_ID}&select=score,total,missed_words,submitted_at&order=submitted_at.desc&limit=5`)

    // service_role 전용 테이블 — anon 접근 불가 예상(401). HEAD로 상태
    // 코드만 확인하고 본문은 절대 읽지 않는다.
    const requiresSql = []
    for (const table of ['reward_ledger', 'dollar_ledger', 'town_purchases', 'star_purchases']) {
      const probe = await headOnly(`${table}?student_id=eq.${STUDENT_ID}&select=id&limit=1`)
      requiresSql.push({ table, status: probe.status })
    }

    const report = {
      studentId: STUDENT_ID,
      student,
      progress,
      xpLedger: { sum: xpSum, recent: xpRecentRes.ok ? asArray(xpRecentRes.data) : [] },
      wordStatusCount: wordStatusRes.ok ? wordStatusRes.total : null,
      entranceResults: entranceRes.ok ? asArray(entranceRes.data) : [],
      requiresSql,
    }

    console.log(renderReport(report, { mask: MASK_NAMES }))
    process.exitCode = 0
  } catch (err) {
    console.error(`FAIL — 라이브 조회 중 오류: ${err?.message || err}`)
    process.exitCode = 1
  }
}
