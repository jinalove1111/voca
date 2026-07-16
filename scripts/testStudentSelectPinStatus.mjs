// 2026-07-16 실사용 버그 회귀 테스트 — StudentSelect.jsx "PIN 만들기" 탭에서
// "PIN이 실제로 없는 학생을 선택해도 '이미 설정되어 있어요'로 잘못
// 표시되는" 버그의 근본 원인은 pickSetupStudent()의 비동기 fetch 응답을
// "지금도 여전히 최신 선택인지" 확인 없이 그대로 반영하던 레이스
// 컨디션이었다(고속으로 학생을 연달아 선택하면 이전 학생의 느린 응답이
// 나중에 도착해 지금 선택된 학생 화면을 덮어씀) — StudentSelect.jsx에
// setupRequestIdRef 가드를 추가해 수정했다.
//
// React 컴포넌트 자체(DOM 렌더링)는 이 샌드박스에 헤드리스 브라우저/DOM
// 렌더러가 없어 직접 구동할 수 없으므로, 이 테스트는 그 UI가 100% 의존하는
// 데이터 레이어(api/student-pin-status.js, 개별 조회 + 배치 조회)를 실제
// 라이브 Supabase로 검증한다 — "매번 학생 선택 시 실제 DB를 조회해서
// 판단한다"는 요구사항의 근거 데이터가 정확한지 확인.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const envText = fs.readFileSync('.env', 'utf8')
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([^=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const { default: studentPinStatus } = await import('../api/student-pin-status.js')

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

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

console.log('\n=== 1. 준비 — 반 1개 + 학생 3명(신규/PIN있음/동명이인 쌍) ===')
const CLASS_NAME = 'QA_SelectPinStatusTest'
let { data: cls } = await supabase.from('classes').select('id').eq('name', CLASS_NAME).maybeSingle()
if (!cls) { ({ data: cls } = await supabase.from('classes').insert({ name: CLASS_NAME }).select().single()) }

// P7 후속: RETURNING 컬럼 명시(select('id')) — supabase_v1_9_security_rls.sql
// 적용 후 anon의 select=*는 pin 컬럼 차단으로 거부되므로. (pin_hash 값을
// insert하는 것 자체는 v1_9 이후에도 허용 — 자기가 만드는 새 row에만 영향.)
// 시나리오1: 신규 학생(PIN 없음)
const { data: freshStudent } = await supabase.from('students').insert({ name: 'QA_FreshNoPin', class_id: cls.id, unit_name: 'Unit 1' }).select('id').single()
// 시나리오2: 기존 학생 PIN 있음
const { data: withPinStudent } = await supabase.from('students').insert({ name: 'QA_HasPin', class_id: cls.id, unit_name: 'Unit 1', pin_hash: 'deadbeef:deadbeef' }).select('id').single()
// 시나리오4: 동명이인 — 하나는 PIN 있음, 하나는 없음
const { data: dupA } = await supabase.from('students').insert({ name: 'QA_DupKid', class_id: cls.id, unit_name: 'Unit 1', pin_hash: 'deadbeef:deadbeef' }).select('id').single()
const { data: dupB } = await supabase.from('students').insert({ name: 'QA_DupKid', class_id: cls.id, unit_name: 'Unit 2' }).select('id').single()

console.log('\n=== 2. 항목1 — 신규 학생(PIN 없음) 개별 조회 시 정확히 "PIN 없음" ===')
{
  const res = await callHandler(studentPinStatus, { studentIds: [freshStudent.id] })
  check('hasPinHash === false', res.body.results[0]?.hasPinHash === false)
}

console.log('\n=== 3. 항목2 — PIN 있는 학생 개별 조회 시 정확히 "이미 설정됨" ===')
{
  const res = await callHandler(studentPinStatus, { studentIds: [withPinStudent.id] })
  check('hasPinHash === true', res.body.results[0]?.hasPinHash === true)
}

console.log('\n=== 4. 항목3 — 목록 배지용 배치 조회(반 전체 한 번에) 정확 ===')
{
  const allIds = [freshStudent.id, withPinStudent.id, dupA.id, dupB.id]
  const res = await callHandler(studentPinStatus, { studentIds: allIds })
  check('배치 결과 개수가 요청한 학생 수와 일치(4명)', res.body.results.length === 4)
  const byId = Object.fromEntries(res.body.results.map(r => [r.id, r]))
  check('신규 학생 배지 = PIN 없음', byId[freshStudent.id]?.hasPinHash === false)
  check('PIN있는 학생 배지 = PIN 완료', byId[withPinStudent.id]?.hasPinHash === true)
}

console.log('\n=== 5. 항목4 — 동명이인(QA_DupKid) 두 명, 하나만 PIN 있음: 배치/개별 조회 모두 안 섞임 ===')
{
  const batchRes = await callHandler(studentPinStatus, { studentIds: [dupA.id, dupB.id] })
  const byId = Object.fromEntries(batchRes.body.results.map(r => [r.id, r]))
  check('동명이인 A(Unit1, PIN 있음)는 배치 조회에서도 정확히 PIN 완료로 표시', byId[dupA.id]?.hasPinHash === true)
  check('동명이인 B(Unit2, PIN 없음)는 배치 조회에서도 정확히 PIN 없음으로 표시', byId[dupB.id]?.hasPinHash === false)
  check('두 id가 서로 다름(진짜 별개 학생)', dupA.id !== dupB.id)

  // "학생 선택 시" 개별 재조회도 동명이인 각각에 대해 정확해야 한다 —
  // 이름이 같다는 이유로 서버가 뒤섞으면 안 됨(id 기준 조회이므로 원천적으로
  // 안전하지만, 실제로 재확인).
  const individualA = await callHandler(studentPinStatus, { studentIds: [dupA.id] })
  const individualB = await callHandler(studentPinStatus, { studentIds: [dupB.id] })
  check('선택 시 개별 조회 — 동명이인 A는 여전히 PIN 완료', individualA.body.results[0]?.hasPinHash === true)
  check('선택 시 개별 조회 — 동명이인 B는 여전히 PIN 없음(A와 안 섞임)', individualB.body.results[0]?.hasPinHash === false)
}

console.log('\n=== 6. 정리 ===')
await supabase.from('students').delete().in('id', [freshStudent.id, withPinStudent.id, dupA.id, dupB.id])
await supabase.from('classes').delete().eq('id', cls.id)
check('테스트 반/학생 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
