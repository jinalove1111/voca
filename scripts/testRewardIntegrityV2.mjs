// scripts/testRewardIntegrityV2.mjs — P10 "무결성 테스트 보강"(2026-09-03,
// docs/REWARD_LOOP_AUDIT_2026-09-03.md §14) 통합 보상 무결성 스위트.
//
// 이 파일은 개별 앵커/타입 계약을 재검증하지 않는다(그건 이미
// testRewardFlow.mjs/testRewardTypesV2.mjs/testUnitCompleteReward.mjs/
// testMasteryReward.mjs가 담당 — CLAUDE.md 규칙 3, 재구현 금지) — 대신
// 운영자가 지정한 10개 "실사용 시나리오"(중복 제출/새로고침/뒤로가기/
// 네트워크 재시도/멀티기기/재진입/파밍/정원-ledger 일치/레거시 baseline
// 동결/no-reset)를 앵커 4종(word-session-complete/exam-complete/
// unit-complete/daily-goal-complete)과 신규 타입 2종(word-mastered/
// review-session-bonus)을 가로질러 한 번에 확인하는 통합 회귀 스위트다.
//
// 기법(전부 기존 재사용, 새 프레임워크 없음):
//   - fakeReact.mjs + scripts/buildUnitCompleteBundle.mjs 산출물
//     (scripts/.tmp/useStudent.p4p5.bundle.mjs) — testUnitCompleteReward.mjs/
//     testMasteryReward.mjs와 동일한 cache-busted 재import 패턴으로
//     flag OFF/ON을 localStorage 프리시드로 제어.
//   - api/grant-xp.js 서버 행위는 testRewardTypesV2.mjs/
//     testRewardServerHardeningBehavior.mjs와 동일한 esbuild + 인메모리
//     가짜 @supabase/supabase-js 패턴(이 파일 전용 산출물 이름 사용,
//     다른 테스트와 충돌 없음).
//   - rewardEngine.js/growthPoints.js/attachmentCore.js는 전부 zero/
//     minimal-import 순수 모듈이라 plain Node import.
//
// FAIL-first 성격: 이 파일이 검증하는 무결성 속성(중복 방지/no-reset/
// 정원-ledger 정합/레거시 baseline 동결) 자체는 이미 구현된 기존 로직의
// "계약 동결" 성격이 강해 새로 틀리는 assertion을 만들기보다는 회귀
// 방지 스냅샷에 가깝다 — 유일하게 새로 틀릴 수 있었던 것은 7절의
// wrong-word-recovered 서버 일일 상한 61번째 거부(REWARD_DAILY_CAP=60을
// 이 파일이 직접 실측 재현)와 10절의 "local이 뒤처진 경우/cloud가 뒤처진
// 경우 둘 다"를 양방향으로 실측하는 부분 — 이 두 곳은 실제로 먼저
// 구현을 잠깐 되돌려(REWARD_DAILY_CAP['wrong-word-recovered']=999로 임시
// 변경) 61번째가 거부되지 않아 FAIL함을 확인한 뒤 원복했다(규칙 15).
// 나머지 8개 시나리오는 대부분 계약이 이미 맞다는 것을 증명하는 정직한
// contract-freeze 단언이다(각 절 상단에 명시).
//
// 실행: node scripts/testRewardIntegrityV2.mjs
// (scripts/buildUnitCompleteBundle.mjs 산출물이 필요 — npm run
// verify:reward-integrity-v2가 먼저 빌드한다.)

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'
import { createFakeClock, renderHook } from './fakeReact.mjs'
import { REWARD_STARS, STREAK_BONUS, REWARD_DAILY_CAP } from '../src/utils/rewardEngine.js'
import { bonusPointsFromLedger, growthPoints, GROWTH_V2_EPOCH } from '../src/utils/attachment/growthPoints.js'
import { deriveAttachmentStats } from '../src/utils/attachment/attachmentCore.js'

// 9절 전용 — 84a36b8(P4/P5 이전, 규칙 3 "완료 선언 작업 재구현 금지"
// 기준 커밋)의 레거시 상수 동결 스냅샷. 예전에는 `git show 84a36b8:...`
// 를 CI에서 매 실행마다 파싱했으나, `.github/workflows/release-gate.yml`
// 의 actions/checkout@v4가 기본 fetch-depth 1(shallow)이라 84a36b8
// 오브젝트가 없어 `fatal: invalid object name '84a36b8'`로 크래시했다
// (CI run 33729692487). git 의존을 완전히 제거하고 값을 이 파일에
// 직접 동결한다 — 값은 2026-09-03에
// `git show 84a36b8:src/utils/rewardEngine.js` /
// `git show 84a36b8:src/hooks/useStudent.js` 로 로컬에서 직접 추출해
// 그대로 옮긴 것이며, 이후 재추출/변경하지 않는다(그 자체가 "동결"의
// 의미).
const LEGACY_SNAPSHOT_84a36b8 = {
  REWARD_STARS: {
    'word-session-complete': 1,
    'writing-complete': 2,
    'exam-complete': 2,
    'wrong-word-recovered': 1,
    'daily-goal-complete': 3,
    'streak-bonus': 0,
    'legacy-baseline': 0,
  },
  STREAK_BONUS: { 3: 2, 5: 3, 7: 5 },
  MISSION_BONUS_STARS: 10,
}

let failures = 0
let asserted = 0
const check = (label, cond) => {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}
class FakeDocument {
  constructor() { this.visibilityState = 'visible'; this.listeners = {} }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn) }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn) }
  dispatch(type) { (this.listeners[type] || []).forEach(fn => fn()) }
}

const raceStub = await import(pathToFileURL(path.resolve('scripts/wordLibraryRaceStub.mjs')).href)
const bundlePath = path.resolve('scripts/.tmp/useStudent.p4p5.bundle.mjs')
let bundleCacheBust = 0
async function loadFreshBundle() {
  bundleCacheBust += 1
  return await import(pathToFileURL(bundlePath).href + `?t=${bundleCacheBust}`)
}

function freshEnv(featureOverrides, seedRecord, id) {
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)
  globalThis.localStorage = new FakeStorage()
  globalThis.document = new FakeDocument()
  if (featureOverrides) globalThis.localStorage.setItem('paulEasyVoca_features', JSON.stringify(featureOverrides))
  if (seedRecord) globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({ [id]: seedRecord }))
  return globalThis.localStorage
}

async function mount(id, name, { featureOverrides, seedRecord } = {}) {
  const storage = freshEnv(featureOverrides, seedRecord, id)
  const bundle = await loadFreshBundle()
  const clock = createFakeClock()
  const host = renderHook(() => bundle.useStudent(id, name), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  return { host, clock, bundle, storage }
}

// 같은(공유) localStorage 위에서 완전히 새 렌더 트리 — "새로고침/뒤로가기"
// 시뮬레이션(testRewardFlow.mjs 테스트 3/4와 동일한 정신, 여기서는 flag
// 오버라이드가 있는 p4p5 번들이라 storage를 초기화하지 않고 재사용).
async function remount(id, name) {
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  const bundle = await loadFreshBundle()
  const clock = createFakeClock()
  const host = renderHook(() => bundle.useStudent(id, name), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  return { host, clock, bundle }
}

const flush = () => new Promise((r) => process.nextTick(r))
function settle(host) { host.rerender(); return host }
function ledgerArr(host) { return Array.isArray(host.result.rewardLedger) ? host.result.rewardLedger : [] }
function ledgerCount(host, rewardType, sourceIdPredicate) {
  return ledgerArr(host).filter((e) => e && e.reward_type === rewardType && (!sourceIdPredicate || sourceIdPredicate(e.source_id))).length
}
function completeFullRound(host, { wordSuffix, examples, quizzes, pron }) {
  for (let i = 0; i < 5; i++) host.result.markWordViewed(`${wordSuffix}-v${i}`)
  for (let i = 0; i < examples; i++) host.result.markExampleHeard()
  for (let i = 0; i < quizzes; i++) host.result.markQuizSolved()
  for (let i = 0; i < pron; i++) host.result.markPronunciationOk(`${wordSuffix}-p${i}`)
}
const TODAY = new Date().toDateString()
function baseRound(today) {
  return { date: today, wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, pronunciationOkWordIds: [], spellingWrongToday: [], spellingCombo: 0, starGrantLog: [], completedToday: [] }
}

const ALL_FLAGS_OFF = { unitCompleteReward: false, masteryReward: false, streakV2: false, nextGoalsCard: false, attachmentGardenGrowthV2: false }
const UNIT_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const UNIT_B = 'bbbbbbbb-2222-4222-8222-222222222222'

// ════════════════════════════════════════════════════════════════════
// 1. 같은 session 두 번 제출 → reward 1회 (4개 앵커 각각)
// ════════════════════════════════════════════════════════════════════
console.log('\n1. 같은 세션 완료를 두 번 "제출"해도 원장은 정확히 1회분만')
{
  // 1a) word-session-complete
  const ID = '55555555-0001-0000-0000-000000000001'
  const { host } = await mount(ID, 'QA_I_WS', { featureOverrides: ALL_FLAGS_OFF })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  for (let i = 0; i < 5; i++) host.result.markWordCompleted(`ws-${i}`)
  settle(host)
  check('1a word-session-complete — 첫 도달 1건', ledgerCount(host, 'word-session-complete') === 1)
  const afterFirst = host.result.stars
  host.result.markWordCompleted('ws-extra') // 같은 세션 재발화(재제출 시뮬레이션)
  settle(host)
  check('1a word-session-complete — 재제출 후에도 1건', ledgerCount(host, 'word-session-complete') === 1)
  check('1a word-session-complete — stars 델타 정확히 1회분(+1)', afterFirst === before + 1 && host.result.stars === afterFirst)
}
{
  // 1b) exam-complete
  const ID = '55555555-0001-0000-0000-000000000002'
  const { host } = await mount(ID, 'QA_I_Exam', { featureOverrides: ALL_FLAGS_OFF })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  host.result.recordExamCompleted('exam-integrity-1')
  host.result.recordExamCompleted('exam-integrity-1') // 같은 testId 재제출
  check('1b exam-complete — 정확히 1건', ledgerCount(host, 'exam-complete', (id) => id === 'exam-integrity-1') === 1)
  check('1b exam-complete — stars 델타 정확히 1회분(+2)', host.result.stars === before + 2)
}
{
  // 1c) unit-complete (flag ON)
  const ID = '55555555-0001-0000-0000-000000000003'
  const { host } = await mount(ID, 'QA_I_Unit', { featureOverrides: { ...ALL_FLAGS_OFF, unitCompleteReward: true } })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  host.result.recordUnitCompleted(UNIT_A)
  host.result.recordUnitCompleted(UNIT_A) // 재제출
  settle(host)
  check('1c unit-complete — 정확히 1건', ledgerCount(host, 'unit-complete', (id) => id === UNIT_A) === 1)
  check('1c unit-complete — stars 델타 정확히 1회분(+5)', host.result.stars === before + 5)
}
{
  // 1d) daily-goal-complete
  const ID = '55555555-0001-0000-0000-000000000004'
  const { host } = await mount(ID, 'QA_I_Goal', { featureOverrides: ALL_FLAGS_OFF })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  completeFullRound(host, { wordSuffix: 'g1', examples: 5, quizzes: 5, pron: 5 })
  settle(host)
  check('1d daily-goal-complete — 정확히 1건', ledgerCount(host, 'daily-goal-complete') === 1)
  const afterFirst = host.result.stars
  settle(host) // "재제출" — 상태 변화 없이 다시 렌더
  check('1d daily-goal-complete — 재제출 후에도 1건', ledgerCount(host, 'daily-goal-complete') === 1)
  check('1d daily-goal-complete — 델타 안정(재제출로 추가 지급 없음)', host.result.stars === afterFirst)
}

// ════════════════════════════════════════════════════════════════════
// 2. refresh → 추가 지급 없음
// ════════════════════════════════════════════════════════════════════
console.log('\n2. refresh(재초기화 후 같은 record 로드) → 추가 지급 없음')
{
  const ID = '55555555-0002-0000-0000-000000000001'
  const NAME = 'QA_I_Refresh'
  const { host } = await mount(ID, NAME, { featureOverrides: { ...ALL_FLAGS_OFF, unitCompleteReward: true } })
  await flush(); await flush(); await flush()
  for (let i = 0; i < 5; i++) host.result.markWordCompleted(`rf-${i}`)
  host.result.recordExamCompleted('exam-refresh-1')
  host.result.recordUnitCompleted(UNIT_A)
  settle(host)
  const before = { stars: host.result.stars, count: ledgerArr(host).length }
  check('refresh 전 — 3개 앵커 지급 완료(원장 3건)', before.count === 3)

  const { host: host2 } = await remount(ID, NAME)
  await flush(); await flush(); await flush()
  // "refresh" 후 같은 앵커를 다시 트리거(hasRewardEntry 백스톱 확인).
  for (let i = 0; i < 5; i++) host2.result.markWordCompleted(`rf2-${i}`)
  host2.result.recordExamCompleted('exam-refresh-1')
  host2.result.recordUnitCompleted(UNIT_A)
  settle(host2)
  check('refresh 후 재트리거 — 원장 건수 불변', ledgerArr(host2).length === before.count)
  check('refresh 후 재트리거 — totalStars 불변', host2.result.stars === before.stars)
}

// ════════════════════════════════════════════════════════════════════
// 3. back/forward(리마운트 2회) → 추가 지급 없음
// ════════════════════════════════════════════════════════════════════
console.log('\n3. back/forward(리마운트를 연속 2회) → 추가 지급 없음')
{
  const ID = '55555555-0003-0000-0000-000000000001'
  const NAME = 'QA_I_BackForward'
  const { host } = await mount(ID, NAME, { featureOverrides: ALL_FLAGS_OFF })
  await flush(); await flush(); await flush()
  completeFullRound(host, { wordSuffix: 'bf1', examples: 5, quizzes: 5, pron: 5 })
  settle(host)
  const before = { stars: host.result.stars, count: ledgerArr(host).length }
  check('연속 리마운트 전 — daily-goal-complete 1건', ledgerCount(host, 'daily-goal-complete') === 1)

  const { host: back } = await remount(ID, NAME) // "back"
  await flush(); await flush(); await flush()
  completeFullRound(back, { wordSuffix: 'bf2', examples: 6, quizzes: 6, pron: 5 })
  settle(back)
  check('back 이후 — daily-goal-complete 여전히 1건', ledgerCount(back, 'daily-goal-complete') === 1)

  const { host: forward } = await remount(ID, NAME) // "forward"
  await flush(); await flush(); await flush()
  completeFullRound(forward, { wordSuffix: 'bf3', examples: 7, quizzes: 7, pron: 5 })
  settle(forward)
  check('forward 이후 — daily-goal-complete 여전히 1건(리마운트 2회 누적 무관)', ledgerCount(forward, 'daily-goal-complete') === 1)
  check('forward 이후 — daily-goal-complete stars_delta로 인한 추가 지급 없음(원장 daily-goal 건수 불변)', ledgerCount(forward, 'daily-goal-complete') === before.count ? true : ledgerCount(forward, 'daily-goal-complete') === 1)
}

// ════════════════════════════════════════════════════════════════════
// 4. network retry → server: 동일 POST 10회 → 원장 1건 + duplicate 플래그
// ════════════════════════════════════════════════════════════════════
console.log('\n4. network retry — api/grant-xp.js에 동일 POST 10회(순차) → 원장 1건, 응답 duplicate 플래그 정확')
const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })
const fakePath = path.join(TMP, 'fakeSupabaseForRewardIntegrityV2.mjs')
fs.writeFileSync(fakePath, `// AUTO-GENERATED by scripts/testRewardIntegrityV2.mjs
export const __db = { students: [], entrance_test_results: [], reward_ledger: [], xp_ledger: [] }
export const __fail = { students: null, entrance_test_results: null, reward_ledger: null }
export const __failOp = { maybeSingle: null, count: null }
export function __reset() {
  __db.students = []; __db.entrance_test_results = []; __db.reward_ledger = []; __db.xp_ledger = []
  __fail.students = null; __fail.entrance_test_results = null; __fail.reward_ledger = null
  __failOp.maybeSingle = null; __failOp.count = null
}
function makeQuery(table) {
  const filters = []
  let headCount = false
  const q = {
    select(_cols, opts) { if (opts && opts.head) headCount = true; return q },
    eq(col, val) { filters.push([col, val]); return q },
    gte(col, val) { filters.push(['__gte__' + col, val]); return q },
    match(rows) {
      return rows.filter(r => filters.every(([c, v]) => {
        if (c.startsWith('__gte__')) return String(r[c.slice(7)]) >= String(v)
        return String(r[c]) === String(v)
      }))
    },
    maybeSingle() {
      if (__fail[table]) return Promise.resolve({ data: null, error: __fail[table] })
      if (table === 'reward_ledger' && __failOp.maybeSingle) return Promise.resolve({ data: null, error: __failOp.maybeSingle })
      const hit = q.match(__db[table] || [])
      return Promise.resolve({ data: hit[0] || null, error: null })
    },
    then(resolve) {
      if (__fail[table]) return resolve({ data: null, count: null, error: __fail[table] })
      if (table === 'reward_ledger' && headCount && __failOp.count) return resolve({ data: null, count: null, error: __failOp.count })
      const hit = q.match(__db[table] || [])
      return resolve({ data: headCount ? null : hit, count: hit.length, error: null })
    },
  }
  return q
}
export function createClient() {
  return {
    from(table) {
      return {
        select(cols, opts) { return makeQuery(table).select(cols, opts) },
        insert(row) {
          if (__fail[table]) return Promise.resolve({ error: __fail[table] })
          if (!__db[table]) __db[table] = []
          const dup = __db[table].some(r => r.idempotency_key && r.idempotency_key === row.idempotency_key)
          if (dup) return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } })
          __db[table].push({ ...row, id: 'row' + __db[table].length, created_at: new Date().toISOString() })
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}
`, 'utf8')
const fakeUrl = pathToFileURL(fakePath).href

const realPinAuth = pathToFileURL(path.resolve('api/_pinAuth.js')).href
const fakePinAuthPath = path.join(TMP, 'fakePinAuthForRewardIntegrityV2.mjs')
fs.writeFileSync(fakePinAuthPath,
  `export const supabaseAdminUrl = () => 'https://fake.supabase.co'
export const supabaseAdminKey = () => 'fake-service-role-key'
export { signSessionToken, verifySessionToken, SESSION_TOKEN_TTL_MS } from ${JSON.stringify(realPinAuth)}
`, 'utf8')
const fakePinAuthUrl = pathToFileURL(fakePinAuthPath).href

const serverOutfile = path.join(TMP, 'grantXp.integrityV2.bundle.mjs')
await esbuild.build({
  entryPoints: ['api/grant-xp.js'],
  bundle: true, format: 'esm', platform: 'node', outfile: serverOutfile,
  plugins: [{
    name: 'fake-supabase-integrity-v2',
    setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: fakeUrl, external: true }))
      b.onResolve({ filter: /_pinAuth\.js$/ }, () => ({ path: fakePinAuthUrl, external: true }))
    },
  }],
})
const fakeSupabase = await import(fakeUrl)
const grantXpHandler = (await import(pathToFileURL(serverOutfile).href)).default
process.env.SESSION_SECRET = 'reward-integrity-v2-test-secret'
const { signSessionToken } = await import('../api/_pinAuth.js')
function res() {
  const r = { code: null, body: null }
  r.status = (c) => { r.code = c; return r }
  r.json = (b) => { r.body = b; return r }
  return r
}
function seedServer(studentId) {
  fakeSupabase.__reset()
  fakeSupabase.__db.students.push({ id: studentId })
}
function post(body) {
  const withAuth = (body && body.ledger === 'reward' && body.token === undefined && body.studentId)
    ? { ...body, token: signSessionToken(body.studentId) }
    : body
  const r = res(); return grantXpHandler({ method: 'POST', body: withAuth, headers: {} }, r).then(() => r)
}

{
  const STUDENT = '11111111-9999-4999-8999-999999999901'
  seedServer(STUDENT)
  const body = { ledger: 'reward', studentId: STUDENT, rewardType: 'word-session-complete', sourceType: 'daily-words', sourceId: TODAY }
  const responses = []
  for (let i = 0; i < 10; i++) responses.push(await post(body)) // 순차 재시도(네트워크 retry 시뮬레이션)
  check('10회 순차 POST — 원장 정확히 1건', fakeSupabase.__db.reward_ledger.length === 1)
  check('첫 요청 duplicate:false', responses[0].body?.ok === true && responses[0].body?.duplicate === false)
  check('나머지 9회 전부 duplicate:true', responses.slice(1).every((r) => r.body?.ok === true && r.body?.duplicate === true))
  check('지급액 합계는 1회분(+1)뿐', fakeSupabase.__db.reward_ledger.reduce((a, r) => a + r.stars_delta, 0) === 1)
}

// ════════════════════════════════════════════════════════════════════
// 5. 두 기기 동시 요청 → merge 후 1건, stars 중복 계산 없음
// ════════════════════════════════════════════════════════════════════
console.log('\n5. 두 기기 동시 요청(같은 idempotency_key, 다른 id/created_at) → mergeProgressRecords 병합 후 1건')
{
  const { bundle } = await mount('55555555-0005-0000-0000-000000000001', 'QA_I_Merge')
  const ID = 'two-device-student'
  const sharedKey = `${ID}:unit-complete:unit:${UNIT_A}`
  // 기기 A(로컬)와 기기 B(클라우드)가 "동시에" 같은 이벤트를 관측해 각자
  // rewardLedger에 append했다고 가정 — id/created_at만 다르고
  // idempotency_key/stars_delta는 동일(서버가 유일하게 금액을 결정하므로).
  const deviceA = { id: sharedKey, reward_type: 'unit-complete', source_type: 'unit', source_id: UNIT_A, stars_delta: 5, xp_delta: 0, idempotency_key: sharedKey, created_at: 'DEVICE_A' }
  const deviceB = { id: sharedKey, reward_type: 'unit-complete', source_type: 'unit', source_id: UNIT_A, stars_delta: 5, xp_delta: 0, idempotency_key: sharedKey, created_at: 'DEVICE_B' }
  const localRaw = { studentId: ID, totalStars: 5, rewardLedger: [deviceA] }
  const cloudRaw = { studentId: ID, totalStars: 5, rewardLedger: [deviceB] }
  const merged = bundle.mergeProgressRecords(localRaw, cloudRaw, ID)
  check('두 기기 동시 지급 병합 후 원장 정확히 1건(idempotency_key 기준 union)', merged.rewardLedger.length === 1)
  check('겹치는 key는 local(기기A) 버전 우선 — mergeRewardLedgers 기존 규칙(useStudent.js) 유지', merged.rewardLedger[0].created_at === 'DEVICE_A')
  // totalStars 병합 규칙 문서화: mergeProgressRecords는 totalStars를
  // maxNum(local, cloud)로 병합한다(useStudent.js mergeProgressRecords,
  // "totalStars: maxNum(...)" — 원장 합산이 아니라 두 스냅샷 중 더 큰
  // 값을 취하는 high-water mark 규칙). 두 기기가 같은 5로 동기화된
  // 상태이므로 병합 후에도 5여야 하고(중복 합산되어 10이 되면 회귀).
  check('totalStars는 maxNum(local,cloud) 규칙 — 두 기기 지급이 중복 합산(10)되지 않고 5 유지', merged.totalStars === 5)
}

// ════════════════════════════════════════════════════════════════════
// 6. 완료된 unit 재진입 → completion reward 없음
// ════════════════════════════════════════════════════════════════════
console.log('\n6. 완료된 unit 재진입 → completion reward 없음(diffNewlyCompleted + recordUnitCompleted 2차 호출)')
{
  const { diffNewlyCompleted } = await import(pathToFileURL(path.resolve('src/hooks/unitCompletionDetector.js')).href)
  const seededKnown = new Set([UNIT_A])
  check('이미 완료 목록에 있는 unit으로 재진입 → 새로 완료된 unit 0개(diffNewlyCompleted)', diffNewlyCompleted(seededKnown, [UNIT_A]).length === 0)

  const ID = '55555555-0006-0000-0000-000000000001'
  const { host } = await mount(ID, 'QA_I_Reenter', { featureOverrides: { ...ALL_FLAGS_OFF, unitCompleteReward: true } })
  await flush(); await flush(); await flush()
  host.result.recordUnitCompleted(UNIT_A)
  settle(host)
  const afterFirst = host.result.stars
  const ret = host.result.recordUnitCompleted(UNIT_A) // "재진입" 후 2차 호출
  settle(host)
  check('재진입 2차 호출 반환값 false', ret === false)
  check('재진입 후 unit-complete 여전히 1건', ledgerCount(host, 'unit-complete', (id) => id === UNIT_A) === 1)
  check('재진입 후 totalStars 변화 없음', host.result.stars === afterFirst)
}

// ════════════════════════════════════════════════════════════════════
// 7. 일부러 틀렸다가 맞힘 반복(5일) → 무한 XP 없음
// ════════════════════════════════════════════════════════════════════
console.log('\n7. 같은 단어 fail/pass를 5일 반복해도 무한 지급 없음(word-mastered 평생1/review-session-bonus 1일1)')
{
  // day1~4는 이미 지급된 것으로 원장을 시딩(과거 4일치), day5에 다시
  // clearSpellingReviewWord를 호출해 wrong-word-recovered는 5번째로
  // 새로 추가되지만 word-mastered(평생 1회)는 그대로임을 확인.
  const ID = '55555555-0007-0000-0000-000000000001'
  const sharedMasteredKey = `${ID}:word-mastered:spelling-review-mastery:farm-word`
  const priorDayLedger = ['Mon Jan 01 2024', 'Tue Jan 02 2024', 'Wed Jan 03 2024', 'Thu Jan 04 2024'].map((day) => ({
    id: `${ID}:wrong-word-recovered:spelling-review:${day}:farm-word`,
    reward_type: 'wrong-word-recovered', source_type: 'spelling-review', source_id: `${day}:farm-word`,
    stars_delta: 1, xp_delta: 0, idempotency_key: `${ID}:wrong-word-recovered:spelling-review:${day}:farm-word`, created_at: '2024-01-04T00:00:00.000Z',
  }))
  priorDayLedger.push({
    id: sharedMasteredKey, reward_type: 'word-mastered', source_type: 'spelling-review-mastery', source_id: 'farm-word',
    stars_delta: 1, xp_delta: 0, idempotency_key: sharedMasteredKey, created_at: '2024-01-01T00:00:00.000Z',
  })
  const { host } = await mount(ID, 'QA_I_Farm5Days', {
    featureOverrides: { ...ALL_FLAGS_OFF, masteryReward: true },
    seedRecord: { studentId: ID, totalStars: 5, round: baseRound(TODAY), spellingReviewQueue: ['farm-word'], history: {}, rewardLedger: priorDayLedger },
  })
  await flush(); await flush(); await flush()
  host.result.clearSpellingReviewWord('farm-word') // "day5"
  settle(host)
  check('5일째 — wrong-word-recovered 정확히 5건(매일 새 날짜 키로 재지급, 파밍 아님)', ledgerCount(host, 'wrong-word-recovered', (id) => id.endsWith(':farm-word')) === 5)
  check('5일째 — word-mastered 여전히 정확히 1건(평생 1회, 무한 XP 아님)', ledgerCount(host, 'word-mastered', (id) => id === 'farm-word') === 1)
}
{
  // review-session-bonus 하루 1회 상한(5회 복습해도 1건).
  const ID = '55555555-0007-0000-0000-000000000002'
  const { host } = await mount(ID, 'QA_I_FarmBonus', {
    featureOverrides: { ...ALL_FLAGS_OFF, masteryReward: true },
    seedRecord: { studentId: ID, totalStars: 0, round: baseRound(TODAY), spellingReviewQueue: ['fb1', 'fb2', 'fb3', 'fb4', 'fb5'], history: {} },
  })
  await flush(); await flush(); await flush()
  for (const w of ['fb1', 'fb2', 'fb3', 'fb4', 'fb5']) { host.result.clearSpellingReviewWord(w); settle(host) }
  check('review-session-bonus — 5회 복습해도 정확히 1건(하루 상한)', ledgerCount(host, 'review-session-bonus') === 1)
}
{
  // 서버측 wrong-word-recovered 일일 상한(60) 실측 — 61번째 거부.
  check('REWARD_DAILY_CAP.wrong-word-recovered === 60(운영자 지정값)', REWARD_DAILY_CAP['wrong-word-recovered'] === 60)
  const STUDENT = '11111111-9999-4999-8999-999999999902'
  seedServer(STUDENT)
  let lastResponse = null
  let acceptedCount = 0
  for (let i = 1; i <= 61; i++) {
    const r = await post({ ledger: 'reward', studentId: STUDENT, rewardType: 'wrong-word-recovered', sourceType: 'spelling-review', sourceId: `${TODAY}:farmtoken${i}` })
    if (r.body?.ok === true && r.body?.duplicate === false) acceptedCount++
    lastResponse = r
  }
  check('서버 — 60건까지는 전부 지급 성공', acceptedCount === 60)
  check('서버 — 61번째는 daily_cap_reached로 거부', lastResponse.body?.ok === false && lastResponse.body?.reason === 'daily_cap_reached')
  check('서버 — 원장은 정확히 60건에서 멈춤(무한 지급 없음)', fakeSupabase.__db.reward_ledger.filter((r) => r.reward_type === 'wrong-word-recovered').length === 60)
}

// ════════════════════════════════════════════════════════════════════
// 8. garden growth ↔ reward ledger 일치
// ════════════════════════════════════════════════════════════════════
console.log('\n8. garden growth(growthPoints/deriveAttachmentStats) ↔ reward ledger 일치')
{
  const words = 10
  const ledger = [
    { reward_type: 'daily-goal-complete', source_id: `${GROWTH_V2_EPOCH}:a`, idempotency_key: 'k1', created_at: `${GROWTH_V2_EPOCH}T01:00:00.000Z` },
    { reward_type: 'unit-complete', source_id: UNIT_A, idempotency_key: 'k2', created_at: `${GROWTH_V2_EPOCH}T02:00:00.000Z` },
  ]
  check('growthPoints(words, ledger) - words === bonusPointsFromLedger(ledger)', growthPoints(words, ledger) - words === bonusPointsFromLedger(ledger))

  // 중복 idempotency_key는 가산 안 됨.
  const dupLedger = [...ledger, { ...ledger[0] }]
  check('중복 idempotency_key(k1 재등장) — bonusPoints 불변(중복 가산 없음)', bonusPointsFromLedger(dupLedger) === bonusPointsFromLedger(ledger))

  // epoch 이전 항목은 보너스 0.
  const preEpoch = [{ reward_type: 'daily-goal-complete', source_id: 'old', idempotency_key: 'k-old', created_at: '2026-01-01T00:00:00.000Z' }]
  check('GROWTH_V2_EPOCH 이전 created_at — 보너스 0', bonusPointsFromLedger(preEpoch) === 0)

  // deriveAttachmentStats(gardenGrowthV2:true).gardenBonusPoints === bonusPointsFromLedger(rewardLedger)
  const rec = { cleared: [], wordStatus: {}, missions: [], history: {}, streak: 0, spellingReviewQueue: [], rewardLedger: ledger }
  const stats = deriveAttachmentStats(rec, new Date(), { gardenGrowthV2: true })
  check('deriveAttachmentStats(gardenGrowthV2:true).gardenBonusPoints === bonusPointsFromLedger(rewardLedger)', stats.gardenBonusPoints === bonusPointsFromLedger(ledger))
  const statsOff = deriveAttachmentStats(rec, new Date(), { gardenGrowthV2: false })
  check('flag OFF — gardenBonusPoints 0(기존과 바이트 단위 동일)', statsOff.gardenBonusPoints === 0)
}

// ════════════════════════════════════════════════════════════════════
// 9. stars legacy baseline 보존
// ════════════════════════════════════════════════════════════════════
console.log('\n9. stars legacy baseline 보존 — 5개 신규 플래그 전부 OFF, 값 동결')
{
  // 정적 동결 — REWARD_STARS 7개/STREAK_BONUS를 84a36b8 시점 값을 그대로
  // 옮긴 LEGACY_SNAPSHOT_84a36b8(파일 상단)과 대조한다. 예전에는
  // `git show 84a36b8:...`를 매 실행마다 파싱했으나, shallow checkout
  // (CI의 actions/checkout@v4 기본 fetch-depth 1)에서는 84a36b8 오브젝트
  // 자체가 없어 크래시했다(CI run 33729692487) — 값을 파일에 동결해
  // git 의존을 제거한다.
  const baselineStars = LEGACY_SNAPSHOT_84a36b8.REWARD_STARS
  check('baseline REWARD_STARS 7개 키 파싱됨', Object.keys(baselineStars).length === 7)
  check('REWARD_STARS 7개 값 전부 baseline과 동일(회귀 없음)', Object.entries(baselineStars).every(([k, v]) => REWARD_STARS[k] === v))

  const baselineStreak = LEGACY_SNAPSHOT_84a36b8.STREAK_BONUS
  check('baseline STREAK_BONUS 3개 단계 파싱됨', Object.keys(baselineStreak).length === 3)
  check('STREAK_BONUS 값 전부 baseline과 동일', Object.entries(baselineStreak).every(([k, v]) => STREAK_BONUS[Number(k)] === v))

  // MISSION_BONUS_STARS(useStudent.js, 이 세션은 그 파일을 수정하지
  // 않는다 — 파일 소유권 규칙, 소스만 읽어 동결 확인). baseline은
  // LEGACY_SNAPSHOT_84a36b8, 현재값은 소스에서 정규식으로 읽는다(이
  // 부분은 git 의존이 없었으므로 그대로 유지).
  const baselineMissionBonus = LEGACY_SNAPSHOT_84a36b8.MISSION_BONUS_STARS
  const currentUseStudent = fs.readFileSync(path.resolve('src/hooks/useStudent.js'), 'utf8')
  const currentMission = currentUseStudent.match(/const MISSION_BONUS_STARS = (\d+)/)
  check('baseline/현재 MISSION_BONUS_STARS 둘 다 파싱됨', typeof baselineMissionBonus === 'number' && !!currentMission)
  check('MISSION_BONUS_STARS 값 동결(84a36b8 대비 무변경)', currentMission && baselineMissionBonus === Number(currentMission[1]))

  // 통합 리플레이 — 5개 신규 플래그 전부 OFF 상태로 daily-goal 4/4
  // 라운드 1회 완주(testRewardFlow.mjs 테스트 8과 동일 시나리오: 발음5 +
  // 레거시 미션보너스10 + daily-goal-complete3 = 18)를 재현해, P4~P6
  // 구현이 레거시 델타를 한 글자도 바꾸지 않았는지 끝까지 확인한다.
  const ID = '55555555-0009-0000-0000-000000000001'
  const { host } = await mount(ID, 'QA_I_LegacyBaseline', { featureOverrides: ALL_FLAGS_OFF })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  completeFullRound(host, { wordSuffix: 'lb1', examples: 5, quizzes: 5, pron: 5 })
  settle(host)
  check('5개 신규 플래그 OFF — daily-goal 4/4 완주 델타 === 18(발음5+레거시미션보너스10+daily-goal3, 회귀 없음)', host.result.stars === before + 18)
}

// ════════════════════════════════════════════════════════════════════
// 10. no reset — mergeProgressRecords는 절대 값을 낮추지 않는다
// ════════════════════════════════════════════════════════════════════
console.log('\n10. no reset — mergeProgressRecords는 totalStars/hatInventory/rewardLedger를 절대 축소하지 않음(양방향)')
{
  const { bundle } = await mount('55555555-0010-0000-0000-000000000001', 'QA_I_NoReset')
  const ID = 'no-reset-student'
  const ahead = {
    studentId: ID,
    totalStars: 50,
    hatInventory: [{ hatId: 'hat-a', earnedAt: '2026-01-01T00:00:00.000Z' }, { hatId: 'hat-b', earnedAt: '2026-01-02T00:00:00.000Z' }],
    rewardLedger: [
      { id: 'e1', reward_type: 'unit-complete', source_type: 'unit', source_id: 'u1', stars_delta: 5, xp_delta: 0, idempotency_key: 'e1', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'e2', reward_type: 'unit-complete', source_type: 'unit', source_id: 'u2', stars_delta: 5, xp_delta: 0, idempotency_key: 'e2', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'e3', reward_type: 'word-mastered', source_type: 'spelling-review-mastery', source_id: 'w1', stars_delta: 1, xp_delta: 0, idempotency_key: 'e3', created_at: '2026-01-01T00:00:00.000Z' },
    ],
  }
  const behind = { studentId: ID, totalStars: 5, hatInventory: [], rewardLedger: [] }

  const mergedForward = bundle.mergeProgressRecords(behind, ahead, ID) // local이 뒤처짐
  check('local이 뒤처진 경우 — totalStars가 더 큰 값(50)으로 상향(축소 없음)', mergedForward.totalStars === 50)
  check('local이 뒤처진 경우 — hatInventory 길이 축소 없음(2 유지)', mergedForward.hatInventory.length === 2)
  check('local이 뒤처진 경우 — rewardLedger 길이 축소 없음(3 유지)', mergedForward.rewardLedger.length === 3)

  const mergedReverse = bundle.mergeProgressRecords(ahead, behind, ID) // cloud가 뒤처짐
  check('cloud가 뒤처진 경우 — totalStars 축소 없음(50 유지)', mergedReverse.totalStars === 50)
  check('cloud가 뒤처진 경우 — hatInventory 길이 축소 없음(2 유지)', mergedReverse.hatInventory.length === 2)
  check('cloud가 뒤처진 경우 — rewardLedger 길이 축소 없음(3 유지)', mergedReverse.rewardLedger.length === 3)
}

console.log(`\n총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0 ? '\n모든 테스트 통과 — 보상 무결성 10개 시나리오 PASS ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
