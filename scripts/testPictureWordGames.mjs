// Picture-word games / levels checks (250차). Pure logic over every learnable word, fixture decisions, source pins. Network 0.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let fail = 0, n = 0
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m) } }
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(ROOT, p))

const H = await import('../src/data/pictureWords/index.js')
const G = await import('../src/utils/pictureWords/games.js')
const lc = (s) => s.toLowerCase()
const LEARN = H.learnableWords()

// ---- levels
ok(H.LEVELS.map((l) => l.id).join() === 'phonics,conversation,advanced' && H.LEVELS.map((l) => l.enabled).join() === 'true,true,false', 'LEVELS ids + enabled flags')
const ph = H.wordsForLevel('phonics'), conv = H.wordsForLevel('conversation')
ok(ph.length > 0 && ph.every((w) => /^[a-z]{3,4}$/.test(w.en)), `phonics = single plain word, 3-4 letters (${ph.length})`)
ok(LEARN.filter((w) => /^[a-z]{3,4}$/.test(w.en)).length === ph.length, 'phonics selection is by length only (nothing else filters)')
ok(conv.length === LEARN.length && H.wordsForLevel('advanced').length === 0 && H.wordsForLevel('nope').length === 0, 'conversation = all learnable, advanced empty')
ok([ph, conv].every((l) => l.every((w, i) => i === 0 || l[i - 1].id < w.id)), 'alphabetical-by-id base order')
const lvSrc = read('src/data/pictureWords/index.js').split('// Levels (250차)')[1] || ''
ok(lvSrc.length > 0 && !/phonicsCandidate|phonicsGroups/.test(lvSrc.replace(/\/\/.*$/gm, '')), 'level code does not use phonicsCandidate / groups')
ok(/미확정|unconfirmed/.test(lvSrc), 'level code states the phonics order is unconfirmed')

// ---- games logic, every learnable word x 3 seeds
ok(G.letterCells('T-shirt').filter((c) => !c.playable).map((c) => c.ch).join() === '-' && G.letterCells('ice cream').filter((c) => !c.playable).length === 1 && G.letterCells("a'b").filter((c) => !c.playable).length === 1, 'separators are not playable')
const letters = (w) => G.letterCells(w.en).filter((c) => c.playable).map((c) => c.ch)
const h = { perm: true, differ: true, script: true, wrongOnly: true, dup: true, det: true }
const hd = { count: true, notAll: true, opts: true, script: true, wrong: true, det: true, ptr: true }
for (const w of LEARN) for (const seed of [1, 2, 3]) {
  const L = letters(w)
  const r = G.hammerRound(w, seed)
  if (JSON.stringify(r) !== JSON.stringify(G.hammerRound(w, seed))) h.det = false
  if (r.tiles.map((t) => lc(t.ch)).sort().join('') !== L.map(lc).sort().join('') || new Set(r.tiles.map((t) => t.id)).size !== L.length) h.perm = false
  if (new Set(L.map(lc)).size >= 2 && r.tiles.map((t) => lc(t.ch)).join('') === L.map(lc).join('')) h.differ = false
  let s = G.hammerStart(r)
  const bad = r.tiles.find((t) => lc(t.ch) !== lc(L[0]))
  if (bad) {
    const wr = G.hammerTap(s, bad.id)
    if (wr.wrong !== 1 || wr.last !== 'wrong' || wr.placed !== 0 || wr.usedTileIds.length !== 0 || wr.done) h.wrongOnly = false
  }
  for (const ch of L) { const t = r.tiles.find((x) => lc(x.ch) === lc(ch) && !s.usedTileIds.includes(x.id)); s = G.hammerTap(s, t.id) }
  if (!s.done || s.wrong !== 0 || s.placed !== L.length || s.usedTileIds.length !== L.length) h.script = false
  if (G.hammerTap(s, r.tiles[0].id) !== s) h.script = false
  // duplicates interchangeable: take the LAST unused tile of the needed letter instead of the first
  let s2 = G.hammerStart(r)
  for (const ch of L) { const c = r.tiles.filter((x) => lc(x.ch) === lc(ch) && !s2.usedTileIds.includes(x.id)); s2 = G.hammerTap(s2, c[c.length - 1].id) }
  if (!s2.done || s2.wrong !== 0) h.dup = false
  const u = G.hammerTap(G.hammerStart(r), r.tiles.find((t) => lc(t.ch) === lc(L[0])).id)
  if (G.hammerTap(u, u.usedTileIds[0]) !== u) h.script = false // used tile ignored
  if (L.length < 2) continue
  for (const d of ['easy', 'normal', 'hard']) {
    const q = G.hiddenRound(w, { difficulty: d, seed })
    if (JSON.stringify(q) !== JSON.stringify(G.hiddenRound(w, { difficulty: d, seed }))) hd.det = false
    const want = Math.max(1, Math.min(L.length - 1, d === 'easy' ? 1 : d === 'normal' ? Math.max(2, Math.round(L.length / 3)) : Math.max(2, Math.round(L.length / 2))))
    if (q.hidden.length !== want) hd.count = false
    if (q.hidden.length >= L.length || q.hidden.some((i, k) => !q.cells[i].playable || (k && q.hidden[k - 1] >= i))) hd.notAll = false
    for (const b of q.blanks) {
      const a = q.cells[b.index].ch
      if (b.options.length !== 4 || new Set(b.options.map(lc)).size !== 4 || b.options.filter((o) => lc(o) === lc(a)).length !== 1 || b.options.some((o) => !/^[a-z]$/i.test(o))) hd.opts = false
    }
    if (q.blanks.length >= 2 && new Set(q.blanks.map((b) => b.options.findIndex((o) => lc(o) === lc(q.cells[b.index].ch)))).size < 2) hd.ptr = false
    let t = G.hiddenStart(q)
    for (const b of q.blanks) {
      const wrongLetter = b.options.find((o) => lc(o) !== lc(q.cells[b.index].ch))
      const t2 = G.hiddenPick(t, wrongLetter)
      if (t2.filled !== t.filled || t2.wrong !== t.wrong + 1 || t2.last !== 'wrong' || t2.done || G.hiddenPick(t2, wrongLetter) !== t2) hd.wrong = false
      t = G.hiddenPick(t2, q.cells[b.index].ch)
    }
    if (!t.done || t.filled !== q.blanks.length) hd.script = false
  }
}
for (const [k, v] of Object.entries(h)) ok(v, `hammer ${k} (all learnable words x 3 seeds)`)
for (const [k, v] of Object.entries(hd)) ok(v, `hidden ${k} (all learnable words x 3 seeds x 3 difficulties)`)
ok(G.hiddenCount(2, 'hard') === 1 && G.hiddenCount(2, 'normal') === 1 && G.hiddenCount(3, 'easy') === 1 && G.hiddenCount(9, 'hard') === 5 && G.hiddenCount(9, 'normal') === 3, 'hidden counts n=2/3/9')
ok(G.hammerRound({ id: 'x', en: 'apple' }, 4).tiles.filter((t) => t.ch === 'p').length === 2, 'apple has two interchangeable p tiles')
ok(G.hammerRound({ id: 'x', en: 'ice cream' }, 1).tiles.length === 8 && G.hammerRound({ id: 'x', en: 'yo-yo' }, 1).tiles.length === 4, 'separators produce no tiles')

// ---- gameWords
for (const lv of ['phonics', 'conversation']) for (const game of ['hammer', 'hidden']) {
  const a = G.gameWords(lv, { seed: 5, game }), b = G.gameWords(lv, { seed: 5, game })
  ok(JSON.stringify(a) === JSON.stringify(b) && a.length > 0 && a.length <= 6 && new Set(a.map((x) => x.id)).size === a.length, `gameWords ${lv}/${game} deterministic + unique`)
  ok(a.every((x) => G.playableCount(x.en) >= 2 && (game !== 'hammer' || G.playableCount(x.en) <= 9)) && a.every((x) => H.wordsForLevel(lv).some((y) => y.id === x.id)), `gameWords ${lv}/${game} eligible + inside level`)
}
ok(G.gameWords('advanced', { seed: 1, game: 'hidden' }).length === 0, 'gameWords advanced empty')
const shopW = G.gameWords('conversation', { seed: 1, game: 'hidden', shop: 'food' })
ok(shopW.length > 0 && shopW.every((x) => x.shop === 'food'), 'gameWords shop filter')
ok(G.gameWords('conversation', { seed: 1, game: 'hammer', count: 200 }).every((x) => G.playableCount(x.en) <= 9) && LEARN.some((w) => G.playableCount(w.en) > 9), 'hammer excludes > 9 letters (and such words exist)')
ok(G.gameWords(null, { seed: 1, game: 'hidden', from: LEARN.slice(0, 4), count: 2 }).length === 2, 'gameWords from=list (connected entry)')

// ---- source pins
const FORBID = /fetch\(|supabase|\/api\/|localStorage|sessionStorage|grantReward|markPronunciationOk|addStars|XMLHttpRequest|sendBeacon|trackEvent|productEvents/
ok(!/Math\.random|fetch\(|localStorage|sessionStorage|document\.|window\.|from 'react'/.test(read('src/utils/pictureWords/games.js')), 'games.js is pure')

// ---- components (added with the component commits; skipped silently only while they do not exist yet)
if (exists('src/components/pictureWords/AlphabetHammer.jsx')) {
  const hs = read('src/components/pictureWords/AlphabetHammer.jsx'), imgSrc = read('src/components/pictureWords/pictureImg.jsx')
  ok(!FORBID.test(hs + imgSrc), 'hammer: no network/storage/reward/analytics')
  // 259차: a tile may carry aria-label="글자 <its own letter>" (the letter is already its visible text — it says nothing about the answer order); any other aria-label is still forbidden
  ok(!/data-correct|data-answer|data-right/.test(hs + imgSrc) && (hs.match(/aria-label=/g) || []).length === 1 && hs.includes('aria-label={`글자 ${t.ch}`}') && !/aria-label/.test(imgSrc), 'hammer: no answer-bearing attributes; the only aria-label is the tile letter itself (259차)')
  ok(/alt="그림"/.test(imgSrc) && /GamePicture/.test(hs), 'hammer: neutral picture alt')
  ok(/\{st\.done && \([\s\S]{0,300}data-testid="pwh-word"/.test(hs), 'hammer: pwh-word mounted only after completion')
  ok(/prefers-reduced-motion/.test(imgSrc) && /useReducedMotion\(\)/.test(hs), 'hammer: reduced-motion branch')
  ok(!/import [^\n]*\.(png|webp|svg|jpe?g)/.test(hs), 'hammer: no image import (hammer is an emoji)')
  for (const id of ['pwh-root', 'pwh-listen', 'pwh-slot-', 'pwh-tile-', 'pwh-hammer', 'pwh-feedback', 'pwh-next', 'data-used', 'data-filled']) ok(hs.includes(id), `testid ${id}`)
  ok(/getBoundingClientRect\(\)/.test(hs) && /slotRefs/.test(hs) && /transition: `transform \$\{FLY_MS\}ms/.test(hs) && /pwh-fly/.test(hs), 'hammer: travel animation measures tile+slot rects and transitions a transform')
  ok(/if \(!reduced && next\.last === 'right' && el\)/.test(hs), 'hammer: reduced-motion skips the travel (instant placement)')
  ok(/return \(\) => \{ clearTimeout\(a\); clearTimeout\(b\) \}/.test(hs), 'hammer: fly timers cleaned up on unmount')
  ok(/text-6xl/.test(hs) && /text-3xl/.test(hs) && /pw-cell/.test(hs) && /\.pw-cell\{min-width:48px;min-height:48px\}[\s\S]*min-width:390px[\s\S]*min-width:56px;min-height:56px/.test(imgSrc), 'hammer: big emoji, 30px letters, 48px (56px at >=390px) cells')
  ok(imgSrc.includes('${testid}') || imgSrc.includes('testid'), 'shared picture takes a testid')
}
if (exists('src/components/pictureWords/HiddenLetters.jsx')) {
  const ls = read('src/components/pictureWords/HiddenLetters.jsx'), imgSrc = read('src/components/pictureWords/pictureImg.jsx')
  ok(!FORBID.test(ls), 'hidden: no network/storage/reward/analytics')
  ok(!/data-correct|data-answer|data-right|aria-label/.test(ls), 'hidden: no answer-bearing attributes / aria-label')
  ok(/GamePicture/.test(ls), 'hidden: neutral picture')
  ok(/\{st\.done && \([\s\S]{0,300}data-testid="pwl-word"/.test(ls), 'hidden: pwl-word mounted only after completion')
  for (const id of ['pwl-root', 'pwl-listen', 'pwl-cell-', 'pwl-opt-', 'pwl-diff-', 'pwl-feedback', 'pwl-next', 'data-blank', 'data-filled', 'data-difficulty']) ok(ls.includes(id), `testid ${id}`)
  ok(/min-h-\[56px\]/.test(ls) && /text-2xl/.test(ls), 'hidden: option buttons min 56px, 24px letters')
  ok(!/data-blank=\{[^}]*\.ch/.test(ls), 'hidden: data-blank carries no letter')
}
if (exists('src/components/pictureWords/PictureGames.jsx')) {
  const hubSrc = read('src/components/pictureWords/PictureGames.jsx'), shelfSrc = read('src/components/pictureWords/ShopShelf.jsx'), scr = read('src/components/pictureWords/PictureWordPractice.jsx')
  for (const [name, src] of [['hub', hubSrc], ['shelf', shelfSrc], ['screen', scr]]) ok(!FORBID.test(src), `${name}: no network/storage/reward/analytics`)
  for (const id of ['pwg-summary', 'pwg-again', 'pwg-other', 'pwg-to-practice', 'pwg-to-test', 'pwg-exit']) ok(hubSrc.includes(id), `testid ${id}`)
  for (const id of ['pwg-mode-practice', 'pwg-mode-hammer', 'pwg-mode-hidden', 'pwg-level-', '이 단어로 알파벳 망치', '이 단어로 숨은 글자']) ok(scr.includes(id), `screen has ${id}`)
  for (const id of ['pws-root', 'pws-shop-', 'pws-item-', 'pws-practice-', 'pws-practice-all', '준비 중']) ok(shelfSrc.includes(id), `shelf has ${id}`)
  ok(!/가격|구매하기|코인|\bbuy\b|price|useTownShop|townCatalog|TownShopPanel/i.test(shelfSrc), 'shelf: no price/buy/coins/town-shop code')
  ok(/구매는 아직 열리지 않았어요/.test(shelfSrc), 'shelf: not-for-sale note')
  ok(/React\.lazy\(\(\) => import\('\.\/PictureGames'\)\)/.test(scr) && !/^import .*from '\.\/(AlphabetHammer|HiddenLetters|ShopShelf|PictureGames)/m.test(scr), 'games/shelf chunk is lazy-loaded from the screen')
  ok(/^import AlphabetHammer/m.test(hubSrc) && /^import HiddenLetters/m.test(hubSrc) && /^import ShopShelf/m.test(hubSrc), 'one extra chunk hosts hammer + hidden + shelf')
  const imp = (f) => fs.readdirSync(path.join(ROOT, 'src/components/pictureWords')).includes(f)
  ok(imp('pictureImg.jsx'), 'shared image module exists')
}

// ---- sample decisions fixture (in memory only; the real decisions.json stays the empty placeholder)
{
  const { validate } = await import('./pictureWords/validateDecisions.mjs')
  const fx = JSON.parse(read('scripts/pictureWords/fixtures/decisions.sample.json'))
  const verdicts = JSON.parse(read('scripts/pictureWords/source/verdicts.json'))
  const v = validate(fx, verdicts)
  ok(v.errors.length === 0 && v.approved === 4 && v.edited === 3 && v.excluded === 2 && v.pending === 26, `fixture validates ${JSON.stringify({ ...v, errors: v.errors.length })}`)
  const beforeLearn = H.learnableWords().length
  const out = H.applyDecisions(H.PICTURE_WORDS, fx.decisions)
  const by = (id) => out.find((e) => e.id === id)
  ok(by('pics2/chocholate cake').learn && by('pics2/chocholate cake').en === H.PICTURE_WORDS.find((e) => e.id === 'pics2/chocholate cake').en && !by('pics2/chocholate cake').edited, 'fixture: plain approve becomes learnable, words unchanged')
  ok(by('pics2/climb').learn && by('pics2/climb').en === 'climbing frame' && by('pics2/climb').ko === '정글 놀이대' && by('pics2/flower').en === 'tulip' && by('pics2/board').en === 'board' && by('pics2/board').edited, 'fixture: edited approvals carry the edited en/ko')
  ok(!by('pics2/bun').learn && by('pics2/bun').decision === 'exclude' && !by('pics2/baskettt').learn && by('pics2/baskettt').tracks.length === 0, 'fixture: excluded (incl. UNUSABLE) stay out')
  ok(H.learnableWords(out).length === beforeLearn + 4 && H.pendingWords(out).length === 26, `fixture: learnable ${beforeLearn} -> ${beforeLearn + 4}, pending 26`)
  ok(H.learnableWords().length === beforeLearn && read('scripts/pictureWords/source/decisions.json').replace(/\s/g, '').includes('"decisions":{}'), 'fixture: real data and real decisions.json untouched (empty)')
  // the games accept the newly learnable words too
  ok(G.gameWords('conversation', { seed: 3, game: 'hidden', from: H.learnableWords(out), count: 500 }).length >= G.gameWords('conversation', { seed: 3, game: 'hidden', count: 500 }).length, 'fixture: games work with the approved words')
}

// ---- sound effects + shared design (252차)
{
  const sfxSrc = read('src/utils/pictureWords/sfx.js')
  const dir = 'src/components/pictureWords'
  const comps = fs.readdirSync(path.join(ROOT, dir)).filter((f) => /\.(jsx|js)$/.test(f))
  const KEY = 'paulEasyVoca_pictureWordSfx'
  // settings logic with a fake storage and NO AudioContext (node): clamp, default, subscribe, persistence, no throw
  const mem = new Map()
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
  const A = await import('../src/utils/pictureWords/sfx.js?a')
  ok(JSON.stringify(A.getSfxSettings()) === '{"on":true,"volume":0.6}', 'sfx: default on / 0.6')
  let seen = 0
  const off = A.subscribeSfx(() => { seen++ })
  ok(A.setSfxSettings({ volume: 5 }).volume === 1 && A.setSfxSettings({ volume: -2 }).volume === 0 && A.setSfxSettings({ volume: 'x' }).volume === 0.6, 'sfx: volume clamps to 0..1 (junk -> default)')
  A.setSfxSettings({ on: false, volume: 0.3 })
  ok(seen === 4 && A.getSfxSettings().on === false && JSON.parse(mem.get(KEY)).volume === 0.3, 'sfx: subscribe fires per change + persists to the one key')
  off(); A.setSfxSettings({ on: true }); ok(seen === 4, 'sfx: unsubscribe works')
  ok([...mem.keys()].join() === KEY, 'sfx: exactly one storage key is written')
  const B = await import('../src/utils/pictureWords/sfx.js?b')
  ok(B.getSfxSettings().volume === 0.3 && B.getSfxSettings().on === true, 'sfx: settings survive a fresh module load')
  mem.set(KEY, '{broken'); const C = await import('../src/utils/pictureWords/sfx.js?c')
  ok(C.getSfxSettings().on === true && C.getSfxSettings().volume === 0.6, 'sfx: corrupt storage -> defaults')
  let threw = false
  try { for (const nme of ['tap', 'right', 'wrong', 'success', 'nope']) C.playSfx(nme) } catch { threw = true }
  ok(!threw, 'sfx: playSfx without AudioContext is a silent no-op')
  delete globalThis.localStorage
  const D = await import('../src/utils/pictureWords/sfx.js?d')
  ok(D.setSfxSettings({ volume: 0.2 }).volume === 0.2, 'sfx: works without storage')
  // fake AudioContext: each call starts its own oscillators; off / volume 0 create nothing
  let made = 0, starts = 0
  globalThis.AudioContext = class { constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {} } createOscillator() { made++; return { type: '', frequency: { value: 0, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() { starts++ }, stop() {} } } createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} } } }
  const E = await import('../src/utils/pictureWords/sfx.js?e')
  E.playSfx('right'); E.playSfx('right'); E.playSfx('success')
  ok(starts === 2 + 2 + 4 && made === starts, `sfx: overlapping calls each start their own oscillators (right x2 = 4, success = 4; got ${starts})`)
  E.setSfxSettings({ on: false }); E.playSfx('tap'); E.setSfxSettings({ on: true, volume: 0 }); E.playSfx('tap')
  ok(starts === 8, 'sfx: no sound when off or volume 0')
  delete globalThis.AudioContext

  // source pins
  ok(!/import [^\n]*\.(mp3|wav|ogg|m4a|aac)['"]/.test(comps.map((f) => read(`${dir}/${f}`)).join('\n') + sfxSrc) && !/new Audio\(/.test(sfxSrc), 'sfx: no audio file imports / no Audio element')
  const pkg = JSON.parse(read('package.json'))
  ok(!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => /^(howler|tone|tone\.js|use-sound|pizzicato|wavesurfer)/i.test(d)), 'sfx: no audio dependency in package.json')
  ok((sfxSrc.match(/new AC\(\)/g) || []).length === 1 && (sfxSrc.match(/getCtx\(\)/g) || []).length === 2 && /export function playSfx[\s\S]*getCtx\(\)/.test(sfxSrc), 'sfx: the AudioContext is created lazily, only inside playSfx')
  ok(!/^(const|let) \w+ = new (AC|AudioContext)/m.test(sfxSrc) && !/^getCtx\(/m.test(sfxSrc), 'sfx: nothing created on import')
  ok((sfxSrc.match(/paulEasyVoca_pictureWordSfx/g) || []).length === 1 && (sfxSrc.match(/setItem\(/g) || []).length === 1, 'sfx: single storage key literal, single write')
  const others = comps.filter((f) => f !== 'SfxControl.jsx' && f !== 'gameFx.jsx').map((f) => read(`${dir}/${f}`)).join('\n')
  ok(!/localStorage|sessionStorage|pictureWordSfx/.test(others + read(`${dir}/SfxControl.jsx`) + read(`${dir}/gameFx.jsx`)), 'sfx: components never touch storage directly')
  const recFiles = ['src/hooks/useLocalRecorder.js', 'src/components/SpeakingPracticeItem.jsx', `${dir}/recLabels.js`, `${dir}/pictureImg.jsx`]
  ok(recFiles.every((f) => !/pictureWords\/sfx|SfxControl|gameFx|playSfx/.test(read(f))), 'sfx: recorder, record labels and shared image module import no sfx')
  const prac = read(`${dir}/PictureWordPractice.jsx`)
  const cards = prac.slice(prac.indexOf('function PracticeCards'), prac.indexOf('function QuizCard'))
  ok(cards.length > 500 && !/playSfx|SfxControl|sfx/i.test(cards), 'sfx: the practice card (PracticeCards) has no sfx at all')
  ok(/playSfx\(o\.id === q\.correctId/.test(prac) && /<SfxControl \/>/.test(prac), 'sfx: test-question feedback + picker use sfx')
  ok(/<SfxControl \/>/.test(read(`${dir}/PictureGames.jsx`)), 'sfx: game screens show the control')
  const ctl = read(`${dir}/SfxControl.jsx`)
  ok(['pwsfx-toggle', 'pwsfx-volume', 'data-sfx-on', 'data-sfx-volume', 'aria-pressed', 'type="range"', 'min-h-[44px]', 'h-11', '🔊', '🔇'].every((t) => ctl.includes(t)), 'sfx: control testids/data/aria/44px/icons')
  const fx = read(`${dir}/gameFx.jsx`)
  ok(/setTimeout\([\s\S]*SUCCESS_MS/.test(fx) && /playSfx\('success'\)/.test(fx) && /clearTimeout\(t\.current\)/.test(fx) && /useEffect\(\(\) => cancel/.test(fx), 'sfx: success sound, then pronunciation after it; pending pronunciation cancelled on unmount')
  const starN = (fx.match(/\['[^']+', '/g) || []).length
  ok(starN >= 3 && starN <= 6, `sparkle: 3-6 star elements (${starN})`)
  // design tokens (CSS only)
  const img = read(`${dir}/pictureImg.jsx`)
  const css = img.slice(img.indexOf('const CSS = `'))
  ok(/\.pw-card\{[^}]*border:3px solid #F472B6/.test(css) && /\.pw-card\{[^}]*border-radius:24px/.test(css) && /linear-gradient\(160deg,#FFE4EF[^)]*#FFF8EC/.test(css), 'design: .pw-card pink #F472B6 border, rounded, pink -> cream gradient')
  ok(/\.pw-pic\{[^}]*width:100%[^}]*object-fit:contain/.test(css) && !/object-fit:cover/.test(css), 'design: picture fills the card width, contain, never cropped')
  ok(['pw-c0', 'pw-c1', 'pw-c2', 'pw-c3', 'pw-slot', 'pw-slot-on', 'pw-progress', 'pw-bar-fill'].every((c) => css.includes(`.${c}`)), 'design: pastel letter colours, slots, progress classes')
  const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion'))
  const anims = [...new Set([...css.slice(0, css.indexOf('@media (prefers-reduced-motion')).matchAll(/\.(pw-[a-z-]+)\{animation:/g)].map((m) => m[1]))]
  // 262차: one attribute rule per prefix replaces the per-class list (pw-pop was dead CSS and is gone, so 7 animated classes remain)
  ok(anims.length >= 7 && /animation:none!important/.test(reduce) && ['pw', 'pbp', 'pwt'].every((x) => reduce.includes(`[class*=${x}-]`)), `design: reduced-motion covers every animation class (${anims.join(',')})`)
  ok(/\.pw-spark-star\{display:none\}/.test(reduce) && /useReducedMotion\(\)/.test(read(`${dir}/AlphabetHammer.jsx`)) && /!reduced/.test(read(`${dir}/HiddenLetters.jsx`)), 'design: reduced motion hides sparkle and skips glow/fly')
  const durs = [...css.matchAll(/\.(pw-[a-z-]+)\{animation:[a-z-]+ ([\d.]+)s/g)].map((m) => [m[1], Number(m[2])])
  ok(durs.length === anims.length && durs.every(([c, d]) => (c === 'pw-spark' ? d <= 0.6 : d >= 0.15 && d <= 0.3)), `design: animation durations 150-300 ms (sparkle <= 600): ${durs.map((x) => x.join('=')).join(' ')}`)
  const hs2 = read(`${dir}/AlphabetHammer.jsx`)
  ok(/SWING_MS = 120, FLY_MS = 180/.test(hs2) && /setTimeout\(\(\) => setFx\(null\), 300\)/.test(hs2) && /setTimeout\(\(\) => setCelebrate\(false\), 600\)/.test(hs2), 'hammer: swing/fly 300 ms total, wrong shake cleared <= 300 ms, sparkle 600 ms')
  ok(/stRef\.current/.test(hs2) && !/onPointer|onTouch|onMouse/.test(hs2 + read(`${dir}/HiddenLetters.jsx`)), 'hammer: each tap handled once (ref state, click handler only)')
  ok(/Math\.min\(100/.test(img) && /pw-card-sm/.test(read(`${dir}/ShopShelf.jsx`)), 'design: progress bar clamps, shelf items use the card')
  // rule modules untouched by this round
  ok(!/sfx|Sfx/.test(read('src/utils/pictureWords/games.js') + read('src/utils/pictureWords/practice.js')), 'rules: games.js/practice.js know nothing about sound')
}

// ---- 259차: hiddenRound prefer (a phonics unit's target letters hide first); the default round is byte-identical
{
  const w = LEARN.find((x) => x.en === 'cake') || { id: 'x', en: 'cake' }
  let same = true, pref = true
  for (const d of ['easy', 'normal', 'hard']) {
    for (let seed = 0; seed < 20; seed++) {
      const base = G.hiddenRound(w, { difficulty: d, seed })
      if (JSON.stringify(base) !== JSON.stringify(G.hiddenRound(w, { difficulty: d, seed, prefer: undefined }))) same = false
      const p = G.hiddenRound(w, { difficulty: d, seed, prefer: [1] })
      if (!p.hidden.includes(1) || p.hidden.length !== base.hidden.length || JSON.stringify(p) !== JSON.stringify(G.hiddenRound(w, { difficulty: d, seed, prefer: [1] }))) pref = false
      if (G.hiddenRound(w, { difficulty: d, seed, prefer: [99] }).hidden.length !== base.hidden.length) pref = false
    }
  }
  ok(same, 'hiddenRound: prefer undefined = unchanged default round (3 difficulties x seeds 0..19)')
  ok(pref, 'hiddenRound: prefer [1] always hides cell 1 first (same count, deterministic); unknown indexes are ignored')
}

console.log(fail ? `FAIL ${fail}/${n}` : `PASS ${n}/${n} picture-word game checks`)
process.exit(fail ? 1 : 0)
