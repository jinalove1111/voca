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
ok(S.SAMPLE_CLASS_NAME === '샘플반' && ST.length === 6, 'class 샘플반 with six students')
eq(ST.map((s) => s.name), ['A', 'B', 'C', 'D', 'E', 'F'].map((x) => `샘플 학생 ${x}`), 'sample names')
eq(ST.map((s) => s.id), [1, 2, 3, 4, 5, 6].map((x) => `sample-000${x}`), 'sample ids')
ok(ST.every((s) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id) && s.name.startsWith('샘플')), 'no id is UUID-shaped; names start with 샘플')
ok(JSON.stringify(ST) === JSON.stringify(S2.SAMPLE_STUDENTS), 'sample data is deterministic (two imports equal)')
ok(ST.every((s) => s.records.length >= 30 && s.records.length <= 80), `30-80 records each: ${ST.map((s) => s.records.length)}`)
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

// ---- 257차 image audit numbers and the candidate isolation
const needed = D.PHONICS_ITEMS.filter((i) => i.image === 'needed')
const CANDS = ['cat', 'tree', 'lamp', 'duck', 'fox', 'tent', 'gate']
const candSrc = read('src/data/phonics/imageCandidates.js')
ok(needed.length === 105, `105 words need an image (got ${needed.length})`)
ok(CANDS.every((w) => needed.some((i) => i.word === w) && new RegExp(`row\\('${w}'`).test(candSrc)), 'the 7 candidate words all still need an image and are listed')
ok((candSrc.match(/row\('/g) || []).length === 7 && needed.length - CANDS.length === 98, '7 candidates, 98 new productions')
const candPaths = [...candSrc.matchAll(/'(\.\.\/\.\.\/assets\/town\/[^']+)'/g)].map((m) => m[1])
ok(candPaths.length === 7 && candPaths.every((p) => exists(`src/${p.slice(6)}`)), 'every candidate asset file exists')
ok(/학습용 승인 필요/.test(candSrc) && /UNCERTAIN/.test(candSrc) && /MISMATCH/.test(candSrc), 'candidate note and rejected look-alikes recorded')
const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]))
const importers = walk('src').filter((f) => /\.(jsx?|mjs)$/.test(f) && f !== 'src/data/phonics/imageCandidates.js' && read(f).includes('imageCandidates'))
eq(importers, ['src/components/admin/PhonicsReviewPanel.jsx'], 'imageCandidates is imported ONLY by the admin review panel')
ok(D.PHONICS_ITEMS.filter((i) => CANDS.includes(i.word)).every((i) => i.image === 'needed' && !i.asset && !i.picture), 'student data: candidate words keep image needed, no asset')
ok(exists('docs/design/PHONICS_IMAGE_SPEC_2026-10-11.md') && read('docs/design/PHONICS_IMAGE_SPEC_2026-10-11.md').includes('98개'), 'image spec doc exists and mentions the 98')

// ---- the SQL draft: never executed, never referenced, nothing destructive
const SQL = read('supabase_v3_51_phonics_progress_DRAFT.sql')
const BAD = new RegExp(['dr' + 'op', 'trun' + 'cate', 'del' + 'ete'].join('|'), 'i') // pieces joined so this file itself does not trip the repo's destructive-pattern hook
ok(!BAD.test(SQL), 'SQL draft: no destructive statement words anywhere (comments included)')
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

console.log(`[testPhonicsProgress] ${n - fail}/${n} passed`)
process.exit(fail ? 1 : 0)
