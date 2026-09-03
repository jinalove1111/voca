// scripts/testRewardTypesV2.mjs
//
// P4(유닛 완료 보상)/P5(오답 복습·마스터 보상 강화) — 신규 보상 타입 3종의
// 계약 고정. docs/REWARD_LOOP_AUDIT_2026-09-03.md §2~4가 지적한 갭
// ("Unit 완료 보상 이벤트 없음", "회상/숙달을 보상하라") 해소.
//
// 신규 타입 3종(운영자 지정값, CLAUDE.md 규칙 3 — 기존 타입 금액/규칙/상한은
// 절대 변경하지 않는다, GAME_REWARD_RULES.md 동결 원칙):
//   1) unit-complete         — +5별, sourceType 'unit', pattern 'uuid'(unitId),
//      일일상한 2, 학생당 unitId 1회 평생(idempotency_key에 날짜 없음 — 유닛
//      완료는 반복되는 하루 목표(daily-goal-complete=3)보다 크게 느껴져야
//      하지만 유닛 개수가 유한하므로 인플레 걱정 없음).
//   2) word-mastered         — +1별, sourceType 'spelling-review-mastery',
//      신규 pattern 'token'(날짜 접두 없는 단어 토큰 — 기존 'date:token'의
//      날짜 부분만 뺀 형태), 일일상한 60, 학생당 wordId 1회 평생 —
//      "wrong-word-recovered"(하루 단위 동결, 최대 60건/일)의 평생 버전
//      anti-farming 짝. 오답 하나를 그날 회복하는 것과, 그 단어를 완전히
//      "마스터"(연속 정답 등 오답큐 완전 이탈)하는 것을 별개 이벤트로 취급.
//   3) review-session-bonus  — +2별, sourceType 'daily-review', pattern
//      'date', 일일상한 1 — 하루에 복습 세션 하나를 완주하면 딱 1회.
//
// docs/REWARD_LOOP_AUDIT_2026-09-03.md §2 표의 기존 6개 항목(REWARD_STARS/
// REWARD_SOURCE_RULES/REWARD_DAILY_CAP)은 이 파일이 스냅샷으로 고정해
// "동결 가드"로 삼는다 — 이 3개 상수 객체에 새 키를 추가하는 건 허용되지만
// 기존 키의 값을 바꾸면 이 파일이 FAIL한다.
//
// 구성: 1부(엔진, 순수 함수) + 2부(서버 행위, 가짜 인메모리 Supabase —
// scripts/testRewardServerHardeningBehavior.mjs의 기법을 재사용해 별도
// 이름으로 scripts/.tmp/에 생성, production 네트워크 0).
//
// CLAUDE.md 규칙 15(FAIL-first) 실측 기록: 이 테스트를 rewardEngine.js에
// 신규 타입 3개를 추가하기 *전* 원본 상태로 먼저 1회 실행해 몇 개가 FAIL
// 하는지 확인했다(최종 보고에 원문 기록) — REWARD_STARS/REWARD_SOURCE_RULES/
// REWARD_DAILY_CAP에 unit-complete/word-mastered/review-session-bonus 키
// 자체가 없어 관련 단언이 전부 FAIL, 'token' 패턴 분기도 없어 관련 단언도
// FAIL이었다. 이후 rewardEngine.js를 구현해 전체 PASS로 전환했다.
//
// 등록 전(사람이 package.json에 verify:reward-types-v2 등록 필요 — 이
// 파일은 implementer 소유 범위 밖인 package.json은 건드리지 않는다).
import esbuild from 'esbuild'
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  REWARD_STARS, REWARD_SOURCE_RULES, REWARD_DAILY_CAP,
  isValidRewardType, isValidRewardSource, resolveRewardStars,
  rewardIdempotencyKey, rewardDailyCap,
} from '../src/utils/rewardEngine.js'

let failures = 0, asserted = 0
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const FIXED_DATE = 'Sat Aug 15 2026'
const UNIT_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const UNIT_B = '11111111-1111-4111-8111-111111111111'
const UNIT_C = '22222222-2222-4222-8222-222222222222'

// ── 1부: 엔진(순수 함수) ─────────────────────────────────────────────────
console.log('\n1. REWARD_STARS — 신규 3종 금액')
{
  check('unit-complete = 5', REWARD_STARS['unit-complete'] === 5)
  check('word-mastered = 1', REWARD_STARS['word-mastered'] === 1)
  check('review-session-bonus = 2', REWARD_STARS['review-session-bonus'] === 2)
}

console.log('\n2. isValidRewardType — 신규 3종 true / 미지 타입 false')
{
  check("isValidRewardType('unit-complete') === true", isValidRewardType('unit-complete') === true)
  check("isValidRewardType('word-mastered') === true", isValidRewardType('word-mastered') === true)
  check("isValidRewardType('review-session-bonus') === true", isValidRewardType('review-session-bonus') === true)
  check("isValidRewardType('made-up-reward-type') === false", isValidRewardType('made-up-reward-type') === false)
}

console.log('\n3. isValidRewardSource — unit-complete(uuid)')
{
  check('정상 uuid -> true', isValidRewardSource('unit-complete', 'unit', UNIT_A) === true)
  check('비-uuid -> false', isValidRewardSource('unit-complete', 'unit', 'not-a-uuid') === false)
  check('sourceType 뒤바꿈 -> false', isValidRewardSource('unit-complete', 'daily-review', UNIT_A) === false)
}

console.log("\n4. isValidRewardSource — word-mastered(신규 'token' 패턴, 날짜 접두 없음)")
{
  check("정상 단어 토큰 -> true", isValidRewardSource('word-mastered', 'spelling-review-mastery', 'word_42-A') === true)
  check("'date:token' 형태(날짜 접두 붙임)는 거부 -> false", isValidRewardSource('word-mastered', 'spelling-review-mastery', `${FIXED_DATE}:word_42`) === false)
  check('빈 문자열 -> false', isValidRewardSource('word-mastered', 'spelling-review-mastery', '') === false)
  check('64자 초과 토큰 -> false', isValidRewardSource('word-mastered', 'spelling-review-mastery', 'a'.repeat(65)) === false)
  check('sourceType 뒤바꿈 -> false', isValidRewardSource('word-mastered', 'unit', 'word_42') === false)
}

console.log('\n5. isValidRewardSource — review-session-bonus(date)')
{
  check('정상 날짜 -> true', isValidRewardSource('review-session-bonus', 'daily-review', FIXED_DATE) === true)
  check('날짜 위조 -> false', isValidRewardSource('review-session-bonus', 'daily-review', 'not-a-date') === false)
  check('sourceType 뒤바꿈 -> false', isValidRewardSource('review-session-bonus', 'unit', FIXED_DATE) === false)
}

console.log('\n6. rewardIdempotencyKey — unit-complete/word-mastered 키에 날짜 없음(평생 1회)')
{
  const k1 = rewardIdempotencyKey('stu-1', 'unit-complete', 'unit', UNIT_A)
  check('unit-complete 키 형식 정확히 studentId:rewardType:sourceType:unitId', k1 === `stu-1:unit-complete:unit:${UNIT_A}`)
  check('unit-complete 키에 날짜 토큰 없음', !/[A-Za-z]{3} [A-Za-z]{3} \d{2} \d{4}/.test(k1))

  const k2 = rewardIdempotencyKey('stu-1', 'word-mastered', 'spelling-review-mastery', 'word_42-A')
  check('word-mastered 키 형식 정확히 studentId:rewardType:sourceType:wordToken', k2 === 'stu-1:word-mastered:spelling-review-mastery:word_42-A')
  check('word-mastered 키에 날짜 토큰 없음', !/[A-Za-z]{3} [A-Za-z]{3} \d{2} \d{4}/.test(k2))

  const k3 = rewardIdempotencyKey('stu-1', 'review-session-bonus', 'daily-review', FIXED_DATE)
  check('review-session-bonus 키에는 날짜가 포함됨(하루 1회 상한과 짝)', k3.includes(FIXED_DATE))
}

console.log('\n7. rewardDailyCap / resolveRewardStars — 신규 3종')
{
  check('unit-complete 일일상한 2', rewardDailyCap('unit-complete') === 2)
  check('word-mastered 일일상한 60', rewardDailyCap('word-mastered') === 60)
  check('review-session-bonus 일일상한 1', rewardDailyCap('review-session-bonus') === 1)
  check('resolveRewardStars(unit-complete) = 5', resolveRewardStars('unit-complete') === 5)
  check('resolveRewardStars(word-mastered) = 1', resolveRewardStars('word-mastered') === 1)
  check('resolveRewardStars(review-session-bonus) = 2', resolveRewardStars('review-session-bonus') === 2)
}

console.log('\n8. 동결 가드 — 기존 6개 타입의 REWARD_STARS/REWARD_SOURCE_RULES/REWARD_DAILY_CAP 무변경')
{
  const FROZEN_STARS = {
    'word-session-complete': 1, 'writing-complete': 2, 'exam-complete': 2,
    'wrong-word-recovered': 1, 'daily-goal-complete': 3, 'streak-bonus': 0, 'legacy-baseline': 0,
  }
  check('REWARD_STARS 기존 7개 키 값 전부 동일', Object.entries(FROZEN_STARS).every(([k, v]) => REWARD_STARS[k] === v))

  const FROZEN_RULES = {
    'word-session-complete': { sourceType: 'daily-words', pattern: 'date' },
    'writing-complete': { sourceType: 'daily-writing', pattern: 'date' },
    'exam-complete': { sourceType: 'entrance-test', pattern: 'uuid' },
    'wrong-word-recovered': { sourceType: 'spelling-review', pattern: 'date:token' },
    'daily-goal-complete': { sourceType: 'daily-goal', pattern: 'date' },
    'streak-bonus': { sourceType: 'streak', pattern: 'date:streak' },
  }
  check('REWARD_SOURCE_RULES 기존 6개 규칙 전부 동일',
    Object.entries(FROZEN_RULES).every(([k, v]) => REWARD_SOURCE_RULES[k]
      && REWARD_SOURCE_RULES[k].sourceType === v.sourceType
      && REWARD_SOURCE_RULES[k].pattern === v.pattern))

  const FROZEN_CAP = {
    'word-session-complete': 1, 'writing-complete': 1, 'exam-complete': 10,
    'wrong-word-recovered': 60, 'daily-goal-complete': 1, 'streak-bonus': 1,
  }
  check('REWARD_DAILY_CAP 기존 6개 키 값 전부 동일', Object.entries(FROZEN_CAP).every(([k, v]) => REWARD_DAILY_CAP[k] === v))
}

// ── 2부: 서버 행위(가짜 인메모리 Supabase) ─────────────────────────────
// scripts/testRewardServerHardeningBehavior.mjs와 같은 기법이지만 이 파일
// 전용으로 별도 이름의 산출물을 scripts/.tmp/에 새로 생성한다(다른 테스트가
// 동시에 같은 파일을 쓰지 않도록).
const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

const fakePath = path.join(TMP, 'fakeSupabaseForRewardTypesV2.mjs')
fs.writeFileSync(fakePath, `// AUTO-GENERATED by scripts/testRewardTypesV2.mjs
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
const fakePinAuthPath = path.join(TMP, 'fakePinAuthForRewardTypesV2.mjs')
fs.writeFileSync(fakePinAuthPath,
  `export const supabaseAdminUrl = () => 'https://fake.supabase.co'
export const supabaseAdminKey = () => 'fake-service-role-key'
export { signSessionToken, verifySessionToken, SESSION_TOKEN_TTL_MS } from ${JSON.stringify(realPinAuth)}
`, 'utf8')
const fakePinAuthUrl = pathToFileURL(fakePinAuthPath).href

const outfile = path.join(TMP, 'grantXp.typesV2.bundle.mjs')
await esbuild.build({
  entryPoints: ['api/grant-xp.js'],
  bundle: true, format: 'esm', platform: 'node', outfile,
  plugins: [{
    name: 'fake-supabase-types-v2',
    setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: fakeUrl, external: true }))
      b.onResolve({ filter: /_pinAuth\.js$/ }, () => ({ path: fakePinAuthUrl, external: true }))
    },
  }],
})

const fake = await import(fakeUrl)
const handler = (await import(pathToFileURL(outfile).href)).default

process.env.SESSION_SECRET = 'reward-types-v2-test-secret'
const { signSessionToken } = await import('../api/_pinAuth.js')

const STUDENT = '11111111-2222-4333-8444-555555555555'

function res() {
  const r = { code: null, body: null }
  r.status = (c) => { r.code = c; return r }
  r.json = (b) => { r.body = b; return r }
  return r
}
const tokenFor = (sid) => signSessionToken(sid)
const post = (body) => {
  const withAuth = (body && body.ledger === 'reward' && body.token === undefined && body.studentId)
    ? { ...body, token: tokenFor(body.studentId) }
    : body
  const r = res(); return handler({ method: 'POST', body: withAuth, headers: {} }, r).then(() => r)
}
function seed() {
  fake.__reset()
  fake.__db.students.push({ id: STUDENT })
}
const ledger = () => fake.__db.reward_ledger

console.log('\n9. 서버 — unit-complete: 같은 unitId 2회 -> 1건 + duplicate:true')
{
  seed()
  const body = { ledger: 'reward', studentId: STUDENT, rewardType: 'unit-complete', sourceType: 'unit', sourceId: UNIT_A }
  const r1 = await post(body)
  const r2 = await post(body)
  check('1회차 성공(duplicate:false)', r1.body?.ok === true && r1.body?.duplicate === false)
  check('2회차 duplicate:true', r2.body?.ok === true && r2.body?.duplicate === true)
  check('원장 1건', ledger().length === 1)
  check('지급액 5별(서버 결정)', ledger()[0]?.stars_delta === 5)
}

console.log('\n10. 서버 — unit-complete: 서로 다른 unitId 2개 -> 각각 지급(2건)')
{
  seed()
  const rA = await post({ ledger: 'reward', studentId: STUDENT, rewardType: 'unit-complete', sourceType: 'unit', sourceId: UNIT_A })
  const rB = await post({ ledger: 'reward', studentId: STUDENT, rewardType: 'unit-complete', sourceType: 'unit', sourceId: UNIT_B })
  check('unitA 성공', rA.body?.ok === true)
  check('unitB 성공', rB.body?.ok === true)
  check('원장 2건', ledger().length === 2)
}

console.log('\n11. 서버 — unit-complete: 같은 날 세 번째 unitId -> 일일상한(2) 초과 거부')
{
  seed()
  await post({ ledger: 'reward', studentId: STUDENT, rewardType: 'unit-complete', sourceType: 'unit', sourceId: UNIT_A })
  await post({ ledger: 'reward', studentId: STUDENT, rewardType: 'unit-complete', sourceType: 'unit', sourceId: UNIT_B })
  const rC = await post({ ledger: 'reward', studentId: STUDENT, rewardType: 'unit-complete', sourceType: 'unit', sourceId: UNIT_C })
  check('세 번째 unitId -> daily_cap_reached', rC.body?.ok === false && rC.body?.reason === 'daily_cap_reached')
  check('원장은 여전히 2건(3번째는 기록 안 됨)', ledger().length === 2)
}

console.log('\n12. 서버 — unit-complete: 형식 위조 unitId(uuid 아님) -> 거부')
{
  seed()
  const r = await post({ ledger: 'reward', studentId: STUDENT, rewardType: 'unit-complete', sourceType: 'unit', sourceId: 'not-a-uuid' })
  check("malformed unitId -> ok:false invalid_reward_source", r.body?.ok === false && r.body?.reason === 'invalid_reward_source')
  check('원장 0건', ledger().length === 0)
}

console.log('\n13. 서버 — word-mastered: 같은 wordId를 서로 다른 "날짜"에 2회 -> 1건(평생 1회)')
{
  seed()
  const body1 = { ledger: 'reward', studentId: STUDENT, rewardType: 'word-mastered', sourceType: 'spelling-review-mastery', sourceId: 'apple' }
  const day1 = await post(body1)
  // 같은 요청을 "다음날"에 다시 보내는 상황을 흉내(idempotency_key에 날짜가
  // 없으므로 서버 로직은 날짜와 무관하게 항상 같은 키로 판정 — 실제로 Date를
  // 조작할 필요 없이 같은 body를 다시 보내는 것 자체가 이 계약의 증명이다).
  const day2 = await post(body1)
  check('1회차 성공', day1.body?.ok === true && day1.body?.duplicate === false)
  check('2회차(다른 날 흉내) duplicate:true', day2.body?.ok === true && day2.body?.duplicate === true)
  check('원장 1건(평생 1회)', ledger().length === 1)
}

console.log('\n14. 서버 — review-session-bonus: 같은 날짜 2회 -> 1건')
{
  seed()
  const today = new Date().toDateString()
  const body = { ledger: 'reward', studentId: STUDENT, rewardType: 'review-session-bonus', sourceType: 'daily-review', sourceId: today }
  const r1 = await post(body)
  const r2 = await post(body)
  check('1회차 성공', r1.body?.ok === true && r1.body?.duplicate === false)
  check('2회차 duplicate:true', r2.body?.ok === true && r2.body?.duplicate === true)
  check('원장 1건', ledger().length === 1)
  check('지급액 2별', ledger()[0]?.stars_delta === 2)
}

console.log('\n15. 서버 — 금액은 항상 서버 권위(클라이언트가 보낸 stars 필드는 무시됨)')
{
  seed()
  const forgedStars = 9999
  const r = await post({ ledger: 'reward', studentId: STUDENT, rewardType: 'unit-complete', sourceType: 'unit', sourceId: UNIT_A, stars: forgedStars, starsDelta: forgedStars })
  check('응답 stars === resolveRewardStars(unit-complete)(5), 클라이언트 위조값(9999) 무시', r.body?.stars === resolveRewardStars('unit-complete') && r.body?.stars !== forgedStars)
  check('원장 stars_delta도 5(클라이언트 위조값 아님)', ledger()[0]?.stars_delta === 5)
}

console.log('\n16. 서버 — 동시 10회 동일 요청(unit-complete) -> 원장 1건(Promise.all)')
{
  seed()
  const body = { ledger: 'reward', studentId: STUDENT, rewardType: 'unit-complete', sourceType: 'unit', sourceId: UNIT_A }
  await Promise.all(Array.from({ length: 10 }, () => post(body)))
  check('동시 10회 -> 원장 1건', ledger().length === 1)
  check('지급액 5별 1회분(중복 누적 아님)', ledger().reduce((a, r) => a + r.stars_delta, 0) === 5)
}

console.log(`\n총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0
  ? '\n모든 단언 통과 — unit-complete/word-mastered/review-session-bonus 계약 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
