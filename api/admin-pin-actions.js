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
// HOUSES(id 1~4 유효값 정의)도 함께 가져온다 — set_student_house 액션이
// wordLibrary.js setStudentHouse와 동일한 "알 수 없는 하우스 id" 검증을
// 하기 위함(아래 Phase 2b Step 1-B 액션들 참고).
import { assignBalancedHouseId, computeHouseCounts, HOUSES } from '../src/utils/houseSystem.js'

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
  // 2026-09-02 Phase 2b Step 1-B — 관리자 화면이 students를 anon key로
  // 직접 UPDATE/SELECT하던 6개 wordLibrary.js 함수 + 전체 로스터 조회를
  // 서버 액션으로 이식(같은 12함수 한도 이유로 이 통합 dispatcher에 추가,
  // 신규 api 파일 없음). 이번 Step은 서버 액션만 추가 — 클라이언트 호출
  // 전환은 다음 Step(별도 handoff). 각 액션 헤더 주석에 이식 출처 표기.
  'list_students',
  'set_student_class',
  'set_student_unit',
  'set_students_class_bulk',
  'set_student_house',
  'set_primary_assignment',
  'set_primary_textbook',
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
  // 2026-09-04 — checkAdminReauth가 실패 지연(브루트포스 스로틀) 도입으로
  // async가 됐다. await 없이 호출하면 Promise가 항상 truthy라 인증이
  // 무력화되므로 반드시 await한다(api/_pinAuth.js 헤더 주석 참고).
  if (!(await checkAdminReauth(req, res))) return

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

    // 2026-09-04 P1 UX-safety — 교재/유닛 미배정 상태로 조용히 성공만
    // 반환하던 문제 대응(2026-09-03 Pre-Middle 사고: health:students
    // UNIT_INVALID FAIL -> Release Gate 차단). 쓰기 동작은 위와 완전히
    // 동일(규칙 9 하위호환 유지) — 이미 확정된 resolvedTextbookId/unitId를
    // 그대로 읽어 응답에만 신호를 추가한다. 관리자가 즉시 알아채도록
    // 하는 게 목적이라, "학생 생성 자체 성공"(ok:true)과는 분리한다.
    const warnings = []
    if (!resolvedTextbookId) warnings.push('no_textbook')
    else if (!unitId) warnings.push('no_unit')
    const responseBody = { ok: true, studentId }
    if (warnings.length > 0) {
      responseBody.warnings = warnings
      responseBody.message = warnings.includes('no_textbook')
        ? '교재가 배정되지 않아 이 학생은 아직 학습을 시작할 수 없어요 — 교재 배정이 필요합니다.'
        : '유닛이 배정되지 않아 이 학생은 아직 학습을 시작할 수 없어요 — 교재 배정에서 유닛을 확인하세요.'
    }
    res.status(200).json(responseBody)
    return
  }

  if (action === 'unlock_student_pin') {
    // 원본: api/unlock-student-pin.js. pin_fail_count/pin_locked_until만
    // 초기화(pin_hash는 안 건드림) — 브루트포스 방어(5회 잠금)를
    // 무력화하는 액션이라 관리자 재인증 필수.
    const { studentId } = req.body || {}
    // 2026-09-03 보안수정(Low) — 다른 액션(create_student/deactivate_student/
    // reactivate_student/hard_delete_student)과 동일하게 UUID 형식을
    // 검증한다(일관성). 이 액션 자체가 위험한 쓰기는 아니지만(잠금 해제만,
    // pin_hash 는 안 건드림) 형식이 아닌 값을 그대로 .eq()에 흘려보내던
    // 유일한 액션이었다. 에러 메시지는 기존 계약(scripts/testAdminPinActions
    // Dispatch.mjs "studentId is required" 단언)을 그대로 유지한다 —
    // studentId 부재/형식오류 둘 다 같은 400 메시지로 합친다.
    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
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

    // 2026-09-03 — reward_ledger/entrance_test_results/xp_ledger 3개 추가.
    // students DELETE는 on delete cascade로 이 3개도 함께 지우는데(각
    // supabase_v3_36_reward_ledger.sql/supabase_v1_8_entrance_test.sql/
    // supabase_v2_3_paul_rank.sql의 FK 정의, DATABASE.md 참고) 기존 가드
    // 5종에는 빠져 있었다 — 이 가드를 우회하면 리워드/응시결과/XP 이력이
    // 조용히 사라질 수 있어 위 5종과 동일한 "데이터 0만 삭제 허용" 원칙을
    // 적용한다. 세 테이블 모두 아직 프로덕션에 없을 수 있으므로(예:
    // xp_ledger는 v2.3.1 인덱스 마이그레이션이 미실행 상태 — DATABASE.md
    // 참고) 테이블 자체 부재(42P01/PGRST205)는 "잃을 데이터가 없다"는
    // 의미로 0 취급하되, fail-open과 구분되도록 detail.tableMissing에
    // 표시해 남긴다.
    const tableMissing = {}
    let rewardLedgerCount = 0
    {
      const { count, error } = await supabase
        .from('reward_ledger')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
      if (error) {
        if (isMissingTableError(error)) {
          tableMissing.rewardLedger = true
        } else {
          res.status(200).json({ ok: false, error: error.message })
          return
        }
      } else {
        rewardLedgerCount = count || 0
      }
    }

    let entranceTestResultsCount = 0
    {
      const { count, error } = await supabase
        .from('entrance_test_results')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
      if (error) {
        if (isMissingTableError(error)) {
          tableMissing.entranceTestResults = true
        } else {
          res.status(200).json({ ok: false, error: error.message })
          return
        }
      } else {
        entranceTestResultsCount = count || 0
      }
    }

    let xpLedgerCount = 0
    {
      const { count, error } = await supabase
        .from('xp_ledger')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
      if (error) {
        if (isMissingTableError(error)) {
          tableMissing.xpLedger = true
        } else {
          res.status(200).json({ ok: false, error: error.message })
          return
        }
      } else {
        xpLedgerCount = count || 0
      }
    }

    const detail = {
      word_status: wordStatusCount,
      stars: hasProgressData,
      hasPin,
      daily: dailyCount,
      spellingQueue: spellingQueueCount,
      rewardLedger: rewardLedgerCount,
      entranceTestResults: entranceTestResultsCount,
      xpLedger: xpLedgerCount,
      tableMissing,
    }
    if (
      wordStatusCount > 0 ||
      hasProgressData ||
      hasPin ||
      dailyCount > 0 ||
      spellingQueueCount > 0 ||
      rewardLedgerCount > 0 ||
      entranceTestResultsCount > 0 ||
      xpLedgerCount > 0
    ) {
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

  // ════════════════════════════════════════════════════════════════════
  // Phase 2b Step 1-B(2026-09-02) — 관리자 로스터 관리 서버 이식 7개.
  // 원본은 전부 src/utils/wordLibrary.js(anon key 직접 CRUD, 클라이언트
  // 캐시 _cache/_students/_textbooks 의존). 서버는 그 캐시가 없으므로
  // 호출부(다음 Step에서 붙일 클라이언트)가 이미 알고 있는 값(classId/
  // unitId 등)을 payload로 직접 받는 방식으로 이식한다 — "이름으로
  // 유닛/반을 재해석"하는 클라이언트측 로직은 옮기지 않음(아래 각 액션
  // 주석에 구체적 차이 명시). 응답 규약: uuid 형식 오류는 400
  // { ok:false, reason:'invalid_request' }, 대상 없음은 200
  // { ok:false, reason:'not_found' }(파일 상단 다른 액션들의 기존 200
  // 관례를 그대로 따름 — 파일 전체 응답 스타일 일관성), DB 에러는 500
  // { ok:false, reason:'db_error' }(내부 메시지는 응답에 싣지 않음).
  // ════════════════════════════════════════════════════════════════════

  if (action === 'list_students') {
    // wordLibrary.js:358-390(STUDENTS_SELECT_BASE/STUDENTS_PAGE_SIZE/
    // selectAllStudents) + refreshStudents(391-421) 서버 이식. 1000행
    // PostgREST 기본 상한을 .range() 페이지네이션으로 우회해 전량을
    // 가져온다. house_id는 v2.7 컬럼이라 프로덕션에 없을 수 있어(42703
    // 실측 확정, create_student와 동일 전례) 별도 열로 시도 후 컬럼
    // 부재면 제외한다. 규칙 11 — pin_ 접두 컬럼은 select 문자열 어디에도
    // 없다(응답에도 당연히 없음).
    const PAGE_SIZE = 1000
    const BASE_SELECT = 'id,name,class_id,unit_name,current_unit_id,classes(name)'
    async function fetchAllStudents(selectStr) {
      let all = []
      let from = 0
      for (;;) {
        const { data, error } = await supabase
          .from('students')
          .select(selectStr)
          .order('created_at')
          .order('id')
          .range(from, from + PAGE_SIZE - 1)
        if (error) return { data: null, error }
        all = all.concat(data || [])
        if (!data || data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      return { data: all, error: null }
    }

    let hasHouse = true
    let { data, error } = await fetchAllStudents(`${BASE_SELECT},house_id`)
    if (error) {
      if (!isMissingColumnError(error, 'house_id')) {
        res.status(500).json({ ok: false, reason: 'db_error' })
        return
      }
      hasHouse = false
      ;({ data, error } = await fetchAllStudents(BASE_SELECT))
    }
    if (error) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    const students = (data || []).map((s) => ({
      id: s.id,
      name: s.name,
      class_id: s.class_id || null,
      unit_name: s.unit_name || null,
      current_unit_id: s.current_unit_id || null,
      house_id: hasHouse && s.house_id != null ? Number(s.house_id) : null,
      className: s.classes?.name || '',
    }))
    res.status(200).json({ ok: true, students, count: students.length })
    return
  }

  if (action === 'set_student_class') {
    // wordLibrary.js:1948-1976 setStudentClass 서버 이식. 원본은 className
    // (문자열)을 받아 ensureClass로 classId를 구하고, 학생의 저장된
    // unitName을 새 반의 유닛 목록에서 이름으로 재검색해 unitIdInNewClass를
    // 정한다 — 이 재검색은 _cache(클라이언트 유닛 캐시) 의존이라 서버에는
    // 없다. 대신 호출부가 이미 해석한 currentUnitId를 payload로 직접
    // 받는다(없으면 null — 유닛 미배정으로 저장, 기존 "못 찾으면 null"과
    // 동일한 결과 형태). SCA 부수효과(maintainPrimaryAssignmentForClassChange)
    // 는 아래 공용 헬퍼로 동일하게 수행한다.
    const { studentId, classId, currentUnitId } = req.body || {}
    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    if (classId != null && (typeof classId !== 'string' || !UUID_RE.test(classId))) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    if (currentUnitId != null && (typeof currentUnitId !== 'string' || !UUID_RE.test(currentUnitId))) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    const resolvedClassId = classId || null
    const resolvedUnitId = currentUnitId || null
    let { data, error } = await supabase.from('students')
      .update({ class_id: resolvedClassId, current_unit_id: resolvedUnitId }).eq('id', studentId).select('id')
    if (error && error.code === '42703') {
      ;({ data, error } = await supabase.from('students')
        .update({ class_id: resolvedClassId }).eq('id', studentId).select('id'))
    }
    if (error) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    if (!Array.isArray(data) || data.length === 0) {
      res.status(200).json({ ok: false, reason: 'not_found' })
      return
    }
    if (resolvedClassId) {
      await maintainPrimaryAssignmentForClassChange(supabase, studentId, resolvedClassId, resolvedUnitId)
    }
    res.status(200).json({ ok: true })
    return
  }

  if (action === 'set_student_unit') {
    // wordLibrary.js:2195-2207 writeStudentUnit(students 갱신 단일 지점)
    // 서버 이식. 원본 setStudentUnit/setStudentUnitById(2061/2175)의 유닛
    // "탐색"(교재/반 유닛 풀에서 이름·id로 찾기, isLearnableUnit 검증)은
    // 클라이언트 캐시 의존이라 옮기지 않는다 — 이 액션은 호출부가 이미
    // 확정한 unitId/unitName을 그대로 쓰는 순수 쓰기 지점이다(호출부가
    // 학습 가능 유닛인지 등은 사전에 검증했다고 가정).
    const { studentId, unitName, unitId } = req.body || {}
    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    if (typeof unitId !== 'string' || !UUID_RE.test(unitId)) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    if (typeof unitName !== 'string' || unitName.trim().length === 0) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    let { data, error } = await supabase.from('students')
      .update({ unit_name: unitName, current_unit_id: unitId }).eq('id', studentId).select('id')
    if (error && error.code === '42703') {
      ;({ data, error } = await supabase.from('students')
        .update({ unit_name: unitName }).eq('id', studentId).select('id'))
    }
    if (error) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    if (!Array.isArray(data) || data.length !== 1) {
      res.status(200).json({ ok: false, reason: 'not_found' })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  if (action === 'set_students_class_bulk') {
    // wordLibrary.js:2213-2239 setStudentsClassBulk 서버 이식. 원본과
    // 동일하게 className(여기서는 classId) 재검증 없이 한 번의 update로
    // 전원을 옮기고, 유닛은 (set_student_class와 동일 이유로) 호출부가
    // 이미 해석한 currentUnitId를 그대로 쓴다. 최대 200명, 하나라도
    // uuid가 아니면 전체 거부(부분 적용 없음).
    const { studentIds, classId, currentUnitId } = req.body || {}
    if (!Array.isArray(studentIds) || studentIds.length === 0 || studentIds.length > 200) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    if (!studentIds.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    if (classId != null && (typeof classId !== 'string' || !UUID_RE.test(classId))) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    if (currentUnitId != null && (typeof currentUnitId !== 'string' || !UUID_RE.test(currentUnitId))) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    const resolvedClassId = classId || null
    const resolvedUnitId = currentUnitId || null
    let { error } = await supabase.from('students')
      .update({ class_id: resolvedClassId, current_unit_id: resolvedUnitId }).in('id', studentIds)
    if (error && error.code === '42703') {
      ;({ error } = await supabase.from('students')
        .update({ class_id: resolvedClassId }).in('id', studentIds))
    }
    if (error) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    if (resolvedClassId) {
      // 원본과 동일 — 순차 실행, 각 호출 non-fatal(공용 헬퍼가 내부에서 catch).
      for (const sid of studentIds) {
        await maintainPrimaryAssignmentForClassChange(supabase, sid, resolvedClassId, resolvedUnitId)
      }
    }
    res.status(200).json({ ok: true, count: studentIds.length })
    return
  }

  if (action === 'set_student_house') {
    // wordLibrary.js:1983-1993 setStudentHouse 서버 이식. HOUSES(1~4) 범위
    // 검증도 동일하게 유지. house_id 컬럼 자체가 없으면(v2.7 SQL 미실행)
    // column_missing으로 명시 응답(create_student의 42703 폴백과 달리
    // 이 액션은 "저장 자체가 목적"이라 조용한 스킵이 아니라 실패를
    // 알려야 호출부가 재시도/안내할 수 있다).
    const { studentId, houseId } = req.body || {}
    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    let value = null
    if (houseId !== null && houseId !== undefined) {
      value = Number(houseId)
      if (!Number.isInteger(value) || !HOUSES.some((h) => h.id === value)) {
        res.status(400).json({ ok: false, reason: 'invalid_request' })
        return
      }
    }
    const { data, error } = await supabase.from('students')
      .update({ house_id: value }).eq('id', studentId).select('id')
    if (error) {
      if (isMissingColumnError(error, 'house_id')) {
        res.status(200).json({ ok: false, reason: 'column_missing' })
        return
      }
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    if (!Array.isArray(data) || data.length === 0) {
      res.status(200).json({ ok: false, reason: 'not_found' })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  if (action === 'set_primary_assignment') {
    // wordLibrary.js:2659-2723(대략) setPrimaryAssignment 서버 이식.
    // "나가는 primary 진도 캡처" 중 이름 폴백(resolveStudentUnitObj, 유닛
    // 이름 문자열을 새 반 유닛과 재매칭)은 옮기지 않는다 — 이미
    // students.current_unit_id(id 기반, 두 모드 공통 권위 값)가 있으면
    // 그것만 캡처해도 원본의 "구체적 id 우선" 원칙과 결과가 같고, 그
    // 값조차 없는 아주 오래된 레거시 학생만 캡처를 건너뛴다(원본도 그 경우
    // 결국 null로 남기는 경로가 있어 완전히 새로운 실패 모드는 아님).
    // "단어 있는 첫 유닛" 확정(대상 반의 units/words 조회)은 create_student
    // (이 파일 240행대)와 동일한 정렬·집계 방식으로 재사용한다.
    const { studentId, classId } = req.body || {}
    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    if (typeof classId !== 'string' || !UUID_RE.test(classId)) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }

    const { data: target, error: selErr } = await supabase
      .from('student_class_assignments')
      .select('id,current_unit_id')
      .eq('student_id', studentId).eq('class_id', classId).maybeSingle()
    if (selErr) {
      if (isMissingTableError(selErr)) {
        res.status(200).json({ ok: false, reason: 'table_missing' })
        return
      }
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    if (!target) {
      res.status(200).json({ ok: false, reason: 'not_assigned' })
      return
    }

    const { data: outgoingRows, error: outSelErr } = await supabase
      .from('student_class_assignments')
      .select('id,class_id')
      .eq('student_id', studentId).eq('is_primary', true)
    if (outSelErr && !isMissingTableError(outSelErr)) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    const outgoing = (outgoingRows || []).find((r) => r.class_id !== classId)
    if (outgoing) {
      const { data: liveStudent, error: liveErr } = await supabase
        .from('students').select('current_unit_id').eq('id', studentId).maybeSingle()
      const capturedUnitId = (!liveErr && liveStudent && liveStudent.current_unit_id != null)
        ? liveStudent.current_unit_id : null
      if (capturedUnitId != null) {
        const { error: healErr } = await supabase.from('student_class_assignments')
          .update({ current_unit_id: capturedUnitId }).eq('id', outgoing.id)
        if (healErr) {
          res.status(500).json({ ok: false, reason: 'db_error' })
          return
        }
      }
    }

    const { error: trueErr } = await supabase.from('student_class_assignments')
      .update({ is_primary: true }).eq('id', target.id)
    if (trueErr) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    const { error: falseErr } = await supabase.from('student_class_assignments')
      .update({ is_primary: false }).eq('student_id', studentId).neq('id', target.id)
    if (falseErr) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }

    let syncUnitId = target.current_unit_id
    if (syncUnitId == null) {
      const { data: unitsRows } = await supabase.from('units').select('id,name,position').eq('class_id', classId)
      if (Array.isArray(unitsRows) && unitsRows.length > 0) {
        const { data: wordRows } = await supabase.from('words').select('unit_id').in('unit_id', unitsRows.map((u) => u.id))
        const countByUnit = new Map()
        for (const w of wordRows || []) countByUnit.set(w.unit_id, (countByUnit.get(w.unit_id) || 0) + 1)
        const sorted = [...unitsRows].sort((a, b) =>
          ((a.position ?? Infinity) - (b.position ?? Infinity)) ||
          String(a.name).localeCompare(String(b.name), undefined, { numeric: true }) ||
          String(a.id).localeCompare(String(b.id)))
        syncUnitId = (sorted.find((u) => (countByUnit.get(u.id) || 0) > 0) || sorted[0])?.id ?? null
        if (syncUnitId != null) {
          const { error: fillErr } = await supabase.from('student_class_assignments')
            .update({ current_unit_id: syncUnitId }).eq('id', target.id)
          if (fillErr) {
            res.status(500).json({ ok: false, reason: 'db_error' })
            return
          }
        }
      }
    }
    const { error: syncErr } = await supabase.from('students')
      .update({ class_id: classId, current_unit_id: syncUnitId }).eq('id', studentId)
    if (syncErr) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  if (action === 'set_primary_textbook') {
    // wordLibrary.js:2759-2860(대략) setPrimaryTextbook 서버 이식 — 사람
    // 반(students.class_id)은 절대 바꾸지 않는다(원본과 동일 계약). "나가는
    // primary 진도 캡처"의 이름 폴백 생략은 위 set_primary_assignment와
    // 동일한 이유·범위.
    const { studentId, textbookId } = req.body || {}
    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }
    if (typeof textbookId !== 'string' || !UUID_RE.test(textbookId)) {
      res.status(400).json({ ok: false, reason: 'invalid_request' })
      return
    }

    const { data: tb, error: tbErr } = await supabase
      .from('textbooks').select('id,owner_class_id').eq('id', textbookId).maybeSingle()
    if (tbErr) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    if (!tb || !tb.owner_class_id) {
      res.status(200).json({ ok: false, reason: 'invalid_textbook' })
      return
    }

    let { data: target, error: selErr } = await supabase
      .from('student_class_assignments')
      .select('id,current_unit_id')
      .eq('student_id', studentId).eq('textbook_id', textbookId).maybeSingle()
    if (selErr) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    if (!target) {
      const { data: legacyRow, error: legacyErr } = await supabase
        .from('student_class_assignments')
        .select('id,current_unit_id')
        .eq('student_id', studentId).eq('class_id', tb.owner_class_id).is('textbook_id', null).maybeSingle()
      if (legacyErr) {
        res.status(500).json({ ok: false, reason: 'db_error' })
        return
      }
      if (legacyRow) {
        const { error: claimErr } = await supabase.from('student_class_assignments')
          .update({ textbook_id: textbookId }).eq('id', legacyRow.id)
        if (claimErr) {
          res.status(500).json({ ok: false, reason: 'db_error' })
          return
        }
        target = { id: legacyRow.id, current_unit_id: legacyRow.current_unit_id }
      }
    }
    if (!target) {
      const { error: insErr } = await supabase.from('student_class_assignments').insert({
        student_id: studentId, class_id: tb.owner_class_id, textbook_id: textbookId,
        current_unit_id: null, is_primary: false,
      })
      if (insErr && insErr.code !== '23505') {
        res.status(500).json({ ok: false, reason: 'db_error' })
        return
      }
      ;({ data: target, error: selErr } = await supabase
        .from('student_class_assignments')
        .select('id,current_unit_id')
        .eq('student_id', studentId).eq('textbook_id', textbookId).maybeSingle())
      if (selErr || !target) {
        res.status(500).json({ ok: false, reason: 'db_error' })
        return
      }
    }

    const { data: outgoingRows, error: outErr } = await supabase
      .from('student_class_assignments')
      .select('id').eq('student_id', studentId).eq('is_primary', true).neq('id', target.id)
    if (outErr) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    if ((outgoingRows || []).length > 0) {
      const { data: liveStudent, error: liveErr } = await supabase
        .from('students').select('current_unit_id').eq('id', studentId).maybeSingle()
      const capturedUnitId = (!liveErr && liveStudent && liveStudent.current_unit_id != null)
        ? liveStudent.current_unit_id : null
      if (capturedUnitId != null) {
        for (const row of outgoingRows) {
          const { error: healErr } = await supabase.from('student_class_assignments')
            .update({ current_unit_id: capturedUnitId }).eq('id', row.id)
          if (healErr) {
            res.status(500).json({ ok: false, reason: 'db_error' })
            return
          }
        }
      }
    }

    const { error: trueErr } = await supabase.from('student_class_assignments')
      .update({ is_primary: true }).eq('id', target.id)
    if (trueErr) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    const { error: falseErr } = await supabase.from('student_class_assignments')
      .update({ is_primary: false }).eq('student_id', studentId).neq('id', target.id)
    if (falseErr) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }

    const { data: tbUnitsRows } = await supabase.from('units').select('id,name,position').eq('class_id', tb.owner_class_id)
    const tbUnits = Array.isArray(tbUnitsRows) ? tbUnitsRows : []
    let syncUnitId = target.current_unit_id
    if (syncUnitId != null && !tbUnits.some((u) => u.id === syncUnitId)) syncUnitId = null
    if (syncUnitId == null && tbUnits.length > 0) {
      const { data: wordRows } = await supabase.from('words').select('unit_id').in('unit_id', tbUnits.map((u) => u.id))
      const countByUnit = new Map()
      for (const w of wordRows || []) countByUnit.set(w.unit_id, (countByUnit.get(w.unit_id) || 0) + 1)
      const sorted = [...tbUnits].sort((a, b) =>
        ((a.position ?? Infinity) - (b.position ?? Infinity)) ||
        String(a.name).localeCompare(String(b.name), undefined, { numeric: true }) ||
        String(a.id).localeCompare(String(b.id)))
      syncUnitId = (sorted.find((u) => (countByUnit.get(u.id) || 0) > 0) || sorted[0])?.id ?? null
      if (syncUnitId != null) {
        const { error: fillErr } = await supabase.from('student_class_assignments')
          .update({ current_unit_id: syncUnitId }).eq('id', target.id)
        if (fillErr) {
          res.status(500).json({ ok: false, reason: 'db_error' })
          return
        }
      }
    }
    const { error: syncErr } = await supabase.from('students')
      .update({ current_unit_id: syncUnitId }).eq('id', studentId)
    if (syncErr) {
      res.status(500).json({ ok: false, reason: 'db_error' })
      return
    }
    res.status(200).json({ ok: true })
    return
  }
}

// ── Phase 2b Step 1-B 공용 헬퍼 — SCA(student_class_assignments) primary
// 배정 유지보수. wordLibrary.js:2305-2367(대략) maintainPrimaryAssignmentFor
// ClassChange 서버 이식. 클라이언트의 _textbookMode/_textbookFetchFailed
// 전역 플래그(반이 실제 교재 테이블에 연결됐는지 여부 캐시)가 서버에는
// 없으므로, 매 호출마다 textbooks 테이블에 실제 행이 있는지 직접 조회해
// 같은 분기를 재현한다(원본의 "_textbooks.size > 0" 판정과 동일 의미 —
// 테이블 자체가 없으면 레거시 분기, 테이블은 있는데 조회 자체가 실패하면
// 원본의 _textbookFetchFailed와 동일하게 안전한(비파괴) 분기로 fail-safe).
async function isTextbookModeActive(supabase) {
  const { count, error } = await supabase
    .from('textbooks')
    .select('id', { count: 'exact', head: true })
  if (error) {
    if (isMissingTableError(error)) return { mode: false, failed: false }
    return { mode: false, failed: true }
  }
  return { mode: (count || 0) > 0, failed: false }
}

async function getOwnTextbookIdOfClass(supabase, classId) {
  const { data, error } = await supabase.from('textbooks').select('id').eq('owner_class_id', classId).maybeSingle()
  if (error || !data) return null
  return data.id
}

async function maintainPrimaryAssignmentForClassChange(supabase, studentId, classId, unitId) {
  try {
    if (!studentId || !classId) return
    const { mode: textbookMode, failed: fetchFailed } = await isTextbookModeActive(supabase)
    if (textbookMode || fetchFailed) {
      const { error: demErr } = await supabase.from('student_class_assignments')
        .update({ is_primary: false }).eq('student_id', studentId).eq('is_primary', true).neq('class_id', classId)
      if (demErr) {
        if (isMissingTableError(demErr)) return
        throw demErr
      }
      const ownId = await getOwnTextbookIdOfClass(supabase, classId)
      const { error: insErr } = await supabase.from('student_class_assignments').insert({
        student_id: studentId, class_id: classId, textbook_id: ownId,
        current_unit_id: unitId ?? null, is_primary: true,
      })
      if (insErr) {
        if (insErr.code === '23505') {
          const { error: updErr } = await supabase.from('student_class_assignments')
            .update({ is_primary: true }).eq('student_id', studentId).eq('class_id', classId)
          if (updErr) throw updErr
        } else if (!isMissingTableError(insErr)) {
          throw insErr
        }
      }
      return
    }
    const { error: delErr } = await supabase.from('student_class_assignments')
      .delete().eq('student_id', studentId).eq('is_primary', true).neq('class_id', classId)
    if (delErr) {
      if (isMissingTableError(delErr)) return
      throw delErr
    }
    const { error: insErr } = await supabase.from('student_class_assignments').insert({
      student_id: studentId, class_id: classId, current_unit_id: unitId ?? null, is_primary: true,
    })
    if (insErr) {
      if (insErr.code === '23505') {
        const { error: updErr } = await supabase.from('student_class_assignments')
          .update({ is_primary: true }).eq('student_id', studentId).eq('class_id', classId)
        if (updErr) throw updErr
      } else if (!isMissingTableError(insErr)) {
        throw insErr
      }
    }
  } catch (err) {
    console.warn('[admin-pin-actions] 반 배정 assignment 행 유지보수 실패 (non-fatal):', err?.message || err)
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
