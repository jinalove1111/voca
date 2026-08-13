// 입실시험 수업 전 10초 진단 — 100% READ-ONLY(SELECT만, 쓰기 0건).
//
// 사용법:
//   npm run verify:entrance-live              — 오늘 전체 현황
//   npm run verify:entrance-live -- 권교빈     — 특정 학생의 시험 선택 추적
//   node scripts/entranceLiveDiagnostic.mjs Song
//
// 출력: ACTIVE TESTS / ELIGIBLE STUDENTS / MISSING / DUPLICATE TESTS /
//       WORD COUNT / SUBMISSION COUNT / TEST ACCOUNTS / WARNINGS
// 학생 이름을 주면: class / textbook / unit / eligible tests / selected
// test / selection reason 까지.
//
// 규칙: .env 없으면 정직한 SKIP(exit 0) — auditCurriculumIntegrity와 동일 관례.
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue
  for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}
const BASE = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!BASE || !KEY) { console.log('SKIP — VITE_SUPABASE_URL/ANON_KEY 없음(.env). 라이브 진단 전용.'); process.exit(0) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function all(pathq) {
  let out = [], from = 0
  for (;;) {
    const res = await fetch(`${BASE}/rest/v1/${pathq}`, { headers: { ...H, Range: `${from}-${from + 999}` } })
    if (!res.ok) throw new Error(`${pathq} -> ${res.status}`)
    const rows = await res.json()
    out = out.concat(rows)
    if (rows.length < 1000) break
    from += 1000
  }
  return out
}

// 판정 규칙은 앱과 동일한 모듈을 그대로 import(중복 구현 금지)
const sel = await import(pathToFileURL(path.resolve('src/utils/entranceTestSelection.js')).href)
const elig = await import(pathToFileURL(path.resolve('src/utils/entranceEligibility.js')).href)
const acct = await import(pathToFileURL(path.resolve('src/utils/accountStatus.js')).href)

// 앱(localIsoDateStr)과 동일한 **로컬(KST) 날짜** — toISOString()은 UTC라
// KST 00:00~08:59 사이에 전날 시험을 조회하는 오차가 있었다(2026-08-14 수정).
const _n = new Date()
const today = `${_n.getFullYear()}-${String(_n.getMonth() + 1).padStart(2, '0')}-${String(_n.getDate()).padStart(2, '0')}`
const targetName = (process.argv[2] || '').trim()

const [students, classes, textbooks, units, words, sca, classTb, tests] = await Promise.all([
  all('students?select=id,name,class_id,current_unit_id'),
  all('classes?select=id,name,class_type'),
  all('textbooks?select=id,name,owner_class_id'),
  all('units?select=id,class_id,name'),
  all('words?select=id,unit_id,word'),
  all('student_class_assignments?select=student_id,class_id,textbook_id,current_unit_id,is_primary'),
  all('class_textbooks?select=class_id,textbook_id'),
  all(`entrance_tests?select=id,class_id,date,status,question_count,words,created_at&date=eq.${today}&order=created_at`),
])
const clsById = new Map(classes.map((c) => [c.id, c]))
const tbById = new Map(textbooks.map((t) => [t.id, t]))
const tbByOwner = new Map(textbooks.filter((t) => t.owner_class_id).map((t) => [t.owner_class_id, t]))
const unitById = new Map(units.map((u) => [u.id, u]))
const wordsByUnit = new Map()
for (const w of words) {
  if (!wordsByUnit.has(w.unit_id)) wordsByUnit.set(w.unit_id, [])
  wordsByUnit.get(w.unit_id).push(w)
}
const scaByStudent = new Map()
for (const r of sca) {
  if (!scaByStudent.has(r.student_id)) scaByStudent.set(r.student_id, [])
  scaByStudent.get(r.student_id).push(r)
}
const norm = (s) => String(s || '').trim().toLowerCase()

// 시험 유닛 역추적(앱의 inferUnitIdFromTestWords와 같은 규칙 — 전부 포함
// 유닛이 정확히 1개일 때만 확정)
function inferUnit(test) {
  const wanted = new Set((test.words || []).map((w) => norm(w.word)).filter(Boolean))
  if (wanted.size === 0) return null
  const candidates = units.filter((u) => u.class_id === test.class_id).filter((u) => {
    const have = new Set((wordsByUnit.get(u.id) || []).map((w) => norm(w.word)))
    for (const w of wanted) if (!have.has(w)) return false
    return true
  })
  return candidates.length === 1 ? candidates[0] : null
}

function studentContext(s) {
  const rows = scaByStudent.get(s.id) || []
  const primary = rows.find((r) => r.is_primary)
  const currentTb = primary?.textbook_id ? tbById.get(primary.textbook_id) : (primary?.class_id ? tbByOwner.get(primary.class_id) : null)
  const currentUnitId = primary?.current_unit_id || s.current_unit_id || null
  const assigned = []
  for (const r of rows) {
    const id = r.textbook_id || tbByOwner.get(r.class_id)?.id || null
    if (id && !assigned.includes(id)) assigned.push(id)
  }
  const classDefaults = classTb.filter((r) => r.class_id === s.class_id).map((r) => r.textbook_id)
  return {
    currentTextbookId: currentTb?.id || null,
    currentUnitId,
    assignedTextbookIds: assigned,
    classDefaultTextbookIds: classDefaults,
    resolveTestTextbookId: (t) => tbByOwner.get(t.classId)?.id || null,
    resolveTestUnitId: (t) => inferUnit({ class_id: t.classId, words: t.words })?.id || null,
  }
}

function studentScope(s) {
  return elig.entranceScopeClassIds({
    primaryClassId: s.class_id,
    assignments: (scaByStudent.get(s.id) || []).map((r) => ({ classId: r.class_id, textbookId: r.textbook_id })),
    resolveTextbookOwnerClassId: (tbId) => tbById.get(tbId)?.owner_class_id || null,
  })
}

const appTests = tests.map((t) => ({
  id: t.id, classId: t.class_id, status: t.status, createdAt: t.created_at,
  questionCount: t.question_count, timeLimitSeconds: 0, words: t.words || [],
}))
const realStudents = students.filter((s) => !elig.isArchivedOrFixtureStudentName(s.name) && !acct.isTestAccountStudent(s))
const testAccounts = students.filter((s) => acct.isTestAccountStudent(s))

const line = (t) => console.log(`\n===== ${t} =====`)

// ── 특정 학생 추적 모드 ───────────────────────────────────────────────
if (targetName) {
  const hits = students.filter((s) => norm(s.name) === norm(targetName))
  if (hits.length === 0) {
    console.log(`"${targetName}" 이름의 학생 없음. 부분 일치 후보:`)
    for (const s of students.filter((x) => norm(x.name).includes(norm(targetName))).slice(0, 8)) {
      console.log(`  - ${s.name} (${s.id})`)
    }
    process.exit(0)
  }
  for (const s of hits) {
    line(`STUDENT ${s.name}`)
    console.log(`  id: ${s.id}`)
    console.log(`  archived/fixture: ${elig.isArchivedOrFixtureStudentName(s.name)}  test-account: ${acct.isTestAccountStudent(s)}`)
    console.log(`  class: ${clsById.get(s.class_id)?.name || s.class_id || '(없음)'}`)
    const ctx = studentContext(s)
    console.log(`  current textbook: ${tbById.get(ctx.currentTextbookId)?.name || '(해석 불가)'}`)
    const cu = unitById.get(ctx.currentUnitId)
    console.log(`  current unit: ${cu ? `"${cu.name}" @ ${clsById.get(cu.class_id)?.name}` : '(없음/NULL)'}`)
    console.log(`  assigned textbooks: ${ctx.assignedTextbookIds.map((i) => tbById.get(i)?.name).join(', ') || '(없음)'}`)
    console.log(`  class default textbooks: ${ctx.classDefaultTextbookIds.map((i) => tbById.get(i)?.name).join(', ') || '(없음)'}`)
    const scope = studentScope(s)
    console.log(`  eligible scope: ${scope.map((i) => clsById.get(i)?.name || i).join(' | ')}`)
    const mine = appTests.filter((t) => scope.includes(t.classId))
    console.log(`  eligible tests today: ${mine.length}건`)
    const results = await all(`entrance_test_results?select=test_id&student_id=eq.${s.id}`)
    const taken = results.map((r) => r.test_id)
    const r = sel.selectEntranceTest({ tests: mine, takenTestIds: taken, context: ctx })
    for (const p of r.pending) {
      const u = inferUnit({ class_id: p.test.classId, words: p.test.words })
      console.log(`    [${p.tier}순위:${sel.TIER_LABEL[p.tier]}] ${clsById.get(p.test.classId)?.name} unit=${u?.name || '?'} words=${p.test.words.length} ${p.test.id.slice(0, 8)}`)
    }
    console.log(`  selected test: ${r.chosen ? `${clsById.get(r.chosen.classId)?.name} (${r.chosen.id.slice(0, 8)})` : r.needsChoice ? '>> 선택 UI 노출(동률)' : '(응시할 시험 없음)'}`)
    console.log(`  selection reason: ${r.topTier ? sel.TIER_LABEL[r.topTier] : '-'}${r.needsChoice ? ' — 동일 순위 복수' : ''}`)
    console.log(`  submitted today: ${taken.filter((id) => mine.some((t) => t.id === id)).length}건`)
  }
  process.exit(0)
}

// ── 전체 현황 모드 ────────────────────────────────────────────────────
line(`ACTIVE TESTS (${today})`)
const active = appTests.filter((t) => t.status === 'active')
if (active.length === 0) console.log('  (오늘 active 시험 없음)')
const resultRows = active.length > 0
  ? await all(`entrance_test_results?select=test_id,student_id&test_id=in.(${appTests.map((t) => t.id).join(',')})`)
  : []
for (const t of active) {
  const u = inferUnit({ class_id: t.classId, words: t.words })
  const subs = resultRows.filter((r) => r.test_id === t.id)
  console.log(`  ${clsById.get(t.classId)?.name}  unit=${u?.name || '?(역추적 불가)'}  words=${t.words.length}  submissions=${subs.length}  created=${t.createdAt.slice(11, 19)}`)
}

line('ELIGIBLE STUDENTS (active 시험별)')
for (const t of active) {
  const eligible = realStudents.filter((s) => studentScope(s).includes(t.classId))
  const submitted = new Set(resultRows.filter((r) => r.test_id === t.id).map((r) => r.student_id))
  const missing = eligible.filter((s) => !submitted.has(s.id))
  console.log(`  ${clsById.get(t.classId)?.name}: 대상 ${eligible.length}명 / 제출 ${[...submitted].filter((id) => eligible.some((s) => s.id === id)).length}명`)
  if (missing.length > 0 && missing.length <= 20) console.log(`    MISSING: ${missing.map((s) => s.name).join(', ')}`)
}

line('DUPLICATE TESTS (같은 반 오늘 2건 이상)')
const byClass = new Map()
for (const t of appTests) byClass.set(t.classId, (byClass.get(t.classId) || 0) + 1)
const dups = [...byClass.entries()].filter(([, n]) => n > 1)
if (dups.length === 0) console.log('  (없음)')
for (const [cid, n] of dups) console.log(`  ${clsById.get(cid)?.name}: ${n}건 (active ${appTests.filter((t) => t.classId === cid && t.status === 'active').length}건)`)

line('WORD COUNT (active 시험 출제 풀 vs 유닛 실제 단어 수)')
for (const t of active) {
  const u = inferUnit({ class_id: t.classId, words: t.words })
  const unitCount = u ? (wordsByUnit.get(u.id) || []).length : null
  const flag = u && t.words.length < unitCount ? '  << 유닛보다 적음(생성 시점 절단이면 새 시험으로 교체 권장)' : ''
  console.log(`  ${clsById.get(t.classId)?.name}: pool=${t.words.length}${u ? ` / unit "${u.name}"=${unitCount}` : ' / unit 역추적 불가'}${flag}`)
}

line('TEST ACCOUNTS')
console.log(`  ${testAccounts.map((s) => s.name).join(', ') || '(없음)'} — 집계 제외, 응시는 가능`)

line('WARNINGS')
const warnings = []
const staleActive = await all(`entrance_tests?select=id,class_id,date&status=eq.active&date=lt.${today}`)
if (staleActive.length > 0) warnings.push(`과거 날짜인데 active인 시험 ${staleActive.length}건(기능 영향 없음 — date 필터 — 정리 대상)`)
for (const t of active) {
  if (!inferUnit({ class_id: t.classId, words: t.words })) warnings.push(`${clsById.get(t.classId)?.name} 시험의 유닛 역추적 불가(단어가 특정 유닛과 1:1 매칭 안 됨)`)
}
const multiActive = realStudents.map((s) => ({ s, n: active.filter((t) => studentScope(s).includes(t.classId)).length })).filter((x) => x.n > 1)
if (multiActive.length > 0) warnings.push(`active 시험 2개 이상에 걸린 학생 ${multiActive.length}명(${multiActive.slice(0, 5).map((x) => x.s.name).join(', ')}${multiActive.length > 5 ? '…' : ''}) — 우선순위/선택 UI로 처리됨`)
if (warnings.length === 0) console.log('  (없음)')
for (const w of warnings) console.log(`  ! ${w}`)

console.log(`\n※ READ-ONLY 진단 — 쓰기 0건. 특정 학생 추적: npm run verify:entrance-live -- <이름>`)
