// src/utils/spellingReviewAiApi.js
//
// 쓰기 답안 검토 AI 보조 — 클라이언트 레이어. Supabase Edge Function
// (grade-writing-answers)을 호출해 "미리보기"만 받아온다. 실제 인정/무시는
// 여전히 spellingReviewApi.js(resolveSpellingReview)와 wordLibrary.js
// (setWordAcceptedMeanings)가 담당 — 이 파일은 새 쓰기 경로를 추가하지
// 않고 기존 두 함수를 그대로 재사용한다(§ 폴백 보존, 헌법 규칙 3).
//
// feature flag(src/config/features.js의 writingReviewAiAssist)가 꺼져
// 있으면 AdminScreen.jsx가 이 파일의 함수를 아예 호출하지 않는다 — 기본
// OFF라 SQL/Edge Function 배포 전에도 안전.
//
// 이 파일은 supabaseClient(import.meta.env)를 쓰는 브라우저 전용 모듈이라
// Node 테스트 하네스에서 직접 import하지 않는다(무엇을 갱신할지 계산하는
// 순수 로직은 spellingReviewBulkPlan.js로 분리해 거기서 테스트한다).
import { setWordAcceptedMeanings } from './wordLibrary'
import { resolveSpellingReview } from './spellingReviewApi'
import { planAccept } from './spellingReviewBulkPlan'

function functionsBaseUrl() {
  const url = import.meta.env.VITE_SUPABASE_URL
  return url ? `${url}/functions/v1/grade-writing-answers` : null
}

// 미리보기 호출 — 이 호출 자체는 어떤 라이브 답안 status도 바꾸지 않는다
// (Edge Function이 SELECT만 함, § preview-only). adminPin은 서버가
// 재검증한다(§ 인증) — 클라이언트는 그냥 그대로 전달만 한다.
export async function previewAiClassification({ adminPin, pendingIds } = {}) {
  const endpoint = functionsBaseUrl()
  if (!endpoint) throw new Error('VITE_SUPABASE_URL 미설정 — AI 미리보기를 쓸 수 없습니다')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
    },
    body: JSON.stringify({ adminPin, pendingIds }),
  })
  let body = null
  try { body = await res.json() } catch { /* JSON 아닌 응답도 아래에서 처리 */ }
  if (!res.ok || !body || body.ok === false) {
    const err = new Error(body?.reason === 'not_authorized' ? '관리자 인증 실패' : (body?.error || `AI 미리보기 실패 (HTTP ${res.status})`))
    if (body?.reason) err.reason = body.reason
    throw err
  }
  return body // { ok:true, proposals:[...], summary:{...}, usage:{...} }
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
