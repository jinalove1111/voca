// PAUL PHONICS checks (253차 prototype, 254차 curriculum, 255차 43 draft units): data table, unit word lists, eligibility, bubble/train pure logic over every unit word x 20 seeds, recordings, source pins. Network 0.
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
const ALL_UNITS = C.BOOKS.flatMap((b) => b.units.map((u) => ({ b, u })))

// ---- the nine numbers of the lead-verified list
const slotsAll = ALL_UNITS.flatMap(({ u }) => u.words)
const imgOf = (it) => it.image
const nums = {
  units: ALL_UNITS.length,
  slots: slotsAll.length,
  withPic: slotsAll.filter((w) => D.itemOfSlot(w).image === 'ready').length,
  uniqueWords: ITEMS.length,
  uniqueNoPic: ITEMS.filter((i) => !i.picture).length,
  needImage: ITEMS.filter((i) => imgOf(i) === 'needed').length,
  noImageNeeded: ITEMS.filter((i) => imgOf(i) === 'not-needed').length,
}
let flags = 0
for (const { b, u } of ALL_UNITS) {
  if (b.focus === 'vowel-recognition') continue
  const learned = new Set(U.learnedPairs(b.id, u.id))
  for (const w of U.unitWords(b.id, u.id)) if (!w.graphemes.every((_, i) => learned.has(U.pairOf(w, i)))) { flags++; console.log('  unlearned pair in', b.id, u.id, w.word) }
}
nums.flags = flags
nums.recordings = K.RECORDING_LIST.length
const line = Object.entries(nums).map(([k, v]) => `${k} ${v}`).join(' ')
console.log(line)
ok(line === 'units 43 slots 230 withPic 50 uniqueWords 197 uniqueNoPic 165 needImage 94 noImageNeeded 71 flags 0 recordings 42', `the nine numbers: ${line}`)

// ---- word table
ok(ITEMS.every((it) => D.spell(it.graphemes) === it.word), 'spell(graphemes) === word for all 197 words')
ok(ITEMS.every((it) => it.graphemes.length === it.phonemes.length && it.graphemes.every(Boolean) && it.phonemes.every(Boolean) && it.phonemes.every((p) => p !== 'undefined')), 'graphemes.length === phonemes.length, no empty/undefined')
ok(new Set(ITEMS.map((i) => i.id)).size === 197 && new Set(ITEMS.map((i) => i.word)).size === 197, 'unique ids and words')
ok(ITEMS.every((it) => (it.picture ? it.id === it.picture.id && it.picture.en.toLowerCase() === it.word && it.asset === it.picture.asset && it.ko === it.picture.ko && it.image === 'ready' && LEARN.includes(it.picture) : it.id === `word:${it.word}` && it.ko === null && it.asset === null && it.image !== 'ready')), 'picture linkage: ready <=> a learnable picture with the same en; else word:<en>, ko/asset null')
ok(ITEMS.every((it) => (it.image === 'not-needed') === (!it.picture && D.NOIMG.has(it.word))), 'not-needed = in NOIMG and no picture')
ok(ALL_UNITS.every(({ u }) => u.words.every((w) => { const p = C.parseWord(w); const it = D.itemOfSlot(w); return it && it.graphemes.join() === p.graphemes.join() && it.phonemes.join() === p.phonemes.join() })), 'a word repeated in several units has the same segmentation everywhere')
ok(D.spell(['c', 'a_e', 'k']) === 'cake' && D.spell(['s', 'l', 'i_e', 'd']) === 'slide' && D.spell(['k', 'i_e', 't']) === 'kite' && D.spell(['t', 'r', 'ai', 'n']) === 'train' && D.spell(['p', 'r', 'u_e', 'n']) === 'prune', 'spell rows')
ok(['need', 'free'].length && ['cat', 'zoo', 'cube'].every((w) => D.itemOfWord(w)?.image === 'needed') && D.itemOfWord('this').image === 'not-needed' && D.itemOfWord('pen').image === 'ready', 'sample image states (cat, zoo, cube needed; this not-needed; pen ready)')

// ---- curriculum
const TITLES = ['Short Vowels|단모음', 'Single Consonants|단자음', 'Long Vowels|장모음', 'Consonant Teams|이중자음', 'Vowel Teams|모음 조합 및 확장 음가']
ok(C.BOOKS.length === 5 && C.BOOKS.map((x) => `${x.titleEn}|${x.titleKo}`).join() === TITLES.join() && C.BOOKS.map((x) => x.id).join() === 'b1,b2,b3,b4,b5', '5 books with the exact titles')
ok(C.BOOKS.map((x) => x.units.length).join() === '5,7,6,11,14', '43 units = 5/7/6/11/14')
ok(C.BOOKS.every((x) => x.units.every((u, i) => u.id === `u${i + 1}` && u.status === 'draft')), 'unit ids u1.. in order, every unit is a draft')
ok(C.BOOKS.every((x) => C.unitsOf(x.id, { includeDraft: false }).length === 0 && C.unitsOf(x.id, { includeDraft: true }).length === x.units.length && C.unitsOf(x.id).length === 0), 'unitsOf without drafts is empty for every book')
ok(C.STATUS_LABEL_KO.draft === '임시' && C.STATUS_LABEL_KO.approved === '승인', 'status labels')
ok(ALL_UNITS.every(({ u }) => u.difficulty >= 1 && u.difficulty <= 3 && /^[BTHL]+$/.test(u.games) && u.words.length >= 5), 'difficulty 1-3, games letters, >= 5 words')
ok(ALL_UNITS.every(({ u }) => u.targets.every((tg) => tg.pair === `${tg.grapheme}|${tg.ipa}`)), 'target pair shape')
ok(C.BOOKS[0].focus === 'vowel-recognition' && C.BOOKS[0].units.map((u) => u.difficulty).join() === '2,2,2,2,3' && C.BOOKS[0].units.every((u) => u.games === 'B'), 'Book 1: vowel recognition, bubble only')
ok(C.BOOKS[3].units.slice(0, 7).every((u) => u.kind === 'digraph') && C.BOOKS[3].units.slice(7).every((u) => u.kind === 'cluster' && u.targets.length === 0 && u.games === 'THL' && u.labels.length >= 5), 'Book 4: units 1-7 digraphs, 8-11 clusters (no target, THL, labels only)')
ok(C.BOOKS[3].groups.length === 2 && C.BOOKS[3].groups[0].unitIds.length === 7 && C.BOOKS[3].groups[1].unitIds.join() === 'u8,u9,u10,u11', 'Book 4 groups A/B')
const bk = (b, u) => C.BOOKS.find((x) => x.id === b).units.find((x) => x.id === u)
ok(bk('b2', 'u6').kind === 'doubles' && bk('b2', 'u6').aux.join() === 'ck|k' && bk('b2', 'u6').games === 'THL' && bk('b2', 'u7').games === 'THL' && bk('b5', 'u12').games === 'HL' && bk('b5', 'u14').games === 'THL' && bk('b3', 'u6').games === 'B' && bk('b3', 'u6').kind === 'contrast' && bk('b5', 'u14').kind === 'contrast', 'special units: doubles/qu-x/er-ending/contrast games')
ok(bk('b5', 'u7').targets.map((x) => x.pair).join() === 'oo|uː,ou|uː' && bk('b5', 'u8').targets.map((x) => x.pair).join() === 'oo|ʊ' && bk('b5', 'u2').note === 'cheese는 se가 /z/라 예외 단어', 'Book 5 u7/u8 are separate oo units + cheese note')
ok(bk('b4', 'u1').targets[0].pair === 'ck|k' && !U.learnedPairs('b2', 'u5').includes('ck|k') && U.learnedPairs('b2', 'u6').includes('ck|k') && !bk('b2', 'u6').targets.some((x) => x.grapheme === 'ck'), 'ck: auxiliary preview in b2u6, formal target of b4u1')
ok(C.prereqKo('b1', 'u1') === '없음' && C.prereqKo('b1', 'u3') === 'Book 1 Unit 1–2' && C.prereqKo('b2', 'u1') === 'Book 1 전체' && C.prereqKo('b2', 'u4') === 'Book 1 전체 + Book 2 Unit 1–3' && C.prereqKo('b2', 'u2') === 'Book 1 전체 + Book 2 Unit 1' && C.prereqKo('b5', 'u3') === 'Book 1–4 전체 + Book 5 Unit 1–2', 'prereqKo')
ok(C.objectiveKo(C.BOOKS[2], bk('b3', 'u1')) === 'silent-e로 장모음 읽기' && C.objectiveKo(C.BOOKS[4], bk('b5', 'u1')) === '같은 소리의 다른 철자 익히기' && C.objectiveKo(C.BOOKS[2], bk('b3', 'u6')) === '소리 구별 복습', 'objectives by book/kind')
ok(U.reusedIpas('b5', 'u3').join() === 'əʊ' && U.reusedIpas('b3', 'u1').length === 0 && U.reusedIpas('b5', 'u6').join() === 'aɪ', 'reused sounds flagged (Book 3 sounds reappearing in Book 5)')

// ---- unit word lists and eligibility
ok(U.unitWords('b2', 'u1').map((w) => w.word).join() === 'mat,sat,tap,pot,sip' && U.unitWords('b2', 'u6').map((w) => w.word).join() === 'egg,dress,bell,hill,miss,sock,duck' && U.unitWords('b5', 'u14').length === 8, 'unit word lists follow the unit list')
ok(U.unitWords('zz', 'u1').length === 0 && U.unitContext('b1', 'zz') === null, 'unknown node')
ok(U.learnedPairs('b2', 'u1').length === 9 && U.learnedPairs('b1', 'u1').join() === 'a|æ' && U.learnedPairs('b1', 'review').length === 5, 'learnedPairs counts')
ok(U.unitWords('b2', 'u6').some((w) => w.word === 'sock') && U.learnedPairs('b2', 'u6').includes('ck|k'), 'sock is eligible in b2u6 through the ck auxiliary')
for (const { b, u } of ALL_UNITS) {
  if (b.focus === 'vowel-recognition') continue
  const learned = new Set(U.learnedPairs(b.id, u.id))
  ok(U.unitWords(b.id, u.id).every((w) => w.graphemes.every((_, i) => learned.has(U.pairOf(w, i)))), `${b.id}${u.id}: every word decodable from learnedPairs`)
}
{
  const rv = U.unitWords('b4', 'review')
  ok(new Set(rv.map((w) => w.id)).size === rv.length && rv.length > 40, `review node dedupes (b4 ${rv.length})`)
}

// ---- Sound Bubble Pop: games / offering
const isBubbleUnit = (u) => u.games.includes('B')
const wordsOf = (b, u) => U.unitWords(b.id, u.id)
for (const { b, u } of ALL_UNITS) {
  const ws = wordsOf(b, u)
  ok(ws.every((w) => w.games === u.games), `${b.id}${u.id} words carry the unit games`)
  if (!isBubbleUnit(u)) ok(ws.every((w) => !U.hasGame(w, 'B')), `${b.id}${u.id} not bubble-offered`)
  if (b.id === 'b1') ok(ws.every((w) => w.games === 'B'), `${b.id}${u.id} Book 1 bubble only`)
}
ok(['b2u6', 'b2u7', 'b4u8', 'b4u9', 'b4u10', 'b4u11', 'b5u12', 'b5u14'].every((k) => !isBubbleUnit(bk(k.slice(0, 2), k.slice(2)))), 'cluster / doubles / qu-x / er-ending / b5u14 are not bubble-offered')
{
  const rb = U.unitWords('b2', 'review')
  ok(rb.find((w) => w.word === 'egg').games.includes('B') === false || rb.find((w) => w.word === 'egg').games.includes('T'), 'review node merges games')
}

const sweep = { opt: true, tile: true, tgt: true, posn: true, det: true, four: true, flow: true, lock: true, any: 0 }
for (const { b, u } of ALL_UNITS) {
  const ctx = U.unitContext(b.id, u.id)
  const lg = new Set(ctx.learned.map((p) => p.split('|')[0]))
  for (const w of ctx.words) {
    for (let seed = 0; seed < 20; seed++) {
      if (U.hasGame(w, 'B')) {
        sweep.any++
        const opts = { targetIndex: w.targetIndex, optionPairs: w.optionPairs || ctx.optionPairs }
        const r = G.bubbleRound(w, seed, undefined, opts)
        if (!r) { sweep.opt = false; continue }
        if (JSON.stringify(r) !== JSON.stringify(G.bubbleRound(w, seed, undefined, opts))) sweep.det = false
        if ((b.id !== 'b1' && !r.options.every((o) => lg.has(o))) || !r.options.includes(w.graphemes[w.targetIndex]) || new Set(r.options).size !== r.options.length) sweep.opt = false
        if (w.optionPairs ? r.options.length !== 2 : r.options.length !== 4) sweep.four = false
        if (w.optionPairs && r.options.slice().sort().join() !== w.optionPairs.map((p) => p.split('|')[0]).sort().join()) sweep.opt = false
        if (r.target.grapheme !== w.graphemes[w.targetIndex] || r.target.ipa !== w.phonemes[w.targetIndex]) sweep.tgt = false
        if (r.target.position !== (w.targetIndex === 0 ? 'initial' : w.targetIndex === w.graphemes.length - 1 ? 'final' : 'medial')) sweep.posn = false
        if (b.id === 'b1' && !r.options.every((o) => 'aeiou'.includes(o))) sweep.opt = false
        const ri = r.options.indexOf(w.graphemes[w.targetIndex])
        const wi = r.options.findIndex((o) => o !== w.graphemes[w.targetIndex])
        let s = G.bubblePick(G.bubbleStart(r), wi)
        if (s.wrong !== 1 || s.last !== 'wrong' || s.done) sweep.flow = false
        if (G.bubblePick(s, wi) !== s) sweep.lock = false
        s = G.bubblePick(s, ri)
        if (!s.done || s.last !== 'right' || s.wrong !== 1) sweep.flow = false
      }
      if (U.hasGame(w, 'T')) {
        const tr = G.trainRound(w, seed, { learned: ctx.learned })
        if (!tr.tiles.every((x) => lg.has(x.grapheme)) || tr.tiles.length > w.graphemes.length + 1) sweep.tile = false
        if (u.kind === 'cluster' && tr.tiles.some((x) => (u.labels || []).includes(x.grapheme))) sweep.tile = false // clusters stay separate single-letter tiles
      }
    }
  }
}
ok(sweep.any > 1000, `bubble sweep ran (${sweep.any} rounds)`)
for (const [k, v] of Object.entries(sweep)) if (k !== 'any') ok(v, `unit sweep ${k} (43 units, seeds 0..19)`)

// picture-less items produce valid rounds
{
  const noPic = ITEMS.filter((i) => i.image !== 'ready')
  ok(noPic.length === 165 && noPic.every((i) => !i.asset && i.ko === null), 'picture-less items carry no asset/ko')
  const v = { bub: true, train: true }
  for (const w of noPic) for (let seed = 0; seed < 5; seed++) {
    const r = G.bubbleRound(w, seed)
    if (!r || r.options.length < 2 || !r.options.includes(w.graphemes[0])) v.bub = false
    const tr = G.trainRound(w, seed)
    if (tr.tiles.length < w.graphemes.length || tr.target.graphemes.join() !== w.graphemes.join()) v.train = false
    let s = G.trainStart(tr)
    for (const g of w.graphemes) s = G.trainTap(s, tr.tiles.find((x) => x.grapheme === g && !s.usedTileIds.includes(x.id)).id)
    if (!s.done) v.train = false
  }
  ok(v.bub, 'bubble rounds valid for all 165 picture-less words')
  ok(v.train, 'train rounds solvable for all 165 picture-less words')
}

// H / L / practice / test lists contain only image-ready items
for (const { b, u } of [...ALL_UNITS, ...C.BOOKS.map((x) => ({ b: x, u: { id: 'review' } }))]) {
  const r = U.readyWords(U.unitWords(b.id, u.id))
  ok(r.every((w) => w.image === 'ready' && w.picture && w.asset), `${b.id}${u.id} ready list is picture words only`)
}
ok(U.readyWords(U.unitWords('b2', 'u1')).length === 0 && U.readyWords(U.unitWords('b1', 'u2')).length === 3 && U.readyWords(U.unitWords('b2', 'u6')).length === 3, 'ready counts (b2u1 0, b1u2 3, b2u6 3)')
ok(C.BOOKS.every((x) => U.readyWords(U.unitWords(x.id, 'review')).length >= 4), 'every book review node has >= 4 pictures for the Unit Test')

// contrast unit options
{
  const ws = U.unitWords('b3', 'u6')
  ok(ws.length === 10 && ws.every((w) => w.optionPairs && w.optionPairs.length === 2 && /^[aeiou]/.test(w.graphemes[w.targetIndex])), 'b3u6: bubble target is the vowel, 2 contrasted spellings')
  ok(G.bubbleRound(ws.find((w) => w.word === 'cube'), 1, undefined, { targetIndex: 1, optionPairs: ws.find((w) => w.word === 'cube').optionPairs }).options.slice().sort().join() === 'u,u_e', 'cube vs cub options u / u_e')
}

// ---- default bubble/train behaviour (no opts) over every word
const b = { four: true, uniq: true, target: true, det: true, flow: true }
for (const it of ITEMS) for (let seed = 1; seed <= 20; seed++) {
  const r = G.bubbleRound(it, seed)
  if (JSON.stringify(r) !== JSON.stringify(G.bubbleRound(it, seed))) b.det = false
  if (r.options.length !== 4) b.four = false
  if (new Set(r.options).size !== 4) b.uniq = false
  if (r.options.filter((o) => o === it.graphemes[0]).length !== 1 || r.target.grapheme !== it.graphemes[0] || r.target.ipa !== it.phonemes[0] || r.itemId !== it.id) b.target = false
  const ri = r.options.indexOf(it.graphemes[0]), wi = r.options.findIndex((o) => o !== it.graphemes[0])
  let s = G.bubblePick(G.bubbleStart(r), wi)
  s = G.bubblePick(s, ri)
  if (!s.done || s.wrong !== 1) b.flow = false
}
for (const [k, v] of Object.entries(b)) ok(v, `bubble default ${k} (197 words x 20 seeds)`)
const t = { tiles: true, pre: true, det: true, solve: true, wrong: true }
for (const it of ITEMS) for (let seed = 1; seed <= 20; seed++) {
  const r = G.trainRound(it, seed)
  if (JSON.stringify(r) !== JSON.stringify(G.trainRound(it, seed))) t.det = false
  const extra = r.tiles.filter((x) => !it.graphemes.includes(x.grapheme))
  const real = r.tiles.filter((x) => x.id.startsWith('t'))
  if (r.tiles.length !== it.graphemes.length + 1 || extra.length !== 1) t.tiles = false
  if (real.map((x) => x.grapheme).join() === it.graphemes.join()) t.pre = false
  for (const last of [false, true]) {
    let s = G.trainStart(r)
    for (const g of it.graphemes) {
      const c = r.tiles.filter((x) => x.grapheme === g && !s.usedTileIds.includes(x.id))
      s = G.trainTap(s, (last ? c[c.length - 1] : c[0]).id)
    }
    if (!s.done || s.wrong !== 0) t.solve = false
  }
  const bad = r.tiles.find((x) => x.grapheme !== it.graphemes[0])
  const w = G.trainTap(G.trainStart(r), bad.id)
  if (w.wrong !== 1 || w.placed !== 0 || w.done) t.wrong = false
}
for (const [k, v] of Object.entries(t)) ok(v, `train default ${k} (197 words x 20 seeds)`)
const egg = D.itemOfWord('egg'), sock = D.itemOfWord('sock'), shirt = D.itemOfWord('shirt')
ok(G.trainRound(egg, 1).tiles.some((x) => x.grapheme === 'gg') && G.trainRound(sock, 1).tiles.some((x) => x.grapheme === 'ck'), 'egg gg / sock ck stay single tiles')
ok(G.trainRound(shirt, 2).tiles.some((x) => x.grapheme === 'sh') && G.trainRound(shirt, 2).tiles.some((x) => x.grapheme === 'ir'), 'shirt keeps sh / ir as single tiles')
ok(G.bubbleRound(egg, 1, undefined, { optionPairs: ['e|e', 'a|æ'] }).options.length === 2 && G.bubbleRound(egg, 1, undefined, { optionPairs: ['e|e'] }) === null, 'bubbleRound uses as many distractors as exist; 0 = null')
ok(G.trainRound(D.itemOfWord('bag'), 1, { learned: ['b|b', 'a|æ', 'g|ɡ'] }).tiles.length === 3, 'trainRound: no unlearned distractor available -> no distractor tile')
ok(G.trainRound(D.itemOfWord('cake'), 2, { learned: U.learnedPairs('b3', 'u1') }).tiles.some((x) => x.grapheme === 'a_e'), 'a_e stays ONE tile')

// ---- attempt record
const a = G.phonicsAttempt({ studentId: 'uuid-1', gameId: 'bubble', targetPhonemes: ['b'], itemId: 'pics2/bag', correct: true, retries: 0, completed: true })
ok(Object.isFrozen(a) && Object.keys(a).sort().join() === 'bookId,completed,correct,gameId,itemId,retries,step,studentId,targetPhonemes,unitId,v' && a.v === 1 && a.unitId === null && a.bookId === null && a.step === null && a.studentId === 'uuid-1', 'phonicsAttempt field set')
ok(G.sessionItems(5).length === 6 && new Set(G.sessionItems(5).map((i) => i.id)).size === 6 && JSON.stringify(G.sessionItems(5)) === JSON.stringify(G.sessionItems(5)) && G.sessionItems(5, 3).length === 3, 'sessionItems seeded, unique, count')

// ---- recordings: 42 phonemes, none exist, nothing falls back to TTS
const need = new Set(ALL_UNITS.flatMap(({ u }) => C.recordableTargets(u).map((x) => x.ipa)))
ok(K.RECORDING_LIST.length === 42 && new Set(K.RECORDING_LIST.map((r) => r.ipa)).size === 42, 'RECORDING_LIST has 42 distinct phonemes')
ok(need.size === 42 && K.RECORDING_LIST.every((r) => need.has(r.ipa)), 'the recordable unit targets are exactly the 42 listed phonemes')
ok(K.RECORDING_LIST.every((r) => { const it = D.itemOfWord(r.example); return it && it.graphemes.includes(r.grapheme) && it.phonemes.includes(r.ipa) }), 'every recording example word contains the representative grapheme with that phoneme')
ok(K.RECORDING_LIST.every((r) => !['kw', 'ks', 'ŋk'].includes(r.ipa)) && Object.keys(K.PHONEME_CLIPS).length === 0 && K.RECORDING_LIST.every((r) => K.recordingStatus(r.ipa) === 'pending' && K.phonemeClip(r.ipa) === null), 'all 42 pending today, phonemeClip null')
const fx = { 'æ': { src: 'x.mp3', status: 'teacher-approved', approvedBy: 't', approvedOn: '2026-01-01' }, e: { src: 'y.mp3', status: 'draft' } }
ok(K.phonemeClip('æ', fx) === fx['æ'] && K.phonemeClip('e', fx) === null && K.phonemeClip('ɪ', fx) === null && K.recordingStatus('æ', fx) === 'approved' && K.recordingStatus('e', fx) === 'pending', 'phonemeClip by ipa: approved fixture returns entry, others null')
ok(C.recordableTargets(bk('b2', 'u6')).length === 0 && C.recordableTargets(bk('b2', 'u7')).length === 0 && C.recordableTargets(bk('b4', 'u8')).length === 0 && C.recordableTargets(bk('b4', 'u7')).map((x) => x.ipa).join() === 'ŋ', 'doubles / qu-x / clusters need no recording; nk none')

// ---- attempts / summaries / missed items
const rec = (o) => G.phonicsAttempt({ studentId: 'u', gameId: 'bubble', bookId: 'b1', unitId: 'u2', step: 'bubble', targetPhonemes: ['e'], itemId: 'pics2/pen', correct: true, retries: 0, completed: true, ...o })
const rs = [rec({ correct: false, retries: 2 }), rec({ itemId: 'pics2/desk' }), rec({ step: 'review', correct: true }), rec({ targetPhonemes: ['ɪ'], itemId: 'pics2/ink', correct: false, retries: 1 }), rec({ targetPhonemes: ['ɪ'], itemId: 'pics2/ink', step: 'review', correct: false, retries: 1 })]
const sm = G.summarisePhonemes(rs)
ok(sm.e.attempts === 3 && sm.e.wrong === 1 && sm.e.retries === 2 && sm.e.improvedAfterReview === true, `summarisePhonemes e ${JSON.stringify(sm.e)}`)
ok(sm['ɪ'].attempts === 2 && sm['ɪ'].wrong === 2 && sm['ɪ'].improvedAfterReview === false, 'summarisePhonemes: a still-wrong review is not an improvement')
ok(G.summarisePhonemes([rec({ step: 'review', correct: true })]).e.improvedAfterReview === false && Object.keys(G.summarisePhonemes([])).length === 0, 'review right without an earlier miss is not an improvement')
ok(U.missedItems(rs, 'b1', 'u2').join() === 'pics2/ink' && U.missedItems(rs, 'b1', 'u3').length === 0 && U.missedItems([], 'b1', 'u2').length === 0, 'missedItems: a later right review clears the item')

// ---- source pins
const dirs = ['src/components/phonics', 'src/utils/phonics', 'src/data/phonics']
const files = dirs.flatMap((d) => (fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)).map((f) => `${d}/${f}`) : []))
ok(files.length >= 2, `phonics sources found (${files.length})`)
const stripC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const NET = /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|supabase|\/api\/|localStorage|sessionStorage|indexedDB/
for (const f of files) {
  if (!fs.existsSync(path.join(ROOT, f))) { ok(false, `${f} missing`); continue }
  const src = stripC(read(f))
  ok(!NET.test(src), `${f} has no network/storage`)
  if (!/(curriculum|PaulPhonics|UnitHub|PhonemeListen|PhonicsReviewPanel)/.test(f)) ok(!/['"`>][^'"`<\n]*(Unit|단원|단계)/.test(src), `${f} has no Unit/단원/단계 label strings`)
  ok(!/grantReward|addPoints|awardStar/.test(src), `${f} has no rewards`)
}
// the speech helper is only called with the item's whole word
for (const f of files.filter((x) => x.endsWith('.jsx'))) {
  const src = stripC(read(f))
  const calls = [...src.matchAll(/(?:playEn|playWordAudio|speak\w*)\(([^)]*)\)/g)].map((m) => m[1].trim())
  ok(calls.every((c) => /(^|[^\w])item\.(word|en)$|^en$|^\w+\.word$/.test(c) || c === '' || c === 'item.word'), `${f} speech calls take only the whole word: ${calls.join(' | ')}`)
}
const comps = files.filter((f) => f.endsWith('.jsx'))
ok(comps.some((f) => /useReducedMotion/.test(read(f))), 'components have a reduced-motion branch')
ok(/prefers-reduced-motion/.test(read('src/components/pictureWords/pictureImg.jsx') + comps.map(read).join('')), 'reduced-motion CSS present')
const srcFiles = fs.readdirSync(path.join(ROOT, 'src'), { recursive: true }).filter((f) => /\.(jsx?|css)$/.test(f))
ok(srcFiles.length > 100 && !srcFiles.some((f) => /Phonics Adventure/.test(read(path.join('src', f)))), `the name "Phonics Adventure" appears nowhere in src/ (${srcFiles.length} files)`)
ok(!/playEn|playWordAudio|speak/.test(stripC(read('src/components/phonics/PhonemeListen.jsx'))), 'PhonemeListen never calls TTS')
ok(['PaulPhonics', 'UnitHub', 'PhonemeListen', 'PhonicsAdventure', 'SoundBubblePop', 'WordTrain'].every((nm) => fs.existsSync(path.join(ROOT, `src/components/phonics/${nm}.jsx`))), 'phonics components present')
console.log(`${fail ? 'FAIL' : 'PASS'} ${n - fail}/${n} testPhonicsGames`)
process.exit(fail ? 1 : 0)
