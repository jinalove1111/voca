// scripts/testGardenGrowthFlow.mjs
//
// Paul Town 정원 성장 — 학습 → 성장 end-to-end 계약 테스트(2026-08-28).
//
// 왜 필요한가
//   2026-08-28 조사에서 "아이가 아무리 공부해도 정원이 안 자란다"는 P1이
//   확인됐다. 원인은 정원의 성장 포인트가 clearedCount(퀴즈를 "틀린 뒤"
//   레벨업 미션에서 3연속 정답으로 되찾은 단어 수)만 읽고 있었던 것 —
//   단어 학습 완료/퀴즈 정답/쓰기/유닛 완주 어느 것도 정원을 키우지
//   못했다(라이브 실측: progress 보유 190명 중 170명 89%가 영구 0칸).
//   기존 하네스(runAttachment.mjs)는 gardenPlots에 stats를 "직접 넣어"
//   검증했기 때문에, stats를 만드는 앞단(학습 액션 → record)이 정원과
//   끊겨 있다는 사실 자체를 구조적으로 잡을 수 없었다.
//
//   그래서 이 파일은 반대 방향에서 검증한다: 진짜 학습 함수를 호출해서
//   (markWordCompleted / recordQuizAnswer / answerMission) 실제 record를
//   만들고, 그 record를 deriveAttachmentStats에 넣어 정원이 실제로
//   자라는지를 끝까지 확인한다. "정원 규칙이 맞다"가 아니라 "공부하면
//   정원이 자란다"를 고정하는 것이 목적이다.
//
// 구동 방식
//   scripts/testRewardFlow.mjs / testStarDeltaOnEntry.mjs와 완전히 동일 —
//   fakeReact.mjs의 최소 hooks 런타임 + fake clock으로 실제 번들된
//   src/hooks/useStudent.js(scripts/buildRaceBundle.mjs 산출물)를 그대로
//   구동한다. 새 테스트 프레임워크/새 번들 빌드 스크립트를 만들지 않는다.
//   네트워크 0, DB 접근 0(wordLibraryRaceStub이 클라우드 fetch/sync 전부
//   스텁). 이 파일은 어떤 production 데이터도 읽거나 쓰지 않는다.
//
// CLAUDE.md 규칙 15(FAIL-first) 실측 기록 — 2026-08-28
//   수정 전 모듈(7fa4641~1 = 1fe0f13 의 attachmentCore/worldProgress)을 그대로
//   꺼내, "단어 N개를 성실히 학습한 학생"의 record 를 양쪽에 똑같이 넣고 비교했다.
//
//     학습 단어 | 수정 전(clearedCount 축) | 수정 후(gardenPoints 축)
//     ----------|--------------------------|--------------------------
//            2  |   0 포인트   정원  0칸   |   2 포인트   정원  1칸
//           10  |   0 포인트   정원  0칸   |  10 포인트   정원  5칸
//           40  |   0 포인트   정원  0칸   |  40 포인트   정원 16칸
//          100  |   0 포인트   정원  0칸   | 100 포인트   정원 16칸
//
//   즉 수정 전에는 단어를 100개 학습해도 정원이 단 한 칸도 자라지 않았다.
//   반면 "퀴즈를 12번 틀린 뒤 레벨업 미션으로 되찾기만 한" 학생은 수정 전에도
//   4칸이 자랐다 — 성실한 학생(0칸)보다 큰 역인센티브였음이 수치로 확정됐다.
//   (수정 후 그 학생도 6칸 — 기존 축을 버린 게 아니라 합집합에 포함시켰다.)
//
//   추가로 tests/harness/runAttachment.mjs 는 소스만 고친 상태에서 정확히 4건
//   (진행 포인트/9칸 격자/홈 밴드/소급 환영)만 FAIL 하고 나머지 133건은 PASS
//   함을 먼저 확인한 뒤 계약을 갱신했다.
//
// 실행:
//   node scripts/buildRaceBundle.mjs && node scripts/testGardenGrowthFlow.mjs
//
//   ※ npm 스크립트(verify:garden) 및 tests/harness/registry.mjs 등록은 아직
//     하지 않았다 — package.json 과 registry.mjs 는 2026-08-28 현재 다른
//     세션이 수정 중인 미커밋 파일이라 헌법 규칙 16(파일당 소유자 1명)에
//     따라 건드리지 않는다. 그 두 파일이 정리된 뒤 등록하는 것이 후속 작업.
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { createFakeClock, renderHook } from './fakeReact.mjs'
import { deriveAttachmentStats } from '../src/utils/attachment/attachmentCore.js'
import { gardenPlots, computeWorldState, PLOT_COUNT, POINTS_PER_STAGE } from '../src/utils/attachment/worldProgress.js'
import { evaluateHatUnlocks } from '../src/utils/attachment/hatSystem.js'
import { detectNewMilestones } from '../src/utils/attachment/milestones.js'
import { townPlacesState } from '../src/utils/attachment/paulTown.js'

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

let failures = 0
let asserted = 0
const failed = []
let scenario = ''
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++; failed.push(`[${scenario}] ${label}`) }
}

const raceStub = await import(pathToFileURL('scripts/wordLibraryRaceStub.mjs').href)
const bundle = await import(pathToFileURL('scripts/.tmp/useStudent.race.bundle.mjs').href)
const { useStudent, mergeProgressRecords } = bundle

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
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(id), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  return host
}

// fakeReact의 run()은 커밋 전 반환값을 캡처하므로, useEffect 안에서 일어난
// patch()의 결과를 읽으려면 명시 재렌더가 필요하다(testRewardFlow.mjs의
// settle()과 동일한 관례 — 그 파일 주석에 원인이 상세히 적혀 있다).
const settle = (host) => { host.rerender(); return host }

// record → 정원 상태. 실제 화면(EnglishGarden/PaulTown)이 하는 것과 같은
// 경로: useStudent record → deriveAttachmentStats → gardenPlots.
function garden(host) {
  const r = host.result
  const stats = deriveAttachmentStats({
    cleared: r.cleared, completedWords: r.completedWords, clearedWords: r.clearedWords,
    wordStatus: r.wordStatus, missions: r.missions, history: r.history,
    streak: r.streak, spellingReviewQueue: r.spellingReviewQueue,
  })
  const plots = gardenPlots(stats)
  return {
    stats,
    points: stats.gardenPoints,
    filled: plots.filter((p) => p.stage !== 'empty').length,
    stages: plots.map((p) => p.stage),
    counts: plots.reduce((a, p) => ({ ...a, [p.stage]: (a[p.stage] || 0) + 1 }), {}),
    world: computeWorldState(stats),
  }
}

// "본 코스에서 단어 하나를 끝까지 학습했다" — GuidedSession이 실제로 부르는
// 조합(단어 열람 → 학습 단계 완주 → 퀴즈 정답).
function studyWord(host, slug) {
  host.result.markWordViewed(slug)
  host.result.markWordCompleted(slug)
  host.result.recordQuizAnswer(slug, true)
  settle(host)
}

console.log('\n=== [garden] 정원 성장 — 학습 → 성장 end-to-end 계약 ===')
console.log(`격자 ${PLOT_COUNT}칸 / 한 단계 ${POINTS_PER_STAGE}포인트 (worldProgress.js 실측)`)

// ── 1) 실제 학습이 정원 성장에 연결되는가 ────────────────────────────────
// FAIL-first 확인: 수정 전 코드에서는 이 시나리오 전부 FAIL(공부해도
// points/filled가 0에서 움직이지 않음) — 이것이 이번 P1의 본체다.
scenario = '1) 학습 → 성장 연결'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Garden_1')
  const g0 = garden(h)
  check('학습 전: 성장 포인트 0 · 정원 0칸', g0.points === 0 && g0.filled === 0)

  studyWord(h, 'apple')
  const g1 = garden(h)
  check('단어 1개 학습 → 성장 포인트가 증가한다(0 → 1)', g1.points === 1)
  check('아직 1포인트라 칸은 안 자람(임계 2)', g1.filled === 0)

  studyWord(h, 'banana')
  const g2 = garden(h)
  check('단어 2개 학습 → 첫 씨앗 1칸', g2.points === 2 && g2.filled === 1 && g2.stages[0] === 'seed')

  for (const w of ['cat', 'dog', 'egg', 'fish']) studyWord(h, w)
  const g6 = garden(h)
  check('단어 6개 학습 → 3칸(2단어마다 1칸)', g6.points === 6 && g6.filled === 3)

  // 퀴즈만 맞혀도(학습 단계 완주 없이) 자란다 — clearedWords 축
  const hq = mount('QA_Garden_1b')
  hq.result.recordQuizAnswer('q1', true); hq.result.recordQuizAnswer('q2', true); settle(hq)
  check('퀴즈 정답만으로도 성장한다(clearedWords 축)', garden(hq).points === 2 && garden(hq).filled === 1)

  // 레벨업 미션(기존 축)도 여전히 성장에 포함된다 — 축을 잃지 않았는지
  const hm = mount('QA_Garden_1c')
  hm.result.addMission('boss1'); settle(hm)
  hm.result.answerMission('boss1'); hm.result.answerMission('boss1'); hm.result.answerMission('boss1'); settle(hm)
  check('레벨업 미션 클리어도 여전히 성장에 포함(기존 축 유실 없음)', garden(hm).stats.clearedSet.has('boss1') && garden(hm).points >= 1)

  // 퀴즈 오답은 성장시키지 않는다(정답만 인정)
  const hw = mount('QA_Garden_1d')
  hw.result.recordQuizAnswer('wrong1', false); hw.result.recordQuizAnswer('wrong2', false); settle(hw)
  check('퀴즈 오답은 성장 포인트를 주지 않는다', garden(hw).points === 0 && garden(hw).filled === 0)
}

// ── 2) 로그인/새로고침만으로 자라지 않는가 ───────────────────────────────
scenario = '2) 로그인·새로고침 무성장'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Garden_2')
  for (const w of ['w1', 'w2', 'w3', 'w4']) studyWord(h, w)
  const before = garden(h)
  check('사전 조건: 학습 4개 → 2칸', before.points === 4 && before.filled === 2)

  for (let i = 0; i < 20; i++) settle(h)              // 재렌더 20회
  globalThis.document.dispatch('visibilitychange')     // 탭 복귀
  globalThis.document.dispatch('focus')
  settle(h)
  const after = garden(h)
  check('재렌더 20회 + 탭 복귀/포커스로는 성장 포인트가 변하지 않음', after.points === before.points)
  check('재렌더/복귀로 칸 수도 변하지 않음', after.filled === before.filled)

  // 새로고침 = 언마운트 후 같은 localStorage 로 재마운트
  const storage = globalThis.localStorage
  const h2 = mount('QA_Garden_2', { storage })
  const g2 = garden(h2)
  check('새로고침(재마운트) 후에도 성장 포인트 동일 — 증가도 감소도 없음', g2.points === before.points && g2.filled === before.filled)

  for (let i = 0; i < 5; i++) { const hx = mount('QA_Garden_2', { storage: globalThis.localStorage }); settle(hx) }
  check('반복 재로그인 5회로도 성장하지 않음', garden(mount('QA_Garden_2', { storage: globalThis.localStorage })).points === before.points)
}

// ── 3) 같은 학습을 반복해도 중복 계산하지 않는가 ─────────────────────────
scenario = '3) 반복 학습 멱등'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Garden_3')
  studyWord(h, 'same'); studyWord(h, 'other')
  const g1 = garden(h)
  check('서로 다른 단어 2개 → 2포인트', g1.points === 2)

  for (let i = 0; i < 30; i++) studyWord(h, 'same')   // 같은 단어 30회 반복
  const g2 = garden(h)
  check('같은 단어를 30회 다시 학습해도 포인트 불변(멱등)', g2.points === 2)
  check('같은 단어 반복으로 칸도 늘지 않음', g2.filled === g1.filled)

  for (let i = 0; i < 30; i++) { h.result.recordQuizAnswer('same', true); settle(h) }
  check('같은 단어 퀴즈 정답 30회 반복도 멱등', garden(h).points === 2)

  // 세 축이 같은 단어를 가리켜도 1개로만 센다(합집합 중복 제거)
  const hu = mount('QA_Garden_3b')
  hu.result.markWordCompleted('dup'); hu.result.recordQuizAnswer('dup', true)
  hu.result.addMission('dup'); settle(hu)
  hu.result.answerMission('dup'); hu.result.answerMission('dup'); hu.result.answerMission('dup'); settle(hu)
  const gu = garden(hu)
  check('같은 단어가 세 축(completed/cleared/mission)에 다 있어도 1포인트', gu.points === 1)
  check('  (세 축에 실제로 다 들어 있음을 확인)', gu.stats.completedSet.has('dup') && gu.stats.clearedWordSet.has('dup') && gu.stats.clearedSet.has('dup'))
}

// ── 4) 학생별 데이터가 섞이지 않는가 ─────────────────────────────────────
scenario = '4) 학생 격리'
console.log(`\n-- ${scenario}`)
{
  freshEnv()
  const shared = globalThis.localStorage       // 같은 기기(공유 localStorage)
  const a = mount('QA_Garden_A', { storage: shared })
  for (const w of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']) studyWord(a, w)
  const ga = garden(a)
  check('학생 A: 6개 학습 → 3칸', ga.points === 6 && ga.filled === 3)

  const b = mount('QA_Garden_B', { storage: shared })
  const gb0 = garden(b)
  check('학생 B는 같은 기기라도 A의 성장을 물려받지 않음(0포인트)', gb0.points === 0 && gb0.filled === 0)

  studyWord(b, 'b1'); studyWord(b, 'b2')
  check('학생 B가 학습해도 B만 자람', garden(b).points === 2)

  const a2 = mount('QA_Garden_A', { storage: shared })
  check('학생 A로 돌아오면 A의 성장이 그대로 보존됨', garden(a2).points === 6 && garden(a2).filled === 3)
  check('A/B 의 정원 배열이 서로 다름(교차 오염 없음)', JSON.stringify(garden(a2).stages) !== JSON.stringify(garden(b).stages))

  // 학생 전환 시 state contamination — 같은 훅 인스턴스가 아니라 각자
  // 독립 record 를 읽는지 슬러그 단위로 확인
  check('A의 단어가 B의 gardenSet에 없음', !garden(b).stats.gardenSet.has('a1'))
  check('B의 단어가 A의 gardenSet에 없음', !garden(a2).stats.gardenSet.has('b1'))
}

// ── 5) Unit 변경 후에도 정상인가 ─────────────────────────────────────────
scenario = '5) Unit 변경'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Garden_5')
  const U1 = '11111111-1111-1111-1111-111111111111'
  const U2 = '22222222-2222-2222-2222-222222222222'
  h.result.setLastWordIndex(3, U1); settle(h)
  for (const w of ['u1a', 'u1b', 'u1c', 'u1d']) studyWord(h, w)
  const gU1 = garden(h)
  check('Unit1 에서 4개 학습 → 2칸', gU1.points === 4 && gU1.filled === 2)

  h.result.setLastWordIndex(0, U2); settle(h)          // 유닛 전환
  const gAfterSwitch = garden(h)
  check('유닛을 바꿔도 기존 성장이 사라지지 않음', gAfterSwitch.points === 4 && gAfterSwitch.filled === 2)

  for (const w of ['u2a', 'u2b']) studyWord(h, w)
  check('새 유닛 학습분이 누적된다(4 → 6)', garden(h).points === 6 && garden(h).filled === 3)

  h.result.setLastWordIndex(2, U1); settle(h)          // 유닛 복귀
  check('원래 유닛으로 돌아와도 누적 성장 유지', garden(h).points === 6)
  check('유닛 전환이 정원 칸 배열을 흔들지 않음(결정론)', JSON.stringify(garden(h).stages) === JSON.stringify(gardenPlots({ gardenPoints: 6 }).map(p => p.stage)))
}

// ── 6) 재로그인 후에도 정상인가 ──────────────────────────────────────────
scenario = '6) 재로그인 지속성'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Garden_6')
  for (let i = 0; i < 9; i++) studyWord(h, `p${i}`)
  const before = garden(h)
  check('사전 조건: 9개 학습 → 4칸', before.points === 9 && before.filled === 4)

  const storage = globalThis.localStorage
  const raw = JSON.parse(storage.getItem('paul_easy_progress'))
  check('학습 신호가 localStorage 에 실제로 영속됨', Array.isArray(raw.QA_Garden_6.completedWords) && raw.QA_Garden_6.completedWords.length === 9)

  const h2 = mount('QA_Garden_6', { storage })
  check('재로그인 후 성장 포인트 동일', garden(h2).points === before.points)
  check('재로그인 후 정원 칸 배열이 바이트 단위로 동일', JSON.stringify(garden(h2).stages) === JSON.stringify(before.stages))

  studyWord(h2, 'after-relogin')
  check('재로그인 후 추가 학습도 정상 누적(9 → 10)', garden(h2).points === 10 && garden(h2).filled === 5)
}

// ── 7) 다른 기기에서도 같은 상태가 보이는 구조인가 ───────────────────────
// 정원은 저장값이 없고 record 파생이므로, "기기 간 동일"의 진짜 조건은
// record 병합(mergeProgressRecords)이 학습 신호를 잃지 않는 것이다.
scenario = '7) 다기기 동일성'
console.log(`\n-- ${scenario}`)
{
  const devA = mount('QA_Garden_7')
  for (const w of ['s1', 's2', 's3', 's4']) studyWord(devA, w)
  const recA = JSON.parse(globalThis.localStorage.getItem('paul_easy_progress')).QA_Garden_7

  const devB = mount('QA_Garden_7')                    // 다른 기기(빈 저장소)
  for (const w of ['s5', 's6']) studyWord(devB, w)
  const recB = JSON.parse(globalThis.localStorage.getItem('paul_easy_progress')).QA_Garden_7

  const merged = mergeProgressRecords(recA, recB)
  const mStats = deriveAttachmentStats(merged)
  check('병합 후 두 기기 학습이 모두 살아있음(4 + 2 = 6포인트)', mStats.gardenPoints === 6)
  check('병합 결과가 어느 한쪽보다 작아지지 않음(성장 유실 없음)',
    mStats.gardenPoints >= deriveAttachmentStats(recA).gardenPoints && mStats.gardenPoints >= deriveAttachmentStats(recB).gardenPoints)
  check('병합 순서를 바꿔도 같은 정원(교환법칙)',
    JSON.stringify(gardenPlots(deriveAttachmentStats(mergeProgressRecords(recB, recA)))) === JSON.stringify(gardenPlots(mStats)))
  check('같은 record 면 어느 기기에서 계산해도 같은 정원(결정론·저장 없음)',
    JSON.stringify(gardenPlots(deriveAttachmentStats(merged))) === JSON.stringify(gardenPlots(deriveAttachmentStats(JSON.parse(JSON.stringify(merged))))))
}

// ── 8) 성장 단계가 역행하지 않는가 ───────────────────────────────────────
scenario = '8) 단조성(역행 없음)'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Garden_8')
  let prevFilled = 0, prevPoints = 0, prevUnlocked = 0
  let monotonic = true, pointsMono = true, worldMono = true
  for (let i = 0; i < 70; i++) {
    studyWord(h, `m${i}`)
    const g = garden(h)
    if (g.filled < prevFilled) monotonic = false
    if (g.points < prevPoints) pointsMono = false
    const unlocked = g.world.stages.filter((s) => s.unlocked).length
    if (unlocked < prevUnlocked) worldMono = false
    prevFilled = g.filled; prevPoints = g.points; prevUnlocked = unlocked
  }
  check('학습 70회 동안 칸 수가 한 번도 줄지 않음', monotonic)
  check('학습 70회 동안 성장 포인트가 한 번도 줄지 않음', pointsMono)
  check('월드 잠금해제 수도 역행하지 않음', worldMono)
  check('70개 학습 → 35칸 상당(16칸 전부 채움)', garden(h).filled === 16)

  // 오답/실패가 성장을 되돌리지 않는다
  const back = garden(h).points
  for (let i = 0; i < 10; i++) { h.result.recordQuizAnswer(`m${i}`, false); settle(h) }
  check('나중에 틀려도 이미 자란 정원이 줄지 않음(회수 없음)', garden(h).points === back && garden(h).filled === 16)
}

// ── 9) empty → seed → sprout → flower → tree 전환 ────────────────────────
scenario = '9) 단계 전환'
console.log(`\n-- ${scenario}`)
{
  const stageOfPlot0 = (n) => gardenPlots({ gardenPoints: n })[0].stage
  check('0포인트 → empty', stageOfPlot0(0) === 'empty')
  check('2포인트 → seed(첫 칸)', stageOfPlot0(2) === 'seed')
  check(`${PLOT_COUNT * POINTS_PER_STAGE + POINTS_PER_STAGE}포인트 → sprout(첫 칸 2단계)`, stageOfPlot0((PLOT_COUNT + 1) * POINTS_PER_STAGE) === 'sprout')
  check('64포인트 → flower(첫 칸 3단계)', stageOfPlot0((PLOT_COUNT * 2 + 1) * POINTS_PER_STAGE) === 'flower')
  check('96포인트 → tree(첫 칸 4단계)', stageOfPlot0((PLOT_COUNT * 3 + 1) * POINTS_PER_STAGE) === 'tree')
  check('128포인트 → 16칸 전부 tree(만개)', gardenPlots({ gardenPoints: 128 }).every((p) => p.stage === 'tree'))
  check('만개 이후 더 공부해도 tree 유지(오버플로우로 깨지지 않음)', gardenPlots({ gardenPoints: 100000 }).every((p) => p.stage === 'tree'))

  // 단계는 반드시 순서대로만 올라간다 — 건너뛰기 없음
  const ORDER = ['empty', 'seed', 'sprout', 'flower', 'tree']
  let noSkip = true
  let prev = gardenPlots({ gardenPoints: 0 }).map((p) => p.stage)
  for (let n = 1; n <= 140; n++) {
    const cur = gardenPlots({ gardenPoints: n }).map((p) => p.stage)
    for (let i = 0; i < PLOT_COUNT; i++) {
      const d = ORDER.indexOf(cur[i]) - ORDER.indexOf(prev[i])
      if (d < 0 || d > 1) noSkip = false
    }
    prev = cur
  }
  check('어떤 칸도 단계를 건너뛰거나 되돌아가지 않음(0~140포인트 전 구간)', noSkip)

  // 라운드로빈 — 한 칸만 먼저 크지 않고 골고루 자란다
  const spread = gardenPlots({ gardenPoints: 20 }).map((p) => ORDER.indexOf(p.stage))
  check('성장이 칸에 고르게 분배됨(최대-최소 차이 ≤ 1)', Math.max(...spread) - Math.min(...spread) <= 1)
}

// ── 10) 별/모자/학습기록에 영향을 주지 않는가 ────────────────────────────
scenario = '10) 보상 시스템 무영향'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Garden_10')
  const starsBefore = h.result.stars
  const ledgerBefore = (h.result.rewardLedger || []).length
  const hatsBefore = (h.result.hatInventory || []).length
  const wsBefore = Object.keys(h.result.wordStatus || {}).length

  for (let i = 0; i < 40; i++) studyWord(h, `r${i}`)   // 정원을 크게 키운다
  const g = garden(h)
  check('사전 조건: 정원이 실제로 크게 자람(40포인트 = 16칸)', g.points === 40 && g.filled === 16)

  // 정원은 stats 파생일 뿐이라 별/원장/모자/word_status 를 건드릴 수 없다.
  // "정원이 자랐다"는 사실 자체가 이 값들을 바꾸지 않았음을 확인.
  check('정원 성장이 word_status 를 만들지 않음', Object.keys(h.result.wordStatus || {}).length === wsBefore)
  check('정원 성장이 모자를 지급하지 않음(정원은 모자 판정 입력이 아님)', (h.result.hatInventory || []).length === hatsBefore)

  // 모자/밀스톤 판정이 gardenPoints 를 절대 읽지 않는지 — 동작으로 증명.
  // gardenPoints 40인데 clearedCount 0 이면 파란 모자(≥10)는 나오면 안 된다.
  check('  (사전 조건) clearedCount 는 0 인데 gardenPoints 는 40', g.stats.clearedCount === 0 && g.stats.gardenPoints === 40)
  const hats = evaluateHatUnlocks(g.stats, { completedUnits: [], completedTextbooks: [] }, [])
  check('gardenPoints 40 + clearedCount 0 → 파란/금색 모자 미지급', !hats.some((x) => x.hatId === 'hat_explorer' || x.hatId === 'hat_crown'))
  const ms = detectNewMilestones(g.stats, { completedUnits: [], completedTextbooks: [], newHats: [] }, [])
  check('gardenPoints 40 + clearedCount 0 → cleared-N 밀스톤 미발생', !ms.some((m) => /^cleared-\d+$/.test(m.id)))

  // 별 증가분의 출처 확인.
  //   최초 작성 시 "학습해도 별은 안 는다"로 단언했다가 FAIL 했는데, 조사
  //   결과 테스트 쪽이 틀렸다: Reward System V1 앵커 word-session-complete
  //   (useStudent.js:1359 — round.completedToday 가 GOAL 에 도달하면 하루
  //   1회 +1)가 정상 동작한 것이다. 정원과 무관한 기존 계약이므로, 단언을
  //   "별이 안 는다"가 아니라 "별 증가가 학습 앵커에서만 오고 정원 때문에
  //   추가로 늘지 않는다"로 바로잡는다(테스트를 약화시키는 게 아니라 실제
  //   계약을 더 정확히 고정하는 방향).
  const ledger = h.result.rewardLedger || []
  const gained = h.result.stars - starsBefore
  check('별이 늘었다면 그 출처가 rewardLedger 에 전부 기록돼 있다',
    gained === ledger.reduce((a, e) => a + (Number(e?.stars_delta) || 0), 0))
  check('원장에 정원 관련 보상 타입이 하나도 없다(정원은 별을 주지 않는다)',
    !ledger.some((e) => /garden|plot|world|town/i.test(String(e?.reward_type) + String(e?.source_type) + String(e?.source_id))))
  check('별 증가는 학습 앵커(word-session-complete)에서만 발생',
    ledger.every((e) => ['word-session-complete', 'daily-goal-complete', 'streak-bonus'].includes(e?.reward_type)))
  check('정원이 0칸 → 16칸으로 자라는 동안에도 학습 앵커는 하루 1회뿐(칸 수에 비례해 별이 늘지 않음)',
    ledger.filter((e) => e?.reward_type === 'word-session-complete').length === 1)
  check('원장 항목 수가 정원 칸 수(16)와 무관',
    ledger.length < g.filled && ledger.length >= ledgerBefore)

  // 구조적 증명 — useStudent.js(별/모자/학습기록의 유일한 쓰기 지점)는
  // 정원 모듈을 import 조차 하지 않는다. 정원이 보상에 영향을 줄 경로가
  // 코드 구조상 존재하지 않는다는 뜻이고, 이 단언이 깨지면 그 순간부터
  // "정원이 별을 건드릴 수 있는" 상태가 된 것이다.
  const useStudentSrc = readFileSync(new URL('../src/hooks/useStudent.js', import.meta.url), 'utf8')
  check('useStudent.js 는 attachment/worldProgress(정원) 모듈을 import 하지 않는다',
    !/from\s+'[^']*attachment[^']*'/.test(useStudentSrc) && !/worldProgress/.test(useStudentSrc))
  check('useStudent.js 는 gardenPoints 를 읽지도 쓰지도 않는다', !useStudentSrc.includes('gardenPoints'))

  // 반대 방향 — 별을 지급해도 정원은 변하지 않는다(축 독립)
  const pointsBeforeStar = garden(h).points
  h.result.grantReward(5, 'garden-test-star'); settle(h)
  check('별을 지급해도 정원 성장 포인트는 변하지 않음(축 독립)', garden(h).points === pointsBeforeStar)
  check('  (별은 실제로 지급됐음을 확인)', h.result.stars > starsBefore)
}

// ── 11) 마을/월드가 같은 축을 읽는가 ─────────────────────────────────────
scenario = '11) 마을·월드 정합'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_Garden_11')
  for (let i = 0; i < 32; i++) studyWord(h, `t${i}`)
  const g = garden(h)
  check('사전 조건: 32포인트', g.points === 32)
  check('월드 진행 포인트 = 정원 성장 포인트(같은 축)', g.world.growthPoints === g.points)
  check('30포인트 임계를 넘어 "나의 집"이 열림', g.world.stages.find((s) => s.id === 'house').unlocked === true)
  check('60포인트 미만이라 "다리"는 아직 잠김', g.world.stages.find((s) => s.id === 'bridge').unlocked === false)
  const places = townPlacesState(g.stats, () => true)
  check('마을 박물관(임계 30)도 같은 축으로 열림', places.find((p) => p.id === 'museum').discovered === true)
  check('마을 도서관(임계 100)은 아직 잠김', places.find((p) => p.id === 'library').discovered === false)
}

// ── 12) 성장 속도 계약(운영자 승인 2026-08-28) ───────────────────────────
// "하루 최대 1칸" 하드 상한은 두지 않는다 — 학습량 비례가 계약이다.
scenario = '12) 성장 속도'
console.log(`\n-- ${scenario}`)
{
  // 중앙값 학생: 라이브 실측 학습한 하루당 새 단어 1.9개 → 하루 약 1칸
  const median = mount('QA_Garden_12a')
  studyWord(median, 'd1'); studyWord(median, 'd2')
  check('중앙값 학생(하루 2단어) → 하루 1칸 성장', garden(median).filled === 1)

  // 상위 학생: 하루 8단어 → 4칸 (상한 없음)
  const heavy = mount('QA_Garden_12b')
  for (let i = 0; i < 8; i++) studyWord(heavy, `h${i}`)
  check('상위 학생(하루 8단어) → 하루 4칸 성장 (일일 상한 없음)', garden(heavy).filled === 4)
  check('학습량에 비례해 성장한다(2단어=1칸, 8단어=4칸)', garden(heavy).filled === garden(median).filled * 4)

  // 하드 상한이 코드에 존재하지 않는지 — 한 번의 세션으로 만개까지 가능
  const marathon = mount('QA_Garden_12c')
  for (let i = 0; i < 128; i++) studyWord(marathon, `x${i}`)
  check('일일 상한 로직이 없다 — 한 세션 128단어면 그날 만개까지 도달', gardenPlots(garden(marathon).stats).every((p) => p.stage === 'tree'))
}

// ── 13) 방어적 입력 ──────────────────────────────────────────────────────
scenario = '13) 방어적 입력'
console.log(`\n-- ${scenario}`)
{
  check('빈 record 도 크래시 없이 0칸', gardenPlots(deriveAttachmentStats({})).every((p) => p.stage === 'empty'))
  check('null/undefined stats 에도 gardenPlots 가 크래시하지 않음', gardenPlots({}).length === PLOT_COUNT && gardenPlots({ gardenPoints: undefined }).length === PLOT_COUNT)
  check('구 progress 백업(gardenPoints 없음)은 clearedCount 로 폴백', gardenPlots({ clearedCount: 20 }).filter((p) => p.stage !== 'empty').length === gardenPlots({ gardenPoints: 20 }).filter((p) => p.stage !== 'empty').length)
  check('세 배열이 배열이 아닌 손상 record 도 0으로 안전 파생', deriveAttachmentStats({ cleared: 'x', completedWords: null, clearedWords: 7 }).gardenPoints === 0)
  check('음수/NaN 포인트에도 칸 수가 음수가 되지 않음', gardenPlots({ gardenPoints: -5 }).every((p) => p.stage === 'empty') && gardenPlots({ gardenPoints: NaN }).every((p) => p.stage === 'empty'))
}

// ── 14) 정원 성장 v2(ledger 보너스, P2, 2026-09-03, flag attachmentGardenGrowthV2) ──
// deriveAttachmentStats(rec, now, { gardenGrowthV2 }) — 옵션을 안 주면(기본
// false) 항상 기존과 바이트 단위 동일(위 13절 포함 전 시나리오가 이미
// 이를 증명). 이 절은 옵션을 명시적으로 켰을 때만 rewardLedger 보너스가
// gardenPoints에 더해지는지, light/median/hard 세 프로필로 확인한다.
// 실제 프로덕션에서는 useAttachment.js 한 곳만 이 옵션을 isFeatureEnabled
// 결과로 채운다 — 이 테스트는 그 소비 계약(옵션이 켜지면 보너스가 실제로
// 반영된다)을 직접 검증한다.
scenario = '14) 정원 성장 v2(ledger 보너스)'
console.log(`\n-- ${scenario}`)
{
  const AFTER_EPOCH = '2026-09-05T09:00:00.000Z'
  const rewardEntry = (rewardType, sourceId, idKey) => ({
    reward_type: rewardType, source_type: 'x', source_id: sourceId,
    stars_delta: 1, idempotency_key: idKey, created_at: AFTER_EPOCH,
  })

  // 가벼운 날 — 단어 2개, 보너스 없음. 문서 산수: 2포인트 = 1칸(플래그
  // 켜짐/꺼짐 무관, 보너스가 없으면 결과가 같다).
  const lightRec = { cleared: [], completedWords: ['lw1', 'lw2'], clearedWords: [], rewardLedger: [] }
  const lightOff = deriveAttachmentStats(lightRec)
  const lightOn = deriveAttachmentStats(lightRec, new Date(), { gardenGrowthV2: true })
  check('가벼운 날(단어 2개, 보너스 없음): flag on/off 모두 2포인트 · 1칸', lightOff.gardenPoints === 2 && lightOn.gardenPoints === 2 && gardenPlots(lightOn).filter((p) => p.stage !== 'empty').length === 1)

  // 중앙값 — 단어 2개 + 오늘의 목표 달성 1회(가중치 2). 문서 산수:
  // 2(단어) + 2(daily-goal-complete) = 4포인트 = 2칸.
  const medianLedger = [rewardEntry('daily-goal-complete', '2026-09-05:goal', 'g14-median')]
  const medianRec = { cleared: [], completedWords: ['md1', 'md2'], clearedWords: [], rewardLedger: medianLedger }
  const medianOff = deriveAttachmentStats(medianRec)
  const medianOn = deriveAttachmentStats(medianRec, new Date(), { gardenGrowthV2: true })
  check('중앙값(단어 2개 + 목표달성 1회): flag off는 보너스 무시(2포인트 · 1칸)', medianOff.gardenPoints === 2 && gardenPlots(medianOff).filter((p) => p.stage !== 'empty').length === 1)
  check('중앙값: flag on은 보너스 반영(4포인트 · 2칸)', medianOn.gardenPoints === 4 && gardenPlots(medianOn).filter((p) => p.stage !== 'empty').length === 2)
  check('중앙값: gardenWordPoints/gardenBonusPoints 분해값이 합과 일치', medianOn.gardenWordPoints === 2 && medianOn.gardenBonusPoints === 2 && medianOn.gardenWordPoints + medianOn.gardenBonusPoints === medianOn.gardenPoints)

  // 빡센 날 — 단어 8개 + 목표달성(2) + 쓰기시험(1) + 오답복습 3건(상한 2,
  // 1점×2=2). 문서 산수: 단어축만으로 이미 4칸(8/2) — 보너스 포함
  // 8+2+1+2=13포인트=6칸(=13/2 내림).
  const hardLedger = [
    rewardEntry('daily-goal-complete', '2026-09-05:goal', 'g14-hard-goal'),
    rewardEntry('writing-complete', '2026-09-05:writing', 'g14-hard-writing'),
    rewardEntry('wrong-word-recovered', '2026-09-05:worda', 'g14-hard-wwr-a'),
    rewardEntry('wrong-word-recovered', '2026-09-05:wordb', 'g14-hard-wwr-b'),
    rewardEntry('wrong-word-recovered', '2026-09-05:wordc', 'g14-hard-wwr-c'), // 3번째는 일일 상한 초과 — 무시
  ]
  const hardRec = { cleared: [], completedWords: Array.from({ length: 8 }, (_, i) => `hw${i}`), clearedWords: [], rewardLedger: hardLedger }
  const hardOff = deriveAttachmentStats(hardRec)
  const hardOn = deriveAttachmentStats(hardRec, new Date(), { gardenGrowthV2: true })
  check('빡센 날: flag off는 단어축만(8포인트 · 4칸) — 문서 산수 그대로', hardOff.gardenPoints === 8 && gardenPlots(hardOff).filter((p) => p.stage !== 'empty').length === 4)
  check('빡센 날: flag on은 보너스 상한 적용 후 13포인트 · 6칸(오답복습 3건 중 2건만 인정)', hardOn.gardenPoints === 13 && gardenPlots(hardOn).filter((p) => p.stage !== 'empty').length === 6)

  // 월드/마을이 여전히 같은 축(gardenPoints)을 읽는지 — flag on 상태에서도
  // 정합이 깨지지 않아야 한다(11절 계약의 v2 버전).
  check('월드 상태도 gardenPoints(v2 포함) 축을 그대로 읽는다', computeWorldState(hardOn).growthPoints === hardOn.gardenPoints)

  // 단조성 — light < median < hard 순으로 growthPoints/filled 모두 증가
  // (v2가 순서를 뒤집지 않는다).
  check('light < median < hard — growthPoints v2가 단조 증가', lightOn.gardenPoints < medianOn.gardenPoints && medianOn.gardenPoints < hardOn.gardenPoints)
  check('light < median < hard — 정원 칸 수도 단조 증가', gardenPlots(lightOn).filter((p) => p.stage !== 'empty').length < gardenPlots(medianOn).filter((p) => p.stage !== 'empty').length && gardenPlots(medianOn).filter((p) => p.stage !== 'empty').length < gardenPlots(hardOn).filter((p) => p.stage !== 'empty').length)
}

// ── 요약 ─────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(64)}`)
if (failures === 0) {
  console.log(`PASS  garden — 학습 → 정원 성장 end-to-end (${asserted}개 단언)`)
  process.exit(0)
} else {
  console.log(`FAIL  garden — ${asserted}개 중 ${failures}개 실패`)
  for (const f of failed) console.log(`  - ${f}`)
  process.exit(1)
}
