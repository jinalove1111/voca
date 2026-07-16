// 입실 단어시험 순수 로직 회귀 테스트 — src/utils/entranceTest.js.
// DB/네트워크/번들 불필요: entranceTest.js는 spelling.js만 import하는 순수
// 모듈이라 plain Node로 바로 실행된다(testSpelling.mjs와 같은 방식).
//   node scripts/testEntranceTest.mjs
import {
  buildEntranceQuestions,
  gradeEntranceAnswer,
  computeTestResult,
  bestResultPerStudent,
  rankResults,
  pickMvps,
  summarizeClassResults,
  formatSeconds,
} from '../src/utils/entranceTest.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// 결정적 rng — 테스트가 매번 같은 결과를 내도록 (LCG)
function makeRng(seed = 42) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const WORDS = [
  { word: 'apple', meaning: '사과' },
  { word: 'stir', meaning: '휘젓다, 섞다' },
  { word: 'pattern', meaning: '(규칙적인) 패턴, 양식' },
  { word: 'banana', meaning: '바나나' },
  { word: 'cat', meaning: '고양이' },
  { word: 'dog', meaning: '개' },
]

console.log('\n1. 출제 — 문항 수/방향')
{
  const qs = buildEntranceQuestions(WORDS, { count: 4, direction: 'en2kr', rng: makeRng() })
  check('요청한 문항 수(4)만큼 출제', qs.length === 4)
  check('en2kr: 모든 문제 방향이 en2kr', qs.every((q) => q.direction === 'en2kr'))
  check('en2kr: prompt는 영어, answer는 한글 뜻', qs.every((q) => q.prompt === q.word && q.answer === q.meaning))
  const kr = buildEntranceQuestions(WORDS, { count: 4, direction: 'kr2en', rng: makeRng() })
  check('kr2en: prompt는 한글 뜻, answer는 영어', kr.every((q) => q.prompt === q.meaning && q.answer === q.word))
  const uniqueWords = new Set(qs.map((q) => q.word))
  check('같은 단어 중복 출제 없음', uniqueWords.size === qs.length)
}

console.log('\n2. 출제 — 단어가 부족하면 있는 만큼만, 깨지지 않음')
{
  const qs = buildEntranceQuestions(WORDS, { count: 100, direction: 'en2kr', rng: makeRng() })
  check('풀(6개)보다 많이 요청(100)해도 6개만 출제', qs.length === 6)
  check('빈 풀 -> 빈 배열(크래시 없음)', buildEntranceQuestions([], { count: 10 }).length === 0)
  check('null 풀 -> 빈 배열(크래시 없음)', buildEntranceQuestions(null, { count: 10 }).length === 0)
  const broken = buildEntranceQuestions([{ word: 'x' }, { meaning: 'y' }, null, ...WORDS], { count: 100, rng: makeRng() })
  check('word/meaning 없는 행은 걸러짐', broken.length === 6)
  const badDir = buildEntranceQuestions(WORDS, { count: 3, direction: 'weird', rng: makeRng() })
  check('알 수 없는 direction은 en2kr로 폴백', badDir.every((q) => q.direction === 'en2kr'))
}

console.log('\n3. 출제 — random 방향은 문제마다 개별 결정')
{
  const qs = buildEntranceQuestions(WORDS, { count: 6, direction: 'random', rng: makeRng(7) })
  const dirs = new Set(qs.map((q) => q.direction))
  check('모든 방향이 kr2en/en2kr 중 하나', qs.every((q) => q.direction === 'kr2en' || q.direction === 'en2kr'))
  check('두 방향이 실제로 섞여 나옴(seed=7 기준)', dirs.size === 2)
  check('방향과 prompt/answer가 항상 일치', qs.every((q) =>
    (q.direction === 'en2kr' && q.prompt === q.word && q.answer === q.meaning) ||
    (q.direction === 'kr2en' && q.prompt === q.meaning && q.answer === q.word)))
}

console.log('\n4. 채점 — 기존 쓰기시험 엔진(isSpellingCorrect) 규칙 그대로')
{
  const q = { word: 'stir', meaning: '휘젓다, 섞다', direction: 'en2kr', prompt: 'stir', answer: '휘젓다, 섞다' }
  check('다중 정답 중 하나("섞다")만 맞아도 정답', gradeEntranceAnswer(q, '섞다'))
  check('오답은 오답', !gradeEntranceAnswer(q, '사과'))
  const q2 = { word: 'apple', meaning: '사과', direction: 'kr2en', prompt: '사과', answer: 'apple' }
  check('kr2en 대소문자/공백 무시: " APPLE "', gradeEntranceAnswer(q2, ' APPLE '))
  check('kr2en 오타는 오답: "aple"', !gradeEntranceAnswer(q2, 'aple'))
}

console.log('\n5. 시험 전체 채점 — 미응답(시간 초과)은 오답, missed 목록 정확')
{
  const qs = buildEntranceQuestions(WORDS.slice(0, 4), { count: 4, direction: 'en2kr', rng: makeRng() })
  const answers = qs.map((q, i) => (i < 2 ? q.meaning : undefined)) // 2개만 답하고 시간 초과
  const r = computeTestResult(qs, answers)
  check('점수 = 답한 2개', r.score === 2)
  check('total = 4', r.total === 4)
  check('missed = 못 푼 2개', r.missed.length === 2)
  check('accuracy = 0.5', r.accuracy === 0.5)
  check('answers 아예 없어도 크래시 없음(전부 오답)', computeTestResult(qs).score === 0)
  check('문제 0개면 accuracy 0(0으로 나누기 없음)', computeTestResult([], []).accuracy === 0)
}

console.log('\n6. 랭킹 — 동점 공동 순위(1,1,3 방식)')
{
  const rows = [
    { studentId: 'a', name: 'A', score: 10, total: 10, submittedAt: '2026-07-16T10:00:05Z' },
    { studentId: 'b', name: 'B', score: 10, total: 10, submittedAt: '2026-07-16T10:00:01Z' },
    { studentId: 'c', name: 'C', score: 8, total: 10, submittedAt: '2026-07-16T10:00:02Z' },
    { studentId: 'd', name: 'D', score: 8, total: 10, submittedAt: '2026-07-16T10:00:03Z' },
    { studentId: 'e', name: 'E', score: 5, total: 10, submittedAt: '2026-07-16T10:00:04Z' },
  ]
  const ranked = rankResults(rows)
  const byId = Object.fromEntries(ranked.map((r) => [r.studentId, r]))
  check('공동 1등 두 명(a, b 모두 rank 1)', byId.a.rank === 1 && byId.b.rank === 1)
  check('다음 순위는 3 (2 아님 — competition ranking)', byId.c.rank === 3 && byId.d.rank === 3)
  check('그 다음은 5', byId.e.rank === 5)
  check('동점자 표시 순서는 먼저 제출한 순(b가 a보다 앞)', ranked[0].studentId === 'b' && ranked[1].studentId === 'a')
  check('빈 배열 -> 빈 배열(크래시 없음)', rankResults([]).length === 0)
}

console.log('\n7. 랭킹 — 문항 수 다른 시험 섞여도 정확도 기준으로 공정 비교')
{
  const rows = [
    { studentId: 'a', score: 9, total: 10, submittedAt: '2026-07-16T10:00:00Z' }, // 90%
    { studentId: 'b', score: 18, total: 20, submittedAt: '2026-07-16T10:00:01Z' }, // 90% — 공동
    { studentId: 'c', score: 10, total: 20, submittedAt: '2026-07-16T10:00:02Z' }, // 50%
  ]
  const ranked = rankResults(rows)
  const byId = Object.fromEntries(ranked.map((r) => [r.studentId, r]))
  check('9/10과 18/20은 공동 1등', byId.a.rank === 1 && byId.b.rank === 1)
  check('10/20은 3등', byId.c.rank === 3)
}

console.log('\n8. 오늘의 VIP — 공동 1등이면 모두')
{
  const ranked = rankResults([
    { studentId: 'a', score: 10, total: 10, submittedAt: '2026-07-16T10:00:00Z' },
    { studentId: 'b', score: 10, total: 10, submittedAt: '2026-07-16T10:00:01Z' },
    { studentId: 'c', score: 7, total: 10, submittedAt: '2026-07-16T10:00:02Z' },
  ])
  const mvps = pickMvps(ranked)
  check('VIP 2명(공동 1등 전원)', mvps.length === 2)
  check('VIP는 a, b', new Set(mvps.map((m) => m.studentId)).has('a') && new Set(mvps.map((m) => m.studentId)).has('b'))
  check('단독 1등이면 1명', pickMvps(rankResults([
    { studentId: 'x', score: 10, total: 10, submittedAt: '2026-07-16T10:00:00Z' },
    { studentId: 'y', score: 9, total: 10, submittedAt: '2026-07-16T10:00:01Z' },
  ])).length === 1)
}

console.log('\n9. 학생당 최고 기록 1개 — 같은 날 재응시해도 랭킹에 한 번만')
{
  const rows = [
    { studentId: 'a', score: 5, total: 10, submittedAt: '2026-07-16T10:00:00Z' },
    { studentId: 'a', score: 9, total: 10, submittedAt: '2026-07-16T11:00:00Z' }, // 더 잘 봄
    { studentId: 'b', score: 7, total: 10, submittedAt: '2026-07-16T10:30:00Z' },
    { studentId: 'b', score: 7, total: 10, submittedAt: '2026-07-16T11:30:00Z' }, // 동률 재응시
  ]
  const best = bestResultPerStudent(rows)
  const byId = Object.fromEntries(best.map((r) => [r.studentId, r]))
  check('학생당 1행', best.length === 2)
  check('a는 더 높은 9점 기록', byId.a.score === 9)
  check('b 동률이면 먼저 제출한 기록(10:30)', byId.b.submittedAt === '2026-07-16T10:30:00Z')
  check('null/빈 입력 크래시 없음', bestResultPerStudent(null).length === 0)
}

console.log('\n10. 반별 요약 — 응시자/평균 정확도/많이 틀린 단어')
{
  const rows = [
    { studentId: 'a', score: 8, total: 10, missedWords: [{ word: 'stir', meaning: '휘젓다, 섞다' }, { word: 'cat', meaning: '고양이' }] },
    { studentId: 'b', score: 9, total: 10, missedWords: [{ word: 'stir', meaning: '휘젓다, 섞다' }] },
    { studentId: 'c', score: 10, total: 10, missedWords: [] },
  ]
  const s = summarizeClassResults(rows)
  check('응시자 3명', s.participants === 3)
  check('평균 정확도 = 0.9', Math.abs(s.avgAccuracy - 0.9) < 1e-9)
  check('가장 많이 틀린 단어는 stir(2회)', s.mostMissed[0]?.word === 'stir' && s.mostMissed[0]?.count === 2)
  check('그 다음 cat(1회)', s.mostMissed[1]?.word === 'cat' && s.mostMissed[1]?.count === 1)
  check('빈 결과 -> participants 0, 크래시 없음', summarizeClassResults([]).participants === 0)
  check('missedWords 없는 행 섞여도 크래시 없음', summarizeClassResults([{ studentId: 'x', score: 1, total: 2 }]).participants === 1)
}

console.log('\n11. 타이머 표시')
{
  check('125초 -> "2:05"', formatSeconds(125) === '2:05')
  check('60초 -> "1:00"', formatSeconds(60) === '1:00')
  check('0초 -> "0:00"', formatSeconds(0) === '0:00')
  check('음수 -> "0:00" (표시가 음수로 깨지지 않음)', formatSeconds(-3) === '0:00')
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
