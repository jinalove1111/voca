// v2.1 — 유닛별 "이어서 학습" 위치(resumeIndexForUnit)와 normalizeRecord의
// lastWordIndexByUnit 하위호환 검증 (pure — 네트워크/브라우저 불필요).
// 실행:
//   node scripts/buildProgressBundle.mjs
//   PROGRESS_BUNDLE=scripts/.tmp/useStudent.progress.bundle.mjs node scripts/testUnitResumeIndex.mjs
class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}
globalThis.localStorage = new FakeStorage()

const BUNDLE = process.env.PROGRESS_BUNDLE
if (!BUNDLE) throw new Error('Set PROGRESS_BUNDLE to the esbuild output path')
const { pathToFileURL } = await import('node:url')
const { freshRecord, normalizeRecord, resumeIndexForUnit, isEmptyRecord } = await import(pathToFileURL(BUNDLE).href)

let failures = 0
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

const U1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const U2 = 'aaaaaaaa-0000-0000-0000-000000000002'

console.log('\n1. freshRecord 스키마 — lastWordIndexByUnit 기본 포함')
const rec = freshRecord('stu-1')
check('lastWordIndexByUnit이 빈 객체', JSON.stringify(rec.lastWordIndexByUnit) === '{}')

console.log('\n2. 구버전 레코드(필드 없음) normalizeRecord — 크래시 없이 채움 (P0 forEach 크래시 계열 방어)')
const legacy = { studentId: 'stu-1', totalStars: 7, lastWordIndex: 13, cleared: ['apple'] }
const norm = normalizeRecord(legacy, 'stu-1')
check('lastWordIndexByUnit 빈 객체로 보강', JSON.stringify(norm.lastWordIndexByUnit) === '{}')
check('기존 필드 보존(totalStars/lastWordIndex/cleared)', norm.totalStars === 7 && norm.lastWordIndex === 13 && norm.cleared[0] === 'apple')

console.log('\n3. resumeIndexForUnit — 구버전 데이터 폴백(유닛별 기록 전무 → 전역 lastWordIndex)')
check('unitId 있어도 map 비면 전역값', resumeIndexForUnit(norm, U1) === 13)
check('unitId 없으면 전역값', resumeIndexForUnit(norm, null) === 13)

console.log('\n4. 유닛별 기록이 있는 v2.1 데이터')
const rec2 = { ...norm, lastWordIndex: 13, lastWordIndexByUnit: { [U1]: 4 } }
check('기록 있는 유닛은 그 지점', resumeIndexForUnit(rec2, U1) === 4)
check('처음 가보는 유닛은 0부터(스테일 전역값 미사용)', resumeIndexForUnit(rec2, U2) === 0)
check('unitId 미상이면 전역 폴백', resumeIndexForUnit(rec2, null) === 13)

console.log('\n5. 방어 — 오염된 값에도 숫자 보장')
check('문자 index → 0', resumeIndexForUnit({ lastWordIndexByUnit: { [U1]: 'x' } }, U1) === 0)
check('record null → 0', resumeIndexForUnit(null, U1) === 0)
check('map이 배열(오염) → 전역값 폴백', resumeIndexForUnit({ lastWordIndexByUnit: [1, 2], lastWordIndex: 3 }, U1) === 3)

console.log('\n6. 유닛 전환은 진행도 판정과 무관 — lastWordIndexByUnit만 있는 레코드는 여전히 "빈 기록"')
// isEmptyRecord(클라우드 복원 트리거)가 resume 위치 때문에 복원을 건너뛰면
// 안 됨 — resume 위치는 진행도가 아니다.
const onlyResume = { ...freshRecord('stu-2'), lastWordIndexByUnit: { [U1]: 3 }, lastWordIndex: 3 }
check('resume 위치만 있는 레코드는 isEmptyRecord true(복원 시도 유지)', isEmptyRecord(onlyResume) === true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
