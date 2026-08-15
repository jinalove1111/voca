// stale cache BUG — 관리자 변경(단어 업로드/교재·Unit 배정/시험 생성)이 켜둔
// 학생 세션에 반영 안 되는 문제 (2026-08-15, 98차 감사 갭 ①②③)
//
// 이 파일이 고정하는 3개 계약:
//   갭 ① invalidateStudentAssignmentsCache(studentId) — SCA(_studentAssignmentsCache)
//        캐시를 App.jsx visibility 재검증에 편입. 참고: getStudentClassAssignments
//        자신은 캐시를 "읽지" 않고 항상 라이브 재조회한다(끝에 캐시를 다시
//        채울 뿐) — 스테일은 그 캐시를 "동기"로 읽는 소비자
//        (getStudentPrimaryTextbook/getStudentAssignedTextbookIds/
//        getStudentWords의 classId override 검증)에서 실제로 관측된다.
//        아래 CASE A는 이 소비자 기준으로 재현한다(원 설계 메모의
//        "getStudentClassAssignments 여전히 옛값" 표현은 그 함수 자체가 아니라
//        이 동기 소비자들을 가리키는 것으로 해석 — 코드 재확인 결과 명시).
//   갭 ② refreshAllForLogin(studentId) — 재로그인이 단어/교재/반설정/SCA
//        캐시를 전부 무효화. initWordLibrary 완료 전(콜드)엔 기존
//        refreshStudents 단독 동작으로 폴백(중복 fetch 방지).
//   갭 ③ revalidateUnitWords(unitId) — 연속 foreground(visibility 이벤트 없음)
//        에서 유닛 진입 시 서버 단어 "수"만 가볍게(count HEAD) 확인, 불일치
//        시에만 refreshWordLibrary() 전체 갱신. 같은 유닛 60초 내 재확인은
//        스로틀로 no-op(추가 네트워크 0).
//
// 네트워크 0 — scripts/fakeSupabaseModule.mjs 주입 오프라인 번들 사용.
// 실행: node scripts/buildWordLibOfflineBundle.mjs && node scripts/testStaleCacheRevalidation.mjs
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const BUNDLE = path.resolve(process.env.WORDLIB_OFFLINE_BUNDLE || 'scripts/.tmp/wordLibrary.offline.bundle.mjs')
const stub = await import(pathToFileURL(path.resolve('scripts/fakeSupabaseModule.mjs')).href)
const lib = await import(pathToFileURL(BUNDLE).href)

let failures = 0
const perf = {} // 성능 계수 실측치 — 최종 보고에 그대로 인용
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}
const callCount = () => stub.__getCalls().length

// ════════════════════════════════════════════════════════════════════════
// 공용 픽스처(CASE A/B/D) — 텍스트북 2개(TB1/TB2) + 유닛 2개(U1 성장/U2 안정)
// ════════════════════════════════════════════════════════════════════════
const STU = 'uuid-stu-1'
const C1 = 'cls-c1' // 홈(사람) 반 — TB1 소유
const C2 = 'cls-c2' // 전환 대상 교재 반 — TB2 소유
const C3 = 'cls-c3' // 단어 재검증 대상(U1)
const C4 = 'cls-c4' // 단어 재검증 안정 대조군(U2)
const TB1 = 'tb-1'
const TB2 = 'tb-2'
const U1 = 'unit-u1'
const U2 = 'unit-u2'

const clsRow = (id, name, i) => ({
  id, name, class_type: 'textbook', created_at: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
  spelling_test_enabled: false, spelling_hint_enabled: false, wrong_answer_repeat_count: 3,
  spelling_direction: 'mixed', gamification_enabled: false,
})
const wordRow = (id, unitId, prefix, i) => ({
  id, unit_id: unitId, word: `${prefix}_${i}`, meaning: `${prefix}_${i}의 뜻`, position: i,
  word_audio_url: null, example_audio_url: null, example_text: null, example_translation: null,
  memory_tip: null, accepted_meanings: null,
})

const u1Words = Array.from({ length: 38 }, (_, i) => wordRow(`u1-w${i}`, U1, 'u1w', i))
const u2Words = Array.from({ length: 10 }, (_, i) => wordRow(`u2-w${i}`, U2, 'u2w', i))

const dataset = {
  classes: [clsRow(C1, 'C1반', 0), clsRow(C2, 'C2반', 1), clsRow(C3, 'C3반', 2), clsRow(C4, 'C4반', 3)],
  units: [
    { id: U1, class_id: C3, name: 'Unit 1', position: 0 },
    { id: U2, class_id: C4, name: 'Unit 1', position: 0 },
  ],
  words: [...u1Words, ...u2Words],
  daily_assignments: [],
  textbooks: [
    { id: TB1, name: 'C1반', publisher_name: null, owner_class_id: C1 },
    { id: TB2, name: 'C2반', publisher_name: null, owner_class_id: C2 },
  ],
  class_textbooks: [],
  students: [
    { id: STU, name: 'Stella', class_id: C1, unit_name: 'Unit 1', current_unit_id: null, house_id: null, created_at: '2026-01-01T00:00:00Z' },
  ],
  student_class_assignments: [
    { id: 'sca-1', student_id: STU, class_id: C1, textbook_id: TB1, current_unit_id: null, is_primary: true },
  ],
}

stub.__setDataset(dataset)
await lib.refreshWordLibrary()
await lib.refreshTextbooks()
await lib.refreshStudents()

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE A — invalidateStudentAssignmentsCache (갭 ①) ===')
// ════════════════════════════════════════════════════════════════════════
await lib.getStudentClassAssignments(STU) // 프라이밍
check('프라이밍 후 primary 교재 = TB1', lib.getStudentPrimaryTextbook(STU)?.id === TB1)
check('배정 텍스트북id 목록에 TB1 포함', lib.getStudentAssignedTextbookIds(STU).includes(TB1))

console.log('  — 관리자가 다른 세션에서 새 primary 교재를 배정(서버 데이터만 변경) —')
dataset.student_class_assignments = [
  { id: 'sca-1', student_id: STU, class_id: C1, textbook_id: TB1, current_unit_id: null, is_primary: false },
  { id: 'sca-2', student_id: STU, class_id: C2, textbook_id: TB2, current_unit_id: null, is_primary: true },
]
check('무효화 전 — 캐시된 primary 교재가 여전히 TB1(스테일, 수정 전 FAIL 재현 대상)',
  lib.getStudentPrimaryTextbook(STU)?.id === TB1)

const callsBeforeInvalidate = callCount()
lib.invalidateStudentAssignmentsCache(STU)
perf.invalidateCallDelta = callCount() - callsBeforeInvalidate
check('invalidate 자체는 네트워크 호출 0건(순수 Map 삭제)', perf.invalidateCallDelta === 0)
// 결정적 단언 — getStudentAssignedTextbookIds는 캐시가 "비어있으면" 그대로
// 빈 배열을 반환한다(getStudentPrimaryTextbook과 달리 반 기본 교재로
// 폴백하지 않음) — 이 학생의 홈 반(C1)이 마침 옛 primary(TB1)와 같은
// 교재를 소유해 getStudentPrimaryTextbook 단독으로는 "무효화가 실제로
// Map을 지웠는지"와 "여전히 스테일 TB1인지"를 구분 못한다. 이 단언이 그
// 구분을 결정적으로 만든다(invalidate가 no-op이면 여전히 [TB1]).
check('무효화 직후(재조회 전) — 배정 캐시가 실제로 비었음(Map.delete 발생, 수정 전 FAIL 재현 대상)',
  lib.getStudentAssignedTextbookIds(STU).length === 0)

console.log('  — 다음 실제 조회("화면이 배정을 읽을 때")가 최신을 반영 —')
await lib.getStudentClassAssignments(STU)
check('무효화 후 다음 실제 조회에서 primary 교재가 TB2로 갱신',
  lib.getStudentPrimaryTextbook(STU)?.id === TB2)
check('배정 텍스트북id 목록도 TB2 반영', lib.getStudentAssignedTextbookIds(STU).includes(TB2))

console.log('  — 전체 무효화(studentId 생략) 형태도 동일하게 동작 —')
lib.invalidateStudentAssignmentsCache()
check('전체 무효화 직후(재조회 전) — 이 학생 배정 캐시도 비었음(수정 전 FAIL 재현 대상)',
  lib.getStudentAssignedTextbookIds(STU).length === 0)
await lib.getStudentClassAssignments(STU)
check('전체 무효화 후 재조회도 정상(TB2 유지)', lib.getStudentPrimaryTextbook(STU)?.id === TB2)

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE B — revalidateUnitWords (갭 ③) ===')
// ════════════════════════════════════════════════════════════════════════
check('초기 U1 단어 수 38(전제 확인)', lib.getWordsByUnitId(U1).length === 38)
check('대조군 U2 단어 수 10(전제 확인)', lib.getWordsByUnitId(U2).length === 10)

console.log('  — 관리자가 수업 중 단어 2개 업로드(서버 데이터만 변경) —')
dataset.words.push(wordRow('u1-w38', U1, 'u1w', 38), wordRow('u1-w39', U1, 'u1w', 39))
check('업로드 직후 캐시는 여전히 38(전제 확인, revalidate 호출 전, 수정 전 FAIL 재현 대상)',
  lib.getWordsByUnitId(U1).length === 38)

const callsBeforeRevalidate = callCount()
const changed = await lib.revalidateUnitWords(U1)
perf.revalidateChangedCallDelta = callCount() - callsBeforeRevalidate
check('불일치 감지 → true 반환(수정 전 FAIL 재현 대상)', changed === true)
check('캐시가 40으로 갱신됨', lib.getWordsByUnitId(U1).length === 40)
check('불일치 시 count 쿼리 + 전체 refresh(여러 테이블) 합쳐 1건 초과 호출',
  perf.revalidateChangedCallDelta > 1, perf.revalidateChangedCallDelta)
{
  const newCalls = stub.__getCalls().slice(callsBeforeRevalidate)
  check('count 쿼리(head)가 실제로 words 테이블에 나감', newCalls.some((c) => c.table === 'words' && c.head === true))
  check('불일치 시 전체 refresh 경로(classes/units/daily_assignments)도 함께 실행됨',
    ['classes', 'units', 'daily_assignments'].every((t) => newCalls.some((c) => c.table === t)))
}

console.log('  — 같은 유닛 60초 내 재호출은 스로틀로 no-op —')
const callsBeforeThrottled = callCount()
const changed2 = await lib.revalidateUnitWords(U1)
perf.throttledCallDelta = callCount() - callsBeforeThrottled
check('스로틀 구간 재호출은 false 반환', changed2 === false)
check('스로틀 구간에서는 추가 네트워크 호출 0건(count 쿼리조차 안 나감)', perf.throttledCallDelta === 0)

console.log('  — 변경 없는 유닛(U2)은 count 쿼리 1회만 나가고 전체 refresh는 안 함 —')
const callsBeforeStable = callCount()
const changedStable = await lib.revalidateUnitWords(U2)
perf.unchangedUnitCallDelta = callCount() - callsBeforeStable
check('변경 없음 → false 반환', changedStable === false)
check('변경 없음 → count 쿼리 정확히 1회만 추가(전체 refresh 없음)', perf.unchangedUnitCallDelta === 1)
check('U2 단어 수는 그대로 10(무영향)', lib.getWordsByUnitId(U2).length === 10)
check('unitId 없이 호출하면 false, 호출 0건', await lib.revalidateUnitWords(null) === false)

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE C — 배너 경로(EntranceTestBanner.jsx) 무접촉 확인 ===')
// ════════════════════════════════════════════════════════════════════════
// verify:entrance-fresh-scope(scripts/testEntranceBannerFreshScope.mjs)가 이미
// getStudentEntranceClassIds({fresh}) + 배너 폴링 계약을 전담 검증한다. 이번
// 작업은 App.jsx/wordLibrary.js 2개 파일만 수정(배너 컴포넌트 무접촉) —
// 소스에서 직접 확인한다(diff 0 단언).
{
  const src = (await import('node:fs')).readFileSync('src/components/EntranceTestBanner.jsx', 'utf8')
  check('EntranceTestBanner.jsx는 이번 작업의 신규 export를 참조하지 않음(무접촉 확인)',
    !/invalidateStudentAssignmentsCache|revalidateUnitWords|refreshAllForLogin/.test(src))
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE D — refreshWordLibrary() 직접 호출도 40 반영(페이지네이션 경로 재사용) ===')
// ════════════════════════════════════════════════════════════════════════
await lib.refreshWordLibrary()
check('refreshWordLibrary 직접 호출도 U1 40개 반영', lib.getWordsByUnitId(U1).length === 40)

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE E — refreshAllForLogin: 웜 재로그인 시 전체 캐시 무효화 (갭 ②) ===')
// ════════════════════════════════════════════════════════════════════════
// 별도 모듈 인스턴스(cache-busting import) — lib(위 A~D)이 이미 initWordLibrary
// 없이 개별 refresh만 호출해 왔으므로 _initCompletedAt이 null로 남아 있고,
// 이 섹션은 "웜"(initWordLibrary 완료 후) 분기를 정확히 겨냥해야 하므로 별도
// 인스턴스로 완전히 새 _initCompletedAt/캐시 상태에서 검증한다.
const libWarm = await import(pathToFileURL(BUNDLE).href + '?warm=' + Date.now())
const STU2 = 'uuid-stu-2'
const C1B = 'cls-c1b' // 홈 반(사람 반, 텍스트북 미소유)
const C2B = 'cls-c2b' // 교재 반(TB1B 소유)
const TB1B = 'tb-1b'
const U3 = 'unit-u3'
const u3Words = Array.from({ length: 20 }, (_, i) => wordRow(`u3-w${i}`, U3, 'u3w', i))

const loginDataset = {
  classes: [
    { ...clsRow(C1B, 'C1B반(홈)', 0), class_type: 'regular' },
    { ...clsRow(C2B, 'C2B반(교재)', 1), spelling_direction: 'mixed' },
  ],
  units: [{ id: U3, class_id: C2B, name: 'Unit 1', position: 0 }],
  words: [...u3Words],
  daily_assignments: [],
  textbooks: [{ id: TB1B, name: 'C2B반(교재)', publisher_name: null, owner_class_id: C2B }],
  class_textbooks: [],
  students: [
    { id: STU2, name: 'Warmy', class_id: C1B, unit_name: 'Unit 1', current_unit_id: null, house_id: null, created_at: '2026-01-01T00:00:00Z' },
  ],
  student_class_assignments: [
    { id: 'sca-b1', student_id: STU2, class_id: C2B, textbook_id: TB1B, current_unit_id: U3, is_primary: true },
  ],
}
stub.__setDataset(loginDataset)
await libWarm.initWordLibrary() // _initCompletedAt 세팅(웜 진입점)
await libWarm.getStudentClassAssignments(STU2) // App.jsx 로그인 경로가 이미 하는 예열과 동일

check('로그인 직후 U3 단어 수 20(전제)', libWarm.getWordsByUnitId(U3).length === 20)
check('로그인 직후 primary 교재 TB1B(전제)', libWarm.getStudentPrimaryTextbook(STU2)?.id === TB1B)
check('로그인 직후 반설정 spellingDirection=mixed(전제)',
  libWarm.getClassSettings('C2B반(교재)').spellingDirection === 'mixed')

console.log('  — 그 사이 관리자가 단어/교재/반설정을 바꿈(서버 데이터만 변경) —')
loginDataset.words.push(wordRow('u3-w20', U3, 'u3w', 20), wordRow('u3-w21', U3, 'u3w', 21))
loginDataset.classes = loginDataset.classes.map((c) => (c.id === C2B ? { ...c, spelling_direction: 'kr2en' } : c))
const TB2B = 'tb-2b'
loginDataset.textbooks.push({ id: TB2B, name: 'C1B반(홈)', publisher_name: null, owner_class_id: C1B })
loginDataset.student_class_assignments = [
  { id: 'sca-b1', student_id: STU2, class_id: C2B, textbook_id: TB1B, current_unit_id: U3, is_primary: false },
  { id: 'sca-b2', student_id: STU2, class_id: C1B, textbook_id: TB2B, current_unit_id: null, is_primary: true },
]

check('재로그인 시뮬레이션 전 — 여전히 스테일(전제 확인)', libWarm.getWordsByUnitId(U3).length === 20)

const callsBeforeWarmLogin = callCount()
await libWarm.refreshAllForLogin(STU2)
perf.warmLoginCallDelta = callCount() - callsBeforeWarmLogin
await libWarm.getStudentClassAssignments(STU2) // App.jsx handleSelect가 refreshAllForLogin 다음에도 이미 이 호출을 한다(콜드스타트 수정 기존 라인) — 캐시 최종 반영 확인용
check('웜 재로그인은 4종 refresh를 전부 수행(콜드 refreshStudents 1건보다 호출 수가 많음)',
  perf.warmLoginCallDelta > 1, perf.warmLoginCallDelta)
check('재로그인 후 단어 최신(20→22)', libWarm.getWordsByUnitId(U3).length === 22)
check('재로그인 후 반설정 최신(kr2en)', libWarm.getClassSettings('C2B반(교재)').spellingDirection === 'kr2en')
check('재로그인 후 primary 교재 최신(TB2B)', libWarm.getStudentPrimaryTextbook(STU2)?.id === TB2B)

// ── 콜드 가드 — 방어적 분기(실사용 경로에서는 도달하지 않지만 안전해야 함) ──
console.log('\n  — 콜드 가드: initWordLibrary 미완료 상태에서 refreshAllForLogin은 기존 refreshStudents 단독 동작으로 폴백 —')
const libCold = await import(pathToFileURL(BUNDLE).href + '?cold=' + Date.now())
const STU3 = 'uuid-stu-3'
stub.__setDataset({
  ...loginDataset,
  students: [...loginDataset.students, { id: STU3, name: 'Coldy', class_id: C1B, unit_name: 'Unit 1', current_unit_id: null, house_id: null, created_at: '2026-01-01T00:00:01Z' }],
})
const callsBeforeCold = callCount()
await libCold.refreshAllForLogin(STU3) // initWordLibrary를 이 인스턴스에서 한 번도 안 불렀음 = 콜드
perf.coldLoginCallDelta = callCount() - callsBeforeCold
const coldCalls = stub.__getCalls().slice(callsBeforeCold)
check('콜드 가드 — 정확히 1건(students)만 조회(기존 handleSelect 동작과 동일)',
  perf.coldLoginCallDelta === 1 && coldCalls.every((c) => c.table === 'students'))
check('콜드 가드 — 4종 전체 refresh(classes/units/words/textbooks) 호출 없음',
  !coldCalls.some((c) => ['classes', 'units', 'words', 'textbooks', 'class_textbooks'].includes(c.table)))

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE F — 모듈 리셋 후 fresh init(콜드 로드) → 최신 데이터 ===')
// ════════════════════════════════════════════════════════════════════════
// 완전히 새 모듈 인스턴스가 initWordLibrary()만으로(추가 refresh 없이) 이
// 시점의 최신 stub 데이터(위에서 이미 여러 번 바뀐 상태)를 정확히 반영하는지
// — "모듈이 방금 부팅됐다면 애초에 stale할 수 없다"는 구조적 보장 확인.
const libFresh = await import(pathToFileURL(BUNDLE).href + '?fresh=' + Date.now())
await libFresh.initWordLibrary()
check('fresh 콜드 부팅도 이 시점 최신 U3 단어 수(22) 반영', libFresh.getWordsByUnitId(U3).length === 22)
check('fresh 콜드 부팅도 이 시점 최신 반설정(kr2en) 반영',
  libFresh.getClassSettings('C2B반(교재)').spellingDirection === 'kr2en')

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 회귀 없음 — 진행도/보상 테이블 무접촉 ===')
// ════════════════════════════════════════════════════════════════════════
{
  const touched = [...new Set(stub.__getCalls().map((c) => c.table))]
  check('student_progress/word_status/xp/star 계열 테이블 접근 0건(이 세 함수는 캐시/words/classes/textbooks/SCA만 읽음)',
    !touched.some((t) => /progress|word_status|xp|star/.test(t)), touched)
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n─── 성능 계수 실측치 ───')
console.log(JSON.stringify(perf, null, 2))

console.log(failures === 0
  ? '\n모든 단언 통과 — stale cache 갭 ①②③ 회귀 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
