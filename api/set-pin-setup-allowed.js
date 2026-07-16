// Vercel Serverless Function — runs server-side, never in the browser.
// Admin-only action — toggles students.pin_setup_allowed ("PIN 설정 허용"/
// "허용 취소" button in AdminScreen.jsx's roster, and the per-class
// bulk-allow button).
//
// 2026-07-16 P7 감사 후속: 예전엔 클라이언트 사이드 게이트만 믿었지만,
// 이 액션은 PIN 자기설정 창구를 여는 것(= 임의 학생 계정 탈취의 첫 단계가
// 될 수 있음)이므로 clear-student-pin.js와 동일하게 요청마다 ADMIN_PIN을
// 재검증한다(checkAdminReauth). 호출자는 AdminScreen.jsx뿐이며 adminPin을
// body에 함께 보낸다.
import { createClient } from '@supabase/supabase-js'
import { checkAdminReauth, supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!checkAdminReauth(req, res)) return

  const url = supabaseAdminUrl()
  const key = supabaseAdminKey()
  if (!url || !key) {
    res.status(500).json({ error: 'Server not configured: SUPABASE_URL / key missing' })
    return
  }

  const { studentIds, allowed } = req.body || {}
  const ids = Array.isArray(studentIds) ? studentIds : (studentIds ? [studentIds] : [])
  if (ids.length === 0 || typeof allowed !== 'boolean') {
    res.status(400).json({ error: 'studentIds (id or array) and allowed (boolean) are required' })
    return
  }

  const supabase = createClient(url, key)
  // 이미 pin_hash가 있는 계정을 "허용"으로 켜봤자 self-set-student-pin.js가
  // 어차피 거부하지만(방어적 이중 체크), 관리자 화면에 혼란을 안 주려면
  // 애초에 pin_hash가 없는 계정만 대상으로 하는 게 더 명확하다 — 단,
  // "허용 취소"(allowed:false)는 어떤 계정이든 항상 가능해야 하므로 그건
  // 제한하지 않는다.
  let query = supabase.from('students').update({ pin_setup_allowed: allowed }).in('id', ids)
  if (allowed) query = query.is('pin_hash', null)
  const { error } = await query
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.status(200).json({ ok: true })
}
