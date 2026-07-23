// Vercel Serverless Function — Seasonal Progression(게임화 하위카드 9번)의
// 유일한 쓰기 경로. 2026-07-19, PROJECT_BOARD.md 게임화 하위카드 9번,
// GAME_DESIGN.md 9번 섹션.
//
// 이 저장소에는 스케줄러(cron)가 없다(Infra Head 영역, Engineering Head가
// 발명하지 않음) — 그래서 시즌 전환도 Word King(api/compute-word-king.js)
// 과 같은 "관리자가 버튼을 눌러 수동 트리거"하는 방식이다.
// AdminScreen.jsx의 SeasonPanel이 유일한 호출자.
//
// 이 API는 `seasons` 테이블에 새 경계 행 하나만 추가한다 — 어떤 기존
// 테이블/컬럼도 UPDATE/DELETE하지 않는다(레벨/뱃지/스트릭/xp_ledger/
// ticketLedger/House 배정 전부 무관, 원장은 append-only 그대로 유지 —
// supabase_v2_8_seasonal_progression.sql 헤더 "리셋의 실제 의미" 참고).
// "리셋"은 클라이언트가 이 새 경계 이후 항목만 다시 합산해서 만드는
// 파생 결과일 뿐(src/utils/ticketEconomy.js sumTicketBalanceSince,
// src/utils/houseSystem.js computeHouseSeasonScores).
//
// 관리자 재인증: 이 액션은 전교생의 Ticket/House 표시 기준일을 한 번에
// 바꾸는 전역 액션이다(파괴적이진 않음 — 원장은 그대로, 경계 마커만
// 추가) — anon이 직접 쓸 수 있으면 학생 누구나 가짜 경계를 넣어 전교생의
// 시즌 표시를 임의로 리셋시키는 장난(그리핑)이 가능해지므로,
// checkAdminReauth로 요청마다 재확인한다(compute-word-king.js와 동일 패턴).
//
// 2026-07-23(season-system-specialist) — 원자적 전환 RPC 배선 추가.
// 이전 버전(2026-07-19)은 seasons 테이블에 단순 insert 한 줄만 해서
// (a) 시즌 번호/종료일/활성 플래그 개념이 아예 없었고 (b) 더블클릭/
// 재시도로 두 요청이 거의 동시에 들어오면 두 개의 "새 시즌" 행이 원자성
// 없이 둘 다 insert될 수 있었다(중복 실행 보호 없음). 이제 1순위로
// supabase_v3_5_season_lifecycle.sql의 `start_new_season` RPC(단일 함수
// 호출 = 암묵적 트랜잭션 1개, advisory lock으로 동시 호출 직렬화 +
// is_active 유일성 unique index로 이중 방어)를 호출한다 — "현재 활성
// 시즌 종료 + 새 시즌 시작"이 원자적으로 처리된다. 그 RPC가 아직 없는
// 환경(이 SQL 미실행, v2_8까지만 실행된 상태)에서는 PGRST202/42883
// (함수 없음)으로 실패하므로, 이 경우에만 v2_8 시절의 단순 insert
// 폴백으로 내려간다(규칙 9 — 마이그레이션 실행 순서 무관 안전, 기존
// 동작 100% 보존).
import { createClient } from '@supabase/supabase-js'
import { checkAdminReauth, supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'

const TABLE_MISSING_CODES = new Set(['42P01', 'PGRST205'])
const RPC_MISSING_CODES = new Set(['PGRST202', '42883'])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!checkAdminReauth(req, res)) return

  const url = supabaseAdminUrl()
  const key = supabaseAdminKey()
  if (!url || !key) {
    res.status(500).json({ error: 'Server not configured: SUPABASE_URL / key missing' })
    return
  }

  // note는 순수 참고용 텍스트(길이 방어만) — 어떤 계산/집계 로직도 이
  // 값을 파싱하지 않는다(seasons 테이블 헤더 주석 참고).
  const note = typeof req.body?.note === 'string' && req.body.note.trim().length > 0
    ? req.body.note.trim().slice(0, 200)
    : null

  const supabase = createClient(url, key)

  // 1순위: 원자적 RPC(supabase_v3_5_season_lifecycle.sql).
  const rpcRes = await supabase.rpc('start_new_season', { p_note: note })
  if (!rpcRes.error) {
    const row = Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data
    if (!row) {
      res.status(500).json({ error: 'start_new_season RPC returned no row' })
      return
    }
    res.status(200).json({
      ok: true,
      season: {
        id: row.id,
        startedAt: row.started_at,
        note: row.note,
        seasonNumber: row.season_number ?? null,
        endedAt: row.ended_at ?? null,
        isActive: row.is_active ?? null,
      },
    })
    return
  }

  if (!RPC_MISSING_CODES.has(rpcRes.error.code)) {
    // RPC는 존재하는데 실행 중 실패(제약 위반/타임아웃 등) — table_missing
    // (테이블 자체가 없는 v2_8 미실행 상태)과는 별개로 그대로 표면화한다.
    if (TABLE_MISSING_CODES.has(rpcRes.error.code)) {
      res.status(200).json({ ok: false, reason: 'table_missing' })
      return
    }
    res.status(500).json({
      error: rpcRes.error.message,
      code: rpcRes.error.code ?? null,
      details: rpcRes.error.details ?? null,
      hint: rpcRes.error.hint ?? null,
    })
    return
  }

  // 2순위(레거시 폴백, supabase_v3_5 미실행 환경) — v2_8 시절 그대로의
  // 단순 insert. season_number/ended_at/is_active 개념 없이 note만 저장.
  const { data, error } = await supabase
    .from('seasons')
    .insert({ note })
    .select('id, started_at, note')
    .single()

  if (error) {
    if (TABLE_MISSING_CODES.has(error.code)) {
      res.status(200).json({ ok: false, reason: 'table_missing' })
      return
    }
    res.status(500).json({ error: error.message, code: error.code ?? null, details: error.details ?? null, hint: error.hint ?? null })
    return
  }

  res.status(200).json({
    ok: true,
    season: { id: data.id, startedAt: data.started_at, note: data.note, seasonNumber: null, endedAt: null, isActive: null },
  })
}
