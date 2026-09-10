// scripts/testSubmitEntranceDiagnostics.mjs
//
// 2026-09-11 — 입실시험 오답 진단 필드(input/expected/direction/wordId) 저장
// 회귀. Kinney 사고 후속: entrance_test_results.missed_words가 지금까지
// [{word, meaning}]만 저장해서, 학생이 실제로 무엇을 입력했는지 어디에도
// 남지 않아 오답 신고를 재현/진단할 방법이 없었다. api/submit-entrance-
// result.js가 서버 재채점 직후 조립하는 questions/inputs를 그대로 활용해
// 틀린 문제에 한해서만(정답 문제는 절대 저장 안 함) 최소 진단 필드를 함께
// 저장한다 — 전체 이벤트 로그도, 정답 노출도, 여기 이미 있는 것 이상의
// PII도 추가하지 않는다.
//
// 하네스 방식: scripts/testHardDeleteGuard.mjs와 동일한 esbuild 번들 +
// 인메모리 가짜 @supabase/supabase-js 패턴의 독립 복제본(그 파일은 다른
// 회귀 스위트 소유이므로 import/수정하지 않는다 — 파일당 소유권 원칙).
// 네트워크 0, 실제 Supabase 접촉 0.
//
// 규칙 15(FAIL-first) — 이 테스트는 구현 전(missed_words가 result.missed를
// 그대로 쓰던 코드)에서 실행하면 진단 필드(input/expected/direction/
// wordId)를 확인하는 단언들이 반드시 FAIL한다(실측 기록은 handoff 보고
// 참고). 구현 후에는 전부 PASS해야 한다.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

process.env.SUPABASE_URL = 'https://fake.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

// ── 인메모리 가짜 supabase ────────────────────────────────────────────────
const fakePath = path.join(TMP, 'fakeSupabaseForSubmitEntranceDiagnostics.mjs')
fs.writeFileSync(fakePath, `
export const __db = {
  entrance_tests: [], entrance_test_results: [],
}
export const __upserts = [] // entrance_test_results.upsert()로 넘어온 원본 payload 순서대로
export const __missingTables = new Set()

export function __reset() {
  for (const k of Object.keys(__db)) __db[k] = []
  __upserts.length = 0
  __missingTables.clear()
}

function matches(row, filters) {
  return filters.every(([kind, col, v]) => {
    if (kind === 'eq') return row[col] === v
    return true
  })
}

function makeQuery(table) {
  const filters = []
  let mode = 'select'
  let upsertPayload = null
  let cached = null

  function run() {
    if (__missingTables.has(table)) {
      return { data: null, error: { code: '42P01', message: 'relation "' + table + '" does not exist' } }
    }
    const rows = __db[table] || (__db[table] = [])
    if (mode === 'upsert') {
      __upserts.push(upsertPayload)
      rows.push({ ...upsertPayload })
      return { data: [{ ...upsertPayload }], error: null }
    }
    const filtered = rows.filter((r) => matches(r, filters))
    return { data: filtered.map((r) => ({ ...r })), error: null }
  }
  function runOnce() { if (cached === null) cached = run(); return cached }

  return {
    select(_cols) { return this },
    eq(c, v) { filters.push(['eq', c, v]); return this },
    upsert(payload, _opts) { mode = 'upsert'; upsertPayload = payload; return this },
    then(resolve) { resolve(runOnce()) },
    maybeSingle() { const r = runOnce(); return Promise.resolve({ data: (r.data && r.data[0]) || null, error: r.error }) },
    single() { const r = runOnce(); return Promise.resolve({ data: (r.data && r.data[0]) || null, error: r.error }) },
  }
}
export function createClient() { return { from: (t) => makeQuery(t) } }
`, 'utf8')
const fakeUrl = pathToFileURL(fakePath).href

const outfile = path.join(TMP, 'submitEntranceDiagnostics.bundle.mjs')
await esbuild.build({
  entryPoints: ['api/submit-entrance-result.js'],
  bundle: true, format: 'esm', platform: 'node', outfile,
  plugins: [{
    name: 'fake-deps',
    setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: fakeUrl, external: true }))
    },
  }],
})
const handler = (await import(pathToFileURL(outfile).href + '?t=' + Date.now())).default
const fake = await import(fakeUrl)
const { summarizeClassResults } = await import(pathToFileURL(path.resolve('src/utils/entranceTest.js')).href)

function callHandler(body) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 0, body: null,
      status(c) { this.statusCode = c; return this },
      json(b) { this.body = b; resolve({ statusCode: this.statusCode, body: b }) },
    }
    handler({ method: 'POST', body, headers: {} }, res)
  })
}

let failures = 0, asserted = 0
function check(label, cond, detail) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++ }
}

const TEST_ID = '70000000-0000-4000-8000-000000000001'
const SID = (n) => `80000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const WORDS = [
  { word: 'horror movie', meaning: '공포 영화' },
  { word: 'enjoy', meaning: '즐기다' },
  { word: 'patient', meaning: '참을성 있는, 환자' },
]

function seedTest() {
  fake.__reset()
  fake.__db.entrance_tests.push({
    id: TEST_ID, class_id: 'c1', status: 'active', direction: 'mixed',
    question_count: 3, words: WORDS,
  })
}

console.log('\n=== (1) 3문제 중 1개 오답(kr2en, 이중공백) — score/total + 진단 필드 ===')
let case1
{
  seedTest()
  const answers = [
    { word: 'horror movie', direction: 'kr2en', input: 'horror  movie' },
    { word: 'enjoy', direction: 'en2kr', input: '즐기다' },
    { word: 'patient', direction: 'kr2en', input: 'patient' },
  ]
  const r = await callHandler({ testId: TEST_ID, studentId: SID(1), answers })
  case1 = r
  check('요청 자체는 성공(ok !== false)', r.body?.ok !== false, JSON.stringify(r.body))
  const up = fake.__upserts[fake.__upserts.length - 1]
  check('upsert score === 2', up?.score === 2, JSON.stringify(up))
  check('upsert total === 3', up?.total === 3, JSON.stringify(up))
  check('missed_words.length === 1', Array.isArray(up?.missed_words) && up.missed_words.length === 1, JSON.stringify(up?.missed_words))
  const entry = up?.missed_words?.[0] || {}
  check('entry.word === "horror movie"(기존 필드 보존)', entry.word === 'horror movie')
  check('entry.meaning === "공포 영화"(기존 필드 보존)', entry.meaning === '공포 영화')
  check('entry.input이 입력 원문 그대로(이중공백 보존, 정규화 없음)', entry.input === 'horror  movie', JSON.stringify(entry))
  check('entry.expected === "horror movie"(kr2en 정답은 영어 단어)', entry.expected === 'horror movie', JSON.stringify(entry))
  check('entry.direction === "kr2en"', entry.direction === 'kr2en')
  check(`'wordId' in entry && entry.wordId === null`, 'wordId' in entry && entry.wordId === null, JSON.stringify(entry))
}

console.log('\n=== (2) en2kr 오답 — expected는 meaning, direction en2kr ===')
{
  seedTest()
  const answers = [
    { word: 'horror movie', direction: 'kr2en', input: 'horror movie' },
    { word: 'enjoy', direction: 'en2kr', input: '즐기다' },
    { word: 'patient', direction: 'en2kr', input: '완전히 틀린 답' },
  ]
  const r = await callHandler({ testId: TEST_ID, studentId: SID(2), answers })
  const up = fake.__upserts[fake.__upserts.length - 1]
  check('score === 2', up?.score === 2, JSON.stringify(up))
  check('missed_words.length === 1', up?.missed_words?.length === 1, JSON.stringify(up?.missed_words))
  const entry = up?.missed_words?.[0] || {}
  check('entry.word === "patient"', entry.word === 'patient')
  check('entry.expected === meaning("참을성 있는, 환자")', entry.expected === '참을성 있는, 환자', JSON.stringify(entry))
  check('entry.direction === "en2kr"', entry.direction === 'en2kr')
  check('entry.input === "완전히 틀린 답"(원문 그대로)', entry.input === '완전히 틀린 답', JSON.stringify(entry))
}

console.log('\n=== (3) 전부 정답 — missed_words는 빈 배열([]) ===')
{
  seedTest()
  const answers = [
    { word: 'horror movie', direction: 'kr2en', input: 'horror movie' },
    { word: 'enjoy', direction: 'en2kr', input: '즐기다' },
    { word: 'patient', direction: 'kr2en', input: 'patient' },
  ]
  const r = await callHandler({ testId: TEST_ID, studentId: SID(3), answers })
  const up = fake.__upserts[fake.__upserts.length - 1]
  check('score === 3(전부 정답)', up?.score === 3, JSON.stringify(up))
  check('missed_words가 빈 배열([])로 deep-equal', Array.isArray(up?.missed_words) && up.missed_words.length === 0, JSON.stringify(up?.missed_words))
}

console.log('\n=== (4) HTTP 응답 missed는 word/meaning 키만(응답 스키마 불변) ===')
{
  check('case1 응답에 missed 배열 존재', Array.isArray(case1?.body?.missed))
  const respEntry = case1?.body?.missed?.[0] || {}
  const keys = Object.keys(respEntry).sort()
  check('응답 missed[0] 키가 정확히 [meaning, word] (진단 필드 미노출)', JSON.stringify(keys) === JSON.stringify(['meaning', 'word']), JSON.stringify(respEntry))
  check('응답 score/total 그대로(2/3)', case1.body.score === 2 && case1.body.total === 3, JSON.stringify(case1.body))
}

console.log('\n=== (5) 500자 입력도 원문 그대로 저장(우리가 추가로 자르지 않음) ===')
{
  seedTest()
  const longInput = 'x'.repeat(500)
  const answers = [
    { word: 'horror movie', direction: 'kr2en', input: longInput },
    { word: 'enjoy', direction: 'en2kr', input: '즐기다' },
    { word: 'patient', direction: 'kr2en', input: 'patient' },
  ]
  const r = await callHandler({ testId: TEST_ID, studentId: SID(5), answers })
  const up = fake.__upserts[fake.__upserts.length - 1]
  const entry = (up?.missed_words || []).find((m) => m.word === 'horror movie') || {}
  check('500자 입력이 길이/내용 그대로 보존(추가 절단 없음)', entry.input === longInput && entry.input.length === 500, 'len=' + (entry.input || '').length)
}

console.log('\n=== (6) summarizeClassResults — 진단 필드가 섞여도 mostMissed/avgAccuracy 불변 ===')
{
  const plainRows = [
    { score: 2, total: 3, missedWords: [{ word: 'horror movie', meaning: '공포 영화' }] },
    { score: 1, total: 3, missedWords: [{ word: 'horror movie', meaning: '공포 영화' }, { word: 'patient', meaning: '참을성 있는, 환자' }] },
  ]
  const enrichedRows = [
    { score: 2, total: 3, missedWords: [{ word: 'horror movie', meaning: '공포 영화', input: 'x', expected: 'horror movie', direction: 'kr2en', wordId: null }] },
    { score: 1, total: 3, missedWords: [
      { word: 'horror movie', meaning: '공포 영화', input: 'y', expected: 'horror movie', direction: 'kr2en', wordId: null },
      { word: 'patient', meaning: '참을성 있는, 환자', input: 'z', expected: '참을성 있는, 환자', direction: 'en2kr', wordId: null },
    ] },
  ]
  const plainSummary = summarizeClassResults(plainRows)
  const enrichedSummary = summarizeClassResults(enrichedRows)
  check('mostMissed 동일(진단 필드가 집계를 흔들지 않음)', JSON.stringify(plainSummary.mostMissed) === JSON.stringify(enrichedSummary.mostMissed), JSON.stringify({ plainSummary, enrichedSummary }))
  check('avgAccuracy 동일', plainSummary.avgAccuracy === enrichedSummary.avgAccuracy)
  check('participants 동일', plainSummary.participants === enrichedSummary.participants)
}

console.log('\n=== (7) 정적 검사 — EntranceTest.jsx는 오답 렌더에 word/meaning만 사용 ===')
{
  const src = fs.readFileSync(path.resolve('src/components/EntranceTest.jsx'), 'utf8').replace(/\r\n/g, '\n')
  check('{m.word} 렌더 존재', /\{m\.word\}/.test(src))
  check('{m.meaning} 렌더 존재', /\{m\.meaning\}/.test(src))
  check('m.input/m.expected/m.direction/m.wordId 참조 없음(신규 필드 미소비)', !/m\.(input|expected|direction|wordId)\b/.test(src))
}

console.log('\n=== (8) 정적 검사 — api 채점 경로/응답 계약 무변경 ===')
{
  const src = fs.readFileSync(path.resolve('api/submit-entrance-result.js'), 'utf8').replace(/\r\n/g, '\n')
  check('computeTestResult(questions, inputs) 호출 그대로 유지', /computeTestResult\(questions,\s*inputs\)/.test(src))
  check('응답이 result.missed를 그대로 사용(넓히지 않음)', /missed:\s*result\.missed/.test(src))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS')
await new Promise((r) => setTimeout(r, 300))
process.exit(0)
