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
ok(E.filter((e) => e.status !== 'MATCH').every((e) => e.tracks.length === 0 && e.learn === false && e.decision === null), 'non-MATCH (no decisions yet): tracks empty, learn false')
ok(E.every((e) => e.suggested && typeof e.suggested.en === 'string' && e.suggested.en === e.en), 'suggested kept (= en while no edits)')
const dd = rd('scripts/pictureWords/source/decisions.json')
ok(dd.v === 1 && Object.keys(dd.decisions).length === 0, 'decisions.json is the empty placeholder')
ok(data.counts.learnable === 119 && data.counts.pending === 31 && data.counts.excluded === 0 && data.counts.approved === 0 && data.counts.edited === 0 && data.pending.length === 31, 'counts learnable 119 / pending 31 / excluded 0')
ok(E.filter((e) => e.status === 'MATCH').every((e) => e.tracks.includes('pictureVocabulary') && e.tracks.includes('shopVocabulary')), 'MATCH has picture+shop tracks')
ok(E.filter((e) => e.tracks.includes('townObject')).every((e) => e.shop === 'garden' || e.shop === 'decoration'), 'townObject only garden/decoration')
const ph = E.filter((e) => e.phonicsCandidate)
ok(ph.length === 33, `33 phonics candidates (${ph.length})`)
ok(ph.every((e) => e.phonicsCandidate.group && e.phonicsCandidate.pattern && e.phonicsCandidate.ipa), 'phonicsCandidate group/pattern/ipa')
ok(E.every((e) => !('phonics' in e) && !e.tracks.includes('phonics')), 'no phonics track / field on any entry (operator: do not classify)')
ok(data.phonicsReview.orderConfirmed === false && data.phonicsReview.classified === false && /미확정/.test(data.phonicsReview.note), 'phonicsReview unconfirmed + unclassified')
ok(cnt((e) => e.existingWord) === 18, 'existingWord 18')
ok(E.every((e) => e.newCandidate === !e.existingWord), 'newCandidate = !existingWord')
ok(E.every((e) => e.provenance?.picture === 'viewed' && e.provenance.ko === 'inferred'), 'provenance present')
ok(data.counts.total === 151 && data.counts.existingWord === 18, 'top-level counts')

// ---- helper unit checks
const H = await import('../src/data/pictureWords/index.js')
ok(H.PICTURE_WORDS.length === 151, 'helper PICTURE_WORDS')
ok(H.byStatus('MISMATCH').length === 16, 'byStatus')
ok(H.phonicsGroups().reduce((a, g) => a + g.items.length, 0) === 33 && H.phonicsGroups().length === 13, 'phonicsGroups 13 groups / 33 words')
ok(H.learnableWords().length === 119 && H.pendingWords().length === 31, 'learnableWords 119 / pendingWords 31')
const SS = H.shopSets()
ok(SS.map((x) => x.shop).join() === 'food,school,toy,clothes,furniture,decoration,garden,pet', 'shopSets fixed order')
ok(SS.every((x) => x.ready === (x.words.length >= 4) && x.labelKo && x.labelEn) && SS.reduce((a, x) => a + x.words.length, 0) === 119, 'shopSets ready flag = >=4 words, 119 total')
ok(SS.find((x) => x.shop === 'pet').ready === false, 'pet set not ready')
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

// ---- decisions validator
const { validate } = await import('../scripts/pictureWords/validateDecisions.mjs')
const V = verdicts
const pick = (st) => V.find((v) => v.status === st).id
const mm = pick('MISMATCH'), unc = pick('UNCERTAIN'), um = pick('UNUSABLE'), mt = pick('MATCH')
const run = (decisions, v = 1) => validate({ v, decisions }, V)
ok(run({}).errors.length === 0 && run({}).pending === 31, 'validator: empty valid, pending 31')
let r = run({ [mm]: { action: 'approve', at: 1 }, [unc]: { action: 'approve', en: 'cat', ko: '고양이', at: 2 }, [um]: { action: 'exclude', at: 3 } })
ok(r.errors.length === 0 && r.approved === 2 && r.edited === 1 && r.excluded === 1 && r.pending === 29, `validator: approve/edit/exclude counts ${JSON.stringify(r)}`)
ok(run({ 'pics2/nope': { action: 'approve' } }).unknown === 1 && run({ 'pics2/nope': { action: 'approve' } }).errors.length === 1, 'validator: unknown id rejected')
ok(run({ [mt]: { action: 'exclude' } }).errors.length === 1, 'validator: decision on MATCH rejected')
ok(run({ [mm]: { action: 'delete' } }).errors.length === 1, 'validator: bad action rejected')
ok(run({ [mm]: { action: 'approve', en: '' } }).errors.length === 1 && run({ [mm]: { action: 'approve', en: ' x ' } }).errors.length === 1 && run({ [mm]: { action: 'approve', ko: 'a'.repeat(41) } }).errors.length === 1, 'validator: empty / untrimmed / >40 text rejected')
ok(run({ [um]: { action: 'approve' } }).errors.length === 1, 'validator: UNUSABLE approve rejected')
ok(run({}, 2).errors.length === 1, 'validator: v!==1 rejected')

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

// ---- panel source pins
const panel = fs.readFileSync(path.join(ROOT, 'src/components/admin/PictureWordReviewPanel.jsx'), 'utf8')
const admin = fs.readFileSync(path.join(ROOT, 'src/components/AdminScreen.jsx'), 'utf8')
ok(!FORBID.test(panel), 'panel has no fetch/supabase/api/grantReward')
ok(!/window\.confirm|[^.\w]confirm\(|alert\(/.test(panel), 'panel has no window.confirm/alert')
ok(panel.includes("'paulEasyVoca_pictureWordReview'"), 'localStorage key literal')
ok((panel.match(/localStorage\./g) || []).length === 2, 'localStorage touched only by load+save')
ok(/const PictureWordReviewPanel = React\.lazy\(\(\) => import\('\.\/admin\/PictureWordReviewPanel'\)\)/.test(admin), 'AdminScreen lazy-loads the panel')
ok(!/import PictureWordReviewPanel/.test(admin) && admin.includes('<React.Suspense') && admin.includes("tab === 'picturewords'"), 'panel rendered only under Suspense + tab')
for (const id of ['pwr-root', 'pwr-tab-', 'pwr-card-', 'pwr-img-', 'pwr-approve-', 'pwr-edit-', 'pwr-en-', 'pwr-ko-', 'pwr-exclude-', 'pwr-reset-', 'pwr-count-approved', 'pwr-count-excluded', 'pwr-count-pending', 'pwr-export', 'pwr-export-text', 'pwr-clear', 'pwr-phonics-group-', 'pwr-shop-', 'pwr-local-notice', 'pwr-phonics-order-notice']) {
  ok(panel.includes(id), `testid ${id}`)
}
ok(panel.includes('학습 순서 미확정') && panel.includes('이 브라우저에만 저장됩니다') && panel.includes('설계 — 미구현'), 'required notices present')
ok(!/pictureWords/.test(fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8')), 'App.jsx (student shell) does not reference pictureWords')

console.log(fail ? `FAIL ${fail}/${n}` : `PASS ${n}/${n} picture-word checks`)
process.exit(fail ? 1 : 0)
