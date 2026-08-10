// scripts/auditCurriculumIntegrity.mjs — 커리큘럼 구조 무결성 감사 (2026-08-09 야간)
//
// 100% READ-ONLY(SELECT/HEAD만) — 실행해도 프로덕션 데이터가 변하지 않는다.
// v3_30 유닛 정리(2026-08-09) 이후 상태를 기준선으로, 다음 회귀를 감지한다:
//   1. 깨진 포인터: students/SCA → 존재하지 않는 unit/class, words → 없는 unit
//   2. 같은 교재 안 정규화 중복 유닛 이름("Unit 1" vs "Unit1" 분열 재발)
//   3. 새로 생긴 빈 유닛(단어 0) — 알려진 보류 2개(김기택/박준원 빈 Unit 1,
//      운영자 결정 대기)만 허용, 그 외 발견 시 FAIL
//   4. 승인되지 않은 예문이 approved 조회에 노출되는지(데이터 레벨 재확인)
//
// 실행: node scripts/auditCurriculumIntegrity.mjs
//   (.env의 VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY 사용 — 없으면 SKIP exit 0,
//    testXpLedgerDb.mjs와 동일한 "정직한 SKIP" 관례)
import { readFileSync, existsSync } from 'node:fs'

for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}
const URL_BASE = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!URL_BASE || !KEY) {
  console.log('SKIP — VITE_SUPABASE_URL/ANON_KEY 없음(.env). 무결성 감사는 라이브 전용.')
  process.exit(0)
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
async function getAll(path, params) {
  const out = []
  for (let off = 0; ; off += 1000) {
    const q = new URLSearchParams({ ...params, limit: '1000', offset: String(off) })
    const r = await fetch(`${URL_BASE}/rest/v1/${path}?${q}`, { headers: H })
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
    const rows = await r.json()
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// 알려진 보류(2026-08-09 감사 확정) — 빈 유닛이지만 의도적으로 남긴 것.
// 운영자가 정리하면 이 목록에서 제거할 것(그때까지 여기 있으면 PASS 유지).
const KNOWN_EMPTY_UNIT_ALLOWLIST = new Set([
  'e4804821-5bab-408f-b2eb-4d991d9d3c22', // 중2 능률 김기택 빈 "Unit 1" (과 번호 UNKNOWN)
  '67c8268e-41b6-4307-918a-47713522f43b', // 중2 YMB 박준원 빈 "Unit 1" (과 번호 UNKNOWN)
])

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

console.log('\n=== [audit] 커리큘럼 구조 무결성(라이브, READ-ONLY) ===')
const [classes, textbooks, units] = await Promise.all([
  getAll('classes', { select: 'id' }),
  getAll('textbooks', { select: 'id' }),
  getAll('units', { select: 'id,name,textbook_id,class_id', order: 'id' }),
])
const students = await getAll('students', { select: 'id,name,class_id,current_unit_id', order: 'id' })
const sca = await getAll('student_class_assignments', { select: 'id,student_id,class_id,current_unit_id', order: 'id' })
const words = await getAll('words', { select: 'id,unit_id', order: 'id' })

const clsIds = new Set(classes.map(c => c.id))
const tbIds = new Set(textbooks.map(t => t.id))
const unitIds = new Set(units.map(u => u.id))
const stuIds = new Set(students.map(s => s.id))
const wcByUnit = {}
words.forEach(w => { wcByUnit[w.unit_id] = (wcByUnit[w.unit_id] || 0) + 1 })

// 1. 깨진 포인터
check('students.current_unit_id 전부 실존 유닛', students.every(s => !s.current_unit_id || unitIds.has(s.current_unit_id)))
check('students.class_id 전부 실존 반', students.every(s => !s.class_id || clsIds.has(s.class_id)))
check('SCA.current_unit_id 전부 실존 유닛', sca.every(a => !a.current_unit_id || unitIds.has(a.current_unit_id)))
check('SCA.class_id 전부 실존 반', sca.every(a => !a.class_id || clsIds.has(a.class_id)))
check('SCA.student_id 전부 실존 학생(orphan SCA 0)', sca.every(a => stuIds.has(a.student_id)))
check('words.unit_id 전부 실존 유닛(orphan words 0)', words.every(w => !w.unit_id || unitIds.has(w.unit_id)))
check('units.textbook_id 전부 실존 교재(또는 null)', units.every(u => !u.textbook_id || tbIds.has(u.textbook_id)))

// 2. 같은 교재 안 정규화 중복 유닛 이름
const unitNameKey = s => String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/0+(\d+)$/, '$1')
const dupGroups = []
for (const tbId of tbIds) {
  const g = {}
  units.filter(u => u.textbook_id === tbId).forEach(u => (g[unitNameKey(u.name)] ||= []).push(u))
  Object.values(g).forEach(arr => { if (arr.length > 1) dupGroups.push(arr.map(u => u.name).join(' vs ')) })
}
check('같은 교재 내 정규화 중복 유닛 이름 0건("Unit 1"/"Unit1" 분열 재발 감지)', dupGroups.length === 0, dupGroups.join(' | '))

// 3. 새로 생긴 빈 유닛
const emptyUnits = units.filter(u => !wcByUnit[u.id])
const newEmpties = emptyUnits.filter(u => !KNOWN_EMPTY_UNIT_ALLOWLIST.has(u.id))
check(`빈 유닛은 알려진 보류(${KNOWN_EMPTY_UNIT_ALLOWLIST.size}개) 외 신규 0건`, newEmpties.length === 0,
  newEmpties.map(u => `${u.name}(${u.id.slice(0, 8)})`).join(', '))

// 4. 승인 필터 데이터 레벨 재확인 — pending/draft 예문이 approved 조회에
//    나오면 안 됨(exampleLibrary가 approved 하드코딩이지만, 데이터 측도 확인).
const allExamples = await getAll('examples', { select: 'id,approval_status,target_word,english_sentence,practice_sentence', order: 'id' })
const badStatus = allExamples.filter(e => !['draft', 'pending', 'approved', 'rejected'].includes(e.approval_status))
check('examples.approval_status 전부 유효값', badStatus.length === 0)

// 4-b. 저장된 practice_sentence(본문 핵심 표현) 사후 재검증 — 2026-08-11.
//    배경: 표현 추출/검증(validatePracticeSentence)은 관리자 UI 컴포넌트
//    안에서만 돈다. 즉 다른 경로(스크립트/향후 API/직접 수정)로 들어온 값은
//    아무도 검사하지 않는다. 여기서 "이미 저장된 값"을 데이터 측에서 다시
//    검사해, 규칙을 벗어난 행이 조용히 쌓이는 것을 감지한다(쓰기 없음).
//    불변식(둘 다 절대 규칙):
//      ① practice_sentence는 english_sentence(본문 원문)의 정확한 부분 문자열
//      ② target_word가 온전한 단어 형태로 포함
{
  const rows = allExamples.filter(e => e.practice_sentence && String(e.practice_sentence).trim())
  const notSubstring = []
  const missingTarget = []
  for (const e of rows) {
    const p = String(e.practice_sentence).trim()
    const src = String(e.english_sentence || '')
    if (!src.includes(p)) { notSubstring.push(e.id); continue }
    const w = String(e.target_word || '').trim()
    if (!w) continue
    // 온전한 단어 경계 매칭(대소문자 무시) — practiceSentence.js의
    // containsTargetWholeWord와 같은 정신. 굴절형은 여기서 판정하지 않고
    // "원형이 아예 안 보이는" 경우만 잡는다(오탐 최소화).
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (!new RegExp(`(^|[^A-Za-z])${esc}`, 'i').test(p)) missingTarget.push(`${e.id.slice(0, 8)}:${w}`)
  }
  check(`practice_sentence가 본문 원문의 부분 문자열(검사 ${rows.length}건)`,
    notSubstring.length === 0, notSubstring.slice(0, 10).join(', '))
  check('practice_sentence에 target_word가 포함',
    missingTarget.length === 0, missingTarget.slice(0, 10).join(', '))
}

// 5. 배정 축(class_id vs textbook_id) 정합성 — 2026-08-11 실사고 후속.
//    배경: student_class_assignments 한 행에는 독립된 두 축이 있다.
//    class_id(v2.9 컨테이너 반)와 textbook_id(v3.1 교재). setPrimaryTextbook은
//    textbook_id만 갱신하고 class_id는 예전 값 그대로 두므로 "두 축이 갈라진
//    행"은 손상이 아니라 정상 상태다 — 따라서 갈라짐 자체는 FAIL이 아니라
//    관측치로만 기록한다. 진짜로 깨지면 안 되는 불변식은 아래 두 가지다.
const textbooksFull = await getAll('textbooks', { select: 'id,owner_class_id', order: 'id' })
const scaTb = await getAll('student_class_assignments', { select: 'student_id,class_id,textbook_id', order: 'student_id' })
const tbOwner = new Map(textbooksFull.map(t => [t.id, t.owner_class_id]))
const unitOwnerClass = new Map(units.map(u => [u.id, u.class_id]))

check('SCA.textbook_id 전부 실존 교재(또는 null)', scaTb.every(a => !a.textbook_id || tbIds.has(a.textbook_id)))
check('textbooks.owner_class_id 전부 실존 반(또는 null)', textbooksFull.every(t => !t.owner_class_id || clsIds.has(t.owner_class_id)))

// 핵심 불변식: 학생이 "실제로 학습 중인" 유닛의 소유 반은 반드시 그 학생의
// 입실시험 조회 범위(사람 반 ∪ SCA.class_id ∪ 배정 교재의 소유 반) 안에
// 있어야 한다. 이게 깨지면 그 학생은 매일 그 교재로 공부하면서도 그 교재의
// 입실시험에서만 존재하지 않는 사람이 된다(2026-08-11 실사고, 실제 8명).
// wordLibrary.getStudentEntranceClassIds가 계산하는 집합과 같은 규칙이다.
const scopeOf = new Map()
for (const s of students) scopeOf.set(s.id, new Set([s.class_id].filter(Boolean)))
for (const a of scaTb) {
  const set = scopeOf.get(a.student_id)
  if (!set) continue
  if (a.class_id) set.add(a.class_id)
  const owner = a.textbook_id ? tbOwner.get(a.textbook_id) : null
  if (owner) set.add(owner)
}
const orphanLearners = students.filter(s => {
  const owner = s.current_unit_id ? unitOwnerClass.get(s.current_unit_id) : null
  return owner && !scopeOf.get(s.id)?.has(owner)
})
check('학습 중인 유닛의 소유 반이 학생의 입실시험 조회 범위 안에 있음(누락 학생 0)',
  orphanLearners.length === 0,
  orphanLearners.slice(0, 10).map(s => `${s.name}(${s.id.slice(0, 8)})`).join(', '))

const axisSplitRows = scaTb.filter(a => { const o = a.textbook_id ? tbOwner.get(a.textbook_id) : null; return o && o !== a.class_id })
console.log(`  INFO  두 축(class_id vs textbook_id)이 갈라진 배정 행: ${axisSplitRows.length}건 — setPrimaryTextbook 설계상 정상, 위 불변식이 지켜지는 한 문제 없음`)

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  curriculum-integrity (${passed}개 단언, students ${students.length}/units ${units.length}/words ${words.length})`); process.exit(0) }
console.log(`  FAIL  curriculum-integrity — ${failed}건: ${failures.join(', ')}`)
process.exit(1)
