// 2026-10-02 로그인 중복 fetch 제거(P2) 계약.
//  A) init 직후(60초 이내) refreshAllForLogin은 students 조회만 한다.
//  B) 마지막 전체 refresh가 60초를 넘으면 4종 전체 refresh를 한다(관리자 변경 반영 유지).
//  C) getStudentClassAssignments: 동시 호출 1쿼리 / 캐시 적중 0쿼리 / 무효화 후 1쿼리 /
//     reject 시 in-flight 해제되어 재시도.
// 실행: node scripts/buildWordLibOfflineBundle.mjs && node scripts/testLoginRefreshDedupe.mjs
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const BUNDLE = path.resolve(process.env.WORDLIB_OFFLINE_BUNDLE || 'scripts/.tmp/wordLibrary.offline.bundle.mjs')
const stub = await import(pathToFileURL(path.resolve('scripts/fakeSupabaseModule.mjs')).href)
const lib = await import(pathToFileURL(BUNDLE).href)

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}
const tables = () => stub.__getCalls().map((c) => c.table)
const count = (t) => tables().filter((x) => x === t).length

const STU = 'uuid-dedupe'
const dataset = {
  classes: [{ id: 'c1', name: 'C1', class_type: 'regular', created_at: '2026-01-01T00:00:00Z' }],
  units: [{ id: 'u1', class_id: 'c1', name: 'Unit 1', position: 0 }],
  words: [], daily_assignments: [], textbooks: [], class_textbooks: [],
  students: [{ id: STU, name: 'Dedupe', class_id: 'c1', unit_name: 'Unit 1', current_unit_id: 'u1', house_id: null, created_at: '2026-01-01T00:00:00Z' }],
  student_class_assignments: [{ id: 's1', student_id: STU, class_id: 'c1', textbook_id: null, current_unit_id: 'u1', is_primary: true }],
}
stub.__setDataset(dataset)
await lib.initWordLibrary()

console.log('=== A — init 직후 로그인은 students만 ===')
stub.__setDataset(dataset)
await lib.refreshAllForLogin(STU)
const heavy = ['classes', 'units', 'words', 'daily_assignments', 'textbooks', 'class_textbooks']
check('students 조회 있음', count('students') >= 1, tables())
check('classes/units/words/daily/textbooks/class_textbooks 조회 0', heavy.every((t) => count(t) === 0), tables())

console.log('\n=== B — 60초 경과 후엔 전체 refresh ===')
const realNow = Date.now
Date.now = () => realNow() + lib.LOGIN_FULL_REFRESH_MIN_AGE_MS + 1
try {
  stub.__setDataset(dataset)
  await lib.refreshAllForLogin(STU)
  check('classes/units/words 재조회', count('classes') >= 1 && count('units') >= 1 && count('words') >= 1, tables())
  stub.__setDataset(dataset)
  await lib.refreshAllForLogin(STU) // 전체 refresh가 타임스탬프를 갱신했으므로 같은 시각엔 다시 light
  check('전체 refresh 직후 재로그인은 다시 light', heavy.every((t) => count(t) === 0), tables())
} finally { Date.now = realNow }

console.log('\n=== C — getStudentClassAssignments dedupe ===')
const sca = () => count('student_class_assignments')
lib.invalidateStudentAssignmentsCache(STU)
stub.__setDataset(dataset)
const [a, b] = await Promise.all([lib.getStudentClassAssignments(STU), lib.getStudentClassAssignments(STU)])
check('동시 2회 호출 = 1쿼리', sca() === 1, sca())
check('두 호출이 같은 결과', a === b)
await lib.getStudentClassAssignments(STU)
check('기본 호출은 해결 후에도 재조회(관리자 화면 의미 유지)', sca() === 2, sca())
await lib.getStudentClassAssignments(STU, { cached: true })
check('{cached:true}는 캐시 적중 = 추가 쿼리 0', sca() === 2, sca())
lib.invalidateStudentAssignmentsCache(STU)
await lib.getStudentClassAssignments(STU, { cached: true })
check('무효화 후 {cached:true}는 캐시 미스 = 쿼리 1회 추가', sca() === 3, sca())
// 일시 오류 폴백은 캐시하지 않는다(fake supabase는 error 반환을 못 만들어 소스로 고정)
const libSrc = (await import('node:fs')).readFileSync(path.resolve('src/utils/wordLibrary.js'), 'utf8')
check('일시 오류 결과는 캐시 set 가드(transientError)', /if \(!transientError\) _studentAssignmentsCache\.set\(/.test(libSrc))

// invalidate는 in-flight도 비운다: 진행 중 호출 뒤 무효화하면 새 호출은 합류하지 않고 재조회
lib.invalidateStudentAssignmentsCache(STU)
stub.__setDataset(dataset)
const inflightOld = lib.getStudentClassAssignments(STU)
lib.invalidateStudentAssignmentsCache(STU)
const inflightNew = lib.getStudentClassAssignments(STU)
await Promise.all([inflightOld, inflightNew])
check('in-flight 중 무효화 → 새 호출은 별도 쿼리(2회)', sca() === 2, sca())

lib.invalidateStudentAssignmentsCache(STU)
stub.__setDataset({ get student_class_assignments() { throw new Error('boom') } })
let rejected = false
await lib.getStudentClassAssignments(STU).catch(() => { rejected = true })
check('reject 전파', rejected)
stub.__setDataset(dataset)
await lib.getStudentClassAssignments(STU)
check('reject 후 재시도는 새로 조회', sca() === 1, sca())

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
