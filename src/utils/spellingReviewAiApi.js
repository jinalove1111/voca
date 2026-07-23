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
import { setWordAcceptedMeanings } from './wordLibrary'
import { resolveSpellingReview } from './spellingReviewApi'
import { planAccept, buildAcceptedVariantRecord } from './spellingReviewBulkPlan'
import { supabase } from './supabaseClient'
import { classifyLocally, buildProposal } from '../../supabase/functions/grade-writing-answers/pipeline.js'

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

// 미해결 항목만 Edge Function으로 전송(§ 아키텍처 변경 핵심). 호출 자체가
// 실패하면(네트워크 오류/404 미배포/500/응답 파싱 실패 등 무엇이든) 절대
// throw하지 않고, 그 실패 사유를 담아 unresolvedRows 전부를 review/
// confidence 0/decision_source=ai_unavailable 제안으로 대신 반환한다 —
// 규칙 기반 결과(resolved)는 이 함수가 아예 건드리지 않으므로 호출부가
// 안전하게 이어붙이면 된다.
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
    })
  } catch (err) {
    // fetch 자체가 던지는 경우 — network error, CORS 실패, Function 미배포로
    // 도메인이 아예 안 뜨는 경우 등.
    return fallback(`AI 서비스 연결 실패: ${err?.message || err}`)
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

// 미리보기 실행 — 규칙 기반 먼저(로컬), 미해결만 Edge Function. 이 함수는
// 어떤 라이브 답안 status도 바꾸지 않는다(§ preview-only) — classifyLocally/
// Edge Function 양쪽 다 SELECT/순수계산만 함. onPhase(선택)로 진행 상황
// 텍스트를 호출부에 알려준다("규칙 분류 중" -> "N건 AI 확인 중" -> "완료").
export async function previewAiClassification({ adminPin, rows, scopeIds = null, onPhase } = {}) {
  onPhase?.('rule')
  const targetRows = scopeIds ? rows.filter((r) => scopeIds.has(r.id)) : rows
  const { resolved, unresolved } = runLocalRules(targetRows)

  if (unresolved.length === 0) {
    onPhase?.('done')
    return { proposals: resolved, usage: null, unresolvedCount: 0, callFailed: false, callError: null }
  }

  onPhase?.('ai', unresolved.length)
  const { proposals: aiProposals, usage, callFailed, callError } = await callEdgeFunctionForUnresolved({ adminPin, unresolvedRows: unresolved })
  onPhase?.('done')
  return {
    proposals: [...resolved, ...aiProposals],
    usage,
    unresolvedCount: unresolved.length,
    callFailed,
    callError,
  }
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
