// 수정 검증 LIVE e2e(2026-07-22) — "기존 학생 다중 교재 전환 불가" 버그.
// 운영자 요구 테스트 a~g 전부 커버. reproLegacyMultiClass.mjs가 만든
// 데스싱크 픽스처(_QA_LegacyMultiClass_Repro_20260722)를 "실존 레거시
// 학생 모양 그대로" 이어받아 검증한다(신규 픽스처만으로 검증 금지 요구).
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/testLegacyMultiClassLive.mjs
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const BASE = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const restGet = async (path) => (await fetch(`${BASE}/rest/v1/${path}`, { headers: H })).json()

const lib = await import(pathToFileURL(process.env.WORDLIB_BUNDLE).href)
const {
  initWordLibrary, refreshStudents,
  getClassNames, getClassIdByName, getClassUnits,
  addStudent, getStudentClassId, getStudentUnitId,
  getStudentClassAssignments, assignTextbook, setAssignmentUnit, setPrimaryAssignment,
  setStudentClass, getStudentWords,
} = lib
await initWordLibrary()

// v3.1(2026-07-22) — 이 테스트의 시나리오(반=교재이던 시절의 유령 primary
// 행 수리)는 레거시 모드 전용이다. 교재 도메인 모델이 활성화되면
// (supabase_v3_1_textbooks.sql 실행 후) 반≠컨테이너가 정상이라 "유령"
// 개념 자체가 없다 — 교재 모드 검증은 testTextbookModelLive.mjs가 담당.
if (lib.isTextbookMode?.()) {
  console.log('SKIP — 교재 모드 활성(v3.1). 이 시나리오는 레거시 모드 전용 — testTextbookModelLive.mjs를 사용하세요.')
  process.exit(0)
}

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const wordIdSet = (words) => new Set(words.map((w) => w.dbId || w.id))
const disjoint = (a, b) => [...a].every((x) => !b.has(x))

const usable = getClassNames().filter((n) => getClassUnits(n).some((u) => (u.words || []).length > 0))
const [clsA, clsB] = usable
const idA = getClassIdByName(clsA), idB = getClassIdByName(clsB)
const unitA1 = getClassUnits(clsA).find((u) => (u.words || []).length > 0)
console.log(`반 A="${clsA}" / 반 B="${clsB}"`)

// ═══ b) 기존 레거시 학생(재현 픽스처 이어받기) — 수리 후 다중 반 사용 가능 ═══
console.log('\n── b) 레거시 데스싱크 학생 — 읽기 시점 자동 수리')
const legacyRows = await restGet(`students?name=eq._QA_LegacyMultiClass_Repro_20260722&select=id,class_id,current_unit_id,unit_name`)
if (!legacyRows.length) throw new Error('재현 픽스처 학생이 없음 — 먼저 reproLegacyMultiClass.mjs 실행')
const L = legacyRows[0].id
// 재실행 가능하도록 픽스처를 항상 "레거시 데스싱크" 상태로 리셋(QA 픽스처
// 전용 — 실제 학생 계정은 절대 이렇게 다루지 않는다): 배정 행을 전부
// 지우고 v2_9 백필 산출물 모양(A primary, unit NULL)만 남긴 뒤, 구 반 배정
// 데스싱크(students.class_id=B, current_unit_id NULL)를 재현한다.
const restWrite = async (method, path, body) => {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { method, headers: { ...H, Prefer: 'return=minimal' }, body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`)
}
await restWrite('DELETE', `student_class_assignments?student_id=eq.${L}`)
await restWrite('POST', `student_class_assignments`, { student_id: L, class_id: idA, current_unit_id: null, is_primary: true })
await restWrite('PATCH', `students?id=eq.${L}`, { class_id: idB, current_unit_id: null, unit_name: unitA1.name })
await refreshStudents()
const beforeStudent = (await restGet(`students?id=eq.${L}&select=id,class_id,current_unit_id,unit_name`))[0]

const list1 = await getStudentClassAssignments(L) // 불일치 감지 → fire-and-forget 수리 발동
await sleep(1500) // 수리 쓰기 완료 대기
const rowsAfterHeal = await restGet(`student_class_assignments?student_id=eq.${L}&select=class_id,is_primary,current_unit_id`)
check('수리: 유령 A primary 행이 제거됨', !rowsAfterHeal.some((r) => r.class_id === idA))
check('수리: 현재 반 B 행이 primary로 생성됨', rowsAfterHeal.some((r) => r.class_id === idB && r.is_primary))

// 핵심 차단 해제 — 원래 반 A를 두 번째 교재로 추가(수정 전엔 조용히 no-op이던 것)
await assignTextbook(L, idA)
await setAssignmentUnit(L, idA, unitA1.id)
const list2 = await getStudentClassAssignments(L)
check('핵심: 원래 반 A가 이제 배정 목록에 나타남(전환 가능)', list2.some((a) => a.classId === idA && !a.isPrimary))
check('배정 2개(다중 반 소속) 확인', list2.length === 2)

// ═══ c) A→B→A 전환(레거시 학생) + d) 반별 유닛 분리 ═══
console.log('\n── c/d) 전환 왕복 + 반별 유닛 분리')
await setPrimaryAssignment(L, idA)
check('B→A 전환: students.class_id가 A', getStudentClassId(L) === idA)
const unitInA = getStudentUnitId(L)
check('A의 유닛이 구체적 id로 확정(레거시 NULL 아님)', unitInA === unitA1.id, { unitInA })
const wordsInA = getStudentWords(L)
check('A 전환 후 A 단어가 실제로 로드됨', wordsInA.length > 0)

await setPrimaryAssignment(L, idB)
check('A→B 전환: students.class_id가 B', getStudentClassId(L) === idB)
const unitInB = getStudentUnitId(L)
check('B의 유닛은 B 소속(A 유닛과 다름 — 유닛 분리)', unitInB != null && unitInB !== unitA1.id, { unitInB })
const wordsInB = getStudentWords(L)
check('B 전환 후 B 단어가 실제로 로드됨', wordsInB.length > 0)
check('A/B 단어 집합이 서로소(교재 콘텐츠 분리)', disjoint(wordIdSet(wordsInA), wordIdSet(wordsInB)))

await setPrimaryAssignment(L, idA)
check('B→A 재전환: A 유닛이 정확히 복원됨(진도 보존)', getStudentUnitId(L) === unitA1.id)

// ═══ f) 로그아웃/로그인 영속(캐시 전부 새로 로드) ═══
console.log('\n── f) 재로그인 영속성(라이브러리 재초기화)')
await refreshStudents()
const list3 = await getStudentClassAssignments(L)
check('재조회 후에도 배정 2개 유지', list3.length === 2)
check('재조회 후 primary=A 유지', list3.find((a) => a.isPrimary)?.classId === idA)

// ═══ g) 무손실 — 학생 계정/이름/기타 필드 보존 ═══
console.log('\n── g) 무손실 검증')
const afterStudent = (await restGet(`students?id=eq.${L}&select=id,name,class_id,current_unit_id,unit_name,created_at`))[0]
check('학생 계정 그대로(삭제/재생성 없음)', afterStudent.id === L && afterStudent.name === '_QA_LegacyMultiClass_Repro_20260722')
check('unit_name 문자열 보존(레거시 하위호환 필드 무변경)', afterStudent.unit_name === beforeStudent.unit_name)
const progressRows = await restGet(`student_progress?student_id=eq.${L}&select=student_id`)
check('student_progress 행 훼손 없음(생성 안 했으므로 0개 그대로)', progressRows.length === 0)

// ═══ a) 신규 학생 다중 반(기존 경로 회귀 확인) ═══
console.log('\n── a) 신규 학생 다중 반 — 기존 정상 경로 회귀 없음')
const NEW_NAME = `_QA_LegacyFix_NewStudent_20260722`
const existing = await restGet(`students?name=eq.${NEW_NAME}&select=id`)
const N = existing.length ? existing[0].id : await addStudent(NEW_NAME, clsA, unitA1.name)
await assignTextbook(N, idB)
const nList = await getStudentClassAssignments(N)
check('신규 학생: 배정 2개', nList.length === 2)
await setPrimaryAssignment(N, idB)
check('신규 학생: A→B 전환 정상', getStudentClassId(N) === idB)
await setPrimaryAssignment(N, idA)
check('신규 학생: B→A 복귀 정상', getStudentClassId(N) === idA)

// ═══ 반 배정(setStudentClass) 신규 경로 — assignment 유지보수 확인 ═══
console.log('\n── 반 배정 흐름이 이제 assignment를 유지보수하는지')
await setStudentClass(N, clsB)
await sleep(500)
const nRows = await restGet(`student_class_assignments?student_id=eq.${N}&select=class_id,is_primary`)
check('반 배정 후: 새 반 B가 primary', nRows.some((r) => r.class_id === idB && r.is_primary))
check('반 배정 후: 이전 primary(A) 유령 행 없음', !nRows.some((r) => r.class_id === idA && r.is_primary))
await assignTextbook(N, idA) // 유령이 없으니 이제 정상 추가돼야 함
const nList2 = await getStudentClassAssignments(N)
check('반 배정 후 원래 반 재추가가 즉시 성공(23505 차단 해소)', nList2.some((a) => a.classId === idA))

console.log(`\n=== ${failures === 0 ? '전부 PASS' : `FAIL ${failures}건`} ===`)
console.log('QA 픽스처 2명은 운영자 검토용으로 남김(관례): _QA_LegacyMultiClass_Repro_20260722, _QA_LegacyFix_NewStudent_20260722')
process.exit(failures === 0 ? 0 : 1)
