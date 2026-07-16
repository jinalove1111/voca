// 입실 단어시험(Entrance Word Test) — 출제/채점/랭킹 순수 로직.
//
// 이 파일은 spelling.js 외에는 의존성이 없는 순수 함수 모음이라 브라우저
// 번들 없이 plain Node로 바로 테스트할 수 있다(scripts/testEntranceTest.mjs).
// Supabase 접근은 전부 entranceTestApi.js에 분리 — 여기엔 절대 넣지 않는다.
//
// 채점은 기존 쓰기 시험 엔진(spelling.js의 isSpellingCorrect)을 그대로
// 재사용한다 — 대소문자/공백 무시, en2kr 다중 정답("휘젓다, 섞다" 중 하나만
// 맞아도 정답), 괄호 설명 제거까지 이미 검증된 규칙 그대로. 시험 엔진을
// 새로 발명하지 않는다. 이 모듈은 특정 화면에 하드코딩돼 있지 않아서 향후
// "Smart Check-in" 등 다른 시험류 기능이 같은 함수를 재사용할 수 있다.
// 확장자 명시(.js) — Vite는 어느 쪽이든 처리하지만, plain Node(테스트
// 스크립트의 직접 import)는 확장자가 없으면 모듈을 못 찾는다.
import { isSpellingCorrect } from './spelling.js'

export const ENTRANCE_DIRECTIONS = new Set(['kr2en', 'en2kr', 'random'])

// Fisher–Yates — rng 주입 가능(테스트에서 결정적으로 돌리기 위함).
function shuffle(arr, rng = Math.random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 출제 — words([{word, meaning}])에서 count개를 무작위로 뽑아 문제 배열을
// 만든다. direction이 'random'이면 문제마다 kr2en/en2kr을 따로 뽑아 그
// 문제에 고정한다(SpellingQuestion.jsx의 direction='random' 의미와 동일).
// 반환: [{ word, meaning, direction, prompt, answer }]
//   prompt — 학생에게 보여주는 텍스트, answer — 채점 target.
export function buildEntranceQuestions(words, { count = 10, direction = 'en2kr', rng = Math.random } = {}) {
  const dir = ENTRANCE_DIRECTIONS.has(direction) ? direction : 'en2kr'
  const pool = (words || []).filter((w) => w && w.word && w.meaning)
  const picked = shuffle(pool, rng).slice(0, Math.max(0, Math.min(count, pool.length)))
  return picked.map((w) => {
    const d = dir === 'random' ? (rng() < 0.5 ? 'kr2en' : 'en2kr') : dir
    return {
      word: w.word,
      meaning: w.meaning,
      direction: d,
      prompt: d === 'en2kr' ? w.word : w.meaning,
      answer: d === 'en2kr' ? w.meaning : w.word,
    }
  })
}

// 한 문제 채점 — 기존 쓰기 시험과 완전히 같은 규칙(isSpellingCorrect).
export function gradeEntranceAnswer(question, input) {
  return isSpellingCorrect(input, question.answer)
}

// 시험 전체 채점 — answers[i]가 questions[i]의 답. 시간 초과로 답하지 못한
// 문제(answers가 더 짧거나 null)는 오답 처리. 반환값의 missed는 교사 결과
// 페이지의 "많이 틀린 단어" 집계와 학생 결과 화면의 오답 목록에 그대로 씀.
export function computeTestResult(questions, answers = []) {
  let score = 0
  const missed = []
  questions.forEach((q, i) => {
    if (gradeEntranceAnswer(q, answers[i] ?? '')) score++
    else missed.push({ word: q.word, meaning: q.meaning })
  })
  const total = questions.length
  return { score, total, missed, accuracy: total > 0 ? score / total : 0 }
}

// 같은 학생이 오늘 여러 번 응시한 경우(같은 반에서 시험을 두 번 연 날 등)
// 학생당 최고 기록 1개만 남긴다 — 정확도 높은 쪽, 같으면 먼저 제출한 쪽.
// rows: [{ studentId, score, total, submittedAt, ... }]
export function bestResultPerStudent(rows) {
  const best = new Map()
  for (const r of rows || []) {
    if (!r || !r.studentId) continue
    const acc = r.total > 0 ? r.score / r.total : 0
    const prev = best.get(r.studentId)
    if (!prev) { best.set(r.studentId, { ...r, accuracy: acc }); continue }
    const better =
      acc > prev.accuracy ||
      (acc === prev.accuracy && new Date(r.submittedAt || 0) < new Date(prev.submittedAt || 0))
    if (better) best.set(r.studentId, { ...r, accuracy: acc })
  }
  return Array.from(best.values())
}

// 랭킹 — 정확도(score/total) 내림차순, 동점은 공동 순위(competition ranking,
// "1, 1, 3" 방식 — 운영자 요구사항 그대로). 동점자끼리의 표시 순서는 먼저
// 제출한 순(순위 자체에는 영향 없음). 문항 수가 다른 시험이 섞여도 정확도
// 기준이라 공정하게 비교된다(보통은 하루 한 시험이라 점수 순과 동일).
// rows: [{ studentId, name?, score, total, submittedAt, ... }]
// 반환: 같은 필드 + { accuracy, rank } (rank는 1부터).
export function rankResults(rows) {
  const withAcc = (rows || []).map((r) => ({
    ...r,
    accuracy: r.total > 0 ? r.score / r.total : 0,
  }))
  withAcc.sort((a, b) =>
    b.accuracy - a.accuracy ||
    new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0)
  )
  let prevAcc = null
  let prevRank = 0
  withAcc.forEach((r, i) => {
    if (prevAcc !== null && r.accuracy === prevAcc) {
      r.rank = prevRank
    } else {
      r.rank = i + 1
      prevRank = i + 1
      prevAcc = r.accuracy
    }
  })
  return withAcc
}

// 오늘의 VIP(MVP) — 1등 전원(공동 1등이면 모두). rankResults 결과를 받는다.
export function pickMvps(ranked) {
  return (ranked || []).filter((r) => r.rank === 1)
}

// 교사 결과 페이지용 반별 요약 — 응시자 수 / 평균 정확도 / 많이 틀린 단어
// TOP N. rows의 missedWords는 [{word, meaning}] (entrance_test_results.
// missed_words 그대로).
export function summarizeClassResults(rows, { topMissed = 5 } = {}) {
  const list = rows || []
  const participants = list.length
  const avgAccuracy = participants > 0
    ? list.reduce((sum, r) => sum + (r.total > 0 ? r.score / r.total : 0), 0) / participants
    : 0
  const missCount = new Map()
  for (const r of list) {
    for (const m of r.missedWords || []) {
      if (!m || !m.word) continue
      const key = m.word
      const cur = missCount.get(key) || { word: m.word, meaning: m.meaning || '', count: 0 }
      cur.count++
      missCount.set(key, cur)
    }
  }
  const mostMissed = Array.from(missCount.values())
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, topMissed)
  return { participants, avgAccuracy, mostMissed }
}

// 남은 초 → "M:SS" — 타이머 표시용.
export function formatSeconds(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
