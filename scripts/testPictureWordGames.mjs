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
  ok(!/data-correct|data-answer|data-right|aria-label/.test(hs + imgSrc), 'hammer: no answer-bearing attributes / aria-label')
  ok(/alt="그림"/.test(imgSrc) && /GamePicture/.test(hs), 'hammer: neutral picture alt')
  ok(/\{st\.done && \([\s\S]{0,300}data-testid="pwh-word"/.test(hs), 'hammer: pwh-word mounted only after completion')
  ok(/prefers-reduced-motion/.test(imgSrc) && /useReducedMotion\(\)/.test(hs), 'hammer: reduced-motion branch')
  ok(!/import [^\n]*\.(png|webp|svg|jpe?g)/.test(hs), 'hammer: no image import (hammer is an emoji)')
  for (const id of ['pwh-root', 'pwh-listen', 'pwh-slot-', 'pwh-tile-', 'pwh-hammer', 'pwh-feedback', 'pwh-next', 'data-used', 'data-filled']) ok(hs.includes(id), `testid ${id}`)
  ok(imgSrc.includes('${testid}') || imgSrc.includes('testid'), 'shared picture takes a testid')
}
if (exists('src/components/pictureWords/HiddenLetters.jsx')) {
  const ls = read('src/components/pictureWords/HiddenLetters.jsx'), imgSrc = read('src/components/pictureWords/pictureImg.jsx')
  ok(!FORBID.test(ls), 'hidden: no network/storage/reward/analytics')
  ok(!/data-correct|data-answer|data-right|aria-label/.test(ls), 'hidden: no answer-bearing attributes / aria-label')
  ok(/GamePicture/.test(ls), 'hidden: neutral picture')
  ok(/\{st\.done && \([\s\S]{0,300}data-testid="pwl-word"/.test(ls), 'hidden: pwl-word mounted only after completion')
  for (const id of ['pwl-root', 'pwl-listen', 'pwl-cell-', 'pwl-opt-', 'pwl-diff-', 'pwl-feedback', 'pwl-next', 'data-blank', 'data-filled', 'data-difficulty']) ok(ls.includes(id), `testid ${id}`)
  ok(!/data-blank=\{[^}]*\.ch/.test(ls), 'hidden: data-blank carries no letter')
}
if (exists('src/components/pictureWords/PictureGames.jsx')) {
  const hubSrc = read('src/components/pictureWords/PictureGames.jsx'), shelfSrc = read('src/components/pictureWords/ShopShelf.jsx'), scr = read('src/components/pictureWords/PictureWordPractice.jsx')
  for (const [name, src] of [['hub', hubSrc], ['shelf', shelfSrc], ['screen', scr]]) ok(!FORBID.test(src), `${name}: no network/storage/reward/analytics`)
  for (const id of ['pwg-summary', 'pwg-again', 'pwg-other', 'pwg-to-practice', 'pwg-exit']) ok(hubSrc.includes(id), `testid ${id}`)
  for (const id of ['pwg-mode-practice', 'pwg-mode-hammer', 'pwg-mode-hidden', 'pwg-level-', '이 단어로 알파벳 망치', '이 단어로 숨은 글자']) ok(scr.includes(id), `screen has ${id}`)
  for (const id of ['pws-root', 'pws-shop-', 'pws-item-', 'pws-practice-', 'pws-practice-all', '준비 중']) ok(shelfSrc.includes(id), `shelf has ${id}`)
  ok(!/가격|구매하기|코인|\bbuy\b|price|useTownShop|townCatalog|TownShopPanel/i.test(shelfSrc), 'shelf: no price/buy/coins/town-shop code')
  ok(/구매는 아직 열리지 않았어요/.test(shelfSrc), 'shelf: not-for-sale note')
  ok(/React\.lazy\(\(\) => import\('\.\/PictureGames'\)\)/.test(scr) && !/^import .*from '\.\/(AlphabetHammer|HiddenLetters|ShopShelf|PictureGames)/m.test(scr), 'games/shelf chunk is lazy-loaded from the screen')
  ok(/^import AlphabetHammer/m.test(hubSrc) && /^import HiddenLetters/m.test(hubSrc) && /^import ShopShelf/m.test(hubSrc), 'one extra chunk hosts hammer + hidden + shelf')
  const imp = (f) => fs.readdirSync(path.join(ROOT, 'src/components/pictureWords')).includes(f)
  ok(imp('pictureImg.jsx'), 'shared image module exists')
}

console.log(fail ? `FAIL ${fail}/${n}` : `PASS ${n}/${n} picture-word game checks`)
process.exit(fail ? 1 : 0)
