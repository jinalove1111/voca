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
import { supabaseAdminUrl, supabaseAdminKey, verifySessionToken } from './_pinAuth.js'
import { resolveXpAmount, isValidStudentId, isValidSourceEventIdForEvent, isValidEventType } from '../src/utils/paulRankShared.js'
import { isValidRewardType, isValidRewardSource, resolveRewardStars, rewardIdempotencyKey, rewardDailyCap, kstDayStartMs } from '../src/utils/rewardEngine.js'

// Teacher Controls 마스터 스위치(2026-07-19, classes.gamification_enabled,
// GAME_DESIGN.md 13번 섹션) 판단 — 이 핸들러는 반의 스위치 상태를 조회해서
// 지급을 거부하지 않는다(의도적 결정, 아래 근거).
//   1) xp_ledger는 "감사 가능한 이벤트 원장"으로 설계됐다(supabase_v2_3_
//      paul_rank.sql 헤더 주석). 스위치가 꺼져 있다고 실제 발생한 학습
//      이벤트의 지급을 조용히 스킵하면, 그 학생이 "그 행동을 안 한 것"과
//      "했지만 꺼져 있어서 기록 안 됨"을 나중에 원장만 보고 구분할 수 없게
//      된다 — 원장의 감사 가능성이 깨진다.
//   2) source_event_id는 기간키(day 등) 기반 idempotency 키라(v2.3.1),
//      클라이언트는 트리거가 발생한 그 시점에 딱 한 번만 호출을 시도하고
//      실패는 이미 조용히 삼킨다(postXpEvent). 서버가 스위치 off를 이유로
//      거부하면, 나중에 교사가 스위치를 켜도 그날 그 행동에 대한 XP는
//      클라이언트가 다시 보내주지 않는 한 영구 손실된다 — 스위치를
//      껐다 켰다 하는 정상적인 교사 사용 패턴에서 데이터가 복구 불가능하게
//      사라지는 결과.
//   3) 이 요청은 이미 고빈도 경로(word-view/listening/quiz-complete 등
//      여러 트리거 지점)라, 반마다 classes.gamification_enabled를 추가
//      조회하면 매 호출마다 DB 왕복 하나·실패 모드 하나가 늘어난다 —
//      효과는 순수 UX(학생은 스위치가 꺼진 반에서는 Rank UI 자체를 절대
//      보지 못한다, Dashboard.jsx 게이팅)뿐인데 안정성 비용만 커진다.
// 결론: 마스터 스위치는 "노출(exposure) 게이트"로만 쓴다 — Dashboard.jsx가
// 학생에게 보여줄지 말지만 결정하고, XP 적립 자체는 스위치와 무관하게
// 계속 정확히 기록한다. 나중에 교사가 스위치를 켜면 그동안 실제로 쌓인
// XP가 그대로(정확하게) 드러난다 — 이건 "별을 조용히 XP로 변환"하는 것과
// 다르다(진짜 발생한 이벤트의 진짜 기록일 뿐, 합성값이 아님).
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

  // Reward System V1(2026-08-18) — 별(stars) 지급의 서버 쓰기 경로.
  // ledger:'reward'가 있을 때만 이 분기를 타고, 없으면(기존 클라이언트가
  // 보내는 요청은 이 필드 자체가 없음) 아래 기존 XP 로직으로 그대로
  // 흘러간다 — 기존 XP 경로는 한 글자도 바뀌지 않았다(하위호환).
  //
  // 클라이언트는 "무슨 이벤트가 일어났는가"(rewardType/sourceType/
  // sourceId)만 보낸다 — 몇 별을 줄지(stars)는 req.body 어디서도 읽지
  // 않고 항상 resolveRewardStars()(rewardEngine.js)가 결정한다. 마찬가지로
  // idempotency_key도 클라이언트가 보낸 값을 쓰지 않고 서버가
  // rewardIdempotencyKey()로 studentId/rewardType/sourceType/sourceId를
  // 직접 조립한다 — 클라이언트가 임의 키를 보내 다른 학생의 지급 기록에
  // 충돌시키거나 검증을 우회하는 경로를 원천 차단.
  if (req.body && req.body.ledger === 'reward') {
    const { studentId: rewardStudentId, rewardType, sourceType, sourceId } = req.body

    if (!isValidStudentId(rewardStudentId)) {
      res.status(200).json({ ok: false, reason: 'invalid_student_id' })
      return
    }

    // ── L0) 인증 (2026-08-24, 보안 감사 HIGH 1) ──────────────────────────
    // 아래 L1~L3는 "이 요청이 말이 되는가"를 보지만, "이 요청을 보낼 자격이
    // 있는가"는 보지 못했다. 그래서 누구나 남의 studentId를 실어 그 학생의
    // 원장을 부풀릴 수 있었다(상한 안에서 하루 86별).
    // 이제 로그인 시 발급된 서명 토큰을 요구하고, 토큰이 주장하는 학생과
    // body의 studentId가 일치할 때만 통과시킨다 — 토큰은 SESSION_SECRET을
    // 아는 서버만 만들 수 있고, 그 시크릿은 브라우저 번들에 들어가지 않는다.
    //
    // fail-closed: SESSION_SECRET이 없으면 verifySessionToken이
    // {ok:false, reason:'no_secret'}을 돌려주고 여기서 거부된다. 즉 시크릿
    // 없이 배포하면 원장 쓰기가 멈춘다(학생 화면은 무영향 — postRewardEvent가
    // fire-and-forget이라 로컬 별 지급은 이미 끝난 뒤다).
    //
    // 토큰은 body.token 또는 x-session-token 헤더 둘 다 받는다 — 기존
    // 호출부가 body만 쓰지만, 헤더 방식이 필요해질 때 API를 바꾸지 않아도
    // 되게 열어 둔다.
    {
      const supplied = (typeof req.body.token === 'string' && req.body.token)
        || (req.headers && (req.headers['x-session-token'] || req.headers['X-Session-Token']))
        || null
      const authed = verifySessionToken(supplied, { studentId: rewardStudentId })
      if (!authed.ok) {
        res.status(200).json({ ok: false, reason: 'unauthorized', detail: authed.reason })
        return
      }
    }
    if (!isValidRewardType(rewardType)) {
      // REWARD_SOURCE_RULES에 없는 rewardType은 전부 여기서 거부된다 —
      // 'legacy-baseline'(마이그레이션 전용, v3_37 SQL만 쓴다)도 이
      // 화이트리스트에 아예 없으므로 항상 이 분기로 거부된다.
      res.status(200).json({ ok: false, reason: 'unknown_reward_type' })
      return
    }
    if (!isValidRewardSource(rewardType, sourceType, sourceId)) {
      res.status(200).json({ ok: false, reason: 'invalid_reward_source' })
      return
    }

    // streak-bonus만 금액이 sourceId에 실린 streak 일수에 따라 달라진다
    // (`${date}:${streakDays}` 형식, isValidRewardSource가 이미 형식을
    // 확인했으므로 여기서는 안전하게 파싱만 한다). 그 외 rewardType은
    // streakDays를 쓰지 않는다(resolveRewardStars가 무시).
    const streakDays = rewardType === 'streak-bonus'
      ? Number(String(sourceId).slice(String(sourceId).indexOf(':') + 1))
      : undefined
    const stars = resolveRewardStars(rewardType, streakDays) // 서버 전용 결정 — req.body의 금액 필드는 어디서도 읽지 않음
    if (stars <= 0) {
      res.status(200).json({ ok: false, reason: 'zero_reward' })
      return
    }

    const idempotencyKey = rewardIdempotencyKey(rewardStudentId, rewardType, sourceType, sourceId) // 서버가 직접 조립 — 클라이언트가 보낸 키는 신뢰하지 않음
    const supabase = createClient(url, key)

    // ── 서버측 방어 3층 (2026-08-23 보안 감사 HIGH 2·3·4 대응) ────────────
    // 이 엔드포인트에는 인증이 없다(HIGH 1 — 저장소에 세션 토큰 개념이
    // 없어 이번 범위에서 닫지 못함, BLOCKED). 그래서 "클라이언트가 무엇을
    // 주장하는가"가 아니라 "서버가 무엇을 관측할 수 있는가"로 막는다.
    // 세 검증 모두 fail-closed — 조회가 실패하면 지급하지 않는다.

    // L1) 학생 실재 검증 — studentId는 클라이언트 입력이므로 형식 검증만으로는
    //     부족하다. students에 실제로 있는 학생인지 서버가 확인한다.
    {
      const { data: stu, error: stuErr } = await supabase
        .from('students').select('id').eq('id', rewardStudentId).maybeSingle()
      if (stuErr) {
        res.status(200).json({ ok: false, reason: 'student_lookup_failed' })
        return
      }
      if (!stu) {
        res.status(200).json({ ok: false, reason: 'student_not_found' })
        return
      }
    }

    // L2) 이벤트 실재 검증 — exam-complete는 sourceId가 임의 UUID여도 형식
    //     검증을 통과하므로(pattern 'uuid'), 그 학생이 그 시험을 실제로
    //     제출했는지 entrance_test_results로 확인한다. 서버가 관측 가능한
    //     진실이라 클라이언트가 UUID를 지어내도 통과하지 못한다.
    //     다른 rewardType은 이 분기를 타지 않는다(기존 동작 무영향).
    if (rewardType === 'exam-complete') {
      const { data: examRow, error: examErr } = await supabase
        .from('entrance_test_results')
        .select('test_id')
        .eq('test_id', sourceId)
        .eq('student_id', rewardStudentId)
        .maybeSingle()
      if (examErr) {
        res.status(200).json({ ok: false, reason: 'exam_lookup_failed' })
        return
      }
      if (!examRow) {
        res.status(200).json({ ok: false, reason: 'exam_result_not_found' })
        return
      }
    }

    // L2.5) 재시도 선판정 — 이 idempotency_key가 이미 있으면 "이미 지급됨"
    //     으로 즉시 응답하고 상한 검사를 건너뛴다. 상한은 "하루에 서로 다른
    //     이벤트 몇 개까지"를 제한하는 것이지, 같은 이벤트의 재시도를 실패로
    //     만들면 안 된다 — 그렇게 하면 상한이 1인 타입(word-session/writing/
    //     daily-goal/streak)에서 정상 재시도가 daily_cap_reached로 응답돼
    //     기존 idempotent 계약이 깨진다(재시도가 실패로 보이면 클라이언트가
    //     또 재시도하는 악순환, 이 파일 상단 주석의 원칙).
    //     unique 인덱스가 걸린 컬럼 조회라 비용이 작고, 최종 방어는 여전히
    //     insert의 23505다(TOCTOU가 나도 DB 제약이 원자적으로 막는다).
    {
      const { data: existing, error: dupErr } = await supabase
        .from('reward_ledger')
        .select('idempotency_key')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (dupErr) {
        // 테이블 미존재는 아래 insert 분기가 무해하게 처리하므로 흘려보낸다.
        if (dupErr.code !== '42P01' && dupErr.code !== 'PGRST205') {
          res.status(200).json({ ok: false, reason: 'dup_check_failed' })
          return
        }
      } else if (existing) {
        res.status(200).json({ ok: true, duplicate: true, stars })
        return
      }
    }

    // L3) 일일 상한 — (student_id, reward_type)별 오늘 지급 건수를 세어
    //     rewardDailyCap()을 넘으면 거부한다. 날짜 경계는 KST 자정
    //     (kstDayStartIso — 학생의 하루는 KST인데 created_at은 UTC라,
    //     UTC 자정으로 세면 09:00 KST에 상한이 리셋되는 엉뚱한 동작이 된다).
    //     sourceId 자유도가 큰 타입(uuid/date:token)의 무제한 반복을
    //     구조적으로 유한하게 만드는 마지막 방어선.
    {
      const cap = rewardDailyCap(rewardType)
      if (cap <= 0) {
        res.status(200).json({ ok: false, reason: 'no_daily_cap_defined' })
        return
      }
      const { count, error: capErr } = await supabase
        .from('reward_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', rewardStudentId)
        .eq('reward_type', rewardType)
        .gte('created_at', new Date(kstDayStartMs(Date.now())).toISOString())
      if (capErr) {
        // 테이블 미존재(42P01/PGRST205)는 아래 insert 분기가 이미 무해하게
        // 처리하므로 여기서는 그대로 흘려보낸다 — 그 외 오류는 fail-closed.
        if (capErr.code !== '42P01' && capErr.code !== 'PGRST205') {
          res.status(200).json({ ok: false, reason: 'cap_check_failed' })
          return
        }
      } else if ((count || 0) >= cap) {
        res.status(200).json({ ok: false, reason: 'daily_cap_reached', cap })
        return
      }
    }

    const { error } = await supabase.from('reward_ledger').insert({
      student_id: rewardStudentId,
      reward_type: rewardType,
      source_type: sourceType,
      source_id: sourceId,
      stars_delta: stars,
      xp_delta: 0, // Reward System V1은 XP를 절대 파생시키지 않는다(rewardEngine.js 헤더 참고)
      idempotency_key: idempotencyKey,
    })

    if (error) {
      if (error.code === DUPLICATE_KEY_VIOLATION) {
        // 이미 지급됨 — 중복 지급 아님, 정상 idempotent 응답(위 xp_ledger
        // 분기와 동일한 원칙).
        res.status(200).json({ ok: true, duplicate: true, stars })
        return
      }
      if (error.code === '42P01' || error.code === 'PGRST205') {
        // reward_ledger 테이블이 아직 없음(supabase_v3_36 미실행) — 학습
        // 흐름을 막지 않도록 조용히 실패 취급(postRewardEvent가 이미
        // 실패를 삼키므로 학생 화면에는 영향 없음).
        res.status(200).json({ ok: false, reason: 'table_missing' })
        return
      }
      res.status(500).json({ error: error.message })
      return
    }

    res.status(200).json({ ok: true, duplicate: false, stars })
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
