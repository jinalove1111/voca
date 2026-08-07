// Vercel Serverless Function — runs server-side, never in the browser.
// P0 identity fix (2026-07-15): students are identified by id (UUID), but
// log in with name+PIN (operator-directed UX simplification — see
// handoff.md). Same pattern as api/verify-admin-pin.js (PIN check happens
// only here, server-side), extended to: (a) resolve possibly-multiple
// same-name candidates (동명이인, now allowed — see
// supabase_v1_6_student_identity.sql) to exactly one by PIN match, and
// (b) enforce a 5-attempt lockout server-side (a client-side counter would
// be trivially bypassable by just not sending it).
//
// 2026-08-06 P0 후속 — PIN 일치 후보가 2개 이상이면 명시적으로 로그인을
// 거부한다(이전엔 find()로 첫 후보를 임의 선택했다). 동명이인은 이름이
// 같아도 PIN이 다를 때만 유일하게 식별 가능하다는 게 이 앱의 전제인데,
// (구버전 클라이언트 anon insert 경로로 인해) 같은 이름 + 같은 PIN인
// 중복 계정이 실제로 생성될 수 있었다(중복 생성 사고 산출물) — 이 경우
// 어느 쪽이 "진짜" 계정인지 서버가 판단할 근거가 없으므로, 첫 후보를
// 임의로 골라 로그인시키면 학생이 남의(또는 자기 과거의) 계정으로
// 들어가 데이터가 갈라지는 사고로 이어진다. 그래서 중복 시엔 로그인
// 자체를 막고 duplicate_accounts를 반환해 관리자 개입을 유도한다.
import { createClient } from '@supabase/supabase-js'
import { isValidPinFormat, verifyPin, supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'

const MAX_FAILS = 5
const LOCK_MINUTES = 5

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

  const { name, pin } = req.body || {}
  const trimmedName = (name || '').trim()
  if (!trimmedName) {
    res.status(200).json({ ok: false, reason: 'not_found' })
    return
  }
  if (!isValidPinFormat(pin)) {
    res.status(200).json({ ok: false, reason: 'invalid_format' })
    return
  }

  const supabase = createClient(url, key)
  // Case-insensitive name match — same rule the old client-side
  // findStudentByName() used (a student retyping "heeja" vs "Heeja" must
  // resolve to the same account). Now may legitimately return MULTIPLE rows
  // (동명이인, different classes) — the PIN, not the name alone, picks one.
  //
  // [SECURITY FIX] ilike wildcard injection — trimmedName is raw user input
  // fed directly into PostgREST's ilike filter, where `%`/`_` are ILIKE
  // metacharacters (`%` = any-substring, `_` = any-char), not literal text.
  // A request like {"name":"%","pin":"1234"} previously matched EVERY
  // student, turning one request into a PIN spray against all ~111
  // accounts, and on failure the code below increments pin_fail_count for
  // every unlocked candidate — i.e. a single crafted request could lock out
  // the entire student body (mass DoS). Escaping `\`, `%`, `_` before the
  // query neutralizes the wildcards while leaving normal name matching
  // (Korean names, spaces, apostrophes, case-insensitivity) unchanged.
  const escapedName = trimmedName.replace(/[\\%_]/g, '\\$&')
  const { data: candidates, error: selErr } = await supabase
    .from('students')
    .select('id,name,class_id,unit_name,pin_hash,pin_fail_count,pin_locked_until,classes(name)')
    .ilike('name', escapedName)
  if (selErr) {
    res.status(500).json({ error: selErr.message })
    return
  }
  if (!candidates || candidates.length === 0) {
    res.status(200).json({ ok: false, reason: 'not_found' })
    return
  }

  const now = Date.now()
  const withPin = candidates.filter((c) => c.pin_hash)
  if (withPin.length === 0) {
    res.status(200).json({ ok: false, reason: 'no_pin_setup' })
    return
  }
  const unlocked = withPin.filter((c) => !c.pin_locked_until || new Date(c.pin_locked_until).getTime() <= now)
  if (unlocked.length === 0) {
    // 후보 전원이 잠김 상태 — 가장 늦게 풀리는 시각을 알려준다.
    const latestUnlock = withPin.reduce((max, c) => {
      const t = c.pin_locked_until ? new Date(c.pin_locked_until).getTime() : 0
      return t > max ? t : max
    }, 0)
    res.status(200).json({ ok: false, reason: 'locked', lockedUntil: new Date(latestUnlock).toISOString() })
    return
  }

  const matches = unlocked.filter((c) => verifyPin(pin, c.pin_hash))
  if (matches.length === 1) {
    const match = matches[0]
    // 성공 — 실패 카운트/잠금 초기화 (그 계정만).
    await supabase.from('students').update({ pin_fail_count: 0, pin_locked_until: null }).eq('id', match.id)
    res.status(200).json({
      ok: true,
      studentId: match.id,
      name: match.name,
      className: match.classes?.name || '',
      unitName: match.unit_name || 'Unit 1',
    })
    return
  }
  if (matches.length >= 2) {
    // 동일 이름 + 동일 PIN 중복 계정 — 위 헤더 주석 참고. 학생 잘못이
    // 아니므로 실패 카운트는 건드리지 않는다. 개인정보(후보 id/반 등)는
    // 응답에 절대 싣지 않는다 — 관리자가 admin-pin-actions.js 등으로 직접
    // 조사해야 한다.
    res.status(200).json({ ok: false, reason: 'duplicate_accounts' })
    return
  }

  // 실패 — 이번에 실제로 시도해본(잠기지 않은, PIN 설정된) 후보들의
  // 실패 카운트를 각각 증가시키고, 5회 도달한 계정은 잠근다. 공격자가
  // 어느 후보가 진짜인지 모르는 상태이므로 전부 증가시키는 게 안전하다.
  let anyLocked = false
  let latestLockedUntil = null
  await Promise.all(unlocked.map(async (c) => {
    const nextFailCount = (c.pin_fail_count || 0) + 1
    const payload = { pin_fail_count: nextFailCount }
    if (nextFailCount >= MAX_FAILS) {
      const lockedUntilIso = new Date(now + LOCK_MINUTES * 60 * 1000).toISOString()
      payload.pin_locked_until = lockedUntilIso
      anyLocked = true
      // 여러 후보가 동시에 잠기는 드문 경우에도(전부 같은 now 기준으로
      // 계산하므로 사실상 항상 동일한 시각) 응답에 실을 값을 안전하게 기록.
      if (!latestLockedUntil || lockedUntilIso > latestLockedUntil) latestLockedUntil = lockedUntilIso
    }
    await supabase.from('students').update(payload).eq('id', c.id)
  }))

  res.status(200).json(anyLocked
    ? { ok: false, reason: 'locked', lockedUntil: latestLockedUntil }
    : { ok: false, reason: 'wrong_pin' })
}
