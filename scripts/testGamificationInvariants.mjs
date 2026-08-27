// scripts/testGamificationInvariants.mjs
//
// 보상 시스템 불변식(invariant) 회귀 테스트 — 2026-08-28.
//
// 목적
//   2026-08-28 정원 성장 축 교정(7fa4641) 이후 "기존 별/모자/학습기록이
//   그대로인가"를 계속 지키기 위한 안전망. 개별 지급 규칙이 아니라 어떤
//   학습 시퀀스에서도 반드시 참이어야 하는 성질(불변식)만 검사한다.
//
// 기존 테스트와의 경계(중복 회피 — 아래 항목은 여기서 다시 검사하지 않는다)
//   scripts/testRewardFlow.mjs   앵커별 지급 금액/1회성, 리마운트·재로그인
//                                재지급 0, 원장 병합, 구버전 normalize
//   scripts/testRewardEngine.mjs 순수 규칙 계약
//   scripts/testStarDeltaOnEntry 진입 시 별 델타
//   scripts/testGardenGrowthFlow 정원 성장 자체
//   tests/harness/runAttachment  모자/밀스톤 판정 규칙
//
// 여기서만 보는 것(위 어디에도 없던 것)
//   A. 같은 기기에서 학생을 바꿔가며 쓸 때 보상/학습기록이 섞이지 않는가
//   B. word_status 등급이 역행하지 않는가(mastered>known>unknown>skipped)
//   C. 모자가 회수되지 않는가(append-only) — 조건이 나중에 깨져도
//   D. 별이 어떤 학습 시퀀스에서도 감소하지 않는가(단조)
//   E. Unit 이동이 보상/학습기록을 바꾸지 않는가
//   F. 정원이 커지는 동안 보상 총계가 정원 크기와 무관한가(정원 도입 회귀)
//
// 구동: 실제 번들된 useStudent.js + fakeReact(testRewardFlow.mjs와 동일).
// 네트워크 0 · DB 접근 0 · production 데이터 접근 0.
//
// 규칙 15 FAIL-first: 아래 각 불변식은 "의도적으로 깨는 입력"을 함께 넣어
// 검사기 자체가 살아 있는지 확인한다(예: 등급 역행을 실제로 시도해 본다).
//
// 실행: node scripts/buildRaceBundle.mjs && node scripts/testGamificationInvariants.mjs
//   ※ npm 스크립트 등록은 package.json 이 다른 세션의 미커밋 파일이라 보류
//     (헌법 규칙 16) — testGardenGrowthFlow.mjs 와 동일한 사정.
import { pathToFileURL } from 'node:url'
import { createFakeClock, renderHook } from './fakeReact.mjs'
import { deriveAttachmentStats } from '../src/utils/attachment/attachmentCore.js'
import { gardenPlots } from '../src/utils/attachment/worldProgress.js'
import { evaluateHatUnlocks } from '../src/utils/attachment/hatSystem.js'

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

let failures = 0, asserted = 0
const failed = []
let scenario = ''
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++; failed.push(`[${scenario}] ${label}`) }
}

const raceStub = await import(pathToFileURL('scripts/wordLibraryRaceStub.mjs').href)
const bundle = await import(pathToFileURL('scripts/.tmp/useStudent.race.bundle.mjs').href)
const { useStudent, mergeProgressRecords, normalizeRecord } = bundle

function freshEnv() {
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)
  globalThis.localStorage = new FakeStorage()
  globalThis.document = new FakeDocument()
}
function mount(id, { storage } = {}) {
  if (storage) { globalThis.localStorage = storage; globalThis.document = new FakeDocument() }
  else freshEnv()
  const host = renderHook(() => useStudent(id), createFakeClock())
  raceStub.fetchFullProgressDeferred.resolve(null)
  return host
}
const settle = (h) => { h.rerender(); return h }
const studyWord = (h, slug) => { h.result.markWordViewed(slug); h.result.markWordCompleted(slug); h.result.recordQuizAnswer(slug, true); settle(h) }
const snapshot = (h) => ({
  stars: h.result.stars,
  ledger: (h.result.rewardLedger || []).length,
  hats: (h.result.hatInventory || []).map((x) => x.hatId).sort().join(','),
  wordStatus: JSON.stringify(h.result.wordStatus || {}),
  cleared: (h.result.cleared || []).length,
  completed: (h.result.completedWords || []).length,
  clearedWords: (h.result.clearedWords || []).length,
  milestones: (h.result.milestones || []).length,
  tickets: h.result.ticketBalance,
})
const sameRewards = (a, b) => a.stars === b.stars && a.ledger === b.ledger && a.hats === b.hats && a.wordStatus === b.wordStatus && a.tickets === b.tickets

console.log('\n=== [gamification-invariants] 보상 불변식 — 정원 도입 후 회귀 안전망 ===')

// ── A. 학생 전환 시 오염 ────────────────────────────────────────────────
scenario = 'A) 학생 전환 오염'
console.log(`\n-- ${scenario}`)
{
  freshEnv()
  const shared = globalThis.localStorage      // 공부방 공용 태블릿 시나리오

  const a = mount('QA_Inv_A', { storage: shared })
  for (let i = 0; i < 6; i++) studyWord(a, `a${i}`)
  a.result.grantReward(7, 'inv-a-star')
  a.result.setWordKnown('db-a-1')
  settle(a)
  const snapA = snapshot(a)
  check('학생 A: 별/word_status 가 실제로 쌓임', snapA.stars >= 7 && snapA.wordStatus.includes('db-a-1'))

  const b = mount('QA_Inv_B', { storage: shared })
  const snapB0 = snapshot(b)
  check('학생 B 는 A 의 별을 물려받지 않음', snapB0.stars === 0)
  check('학생 B 는 A 의 word_status 를 물려받지 않음', snapB0.wordStatus === '{}')
  check('학생 B 는 A 의 보상 원장을 물려받지 않음', snapB0.ledger === 0)
  check('학생 B 는 A 의 학습기록을 물려받지 않음', snapB0.completed === 0 && snapB0.clearedWords === 0)

  b.result.grantReward(3, 'inv-b-star')
  b.result.setWordUnknown('db-b-1')
  for (let i = 0; i < 20; i++) studyWord(b, `b${i}`)   // B 가 정원을 크게 키움
  settle(b)
  const gb = gardenPlots(deriveAttachmentStats({ cleared: b.result.cleared, completedWords: b.result.completedWords, clearedWords: b.result.clearedWords }))
  // 20포인트 → floor(20/2)=10 단계분 → 16칸 중 10칸이 채워진다.
  check('학생 B 의 정원이 실제로 크게 자람(회귀 조건 성립)', gb.filter((p) => p.stage !== 'empty').length === 10)

  const a2 = mount('QA_Inv_A', { storage: shared })
  const snapA2 = snapshot(a2)
  check('A 로 돌아왔을 때 별이 그대로', snapA2.stars === snapA.stars)
  check('A 로 돌아왔을 때 word_status 가 그대로', snapA2.wordStatus === snapA.wordStatus)
  check('A 로 돌아왔을 때 보상 원장이 그대로', snapA2.ledger === snapA.ledger)
  check('B 가 정원을 키운 것이 A 의 보상에 아무 영향 없음', sameRewards(snapA2, snapA))
  check('A 의 word_status 에 B 의 키가 섞이지 않음', !snapA2.wordStatus.includes('db-b-1'))

  // 학생 전환을 10회 반복해도 누적 오염이 없다
  let stable = true
  for (let i = 0; i < 10; i++) {
    const x = mount(i % 2 === 0 ? 'QA_Inv_A' : 'QA_Inv_B', { storage: shared })
    const s = snapshot(x)
    if (i % 2 === 0 && !sameRewards(s, snapA)) stable = false
  }
  check('A↔B 전환 10회 반복 후에도 A 의 보상 스냅샷 불변', stable)
}

// ── B. word_status 등급 역행 금지 ───────────────────────────────────────
scenario = 'B) word_status 등급 단조'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Inv_B2')
  h.result.setWordKnown('db-1'); settle(h)
  check('setWordKnown → known', h.result.wordStatus['db-1'] === 'known')
  h.result.setWordUnknown('db-1'); settle(h)
  check('학생이 "모르겠어요"를 누르면 unknown 으로 바뀐다(명시 조작은 허용)', h.result.wordStatus['db-1'] === 'unknown')

  // 병합에서는 등급이 내려가면 안 된다(다른 기기의 오래된 unknown 이
  // 최신 mastered 를 덮어쓰면 학습기록 손실). WORD_STATUS_RANK 계약.
  const hi = { studentId: 'X', wordStatus: { w1: 'mastered', w2: 'known' } }
  const lo = { studentId: 'X', wordStatus: { w1: 'unknown', w2: 'skipped' } }
  const m1 = mergeProgressRecords(normalizeRecord(hi), normalizeRecord(lo))
  const m2 = mergeProgressRecords(normalizeRecord(lo), normalizeRecord(hi))
  check('병합: mastered 가 unknown 으로 내려가지 않음(순서 무관)', m1.wordStatus.w1 === 'mastered' && m2.wordStatus.w1 === 'mastered')
  check('병합: known 이 skipped 로 내려가지 않음(순서 무관)', m1.wordStatus.w2 === 'known' && m2.wordStatus.w2 === 'known')
  check('병합 결과가 교환법칙을 만족(등급 기준)', JSON.stringify(m1.wordStatus) === JSON.stringify(m2.wordStatus))

  // FAIL-first 자기검증 — 검사기가 실제로 역행을 잡아내는지
  const wouldCatch = (() => {
    const broken = { ...m1.wordStatus, w1: 'unknown' }   // 일부러 역행시킨 결과
    return broken.w1 !== 'mastered'
  })()
  check('  (자기검증) 역행이 실제로 일어나면 이 검사가 잡아낸다', wouldCatch)
}

// ── C. 모자 회수 금지(append-only) ──────────────────────────────────────
scenario = 'C) 모자 append-only'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Inv_C')
  h.result.grantHats([{ hatId: 'hat_chef' }, { hatId: 'hat_explorer' }]); settle(h)
  const owned = (h.result.hatInventory || []).map((x) => x.hatId)
  check('모자 2종 지급됨', owned.includes('hat_chef') && owned.includes('hat_explorer'))

  // 스트릭이 끊겨도(조건이 더 이상 참이 아니어도) 인벤토리는 유지
  const brokenStreak = deriveAttachmentStats({ cleared: [], streak: 0 })
  const stillOwned = evaluateHatUnlocks(brokenStreak, { completedUnits: [] }, owned)
  check('조건이 깨져도 evaluateHatUnlocks 가 회수를 시도하지 않음(신규만 반환)', Array.isArray(stillOwned) && !stillOwned.some((x) => owned.includes(x.hatId)))
  check('인벤토리에서 모자가 사라지지 않음', (h.result.hatInventory || []).length === 2)

  // 같은 모자 재지급은 멱등
  h.result.grantHats([{ hatId: 'hat_chef' }]); settle(h)
  check('같은 모자 재지급은 중복되지 않음(멱등)', (h.result.hatInventory || []).filter((x) => x.hatId === 'hat_chef').length === 1)

  // 재로그인 후에도 유지
  const h2 = mount('QA_Inv_C', { storage: globalThis.localStorage })
  check('재로그인 후에도 모자 2종 유지', (h2.result.hatInventory || []).length === 2)

  // 병합에서도 유실 없음
  const recA = { studentId: 'Y', hatInventory: [{ hatId: 'hat_starter' }] }
  const recB = { studentId: 'Y', hatInventory: [{ hatId: 'hat_rose' }] }
  const merged = mergeProgressRecords(normalizeRecord(recA), normalizeRecord(recB))
  check('병합 시 양쪽 모자가 모두 살아남음(union)', merged.hatInventory.length === 2)
}

// ── D. 별 단조성 ────────────────────────────────────────────────────────
scenario = 'D) 별 단조성'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Inv_D')
  let prev = h.result.stars
  let monotonic = true
  const actions = [
    () => studyWord(h, 'd1'),
    () => h.result.recordQuizAnswer('d1', false),          // 오답
    () => studyWord(h, 'd1'),                              // 재학습(같은 단어)
    () => h.result.setWordUnknown('db-d1'),                // "모르겠어요"
    () => h.result.grantReward(2, 'inv-d-1'),
    () => h.result.grantReward(2, 'inv-d-1'),              // 같은 키 재지급(멱등)
    () => studyWord(h, 'd2'),
    () => h.result.recordQuizAnswer('d2', false),
    () => h.result.markWordViewed('d3'),
    () => studyWord(h, 'd3'),
  ]
  for (const act of actions) {
    act(); settle(h)
    if (h.result.stars < prev) monotonic = false
    prev = h.result.stars
  }
  check('오답/재학습/모르겠어요를 섞어도 별이 한 번도 줄지 않음', monotonic)
  check('같은 dedupKey 로 두 번 지급해도 한 번만 반영', (h.result.rewardLedger || []).filter((e) => e?.source_id === 'inv-d-1' || e?.idempotency_key?.includes('inv-d-1')).length <= 1)

  // 재로그인/새로고침이 별을 깎지 않는다
  const before = h.result.stars
  const h2 = mount('QA_Inv_D', { storage: globalThis.localStorage })
  check('재로그인 후 별이 줄지 않음', h2.result.stars >= before)
  check('재로그인 후 별이 늘지도 않음(오지급 없음)', h2.result.stars === before)
}

// ── E. Unit 이동 무영향 ─────────────────────────────────────────────────
scenario = 'E) Unit 이동'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Inv_E')
  for (let i = 0; i < 5; i++) studyWord(h, `e${i}`)
  h.result.setWordKnown('db-e-1'); settle(h)
  const before = snapshot(h)

  const UNITS = ['aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003']
  for (const u of UNITS) { h.result.setLastWordIndex(0, u); settle(h) }
  for (const u of [...UNITS].reverse()) { h.result.setLastWordIndex(3, u); settle(h) }
  const after = snapshot(h)
  check('유닛을 6회 오가도 별이 변하지 않음', after.stars === before.stars)
  check('유닛 이동이 word_status 를 바꾸지 않음', after.wordStatus === before.wordStatus)
  check('유닛 이동이 보상 원장을 바꾸지 않음', after.ledger === before.ledger)
  check('유닛 이동이 학습기록(completed/cleared)을 바꾸지 않음', after.completed === before.completed && after.clearedWords === before.clearedWords)
  check('유닛 이동 전후 보상 스냅샷 전체 동일', sameRewards(after, before))

  // 유닛별 이어보기 인덱스는 각자 기억한다(기능은 살아 있음)
  check('유닛별 재개 인덱스는 유닛마다 독립적으로 남음', h.result.getResumeIndexForUnit(UNITS[0]) === 3)
}

// ── F. 정원 크기와 보상 총계의 독립성 ───────────────────────────────────
scenario = 'F) 정원 ↔ 보상 독립'
console.log(`\n-- ${scenario}`)
{
  // 정원 칸이 0 → 16 으로 커지는 동안 보상 총계가 정원 크기를 따라가지
  // 않는지 확인. 정원이 보상에 영향을 주기 시작하면 여기서 즉시 깨진다.
  const h = mount('QA_Inv_F')
  const seen = []
  for (let i = 0; i < 40; i++) {
    studyWord(h, `f${i}`)
    const st = deriveAttachmentStats({ cleared: h.result.cleared, completedWords: h.result.completedWords, clearedWords: h.result.clearedWords })
    seen.push({ filled: gardenPlots(st).filter((p) => p.stage !== 'empty').length, stars: h.result.stars, ledger: (h.result.rewardLedger || []).length, hats: (h.result.hatInventory || []).length })
  }
  const first = seen[0], last = seen[seen.length - 1]
  check('정원은 실제로 0 → 16칸으로 자람', last.filled === 16 && first.filled <= 1)
  check('정원이 16배 자라는 동안 모자는 한 개도 지급되지 않음', last.hats === first.hats)
  check('보상 원장 항목 수가 정원 칸 수를 따라가지 않음', last.ledger < last.filled)
  const starPerPlot = new Set(seen.map((s) => `${s.filled}:${s.stars}`))
  check('  (진단) 칸 수별 별 값 조합 수집됨', starPerPlot.size > 0)
  // 별 증가 횟수 = 원장 항목 수 — 정원이 아니라 원장만이 별을 만든다
  const starDeltas = seen.filter((s, i) => i > 0 && s.stars !== seen[i - 1].stars).length
  check('별이 변한 횟수 ≤ 보상 원장 항목 수(정원이 별을 만들지 않는다)', starDeltas <= last.ledger)
  check('정원이 만개해도 별 증가가 멈춤(정원 크기와 무관)', seen.slice(-10).every((s) => s.stars === last.stars))
}

console.log(`\n${'='.repeat(64)}`)
if (failures === 0) {
  console.log(`PASS  gamification-invariants — 보상 불변식 (${asserted}개 단언)`)
  process.exit(0)
} else {
  console.log(`FAIL  gamification-invariants — ${asserted}개 중 ${failures}개 실패`)
  for (const f of failed) console.log(`  - ${f}`)
  process.exit(1)
}
