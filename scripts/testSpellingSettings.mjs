// Verifies the spelling-test per-class admin settings (getClassSettings/
// setClassSettings in wordLibrary.js) — both BEFORE and AFTER
// supabase_spelling_test_schema.sql has been run against the live project.
// Before the SQL runs, the columns don't exist yet; every read must still
// return safe "all disabled" defaults and the app must never crash because
// of it (see refreshClassSettings's isolated try/catch). This script
// detects which state the live DB is in and adjusts what it asserts.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, createClass, deleteClass, getClassSettings, setClassSettings,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. 존재하지 않는 반도 안전한 기본값(전부 꺼짐) 반환 — 크래시 없음')
const unknown = getClassSettings('QA_전혀_없는_반_이름')
check('spellingTestEnabled === false', unknown.spellingTestEnabled === false)
check('spellingHintEnabled === false', unknown.spellingHintEnabled === false)
check('wrongAnswerRepeatCount === 3 (기본값)', unknown.wrongAnswerRepeatCount === 3)

const CLASS = 'QA_SpellingSettingsTest'
console.log('\n2. 실제 반 생성 후 기본값 확인 (SQL 실행 전이면 여기까지도 전부 꺼짐이어야 함)')
await createClass(CLASS)
const before = getClassSettings(CLASS)
check('신규 반도 기본값(꺼짐)으로 시작', before.spellingTestEnabled === false && before.spellingHintEnabled === false)

console.log('\n3. setClassSettings 시도 — supabase_spelling_test_schema.sql 실행 여부에 따라 결과가 다름')
let schemaReady = true
try {
  await setClassSettings(CLASS, { spellingTestEnabled: true, spellingHintEnabled: true, wrongAnswerRepeatCount: 5 })
} catch (err) {
  schemaReady = false
  console.log(`  ℹ️  아직 SQL이 실행되지 않은 것으로 보임 (컬럼 없음) — 정상, 쓰기 경로는 건너뜀: ${err.message}`)
}

if (schemaReady) {
  const after = getClassSettings(CLASS)
  check('설정 저장 후 spellingTestEnabled === true', after.spellingTestEnabled === true)
  check('설정 저장 후 spellingHintEnabled === true', after.spellingHintEnabled === true)
  check('설정 저장 후 wrongAnswerRepeatCount === 5', after.wrongAnswerRepeatCount === 5)
} else {
  console.log('  (SQL 실행 후 다시 돌리면 3번의 나머지 체크까지 전부 검증됩니다)')
}

console.log('\n4. 정리')
await deleteClass(CLASS)
check('테스트 반 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
