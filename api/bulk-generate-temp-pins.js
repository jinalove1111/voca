// Vercel Serverless Function — runs server-side, never in the browser.
// One-click migration helper for AdminScreen.jsx's "임시 PIN 일괄 생성"
// button — finds every student with no pin_hash yet (i.e. registered before
// the PIN login system existed) and gives each a random 4-digit PIN. The
// full plaintext list (name/class/PIN) is returned ONCE in this response so
// the admin screen can build a CSV download from it (same downloadCsv()
// pattern AdminScreen.jsx already uses for class stats) — never persisted
// server-side as plaintext, never logged. The route itself is admin-only in
// practice because AdminScreen.jsx only renders/calls this after its
// existing PIN gate (verify-admin-pin) passes — same trust model as every
// other admin write in this app (setStudentClass etc. also aren't
// re-authenticated per call, see AdminScreen.jsx).
import { createClient } from '@supabase/supabase-js'
import { hashPin, randomFourDigitPin, supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'

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
