// scripts/testAdminPinThrottle.mjs — 관리자 PIN 브루트포스 스로틀 회귀
// (2026-09-04, 야간 트랙 T6b, security-reviewer 감사 Medium #P12 대응)
//
// 문제: api/verify-admin-pin.js는 실패 시 1.5초 지연을 걸고 있었지만
// (2026-07-16 P7 감사 후속), 같은 ADMIN_PIN을 검증하는 checkAdminReauth
// (api/_pinAuth.js — admin-pin-actions.js 12개 액션 dispatch +
// compute-word-king.js + start-new-season.js가 공유)와 clear-student-pin.js/
// set-student-pin.js의 인라인 비교에는 지연이 전혀 없어, 공격자가 그
// 경로들로는 ADMIN_PIN을 전속력으로 온라인 브루트포스할 수 있었다.
// 추가로 verify-admin-pin.js는 평문 `===` 비교라 checkAdminReauth의
// timingSafeEqual과 방어 수준이 달랐다.
//
// 이 스위트는 4가지를 검증한다(모두 네트워크/DB 접촉 0 — clear-student-
// pin.js/set-student-pin.js의 "인가 실패" 경로는 Supabase 쿼리 이전에
// return하므로, url/key를 더미 문자열로 채워도 실제 연결을 시도하지
// 않는다):
//   1. 정적 — api/*.js 중 process.env.ADMIN_PIN을 직접 읽어 비교하는
//      파일은 전부 실패 경로에서 adminPinFailureDelay()를 호출한다(또는
//      checkAdminReauth로 그 검증을 위임한다).
//   2. 정적 — api/verify-admin-pin.js에 평문 `===` 비교가 남아있지 않고
//      timingSafeStringEqual을 쓴다.
//   3. 행동 — checkAdminReauth / verify-admin-pin.js / clear-student-pin.js
//      / set-student-pin.js가 틀린 adminPin에서 설정된 지연만큼 걸리고
//      (ADMIN_PIN_FAIL_DELAY_MS 테스트 전용 오버라이드로 실제 1.5초를
//      기다리지 않는다), 맞는 adminPin은 즉시 반환하며, 응답 형태(상태
//      코드/바디)가 기존과 동일함을 확인한다.
//   4. 행동 — admin-pin-actions.js dispatch가 여전히 틀린 adminPin을
//      거부하고 올바른 adminPin은 인가 게이트를 통과시키는지(2개 샘플
//      액션, scripts/testAdminPinActionsDispatch.mjs와 동일한 direct-
//      import 패턴 — DB에 실제로 쓰는 액션은 고르지 않음). ADMIN_PIN이
//      로컬에 없으면(.env.local 미설정/CI) 정직하게 SKIP.
//
// FAIL-first(CLAUDE.md 규칙 15) 실측 — 이 파일을 먼저 작성한 뒤(구현 커밋
// 전) 수정 전 소스(checkAdminReauth 동기+지연 없음, verify-admin-pin.js
// 평문 비교, clear-student-pin.js/set-student-pin.js 지연 없음)로 실행해
// 섹션 1/2/3이 아래처럼 FAIL하는 것을 확인했다(git stash로 구현 diff를
// 잠시 되돌려 재현, 규칙 15):
//   섹션 1: clear-student-pin.js/set-student-pin.js/verify-admin-pin.js가
//     adminPinFailureDelay 미호출로 FAIL(3건)
//   섹션 2: verify-admin-pin.js가 평문 `pin === adminPin` 비교를 그대로
//     써서 FAIL(2건 — "평문 비교 없음"/"timingSafeStringEqual 사용")
//   섹션 3: checkAdminReauth/verify-admin-pin.js/clear-student-pin.js/
//     set-student-pin.js 전부 "틀린 PIN이 지연 없이 즉시 반환"으로 FAIL
//     (지연 시간 단언 4건 — verify-admin-pin.js만 기존 1.5초 고정 지연이
//     있어 오버라이드 반영 여부로 FAIL했고 나머지 3개는 지연 자체가 0)
// 구현 적용 후 재실행 시 전체 PASS로 전환.
//
// 등록: package.json "verify:admin-pin-throttle".
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..')

let failures = 0
let asserted = 0
function check(label, cond, detail) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + String(detail) : ''}`); failures++ }
}

// ── 주석 제거(정적 검사용, 대략적) ────────────────────────────────────────
// 문자열 리터럴 안에 `//`나 `/* */`가 나오는 코드가 이 저장소의 api/*.js에는
// 없다(실측 확인) — 완벽한 파서가 아니라 이 파일 집합에 한정된 실용적
// 근사치임을 명시.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

console.log('\n=== 1. [정적] api/*.js 중 ADMIN_PIN을 직접 비교하는 파일은 전부 실패 지연을 건다 ===')
{
  const apiDir = path.join(ROOT, 'api')
  const files = fs.readdirSync(apiDir)
    .filter((f) => f.endsWith('.js') && f !== '_pinAuth.js')
  check('api/ 디렉터리에서 대상 파일을 찾음(회귀 방지 — 빈 목록이면 이 검사 자체가 무의미)', files.length > 0, files.length)

  for (const file of files) {
    const full = path.join(apiDir, file)
    const stripped = stripComments(fs.readFileSync(full, 'utf8'))
    const usesSharedGate = /checkAdminReauth\s*\(/.test(stripped)
    const readsAdminPinDirectly = /process\.env\.ADMIN_PIN\b/.test(stripped)
    if (usesSharedGate) {
      check(`${file}: checkAdminReauth 공용 게이트 사용(지연은 _pinAuth.js가 보장)`, true)
      continue
    }
    if (!readsAdminPinDirectly) continue // ADMIN_PIN과 무관한 파일 — 대상 아님
    check(`${file}: ADMIN_PIN을 직접 비교하면서 adminPinFailureDelay()를 호출함`,
      /adminPinFailureDelay\s*\(/.test(stripped))
  }
}

console.log('\n=== 2. [정적] api/verify-admin-pin.js — 평문 비교 제거 + timingSafeStringEqual 사용 ===')
{
  const verifyAdminPinSrc = stripComments(fs.readFileSync(path.join(ROOT, 'api/verify-admin-pin.js'), 'utf8'))
  check('평문 `pin === adminPin` 비교가 없음', !/\bpin\s*===\s*adminPin\b/.test(verifyAdminPinSrc))
  check('평문 `adminPin === pin` 비교가 없음', !/\badminPin\s*===\s*pin\b/.test(verifyAdminPinSrc))
  check('timingSafeStringEqual(...)을 사용함', /timingSafeStringEqual\s*\(/.test(verifyAdminPinSrc))
}

// ── 행동 검증 공통 유틸 ──────────────────────────────────────────────────
function mockRes() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}
async function timed(fn) {
  // Date.now()는 벽시계 기준이라 CI(특히 가상화된 Linux 러너)에서 타이머
  // 해상도/스케줄링 지터로 실제 setTimeout 지연보다 짧게 관측되는 flake가
  // 있었다(2026-09-04, CI 33801415661 — "39ms" < 40ms 임계값). performance.now()
  // 는 단조 증가 고해상도 클록이라 이 오차의 원인은 아니지만, 근본 원인은
  // 이벤트 루프/타이머 자체의 지터이므로 아래 TEST_DELAY_MS 상향 + 허용오차
  // (assertElapsedAtLeast)로 함께 흡수한다.
  const start = performance.now()
  const result = await fn()
  return { result, elapsedMs: performance.now() - start }
}

// CI 타이머 지터 허용오차(ms) — setTimeout(delay)가 스케줄러 지연으로 delay
// 보다 살짝 이르게 관측되는 경우가 드물게 있다(로컬에서는 재현되지 않았고
// CI 러너에서만 40ms 지연에 대해 39ms로 1ms 짧게 관측됨). 절대 시간이 아니라
// "지연이 사실상 적용됐는가"를 확인하는 것이 이 스위트의 목적이므로, 지연을
// 0으로 두면(코드 회귀) 여전히 확실히 FAIL하도록 지연값(120ms) 대비 충분히
// 작은 허용오차(10ms)만 둔다.
const ELAPSED_TOLERANCE_MS = 10
function assertElapsedAtLeast(delayMs, elapsedMs) {
  return elapsedMs >= delayMs - ELAPSED_TOLERANCE_MS
}

// 더미 값 — 아래 시나리오는 전부 "인가 실패" 경로만 태우므로 Supabase에
// 실제로 연결/쿼리하지 않는다(성공 경로/DB 쓰기는 이 스위트의 범위 밖 —
// 기존 testStudentPinAuth.mjs/testClearStudentPin.mjs가 커버).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://fake-test-project.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake-service-role-key-not-a-real-secret'

const TEST_DELAY_MS = 120 // 실제 1.5초 대신 짧게(+ CI 타이머 지터를 흡수할 만큼 40ms보다 여유있게) — CI/로컬 모두 빠르게 통과
process.env.ADMIN_PIN_FAIL_DELAY_MS = String(TEST_DELAY_MS)
process.env.ADMIN_PIN = process.env.ADMIN_PIN_THROTTLE_TEST_PIN || 'qa-throttle-test-9182736'
const REAL_PIN = process.env.ADMIN_PIN
const WRONG_PIN = 'definitely-wrong-pin'

console.log('\n=== 3a. [행동] checkAdminReauth — 지연/응답 형태 ===')
{
  const { checkAdminReauth } = await import(pathToFileURL(path.join(ROOT, 'api/_pinAuth.js')).href)

  const wrongRes = mockRes()
  const { result: wrongOk, elapsedMs: wrongElapsed } = await timed(() => checkAdminReauth({ body: { adminPin: WRONG_PIN } }, wrongRes))
  check('틀린 adminPin → false 반환', wrongOk === false)
  check('틀린 adminPin → 응답 형태 무변경(200 + ok:false + not_authorized)',
    wrongRes.statusCode === 200 && wrongRes.body?.ok === false && wrongRes.body?.reason === 'not_authorized', JSON.stringify(wrongRes.body))
  check(`틀린 adminPin → 설정된 지연(≥${TEST_DELAY_MS}ms, 허용오차 ${ELAPSED_TOLERANCE_MS}ms) 대기함`, assertElapsedAtLeast(TEST_DELAY_MS, wrongElapsed), `${wrongElapsed.toFixed(1)}ms`)

  const okRes = mockRes()
  const { result: okOk, elapsedMs: okElapsed } = await timed(() => checkAdminReauth({ body: { adminPin: REAL_PIN } }, okRes))
  check('올바른 adminPin → true 반환', okOk === true)
  check('올바른 adminPin → 지연 없이 즉시 반환(<지연값의 절반)', okElapsed < TEST_DELAY_MS / 2, `${okElapsed.toFixed(1)}ms`)
}

console.log('\n=== 3b. [행동] api/verify-admin-pin.js — 지연/응답 형태 ===')
{
  const { default: verifyAdminPin } = await import(pathToFileURL(path.join(ROOT, 'api/verify-admin-pin.js')).href)
  function call(pin) {
    return new Promise((resolve) => {
      const res = { statusCode: 0, status(c) { this.statusCode = c; return this }, json(b) { resolve({ statusCode: this.statusCode, body: b }) } }
      verifyAdminPin({ method: 'POST', body: { pin } }, res)
    })
  }

  const { result: wrong, elapsedMs: wrongElapsed } = await timed(() => call(WRONG_PIN))
  check('틀린 pin → { ok:false } (응답 형태 무변경)', wrong.statusCode === 200 && wrong.body?.ok === false, JSON.stringify(wrong))
  check(`틀린 pin → 설정된 지연(≥${TEST_DELAY_MS}ms, 허용오차 ${ELAPSED_TOLERANCE_MS}ms) 대기함`, assertElapsedAtLeast(TEST_DELAY_MS, wrongElapsed), `${wrongElapsed.toFixed(1)}ms`)

  const { result: ok, elapsedMs: okElapsed } = await timed(() => call(REAL_PIN))
  check('올바른 pin → { ok:true } (응답 형태 무변경)', ok.statusCode === 200 && ok.body?.ok === true, JSON.stringify(ok))
  check('올바른 pin → 지연 없이 즉시 반환(<지연값의 절반)', okElapsed < TEST_DELAY_MS / 2, `${okElapsed.toFixed(1)}ms`)
}

console.log('\n=== 3c. [행동] api/clear-student-pin.js — 인가 실패 시 지연/응답 형태 ===')
{
  const { default: clearStudentPin } = await import(pathToFileURL(path.join(ROOT, 'api/clear-student-pin.js')).href)
  function call(adminPin) {
    return new Promise((resolve) => {
      const res = { statusCode: 0, status(c) { this.statusCode = c; return this }, json(b) { resolve({ statusCode: this.statusCode, body: b }) } }
      clearStudentPin({ method: 'POST', body: { studentId: 'qa-test-not-a-real-student', adminPin } }, res)
    })
  }

  const { result: wrong, elapsedMs: wrongElapsed } = await timed(() => call(WRONG_PIN))
  check('틀린 adminPin → 응답 형태 무변경(200 + ok:false + not_authorized)',
    wrong.statusCode === 200 && wrong.body?.ok === false && wrong.body?.reason === 'not_authorized', JSON.stringify(wrong))
  check(`틀린 adminPin → 설정된 지연(≥${TEST_DELAY_MS}ms, 허용오차 ${ELAPSED_TOLERANCE_MS}ms) 대기함`, assertElapsedAtLeast(TEST_DELAY_MS, wrongElapsed), `${wrongElapsed.toFixed(1)}ms`)
}

console.log('\n=== 3d. [행동] api/set-student-pin.js — 관리자 무작위 재설정 인가 실패 시 지연/응답 형태 ===')
{
  const { default: setStudentPin } = await import(pathToFileURL(path.join(ROOT, 'api/set-student-pin.js')).href)
  function call(adminPin) {
    return new Promise((resolve) => {
      const res = { statusCode: 0, status(c) { this.statusCode = c; return this }, json(b) { resolve({ statusCode: this.statusCode, body: b }) } }
      // pin 미지정 → "무작위 재설정" 분기(관리자 전용). 이 분기는 학생
      // 자기등록 경로가 절대 타지 않으므로(자기등록은 항상 pin을 명시
      // 전달) 여기서 지연을 걸어도 정상 학생 흐름에 영향이 없다.
      setStudentPin({ method: 'POST', body: { studentId: 'qa-test-not-a-real-student', adminPin } }, res)
    })
  }

  const { result: wrong, elapsedMs: wrongElapsed } = await timed(() => call(WRONG_PIN))
  check('틀린 adminPin(무작위 재설정) → 응답 형태 무변경(200 + ok:false + not_authorized)',
    wrong.statusCode === 200 && wrong.body?.ok === false && wrong.body?.reason === 'not_authorized', JSON.stringify(wrong))
  check(`틀린 adminPin(무작위 재설정) → 설정된 지연(≥${TEST_DELAY_MS}ms, 허용오차 ${ELAPSED_TOLERANCE_MS}ms) 대기함`, assertElapsedAtLeast(TEST_DELAY_MS, wrongElapsed), `${wrongElapsed.toFixed(1)}ms`)
}

console.log('\n=== 4. [행동] admin-pin-actions.js dispatch — 인가 회귀 없음(DB 쓰기 없는 2개 샘플 액션) ===')
{
  // 실제 운영 ADMIN_PIN이 필요한 섹션 — scripts/testAdminPinActionsDispatch.mjs
  // 와 동일한 SKIP 관례(.env/.env.local에서 ADMIN_PIN 로드, 없으면 정직하게
  // SKIP). 위 3a~3d는 자체 발급한 테스트 전용 ADMIN_PIN으로 이미 지연/형태를
  // 검증했으므로, 이 섹션은 "실제 dispatch 로직이 여전히 정확히 통과/거부
  // 하는지"만 확인한다.
  for (const file of ['.env', '.env.local']) {
    const p = path.join(ROOT, file)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([^#=][^=]*)=(.*)$/)
      if (m) process.env[`__DISPATCH_${m[1].trim()}`] = m[2].trim()
    }
  }
  const REAL_ADMIN_PIN = process.env.__DISPATCH_ADMIN_PIN
  if (!REAL_ADMIN_PIN) {
    console.log('  SKIP — ADMIN_PIN이 없음(.env.local 미설정 또는 CI 환경, 예상된 상태). dispatch 인가 회귀만 건너뜁니다(3a~3d는 위에서 이미 실행됨).')
  } else {
    process.env.ADMIN_PIN = REAL_ADMIN_PIN
    const { default: adminPinActions } = await import(pathToFileURL(path.join(ROOT, 'api/admin-pin-actions.js')).href)
    function call(body) {
      return new Promise((resolve) => {
        const res = { statusCode: 0, status(c) { this.statusCode = c; return this }, json(b) { resolve({ statusCode: this.statusCode, body: b }) } }
        adminPinActions({ method: 'POST', body }, res)
      })
    }

    const wrong = await call({ action: 'unlock_student_pin', studentId: 'x', adminPin: WRONG_PIN })
    check('틀린 adminPin → not_authorized(회귀 없음)', wrong.body?.reason === 'not_authorized', JSON.stringify(wrong))

    const ok1 = await call({ action: 'unlock_student_pin', adminPin: REAL_ADMIN_PIN }) // studentId 누락 → 인가는 통과, 필드검증 400
    check('올바른 adminPin(unlock_student_pin) → 인가 게이트 통과(not_authorized 아님, 400 필드검증)',
      ok1.body?.reason !== 'not_authorized' && ok1.statusCode === 400, JSON.stringify(ok1))

    const ok2 = await call({ action: 'set_pin_setup_allowed', adminPin: REAL_ADMIN_PIN }) // studentIds 누락 → 인가는 통과, 필드검증 400
    check('올바른 adminPin(set_pin_setup_allowed) → 인가 게이트 통과(not_authorized 아님, 400 필드검증)',
      ok2.body?.reason !== 'not_authorized' && ok2.statusCode === 400, JSON.stringify(ok2))
  }
}

console.log(`\n${asserted}개 단언, ${failures === 0 ? '모든 테스트 통과 ✅' : `${failures}개 실패 ❌`}`)
process.exitCode = failures === 0 ? 0 : 1
