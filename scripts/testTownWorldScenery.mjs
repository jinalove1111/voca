// scripts/testTownWorldScenery.mjs — Paul Town V2 월드 배경/장식(scenery)
// 동결 데이터(src/utils/town/worldScenery.js)와 승인된 디자인 하네스
// (docs/design/town/mockup/paul-town-recompose.html)의 동기화 테스트
// (2026-09-18).
//
// scripts/testTownHarnessGeometrySync.mjs(지오메트리 #geometry JSON vs
// worldContract.js)와 같은 목적이지만 대상이 다르다 — 이 테스트는 하네스가
// 실제로 그려내는 Batch 1 환경 아트 배치/항상-보이는 소품/표지판/랜드마크
// 잠금 장식이 worldScenery.js의 동결 데이터와 수치까지 일치하는지 검증한다.
// 브라우저 없이(node:vm) 검증한다 — 하네스 HTML의 인라인 <script> 두 개 중
// 실제 합성(composition) 스크립트를 추출해, 스타일/DOM 변화를 기록하는
// 작은 가짜(fake) DOM 위에서 그대로 실행한다. 하네스 자체는 절대 수정하지
// 않는다(동결, CLAUDE.md 규칙 3).
//
// CRLF 안전화: 다른 town 테스트와 동일 관례(텍스트를 읽는 즉시 LF로 정규화).
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

function readText(relPath) {
  return readFileSync(path.join(ROOT, relPath), 'utf8').replace(/\r\n?/g, '\n')
}

let totalPassed = 0
let totalFailed = 0
const failures = []
function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }
const near = (a, b, tol = 0.05) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol

// ── 0. 모듈 번들 + 하네스 소스 추출 ────────────────────────────────────────
section('0. worldScenery.js 번들 + 하네스 소스 추출')

const SCENERY_BUNDLE_PATH = path.join(TMP_DIR, 'worldScenery.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/worldScenery.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: SCENERY_BUNDLE_PATH,
})
const {
  SCENERY_REF_WIDTH, ENV_PLACEMENTS, GROUND, PROP_PLACEMENTS, SIGNS,
  LANDMARK_DECOR, LOCKED_FILTER, LOCKED_VEIL, sceneryFor,
  BG_FILLER_TREES, bgFillerTreeShapes,
} = await import(`${pathToFileURL(SCENERY_BUNDLE_PATH).href}?t=${Date.now()}`)
check('worldScenery.js 번들을 import할 수 있음', Array.isArray(ENV_PLACEMENTS))

const SCENE_BUNDLE_PATH = path.join(TMP_DIR, 'townSceneForWorldScenery.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/townScene.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: SCENE_BUNDLE_PATH,
})
const { DISTRICTS, LOTS } = await import(`${pathToFileURL(SCENE_BUNDLE_PATH).href}?t=${Date.now()}`)

const HTML_PATH = path.join(ROOT, 'docs/design/town/mockup/paul-town-recompose.html')
const html = readText('docs/design/town/mockup/paul-town-recompose.html')
const geoMatch = html.match(/<script\s+id="geometry"\s+type="application\/json">([\s\S]*?)<\/script>/)
check('#geometry <script> 블록을 찾음(하네스 존재/형식 확인)', !!geoMatch)
const geometryRaw = geoMatch ? geoMatch[1] : '{}'

const scriptBlocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
const mainScriptSrc = scriptBlocks.find((s) => s.includes('PARAMS = window.__PT_PARAMS__'))
check('합성(composition) <script> 블록을 찾음', !!mainScriptSrc)

const MANIFEST_PATH = path.join(ROOT, 'docs/design/town/manifest/env-art-manifest.json')
const manifest = JSON.parse(readText('docs/design/town/manifest/env-art-manifest.json'))

// ── 가짜(fake) DOM ──────────────────────────────────────────────────────
function kebab(s) { return s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) }
function camelCase(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) }

class FakeElement {
  constructor(tag) {
    this.tagName = tag
    this._attrs = new Map()
    this.style = {}
    this._className = ''
    this.children = []
    this.parentNode = null
    this._innerHTML = ''
    this._textContent = ''
    this.onload = null
    this.onerror = null
  }
  get className() { return this._className }
  set className(v) { this._className = v }
  get classList() {
    const self = this
    return {
      add(c) { const s = new Set(self._className.split(/\s+/).filter(Boolean)); s.add(c); self._className = [...s].join(' ') },
      contains(c) { return self._className.split(/\s+/).filter(Boolean).includes(c) },
    }
  }
  // 하네스의 scene()이 `wrap.setAttribute('style', wrap.getAttribute('style') + ';' + extraStyle)`로
  // 이미 .style로 세팅해 둔 left/top/width에 filter/opacity를 "병합"하는
  // 패턴을 쓰므로(paul-town-recompose.html scene() 참고), style 속성만은
  // .style 객체와 실제로 동기화한다(실제 브라우저 DOM의 style<->attribute
  // 동기화를 최소 재현) — 그 외 속성은 일반 attrs Map.
  get _serializedStyle() {
    return Object.entries(this.style).map(([k, v]) => `${kebab(k)}:${v}`).join(';')
  }
  setAttribute(name, val) {
    if (name === 'style') {
      String(val).split(';').forEach((rule) => {
        const idx = rule.indexOf(':')
        if (idx === -1) return
        const key = camelCase(rule.slice(0, idx).trim())
        const value = rule.slice(idx + 1).trim()
        if (key) this.style[key] = value
      })
    }
    this._attrs.set(name, String(val))
  }
  getAttribute(name) {
    if (name === 'style') return this._serializedStyle
    return this._attrs.has(name) ? this._attrs.get(name) : null
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child }
  set innerHTML(v) { this._innerHTML = v; this.children = [] }
  get innerHTML() { return this._innerHTML }
  set textContent(v) { this._textContent = v }
  get textContent() { return this._textContent }
  querySelector(sel) {
    const matches = (el) => (sel.startsWith('.')
      ? (el._className || '').split(/\s+/).filter(Boolean).includes(sel.slice(1))
      : el.tagName === sel)
    const stack = [...this.children]
    while (stack.length) {
      const el = stack.shift()
      if (matches(el)) return el
      stack.push(...el.children)
    }
    return null
  }
}

function buildDocument() {
  const registry = {}
  const reg = (id, tag, init) => { const el = new FakeElement(tag); if (init) init(el); registry[id] = el; return el }
  reg('geometry', 'script', (el) => { el.textContent = geometryRaw })
  reg('caption', 'div')
  reg('artBanner', 'div')
  reg('legend', 'div', (el) => { const c = new FakeElement('span'); c.className = 'count'; c.textContent = '…'; el.appendChild(c) })
  reg('stage', 'div')
  reg('grassBase', 'div')
  reg('terrain', 'svg')
  reg('skyHills', 'div', (el) => {
    const img = new FakeElement('img')
    img.setAttribute('data-asset', 'sky-hills')
    img.setAttribute('alt', 'sky-hills')
    img.src = './batch1/sky-hills.webp'
    el.appendChild(img)
  })
  reg('bgTreeLayer', 'g')
  reg('grassPatchLayer', 'div')
  reg('riverLayer', 'div')
  reg('pathLayer', 'div')
  reg('fenceHedgeLayer', 'div')
  reg('clusterLayer', 'div')
  reg('hazeLayer', 'div')
  reg('objLayer', 'div')
  const document_ = {
    getElementById: (id) => registry[id] || null,
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (_ns, tag) => new FakeElement(tag),
  }
  return { document: document_, registry }
}

class FakeImageProbe {
  constructor() { this.onload = null; this.onerror = null; this._src = '' }
  set src(v) { this._src = v }
  get src() { return this._src }
}

function runHarness(paramsPartial) {
  const width = paramsPartial.width ?? 390
  const height = paramsPartial.height ?? Math.round(width * 1.9)
  const level = paramsPartial.level ?? 4
  const zoom = paramsPartial.zoom ?? 1
  const curveMin = paramsPartial.curveMin ?? 45
  const curveStrongMin = paramsPartial.curveStrongMin ?? 75
  const assets = paramsPartial.assets ?? 'batch1'
  const params = { width, height, level, zoom, curveMin, curveStrongMin, assets }
  const { document: document_, registry } = buildDocument()
  const windowObj = { __PT_PARAMS__: params, addEventListener() {} }
  const context = { document: document_, window: windowObj, Image: FakeImageProbe }
  vm.createContext(context)
  new vm.Script(mainScriptSrc, { filename: 'paul-town-recompose-main.js' }).runInContext(context)
  return { registry, params }
}

function parseTransform(t) {
  const out = { anchor: null, rotationDeg: 0, mirror: false }
  const tm = /translate\(([-0-9.]+)%,\s*([-0-9.]+)%\)/.exec(t || '')
  if (tm) {
    const tx = tm[1]; const ty = tm[2]
    if (tx === '-50' && ty === '-50') out.anchor = 'center'
    else if (tx === '0' && ty === '-100') out.anchor = 'bottom-left'
    else if (tx === '-50' && ty === '-100') out.anchor = 'bottom-center'
    else out.anchor = `unknown(${tx},${ty})`
  }
  const rm = /rotate\(([-0-9.]+)deg\)/.exec(t || '')
  if (rm) out.rotationDeg = parseFloat(rm[1])
  out.mirror = /scaleX\(-1\)/.test(t || '')
  return out
}

const ENV_GROUPS = [
  ['grassPatchLayer', 'grassPatch'],
  ['riverLayer', 'river'],
  ['pathLayer', 'path'],
  ['fenceHedgeLayer', 'fenceHedge'],
  ['clusterLayer', 'cluster'],
]

function extractEnvPlacements(registry) {
  const out = []
  for (const [layerId, group] of ENV_GROUPS) {
    registry[layerId].children.forEach((wrap, i) => {
      const img = wrap.children.find((c) => c.getAttribute && c.getAttribute('data-asset'))
      if (!img) return
      const assetKey = img.getAttribute('data-asset')
      const { anchor, rotationDeg, mirror } = parseTransform(wrap.style.transform)
      const feather = wrap.className.includes('pathTile') || wrap.className.includes('riverTile')
      out.push({
        id: `${group}-${i}`,
        assetKey,
        group,
        xPct: parseFloat(wrap.style.left),
        yPct: parseFloat(wrap.style.top),
        wPct: parseFloat(wrap.style.width),
        hPct: parseFloat(wrap.style.height),
        rotationDeg,
        mirror,
        anchor,
        feather,
      })
    })
  }
  return out
}

// ── 1. width=390, level=8 — ENV_PLACEMENTS 정확히 일치 ────────────────────
section('1. width=390 level=8 — ENV_PLACEMENTS와 하네스 실측 비교')

const run390 = runHarness({ width: 390, level: 8 })
const harnessEnv390 = extractEnvPlacements(run390.registry)

check(
  `배치 개수 일치(module=${ENV_PLACEMENTS.length}, harness=${harnessEnv390.length})`,
  ENV_PLACEMENTS.length === harnessEnv390.length,
)

for (const [, group] of ENV_GROUPS) {
  const mKeys = ENV_PLACEMENTS.filter((p) => p.group === group).map((p) => p.assetKey)
  const hKeys = harnessEnv390.filter((p) => p.group === group).map((p) => p.assetKey)
  check(`${group} 그룹 assetKey 순서 일치(개수 module=${mKeys.length}, harness=${hKeys.length})`, JSON.stringify(mKeys) === JSON.stringify(hKeys))
}

const lenForCompare = Math.min(ENV_PLACEMENTS.length, harnessEnv390.length)
let numericMismatch = 0
for (let i = 0; i < lenForCompare; i++) {
  const m = ENV_PLACEMENTS[i]
  const h = harnessEnv390[i]
  const ok = m.id === h.id && m.assetKey === h.assetKey && m.group === h.group
    && near(m.xPct, h.xPct) && near(m.yPct, h.yPct) && near(m.wPct, h.wPct) && near(m.hPct, h.hPct)
    && near(m.rotationDeg, h.rotationDeg) && m.mirror === h.mirror && m.anchor === h.anchor && m.feather === h.feather
  if (!ok) {
    numericMismatch++
    if (numericMismatch <= 5) {
      check(`${m.id} 필드 일치(0.05 이내)`, false, `module=${JSON.stringify(m)} harness=${JSON.stringify(h)}`)
    }
  }
}
check(`전체 ${lenForCompare}개 배치가 모두 0.05 이내로 일치(불일치 ${numericMismatch}건)`, numericMismatch === 0)

// ── 2. 해상도 무관성(width 360/430) ────────────────────────────────────────
section('2. 해상도 무관성 — width 360/430 대비 390')

// 알려진 예외(하네스 자신의 특성, 포팅 버그 아님, 모듈 헤더 주석 참고):
// river 체인의 누적 호장(arc-length) 부동소수점 오차가 마지막 몇 타일의
// xPct/yPct를 폭에 따라 최대 ~0.21%p 흔든다(rotationDeg/wPct/hPct는 실측
// 0 오차). 그래서 위치(x/y)만 완화된 허용치(POS_TOL)를 쓴다.
const POS_TOL = 0.25
const harnessEnv360 = extractEnvPlacements(runHarness({ width: 360, level: 8 }).registry)
const harnessEnv430 = extractEnvPlacements(runHarness({ width: 430, level: 8 }).registry)

function compareResIndep(label, other) {
  check(`${label}: 배치 개수 동일(${other.length})`, other.length === harnessEnv390.length)
  let posBad = 0; let otherBad = 0
  const n = Math.min(other.length, harnessEnv390.length)
  for (let i = 0; i < n; i++) {
    const a = harnessEnv390[i]; const b = other[i]
    if (!(near(a.xPct, b.xPct, POS_TOL) && near(a.yPct, b.yPct, POS_TOL))) posBad++
    if (!(near(a.wPct, b.wPct) && near(a.hPct, b.hPct) && near(a.rotationDeg, b.rotationDeg))) otherBad++
  }
  check(`${label}: 위치(x/y)가 ${POS_TOL}%p 이내(불일치 ${posBad}건)`, posBad === 0)
  check(`${label}: 크기/회전이 0.05 이내(불일치 ${otherBad}건)`, otherBad === 0)
}
compareResIndep('width=360', harnessEnv360)
compareResIndep('width=430', harnessEnv430)

// ── 3. 레벨 무관성(level 1/3/4/5/8) ────────────────────────────────────────
section('3. 레벨 무관성 — level 1/3/4/5/8')

for (const lvl of [1, 3, 4, 5, 8]) {
  const list = lvl === 8 ? harnessEnv390 : extractEnvPlacements(runHarness({ width: 390, level: lvl }).registry)
  const sameLength = check(`level=${lvl}: 배치 개수 동일(${list.length})`, list.length === harnessEnv390.length)
  if (!sameLength) continue
  let bad = 0
  for (let i = 0; i < list.length; i++) {
    const a = harnessEnv390[i]; const b = list[i]
    if (!(a.assetKey === b.assetKey && near(a.xPct, b.xPct) && near(a.yPct, b.yPct) && near(a.wPct, b.wPct) && near(a.hPct, b.hPct) && near(a.rotationDeg, b.rotationDeg))) bad++
  }
  check(`level=${lvl}: level=8과 완전히 동일(불일치 ${bad}건)`, bad === 0)
}

// ── 4. 자산 키 카운트 + 매니페스트 상태 ────────────────────────────────────
section('4. 자산 키별 카운트 + env-art-manifest.json 상태')

const keyCounts = {}
for (const p of ENV_PLACEMENTS) keyCounts[p.assetKey] = (keyCounts[p.assetKey] || 0) + 1
check(`flower-cluster-pink x4(실제 ${keyCounts['flower-cluster-pink']})`, keyCounts['flower-cluster-pink'] === 4)
check(`flower-cluster-yellow x4(실제 ${keyCounts['flower-cluster-yellow']})`, keyCounts['flower-cluster-yellow'] === 4)
check(`shrub-wide x3(실제 ${keyCounts['shrub-wide']})`, keyCounts['shrub-wide'] === 3)

const usedKeys = new Set([...Object.keys(keyCounts), 'grass-base', 'sky-hills'])
check(`하네스 배너와 동일한 34개 자산 키(실제 ${usedKeys.size})`, usedKeys.size === 34, `keys=${JSON.stringify([...usedKeys].sort())}`)

for (const key of usedKeys) {
  const entry = manifest.assets[key]
  check(`${key}: manifest.assets에 존재`, !!entry)
  if (entry) check(`${key}: status === 'staged'`, entry.status === 'staged', `status=${entry.status}`)
}

// ── 5. GROUND / PROP_PLACEMENTS / SIGNS / LANDMARK_DECOR ──────────────────
section('5-a. GROUND — 하네스 CSS 대조')

// GROUND(sky-hills/grass-base)는 하네스의 <style> 블록(정적 CSS)로 정의돼
// JS 합성 스크립트가 런타임에 DOM으로 쓰지 않으므로, vm 기록이 아니라
// 원본 HTML의 CSS 텍스트를 정규식으로 직접 대조한다.
const skyHillsCssMatch = html.match(/\.skyHills\s*\{([^}]*)\}/)
check('.skyHills CSS 규칙을 찾음', !!skyHillsCssMatch)
if (skyHillsCssMatch) {
  const heightMatch = skyHillsCssMatch[1].match(/height:\s*([0-9.]+)%/)
  check('GROUND.skyHills.hPct === .skyHills CSS height', !!heightMatch && Number(heightMatch[1]) === GROUND.skyHills.hPct, `css=${heightMatch && heightMatch[1]} module=${GROUND.skyHills.hPct}`)
}
const skyHillsImgCssMatch = html.match(/\.skyHills img\s*\{([^}]*)\}/)
check('.skyHills img { object-fit: cover } === GROUND.skyHills.objectFit', !!skyHillsImgCssMatch && /object-fit:\s*cover/.test(skyHillsImgCssMatch[1]) && GROUND.skyHills.objectFit === 'cover')

const grassBaseCssMatch = html.match(/\.grassBase\s*\{([^}]*)\}/)
check('.grassBase CSS 규칙을 찾음', !!grassBaseCssMatch)
if (grassBaseCssMatch) {
  const sizeMatch = grassBaseCssMatch[1].match(/background-size:\s*([0-9.]+)px\s+([0-9.]+)px/)
  check('.grassBase background-size가 128x128px', !!sizeMatch && sizeMatch[1] === '128' && sizeMatch[2] === '128')
  if (sizeMatch) {
    const expectedTileWidthPct = Number(sizeMatch[1]) / 3.9
    check('GROUND.grassBase.tileWidthPct === 128px @ SCENERY_REF_WIDTH', near(GROUND.grassBase.tileWidthPct, expectedTileWidthPct, 0.001), `module=${GROUND.grassBase.tileWidthPct} expected=${expectedTileWidthPct}`)
  }
  check('.grassBase background-repeat: repeat === GROUND.grassBase.repeat', /background-repeat:\s*repeat/.test(grassBaseCssMatch[1]) && GROUND.grassBase.repeat === 'xy')
}
const grassBaseFallbackCssMatch = html.match(/\.grassBase\.fallback\s*\{([^}]*)\}/)
if (grassBaseFallbackCssMatch) {
  const gradMatch = grassBaseFallbackCssMatch[1].match(/background:\s*(linear-gradient\([^;]*\));/)
  check('GROUND.grassBase.fallbackBackground === .grassBase.fallback CSS', !!gradMatch && GROUND.grassBase.fallbackBackground === gradMatch[1].trim())
}

section('5-b. PROP_PLACEMENTS — 하네스 objLayer 실측 대조')

const level1Run = runHarness({ width: 390, level: 1 })
const objChildren = level1Run.registry.objLayer.children
const ASSET_BASE_PREFIX = '../../../../src/assets/town/'

// 첫 3개 'shadow' 클래스 엘리먼트는 랜드마크(my-house/book-shop/cafe,
// shadowScale!=null인 3개, LOTS 순서와 동일) 몫이다(LEVEL REVEAL 섹션이
// always-visible 섹션보다 먼저 실행되므로) — 그 뒤의 shadow는 전부 소품
// (tree) 그림자다.
const shadowEls = objChildren.filter((el) => el.className === 'shadow')
check(`objLayer shadow 엘리먼트 >= 3개(랜드마크 몫, 실제 ${shadowEls.length})`, shadowEls.length >= 3)
const propShadowEls = shadowEls.slice(3)

function extractPropShadow(el) {
  return { xPct: parseFloat(el.style.left), yPct: parseFloat(el.style.top), wPct: parseFloat(el.style.width), hPct: parseFloat(el.style.height) }
}
const harnessPropShadows = propShadowEls.map(extractPropShadow)
const modulePropShadows = PROP_PLACEMENTS.filter((p) => p.shadow).map((p) => p.shadow)
check(`소품 그림자 개수 일치(module=${modulePropShadows.length}, harness=${harnessPropShadows.length})`, modulePropShadows.length === harnessPropShadows.length)

function matchOneToOne(label, moduleList, harnessList, keyFn, tol = 0.05) {
  const used = new Array(harnessList.length).fill(false)
  let unmatched = 0
  for (const m of moduleList) {
    const idx = harnessList.findIndex((h, i) => !used[i] && keyFn(m, h, tol))
    if (idx === -1) unmatched++
    else used[idx] = true
  }
  const extra = used.filter((u) => !u).length
  check(`${label}: module 항목이 모두 harness에서 매칭됨(불일치 ${unmatched}건, harness 잔여 ${extra}건)`, unmatched === 0 && extra === 0)
}

matchOneToOne(
  '소품 그림자(xPct/yPct/wPct/hPct)',
  modulePropShadows,
  harnessPropShadows,
  (m, h, tol) => near(m.xPct, h.xPct, tol) && near(m.yPct, h.yPct, tol) && near(m.wPct, h.wPct, tol) && near(m.hPct, h.hPct, tol),
)

// townAsset 소품(나무/가로등/화단/벤치/우체통) — img 자식 하나를 가진
// 'obj' 클래스 엘리먼트 중 src가 ASSET_BASE로 시작하는 것만(Paul은 별도
// 자산 경로라 자동으로 제외됨). renderLandmark()가 그리는 7개 랜드마크
// 건물 img도 className이 'obj'(잠금 시 'obj locked')이고 같은
// ASSET_BASE 접두어를 쓰므로, 그 7개 건물 자산 키는 명시적으로 제외한다
// (LANDMARK_DECOR/§5-d에서 별도로 검증되는 대상이지 PROP_PLACEMENTS
// 대상이 아니다).
const LANDMARK_ASSET_KEYS = new Set([
  'buildings/my-house', 'buildings/book-shop', 'buildings/cafe',
  'decorations/stone-fountain', 'special/bridge', 'special/english-school', 'special/clock-tower',
])
const townAssetEls = objChildren.filter((el) => {
  if (!(el.className === 'obj' || el.className === 'obj locked')) return false
  if (el.children.length !== 1 || el.children[0].tagName !== 'img') return false
  const src = String(el.children[0].src || '')
  if (!src.startsWith(ASSET_BASE_PREFIX)) return false
  const key = src.slice(ASSET_BASE_PREFIX.length).replace(/@2x\.webp$/, '')
  return !LANDMARK_ASSET_KEYS.has(key)
})
function extractTownAssetProp(el) {
  const img = el.children[0]
  const townAssetKey = String(img.src).slice(ASSET_BASE_PREFIX.length).replace(/@2x\.webp$/, '')
  const styleAttr = el.getAttribute('style') || ''
  const filterMatch = /filter:([^;]+)/.exec(styleAttr)
  const opacityMatch = /(?:^|;)opacity:([^;]+)/.exec(styleAttr)
  return {
    townAssetKey,
    xPct: parseFloat(el.style.left),
    yPct: parseFloat(el.style.top),
    wPct: parseFloat(el.style.width),
    filter: filterMatch ? filterMatch[1].trim() : null,
    opacity: opacityMatch ? parseFloat(opacityMatch[1]) : null,
  }
}
const harnessTownAssetProps = townAssetEls.map(extractTownAssetProp)
const moduleTownAssetProps = PROP_PLACEMENTS.filter((p) => p.kind === 'townAsset')
check(`townAsset 소품 개수 일치(module=${moduleTownAssetProps.length}, harness=${harnessTownAssetProps.length})`, moduleTownAssetProps.length === harnessTownAssetProps.length)
matchOneToOne(
  'townAsset 소품(townAssetKey/xPct/yPct/wPct/filter/opacity)',
  moduleTownAssetProps,
  harnessTownAssetProps,
  (m, h, tol) => m.townAssetKey === h.townAssetKey && near(m.xPct, h.xPct, tol) && near(m.yPct, h.yPct, tol) && near(m.wPct, h.wPct, tol)
    && (m.filter || null) === (h.filter || null) && (m.opacity == null ? h.opacity == null : near(m.opacity, h.opacity, 0.001)),
)

// ivy — obj 클래스지만 자식이 없고(=img 없음) innerHTML에 담쟁이 SVG가 직접 담김.
const ivyEls = objChildren.filter((el) => el.className === 'obj' && el.children.length === 0 && el._innerHTML.includes('viewBox="0 0 26 26"'))
check(`ivy 엘리먼트 정확히 1개(실제 ${ivyEls.length})`, ivyEls.length === 1)
const moduleIvy = PROP_PLACEMENTS.find((p) => p.kind === 'ivy')
check('module에 ivy 항목이 정확히 1개', PROP_PLACEMENTS.filter((p) => p.kind === 'ivy').length === 1)
if (ivyEls.length === 1 && moduleIvy) {
  const ivyEl = ivyEls[0]
  check('ivy xPct/yPct/wPct 일치', near(moduleIvy.xPct, parseFloat(ivyEl.style.left)) && near(moduleIvy.yPct, parseFloat(ivyEl.style.top)) && near(moduleIvy.wPct, parseFloat(ivyEl.style.width)))
  check('ivy svgInner 문자열이 하네스 innerHTML과 정확히 일치', moduleIvy.svgInner === ivyEl._innerHTML)
}

section('5-b2. BG_FILLER_TREES — 하네스 bgTreeLayer 실측 대조(배경 채움 나무 10그루, 2026-09-18)')

const bgTreeEls = level1Run.registry.bgTreeLayer.children
check(
  `bgTreeLayer <g> 개수(${bgTreeEls.length}) === BG_FILLER_TREES 길이(${BG_FILLER_TREES.length})`,
  bgTreeEls.length === BG_FILLER_TREES.length,
)

function numAttr(el, name) {
  return el ? parseFloat(el.getAttribute(name)) : NaN
}
let bgTreeMismatch = 0
const bgTreeLen = Math.min(bgTreeEls.length, BG_FILLER_TREES.length)
for (let i = 0; i < bgTreeLen; i++) {
  const g = bgTreeEls[i]
  const tree = BG_FILLER_TREES[i]
  const shapes = bgFillerTreeShapes(tree)
  const [trunkEl, bodyEl, highlightEl] = g.children
  const ok = !!trunkEl && !!bodyEl && !!highlightEl
    && near(numAttr(trunkEl, 'cx'), shapes.trunk.cx) && near(numAttr(trunkEl, 'cy'), shapes.trunk.cy)
    && near(numAttr(trunkEl, 'rx'), shapes.trunk.rx) && near(numAttr(trunkEl, 'ry'), shapes.trunk.ry)
    && trunkEl.getAttribute('fill') === shapes.trunk.fill
    && near(numAttr(bodyEl, 'cx'), shapes.body.cx) && near(numAttr(bodyEl, 'cy'), shapes.body.cy)
    && near(numAttr(bodyEl, 'r'), shapes.body.r) && bodyEl.getAttribute('fill') === shapes.body.fill
    && near(numAttr(highlightEl, 'cx'), shapes.highlight.cx) && near(numAttr(highlightEl, 'cy'), shapes.highlight.cy)
    && near(numAttr(highlightEl, 'r'), shapes.highlight.r) && highlightEl.getAttribute('fill') === shapes.highlight.fill
    && g.getAttribute('opacity') === '0.62'
  if (!ok) {
    bgTreeMismatch++
    if (bgTreeMismatch <= 3) {
      check(`bgTree[${i}](${tree.id}) 도형(trunk/body/highlight cx/cy/rx/ry/r/fill) + opacity 일치`, false,
        `module=${JSON.stringify(shapes)} harness trunk=${trunkEl && trunkEl.getAttribute('style')}`)
    }
  }
}
check(`전체 ${bgTreeLen}그루 도형이 모두 일치(불일치 ${bgTreeMismatch}건)`, bgTreeMismatch === 0)

section('5-c. SIGNS — My House / To the Sea / Lv.N')

const signEls = objChildren.filter((el) => el.className === 'sign')
const myHouseSignEl = signEls.find((el) => el._innerHTML.includes('My House'))
check('My House 표지판 엘리먼트를 찾음', !!myHouseSignEl)
if (myHouseSignEl) {
  check('SIGNS.myHouse xPct/yPct/wPct 일치', near(SIGNS.myHouse.xPct, parseFloat(myHouseSignEl.style.left)) && near(SIGNS.myHouse.yPct, parseFloat(myHouseSignEl.style.top)) && near(SIGNS.myHouse.wPct, parseFloat(myHouseSignEl.style.width), 0.001))
  check('SIGNS.myHouse.svgInner가 하네스 innerHTML과 정확히 일치', SIGNS.myHouse.svgInner === myHouseSignEl._innerHTML)
}

const seaSignEl = signEls.find((el) => el._innerHTML.includes('To the Sea'))
check('To the Sea 표지판 엘리먼트를 찾음', !!seaSignEl)
if (seaSignEl) {
  check('SIGNS.sea xPct/yPct/wPct 일치', near(SIGNS.sea.xPct, parseFloat(seaSignEl.style.left)) && near(SIGNS.sea.yPct, parseFloat(seaSignEl.style.top)) && near(SIGNS.sea.wPct, parseFloat(seaSignEl.style.width), 0.001))
  check('SIGNS.sea.svgInner가 하네스 innerHTML과 정확히 일치', SIGNS.sea.svgInner === seaSignEl._innerHTML)
}

const lvSignEls = signEls.filter((el) => /Lv\.\d+/.test(el._innerHTML))
check(`Lv.N 표지판 5개(book-shop/stone-fountain/bridge/english-school/clock-tower, 실제 ${lvSignEls.length})`, lvSignEls.length === 5)
for (const el of lvSignEls) {
  const normalized = el._innerHTML.replace(/Lv\.\d+/, 'Lv.{n}')
  check('Lv.N 표지판 svgTemplate(숫자 제외) 일치', normalized === SIGNS.lvSign.svgTemplate, `harness=${el._innerHTML}`)
  check('Lv.N 표지판 wPct 일치', near(SIGNS.lvSign.wPct, parseFloat(el.style.width), 0.001))
}

// 2026-09-18(오너 결정 — 사전 보정 패스) — 4-arm 안내판. 하네스는 여전히
// 4번째 칸에 "Go Further"를 그대로 그리므로, SIGNS.fourWay.svgInner에
// 정확히 그 단일 치환(Go Further -> Explore)을 "거꾸로" 적용한 문자열이
// 하네스 실측 innerHTML과 바이트 단위로 같은지 대조한다(그 외 좌표/폰트-
// 사이즈/색상은 전혀 안 바뀌었다는 것을 이 비교 자체가 증명한다).
const fourWaySignEl = signEls.find((el) => el._innerHTML.includes('Learn') && el._innerHTML.includes('Be Kind'))
check('4-arm 안내판(Learn/Grow/Be Kind/Go Further) 엘리먼트를 찾음', !!fourWaySignEl)
if (fourWaySignEl) {
  check('SIGNS.fourWay xPct/yPct/wPct 일치', near(SIGNS.fourWay.xPct, parseFloat(fourWaySignEl.style.left)) && near(SIGNS.fourWay.yPct, parseFloat(fourWaySignEl.style.top)) && near(SIGNS.fourWay.wPct, parseFloat(fourWaySignEl.style.width), 0.001))
  const moduleAsHarness = SIGNS.fourWay.svgInner.replace('Explore', 'Go Further')
  check(
    'SIGNS.fourWay.svgInner에 "Explore"->"Go Further" 역치환한 결과가 하네스 innerHTML과 정확히 일치(그 한 글자만 바뀌었음을 증명)',
    moduleAsHarness === fourWaySignEl._innerHTML,
    `module(역치환)=${moduleAsHarness}\nharness=${fourWaySignEl._innerHTML}`,
  )
  check('SIGNS.fourWay.svgInner 자체에 "Go Further" 없음(승인된 카피로 교체 완료)', !SIGNS.fourWay.svgInner.includes('Go Further'))
  check('SIGNS.fourWay.svgInner에 "Explore" 정확히 1회 포함', (SIGNS.fourWay.svgInner.match(/Explore/g) || []).length === 1)
}

section('5-d. LANDMARK_DECOR — 헤이즈/표지판 앵커/그림자 스케일')

const LOT_ORDER = LOTS.map((l) => l.id)
check(
  "LOT_ORDER === ['my-house','book-shop','cafe','stone-fountain','bridge','english-school','clock-tower']",
  JSON.stringify(LOT_ORDER) === JSON.stringify(['my-house', 'book-shop', 'cafe', 'stone-fountain', 'bridge', 'english-school', 'clock-tower']),
)
check('LANDMARK_DECOR의 키 집합이 LOTS id 집합과 동일', JSON.stringify(Object.keys(LANDMARK_DECOR).sort()) === JSON.stringify([...LOT_ORDER].sort()))

for (const id of LOT_ORDER) {
  const lot = LOTS.find((l) => l.id === id)
  const decor = LANDMARK_DECOR[id]
  const district = DISTRICTS[lot.district]
  check(`${id}: unlockLevel === DISTRICTS[${lot.district}].unlock`, decor.unlockLevel === district.unlock, `decor=${decor.unlockLevel} district=${district.unlock}`)
}

const hazeEls = level1Run.registry.hazeLayer.children
const hazeOrder = LOT_ORDER.filter((id) => LANDMARK_DECOR[id].hazeBox)
check(`hazeLayer 엔트리 개수(${hazeEls.length}) === hazeBox!=null인 랜드마크 수(${hazeOrder.length})`, hazeEls.length === hazeOrder.length)
hazeOrder.forEach((id, i) => {
  const el = hazeEls[i]
  const box = LANDMARK_DECOR[id].hazeBox
  if (!el) { check(`${id}: hazeLayer[${i}] 존재`, false); return }
  const okPos = near(box.xPct, parseFloat(el.style.left)) && near(box.yPct, parseFloat(el.style.top))
    && near(box.wPct, parseFloat(el.style.width)) && near(box.hPct, parseFloat(el.style.height))
  const filterMatch = /blur\(([0-9.]+)px\)/.exec(el.style.filter || '')
  const okBlur = !!filterMatch && Number(filterMatch[1]) === box.blur
  const okOpacity = Number(el.style.opacity) === box.opacity
  check(`${id}: hazeBox xPct/yPct/wPct/hPct 일치`, okPos, `module=${JSON.stringify(box)} harness left=${el.style.left} top=${el.style.top} width=${el.style.width} height=${el.style.height}`)
  check(`${id}: hazeBox blur/opacity 일치`, okBlur && okOpacity, `module blur=${box.blur} opacity=${box.opacity} harness filter=${el.style.filter} opacity=${el.style.opacity}`)
})

const signAnchorOrder = LOT_ORDER.filter((id) => LANDMARK_DECOR[id].signAnchor)
check(`Lv.N 표지판 개수(${lvSignEls.length}) === signAnchor!=null인 랜드마크 수(${signAnchorOrder.length})`, lvSignEls.length === signAnchorOrder.length)
signAnchorOrder.forEach((id, i) => {
  const el = lvSignEls[i]
  const anchor = LANDMARK_DECOR[id].signAnchor
  const unlockLevel = LANDMARK_DECOR[id].unlockLevel
  if (!el) { check(`${id}: Lv.N 표지판[${i}] 존재`, false); return }
  check(`${id}: signAnchor 위치 일치`, near(anchor[0], parseFloat(el.style.left)) && near(anchor[1], parseFloat(el.style.top)))
  check(`${id}: Lv.N 표지판 텍스트가 unlockLevel(${unlockLevel})과 일치`, new RegExp(`Lv\\.${unlockLevel}\\b`).test(el._innerHTML))
})

const shadowScaleOrder = LOT_ORDER.filter((id) => LANDMARK_DECOR[id].shadowScale)
check(`landmark shadow 3개(my-house/book-shop/cafe) === shadowScale!=null 랜드마크 수(${shadowScaleOrder.length})`, shadowEls.length >= shadowScaleOrder.length && shadowScaleOrder.length === 3)
shadowScaleOrder.forEach((id, i) => {
  const el = shadowEls[i]
  const lot = LOTS.find((l) => l.id === id)
  const scale = LANDMARK_DECOR[id].shadowScale
  if (!el) { check(`${id}: landmark shadow[${i}] 존재`, false); return }
  // worldContract.js LANDMARKS[*].w로 실제 grassBase w를 다시 찾지 않고,
  // 하네스가 그 시점 실제로 쓴 g.w(=LOTS 데이터가 아니라 GEO.landmarks[key].w,
  // #geometry JSON)와 module의 파생식(shadow.wPct = w*scale[0])이 같은지만
  // 비교한다 — g.w는 하네스 DOM 기록(shadow wrapper의 width)에서 역산.
  const wPctFromDom = parseFloat(el.style.width)
  const gW = wPctFromDom / scale[0]
  const expectedHeightPct = (gW * scale[1]) / 1.9
  check(`${id}: shadow width === w*shadowScale[0](일관성 자기검증)`, near(wPctFromDom, gW * scale[0], 0.01))
  check(`${id}: shadow height === (w*shadowScale[1])/1.9`, near(parseFloat(el.style.height), expectedHeightPct, 0.01), `harness height=${el.style.height} expected=${expectedHeightPct}`)
  void lot
})

check('LOCKED_FILTER.filter === .locked img CSS filter', /filter:\s*grayscale\(0\.3\) saturate\(0\.7\) brightness\(0\.78\);/.test(html) && LOCKED_FILTER.filter === 'grayscale(0.3) saturate(0.7) brightness(0.78)')
check('LOCKED_FILTER.opacity === .locked img CSS opacity(.62)', /\.locked img[^}]*opacity:\s*\.62;/.test(html) && LOCKED_FILTER.opacity === 0.62)
check('LOCKED_VEIL.background === .locked::after CSS background', html.includes(LOCKED_VEIL.background))

// ── 6. 모듈 순수성 ─────────────────────────────────────────────────────────
section('6. 모듈 순수성')

const sceneryRawSrc = readText('src/utils/town/worldScenery.js')
check('worldScenery.js 소스를 읽을 수 있음', sceneryRawSrc.length > 0)
check('fetch( 호출 없음', !/\bfetch\(/.test(sceneryRawSrc))
check('localStorage 실사용 없음', !/localStorage\s*[.[]/.test(sceneryRawSrc))
check('Math.random( 호출 없음', !/Math\.random\(/.test(sceneryRawSrc))
check('document. 참조 없음', !/\bdocument\./.test(sceneryRawSrc))
check('window. 참조 없음', !/\bwindow\./.test(sceneryRawSrc))
check('supabase 참조 없음', !/supabase/i.test(sceneryRawSrc))
check('isFeatureEnabled( 호출 없음', !/isFeatureEnabled\(/.test(sceneryRawSrc))
check("'Welcome to Paul Town' 문자열 없음", !sceneryRawSrc.includes('Welcome to Paul Town'))
check("import는 './worldContract'만 사용", /from '\.\/worldContract'/.test(sceneryRawSrc))
const importSpecifiers = [...sceneryRawSrc.matchAll(/from '([^']+)'/g)].map((m) => m[1])
check('import 대상이 worldContract 하나뿐', importSpecifiers.length === 1 && importSpecifiers[0] === './worldContract')

// 경로처럼 보이는 문자열 리터럴(슬래시 포함)에 'paul'이 대소문자 무관하게
// 등장하지 않는지 — Paul 본체/자산 경로를 이 모듈에 넣지 않는다는 오너
// 결정(모듈 헤더 참고)을 기계적으로 강제한다. (주석 속 "Paul"은 검사
// 대상이 아니다 — 문자열 리터럴만 스캔.)
const stringLiterals = [...sceneryRawSrc.matchAll(/'([^'\\]|\\.)*'/g)].map((m) => m[0].slice(1, -1))
const pathLikeWithPaul = stringLiterals.filter((s) => s.includes('/') && /paul/i.test(s))
check("경로형 문자열 리터럴에 'paul'(대소문자 무관) 없음", pathLikeWithPaul.length === 0, `matches=${JSON.stringify(pathLikeWithPaul)}`)

// ── 7. 결정론 + 동결(frozen) ───────────────────────────────────────────────
section('7. 결정론 + 동결(frozen)')

const secondImport = await import(`${pathToFileURL(SCENERY_BUNDLE_PATH).href}?t=${Date.now()}-second`)
check('ENV_PLACEMENTS 두 번 import 결과가 deep-equal', JSON.stringify(ENV_PLACEMENTS) === JSON.stringify(secondImport.ENV_PLACEMENTS))
check('PROP_PLACEMENTS 두 번 import 결과가 deep-equal', JSON.stringify(PROP_PLACEMENTS) === JSON.stringify(secondImport.PROP_PLACEMENTS))
check('BG_FILLER_TREES 두 번 import 결과가 deep-equal', JSON.stringify(BG_FILLER_TREES) === JSON.stringify(secondImport.BG_FILLER_TREES))
check('SIGNS 두 번 import 결과가 deep-equal', JSON.stringify(SIGNS) === JSON.stringify(secondImport.SIGNS))
check('LANDMARK_DECOR 두 번 import 결과가 deep-equal', JSON.stringify(LANDMARK_DECOR) === JSON.stringify(secondImport.LANDMARK_DECOR))
check('GROUND 두 번 import 결과가 deep-equal', JSON.stringify(GROUND) === JSON.stringify(secondImport.GROUND))

check('ENV_PLACEMENTS가 Object.freeze됨', Object.isFrozen(ENV_PLACEMENTS))
check('ENV_PLACEMENTS 모든 항목이 Object.freeze됨', ENV_PLACEMENTS.every((p) => Object.isFrozen(p)))
check('PROP_PLACEMENTS가 Object.freeze됨', Object.isFrozen(PROP_PLACEMENTS))
check('PROP_PLACEMENTS 모든 항목이 Object.freeze됨', PROP_PLACEMENTS.every((p) => Object.isFrozen(p)))
check('BG_FILLER_TREES가 Object.freeze됨', Object.isFrozen(BG_FILLER_TREES))
check('BG_FILLER_TREES 모든 항목이 Object.freeze됨', BG_FILLER_TREES.every((t) => Object.isFrozen(t)))
check('BG_FILLER_TREES 길이가 정확히 10', BG_FILLER_TREES.length === 10, `count=${BG_FILLER_TREES.length}`)
check('bgFillerTreeShapes가 함수로 export됨', typeof bgFillerTreeShapes === 'function')
check('SIGNS가 Object.freeze됨', Object.isFrozen(SIGNS))
check('LANDMARK_DECOR가 Object.freeze됨', Object.isFrozen(LANDMARK_DECOR))
check('GROUND이 Object.freeze됨', Object.isFrozen(GROUND))
check('SCENERY_REF_WIDTH === 390', SCENERY_REF_WIDTH === 390)
check('sceneryFor(아무 레벨)이 ENV_PLACEMENTS와 동일(현재 전부 레벨 무관)', sceneryFor(1) === ENV_PLACEMENTS && sceneryFor(8) === ENV_PLACEMENTS)

void HTML_PATH
void MANIFEST_PATH

// ── 요약 ────────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (totalFailed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
