// Vercel Serverless Function — runs server-side, never in the browser.
// 2026-07-16 — 관리자 "🗑 PIN 초기화(삭제)" 기능(운영자 지시, 조사 결과
// "PIN 만들기" 자기설정 플로우가 실제로 도달 불가능한 상태였음이 밝혀진 뒤
// 추가된 진짜 갭 메우기). api/set-student-pin.js의 "PIN 재설정"(🔑, 새
// 랜덤 PIN을 즉시 채움)과는 완전히 별개 — 이 함수는 pin_hash를 실제로
// null로 지워서 그 학생을 "PIN 없음" 상태로 되돌린다:
//   1. pin_hash = null (학생이 다시 "PIN 만들기" 탭에서 자기설정 가능해짐
//      — api/self-set-student-pin.js가 pin_hash IS NULL을 요구하므로)
//   2. pin_setup_allowed = true (자기설정 즉시 재개 가능하게)
//   3. pin_fail_count = 0, pin_locked_until = null (요청엔 명시 안 됐지만
//      "정말 처음 상태로 되돌리는 기능"이라는 의도상 잠금/실패 카운트도
//      같이 초기화 — 이전에 잠겨있던 흔적이 남아있으면 안 됨)
// 기존 PIN으로 로그인 시도하면 api/verify-student-pin.js가 pin_hash 없는
// 후보를 걸러내므로(withPin 필터) 'no_pin_setup'으로 정확히 거부된다.
//
// 인증: 이 프로젝트의 다른 관리자 전용 API들(set-pin-setup-allowed.js,
// unlock-student-pin.js, bulk-generate-temp-pins.js, set-student-pin.js)은
// AdminScreen.jsx의 클라이언트 사이드 PIN 게이트(verify-admin-pin 1회
// 통과 후 authed=true)만 신뢰하고 요청마다 재검증하지 않는다 — 이 함수는
// "기존 PIN 자격증명을 실제로 삭제"하는, 이 앱에서 가장 파괴적인 관리자
// 액션이므로 예외적으로 요청마다 서버에서 adminPin을 재검증한다(같은
// ADMIN_PIN 서버 전용 env, api/verify-admin-pin.js와 동일한 비교 방식).
import { createClient } from '@supabase/supabase-js'
import { supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const adminPin = process.env.ADMIN_PIN
  if (!adminPin) {
    res.status(500).json({ error: 'Server not configured: ADMIN_PIN missing' })
    return
  }

  const { studentId, adminPin: suppliedAdminPin } = req.body || {}
  if (typeof suppliedAdminPin !== 'string' || suppliedAdminPin !== adminPin) {
    res.status(200).json({ ok: false, reason: 'not_authorized' })
    return
  }
  if (!studentId) {
    res.status(400).json({ error: 'studentId is required' })
    return
  }

  const url = supabaseAdminUrl()
  const key = supabaseAdminKey()
  if (!url || !key) {
    res.status(500).json({ error: 'Server not configured: SUPABASE_URL / key missing' })
    return
  }

  const supabase = createClient(url, key)
  const { error } = await supabase
    .from('students')
    .update({ pin_hash: null, pin_setup_allowed: true, pin_fail_count: 0, pin_locked_until: null })
    .eq('id', studentId)
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.status(200).json({ ok: true })
}
