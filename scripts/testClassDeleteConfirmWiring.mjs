// 2026-09-03 Track 6(야간 자율 작업) 작업 1 — 반 삭제 확인 모달 클라이언트
// 배선(deleteClass) 회귀 테스트.
//
// 배경: 2f63ff2가 배포한 admin-content-write의 class.delete는 학습기록
// (word_status/entrance_test_results/student_class_assignments/
// spelling_review_queue)이 있으면 { ok:false, reason:'has_learning_data',
// counts } (HTTP 200)로 차단하고, payload.force===true일 때만 삭제를
// 강행해 { ok:true, counts, forced:true }를 돌려준다. 이 스위트는
// wordLibrary.js의 deleteClass()가 이 계약을 다음처럼 클라이언트에
// 그대로 배선하는지 검증한다:
//   (a) has_learning_data 응답 → throw하지 않고 { blocked:true, counts }
//       를 반환한다(AdminScreen이 이 값으로 2차 확인 모달을 띄운다).
//   (b) opts.force===true로 호출하면 실제 fetch 요청 payload에
//       force:true가 실려 나간다.
//   (c) ok:true(정상 삭제, counts 전부 0 또는 force로 강행) 응답이면
//       기존과 동일하게 특별한 반환값 없이(undefined) 완료한다 — 이
//       success 경로의 반환 형태는 이번 배선 작업으로 바뀌지 않는다.
//   (d) has_learning_data 이외의 실패 사유(not_authorized/일반 에러)는
//       여전히 throw한다(기존 계약 유지 — 이 배선은 has_learning_data
//       한 가지 사유만 특별 취급).
//
// 네트워크 0 — global.fetch를 이 파일이 완전히 모킹하고, supabaseClient도
// 인메모리 가짜로 external 치환한다(testAssignmentUnitGuards.mjs와 동일한
// esbuild 패턴, 그 파일은 읽기만 하고 이 파일은 독립 복제본).
//
// 규칙 15(FAIL-first) — deleteClass가 opts 인자를 받지 않고 force를 전혀
// 보내지 않는/has_learning_data를 그냥 throw하던 수정 전 코드에서 실행하면
// (a)(b)가 반드시 FAIL한다(구현 전 실제로 이 상태에서 실행해 확인함).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

// ── 인메모리 가짜 supabase(읽기 전용 — deleteClass 자체는 admin-content-write
// 경로에서 supabase를 직접 건드리지 않지만, refreshWordLibrary/_cache 채우기에
// 필요하다) — testAssignmentUnitGuards.mjs의 fakeSupabase와 동일 계약. ────
const fakePath = path.join(TMP, 'fakeSupabaseForClassDeleteConfirmWiring.mjs')
fs.writeFileSync(fakePath, `
export const __db = { classes: [], units: [], words: [], students: [], textbooks: [], class_textbooks: [], student_class_assignments: [], daily_assignments: [] }
export function __reset(ds) { for (const k of Object.keys(__db)) __db[k] = (ds[k] || []).map((r) => ({ ...r })) }
function builder(table) {
  const st = { table, cols: '', filters: [], orders: [], range: null, count: null, head: false, mode: 'select', patch: null, single: null }
  const api = {
    select(c, o) { st.cols = c || ''; st.count = o?.count || null; st.head = !!o?.head; return api },
    order(c, o) { st.orders.push([c, o?.ascending !== false]); return api },
    eq(c, v) { st.filters.push((r) => r[c] === v); return api },
    neq(c, v) { st.filters.push((r) => r[c] !== v); return api },
    in(c, v) { st.filters.push((r) => (v || []).includes(r[c])); return api },
    is(c, v) { st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return api },
    limit(n) { st.range = [0, n - 1]; return api },
    range(a, b) { st.range = [a, b]; return api },
    update(p) { st.mode = 'update'; st.patch = p; return api },
    insert(rows) { st.mode = 'insert'; st.patch = rows; return api },
    upsert(rows) { st.mode = 'insert'; st.patch = rows; return api },
    delete() { st.mode = 'delete'; return api },
    maybeSingle() { st.single = 'maybe'; return api },
    single() { st.single = 'one'; return api },
    then(res, rej) { return Promise.resolve(run()).then(res, rej) },
  }
  function run() {
    const rows = __db[st.table] || []
    if (st.mode === 'update') { const hit = rows.filter((r) => st.filters.every((f) => f(r))); for (const r of hit) Object.assign(r, st.patch); return { data: st.cols ? hit : null, error: null } }
    if (st.mode === 'insert') { const list = Array.isArray(st.patch) ? st.patch : [st.patch]; for (const r of list) rows.push({ id: 'gen-' + (rows.length + 1), ...r }); return { data: list, error: null } }
    if (st.mode === 'delete') { const hit = rows.filter((r) => st.filters.every((f) => f(r))); for (const r of hit) rows.splice(rows.indexOf(r), 1); return { data: null, error: null } }
    let out = rows.filter((r) => st.filters.every((f) => f(r)))
    for (const [c, asc] of [...st.orders].reverse()) out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1))
    if (st.count) { const n = out.length; if (st.head) return { data: null, count: n, error: null } }
    if (st.range) out = out.slice(st.range[0], st.range[1] + 1)
    if (st.single === 'maybe') return { data: out[0] ?? null, error: null }
    if (st.single === 'one') return out[0] ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    return { data: out, error: null }
  }
  return api
}
export const supabase = { from: (t) => builder(t) }
`, 'utf8')
const fakeUrl = pathToFileURL(fakePath).href
const outfile = path.join(TMP, 'wordLibrary.classDeleteConfirmWiring.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'], bundle: true, format: 'esm', platform: 'node', outfile,
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://offline.invalid'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('offline-test-key'), 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'fake-supabase', setup(b) { b.onResolve({ filter: /supabaseClient(\.js)?$/ }, () => ({ path: fakeUrl, external: true })) } }],
})
const lib = await import(pathToFileURL(outfile).href + '?t=' + Date.now())
const fake = await import(fakeUrl)

let failures = 0, asserted = 0
const check = (label, cond, detail) => { asserted++; if (cond) console.log(`  PASS  ${label}`); else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`); failures++ } }
const rejects = async (fn) => { try { const v = await fn(); return { err: null, v } } catch (e) { return { err: e, v: undefined } } }

const CLS = 'cls-1'
async function boot() {
  fake.__reset({ classes: [{ id: CLS, name: '테스트반', class_type: 'regular' }] })
  await lib.refreshWordLibrary()
}

// ── fetch 모킹 — endpoint 'http://offline.invalid/functions/v1/admin-content-write'
// 로 온 요청만 가로채고, 그 외는 실패시켜 실수로 라이브 네트워크에 나가는
// 걸 원천 차단한다. 마지막 요청 body를 __lastFetchBody에 기록.
let __nextResponse = null
let __lastFetchBody = null
global.fetch = async (url, init) => {
  __lastFetchBody = JSON.parse(init?.body || '{}')
  if (!String(url).includes('/functions/v1/admin-content-write')) {
    throw new Error('테스트에서 예상치 못한 fetch 목적지: ' + url)
  }
  const body = __nextResponse
  return { ok: true, json: async () => body }
}

console.log('\n=== (a) has_learning_data 응답 → throw 없이 {blocked:true, counts} 반환 ===')
{
  await boot()
  const counts = { word_status: 12, entrance_test_results: 3, student_class_assignments: 2, spelling_review_queue: 1 }
  __nextResponse = { ok: false, reason: 'has_learning_data', counts }
  const { err, v } = await rejects(() => lib.deleteClass('테스트반', '1234'))
  check('throw하지 않음', err === null, err?.message)
  check('반환값이 {blocked:true, counts}', v && v.blocked === true && JSON.stringify(v.counts) === JSON.stringify(counts), JSON.stringify(v))
}

console.log('\n=== (b) opts.force===true → 요청 payload에 force:true 포함 ===')
{
  await boot()
  __nextResponse = { ok: true, data: { ok: true, counts: { word_status: 12, entrance_test_results: 0, student_class_assignments: 0, spelling_review_queue: 0 }, forced: true } }
  const { err } = await rejects(() => lib.deleteClass('테스트반', '1234', { force: true }))
  check('force:true 강행 호출은 throw 없음', err === null, err?.message)
  check('요청 payload.force === true', __lastFetchBody?.payload?.force === true, JSON.stringify(__lastFetchBody))
  check('요청 action === class.delete', __lastFetchBody?.action === 'class.delete', __lastFetchBody?.action)

  // force 미지정(기본값) 호출은 payload.force가 true로 새지 않아야 한다.
  await boot()
  __nextResponse = { ok: true, data: { ok: true } }
  await lib.deleteClass('테스트반', '1234')
  check('force 미지정 시 payload.force !== true', __lastFetchBody?.payload?.force !== true, JSON.stringify(__lastFetchBody))
}

console.log('\n=== (c) ok:true 정상 경로 — 반환값 기존과 동일(undefined) ===')
{
  await boot()
  __nextResponse = { ok: true, data: { ok: true } }
  const { err, v } = await rejects(() => lib.deleteClass('테스트반', '1234'))
  check('정상 삭제 throw 없음', err === null, err?.message)
  check('정상 삭제 반환값은 undefined(기존과 동일 — 이 배선이 성공 경로 시그니처를 바꾸지 않음)', v === undefined, JSON.stringify(v))

  // counts>0인데 force로 강행해 성공한 응답(ok:true, forced:true)도 동일하게
  // 특별 취급 없이 undefined를 반환한다(관리자 화면은 blocked 여부만 분기).
  await boot()
  __nextResponse = { ok: true, data: { ok: true, counts: { word_status: 5 }, forced: true } }
  const { err: err2, v: v2 } = await rejects(() => lib.deleteClass('테스트반', '1234', { force: true }))
  check('force 강행 성공도 throw 없음', err2 === null, err2?.message)
  check('force 강행 성공 반환값도 undefined', v2 === undefined, JSON.stringify(v2))
}

console.log('\n=== (d) has_learning_data 이외 실패 사유는 여전히 throw ===')
{
  await boot()
  __nextResponse = { ok: false, reason: 'not_authorized' }
  const { err } = await rejects(() => lib.deleteClass('테스트반', 'wrong-pin'))
  check('not_authorized는 여전히 throw', err !== null, err?.message)

  await boot()
  __nextResponse = { ok: false, error: '서버 내부 오류' }
  const { err: err2 } = await rejects(() => lib.deleteClass('테스트반', '1234'))
  check('일반 에러도 여전히 throw', err2 !== null, err2?.message)
}

console.log('\n=== (e) AdminScreen.jsx 정적 단언 — 2차 확인 모달 배선 ===')
{
  // AdminScreen은 JSX라 이 파일에서 렌더링 실행은 하지 않는다(다른 JSX
  // 컴포넌트 테스트도 이 저장소는 전부 정적 소스 단언 방식 — 예:
  // testClassDeleteGuard.mjs의 (b) 섹션과 동일한 관례). 여기서는 소스
  // 텍스트에 필수 배선 요소가 실제로 존재하는지만 확인한다.
  const src = fs.readFileSync(path.resolve('src/components/AdminScreen.jsx'), 'utf8')

  check("classDeleteBlock 상태가 선언됨", /const \[classDeleteBlock, setClassDeleteBlock\] = useState\(null\)/.test(src))
  check("classDeleteReinput(재입력) 상태가 선언됨", /const \[classDeleteReinput, setClassDeleteReinput\] = useState\(''\)/.test(src))
  check("1차 확인에서 deleteClass 결과의 blocked를 검사함", /result\.blocked/.test(src))
  check("2차 모달이 counts(단어 학습/입실시험/교재 배정/철자 검수)를 표시함",
    /word_status/.test(src) && /entrance_test_results/.test(src) && /student_class_assignments/.test(src) && /spelling_review_queue/.test(src))
  check("2차 모달에 반 이름 재입력 텍스트 입력 필드가 있음", /value=\{classDeleteReinput\}/.test(src) && /onChange=\{\(e\) => setClassDeleteReinput/.test(src))
  check("'그래도 삭제' 버튼이 재입력값이 정확히 일치할 때만 활성화됨(disabled)",
    /disabled=\{classDeleteReinput !== classDeleteBlock\.className\}/.test(src))
  check("'그래도 삭제' 버튼이 deleteClass를 force:true로 호출함",
    /deleteClass\(classDeleteBlock\.className, pin, \{ force: true \}\)/.test(src))
  check("counts=0(1차 확인만으로 삭제되는) 경로는 무변경 — 기존 삭제 버튼이 여전히 존재함",
    /await deleteClass\(confirmDelete, pin\)/.test(src))
  check("문구 정정 — '학생별 진행도는 유지'류 표현이 더 이상 없음(정확한 문구로 교체됨)",
    !/학생별 진행도는 그대로 유지/.test(src))
  check("문구 정정 — 별/XP는 유지되지만 학습 기록/시험 결과는 삭제된다는 문구가 있음",
    /별\/XP는 보존되지만/.test(src) && /단어 학습 기록/.test(src) && /시험 결과는 삭제/.test(src))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — deleteClass가 학습기록 있는 반 삭제 차단/force 강행 계약을 클라이언트에 정확히 배선한다')
process.exit(0)
