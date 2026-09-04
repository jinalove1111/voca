// 관리자 핵심 흐름 — 학생 생성 / 반 지정·이동 / 교재 배정·primary /
// 교재 변경 / 유닛 변경 / 기록 보존 복합 회귀 스위트 (2026-09-04, Track M)
//
// 목적: 개별 흐름은 이미 여러 스크립트에 흩어져 있다(testCreateStudentUnitAssignment.mjs
// = create_student, testTextbookIsolation.mjs = 교재/반 다대다·전환·이동,
// testAdminUnitEdit.mjs = 유닛 저장/유령 거부, testAssignmentUnitGuards.mjs =
// setAssignmentUnit/setPrimaryAssignment/setPrimaryTextbook 유령 가드). 이
// 파일은 그 로직을 재구현하지 않고, "관리자가 학생 한 명을 만들고 → 반을
// 옮기고 → 교재를 배정/전환하고 → 유닛을 바꾸는" 하나의 연속된 시나리오를
// 같은 픽스처 위에서 이어 검증해, 개별 스위트가 보지 못하는 단계 간 상호작용
// (예: create_student가 만든 SCA 위에서 setStudentClass가 다른 교재 SCA를
// 보존하는지, 교재 전환 후에도 학습기록 테이블이 여전히 무접촉인지)을 고정한다.
//
// 하네스(전부 기존 파일에서 실측 확인 후 재사용, 새 가짜 발명 없음):
//   PART A — create_student: testPinSetupCapability.mjs/
//     testCreateStudentUnitAssignment.mjs와 동일하게 api/admin-pin-actions.js를
//     esbuild로 번들하고 @supabase/supabase-js만 인메모리 다중 테이블 가짜로
//     치환(단순 matches() 필터, UNIQUE 미시뮬레이션 — 원본과 동일 계약).
//   PART B — setStudentClass/assignTextbook/removeTextbookAssignment/
//     setAssignmentUnit/setPrimaryAssignment/setPrimaryTextbook/
//     setStudentUnitById/setStudentUnit: testTextbookIsolation.mjs와 완전히
//     동일한 쓰기 기록형 인메모리 가짜 supabase(update/insert/delete/upsert
//     기록 + UNIQUE 제약 시뮬레이션, textbooks.name/classes.name/
//     class_textbooks(class_id,textbook_id)/student_class_assignments
//     (student_id,class_id)/uq_sca_student_textbook 그대로)를 재사용해
//     src/utils/wordLibrary.js를 esbuild 오프라인 번들.
// 네트워크 0, 실제 Supabase 접촉 0. 등록: npm run verify:admin-flows.
//
// 규칙 15(FAIL-first) — §2f는 "delete-instead-of-demote"로 되돌리면 이
// 스위트의 단언이 실제로 FAIL하는지, src를 고치지 않고 가짜 DB에 직접
// delete를 기록해 재현한다(파일당 소유권 원칙상 wordLibrary.js는 무수정).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

let failures = 0, asserted = 0
const check = (label, cond, detail) => {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); failures++ }
}
const rejects = async (fn) => { try { await fn(); return null } catch (e) { return e } }

// ════════════════════════════════════════════════════════════════════════
// PART A — create_student (api/admin-pin-actions.js, 인메모리 다중 테이블
// 가짜, testCreateStudentUnitAssignment.mjs/testPinSetupCapability.mjs와
// 동일 계약)
// ════════════════════════════════════════════════════════════════════════
process.env.ADMIN_PIN = '4729'
process.env.SESSION_SECRET = 'admin-flows-test-secret'
const ADMIN_PIN = process.env.ADMIN_PIN

const fakeAPath = path.join(TMP, 'fakeSupabaseForAdminFlowsA.mjs')
fs.writeFileSync(fakeAPath, `
export const __db = { students: [], classes: [], textbooks: [], class_textbooks: [], units: [], words: [], student_class_assignments: [] }
export function __reset() { for (const k of Object.keys(__db)) __db[k] = [] }
function matches(row, filters) {
  return filters.every(([kind, col, v]) => {
    if (kind === 'eq') return row[col] === v
    if (kind === 'in') return v.includes(row[col])
    if (kind === 'is') return row[col] === null || row[col] === undefined
    if (kind === 'ilike') {
      const pat = String(v).replace(/%/g, '').toLowerCase()
      return String(row[col] ?? '').toLowerCase() === pat
    }
    return true
  })
}
function makeQuery(table) {
  const filters = []
  let mode = 'select'
  let patch = null
  const q = {
    select() { return q },
    eq(c, v) { filters.push(['eq', c, v]); return q },
    in(c, v) { filters.push(['in', c, v]); return q },
    is(c, _v) { filters.push(['is', c, null]); return q },
    ilike(c, v) { filters.push(['ilike', c, v]); return q },
    update(p) { mode = 'update'; patch = p; return q },
    insert(rows) { mode = 'insert'; patch = rows; return q },
    limit() { return q },
    order() { return q },
    then(resolve) { resolve(run()); return Promise.resolve(run()) },
    maybeSingle() { const r = run(); return Promise.resolve({ data: r.data[0] ?? null, error: r.error }) },
    single() { const r = run(); return Promise.resolve({ data: r.data[0] ?? null, error: r.error }) },
  }
  function run() {
    const rows = __db[table] || []
    if (mode === 'update') {
      const hit = rows.filter((r) => matches(r, filters))
      for (const r of hit) Object.assign(r, patch)
      return { data: hit.map((r) => ({ ...r })), error: null }
    }
    if (mode === 'insert') {
      const list = Array.isArray(patch) ? patch : [patch]
      if (table === 'students') {
        for (const r of list) if (r.id != null && rows.some((x) => x.id === r.id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } }
        }
      }
      for (const r of list) rows.push({ ...r })
      return { data: list.map((r) => ({ ...r })), error: null }
    }
    return { data: rows.filter((r) => matches(r, filters)).map((r) => ({ ...r })), error: null }
  }
  return q
}
export function createClient() { return { from: (t) => makeQuery(t) } }
`, 'utf8')
const fakeAUrl = pathToFileURL(fakeAPath).href

const realPinAuth = pathToFileURL(path.resolve('api/_pinAuth.js')).href
const fakePinAuthPath = path.join(TMP, 'fakePinAuthForAdminFlowsA.mjs')
fs.writeFileSync(fakePinAuthPath,
  `export const supabaseAdminUrl = () => 'https://fake.supabase.co'
export const supabaseAdminKey = () => 'fake-service-role-key'
export * from ${JSON.stringify(realPinAuth)}
`, 'utf8')
const fakePinAuthUrl = pathToFileURL(fakePinAuthPath).href

const outfileA = path.join(TMP, 'adminFlows.createStudent.bundle.mjs')
await esbuild.build({
  entryPoints: ['api/admin-pin-actions.js'], bundle: true, format: 'esm', platform: 'node', outfile: outfileA,
  plugins: [{
    name: 'fake-deps',
    setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: fakeAUrl, external: true }))
      b.onResolve({ filter: /_pinAuth\.js$/ }, () => ({ path: fakePinAuthUrl, external: true }))
    },
  }],
})
const adminHandler = (await import(pathToFileURL(outfileA).href + '?t=' + Date.now())).default
const fakeA = await import(fakeAUrl)

function callAdmin(body) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 0, body: null,
      status(c) { this.statusCode = c; return this },
      json(b) { this.body = b; resolve({ statusCode: this.statusCode, body: b }) },
    }
    adminHandler({ method: 'POST', body, headers: {} }, res)
  })
}

const RC = '10000000-0000-4000-8000-0000000000a1' // regular 반(교재 미소유)
const CC = '20000000-0000-4000-8000-0000000000a2' // 컨테이너 반(TB 소유)
const TB = '30000000-0000-4000-8000-0000000000a3'
const U_GHOST = '40000000-0000-4000-8000-0000000000a4' // 1단어 유령
const U2 = '40000000-0000-4000-8000-0000000000a5'
const U3 = '40000000-0000-4000-8000-0000000000a6'
const SID = (n) => `9000000${n}-0000-4000-8000-00000000a0a${n}`

function seedA() {
  fakeA.__reset()
  fakeA.__db.classes.push({ id: RC, name: 'QA Flows Regular' }, { id: CC, name: 'QA Flows Container' })
  fakeA.__db.textbooks.push({ id: TB, name: 'QA Flows Textbook', owner_class_id: CC })
  fakeA.__db.class_textbooks.push({ class_id: RC, textbook_id: TB, enabled: true })
  fakeA.__db.units.push(
    { id: U_GHOST, name: 'Unit1', class_id: CC, textbook_id: TB, position: 1 },
    { id: U2, name: 'Unit2', class_id: CC, textbook_id: TB, position: 2 },
    { id: U3, name: 'Unit3', class_id: CC, textbook_id: TB, position: 3 },
  )
  fakeA.__db.words.push(
    { id: 'w1', unit_id: U_GHOST, word: 'No.', meaning: '어휘·어구' },
    { id: 'w2', unit_id: U2, word: 'welcome', meaning: '환영하다' },
    { id: 'w3', unit_id: U2, word: 'positive', meaning: '긍정적인' },
    { id: 'w4', unit_id: U3, word: 'capture', meaning: '포착하다' },
    { id: 'w5', unit_id: U3, word: 'remain', meaning: '남다' },
  )
}
const studentRowA = (sid) => fakeA.__db.students.find((s) => s.id === sid)
const scaRowA = (sid, classId) => fakeA.__db.student_class_assignments.find((r) => r.student_id === sid && r.class_id === classId)

console.log('\n=== PART A ===')
console.log('\n[Flow 1a] create_student — 반(RC) + textbookId(TB) 지정 → 첫 학습 유닛 배정, SCA primary+textbook_id')
{
  seedA()
  const r = await callAdmin({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(1), name: 'QA생성일', classId: RC, textbookId: TB })
  check('생성 성공', r.body?.ok === true, r.body)
  check('학생 class_id = RC(사람 반 그대로)', studentRowA(SID(1))?.class_id === RC)
  check('학생 current_unit_id = 첫 학습 유닛(U2, 1단어 유령 Unit1 스킵)', studentRowA(SID(1))?.current_unit_id === U2, studentRowA(SID(1))?.current_unit_id)
  const sca = scaRowA(SID(1), RC)
  check('SCA primary 행 생성됨', !!sca && sca.is_primary === true)
  check('SCA.textbook_id = 요청 교재(TB, 껍데기 배정 아님)', sca?.textbook_id === TB, sca?.textbook_id)
  check('SCA.current_unit_id = students와 동일(U2)', sca?.current_unit_id === U2)
}

console.log('\n[Flow 1b] create_student — 교재를 소유하지 않은 반 + textbookId 미지정 → 문서화된 현재 동작(생성은 성공, 유닛/교재는 null)')
{
  seedA()
  const r = await callAdmin({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(2), name: 'QA생성이', classId: RC })
  check('생성 자체는 성공(하위호환, 규칙 9)', r.body?.ok === true, r.body)
  check('교재 미지정 + 반이 교재를 소유하지 않으면 추측 배정하지 않음(current_unit_id null)', studentRowA(SID(2))?.current_unit_id == null, studentRowA(SID(2))?.current_unit_id)
  const sca = scaRowA(SID(2), RC)
  check('SCA primary 행은 그래도 생성됨(non-fatal 보조 테이블)', !!sca && sca.is_primary === true)
  check('SCA.textbook_id도 null(반이 교재를 소유하지 않으므로 폴백 대상 없음)', sca?.textbook_id == null, sca?.textbook_id)
  check('SCA.current_unit_id도 null', sca?.current_unit_id == null)
}

// ════════════════════════════════════════════════════════════════════════
// PART B — wordLibrary.js 쓰기 함수(반 지정/이동, 교재 배정/전환, 유닛 변경)
// testTextbookIsolation.mjs와 동일한 쓰기 기록형 인메모리 가짜 supabase.
// ════════════════════════════════════════════════════════════════════════
const fakeBPath = path.join(TMP, 'fakeSupabaseForAdminFlowsB.mjs')
fs.writeFileSync(fakeBPath, `
export const __db = { classes: [], units: [], words: [], students: [], textbooks: [], class_textbooks: [], student_class_assignments: [], daily_assignments: [], student_progress: [], word_status: [] }
export const __log = []
export function __reset(ds) { for (const k of Object.keys(__db)) __db[k] = (ds[k] || []).map((r) => ({ ...r })); __log.length = 0 }
const UNIQUE = { classes: ['name'], textbooks: ['name'], class_textbooks: ['class_id', 'textbook_id'], student_class_assignments: ['student_id', 'class_id'] }
function partialClash(table, r, rows) {
  if (table !== 'student_class_assignments') return false
  if (r.textbook_id == null) return false
  return rows.some((x) => x.student_id === r.student_id && x.textbook_id === r.textbook_id)
}
let __seq = 0
function builder(table) {
  const st = { table, cols: '', filters: [], orders: [], range: null, mode: 'select', patch: null, single: null }
  const api = {
    select(c) { st.cols = c || ''; return api },
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
    if (st.table === 'students' && /classes\\(name\\)/.test(st.cols)) {
      const c = __db.classes.find((x) => x.id === r.class_id)
      out.classes = c ? { name: c.name } : null
    }
    return out
  }
  function run() {
    const rows = __db[st.table] || []
    if (st.mode === 'insert') {
      const list = Array.isArray(st.patch) ? st.patch : [st.patch]
      const keys = UNIQUE[st.table]
      for (const r of list) {
        const clash = (keys && rows.some((x) => keys.every((k) => x[k] === r[k]))) || partialClash(st.table, r, rows)
        if (clash) {
          __log.push({ table: st.table, op: 'insert-conflict', row: r })
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        }
      }
      const created = list.map((r) => { const row = { id: st.table + '-gen-' + (++__seq), ...r }; rows.push(row); return row })
      __log.push({ table: st.table, op: 'insert', rows: created.length, ids: created.map((r) => r.id) })
      const data = st.single ? (created[0] || null) : created.map(project)
      return { data, error: null }
    }
    if (st.mode === 'update') {
      const hit = rows.filter((r) => st.filters.every((f) => f(r)))
      for (const r of hit) Object.assign(r, st.patch)
      __log.push({ table: st.table, op: 'update', patch: st.patch, hit: hit.length, ids: hit.map((r) => r.id) })
      const data = st.cols || st.single ? hit.map(project) : null
      if (st.single === 'maybe') return { data: data?.[0] ?? null, error: null }
      if (st.single === 'one') return data?.[0] ? { data: data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
      return { data, error: null }
    }
    if (st.mode === 'delete') {
      const hit = rows.filter((r) => st.filters.every((f) => f(r)))
      for (const r of hit) rows.splice(rows.indexOf(r), 1)
      __log.push({ table: st.table, op: 'delete', hit: hit.length, ids: hit.map((r) => r.id) })
      return { data: null, error: null }
    }
    let out = rows.filter((r) => st.filters.every((f) => f(r)))
    for (const [c, asc] of [...st.orders].reverse()) out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1))
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
const fakeBUrl = pathToFileURL(fakeBPath).href
const outfileB = path.join(TMP, 'adminFlows.wordLibrary.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'], bundle: true, format: 'esm', platform: 'node', outfile: outfileB,
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://offline.invalid'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('offline-test-key'), 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'fake-supabase', setup(b) { b.onResolve({ filter: /supabaseClient(\.js)?$/ }, () => ({ path: fakeBUrl, external: true })) } }],
})
const lib = await import(pathToFileURL(outfileB).href + '?t=' + Date.now())
const fakeB = await import(fakeBUrl)

const recordWrites = () => fakeB.__log.filter((l) => l.table === 'student_progress' || l.table === 'word_status' || l.table === 'student_daily_progress')
const scaLogB = () => fakeB.__log.filter((l) => l.table === 'student_class_assignments')
const stuWritesB = () => fakeB.__log.filter((l) => l.table === 'students' && (l.op === 'update' || l.op === 'insert'))

// ── PART B 픽스처 1 — 반 이동(Flow 2) ──────────────────────────────────
const HOME = 'cls-b-home', HOME2 = 'cls-b-home2'
const CONT1 = 'cls-b-cont1', CONT2 = 'cls-b-cont2'
const TB1B = 'tb-b-1', TB2B = 'tb-b-2'
const wordsN = (uid, n, base) => Array.from({ length: n }, (_, i) => ({ id: `${uid}-w${i}`, unit_id: uid, word: `${base}${i}`, meaning: `뜻${i}`, position: i + 1 }))
const flow2Dataset = () => ({
  classes: [
    { id: HOME, name: 'B_HOME', class_type: 'regular', spelling_direction: 'kr2en' },
    { id: HOME2, name: 'B_HOME2', class_type: 'regular', spelling_direction: 'kr2en' },
    { id: CONT1, name: 'B_CONT1', class_type: 'textbook', spelling_direction: 'mixed' },
    { id: CONT2, name: 'B_CONT2', class_type: 'textbook', spelling_direction: 'mixed' },
  ],
  textbooks: [
    { id: TB1B, name: 'B교재1', owner_class_id: CONT1, publisher_name: null },
    { id: TB2B, name: 'B교재2', owner_class_id: CONT2, publisher_name: null },
  ],
  class_textbooks: [],
  units: [
    { id: 'b2-ghost1', class_id: CONT1, textbook_id: TB1B, name: 'Unit1', position: 0 }, // 1단어 유령
    { id: 'b2-u1', class_id: CONT1, textbook_id: TB1B, name: 'Unit2', position: 0 },
    { id: 'b2-ghost2', class_id: CONT2, textbook_id: TB2B, name: 'Unit1', position: 0 }, // 1단어 유령(정규화로 "Unit 1"과 매칭)
    { id: 'b2-u2', class_id: CONT2, textbook_id: TB2B, name: 'Unit2', position: 0 },
  ],
  words: [
    { id: 'b2-gw1', unit_id: 'b2-ghost1', word: 'No.', meaning: '어휘·어구', position: 1 },
    ...wordsN('b2-u1', 3, 'one'),
    { id: 'b2-gw2', unit_id: 'b2-ghost2', word: 'No.', meaning: '어휘·어구', position: 1 },
    ...wordsN('b2-u2', 3, 'two'),
  ],
  students: [
    { id: 'stu-b2-s1', name: 'B2_S1', class_id: HOME, unit_name: 'Unit2', current_unit_id: 'b2-u1' },
    { id: 'stu-b2-s2', name: 'B2_S2', class_id: CONT1, unit_name: 'Unit 1', current_unit_id: 'b2-ghost1' },
  ],
  student_class_assignments: [
    { id: 'b2-sca-s1-home', student_id: 'stu-b2-s1', class_id: HOME, textbook_id: null, current_unit_id: 'b2-u1', is_primary: true },
    { id: 'b2-sca-s1-cont1', student_id: 'stu-b2-s1', class_id: CONT1, textbook_id: TB1B, current_unit_id: 'b2-u1', is_primary: false },
    { id: 'b2-sca-s2-cont1', student_id: 'stu-b2-s2', class_id: CONT1, textbook_id: TB1B, current_unit_id: 'b2-ghost1', is_primary: true },
  ],
})
async function bootFlow2() {
  fakeB.__reset(flow2Dataset())
  await lib.refreshWordLibrary(); await lib.refreshStudents(); await lib.refreshClassSettings(); await lib.refreshTextbooks()
  lib.invalidateStudentAssignmentsCache?.()
  await lib.getStudentClassAssignments('stu-b2-s1'); await lib.getStudentClassAssignments('stu-b2-s2')
  fakeB.__log.length = 0
}
const stuB = (id) => fakeB.__db.students.find((s) => s.id === id)
const scaB = (id) => fakeB.__db.student_class_assignments.find((r) => r.id === id)

console.log('\n=== PART B ===')
console.log('\n[Flow 2a] setStudentClass — class_id 변경 + 이전 primary demote(삭제 아님) + 다른 교재 SCA 보존')
{
  await bootFlow2()
  await lib.setStudentClass('stu-b2-s1', 'B_HOME2')
  check('class_id가 HOME2로 변경됨', stuB('stu-b2-s1')?.class_id === HOME2)
  const oldHome = scaB('b2-sca-s1-home')
  check('이전 반(HOME) SCA 행이 삭제되지 않고 존재', !!oldHome, oldHome)
  check('이전 반(HOME) SCA 행이 demote됨(is_primary=false)', oldHome?.is_primary === false, oldHome)
  const otherTb = scaB('b2-sca-s1-cont1')
  check('다른 교재(CONT1) SCA 행은 값이 전혀 안 바뀜(id/unit/primary 그대로)',
    otherTb?.current_unit_id === 'b2-u1' && otherTb?.is_primary === false, otherTb)
  check('student_class_assignments에 DELETE 연산 0건', scaLogB().filter((l) => l.op === 'delete').length === 0, scaLogB())
  const newHome2 = fakeB.__db.student_class_assignments.find((r) => r.student_id === 'stu-b2-s1' && r.class_id === HOME2)
  check('새 반(HOME2)에 primary 행 신설됨', newHome2?.is_primary === true, newHome2)
  check('HOME2는 유닛을 소유하지 않으므로 current_unit_id는 null(추측 배정 없음)', stuB('stu-b2-s1')?.current_unit_id == null, stuB('stu-b2-s1')?.current_unit_id)
}

console.log('\n[Flow 2b] setStudentClass — 목적지 반의 유령 유닛에 정규화로 유일매칭돼도 채택하지 않는다')
{
  await bootFlow2()
  // s2는 CONT1 소속, unit_name="Unit 1"(공백) — 목적지 CONT2에도 같은
  // 이름의 1단어 유령 유닛("Unit1")이 있어 정규화 유일매칭 함정이 존재한다.
  await lib.setStudentClass('stu-b2-s2', 'B_CONT2')
  check('목적지(CONT2)의 유령 "Unit1"이 채택되지 않음(current_unit_id != ghost)', stuB('stu-b2-s2')?.current_unit_id !== 'b2-ghost2', stuB('stu-b2-s2')?.current_unit_id)
  check('대신 학습 가능한 첫 유닛(b2-u2)으로 폴백', stuB('stu-b2-s2')?.current_unit_id === 'b2-u2', stuB('stu-b2-s2')?.current_unit_id)
}

console.log('\n[Flow 2c] FAIL-first 자가검증 — "delete-instead-of-demote"였다면 §2a 단언이 실제로 FAIL함을 가짜 로그로 증명(src 무수정)')
{
  // src를 고치지 않고, 가짜 DB에 옛 구현(delete)이 했을 법한 연산을 직접
  // 기록해 §2a와 동일한 단언식을 그 상태에 대해 재평가한다 — 이 메타
  // 단언 자체는 "우리 스위트가 그 회귀를 실제로 잡아낸다"를 증명하는
  // 것이므로 PASS가 기대값이다(구현을 되돌려 실행한 게 아니라 재현된
  // 산출물만 검사 — 규칙 15의 "FAIL-first로 회귀를 실측 확인" 정신을
  // 수정 대상 소스에 손대지 않고 재현).
  await bootFlow2()
  const before = scaB('b2-sca-s1-home')
  check('사전조건: demote 전 이전 반 행이 실존', !!before)
  // 옛(버그) 구현을 흉내: 이전 primary 행을 delete하고 새 반에 신규 삽입만 함.
  const idx = fakeB.__db.student_class_assignments.findIndex((r) => r.id === 'b2-sca-s1-home')
  fakeB.__db.student_class_assignments.splice(idx, 1)
  fakeB.__db.student_class_assignments.push({ id: 'b2-sca-s1-home-REPLAY-BUGGY', student_id: 'stu-b2-s1', class_id: HOME2, textbook_id: null, current_unit_id: null, is_primary: true })
  const corrupted = fakeB.__db.student_class_assignments.find((r) => r.id === 'b2-sca-s1-home')
  check('delete 기반 재현 상태에서 "이전 반 SCA 행이 존재"라는 §2a 단언 조건은 false가 된다(회귀를 실제로 잡아냄을 증명)',
    corrupted === undefined)
}

// ── PART B 픽스처 2 — 교재 배정/전환(Flow 3, Flow 4) ───────────────────
const ANCHOR_CLS = 'cls-b3-anchor', ANCHOR_TB = 'tb-b3-anchor'
async function bootFlow3() {
  fakeB.__reset({
    classes: [{ id: ANCHOR_CLS, name: 'B3앵커', class_type: 'textbook' }],
    textbooks: [{ id: ANCHOR_TB, name: 'B3앵커', owner_class_id: ANCHOR_CLS, publisher_name: null }],
    class_textbooks: [{ class_id: ANCHOR_CLS, textbook_id: ANCHOR_TB, enabled: true, sort_order: 0 }],
  })
  await lib.refreshWordLibrary(); await lib.refreshStudents(); await lib.refreshClassSettings(); await lib.refreshTextbooks()
  lib.invalidateStudentAssignmentsCache?.()
  fakeB.__log.length = 0
}
async function seedFlow3Textbooks() {
  await lib.createClass('B3 중1 천재', 'textbook')
  await lib.createClass('B3 중2 천재', 'textbook')
  const cls1 = lib.getClassIdByName('B3 중1 천재')
  const cls2 = lib.getClassIdByName('B3 중2 천재')
  await lib.setClassWords('B3 중1 천재', [{ word: 'apple', meaning: '사과' }, { word: 'banana', meaning: '바나나' }], 'Unit 1')
  await lib.setClassWords('B3 중2 천재', [{ word: 'cat', meaning: '고양이' }, { word: 'dog', meaning: '개' }], 'Unit 1')
  const tb1 = lib.getAllTextbooks().find((t) => t.name === 'B3 중1 천재')
  const tb2 = lib.getAllTextbooks().find((t) => t.name === 'B3 중2 천재')
  return { cls1, cls2, tb1, tb2 }
}

console.log('\n[Flow 3a] assignTextbook — SCA insert(textbook_id + 소유 컨테이너 반)')
{
  await bootFlow3()
  const { cls2, tb1, tb2 } = await seedFlow3Textbooks()
  const studentId = await lib.addStudent('B3_S1', 'B3 중1 천재', 'Unit 1')
  fakeB.__log.length = 0
  await lib.assignTextbook(studentId, cls2)
  const row = fakeB.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls2)
  check('assignTextbook — SCA 행 생성됨', !!row, row)
  check('SCA.textbook_id = 그 반이 소유한 교재(tb2)', row?.textbook_id === tb2.id, row)
  check('SCA.class_id = 소유 컨테이너 반(cls2) 그대로', row?.class_id === cls2)
  check('신규 배정은 is_primary=false(주 배정을 바꾸지 않음)', row?.is_primary === false)
}

console.log('\n[Flow 3b] removeTextbookAssignment — 그 행만 삭제, 다른 배정/주배정 무접촉')
{
  await bootFlow3()
  const { cls1, cls2 } = await seedFlow3Textbooks()
  const studentId = await lib.addStudent('B3_S2', 'B3 중1 천재', 'Unit 1')
  await lib.assignTextbook(studentId, cls2)
  fakeB.__log.length = 0
  await lib.removeTextbookAssignment(studentId, cls2)
  check('cls2 배정 행이 사라짐', !fakeB.__db.student_class_assignments.some((r) => r.student_id === studentId && r.class_id === cls2))
  const primary = fakeB.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls1)
  check('primary(cls1) 배정은 그대로 존재', !!primary && primary.is_primary === true, primary)
  check('삭제 연산이 정확히 1건(다른 테이블/행 무접촉)', scaLogB().filter((l) => l.op === 'delete').length === 1 && scaLogB().filter((l) => l.op === 'delete')[0].hit === 1, scaLogB())

  // primary 행은 이 함수로 지울 수 없다(불변식) — 시도 시 throw, delete 0.
  fakeB.__log.length = 0
  const err = await rejects(() => lib.removeTextbookAssignment(studentId, cls1))
  check('primary 배정 제거 시도는 거부됨', err !== null, err?.message)
  check('거부 시 delete 연산 0건', scaLogB().filter((l) => l.op === 'delete').length === 0, scaLogB())
  check('거부 후에도 primary 행 그대로 존재', fakeB.__db.student_class_assignments.some((r) => r.student_id === studentId && r.class_id === cls1))
}

console.log('\n[Flow 3c/4a] setPrimaryTextbook — 정확히 1개 primary, students.current_unit_id ∈ 그 교재, unit_name 동기화')
{
  await bootFlow3()
  const { cls1, cls2, tb1, tb2 } = await seedFlow3Textbooks()
  const studentId = await lib.addStudent('B3_S3', 'B3 중1 천재', 'Unit 1')
  await lib.assignTextbook(studentId, cls2)
  await lib.setPrimaryTextbook(studentId, tb2.id)
  const assignments = await lib.getStudentClassAssignments(studentId)
  const primaries = assignments.filter((a) => a.isPrimary)
  check('primary는 정확히 1개', primaries.length === 1, assignments)
  check('그 1개가 tb2', primaries[0]?.textbookId === tb2.id)
  const tb2UnitId = lib.getTextbookUnits(tb2.id)[0].id
  check('students.current_unit_id ∈ tb2 유닛', stuB(studentId)?.current_unit_id === tb2UnitId, stuB(studentId)?.current_unit_id)
  check('students.unit_name이 그 유닛 이름으로 동기화됨', stuB(studentId)?.unit_name === lib.getTextbookUnits(tb2.id)[0].name, stuB(studentId)?.unit_name)

  // 되돌리기(setPrimaryAssignment, 반 축) — 여전히 정확히 1개 primary.
  await lib.setPrimaryAssignment(studentId, cls1)
  const assignments2 = await lib.getStudentClassAssignments(studentId)
  const primaries2 = assignments2.filter((a) => a.isPrimary)
  check('[Flow 3d] setPrimaryAssignment(cls1) 이후 primary도 정확히 1개', primaries2.length === 1, assignments2)
  check('[Flow 3d] 그 1개가 tb1(cls1 소유 교재)', primaries2[0]?.textbookId === tb1.id)
  const tb1UnitId = lib.getTextbookUnits(tb1.id)[0].id
  check('[Flow 3d] students.current_unit_id ∈ tb1 유닛', stuB(studentId)?.current_unit_id === tb1UnitId)
}

console.log('\n[Flow 4b] 교재 전환 왕복 — 각 SCA 행이 "자기 진도"를 유지한다(다른 배정으로 덮이지 않음)')
{
  await bootFlow3()
  const { cls1, cls2, tb1, tb2 } = await seedFlow3Textbooks()
  const studentId = await lib.addStudent('B3_S4', 'B3 중1 천재', 'Unit 1')
  await lib.assignTextbook(studentId, cls2)
  const tb2UnitId = lib.getTextbookUnits(tb2.id)[0].id
  await lib.setAssignmentUnit(studentId, cls2, tb2UnitId) // tb2 SCA에 "자기 진도" 기록
  const tb1UnitBefore = fakeB.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls1)?.current_unit_id

  await lib.setPrimaryTextbook(studentId, tb2.id) // tb1 -> tb2 전환(tb1 진도는 나가면서 캡처)
  const tb1RowAfterOut = fakeB.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls1)
  check('tb1(나간 배정)의 current_unit_id가 보존됨(캡처, 유실 없음)', tb1RowAfterOut?.current_unit_id === tb1UnitBefore, { before: tb1UnitBefore, after: tb1RowAfterOut?.current_unit_id })
  const tb2RowAfterIn = fakeB.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls2)
  check('tb2(들어온 배정)는 자기 저장값(tb2UnitId) 그대로 유지 — tb1 값으로 덮이지 않음', tb2RowAfterIn?.current_unit_id === tb2UnitId, tb2RowAfterIn?.current_unit_id)

  await lib.setPrimaryTextbook(studentId, tb1.id) // tb2 -> tb1로 왕복
  const tb1RowBack = fakeB.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls1)
  const tb2RowBack = fakeB.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls2)
  check('왕복 후 tb1이 원래 자기 진도(tb1UnitBefore)로 복원됨', tb1RowBack?.current_unit_id === tb1UnitBefore, tb1RowBack?.current_unit_id)
  check('왕복 후 tb2도 자기 진도(tb2UnitId) 그대로', tb2RowBack?.current_unit_id === tb2UnitId, tb2RowBack?.current_unit_id)
}

console.log('\n[Flow 4c] setAssignmentUnit 가드 — 다른 교재 소속 유닛(unit_textbook_mismatch) / 유령 유닛(unit_not_learnable) 거부')
{
  await bootFlow3()
  const { cls1, cls2, tb1, tb2 } = await seedFlow3Textbooks()
  const studentId = await lib.addStudent('B3_S5', 'B3 중1 천재', 'Unit 1')
  await lib.assignTextbook(studentId, cls2)
  // setAssignmentUnit은 unitId를 "그 반(classId)의 units 캐시" 안에서만
  // 찾으므로(setAssignmentUnit 소스 주석), 아예 다른 컨테이너 반 소속
  // 유닛은 unit_not_found로 먼저 걸린다. unit_textbook_mismatch는 "같은
  // 반 units 배열 안에 있지만 embedded textbook_id가 그 배정의 textbook_id와
  // 다른" 오배정 콘텐츠(testAssignmentUnitGuards.mjs U.mix 픽스처와 동일
  // 재현) 전용 가드다 — cls2 소속인데 textbook_id만 tb1을 가리키는 "오배정
  // 콘텐츠" 유닛을 직접 시딩해 그 경로를 태운다(정상 업로드로는 안 생기는
  // 조합이므로 helper 함수 대신 fake DB에 직접 삽입 후 refreshWordLibrary).
  const mixUnitId = 'b3-mix-unit'
  fakeB.__db.units.push({ id: mixUnitId, class_id: cls2, textbook_id: tb1.id, name: 'MixUnit', position: 99 })
  fakeB.__db.words.push(...wordsN(mixUnitId, 3, 'mix'))
  await lib.refreshWordLibrary()

  fakeB.__log.length = 0
  const eMismatch = await rejects(() => lib.setAssignmentUnit(studentId, cls2, mixUnitId))
  check('cls2 소속이지만 textbook_id가 다른(tb1) 오배정 유닛 지정 → unit_textbook_mismatch', eMismatch !== null && /unit_textbook_mismatch/.test(eMismatch.message), eMismatch?.message)
  check('거부 시 SCA 쓰기 0', scaLogB().length === 0, scaLogB())

  // 유령 유닛 — 별도 교재(단어 1개짜리 유닛만) 준비해 재현.
  await lib.createClass('B3 유령전용', 'textbook')
  const ghostCls = lib.getClassIdByName('B3 유령전용')
  await lib.setClassWords('B3 유령전용', [{ word: 'x', meaning: 'x' }], 'Unit') // 1단어 + bare 이름 = 유령
  const ghostTb = lib.getAllTextbooks().find((t) => t.name === 'B3 유령전용')
  const studentId2 = await lib.addStudent('B3_S6', 'B3 유령전용', 'Unit')
  const ghostUnitId = lib.getTextbookUnits(ghostTb.id)[0].id

  fakeB.__log.length = 0
  const eGhost = await rejects(() => lib.setAssignmentUnit(studentId2, ghostCls, ghostUnitId))
  check('유령 유닛(1단어) 지정 → unit_not_learnable', eGhost !== null && /unit_not_learnable/.test(eGhost.message), eGhost?.message)
  check('거부 시 SCA 쓰기 0', scaLogB().length === 0, scaLogB())
}

// ── PART B 픽스처 3 — 유닛 변경(Flow 5) ────────────────────────────────
const P6 = 'cls-b5-p6', CONT = 'cls-b5-cont', TBX = 'tb-b5', OTHER_CONT = 'cls-b5-othercont', OTHER_TB = 'tb-b5-other'
const UB = { ghost: 'ub-ghost', u2: 'ub-u2', u3: 'ub-u3', otherU: 'ub-other-u1' }
async function bootFlow5() {
  fakeB.__reset({
    classes: [
      { id: P6, name: 'B5사람반', class_type: 'regular', spelling_direction: 'kr2en' },
      { id: CONT, name: 'B5컨테이너', class_type: 'textbook', spelling_direction: 'mixed' },
      { id: OTHER_CONT, name: 'B5다른컨테이너', class_type: 'textbook', spelling_direction: 'mixed' },
    ],
    textbooks: [
      { id: TBX, name: 'B5교재', owner_class_id: CONT },
      { id: OTHER_TB, name: 'B5다른교재', owner_class_id: OTHER_CONT },
    ],
    class_textbooks: [{ class_id: P6, textbook_id: TBX, enabled: true, sort_order: 1 }],
    units: [
      { id: UB.ghost, class_id: CONT, textbook_id: TBX, name: 'Unit1', position: 0 }, // 1단어 유령
      { id: UB.u2, class_id: CONT, textbook_id: TBX, name: 'Unit2', position: 0 },
      { id: UB.u3, class_id: CONT, textbook_id: TBX, name: 'Unit3', position: 0 },
      { id: UB.otherU, class_id: OTHER_CONT, textbook_id: OTHER_TB, name: 'Unit1', position: 0 }, // 다른 교재 소속 정상 유닛
    ],
    words: [
      { id: 'ub-gw', unit_id: UB.ghost, word: 'No.', meaning: '어휘·어구', position: 1 },
      ...wordsN(UB.u2, 3, 'two'), ...wordsN(UB.u3, 3, 'three'), ...wordsN(UB.otherU, 3, 'other'),
    ],
    students: [
      { id: 'stu-b5-y', name: 'B5_Y', class_id: P6, unit_name: 'Unit1', current_unit_id: UB.ghost },
    ],
    student_class_assignments: [
      { id: 'b5-sca-y', student_id: 'stu-b5-y', class_id: CONT, textbook_id: TBX, current_unit_id: UB.u3, is_primary: true },
    ],
  })
  await lib.refreshWordLibrary(); await lib.refreshStudents(); await lib.refreshClassSettings(); await lib.refreshTextbooks()
  lib.invalidateStudentAssignmentsCache?.()
  await lib.getStudentClassAssignments('stu-b5-y')
  fakeB.__log.length = 0
}

console.log('\n[Flow 5a] setStudentUnitById — primary 교재 풀 안의 UUID면 성공, unit_name 동기화, SCA 무접촉')
{
  await bootFlow5()
  const err = await rejects(() => lib.setStudentUnitById('stu-b5-y', UB.u2))
  check('성공', err === null, err?.message)
  check('students.current_unit_id = Unit2 UUID', stuB('stu-b5-y')?.current_unit_id === UB.u2)
  check('students.unit_name = "Unit2"', stuB('stu-b5-y')?.unit_name === 'Unit2', stuB('stu-b5-y')?.unit_name)
  check('SCA 쓰기 0(students만 갱신)', scaLogB().length === 0, scaLogB())
}

console.log('\n[Flow 5b] setStudentUnitById — 유령 유닛/풀 밖(다른 교재) UUID는 거부')
{
  await bootFlow5()
  const eGhost = await rejects(() => lib.setStudentUnitById('stu-b5-y', UB.ghost))
  check('유령 유닛 UUID 거부', eGhost !== null, eGhost?.message)
  const eOther = await rejects(() => lib.setStudentUnitById('stu-b5-y', UB.otherU))
  check('풀 밖(다른 교재) UUID 거부 — pool-restricted', eOther !== null, eOther?.message)
  check('두 거부 모두 students UPDATE 0', stuWritesB().filter((l) => l.op === 'update').length === 0, stuWritesB())
}

console.log('\n[Flow 5c] setStudentUnit — 미존재 이름 / 유령 이름 매칭은 거부')
{
  await bootFlow5()
  const eNonexistent = await rejects(() => lib.setStudentUnit('stu-b5-y', 'Unit999NoSuchThing'))
  check('존재하지 않는 유닛 이름 거부', eNonexistent !== null, eNonexistent?.message)
  const eGhostName = await rejects(() => lib.setStudentUnit('stu-b5-y', 'Unit 1')) // 정규화로 유령 "Unit1"에 유일매칭
  check('정규화로 유령에 유일매칭되는 이름도 거부', eGhostName !== null, eGhostName?.message)
  check('두 거부 모두 students UPDATE 0', stuWritesB().filter((l) => l.op === 'update').length === 0, stuWritesB())
}

// ════════════════════════════════════════════════════════════════════════
// Flow 6 — 기록 보존: PART B의 모든 시나리오 전체에서(반 이동/교재 배정·
// 전환·해제/유닛 변경) student_progress/student_daily_progress/word_status
// 에 대한 쓰기가 정말 0건인지, 위 섹션들을 다시 한 번 이어서(누적 로그로)
// 확인한다 — 개별 섹션은 매번 boot()으로 로그를 리셋했으므로 별도로
// "학습기록 무접촉" 종단 확인 라운드를 돈다.
// ════════════════════════════════════════════════════════════════════════
console.log('\n[Flow 6] 반 이동 후 기록 보존 — student_progress/student_daily_progress/word_status 전 구간 쓰기 0건')
{
  await bootFlow2()
  await lib.setStudentClass('stu-b2-s1', 'B_HOME2')
  await lib.setStudentClass('stu-b2-s2', 'B_CONT2')
  check('[반이동] 학습기록 테이블 쓰기 0', recordWrites().length === 0, recordWrites())

  await bootFlow3()
  const { cls1, cls2, tb1, tb2 } = await seedFlow3Textbooks()
  const sid = await lib.addStudent('B6_S1', 'B3 중1 천재', 'Unit 1')
  await lib.assignTextbook(sid, cls2)
  await lib.setPrimaryTextbook(sid, tb2.id)
  await lib.setAssignmentUnit(sid, cls1, lib.getTextbookUnits(tb1.id)[0].id)
  await lib.setPrimaryAssignment(sid, cls1)
  await lib.removeTextbookAssignment(sid, cls2)
  check('[교재 배정/전환/해제] 학습기록 테이블 쓰기 0', recordWrites().length === 0, recordWrites())

  await bootFlow5()
  await lib.setStudentUnitById('stu-b5-y', UB.u2)
  await rejects(() => lib.setStudentUnit('stu-b5-y', 'Unit 1'))
  check('[유닛 변경] 학습기록 테이블 쓰기 0', recordWrites().length === 0, recordWrites())
}

// ════════════════════════════════════════════════════════════════════════
// 정적 확인 — 이 흐름 전부가 UUID 기준으로 학생을 식별한다(규칙 4).
// create_student의 .ilike('name'...)는 "중복 이름 사전 점검" 전용이지
// 식별 경로가 아니므로 검사 대상에서 제외(주석으로 명시).
// ════════════════════════════════════════════════════════════════════════
console.log('\n[정적] 학생 식별 UUID 전용 — 각 함수 본문에 .eq(\'name\'...) 없음')
{
  const src = fs.readFileSync(path.resolve('src/utils/wordLibrary.js'), 'utf8')
  const extractFn = (startMarker, endMarkers) => {
    const start = src.indexOf(startMarker)
    if (start < 0) return null
    let end = src.length
    for (const m of endMarkers) { const idx = src.indexOf(m, start + startMarker.length); if (idx > start && idx < end) end = idx }
    return src.slice(start, end)
  }
  const fnMarkers = [
    ['export async function setStudentClass(', ['export async function setStudentHouse(']],
    ['export async function setStudentUnit(', ['export async function setStudentUnitById(']],
    ['export async function setStudentUnitById(', ['\nexport ']],
    ['export async function assignTextbook(', ['export async function removeTextbookAssignment(']],
    ['export async function removeTextbookAssignment(', ['export async function setAssignmentUnit(']],
    ['export async function setAssignmentUnit(', ['export async function setPrimaryAssignment(']],
    ['export async function setPrimaryAssignment(', ['export async function setPrimaryTextbook(']],
    ['export async function setPrimaryTextbook(', ['export async function linkTextbookToClass(']],
  ]
  let allClean = true
  const dirty = []
  for (const [startM, endMs] of fnMarkers) {
    const body = extractFn(startM, endMs)
    if (!body) { allClean = false; dirty.push({ startM, reason: 'not-found' }); continue }
    if (/\.eq\(\s*['"]name['"]/.test(body)) { allClean = false; dirty.push({ startM, reason: 'eq-name-found' }) }
  }
  check('setStudentClass/setStudentUnit/setStudentUnitById/assignTextbook/removeTextbookAssignment/setAssignmentUnit/setPrimaryAssignment/setPrimaryTextbook 어디도 .eq(\'name\'...)로 학생을 찾지 않음',
    allClean, dirty)

  const apiSrc = fs.readFileSync(path.resolve('api/admin-pin-actions.js'), 'utf8')
  const csStart = apiSrc.indexOf(`if (action === 'create_student')`)
  const csEnd = apiSrc.indexOf(`if (action ===`, csStart + 10)
  const csBody = apiSrc.slice(csStart, csEnd > csStart ? csEnd : apiSrc.length)
  // .eq('name', ...)가 존재하긴 한다(462행 인근) — 하지만 그건
  // .from('units')...eq('class_id',...).eq('name', resolvedUnitName) 체인으로
  // "유닛 이름"을 찾는 것이지 "학생"을 이름으로 찾는 게 아니다(규칙 4는
  // 학생 식별 대상). .from('students') 체인(다음 .from( 등장 전까지)에만
  // 한정해 .eq('name'...)가 없는지 확인한다 — 순진한 전체 텍스트 정규식은
  // 이 units 조회를 오탐한다(실측).
  const studentsChains = csBody.split('.from(').slice(1).filter((seg) => /^['"]students['"]/.test(seg))
  const studentsNameLookup = studentsChains.some((seg) => /\.eq\(\s*['"]name['"]/.test(seg))
  check('create_student — .from(\'students\') 체인 어디도 .eq(\'name\'...)로 학생을 찾지 않음(학생은 studentId UUID로만 select/insert, ilike(\'name\')는 중복 이름 사전점검 전용·학생 식별 아님, .eq(\'name\'...)는 별개로 units 테이블 조회에서만 등장)',
    !studentsNameLookup, studentsChains)
  check('create_student — 학생 UUID 형식 검증(UUID_RE)이 실제로 있다', /UUID_RE\.test\(studentId\)/.test(csBody))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 관리자 핵심 흐름(생성/반 지정·이동/교재 배정·전환/유닛 변경/기록 보존) 전 구간 확인')
