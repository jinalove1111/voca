// 읽기 전용(2026-07-22) — v3.0 수리 SQL 실행 전 영향 범위 실측.
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const H = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` }
const get = async (p) => (await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${p}`, { headers: H })).json()

const students = await get('students?select=id,name,class_id,current_unit_id,unit_name')
const units = await get('units?select=id,class_id,name')
const asg = await get('student_class_assignments?select=student_id,class_id,current_unit_id,is_primary')

const unitsByClass = new Map()
for (const u of units) {
  if (!unitsByClass.has(u.class_id)) unitsByClass.set(u.class_id, [])
  unitsByClass.get(u.class_id).push(u)
}
// 반 안 유닛 이름 중복(문 1의 결정성 확인)
let dupClasses = 0
for (const [cid, us] of unitsByClass) {
  const names = us.map((u) => u.name)
  if (new Set(names).size !== names.length) { dupClasses++; console.log(`  중복 유닛 이름 있는 반: ${cid.slice(0, 8)} (${names.filter((n, i) => names.indexOf(n) !== i).join(',')})`) }
}
console.log(`반 안 유닛 이름 중복 있는 반: ${dupClasses}개`)

const withClass = students.filter((s) => s.class_id)
const nullUnit = withClass.filter((s) => !s.current_unit_id)
const willFill = nullUnit.filter((s) => (unitsByClass.get(s.class_id) || []).some((u) => u.name === s.unit_name))
console.log(`\n[문 1] 반 있음+unit NULL: ${nullUnit.length}명 → 이름 매칭으로 채워질 학생: ${willFill.length}명 (매칭 실패 잔여 ${nullUnit.length - willFill.length}명 — NULL 유지, 클라이언트 폴백 계속)`)

const primByStudent = new Map()
for (const a of asg) if (a.is_primary) {
  if (!primByStudent.has(a.student_id)) primByStudent.set(a.student_id, [])
  primByStudent.get(a.student_id).push(a)
}
const sById = new Map(students.map((s) => [s.id, s]))
const ghosts = asg.filter((a) => a.is_primary && sById.get(a.student_id)?.class_id && a.class_id !== sById.get(a.student_id).class_id)
console.log(`[문 2] 삭제될 유령 primary 행: ${ghosts.length}개`)
for (const g of ghosts) console.log(`   - ${sById.get(g.student_id)?.name} (${g.student_id.slice(0, 8)}…)`)

const missingPrimary = withClass.filter((s) => !(primByStudent.get(s.id) || []).some((a) => a.class_id === s.class_id))
console.log(`[문 3] 현재 반 primary 행이 없어서 생성/승격될 학생: ${missingPrimary.length}명`)

const primNullUnit = asg.filter((a) => {
  const s = sById.get(a.student_id)
  return a.is_primary && !a.current_unit_id && s?.current_unit_id &&
    (unitsByClass.get(a.class_id) || []).some((u) => u.id === s.current_unit_id)
})
console.log(`[문 4] unit이 채워질 primary 행(현재 기준): ${primNullUnit.length}개 (문 1 실행 후엔 늘어남 — 문 1이 채운 값이 문 3 insert를 거쳐 반영)`)
console.log(`\n다중 primary 학생(이상 상태): ${[...primByStudent.values()].filter((v) => v.length > 1).length}명`)
