// Vercel Serverless Function — runs server-side, never in the browser.
// Sets (or resets) one student's login PIN. Two callers:
//   1. AdminScreen.jsx "PIN 재설정" button (existing studentId) — admin may
//      omit `pin` to let the server generate a random 4-digit one, shown to
//      the admin exactly once in the response (never persisted anywhere as
//      plaintext, never logged).
//   2. StudentSelect.jsx self-registration (existing studentId — the row
//      addStudent() just inserted) — the student picks their own 4-digit PIN.
// Only the hash is ever written to Supabase (see api/_pinAuth.js — Node's
// built-in crypto.scrypt, no external dependency).
import { createClient } from '@supabase/supabase-js'
import { isValidPinFormat, hashPin, randomFourDigitPin, supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'

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

  const { studentId, pin } = req.body || {}
  if (!studentId) {
    res.status(400).json({ error: 'studentId is required' })
    return
  }
  let finalPin = pin
  if (finalPin === undefined || finalPin === null || finalPin === '') {
    finalPin = randomFourDigitPin()
  } else if (!isValidPinFormat(finalPin)) {
    res.status(400).json({ error: 'pin must be exactly 4 digits' })
    return
  }

  const supabase = createClient(url, key)
  const pin_hash = hashPin(finalPin)
  const { error } = await supabase
    .from('students')
    .update({ pin_hash, pin_fail_count: 0, pin_locked_until: null })
    .eq('id', studentId)
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  // pin은 이 응답 한 번에만 실려 나간다 — 서버 로그/DB 어디에도 평문으로
  // 남지 않는다(위 hashPin 호출 결과만 저장됨).
  res.status(200).json({ ok: true, pin: finalPin })
}
