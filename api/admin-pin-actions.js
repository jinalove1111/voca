// Vercel Serverless Function — runs server-side, never in the browser.
// 2026-07-20 — 3개 관리자 전용 PIN 액션(bulk-generate-temp-pins.js,
// set-pin-setup-allowed.js, unlock-student-pin.js)을 파일 1개로 통합.
//
// 통합 사유: Vercel Hobby 플랜은 배포당 서버리스 함수 12개 한도가 있고
// (Vite 등 non-Next 프레임워크는 api/ 파일 1개 = 함수 1개 직접 매핑),
// 이 3개를 포함해 14개 파일이 있어 신규 함수(compute-word-king.js,
// start-new-season.js)가 전혀 배포되지 못하고 있었다(2026-07-20 실측
// 확정 — handoff.md 참고). 이 3개를 고른 이유는 셋 다 정확히 같은 인가
// 경로(아래)를 쓰기 때문 — 보안 리뷰(2026-07-20, security-reviewer
// 에이전트) PASS 판정, handoff.md에 전문 기록.
//
// 통합하지 않은 이유(중요 — 다음 세션이 "김에 더 합치자"고 판단하기 전에
// 반드시 읽을 것): clear-student-pin.js/set-student-pin.js는 이 checkAdminReauth
// 헬퍼를 안 쓰고 adminPin을 인라인으로 직접 비교하거나 학생 자기등록이라는
// 완전히 다른 신뢰 경로를 갖고 있고, self-set-student-pin.js는 관리자
// 인증이 아예 없다(pin_setup_allowed+pin_hash IS NULL DB 재조회로만
// 방어). student-pin-status.js도 인증 없음(민감정보 없는 조회 전용).
// 이들을 이 파일에 합치면 서로 다른 신뢰 경계가 한 dispatcher 안에
// 섞여 권한 상승 버그의 위험이 생긴다 — 절대 합치지 말 것.
//
// 인가 경로(3개 액션 공통, action 분기보다 반드시 먼저 실행):
// checkAdminReauth(req,res) — process.env.ADMIN_PIN과 req.body.adminPin을
// 요청마다 서버에서 재검증(2026-07-16 P7 감사 후속). 실패 시
// { ok:false, reason:'not_authorized' }를 200으로 반환(기존 3개 파일과
// 동일한 응답 계약 — AdminScreen.jsx가 이 reason으로 재로그인 안내).
//
// 각 액션의 요청 필드명/응답 바디 형태는 기존 3개 파일 그대로 보존한다
// (하나의 공통 포맷으로 통일하지 않음 — 통일 시도는 보안 리뷰가 명시적으로
// 금지한 항목). 특히 bulk_generate_temp_pins의 성공 응답에는 ok 필드가
// 없다(원래도 없었음, { count, results }만 반환) — AdminScreen.jsx의
// handleBulkGeneratePins가 data.ok를 아예 안 보고 data.results/data.count만
// 쓰므로 그대로 유지해야 한다.
import { createClient } from '@supabase/supabase-js'
import { hashPin, randomFourDigitPin, checkAdminReauth, supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'

const ALLOWED_ACTIONS = new Set(['bulk_generate_temp_pins', 'set_pin_setup_allowed', 'unlock_student_pin'])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // 인가가 액션 분기보다 먼저 — 어떤 action 값을 보내든(존재/미존재
  // 불문) adminPin이 틀리면 항상 같은 not_authorized로 거부된다. 이렇게
  // 해야 미인증 요청이 action 값을 바꿔가며 "어떤 액션이 존재하는지"를
  // 탐지할 수 없다(보안 리뷰 필수 조건).
  if (!checkAdminReauth(req, res)) return

  const url = supabaseAdminUrl()
  const key = supabaseAdminKey()
  if (!url || !key) {
    res.status(500).json({ error: 'Server not configured: SUPABASE_URL / key missing' })
    return
  }

  const { action } = req.body || {}
  if (typeof action !== 'string' || action.length === 0) {
    res.status(400).json({ error: 'action is required' })
    return
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    res.status(400).json({ error: `unknown action: ${action}` })
    return
  }

  const supabase = createClient(url, key)

  if (action === 'bulk_generate_temp_pins') {
    // 원본: api/bulk-generate-temp-pins.js. PIN 로그인 도입 전 등록돼
    // pin_hash가 아직 없는 학생 전원에게 무작위 4자리 PIN을 부여하고,
    // 평문 목록을 이 응답 1회에만 실어 CSV 다운로드용으로 반환한다 —
    // 서버에는 해시만 저장, 평문은 어디에도 남지 않는다.
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
    return
  }

  if (action === 'set_pin_setup_allowed') {
    // 원본: api/set-pin-setup-allowed.js. students.pin_setup_allowed
    // 토글 — PIN 자기설정 창구를 여는 액션이라 관리자 재인증 필수.
    const { studentIds, allowed } = req.body || {}
    const ids = Array.isArray(studentIds) ? studentIds : (studentIds ? [studentIds] : [])
    if (ids.length === 0 || typeof allowed !== 'boolean') {
      res.status(400).json({ error: 'studentIds (id or array) and allowed (boolean) are required' })
      return
    }

    // 이미 pin_hash가 있는 계정을 "허용"으로 켜봤자 self-set-student-pin.js가
    // 어차피 거부하지만(방어적 이중 체크), 애초에 pin_hash가 없는 계정만
    // 대상으로 하는 게 더 명확하다 — 단 "허용 취소"(allowed:false)는 항상 가능.
    let query = supabase.from('students').update({ pin_setup_allowed: allowed }).in('id', ids)
    if (allowed) query = query.is('pin_hash', null)
    const { error } = await query
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  if (action === 'unlock_student_pin') {
    // 원본: api/unlock-student-pin.js. pin_fail_count/pin_locked_until만
    // 초기화(pin_hash는 안 건드림) — 브루트포스 방어(5회 잠금)를
    // 무력화하는 액션이라 관리자 재인증 필수.
    const { studentId } = req.body || {}
    if (!studentId) {
      res.status(400).json({ error: 'studentId is required' })
      return
    }

    const { error } = await supabase
      .from('students')
      .update({ pin_fail_count: 0, pin_locked_until: null })
      .eq('id', studentId)
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({ ok: true })
    return
  }
}
