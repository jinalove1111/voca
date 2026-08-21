// 쓰기 방향(spelling direction) 결정 구조의 구조적 버그 회귀 테스트
// (2026-08-20, 운영자 지시 — John 개별 예외 금지, 전체 학생 적용 구조 수정)
//
// 확정된 원인(재조사 없이 그대로 인용):
//   1) App.jsx:372 getClassSettings(getStudentClass(studentId))가 항상
//      "홈 반"(students.class_id) 설정만 읽어, 학생이 실제로 공부 중인
//      "학습 교재 반"(SCA primary가 가리키는 textbook의 owner_class_id)
//      설정이 무시됨.
//   2) wordLibrary.js DEFAULT_CLASS_SETTINGS.spellingDirection='mixed' —
//      이름 조회가 빗나가면(캐시 미비/빈 문자열) 조용히 mixed로 흡수.
//   3) refreshClassSettings 안의 동일한 `... : 'mixed'` 폴백(컬럼 부재/
//      이상값도 mixed로 흡수).
//   4) App.jsx:849 복습 경로가 'mixed' 문자열을 그대로 SpellingReview에
//      넘겨 SpellingQuestion:89의 Math.random()에 방향 결정을 맡김(50:50
//      미보장).
//   5) mixedDirections useMemo deps가 [spellingSettings, sessionWords.length]
//      라 복습 스코프 등에서 세션 도중 길이가 늘면 전체 재셔플.
//
// 검증 방법: 순수 함수/리졸버 부분은 scripts/fakeSupabaseModule.mjs 주입
// 오프라인 번들로 실제 실행(네트워크 0, buildWordLibOfflineBundle.mjs
// 산출물 사용). React 배선(App.jsx/SpellingReview.jsx/SpellingQuestion.jsx)
// 부분은 testWritingDirectionEngine.mjs 5절과 동일한 관례로 소스 정적 검사.
//
// 실행: node scripts/buildWordLibOfflineBundle.mjs && node scripts/testWritingDirectionResolution.mjs
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { assignDirections } from '../src/utils/entranceTest.js'

const BUNDLE = path.resolve(process.env.WORDLIB_OFFLINE_BUNDLE || 'scripts/.tmp/wordLibrary.offline.bundle.mjs')
const stub = await import(pathToFileURL(path.resolve('scripts/fakeSupabaseModule.mjs')).href)
const lib = await import(pathToFileURL(BUNDLE).href)

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}
// 수정 전 소스에는 getStudentSpellingSettings/extendStableDirections 자체가
// 없다(FAIL-first 실측 대상) — 함수 부재로 스크립트 전체가 죽어 나머지
// 단언을 못 세는 것을 막기 위해, 없으면 undefined로 안전하게 떨어뜨린다
// (check()가 "값이 기대와 다름"으로 정상 FAIL 처리하게 함).
const safeGetSettings = (studentId) => {
  try { return typeof lib.getStudentSpellingSettings === 'function' ? lib.getStudentSpellingSettings(studentId) : { spellingDirection: '__getStudentSpellingSettings_missing__' } }
  catch (err) { return { spellingDirection: `__threw__:${err.message}` } }
}
const safeExtend = (prevDirs, targetLength, direction, assignFn) => {
  try { return typeof lib.extendStableDirections === 'function' ? lib.extendStableDirections(prevDirs, targetLength, direction, assignFn) : [] }
  catch (err) { return [] }
}

// ════════════════════════════════════════════════════════════════════════
// 공용 픽스처 — 홈 반(사람 반, 텍스트북 미소유) + 학습 교재 반(별도 텍스트북
// 소유, SCA primary가 가리킴). John 실사고와 동일 형태: 홈 MS Advanced
// Class, 학습 교재 고1 능률 민병천.
// ════════════════════════════════════════════════════════════════════════
const STU = 'uuid-stu-john'
const HOME_ID = 'cls-home'
const CONTENT_ID = 'cls-content'
const UNIT_ID = 'unit-1'
const TB_ID = 'tb-content'
const HOME_NAME = 'MS Advanced Class'
const CONTENT_NAME = '고1 능률 민병천'

const clsRow = (id, name, i, direction) => ({
  id, name, class_type: i === 0 ? 'regular' : 'textbook',
  created_at: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
  spelling_test_enabled: false, spelling_hint_enabled: false, wrong_answer_repeat_count: 3,
  spelling_direction: direction, gamification_enabled: false,
})
const wordRow = (id, i) => ({
  id, unit_id: UNIT_ID, word: `w${i}`, meaning: `뜻${i}`, position: i,
  word_audio_url: null, example_audio_url: null, example_text: null, example_translation: null,
  memory_tip: null, accepted_meanings: null,
})
const words10 = Array.from({ length: 10 }, (_, i) => wordRow(`w${i}`, i))

// classes 배열을 undefined 등 결측으로 만들 수 있게(캐시 조회 실패/빈 캐시
// 시나리오) classesOverride를 별도 인자로 받는다.
function makeDataset({ homeDir = 'mixed', contentDir = 'kr2en', classesOverride } = {}) {
  return {
    classes: classesOverride !== undefined ? classesOverride : [
      clsRow(HOME_ID, HOME_NAME, 0, homeDir),
      clsRow(CONTENT_ID, CONTENT_NAME, 1, contentDir),
    ],
    units: [{ id: UNIT_ID, class_id: CONTENT_ID, name: 'Unit 1', position: 0 }],
    words: words10,
    daily_assignments: [],
    textbooks: [{ id: TB_ID, name: CONTENT_NAME, publisher_name: null, owner_class_id: CONTENT_ID }],
    class_textbooks: [],
    // classes(name) 조인 결과를 스텁이 실제로 project하지 않으므로(select
    // 컬럼을 해석하지 않음, fakeSupabaseModule.mjs 헤더 참고), 실제 join과
    // 동일한 모양(students.classes.name)을 픽스처가 직접 들고 있게 한다.
    students: [{
      id: STU, name: 'John', class_id: HOME_ID, unit_name: 'Unit 1', current_unit_id: UNIT_ID,
      house_id: null, created_at: '2026-01-01T00:00:00Z', classes: { name: HOME_NAME },
    }],
    student_class_assignments: [
      { id: 'sca-1', student_id: STU, class_id: CONTENT_ID, textbook_id: TB_ID, current_unit_id: UNIT_ID, is_primary: true },
    ],
  }
}

async function primeStudent(dataset) {
  stub.__setDataset(dataset)
  await lib.refreshWordLibrary()
  await lib.refreshTextbooks()
  await lib.refreshStudents()
  await lib.getStudentClassAssignments(STU) // SCA 캐시 프라이밍(콜드스타트면 홈 반 자동교재로 오폴백됨 — testStaleCacheRevalidation CASE A와 동일 필요성)
}

console.log('\n1. 홈 반(mixed) != 학습 교재 반(kr2en) → 학습 교재 반 우선(John 실제 조합)')
{
  const dataset = makeDataset({ homeDir: 'mixed', contentDir: 'kr2en' })
  await primeStudent(dataset)
  await lib.refreshClassSettings()
  check('사전조건 — 홈 반 mixed', lib.getClassSettings(HOME_NAME).spellingDirection === 'mixed')
  check('사전조건 — 학습 교재 반 kr2en', lib.getClassSettings(CONTENT_NAME).spellingDirection === 'kr2en')
  const settings = safeGetSettings(STU)
  check('리졸버 결과 = kr2en(학습 교재 반 우선, 홈 mixed 무시)', settings.spellingDirection === 'kr2en', settings)
}

console.log('\n2. 반대 조합 — 홈 kr2en, 학습 교재 반 mixed → 학습 교재 반(mixed) 우선')
{
  const dataset = makeDataset({ homeDir: 'kr2en', contentDir: 'mixed' })
  await primeStudent(dataset)
  await lib.refreshClassSettings()
  const settings = safeGetSettings(STU)
  check('리졸버 결과 = mixed(학습 교재 반 우선, 홈 kr2en 무시)', settings.spellingDirection === 'mixed', settings)
}

console.log('\n3. 설정 캐시가 비었거나 조회 실패 → mixed 아니라 kr2en')
{
  const dataset = makeDataset({ homeDir: 'kr2en', contentDir: 'kr2en' })
  await primeStudent(dataset) // _cache/_textbooks/_studentAssignmentsCache는 정상 프라이밍(구조 해석은 됨)
  // classSettings만 비운다 — classes를 undefined로 주면 스텁이 빈 배열로
  // 취급(execute()의 Array.isArray 가드), refreshClassSettings가 성공
  // 응답(data=[])으로 _classSettings={} 를 만든다. "캐시가 비었음" 시나리오의
  // 결정적 재현(에러 throw 자체는 이 오프라인 스텁이 만들 수 없음 — 스텁
  // 헤더 주석 참고, execute()는 항상 error:null).
  stub.__setDataset({ ...dataset, classes: undefined })
  await lib.refreshClassSettings()
  check('_classSettings가 실제로 비었음(전제)', lib.getClassSettings(HOME_NAME) === lib.getClassSettings('___nope___'))
  const settings = safeGetSettings(STU)
  check('캐시 빈 상태 → kr2en(안전 기본값, mixed 아님)', settings.spellingDirection === 'kr2en', settings)
  check('DEFAULT_CLASS_SETTINGS 자체도 kr2en(임의 미존재 반 이름 조회)',
    lib.getClassSettings('___definitely_not_a_class___').spellingDirection === 'kr2en')
}

console.log('\n4. 컬럼 부재/이상값(null, \'\', \'weird\') → kr2en')
{
  for (const weirdValue of [null, '', 'weird', undefined]) {
    const dataset = makeDataset({ homeDir: 'kr2en', contentDir: 'kr2en' })
    dataset.classes[1].spelling_direction = weirdValue // 학습 교재 반에 이상값 주입
    await primeStudent(dataset)
    await lib.refreshClassSettings()
    const settings = safeGetSettings(STU)
    check(`spelling_direction=${JSON.stringify(weirdValue)} → kr2en`, settings.spellingDirection === 'kr2en', settings)
  }
}

console.log('\n5. mixed는 관리자가 명시적으로 저장한 경우에만 반환')
{
  const dataset = makeDataset({ homeDir: 'kr2en', contentDir: 'mixed' })
  await primeStudent(dataset)
  await lib.refreshClassSettings()
  const settings = safeGetSettings(STU)
  check('학습 교재 반이 명시적으로 mixed로 저장된 경우에만 mixed 반환', settings.spellingDirection === 'mixed')
}

console.log('\n6. mixed 무회귀 — assignDirections로 정확히 50:50 배정')
{
  const dirs = assignDirections(40, 'mixed')
  const kr = dirs.filter((d) => d === 'kr2en').length
  const en = dirs.filter((d) => d === 'en2kr').length
  check('40문제 mixed 배정이 정확히 20:20', kr === 20 && en === 20, { kr, en })
}

console.log('\n7. John 재현 회귀 — 홈/학습 반 둘 다 kr2en인데 설정 조회 자체가 실패 → mixed 아니라 kr2en')
{
  const dataset = makeDataset({ homeDir: 'kr2en', contentDir: 'kr2en' })
  await primeStudent(dataset) // 구조(_cache/_textbooks/_studentAssignmentsCache)는 정상
  stub.__setDataset({ ...dataset, classes: undefined }) // 설정 조회만 실패(빈 캐시로 귀결)
  await lib.refreshClassSettings()
  const settings = safeGetSettings(STU)
  check('John 재현 — 결과가 mixed가 아니라 kr2en', settings.spellingDirection === 'kr2en', settings)
}

console.log('\n8. 세션 중 길이 증가에도 이미 배정된 인덱스의 방향이 바뀌지 않음(extendStableDirections)')
{
  let seed = 42
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const initial = assignDirections(10, 'mixed', { rng })
  const extended = safeExtend(initial, 16, 'mixed')
  check('길이가 10 → 16으로 늘어남', extended.length === 16, { len: extended.length })
  check('기존 10개 인덱스의 방향은 전혀 바뀌지 않음(정확히 동일 값/순서)',
    initial.length === 10 && initial.every((d, i) => extended[i] === d))
  const shrinkRequest = safeExtend(extended, 5, 'mixed') // 축소 요청은 무시(안전)
  check('targetLength가 더 작으면 기존 배열을 그대로 반환(변경 없음)',
    shrinkRequest.length === extended.length && shrinkRequest.every((d, i) => d === extended[i]))
  check('빈 배열에서 시작해도 정상 확장', safeExtend([], 4, 'mixed').length === 4)
  check('배정 함수 자체는 새로 발명하지 않고 assignDirections 재사용(기본 인자)',
    safeExtend([], 4, 'kr2en').every((d) => d === 'kr2en'))
}

// ════════════════════════════════════════════════════════════════════════
// 9~10. SpellingQuestion.jsx 정적 계약 — 질문 단계(phase==='answer')는
// pairedText(반대 언어 병기, 정답 노출 전용)를 절대 참조하지 않는다.
// (SpellingQuestion.jsx는 이번 작업에서 손대지 않음 — 원인 조사에서 "한
// 문제 안에서 두 언어가 동시에 렌더되는 버그는 없다"로 확인 완료. 이
// 계약이 실제로 지켜지고 있는지만 고정한다.)
// ════════════════════════════════════════════════════════════════════════
console.log('\n9. kr2en 세션 — prompt는 한글(meaning), 영어 정답(word)은 입력 전 노출 0 (SpellingQuestion.jsx 정적 계약)')
console.log('10. en2kr 세션 — prompt는 영어(word), 한글 정답(meaning)은 입력 전 노출 0 (SpellingQuestion.jsx 정적 계약)')
{
  const src = readFileSync('src/components/SpellingQuestion.jsx', 'utf8')
  check('promptText 계약 — isEn2Kr이면 word, 아니면(kr2en) meaning',
    /const promptText = isEn2Kr \? word : meaning/.test(src))
  check('targetAnswer 계약 — isEn2Kr이면 meaning(한글 정답), 아니면 word(영어 정답)',
    /const targetAnswer = isEn2Kr \? meaning : word/.test(src))
  // phase==='answer' 블록(질문 화면, 371~389행 부근)만 추출해 pairedText
  // 미참조를 확인한다 — reveal/correct 블록(정답 노출 시점)은 pairedText를
  // 써도 무방(그게 정상 동작)하므로 파일 전체가 아니라 이 블록만 검사한다.
  const answerBlockMatch = src.match(/\{phase === 'answer' && \(([\s\S]*?)\)\}\s*\{phase === 'reveal'/)
  check('phase===answer 블록을 소스에서 추출 성공(전제)', !!answerBlockMatch)
  const answerBlock = answerBlockMatch ? answerBlockMatch[1] : ''
  check('질문 단계(phase===answer) JSX는 pairedText를 참조하지 않음(정답 언어 사전 노출 0)',
    answerBlockMatch != null && !/pairedText/.test(answerBlock))
  check('질문 단계(phase===answer) JSX는 targetAnswer도 참조하지 않음(정답 자체 사전 노출 0)',
    answerBlockMatch != null && !/targetAnswer/.test(answerBlock))
}

// ════════════════════════════════════════════════════════════════════════
// 11~14. App.jsx 배선 정적 검사 — 리졸버 사용/폴백/복습 경로/안정성.
// ════════════════════════════════════════════════════════════════════════
console.log('\n11. App.jsx:372 — getClassSettings(getStudentClass(...)) 대신 getStudentSpellingSettings(studentId) 리졸버 사용')
{
  const app = readFileSync('src/App.jsx', 'utf8')
  check('옛 버그 패턴(getClassSettings(getStudentClass(studentId))) 제거됨',
    !/getClassSettings\(getStudentClass\(studentId\)\)/.test(app))
  check('새 리졸버 getStudentSpellingSettings(studentId) 사용',
    /getStudentSpellingSettings\(studentId\)/.test(app))
  check('try/catch 폴백 객체에도 spellingDirection: \'kr2en\' 포함(기존 undefined 누락 수정)',
    /catch \{ return \{[^}]*spellingDirection: 'kr2en'[^}]*\} \}/.test(app))
}

console.log('\n12. App.jsx — mixedDirections/guidedMixedDirections가 세션 중 재셔플되지 않는 안정 배정 패턴 사용')
{
  const app = readFileSync('src/App.jsx', 'utf8')
  check('mixedDirections가 useRef로 이전 배정을 보관', /mixedDirectionsRef\s*=\s*useRef/.test(app))
  check('extendStableDirections로 델타만 확장(전체 재셔플 아님)', /extendStableDirections\(/.test(app))
  check('guidedMixedDirections도 동일 안정화 패턴 적용', /guidedMixedDirectionsRef\s*=\s*useRef/.test(app))
}

console.log('\n13. App.jsx:849 복습 경로 — direction=\'mixed\' 문자열을 그대로 넘기지 않고 사전 배정된 방향을 사용')
{
  const app = readFileSync('src/App.jsx', 'utf8')
  const spellingReviewJsxMatch = app.match(/<SpellingReview\b[\s\S]*?\/>/)
  check('SpellingReview JSX 블록을 소스에서 추출 성공(전제)', !!spellingReviewJsxMatch)
  const block = spellingReviewJsxMatch ? spellingReviewJsxMatch[0] : ''
  check('SpellingReview에 mixed 전용 사전 배정 배열이 prop으로 전달됨(mixedDirections=)',
    /mixedDirections=\{/.test(block))
}

console.log('\n14. SpellingReview.jsx — mixed일 때 Math.random() 경로(SpellingQuestion 내부 기본 처리)에 맡기지 않고 사전 배정 인덱스 조회')
{
  const reviewSrc = readFileSync('src/components/SpellingReview.jsx', 'utf8')
  check('SpellingReview가 mixedDirections prop을 받음', /mixedDirections/.test(reviewSrc))
  check('SpellingQuestion에 direction=\'mixed\' 리터럴을 그대로 넘기지 않음(사전 배정 값 사용)',
    !/direction=\{direction \|\| 'kr2en'\}/.test(reviewSrc))
}

console.log('\n15. wordLibrary.js — 안전한 기본값 소스 확인')
{
  const lib_src = readFileSync('src/utils/wordLibrary.js', 'utf8')
  check('DEFAULT_CLASS_SETTINGS.spellingDirection = \'kr2en\'',
    /DEFAULT_CLASS_SETTINGS = \{[^}]*spellingDirection: 'kr2en'/.test(lib_src))
  check('refreshClassSettings 폴백도 kr2en(VALID_SPELLING_DIRECTIONS.has 패턴)',
    /VALID_SPELLING_DIRECTIONS\.has\(c\.spelling_direction\) \? c\.spelling_direction : 'kr2en'/.test(lib_src))
  check('근거 주석(운영자 지시 2026-08-20)이 두 지점 모두에 존재',
    (lib_src.match(/운영자 지시 2026-08-20/g) || []).length >= 2)
}

console.log(failures === 0
  ? '\n모든 단언 통과 — 쓰기 방향 결정 구조 버그 회귀 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
