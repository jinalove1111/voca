// 배정 캐시 무효화 후 "누가 다시 채우는가" — 2026-08-24 프로덕션 회귀
// (Jinaa 외 32명 단어 0개 사고) 재발 방지 계약.
//
// ── 사고 요약 ───────────────────────────────────────────────────────────
// 45a7232(stale cache 갭 ①)가 App.jsx의 visibility/focus 핸들러에서
// invalidateStudentAssignmentsCache(studentId)로 배정 캐시를 비우게 했는데,
// 같은 핸들러의 Promise.all에 들어있는 4개 refresh(refreshWordLibrary /
// refreshStudents / refreshClassSettings / refreshTextbooks) 중 어느 것도
// _studentAssignmentsCache를 다시 채우지 않는다(그 캐시를 채우는 코드는
// wordLibrary.js의 getStudentClassAssignments 단 한 곳뿐이다).
// 그래서 무효화 직후 setRefreshTick이 재렌더를 걸면, 캐시를 **동기로** 읽는
// getStudentPrimaryTextbook이 null을 돌려주고 getStudentWords의 교재 모드
// 분기가 통째로 스킵되어 학생이 홈(사람) 반에 머문다. 홈 반에 단어를 두지
// 않는 이 학원 구조에서는 곧바로 "교과서를 선택하세요 / 단어가 부족해요"다.
//
// 로그인 경로(App.jsx handleSelect)는 refreshAllForLogin 직후
// getStudentClassAssignments(sel.id)를 다시 await 하므로 안전하다 —
// visibility 경로에만 그 재조회가 빠져 있었다.
//
// ── 이 파일이 고정하는 계약 ─────────────────────────────────────────────
//  CASE A (행동, FAIL-first 게이트): App.jsx의 onVisible 블록에서 실제
//         Promise.all 인자 목록을 **소스에서 파싱해 그대로 실행**한 뒤
//         단어가 남아있는지 본다. 수정 전(4개 refresh)엔 0개로 FAIL,
//         수정 후(재조회 포함)엔 40개로 PASS. 테스트가 캐시를 대신 채워주지
//         않는 것이 핵심 — 기존 testStaleCacheRevalidation.mjs는 무효화
//         직후 자기가 getStudentClassAssignments를 호출해 프로덕션이 하지
//         않는 일을 대신 해줬고, 그래서 이 사고를 잡지 못했다.
//  CASE B (정적): 같은 Promise.all 안에 재조회가 실제로 들어있는지.
//  CASE C (회귀): 홈 반이 자기 교재를 소유한 학생(영향 없던 9명)은
//         무효화 후 재조회가 없어도 폴백으로 정상 — 수정 전후 불변.
//
// 네트워크 0 — scripts/fakeSupabaseModule.mjs 주입 오프라인 번들 사용.
// 실행: node scripts/buildWordLibOfflineBundle.mjs && node scripts/testAssignmentCacheRefill.mjs
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const BUNDLE = path.resolve(process.env.WORDLIB_OFFLINE_BUNDLE || 'scripts/.tmp/wordLibrary.offline.bundle.mjs')
const stub = await import(pathToFileURL(path.resolve('scripts/fakeSupabaseModule.mjs')).href)
const lib = await import(pathToFileURL(BUNDLE).href)

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

// ════════════════════════════════════════════════════════════════════════
// 픽스처 — 실제 Jinaa 구조를 그대로 옮긴다(read-only 실측 기준):
//   students.class_id      = MS Advanced Class (유닛 0 / 단어 0, 소유 교재 0)
//   SCA.primary.textbook_id= "고1 능률 민병천" 교재 (다른 반이 소유)
//   그 교재 소유 반의 Unit5에 단어 40개
// 대조군 STU_SAFE — 홈 반이 자기 교재를 소유(영향 없던 9명과 같은 모양).
// ════════════════════════════════════════════════════════════════════════
const STU = 'uuid-jinaa'
const HOME = 'cls-ms-advanced'   // 홈(사람) 반 — 유닛/단어/소유교재 전부 없음
const TBC = 'cls-minbyungchun'   // 교재 소유 반
const TB_MBC = 'tb-minbyungchun'
const UNIT5 = 'unit-5'
const JINAA_WORD_COUNT = 40      // 프로덕션 실측치

const STU_SAFE = 'uuid-safe'
const SAFE_C = 'cls-safe'        // 홈 반 == 교재 소유 반
const TB_SAFE = 'tb-safe'
const UNIT_S = 'unit-safe'
const SAFE_WORD_COUNT = 12

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

const dataset = {
  classes: [clsRow(HOME, 'MS Advanced Class', 0), clsRow(TBC, '고1 능률 민병천', 1), clsRow(SAFE_C, '중2 안전반', 2)],
  units: [
    // HOME 반에는 유닛이 하나도 없다 — 사고의 전제(단어 0개로 보이는 이유).
    { id: UNIT5, class_id: TBC, name: 'Unit5', position: 0 },
    { id: UNIT_S, class_id: SAFE_C, name: 'Unit 1', position: 0 },
  ],
  words: [
    ...Array.from({ length: JINAA_WORD_COUNT }, (_, i) => wordRow(`u5-w${i}`, UNIT5, 'u5w', i)),
    ...Array.from({ length: SAFE_WORD_COUNT }, (_, i) => wordRow(`us-w${i}`, UNIT_S, 'usw', i)),
  ],
  daily_assignments: [],
  textbooks: [
    { id: TB_MBC, name: '고1 능률 민병천', publisher_name: null, owner_class_id: TBC },
    { id: TB_SAFE, name: '중2 안전반', publisher_name: null, owner_class_id: SAFE_C },
  ],
  class_textbooks: [],
  students: [
    { id: STU, name: 'Jinaa', class_id: HOME, unit_name: 'Unit5', current_unit_id: UNIT5, house_id: null, created_at: '2026-01-01T00:00:00Z' },
    { id: STU_SAFE, name: 'Safe', class_id: SAFE_C, unit_name: 'Unit 1', current_unit_id: UNIT_S, house_id: null, created_at: '2026-01-01T00:00:01Z' },
  ],
  student_class_assignments: [
    { id: 'sca-jinaa', student_id: STU, class_id: TBC, textbook_id: TB_MBC, current_unit_id: UNIT5, is_primary: true },
    { id: 'sca-safe', student_id: STU_SAFE, class_id: SAFE_C, textbook_id: TB_SAFE, current_unit_id: UNIT_S, is_primary: true },
  ],
}

stub.__setDataset(dataset)
await lib.refreshWordLibrary()
await lib.refreshTextbooks()
await lib.refreshStudents()
await lib.refreshClassSettings()

const wordCount = (id) => lib.getStudentWords(id).length

// ════════════════════════════════════════════════════════════════════════
// App.jsx의 onVisible 블록을 소스에서 읽어 "실제로 무엇을 호출하는지" 추출
// ════════════════════════════════════════════════════════════════════════
const appSrc = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
const blockMatch = appSrc.match(/const onVisible = \(\) => \{[\s\S]*?\n {4}\}/)
if (!blockMatch) {
  console.log('  FAIL  App.jsx에서 onVisible 블록을 찾지 못함 — 테스트 전제 붕괴')
  process.exit(1)
}
// 주석 제거 — CRLF 체크아웃에서 JS의 `.`이 \r에 매칭되지 않아 주석이 안
// 지워지고 산문이 코드로 오인되는 실사고가 있었다(2026-08-19). 줄 끝 \r를
// 먼저 떼고 나서 //-주석을 지운다.
const blockCode = blockMatch[0]
  .split('\n')
  .map((l) => l.replace(/\r$/, '').replace(/\/\/.*$/, ''))
  .join('\n')

const invalidatesCache = /invalidateStudentAssignmentsCache\s*\(\s*studentId\s*\)/.test(blockCode)
const promiseAll = blockCode.match(/Promise\.all\(\s*\[([\s\S]*?)\]\s*\)/)
if (!promiseAll) {
  console.log('  FAIL  onVisible 블록에서 Promise.all 목록을 찾지 못함 — 테스트 전제 붕괴')
  process.exit(1)
}
const refreshCalls = promiseAll[1]
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((expr) => {
    const m = expr.match(/^([A-Za-z_$][\w$]*)\s*\(([^)]*)\)$/)
    return m ? { name: m[1], arg: m[2].trim() } : { name: expr, arg: '' }
  })

console.log('=== onVisible 소스 파싱 결과 ===')
console.log(`  캐시 무효화 호출: ${invalidatesCache ? 'YES' : 'NO'}`)
console.log(`  Promise.all 항목(${refreshCalls.length}): ${refreshCalls.map((c) => c.name).join(', ')}`)

// 파싱한 호출 목록을 그대로 실행 — 프로덕션이 하는 일만 하고, 그 이상은
// 절대 하지 않는다(테스트가 캐시를 대신 채워주면 이 사고를 못 잡는다).
async function runOnVisible(studentId) {
  if (invalidatesCache) lib.invalidateStudentAssignmentsCache(studentId)
  await Promise.all(refreshCalls.map(({ name, arg }) => {
    const fn = lib[name]
    if (typeof fn !== 'function') {
      throw new Error(`onVisible이 호출하는 ${name}이 wordLibrary export에 없음 — 테스트 매핑 갱신 필요`)
    }
    return fn(arg.includes('studentId') ? studentId : undefined)
  }))
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE A — onVisible 후에도 단어가 남아있는가 (FAIL-first 게이트) ===')
// ════════════════════════════════════════════════════════════════════════
// 로그인 경로가 하는 프라이밍(handleSelect의 getStudentClassAssignments await)
await lib.getStudentClassAssignments(STU)
check(`프라이밍 후 primary 교재 = 고1 능률 민병천`, lib.getStudentPrimaryTextbook(STU)?.id === TB_MBC,
  { got: lib.getStudentPrimaryTextbook(STU)?.id })
check(`프라이밍 후 단어 ${JINAA_WORD_COUNT}개 (DB 실측치와 동일)`, wordCount(STU) === JINAA_WORD_COUNT,
  { got: wordCount(STU) })

console.log('  — 학생이 탭을 전환했다 돌아온다(visibilitychange/focus) —')
await runOnVisible(STU)

// ★ 이 두 단언이 수정 전 FAIL / 수정 후 PASS 하는 회귀 게이트다.
check(`onVisible 후에도 primary 교재 유지(교재 선택기가 비지 않음)`,
  lib.getStudentPrimaryTextbook(STU)?.id === TB_MBC,
  { got: lib.getStudentPrimaryTextbook(STU)?.id ?? null })
check(`onVisible 후에도 단어 ${JINAA_WORD_COUNT}개 유지`,
  wordCount(STU) === JINAA_WORD_COUNT,
  { got: wordCount(STU) })

// 연속 발생(수업 중 여러 번 탭 전환)에도 계속 살아있어야 한다.
await runOnVisible(STU)
await runOnVisible(STU)
check(`onVisible 3회 연속 후에도 단어 ${JINAA_WORD_COUNT}개 유지`,
  wordCount(STU) === JINAA_WORD_COUNT,
  { got: wordCount(STU) })

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE B — 정적 계약: 무효화한 캐시를 같은 블록에서 다시 채우는가 ===')
// ════════════════════════════════════════════════════════════════════════
const refillsInSameBlock = refreshCalls.some((c) => c.name === 'getStudentClassAssignments')
check('onVisible이 배정 캐시를 무효화한다(갭 ① 의도 보존)', invalidatesCache)
check('무효화한 캐시를 같은 Promise.all에서 재조회한다(setRefreshTick 이전)',
  !invalidatesCache || refillsInSameBlock,
  { promiseAll: refreshCalls.map((c) => c.name) })

// _studentAssignmentsCache를 채우는 함수가 정말 그것뿐인지 소스로 확인 —
// 나중에 누가 다른 refresh에 캐시 채우기를 넣으면 이 단언이 알려준다.
const libSrc = fs.readFileSync(path.resolve('src/utils/wordLibrary.js'), 'utf8')
const setSites = (libSrc.match(/_studentAssignmentsCache\.set\(/g) || []).length
check('_studentAssignmentsCache를 채우는 지점은 1곳(getStudentClassAssignments)뿐',
  setSites === 1, { setSites })

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE C — 회귀: 영향 없던 학생(홈 반 == 교재 소유 반)은 불변 ===')
// ════════════════════════════════════════════════════════════════════════
await lib.getStudentClassAssignments(STU_SAFE)
check(`대조군 프라이밍 후 단어 ${SAFE_WORD_COUNT}개`, wordCount(STU_SAFE) === SAFE_WORD_COUNT,
  { got: wordCount(STU_SAFE) })
await runOnVisible(STU_SAFE)
check(`대조군은 onVisible 후에도 단어 ${SAFE_WORD_COUNT}개 (폴백으로 원래 안전)`,
  wordCount(STU_SAFE) === SAFE_WORD_COUNT, { got: wordCount(STU_SAFE) })
check('대조군 primary 교재도 유지', lib.getStudentPrimaryTextbook(STU_SAFE)?.id === TB_SAFE,
  { got: lib.getStudentPrimaryTextbook(STU_SAFE)?.id ?? null })

// 다른 학생의 onVisible이 이 학생 캐시를 건드리지 않는지(무효화 범위 확인)
await lib.getStudentClassAssignments(STU)
await runOnVisible(STU_SAFE)
check('타 학생 onVisible은 Jinaa 캐시에 영향 없음(학생 단위 무효화)',
  wordCount(STU) === JINAA_WORD_COUNT, { got: wordCount(STU) })

// ════════════════════════════════════════════════════════════════════════
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
