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
// ⚠️ 배포는 운영자 수동(에이전트가 실행 불가, DDL과 동일 취급):
//   supabase functions deploy grade-writing-answers
// ⚠️ 시크릿도 운영자 수동(Vercel 환경변수와 별개로 Supabase에 따로 설정):
//   supabase secrets set OPENAI_API_KEY=... ADMIN_PIN=... \
//     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//   (선택, 기본값 그대로 써도 됨) AI_PROVIDER=openai OPENAI_MODEL=gpt-5-nano \
//     MAX_DAILY_COST=2.0 MAX_BATCH_SIZE=20
//   (provider를 되돌리고 싶을 때만) AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... \
//     ANTHROPIC_MODEL=claude-haiku-4-5
// (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY는 Supabase가 함수 실행 환경에
// 자동 주입하는 경우가 많지만, 프로젝트 설정에 따라 다를 수 있어 명시.)
//
// 브라우저에 API 키 절대 노출 안 됨 — OPENAI_API_KEY/ANTHROPIC_API_KEY는 이
// 함수 실행 환경(Deno.env)에만 존재하고 응답 바디에도 포함되지 않는다.
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
  buildAiPrompt,
  parseAiBatchResponse,
  verifyAdminPin,
  estimateCostUsd,
  AI_MODEL_ID,
  DEFAULT_AI_PROVIDER,
} from './pipeline.js'

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

// ── AI provider/model 선택(구현 지시 2, 2026-07-24 신규) ────────────────
// AI_PROVIDER 기본값은 pipeline.js DEFAULT_AI_PROVIDER('openai')를 그대로
// 따른다(이 파일에 별도 하드코딩 상수를 두지 않음 — buildCacheKey의 model
// 드리프트 방지와 같은 원칙). 'anthropic'을 넣으면 기존 v2 경로를 그대로
// 유지한다(코드 삭제 안 함, 운영자가 언제든 되돌릴 수 있게).
const AI_PROVIDER = readStringEnv('AI_PROVIDER', DEFAULT_AI_PROVIDER)
// OPENAI_MODEL 기본값은 AI_MODEL_ID(pipeline.js에서 'gpt-5-nano'로 repoint된
// 값)를 그대로 따른다 — 두 파일이 서로 다른 기본 모델 문자열을 하드코딩해
// 조용히 어긋나는 걸 막기 위함(기존 "MODEL = AI_MODEL_ID" 드리프트 방지
// 원칙과 동일).
const OPENAI_MODEL = readStringEnv('OPENAI_MODEL', AI_MODEL_ID)
// ANTHROPIC_MODEL: pipeline.js AI_MODEL_ID가 더 이상 Anthropic 모델을
// 가리키지 않으므로(이제 'gpt-5-nano'), provider=anthropic 경로가 쓸 기본
// 모델을 여기 별도로 하드코딩해 유지한다(v2 시절 값 그대로, MODEL_PRICING_
// PER_MTOK에도 'claude-haiku-4-5' 항목이 하위호환으로 남아있어 가격 조회는
// 계속 성공한다).
const ANTHROPIC_MODEL = readStringEnv('ANTHROPIC_MODEL', 'claude-haiku-4-5')
const RUNTIME_MODEL = AI_PROVIDER === 'anthropic' ? ANTHROPIC_MODEL : OPENAI_MODEL

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
// — provider가 OpenAI로 바뀌어도 이 실패 처리 경로/타임아웃 값은 그대로).
const AI_BATCH_TIMEOUT_MS = 45000

// 프롬프트 구조(buildAiPrompt) 기준 보수적 추정치 — 배치당 system 프롬프트가
// 고정 블록(약 250 토큰 내외)이고 항목당 user 페이로드는 단어/뜻/답 등
// 짧은 필드 몇 개라 실측상 항목당 150~250 입력 토큰, 60~120 출력 토큰
// 범위였다(§ 20번 테스트 "99건 전량 처리 추정 비용은 10센트 미만" 참고
// 수치와 같은 자릿수). 상한 판정은 "안전 쪽으로 넉넉하게"가 목적이라 항목당
// 250/120으로 다소 여유 있게 잡는다 — 실제 청구는 이보다 낮을 가능성이
// 높고(그래서 상한 통과 후 로그에 찍히는 실제 usage가 이 추정보다 항상
// 작게 나오는 게 정상), 상한을 초과해 거부하는 쪽으로만 보수적이다. 이
// 추정치 자체는 모델/provider와 무관한 "토큰 개수" 추정이라 OpenAI 전환
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// 알 수 없는(가격표에 없는) 모델이 넘어와도 estimateCostUsd가 그대로
// throw하게 두면 이 함수 전체가 500으로 죽는다(운영자가 OPENAI_MODEL을
// 오타로 잘못 설정한 경우 등) — 헌법 규칙 9 "우아한 성능 저하"에 따라
// 알려진 모델 중 가장 비싼 단가(현재 claude-sonnet-5)로 보수적으로(과소
// 추정이 아니라 과대 추정 쪽으로 안전하게) 대체하고 경고만 남긴다. 실제
// MODEL_PRICING_PER_MTOK 조회 자체는 pipeline.js가 소유한 단일 원본이라
// 여기서 그 표를 복제하지 않는다(가격만 하드코딩된 폴백 상수 하나).
function safeEstimateCostUsd(tokens: { inputTokens?: number; outputTokens?: number }, model: string): number {
  try {
    return estimateCostUsd(tokens, model)
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'grade-writing-answers.unknown_model_price',
      model,
      error: String((err as any)?.message || err),
    }))
    const FALLBACK_PRICE_PER_MTOK = { input: 3.0, output: 15.0 } // 알려진 모델 중 최고가(claude-sonnet-5) — 안전 쪽 과대추정
    const inputTokens = tokens.inputTokens ?? 0
    const outputTokens = tokens.outputTokens ?? 0
    return (inputTokens / 1e6) * FALLBACK_PRICE_PER_MTOK.input + (outputTokens / 1e6) * FALLBACK_PRICE_PER_MTOK.output
  }
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
// 취급"으로 처리한다. 그 외 에러(권한 등)도 동일하게 안전한 쪽(상한 없이
// 진행)으로 처리하고 경고만 남긴다 — 이 테이블 접근 실패가 미리보기 기능
// 자체를 막으면 안 된다(§ 캐시 테이블과 동일 원칙).
async function readTodayUsage(supabase: any, dateStr: string): Promise<{ estCostUsd: number } | null> {
  const { data, error } = await supabase
    .from('ai_usage_daily')
    .select('usage_date,request_count,item_count,est_cost_usd')
    .eq('usage_date', dateStr)
    .maybeSingle()
  if (error) {
    const missing = error.code === '42P01' || error.code === 'PGRST205'
    console.warn(JSON.stringify({
      event: missing ? 'grade-writing-answers.daily_cap_table_missing' : 'grade-writing-answers.daily_cap_read_error',
      error: error.message,
      hint: missing ? 'supabase_v3_8_ai_usage_daily.sql 미실행 — 일일 상한 없이 진행(요청당 상한은 계속 적용)' : undefined,
    }))
    return null
  }
  return { estCostUsd: data ? Number(data.est_cost_usd) || 0 : 0 }
}

// 오늘 행에 이번 실행분(실제 AI 호출이 있었을 때만)을 더해 누적 저장.
// 읽고-더하고-쓰는 방식이라(원자적 증가 RPC 아님) 동시에 두 관리자가 거의
// 동시에 실행하면 이론상 카운트가 살짝 어긋날 수 있다 — 이 기능은 관리자
// 1인이 수동으로 트리거하는 저빈도 미리보기 도구라 실용적으로 무해하다고
// 판단했다(완벽한 동시성 보장이 필요해지면 Postgres 함수로 원자적 증가를
// 추가하는 게 다음 개선 지점 — 지금은 헌법 규칙 8 "에이전트는 DDL/함수를
// 직접 실행 불가"라 이 SQL 파일에 stored procedure까지 넣지 않았다). 실패
// (테이블 없음 등)해도 조용히 경고만 남기고 응답 자체는 절대 막지 않는다.
async function accumulateTodayUsage(
  supabase: any,
  dateStr: string,
  deltaRequestCount: number,
  deltaItemCount: number,
  deltaCostUsd: number,
): Promise<void> {
  try {
    const { data } = await supabase
      .from('ai_usage_daily')
      .select('request_count,item_count,est_cost_usd')
      .eq('usage_date', dateStr)
      .maybeSingle()
    const nextRequestCount = (data?.request_count || 0) + deltaRequestCount
    const nextItemCount = (data?.item_count || 0) + deltaItemCount
    const nextCostUsd = (Number(data?.est_cost_usd) || 0) + deltaCostUsd
    await supabase.from('ai_usage_daily').upsert({
      usage_date: dateStr,
      request_count: nextRequestCount,
      item_count: nextItemCount,
      est_cost_usd: nextCostUsd,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'usage_date' })
  } catch (err) {
    console.warn(JSON.stringify({ event: 'grade-writing-answers.daily_cap_write_error', error: String((err as any)?.message || err) }))
  }
}

// OpenAI Structured Outputs(response_format: json_schema, strict)용 스키마 —
// buildAiPrompt/parseAiBatchResponse가 기대하는 "판정 배열"과 정확히 같은
// 항목 모양을 담되, strict 모드 요구사항(모든 속성을 required에 포함,
// nullable은 type 배열로 표현, additionalProperties:false)에 맞춰 object로
// 감싼다. Anthropic 경로는 이미 순수 텍스트로 JSON 배열을 그대로 받으므로
// 이 스키마가 필요 없다(provider=openai 전용).
const OPENAI_GRADING_JSON_SCHEMA = {
  name: 'grading',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pending_answer_id: { type: 'string' },
            decision: { type: 'string', enum: ['accept', 'review', 'reject_candidate'] },
            confidence: { type: 'number' },
            reason: { type: 'string' },
            suggested_synonym: { type: ['string', 'null'] },
            part_of_speech_warning: { type: ['string', 'null'] },
            meaning_scope_warning: { type: ['string', 'null'] },
          },
          required: [
            'pending_answer_id', 'decision', 'confidence', 'reason',
            'suggested_synonym', 'part_of_speech_warning', 'meaning_scope_warning',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['decisions'],
    additionalProperties: false,
  },
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
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
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
  // (같은 최악-경우 가정을 두 상한 모두에 일관되게 적용).
  const unresolvedByRulesCount = items.filter((it) => !classifyLocally(it).decision).length
  const estimatedBatchCount = Math.ceil(unresolvedByRulesCount / BATCH_SIZE)
  const preflightEstimatedCostUsd = unresolvedByRulesCount > 0
    ? safeEstimateCostUsd({
      inputTokens: unresolvedByRulesCount * EST_INPUT_TOKENS_PER_ITEM
        + estimatedBatchCount * EST_SYSTEM_PROMPT_TOKENS_PER_BATCH,
      outputTokens: unresolvedByRulesCount * EST_OUTPUT_TOKENS_PER_ITEM,
    }, RUNTIME_MODEL)
    : 0
  if (preflightEstimatedCostUsd > MAX_EST_COST_USD_PER_REQUEST) {
    return json({
      ok: false,
      error: `이 요청의 추정 비용(약 $${preflightEstimatedCostUsd.toFixed(4)}, 로컬 규칙으로 확정 안 된 ${unresolvedByRulesCount}건 기준)이 서버 상한(MAX_EST_COST_USD_PER_REQUEST=$${MAX_EST_COST_USD_PER_REQUEST})을 초과합니다 — 더 적은 항목으로 나눠서 다시 요청하세요.`,
      estimatedCostUsd: preflightEstimatedCostUsd,
      unresolvedByRules: unresolvedByRulesCount,
    }, 400)
  }

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let actualBatchCount = 0
  let itemsSentToAi = 0
  let cacheTableMissing = false

  // 캐시 키 형식(구현 지시 1, v2) — pipeline.js buildCacheKey/parseCacheKey와
  // 반드시 같은 순서(wordId::meaningSnapshot::normalizedAnswer::
  // partOfSpeech::promptVersion::model)를 써야 한다. index.ts는 pipeline.js
  // 의 parseCacheKey를 그대로 쓰지 않고 split만 하는데(원래도 그랬음),
  // 순서만 지키면 되므로 여기서 재구현하지 않고 배열 위치로 꺼낸다. model
  // 부분은 이제 RUNTIME_MODEL(런타임에 결정된 실제 provider/model)을 쓰는
  // classifyBatch({ modelId: RUNTIME_MODEL, ... }) 호출로 채워지므로, 이
  // 조회/저장 함수 자체는 바뀔 필요가 없다(키 문자열을 그대로 split만 함).
  const cacheLookup = async (key: string) => {
    if (cacheTableMissing) return null
    const [wordId, meaningSnapshot, normalizedAnswer, partOfSpeech, promptVersion, model] = key.split('::')
    const { data: cached, error: cacheErr } = await supabase
      .from('spelling_ai_grading_cache')
      .select('decision,confidence,reason,suggested_synonym,part_of_speech_warning,meaning_scope_warning,decision_source')
      .eq('word_id', wordId).eq('meaning_snapshot', meaningSnapshot).eq('normalized_answer', normalizedAnswer)
      .eq('part_of_speech', partOfSpeech).eq('prompt_version', promptVersion).eq('model', model)
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
    const [wordId, meaningSnapshot, normalizedAnswer, partOfSpeech, promptVersion, model] = key.split('::')
    await supabase.from('spelling_ai_grading_cache').upsert({
      word_id: wordId, meaning_snapshot: meaningSnapshot, normalized_answer: normalizedAnswer,
      part_of_speech: partOfSpeech, prompt_version: promptVersion,
      decision: decision.decision, confidence: decision.confidence, reason: decision.reason,
      suggested_synonym: decision.suggestedSynonym, part_of_speech_warning: decision.partOfSpeechWarning,
      meaning_scope_warning: decision.meaningScopeWarning,
      decision_source: decision.decisionSource, model: model || RUNTIME_MODEL,
    }, { onConflict: 'word_id,meaning_snapshot,normalized_answer,part_of_speech,prompt_version,model' })
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
    const proposals = await classifyBatch(items, { cacheLookup, cacheStore, batchSize: BATCH_SIZE, modelId: RUNTIME_MODEL, budgetExceeded: true })
    console.log(JSON.stringify({
      event: 'grade-writing-answers.daily_budget_exceeded',
      todayUsd: dailyUsage?.estCostUsd ?? null,
      capUsd: MAX_DAILY_COST,
      unresolvedByRules: unresolvedByRulesCount,
      model: RUNTIME_MODEL,
      provider: AI_PROVIDER,
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
        model: RUNTIME_MODEL,
      },
      // 클라이언트가 정직한 배너를 띄울 수 있도록(§ 구현 지시 3) — todayUsd는
      // 이번 실행 이전(=이번 요청으로는 비용이 추가되지 않았으므로 이후와도
      // 동일) 값 그대로.
      budget: { exceeded: true, todayUsd: dailyUsage?.estCostUsd ?? null, capUsd: MAX_DAILY_COST },
    })
  }

  // provider별 활성 API 키 — 없으면(구현 지시 2 "OPENAI_API_KEY 없으면 기존
  // ANTHROPIC_API_KEY 없음 경로와 동일하게 동작") aiClassify가 null이 되어
  // classifyBatch의 기존 "AI 분류기 미설정" 분기(decision_source=
  // 'ai_unavailable', review로 강등, 자동 거부 아님)가 그대로 적용된다 —
  // 이 분기를 위해 새 코드를 만들 필요가 전혀 없다(재사용).
  const activeApiKey = AI_PROVIDER === 'anthropic' ? ANTHROPIC_API_KEY : OPENAI_API_KEY

  const aiClassify = activeApiKey
    ? async (batch: any[]) => {
      actualBatchCount += 1
      itemsSentToAi += batch.length
      const batchIndex = actualBatchCount
      const { system, user } = buildAiPrompt(batch)
      // 배치당 타임아웃(구현 지시 4) — AI_BATCH_TIMEOUT_MS(45초) 안에 응답이
      // 안 오면 AbortController가 fetch를 중단시키고, fetch()는 AbortError로
      // reject된다. 이 함수 안에서 따로 잡지 않고 그대로 위(classifyBatch)로
      // 전파시킨다 — classifyBatch의 기존 catch(err) 블록이 이미 "그 배치의
      // 모든 항목을 review로 강등, decisionSource='ai_error'"를 처리하므로
      // 타임아웃 전용 별도 실패 경로를 새로 만들 필요가 없다(자동 accept
      // 절대 없음, 기존 실패 처리와 완전히 동일 — provider 무관).
      let batchInputTokens = 0
      let batchOutputTokens = 0
      let rawDecisionsText = ''

      if (AI_PROVIDER === 'openai') {
        // OpenAI Chat Completions + Structured Outputs(json_schema, strict).
        // messages 구성은 기존 Anthropic 경로의 system/user 분리를 그대로
        // 따른다(같은 buildAiPrompt 결과, 같은 배치 내용) — 프롬프트 내용
        // 자체는 provider와 무관하게 완전히 동일. temperature는 의도적으로
        // 생략(구현 지시 2 — 일부 최신 모델은 커스텀 temperature 미지원이라
        // 기본값을 그대로 둔다).
        const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: RUNTIME_MODEL,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: { type: 'json_schema', json_schema: OPENAI_GRADING_JSON_SCHEMA },
          }),
        }, AI_BATCH_TIMEOUT_MS)
        const respJson = await res.json()
        if (!res.ok) throw new Error(respJson?.error?.message || `OpenAI API ${res.status}`)
        batchInputTokens = respJson?.usage?.prompt_tokens || 0
        batchOutputTokens = respJson?.usage?.completion_tokens || 0
        const content = respJson?.choices?.[0]?.message?.content || ''
        // strict json_schema 응답은 {"decisions":[...]} 형태의 JSON 문자열 —
        // parseAiBatchResponse(pipeline.js, provider 무관 공용)는 최상위가
        // "배열"인 텍스트를 기대하므로(§ 섹션 8/9 테스트가 이미 그 계약을
        // 고정), 여기서 decisions 배열만 뽑아 다시 문자열로 만들어 넘긴다 —
        // parseAiBatchResponse 자체의 계약/검증(isValidAiDecision)은 전혀
        // 안 건드리고 그대로 재사용.
        try {
          const parsedContent = JSON.parse(content)
          const decisionsArray = Array.isArray(parsedContent) ? parsedContent : (parsedContent?.decisions ?? [])
          rawDecisionsText = JSON.stringify(decisionsArray)
        } catch {
          // 파싱 실패 시 원문 그대로 넘겨 parseAiBatchResponse가 빈 Map을
          // 반환하게 한다(§ 기존 파싱 실패 -> review 강등 계약, 섹션 9와
          // 동일 경로 — 여기서 별도 처리 안 함).
          rawDecisionsText = content
        }
      } else {
        // 기존 Anthropic 경로(v2, 무변경) — AI_PROVIDER=anthropic일 때만.
        const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY as string,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: RUNTIME_MODEL,
            max_tokens: 2000,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        }, AI_BATCH_TIMEOUT_MS)
        const respJson = await res.json()
        if (!res.ok) throw new Error(respJson?.error?.message || `Anthropic API ${res.status}`)
        batchInputTokens = respJson?.usage?.input_tokens || 0
        batchOutputTokens = respJson?.usage?.output_tokens || 0
        rawDecisionsText = (respJson?.content || []).find((b: any) => b.type === 'text')?.text || ''
      }

      totalInputTokens += batchInputTokens
      totalOutputTokens += batchOutputTokens
      // 배치별 로깅(구현 지시 3) — 전체 요약 로그와 별개로, 배치마다 실제
      // 응답의 usage(있으면)를 provider 표시와 함께 남긴다.
      console.log(JSON.stringify({
        event: 'grade-writing-answers.batch',
        batchIndex,
        itemCount: batch.length,
        inputTokens: batchInputTokens,
        outputTokens: batchOutputTokens,
        model: RUNTIME_MODEL,
        provider: AI_PROVIDER,
      }))
      return parseAiBatchResponse(rawDecisionsText)
    }
    : null

  const proposals = await classifyBatch(items, { cacheLookup, cacheStore, aiClassify, batchSize: BATCH_SIZE, modelId: RUNTIME_MODEL })
  const estimatedCostUsd = safeEstimateCostUsd({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, RUNTIME_MODEL)

  // 일일 누계 갱신(구현 지시 3, 신규) — 실제로 AI 배치를 1건 이상 보냈을
  // 때만 기록한다(캐시 히트/로컬 규칙만으로 끝난 요청은 비용이 0이라 굳이
  // 테이블에 손댈 필요가 없음 — 불필요한 DB 왕복 최소화). 테이블이 없으면
  // accumulateTodayUsage가 조용히 경고만 남기고 무시한다.
  if (actualBatchCount > 0) {
    await accumulateTodayUsage(supabase, todayDateStr, actualBatchCount, itemsSentToAi, estimatedCostUsd)
  }

  // 토큰/비용 로깅 — 새 테이블을 추가로 만들지 않고(§ 분석 문서 §8 "제안
  // 테이블은 안 만듦" 결정과 같은 이유로 로그 테이블도 안 만듦, ai_usage_daily
  // 는 로그가 아니라 상한 집계 전용) 함수 로그(Supabase 대시보드에서 조회
  // 가능)와 응답 바디 양쪽에 남긴다. 구현 지시 3 — model/항목 수/배치 수/
  // 입출력 토큰 합계/캐시 히트/추정 비용을 전부 한 요약 로그에 남긴다
  // (배치별 상세는 위 aiClassify 안의 'grade-writing-answers.batch' 로그가
  // 이미 각각 남김).
  console.log(JSON.stringify({
    event: 'grade-writing-answers.run',
    provider: AI_PROVIDER,
    model: RUNTIME_MODEL,
    totalItems: items.length,
    batchCount: actualBatchCount,
    unresolvedByRules: proposals.filter((p: any) => p.decision_source === 'ai' || p.decision_source === 'ai_error' || p.decision_source === 'parse_error' || p.decision_source === 'ai_unavailable' || p.decision_source === 'ai_budget_exceeded').length,
    cacheHits: proposals.filter((p: any) => p.cache_hit).length,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    estimatedCostUsd,
    maxItemsPerRequest: MAX_ITEMS_PER_REQUEST,
    maxEstCostUsdPerRequest: MAX_EST_COST_USD_PER_REQUEST,
    maxDailyCost: MAX_DAILY_COST,
    todayUsdAfterThisRun: dailyUsage ? dailyUsage.estCostUsd + (actualBatchCount > 0 ? estimatedCostUsd : 0) : null,
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
      model: RUNTIME_MODEL,
    },
    // 정상 실행(상한 미초과) 경로에서도 budget 필드를 항상 포함해 클라이언트가
    // 하나의 필드만 보고 배너를 그릴 수 있게 한다(§ 구현 지시 3 — exceeded는
    // 물론 false, todayUsd는 이번 실행분까지 반영한 값. 테이블이 없으면 정직
    // 하게 null — "0"으로 거짓 표시하지 않음, 헌법 규칙 9/18 정직한 기록).
    budget: {
      exceeded: false,
      todayUsd: dailyUsage ? dailyUsage.estCostUsd + (actualBatchCount > 0 ? estimatedCostUsd : 0) : null,
      capUsd: MAX_DAILY_COST,
    },
  })
})
