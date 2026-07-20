// 2026-07-20 — api/admin-pin-actions.js(bulk-generate-temp-pins.js/
// set-pin-setup-allowed.js/unlock-student-pin.js 통합) 신규 dispatch
// 로직 전용 회귀 테스트. DB에 실제로 쓰는 경로(각 액션의 Supabase
// update/select)는 testStudentPinAuth.mjs/testStudentPinSelfSetup.mjs가
// 이미 덮는다(단, 로컬 환경엔 SUPABASE_SERVICE_ROLE_KEY가 없어 anon key
// 폴백 시 RLS 컬럼권한에 막히는 기존 제약 — ARCHITECTURE.md "service_role
// vs anon" 참고. 프로덕션은 Vercel 환경변수로 정상 동작, 배포 후 라이브
// 스모크 테스트로 확정).
//
// 이 파일은 DB에 전혀 쓰지 않는(=로컬/CI 어디서든 항상 결정적으로 통과하는)
// 순수 라우팅/검증 경로만 검증한다: method 체크, 인가(action 분기보다
// 먼저인지), 알 수 없는/누락된 action, 각 액션의 필드 검증. bulk_generate_
// temp_pins의 정상 경로 1개만 예외적으로 실제 DB를 건드리는데, 로컬에서
// 권한 오류(500)가 나더라도 "크래시 없이 에러 응답으로 처리됨"만 확인하고
// 실패로 세지 않는다(아래 주석 참고).
import fs from 'node:fs'

for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}
const ADMIN_PIN = process.env.ADMIN_PIN
if (!ADMIN_PIN) { console.error('ADMIN_PIN missing in .env.local — abort'); process.exit(1) }

const { default: adminPinActions } = await import('../api/admin-pin-actions.js')

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

function callHandler(handler, { method = 'POST', body } = {}) {
  return new Promise((resolve) => {
    const res = {
      _status: 200,
      status(code) { this._status = code; return this },
      json(payload) { resolve({ status: this._status, body: payload }) },
    }
    handler({ method, body }, res)
  })
}

console.log('\n=== 1. method 체크 ===')
{
  const res = await callHandler(adminPinActions, { method: 'GET', body: {} })
  check('GET은 405', res.status === 405 && res.body.error === 'Method not allowed')
}

console.log('\n=== 2. 인가가 action 분기보다 먼저 — action 없음/모름이어도 미인증이면 항상 not_authorized ===')
{
  const noAction = await callHandler(adminPinActions, { body: {} })
  check('adminPin 없음 + action도 없음 → not_authorized(400 unknown action 아님)', noAction.body.reason === 'not_authorized' && noAction.status === 200)

  const unknownAction = await callHandler(adminPinActions, { body: { action: 'delete_everything' } })
  check('adminPin 없음 + 알 수 없는 action → 여전히 not_authorized(action 존재 여부가 노출되지 않음)', unknownAction.body.reason === 'not_authorized')

  const wrongPin = await callHandler(adminPinActions, { body: { action: 'unlock_student_pin', studentId: 'x', adminPin: 'wrong' } })
  check('틀린 adminPin → not_authorized', wrongPin.body.reason === 'not_authorized')
}

console.log('\n=== 3. 인가 통과 후 — action 누락/알 수 없는 값은 400으로 명시 거부 ===')
{
  const missing = await callHandler(adminPinActions, { body: { adminPin: ADMIN_PIN } })
  check('adminPin 정상 + action 없음 → 400 action is required', missing.status === 400 && /action is required/.test(missing.body.error || ''))

  const unknown = await callHandler(adminPinActions, { body: { action: 'delete_everything', adminPin: ADMIN_PIN } })
  check('adminPin 정상 + 알 수 없는 action → 400 unknown action', unknown.status === 400 && /unknown action/.test(unknown.body.error || ''))
}

console.log('\n=== 4. set_pin_setup_allowed — 필드 검증(studentIds/allowed) 원본 그대로 보존 ===')
{
  const noIds = await callHandler(adminPinActions, { body: { action: 'set_pin_setup_allowed', allowed: true, adminPin: ADMIN_PIN } })
  check('studentIds 없음 → 400', noIds.status === 400 && /studentIds/.test(noIds.body.error || ''))

  const noAllowed = await callHandler(adminPinActions, { body: { action: 'set_pin_setup_allowed', studentIds: ['x'], adminPin: ADMIN_PIN } })
  check('allowed 없음(boolean 아님) → 400', noAllowed.status === 400 && /allowed/.test(noAllowed.body.error || ''))
}

console.log('\n=== 5. unlock_student_pin — 필드 검증(studentId) 원본 그대로 보존 ===')
{
  const noId = await callHandler(adminPinActions, { body: { action: 'unlock_student_pin', adminPin: ADMIN_PIN } })
  check('studentId 없음 → 400', noId.status === 400 && /studentId is required/.test(noId.body.error || ''))
}

console.log('\n=== 6. bulk_generate_temp_pins — 정상 인가 통과 후 DB 단계까지 도달(크래시 없음) ===')
{
  // 로컬엔 SUPABASE_SERVICE_ROLE_KEY가 없어 anon key 폴백 시 RLS 컬럼권한에
  // 막혀 500이 날 수 있다(ARCHITECTURE.md 기존 제약, 이번 변경과 무관 —
  // set-student-pin.js 등 손대지 않은 파일도 로컬에서 동일하게 500이 남을
  // 이 세션에서 별도로 실측 확인함). 여기서는 "인가를 통과해 실제 DB
  // 조작 단계까지 정상적으로 도달했는지"(=count/results 필드가 있거나,
  // 권한 오류(500)로 명확히 실패하는지 — 미인증(not_authorized)이나
  // 크래시가 아닌지)만 확인한다. 실제 성공 여부는 Vercel 프로덕션 라이브
  // 스모크 테스트(handoff.md 배포 절차)로 확정한다.
  const res = await callHandler(adminPinActions, { body: { action: 'bulk_generate_temp_pins', adminPin: ADMIN_PIN } })
  const reachedDb = ('count' in (res.body || {})) || (res.status === 500 && typeof res.body?.error === 'string')
  check('인가 통과 후 DB 조작 단계까지 도달(count 필드 있음 또는 명확한 500 에러 — not_authorized나 크래시가 아님)', reachedDb)
  if (res.status === 500) {
    console.log(`  ℹ️  로컬 환경 제약으로 500(${res.body.error}) — 프로덕션(SUPABASE_SERVICE_ROLE_KEY 설정됨)에서는 정상 동작 예상, 배포 후 라이브 스모크 테스트로 확정 필요.`)
  }
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
// bulk_generate_temp_pins 케이스가 핸들러 내부에서 Supabase 클라이언트를
// 생성하므로, 곧바로 process.exit()하면 undici 소켓 핸들이 닫히는 중에
// libuv assertion으로 죽는다(Windows + Node 24, testEntranceTestDb.mjs가
// 이미 문서화한 것과 동일 — handoff.md 2026-07-19 참고). 한 틱 쉬고 종료.
await new Promise((r) => setTimeout(r, 300))
process.exit(failures === 0 ? 0 : 1)
