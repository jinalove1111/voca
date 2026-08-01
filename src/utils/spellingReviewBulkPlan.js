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
// v1.4(2026-08-01) — classifyMistakeType/groupByMistakeType이 editDistance/
// possiblePosVariant도 재사용한다(재구현 금지, 헌법 규칙 3). 둘 다 이미
// pipeline.js가 export하는 순수 함수 그대로(9단계/8단계 로직과 동일 원본).
import { normalizeForCompare, editDistance, possiblePosVariant } from '../../supabase/functions/grade-writing-answers/pipeline.js'
export { normalizeForCompare, editDistance, possiblePosVariant }

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

// v2 UI(2026-07-23, 관리자 화면 2차 개편) — 판정 출처 필터("규칙만"/
// "AI만"/"캐시"). proposal.decision_source/cache_hit 기준(카드에 보이는
// 출처 배지와 동일 분류 — RULE_SOURCES는 아래에서 재사용).
export function filterProposalsBySource(proposals, sourceFilter = 'all') {
  if (sourceFilter === 'all') return proposals
  return proposals.filter((p) => {
    if (sourceFilter === 'cache') return p.cache_hit === true
    if (sourceFilter === 'ai') return !p.cache_hit && p.decision_source === 'ai'
    if (sourceFilter === 'rule') return RULE_SOURCES.has(p.decision_source)
    return true
  })
}

// "최초 제출 학생" 필터 — row.studentId 기준(proposal에는 학생 정보가
// 없다). studentId가 'all'이면 전체 통과. § v1-3 정직한 한계(dedupe 큐라
// 여기 보이는 학생은 항상 "최초 제출자"뿐)는 호출부(UI)가 라벨/안내
// 문구로 표시한다 — 이 함수는 순수 필터링만.
export function filterRowsByStudent(rows, studentId = 'all') {
  if (!studentId || studentId === 'all') return rows
  return rows.filter((r) => r.studentId === studentId)
}

// rows에 등장하는 studentId를 처음 등장 순서로 중복 없이 나열(드롭다운
// 옵션용). studentId가 없는 행(예: 학생 로그인 없이 온 레거시 기록)은
// 제외한다.
export function distinctStudentIds(rows) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    if (r.studentId && !seen.has(r.studentId)) {
      seen.add(r.studentId)
      out.push(r.studentId)
    }
  }
  return out
}

// 정렬 — confidence는 proposal 필드, 단어/학생은 row 필드, 판정은 proposal
// 필드라 "행 + 대응 proposal" 짝(items: [{row, proposal}])을 입력받는다.
// proposal이 아직 없는 행(AI 확인 전 미해결 상태)은 정렬 시 항상 맨 뒤로
// 밀리도록 confidence/decision 정렬에서 최솟값 취급한다.
export function sortDisplayItems(items, sortBy = 'none', direction = 'desc') {
  if (sortBy === 'none') return items
  const dir = direction === 'asc' ? 1 : -1
  const comparators = {
    confidence: (a, b) => (a.proposal?.confidence ?? -1) - (b.proposal?.confidence ?? -1),
    word: (a, b) => String(a.row?.word || '').localeCompare(String(b.row?.word || '')),
    decision: (a, b) => String(a.proposal?.decision || '').localeCompare(String(b.proposal?.decision || '')),
    student: (a, b) => String(a.row?.studentId || '').localeCompare(String(b.row?.studentId || '')),
  }
  const cmp = comparators[sortBy]
  if (!cmp) return items
  return [...items].sort((a, b) => dir * cmp(a, b))
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

// ── v1.3(2026-07-24, 운영자 비용 최소화 스펙 — implementer U) 신뢰도 3-밴드
// ─────────────────────────────────────────────────────────────────────────
//
// 스펙: ≥0.95 자동 인정 후보 / 0.70~0.95 관리자 검토 / <0.70 review(낮은 신뢰).
// 순수 표시/필터링 전용 — "확실한 답안 모두 인정"(selectCertainAccepts)의
// 0.95+무경고 AND 게이트는 이 밴딩과 완전히 별개이고 전혀 안 바뀐다(그
// 함수는 여전히 decision/경고 필드까지 함께 확인). auto-reject는 여전히
// 존재하지 않는다 — 밴드는 어디까지나 화면 표시/필터 편의 기준일 뿐, 밴드
// 자체가 어떤 액션도 자동 실행하지 않는다.
export function confidenceBand(confidence) {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) return null // 신뢰도 없음(예: 아직 AI 미확인) — 밴드 대상 아님
  if (confidence >= 0.95) return 'high'
  if (confidence >= 0.70) return 'mid'
  return 'low'
}

// 밴드 필터 — band: 'all' | 'high' | 'mid' | 'low'.
export function filterProposalsByBand(proposals, band = 'all') {
  if (band === 'all') return proposals
  return proposals.filter((p) => confidenceBand(p.confidence) === band)
}

// 요약 배지용 밴드별 건수 — none은 confidence가 숫자가 아닌 제안(정상 흐름
// 에서는 사실상 없어야 하지만, 방어적으로 항상 total과 합이 맞도록 집계).
export function summarizeConfidenceBands(proposals) {
  let high = 0, mid = 0, low = 0, none = 0
  for (const p of proposals) {
    const b = confidenceBand(p.confidence)
    if (b === 'high') high++
    else if (b === 'mid') mid++
    else if (b === 'low') low++
    else none++
  }
  return { high, mid, low, none }
}

// ── v2 UI(2026-07-23, 관리자 화면 2차 개편) — 확인 모달 요약 ────────────────
//
// 일괄 액션 확인 모달에 필요한 모든 숫자/문구를 순수 계산으로 미리 만든다
// (모달 컴포넌트는 이 결과를 그대로 렌더링만 하면 되게). kind는 기존
// runBulk()가 쓰는 값 그대로: 'accept'|'dismiss'|'synonym'.
//   - 'accept'/'synonym' — words.accepted_meanings를 갱신한다(실제 인정).
//   - 'synonym' — 추가로 word_accepted_variants 감사 이력 저장을 시도한다
//     (v3_7 SQL 미실행이면 그 호출부가 조용히 스킵 — § recordAcceptedVariantBestEffort).
//   - 'dismiss' — 검토 상태만 dismissed로 바뀌고 accepted_meanings는 무관.
// studentCount는 rows에 실려온 studentId(= 이 dedupe 큐에 남은 "최초
// 제출자") 기준 distinct 수다 — 실제 그 오답을 낸 학생 전체 수가 아니라는
// 점을 호출부(UI)가 라벨에 명시해야 한다(§ v1-3 정직한 한계).
export function buildConfirmSummary(rows, { kind = 'accept', wordsDisplayLimit = 10 } = {}) {
  const count = rows.length
  const uniqueWords = []
  const seenWords = new Set()
  for (const r of rows) {
    const w = r.word || '(삭제된 단어)'
    if (!seenWords.has(w)) {
      seenWords.add(w)
      uniqueWords.push(w)
    }
  }
  const studentIds = new Set(rows.map((r) => r.studentId).filter(Boolean))
  const savesAcceptedMeanings = kind === 'accept' || kind === 'synonym'
  const savesAcceptedVariant = kind === 'synonym'
  return {
    count,
    words: uniqueWords,
    wordsDisplay: uniqueWords.slice(0, wordsDisplayLimit),
    wordsTruncatedCount: Math.max(0, uniqueWords.length - wordsDisplayLimit),
    studentCount: studentIds.size,
    savesAcceptedMeanings,
    savesAcceptedVariant,
    irreversibleWarning: '이 작업은 되돌릴 수 없습니다 — 학생 데이터(인정 답안 목록/검토 상태)가 실제로 바뀝니다.',
  }
}

// ── v1.4(2026-08-01, 운영자 지시 — 자기학습형 검토 파이프라인) ─────────────
//
// 목적: 검수함을 "개별 카드 나열"에서 "실수 유형별 그룹"으로 바꾸는 첫
// 단계. 전부 순수 계산이고, 이미 있는 헬퍼만 재사용한다(헌법 규칙 3):
//   - editDistance/normalizeForCompare(pipeline.js, 위에서 재수출) — typo
//   - possiblePosVariant(pipeline.js, 8단계 힌트와 동일 원본) — pos_variant
//   - AI 제안 필드(row.decision/decision_source, 있으면) — semantic/wrong_word
// 이 함수들은 어떤 accept/reject 판정도 내리지 않는다 — 오직 "이미 존재하는
// pending 행/제안을 어떤 이름의 서랍에 놓을지"만 분류한다. 실제 인정/무시는
// 여전히 executeAccept/executeBulkAccept/executeBulkDismiss(spellingReviewAiApi.js)
// 몫이다.

// 자모(단독 초성/중성)만으로 이뤄진 문자열 — 무의미 제출(예: 실수로 자판이
// 안 눌린 자모만 남은 경우) 판별용. 완성형 한글(가-힣)은 이 정규식에
// 안 걸린다(정상 한글 답안과 절대 안 섞임).
const JAMO_ONLY = /^[ㄱ-ㅎㅏ-ㅣ]+$/

// 실수 유형 분류 — 우선순위(결정론적, 위→아래 순으로 첫 매치):
//   1) noise    — 정규화 후 길이 1 이하, 또는 자모만으로 구성.
//                 (최우선인 이유: 길이 1 이하 답은 편집거리가 우연히 작아
//                 typo로 오분류되기 쉽다 — 예: 한 글자 답과 두 글자 후보는
//                 편집거리가 항상 1. noise를 먼저 걸러야 이 오탐을 막는다.)
//   2) typo     — 등록 뜻/인정 답안을 콤마·세미콜론으로 펼친 각 대안과
//                 편집거리 1~2.
//   3) pos_variant — 대안 중 하나와 possiblePosVariant(어간 일치, 8단계와
//                 동일 로직)가 성립.
//   4) partial  — 대안 중 하나와 부분 문자열 관계(둘 중 하나가 다른 하나를
//                 포함), 또는 대안이 여러 개(콤마 나열)인데 그 중 정확히
//                 하나와만 일치(다의어 중 한 뜻만 커버).
//   5) semantic — 위 로컬 규칙 전부 미해당 + AI 제안이 있고 decision이
//                 accept 또는 review(의미 판단이 필요했던 애매한 사례).
//   6) wrong_word — AI 제안이 있고 decision이 reject_candidate.
//   7) unknown  — 그 무엇에도 해당 안 됨(AI 제안 자체가 아직 없는 순수
//                 규칙 미해결 상태 등).
// opts.meaning/opts.acceptedMeanings로 row 자체의 값을 오버라이드할 수
// 있다(기본은 row.meaning/row.acceptedMeanings 그대로 사용).
export function classifyMistakeType(row, { meaning, acceptedMeanings } = {}) {
  const effMeaning = meaning !== undefined ? meaning : row?.meaning
  const effAccepted = acceptedMeanings !== undefined ? acceptedMeanings : row?.acceptedMeanings
  const answer = String(row?.submittedAnswer ?? '')
  const normAnswer = normalizeForCompare(answer).replace(/\s+/g, '')

  // 자모 판별은 정규화 "전" 원문(trim만)으로 한다 — normalizeForCompare가
  // NFKC를 적용하는데, NFKC는 호환 자모(U+3131~318E, 이 정규식이 겨냥하는
  // 실제 키보드 입력 범위)를 조합용 자모(U+1100대, choseong)로 바꿔버려
  // 정규화 후에는 이 정규식이 더 이상 매치되지 않는다(실측 확인, 2026-08-01).
  const rawTrimmed = answer.trim()
  if (normAnswer.length <= 1 || JAMO_ONLY.test(rawTrimmed)) return 'noise'

  const candidates = [effMeaning, ...(Array.isArray(effAccepted) ? effAccepted : [])]
    .filter((c) => c != null && String(c).trim() !== '')
  const allAlternatives = candidates.flatMap((c) => String(c).split(/[,;]/).map((x) => x.trim()).filter(Boolean))

  let bestDist = Infinity
  for (const alt of allAlternatives) {
    const normAlt = normalizeForCompare(alt).replace(/\s+/g, '')
    if (!normAlt) continue
    const dist = editDistance(normAnswer.toLowerCase(), normAlt.toLowerCase())
    if (dist < bestDist) bestDist = dist
  }
  if (bestDist >= 1 && bestDist <= 2) return 'typo'

  if (allAlternatives.some((alt) => possiblePosVariant(normalizeForCompare(answer), normalizeForCompare(alt)))) {
    return 'pos_variant'
  }

  const isSubstringMatch = allAlternatives.some((alt) => {
    const normAlt = normalizeForCompare(alt).replace(/\s+/g, '')
    if (!normAlt || !normAnswer || normAlt === normAnswer) return false
    return normAlt.includes(normAnswer) || normAnswer.includes(normAlt)
  })
  const isOneOfManyExactMatch = allAlternatives.length > 1 && allAlternatives.some((alt) => {
    const normAlt = normalizeForCompare(alt).replace(/\s+/g, '')
    return normAlt === normAnswer
  })
  if (isSubstringMatch || isOneOfManyExactMatch) return 'partial'

  if (row?.decision === 'accept' || row?.decision === 'review') return 'semantic'
  if (row?.decision === 'reject_candidate') return 'wrong_word'

  return 'unknown'
}

// "확실한 반려" 대상 선별 — selectCertainAccepts의 거울상(전부 AND 안에서
// OR 게이트 두 개):
//   (a) AI decision==='reject_candidate' AND confidence>=threshold(기본 0.95)
//   (b) 통계 반복 오답(writing_answer_statistics 파생, decision_source가
//       'stats_repeat'이거나 이 행 자체가 통계 행일 때) — rejectedCount(또는
//       rejected_count) >= 5 AND acceptedCount(또는 accepted_count) === 0.
// 두 필드명(camelCase/snake_case)을 모두 허용하는 이유: 이 함수가 받는
// rows는 (1) fetchLearningRecommendations()가 반환하는 camelCase 통계 행,
// (2) classifyBatch가 만드는 snake_case 유사 필드를 가진 AI 제안, 두 출처
// 모두를 대상으로 삼을 수 있어서다(§ 자기학습 파이프라인 — 검수함과 추천
// 학습 카드 양쪽에서 "확실한 반려" 일괄 무시가 동작해야 함). 반환값은 원본
// row 그대로(무시 실행은 여전히 executeBulkDismiss/dismissRecommendation
// 몫 — 이 함수는 대상만 고른다).
export function selectCertainRejects(rows, threshold = 0.95) {
  return (rows || []).filter((r) => {
    if (r.decision === 'reject_candidate' && typeof r.confidence === 'number' && r.confidence >= threshold) return true
    const rejectedCount = typeof r.rejectedCount === 'number' ? r.rejectedCount : r.rejected_count
    const acceptedCount = typeof r.acceptedCount === 'number' ? r.acceptedCount : r.accepted_count
    if (typeof rejectedCount === 'number' && rejectedCount >= 5 && (acceptedCount === 0 || acceptedCount == null)) return true
    return false
  })
}

// 유형 라벨(한국어) — 관리자 화면 그룹 헤더용. UI 소유 파일(SpellingReview
// QueuePanel.jsx)이 이 매핑을 재정의하지 않고 그대로 재사용한다.
export const MISTAKE_TYPE_LABELS = {
  typo: '단순 오타',
  pos_variant: '품사/활용형 차이',
  partial: '부분 일치',
  semantic: '의미상 유사(AI 검토 필요)',
  unknown: '분류 안 됨',
  noise: '무의미/자모',
  wrong_word: '오답 후보',
}

// 그룹 표시 순서(운영자 지시 그대로) — typo/pos_variant/partial이 "쉬운 것
// 먼저"로 앞에, semantic/unknown이 다음, noise/wrong_word가 맨 뒤(무의미
// 또는 이미 오답 확정에 가까운 것들이라 관리자가 굳이 먼저 볼 필요가
// 적음).
export const MISTAKE_TYPE_ORDER = ['typo', 'pos_variant', 'partial', 'semantic', 'unknown', 'noise', 'wrong_word']

// rows를 실수 유형별로 묶는다 — 순서 고정(MISTAKE_TYPE_ORDER), count 0인
// 유형도 항상 포함(관리자가 "이 유형은 지금 0건"임을 그대로 볼 수 있게 —
// 목록에서 조용히 사라지면 "그 유형 자체가 없다"와 헷갈릴 수 있음). ctx는
// classifyMistakeType의 2번째 인자로 그대로 전달(기본 {} — 각 row 자신의
// meaning/acceptedMeanings 사용).
export function groupByMistakeType(rows, ctx = {}) {
  const buckets = new Map(MISTAKE_TYPE_ORDER.map((t) => [t, []]))
  for (const row of rows || []) {
    const type = classifyMistakeType(row, ctx)
    if (!buckets.has(type)) buckets.set(type, [])
    buckets.get(type).push(row)
  }
  return MISTAKE_TYPE_ORDER.map((type) => {
    const rowsForType = buckets.get(type) || []
    return { type, label: MISTAKE_TYPE_LABELS[type] || type, rows: rowsForType, count: rowsForType.length }
  })
}

// ── v1.5(2026-08-01, P3 — 검수 파이프라인 통계 집계) ─────────────────────
//
// 순수 계산만. 실제 I/O(writing_answer_statistics 조회)는
// writingAnswerStatsApi.js의 fetchStatsOverview()가 담당하고, 여기는 그
// 결과(또는 fetchLearningRecommendations()와 같은 camelCase 행 모양)를
// 받아 대시보드가 그대로 렌더링할 수 있는 요약만 계산한다.
//
// aggregateStatsRows(rows) — rows는 writing_answer_statistics 한 행당
// 하나씩(camelCase 필드: status/statusChangedAt/count/wordId/word/meaning/
// normalizedAnswer/lastDecision/lastConfidence). null/undefined 필드는
// 안전하게 무시(방어적, throw 금지).
//
// totals의 세 번째 키는 "rejected"가 아니라 "dismissed"다 — supabase_v3_9_
// writing_answer_statistics.sql의 실제 status CHECK 제약(pending/accepted/
// dismissed 3종, §69-70행 실측 확인)에 'rejected'라는 상태가 존재하지
// 않기 때문에, 없는 상태를 지어내지 않고 실제 컬럼 값 그대로 쓴다(§ 정직한
// 표기 원칙).
export function aggregateStatsRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  let pending = 0
  let accepted = 0
  let dismissed = 0
  const decisionsByDayMap = new Map() // 'YYYY-MM-DD' -> {accepted, dismissed}

  for (const r of list) {
    const status = r?.status
    if (status === 'pending') pending++
    else if (status === 'accepted') accepted++
    else if (status === 'dismissed') dismissed++

    // decisionsByDay — 관리자가 실제로 판정을 내린(accepted/dismissed로
    // 전이된) 날짜만 버킷팅한다. status_changed_at이 없는 행(예: 아직
    // 한 번도 안 건드린 pending)은 애초에 판정 시점이 없으므로 제외.
    if ((status === 'accepted' || status === 'dismissed') && r?.statusChangedAt) {
      const day = String(r.statusChangedAt).slice(0, 10) // ISO 문자열 앞 10자 = YYYY-MM-DD
      if (day.length === 10) {
        if (!decisionsByDayMap.has(day)) decisionsByDayMap.set(day, { accepted: 0, dismissed: 0 })
        const bucket = decisionsByDayMap.get(day)
        if (status === 'accepted') bucket.accepted++
        else bucket.dismissed++
      }
    }
  }

  const total = list.length
  const decided = accepted + dismissed
  // acceptRatio — 분모(decided)가 0이면 "0%"로 지어내지 않고 null(=아직
  // 판정된 건 없음, 호출부가 "데이터 없음"으로 표시).
  const acceptRatio = decided > 0 ? accepted / decided : null

  const topPending = list
    .filter((r) => r?.status === 'pending')
    .slice()
    .sort((a, b) => (Number(b?.count) || 0) - (Number(a?.count) || 0))
    .map((r) => ({
      wordId: r.wordId,
      word: r.word,
      meaning: r.meaning,
      normalizedAnswer: r.normalizedAnswer,
      count: r.count,
      lastDecision: r.lastDecision,
      lastConfidence: typeof r.lastConfidence === 'number' ? r.lastConfidence : null,
    }))

  const decisionsByDay = [...decisionsByDayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, counts]) => ({ day, ...counts }))

  return {
    totals: { pending, accepted, dismissed, total },
    topPending,
    decisionsByDay,
    acceptRatio,
  }
}

// summarizeQueue(rows, ctx) — 검수 큐(spelling_review_queue pending 행,
// SpellingReviewQueuePanel과 동일한 shape)를 실수 유형별 건수로 요약한다.
// groupByMistakeType(위, 재구현 금지 — 헌법 규칙 3)을 그대로 재사용하고,
// 대시보드가 필요로 하는 "유형별 건수 맵 + 전체 대기 건수" 형태로만
// 다시 포장한다.
export function summarizeQueue(rows, ctx = {}) {
  const list = Array.isArray(rows) ? rows : []
  const groups = groupByMistakeType(list, ctx)
  const byType = {}
  for (const g of groups) byType[g.type] = g.count
  return { totalPending: list.length, byType, groups }
}
