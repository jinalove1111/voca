// 2026-07-16 P7 감사 후속 — supabase_v1_9_security_rls.sql 적용 검증.
// 브라우저와 동일한 anon key로 라이브 Supabase에 직접 접근해서:
//   [기능] SQL 적용 전/후 어느 상태에서든 반드시 통과해야 하는 것들 —
//          로그인 화면 학생 목록 SELECT, 학생 등록 INSERT(RETURNING id),
//          반/유닛 변경 UPDATE, 학생 삭제 DELETE, 서버리스 API 경로
//          (service_role — student-pin-status/verify-student-pin) 정상.
//   [보안] SQL 적용 후에만 통과하는 것들 — anon의 PIN 4컬럼 SELECT/UPDATE
//          와 select=* 가 전부 42501(권한 거부)로 막히는지.
// exit code: 기능+보안 전부 PASS → 0. 기능은 PASS인데 보안이 FAIL이면
// "v1_9 미적용" 안내와 함께 1. 기능이 FAIL이면 즉시 심각(앱이 깨진 상태) — 1.
//
// 사용법:
//   node scripts/testRlsSecurity.mjs          # SQL 적용 후 최종 검증
//   node scripts/testRlsSecurity.mjs          # 적용 전에 돌리면 보안 항목이
//                                             # FAIL로 나오는 게 정상(미적용 상태 확인용)
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}

const LIVE_BASE = 'https://voca-drab.vercel.app'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

let funcFailures = 0
let secFailures = 0
function checkFunc(label, cond, extra) {
  if (cond) console.log(`  PASS  [기능] ${label}`)
  else { console.log(`  FAIL  [기능] ${label}${extra ? ' — ' + JSON.stringify(extra) : ''}`); funcFailures++ }
}
function checkSec(label, cond, extra) {
  if (cond) console.log(`  PASS  [보안] ${label}`)
  else { console.log(`  FAIL  [보안] ${label}${extra ? ' — ' + JSON.stringify(extra) : ''}`); secFailures++ }
}
// Postgres 권한 거부 = 42501. PostgREST가 컬럼 단위 거부를 400/42501로
// 돌려준다 — 메시지 문자열보다 코드로 판정.
const isDenied = (error) => !!error && (error.code === '42501' || /permission denied/i.test(error.message || ''))

console.log('\n=== 1. [기능] 로그인 화면 학생 목록 — refreshStudents와 동일한 쿼리 ===')
{
  const { data, error } = await supabase
    .from('students')
    .select('id,name,class_id,unit_name,classes(name)')
    .order('created_at')
    .limit(5)
  checkFunc('id,name,class_id,unit_name,classes(name) SELECT + created_at 정렬 성공', !error && Array.isArray(data), error)
}

console.log('\n=== 2. [기능] 학생 자기등록 — addStudent와 동일(INSERT RETURNING id) ===')
const { data: cls } = await supabase.from('classes').select('id').limit(1).single()
const QA_NAME = 'QA_RlsCheck_' + Date.now()
const { data: qa, error: insErr } = await supabase
  .from('students').insert({ name: QA_NAME, class_id: cls.id, unit_name: 'Unit 1' }).select('id').single()
checkFunc('INSERT + RETURNING id 성공', !insErr && !!qa?.id, insErr)
if (!qa?.id) {
  console.error('\nQA 학생 생성 실패 — 이후 검증 불가. 앱 등록 플로우가 깨진 상태일 수 있음!')
  process.exit(1)
}

console.log('\n=== 3. [기능] 관리자 반/유닛 변경 — setStudentClass/setStudentUnit과 동일 UPDATE ===')
{
  const { error: e1 } = await supabase.from('students').update({ class_id: cls.id }).eq('id', qa.id)
  const { error: e2 } = await supabase.from('students').update({ unit_name: 'Unit 2' }).eq('id', qa.id)
  const { error: e3 } = await supabase.from('students').update({ class_id: cls.id, unit_name: 'Unit 1' }).in('id', [qa.id])
  checkFunc('class_id UPDATE 성공', !e1, e1)
  checkFunc('unit_name UPDATE 성공', !e2, e2)
  checkFunc('일괄 이동(class_id+unit_name .in) UPDATE 성공', !e3, e3)
}

console.log('\n=== 4. [기능] 서버리스 API 경로(service_role)는 계속 동작해야 함 ===')
// 주의: 이 검증은 반드시 아래 5·6절(공격 시도)보다 먼저 — v1_9 미적용
// 상태에서는 6절의 pin_hash UPDATE "공격"이 실제로 성공해버려서(그게 바로
// 이 SQL이 막는 취약점) 이후의 hasPinHash 기대값이 달라진다.
{
  try {
    const res = await fetch(`${LIVE_BASE}/api/student-pin-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: [qa.id] }),
    })
    const body = await res.json()
    const s = body.results?.[0]
    checkFunc('student-pin-status가 새 학생의 부울 상태를 정상 반환(hasPinHash=false)', s?.hasPinHash === false, body)
  } catch (err) {
    checkFunc('student-pin-status 호출 성공', false, err.message)
  }
  try {
    const res = await fetch(`${LIVE_BASE}/api/verify-student-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'QA_NoSuchStudent_zzz_' + Date.now(), pin: '0007' }),
    })
    const body = await res.json()
    checkFunc('verify-student-pin(로그인 경로)이 정상 응답(not_found)', body.ok === false && body.reason === 'not_found', body)
  } catch (err) {
    checkFunc('verify-student-pin 호출 성공', false, err.message)
  }
}

console.log('\n=== 5. [보안] anon으로 PIN 4컬럼 SELECT → 전부 거부돼야 함 ===')
{
  const { error: e1 } = await supabase.from('students').select('pin_hash').eq('id', qa.id)
  checkSec('SELECT pin_hash 거부(42501)', isDenied(e1), e1 || '(허용됨 — v1_9 미적용?)')
  const { error: e2 } = await supabase.from('students').select('pin_fail_count,pin_locked_until,pin_setup_allowed').eq('id', qa.id)
  checkSec('SELECT pin_fail_count/pin_locked_until/pin_setup_allowed 거부', isDenied(e2), e2 || '(허용됨)')
  const { error: e3 } = await supabase.from('students').select('*').limit(1)
  checkSec('SELECT * (bare select) 거부 — 앱 코드에는 이런 호출 없음', isDenied(e3), e3 || '(허용됨)')
}

console.log('\n=== 6. [보안] anon으로 PIN 컬럼 UPDATE(계정 탈취/잠금 무력화 경로) → 거부돼야 함 ===')
// v1_9 미적용 상태에서는 아래 "공격"이 실제로 QA row에 성공한다(= 취약점
// 실증). QA row는 이 스크립트가 만든 일회용이라 실학생 영향 없음.
{
  const { error: e1 } = await supabase.from('students').update({ pin_hash: 'attacker:hash' }).eq('id', qa.id)
  checkSec('UPDATE pin_hash 거부(계정 탈취 차단)', isDenied(e1), e1 || '(허용됨 — v1_9 미적용?)')
  const { error: e2 } = await supabase.from('students').update({ pin_fail_count: 0, pin_locked_until: null }).eq('id', qa.id)
  checkSec('UPDATE pin_fail_count/pin_locked_until 거부(잠금 무력화 차단)', isDenied(e2), e2 || '(허용됨)')
  const { error: e3 } = await supabase.from('students').update({ pin_setup_allowed: true }).eq('id', qa.id)
  checkSec('UPDATE pin_setup_allowed 거부(자기설정 창구 탈취 차단)', isDenied(e3), e3 || '(허용됨)')
}

console.log('\n=== 7. [기능] 학생 삭제(removeStudent와 동일 DELETE) + 정리 ===')
{
  const { error } = await supabase.from('students').delete().eq('id', qa.id)
  checkFunc('DELETE 성공(QA 학생 정리 완료)', !error, error)
}

console.log('\n────────────────────────────────────────────')
if (funcFailures > 0) {
  console.log(`❌ 기능 검증 ${funcFailures}건 실패 — 앱이 깨졌을 수 있음. 즉시 롤백 검토:`)
  console.log('   grant select, update on table public.students to anon, authenticated;')
  console.log("   notify pgrst, 'reload schema';")
  process.exit(1)
}
if (secFailures > 0) {
  console.log(`⚠️  기능은 전부 정상, 보안 항목 ${secFailures}건 미충족 — supabase_v1_9_security_rls.sql이 아직 적용되지 않은 상태로 보임.`)
  console.log('   Supabase SQL Editor에서 supabase_v1_9_security_rls.sql 실행 후 이 스크립트를 다시 돌려주세요.')
  process.exit(1)
}
console.log('✅ 기능 + 보안 전부 통과 — v1_9 적용 완료 상태이며 앱 동작 불변 확인됨.')
process.exit(0)
