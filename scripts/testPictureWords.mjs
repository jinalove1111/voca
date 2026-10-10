// Picture-word data/assets static checks (248차). Network 0, file reads + dynamic import of the pure helper.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let fail = 0, n = 0
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m) } }
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))

const data = rd('src/data/pictureWords/pictureWords.json')
const manifest = rd('src/assets/pictureWords/manifest.json')
const verdicts = rd('scripts/pictureWords/source/verdicts.json')
const E = data.entries
const cnt = (f) => E.filter(f).length

// ---- entries / status counts
ok(E.length === 151, `151 entries (${E.length})`)
const st = (s) => cnt((e) => e.status === s)
ok(st('MATCH') === 119 && st('MISMATCH') === 16 && st('UNCERTAIN') === 10 && st('MULTIPLE') === 5 && st('UNUSABLE') === 1, 'status counts 119/16/10/5/1')
ok(new Set(E.map((e) => e.id)).size === 151, 'ids unique')
ok(E.every((e, i) => e.id === 'pics2/' + verdicts[i].file.replace(/\.png$/, '') && e.sourceFile === verdicts[i].file), 'ids = pics2/<original stem>, order preserved')
ok(new Set(E.map((e) => e.asset)).size === 151, 'assets unique')
ok(E.every((e) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.asset)), 'asset slugs ascii kebab')

// ---- assets on disk <-> manifest <-> entries
const dir = path.join(ROOT, 'src/assets/pictureWords')
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webp'))
const referenced = new Set(E.map((e) => e.asset + '.webp'))
ok(E.every((e) => fs.existsSync(path.join(dir, e.asset + '.webp'))), 'every asset file exists')
ok(files.every((f) => referenced.has(f)) && files.length === 151, `no orphan webp (${files.length})`)
let total = 0
for (const e of E) {
  const m = manifest.assets[e.id]
  ok(!!m && m.asset === e.asset, `manifest row ${e.id}`)
  if (!m) continue
  const buf = fs.readFileSync(path.join(dir, e.asset + '.webp'))
  total += buf.length
  ok(buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP', `WebP magic ${e.asset}`)
  ok(buf.length === m.bytes && m.bytes <= 40 * 1024, `bytes ${e.asset} ${m.bytes}`)
  ok(Math.max(m.w, m.h) <= 256, `size ${e.asset}`)
}
ok(manifest.totals.bytes === total && manifest.totals.count === 151, 'manifest totals')

// ---- tracks / autoLink / phonics / reuse
ok(E.every((e) => e.autoLink === (e.status === 'MATCH')), 'autoLink iff MATCH')
ok(E.filter((e) => e.status !== 'MATCH').every((e) => e.tracks.length === 0), 'non-MATCH tracks empty')
ok(E.filter((e) => e.status === 'MATCH').every((e) => e.tracks.includes('pictureVocabulary') && e.tracks.includes('shopVocabulary')), 'MATCH has picture+shop tracks')
ok(E.filter((e) => e.tracks.includes('townObject')).every((e) => e.shop === 'garden' || e.shop === 'decoration'), 'townObject only garden/decoration')
const ph = E.filter((e) => e.phonics)
ok(ph.length === 33, `33 phonics (${ph.length})`)
ok(ph.every((e) => e.phonics.group && e.phonics.pattern && e.phonics.ipa && e.phonics.phonicsOrder === null), 'phonics group/pattern/ipa, phonicsOrder null')
ok(data.phonicsReview.orderConfirmed === false && /미확정/.test(data.phonicsReview.note), 'phonicsReview.orderConfirmed false')
ok(cnt((e) => e.existingWord) === 18, 'existingWord 18')
ok(E.every((e) => e.newCandidate === !e.existingWord), 'newCandidate = !existingWord')
ok(E.every((e) => e.provenance?.picture === 'viewed' && e.provenance.ko === 'inferred'), 'provenance present')
ok(data.counts.total === 151 && data.counts.existingWord === 18, 'top-level counts')

// ---- helper unit checks
const H = await import('../src/data/pictureWords/index.js')
ok(H.PICTURE_WORDS.length === 151, 'helper PICTURE_WORDS')
ok(H.byStatus('MISMATCH').length === 16, 'byStatus')
ok(H.phonicsGroups().reduce((a, g) => a + g.items.length, 0) === 33 && H.phonicsGroups().length === 13, 'phonicsGroups 13 groups / 33 words')
ok(H.shopGroups().length === 8 && H.shopGroups().reduce((a, g) => a + g.items.length, 0) === 119, 'shopGroups 8 / 119 MATCH')
ok(H.reuseSummary().existing.length === 18 && H.reuseSummary().newCandidates.length === 101, 'reuseSummary 18 / 101')
const mis = E.find((e) => e.status === 'MISMATCH'), match = E.find((e) => e.status === 'MATCH')
const dec = { [mis.id]: { action: 'approve', en: ' zzz ', ko: '테스트', at: 1 }, [match.id]: { action: 'exclude', at: 2 }, 'pics2/nope': { action: 'approve', at: 3 } }
const snapE = JSON.stringify(E), snapD = JSON.stringify(dec)
const out = H.applyDecisions(E, dec)
const o1 = out.find((e) => e.id === mis.id), o2 = out.find((e) => e.id === match.id)
ok(o1.decision === 'approve' && o1.en === 'zzz' && o1.ko === '테스트' && o1.edited && o1.tracks.includes('pictureVocabulary'), 'apply: approve+edit')
ok(o2.decision === 'exclude' && o2.tracks.length === 0, 'apply: exclude')
ok(out.length === 151 && out.filter((e) => e.decision).length === 2, 'apply: unknown id ignored')
ok(JSON.stringify(E) === snapE && JSON.stringify(dec) === snapD, 'apply: inputs not mutated')
ok(H.applyDecisions(E, { [mis.id]: { action: 'approve', at: 1 } }).find((e) => e.id === mis.id).en === mis.en, 'apply: plain approve keeps words')
ok(H.applyDecisions(E, null).every((e) => e.decision === null), 'apply: null decisions')

// ---- source pins: data module
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]))
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/')
const FORBID = /fetch\(|supabase|\/api\/|grantReward|XMLHttpRequest/
const dataSrc = fs.readFileSync(path.join(ROOT, 'src/data/pictureWords/index.js'), 'utf8')
ok(!FORBID.test(dataSrc), 'data module has no fetch/supabase/api/grantReward')
ok(!/localStorage|from 'react'/.test(dataSrc), 'data module is pure (no storage/React)')

// ---- isolation: only the panel (and the asset dir) may reference assets/pictureWords
const importers = walk(path.join(ROOT, 'src')).filter((f) => /\.(jsx?|mjs)$/.test(f)).filter((f) => /assets\/pictureWords/.test(fs.readFileSync(f, 'utf8'))).map(rel)
ok(importers.every((f) => f === 'src/components/admin/PictureWordReviewPanel.jsx'), `assets/pictureWords referenced only by the panel: ${importers.join(', ')}`)

//PANEL_PINS

console.log(fail ? `FAIL ${fail}/${n}` : `PASS ${n}/${n} picture-word checks`)
process.exit(fail ? 1 : 0)
