// Vercel Serverless Function — runs server-side, never in the browser.
// Returns PIN status (booleans only — never the raw pin_hash) for a batch
// of student ids: whether a PIN is already set, whether self-setup is
// currently allowed, and whether the account is currently locked out. Used
// by:
//   - StudentSelect.jsx's "PIN 만들기" flow, to decide what to show after a
//     student picks their name from the class roster (already-set →
//     "로그인 탭을 쓰세요", not-allowed → "선생님께 요청하세요", allowed →
//     show the PIN creation form).
//   - AdminScreen.jsx's student roster, to show a 미설정/설정됨/잠김 badge
//     per student without ever fetching pin_hash into the client.
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

  const { studentIds } = req.body || {}
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400).json({ error: 'studentIds (non-empty array) is required' })
    return
  }

  const supabase = createClient(url, key)
  const { data, error } = await supabase
    .from('students')
    .select('id,pin_hash,pin_setup_allowed,pin_locked_until')
    .in('id', studentIds)
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  const now = Date.now()
  const results = (data || []).map((s) => ({
    id: s.id,
    hasPinHash: !!s.pin_hash,
    pinSetupAllowed: !!s.pin_setup_allowed,
    locked: !!(s.pin_locked_until && new Date(s.pin_locked_until).getTime() > now),
  }))
  res.status(200).json({ results })
}
