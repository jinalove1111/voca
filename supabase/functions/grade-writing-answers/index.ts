// supabase/functions/grade-writing-answers/index.ts
//
// Supabase Edge Function(Deno) — 쓰기 답안 검토 큐 AI 보조 미리보기.
// docs/operations/task2-writing-analysis.md §6-4가 권고한 아키텍처:
// Vercel api/*.js가 12/12(여유 0)이고 admin-pin-actions.js가 자기 헤더
// 주석에서 "다른 신뢰 경로를 이 dispatcher에 섞지 말 것"을 명시했기 때문에,
// 신뢰 경계가 다른(제3자 AI API 호출) 이 기능은 별도 Edge Function으로 둔다.
//
// 2026-07-24(implementer P) — 운영자 명시 비용 결정으로 기본 AI provider를
// Anthropic(claude-haiku-4-5)에서 OpenAI(gpt-5-nano)로 전환했다. provider는
// 코드 재배포 없이 AI_PROVIDER 환경변수만으로 되돌릴 수 있다(§ 아래 env
// 목록). 동시에 "요청당" 상한(MAX_ITEMS_PER_REQUEST/MAX_EST_COST_USD_PER_REQUEST,
// 기존 v2)에 더해 "하루 누적" 상한(MAX_DAILY_COST, ai_usage_daily 테이블,
// 신규 v3.8)을 추가했다 — 서로 다른 남용 시나리오(한 번에 큰 요청 vs 여러
// 번의 작은 요청 누적)를 막는 것이라 하나가 다른 하나를 대체하지 않는다.
//
// 2026-07-24(implementer, provider 추상화 작업) — 운영자 명시 요구사항으로
// OpenAI/Anthropic fetch 호출 코드를 이 파일에서 전부 제거하고
// providers.js의 createAIProvider()가 만드는 Provider 인스턴스만 호출하도록
// 리팩터링했다. 신규 Gemini provider가 추가됐고, AI_PROVIDER/모델 env는
// provider별로 분리됐다(§ 아래 env 목록). 캐시 키도 이 리팩터링과 별개로
// 운영자 요구사항 11에 따라 "모델 무관"으로 바뀌었다(§ pipeline.js
// buildCacheKey 주석 — provider/모델을 바꿔도 기존 AI 판정을 재사용해 비용을
// 아끼는 쪽으로 설계를 의도적으로 뒤집음). 신규 AI_FALLBACK_PROVIDER로 주
// provider 호출 실패 시 배치 단위 1회 폴백 재시도를 지원한다.
//
// ⚠️ 배포는 운영자 수동(에이전트가 실행 불가, DDL과 동일 취급):
//   supabase functions deploy grade-writing-answers
// ⚠️ 시크릿도 운영자 수동(Vercel 환경변수와 별개로 Supabase에 따로 설정):
//   supabase secrets set OPENAI_API_KEY=... ADMIN_PIN=... \
//     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//   (선택, 기본값 그대로 써도 됨) AI_PROVIDER=openai OPENAI_MODEL=gpt-5-nano \
//     MAX_DAILY_COST=2.0 MAX_BATCH_SIZE=20
//   (provider를 되돌리거나 추가하고 싶을 때만)
//     AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=claude-haiku-4-5
//     AI_PROVIDER=gemini GEMINI_API_KEY=... GEMINI_MODEL=gemini-2.5-flash
//   (선택, 주 provider 실패 시 1회 폴백 재시도 — 기본 미설정 = 폴백 없음)
//     AI_FALLBACK_PROVIDER=gemini (폴백 provider의 API 키/모델 env도 함께 설정)
// (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY는 Supabase가 함수 실행 환경에
// 자동 주입하는 경우가 많지만, 프로젝트 설정에 따라 다를 수 있어 명시.)
//
// 브라우저에 API 키 절대 노출 안 됨 — OPENAI_API_KEY/ANTHROPIC_API_KEY/
// GEMINI_API_KEY는 이 함수 실행 환경(Deno.env)에만 존재하고 응답 바디에도
// 포함되지 않는다.
//
// preview-only: 이 함수는 spelling_review_queue를 SELECT만 하고, words나
// spelling_review_queue를 절대 UPDATE/INSERT하지 않는다(캐시 테이블
// spelling_ai_grading_cache/집계 테이블 ai_usage_daily에만 기록 — §12/§16
// 설계 + § 구현 지시 3). 실제 인정/무시는 클라이언트의 기존
// setWordAcceptedMeanings + resolveSpellingReview가 그대로 담당(이 함수가
// 반환하는 proposals는 그 버튼을 누르기 전 참고 자료일 뿐).
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  classifyBatch,
  classifyLocally,
  verifyAdminPin,
  AI_MODEL_ID,
  DEFAULT_AI_PROVIDER,
  DEFAULT_GEMINI_MODEL,
} from './pipeline.js'
import { createAIProvider, safeEstimateCostUsd } from './providers.js'

const CORS_HEADERS = {
  // 관리자 전용 미리보기 API(개인정보 없음, 라이브 쓰기 없음) — Vercel
  // 프론트(voca-drab.vercel.app)에서 크로스오리진 호출을 허용해야 하므로
  // 이 저장소 최초의 CORS 처리 코드(§ 위험 목록: 기존 api/*.js는 동일
  // 오리진이라 이 처리가 필요 없었음).
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function readPositiveNumberEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name)
  if (raw == null || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function readStringEnv(name: string, fallback: string): string {
  const raw = Deno.env.get(name)
  return raw != null && raw.trim() !== '' ? raw.trim() : fallback
}

// pipeline.js buildBatches의 "20~30(설계 제약)" 하드 invariant(node
// scripts/testWritingReviewAiPipeline.mjs 섹션 6이 19/31 둘 다 예외를 던지는
// 것으로 이미 고정 검증됨 — 헌법 규칙 3, 이미 검증된 로직 재구현/변경 금지)를
// 절대 어기면 안 되므로, 운영자가 지정한 MAX_BATCH_SIZE를 10~30이 아니라
// 20~30으로 clamp한다(구현 지시 원문은 "clamp 10..30"이지만, 10~19 범위 값이
// buildBatches에 그대로 전달되면 매 요청마다 예외가 던져져 전체 배치 처리가
// 깨진다 — 그건 "never crash" 요구사항과 정면으로 충돌하므로 의도적으로
// 범위를 좁혔다. § RETURN 보고서에 이 편차를 명시).
function readClampedBatchSizeEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name)
  if (raw == null || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(30, Math.max(20, Math.round(n)))
}

// ── AI provider/model 선택(2026-07-24, provider 추상화 작업) ───────────────
// AI_PROVIDER 기본값은 pipeline.js DEFAULT_AI_PROVIDER('openai')를 그대로
// 따른다(이 파일에 별도 하드코딩 상수를 두지 않음 — 드리프트 방지). 각
// provider의 모델 기본값도 마찬가지로 pipeline.js/여기 상수를 그대로
// 따른다. AI_FALLBACK_PROVIDER는 신규(기본 '' = 폴백 없음) — 값이 있으면
// 주 provider 배치 호출이 throw할 때 그 배치만 1회 폴백 provider로 재시도
// 한다(폴백 provider의 API 키가 없으면 재시도 자체를 생략).
const AI_PROVIDER = readStringEnv('AI_PROVIDER', DEFAULT_AI_PROVIDER)
const OPENAI_MODEL = readStringEnv('OPENAI_MODEL', AI_MODEL_ID)
const GEMINI_MODEL = readStringEnv('GEMINI_MODEL', DEFAULT_GEMINI_MODEL)
// ANTHROPIC_MODEL: pipeline.js AI_MODEL_ID가 더 이상 Anthropic 모델을
// 가리키지 않으므로(이제 'gpt-5-nano'), provider=anthropic 경로가 쓸 기본
// 모델을 여기 별도로 하드코딩해 유지한다(v2 시절 값 그대로, MODEL_PRICING_
// PER_MTOK에도 'claude-haiku-4-5' 항목이 하위호환으로 남아있어 가격 조회는
// 계속 성공한다).
const ANTHROPIC_MODEL = readStringEnv('ANTHROPIC_MODEL', 'claude-haiku-4-5')
const AI_FALLBACK_PROVIDER = readStringEnv('AI_FALLBACK_PROVIDER', '')

// ── 서버 측 비용/남용 상한(구현 지시 3) ─────────────────────────────────
// 셋 다 Deno.env로 운영자가 배포 환경에서 조정 가능(시크릿과 동일하게
// `supabase secrets set MAX_ITEMS_PER_REQUEST=... MAX_EST_COST_USD_PER_REQUEST=... MAX_DAILY_COST=...`).
// 안전한 기본값을 두고, 값이 없거나 숫자로 파싱 안 되거나 0 이하이면
// 기본값으로 폴백한다(운영자가 실수로 빈 문자열/오타를 넣어도 fail-closed로
// 상한이 0이 되어 기능이 전부 막히는 사고를 방지).
const MAX_ITEMS_PER_REQUEST = readPositiveNumberEnv('MAX_ITEMS_PER_REQUEST', 200)
const MAX_EST_COST_USD_PER_REQUEST = readPositiveNumberEnv('MAX_EST_COST_USD_PER_REQUEST', 2.0)
// 2026-07-24(구현 지시 3, 신규) — 하루 누적 상한. 기본 $2.00(운영자가 별도
// 지정 안 하면 요청당 상한과 같은 액수 — 우연이 아니라 "일일 상한이 요청당
// 상한보다 작아지는 이상한 기본 조합"을 피하기 위한 보수적 선택).
const MAX_DAILY_COST = readPositiveNumberEnv('MAX_DAILY_COST', 2.0)
// 2026-07-24(구현 지시 2, 신규) — 배치 크기(§ 위 readClampedBatchSizeEnv
// 주석의 20~30 clamp 이유 참고). 기존엔 25로 하드코딩이었다.
const BATCH_SIZE = readClampedBatchSizeEnv('MAX_BATCH_SIZE', 20)

// 배치 하나당 AI 호출 타임아웃(구현 지시 4, v2에서 이미 도입) — 45초.
// 넘으면 그 배치는 fetch가 AbortError로 reject되고, classifyBatch의 기존
// catch(err) 경로가 그대로 처리한다(review로 강등, decisionSource='ai_error'
// — provider가 무엇이든 이 실패 처리 경로/타임아웃 값은 그대로). providers.js
// 의 각 Provider가 이 값을 생성 시점에 주입받아 자체적으로 fetch에 적용한다.
const AI_BATCH_TIMEOUT_MS = 45000

// 프롬프트 구조(buildAiPrompt) 기준 보수적 추정치 — 배치당 system 프롬프트가
// 고정 블록(약 250 토큰 내외)이고 항목당 user 페이로드는 단어/뜻/답 등
// 짧은 필드 몇 개라 실측상 항목당 150~250 입력 토큰, 60~120 출력 토큰
// 범위였다(§ 20번 테스트 "99건 전량 처리 추정 비용은 10센트 미만" 참고
// 수치와 같은 자릿수). 상한 판정은 "안전 쪽으로 넉넉하게"가 목적이라 항목당
// 250/120으로 다소 여유 있게 잡는다 — 실제 청구는 이보다 낮을 가능성이
// 높고(그래서 상한 통과 후 로그에 찍히는 실제 usage가 이 추정보다 항상
// 작게 나오는 게 정상), 상한을 초과해 거부하는 쪽으로만 보수적이다. 이
// 추정치 자체는 모델/provider와 무관한 "토큰 개수" 추정이라 provider 전환
// 이후에도 그대로 재사용한다(달라지는 건 estimateCostUsd에 넘기는 가격표
// 조회 키뿐).
const EST_INPUT_TOKENS_PER_ITEM = 250
const EST_OUTPUT_TOKENS_PER_ITEM = 120
const EST_SYSTEM_PROMPT_TOKENS_PER_BATCH = 260

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ── 일일 비용 상한(구현 지시 3, 신규) ───────────────────────────────────
// Asia/Seoul 기준 날짜 문자열(YYYY-MM-DD) — 이유는 supabase_v3_8_ai_usage_
// daily.sql 헤더 주석 참고(요약: 이 앱 사용자가 전부 한국 시간대라 "오늘"의
// 경계가 한국 자정이어야 상한이 직관과 맞는다. 서버 시스템 시간대가 UTC일
// 경우 UTC 자정 기준으로 계산하면 한국 기준 같은 날 안에서도 하루가 둘로
// 쪼개져 상한이 의도보다 느슨해진다). Intl.DateTimeFormat으로 타임존을
// 명시해 서버가 어느 시간대에서 돌든 항상 같은 결과를 내게 한다(단순히
// "UTC + 9시간"을 손으로 더하는 방식은 Deno 런타임의 시스템 시간대 가정에
// 의존하게 되어 더 취약하다).
function getSeoulDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

// ai_usage_daily 테이블이 아직 없으면(운영자가 supabase_v3_8 SQL을 아직 안
// 돌린 경우) null을 반환 — 호출부는 이를 "일일 상한 추적 불가, 상한 없이
// 진행"으로 해석한다(요청당 상한은 이 테이블과 무관하게 계속 적용됨,
// 헌법 규칙 9). Postgres 테이블 자체가 없으면 42P01, PostgREST가 스키마
// 캐시를 아직 못 갱신했으면 PGRST205로 오는 경우가 있어 둘 다 "테이블 미존재
// 취급"으로 처리한다.
//
// 2026-07-24(요구사항 9, provider 추상화 작업) — PK가 (usage_date, provider,
// model) 복합으로 바뀌어(§ supabase_v3_8_ai_usage_daily.sql) 하루에 여러
// provider/model 행이 있을 수 있다. 일일 상한 판정은 "오늘 전 provider 행
// 합산" est_cost_usd 기준(상한은 총액)이라 여기서 여러 행을 읽어 합산한다.
// 42703(undefined column, 아직 구 스키마 — provider/model 컬럼이 없는
// 상태)는 별도로 "구 스키마" 취급해 단일 행만 읽는다(§ 헌법 규칙 9 — 코드가
// 새 스키마 마이그레이션보다 먼저 배포돼도 안 깨지게).
async function readTodayUsage(supabase: any, dateStr: string): Promise<{ estCostUsd: number } | null> {
  const { data, error } = await supabase
    .from('ai_usage_daily')
    .select('provider,model,est_cost_usd')
    .eq('usage_date', dateStr)
  if (!error) {
    const rows = data || []
    const estCostUsd = rows.reduce((sum: number, r: any) => sum + (Number(r.est_cost_usd) || 0), 0)
    return { estCostUsd }
  }

  const missing = error.code === '42P01' || error.code === 'PGRST205'
  if (missing) {
    console.warn(JSON.stringify({
      event: 'grade-writing-answers.daily_cap_table_missing',
      error: error.message,
      hint: 'supabase_v3_8_ai_usage_daily.sql 미실행 — 일일 상한 없이 진행(요청당 상한은 계속 적용)',
    }))
    return null
  }

  const legacySchema = error.code === '42703' // provider/model 컬럼 없음(v3.8 이전 구 스키마)
  if (legacySchema) {
    const { data: legacyData, error: legacyErr } = await supabase
      .from('ai_usage_daily').select('est_cost_usd').eq('usage_date', dateStr).maybeSingle()
    if (legacyErr) {
      console.warn(JSON.stringify({
        event: 'grade-writing-answers.daily_cap_read_error',
        error: legacyErr.message,
        hint: '구 스키마(usage_date 단일 PK) 읽기도 실패 — 일일 상한 없이 진행',
      }))
      return null
    }
    console.warn(JSON.stringify({
      event: 'grade-writing-answers.daily_cap_legacy_schema_read',
      hint: 'ai_usage_daily가 구 스키마(provider/model 컬럼 없음) — supabase_v3_8_ai_usage_daily.sql 재실행 권장. 오늘 단일 행만 상한 판정에 사용.',
    }))
    return { estCostUsd: legacyData ? Number(legacyData.est_cost_usd) || 0 : 0 }
  }

  console.warn(JSON.stringify({ event: 'grade-writing-answers.daily_cap_read_error', error: error.message }))
  return null
}

// 오늘 (provider, model) 행에 이번 실행분(실제 AI 호출이 있었을 때만)을
// 더해 누적 저장. 읽고-더하고-쓰는 방식이라(원자적 증가 RPC 아님) 동시에 두
// 관리자가 거의 동시에 실행하면 이론상 카운트가 살짝 어긋날 수 있다 — 이
// 기능은 관리자 1인이 수동으로 트리거하는 저빈도 미리보기 도구라 실용적으로
// 무해하다고 판단했다(완벽한 동시성 보장이 필요해지면 Postgres 함수로 원자적
// 증가를 추가하는 게 다음 개선 지점 — 지금은 헌법 규칙 8 "에이전트는
// DDL/함수를 직접 실행 불가"라 이 SQL 파일에 stored procedure까지 넣지
// 않았다). 실패(테이블 없음 등)해도 조용히 경고만 남기고 응답 자체는 절대
// 막지 않는다.
//
// 2026-07-24(요구사항 9) — (usage_date, provider, model) 행 단위 upsert로
// 변경. 구 스키마(단일 PK, provider/model/토큰 컬럼 없음)로 이미 생성된
// 경우 upsert가 42703(undefined column)으로 실패하면 경고 후 구 스키마
// 형태(usage_date만 onConflict, 토큰/provider/model 미기록)로 1회 재시도
// 폴백한다.
async function accumulateUsageRow(
  supabase: any,
  dateStr: string,
  provider: string,
  model: string,
  delta: { requestCount: number; itemCount: number; inputTokens: number; outputTokens: number; costUsd: number },
): Promise<void> {
  try {
    const { data: existing, error: selErr } = await supabase
      .from('ai_usage_daily')
      .select('request_count,item_count,prompt_tokens,response_tokens,est_cost_usd')
      .eq('usage_date', dateStr).eq('provider', provider).eq('model', model)
      .maybeSingle()

    if (selErr) {
      const missing = selErr.code === '42P01' || selErr.code === 'PGRST205'
      if (missing) {
        console.warn(JSON.stringify({ event: 'grade-writing-answers.daily_cap_table_missing', error: selErr.message }))
        return
      }
      await accumulateUsageRowLegacyFallback(supabase, dateStr, delta, selErr)
      return
    }

    const next = {
      usage_date: dateStr,
      provider,
      model,
      request_count: (existing?.request_count || 0) + delta.requestCount,
      item_count: (existing?.item_count || 0) + delta.itemCount,
      prompt_tokens: (Number(existing?.prompt_tokens) || 0) + delta.inputTokens,
      response_tokens: (Number(existing?.response_tokens) || 0) + delta.outputTokens,
      est_cost_usd: (Number(existing?.est_cost_usd) || 0) + delta.costUsd,
      updated_at: new Date().toISOString(),
    }
    const { error: upsertErr } = await supabase
      .from('ai_usage_daily')
      .upsert(next, { onConflict: 'usage_date,provider,model' })
    if (upsertErr) {
      const missing = upsertErr.code === '42P01' || upsertErr.code === 'PGRST205'
      if (missing) {
        console.warn(JSON.stringify({ event: 'grade-writing-answers.daily_cap_table_missing', error: upsertErr.message }))
        return
      }
      await accumulateUsageRowLegacyFallback(supabase, dateStr, delta, upsertErr)
    }
  } catch (err) {
    console.warn(JSON.stringify({ event: 'grade-writing-answers.daily_cap_write_error', error: String((err as any)?.message || err) }))
  }
}

// 구 스키마(v3.8 이전, usage_date 단일 PK, provider/model/토큰 컬럼 없음)
// 폴백 — 새 스키마 upsert가 컬럼 부재(42703) 등으로 실패했을 때만 호출.
async function accumulateUsageRowLegacyFallback(
  supabase: any,
  dateStr: string,
  delta: { requestCount: number; itemCount: number; costUsd: number },
  origErr: any,
): Promise<void> {
  console.warn(JSON.stringify({
    event: 'grade-writing-answers.daily_cap_write_legacy_schema_fallback',
    error: String(origErr?.message || origErr),
    code: origErr?.code,
    hint: 'supabase_v3_8_ai_usage_daily.sql 재실행 권장(provider/model/토큰 컬럼 추가) — 지금은 구 스키마로 폴백 기록(집계만 유지, provider/model 구분 없음)',
  }))
  try {
    const { data } = await supabase.from('ai_usage_daily').select('request_count,item_count,est_cost_usd').eq('usage_date', dateStr).maybeSingle()
    const next = {
      usage_date: dateStr,
      request_count: (data?.request_count || 0) + delta.requestCount,
      item_count: (data?.item_count || 0) + delta.itemCount,
      est_cost_usd: (Number(data?.est_cost_usd) || 0) + delta.costUsd,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('ai_usage_daily').upsert(next, { onConflict: 'usage_date' })
    if (error) {
      console.warn(JSON.stringify({ event: 'grade-writing-answers.daily_cap_write_error', error: error.message, code: error.code }))
    }
  } catch (err2) {
    console.warn(JSON.stringify({ event: 'grade-writing-answers.daily_cap_write_error', error: String((err2 as any)?.message || err2) }))
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { adminPin?: string; pendingIds?: string[] } | null = null
  try {
    body = await req.json()
  } catch {
    body = null
  }
  const { adminPin, pendingIds } = body || {}

  // 인가가 항상 먼저 — api/admin-pin-actions.js:45-49행과 동일 원칙(어떤
  // 요청이든 adminPin이 틀리면 항상 같은 not_authorized).
  const ADMIN_PIN = Deno.env.get('ADMIN_PIN')
  if (!verifyAdminPin(adminPin, ADMIN_PIN)) {
    // api/verify-admin-pin.js:20-25행과 동일한 지연 — 온라인 브루트포스 완화.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return json({ ok: false, reason: 'not_authorized' })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ ok: false, error: 'Server not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' }, 500)
  }

  // 요청 크기 상한(구현 지시 3) — 인가 통과 후, DB 조회 전에 먼저 거른다.
  // 명시적으로 큰 pendingIds 배열을 보낸 경우 조회 자체를 생략하고 즉시
  // 거부(불필요한 DB 왕복 방지).
  if (Array.isArray(pendingIds) && pendingIds.length > MAX_ITEMS_PER_REQUEST) {
    return json({
      ok: false,
      error: `요청 항목 수(${pendingIds.length}건)가 서버 상한(MAX_ITEMS_PER_REQUEST=${MAX_ITEMS_PER_REQUEST}건)을 초과합니다 — 더 적게 나눠서 요청하세요.`,
    }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // AI provider 인스턴스 — index.ts는 이제 fetch를 직접 호출하지 않고
  // providers.js가 만든 인스턴스의 gradeWritingAnswers/healthCheck/
  // estimateCost만 쓴다(2026-07-24 provider 추상화 작업). 미지 AI_PROVIDER
  // 문자열(운영자 오타)이면 createAIProvider가 조용히 openai로 폴백한다.
  const primaryProvider = createAIProvider({
    provider: AI_PROVIDER,
    apiKeys: { openai: OPENAI_API_KEY, gemini: GEMINI_API_KEY, anthropic: ANTHROPIC_API_KEY },
    models: { openai: OPENAI_MODEL, gemini: GEMINI_MODEL, anthropic: ANTHROPIC_MODEL },
    fetchImpl: fetch,
    timeoutMs: AI_BATCH_TIMEOUT_MS,
    onUnknownProvider: ({ requestedProvider, fallbackProvider }) => {
      console.warn(JSON.stringify({ event: 'grade-writing-answers.unknown_provider_fallback', requestedProvider, fallbackProvider }))
    },
  })
  // 폴백 provider(요구사항 10, 신규) — AI_FALLBACK_PROVIDER가 비어있으면
  // 생성하지 않는다(기본 동작 = 폴백 없음, 기존 review 강등 경로 그대로).
  const fallbackProvider = AI_FALLBACK_PROVIDER
    ? createAIProvider({
      provider: AI_FALLBACK_PROVIDER,
      apiKeys: { openai: OPENAI_API_KEY, gemini: GEMINI_API_KEY, anthropic: ANTHROPIC_API_KEY },
      models: { openai: OPENAI_MODEL, gemini: GEMINI_MODEL, anthropic: ANTHROPIC_MODEL },
      fetchImpl: fetch,
      timeoutMs: AI_BATCH_TIMEOUT_MS,
    })
    : null

  // pending 조회 — SELECT만(§ preview-only). 캐시 테이블 미존재(마이그레이션
  // 미실행) 시에도 500으로 죽지 않고 캐시 없이 진행하도록 아래에서 개별
  // try/catch 처리한다(기존 spellingReviewApi.js의 "테이블 부재 시 조용히
  // 스킵" 관례와 동일 원칙).
  // .limit()도 하드코딩 200 대신 MAX_ITEMS_PER_REQUEST를 그대로 써서 상한을
  // 두 곳(요청 검증/쿼리)이 항상 같은 값을 보게 한다(드리프트 방지).
  let query = supabase
    .from('spelling_review_queue')
    .select('id,word_id,submitted_answer,direction,status,date,created_at,words(word,meaning,accepted_meanings)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(MAX_ITEMS_PER_REQUEST)
  if (Array.isArray(pendingIds) && pendingIds.length > 0) query = query.in('id', pendingIds)

  const { data, error } = await query
  if (error) return json({ ok: false, error: error.message }, 500)

  const items = (data || []).map((r: any) => ({
    id: r.id,
    wordId: r.word_id,
    word: r.words?.word || '(삭제된 단어)',
    meaning: r.words?.meaning || '',
    acceptedMeanings: Array.isArray(r.words?.accepted_meanings) ? r.words.accepted_meanings : [],
    submittedAnswer: r.submitted_answer,
  }))

  // 방어적 재확인(위 .limit()이 이미 막지만, 향후 쿼리 로직이 바뀌어도
  // 상한이 뚫리지 않도록 이중 방어) — 구현 지시 3 "reject larger with 400".
  if (items.length > MAX_ITEMS_PER_REQUEST) {
    return json({
      ok: false,
      error: `조회된 항목 수(${items.length}건)가 서버 상한(MAX_ITEMS_PER_REQUEST=${MAX_ITEMS_PER_REQUEST}건)을 초과합니다.`,
    }, 400)
  }

  // 비용 상한 사전 점검(구현 지시 3) — 실제 AI 호출(classifyBatch) 전에,
  // 로컬 규칙(classifyLocally, 순수 계산·부수효과 없음)으로 이 요청에서
  // "미해결"(로컬로 확정 안 돼 캐시/AI로 넘어갈 가능성이 있는) 항목 수를
  // 먼저 센다. 캐시 히트로 실제 AI 호출은 이보다 적을 수 있지만, 상한은
  // 항상 최악의 경우(캐시 미스 전부)를 가정해야 안전하므로 캐시 조회 전에
  // 미리 계산한다 — "부분 실행 후 중단"이 아니라 "아예 시작 전에 전량 거부".
  // 이 값은 아래 "일일" 상한 판정(구현 지시 3 신규분)에도 그대로 재사용한다
  // (같은 최악-경우 가정을 두 상한 모두에 일관되게 적용). 가격은 주
  // provider(primaryProvider) 기준으로 추정한다 — 폴백은 예외적 경로라
  // 사전 점검 단계에서까지 반영하지 않는다(보수적 추정 목적상 무해).
  const unresolvedByRulesCount = items.filter((it) => !classifyLocally(it).decision).length
  const estimatedBatchCount = Math.ceil(unresolvedByRulesCount / BATCH_SIZE)
  const preflightEstimatedCostUsd = unresolvedByRulesCount > 0
    ? safeEstimateCostUsd({
      inputTokens: unresolvedByRulesCount * EST_INPUT_TOKENS_PER_ITEM
        + estimatedBatchCount * EST_SYSTEM_PROMPT_TOKENS_PER_BATCH,
      outputTokens: unresolvedByRulesCount * EST_OUTPUT_TOKENS_PER_ITEM,
    }, primaryProvider.model)
    : 0
  if (preflightEstimatedCostUsd > MAX_EST_COST_USD_PER_REQUEST) {
    return json({
      ok: false,
      error: `이 요청의 추정 비용(약 $${preflightEstimatedCostUsd.toFixed(4)}, 로컬 규칙으로 확정 안 된 ${unresolvedByRulesCount}건 기준)이 서버 상한(MAX_EST_COST_USD_PER_REQUEST=$${MAX_EST_COST_USD_PER_REQUEST})을 초과합니다 — 더 적은 항목으로 나눠서 다시 요청하세요.`,
      estimatedCostUsd: preflightEstimatedCostUsd,
      unresolvedByRules: unresolvedByRulesCount,
    }, 400)
  }

  let cacheTableMissing = false
  // provider/model별 실사용 누계 버킷(요구사항 9) — 폴백을 쓰면 한 요청
  // 안에서도 배치별로 실제 호출 provider/model이 달라질 수 있어(주 provider
  // 실패 -> 폴백 성공), 단일 합계가 아니라 (provider, model) 키로 나눠
  // 누적한다. ai_usage_daily 기록/응답 usage 계산 둘 다 이 버킷을 쓴다.
  const usageByProviderModel = new Map<string, { provider: string; model: string; inputTokens: number; outputTokens: number; batchCount: number; itemCount: number }>()
  let actualBatchCount = 0
  // cacheStore가 model 컬럼(audit 메타데이터, 캐시 키에는 더 이상 없음)에
  // 채울 값 — 그 시점 직전에 완료된 배치가 실제로 호출한 provider/model로
  // aiClassify가 매 배치 시작 시 갱신한다(classifyBatch는 배치를 순차
  // 처리하므로 cacheStore 호출 시점엔 항상 최신 배치의 값이 맞다).
  let currentAuditModel = primaryProvider.model

  // 캐시 키 형식(2026-07-24, 운영자 요구사항 11로 model 필드 제거 — §
  // pipeline.js buildCacheKey 주석) — pipeline.js buildCacheKey/parseCacheKey
  // 와 반드시 같은 순서(wordId::meaningSnapshot::normalizedAnswer::
  // partOfSpeech::promptVersion, 5필드)를 써야 한다. index.ts는 pipeline.js
  // 의 parseCacheKey를 그대로 쓰지 않고 split만 하는데(원래도 그랬음), 순서만
  // 지키면 되므로 여기서 재구현하지 않고 배열 위치로 꺼낸다.
  const cacheLookup = async (key: string) => {
    if (cacheTableMissing) return null
    const [wordId, meaningSnapshot, normalizedAnswer, partOfSpeech, promptVersion] = key.split('::')
    const { data: cached, error: cacheErr } = await supabase
      .from('spelling_ai_grading_cache')
      .select('decision,confidence,reason,suggested_synonym,part_of_speech_warning,meaning_scope_warning,decision_source')
      .eq('word_id', wordId).eq('meaning_snapshot', meaningSnapshot).eq('normalized_answer', normalizedAnswer)
      .eq('part_of_speech', partOfSpeech).eq('prompt_version', promptVersion)
      .maybeSingle()
    if (cacheErr) { cacheTableMissing = true; return null } // 마이그레이션 미실행 등 — 조용히 스킵
    if (!cached) return null
    return {
      decision: cached.decision, confidence: cached.confidence, reason: cached.reason,
      suggestedSynonym: cached.suggested_synonym, partOfSpeechWarning: cached.part_of_speech_warning,
      meaningScopeWarning: cached.meaning_scope_warning,
      decisionSource: cached.decision_source,
    }
  }

  const cacheStore = async (key: string, decision: any) => {
    if (cacheTableMissing) return
    const [wordId, meaningSnapshot, normalizedAnswer, partOfSpeech, promptVersion] = key.split('::')
    await supabase.from('spelling_ai_grading_cache').upsert({
      word_id: wordId, meaning_snapshot: meaningSnapshot, normalized_answer: normalizedAnswer,
      part_of_speech: partOfSpeech, prompt_version: promptVersion,
      decision: decision.decision, confidence: decision.confidence, reason: decision.reason,
      suggested_synonym: decision.suggestedSynonym, part_of_speech_warning: decision.partOfSpeechWarning,
      meaning_scope_warning: decision.meaningScopeWarning,
      decision_source: decision.decisionSource, model: currentAuditModel,
    }, { onConflict: 'word_id,meaning_snapshot,normalized_answer,part_of_speech,prompt_version' })
    // 실패해도(테이블 없음 등) 무시 — 캐시는 최적화일 뿐, 미리보기 자체를
    // 막으면 안 된다.
  }

  // ── 일일 비용 상한 판정(구현 지시 3, 신규) — 실제 AI 호출 전에 마지막으로
  // 확인한다(요청당 상한 통과 이후). ai_usage_daily가 없으면(테이블 미실행)
  // dailyUsage는 null이고 이 상한은 그냥 적용 안 된다(요청당 상한은 이미 위
  // 에서 통과했으니 계속 진행) — 헌법 규칙 9.
  const todayDateStr = getSeoulDateString()
  const dailyUsage = await readTodayUsage(supabase, todayDateStr)
  let dailyBudgetExceeded = false
  if (dailyUsage) {
    const projectedTotalUsd = dailyUsage.estCostUsd + preflightEstimatedCostUsd
    dailyBudgetExceeded = dailyUsage.estCostUsd >= MAX_DAILY_COST || projectedTotalUsd > MAX_DAILY_COST
  }

  if (dailyBudgetExceeded) {
    // 캐시로 확정 가능한 항목은 여전히 캐시를 쓴다(비용 발생 없음) — "AI
    // 호출만" 건너뛴다는 요구사항과 정확히 일치(§ pipeline.js classifyBatch
    // budgetExceeded 옵션 주석 참고). 실제 유료 AI 호출은 단 한 번도 없음.
    const proposals = await classifyBatch(items, { cacheLookup, cacheStore, batchSize: BATCH_SIZE, budgetExceeded: true })
    console.log(JSON.stringify({
      event: 'grade-writing-answers.daily_budget_exceeded',
      todayUsd: dailyUsage?.estCostUsd ?? null,
      capUsd: MAX_DAILY_COST,
      unresolvedByRules: unresolvedByRulesCount,
      model: primaryProvider.model,
      provider: primaryProvider.name,
    }))
    return json({
      ok: true,
      proposals,
      summary: {
        total: proposals.length,
        accept: proposals.filter((p: any) => p.decision === 'accept').length,
        review: proposals.filter((p: any) => p.decision === 'review').length,
        rejectCandidate: proposals.filter((p: any) => p.decision === 'reject_candidate').length,
        cacheHits: proposals.filter((p: any) => p.cache_hit).length,
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        batchCount: 0,
        estimatedCostUsd: 0,
        model: primaryProvider.model,
        provider: primaryProvider.name,
      },
      // 클라이언트가 정직한 배너를 띄울 수 있도록(§ 구현 지시 3) — todayUsd는
      // 이번 실행 이전(=이번 요청으로는 비용이 추가되지 않았으므로 이후와도
      // 동일) 값 그대로.
      budget: { exceeded: true, todayUsd: dailyUsage?.estCostUsd ?? null, capUsd: MAX_DAILY_COST },
    })
  }

  // healthCheck로 apiKeyPresent=false면(예: OPENAI_API_KEY 미설정)
  // aiClassify가 null이 되어 classifyBatch의 기존 "AI 분류기 미설정" 분기
  // (decision_source='ai_unavailable', review로 강등, 자동 거부 아님)가
  // 그대로 적용된다 — 이 분기를 위해 새 코드를 만들 필요가 전혀 없다(재사용).
  const primaryHealth = primaryProvider.healthCheck()

  const aiClassify = primaryHealth.apiKeyPresent
    ? async (batch: any[]) => {
      actualBatchCount += 1
      const batchIndex = actualBatchCount
      let usedProvider = primaryProvider
      let usedFallback = false
      let batchInputTokens = 0
      let batchOutputTokens = 0
      let decisionsMap: Map<string, any>

      try {
        const result = await primaryProvider.gradeWritingAnswers(batch)
        decisionsMap = result.decisionsMap
        batchInputTokens = result.inputTokens
        batchOutputTokens = result.outputTokens
      } catch (primaryErr) {
        // 폴백(요구사항 10) — AI_FALLBACK_PROVIDER가 설정돼 있고 그 provider
        // 의 API 키가 있을 때만 1회 재시도. 폴백도 실패하면 그 에러를 그대로
        // 위(classifyBatch)로 던져 기존 catch(err) 경로(review 강등,
        // decisionSource='ai_error')가 처리하게 한다 — 새 실패 처리 경로를
        // 만들지 않는다.
        const fallbackHealth = fallbackProvider?.healthCheck()
        if (fallbackProvider && fallbackHealth?.apiKeyPresent) {
          console.warn(JSON.stringify({
            event: 'grade-writing-answers.primary_provider_failed_fallback_retry',
            batchIndex,
            primaryProvider: primaryProvider.name,
            primaryModel: primaryProvider.model,
            fallbackProvider: fallbackProvider.name,
            fallbackModel: fallbackProvider.model,
            error: String((primaryErr as any)?.message || primaryErr),
          }))
          const result = await fallbackProvider.gradeWritingAnswers(batch)
          decisionsMap = result.decisionsMap
          batchInputTokens = result.inputTokens
          batchOutputTokens = result.outputTokens
          usedProvider = fallbackProvider
          usedFallback = true
        } else {
          throw primaryErr
        }
      }

      currentAuditModel = usedProvider.model
      const bucketKey = `${usedProvider.name}::${usedProvider.model}`
      const bucket = usageByProviderModel.get(bucketKey) || {
        provider: usedProvider.name, model: usedProvider.model,
        inputTokens: 0, outputTokens: 0, batchCount: 0, itemCount: 0,
      }
      bucket.inputTokens += batchInputTokens
      bucket.outputTokens += batchOutputTokens
      bucket.batchCount += 1
      bucket.itemCount += batch.length
      usageByProviderModel.set(bucketKey, bucket)

      // 배치별 로깅(구현 지시 3) — 전체 요약 로그와 별개로, 배치마다 실제
      // 응답의 usage(있으면)를 provider 표시와 함께 남긴다.
      console.log(JSON.stringify({
        event: 'grade-writing-answers.batch',
        batchIndex,
        itemCount: batch.length,
        inputTokens: batchInputTokens,
        outputTokens: batchOutputTokens,
        model: usedProvider.model,
        provider: usedProvider.name,
        usedFallback,
      }))
      return decisionsMap
    }
    : null

  const proposals = await classifyBatch(items, { cacheLookup, cacheStore, aiClassify, batchSize: BATCH_SIZE })

  // 응답/로그용 provider/model 요약 — 이번 요청에서 실제로 AI를 호출한
  // (provider, model) 조합이 하나면 그걸, 없으면(전부 캐시/규칙으로 끝남)
  // 구성된 primary provider를, 둘 이상(폴백 등으로 배치마다 달랐던 경우)이면
  // 'mixed'로 정직하게 표시한다(§ 요구사항 13 — 클라이언트 표시용 계약,
  // 없는 사실을 하나로 뭉뚱그려 지어내지 않음).
  const usageBuckets = [...usageByProviderModel.values()]
  let responseProvider: string
  let responseModel: string
  if (usageBuckets.length === 0) {
    responseProvider = primaryProvider.name
    responseModel = primaryProvider.model
  } else if (usageBuckets.length === 1) {
    responseProvider = usageBuckets[0].provider
    responseModel = usageBuckets[0].model
  } else {
    responseProvider = 'mixed'
    responseModel = 'mixed'
  }

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let estimatedCostUsd = 0
  for (const bucket of usageBuckets) {
    totalInputTokens += bucket.inputTokens
    totalOutputTokens += bucket.outputTokens
    estimatedCostUsd += safeEstimateCostUsd({ inputTokens: bucket.inputTokens, outputTokens: bucket.outputTokens }, bucket.model)
  }

  // 일일 누계 갱신(구현 지시 3, 신규 — 요구사항 9로 provider/model별 행 단위
  // upsert로 변경) — 실제로 AI 배치를 1건 이상 보냈을 때만 기록한다(캐시
  // 히트/로컬 규칙만으로 끝난 요청은 비용이 0이라 굳이 테이블에 손댈 필요가
  // 없음 — 불필요한 DB 왕복 최소화). 테이블이 없으면 accumulateUsageRow가
  // 조용히 경고만 남기고 무시한다.
  for (const bucket of usageBuckets) {
    const bucketCostUsd = safeEstimateCostUsd({ inputTokens: bucket.inputTokens, outputTokens: bucket.outputTokens }, bucket.model)
    await accumulateUsageRow(supabase, todayDateStr, bucket.provider, bucket.model, {
      requestCount: bucket.batchCount,
      itemCount: bucket.itemCount,
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
      costUsd: bucketCostUsd,
    })
  }

  // 토큰/비용 로깅 — 새 테이블을 추가로 만들지 않고(§ 분석 문서 §8 "제안
  // 테이블은 안 만듦" 결정과 같은 이유로 로그 테이블도 안 만듦, ai_usage_daily
  // 는 로그가 아니라 상한 집계 전용) 함수 로그(Supabase 대시보드에서 조회
  // 가능)와 응답 바디 양쪽에 남긴다. 구현 지시 3 — model/항목 수/배치 수/
  // 입출력 토큰 합계/캐시 히트/추정 비용을 전부 한 요약 로그에 남긴다
  // (배치별 상세는 위 aiClassify 안의 'grade-writing-answers.batch' 로그가
  // 이미 각각 남김). providerBreakdown은 폴백 등으로 여러 provider/model이
  // 섞였을 때 관찰 가능성을 위해 추가(2026-07-24, provider 추상화 작업).
  console.log(JSON.stringify({
    event: 'grade-writing-answers.run',
    provider: primaryProvider.name,
    model: primaryProvider.model,
    responseProvider,
    responseModel,
    totalItems: items.length,
    batchCount: actualBatchCount,
    unresolvedByRules: proposals.filter((p: any) => p.decision_source === 'ai' || p.decision_source === 'ai_error' || p.decision_source === 'parse_error' || p.decision_source === 'ai_unavailable' || p.decision_source === 'ai_budget_exceeded').length,
    cacheHits: proposals.filter((p: any) => p.cache_hit).length,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    estimatedCostUsd,
    providerBreakdown: usageBuckets.map((b) => ({ provider: b.provider, model: b.model, batchCount: b.batchCount, itemCount: b.itemCount, inputTokens: b.inputTokens, outputTokens: b.outputTokens })),
    maxItemsPerRequest: MAX_ITEMS_PER_REQUEST,
    maxEstCostUsdPerRequest: MAX_EST_COST_USD_PER_REQUEST,
    maxDailyCost: MAX_DAILY_COST,
    todayUsdAfterThisRun: dailyUsage ? dailyUsage.estCostUsd + estimatedCostUsd : null,
  }))

  return json({
    ok: true,
    proposals,
    summary: {
      total: proposals.length,
      accept: proposals.filter((p: any) => p.decision === 'accept').length,
      review: proposals.filter((p: any) => p.decision === 'review').length,
      rejectCandidate: proposals.filter((p: any) => p.decision === 'reject_candidate').length,
      cacheHits: proposals.filter((p: any) => p.cache_hit).length,
    },
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      batchCount: actualBatchCount,
      estimatedCostUsd,
      model: responseModel,
      // 2026-07-24(요구사항 13, provider 추상화 작업) — 클라이언트 표시용
      // 신규 필드. 기존 필드(model 등)는 전부 무변경 유지.
      provider: responseProvider,
    },
    // 정상 실행(상한 미초과) 경로에서도 budget 필드를 항상 포함해 클라이언트가
    // 하나의 필드만 보고 배너를 그릴 수 있게 한다(§ 구현 지시 3 — exceeded는
    // 물론 false, todayUsd는 이번 실행분까지 반영한 값. 테이블이 없으면 정직
    // 하게 null — "0"으로 거짓 표시하지 않음, 헌법 규칙 9/18 정직한 기록).
    budget: {
      exceeded: false,
      todayUsd: dailyUsage ? dailyUsage.estCostUsd + estimatedCostUsd : null,
      capUsd: MAX_DAILY_COST,
    },
  })
})
