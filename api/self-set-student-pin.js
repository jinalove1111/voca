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
import { isValidPinFormat, isWeakPin, hashPin, supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'

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

  const { studentId, pin, pinConfirm } = req.body || {}
  if (!studentId) {
    res.status(400).json({ error: 'studentId is required' })
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
  const { error: updErr } = await supabase
    .from('students')
    // 성공 즉시 pin_setup_allowed를 false로 원복(1회성) + 혹시 모를
    // 이전 실패 카운트/잠금도 함께 초기화(새로 만든 PIN이니 깨끗한 상태로).
    .update({ pin_hash, pin_setup_allowed: false, pin_fail_count: 0, pin_locked_until: null })
    .eq('id', studentId)
  if (updErr) {
    res.status(500).json({ error: updErr.message })
    return
  }

  res.status(200).json({ ok: true })
}
