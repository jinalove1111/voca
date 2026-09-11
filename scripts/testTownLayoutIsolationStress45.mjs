// scripts/testTownLayoutIsolationStress45.mjs — Paul Town V1 배치 격리
// stress(45명) + 두 기기 저장 충돌(stale overwrite) 프로브 (2026-09-11,
// qa-overnight-town QA 트랙).
//
// 목적 두 가지:
//   (A) 45명 합성 학생(그중 3쌍은 같은 영문 이름·다른 UUID)으로 배치 격리를
//       stress 검증 — 공유 placementId 0, A의 레이아웃이 B 아래서 절대
//       보이지 않음, 같은 itemId/좌표를 다른 학생이 동시에 써도 안전(학생별
//       독립 그리드), 급속 이동 20회 후 최종 상태 정합성, 재마운트/재로그인
//       영속.
//   (B) mergeTownLayout(local, cloud)의 두 기기 저장 충돌 처리를 실제 2기기
//       저장 흐름으로 재현/고정한다: 기기 A가 P1을 배치 후 이동해 먼저
//       저장했는데, 기기 B가 그보다 오래된 클라우드 스냅샷을 "로컬"로 들고
//       있다가(움직이지 않고) 그대로 동기화하는 상황. 2026-09-11 최초
//       작성 시점에는 mergeTownLayout이 같은 placementId 충돌을 timestamp
//       비교 없이 항상 local 우선으로 해소해 A의 최신 이동이 B의 stale
//       좌표에 덮어써지는 stale overwrite가 §6a/§6b에서 FAIL로 재현됐다
//       (REPRODUCED, 2 assertion FAIL 실측). 이후 P2 판정으로 최소 수정이
//       승인돼 townLayout.js에 recency(updatedAt ?? placedAt) 기반 충돌
//       해소가 추가됐고(파일 헤더 참고), 아래 §6a/§6b는 이제 "최신 배치가
//       이겨야 한다"는 계약을 고정하는 일반 회귀 방지 단언으로 PASS한다.
//
// 패턴은 scripts/testTownPlacementsPersistence.mjs를 그대로 복사해 재사용
// (재구현 금지, 규칙 3): fakeReact.mjs 최소 hooks 런타임 + 이미 빌드된
// scripts/.tmp/useStudent.race.bundle.mjs(scripts/buildRaceBundle.mjs 산출물)
// + scripts/wordLibraryRaceStub.mjs. 순수 도메인 함수(mergeTownLayout 등)는
// src/utils/town/townLayout.js를 직접 import(다른 에이전트 소유, 수정 없음).
//
// 실행 전 번들이 없으면 먼저: node scripts/buildRaceBundle.mjs
//   node scripts/testTownLayoutIsolationStress45.mjs
//
// 네트워크 0(전부 스텁), Supabase 0, 파괴적 DB 동작 0, src/ 수정 0.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createFakeClock, renderHook } from './fakeReact.mjs'
import { TOWN_GRID, HOME_CELL, mergeTownLayout } from '../src/utils/town/townLayout.js'

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

const todayStr = new Date().toDateString()
const baseRound = { date: todayStr, wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, spellingWrongToday: [] }
function seedRecord(id, townPlacements, townRemovedIds, totalStars = 0) {
  return {
    studentId: id, totalStars, stickers: [], diaryPlacements: [], missions: [], cleared: [],
    round: baseRound, history: {}, milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null,
    lastWordIndex: 0, wordStatus: {},
    townPlacements, townRemovedIds,
  }
}

// ══════════════════════════════════════════════════════════════════════
section('1. 45명 학생(3쌍 동일 영문 이름·다른 UUID) — 각 3개 배치, 공유 placementId 0, 교차가시성 0')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const N = 45
  // 3쌍: 같은 영문 이름, 다른 UUID(동명이인 시나리오, 규칙 4 — 이름이 아니라
  // UUID로만 식별돼야 함을 stress로 재확인).
  const DUP_PAIRS = [[0, 1, 'Alex'], [2, 3, 'Jamie'], [4, 5, 'Taylor']]
  const nameByIndex = new Map()
  for (const [a, b, name] of DUP_PAIRS) { nameByIndex.set(a, name); nameByIndex.set(b, name) }

  const ids = Array.from({ length: N }, () => crypto.randomUUID())
  check('45명 UUID 전부 서로 다름(crypto.randomUUID 유일성)', new Set(ids).size === N)

  const allPlacementIds = []
  const placementsByIndex = []
  let placeFailures = 0

  for (let i = 0; i < N; i++) {
    const studentId = ids[i]
    const { host } = freshMount(studentId, nameByIndex.get(i))

    const isPairB = DUP_PAIRS.some(([, b]) => b === i)
    if (isPairB) {
      check(`학생${i}(동명이인 "${nameByIndex.get(i)}" B측) 마운트 직후 배치 0건 — A의 레이아웃이 보이지 않음`,
        host.result.townPlacements.length === 0)
    }

    const items = [`s${i}-item-a`, `s${i}-item-b`, `s${i}-item-c`]
    const coords = [[0, 0], [0, 1], [0, 3]] // HOME_CELL(3,2) 회피, 학생별 독립 상태라 좌표 재사용 안전
    for (let j = 0; j < 3; j++) {
      const [x, y] = coords[j]
      const res = host.result.placeTownItem(items[j], x, y, items)
      if (!res.ok) placeFailures++
    }
    const finalPlacements = host.result.townPlacements.map((p) => p.placementId)
    placementsByIndex.push(finalPlacements)
    for (const pid of finalPlacements) allPlacementIds.push(pid)
  }

  check('45명 x 3개 배치 시도 전부 성공(설정 오류 0건)', placeFailures === 0)
  check(`45명 각 3개 배치 → 합계 ${N * 3}건`, allPlacementIds.length === N * 3)
  check('placementId 전역 유일(공유 0)', new Set(allPlacementIds).size === allPlacementIds.length)
  check('학생별 배치 건수 전부 정확히 3건', placementsByIndex.every((arr) => arr.length === 3))

  for (const [a, b, name] of DUP_PAIRS) {
    const idsA = new Set(placementsByIndex[a])
    const idsB = new Set(placementsByIndex[b])
    check(`동명이인 "${name}" 쌍 — A(idx ${a})/B(idx ${b}) placementId 교집합 0`,
      [...idsA].every((id) => !idsB.has(id)) && [...idsB].every((id) => !idsA.has(id)))
  }

  const store = readStore()
  check('스토어에 정확히 45명 학생 키 존재', ids.every((sid) => Array.isArray(store[sid]?.townPlacements)))
  const totalInStore = ids.reduce((sum, sid) => sum + (store[sid]?.townPlacements?.length || 0), 0)
  check('스토어에 저장된 배치 총합도 135건(영속 확인)', totalInStore === N * 3)

  for (const [a, b, name] of DUP_PAIRS) {
    const recA = store[ids[a]]
    const recB = store[ids[b]]
    check(`동명이인 "${name}" — 스토어 A 레코드에 B(idx ${b})의 아이템 없음`,
      !recA.townPlacements.some((p) => p.itemId.startsWith(`s${b}-item-`)))
    check(`동명이인 "${name}" — 스토어 B 레코드에 A(idx ${a})의 아이템 없음`,
      !recB.townPlacements.some((p) => p.itemId.startsWith(`s${a}-item-`)))
    check(`동명이인 "${name}" — A/B 레코드 모두 정확히 3건씩(교차 유실/중복 없음)`,
      recA.townPlacements.length === 3 && recB.townPlacements.length === 3)
  }
}

// ══════════════════════════════════════════════════════════════════════
section('2. 같은 itemId·같은 좌표를 다른 학생이 동시에 사용 — 허용 + 완전 격리')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const idA = crypto.randomUUID()
  const idB = crypto.randomUUID()
  const idC = crypto.randomUUID()
  const { host: hostA } = freshMount(idA)
  const { host: hostB } = freshMount(idB)
  const { host: hostC } = freshMount(idC)

  const resA = hostA.result.placeTownItem('lamp', 2, 2, ['lamp'])
  const resB = hostB.result.placeTownItem('lamp', 2, 2, ['lamp'])
  const resC = hostC.result.placeTownItem('lamp', 2, 2, ['lamp'])
  check('A: 같은 itemId/좌표 배치 성공(학생별 독립 그리드)', resA.ok === true)
  check('B: 같은 itemId/좌표 배치 성공', resB.ok === true)
  check('C: 같은 itemId/좌표 배치 성공(3명째도 충돌 없음)', resC.ok === true)

  const pidA = hostA.result.townPlacements[0].placementId
  const pidB = hostB.result.townPlacements[0].placementId
  const pidC = hostC.result.townPlacements[0].placementId
  check('A/B/C placementId 셋 다 서로 다름', new Set([pidA, pidB, pidC]).size === 3)
  check('A 좌표(2,2) 유지', hostA.result.townPlacements[0].x === 2 && hostA.result.townPlacements[0].y === 2)
  check('B 좌표(2,2) 유지', hostB.result.townPlacements[0].x === 2 && hostB.result.townPlacements[0].y === 2)
  check('C 좌표(2,2) 유지', hostC.result.townPlacements[0].x === 2 && hostC.result.townPlacements[0].y === 2)

  const moveRes = hostA.result.moveTownItem(pidA, 5, 5)
  check('A만 이동 성공', moveRes.ok === true)
  check('B는 A의 이동에 영향받지 않음(여전히 2,2)', hostB.result.townPlacements[0].x === 2 && hostB.result.townPlacements[0].y === 2)
  check('C는 A의 이동에 영향받지 않음(여전히 2,2)', hostC.result.townPlacements[0].x === 2 && hostC.result.townPlacements[0].y === 2)

  const storeRemoveB = hostB.result.storeTownItem(pidB)
  check('B의 보관도 A/C에 영향 없음', storeRemoveB.ok === true && hostA.result.townPlacements.length === 1 && hostC.result.townPlacements.length === 1)

  const store = readStore()
  check('스토어: A는 lamp 1건(이동된 좌표)', store[idA].townPlacements.length === 1 && store[idA].townPlacements[0].x === 5)
  check('스토어: B는 배치 0건(보관됨) + tombstone 1건', store[idB].townPlacements.length === 0 && store[idB].townRemovedIds.includes(pidB))
  check('스토어: C는 lamp 1건((2,2) 그대로)', store[idC].townPlacements.length === 1 && store[idC].townPlacements[0].x === 2)
}

// ══════════════════════════════════════════════════════════════════════
section('3. 급속 이동/저장 20회 — 최종 좌표=마지막 이동, 중복 없음')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const { host } = freshMount(id)
  const place = host.result.placeTownItem('desk', 0, 0, ['desk'])
  check('초기 배치 성공', place.ok === true)
  const pid = host.result.townPlacements[0].placementId

  // HOME_CELL을 제외한 유효 좌표 20개(그리드 스캔 순서, 결정론적)
  const validCoords = []
  for (let y = 0; y < TOWN_GRID.rows && validCoords.length < 20; y++) {
    for (let x = 0; x < TOWN_GRID.cols && validCoords.length < 20; x++) {
      if (x === HOME_CELL.x && y === HOME_CELL.y) continue
      if (x === 0 && y === 0) continue // 초기 좌표는 제외(실제 "이동"만 세도록)
      validCoords.push([x, y])
    }
  }
  check('테스트용 유효 좌표 20개 확보', validCoords.length === 20)

  let allMovesOk = true
  let lastCoord = [0, 0]
  for (let k = 0; k < validCoords.length; k++) {
    const [x, y] = validCoords[k]
    const res = host.result.moveTownItem(pid, x, y)
    if (!res.ok) allMovesOk = false
    else lastCoord = [x, y]
  }
  check('20회 급속 이동 전부 성공', allMovesOk === true)
  check('최종 좌표 = 마지막 이동값', host.result.townPlacements[0].x === lastCoord[0] && host.result.townPlacements[0].y === lastCoord[1])
  check('20회 이동 후에도 배치 건수는 여전히 1건(중복 생성 없음)', host.result.townPlacements.length === 1)
  check('20회 이동 후 placementId 불변', host.result.townPlacements[0].placementId === pid)

  // 중간에 홈 셀로 이동을 시도해도 거부되고 마지막 유효 위치가 유지돼야 함
  const homeAttempt = host.result.moveTownItem(pid, HOME_CELL.x, HOME_CELL.y)
  check('급속 이동 시퀀스 이후에도 홈 셀 이동은 거부(home_cell)', homeAttempt.ok === false && homeAttempt.reason === 'home_cell')
  check('홈 셀 이동 거부 후에도 좌표는 마지막 유효 이동값 그대로', host.result.townPlacements[0].x === lastCoord[0] && host.result.townPlacements[0].y === lastCoord[1])

  // 자기 자신이 이미 있는 칸으로의 "이동"(제자리)도 안전 — 중복 없음
  const selfMove = host.result.moveTownItem(pid, lastCoord[0], lastCoord[1])
  check('제자리 이동(자기 자신 칸)도 성공', selfMove.ok === true)
  check('제자리 이동 후에도 여전히 1건', host.result.townPlacements.length === 1)

  const store = readStore()
  check('스토어에도 최종 좌표만 1건 반영', store[id].townPlacements.length === 1 &&
    store[id].townPlacements[0].x === lastCoord[0] && store[id].townPlacements[0].y === lastCoord[1])
}

// ══════════════════════════════════════════════════════════════════════
section('4. 재마운트(새로고침) — 동일 UUID, 동일 localStorage → 완전히 동일한 레이아웃')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const { host: host1 } = freshMount(id)
  host1.result.placeTownItem('rug', 4, 4, ['rug'])
  host1.result.placeTownItem('sofa', 5, 1, ['rug', 'sofa'])
  const before = JSON.stringify(host1.result.townPlacements)
  const beforeRemoved = JSON.stringify(host1.result.townRemovedIds)

  const { host: host2 } = freshMount(id) // 같은 localStorage 인스턴스 유지(재할당 없음) = 새로고침 시뮬레이션
  const after = JSON.stringify(host2.result.townPlacements)
  const afterRemoved = JSON.stringify(host2.result.townRemovedIds)

  check('재마운트 후 townPlacements가 byte-identical', before === after, { before, after })
  check('재마운트 후 townRemovedIds가 byte-identical', beforeRemoved === afterRemoved)
  check('재마운트 후 배치 건수 2건 유지', host2.result.townPlacements.length === 2)
  check('재마운트 후 rug 좌표(4,4) 유지', host2.result.townPlacements.find((p) => p.itemId === 'rug')?.x === 4)
  check('재마운트 후 sofa 좌표(5,1) 유지', host2.result.townPlacements.find((p) => p.itemId === 'sofa')?.y === 1)
}

// ══════════════════════════════════════════════════════════════════════
section('5. 재로그인 — 동일 UUID면 동일 레이아웃, 다른 UUID면 완전히 빈 레이아웃')
// ══════════════════════════════════════════════════════════════════════
{
  // 참고: 이 하네스 레이어(useStudent(studentId, legacyName))에는 별도
  // "세션 포인터" 상태가 없다 — 학생 식별은 오직 이 인자로 넘기는 UUID뿐이며,
  // 로그아웃/재로그인이 관찰가능하게 만드는 유일한 차이는 새 훅 인스턴스
  // (재마운트)뿐이다(App.jsx 상위 계층의 세션 토큰/화면 전환은 이 하네스
  // 범위 밖). §4(새로고침)와 메커니즘은 같지만 "로그아웃 후 재로그인" 의도를
  // 명시적으로 다루고, 추가로 "다른 UUID로 로그인"까지 검증한다.
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const { host: host1 } = freshMount(id)
  host1.result.placeTownItem('bench', 1, 4, ['bench'])
  const snapshot = JSON.stringify(host1.result.townPlacements)

  const { host: reLogin } = freshMount(id) // 로그아웃 -> 재로그인(같은 학생)
  check('재로그인(동일 UUID) 후 배치가 byte-identical', JSON.stringify(reLogin.result.townPlacements) === snapshot)
  check('재로그인 후 배치 1건 유지', reLogin.result.townPlacements.length === 1)

  const otherId = crypto.randomUUID()
  const { host: otherLogin } = freshMount(otherId) // 다른 학생으로 로그인
  check('다른 UUID로 로그인 시 배치 0건(완전히 빈 레이아웃)', otherLogin.result.townPlacements.length === 0)
  check('다른 UUID로 로그인 시 tombstone도 0건', otherLogin.result.townRemovedIds.length === 0)

  const store = readStore()
  check('재로그인 후에도 원본 학생 레코드 훼손 없음(1건 유지)', store[id].townPlacements.length === 1)
  check('다른 학생 로그인 후에도 원본 학생 레코드는 여전히 1건(전혀 참조 안 함)', store[id].townPlacements.length === 1)
  check('다른 학생 레코드는 원본 학생의 배치를 전혀 참조하지 않음', !(store[otherId]?.townPlacements || []).some((p) => p.itemId === 'bench'))
}

// ══════════════════════════════════════════════════════════════════════
section('6a. 두 기기 저장 충돌 — mergeTownLayout(localB, cloudA) 순수 함수 프로브')
// ══════════════════════════════════════════════════════════════════════
{
  // 시나리오: 기기 A가 P1을 배치 후 (5,5)로 이동해 먼저 저장(클라우드에 반영
  // 완료 = cloudA). 기기 B는 그보다 오래된 클라우드 스냅샷(P1이 아직 (1,1))을
  // 그대로 "로컬"로 갖고 있고, 그 로컬을 움직이지 않은 채 동기화를 트리거
  // 한다 — 이때 실제 useStudent.js mergeProgressRecords()가 호출하는 것과
  // 정확히 같은 인자 순서로 mergeTownLayout(local=B, cloud=A)를 직접 호출
  // 한다(호출부는 src/hooks/useStudent.js 565-568행, local이 항상 첫 인자).
  const placementId = 'p1-two-device-conflict'
  // localB: B의 스냅샷 — P1이 배치된 후 한 번도 이동되지 않음(placeItem이
  // 설정한 그대로라 updatedAt === placedAt).
  const localB = { townPlacements: [{ placementId, itemId: 'sofa', x: 1, y: 1, placedAt: 1000, updatedAt: 1000 }], townRemovedIds: [] }
  // cloudA: A는 같은 P1을 그 이후 실제로 이동해 저장(moveItem이 updatedAt을
  // 5000으로 갱신, placedAt은 최초 배치 시각 1000 그대로 보존).
  const cloudA = { townPlacements: [{ placementId, itemId: 'sofa', x: 5, y: 5, placedAt: 1000, updatedAt: 5000 }], townRemovedIds: [] }
  const merged = mergeTownLayout(localB, cloudA)
  const p1Final = merged.townPlacements.find((p) => p.placementId === placementId)

  console.log(`  [merge 입력] localB = ${JSON.stringify(localB)}`)
  console.log(`  [merge 입력] cloudA = ${JSON.stringify(cloudA)}`)
  console.log(`  [merge 출력] merged = ${JSON.stringify(merged)}`)

  check('병합 결과에 P1이 정확히 1건(중복 없음)', merged.townPlacements.filter((p) => p.placementId === placementId).length === 1)
  check('병합 후 P1 좌표는 A가 마지막으로 저장한 최신 위치(5,5) — updatedAt 비교로 stale overwrite 수정 확인',
    Boolean(p1Final) && p1Final.x === 5 && p1Final.y === 5, { actual: p1Final })
  check('수정 후에는 B의 stale 좌표(1,1)가 더 이상 채택되지 않음(회귀 가드)',
    !(p1Final && p1Final.x === 1 && p1Final.y === 1))
}

// ══════════════════════════════════════════════════════════════════════
section('6b. 두 기기 저장 충돌 — 실제 useStudent 훅 배선(로그인 병합 복원 경로)으로 재현')
// ══════════════════════════════════════════════════════════════════════
{
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const placementId = 'p1-hook-two-device-conflict'

  // 기기 B의 로컬 스토리지 — 오래된 스냅샷 그대로(P1@1,1), 한 번도 이동된
  // 적 없어 updatedAt === placedAt.
  globalThis.localStorage.setItem(STORE_KEY, JSON.stringify({
    [id]: seedRecord(id, [{ placementId, itemId: 'sofa', x: 1, y: 1, placedAt: 1000, updatedAt: 1000 }], []),
  }))
  raceStub.resetFetchFullProgressDeferred()
  raceStub.setStrictBackup(null)
  globalThis.document = new FakeDocument()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(id), clock)

  const beforeMerge = host.result.townPlacements.find((p) => p.placementId === placementId)
  check('병합 전(로컬만 로드된 시점) P1은 stale (1,1)', Boolean(beforeMerge) && beforeMerge.x === 1 && beforeMerge.y === 1)

  // 기기 A는 이미 P1을 (5,5)로 이동해 클라우드에 저장 완료(moveItem이
  // updatedAt을 5000으로 갱신) — B의 백그라운드 동기화가 그 클라우드
  // 스냅샷을 가져와 로컬과 병합하는 시점을 재현.
  raceStub.fetchFullProgressDeferred.resolve(
    seedRecord(id, [{ placementId, itemId: 'sofa', x: 5, y: 5, placedAt: 1000, updatedAt: 5000 }], []),
  )
  await flush(); await flush(); await flush()

  const merged = host.result.townPlacements.find((p) => p.placementId === placementId)
  check('병합 후에도 P1은 정확히 1건(중복 없음)', host.result.townPlacements.filter((p) => p.placementId === placementId).length === 1)
  check('실제 훅 경로 — 병합 후 P1은 A가 마지막으로 저장한 (5,5) — updatedAt 비교로 stale overwrite 수정 확인',
    Boolean(merged) && merged.x === 5 && merged.y === 5, { actual: merged })
  check('실제 훅 경로 — 수정 후에는 B의 stale 좌표(1,1)가 더 이상 채택되지 않음(회귀 가드)',
    !(merged && merged.x === 1 && merged.y === 1))
}

// ══════════════════════════════════════════════════════════════════════
section('7. 스테일 tombstone — 로컬이 지운 P2가 클라우드엔 살아있음 → 병합 후 부재')
// ══════════════════════════════════════════════════════════════════════
{
  const P2 = { placementId: 'p2-cloud-still-alive', itemId: 'lamp', x: 2, y: 2, placedAt: 500 }
  const localWithTombstone = { townPlacements: [], townRemovedIds: [P2.placementId] }
  const cloudStillHasP2 = { townPlacements: [P2], townRemovedIds: [] }
  const merged = mergeTownLayout(localWithTombstone, cloudStillHasP2)

  check('병합 후 P2는 결과에 없음(로컬 tombstone이 이김)', !merged.townPlacements.some((p) => p.placementId === P2.placementId))
  check('tombstone 자체는 결과에 남아있음(union 유지)', merged.townRemovedIds.includes(P2.placementId))
  check('병합 후 townPlacements는 완전히 빈 배열', merged.townPlacements.length === 0)

  // 로컬 tombstone은 그대로인데 클라우드에 P2와 별개인 새 배치(P4)도 있으면
  // P4는 살아남고 P2만 계속 부재해야 함(tombstone이 다른 아이템까지
  // 과잉 제거하지 않는지 확인).
  const P4 = { placementId: 'p4-cloud-new', itemId: 'rug', x: 3, y: 3, placedAt: 600 }
  const cloudWithBoth = { townPlacements: [P2, P4], townRemovedIds: [] }
  const merged2 = mergeTownLayout(localWithTombstone, cloudWithBoth)
  check('P2는 여전히 부재', !merged2.townPlacements.some((p) => p.placementId === P2.placementId))
  check('P4(클라우드 신규, 무관 아이템)는 정상적으로 union됨', merged2.townPlacements.some((p) => p.placementId === P4.placementId))
  check('병합 후 정확히 1건(P4만)', merged2.townPlacements.length === 1)

  // 실제 훅 배선 경로로도 동일하게 재현(§7 순수 함수 결과와 정신이 같음을 확인).
  // 주의: 로컬 레코드에 totalStars 등 "진짜 진행도"가 전혀 없으면
  // useStudent.js의 isEmptyRecord(record)가 true가 되어, 병합(mergeProgressRecords)
  // 경로가 아니라 "빈 레코드이니 클라우드 백업을 통째로 채택"하는 별도
  // 복구 경로(887행대 isEmptyRecord(record) ? normalizeRecord(backup) : merge)를
  // 타 버린다 — isEmptyRecord()가 townRemovedIds/diaryRemovedIds를 전혀
  // 고려하지 않기 때문에(795-804행) 벌어지는 부수 발견: tombstone만 있고
  // 나머지가 전부 0인 레코드는 "비어있다"로 오분류돼 그 tombstone이 이
  // 복구 경로에서 통째로 버려진다. 이 시나리오(§7)의 목적은 merge 경로
  // 자체를 검증하는 것이므로, totalStars를 0이 아니게 만들어 의도한
  // mergeProgressRecords 분기를 강제로 태운다(실제 학생이라면 tombstone만
  // 있고 별이 0인 경우는 극히 드물어 이 우회가 부자연스럽지 않다 — 다만
  // 위 부수 발견 자체는 별도 보고 대상, src/ 수정 없음).
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  globalThis.localStorage.setItem(STORE_KEY, JSON.stringify({
    [id]: seedRecord(id, [], [P2.placementId], 5),
  }))
  raceStub.resetFetchFullProgressDeferred()
  raceStub.setStrictBackup(null)
  globalThis.document = new FakeDocument()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(id), clock)
  raceStub.fetchFullProgressDeferred.resolve(seedRecord(id, [P2, P4], []))
  await flush(); await flush(); await flush()

  check('실제 훅 경로 — 병합 후 P2 부재', !host.result.townPlacements.some((p) => p.placementId === P2.placementId))
  check('실제 훅 경로 — 병합 후 P4는 정상 union', host.result.townPlacements.some((p) => p.placementId === P4.placementId))
  check('실제 훅 경로 — tombstone에 P2 유지', host.result.townRemovedIds.includes(P2.placementId))
}

// ══════════════════════════════════════════════════════════════════════
section('8. 네트워크 재시도 — 동일 저장(cloud 스냅샷)이 반복 병합돼도 멱등')
// ══════════════════════════════════════════════════════════════════════
{
  const P5 = { placementId: 'p5-retry', itemId: 'tree', x: 0, y: 5, placedAt: 700 }
  const cloud = { townPlacements: [P5], townRemovedIds: [] }
  const merged1 = mergeTownLayout({ townPlacements: [], townRemovedIds: [] }, cloud)
  check('1차 병합 — P5 union됨(1건)', merged1.townPlacements.length === 1 && merged1.townPlacements[0].placementId === 'p5-retry')

  // 네트워크 재시도로 같은 cloud 스냅샷이 반복 전달돼 재병합(5회) — union이
  // placementId 기준 Set이라 중복이 쌓이지 않아야 한다.
  let running = merged1
  for (let i = 0; i < 5; i++) running = mergeTownLayout(running, cloud)
  check('5회 재시도 병합 후에도 정확히 1건(중복 없음)', running.townPlacements.length === 1)
  check('재시도 병합 후 placementId/좌표 불변',
    running.townPlacements[0].placementId === 'p5-retry' && running.townPlacements[0].x === 0 && running.townPlacements[0].y === 5)

  // tombstone도 동일 — 같은 삭제 이벤트가 재시도로 여러 번 도착해도 1건만 유지
  const cloudTomb = { townPlacements: [], townRemovedIds: ['t-retry'] }
  let runningTomb = { townPlacements: [], townRemovedIds: [] }
  for (let i = 0; i < 5; i++) runningTomb = mergeTownLayout(runningTomb, cloudTomb)
  check('tombstone도 5회 재시도 병합 후 정확히 1건(중복 없음)', runningTomb.townRemovedIds.length === 1 && runningTomb.townRemovedIds[0] === 't-retry')

  // tombstone cap이 재시도 반복으로 우회되지 않는지 — 300개가 이미 찬
  // 상태에서 같은 cloud 스냅샷을 반복 병합해도 300을 넘지 않아야 한다.
  const capLocal = { townPlacements: [], townRemovedIds: Array.from({ length: 300 }, (_, i) => `cap-${i}`) }
  const capCloud = { townPlacements: [], townRemovedIds: ['cap-new'] }
  let runningCap = capLocal
  for (let i = 0; i < 5; i++) runningCap = mergeTownLayout(runningCap, capCloud)
  check('tombstone cap 300 유지(재시도 반복해도 상한 초과 없음)', runningCap.townRemovedIds.length === 300)
  check('cap 상태에서도 재시도는 최신 항목을 유지(cap-new 포함)', runningCap.townRemovedIds.includes('cap-new'))

  // 실제 훅 배선 경로 — 재로그인/재마운트를 통해 같은 클라우드 스냅샷이
  // "재시도"처럼 두 번 해석돼도 중복이 생기지 않아야 함.
  globalThis.localStorage = new FakeStorage()
  const id = crypto.randomUUID()
  const P6 = { placementId: 'p6-hook-retry', itemId: 'sofa', x: 4, y: 0, placedAt: 800 }
  globalThis.localStorage.setItem(STORE_KEY, JSON.stringify({ [id]: seedRecord(id, [], []) }))
  raceStub.resetFetchFullProgressDeferred()
  raceStub.setStrictBackup(null)
  globalThis.document = new FakeDocument()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(id), clock)
  raceStub.fetchFullProgressDeferred.resolve(seedRecord(id, [P6], []))
  await flush(); await flush(); await flush()
  check('실제 훅 경로 — 1차 fetch 병합 후 P6 1건', host.result.townPlacements.filter((p) => p.placementId === 'p6-hook-retry').length === 1)

  const { host: host2 } = freshMount(id) // 재마운트(로컬은 이미 병합된 상태)
  raceStub.fetchFullProgressDeferred.resolve(seedRecord(id, [P6], [])) // 클라우드가 또 동일 스냅샷을 재전달(재시도)
  await flush(); await flush(); await flush()
  check('실제 훅 경로 — 재시도(재마운트+동일 클라우드 재수신) 후에도 정확히 1건(중복 없음)',
    host2.result.townPlacements.filter((p) => p.placementId === 'p6-hook-retry').length === 1)
  check('실제 훅 경로 — 재시도 후 좌표 불변', host2.result.townPlacements.find((p) => p.placementId === 'p6-hook-retry')?.x === 4)
}

console.log('\n' + '='.repeat(70))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0 ? 'ALL PASS' : 'FAIL')
// useStudent.js의 자정 롤오버 체크(setInterval 30s)는 이 fakeClock이 아닌
// 진짜 Node 타이머라 프로세스가 안 끝나고 계속 떠 있음 — 기존 스크립트와
// 동일하게 명시적으로 종료.
process.exit(failures > 0 ? 1 : 0)
