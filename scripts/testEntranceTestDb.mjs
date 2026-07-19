// 입실 단어시험 DB 통합 테스트 — 라이브 Supabase에 QA_ 전용 반/학생을 만들어
// 시험 생성 -> 응시(결과 제출) -> 랭킹 -> 재제출(upsert) -> 종료 -> 정리까지
// 전체 흐름을 실제 코드(entranceTestApi.js 번들 + api/submit-entrance-
// result.js 실 핸들러)로 검증한다.
//
// (2026-07-19, P1 보안 감사 후속) 결과 제출은 더 이상 entranceTestApi.js
// 번들의 anon 직접 upsert가 아니라 api/submit-entrance-result.js를 실제
// (req,res) 핸들러로 직접 호출한다(testStudentPinAuth.mjs/testXpLedgerDb.mjs
// 와 동일 패턴 — vercel dev 등 새 도구 없이 실제 서버 로직 그대로 검증).
// 조회 계열(fetchTodayTests/fetchResultsForTests/fetchOwnResult)은 여전히
// anon key 기반 번들을 그대로 쓴다(안 바뀐 경로).
//
// ⚠️ supabase_v1_8_entrance_test.sql이 아직 실행 안 된 상태면 테이블이 없어
// 진행이 불가능한데, 이는 예상된 상태다(크래시 아님) — 그 경우 전체를
// 안전하게 SKIP하고 exit 0 (testStudentPinAuth.mjs의 마이그레이션 대기
// 패턴과 동일). SQL 실행 후 재실행하면 전부 검증된다.
//
// ⚠️ supabase_v2_4_entrance_result_rls.sql(이 세션 신규, 미실행 대기)이
// 실행되기 전까지는 entrance_test_results가 여전히 anon 전체 쓰기 허용
// 상태라, 로컬에 SUPABASE_SERVICE_ROLE_KEY가 없어도(api/_pinAuth.js의 anon
// key 폴백) 이 스크립트의 제출 검증은 그대로 전부 통과한다. v2.4 SQL 실행
// 후에는 로컬 실행 시 이 스크립트도 로그인/PIN/xp_ledger 스크립트와 같은
// 이유로 SUPABASE_SERVICE_ROLE_KEY 부재 시 제출 단계가 막힐 수 있다
// (PROJECT_BOARD.md BLOCKED 카드와 동일 근본 원인 — 신규 이슈 아님, Vercel
// 프로덕션은 서비스롤 키가 있어 정상 동작).
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   node scripts/buildEntranceBundle.mjs
//   node scripts/testEntranceTestDb.mjs
import fs from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildEntranceQuestions, computeTestResult, rankResults, pickMvps, summarizeClassResults } from '../src/utils/entranceTest.js'

// api/_pinAuth.js가 process.env.SUPABASE_URL/VITE_SUPABASE_URL 등을 읽으므로
// (testStudentPinAuth.mjs/testXpLedgerDb.mjs와 동일 이유), .env/.env.local
// 내용을 미리 process.env에 로드한다.
for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}

const wordlibPath = process.env.WORDLIB_BUNDLE || 'scripts/.tmp/wordLibrary.bundle.mjs'
const apiPath = process.env.ENTRANCE_BUNDLE || 'scripts/.tmp/entranceTestApi.bundle.mjs'
const wordlib = await import(pathToFileURL(resolve(wordlibPath)))
const api = await import(pathToFileURL(resolve(apiPath)))
const { default: submitHandler } = await import('../api/submit-entrance-result.js')

// fake Vercel (req,res) — testStudentPinAuth.mjs/testXpLedgerDb.mjs와 동일.
function callHandler(handler, body) {
  return new Promise((resolve) => {
    const res = {
      _status: 200,
      status(code) { this._status = code; return this },
      json(payload) { resolve({ status: this._status, body: payload }) },
    }
    handler({ method: 'POST', body }, res)
  })
}

// 서버 재검증 API는 questions([{word,direction}])+answers(문자열 배열)를
// 받는다(더 이상 score/total을 직접 안 받음) — entranceTestApi.js의
// submitEntranceResult와 동일한 페이로드 모양을 여기서도 그대로 구성한다.
async function submitViaApi(testId, studentId, questions, answers, durationSeconds) {
  return callHandler(submitHandler, {
    testId,
    studentId,
    answers: questions.map((q, i) => ({ word: q.word, direction: q.direction, input: answers[i] ?? '' })),
    durationSeconds,
  })
}

const QA_CLASS = 'QA_EntranceTest'
const QA_CLASS_2 = 'QA_EntranceTest2' // 반별 격리 검증용 두 번째 반
const QA_WORDS = [
  { word: 'apple', meaning: '사과' },
  { word: 'banana', meaning: '바나나' },
  { word: 'cat', meaning: '고양이' },
]

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// ── 0. 테이블 존재 확인 — 없으면 전체 SKIP (예상된 상태) ────────────────
const available = await api.checkEntranceTestAvailable()
if (!available) {
  console.log('\nSKIP — entrance_tests 테이블이 아직 없음 (supabase_v1_8_entrance_test.sql 미실행, 예상된 상태).')
  console.log('       운영자가 Supabase SQL Editor에서 SQL 실행 후 이 스크립트를 재실행하면 전체 검증됩니다.')
  // 응답 직후 곧바로 process.exit()하면 undici 소켓 핸들이 닫히는 중에
  // libuv assertion으로 죽는다(Windows + Node 24 재현 확인) — 한 틱 쉬고 종료.
  await new Promise((r) => setTimeout(r, 300))
  process.exit(0)
}
console.log('\nentrance_tests 테이블 확인됨 — 전체 통합 테스트 진행')

// ── 정리 헬퍼 — 이전 실행이 중간에 죽었어도 항상 깨끗한 상태에서 시작 ──
async function cleanup() {
  try {
    const students = wordlib.getStudents().filter((s) => s.className === QA_CLASS || s.className === QA_CLASS_2)
    for (const s of students) await wordlib.removeStudent(s.id)
    if (wordlib.getClassNames().includes(QA_CLASS)) await wordlib.deleteClass(QA_CLASS) // entrance_tests/results는 FK cascade로 함께 삭제
    if (wordlib.getClassNames().includes(QA_CLASS_2)) await wordlib.deleteClass(QA_CLASS_2)
  } catch (err) {
    console.log('  (cleanup 중 무시된 오류:', err.message, ')')
  }
}

await wordlib.initWordLibrary()
await cleanup()

let exitCode = 1
try {
  // ── 1. QA 반 + 학생 3명 준비 ─────────────────────────────────────────
  console.log('\n1. QA 반/학생 준비')
  await wordlib.createClass(QA_CLASS)
  const idA = await wordlib.addStudent('QA_ET_A', QA_CLASS)
  const idB = await wordlib.addStudent('QA_ET_B', QA_CLASS)
  const idC = await wordlib.addStudent('QA_ET_C', QA_CLASS)
  const classId = wordlib.getStudentClassId(idA)
  check('반/학생 생성 완료 (classId 확보)', !!classId && !!idA && !!idB && !!idC)

  // ── 2. 시험 생성 + 오늘자 조회 ───────────────────────────────────────
  console.log('\n2. 시험 생성(교사 "시험 시작") + 오늘자 조회')
  const test = await api.createEntranceTest(classId, {
    direction: 'en2kr', questionCount: 3, timeLimitSeconds: 60, words: QA_WORDS,
  })
  check('시험 행 생성, status=active', test.status === 'active')
  check('단어 스냅샷 3개 저장', test.words.length === 3 && test.words[0].word && test.words[0].meaning)
  const today = await api.fetchTodayTests(classId)
  check('fetchTodayTests가 방금 만든 시험을 반환', today.some((t) => t.id === test.id))
  check('findActiveTest가 active 시험을 찾음', api.findActiveTest(today)?.id === test.id)

  // ── 3. 같은 반에 새 시험 시작 -> 기존 active는 자동 close ────────────
  console.log('\n3. 같은 반 두 번째 시험 시작 -> 기존 시험 자동 종료(반당 active 1개)')
  const test2 = await api.createEntranceTest(classId, {
    direction: 'random', questionCount: 3, timeLimitSeconds: 120, words: QA_WORDS,
  })
  const after2 = await api.fetchTodayTests(classId)
  const oldRow = after2.find((t) => t.id === test.id)
  check('기존 시험이 closed로 바뀜', oldRow?.status === 'closed')
  check('active는 새 시험 하나뿐', api.findActiveTest(after2)?.id === test2.id)

  // ── 4. 응시 — 학생 3명이 문제 생성 후 실제 입력 답만 서버로 전송, 서버가
  //    entrance_tests.words로 재채점 (A,B 만점 동점, C 1/3) ────────────
  console.log('\n4. 학생 3명 응시 — 답만 전송, 서버(api/submit-entrance-result.js)가 재채점')
  const submitFor = async (studentId, answerFn, duration) => {
    const qs = buildEntranceQuestions(test2.words, { count: test2.questionCount, direction: 'en2kr' })
    const answers = qs.map(answerFn)
    const localExpected = computeTestResult(qs, answers) // 순수 로직 기대값(비교용)
    const r = await submitViaApi(test2.id, studentId, qs, answers, duration)
    return { r, localExpected }
  }
  const { r: rA, localExpected: eA } = await submitFor(idA, (q) => q.answer, 30)          // 만점
  const { r: rB, localExpected: eB } = await submitFor(idB, (q) => q.answer, 45)          // 만점 (동점)
  const { r: rC, localExpected: eC } = await submitFor(idC, (q, i) => (i === 0 ? q.answer : '틀림'), 50) // 1/3
  check('A 제출 성공, 서버 재채점이 로컬 채점과 일치(만점 3/3)', rA.body.ok === true && rA.body.score === 3 && rA.body.score === eA.score)
  check('B 제출 성공, 서버 재채점 만점(3/3)', rB.body.ok === true && rB.body.score === 3)
  check('C 제출 성공, 서버 재채점이 로컬 채점과 일치(1/3 + 오답 2개)', rC.body.ok === true && rC.body.score === 1 && rC.body.missed.length === 2 && rC.body.score === eC.score)

  // ── 5. 결과 조회 + 랭킹(공동 1등) + VIP ──────────────────────────────
  console.log('\n5. 결과 조회 + 랭킹 계산(DB 왕복 후에도 공동 순위 정확)')
  const rows = await api.fetchResultsForTests([test2.id])
  check('결과 3행', rows.length === 3)
  check('student_id(UUID)로 저장됨 (이름 아님)', rows.every((r) => /^[0-9a-f-]{36}$/i.test(r.studentId)))
  const ranked = rankResults(rows)
  const rankOf = (id) => ranked.find((r) => r.studentId === id)?.rank
  check('A, B 공동 1등', rankOf(idA) === 1 && rankOf(idB) === 1)
  check('C는 3등(competition ranking)', rankOf(idC) === 3)
  check('VIP는 공동 1등 2명', pickMvps(ranked).length === 2)
  const summary = summarizeClassResults(rows.map((r) => ({ ...r, missedWords: r.missedWords })))
  check('요약: 응시자 3명', summary.participants === 3)
  // (2026-07-16 수정) 원래 기대값은 count===2였는데 이 시나리오에서 오답을
  // 낸 학생은 C 하나뿐이라 "같은 단어를 2회 틀림"은 구조적으로 불가능 —
  // 테이블 부재로 SKIP만 되던 시절 한 번도 실행 안 된 기대값 오류(앱 버그
  // 아님, summarizeClassResults는 정상). C가 틀린 서로 다른 단어 2개가
  // 각 1회씩 집계되는 게 정확한 기대값. (여러 학생이 같은 단어를 틀리는
  // 교차 집계는 testEntranceTest.mjs 순수 로직 테스트가 커버.)
  check('요약: C의 오답 2개가 단어별 1회씩 정확히 집계됨',
    summary.mostMissed.length === 2 && summary.mostMissed.every((m) => m.count === 1))

  // ── 6. 재제출은 upsert — 행이 늘지 않고 점수만 갱신 ──────────────────
  console.log('\n6. 같은 학생 재제출 -> upsert(1행 유지)')
  {
    // C가 이번엔 2문제 맞음(재응시 시나리오) — 클라이언트가 어떤 score를
    // 주장하든 서버는 여전히 답만 보고 재채점한다.
    const qs2 = buildEntranceQuestions(test2.words, { count: test2.questionCount, direction: 'en2kr' })
    const answers2 = qs2.map((q, i) => (i < 2 ? q.answer : '틀림'))
    const r = await submitViaApi(test2.id, idC, qs2, answers2, 55)
    check('재제출도 정상 처리(서버가 2/3로 재채점)', r.body.ok === true && r.body.score === 2 && r.body.total === 3)
  }
  const rows2 = await api.fetchResultsForTests([test2.id])
  check('여전히 3행 (중복 INSERT 없음)', rows2.length === 3)
  check('C 점수가 2로 갱신됨', rows2.find((r) => r.studentId === idC)?.score === 2)
  // 학생별 격리 — C의 재제출이 다른 학생(A/B) 행을 건드리지 않아야 함
  // (운영자 지정 시나리오: "다른 학생 점수와 안 섞임").
  check('학생별 격리: C 재제출 후에도 A 점수 그대로(3)', rows2.find((r) => r.studentId === idA)?.score === 3)
  check('학생별 격리: C 재제출 후에도 B 점수 그대로(3)', rows2.find((r) => r.studentId === idB)?.score === 3)
  const own = await api.fetchOwnResult(test2.id, idC)
  check('fetchOwnResult로 본인 결과 확인 가능', own?.score === 2)
  check('없는 학생 결과는 null (크래시 없음)', (await api.fetchOwnResult(test2.id, idA.replace(/^......../, '00000000'))) === null)
  // "새로고침 후에도 점수 유지" — fetchOwnResult/fetchResultsForTests는 매번
  // DB를 새로 조회(로컬 캐시 없음)하므로 위 체크 자체가 DB 저장 증명.
  // 학생 화면도 같은 fetchOwnResult 경로로 복원한다(EntranceTest.jsx).

  // ── 6.5 반별 격리 — 다른 반에서는 이 시험/랭킹이 전혀 안 보여야 함 ────
  console.log('\n6.5. 반별 격리 — 다른 반은 이 시험이 안 보임(랭킹에도 안 나타남)')
  await wordlib.createClass(QA_CLASS_2)
  const idD = await wordlib.addStudent('QA_ET_D', QA_CLASS_2)
  const classId2 = wordlib.getStudentClassId(idD)
  check('두 번째 반 생성(classId 다름)', !!classId2 && classId2 !== classId)
  const otherClassTests = await api.fetchTodayTests(classId2)
  check('다른 반의 fetchTodayTests에 이 시험이 안 보임', !otherClassTests.some((t) => t.id === test.id || t.id === test2.id))
  check('다른 반 학생에겐 active 시험 없음(배너 안 뜸)', api.findActiveTest(otherClassTests) === null)
  // 랭킹은 fetchTodayTests(반별) -> 그 시험 id들로만 fetchResultsForTests를
  // 부르는 구조라, 위에서 시험 자체가 안 보이면 랭킹에도 구조적으로 못 섞임.
  check('다른 반 기준 결과 조회 대상 시험이 0개 -> 랭킹 원천 격리', otherClassTests.length === 0)

  // ── 7. 시험 종료 ──────────────────────────────────────────────────────
  console.log('\n7. 시험 종료(교사 "시험 종료")')
  await api.closeEntranceTest(test2.id)
  const afterClose = await api.fetchTodayTests(classId)
  check('active 시험 없음', api.findActiveTest(afterClose) === null)
  check('결과는 종료 후에도 그대로 조회됨(오늘의 랭킹 유지)', (await api.fetchResultsForTests([test2.id])).length === 3)

  // ── 7.5 조작 시도 거부 — 서버 재검증(P1 보안 감사 후속) 핵심 검증 ─────
  console.log('\n7.5. 조작 시도 거부 — 서버가 클라이언트 주장을 신뢰하지 않고 실제로 거부하는지 실측')
  {
    const qsFull = buildEntranceQuestions(test2.words, { count: test2.questionCount, direction: 'en2kr' })
    check('전제 조건: 3문제 출제됨', qsFull.length === 3)

    // (a) 가짜 점수 전송 — score/total 필드를 직접 끼워넣어도 서버는 그
    //     필드 자체를 읽지 않는다(요청 스키마에 score가 없다 — 여기선 전부
    //     오답으로 답하면서 score:999를 함께 보내 "혹시 어딘가에서 그대로
    //     신뢰되어 저장되지 않는지"를 실측한다).
    const allWrong = qsFull.map(() => '완전히틀린답')
    const fake = await callHandler(submitHandler, {
      testId: test2.id,
      studentId: idA,
      answers: qsFull.map((q, i) => ({ word: q.word, direction: q.direction, input: allWrong[i] })),
      durationSeconds: 10,
      score: 999, total: 3, missedWords: [], // 클라이언트가 조작 시도 — 서버가 무시해야 함
    })
    check('전부 오답으로 제출해도 서버가 재채점: score=0 (클라이언트가 보낸 999 무시)', fake.body.ok === true && fake.body.score === 0)
    const afterFake = await api.fetchOwnResult(test2.id, idA)
    check('DB에 저장된 값도 0/3 (999가 아님 — 조작 반영 안 됨)', afterFake?.score === 0 && afterFake?.total === 3)
    // A를 원래 만점 상태로 복구 — 이후 랭킹 관련 가정에 영향 없게(이 시점
    // 이후 랭킹을 다시 확인하는 체크는 없지만, 정리 전 상태를 명확히 함).
    await submitViaApi(test2.id, idA, qsFull, qsFull.map((q) => q.answer), 30)

    // (b) 문제 개수 축소 — 10문제 중 1문제만 "만점"으로 제출해 정확도를
    //     왜곡하는 시도 -> answer_count_mismatch로 거부.
    const shrunk = await callHandler(submitHandler, {
      testId: test2.id,
      studentId: idB,
      answers: [{ word: qsFull[0].word, direction: qsFull[0].direction, input: qsFull[0].answer }],
      durationSeconds: 5,
    })
    check('문제 개수를 줄여 제출 -> 거부(answer_count_mismatch)', shrunk.body.ok === false && shrunk.body.reason === 'answer_count_mismatch')

    // (c) 같은 단어 중복 제출(중복 farm) -> duplicate_word로 거부.
    const dup = await callHandler(submitHandler, {
      testId: test2.id,
      studentId: idB,
      answers: [
        { word: qsFull[0].word, direction: qsFull[0].direction, input: qsFull[0].answer },
        { word: qsFull[0].word, direction: qsFull[0].direction, input: qsFull[0].answer },
        { word: qsFull[0].word, direction: qsFull[0].direction, input: qsFull[0].answer },
      ],
      durationSeconds: 5,
    })
    check('같은 단어 3번 중복 제출 -> 거부(duplicate_word)', dup.body.ok === false && dup.body.reason === 'duplicate_word')

    // (d) 시험 스냅샷에 없는 가짜 단어 끼워넣기 -> unknown_word로 거부.
    const fakeWord = await callHandler(submitHandler, {
      testId: test2.id,
      studentId: idB,
      answers: [
        { word: 'not-a-real-word-in-this-test', direction: 'en2kr', input: '아무거나' },
        { word: qsFull[1].word, direction: qsFull[1].direction, input: qsFull[1].answer },
        { word: qsFull[2].word, direction: qsFull[2].direction, input: qsFull[2].answer },
      ],
      durationSeconds: 5,
    })
    check('스냅샷에 없는 단어 포함 -> 거부(unknown_word)', fakeWord.body.ok === false && fakeWord.body.reason === 'unknown_word')

    // (e) 고정 방향 시험(첫 번째 시험 test, direction='en2kr', 이미 closed
    //     상태지만 스냅샷은 여전히 조회 가능)에서 방향을 kr2en으로 속여
    //     제출 -> direction_mismatch로 거부.
    const wrongDir = await callHandler(submitHandler, {
      testId: test.id,
      studentId: idB,
      answers: test.words.map((w) => ({ word: w.word, direction: 'kr2en', input: w.word })),
      durationSeconds: 5,
    })
    check('고정 방향(en2kr) 시험에 kr2en으로 위장 제출 -> 거부(direction_mismatch)', wrongDir.body.ok === false && wrongDir.body.reason === 'direction_mismatch')

    // (f) 형식 검증 — 잘못된 testId/studentId/answers 형태도 거부.
    const badTestId = await callHandler(submitHandler, { testId: 'not-a-uuid', studentId: idB, answers: [{ word: 'x', direction: 'en2kr', input: 'y' }] })
    check('잘못된 testId 형식 -> 거부(invalid_test_id)', badTestId.body.ok === false && badTestId.body.reason === 'invalid_test_id')
    const badStudentId = await callHandler(submitHandler, { testId: test2.id, studentId: 'not-a-uuid', answers: [{ word: 'x', direction: 'en2kr', input: 'y' }] })
    check('잘못된 studentId 형식 -> 거부(invalid_student_id)', badStudentId.body.ok === false && badStudentId.body.reason === 'invalid_student_id')
    const badAnswers = await callHandler(submitHandler, { testId: test2.id, studentId: idB, answers: 'not-an-array' })
    check('answers가 배열이 아님 -> 거부(invalid_answers)', badAnswers.body.ok === false && badAnswers.body.reason === 'invalid_answers')
    const notFound = await callHandler(submitHandler, {
      testId: '00000000-0000-0000-0000-000000000000',
      studentId: idB,
      answers: [{ word: 'x', direction: 'en2kr', input: 'y' }],
    })
    check('존재하지 않는 testId -> 거부(test_not_found)', notFound.body.ok === false && notFound.body.reason === 'test_not_found')

    // 위 거부 시도들이 B/C의 실제 저장된 점수에 전혀 영향을 주지 않았는지
    // 최종 확인(조작 시도가 전부 no-op이었음을 실측으로 증명).
    const finalRows = await api.fetchResultsForTests([test2.id])
    check('B는 여전히 3/3 (조작 시도들이 전혀 반영 안 됨)', finalRows.find((r) => r.studentId === idB)?.score === 3)
    check('C는 여전히 2/3 (6단계 재제출 값 그대로)', finalRows.find((r) => r.studentId === idC)?.score === 2)
  }

  exitCode = failures === 0 ? 0 : 1
} catch (err) {
  console.error('\n예상치 못한 오류:', err)
  exitCode = 1
} finally {
  // ── 8. 정리 — QA 반 삭제(cascade로 시험/결과도 삭제) + 학생 제거 ─────
  console.log('\n8. QA 데이터 정리')
  await cleanup()
  const stillThere = wordlib.getClassNames().includes(QA_CLASS)
  check('QA 반 삭제 완료', !stillThere)
}

console.log(failures === 0 && exitCode === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
await new Promise((r) => setTimeout(r, 300)) // 위 SKIP 경로와 동일 — 소켓 정리 후 종료
process.exit(exitCode)
