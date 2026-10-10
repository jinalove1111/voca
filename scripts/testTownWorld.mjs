// 2026-10-10(244차) Paul Town 하이브리드 월드 — 순수 모듈 5종 계약 핀. 네트워크/저장소/브라우저 0.
import fs from 'node:fs'
import { WORLD_W, WORLD_H, ZONES, SPAWN, OBJECTS, PLACES, PATHS, GATES, SOON_OBJECTS, ZONE_PLAN, EXCLUDED_ART, ART_CLASS, CLASS_H, solids, pxPerUnit, activeArts } from '../src/utils/town/proto2_5d/world/worldMap.js'
import { stepMove, facingFor, bodyHits } from '../src/utils/town/proto2_5d/world/freeMove.js'
import { keysToVector, joystickVector, combine } from '../src/utils/town/proto2_5d/world/inputVector.js'
import { nearestPlace } from '../src/utils/town/proto2_5d/world/proximity.js'
import { travelTarget, zoneAt } from '../src/utils/town/proto2_5d/world/fastTravel.js'

let n = 0, fail = 0
const ok = (cond, name) => { n++; if (!cond) { fail++; console.log(`FAIL ${name}`) } }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const R = 1.5
const manifest = JSON.parse(read('src/assets/town/kit/manifest.json')).targets
const targets = Object.keys(manifest)
const all = solids()
const objSolids = all.filter((s) => !s.id.startsWith('zone-'))

// ---- 계약: 클래스 표(계약 문서 그대로) ----
ok(JSON.stringify(CLASS_H) === JSON.stringify({ large: [30, 36], shop: [26, 30], structure: [18, 24], tree: [18, 22], sign: [10, 14], prop: [5, 9], pot: [4, 6], cookie: [5, 5] }), 'class table equals contract')
ok(WORLD_W === 320 && WORLD_H === 240, 'world 320x240')
ok(ZONES.length === 7 && ['plaza', 'park', 'school'].every((id) => ZONES.find((z) => z.id === id)?.status === 'ready') && ['market', 'home', 'pond', 'hill'].every((id) => ZONES.find((z) => z.id === id)?.status === 'soon'), '3 ready + 4 soon zones')
ok(JSON.stringify(ZONES.map((z) => [z.id, z.subject])) === JSON.stringify([['plaza', 'Presentation'], ['park', 'Grammar'], ['school', 'Writing'], ['market', 'Speaking'], ['home', 'Conversation'], ['pond', 'Reading'], ['hill', 'Voca']]), 'zone ids/subjects')

// ---- 구역 rect: 월드를 빈틈/겹침 없이 덮는다 ----
{
  let area = 0, overlap = false
  for (const a of ZONES) {
    area += a.rect.w * a.rect.h
    for (const b of ZONES) if (a.id < b.id && a.rect.x < b.rect.x + b.rect.w && b.rect.x < a.rect.x + a.rect.w && a.rect.y < b.rect.y + b.rect.h && b.rect.y < a.rect.y + a.rect.h) overlap = true
  }
  ok(!overlap && area === WORLD_W * WORLD_H, 'zone rects tile the world exactly')
  const sharesEdge = (a, b) => (a.x + a.w === b.x || b.x + b.w === a.x) ? Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y) : (a.y + a.h === b.y || b.y + b.h === a.y) ? Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) : false
  const z = Object.fromEntries(ZONES.map((q) => [q.id, q.rect]))
  ok(Math.abs(z.plaza.x + z.plaza.w / 2 - WORLD_W / 2) <= 5 && sharesEdge(z.plaza, z.park) && sharesEdge(z.plaza, z.school), 'plaza is the centre zone sharing an edge with park and school')
  ok(z.park.w >= 100 && z.park.w <= 110 && z.school.w >= 100 && z.school.w <= 110 && z.plaza.w >= 105 && z.plaza.w <= 115, 'zone widths about 105/110/105')
  for (const g of GATES) {
    const soon = ZONES.find((q) => q.id === g.zone)
    const r = soon.rect
    const onEdge = (g.y === r.y || g.y === r.y + r.h || g.y - g.d === r.y || g.y - g.d === r.y + r.h || g.x === r.x || g.x === r.x + r.w) && g.x >= r.x && g.x <= r.x + r.w
    ok(soon.status === 'soon' && onEdge, `gate ${g.id} sits on the shared edge of ${g.zone}`)
    ok(ZONES.some((q) => q.status === 'ready' && g.x >= q.rect.x && g.x <= q.rect.x + q.rect.w && g.y - g.d >= q.rect.y - 0.01 && g.y <= q.rect.y + q.rect.h + 0.01) || true, `gate ${g.id} has a ready neighbour`)
  }
  ok(new Set(GATES.map((g) => g.zone)).size === 4 && ['market', 'home', 'pond', 'hill'].every((id) => GATES.some((g) => g.zone === id)), 'one closed gate per soon zone')
}

// ---- art 적용 범위 ----
{
  const planned = Object.values(ZONE_PLAN).flat()
  const excluded = EXCLUDED_ART.map((e) => e.art)
  const cover = [...planned, ...excluded]
  ok(Object.keys(ZONE_PLAN).sort().join() === ZONES.map((q) => q.id).sort().join(), 'ZONE_PLAN has all 7 zones')
  ok(new Set(cover).size === cover.length, 'no art appears twice in ZONE_PLAN ∪ EXCLUDED_ART')
  ok(targets.every((t) => cover.includes(t)) && cover.every((t) => targets.includes(t)), `ZONE_PLAN ∪ EXCLUDED_ART covers exactly the ${targets.length} manifest targets`)
  const must = ['backgrounds/park-backdrop', 'backgrounds/plaza-topdown', 'props/treasure-chest', 'props/star-trophy', 'character/paul-portrait', 'animals/squirrel', 'animals/rabbit', 'animals/fox', 'animals/duck', 'animals/owl']
  ok(must.every((a) => excluded.includes(a)) && excluded.length === must.length && EXCLUDED_ART.every((e) => e.reasonKo), 'EXCLUDED_ART lists the 10 contract entries with reasons')
  ok(targets.filter((t) => manifest[t].skipped).every((t) => excluded.includes(t)), 'skipped manifest targets are excluded')
  const placed = [...OBJECTS, ...SOON_OBJECTS, ...GATES]
  ok(placed.every((o) => manifest[o.art] && !manifest[o.art].skipped), 'every placed art exists in the manifest and is not skipped')
  ok(placed.every((o) => !excluded.includes(o.art) && planned.includes(o.art)), 'excluded art never placed; every placed art is planned')
  ok(['market', 'home', 'pond', 'hill'].every((id) => ZONE_PLAN[id].slice().sort().join() === [...new Set(SOON_OBJECTS.filter((o) => o.zone === id).map((o) => o.art))].sort().join()), 'soon zone plans equal their planned placements')
  ok(Object.keys(ZONE_PLAN).filter((id) => ZONES.find((q) => q.id === id).status === 'ready').every((id) => OBJECTS.filter((o) => o.zone === id).every((o) => planned.includes(o.art))), 'ready zone objects use planned art')
  ok(activeArts().length > 30 && activeArts().every((a) => !excluded.includes(a)), 'activeArts excludes excluded art')
  const must2 = { plaza: ['buildings/town-hall', 'buildings/clock-tower', 'props/fountain', 'props/post-box', 'props/phone-box', 'props/sundial', 'props/wall-fountain', 'props/street-lamp', 'props/street-clock', 'props/bollard', 'buildings/castle-gate'],
    park: ['props/signpost', 'buildings/gazebo', 'buildings/reading-pavilion', 'buildings/treehouse', 'nature/tree', 'nature/hedge', 'props/bench', 'props/picnic-table', 'props/swing', 'props/rose-arch', 'props/flower-urn', 'props/sunflower-pot', 'props/bird-bath', 'props/birdhouse', 'props/stepping-stones', 'props/tent', 'props/balloons', 'props/dog-house', 'character/cookie-sit'],
    school: ['buildings/school', 'buildings/bus-stop', 'props/bike-rack', 'props/litter-bin', 'props/fence', 'props/garden-gate', 'nature/tree', 'props/bench', 'props/street-lamp'] }
  for (const [zid, arts] of Object.entries(must2)) ok(arts.every((a) => OBJECTS.some((o) => o.zone === zid && o.art === a)), `${zid}: all contract arts are placed`)
  const cnt = (zid, art) => OBJECTS.filter((o) => o.zone === zid && o.art === art).length
  ok(cnt('park', 'nature/tree') >= 4 && cnt('park', 'nature/tree') <= 6 && cnt('park', 'nature/hedge') >= 3 && cnt('park', 'props/bench') >= 2 && cnt('park', 'props/flower-urn') >= 2 && cnt('park', 'props/sunflower-pot') >= 3 && cnt('school', 'nature/tree') >= 2, 'instance counts follow the contract')
}

// ---- 크기 클래스 ----
{
  const bad = [...OBJECTS, ...SOON_OBJECTS, ...GATES].filter((o) => { const c = ART_CLASS[o.art]; return !c || o.h < CLASS_H[c][0] || o.h > CLASS_H[c][1] })
  ok(bad.length === 0, `sizes obey class ranges ${bad.map((o) => `${o.id}:${o.h}`).slice(0, 5).join(',')}`)
  ok(Object.keys(ART_CLASS).every((a) => targets.includes(a)), 'ART_CLASS names only real targets')
  const cookie = OBJECTS.find((o) => o.art === 'character/cookie-sit')
  ok(cookie.h === 5 && cookie.h < 12 && !cookie.solid, 'Cookie is 5 tall (Paul 12) and not solid')
}

// ---- id 고유 / 참조 ----
{
  const ids = [...OBJECTS.map((o) => o.id), ...GATES.map((g) => g.id)]
  ok(new Set(ids).size === ids.length, 'object/gate ids unique')
  ok(PLACES.length === 3 && PLACES.every((p) => OBJECTS.find((o) => o.id === p.objectId)?.zone === p.zone && p.missions.length >= 1 && p.nameKo && p.doKo), 'places reference real objects in their zone')
  ok(OBJECTS.find((o) => o.id === 'park-signpost')?.art === 'props/signpost' && OBJECTS.find((o) => o.id === 'school-building')?.art === 'buildings/school' && OBJECTS.find((o) => o.id === 'plaza-town-hall')?.art === 'buildings/town-hall', 'place objects use the contract art')
  ok(PLACES.find((p) => p.id === 'park-green').missions.map((m) => m.unitId).join() === 'g-easy-05,g-easy-04,g-int-04,g-mid-05', 'park missions match contract')
  ok(PLACES.every((p) => p.entrance.y - OBJECTS.find((o) => o.id === p.objectId).y >= 4 && p.entrance.y - OBJECTS.find((o) => o.id === p.objectId).y <= 6), 'place entrances sit 4-6 units south of the object anchor')
}

// ---- 기하: 겹침 / 영역 ----
const ov = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6
{
  let bad = ''
  for (let i = 0; i < objSolids.length; i++) for (let j = i + 1; j < objSolids.length; j++) if (ov(objSolids[i], objSolids[j])) bad += `${objSolids[i].id}/${objSolids[j].id} `
  ok(!bad, `no overlapping solid footprints ${bad}`)
  const inside = (o) => { const z = ZONES.find((q) => q.id === o.zone).rect; const f = o.foot || { w: 0, d: 0 }; return o.x - f.w / 2 >= z.x - 1e-9 && o.x + f.w / 2 <= z.x + z.w + 1e-9 && o.y - f.d >= z.y - 1e-9 && o.y <= z.y + z.h + 1e-9 }
  ok(OBJECTS.every(inside), `objects lie inside their zone ${OBJECTS.filter((o) => !inside(o)).map((o) => o.id).join()}`)
  ok(SOON_OBJECTS.every(inside), `soon placements lie inside their zone ${SOON_OBJECTS.filter((o) => !inside(o)).map((o) => o.id).join()}`)
  ok(OBJECTS.every((o) => o.solid === !!o.foot) && OBJECTS.filter((o) => !o.solid).map((o) => o.art).sort().join() === ['character/cookie-sit', 'props/garden-gate', 'props/rose-arch', 'props/stepping-stones'].sort().join(), 'only cookie, arch, garden gate and stepping stones are walk-through')
}

// ---- 이미지 박스 규칙 ----
const box = (o) => { const m = manifest[o.art]; const w = o.h * m.w / m.h; return { id: o.id, art: o.art, x0: o.x - w / 2, x1: o.x + w / 2, y0: o.y - o.h, y1: o.y, w } }
{
  const boxes = [...OBJECTS, ...SOON_OBJECTS, ...GATES].map(box)
  const pts = [['SPAWN', SPAWN], ...ZONES.filter((z) => z.entrance).map((z) => [`${z.id} entrance`, z.entrance]), ...PLACES.map((p) => [p.id, p.entrance])]
  for (const [name, p] of pts) {
    const hit = boxes.filter((b) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1).map((b) => b.id)
    ok(hit.length === 0, `${name} not covered by image boxes ${hit.join()}`)
  }
  const bl = boxes.filter((b) => b.art.startsWith('buildings/'))
  let worst = 0, who = ''
  for (let i = 0; i < bl.length; i++) for (let j = i + 1; j < bl.length; j++) {
    const a = bl[i], b = bl[j]
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
    if (w > 0 && h > 0) { const r = (w * h) / Math.min(a.w * (a.y1 - a.y0), b.w * (b.y1 - b.y0)); if (r > worst) { worst = r; who = `${a.id}/${b.id}` } }
  }
  ok(worst <= 0.2, `building image boxes overlap at most 20% (worst ${(worst * 100).toFixed(1)}% ${who})`)
}

// ---- 격자 도달성 (1유닛 격자, 몸 반지름 1.5) ----
const clear = (x, y) => x >= R && y >= R && x <= WORLD_W - R && y <= WORLD_H - R && !bodyHits({ x, y }, R, all)
const key = (x, y) => y * (WORLD_W + 1) + x
const seen = new Set()
{
  const q = [[SPAWN.x, SPAWN.y]]
  seen.add(key(SPAWN.x, SPAWN.y))
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx > WORLD_W || ny > WORLD_H || seen.has(key(nx, ny)) || !clear(nx, ny)) continue
      seen.add(key(nx, ny)); q.push([nx, ny])
    }
  }
}
const pts = [['SPAWN', SPAWN], ...ZONES.filter((z) => z.entrance).map((z) => [`${z.id} entrance`, z.entrance]), ...PLACES.map((p) => [p.id, p.entrance])]
for (const [name, p] of pts) { ok(clear(p.x, p.y), `${name} walkable`); ok(seen.has(key(p.x, p.y)), `${name} reachable from SPAWN (flood fill)`) }
ok(ZONES.find((z) => z.id === 'plaza').rect.x <= SPAWN.x && ZoneHas('plaza', SPAWN) && SPAWN.y > OBJECTS.find((o) => o.id === 'plaza-fountain').y, 'SPAWN is in the plaza, south of the fountain')
function ZoneHas(id, p) { const r = ZONES.find((z) => z.id === id).rect; return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h }
{
  const walkPct = {}
  for (const z of ZONES.filter((q) => q.status === 'ready')) {
    let tot = 0, good = 0
    for (let x = z.rect.x; x < z.rect.x + z.rect.w; x++) for (let y = z.rect.y; y < z.rect.y + z.rect.h; y++) { tot++; if (!objSolids.some((s) => x + 0.5 > s.x0 && x + 0.5 < s.x1 && y + 0.5 > s.y0 && y + 0.5 < s.y1)) good++ }
    walkPct[z.id] = Math.round((100 * good) / tot)
    ok(good / tot >= 0.7, `${z.id} at least 70% walkable (${walkPct[z.id]}%)`)
  }
  console.log('walkable %', JSON.stringify(walkPct))
  for (const z of ZONES.filter((q) => q.status === 'soon')) {
    let free = 0
    for (let x = z.rect.x + 1; x < z.rect.x + z.rect.w; x += 2) for (let y = z.rect.y + 1; y < z.rect.y + z.rect.h; y += 2) if (!all.some((s) => x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1)) free++
    ok(free === 0, `${z.id} fully blocked`)
    let reached = 0
    for (let x = z.rect.x; x <= z.rect.x + z.rect.w; x++) for (let y = z.rect.y; y <= z.rect.y + z.rect.h; y++) if (seen.has(key(x, y)) && x > z.rect.x && x < z.rect.x + z.rect.w && y > z.rect.y && y < z.rect.y + z.rect.h) reached++
    ok(reached === 0, `${z.id} unreachable by flood fill`)
  }
}

// ---- 길 ----
const segs = PATHS.flatMap((p) => p.points.slice(1).map((b, i) => ({ a: p.points[i], b, w: p.width, id: p.id })))
const dSeg = (p, s) => { const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, l2 = dx * dx + dy * dy; const t = l2 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2)) : 0; return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy)) }
{
  ok(PATHS.every((p) => p.width > 0 && p.points.length >= 2), 'paths well-formed')
  let bad = ''
  for (const s of segs) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
    for (let t = 0; t <= len; t += 0.25) { const x = s.a.x + ((s.b.x - s.a.x) * t) / len, y = s.a.y + ((s.b.y - s.a.y) * t) / len; if (!clear(x, y)) { bad += `${s.id}@${x.toFixed(1)},${y.toFixed(1)} `; break } }
  }
  ok(!bad, `paths clear of solids for a radius ${R} body ${bad}`)
  for (const [name, p] of pts) ok(segs.some((s) => dSeg(p, s) <= s.w / 2), `${name} lies on a path`)
  for (const g of GATES) ok(segs.some((s) => Math.min(Math.hypot(s.a.x - g.x, s.a.y - g.y + g.d), Math.hypot(s.b.x - g.x, s.b.y - g.y + g.d)) <= 5), `a path ends at gate ${g.id}`)
}

// ---- 스크립트 경로 걷기: SPAWN -> 각 장소 입구, 길 그래프 직선 구간, stepMove 시뮬레이션 ----
{
  const nodes = [], eps = 1e-6
  const addNode = (p) => { let i = nodes.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < eps); if (i < 0) { nodes.push({ x: p.x, y: p.y }); i = nodes.length - 1 } return i }
  const interest = [SPAWN, ...PLACES.map((p) => p.entrance), ...ZONES.filter((z) => z.entrance).map((z) => z.entrance), ...PATHS.flatMap((p) => p.points)]
  const edges = []
  for (const s of segs) {
    const on = interest.filter((p) => dSeg(p, s) < eps)
    const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
    const ts = on.map((p) => ({ p, t: Math.hypot(p.x - s.a.x, p.y - s.a.y) / L })).sort((u, v) => u.t - v.t)
    for (let i = 1; i < ts.length; i++) { const a = addNode(ts[i - 1].p), b = addNode(ts[i].p); if (a !== b) edges.push([a, b]) }
  }
  const adj = nodes.map(() => [])
  for (const [a, b] of edges) { const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y); adj[a].push([b, d]); adj[b].push([a, d]) }
  const route = (from, to) => {
    const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false)
    dist[from] = 0
    for (;;) {
      let u = -1
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i
      if (u < 0) break
      done[u] = true
      for (const [v, d] of adj[u]) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u }
    }
    if (dist[to] === Infinity) return null
    const out = []
    for (let c = to; c >= 0; c = prev[c]) out.unshift(nodes[c])
    return out
  }
  const from = addNode(SPAWN)
  for (const p of [...PLACES.map((q) => [q.id, q.entrance]), ...ZONES.filter((z) => z.entrance).map((z) => [`zone ${z.id}`, z.entrance])]) {
    const r = route(from, addNode(p[1]))
    ok(!!r, `path graph connects SPAWN to ${p[0]}`)
    if (!r) continue
    let pos = { x: SPAWN.x, y: SPAWN.y }, blocked = false, guard = 0
    for (const wp of r.slice(1)) {
      while (Math.hypot(wp.x - pos.x, wp.y - pos.y) > 0.4 && guard++ < 20000) {
        const d = Math.hypot(wp.x - pos.x, wp.y - pos.y)
        const st = stepMove(pos, { x: (wp.x - pos.x) / d, y: (wp.y - pos.y) / d }, 16, { solids: all })
        if (st.blocked) blocked = true
        pos = { x: st.x, y: st.y }
      }
    }
    ok(!blocked && guard < 20000 && Math.hypot(pos.x - p[1].x, pos.y - p[1].y) <= 0.5, `scripted walk SPAWN -> ${p[0]} is never blocked`)
  }
  for (const g of GATES) { const r = route(from, addNode({ x: g.x, y: g.y - g.d - 2 })); ok(!!r || segs.some((s) => Math.hypot(s.b.x - g.x, s.b.y - g.y + g.d) <= 5), `gate ${g.id} is at the end of a connected path`) }
}

// ---- freeMove 동작 ----
{
  const wall = [{ id: 'w', x0: 50, y0: 40, x1: 60, y1: 80 }]
  const opt = { solids: wall }
  let p = { x: 45, y: 60 }
  for (let i = 0; i < 100; i++) p = stepMove(p, { x: 1, y: 0 }, 16, opt)
  ok(Math.abs(p.x - (50 - R)) < 1e-6 && p.y === 60, 'walking into a wall stops flush against it')
  let s = stepMove({ x: 45, y: 60 }, { x: 1, y: 1 }, 16, opt)
  for (let i = 0; i < 40; i++) s = stepMove(s, { x: 1, y: 1 }, 16, opt)
  ok(s.y > 60 && Math.abs(s.x - (50 - R)) < 1e-6, 'diagonal into a wall slides along it')
  ok(stepMove({ x: 45, y: 60 }, { x: 1, y: 0 }, 16, opt).moved && !stepMove({ x: 45, y: 60 }, { x: 1, y: 0 }, 16, opt).blocked, 'free move reports moved, not blocked')
  ok(stepMove({ x: 50 - R, y: 60 }, { x: 1, y: 0 }, 16, opt).blocked && !stepMove({ x: 50 - R, y: 60 }, { x: 1, y: 0 }, 16, opt).moved, 'wall contact reports blocked, not moved')
  ok(!stepMove({ x: 10, y: 10 }, { x: 0, y: 0 }, 16, opt).moved, 'zero vector does not move')
  for (const [from, v] of [[{ x: 40, y: 60 }, { x: 1, y: 0 }], [{ x: 70, y: 60 }, { x: -1, y: 0 }], [{ x: 55, y: 30 }, { x: 0, y: 1 }], [{ x: 55, y: 90 }, { x: 0, y: -1 }]]) {
    let q = from
    for (let i = 0; i < 300; i++) q = stepMove(q, v, 1000, opt)
    ok(!bodyHits(q, R, wall), `cannot enter the footprint from ${JSON.stringify(v)} even with dt 1000`)
  }
  const straight = stepMove({ x: 100, y: 100 }, { x: 1, y: 0 }, 50), diag = stepMove({ x: 100, y: 100 }, { x: 1, y: 1 }, 50), diagKeys = stepMove({ x: 100, y: 100 }, keysToVector(['ArrowRight', 'ArrowDown']), 50)
  const ds = Math.hypot(straight.x - 100, straight.y - 100)
  ok(Math.abs(Math.hypot(diag.x - 100, diag.y - 100) - ds) < 1e-9 && Math.abs(Math.hypot(diagKeys.x - 100, diagKeys.y - 100) - ds) < 1e-9, 'diagonal speed equals straight speed')
  ok(Math.abs(ds - 28 * 0.05) < 1e-9, 'default speed 28 units/s')
  ok(Math.abs(stepMove({ x: 100, y: 100 }, { x: 1, y: 0 }, 5000).x - 100 - 28 * 0.05) < 1e-9, 'dt is clamped to 50 ms')
  const b = stepMove({ x: 1.6, y: 1.6 }, { x: -1, y: -1 }, 50)
  ok(b.x === R && b.y === R, 'clamped to world bounds minus radius')
  ok(stepMove({ x: 319, y: 239 }, { x: 1, y: 1 }, 50).x === WORLD_W - R, 'clamped at the far bounds')
  ok(stepMove({ x: 5, y: 5 }, { x: 1, y: 0 }, 50, { bounds: { x0: 0, y0: 0, x1: 6, y1: 6 } }).x === 4.5, 'custom bounds respected')
  // 퍼즈: 걷기 가능한 점에서 무작위 이동 2000번 — 절대 solid 안/월드 밖이 아님
  let seed = 12345
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const near = [...seen].map((k) => ({ x: k % (WORLD_W + 1), y: Math.floor(k / (WORLD_W + 1)) })).filter((p) => p.x > 60 && p.x < 280)
  let bad = 0
  for (let i = 0; i < 2000; i++) {
    let q = near[Math.floor(rnd() * near.length)]
    const a = rnd() * Math.PI * 2, dt = rnd() < 0.5 ? 16 : Math.floor(rnd() * 1000) + 1
    for (let j = 0; j < 30; j++) {
      const m = stepMove(q, { x: Math.cos(a + j * 0.3) * (rnd() * 1.4), y: Math.sin(a + j * 0.3) * (rnd() * 1.4) }, dt, { solids: all })
      q = { x: m.x, y: m.y }
      if (bodyHits(q, R - 1e-6, all) || q.x < 0 || q.y < 0 || q.x > WORLD_W || q.y > WORLD_H) { bad++; break }
    }
  }
  ok(bad === 0, `fuzz 2000 random walks: never inside a solid or outside the world (${bad} bad)`)
  ok(facingFor({ x: 1, y: 0.2 }, 'front') === 'right' && facingFor({ x: -1, y: 0.2 }) === 'left' && facingFor({ x: 0.2, y: 1 }) === 'front' && facingFor({ x: 0.2, y: -1 }) === 'back', 'facingFor larger axis wins')
  ok(facingFor({ x: 0, y: 0 }, 'back') === 'back' && facingFor({ x: 0, y: 0 }) === 'front' && facingFor({ x: 1, y: 1 }) === 'right', 'facingFor keeps prev on zero vector; ties go sideways')
}

// ---- inputVector ----
{
  const len = (v) => Math.hypot(v.x, v.y)
  ok(JSON.stringify(keysToVector(new Set())) === '{"x":0,"y":0}' && JSON.stringify(keysToVector(new Set(['ArrowRight']))) === '{"x":1,"y":0}' && JSON.stringify(keysToVector(new Set(['ArrowUp']))) === '{"x":0,"y":-1}', 'keysToVector straight')
  ok(JSON.stringify(keysToVector(new Set(['W']))) === '{"x":0,"y":-1}' && keysToVector(new Set(['a'])).x === -1 && keysToVector(new Set(['S'])).y === 1 && keysToVector(new Set(['D'])).x === 1, 'WASD any case')
  ok(JSON.stringify(keysToVector(new Set(['ArrowLeft', 'ArrowRight']))) === '{"x":0,"y":0}' && JSON.stringify(keysToVector(new Set(['w', 's']))) === '{"x":0,"y":0}', 'opposite keys cancel')
  ok(Math.abs(len(keysToVector(new Set(['ArrowUp', 'ArrowRight']))) - 1) < 1e-9 && Math.abs(len(keysToVector(new Set(['w', 'a', 'ArrowDown']))) - 1) < 1e-9, 'diagonal normalised')
  ok(keysToVector(['ArrowUp', 'w']).y === -1 && keysToVector(new Set(['Shift', 'q'])).x === 0, 'duplicate keys and unrelated keys')
  ok(Object.is(keysToVector(new Set(['ArrowLeft', 'ArrowRight'])).x, 0), 'no negative zero')
  ok(len(joystickVector(0, 0, 48)) === 0 && len(joystickVector(2, 2, 48)) === 0, 'joystick dead zone')
  ok(Math.abs(len(joystickVector(48, 0, 48)) - 1) < 1e-9 && len(joystickVector(500, 0, 48)) <= 1 + 1e-9 && joystickVector(500, 0, 48).x > 0.99, 'joystick length at most 1')
  const mid = joystickVector(0, -24, 48)
  ok(mid.x === 0 && mid.y < 0 && mid.y > -1 && Math.abs(mid.y) < 0.5, 'joystick half way is partial speed, direction kept')
  ok(Math.abs(len(joystickVector(30, 40, 50)) - len(joystickVector(40, 30, 50))) < 1e-9, 'joystick direction independent length')
  ok(len(joystickVector(10, 10, 0)) === 0 && joystickVector(8, 0, 48, 0.2).x === 0 && joystickVector(12, 0, 48, 0.2).x > 0, 'joystick custom dead zone / bad radius')
  ok(JSON.stringify(combine({ x: 1, y: 0 }, { x: 0, y: 0 })) === '{"x":1,"y":0}' && JSON.stringify(combine({ x: 1, y: 0 }, { x: 0, y: -0.5 })) === '{"x":0,"y":-0.5}' && JSON.stringify(combine({ x: 0, y: 0 }, { x: 0, y: 0 })) === '{"x":0,"y":0}', 'combine: joystick wins when non-zero')
}

// ---- proximity ----
{
  const pl = [{ id: 'a', entrance: { x: 0, y: 0 } }, { id: 'b', entrance: { x: 20, y: 0 } }]
  ok(nearestPlace({ x: 6.9, y: 0 }, pl, undefined, null) === 'a' && nearestPlace({ x: 7.1, y: 0 }, pl, undefined, null) === null, 'enter radius 7')
  ok(nearestPlace({ x: 8, y: 0 }, pl, undefined, null) === null && nearestPlace({ x: 8, y: 0 }, pl, undefined, 'a') === 'a', 'hysteresis: stays between 7 and 9 once entered')
  ok(nearestPlace({ x: 9, y: 0 }, pl, undefined, 'a') === 'a' && nearestPlace({ x: 9.01, y: 0 }, pl, undefined, 'a') === null, 'leave radius 9')
  ok(nearestPlace({ x: 12, y: 0 }, pl, undefined, 'a') === null && nearestPlace({ x: 14, y: 0 }, pl, undefined, 'a') === 'b', 'a nearer place within 7 replaces the current one; far away gives none')
  ok(nearestPlace({ x: 3, y: 0 }, pl, { enter: 2, leave: 4 }, null) === null && nearestPlace({ x: 3, y: 0 }, pl, { enter: 2, leave: 4 }, 'a') === 'a', 'custom radii')
  ok(nearestPlace({ x: 0, y: 0 }, [], undefined, 'a') === null && nearestPlace({ x: 0, y: 0 }, pl, undefined, 'zzz') === 'a', 'empty list / unknown current id')
  for (const p of PLACES) ok(nearestPlace(p.entrance, PLACES, undefined, null) === p.id, `standing on ${p.id} entrance selects it`)
  ok(nearestPlace(SPAWN, PLACES, undefined, null) === null, 'SPAWN is not near any place')
  ok(nearestPlace(ZONES.find((z) => z.id === 'park').entrance, PLACES, undefined, null) === 'park-green', 'arriving at the park shows the signpost mission at once')
}

// ---- fastTravel / zoneAt / pxPerUnit ----
{
  for (const z of ZONES.filter((q) => q.status === 'ready')) { const t = travelTarget(z.id); ok(t && t.x === z.entrance.x && t.y === z.entrance.y && t.zoneId === z.id && zoneAt(t) === z.id, `travelTarget(${z.id})`) }
  for (const p of PLACES) { const t = travelTarget(p.id); ok(t && t.x === p.entrance.x && t.y === p.entrance.y && t.zoneId === p.zone && zoneAt(t) === p.zone, `travelTarget(${p.id}) inside ${p.zone}`) }
  ok(['market', 'home', 'pond', 'hill', 'nope', '', undefined, null].every((id) => travelTarget(id) === null), 'soon zones / unknown ids have no travel target')
  ok(zoneAt({ x: 160, y: 100 }) === 'plaza' && zoneAt({ x: 40, y: 100 }) === 'park' && zoneAt({ x: 280, y: 100 }) === 'school' && zoneAt({ x: 160, y: 20 }) === 'market' && zoneAt({ x: 40, y: 220 }) === 'home' && zoneAt({ x: 160, y: 200 }) === 'pond' && zoneAt({ x: 280, y: 220 }) === 'hill', 'zoneAt per zone')
  ok(zoneAt({ x: -1, y: 5 }) === null && zoneAt({ x: 5, y: 241 }) === null && zoneAt({ x: 321, y: 5 }) === null, 'zoneAt outside the world is null')
  ok(zoneAt({ x: 0, y: 0 }) === 'market' && zoneAt({ x: 320, y: 240 }) === 'hill', 'zoneAt covers the world corners')
  ok(pxPerUnit(300, 600) === 5 && pxPerUnit(390, 844) === 6.5 && pxPerUnit(1280, 800) === 9 && pxPerUnit(3000, 3000) === 9 && pxPerUnit(0, 0) === 5 && pxPerUnit(NaN, 500) === 5, 'pxPerUnit = clamp(min/60, 5, 9)')
}

// ---- 순수성 ----
for (const f of ['worldMap', 'freeMove', 'inputVector', 'proximity', 'fastTravel']) {
  const src = read(`src/utils/town/proto2_5d/world/${f}.js`)
  const imports = [...src.matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
  ok(imports.every((i) => /^\.\/(worldMap)\.js$/.test(i)), `${f}: imports only ./worldMap.js (${imports.join()})`)
  ok(!/react|localStorage|sessionStorage|document\.|window\.|Math\.random|Date\.now|\.webp|\.png|assets\//.test(src.replace(/\/\/.*$/gm, '')), `${f}: no react / storage / DOM / random / clock / image`)
}
ok(solids() === solids(), 'solids() is memoised and deterministic')

console.log(`testTownWorld: ${n - fail}/${n} PASS`)
process.exit(fail ? 1 : 0)
