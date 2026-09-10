// 초등 5반(9명×5=45명) 숙제(daily_assignments) 파이프라인 회귀 — 2026-09-11
//
// 배경(운영자 지시) — 실제 초등 3개 반이 현재 daily_assignments에 행이
// 0개다(아직 오늘의 숙제를 배정한 적이 없음). getStudentWords는 배정이
// 없으면 유닛 전체를 그대로 보여주는 폴백 계약이라("배정 안 함" = 전체
// 노출, 절대 0단어 아님) 이 자체는 설계된 안전한 상태이지만, 운영자가
// "숙제가 없어서 앱에 아무것도 안 보임"을 P1로 지정했으므로 이 스위트는
// 그 실패 모드가 실제로 재현되는지(0단어 화면)를 45명 규모 픽스처로
// 직접 확인한다. 나머지 시나리오(반+날짜 스코프, 중복 upsert, 교재 간
// 혼입, 날짜 롤오버, 결석 학생, 재조회 안정성)도 함께 고정.
//
// 범위/제약: NO git 상태 변경, NO 네트워크, src/api 무수정(버그 발견 시
// 수정하지 않고 여기 보고). scripts/testAssignmentUnitGuards.mjs의 esbuild
// 오프라인 번들 + 인메모리 가짜 supabase 패턴을 그대로 복제하되,
// daily_assignments의 select/eq/upsert(onConflict 실제 존중)를 이 파일
// 전용으로 보강했다(원본 파일은 무수정 — 독립 복제본).
//
// 읽은 소스: src/utils/wordLibrary.js(_dailyAssignments 로드
// ~296-312행대/getTodaysAssignmentWordIds/setTodaysAssignment/
// setAssignmentForDate/getAssignmentForDate ~4009-4090행/getStudentWords
// ~3833-3951행/todayDateStr·localIsoDateStr ~160-172행), src/components/
// Dashboard.jsx(hasTodaysHomework ~455행), src/hooks/useStudent.js
// (todayStr ~182행, round.date 롤오버 ~364/437/923-932행) — 전부 읽기만,
// 수정 없음.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'
import crypto from 'node:crypto'

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

// ── 인메모리 가짜 supabase — testAssignmentUnitGuards.mjs와 동일 계약 +
// daily_assignments 전용 upsert(onConflict 실제 존중) 보강. 이 파일 전용
// 독립 사본(원본은 무수정).
const fakePath = path.join(TMP, 'fakeSupabaseForHomeworkPipeline45.mjs')
fs.writeFileSync(fakePath, `
export const __db = { classes: [], units: [], words: [], students: [], textbooks: [], class_textbooks: [], student_class_assignments: [], daily_assignments: [] }
export const __log = []
export function __reset(ds) { for (const k of Object.keys(__db)) __db[k] = (ds[k] || []).map((r) => ({ ...r })); __log.length = 0 }
function project(r, table, cols) {
  const out = { ...r }
  if (table === 'students' && /classes\\(name\\)/.test(cols)) { const c = __db.classes.find((x) => x.id === r.class_id); out.classes = c ? { name: c.name } : null }
  return out
}
function builder(table) {
  const st = { table, cols: '', filters: [], orders: [], range: null, single: null, mode: 'select', patch: null, onConflict: null }
  const api = {
    select(c) { st.cols = c || ''; return api },
    order(c, o) { st.orders.push([c, o?.ascending !== false]); return api },
    eq(c, v) { st.filters.push((r) => r[c] === v); return api },
    neq(c, v) { st.filters.push((r) => r[c] !== v); return api },
    in(c, v) { st.filters.push((r) => (v || []).includes(r[c])); return api },
    gte(c, v) { st.filters.push((r) => r[c] >= v); return api },
    lte(c, v) { st.filters.push((r) => r[c] <= v); return api },
    limit(n) { st.range = [0, n - 1]; return api },
    range(a, b) { st.range = [a, b]; return api },
    update(p) { st.mode = 'update'; st.patch = p; return api },
    insert(rows) { st.mode = 'insert'; st.patch = rows; return api },
    // 실제 supabase-js와 동일하게 두 번째 인자로 { onConflict }를 받는다 —
    // wordLibrary.js setAssignmentForDate가 정확히 이 형태로 호출한다
    // (class_id,date 복합 유니크). onConflict가 지정되면 기존 행을
    // 찾아 in-place merge(진짜 upsert), 없으면 새 행 insert.
    upsert(rows, opts) { st.mode = 'upsert'; st.patch = rows; st.onConflict = opts?.onConflict || null; return api },
    delete() { st.mode = 'delete'; return api },
    maybeSingle() { st.single = 'maybe'; return api },
    single() { st.single = 'one'; return api },
    then(res, rej) { return Promise.resolve(run()).then(res, rej) },
  }
  function run() {
    const rows = __db[st.table] || []
    if (st.mode === 'update') {
      const hit = rows.filter((r) => st.filters.every((f) => f(r)))
      for (const r of hit) Object.assign(r, st.patch)
      __log.push({ table: st.table, op: 'update', patch: st.patch, hit: hit.length })
      return { data: st.cols ? hit.map((r) => project(r, st.table, st.cols)) : null, error: null }
    }
    if (st.mode === 'insert') {
      const list = Array.isArray(st.patch) ? st.patch : [st.patch]
      const created = list.map((r) => ({ id: 'gen-' + (rows.length + 1) + '-' + Math.random().toString(36).slice(2, 6), ...r }))
      rows.push(...created)
      __log.push({ table: st.table, op: 'insert', rows: list.length })
      return { data: created.map((r) => project(r, st.table, st.cols)), error: null }
    }
    if (st.mode === 'upsert') {
      const list = Array.isArray(st.patch) ? st.patch : [st.patch]
      const conflictCols = st.onConflict ? st.onConflict.split(',').map((s) => s.trim()) : null
      const affected = []
      for (const row of list) {
        const existing = conflictCols ? rows.find((r) => conflictCols.every((c) => r[c] === row[c])) : null
        if (existing) { Object.assign(existing, row); affected.push(existing) }
        else { const created = { id: 'gen-' + (rows.length + 1) + '-' + Math.random().toString(36).slice(2, 6), ...row }; rows.push(created); affected.push(created) }
      }
      __log.push({ table: st.table, op: 'upsert', rows: list.length, onConflict: st.onConflict })
      return { data: affected.map((r) => project(r, st.table, st.cols)), error: null }
    }
    if (st.mode === 'delete') {
      const hit = rows.filter((r) => st.filters.every((f) => f(r)))
      for (const r of hit) rows.splice(rows.indexOf(r), 1)
      __log.push({ table: st.table, op: 'delete', hit: hit.length })
      return { data: null, error: null }
    }
    let out = rows.filter((r) => st.filters.every((f) => f(r)))
    for (const [c, asc] of [...st.orders].reverse()) out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1))
    if (st.range) out = out.slice(st.range[0], st.range[1] + 1)
    out = out.map((r) => project(r, st.table, st.cols))
    if (st.single === 'maybe') return { data: out[0] ?? null, error: null }
    if (st.single === 'one') return out[0] ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    return { data: out, error: null }
  }
  return api
}
export const supabase = { from: (t) => builder(t) }
`, 'utf8')
const fakeUrl = pathToFileURL(fakePath).href
const outfile = path.join(TMP, 'wordLibrary.homeworkPipeline45.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'], bundle: true, format: 'esm', platform: 'node', outfile,
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://offline.invalid'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('offline-test-key'), 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'fake-supabase', setup(b) { b.onResolve({ filter: /supabaseClient(\.js)?$/ }, () => ({ path: fakeUrl, external: true })) } }],
})
const lib = await import(pathToFileURL(outfile).href + '?t=' + Date.now())
const fake = await import(fakeUrl)

let failures = 0, asserted = 0
const check = (label, cond, detail) => { asserted++; if (cond) console.log(`  PASS  ${label}`); else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`); failures++ } }
const sameSet = (a, b) => a.length === b.length && new Set(a).size === new Set(b).size && a.every((x) => b.includes(x))
const P1_CANDIDATES = []

// ── 픽스처: 5개 반 × 9명 = 45명 ──────────────────────────────────────────
// CLS1~3: 정규(레거시) 반, 유닛을 직접 소유 — 실제 초등 3개 반(daily_
// assignments 0행 상태)을 흉내낸 대조군.
// CLS4/CLS5: 교재 모드 반(각자 소유 교재 TB4/TB5) — _textbookMode를
// 전역으로 켜서(교재 테이블에 행이 있으면 앱 전체가 교재 모드로 전환되는
// 실제 계약, wordLibrary.js:605) CLS1~3(비교재 반)이 그 아래에서도 안전한지
// 함께 검증한다.
const uid = (p) => `${p}-${crypto.randomUUID()}`
const CLS1 = uid('cls1'), CLS2 = uid('cls2'), CLS3 = uid('cls3'), CLS4 = uid('cls4'), CLS5 = uid('cls5')
const U1 = uid('u1'), U2 = uid('u2'), U3 = uid('u3'), U4 = uid('u4'), U5 = uid('u5')
const TB4 = uid('tb4'), TB5 = uid('tb5')
const wordsFor = (unitId, prefix, n = 40) =>
  Array.from({ length: n }, (_, i) => ({ id: uid('w'), unit_id: unitId, word: `${prefix}w${i}`, meaning: `뜻${prefix}${i}`, position: i + 1 }))
const studentsFor = (classId, unitId, n, namePrefix) =>
  Array.from({ length: n }, () => ({ id: crypto.randomUUID(), name: `${namePrefix}${Math.random().toString(36).slice(2, 8)}`, class_id: classId, unit_name: null, current_unit_id: unitId }))

const STU1 = studentsFor(CLS1, U1, 9, 'A')
const STU2 = studentsFor(CLS2, U2, 9, 'B')
const STU3 = studentsFor(CLS3, U3, 9, 'C')
const STU4 = studentsFor(CLS4, U4, 9, 'D')
const STU5 = studentsFor(CLS5, U5, 9, 'E')
const ALL_STUDENTS = [...STU1, ...STU2, ...STU3, ...STU4, ...STU5]
check('픽스처 — 5개 반 × 9명 = 45명', ALL_STUDENTS.length === 45, ALL_STUDENTS.length)

const dataset = () => ({
  classes: [
    { id: CLS1, name: '초등A', class_type: 'regular' },
    { id: CLS2, name: '초등B', class_type: 'regular' },
    { id: CLS3, name: '초등C', class_type: 'regular' },
    { id: CLS4, name: '교재D반', class_type: 'textbook' },
    { id: CLS5, name: '교재E반', class_type: 'textbook' },
  ],
  textbooks: [
    { id: TB4, name: '교재D', owner_class_id: CLS4 },
    { id: TB5, name: '교재E', owner_class_id: CLS5 },
  ],
  class_textbooks: [],
  units: [
    { id: U1, class_id: CLS1, name: 'Unit1', position: 0, textbook_id: null },
    { id: U2, class_id: CLS2, name: 'Unit1', position: 0, textbook_id: null },
    { id: U3, class_id: CLS3, name: 'Unit1', position: 0, textbook_id: null },
    { id: U4, class_id: CLS4, name: 'Unit1', position: 0, textbook_id: TB4 },
    { id: U5, class_id: CLS5, name: 'Unit1', position: 0, textbook_id: TB5 },
  ],
  words: [
    ...wordsFor(U1, 'e1'), ...wordsFor(U2, 'e2'), ...wordsFor(U3, 'e3'), ...wordsFor(U4, 'e4'), ...wordsFor(U5, 'e5'),
  ],
  students: ALL_STUDENTS,
  student_class_assignments: [
    ...STU4.map((s) => ({ id: uid('sca'), student_id: s.id, class_id: CLS4, textbook_id: TB4, current_unit_id: U4, is_primary: true })),
    ...STU5.map((s) => ({ id: uid('sca'), student_id: s.id, class_id: CLS5, textbook_id: TB5, current_unit_id: U5, is_primary: true })),
  ],
  daily_assignments: [],
})

async function boot() {
  fake.__reset(dataset())
  await lib.refreshWordLibrary(); await lib.refreshStudents(); await lib.refreshClassSettings(); await lib.refreshTextbooks()
  lib.invalidateStudentAssignmentsCache?.()
  // 실제 앱(로그인 시 App.jsx)과 동일하게 45명 전원의 SCA 캐시를 프라이밍
  // — getStudentWords의 classId override 검증/getStudentPrimaryTextbook
  // 콜드스타트 폴백 경로를 실제 운영 흐름과 동일하게 태운다.
  for (const s of ALL_STUDENTS) { try { await lib.getStudentClassAssignments(s.id) } catch { /* non-fatal */ } }
  fake.__log.length = 0
}
await boot()

check('_textbookMode 전역 true(교재가 있는 반이 하나라도 있으면 전체 앱이 교재 모드, wordLibrary.js:605)', lib.isTextbookMode() === true)

const slugsOf = (wordsArr) => wordsArr.map((w) => lib.wordSlug(w.word))
const dailyRows = () => fake.__log.filter((l) => l.table === 'daily_assignments')

console.log('\n=== 0b. 45명 전원 기준선 — 배정 전 상태에서 전원 정상 노출(구조 무결성, 운영자 우려 사항의 정면 검증) ===')
{
  for (const s of ALL_STUDENTS) {
    const words = lib.getStudentWords(s.id)
    check(`${s.name} — 배정 전 기준선: 0단어 아님(정상 유닛 노출)`, words.length > 0, words.length)
    const bad = words.find((w) => !w.dbId || typeof w.word !== 'string' || !w.word || typeof w.meaning !== 'string' || !w.meaning)
    check(`${s.name} — 반환된 단어 전부 dbId/word/meaning 형태 정상`, !bad, JSON.stringify(bad))
  }
}

console.log('\n=== 0. 정적 계약 — setAssignmentForDate 듀얼패스 + v3.12 RLS 락다운 ===')
{
  const src = fs.readFileSync('src/utils/wordLibrary.js', 'utf8')
  check('setAssignmentForDate — adminPin 있으면 admin-content-write(assignment.set) 경유',
    /if \(adminPin\) \{\s*await callAdminContentWrite\('assignment\.set'/.test(src))
  check('setAssignmentForDate — adminPin 없으면 레거시 anon upsert(class_id,date) 폴백 경로가 소스에 남아있음(코드 레벨 듀얼패스, DB 레벨 차단과는 별개)',
    /onConflict: 'class_id,date'/.test(src))
  const lockdownSql = fs.existsSync('supabase_v3_12_lockdown_daily_assignments.sql')
    ? fs.readFileSync('supabase_v3_12_lockdown_daily_assignments.sql', 'utf8') : ''
  check('v3.12 락다운 SQL 존재 — daily_assignments 쓰기는 SELECT 정책만 남기고 default-deny(anon 쓰기는 RLS로 막힘, JS 코드 자체가 막는 게 아님)',
    /for select using \(true\)/.test(lockdownSql) && /쓰기는 오직 service_role/.test(lockdownSql))
  console.log('  참고(운영 상태 미확인, 순수 정적 사실만): 이 SQL 파일이 실제 프로덕션 DB에 적용됐는지는 이 스크립트가 판단하지 않는다(오프라인, DB 무접촉) — 적용 여부와 무관하게 이 테스트의 나머지 섹션은 setAssignmentForDate를 adminPin 없이 호출해(기존 testDailyAssignment.mjs/testFutureAssignment.mjs와 동일 관례) "코드 로직"만 검증한다.')
}

console.log('\n=== 1. 시나리오(a) — 배정 0행(CLS1, 실제 초등 3반 재현) → 전원 유닛 전체 폴백, 0단어 없음 ===')
{
  check('사전조건 — CLS1 오늘 배정 0건', lib.getTodaysAssignmentWordIds('초등A').length === 0)
  check('hasTodaysHomework 동치(Dashboard.jsx:455가 그대로 쓰는 함수) — CLS1은 false', (lib.getTodaysAssignmentWordIds('초등A').length > 0) === false)
  let zeroWordStudents = 0
  for (const s of STU1) {
    const words = lib.getStudentWords(s.id)
    check(`A반 학생 ${s.name} — 배정 없음이면 유닛 전체(40단어) 노출`, words.length === 40, words.length)
    if (words.length === 0) zeroWordStudents++
  }
  if (zeroWordStudents > 0) {
    P1_CANDIDATES.push(`empty homework state: CLS1(배정 0행) 학생 ${zeroWordStudents}명이 0단어를 봄 — "숙제가 없어서 앱에 아무것도 안 보임" 실제 재현`)
  }
  check('P1 후보(빈 숙제 상태) 재현 안 됨 — 코드가 안전한 전체-유닛 폴백을 실제로 수행함', zeroWordStudents === 0, `${zeroWordStudents}/9명이 0단어`)
}

console.log('\n=== 2. 시나리오(b) — 반 단위 오늘 배정(CLS2, 10단어) → 그 반 9명 전원 정확히 그 10단어, 타 반 무영향 ===')
{
  const allU2 = fake.__db.words.filter((w) => w.unit_id === U2)
  const assign10 = slugsOf(allU2.slice(0, 10))
  await lib.setAssignmentForDate('초등B', lib.localIsoDateStr(), assign10)
  check('오늘 배정 저장 — daily_assignments upsert 정확히 1회', dailyRows().length === 1, JSON.stringify(dailyRows()))
  check('getTodaysAssignmentWordIds(초등B) = 10개', lib.getTodaysAssignmentWordIds('초등B').length === 10)
  check('hasTodaysHomework 동치 — CLS2는 이제 true', lib.getTodaysAssignmentWordIds('초등B').length > 0)
  for (const s of STU2) {
    const words = lib.getStudentWords(s.id)
    check(`B반 학생 ${s.name} — 정확히 배정된 10단어만`, words.length === 10 && sameSet(words.map((w) => w.id), assign10), words.map((w) => w.id))
  }
  check('교차 확인(f) — A반(CLS1)은 B반 배정과 무관하게 여전히 전체 40단어', lib.getStudentWords(STU1[0].id).length === 40)
  check('교차 확인(f) — C/D/E반도 무영향(전체 유닛 그대로)',
    lib.getStudentWords(STU3[0].id).length === 40 && lib.getStudentWords(STU4[0].id).length === 40 && lib.getStudentWords(STU5[0].id).length === 40)
}

console.log('\n=== 3. 시나리오(d) — 같은 반/날짜 중복 upsert 두 번 → 행 1개만 유지(최신 내용으로 교체) ===')
{
  fake.__log.length = 0
  const allU2 = fake.__db.words.filter((w) => w.unit_id === U2)
  const secondAssign = slugsOf(allU2.slice(30, 40)) // 다른 10단어로 덮어쓰기
  const rowsBefore = fake.__db.daily_assignments.filter((r) => r.class_id === CLS2).length
  await lib.setAssignmentForDate('초등B', lib.localIsoDateStr(), secondAssign)
  const rowsAfter = fake.__db.daily_assignments.filter((r) => r.class_id === CLS2).length
  check('중복 저장 전 이미 1행 존재(전 섹션에서 생성)', rowsBefore === 1, rowsBefore)
  check('두 번째 upsert 후에도 (class_id, date) 행이 정확히 1개(onConflict 병합, insert 아님)', rowsAfter === 1, rowsAfter)
  check('학생 조회 결과가 최신(두 번째) 배정 내용으로 즉시 갱신', sameSet(lib.getStudentWords(STU2[0].id).map((w) => w.id), secondAssign))
  check('구 배정(첫 10단어)은 더 이상 보이지 않음', !lib.getStudentWords(STU2[0].id).some((w) => allU2.slice(0, 10).some((ow) => lib.wordSlug(ow.word) === w.id)))
}

console.log('\n=== 3b. 배정 해제(setTodaysAssignment(class, [])) — B반 전원 유닛 전체로 복귀(testDailyAssignment.mjs 5절과 동일 계약, 45명 규모 재확인) ===')
{
  const allU2 = fake.__db.words.filter((w) => w.unit_id === U2)
  const currentAssignedRow = allU2.slice(30, 40) // 섹션3에서 두 번째 upsert로 저장한 실제 배정 단어(DB 원본 행)
  check('해제 전 — B반 학생 단어 내용 스팟체크(word/meaning이 실제 DB 행과 바이트 단위 일치)',
    currentAssignedRow.every((row) => lib.getStudentWords(STU2[0].id).some((w) => w.word === row.word && w.meaning === row.meaning)))
  await lib.setTodaysAssignment('초등B', []) // setTodaysAssignment는 setAssignmentForDate(class, todayDateStr(), ids)의 얇은 래퍼
  check('해제 후 — getTodaysAssignmentWordIds(초등B) = 0', lib.getTodaysAssignmentWordIds('초등B').length === 0)
  check('해제 후 — hasTodaysHomework 동치 다시 false', (lib.getTodaysAssignmentWordIds('초등B').length > 0) === false)
  for (const s of STU2) {
    const words = lib.getStudentWords(s.id)
    check(`B반 학생 ${s.name} — 배정 해제 후 유닛 전체(40) 복귀`, words.length === 40, words.length)
  }
}

console.log('\n=== 3c. 방어적 조회 — 존재하지 않는 반/미배정 날짜 조회는 throw 대신 빈 배열 ===')
{
  check('getTodaysAssignmentWordIds(존재하지 않는 반) = []', lib.getTodaysAssignmentWordIds('___없는반___').length === 0)
  check('getAssignmentForDate(초등A, 오늘) = []( A반은 애초에 배정 자체가 없음)',
    (await lib.getAssignmentForDate('초등A', lib.localIsoDateStr())).length === 0)
  const hist = await lib.fetchAssignmentHistory('초등B', lib.localIsoDateStr(), lib.localIsoDateStr())
  check('fetchAssignmentHistory(초등B, 오늘~오늘) — 해제 후라 word_ids 빈 배열인 행으로 조회됨(throw 없음)',
    Array.isArray(hist) && (hist.length === 0 || hist.every((r) => Array.isArray(r.wordIds))))
}

console.log('\n=== 4. 시나리오(e)/(f) — 교재 간 단어 id 혼입 + 잘못된 반 배정 무전파 ===')
{
  const allU4 = fake.__db.words.filter((w) => w.unit_id === U4)
  const validD = slugsOf(allU4.slice(0, 5))
  await lib.setAssignmentForDate('교재D반', lib.localIsoDateStr(), validD)
  for (const s of STU4) {
    const words = lib.getStudentWords(s.id)
    check(`D반 학생 ${s.name} — 정상 배정 5단어 정확히 반영`, words.length === 5 && sameSet(words.map((w) => w.id), validD))
  }
  // E반에는 "다른 교재(D)"의 단어 슬러그만 배정 — E반 유닛(U5)에는 존재하지
  // 않는 id들이라 assignedSet 매칭이 0건, whole-class 폴백(같은 반의 다른
  // 유닛들만 훑음, 다른 반/교재는 훑지 않음)도 0건이라 실제로 어떻게
  // 동작하는지 관찰.
  const crossIds = slugsOf(allU4.slice(0, 3))
  await lib.setAssignmentForDate('교재E반', lib.localIsoDateStr(), crossIds)
  check('E반 배정 저장 — hasTodaysHomework 동치는 true(배정 자체는 있음, 내용은 별개)', lib.getTodaysAssignmentWordIds('교재E반').length === 3)
  for (const s of STU5) {
    const words = lib.getStudentWords(s.id)
    check(`E반 학생 ${s.name} — 타 교재(D) 단어 id는 매칭 0건 → 유닛 전체(40) 폴백(안전, 단 배너는 "숙제 있음"으로 뜸)`,
      words.length === 40, words.length)
  }
  console.log('  관찰(안전하지만 주의 필요) — 다른 교재/반의 단어 id가 배정에 섞이면 getStudentWords는 조용히 "유닛 전체"로 폴백한다(0단어가 되지는 않음). 다만 getTodaysAssignmentWordIds 기반 hasTodaysHomework 배너는 여전히 true로 떠서, "숙제가 배정됐다"는 안내와 실제로 보이는 단어(유닛 전체)가 불일치하는 화면이 생길 수 있다 — 관리자가 잘못된 반의 단어 id를 붙여넣었을 때 조용히 감지되지 않는다는 뜻(오류 throw도, 배너 불일치 경고도 없음). 차단성 P1은 아님(학생 화면은 절대 비지 않음) — 관리자 UX 개선 후보로만 기록.')
  check('교차 확인(f) — D반 배정이 A/B/C반에 전파되지 않음(전체 40 유지)',
    lib.getStudentWords(STU1[0].id).length === 40 && lib.getStudentWords(STU2[0].id).length === 40 /* 섹션3b에서 해제됨 */ && lib.getStudentWords(STU3[0].id).length === 40)
}

console.log('\n=== 5. 시나리오(c)+(g) — 미래 날짜 배정은 오늘 무영향 + 날짜 롤오버 시 정확히 그날만 활성화(결석 학생도 동일) ===')
{
  const RealDate = globalThis.Date
  const shiftBox = { ms: 0 }
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + shiftBox.ms)
      else super(...args)
    }
    static now() { return RealDate.now() + shiftBox.ms }
  }
  const tomorrowStr = lib.localIsoDateStr(new RealDate(RealDate.now() + 86400000))
  const allU3 = fake.__db.words.filter((w) => w.unit_id === U3)
  const futureAssign = slugsOf(allU3.slice(0, 10))
  await lib.setAssignmentForDate('초등C', tomorrowStr, futureAssign)

  check('내일 배정 직후 — 오늘 C반은 여전히 전체 40단어(미래 배정은 오늘 무영향)', lib.getStudentWords(STU3[0].id).length === 40)
  check('getAssignmentForDate(초등C, 내일)로 조회하면 저장된 10단어가 보임(관리자 화면 미리보기 계약)',
    sameSet(await lib.getAssignmentForDate('초등C', tomorrowStr), futureAssign))
  // "결석 학생" — D반(섹션4에서 5단어 배정, 이후 무변경)의 한 학생을
  // 지정해 이 섹션 끝까지 그 학생에게만 어떤 진행도/출석 관련 함수도
  // 호출하지 않는다(이 스크립트는 애초에 student_progress/
  // student_daily_progress를 전혀 건드리지 않으므로, 이 지정은 "숙제
  // 배정이 학생별 상태에 의존하지 않고 반+날짜로만 결정된다"는 계약을
  // 명시적으로 보여주기 위한 라벨일 뿐이다).
  const absentStudent = STU4[STU4.length - 1]
  const absentAssign = fake.__db.daily_assignments.find((r) => r.class_id === CLS4)?.word_ids || []
  check('결석 학생(D반, 교재모드, 어떤 쓰기도 받지 않음) — 오늘 배정은 여전히 반 전체와 동일하게 적용됨(개인별 예외 없음)',
    absentAssign.length === 5 && sameSet(lib.getStudentWords(absentStudent.id).map((w) => w.id), absentAssign))

  globalThis.Date = ShiftedDate
  try {
    shiftBox.ms = 86400000 // +1일 — "내일"이 이제 "오늘"
    await lib.refreshWordLibrary()
    check('롤오버 후 — C반의 "내일" 배정이 이제 "오늘" 배정으로 활성화(정확히 10단어)',
      sameSet(lib.getStudentWords(STU3[0].id).map((w) => w.id), futureAssign))
    for (const s of STU3) {
      check(`C반 학생 ${s.name} — 롤오버된 오늘 배정 10단어 정확히 반영`,
        sameSet(lib.getStudentWords(s.id).map((w) => w.id), futureAssign))
    }
    check('롤오버 후 — 결석 학생(D반)도 예외 없이 새 날짜 기준 재평가됨: D반 배정은 "옛 오늘" 날짜 행뿐이라 새 날짜엔 행이 없어 유닛 전체(40)로 복귀(개인 상태·출결과 무관하게 반+날짜로만 결정되는 계약의 재확인)',
      lib.getStudentWords(absentStudent.id).length === 40, `실측: ${lib.getStudentWords(absentStudent.id).length}단어`)
    check('롤오버 후 — B반(섹션3b에서 이미 해제됨)은 계속 유닛 전체(40) 유지', lib.getStudentWords(STU2[0].id).length === 40)
    check('롤오버 후 — A반(원래도 배정 0행)은 계속 전체 40단어(무영향 재확인)', lib.getStudentWords(STU1[0].id).length === 40)
  } finally {
    globalThis.Date = RealDate
  }
  await lib.refreshWordLibrary() // 실제 "오늘" 기준으로 캐시 원복(이후 섹션에 영향 없도록)
}

console.log('\n=== 6. 시나리오(i) — refreshWordLibrary 재조회(새로고침) 후에도 배정 유지(멱등) ===')
{
  const before = {
    a: lib.getStudentWords(STU1[0].id).map((w) => w.id),
    b: lib.getStudentWords(STU2[0].id).map((w) => w.id),
    d: lib.getStudentWords(STU4[0].id).map((w) => w.id),
    e: lib.getStudentWords(STU5[0].id).map((w) => w.id),
  }
  await lib.refreshWordLibrary()
  const after = {
    a: lib.getStudentWords(STU1[0].id).map((w) => w.id),
    b: lib.getStudentWords(STU2[0].id).map((w) => w.id),
    d: lib.getStudentWords(STU4[0].id).map((w) => w.id),
    e: lib.getStudentWords(STU5[0].id).map((w) => w.id),
  }
  check('A반(무배정) — 재조회 후 동일(전체 40)', sameSet(before.a, after.a) && after.a.length === 40)
  check('B반(배정 있음) — 재조회 후 동일 배정 유지', sameSet(before.b, after.b))
  check('D반(교재모드, 배정 있음) — 재조회 후 동일', sameSet(before.d, after.d))
  check('E반(교재모드, 교차오염 배정) — 재조회 후에도 동일하게 전체 40 폴백 유지', sameSet(before.e, after.e) && after.e.length === 40)
}

console.log('\n=== 7. 시나리오(h) — 자정 이후 늦은 완료(정적 계약, useStudent.js는 React 훅이라 직접 실행하지 않고 소스로 확인) ===')
{
  const src = fs.readFileSync('src/hooks/useStudent.js', 'utf8')
  check('todayStr()가 new Date().toDateString() 기준(wordLibrary.js의 localIsoDateStr과는 별개 축, 파일 헤더 주석이 명시)',
    /const todayStr = \(\) => new Date\(\)\.toDateString\(\)/.test(src))
  check('round.date가 오늘과 다르면 round를 새로 만듦(자정 롤오버 트리거) — 최소 1곳 존재',
    /if \(oldRound && oldRound\.date === todayStr\(\)\)/.test(src) || /if \(round\.date !== todayStr\(\)\)/.test(src))
  check('진행도 히스토리가 날짜 키로 저장됨(merged.history[todayStr()] 패턴 존재)', /history\[todayStr\(\)\]/.test(src))
  console.log('  문서화(실행 아님, 정적 확인) — 자정을 넘겨 완료하면 round.date !== todayStr() 검사(923행 인근 useEffect)가 다음 렌더/포커스 시점에 발동해 round가 freshRound()로 리셋된다. 즉 "어제 시작해 자정 넘어 끝낸" 학습은 자정 시점의 진행 상태에 따라 어제 날짜(history[어제])에 반영되지 않고 새 날짜의 라운드로 넘어갈 수 있다 — 이 스크립트는 daily_assignments/wordLibrary 계층만 오프라인 검증 대상이라 useStudent.js의 실제 리렌더 타이밍(React 상태·인터벌)까지는 실행 검증하지 않는다(과제 지시대로 정적 인용만).')
}

console.log('\n' + '='.repeat(70))
if (P1_CANDIDATES.length > 0) {
  console.log('P1 CANDIDATES:')
  for (const c of P1_CANDIDATES) console.log('  - ' + c)
} else {
  console.log('P1 CANDIDATES: 없음 — "배정 0행 → 0단어 노출" 실패 모드는 45명 픽스처에서 재현되지 않음(코드가 유닛 전체로 안전 폴백).')
}
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 초등 5반 숙제 파이프라인(daily_assignments) 45명 픽스처 회귀 고정')
