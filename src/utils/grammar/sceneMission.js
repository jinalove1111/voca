// 2026-10-10 그림 상황 미션 — 순수 데이터 검증·문장 생성·배치 기하 도우미(React·PNG 없음).
// 단원의 unit.scene 한 덩어리로 단계 카드를 만든다. 문장·정답·버튼은 항상 실제 UI이고 그림에 구워 넣지 않는다.
// v2(2026-10-10): scene.mode 'full'(시범 g-easy-05: 9단계 고정) | 'add'(표준 덱에 설명·그림 활동 카드를 끼워 넣음).
import { PROPS, ACTIONS, RELATIONS, CHARACTERS, BACKGROUNDS, CONTAINERS } from './sceneProps.js'
import { FUNCTION_WORDS, NAME_WORDS } from './grammarUnits.js'

export const SCENE_KINDS = ['discover', 'compare', 'choose', 'build', 'read', 'listen', 'speak', 'write', 'finish']
const NUMS = ['zero', 'one', 'two', 'three', 'four', 'five']
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length
const sing = (o) => String(o?.en || '').replace(/^an? /i, '')

// 목록 항목({obj, n?})을 obj별 개수로 센다(n 생략 시 1) — 배치된 물건({obj,x,y})도 그대로 센다
export const tally = (list) => (list || []).reduce((m, it) => { m[it.obj] = (m[it.obj] || 0) + (it.n ?? 1); return m }, {})
export function countsMatch(a, b) {
  const x = tally(a), y = tally(b)
  const ks = new Set([...Object.keys(x), ...Object.keys(y)])
  return [...ks].every((k) => (x[k] || 0) === (y[k] || 0))
}

// layout [{obj:'tree',n:2}] → 'There are two trees.' / [{dog,1}] → 'There is a dog.' (여러 물건이면 and로 잇고 동사는 첫 물건 기준)
export function layoutSentence(scene, layout) {
  const parts = (layout || []).map(({ obj, n }) => {
    const o = scene.objects[obj]
    return n === 1 ? `a ${sing(o)}` : `${NUMS[n] || n} ${o.enPlural}`
  })
  const first = layout?.[0]
  return `There ${first && first.n === 1 ? 'is' : 'are'} ${parts.join(' and ')}.`
}

// 만들기 단계의 빈 자리 위치(viewBox 360x220, x=가운데·y=바닥)
export const spotPositions = (n) => Array.from({ length: n }, (_, i) => ({ x: n === 1 ? 210 : Math.round(96 + (i * 228) / (n - 1)), y: 186 }))

// ── v2: 그림 방식·배치 기하 ──
// 한 단계/항목이 어떤 그림 방식인지: 명시 view > panels(timeline) > lines(dialogue) > scene
export const viewOf = (o) => o?.view || (o?.panels ? 'timeline' : o?.lines ? 'dialogue' : 'scene')
export const stageProps = (o) => ({ view: viewOf(o), layout: o?.layout, panels: o?.panels, lines: o?.lines, focus: o?.focus })

const GROUND = 188
const SIZE_MUL = { s: 0.7, m: 1, l: 1.3 }
// 한 그림 안에 크기(size)가 섞이면 물건마다 가장 긴 변을 이 값으로 맞춘다(큰 쪽이 작은 쪽의 1.5배 이상)
const NORM = { s: 26, m: 40, l: 62 }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
// 사람은 같은 크기면 키가 같다(아이는 조금 작게)
const charH = (obj) => (obj === 'kid' ? 46 : 58)
const bsOf = (obj) => (PROPS[obj]?.kind === 'character' ? charH(obj) / PROPS[obj].h : 1)

// ref(r = {x, y(현재 바닥), by(들어올리기 전 바닥), w, h}) 기준으로 물건(iw×ih, 같은 자리 m개 중 k번째)을 놓는 자리.
// 돌려주는 값: x, y(바닥), s(물건 크기에 더 곱할 배율), z(ref 기준 그리는 순서). lifted=false면 under는 ref 앞 바닥(위치 놓기용).
// in=ref 안쪽(물건은 ref의 70% 이하) · on=윗면 · under=ref 아래 · next to=같은 바닥선 오른쪽(간격 8, 겹침 없음, 화면 끝이면 왼쪽)
// behind=ref 뒤(왼쪽으로 25%·위로 35%, 0.9배, ref보다 먼저 그림) · in front of=ref 아랫부분을 가리며 앞(오른쪽 15%, 나중에 그림)
function placeRel(r, rel, iw, ih, k = 0, m = 1, lifted = true) {
  const by = r.by ?? r.y
  const spread = (step) => (k - (m - 1) / 2) * step
  switch (rel) {
    case 'in': { const s = Math.min(1, (0.7 * r.w) / iw, (0.7 * r.h) / ih, (0.8 * r.w) / (m * iw)); return { x: r.x + spread(iw * s * 1.05), y: r.y - 0.2 * r.h, s, z: 0.5 } }
    case 'on': return { x: r.x + spread(Math.min(iw * 1.05, (0.9 * r.w) / m)), y: r.y - r.h, s: 1, z: 0.5 }
    case 'under': return { x: r.x + spread(Math.min(iw * 1.05, (0.9 * r.w) / m)), y: lifted ? by : r.y + 14, s: lifted ? 1 : 0.8, z: 0.5 }
    case 'next to': { let x = r.x + r.w / 2 + 8 + iw / 2 + k * (iw + 6); if (x + iw / 2 > 352) x = r.x - r.w / 2 - 8 - iw / 2 - k * (iw + 6); return { x, y: by, s: 1, z: 0.5 } }
    case 'behind': return { x: r.x + (m === 1 ? -0.25 : -0.25 + (0.5 * k) / (m - 1)) * r.w, y: r.y - 0.35 * r.h, s: 0.9, z: -0.5 }
    default: return { x: r.x + 0.15 * r.w + spread(iw * 0.9), y: r.y + 8, s: 1, z: 0.5 } // in front of
  }
}

// 위치 놓기용 6개 관계 자리. ref = {x, y, w, h}(그린 크기), item = 놓을 물건의 {w, h}(원래 크기).
// x·y = 누르는 표시 자리(서로 떨어져 있음), px·py·scale·z = 놓인 물건이 실제로 그려지는 자리(placeRel). z<0이면 ref보다 먼저 그린다.
export function relationSpots(ref, item = { w: 24, h: 24 }) {
  const { x, y, w, h } = ref
  const f = Math.min(1, 64 / item.w), iw = item.w * f, ih = item.h * f
  const mk = (relation, mx, my) => {
    const pl = placeRel({ x, y, w, h }, relation, iw, ih, 0, 1, false)
    return { relation, x: Math.round(clamp(mx, 24, 336)), y: Math.round(Math.min(my, 214)), px: Math.round(clamp(pl.x, 20, 340)), py: Math.round(Math.min(pl.y, 214)), scale: pl.s, z: pl.z < 0 ? -1 : 999, size: 40 }
  }
  return [mk('in', x, y - h * 0.2), mk('on', x, y - h), mk('under', x, y + 14), mk('next to', x + w / 2 + 30, y), mk('behind', x - w / 2 - 14, y - 16), mk('in front of', x + w / 2 + 8, y + 24)]
}

// layout → 낱개 물건 [{obj, i(물건별 번호), x, y, by(들어올리기 전 바닥), z(그리는 순서), scale, w, h, size, dist, at, ref, action, labelKo}] (layout 순서·n개씩).
// at/ref 없는 물건은 한 줄로 늘어놓고(center면 가운데 정렬; next to 물건 몫의 빈 칸을 ref 오른쪽에 남겨 다른 물건을 가리지 않음),
// at/ref는 ref 물건 기준 자리(placeRel; 같은 at+ref 물건은 옆으로 나란히), far는 0.6배·22 위. enlarge: 이 물건은 최소 48 크기로 키움(위치 놓기용).
// 크기: 같은 size끼리면 s 0.7·m 1·l 1.3배, size가 섞이면 가장 긴 변을 s 26·m 40·l 62로 맞춤. 사람은 같은 크기면 키가 같음.
export function layoutItems(layout, { center = false, enlarge = null, mini = false } = {}) {
  const seen = {}
  const flat = []
  for (const it of layout || []) {
    const n = Math.max(1, it.n ?? 1)
    const p = PROPS[it.obj] || { w: 16, h: 16 }
    for (let k = 0; k < n; k++) flat.push({ ...it, n, k, p, bs: bsOf(it.obj), i: (seen[it.obj] = (seen[it.obj] ?? -1) + 1), grow: it.obj === enlarge ? clamp(48 / Math.min(p.w, p.h), 1, 2.2) : 1 })
  }
  const mixed = new Set(flat.map((f) => f.size || 'm')).size > 1
  const far = (f) => (f.dist === 'far' ? 0.6 : 1)
  // 섞인 크기: 가장 긴 변(사람은 키)을 NORM으로 맞추고, 큰 단계는 아래 단계의 가로·세로 최댓값의 1.5배 이상이 되도록 단계 전체를 같은 비율로 키운다
  const raw = (f) => (f.bs !== 1 || PROPS[f.obj]?.kind === 'character' ? NORM[f.size || 'm'] / f.p.h : NORM[f.size || 'm'] / Math.max(f.p.w, f.p.h)) * f.grow * far(f)
  const lf = { s: 1, m: 1, l: 1 }
  if (mixed) {
    let lowW = 0, lowH = 0
    for (const lv of ['s', 'm', 'l']) {
      const its = flat.filter((f) => (f.size || 'm') === lv)
      if (!its.length) continue
      if (lowW) lf[lv] = Math.max(1, ...its.map((f) => Math.max((1.5 * lowW) / (f.p.w * raw(f)), (1.5 * lowH) / (f.p.h * raw(f)))))
      lowW = Math.max(lowW, ...its.map((f) => f.p.w * raw(f) * lf[lv])); lowH = Math.max(lowH, ...its.map((f) => f.p.h * raw(f) * lf[lv]))
    }
  }
  // 작은 무대(mini)에서는 가장 긴 변이 22(far는 16) 아래로 줄지 않게 한다
  const base0 = (f, fit) => (mixed ? raw(f) * lf[f.size || 'm'] : f.bs * Math.min(1, fit / (f.p.w * f.bs)) * SIZE_MUL[f.size || 'm'] * f.grow * far(f))
  const base = (f, fit) => { const s = base0(f, fit); return mini ? Math.max(s, (f.dist === 'far' ? 16 : 22) / Math.max(f.p.w, f.p.h)) : s }
  const anch = flat.filter((f) => f.at && f.ref)
  const row = flat.filter((f) => !(f.at && f.ref))
  // 같은 at+ref 묶음(옆으로 나란히)
  const gcount = {}, gidx = {}
  anch.forEach((f) => { const g = `${f.at}|${f.ref}`; gidx[g] = (gidx[g] ?? -1) + 1; f.gk = gidx[g]; gcount[g] = (gcount[g] || 0) + 1 })
  anch.forEach((f) => { f.gm = gcount[`${f.at}|${f.ref}`] })
  // ref 보정: in이면 ref를 물건 너비의 1.4배 이상으로 키우고, under면 ref를 들어올려 아래에 자리를 만든다
  const refGrow = {}, refLift = {}
  for (const f of anch) {
    const r0 = row.find((x) => x.obj === f.ref && x.i === 0)
    if (!r0) continue
    const iw = f.p.w * base(f, Infinity), ih = f.p.h * base(f, Infinity)
    if (f.at === 'in') { const rw = r0.p.w * base(r0, 64); if (rw < 1.4 * iw) refGrow[f.ref] = Math.max(refGrow[f.ref] || 1, clamp((1.4 * iw) / rw, 1, 2.5)) }
    if (f.at === 'under') refLift[f.ref] = Math.max(refLift[f.ref] || 0, Math.min(ih + 4, 40))
  }
  // 한 줄 칸: next to 물건마다 ref 오른쪽에 빈 칸 하나
  const slots = []
  row.forEach((f) => { slots.push(f); if (f.i === 0) for (let c = anch.filter((a) => a.ref === f.obj && a.at === 'next to').length; c > 0; c--) slots.push(null) })
  const slotW = Math.min(64, 284 / Math.max(slots.length, 1))
  const start = center ? 180 - (slotW * slots.length) / 2 : 66
  const done = []
  const fin = (f, x, y, scale, z, by = y) => { done.push({ obj: f.obj, i: f.i, x, y, by, z, scale, w: f.p.w * scale, h: f.p.h * scale, size: f.size || 'm', dist: f.dist || 'near', at: f.at, ref: f.ref, action: f.action, neg: f.neg, labelKo: f.labelKo }); return done[done.length - 1] }
  slots.forEach((f, k) => {
    if (!f) return
    const y0 = f.dist === 'far' ? GROUND - 22 : GROUND
    const lift = f.i === 0 ? refLift[f.obj] || 0 : 0
    const grow = f.i === 0 ? refGrow[f.obj] || 1 : 1
    fin(f, Math.round(start + slotW * (k + 0.5)), y0 - lift, base(f, slotW - 4) * grow, y0 - lift, y0)
  })
  let pending = anch
  for (let pass = 0; pass <= flat.length && pending.length; pass++) {
    pending = pending.filter((f) => {
      const r = done.find((d) => d.obj === f.ref)
      if (!r) return true
      const own = base(f, Infinity)
      const pl = placeRel(r, f.at, f.p.w * own, f.p.h * own, f.gk, f.gm, true)
      const scale = own * pl.s
      const o = fin(f, Math.round(clamp(pl.x, 20, 340)), f.dist === 'far' ? pl.y - 22 : pl.y, scale, r.z + pl.z)
      if (f.at === 'in' && CONTAINERS.includes(f.ref)) { o.inside = true; r.frontClip = Math.min(r.frontClip ?? Infinity, o.y - 0.4 * o.h) } // 통 앞벽이 물건 아래 40%를 덮는다
      return false
    })
  }
  pending.forEach((f) => fin(f, 180, GROUND, base(f, Infinity), GROUND)) // ref를 못 찾으면(검증에서 막힘) 가운데 바닥
  return flat.map((f) => done.find((d) => d.obj === f.obj && d.i === f.i))
}

// 보기 표시 순서: seed(문자열)로 정해지는 결정적 순열. n>=3이면 항등이 아님(n=2는 seed가 정함). 번호·정답은 계속 데이터 번호로 다룬다
export function displayOrder(n, seed) {
  let h = 2166136261
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  const next = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296 }
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  if (n >= 3 && a.every((v, i) => v === i)) a.push(a.shift())
  return a
}

// 위치 놓기 문장틀: 보기 = relations, 정답 = 놓은 자리의 관계(없으면 -1)
export const positionFrame = (step) => ({ frame: step.frameEn, options: step.place.relations, correctFor: (relation) => step.place.relations.indexOf(relation) })

// ── 검증 ──
// 코스별 영어 문장 최대 단어 수(코스 id와 줄임말 모두 허용). 코스를 모르면 8.
const MAXW = { easy: 7, intermediate: 9, int: 9, advanced: 9, adv: 9, middleSchool: 12, mid: 12, highSchool: 12, high: 12 }
const EXPLAIN = ['discover', 'compare'], PRACTICE = ['choose', 'listen', 'read', 'build']
const ADD_KINDS = [...EXPLAIN, ...PRACTICE]
const norm = (s) => String(s || '').toLowerCase().replace(/[.,!?]+$/g, '').replace(/\s+/g, ' ').trim()
const toks = (t) => String(t ?? '').toLowerCase().split(/\s+/).map((w) => w.replace(/^[^a-z]+|[^a-z]+$/g, '')).filter((w) => /[a-z]/.test(w))
const hasEn = (t) => /[A-Za-z]/.test(String(t || ''))
const SIZES = ['s', 'm', 'l'], DISTS = ['near', 'far']

// validateScene(scene, { course, unit, allowed }) → 오류 문자열 배열. course: 단어 수 한도, unit: 어휘 규칙(unit.words), allowed: 어휘 집합 직접 지정
export function validateScene(scene, { course, unit, allowed } = {}) {
  const e = []
  if (!scene || typeof scene !== 'object') return ['scene 없음']
  const objs = scene.objects || {}
  const steps = scene.steps || []
  const kinds = steps.map((s) => s.kind)
  const all9 = kinds.join() === SCENE_KINDS.join()
  if (scene.mode === undefined && !all9) e.push('mode 없음: 9종류 전체가 아니면 mode 필요')
  else if (scene.mode !== undefined && !['add', 'full'].includes(scene.mode)) e.push(`mode 오류(${scene.mode}): add 또는 full`)
  const full = scene.mode === 'full' || (scene.mode === undefined && all9)
  const max = MAXW[course] ?? 8
  const eng = []
  if (!scene.id || !scene.titleKo || !scene.bgKo) e.push('id·titleKo·bgKo 필요')
  if (scene.bg !== undefined && !BACKGROUNDS.includes(scene.bg)) e.push(`bg 오류(${scene.bg})`)
  if (!full && !scene.bg) e.push('bg 필요(park·home·school·street·plain)')
  if (scene.characters !== undefined && (!Array.isArray(scene.characters) || scene.characters.some((c) => !CHARACTERS.includes(c)))) e.push('characters: CHARACTERS 안의 키만')
  if (!Object.keys(objs).length) e.push('objects 필요')
  for (const [k, o] of Object.entries(objs)) {
    if (!PROPS[k]) e.push(`objects: 알 수 없는 prop ${k}`)
    if (!o?.en || !o?.ko || (full && !o?.enPlural)) e.push(`objects.${k}: en·ko${full ? '·enPlural' : ''} 필요`)
  }
  const en = (s, w) => { if (!s || words(s) > max) e.push(`${w}: 영어 ${max}단어 이하(${s})`); eng.push(s) }
  const frame = (s, w, fills) => {
    if (!s || (String(s).match(/___/g) || []).length !== 1) { e.push(`${w}: 틀에 ___ 하나 필요(${s})`); return }
    if (words(s) > max) e.push(`${w}: 영어 ${max}단어 이하(${s})`)
    fills.forEach((f) => eng.push(s.replace('___', f)))
  }
  const lay = (l, w) => {
    if (!Array.isArray(l) || !l.length) { e.push(`${w}: layout 오류`); return }
    for (const x of l) {
      if (!objs[x?.obj]) e.push(`${w}: objects에 없는 obj ${x?.obj}`)
      else if (!PROPS[x.obj]) e.push(`${w}: PROPS에 없는 obj ${x.obj}`)
      if (x?.n !== undefined && !(Number.isInteger(x.n) && x.n >= 1)) e.push(`${w}: n은 1 이상 정수(${x.obj})`)
      if (full && !Number.isInteger(x?.n)) e.push(`${w}: layout 오류(n 필요)`)
      if (x?.size !== undefined && !SIZES.includes(x.size)) e.push(`${w}: size는 s·m·l(${x.size})`)
      if (x?.dist !== undefined && !DISTS.includes(x.dist)) e.push(`${w}: dist는 near·far(${x.dist})`)
      if (x?.action !== undefined && !ACTIONS[x.action]) e.push(`${w}: 알 수 없는 action ${x.action}`)
      if (x?.neg !== undefined && (typeof x.neg !== 'boolean' || !x.action)) e.push(`${w}: neg는 action과 함께 쓰는 true/false(${x.obj})`)
      if (x?.labelKo !== undefined && (!x.labelKo || hasEn(x.labelKo))) e.push(`${w}: labelKo는 한국어만(${x.labelKo})`)
      if (x?.at !== undefined || x?.ref !== undefined) {
        if (!RELATIONS.includes(x.at)) e.push(`${w}: at 오류(${x.at})`)
        else if (!x.ref || x.ref === x.obj || !l.some((y) => y.obj === x.ref)) e.push(`${w}: at에는 같은 layout의 다른 ref 필요(${x.obj} ${x.at} ${x.ref})`)
      }
    }
  }
  // 한 그림(scene·timeline·dialogue) 검사. secrets = 대화 en이 같으면 안 되는 문장들(정답·보기·듣기/읽기 문장). 그림의 JSON 키를 돌려준다
  const pic = (o, w, secrets = []) => {
    const v = viewOf(o)
    if (!['scene', 'timeline', 'dialogue'].includes(v)) { e.push(`${w}: view 오류(${v})`); return }
    if (v === 'timeline') {
      const ps = o.panels
      if (!Array.isArray(ps) || ps.length < 2 || ps.length > 4) e.push(`${w}: panels 2~4개`)
      ;(Array.isArray(ps) ? ps : []).forEach((p, i) => { if (!p?.labelKo || hasEn(p.labelKo)) e.push(`${w}: panel ${i} labelKo 필요(한국어만)`); lay(p?.layout, `${w}.panel${i}`) })
      if (o.focus !== undefined && !(Number.isInteger(o.focus) && o.focus >= 0 && o.focus < (ps || []).length)) e.push(`${w}: focus 범위`)
    } else lay(o.layout, w)
    if (v === 'dialogue') {
      const ls = o.lines
      if (!Array.isArray(ls) || ls.length < 1 || ls.length > 4) e.push(`${w}: lines 1~4개`)
      ;(Array.isArray(ls) ? ls : []).forEach((l, i) => {
        if (!((scene.characters || []).includes(l?.who) || PROPS[l?.who]?.kind === 'character')) e.push(`${w}: line ${i} who 오류(${l?.who})`)
        if (!l?.ko) e.push(`${w}: line ${i} ko 필요`)
        if (l?.en !== undefined) { en(l.en, `${w}.line${i}`); if (secrets.map(norm).includes(norm(l.en))) e.push(`${w}: 대화 en이 정답·보기·문장과 같음(${l.en})`) }
      })
    }
    return JSON.stringify({ layout: o.layout, panels: o.panels, lines: o.lines })
  }
  if (full) { if (!all9) e.push(`steps 종류·순서: ${kinds.join()}`) }
  else {
    kinds.forEach((k) => { if (!ADD_KINDS.includes(k)) e.push(`add 모드에서 쓸 수 없는 종류: ${k}`) })
    if (!kinds.some((k) => EXPLAIN.includes(k))) e.push('add: discover 또는 compare 필요')
    if (!kinds.some((k) => PRACTICE.includes(k))) e.push('add: choose·listen·read·build 중 하나 필요')
  }
  const [cmin, cmax] = full ? [2, 2] : [2, 4]
  for (const s of steps) {
    if (!s.stepKo) e.push(`${s.kind}: stepKo 없음`)
    if (s.kind === 'discover') { pic(s, 'discover', [s.tap?.en]); en(s.tap?.en, 'discover.tap'); if (!objs[s.tap?.obj]) e.push('discover: tap.obj가 objects에 없음') }
    if (s.kind === 'compare') { pic(s.left || {}, 'compare.left'); pic(s.right || {}, 'compare.right'); en(s.left?.en, 'compare.left'); en(s.right?.en, 'compare.right') }
    if (s.kind === 'choose') {
      if (!s.items?.length) e.push('choose: items 없음')
      for (const it of s.items || []) {
        const opts = it.options || []
        const ok = Array.isArray(it.options) && opts.length >= cmin && opts.length <= cmax && Number.isInteger(it.correct) && it.correct >= 0 && it.correct < opts.length
        if (!ok) e.push(`choose: 보기 ${cmin === cmax ? cmin : `${cmin}~${cmax}`}개·correct 범위 (${it.frame})`)
        frame(it.frame, 'choose.frame', opts)
        pic(it, 'choose', [...opts, ...opts.map((o) => String(it.frame).replace('___', o))])
      }
    }
    if (s.kind === 'build') {
      if (s.place?.ref !== undefined) { // 위치 놓기
        const rels = s.place.relations
        if (!objs[s.place.obj] || !objs[s.place.ref]) e.push('build: place.obj·place.ref가 objects에 없음')
        if (s.place.obj === s.place.ref) e.push('build: place.obj와 ref가 같음')
        if (!Array.isArray(rels) || rels.length < 2 || rels.some((r) => !RELATIONS.includes(r))) e.push('build: relations 2개 이상·RELATIONS 안의 값')
        frame(s.frameEn, 'build.frame', Array.isArray(rels) ? rels : [])
        if (s.layout !== undefined) { pic(s, 'build'); if (!(s.layout || []).some((x) => x.obj === s.place.ref)) e.push('build: layout에 ref가 있어야 함') }
      } else { // 개수 놓기
        if (!objs[s.place?.obj] || !(s.place?.n >= 1) || !(s.slots >= s.place.n)) e.push('build: place·slots 오류(place.n <= slots)')
        en(s.frameEn, 'build.frame'); en(s.answerEn, 'build.answer'); (s.acceptEn || []).forEach((x) => en(x, 'build.accept'))
        if (!(s.acceptEn || []).includes(s.answerEn)) e.push('build: acceptEn에 answerEn 포함 필요')
      }
    }
    if (s.kind === 'read') {
      if (!s.pairs || s.pairs.length < 2) e.push('read: pairs 2개 이상')
      const sents = (s.pairs || []).map((p) => p.en)
      const keys = (s.pairs || []).map((p) => { en(p.en, 'read'); return pic(p, 'read', sents) })
      if (new Set(keys).size !== keys.length) e.push('read: 그림이 서로 달라야 함')
    }
    if (s.kind === 'listen') {
      if (!s.items?.length) e.push('listen: items 없음')
      for (const it of s.items || []) {
        en(it.en, 'listen'); const k = it.options?.length
        if (!(k >= 2 && k <= 3) || !(it.correct >= 0 && it.correct < k)) e.push(`listen: 보기 2~3개·correct (${it.en})`)
        const keys = (it.options || []).map((o) => pic(o, 'listen', [it.en]))
        if (new Set(keys).size !== keys.length) e.push(`listen: 보기 그림이 서로 달라야 함 (${it.en})`)
      }
    }
    if (s.kind === 'speak') { if (!s.practice?.situationKo || !s.exam?.situationKo) e.push('speak: practice·exam situationKo'); en(s.practice?.modelEn, 'speak.practice'); en(s.exam?.modelEn, 'speak.exam'); [...(s.practice?.alternatives || []), ...(s.exam?.alternatives || [])].forEach((x) => en(x, 'speak.alt')) }
    if (s.kind === 'write') { if (!s.promptKo) e.push('write: promptKo'); en(s.exampleEn, 'write.example') }
    if (s.kind === 'finish') { if (!s.canDoKo?.length || !s.paulKo) e.push('finish: canDoKo·paulKo') }
  }
  if (unit || allowed) { // 어휘 규칙: 장면의 모든 영어 단어는 문법어·이름·단원 단어·장면 물건 이름 안에 있어야 한다
    const ok = new Set([...(allowed || [...FUNCTION_WORDS, ...NAME_WORDS, ...(unit?.words || []).flatMap((w) => toks(w.en))]), ...Object.values(objs).flatMap((o) => [...toks(o?.en), ...toks(o?.enPlural)])])
    const unknown = [...new Set(eng.flatMap(toks).filter((w) => !ok.has(w)))]
    if (unknown.length) e.push(`어휘: 배우지 않은 단어 ${unknown.join(', ')}`)
  }
  return e
}

const TITLE = { discover: '찾아보기', compare: '비교하기', choose: '고르기', build: '공원 만들기', read: '읽고 짝짓기', listen: '듣고 고르기', speak: '말하기', write: '쓰기', finish: '마무리 미션' }
// unit.scene → 순서 있는 카드. choose·listen은 문항마다, speak는 연습·시험 두 장, 나머지는 한 장.
// add 모드: 같은 id 규칙(scene-<kind>-<i>)에 slot('explain' | 'practice')을 달아 덱이 끼워 넣을 자리를 정한다.
export function sceneCards(unit) {
  const out = []
  const add = unit?.scene?.mode === 'add'
  const push = (step, extra = {}) => out.push({ id: `scene-${step.kind}-${out.length}`, kind: 'scene', sceneKind: step.kind, stepKo: step.stepKo, title: add && step.kind === 'build' ? '그림 만들기' : TITLE[step.kind], step, itemIndex: 0, ...(add ? { slot: EXPLAIN.includes(step.kind) ? 'explain' : 'practice' } : {}), ...extra })
  for (const s of unit?.scene?.steps || []) {
    if (s.kind === 'choose') s.items.forEach((it, i) => push(s, { itemIndex: i, label: it.promptKo || it.frame }))
    else if (s.kind === 'listen') s.items.forEach((_, i) => push(s, { itemIndex: i, label: '듣고 맞는 그림 고르기' }))
    else if (s.kind === 'speak') { push(s, { itemIndex: 0, mode: 'practice', title: '말하기 연습' }); push(s, { itemIndex: 1, mode: 'exam', title: '말하기 시험', stepKo: '말하기 시험' }) }
    else push(s, { label: s.promptKo || TITLE[s.kind] })
  }
  return out
}

// 연습(결과를 세는) 장면 카드: 고르기·듣기·만들기(개수·위치)·읽기, 그리고 말하기 시험
export const isScenePractice = (c) => c.kind === 'scene' && (['choose', 'listen', 'build', 'read'].includes(c.sceneKind) || (c.sceneKind === 'speak' && c.mode === 'exam'))

// 만들기 문장틀: 실제로 놓은 수(n)에서 만든다. 0개면 데이터의 틀 그대로(보기 없음), 1개면 'There is ___ tree.'(정답 a), 2개 이상이면 'There are ___ trees.'(정답 = 숫자 단어)
export function buildFrame(scene, step, n) {
  const o = scene.objects[step.place.obj]
  if (n < 1) return { frame: step.frameEn, options: [], correct: -1 }
  if (n === 1) return { frame: `There is ___ ${sing(o)}.`, options: ['a', 'one', 'two', 'three'], correct: 0 }
  return { frame: `There are ___ ${o.enPlural}.`, options: NUMS.slice(1, Math.max(3, step.slots) + 1), correct: n - 1 }
}
