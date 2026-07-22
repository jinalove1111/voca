// Phase 2 DB 무결성 감사(2026-07-18) — 읽기 전용. 라이브 Supabase에서 고아
// 레코드/FK 불일치/중복 관계를 조회로만 확인한다(수정 없음 — 지시에 따라
// "있으면 데이터는 건드리지 말고 보고만"). anon key만 사용 가능한 로컬
// 환경(service role key 없음, handoff.md 기존 문서화된 제약)이라, RLS/컬럼
// 권한상 anon이 볼 수 있는 범위 안에서만 점검한다(= 클라이언트 코드가 실제로
// 보는 것과 동일한 뷰 — 오히려 "앱이 보는 데이터"와 정확히 일치하는 장점).
//
// 실행: node scripts/dbIntegrityAudit.mjs
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const BASE = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function fetchAll(table, select, { quiet = false } = {}) {
  const r = await fetch(`${BASE}/rest/v1/${table}?select=${select}&limit=10000`, { headers: H })
  if (!r.ok) {
    if (!quiet) console.log(`  [조회 불가] ${table}: ${r.status} ${(await r.text()).slice(0, 200)}`)
    return null
  }
  return r.json()
}

console.log('=== Phase 2 DB 무결성 감사 (라이브, 읽기 전용) ===\n')

const students = await fetchAll('students', 'id,name,class_id,current_unit_id,unit_name,created_at')
const classes = await fetchAll('classes', 'id,name')
// v3.1(2026-07-23 갱신) — 교재 모델 인지: units.textbook_id 포함 시도.
// supabase_v3_1_textbooks.sql 미실행 DB(컬럼/테이블 부재)에서도 이 스크립트가
// 깨지지 않도록, 실패하면 구버전 컬럼 셋으로 재시도한다(클라이언트
// wordLibrary.js의 cascading 폴백과 같은 관례 — CLAUDE.md 규칙 9).
let textbookAware = true
let units = await fetchAll('units', 'id,name,class_id,textbook_id', { quiet: true })
if (!units) {
  textbookAware = false
  units = await fetchAll('units', 'id,name,class_id')
}
// 교재/반↔교재 연결(v3.1 신규 테이블 — 없으면 null, 레거시 검사로 폴백)
const textbooks = textbookAware ? await fetchAll('textbooks', 'id,name,owner_class_id', { quiet: true }) : null
const classTextbooks = textbookAware ? await fetchAll('class_textbooks', 'class_id,textbook_id', { quiet: true }) : null
const words = await fetchAll('words', 'id,word,unit_id')
const progress = await fetchAll('student_progress', 'student_id,updated_at')
const dailyProgress = await fetchAll('student_daily_progress', 'student_id,date')
const wordStatus = await fetchAll('word_status', 'student_id,word_id')
const dailyAssign = await fetchAll('daily_assignments', 'class_id,date')
const entranceTests = await fetchAll('entrance_tests', 'id,class_id')
const entranceResults = await fetchAll('entrance_test_results', 'id,test_id,student_id')

const classIds = new Set((classes || []).map((c) => c.id))
const unitIds = new Set((units || []).map((u) => u.id))
const studentIds = new Set((students || []).map((s) => s.id))
const testIds = new Set((entranceTests || []).map((t) => t.id))
const unitById = Object.fromEntries((units || []).map((u) => [u.id, u]))

let issues = 0
function report(label, rows) {
  if (rows.length === 0) { console.log(`  OK    ${label}`); return }
  issues += rows.length
  console.log(`  FOUND ${label} — ${rows.length}건`)
  for (const r of rows.slice(0, 20)) console.log(`        ${JSON.stringify(r)}`)
  if (rows.length > 20) console.log(`        ...외 ${rows.length - 20}건`)
}

console.log(`데이터 규모: students=${students?.length ?? 'N/A'} classes=${classes?.length ?? 'N/A'} units=${units?.length ?? 'N/A'} words=${words?.length ?? 'N/A'}\n`)

console.log('1) 학생 → 반(class_id) 고아 참조')
if (students && classes) {
  report('class_id가 존재하지 않는 반을 가리키는 학생', students.filter((s) => s.class_id && !classIds.has(s.class_id)).map((s) => ({ id: s.id, name: s.name, class_id: s.class_id })))
}

console.log('\n2) 학생 → 유닛(current_unit_id) 고아 참조 + 반/교재 정합성')
if (students && units) {
  report('current_unit_id가 존재하지 않는 유닛을 가리키는 학생', students.filter((s) => s.current_unit_id && !unitIds.has(s.current_unit_id)).map((s) => ({ id: s.id, name: s.name, current_unit_id: s.current_unit_id })))
  // v3.1 교재 모델(supabase_v3_1_textbooks.sql) 인지 — 2026-07-23 오탐 교정.
  // v2.1 불변식("유닛의 반 == 학생의 반")은 교재 모드에서 더 이상 참이
  // 아니다: 유닛은 "교재의 소유 컨테이너 반"에 속하고, 학생의 사람 반은
  // class_textbooks로 그 교재에 연결만 되면 정상이다(handoff 2026-07-22 8차
  // §갭 — 이 스크립트가 v2.1 검사만 해서 정상 학생 4명을 오탐하던 문제).
  // 판정 규칙:
  //   OK  = 유닛의 반 == 학생의 반 (레거시/합성 모드 그대로)
  //   OK  = 유닛의 교재(textbook_id, NULL이면 유닛 반의 자동 교재)가
  //         학생의 반에 class_textbooks로 연결돼 있음 (교재 모드 정상)
  //   위반 = 둘 다 아님 (학생이 자기 반과 무관한 교재의 유닛을 가리킴)
  const ownTextbookByClass = new Map((textbooks || []).filter((t) => t.owner_class_id).map((t) => [t.owner_class_id, t.id]))
  const linkedTextbooksByClass = new Map()
  for (const r of classTextbooks || []) {
    if (!linkedTextbooksByClass.has(r.class_id)) linkedTextbooksByClass.set(r.class_id, new Set())
    linkedTextbooksByClass.get(r.class_id).add(r.textbook_id)
  }
  const unitTextbookId = (u) => u.textbook_id || ownTextbookByClass.get(u.class_id) || null
  const textbookMode = textbookAware && (textbooks || []).length > 0
  if (!textbookMode) {
    console.log('  [참고] textbooks 미존재/비어있음 — v2.1 불변식(유닛 반 == 학생 반)으로 검사')
  }
  report(textbookMode
    ? 'current_unit_id의 유닛이 학생 반 소속도 아니고, 학생 반에 연결된 교재(class_textbooks) 소속도 아닌 경우(v3.1 정합성 불변식 위반)'
    : 'current_unit_id가 가리키는 유닛이 학생의 반과 다른 경우(v2.1 정합성 불변식 위반)',
    students.filter((s) => {
      if (!s.current_unit_id) return false
      const u = unitById[s.current_unit_id]
      if (!u) return false // 고아 참조는 위에서 별도 보고
      if (u.class_id === s.class_id) return false // 레거시 불변식 충족
      if (!textbookMode) return true
      const tb = unitTextbookId(u)
      return !(tb && linkedTextbooksByClass.get(s.class_id)?.has(tb))
    }).map((s) => ({
      id: s.id, name: s.name, student_class: s.class_id,
      unit_class: unitById[s.current_unit_id]?.class_id,
      unit_textbook: unitTextbookId(unitById[s.current_unit_id]) || null,
    })))
}

console.log('\n3) 단어 → 유닛(unit_id) 고아 참조')
if (words && units) {
  report('unit_id가 존재하지 않는 유닛을 가리키는 단어', words.filter((w) => w.unit_id && !unitIds.has(w.unit_id)).map((w) => ({ id: w.id, word: w.word, unit_id: w.unit_id })))
}

console.log('\n4) 유닛 → 반(class_id) 고아 참조')
if (units && classes) {
  report('class_id가 존재하지 않는 반을 가리키는 유닛', units.filter((u) => u.class_id && !classIds.has(u.class_id)).map((u) => ({ id: u.id, name: u.name, class_id: u.class_id })))
}

console.log('\n5) student_progress / student_daily_progress / word_status — 고아 student_id + 중복')
if (progress) {
  report('student_progress.student_id가 존재하지 않는 학생을 가리킴(FK cascade가 정상이면 0이어야 함)',
    progress.filter((p) => !studentIds.has(p.student_id)).map((p) => ({ student_id: p.student_id })))
  const byStudent = {}
  for (const p of progress) byStudent[p.student_id] = (byStudent[p.student_id] || 0) + 1
  report('student_progress에 학생당 2개 이상 행(unique 제약 위반 가능성)',
    Object.entries(byStudent).filter(([, n]) => n > 1).map(([sid, n]) => ({ student_id: sid, count: n })))
}
if (dailyProgress) {
  report('student_daily_progress.student_id가 존재하지 않는 학생을 가리킴',
    [...new Set(dailyProgress.filter((p) => !studentIds.has(p.student_id)).map((p) => p.student_id))].map((id) => ({ student_id: id })))
}
if (wordStatus) {
  const wordIds = new Set((words || []).map((w) => w.id))
  report('word_status.student_id가 존재하지 않는 학생을 가리킴',
    [...new Set(wordStatus.filter((w) => !studentIds.has(w.student_id)).map((w) => w.student_id))].map((id) => ({ student_id: id })))
  report('word_status.word_id가 존재하지 않는 단어를 가리킴',
    [...new Set(wordStatus.filter((w) => w.word_id && !wordIds.has(w.word_id)).map((w) => w.word_id))].map((id) => ({ word_id: id })))
}

console.log('\n6) daily_assignments → 반 고아 참조')
if (dailyAssign && classes) {
  report('class_id가 존재하지 않는 반을 가리키는 daily_assignments',
    dailyAssign.filter((d) => d.class_id && !classIds.has(d.class_id)).map((d) => ({ class_id: d.class_id, date: d.date })))
}

console.log('\n7) 입실시험 — entrance_test_results 고아 참조')
if (entranceResults) {
  report('test_id가 존재하지 않는 시험을 가리키는 응시 결과',
    entranceResults.filter((r) => !testIds.has(r.test_id)).map((r) => ({ id: r.id, test_id: r.test_id })))
  report('student_id가 존재하지 않는 학생을 가리키는 응시 결과',
    entranceResults.filter((r) => !studentIds.has(r.student_id)).map((r) => ({ id: r.id, student_id: r.student_id })))
}
if (entranceTests && classes) {
  report('class_id가 존재하지 않는 반을 가리키는 입실시험',
    entranceTests.filter((t) => t.class_id && !classIds.has(t.class_id)).map((t) => ({ id: t.id, class_id: t.class_id })))
}

console.log(`\n=== 총 ${issues}건 발견 (읽기 전용 — 데이터 변경 없음) ===`)
