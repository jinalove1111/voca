// src/utils/spellingReviewBulkPlan.js
//
// 순수 로직만 — supabaseClient/네트워크 의존 전혀 없음(Node에서 바로 테스트
// 가능). "무엇을 갱신해야 하는가"만 계산하고, 실제 I/O(setWordAcceptedMeanings
// / resolveSpellingReview 호출)는 spellingReviewAiApi.js가 이 결과를 받아
// 담당한다. AdminScreen.jsx의 SpellingReviewQueuePanel 기존 accept()/dismiss()
// 로직은 이 파일이 생겨도 전혀 바뀌지 않는다(§ 폴백 보존).
//
// dedupe 규칙은 src/utils/wordLibrary.js:480-485 setWordAcceptedMeanings의
// 중복 제거(대소문자/공백 무시)와 의도적으로 동일하게 맞춰뒀다 — 그 함수를
// 직접 import하면 supabaseClient.js(import.meta.env 사용)까지 따라 들어와
// Node 테스트가 깨지기 때문에(브라우저 전용 모듈), 이 작은 dedupe 로직만
// 별도로 유지한다. wordLibrary.js의 dedupe 규칙이 바뀌면 이 함수도 확인할 것.
// supabase/functions/grade-writing-answers/pipeline.js의 normalizeForCompare와
// 의도적으로 동일한 구현 — Edge Function(Deno) 코드를 클라이언트 번들(src/)에
// 직접 import하면 서버 전용 모듈이 프론트 빌드에 섞이는 구조가 되므로,
// 이 작은 순수 함수만 양쪽에 각각 둔다(§ 위험 목록: 드리프트 위험 — 한쪽
// 수정 시 반드시 다른 쪽도 확인할 것).
export function normalizeForCompare(raw) {
  if (raw == null) return ''
  const s = String(raw).normalize('NFC').trim().replace(/\s+/g, ' ')
  return s.replace(/^[.,!?"'“”‘’]+|[.,!?"'“”‘’]+$/g, '').trim()
}

function dedupeAnswers(list) {
  const seen = new Set()
  const out = []
  for (const raw of list) {
    const v = String(raw ?? '').trim()
    if (!v) continue
    const key = v.toLowerCase().replace(/\s+/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

// "선택된 것만" 필터 — 전체 rows에서 selectedIds에 해당하는 것만 골라낸다.
// (요구사항: "선택 인정이 선택된 레코드만 갱신")
export function selectRows(rows, selectedIds) {
  const idSet = new Set(selectedIds)
  return rows.filter((r) => idSet.has(r.id))
}

// 같은 단어 + 같은 답안 문자열(정규화 기준)을 가진 다른 pending 행들을 찾는다
// ("동일 답안 일괄 인정" 기능용). normalizeFn은 pipeline.js의
// normalizeForCompare를 주입받아 쓴다(로직 중복 방지).
export function findDuplicateAnswerRows(rows, targetRow, normalizeFn) {
  const targetKey = normalizeFn(targetRow.submittedAnswer)
  return rows.filter((r) => r.id !== targetRow.id && r.wordId === targetRow.wordId && normalizeFn(r.submittedAnswer) === targetKey)
}

// 인정 액션 1건의 "계획"만 계산 — 실제 supabase 호출은 안 함.
// mode:
//   'answer_only'    — 이 답안 그대로만 인정(기존 accept()와 동일 동작)
//   'synonym'        — "인정 변형으로 저장" — v1에서는 answer_only와 결과가
//                       같다(둘 다 accepted_meanings에 원문 그대로 추가).
//                       향후 표기 정규화(예: 공백/조사 표준화)를 넣을 확장
//                       지점으로 모드를 분리해뒀다.
//   'all_duplicates' — 동일 답안을 가진 다른 pending 행들도 함께 인정.
export function planAccept(row, { mode = 'answer_only', duplicateRows = [] } = {}) {
  const answersToAdd = mode === 'all_duplicates' && duplicateRows.length > 0
    ? [row.submittedAnswer, ...duplicateRows.map((d) => d.submittedAnswer)]
    : [row.submittedAnswer]
  const mergedAcceptedMeanings = dedupeAnswers([...(row.acceptedMeanings || []), ...answersToAdd])
  const additionalResolveIds = mode === 'all_duplicates' ? duplicateRows.map((d) => d.id) : []
  return {
    wordId: row.wordId,
    mergedAcceptedMeanings,
    primaryId: row.id,
    additionalResolveIds,
  }
}

// high-confidence 제안 일괄 인정 — decision==='accept' && confidence>=threshold
// 인 제안만 골라 대상 행 목록을 만든다(실제 인정은 그 각각에 planAccept +
// I/O를 호출하는 spellingReviewAiApi.js가 수행).
export function selectHighConfidenceAccepts(proposals, threshold = 0.8) {
  return proposals.filter((p) => p.decision === 'accept' && typeof p.confidence === 'number' && p.confidence >= threshold)
}

export function filterProposals(proposals, { decision = 'all', wordQuery = '', studentQuery = '' } = {}) {
  return proposals.filter((p) => {
    if (decision !== 'all' && p.decision !== decision) return false
    if (wordQuery && !String(p.word || '').toLowerCase().includes(wordQuery.toLowerCase())) return false
    if (studentQuery && !String(p.studentName || '').toLowerCase().includes(studentQuery.toLowerCase())) return false
    return true
  })
}

// 완료 요약 문구 계산(성공/실패 건수) — UI가 그대로 표시.
export function summarizeBulkResults(results) {
  const ok = results.filter((r) => r.ok).length
  const failed = results.length - ok
  return { ok, failed, total: results.length }
}
