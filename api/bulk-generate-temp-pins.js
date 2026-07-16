// Vercel Serverless Function — runs server-side, never in the browser.
// One-click migration helper for AdminScreen.jsx's "임시 PIN 일괄 생성"
// button — finds every student with no pin_hash yet (i.e. registered before
// the PIN login system existed) and gives each a random 4-digit PIN. The
// full plaintext list (name/class/PIN) is returned ONCE in this response so
// the admin screen can build a CSV download from it (same downloadCsv()
// pattern AdminScreen.jsx already uses for class stats) — never persisted
// server-side as plaintext, never logged.
//
// 2026-07-16 P7 감사 후속: 예전엔 클라이언트 사이드 게이트(AdminScreen의
// authed=true)만 믿고 요청당 재인증이 없었다 — 이 응답은 "학생 전원의 평문
// 임시 PIN"이라 이 앱에서 가장 유출 파괴력이 큰 응답이므로, clear-student-
// pin.js와 동일하게 요청마다 서버에서 ADMIN_PIN을 재검증한다
// (checkAdminReauth). 평문 PIN을 응답에 싣는 것 자체는 기능상 필요
// (CSV 1회 배포용)해서 유지 — 단 이제 관리자 재인증 뒤에서만.
import { createClient } from '@supabase/supabase-js'
import { hashPin, randomFourDigitPin, checkAdminReauth, supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'

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

  const supabase = createClient(url, key)
  const { data: targets, error: selErr } = await supabase
    .from('students')
    .select('id,name,unit_name,classes(name)')
    .is('pin_hash', null)
  if (selErr) {
    res.status(500).json({ error: selErr.message })
    return
  }

  const results = []
  for (const s of targets || []) {
    const pin = randomFourDigitPin()
    const pin_hash = hashPin(pin)
    const { error: updErr } = await supabase
      .from('students')
      .update({ pin_hash, pin_fail_count: 0, pin_locked_until: null })
      .eq('id', s.id)
    if (updErr) {
      results.push({ id: s.id, name: s.name, className: s.classes?.name || '', error: updErr.message })
      continue
    }
    results.push({ id: s.id, name: s.name, className: s.classes?.name || '', unitName: s.unit_name || '', pin })
  }

  res.status(200).json({ count: results.length, results })
}
