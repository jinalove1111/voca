// scripts/testMasteryReward.mjs — P5 "복습/숙달 보상 강화"(2026-09-03,
// docs/REWARD_LOOP_AUDIT_2026-09-03.md §14) FAIL-first 계약 테스트.
//
// scripts/testUnitCompleteReward.mjs와 같은 번들(scripts/buildUnitCompleteBundle.mjs
// 산출물)과 기법을 그대로 재사용한다(CLAUDE.md 규칙 3) — flag masteryReward를
// localStorage 프리시드 + 매 시나리오 cache-busted import로 제어.
//
// 실행:
//   node scripts/buildUnitCompleteBundle.mjs && node scripts/testMasteryReward.mjs
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createFakeClock, renderHook } from './fakeReact.mjs'

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
}

async function mount(id, name, { featureOverrides, seedRecord } = {}) {
  freshEnv(featureOverrides, seedRecord, id)
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

function baseRound(today) {
  return { date: today, wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, pronunciationOkWordIds: [], spellingWrongToday: [], spellingCombo: 0, starGrantLog: [], completedToday: [] }
}

// todayStr()(useStudent.js)와 정확히 같은 계산 — round.date를 실제 "오늘"과
// 맞춰 시딩해야 round 리셋 effect가 seed 직후 즉시 개입하지 않는다
// (testRewardFlow.mjs 테스트 7의 시딩 패턴과 동일).
const TODAY = new Date().toDateString()

// ── 1) flag OFF — wrong-word-recovered만, word-mastered/review-session-bonus 없음 ──
console.log('\n1. flag masteryReward OFF — 레거시 wrong-word-recovered만, 신규 앵커 없음')
{
  const ID = '33333333-0000-0000-0000-000000000001'
  const { host } = await mount(ID, 'QA_Mastery_Off', {
    featureOverrides: { masteryReward: false },
    seedRecord: { studentId: ID, totalStars: 0, round: baseRound(TODAY), spellingReviewQueue: ['w1'], history: {} },
  })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  host.result.clearSpellingReviewWord('w1')
  settle(host)
  check('flag OFF — wrong-word-recovered 1건(레거시 그대로)', ledgerCount(host, 'wrong-word-recovered', (id) => id.endsWith(':w1')) === 1)
  check('flag OFF — word-mastered 0건', ledgerCount(host, 'word-mastered') === 0)
  check('flag OFF — totalStars === before + 1(레거시 +1만)', host.result.stars === before + 1)
}

// ── 2) flag ON — day1 fail→pass → wrong-word-recovered + word-mastered ──
console.log('\n2. flag ON — day1 회복 → wrong-word-recovered(+1) + word-mastered(+1) 둘 다')
{
  const ID = '33333333-0000-0000-0000-000000000002'
  const { host } = await mount(ID, 'QA_Mastery_On1', {
    featureOverrides: { masteryReward: true },
    seedRecord: { studentId: ID, totalStars: 0, round: baseRound(TODAY), spellingReviewQueue: ['w2'], history: {} },
  })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  host.result.clearSpellingReviewWord('w2')
  settle(host)
  check('day1 — wrong-word-recovered 1건', ledgerCount(host, 'wrong-word-recovered', (id) => id.endsWith(':w2')) === 1)
  check('day1 — word-mastered 1건', ledgerCount(host, 'word-mastered', (id) => id === 'w2') === 1)
  const masteredEntry = ledgerArr(host).find((e) => e.reward_type === 'word-mastered')
  check('word-mastered idempotency_key === `${sid}:word-mastered:spelling-review-mastery:${wordId}`(날짜 없음)', masteredEntry && masteredEntry.idempotency_key === `${ID}:word-mastered:spelling-review-mastery:w2`)
  check('totalStars === before + 2(wrong-word-recovered 1 + word-mastered 1)', host.result.stars === before + 2)
}

// ── 3) flag ON — day2 같은 단어 재회복 → wrong-word-recovered는 다시, word-mastered는 재지급 없음 ──
console.log('\n3. flag ON — day2 같은 단어 재회복 → wrong-word-recovered 재지급, word-mastered는 평생 1회라 재지급 없음')
{
  const ID = '33333333-0000-0000-0000-000000000003'
  const yesterday = 'Mon Jan 01 2024' // todayStr() 형식과 다른 임의의 과거 날짜 토큰(day1 시뮬레이션)
  const sharedKey = `${ID}:word-mastered:spelling-review-mastery:w3`
  const day1Ledger = [{
    id: `${ID}:wrong-word-recovered:spelling-review:${yesterday}:w3`,
    reward_type: 'wrong-word-recovered', source_type: 'spelling-review', source_id: `${yesterday}:w3`,
    stars_delta: 1, xp_delta: 0, idempotency_key: `${ID}:wrong-word-recovered:spelling-review:${yesterday}:w3`, created_at: '2024-01-01T00:00:00.000Z',
  }, {
    id: sharedKey, reward_type: 'word-mastered', source_type: 'spelling-review-mastery', source_id: 'w3',
    stars_delta: 1, xp_delta: 0, idempotency_key: sharedKey, created_at: '2024-01-01T00:00:00.000Z',
  }]
  const { host } = await mount(ID, 'QA_Mastery_Day2', {
    featureOverrides: { masteryReward: true },
    seedRecord: { studentId: ID, totalStars: 2, round: baseRound(TODAY), spellingReviewQueue: ['w3'], history: {}, rewardLedger: day1Ledger },
  })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  host.result.clearSpellingReviewWord('w3')
  settle(host)
  check('day2 — wrong-word-recovered 새 항목 1건 추가(오늘 날짜 키라 어제와 다름)', ledgerCount(host, 'wrong-word-recovered', (id) => id.endsWith(':w3')) === 2)
  check('day2 — word-mastered는 여전히 정확히 1건(평생 1회, 재지급 없음)', ledgerCount(host, 'word-mastered', (id) => id === 'w3') === 1)
  check('day2 — totalStars === before + 1(wrong-word-recovered만, word-mastered는 재지급 없음)', host.result.stars === before + 1)
}

// ── 4) flag ON — 하루 3회 복습 → review-session-bonus 정확히 1건 ──
console.log('\n4. flag ON — 하루 3회 복습(recoveredToday) → review-session-bonus 정확히 1건(+2)')
{
  const ID = '33333333-0000-0000-0000-000000000004'
  const { host } = await mount(ID, 'QA_Mastery_Bonus3', {
    featureOverrides: { masteryReward: true },
    seedRecord: { studentId: ID, totalStars: 0, round: baseRound(TODAY), spellingReviewQueue: ['b1', 'b2', 'b3'], history: {} },
  })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  host.result.clearSpellingReviewWord('b1')
  settle(host)
  check('1회째 — review-session-bonus 아직 없음', ledgerCount(host, 'review-session-bonus') === 0)
  host.result.clearSpellingReviewWord('b2')
  settle(host)
  check('2회째 — review-session-bonus 아직 없음', ledgerCount(host, 'review-session-bonus') === 0)
  host.result.clearSpellingReviewWord('b3')
  settle(host)
  check('3회째 — review-session-bonus 정확히 1건', ledgerCount(host, 'review-session-bonus') === 1)
  const bonusEntry = ledgerArr(host).find((e) => e.reward_type === 'review-session-bonus')
  check('review-session-bonus stars_delta === 2', bonusEntry && bonusEntry.stars_delta === 2)
  // 3회(각 wrong-word-recovered 1 + word-mastered 1 = 2×3=6) + 보너스 2 = 8
  check('totalStars === before + 8(회복 3×2 + 보너스 2)', host.result.stars === before + 8)
}

// ── 5) flag ON — 5회 복습 → review-session-bonus 여전히 1건(재지급 없음) ──
console.log('\n5. flag ON — 하루 5회 복습 → review-session-bonus 여전히 정확히 1건')
{
  const ID = '33333333-0000-0000-0000-000000000005'
  const { host } = await mount(ID, 'QA_Mastery_Bonus5', {
    featureOverrides: { masteryReward: true },
    seedRecord: { studentId: ID, totalStars: 0, round: baseRound(TODAY), spellingReviewQueue: ['c1', 'c2', 'c3', 'c4', 'c5'], history: {} },
  })
  await flush(); await flush(); await flush()
  for (const w of ['c1', 'c2', 'c3', 'c4', 'c5']) { host.result.clearSpellingReviewWord(w); settle(host) }
  check('5회 복습 후에도 review-session-bonus 정확히 1건', ledgerCount(host, 'review-session-bonus') === 1)
}

// ── 6) flag ON — recordSpellingAnswer 정답 경로에서도 동일하게 동작 ──
console.log('\n6. flag ON — recordSpellingAnswer(정답) 경로도 word-mastered 배선')
{
  const ID = '33333333-0000-0000-0000-000000000006'
  const { host } = await mount(ID, 'QA_Mastery_AnswerPath', {
    featureOverrides: { masteryReward: true },
    seedRecord: { studentId: ID, totalStars: 0, round: baseRound(TODAY), spellingReviewQueue: ['d1'], history: {} },
  })
  await flush(); await flush(); await flush()
  host.result.recordSpellingAnswer('d1', true)
  settle(host)
  check('recordSpellingAnswer 정답 경로 — wrong-word-recovered 1건', ledgerCount(host, 'wrong-word-recovered', (id) => id.endsWith(':d1')) === 1)
  check('recordSpellingAnswer 정답 경로 — word-mastered 1건', ledgerCount(host, 'word-mastered', (id) => id === 'd1') === 1)
}

// ── 7) flag OFF — 3회 복습해도 review-session-bonus/word-mastered 전혀 없음 ──
console.log('\n7. flag OFF — 3회 복습해도 신규 앵커 전혀 지급되지 않음(레거시만)')
{
  const ID = '33333333-0000-0000-0000-000000000007'
  const { host } = await mount(ID, 'QA_Mastery_OffThree', {
    featureOverrides: { masteryReward: false },
    seedRecord: { studentId: ID, totalStars: 0, round: baseRound(TODAY), spellingReviewQueue: ['e1', 'e2', 'e3'], history: {} },
  })
  await flush(); await flush(); await flush()
  for (const w of ['e1', 'e2', 'e3']) { host.result.clearSpellingReviewWord(w); settle(host) }
  check('flag OFF — wrong-word-recovered 3건(레거시 정상 동작)', ledgerCount(host, 'wrong-word-recovered') === 3)
  check('flag OFF — word-mastered 0건', ledgerCount(host, 'word-mastered') === 0)
  check('flag OFF — review-session-bonus 0건', ledgerCount(host, 'review-session-bonus') === 0)
}

// ── 8) mergeProgressRecords — word-mastered 병합(같은 key 1건) ──
console.log('\n8. mergeProgressRecords — word-mastered 원장 병합(같은 key 1건)')
{
  const { bundle } = await mount('33333333-0000-0000-0000-000000000008', 'QA_Mastery_Merge')
  const ID = 'merge-mastery-id'
  const sharedKey = `${ID}:word-mastered:spelling-review-mastery:shared-word`
  const sharedLocal = { id: sharedKey, reward_type: 'word-mastered', source_type: 'spelling-review-mastery', source_id: 'shared-word', stars_delta: 1, xp_delta: 0, idempotency_key: sharedKey, created_at: 'LOCAL' }
  const sharedCloud = { id: sharedKey, reward_type: 'word-mastered', source_type: 'spelling-review-mastery', source_id: 'shared-word', stars_delta: 1, xp_delta: 0, idempotency_key: sharedKey, created_at: 'CLOUD' }
  const localRaw = { studentId: ID, totalStars: 1, rewardLedger: [sharedLocal] }
  const cloudRaw = { studentId: ID, totalStars: 1, rewardLedger: [sharedCloud] }
  const merged = bundle.mergeProgressRecords(localRaw, cloudRaw, ID)
  check('병합 후 word-mastered 정확히 1건', merged.rewardLedger.filter((e) => e.reward_type === 'word-mastered').length === 1)
  check('겹치는 key는 local 우선', merged.rewardLedger.find((e) => e.idempotency_key === sharedKey)?.created_at === 'LOCAL')
}

// ── 9) recoveredToday — freshHistoryDay/mergeHistoryDay 계약(정적 + normalizeRecord) ──
console.log('\n9. recoveredToday — normalizeRecord로 안전하게 폴백(구버전 blob에 필드 없어도 크래시 없음)')
{
  const { bundle } = await mount('33333333-0000-0000-0000-000000000009', 'QA_Mastery_Normalize')
  const legacy = { studentId: 'legacy-mastery', totalStars: 0, history: { 'Wed Sep 03 2026': { studied: true } } }
  const normalized = bundle.normalizeRecord(legacy, 'legacy-mastery')
  check('normalizeRecord 크래시 없이 반환', !!normalized)
  check('recoveredToday 필드가 0으로 채워짐(구버전 blob에 필드 없음)', normalized.history['Wed Sep 03 2026'].recoveredToday === 0)
}

console.log(`\n총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
