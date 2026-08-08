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

console.log('\n=== 2. [보안] 학생 자기등록 INSERT — 거부돼야 함(2026-08-06 P0 계약 갱신) ===')
// 계약 변경 이력(2026-08-09 갱신): 이 절은 원래 [기능] "INSERT 성공"을
// 단언했다 — v1.x의 학생 자기등록(anon insert)이 제품 계약이던 시절 기준.
// 2026-08-06 P0가 학생 생성을 서버 전용(api/admin-pin-actions create_student,
// 관리자 인가 + 멱등 UUID + 중복 점검)으로 잠그면서 anon INSERT "거부"가
// 현재의 올바른 계약이 됐다(중복 계정 대량 생성 사고 재발 방지). 그래서
// 이제 거부(42501)를 [보안] PASS로 단언한다. QA 픽스처를 만들 수 없게
// 됐으므로 이후 절들은 실존하지 않는 phantom UUID를 대상으로 권한만
// 검사한다 — Postgres는 권한 판정을 행 매칭보다 먼저 하므로, 42501 여부는
// 그대로 검증되고 실데이터는 어떤 행도 변경되지 않는다(0 rows).
const { data: cls } = await supabase.from('classes').select('id').limit(1).single()
const QA_NAME = 'QA_RlsCheck_' + Date.now()
const { data: qa, error: insErr } = await supabase
  .from('students').insert({ name: QA_NAME, class_id: cls.id, unit_name: 'Unit 1' }).select('id').single()
checkSec('anon 학생 INSERT 거부(서버 전용 create_student만 허용 — P0 계약)', isDenied(insErr), insErr || '(허용됨 — 락다운 풀림?)')
if (qa?.id) {
  // 만약 열려 있었다면(락다운 회귀) 방금 만든 행은 즉시 정리한다.
  await supabase.from('students').delete().eq('id', qa.id)
}
// phantom UUID — 실존 불가능한 대상(v4 형식, 어떤 행과도 매칭 안 됨).
const PHANTOM_ID = '00000000-0000-4000-8000-000000000000'

console.log('\n=== 3. [기능] 관리자 반/유닛 변경 권한 — phantom id 대상 UPDATE(0 rows, 실데이터 무접촉) ===')
{
  const { error: e1 } = await supabase.from('students').update({ class_id: cls.id }).eq('id', PHANTOM_ID)
  const { error: e2 } = await supabase.from('students').update({ unit_name: 'Unit 1' }).eq('id', PHANTOM_ID)
  const { error: e3 } = await supabase.from('students').update({ class_id: cls.id, unit_name: 'Unit 1' }).in('id', [PHANTOM_ID])
  checkFunc('class_id UPDATE 권한 허용(에러 없음, 0 rows)', !e1, e1)
  checkFunc('unit_name UPDATE 권한 허용', !e2, e2)
  checkFunc('일괄 이동(.in) UPDATE 권한 허용', !e3, e3)
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
      body: JSON.stringify({ studentIds: [PHANTOM_ID] }),
    })
    const body = await res.json()
    // phantom id라 결과 행은 없거나 미존재 표시 — API가 정상 구조(results
    // 배열)로 응답하는지(service_role 경로 생존)만 확인한다.
    checkFunc('student-pin-status가 정상 구조로 응답(results 배열, service_role 경로 생존)', res.ok && Array.isArray(body.results), body)
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

console.log('\n=== 5. [보안] anon으로 PIN 4컬럼 SELECT → 전부 거부돼야 함(phantom id) ===')
{
  const { error: e1 } = await supabase.from('students').select('pin_hash').eq('id', PHANTOM_ID)
  checkSec('SELECT pin_hash 거부(42501)', isDenied(e1), e1 || '(허용됨 — v1_9 미적용?)')
  const { error: e2 } = await supabase.from('students').select('pin_fail_count,pin_locked_until,pin_setup_allowed').eq('id', PHANTOM_ID)
  checkSec('SELECT pin_fail_count/pin_locked_until/pin_setup_allowed 거부', isDenied(e2), e2 || '(허용됨)')
  const { error: e3 } = await supabase.from('students').select('*').limit(1)
  checkSec('SELECT * (bare select) 거부 — 앱 코드에는 이런 호출 없음', isDenied(e3), e3 || '(허용됨)')
}

console.log('\n=== 6. [보안] anon으로 PIN 컬럼 UPDATE(계정 탈취/잠금 무력화 경로) → 거부돼야 함(phantom id) ===')
// 권한 거부는 행 매칭 전에 판정되므로 phantom id로도 42501 검증이 성립하고,
// 만에 하나 권한이 열려 있어도(회귀) phantom id는 어떤 행과도 매칭되지 않아
// 실학생 데이터가 변경될 수 없다(0 rows) — 구버전의 QA row 공격 실증보다
// 더 안전한 방식.
{
  const { error: e1 } = await supabase.from('students').update({ pin_hash: 'attacker:hash' }).eq('id', PHANTOM_ID)
  checkSec('UPDATE pin_hash 거부(계정 탈취 차단)', isDenied(e1), e1 || '(허용됨 — v1_9 미적용?)')
  const { error: e2 } = await supabase.from('students').update({ pin_fail_count: 0, pin_locked_until: null }).eq('id', PHANTOM_ID)
  checkSec('UPDATE pin_fail_count/pin_locked_until 거부(잠금 무력화 차단)', isDenied(e2), e2 || '(허용됨)')
  const { error: e3 } = await supabase.from('students').update({ pin_setup_allowed: true }).eq('id', PHANTOM_ID)
  checkSec('UPDATE pin_setup_allowed 거부(자기설정 창구 탈취 차단)', isDenied(e3), e3 || '(허용됨)')
}

console.log('\n=== 7. [기능] 학생 삭제 권한(removeStudent와 동일 DELETE — phantom id, 0 rows) ===')
{
  const { error } = await supabase.from('students').delete().eq('id', PHANTOM_ID)
  checkFunc('DELETE 권한 허용(에러 없음, 0 rows — 실데이터 무접촉)', !error, error)
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
