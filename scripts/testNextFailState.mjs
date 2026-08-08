// P0 회귀 테스트 — api/verify-student-pin.js의 nextFailState() 순수 함수.
// 배경: 김보민 실사고(2026-08-09) — 계정이 5회 실패로 잠긴 뒤 5분이 지나
// 잠금이 만료돼도 pin_fail_count가 5로 남아있어서, 만료 후 첫 시도가
// 오답이면 nextFailCount=6 >= MAX_FAILS(5)가 되어 즉시 재잠금되던 버그.
// 네트워크 0 — DB/HTTP 접근 없이 추출된 순수 함수만 직접 호출해서
// 검증한다(규칙 15: 수정 전 코드로 되돌리면 ①이 FAIL하는지 먼저 확인해
// 회귀를 재현·확정 — 이 파일 상단 실행 로그에 그 결과를 남긴다).
import { nextFailState } from '../api/verify-student-pin.js'

const MAX_FAILS = 5
const LOCK_MINUTES = 5
const now = Date.now()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n=== ① 잠금이 만료된 계정 + 오답 → 새 5회 창(재잠금 아님), stale lock 정리 ===')
{
  // 5회 실패로 잠겼었지만 그 잠금이 1분 전에 만료된 상태(pin_fail_count는
  // 아직 5로 남아있음 — 이게 버그의 핵심 조건).
  const candidate = { pin_fail_count: 5, pin_locked_until: new Date(now - 60 * 1000).toISOString() }
  const state = nextFailState(candidate, now, { MAX_FAILS, LOCK_MINUTES })
  check('nextFailCount === 1 (만료 후 새 창)', state.nextFailCount === 1)
  check('relock === false (즉시 재잠금 아님 — 김보민 사고 재발 방지)', state.relock === false)
  check('clearLock === true (stale pin_locked_until 정리 대상)', state.clearLock === true)
}

console.log('\n=== ② 안 잠긴 계정, fail 4회 + 오답 → 5회째, 재잠금 ===')
{
  const candidate = { pin_fail_count: 4, pin_locked_until: null }
  const state = nextFailState(candidate, now, { MAX_FAILS, LOCK_MINUTES })
  check('nextFailCount === 5', state.nextFailCount === 5)
  check('relock === true (5회 도달 → 잠금)', state.relock === true)
  check('lockedUntil이 문자열로 설정됨', typeof state.lockedUntil === 'string')
  check('clearLock === false (원래 안 잠겨있었으므로 정리할 것 없음)', state.clearLock === false)
}

console.log('\n=== ③ 안 잠긴 계정, fail 0회(첫 시도) + 오답 → 1회 ===')
{
  const candidate = { pin_fail_count: 0, pin_locked_until: null }
  const state = nextFailState(candidate, now, { MAX_FAILS, LOCK_MINUTES })
  check('nextFailCount === 1', state.nextFailCount === 1)
  check('relock === false', state.relock === false)
  check('clearLock === false', state.clearLock === false)
}

// ④ 잠금이 아직 만료되지 않은(미래 pin_locked_until) 후보는 애초에
// api/verify-student-pin.js의 `unlocked` 필터(잠금 전원잠김 분기)에서
// 걸러지므로 nextFailState()에는 입력으로 들어오지 않는다 — 이 함수의
// 테스트 대상이 아니다(핸들러 레벨 시나리오, 별도 검증은
// scripts/testStudentPinAuth.mjs의 8-1번 케이스 참고).

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
