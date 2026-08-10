// class_textbooks(반 기본 교재) 연결 타당성 점검 — READ-ONLY 운영자 도구.
// 2026-08-11 신규. SELECT만 하며 어떤 쓰기도 하지 않는다.
//
// 왜 필요한가: class_textbooks는 "이 반 아이들이 기본적으로 쓰는 책"을 반
// 단위로 연결한 것이라, 시간이 지나면 실제와 어긋난 링크가 쌓인다(교재를
// 바꿨는데 옛 링크가 남거나, 미리 걸어두고 안 쓰거나). 이 링크는 학생
// 화면의 **교재 선택기 노출**을 결정하므로, 근거 없는 링크는 학생에게
// 필요 없는 교재를 계속 보여준다.
//
// 중요: 이 링크는 **입실시험 판정에는 쓰이지 않는다**(2026-08-11 확정 규칙,
// docs/CLASS_TEXTBOOK_MODEL.md). 따라서 여기 LIKELY_WRONG이 떠도 시험
// 노출에는 영향이 없다 — 교재 선택기만의 문제다.
//
// 분류:
//   KEEP                      자기 소유 교재이거나, 그 반 학생 중 실제로
//                             배정/학습 중인 사람이 있음
//   LIKELY_WRONG              그 반에 실제 학생이 있는데 그중 아무도 이
//                             교재를 배정받지도 학습하지도 않음
//   NEEDS_OWNER_CONFIRMATION  그 반에 실제 학생이 0명이라 판단 근거가 없음
//
// 이 스크립트는 아무것도 고치지 않는다. 정리 여부는 운영자가 판단한다.
// exit code는 항상 0 (정보 제공용 — verifyCurriculumText.mjs와 같은 계약).
//
// 실행: npm run verify:class-textbooks
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const BASE = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
if (!BASE || !KEY) { console.log('SKIP — .env에 VITE_SUPABASE_URL/ANON_KEY가 없습니다.'); process.exit(0) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const getAll = async (path) => {
  const out = []
  const sep = path.includes('?') ? '&' : '?'
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${BASE}/rest/v1/${path}${sep}limit=1000&offset=${offset}`, { headers: H })
    const page = await res.json()
    if (!Array.isArray(page)) return out
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}
const isArchivedOrFixture = (name) =>
  /_dup|_inactive/i.test(name || '') || /^(qa_|_qa_)/i.test(name || '')

const [classes, textbooks, units, students, sca, ct] = await Promise.all([
  getAll('classes?select=id,name,class_type'),
  getAll('textbooks?select=id,name,owner_class_id'),
  getAll('units?select=id,class_id'),
  getAll('students?select=id,name,class_id,current_unit_id'),
  getAll('student_class_assignments?select=student_id,class_id,textbook_id'),
  getAll('class_textbooks?select=class_id,textbook_id,enabled'),
])
if (ct.length === 0) { console.log('SKIP — class_textbooks 행이 없습니다(v3.1 미실행 또는 빈 상태).'); process.exit(0) }

const cn = new Map(classes.map((c) => [c.id, c.name]))
const tbNm = new Map(textbooks.map((t) => [t.id, t.name]))
const tbOwner = new Map(textbooks.map((t) => [t.id, t.owner_class_id]))
const unitOwner = new Map(units.map((u) => [u.id, u.class_id]))
const real = students.filter((s) => !isArchivedOrFixture(s.name))

// 학생이 이 교재를 "쓰고 있다"고 볼 근거: 개별 배정 또는 현재 학습 중
const assignedTo = (studentId, textbookId) => sca.some((r) =>
  r.student_id === studentId && (r.textbook_id === textbookId || (!r.textbook_id && r.class_id === tbOwner.get(textbookId))))
const studying = (student, textbookId) =>
  student.current_unit_id && unitOwner.get(student.current_unit_id) === tbOwner.get(textbookId)

const buckets = { KEEP: [], LIKELY_WRONG: [], NEEDS_OWNER_CONFIRMATION: [] }
for (const link of ct) {
  if (link.enabled === false) continue
  const clsName = cn.get(link.class_id) || `(없는 반 ${link.class_id})`
  if (/^QA_|^_QA/.test(clsName)) continue
  const tbName = tbNm.get(link.textbook_id) || `(없는 교재 ${link.textbook_id})`
  const members = real.filter((s) => s.class_id === link.class_id)
  const users = members.filter((s) => assignedTo(s.id, link.textbook_id) || studying(s, link.textbook_id))
  const isOwn = tbOwner.get(link.textbook_id) === link.class_id
  const row = { clsName, tbName, members: members.length, users }
  if (isOwn) buckets.KEEP.push({ ...row, why: '자기 소유 교재(구조상 필수)' })
  else if (members.length === 0) buckets.NEEDS_OWNER_CONFIRMATION.push({ ...row, why: '그 반에 실제 학생 0명 — 판단 근거 없음' })
  else if (users.length === 0) buckets.LIKELY_WRONG.push({ ...row, why: `소속 ${members.length}명 중 이 교재를 쓰는 학생 0명` })
  else buckets.KEEP.push({ ...row, why: `소속 ${members.length}명 중 ${users.length}명이 배정/학습 중` })
}

console.log('\n=== class_textbooks 연결 점검 (READ-ONLY) ===')
console.log(`총 ${ct.length}개 링크 · 실제 학생 ${real.length}명 기준\n`)
for (const [name, list] of Object.entries(buckets)) {
  console.log(`── ${name} — ${list.length}건`)
  for (const r of list) {
    console.log(`   [${r.clsName}] <- "${r.tbName}"`)
    console.log(`      ${r.why}${r.users.length ? ` (${r.users.slice(0, 8).map((s) => s.name).join(', ')}${r.users.length > 8 ? ' 외' : ''})` : ''}`)
  }
  console.log('')
}

// 링크를 지울 경우 접근을 잃는 학생 — 지우기 전에 반드시 확인해야 하는 것
const risky = []
for (const r of [...buckets.LIKELY_WRONG, ...buckets.NEEDS_OWNER_CONFIRMATION]) {
  const link = ct.find((x) => cn.get(x.class_id) === r.clsName && tbNm.get(x.textbook_id) === r.tbName)
  if (!link) continue
  const lost = real.filter((s) => s.class_id === link.class_id
    && studying(s, link.textbook_id) && !assignedTo(s.id, link.textbook_id))
  if (lost.length) risky.push(`[${r.clsName}] "${r.tbName}" -> ${lost.map((s) => s.name).join(', ')}`)
}
console.log('── 삭제 시 교재 접근을 잃는 학생(개별 배정으로 먼저 보존 필요)')
console.log(risky.length === 0
  ? '   없음 — 실제 학습 중인 학생은 전부 개별 배정도 함께 보유하고 있습니다.\n'
  : risky.map((x) => '   ⚠️ ' + x).join('\n') + '\n')

console.log('참고: 이 링크는 입실시험 판정에 쓰이지 않습니다(교재 선택기 노출만).')
console.log('     정리 여부는 운영자 판단이며, 이 스크립트는 아무것도 바꾸지 않습니다.')
process.exit(0)
