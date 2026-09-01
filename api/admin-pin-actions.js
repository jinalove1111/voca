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
import { hashPin, randomFourDigitPin, checkAdminReauth, supabaseAdminUrl, supabaseAdminKey, pinSetupCode, pinSetupCodeExpiresAt } from './_pinAuth.js'
// houseSystem.js는 이 저장소의 "순수 계산 모듈"(React/window/document/
// 네트워크 없음) 관례를 따르는 파일이라 api/*(Node 서버리스)에서도 안전하게
// import 가능 — compute-word-king.js가 wordKing.js를, grant-xp.js가
// paulRankShared.js를 같은 방식으로 이미 import하는 기존 패턴 그대로.
// create_student가 wordLibrary.js의 addStudent와 완전히 같은 하우스 자동
// 배정 규칙(가장 인원 적은 하우스, 동률이면 낮은 id)을 쓰기 위해 재구현
// 대신 원본 함수를 그대로 가져온다.
import { assignBalancedHouseId, computeHouseCounts } from '../src/utils/houseSystem.js'

const ALLOWED_ACTIONS = new Set([
  'bulk_generate_temp_pins',
  'set_pin_setup_allowed',
  'unlock_student_pin',
  'create_student',
  'deactivate_student',
  'reactivate_student',
  'hard_delete_student',
  // 2026-08-30 — 확인코드 "조회 전용" 액션(아래 handler 본문 주석 참고).
  // 이 파일에 추가하는 이유도 위와 동일한 12함수 한도(파일 상단 주석).
  'get_pin_setup_code',
])

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

// 2026-08-08 — create_student가 students.house_id(v2.7 House System,
// 게임화 컬럼)를 다루다 프로덕션에 이 컬럼이 아직 없어(42703 실측 확정)
// 500으로 죽던 문제 수정용 헬퍼. columnName을 넘기면 메시지에 그 컬럼명이
// 포함된 "does not exist"만 매칭해 house_id 컬럼 부재와 무관한 다른
// "does not exist" 에러(예: 다른 테이블/컬럼)를 잘못 삼키지 않게 한다.
function isMissingColumnError(error, columnName) {
  if (!error) return false
  if (error.code === '42703') return true
  const msg = String(error.message || '').toLowerCase()
  if (!msg.includes('does not exist')) return false
  return columnName ? msg.includes(String(columnName).toLowerCase()) : true
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
    // [SECURITY 2026-08-29] 허용을 열 때만 1회용 setup code를 함께 발급한다.
    // 학생은 이 코드가 있어야 self-set-student-pin으로 PIN을 만들 수 있다
    // (관리자가 학생에게 구두 전달). 코드는 SESSION_SECRET에서 파생하므로
    // 저장하지 않고, 유효기간은 최대 20분이며, 성공 시 pin_hash 전이로
    // 자동 소모된다. 이 응답은 ADMIN_PIN 재인증을 통과한 요청에만 도달한다
    // (인가 검사가 action 분기보다 앞에 있다 — 이 파일 상단 주석 참고).
    // 회수(allowed=false) 시에는 발급하지 않는다.
    if (allowed) {
      const expiresAt = pinSetupCodeExpiresAt()
      const setupCodes = ids
        .map((id) => ({ studentId: id, code: pinSetupCode(id), expiresAt }))
        .filter((c) => c.code)
      res.status(200).json({ ok: true, setupCodes })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  if (action === 'get_pin_setup_code') {
    // [SECURITY 2026-08-30] 확인코드 "조회 전용" 액션. 지금까지 확인코드를
    // 볼 수 있는 유일한 경로가 위 set_pin_setup_allowed(허용 토글) 응답
    // 1회뿐이었다 — StudentDirectory.jsx가 그 응답을 setupCodeNotice로
    // 잠깐 띄우는데, 닫거나 새로고침하면 다시 볼 방법이 없어 "이 학생
    // 코드 뭐였지?"에 답할 UI가 없었다(실 운영에서 막힘). 이 액션은
    // pin_setup_allowed를 절대 켜지 않고(SELECT만, students UPDATE 0회),
    // 이미 관리자가 허용해 둔 학생의 코드를 다시 파생해 보여주기만 한다 —
    // pinSetupCode는 SESSION_SECRET+studentId+시간버킷의 순수 함수라
    // 저장 없이 몇 번이든 안전하게 재계산할 수 있다(위 set_pin_setup_allowed
    // 발급과 동일한 값). "새 코드 발급" 개념이 아니라 "이미 존재하는
    // (버킷 유효기간 내) 코드를 다시 읽기"이므로 UPDATE가 필요 없다.
    //
    // 별도 파일(api/get-pin-setup-code.js)로 만들지 않는 이유: Vercel Hobby
    // 배포당 서버리스 함수 12개 한도(이 파일 상단 헤더 주석, 2026-07-20
    // 실측 확정)를 이미 꽉 채우고 있어 파일 1개만 늘어도 배포 자체가 깨진다
    // — 그래서 이 통합 dispatcher에 조회 전용 action으로 추가한다.
    const { studentId } = req.body || {}
    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
      res.status(200).json({ ok: false, reason: 'invalid_id' })
      return
    }
    const { data: target, error: selErr } = await supabase
      .from('students')
      .select('id,name,pin_hash,pin_setup_allowed')
      .eq('id', studentId)
      .maybeSingle()
    if (selErr) {
      res.status(200).json({ ok: false, error: selErr.message })
      return
    }
    if (!target) {
      res.status(200).json({ ok: false, reason: 'not_found' })
      return
    }
    // 규칙 11 — pin_hash는 존재 여부(truthy 판정)로만 쓰고 응답에는 절대
    // 싣지 않는다. 이미 PIN이 있는 학생에게 확인코드를 보여줄 이유도 없다
    // (그 코드로는 self-set-student-pin.js가 already_set으로 거부한다).
    if (target.pin_hash) {
      res.status(200).json({ ok: false, reason: 'already_set' })
      return
    }
    if (target.pin_setup_allowed !== true) {
      res.status(200).json({ ok: false, reason: 'not_allowed' })
      return
    }
    const code = pinSetupCode(studentId)
    if (!code) {
      // SESSION_SECRET 미설정 — fail-closed(9b 시나리오와 동일 원칙: 코드가
      // 새어나가지 않고, 원인을 관리자가 진단할 수 있게 reason을 구분한다).
      res.status(200).json({ ok: false, reason: 'no_secret' })
      return
    }
    res.status(200).json({ ok: true, studentId, name: target.name, code, expiresAt: pinSetupCodeExpiresAt() })
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
    const { studentId, name, classId, unitName, textbookId, allowPinSetup, force } = req.body || {}

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

    // [2026-09-01 P1 버그수정 — 신규 학생 유닛이 "반" 기준으로 추론되던 문제]
    // 예전 코드는 units.class_id = <사람 반> 으로 유닛을 찾았는데, 유닛은
    // 교재 컨테이너 반에 귀속되므로(2026-08-07 확정: 반과 교재는 독립,
    // 같은 반 학생이라도 다른 교재를 공부할 수 있다) 유닛을 소유하지 않는
    // regular 반에서는 항상 null이 됐다 — 2026-08-31 박민준·박성준이 정확히
    // 이 경로로 current_unit_id/textbook_id 둘 다 NULL인 "껍데기 배정"으로
    // 생성돼 health:students UNIT_INVALID FAIL -> Release Gate 차단으로
    // 이어진 실사고(데이터는 v3_41로 수동 복구, 이 수정이 코드 재발 방지).
    //
    // 새 규칙: 요청의 textbookId(학생별 primary 교재) -> 그 교재의 유닛에서
    // 확정한다. 회귀 테스트: scripts/testCreateStudentUnitAssignment.mjs.
    //   · textbookId가 오면: 실존 + (반 소유이거나 class_textbooks enabled
    //     연결) 검증 — 아니면 fail-closed 거부(invalid_textbook).
    //   · 없으면: 반이 소유한 교재가 정확히 1개일 때만 그 교재로 폴백
    //     (컨테이너 반 하위호환). regular 반은 연결 교재가 여럿일 수 있어
    //     절대 추측하지 않는다(다수결 배정 금지 — 운영자 원칙). 이 경우
    //     기존과 동일하게 unit null로 생성되고, 이후 교재 배정(setPrimary
    //     Textbook)이 유닛을 확정한다.
    let resolvedTextbookId = null
    if (textbookId != null && textbookId !== '') {
      if (typeof textbookId !== 'string' || !UUID_RE.test(textbookId)) {
        res.status(200).json({ ok: false, reason: 'invalid_textbook' })
        return
      }
      const { data: tbRow, error: tbErr } = await supabase
        .from('textbooks')
        .select('id,owner_class_id')
        .eq('id', textbookId)
        .maybeSingle()
      if (tbErr) {
        res.status(500).json({ error: tbErr.message })
        return
      }
      let allowed = tbRow?.owner_class_id === classId
      if (tbRow && !allowed) {
        const { data: linkRow, error: linkErr } = await supabase
          .from('class_textbooks')
          .select('textbook_id')
          .eq('class_id', classId)
          .eq('textbook_id', textbookId)
          .eq('enabled', true)
          .maybeSingle()
        if (linkErr) {
          res.status(500).json({ error: linkErr.message })
          return
        }
        allowed = !!linkRow
      }
      if (!tbRow || !allowed) {
        res.status(200).json({ ok: false, reason: 'invalid_textbook' })
        return
      }
      resolvedTextbookId = tbRow.id
    } else {
      // 반 소유 교재가 정확히 1개일 때만 폴백(그 외엔 null 유지, non-fatal —
      // 이 조회가 실패해도 학생 생성 자체는 기존 동작대로 계속된다).
      const { data: ownTbs, error: ownErr } = await supabase
        .from('textbooks')
        .select('id')
        .eq('owner_class_id', classId)
        .limit(2)
      if (!ownErr && Array.isArray(ownTbs) && ownTbs.length === 1) resolvedTextbookId = ownTbs[0].id
    }

    // 유닛 확정 — 교재가 정해졌으면 그 교재의 유닛에서만 찾는다.
    //   ① 호출자가 unitName을 명시했으면: 완전일치 -> 정규화 유일후보
    //     (wordLibrary.findUnitByName과 동일 규칙 — "Unit 3"≡"Unit3").
    //   ② 명시가 없으면: "실제 첫 학습 유닛" = position/이름 정렬 순서에서
    //     단어가 2개 이상인 첫 유닛. 유령 유닛(엑셀 헤더 잔재)은 정확히
    //     1단어라 구조적으로 제외된다(v3_41 STEP0-③과 동일 근거). 이는
    //     2026-08-29에 금지된 "조용한 첫 유닛 폴백"(기존 학생의 저장 유닛
    //     해석)과 다르다 — 진도가 아직 없는 신규 학생의 시작점 정책이다.
    //     학습 가능한 유닛이 하나도 없으면 null(추측 금지, 생성은 성공).
    let unitId = null
    let resolvedUnitName = unitName || 'Unit 1'
    let tbUnitLookupFailed = false
    if (resolvedTextbookId) {
      const { data: tbUnits, error: unitsErr } = await supabase
        .from('units')
        .select('id,name,position')
        .eq('textbook_id', resolvedTextbookId)
      if (unitsErr || !Array.isArray(tbUnits)) {
        // units.textbook_id 컬럼 부재(v3.1 이전 스키마) 등 — 아래 레거시
        // class_id 경로로 폴백(규칙 9: 마이그레이션 순서 무관 안전).
        tbUnitLookupFailed = true
      } else if (tbUnits.length > 0) {
        const { data: wordRows, error: wErr } = await supabase
          .from('words')
          .select('unit_id')
          .in('unit_id', tbUnits.map((u) => u.id))
        const countByUnit = new Map()
        if (!wErr) for (const w of wordRows || []) countByUnit.set(w.unit_id, (countByUnit.get(w.unit_id) || 0) + 1)
        const sorted = [...tbUnits].sort((a, b) =>
          ((a.position ?? Infinity) - (b.position ?? Infinity)) ||
          String(a.name).localeCompare(String(b.name), undefined, { numeric: true }) ||
          String(a.id).localeCompare(String(b.id)))
        const normKey = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, '')
        let unit = null
        if (typeof unitName === 'string' && unitName.trim() !== '') {
          unit = sorted.find((u) => u.name === unitName) || null
          if (!unit) {
            const candidates = sorted.filter((u) => normKey(u.name) === normKey(unitName))
            if (candidates.length === 1) unit = candidates[0]
          }
          // 2026-09-02(유령 유닛 셀렉터 노출 봉합 후속) — 명시 unitName 매칭이
          // 성공해도 그 유닛의 단어가 2개 미만이면(엑셀 헤더 잔재 유령/빈
          // 유닛) 채택하지 않고 아래 자동 경로(단어>=2 첫 유닛)로 폴백한다.
          // 실사고 경로: 관리자 생성 폼의 폴백 문자열 'Unit 1'이 정규화
          // 유일후보로 유령 "Unit1"(1단어)에 매칭될 수 있었다(단어 수
          // 검증 없이 채택). wErr(단어 조회 자체 실패)면 과차단 금지
          // 원칙대로 필터하지 않는다(기존 동작 유지).
          if (unit && !wErr && (countByUnit.get(unit.id) || 0) < 2) unit = null
        }
        if (!unit && !wErr) unit = sorted.find((u) => (countByUnit.get(u.id) || 0) >= 2) || null
        if (unit) {
          unitId = unit.id
          resolvedUnitName = unit.name
        }
      }
    }
    if (unitId == null && (!resolvedTextbookId || tbUnitLookupFailed)) {
      // 레거시 경로(변경 전과 동일) — 교재를 못 정한 경우의 하위호환 전용.
      // 컨테이너 반(units.class_id 보유)에서는 예전처럼 동작한다.
      const { data: unitRow } = await supabase
        .from('units')
        .select('id')
        .eq('class_id', classId)
        .eq('name', resolvedUnitName)
        .maybeSingle()
      unitId = unitRow?.id || null
    }
    const finalUnitName = resolvedUnitName

    // House System 자동 배정 — wordLibrary.addStudent와 정확히 같은
    // 규칙(houseSystem.js 원본 함수 재사용, 위 import 주석 참고).
    // 2026-08-08 — house_id는 v2.7(House System, 아직 미배포 게임화) 컬럼이라
    // 프로덕션 DB에 컬럼 자체가 없다(42703 실측 확정). 컬럼 부재를 500으로
    // 올리지 않고 house 배정만 조용히 스킵한다(houseId=null) — 그 외 에러는
    // 기존대로 500. 컬럼이 나중에 추가되면(v2.7 SQL 적용) 이 분기를 안 타고
    // 정상적으로 house가 배정된다.
    let houseId = null
    const { data: existingStudents, error: hsErr } = await supabase
      .from('students')
      .select('house_id')
    if (hsErr) {
      if (!isMissingColumnError(hsErr, 'house_id')) {
        res.status(500).json({ error: hsErr.message })
        return
      }
      // house_id 컬럼 부재 — houseId는 null인 채로 계속 진행.
    } else {
      const houseCounts = computeHouseCounts((existingStudents || []).map((s) => ({ houseId: s.house_id })))
      houseId = assignBalancedHouseId(houseCounts)
    }

    const baseRow = {
      id: studentId,
      name: trimmedName,
      class_id: classId,
      unit_name: finalUnitName,
    }
    // wordLibrary.js addStudent(1407~1417)와 동일한 3단계 cascading 폴백 —
    // v2.1(current_unit_id)과 v2.7(house_id)은 서로 다른 마이그레이션이라
    // 어느 한쪽만 적용된 환경이 있을 수 있다. 전부 아니면 bare 한 방 시도면
    // house_id 컬럼만 없어도 이미 적용된 current_unit_id까지 못 쓰게 되는
    // 회귀가 생긴다 — 그래서 ①전체 → ②current_unit_id만 → ③baseRow만
    // 순서로 재시도한다. 23505(멱등 replay 대상)면 재시도 없이 즉시 빠진다.
    let { error: insErr } = await supabase
      .from('students')
      .insert({ ...baseRow, current_unit_id: unitId, house_id: houseId })
    if (insErr && insErr.code !== '23505') {
      ;({ error: insErr } = await supabase
        .from('students')
        .insert({ ...baseRow, current_unit_id: unitId }))
    }
    if (insErr && insErr.code !== '23505') {
      ;({ error: insErr } = await supabase.from('students').insert(baseRow))
    }
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
    // 2026-09-01 — textbook_id를 함께 기록한다(위 P1 수정의 나머지 절반:
    // 예전엔 이 컬럼을 아예 안 넣어 항상 NULL "껍데기"였다). v3.1 이전
    // 스키마(컬럼 부재 42703)면 기존 컬럼 구성으로 재시도(규칙 9).
    let { error: assignErr } = await supabase.from('student_class_assignments').insert({
      student_id: studentId,
      class_id: classId,
      current_unit_id: unitId,
      is_primary: true,
      textbook_id: resolvedTextbookId,
    })
    if (assignErr && isMissingColumnError(assignErr, 'textbook_id')) {
      ;({ error: assignErr } = await supabase.from('student_class_assignments').insert({
        student_id: studentId,
        class_id: classId,
        current_unit_id: unitId,
        is_primary: true,
      }))
    }
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

  if (action === 'deactivate_student') {
    // 2026-08-08 — 학생 완전삭제 대신 "비활성화"만 원하는 관리자용 액션.
    // students 스키마에 soft-delete 컬럼이 없고(실측 확정) name 컬럼은
    // anon UPDATE가 막혀 있어, 로스터 정리 스크립트가 써온 것과 동일하게
    // service_role로 name만 `__INACTIVE__` 접미를 붙여 rename한다. name
    // 외 컬럼(class_id/pin_hash/current_unit_id/별/word_status/progress/
    // student_class_assignments 등)은 전혀 건드리지 않으므로 재활성화 시
    // 자동 복원된다. 기존 필터(로그인 후보 조회/PIN 자기설정/관리자 목록)는
    // 이미 이름에 _inactive가 포함된 계정을 제외하고 있어 별도 스키마
    // 변경 없이 즉시 로그인/목록에서 숨겨진다.
    const { studentId } = req.body || {}
    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
      res.status(200).json({ ok: false, reason: 'invalid_id' })
      return
    }

    const { data: target, error: selErr } = await supabase
      .from('students')
      .select('id,name')
      .eq('id', studentId)
      .maybeSingle()
    if (selErr) {
      res.status(200).json({ ok: false, error: selErr.message })
      return
    }
    if (!target) {
      res.status(200).json({ ok: false, reason: 'not_found' })
      return
    }

    // 멱등 — 이미 비활성 표기(이 액션의 __INACTIVE__ 접미든, 로스터 정리의
    // _DUP_..._INACTIVE 형식이든)면 재작업 없이 현재 이름 그대로 성공 응답.
    if (/_inactive/i.test(target.name || '')) {
      res.status(200).json({ ok: true, alreadyInactive: true, name: target.name })
      return
    }

    const newName = `${target.name}__INACTIVE__`
    const { error: updErr } = await supabase
      .from('students')
      .update({ name: newName }) // name만 변경 — 별/progress/class_id/pin 등 무접촉
      .eq('id', studentId)
    if (updErr) {
      res.status(200).json({ ok: false, error: updErr.message })
      return
    }
    res.status(200).json({ ok: true, newName })
    return
  }

  if (action === 'reactivate_student') {
    // deactivate_student의 역연산. 이 액션이 만든 정확한 `__INACTIVE__`
    // 접미만 되돌린다 — 로스터 정리가 남긴 `_DUP_..._INACTIVE`처럼 더 복잡한
    // 이름 형식은 "원래 이름"이 무엇인지 이 액션이 함부로 추측하면 위험하므로
    // 명시적으로 거부한다(no_clean_marker). name 외에는 애초에 deactivate가
    // 손대지 않았으므로 이름만 복원하면 pin/별/progress/word_status/unit/
    // textbook은 자동으로 이미 그대로 살아있다.
    const { studentId } = req.body || {}
    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
      res.status(200).json({ ok: false, reason: 'invalid_id' })
      return
    }

    const { data: target, error: selErr } = await supabase
      .from('students')
      .select('id,name')
      .eq('id', studentId)
      .maybeSingle()
    if (selErr) {
      res.status(200).json({ ok: false, error: selErr.message })
      return
    }
    if (!target) {
      res.status(200).json({ ok: false, reason: 'not_found' })
      return
    }

    const name = target.name || ''
    const SUFFIX = '__INACTIVE__'
    if (!name.endsWith(SUFFIX)) {
      res.status(200).json({ ok: false, reason: 'no_clean_marker', name })
      return
    }

    const restoredName = name.slice(0, -SUFFIX.length)
    const { error: updErr } = await supabase
      .from('students')
      .update({ name: restoredName }) // name만 변경
      .eq('id', studentId)
    if (updErr) {
      res.status(200).json({ ok: false, error: updErr.message })
      return
    }
    res.status(200).json({ ok: true, name: restoredName })
    return
  }

  if (action === 'hard_delete_student') {
    // 2026-08-08 — 완전삭제. "데이터 0인 계정만" 삭제 가능하도록 클라이언트가
    // 보낸 studentId만 믿지 않고 서버가 직접 모든 조건을 재검증한다(신뢰
    // 경계를 서버 안쪽으로 유지 — 클라이언트가 이미 확인했다고 주장해도
    // 재확인 없이는 삭제 실행 안 함). 조건 중 하나라도 데이터가 남아있으면
    // has_data로 차단한다. 이 세션에서는 액션 구현만 하고 실제 실행/호출은
    // 하지 않는다(운영자 지시).
    const { studentId } = req.body || {}
    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
      res.status(200).json({ ok: false, reason: 'invalid_id' })
      return
    }

    const { data: target, error: existErr } = await supabase
      .from('students')
      .select('id')
      .eq('id', studentId)
      .maybeSingle()
    if (existErr) {
      res.status(200).json({ ok: false, error: existErr.message })
      return
    }
    if (!target) {
      res.status(200).json({ ok: false, reason: 'not_found' })
      return
    }

    // word_status count — 테이블 자체가 없는 환경이면(방어적) 0으로 취급.
    let wordStatusCount = 0
    {
      const { count, error } = await supabase
        .from('word_status')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
      if (error && !isMissingTableError(error)) {
        res.status(200).json({ ok: false, error: error.message })
        return
      }
      wordStatusCount = count || 0
    }

    // student_progress — 행이 아예 없거나, 있어도 total_stars/total_xp가
    // 둘 다 0이면 "데이터 없음"으로 취급.
    let hasProgressData = false
    {
      const { data, error } = await supabase
        .from('student_progress')
        .select('total_stars,total_xp')
        .eq('student_id', studentId)
        .maybeSingle()
      if (error && !isMissingTableError(error)) {
        res.status(200).json({ ok: false, error: error.message })
        return
      }
      if (data) {
        hasProgressData = (data.total_stars || 0) !== 0 || (data.total_xp || 0) !== 0
      }
    }

    // pin_hash IS NULL 여부 — 규칙 11: 값 자체는 절대 SELECT하지 않고, is
    // null 조건으로 head 카운트만 조회해 boolean만 도출한다(평문/해시
    // 어느 쪽도 응답에 포함되지 않음).
    let hasPin = false
    {
      const { count, error } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('id', studentId)
        .is('pin_hash', null)
      if (error) {
        res.status(200).json({ ok: false, error: error.message })
        return
      }
      // count===1이면 pin_hash가 null(=PIN 미설정) → hasPin=false.
      hasPin = (count || 0) === 0
    }

    // student_daily_progress count
    let dailyCount = 0
    {
      const { count, error } = await supabase
        .from('student_daily_progress')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
      if (error && !isMissingTableError(error)) {
        res.status(200).json({ ok: false, error: error.message })
        return
      }
      dailyCount = count || 0
    }

    // spelling_review_queue count — "(있으면) ... 등도 0" 요건, 테이블
    // 부재 환경은 방어적으로 0 취급.
    let spellingQueueCount = 0
    {
      const { count, error } = await supabase
        .from('spelling_review_queue')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
      if (error && !isMissingTableError(error)) {
        res.status(200).json({ ok: false, error: error.message })
        return
      }
      spellingQueueCount = count || 0
    }

    const detail = {
      word_status: wordStatusCount,
      stars: hasProgressData,
      hasPin,
      daily: dailyCount,
      spellingQueue: spellingQueueCount,
    }
    if (wordStatusCount > 0 || hasProgressData || hasPin || dailyCount > 0 || spellingQueueCount > 0) {
      res.status(200).json({ ok: false, reason: 'has_data', detail })
      return
    }

    // 전부 0 — FK 순서(자식→부모)대로 삭제: student_class_assignments →
    // students. student_class_assignments는 v2.9(코드 배포 완료/SQL 미실행
    // 가능성 있는 테이블, DATABASE.md 참고)라 부재 시 non-fatal로 스킵한다
    // (students(id) 자체 FK가 on delete cascade라 실제로는 자동 정리되지만,
    // 명시적 삭제로 순서를 지키는 게 이 액션의 의도된 계약).
    const { error: scaErr } = await supabase
      .from('student_class_assignments')
      .delete()
      .eq('student_id', studentId)
    if (scaErr && !isMissingTableError(scaErr)) {
      res.status(200).json({ ok: false, error: scaErr.message })
      return
    }

    const { error: delErr } = await supabase.from('students').delete().eq('id', studentId)
    if (delErr) {
      res.status(200).json({ ok: false, error: delErr.message })
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
