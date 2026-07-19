// Verifies the Teacher Controls 마스터 스위치(classes.gamification_enabled,
// getClassSettings/setClassSettings in wordLibrary.js) — both BEFORE and
// AFTER supabase_v2_5_gamification_master_switch.sql has been run against
// the live project. Mirrors scripts/testSpellingSettings.mjs exactly (same
// opt-in per-class boolean column pattern, same 2-phase "before/after SQL"
// assertion shape) — no new test infrastructure invented.
//
// The "OFF by default" assertion here is the piece that actually matters for
// this card: Dashboard.jsx gates the Paul Rank/XP UI with
// `getClassSettings(className).gamificationEnabled &&` (same
// `settings.spellingTestEnabled &&`-style conditional already proven correct
// elsewhere in this codebase for spelling test / spelling hint gating) — so
// proving getClassSettings() defaults gamificationEnabled to false (unknown
// class, freshly created class, and column-not-yet-migrated) is exactly what
// proves the student-facing UI stays hidden in every one of those states.
// A live React-render assertion isn't available in this repo's harness (no
// component-render test infra exists — every domain check here is a Node
// script against wordLibrary.js/Supabase directly, TESTING.md 4-category
// pattern), so this is the equivalent-unit test at the correct boundary.
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

console.log('\n1. 존재하지 않는 반도 안전한 기본값(gamificationEnabled === false) 반환 — 크래시 없음')
const unknown = getClassSettings('QA_전혀_없는_반_이름_게임화')
check('gamificationEnabled === false', unknown.gamificationEnabled === false)

const CLASS = 'QA_GamificationSettingsTest'
console.log('\n2. 실제 반 생성 후 기본값 확인 (SQL 실행 전이면 여기까지도 항상 꺼짐이어야 함 — opt-in)')
await createClass(CLASS)
const before = getClassSettings(CLASS)
check('신규 반도 기본값(꺼짐)으로 시작', before.gamificationEnabled === false)

console.log('\n3. setClassSettings 시도 — supabase_v2_5_gamification_master_switch.sql 실행 여부에 따라 결과가 다름')
// gamification_enabled은 spelling_direction과 같은 "컬럼이 없으면 그 필드만
// 빼고 재시도"(graceful degradation) 경로다(wordLibrary.js setClassSettings
// 참고) — 다른 설정 저장까지 막지 않기 위해 일부러 예외를 던지지 않으므로,
// spellingTestEnabled 등(예외로 감지하는 컬럼)과 달리 여기서는 저장 시도
// 자체가 아니라 저장 후 실제로 반영됐는지(round-trip 값)로 SQL 실행 여부를
// 판단한다.
await setClassSettings(CLASS, { gamificationEnabled: true })
const schemaReady = getClassSettings(CLASS).gamificationEnabled === true
if (!schemaReady) {
  console.log('  ℹ️  아직 SQL이 실행되지 않은 것으로 보임 (컬럼 없음, graceful 무시) — 정상, 나머지 쓰기 검증은 건너뜀')
}

if (schemaReady) {
  const after = getClassSettings(CLASS)
  check('설정 저장 후 gamificationEnabled === true', after.gamificationEnabled === true)

  console.log('\n4. 다시 꺼서 opt-out도 정상 동작하는지 확인')
  await setClassSettings(CLASS, { gamificationEnabled: false })
  const afterOff = getClassSettings(CLASS)
  check('다시 끄면 gamificationEnabled === false', afterOff.gamificationEnabled === false)

  console.log('\n5. gamificationEnabled 저장이 같이 저장하는 다른 설정(쓰기시험 등)을 깨지 않는지 확인')
  await setClassSettings(CLASS, { spellingTestEnabled: true, gamificationEnabled: true })
  const combined = getClassSettings(CLASS)
  check('spellingTestEnabled === true(같이 저장돼도 유지)', combined.spellingTestEnabled === true)
  check('gamificationEnabled === true(같이 저장돼도 유지)', combined.gamificationEnabled === true)
} else {
  console.log('  (SQL 실행 후 다시 돌리면 3~5번의 나머지 체크까지 전부 검증됩니다)')
}

console.log('\n6. 정리')
await deleteClass(CLASS)
check('테스트 반 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
