// Paul Rank System — xp_ledger 라이브 통합 테스트. api/grant-xp.js를 실제
// (req,res) 핸들러로 직접 호출한다(testStudentPinAuth.mjs와 동일 패턴 —
// vercel dev 등 새 도구 없이 실제 서버 로직 그대로 검증). QA 전용 반/학생을
// 만들어 검증 후 전부 정리한다.
//
// ⚠️ 두 단계 SKIP 조건(둘 다 "정상적으로 예상된 상태", 크래시 아님):
//   1) xp_ledger 테이블이 아직 없음 — supabase_v2_3_paul_rank.sql 미실행.
//   2) 테이블은 있지만 SUPABASE_SERVICE_ROLE_KEY가 로컬에 없음 — 이 저장소의
//      알려진 상태(api/_pinAuth.js 주석: "이 프로젝트는 로컬에 서비스 롤
//      키가 없음 — Vercel 프로덕션에만 있을 수 있음"). xp_ledger는 anon에
//      INSERT 권한 자체가 없으므로(supabase_v2_3_paul_rank.sql 참고),
//      service_role 키 없이는 실제 지급 경로를 로컬에서 끝까지 검증할 수
//      없다 — 이 경우도 정직하게 SKIP(가짜 PASS 금지, registry.mjs
//      DOMAINS 관례와 동일).
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   node scripts/testXpLedgerDb.mjs
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}

const BUNDLE = process.env.WORDLIB_BUNDLE || 'scripts/.tmp/wordLibrary.bundle.mjs'
const wordlib = await import(pathToFileURL(BUNDLE).href)
const { default: grantXpHandler } = await import('../api/grant-xp.js')

let failures = 0
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

function callHandler(handler, body) {
  return new Promise((resolve) => {
    const res = { _status: 200, status(c) { this._status = c; return this }, json(p) { resolve({ status: this._status, body: p }) } }
    handler({ method: 'POST', body }, res)
  })
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

// ── 0. 테이블 존재 확인 ──────────────────────────────────────────────────
// entranceTestApi.js의 checkEntranceTestAvailable()과 동일한 방식으로
// "특정 에러 코드 매칭"이 아니라 "에러가 있으면 미존재로 취급"한다 — 실측
// 확인 결과 Supabase가 테이블 미존재를 raw Postgres 코드(42P01)가 아니라
// PostgREST 스키마 캐시 코드(PGRST205)로 반환한다(환경에 따라 다를 수
// 있어 특정 코드에 의존하면 실패한다 — 이 스크립트를 만들며 직접 확인).
const probe = await supabase.from('xp_ledger').select('id').limit(1)
if (probe.error) {
  console.log(`\nSKIP — xp_ledger 조회 실패, 테이블이 아직 없는 것으로 판단 (supabase_v2_3_paul_rank.sql 미실행, 예상된 상태). 원본 에러: ${probe.error.message}`)
  await new Promise((r) => setTimeout(r, 300))
  process.exit(0)
}
console.log('\nxp_ledger 테이블 확인됨.')

// ── 0-b. service_role 키 존재 확인(없으면 anon 폴백 — INSERT가 RLS로 막힘) ─
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('\nSKIP — SUPABASE_SERVICE_ROLE_KEY가 로컬에 없음(.env.local). xp_ledger는 anon에 INSERT')
  console.log('       권한이 없어(설계상 의도, supabase_v2_3_paul_rank.sql 참고) 이 키 없이는 실제 지급')
  console.log('       경로를 끝까지 검증할 수 없다 — Vercel 프로덕션(서비스롤 키 설정됨)에서는 정상 동작.')
  await new Promise((r) => setTimeout(r, 300))
  process.exit(0)
}
console.log('SUPABASE_SERVICE_ROLE_KEY 확인됨 — 전체 통합 테스트 진행')

await wordlib.initWordLibrary()

const QA_CLASS = 'QA_PaulRank'
async function cleanup() {
  try {
    const students = wordlib.getStudents().filter((s) => s.className === QA_CLASS)
    for (const s of students) {
      await supabase.from('xp_ledger').delete().eq('student_id', s.id)
      await wordlib.removeStudent(s.id)
    }
    if (wordlib.getClassNames().includes(QA_CLASS)) await wordlib.deleteClass(QA_CLASS)
  } catch (err) {
    console.log('  (cleanup 중 무시된 오류:', err.message, ')')
  }
}
await cleanup()

let exitCode = 1
try {
  console.log('\n1. QA 반/학생 준비')
  await wordlib.createClass(QA_CLASS)
  await wordlib.addClassUnit(QA_CLASS, 'Unit 1')
  await wordlib.addClassUnit(QA_CLASS, 'Unit 2')
  const studentId = await wordlib.addStudent('QA_RankKid', QA_CLASS, 'Unit 1')
  check('학생 생성됨', !!studentId)

  console.log('\n2. 정상 지급 — 서버가 XP_EVENT_TABLE에서 금액을 결정(클라이언트 입력 무시)')
  {
    // amount:9999를 같이 보내도 서버는 절대 읽지 않는다 — "클라이언트가
    // 보낸 XP 총합을 신뢰하지 마라" 요구사항의 직접 증명.
    const r1 = await callHandler(grantXpHandler, { studentId, eventType: 'mission-clear', sourceEventId: 'e2e:mission-clear:word1', amount: 9999 })
    check('첫 지급 성공', r1.body.ok === true && r1.body.duplicate === false)
    check('서버가 결정한 금액(3) — 클라이언트가 보낸 9999는 완전히 무시됨', r1.body.amount === 3)
  }

  console.log('\n3. 중복 지급 방지 — 같은 sourceEventId로 정확히 같은 요청을 두 번 전송')
  {
    const { data: rowsBefore } = await supabase.from('xp_ledger').select('amount').eq('student_id', studentId)
    const sumBefore = (rowsBefore || []).reduce((s, r) => s + r.amount, 0)

    const dup = await callHandler(grantXpHandler, { studentId, eventType: 'mission-clear', sourceEventId: 'e2e:mission-clear:word1' })
    check('두 번째(중복) 요청도 ok:true, duplicate:true로 응답(학생 경험엔 무해)', dup.body.ok === true && dup.body.duplicate === true)

    const { data: rowsAfter } = await supabase.from('xp_ledger').select('amount').eq('student_id', studentId)
    const sumAfter = (rowsAfter || []).reduce((s, r) => s + r.amount, 0)
    check('원장에 새 행이 추가되지 않음(정확히 1행 유지)', rowsAfter.length === 1)
    check('합계가 두 배로 지급되지 않음(sumBefore === sumAfter)', sumBefore === sumAfter && sumAfter === 3)

    const { data: totalRow } = await supabase.from('xp_totals').select('total_xp').eq('student_id', studentId).maybeSingle()
    check('xp_totals VIEW(파생값)도 3으로 정확히 일치', totalRow?.total_xp === 3)
  }

  console.log('\n4. 서로 다른 sourceEventId는 정상적으로 별도 지급(중복 방지가 과잉 차단하지 않음)')
  {
    const r = await callHandler(grantXpHandler, { studentId, eventType: 'spelling-combo-3', sourceEventId: 'e2e:spelling-combo-3:day1:wordA' })
    check('다른 이벤트는 정상 지급', r.body.ok === true && r.body.duplicate === false && r.body.amount === 1)
    const { data: totalRow } = await supabase.from('xp_totals').select('total_xp').eq('student_id', studentId).maybeSingle()
    check('누적 XP = 3 + 1 = 4', totalRow?.total_xp === 4)
  }

  console.log('\n5. 입력 검증 — 알 수 없는 eventType/잘못된 studentId 거부')
  {
    const bad1 = await callHandler(grantXpHandler, { studentId, eventType: 'made-up-event', sourceEventId: 'e2e:bad1' })
    check('알 수 없는 eventType -> ok:false, unknown_event_type', bad1.body.ok === false && bad1.body.reason === 'unknown_event_type')
    const bad2 = await callHandler(grantXpHandler, { studentId: 'not-a-uuid', eventType: 'mission-clear', sourceEventId: 'e2e:bad2' })
    check('잘못된 studentId -> ok:false, invalid_student_id', bad2.body.ok === false && bad2.body.reason === 'invalid_student_id')
    const { data: totalRow } = await supabase.from('xp_totals').select('total_xp').eq('student_id', studentId).maybeSingle()
    check('거부된 요청은 원장에 아무 영향 없음(여전히 4)', totalRow?.total_xp === 4)
  }

  console.log('\n6. Unit 전환이 XP/Rank에 전혀 영향 없음 (라이브 실측 — GAME_DESIGN.md 원칙과 동일)')
  {
    const { data: before } = await supabase.from('xp_totals').select('total_xp').eq('student_id', studentId).maybeSingle()
    await wordlib.setStudentUnit(studentId, 'Unit 2')
    await wordlib.refreshStudents()
    const unitNow = wordlib.getStudentUnit(studentId)
    check('Unit이 실제로 전환됨(전제 조건 확인)', unitNow === 'Unit 2')
    const { data: after } = await supabase.from('xp_totals').select('total_xp').eq('student_id', studentId).maybeSingle()
    check('Unit 전환 후에도 XP 총합 불변(4 그대로)', before?.total_xp === after?.total_xp && after?.total_xp === 4)
  }

  console.log('\n7. 학생 삭제 시 xp_ledger도 cascade 정리됨(FK on delete cascade)')
  {
    await wordlib.removeStudent(studentId)
    const { data: rowsAfterDelete } = await supabase.from('xp_ledger').select('id').eq('student_id', studentId)
    check('학생 삭제 -> xp_ledger 행도 함께 사라짐(고아 레코드 없음)', (rowsAfterDelete || []).length === 0)
  }

  exitCode = failures === 0 ? 0 : 1
} catch (err) {
  console.error('\n예외 발생:', err)
  exitCode = 1
} finally {
  await cleanup()
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
await new Promise((r) => setTimeout(r, 300))
process.exit(exitCode)
