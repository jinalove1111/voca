// 교재/반/유닛 격리 회귀 스위트 (2026-09-04, Overnight QA T2, 운영자 지시)
//
// 배경: 오늘 낮 세션(testTextbookGradeLabel.mjs)이 고친 건 "관리자가 배정할
// 교과서를 고르는 <select> 라벨"뿐이었다 — createClass/assignTextbook/
// setClassWords 등 데이터 계층의 실제 식별 방식은 그 스위트가 검증하지
// 않았다. 이 스위트는 그 밑 데이터 계층을 정면으로 검증한다: 동명/동저자/
// 동출판사이지만 학년이 다른 교재, 여러 반에 연결된 교재, 반에 여러 교재가
// 연결된 상태, primary/secondary 전환, 반 이동, 신규/아카이브 계정에서
// 학생·교재·유닛이 항상 표시 이름이 아니라 UUID로 식별되는지를 40개 이상의
// 단언으로 고정한다(CLAUDE.md 규칙 4 — 이름 문자열로 매칭하지 않는다).
//
// 하네스: src/utils/wordLibrary.js를 esbuild로 오프라인 번들 +
// 인메모리 가짜 supabase(쓰기 기록형, testAssignmentUnitGuards.mjs/
// testAdminUnitEdit.mjs와 동일 계약 — update/insert/delete/upsert 전부
// 기록해 "쓰기 0"/"DELETE 0건" 같은 부정 단언이 가능하다). UNIQUE 제약은
// 실제 DB 제약을 그대로 시뮬레이션한다: textbooks.name(v3_1:40),
// classes.name(v1_3), class_textbooks(class_id,textbook_id)(v3_1:62),
// student_class_assignments(student_id,class_id)(v2_9:92),
// uq_sca_student_textbook(student_id,textbook_id) WHERE textbook_id IS NOT
// NULL(v3_1:81-82, partial unique) — 이 파일이 새 제약을 발명한 게 아니라
// 기존 SQL 제약을 그대로 재현한 것. 네트워크 0, 실제 Supabase 접촉 0.
//
// 섹션 구성(운영자 지시 6개 시나리오 그대로):
//   1. 동저자/동출판사·다학년, 유사 이름, 동일 유닛번호 — createClass/
//      textbook 생성이 UUID로 분리되는지 + 조회/배정 함수 전부 id 기준.
//   2. 반 1개 ↔ 교재 N개 / 교재 1개 ↔ 반 N개 다대다 연결 — getClassTextbooks
//      + 학생 textbookOptions(App.jsx byId union 로직, 그대로 재현) dedupe.
//   3. primary/secondary 전환 — setPrimaryTextbook이 정확히 1개만 primary로
//      바꾸고, 이후 setAssignmentUnit이 다른 배정의 current_unit_id를
//      건드리지 않으며, students.current_unit_id는 항상 primary 교재
//      소속이고, student_progress/student_daily_progress(학습기록)는 이
//      섹션 전체에서 단 한 번도 쓰기되지 않는지.
//   4. setStudentClass(반 이동) — 다른 교재의 SCA 행을 보존하고, 절대
//      DELETE를 issue하지 않는지(2026-09-03 T4 정적 감사 Med #4 수정의
//      회귀 방지 — demote 통일 확인).
//   5. 신규 학생 + 아카이브/테스트 계정(이름 충돌) — 전부 UUID로 식별되고
//      어떤 교재 배정 함수도 students.name으로 필터링하지 않는지(정적+동적).
//   6. 업로드 격리 재현 — setClassWords가 만드는 유닛의 textbook_id가 항상
//      "그 반이 소유한 교재"이고, 동일 이름("Unit 1")이 두 교재에 있어도
//      절대 섞이지 않으며, 학생 라벨은 tb.name 그대로(학년 유추 없음, 구조적
//      확인 — textbooks 클라이언트 캐시 객체에 grade 필드 자체가 없음).
//
// 실행: node scripts/testTextbookIsolation.mjs
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
// 인메모리 가짜 supabase(쓰기 기록) — testAssignmentUnitGuards.mjs와 동일
// 계약(update/insert/delete/upsert 기록, classes(name) 임베드 project,
// maybeSingle/single) + UNIQUE 제약 시뮬레이션(실제 SQL 제약 그대로 재현).
// ════════════════════════════════════════════════════════════════════════
const fakePath = path.join(TMP, 'fakeSupabaseForTextbookIsolation.mjs')
fs.writeFileSync(fakePath, `
export const __db = { classes: [], units: [], words: [], students: [], textbooks: [], class_textbooks: [], student_class_assignments: [], daily_assignments: [] }
export const __log = []
export function __reset(ds) { for (const k of Object.keys(__db)) __db[k] = (ds[k] || []).map((r) => ({ ...r })); __log.length = 0 }
// 실제 SQL UNIQUE 제약 재현(발명 아님):
//   classes.name(v1_3), textbooks.name(v3_1:40), class_textbooks(class_id,textbook_id)(v3_1:62),
//   student_class_assignments(student_id,class_id)(v2_9:92)
const UNIQUE = { classes: ['name'], textbooks: ['name'], class_textbooks: ['class_id', 'textbook_id'], student_class_assignments: ['student_id', 'class_id'] }
// uq_sca_student_textbook — partial unique WHERE textbook_id IS NOT NULL(v3_1:81-82)
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
const fakeUrl = pathToFileURL(fakePath).href
const outfile = path.join(TMP, 'wordLibrary.textbookIsolation.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'], bundle: true, format: 'esm', platform: 'node', outfile,
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://offline.invalid'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('offline-test-key'), 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'fake-supabase', setup(b) { b.onResolve({ filter: /supabaseClient(\.js)?$/ }, () => ({ path: fakeUrl, external: true })) } }],
})
const lib = await import(pathToFileURL(outfile).href + '?t=' + Date.now())
const fake = await import(fakeUrl)

// ── 픽스처 베이스 — 앵커 교재 1개(isTextbookMode()=true 전제) + 사람 반 3개
// (HOME/HOME2/CLS_X, 유닛 미소유 — 교재 컨테이너가 아닌 실반) ──────────────
const ANCHOR_CLS = 'cls-anchor', ANCHOR_TB = 'tb-anchor'
const HOME = 'cls-home', HOME2 = 'cls-home2', CLS_X = 'cls-x'
const baseDataset = () => ({
  classes: [
    { id: ANCHOR_CLS, name: '고1 능률 김민수', class_type: 'textbook' },
    { id: HOME, name: 'HOME반', class_type: 'regular' },
    { id: HOME2, name: 'HOME2반', class_type: 'regular' },
    { id: CLS_X, name: 'CLSX반', class_type: 'regular' },
  ],
  textbooks: [{ id: ANCHOR_TB, name: '고1 능률 김민수', owner_class_id: ANCHOR_CLS, publisher_name: null }],
  class_textbooks: [{ class_id: ANCHOR_CLS, textbook_id: ANCHOR_TB, enabled: true, sort_order: 0 }],
})
async function boot() {
  fake.__reset(baseDataset())
  await lib.refreshWordLibrary(); await lib.refreshStudents(); await lib.refreshClassSettings(); await lib.refreshTextbooks()
  lib.invalidateStudentAssignmentsCache?.()
  fake.__log.length = 0
}

// 세 교재(중1/중2/중2 2학기 — 동저자·동출판사·다학년 + 유사 이름) + 각각
// "Unit 1"(동일 이름, 다른 유닛 id) 생성. seedTextbooks()는 boot() 직후에만
// 호출 — 매 섹션이 독립된 상태에서 시작하도록 boot()를 섹션마다 새로 부른다.
async function seedTextbooks() {
  await lib.createClass('중1 천재 이상기', 'textbook')
  await lib.createClass('중2 천재 이상기', 'textbook')
  await lib.createClass('중2 천재 이상기 2학기', 'textbook')
  const cls1 = lib.getClassIdByName('중1 천재 이상기')
  const cls2 = lib.getClassIdByName('중2 천재 이상기')
  const cls3 = lib.getClassIdByName('중2 천재 이상기 2학기')
  let tb1 = lib.getAllTextbooks().find((t) => t.name === '중1 천재 이상기')
  let tb2 = lib.getAllTextbooks().find((t) => t.name === '중2 천재 이상기')
  let tb3 = lib.getAllTextbooks().find((t) => t.name === '중2 천재 이상기 2학기')
  // 세 교재 모두 "천재" 출판사(같은 출판사·다른 학년 시나리오를 교재 계층
  // 에서도 실제로 재현 — createClass는 publisher_name을 채우지 않으므로
  // (정상, 출판사 자동 추정은 SQL 백필 전용) 여기서 직접 지정 후 재조회).
  const rawTextbooks = fake.__db.textbooks
  for (const name of ['중1 천재 이상기', '중2 천재 이상기', '중2 천재 이상기 2학기']) {
    const row = rawTextbooks.find((t) => t.name === name)
    if (row) row.publisher_name = '천재'
  }
  await lib.refreshTextbooks()
  tb1 = lib.getTextbookById(tb1.id); tb2 = lib.getTextbookById(tb2.id); tb3 = lib.getTextbookById(tb3.id)
  await lib.setClassWords('중1 천재 이상기', [{ word: 'apple', meaning: '사과' }, { word: 'banana', meaning: '바나나' }], 'Unit 1')
  await lib.setClassWords('중2 천재 이상기', [{ word: 'cat', meaning: '고양이' }, { word: 'dog', meaning: '개' }], 'Unit 1')
  await lib.setClassWords('중2 천재 이상기 2학기', [{ word: 'egg', meaning: '계란' }, { word: 'fish', meaning: '생선' }], 'Unit 1')
  return { cls1, cls2, cls3, tb1: lib.getTextbookById(tb1.id), tb2: lib.getTextbookById(tb2.id), tb3: lib.getTextbookById(tb3.id) }
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. 동저자/동출판사·다학년 + 유사 이름 + 동일 유닛번호 — UUID 격리 ===')
{
  await boot()
  const { cls1, cls2, cls3, tb1, tb2, tb3 } = await seedTextbooks()

  check('1a. 세 교재 모두 생성됨(중1/중2/중2 2학기)', !!tb1 && !!tb2 && !!tb3, { tb1, tb2, tb3 })
  check('1b. 세 교재 id가 서로 다름(UUID 분리, 앵커와도 다름)',
    new Set([tb1.id, tb2.id, tb3.id, ANCHOR_TB]).size === 4, [tb1.id, tb2.id, tb3.id])
  check('1c. 동저자·동출판사(둘 다 "천재")여도 이름은 각자 그대로(학년 재작성 없음)',
    tb1.publisherName === '천재' && tb2.publisherName === '천재' && tb1.name === '중1 천재 이상기' && tb2.name === '중2 천재 이상기')
  check('1d. 유사 이름("중2 천재 이상기" vs "중2 천재 이상기 2학기")도 별개 행',
    tb2.id !== tb3.id && tb2.name !== tb3.name)

  const units1 = lib.getTextbookUnits(tb1.id), units2 = lib.getTextbookUnits(tb2.id), units3 = lib.getTextbookUnits(tb3.id)
  check('1e. getTextbookUnits(tb1) — "Unit 1" 정확히 1개, 자기 단어(apple/banana)만',
    units1.length === 1 && units1[0].name === 'Unit 1' && units1[0].words.map((w) => w.word).sort().join(',') === 'apple,banana', units1)
  check('1f. getTextbookUnits(tb2) — "Unit 1" 정확히 1개, 자기 단어(cat/dog)만(동일 이름 유닛이지만 다른 유닛)',
    units2.length === 1 && units2[0].name === 'Unit 1' && units2[0].words.map((w) => w.word).sort().join(',') === 'cat,dog', units2)
  check('1g. 두 "Unit 1"의 유닛 id는 서로 다름(이름 동일 ≠ 실체 동일)', units1[0].id !== units2[0].id && units2[0].id !== units3[0].id)

  check('1h. getLearnableTextbookUnits(tb1)에 tb2/tb3의 유닛 id가 전혀 없음',
    !lib.getLearnableTextbookUnits(tb1.id).some((u) => u.id === units2[0].id || u.id === units3[0].id))
  check('1i. getLearnableTextbookUnits(tb1)에 tb2 전용 단어(cat/dog)가 섞이지 않음',
    !lib.getLearnableTextbookUnits(tb1.id).some((u) => u.words.some((w) => w.word === 'cat' || w.word === 'dog')))

  const studentId = await lib.addStudent('_QA_Isolation_S1', '중1 천재 이상기', 'Unit 1')
  await lib.assignTextbook(studentId, cls2)
  const scaRow = fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls2)
  check('1j. assignTextbook(S, cls2)이 만든 SCA 행의 textbook_id === tb2.id(정확히 그 교재)',
    scaRow?.textbook_id === tb2.id, scaRow)
  const assignments = await lib.getStudentClassAssignments(studentId)
  check('1k. getStudentClassAssignments — cls1(primary)/cls2(secondary) id로 구분됨',
    assignments.some((a) => a.classId === cls1 && a.isPrimary) && assignments.some((a) => a.classId === cls2 && a.textbookId === tb2.id && !a.isPrimary),
    assignments)
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. 다대다 연결(반 1개↔교재 N개 / 교재 1개↔반 N개) — 학생 textbookOptions dedupe ===')
{
  await boot()
  const { cls3, tb1, tb2, tb3 } = await seedTextbooks()

  // 반 1개(HOME)에 교재 2개(tb1, tb2) 연결.
  await lib.linkTextbookToClass(HOME, tb1.id)
  await lib.linkTextbookToClass(HOME, tb2.id)
  const homeLinks = lib.getClassTextbooks(HOME)
  check('2a. getClassTextbooks(HOME) — tb1/tb2 정확히 2개, tb3 없음(id 기준)',
    homeLinks.length === 2 && homeLinks.some((t) => t.id === tb1.id) && homeLinks.some((t) => t.id === tb2.id) && !homeLinks.some((t) => t.id === tb3.id),
    homeLinks.map((t) => t.id))

  // 교재 1개(tb1)를 다른 반(CLS_X)에도 연결 — "교재 1개↔반 N개".
  await lib.linkTextbookToClass(CLS_X, tb1.id)
  check('2b. getClassTextbooks(CLS_X) — tb1만(다른 반에도 연결된 교재가 CLS_X엔 그대로 하나)',
    lib.getClassTextbooks(CLS_X).length === 1 && lib.getClassTextbooks(CLS_X)[0].id === tb1.id)
  check('2c. tb1을 CLS_X에 추가 연결해도 HOME 쪽 연결 목록은 무변화(교차 오염 없음)',
    lib.getClassTextbooks(HOME).length === 2 && lib.getClassTextbooks(HOME).some((t) => t.id === tb1.id) && lib.getClassTextbooks(HOME).some((t) => t.id === tb2.id))

  // 학생 textbookOptions — App.jsx useMemo의 byId union+dedupe 로직을 그대로
  // 재현(그 파일은 React 훅이라 SSR 없이 직접 호출 불가 — 순수 로직만 복제,
  // 사용하는 함수(getClassTextbooks/getTextbookById/getStudentClassId)는
  // 전부 실제 wordLibrary 번들 함수).
  const studentId = await lib.addStudent('_QA_Isolation_S2', 'HOME반')
  await lib.assignTextbook(studentId, cls3) // 개별 배정(반 연결과 무관한 tb3)
  const assignments = await lib.getStudentClassAssignments(studentId)
  const computeOptions = (studentClassId, studentAssignments) => {
    const byId = new Map()
    for (const tb of lib.getClassTextbooks(studentClassId)) byId.set(tb.id, tb)
    for (const a of studentAssignments) {
      if (!a.textbookId || byId.has(a.textbookId)) continue
      const tb = lib.getTextbookById(a.textbookId)
      if (tb && !String(tb.id).startsWith('synthetic-tb:')) byId.set(tb.id, tb)
    }
    return Array.from(byId.values()).map((tb) => ({ id: tb.id, label: tb.publisherName ? `${tb.name} (${tb.publisherName})` : tb.name }))
  }
  let options = computeOptions(lib.getStudentClassId(studentId), assignments)
  check('2d. 학생 textbookOptions — tb1/tb2(반 연결) ∪ tb3(개별 배정) = 3개, 라벨 전부 다름',
    options.length === 3 && new Set(options.map((o) => o.id)).size === 3 && new Set(options.map((o) => o.label)).size === 3,
    options)

  // dedupe — tb1을 이 학생에게 "개별로도" 추가 배정해도(반 연결로 이미
  // 노출 중) 옵션 개수가 늘지 않아야 한다(byId.has 스킵 경로).
  await lib.assignTextbook(studentId, lib.getClassIdByName('중1 천재 이상기'))
  const assignments2 = await lib.getStudentClassAssignments(studentId)
  options = computeOptions(lib.getStudentClassId(studentId), assignments2)
  check('2e. 이미 반 연결로 노출된 교재를 개별 배정해도 옵션 3개 그대로(dedupe by id)',
    options.length === 3 && new Set(options.map((o) => o.id)).size === 3, options.map((o) => o.id))
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. primary/secondary 전환 — 정확히 1개만 primary, 다른 배정 무접촉, 학습기록 무접촉 ===')
{
  await boot()
  const { cls1, cls2, cls3, tb1, tb2, tb3 } = await seedTextbooks()
  const studentId = await lib.addStudent('_QA_Isolation_S3', '중1 천재 이상기', 'Unit 1')
  await lib.assignTextbook(studentId, cls2)
  await lib.assignTextbook(studentId, cls3)

  const before = await lib.getStudentClassAssignments(studentId)
  check('3a. 전환 전 — primary는 정확히 1개(tb1)', before.filter((a) => a.isPrimary).length === 1 && before.find((a) => a.isPrimary)?.textbookId === tb1.id, before)

  await lib.setPrimaryTextbook(studentId, tb2.id)
  const after = await lib.getStudentClassAssignments(studentId)
  const primaries = after.filter((a) => a.isPrimary)
  check('3b. setPrimaryTextbook(tb2) 이후 — primary는 정확히 1개, 그게 tb2', primaries.length === 1 && primaries[0].textbookId === tb2.id, after)
  check('3c. tb1(이전 primary)은 이제 secondary(false)로 정확히 1개만 바뀜(다른 배정까지 같이 true→false 폭주 없음)',
    after.filter((a) => a.textbookId === tb1.id).every((a) => !a.isPrimary))
  const tb3RowAfterSwitch = fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls3)
  check('3d. tb3(건드리지 않은 secondary)은 여전히 is_primary=false, current_unit_id는 여전히 null(전환에 영향 0)',
    tb3RowAfterSwitch && tb3RowAfterSwitch.is_primary === false && tb3RowAfterSwitch.current_unit_id == null, tb3RowAfterSwitch)

  const studentRowAfterSwitch = fake.__db.students.find((s) => s.id === studentId)
  const tb2UnitId = lib.getTextbookUnits(tb2.id)[0].id
  check('3e. students.current_unit_id는 항상 primary(tb2) 소속 유닛', studentRowAfterSwitch?.current_unit_id === tb2UnitId, studentRowAfterSwitch)

  // 전환 후 유닛 변경 — tb3(다른 secondary)의 유닛만 바뀌고, tb1/tb2 행은
  // 그대로여야 한다("교재 전환 → 유닛 전환"이 서로 다른 배정을 오염시키지
  // 않음).
  const tb1RowBefore = { ...fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls1) }
  const tb2RowBefore = { ...fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls2) }
  const tb3UnitId = lib.getTextbookUnits(tb3.id)[0].id
  await lib.setAssignmentUnit(studentId, cls3, tb3UnitId)
  const tb1RowAfter = fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls1)
  const tb2RowAfter = fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls2)
  const tb3RowAfter = fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls3)
  check('3f. setAssignmentUnit(tb3)이 tb1 행(current_unit_id/is_primary)을 전혀 안 바꿈',
    tb1RowAfter.current_unit_id === tb1RowBefore.current_unit_id && tb1RowAfter.is_primary === tb1RowBefore.is_primary,
    { before: tb1RowBefore, after: tb1RowAfter })
  check('3g. setAssignmentUnit(tb3)이 tb2 행(current_unit_id/is_primary)을 전혀 안 바꿈',
    tb2RowAfter.current_unit_id === tb2RowBefore.current_unit_id && tb2RowAfter.is_primary === tb2RowBefore.is_primary,
    { before: tb2RowBefore, after: tb2RowAfter })
  check('3h. tb3 행만 새 유닛으로 갱신됨', tb3RowAfter.current_unit_id === tb3UnitId)

  const progressWrites = fake.__log.filter((l) => l.table === 'student_progress' || l.table === 'student_daily_progress')
  check('3i. 이 섹션 전체(전환+유닛변경)에서 student_progress/student_daily_progress(학습기록: 별/스티커/캘린더 등)에 쓰기 0건',
    progressWrites.length === 0, progressWrites)
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. 반 이동(setStudentClass) — 다른 교재 SCA 보존, DELETE 미발생 ===')
{
  await boot()
  const { cls3 } = await seedTextbooks()
  const studentId = await lib.addStudent('_QA_Isolation_S4', 'HOME반')
  await lib.assignTextbook(studentId, cls3)
  const tb3RowBefore = { ...fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls3) }
  const homeRowIdBefore = fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === HOME)?.id

  fake.__log.length = 0 // 이 시점부터만 관측 — setStudentClass 호출이 실제로 무엇을 쓰는지만 본다
  await lib.setStudentClass(studentId, 'HOME2반')

  const scaLog = fake.__log.filter((l) => l.table === 'student_class_assignments')
  check('4a. setStudentClass가 student_class_assignments에 DELETE를 전혀 issue하지 않음(2026-09-03 demote 통일 회귀 방지)',
    scaLog.filter((l) => l.op === 'delete').length === 0, scaLog)

  const tb3RowAfter = fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === cls3)
  check('4b. 다른 교재(tb3) SCA 행이 그대로 보존됨(id/값 불변)',
    !!tb3RowAfter && tb3RowAfter.id === tb3RowBefore.id && tb3RowAfter.current_unit_id === tb3RowBefore.current_unit_id && tb3RowAfter.is_primary === tb3RowBefore.is_primary,
    { before: tb3RowBefore, after: tb3RowAfter })

  const homeRowAfter = fake.__db.student_class_assignments.find((r) => r.id === homeRowIdBefore)
  check('4c. 이전 반(HOME) SCA 행도 삭제되지 않고 demote만 됨(is_primary:false, 행 자체는 생존)',
    !!homeRowAfter && homeRowAfter.is_primary === false, homeRowAfter)

  const home2RowAfter = fake.__db.student_class_assignments.find((r) => r.student_id === studentId && r.class_id === HOME2)
  check('4d. 새 반(HOME2) SCA 행이 primary로 생성됨', home2RowAfter?.is_primary === true, home2RowAfter)
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 5. 신규 학생 + 아카이브/테스트 계정(이름 충돌) — 전부 UUID 식별 ===')
{
  await boot()
  const { cls2, cls3 } = await seedTextbooks()

  // 이름이 똑같은 두 "Barry" — v1.6 이후 students.name UNIQUE 제약이 제거돼
  // 동명이인이 실제로 가능하다(addStudent 주석 참고). 이름이 같아도 배정이
  // 서로 새지 않아야 한다(규칙 4 핵심 재현).
  const barry1 = await lib.addStudent('Barry', '중1 천재 이상기', 'Unit 1')
  const barry2 = await lib.addStudent('Barry', '중1 천재 이상기', 'Unit 1')
  const dup = await lib.addStudent('Paul_DUP_Test', '중1 천재 이상기', 'Unit 1')
  const qa = await lib.addStudent('QA_Alpha', '중1 천재 이상기', 'Unit 1')
  check('5a. 동명(Barry×2) + 아카이브/QA 패턴 이름 4명 모두 서로 다른 UUID',
    new Set([barry1, barry2, dup, qa]).size === 4, [barry1, barry2, dup, qa])

  await lib.assignTextbook(barry1, cls2)
  await lib.assignTextbook(barry2, cls3)
  const barry1Assignments = await lib.getStudentClassAssignments(barry1)
  const barry2Assignments = await lib.getStudentClassAssignments(barry2)
  check('5b. 동명이인 Barry1의 배정에 Barry2가 받은 tb3(cls3)이 섞이지 않음',
    !barry1Assignments.some((a) => a.classId === cls3), barry1Assignments)
  check('5c. 동명이인 Barry2의 배정에 Barry1이 받은 tb2(cls2)가 섞이지 않음',
    !barry2Assignments.some((a) => a.classId === cls2), barry2Assignments)
  check('5d. Barry1의 SCA 행 student_id는 정확히 barry1의 UUID(barry2 UUID 아님)',
    fake.__db.student_class_assignments.filter((r) => r.class_id === cls2).every((r) => r.student_id === barry1), null)

  await lib.assignTextbook(dup, cls2)
  await lib.assignTextbook(qa, cls3)
  check('5e. Paul_DUP_Test/QA_Alpha도 동일 경로(assignTextbook)로 정상 배정(아카이브/테스트 계정 특별 취급 없음)',
    fake.__db.student_class_assignments.some((r) => r.student_id === dup && r.class_id === cls2) &&
    fake.__db.student_class_assignments.some((r) => r.student_id === qa && r.class_id === cls3))

  // 정적 검사 — 교재 배정/조회 쓰기 함수들이 students.name으로 필터링하지
  // 않는지(소스 텍스트에서 해당 함수 본문만 추출해 확인, 규칙 4).
  const src = fs.readFileSync(path.resolve('src/utils/wordLibrary.js'), 'utf8')
  const extractFn = (startMarker, endMarkers) => {
    const start = src.indexOf(startMarker)
    if (start < 0) return null
    let end = src.length
    for (const m of endMarkers) { const idx = src.indexOf(m, start + startMarker.length); if (idx > start && idx < end) end = idx }
    return src.slice(start, end)
  }
  const fnMarkers = [
    ['export async function assignTextbook(', ['export async function removeTextbookAssignment(']],
    ['export async function removeTextbookAssignment(', ['export async function setAssignmentUnit(']],
    ['export async function setAssignmentUnit(', ['export async function setPrimaryAssignment(']],
    ['export async function setPrimaryAssignment(', ['export async function setPrimaryTextbook(']],
    ['export async function setPrimaryTextbook(', ['export async function linkTextbookToClass(']],
    ['export async function getStudentClassAssignments(', ['export async function getStudentEntranceClassIds(']],
  ]
  let allClean = true
  const dirty = []
  for (const [startM, endMs] of fnMarkers) {
    const body = extractFn(startM, endMs)
    if (!body) { allClean = false; dirty.push({ startM, reason: 'not-found' }); continue }
    if (/\.eq\(\s*['"]name['"]/.test(body)) { allClean = false; dirty.push({ startM, reason: 'eq-name-found' }) }
  }
  check('5f. [정적] assignTextbook/removeTextbookAssignment/setAssignmentUnit/setPrimaryAssignment/setPrimaryTextbook/getStudentClassAssignments 어디도 .eq(\'name\'...)로 학생을 찾지 않음(전부 id 기준)',
    allClean, dirty)
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 6. 업로드 격리 재현 — 동일 유닛명 충돌 없음 + 학년 미유추 라벨 ===')
{
  await boot()
  const { tb1, tb2 } = await seedTextbooks()
  const u1 = lib.getTextbookUnits(tb1.id)[0]
  const u2 = lib.getTextbookUnits(tb2.id)[0]

  check('6a. setClassWords(중1, ..., "Unit 1") → 그 유닛의 textbook_id === tb1.id', u1.textbookId === tb1.id, u1)
  check('6b. setClassWords(중2, ..., "Unit 1") → 그 유닛의 textbook_id === tb2.id', u2.textbookId === tb2.id, u2)
  check('6c. 이름이 같은 "Unit 1"이 두 교재에 동시 존재하되 서로 다른 유닛(id 분리, 충돌 없음)',
    u1.name === 'Unit 1' && u2.name === 'Unit 1' && u1.id !== u2.id)
  check('6d. getLearnableTextbookUnits(tb1)에 중2 유닛(u2.id)이 없음', !lib.getLearnableTextbookUnits(tb1.id).some((u) => u.id === u2.id))
  check('6e. getLearnableTextbookUnits(tb2)에 중1 유닛(u1.id)이 없음', !lib.getLearnableTextbookUnits(tb2.id).some((u) => u.id === u1.id))

  // 학년 오선택 재현 — 학생 라벨은 tb.name 그대로(App.jsx 공식 그대로 재현),
  // "중2"를 "중1"로도 그 반대로도 절대 유추하지 않는다.
  const labelOf = (tb) => (tb.publisherName ? `${tb.name} (${tb.publisherName})` : tb.name)
  check('6f. tb1(중1) 라벨 = "중1 천재 이상기 (천재)"', labelOf(tb1) === '중1 천재 이상기 (천재)', labelOf(tb1))
  check('6g. tb2(중2) 라벨 = "중2 천재 이상기 (천재)" — tb1과 절대 동일하지 않음', labelOf(tb2) === '중2 천재 이상기 (천재)' && labelOf(tb2) !== labelOf(tb1), labelOf(tb2))
  // 구조적 확인 — 클라이언트 캐시 textbook 객체 자체에 grade 필드가 없다
  // (v3_13이 DB textbooks.grade_id 컬럼을 추가했지만 refreshTextbooks()의
  // select는 그 컬럼을 아예 읽지 않는다 — 스키마상 존재 ≠ 클라이언트 노출).
  const keys1 = Object.keys(lib.getTextbookById(tb1.id)).sort()
  check('6h. [구조적] 클라이언트 textbook 객체에 grade/grade_id 필드가 아예 없음(학년 유추가 코드로 불가능)',
    !keys1.some((k) => /grade/i.test(k)), keys1)
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 교재/반/유닛 격리: UUID identity 전 구간 확인(생성/조회/배정/전환/반이동/신규·중복이름 계정/업로드)')
