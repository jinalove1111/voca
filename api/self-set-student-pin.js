// Vercel Serverless Function — runs server-side, never in the browser.
// P0 후속(2026-07-16, 운영자 지시): 학생이 자기 자신의 PIN을 최초로
// 직접 설정하는 전용 엔드포인트 — api/set-student-pin.js(관리자 전용,
// 강제 재설정/무작위 발급)와는 신뢰 모델이 다르므로 분리했다. 이 함수는
// 반드시 서버에서 아래 두 조건을 모두 확인한 뒤에만 저장한다:
//   1. students.pin_setup_allowed === true (관리자가 그 학생 로우에
//      "PIN 설정 허용"을 명시적으로 눌러둔 상태)
//   2. students.pin_hash IS NULL (이미 PIN이 있는 계정은 자기설정으로
//      덮어쓸 수 없음 — 그 경우는 관리자의 "PIN 초기화"만 가능)
// 이 두 조건이 없으면, 다른 학생 이름을 알고 있는 누구나 그 학생인 척
// PIN을 가로챌 수 있다 — 그래서 클라이언트가 보내는 값은 절대 신뢰하지
// 않고 항상 DB에서 다시 조회해서 확인한다.
//
// 성공 시 pin_setup_allowed를 즉시 다시 false로 원복한다(1회성 — 관리자가
// 매번 다시 허용해야 재사용 가능).
import { createClient } from '@supabase/supabase-js'
import { isValidPinFormat, isWeakPin, hashPin, supabaseAdminUrl, supabaseAdminKey, verifyPinSetupCode } from './_pinAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const url = supabaseAdminUrl()
  const key = supabaseAdminKey()
  if (!url || !key) {
    res.status(500).json({ error: 'Server not configured: SUPABASE_URL / key missing' })
    return
  }

  const { studentId, pin, pinConfirm, setupCode } = req.body || {}
  if (!studentId) {
    res.status(400).json({ error: 'studentId is required' })
    return
  }

  // [SECURITY 2026-08-29] 제2 인증 요소 — 관리자가 발급한 1회용 setup code.
  // 이 검사가 없던 동안에는 아래 두 게이트(pin_setup_allowed / pin_hash IS
  // NULL)가 전부였는데, 둘 다 계정의 *상태*일 뿐 "요청자가 그 학생 본인인가"를
  // 말해주지 못했다 — 학생 UUID만 알면(anon key로 students.id 열거가 열려
  // 있다) 누구나 남의 PIN을 선점하고 그 PIN으로 로그인해 세션 토큰까지
  // 받을 수 있었다(scripts/testPinSetupCapability.mjs 헤더의 공격 체인 A~E).
  //
  // 코드 검사를 DB 조회보다 먼저 둔다 — 코드가 없는 요청이 학생 존재 여부나
  // pin_setup_allowed 상태를 응답 차이로 알아내지 못하게 하기 위함이다.
  // 시크릿 미설정 시 verifyPinSetupCode가 no_secret으로 거부하므로
  // fail-closed다(코드 없이 통과하는 경로가 생기지 않는다).
  const codeCheck = verifyPinSetupCode(studentId, setupCode)
  if (!codeCheck.ok) {
    res.status(200).json({ ok: false, reason: 'invalid_setup_code', detail: codeCheck.reason })
    return
  }
  if (!isValidPinFormat(pin)) {
    res.status(200).json({ ok: false, reason: 'invalid_format' })
    return
  }
  // 클라이언트도 재입력 확인을 강제하지만(필수 UI), 서버도 한 번 더
  // 확인한다 — 클라이언트 검증은 우회 가능하므로.
  if (pinConfirm !== undefined && pin !== pinConfirm) {
    res.status(200).json({ ok: false, reason: 'mismatch' })
    return
  }
  if (isWeakPin(pin)) {
    res.status(200).json({ ok: false, reason: 'weak_pin' })
    return
  }

  const supabase = createClient(url, key)
  const { data: student, error: selErr } = await supabase
    .from('students')
    .select('id,pin_hash,pin_setup_allowed')
    .eq('id', studentId)
    .maybeSingle()
  if (selErr) {
    res.status(500).json({ error: selErr.message })
    return
  }
  if (!student) {
    res.status(200).json({ ok: false, reason: 'not_found' })
    return
  }
  if (student.pin_hash) {
    res.status(200).json({ ok: false, reason: 'already_set' })
    return
  }
  if (!student.pin_setup_allowed) {
    res.status(200).json({ ok: false, reason: 'not_allowed' })
    return
  }

  const pin_hash = hashPin(pin)
  // [SECURITY FIX] check-then-act 레이스 — 위 SELECT에서 pin_hash가 NULL임을
  // 확인한 뒤 아래 UPDATE까지 사이에 시간차가 있어, 같은 학생 row를 대상으로
  // 두 요청이 거의 동시에 도착하면 둘 다 SELECT 통과 → 둘 다 UPDATE 실행 →
  // 나중에 끝난 요청이 먼저 요청의 PIN을 조용히 덮어쓴다(last write wins).
  // 그 결과 먼저 설정을 "성공"으로 응답받은 학생의 실제 로그인 PIN이 다른
  // 학생이 입력한 값으로 바뀌어버릴 수 있다. api/admin-pin-actions.js:117의
  // set_pin_setup_allowed 액션과 동일하게, UPDATE 자체에 pin_hash IS NULL
  // 조건을 다시 걸어 원자적으로 재확인한다 — 레이스에서 진 요청은 0 rows
  // 영향으로 끝나고, 아래에서 이미 있는 already_set 응답을 그대로 준다.
  const { data: updatedRows, error: updErr } = await supabase
    .from('students')
    // 성공 즉시 pin_setup_allowed를 false로 원복(1회성) + 혹시 모를
    // 이전 실패 카운트/잠금도 함께 초기화(새로 만든 PIN이니 깨끗한 상태로).
    .update({ pin_hash, pin_setup_allowed: false, pin_fail_count: 0, pin_locked_until: null })
    .eq('id', studentId)
    .is('pin_hash', null)
    .select('id')
  if (updErr) {
    res.status(500).json({ error: updErr.message })
    return
  }
  if (!updatedRows || updatedRows.length === 0) {
    res.status(200).json({ ok: false, reason: 'already_set' })
    return
  }

  res.status(200).json({ ok: true })
}
