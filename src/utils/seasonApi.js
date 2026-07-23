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
//
// 2026-07-23(season-system-specialist) — 시즌 생애주기 확장(시즌 번호/
// 종료일/활성 플래그, supabase_v3_5_season_lifecycle.sql)에 맞춰 확장:
// 1) 확장 컬럼(season_number/ended_at/is_active) 조회를 우선 시도하고,
//    컬럼 자체가 없는 환경(v3_5 미실행)에서는 기존 v2_8 시절 컬럼만으로
//    폴백한다(규칙 9, 실행 순서 무관 안전).
// 2) fetchCurrentSeasonDetailed()를 신설 — 기존 fetchCurrentSeason()은
//    (Dashboard.jsx 등 학생 화면이 쓰므로) 모든 에러를 여전히 null로
//    삼켜 안전하게 유지하되, 관리자 화면(SeasonPanel)은 이 신규 함수로
//    "테이블/컬럼 없음"(정상적인 SQL 미실행 상태)과 "진짜 조회 실패"
//    (네트워크/권한 등)를 구분해서 볼 수 있다 — 기존 fetchCurrentSeason은
//    이 둘을 구분 없이 null로 뭉뚱그려서 "시즌이 없다"와 "조회에 실패했다"
//    를 관리자가 혼동하게 만드는 season-readiness 오판정 소지가 있었다.
import { supabase } from './supabaseClient'

// PostgREST/Postgres가 "요청한 컬럼/테이블이 없다"는 뜻으로 돌려주는
// 코드 — 전부 "정상적인 SQL 미실행 상태"로 취급(에러 아님). 42703=
// undefined_column, 42P01=undefined_table, PGRST204/PGRST205=PostgREST
// 스키마 캐시에 해당 컬럼/테이블이 없음(api/start-new-season.js의
// TABLE_MISSING_CODES와 같은 계열, 컬럼 버전 추가).
const NOT_READY_CODES = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

// season_number/ended_at/is_active(supabase_v3_5_season_lifecycle.sql) 포함
// 조회 — "현재 시즌" = is_active=true인 행(DB가 유일성을 보장). 컬럼이
// 아직 없는 환경에서는 42703으로 실패 -> selectLegacy()로 폴백.
async function selectExtended() {
  return supabase
    .from('seasons')
    .select('id, started_at, note, season_number, ended_at, is_active')
    .eq('is_active', true)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

// v2_8 시절 기본 컬럼만(하위호환 폴백) — "가장 최근 started_at 행 = 현재
// 시즌"이라는 기존 암묵적 관례 그대로(is_active 개념이 없던 시절 동작과
// 100% 동일, 회귀 없음).
async function selectLegacy() {
  return supabase
    .from('seasons')
    .select('id, started_at, note')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

function mapRow(data) {
  if (!data) return null
  return {
    id: data.id,
    startedAt: data.started_at,
    note: data.note ?? null,
    // v3_5 미실행 환경(selectLegacy 경로)에서는 아래 3개가 항상 null —
    // 호출부는 "번호 없음"으로 표시하면 된다(SeasonPanel).
    seasonNumber: typeof data.season_number === 'number' ? data.season_number : null,
    endedAt: data.ended_at ?? null,
    isActive: typeof data.is_active === 'boolean' ? data.is_active : null,
  }
}

// 관리자 화면 전용 — 조회 실패의 "진짜 이유"를 구분해서 돌려준다. 기존
// fetchCurrentSeason()처럼 모든 에러를 뭉뚱그려 null(="시즌 없음")로
// 삼키면, 관리자가 진짜 에러(권한/네트워크 등)를 "아직 시작 안 했다"로
// 오판하게 된다(season-readiness 오판정 버그, 2026-07-23 감사에서 발견).
// 반환: { season: {...}|null, error: null|{code,message,details,hint} }
// error가 null이 아니면 "테이블/컬럼 없음이 아닌 진짜 조회 실패"를 뜻함
// — season은 이 경우 항상 null(신뢰할 수 없는 상태).
export async function fetchCurrentSeasonDetailed() {
  let res = await selectExtended()
  if (res.error && NOT_READY_CODES.has(res.error.code)) {
    res = await selectLegacy()
  }
  if (res.error) {
    if (NOT_READY_CODES.has(res.error.code)) {
      // v2_8도 아직 실행 전(테이블 자체가 없음) — 정상적인 "시즌 없음" 상태.
      return { season: null, error: null }
    }
    return {
      season: null,
      error: {
        code: res.error.code ?? null,
        message: res.error.message ?? String(res.error),
        details: res.error.details ?? null,
        hint: res.error.hint ?? null,
      },
    }
  }
  return { season: mapRow(res.data), error: null }
}

// 가장 최근(=현재) 시즌 경계. 시즌이 한 번도 시작된 적 없으면(SQL 미실행
// 포함) null — 호출부는 null이면 "시즌 없음, 전체 누적 값 사용"으로 처리.
// 기존 시그니처/동작 100% 유지(Dashboard.jsx 등 기존 호출부 무회귀) —
// 학생 화면은 에러를 노출하지 않는다는 기존 원칙 그대로, 진짜 에러도
// 여전히 null로 안전 폴백한다. 진단이 필요한 관리자 화면은
// fetchCurrentSeasonDetailed()를 쓴다.
export async function fetchCurrentSeason() {
  const { season } = await fetchCurrentSeasonDetailed()
  return season
}

// 관리자 "새 시즌 시작" 버튼 — 실제 쓰기는 서버(service_role,
// api/start-new-season.js)가 전부 수행. 에러는 던짐(관리자 alert 처리,
// wordKingApi.js triggerComputeWordKing과 동일 관례) — code/details/hint가
// 응답에 있으면 Error 객체에 실어 호출부(AdminScreen SeasonPanel)가 상세
// 사유를 그대로 보여줄 수 있게 한다(에러 표면화, 2026-07-23 season-system-
// specialist 라운드에서 추가 — 이전에는 message 한 줄만 던졌다).
export async function triggerStartNewSeason({ note, adminPin } = {}) {
  const res = await fetch('/api/start-new-season', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, adminPin }),
  })
  let body = null
  try { body = await res.json() } catch { /* JSON 아닌 응답도 아래에서 처리 */ }
  if (!res.ok || !body || body.ok === false) {
    const err = new Error(body?.reason || body?.error || `시즌 시작 실패 (HTTP ${res.status})`)
    if (body?.reason) err.reason = body.reason
    if (body?.code) err.code = body.code
    if (body?.details) err.details = body.details
    if (body?.hint) err.hint = body.hint
    throw err
  }
  return body // { ok:true, season: { id, startedAt, note, seasonNumber, endedAt, isActive } }
}
