// Vercel Serverless Function — runs server-side, never in the browser.
// Sets (or resets) one student's login PIN. Two callers with DIFFERENT
// trust levels (2026-07-16 P7 감사 후속으로 분리):
//   1. AdminScreen.jsx "PIN 재설정" button — `pin`을 생략하면 서버가 무작위
//      4자리를 생성해 응답에 딱 1번 실어준다. 기존 PIN을 덮어쓰는(=계정
//      탈취가 가능한) 경로이므로 요청마다 ADMIN_PIN 재검증 필수
//      (clear-student-pin.js와 동일 패턴, body.adminPin).
//   2. StudentSelect.jsx self-registration — addStudent()가 방금 insert한
//      "아직 PIN이 없는" 자기 row에 학생이 고른 PIN을 최초 1회 설정.
//      학생에겐 관리자 PIN이 없으므로 재인증 없이 허용하되, 서버에서
//      대상 row의 pin_hash IS NULL을 반드시 확인한다 — 이미 PIN이 있는
//      학생의 PIN은 이 경로로 절대 덮어쓸 수 없다(익명 fetch로 임의
//      studentId의 PIN을 갈아끼우는 계정 탈취 차단). self-set-student-pin.js
//      의 "DB에서 다시 조회해 확인" 원칙과 동일.
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

  const { studentId, pin, adminPin } = req.body || {}
  if (!studentId) {
    res.status(400).json({ error: 'studentId is required' })
    return
  }

  // 관리자 재인증 — ADMIN_PIN이 서버에 설정돼 있고 body.adminPin이 정확히
  // 일치할 때만. (ADMIN_PIN 미설정 서버에서는 관리자 경로가 성립할 수 없을
  // 뿐, 학생 자기등록 경로는 아래에서 계속 동작한다.)
  const configuredAdminPin = process.env.ADMIN_PIN
  const adminAuthed = !!configuredAdminPin && typeof adminPin === 'string' && adminPin === configuredAdminPin

  let finalPin = pin
  if (finalPin === undefined || finalPin === null || finalPin === '') {
    // 무작위 재설정은 관리자 전용 — 익명 호출이 임의 학생의 새 PIN을
    // 응답으로 받아가는 것을 차단.
    if (!adminAuthed) {
      res.status(200).json({ ok: false, reason: 'not_authorized', error: '관리자 인증이 필요해요.' })
      return
    }
    finalPin = randomFourDigitPin()
  } else if (!isValidPinFormat(finalPin)) {
    res.status(400).json({ error: 'pin must be exactly 4 digits' })
    return
  }

  const supabase = createClient(url, key)

  if (!adminAuthed) {
    // 자기등록 경로: 대상 학생이 실존하고 아직 PIN이 없어야만 허용.
    const { data: student, error: selErr } = await supabase
      .from('students')
      .select('id,pin_hash')
      .eq('id', studentId)
      .maybeSingle()
    if (selErr) {
      res.status(500).json({ error: selErr.message })
      return
    }
    if (!student) {
      res.status(200).json({ ok: false, reason: 'not_found', error: '학생을 찾을 수 없어요.' })
      return
    }
    if (student.pin_hash) {
      res.status(200).json({ ok: false, reason: 'already_set', error: '이미 PIN이 설정된 학생이에요. 선생님께 PIN 재설정을 요청해주세요.' })
      return
    }
  }

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
