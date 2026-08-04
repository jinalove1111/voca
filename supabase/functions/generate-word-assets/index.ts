// supabase/functions/generate-word-assets/index.ts
//
// Supabase Edge Function(Deno) — Word Asset Library(word_assets)용 AI 생성
// 미리보기. cefr/pronunciation_uk/example_sentence(+example_translation)/
// part_of_speech 4개 필드만 AI로 채우고, DB에는 아무 것도 쓰지 않는다(§
// pipeline.js 헤더 "DB 쓰기 없음"). 실제 upsert는 admin-content-write의
// word_asset.upsert_bulk 액션이 이 함수의 응답을 그대로 실어 별도 호출한다
// (호출자가 두 함수를 순서대로 부르는 구조 — 이 함수가 직접 쓰면
// upsert_bulk의 "기존 값 보존" 클라이언트 보호 규칙을 우회하게 된다).
//
// 왜 grade-writing-answers에 모드를 추가하지 않았나(오케스트레이터 확정
// 설계, 재조사 불필요): 그 함수는 프롬프트/JSON 스키마/캐시(spelling_ai_
// grading_cache)가 전부 "채점" 전용으로 결합돼 있어 분기를 넣으면 결합도만
// 올라간다. admin-content-write에도 넣지 않았다 — 거긴 빠른 CRUD
// dispatcher이고, 이 함수처럼 수십 초 걸리는 외부 AI 호출과는 신뢰 경계와
// 지연 특성이 다르다(admin-content-write/index.ts 헤더의 "Vercel 12/12
// 한도라 새 Edge Function을 쓴다"는 선례를 여기서도 그대로 따름).
//
// Supabase Edge Function은 Vercel 서버리스 함수 12/12 한도(Hobby 플랜)와
// 무관하다 — 이 함수를 새로 만들어도 api/ 디렉터리 파일 개수는 그대로다.
// 시크릿(OPENAI_API_KEY/ADMIN_PIN/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)도
// Supabase 프로젝트 전역이라 grade-writing-answers가 이미 설정해 뒀다면
// 이 함수도 추가 등록 없이 즉시 같은 값을 쓴다.
//
// ── 비용/예산 ────────────────────────────────────────────────────────────
// 모델은 gpt-5-nano(provider openai) 고정 기본값 — grade-writing-answers/
// pipeline.js의 AI_MODEL_ID/DEFAULT_AI_PROVIDER를 그대로 import해서 쓴다
// (이 저장소 기본 모델을 새로 하드코딩하지 않고 재사용 — 드리프트 방지).
// ai_usage_daily 테이블을 그대로 재사용하고, 채점(grade-writing-answers)과
// "같은 예산 풀"을 공유한다 — 그 테이블 PK가 (usage_date, provider, model)
// 이라 기능 구분 컬럼이 없기 때문이다. 가짜 provider 문자열로 억지 분리하지
// 않고, 대신 이 사실을 아래 usage 응답의 sharedBudgetPool 필드와 여기 주석에
// 명시한다 — MAX_DAILY_COST 환경변수 이름도 grade-writing-answers/index.ts와
// 의도적으로 동일하게 맞췄다(Supabase 시크릿이 프로젝트 전역이므로 운영자가
// 이미 설정한 하루 총 예산 상한을 두 기능이 자동으로 공유한다). 반대로
// "요청당" 상한(WORD_ASSET_MAX_ITEMS_PER_REQUEST 등)은 기능별 튜닝값이라
// grade-writing-answers의 이름과 겹치지 않게 별도 이름을 썼다(한쪽 기능의
// 요청 크기 조정이 다른 쪽에 의도치 않게 영향을 주지 않도록).
//
// readTodayUsage/accumulateUsageRow(폴백 2단계 포함)는 grade-writing-answers/
// index.ts의 동명 함수와 정확히 동일한 동작을 하도록 이 파일에 복제했다 —
// export되지 않은 함수라 import가 불가능해서다(Deno 함수 간에는 supabase
// functions deploy 단위가 서로 다른 배포 아티팩트라, "복제"가 이 저장소의
// 기존 관례이기도 하다 — admin-content-write/index.ts의 planWordsBulkReplace
// 사본, 이 함수의 pipeline.js/providers.js에 있는 verifyAdminPin/
// fetchWithTimeout 사본과 동일 원칙). 반대로 estimateCostUsd/
// MODEL_PRICING_PER_MTOK는 순수 export라 그대로 import했다(가격표 복제는
// 드리프트 위험이 있어 명시적으로 피함, § 아래 import문).
//
// ⚠️ 배포는 운영자 수동(에이전트가 실행 불가, DDL과 동일 취급):
//   supabase functions deploy generate-word-assets
// ⚠️ 시크릿: OPENAI_API_KEY/ADMIN_PIN/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY는
//   grade-writing-answers가 이미 설정했다면 추가 작업 없이 그대로 쓸 수 있다
//   (`supabase secrets list`로 먼저 확인). 없으면:
//   supabase secrets set OPENAI_API_KEY=... ADMIN_PIN=... \
//     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//   (선택, 기본값 그대로 써도 됨)
//   supabase secrets set WORD_ASSET_OPENAI_MODEL=gpt-5-nano \
//     MAX_DAILY_COST=2.0 WORD_ASSET_MAX_ITEMS_PER_REQUEST=100 \
//     WORD_ASSET_MAX_EST_COST_USD_PER_REQUEST=0.5 WORD_ASSET_MAX_BATCH_SIZE=20
//
// 브라우저에 API 키/서비스 롤 키 절대 노출 안 됨.
//
// preview-only + no-write: 이 함수는 어떤 테이블도 SELECT하지 않는다
// (word_assets 조회조차 하지 않음 — 호출자가 이미 어떤 단어를 생성할지
// 결정해서 payload로 보낸다). ai_usage_daily에만 사용량을 누적 기록한다.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { estimateCostUsd, MODEL_PRICING_PER_MTOK, AI_MODEL_ID, DEFAULT_AI_PROVIDER } from '../grade-writing-answers/pipeline.js'
import {
  ASSET_FIELDS,
  DEFAULT_MAX_ITEMS_PER_REQUEST,
  DEFAULT_MAX_EST_COST_USD_PER_REQUEST,
  DEFAULT_BATCH_SIZE,
  clampBatchSize,
  buildBatches,
  parseAssetGenerationResponse,
  emptyGeneratedItem,
  verifyAdminPin,
} from './pipeline.js'
import { createOpenAIWordAssetProvider } from './providers.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
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

// ── 모델/provider(기본값은 grade-writing-answers/pipeline.js의 이 저장소
// 표준 상수를 그대로 재사용, § 위 헤더 주석) ────────────────────────────
const AI_PROVIDER = DEFAULT_AI_PROVIDER // 'openai' — 이 기능은 provider 전환 요구사항이 없어 상수 그대로 고정(env 오버라이드 없음, 오케스트레이터 확정 설계 "모델은 gpt-5-nano" 재확인).
const OPENAI_MODEL = readStringEnv('WORD_ASSET_OPENAI_MODEL', AI_MODEL_ID)

// ── 요청당 상한(기능 전용 이름 — grade-writing-answers 이름과 의도적으로
// 구분, § 위 헤더 주석) ──────────────────────────────────────────────────
const MAX_ITEMS_PER_REQUEST = readPositiveNumberEnv('WORD_ASSET_MAX_ITEMS_PER_REQUEST', DEFAULT_MAX_ITEMS_PER_REQUEST)
const MAX_EST_COST_USD_PER_REQUEST = readPositiveNumberEnv('WORD_ASSET_MAX_EST_COST_USD_PER_REQUEST', DEFAULT_MAX_EST_COST_USD_PER_REQUEST)
const BATCH_SIZE = clampBatchSize(readPositiveNumberEnv('WORD_ASSET_MAX_BATCH_SIZE', DEFAULT_BATCH_SIZE))

// ── 일일 총 예산(채점과 이름·값을 의도적으로 공유, § 위 헤더 주석) ───────
const MAX_DAILY_COST = readPositiveNumberEnv('MAX_DAILY_COST', 2.0)

const AI_BATCH_TIMEOUT_MS = 45000

// 프롬프트 구조(buildAssetGenerationPrompt) 기준 보수적 추정치. 실측 없이
// grade-writing-answers의 항목당 토큰 추정치(EST_INPUT/OUTPUT_TOKENS_PER_ITEM)
// 를 참고해 이 기능(단어 하나당 필드가 더 많고 예문 생성이 포함)에 맞춰
// 다소 넉넉하게 잡았다 — ⚠️ 실측 로그 기반이 아니라 추측치다(§ 보고서에
// 명시). 상한 판정이 목적이라 과대추정 쪽으로 안전하게(실제 청구는 이보다
// 낮을 가능성이 높음).
const EST_INPUT_TOKENS_PER_ITEM = 150
const EST_OUTPUT_TOKENS_PER_ITEM = 150
const EST_SYSTEM_PROMPT_TOKENS_PER_BATCH = 420

// 알 수 없는(가격표에 없는) 모델이 넘어와도 죽지 않도록(헌법 규칙 9) —
// grade-writing-answers/providers.js safeEstimateCostUsd와 동일 목적이지만,
// 그 함수를 import하면 이 함수가 채점 기능의 providers.js(다른 기능의
// provider 추상화 전체)에 결합되므로, pipeline.js의 순수 estimateCostUsd만
// 감싸는 얇은 사본을 여기 둔다(가격표 자체는 여전히 import — 복제 안 함).
function safeEstimateCostUsd(tokens: { inputTokens: number; outputTokens: number }, model: string): number {
  try {
    return estimateCostUsd(tokens, model)
  } catch {
    // 알려진 모델 중 최고가로 보수적 대체(claude-sonnet-5 단가, MODEL_PRICING_PER_MTOK 참고).
    const fallback = MODEL_PRICING_PER_MTOK['claude-sonnet-5'] || { input: 3.0, output: 15.0 }
    return (tokens.inputTokens / 1e6) * fallback.input + (tokens.outputTokens / 1e6) * fallback.output
  }
}

// ── Asia/Seoul 날짜 문자열(grade-writing-answers/index.ts getSeoulDateString과
// 동일 로직·이유) ────────────────────────────────────────────────────────
function getSeoulDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

// ── 일일 비용 상한 조회(grade-writing-answers/index.ts readTodayUsage
// 복제 — export되지 않아 import 불가, § 파일 헤더 주석) — 동일 동작:
// 오늘 전 provider/model 행 합산, 42P01/PGRST205(테이블 없음)면 null,
// 42703(구 스키마, provider/model 컬럼 없음)이면 단일 행 폴백. ──────────
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
      event: 'generate-word-assets.daily_cap_table_missing',
      error: error.message,
      hint: 'supabase_v3_8_ai_usage_daily.sql 미실행 — 일일 상한 없이 진행(요청당 상한은 계속 적용)',
    }))
    return null
  }

  const legacySchema = error.code === '42703'
  if (legacySchema) {
    const { data: legacyData, error: legacyErr } = await supabase
      .from('ai_usage_daily').select('est_cost_usd').eq('usage_date', dateStr).maybeSingle()
    if (legacyErr) {
      console.warn(JSON.stringify({
        event: 'generate-word-assets.daily_cap_read_error',
        error: legacyErr.message,
        hint: '구 스키마(usage_date 단일 PK) 읽기도 실패 — 일일 상한 없이 진행',
      }))
      return null
    }
    console.warn(JSON.stringify({
      event: 'generate-word-assets.daily_cap_legacy_schema_read',
      hint: 'ai_usage_daily가 구 스키마(provider/model 컬럼 없음) — supabase_v3_8_ai_usage_daily.sql 재실행 권장. 오늘 단일 행만 상한 판정에 사용.',
    }))
    return { estCostUsd: legacyData ? Number(legacyData.est_cost_usd) || 0 : 0 }
  }

  console.warn(JSON.stringify({ event: 'generate-word-assets.daily_cap_read_error', error: error.message }))
  return null
}

// ── 사용량 누적 기록(grade-writing-answers/index.ts accumulateUsageRow
// 복제, 동일 3단계 폴백) — rules_resolved_count/cache_hit_count/
// stats_skip_count(v3.9 절약 컬럼)는 이 기능에 해당 개념(로컬 규칙 확정/
// 캐시/통계 스킵)이 없어 항상 0으로 기록한다(스키마 존재 시 컬럼 자체는
// 채워 넣어 두 기능이 같은 표를 봐도 값이 어색하지 않게). ──────────────
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
      .select('request_count,item_count,prompt_tokens,response_tokens,est_cost_usd,rules_resolved_count,cache_hit_count,stats_skip_count')
      .eq('usage_date', dateStr).eq('provider', provider).eq('model', model)
      .maybeSingle()

    if (selErr) {
      const missing = selErr.code === '42P01' || selErr.code === 'PGRST205'
      if (missing) {
        console.warn(JSON.stringify({ event: 'generate-word-assets.daily_cap_table_missing', error: selErr.message }))
        return
      }
      if (selErr.code === '42703') {
        await accumulateUsageRowV39ColumnsMissingFallback(supabase, dateStr, provider, model, delta, selErr)
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
      rules_resolved_count: (existing?.rules_resolved_count || 0),
      cache_hit_count: (existing?.cache_hit_count || 0),
      stats_skip_count: (existing?.stats_skip_count || 0),
      updated_at: new Date().toISOString(),
    }
    const { error: upsertErr } = await supabase
      .from('ai_usage_daily')
      .upsert(next, { onConflict: 'usage_date,provider,model' })
    if (upsertErr) {
      const missing = upsertErr.code === '42P01' || upsertErr.code === 'PGRST205'
      if (missing) {
        console.warn(JSON.stringify({ event: 'generate-word-assets.daily_cap_table_missing', error: upsertErr.message }))
        return
      }
      if (upsertErr.code === '42703') {
        await accumulateUsageRowV39ColumnsMissingFallback(supabase, dateStr, provider, model, delta, upsertErr)
        return
      }
      await accumulateUsageRowLegacyFallback(supabase, dateStr, delta, upsertErr)
    }
  } catch (err) {
    console.warn(JSON.stringify({ event: 'generate-word-assets.daily_cap_write_error', error: String((err as any)?.message || err) }))
  }
}

async function accumulateUsageRowV39ColumnsMissingFallback(
  supabase: any,
  dateStr: string,
  provider: string,
  model: string,
  delta: { requestCount: number; itemCount: number; inputTokens: number; outputTokens: number; costUsd: number },
  origErr: any,
): Promise<void> {
  console.warn(JSON.stringify({
    event: 'generate-word-assets.daily_cap_write_v39_columns_missing_fallback',
    error: String(origErr?.message || origErr),
    code: origErr?.code,
    hint: 'supabase_v3_9_writing_answer_statistics.sql(ai_usage_daily 절약 컬럼 추가분) 미실행 — 절약 컬럼 없이 기존 v3.8 컬럼(provider/model 분리 유지)만 폴백 기록',
  }))
  try {
    const { data: existing, error: selErr } = await supabase
      .from('ai_usage_daily')
      .select('request_count,item_count,prompt_tokens,response_tokens,est_cost_usd')
      .eq('usage_date', dateStr).eq('provider', provider).eq('model', model)
      .maybeSingle()
    if (selErr) {
      if (selErr.code === '42703') {
        await accumulateUsageRowLegacyFallback(supabase, dateStr, delta, selErr)
      } else {
        console.warn(JSON.stringify({ event: 'generate-word-assets.daily_cap_write_error', error: selErr.message, code: selErr.code }))
      }
      return
    }
    const next = {
      usage_date: dateStr, provider, model,
      request_count: (existing?.request_count || 0) + delta.requestCount,
      item_count: (existing?.item_count || 0) + delta.itemCount,
      prompt_tokens: (Number(existing?.prompt_tokens) || 0) + delta.inputTokens,
      response_tokens: (Number(existing?.response_tokens) || 0) + delta.outputTokens,
      est_cost_usd: (Number(existing?.est_cost_usd) || 0) + delta.costUsd,
      updated_at: new Date().toISOString(),
    }
    const { error: upErr } = await supabase.from('ai_usage_daily').upsert(next, { onConflict: 'usage_date,provider,model' })
    if (upErr) {
      if (upErr.code === '42703') {
        await accumulateUsageRowLegacyFallback(supabase, dateStr, delta, upErr)
      } else {
        console.warn(JSON.stringify({ event: 'generate-word-assets.daily_cap_write_error', error: upErr.message, code: upErr.code }))
      }
    }
  } catch (err) {
    console.warn(JSON.stringify({ event: 'generate-word-assets.daily_cap_write_error', error: String((err as any)?.message || err) }))
  }
}

async function accumulateUsageRowLegacyFallback(
  supabase: any,
  dateStr: string,
  delta: { requestCount: number; itemCount: number; costUsd: number },
  origErr: any,
): Promise<void> {
  console.warn(JSON.stringify({
    event: 'generate-word-assets.daily_cap_write_legacy_schema_fallback',
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
      console.warn(JSON.stringify({ event: 'generate-word-assets.daily_cap_write_error', error: error.message, code: error.code }))
    }
  } catch (err2) {
    console.warn(JSON.stringify({ event: 'generate-word-assets.daily_cap_write_error', error: String((err2 as any)?.message || err2) }))
  }
}

// ── 요청 항목 정규화 ──────────────────────────────────────────────────────
type RawWordInput = { word?: unknown; meaning?: unknown; word_key?: unknown }

function normalizeRequestedWords(rawWords: unknown): Array<{ wordKey: string; word: string; meaning: string }> {
  if (!Array.isArray(rawWords)) return []
  const out: Array<{ wordKey: string; word: string; meaning: string }> = []
  const seen = new Set<string>()
  for (const raw of rawWords as RawWordInput[]) {
    const word = typeof raw?.word === 'string' ? raw.word.trim() : ''
    if (!word) continue
    const meaning = typeof raw?.meaning === 'string' ? raw.meaning.trim() : ''
    const wordKey = typeof raw?.word_key === 'string' && raw.word_key.trim()
      ? raw.word_key.trim().toLowerCase()
      : word.toLowerCase()
    if (seen.has(wordKey)) continue
    seen.add(wordKey)
    out.push({ wordKey, word, meaning })
  }
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { adminPin?: string; words?: unknown; fields?: unknown } | null = null
  try {
    body = await req.json()
  } catch {
    body = null
  }
  const { adminPin, words: rawWords, fields: rawFields } = body || {}

  // 인가가 항상 먼저 — admin-content-write/index.ts:562-568행과 동일 원칙
  // (어떤 요청이든 adminPin이 틀리면 항상 같은 not_authorized + 동일한
  // 1.5초 지연으로 온라인 브루트포스 완화).
  const ADMIN_PIN = Deno.env.get('ADMIN_PIN')
  if (!verifyAdminPin(adminPin, ADMIN_PIN)) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return json({ ok: false, reason: 'not_authorized' })
  }

  const fields = (Array.isArray(rawFields) ? rawFields : ASSET_FIELDS)
    .filter((f: unknown) => typeof f === 'string' && (ASSET_FIELDS as string[]).includes(f))
  const effectiveFields = fields.length > 0 ? fields : ASSET_FIELDS

  const items = normalizeRequestedWords(rawWords)
  if (items.length === 0) {
    return json({ ok: false, error: 'words 배열이 비어있거나 유효한 항목이 없습니다.' }, 400)
  }
  if (items.length > MAX_ITEMS_PER_REQUEST) {
    return json({
      ok: false,
      error: `요청 항목 수(${items.length}건)가 서버 상한(WORD_ASSET_MAX_ITEMS_PER_REQUEST=${MAX_ITEMS_PER_REQUEST}건)을 초과합니다 — 더 적게 나눠서 요청하세요.`,
    }, 400)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ ok: false, error: 'Server not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' }, 500)
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 요청당 비용 상한 사전 점검(grade-writing-answers와 동일 철학 — 실제
  // 호출 전에 최악의 경우로 추정해 넘으면 400으로 즉시 거부). 이 기능은
  // 로컬 규칙/캐시가 없어 "확정 안 된 항목"이라는 개념이 없다 — 요청된
  // 전 항목이 곧 AI 호출 대상이다.
  const batches = buildBatches(items, BATCH_SIZE)
  const preflightEstimatedCostUsd = safeEstimateCostUsd({
    inputTokens: items.length * EST_INPUT_TOKENS_PER_ITEM + batches.length * EST_SYSTEM_PROMPT_TOKENS_PER_BATCH,
    outputTokens: items.length * EST_OUTPUT_TOKENS_PER_ITEM,
  }, OPENAI_MODEL)
  if (preflightEstimatedCostUsd > MAX_EST_COST_USD_PER_REQUEST) {
    return json({
      ok: false,
      error: `이 요청의 추정 비용(약 $${preflightEstimatedCostUsd.toFixed(4)}, ${items.length}건 기준)이 서버 상한(WORD_ASSET_MAX_EST_COST_USD_PER_REQUEST=$${MAX_EST_COST_USD_PER_REQUEST})을 초과합니다 — 더 적은 항목으로 나눠서 다시 요청하세요.`,
      estimatedCostUsd: preflightEstimatedCostUsd,
      itemCount: items.length,
    }, 400)
  }

  // ── 일일 총 예산 판정(채점과 공유 — § 파일 헤더 주석) ─────────────────
  const todayDateStr = getSeoulDateString()
  const dailyUsage = await readTodayUsage(supabase, todayDateStr)
  let dailyBudgetExceeded = false
  if (dailyUsage) {
    const projectedTotalUsd = dailyUsage.estCostUsd + preflightEstimatedCostUsd
    dailyBudgetExceeded = dailyUsage.estCostUsd >= MAX_DAILY_COST || projectedTotalUsd > MAX_DAILY_COST
  }

  const sharedBudgetNote = 'ai_usage_daily(usage_date, provider, model)를 grade-writing-answers(쓰기시험 채점)와 공유합니다 — 하루 총 AI 비용 상한(MAX_DAILY_COST)은 두 기능 합산 기준입니다.'

  if (dailyBudgetExceeded) {
    // 500이 아니라 AI 호출만 건너뛰고 전부 null 필드로 반환(grade-writing-
    // answers의 ai_budget_exceeded 강등 패턴과 동일 철학) — 호출자(관리자
    // 화면)는 이 응답을 그대로 word_asset.upsert_bulk에 넘기지 않고, budget.
    // exceeded를 보고 사용자에게 안내만 하면 된다.
    const results = items.map((it) => emptyGeneratedItem(it.wordKey, '일일 AI 예산 초과로 이번 요청은 생성을 건너뛰었습니다'))
    console.log(JSON.stringify({
      event: 'generate-word-assets.daily_budget_exceeded',
      todayUsd: dailyUsage?.estCostUsd ?? null,
      capUsd: MAX_DAILY_COST,
      itemCount: items.length,
      model: OPENAI_MODEL,
      provider: AI_PROVIDER,
    }))
    return json({
      ok: true,
      results,
      usage: { inputTokens: 0, outputTokens: 0, batchCount: 0, estimatedCostUsd: 0, model: OPENAI_MODEL, provider: AI_PROVIDER },
      budget: { exceeded: true, todayUsd: dailyUsage?.estCostUsd ?? null, capUsd: MAX_DAILY_COST, sharedBudgetPool: true, note: sharedBudgetNote },
    })
  }

  const provider = createOpenAIWordAssetProvider({
    apiKey: OPENAI_API_KEY,
    model: OPENAI_MODEL,
    fetchImpl: fetch,
    timeoutMs: AI_BATCH_TIMEOUT_MS,
  })
  const health = provider.healthCheck()

  if (!health.apiKeyPresent) {
    // OPENAI_API_KEY 미설정 — grade-writing-answers의 "AI 분류기 미설정"
    // 분기와 동일 철학(자동 실패가 아니라 전부 null + 명시적 사유로 강등,
    // 500으로 죽지 않음).
    const results = items.map((it) => emptyGeneratedItem(it.wordKey, 'OPENAI_API_KEY가 설정되지 않아 AI 생성을 건너뛰었습니다'))
    return json({
      ok: true,
      results,
      usage: { inputTokens: 0, outputTokens: 0, batchCount: 0, estimatedCostUsd: 0, model: OPENAI_MODEL, provider: AI_PROVIDER },
      budget: { exceeded: false, todayUsd: dailyUsage?.estCostUsd ?? null, capUsd: MAX_DAILY_COST, sharedBudgetPool: true, note: sharedBudgetNote },
    })
  }

  const requestedWordKeys = new Set(items.map((it) => it.wordKey))
  const resultsMap = new Map<string, ReturnType<typeof emptyGeneratedItem>>()
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let actualBatchCount = 0

  for (const batch of batches) {
    actualBatchCount += 1
    try {
      const { normalizedText, inputTokens, outputTokens } = await provider.generateAssets(batch, effectiveFields)
      totalInputTokens += inputTokens
      totalOutputTokens += outputTokens
      const parsed = parseAssetGenerationResponse(normalizedText, { requestedWordKeys, fields: effectiveFields })
      for (const it of batch) {
        const found = parsed.get(it.wordKey)
        resultsMap.set(it.wordKey, found || emptyGeneratedItem(it.wordKey, 'AI 응답에서 이 단어의 결과를 찾지 못했습니다'))
      }
    } catch (err) {
      // 배치 하나가 실패해도(타임아웃/네트워크/OpenAI 오류) 전체 요청을
      // 죽이지 않는다 — 그 배치 항목만 사유를 남기고 null로 채운다(§ 헌법
      // 규칙 9 "우아한 성능 저하", grade-writing-answers classifyBatch의
      // catch 경로와 동일 철학).
      console.warn(JSON.stringify({ event: 'generate-word-assets.batch_error', error: String((err as any)?.message || err), batchIndex: actualBatchCount }))
      for (const it of batch) {
        resultsMap.set(it.wordKey, emptyGeneratedItem(it.wordKey, `AI 호출 실패로 생성을 건너뛰었습니다: ${String((err as any)?.message || err)}`))
      }
    }
  }

  const results = items.map((it) => resultsMap.get(it.wordKey) || emptyGeneratedItem(it.wordKey))
  const actualCostUsd = safeEstimateCostUsd({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, OPENAI_MODEL)

  // 실제 호출이 있었을 때만(항목 1개 이상) 사용량을 누적한다 — 예산
  // 초과/키 미설정 분기는 이미 위에서 별도로 return돼 여기 도달하지 않음.
  await accumulateUsageRow(supabase, todayDateStr, AI_PROVIDER, OPENAI_MODEL, {
    requestCount: 1,
    itemCount: items.length,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    costUsd: actualCostUsd,
  })

  return json({
    ok: true,
    results,
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      batchCount: actualBatchCount,
      estimatedCostUsd: actualCostUsd,
      model: OPENAI_MODEL,
      provider: AI_PROVIDER,
    },
    budget: {
      exceeded: false,
      todayUsd: (dailyUsage?.estCostUsd ?? 0) + actualCostUsd,
      capUsd: MAX_DAILY_COST,
      sharedBudgetPool: true,
      note: sharedBudgetNote,
    },
  })
})
