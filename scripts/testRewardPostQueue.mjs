// scripts/testRewardPostQueue.mjs
//
// Reward Post 재시도 큐(2026-09-06, src/utils/wordLibrary.js) 검증.
// 네트워크 0 — global.fetch를 이 파일이 완전히 통제하는 페이크로 교체하고
// (실제 서버에 단 1건도 나가지 않는다), localStorage도 페이크로 교체한다.
// wordLibrary.js 자체를 esbuild로 번들해서 실제 소스를 그대로 구동한다
// (scripts/buildWordLibBundle.mjs와 동일한 방식 — Vite의
// import.meta.env.VITE_*를 .env 값으로 치환, 로직 재구현/복붙 없음). 이
// 파일 전용 산출물(scripts/.tmp/wordLibrary.rewardQueue.bundle.mjs)을
// 독자적으로 생성해 다른 테스트의 공유 산출물과 충돌하지 않는다(CLAUDE.md
// 규칙 16).
//
// createClient(url, anonKey)는 네트워크를 직접 만들지 않는(생성자 호출)
// 라이브러리라 실제 .env 값으로 만들어도 이 파일이 supabase.* 쿼리를 한
// 번도 안 부르는 한 네트워크 0 원칙에 위배되지 않는다(scripts/
// buildWordLibBundle.mjs 기존 여러 테스트와 동일 전제).
import esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const TMP_DIR = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP_DIR, { recursive: true })

const env = fs.readFileSync('.env', 'utf8')
const url = (env.match(/VITE_SUPABASE_URL=(.*)/) || [, 'https://example.invalid'])[1].trim()
const key = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [, 'test-anon-key'])[1].trim()

const outfile = path.join(TMP_DIR, 'wordLibrary.rewardQueue.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
  },
})
console.log('bundled -> ' + outfile)

// ── 페이크 localStorage/fetch ────────────────────────────────────────────
class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}
globalThis.localStorage = new FakeStorage()
// setSessionToken이 온라인 리스너를 등록하는 typeof window 가드를 통과하되
// (실제 브라우저 동작 재현), 실제 이벤트 발화는 이 테스트가 쓰지 않으므로
// addEventListener/removeEventListener는 no-op으로 충분하다.
globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {} }
let fetchImpl = async () => { throw new Error('네트워크 금지 — 이 테스트가 fetchImpl을 설정하지 않고 postRewardEvent를 불렀다') }
globalThis.fetch = (...args) => fetchImpl(...args)

const lib = await import(pathToFileURL(outfile).href)
const {
  postRewardEvent, flushRewardPostQueue, setSessionToken, getSessionTokenForTest,
  __rewardQueueEnqueue, __rewardQueueRemove, __rewardQueueRegisterFailure,
  __rewardPostQueueForTest, __resetRewardPostQueueForTest,
  holdRewardPosts, rewardQueuePendingFor, postReconcileLegacyBaseline, __isRewardPostHeldForTest,
  drainRewardPostQueueForStudent,
} = lib
// 크로스탭 보류 키(2026-09-07 리뷰 수정) — wordLibrary.js는 이 이름을 export
// 하지 않는다(REWARD_POST_QUEUE_KEY와 동일한 관례, 모듈 내부 상수) — 테스트가
// "다른 탭"을 흉내낼 때 실제 소스와 동일한 문자열을 써야 하므로 여기 그대로
// 옮겨 적는다(실제 값은 src/utils/wordLibrary.js REWARD_POST_HOLD_KEY 참고).
const CROSS_TAB_HOLD_KEY = 'paul_easy_reward_post_hold'

let failures = 0
let asserted = 0
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

function jsonResponse(json, ok = true) {
  return { ok, json: async () => json }
}
function resetAll() {
  __resetRewardPostQueueForTest()
  setSessionToken(null)
  holdRewardPosts(false) // 이전 시나리오가 hold를 켠 채 끝났을 가능성 대비 — 항상 해제 상태로 시작
  fetchImpl = async () => { throw new Error('네트워크 금지 — fetchImpl 미설정') }
}
function keyFor(studentId, rewardType, sourceType, sourceId) {
  return `${studentId}:${rewardType}:${sourceType}:${sourceId}`
}
const flush = () => new Promise((r) => setImmediate(r))
const flushMacro = () => new Promise((r) => setTimeout(r, 0))

console.log('=== Reward Post 재시도 큐 — 정책 검증(네트워크 0) ===')

console.log('\n1. 순수 리듀서 — __rewardQueueEnqueue: 키 중복 시 idempotent(그대로)')
{
  const e1 = { key: 'a', studentId: 's', rewardType: 'pronunciation', sourceType: 'pronunciation', sourceId: 'x', attempts: 0, at: 1 }
  const e1dup = { ...e1, at: 999 } // 같은 key, 다른 payload로 재시도해도 기존 항목 유지
  let q = __rewardQueueEnqueue([], e1)
  check('첫 enqueue — 1건', q.length === 1)
  q = __rewardQueueEnqueue(q, e1dup)
  check('같은 key 재enqueue — 여전히 1건(idempotent)', q.length === 1)
  check('기존 항목 그대로 유지(at 덮어쓰지 않음)', q[0].at === 1)
}

console.log('\n2. 순수 리듀서 — __rewardQueueEnqueue: 최대 300건, 오래된 것부터 버림')
{
  let q = []
  for (let i = 0; i < 305; i++) q = __rewardQueueEnqueue(q, { key: `k${i}`, studentId: 's', rewardType: 'pronunciation', sourceType: 'pronunciation', sourceId: `x${i}`, attempts: 0, at: i })
  check('305건 enqueue 후 300건으로 트림', q.length === 300)
  check('가장 오래된 5건(k0~k4)이 버려짐', !q.some((e) => e.key === 'k0' || e.key === 'k4'))
  check('가장 최근 항목(k304)은 남아있음', q.some((e) => e.key === 'k304'))
}

console.log('\n3. 순수 리듀서 — __rewardQueueRemove: 해당 key만 제거')
{
  const q = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]
  const next = __rewardQueueRemove(q, 'b')
  check('제거 후 2건', next.length === 2)
  check('b만 제거됨', !next.some((e) => e.key === 'b') && next.some((e) => e.key === 'a') && next.some((e) => e.key === 'c'))
}

console.log('\n4. 순수 리듀서 — __rewardQueueRegisterFailure: attempts 증가, 8회째 드롭')
{
  let q = [{ key: 'a', attempts: 0 }]
  for (let i = 1; i <= 7; i++) {
    q = __rewardQueueRegisterFailure(q, 'a')
    check(`실패 ${i}회째 — 여전히 큐에 있음(attempts=${i})`, q.length === 1 && q[0].attempts === i)
  }
  q = __rewardQueueRegisterFailure(q, 'a') // 8번째 실패 → 포기
  check('실패 8회째(최대 시도 도달) — 큐에서 드롭', q.length === 0)
}

console.log('\n5. postRewardEvent — enqueue 후 성공(ok:true) → 큐에서 제거')
{
  resetAll()
  setSessionToken('tok-1')
  fetchImpl = async () => jsonResponse({ ok: true, duplicate: false, stars: 1 })
  await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', 'w1:date1')
  const q = __rewardPostQueueForTest()
  check('성공 후 큐 비어있음', q.length === 0)
}

console.log('\n6. postRewardEvent — ok:true, duplicate:true → 큐에서 제거(이미 처리된 것으로 간주)')
{
  resetAll()
  setSessionToken('tok-1')
  fetchImpl = async () => jsonResponse({ ok: true, duplicate: true, stars: 1 })
  await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', 'w1:date1')
  check('duplicate:true 후 큐 비어있음', __rewardPostQueueForTest().length === 0)
}

console.log('\n7. postRewardEvent — daily_cap_reached → 재시도 없이 큐에서 제거(서버가 확정적으로 거부)')
{
  resetAll()
  setSessionToken('tok-1')
  fetchImpl = async () => jsonResponse({ ok: false, reason: 'daily_cap_reached', cap: 60 })
  await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', 'w1:date1')
  check('daily_cap_reached 후 큐 비어있음(재시도 안 함)', __rewardPostQueueForTest().length === 0)
}

console.log('\n8. postRewardEvent — 확정적 거부 사유 6종 → 전부 큐에서 제거')
{
  const definitiveReasons = ['unknown_reward_type', 'invalid_reward_source', 'zero_reward', 'student_not_found', 'exam_result_not_found', 'invalid_student_id']
  for (const reason of definitiveReasons) {
    resetAll()
    setSessionToken('tok-1')
    fetchImpl = async () => jsonResponse({ ok: false, reason })
    await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', `w-${reason}`)
    check(`확정 거부(${reason}) 후 큐 비어있음`, __rewardPostQueueForTest().length === 0)
  }
}

console.log('\n9. postRewardEvent — 네트워크 실패(reject) → 큐에 남고 attempts 증가')
{
  resetAll()
  setSessionToken('tok-1')
  fetchImpl = async () => { throw new Error('simulated network failure') }
  await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', 'w1:date1')
  const q = __rewardPostQueueForTest()
  check('네트워크 실패 후 큐에 1건 유지', q.length === 1)
  check('attempts === 1', q[0] && q[0].attempts === 1)
  check('postRewardEvent가 reject하지 않음(await 통과, 위 라인에 도달)', true)
}

console.log('\n10. postRewardEvent — table_missing/unauthorized/dup_check_failed/cap_check_failed → 재시도 유지')
{
  const retryableReasons = ['table_missing', 'unauthorized', 'dup_check_failed', 'cap_check_failed']
  for (const reason of retryableReasons) {
    resetAll()
    setSessionToken('tok-1')
    fetchImpl = async () => jsonResponse({ ok: false, reason })
    await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', `w-${reason}`)
    const q = __rewardPostQueueForTest()
    check(`재시도 대상(${reason}) — 큐에 1건 유지`, q.length === 1)
  }
}

console.log('\n11. postRewardEvent — non-2xx(res.ok=false, JSON 없음) → 재시도 유지')
{
  resetAll()
  setSessionToken('tok-1')
  fetchImpl = async () => ({ ok: false, json: async () => { throw new Error('no body') } })
  await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', 'w-5xx')
  check('non-2xx 응답 — 큐에 1건 유지', __rewardPostQueueForTest().length === 1)
}

console.log('\n12. 8회 연속 실패 → 큐에서 드롭(포기)')
{
  resetAll()
  setSessionToken('tok-1')
  fetchImpl = async () => { throw new Error('always fail') }
  for (let i = 0; i < 8; i++) {
    await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', 'w-giveup')
  }
  check('8회 실패 후 큐 비어있음(포기)', __rewardPostQueueForTest().length === 0)
}

console.log('\n13. flushRewardPostQueue — 세션 토큰 없으면 아무 것도 안 함(no-op)')
{
  resetAll()
  // 토큰 설정 없이 큐에 실패 항목을 하나 만든다.
  fetchImpl = async () => { throw new Error('fail once') }
  setSessionToken('tok-temp')
  await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', 'w-noflush')
  setSessionToken(null) // 로그아웃 — 토큰 제거
  check('토큰 제거 후에도 큐엔 여전히 1건(실패로 인해 남아있던 것)', __rewardPostQueueForTest().length === 1)
  let calledWithoutToken = false
  fetchImpl = async () => { calledWithoutToken = true; return jsonResponse({ ok: true, duplicate: false, stars: 1 }) }
  await flushRewardPostQueue()
  check('토큰 없이 flush 호출 — fetch 자체가 안 나감(no-op)', calledWithoutToken === false)
  check('큐 여전히 1건(변화 없음)', __rewardPostQueueForTest().length === 1)
}

console.log('\n14. setSessionToken(비-null) — 큐를 흘려보낸다(flush 트리거)')
{
  resetAll()
  fetchImpl = async () => { throw new Error('fail once') }
  setSessionToken('tok-a')
  await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', 'w-relogin')
  check('실패로 큐에 1건', __rewardPostQueueForTest().length === 1)

  let flushed = false
  fetchImpl = async () => { flushed = true; return jsonResponse({ ok: true, duplicate: false, stars: 1 }) }
  setSessionToken('tok-b') // 재로그인/토큰 갱신 — setSessionToken 내부에서 flushRewardPostQueue() 호출
  await flush(); await flush()
  check('setSessionToken(비-null) 호출 시 큐가 흘러감(fetch 호출됨)', flushed === true)
  check('flush 성공 후 큐 비어있음', __rewardPostQueueForTest().length === 0)
}

console.log('\n15. flushRewardPostQueue — 여러 항목을 순차 처리, 성공/실패 항목 각각 다르게 반영')
{
  resetAll()
  setSessionToken('tok-a')
  fetchImpl = async () => { throw new Error('fail once') }
  await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', 'w-a')
  await postRewardEvent('stu-1', 'mission-clear', 'mission', 'w-b')
  check('두 항목 모두 실패로 큐에 남음', __rewardPostQueueForTest().length === 2)

  fetchImpl = async (u, opts) => {
    const body = JSON.parse(opts.body)
    if (body.sourceId === 'w-a') return jsonResponse({ ok: true, duplicate: false, stars: 1 })
    return jsonResponse({ ok: false, reason: 'table_missing' })
  }
  await flushRewardPostQueue()
  const q = __rewardPostQueueForTest()
  check('flush 후 — w-a는 제거(성공)', !q.some((e) => e.sourceId === 'w-a'))
  check('flush 후 — w-b는 유지(재시도 대상), attempts 증가', q.some((e) => e.sourceId === 'w-b' && e.attempts === 2))
}

console.log('\n16. localStorage 접근 실패 — throw 없이 조용히 무시')
{
  resetAll()
  setSessionToken('tok-a')
  fetchImpl = async () => jsonResponse({ ok: true, duplicate: false, stars: 1 })
  const realGetItem = globalThis.localStorage.getItem.bind(globalThis.localStorage)
  const realSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage)
  globalThis.localStorage.getItem = () => { throw new Error('storage explodes') }
  globalThis.localStorage.setItem = () => { throw new Error('storage explodes') }
  let threw = false
  try {
    await postRewardEvent('stu-1', 'pronunciation', 'pronunciation', 'w-storage-fail')
  } catch {
    threw = true
  }
  check('localStorage 접근 실패해도 postRewardEvent가 throw하지 않음', threw === false)
  globalThis.localStorage.getItem = realGetItem
  globalThis.localStorage.setItem = realSetItem
}

console.log('\n17. 정적 검사 — postRewardEvent/flushRewardPostQueue가 순수 리듀서 3종을 실제로 사용')
{
  const src = fs.readFileSync('src/utils/wordLibrary.js', 'utf8')
  const startIdx = src.indexOf('async function sendRewardPostOnce(')
  const endIdx = src.indexOf('export async function flushRewardPostQueue(')
  const region = (startIdx !== -1 && endIdx !== -1) ? src.slice(startIdx, endIdx + 2000) : ''
  check('sendRewardPostOnce~flushRewardPostQueue 구간 추출 성공', region.length > 0)
  check('__rewardQueueEnqueue 사용', region.includes('__rewardQueueEnqueue('))
  check('__rewardQueueRemove 사용', region.includes('__rewardQueueRemove('))
  check('__rewardQueueRegisterFailure 사용', region.includes('__rewardQueueRegisterFailure('))
  check('postRewardEvent가 readRewardPostQueue/writeRewardPostQueue로 localStorage를 감쌈(직접 localStorage.* 호출 없음)', !/postRewardEvent[\s\S]{0,400}?localStorage\./.test(src.slice(src.indexOf('export async function postRewardEvent('), src.indexOf('export async function postRewardEvent(') + 800)))
}

console.log('\n18. holdRewardPosts(true) — postRewardEvent가 큐잉은 하되(idempotent) 네트워크를 안 나감')
{
  resetAll()
  setSessionToken('tok-hold')
  let fetchCalled = false
  fetchImpl = async () => { fetchCalled = true; return jsonResponse({ ok: true, duplicate: false, stars: 1 }) }
  holdRewardPosts(true)
  check('__isRewardPostHeldForTest() === true', __isRewardPostHeldForTest() === true)
  await postRewardEvent('stu-hold', 'pronunciation', 'pronunciation', 'w-hold-1')
  check('보류 중 — fetch 호출 안 됨', fetchCalled === false)
  check('보류 중 — 큐에는 그대로 남음(idempotent 기록)', __rewardPostQueueForTest().some((e) => e.key === keyFor('stu-hold', 'pronunciation', 'pronunciation', 'w-hold-1')))

  // 같은 dedupKey로 재호출해도 여전히 1건(idempotent) — 네트워크는 여전히 0.
  await postRewardEvent('stu-hold', 'pronunciation', 'pronunciation', 'w-hold-1')
  check('보류 중 재호출 — 여전히 큐 1건, fetch 여전히 0회', fetchCalled === false && __rewardPostQueueForTest().length === 1)

  holdRewardPosts(false) // 정리 — 다음 섹션에 영향 없게 해제만(전송 여부는 다음 섹션에서 별도 검증)
  await flush(); await flush()
}

console.log('\n19. flushRewardPostQueue — 보류 중이면 즉시 반환(no-op), 해제 시 flush 트리거')
{
  resetAll()
  setSessionToken('tok-hold2')
  let fetchCallCount = 0
  fetchImpl = async () => { fetchCallCount++; return jsonResponse({ ok: true, duplicate: false, stars: 1 }) }
  holdRewardPosts(true)
  await postRewardEvent('stu-hold2', 'mission-clear', 'mission', 'w-hold-2')
  check('보류 중 postRewardEvent — fetch 0회', fetchCallCount === 0)
  await flushRewardPostQueue()
  check('보류 중 flushRewardPostQueue 명시 호출 — 여전히 fetch 0회(즉시 반환)', fetchCallCount === 0)
  check('보류 중 — 큐 1건 유지', __rewardPostQueueForTest().length === 1)

  holdRewardPosts(false) // release — 내부적으로 flushRewardPostQueue()를 fire-and-forget 트리거
  check('release 직후 __isRewardPostHeldForTest() === false', __isRewardPostHeldForTest() === false)
  await flush(); await flush(); await flushMacro()
  check('release 후 큐가 흘러가 fetch 1회 이상 호출됨', fetchCallCount >= 1)
  check('release 후 큐 비어있음(전송 성공)', __rewardPostQueueForTest().length === 0)
}

console.log('\n20. rewardQueuePendingFor — studentId별 필터링, 순수 조회(큐 변형 없음)')
{
  resetAll()
  setSessionToken('tok-pending')
  fetchImpl = async () => { throw new Error('실패 유도 — 큐에 남겨야 함') }
  await postRewardEvent('stu-a', 'pronunciation', 'pronunciation', 'w-a1')
  await postRewardEvent('stu-a', 'mission-clear', 'mission', 'w-a2')
  await postRewardEvent('stu-b', 'pronunciation', 'pronunciation', 'w-b1')
  check('큐에 3건(두 학생 합계)', __rewardPostQueueForTest().length === 3)
  check('rewardQueuePendingFor(stu-a) === 2', rewardQueuePendingFor('stu-a') === 2)
  check('rewardQueuePendingFor(stu-b) === 1', rewardQueuePendingFor('stu-b') === 1)
  check('rewardQueuePendingFor(stu-c, 큐에 없는 학생) === 0', rewardQueuePendingFor('stu-c') === 0)
  check('rewardQueuePendingFor(null/undefined) === 0(방어)', rewardQueuePendingFor(null) === 0 && rewardQueuePendingFor(undefined) === 0)
  check('rewardQueuePendingFor 호출 후에도 큐 그대로(순수 조회, 변형 없음)', __rewardPostQueueForTest().length === 3)
}

console.log('\n21. postReconcileLegacyBaseline — 토큰 없으면 네트워크 없이 relogin_required, 있으면 studentId를 절대 안 보냄')
{
  resetAll()
  // 토큰 없음 — 네트워크 호출 자체가 나가면 안 됨(fetchImpl이 throw하도록 남겨둠, resetAll 기본값).
  const res1 = await postReconcileLegacyBaseline(300)
  check('토큰 없음 — { ok:false, reason:"relogin_required" }', res1 && res1.ok === false && res1.reason === 'relogin_required')

  setSessionToken('tok-reconcile')
  let capturedBody = null
  fetchImpl = async (url, opts) => {
    capturedBody = JSON.parse(opts.body)
    return jsonResponse({ ok: true, reason: 'reconciled', baselineStars: 300, earnedAfter: 0 })
  }
  const res2 = await postReconcileLegacyBaseline(300.7) // 소수 입력 — 방어적으로 내림 처리되는지 확인
  check('토큰 있음 — 서버 응답 그대로 반환', res2 && res2.ok === true && res2.reason === 'reconciled')
  check('요청 바디에 action:"reconcile_legacy_baseline"', capturedBody && capturedBody.action === 'reconcile_legacy_baseline')
  check('요청 바디에 token 포함', capturedBody && capturedBody.token === 'tok-reconcile')
  check('요청 바디에 studentId 필드 자체가 없음(서버는 token으로만 식별)', capturedBody && !('studentId' in capturedBody))
  check('snapshotTotal이 방어적으로 정수/음수아님(300.7 -> 300)', capturedBody && capturedBody.snapshotTotal === 300)

  // 음수/NaN 방어.
  const res3 = await postReconcileLegacyBaseline(-5)
  check('음수 입력도 0 이상으로 방어(capturedBody.snapshotTotal===0)', capturedBody && capturedBody.snapshotTotal === 0)
  const res4 = await postReconcileLegacyBaseline(NaN)
  check('NaN 입력도 0으로 방어', capturedBody && capturedBody.snapshotTotal === 0)
  check('res3/res4 정상 응답 형태 유지(throw 없음)', res3 && res4 && typeof res3.ok === 'boolean' && typeof res4.ok === 'boolean')

  // 네트워크 실패 — throw 없이 network_failed로 흡수.
  fetchImpl = async () => { throw new Error('simulated network failure') }
  const res5 = await postReconcileLegacyBaseline(10)
  check('네트워크 실패 — { ok:false, reason:"network_failed" }', res5 && res5.ok === false && res5.reason === 'network_failed')
}

console.log('\n22. drainRewardPostQueueForStudent — hold을 무시하고 "이 학생" 몫만 전송, ack 대기, 다른 학생/실패 항목은 그대로')
{
  resetAll()
  setSessionToken('tok-drain')
  await postRewardEvent('stu-drain-a', 'pronunciation', 'pronunciation', 'w-a1') // 네트워크 금지 상태라 실패 -> 큐에 남음
  fetchImpl = async () => { throw new Error('여전히 실패') }
  await postRewardEvent('stu-drain-a', 'mission-clear', 'mission', 'w-a2')
  await postRewardEvent('stu-drain-b', 'pronunciation', 'pronunciation', 'w-b1')
  check('사전조건 — 큐에 3건(두 학생)', __rewardPostQueueForTest().length === 3)

  holdRewardPosts(true) // 보류 중에도 drain은 무시하고 동작해야 함
  let callCount = 0
  fetchImpl = async (url, opts) => {
    callCount++
    const body = JSON.parse(opts.body)
    if (body.sourceId === 'w-a2') return jsonResponse({ ok: false, reason: 'table_missing' }) // 이 항목만 실패 유지
    return jsonResponse({ ok: true, duplicate: false, stars: 1 })
  }
  const result = await drainRewardPostQueueForStudent('stu-drain-a')
  check('보류 중에도 drain은 네트워크를 실제로 보냄(hold 무시)', callCount === 2) // stu-drain-a의 w-a1, w-a2만
  check('sent === 1(w-a1만 성공)', result.sent === 1)
  check('remaining === 1(w-a2는 여전히 실패)', result.remaining === 1)
  const qAfter = __rewardPostQueueForTest()
  check('stu-drain-a의 w-a1은 큐에서 제거됨', !qAfter.some((e) => e.sourceId === 'w-a1'))
  // w-a1/w-a2/w-b1 모두 hold 이전(사전조건 단계)에 이미 1번씩 실패해
  // attempts=1로 큐에 들어가 있었다 — drain은 stu-drain-a 몫(w-a1/w-a2)만
  // 처리하므로 w-a2는 이번 실패로 2가 되고, w-b1(다른 학생)은 drain이
  // 건드리지 않아 1 그대로다.
  check('stu-drain-a의 w-a2는 여전히 큐에 있고 attempts 증가(1->2)', qAfter.some((e) => e.sourceId === 'w-a2' && e.attempts === 2))
  check('stu-drain-b(다른 학생) 항목은 전혀 건드리지 않음(attempts 그대로 1)', qAfter.some((e) => e.sourceId === 'w-b1' && e.attempts === 1))
  check('rewardQueuePendingFor(stu-drain-a) === drain 반환값과 일치', rewardQueuePendingFor('stu-drain-a') === result.remaining)
  holdRewardPosts(false)
  await flush(); await flush()
}

console.log('\n23. drainRewardPostQueueForStudent — 대상 학생 몫이 없으면(빈 큐) sent:0, remaining:0')
{
  resetAll()
  const result = await drainRewardPostQueueForStudent('stu-nothing-pending')
  check('빈 큐 — sent === 0', result.sent === 0)
  check('빈 큐 — remaining === 0', result.remaining === 0)
  check('studentId 없이 호출해도 안전(0,0), throw 없음', JSON.stringify(await drainRewardPostQueueForStudent(null)) === JSON.stringify({ sent: 0, remaining: 0 }))
}

console.log('\n24. 크로스탭 보류 — 다른 탭이 켠 hold 키(만료 전)는 이 탭의 postRewardEvent/flushRewardPostQueue도 막는다')
{
  resetAll()
  setSessionToken('tok-crosstab')
  // "다른 탭"이 방금 holdRewardPosts(true)를 부른 것처럼 키를 직접 심는다
  // (이 프로세스 안에서는 같은 모듈 인스턴스라 _rewardPostHold 자체는 false
  // 로 유지되지만, 실제 크로스탭 시나리오에서는 다른 탭의 JS 힙이라 그
  // 플래그를 볼 수 없다 — 그래서 localStorage 키만으로 검증한다).
  globalThis.localStorage.setItem(CROSS_TAB_HOLD_KEY, JSON.stringify({ until: Date.now() + 30000 }))
  check('이 탭 자신의 hold 플래그는 꺼져있음(진짜 크로스탭 재현)', __isRewardPostHeldForTest() === false)

  let fetchCalled = false
  fetchImpl = async () => { fetchCalled = true; return jsonResponse({ ok: true, duplicate: false, stars: 1 }) }
  await postRewardEvent('stu-crosstab', 'pronunciation', 'pronunciation', 'w-crosstab-1')
  check('크로스탭 hold 활성 — postRewardEvent가 네트워크를 보내지 않음', fetchCalled === false)
  check('그래도 큐에는 남음(idempotent 기록)', __rewardPostQueueForTest().some((e) => e.sourceId === 'w-crosstab-1'))

  await flushRewardPostQueue()
  check('크로스탭 hold 활성 — flushRewardPostQueue도 즉시 반환(no-op)', fetchCalled === false)

  // 만료된 키(과거 시각) — 더 이상 보류로 취급하지 않음(크래시 탭이 영원히 막지 않게).
  globalThis.localStorage.setItem(CROSS_TAB_HOLD_KEY, JSON.stringify({ until: Date.now() - 1000 }))
  await postRewardEvent('stu-crosstab', 'mission-clear', 'mission', 'w-crosstab-2')
  check('만료된 크로스탭 키 — 정상 전송됨', fetchCalled === true)

  globalThis.localStorage.removeItem(CROSS_TAB_HOLD_KEY)
}

console.log('\n25. holdRewardPosts(true/false) — 크로스탭 키를 실제로 쓰고 지운다(같은 프로세스 내 자기 확인)')
{
  resetAll()
  check('사전 — 크로스탭 키 없음', globalThis.localStorage.getItem(CROSS_TAB_HOLD_KEY) === null)
  holdRewardPosts(true)
  const raw = globalThis.localStorage.getItem(CROSS_TAB_HOLD_KEY)
  check('holdRewardPosts(true) — 크로스탭 키 기록됨', raw !== null)
  const parsed = JSON.parse(raw)
  check('until이 미래 시각(대략 30초 이내)', typeof parsed.until === 'number' && parsed.until > Date.now() && parsed.until <= Date.now() + 30000)
  holdRewardPosts(false)
  await flush(); await flush()
  check('holdRewardPosts(false) — 크로스탭 키 삭제됨', globalThis.localStorage.getItem(CROSS_TAB_HOLD_KEY) === null)
}

console.log('\n─── 결과 요약 ───')
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0
  ? '\n모든 단언 통과 — Reward Post 재시도 큐 정책 확인 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
