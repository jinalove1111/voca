// scripts/testTownPlacementsPersistence.mjs — Paul Town V1 배치(가구)
// 영속성/격리 회귀(2026-09-11).
//
// townLayout.js(다른 에이전트 소유, 순수 도메인)의 5개 함수(placeItem/
// moveItem/storeItem/mergeTownLayout/emptyTownLayout) 자체는
// testTownLayout.mjs가 이미 담당한다 — 이 스크립트는 그 계약이
// useStudent.js(실제 번들, fakeReact)에 "제대로 배선됐는가"만 검증한다:
// studentId 스코프 영속(localStorage), 재로그인/재마운트 생존, 다른
// 학생과의 격리(UUID 키, 이름 아님 — 규칙 4), 로그인 병합 복원 시
// tombstone이 클라우드 배치를 실제로 제거하는지, stars/XP/history 등
// 무관 필드가 절대 바뀌지 않는지.
//
// 패턴은 scripts/testRestoreSyncRace.mjs를 그대로 재사용(재구현 금지,
// 규칙 3) — fakeReact.mjs 최소 hooks 런타임 + scripts/buildRaceBundle.mjs가
// 만든 실제 번들(scripts/.tmp/useStudent.race.bundle.mjs) + 그 번들이
// 쓰는 wordLibrary 스텁(scripts/wordLibraryRaceStub.mjs, 수정 없음).
//
// 실행 전 먼저 번들 필요:
//   node scripts/buildRaceBundle.mjs
//   node scripts/testTownPlacementsPersistence.mjs
//
// 네트워크 0(전부 스텁), Supabase 0, 파괴적 DB 동작 0.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createFakeClock, renderHook } from './fakeReact.mjs'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..')

let asserted = 0
let failures = 0
const check = (label, cond, detail) => {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`); failures++ }
}
const section = (name) => console.log(`\n-- ${name} --`)
const flush = () => new Promise((r) => process.nextTick(r))

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

const STORE_KEY = 'paul_easy_progress'
const readStore = () => JSON.parse(globalThis.localStorage.getItem(STORE_KEY) || '{}')

// ══════════════════════════════════════════════════════════════════════
section('0. 정적 검사 — postTownWelcomeClaim / features.js 플래그 배선')
// ══════════════════════════════════════════════════════════════════════
{
  const wordLibSrc = fs.readFileSync(path.join(ROOT, 'src/utils/wordLibrary.js'), 'utf8')
  check('wordLibrary.js에 postTownWelcomeClaim export 존재', /export\s+async\s+function\s+postTownWelcomeClaim\s*\(/.test(wordLibSrc))
  const claimFnMatch = wordLibSrc.match(/export\s+async\s+function\s+postTownWelcomeClaim[\s\S]*?\r?\n}\r?\n/)
  check('postTownWelcomeClaim 함수 본문을 추출할 수 있다', Boolean(claimFnMatch))
  const claimFnBody = claimFnMatch ? claimFnMatch[0] : ''
  check("postTownWelcomeClaim이 action:'claim_town_welcome'을 보낸다", /action:\s*'claim_town_welcome'/.test(claimFnBody))
  check('postTownWelcomeClaim이 세션 토큰(_sessionToken)을 그대로 재사용한다(postTownPurchase와 동일 패턴)', /_sessionToken/.test(claimFnBody))
  check('postTownWelcomeClaim이 예외를 흡수해 network 사유로 반환한다', /reason:\s*'network'/.test(claimFnBody))

  const featuresSrc = fs.readFileSync(path.join(ROOT, 'src/config/features.js'), 'utf8')
  check('features.js에 paulTownV1: false 플래그 존재', /paulTownV1:\s*false\s*,/.test(featuresSrc))
  const attachmentListMatch = featuresSrc.match(/attachment:\s*\[[^\]]*\]/)
  check('attachment 카테고리 목록을 추출할 수 있다', Boolean(attachmentListMatch))
  check("attachment 카테고리 목록에 'paulTownV1'가 포함되어 있다", Boolean(attachmentListMatch && /'paulTownV1'/.test(attachmentListMatch[0])))
}

// ══════════════════════════════════════════════════════════════════════
section('빌드 산출물 로드')
// ══════════════════════════════════════════════════════════════════════
const bundlePath = path.join(ROOT, 'scripts/.tmp/useStudent.race.bundle.mjs')
if (!fs.existsSync(bundlePath)) {
  console.log(`  FAIL  ${bundlePath} 가 없습니다 — 먼저 'node scripts/buildRaceBundle.mjs'를 실행하세요.`)
  process.exit(1)
}
globalThis.localStorage = new FakeStorage()
globalThis.document = new FakeDocument()
const raceStub = await import(pathToFileURL('scripts/wordLibraryRaceStub.mjs').href)
const { useStudent } = await import(pathToFileURL(bundlePath).href)

function freshMount(studentId, legacyName) {
  raceStub.resetFetchFullProgressDeferred()
  globalThis.document = new FakeDocument()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(studentId, legacyName), clock)
  return { host, clock }
}

// ══════════════════════════════════════════════════════════════════════
section('1. place → state has placement')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const { host } = freshMount(id)
  check('초기 townPlacements 빈 배열', Array.isArray(host.result.townPlacements) && host.result.townPlacements.length === 0)

  const res = host.result.placeTownItem('shop-lamp', 1, 1, ['shop-lamp'])
  check('place ok:true', res.ok === true)
  check('townPlacements에 1건 반영', host.result.townPlacements.length === 1)
  const p = host.result.townPlacements[0]
  check('배치 필드 정확(itemId/x/y)', p && p.itemId === 'shop-lamp' && p.x === 1 && p.y === 1)
  check('placementId가 발급됨', typeof p?.placementId === 'string' && p.placementId.length > 0)

  const dup = host.result.placeTownItem('shop-lamp', 5, 5, ['shop-lamp'])
  check("같은 아이템 재배치는 reason:'already_placed'(아이템당 배치 1개)", dup.ok === false && dup.reason === 'already_placed')
  check('already_placed 실패는 기존 배치를 바꾸지 않음', host.result.townPlacements.length === 1 && host.result.townPlacements[0].x === 1)

  const oob = host.result.placeTownItem('desk', 99, 99, ['shop-lamp', 'desk'])
  check("그리드 밖 좌표는 reason:'out_of_bounds'", oob.ok === false && oob.reason === 'out_of_bounds')

  const home = host.result.placeTownItem('desk', 3, 2, ['shop-lamp', 'desk'])
  check("홈 셀에는 배치 불가(reason:'home_cell')", home.ok === false && home.reason === 'home_cell')

  const second = host.result.placeTownItem('desk', 2, 2, ['shop-lamp', 'desk'])
  check('두 번째 아이템은 정상 배치됨', second.ok === true && host.result.townPlacements.length === 2)

  const occupied = host.result.placeTownItem('rug', 2, 2, ['shop-lamp', 'desk', 'rug'])
  check("이미 점유된 셀은 reason:'cell_occupied'", occupied.ok === false && occupied.reason === 'cell_occupied')
  check('cell_occupied 실패 후에도 배치는 여전히 2건', host.result.townPlacements.length === 2)
}

// ══════════════════════════════════════════════════════════════════════
section('2. move → coords change')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const { host } = freshMount(id)
  host.result.placeTownItem('shop-lamp', 0, 0, ['shop-lamp'])
  const placementId = host.result.townPlacements[0].placementId

  const res = host.result.moveTownItem(placementId, 4, 4)
  check('move ok:true', res.ok === true)
  check('좌표가 (4,4)로 이동', host.result.townPlacements[0].x === 4 && host.result.townPlacements[0].y === 4)
  check('placementId 불변(같은 배치)', host.result.townPlacements[0].placementId === placementId)

  const badRes = host.result.moveTownItem(placementId, 3, 2) // HOME_CELL
  check('홈 셀로는 이동 불가(home_cell)', badRes.ok === false && badRes.reason === 'home_cell')
  check('실패한 이동은 상태를 바꾸지 않음(여전히 4,4)', host.result.townPlacements[0].x === 4 && host.result.townPlacements[0].y === 4)

  host.result.placeTownItem('desk', 1, 1, ['shop-lamp', 'desk'])
  const occupied = host.result.moveTownItem(placementId, 1, 1)
  check("다른 배치가 점유한 셀로는 이동 불가(reason:'cell_occupied')", occupied.ok === false && occupied.reason === 'cell_occupied')

  const notFound = host.result.moveTownItem('no-such-placement', 0, 0)
  check("존재하지 않는 placementId는 reason:'not_found'", notFound.ok === false && notFound.reason === 'not_found')
}

// ══════════════════════════════════════════════════════════════════════
section('3. store → removed + tombstone')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const { host } = freshMount(id)
  host.result.placeTownItem('shop-lamp', 0, 0, ['shop-lamp'])
  const placementId = host.result.townPlacements[0].placementId

  const res = host.result.storeTownItem(placementId)
  check('store ok:true', res.ok === true)
  check('townPlacements에서 제거됨', host.result.townPlacements.length === 0)
  check('townRemovedIds에 tombstone 기록', host.result.townRemovedIds.includes(placementId))

  const again = host.result.storeTownItem(placementId)
  check('이미 제거된 placementId를 다시 store해도 ok:true(멱등)', again.ok === true)
  check('tombstone이 중복 추가되지 않음(멱등)', host.result.townRemovedIds.filter((x) => x === placementId).length === 1)

  // 보관한 아이템은 소유는 유지되므로(구매 취소 아님) 같은 itemId를 다시 배치할 수 있어야 함
  const replace = host.result.placeTownItem('shop-lamp', 3, 3, ['shop-lamp'])
  check('store 후에는 같은 아이템을 다시 배치 가능(already_placed 아님)', replace.ok === true)
  check('재배치된 배치는 새 placementId를 가짐(예전 것과 다름)', host.result.townPlacements[0].placementId !== placementId)
}

// ══════════════════════════════════════════════════════════════════════
section('4. reload — 같은 studentId 재마운트 시 배치 영속')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage() // 재사용할 것 — 재할당은 여기서만
  const id = crypto.randomUUID()
  const { host: host1 } = freshMount(id)
  host1.result.placeTownItem('shop-lamp', 2, 4, ['shop-lamp']) // (2,4) — 홈셀(3,2) 아님
  const placementId = host1.result.townPlacements[0].placementId

  // 같은 localStorage 인스턴스를 재할당하지 않은 채로 재마운트(=재로그인/새로고침 시뮬레이션)
  const { host: host2 } = freshMount(id)
  check('재마운트 후에도 배치가 1건 남아있음', host2.result.townPlacements.length === 1)
  check('재마운트 후 placementId 동일', host2.result.townPlacements[0]?.placementId === placementId)
  check('재마운트 후 좌표 동일(2,4)', host2.result.townPlacements[0]?.x === 2 && host2.result.townPlacements[0]?.y === 4)
}

// ══════════════════════════════════════════════════════════════════════
section('5. relogin as student B — B는 빈 레이아웃, A 키는 그대로')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const idA = crypto.randomUUID()
  const idB = crypto.randomUUID()
  const { host: hostA } = freshMount(idA)
  hostA.result.placeTownItem('shop-lamp', 0, 0, ['shop-lamp'])
  check('A 배치 1건', hostA.result.townPlacements.length === 1)

  const { host: hostB } = freshMount(idB)
  check('B(신규 UUID)는 빈 레이아웃으로 시작', hostB.result.townPlacements.length === 0)

  const store = readStore()
  check('A의 스토어 레코드가 여전히 배치를 갖고 있음(B 마운트로 훼손되지 않음)',
    Array.isArray(store[idA]?.townPlacements) && store[idA].townPlacements.length === 1)
  check('B의 스토어 레코드는 A의 배치를 전혀 참조하지 않음',
    Array.isArray(store[idB]?.townPlacements) && store[idB].townPlacements.length === 0)
}

// ══════════════════════════════════════════════════════════════════════
section('6. 동명이인 — 같은 legacyName, 다른 UUID는 완전히 격리')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const idA = crypto.randomUUID()
  const idB = crypto.randomUUID()
  const SAME_NAME = '김철수'
  const { host: hostA } = freshMount(idA, SAME_NAME)
  hostA.result.placeTownItem('shop-lamp', 0, 0, ['shop-lamp'])

  const { host: hostB } = freshMount(idB, SAME_NAME)
  check('동명이인 B는 A의 배치를 보지 않음', hostB.result.townPlacements.length === 0)
  hostB.result.placeTownItem('desk', 5, 5, ['desk'])
  check('B가 배치해도 B 레코드에만 반영', hostB.result.townPlacements.length === 1 && hostB.result.townPlacements[0].itemId === 'desk')

  const store = readStore()
  check('A 레코드에는 여전히 shop-lamp 1건뿐', store[idA]?.townPlacements?.length === 1 && store[idA].townPlacements[0].itemId === 'shop-lamp')
  check('B 레코드에는 desk 1건뿐(교차 오염 없음)', store[idB]?.townPlacements?.length === 1 && store[idB].townPlacements[0].itemId === 'desk')
}

// ══════════════════════════════════════════════════════════════════════
section('7. 클라우드 병합 — union + tombstone 제거(로그인 병합 복원 경로)')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const todayStr = new Date().toDateString()
  const baseRound = { date: todayStr, wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, spellingWrongToday: [] }
  const P2 = { placementId: 'p2-local', itemId: 'lamp', x: 0, y: 0, placedAt: 2 }
  const P3 = { placementId: 'p3-tombstoned', itemId: 'rug', x: 1, y: 0, placedAt: 3 }
  globalThis.localStorage.setItem(STORE_KEY, JSON.stringify({
    [id]: {
      studentId: id, totalStars: 20, stickers: [], diaryPlacements: [], missions: [], cleared: [],
      round: baseRound, history: {}, milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null,
      lastWordIndex: 0, wordStatus: {},
      townPlacements: [P2],
      townRemovedIds: [P3.placementId], // 로컬이 이미 지운 배치 — 클라우드에 살아있어도 부활 금지
    },
  }))
  raceStub.resetFetchFullProgressDeferred()
  raceStub.setStrictBackup(null)
  globalThis.document = new FakeDocument()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(id), clock)

  check('병합 전 로컬 townPlacements = [P2]', host.result.townPlacements.length === 1 && host.result.townPlacements[0].placementId === 'p2-local')

  const P1 = { placementId: 'p1-cloud', itemId: 'sofa', x: 2, y: 0, placedAt: 1 }
  raceStub.fetchFullProgressDeferred.resolve({
    studentId: id, totalStars: 20, stickers: [], diaryPlacements: [], missions: [], cleared: [],
    round: baseRound, history: {}, milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null,
    lastWordIndex: 0, wordStatus: {},
    townPlacements: [P1, P3], // 클라우드에는 P1(새 배치)과 P3(이미 로컬이 지운 것)이 있음
    townRemovedIds: [],
  })
  await flush(); await flush(); await flush()

  const ids = host.result.townPlacements.map((p) => p.placementId).sort()
  check('병합 후 P1(클라우드)+P2(로컬) 둘 다 있음', ids.includes('p1-cloud') && ids.includes('p2-local'))
  check('병합 후 P3(로컬 tombstone)은 부활하지 않음', !ids.includes('p3-tombstoned'))
  check('병합 후 정확히 2건', host.result.townPlacements.length === 2)
  check('tombstone 자체도 결과에 남아있음', host.result.townRemovedIds.includes('p3-tombstoned'))
}

// ══════════════════════════════════════════════════════════════════════
section('8. stars/XP/history 등 무관 필드는 마을 액션 전후 byte-equal')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const { host } = freshMount(id)

  const snapshotOf = (r) => JSON.stringify({
    totalStars: r.stars,
    rewardLedger: r.rewardLedger,
    ticketLedger: r.ticketLedger,
    history: r.history,
    hatInventory: r.hatInventory,
    milestones: r.milestones,
    completedWords: r.completedWords,
    clearedWords: r.clearedWords,
    cleared: r.cleared,
    missions: r.missions,
  })
  const before = snapshotOf(host.result)

  host.result.placeTownItem('shop-lamp', 0, 0, ['shop-lamp'])
  const p1 = host.result.townPlacements[0].placementId
  host.result.moveTownItem(p1, 5, 5)
  host.result.storeTownItem(p1)

  const after = snapshotOf(host.result)
  check('stars/XP/reward/history 등 무관 필드가 마을 배치/이동/보관 전후 byte-identical', before === after, { before, after })
}

// ══════════════════════════════════════════════════════════════════════
section('9. 미소유 itemId → not_owned, 상태 불변')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const { host } = freshMount(id)

  const res = host.result.placeTownItem('not-owned-item', 0, 0, ['shop-lamp'])
  check("소유하지 않은 아이템은 reason:'not_owned'", res.ok === false && res.reason === 'not_owned')
  check('townPlacements는 여전히 빈 배열(상태 불변)', host.result.townPlacements.length === 0)

  const emptyOwned = host.result.placeTownItem('shop-lamp', 0, 0, [])
  check('ownedIds가 빈 배열이면 어떤 아이템도 not_owned', emptyOwned.ok === false && emptyOwned.reason === 'not_owned')
  const undefinedOwned = host.result.placeTownItem('shop-lamp', 0, 0, undefined)
  check('ownedIds가 undefined여도 크래시 없이 not_owned로 안전하게 처리', undefinedOwned.ok === false && undefinedOwned.reason === 'not_owned')
}

// ══════════════════════════════════════════════════════════════════════
section('11. 훅 반환 API 형태 — placeTownItem/moveTownItem/storeTownItem이 함수로 노출')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const { host } = freshMount(id)
  check('placeTownItem은 함수', typeof host.result.placeTownItem === 'function')
  check('moveTownItem은 함수', typeof host.result.moveTownItem === 'function')
  check('storeTownItem은 함수', typeof host.result.storeTownItem === 'function')
  check('townPlacements는 배열', Array.isArray(host.result.townPlacements))
  check('townRemovedIds는 배열', Array.isArray(host.result.townRemovedIds))
}

// ══════════════════════════════════════════════════════════════════════
section('10. 45명 학생 각각 3개 배치 — 135건 합계, placementId/키 교차오염 0')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const N = 45
  const ids = Array.from({ length: N }, () => crypto.randomUUID())
  const allPlacementIds = []
  let crossContaminated = false

  for (let i = 0; i < N; i++) {
    const studentId = ids[i]
    const { host } = freshMount(studentId)
    const items = [`s${i}-item-a`, `s${i}-item-b`, `s${i}-item-c`]
    const coords = [[0, 0], [0, 1], [0, 3]] // 홈셀(3,2) 회피, 학생별 독립 상태라 좌표 재사용 안전
    for (let j = 0; j < 3; j++) {
      const [x, y] = coords[j]
      const res = host.result.placeTownItem(items[j], x, y, items)
      if (!res.ok) console.log(`  (설정 오류) 학생 ${i} 아이템 ${j} 배치 실패: ${res.reason}`)
    }
    for (const p of host.result.townPlacements) {
      allPlacementIds.push(p.placementId)
      if (!p.itemId.startsWith(`s${i}-item-`)) crossContaminated = true
    }
  }

  check(`${N}명 각 3개 배치 → 합계 ${N * 3}건`, allPlacementIds.length === N * 3)
  check('placementId 전역 유일(0 공유)', new Set(allPlacementIds).size === allPlacementIds.length)
  check('학생 간 아이템 교차오염 없음(0 cross-student keys)', crossContaminated === false)

  const store = readStore()
  check('스토어에 정확히 45명 학생 키가 존재', ids.every((sid) => Array.isArray(store[sid]?.townPlacements)))
  const totalInStore = ids.reduce((sum, sid) => sum + (store[sid]?.townPlacements?.length || 0), 0)
  check('스토어에 저장된 배치 총합도 135건(영속 확인)', totalInStore === N * 3)
}

console.log('\n' + '='.repeat(70))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0 ? 'ALL PASS' : 'FAIL')
// useStudent.js의 자정 롤오버 체크(setInterval 30s)는 이 fakeClock이 아닌
// 진짜 Node 타이머라 프로세스가 안 끝나고 계속 떠 있음 — testRestoreSyncRace.mjs와
// 동일하게 명시적으로 종료.
process.exit(failures > 0 ? 1 : 0)
