// Phonics Adventure prototype checks (253차): data table, bubble/train pure logic over every item x 20 seeds, source pins. Network 0.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let fail = 0, n = 0
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m) } }
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const H = await import('../src/data/pictureWords/index.js')
const D = await import('../src/data/phonics/phonicsWords.js')
const G = await import('../src/utils/phonics/games.js')
const ITEMS = D.PHONICS_ITEMS
const LEARN = H.learnableWords()

// ---- data
ok(ITEMS.length === 20, `all 20 rows resolve (${ITEMS.length})`)
ok(ITEMS.every((it) => { const pw = LEARN.find((e) => e.id === it.id); return pw && pw.en === it.word && pw.asset === it.asset && pw.ko === it.ko }), 'every item is a learnable picture word with the same en')
ok(ITEMS.every((it) => it.graphemes.join('') === it.word), 'graphemes.join("") === word')
ok(ITEMS.every((it) => it.graphemes.length === it.phonemes.length && it.graphemes.every(Boolean) && it.phonemes.every(Boolean)), 'graphemes.length === phonemes.length')
ok(ITEMS.every((it) => it.unitId === null && it.orderConfirmed === false), 'unitId null + orderConfirmed false on every item')
ok(new Set(ITEMS.map((i) => i.id)).size === 20, 'unique ids')
ok(D.PHONICS_SET_LABEL_KO === '시제품 묶음 (교재 순서 아님)', 'set label')

// ---- Sound Bubble Pop
const b = { four: true, uniq: true, target: true, phon: true, det: true, flow: true, lock: true, obj: true }
for (const it of ITEMS) for (let seed = 1; seed <= 20; seed++) {
  const r = G.bubbleRound(it, seed)
  if (JSON.stringify(r) !== JSON.stringify(G.bubbleRound(it, seed))) b.det = false
  if (r.options.length !== 4) b.four = false
  if (new Set(r.options).size !== 4) b.uniq = false
  if (r.options.filter((o) => o === it.graphemes[0]).length !== 1 || r.target.grapheme !== it.graphemes[0] || r.target.ipa !== it.phonemes[0] || r.target.position !== 'initial' || r.itemId !== it.id) b.target = false
  if (r.objectiveKo !== '단어의 첫 소리를 듣고 글자 고르기') b.obj = false
  for (const o of r.options) {
    if (o === it.graphemes[0]) continue
    // every distractor comes from a pool item whose first grapheme is o; none may share the target's first phoneme
    const src = ITEMS.filter((x) => x.graphemes[0] === o)
    if (!src.length || src.some((x) => x.phonemes[0] === it.phonemes[0])) b.phon = false
  }
  const ri = r.options.indexOf(it.graphemes[0])
  const wi = r.options.findIndex((o) => o !== it.graphemes[0])
  let s = G.bubbleStart(r)
  s = G.bubblePick(s, wi)
  if (s.wrong !== 1 || s.last !== 'wrong' || s.done || s.tried.join() !== String(wi)) b.flow = false
  if (G.bubblePick(s, wi) !== s) b.lock = false // a tried wrong option cannot be re-picked
  s = G.bubblePick(s, ri)
  if (!s.done || s.last !== 'right' || s.wrong !== 1 || G.bubblePick(s, wi) !== s) b.flow = false
}
for (const [k, v] of Object.entries(b)) ok(v, `bubble ${k} (20 items x 20 seeds)`)
ok(G.bubbleRound(ITEMS.find((i) => i.word === 'cup'), 1).options.indexOf('c') >= 0, 'cup target c present')
// c (/k/) never shares a round with another /k/ spelling: scarf s c ar f starts with /s/, so check by first phoneme over all
ok(ITEMS.every((it) => { const r = G.bubbleRound(it, 3); const ph = r.options.filter((o) => o !== it.graphemes[0]).map((o) => ITEMS.find((x) => x.graphemes[0] === o).phonemes[0]); return !ph.includes(it.phonemes[0]) }), 'no distractor first phoneme equals target')

// ---- Word Train
const t = { tiles: true, digraph: true, pre: true, det: true, solve: true, wrong: true, dup: true, ids: true }
for (const it of ITEMS) for (let seed = 1; seed <= 20; seed++) {
  const r = G.trainRound(it, seed)
  if (JSON.stringify(r) !== JSON.stringify(G.trainRound(it, seed))) t.det = false
  const gs = r.tiles.map((x) => x.grapheme)
  const extra = r.tiles.filter((x) => !it.graphemes.includes(x.grapheme))
  const real = r.tiles.filter((x) => x.id.startsWith('t'))
  if (r.tiles.length !== it.graphemes.length + 1 || extra.length !== 1 || real.map((x) => x.grapheme).sort().join() !== it.graphemes.slice().sort().join()) t.tiles = false
  if (new Set(r.tiles.map((x) => x.id)).size !== r.tiles.length) t.ids = false
  for (const dg of it.graphemes.filter((g) => g.length > 1)) if (!gs.includes(dg)) t.digraph = false
  if (real.map((x) => x.grapheme).join() === it.graphemes.join()) t.pre = false
  if (r.target.graphemes.join() !== it.graphemes.join() || r.target.phonemes.join() !== it.phonemes.join() || r.objectiveKo !== '소리 블록을 차례로 이어 단어 만들기') t.tiles = false
  // full solve (first matching unused tile) and again with the LAST matching unused tile (duplicates interchangeable)
  for (const last of [false, true]) {
    let s = G.trainStart(r)
    for (const g of it.graphemes) {
      const c = r.tiles.filter((x) => x.grapheme === g && !s.usedTileIds.includes(x.id))
      s = G.trainTap(s, (last ? c[c.length - 1] : c[0]).id)
    }
    if (!s.done || s.wrong !== 0 || s.placed !== it.graphemes.length || s.usedTileIds.length !== it.graphemes.length) t[last ? 'dup' : 'solve'] = false
    if (G.trainTap(s, r.tiles[0].id) !== s) t.solve = false
  }
  const bad = r.tiles.find((x) => x.grapheme !== it.graphemes[0])
  const w = G.trainTap(G.trainStart(r), bad.id)
  if (w.wrong !== 1 || w.last !== 'wrong' || w.placed !== 0 || w.usedTileIds.length || w.done) t.wrong = false
  const first = r.tiles.find((x) => x.grapheme === it.graphemes[0])
  const u = G.trainTap(G.trainStart(r), first.id)
  if (G.trainTap(u, first.id) !== u) t.solve = false // used tile ignored
}
for (const [k, v] of Object.entries(t)) ok(v, `train ${k} (20 items x 20 seeds)`)
const egg = ITEMS.find((i) => i.word === 'egg'), sock = ITEMS.find((i) => i.word === 'sock'), shirt = ITEMS.find((i) => i.word === 'shirt')
ok(G.trainRound(egg, 1).tiles.some((x) => x.grapheme === 'gg') && G.trainRound(sock, 1).tiles.some((x) => x.grapheme === 'ck'), 'egg gg / sock ck stay single tiles')
ok(G.trainRound(shirt, 2).tiles.some((x) => x.grapheme === 'sh') && G.trainRound(shirt, 2).tiles.some((x) => x.grapheme === 'ir'), 'shirt keeps sh / ir as single tiles')

// ---- attempt record
const a = G.phonicsAttempt({ studentId: 'uuid-1', gameId: 'bubble', targetPhonemes: ['b'], itemId: 'pics2/bag', correct: true, retries: 0, completed: true })
ok(Object.isFrozen(a) && Object.keys(a).sort().join() === 'completed,correct,gameId,itemId,retries,studentId,targetPhonemes,unitId,v' && a.v === 1 && a.unitId === null && a.studentId === 'uuid-1', 'phonicsAttempt field set')
ok(G.sessionItems(5).length === 6 && new Set(G.sessionItems(5).map((i) => i.id)).size === 6 && JSON.stringify(G.sessionItems(5)) === JSON.stringify(G.sessionItems(5)) && G.sessionItems(5, 3).length === 3, 'sessionItems seeded, unique, count')

// ---- source pins
const dirs = ['src/components/phonics', 'src/utils/phonics', 'src/data/phonics']
const files = dirs.flatMap((d) => (fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)).map((f) => `${d}/${f}`) : []))
ok(files.length >= 2, `phonics sources found (${files.length})`)
const stripC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
for (const f of files) {
  const src = stripC(read(f))
  ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|supabase|\/api\/|localStorage|sessionStorage/.test(src), `${f} has no network/storage`)
  ok(!/['"`>][^'"`<\n]*(Unit|단원|단계)/.test(src), `${f} has no Unit/단원/단계 label strings`)
  ok(!/grantReward|addPoints|awardStar/.test(src), `${f} has no rewards`)
}
// the speech helper is only called with the item's whole word
for (const f of files.filter((x) => x.endsWith('.jsx'))) {
  const src = stripC(read(f))
  const calls = [...src.matchAll(/(?:playEn|playWordAudio|speak\w*)\(([^)]*)\)/g)].map((m) => m[1].trim())
  ok(calls.every((c) => /(^|[^\w])item\.(word|en)$|^en$|^\w+\.word$/.test(c) || c === '' || c === 'item.word'), `${f} speech calls take only the whole word: ${calls.join(' | ')}`)
}
const comps = files.filter((f) => f.endsWith('.jsx'))
if (comps.length) {
  ok(comps.some((f) => /useReducedMotion/.test(read(f))), 'components have a reduced-motion branch')
  ok(/prefers-reduced-motion/.test(read('src/components/pictureWords/pictureImg.jsx') + comps.map(read).join('')), 'reduced-motion CSS present')
}

console.log(`${fail ? 'FAIL' : 'PASS'} ${n - fail}/${n} testPhonicsGames`)
process.exit(fail ? 1 : 0)
