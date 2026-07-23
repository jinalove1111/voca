// supabase/functions/grade-writing-answers/index.ts
//
// Supabase Edge Function(Deno) — 쓰기 답안 검토 큐 AI 보조 미리보기.
// docs/operations/task2-writing-analysis.md §6-4가 권고한 아키텍처:
// Vercel api/*.js가 12/12(여유 0)이고 admin-pin-actions.js가 자기 헤더
// 주석에서 "다른 신뢰 경로를 이 dispatcher에 섞지 말 것"을 명시했기 때문에,
// 신뢰 경계가 다른(제3자 AI API 호출) 이 기능은 별도 Edge Function으로 둔다.
//
// ⚠️ 배포는 운영자 수동(에이전트가 실행 불가, DDL과 동일 취급):
//   supabase functions deploy grade-writing-answers
// ⚠️ 시크릿도 운영자 수동(Vercel 환경변수와 별개로 Supabase에 따로 설정):
//   supabase secrets set ANTHROPIC_API_KEY=... ADMIN_PIN=... \
//     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
// (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY는 Supabase가 함수 실행 환경에
// 자동 주입하는 경우가 많지만, 프로젝트 설정에 따라 다를 수 있어 명시.)
//
// 브라우저에 API 키 절대 노출 안 됨 — ANTHROPIC_API_KEY는 이 함수 실행
// 환경(Deno.env)에만 존재하고 응답 바디에도 포함되지 않는다.
//
// preview-only: 이 함수는 spelling_review_queue를 SELECT만 하고, words나
// spelling_review_queue를 절대 UPDATE/INSERT하지 않는다(캐시 테이블
// spelling_ai_grading_cache에만 기록 — §12/§16 설계). 실제 인정/무시는
// 클라이언트의 기존 setWordAcceptedMeanings + resolveSpellingReview가
// 그대로 담당(이 함수가 반환하는 proposals는 그 버튼을 누르기 전 참고
// 자료일 뿐).
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  classifyBatch,
  classifyLocally,
  buildAiPrompt,
  parseAiBatchResponse,
  verifyAdminPin,
  estimateCostUsd,
  AI_MODEL_ID,
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

// pipeline.js가 내보내는 상수를 그대로 쓴다(index.ts가 자체 하드코딩
// 상수를 별도로 두면 캐시 키(buildCacheKey)의 model 부분과 실제 Anthropic
// 호출 model 파라미터가 조용히 어긋날 수 있다 — 구현 지시 1의 "prompt/model
// 변경이 캐시에 반드시 반영돼야 한다"는 요구를 지키려면 이 값이 하나여야
// 한다).
const MODEL = AI_MODEL_ID
const BATCH_SIZE = 25

// ── 서버 측 비용/남용 상한(구현 지시 3) ─────────────────────────────────
// 둘 다 Deno.env로 운영자가 배포 환경에서 조정 가능(시크릿과 동일하게
// `supabase secrets set MAX_ITEMS_PER_REQUEST=... MAX_EST_COST_USD_PER_REQUEST=...`).
// 안전한 기본값을 두고, 값이 없거나 숫자로 파싱 안 되거나 0 이하이면
// 기본값으로 폴백한다(운영자가 실수로 빈 문자열/오타를 넣어도 fail-closed로
// 상한이 0이 되어 기능이 전부 막히는 사고를 방지).
function readPositiveNumberEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name)
  if (raw == null || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
const MAX_ITEMS_PER_REQUEST = readPositiveNumberEnv('MAX_ITEMS_PER_REQUEST', 200)
const MAX_EST_COST_USD_PER_REQUEST = readPositiveNumberEnv('MAX_EST_COST_USD_PER_REQUEST', 2.0)

// 배치 하나당 Anthropic 호출 타임아웃(구현 지시 4) — 45초. 넘으면 그 배치는
// fetch가 AbortError로 reject되고, classifyBatch의 기존 catch(err) 경로가
// 그대로 처리한다(review로 강등, decisionSource='ai_error' — 새 실패 경로를
// 추가로 만들지 않고 기존 실패 처리를 그대로 재사용).
const AI_BATCH_TIMEOUT_MS = 45000

// 프롬프트 구조(buildAiPrompt) 기준 보수적 추정치 — 배치당 system 프롬프트가
// 고정 블록(약 250 토큰 내외)이고 항목당 user 페이로드는 단어/뜻/답 등
// 짧은 필드 몇 개라 실측상 항목당 150~250 입력 토큰, 60~120 출력 토큰
// 범위였다(§ 20번 테스트 "99건 전량 처리 추정 비용은 10센트 미만" 참고
// 수치와 같은 자릿수). 상한 판정은 "안전 쪽으로 넉넉하게"가 목적이라 항목당
// 250/120으로 다소 여유 있게 잡는다 — 실제 청구는 이보다 낮을 가능성이
// 높고(그래서 상한 통과 후 로그에 찍히는 실제 usage가 이 추정보다 항상
// 작게 나오는 게 정상), 상한을 초과해 거부하는 쪽으로만 보수적이다.
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
  const unresolvedByRulesCount = items.filter((it) => !classifyLocally(it).decision).length
  const estimatedBatchCount = Math.ceil(unresolvedByRulesCount / BATCH_SIZE)
  const preflightEstimatedCostUsd = unresolvedByRulesCount > 0
    ? estimateCostUsd({
      inputTokens: unresolvedByRulesCount * EST_INPUT_TOKENS_PER_ITEM
        + estimatedBatchCount * EST_SYSTEM_PROMPT_TOKENS_PER_BATCH,
      outputTokens: unresolvedByRulesCount * EST_OUTPUT_TOKENS_PER_ITEM,
    }, MODEL)
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
  let cacheTableMissing = false

  // 캐시 키 형식(구현 지시 1) — pipeline.js buildCacheKey/parseCacheKey와
  // 반드시 같은 순서(wordId::meaningSnapshot::normalizedAnswer::
  // partOfSpeech::promptVersion::model)를 써야 한다. index.ts는 pipeline.js
  // 의 parseCacheKey를 그대로 쓰지 않고 split만 하는데(원래도 그랬음),
  // 순서만 지키면 되므로 여기서 재구현하지 않고 배열 위치로 꺼낸다.
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
      decision_source: decision.decisionSource, model: model || MODEL,
    }, { onConflict: 'word_id,meaning_snapshot,normalized_answer,part_of_speech,prompt_version,model' })
    // 실패해도(테이블 없음 등) 무시 — 캐시는 최적화일 뿐, 미리보기 자체를
    // 막으면 안 된다.
  }

  const aiClassify = ANTHROPIC_API_KEY
    ? async (batch: any[]) => {
      actualBatchCount += 1
      const batchIndex = actualBatchCount
      const { system, user } = buildAiPrompt(batch)
      // 배치당 타임아웃(구현 지시 4) — AI_BATCH_TIMEOUT_MS(45초) 안에 응답이
      // 안 오면 AbortController가 fetch를 중단시키고, fetch()는 AbortError로
      // reject된다. 이 함수 안에서 따로 잡지 않고 그대로 위(classifyBatch)로
      // 전파시킨다 — classifyBatch의 기존 catch(err) 블록이 이미 "그 배치의
      // 모든 항목을 review로 강등, decisionSource='ai_error'"를 처리하므로
      // 타임아웃 전용 별도 실패 경로를 새로 만들 필요가 없다(자동 accept
      // 절대 없음, 기존 실패 처리와 완전히 동일).
      const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      }, AI_BATCH_TIMEOUT_MS)
      const respJson = await res.json()
      if (!res.ok) throw new Error(respJson?.error?.message || `Anthropic API ${res.status}`)
      const batchInputTokens = respJson?.usage?.input_tokens || 0
      const batchOutputTokens = respJson?.usage?.output_tokens || 0
      totalInputTokens += batchInputTokens
      totalOutputTokens += batchOutputTokens
      // 배치별 로깅(구현 지시 3) — 전체 요약 로그와 별개로, 배치마다 실제
      // Anthropic 응답의 usage(있으면)를 그대로 남긴다.
      console.log(JSON.stringify({
        event: 'grade-writing-answers.batch',
        batchIndex,
        itemCount: batch.length,
        inputTokens: batchInputTokens,
        outputTokens: batchOutputTokens,
        model: MODEL,
      }))
      const text = (respJson?.content || []).find((b: any) => b.type === 'text')?.text || ''
      return parseAiBatchResponse(text)
    }
    : null

  const proposals = await classifyBatch(items, { cacheLookup, cacheStore, aiClassify, batchSize: BATCH_SIZE })
  const estimatedCostUsd = estimateCostUsd({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, MODEL)

  // 토큰/비용 로깅 — 새 테이블을 추가로 만들지 않고(§ 분석 문서 §8 "제안
  // 테이블은 안 만듦" 결정과 같은 이유로 로그 테이블도 안 만듦) 함수 로그
  // (Supabase 대시보드에서 조회 가능)와 응답 바디 양쪽에 남긴다.
  // 구현 지시 3 — model/항목 수/배치 수/입출력 토큰 합계/캐시 히트/추정
  // 비용을 전부 한 요약 로그에 남긴다(배치별 상세는 위 aiClassify 안의
  // 'grade-writing-answers.batch' 로그가 이미 각각 남김).
  console.log(JSON.stringify({
    event: 'grade-writing-answers.run',
    model: MODEL,
    totalItems: items.length,
    batchCount: actualBatchCount,
    unresolvedByRules: proposals.filter((p) => p.decision_source === 'ai' || p.decision_source === 'ai_error' || p.decision_source === 'parse_error' || p.decision_source === 'ai_unavailable').length,
    cacheHits: proposals.filter((p) => p.cache_hit).length,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    estimatedCostUsd,
    maxItemsPerRequest: MAX_ITEMS_PER_REQUEST,
    maxEstCostUsdPerRequest: MAX_EST_COST_USD_PER_REQUEST,
  }))

  return json({
    ok: true,
    proposals,
    summary: {
      total: proposals.length,
      accept: proposals.filter((p) => p.decision === 'accept').length,
      review: proposals.filter((p) => p.decision === 'review').length,
      rejectCandidate: proposals.filter((p) => p.decision === 'reject_candidate').length,
      cacheHits: proposals.filter((p) => p.cache_hit).length,
    },
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      batchCount: actualBatchCount,
      estimatedCostUsd,
      model: MODEL,
    },
  })
})
