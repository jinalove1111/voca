// Vercel Serverless Function — runs server-side, never in the browser.
// Admin-only action — "잠금 해제" button in AdminScreen.jsx's roster.
// Clears pin_fail_count/pin_locked_until WITHOUT touching pin_hash (unlike
// api/set-student-pin.js, which also generates/replaces the PIN itself —
// this is for the case where the admin just wants to lift a lockout and let
// the student keep using the PIN they already know).
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

  const { studentId } = req.body || {}
  if (!studentId) {
    res.status(400).json({ error: 'studentId is required' })
    return
  }

  const supabase = createClient(url, key)
  const { error } = await supabase
    .from('students')
    .update({ pin_fail_count: 0, pin_locked_until: null })
    .eq('id', studentId)
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.status(200).json({ ok: true })
}
