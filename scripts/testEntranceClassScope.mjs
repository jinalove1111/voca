// 입실시험 "조회 반 범위" 회귀 테스트 (2026-08-10) — READ-ONLY 라이브 검증.
//
// 잡는 회귀: 학생 화면(배너/응시)이 오늘의 시험을 students.class_id(사람 반)
// 하나로만 조회하던 문제. v3.1 교재 레이어부터 원장은 단어가 실제로 사는
// 교재 컨테이너 반(예: "고1 능률 민병천")으로 시험을 시작하는데,
// setPrimaryTextbook은 의도적으로 students.class_id를 바꾸지 않는다 —
// 그래서 학생 쪽 조회가 0건이 되고 배너가 조용히 안 떴다(2026-08-10 실사고:
// 오늘자 시험 3건 전부 교재 컨테이너 반 소속, 그 반의 students.class_id
// 기준 소속 학생 0명 → 전원 미표시).
//
// 계약: 학생 화면의 조회 범위 = 사람 반 ∪ student_class_assignments의 반.
// 단일 반 학생은 수정 전과 100% 동일해야 한다(회귀 없음).
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   node scripts/buildEntranceBundle.mjs
//   WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs \
//   ENTRANCE_BUNDLE=scripts/.tmp/entranceTestApi.bundle.mjs \
//   node scripts/testEntranceClassScope.mjs
//
// 쓰기는 단 한 건도 하지 않는다(조회 전용) — 실사용 데이터에 안전.
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
// 계정 종류(테스트) 판별 — 순수 모듈이라 번들 없이 직접 import한다
// (testEntranceEligibilityRules.mjs의 entranceEligibility.js 직접 import와
// 같은 관례). 2026-08-11 운영자 확정 — 관리자 분모(섹션 5)가 이제 테스트
// 계정(Cookie/Paul/Jinaa/Barry)도 제외하므로, 이 테스트의 "기대 집합" 독립
// 계산도 같은 필터를 적용해야 한다 — 안 하면 기대 집합에는 테스트 계정이
// 남아 실제(필터링된) 관리자 분모와 개수가 어긋나 FAIL 난다.
import { isTestAccountStudent } from '../src/utils/accountStatus.js'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const BASE = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const restGet = async (p) => (await fetch(`${BASE}/rest/v1/${p}`, { headers: H })).json()
// PostgREST는 .range()/limit 없는 select를 기본 1000행에서 자른다(실측: students
// 1157행 중 1000행만 도착 — 이 테스트가 기대 집합을 잘못 계산했던 원인).
// 앱 쪽 refreshStudents는 이미 페이징하므로 이건 테스트 하네스 전용 보정이다.
const restGetAll = async (p) => {
  const out = []
  const sep = p.includes('?') ? '&' : '?'
  for (let offset = 0; ; offset += 1000) {
    const page = await restGet(`${p}${sep}limit=1000&offset=${offset}`)
    if (!Array.isArray(page)) return Array.isArray(out) && out.length ? out : page
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

const lib = await import(pathToFileURL(process.env.WORDLIB_BUNDLE).href)
const api = await import(pathToFileURL(process.env.ENTRANCE_BUNDLE).href)
const {
  initWordLibrary, getStudentClassId, getStudentEntranceClassIds, getTextbookById,
  fetchEntranceRosterForClass, isArchivedOrFixtureStudentName, getClassNames, getClassIdByName,
} = lib
const { fetchTodayTests, fetchTodayTestsForClasses } = api

await initWordLibrary()

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

// entrance_tests 테이블이 아직 없으면(마이그레이션 전) 안전하게 SKIP —
// testEntranceTestDb.mjs와 동일한 관례(크래시 아님, exit 0).
const probe = await restGet('entrance_tests?select=id&limit=1')
if (!Array.isArray(probe)) {
  console.log('SKIP — entrance_tests 테이블 없음(supabase_v1_8_entrance_test.sql 미실행). 실행 후 다시 돌리세요.')
  process.exit(0)
}

const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
const sca = await restGet('student_class_assignments?select=student_id,class_id,textbook_id')
const byStudent = new Map()
const rowsByStudent = new Map()
for (const r of Array.isArray(sca) ? sca : []) {
  if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, [])
  byStudent.get(r.student_id).push(r.class_id)
  if (!rowsByStudent.has(r.student_id)) rowsByStudent.set(r.student_id, [])
  rowsByStudent.get(r.student_id).push(r)
}
// 교재 축 — 배정 행의 textbook_id가 가리키는 교재의 소유 컨테이너 반.
const tbOwnerOf = (textbookId) => (textbookId ? getTextbookById(textbookId)?.ownerClassId || null : null)

console.log('\n1. 조회 범위 헬퍼(getStudentEntranceClassIds) 계약')
{
  check('studentId 없으면 빈 배열(호출부가 조용히 아무것도 안 함)', (await getStudentEntranceClassIds(null)).length === 0)

  // 다중 배정 학생 — 사람 반과 배정 반이 전부 들어있고 중복이 없어야 한다.
  const multi = [...byStudent.entries()].find(([sid, ids]) => {
    const primary = getStudentClassId(sid)
    return primary && ids.some((c) => c !== primary)
  })
  if (!multi) {
    console.log('  SKIP  다중 배정(사람 반 ≠ 교재 반) 학생이 현재 데이터에 없음')
  } else {
    const [sid, ids] = multi
    const scope = await getStudentEntranceClassIds(sid)
    check('사람 반(students.class_id)이 반드시 포함된다', scope.includes(getStudentClassId(sid)), scope)
    check('배정된 교재 컨테이너 반이 전부 포함된다', ids.every((c) => scope.includes(c)), { scope, ids })
    check('중복 반 id 없음', new Set(scope).size === scope.length, scope)
  }

  // 단일 반 학생 — 수정 전과 동일하게 정확히 1개여야 한다(회귀 방지).
  // 교재 축(2026-08-11)까지 같은 반을 가리키는 학생만 표본으로 쓴다 —
  // 배정 행의 textbook_id가 다른 반의 교재를 가리키면 2개가 되는 것이
  // 정상(그게 이번 수정의 목적)이라, 그런 학생은 이 표본이 아니다.
  const singles = [...byStudent.entries()]
    .filter(([sid, ids]) => {
      const p = getStudentClassId(sid)
      if (!p || !ids.every((c) => c === p)) return false
      return (rowsByStudent.get(sid) || []).every((r) => {
        const owner = tbOwnerOf(r.textbook_id)
        return !owner || owner === p
      })
    })
    .slice(0, 5)
  if (singles.length === 0) {
    console.log('  SKIP  단일 반 학생 표본 없음')
  } else {
    let ok = true
    for (const [sid] of singles) {
      const scope = await getStudentEntranceClassIds(sid)
      if (scope.length !== 1 || scope[0] !== getStudentClassId(sid)) ok = false
    }
    check(`단일 반 학생(${singles.length}명 표본)은 정확히 사람 반 1개 — 수정 전과 동일`, ok)
  }
}

console.log('\n2. 다중 반 조회(fetchTodayTestsForClasses) 계약')
{
  check('빈 목록 -> 빈 배열(불필요한 조회 없음)', (await fetchTodayTestsForClasses([])).length === 0)
  check('null/undefined 섞여도 안전', (await fetchTodayTestsForClasses([null, undefined])).length === 0)

  const someClass = (await restGet('classes?select=id&limit=1'))[0]?.id
  if (someClass) {
    const single = await fetchTodayTestsForClasses([someClass])
    const legacy = await fetchTodayTests(someClass)
    check('단일 id 경로는 기존 fetchTodayTests와 완전히 동일(회귀 0)', single.length === legacy.length)
    check('중복 id를 넣어도 결과가 부풀지 않는다', (await fetchTodayTestsForClasses([someClass, someClass])).length === legacy.length)
  }
}

console.log('\n3. 실사고 재현 — 교재 컨테이너 반으로 시작된 오늘 시험이 학생에게 보이는가')
{
  const todays = await restGet(`entrance_tests?select=id,class_id&date=eq.${todayStr}`)
  if (!Array.isArray(todays) || todays.length === 0) {
    console.log('  SKIP  오늘 시작된 시험이 없음(원장이 시험을 시작한 날에만 검증되는 항목)')
  } else {
    const testClassIds = new Set(todays.map((t) => t.class_id))
    // 그 반에 배정된 학생 중 "사람 반은 다른 반"인 학생 = 예전 코드가 놓치던 학생
    const victim = [...byStudent.entries()].find(([sid, ids]) =>
      ids.some((c) => testClassIds.has(c)) && !testClassIds.has(getStudentClassId(sid)))
    if (!victim) {
      console.log('  SKIP  오늘 시험 반 = 학생 사람 반이라 이 회귀 조건에 해당하는 학생이 없음')
    } else {
      const [sid] = victim
      const legacy = await fetchTodayTests(getStudentClassId(sid))
      const fixed = await fetchTodayTestsForClasses(await getStudentEntranceClassIds(sid))
      check('예전(사람 반 단독) 경로는 이 학생에게 0건 — 이 회귀가 실제로 재현되는 데이터', legacy.length === 0)
      check('새 경로는 오늘의 시험을 찾는다(배너가 뜬다)', fixed.length > 0, { found: fixed.length })
    }
  }
}

console.log('\n4. 교재 축(2026-08-11 실사고) — setPrimaryTextbook이 class_id를 안 바꾸는 구조')
{
  // 배정 행의 textbook_id가 그 행의 class_id와 "다른" 반의 교재를 가리키는
  // 학생 = 학습 계층(단어/유닛)과 입실시험이 서로 다른 반을 보던 케이스.
  const axisSplit = [...rowsByStudent.entries()].filter(([, rows]) =>
    rows.some((r) => { const o = tbOwnerOf(r.textbook_id); return o && o !== r.class_id }))
  if (axisSplit.length === 0) {
    console.log('  SKIP  두 축이 갈라진 배정 행이 현재 데이터에 없음')
  } else {
    let allCovered = true
    let noPhantom = true
    for (const [sid, rows] of axisSplit) {
      const scope = await getStudentEntranceClassIds(sid)
      // ① 교재의 소유 반이 전부 조회 범위에 들어와야 한다
      for (const r of rows) {
        const owner = tbOwnerOf(r.textbook_id)
        if (owner && !scope.includes(owner)) allCovered = false
      }
      // ② 범위에 들어온 반은 전부 "근거 있는" 반이어야 한다 —
      //    사람 반 / 배정 행의 class_id / 배정 교재의 소유 반 중 하나.
      const allowed = new Set([
        getStudentClassId(sid),
        ...rows.map((r) => r.class_id),
        ...rows.map((r) => tbOwnerOf(r.textbook_id)),
      ].filter(Boolean))
      if (!scope.every((c) => allowed.has(c))) noPhantom = false
      // ③ 중복 없음
      if (new Set(scope).size !== scope.length) noPhantom = false
    }
    check(`두 축이 갈라진 학생(${axisSplit.length}명) 전원 — 배정 교재의 소유 반이 조회 범위에 포함된다`, allCovered)
    check('근거 없는 반이 섞이지 않는다(다른 반 시험 오노출 방지) + 중복 없음', noPhantom)

    // 오늘 시험이 있으면 실제 노출까지 확인
    const todays2 = await restGet(`entrance_tests?select=id,class_id&date=eq.${todayStr}`)
    if (Array.isArray(todays2) && todays2.length > 0) {
      const testClassIds = new Set(todays2.map((t) => t.class_id))
      const rescued = axisSplit.filter(([sid, rows]) => {
        const oldScope = new Set([getStudentClassId(sid), ...rows.map((r) => r.class_id)].filter(Boolean))
        const owners = rows.map((r) => tbOwnerOf(r.textbook_id)).filter(Boolean)
        return owners.some((o) => testClassIds.has(o)) && ![...oldScope].some((c) => testClassIds.has(c))
      })
      if (rescued.length === 0) {
        console.log('  SKIP  오늘 시험 반이 교재 축 전용 학생과 겹치지 않음')
      } else {
        let ok = true
        for (const [sid] of rescued) {
          if ((await fetchTodayTestsForClasses(await getStudentEntranceClassIds(sid))).length === 0) ok = false
        }
        check(`교재 축으로만 자격이 생기는 학생 ${rescued.length}명 — 오늘 시험이 실제로 조회된다`, ok)
      }
    } else {
      console.log('  SKIP  오늘 시작된 시험이 없음')
    }
  }
}

console.log('\n5. 관리자 "반 전체 N명" 분모 == 학생 화면 대상 집합')
{
  // 2026-08-11 — 관리자 분모(fetchEntranceRosterForClass)와 학생 노출
  // (getStudentEntranceClassIds)이 같은 집합이어야 한다. 예전엔 관리자만
  // students.class_id를 봐서 교재 반은 0명, 사람 반은 아카이브 계정까지
  // 세는 과다 집계였다.
  const students = await restGetAll('students?select=id,name,class_id')
  const tbs = await restGetAll('textbooks?select=id,owner_class_id')
  const ownTbByClass = new Map()
  for (const t of Array.isArray(tbs) ? tbs : []) {
    if (!t.owner_class_id) continue
    if (!ownTbByClass.has(t.owner_class_id)) ownTbByClass.set(t.owner_class_id, [])
    ownTbByClass.get(t.owner_class_id).push(t.id)
  }
  // 2026-08-11 — 아카이브/픽스처 제외에 더해, 운영자 테스트/QA 계정(Cookie/
  // Paul/Jinaa/Barry)도 "실제 학생" 기대 집합에서 제외한다(wordLibrary.js
  // fetchEntranceRosterForClass의 실제 필터와 동일 규칙이어야 함).
  const realStudents = (Array.isArray(students) ? students : [])
    .filter((s) => !isArchivedOrFixtureStudentName(s.name) && !isTestAccountStudent(s))

  check('아카이브/픽스처 판별기 계약(_DUP/_INACTIVE/QA_ 접두·접미)',
    isArchivedOrFixtureStudentName('김가윤_DUP2_212b1c_INACTIVE') &&
    isArchivedOrFixtureStudentName('QA_PinKid') &&
    isArchivedOrFixtureStudentName('_QA_Song_TextbookModel_20260722') &&
    !isArchivedOrFixtureStudentName('Jinaa') &&
    !isArchivedOrFixtureStudentName('박서진'))

  let mismatches = []
  let junkLeak = []
  for (const name of getClassNames()) {
    if (/^QA_|^_QA/.test(name)) continue // QA 픽스처 반은 검증 대상 아님
    const cid = getClassIdByName(name)
    if (!cid) continue
    const roster = await fetchEntranceRosterForClass(cid)
    // 기대 집합 = 원시 데이터로 같은 규칙을 독립 계산
    const ownTb = ownTbByClass.get(cid) || []
    const expected = new Set(realStudents.filter((s) => s.class_id === cid).map((s) => s.id))
    for (const r of Array.isArray(sca) ? sca : []) {
      if (r.class_id === cid || (r.textbook_id && ownTb.includes(r.textbook_id))) expected.add(r.student_id)
    }
    for (const id of [...expected]) {
      if (!realStudents.some((s) => s.id === id)) expected.delete(id) // 아카이브/픽스처 제외
    }
    const got = new Set(roster.map((s) => s.id))
    if (got.size !== expected.size || [...expected].some((id) => !got.has(id))) {
      mismatches.push(`${name}(관리자 ${got.size} vs 기대 ${expected.size})`)
    }
    if (roster.some((s) => isArchivedOrFixtureStudentName(s.name) || isTestAccountStudent(s))) junkLeak.push(name)
  }
  check('모든 실제 반에서 관리자 분모 = 기대 집합(사람 반 ∪ SCA 반 ∪ 배정 교재 소유 반 − 아카이브 − 테스트 계정)',
    mismatches.length === 0, mismatches.join(', '))
  check('분모에 아카이브/중복/QA/테스트(Cookie·Paul·Jinaa·Barry) 계정이 섞이지 않는다', junkLeak.length === 0, junkLeak.join(', '))

  // 관리자 분모에 든 학생은 학생 화면에서도 그 반의 시험을 볼 수 있어야 한다
  // (두 함수가 같은 규칙을 쓰는지 실제 호출로 교차 확인 — 표본 검사).
  const sampleClass = getClassNames().find((n) => !/^QA_|^_QA/.test(n) && (ownTbByClass.get(getClassIdByName(n)) || []).length > 0)
  if (!sampleClass) {
    console.log('  SKIP  교재를 소유한 실제 반이 없음')
  } else {
    const cid = getClassIdByName(sampleClass)
    const roster = await fetchEntranceRosterForClass(cid)
    let ok = true
    for (const s of roster.slice(0, 12)) {
      if (!(await getStudentEntranceClassIds(s.id)).includes(cid)) ok = false
    }
    check(`관리자 분모의 학생은 학생 화면 조회 범위에도 그 반이 있다("${sampleClass}" ${Math.min(roster.length, 12)}명 표본)`, ok)
  }
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n실패 ${failures}건 ❌`)
process.exit(failures === 0 ? 0 : 1)
