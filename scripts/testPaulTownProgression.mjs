// scripts/testPaulTownProgression.mjs
//
// Paul Town 진행(월드 단계/정원 텃밭/마을 장소/모자/밀스톤/집 소품) — 경계
// 값·연결(잠금해제 순서)·persistence(직렬화/재수화)·멱등성·학생 시뮬레이션·
// UI 게이팅을 한 번에 고정하는 회귀 스위트(2026-09-04, TEST-ONLY 세션).
//
// 이 파일은 src/를 한 글자도 수정하지 않는다 — 실제 발견된 결함이 있으면
// FAIL로만 기록하고 원인/최소 수정안을 리포트에 적는다(수정은 별도 세션).
//
// 네트워크 0, Supabase 0, DB 접촉 0. 순수 함수 직접 import + 실제
// useStudent.js를 esbuild로 번들해 fakeReact.mjs 최소 훅 런타임으로
// 구동(기존 scripts/testGardenGrowthSources.mjs / testGardenGrowthFlow.mjs와
// 동일한 관례 재사용, 새 하네스 기법 발명 없음). SSR 구간은
// scripts/testSpellingDirectionWiring.mjs의 esbuild+react-dom/server 가상
// 모듈 스텁 기법을 그대로 재사용한다.
//
// 실행: node scripts/buildRaceBundle.mjs && node scripts/testPaulTownProgression.mjs
//   (또는 npm run verify:paul-town-progression)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { deriveAttachmentStats } from '../src/utils/attachment/attachmentCore.js'
import {
  WORLD_STAGES, computeWorldState, gardenPlots, PLOT_COUNT, POINTS_PER_STAGE, PLOT_STAGE_EMOJI,
} from '../src/utils/attachment/worldProgress.js'
import { TOWN_PLACES, townPlacesState, paulHomeDeco, HOME_DECO_ITEMS } from '../src/utils/attachment/paulTown.js'
import { HAT_CATALOG, HAT_THRESHOLDS, evaluateHatUnlocks } from '../src/utils/attachment/hatSystem.js'
import { CLEARED_MILESTONES, CLEARED_WORD_MILESTONES, STREAK_MILESTONES, detectNewMilestones } from '../src/utils/attachment/milestones.js'
import { createFakeClock, renderHook } from './fakeReact.mjs'

// ── 결과 집계 ────────────────────────────────────────────────────────────
let totalPassed = 0
let totalFailed = 0
let totalWarn = 0
const sectionStats = {} // name -> {passed, failed, warn, failures:[]}
let currentSection = ''

function bucket() {
  return (sectionStats[currentSection] ||= { passed: 0, failed: 0, warn: 0, failures: [] })
}
function check(label, cond) {
  const b = bucket()
  if (cond) { b.passed++; totalPassed++; console.log(`  PASS  ${label}`) }
  else { b.failed++; totalFailed++; b.failures.push(label); console.log(`  FAIL  ${label}`) }
  return cond
}
function warn(label) {
  const b = bucket()
  b.warn++; totalWarn++
  console.log(`  WARN  ${label}`)
}
function sectionHeader(name) {
  currentSection = name
  console.log(`\n-- ${name} --`)
}
function sectionTally() {
  const b = bucket()
  console.log(`   [tally] ${currentSection}: PASS ${b.passed} / FAIL ${b.failed} / WARN ${b.warn}`)
}

// ── facility 표 집계 ─────────────────────────────────────────────────────
const facilityMeta = {}
const facilityStatus = {} // id -> {boundary, persistence, idempotency, ui}
function defineFacility(id, meta) {
  facilityMeta[id] = meta
  facilityStatus[id] = { boundary: 'N/A', persistence: 'N/A', idempotency: 'N/A', ui: 'N/A' }
}
function markFacility(id, category, ok) {
  const st = facilityStatus[id]
  if (!st) return
  if (st[category] === 'FAIL') return
  st[category] = ok ? (st[category] === 'WARN' ? 'WARN' : 'PASS') : 'FAIL'
}
function markFacilityWarn(id, category) {
  const st = facilityStatus[id]
  if (!st || st[category] === 'FAIL') return
  st[category] = 'WARN'
}
function fcheck(id, category, label, cond) {
  const r = check(label, cond)
  markFacility(id, category, r)
  return r
}

console.log('\n=== [paul-town-progression] Paul Town 진행 — 경계/연결/persistence/멱등/학생 시뮬레이션/UI ===')

// ══════════════════════════════════════════════════════════════════════
// 1. BOUNDARY
// ══════════════════════════════════════════════════════════════════════
sectionHeader('1. BOUNDARY')

// 순수 helper — deriveAttachmentStats와 동일한 필드 모양의 최소 기본값.
// 각 테스트는 자신이 검증하는 필드 하나만 override해 다른 임계값이
// 우연히 같이 발화하지 않도록 격리한다.
function baseStats(overrides = {}) {
  return {
    clearedCount: 0,
    streak: 0,
    totalQuizCorrect: 0,
    masteredCount: 0,
    thisWeek: { daysStudied: 0 },
    firstMissionDayKey: null,
    gardenPoints: 0,
    clearedWordCount: 0,
    studiedDayCount: 0,
    totalStarsEarned: 0,
    studiedDays: [],
    improvedWordIds: [],
    lastStudiedKey: null,
    history: {},
    ...overrides,
  }
}

defineFacility('garden', { unlock: 'gardenPoints > 0', source: 'worldProgress.js pointsOf/gardenPlots', stored: 'N(파생)' })
for (const s of WORLD_STAGES) {
  if (s.id === 'garden') continue
  defineFacility(s.id === 'library' ? 'library-world' : s.id, {
    unlock: `gardenPoints >= ${s.minPoints}`, source: 'worldProgress.js WORLD_STAGES/computeWorldState', stored: 'N(파생)',
  })
}
defineFacility('museum', { unlock: 'gardenPoints>=30 && flag paulTownBuildings', source: 'paulTown.js TOWN_PLACES/townPlacesState', stored: 'N(파생)' })
defineFacility('library-town', { unlock: 'gardenPoints>=100 && flag paulTownBuildings (+attachmentBookshelf for entry)', source: 'paulTown.js + PaulTown.jsx canEnter', stored: 'N(파생)' })
defineFacility('clockTower', { unlock: 'gardenPoints>=150 && flag paulTownBuildings', source: 'paulTown.js TOWN_PLACES/townPlacesState', stored: 'N(파생)' })
for (const h of HAT_CATALOG) {
  defineFacility(h.id, { unlock: h.sourceLabel, source: 'hatSystem.js HAT_CATALOG/evaluateHatUnlocks', stored: 'Y(hatInventory append-only)' })
}
defineFacility('milestone-cleared', { unlock: `clearedCount in ${CLEARED_MILESTONES.join('/')}`, source: 'milestones.js CLEARED_MILESTONES', stored: 'Y(milestones append-only)' })
defineFacility('milestone-clearedWord', { unlock: `clearedWordCount in ${CLEARED_WORD_MILESTONES.join('/')}`, source: 'milestones.js CLEARED_WORD_MILESTONES', stored: 'Y(milestones append-only)' })
defineFacility('milestone-streak', { unlock: `streak in ${STREAK_MILESTONES.join('/')}`, source: 'milestones.js STREAK_MILESTONES', stored: 'Y(milestones append-only)' })
for (const d of HOME_DECO_ITEMS) {
  defineFacility(d.id, { unlock: d.name, source: 'paulTown.js HOME_DECO_ITEMS/paulHomeDeco', stored: 'N(파생)' })
}

// -- 1a) 월드 단계 (house/bridge/library/village/kingdom) --
{
  const worldStageOf = { house: 'house', bridge: 'bridge', library: 'library-world', village: 'village', kingdom: 'kingdom' }
  for (const s of WORLD_STAGES) {
    if (s.id === 'garden') continue
    const fid = worldStageOf[s.id]
    for (const delta of [-1, 0, 1]) {
      const points = s.minPoints + delta
      const world = computeWorldState({ gardenPoints: points })
      const stage = world.stages.find((x) => x.id === s.id)
      const expected = points >= s.minPoints
      fcheck(fid, 'boundary', `${s.name}(min=${s.minPoints}) points=${points} → unlocked=${expected}`, stage.unlocked === expected)
    }
  }
}

// -- 1b) 정원 텃밭 (points 1/2/3, 31/32/33, 127/128/129) --
{
  const STAGE_ORDER = Object.keys(PLOT_STAGE_EMOJI) // ['empty','seed','sprout','flower','tree'] — 실제 export에서 파생, 재구현 아님
  const expectedPlotStage = (points, i) => {
    const perPlotUnits = Math.max(0, Math.floor(points / POINTS_PER_STAGE))
    const base = Math.floor(perPlotUnits / PLOT_COUNT)
    const rem = perPlotUnits % PLOT_COUNT
    const units = base + (i < rem ? 1 : 0)
    return STAGE_ORDER[Math.min(units, STAGE_ORDER.length - 1)]
  }
  const expectedFilled = (points) => Math.min(Math.max(0, Math.floor(points / POINTS_PER_STAGE)), PLOT_COUNT)

  for (const points of [1, 2, 3, 31, 32, 33, 127, 128, 129]) {
    const plots = gardenPlots({ gardenPoints: points })
    const filled = plots.filter((p) => p.stage !== 'empty').length
    fcheck('garden', 'boundary', `정원 points=${points} → filled=${expectedFilled(points)}칸`, filled === expectedFilled(points))
    const stagesMatch = plots.every((p, i) => p.stage === expectedPlotStage(points, i))
    fcheck('garden', 'boundary', `정원 points=${points} → 칸별 단계가 라운드로빈 공식과 정확히 일치`, stagesMatch)
  }
  check('만개(전부 tree)는 정확히 128포인트부터', gardenPlots({ gardenPoints: 127 }).some((p) => p.stage !== 'tree') && gardenPlots({ gardenPoints: 128 }).every((p) => p.stage === 'tree'))
  check('129포인트도 계속 만개(오버플로우 없음)', gardenPlots({ gardenPoints: 129 }).every((p) => p.stage === 'tree'))
}

// -- 1c) 마을 장소 (museum/library/clockTower — 플래그 ON/OFF) --
{
  const facilityIdOf = { museum: 'museum', library: 'library-town', clockTower: 'clockTower' }
  const flagged = TOWN_PLACES.filter((p) => p.requiresFlag)
  for (const p of flagged) {
    const fid = facilityIdOf[p.id]
    for (const delta of [-1, 0, 1]) {
      const points = p.minCleared + delta
      const state = townPlacesState({ gardenPoints: points }, () => true).find((x) => x.id === p.id)
      const expected = points >= p.minCleared
      fcheck(fid, 'boundary', `${p.name}(minCleared=${p.minCleared}) points=${points} flagON → discovered=${expected}`, state.discovered === expected)
    }
    const neverState = townPlacesState({ gardenPoints: 10000 }, () => false).find((x) => x.id === p.id)
    fcheck(fid, 'boundary', `${p.name} — flag OFF는 points=10000이어도 절대 discovered 안 됨`, neverState.discovered === false)
  }
  const openPlaces = townPlacesState({ gardenPoints: 0 }, () => false)
  check('정원(garden) 장소는 항상 열려 있음(플래그/포인트 무관)', openPlaces.find((p) => p.id === 'garden').discovered === true)
  check('폴의 집(paulHome) 장소는 항상 열려 있음(플래그/포인트 무관)', openPlaces.find((p) => p.id === 'paulHome').discovered === true)
}

// -- 1d) 모자 8종 --
{
  const fieldHats = [
    { id: 'hat_explorer', field: 'clearedCount', threshold: HAT_THRESHOLDS.explorerCleared },
    { id: 'hat_chef', field: 'streak', threshold: HAT_THRESHOLDS.chefStreak },
    { id: 'hat_scientist', field: 'totalQuizCorrect', threshold: HAT_THRESHOLDS.scientistQuizCorrect },
    { id: 'hat_wizard', field: 'masteredCount', threshold: HAT_THRESHOLDS.wizardMastered },
    { id: 'hat_crown', field: 'clearedCount', threshold: HAT_THRESHOLDS.crownCleared },
  ]
  for (const { id, field, threshold } of fieldHats) {
    for (const delta of [-1, 0, 1]) {
      const value = threshold + delta
      const stats = baseStats({ [field]: value })
      const unlocks = evaluateHatUnlocks(stats, {}, [])
      const expected = value >= threshold
      fcheck(id, 'boundary', `${id} ${field}=${value}(threshold=${threshold}) → 신규 획득=${expected}`, unlocks.some((e) => e.hatId === id) === expected)
    }
  }
  // rose — 중첩 필드 thisWeek.daysStudied
  for (const delta of [-1, 0, 1]) {
    const value = HAT_THRESHOLDS.roseWeekDays + delta
    const stats = baseStats({ thisWeek: { daysStudied: value } })
    const unlocks = evaluateHatUnlocks(stats, {}, [])
    const expected = value >= HAT_THRESHOLDS.roseWeekDays
    fcheck('hat_rose', 'boundary', `hat_rose thisWeek.daysStudied=${value}(threshold=${HAT_THRESHOLDS.roseWeekDays}) → 신규 획득=${expected}`, unlocks.some((e) => e.hatId === 'hat_rose') === expected)
  }
  // starter — firstMissionDayKey 진위값(2상태)
  {
    const statsEmpty = baseStats({ firstMissionDayKey: '' })
    const statsSet = baseStats({ firstMissionDayKey: '2026-09-01' })
    fcheck('hat_starter', 'boundary', "hat_starter firstMissionDayKey='' → 미획득", !evaluateHatUnlocks(statsEmpty, {}, []).some((e) => e.hatId === 'hat_starter'))
    fcheck('hat_starter', 'boundary', "hat_starter firstMissionDayKey='2026-09-01' → 획득", evaluateHatUnlocks(statsSet, {}, []).some((e) => e.hatId === 'hat_starter'))
  }
  // graduation — ctx.completedUnits.length (0/1/2)
  for (const n of [0, 1, 2]) {
    const ctx = { completedUnits: Array.from({ length: n }, (_, i) => ({ unitId: `u${i}` })) }
    const unlocks = evaluateHatUnlocks(baseStats(), ctx, [])
    const expected = n >= 1
    fcheck('hat_graduation', 'boundary', `hat_graduation completedUnits.length=${n} → 신규 획득=${expected}`, unlocks.some((e) => e.hatId === 'hat_graduation') === expected)
  }
}

// -- 1e) 밀스톤 (cleared/clearedWord/streak) --
{
  for (const n of CLEARED_MILESTONES) {
    for (const delta of [-1, 0, 1]) {
      const value = n + delta
      const stats = baseStats({ clearedCount: value })
      const ids = detectNewMilestones(stats, {}, []).map((m) => m.id)
      const expected = value >= n
      fcheck('milestone-cleared', 'boundary', `cleared-${n} clearedCount=${value} → 발화=${expected}`, ids.includes(`cleared-${n}`) === expected)
    }
  }
  for (const n of CLEARED_WORD_MILESTONES) {
    for (const delta of [-1, 0, 1]) {
      const value = n + delta
      const stats = baseStats({ clearedWordCount: value })
      const ids = detectNewMilestones(stats, {}, []).map((m) => m.id)
      const expected = value >= n
      fcheck('milestone-clearedWord', 'boundary', `cleared-word-${n} clearedWordCount=${value} → 발화=${expected}`, ids.includes(`cleared-word-${n}`) === expected)
    }
  }
  for (const n of STREAK_MILESTONES) {
    for (const delta of [-1, 0, 1]) {
      const value = n + delta
      const stats = baseStats({ streak: value })
      const ids = detectNewMilestones(stats, {}, []).map((m) => m.id)
      const expected = value >= n
      fcheck('milestone-streak', 'boundary', `streak-${n} streak=${value} → 발화=${expected}`, ids.includes(`streak-${n}`) === expected)
    }
  }
}

// -- 1f) 폴의 집 소품 6종 --
{
  const decoField = {
    'deco-pot': 'clearedCount', 'deco-frame': 'masteredCount', 'deco-shelf-books': 'masteredCount',
    'deco-clock': 'studiedDayCount', 'deco-trophy': 'totalStarsEarned', 'deco-teddy': 'studiedDayCount',
  }
  const decoThreshold = { 'deco-pot': 5, 'deco-frame': 3, 'deco-shelf-books': 10, 'deco-clock': 10, 'deco-trophy': 50, 'deco-teddy': 30 }
  for (const item of HOME_DECO_ITEMS) {
    const field = decoField[item.id]
    const threshold = decoThreshold[item.id]
    for (const delta of [-1, 0, 1]) {
      const value = threshold + delta
      const stats = baseStats({ [field]: value })
      const deco = paulHomeDeco(stats)
      const expected = value >= threshold
      fcheck(item.id, 'boundary', `${item.id}(${field}>=${threshold}) value=${value} → 표시=${expected}`, deco.some((d) => d.id === item.id) === expected)
    }
  }
}
sectionTally()

// ══════════════════════════════════════════════════════════════════════
// 2. PROGRESSION LINKAGE
// ══════════════════════════════════════════════════════════════════════
sectionHeader('2. PROGRESSION LINKAGE')

check('WORLD_STAGES는 minPoints 기준 오름차순 정렬(구조로 순서 보장)', WORLD_STAGES.every((s, i) => i === 0 || s.minPoints > WORLD_STAGES[i - 1].minPoints))

{
  // 0..300 전 구간에서 "낮은 단계가 잠긴 채 높은 단계가 열림"이 절대 없음(prefix 성질)
  let prefixViolation = null
  for (let points = 0; points <= 300 && !prefixViolation; points++) {
    const world = computeWorldState({ gardenPoints: points })
    for (let i = 1; i < world.stages.length; i++) {
      if (world.stages[i].unlocked && !world.stages[i - 1].unlocked) { prefixViolation = { points, i }; break }
    }
  }
  check('points 0..300 전 구간에서 잠금해제된 구역은 항상 사다리의 접두사(prefix)를 이룬다', prefixViolation === null)
}

fcheck('house', 'boundary', 'prev-stage-incomplete: points=59 → house 열림, bridge 잠김', computeWorldState({ gardenPoints: 59 }).stages.find((s) => s.id === 'house').unlocked === true && computeWorldState({ gardenPoints: 59 }).stages.find((s) => s.id === 'bridge').unlocked === false)
fcheck('bridge', 'boundary', 'exact: points=60 → bridge 정확히 열림', computeWorldState({ gardenPoints: 60 }).stages.find((s) => s.id === 'bridge').unlocked === true)
fcheck('bridge', 'boundary', 'over: points=61 → bridge 여전히 열림', computeWorldState({ gardenPoints: 61 }).stages.find((s) => s.id === 'bridge').unlocked === true)

{
  // nextStage 정확성 — 각 경계에서
  for (const s of WORLD_STAGES) {
    if (s.id === 'garden') continue
    const idx = WORLD_STAGES.findIndex((x) => x.id === s.id)
    const following = WORLD_STAGES[idx + 1] || null
    const worldBefore = computeWorldState({ gardenPoints: s.minPoints - 1 })
    check(`nextStage: points=${s.minPoints - 1} → nextStage.id === '${s.id}'`, worldBefore.nextStage?.id === s.id)
    const worldAt = computeWorldState({ gardenPoints: s.minPoints })
    if (following) check(`nextStage: points=${s.minPoints} → nextStage.id === '${following.id}'`, worldAt.nextStage?.id === following.id)
    else check(`nextStage: points=${s.minPoints}(최상위 kingdom) → nextStage === null`, worldAt.nextStage === null)
  }
}

{
  // town places consistency with world axis (같은 gardenPoints 축을 읽으므로 임계값 일치가 곧 동치)
  const cases = [29, 30, 31, 99, 100, 101, 149, 150, 151]
  for (const points of cases) {
    const world = computeWorldState({ gardenPoints: points })
    const town = townPlacesState({ gardenPoints: points }, () => true)
    const houseUnlocked = world.stages.find((s) => s.id === 'house').unlocked
    const libraryUnlocked = world.stages.find((s) => s.id === 'library').unlocked
    const villageUnlocked = world.stages.find((s) => s.id === 'village').unlocked
    fcheck('museum', 'boundary', `points=${points}: museum discovered === house unlocked(둘 다 min=30)`, town.find((p) => p.id === 'museum').discovered === houseUnlocked)
    fcheck('library-town', 'boundary', `points=${points}: 마을 도서관 discovered === world library unlocked(둘 다 min=100)`, town.find((p) => p.id === 'library').discovered === libraryUnlocked)
    fcheck('clockTower', 'boundary', `points=${points}: 시계탑 discovered === village unlocked(둘 다 min=150)`, town.find((p) => p.id === 'clockTower').discovered === villageUnlocked)
  }
}
sectionTally()

// ══════════════════════════════════════════════════════════════════════
// 준비 — useStudent 실제 훅 구동(persistence/idempotency 섹션용)
// ══════════════════════════════════════════════════════════════════════
class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}
class FakeDocument {
  constructor() { this.visibilityState = 'visible'; this.listeners = {} }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn) }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn) }
  dispatch(type) { (this.listeners[type] || []).forEach((fn) => fn()) }
}

const raceStub = await import(pathToFileURL('scripts/wordLibraryRaceStub.mjs').href)
const bundle = await import(pathToFileURL('scripts/.tmp/useStudent.race.bundle.mjs').href)
const { useStudent, mergeProgressRecords, normalizeRecord, getLocalRecordRaw } = bundle

function freshEnv() {
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)
  globalThis.localStorage = new FakeStorage()
  globalThis.document = new FakeDocument()
}
function mount(id) {
  freshEnv()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(id), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  return host
}
// mount()와 달리 freshEnv()를 호출하지 않는다 — "앱 재시작/새로고침"을
// 시뮬레이션하려면 기존 globalThis.localStorage(디바이스의 영속 상태)를
// 그대로 둔 채 훅만 다시 마운트해야 한다(testGardenGrowthSources.mjs
// mount(id, {storage}) 패턴 재사용).
function remount(id) {
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(id), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  return host
}
const settle = (host) => { host.rerender(); return host }
function garden(host) {
  const r = host.result
  const stats = deriveAttachmentStats({
    cleared: r.cleared, completedWords: r.completedWords, clearedWords: r.clearedWords,
    wordStatus: r.wordStatus, missions: r.missions, history: r.history,
    streak: r.streak, spellingReviewQueue: r.spellingReviewQueue,
  })
  return { stats, points: stats.gardenPoints, filled: gardenPlots(stats).filter((p) => p.stage !== 'empty').length }
}
// 정규화된 record에서 비교 가능한 파생 상태만 뽑아 직렬화(필드 순서에
// 흔들리지 않는 "byte-identical 재수화" 판정용).
function canon(rec) {
  const stats = deriveAttachmentStats(rec)
  return JSON.stringify({
    gardenPoints: stats.gardenPoints,
    clearedCount: stats.clearedCount,
    plots: gardenPlots(stats).map((p) => p.stage),
    hatIds: [...(rec.hatInventory || [])].map((h) => h.hatId).sort(),
    milestoneIds: [...(rec.milestones || [])].map((m) => m.id).sort(),
    equippedHatId: rec.equippedHatId ?? null,
  })
}

// ══════════════════════════════════════════════════════════════════════
// 3. PERSISTENCE / REHYDRATION
// ══════════════════════════════════════════════════════════════════════
sectionHeader('3. PERSISTENCE / REHYDRATION')
{
  const id = 'QA_PTP_persist'
  const host = mount(id)
  for (let i = 0; i < 35; i++) { host.result.recordQuizAnswer(`ptp_word_${i}`, true); settle(host) }
  host.result.grantHats([
    { hatId: 'hat_explorer', earnedAt: '2026-01-02T00:00:00.000Z', source: 'test' },
    { hatId: 'hat_chef', earnedAt: '2026-01-03T00:00:00.000Z', source: 'test' },
  ])
  settle(host)
  host.result.addMilestones([
    { id: 'first-mission-day', type: 'firstMission', at: '2026-01-01T00:00:00.000Z', emoji: '🌟', title: 't', desc: 'd', data: {} },
    { id: 'cleared-word-30', type: 'clearedWord', at: '2026-01-04T00:00:00.000Z', emoji: '📚', title: 't', desc: 'd', data: {} },
    { id: 'streak-7', type: 'streak', at: '2026-01-05T00:00:00.000Z', emoji: '🔥', title: 't', desc: 'd', data: {} },
  ])
  settle(host)
  host.result.equipHat('hat_explorer')
  settle(host)

  const before = garden(host)
  fcheck('garden', 'persistence', '사전 조건: 서로 다른 단어 35개 학습 → 정원 35포인트', before.points === 35)
  check('사전 조건: hatInventory 2개', host.result.hatInventory.length === 2)
  check('사전 조건: milestones 3개', host.result.milestones.length === 3)
  check('사전 조건: equippedHatId = hat_explorer', host.result.equippedHatId === 'hat_explorer')

  // progress_data JSON 직렬화(= syncStudentProgress가 싣는 fullRecord와
  // 동일 모양 — 실제 로컬 저장소에 쓰인 raw record를 그대로 읽는다)
  const rawRecord = getLocalRecordRaw(id)
  const cloud = JSON.parse(JSON.stringify(rawRecord)) // "네트워크를 타고 온 progress_data" 시뮬레이션

  const normalized = normalizeRecord(cloud, id)
  const normStats = deriveAttachmentStats(normalized)
  fcheck('garden', 'persistence', 'normalizeRecord(cloud) 단독 — gardenPoints 35 보존', normStats.gardenPoints === 35)
  check('normalizeRecord(cloud) — house(30) 잠금해제', computeWorldState(normStats).stages.find((s) => s.id === 'house').unlocked === true)
  check('normalizeRecord(cloud) — hatInventory 2개 보존(중복 없음)', normalized.hatInventory.length === 2)
  check('normalizeRecord(cloud) — milestones 3개 보존(중복 없음)', normalized.milestones.length === 3)
  check('normalizeRecord(cloud) — equippedHatId 보존', normalized.equippedHatId === 'hat_explorer')

  // 새 기기(빈 로컬) → 클라우드 백업 복원
  const merged1 = mergeProgressRecords({}, cloud, id)
  const merged1Stats = deriveAttachmentStats(merged1)
  fcheck('garden', 'persistence', 'mergeProgressRecords(빈 로컬, cloud) — gardenPoints 35', merged1Stats.gardenPoints === 35)
  check('mergeProgressRecords(빈 로컬, cloud) — 정원 칸이 normalizeRecord 단독과 동일', JSON.stringify(gardenPlots(merged1Stats)) === JSON.stringify(gardenPlots(normStats)))
  check('mergeProgressRecords(빈 로컬, cloud) — hatInventory 2개(중복 없음)', merged1.hatInventory.length === 2)
  check('mergeProgressRecords(빈 로컬, cloud) — milestones 3개(중복 없음)', merged1.milestones.length === 3)
  check('mergeProgressRecords(빈 로컬, cloud) — equippedHatId 보존', merged1.equippedHatId === 'hat_explorer')

  // 이중 재수화 — 같은 클라우드를 자기 자신과 병합해도 동일
  const merged2 = mergeProgressRecords(cloud, cloud, id)
  fcheck('garden', 'persistence', 'mergeProgressRecords(cloud, cloud) 이중 재수화 — canon 동일', canon(merged1) === canon(merged2))

  // 두 번째 새로고침 — merged1을 다시 cloud와 병합해도 상태 불변(byte-identical)
  const merged3 = mergeProgressRecords(merged1, cloud, id)
  check('두 번째 재수화(merged1을 cloud와 재병합) — canon 동일(byte-identical)', canon(merged1) === canon(merged3))

  // 구버전 백업(cleared+history만 — 신규 필드 전무)
  const oldBackup = { cleared: ['ow1', 'ow2', 'ow3'], history: {} }
  let thrown = false
  let normOld
  try { normOld = normalizeRecord(oldBackup, 'QA_PTP_oldbackup') } catch { thrown = true }
  check('구버전 백업(cleared+history만) — normalizeRecord가 throw 없이 정규화', !thrown)
  const oldStats = deriveAttachmentStats(normOld)
  check('구버전 백업 — gardenPoints(3)이 clearedCount(3) 폴백과 값이 같음(신규 필드 없어도 정합)', oldStats.gardenPoints === 3 && oldStats.clearedCount === 3)
  const worldFromDerived = computeWorldState(oldStats)
  const worldFromFallback = computeWorldState({ clearedCount: 3 })
  check('구버전 백업의 world 상태 == clearedCount 폴백 경로의 world 상태', JSON.stringify(worldFromDerived.stages.map((s) => s.unlocked)) === JSON.stringify(worldFromFallback.stages.map((s) => s.unlocked)))
}
sectionTally()

// ══════════════════════════════════════════════════════════════════════
// 4. IDEMPOTENCY
// ══════════════════════════════════════════════════════════════════════
sectionHeader('4. IDEMPOTENCY')
{
  const h1 = mount('QA_PTP_idem_qq')
  h1.result.recordQuizAnswer('idemword', true); settle(h1)
  h1.result.recordQuizAnswer('idemword', true); settle(h1)
  fcheck('garden', 'idempotency', '같은 단어 퀴즈 정답 2회 → clearedWords에 정확히 1번만', h1.result.clearedWords.filter((w) => w === 'idemword').length === 1)
  check('같은 단어 퀴즈 정답 2회 → 정원 포인트 +1만(중복 아님)', garden(h1).points === 1)

  const h2 = mount('QA_PTP_idem_qs')
  h2.result.recordQuizAnswer('idemword2', true); settle(h2)
  h2.result.recordSpellingAnswer('idemword2', true); settle(h2)
  fcheck('garden', 'idempotency', '같은 단어 퀴즈+철자 둘 다 정답 → clearedWords 1번만', h2.result.clearedWords.filter((w) => w === 'idemword2').length === 1)
  check('같은 단어 퀴즈+철자 → 정원 포인트 +1만', garden(h2).points === 1)

  const h3 = mount('QA_PTP_idem_hat')
  h3.result.grantHats([{ hatId: 'hat_explorer', earnedAt: 't1', source: 's' }]); settle(h3)
  h3.result.grantHats([{ hatId: 'hat_explorer', earnedAt: 't2', source: 's' }]); settle(h3)
  fcheck('hat_explorer', 'idempotency', '같은 hatId로 grantHats 2회 → hatInventory 1개(최초 earnedAt 보존)', h3.result.hatInventory.length === 1 && h3.result.hatInventory[0].earnedAt === 't1')

  const h4 = mount('QA_PTP_idem_ms')
  h4.result.addMilestones([{ id: 'streak-7', type: 'streak', at: 't1', emoji: '🔥', title: 't', desc: 'd', data: {} }]); settle(h4)
  h4.result.addMilestones([{ id: 'streak-7', type: 'streak', at: 't2', emoji: '🔥', title: 't', desc: 'd', data: {} }]); settle(h4)
  fcheck('milestone-streak', 'idempotency', '같은 id로 addMilestones 2회 → milestones 1개(최초 at 보존)', h4.result.milestones.length === 1 && h4.result.milestones[0].at === 't1')

  // 두 기기 병합 — 같은 모자, 다른 earnedAt → 더 이른 시각 채택
  const recA = { hatInventory: [{ hatId: 'hat_x', earnedAt: '2026-01-05T00:00:00.000Z', source: 'a' }] }
  const recB = { hatInventory: [{ hatId: 'hat_x', earnedAt: '2026-01-01T00:00:00.000Z', source: 'b' }] }
  const mergedHat = mergeProgressRecords(recA, recB, 'QA_PTP_idem_merge_hat')
  fcheck('garden', 'idempotency', '두 기기 병합(같은 hatId, 다른 earnedAt) → 1개, 더 이른 시각 채택', mergedHat.hatInventory.length === 1 && mergedHat.hatInventory[0].earnedAt === '2026-01-01T00:00:00.000Z')

  const recC = { milestones: [{ id: 'm_x', type: 'x', at: '2026-02-10T00:00:00.000Z' }] }
  const recD = { milestones: [{ id: 'm_x', type: 'x', at: '2026-02-01T00:00:00.000Z' }] }
  const mergedMs = mergeProgressRecords(recC, recD, 'QA_PTP_idem_merge_ms')
  check('두 기기 병합(같은 milestone id, 다른 at) → 1개, 더 이른 시각 채택', mergedMs.milestones.length === 1 && mergedMs.milestones[0].at === '2026-02-01T00:00:00.000Z')

  // 별/원장은 모자·밀스톤 지급과 무관
  const h5 = mount('QA_PTP_idem_reward_iso')
  const starsBefore = h5.result.totalStars
  const ledgerBefore = (h5.result.rewardLedger || []).length
  h5.result.grantHats([{ hatId: 'hat_starter', earnedAt: 't', source: 's' }]); settle(h5)
  h5.result.addMilestones([{ id: 'm_iso', type: 'x', at: 't' }]); settle(h5)
  check('모자/밀스톤 지급 전후 totalStars 불변(보상과 무관)', h5.result.totalStars === starsBefore)
  check('모자/밀스톤 지급 전후 rewardLedger 길이 불변(보상과 무관)', (h5.result.rewardLedger || []).length === ledgerBefore)

  // 이미 소유한 모자는 재평가에서 다시 나오지 않음
  const fullStats = baseStats({
    firstMissionDayKey: 'x', clearedCount: 300, streak: 10, totalQuizCorrect: 150, masteredCount: 40,
    thisWeek: { daysStudied: 6 },
  })
  const ownedAll = HAT_CATALOG.map((h) => h.id)
  const reeval = evaluateHatUnlocks(fullStats, { completedUnits: [{ unitId: 'u1' }] }, ownedAll)
  check('8종 조건을 전부 충족해도 이미 소유한 모자는 evaluateHatUnlocks가 다시 반환하지 않음', reeval.length === 0)
}
sectionTally()

// ══════════════════════════════════════════════════════════════════════
// 5. STUDENT SIMULATIONS A–D
// ══════════════════════════════════════════════════════════════════════
sectionHeader('5. STUDENT SIMULATIONS A-D')

function roundTrip(rawRecord, id) {
  const normalized = normalizeRecord(rawRecord, id)
  const merged1 = mergeProgressRecords({}, normalized, id)
  const merged2 = mergeProgressRecords(normalized, normalized, id)
  return { normalized, merged1, merged2, ok: canon(normalized) === canon(merged1) && canon(merged1) === canon(merged2) }
}

// A) 신규 학생 — 빈 record
{
  const normA = normalizeRecord({}, 'QA_PTP_A')
  const statsA = deriveAttachmentStats(normA)
  const worldA = computeWorldState(statsA)
  check('A) 신규 학생: gardenPoints 0', statsA.gardenPoints === 0)
  check('A) 신규 학생: 정원(garden)만 잠금해제, 나머지 전부 잠김', worldA.stages.filter((s) => s.unlocked).length === 1 && worldA.stages[0].id === 'garden')
  check('A) 신규 학생: 정원 텃밭 0칸', gardenPlots(statsA).every((p) => p.stage === 'empty'))
  check('A) 신규 학생: 신규 획득 모자 없음', evaluateHatUnlocks(statsA, {}, []).length === 0)
  const rtA = roundTrip({}, 'QA_PTP_A_rt')
  check('A) round-trip(persistence) 후에도 동일 파생 상태', rtA.ok)
}

// B) 기존 heavy 학생 — gardenPoints 295(clearedCount 210 부분집합), streak 30, 모자 3개 소유
{
  const wWords = Array.from({ length: 295 }, (_, i) => `ptp_b_word_${i}`)
  const rawB = {
    clearedWords: wWords,
    cleared: wWords.slice(0, 210), // cleared ⊆ clearedWords → 합집합은 그대로 295, clearedCount만 210
    streak: 30,
    hatInventory: [
      { hatId: 'hat_starter', earnedAt: '2026-01-01T00:00:00.000Z', source: 's' },
      { hatId: 'hat_explorer', earnedAt: '2026-01-02T00:00:00.000Z', source: 's' },
      { hatId: 'hat_chef', earnedAt: '2026-01-03T00:00:00.000Z', source: 's' },
    ],
  }
  const normB = normalizeRecord(rawB, 'QA_PTP_B')
  const statsB = deriveAttachmentStats(normB)
  check('B) 기존 heavy: gardenPoints 295', statsB.gardenPoints === 295)
  check('B) 기존 heavy: clearedCount 210(별개 축, gardenPoints와 다름)', statsB.clearedCount === 210)
  const worldB = computeWorldState(statsB)
  check('B) 기존 heavy: kingdom(250) 잠금해제', worldB.stages.find((s) => s.id === 'kingdom').unlocked === true)
  const townB = townPlacesState(statsB, () => true)
  check('B) 기존 heavy: 플래그 ON이면 마을 장소(museum/library/clockTower) 전부 discovered', ['museum', 'library', 'clockTower'].every((id) => townB.find((p) => p.id === id).discovered))
  const ownedB = normB.hatInventory.map((h) => h.hatId)
  const unlocksB = evaluateHatUnlocks(statsB, { completedUnits: [{ unitId: 'u1', unitName: 'Unit 1' }] }, ownedB)
  check('B) 기존 heavy: hat_crown(clearedCount>=200, 미소유) → 신규 획득 후보로 나옴', unlocksB.some((e) => e.hatId === 'hat_crown'))
  check('B) 기존 heavy: hat_chef(streak>=7, 이미 소유) → 재지급 안 됨', !unlocksB.some((e) => e.hatId === 'hat_chef'))
  const rtB = roundTrip(rawB, 'QA_PTP_B_rt')
  check('B) round-trip(persistence) 후에도 동일 파생 상태', rtB.ok)
}

// C) 정원은 자랐지만 house 잠김 — points 29
{
  const rawC = { clearedWords: Array.from({ length: 29 }, (_, i) => `ptp_c_word_${i}`) }
  const normC = normalizeRecord(rawC, 'QA_PTP_C')
  const statsC = deriveAttachmentStats(normC)
  check('C) points=29: gardenPoints 29', statsC.gardenPoints === 29)
  const plotsC = gardenPlots(statsC)
  check('C) points=29: 정원 텃밭 14칸 씨앗(floor(29/2))', plotsC.filter((p) => p.stage !== 'empty').length === 14)
  const worldC = computeWorldState(statsC)
  check('C) points=29: house 잠김', worldC.stages.find((s) => s.id === 'house').unlocked === false)
  check('C) points=29: nextStage === house, 남은 포인트 1', worldC.nextStage?.id === 'house' && (worldC.nextStage.minPoints - worldC.growthPoints) === 1)
  const rtC = roundTrip(rawC, 'QA_PTP_C_rt')
  check('C) round-trip(persistence) 후에도 동일 파생 상태', rtC.ok)
}

// D) 다중 잠금해제 — points 160, 모자 2개, 밀스톤 4개
{
  const rawD = {
    clearedWords: Array.from({ length: 160 }, (_, i) => `ptp_d_word_${i}`),
    hatInventory: [
      { hatId: 'hat_starter', earnedAt: 't1', source: 's' },
      { hatId: 'hat_chef', earnedAt: 't2', source: 's' },
    ],
    milestones: [
      { id: 'm1', type: 'x', at: 't1' }, { id: 'm2', type: 'x', at: 't2' },
      { id: 'm3', type: 'x', at: 't3' }, { id: 'm4', type: 'x', at: 't4' },
    ],
  }
  const normD = normalizeRecord(rawD, 'QA_PTP_D')
  const statsD = deriveAttachmentStats(normD)
  check('D) points=160: gardenPoints 160', statsD.gardenPoints === 160)
  const worldD = computeWorldState(statsD)
  check('D) points=160: village(150) 잠금해제, kingdom(250) 잠김', worldD.stages.find((s) => s.id === 'village').unlocked === true && worldD.stages.find((s) => s.id === 'kingdom').unlocked === false)
  const townD = townPlacesState(statsD, () => true)
  check('D) points=160: museum/library/clockTower 전부 discovered(플래그 ON)', ['museum', 'library', 'clockTower'].every((id) => townD.find((p) => p.id === id).discovered))
  check('D) 모자 2개, 밀스톤 4개 그대로 보존', normD.hatInventory.length === 2 && normD.milestones.length === 4)
  const rtD = roundTrip(rawD, 'QA_PTP_D_rt')
  check('D) round-trip(persistence) 후에도 동일 파생 상태', rtD.ok)
}
sectionTally()

// ══════════════════════════════════════════════════════════════════════
// 5b. LEGACY FIXTURE · 다중기기 out-of-order/중복 이벤트 · 재적재 2회
//     (overnight QA track T1, 2026-09-04 확장)
// ══════════════════════════════════════════════════════════════════════
sectionHeader('5b. LEGACY FIXTURE · MULTI-DEVICE OUT-OF-ORDER · RELOAD x2')

// E) 레거시 학생 — clearedWords/hatInventory/milestones 세 필드가 아예
// 없는(cleared/history/missions만 있는) 아주 옛 백업. normalizeRecord가
// throw 없이 정규화하고, world 상태가 clearedCount 폴백 경로와 완전히
// 동일해야 한다(pointsOf의 `?? stats.clearedCount` 폴백, worldProgress.js
// L38 주석 참고).
{
  const rawE = {
    cleared: ['leg_a', 'leg_b', 'leg_c'],
    history: { 'Mon Jan 05 2026': { studied: true, categoriesCompleted: 4, quizCorrect: 3, quizTotal: 3 } },
    missions: [{ wordId: 'leg_a', correctCount: 3, done: true }],
    // 의도적으로 없음: clearedWords, completedWords, hatInventory, milestones,
    // spellingReviewQueue, wordStatus, equippedHatId — 전부 normalizeRecord의
    // 기본값(freshRecord)으로만 채워져야 한다.
  }
  let threwE = false
  let normE
  try { normE = normalizeRecord(rawE, 'QA_PTP_E_legacy') } catch { threwE = true }
  check('E) 레거시(clearedWords/hatInventory/milestones 필드 자체가 없음) — normalizeRecord가 throw 없이 정규화', !threwE)
  check('E) 정규화 후 clearedWords/completedWords/hatInventory/milestones는 안전한 빈 배열로 채워짐',
    Array.isArray(normE.clearedWords) && normE.clearedWords.length === 0 &&
    Array.isArray(normE.completedWords) && normE.completedWords.length === 0 &&
    Array.isArray(normE.hatInventory) && normE.hatInventory.length === 0 &&
    Array.isArray(normE.milestones) && normE.milestones.length === 0)

  const statsE = deriveAttachmentStats(normE)
  check('E) gardenPoints === clearedCount === 3 (clearedWords/completedWords가 비어 있어 cleared만 반영)', statsE.gardenPoints === 3 && statsE.clearedCount === 3)

  // world 상태 — 실제 파생 stats 경로 vs "gardenPoints 필드조차 없는" 순수
  // clearedCount-only stats 폴백 경로가 완전히 동치인지 깊은 비교(stages
  // 전체 + nextStage + growthPoints, 1c 섹션의 unlocked bool만 비교보다
  // 더 엄격).
  const worldFromStatsE = computeWorldState(statsE)
  const worldFromClearedCountOnly = computeWorldState({ clearedCount: statsE.clearedCount })
  check('E) computeWorldState(실제 파생 statsE) === computeWorldState({clearedCount: 3}) 폴백 경로 (JSON 깊은 동치, growthPoints/nextStage 포함)',
    JSON.stringify(worldFromStatsE) === JSON.stringify(worldFromClearedCountOnly))

  const rtE = roundTrip(rawE, 'QA_PTP_E_legacy_rt')
  check('E) round-trip(persistence) 후에도 동일 파생 상태', rtE.ok)
}

// F) 다중 기기 — hat/milestone을 실제 훅(grantHats/addMilestones)으로
// "기기 A"와 "기기 B"에 서로 다른(더 이른/더 늦은) earnedAt으로 독립
// 기록한 뒤, 각 기기의 raw record를 mergeProgressRecords로 병합 — 도착
// 순서를 바꿔도(A,B / B,A) 결과가 같고 항상 더 이른 시각이 채택되는지
// 확인(섹션 4는 손으로 구성한 record 리터럴로 같은 계약을 순수 검증했다
// — 여기서는 실제 훅 쓰기 경로까지 왕복시켜 같은 결론을 재확인).
{
  const deviceA = mount('QA_PTP_MD_shared')
  deviceA.result.grantHats([{ hatId: 'hat_wizard', earnedAt: '2026-03-05T09:00:00.000Z', source: 'deviceA' }])
  settle(deviceA)
  deviceA.result.addMilestones([{ id: 'streak-30', type: 'streak', at: '2026-03-05T09:00:00.000Z', emoji: '🔥', title: 't', desc: 'd', data: {} }])
  settle(deviceA)
  const rawA = getLocalRecordRaw('QA_PTP_MD_shared')

  // 기기 B — 완전히 별개 저장소(다른 물리 기기 시뮬레이션), 같은 학생 id,
  // 같은 hatId/milestone id인데 더 이른 시각.
  const deviceB = mount('QA_PTP_MD_shared')
  deviceB.result.grantHats([{ hatId: 'hat_wizard', earnedAt: '2026-01-10T09:00:00.000Z', source: 'deviceB' }])
  settle(deviceB)
  deviceB.result.addMilestones([{ id: 'streak-30', type: 'streak', at: '2026-01-10T09:00:00.000Z', emoji: '🔥', title: 't', desc: 'd', data: {} }])
  settle(deviceB)
  const rawB = getLocalRecordRaw('QA_PTP_MD_shared')

  const mergedAB = mergeProgressRecords(rawA, rawB, 'QA_PTP_MD_shared')
  const mergedBA = mergeProgressRecords(rawB, rawA, 'QA_PTP_MD_shared')
  check('F) 다중기기 병합(A,B) — hat_wizard 1개, 더 이른 시각(기기B, 01-10) 채택', mergedAB.hatInventory.length === 1 && mergedAB.hatInventory[0].earnedAt === '2026-01-10T09:00:00.000Z')
  check('F) 도착 순서를 바꿔도(B,A) 동일한 결과(교환법칙)', canon(mergedAB) === canon(mergedBA))
  check('F) milestone streak-30도 동일하게 더 이른 시각(01-10) 채택', mergedAB.milestones.find((m) => m.id === 'streak-30')?.at === '2026-01-10T09:00:00.000Z')

  // "기기 C" — 병합 결과를 새 저장소에 주입해 재적재(reload 1회차).
  globalThis.localStorage = new FakeStorage()
  globalThis.document = new FakeDocument()
  globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({ QA_PTP_MD_shared: mergedAB }))
  const deviceC = remount('QA_PTP_MD_shared') // mount()가 아니라 remount() — freshEnv()가 방금 주입한 storage를 지우면 안 된다
  check('F) 기기C 최초 재적재 — hatInventory 1개, earnedAt 보존', deviceC.result.hatInventory.length === 1 && deviceC.result.hatInventory[0].earnedAt === '2026-01-10T09:00:00.000Z')
  check('F) 기기C 최초 재적재 — milestones에 streak-30 보존', deviceC.result.milestones.some((m) => m.id === 'streak-30'))
  const canonAfterFirstLoad = canon(getLocalRecordRaw('QA_PTP_MD_shared'))

  // 재적재 2회 — 같은 저장소를 두 번 연속 새로고침(remount)해도 상태가
  // 완전히 그대로(멱등, 값 소실/중복 증식 없음).
  const reload1 = remount('QA_PTP_MD_shared')
  settle(reload1)
  const canonReload1 = canon(getLocalRecordRaw('QA_PTP_MD_shared'))
  check('F) 재적재 1회차 — canon 동일(값 소실/증식 없음)', canonReload1 === canonAfterFirstLoad)
  check('F) 재적재 1회차 — hatInventory/milestones 개수 불변', reload1.result.hatInventory.length === 1 && reload1.result.milestones.length === 1)

  const reload2 = remount('QA_PTP_MD_shared')
  settle(reload2)
  const canonReload2 = canon(getLocalRecordRaw('QA_PTP_MD_shared'))
  check('F) 재적재 2회차(연속) — canon 동일(2번째도 안정)', canonReload2 === canonAfterFirstLoad)
  check('F) 재적재 2회차 — hatInventory/milestones 개수 불변(중복 누적 없음)', reload2.result.hatInventory.length === 1 && reload2.result.milestones.length === 1)
}
sectionTally()

// ══════════════════════════════════════════════════════════════════════
// 6. UI GATING
// ══════════════════════════════════════════════════════════════════════
sectionHeader('6. UI GATING (정적)')
const gardenSrc = readFileSync(path.resolve('src/components/EnglishGarden.jsx'), 'utf8')
const paulTownSrc = readFileSync(path.resolve('src/components/PaulTown.jsx'), 'utf8')

{
  const uiOk1 = check('EnglishGarden.jsx가 world.stages를 순회해 6개 단계 행을 렌더(정적)', /world\.stages\.map/.test(gardenSrc))
  const uiOk2 = check('EnglishGarden.jsx가 computeWorldState를 사용(정적)', /computeWorldState\s*\(/.test(gardenSrc))
  const uiOk3 = check('EnglishGarden.jsx가 gardenPlots를 사용(정적)', /gardenPlots\s*\(/.test(gardenSrc))
  // 'attachmentWorldFull' 문자열 자체는 헤더 주석에도 1회 등장하므로,
  // 실제 호출 지점(isFeatureEnabled('attachmentWorldFull'))만 센다.
  const wf = [...gardenSrc.matchAll(/isFeatureEnabled\('attachmentWorldFull'\)/g)]
  const uiOk4 = check('isFeatureEnabled(attachmentWorldFull) 호출이 정확히 1곳(라벨 텍스트 분기 전용)뿐', wf.length === 1)
  const uiOk5 = check('그 1곳이 showFullWorld 라벨 삼항식 안에 있음(잠금해제 로직 자체에는 관여하지 않음)', /showFullWorld \? '열려 있어요!' : '열렸어요/.test(gardenSrc))
  for (const ok of [uiOk1, uiOk2, uiOk3, uiOk4, uiOk5]) markFacility('garden', 'ui', ok)
}
{
  const ok = check("PaulTown.jsx canEnter가 library 입장에 attachmentBookshelf 플래그를 추가로 요구(정적)", /canEnter\s*=\s*\(p\)\s*=>\s*p\.id\s*!==\s*'library'\s*\|\|\s*isFeatureEnabled\('attachmentBookshelf'\)/.test(paulTownSrc))
  markFacility('library-town', 'ui', ok)
}

// -- SSR: 실제 EnglishGarden.jsx를 렌더해 house 행이 잠금/해제로 실제로 갈리는지 --
let ssrAttempted = false
try {
  const esbuild = (await import('esbuild')).default
  const VIRTUAL_FEATURES = {
    contents: `export const isFeatureEnabled = (name) => (globalThis.__SSR_FLAGS__ || {})[name] === true`,
    loader: 'js',
  }
  await esbuild.build({
    entryPoints: ['src/components/EnglishGarden.jsx'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outdir: 'scripts/.tmp/paulTownProgressionSsr',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    plugins: [{
      name: 'features-stub',
      setup(build) {
        build.onResolve({ filter: /config[\\/]features$/ }, () => ({ path: 'v:features', namespace: 'v' }))
        build.onLoad({ filter: /^v:features$/, namespace: 'v' }, () => VIRTUAL_FEATURES)
      },
    }],
  })
  ssrAttempted = true
  const React = (await import('react')).default
  const { renderToStaticMarkup } = await import('react-dom/server')
  const mod = await import(pathToFileURL(path.resolve('scripts/.tmp/paulTownProgressionSsr/EnglishGarden.js')).href)
  const EnglishGarden = mod.default

  globalThis.__SSR_FLAGS__ = { attachmentWorldFull: false }
  const html29 = renderToStaticMarkup(React.createElement(EnglishGarden, { stats: { gardenPoints: 29 }, onBack: () => {} }))
  const html30 = renderToStaticMarkup(React.createElement(EnglishGarden, { stats: { gardenPoints: 30 }, onBack: () => {} }))
  // '나의 집'은 두 곳에 등장한다: (1) "다음 구역이 기다려요" 진행 카드
  // (points<30일 때만), (2) 월드 지도 목록 행(항상 존재, 잠금 아이콘이
  // 있는 곳). 검증 대상은 (2)이므로 "나의 잉글리시 월드" 헤더 뒤에서만 찾는다.
  const mapHeaderIdx29 = html29.indexOf('나의 잉글리시 월드')
  const mapHeaderIdx30 = html30.indexOf('나의 잉글리시 월드')
  const idx29 = mapHeaderIdx29 >= 0 ? html29.indexOf('나의 집', mapHeaderIdx29) : -1
  const idx30 = mapHeaderIdx30 >= 0 ? html30.indexOf('나의 집', mapHeaderIdx30) : -1
  const win29 = idx29 >= 0 ? html29.slice(idx29, idx29 + 400) : ''
  const win30 = idx30 >= 0 ? html30.slice(idx30, idx30 + 400) : ''
  const ok1 = check('SSR points=29: "나의 집" 행이 렌더됨', idx29 >= 0)
  const ok2 = check('SSR points=29: house 잠김 문구("단어 30개를 배우면 집이 지어져요")가 보임', win29.includes('단어 30개를 배우면 집이 지어져요'))
  const ok3 = check('SSR points=29: house 잠금 아이콘(🔒)이 보임', win29.includes('🔒'))
  const ok4 = check('SSR points=30: house 잠김 문구가 사라짐(더 이상 안 보임)', !win30.includes('단어 30개를 배우면 집이 지어져요'))
  const ok5 = check('SSR points=30: house 잠금해제 문구("곧 구경할 수 있어요")가 보임', win30.includes('곧 구경할 수 있어요'))
  for (const ok of [ok1, ok2, ok3, ok4, ok5]) markFacility('house', 'ui', ok)
} catch (e) {
  warn(`EnglishGarden.jsx SSR 렌더를 실행할 수 없어 건너뜀(정적 검사로 대체) — ${e?.message || e}`)
  markFacilityWarn('garden', 'ui')
  markFacilityWarn('house', 'ui')
  if (!ssrAttempted) console.log('   [SSR] esbuild 빌드 단계에서 실패했거나 react-dom/server를 불러올 수 없음')
}
sectionTally()

// ══════════════════════════════════════════════════════════════════════
// facility 표
// ══════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(100)}`)
console.log('facility 표 (unlock 조건 | source-of-truth | stored | boundary | persistence | idempotency | UI | result)')
console.log('-'.repeat(100))
const rows = []
for (const id of Object.keys(facilityMeta)) {
  const meta = facilityMeta[id]
  const st = facilityStatus[id]
  const cats = [st.boundary, st.persistence, st.idempotency, st.ui]
  const result = cats.includes('FAIL') ? 'FAIL' : cats.includes('WARN') ? 'WARN' : 'PASS'
  rows.push({ id, ...meta, ...st, result })
  console.log(`${id} | ${meta.unlock} | ${meta.source} | ${meta.stored} | ${st.boundary} | ${st.persistence} | ${st.idempotency} | ${st.ui} | ${result}`)
}
console.log('-'.repeat(100))

// ══════════════════════════════════════════════════════════════════════
// ACTIVE / DORMANT / UNREACHABLE / NOT IMPLEMENTED 분류표
//   (overnight QA track T1, 2026-09-04) — 학생이 실제로 보는 화면 기준
//   trace: 각 요소가 (1) 기본 플래그로 도달 가능한지, (2) UI가 실제로
//   소비하는지, (3) 코드가 아예 없는지를 파일:라인 근거와 함께 고정한다.
//   ACTIVE            기본 플래그로 학생 UI에 렌더되고 도달 가능
//   DORMANT           구현은 있으나 기본 OFF 플래그 뒤(플래그를 켜면 그
//                      즉시 다른 동작이 나옴 — "구현된 분기"가 실재)
//   UNREACHABLE       계산은 되지만 라벨 이상으로 소비하는 UI가 없음
//   NOT IMPLEMENTED   플래그/주석에 계획만 있고 소비하는 코드가 없음
// ══════════════════════════════════════════════════════════════════════
const CLASSIFICATION = [
  {
    id: 'garden-screen', name: '정원 화면(EnglishGarden, 4x4 텃밭)', status: 'ACTIVE',
    evidence: 'attachmentWorldGarden 기본 true(src/config/features.js:56) — Dashboard.jsx:810-812 나의 정원 버튼 → EnglishGarden.jsx:11-102 전체 화면 렌더',
  },
  {
    id: 'world-label-rows', name: '월드 단계(집/다리/도서관/마을/왕국) — 목록 행', status: 'ACTIVE (라벨 행)',
    evidence: '플래그 무관 항상 렌더: EnglishGarden.jsx:87-96 world.stages.map — 잠금 아이콘/이름/설명만 있는 행. 데이터: worldProgress.js:42-51 WORLD_STAGES',
  },
  {
    id: 'world-full-screens', name: '월드 단계별 전용 화면(집/다리/도서관/마을/왕국 각각의 독립 상세 화면)', status: 'NOT IMPLEMENTED',
    evidence: '해당 화면 컴포넌트가 저장소에 존재하지 않음(grep 결과 0건) — attachmentWorldFull 플래그를 켜도 EnglishGarden.jsx:92의 라벨 문구만 바뀔 뿐 새 화면/라우트가 생기지 않는다(App.jsx의 screen 분기에 house/bridge/village/kingdom 라우트 없음)',
  },
  {
    id: 'attachmentWorldFull-flag', name: 'attachmentWorldFull 플래그가 게이팅하는 분기(라벨 텍스트)', status: 'DORMANT',
    evidence: '기본 false(src/config/features.js:57) — 켜면 EnglishGarden.jsx:92의 "곧 구경할 수 있어요" 대신 "열려 있어요!"로 바뀌는 분기가 실제로 존재(정적 하네스 6.UI GATING 섹션에서 정확히 1곳임을 고정)',
  },
  {
    id: 'town-museum', name: 'Paul Town 박물관(museum, 단어 박물관 이동)', status: 'ACTIVE',
    evidence: 'paulTownBuildings 기본 true(src/config/features.js:72) — PaulTown.jsx:163-186 discoveredPlaces 카드 → onGo(p.screen) → App.jsx:845-849 WordMuseum 렌더',
  },
  {
    id: 'town-library', name: 'Paul Town 도서관(library, 책장 이동)', status: 'ACTIVE',
    evidence: 'paulTownBuildings 기본 true + attachmentBookshelf 기본 true(src/config/features.js:58,72) — PaulTown.jsx:36 canEnter, App.jsx:866-870 Bookshelf 렌더',
  },
  {
    id: 'town-clockTower', name: 'Paul Town 시계탑(clockTower, 타임머신 이동)', status: 'ACTIVE',
    evidence: 'paulTownBuildings 기본 true(src/config/features.js:72) — PaulTown.jsx:163-186 → App.jsx:871-874 TimeMachine 렌더',
  },
  {
    id: 'hats', name: '모자 컬렉션 8종(수집/장착)', status: 'ACTIVE',
    evidence: 'attachmentHats 기본 true(src/config/features.js:52) — Dashboard.jsx:801-803 나비 버튼 → App.jsx:841 HatCollection, PaulTown.jsx:99-143 모자걸이 장착 UI',
  },
  {
    id: 'milestones', name: '밀스톤(성장 앨범, GrowthAlbum)', status: 'ACTIVE',
    evidence: 'attachmentAlbum 기본 true(src/config/features.js:54) — Dashboard.jsx:807-809 나비 버튼 → App.jsx:850 GrowthAlbum 렌더',
  },
  {
    id: 'home-deco', name: '폴의 집 소품 6종', status: 'ACTIVE',
    evidence: '플래그 게이트 없음(paulHomeDeco 결과가 있으면 무조건 렌더) — PaulTown.jsx:144-157',
  },
  {
    id: 'story', name: '이어지는 이야기(STORY_TEMPLATES/buildStoryChapter)', status: 'NOT IMPLEMENTED',
    evidence: 'attachmentStory 기본 false(src/config/features.js:59)이고, 데이터/템플릿 함수 자체는 storyFoundation.js에 구현돼 있으나(코드 존재) 어떤 컴포넌트도 이를 import/소비하지 않음(grep 0건, attachmentWorldFull과 달리 "플래그를 켜도 바뀌는 코드 분기"가 아예 없다) — 백엔드 함수는 있지만 UI 소비자가 전혀 없어 DORMANT(플래그로 켤 수 있는 분기)보다 NOT IMPLEMENTED가 정확',
  },
  {
    id: 'bookshelf', name: '책장(Bookshelf, 완료 유닛에서 파생된 책 목록)', status: 'ACTIVE',
    evidence: 'attachmentBookshelf 기본 true(src/config/features.js:58) — Bookshelf.jsx:13 getBookshelf/getTextbookBooks 소비, App.jsx:866-870에서 렌더(story와 달리 이 함수들은 실제로 import되어 쓰인다)',
  },
]
console.log(`\n${'='.repeat(100)}`)
console.log('진행 요소 분류 (ACTIVE / DORMANT / UNREACHABLE / NOT IMPLEMENTED) — file:line 근거 포함')
console.log('-'.repeat(100))
for (const c of CLASSIFICATION) console.log(`${c.id} | ${c.name} | ${c.status}\n  근거: ${c.evidence}`)
console.log('-'.repeat(100))
const classCounts = CLASSIFICATION.reduce((acc, c) => {
  const key = c.status.startsWith('ACTIVE') ? 'ACTIVE' : c.status
  acc[key] = (acc[key] || 0) + 1
  return acc
}, {})
console.log(`분류 요약: ${Object.entries(classCounts).map(([k, v]) => `${k} ${v}`).join(' / ')} (총 ${CLASSIFICATION.length}개)`)

// docs/qa/paul-town-progression-classification.md로도 저장(운영자 커밋 대상) —
// 단, 내용이 실제로 바뀔 때만 쓴다. 매 실행 write는 line-ending(CRLF
// 체크아웃 vs LF join) 차이만으로도 작업트리를 오염시켜 verify:all 뒤
// git status가 항상 dirty해지는 문제가 있었다(2026-09-04 test-hygiene
// 세션). normalize(LF 통일 + 줄 끝 공백 제거) 후 비교해 동일하면 파일을
// 아예 건드리지 않는다 — 그리고 그 비교 결과를 아래 7번 섹션에서 테스트
// 단언으로도 고정해, 생성 로직이 바뀌었는데 커밋된 파일을 안 갱신한 채
// 넘어가는 drift를 FAIL로 드러낸다(수정은 재생성 1회 + 커밋으로 해소).
const mdLines = [
  '# Paul Town 진행 요소 분류 — ACTIVE / DORMANT / UNREACHABLE / NOT IMPLEMENTED',
  '',
  '_scripts/testPaulTownProgression.mjs가 매 실행마다 재생성하는 machine-readable 분류표(overnight QA track T1, 2026-09-04). 값이 바뀌면 이 파일도 다음 실행 시 갱신된다 — 수동 편집 금지, 소스는 이 테스트 파일의 `CLASSIFICATION` 배열._',
  '',
  '| id | 요소 | 분류 | 근거(file:line) |',
  '|---|---|---|---|',
  ...CLASSIFICATION.map((c) => `| ${c.id} | ${c.name} | ${c.status} | ${c.evidence.replace(/\|/g, '\\|')} |`),
  '',
  `분류 요약: ${Object.entries(classCounts).map(([k, v]) => `${k} ${v}`).join(' / ')} (총 ${CLASSIFICATION.length}개)`,
  '',
]
function normalizeMd(str) {
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n*$/, '\n')
}
const classificationDocPath = path.resolve('docs/qa/paul-town-progression-classification.md')
const generatedDoc = normalizeMd(mdLines.join('\n'))
let committedDoc = null
try { committedDoc = readFileSync(classificationDocPath, 'utf8') } catch { /* 최초 실행 — 파일 없음 */ }
const normalizedCommittedDoc = committedDoc === null ? null : normalizeMd(committedDoc)
const docDrift = normalizedCommittedDoc !== generatedDoc

if (docDrift) {
  try {
    mkdirSync(path.resolve('docs/qa'), { recursive: true })
    writeFileSync(classificationDocPath, generatedDoc, 'utf8')
    console.log('\n[분류표] docs/qa/paul-town-progression-classification.md 갱신 완료(내용 변경 감지)')
  } catch (e) {
    console.warn(`[분류표] docs/qa/paul-town-progression-classification.md 쓰기 실패(무시, 콘솔 출력은 이미 완료) — ${e?.message || e}`)
  }
} else {
  console.log('\n[분류표] docs/qa/paul-town-progression-classification.md 변경 없음 — 쓰기 생략(작업트리 무오염)')
}

// ══════════════════════════════════════════════════════════════════════
// 7. DOCS ARTIFACT (drift 방지)
// ══════════════════════════════════════════════════════════════════════
sectionHeader('7. DOCS ARTIFACT')
check('docs/qa/paul-town-progression-classification.md — 커밋된 파일이 CLASSIFICATION에서 생성한 내용과 정확히 일치(drift 없음, normalize 후 비교)', !docDrift)
sectionTally()

// ══════════════════════════════════════════════════════════════════════
// 요약
// ══════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(64)}`)
console.log('섹션별 tally:')
for (const [name, b] of Object.entries(sectionStats)) {
  console.log(`  ${name}: PASS ${b.passed} / FAIL ${b.failed} / WARN ${b.warn}`)
}
const facilityFailCount = rows.filter((r) => r.result === 'FAIL').length
const facilityWarnCount = rows.filter((r) => r.result === 'WARN').length
console.log(`\nfacility 표: 총 ${rows.length}개 — FAIL ${facilityFailCount} / WARN ${facilityWarnCount} / PASS ${rows.length - facilityFailCount - facilityWarnCount}`)

if (totalFailed === 0) {
  console.log(`\nPASS  paul-town-progression — 진행 경계/연결/persistence/멱등/시뮬레이션/UI (${totalPassed}개 단언, WARN ${totalWarn})`)
  process.exit(0)
} else {
  console.log(`\nFAIL  paul-town-progression — ${totalPassed + totalFailed}개 중 ${totalFailed}개 실패 (WARN ${totalWarn})`)
  for (const [name, b] of Object.entries(sectionStats)) {
    for (const f of b.failures) console.log(`  - [${name}] ${f}`)
  }
  process.exit(1)
}
