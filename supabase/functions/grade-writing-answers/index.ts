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
  buildAiPrompt,
  parseAiBatchResponse,
  verifyAdminPin,
  estimateCostUsd,
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

const MODEL = 'claude-haiku-4-5'
const BATCH_SIZE = 25

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // pending 조회 — SELECT만(§ preview-only). 캐시 테이블 미존재(마이그레이션
  // 미실행) 시에도 500으로 죽지 않고 캐시 없이 진행하도록 아래에서 개별
  // try/catch 처리한다(기존 spellingReviewApi.js의 "테이블 부재 시 조용히
  // 스킵" 관례와 동일 원칙).
  let query = supabase
    .from('spelling_review_queue')
    .select('id,word_id,submitted_answer,direction,status,date,created_at,words(word,meaning,accepted_meanings)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(200)
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

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let cacheTableMissing = false

  const cacheLookup = async (key: string) => {
    if (cacheTableMissing) return null
    const [wordId, meaningSnapshot, normalizedAnswer] = key.split('::')
    const { data: cached, error: cacheErr } = await supabase
      .from('spelling_ai_grading_cache')
      .select('decision,confidence,reason,suggested_synonym,part_of_speech_warning,decision_source')
      .eq('word_id', wordId).eq('meaning_snapshot', meaningSnapshot).eq('normalized_answer', normalizedAnswer)
      .maybeSingle()
    if (cacheErr) { cacheTableMissing = true; return null } // 마이그레이션 미실행 등 — 조용히 스킵
    if (!cached) return null
    return {
      decision: cached.decision, confidence: cached.confidence, reason: cached.reason,
      suggestedSynonym: cached.suggested_synonym, partOfSpeechWarning: cached.part_of_speech_warning,
      decisionSource: cached.decision_source,
    }
  }

  const cacheStore = async (key: string, decision: any) => {
    if (cacheTableMissing) return
    const [wordId, meaningSnapshot, normalizedAnswer] = key.split('::')
    await supabase.from('spelling_ai_grading_cache').upsert({
      word_id: wordId, meaning_snapshot: meaningSnapshot, normalized_answer: normalizedAnswer,
      decision: decision.decision, confidence: decision.confidence, reason: decision.reason,
      suggested_synonym: decision.suggestedSynonym, part_of_speech_warning: decision.partOfSpeechWarning,
      decision_source: decision.decisionSource, model: MODEL,
    }, { onConflict: 'word_id,meaning_snapshot,normalized_answer' })
    // 실패해도(테이블 없음 등) 무시 — 캐시는 최적화일 뿐, 미리보기 자체를
    // 막으면 안 된다.
  }

  const aiClassify = ANTHROPIC_API_KEY
    ? async (batch: any[]) => {
      const { system, user } = buildAiPrompt(batch)
      const res = await fetch('https://api.anthropic.com/v1/messages', {
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
      })
      const respJson = await res.json()
      if (!res.ok) throw new Error(respJson?.error?.message || `Anthropic API ${res.status}`)
      totalInputTokens += respJson?.usage?.input_tokens || 0
      totalOutputTokens += respJson?.usage?.output_tokens || 0
      const text = (respJson?.content || []).find((b: any) => b.type === 'text')?.text || ''
      return parseAiBatchResponse(text)
    }
    : null

  const proposals = await classifyBatch(items, { cacheLookup, cacheStore, aiClassify, batchSize: BATCH_SIZE })
  const estimatedCostUsd = estimateCostUsd({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, MODEL)

  // 토큰/비용 로깅 — 새 테이블을 추가로 만들지 않고(§ 분석 문서 §8 "제안
  // 테이블은 안 만듦" 결정과 같은 이유로 로그 테이블도 안 만듦) 함수 로그
  // (Supabase 대시보드에서 조회 가능)와 응답 바디 양쪽에 남긴다.
  console.log(JSON.stringify({
    event: 'grade-writing-answers.run',
    totalItems: items.length,
    unresolvedByRules: proposals.filter((p) => p.decision_source === 'ai' || p.decision_source === 'ai_error' || p.decision_source === 'parse_error' || p.decision_source === 'ai_unavailable').length,
    cacheHits: proposals.filter((p) => p.cache_hit).length,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    estimatedCostUsd,
    model: MODEL,
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
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, estimatedCostUsd, model: MODEL },
  })
})
