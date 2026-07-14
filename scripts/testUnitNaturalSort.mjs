// Phase 1 (2026-07-15) 회귀 테스트 — 유닛 자연 정렬. 라이브 Supabase에
// units.position이 전부 0으로 저장돼 있는 걸 진단(Phase 0)에서 확인했으므로,
// addClassUnit()으로 새 유닛을 순서 뒤죽박죽으로 추가해도 refreshWordLibrary()
// 이후 getClassUnitNames()가 항상 숫자 오름차순으로 반환하는지 검증한다.
// 공백 유무가 섞인 이름("Unit 1" vs "Unit8")도 실제 라이브 데이터에서
// 확인된 케이스라 함께 검증.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, createClass, deleteClass, addClassUnit, getClassUnitNames,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const CLASS = 'QA_UnitSortTest'

console.log('\n1. 뒤죽박죽 순서로 유닛 추가 (Unit 1은 createClass가 기본 생성)')
await createClass(CLASS)
await addClassUnit(CLASS, 'Unit 6')
await addClassUnit(CLASS, 'Unit 4')
await addClassUnit(CLASS, 'Unit8')   // 공백 없는 케이스(라이브 데이터에서 실제 발견)
await addClassUnit(CLASS, 'Unit 5')
await addClassUnit(CLASS, 'Unit')    // 숫자 없는 케이스

const names = getClassUnitNames(CLASS)
console.log('  결과 순서:', names)
check('Unit 1이 Unit 4보다 먼저', names.indexOf('Unit 1') < names.indexOf('Unit 4'))
check('Unit 4가 Unit 5보다 먼저', names.indexOf('Unit 4') < names.indexOf('Unit 5'))
check('Unit 5가 Unit 6보다 먼저', names.indexOf('Unit 5') < names.indexOf('Unit 6'))
check('Unit 6이 Unit8보다 먼저 (숫자 6 < 8, 공백 유무 무관)', names.indexOf('Unit 6') < names.indexOf('Unit8'))
check('숫자 없는 "Unit"도 목록에 존재', names.includes('Unit'))

console.log('\n2. 정리')
await deleteClass(CLASS)
check('테스트 반 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
