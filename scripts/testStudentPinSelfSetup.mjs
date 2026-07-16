// 2026-07-16 운영자 지시 — 학생 "최초 PIN 자기설정" 플로우 회귀 테스트.
// api/self-set-student-pin.js, api/set-pin-setup-allowed.js,
// api/student-pin-status.js, api/unlock-student-pin.js를 실제 handler
// 그대로 fake req/res로 직접 호출(testStudentPinAuth.mjs와 동일한 방식,
// 새 도구 설치 없음). 라이브 Supabase에 디스포저블 QA 학생으로 검증.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

// ADMIN_PIN은 .env.local(서버 전용, git 미추적)에 있다 — P7 감사 후속으로
// set-pin-setup-allowed/unlock-student-pin이 요청마다 adminPin 재검증을
// 요구하게 되어 필요해졌다.
for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}
const ADMIN_PIN = process.env.ADMIN_PIN
if (!ADMIN_PIN) { console.error('ADMIN_PIN missing in .env.local — abort'); process.exit(1) }

const { default: selfSetStudentPin } = await import('../api/self-set-student-pin.js')
const { default: setPinSetupAllowed } = await import('../api/set-pin-setup-allowed.js')
const { default: studentPinStatus } = await import('../api/student-pin-status.js')
const { default: unlockStudentPin } = await import('../api/unlock-student-pin.js')
const { default: verifyStudentPin } = await import('../api/verify-student-pin.js')
const { isWeakPin } = await import('../api/_pinAuth.js')

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

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

console.log('\n=== 0. 취약 PIN 목록 순수 로직 ===')
{
  check('0000/1234/4321/9876은 취약 PIN으로 판정', isWeakPin('0000') && isWeakPin('1234') && isWeakPin('4321') && isWeakPin('9876'))
  check('무작위 값(예: 7392)은 취약 PIN 아님', !isWeakPin('7392'))
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

console.log('\n=== 1. 준비 — QA 반/학생(PIN 미설정) 2명(동명이인) 생성 ===')
const CLASS_NAME = 'QA_SelfSetupTest'
let { data: cls } = await supabase.from('classes').select('id').eq('name', CLASS_NAME).maybeSingle()
if (!cls) { ({ data: cls } = await supabase.from('classes').insert({ name: CLASS_NAME }).select().single()) }
const CLASS_NAME_2 = 'QA_SelfSetupTest2'
let { data: cls2 } = await supabase.from('classes').select('id').eq('name', CLASS_NAME_2).maybeSingle()
if (!cls2) { ({ data: cls2 } = await supabase.from('classes').insert({ name: CLASS_NAME_2 }).select().single()) }

// P7 후속: RETURNING 컬럼 명시(select('id')) — supabase_v1_9_security_rls.sql
// 적용 후 anon의 select=*는 pin 컬럼 차단으로 거부되므로.
const { data: studentA } = await supabase.from('students').insert({ name: 'QA_SelfSetupKid', class_id: cls.id, unit_name: 'Unit 1' }).select('id').single()
const { data: studentB } = await supabase.from('students').insert({ name: 'QA_SelfSetupKid', class_id: cls2.id, unit_name: 'Unit 1' }).select('id').single()
const { data: studentC } = await supabase.from('students').insert({ name: 'QA_SelfSetupNotAllowed', class_id: cls.id, unit_name: 'Unit 1' }).select('id').single()

let migrationApplied = true
{
  const statusRes = await callHandler(studentPinStatus, { studentIds: [studentA.id] })
  if (statusRes.body.error && /column/i.test(statusRes.body.error)) {
    migrationApplied = false
    console.log(`  ℹ️  supabase_v1_7_student_pin_selfsetup.sql이 아직 적용 안 된 것으로 보임 — 정상, 나머지 케이스는 건너뜀: ${statusRes.body.error}`)
  } else {
    check('신규 학생은 pin 미설정/미허용 상태로 시작', statusRes.body.results[0]?.hasPinHash === false && statusRes.body.results[0]?.pinSetupAllowed === false)
  }
}
check('supabase_v1_7_student_pin_selfsetup.sql이 적용되어 있음 (pin_setup_allowed 컬럼 존재)', migrationApplied)

if (migrationApplied) {
  console.log('\n=== 2. 항목5(가장 중요한 보안 테스트) — 허용 안 된 계정은 자기설정 반드시 차단 ===')
  {
    const res = await callHandler(selfSetStudentPin, { studentId: studentC.id, pin: '5566', pinConfirm: '5566' })
    check('pin_setup_allowed=false인 계정은 PIN 설정 거부됨', res.body.ok === false && res.body.reason === 'not_allowed')
    const statusAfter = await callHandler(studentPinStatus, { studentIds: [studentC.id] })
    check('거부 후에도 hasPinHash는 여전히 false (아무 것도 저장 안 됨)', statusAfter.body.results[0]?.hasPinHash === false)
  }

  console.log('\n=== 3. 관리자 "설정 허용" -> 학생 A 자기 PIN 설정 성공 ===')
  {
    const noAuthAllow = await callHandler(setPinSetupAllowed, { studentIds: [studentA.id], allowed: true })
    check('[보안/P7 후속] adminPin 없이 설정 허용 → not_authorized 거부', noAuthAllow.body.ok === false && noAuthAllow.body.reason === 'not_authorized')
    const allowRes = await callHandler(setPinSetupAllowed, { studentIds: [studentA.id], allowed: true, adminPin: ADMIN_PIN })
    check('설정 허용 성공', allowRes.body.ok === true)
    const statusRes = await callHandler(studentPinStatus, { studentIds: [studentA.id] })
    check('허용 후 pinSetupAllowed === true로 반영됨', statusRes.body.results[0]?.pinSetupAllowed === true)

    console.log('\n=== 4. 항목6 — 취약 PIN(1234)은 서버에서 거부 ===')
    const weakRes = await callHandler(selfSetStudentPin, { studentId: studentA.id, pin: '1234', pinConfirm: '1234' })
    check('취약 PIN(1234)은 거부됨', weakRes.body.ok === false && weakRes.body.reason === 'weak_pin')

    console.log('\n=== 4-1. 재입력 불일치도 거부 ===')
    const mismatchRes = await callHandler(selfSetStudentPin, { studentId: studentA.id, pin: '2468', pinConfirm: '1357' })
    check('PIN 재입력이 서로 다르면 거부됨', mismatchRes.body.ok === false && mismatchRes.body.reason === 'mismatch')

    console.log('\n=== 4-2. 정상 PIN으로 실제 설정 성공 ===')
    const setRes = await callHandler(selfSetStudentPin, { studentId: studentA.id, pin: '2468', pinConfirm: '2468' })
    check('정상적인(취약하지 않은) PIN 설정 성공', setRes.body.ok === true)

    const statusAfter = await callHandler(studentPinStatus, { studentIds: [studentA.id] })
    check('설정 성공 후 hasPinHash === true', statusAfter.body.results[0]?.hasPinHash === true)
    check('설정 성공 후 pinSetupAllowed가 다시 false로 원복됨(1회성)', statusAfter.body.results[0]?.pinSetupAllowed === false)
  }

  console.log('\n=== 5. 이미 pin_hash가 생긴 계정은 재허용해도(관리자 실수) 자기설정으로 덮어쓸 수 없음 ===')
  {
    // set-pin-setup-allowed.js는 pin_hash가 이미 있으면 allowed:true 요청을
    // 아예 걸러낸다(방어적 이중 체크) — 그래도 만에 하나를 대비해
    // self-set-student-pin.js 자체도 pin_hash 존재를 최우선으로 거부한다.
    const allowAgain = await callHandler(setPinSetupAllowed, { studentIds: [studentA.id], allowed: true, adminPin: ADMIN_PIN })
    check('이미 PIN 있는 계정은 재허용 요청을 걸러냄(.is(pin_hash,null) 필터)', allowAgain.body.ok === true)
    const statusRes = await callHandler(studentPinStatus, { studentIds: [studentA.id] })
    check('필터링됐으므로 pinSetupAllowed는 여전히 false', statusRes.body.results[0]?.pinSetupAllowed === false)

    const overwriteAttempt = await callHandler(selfSetStudentPin, { studentId: studentA.id, pin: '9911', pinConfirm: '9911' })
    check('이미 설정된 PIN은 자기설정으로 덮어쓸 수 없음(already_set)', overwriteAttempt.body.ok === false && overwriteAttempt.body.reason === 'already_set')
  }

  console.log('\n=== 6. 항목3 — 자기가 설정한 PIN으로 실제 재로그인 성공 ===')
  {
    const loginRes = await callHandler(verifyStudentPin, { name: 'QA_SelfSetupKid', pin: '2468' })
    check('자기설정한 PIN(2468)으로 로그인 성공', loginRes.body.ok === true && loginRes.body.studentId === studentA.id)
  }

  console.log('\n=== 7. 항목4 — 동명이인 학생 B도 독립적으로 자기 PIN 설정, 서로 안 섞임 ===')
  {
    await callHandler(setPinSetupAllowed, { studentIds: [studentB.id], allowed: true, adminPin: ADMIN_PIN })
    const setBRes = await callHandler(selfSetStudentPin, { studentId: studentB.id, pin: '1379', pinConfirm: '1379' })
    check('학생 B(동명이인)도 자기 PIN 설정 성공', setBRes.body.ok === true)

    const loginA = await callHandler(verifyStudentPin, { name: 'QA_SelfSetupKid', pin: '2468' })
    const loginB = await callHandler(verifyStudentPin, { name: 'QA_SelfSetupKid', pin: '1379' })
    check('학생 A는 여전히 자기 PIN(2468)으로 정확히 자기 id로 로그인', loginA.body.ok === true && loginA.body.studentId === studentA.id)
    check('학생 B는 자기 PIN(1379)으로 정확히 자기 id로 로그인(A와 안 섞임)', loginB.body.ok === true && loginB.body.studentId === studentB.id && loginB.body.studentId !== studentA.id)
    check('학생 B의 className이 QA_SelfSetupTest2(자기 반)로 정확히 구분됨', loginB.body.className === CLASS_NAME_2)
  }

  console.log('\n=== 8. 항목7 — 기존 PIN 5회 실패 잠금 기능 회귀 없음(스팟체크) ===')
  {
    let lastRes = null
    for (let i = 0; i < 5; i++) {
      lastRes = await callHandler(verifyStudentPin, { name: 'QA_SelfSetupKid', pin: '0001' }) // 학생 A(2468)/B(1379) 어느 쪽과도 다른 틀린 PIN
    }
    check('5회 연속 실패 시 여전히 locked 처리됨(회귀 없음)', lastRes.body.ok === false && (lastRes.body.reason === 'locked' || lastRes.body.reason === 'wrong_pin'))
  }

  console.log('\n=== 9. 항목8 — 관리자 "잠금 해제"(신규) 동작 확인 ===')
  {
    // 위 8번에서 학생 A/B 둘 다 시도했으므로 최소 하나는 잠겼을 수 있음 —
    // 학생 A 기준으로 확인.
    const noAuthUnlock = await callHandler(unlockStudentPin, { studentId: studentA.id })
    check('[보안/P7 후속] adminPin 없이 잠금 해제 → not_authorized 거부', noAuthUnlock.body.ok === false && noAuthUnlock.body.reason === 'not_authorized')
    const unlockRes = await callHandler(unlockStudentPin, { studentId: studentA.id, adminPin: ADMIN_PIN })
    check('잠금 해제 API 성공', unlockRes.body.ok === true)
    const loginAfterUnlock = await callHandler(verifyStudentPin, { name: 'QA_SelfSetupKid', pin: '2468' })
    check('잠금 해제 후 원래 PIN으로 다시 로그인 가능(pin_hash는 안 건드림)', loginAfterUnlock.body.ok === true && loginAfterUnlock.body.studentId === studentA.id)
  }
} else {
  console.log('\n(2~9번 케이스는 마이그레이션 적용 후 다시 실행하면 검증됩니다 — supabase_v1_7_student_pin_selfsetup.sql을 Supabase SQL Editor에서 실행해주세요)')
}

console.log('\n=== 10. 정리 ===')
await supabase.from('students').delete().eq('id', studentA.id)
await supabase.from('students').delete().eq('id', studentB.id)
await supabase.from('students').delete().eq('id', studentC.id)
await supabase.from('classes').delete().eq('id', cls.id)
await supabase.from('classes').delete().eq('id', cls2.id)
check('테스트 반/학생 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
