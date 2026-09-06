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
} = lib

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
  fetchImpl = async () => { throw new Error('네트워크 금지 — fetchImpl 미설정') }
}
function keyFor(studentId, rewardType, sourceType, sourceId) {
  return `${studentId}:${rewardType}:${sourceType}:${sourceId}`
}
const flush = () => new Promise((r) => setImmediate(r))

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

console.log('\n─── 결과 요약 ───')
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0
  ? '\n모든 단언 통과 — Reward Post 재시도 큐 정책 확인 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
