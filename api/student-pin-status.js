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
//
// 반별 최소 로스터 모드 — PIN 미설정·허용 학생만, Phase 2b Step 1
// (2026-09-02): { className } 로 호출하면 그 반에서 pin_hash가 아직 없고
// (IS NULL) 관리자가 설정을 허용한(pin_setup_allowed=true) 학생만 최소
// 정보(id,name)로 돌려준다. 반이 존재하지 않으면 빈 배열(존재 여부 노출
// 최소화), 이름이 중복되면 400으로 명시 거부한다. pin_* 컬럼은 이 모드
// 응답에도 절대 실리지 않는다.
import { createClient } from '@supabase/supabase-js'
import { supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'

const MAX_BATCH = 100

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

  const { studentIds, className } = req.body || {}
  const hasStudentIds = studentIds !== undefined
  const hasClassName = className !== undefined
  if (hasStudentIds && hasClassName) {
    res.status(400).json({ error: 'invalid_request' })
    return
  }

  if (hasClassName) {
    const trimmedClassName = typeof className === 'string' ? className.trim() : ''
    if (!trimmedClassName || trimmedClassName.length > 100) {
      res.status(400).json({ error: 'invalid_request' })
      return
    }
    const supabase = createClient(url, key)
    const { data: classRows, error: classErr } = await supabase
      .from('classes')
      .select('id')
      .eq('name', trimmedClassName)
      .limit(2)
    if (classErr) {
      res.status(500).json({ error: classErr.message })
      return
    }
    if (!classRows || classRows.length === 0) {
      // 반이 없다는 사실 자체를 굳이 구별해 알려주지 않는다(존재 여부
      // 노출 최소화) — 그냥 빈 로스터로 응답한다.
      res.status(200).json({ results: [], roster: [] })
      return
    }
    if (classRows.length >= 2) {
      res.status(400).json({ error: 'ambiguous_class' })
      return
    }
    const classId = classRows[0].id
    const { data: studentRows, error: studentErr } = await supabase
      .from('students')
      .select('id,name')
      .eq('class_id', classId)
      .is('pin_hash', null)
      .eq('pin_setup_allowed', true)
      .order('name')
    if (studentErr) {
      res.status(500).json({ error: studentErr.message })
      return
    }
    const roster = (studentRows || [])
      .filter((s) => typeof s.name === 'string' && !s.name.includes('__INACTIVE__') && !s.name.startsWith('QA_'))
      .map((s) => ({ id: s.id, name: s.name }))
    res.status(200).json({ roster })
    return
  }

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400).json({ error: 'studentIds (non-empty array) is required' })
    return
  }
  // [SECURITY 2026-08-29] 배치 상한 — 이 엔드포인트는 로그인 **전** 학생
  // 화면("PIN 만들기")도 쓰기 때문에 세션 토큰을 요구할 수 없다. 대신
  // 한 번에 전수를 훑는 열거를 막는다. 이건 **보조 방어**임을 분명히 해
  // 둔다 — 근본 방어는 self-set-student-pin.js의 setup code다(코드 없이는
  // pinSetupAllowed를 전부 알아내도 아무 권한이 생기지 않는다).
  // 상한 100은 실제 사용량 기준: 한 반 최대 인원보다 훨씬 크고, 관리자
  // 로스터(최대 1157명)는 클라이언트 헬퍼(src/utils/pinStatusApi.js)가
  // 100개씩 쪼개 보내므로 화면 회귀가 없다.
  if (studentIds.length > MAX_BATCH) {
    res.status(400).json({ error: `studentIds must be ${MAX_BATCH} or fewer per request` })
    return
  }

  const supabase = createClient(url, key)
  const { data, error } = await supabase
    .from('students')
    .select('id,pin_hash,pin_setup_allowed,pin_locked_until,pin_fail_count')
    .in('id', studentIds)
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  const now = Date.now()
  // pin_locked_until is a rolling 5-minute window, so `locked` is usually false
  // by the time an admin looks at the roster even when a student has failed
  // attempts stacking up toward the next lockout. hasFailedAttempts (boolean
  // only, never the raw count) lets AdminScreen/StudentDirectory surface the
  // unlock control outside that narrow window too.
  const results = (data || []).map((s) => ({
    id: s.id,
    hasPinHash: !!s.pin_hash,
    pinSetupAllowed: !!s.pin_setup_allowed,
    locked: !!(s.pin_locked_until && new Date(s.pin_locked_until).getTime() > now),
    hasFailedAttempts: (s.pin_fail_count || 0) > 0,
  }))
  res.status(200).json({ results })
}
