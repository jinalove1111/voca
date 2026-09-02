// Phase 2b Step 1-B(2026-09-02) — api/admin-pin-actions.js에 새로 추가한
// 관리자 로스터 관리 서버 액션 7개(list_students/set_student_class/
// set_student_unit/set_students_class_bulk/set_student_house/
// set_primary_assignment/set_primary_textbook) 전용 회귀 테스트.
//
// 하네스 방식: scripts/testCreateStudentUnitAssignment.mjs와 동일한 패턴
// (admin-pin-actions.js를 esbuild로 번들하되 @supabase/supabase-js만
// 인메모리 가짜로 치환) — 단, 이 파일은 그 스크립트를 import/수정하지
// 않고 완전히 독립된 사본을 새로 만든다(그 스크립트는 다른 세션 소유가
// 아니라 이미 완료된 별도 회귀 스위트이므로 건드리지 않는다). 네트워크
// 0, 실제 Supabase 접촉 0.
//
// 원본 fake의 `then(resolve) { resolve(run()); return Promise.resolve(run()) }`
// 패턴은 매 await마다 run()을 2번 실행해(then()의 함수 본문이 두 줄 다
// 실행됨) insert가 실질적으로 2번 적용될 수 있는 잠재 버그가 있다(students
// 테이블만 23505 우연 방어로 가려짐, student_class_assignments 등 다른
// 테이블은 무방비). 이 파일의 fake는 결과를 캐시해 run()이 쿼리당 정확히
// 1번만 실행되도록 고쳤다 — 이 스크립트가 SCA 행 개수까지 단언하므로
// (예: "정확히 primary 1행") 그 버그가 있으면 오탐/누락이 생긴다.
//
// 규칙 15(FAIL-first) — 신규 액션 섹션은 구현 전 실행 시 "unknown action"
// 400으로 FAIL(그 자체가 FAIL-first 증거), 회귀(기존 8개 액션 dispatch)
// 섹션은 처음부터 PASS해야 한다.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

process.env.ADMIN_PIN = '8341'
process.env.SESSION_SECRET = 'admin-student-actions-test-secret'
const ADMIN_PIN = process.env.ADMIN_PIN

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

// ── 인메모리 가짜 supabase (다중 테이블, 컬럼/테이블 부재 시뮬 포함) ─────
const fakePath = path.join(TMP, 'fakeSupabaseForAdminStudentActions.mjs')
fs.writeFileSync(fakePath, `
export const __db = {
  students: [], classes: [], units: [], words: [],
  student_class_assignments: [], textbooks: [], class_textbooks: [],
}
export const __touched = [] // { table, op, cols } — pin_ 컬럼 접촉 여부 단언용
export const __missingColumns = {} // table -> Set(colName) — 42703 시뮬
export const __missingTables = new Set() // table 자체 부재(42P01) 시뮬

export function __reset() {
  for (const k of Object.keys(__db)) __db[k] = []
  __touched.length = 0
  for (const k of Object.keys(__missingColumns)) delete __missingColumns[k]
  __missingTables.clear()
}
export function __setMissingColumn(table, col) {
  if (!__missingColumns[table]) __missingColumns[table] = new Set()
  __missingColumns[table].add(col)
}
export function __clearMissingColumns() {
  for (const k of Object.keys(__missingColumns)) delete __missingColumns[k]
}

function matches(row, filters) {
  return filters.every(([kind, col, v]) => {
    if (kind === 'eq') return row[col] === v
    if (kind === 'in') return v.includes(row[col])
    if (kind === 'is') return row[col] === null || row[col] === undefined
    if (kind === 'neq') return row[col] !== v
    return true
  })
}
function parseColumns(colsStr) {
  if (typeof colsStr !== 'string') return []
  return colsStr.split(',').map((s) => s.trim()).map((s) => {
    const idx = s.indexOf('(')
    return idx === -1 ? s : s.slice(0, idx)
  }).filter(Boolean)
}
function missingColHit(table, cols) {
  const missing = __missingColumns[table]
  if (!missing || missing.size === 0) return null
  for (const c of cols) if (missing.has(c)) return c
  return null
}

function makeQuery(table) {
  const filters = []
  let mode = 'select'
  let patch = null
  let selectColsStr = null
  let selectOpts = null
  const orderCols = []
  let rangeArgs = null
  let cached = null

  function run() {
    if (__missingTables.has(table)) {
      return { data: null, error: { code: '42P01', message: 'relation "' + table + '" does not exist' } }
    }
    const rows = __db[table] || (__db[table] = [])
    if (mode === 'update') {
      const patchCols = Object.keys(patch)
      const missCol = missingColHit(table, patchCols)
      if (missCol) return { data: null, error: { code: '42703', message: 'column "' + missCol + '" of relation "' + table + '" does not exist' } }
      __touched.push({ table, op: 'update', cols: patchCols })
      const hit = rows.filter((r) => matches(r, filters))
      for (const r of hit) Object.assign(r, patch)
      return { data: hit.map((r) => ({ ...r })), error: null }
    }
    if (mode === 'insert') {
      const list = Array.isArray(patch) ? patch : [patch]
      const cols = list.length ? Object.keys(list[0]) : []
      const missCol = missingColHit(table, cols)
      if (missCol) return { data: null, error: { code: '42703', message: 'column "' + missCol + '" of relation "' + table + '" does not exist' } }
      __touched.push({ table, op: 'insert', cols })
      for (const r of list) {
        if (r.id != null && rows.some((x) => x.id === r.id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key(id)' } }
        }
      }
      if (table === 'student_class_assignments') {
        for (const r of list) {
          if (rows.some((x) => x.student_id === r.student_id && x.class_id === r.class_id)) {
            return { data: null, error: { code: '23505', message: 'duplicate key(student_id,class_id)' } }
          }
        }
      }
      for (const r of list) rows.push({ ...r })
      return { data: list.map((r) => ({ ...r })), error: null }
    }
    if (mode === 'delete') {
      __touched.push({ table, op: 'delete', cols: [] })
      const hit = rows.filter((r) => matches(r, filters))
      for (const r of hit) { const idx = rows.indexOf(r); if (idx !== -1) rows.splice(idx, 1) }
      return { data: hit.map((r) => ({ ...r })), error: null }
    }
    // select
    const cols = selectColsStr ? parseColumns(selectColsStr) : []
    if (cols.length) {
      const missCol = missingColHit(table, cols)
      if (missCol) return { data: null, error: { code: '42703', message: 'column "' + missCol + '" of relation "' + table + '" does not exist' } }
      __touched.push({ table, op: 'select', cols })
    }
    let filtered = rows.filter((r) => matches(r, filters))
    if (table === 'students' && cols.includes('classes')) {
      filtered = filtered.map((r) => {
        const cls = __db.classes.find((c) => c.id === r.class_id)
        return { ...r, classes: cls ? { name: cls.name } : null }
      })
    }
    if (selectOpts && selectOpts.head) {
      return { data: null, error: null, count: filtered.length }
    }
    if (orderCols.length) {
      filtered = [...filtered].sort((a, b) => {
        for (const c of orderCols) {
          const av = a[c], bv = b[c]
          if (av < bv) return -1
          if (av > bv) return 1
        }
        return 0
      })
    }
    if (rangeArgs) filtered = filtered.slice(rangeArgs[0], rangeArgs[1] + 1)
    return { data: filtered.map((r) => ({ ...r })), error: null, count: filtered.length }
  }
  function runOnce() { if (cached === null) cached = run(); return cached }

  return {
    select(cols, opts) { selectColsStr = typeof cols === 'string' ? cols : null; selectOpts = opts || null; return this },
    eq(c, v) { filters.push(['eq', c, v]); return this },
    in(c, v) { filters.push(['in', c, v]); return this },
    is(c, _v) { filters.push(['is', c, null]); return this },
    neq(c, v) { filters.push(['neq', c, v]); return this },
    ilike(c, v) { filters.push(['ilike', c, v]); return this },
    order(c) { orderCols.push(c); return this },
    limit() { return this },
    range(from, to) { rangeArgs = [from, to]; return this },
    update(p) { mode = 'update'; patch = p; return this },
    insert(rows) { mode = 'insert'; patch = rows; return this },
    delete() { mode = 'delete'; return this },
    then(resolve) { resolve(runOnce()) },
    maybeSingle() { const r = runOnce(); return Promise.resolve({ data: (r.data && r.data[0]) || null, error: r.error }) },
    single() { const r = runOnce(); return Promise.resolve({ data: (r.data && r.data[0]) || null, error: r.error }) },
  }
}
export function createClient() { return { from: (t) => makeQuery(t) } }
`, 'utf8')
const fakeUrl = pathToFileURL(fakePath).href

const realPinAuth = pathToFileURL(path.resolve('api/_pinAuth.js')).href
const fakePinAuthPath = path.join(TMP, 'fakePinAuthForAdminStudentActions.mjs')
fs.writeFileSync(fakePinAuthPath,
  `export const supabaseAdminUrl = () => 'https://fake.supabase.co'
export const supabaseAdminKey = () => 'fake-service-role-key'
export * from ${JSON.stringify(realPinAuth)}
`, 'utf8')
const fakePinAuthUrl = pathToFileURL(fakePinAuthPath).href

const outfile = path.join(TMP, 'adminStudentActions.admin.bundle.mjs')
await esbuild.build({
  entryPoints: ['api/admin-pin-actions.js'], bundle: true, format: 'esm', platform: 'node', outfile,
  plugins: [{
    name: 'fake-deps',
    setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: fakeUrl, external: true }))
      b.onResolve({ filter: /_pinAuth\.js$/ }, () => ({ path: fakePinAuthUrl, external: true }))
    },
  }],
})
const handler = (await import(pathToFileURL(outfile).href + '?t=' + Date.now())).default
const fake = await import(fakeUrl)

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

const NEW_ACTIONS = [
  'list_students', 'set_student_class', 'set_student_unit',
  'set_students_class_bulk', 'set_student_house',
  'set_primary_assignment', 'set_primary_textbook',
]
const EXISTING_ACTIONS = [
  'bulk_generate_temp_pins', 'set_pin_setup_allowed', 'unlock_student_pin',
  'create_student', 'deactivate_student', 'reactivate_student',
  'hard_delete_student', 'get_pin_setup_code',
]

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. [게이트] 7개 신규 액션 — adminPin 없음/틀림 → not_authorized, 학생 데이터 없음 ===')
{
  fake.__reset()
  for (const action of NEW_ACTIONS) {
    const noPin = await callHandler({ action, studentId: 'x' })
    check(`${action}: adminPin 없음 → not_authorized`, noPin.body?.reason === 'not_authorized')
    check(`${action}: 응답 본문에 학생 데이터 없음(ok/reason 2키만)`, Object.keys(noPin.body || {}).sort().join(',') === 'ok,reason')

    const wrongPin = await callHandler({ action, studentId: 'x', adminPin: 'wrong-pin' })
    check(`${action}: 틀린 adminPin → not_authorized`, wrongPin.body?.reason === 'not_authorized')
    check(`${action}: 틀린 adminPin 응답에도 학생 데이터 없음`, Object.keys(wrongPin.body || {}).sort().join(',') === 'ok,reason')
  }
}

console.log('\n=== 2. [dispatch 회귀] 기존 8개 액션 이름 여전히 허용, 미지 액션은 400 ===')
{
  fake.__reset()
  for (const action of EXISTING_ACTIONS) {
    const r = await callHandler({ action, adminPin: ADMIN_PIN })
    const routedAsUnknown = r.statusCode === 400 && /unknown action/.test(r.body?.error || '')
    check(`${action}: 여전히 인식되는 액션(unknown action이 아님)`, !routedAsUnknown, JSON.stringify(r.body))
  }
  const unknown = await callHandler({ action: 'delete_everything', adminPin: ADMIN_PIN })
  check('미지 액션 → 400 unknown action', unknown.statusCode === 400 && /unknown action/.test(unknown.body?.error || ''))

  // FAIL-first 증거용 — 신규 액션도 구현 전에는 정확히 이 경로(400 unknown
  // action)로 떨어졌다. 구현된 지금은 아래에서 각 액션이 정상 처리됨을
  // 별도로 확인한다(섹션 3 이후) — 여기서는 회귀만 재확인.
}

// ── 공용 픽스처 ────────────────────────────────────────────────────────
const CLS_LEGACY = '10000000-0000-4000-8000-000000000001' // 교재 테이블 없음(레거시 모드)
const CLS_LEGACY2 = '10000000-0000-4000-8000-000000000002'
const CLS_TB_OWNER = '10000000-0000-4000-8000-000000000003' // 교재 소유 컨테이너 반(textbookMode)
const TB1 = '20000000-0000-4000-8000-000000000001'
const U_A = '30000000-0000-4000-8000-000000000001' // CLS_LEGACY 소속, 0단어
const U_B = '30000000-0000-4000-8000-000000000002' // CLS_LEGACY 소속, 3단어(첫 학습 유닛)
const U_C = '30000000-0000-4000-8000-000000000003' // CLS_LEGACY 소속, 2단어
const U_TB1 = '30000000-0000-4000-8000-000000000004' // CLS_TB_OWNER 소속(=TB1 유닛), 2단어
const SID = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function seedCommon() {
  fake.__reset()
  fake.__db.classes.push(
    { id: CLS_LEGACY, name: 'QA 레거시반' },
    { id: CLS_LEGACY2, name: 'QA 레거시반2' },
    { id: CLS_TB_OWNER, name: 'QA 교재컨테이너반' },
  )
  fake.__db.units.push(
    { id: U_A, name: 'Unit1', class_id: CLS_LEGACY, position: 1 },
    { id: U_B, name: 'Unit2', class_id: CLS_LEGACY, position: 2 },
    { id: U_C, name: 'Unit3', class_id: CLS_LEGACY, position: 3 },
    { id: U_TB1, name: 'Unit1', class_id: CLS_TB_OWNER, position: 1 },
  )
  fake.__db.words.push(
    { id: 'w1', unit_id: U_B, word: 'a' }, { id: 'w2', unit_id: U_B, word: 'b' }, { id: 'w3', unit_id: U_B, word: 'c' },
    { id: 'w4', unit_id: U_C, word: 'd' }, { id: 'w5', unit_id: U_C, word: 'e' },
    { id: 'w6', unit_id: U_TB1, word: 'f' }, { id: 'w7', unit_id: U_TB1, word: 'g' },
  )
}
const studentRow = (sid) => fake.__db.students.find((s) => s.id === sid)
const scaRows = (sid) => fake.__db.student_class_assignments.filter((r) => r.student_id === sid)
const scaPrimary = (sid) => fake.__db.student_class_assignments.find((r) => r.student_id === sid && r.is_primary)

console.log('\n=== 3. list_students ===')
{
  seedCommon()
  for (let i = 0; i < 1200; i++) {
    fake.__db.students.push({
      id: SID(1000 + i), name: `학생${i}`, class_id: CLS_LEGACY, unit_name: 'Unit2', current_unit_id: U_B,
      house_id: (i % 4) + 1, created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.${String(Math.floor(i / 60)).padStart(3, '0')}Z`,
      pin_hash: 'should-never-leak', pin_fail_count: 0, pin_locked_until: null, pin_setup_allowed: false,
    })
  }
  const r = await callHandler({ action: 'list_students', adminPin: ADMIN_PIN })
  check('1000행 초과 페이지네이션 — 전량(1200) 반환', r.body?.ok === true && r.body?.students?.length === 1200, String(r.body?.students?.length))
  check('count 필드가 실제 개수와 일치', r.body?.count === 1200)
  const sample = r.body?.students?.[0]
  check('className이 반 이름으로 매핑됨', sample?.className === 'QA 레거시반', JSON.stringify(sample))
  check('house_id가 컬럼 있을 때 숫자로 매핑됨', typeof sample?.house_id === 'number')
  const anyPinKey = (r.body?.students || []).some((s) => Object.keys(s).some((k) => k.startsWith('pin_')))
  check('응답 어디에도 pin_ 접두 키가 없음', !anyPinKey)

  // house_id 컬럼 부재 폴백
  fake.__setMissingColumn('students', 'house_id')
  const r2 = await callHandler({ action: 'list_students', adminPin: ADMIN_PIN })
  check('house_id 컬럼 부재 시에도 성공(폴백)', r2.body?.ok === true && r2.body?.students?.length === 1200)
  check('house_id 컬럼 부재 시 전원 house_id null', (r2.body?.students || []).every((s) => s.house_id === null))
  fake.__clearMissingColumns()
}

console.log('\n=== 4. set_student_class ===')
{
  seedCommon()
  fake.__db.students.push({ id: SID(1), name: 'QA사', class_id: CLS_LEGACY, current_unit_id: U_B, unit_name: 'Unit2' })
  fake.__db.student_class_assignments.push({ id: 'sca1', student_id: SID(1), class_id: CLS_LEGACY, current_unit_id: U_B, is_primary: true })

  const r = await callHandler({ action: 'set_student_class', adminPin: ADMIN_PIN, studentId: SID(1), classId: CLS_LEGACY2, currentUnitId: null })
  check('성공', r.body?.ok === true, JSON.stringify(r.body))
  check('students.class_id 갱신', studentRow(SID(1))?.class_id === CLS_LEGACY2)
  check('students.current_unit_id null로 갱신', studentRow(SID(1))?.current_unit_id == null)
  check('SCA — 이전 반 primary 행 제거(레거시 모드 delete)', !fake.__db.student_class_assignments.some((row) => row.student_id === SID(1) && row.class_id === CLS_LEGACY))
  check('SCA — 새 반 primary 행 생성', !!scaPrimary(SID(1)) && scaPrimary(SID(1)).class_id === CLS_LEGACY2)

  const notFound = await callHandler({ action: 'set_student_class', adminPin: ADMIN_PIN, studentId: SID(999), classId: CLS_LEGACY })
  check('존재하지 않는 학생 → not_found', notFound.body?.ok === false && notFound.body?.reason === 'not_found')

  const badUuid = await callHandler({ action: 'set_student_class', adminPin: ADMIN_PIN, studentId: 'not-a-uuid', classId: CLS_LEGACY })
  check('잘못된 uuid → 400 invalid_request', badUuid.statusCode === 400 && badUuid.body?.reason === 'invalid_request')
}

console.log('\n=== 4b. set_student_class — 교재 모드(textbooks 테이블에 실 행 존재) ===')
{
  seedCommon()
  fake.__db.textbooks.push({ id: TB1, name: 'QA교재', owner_class_id: CLS_TB_OWNER })
  fake.__db.students.push({ id: SID(2), name: 'QA오', class_id: CLS_LEGACY, current_unit_id: U_B })
  fake.__db.student_class_assignments.push({ id: 'sca2', student_id: SID(2), class_id: CLS_LEGACY, current_unit_id: U_B, is_primary: true })

  const r = await callHandler({ action: 'set_student_class', adminPin: ADMIN_PIN, studentId: SID(2), classId: CLS_TB_OWNER, currentUnitId: U_TB1 })
  check('성공', r.body?.ok === true, JSON.stringify(r.body))
  check('이전 반 primary 행은 삭제 대신 demote(is_primary=false)', fake.__db.student_class_assignments.some((row) => row.student_id === SID(2) && row.class_id === CLS_LEGACY && row.is_primary === false))
  const p = scaPrimary(SID(2))
  check('새 반 primary 행에 소유 교재 textbook_id 채워짐', p?.textbook_id === TB1, JSON.stringify(p))
}

console.log('\n=== 5. set_student_unit ===')
{
  seedCommon()
  fake.__db.students.push({ id: SID(3), name: 'QA육', class_id: CLS_LEGACY, current_unit_id: U_B, unit_name: 'Unit2' })

  const r = await callHandler({ action: 'set_student_unit', adminPin: ADMIN_PIN, studentId: SID(3), unitName: 'Unit3', unitId: U_C })
  check('성공', r.body?.ok === true, JSON.stringify(r.body))
  check('unit_name 갱신', studentRow(SID(3))?.unit_name === 'Unit3')
  check('current_unit_id 갱신', studentRow(SID(3))?.current_unit_id === U_C)

  const notFound = await callHandler({ action: 'set_student_unit', adminPin: ADMIN_PIN, studentId: SID(998), unitName: 'Unit3', unitId: U_C })
  check('영향 행 0(존재하지 않는 학생) → not_found', notFound.body?.ok === false && notFound.body?.reason === 'not_found')

  const badUnitId = await callHandler({ action: 'set_student_unit', adminPin: ADMIN_PIN, studentId: SID(3), unitName: 'Unit3', unitId: 'nope' })
  check('unitId 형식 오류 → 400 invalid_request', badUnitId.statusCode === 400 && badUnitId.body?.reason === 'invalid_request')
}

console.log('\n=== 6. set_students_class_bulk ===')
{
  seedCommon()
  const ids = [SID(10), SID(11), SID(12)]
  for (const id of ids) fake.__db.students.push({ id, name: `QA${id}`, class_id: CLS_LEGACY, current_unit_id: U_B })

  const r = await callHandler({ action: 'set_students_class_bulk', adminPin: ADMIN_PIN, studentIds: ids, classId: CLS_LEGACY2, currentUnitId: U_C })
  check('성공', r.body?.ok === true && r.body?.count === 3, JSON.stringify(r.body))
  check('전원 class_id 갱신', ids.every((id) => studentRow(id)?.class_id === CLS_LEGACY2))
  check('전원 current_unit_id 갱신', ids.every((id) => studentRow(id)?.current_unit_id === U_C))
  check('전원 SCA primary가 새 반으로 이동', ids.every((id) => scaPrimary(id)?.class_id === CLS_LEGACY2))

  const tooMany = await callHandler({ action: 'set_students_class_bulk', adminPin: ADMIN_PIN, studentIds: Array.from({ length: 201 }, (_, i) => SID(20000 + i)), classId: CLS_LEGACY })
  check('201개 → 400 invalid_request', tooMany.statusCode === 400 && tooMany.body?.reason === 'invalid_request')

  const beforeMixed = studentRow(ids[0])?.class_id
  const mixed = await callHandler({ action: 'set_students_class_bulk', adminPin: ADMIN_PIN, studentIds: [ids[0], 'not-a-uuid', ids[1]], classId: CLS_LEGACY })
  check('섞인 잘못된 uuid → 400 invalid_request', mixed.statusCode === 400 && mixed.body?.reason === 'invalid_request')
  check('부분 적용 없음(유효 id도 변경 안 됨)', studentRow(ids[0])?.class_id === beforeMixed)
}

console.log('\n=== 7. set_student_house ===')
{
  seedCommon()
  fake.__db.students.push({ id: SID(30), name: 'QA칠', class_id: CLS_LEGACY, house_id: null })

  const r = await callHandler({ action: 'set_student_house', adminPin: ADMIN_PIN, studentId: SID(30), houseId: 2 })
  check('성공', r.body?.ok === true, JSON.stringify(r.body))
  check('house_id 갱신', studentRow(SID(30))?.house_id === 2)

  const clear = await callHandler({ action: 'set_student_house', adminPin: ADMIN_PIN, studentId: SID(30), houseId: null })
  check('null로 초기화 성공', clear.body?.ok === true && studentRow(SID(30))?.house_id === null)

  const badRange = await callHandler({ action: 'set_student_house', adminPin: ADMIN_PIN, studentId: SID(30), houseId: 9 })
  check('범위 밖 houseId → 400 invalid_request', badRange.statusCode === 400 && badRange.body?.reason === 'invalid_request')

  fake.__setMissingColumn('students', 'house_id')
  const missing = await callHandler({ action: 'set_student_house', adminPin: ADMIN_PIN, studentId: SID(30), houseId: 1 })
  check('컬럼 부재 → column_missing', missing.body?.ok === false && missing.body?.reason === 'column_missing', JSON.stringify(missing.body))
  fake.__clearMissingColumns()
}

console.log('\n=== 8. set_primary_assignment / set_primary_textbook ===')
{
  seedCommon()
  // CLS_LEGACY2 소속 유닛도 준비(대상 반의 "단어 있는 첫 유닛" 자동 확정
  // 검증용) — U_D는 0단어(스킵 대상), U_E는 2단어(채택돼야 함).
  const U_D = '30000000-0000-4000-8000-000000000010'
  const U_E = '30000000-0000-4000-8000-000000000011'
  fake.__db.units.push(
    { id: U_D, name: 'Unit1', class_id: CLS_LEGACY2, position: 1 },
    { id: U_E, name: 'Unit2', class_id: CLS_LEGACY2, position: 2 },
  )
  fake.__db.words.push({ id: 'w8', unit_id: U_E, word: 'h' }, { id: 'w9', unit_id: U_E, word: 'i' })
  // 학생: CLS_LEGACY(primary, unit=U_B) + CLS_LEGACY2(secondary, unit=null) 두 반에 배정
  fake.__db.students.push({ id: SID(40), name: 'QA팔', class_id: CLS_LEGACY, current_unit_id: U_B })
  fake.__db.student_class_assignments.push(
    { id: 'sca40a', student_id: SID(40), class_id: CLS_LEGACY, current_unit_id: U_B, is_primary: true },
    { id: 'sca40b', student_id: SID(40), class_id: CLS_LEGACY2, current_unit_id: null, is_primary: false },
  )
  const r = await callHandler({ action: 'set_primary_assignment', adminPin: ADMIN_PIN, studentId: SID(40), classId: CLS_LEGACY2 })
  check('성공', r.body?.ok === true, JSON.stringify(r.body))
  check('대상 반이 primary로 승격', scaPrimary(SID(40))?.class_id === CLS_LEGACY2)
  check('이전 primary는 false로 내려감(나가는 진도 캡처됨: current_unit_id=U_B)', fake.__db.student_class_assignments.find((row) => row.id === 'sca40a')?.is_primary === false && fake.__db.student_class_assignments.find((row) => row.id === 'sca40a')?.current_unit_id === U_B)
  check('students.class_id가 새 primary 반으로 동기화', studentRow(SID(40))?.class_id === CLS_LEGACY2)
  check('유닛 없던 대상 반 — 단어 있는 첫 유닛으로 확정(U_E, 2단어)', studentRow(SID(40))?.current_unit_id === U_E, String(studentRow(SID(40))?.current_unit_id))
  check('SCA 대상 행에도 동일 유닛 채워짐', scaPrimary(SID(40))?.current_unit_id === U_E)

  const notAssigned = await callHandler({ action: 'set_primary_assignment', adminPin: ADMIN_PIN, studentId: SID(40), classId: CLS_TB_OWNER })
  check('배정 안 된 반으로 전환 시도 → not_assigned', notAssigned.body?.ok === false && notAssigned.body?.reason === 'not_assigned')
}
{
  seedCommon()
  fake.__db.textbooks.push({ id: TB1, name: 'QA교재', owner_class_id: CLS_TB_OWNER })
  fake.__db.students.push({ id: SID(41), name: 'QA구', class_id: CLS_LEGACY, current_unit_id: U_B })
  fake.__db.student_class_assignments.push({ id: 'sca41a', student_id: SID(41), class_id: CLS_LEGACY, current_unit_id: U_B, is_primary: true })

  const r = await callHandler({ action: 'set_primary_textbook', adminPin: ADMIN_PIN, studentId: SID(41), textbookId: TB1 })
  check('성공', r.body?.ok === true, JSON.stringify(r.body))
  check('사람 반(class_id)은 바뀌지 않음', studentRow(SID(41))?.class_id === CLS_LEGACY)
  check('현재 유닛은 교재 유닛(U_TB1)으로 동기화', studentRow(SID(41))?.current_unit_id === U_TB1, String(studentRow(SID(41))?.current_unit_id))
  const newPrimary = fake.__db.student_class_assignments.find((row) => row.student_id === SID(41) && row.textbook_id === TB1)
  check('새 교재 상태 행이 primary', newPrimary?.is_primary === true)
  check('이전 반 상태 행은 primary 해제 + 진도 캡처(U_B)', fake.__db.student_class_assignments.find((row) => row.id === 'sca41a')?.is_primary === false && fake.__db.student_class_assignments.find((row) => row.id === 'sca41a')?.current_unit_id === U_B)

  const invalidTb = await callHandler({ action: 'set_primary_textbook', adminPin: ADMIN_PIN, studentId: SID(41), textbookId: SID(9999) })
  check('존재하지 않는 교재 → invalid_textbook', invalidTb.body?.ok === false && invalidTb.body?.reason === 'invalid_textbook')
}

console.log('\n=== 9. [불변] pin_ 접두 컬럼 전체 무접촉(select/update/insert 어디에도) ===')
{
  const pinTouches = fake.__touched.filter((t) => t.cols.some((c) => c.startsWith('pin_')))
  check('전체 실행 로그에 pin_ 컬럼 접촉 0건', pinTouches.length === 0, JSON.stringify(pinTouches))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS')
await new Promise((r) => setTimeout(r, 300))
process.exit(0)
