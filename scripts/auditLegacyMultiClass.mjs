// 읽기 전용 감사(2026-07-22) — "기존 학생 다중 교재 전환 불가" 버그 조사.
// anon key만 사용, 어떤 데이터도 변경하지 않는다.
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const BASE = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const get = async (path) => {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { headers: H })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.json()
}

// 1) 전체 학생: current_unit_id / unit_name / class_id 분포
const students = await get('students?select=id,name,class_id,current_unit_id,unit_name&order=created_at.asc')
const total = students.length
const nullUnitId = students.filter((s) => s.class_id && !s.current_unit_id)
console.log(`학생 총 ${total}명 / 반 배정 있음 ${students.filter((s) => s.class_id).length}명`)
console.log(`반은 있는데 current_unit_id가 NULL(레거시 unit_name 의존): ${nullUnitId.length}명`)

// 2) 배정 테이블 전체
const asg = await get('student_class_assignments?select=id,student_id,class_id,current_unit_id,is_primary')
const byStudent = new Map()
for (const a of asg) {
  if (!byStudent.has(a.student_id)) byStudent.set(a.student_id, [])
  byStudent.get(a.student_id).push(a)
}
console.log(`\n배정 행 총 ${asg.length}개 / 배정 보유 학생 ${byStudent.size}명`)
const multi = [...byStudent.entries()].filter(([, rows]) => rows.length >= 2)
console.log(`2개 이상 교재 배정 학생: ${multi.length}명`)

// 3) 다중 배정 학생 상세 — 문제 패턴 탐지
const sById = new Map(students.map((s) => [s.id, s]))
for (const [sid, rows] of multi) {
  const s = sById.get(sid)
  const primaries = rows.filter((r) => r.is_primary)
  const issues = []
  if (primaries.length === 0) issues.push('PRIMARY 없음')
  if (primaries.length > 1) issues.push('PRIMARY 중복')
  if (primaries.length === 1 && s && primaries[0].class_id !== s.class_id) issues.push(`primary.class(${primaries[0].class_id.slice(0, 8)}) != students.class_id(${s.class_id?.slice(0, 8)})`)
  if (s && !s.current_unit_id) issues.push('students.current_unit_id NULL(레거시)')
  for (const r of rows) if (!r.current_unit_id && !r.is_primary) issues.push(`secondary(${r.class_id.slice(0, 8)}) unit NULL`)
  console.log(`\n- ${s?.name ?? sid} (${sid.slice(0, 8)}…) 배정 ${rows.length}개 / students.class=${s?.class_id?.slice(0, 8)} unit_id=${s?.current_unit_id ? s.current_unit_id.slice(0, 8) : 'NULL'} unit_name="${s?.unit_name ?? ''}"`)
  for (const r of rows) console.log(`    ${r.is_primary ? '⭐primary' : ' secondary'} class=${r.class_id.slice(0, 8)} unit=${r.current_unit_id ? r.current_unit_id.slice(0, 8) : 'NULL'}`)
  if (issues.length) console.log(`    ⚠️  ${issues.join(' | ')}`)
}

// 4) 배정 행이 아예 없는 반 배정 학생(합성 폴백 의존) — 신규/레거시 갭
const noRows = students.filter((s) => s.class_id && !byStudent.has(s.id))
console.log(`\n반은 있는데 배정 행 0개(합성 폴백 의존): ${noRows.length}명`)
for (const s of noRows.slice(0, 10)) console.log(`  - ${s.name} (${s.id.slice(0, 8)}…)`)

// 5) unit_name과 current_unit_id 불일치(레거시 흔적) 표본
const units = await get('units?select=id,class_id,name')
const uById = new Map(units.map((u) => [u.id, u]))
let mismatch = 0
for (const s of students) {
  if (!s.current_unit_id) continue
  const u = uById.get(s.current_unit_id)
  if (u && s.unit_name && u.name !== s.unit_name) mismatch++
}
console.log(`\ncurrent_unit_id 유닛 이름 != unit_name 문자열(무해 — id 우선 해석): ${mismatch}명`)
