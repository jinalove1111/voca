// src/utils/spellingReviewAiApi.js
//
// 쓰기 답안 검토 AI 보조 — 클라이언트 레이어. 실제 인정/무시는 여전히
// spellingReviewApi.js(resolveSpellingReview)와 wordLibrary.js
// (setWordAcceptedMeanings)가 담당 — 이 파일은 새 쓰기 경로를 추가하지
// 않고 기존 두 함수를 그대로 재사용한다(§ 폴백 보존, 헌법 규칙 3).
//
// feature flag(src/config/features.js의 writingReviewAiAssist)가 꺼져
// 있으면 AdminScreen.jsx가 이 파일의 함수를 아예 호출하지 않는다 — 기본
// OFF라 SQL/Edge Function 배포 전에도 안전.
//
// v1.1(2026-07-23) 아키텍처 변경 — 이전(v1)에는 규칙 판정까지 전부 Edge
// Function이 수행해서, Function이 미배포(404)면 미리보기 자체가 죽었다.
// 이번 라운드부터는 규칙 기반 분류(classifyLocally)를 여기(브라우저)에서
// 먼저 돌리고, 그걸로 해결 안 되는 항목만 Edge Function으로 보낸다 — 그
// 호출이 실패(미배포/네트워크 오류/500 등 무엇이든)해도 규칙 기반 결과는
// 그대로 살아있고, 미해결 항목만 "review/confidence 0/decision_source=
// ai_unavailable + 실패 사유"로 표시된다(§ 구현 지시 "절대 미리보기 실패로
// 전체가 죽지 않게"). classifyLocally/buildProposal은 pipeline.js 원본을
// 그대로 import한다(재복제 금지, 헌법 규칙 3) — Deno 전용 API를 안 쓰는
// 순수 JS라 Vite가 supabase/ 밖 경로도 문제없이 번들링한다(npm run build로
// 실측 확인, docs/operations/task2-writing-report.md v1.1 섹션).
//
// v1.2(2026-07-23, 관리자 UI 2차 개편 — implementer A) — 2단계 미리보기
// 흐름으로 재구성:
//   1단계(runRulesPhase) — 순수 계산, 네트워크 0회, 즉시 결과(해결/미해결).
//   2단계(runAiPhase) — 관리자가 "AI 확인 진행" 버튼을 눌러야만 시작되고,
//   미해결 행을 batchSize(기본 25, index.ts의 BATCH_SIZE와 동일하게 맞출
//   것)개씩 나눠 Edge Function을 "순차로 여러 번" 호출한다(§ 진행률 표시
//   요구사항 — 배치 i/N, 완료 항목 수, 누적 캐시히트/실패 건수).
// callEdgeFunctionForUnresolved 자체(단일 HTTP 요청의 성공/실패 판정 로직)는
// 그대로 재사용 — runAiPhase는 그 함수를 청크마다 호출하는 오케스트레이터일
// 뿐이다. 이번 라운드에 추가한 것: 요청당 30초 AbortController 타임아웃
// (타임아웃도 다른 실패와 동일하게 ai_unavailable로 안전 강등, 절대 throw
// 안 함) + 클라이언트 측 비용 추정/상한(estimateAiCostUsd, 아래 §비용 추정
// 섹션 — 서버 측 상한은 agent B/운영자 영역이라 여기는 어디까지나
// best-effort 참고용).
//
// v1.3(2026-07-24, 운영자 비용 최소화 스펙 — implementer U) 변경분:
//   - AI_BATCH_SIZE 25 -> 20(서버 기본 배치 크기와 정렬, 아래 상수 주석 참고).
//   - MAX_REQUESTS_PER_RUN(신규) — 미리보기 1회 실행이 보내는 Edge Function
//     호출 자체를 최대 10회로 제한(=최대 200건). 그 이상 미해결 건은 이번
//     실행에서 아예 전송하지 않고 정직하게 review/confidence 0/
//     decision_source='ai_deferred'(신규 additive 값)로 표시 — "다음 실행에서
//     처리됩니다" 문구와 함께.
//   - 서버가 일일 비용 상한 초과를 알리면(§ 계약: 배치 응답에
//     decision_source='ai_budget_exceeded' 항목이 오거나, 응답 바디에
//     budget:{exceeded,todayUsd,capUsd}가 실리면) 이번 실행은 그 배치 이후
//     추가 청크를 보내지 않고 멈춘다(§ callEdgeFunctionForUnresolved는 여전히
//     한 청크의 성공/실패만 판정 — 예산 신호를 보고 "다음 청크를 안 보내는"
//     결정은 runAiPhase 오케스트레이터 몫). 못 보낸 나머지도 review/
//     confidence 0/decision_source='ai_budget_exceeded'로 정직하게 이월 표시.
//   - 모델 표시는 하드코딩 문자열 대신 pipeline.js의 AI_MODEL_ID를 그대로
//     쓴다(agent P가 이 상수를 'gpt-5-nano'로 바꿔도 이 파일은 재수정 없이
//     따라간다 — 헌법 규칙 3, 드리프트 방지).
import { setWordAcceptedMeanings } from './wordLibrary'
import { resolveSpellingReview } from './spellingReviewApi'
import { planAccept, buildAcceptedVariantRecord } from './spellingReviewBulkPlan'
import { supabase } from './supabaseClient'
import { classifyLocally, buildProposal, estimateCostUsd, AI_MODEL_ID, DEFAULT_AI_PROVIDER, MODEL_PRICING_PER_MTOK } from '../../supabase/functions/grade-writing-answers/pipeline.js'

// AdminScreen.jsx가 "모델: {AI_MODEL_ID}" 표시에 쓸 수 있게 그대로 재수출
// (pipeline.js를 클라이언트 코드 여러 곳에서 직접 import하지 않고 이 파일을
// 단일 경유지로 삼는다 — 기존 import 구조와 동일한 원칙).
export { AI_MODEL_ID, DEFAULT_AI_PROVIDER }

// ── Provider 표시명(운영자 요구사항 13) ─────────────────────────────────────
//
// 서버(pipeline.js/index.ts)가 돌려주는 provider/model 원문 문자열은 관리자가
// 읽기엔 불친절하다("gpt-5-nano" 등) — 이 순수함수는 그 원문을 사람이 읽는
// 표시명으로만 바꾼다(그 이상 아무 로직 없음, I/O 없음). 알려진 모델이
// 아니면(가격표/매핑에 아직 없는 새 모델 등) 원문 문자열을 그대로 보여준다
// — throw로 관리자 화면을 죽이지 않는다(§ 이 파일 전반의 "절대 throw 안
// 함" 원칙과 동일 맥락).
const PROVIDER_MODEL_DISPLAY_NAMES = {
  'gpt-5-nano': 'GPT-5 nano',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
}

export function formatProviderDisplay(provider = DEFAULT_AI_PROVIDER, model = AI_MODEL_ID) {
  if (provider === 'mixed' || model === 'mixed') return '혼합(폴백 발생)'
  if (!model) return provider || DEFAULT_AI_PROVIDER
  return PROVIDER_MODEL_DISPLAY_NAMES[model] || model
}

function functionsBaseUrl() {
  const url = import.meta.env.VITE_SUPABASE_URL
  return url ? `${url}/functions/v1/grade-writing-answers` : null
}

// 규칙 기반 1차 분류 — 각 row에 classifyLocally를 돌려 확정된 것(accept)과
// 미해결(null, AI로 보내야 함)을 나눈다. 이 함수 자체는 어떤 I/O도 하지
// 않는다(순수 계산, row 배열만 소비).
export function runLocalRules(rows) {
  const resolved = []
  const unresolved = []
  for (const row of rows) {
    const local = classifyLocally({
      word: row.word,
      meaning: row.meaning,
      acceptedMeanings: row.acceptedMeanings,
      submittedAnswer: row.submittedAnswer,
    })
    if (local.decision) {
      resolved.push(buildProposal({
        pendingId: row.id, word: row.word, meaning: row.meaning, submittedAnswer: row.submittedAnswer,
        decision: local.decision, confidence: local.confidence, reason: local.reason,
        decisionSource: local.decisionSource, cacheHit: false,
      }))
    } else {
      unresolved.push(row)
    }
  }
  return { resolved, unresolved }
}

// 1단계(관리자 "미리보기" 버튼) — 네트워크 0회, 순수 계산. scopeIds가
// 있으면 그 id만 대상으로 좁힌다("선택한 답안만" 옵션). 반환하는
// resolved/unresolved의 id 합집합이 곧 "이번 분석 범위"다.
export function runRulesPhase({ rows, scopeIds = null } = {}) {
  const targetRows = scopeIds ? rows.filter((r) => scopeIds.has(r.id)) : rows
  const { resolved, unresolved } = runLocalRules(targetRows)
  return { resolved, unresolved, scopedCount: targetRows.length }
}

const AI_CALL_TIMEOUT_MS = 30_000

// 미해결 항목 "한 청크"만 Edge Function으로 전송(§ 아키텍처 변경 핵심).
// 호출 자체가 실패하면(네트워크 오류/404 미배포/500/응답 파싱 실패/타임아웃
// 등 무엇이든) 절대 throw하지 않고, 그 실패 사유를 담아 unresolvedRows
// 전부를 review/confidence 0/decision_source=ai_unavailable 제안으로
// 대신 반환한다 — 규칙 기반 결과(resolved)는 이 함수가 아예 건드리지
// 않으므로 호출부가 안전하게 이어붙이면 된다. 30초 타임아웃(AbortController)
// 도 이 fallback 경로를 그대로 탄다.
async function callEdgeFunctionForUnresolved({ adminPin, unresolvedRows }) {
  if (unresolvedRows.length === 0) return { proposals: [], usage: null, callFailed: false, callError: null, budget: null }

  const fallback = (reason) => ({
    proposals: unresolvedRows.map((row) => buildProposal({
      pendingId: row.id, word: row.word, meaning: row.meaning, submittedAnswer: row.submittedAnswer,
      decision: 'review', confidence: 0, reason,
      decisionSource: 'ai_unavailable', cacheHit: false,
    })),
    usage: null,
    callFailed: true,
    callError: reason,
    // 호출 자체가 실패(네트워크/타임아웃/파싱)한 경우엔 서버가 예산 상태를
    // 알려줄 기회조차 없었다는 뜻 — budget은 항상 null(모른다는 뜻, false
    // 아님. false로 두면 "확인해봤는데 초과 아님"으로 오독될 수 있음).
    budget: null,
  })

  const endpoint = functionsBaseUrl()
  if (!endpoint) return fallback('AI 미리보기 연결 정보 없음(VITE_SUPABASE_URL 미설정)')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_CALL_TIMEOUT_MS)
  let res
  try {
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
      },
      body: JSON.stringify({ adminPin, pendingIds: unresolvedRows.map((r) => r.id) }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') {
      // 타임아웃 — 다른 호출 실패와 완전히 동일하게 취급(§ 절대 throw 안 함).
      return fallback(`AI 확인 요청 시간 초과(${Math.round(AI_CALL_TIMEOUT_MS / 1000)}초) — 검토 필요로 표시됨(규칙 기반 결과는 정상)`)
    }
    // fetch 자체가 던지는 경우 — network error, CORS 실패, Function 미배포로
    // 도메인이 아예 안 뜨는 경우 등.
    return fallback(`AI 서비스 연결 실패: ${err?.message || err}`)
  } finally {
    clearTimeout(timeoutId)
  }

  let body = null
  try { body = await res.json() } catch { /* JSON 아닌 응답(예: 404 HTML)도 아래에서 처리 */ }

  if (!res.ok || !body || body.ok === false) {
    const reason = body?.reason === 'not_authorized'
      ? '관리자 인증 실패 — 미해결 항목은 검토 필요로 표시됨(규칙 기반 결과는 정상)'
      : (body?.error || `AI 서비스 응답 실패(HTTP ${res.status})`)
    return fallback(reason)
  }

  // 서버가 반환한 제안은 이번에 보낸 unresolvedRows의 부분집합이어야 정상.
  // 혹시 응답에 빠진 id가 있으면(예: 그 사이 행이 삭제됨) 그 id만 개별
  // ai_unavailable로 보충한다 — 절대 조용히 누락시키지 않는다.
  const byId = new Map((body.proposals || []).map((p) => [p.pending_answer_id, p]))
  const proposals = []
  for (const row of unresolvedRows) {
    const p = byId.get(row.id)
    if (p) proposals.push(p)
    else proposals.push(buildProposal({
      pendingId: row.id, word: row.word, meaning: row.meaning, submittedAnswer: row.submittedAnswer,
      decision: 'review', confidence: 0, reason: 'AI 응답에 이 항목이 누락됨(그 사이 상태가 바뀌었을 수 있음)',
      decisionSource: 'ai_unavailable', cacheHit: false,
    }))
  }
  return { proposals, usage: body.usage || null, callFailed: false, callError: null, budget: body.budget || null }
}

// AI 확인 단계에서 한 번에 보낼 최대 항목 수 — Edge Function(index.ts)의
// 배치 크기 기본값(운영자 스펙: env MAX_BATCH_SIZE 기본 20)과 반드시
// 일치시킬 것(다르면 §비용 추정의 "배치당 시스템 프롬프트 오버헤드" 가정이
// 실제 요청 횟수와 어긋난다). v1.2에서는 25였다(구 index.ts BATCH_SIZE=25
// 기준) — v1.3(2026-07-24) 운영자 비용 최소화 스펙으로 20으로 하향.
export const AI_BATCH_SIZE = 20

// 미리보기 1회 실행이 이번 세션에서 실제로 Edge Function을 호출하는 최대
// 횟수(§ 운영자 비용 최소화 스펙 — "한 번 누를 때 너무 많은 호출이 한꺼번에
// 나가지 않게"). AI_BATCH_SIZE(20)와 곱하면 이번 실행이 한 번에 AI로 보내는
// 최대 항목 수(200건, index.ts의 MAX_ITEMS_PER_REQUEST 기본값과 우연히
// 같은 자릿수이지만 서로 다른 상한이다 — 저건 "요청 1건당 항목 수", 이건
// "실행 1회당 요청 횟수"). 이 이상 미해결 건은 이번 실행에서 아예 전송하지
// 않고 다음 실행으로 이월한다(§ runAiPhase 아래 이월 처리).
export const MAX_REQUESTS_PER_RUN = 10

// 이월(=이번 실행에서 전송조차 안 됨) 처리 공통 헬퍼 — 호출 한도 초과든
// 예산 초과로 중단이든, "review/confidence 0"으로 정직하게 강등하는 모양은
// 같고 이유 문구와 decision_source만 다르다.
function deferredProposal(row, decisionSource, reason) {
  return buildProposal({
    pendingId: row.id, word: row.word, meaning: row.meaning, submittedAnswer: row.submittedAnswer,
    decision: 'review', confidence: 0, reason, decisionSource, cacheHit: false,
  })
}

// 2단계(관리자 "AI 확인 진행 (N건, 약 $X)" 버튼) — 미해결 행을 batchSize개씩
// 나눠 Edge Function을 순차로 호출한다(한 청크가 타임아웃/실패해도 다른
// 청크는 독립적으로 진행됨). onProgress(선택)로 매 청크가 끝날 때마다
// {batchIndex, batchCount, completed, total, cacheHits, failures, deferredByCap}
// 를 알려준다.
//
// v1.3 추가: maxRequestsPerRun(기본 MAX_REQUESTS_PER_RUN=10) — 전체 청크 중
// 앞 maxRequestsPerRun개만 실제로 전송하고, 나머지는 애초에 호출하지 않는다
// (§ 비용 최소화). 전송한 청크 중 하나라도 서버가 예산 초과를 알리면(응답
// budget.exceeded===true 또는 그 배치 proposals에 decision_source=
// 'ai_budget_exceeded'가 하나라도 있으면) 그 즉시 이후 청크 전송을 중단한다
// — 이미 보낸 요청의 결과는 그대로 쓰고, 못 보낸 나머지만 이월 처리한다.
export async function runAiPhase({ adminPin, unresolvedRows, batchSize = AI_BATCH_SIZE, maxRequestsPerRun = MAX_REQUESTS_PER_RUN, onProgress } = {}) {
  if (!unresolvedRows || unresolvedRows.length === 0) {
    return { proposals: [], usage: null, callFailed: false, callError: null, budgetExceeded: false, budgetInfo: null, deferredCount: 0 }
  }

  const allChunks = []
  for (let i = 0; i < unresolvedRows.length; i += batchSize) allChunks.push(unresolvedRows.slice(i, i + batchSize))

  // 호출 한도(maxRequestsPerRun) 초과분 — 이번 실행은 아예 이 청크들을
  // 건드리지 않는다(전송 자체가 안 됨, 서버 예산과 무관하게 항상 이월).
  const chunksToSend = allChunks.slice(0, maxRequestsPerRun)
  const chunksBeyondCap = allChunks.slice(maxRequestsPerRun)
  const deferredByCapCount = chunksBeyondCap.reduce((s, c) => s + c.length, 0)

  const allProposals = []
  let totalInputTokens = 0
  let totalOutputTokens = 0
  // 요구사항 13 — 청크(=Edge Function 호출 1회)마다 서버가 알려주는
  // usage.provider/usage.model을 모은다. 서버는 한 요청 "안에서" 폴백이
  // 섞이면 이미 'mixed'로 응답하므로(§ index.ts responseProvider 계산), 여기선
  // "여러 청크에 걸쳐" provider/model이 달라진 경우까지 추가로 합산한다 —
  // 서로 다른 값이 2개 이상 관측되면 'mixed', 1개면 그 값 그대로, 0개(AI
  // 호출이 한 번도 없었음, 즉 캐시/규칙만으로 끝남)면 null(호출부가 기본값
  // 표시로 폴백).
  const seenProviders = new Set()
  const seenModels = new Set()
  let anyCallFailed = false
  let lastCallError = ''
  let cacheHits = 0
  let failures = 0
  let completed = 0
  let budgetExceeded = false
  let budgetInfo = null
  let sentBatchCount = 0

  for (let i = 0; i < chunksToSend.length; i++) {
    const chunk = chunksToSend[i]
    const { proposals, usage, callFailed, callError, budget } = await callEdgeFunctionForUnresolved({ adminPin, unresolvedRows: chunk })
    allProposals.push(...proposals)
    if (usage) {
      totalInputTokens += usage.inputTokens || 0
      totalOutputTokens += usage.outputTokens || 0
      if (usage.provider) seenProviders.add(usage.provider)
      if (usage.model) seenModels.add(usage.model)
    }
    if (callFailed) {
      anyCallFailed = true
      lastCallError = callError || lastCallError
    }
    for (const p of proposals) {
      if (p.cache_hit) cacheHits++
      else if (p.decision_source === 'ai_unavailable' || p.decision_source === 'ai_error' || p.decision_source === 'parse_error') failures++
    }
    completed += chunk.length
    sentBatchCount = i + 1
    const thisBatchHitBudget = budget?.exceeded === true || proposals.some((p) => p.decision_source === 'ai_budget_exceeded')
    if (thisBatchHitBudget) {
      budgetExceeded = true
      budgetInfo = budget || budgetInfo
    }
    onProgress?.({
      batchIndex: i + 1, batchCount: chunksToSend.length, completed, total: unresolvedRows.length,
      cacheHits, failures, deferredByCap: deferredByCapCount,
    })
    if (thisBatchHitBudget) break // § 예산 초과 신호 이후 청크는 절대 추가 전송 안 함
  }

  // 이번 실행에서 실제로 전송을 못 한 청크 전부(호출 한도 초과분 + 예산
  // 초과로 중단해 못 보낸 나머지) — review/confidence 0으로 정직하게 이월.
  const chunksNotSentDueToBudget = budgetExceeded ? chunksToSend.slice(sentBatchCount) : []
  for (const row of chunksBeyondCap.flat()) {
    allProposals.push(deferredProposal(row, 'ai_deferred', '이번 실행 호출 한도(10회) 초과 — 다음 실행에서 처리됩니다'))
  }
  for (const row of chunksNotSentDueToBudget.flat()) {
    allProposals.push(deferredProposal(row, 'ai_budget_exceeded', '일일 AI 비용 한도 도달 — 이번 실행에서 처리되지 않고 관리자 검토 필요 상태로 유지됩니다'))
  }

  // 요구사항 13 — provider/model은 실측 응답 기준(서버가 안 알려준 값,
  // 즉 AI 호출이 한 번도 없었던 경우엔 여기서 억지로 채우지 않고 null로
  // 남긴다 — 호출부(AdminScreen)가 "기본값 표시"로 폴백할지 결정).
  const responseProvider = seenProviders.size === 0 ? null : seenProviders.size === 1 ? [...seenProviders][0] : 'mixed'
  const responseModel = seenModels.size === 0 ? null : seenModels.size === 1 ? [...seenModels][0] : 'mixed'

  const usage = (totalInputTokens > 0 || totalOutputTokens > 0)
    ? {
        inputTokens: totalInputTokens, outputTokens: totalOutputTokens,
        estimatedCostUsd: estimateCostUsd({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, AI_MODEL_ID),
        model: responseModel || AI_MODEL_ID, provider: responseProvider || DEFAULT_AI_PROVIDER,
      }
    : null

  return {
    proposals: allProposals, usage, callFailed: anyCallFailed, callError: lastCallError,
    budgetExceeded, budgetInfo,
    deferredCount: deferredByCapCount + chunksNotSentDueToBudget.reduce((s, c) => s + c.length, 0),
  }
}

// ── 비용 추정(사전 상한 판단용 — 클라이언트 best-effort) ───────────────────
//
// 실제 정확한 토큰/비용은 각 Edge Function 응답의 usage(Anthropic API가
// 반환한 실측 input_tokens/output_tokens)로만 알 수 있다(§ runAiPhase가
// 반환하는 usage.estimatedCostUsd가 그 실측값 — pipeline.js/index.ts의
// estimateCostUsd와 완전히 동일한 가격 공식). 여기 estimateAiCostUsd는 그
// 실측 호출을 "하기 전" 미리보기/상한 판단에 쓰는 근사치일 뿐이다 —
// 실제 프롬프트 길이(단어/뜻/인정목록/학생답 텍스트 길이)에 따라 실측값과
// 다를 수 있다(의도적으로 여유 있게 잡은 상한 추정). 가격이 바뀌면
// pipeline.js의 MODEL_PRICING_PER_MTOK만 갱신하면 여기도 자동으로 따라간다
// (같은 소스에서 파생 — 이 파일에서 값을 복제하지 않음, 헌법 규칙 3).
//
// v1.3(2026-07-24): 예전엔 'claude-haiku-4-5' 키를 하드코딩했었다 — agent P가
// AI_MODEL_ID를 다른 모델(예: 'gpt-5-nano')로 바꾸면 이 파일도 매번 같이
// 고쳐야 하는 드리프트 위험이 있었다. 이제 AI_MODEL_ID를 그대로 키로 써서
// pipeline.js 쪽 상수 변경에 자동으로 따라간다. 만약(빌드 타이밍 문제로)
// MODEL_PRICING_PER_MTOK에 그 모델 가격표가 아직 없으면 0/0으로 안전하게
// 폴백한다(예상 비용이 실제보다 낮게 보일 뿐, throw로 관리자 화면 전체가
// 죽는 것보다 안전 — estimateAiCostUsd/estimateCostUsd 자체는 여전히 모델을
// 못 찾으면 예외를 던지므로, 이 값들은 어디까지나 "표시용 상수"일 뿐이다).
const AI_MODEL_PRICING = MODEL_PRICING_PER_MTOK[AI_MODEL_ID] || { input: 0, output: 0 }
export const AI_INPUT_USD_PER_MTOK = AI_MODEL_PRICING.input
export const AI_OUTPUT_USD_PER_MTOK = AI_MODEL_PRICING.output

// buildAiPrompt(pipeline.js)의 system 프롬프트(고정 문구, 배치마다 매번
// 다시 전송됨)를 대략 350토큰으로, user 페이로드 항목 1건을 대략 70토큰
// (단어/등록뜻/인정목록/학생답/힌트 플래그의 JSON 직렬화)으로, AI 응답
// 항목 1건(9개 필드 JSON)을 대략 90토큰으로 근사한다 — index.ts는 이런
// 고정 가정 없이 매 실행마다 실제 응답의 usage를 합산하므로(§ 위 설명),
// 이 상수들은 이 파일에서만 쓰는 "실행 전 상한 추정"용 근사치다.
const AI_ESTIMATE_SYSTEM_PROMPT_TOKENS_PER_BATCH = 350
const AI_ESTIMATE_INPUT_TOKENS_PER_ITEM = 70
const AI_ESTIMATE_OUTPUT_TOKENS_PER_ITEM = 90

// 순수 함수 — itemCount건을 전량 AI로 처리한다고 가정했을 때의 추정 비용
// (미해결 건수든, 선택 건수든 호출부가 원하는 worst-case 건수를 넣는다).
export function estimateAiCostUsd(itemCount, { batchSize = AI_BATCH_SIZE } = {}) {
  const n = Math.max(0, Math.floor(Number(itemCount) || 0))
  if (n === 0) return 0
  const batches = Math.max(1, Math.ceil(n / batchSize))
  const inputTokens = batches * AI_ESTIMATE_SYSTEM_PROMPT_TOKENS_PER_BATCH + n * AI_ESTIMATE_INPUT_TOKENS_PER_ITEM
  const outputTokens = n * AI_ESTIMATE_OUTPUT_TOKENS_PER_ITEM
  // v1.3: estimateCostUsd(pipeline.js)를 AI_MODEL_ID로 호출하지 않고 위
  // AI_INPUT_USD_PER_MTOK/AI_OUTPUT_USD_PER_MTOK(이미 안전 폴백 처리됨)로
  // 직접 계산한다 — estimateCostUsd는 모델을 못 찾으면 throw하는데, 이
  // 함수는 UI 렌더링 중 자주 호출되는 "실행 전 추정"이라 절대 throw하면
  // 안 된다(§ 미리보기 화면 자체가 죽지 않게).
  return (inputTokens / 1e6) * AI_INPUT_USD_PER_MTOK + (outputTokens / 1e6) * AI_OUTPUT_USD_PER_MTOK
}

// ── 비용 상한(관리자 조정 가능, localStorage 영속) ─────────────────────────
//
// 전부 클라이언트 best-effort다 — 이 저장소에 진짜 서버 측 지출 상한/차단은
// 없다(Edge Function/Anthropic API 키는 agent B 영역, 이 파일은 그쪽을
// 건드리지 않는다). 이 상한은 "관리자가 실수로 큰 배치를 돌리는 것"을
// 브라우저 단에서 미리 막아주는 안전장치일 뿐, 다른 기기/다른 관리자의
// 실행을 막지 못하고 서버가 실제로 그 이상 청구되는 것도 막지 못한다.
const COST_CEILING_KEY = 'voca_writing_ai_cost_ceiling_usd'
const DAILY_CEILING_KEY = 'voca_writing_ai_daily_ceiling_usd'
const DAILY_SPEND_KEY = 'voca_writing_ai_daily_spend'

export const DEFAULT_COST_CEILING_USD = 1.0
// v1.3(2026-07-24): $5.0 -> $2.0(운영자 비용 최소화 스펙 — 서버 측
// MAX_DAILY_COST 기본값과 정렬). localStorage에 이미 값이 저장돼 있는
// 관리자는(§ readPositiveNumber) 그 값을 그대로 우선 사용하므로 이 상수
// 변경은 "한 번도 상한을 안 건드린" 새 세션의 기본값에만 영향을 준다.
export const DEFAULT_DAILY_CEILING_USD = 2.0

function todayLocalDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readPositiveNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    const v = raw === null ? NaN : parseFloat(raw)
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}

export function getCostCeilingUsd() {
  return readPositiveNumber(COST_CEILING_KEY, DEFAULT_COST_CEILING_USD)
}
export function setCostCeilingUsd(value) {
  try { localStorage.setItem(COST_CEILING_KEY, String(value)) } catch { /* localStorage 불가 환경 — 조용히 무시 */ }
}
export function getDailyCeilingUsd() {
  return readPositiveNumber(DAILY_CEILING_KEY, DEFAULT_DAILY_CEILING_USD)
}
export function setDailyCeilingUsd(value) {
  try { localStorage.setItem(DAILY_CEILING_KEY, String(value)) } catch { /* 조용히 무시 */ }
}

// 오늘(로컬 날짜) 누적 추정 지출 — 날짜가 바뀌면 자동으로 0부터 다시 센다.
export function getTodaySpentUsd() {
  try {
    const raw = JSON.parse(localStorage.getItem(DAILY_SPEND_KEY) || 'null')
    if (raw && raw.date === todayLocalDateStr() && typeof raw.spentUsd === 'number') return raw.spentUsd
    return 0
  } catch {
    return 0
  }
}
// AI 확인 실행 1건이 끝날 때마다 호출 — best-effort 누적(§ 위 안내문 참고).
export function recordEstimatedSpendUsd(amountUsd) {
  const amount = Number(amountUsd)
  if (!(amount > 0)) return getTodaySpentUsd()
  const next = getTodaySpentUsd() + amount
  try { localStorage.setItem(DAILY_SPEND_KEY, JSON.stringify({ date: todayLocalDateStr(), spentUsd: next })) } catch { /* 조용히 무시 */ }
  return next
}

// 순수 함수 — 이번 실행이 실행당/일일 상한을 넘는지만 판단(실행은 안 함).
export function evaluateCostGate({ estimatedCostUsd, ceilingUsd, todaySpentUsd = 0, dailyCeilingUsd }) {
  const overRunCeiling = typeof ceilingUsd === 'number' && estimatedCostUsd > ceilingUsd
  const overDailyCeiling = typeof dailyCeilingUsd === 'number' && (todaySpentUsd + estimatedCostUsd) > dailyCeilingUsd
  return { blocked: overRunCeiling || overDailyCeiling, overRunCeiling, overDailyCeiling }
}

// 인정 변형 저장(mode='synonym') 감사 이력 — supabase_v3_7_word_accepted_
// variants.sql 미실행이어도 accepted_meanings 저장 자체는 정상 동작해야
// 하므로, 이 기록은 실패해도 절대 던지지 않고 조용히 무시한다(§ 설계 제약).
async function recordAcceptedVariantBestEffort(row, mode) {
  if (mode !== 'synonym') return
  try {
    const record = buildAcceptedVariantRecord(row)
    await supabase.from('word_accepted_variants').insert(record)
  } catch {
    // 테이블 미실행 등 — 감사 기록은 최적화일 뿐, 인정 자체를 막지 않는다.
  }
}

// 인정 1건 실행 — 기존 SpellingReviewQueuePanel의 accept()와 정확히 같은
// 두 단계(accepted_meanings read-then-write + resolveSpellingReview)를
// spellingReviewBulkPlan.planAccept()가 계산한 대로 수행한다.
export async function executeAccept(row, { mode = 'answer_only', duplicateRows = [] } = {}) {
  const plan = planAccept(row, { mode, duplicateRows })
  await setWordAcceptedMeanings(plan.wordId, plan.mergedAcceptedMeanings)
  await resolveSpellingReview(plan.primaryId, 'accepted')
  for (const dupId of plan.additionalResolveIds) {
    await resolveSpellingReview(dupId, 'accepted')
  }
  await recordAcceptedVariantBestEffort(row, mode)
  return plan
}

export async function executeDismiss(row) {
  await resolveSpellingReview(row.id, 'dismissed')
}

// 여러 행에 대해 순차로 인정/무시를 실행하고 성공/실패를 모아 반환한다.
// 하나 실패해도 나머지는 계속 진행(부분 성공 허용, alert는 호출부 담당).
export async function executeBulkAccept(rows, { mode = 'answer_only', duplicatesByRowId = new Map() } = {}) {
  const results = []
  for (const row of rows) {
    try {
      await executeAccept(row, { mode, duplicateRows: duplicatesByRowId.get(row.id) || [] })
      results.push({ id: row.id, ok: true })
    } catch (err) {
      results.push({ id: row.id, ok: false, error: err?.message || String(err) })
    }
  }
  return results
}

export async function executeBulkDismiss(rows) {
  const results = []
  for (const row of rows) {
    try {
      await executeDismiss(row)
      results.push({ id: row.id, ok: true })
    } catch (err) {
      results.push({ id: row.id, ok: false, error: err?.message || String(err) })
    }
  }
  return results
}
