// "학습 가능한 유닛만 셀렉터에 노출" 회귀 테스트 (2026-09-02)
//
// 배경(2026-09-02 Yaeji 유령 유닛 실사고 후속, wordLibrary.js 2095-2170행
// 주석 참고): isLearnableUnit(단어>=2)은 setStudentUnit/getStudentEditableUnits/
// setStudentUnitById(쓰기 경로 3곳)에서만 쓰였고, 노출(읽기) 경로는 필터 없이
// 유령/빈 유닛을 그대로 옵션으로 내보냈다 — 학생 Dashboard.jsx 유닛 셀렉트,
// 관리자 StudentDirectory.jsx 생성 폼/일괄이동 폴백, TextbookAssignmentPanel.jsx
// 유닛 select. 이 테스트는 새 헬퍼(getLearnableTextbookUnits/getLearnableClassUnits/
// getLearnableClassUnitNames)가 유령/빈 유닛을 제외하면서도 기존
// getTextbookUnits/getClassUnits(Names)는 하위호환으로 무변경임을 확인한다.
//
// 하네스: testAdminUnitEdit.mjs와 동일 패턴(wordLibrary.js를 esbuild로 번들,
// supabaseClient만 인메모리 가짜로 치환) — 네트워크 0, 실제 DB 접촉 0.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

// ── 인메모리 가짜 supabase(testAdminUnitEdit.mjs와 동일 구현) ─────────────
const fakePath = path.join(TMP, 'fakeSupabaseForGhostUnitFiltering.mjs')
fs.writeFileSync(fakePath, `
export const __db = { classes: [], units: [], words: [], students: [], textbooks: [], class_textbooks: [], student_class_assignments: [], daily_assignments: [] }
export const __log = []
export function __reset(ds) { for (const k of Object.keys(__db)) __db[k] = (ds[k] || []).map((r) => ({ ...r })); __log.length = 0 }
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
  function project(r) {
    const out = { ...r }
    if (st.table === 'students' && /classes\\(name\\)/.test(st.cols)) { const c = __db.classes.find((x) => x.id === r.class_id); out.classes = c ? { name: c.name } : null }
    return out
  }
  function run() {
    const rows = __db[st.table] || []
    if (st.mode === 'update') {
      const hit = rows.filter((r) => st.filters.every((f) => f(r)))
      for (const r of hit) Object.assign(r, st.patch)
      __log.push({ table: st.table, op: 'update', patch: st.patch, hit: hit.length })
      const data = st.cols ? hit.map(project) : null
      return { data, error: null }
    }
    if (st.mode === 'insert') { const list = Array.isArray(st.patch) ? st.patch : [st.patch]; for (const r of list) rows.push({ id: 'gen-' + (rows.length + 1), ...r }); __log.push({ table: st.table, op: 'insert', rows: list.length }); return { data: list.map(project), error: null } }
    if (st.mode === 'delete') { const hit = rows.filter((r) => st.filters.every((f) => f(r))); for (const r of hit) rows.splice(rows.indexOf(r), 1); __log.push({ table: st.table, op: 'delete', hit: hit.length }); return { data: null, error: null } }
    let out = rows.filter((r) => st.filters.every((f) => f(r)))
    for (const [c, asc] of [...st.orders].reverse()) out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1))
    if (st.count) { const n = out.length; if (st.head) return { data: null, count: n, error: null } }
    if (st.range) out = out.slice(st.range[0], st.range[1] + 1)
    out = out.map(project)
    if (st.single === 'maybe') return { data: out[0] ?? null, error: null }
    if (st.single === 'one') return out[0] ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    return { data: out, error: null }
  }
  return api
}
export const supabase = { from: (t) => builder(t) }
`, 'utf8')
const fakeUrl = pathToFileURL(fakePath).href
const outfile = path.join(TMP, 'wordLibrary.ghostUnitFiltering.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'], bundle: true, format: 'esm', platform: 'node', outfile,
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://offline.invalid'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('offline-test-key'), 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'fake-supabase', setup(b) { b.onResolve({ filter: /supabaseClient(\.js)?$/ }, () => ({ path: fakeUrl, external: true })) } }],
})
const lib = await import(pathToFileURL(outfile).href + '?t=' + Date.now())
const fake = await import(fakeUrl)

let failures = 0, asserted = 0
const check = (label, cond, detail) => { asserted++; if (cond) console.log(`  PASS  ${label}`); else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`); failures++ } }

// ── 픽스처: 교재 1개(정상 2 + 유령 1단어 + 0단어 "Unit 1") + 레거시 반 2개 ──
// class_id(UUID)와 class name(문자열)을 분리한다 — getClassUnits(Names)/
// getLearnableClassUnits(Names)는 name으로 조회하고(_cache 키가 이름),
// units.class_id/class_textbooks.class_id/textbooks.owner_class_id는 id로
// 참조한다. 이 둘을 섞어 쓰면(예: name 파라미터에 id를 넘기면) _cache 조회가
// 항상 미스해 "유닛 0개"로 보여 테스트가 거짓 PASS/거짓 FAIL을 낼 수 있다.
const CONT = 'cls-cont', RC = 'cls-regular', LEGACY = 'cls-legacy', LEGACY_EMPTY = 'cls-legacy-empty'
const CONT_NAME = '감사용 교재반', LEGACY_NAME = '감사용 레거시반', LEGACY_EMPTY_NAME = '감사용 빈 레거시반'
const TB = 'tb-1'
const U = { u1: 'u-1', u2: 'u-2', ghost: 'u-ghost', zero: 'u-zero', legacyOk: 'u-legacy-ok', legacyGhost: 'u-legacy-ghost' }
const words = (uid, n, base) => Array.from({ length: n }, (_, i) => ({ id: `${uid}-w${i}`, unit_id: uid, word: `${base}${i}`, meaning: `뜻${i}`, position: i + 1 }))
const dataset = () => ({
  classes: [
    { id: CONT, name: CONT_NAME, class_type: 'textbook' },
    { id: RC, name: '감사용 일반반', class_type: 'regular' },
    { id: LEGACY, name: LEGACY_NAME, class_type: 'regular' },
    { id: LEGACY_EMPTY, name: LEGACY_EMPTY_NAME, class_type: 'regular' },
  ],
  textbooks: [{ id: TB, name: '감사용 교재', owner_class_id: CONT }],
  class_textbooks: [{ class_id: RC, textbook_id: TB, enabled: true, sort_order: 1 }],
  units: [
    { id: U.u1, class_id: CONT, textbook_id: TB, name: 'Unit1', position: 1 },
    { id: U.u2, class_id: CONT, textbook_id: TB, name: 'Unit2', position: 2 },
    { id: U.ghost, class_id: CONT, textbook_id: TB, name: 'Unit', position: 0 }, // 엑셀 헤더 잔재(1단어)
    { id: U.zero, class_id: CONT, textbook_id: TB, name: 'Unit 1', position: 0 }, // 0단어(교사 미업로드)
    { id: U.legacyOk, class_id: LEGACY, name: 'Legacy Unit A', position: 1 },
    { id: U.legacyGhost, class_id: LEGACY, name: 'Legacy Ghost', position: 0 },
  ],
  words: [
    ...words(U.u1, 40, 'w1_'), ...words(U.u2, 40, 'w2_'),
    { id: 'gw', unit_id: U.ghost, word: 'No.', meaning: '어휘·어구', position: 1 }, // 1단어 유령
    // U.zero: 단어 0개(의도적으로 words 없음)
    ...words(U.legacyOk, 5, 'l1_'),
    { id: 'lgw', unit_id: U.legacyGhost, word: 'No.', meaning: '어휘·어구', position: 1 },
  ],
})
async function boot() {
  fake.__reset(dataset())
  await lib.refreshWordLibrary(); await lib.refreshClassSettings(); await lib.refreshTextbooks()
}

console.log('\n=== (a) getLearnableTextbookUnits — 교재의 정상 유닛만 반환 ===')
{
  await boot()
  const hasFn = typeof lib.getLearnableTextbookUnits === 'function'
  check('헬퍼 존재', hasFn)
  const units = hasFn ? lib.getLearnableTextbookUnits(TB) : []
  const names = units.map((u) => u.name).sort()
  check('정상 유닛 2개만(Unit1/Unit2)', JSON.stringify(names) === JSON.stringify(['Unit1', 'Unit2']), JSON.stringify(names))
  check('유령 "Unit"(1단어) 제외', !units.some((u) => u.id === U.ghost))
  check('0단어 "Unit 1" 제외', !units.some((u) => u.id === U.zero))
}

console.log('\n=== (b) getLearnableClassUnits/Names — 합성 placeholder를 반환하지 않음 ===')
{
  await boot()
  const hasUnitsFn = typeof lib.getLearnableClassUnits === 'function'
  const hasNamesFn = typeof lib.getLearnableClassUnitNames === 'function'
  check('헬퍼 존재(Units)', hasUnitsFn)
  check('헬퍼 존재(Names)', hasNamesFn)
  check('유닛 0개 반 → getLearnableClassUnits 빈 배열(placeholder 아님)', hasUnitsFn && JSON.stringify(lib.getLearnableClassUnits(LEGACY_EMPTY_NAME)) === '[]')
  check('유닛 0개 반 → getLearnableClassUnitNames 빈 배열(["Unit 1"] 아님)', hasNamesFn && JSON.stringify(lib.getLearnableClassUnitNames(LEGACY_EMPTY_NAME)) === '[]')
  const legacyLearnable = hasNamesFn ? lib.getLearnableClassUnitNames(LEGACY_NAME) : null
  check('레거시 반은 정상 유닛만(Legacy Unit A, 유령 제외)', JSON.stringify(legacyLearnable) === JSON.stringify(['Legacy Unit A']), JSON.stringify(legacyLearnable))
}

console.log('\n=== (c) 기존 getTextbookUnits/getClassUnits(Names)는 무변경(하위호환) ===')
{
  await boot()
  const allTbUnits = lib.getTextbookUnits(TB)
  check('getTextbookUnits는 유령/0단어 포함 4개 전부 반환(기존 동작 그대로)', allTbUnits.length === 4, allTbUnits.length)
  const emptyClassUnits = lib.getClassUnits(LEGACY_EMPTY_NAME)
  check('getClassUnits(빈 반)은 여전히 합성 placeholder ["Unit 1"] 반환(무변경)', JSON.stringify(emptyClassUnits) === JSON.stringify([{ name: 'Unit 1', words: [] }]), JSON.stringify(emptyClassUnits))
  const legacyNames = lib.getClassUnitNames(LEGACY_NAME).sort()
  check('getClassUnitNames(레거시)는 유령 포함 2개 전부(무변경)', JSON.stringify(legacyNames) === JSON.stringify(['Legacy Ghost', 'Legacy Unit A']), JSON.stringify(legacyNames))
}

console.log('\n=== (d)(e)(f)(g) 정적 검사 — 노출 지점이 learnable 헬퍼를 쓰는가 ===')
{
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((line) => { const m = line.match(/(?<!:)\/\/.*/); return m ? line.slice(0, m.index) : line }).join('\n')

  // (d) Dashboard.jsx — 학생 유닛 셀렉트 소스
  const dashSrc = fs.readFileSync(path.resolve('src/components/Dashboard.jsx'), 'utf8')
  const dashCode = stripComments(dashSrc)
  const unitNamesBlock = dashCode.slice(dashCode.indexOf('const unitNames ='), dashCode.indexOf('const unitNames =') + 300)
  check('Dashboard.jsx unitNames가 getLearnableTextbookUnits 사용', /getLearnableTextbookUnits\(/.test(unitNamesBlock), unitNamesBlock)
  check('Dashboard.jsx unitNames가 getLearnableClassUnitNames 사용', /getLearnableClassUnitNames\(/.test(unitNamesBlock), unitNamesBlock)
  check('(g) 현재 유닛 유지 — 목록 밖 unitName도 옵션으로 유지하는 렌더 로직 존재', /!unitNames\.includes\(unitName\)/.test(dashCode))

  // (e) StudentDirectory.jsx — 생성 폼
  const dirSrc = fs.readFileSync(path.resolve('src/components/admin/StudentDirectory.jsx'), 'utf8')
  const dirCode = stripComments(dirSrc)
  check('StudentDirectory.jsx가 getLearnableTextbookUnits/getLearnableClassUnitNames를 import', /getLearnableTextbookUnits/.test(dirCode) && /getLearnableClassUnitNames/.test(dirCode))
  const submitBlock = dirCode.slice(dirCode.indexOf("action: 'create_student'"), dirCode.indexOf("action: 'create_student'") + 500)
  check('생성 요청 unitName 폴백이 getLearnableClassUnitNames 사용', /getLearnableClassUnitNames\(newClass\)/.test(submitBlock), submitBlock)
  check("생성 요청 unitName 폴백에 || 'Unit 1' 리터럴이 더 이상 없음", !/getClassUnitNames\(newClass\)\[0\]\s*\|\|\s*'Unit 1'/.test(submitBlock))
  const createFormBlock = dirCode.slice(dirCode.indexOf('newTextbook\n'), dirCode.indexOf('newTextbook\n') + 400) || dirCode.slice(dirCode.indexOf('첫 학습 유닛 (자동)'), dirCode.indexOf('첫 학습 유닛 (자동)') + 300)
  check('생성 폼 유닛 옵션이 getLearnableTextbookUnits 사용', /getLearnableTextbookUnits\(newTextbook\)/.test(dirCode))
  const bulkBlock = dirCode.slice(dirCode.indexOf('setStudentsClassBulk('), dirCode.indexOf('setStudentsClassBulk(') + 200)
  check('일괄이동 폴백이 getLearnableClassUnitNames 우선 사용', /getLearnableClassUnitNames\(bulkTargetClass\)/.test(bulkBlock), bulkBlock)

  // (f) TextbookAssignmentPanel.jsx — 배정 패널 유닛 select
  const tapSrc = fs.readFileSync(path.resolve('src/components/admin/TextbookAssignmentPanel.jsx'), 'utf8')
  const tapCode = stripComments(tapSrc)
  check('TextbookAssignmentPanel.jsx가 getLearnableClassUnits 사용', /getLearnableClassUnits\(/.test(tapCode))
  check('(g) TextbookAssignmentPanel.jsx도 현재 unitId 유지 로직 존재(currentMissing)', /currentMissing/.test(tapCode))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 학습 불가 유닛(유령/빈)이 학생·관리자 셀렉터에서 제외됨')
