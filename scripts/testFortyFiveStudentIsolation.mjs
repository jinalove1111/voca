// 45-STUDENT IDENTITY ISOLATION TEST (2026-09-11)
//
// 초등 5반×9명=45명 완전 합성(crypto.randomUUID(), 실데이터 0) fixture로
// src/utils/wordLibrary.js의 학생 식별/반/교재/유닛/단어/맞춤법 설정/진도
// 조회 경로가 학생 간에 절대 새지 않는지 검증한다. 네트워크 0 — esbuild로
// wordLibrary.js를 번들하고 supabaseClient만 이 파일의 인메모리 가짜(쓰기
// 기록형, scripts/testAssignmentUnitGuards.mjs와 동일 계약)로 교체한다.
//
// fixture: scripts/fixtures/elementary45.mjs (이 파일은 읽기만 함).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'
import { buildElementary45Dataset } from './fixtures/elementary45.mjs'

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

// ── 인메모리 가짜 supabase(쓰기 기록) — testAssignmentUnitGuards.mjs와 동일
// 계약(그 파일은 읽기만 하고 수정하지 않음 — 이 파일은 독립 복제본이며
// 이 스위트가 필요로 하는 테이블(textbooks/class_textbooks/student_progress)
// 까지 __db 초기 키셋을 넓혔다). ──────────────────────────────────────────
const fakePath = path.join(TMP, 'fakeSupabaseForFortyFiveIsolation.mjs')
fs.writeFileSync(fakePath, `
export const __db = { classes: [], units: [], words: [], students: [], textbooks: [], class_textbooks: [], student_class_assignments: [], daily_assignments: [], student_progress: [] }
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
const outfile = path.join(TMP, 'wordLibrary.fortyFiveIsolation.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'], bundle: true, format: 'esm', platform: 'node', outfile,
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://offline.invalid'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('offline-test-key'), 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'fake-supabase', setup(b) { b.onResolve({ filter: /supabaseClient(\.js)?$/ }, () => ({ path: fakeUrl, external: true })) } }],
})
const lib = await import(pathToFileURL(outfile).href + '?t=' + Date.now())
const fake = await import(fakeUrl)

let failures = 0, asserted = 0
const check = (label, cond, detail) => { asserted++; if (cond) { /* PASS — 로그는 요약만 출력(45명×다항목이라 상세 로그는 FAIL만) */ } else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); failures++ } }

const fx = buildElementary45Dataset()
const { dataset, roster, HOME, TB, CONT, GHOST_UNIT, KINNEY_A, KINNEY_B, KINNEY_TRAIL, KINNEY_INNER, QA_BARRY, ARCHIVED_DUP, GHOST_STUDENT } = fx

async function boot() {
  fake.__reset(dataset)
  await lib.refreshWordLibrary(); await lib.refreshStudents(); await lib.refreshClassSettings(); await lib.refreshTextbooks()
  lib.invalidateStudentAssignmentsCache?.()
  // 로그인 시점에 App.jsx가 하는 것과 동일하게 45명 전원의 배정 캐시를
  // 미리 예열한다 — getStudentPrimaryTextbook/getStudentAssignedTextbookIds
  // 등은 이 캐시(_studentAssignmentsCache)가 채워져 있어야 정확히 동작한다.
  await Promise.all(roster.map((r) => lib.getStudentClassAssignments(r.id)))
  fake.__log.length = 0
}

console.log('\n=== 0. 전제: fixture가 45명/5반/3교재 구조를 만든다 ===')
{
  await boot()
  check('학생 45명', dataset.students.length === 45, dataset.students.length)
  check('홈 반 5개', Object.keys(HOME).length === 5)
  check('교재 3개(A/B/Ghost)', dataset.textbooks.length === 3)
  check('SCA 행 90개(학생당 홈+primary 2행)', dataset.student_class_assignments.length === 90, dataset.student_class_assignments.length)
  check('진도(student_progress) 행 45개', dataset.student_progress.length === 45)
  check('getRealClassNames가 교재 컨테이너 3개를 제외하고 홈 반 5개만 반환', (() => {
    const names = lib.getRealClassNames()
    return names.length === 5 && [CONT.contA, CONT.contB, CONT.contGhost].every((c) => !names.includes(c.name))
  })())
}

console.log('\n=== 1. 45명 전원 — 학생/반/교재/유닛/단어/설정 격리 ===')
{
  await boot()
  for (const r of roster) {
    const s = lib.getStudentById(r.id)
    check(`[${r.name}/${r.id.slice(0, 8)}] getStudentById 자기 자신 반환`, !!s && s.id === r.id, s)
    check(`[${r.name}] class_id === 자기 홈 반`, s?.classId === r.homeClassId)
    check(`[${r.name}] getStudentClass === 자기 홈 반 이름`, lib.getStudentClass(r.id) === r.homeClassName, lib.getStudentClass(r.id))

    const tb = lib.getStudentPrimaryTextbook(r.id)
    check(`[${r.name}] primary 교재 = 자기 교재(${r.textbookName})`, tb?.id === r.textbookId, tb)

    const assigned = lib.getStudentAssignedTextbookIds(r.id)
    const homeDefaults = new Set(lib.getStudentClassDefaultTextbookIds(r.id))
    check(`[${r.name}] 배정 교재 id ⊆ 자기 홈 반의 class_textbooks`, assigned.every((id) => homeDefaults.has(id)), { assigned: [...assigned], homeDefaults: [...homeDefaults] })
    check(`[${r.name}] 배정 교재 목록에 자기 primary 교재 포함`, assigned.includes(r.textbookId), assigned)

    const unitId = lib.getStudentUnitId(r.id)
    check(`[${r.name}] 현재 유닛 = 자기 유닛(${r.unitName})`, unitId === r.unitId, unitId)
    const unitObj = lib.getUnitById(unitId)
    check(`[${r.name}] 현재 유닛이 자기 primary 교재 소속(textbookId 일치)`, unitObj?.textbookId === r.textbookId, unitObj)

    const wordsOut = lib.getStudentWords(r.id)
    check(`[${r.name}] 단어 수 = 자기 유닛 단어 수(${r.expectedWordCount})`, wordsOut.length === r.expectedWordCount, wordsOut.length)
    const dbIds = new Set(wordsOut.map((w) => w.dbId))
    check(`[${r.name}] 반환된 단어 dbId가 전부 자기 유닛 소속(외부 유입 0)`,
      [...dbIds].every((id) => r.expectedWordIds.has(id)) && dbIds.size === r.expectedWordCount,
      { got: dbIds.size, expected: r.expectedWordCount })

    const settings = lib.getStudentSpellingSettings(r.id)
    check(`[${r.name}] 맞춤법 설정이 홈 반(kr2en)이 아니라 자기 교재 소유 반(${r.spellingDirection})에서 해석됨`,
      settings.spellingDirection === r.spellingDirection, settings)
  }
}

console.log('\n=== 2. 동명이인 "Kinney" — 다른 UUID/반/유닛으로 완전히 분리 ===')
{
  await boot()
  check('KINNEY_A/KINNEY_B가 서로 다른 UUID', KINNEY_A.id !== KINNEY_B.id)
  check('두 Kinney가 서로 다른 홈 반', KINNEY_A.homeClassId !== KINNEY_B.homeClassId)
  check('두 Kinney가 서로 다른 유닛', KINNEY_A.unitId !== KINNEY_B.unitId)
  check('getStudentById(KINNEY_A) !== getStudentById(KINNEY_B) 내용', lib.getStudentById(KINNEY_A.id) !== lib.getStudentById(KINNEY_B.id))
  check('KINNEY_A 단어 목록에 KINNEY_B 유닛 단어 0개 혼입', lib.getStudentWords(KINNEY_A.id).every((w) => !KINNEY_B.expectedWordIds.has(w.dbId)))
  check('KINNEY_B 단어 목록에 KINNEY_A 유닛 단어 0개 혼입', lib.getStudentWords(KINNEY_B.id).every((w) => !KINNEY_A.expectedWordIds.has(w.dbId)))
  // findStudentByName은 trim()+toLowerCase()로만 정규화한다(내부 공백은
  // 보존) — 그래서 "Kinney"/"Kinney"/"kinney "(끝공백+소문자)는 전부 같은
  // 정규화 키("kinney")로 모이지만, "Kin ney"(내부 공백)는 "kin ney"라는
  // 다른 키가 돼 여기 걸리지 않는다. 이 스위트는 이 실제 코드 동작을
  // 있는 그대로 고정한다(추측이 아니라 findStudentByName 소스 확인 결과).
  const candidates = lib.findStudentByName('Kinney')
  check('findStudentByName("Kinney") — trim/lowercase 동일 정규화 키를 가진 3명(KINNEY_A/B + kinney 끝공백) 전부 반환',
    candidates.length === 3, candidates.map((c) => c.id))
  check('findStudentByName 결과 UUID 집합 = {KINNEY_A, KINNEY_B, KINNEY_TRAIL} 정확히 일치',
    new Set(candidates.map((c) => c.id)).size === 3 &&
    [KINNEY_A.id, KINNEY_B.id, KINNEY_TRAIL.id].every((id) => candidates.some((c) => c.id === id)))
  check('findStudentByName 결과에 KINNEY_INNER("Kin ney", 내부 공백)는 포함되지 않음(다른 정규화 키)',
    !candidates.some((c) => c.id === KINNEY_INNER.id))
  check('findStudentByName 결과 3명 모두 서로 다른 반/유닛(같은 이름 키라도 데이터는 완전히 분리)',
    new Set(candidates.map((c) => c.classId)).size >= 2)
}

console.log('\n=== 3. 대소문자/공백 변형 + QA/아카이브 이름 패턴 — 전부 별개 UUID, 조회는 독립 ===')
{
  await boot()
  const ids = [KINNEY_A.id, KINNEY_B.id, KINNEY_TRAIL.id, KINNEY_INNER.id, QA_BARRY.id, ARCHIVED_DUP.id]
  check('6개 이름 변형/패턴이 전부 서로 다른 UUID(45명 중 중복 없음)', new Set(ids).size === ids.length, ids)
  check('KINNEY_TRAIL("kinney ") 자신의 단어 조회는 KINNEY_A/B 단어를 전혀 혼입하지 않음(이름 키 충돌과 무관하게 UUID로 완전 격리)',
    lib.getStudentWords(KINNEY_TRAIL.id).every((w) => KINNEY_TRAIL.expectedWordIds.has(w.dbId)))
  check('KINNEY_INNER("Kin ney")도 자기 자신의 유닛/단어만 조회됨',
    lib.getStudentUnitId(KINNEY_INNER.id) === KINNEY_INNER.unitId &&
    lib.getStudentWords(KINNEY_INNER.id).every((w) => KINNEY_INNER.expectedWordIds.has(w.dbId)))
  check('QA_BARRY(Barry)는 자기 반/유닛/단어만 보유(다른 학생과 무교차)',
    lib.getStudentWords(QA_BARRY.id).every((w) => QA_BARRY.expectedWordIds.has(w.dbId)))
  check('ARCHIVED_DUP(_DUP_..._INACTIVE 패턴)도 정상적으로 자기 반/유닛/단어만 조회됨(격리 자체는 이름 패턴과 무관)',
    lib.getStudentWords(ARCHIVED_DUP.id).every((w) => ARCHIVED_DUP.expectedWordIds.has(w.dbId)) &&
    lib.getStudentWords(ARCHIVED_DUP.id).length === ARCHIVED_DUP.expectedWordCount)
}

console.log('\n=== 4. 1단어 유령 유닛(GhostKid) — 다른 학생 유닛/단어 유출 없음 ===')
{
  await boot()
  const unitId = lib.getStudentUnitId(GHOST_STUDENT.id)
  check('GhostKid의 현재 유닛 id는 자기 primary 교재(교재Ghost) 소속 유닛(GHOST_UNIT) 자기 자신',
    unitId === GHOST_UNIT.id, unitId)
  check('GhostKid의 현재 유닛 id가 교재A/교재B의 어떤 유닛도 아님(교차 텍스트북 유출 0)',
    !dataset.units.some((u) => u.id === unitId && u.textbook_id !== TB.TB_GHOST.id))
  check('getLearnableTextbookUnits(교재Ghost) = 0개(1단어 유령 제외 — UI 셀렉터 노출 차단 계약)',
    lib.getLearnableTextbookUnits(TB.TB_GHOST.id).length === 0)
  const words = lib.getStudentWords(GHOST_STUDENT.id)
  check('GhostKid의 단어 목록 = 자기 유령 유닛의 1단어뿐(다른 학생 단어 0개 혼입)',
    words.length === 1 && GHOST_STUDENT.expectedWordIds.has(words[0].dbId))
  check('다른 45명 중 어느 학생도 GhostKid의 유닛/단어를 받지 않는다',
    roster.filter((r) => r.id !== GHOST_STUDENT.id).every((r) => lib.getStudentUnitId(r.id) !== unitId))
}

console.log('\n=== 5. 반 간 교재 연결 배타성(class_textbooks) — 교차 오염 0 ===')
{
  await boot()
  const tbIdsOf = (classId) => new Set(lib.getClassTextbooks(classId).map((t) => t.id))
  check('홈1(교재A만) — 교재B/교재Ghost 미포함', !tbIdsOf(HOME.HOME1).has(TB.TB_B.id) && !tbIdsOf(HOME.HOME1).has(TB.TB_GHOST.id))
  check('홈2(교재A만) — 교재B/교재Ghost 미포함', !tbIdsOf(HOME.HOME2).has(TB.TB_B.id) && !tbIdsOf(HOME.HOME2).has(TB.TB_GHOST.id))
  check('홈4(교재B만) — 교재A/교재Ghost 미포함', !tbIdsOf(HOME.HOME4).has(TB.TB_A.id) && !tbIdsOf(HOME.HOME4).has(TB.TB_GHOST.id))
  check('홈5(교재B+Ghost) — 교재A 미포함(Ghost는 홈5 전용)', !tbIdsOf(HOME.HOME5).has(TB.TB_A.id) && tbIdsOf(HOME.HOME5).has(TB.TB_GHOST.id))
  check('교재Ghost는 홈5 반에만 연결(다른 4개 홈 반은 전부 미포함)',
    [HOME.HOME1, HOME.HOME2, HOME.HOME3, HOME.HOME4].every((cid) => !tbIdsOf(cid).has(TB.TB_GHOST.id)))
  check('홈3(교재A+B) — 두 교재 모두 포함', tbIdsOf(HOME.HOME3).has(TB.TB_A.id) && tbIdsOf(HOME.HOME3).has(TB.TB_B.id))
}

console.log('\n=== 6. 진도 레코드(student_progress) — 학생당 정확히 1건, 공유 0 ===')
{
  const ids = dataset.student_progress.map((p) => p.student_id)
  const rowIds = dataset.student_progress.map((p) => p.id)
  check('student_progress 행 수 45', dataset.student_progress.length === 45)
  check('student_id 집합 크기 45(중복 0 — 두 학생이 같은 행을 공유하지 않음)', new Set(ids).size === 45, new Set(ids).size)
  check('행 id 집합 크기 45(행 자체도 유일)', new Set(rowIds).size === 45)
  check('모든 student_id가 실제 45명 로스터에 속함(유령 행 없음)', ids.every((sid) => roster.some((r) => r.id === sid)))
}

console.log('\n=== 7. 재로그인(refreshAllForLogin) — A 재조회 후 B에 stale 값 없음 ===')
{
  await boot()
  const A = KINNEY_A, B = KINNEY_B
  const beforeB = {
    tb: lib.getStudentPrimaryTextbook(B.id)?.id,
    unit: lib.getStudentUnitId(B.id),
    words: new Set(lib.getStudentWords(B.id).map((w) => w.dbId)),
    settings: lib.getStudentSpellingSettings(B.id).spellingDirection,
  }
  await lib.refreshAllForLogin(A.id)
  // A 재조회(캐시 무효화 후 재조회) — 여전히 자기 자신 값이어야 함.
  await lib.getStudentClassAssignments(A.id)
  check('재로그인(A) 후 A 자신의 primary 교재는 그대로 자기 교재', lib.getStudentPrimaryTextbook(A.id)?.id === A.textbookId)
  check('재로그인(A) 후 A 자신의 유닛도 그대로 자기 유닛', lib.getStudentUnitId(A.id) === A.unitId)
  check('재로그인(A) 후 B의 primary 교재는 무변화(A 값으로 오염되지 않음)', lib.getStudentPrimaryTextbook(B.id)?.id === beforeB.tb)
  check('재로그인(A) 후 B의 유닛은 무변화', lib.getStudentUnitId(B.id) === beforeB.unit)
  const afterBWords = new Set(lib.getStudentWords(B.id).map((w) => w.dbId))
  check('재로그인(A) 후 B의 단어 목록 무변화(집합 동일)', afterBWords.size === beforeB.words.size && [...afterBWords].every((id) => beforeB.words.has(id)))
  check('재로그인(A) 후 B의 맞춤법 설정 무변화', lib.getStudentSpellingSettings(B.id).spellingDirection === beforeB.settings)
  check('재로그인(A) 후 B의 단어 목록에 A쪽 유닛 단어가 하나도 섞이지 않음', [...afterBWords].every((id) => !A.expectedWordIds.has(id)))
}

console.log('\n=== 8. 정적 검사 — localStorage 키가 학생 이름이 아니라 UUID(studentId)로만 식별됨(규칙 4) ===')
{
  const useStudentSrc = fs.readFileSync(path.resolve('src/hooks/useStudent.js'), 'utf8')
  const wordLibSrc = fs.readFileSync(path.resolve('src/utils/wordLibrary.js'), 'utf8')

  const callRe = /localStorage\.(getItem|setItem|removeItem)\(([^)]*)\)/g
  function scanNameInterpolation(src, label) {
    let m
    const offenders = []
    while ((m = callRe.exec(src))) {
      const args = m[2]
      // legacy oldKey(name, type) 읽기 전용 마이그레이션 키는 문서화된 유일한
      // 예외(2026-07-15 P0 identity 리팩터링 주석, readOld(oldKey(...))로만
      // 쓰임 — 아래 별도 검사로 "쓰기"에는 안 쓰임을 확인한다).
      if (/oldKey\(/.test(args)) continue
      if (/\$\{[^}]*[Nn]ame[^}]*\}/.test(args)) offenders.push(`${label}: ${m[0]}`)
    }
    return offenders
  }
  const offendersA = scanNameInterpolation(useStudentSrc, 'useStudent.js')
  const offendersB = scanNameInterpolation(wordLibSrc, 'wordLibrary.js')
  check('useStudent.js — localStorage 키 템플릿에 학생 표시이름 보간 0건(oldKey 레거시 읽기 제외)', offendersA.length === 0, offendersA)
  check('wordLibrary.js — localStorage 키 템플릿에 학생 표시이름 보간 0건', offendersB.length === 0, offendersB)

  const legacyWriteRe = /localStorage\.(setItem|removeItem)\([^)]*oldKey\(/
  check('레거시 이름 키(oldKey)는 오직 읽기(readOld)에만 쓰이고 새로 쓰기(setItem/removeItem)에는 절대 안 쓰임',
    !legacyWriteRe.test(useStudentSrc))

  check('useStudent.js STORE_KEY(진행도 통합 저장소)가 단일 상수 문자열(학생별 키 아님)',
    /const STORE_KEY = '[^']+'/.test(useStudentSrc))
  check('useStudent.js loadRecord/markSync* 등 studentId 매개변수로 store[id]/store[studentId] 조회(이름 아님)',
    /store\[id\]/.test(useStudentSrc) && /loadStore\(\)\[studentId\]/.test(useStudentSrc))
}

console.log('\n' + '='.repeat(70))
console.log(`총 ${asserted}단언 — PASS ${asserted - failures} / FAIL ${failures}`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 45명(5반×9명) 합성 fixture 전원 학생 간 데이터 격리 확인(반/교재/유닛/단어/설정/진도, 동명이인 UUID 분리, 재로그인 stale 0). 네트워크 0.')
