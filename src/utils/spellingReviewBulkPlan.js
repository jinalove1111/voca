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
//
// v1.1(2026-07-23) — normalizeForCompare 재복제 제거: v1에서는
// supabase/functions/grade-writing-answers/pipeline.js(Deno 전용으로
// 간주됐던 파일)를 클라이언트 번들에 직접 import하지 못한다고 판단해 이
// 함수를 여기 별도로 복제해뒀었다. 이번 라운드에서 실측(npm run build로
// 확인, docs/operations/task2-writing-report.md v1.1 섹션 §근거)한 결과
// pipeline.js는 Deno 전용 API를 전혀 안 쓰는 순수 JS라 Vite/Rollup이
// supabase/ 밖 경로든 상관없이 정상 번들링한다 — 그래서 이 라운드부터는
// 복제본을 지우고 원본을 import해 그대로 재수출한다(헌법 규칙 3, 재복제 금지).
import { normalizeForCompare } from '../../supabase/functions/grade-writing-answers/pipeline.js'
export { normalizeForCompare }

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

// ── v1.1(2026-07-23) 추가 ──────────────────────────────────────────────

// "확실한 답안 모두 인정" 대상 선별 — 전부 AND(코디네이터 지시 그대로):
//   decision === 'accept'(표시상 safe_accept) AND confidence >= threshold
//   AND 품사 경고 없음 AND 파싱 오류 없음 AND 의미 범위 경고 없음.
// review/reject_candidate는 애초에 decision 필터에서 걸러진다(절대 미포함).
// 파싱 오류(decision_source==='parse_error')는 구조상 decision이 항상
// 'review'로 강등되어 오므로(pipeline.js classifyBatch) 이 필터를 통과할 수
// 없지만, 코디네이터 지시의 "AND 조건 전부 명시"를 코드로도 그대로 남겨
// 의도를 분명히 한다(우연한 통과 방지용 방어적 체크).
export function selectCertainAccepts(proposals, threshold = 0.95) {
  return proposals.filter((p) =>
    p.decision === 'accept' &&
    typeof p.confidence === 'number' &&
    p.confidence >= threshold &&
    !p.part_of_speech_warning &&
    !p.meaning_scope_warning &&
    p.decision_source !== 'parse_error'
  )
}

// (단어, 정규화 답안) 그룹 키 — "동일 답안 묶어 보기"/"동일한 답안 모두
// 인정" 양쪽에서 공유.
export function groupKeyFor(row, normalizeFn = normalizeForCompare) {
  return `${row.wordId}::${normalizeFn(row.submittedAnswer)}`
}

// rows를 (단어, 정규화 답안) 그룹으로 묶는다 — "동일 답안 묶어 보기" 필터용.
// Map<groupKey, row[]> 반환(입력 순서 보존).
export function groupRowsByAnswer(rows, normalizeFn = normalizeForCompare) {
  const groups = new Map()
  for (const r of rows) {
    const key = groupKeyFor(r, normalizeFn)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  return groups
}

// "동일한 답안 모두 인정" 전체 일괄 액션 대상 — rows 전체에서 그룹 크기가
// 2 이상인(=다른 대기 행과 답안이 겹치는) 행만 전부 골라 반환한다(행별
// "동일 답안 N건 전부 인정" 버튼과 달리, 큐 전체를 한 번에 훑는 전역
// 액션). 단일 행뿐인 그룹은 제외(대상 없음).
export function selectAllDuplicateGroupRows(rows, normalizeFn = normalizeForCompare) {
  const groups = groupRowsByAnswer(rows, normalizeFn)
  const out = []
  for (const groupRows of groups.values()) {
    if (groupRows.length >= 2) out.push(...groupRows)
  }
  return out
}

// "인정 변형으로 저장"(mode='synonym') 감사 이력 레코드 — 실제 INSERT는
// spellingReviewAiApi.js가 담당(supabase_v3_7_word_accepted_variants.sql
// 미실행이어도 그 호출부가 실패를 조용히 삼킨다). 이 함수는 무엇을 저장할지
// 계산만 하는 순수 로직.
export function buildAcceptedVariantRecord(row, { partOfSpeech = null, createdBy = 'admin_ui_ai_review' } = {}) {
  return {
    word_id: row.wordId,
    registered_meaning: row.meaning ?? null,
    part_of_speech: partOfSpeech,
    accepted_answer: row.submittedAnswer,
    created_by: createdBy,
  }
}

// AI 미리보기 결과 요약(요구 항목: 자동 인정 가능/관리자 확인 필요/오답 후보
// /규칙 기반 처리 수/AI 처리 수/cache hit 수/처리 실패 수). cache_hit인
// 항목은 decision_source가 항상 'ai'로 기록되므로(성공한 AI 판정만 캐시에
// 적재, pipeline.js classifyBatch) "AI 처리 수"와 "cache hit 수"는 서로
// 배타적으로 센다(캐시 재사용은 실제로 이번 실행에서 AI를 호출하지 않았기
// 때문 — 비용/호출 횟수 관점에서 구분이 의미 있음).
const RULE_SOURCES = new Set(['exact_match', 'synonym', 'levenshtein'])
const FAILURE_SOURCES = new Set(['ai_unavailable', 'ai_error', 'parse_error'])
export function summarizeProposals(proposals) {
  const total = proposals.length
  let safeAccept = 0, review = 0, rejectCandidate = 0
  let ruleBased = 0, aiProcessed = 0, cacheHits = 0, failed = 0
  for (const p of proposals) {
    if (p.decision === 'accept') safeAccept++
    else if (p.decision === 'reject_candidate') rejectCandidate++
    else review++

    if (p.cache_hit) cacheHits++
    else if (RULE_SOURCES.has(p.decision_source)) ruleBased++
    else if (p.decision_source === 'ai') aiProcessed++
    else if (FAILURE_SOURCES.has(p.decision_source)) failed++
  }
  return { total, safeAccept, review, rejectCandidate, ruleBased, aiProcessed, cacheHits, failed }
}
