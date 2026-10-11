// PAUL PHONICS checks (253차 prototype, 254차 curriculum): data table, curriculum eligibility, bubble/train pure logic over every item x 20 seeds, source pins. Network 0.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let fail = 0, n = 0
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m) } }
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const H = await import('../src/data/pictureWords/index.js')
const D = await import('../src/data/phonics/phonicsWords.js')
const G = await import('../src/utils/phonics/games.js')
const C = await import('../src/data/phonics/curriculum.js')
const U = await import('../src/utils/phonics/curriculum.js')
const K = await import('../src/data/phonics/phonemeClips.js')
const ITEMS = D.PHONICS_ITEMS
const LEARN = H.learnableWords()

// ---- data
ok(ITEMS.length === 24, `all 24 rows resolve (${ITEMS.length})`)
ok(['cake', 'tape', 'kite', 'slide'].every((w) => ITEMS.some((i) => i.word === w && i.id === `pics2/${w}`)), 'the 4 split-digraph rows resolve')
ok(ITEMS.every((it) => { const pw = LEARN.find((e) => e.id === it.id); return pw && pw.en === it.word && pw.asset === it.asset && pw.ko === it.ko }), 'every item is a learnable picture word with the same en')
ok(ITEMS.every((it) => D.spell(it.graphemes) === it.word), 'spell(graphemes) === word')
ok(ITEMS.filter((it) => !it.graphemes.some((g) => g.includes('_'))).every((it) => it.graphemes.join('') === it.word), 'plain rows: graphemes.join("") === word')
ok(D.spell(['c', 'a_e', 'k']) === 'cake' && D.spell(['s', 'l', 'i_e', 'd']) === 'slide' && D.spell(['k', 'i_e', 't']) === 'kite' && D.spell(['t', 'r', 'ai', 'n']) === 'train', 'spell rows')
ok(ITEMS.every((it) => it.graphemes.length === it.phonemes.length && it.graphemes.every(Boolean) && it.phonemes.every(Boolean)), 'graphemes.length === phonemes.length')
ok(ITEMS.every((it) => it.unitId === null && it.orderConfirmed === false), 'unitId null + orderConfirmed false on every item')
ok(new Set(ITEMS.map((i) => i.id)).size === 24, 'unique ids')
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
for (const [k, v] of Object.entries(b)) ok(v, `bubble ${k} (24 items x 20 seeds)`)
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
for (const [k, v] of Object.entries(t)) ok(v, `train ${k} (24 items x 20 seeds)`)
const egg = ITEMS.find((i) => i.word === 'egg'), sock = ITEMS.find((i) => i.word === 'sock'), shirt = ITEMS.find((i) => i.word === 'shirt')
ok(G.trainRound(egg, 1).tiles.some((x) => x.grapheme === 'gg') && G.trainRound(sock, 1).tiles.some((x) => x.grapheme === 'ck'), 'egg gg / sock ck stay single tiles')
ok(G.trainRound(shirt, 2).tiles.some((x) => x.grapheme === 'sh') && G.trainRound(shirt, 2).tiles.some((x) => x.grapheme === 'ir'), 'shirt keeps sh / ir as single tiles')

// ---- attempt record
const a = G.phonicsAttempt({ studentId: 'uuid-1', gameId: 'bubble', targetPhonemes: ['b'], itemId: 'pics2/bag', correct: true, retries: 0, completed: true })
ok(Object.isFrozen(a) && Object.keys(a).sort().join() === 'bookId,completed,correct,gameId,itemId,retries,step,studentId,targetPhonemes,unitId,v' && a.v === 1 && a.unitId === null && a.bookId === null && a.step === null && a.studentId === 'uuid-1', 'phonicsAttempt field set')
ok(G.sessionItems(5).length === 6 && new Set(G.sessionItems(5).map((i) => i.id)).size === 6 && JSON.stringify(G.sessionItems(5)) === JSON.stringify(G.sessionItems(5)) && G.sessionItems(5, 3).length === 3, 'sessionItems seeded, unique, count')

// ---- source pins
const dirs = ['src/components/phonics', 'src/utils/phonics', 'src/data/phonics']
const files = dirs.flatMap((d) => (fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)).map((f) => `${d}/${f}`) : []))
ok(files.length >= 2, `phonics sources found (${files.length})`)
const stripC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
for (const f of files) {
  const src = stripC(read(f))
  ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|supabase|\/api\/|localStorage|sessionStorage/.test(src), `${f} has no network/storage`)
  if (!/(curriculum|PaulPhonics|UnitHub|PhonemeListen)/.test(f)) ok(!/['"`>][^'"`<\n]*(Unit|단원|단계)/.test(src), `${f} has no Unit/단원/단계 label strings`)
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


// ---- PAUL PHONICS curriculum (254차)
const TITLES = ['Short Vowels|단모음', 'Single Consonants|단자음', 'Long Vowels|장모음', 'Consonant Teams|이중자음', 'Vowel Teams|이중모음']
ok(C.BOOKS.length === 5 && C.BOOKS.map((x) => `${x.titleEn}|${x.titleKo}`).join() === TITLES.join() && C.BOOKS.map((x) => x.id).join() === 'b1,b2,b3,b4,b5', '5 books with the exact titles')
ok(C.BOOKS.every((x) => x.units.every((u) => u.status === 'draft')), 'every unit is a draft')
ok(C.BOOKS.every((x) => C.unitsOf(x.id, { includeDraft: false }).length === 0 && C.unitsOf(x.id, { includeDraft: true }).length === x.units.length && C.unitsOf(x.id).length === 0), 'unitsOf without drafts is empty for every book')
ok(C.STATUS_LABEL_KO.draft === '임시' && C.STATUS_LABEL_KO.approved === '승인', 'status labels')
ok(C.BOOKS.map((x) => x.units.length).join() === '5,4,4,6,5' && C.BOOKS.every((x) => x.units.every((u) => u.targets.length > 0 && u.targets.every((tg) => tg.pair === `${tg.grapheme}|${tg.ipa}`))), 'unit counts + target pair shape')
ok(C.BOOKS.find((x) => x.id === 'b4').units.every((u) => u.targets.every((tg) => tg.kind === 'digraph')) && /cluster/.test(C.BOOKS[3].notes.join()), 'Book 4 targets are digraphs + cluster note')
ok(C.BOOKS[0].focus === 'vowel-recognition' && C.BOOKS[2].units[3].note === 'u_e는 /uː/로도 읽힙니다' && C.BOOKS[4].units[1].note === 'ea는 /e/로도 읽힙니다', 'Book 1 focus + two-sound notes')

const EXPECT = {
  b1: { u1: 'bag,jam', u2: 'pen,desk,egg,dress', u3: 'milk,ink', u4: 'sock', u5: 'cup' },
  b2: { u1: 'bag', u2: 'jam,milk', u3: 'pen,cup,desk', u4: '' },
  b3: { u1: 'cake,tape', u2: 'kite,slide', u3: '', u4: '' },
  b4: { u1: '', u2: '', u3: '', u4: '', u5: 'sock', u6: '' },
  b5: { u1: 'train', u2: 'sweet,peach', u3: 'boat', u4: '', u5: 'soup' },
}
const sorted = (arr) => arr.slice().sort().join()
for (const [bk, units] of Object.entries(EXPECT)) for (const [u, ws] of Object.entries(units)) {
  ok(sorted(U.unitWords(bk, u).map((w) => w.word)) === sorted(ws.split(',').filter(Boolean)), `${bk}/${u} words = [${ws}] (got ${U.unitWords(bk, u).map((w) => w.word)})`)
}
ok(U.unitWords('b1', 'review').length === 10 && U.unitWords('b2', 'review').length === 6 && U.unitWords('b3', 'review').length === 4 && U.unitWords('b5', 'review').length === 5, 'review node word counts')
ok(U.unitWords('zz', 'u1').length === 0 && U.unitContext('b1', 'zz') === null, 'unknown node')
ok(U.learnedPairs('b2', 'u1').length === 10 && U.learnedPairs('b1', 'u1').join() === 'a|æ' && U.learnedPairs('b1', 'review').length === 5, 'learnedPairs counts')
ok(!U.unitWords('b2', 'review').some((w) => ['rice', 'ink', 'dress', 'egg', 'cheese'].includes(w.word)) && !['b2', 'b3', 'b4', 'b5'].some((bk) => U.unitWords(bk, 'review').some((w) => w.graphemes.some((g) => ['ir', 'ar', 'air', 'oo', 'ss', 'gg', 'se'].includes(g)))), 'no r-controlled / ss / gg / se word in Books 2-5')

// "no unlearned sound" guarantee: every option, tile and word pair of Books 2-5 is within learnedPairs, for every seed
const nodes = (bks) => bks.flatMap((bk) => [...C.BOOKS.find((x) => x.id === bk).units.map((u) => u.id), 'review'].map((u) => [bk, u]))
const g = { opt: true, tile: true, word: true, tgt: true, posn: true, any: 0 }
for (const [bk, u] of nodes(['b2', 'b3', 'b4', 'b5'])) {
  const ctx = U.unitContext(bk, u)
  const lg = new Set(ctx.learned.map((p) => p.split('|')[0]))
  for (const w of ctx.words) {
    if (!w.graphemes.every((_, i) => ctx.learned.includes(U.pairOf(w, i)))) g.word = false
    for (let seed = 0; seed < 20; seed++) {
      g.any++
      const r = G.bubbleRound(w, seed, undefined, { targetIndex: w.targetIndex, optionPairs: ctx.optionPairs })
      if (!r) { g.opt = false; continue }
      if (!r.options.every((o) => lg.has(o)) || !r.options.includes(w.graphemes[w.targetIndex]) || new Set(r.options).size !== r.options.length) g.opt = false
      if (r.target.grapheme !== w.graphemes[w.targetIndex] || r.target.ipa !== w.phonemes[w.targetIndex]) g.tgt = false
      if (r.target.position !== (w.targetIndex === 0 ? 'initial' : w.targetIndex === w.graphemes.length - 1 ? 'final' : 'medial')) g.posn = false
      const tr = G.trainRound(w, seed, { learned: ctx.learned })
      if (!tr.tiles.every((x) => lg.has(x.grapheme)) || tr.tiles.length > w.graphemes.length + 1) g.tile = false
    }
  }
}
ok(g.any > 0, `learned-pair sweep ran (${g.any} rounds)`)
for (const [k, v] of Object.entries(g)) if (k !== 'any') ok(v, `no unlearned sound: ${k} (Books 2-5, all units + review, seeds 0..19)`)

// Book 1: bubble options are only the five short vowels and the correct one is the word's vowel
const v1 = { opt: true, right: true, four: true }
for (const [bk, u] of nodes(['b1'])) {
  const ctx = U.unitContext(bk, u)
  for (const w of ctx.words) for (let seed = 0; seed < 20; seed++) {
    const r = G.bubbleRound(w, seed, undefined, { targetIndex: w.targetIndex, optionPairs: ctx.optionPairs })
    if (!r.options.every((o) => 'aeiou'.includes(o))) v1.opt = false
    if (!r.options.includes(w.graphemes[w.targetIndex]) || !'aeiou'.includes(w.graphemes[w.targetIndex]) || r.target.ipa !== w.phonemes[w.targetIndex]) v1.right = false
    if (r.options.length !== 4) v1.four = false
  }
}
for (const [k, v] of Object.entries(v1)) ok(v, `Book 1 bubble ${k}`)
ok(U.unitContext('b1', 'u2').trainOffered === false && U.unitContext('b2', 'u1').trainOffered === true, 'Word Train not offered in Book 1')

// default (no opts) behaviour is the old behaviour; fewer distractors are tolerated, none = not eligible
ok(JSON.stringify(G.bubbleRound(ITEMS[0], 4)) === JSON.stringify(G.bubbleRound(ITEMS[0], 4, ITEMS, {})) && G.bubbleRound(ITEMS[0], 4).target.position === 'initial', 'bubbleRound default unchanged')
ok(G.bubbleRound(ITEMS[0], 1, undefined, { optionPairs: ['b|b', 'c|k'] }).options.length === 2 && G.bubbleRound(ITEMS[0], 1, undefined, { optionPairs: ['b|b'] }) === null, 'bubbleRound uses as many distractors as exist; 0 = null')
ok(G.trainRound(ITEMS[0], 1, { learned: ['b|b', 'a|æ', 'g|ɡ'] }).tiles.length === 3, 'trainRound: no unlearned distractor available -> no distractor tile')
const cake = ITEMS.find((i) => i.word === 'cake')
ok(G.trainRound(cake, 2, { learned: U.learnedPairs('b3', 'u1') }).tiles.some((x) => x.grapheme === 'a_e'), 'a_e stays ONE tile')

// ---- phoneme clips: nothing approved today, nothing falls back to TTS
const allPairs = C.BOOKS.flatMap((x) => x.units.flatMap((u) => u.targets.map((tg) => tg.pair)))
ok(Object.keys(K.PHONEME_CLIPS).length === 0 && allPairs.every((p) => K.phonemeClip(p) === null), 'phonemeClip is null for every pair today')
const fx = { 'a|æ': { src: 'x.mp3', status: 'teacher-approved', approvedBy: 't', approvedOn: '2026-01-01' }, 'e|e': { src: 'y.mp3', status: 'draft' } }
ok(K.phonemeClip('a|æ', fx) === fx['a|æ'] && K.phonemeClip('e|e', fx) === null && K.phonemeClip('i|ɪ', fx) === null, 'phonemeClip: approved fixture returns entry, others null')

// ---- attempts / summaries / missed items
const rec = (o) => G.phonicsAttempt({ studentId: 'u', gameId: 'bubble', bookId: 'b1', unitId: 'u2', step: 'bubble', targetPhonemes: ['e'], itemId: 'pics2/pen', correct: true, retries: 0, completed: true, ...o })
const rs = [rec({ correct: false, retries: 2 }), rec({ itemId: 'pics2/desk' }), rec({ step: 'review', correct: true }), rec({ targetPhonemes: ['ɪ'], itemId: 'pics2/ink', correct: false, retries: 1 }), rec({ targetPhonemes: ['ɪ'], itemId: 'pics2/ink', step: 'review', correct: false, retries: 1 })]
const sm = G.summarisePhonemes(rs)
ok(sm.e.attempts === 3 && sm.e.wrong === 1 && sm.e.retries === 2 && sm.e.improvedAfterReview === true, `summarisePhonemes e ${JSON.stringify(sm.e)}`)
ok(sm['ɪ'].attempts === 2 && sm['ɪ'].wrong === 2 && sm['ɪ'].improvedAfterReview === false, 'summarisePhonemes: a still-wrong review is not an improvement')
ok(G.summarisePhonemes([rec({ step: 'review', correct: true })]).e.improvedAfterReview === false && Object.keys(G.summarisePhonemes([])).length === 0, 'review right without an earlier miss is not an improvement')
ok(U.missedItems(rs, 'b1', 'u2').join() === 'pics2/ink' && U.missedItems(rs, 'b1', 'u3').length === 0 && U.missedItems([], 'b1', 'u2').length === 0, 'missedItems: a later right review clears the item')

// ---- source pins (254차)
const srcFiles = fs.readdirSync(path.join(ROOT, 'src'), { recursive: true }).filter((f) => /\.(jsx?|css)$/.test(f))

ok(srcFiles.length > 100 && !srcFiles.some((f) => /Phonics Adventure/.test(read(path.join('src', f)))), `the name "Phonics Adventure" appears nowhere in src/ (${srcFiles.length} files)`)
ok(!/playEn|playWordAudio|speak/.test(stripC(read('src/components/phonics/PhonemeListen.jsx'))), 'PhonemeListen never calls TTS')
ok(['PaulPhonics', 'UnitHub', 'PhonemeListen', 'PhonicsAdventure', 'SoundBubblePop', 'WordTrain'].every((n) => fs.existsSync(path.join(ROOT, `src/components/phonics/${n}.jsx`))), 'phonics components present')
console.log(`${fail ? 'FAIL' : 'PASS'} ${n - fail}/${n} testPhonicsGames`)
process.exit(fail ? 1 : 0)
