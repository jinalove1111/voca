// Vercel Serverless Function — runs server-side, never in the browser.
// Admin-only action (trust model matches every other admin write in this
// app — gated by AdminScreen.jsx's PIN screen client-side, not re-verified
// per request, same as setStudentClass/removeStudent etc. — see
// api/verify-admin-pin.js for the actual admin gate). Toggles
// students.pin_setup_allowed — "PIN 설정 허용"/"허용 취소" button in
// AdminScreen.jsx's roster, and the (optional) per-class bulk-allow button.
import { createClient } from '@supabase/supabase-js'
import { supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'

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
