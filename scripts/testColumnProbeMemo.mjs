// refreshStudents()/refreshClassSettings() 컬럼 probe 메모 회귀 테스트
// (2026-09-09, 야간 QA 후속) — 실제 프로덕션엔 supabase_v2_7_house_system.sql
// (students.house_id)과 supabase_v2_5_gamification_master_switch.sql
// (classes.gamification_enabled)이 아직 실행되지 않았다. 규칙 9(마이그레이션
// 전/후 모두 앱이 깨지면 안 됨)를 지키려고 두 함수 모두 "넓은 select 먼저
// 시도 → 42703(컬럼 부재)면 좁은 select로 폴백"하는 캐스케이드를 쓰는데,
// 이 폴백이 "매 호출마다" 처음부터 다시 넓은 select를 시도해서 로그인/포커스
// 복귀/관리자 쓰기 후 등 호출될 때마다 같은 400을 DevTools에 반복 출력했다
// (기능은 정상 — 폴백이 결국 성공해 데이터는 항상 채워짐, 순수 노이즈 문제).
//
// 수정 후 계약: 페이지 로드(모듈 로드) 동안 "이 tier는 42703났다"를 한 번
// 기억하면, 그 tier는 다시 시도하지 않고 곧장 다음 tier부터 요청한다.
// 새로고침하면 모듈이 다시 로드되어 리셋되므로(강제 규칙 9), 나중에
// 마이그레이션이 실행되면 다음 새로고침에서 다시 넓은 select부터 정상
// 재개된다. 42703이 아닌 에러(네트워크 타임아웃 등 일시적 문제)는 메모를
// 갱신하지 않는다 — 오늘과 동일하게 그 호출 안에서는 계속 캐스케이드하되
// (students: 무조건 캐스케이드, classes: PR #25로 이미 42703만 캐스케이드하는
// 게이팅이 있음 — 그 게이팅 자체는 이 작업 범위 밖이라 그대로 유지) 다음
// 호출에서는 다시 원래 tier부터 재시도한다(일시적 문제였을 수 있으므로).
//
// 검증 방법: scripts/fakeSupabaseModule.mjs + buildWordLibOfflineBundle.mjs
// 오프라인 번들(네트워크 0). 스텁은 스스로 에러를 못 만드므로(헤더 참고)
// 이 파일 안에서만 `stub.supabase.from`을 테이블별로 감싸 에러를 스크립트
// 한다(testClassSettingsResilience.mjs와 동일 관례 — fakeSupabaseModule.mjs
// 자체는 건드리지 않음, 각 케이스가 끝나면 즉시 원복).
//
// 중요한 설계 선택 — 큐(호출 순서) 방식이 아니라 "select 컬럼 문자열" 기반
// 판정: 실제 PostgREST 42703은 "그 컬럼을 쿼리에 넣었는가"에 결정적으로
// 묶여 있지 매 호출 순번에 묶여 있지 않다(컬럼이 없으면 몇 번을 호출해도
// 항상 42703). 호출 순번 큐로 스크립트하면, 메모가 없는(고쳐지지 않은)
// 코드가 2번째 호출에서 "우연히" 큐가 소진돼 wide가 진짜로 통과해버려
// 회귀를 놓친다 — 그래서 컬럼 문자열을 검사해 항상 결정적으로 에러/성공을
// 재현하는 scriptTable()을 쓴다(case 3의 "1회성 일시 에러"만 예외적으로
// 호출 순번 기반 — 실제로도 일시적 에러는 특정 컬럼과 무관하다).
//
// 실행:
//   node scripts/buildWordLibOfflineBundle.mjs && node scripts/testColumnProbeMemo.mjs
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const BUNDLE = path.resolve(process.env.WORDLIB_OFFLINE_BUNDLE || 'scripts/.tmp/wordLibrary.offline.bundle.mjs')
const stub = await import(pathToFileURL(path.resolve('scripts/fakeSupabaseModule.mjs')).href)

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

// table에 대한 호출을 가로채 resolver(columns, callIndex)가 돌려주는 에러
// 객체가 있으면 그 에러로 즉시 resolve하고, null/undefined면 진짜 fake
// 스텁(real)에 그대로 위임해 정상 데이터를 반환한다. select/order/eq/in/
// limit/range 호출은 그대로 real 빌더에 전달해 정렬/필터/range 로직을
// 재사용한다(이 파일은 그 로직을 다시 구현하지 않는다).
function scriptTable(table, resolver) {
  let callCount = 0
  const originalFrom = stub.supabase.from
  stub.supabase.from = (t) => {
    if (t !== table) return originalFrom(t)
    const real = originalFrom(t)
    let columns = ''
    const chain = {
      select(cols, opts) { columns = cols || ''; real.select(cols, opts); return chain },
      eq(...a) { real.eq(...a); return chain },
      order(...a) { real.order(...a); return chain },
      in(...a) { real.in(...a); return chain },
      limit(...a) { real.limit(...a); return chain },
      range(...a) { real.range(...a); return chain },
      then(resolve, reject) {
        callCount++
        const err = resolver(columns, callCount)
        if (err) return Promise.resolve({ data: null, error: err }).then(resolve, reject)
        return Promise.resolve(real).then(resolve, reject)
      },
    }
    return chain
  }
  return {
    restore() { stub.supabase.from = originalFrom },
    getCallCount() { return callCount },
  }
}

const HOUSE_MISSING = { code: '42703', message: 'column "house_id" does not exist' }
const UNIT_ID_MISSING = { code: '42703', message: 'column "current_unit_id" does not exist' }
const GAMIFICATION_MISSING = { code: '42703', message: 'column "gamification_enabled" does not exist' }
const TRANSIENT = { code: 'PGRST301', message: 'transient network error' }

const studentsDataset = () => ({
  classes: [{ id: 'cls-a', name: 'ClassA', class_type: 'regular', created_at: '2026-01-01T00:00:00Z' }],
  students: [
    { id: 'stu-1', name: 'Alice', class_id: 'cls-a', unit_name: 'Unit 1', current_unit_id: 'unit-1', house_id: 2, created_at: '2026-01-01T00:00:00Z', classes: { name: 'ClassA' } },
    { id: 'stu-2', name: 'Bob', class_id: 'cls-a', unit_name: 'Unit 1', current_unit_id: 'unit-1', house_id: 1, created_at: '2026-01-02T00:00:00Z', classes: { name: 'ClassA' } },
  ],
  units: [], words: [], daily_assignments: [], textbooks: [], class_textbooks: [], student_class_assignments: [],
})

const classSettingsDataset = () => ({
  classes: [{
    id: 'cls-x', name: 'ClassX', class_type: 'regular', created_at: '2026-01-01T00:00:00Z',
    spelling_test_enabled: true, spelling_hint_enabled: true, wrong_answer_repeat_count: 5,
    spelling_direction: 'en2kr', gamification_enabled: true,
  }],
  units: [], words: [], daily_assignments: [], textbooks: [], class_textbooks: [],
  students: [], student_class_assignments: [],
})

async function freshLib(tag) {
  return import(pathToFileURL(BUNDLE).href + `?${tag}=` + Date.now() + Math.random())
}

// house_id가 "영구히" 없는 프로덕션을 재현(v2.7 미실행) — wide select는
// 몇 번을 호출해도 항상 42703, mid/base는 항상 성공.
const houseIdPermanentlyMissing = (columns) => (columns.includes('house_id') ? HOUSE_MISSING : null)

console.log('\n(1) students: 1차 호출 wide 42703 → mid 200(메모 기록). 2차 호출은 mid만(1회, wide 재시도 없음).')
{
  const lib = await freshLib('t1')
  stub.__setDataset(studentsDataset())
  const scripted = scriptTable('students', houseIdPermanentlyMissing)
  const map1 = await lib.refreshStudents()
  const callsAfterFirst = scripted.getCallCount()
  check('1차 호출: wide 42703 + mid 200 = 2회 요청', callsAfterFirst === 2, callsAfterFirst)
  check('1차 호출 후 _students 채워짐(2명)', map1.size === 2, map1.size)

  const map2 = await lib.refreshStudents()
  const callsAfterSecond = scripted.getCallCount() - callsAfterFirst
  scripted.restore()
  check('2차 호출: mid만 1회 요청(wide 재시도 없음 — house_id는 여전히 영구 부재)', callsAfterSecond === 1, callsAfterSecond)
  check('2차 호출 후에도 _students 동일(2명)', map2.size === 2, map2.size)
}

console.log('\n(2) students: mid도 42703(house_id·current_unit_id 둘 다 부재) → base로 폴백(메모=tier2). 다음 호출은 base만 1회.')
{
  const lib = await freshLib('t2')
  stub.__setDataset(studentsDataset())
  const bothMissing = (columns) => {
    if (columns.includes('house_id')) return HOUSE_MISSING
    if (columns.includes('current_unit_id')) return UNIT_ID_MISSING
    return null
  }
  let scripted = scriptTable('students', bothMissing)
  const map1 = await lib.refreshStudents()
  const calls1 = scripted.getCallCount()
  scripted.restore()
  check('1차 호출: wide 42703 + mid 42703 + base 200 = 3회 요청', calls1 === 3, calls1)
  check('1차 호출 후 _students 채워짐(2명)', map1.size === 2, map1.size)

  scripted = scriptTable('students', bothMissing)
  const map2 = await lib.refreshStudents()
  const calls2 = scripted.getCallCount()
  scripted.restore()
  check('다음 호출: base만 1회 요청(wide/mid 재시도 없음)', calls2 === 1, calls2)
  check('다음 호출 후에도 _students 동일(2명)', map2.size === 2, map2.size)
}

console.log('\n(3) students: 새 메모 상태에서 wide가 non-42703(일시적) 에러 → 오늘과 동일하게 캐스케이드(메모 갱신 없음)')
{
  const lib = await freshLib('t3')
  stub.__setDataset(studentsDataset())
  // 딱 1번째 호출에서만 에러 — "특정 컬럼이 영구히 없다"가 아니라 "그
  // 순간 네트워크가 잠깐 끊겼다"를 재현(컬럼과 무관, 순번 기반).
  const onceTransient = (_columns, callIndex) => (callIndex === 1 ? TRANSIENT : null)
  let scripted = scriptTable('students', onceTransient)
  const map1 = await lib.refreshStudents()
  const calls1 = scripted.getCallCount()
  scripted.restore()
  check('non-42703 에러도 오늘과 동일하게 캐스케이드(2회 요청: wide 실패 + mid 성공)', calls1 === 2, calls1)
  check('캐스케이드 후 최종 성공(2명)', map1.size === 2, map1.size)

  // 메모가 갱신되지 않았다면, 다음 호출은 다시 wide부터 시도해서 곧장
  // 성공해야 한다(1회) — 42703이 아니었으므로 영구 스킵 대상이 아님.
  scripted = scriptTable('students', () => null)
  const map2 = await lib.refreshStudents()
  const calls2 = scripted.getCallCount()
  scripted.restore()
  check('non-42703 에러는 메모를 갱신하지 않음(다음 호출은 wide부터 재시도, 1회에 성공)', calls2 === 1, calls2)
  check('두 번째 호출도 정상 성공(2명)', map2.size === 2, map2.size)
}

console.log('\n(4) classSettings: 1차 호출 gamification tier 42703 → 다음 tier 200(메모 기록). 다음 호출은 1회.')
{
  const lib = await freshLib('t4')
  stub.__setDataset(classSettingsDataset())
  const gamificationPermanentlyMissing = (columns) => (columns.includes('gamification_enabled') ? GAMIFICATION_MISSING : null)
  let scripted = scriptTable('classes', gamificationPermanentlyMissing)
  await lib.refreshClassSettings()
  const calls1 = scripted.getCallCount()
  const settings1 = lib.getClassSettings('ClassX')
  scripted.restore()
  check('1차 호출: 42703 + 200 = 2회 요청', calls1 === 2, calls1)
  check('1차 호출 후 설정 정상 반영', settings1.gamificationEnabled === true && settings1.spellingDirection === 'en2kr', settings1)

  scripted = scriptTable('classes', gamificationPermanentlyMissing)
  await lib.refreshClassSettings()
  const calls2 = scripted.getCallCount()
  const settings2 = lib.getClassSettings('ClassX')
  scripted.restore()
  check('다음 호출: 1회 요청(gamification tier 재시도 없음)', calls2 === 1, calls2)
  check('다음 호출 후에도 설정 동일', settings2.gamificationEnabled === true && settings2.spellingDirection === 'en2kr', settings2)
}

console.log('\n(5) __resetColumnProbeMemoForTests() 호출 후 다음 호출은 다시 wide/gamification tier부터 probe')
{
  const lib = await freshLib('t5')
  stub.__setDataset(studentsDataset())
  let scripted = scriptTable('students', houseIdPermanentlyMissing)
  await lib.refreshStudents()
  scripted.restore()

  lib.__resetColumnProbeMemoForTests()

  scripted = scriptTable('students', houseIdPermanentlyMissing)
  await lib.refreshStudents()
  const calls = scripted.getCallCount()
  scripted.restore()
  check('리셋 후 다시 wide부터 probe(2회 요청, wide 42703 재관측)', calls === 2, calls)
}

console.log('\n(6) 성공 경로 매핑 바이트 동일성 — 메모 도입이 매핑 로직 자체를 바꾸지 않았는지')
{
  const libA = await freshLib('t6a')
  stub.__setDataset(studentsDataset())
  const mapA = await libA.refreshStudents()
  const studentA = mapA.get('stu-1')

  const libB = await freshLib('t6b')
  stub.__setDataset(studentsDataset())
  const scripted = scriptTable('students', houseIdPermanentlyMissing)
  const mapB = await libB.refreshStudents()
  scripted.restore()
  const studentB = mapB.get('stu-1')
  // fakeSupabaseModule은 select 문자열로 실제 컬럼을 투영하지 않고 항상
  // dataset의 전체 행을 반환한다(헤더 주석 참고) — 그래서 mid select로
  // 성공해도 house_id 필드 자체는 응답에 그대로 남아 있고, 매핑 결과는
  // wide 성공 경로와 완전히 동일해야 한다(메모 도입이 매핑 로직을 전혀
  // 바꾸지 않았음을 확인하는 게 이 케이스의 목적).
  check('폴백 경로와 성공 경로의 매핑 결과 완전 동일', JSON.stringify(studentA) === JSON.stringify(studentB), { studentA, studentB })

  const settingsLibA = await freshLib('t6c')
  stub.__setDataset(classSettingsDataset())
  await settingsLibA.refreshClassSettings()
  const settingsA = settingsLibA.getClassSettings('ClassX')

  const settingsLibB = await freshLib('t6d')
  stub.__setDataset(classSettingsDataset())
  const gamificationPermanentlyMissing = (columns) => (columns.includes('gamification_enabled') ? GAMIFICATION_MISSING : null)
  const scriptedB = scriptTable('classes', gamificationPermanentlyMissing)
  await settingsLibB.refreshClassSettings()
  scriptedB.restore()
  const settingsB = settingsLibB.getClassSettings('ClassX')
  check('classSettings: 캐스케이드 경로와 직접 성공 경로 결과 완전 동일', JSON.stringify(settingsA) === JSON.stringify(settingsB), { settingsA, settingsB })
}

console.log(failures === 0
  ? '\n모든 단언 통과 — 컬럼 probe 메모(refreshStudents/refreshClassSettings) 회귀 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
