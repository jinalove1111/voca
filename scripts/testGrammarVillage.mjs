// 문법 마을 데이터/아트 정적 검증. Network 0, 파일 읽기 + village.js 동적 import만.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let fail = 0, n = 0
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m) } }

const V = await import('../src/utils/grammar/village.js')
const { VILLAGE_DISTRICTS: D, VILLAGE_NO_PLACE_UNITS: NP, VILLAGE_HELD: HELD, VILLAGE_LESSON_ART: LESSON } = V
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/town/kit/manifest.json'), 'utf8')).targets
const GU = await import('../src/utils/grammar/grammarUnits.js')
const readyIds = [...new Set(Object.values(GU).flatMap((x) => (Array.isArray(x) ? x : [])).filter((u) => u?.id && u.status === 'ready').map((u) => u.id))]

ok(D.map((d) => d.id).join() === 'park,home,school,market,square,station,hill', 'district order')
const REF = 360, LABEL = 5, MIN_TAP = 44
// 모든 기하는 '너비 단위'(box 너비 = 100)로 비교한다. y(% of box height) → y / aspect.
const box = (d, it) => {
  const m = manifest[it.art]
  const y1 = it.y / d.aspect
  return { x0: it.x - it.w / 2, x1: it.x + it.w / 2, y0: y1 - it.w * (m.h / m.w), y1 }
}
const inter = (a, b) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  return w > 0 && h > 0 ? w * h : 0
}
const area = (a) => (a.x1 - a.x0) * (a.y1 - a.y0)

// ---- coverage: every manifest target exactly once across place.art / decor.art / backdrop / HELD
const count = new Map()
const bump = (k) => count.set(k, (count.get(k) || 0) + 1)
for (const d of D) {
  if (d.backdrop) bump(d.backdrop)
  d.places.forEach((p) => bump(p.art)); d.decor.forEach((p) => bump(p.art))
}
HELD.forEach((h) => { bump(h.art); ok(!!h.reasonKo, `held reason ${h.art}`) })
ok(Object.keys(manifest).length === 95, 'manifest has 95 entries (94 built + 1 skipped)')
for (const k of Object.keys(manifest)) ok(count.get(k) === 1, `target covered exactly once: ${k} (${count.get(k) || 0})`)
for (const k of count.keys()) ok(!!manifest[k], `art key exists in manifest: ${k}`)
const heldKeys = HELD.map((h) => h.art)
const shown = [...count.keys()].filter((k) => !heldKeys.includes(k))
for (const k of shown) ok(!manifest[k]?.skipped, `shown art not skipped: ${k}`)
ok([...heldKeys].sort().join() === 'backgrounds/plaza-topdown,character/paul-portrait,props/star-trophy,props/treasure-chest', 'held list')
const allDecor = D.flatMap((d) => d.decor.map((x) => x.art))
LESSON.forEach((a) => ok(allDecor.includes(a), `lesson art also on map as decor: ${a}`))

// ---- units
ok(readyIds.length === 34, `34 ready units (${readyIds.length})`)
const placed = D.flatMap((d) => d.places.flatMap((p) => p.unitIds)), noPlace = NP.map((x) => x.unitId)
const all = [...placed, ...noPlace]
ok(placed.length === 26 && noPlace.length === 8, `26 placed + 8 notes (${placed.length}+${noPlace.length})`)
ok(new Set(all).size === all.length, 'no unit twice')
for (const id of readyIds) ok(all.includes(id), `unit placed or noted: ${id}`)
for (const id of all) ok(readyIds.includes(id), `unit exists and ready: ${id}`)
NP.forEach((x) => ok(!!x.reasonKo, `note reason ${x.unitId}`))
ok(V.villageUnitOrder().length === 34, 'villageUnitOrder 34')

// ---- places and layout
const ids = D.flatMap((d) => d.places.map((p) => p.id))
ok(new Set(ids).size === ids.length, 'place ids unique')
for (const d of D) {
  ok(d.aspect >= 0.5 && d.aspect <= 1, `aspect range ${d.id}`)
  ok(!!d.nameKo && !!d.introKo && !!d.ground, `district text ${d.id}`)
  ok(!d.backdrop || d.backdrop.startsWith('backgrounds/'), `backdrop ${d.id}`)
  for (const p of d.places) {
    ok(!!p.nameKo, `place nameKo ${p.id}`)
    ok(p.unitIds.length === 0 ? !!p.soonKo : !p.soonKo && !!p.doKo, `soonKo iff no units: ${p.id}`)
    const b = box(d, p)
    const tapW = (b.x1 - b.x0) * REF / 100, tapH = (b.y1 - b.y0) * REF / 100
    ok(tapW >= MIN_TAP && tapH >= MIN_TAP, `tap box >= 44px at 360: ${p.id} (${tapW.toFixed(0)}x${tapH.toFixed(0)})`)
  }
  const H = 100 / d.aspect
  const items = [
    ...d.places.map((p) => { const b = box(d, p); return { id: p.id, place: true, b, tall: { ...b, y1: b.y1 + LABEL } } }),
    ...d.decor.map((p) => { const b = box(d, p); return { id: p.art, place: false, b, tall: b } }),
  ]
  for (const it of items) {
    ok(it.b.x0 >= -0.01 && it.b.x1 <= 100.01, `inside box width: ${it.id}`)
    ok(it.b.y0 >= -0.01 && it.tall.y1 <= H + 0.01, `inside box height: ${it.id}`)
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]
    if (a.place || b.place) ok(inter(a.tall, b.tall) === 0, `no overlap with place box/label: ${a.id} / ${b.id} in ${d.id}`)
    else ok(inter(a.b, b.b) <= 0.25 * Math.min(area(a.b), area(b.b)), `decor overlap <= 25% of the smaller: ${a.id} / ${b.id} in ${d.id}`)
  }
  for (const x of d.decor) ok(x.w >= 7 && x.w <= 34, `decor width 7-34%: ${x.art}`)
  for (const b of d.bands) ok(['path', 'water'].includes(b.kind) && b.y >= 0 && b.y + b.h <= 100, `band ${d.id}`)
}

// ---- helpers
ok(V.placeById('cafe')?.unitIds.includes('g-easy-07') && V.placeById('nope') === null, 'placeById')
ok(V.districtOfPlace('stone-bridge')?.id === 'station', 'districtOfPlace')
ok(V.placeForUnit('g-adv-01')?.id === 'school' && V.placeForUnit('g-int-01') === null, 'placeForUnit')
ok(V.placeForUnit('g-mid-05')?.id === 'park-green', 'park-green hosts g-mid-05')

// ---- purity + art module + isolation
const code = fs.readFileSync(path.join(ROOT, 'src/utils/grammar/village.js'), 'utf8').replace(/\/\/.*$/gm, '')
ok(!/\bimport\b/.test(code) && !/react|\.webp|assets/i.test(code), 'village.js pure (no imports, no React/images)')
const artSrc = fs.readFileSync(path.join(ROOT, 'src/utils/grammar/villageArt.js'), 'utf8')
ok(artSrc.includes("import.meta.glob('../../assets/town/kit/**/*.webp', { eager: true, import: 'default', query: '?url' })"), 'villageArt glob as ?url')
ok(artSrc.includes('manifest.json'), 'villageArt reads manifest')
for (const k of shown) {
  const [dir, name] = k.split('/')
  const f = (s) => path.join(ROOT, 'src/assets/town/kit', dir, `${name}${s}.webp`)
  ok(fs.existsSync(f('')) && fs.existsSync(f('@2x')), `both files resolve: ${k}`)
}
const importers = []
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
  const p = path.join(dir, e.name)
  if (e.isDirectory()) return walk(p)
  if (/\.(js|jsx|mjs)$/.test(e.name) && /villageArt/.test(fs.readFileSync(p, 'utf8'))) importers.push(path.relative(ROOT, p).split(path.sep).join('/'))
})
walk(path.join(ROOT, 'src'))
const bad = importers.filter((f) => f !== 'src/utils/grammar/villageArt.js' && f !== 'src/components/GrammarVillage.jsx')
ok(bad.length === 0, `villageArt imported only by the village screen: ${bad.join(', ')}`)

console.log(fail ? `FAIL ${fail}/${n}` : `PASS ${n}/${n} grammar village checks`)
process.exit(fail ? 1 : 0)
