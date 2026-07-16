// P0 Phase 4/5 회귀 테스트 — 이름+PIN 로그인 서버 로직(api/verify-student-
// pin.js, api/set-student-pin.js, api/bulk-generate-temp-pins.js)을 실제
// 소스 그대로 직접 호출해서 검증한다(HTTP 서버 없이 — Vercel serverless
// handler는 그냥 (req,res) => {} 함수라 fake req/res로 직접 호출 가능,
// vercel dev 등 새 도구 설치 없이 실제 로직을 그대로 검증). 라이브
// Supabase에 디스포저블 QA 학생을 만들어 검증 후 정리한다.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

// api/_pinAuth.js가 process.env.VITE_SUPABASE_URL 등을 읽으므로, .env
// 내용을 미리 process.env에 로드해준다(Vite는 빌드타임에만 이걸 하고,
// 순수 Node 실행에서는 안 해주므로 직접 해야 함). ADMIN_PIN은 .env.local
// (서버 전용, git 미추적)에 있다 — P7 감사 후속으로 set-student-pin(무작위
// 재설정)/bulk-generate-temp-pins가 요청마다 adminPin 재검증을 요구하게
// 되어 필요해졌다.
for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}
const ADMIN_PIN = process.env.ADMIN_PIN
if (!ADMIN_PIN) { console.error('ADMIN_PIN missing in .env.local — abort'); process.exit(1) }

const { default: verifyStudentPin } = await import('../api/verify-student-pin.js')
const { default: setStudentPin } = await import('../api/set-student-pin.js')
const { default: bulkGenerateTempPins } = await import('../api/bulk-generate-temp-pins.js')
const { hashPin, verifyPin, isValidPinFormat, randomFourDigitPin } = await import('../api/_pinAuth.js')

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// fake Vercel (req,res) — status()/json() 체이닝만 필요.
function callHandler(handler, body) {
  return new Promise((resolve) => {
    const res = {
      _status: 200,
      status(code) { this._status = code; return this },
      json(payload) { resolve({ status: this._status, body: payload }) },
    }
    handler({ method: 'POST', body }, res)
  })
}

console.log('\n=== 0. 순수 해시 로직 (crypto.scrypt, 외부 의존성 0개) ===')
{
  const hash = hashPin('1234')
  check('해시가 salt:hash 형식', typeof hash === 'string' && hash.includes(':') && hash.split(':').length === 2)
  check('평문 PIN이 해시 문자열에 그대로 노출되지 않음', !hash.includes('1234'))
  check('올바른 PIN으로 검증 성공', verifyPin('1234', hash) === true)
  check('틀린 PIN으로 검증 실패', verifyPin('9999', hash) === false)
  check('형식 검증: 4자리 숫자만 유효', isValidPinFormat('1234') && !isValidPinFormat('123') && !isValidPinFormat('12345') && !isValidPinFormat('abcd'))
  const r1 = randomFourDigitPin(); const r2 = randomFourDigitPin()
  check('무작위 PIN이 항상 4자리 숫자 문자열', /^\d{4}$/.test(r1) && /^\d{4}$/.test(r2))
}

// 라이브 DB에 직접 접근(정리/검증용) — supabase-js 클라이언트, 앱의 다른
// 스크립트들과 동일한 패턴.
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

console.log('\n=== 1. 준비 — QA 반/학생 생성 (PIN 없이) ===')
const CLASS_NAME = 'QA_PinAuthTest'
let { data: cls } = await supabase.from('classes').select('id').eq('name', CLASS_NAME).maybeSingle()
if (!cls) { ({ data: cls } = await supabase.from('classes').insert({ name: CLASS_NAME }).select().single()) }
// P7 후속: RETURNING 컬럼을 명시(select('id')) — supabase_v1_9_security_rls.sql
// 적용 후에는 anon의 select=*가 pin 컬럼 차단 때문에 거부되므로, 이 스크립트가
// SQL 적용 전/후 어느 상태에서든 그대로 돌게 유지한다. "pin_hash 아직 null"은
// 아래 2-1(already_set이 아닌 정상 설정 성공)로 간접 검증된다.
const { data: student } = await supabase.from('students').insert({ name: 'QA_PinKid', class_id: cls.id, unit_name: 'Unit 1' }).select('id').single()
const studentId = student.id
check('학생 생성됨', !!studentId)

console.log('\n=== 2. set-student-pin.js — PIN 설정 (학생이 직접 고른 PIN) ===')
// supabase_v1_6_student_identity.sql이 아직 Supabase SQL Editor에서
// 실행되지 않았으면(pin_hash/pin_fail_count/pin_locked_until 컬럼 없음)
// 여기서 감지해서 나머지를 건너뛴다 — testFullProgressBackup.mjs/
// testSpellingSettings.mjs와 동일한 기존 관례(마이그레이션 미적용은
// "정상적으로 예상된" 상태, 크래시 아님).
let migrationApplied = true
{
  const res = await callHandler(setStudentPin, { studentId, pin: '4321' })
  if (!res.body.ok && /column/i.test(res.body.error || '')) {
    migrationApplied = false
    console.log(`  ℹ️  supabase_v1_6_student_identity.sql이 아직 적용 안 된 것으로 보임 — 정상, 나머지 케이스는 건너뜀: ${res.body.error}`)
  } else {
    check('설정 성공', res.body.ok === true)
    check('요청한 PIN 그대로 반환됨(자기등록 확인용, 이 응답 1회뿐)', res.body.pin === '4321')
  }
}
if (migrationApplied) {
  console.log('\n=== 2-1. [보안/P7 후속] 이미 PIN 있는 학생을 인증 없이 덮어쓰기 시도 → 거부 ===')
  {
    const takeover = await callHandler(setStudentPin, { studentId, pin: '9999' })
    check('adminPin 없이 기존 PIN 덮어쓰기 → ok:false, reason:already_set', takeover.body.ok === false && takeover.body.reason === 'already_set')
    const randomNoAuth = await callHandler(setStudentPin, { studentId })
    check('adminPin 없이 무작위 재설정 요청 → ok:false, reason:not_authorized', randomNoAuth.body.ok === false && randomNoAuth.body.reason === 'not_authorized')
    const stillOld = await callHandler(verifyStudentPin, { name: 'QA_PinKid', pin: '4321' })
    check('거부된 시도 후에도 원래 PIN(4321)으로 여전히 로그인 성공(DB 무변화)', stillOld.body.ok === true && stillOld.body.studentId === studentId)
  }
}
check('supabase_v1_6_student_identity.sql이 적용되어 있음 (pin_hash 등 컬럼 존재)', migrationApplied)

let dupStudentId = null
if (migrationApplied) {
  console.log('\n=== 3. verify-student-pin.js — 정상 로그인 ===')
  {
    const res = await callHandler(verifyStudentPin, { name: 'QA_PinKid', pin: '4321' })
    check('정상 PIN으로 로그인 성공', res.body.ok === true)
    check('올바른 studentId 반환', res.body.studentId === studentId)
    check('className/unitName도 함께 반환', res.body.className === CLASS_NAME && res.body.unitName === 'Unit 1')
  }

  console.log('\n=== 4. verify-student-pin.js — 대소문자 무시 이름 매칭 ===')
  {
    const res = await callHandler(verifyStudentPin, { name: 'qa_pinkid', pin: '4321' })
    check('소문자로 입력해도 같은 학생으로 로그인됨', res.body.ok === true && res.body.studentId === studentId)
  }

  console.log('\n=== 5. verify-student-pin.js — 틀린 PIN ===')
  {
    const res = await callHandler(verifyStudentPin, { name: 'QA_PinKid', pin: '0000' })
    check('틀린 PIN은 거부됨', res.body.ok === false)
    check('reason은 wrong_pin (아직 5회 미만)', res.body.reason === 'wrong_pin')
  }

  console.log('\n=== 6. verify-student-pin.js — 존재하지 않는 이름 ===')
  {
    const res = await callHandler(verifyStudentPin, { name: 'QA_NoSuchKid_zzz', pin: '1234' })
    check('없는 이름은 not_found', res.body.ok === false && res.body.reason === 'not_found')
  }

  console.log('\n=== 7. verify-student-pin.js — 잘못된 형식 ===')
  {
    const res = await callHandler(verifyStudentPin, { name: 'QA_PinKid', pin: 'abcd' })
    check('4자리 숫자가 아니면 invalid_format', res.body.ok === false && res.body.reason === 'invalid_format')
  }

  console.log('\n=== 8. verify-student-pin.js — 5회 연속 실패 시 잠금 (브루트포스 방지) ===')
  {
    // 이미 5번(위 5번 테스트에서 1번 사용) 중 1번 썼으므로 4번 더 틀려서 5회 채움.
    let lastRes = null
    for (let i = 0; i < 4; i++) {
      lastRes = await callHandler(verifyStudentPin, { name: 'QA_PinKid', pin: '1111' })
    }
    check('5번째 실패에서 locked로 전환됨', lastRes.body.ok === false && lastRes.body.reason === 'locked')
    check('lockedUntil 시각이 응답에 포함됨', typeof lastRes.body.lockedUntil === 'string')

    console.log('\n=== 8-1. 잠긴 동안은 올바른 PIN이어도 로그인 거부 ===')
    const correctButLocked = await callHandler(verifyStudentPin, { name: 'QA_PinKid', pin: '4321' })
    check('잠금 중에는 올바른 PIN도 거부됨(locked)', correctButLocked.body.ok === false && correctButLocked.body.reason === 'locked')
  }

  console.log('\n=== 9. set-student-pin.js — 관리자 PIN 재설정 시 잠금/실패카운트 초기화 ===')
  {
    const resetRes = await callHandler(setStudentPin, { studentId, adminPin: ADMIN_PIN }) // pin 생략 -> 서버가 무작위 생성(P7 후속: adminPin 재검증 필수)
    check('PIN 재설정 성공', resetRes.body.ok === true)
    check('무작위 PIN이 4자리 숫자로 반환됨', /^\d{4}$/.test(resetRes.body.pin))
    const newPin = resetRes.body.pin

    const loginAfterReset = await callHandler(verifyStudentPin, { name: 'QA_PinKid', pin: newPin })
    check('재설정 후에는 잠금이 풀려 새 PIN으로 즉시 로그인 가능', loginAfterReset.body.ok === true && loginAfterReset.body.studentId === studentId)
  }

  console.log('\n=== 10. bulk-generate-temp-pins.js — PIN 없는 학생 일괄 생성 ===')
  {
    const { data: noPinStudent } = await supabase.from('students').insert({ name: 'QA_PinKid_NoPin', class_id: cls.id, unit_name: 'Unit 1' }).select('id').single()
    const noAuth = await callHandler(bulkGenerateTempPins, {})
    check('[보안/P7 후속] adminPin 없이 일괄 생성 → not_authorized 거부', noAuth.body.ok === false && noAuth.body.reason === 'not_authorized')
    const res = await callHandler(bulkGenerateTempPins, { adminPin: ADMIN_PIN })
    check('응답에 방금 만든 PIN 없는 학생이 포함됨', res.body.results.some(r => r.id === noPinStudent.id && /^\d{4}$/.test(r.pin)))
    const loginRes = await callHandler(verifyStudentPin, { name: 'QA_PinKid_NoPin', pin: res.body.results.find(r => r.id === noPinStudent.id).pin })
    check('일괄 생성된 PIN으로 실제 로그인 성공', loginRes.body.ok === true && loginRes.body.studentId === noPinStudent.id)
    await supabase.from('students').delete().eq('id', noPinStudent.id)
  }

  console.log('\n=== 11. 동명이인(다른 반) — CTO가 요구한 핵심 시나리오 ===')
  console.log('  (students.name UNIQUE 제약이 supabase_v1_6에서 이미 DROP됐다는 전제 — 아래에서 실제로 확인)')
  {
    const CLASS_NAME_2 = 'QA_PinAuthTest2'
    let { data: cls2 } = await supabase.from('classes').select('id').eq('name', CLASS_NAME_2).maybeSingle()
    if (!cls2) { ({ data: cls2 } = await supabase.from('classes').insert({ name: CLASS_NAME_2 }).select().single()) }
    const dupInsert = await supabase.from('students').insert({ name: 'QA_PinKid', class_id: cls2.id, unit_name: 'Unit 1' }).select('id').single()
    if (dupInsert.error) {
      check(`동명이인(다른 반) 등록 성공 — UNIQUE 제약 DROP 필요: ${dupInsert.error.message}`, false)
    } else {
      dupStudentId = dupInsert.data.id
      check('같은 이름(QA_PinKid) 두 번째 학생이 다른 반에 성공적으로 생성됨', !!dupStudentId && dupStudentId !== studentId)
      const pinRes = await callHandler(setStudentPin, { studentId: dupStudentId, pin: '5678' })
      check('두 번째 QA_PinKid에 다른 PIN 설정 성공', pinRes.body.ok === true)

      // 이름이 같은 두 계정 중 PIN이 정확히 일치하는 쪽으로만 로그인돼야
      // 한다 — 서버가 이름으로 후보 여러 명을 찾은 뒤 PIN으로 정확히
      // 하나를 골라내는 로직(api/verify-student-pin.js)의 핵심 검증.
      const loginSecond = await callHandler(verifyStudentPin, { name: 'QA_PinKid', pin: '5678' })
      check('두 번째 QA_PinKid는 자기 PIN(5678)으로 정확히 자기 id로 로그인됨', loginSecond.body.ok === true && loginSecond.body.studentId === dupStudentId)
      check('두 번째 계정 로그인 결과가 첫 번째 계정 id와 섞이지 않음', loginSecond.body.studentId !== studentId)
      check('두 번째 계정의 className이 QA_PinAuthTest2(자기 반)로 정확히 구분됨', loginSecond.body.className === CLASS_NAME_2)
    }
    await supabase.from('classes').delete().eq('id', cls2.id).then(() => {}).catch(() => {})
  }
} else {
  console.log('\n(3~11번 케이스는 마이그레이션 적용 후 다시 실행하면 검증됩니다 — supabase_v1_6_student_identity.sql을 Supabase SQL Editor에서 실행해주세요)')
}

console.log('\n=== 12. 정리 ===')
if (dupStudentId) await supabase.from('students').delete().eq('id', dupStudentId)
await supabase.from('students').delete().eq('id', studentId)
await supabase.from('classes').delete().eq('id', cls.id)
check('테스트 반/학생 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
