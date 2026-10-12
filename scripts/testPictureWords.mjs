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
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]))
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/')
const importersOf = (needle) => walk(path.join(ROOT, 'src')).filter((f) => /\.(jsx?|mjs)$/.test(f)).filter((f) => fs.readFileSync(f, 'utf8').includes(needle)).map(rel)

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

const notes = rd('src/data/pictureWords/pictureWordsNotes.json')
ok(E.every((e) => notes[e.id] && notes[e.id].shown && notes[e.id].reason && !('shown' in e) && !('reason' in e)), 'shown/reason live only in pictureWordsNotes.json (admin panel)')
ok(importersOf('pictureWordsNotes').every((f) => f === 'src/components/admin/PictureWordReviewPanel.jsx'), 'notes json imported only by the admin panel')

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
ok(data.provenance?.picture === 'viewed' && data.provenance.ko === 'inferred' && E.every((e) => !('provenance' in e)), 'provenance once at top level')
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

// ---- teacher-approval rule: new pictures are not student-visible; the 119 legacy ones are a frozen review list
const { isLearnable } = await import('../scripts/pictureWords/validateDecisions.mjs')
const LG = rd('scripts/pictureWords/source/legacyAutoPublished.json').ids, LGS = new Set(LG)
const realLegacy = E.filter((e) => e.learn && e.decision !== 'approve').map((e) => e.id)
const newMatch = E.find((e) => e.status === 'MATCH' && !LGS.has(e.id))
ok(isLearnable('MATCH', null, LG[0], LGS) === true && isLearnable('MATCH', null, 'pics2/new', LGS) === false && isLearnable('MATCH', 'approve', 'pics2/new', LGS) === true && isLearnable('MISMATCH', 'approve', 'x', LGS) === true && isLearnable('MISMATCH', null, 'x', LGS) === false && isLearnable('MATCH', 'exclude', 'pics2/new', LGS) === false, 'isLearnable: legacy MATCH true, new MATCH false, approve true, MISMATCH none false, exclude false')
ok(LG.length === 119 && LGS.size === 119 && LG.every((id, i) => i === 0 || LG[i - 1] < id) && JSON.stringify(LG) === JSON.stringify(realLegacy.slice().sort()) && E.filter((e) => e.learn).every((e) => e.decision === 'approve' || LGS.has(e.id)), 'legacy list: 119 unique sorted ids == real learn-without-approval entries; every learn entry is approved or legacy')
const gsrc = fs.readFileSync(path.join(ROOT, 'scripts/pictureWords/buildPictureWordsData.mjs'), 'utf8')
ok(gsrc.includes('isLearnable(') && !gsrc.includes("v.status === 'MATCH' || decision"), 'generator uses isLearnable and not the bare auto-publish rule')
const SC = H.pictureStateCounts(), st1 = H.pictureState({ asset: 'x', autoLink: true, decision: null, learn: true })
ok(JSON.stringify(SC) === JSON.stringify({ hasImage: 151, autoLinked: 119, teacherApproved: 0, studentVisible: 119, needsReview: 119 }), `pictureStateCounts real data ${JSON.stringify(SC)}`)
ok(!st1.teacherApproved && st1.studentVisible && st1.hasImage && st1.autoLinked && H.pictureState({ asset: 'x', autoLink: true, decision: 'approve', learn: true }).teacherApproved && H.pictureState({}).hasImage === false, 'pictureState: four independent flags')
const fx = [{ asset: 'a', autoLink: true, decision: null, learn: true }, { asset: 'b', autoLink: true, decision: 'approve', learn: true }]
ok(H.pictureStateCounts(fx).needsReview === 1 && H.pictureStateCounts(fx.slice(0, 1)).needsReview === 1 && H.pictureStateCounts([fx[0], { ...fx[1], decision: null }]).needsReview === 2, 'pictureStateCounts: an approved entry is not needsReview')

// ---- practice.js (pure)
const P = await import('../src/utils/pictureWords/practice.js')
ok(P.STEPS.join() === 'card,end,quiz,review,summary' && P.MODES.join() === 'practice,test', 'practice STEPS (251: one card per word) + MODES')
ok(P.startStep('practice') === 'card' && P.startStep('test') === 'quiz' && P.startStep('nope') === 'card', 'practice starts on the card, test starts on the picture-only question')
const pool = H.learnableWords()
let detOk = true, distinctOk = true, onceOk = true, diffOk = true, notConst = true, shopFirstOk = true
for (const set of H.shopSets().filter((x) => x.ready)) {
  for (let seed = 1; seed <= 25; seed++) {
    const s1 = P.buildSession(set.words, { size: 6, seed }), s2 = P.buildSession(set.words, { size: 6, seed })
    const q1 = P.buildQuiz(s1, pool, seed), q2 = P.buildQuiz(s2, pool, seed)
    if (JSON.stringify([s1, q1]) !== JSON.stringify([s2, q2])) detOk = false
    if (s1.length !== Math.min(6, set.words.length) || new Set(s1.map((w) => w.id)).size !== s1.length) detOk = false
    q1.forEach((q, i) => {
      const w = s1[i]
      if (q.options.length !== 4 || new Set(q.options.map((o) => o.en.toLowerCase())).size !== 4) distinctOk = false
      if (q.options.filter((o) => o.id === q.correctId).length !== 1 || q.correctId !== w.id) onceOk = false
      if (q.options.some((o) => o.id !== w.id && o.en.toLowerCase() === w.en.toLowerCase())) diffOk = false
      const same = q.options.filter((o) => o.id !== w.id && pool.find((p) => p.id === o.id).shop === w.shop).length
      if (set.words.length >= 4 && same < Math.min(3, new Set(set.words.filter((p) => p.id !== w.id).map((p) => p.en.toLowerCase())).size)) shopFirstOk = false
    })
    if (new Set(q1.map((q) => q.options.findIndex((o) => o.id === q.correctId))).size < 2) notConst = false
  }
}
ok(detOk, 'practice: deterministic per seed, session unique + sized')
ok(distinctOk && onceOk && diffOk, 'practice: 4 distinct options, correct exactly once, distractor text != answer')
ok(notConst, 'practice: correct index not constant across a session')
ok(shopFirstOk, 'practice: distractors come from the same shop first')
ok(JSON.stringify(P.buildSession(pool, { size: 6, seed: 1 })) !== JSON.stringify(P.buildSession(pool, { size: 6, seed: 2 })), 'practice: different seeds differ')
ok(P.gradeAnswer({ correctId: 'a' }, 'a') && !P.gradeAnswer({ correctId: 'a' }, 'b'), 'practice: gradeAnswer')
const RES = [{ id: 'a', correct: true }, { id: 'b', correct: false }, { id: 'c', correct: false }, { id: 'b', correct: true }, { id: 'c', correct: false }, { id: 'c', correct: true }]
ok(P.reviewQueue(RES).join() === 'b,c' && P.reviewQueue([{ id: 'x', correct: true }]).length === 0, 'practice: reviewQueue first-wrong order')
ok(P.reviewNext(['b', 'c'], true).join() === 'c' && P.reviewNext(['b', 'c'], false).join() === 'c,b' && P.reviewNext(['b'], true).length === 0 && P.reviewNext(['b'], false).join() === 'b', 'practice: review loop (right leaves, wrong goes to the back, empty = clear)')
{ const q = ['x', 'y']; const before = q.join(); P.reviewNext(q, false); ok(q.join() === before, 'practice: reviewNext does not mutate') }
const SU = P.summarise(RES)
ok(SU.total === 3 && SU.firstTryCorrect === 1 && SU.needsReview.join() === 'b,c', 'practice: summarise')

const pracSrc = fs.readFileSync(path.join(ROOT, 'src/utils/pictureWords/practice.js'), 'utf8')
ok(!/Math\.random|localStorage|sessionStorage|fetch\(|from 'react'|document\.|window\./.test(pracSrc), 'practice.js is pure (no random/storage/network/DOM)')

// ---- source pins: data module
const FORBID = /fetch\(|supabase|\/api\/|grantReward|XMLHttpRequest/
const dataSrc = fs.readFileSync(path.join(ROOT, 'src/data/pictureWords/index.js'), 'utf8')
ok(!FORBID.test(dataSrc), 'data module has no fetch/supabase/api/grantReward')
ok(!/localStorage|from 'react'/.test(dataSrc), 'data module is pure (no storage/React)')

// ---- isolation: only the admin panel + the practice screen (and the data dir) may reference assets/pictureWords
const importers = importersOf('assets/pictureWords')
ok(importers.every((f) => f === 'src/components/admin/PictureWordReviewPanel.jsx' || f === 'src/components/pictureWords/pictureImg.jsx'), `assets/pictureWords referenced only by the panel + the shared picture module: ${importers.join(', ')}`)
const dataImporters = importersOf('data/pictureWords')
ok(dataImporters.every((f) => f === 'src/components/admin/PictureWordReviewPanel.jsx' || f.startsWith('src/components/pictureWords/') || f.startsWith('src/utils/pictureWords/') || f.startsWith('src/data/pictureWords/')), `data/pictureWords imported only by admin panel, src/components/pictureWords/, src/utils/pictureWords/, data dir: ${dataImporters.join(', ')}`)

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

// ---- 그림 검토 (read-only review view)
const RQ = H.reviewQueue()
ok(RQ.length === 119 && JSON.stringify(RQ) === JSON.stringify(E.filter((e) => e.autoLink)), 'reviewQueue = the 119 autoLink entries')
ok(RQ.every((e) => H.reviewStatus(e) === 'needs-review'), 'reviewQueue: all needs-review today')
ok(H.reviewStatus({ decision: 'approve' }) === 'approved' && H.reviewStatus({ decision: 'exclude' }) === 'rejected' && H.reviewStatus({ decision: null }) === 'needs-review', 'reviewStatus fixtures')
const tabSrc = panel.slice(panel.indexOf('function PictureReviewTab'), panel.indexOf('export default function'))
ok(tabSrc.length > 100 && tabSrc.includes('pwr-pic-readonly'), 'PictureReviewTab has the read-only notice')
ok(!/onSave|saveDecisions|localStorage|sessionStorage|fetch\(/.test(tabSrc), 'PictureReviewTab: no save / storage / network')
ok(!/pwr-pic-approve|pwr-pic-reject|>승인<\/button>|>반려<\/button>/.test(tabSrc) && (tabSrc.match(/<button/g) || []).length === 1 && tabSrc.includes('pwr-pic-f-${v}'), 'PictureReviewTab: only the filter chip button, no approve/reject controls')
ok(admin.includes("'picturereview'") && admin.includes('initialTab="pictures"'), 'AdminScreen: 그림 검토 menu entry opens the panel on the pictures tab')

// ---- practice screen source pins (249차)
const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8')
ok(!/data\/pictureWords|assets\/pictureWords/.test(app), 'App.jsx imports neither the data nor the assets (only the lazy screen)')
ok(/const PictureWordPractice = React\.lazy\(\(\) => import\('\.\/components\/pictureWords\/PictureWordPractice'\)\)/.test(app), 'App lazy-loads the practice screen')
ok(app.includes('const pictureWordsEnabled = isTownWorldTester(studentId)'), 'gate = isTownWorldTester(studentId), no new flag')
ok(/if \(!pictureWordsEnabled && screen === 'pictureWords'\) setScreen\('dashboard'\)/.test(app), 'guard effect sends non-testers back to the dashboard')
ok(/pictureWordsEnabled && screen === 'pictureWords' && \(\s*<React\.Suspense/.test(app), 'screen rendered only for testers, under Suspense')
ok(app.includes("screen !== 'pictureWords' && screen !== 'unit'"), 'SpeedBtn excluded on the practice screen')
const dash = fs.readFileSync(path.join(ROOT, 'src/components/Dashboard.jsx'), 'utf8'), home = fs.readFileSync(path.join(ROOT, 'src/components/StudentHome.jsx'), 'utf8')
ok(/onGoPictureWords && \(\s*<button[^>]*data-testid="dash-picture-words"/.test(dash) && dash.indexOf('dash-town-world') < dash.indexOf('dash-picture-words'), 'Dashboard button only with prop, after the town button')
ok(/onGoPictureWords && \(\s*<button[^>]*data-testid="student-home-picture-words"/.test(home) && home.indexOf('student-home-town-world') < home.indexOf('student-home-picture-words'), 'StudentHome button only with prop, after the town button')
const scr = fs.readFileSync(path.join(ROOT, 'src/components/pictureWords/PictureWordPractice.jsx'), 'utf8')
ok(!/fetch\(|supabase|\/api\/|localStorage|sessionStorage|grantReward|markPronunciationOk|addStars|XMLHttpRequest|sendBeacon|trackEvent|productEvents/.test(scr), 'screen: no network/storage/reward/analytics')
ok(!/data-correct|data-answer|data-right/.test(scr), 'screen: no data-correct/data-answer attributes')
const shared = fs.readFileSync(path.join(ROOT, 'src/components/pictureWords/pictureImg.jsx'), 'utf8')
ok(/alt="그림"/.test(shared) && !/alt=\{/.test(shared + scr) && !/<img/.test(scr) && scr.includes('testid="pwp-picture"'), 'screen: img alt is the literal "그림" (264차: the shared GamePicture renders it)')
ok(/useEffect\(\(\) => stopSpeaking, \[\]\)/.test(scr), 'screen: stopSpeaking on unmount')
ok(/\{answered && \(\s*<div data-testid="pwp-feedback"[\s\S]*?<WordText word=\{word\} \/>[\s\S]*?<ListenBtn word=\{word\} \/>/.test(scr), 'quiz: feedback (word, meaning, listen) is conditionally mounted after answering')
const quizCard = scr.slice(scr.indexOf('function QuizCard'), scr.indexOf('function Session'))
const beforeAnswer = quizCard.slice(0, quizCard.indexOf('{answered && ('))
ok(!/WordText|ListenBtn|pwp-word|pwp-ko|pwp-listen|\.ko/.test(beforeAnswer), 'quiz: nothing before the answered-conditional renders word/meaning/listen')
ok(/data-testid=\{`pwp-opt-\$\{k\}`\}/.test(scr), 'quiz: positional option testids')
ok(!/hidden|invisible|opacity-0|sr-only|display:\s*none/.test(quizCard), 'quiz: no CSS-hide tricks (conditional mount only)')
for (const id of ['pwp-root', 'pwp-set-', 'pwp-picture', 'pwp-word', 'pwp-ko', 'pwp-listen', 'pwp-next', 'pwp-prev', 'pwp-rec', 'pwp-card', 'pwp-progress', 'pwp-said-mark', 'pwp-end', 'pwp-go-test', 'pwp-skip', 'pwp-start-practice-', 'pwp-start-test-', 'pwp-feedback', 'pwp-review-card', 'pwp-summary', 'pwp-summary-first-try', 'pwp-again', 'pwp-other-set', 'pwp-exit']) ok(scr.includes(id), `screen testid ${id}`)
ok(scr.includes('useLocalRecorder') && scr.includes('RecorderControls') && /playEn\(/.test(scr) && /playWordAudio\(null/.test(shared), 'screen reuses recorder + playWordAudio (en-GB, via the shared playEn)')

// ---- 251차: one card per word (listen + recorder together), test mode, privacy pins
const cardSrc = scr.slice(scr.indexOf('function PracticeCards'), scr.indexOf('function QuizCard'))
ok(/<ListenBtn word=\{w\} \/>[\s\S]*<RecorderControls rec=\{rec\} prefix="pwp-rec" labels=\{PICTURE_REC_LABELS\}/.test(cardSrc) && /pwp-picture|<Picture word=\{w\}/.test(cardSrc) && /<WordText word=\{w\}/.test(cardSrc), 'card: picture + word/meaning + listen + recorder mount together on one card')
ok(/const rec = useLocalRecorder\(\)/.test(cardSrc) && /import useLocalRecorder from '\.\.\/\.\.\/hooks\/useLocalRecorder'/.test(scr), 'card: recorder comes from the shared useLocalRecorder hook')
ok(/rec\.reset\('RESET'\)/.test(cardSrc) && /discard\.current = true; rec\.stop\(\)/.test(cardSrc), 'card: recorder is reset on every word change (a running recording is stopped, then dropped)')
ok(!/disabled=\{[^}]*(status|rec\.st)/.test(cardSrc.slice(cardSrc.indexOf('pwp-prev'))), 'card: next/prev are never disabled by recorder state')
const labels = fs.readFileSync(path.join(ROOT, 'src/components/pictureWords/recLabels.js'), 'utf8')
ok(['🎤 따라 말하기', '⏹ 녹음 끝내기', '▶️ 내 목소리 듣기', '🔄 다시 말하기', '녹음 완료'].every((t) => labels.includes(t)) && scr.includes('🔊 발음 듣기') && scr.includes('➡️ 다음 단어') && scr.includes('말해 봤어요') && scr.includes('녹음 중… '), 'card: required Korean labels (own labels object in the pictureWords folder)')
ok(/import \{ RecorderControls \} from '\.\.\/SpeakingPracticeItem'/.test(scr) && !/PARTNER_REC_LABELS|SpeakingPracticeItem'.*REC_LABELS/.test(scr), 'card: shared label constants are not used or edited')
const pwDirs = [path.join(ROOT, 'src/components/pictureWords'), path.join(ROOT, 'src/utils/pictureWords')]
const pwSrc = pwDirs.flatMap((d) => walk(d)).filter((f) => /\.(jsx?|mjs)$/.test(f)).map((f) => [rel(f), fs.readFileSync(f, 'utf8')])
const SFX_FILE = 'src/utils/pictureWords/sfx.js' // 252차: the one file allowed a device-preference localStorage key and a Web Audio AudioContext (output only, never input)
const NOIO = /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|supabase|\/api\/|localStorage|sessionStorage|grantReward|markPronunciationOk|addStars|trackEvent|productEvents/
const noio = (f, t) => (f === SFX_FILE ? !new RegExp(NOIO.source.replace('|localStorage|sessionStorage', '|sessionStorage')).test(t) : !NOIO.test(t))
ok(pwSrc.every(([f, t]) => noio(f, t)), `pictureWords components + utils: no network/storage/reward calls (${pwSrc.filter(([f, t]) => !noio(f, t)).map(([f]) => f).join()})`)
ok(pwSrc.every(([f, t]) => !(f === SFX_FILE ? /MediaRecorder|getUserMedia|new Audio\(|SpeechRecognition|transcribe/ : /MediaRecorder|getUserMedia|AudioContext|new Audio\(|SpeechRecognition|transcribe/).test(t)), 'pictureWords folders do not touch MediaRecorder/getUserMedia/STT directly (only via the shared hook)')
ok(pwSrc.every(([, t]) => !/점수|score|정확도|발음 평가/i.test(t.replace(/\/\/.*$/gm, ''))), 'pictureWords folders: no score / 점수 UI text')
const quizBefore = (() => { const q = scr.slice(scr.indexOf('function QuizCard'), scr.indexOf('function Session')); return q.slice(0, q.indexOf('{answered && (')) })()
ok(!/RecorderControls|useLocalRecorder|PracticeCards|pwp-rec/.test(quizBefore) && !/RecorderControls|useLocalRecorder/.test(scr.slice(scr.indexOf('function QuizCard'), scr.indexOf('function Session'))), 'test question: word/meaning/listen/recorder not mounted before the answer (and the question never mounts a recorder)')
ok(/<PracticeCards key=\{`\$\{rw\.id\}-\$\{rev\.round\}`\} words=\{\[rw\]\} single/.test(scr), 'review: wrong word gets the practice card (with recorder) again')
ok(/data-testid=\{`pwp-start-practice-\$\{s\.id\}`\}/.test(scr) && /data-testid=\{`pwp-start-test-\$\{s\.id\}`\}/.test(scr), 'set picker: practice + test buttons per set')
ok(/shopSets\(\)\.map/.test(scr) && /LEVELS\.filter\(\(l\) => l\.enabled\)\.map/.test(scr) && /wordsForLevel\(l\.id\)/.test(scr), 'sets = shop sets + enabled levels, built from the learnable-only helpers')
ok(!/pendingWords|PICTURE_WORDS|pictureWords\.json/.test(scr), 'screen never reads pending / raw entries')
const phon = H.LEVELS.find((l) => l.id === 'phonics').labelKo
ok(phon === 'Phonics — 짧고 쉬운 단어' && !/소리|순서|단모음|장모음|sound|order/i.test(phon), 'Phonics label carries no sound-order claim')
ok(H.wordsForLevel('phonics').every((w) => H.learnableWords().some((l) => l.id === w.id)) && H.wordsForLevel('conversation').every((w) => H.learnableWords().some((l) => l.id === w.id)), 'level sets only contain learnable words')

console.log(fail ? `FAIL ${fail}/${n}` : `PASS ${n}/${n} picture-word checks`)
process.exit(fail ? 1 : 0)
