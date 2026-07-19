// Vercel Serverless Function — 입실 단어시험(Entrance Word Test) 결과 제출의
// 유일한 쓰기 경로. 2026-07-19, P1 보안 감사 후속(PROJECT_BOARD.md
// "[P1] 입실시험 결과 서버 재검증 없음").
//
// 배경: 기존 entranceTestApi.js의 submitEntranceResult()는 학생 브라우저가
// 계산한 score/total/missedWords를 그대로 anon key로 upsert했다. 게다가
// supabase_v1_8_entrance_test.sql의 RLS가 entrance_test_results에
// `using(true) with check(true)`라서, anon key만 있으면 임의 student_id/
// test_id 조합으로 점수를 조작해 저장할 수 있었다(재현 실측 완료 —
// wiki/security-notes.md). 위협 모델은 결제/PII 아님 — 학원 내부 "오늘의
// VIP"/랭킹 배지 조작 한정이라 Medium(Critical 아님)이지만, 게임화 로드맵의
// Word King(주간 대표) 착수 필수 선행조건이라 이번에 막는다.
//
// 신뢰 경계: 클라이언트는 "이 시험의 어느 단어에 어느 방향으로 무엇을
// 입력했는가"(answers: [{ word, direction, input }])만 보낼 수 있다.
// 점수/총점/오답 목록은 클라이언트가 절대 보내지 않고(보내도 이 핸들러가
// 아예 읽지 않음), 서버가 entrance_tests.words(DB에 저장된 출제 스냅샷)를
// 직접 조회해 그 자리에서 정답을 다시 조립하고, 이미 검증된 순수 함수
// computeTestResult()(src/utils/entranceTest.js — spelling.js의
// isSpellingCorrect를 그대로 재사용하는 기존 채점 엔진)로 재채점한다.
// "클라이언트가 보낸 점수를 신뢰하지 마라"는 지시의 직접 구현 —
// api/grant-xp.js가 "클라이언트가 보낸 XP 금액을 신뢰하지 않는" 것과 같은
// 신뢰 경계 원칙을 이 도메인에 적용한 것뿐, 새 패턴 발명 아님.
//
// 조작 방어(재채점만으로는 못 막는 것들 — 전부 명시적으로 막음):
//   - 문제 개수를 줄여 제출(예: 10문제 중 1문제만 "만점"으로 제출해 100%
//     정확도로 왜곡) -> answers.length가 서버가 계산한 기대 개수
//     (min(question_count, words.length))와 정확히 같아야 한다.
//   - 같은 쉬운 단어를 여러 번 중복 제출 -> 중복 word 거부.
//   - 시험 스냅샷에 없는 가짜 단어를 끼워넣어 실제보다 쉬운 시험으로
//     둔갑 -> 모든 word가 test.words에 실제로 존재해야 한다.
//   - direction을 몰래 바꿔서(예: 고정 kr2en 시험을 en2kr으로 위장, 보통
//     더 쉬움) 채점 -> 시험이 고정 방향(en2kr/kr2en)이면 전부 그 방향과
//     일치해야 하고, random/mixed 시험만 문제별로 en2kr/kr2en 자유(원래도
//     클라이언트가 문제마다 독립적으로 뽑는 설계라 서버가 정확한 배정
//     알고리즘 재현을 강제하지 않음 — 방향 자체는 항상 서버가 재계산한
//     정답과 대조되므로 방향을 속여도 유리해지지 않음, en2kr/kr2en 둘 다
//     정답 텍스트가 다를 뿐 난이도상 이득이 없기 때문).
//
// 안전 원칙(기존 학생 UX 불변): 이 API가 실패해도 학생은 이미 로컬에서
// 즉시 계산된 결과를 보고 있다(EntranceTest.jsx의 finishTest가 먼저 로컬
// computeTestResult로 화면을 채운 뒤 이 API를 호출) — 저장만 실패하면
// "다시 저장하기" 재시도 버튼을 보여주는 기존 흐름 그대로 유지된다.
import { createClient } from '@supabase/supabase-js'
import { supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'
import { isValidStudentId } from '../src/utils/paulRankShared.js'
import { computeTestResult } from '../src/utils/entranceTest.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_DIRECTIONS = new Set(['en2kr', 'kr2en'])
const MAX_ANSWERS = 100 // 실사용 문항수(보통 10~30) 대비 넉넉한 상한 — 페이로드 폭주 방지용일 뿐, 정상 시험엔 절대 안 걸림
const MAX_INPUT_LEN = 500 // 학생 오타/장난 입력도 넉넉히 수용, 무제한 페이로드만 방지

function isValidTestId(id) {
  return typeof id === 'string' && UUID_RE.test(id)
}

// answers: [{ word, direction, input }] — 형식/상한만 확인(내용 검증은
// 시험 스냅샷과 대조하는 아래 단계에서).
function isValidAnswersShape(answers) {
  if (!Array.isArray(answers) || answers.length === 0 || answers.length > MAX_ANSWERS) return false
  return answers.every((a) =>
    a && typeof a === 'object' &&
    typeof a.word === 'string' && a.word.length > 0 && a.word.length <= 200 &&
    VALID_DIRECTIONS.has(a.direction) &&
    typeof a.input === 'string' && a.input.length <= MAX_INPUT_LEN)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const url = supabaseAdminUrl()
  const key = supabaseAdminKey()
  if (!url || !key) {
    res.status(500).json({ error: 'Server not configured: SUPABASE_URL / key missing' })
    return
  }

  const { testId, studentId, answers, durationSeconds } = req.body || {}

  if (!isValidTestId(testId)) {
    res.status(200).json({ ok: false, reason: 'invalid_test_id' })
    return
  }
  if (!isValidStudentId(studentId)) {
    res.status(200).json({ ok: false, reason: 'invalid_student_id' })
    return
  }
  if (!isValidAnswersShape(answers)) {
    res.status(200).json({ ok: false, reason: 'invalid_answers' })
    return
  }

  const supabase = createClient(url, key)

  // 1) 시험 스냅샷을 DB에서 직접 조회 — 클라이언트가 보낸 어떤 단어/정답
  //    정보도 여기까지는 전혀 신뢰하지 않는다.
  const { data: test, error: testErr } = await supabase
    .from('entrance_tests')
    .select('id, words, direction, question_count')
    .eq('id', testId)
    .maybeSingle()
  if (testErr) {
    res.status(500).json({ error: testErr.message })
    return
  }
  if (!test) {
    res.status(200).json({ ok: false, reason: 'test_not_found' })
    return
  }

  const snapshotWords = Array.isArray(test.words) ? test.words : []
  const wordMap = new Map(snapshotWords.filter((w) => w && w.word && w.meaning).map((w) => [w.word, w.meaning]))
  const expectedCount = Math.min(test.question_count || 0, wordMap.size)

  // 2) 개수/중복/출처/방향 검증 — 전부 통과해야 재채점 단계로 진행.
  if (answers.length !== expectedCount) {
    res.status(200).json({ ok: false, reason: 'answer_count_mismatch' })
    return
  }
  const uniqueWords = new Set(answers.map((a) => a.word))
  if (uniqueWords.size !== answers.length) {
    res.status(200).json({ ok: false, reason: 'duplicate_word' })
    return
  }
  if (!answers.every((a) => wordMap.has(a.word))) {
    res.status(200).json({ ok: false, reason: 'unknown_word' })
    return
  }
  if (test.direction === 'en2kr' || test.direction === 'kr2en') {
    if (!answers.every((a) => a.direction === test.direction)) {
      res.status(200).json({ ok: false, reason: 'direction_mismatch' })
      return
    }
  }
  // direction이 'random'/'mixed'면 문제별 en2kr/kr2en 자유 — 이미
  // VALID_DIRECTIONS로 둘 중 하나임은 확인됨.

  // 3) 서버가 DB 스냅샷으로 정답을 직접 조립해 재채점 — 클라이언트가 보낸
  //    "정답"/"점수"는 애초에 이 요청 형식에 존재하지 않는다.
  const questions = answers.map((a) => {
    const meaning = wordMap.get(a.word)
    return {
      word: a.word,
      meaning,
      direction: a.direction,
      answer: a.direction === 'en2kr' ? meaning : a.word,
    }
  })
  const inputs = answers.map((a) => a.input)
  const result = computeTestResult(questions, inputs)

  const duration = Number.isFinite(durationSeconds) && durationSeconds >= 0 ? Math.round(durationSeconds) : null

  const { error: upsertErr } = await supabase.from('entrance_test_results').upsert({
    test_id: testId,
    student_id: studentId,
    score: result.score,
    total: result.total,
    missed_words: result.missed,
    duration_seconds: duration,
    submitted_at: new Date().toISOString(),
  }, { onConflict: 'test_id,student_id' })

  if (upsertErr) {
    res.status(500).json({ error: upsertErr.message })
    return
  }

  res.status(200).json({ ok: true, score: result.score, total: result.total, missed: result.missed })
}
