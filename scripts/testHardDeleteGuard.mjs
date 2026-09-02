// 2026-09-03 — Track 5(야간 자율 작업) 문제 1. api/admin-pin-actions.js의
// hard_delete_student "데이터 0" 가드에 reward_ledger/entrance_test_results/
// xp_ledger 3개가 누락돼 있던 문제(students DELETE가 on delete cascade로
// 이 3개도 함께 지우는데 가드가 세지 않았음) 전용 회귀 테스트.
//
// 이 파일은 scripts/testAdminStudentActions.mjs의 esbuild 번들 + 인메모리
// 가짜 supabase 패턴을 그대로 복제한 완전히 독립된 사본이다(그 파일은
// 다른 회귀 스위트 소유이므로 import/수정하지 않는다 — 작업 지시 원칙).
// 네트워크 0, 실제 Supabase 접촉 0.
//
// 규칙 15(FAIL-first) — 이 테스트는 구현 전(가드에 3개 테이블 카운트가
// 없던 코드)에서 실행하면 케이스 (a)(b)(c)가 반드시 FAIL한다(실제로
// 가드를 우회해 삭제가 진행되므로). 구현 후에는 전부 PASS해야 한다.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

process.env.ADMIN_PIN = '8341'
process.env.SESSION_SECRET = 'hard-delete-guard-test-secret'
const ADMIN_PIN = process.env.ADMIN_PIN

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

// ── 인메모리 가짜 supabase ────────────────────────────────────────────────
const fakePath = path.join(TMP, 'fakeSupabaseForHardDeleteGuard.mjs')
fs.writeFileSync(fakePath, `
export const __db = {
  students: [], student_class_assignments: [], word_status: [],
  student_progress: [], student_daily_progress: [], spelling_review_queue: [],
  reward_ledger: [], entrance_test_results: [], xp_ledger: [],
}
export const __touched = [] // { table, op, cols }
export const __missingTables = new Set() // 테이블 자체 부재(42P01) 시뮬

export function __reset() {
  for (const k of Object.keys(__db)) __db[k] = []
  __touched.length = 0
  __missingTables.clear()
}

function matches(row, filters) {
  return filters.every(([kind, col, v]) => {
    if (kind === 'eq') return row[col] === v
    if (kind === 'is') return row[col] === null || row[col] === undefined
    return true
  })
}

function makeQuery(table) {
  const filters = []
  let mode = 'select'
  let selectColsStr = null
  let selectOpts = null
  let cached = null

  function run() {
    if (__missingTables.has(table)) {
      return { data: null, error: { code: '42P01', message: 'relation "' + table + '" does not exist' } }
    }
    const rows = __db[table] || (__db[table] = [])
    if (mode === 'delete') {
      __touched.push({ table, op: 'delete', cols: [] })
      const hit = rows.filter((r) => matches(r, filters))
      for (const r of hit) { const idx = rows.indexOf(r); if (idx !== -1) rows.splice(idx, 1) }
      return { data: hit.map((r) => ({ ...r })), error: null }
    }
    // select
    const cols = selectColsStr ? selectColsStr.split(',').map((s) => s.trim()) : []
    if (cols.length) __touched.push({ table, op: 'select', cols })
    let filtered = rows.filter((r) => matches(r, filters))
    if (selectOpts && selectOpts.head) {
      return { data: null, error: null, count: filtered.length }
    }
    return { data: filtered.map((r) => ({ ...r })), error: null, count: filtered.length }
  }
  function runOnce() { if (cached === null) cached = run(); return cached }

  return {
    select(cols, opts) { selectColsStr = typeof cols === 'string' ? cols : null; selectOpts = opts || null; return this },
    eq(c, v) { filters.push(['eq', c, v]); return this },
    is(c, _v) { filters.push(['is', c, null]); return this },
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
const fakePinAuthPath = path.join(TMP, 'fakePinAuthForHardDeleteGuard.mjs')
fs.writeFileSync(fakePinAuthPath,
  `export const supabaseAdminUrl = () => 'https://fake.supabase.co'
export const supabaseAdminKey = () => 'fake-service-role-key'
export * from ${JSON.stringify(realPinAuth)}
`, 'utf8')
const fakePinAuthUrl = pathToFileURL(fakePinAuthPath).href

const outfile = path.join(TMP, 'hardDeleteGuard.admin.bundle.mjs')
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

const SID = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function seedCleanStudent(id) {
  fake.__reset()
  fake.__db.students.push({ id, name: 'QA학생', pin_hash: null })
  fake.__db.student_class_assignments.push({ id: 'sca-' + id, student_id: id })
}

console.log('\n=== (a) reward_ledger 1행 있음(다른 5종 0) → 거부, students 무삭제 ===')
{
  const sid = SID(1)
  seedCleanStudent(sid)
  fake.__db.reward_ledger.push({ id: 'r1', student_id: sid, stars_delta: 5 })
  const r = await callHandler({ action: 'hard_delete_student', adminPin: ADMIN_PIN, studentId: sid })
  check('거부(has_data)', r.body?.ok === false && r.body?.reason === 'has_data', JSON.stringify(r.body))
  check('detail.rewardLedger === 1', r.body?.detail?.rewardLedger === 1, JSON.stringify(r.body?.detail))
  check('students 행 그대로 남아있음(무삭제)', fake.__db.students.some((s) => s.id === sid))
}

console.log('\n=== (b) entrance_test_results 1행 있음 → 거부 ===')
{
  const sid = SID(2)
  seedCleanStudent(sid)
  fake.__db.entrance_test_results.push({ id: 'e1', student_id: sid, score: 10 })
  const r = await callHandler({ action: 'hard_delete_student', adminPin: ADMIN_PIN, studentId: sid })
  check('거부(has_data)', r.body?.ok === false && r.body?.reason === 'has_data', JSON.stringify(r.body))
  check('detail.entranceTestResults === 1', r.body?.detail?.entranceTestResults === 1, JSON.stringify(r.body?.detail))
  check('students 행 그대로 남아있음(무삭제)', fake.__db.students.some((s) => s.id === sid))
}

console.log('\n=== (c) xp_ledger 1행 있음 → 거부 ===')
{
  const sid = SID(3)
  seedCleanStudent(sid)
  fake.__db.xp_ledger.push({ id: 'x1', student_id: sid, amount: 20 })
  const r = await callHandler({ action: 'hard_delete_student', adminPin: ADMIN_PIN, studentId: sid })
  check('거부(has_data)', r.body?.ok === false && r.body?.reason === 'has_data', JSON.stringify(r.body))
  check('detail.xpLedger === 1', r.body?.detail?.xpLedger === 1, JSON.stringify(r.body?.detail))
  check('students 행 그대로 남아있음(무삭제)', fake.__db.students.some((s) => s.id === sid))
}

console.log('\n=== (d) 전부 0 → 삭제 진행(SCA delete → students delete 순서 유지) ===')
{
  const sid = SID(4)
  seedCleanStudent(sid)
  const r = await callHandler({ action: 'hard_delete_student', adminPin: ADMIN_PIN, studentId: sid })
  check('성공', r.body?.ok === true, JSON.stringify(r.body))
  check('students 행 삭제됨', !fake.__db.students.some((s) => s.id === sid))
  check('SCA 행 삭제됨', !fake.__db.student_class_assignments.some((row) => row.student_id === sid))
  const deletes = fake.__touched.filter((t) => t.op === 'delete')
  const scaIdx = deletes.findIndex((t) => t.table === 'student_class_assignments')
  const studentsIdx = deletes.findIndex((t) => t.table === 'students')
  check('삭제 순서 — SCA가 students보다 먼저', scaIdx !== -1 && studentsIdx !== -1 && scaIdx < studentsIdx, JSON.stringify(deletes))
}

console.log('\n=== (e) reward_ledger 테이블 자체 부재 + 나머지 0 → 삭제 진행 + tableMissing 표시 ===')
{
  const sid = SID(5)
  seedCleanStudent(sid)
  fake.__missingTables.add('reward_ledger')
  const r = await callHandler({ action: 'hard_delete_student', adminPin: ADMIN_PIN, studentId: sid })
  check('성공(테이블 부재는 0 취급, fail-open 아님)', r.body?.ok === true, JSON.stringify(r.body))
  check('students 행 삭제됨', !fake.__db.students.some((s) => s.id === sid))
}
{
  // 성공 응답에는 detail이 없으므로(기존 계약), 부재 표시가 실제로
  // 반영되는지는 "거부" 경로에서 확인한다 — 다른 조건 하나를 채워
  // has_data로 떨어뜨리되 reward_ledger 테이블은 여전히 부재.
  const sid = SID(6)
  seedCleanStudent(sid)
  fake.__missingTables.add('reward_ledger')
  fake.__db.xp_ledger.push({ id: 'x2', student_id: sid, amount: 1 })
  const r = await callHandler({ action: 'hard_delete_student', adminPin: ADMIN_PIN, studentId: sid })
  check('거부(다른 조건 때문)', r.body?.ok === false && r.body?.reason === 'has_data', JSON.stringify(r.body))
  check('detail.tableMissing.rewardLedger === true', r.body?.detail?.tableMissing?.rewardLedger === true, JSON.stringify(r.body?.detail))
  check('detail.rewardLedger === 0(부재는 0 취급)', r.body?.detail?.rewardLedger === 0, JSON.stringify(r.body?.detail))
}

console.log('\n=== (f) 응답 어디에도 pin_ 접두 값 없음 ===')
{
  const sid = SID(7)
  seedCleanStudent(sid)
  fake.__db.reward_ledger.push({ id: 'r7', student_id: sid, stars_delta: 1 })
  const r = await callHandler({ action: 'hard_delete_student', adminPin: ADMIN_PIN, studentId: sid })
  const bodyStr = JSON.stringify(r.body)
  check('응답 문자열에 pin_hash/pin_fail_count/pin_locked_until/pin_setup_allowed 키 없음',
    !/"pin_(hash|fail_count|locked_until|setup_allowed)"/.test(bodyStr), bodyStr)
  const pinValueSelects = fake.__touched.filter((t) => t.table === 'students' && t.op === 'select' && t.cols.includes('pin_hash'))
  check('students select cols에 pin_hash 직접 조회 없음(is-null 필터만 사용)', pinValueSelects.length === 0, JSON.stringify(pinValueSelects))
}

console.log('\n=== 회귀 — not_found/invalid_id는 기존과 동일 ===')
{
  fake.__reset()
  const badId = await callHandler({ action: 'hard_delete_student', adminPin: ADMIN_PIN, studentId: 'not-a-uuid' })
  check('잘못된 uuid → invalid_id', badId.body?.ok === false && badId.body?.reason === 'invalid_id')
  const notFound = await callHandler({ action: 'hard_delete_student', adminPin: ADMIN_PIN, studentId: SID(999) })
  check('존재하지 않는 학생 → not_found', notFound.body?.ok === false && notFound.body?.reason === 'not_found')
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS')
await new Promise((r) => setTimeout(r, 300))
process.exit(0)
