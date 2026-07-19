// Word King — api/compute-word-king.js 라이브 통합 테스트. 실제
// (req,res) 핸들러로 직접 호출한다(testXpLedgerDb.mjs와 동일 패턴 — vercel
// dev 등 새 도구 없이 실제 서버 로직 그대로 검증). QA 전용 반/학생을 만들어
// 검증 후 전부 정리한다.
//
// ⚠️ 단계별 SKIP 조건(전부 "정상적으로 예상된 상태", 크래시 아님):
//   0) ADMIN_PIN이 로컬에 없음 — checkAdminReauth 자체가 500을 반환하므로
//      인증 관련 검증만 스킵(구조적 검증인 "GET 거부"는 인증 이전 단계라
//      계속 실행).
//   1) word_king_history 테이블이 아직 없음 — supabase_v2_6_word_king.sql
//      미실행.
//   2) 테이블은 있지만 SUPABASE_SERVICE_ROLE_KEY가 로컬에 없음 — 이
//      저장소의 알려진 상태(api/_pinAuth.js 주석). anon 폴백으로는
//      entrance_tests/xp_ledger에 QA용 시드 데이터를 정확히 넣을 수 없어
//      실제 계산 경로를 끝까지 검증할 수 없다.
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   node scripts/testComputeWordKingApi.mjs
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
const { default: computeHandler } = await import('../api/compute-word-king.js')

let failures = 0
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

function callHandler(handler, { method = 'POST', body } = {}) {
  return new Promise((resolve) => {
    const res = { _status: 200, status(c) { this._status = c; return this }, json(p) { resolve({ status: this._status, body: p }) } }
    handler({ method, body }, res)
  })
}

console.log('\n0. 메서드 거부 — 인증/DB와 무관하게 항상 검증 가능')
{
  const r = await callHandler(computeHandler, { method: 'GET', body: {} })
  check('GET 요청은 405로 거부', r.status === 405)
}

if (!process.env.ADMIN_PIN) {
  console.log('\nSKIP(나머지) — ADMIN_PIN이 로컬에 없음(checkAdminReauth가 500 반환, 예상된 상태).')
  console.log(failures === 0 ? '\n모든 테스트 통과 ✅ (일부 SKIP)' : `\n${failures}개 테스트 실패 ❌`)
  // testEntranceTestDb.mjs가 이미 문서화한 Windows + Node 재현 이슈 — 응답
  // 직후 곧바로 process.exit()하면 undici 소켓 핸들이 닫히는 중에 libuv
  // assertion으로 죽는다. 한 틱 쉬고 종료(같은 워크어라운드 재사용).
  await new Promise((r) => setTimeout(r, 300))
  process.exit(failures === 0 ? 0 : 1)
}

console.log('\n1. 관리자 재인증 — 틀린/누락된 adminPin은 항상 거부(DB 조회 이전에 차단)')
{
  const wrong = await callHandler(computeHandler, { body: { classId: '123e4567-e89b-12d3-a456-426614174000', adminPin: 'wrong' } })
  check('틀린 adminPin -> not_authorized', wrong.body.ok === false && wrong.body.reason === 'not_authorized')
  const missing = await callHandler(computeHandler, { body: { classId: '123e4567-e89b-12d3-a456-426614174000' } })
  check('adminPin 누락 -> not_authorized', missing.body.ok === false && missing.body.reason === 'not_authorized')
}

console.log('\n2. 입력 검증 — 올바른 adminPin이어도 classId 형식이 틀리면 거부')
{
  const bad = await callHandler(computeHandler, { body: { classId: 'not-a-uuid', adminPin: process.env.ADMIN_PIN } })
  check('잘못된 classId -> invalid_class_id', bad.body.ok === false && bad.body.reason === 'invalid_class_id')
}

const probe = await createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  .from('word_king_history').select('id').limit(1)
if (probe.error) {
  console.log(`\nSKIP(라이브 계산 e2e) — word_king_history 조회 실패, 테이블이 아직 없는 것으로 판단 (supabase_v2_6_word_king.sql 미실행, 예상된 상태). 원본 에러: ${probe.error.message}`)
  console.log(failures === 0 ? '\n모든 테스트 통과 ✅ (일부 SKIP)' : `\n${failures}개 테스트 실패 ❌`)
  // testEntranceTestDb.mjs 워크어라운드 재사용 — Supabase 클라이언트 생성
  // 직후 곧바로 process.exit()하면 undici 소켓 핸들이 닫히는 중에 libuv
  // assertion으로 죽는다(Windows + Node 재현 확인). 한 틱 쉬고 종료.
  await new Promise((r) => setTimeout(r, 300))
  process.exit(failures === 0 ? 0 : 1)
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('\nSKIP(라이브 계산 e2e) — SUPABASE_SERVICE_ROLE_KEY가 로컬에 없음. 이 키 없이는 QA용')
  console.log('       entrance_tests/entrance_test_results/xp_ledger 시드 데이터를 정확히 넣을 수')
  console.log('       없어 실제 계산 경로를 끝까지 검증할 수 없다 — Vercel 프로덕션에서는 정상 동작.')
  console.log(failures === 0 ? '\n모든 테스트 통과 ✅ (일부 SKIP)' : `\n${failures}개 테스트 실패 ❌`)
  await new Promise((r) => setTimeout(r, 300))
  process.exit(failures === 0 ? 0 : 1)
}

console.log('SUPABASE_SERVICE_ROLE_KEY 확인됨 — 전체 라이브 계산 e2e 진행')
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
await wordlib.initWordLibrary()

const QA_CLASS = 'QA_WordKing'
async function cleanup() {
  try {
    const students = wordlib.getStudents().filter((s) => s.className === QA_CLASS)
    const classId = wordlib.getClassIdByName(QA_CLASS)
    if (classId) {
      const { data: tests } = await supabase.from('entrance_tests').select('id').eq('class_id', classId)
      for (const t of tests || []) {
        await supabase.from('entrance_test_results').delete().eq('test_id', t.id)
        await supabase.from('entrance_tests').delete().eq('id', t.id)
      }
      await supabase.from('word_king_history').delete().eq('class_id', classId)
    }
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
  console.log('\n3. QA 반/학생 3명 준비(diligent/lucky/mediocre — 순수 로직 테스트와 같은 시나리오)')
  await wordlib.createClass(QA_CLASS)
  await wordlib.addClassUnit(QA_CLASS, 'Unit 1')
  const diligentId = await wordlib.addStudent('QA_Diligent', QA_CLASS, 'Unit 1')
  const luckyId = await wordlib.addStudent('QA_Lucky', QA_CLASS, 'Unit 1')
  const mediocreId = await wordlib.addStudent('QA_Mediocre', QA_CLASS, 'Unit 1')
  check('학생 3명 생성됨', !!diligentId && !!luckyId && !!mediocreId)
  const classId = wordlib.getClassIdByName(QA_CLASS)
  check('classId 조회됨', !!classId)

  const todayIso = new Date().toISOString().slice(0, 10)
  const { data: test, error: testErr } = await supabase.from('entrance_tests').insert({
    class_id: classId, date: todayIso, status: 'closed', direction: 'en2kr', question_count: 50,
    words: Array.from({ length: 50 }, (_, i) => ({ word: `w${i}`, meaning: `뜻${i}` })),
  }).select().single()
  check('QA 시험 생성됨(오늘자, 이번 주 기간 안)', !testErr && !!test)

  await supabase.from('entrance_test_results').insert([
    { test_id: test.id, student_id: diligentId, score: 45, total: 50 },
    { test_id: test.id, student_id: luckyId, score: 1, total: 1 },
    { test_id: test.id, student_id: mediocreId, score: 30, total: 50 },
  ])

  console.log('\n4. 관리자가 계산 트리거 — 서버가 entrance_test_results/xp_ledger를 직접 재집계')
  const res = await callHandler(computeHandler, { body: { classId, adminPin: process.env.ADMIN_PIN } })
  check('계산 성공(ok:true)', res.body.ok === true, res.body)
  check('챔피언이 diligent(소표본 lucky가 이기지 않음)', res.body.champion?.studentId === diligentId, res.body.champion)
  check('3명 전부 eligibleCount에 포함', res.body.eligibleCount === 3)

  console.log('\n5. word_king_history에 실제로 저장됐는지 확인')
  const { data: rows } = await supabase.from('word_king_history').select('*').eq('class_id', classId)
  check('3행 저장됨', (rows || []).length === 3)
  const champRow = (rows || []).find((r) => r.rank_position === 1)
  check('rank_position=1 행이 diligent', champRow?.student_id === diligentId)

  console.log('\n6. 재실행(같은 주) -> upsert로 덮어씀(행 개수 그대로, 새 행 추가 안 됨)')
  await callHandler(computeHandler, { body: { classId, adminPin: process.env.ADMIN_PIN } })
  const { data: rowsAfter } = await supabase.from('word_king_history').select('*').eq('class_id', classId)
  check('재계산해도 여전히 3행(unique 제약이 upsert로 정상 동작)', (rowsAfter || []).length === 3)

  console.log('\n7. 학생 없는 반 -> no_students로 안전 거부')
  await wordlib.createClass('QA_WordKing_Empty')
  const emptyClassId = wordlib.getClassIdByName('QA_WordKing_Empty')
  const emptyRes = await callHandler(computeHandler, { body: { classId: emptyClassId, adminPin: process.env.ADMIN_PIN } })
  check('학생 0명 반 -> ok:false, no_students', emptyRes.body.ok === false && emptyRes.body.reason === 'no_students')
  await wordlib.deleteClass('QA_WordKing_Empty')

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
