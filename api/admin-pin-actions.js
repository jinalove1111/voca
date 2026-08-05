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
// houseSystem.js는 이 저장소의 "순수 계산 모듈"(React/window/document/
// 네트워크 없음) 관례를 따르는 파일이라 api/*(Node 서버리스)에서도 안전하게
// import 가능 — compute-word-king.js가 wordKing.js를, grant-xp.js가
// paulRankShared.js를 같은 방식으로 이미 import하는 기존 패턴 그대로.
// create_student가 wordLibrary.js의 addStudent와 완전히 같은 하우스 자동
// 배정 규칙(가장 인원 적은 하우스, 동률이면 낮은 id)을 쓰기 위해 재구현
// 대신 원본 함수를 그대로 가져온다.
import { assignBalancedHouseId, computeHouseCounts } from '../src/utils/houseSystem.js'

const ALLOWED_ACTIONS = new Set(['bulk_generate_temp_pins', 'set_pin_setup_allowed', 'unlock_student_pin', 'create_student'])

// 2026-08-06 — create_student가 받는 studentId(클라이언트 생성 UUID,
// 멱등성 키)/classId 형식 검증에 공용으로 쓴다.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// wordLibrary.js의 isMissingTableError와 같은 판정 로직을 여기 별도로 둔다
// (그 함수의 자체 헤더 주석 — "api/*(Node 서버리스)는 번들 경계가 달라
// 별도 사본 유지, 억지 공유 금지" 원칙 그대로 따름).
function isMissingTableError(error) {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = String(error.message || '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('schema cache')
}

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

    const { error } = await applyPinSetupAllowed(supabase, ids, allowed)
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  if (action === 'create_student') {
    // 2026-08-06 P0 — 학생 계정 생성을 서버(service_role, 관리자 인가)
    // 전용으로 잠근다. 이 액션 이전엔 학생 생성이 클라이언트 anon insert
    // (wordLibrary.addStudent)로만 가능해 관리자 승인 없이도 누구나(또는
    // 오류가 있는 클라이언트 코드가) 계정을 계속 추가로 생성할 수 있었고,
    // 그 결과 같은 이름+같은 PIN인 중복 계정이 쌓여 verify-student-pin이
    // 첫 후보를 임의 로그인시키는 사고로 이어졌다(위 그 파일의 2026-08-06
    // 헤더 주석 참고). 재발 방지는 (a) 중복 이름 사전 점검(force로 관리자
    // 명시 승인 시만 통과) (b) 클라이언트가 미리 생성한 UUID를 멱등성
    // 키로 받아 네트워크 재시도/중복 제출에도 안전, 두 가지로 달성한다.
    const { studentId, name, classId, unitName, allowPinSetup, force } = req.body || {}

    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
      res.status(200).json({ ok: false, reason: 'invalid_id' })
      return
    }
    const trimmedName = (name || '').trim()
    if (trimmedName.length < 1 || trimmedName.length > 10) {
      res.status(200).json({ ok: false, reason: 'invalid_name' })
      return
    }
    if (typeof classId !== 'string' || !UUID_RE.test(classId)) {
      res.status(200).json({ ok: false, reason: 'invalid_class' })
      return
    }

    // 반이 실존하는지 확인 — units가 0개인 신설 반이어도 classes 행만
    // 있으면 통과시킨다(유닛 배정은 아래에서 별도로 시도, 없으면 null 폴백).
    const { data: classRow, error: classErr } = await supabase
      .from('classes')
      .select('id')
      .eq('id', classId)
      .maybeSingle()
    if (classErr) {
      res.status(500).json({ error: classErr.message })
      return
    }
    if (!classRow) {
      res.status(200).json({ ok: false, reason: 'invalid_class' })
      return
    }

    // 중복 이름 사전 점검 — 로그인 시 후보를 모으는 verify-student-pin.js의
    // ilike 규칙과 정확히 동일(대소문자 무시).
    const { data: dupCandidates, error: dupErr } = await supabase
      .from('students')
      .select('id,class_id,created_at')
      .ilike('name', trimmedName)
    if (dupErr) {
      res.status(500).json({ error: dupErr.message })
      return
    }
    // 멱등 replay 우선 처리 — 응답이 유실된 재시도(같은 studentId로 재요청)면
    // 첫 요청의 insert가 이미 성공했을 수 있고, 그러면 방금 만든 자기 자신의
    // 행이 바로 위 ilike 조회에도 걸려 dupCandidates에 포함된다. 이 경우를
    // "새로운 중복"과 구분하지 않고 그대로 duplicate_name으로 응답하면 이미
    // 끝난 생성 요청인데도 관리자에게 불필요한 중복 확인 UI가 뜬다 — 아래
    // insert 단계의 23505 replay 분기와 같은 목적으로, 여기서도 자기 자신이
    // dup 후보에 있으면 재시도로 판단해 바로 성공 응답한다.
    if (dupCandidates && dupCandidates.some((c) => c.id === studentId)) {
      res.status(200).json({ ok: true, studentId, idempotentReplay: true })
      return
    }
    if (dupCandidates && dupCandidates.length > 0 && force !== true) {
      res.status(200).json({
        ok: false,
        reason: 'duplicate_name',
        existing: dupCandidates.map((c) => ({
          id: c.id,
          classId: c.class_id,
          createdAt: c.created_at,
          sameClass: c.class_id === classId,
        })),
      })
      return
    }

    const finalUnitName = unitName || 'Unit 1'
    const { data: unitRow } = await supabase
      .from('units')
      .select('id')
      .eq('class_id', classId)
      .eq('name', finalUnitName)
      .maybeSingle()
    const unitId = unitRow?.id || null

    // House System 자동 배정 — wordLibrary.addStudent와 정확히 같은
    // 규칙(houseSystem.js 원본 함수 재사용, 위 import 주석 참고).
    const { data: existingStudents, error: hsErr } = await supabase
      .from('students')
      .select('house_id')
    if (hsErr) {
      res.status(500).json({ error: hsErr.message })
      return
    }
    const houseCounts = computeHouseCounts((existingStudents || []).map((s) => ({ houseId: s.house_id })))
    const houseId = assignBalancedHouseId(houseCounts)

    const insertRow = {
      id: studentId,
      name: trimmedName,
      class_id: classId,
      unit_name: finalUnitName,
      current_unit_id: unitId,
      house_id: houseId,
    }
    const { error: insErr } = await supabase.from('students').insert(insertRow)
    if (insErr) {
      if (insErr.code === '23505') {
        // 같은 studentId로 재시도(네트워크 재전송 등) — 그 id 행이 이미
        // 있으면 성공으로 취급(멱등 replay). id가 아닌 다른 제약(예: 구버전
        // UNIQUE(name) 미제거)으로 인한 23505면 select가 빈 결과라 아래
        // 정직 에러 응답으로 자연히 떨어진다.
        const { data: existing, error: selErr } = await supabase
          .from('students')
          .select('id')
          .eq('id', studentId)
          .maybeSingle()
        if (!selErr && existing) {
          res.status(200).json({ ok: true, studentId, idempotentReplay: true })
          return
        }
      }
      res.status(200).json({ ok: false, error: insErr.message })
      return
    }

    // student_class_assignments primary 행 — wordLibrary.addStudent(1226행
    // 인근)과 동일 계약: 실패는 non-fatal(23505/테이블 부재는 무시, 그 외는
    // 콘솔 로그만) — 학생 생성 자체가 이 보조 테이블 때문에 실패하면 안 된다.
    const { error: assignErr } = await supabase.from('student_class_assignments').insert({
      student_id: studentId,
      class_id: classId,
      current_unit_id: unitId,
      is_primary: true,
    })
    if (assignErr && !isMissingTableError(assignErr) && assignErr.code !== '23505') {
      console.warn('[admin-pin-actions] create_student: student_class_assignments primary row insert failed (non-fatal):', assignErr.message)
    }

    if (allowPinSetup === true) {
      const { error: allowErr } = await applyPinSetupAllowed(supabase, [studentId], true)
      if (allowErr) {
        console.warn('[admin-pin-actions] create_student: pin_setup_allowed update failed (non-fatal):', allowErr.message)
      }
    }

    res.status(200).json({ ok: true, studentId })
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

// set_pin_setup_allowed 액션과 create_student(allowPinSetup:true)가 공유하는
// 내부 헬퍼 — 원본 api/set-pin-setup-allowed.js의 업데이트 로직 그대로.
// 이미 pin_hash가 있는 계정을 "허용"으로 켜봤자 self-set-student-pin.js가
// 어차피 거부하지만(방어적 이중 체크), 애초에 pin_hash가 없는 계정만
// 대상으로 하는 게 더 명확하다 — 단 "허용 취소"(allowed:false)는 항상 가능.
async function applyPinSetupAllowed(supabase, ids, allowed) {
  let query = supabase.from('students').update({ pin_setup_allowed: allowed }).in('id', ids)
  if (allowed) query = query.is('pin_hash', null)
  return query
}
