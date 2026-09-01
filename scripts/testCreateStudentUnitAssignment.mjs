// create_student 신규 학생 교재/유닛 배정 회귀 테스트 (2026-09-01)
//
// 배경(실사고): 2026-08-31 박민준·박성준이 Pre-Middle School(regular 반)에
// create_student로 생성될 때, 유닛 조회가 units.class_id = <사람 반> 기준이라
// 유닛을 소유하지 않는 regular 반에서는 항상 실패했다(units는 교재 컨테이너
// 반에 귀속). 그 결과 students.current_unit_id = NULL + SCA primary 행의
// textbook_id/current_unit_id = NULL 인 "껍데기 배정"이 만들어졌고,
// health:students UNIT_INVALID FAIL 2건 -> Release Gate 차단으로 이어졌다
// (데이터는 v3_41로 수동 복구 완료 — 이 테스트는 코드 재발 방지).
//
// 반과 교재는 독립이다(2026-08-07 확정 정책): 같은 반 학생이라도 서로 다른
// 교재를 공부할 수 있으므로 class_id만으로 유닛을 추론하면 안 된다. 원칙:
//   학생의 primary textbook(요청의 textbookId)
//   -> 그 교재의 실제 첫 학습 유닛(단어 2개 이상 — 유령 유닛은 정확히 1단어)
//   -> students.current_unit_id + SCA(textbook_id, current_unit_id)
//
// 하네스 방식: testPinSetupCapability.mjs와 동일 — admin-pin-actions.js를
// esbuild로 번들하되 @supabase/supabase-js만 인메모리 가짜로 치환해 핸들러를
// 실제 구동한다. 네트워크 0, 실제 DB 접촉 0, 실학생 요청 0.
//
// 규칙 15(FAIL-first): 수정 전 코드로 먼저 실행해 핵심 단언이 실측 FAIL하는
// 것을 확인한 뒤 수정한다 — 결과는 커밋 메시지/handoff에 기록.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

process.env.ADMIN_PIN = '4729'
process.env.SESSION_SECRET = 'create-student-unit-test-secret'
const ADMIN_PIN = process.env.ADMIN_PIN

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

// ── 인메모리 가짜 supabase (다중 테이블) ──────────────────────────────
const fakePath = path.join(TMP, 'fakeSupabaseForCreateStudent.mjs')
fs.writeFileSync(fakePath, `
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
      // students.id 중복은 실제 PK 제약처럼 23505를 돌려준다(멱등 replay 검증용)
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
const fakeUrl = pathToFileURL(fakePath).href

const realPinAuth = pathToFileURL(path.resolve('api/_pinAuth.js')).href
const fakePinAuthPath = path.join(TMP, 'fakePinAuthForCreateStudent.mjs')
fs.writeFileSync(fakePinAuthPath,
  `export const supabaseAdminUrl = () => 'https://fake.supabase.co'
export const supabaseAdminKey = () => 'fake-service-role-key'
export * from ${JSON.stringify(realPinAuth)}
`, 'utf8')
const fakePinAuthUrl = pathToFileURL(fakePinAuthPath).href

const outfile = path.join(TMP, 'createStudent.admin.bundle.mjs')
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

// ── 픽스처 (전부 하네스 전용 가짜 UUID — 실학생/실반 무관) ─────────────
const RC  = '10000000-0000-4000-8000-00000000000a' // regular 반(유닛 미소유 — PMS 모델)
const CC  = '20000000-0000-4000-8000-00000000000b' // 교재 컨테이너 반(TB1 소유)
const TB1 = '30000000-0000-4000-8000-00000000000c' // RC에 연결된 교재
const TB2 = '30000000-0000-4000-8000-00000000000d' // RC에 연결되지 않은 교재
const TB3 = '30000000-0000-4000-8000-00000000000e' // RC에 연결됐지만 유령 유닛뿐인 교재
const U_GHOST = '40000000-0000-4000-8000-000000000001' // "Unit1" 1단어(엑셀 헤더 잔재 모델)
const U2      = '40000000-0000-4000-8000-000000000002' // "Unit2" 3단어 — 실제 첫 학습 유닛
const U3      = '40000000-0000-4000-8000-000000000003' // "Unit3" 3단어
const U_G2    = '40000000-0000-4000-8000-000000000004' // TB3의 유일한 유닛(1단어)
const SID = (n) => `9000000${n}-0000-4000-8000-00000000000${n}`

function seed() {
  fake.__reset()
  // 실제 스키마 모델 그대로: 교재 컨테이너 반은 교재를 정확히 1권 소유한다
  // ("반당 1권 전제" — v3_20 기록). TB2/TB3은 각자의 컨테이너 반 소유.
  const CC2 = '20000000-0000-4000-8000-00000000000c'
  const CC3 = '20000000-0000-4000-8000-00000000000d'
  fake.__db.classes.push(
    { id: RC, name: 'QA Regular Class' }, { id: CC, name: 'QA Container Class' },
    { id: CC2, name: 'QA Container Class 2' }, { id: CC3, name: 'QA Container Class 3' },
  )
  fake.__db.textbooks.push(
    { id: TB1, name: 'QA 교재1', owner_class_id: CC },
    { id: TB2, name: 'QA 교재2(미연결)', owner_class_id: CC2 },
    { id: TB3, name: 'QA 교재3(유령뿐)', owner_class_id: CC3 },
  )
  fake.__db.class_textbooks.push(
    { class_id: RC, textbook_id: TB1, enabled: true },
    { class_id: RC, textbook_id: TB3, enabled: true },
  )
  // units는 컨테이너 반 소유(class_id=CC) + 교재 귀속(textbook_id) — 실제 스키마 그대로
  fake.__db.units.push(
    { id: U_GHOST, name: 'Unit1', class_id: CC, textbook_id: TB1, position: 1 },
    { id: U2, name: 'Unit2', class_id: CC, textbook_id: TB1, position: 2 },
    { id: U3, name: 'Unit3', class_id: CC, textbook_id: TB1, position: 3 },
    { id: U_G2, name: 'Unit1', class_id: '20000000-0000-4000-8000-00000000000d', textbook_id: TB3, position: 1 },
  )
  fake.__db.words.push(
    { id: 'w1', unit_id: U_GHOST, word: 'No.', meaning: '어휘·어구' }, // 유령: 정확히 1단어
    { id: 'w2', unit_id: U2, word: 'welcome', meaning: '환영하다' },
    { id: 'w3', unit_id: U2, word: 'positive', meaning: '긍정적인' },
    { id: 'w4', unit_id: U2, word: 'invent', meaning: '발명하다' },
    { id: 'w5', unit_id: U3, word: 'capture', meaning: '포착하다' },
    { id: 'w6', unit_id: U3, word: 'remain', meaning: '남다' },
    { id: 'w7', unit_id: U3, word: 'melt', meaning: '녹다' },
    { id: 'w8', unit_id: U_G2, word: 'No.', meaning: '어휘·어구' },
  )
}
const studentRow = (sid) => fake.__db.students.find((s) => s.id === sid)
const scaRow = (sid) => fake.__db.student_class_assignments.find((r) => r.student_id === sid)

console.log('1. [실사고 재현] regular 반 + textbookId — 교재/유닛이 제대로 배정되는가')
{
  seed()
  const r = await callHandler({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(1), name: 'QA생성일', classId: RC, textbookId: TB1 })
  check('생성 성공', r.body?.ok === true, JSON.stringify(r.body))
  check('students.current_unit_id = 첫 학습 유닛(Unit2, 유령 Unit1 스킵)', studentRow(SID(1))?.current_unit_id === U2, String(studentRow(SID(1))?.current_unit_id))
  check('SCA primary 행이 생성됨', !!scaRow(SID(1)) && scaRow(SID(1)).is_primary === true)
  check('SCA.textbook_id = 요청한 교재(껍데기 배정 재발 방지)', scaRow(SID(1))?.textbook_id === TB1, String(scaRow(SID(1))?.textbook_id))
  check('SCA.current_unit_id = students와 동일(Unit2)', scaRow(SID(1))?.current_unit_id === U2)
  check('class_id는 사람 반(regular) 그대로 — 반/교재 독립', studentRow(SID(1))?.class_id === RC && scaRow(SID(1))?.class_id === RC)
}

console.log('\n2. 명시적 unitName — 관리자가 고른 유닛을 그대로 쓴다')
{
  seed()
  const r = await callHandler({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(2), name: 'QA생성이', classId: RC, textbookId: TB1, unitName: 'Unit3' })
  check('생성 성공', r.body?.ok === true, JSON.stringify(r.body))
  check('명시한 Unit3이 배정됨', studentRow(SID(2))?.current_unit_id === U3, String(studentRow(SID(2))?.current_unit_id))
  check('SCA도 Unit3', scaRow(SID(2))?.current_unit_id === U3)
}

console.log('\n3. 표기 흔들림("Unit 3" vs "Unit3") — 정규화 유일 후보 매칭')
{
  seed()
  const r = await callHandler({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(3), name: 'QA생성삼', classId: RC, textbookId: TB1, unitName: 'Unit 3' })
  check('생성 성공', r.body?.ok === true, JSON.stringify(r.body))
  check('"Unit 3"이 Unit3으로 해석됨(findUnitByName 규칙과 동일)', studentRow(SID(3))?.current_unit_id === U3, String(studentRow(SID(3))?.current_unit_id))
}

console.log('\n4. 반에 연결되지 않은 교재 — fail-closed 거부, 학생 미생성')
{
  seed()
  const r = await callHandler({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(4), name: 'QA생성사', classId: RC, textbookId: TB2 })
  check('invalid_textbook으로 거부', r.body?.ok === false && r.body?.reason === 'invalid_textbook', JSON.stringify(r.body))
  check('학생 행이 만들어지지 않음', !studentRow(SID(4)))
}

console.log('\n5. UUID 형식이 아닌 textbookId — 거부, 학생 미생성')
{
  seed()
  const r = await callHandler({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(5), name: 'QA생성오', classId: RC, textbookId: 'not-a-uuid' })
  check('형식 오류 거부', r.body?.ok === false && r.body?.reason === 'invalid_textbook', JSON.stringify(r.body))
  check('학생 행이 만들어지지 않음', !studentRow(SID(5)))
}

console.log('\n6. [무회귀] 컨테이너 반 + textbookId 없음 — 기존 class_id 경로 그대로 + 소유 교재 자동 기입')
{
  seed()
  const r = await callHandler({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(6), name: 'QA생성육', classId: CC, unitName: 'Unit2' })
  check('생성 성공(기존 동작 보존)', r.body?.ok === true, JSON.stringify(r.body))
  check('유닛이 기존처럼 이름으로 해석됨(Unit2)', studentRow(SID(6))?.current_unit_id === U2, String(studentRow(SID(6))?.current_unit_id))
  check('SCA.textbook_id에 반 소유 교재가 채워짐(껍데기 절반 방지)', scaRow(SID(6))?.textbook_id === TB1, String(scaRow(SID(6))?.textbook_id))
}

console.log('\n7. [정직 기록] regular 반 + textbookId 없음 — 추측 배정하지 않는다')
{
  // 반에 교재가 여러 개 연결된 regular 반에서 교재 지정이 없으면 어느
  // 교재인지 서버가 추측할 수 없다(다수결 배정 금지 — 운영자 원칙). 유닛은
  // null로 남기되 생성 자체는 성공한다(구버전 클라이언트 호환, 규칙 9).
  seed()
  const r = await callHandler({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(7), name: 'QA생성칠', classId: RC })
  check('생성은 성공(하위호환)', r.body?.ok === true, JSON.stringify(r.body))
  check('유닛은 추측하지 않고 null', studentRow(SID(7))?.current_unit_id == null)
}

console.log('\n8. 유령 유닛뿐인 교재 — 1단어 유닛을 첫 학습 유닛으로 고르지 않는다')
{
  seed()
  const r = await callHandler({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(8), name: 'QA생성팔', classId: RC, textbookId: TB3 })
  check('생성은 성공(교재는 유효)', r.body?.ok === true, JSON.stringify(r.body))
  check('유령(1단어) 유닛이 배정되지 않음(null 유지)', studentRow(SID(8))?.current_unit_id == null, String(studentRow(SID(8))?.current_unit_id))
  check('SCA.textbook_id는 기록됨(교재 배정 자체는 유효)', scaRow(SID(8))?.textbook_id === TB3)
}

console.log('\n9. 멱등 replay — 같은 studentId 재요청은 기존 계약 그대로')
{
  seed()
  await callHandler({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(9), name: 'QA생성구', classId: RC, textbookId: TB1 })
  const r2 = await callHandler({ action: 'create_student', adminPin: ADMIN_PIN, studentId: SID(9), name: 'QA생성구', classId: RC, textbookId: TB1 })
  check('재요청이 idempotentReplay로 성공', r2.body?.ok === true && r2.body?.idempotentReplay === true, JSON.stringify(r2.body))
  check('학생 행이 1개뿐', fake.__db.students.filter((s) => s.id === SID(9)).length === 1)
}

console.log('\n10. UI 소비 계약 정적 검사 — 생성 폼이 교과서를 지정해 보낸다 (StudentDirectory.jsx)')
{
  const uiSrc = fs.readFileSync(path.resolve('src/components/admin/StudentDirectory.jsx'), 'utf8')
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((line) => {
      const m = line.match(/(?<!:)\/\/.*/)
      return m ? line.slice(0, m.index) : line
    }).join('\n')
  const uiCodeOnly = stripComments(uiSrc)
  check('create_student payload에 textbookId가 있다', /action: 'create_student'[\s\S]{0,400}textbookId/.test(uiCodeOnly))
  check('생성 폼에 교과서 선택 UI가 있다(getClassTextbooks 사용)', /getClassTextbooks/.test(uiCodeOnly))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 신규 학생 교재/유닛 배정이 반이 아니라 교재 기준으로 확정됨')
