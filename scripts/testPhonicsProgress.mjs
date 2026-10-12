// PAUL PHONICS learning-progress checks (257차): the pure views on hand-computed fixtures, the FICTIONAL sample dataset, the image-candidate isolation pin, source pins for the preview screens and the un-run SQL draft.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let fail = 0, n = 0
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m) } }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}\n   got      ${JSON.stringify(a)}\n   expected ${JSON.stringify(b)}`)
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(ROOT, p))

const P = await import('../src/utils/phonics/progress.js')
const S = await import('../src/data/phonics/sampleProgress.js')
const S2 = await import('../src/data/phonics/sampleProgress.js?again')
const C = await import('../src/data/phonics/curriculum.js')
const D = await import('../src/data/phonics/phonicsWords.js')

// ---- hand-built fixtures
const att = (at, ph, correct, bookId, unitId, itemId, step = 'bubble') => ({ v: 1, studentId: 'fx', gameId: 'bubble', bookId, unitId, step, targetPhonemes: [ph], itemId, correct, retries: correct ? 0 : 1, completed: true, at })
const test = (at, bookId, unitId, score, total) => ({ studentId: 'fx', bookId, unitId, unitTest: { score, total }, at })
const F1 = [
  att(1, 'æ', true, 'b1', 'u1', 'word:hat'), att(2, 'æ', false, 'b1', 'u1', 'word:hat'), att(3, 'æ', false, 'b1', 'u1', 'word:hat'),
  att(4, 'æ', true, 'b1', 'u1', 'word:map'), att(5, 'e', false, 'b1', 'u2', 'word:bed'),
  test(6, 'b2', 'u1', 3, 5), test(8, 'b2', 'u1', 4, 5),
]
const SHUFFLED = [F1[4], F1[2], F1[6], F1[0], F1[5], F1[3], F1[1]]

const bp = P.bookProgress(F1)
eq(bp.map((b) => [b.bookId, b.started, b.completed, b.total, b.percent]), [['b1', 2, 1, 5, 20], ['b2', 1, 1, 7, 14], ['b3', 0, 0, 6, 0], ['b4', 0, 0, 11, 0], ['b5', 0, 0, 14, 0]], 'bookProgress: Book 1 unit with 3+ finished items and Book 2 unit with a test count as completed')
eq(P.bookProgress([]).map((b) => b.completed), [0, 0, 0, 0, 0], 'bookProgress: no records -> 0')
eq(P.unitTestResults(F1), [{ bookId: 'b2', unitId: 'u1', score: 4, total: 5, percent: 80, at: 8, tries: 2 }], 'unitTestResults: latest test per unit with the number of tries')
eq(P.weakPhonemes(F1), [{ phoneme: 'æ', attempts: 4, wrong: 2, rate: 50 }], 'weakPhonemes: /æ/ 4 attempts, 2 wrong = 50 %; /e/ has only 1 attempt')
eq(P.weakPhonemes(F1, { minAttempts: 1 }).map((w) => w.phoneme), ['æ'], 'weakPhonemes minAttempts 1 still needs wrong >= 2 -> only æ')
const X = [false, true, true, true, false].map((c, i) => att(i + 1, 'x', c, 'b1', 'u1', 'a'))
eq(P.weakPhonemes(X).map((w) => [w.phoneme, w.rate]), [['x', 40]], 'weakPhonemes: 2 wrong of 5 = 40 % IS weak')
eq(P.weakPhonemes([...X, att(6, 'x', true, 'b1', 'u1', 'a')]), [], 'weakPhonemes: 2 wrong of 6 = 33 % is not')
eq(P.reviewWords(F1).map((w) => [w.word, w.attempts, w.wrong, w.lastWrong]), [['hat', 3, 2, true], ['bed', 1, 1, true]], 'reviewWords: wrong twice, or wrong in the latest attempt')
eq(P.recentActivity(F1, 2).map((r) => [r.kind, r.at, r.word || r.score]), [['test', 8, 4], ['test', 6, 3]], 'recentActivity: newest first, tests included')
eq(P.recentActivity(F1.filter((r) => !r.unitTest), 2).map((r) => [r.at, r.word, r.correct]), [[5, 'bed', false], [4, 'map', true]], 'recentActivity attempts only')
eq(P.improvement(F1), [{ phoneme: 'æ', firstRate: 50, secondRate: 50, delta: 0, afterReview: false }], 'improvement: only sounds with >= 4 attempts, halves 50/50')
const IMP = [att(1, 'e', false, 'b1', 'u2', 'word:bed'), att(2, 'e', false, 'b1', 'u2', 'word:bed'), att(3, 'e', true, 'b1', 'u2', 'word:bed', 'review'), att(4, 'e', true, 'b1', 'u2', 'word:bed', 'review')]
eq(P.improvement(IMP), [{ phoneme: 'e', firstRate: 100, secondRate: 0, delta: 100, afterReview: true }], 'improvement: after a review the error rate fell 100 -> 0')
eq(P.recommendations(F1), ['/æ/ 소리를 다시 들어 보세요 (Book 1 Unit 1에서 많이 틀렸어요).'], 'recommendations: weak sound with the unit where it was missed most')
eq(P.recommendations([]), ['아직 학습 기록이 없어요. Book 1 Unit 1부터 시작해 보세요.'], 'recommendations: empty history')
eq(P.recommendations([att(1, 'æ', true, 'b1', 'u1', 'word:hat'), test(2, 'b2', 'u1', 2, 5)]), ['Book 2 Unit 1 시험 점수가 2/5예요. 한 번 더 연습한 뒤 다시 풀어 보세요.'], 'recommendations: low test score')
const NAME = { id: 'fx', name: '테스트' }
eq(P.parentSummary(NAME, F1), '테스트의 학습 현황이에요. 전체 43개 Unit 중 3개를 시작했고 2개를 마쳤어요. 게임 5번 중 한 번에 맞힌 것은 2번(40%)이에요. 가장 최근 Unit 시험은 Book 2 Unit 1 4/5점이에요. 반복해서 틀린 소리는 /æ/예요.', 'parentSummary: counts only')
ok(P.parentSummary(NAME, IMP).includes('복습 뒤 /e/ 소리는 틀린 비율이 줄었어요.'), 'parentSummary: improvement after review mentioned')
ok(P.parentSummary(NAME, []).split('. ').length <= 5 && P.parentSummary(NAME, F1).split('. ').length <= 5, 'parentSummary: at most 5 sentences')
const CLS = [{ id: 's1', name: 'one', records: F1 }, { id: 's2', name: 'two', records: [] }]
eq(P.classOverview(CLS), [{ id: 's1', name: 'one', completed: 2, percent: 5, latestTest: { bookId: 'b2', unitId: 'u1', score: 4, total: 5 }, weakest: ['æ'] }, { id: 's2', name: 'two', completed: 0, percent: 0, latestTest: null, weakest: [] }], 'classOverview')
eq(P.classWeakPhonemes(CLS), [{ phoneme: 'æ', students: 1, attempts: 4, wrong: 2, rate: 50 }], 'classWeakPhonemes')
eq([P.bookProgress(SHUFFLED), P.weakPhonemes(SHUFFLED), P.reviewWords(SHUFFLED), P.unitTestResults(SHUFFLED)], [P.bookProgress(F1), P.weakPhonemes(F1), P.reviewWords(F1), P.unitTestResults(F1)], 'input order does not matter (sorted by at)')
const before = JSON.stringify(F1)
P.bookProgress(F1); P.reviewWords(F1); P.improvement(F1)
ok(JSON.stringify(F1) === before, 'views do not mutate their input')

// ---- the FICTIONAL sample
const ST = S.SAMPLE_STUDENTS
ok(S.SAMPLE_NOTICE_KO === '샘플 데이터 — 실제 학생 기록이 아닙니다', 'sample notice text')
ok(S.SAMPLE_CLASS_NAME === '샘플반' && ST.length === 7, 'class 샘플반 with seven students (G has no records)')
eq(ST.map((s) => s.name), ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((x) => `샘플 학생 ${x}`), 'sample names')
eq(ST.map((s) => s.id), [1, 2, 3, 4, 5, 6, 7].map((x) => `sample-000${x}`), 'sample ids')
ok(ST.every((s) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id) && s.name.startsWith('샘플')), 'no id is UUID-shaped; names start with 샘플')
ok(JSON.stringify(ST) === JSON.stringify(S2.SAMPLE_STUDENTS), 'sample data is deterministic (two imports equal)')
ok(ST.slice(0, 6).every((s) => s.records.length >= 30 && s.records.length <= 80) && ST[6].records.length === 0, `30-80 records each, G none: ${ST.map((s) => s.records.length)}`)
const UNIT_IDS = new Set(C.BOOKS.flatMap((b) => b.units.map((u) => `${b.id}/${u.id}`)))
const PHONEMES = new Set(D.PHONICS_ITEMS.flatMap((i) => i.phonemes))
const ITEM_IDS = new Set(D.PHONICS_ITEMS.map((i) => i.id))
ok(ST.every((s) => s.records.every((r) => UNIT_IDS.has(`${r.bookId}/${r.unitId}`) && r.studentId === s.id && Number.isFinite(r.at))), 'every record: real unit id, own sample id, numeric time')
ok(ST.every((s) => s.records.filter((r) => r.targetPhonemes).every((r) => r.targetPhonemes.every((p) => PHONEMES.has(p)) && ITEM_IDS.has(r.itemId))), 'every attempt: real phoneme and item')
ok(ST.every((s) => s.records.filter((r) => r.unitTest).every((r) => r.unitTest.total > 0 && r.unitTest.score >= 0 && r.unitTest.score <= r.unitTest.total && C.bookById(r.bookId).focus !== 'vowel-recognition')), 'unit tests: valid scores, none in locked Book 1')
const T0 = Date.UTC(2026, 8, 1), T1 = Date.UTC(2026, 11, 31)
ok(ST.every((s) => s.records.every((r) => r.at >= T0 && r.at < T1)), 'times inside the fixed base window')
ok(P.weakPhonemes(ST[2].records).map((w) => w.phoneme).sort().join() === 'ð,θ', 'profile C is weak on /θ/ and /ð/')
ok(['æ', 'e', 'ɪ', 'ɒ', 'ʌ'].filter((p) => P.weakPhonemes(ST[3].records).some((w) => w.phoneme === p)).length >= 3, 'profile D is weak on short vowels')
ok(P.improvement(ST[4].records).some((x) => x.afterReview && x.delta > 0), 'profile E improves after review')
ok(P.bookProgress(ST[5].records).reduce((s, b) => s + b.started, 0) === 2, 'profile F barely started (2 units)')
ok(P.weakPhonemes(ST[0].records).length > 0 && P.reviewWords(ST[0].records).length > 0 && P.unitTestResults(ST[0].records).length > 0, 'sample A has weak sounds, review words and tests to show')
ok(P.bookProgress(ST[0].records).every((b) => b.percent >= 0 && b.percent <= 100), 'percent in range')

// ---- sources: no network / storage in the new pure modules and screens; no real names
const NO_IO = /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|supabase|from ['"][^'"]*\/api\/|localStorage|sessionStorage|Math\.random|Date\.now|new Date\(\)/
for (const f of ['src/utils/phonics/progress.js', 'src/data/phonics/sampleProgress.js', 'src/components/phonics/PhonicsProgress.jsx', 'src/components/admin/PhonicsProgressPanel.jsx']) {
  if (!exists(f)) { ok(false, `${f} missing`); continue }
  ok(!NO_IO.test(read(f)), `${f}: no network, storage, clock or random`)
}

// ---- 260차 progress v2 functions on hand-computed fixtures
const att2 = (at, ph, correct, b, u, itemId) => ({ v: 1, studentId: 'fx', gameId: 'bubble', bookId: b, unitId: u, step: 'bubble', targetPhonemes: [ph], itemId, correct, retries: 0, completed: true, at })
const D1 = 86400000
const F2 = [
  att2(1, 'æ', false, 'b1', 'u1', 'word:hat'), att2(D1 + 1, 'æ', false, 'b1', 'u1', 'word:hat'), att2(D1 + 2, 'æ', false, 'b1', 'u1', 'word:hat'), att2(2 * D1, 'e', false, 'b1', 'u2', 'word:bed'),
  att2(3, 'æ', true, 'b1', 'u1', 'word:map'),
  test(10, 'b2', 'u1', 3, 5), test(20, 'b2', 'u1', 4, 5), test(30, 'b2', 'u2', 2, 5),
]
eq(P.repeatedMisses(F2), [{ itemId: 'word:hat', word: 'hat', sessions: 2, wrong: 3 }], 'repeatedMisses: hat missed on 2 days (3 wrong); bed only 1 day')
const st = Object.fromEntries(P.unitStates(F2).map((x) => [`${x.bookId}/${x.unitId}`, x.state]))
eq([st['b1/u1'], st['b1/u2'], st['b2/u1'], st['b2/u2'], st['b3/u1']], ['done', 'in-progress', 'done', 'needs-review', 'not-started'], 'unitStates: Book 1 u1 done (4 finished items >= 3), in-progress, done (test 4/5), needs-review (2/5 < 60 %), not-started')
eq(P.latestTests(F2, 2).map((t) => [t.unitId, t.score, t.percent]), [['u2', 2, 40], ['u1', 4, 80]], 'latestTests newest first')
const tt = P.testTrend(F2)
eq([tt.overall.delta, tt.overall.first, tt.overall.latest.score, tt.overall.previous.score], [-2, false, 2, 4], 'overall trend: last test 2/5 vs previous 4/5 = -2')
eq(tt.units.map((u) => [u.unitId, u.delta, u.first]), [['u1', 1, false], ['u2', null, true]], 'per-unit trend: b2/u1 +1, b2/u2 first test')
eq(P.testTrend([]), { overall: null, units: [] }, 'trend of no records')
const cls = [{ id: 'x1', name: 'x1', records: F2 }, { id: 'x2', name: 'x2', records: [test(1, 'b2', 'u1', 5, 5), test(2, 'b3', 'u1', 1, 5)] }, { id: 'x3', name: 'x3', records: [] }]
eq(P.bookTestSummary(cls), [{ bookId: 'b2', no: 2, count: 4, avg: 70, min: 40, max: 100 }, { bookId: 'b3', no: 3, count: 1, avg: 20, min: 20, max: 20 }], 'bookTestSummary: b2 = (60+80+40+100)/4 = 70, b3 = 20')
eq(P.phonemeErrorTable(cls).map((x) => [x.phoneme, x.attempts, x.wrong, x.rate, x.students]), [['e', 1, 1, 100, 1], ['æ', 4, 3, 75, 1]], 'phonemeErrorTable sorted by error rate')
const wk = P.studentWeakAreas({ records: F2 })
eq([wk.sounds, wk.units, wk.reason], [['æ'], ['Book 1 Unit 1', 'Book 1 Unit 2'], '/æ/ 3/4번 틀림'], 'studentWeakAreas')
eq(P.studentWeakAreas({ records: [] }), { sounds: [], units: [], reason: '기록 없음' }, 'weak areas of an empty student')
eq([P.emptyState([]).empty, P.emptyState([]).message, P.emptyState(F2)], [true, '아직 학습 기록이 없어요 — 첫 Unit을 시작해 볼까요?', { empty: false, message: null }], 'emptyState')
// sample: G is empty, two students have two tests on one unit, no NaN/Infinity anywhere in the derived views
ok(ST[6].records.length === 0 && P.emptyState(ST[6].records).empty, 'sample G has no records -> empty state')
ok(ST.filter((s) => P.testTrend(s.records).units.some((u) => u.previous)).length >= 2, 'at least two sample students have two tests on the same unit')
const bad = (v) => /NaN|Infinity/.test(JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? 'NaN' : x)))
ok(![...ST.map((s) => s.records), []].some((r) => [P.unitStates(r), P.latestTests(r), P.testTrend(r), P.repeatedMisses(r), P.bookProgress(r), P.recommendations(r), P.studentWeakAreas({ records: r })].some(bad)) && !bad([P.bookTestSummary(ST), P.phonemeErrorTable(ST), P.bookTestSummary([]), P.phonemeErrorTable([])]), 'no NaN/Infinity in any derived view (all samples + empty)')

// ---- 257차 image audit numbers and the candidate isolation
const needed = D.PHONICS_ITEMS.filter((i) => i.image === 'needed')
const CANDS = ['cat', 'tree', 'lamp', 'duck', 'fox', 'tent', 'gate']
const candSrc = read('src/data/phonics/imageCandidates.js')
ok(needed.length === 105, `105 words need an image (got ${needed.length})`)
ok(CANDS.every((w) => needed.some((i) => i.word === w) && new RegExp(`row\\('${w}'`).test(candSrc)), 'the 7 candidate words all still need an image and are listed')
ok((candSrc.match(/row\('/g) || []).length === 7 && needed.length - CANDS.length === 98, '7 candidates, 98 new productions')
const candPaths = [...candSrc.matchAll(/'(\.\.\/\.\.\/assets\/town\/[^']+)'/g)].map((m) => m[1])
ok(candPaths.length === 3 && candPaths.every((p) => exists(`src/${p.slice(6)}`)), 'the 3 non-kit candidates import an existing asset')
const srcPaths = [...candSrc.matchAll(/'(src\/assets\/town\/|town kit: )([^']+)'/g)].map((m) => (m[1] === 'town kit: ' ? 'src/assets/town/kit/' : m[1]) + m[2])
ok(srcPaths.length === 7 && srcPaths.every((p) => exists(p)) && !/import .*town\/kit/.test(candSrc) && (candSrc.match(/row\('\w+', null,/g) || []).length === 4, 'all 7 source files exist; the 4 kit candidates are path-text only (no kit import)')
ok(/학습용 승인 필요/.test(candSrc) && /UNCERTAIN/.test(candSrc) && /MISMATCH/.test(candSrc), 'candidate note and rejected look-alikes recorded')
// ---- 260차 image production priority
const PC = await import('../src/utils/phonics/curriculum.js')
const firstBook = new Map()
for (const b of C.BOOKS) for (const u of b.units) for (const w of PC.unitWords(b.id, u.id)) if (!firstBook.has(w.word)) firstBook.set(w.word, b.no)
const prio = needed.map((i) => [i.word, PC.imagePriority(firstBook.get(i.word))])
ok(prio.every(([w, p]) => firstBook.has(w) && /^P[123]$/.test(p)), 'every needed word has a first Book and P1/P2/P3')
eq([1, 2, 3, 4, 5].map(PC.imagePriority), ['P1', 'P2', 'P3', 'P3', 'P3'], 'imagePriority maps Book 1/2/3-5')
const p1 = prio.filter(([, p]) => p === 'P1').map(([w]) => w)
eq(p1.sort(), needed.filter((i) => firstBook.get(i.word) === 1).map((i) => i.word).sort(), 'P1 = exactly the needed words first appearing in Book 1')
eq(['P1', 'P2', 'P3'].map((k) => prio.filter(([, p]) => p === k).length), [13, 14, 78], 'P1/P2/P3 counts 13/14/78')
const imgDoc = read('docs/design/PHONICS_IMAGE_SPEC_2026-10-11.md')
ok(p1.every((w) => new RegExp(`^- ${w} — [^\x60]`, 'm').test(imgDoc.slice(imgDoc.indexOf('## 우선순위')))), 'the doc appendix has a drawing brief for every P1 word')
// ---- 260차 recording upload preview check
const RU = await import('../src/utils/phonics/recordingUpload.js')
const R1 = (await import('../src/data/phonics/recordings.js')).RECORDINGS[0]
const good = { name: 'ph-01-a.mp3', size: 50000, type: 'audio/mpeg', duration: 1 }
const vu = (o) => RU.validateUpload({ ...good, ...o }, R1)
eq(vu({}), { errors: [], warnings: [], ok: true }, 'valid upload')
ok(!vu({ name: 'notes.txt', type: 'text/plain' }).ok, '.txt is a type error')
ok(!vu({ type: 'video/mp4' }).ok, 'non-audio MIME is an error')
ok(vu({ type: '' }).ok, 'empty MIME is accepted when the extension is allowed')
ok(vu({ name: 'ph-01-a.WAV' }).ok && vu({ name: 'ph-01-a.m4a' }).ok, 'wav (any case) and m4a are allowed')
ok(!vu({ size: 1024 }).ok && !vu({ size: 2047 }).ok && vu({ size: 2048 }).ok, 'size lower bound 2 KB')
ok(vu({ size: 512000 }).ok && !vu({ size: 512001 }).ok, 'size upper bound 500 KB')
ok(!vu({ duration: 0.19 }).ok && vu({ duration: 0.2 }).ok && vu({ duration: 3 }).ok && !vu({ duration: 3.01 }).ok, 'duration bounds 0.2-3.0 s')
eq(vu({ duration: null }).errors, ['재생할 수 없는 파일'], 'unreadable audio')
ok(!vu({ duration: NaN }).ok && vu({ duration: undefined }).ok, 'NaN duration is unreadable; undefined = not read yet')
const wrong = vu({ name: 'my-voice.mp3' })
ok(wrong.ok && wrong.warnings.length === 1 && wrong.warnings[0].includes('ph-01-a.mp3'), 'wrong file name only warns and shows the expected name')
const badUp = vu({ name: 'x.txt', size: 5, duration: null })
ok(badUp.errors.length === 3, 'each error reported')
const upSrc = read('src/utils/phonics/recordingUpload.js')
ok(!/fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB/.test(upSrc), 'recordingUpload.js has no network or storage')
const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]))
const importers = walk('src').filter((f) => /\.(jsx?|mjs)$/.test(f) && f !== 'src/data/phonics/imageCandidates.js' && read(f).includes('imageCandidates'))
eq(importers, ['src/components/admin/PhonicsReviewPanel.jsx'], 'imageCandidates is imported ONLY by the admin review panel')
const upImp = walk('src').filter((f) => /\.(jsx?|mjs)$/.test(f) && read(f).includes('recordingUpload'))
eq(upImp, ['src/components/admin/PhonicsReviewPanel.jsx'], 'recordingUpload is imported ONLY by the admin review panel (not phonics/pictureWords student code)')
const panelSrc = read('src/components/admin/PhonicsReviewPanel.jsx')
ok(!/fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|supabase/.test(panelSrc) && panelSrc.includes('revokeObjectURL') && /RECORDINGS\.map\(\(r\) => \(\{ r, v:/.test(panelSrc), 'review panel: no network/storage, object URLs revoked, 42-row preview built from RECORDINGS')
ok(D.PHONICS_ITEMS.filter((i) => CANDS.includes(i.word)).every((i) => i.image === 'needed' && !i.asset && !i.picture), 'student data: candidate words keep image needed, no asset')
ok(exists('docs/design/PHONICS_IMAGE_SPEC_2026-10-11.md') && read('docs/design/PHONICS_IMAGE_SPEC_2026-10-11.md').includes('98개'), 'image spec doc exists and mentions the 98')

// ---- the SQL draft: never executed, never referenced, nothing destructive
const SQL = read('supabase_v3_51_phonics_progress_DRAFT.sql')
// destructive statements in SQL files are blocked by the repo's PreToolUse hook (CLAUDE.md rule 18) — not re-checked here
ok(/if not exists/i.test(SQL) && /enable row level security/i.test(SQL) && SQL.includes('DRAFT — 실행 금지. 운영자 승인·검토 전.'), 'SQL draft: idempotent, RLS on, DRAFT header')
ok(!/create policy/i.test(SQL), 'SQL draft: no anon policy')
ok(/phonics_attempts/.test(SQL) && /phonics_unit_tests/.test(SQL) && /references public\.students\(id\)/.test(SQL), 'SQL draft: both tables, UUID students FK')
const refs = [...walk('src'), ...walk('api')].filter((f) => /supabase_v3_51|phonics_attempts|phonics_unit_tests/.test(read(f)))
eq(refs, [], 'nothing under src/ or api/ references the SQL draft or its tables')

// ---- preview screens: wired where the contract says, labelled as sample
const PS = read('src/components/phonics/PaulPhonics.jsx'), AS = read('src/components/AdminScreen.jsx')
ok(PS.includes('pph-open-progress') && PS.includes('나의 학습 발달상황 (샘플)'), 'main screen has the sample button')
ok(AS.includes("['phonicsprogress','📈 파닉스 발달 (샘플)']") && AS.includes("React.lazy(() => import('./admin/PhonicsProgressPanel'))"), 'admin tab is lazy and labelled 샘플')
ok(read('src/components/phonics/PhonicsProgress.jsx').includes('SAMPLE_NOTICE_KO') && read('src/components/admin/PhonicsProgressPanel.jsx').includes('SAMPLE_NOTICE_KO'), 'both screens show the sample notice')
ok(!/studentId|studentName|currentStudent/.test(read('src/components/phonics/PhonicsProgress.jsx')), 'the student screen never reads the logged-in student')

// ---- 262차 Book 1 수업 준비: counts from data, per-unit unlock with in-memory fake lists, recorder parity, approved image mapping untouched
{
  const U = await import('../src/utils/phonics/curriculum.js')
  const R = await import('../src/data/phonics/recordings.js')
  const CL = await import('../src/data/phonics/phonemeClips.js')
  const PP = await import('../src/utils/phonics/playPhonemes.js')
  const b1 = C.BOOKS[0]
  const words = b1.units.flatMap((u) => U.unitWords(b1.id, u.id))
  const by = (st) => words.filter((w) => w.image === st)
  eq([b1.units.length, words.length, by('ready').length, by('needed').length, by('not-needed').length], [5, 25, 9, 13, 3], 'Book 1 counts derived from data: 5 units, 25 words = 9 ready + 13 needed + 3 without a picture')
  eq(by('needed').map((w) => w.word).sort(), ['bed', 'box', 'bus', 'cat', 'dog', 'hat', 'lip', 'map', 'mug', 'nut', 'pig', 'pot', 'sun'], 'the 13 Book 1 words that still need a picture')
  eq(R.RECORDINGS.slice(0, 5).map((r) => [r.id, r.fileBase + '.mp3']), [['a', 'ph-01-a.mp3'], ['e', 'ph-02-e.mp3'], ['i', 'ph-03-i.mp3'], ['o', 'ph-04-o.mp3'], ['u', 'ph-05-u.mp3']], 'the 5 short vowels are the first 5 recordings with the documented file names')
  eq(R.RECORDINGS.slice(0, 5).map((r) => r.ipa), b1.units.map((u) => u.targets[0].ipa), 'recording i belongs to Book 1 unit i (the admin Book 1 section relies on this order)')
  ok(Object.keys(R.PHONEME_APPROVALS).length === 0 && R.recordingStatuses([]).slice(0, 5).every((x) => x.status === 'missing'), 'real status today: 5 / 5 missing, no approval')

  // per-unit step 2 unlock: the lists are PARAMETERS (nothing is written to the repo)
  const ap = { approvedBy: 'Teacher', approvedOn: '2026-10-12' }
  const open = (urls, approvals) => b1.units.map((u) => PP.allApproved(C.recordableTargets(u).map((x) => x.ipa), CL.buildClips(urls, approvals)))
  const f = { 'ph-01-a.mp3': 'blob:a' }
  eq(open(f, {}), [false, false, false, false, false], 'unlock: file only -> every unit still locked')
  eq(open({}, { a: ap }), [false, false, false, false, false], 'unlock: approval only -> locked')
  eq(R.validateRecordings([], { a: ap }).map((e) => e.code), ['approval-without-file'], 'approval without a file is a validation error')
  eq(open(f, { a: ap }), [true, false, false, false, false], 'unlock: file AND approval for a -> only Unit 1 opens')
  eq(open({ ...f, 'ph-03-i.mp3': 'blob:i' }, { a: ap, i: { approvedBy: 'Teacher' } }), [true, false, false, false, false], 'unlock: an incomplete approval (no date) does not open its unit')
  eq(open({ ...f, 'ph-03-i.m4a': 'blob:i' }, { a: ap, i: ap }), [true, false, true, false, false], 'unlock: m4a counts too, other units stay locked')
  eq(R.validateRecordings(['ph-01-a.mp3', 'a.mp3', 'ph-02-a.mp3', 'ph-01-a.ogg'], {}).map((e) => e.code), ['unknown-file', 'pairing', 'wrong-extension'], 'bad names / pairing / format are errors')
  eq(R.validateRecordings(['ph-01-a.mp3'], { a: ap }, { 'ph-01-a.mp3': 10 }).map((e) => e.code), ['size'], 'a too-small file is a size error')

  // recorder parity: the picture-word card and the phoneme card use the shared Speaking recorder hook and controls (no forked recorder)
  const pwp = read('src/components/pictureWords/PictureWordPractice.jsx'), pl = read('src/components/phonics/PhonemeListen.jsx')
  // 2026-10-13: the picture-word lesson card draws its own two big buttons (LessonRecorder) on the SAME rec object, status text helper and in-app-browser guard — still no forked recorder logic
  const lr = read('src/components/pictureWords/LessonRecorder.jsx')
  const t2 = (t) => t.includes("import { RecorderControls } from '../SpeakingPracticeItem'") && /<RecorderControls rec=\{rec\}/.test(t)
  ok([pwp, pl].every((t) => t.includes("import useLocalRecorder from '../../hooks/useLocalRecorder'") && /const rec = useLocalRecorder\(\)/.test(t)) && t2(pl) && /<LessonRecorder rec=\{rec\}/.test(pwp) && lr.includes("import { recStatusText } from '../SpeakingPracticeItem'") && lr.includes('isInAppBrowser()') && !/MediaRecorder|getUserMedia/.test(lr + pwp), 'recorder parity: both cards use the shared useLocalRecorder; the phoneme card uses RecorderControls, the lesson card uses LessonRecorder on the same rec object (no forked recorder)')
  ok([...walk('src/components/pictureWords'), ...walk('src/components/phonics')].every((f2) => !/MediaRecorder|getUserMedia/.test(read(f2))), 'no forked recorder in picture-word / phonics components')

  // approved picture mapping untouched: every Book 1 ready word still points at its own approved asset
  ok(by('ready').every((w) => w.asset && w.picture && w.picture.learn === true && w.picture.en.toLowerCase() === w.word), 'Book 1 ready words map to their own learnable picture entries')
  const admin = read('src/components/admin/PhonicsReviewPanel.jsx')
  ok(admin.includes('phr-book1') && admin.includes('phr-b1-unit') && admin.includes('phr-b1-word') && admin.includes('phr-b1-summary') && admin.includes('phr-b1-rec') && !/fetch\(|localStorage|sessionStorage|indexedDB/.test(admin), 'admin Book 1 section exists and adds no network or storage')
}

console.log(`[testPhonicsProgress] ${n - fail}/${n} passed`)
process.exit(fail ? 1 : 0)
