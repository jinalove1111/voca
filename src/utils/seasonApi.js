// src/utils/seasonApi.js — Seasonal Progression(GAME_DESIGN.md 9번 섹션)
// 클라이언트 접근 레이어. wordKingApi.js와 같은 분리 원칙: 순수 계산
// (src/utils/ticketEconomy.js sumTicketBalanceSince / src/utils/
// houseSystem.js computeHouseSeasonScores)과 완전히 분리, 이 파일만 DB/
// 서버 API를 안다. `seasons` 테이블도 word_king_history와 같은 "anon
// read-only + service_role 전용 쓰기" 패턴이라 이 파일 구조도
// wordKingApi.js를 그대로 재사용했다(새 패턴 발명 없음).
//
// 핵심 안전 원칙(supabase_v2_8_seasonal_progression.sql이 아직 실행 안 된
// 상태로 이 코드가 먼저 배포돼도 앱이 절대 깨지지 않아야 함): 조회는 에러
// (테이블 없음 포함)를 절대 던지지 않고 null로 폴백한다 — Ticket/House
// 표시가 "시즌 없음" 상태(=기존 전체 누적 값 그대로)로 안전하게 유지된다.
import { supabase } from './supabaseClient'

// 가장 최근(=현재) 시즌 경계. 시즌이 한 번도 시작된 적 없으면(SQL 미실행
// 포함) null — 호출부는 null이면 "시즌 없음, 전체 누적 값 사용"으로 처리.
export async function fetchCurrentSeason() {
  const { data, error } = await supabase
    .from('seasons')
    .select('id, started_at, note')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return { id: data.id, startedAt: data.started_at, note: data.note }
}

// 관리자 "새 시즌 시작" 버튼 — 실제 쓰기는 서버(service_role,
// api/start-new-season.js)가 전부 수행. 에러는 던짐(관리자 alert 처리,
// wordKingApi.js triggerComputeWordKing과 동일 관례).
export async function triggerStartNewSeason({ note, adminPin } = {}) {
  const res = await fetch('/api/start-new-season', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, adminPin }),
  })
  let body = null
  try { body = await res.json() } catch { /* JSON 아닌 응답도 아래에서 처리 */ }
  if (!res.ok || !body || body.ok === false) {
    throw new Error(body?.reason || body?.error || `시즌 시작 실패 (HTTP ${res.status})`)
  }
  return body // { ok:true, season: { id, startedAt, note } }
}
