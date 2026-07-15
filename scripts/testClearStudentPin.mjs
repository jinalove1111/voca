// 2026-07-16 — 관리자 "🗑 PIN 초기화(삭제)" (api/clear-student-pin.js +
// AdminScreen.jsx handleClearPin) end-to-end 검증. 함수 단위가 아니라
// 관리자/학생이 실제로 밟는 전체 루프를 실제 라이브 Supabase DB로 재현한다:
//
//   등록(PIN 자동 생성) → 그 PIN으로 로그인 성공 → [보안] 관리자 인증
//   없이/틀린 인증으로 삭제 시도 → 거부 + DB 무변화 확인 → 올바른 인증으로
//   삭제 → DB 4개 컬럼 전부 초기 상태 확인 → 기존 PIN 로그인 차단 확인 →
//   "PIN 만들기" 탭이 보는 그대로(student-pin-status 개별 조회) "PIN 없음 +
//   설정 허용" 확인 → 새 PIN 자기설정 성공 → 새 PIN 재로그인 성공 →
//   [회귀] 기존 "PIN 재설정"(set-student-pin) 스팟체크.
//
// 두 모드:
//   node scripts/testClearStudentPin.mjs          — 서버리스 핸들러를 직접
//     import해서 호출(배포 전 검증용 — DB는 실제 라이브 Supabase).
//   node scripts/testClearStudentPin.mjs --live   — 배포된 프로덕션 URL
//     (https://voca-drab.vercel.app)에 fetch로 호출(배포 후 최종 검증용 —
//     브라우저가 하는 것과 동일한 경로).
//
// ADMIN_PIN은 .env.local(서버 전용, git 미추적)에서 읽는다 — 출력에 절대
// 평문으로 찍지 않는다.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

// 셸에서 직접 넘긴 env가 파일 값보다 우선한다 — Vercel 프로덕션의
// ADMIN_PIN은 Sensitive로 저장돼 있어 env pull로도 못 받아오므로(빈 값),
// --live 전체 루프는 운영자가 실제 관리자 PIN을 직접 넘겨 실행한다:
//   ADMIN_PIN=<실제 관리자 PIN> node scripts/testClearStudentPin.mjs --live
for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}

const LIVE = process.argv.includes('--live')
const LIVE_BASE = 'https://voca-drab.vercel.app'

const ADMIN_PIN = process.env.ADMIN_PIN
if (!ADMIN_PIN) { console.error('ADMIN_PIN missing in .env.local — abort'); process.exit(1) }

let failures = 0
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${extra ? ' — ' + JSON.stringify(extra) : ''}`); failures++ }
}

// ── 호출 어댑터: 핸들러 직접 호출(기본) vs 배포된 프로덕션 fetch(--live) ──
const handlers = {}
if (!LIVE) {
  handlers['clear-student-pin'] = (await import('../api/clear-student-pin.js')).default
  handlers['verify-student-pin'] = (await import('../api/verify-student-pin.js')).default
  handlers['self-set-student-pin'] = (await import('../api/self-set-student-pin.js')).default
  handlers['student-pin-status'] = (await import('../api/student-pin-status.js')).default
  handlers['set-student-pin'] = (await import('../api/set-student-pin.js')).default
}
async function call(route, body) {
  if (LIVE) {
    const res = await fetch(`${LIVE_BASE}/api/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() }
  }
  return new Promise((resolve) => {
    const res = {
      _status: 200,
      status(code) { this._status = code; return this },
      json(payload) { resolve({ status: this._status, body: payload }) },
    }
    handlers[route]({ method: 'POST', body }, res)
  })
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const fetchRow = async (id) => (await supabase
  .from('students')
  .select('id,pin_hash,pin_setup_allowed,pin_fail_count,pin_locked_until')
  .eq('id', id).single()).data

console.log(`\n=== 모드: ${LIVE ? 'LIVE(배포된 프로덕션 URL)' : '핸들러 직접 호출(라이브 DB)'} ===`)

console.log('\n=== 0. 준비 — QA 학생 등록(앱 "처음이에요" 탭과 동일: insert 후 set-student-pin으로 PIN 생성) ===')
const QA_NAME = 'QA_ClearPin_' + Date.now() // 실존 학생과 절대 안 겹치는 유니크 이름
const { data: cls } = await supabase.from('classes').select('id,name').limit(1).single()
const { data: qa, error: insErr } = await supabase
  .from('students').insert({ name: QA_NAME, class_id: cls.id, unit_name: 'Unit 1' }).select().single()
if (insErr) { console.error('QA insert failed', insErr); process.exit(1) }
const FIRST_PIN = '4826'
{
  const res = await call('set-student-pin', { studentId: qa.id, pin: FIRST_PIN })
  check('QA 학생 등록 + 최초 PIN 생성(ok:true)', res.body.ok === true, res.body)
}

console.log('\n=== 1. 삭제 전 — 그 PIN으로 로그인 성공(전제 확인) ===')
{
  const res = await call('verify-student-pin', { name: QA_NAME, pin: FIRST_PIN })
  check('기존 PIN 로그인 ok:true + studentId 일치', res.body.ok === true && res.body.studentId === qa.id, res.body)
}

console.log('\n=== 2. [보안] 관리자 인증 없이 / 틀린 인증으로 삭제 시도 → 거부 + DB 무변화 ===')
{
  const noAuth = await call('clear-student-pin', { studentId: qa.id })
  check('adminPin 미포함 호출 → ok:false, reason:not_authorized', noAuth.body.ok === false && noAuth.body.reason === 'not_authorized', noAuth.body)
  const wrongAuth = await call('clear-student-pin', { studentId: qa.id, adminPin: '0000' })
  check('adminPin 틀린 값 호출 → ok:false, reason:not_authorized', wrongAuth.body.ok === false && wrongAuth.body.reason === 'not_authorized', wrongAuth.body)
  const row = await fetchRow(qa.id)
  check('거부된 두 호출 후에도 pin_hash 그대로 존재(DB 무변화)', !!row.pin_hash)
  const stillLogin = await call('verify-student-pin', { name: QA_NAME, pin: FIRST_PIN })
  check('거부된 호출 후에도 기존 PIN 로그인 여전히 성공', stillLogin.body.ok === true, stillLogin.body)
}

console.log('\n=== 3. 올바른 관리자 인증으로 삭제 → DB 4개 컬럼 전부 초기 상태 ===')
{
  const res = await call('clear-student-pin', { studentId: qa.id, adminPin: ADMIN_PIN })
  check('삭제 호출 ok:true', res.body.ok === true, res.body)
  const row = await fetchRow(qa.id)
  check('pin_hash === null', row.pin_hash === null)
  check('pin_setup_allowed === true', row.pin_setup_allowed === true)
  check('pin_fail_count === 0', row.pin_fail_count === 0)
  check('pin_locked_until === null', row.pin_locked_until === null)
}

console.log('\n=== 4. 삭제 직후 — 기존 PIN 로그인 차단(no_pin_setup) ===')
{
  const res = await call('verify-student-pin', { name: QA_NAME, pin: FIRST_PIN })
  check('기존 PIN 로그인 ok:false, reason:no_pin_setup', res.body.ok === false && res.body.reason === 'no_pin_setup', res.body)
}

console.log('\n=== 5. "PIN 만들기" 탭 시점 — 학생 선택 시 개별 조회(StudentSelect.pickSetupStudent와 동일 요청) ===')
{
  const res = await call('student-pin-status', { studentIds: [qa.id] })
  const s = res.body.results?.[0]
  check('hasPinHash === false ("아직 PIN이 없습니다" 화면 조건)', s?.hasPinHash === false, s)
  check('pinSetupAllowed === true (자기설정 폼 표시 조건)', s?.pinSetupAllowed === true, s)
  check('locked === false', s?.locked === false, s)
}

console.log('\n=== 6. 새 PIN 자기설정(self-set-student-pin) → 성공 + 새 PIN 재로그인 성공 ===')
const NEW_PIN = '7391'
{
  const setRes = await call('self-set-student-pin', { studentId: qa.id, pin: NEW_PIN, pinConfirm: NEW_PIN })
  check('자기설정 ok:true', setRes.body.ok === true, setRes.body)
  const row = await fetchRow(qa.id)
  check('자기설정 후 pin_setup_allowed 다시 false(1회성 원복)', row.pin_setup_allowed === false)
  const oldLogin = await call('verify-student-pin', { name: QA_NAME, pin: FIRST_PIN })
  check('옛 PIN으로는 로그인 실패(wrong_pin)', oldLogin.body.ok === false && oldLogin.body.reason === 'wrong_pin', oldLogin.body)
  const newLogin = await call('verify-student-pin', { name: QA_NAME, pin: NEW_PIN })
  check('새 PIN 재로그인 성공 + studentId 일치(전체 루프 완주)', newLogin.body.ok === true && newLogin.body.studentId === qa.id, newLogin.body)
}

console.log('\n=== 7. [회귀] 기존 "PIN 재설정"(set-student-pin, 랜덤 발급) 스팟체크 ===')
{
  const res = await call('set-student-pin', { studentId: qa.id })
  check('재설정 ok:true + 4자리 pin 반환', res.body.ok === true && /^\d{4}$/.test(res.body.pin), { ok: res.body.ok })
  const login = await call('verify-student-pin', { name: QA_NAME, pin: res.body.pin })
  check('재설정된 PIN으로 로그인 성공(기존 기능 회귀 없음)', login.body.ok === true, login.body)
}

console.log('\n=== 8. 정리 ===')
await supabase.from('students').delete().eq('id', qa.id)
const gone = await fetchRow(qa.id)
check('QA 학생 삭제 완료(라이브 DB에 잔여물 없음)', gone === null)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
