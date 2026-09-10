// scripts/testTownLayout.mjs
//
// Paul Town V1 순수 도메인(townLayout.js, 2026-09-11) 회귀 스위트.
// 네트워크 0, Supabase 0 — src/utils/town/townLayout.js는 import 0개
// 순수 모듈이라 이 스크립트도 그 파일 하나만 직접 import한다.
// crypto.randomUUID(Node 내장)로 45명 학생 시뮬레이션의 placementId
// 유일성을 확인한다(외부 패키지 0, CLAUDE.md 규칙 6).
//
// 실행: node scripts/testTownLayout.mjs
import crypto from 'node:crypto'
import {
  TOWN_GRID,
  HOME_CELL,
  emptyTownLayout,
  placeItem,
  moveItem,
  storeItem,
  mergeTownLayout,
  visiblePlacements,
  cellMap,
} from '../src/utils/town/townLayout.js'

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}
const section = (name) => console.log(`\n-- ${name} --`)

// ══════════════════════════════════════════════════════════════════════
section('1. 상수 / emptyTownLayout')
// ══════════════════════════════════════════════════════════════════════
{
  check('TOWN_GRID 8x6', TOWN_GRID.cols === 8 && TOWN_GRID.rows === 6)
  check('HOME_CELL (3,2)', HOME_CELL.x === 3 && HOME_CELL.y === 2)
  const empty = emptyTownLayout()
  check('emptyTownLayout: townPlacements=[], townRemovedIds=[]', Array.isArray(empty.townPlacements) && empty.townPlacements.length === 0 && Array.isArray(empty.townRemovedIds) && empty.townRemovedIds.length === 0)
}

// ══════════════════════════════════════════════════════════════════════
section('2. placeItem — 실패 사유')
// ══════════════════════════════════════════════════════════════════════
{
  const state = emptyTownLayout()
  check('미보유 아이템 → not_owned', placeItem(state, { itemId: 'tree', x: 0, y: 0, ownedIds: [] }).reason === 'not_owned')
  check('ownedIds 생략 → not_owned', placeItem(state, { itemId: 'tree', x: 0, y: 0 }).reason === 'not_owned')
  check('x 범위 밖(음수) → out_of_bounds', placeItem(state, { itemId: 'tree', x: -1, y: 0, ownedIds: ['tree'] }).reason === 'out_of_bounds')
  check('x 범위 밖(cols 초과) → out_of_bounds', placeItem(state, { itemId: 'tree', x: 8, y: 0, ownedIds: ['tree'] }).reason === 'out_of_bounds')
  check('y 범위 밖(음수) → out_of_bounds', placeItem(state, { itemId: 'tree', x: 0, y: -1, ownedIds: ['tree'] }).reason === 'out_of_bounds')
  check('y 범위 밖(rows 초과) → out_of_bounds', placeItem(state, { itemId: 'tree', x: 0, y: 6, ownedIds: ['tree'] }).reason === 'out_of_bounds')
  check('x/y가 정수가 아님 → out_of_bounds', placeItem(state, { itemId: 'tree', x: 1.5, y: 0, ownedIds: ['tree'] }).reason === 'out_of_bounds')
  check('HOME_CELL 위치 → home_cell', placeItem(state, { itemId: 'tree', x: 3, y: 2, ownedIds: ['tree'] }).reason === 'home_cell')
  check('실패 시 state는 원본과 동일 내용 유지', placeItem(state, { itemId: 'tree', x: 3, y: 2, ownedIds: ['tree'] }).state.townPlacements.length === 0)
}

// ══════════════════════════════════════════════════════════════════════
section('3. placeItem — 성공 + 점유/중복')
// ══════════════════════════════════════════════════════════════════════
{
  let state = emptyTownLayout()
  const r1 = placeItem(state, { itemId: 'tree', x: 0, y: 0, ownedIds: ['tree'], now: 1000 })
  check('첫 배치 성공(ok=true)', r1.ok === true)
  check('배치 결과에 placementId/itemId/x/y/placedAt 포함', (() => {
    const p = r1.state.townPlacements[0]
    return p.itemId === 'tree' && p.x === 0 && p.y === 0 && p.placedAt === 1000 && typeof p.placementId === 'string'
  })())
  check('placementId 기본 포맷 itemId:now:random', r1.state.townPlacements[0].placementId.startsWith('tree:1000:'))
  state = r1.state

  const r2 = placeItem(state, { itemId: 'bench', x: 0, y: 0, ownedIds: ['tree', 'bench'] })
  check('같은 좌표에 다른 아이템 → cell_occupied', r2.reason === 'cell_occupied')

  const r3 = placeItem(state, { itemId: 'tree', x: 1, y: 1, ownedIds: ['tree'] })
  check('같은 itemId 두 번째 배치(다른 좌표) → already_placed(V1 1인당 1개)', r3.reason === 'already_placed')

  const r4 = placeItem(state, { itemId: 'bench', x: 1, y: 1, ownedIds: ['tree', 'bench'], placementId: 'custom-id-1' })
  check('placementId 명시 시 그대로 사용(deterministic)', r4.ok === true && r4.state.townPlacements.some((p) => p.placementId === 'custom-id-1'))
  check('원본 state는 불변(place 후에도 이전 참조 그대로)', state.townPlacements.length === 1)

  check('원본 state 미변형(성공 케이스도 새 배열 반환)', r4.state !== state && r4.state.townPlacements !== state.townPlacements)
}

// ══════════════════════════════════════════════════════════════════════
section('4. moveItem')
// ══════════════════════════════════════════════════════════════════════
{
  let state = emptyTownLayout()
  state = placeItem(state, { itemId: 'tree', x: 0, y: 0, ownedIds: ['tree'], placementId: 'p-tree' }).state
  state = placeItem(state, { itemId: 'bench', x: 1, y: 0, ownedIds: ['tree', 'bench'], placementId: 'p-bench' }).state

  check('존재하지 않는 placementId → not_found', moveItem(state, 'no-such-id', 2, 2).reason === 'not_found')
  check('범위 밖 좌표 → out_of_bounds', moveItem(state, 'p-tree', 99, 99).reason === 'out_of_bounds')
  check('HOME_CELL로 이동 → home_cell', moveItem(state, 'p-tree', 3, 2).reason === 'home_cell')
  check('다른 아이템이 있는 칸으로 이동 → cell_occupied', moveItem(state, 'p-tree', 1, 0).reason === 'cell_occupied')

  const moved = moveItem(state, 'p-tree', 5, 5)
  check('정상 이동 성공', moved.ok === true)
  check('이동 후 좌표 갱신', moved.state.townPlacements.find((p) => p.placementId === 'p-tree').x === 5 && moved.state.townPlacements.find((p) => p.placementId === 'p-tree').y === 5)
  check('이동해도 placementId/itemId 불변', moved.state.townPlacements.find((p) => p.placementId === 'p-tree').itemId === 'tree')

  const sameSpot = moveItem(state, 'p-tree', 0, 0)
  check('자기 자신이 이미 있는 칸으로 "이동"(제자리) → 성공(자기 자신은 점유 판정 제외)', sameSpot.ok === true)
  check('원본 state 미변형', state.townPlacements.find((p) => p.placementId === 'p-tree').x === 0)
}

// ══════════════════════════════════════════════════════════════════════
section('5. storeItem — 제거 + tombstone')
// ══════════════════════════════════════════════════════════════════════
{
  let state = emptyTownLayout()
  state = placeItem(state, { itemId: 'tree', x: 0, y: 0, ownedIds: ['tree'], placementId: 'p1' }).state

  const stored = storeItem(state, 'p1')
  check('storeItem 후 배치 목록에서 제거됨', stored.townPlacements.length === 0)
  check('storeItem 후 tombstone에 추가됨', stored.townRemovedIds.includes('p1'))

  const storedAgain = storeItem(stored, 'p1')
  check('이미 제거된 placementId 재호출 → tombstone 중복 없음', storedAgain.townRemovedIds.filter((id) => id === 'p1').length === 1)

  check('존재하지 않는 placementId storeItem → 크래시 없이 그대로', storeItem(emptyTownLayout(), 'ghost').townPlacements.length === 0)

  let capState = emptyTownLayout()
  for (let i = 0; i < 305; i++) {
    capState = storeItem(capState, `tombstone-${i}`)
  }
  check('tombstone cap 300 적용', capState.townRemovedIds.length === 300)
  check('tombstone cap: 최신 항목이 유지됨(가장 최근 tombstone-304 포함)', capState.townRemovedIds.includes('tombstone-304'))
  check('tombstone cap: 가장 오래된 항목은 제거됨(tombstone-0 없음)', !capState.townRemovedIds.includes('tombstone-0'))
}

// ══════════════════════════════════════════════════════════════════════
section('6. mergeTownLayout')
// ══════════════════════════════════════════════════════════════════════
{
  check('cloud=null → local 그대로(정규화됨)', (() => {
    const local = { townPlacements: [{ placementId: 'a', itemId: 'tree', x: 0, y: 0, placedAt: 1 }], townRemovedIds: [] }
    const merged = mergeTownLayout(local, null)
    return merged.townPlacements.length === 1 && merged.townPlacements[0].placementId === 'a'
  })())
  check('cloud=undefined → local 그대로', mergeTownLayout(emptyTownLayout(), undefined).townPlacements.length === 0)

  const local = { townPlacements: [{ placementId: 'a', itemId: 'tree', x: 0, y: 0, placedAt: 1 }], townRemovedIds: [] }
  const cloud = { townPlacements: [{ placementId: 'b', itemId: 'bench', x: 1, y: 1, placedAt: 2 }], townRemovedIds: [] }
  const unioned = mergeTownLayout(local, cloud)
  check('서로 다른 placementId → union(둘 다 포함)', unioned.townPlacements.length === 2)
  check('union 순서: local 먼저, cloud 다음', unioned.townPlacements.map((p) => p.placementId).join(',') === 'a,b')

  const localConflict = { townPlacements: [{ placementId: 'a', itemId: 'tree', x: 0, y: 0, placedAt: 1 }], townRemovedIds: [] }
  const cloudConflict = { townPlacements: [{ placementId: 'a', itemId: 'tree', x: 5, y: 5, placedAt: 99 }], townRemovedIds: [] }
  const conflictMerged = mergeTownLayout(localConflict, cloudConflict)
  check('같은 placementId 충돌 → local이 이김(x,y=0,0 유지)', conflictMerged.townPlacements.length === 1 && conflictMerged.townPlacements[0].x === 0 && conflictMerged.townPlacements[0].y === 0)

  const localWithRemoved = { townPlacements: [], townRemovedIds: ['z'] }
  const cloudWithZ = { townPlacements: [{ placementId: 'z', itemId: 'tree', x: 0, y: 0, placedAt: 1 }], townRemovedIds: [] }
  const removedWins = mergeTownLayout(localWithRemoved, cloudWithZ)
  check('로컬 tombstone이 클라우드의 살아있는 배치를 제거함(로컬에서 지운 걸 클라우드가 되살리지 않음)', removedWins.townPlacements.length === 0)
  check('tombstone은 union 유지', removedWins.townRemovedIds.includes('z'))

  const localTomb = { townPlacements: [], townRemovedIds: ['x1', 'x2'] }
  const cloudTomb = { townPlacements: [], townRemovedIds: ['x2', 'x3'] }
  const tombUnion = mergeTownLayout(localTomb, cloudTomb)
  check('tombstone union(중복 제거)', [...tombUnion.townRemovedIds].sort().join(',') === 'x1,x2,x3')

  let bigLocal = { townPlacements: [], townRemovedIds: Array.from({ length: 200 }, (_, i) => `l${i}`) }
  let bigCloud = { townPlacements: [], townRemovedIds: Array.from({ length: 200 }, (_, i) => `c${i}`) }
  const bigMerged = mergeTownLayout(bigLocal, bigCloud)
  check('mergeTownLayout tombstone도 cap 300 적용', bigMerged.townRemovedIds.length === 300)

  check('malformed local(townPlacements 배열 아님) → 크래시 없이 빈 배열 취급', mergeTownLayout({ townPlacements: 'oops' }, null).townPlacements.length === 0)
  check('malformed cloud(townRemovedIds 배열 아님) → 크래시 없이 빈 배열 취급', mergeTownLayout(emptyTownLayout(), { townRemovedIds: 'oops' }).townRemovedIds.length === 0)
}

// ══════════════════════════════════════════════════════════════════════
section('7. visiblePlacements / cellMap')
// ══════════════════════════════════════════════════════════════════════
{
  const state = {
    townPlacements: [
      { placementId: 'a', itemId: 'tree', x: 0, y: 0, placedAt: 1 },
      { placementId: 'b', itemId: 'bench', x: 1, y: 1, placedAt: 2 },
    ],
    townRemovedIds: [],
  }
  check('visiblePlacements: 소유한 itemId만 필터', visiblePlacements(state, ['tree']).length === 1 && visiblePlacements(state, ['tree'])[0].placementId === 'a')
  check('visiblePlacements: 소유 목록 비어있음 → 빈 배열(방어적, 미소유 절대 렌더 안함)', visiblePlacements(state, []).length === 0)
  check('visiblePlacements: 둘 다 소유 → 둘 다 표시', visiblePlacements(state, ['tree', 'bench']).length === 2)
  check('visiblePlacements: ownedIds malformed → 빈 배열 취급', visiblePlacements(state, null).length === 0)

  const map = cellMap(state)
  check('cellMap: "0,0" 키에 tree 배치', map['0,0'] && map['0,0'].itemId === 'tree')
  check('cellMap: "1,1" 키에 bench 배치', map['1,1'] && map['1,1'].itemId === 'bench')
  check('cellMap: 존재하지 않는 좌표는 키 없음', map['5,5'] === undefined)
  check('cellMap: malformed state → 빈 객체', Object.keys(cellMap(null)).length === 0)
  check('cellMap: townPlacements 순서대로 뒤 항목이 덮어씀(같은 좌표 있을 시)', (() => {
    const dup = {
      townPlacements: [
        { placementId: 'x', itemId: 'tree', x: 2, y: 2, placedAt: 1 },
        { placementId: 'y', itemId: 'bench', x: 2, y: 2, placedAt: 2 },
      ],
      townRemovedIds: [],
    }
    return cellMap(dup)['2,2'].placementId === 'y'
  })())
}

// ══════════════════════════════════════════════════════════════════════
section('7b. moveItem / placeItem 추가 방어')
// ══════════════════════════════════════════════════════════════════════
{
  check('moveItem: malformed state(undefined) → 크래시 없이 not_found', moveItem(undefined, 'no-id', 0, 0).reason === 'not_found')
  check('placeItem: malformed state(townPlacements 없음) → 정상 배치 성공', placeItem({}, { itemId: 'tree', x: 0, y: 0, ownedIds: ['tree'] }).ok === true)
  check('placeItem: y가 rows 경계값(마지막 행)이면 성공', placeItem(emptyTownLayout(), { itemId: 'tree', x: 0, y: TOWN_GRID.rows - 1, ownedIds: ['tree'] }).ok === true)
  check('placeItem: x가 cols 경계값(마지막 열)이면 성공', placeItem(emptyTownLayout(), { itemId: 'tree', x: TOWN_GRID.cols - 1, y: 0, ownedIds: ['tree'] }).ok === true)
}

// ══════════════════════════════════════════════════════════════════════
section('8. 45명 학생 독립 레이아웃 — placementId 유일성(crypto.randomUUID)')
// ══════════════════════════════════════════════════════════════════════
{
  const allPlacementIds = new Set()
  let collisionFound = false
  const studentLayouts = []

  for (let s = 0; s < 45; s++) {
    let layout = emptyTownLayout()
    const owned = ['tree', 'bench', 'cat']
    for (const itemId of owned) {
      const placementId = crypto.randomUUID()
      const x = owned.indexOf(itemId)
      const res = placeItem(layout, { itemId, x, y: 0, ownedIds: owned, placementId })
      if (!res.ok) continue
      layout = res.state
      if (allPlacementIds.has(placementId)) collisionFound = true
      allPlacementIds.add(placementId)
    }
    studentLayouts.push(layout)
  }

  check('45명 x 3개 배치 = 135개 placementId, 전부 유일(충돌 0)', !collisionFound && allPlacementIds.size === 135)
  check('학생별 레이아웃이 서로 독립(한 학생의 배치가 다른 학생 레이아웃에 안 나타남)', (() => {
    const firstIds = new Set(studentLayouts[0].townPlacements.map((p) => p.placementId))
    return studentLayouts.slice(1).every((layout) => layout.townPlacements.every((p) => !firstIds.has(p.placementId)))
  })())
  check('각 학생 레이아웃마다 정확히 3개 배치', studentLayouts.every((layout) => layout.townPlacements.length === 3))

  // 두 학생의 레이아웃을 mergeTownLayout으로 병합해도 서로의 placementId를
  // 침범하지 않는지(독립성 재확인 — union일 뿐 충돌 없음).
  const merged01 = mergeTownLayout(studentLayouts[0], studentLayouts[1])
  check('두 학생 레이아웃 병합 시 배치 수 = 3+3(충돌 없어 union 전체 보존)', merged01.townPlacements.length === 6)
}

// ══════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('ALL PASS')
}
