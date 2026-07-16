// 입실 단어시험 DB 통합 테스트 — 라이브 Supabase에 QA_ 전용 반/학생을 만들어
// 시험 생성 -> 응시(결과 제출) -> 랭킹 -> 재제출(upsert) -> 종료 -> 정리까지
// 전체 흐름을 실제 코드(entranceTestApi.js 번들)로 검증한다.
//
// ⚠️ supabase_v1_8_entrance_test.sql이 아직 실행 안 된 상태면 테이블이 없어
// 진행이 불가능한데, 이는 예상된 상태다(크래시 아님) — 그 경우 전체를
// 안전하게 SKIP하고 exit 0 (testStudentPinAuth.mjs의 마이그레이션 대기
// 패턴과 동일). SQL 실행 후 재실행하면 전부 검증된다.
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   node scripts/buildEntranceBundle.mjs
//   node scripts/testEntranceTestDb.mjs
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildEntranceQuestions, computeTestResult, rankResults, pickMvps, summarizeClassResults } from '../src/utils/entranceTest.js'

const wordlibPath = process.env.WORDLIB_BUNDLE || 'scripts/.tmp/wordLibrary.bundle.mjs'
const apiPath = process.env.ENTRANCE_BUNDLE || 'scripts/.tmp/entranceTestApi.bundle.mjs'
const wordlib = await import(pathToFileURL(resolve(wordlibPath)))
const api = await import(pathToFileURL(resolve(apiPath)))

const QA_CLASS = 'QA_EntranceTest'
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
    const students = wordlib.getStudents().filter((s) => s.className === QA_CLASS)
    for (const s of students) await wordlib.removeStudent(s.id)
    if (wordlib.getClassNames().includes(QA_CLASS)) await wordlib.deleteClass(QA_CLASS) // entrance_tests/results는 FK cascade로 함께 삭제
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

  // ── 4. 응시 — 학생 3명이 문제 생성/채점/제출 (A,B 만점 동점, C 1/3) ──
  console.log('\n4. 학생 3명 응시 — 순수 로직으로 채점 후 결과 제출')
  const submitFor = async (studentId, answerFn, duration) => {
    const qs = buildEntranceQuestions(test2.words, { count: test2.questionCount, direction: 'en2kr' })
    const result = computeTestResult(qs, qs.map(answerFn))
    await api.submitEntranceResult(test2.id, studentId, {
      score: result.score, total: result.total, missedWords: result.missed, durationSeconds: duration,
    })
    return result
  }
  const rA = await submitFor(idA, (q) => q.answer, 30)          // 만점
  const rB = await submitFor(idB, (q) => q.answer, 45)          // 만점 (동점)
  const rC = await submitFor(idC, (q, i) => (i === 0 ? q.answer : '틀림'), 50) // 1/3
  check('A 만점(3/3)', rA.score === 3 && rA.total === 3)
  check('B 만점(3/3)', rB.score === 3)
  check('C는 1/3 + 오답 2개 기록', rC.score === 1 && rC.missed.length === 2)

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
  check('요약: 많이 틀린 단어 집계됨(2회 틀린 단어 존재)', summary.mostMissed[0]?.count === 2)

  // ── 6. 재제출은 upsert — 행이 늘지 않고 점수만 갱신 ──────────────────
  console.log('\n6. 같은 학생 재제출 -> upsert(1행 유지)')
  await api.submitEntranceResult(test2.id, idC, { score: 2, total: 3, missedWords: [{ word: 'cat', meaning: '고양이' }], durationSeconds: 55 })
  const rows2 = await api.fetchResultsForTests([test2.id])
  check('여전히 3행 (중복 INSERT 없음)', rows2.length === 3)
  check('C 점수가 2로 갱신됨', rows2.find((r) => r.studentId === idC)?.score === 2)
  const own = await api.fetchOwnResult(test2.id, idC)
  check('fetchOwnResult로 본인 결과 확인 가능', own?.score === 2)
  check('없는 학생 결과는 null (크래시 없음)', (await api.fetchOwnResult(test2.id, idA.replace(/^......../, '00000000'))) === null)

  // ── 7. 시험 종료 ──────────────────────────────────────────────────────
  console.log('\n7. 시험 종료(교사 "시험 종료")')
  await api.closeEntranceTest(test2.id)
  const afterClose = await api.fetchTodayTests(classId)
  check('active 시험 없음', api.findActiveTest(afterClose) === null)
  check('결과는 종료 후에도 그대로 조회됨(오늘의 랭킹 유지)', (await api.fetchResultsForTests([test2.id])).length === 3)

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
