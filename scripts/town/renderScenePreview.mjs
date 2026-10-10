// scripts/town/renderScenePreview.mjs — 공원 그림(g-easy-05) 미리보기용 상자 계산. Network 0, 저장 0.
// 정직한 범위: 이것은 브라우저 테스트가 아니다. Stage.jsx가 쓰는 "같은 순수 함수"(layoutItems·spotPositions·PARK_DIMS·parkArtKey)로 각 그림의
// 물건 상자(x 가운데·y 바닥·w·h)를 풀어 JSON으로 출력할 뿐이고, renderScenePreview.py가 그 상자에 kit @2x 그림을 붙여 기하(잘림·발 위치·개수)·
// 종횡비·투명도만 눈으로 확인한다. 실제 SVG 렌더·CSS·터치·접근성은 확인하지 않는다.
//
// 사용: node scripts/town/renderScenePreview.mjs [unitId=g-easy-05]   → stdout에 JSON
//       python scripts/town/renderScenePreview.py [outDir]            (이 스크립트를 내부에서 호출)
import { grammarUnitById } from '../../src/utils/grammar/grammarUnits.js'
import { layoutItems, spotPositions, miniCrop, GROUND } from '../../src/utils/grammar/sceneMission.js'
import { PARK_DIMS, PARK_GROUND, PARK_PAUL, PARK_PLACED_MAX, PROPS, parkArtKey } from '../../src/utils/grammar/sceneProps.js'

const unitId = process.argv[2] || 'g-easy-05'
const unit = grammarUnitById(unitId)
const sc = unit.scene
const PAUL = { x: PARK_PAUL.x, y: PARK_GROUND - PARK_PAUL.h, w: PARK_PAUL.w, h: PARK_PAUL.h } // Stage.jsx 공원 Paul 이미지 자리(발은 PARK_GROUND)

// Stage.StageSvg와 같은 계산: layoutItems(+공원 dims) → 놓은 물건(extra) → z 순으로 그림
function resolve(layout, { placed = [], spots = [], mini = false } = {}) {
  const base = layoutItems(layout, { center: mini, mini, dims: PARK_DIMS }) // Stage: center = !withPaul — 작은 무대는 폴이 없어 가운데 정렬
  const seen = {}
  base.forEach((it) => { seen[it.obj] = Math.max(seen[it.obj] ?? -1, it.i) })
  const extra = placed.map((p) => {
    const a = PARK_DIMS[p.obj] || PROPS[p.obj] || { w: 16, h: 16 }
    const s = (p.scale ?? 1) * Math.min(1, PARK_PLACED_MAX / a.w)
    return { obj: p.obj, i: (seen[p.obj] = (seen[p.obj] ?? -1) + 1), x: p.x, y: p.y, z: 999, w: a.w * s, h: a.h * s }
  })
  const drawn = [...base, ...extra].map((it) => ({ obj: it.obj, i: it.i, art: parkArtKey(it.obj, it.i), x: it.x, y: it.y, w: it.w, h: it.h, z: it.z, cookieTag: it.obj === 'dog' && it.i === 0 && !mini })).sort((a, b) => a.z - b.z)
  return { paul: mini ? null : PAUL, crop: mini ? miniCrop(base) : null, items: drawn, spots: spots.map((s) => ({ x: s.x, y: s.y, size: s.size || 56 })) }
}

const pics = []
const add = (name, layout, opt) => pics.push({ name, ...resolve(layout, opt) })
const S = sc.steps
add('01_discover', S[0].layout)
add('02_compare_left', S[1].left.layout)
add('02_compare_right', S[1].right.layout)
S[2].items.forEach((it, i) => add(`03_choose_${i + 1}`, it.layout))
// 만들기: 빈 칸 4개(slots), 나무 0/1/2그루 놓은 상태. 놓은 나무는 칸 자리에 그려진다
const bs = S[3]
const spots = spotPositions(bs.slots, PARK_DIMS)
for (const n of [0, 1, 2]) add(`04_build_${n}_trees`, [], { placed: spots.slice(0, n).map((p) => ({ obj: bs.place.obj, x: p.x, y: p.y })), spots: spots.slice(n) })
add('04_build_4_trees_max', [], { placed: spots.map((p) => ({ obj: bs.place.obj, x: p.x, y: p.y })) })
S[4].pairs.forEach((p, i) => add(`05_read_${i + 1}`, p.layout))
S[5].items.forEach((it, i) => it.options.forEach((o, j) => add(`06_listen_${i + 1}_${'abc'[j]}${j === it.correct ? '_correct' : ''}`, o.layout)))
add('07_my_park_2_trees', [], { placed: spots.slice(0, 2).map((p) => ({ obj: bs.place.obj, x: p.x, y: p.y })) }) // 말하기·쓰기 카드의 "내 공원"
// 작은 그림(mini): 비교 양쪽·읽기·듣기 보기는 실제 앱에서 mini(폴 없음, 확대 창 miniCrop)로 그려진다 — 같은 창으로 다시 그려 확인한다
add('08_mini_compare_left', S[1].left.layout, { mini: true })
add('08_mini_compare_right', S[1].right.layout, { mini: true })
S[4].pairs.forEach((p, i) => add(`08_mini_read_${i + 1}`, p.layout, { mini: true }))
S[5].items.forEach((it, i) => it.options.forEach((o, j) => add(`08_mini_listen_${i + 1}_${'abc'[j]}`, o.layout, { mini: true })))

console.log(JSON.stringify({ unit: unitId, ground: GROUND, viewBox: [360, 220], dims: PARK_DIMS, pictures: pics }))
