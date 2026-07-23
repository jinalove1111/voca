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
import { setWordAcceptedMeanings } from './wordLibrary'
import { resolveSpellingReview } from './spellingReviewApi'
import { planAccept, buildAcceptedVariantRecord } from './spellingReviewBulkPlan'
import { supabase } from './supabaseClient'
import { classifyLocally, buildProposal, estimateCostUsd, MODEL_PRICING_PER_MTOK } from '../../supabase/functions/grade-writing-answers/pipeline.js'

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
  if (unresolvedRows.length === 0) return { proposals: [], usage: null, callFailed: false, callError: null }

  const fallback = (reason) => ({
    proposals: unresolvedRows.map((row) => buildProposal({
      pendingId: row.id, word: row.word, meaning: row.meaning, submittedAnswer: row.submittedAnswer,
      decision: 'review', confidence: 0, reason,
      decisionSource: 'ai_unavailable', cacheHit: false,
    })),
    usage: null,
    callFailed: true,
    callError: reason,
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
  return { proposals, usage: body.usage || null, callFailed: false, callError: null }
}

// AI 확인 단계에서 한 번에 보낼 최대 항목 수 — Edge Function(index.ts)의
// BATCH_SIZE=25와 반드시 일치시킬 것(다르면 §비용 추정의 "배치당 시스템
// 프롬프트 오버헤드" 가정이 실제 요청 횟수와 어긋난다).
export const AI_BATCH_SIZE = 25

// 2단계(관리자 "AI 확인 진행 (N건, 약 $X)" 버튼) — 미해결 행을 batchSize개씩
// 나눠 Edge Function을 순차로 호출한다(한 청크가 타임아웃/실패해도 다른
// 청크는 독립적으로 진행됨). onProgress(선택)로 매 청크가 끝날 때마다
// {batchIndex, batchCount, completed, total, cacheHits, failures}를 알려준다.
export async function runAiPhase({ adminPin, unresolvedRows, batchSize = AI_BATCH_SIZE, onProgress } = {}) {
  if (!unresolvedRows || unresolvedRows.length === 0) {
    return { proposals: [], usage: null, callFailed: false, callError: null }
  }

  const chunks = []
  for (let i = 0; i < unresolvedRows.length; i += batchSize) chunks.push(unresolvedRows.slice(i, i + batchSize))

  const allProposals = []
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let anyCallFailed = false
  let lastCallError = ''
  let cacheHits = 0
  let failures = 0
  let completed = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const { proposals, usage, callFailed, callError } = await callEdgeFunctionForUnresolved({ adminPin, unresolvedRows: chunk })
    allProposals.push(...proposals)
    if (usage) {
      totalInputTokens += usage.inputTokens || 0
      totalOutputTokens += usage.outputTokens || 0
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
    onProgress?.({ batchIndex: i + 1, batchCount: chunks.length, completed, total: unresolvedRows.length, cacheHits, failures })
  }

  const usage = (totalInputTokens > 0 || totalOutputTokens > 0)
    ? { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, estimatedCostUsd: estimateCostUsd({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, 'claude-haiku-4-5'), model: 'claude-haiku-4-5' }
    : null

  return { proposals: allProposals, usage, callFailed: anyCallFailed, callError: lastCallError }
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
export const CLAUDE_HAIKU_INPUT_USD_PER_MTOK = MODEL_PRICING_PER_MTOK['claude-haiku-4-5'].input // === 1.0
export const CLAUDE_HAIKU_OUTPUT_USD_PER_MTOK = MODEL_PRICING_PER_MTOK['claude-haiku-4-5'].output // === 5.0

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
  return estimateCostUsd({ inputTokens, outputTokens }, 'claude-haiku-4-5')
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
export const DEFAULT_DAILY_CEILING_USD = 5.0

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
