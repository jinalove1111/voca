// words 1000행 절단 + 유닛 임의 폴백 회귀 테스트 (2026-08-12, P0)
//
// 재현하는 실사고:
//   ① words 테이블이 1093행이 된 시점부터 앱이 range 없이 조회해 1000행만
//      받고 93개 단어를 **에러 없이** 버렸다(24개 유닛의 뒤쪽 단어들,
//      position 38~49). 40단어 유닛이 38단어로 보였고 입실시험 출제 풀도
//      38개로 줄어, 학생이 실제로 공부한 단어가 시험에 나오지 않았다
//      (실측 누락: "mistake A for B"/"stand for"/"thanks to"/
//      "around the world" — meaning은 전부 정상이라 결측 필터가 아니라
//      순수 절단).
//   ② getClassWords가 `units.find(name) || units[0]`이라, 유닛 이름이 안
//      맞으면 조용히 **그 반의 첫 유닛** 단어를 돌려줬다. 라벨은 요청한
//      이름을 그대로 찍어 화면이 거짓말을 했다.
//
// 네트워크 0 — scripts/fakeSupabaseModule.mjs가 PostgREST의 1000행 상한을
// 실제로 강제하므로, 페이지네이션이 없으면 이 테스트는 반드시 FAIL한다
// (규칙 15의 "테스트 자체의 유효성"은 아래 시나리오 0에서 직접 단언한다).
//
// 실행: node scripts/buildWordLibOfflineBundle.mjs && node scripts/testWordLibraryPagination.mjs
import { pathToFileURL } from 'node:url'
import path from 'node:path'

// 기본 경로는 buildWordLibOfflineBundle.mjs의 출력. WORDLIB_OFFLINE_BUNDLE로
// 덮어쓸 수 있다 — 규칙 15("수정 전 코드로 실제 FAIL하는지 먼저 확인")를
// 위해 수정 전 소스로 만든 번들을 같은 테스트에 물려보기 위한 통로다.
const BUNDLE = path.resolve(process.env.WORDLIB_OFFLINE_BUNDLE || 'scripts/.tmp/wordLibrary.offline.bundle.mjs')
const stub = await import(pathToFileURL(path.resolve('scripts/fakeSupabaseModule.mjs')).href)
const lib = await import(pathToFileURL(BUNDLE).href)

let failures = 0
const scenarioFailures = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
let current = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++; scenarioFailures[current]++ }
}

// ── 픽스처 — 프로덕션 구조를 그대로 본뜬다 ────────────────────────────
// (반 이름/유닛 이름/빈 유닛/1단어 "Unit" 쓰레기 유닛까지 실측 그대로)
const classes = []
const units = []
const words = []
let uSeq = 0
let wSeq = 0

const addClass = (id, name, classType = 'textbook') => {
  classes.push({ id, name, class_type: classType, created_at: `2026-01-01T00:00:${String(classes.length).padStart(2, '0')}Z` })
}
// position은 프로덕션 실측과 동일하게 전부 0으로 둔다 — 정렬 tie를 일부러
// 만들어, position에만 의존하는 정렬이 페이지 경계에서 깨지는지 본다.
const addUnit = (classId, name, wordCount, prefix) => {
  const id = `unit-${String(++uSeq).padStart(4, '0')}`
  units.push({ id, class_id: classId, name, position: 0 })
  for (let i = 0; i < wordCount; i++) {
    words.push({
      id: `word-${String(++wSeq).padStart(5, '0')}`,
      unit_id: id,
      word: `${prefix}_${i}`,
      meaning: `${prefix}의 뜻 ${i}`,
      position: i, // 유닛 안에서만 유일 -> 테이블 전체로는 대량 tie
      word_audio_url: null, example_audio_url: null,
      example_text: null, example_translation: null, memory_tip: null,
      accepted_meanings: null,
    })
  }
  return id
}

addClass('cls-ymb', '중2 YMB 박준원')
addClass('cls-kim', '중2 능률 김기택')
addClass('cls-hak', '고1 6월 학평')
addClass('cls-pre', 'Pre-Middle School', 'regular') // 유닛 0개(실측 그대로)

// 같은 이름 "Unit 1"이 3개 교재에 존재 — 그중 둘은 빈 유닛(실측 그대로)
const U_YMB_UNIT1 = addUnit('cls-ymb', 'Unit 1', 0, 'ymb1')
const U_KIM_UNIT1 = addUnit('cls-kim', 'Unit 1', 0, 'kim1')
const U_HAK_UNIT1 = addUnit('cls-hak', 'Unit 1', 40, 'hak_u1')
// 같은 이름 "Unit3"이 두 교재에 **둘 다 단어를 갖고** 존재 — 혼입 검증용
const U_YMB_UNIT3 = addUnit('cls-ymb', 'Unit3', 40, 'ymb_u3')
const U_HAK_UNIT3 = addUnit('cls-hak', 'Unit3', 40, 'hak_u3')
// Luke / Song 이 실제로 배정된 유닛
const U_YMB_UNIT5 = addUnit('cls-ymb', 'Unit 5', 40, 'ymb_u5') // Luke
const U_YMB_UNIT4 = addUnit('cls-ymb', 'Unit4', 40, 'ymb_u4')
const U_KIM_UNIT6 = addUnit('cls-kim', 'Unit 6', 40, 'kim_u6') // Song
// 1단어짜리 쓰레기 유닛(실측: 5개 교재에 "Unit" 이름으로 존재)
addUnit('cls-ymb', 'Unit', 1, 'ymb_junk')
addUnit('cls-kim', 'Unit', 1, 'kim_junk')

// 절단이 실제로 일어나도록 전체 단어 수를 1000행 위로 올린다.
for (let i = 0; i < 25; i++) addClass(`cls-fill-${i}`, `채움반 ${i}`)
for (let i = 0; i < 25; i++) addUnit(`cls-fill-${i}`, 'Unit1', 40, `fill${i}`)

const DATASET = { classes, units, words, daily_assignments: [] }
const TOTAL_WORDS = words.length

console.log(`픽스처: 반 ${classes.length}개 / 유닛 ${units.length}개 / 단어 ${TOTAL_WORDS}개 (1000행 상한 초과 필수)`)

// ── 시나리오 0 — 테스트 자체의 유효성(규칙 15) ────────────────────────
current = 0
console.log('\n시나리오 ⓪ — 스텁이 PostgREST 1000행 상한을 실제로 강제하는가')
{
  stub.__setDataset(DATASET)
  check('픽스처 단어 수가 1000을 넘음(안 넘으면 이 테스트는 아무것도 증명 못함)', TOTAL_WORDS > 1000)
  const bare = await stub.supabase.from('words').select('id').order('position')
  check(`range 없는 조회는 정확히 ${stub.MAX_ROWS}행만 반환(절단 재현)`, bare.data.length === stub.MAX_ROWS)
  check('즉 절단은 error 없이 조용히 일어난다', bare.error === null)
}

// ── 시나리오 1 — 1000행 초과해도 뒤쪽 단어 누락 없음 ──────────────────
current = 1
console.log('\n시나리오 ① — words가 1000행을 넘어도 뒤쪽 단어가 누락되지 않는다')
stub.__setDataset(DATASET)
await lib.refreshWordLibrary()
{
  let loaded = 0
  for (const c of classes) loaded += (lib.getClassUnits(c.name) || []).reduce((n, u) => n + (u.words?.length || 0), 0)
  // 유닛 0개인 반은 합성 폴백([{name:'Unit 1', words:[]}])이라 0을 더한다.
  check(`캐시에 적재된 단어 총수 === DB 전체 ${TOTAL_WORDS}개 (절단 0)`, loaded === TOTAL_WORDS)

  const kim6 = lib.getWordsByUnitId(U_KIM_UNIT6)
  check('Song 유닛(김기택 "Unit 6") 40개 전부 적재', kim6.length === 40)
  check('그 유닛의 마지막 단어(position 39)가 살아있음 — 절단 시 가장 먼저 사라지던 자리',
    kim6.some((w) => w.word === 'kim_u6_39'))
  check('position 38 단어도 살아있음', kim6.some((w) => w.word === 'kim_u6_38'))

  const ymb5 = lib.getWordsByUnitId(U_YMB_UNIT5)
  check('Luke 유닛(YMB "Unit 5") 40개 전부 적재', ymb5.length === 40)
  check('그 유닛의 position 38/39 단어 둘 다 살아있음',
    ymb5.some((w) => w.word === 'ymb_u5_38') && ymb5.some((w) => w.word === 'ymb_u5_39'))

  // 모든 유닛에 대해 tail 누락이 하나도 없어야 한다(24개 유닛이 당했던 회귀)
  const tailMissing = units.filter((u) => {
    const expected = words.filter((w) => w.unit_id === u.id).length
    return (lib.getWordsByUnitId(u.id) || []).length !== expected
  })
  check(`전체 ${units.length}개 유닛 중 단어 수가 DB와 다른 유닛 0개`, tailMissing.length === 0)

  const calls = stub.__getCalls()
  const wordCalls = calls.filter((c) => c.table === 'words')
  check('words 조회가 여러 페이지로 나뉘어 실행됨(페이지네이션 실재)', wordCalls.length > 1)
  check('words 조회 정렬 키에 id가 포함됨(tie 브레이커 — 페이지 경계 안정성)',
    wordCalls.every((c) => c.orders.includes('id')))
  check('units 조회 정렬 키에도 id가 포함됨',
    calls.filter((c) => c.table === 'units').every((c) => c.orders.includes('id')))
}

// ── 시나리오 2 — 같은 이름 유닛이 여러 교재에 있어도 안 섞인다 ────────
current = 2
console.log('\n시나리오 ② — 서로 다른 교재의 동명 유닛("Unit 1"/"Unit3") 단어가 섞이지 않는다')
{
  const ymb3 = lib.getWordsByUnitId(U_YMB_UNIT3).map((w) => w.word)
  const hak3 = lib.getWordsByUnitId(U_HAK_UNIT3).map((w) => w.word)
  check('YMB "Unit3" 40개 / 학평 "Unit3" 40개', ymb3.length === 40 && hak3.length === 40)
  check('두 교재 "Unit3" 단어가 단 하나도 겹치지 않음', ymb3.every((w) => !hak3.includes(w)))
  check('YMB "Unit3" 조회 결과는 전부 ymb_u3 접두사(다른 교재 단어 0개)',
    ymb3.every((w) => w.startsWith('ymb_u3_')))

  check('이름 기준 조회도 자기 교재 것만 — getClassWords("중2 YMB 박준원","Unit3")',
    lib.getClassWords('중2 YMB 박준원', 'Unit3').every((w) => w.word.startsWith('ymb_u3_')))
  check('이름 기준 조회도 자기 교재 것만 — getClassWords("고1 6월 학평","Unit3")',
    lib.getClassWords('고1 6월 학평', 'Unit3').every((w) => w.word.startsWith('hak_u3_')))

  // 핵심 회귀: 비어있는 "Unit 1"을 요청하면 **빈 목록**이어야 한다.
  // 예전 코드는 units[0]로 폴백해 엉뚱한 유닛 40개를 돌려줬다.
  check('빈 유닛 요청 시 빈 목록 — YMB "Unit 1"(0단어)이 다른 유닛으로 대체되지 않음',
    lib.getClassWords('중2 YMB 박준원', 'Unit 1').length === 0)
  check('빈 유닛 요청 시 빈 목록 — 김기택 "Unit 1"(0단어)',
    lib.getClassWords('중2 능률 김기택', 'Unit 1').length === 0)
  check('같은 이름 "Unit 1"이 단어를 가진 교재(학평)에서는 정상 40개',
    lib.getClassWords('고1 6월 학평', 'Unit 1').length === 40)
  check('학평 "Unit 1" 조회가 다른 교재 "Unit 1"에 오염되지 않음',
    lib.getClassWords('고1 6월 학평', 'Unit 1').every((w) => w.word.startsWith('hak_u1_')))

  // 존재하지 않는 유닛 이름 -> 임의 유닛으로 폴백 금지
  check('존재하지 않는 유닛 이름 요청 시 빈 목록(임의 units[0] 폴백 제거됨)',
    lib.getClassWords('중2 YMB 박준원', 'Unit 99').length === 0)
  check('resolveClassUnit도 못 찾으면 null(조용한 대체 없음)',
    lib.resolveClassUnit('중2 YMB 박준원', 'Unit 99') === null)
  check('getUnitById는 다른 교재 유닛 id로도 정확히 그 유닛만 반환',
    lib.getUnitById(U_HAK_UNIT1)?.classId === 'cls-hak' && lib.getUnitById(U_YMB_UNIT1)?.classId === 'cls-ymb')
}

// ── 시나리오 3 — Song이 선택한 교재/Unit 단어만 받는다 ────────────────
current = 3
console.log('\n시나리오 ③ — Song(김기택 "Unit 6" 배정)이 자기 교재/유닛 단어만 받는다')
{
  // 실측: Song의 SCA.current_unit_id = 김기택 "Unit 6"(a437b6c9…)
  const songWords = lib.getWordsByUnitId(U_KIM_UNIT6)
  check('40개 전부(38개로 줄지 않음 — 절단 회귀 고정)', songWords.length === 40)
  check('전부 김기택 "Unit 6" 단어', songWords.every((w) => w.word.startsWith('kim_u6_')))
  check('YMB 교재 단어가 단 하나도 섞이지 않음', songWords.every((w) => !w.word.startsWith('ymb_')))
  check('모든 단어의 unitId가 배정된 유닛 id와 동일(교재+유닛 canonical 키)',
    songWords.every((w) => w.unitId === U_KIM_UNIT6))
  check('모든 단어의 classId가 김기택', songWords.every((w) => w.classId === 'cls-kim'))
  check('이름 경로(getClassWords)와 id 경로(getWordsByUnitId) 결과가 동일',
    JSON.stringify(lib.getClassWords('중2 능률 김기택', 'Unit 6').map((w) => w.id)) ===
    JSON.stringify(songWords.map((w) => w.id)))
}

// ── 시나리오 4 — Luke도 동일하게 정상 조회 ────────────────────────────
current = 4
console.log('\n시나리오 ④ — Luke(YMB "Unit 5" 배정)도 동일하게 정상 조회된다')
{
  const lukeWords = lib.getWordsByUnitId(U_YMB_UNIT5)
  check('40개 전부', lukeWords.length === 40)
  check('전부 YMB "Unit 5" 단어', lukeWords.every((w) => w.word.startsWith('ymb_u5_')))
  check('같은 교재의 다른 유닛(Unit4) 단어가 섞이지 않음', lukeWords.every((w) => !w.word.startsWith('ymb_u4_')))
  check('김기택 교재 단어가 섞이지 않음', lukeWords.every((w) => !w.word.startsWith('kim_')))
  check('Song과 Luke의 단어 집합이 완전히 분리됨',
    lukeWords.every((w) => !lib.getWordsByUnitId(U_KIM_UNIT6).some((s) => s.id === w.id)))
  check('표기 흔들림 흡수 — "Unit5"로 요청해도 "Unit 5"로 해석',
    lib.resolveClassUnit('중2 YMB 박준원', 'Unit5')?.id === U_YMB_UNIT5)
}

// ── 시나리오 5 — 기존 학생 학습/입실시험에 영향 없음 ──────────────────
current = 5
console.log('\n시나리오 ⑤ — 기존 정상 경로가 그대로 동작한다(회귀 없음)')
{
  check('getClassUnitNames가 기존대로 유닛 이름 목록 반환',
    lib.getClassUnitNames('중2 YMB 박준원').includes('Unit4') && lib.getClassUnitNames('중2 YMB 박준원').includes('Unit 5'))
  check('정확히 일치하는 이름 조회는 기존과 동일하게 40개',
    lib.getClassWords('중2 YMB 박준원', 'Unit4').length === 40)
  check('유닛 0개인 반은 기존 합성 폴백 유지(getClassUnits가 빈 배열이 아님)',
    lib.getClassUnits('Pre-Middle School').length === 1 && lib.getClassUnits('Pre-Middle School')[0].name === 'Unit 1')
  check('유닛 0개인 반의 단어 조회는 빈 목록(기존 동작과 동일 — 크래시 없음)',
    lib.getClassWords('Pre-Middle School').length === 0)
  check('존재하지 않는 반 이름도 크래시 없이 빈 목록',
    lib.getClassWords('없는 반 이름', 'Unit 1').length === 0)
  check('1단어 쓰레기 유닛("Unit")도 정확히 1개만 반환(있는 그대로)',
    lib.getClassWords('중2 YMB 박준원', 'Unit').length === 1)
  check('기본 인자 호출(getClassWords(cls))이 "Unit 1"을 찾음 — 학평은 40개',
    lib.getClassWords('고1 6월 학평').length === 40)
  check('채움반 25개도 전부 40단어 정상(대량 데이터에서 회귀 없음)',
    Array.from({ length: 25 }, (_, i) => lib.getClassWords(`채움반 ${i}`, 'Unit1').length).every((n) => n === 40))
  check('단어 객체 모양 불변(id/word/meaning/unitId/classId 유지)', (() => {
    const w = lib.getClassWords('중2 YMB 박준원', 'Unit4')[0]
    return w && w.id && w.word && w.meaning && w.unitId && w.classId
  })())
}

// ── 재조회 안정성 ─────────────────────────────────────────────────────
current = 1
console.log('\n추가 — 재조회 시에도 결과가 동일(정렬 tie 흔들기에도 안정)')
{
  await lib.refreshWordLibrary()
  const again = lib.getWordsByUnitId(U_KIM_UNIT6).map((w) => w.id).sort()
  check('두 번째 refresh 후에도 Song 유닛 40개 동일', again.length === 40)
  const all = units.every((u) => (lib.getWordsByUnitId(u.id) || []).length === words.filter((w) => w.unit_id === u.id).length)
  check('두 번째 refresh 후에도 전 유닛 단어 수가 DB와 일치', all)
}

console.log('\n─── 결과 요약 ───')
for (const n of [0, 1, 2, 3, 4, 5]) console.log(`시나리오 ${n} 실패 수: ${scenarioFailures[n]} (0이어야 정상)`)
console.log(failures === 0
  ? '\n모든 단언 통과 — 1000행 절단/임의 유닛 폴백 회귀 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
