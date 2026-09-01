// 관리자 학생 편집 — 유닛 소스/UUID 저장/유령 유닛 거부 회귀 테스트 (2026-09-02)
//
// 배경(실사고, 2026-09-01 Yaeji): 관리자 "반 배정 편집"의 유닛 드롭다운이 학생의 primary
// 교재가 아니라 **사람 반(class)** 의 유닛(getClassUnitNames)을 소스로 썼다. 운영 반 3개는
// 유닛을 소유하지 않아(교재 컨테이너 반이 소유) 드롭다운에 placeholder "Unit 1"만 떴고,
// saveEdit 는 `editUnit || 'Unit 1'` 를 setStudentUnit 에 넘겨 findUnitByName 의 공백제거
// 정규화('unit1')가 교재의 1단어 유령 유닛 "Unit1"에 유일 매칭 → 실학생이 유령 유닛에
// 착지(GHOST_UNIT + DIRECTION_INVALID). 또 saveEdit 는 반이 바뀌지 않아도 setStudentClass 를
// 호출해 current_unit_id 를 NULL 로 덮고 SCA primary demote + 껍데기 행 INSERT 를 유발했다.
//
// 설계 원칙(운영자 확정): primary textbook(SCA)이 교재 기준, students.current_unit_id 가 현재
// 유닛의 권위 값, 반≠교재(같은 반 학생이 다른 교재 사용 가능). 유령 유닛은 DB에서 지우지
// 않고 선택 목록에서만 제외한다(단어 < 2).
//
// 하네스: wordLibrary.js 를 esbuild 로 번들하되 supabaseClient 만 이 파일의 인메모리 가짜로
// 치환(external) — 읽기 전용 fakeSupabaseModule 과 달리 update/insert 를 기록해 쓰기 경로를
// 검증한다. 네트워크 0, 실제 DB 접촉 0. 규칙 15: 수정 전 실행 → 핵심 단언 FAIL 실측 후 수정.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

// ── 인메모리 가짜 supabase(쓰기 기록) ─────────────────────────────────
const fakePath = path.join(TMP, 'fakeSupabaseForAdminUnitEdit.mjs')
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
const outfile = path.join(TMP, 'wordLibrary.adminUnitEdit.bundle.mjs')
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

// ── 픽스처: Presentation 6(regular, 유닛 미소유) + 중1 동아 윤정미(컨테이너) — 실사고 구조 재현 ──
const P6 = 'cls-p6', CONT = 'cls-donga', TB = 'tb-donga', Y = 'stu-yaeji', O = 'stu-other'
const U = { ghost: 'u-ghost', bare: 'u-bare', u2: 'u-2', u3: 'u-3', u7: 'u-7', u8: 'u-8', seven: 'u-seven' }
const words = (uid, n, base) => Array.from({ length: n }, (_, i) => ({ id: `${uid}-w${i}`, unit_id: uid, word: `${base}${i}`, meaning: `뜻${i}`, position: i + 1 }))
const dataset = () => ({
  classes: [{ id: P6, name: 'Presentation 6', class_type: 'regular', spelling_direction: 'kr2en' }, { id: CONT, name: '중1 동아 윤정미', class_type: 'textbook', spelling_direction: 'mixed' }],
  textbooks: [{ id: TB, name: '중1 동아 윤정미', owner_class_id: CONT }],
  class_textbooks: [{ class_id: P6, textbook_id: TB, enabled: true, sort_order: 1 }],
  units: [
    { id: U.ghost, class_id: CONT, textbook_id: TB, name: 'Unit1', position: 0 },
    { id: U.bare, class_id: CONT, textbook_id: TB, name: 'Unit', position: 0 },
    { id: U.u2, class_id: CONT, textbook_id: TB, name: 'Unit2', position: 0 },
    { id: U.u3, class_id: CONT, textbook_id: TB, name: 'Unit3', position: 0 },
    { id: U.u7, class_id: CONT, textbook_id: TB, name: 'Unit 7', position: 0 },
    { id: U.u8, class_id: CONT, textbook_id: TB, name: 'Unit 8', position: 0 },
    { id: U.seven, class_id: CONT, textbook_id: TB, name: '7', position: 0 },
  ],
  words: [
    { id: 'gw', unit_id: U.ghost, word: 'No.', meaning: '어휘·어구', position: 1 }, // 1단어 유령
    { id: 'bw', unit_id: U.bare, word: 'English', meaning: 'Korean', position: 1 }, // 1단어 유령
    ...words(U.u2, 3, 'two'), ...words(U.u3, 3, 'three'), ...words(U.u7, 3, 'seven'), ...words(U.u8, 3, 'eight'), ...words(U.seven, 3, 'bare7'),
  ],
  students: [
    { id: Y, name: 'Yaeji', class_id: P6, unit_name: 'Unit1', current_unit_id: U.ghost },
    { id: O, name: 'Olivia', class_id: P6, unit_name: 'Unit 7', current_unit_id: U.u7 },
  ],
  student_class_assignments: [
    { id: 'sca-y', student_id: Y, class_id: CONT, textbook_id: TB, current_unit_id: U.u3, is_primary: true },
    { id: 'sca-o', student_id: O, class_id: CONT, textbook_id: TB, current_unit_id: U.u7, is_primary: true },
  ],
})
async function boot() {
  fake.__reset(dataset())
  await lib.refreshWordLibrary(); await lib.refreshStudents(); await lib.refreshClassSettings(); await lib.refreshTextbooks()
  lib.invalidateStudentAssignmentsCache?.()
  await lib.getStudentClassAssignments(Y); await lib.getStudentClassAssignments(O)
  fake.__log.length = 0
}
const stu = (id) => fake.__db.students.find((s) => s.id === id)
const scaLog = () => fake.__log.filter((l) => l.table === 'student_class_assignments')
const stuUpdates = () => fake.__log.filter((l) => l.table === 'students' && l.op === 'update')

console.log('\n=== 0. 전제: 실사고 구조 재현 ===')
{
  await boot()
  check('교재 모드 활성', lib.isTextbookMode() === true)
  check('Yaeji primary 교재 = 중1 동아 윤정미', lib.getStudentPrimaryTextbook(Y)?.id === TB)
  check('[옛 소스] getClassUnitNames("Presentation 6") = placeholder ["Unit 1"] (반은 유닛 미소유)', JSON.stringify(lib.getClassUnitNames('Presentation 6')) === JSON.stringify(['Unit 1']))
  check('[함정] findUnitByName(교재 유닛, "Unit 1") 이 정규화로 유령 "Unit1"에 매칭됨(문서화)', lib.findUnitByName(lib.getTextbookUnits(TB), 'Unit 1')?.id === U.ghost)
}

console.log('\n=== A. 편집 유닛 목록 = primary 교재의 학습 가능 유닛 ===')
{
  await boot()
  const opts = typeof lib.getStudentEditableUnits === 'function' ? lib.getStudentEditableUnits(Y) : null
  check('getStudentEditableUnits 존재', Array.isArray(opts))
  const names = (opts || []).map((o) => o.name).sort()
  check('교재의 정상 유닛만(7/Unit 7/Unit 8/Unit2/Unit3) — 반 placeholder 아님', JSON.stringify(names) === JSON.stringify(['7', 'Unit 7', 'Unit 8', 'Unit2', 'Unit3']), JSON.stringify(names))
  check('각 옵션에 실제 unit UUID(id) 포함', (opts || []).length > 0 && (opts || []).every((o) => typeof o.id === 'string' && o.id.length > 0))
}

console.log('\n=== B. "Unit 7" 선택 → 정확한 Unit 7 UUID 로 저장 ===')
{
  await boot()
  const err = await rejects(() => lib.setStudentUnitById(Y, U.u7))
  check('setStudentUnitById 성공', err === null, err?.message)
  check('students.current_unit_id = Unit 7 UUID', stu(Y)?.current_unit_id === U.u7, stu(Y)?.current_unit_id)
  check('students.unit_name = "Unit 7"', stu(Y)?.unit_name === 'Unit 7', stu(Y)?.unit_name)
  check('students UPDATE 정확히 1회, 영향 1행', stuUpdates().length === 1 && stuUpdates()[0].hit === 1, JSON.stringify(stuUpdates()))
  check('E. SCA 쓰기 0 (demote/INSERT 없음)', scaLog().length === 0, JSON.stringify(scaLog()))
  check('다른 학생(Olivia) 무변경', stu(O)?.current_unit_id === U.u7 && stu(O)?.unit_name === 'Unit 7')
}

console.log('\n=== C. "Unit 1" → 유령 "Unit1" 정규화 오매칭이 저장으로 이어지지 않음 ===')
{
  await boot()
  const e1 = await rejects(() => lib.setStudentUnit(Y, 'Unit 1'))
  check('setStudentUnit(Y,"Unit 1") 는 명시적으로 거부(throw)', e1 !== null, '허용됨')
  check('거부 시 DB 무변경(여전히 이전 값)', stu(Y)?.current_unit_id === U.ghost && stuUpdates().length === 0)
  const e2 = await rejects(() => lib.setStudentUnitById(Y, U.ghost))
  check('setStudentUnitById(유령 UUID) 거부', e2 !== null && /단어|유령|학습/.test(e2.message || ''), e2?.message || '허용됨')
  const e3 = await rejects(() => lib.setStudentUnitById(Y, 'u-nope'))
  check('setStudentUnitById(미존재 UUID) 거부', e3 !== null)
  const e4 = await rejects(() => lib.setStudentUnitById('stu-nope', U.u7))
  check('미존재 학생은 silent no-op 이 아니라 거부', e4 !== null)
  const e5 = await rejects(() => lib.setStudentUnit('stu-nope', 'Unit 7'))
  check('setStudentUnit(미존재 학생) 도 거부(과거엔 조용히 return)', e5 !== null)
  check('위 거부들로 인한 students UPDATE 0', stuUpdates().length === 0)
}

console.log('\n=== F. 유령/빈 유닛(단어<2) 은 목록에서 제외, DB 는 그대로 ===')
{
  await boot()
  check('isLearnableUnit(유령)=false / (Unit2)=true', typeof lib.isLearnableUnit === 'function' && lib.isLearnableUnit(lib.getUnitById(U.ghost)) === false && lib.isLearnableUnit(lib.getUnitById(U.u2)) === true)
  const opts = typeof lib.getStudentEditableUnits === 'function' ? lib.getStudentEditableUnits(Y) : []
  check('목록에 단어<2 유닛 없음', opts.every((o) => o.wordCount >= 2) && !opts.some((o) => o.id === U.ghost || o.id === U.bare))
  check('유령 유닛 행은 DB(가짜)에 그대로 존재(삭제 안 함)', fake.__db.units.some((u) => u.id === U.ghost))
}

console.log('\n=== G. 회귀: 이름 기반 setStudentUnit(학생 화면 경로) 정상 유닛은 그대로 동작 ===')
{
  await boot()
  const err = await rejects(() => lib.setStudentUnit(O, 'Unit 8'))
  check('setStudentUnit(Olivia,"Unit 8") 성공', err === null, err?.message)
  check('Olivia current_unit_id = Unit 8', stu(O)?.current_unit_id === U.u8)
  check('Yaeji 무변경', stu(Y)?.current_unit_id === U.ghost)
  check('SCA 쓰기 0', scaLog().length === 0)
}

console.log('\n=== D/E. UI 계약 정적 검사 (StudentDirectory.jsx 편집 폼) ===')
{
  const src = fs.readFileSync(path.resolve('src/components/admin/StudentDirectory.jsx'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => { const m = l.match(/(?<!:)\/\/.*/); return m ? l.slice(0, m.index) : l }).join('\n')
  const saveEdit = code.slice(code.indexOf('const saveEdit'), code.indexOf('const saveEdit') + 1200)
  check('편집 유닛 옵션이 getStudentEditableUnits 기반', /getStudentEditableUnits\(/.test(code))
  check('저장이 setStudentUnitById(UUID) 사용', /setStudentUnitById\(/.test(saveEdit))
  check("saveEdit 에 '|| \\'Unit 1\\'' placeholder 기본값 없음", !/\|\|\s*'Unit 1'/.test(saveEdit))
  check('D. setStudentClass 는 반이 실제로 바뀔 때만 호출(조건부)', /if \(classChanged\)[\s\S]{0,40}setStudentClass\(/.test(saveEdit) && !/^\s*await setStudentClass\(/m.test(saveEdit))
  const editForm = code.slice(code.indexOf('{editing === s.id && ('), code.indexOf('{editing === s.id && (') + 1600)
  check('편집 폼 유닛 select 가 getClassUnitNames(editClass) 를 쓰지 않음', !/getClassUnitNames\(editClass\)/.test(editForm))
  check('편집 폼 유닛 옵션 value 가 unit id(UUID)', /value=\{o\.id\}|value=\{u\.id\}/.test(editForm))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 관리자 편집 유닛은 primary 교재 기준·UUID 저장·유령 거부')
