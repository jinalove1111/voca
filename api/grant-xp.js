// Vercel Serverless Function — Paul Rank System(2026-07-19) XP 지급의 유일한
// 쓰기 경로. 학생 화면(브라우저)이 Supabase의 xp_ledger에 직접 insert하는
// 경로는 존재하지 않는다(supabase_v2_3_paul_rank.sql이 anon/authenticated
// 에게 INSERT 권한 자체를 주지 않음) — PIN 검증이 오직 api/*.js에서만
// 일어나는 것과 정확히 같은 신뢰 경계 원칙(CLAUDE.md 규칙 11의 일반화).
//
// 클라이언트가 넘길 수 있는 건 "무슨 이벤트가 일어났는가"(eventType)와
// "이 이벤트 인스턴스를 구분하는 키"(sourceEventId)뿐이다 — 얼마를 줄지
// (amount)는 절대 클라이언트 입력을 받지 않고 항상 서버가
// XP_EVENT_TABLE(src/utils/paulRankShared.js, 클라이언트와 공유하는 같은
// 순수 설정)에서 조회한다. "클라이언트가 보낸 XP 총합을 신뢰하지 마라"는
// 지시의 직접 구현.
//
// 중복 지급 방지(idempotency): xp_ledger에 (student_id, source_event_id)
// unique 제약이 있어, 같은 이벤트가 두 번(네트워크 재시도/중복 클릭/오프라인
// 큐 재생 등) 들어와도 두 번째 insert는 DB가 23505(unique violation)로
// 거부한다 — 애플리케이션 레벨의 "이미 지급했는지 먼저 조회" 같은 TOCTOU
// 레이스에 취약한 패턴을 쓰지 않고, DB 제약 자체가 원자적으로 막는다.
// 이 핸들러는 23505를 에러가 아니라 "이미 지급됨(정상)"으로 처리해 학생
// 화면에는 어느 쪽이든 똑같이 성공으로 보이게 한다(재시도가 실패로 보이면
// 클라이언트가 또 재시도하는 악순환을 막기 위함).
import { createClient } from '@supabase/supabase-js'
import { supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'
import { resolveXpAmount, isValidStudentId, isValidSourceEventIdForEvent, isValidEventType } from '../src/utils/paulRankShared.js'

const DUPLICATE_KEY_VIOLATION = '23505'

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

  const { studentId, eventType, sourceEventId } = req.body || {}

  if (!isValidStudentId(studentId)) {
    res.status(200).json({ ok: false, reason: 'invalid_student_id' })
    return
  }
  if (!isValidEventType(eventType)) {
    // 알 수 없는 eventType이거나, XP_EVENT_TABLE에는 있지만 아직
    // status:'planned'(예약만 된 미구현 이벤트 — word-king-complete/
    // weekly-streak/special-event)인 경우도 여기서 함께 거부된다
    // (resolveXpAmount가 'active'가 아니면 null을 반환 — paulRankShared.js
    // 참고). 클라이언트가 임의 문자열/아직 열리지 않은 이벤트로 새 지급
    // 경로를 만들어내는 걸 서버가 원천 거부.
    res.status(200).json({ ok: false, reason: 'unknown_event_type' })
    return
  }
  // v2.3.1(행동 단위 리팩터링) — eventType 화이트리스트뿐 아니라
  // source_event_id의 기간키(period key)까지 서버가 검증한다. 예전
  // mission-clear/duplicate-sticker-bonus/spelling-combo-N이 wordId나
  // 무작위값을 기간키 자리에 써서 사실상 무제한 반복 지급이 가능했던
  // 사고(paulRankShared.js XP_EVENT_TABLE 헤더 주석 참고)가, 이번엔
  // "가짜 날짜"를 계속 바꿔가며 보내는 형태로 재발하지 않도록 막는다.
  if (!isValidSourceEventIdForEvent(eventType, sourceEventId)) {
    res.status(200).json({ ok: false, reason: 'invalid_source_event_id' })
    return
  }

  const amount = resolveXpAmount(eventType) // 서버 전용 결정 — req.body.amount는 어디서도 읽지 않음
  const supabase = createClient(url, key)

  const { error } = await supabase.from('xp_ledger').insert({
    student_id: studentId,
    event_type: eventType,
    amount,
    source_event_id: sourceEventId,
  })

  if (error) {
    if (error.code === DUPLICATE_KEY_VIOLATION) {
      // 이미 지급된 이벤트 — 중복 지급 아님, 정상 idempotent 응답.
      res.status(200).json({ ok: true, duplicate: true, amount })
      return
    }
    if (error.code === '42P01' || error.code === 'PGRST205') {
      // xp_ledger 테이블이 아직 없음(supabase_v2_3_paul_rank.sql 미실행) —
      // Supabase가 raw Postgres 에러(42P01)를 줄지, PostgREST 스키마
      // 캐시 미스(PGRST205, 실측 확인 — entranceTestApi.js의
      // checkEntranceTestAvailable와 동일하게 코드에 의존하지 않고 "에러가
      // 있으면 미존재로 취급"하는 편이 더 안전하지만, 여기서는 성공/실패를
      // 구분해 알려줘야 해서 알려진 두 코드를 명시 확인한다)를 줄지 환경마다
      // 다를 수 있어 둘 다 처리. 학습 흐름을 막으면 안 되므로 조용히 성공
      // 취급(학생에게는 무해, 클라이언트는 실패를 이미 무시하도록 설계돼
      // 있음 — postXpEvent 참고).
      res.status(200).json({ ok: false, reason: 'table_missing' })
      return
    }
    res.status(500).json({ error: error.message })
    return
  }

  res.status(200).json({ ok: true, duplicate: false, amount })
}
