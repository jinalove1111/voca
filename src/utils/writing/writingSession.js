// src/utils/writing/writingSession.js — Writing Coach 세션 상태 머신 (순수 모듈).
//
// import는 같은 폴더의 ruleChecks.js/errorTaxonomy.js뿐(명시적 .js 확장자 —
// curriculumModel.js 관례). React/Supabase/네트워크/Date/랜덤 전부 0 —
// 같은 입력이면 항상 같은 출력(결정론)이라 scripts/testWritingCoach.mjs가
// 플레인 Node로 전체 시나리오를 재현·검증할 수 있다.
//
// 설계 근거(docs/WRITING_COACH.md §6 참고):
//   · compact state — 운영자 지시 그대로, 전체 대화 이력 대신
//     { original, currentAttempt, resolvedErrors, remainingErrors, attemptCount }
//     핵심 필드만 유지한다. 이 구조는 향후 AI 검사 단계(2·3단계)에서 모델에
//     전달할 컨텍스트와 동일하다 — 이력 전체를 보내는 대신 이 압축 상태만
//     보내 토큰 비용을 상수로 묶는 것이 비용 아키텍처의 핵심 설계다.
//   · 자가 수정 인정 — 이전 검사에서 남아 있던 오류 유형이 다음 제출에서
//     사라지면 "학생이 직접 고쳤다"(selfCorrected)로 기록한다. 단, 정답
//     공개(revealAllowed)가 이미 열린 뒤에 사라진 오류는 자가 수정으로
//     세지 않는다 — 공개된 정답을 베껴 적었을 가능성을 배제할 수 없어서,
//     "혼자 고침 비율"(핵심 KPI)의 정직성을 지키기 위해 보수적으로 센다.
//   · 피드백은 최대 3개, 인정 문구("시제는 고쳤어요") 먼저 — 초등학생이
//     긴 설명을 읽지 않는다는 운영자 원칙. 정답 문구는 어떤 경로로도
//     피드백에 들어가지 않는다(공개는 revealText 별도 필드로만).
//   · 상태는 불변(immutable) — submitAttempt는 이전 state를 절대 변형하지
//     않고 새 객체를 반환한다(React setState와 테스트 양쪽에 안전).

import { runRuleChecks, suggestCorrection } from './ruleChecks.js'
import { errorTypeByCode } from './errorTaxonomy.js'

// 정답 공개가 열리는 최소 시도 횟수 — 운영자 지시(3회 시도 후에만 공개).
export const REVEAL_AFTER_ATTEMPTS = 3
// 한 번에 보여줄 피드백 문구 최대 개수(인정 문구 포함) — 짧은 힌트 2~3개 원칙.
export const MAX_FEEDBACK_LINES = 3

// 한국어 보조사 은/는 — label 받침 유무로 선택(순수 유니코드 계산, 사전 불필요).
function eunNeun(word) {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return '는' // 한글이 아니면 '는'으로 고정
  return (last - 0xac00) % 28 > 0 ? '은' : '는'
}

function typeLabel(code) {
  return errorTypeByCode(code)?.label || code
}

function countByType(errors) {
  const map = {}
  for (const e of errors) map[e.type] = (map[e.type] || 0) + 1
  return map
}

// 새 세션 상태 — targetWords(오늘 단어)만 입력으로 받는다.
export function startSession({ targetWords = [] } = {}) {
  return {
    original: null,          // 첫 제출 문장(오류 기록의 기준점)
    currentAttempt: '',      // 가장 최근 제출 문장
    targetWords: [...targetWords],
    attemptCount: 0,
    resolvedErrors: [],      // [{ type, selfCorrected }] — 세션 누적
    remainingErrors: [],     // 마지막 검사에서 남은 오류(runRuleChecks 결과)
    usedTargetWords: [],     // [{ word, used }] — 마지막 검사 기준
    feedback: [],            // 학생에게 보여줄 짧은 문구들(최대 3개)
    completed: false,
    revealAllowed: false,    // 3회 이상 + 오류 잔존 + 교정 생성 가능일 때만
    revealText: null,        // revealAllowed일 때만 채워지는 정답 문장
    selfCorrectedCount: 0,
  }
}

// 제출 1회 처리 — 새 state를 반환(이전 state 불변).
export function submitAttempt(state, sentence) {
  const text = typeof sentence === 'string' ? sentence.trim() : ''
  // 빈 제출은 시도로 세지 않는다 — 실수 연타로 attemptCount가 소모되어
  // 정답 공개가 일찍 열리는 것을 막는다(안내 문구만 교체).
  if (!text) {
    return { ...state, feedback: ['문장을 입력해주세요.'] }
  }

  const { errors, usedTargetWords } = runRuleChecks(text, { targetWords: state.targetWords })
  const attemptCount = state.attemptCount + 1

  // ── 자가 수정 판정: 이전 remaining과 유형별 개수 비교 ──────────────────
  // 유형별 개수가 줄어든 만큼 resolved로 기록한다(같은 유형 2건 중 1건만
  // 고친 경우도 정확히 1건 인정). 정답 공개가 이미 열린 뒤라면
  // selfCorrected=false(위 헤더의 보수적 집계 원칙).
  const prevCount = countByType(state.remainingErrors)
  const newCount = countByType(errors)
  const newlyResolved = []
  for (const [type, prev] of Object.entries(prevCount)) {
    const fixed = prev - (newCount[type] || 0)
    for (let i = 0; i < fixed; i++) {
      newlyResolved.push({ type, selfCorrected: !state.revealAllowed })
    }
  }
  const resolvedErrors = [...state.resolvedErrors, ...newlyResolved]
  const selfCorrectedCount = resolvedErrors.filter((r) => r.selfCorrected).length
  const completed = errors.length === 0

  // ── 피드백 생성(최대 MAX_FEEDBACK_LINES개) ─────────────────────────────
  // 1) 인정 문구 먼저 — 학생이 직접 고친 유형("시제는 고쳤어요."). 같은
  //    유형 중복 없이 한 번씩만. 단, 오류가 남아 있으면 마지막 한 자리는
  //    반드시 남은 오류 힌트에 양보한다(인정 문구만 3개 차서 "뭘 더
  //    고쳐야 하는지"가 안 보이는 상황 방지).
  const ackTypes = [...new Set(newlyResolved.map((r) => r.type))]
  const feedback = ackTypes
    .slice(0, MAX_FEEDBACK_LINES - 1)
    .map((type) => {
      const label = typeLabel(type)
      return `${label}${eunNeun(label)} 고쳤어요.`
    })
  if (completed) {
    feedback.push('완성했어요! 정말 잘했어요.')
  } else {
    // 2) 첫 검사에서 오류가 2곳 이상이면 "몇 곳"인지 먼저 알려준다 —
    //    운영자 예시 시나리오("2곳 다시 확인해보세요.") 그대로.
    if (attemptCount === 1 && errors.length >= 2) {
      feedback.push(`${errors.length}곳 다시 확인해보세요.`)
    }
    // 3) 남은 오류 힌트 — 직전 검사에서도 있었던 유형이면 "이제 …"를 붙여
    //    "남은 건 여기"라는 신호를 준다(운영자 예시 2차 피드백 톤).
    for (const err of errors) {
      if (feedback.length >= MAX_FEEDBACK_LINES) break
      const persisted = (prevCount[err.type] || 0) > 0
      feedback.push(persisted && ackTypes.length > 0 ? `이제 ${err.hint}` : err.hint)
    }
  }

  // ── 정답 공개 판정 — 3회 이상 시도 + 오류 잔존 + 사전 기반 교정이 실제로
  //    가능할 때만. suggestCorrection이 null(교정 불가)이면 공개 버튼 자체가
  //    안 열린다(반쪽 정답 금지 — ruleChecks.js 헤더 참고).
  let revealAllowed = false
  let revealText = null
  if (!completed && attemptCount >= REVEAL_AFTER_ATTEMPTS) {
    revealText = suggestCorrection(text, errors)
    revealAllowed = revealText !== null
  }

  return {
    original: state.original ?? text,
    currentAttempt: text,
    targetWords: state.targetWords,
    attemptCount,
    resolvedErrors,
    remainingErrors: errors,
    usedTargetWords,
    feedback: feedback.slice(0, MAX_FEEDBACK_LINES),
    completed,
    revealAllowed,
    revealText,
    selfCorrectedCount,
  }
}

// 완료/기록용 요약 — WritingCoach.jsx가 onComplete로 호출부에 넘기는 값이며,
// 설계 SQL(writing_submissions)의 컬럼과 1:1 대응한다. errorTypes는 세션
// 전체에서 관측된 오류 유형 코드(중복 제거) — "이번 달 자주 틀리는 유형"
// 통계의 원자료.
export function getSessionSummary(state) {
  const types = [
    ...state.resolvedErrors.map((r) => r.type),
    ...state.remainingErrors.map((e) => e.type),
  ]
  return {
    attemptCount: state.attemptCount,
    selfCorrectedCount: state.selfCorrectedCount,
    errorTypes: [...new Set(types)],
    completed: state.completed,
  }
}
