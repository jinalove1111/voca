// 관리자 교재 배정 쓰기 함수 — 유령 유닛 재발 방지 가드 회귀 테스트 (2026-09-03)
//
// 배경(재발 갭, handoff 참고): 2026-09-02 실사고 이후 PR #7(5c589a8)은
// 관리자 유닛 "셀렉터" 노출만 막았다 — 아래 3개 저장 함수는 여전히 검증
// 없이 유령 유닛을 SCA/students에 쓸 수 있었다(재발 지점):
//   · setAssignmentUnit  — 존재 여부만 확인, isLearnableUnit/이름 검사 없음
//   · setPrimaryAssignment — 저장값이 있으면 존재만 재확인하고 그대로 채택
//   · setPrimaryTextbook   — 위와 동일 + 같은 "0단어면 첫 유닛" 폴백
// 이 스위트는 세 함수가 이제 유령 유닛을 절대 채택하지 않고, 학습 가능
// 유닛으로 결정론적으로 폴백(또는 폴백 대상도 없으면 throw)하는지 검증한다.
//
// 하네스: scripts/testAdminUnitEdit.mjs의 "쓰기 기록형 가짜 supabase +
// wordLibrary 번들" 패턴을 그대로 재사용한다(그 파일 자체는 읽기만 하고
// 수정하지 않음 — 이 파일은 독립된 복제본). esbuild로 src/utils/
// wordLibrary.js를 번들하되 supabaseClient만 이 파일의 인메모리 가짜로
// external 치환 — update/insert/delete를 전부 기록해 "쓰기 0" 단언이
// 가능하다. 네트워크 0, 실제 DB 접촉 0.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

// ── 인메모리 가짜 supabase(쓰기 기록) — testAdminUnitEdit.mjs와 동일 계약 ──
const fakePath = path.join(TMP, 'fakeSupabaseForAssignmentUnitGuards.mjs')
fs.writeFileSync(fakePath, `
export const __db = { classes: [], units: [], words: [], students: [], textbooks: [], class_textbooks: [], student_class_assignments: [], daily_assignments: [] }
export const __log = []
export function __reset(ds) { for (const k of Object.keys(__db)) __db[k] = (ds[k] || []).map((r) => ({ ...r })); __log.length = 0; __pending.length = 0 }
// 2026-09-03 섹션 6(레거시 분기 읽기 실패 주입) 전용 — 다음 매칭 호출(테이블+
// 모드) 1건에 한해 실제 결과 대신 지정한 에러를 반환한다(네트워크 실패/RLS
// 등을 재현). 다른 섹션은 호출하지 않으므로 기존 동작 무회귀.
const __pending = []
export function __failNext(table, mode, err) { __pending.push({ table, mode, err }) }
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
    const pendingIdx = __pending.findIndex((p) => p.table === st.table && p.mode === st.mode)
    if (pendingIdx !== -1) {
      const p = __pending.splice(pendingIdx, 1)[0]
      __log.push({ table: st.table, op: st.mode, injectedError: true })
      return { data: null, error: p.err }
    }
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
const outfile = path.join(TMP, 'wordLibrary.assignmentUnitGuards.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'], bundle: true, format: 'esm', platform: 'node', outfile,
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://offline.invalid'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('offline-test-key'), 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'fake-supabase', setup(b) { b.onResolve({ filter: /supabaseClient(\.js)?$/ }, () => ({ path: fakeUrl, external: true })) } }],
})
const lib = await import(pathToFileURL(outfile).href + '?t=' + Date.now())
const fake = await import(fakeUrl)

let failures = 0, asserted = 0
const check = (label, cond, detail) => { asserted++; if (cond) console.log(`  PASS  ${label}`); else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`); failures++ } }
const rejects = async (fn) => { try { await fn(); return null } catch (e) { return e } }

// ── 픽스처 ──────────────────────────────────────────────────────────────
// HOME  운영 반(사람 반, 유닛 미소유) — 학생들의 students.class_id
// CONT  교재 T의 소유 컨테이너 반(유닛 소유) — G(유령)/U1/U5/U_MIX
// CONT2 교재 T2의 소유 컨테이너 반 — U_MIX의 "실제" 교재(불일치 재현용)
// CONT_EMPTY  교재 T_EMPTY의 소유 컨테이너 반 — 유닛이 유령(G2) 하나뿐
const HOME = 'cls-home', CONT = 'cls-cont', CONT2 = 'cls-cont2', CONT_EMPTY = 'cls-empty'
const TB = 'tb-t', TB2 = 'tb-other', TB_EMPTY = 'tb-empty'
const A = 'stu-a', B = 'stu-b', C = 'stu-c', D = 'stu-d'
const U = { ghost: 'u-ghost', u1: 'u-u1', u5: 'u-u5', mix: 'u-mix', ghost2: 'u-ghost2' }
const words = (uid, n, base) => Array.from({ length: n }, (_, i) => ({ id: `${uid}-w${i}`, unit_id: uid, word: `${base}${i}`, meaning: `뜻${i}`, position: i + 1 }))
const dataset = () => ({
  classes: [
    { id: HOME, name: '홈반', class_type: 'regular', spelling_direction: 'kr2en' },
    { id: CONT, name: '교재T반', class_type: 'textbook', spelling_direction: 'mixed' },
    { id: CONT2, name: '교재T2반', class_type: 'textbook', spelling_direction: 'mixed' },
    { id: CONT_EMPTY, name: '교재Empty반', class_type: 'textbook', spelling_direction: 'mixed' },
  ],
  textbooks: [
    { id: TB, name: '교재T', owner_class_id: CONT },
    { id: TB2, name: '교재T2', owner_class_id: CONT2 },
    { id: TB_EMPTY, name: '교재Empty', owner_class_id: CONT_EMPTY },
  ],
  class_textbooks: [{ class_id: HOME, textbook_id: TB, enabled: true, sort_order: 1 }],
  units: [
    { id: U.ghost, class_id: CONT, textbook_id: TB, name: 'Unit', position: 0 }, // 유령(1단어, 번호 없는 이름)
    { id: U.u1, class_id: CONT, textbook_id: TB, name: 'Unit1', position: 0 },
    { id: U.u5, class_id: CONT, textbook_id: TB, name: 'Unit5', position: 0 },
    // U_MIX — CONT 소속(같은 units 배열)이지만 textbook_id는 T2를 가리키는
    // "오배정 콘텐츠" 재현(교재 불일치 가드 전용 픽스처).
    { id: U.mix, class_id: CONT, textbook_id: TB2, name: 'Unit3', position: 0 },
    { id: U.ghost2, class_id: CONT_EMPTY, textbook_id: TB_EMPTY, name: 'Unit', position: 0 }, // T_EMPTY엔 유령뿐
  ],
  words: [
    { id: 'gw', unit_id: U.ghost, word: 'No.', meaning: '어휘·어구', position: 1 },
    { id: 'gw2', unit_id: U.ghost2, word: 'No.', meaning: '어휘·어구', position: 1 },
    ...words(U.u1, 40, 'one'), ...words(U.u5, 40, 'five'), ...words(U.mix, 40, 'mix'),
  ],
  students: [
    { id: A, name: 'A학생', class_id: HOME, unit_name: 'Unit5', current_unit_id: U.ghost }, // drift: unit_name과 current_unit_id 불일치
    { id: B, name: 'B학생', class_id: HOME, unit_name: 'Unit1', current_unit_id: U.u1 },
    { id: C, name: 'C학생', class_id: HOME, unit_name: 'Unit5', current_unit_id: U.u5 },
    { id: D, name: 'D학생', class_id: HOME, unit_name: 'Unit', current_unit_id: U.ghost2 },
  ],
  student_class_assignments: [
    { id: 'sca-a', student_id: A, class_id: CONT, textbook_id: TB, current_unit_id: U.ghost, is_primary: true },
    { id: 'sca-b', student_id: B, class_id: CONT, textbook_id: TB, current_unit_id: U.ghost, is_primary: false },
    { id: 'sca-b-home', student_id: B, class_id: HOME, textbook_id: null, current_unit_id: U.u1, is_primary: true },
    { id: 'sca-c', student_id: C, class_id: CONT, textbook_id: TB, current_unit_id: U.u5, is_primary: true },
    { id: 'sca-d', student_id: D, class_id: CONT_EMPTY, textbook_id: TB_EMPTY, current_unit_id: U.ghost2, is_primary: true },
  ],
})
async function boot() {
  fake.__reset(dataset())
  await lib.refreshWordLibrary(); await lib.refreshStudents(); await lib.refreshClassSettings(); await lib.refreshTextbooks()
  lib.invalidateStudentAssignmentsCache?.()
  fake.__log.length = 0
}
const stu = (id) => fake.__db.students.find((s) => s.id === id)
const sca = (id) => fake.__db.student_class_assignments.find((r) => r.id === id)
const primarySca = (studentId) => fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.is_primary)
const scaLog = () => fake.__log.filter((l) => l.table === 'student_class_assignments')
const stuUpdates = () => fake.__log.filter((l) => l.table === 'students' && l.op === 'update')
// 3자 invariant — students.current_unit_id == primary SCA.current_unit_id, unit_name == 그 유닛 name.
const assertInvariant = (label, studentId) => {
  const s = stu(studentId)
  const p = primarySca(studentId)
  const unit = lib.getUnitById(s?.current_unit_id)
  check(`${label}: students.current_unit_id == primary SCA.current_unit_id`,
    !!p && s?.current_unit_id === p.current_unit_id, JSON.stringify({ student: s?.current_unit_id, primary: p?.current_unit_id }))
  check(`${label}: unit_name == 유닛 이름`, !!unit && s?.unit_name === unit.name, JSON.stringify({ unit_name: s?.unit_name, actual: unit?.name }))
}

console.log('\n=== 0. 전제: 픽스처가 실사고 구조를 재현한다 ===')
{
  await boot()
  check('getLearnableTextbookUnits(TB) = [Unit1, Unit3(mix), Unit5] (유령 제외, 자연정렬)',
    JSON.stringify(lib.getLearnableTextbookUnits(TB).map((u) => u.name)) === JSON.stringify(['Unit1', 'Unit3', 'Unit5']),
    JSON.stringify(lib.getLearnableTextbookUnits(TB).map((u) => u.name)))
  check('isSuspiciousUnit(유령 G) = true', lib.isSuspiciousUnit(lib.getUnitById(U.ghost)) === true)
  check('isSuspiciousUnit(Unit1) = false', lib.isSuspiciousUnit(lib.getUnitById(U.u1)) === false)
  check('getLearnableTextbookUnits(TB_EMPTY) = [] (유령뿐)', lib.getLearnableTextbookUnits(TB_EMPTY).length === 0)
}

console.log('\n=== 1. setAssignmentUnit 가드 ===')
{
  await boot()
  const e1 = await rejects(() => lib.setAssignmentUnit(B, CONT, U.ghost))
  check('1a. 유령 유닛(G) 지정 → throw unit_not_learnable', e1 !== null && /unit_not_learnable/.test(e1.message), e1?.message)
  check('1a. 쓰기 0', scaLog().length === 0, JSON.stringify(scaLog()))

  const e2 = await rejects(() => lib.setAssignmentUnit(B, CONT, U.mix))
  check('1b. 다른 교재 소속 유닛(U_MIX, textbook_id 불일치) → throw unit_textbook_mismatch', e2 !== null && /unit_textbook_mismatch/.test(e2.message), e2?.message)
  check('1b. 쓰기 0', scaLog().length === 0, JSON.stringify(scaLog()))

  const e3 = await rejects(() => lib.setAssignmentUnit(B, CONT, U.u1))
  check('1c. 정상 유닛(U1) → 성공', e3 === null, e3?.message)
  check('1c. student_class_assignments UPDATE 정확히 1회, payload={current_unit_id:U1}, 영향 1행',
    scaLog().length === 1 && scaLog()[0].hit === 1 && JSON.stringify(scaLog()[0].patch) === JSON.stringify({ current_unit_id: U.u1 }),
    JSON.stringify(scaLog()))
  check('1c. SCA(B) current_unit_id = U1', sca('sca-b')?.current_unit_id === U.u1)
  check('1c. students 테이블 무접촉(setAssignmentUnit은 SCA만 쓴다)', stuUpdates().length === 0, JSON.stringify(stuUpdates()))
}

console.log('\n=== 2. setPrimaryTextbook 가드 ===')
{
  await boot()
  // 저장값이 G(유령) → 채택 안 함, 첫 학습 가능 유닛(U1)으로 폴백.
  const errA = await rejects(() => lib.setPrimaryTextbook(A, TB))
  check('2a. setPrimaryTextbook(A, T) 성공(유령을 채택하는 게 아니라 폴백)', errA === null, errA?.message)
  check('2a. students(A).current_unit_id = U1(첫 학습 가능 유닛)', stu(A)?.current_unit_id === U.u1, stu(A)?.current_unit_id)
  check('2a. students(A).unit_name = "Unit1"', stu(A)?.unit_name === 'Unit1', stu(A)?.unit_name)
  check('2a. primary SCA(A).current_unit_id = U1(동시 갱신)', sca('sca-a')?.current_unit_id === U.u1, sca('sca-a')?.current_unit_id)
  check('2a. 학생 C 무접촉', sca('sca-c')?.current_unit_id === U.u5 && stu(C)?.current_unit_id === U.u5 && stu(C)?.unit_name === 'Unit5')
  assertInvariant('2a', A)

  // 저장값이 U5(정상 학습 가능) → 그대로 유지, 불필요한 SCA 쓰기 없음.
  await boot()
  fake.__log.length = 0
  const errC = await rejects(() => lib.setPrimaryTextbook(C, TB))
  check('2b. setPrimaryTextbook(C, T) 성공(이미 정상 유닛)', errC === null, errC?.message)
  check('2b. students(C).current_unit_id 그대로 U5', stu(C)?.current_unit_id === U.u5)
  check('2b. students(C).unit_name = "Unit5"', stu(C)?.unit_name === 'Unit5')
  check('2b. SCA current_unit_id 재기록(fill) 없음 — 저장값이 이미 정상이라 SCA update 자체가 없음(primary 플립만 발생)',
    !scaLog().some((l) => l.patch && Object.prototype.hasOwnProperty.call(l.patch, 'current_unit_id')),
    JSON.stringify(scaLog()))
  assertInvariant('2b', C)

  // 학습 가능 유닛 0개 교재 → throw, 쓰기 0(SCA/students 모두).
  await boot()
  const errD = await rejects(() => lib.setPrimaryTextbook(D, TB_EMPTY))
  check('2c. 학습 가능 유닛 0개 교재 → throw no_learnable_unit', errD !== null && /no_learnable_unit/.test(errD.message), errD?.message)
  check('2c. 쓰기 0(SCA)', scaLog().length === 0, JSON.stringify(scaLog()))
  check('2c. 쓰기 0(students)', stuUpdates().length === 0, JSON.stringify(stuUpdates()))
}

console.log('\n=== 3. setPrimaryAssignment 가드(동일 계약, 반 축) ===')
{
  await boot()
  const errA = await rejects(() => lib.setPrimaryAssignment(A, CONT))
  check('3a. setPrimaryAssignment(A, CONT) 성공(유령을 채택하는 게 아니라 폴백)', errA === null, errA?.message)
  check('3a. students(A).current_unit_id = U1', stu(A)?.current_unit_id === U.u1, stu(A)?.current_unit_id)
  check('3a. students(A).unit_name = "Unit1"', stu(A)?.unit_name === 'Unit1', stu(A)?.unit_name)
  check('3a. primary SCA(A).current_unit_id = U1', sca('sca-a')?.current_unit_id === U.u1)
  check('3a. 학생 C 무접촉', sca('sca-c')?.current_unit_id === U.u5 && stu(C)?.current_unit_id === U.u5)
  assertInvariant('3a', A)

  await boot()
  const errC = await rejects(() => lib.setPrimaryAssignment(C, CONT))
  check('3b. setPrimaryAssignment(C, CONT) 성공(이미 정상 유닛)', errC === null, errC?.message)
  check('3b. students(C).current_unit_id 그대로 U5', stu(C)?.current_unit_id === U.u5)
  check('3b. students(C).unit_name = "Unit5"', stu(C)?.unit_name === 'Unit5')
  check('3b. SCA current_unit_id 재기록(fill) 없음 — 저장값이 이미 정상이라 SCA update 자체가 없음(primary 플립만 발생)',
    !scaLog().some((l) => l.patch && Object.prototype.hasOwnProperty.call(l.patch, 'current_unit_id')),
    JSON.stringify(scaLog()))
  assertInvariant('3b', C)

  await boot()
  const errD = await rejects(() => lib.setPrimaryAssignment(D, CONT_EMPTY))
  check('3c. 학습 가능 유닛 0개 반 → throw no_learnable_unit', errD !== null && /no_learnable_unit/.test(errD.message), errD?.message)
  check('3c. 쓰기 0(SCA)', scaLog().length === 0, JSON.stringify(scaLog()))
  check('3c. 쓰기 0(students)', stuUpdates().length === 0, JSON.stringify(stuUpdates()))
}

console.log('\n=== 4. 회귀 — 유령 유닛 행 자체는 삭제되지 않는다 ===')
{
  await boot()
  await lib.setPrimaryTextbook(A, TB)
  check('유령 유닛(G) 행은 DB(가짜)에 그대로 존재(삭제 안 함)', fake.__db.units.some((u) => u.id === U.ghost))
}

// 2026-09-03 Track 6(야간 자율 작업) 작업 2 — T1 잔여 갭. getStudentClassAssignments
// 의 읽기 시 self-heal(§ wordLibrary.js maintainPrimaryAssignmentForClassChange
// 호출부 헤더 주석)이 live.unitId를 그대로 새 반의 current_unit_id로 써버리면,
// 그 값이 유령 유닛이어도 "그 반 소속"이라는 이유만으로 채택돼 DB에
// 유령 유닛이 다시 심긴다(재발 지점) — 이 섹션은 legacy(비교재) 모드에서
// primary SCA 행의 class_id가 students.class_id와 어긋난(반 이동 드리프트)
// 케이스를 재현해, self-heal이 유령을 전파하지 않고 첫 학습 가능 유닛으로
// 대체(또는 대체 대상도 없으면 self-heal 자체를 건너뜀 — 쓰기 0, throw 없음)
// 하는지 검증한다. 위 1~4번 픽스처는 전부 교재 모드(textbooks 테이블에
// 행이 있음 → _textbookMode=true)라 이 self-heal 분기(!_textbookMode
// 전용)를 트리거하지 않으므로, 이 섹션만 textbooks가 0개인 별도 픽스처로
// 리셋한다(다른 섹션에 영향 없음 — 매 섹션이 boot()으로 완전히 새로 리셋).
console.log('\n=== 5. getStudentClassAssignments 읽기 self-heal — 유령 유닛 비전파(T1 잔여 갭) ===')
{
  const LEGACY_OLD = 'cls-legacy-old', LEGACY_NEW = 'cls-legacy-new', LEGACY_NEW_EMPTY = 'cls-legacy-empty'
  const LU = { ghost: 'u-legacy-ghost', learnable: 'u-legacy-l1', ghostOnly: 'u-legacy-ghost-only' }
  const E = 'stu-e', F = 'stu-f', G2 = 'stu-g2'
  const legacyDataset = () => ({
    classes: [
      { id: LEGACY_OLD, name: '레거시이전반', class_type: 'regular', spelling_direction: 'kr2en' },
      { id: LEGACY_NEW, name: '레거시새반', class_type: 'regular', spelling_direction: 'kr2en' },
      { id: LEGACY_NEW_EMPTY, name: '레거시학습가능0반', class_type: 'regular', spelling_direction: 'kr2en' },
    ],
    textbooks: [], class_textbooks: [], // 비교재 모드 강제 — _textbookMode=false
    units: [
      { id: LU.ghost, class_id: LEGACY_NEW, textbook_id: null, name: 'Unit', position: 0 }, // 유령(1단어, 번호 없는 이름)
      { id: LU.learnable, class_id: LEGACY_NEW, textbook_id: null, name: 'Unit1', position: 0 },
      { id: LU.ghostOnly, class_id: LEGACY_NEW_EMPTY, textbook_id: null, name: 'Unit', position: 0 }, // 유령뿐인 반
    ],
    words: [
      { id: 'lgw', unit_id: LU.ghost, word: 'No.', meaning: '어휘·어구', position: 1 },
      ...words(LU.learnable, 40, 'leg'),
      { id: 'lgw2', unit_id: LU.ghostOnly, word: 'No.', meaning: '어휘·어구', position: 1 },
    ],
    students: [
      // E: live.unitId가 정상(학습 가능) 유닛 → 기존과 동일하게 그대로 전파.
      { id: E, name: 'E학생', class_id: LEGACY_NEW, unit_name: 'Unit1', current_unit_id: LU.learnable },
      // F: live.unitId가 유령 → 첫 학습 가능 유닛(LU.learnable)으로 대체돼야 함.
      { id: F, name: 'F학생', class_id: LEGACY_NEW, unit_name: 'Unit', current_unit_id: LU.ghost },
      // G2: live.unitId가 유령이고 그 반에 학습 가능 유닛이 0개 → self-heal 스킵(쓰기 0).
      { id: G2, name: 'G2학생', class_id: LEGACY_NEW_EMPTY, unit_name: 'Unit', current_unit_id: LU.ghostOnly },
    ],
    student_class_assignments: [
      // primary SCA 행이 전부 "이전 반"(LEGACY_OLD)을 가리켜, students.class_id
      // (LEGACY_NEW/LEGACY_NEW_EMPTY)와 불일치 — self-heal 트리거 조건.
      { id: 'sca-e', student_id: E, class_id: LEGACY_OLD, textbook_id: null, current_unit_id: null, is_primary: true },
      { id: 'sca-f', student_id: F, class_id: LEGACY_OLD, textbook_id: null, current_unit_id: null, is_primary: true },
      { id: 'sca-g2', student_id: G2, class_id: LEGACY_OLD, textbook_id: null, current_unit_id: null, is_primary: true },
    ],
  })
  async function bootLegacy() {
    fake.__reset(legacyDataset())
    await lib.refreshWordLibrary(); await lib.refreshStudents(); await lib.refreshClassSettings(); await lib.refreshTextbooks()
    lib.invalidateStudentAssignmentsCache?.()
    fake.__log.length = 0
  }
  // maintainPrimaryAssignmentForClassChange는 self-heal 호출부에서 await 없이
  // fire-and-forget으로 실행된다(§ wordLibrary.js 호출부 "non-fatal" 주석) —
  // 가짜 supabase의 다단계 update/insert 체인이 전부 settle할 시간을 준다.
  const flush = () => new Promise((r) => setTimeout(r, 0))

  await bootLegacy()
  const beforeE = await lib.getStudentClassAssignments(E)
  await flush()
  const primaryEAfter = fake.__db.student_class_assignments.find((r) => r.student_id === E && r.is_primary)
  check('5a. 정상 유닛(E) self-heal 후 primary SCA가 새 반(LEGACY_NEW)으로 이동',
    primaryEAfter?.class_id === LEGACY_NEW, JSON.stringify(primaryEAfter))
  check('5a. 정상 유닛(E) self-heal이 유닛 id를 그대로 전파(기존과 동일 payload, 회귀 가드)',
    primaryEAfter?.current_unit_id === LU.learnable, JSON.stringify(primaryEAfter))
  check('5a. 읽기 함수 자체는 throw 없이 배열 반환', Array.isArray(beforeE))

  await bootLegacy()
  await lib.getStudentClassAssignments(F)
  await flush()
  const primaryFAfter = fake.__db.student_class_assignments.find((r) => r.student_id === F && r.is_primary)
  check('5b. 유령 유닛(F, LU.ghost) self-heal은 유령을 전파하지 않음(current_unit_id !== ghost)',
    primaryFAfter?.current_unit_id !== LU.ghost, JSON.stringify(primaryFAfter))
  check('5b. 유령 유닛(F) self-heal이 대신 첫 학습 가능 유닛(LU.learnable)을 채택',
    primaryFAfter?.current_unit_id === LU.learnable, JSON.stringify(primaryFAfter))
  check('5b. 유령 유닛(F) self-heal 후 primary SCA가 새 반(LEGACY_NEW)으로는 이동함(반 복구 자체는 여전히 수행)',
    primaryFAfter?.class_id === LEGACY_NEW, JSON.stringify(primaryFAfter))

  await bootLegacy()
  const rG2 = await (async () => { try { return { err: null, v: await lib.getStudentClassAssignments(G2) } } catch (e) { return { err: e, v: undefined } } })()
  await flush()
  check('5c. 학습 가능 유닛 0개 반(G2) — 읽기 함수는 throw하지 않음(non-fatal 읽기 경로)', rG2.err === null, rG2.err?.message)
  const primaryG2After = fake.__db.student_class_assignments.find((r) => r.student_id === G2 && r.is_primary)
  check('5c. 대체 대상이 없으면 self-heal 자체를 건너뜀 — primary SCA가 여전히 이전 반(LEGACY_OLD)',
    primaryG2After?.class_id === LEGACY_OLD, JSON.stringify(primaryG2After))
  check('5c. 대체 대상이 없으면 self-heal이 건드리지 않아 유닛 값도 원래 그대로(null)',
    primaryG2After?.current_unit_id === null, JSON.stringify(primaryG2After))
}

// 2026-09-03 T4 정적 감사 Med #4 — maintainPrimaryAssignmentForClassChange의
// 레거시 분기(_textbookMode===false && _textbookFetchFailed===false, 즉
// _textbooks 캐시가 비어 있는 특수 시점 — 섹션 5와 동일 트리거 조건)가
// 이전 primary 행을 current_unit_id 캡처 없이 즉시 delete하던 갭을 막는다.
// setStudentClass(교재 모드로 안 가는 유일한 직접 호출부, awaited)로 재현.
console.log('\n=== 6. maintainPrimaryAssignmentForClassChange 레거시 분기 — delete 대신 캡처된 demote 통일 ===')
{
  const L_OLD = 'cls-legacy6-old', L_NEW = 'cls-legacy6-new'
  const LU1 = 'u-legacy6-l1'
  const X = 'stu-legacy6-x'
  const OLD_PROGRESS = 'u-legacy6-old-progress'
  const legacyDataset6 = () => ({
    classes: [
      { id: L_OLD, name: '레거시6구반', class_type: 'regular', spelling_direction: 'kr2en' },
      { id: L_NEW, name: '레거시6새반', class_type: 'regular', spelling_direction: 'kr2en' },
    ],
    textbooks: [], class_textbooks: [], // 비교재 모드 강제 — _textbookMode=false(섹션 5와 동일)
    units: [{ id: LU1, class_id: L_NEW, textbook_id: null, name: 'Unit1', position: 0 }],
    words: [...words(LU1, 40, 'leg6')],
    students: [{ id: X, name: 'X학생', class_id: L_OLD, unit_name: 'OldUnit', current_unit_id: OLD_PROGRESS }],
    student_class_assignments: [
      { id: 'sca-x6', student_id: X, class_id: L_OLD, textbook_id: null, current_unit_id: OLD_PROGRESS, is_primary: true },
    ],
  })
  async function boot6() {
    fake.__reset(legacyDataset6())
    await lib.refreshWordLibrary(); await lib.refreshStudents(); await lib.refreshClassSettings(); await lib.refreshTextbooks()
    lib.invalidateStudentAssignmentsCache?.()
    fake.__log.length = 0
  }

  // 6a — 읽기 성공 → delete 대신 demote, current_unit_id(진도) 보존.
  await boot6()
  await lib.setStudentClass(X, '레거시6새반')
  const oldRow6a = fake.__db.student_class_assignments.find((r) => r.id === 'sca-x6')
  check('6a. 이전 primary 행(sca-x6)이 삭제되지 않고 그대로 존재', !!oldRow6a, JSON.stringify(oldRow6a))
  check('6a. 이전 primary 행이 demote됨(is_primary=false)', oldRow6a?.is_primary === false, JSON.stringify(oldRow6a))
  check('6a. 이전 primary 행의 current_unit_id 보존(진도 유실 없음)', oldRow6a?.current_unit_id === OLD_PROGRESS, JSON.stringify(oldRow6a))
  check('6a. student_class_assignments에 delete 연산 0건', scaLog().filter((l) => l.op === 'delete').length === 0, JSON.stringify(scaLog()))
  const newRow6a = fake.__db.student_class_assignments.find((r) => r.student_id === X && r.class_id === L_NEW && r.is_primary)
  check('6a. 새 반(L_NEW)에 새 primary 행 생성됨', !!newRow6a, JSON.stringify(newRow6a))

  // 6b — 읽기 실패 주입 → delete 미실행 + warn, 이전 행은 완전 무접촉,
  // 새 primary만 생성(데이터 보존 우선, throw 없음 — 기존 non-fatal 계약).
  await boot6()
  fake.__failNext('student_class_assignments', 'select', { code: 'PGRST000', message: 'injected read failure (test)' })
  const warnCalls = []
  const origWarn = console.warn
  console.warn = (...args) => { warnCalls.push(args) }
  try {
    await lib.setStudentClass(X, '레거시6새반')
  } finally {
    console.warn = origWarn
  }
  const oldRow6b = fake.__db.student_class_assignments.find((r) => r.id === 'sca-x6')
  check('6b. 읽기 실패 시 이전 primary 행(sca-x6)이 완전히 무접촉(is_primary 그대로 true)', oldRow6b?.is_primary === true, JSON.stringify(oldRow6b))
  check('6b. 읽기 실패 시 이전 primary 행 current_unit_id도 무접촉', oldRow6b?.current_unit_id === OLD_PROGRESS, JSON.stringify(oldRow6b))
  check('6b. student_class_assignments에 delete 연산 0건', scaLog().filter((l) => l.op === 'delete').length === 0, JSON.stringify(scaLog()))
  check('6b. console.warn 호출됨(non-fatal 보고)', warnCalls.length >= 1, JSON.stringify(warnCalls))
  const newRow6b = fake.__db.student_class_assignments.find((r) => r.student_id === X && r.class_id === L_NEW && r.is_primary)
  check('6b. 새 반(L_NEW)에 새 primary 행은 그래도 생성됨(데이터 보존 우선)', !!newRow6b, JSON.stringify(newRow6b))

  // 6c — 회귀 가드: 교재 모드 분기(섹션 1~4가 이미 검증)는 이 레거시 분기와
  // 무관하게 그대로 동작한다 — 여기서는 교재 모드에서 demote 대신 delete로
  // 되돌아가지 않았는지만 재확인(payload는 섹션 1~4가 이미 고정).
  await boot()
  fake.__log.length = 0
  await lib.setPrimaryTextbook(C, TB)
  check('6c. 교재 모드 경로는 delete를 쓰지 않는다(무회귀)', scaLog().filter((l) => l.op === 'delete').length === 0, JSON.stringify(scaLog()))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 관리자 배정/전환 쓰기 함수는 유령 유닛을 절대 채택하지 않는다')
