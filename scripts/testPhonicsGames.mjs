// PAUL PHONICS checks (253차 prototype, 254차 curriculum, 255차 43 draft units, 256차 quality pass): data table, unit word lists, eligibility, bubble/train pure logic over every unit word x 20 seeds, recordings, source pins. Network 0.
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
const R = await import('../src/data/phonics/recordings.js')
const P = await import('../src/utils/phonics/playPhonemes.js')
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
ok(line === 'units 43 slots 236 withPic 48 uniqueWords 210 uniqueNoPic 178 needImage 105 noImageNeeded 73 flags 0 recordings 42', `the nine numbers: ${line}`)

// ---- word table
ok(ITEMS.every((it) => D.spell(it.graphemes) === it.word), 'spell(graphemes) === word for all 210 words')
ok(ITEMS.every((it) => it.graphemes.length === it.phonemes.length && it.graphemes.every(Boolean) && it.phonemes.every(Boolean) && it.phonemes.every((p) => p !== 'undefined')), 'graphemes.length === phonemes.length, no empty/undefined')
ok(new Set(ITEMS.map((i) => i.id)).size === 210 && new Set(ITEMS.map((i) => i.word)).size === 210, 'unique ids and words')
ok(ITEMS.every((it) => (it.picture ? it.id === it.picture.id && it.picture.en.toLowerCase() === it.word && it.asset === it.picture.asset && it.ko === it.picture.ko && it.image === 'ready' && LEARN.includes(it.picture) : it.id === `word:${it.word}` && it.ko === (D.APPROVED_KO.has(it.word) ? D.PROPOSED_KO[it.word] : null) && it.asset === null && it.image !== 'ready')), 'picture linkage: ready <=> a learnable picture with the same en; else word:<en>, asset null, ko null unless the word is operator-approved (then exactly its proposal)')
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
ok(C.BOOKS[0].focus === 'vowel-recognition' && C.BOOKS[0].units.map((u) => u.difficulty).join() === '2,2,2,2,3' && C.BOOKS[0].units.every((u) => u.games === 'BT'), 'Book 1: vowel recognition, Sound Bubble Pop + vowel Word Train (259차)')
ok(C.BOOKS[3].units.slice(0, 7).every((u) => u.kind === 'digraph') && C.BOOKS[3].units.slice(7).every((u) => u.kind === 'cluster' && u.targets.length === 0 && u.games === 'THL' && u.labels.length >= 5), 'Book 4: units 1-7 digraphs, 8-11 clusters (no target, THL, labels only)')
ok(C.BOOKS[3].groups.length === 2 && C.BOOKS[3].groups[0].unitIds.length === 7 && C.BOOKS[3].groups[1].unitIds.join() === 'u8,u9,u10,u11', 'Book 4 groups A/B')
const bk = (b, u) => C.BOOKS.find((x) => x.id === b).units.find((x) => x.id === u)
ok(bk('b2', 'u6').kind === 'doubles' && bk('b2', 'u6').aux.join() === 'ck|k' && bk('b2', 'u6').games === 'THL' && bk('b2', 'u7').games === 'THL' && bk('b5', 'u12').games === 'THL' && bk('b5', 'u14').games === 'BTHL' && bk('b3', 'u6').games === 'B' && bk('b3', 'u6').kind === 'contrast' && bk('b5', 'u14').kind === undefined, 'special units: doubles/qu-x/er-ending/contrast games')
ok(bk('b5', 'u7').targets.map((x) => x.pair).join() === 'oo|uː,ou|uː' && bk('b5', 'u8').targets.map((x) => x.pair).join() === 'oo|ʊ' && bk('b5', 'u2').targets.map((x) => x.pair).join() === 'ee|iː,ea|iː' && bk('b5', 'u2').note.startsWith('e_e(these, Pete)'), 'Book 5 u7/u8 are separate oo units; u2 has no e_e target and says so')
ok(bk('b4', 'u1').targets[0].pair === 'ck|k' && !U.learnedPairs('b2', 'u5').includes('ck|k') && U.learnedPairs('b2', 'u6').includes('ck|k') && !bk('b2', 'u6').targets.some((x) => x.grapheme === 'ck'), 'ck: auxiliary preview in b2u6, formal target of b4u1')
ok(C.prereqKo('b1', 'u1') === '없음' && C.prereqKo('b1', 'u3') === 'Book 1 Unit 1–2' && C.prereqKo('b2', 'u1') === 'Book 1 전체' && C.prereqKo('b2', 'u4') === 'Book 1 전체 + Book 2 Unit 1–3' && C.prereqKo('b2', 'u2') === 'Book 1 전체 + Book 2 Unit 1' && C.prereqKo('b5', 'u3') === 'Book 1–4 전체 + Book 5 Unit 1–2', 'prereqKo')
ok(C.objectiveKo(C.BOOKS[2], bk('b3', 'u1')) === 'silent-e로 장모음 읽기' && C.objectiveKo(C.BOOKS[4], bk('b5', 'u1')) === '같은 소리의 다른 철자 익히기' && C.objectiveKo(C.BOOKS[2], bk('b3', 'u6')) === '소리 구별 복습', 'objectives by book/kind')
ok(U.reusedIpas('b5', 'u3').join() === 'əʊ' && U.reusedIpas('b3', 'u1').length === 0 && U.reusedIpas('b5', 'u6').join() === 'aɪ', 'reused sounds flagged (Book 3 sounds reappearing in Book 5)')

// ---- unit word lists and eligibility
ok(U.unitWords('b2', 'u1').map((w) => w.word).join() === 'mat,sat,tap,pot,sip' && U.unitWords('b2', 'u6').map((w) => w.word).join() === 'egg,dress,bell,hill,miss,off,buzz,sock,duck' && U.unitWords('b5', 'u14').map((w) => w.word).join() === 'bread,head,thread,spread,breath', 'unit word lists follow the unit list')
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
  ok(ws.every((w) => w.games === u.games || (u.games.replace('B', '') === w.games && w.targetIndex >= 0 && u.targets.find((x) => x.pair === U.pairOf(w, w.targetIndex)).twoSounds)), `${b.id}${u.id} words carry the unit games (two-sound words lose B)`)
  if (!isBubbleUnit(u)) ok(ws.every((w) => !U.hasGame(w, 'B')), `${b.id}${u.id} not bubble-offered`)
  if (b.id === 'b1') ok(ws.every((w) => w.games === 'BT'), `${b.id}${u.id} Book 1 bubble + vowel train`)
}
ok(['b2u6', 'b2u7', 'b4u8', 'b4u9', 'b4u10', 'b4u11', 'b5u12'].every((k) => !isBubbleUnit(bk(k.slice(0, 2), k.slice(2)))), 'cluster / doubles / qu-x / er-ending are not bubble-offered')
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
      if (U.hasGame(w, 'T') && b.id !== 'b1') { // Book 1 uses trainRoundVowel (checked below)
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
  ok(noPic.length === 178 && noPic.every((i) => !i.asset && i.ko === (D.APPROVED_KO.has(i.word) ? D.PROPOSED_KO[i.word] : null)) && noPic.filter((i) => i.ko !== null).length === 16, 'picture-less items carry no asset; ko only for the 16 operator-approved words (162 stay null)')
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
  ok(v.bub, 'bubble rounds valid for all 178 picture-less words')
  ok(v.train, 'train rounds solvable for all 178 picture-less words')
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
for (const [k, v] of Object.entries(b)) ok(v, `bubble default ${k} (210 words x 20 seeds)`)
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
for (const [k, v] of Object.entries(t)) ok(v, `train default ${k} (210 words x 20 seeds)`)
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

// ---- 256차: quality pass
// two-sound targets (qu, x, nk) are never a bubble target; b4u7 bubbles are the ng words only
{
  const twoSound = (u, w) => w.targetIndex >= 0 && u.targets.find((x) => x.pair === U.pairOf(w, w.targetIndex))?.twoSounds
  ok(ALL_UNITS.every(({ b, u }) => U.unitWords(b.id, u.id).every((w) => !(U.hasGame(w, 'B') && twoSound(u, w)))), 'no two-sound target (kw, ks, ŋk) is ever offered as a bubble word')
  ok(bk('b4', 'u7').targets.map((x) => `${x.grapheme}:${!!x.twoSounds}`).join() === 'ng:false,nk:true' && bk('b4', 'u7').kind === 'digraph' && bk('b2', 'u7').targets.every((x) => x.twoSounds), 'nk is twoSounds like qu/x; ng stays a digraph')
  ok(U.unitWords('b4', 'u7').filter((w) => U.hasGame(w, 'B')).map((w) => w.word).join() === 'ring,king,song,wing' && U.unitWords('b4', 'u7').filter((w) => U.hasGame(w, 'T')).length === 6, 'b4u7: bubble = ng words only, Word Train keeps all six')
  ok(U.bubbleSession('b4', 'u7', 1).every((w) => w.origin || !['ink', 'pink'].includes(w.word)), 'b4u7 bubble session never asks an nk word')
}
// multi-target units exercise every target that a word exists for
for (const { b, u } of ALL_UNITS) {
  if (u.targets.length < 2) continue
  const ws = U.unitWords(b.id, u.id)
  const hit = new Set(ws.filter((w) => w.targetIndex >= 0).map((w) => U.pairOf(w, w.targetIndex)))
  const possible = u.targets.filter((tg) => ws.some((w) => w.graphemes.some((_, i) => U.pairOf(w, i) === tg.pair)))
  ok(possible.every((tg) => hit.has(tg.pair)), `${b.id}${u.id}: every target with a word is exercised (${[...hit].join(' ')})`)
}
ok(U.unitWords('b2', 'u2').map((w) => `${w.word}:${w.graphemes[w.targetIndex]}`).join() === 'pen:n,cup:c,dog:d,can:c,dig:g,gum:g', 'b2u2 targets n c d c g g (g is exercised)')
// b5u14 is a real ea /e/ unit; the contrasts moved into the Book 5 review node
ok(bk('b5', 'u14').targets.map((x) => x.pair).join() === 'ea|e' && bk('b5', 'u14').difficulty === 3 && C.unitLabel(bk('b5', 'u14')) === 'ea (bread)' && U.unitWords('b5', 'u14').every((w) => w.games === 'BTHL') && C.BOOKS[4].units.every((u) => u.kind !== 'contrast'), 'b5u14: ea|e unit, BTHL, difficulty 3, no contrast unit in Book 5')
{
  const note = U.unitContext('b5', 'review').unit.note
  ok(['snow/cow', 'moon/book', 'sea/bread', 'cloud/soup'].every((t) => note.includes(t)), 'Book 5 review node carries the four same-spelling contrasts as a note')
}
// unit labels
for (const x of C.BOOKS) ok(new Set(x.units.map((u) => C.unitLabel(u))).size === x.units.length, `${x.id}: unit labels are unique in the book`)
ok(C.unitLabel(bk('b4', 'u4')) === 'th (thin)' && C.unitLabel(bk('b4', 'u5')) === 'th (this)' && C.unitLabel(bk('b3', 'u4')) === 'u_e (cube)' && C.unitLabel(bk('b3', 'u5')) === 'u_e (rule)' && C.unitLabel(bk('b5', 'u7')).startsWith('oo (moon)') && C.unitLabel(bk('b5', 'u8')) === 'oo (book)' && C.unitLabel(bk('b5', 'u3')).includes('ow (snow)') && C.unitLabel(bk('b5', 'u4')).includes('ow (cow)') && C.unitLabel(bk('b5', 'u4')).includes('ou (cloud)'), 'labelled units')
// dialect notes
ok(C.DIALECT_NOTES.some((t) => t.includes('tube') && t.includes('/tʃuː-/')) && C.DIALECT_NOTES.some((t) => t.includes('/ɛː/')) && C.DIALECT_NOTES.some((t) => t.includes('/wɪθ/는 북부·스코틀랜드·미국')) && C.DIALECT_NOTES.some((t) => t.includes('/tʃr/') && t.includes('/dʒr/')) && C.DIALECT_NOTES.some((t) => t.startsWith('o_e·oa·ow')), 'dialect notes: tube, air/ear, with, tr/dr, ow')
// word flags
ok(D.REVIEW_WORDS.size === 17 && [...D.REVIEW_WORDS].every((w) => D.itemOfWord(w)) && ITEMS.every((i) => i.needsReview === D.REVIEW_WORDS.has(i.word)) && ['mule', 'jumper', 'rubber', 'yum', 'head'].every((w) => D.itemOfWord(w).needsReview), 'REVIEW_WORDS (17) are unit words and flag their items')
ok(ITEMS.every((i) => (i.word === 'june' ? i.display === 'June' : i.display === i.word)), 'display: only June is capitalised')
// word difficulty (rule pinned from the definition)
{
  const wd = (w) => U.wordDifficulty(D.itemOfWord(w))
  const pins = { bag: 1, mat: 1, zoo: 2, egg: 2, sock: 2, cake: 2, slide: 2, black: 2, quick: 2, chair: 2, bread: 2, butter: 3, jumper: 3, spread: 3, truck: 2, winter: 3, grapes: 3 }
  ok(Object.entries(pins).every(([w, d]) => wd(w) === d) && ITEMS.every((i) => [1, 2, 3].includes(U.wordDifficulty(i))), `wordDifficulty pins: ${Object.keys(pins).filter((w) => wd(w) !== pins[w]).map((w) => `${w}=${wd(w)}`).join()}`)
}
// Book 1 picture test lock
ok(U.unitTestLock(C.BOOKS[0]) === 'Book 1은 소리 풍선으로 확인해요' && C.BOOKS.slice(1).every((x) => U.unitTestLock(x) === null), 'unit test is locked only for Book 1 (with the new text)')
// Sound Bubble Pop interleave
{
  const v = { ge2: true, own: true, cap: true, valid: true, det: true, uniq: true, origin: true, b1: true, first: true }
  let ran = 0
  for (const { b, u } of ALL_UNITS) {
    if (!u.games.includes('B')) { ok(U.bubbleSession(b.id, u.id, 1).length === 0, `${b.id}${u.id} without B has no bubble session`); continue }
    const ctx = U.unitContext(b.id, u.id)
    const own = ctx.words.filter((w) => U.hasGame(w, 'B'))
    const isFirst = b.id === 'b1' && u.id === 'u1'
    for (let seed = 0; seed < 20; seed++) {
      ran++
      const ses = U.bubbleSession(b.id, u.id, seed)
      const rev = ses.filter((w) => w.origin)
      const graphemes = new Set(ses.map((w) => w.graphemes[w.targetIndex]))
      if (!isFirst && graphemes.size < 2) v.ge2 = false
      const far = ses.filter((w) => w.detect && !own.some((x) => x.id === w.id))
      if (isFirst && (rev.length || far.length !== 3)) v.first = false // 259차: the first unit mixes in 3 detection items instead of earlier-unit review
      if (!own.every((w) => ses.some((x) => x.id === w.id)) || ses.length !== own.length + rev.length + far.length) v.own = false
      if (rev.length > 3 || (!isFirst && rev.length === 0)) v.cap = false
      if (JSON.stringify(ses.map((w) => w.id)) !== JSON.stringify(U.bubbleSession(b.id, u.id, seed).map((w) => w.id))) v.det = false
      if (new Set(ses.map((w) => w.id)).size !== ses.length) v.uniq = false
      for (const w of ses) {
        const r = G.bubbleRound(w, seed, undefined, { targetIndex: w.targetIndex, optionPairs: w.optionPairs || ctx.optionPairs, detect: w.detect, vowel: w.vowel })
        if (!r || !r.options.includes(r.target.grapheme)) v.valid = false
        if (b.id === 'b1' && r && !w.detect && !r.options.every((o) => 'aeiou'.includes(o))) v.b1 = false
        if (w.origin) {
          const ob = C.bookById(w.origin.bookId)
          const idx = ob.units.findIndex((x) => x.id === w.origin.unitId)
          const earlier = C.BOOKS.indexOf(ob) < C.BOOKS.indexOf(b) || (ob === b && idx < b.units.findIndex((x) => x.id === u.id))
          if (!earlier || (b.id === 'b1' && ob.id !== 'b1') || U.unitWords(w.origin.bookId, w.origin.unitId).every((x) => x.id !== w.id)) v.origin = false
        }
      }
    }
  }
  ok(ran > 700, `interleave sweep ran (${ran} sessions)`)
  for (const [k, val] of Object.entries(v)) ok(val, `bubbleSession ${k}`)
  ok(U.bubbleSession('b1', 'u1', 4).length === 8 && U.bubbleSession('b1', 'review', 1).length === 0 && U.bubbleSession('zz', 'u1', 1).length === 0, 'first unit of Book 1 has no review items; review node and unknown nodes have no session')
}
// Word Train tiles in a cluster unit: single-letter tiles
{
  const tr = G.trainRound(D.itemOfWord('black'), 3, { learned: U.learnedPairs('b4', 'u8') })
  ok(tr.tiles.filter((x) => x.id.startsWith('t')).map((x) => x.grapheme).sort().join() === ['a', 'b', 'ck', 'l'].sort().join(), 'black = b, l, a, ck tiles')
}
// recordings: 42 entries, file rule, statuses, validation
{
  const RC = R.RECORDINGS
  ok(RC.length === 42 && RC.map((r) => r.no).join() === Array.from({ length: 42 }, (_, i) => i + 1).join() && new Set(RC.map((r) => r.id)).size === 42 && RC.every((r) => /^[a-z0-9-]+$/.test(r.id)), 'RECORDINGS: 42 entries numbered 1..42 with ASCII unique ids')
  ok(RC.slice(0, 5).map((r) => r.id).join() === 'a,e,i,o,u' && RC.slice(5, 23).map((r) => r.id).join('') === 'mstpndgkbhflrjwvyz' && RC.slice(23, 28).map((r) => r.id).join() === 'ai,ie,oa,ue,oo-long' && RC.slice(28, 33).map((r) => r.id).join() === 'sh,ch,th-thin,th-this,ng' && RC.slice(33).map((r) => r.id).join() === 'ee,ow,oi,oo-short,ar,or,er,schwa,air', 'teaching order of the 42 ids')
  ok(RC[0].fileBase === 'ph-01-a' && RC[30].fileBase === 'ph-31-th-thin' && RC[30].ipa === 'θ' && RC[31].fileBase === 'ph-32-th-this' && RC.every((r) => r.fileBase === `ph-${String(r.no).padStart(2, '0')}-${r.id}`), 'file rule ph-<NN>-<id>')
  ok(RC.map((r) => r.ipa).join() === K.RECORDING_LIST.map((r) => r.ipa).join() && RC.every((r) => { const it = D.itemOfWord(r.exampleWord); return it && it.graphemes.includes(r.grapheme) && it.phonemes.includes(r.ipa) }), 'RECORDINGS agree with RECORDING_LIST; examples contain grapheme and sound')
  ok(Object.keys(R.PHONEME_APPROVALS).length === 0 && R.recordingStatuses([]).length === 42 && R.recordingStatuses([]).every((s) => s.status === 'missing' && s.file === null) && R.validateRecordings([]).length === 0, 'today: 42 missing, no approvals, no errors')
  const A = { approvedBy: '선생님', approvedOn: '2026-10-11' }
  const st = (files, ap) => R.recordingStatuses(files, ap).filter((s) => s.id === 'a' || s.id === 'e').map((s) => s.status).join()
  ok(st([], {}) === 'missing,missing' && st(['ph-01-a.mp3'], {}) === 'uploaded,missing' && st(['ph-01-a.mp3'], { a: A }) === 'approved,missing' && st([], { a: A }) === 'missing,missing', 'status transitions: missing -> uploaded -> approved; an approval alone is still missing')
  ok(st(['ph-01-a.mp3'], { a: { approvedBy: '선생님' } }) === 'uploaded,missing' && st(['ph-01-a.mp3'], { a: { approvedOn: '2026-10-11' } }) === 'uploaded,missing' && st(['ph-01-a.mp3'], { a: { approvedBy: 'x', approvedOn: '2026-02-30' } }) === 'uploaded,missing', 'approved needs a file AND a complete approval (by + valid date)')
  const codes = (f, ap = {}, sz = null) => R.validateRecordings(f, ap, sz).map((e) => e.code).join()
  ok(codes(['readme.txt']) === 'unknown-file' && codes(['ph-01-zzz.mp3']) === 'unknown-file' && codes(['ph-01-a.ogg']) === 'wrong-extension' && codes(['ph-02-a.mp3']) === 'pairing' && codes(['ph-01-a.mp3', 'ph-01-a.wav']) === 'duplicate', 'validate: unknown name / wrong extension / pairing / duplicate')
  ok(codes([], { a: A }) === 'approval-without-file' && codes(['ph-01-a.mp3'], { a: { approvedBy: '', approvedOn: '2026-10-11' } }) === 'approval-incomplete' && codes(['ph-01-a.mp3'], { a: { approvedBy: 'x' } }) === 'approval-incomplete' && codes(['ph-01-a.mp3'], { a: { approvedBy: 'x', approvedOn: '11/10/2026' } }) === 'approval-bad-date' && codes(['ph-01-a.mp3'], { zz: A }) === 'approval-unknown', 'validate: approval without file / incomplete / bad date / unknown id')
  ok(codes(['ph-01-a.mp3'], {}, { 'ph-01-a.mp3': 100 }) === 'size' && codes(['ph-01-a.mp3'], {}, { 'ph-01-a.mp3': 600 * 1024 }) === 'size' && codes(['ph-01-a.mp3'], {}, { 'ph-01-a.mp3': 50 * 1024 }) === '' && codes(['ph-01-a.mp3', 'ph-02-e.m4a', 'ph-03-i.wav']) === '', 'validate: size < 2 KB or > 500 KB; good files pass')
  const clips = K.buildClips({ 'ph-01-a.mp3': 'a.url', 'ph-02-e.mp3': 'e.url' }, { a: A })
  ok(Object.keys(clips).join() === 'æ' && clips['æ'].src === 'a.url' && clips['æ'].status === 'teacher-approved' && K.phonemeClip('e', clips) === null && K.recordingStatus('æ', clips) === 'approved' && K.recordingStatus('e', clips) === 'pending' && Object.keys(K.buildClips({}, { a: A })).length === 0 && Object.keys(K.PHONEME_CLIPS).length === 0, 'buildClips: only file + approval becomes playable; real registry is empty')
}
// playPhonemes: a strict no-op without approved clips
{
  const A = { src: 'a.mp3', status: 'teacher-approved' }, E = { src: 'e.mp3', status: 'teacher-approved' }
  const played = []
  const play = (src) => played.push(src)
  let done = 0
  const c0 = P.playPhonemes(['æ', 'e'], { play, onDone: () => done++ })
  const c1 = P.playPhonemes(['æ', 'e'], { clips: { 'æ': A }, play, onDone: () => done++ })
  const c2 = P.playPhonemes(['æ'], { clips: { 'æ': { ...A, status: 'draft' } }, play, onDone: () => done++ })
  ok(typeof c0 === 'function' && typeof c1 === 'function' && typeof c2 === 'function' && P.allApproved(['æ', 'e']) === false && P.allApproved([]) === false, 'playPhonemes returns a cancel function even when it does nothing')
  await new Promise((r) => setTimeout(r, 60))
  ok(played.length === 0 && done === 0, 'playPhonemes: no approved clip (none / partial / draft) = nothing played, onDone not called')
  P.playPhonemes(['æ', 'e', 'æ'], { clips: { 'æ': A, e: E }, gap: 20, play, onDone: () => done++ })
  await new Promise((r) => setTimeout(r, 120))
  ok(played.join() === 'a.mp3,e.mp3,a.mp3' && done === 1, `playPhonemes: all approved plays in order, then onDone once (${played.join()})`)
  played.length = 0; done = 0
  const c4 = P.playPhonemes(['æ', 'e'], { clips: { 'æ': A, e: E }, gap: 30, play, onDone: () => done++ })
  c4()
  await new Promise((r) => setTimeout(r, 100))
  ok(played.join() === 'a.mp3' && done === 0, 'playPhonemes: cancel stops the rest and onDone')
}
// component source pins
{
  const bubble = read('src/components/phonics/SoundBubblePop.jsx'), train = read('src/components/phonics/WordTrain.jsx'), css = read('src/components/pictureWords/pictureImg.jsx')
  ok(/clip && <button[^>]*data-testid="pbp-listen-sound"/.test(bubble) && /phonemeClip\(round\.target\.ipa\)/.test(bubble), 'pbp-listen-sound is mounted only when an approved clip exists')
  ok(/data-testid="pwt-result"/.test(train) && /pwt-depart\{animation:pwt-go[^}]*forwards/.test(css) && /\.pwt-result\{/.test(css) && /@keyframes pwt-go\{[^}]*\}[^}]*visibility:hidden/.test(css), 'Word Train: the departed train stays gone (fill-mode forwards) and pwt-result takes its place')
  ok(/playPhonemes\(\[item\.phonemes\[cur\.placed\]\]\)/.test(train) && /allApproved\(item\.phonemes\)/.test(train), 'Word Train plays tile / sequence phoneme clips only through playPhonemes')
}

// ---- 259차 Book 1: detection task, vowel Word Train, sound test, tips, skill tags
{
  const b1 = C.BOOKS[0]
  ok(b1.skill === 'sound' && C.BOOKS.slice(1).every((x) => x.skill === 'reading'), 'skill tags: Book 1 = sound, Books 2-5 = reading')
  const TIP_VOWELS = ['a', 'e', 'i', 'o', 'u']
  ok(b1.units.every((u, i) => u.intro && u.intro.tipNeedsReview === true && typeof u.intro.tipKo === 'string' && u.intro.tipKo.length > 5 && u.targets[0].grapheme === TIP_VOWELS[i]), 'Book 1 intro tips: one per unit, flagged tipNeedsReview')
  ok(b1.units.every((u) => !/["'"'][가-힣]["'"']/.test(u.intro.tipKo) && !/[a-z/]/i.test(u.intro.tipKo)), 'Book 1 tips: no quoted single Hangul syllable, no Latin letters / IPA (no transliterated sounds)')
  ok(C.BOOKS.slice(1).every((x) => x.units.every((u) => !u.intro)), 'only Book 1 units carry an intro tip')
  // detection rounds: options exactly [vowel, other], right = vowel iff the word has it, seeds 0..19
  let det = true
  const both = new Set()
  const d = U.detectWords('b1', 'u1')
  ok(d.own.length === 5 && d.far.length >= 15 && d.far.every((w) => !w.graphemes.includes('a')) && d.own.every((w) => w.graphemes.includes('a')), 'detect pool: 5 own words with a, many far words without a')
  for (const w of [...d.own, ...d.far]) {
    for (let seed = 0; seed < 20; seed++) {
      const o = { targetIndex: w.targetIndex, detect: true, vowel: 'a' }
      const r = G.bubbleRound(w, seed, undefined, o)
      const exp = w.graphemes.includes('a') ? 'a' : G.OTHER_SOUND_KO
      if (!r || r.options.length !== 2 || r.options.slice().sort().join() !== ['a', G.OTHER_SOUND_KO].sort().join() || r.target.grapheme !== exp) det = false
      if (JSON.stringify(r) !== JSON.stringify(G.bubbleRound(w, seed, undefined, o))) det = false
      both.add(r.options.indexOf(exp))
      const right = r.options.indexOf(exp)
      if (G.bubblePick(G.bubbleStart(r), right).last !== 'right' || G.bubblePick(G.bubbleStart(r), 1 - right).last !== 'wrong') det = false
    }
  }
  ok(det && both.size === 2, 'detect rounds: options exactly [a, other sound], correct both ways, deterministic, both positions occur')
  ok(U.detectUnit('b1', 'u1') && !U.detectUnit('b1', 'u2') && !U.detectUnit('b2', 'u1') && !U.detectUnit('b1', 'review'), 'only Book 1 Unit 1 is a detection unit')
  let mix = true
  for (let seed = 0; seed < 20; seed++) {
    const ses = U.bubbleSession('b1', 'u1', seed)
    const far = ses.filter((w) => !w.graphemes.includes('a'))
    if (ses.length !== 8 || far.length !== 3 || new Set(far.map((w) => w.graphemes[w.targetIndex])).size !== 3 || ses.some((w) => !w.detect || w.vowel !== 'a')) mix = false
  }
  ok(mix, 'Book 1 Unit 1 session = 5 words with a + 3 contrast words of different vowels, all tagged detect')
  const sample = ITEMS.find((i) => i.word === 'cat')
  ok(JSON.stringify(G.bubbleRound(sample, 3, undefined, { targetIndex: 1, optionPairs: U.BOOK1_VOWELS })) === JSON.stringify(G.bubbleRound(sample, 3, undefined, { targetIndex: 1, optionPairs: U.BOOK1_VOWELS, detect: false })), 'bubbleRound without detect is unchanged')
  // Book 1 Word Train: consonants are helpers, one empty slot, five vowel tiles
  let tv = true
  for (const w of b1.units.flatMap((u) => U.unitWords('b1', u.id))) {
    for (let seed = 0; seed < 20; seed++) {
      const r = G.trainRoundVowel(w, seed)
      const vi = w.graphemes.findIndex((g) => G.VOWELS.includes(g))
      if (!r || r.target.slot !== vi || r.target.vowel !== w.graphemes[vi] || r.tiles.length !== 5 || r.tiles.map((t) => t.grapheme).sort().join('') !== 'aeiou' || new Set(r.tiles.map((t) => t.id)).size !== 5) { tv = false; continue }
      const helpers = w.graphemes.filter((_, i) => i !== vi)
      if (helpers.some((g) => G.VOWELS.includes(g)) || helpers.length !== w.graphemes.length - 1) tv = false
      let s = G.trainStart(r)
      s = G.vowelTap(s, r.tiles.find((t) => t.grapheme !== r.target.vowel).id)
      if (s.wrong !== 1 || s.done || s.last !== 'wrong') tv = false
      s = G.vowelTap(s, r.tiles.find((t) => t.grapheme === r.target.vowel).id)
      if (!s.done || s.wrong !== 1 || s.last !== 'right') tv = false
      if (JSON.stringify(r) !== JSON.stringify(G.trainRoundVowel(w, seed))) tv = false
    }
  }
  ok(tv, 'trainRoundVowel: helpers = all non-vowel graphemes, one empty slot, 5 vowel tiles, answer = the word vowel, wrong tap no reveal, deterministic (every Book 1 word x seeds 0..19)')
  ok(G.trainRoundVowel(ITEMS.find((i) => i.word === 'milk'), 1).target.vowel === 'i' && G.trainRoundVowel(ITEMS.find((i) => i.word === 'egg'), 1).target.slot === 0, 'trainRoundVowel: milk -> i, egg -> e (slot 0)')
  // sound test: 5 items, one pick each, score math
  let st = true
  for (const u of b1.units) {
    const own = U.unitWords('b1', u.id)
    for (let seed = 0; seed < 20; seed++) {
      const ses = U.testSession('b1', u.id, seed)
      if (ses.length !== 5 || new Set(ses.map((w) => w.id)).size !== 5 || ses.filter((w) => own.some((x) => x.id === w.id)).length < 3) { st = false; continue }
      if (JSON.stringify(ses.map((w) => w.id)) !== JSON.stringify(U.testSession('b1', u.id, seed).map((w) => w.id))) st = false
      if (u.id === 'u1' && !ses.every((w) => w.detect)) st = false
      let score = 0
      for (const w of ses) {
        const r = G.bubbleRound(w, seed, undefined, { targetIndex: w.targetIndex, optionPairs: w.optionPairs || U.BOOK1_VOWELS, detect: w.detect, vowel: w.vowel })
        const right = r.options.indexOf(r.target.grapheme)
        const wrong = r.options.findIndex((_, i) => i !== right)
        const hit = G.bubblePick(G.bubbleStart(r), right, { once: true })
        const miss = G.bubblePick(G.bubbleStart(r), wrong, { once: true })
        if (!hit.done || hit.wrong !== 0 || !miss.done || miss.wrong !== 1 || miss.last !== 'wrong' || G.bubblePick(miss, right, { once: true }) !== miss) st = false
        if (hit.wrong === 0) score++
      }
      if (score !== 5) st = false
    }
  }
  ok(st, 'sound test: 5 distinct items (>= 3 own), deterministic, one pick each (a miss ends the item, no retry), score math 5/5 (Book 1 units x seeds 0..19)')
  const recs = [
    { bookId: 'b1', unitId: 'u2', step: 'test', itemId: 'word:pen', correct: false, retries: 1, targetPhonemes: ['e'] },
    { bookId: 'b1', unitId: 'u2', step: 'test', itemId: 'word:red', correct: true, retries: 0, targetPhonemes: ['e'] },
    { bookId: 'b1', unitId: 'u2', unitTest: { score: 4, total: 5 }, studentId: 'x', at: 1 },
  ]
  ok(U.missedItems(recs, 'b1', 'u2').join() === 'word:pen', 'missedItems: a missed sound-test item is owed a review; the unitTest summary record is ignored')
  ok(Object.keys(G.summarisePhonemes(recs)).join() === 'e', 'summarisePhonemes ignores unitTest summary records')
  ok(U.unitTestLock(b1) !== null && U.unitTestLock(C.BOOKS[1]) === null, 'Book 1 picture reading test stays locked (the sound test replaces it)')
}
// source pin (259차): letters / sounds never reach speech
{
  const srcs = ['SoundBubblePop', 'WordTrain', 'UnitHub', 'PhonicsAdventure', 'PhonemeListen', 'PaulPhonics'].map((nm) => read('src/components/phonics/' + nm + '.jsx')).join('\n')
  ok(!/speakText|speechSynthesis\.speak|translate_tts/.test(srcs), 'phonics components never call a TTS primitive directly (only playEn on a whole word)')
}

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
  if (!/(curriculum|PaulPhonics|UnitHub|PhonemeListen|PhonicsReviewPanel|ProgressViews|progress.js)/.test(f)) ok(!/['"`>][^'"`<\n]*(Unit|단원|단계)/.test(src), `${f} has no Unit/단원/단계 label strings`)
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
const admin = read('src/components/AdminScreen.jsx')
ok(/const PhonicsReviewPanel = React\.lazy\(\(\) => import\('\.\/admin\/PhonicsReviewPanel'\)\)/.test(admin) && !/import PhonicsReviewPanel/.test(admin) && admin.includes("['phonics','🔤 파닉스 검토']") && /tab === 'phonics' && <React\.Suspense/.test(admin), 'AdminScreen lazy-loads the phonics review tab under Suspense')
const srcFiles = fs.readdirSync(path.join(ROOT, 'src'), { recursive: true }).filter((f) => /\.(jsx?|css)$/.test(f))
ok(srcFiles.length > 100 && !srcFiles.some((f) => /Phonics Adventure/.test(read(path.join('src', f)))), `the name "Phonics Adventure" appears nowhere in src/ (${srcFiles.length} files)`)
ok(!/playEn|playWordAudio|speak/.test(stripC(read('src/components/phonics/PhonemeListen.jsx'))), 'PhonemeListen never calls TTS')
ok(['PaulPhonics', 'UnitHub', 'PhonemeListen', 'PhonicsAdventure', 'SoundBubblePop', 'WordTrain'].every((nm) => fs.existsSync(path.join(ROOT, `src/components/phonics/${nm}.jsx`))), 'phonics components present')

// ---- 261차 pass mark: ONE settings source, helpers take the settings as a parameter, review of missed sounds
{
  const S = await import('../src/data/phonics/settings.js')
  ok(S.PHONICS_SETTINGS.testPassRatio === 0.8, 'settings: default pass ratio 0.8')
  ok([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => G.passMark(t)).join() === '1,2,3,4,4,5,6,7,8,8', 'passMark 1..10 at 0.8')
  ok([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => G.passMark(t, { testPassRatio: 0.6 })).join() === '1,2,2,3,3,4,5,5,6,6', 'passMark 1..10 at 0.6')
  ok([1, 2, 3, 4, 5].every((t) => G.passMark(t, { testPassRatio: 1 }) === t), 'passMark at 1.0 = total')
  ok(!G.testPassed(3, 5) && G.testPassed(4, 5) && G.testPassed(5, 5) && !G.testPassed(0, 5), 'testPassed boundaries 3/5 false, 4/5 true')
  ok(G.testPassed(3, 5, { testPassRatio: 0.6 }) && !G.testPassed(4, 5, { testPassRatio: 1 }), 'a custom settings object changes the result (configurable)')
  const lit = [...fs.readdirSync(path.join(ROOT, 'src'), { recursive: true })].filter((f) => /phonics/i.test(f) && /\.jsx?$/.test(f)).filter((f) => /Ratio\W+0\.8/.test(read(path.join('src', f))))
  ok(lit.length === 1 && /settings\.js$/.test(lit[0]), `the 0.8 pass mark literal lives only in settings.js (${JSON.stringify(lit)})`)
  const ctxOf = (id) => U.unitContext('b1', id)
  for (const u of C.BOOKS[0].units) {
    let st = true, why = ''
    for (let seed = 1; seed <= 12; seed++) {
      const test = U.testSession('b1', u.id, seed)
      for (const miss of [[test[0]], [test[1], test[3]], test]) {
        const rv = U.reviewForMisses('b1', u.id, miss, seed)
        const key = (w) => (w.detect ? (w.graphemes.includes(w.vowel) ? w.vowel : '') : w.graphemes[w.targetIndex])
        if (rv.length < 3 || rv.length > 6 && miss.length < 6) { st = false; why = `size ${rv.length}` }
        if (!miss.every((m) => rv.some((x) => x.id === m.id))) { st = false; why = 'misses missing' }
        if (new Set(rv.map((x) => x.id)).size !== rv.length) { st = false; why = 'dup' }
        if (JSON.stringify(rv.map((x) => x.id)) !== JSON.stringify(U.reviewForMisses('b1', u.id, miss, seed).map((x) => x.id))) { st = false; why = 'not deterministic' }
        if (!rv.every((x) => rv.some((y) => key(y) === key(x)) && (miss.some((m) => key(m) === key(x)) || false))) { st = false; why = 'foreign sound' }
        for (const w of rv) {
          const r = G.bubbleRound(w, seed, undefined, { targetIndex: w.targetIndex, optionPairs: w.optionPairs || ctxOf(u.id).optionPairs, detect: !!w.detect, vowel: w.vowel })
          if (!r || r.options.some((o) => /^[bcdfghjklmnpqrstvwxyz]/.test(o) && o !== '다른 소리')) { st = false; why = `consonant option in ${w.word}` }
        }
      }
    }
    ok(st, `reviewForMisses ${u.id}: 3-6 items, covers every missed item and sound, deterministic, no consonant option (${why})`)
  }
  ok(U.reviewForMisses('b1', 'u1', [], 5).length === 0, 'reviewForMisses: empty misses -> empty')
  const pa = read('src/components/phonics/PhonicsAdventure.jsx')
  ok(/unitTest: \{ score: firstTry, total: items\.length, passMark: mark, passed \}/.test(pa) && /data-passed/.test(pa) && /data-pass-mark/.test(pa) && /pha-retest/.test(pa), 'test record shape { score, total, passMark, passed } + data-passed/data-pass-mark/pha-retest')
  const sm = U.missedItems([{ bookId: 'b1', unitId: 'u1', step: 'test', itemId: 'x', correct: false }, { bookId: 'b1', unitId: 'u1', unitTest: { score: 4, total: 5, passMark: 4, passed: true } }], 'b1', 'u1')
  ok(sm.join() === 'x', 'a missed test item counts toward hub step 10; the test summary record does not')
}
// 263차: Book 1 say/record step offers all 5 unit words (picture-less ones as text cards); picture test/hammer/hidden stay picture-ready only
for (const u of C.BOOKS[0].units.filter((x) => !x.review)) {
  const ws = U.unitWords('b1', u.id)
  ok(ws.length === 5 && ws.map((w) => w.word).join() === u.words.map((n) => D.itemOfSlot(n).word).join(), `b1${u.id} say step = the unit's own 5 words in unit order`)
  const r = U.readyWords(ws)
  ok(r.length >= 1 && r.every((w) => ws.includes(w) && w.asset) && ws.filter((w) => !w.asset).every((w) => w.image !== 'ready'), `b1${u.id} ${r.length} picture + ${5 - r.length} text cards; ready list (test/hammer/hidden) is picture-only`)
}
{
  const hub = read('src/components/phonics/UnitHub.jsx'), pwp = read('src/components/pictureWords/PictureWordPractice.jsx')
  ok(/key: 'say'[^\n]*ok: hasWords[^\n]*onPractice\(words\)/.test(hub) && /key: 'pic'[^\n]*ok: ready\.length > 0[^\n]*onPractice\(ready\)/.test(hub), 'hub: Book 1 say row offers all unit words; Books 2-5 pic row still ready-only')
  ok(/w\.asset \? <GamePicture word=\{w\} testid="pwp-picture" \/> : <div data-testid="pwp-text-card" className="pw-card"><div className="pw-pic /.test(pwp) && /all.filter\(\(x\) => x\.asset\)/.test(pwp) && /PracticeCards words=\{all\}/.test(pwp), 'practice: text card for picture-less words; quiz/games use the picture-only list')
}
// 264차: Korean meaning for picture-less Book 1 words, behind an approval gate (PROPOSED_KO = lead proposals, APPROVED_KO = operator approvals, empty today)
{
  const b1 = [...new Set(C.BOOKS[0].units.flatMap((u) => u.words.map((w) => D.itemOfSlot(w).word)))].map((w) => D.itemOfWord(w))
  const noPic = b1.filter((w) => !w.asset), withPic = b1.filter((w) => w.asset)
  ok(b1.length === 25 && noPic.length === 16 && withPic.length === 9, 'ko: Book 1 still has 25 words = 9 picture + 16 picture-less')
  ok(noPic.every((w) => typeof D.PROPOSED_KO[w.word] === 'string' && D.PROPOSED_KO[w.word]) && Object.keys(D.PROPOSED_KO).length === 16, 'ko: all 16 picture-less Book 1 words have a proposal, and nothing else does')
  ok([...D.APPROVED_KO].every((w) => w in D.PROPOSED_KO), 'ko: APPROVED_KO is a subset of the PROPOSED_KO keys')
  ok(D.APPROVED_KO.size === 16 && noPic.every((w) => w.ko === D.PROPOSED_KO[w.word] && w.koProposed === w.ko), 'ko: operator approved all 16 (2026-10-12): every picture-less word has its meaning')
  ok(noPic.every((w) => D.koOf(w.word, null, new Set()) === null) && D.koOf('zzz', null) === null && D.koOf('cat', null, new Set(['dog'])) === null, 'ko: the gate still works - an empty or non-matching approved set yields null, and a word outside the approved set never gets a meaning')
  ok(withPic.every((w) => w.ko && w.ko === w.picture.ko && w.koProposed === null) && ITEMS.filter((i) => i.picture).every((i) => i.ko === i.picture.ko), 'ko: picture words keep their picture ko unchanged')
  const some = new Set(['cat', 'dog', 'zzz'])
  ok(noPic.every((w) => D.koOf(w.word, null, some) === (some.has(w.word) ? D.PROPOSED_KO[w.word] : null)) && D.koOf('cat', null, new Set(['cat'])) === '고양이' && D.koOf('cat', null) === '고양이' && D.koOf('cat', null, new Set()) === null && D.koOf('cat', { ko: '그림뜻' }, some) === '그림뜻', 'ko: the parameterised helper yields the proposal only for words in the passed approved set, and a picture ko always wins')
  const stu = ['src/components/phonics', 'src/components/pictureWords'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).map((f) => `${d}/${f}`)).filter((f) => /\.jsx?$/.test(f))
  ok(stu.length > 10 && stu.every((f) => !/koProposed|PROPOSED_KO/.test(read(f))), 'ko: student code never reads koProposed / PROPOSED_KO')
  ok(/koProposed/.test(read('src/components/admin/PhonicsReviewPanel.jsx')) && /phr-b1-ko/.test(read('src/components/admin/PhonicsReviewPanel.jsx')), 'ko: only the admin review panel shows the proposals')
  // 그림 승인 3분리: 그림 있음(image) / 자동 일치 / 교사 승인 기록(decision) - 승인 기록 없는 그림은 승인으로 표시 금지
  const rdy = ITEMS.filter((i) => i.image === 'ready')
  ok(D.pictureApprovalOf({ decision: 'approve' }) === 'approved' && D.pictureApprovalOf({ decision: null }) === 'auto' && D.pictureApprovalOf(null) === null, 'picture approval: approve -> approved, no decision -> auto, no picture -> null')
  ok(rdy.length === 32 && rdy.every((i) => i.pictureApproval === 'auto') && !ITEMS.some((i) => i.pictureApproval === 'approved') && ITEMS.filter((i) => i.image !== 'ready').every((i) => i.pictureApproval === null), 'picture approval: 32 ready items are all auto-matched, none approved, non-ready items have null')
  ok(!read('src/components/admin/PhonicsReviewPanel.jsx').includes('그림 준비') && read('src/components/admin/PhonicsReviewPanel.jsx').includes('교사 승인') && D.IMAGE_LABEL_KO.ready === '그림 있음', 'picture approval: the admin panel never says 그림 준비 and shows 교사 승인 separately')
  ok(read('src/components/admin/PhonicsReviewPanel.jsx').includes('자동 연결 · 검토 필요') && !read('src/components/admin/PhonicsReviewPanel.jsx').includes('자동 일치'), 'picture approval: an unapproved picture reads 자동 연결 · 검토 필요 (never 자동 일치)')
  // 267차 관리자 집계 기준: 승인 수는 승인 목록·실제 파일에서만 계산한다(제안·미리보기·고정 숫자 금지).
  const phr = read('src/components/admin/PhonicsReviewPanel.jsx'), ppp = read('src/components/admin/PhonicsProgressPanel.jsx')
  ok(/prop\.filter\(\(x\) => APPROVED_KO\.has\(x\.word\)\)\.length/.test(phr) && /APPROVED_KO\.has\(x\.word\) \? ' 승인' : ' 뜻 검토 필요'/.test(phr) && !/x\.ko \? ' 승인'/.test(phr), 'admin counts: "뜻 승인" counts APPROVED_KO membership, not any truthy ko (a picture ko must not read as an approved proposal)')
  ok(/const recs = recordingStatuses\(Object\.keys\(CLIP_URLS\)\)/.test(phr) && !/recordingStatuses\(\[\]\)/.test(phr), 'admin counts: recording rows read the real bundled file names, not an empty list')
  ok(!/\d+ \/ 42|승인 0 \/ 필요/.test(phr) && /rec\.filter\(\(ipa\) => recordingStatus\(ipa\) === 'approved'\)\.length/.test(phr) && /recN\(\(x\) => x\.status === 'approved'\)/.test(phr), 'admin counts: no literal recording totals — unit rows and the real-status line are computed')
  ok(/\{o\.completed\}\/\{TOTAL_UNITS\}/.test(ppp) && !/\/43\)/.test(ppp) && /SAMPLE_NOTICE_KO/.test(ppp) && !/supabase|fetch\(/.test(ppp), 'admin counts: the progress panel is sample-only (banner, no network) and its unit total is computed')
  ok(C.BOOKS[0].units.map((u) => u.words.map((w) => D.itemOfSlot(w).word).join(' ')).join(' | ') === 'bag jam cat hat map | pen desk egg bed red | milk ink pig six lip | sock dog box hot pot | cup sun bus mug nut', 'ko: Book 1 word list unchanged (25 words)')
  const wt = read('src/components/phonics/WordTrain.jsx'), sbp = read('src/components/phonics/SoundBubblePop.jsx'), pwp = read('src/components/pictureWords/PictureWordPractice.jsx')
  ok(/item\.ko && \(item\.asset \|\| st\.done\) && <p data-testid="pwt-ko"/.test(wt), 'ko: Word Train shows a picture-less word\'s meaning only after the answer')
  ok(/const reveal = st\.done \|\| hinted/.test(sbp) && sbp.indexOf('pbp-ko') > sbp.indexOf('{reveal && ('), 'ko: Sound Bubble Pop shows the meaning only inside the reveal block (after the answer or a practice hint)')
  const quizCard = pwp.slice(pwp.indexOf('function QuizCard'), pwp.indexOf('// stage:'))
  ok(quizCard.indexOf('<WordText') > quizCard.indexOf('{answered && ('), 'ko: the picture-word quiz renders word/meaning only after answering')
  ok(/<WordBtn word=\{w\} className="break-words text-4xl/.test(pwp) && /<WordText word=\{w\} hide=\{!w\.asset\} \/>/.test(pwp) && /onClick=\{\(\) => playEn\(word\.en\)\}/.test(pwp) && /<button type="button" data-testid="pwp-listen" onClick=\{\(\) => playEn\(word\.en\)\}/.test(pwp), 'ko: tapping the word (a real button) calls the same playEn as the 발음 듣기 button; the text card keeps the word once, inside the mat')
}
// 264차: SSR of the practice card with the real component (stubbed browser-only deps) — default state and an approved-meaning state, without touching product data
{
  const esbuild = await import('esbuild'), { pathToFileURL } = await import('node:url')
  const TMP = path.join(ROOT, 'scripts/.tmp/pwp-ssr'); fs.mkdirSync(TMP, { recursive: true })
  const STUBS = [
    [/pictureImg\.jsx$/, `import React from 'react'
export const BTN = '', W = {}, T2 = '', T3 = '', MUTED = '', ROLE = { go: {}, say: {}, play: {}, review: {}, listen: {} }, GameStyle = () => null, MenuPic = () => null, PwProgress = () => null, playEn = () => {}
export const GamePicture = ({ testid }) => React.createElement('div', { 'data-testid': testid + '-card', className: 'pw-card' })`],
    [/SpeakingPracticeItem$/, 'export const RecorderControls = () => null'],
    [/hooks[\/]useLocalRecorder$/, 'export default () => ({ st: { status: \'idle\' }, elapsed: 0, reset() {}, stop() {} })'],
    [/utils[\/]speech$/, 'export const stopSpeaking = () => {}, playWordAudio = () => {}'],
    [/pictureWords[\/]sfx\.js$/, 'export const playSfx = () => {}'],
    [/SfxControl\.jsx$/, 'export default () => null'],
    [/\.\/PictureGames$/, 'export default () => null'],
    [/phonics[\/]PaulPhonics$/, 'export default () => null'],
  ]
  await esbuild.build({ entryPoints: ['src/components/pictureWords/PictureWordPractice.jsx'], bundle: true, format: 'esm', platform: 'node', outfile: path.join(TMP, 'pwp.mjs'), jsx: 'automatic', external: ['react', 'react/jsx-runtime'], absWorkingDir: ROOT,
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => { const hit = STUBS.findIndex(([re]) => re.test(a.path)); return hit < 0 ? null : { path: String(hit), namespace: 'stub' } })
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[+a.path][1], loader: 'jsx', resolveDir: ROOT }))
    } }] })
  const { PracticeCards } = await import(pathToFileURL(path.join(TMP, 'pwp.mjs')).href)
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server')
  const html = (w) => renderToStaticMarkup(React.createElement(PracticeCards, { words: [w], onDone() {} }))
  const dog = D.itemOfWord('dog'), jam = D.itemOfWord('jam')
  const none = html({ ...dog, ko: D.koOf('dog', dog.picture, new Set()) }), appr = html(dog), pic = html(jam)
  const count = (h, id) => h.split(`data-testid="${id}"`).length - 1
  ok(count(none, 'pwp-text-card') === 1 && count(none, 'pwp-word') === 1 && count(none, 'pwp-ko') === 0 && !/개|준비 중/.test(none), 'ssr: unapproved (empty set) picture-less word -> one text card, the word once (a button inside the mat), no meaning line and no placeholder')
  ok(/<button type="button" data-testid="pwp-word"[^>]*>dog<\/button>/.test(none) && none.indexOf('pwp-text-card') < none.indexOf('pwp-word') && none.indexOf('pwp-word') < none.indexOf('pwp-listen'), 'ssr: the word is a real button inside the text card, before the 발음 듣기 button')
  ok(count(appr, 'pwp-text-card') === 1 && count(appr, 'pwp-word') === 1 && count(appr, 'pwp-ko') === 1 && />개<\/p>/.test(appr) && appr.indexOf('pwp-word') < appr.indexOf('pwp-ko'), 'ssr: the approved word renders its meaning under the card')
  ok(count(pic, 'pwp-picture-card') === 1 && count(pic, 'pwp-text-card') === 0 && count(pic, 'pwp-word') === 1 && count(pic, 'pwp-ko') === 1 && pic.includes(`>${jam.ko}</p>`), 'ssr: a picture word keeps picture card + word button + its picture meaning')
}
// image backlog doc (2026-10-13): every needed word appears in the doc as a whole word and the doc states the real total
{
  const { imageBacklog } = await import('./phonics/listImageBacklog.mjs')
  const bl = imageBacklog()
  const doc = read('docs/design/PHONICS_IMAGE_BACKLOG_2026-10-13.md')
  ok(bl.total === ITEMS.filter((i) => i.image === 'needed').length && doc.includes(`**${bl.total}개**`) && bl.words.every((w) => new RegExp(`(^|[^a-z])${w.word}([^a-z]|$)`).test(doc)), 'image backlog doc lists every image:needed word and states the real total')
}
console.log(`${fail ? 'FAIL' : 'PASS'} ${n - fail}/${n} testPhonicsGames`)
process.exit(fail ? 1 : 0)
