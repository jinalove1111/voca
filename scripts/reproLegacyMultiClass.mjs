// 재현 스크립트(2026-07-22, 규칙 15 — 수정 전 코드로 버그를 먼저 FAIL로
// 확인) — "기존 학생 다중 교재 전환 불가".
//
// 시나리오(실제 프로덕션에서 벌어진 일 재구성):
//   1. 레거시 학생(반 A, current_unit_id NULL, unit_name 문자열 의존)이
//      v2_9 백필로 A primary 배정 행을 받음(행의 unit도 NULL).
//   2. 교사가 구 "반 배정" 흐름(setStudentClass — assignment 미유지)으로
//      학생을 반 B로 이동 → students.class_id=B, 배정 행은 여전히 A.
//   3. 교사가 "원래 반 A를 두 번째 교재로" 추가 시도(assignTextbook)
//      → unique(student_id,class_id)가 유령 A행과 충돌 → 조용히 no-op
//      → A가 배정 목록에 안 나타남 → 학생은 A 단어를 영영 못 봄.
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/reproLegacyMultiClass.mjs
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const BASE = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
const rest = async (method, path, body) => {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`)
}

const lib = await import(pathToFileURL(process.env.WORDLIB_BUNDLE).href)
const { initWordLibrary, getClassNames, getClassIdByName, getClassUnits, addStudent, getStudentClassAssignments, assignTextbook } = lib
await initWordLibrary()

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

// 단어가 있는 유닛을 가진 반 2개 고르기(기존 라이브 테스트와 동일 방식)
const usable = getClassNames().filter((n) => getClassUnits(n).some((u) => (u.words || []).length > 0))
if (usable.length < 2) throw new Error('단어 있는 반이 2개 미만 — 재현 불가')
const [clsA, clsB] = usable
const idA = getClassIdByName(clsA), idB = getClassIdByName(clsB)
const unitA = getClassUnits(clsA).find((u) => (u.words || []).length > 0)
console.log(`반 A="${clsA}"(${idA.slice(0, 8)}) / 반 B="${clsB}"(${idB.slice(0, 8)})`)

// 1) 픽스처 생성 → 레거시 모양으로 성형(current_unit_id NULL + unit_name 문자열,
//    배정 행 unit도 NULL — v2_9 백필 산출물과 동일 모양)
const NAME = `_QA_LegacyMultiClass_Repro_20260722`
const sid = await addStudent(NAME, clsA, unitA.name)
console.log(`픽스처 학생: ${NAME} (${sid})`)
await rest('PATCH', `students?id=eq.${sid}`, { current_unit_id: null, unit_name: unitA.name })
await rest('PATCH', `student_class_assignments?student_id=eq.${sid}`, { current_unit_id: null })

// 2) 구 "반 배정" 데스싱크 재현 — students.class_id만 B로(배정 행은 A 그대로)
await rest('PATCH', `students?id=eq.${sid}`, { class_id: idB })
await lib.refreshStudents()

// 3) 현재 코드의 실제 동작 관찰
const before = await getStudentClassAssignments(sid)
console.log('\n배정 목록(마스킹 후):', before.map((a) => `${a.classId.slice(0, 8)}${a.isPrimary ? '⭐' : ''}`).join(', '))
check('버그 증상 1 — 목록이 1개뿐(원래 반 A가 사라짐)', before.length === 1)
check('버그 증상 2 — 그 1개가 B로 마스킹됨(DB 행은 여전히 A)', before[0]?.classId === idB)

// DB 행 실제 확인
const rowsRaw = await (await fetch(`${BASE}/rest/v1/student_class_assignments?student_id=eq.${sid}&select=class_id,is_primary`, { headers: H })).json()
check('버그 증상 3 — DB의 primary 행은 아직 A(유령 행)', rowsRaw.some((r) => r.class_id === idA && r.is_primary))

// 4) 핵심 차단 — 교사가 A를 두 번째 교재로 추가 시도
await assignTextbook(sid, idA) // 23505 → 조용히 no-op (현재 코드)
const after = await getStudentClassAssignments(sid)
console.log('assignTextbook(A) 후 목록:', after.map((a) => `${a.classId.slice(0, 8)}${a.isPrimary ? '⭐' : ''}`).join(', '))
check('버그 증상 4(핵심) — A 추가가 조용히 무시되어 여전히 A로 전환 불가', !after.some((a) => a.classId === idA && !a.isPrimary))

console.log(failures === 0 ? '\n=== 버그 4개 증상 전부 재현됨(수정 전 코드 FAIL 확인 완료) ===' : `\n=== 재현 불일치 ${failures}건 — 가설 재검토 필요 ===`)
console.log(`(픽스처 학생 ${NAME}은 수정 검증 테스트가 이어서 사용)`)
