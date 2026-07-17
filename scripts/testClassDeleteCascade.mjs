// Phase 2 DB 무결성 감사(2026-07-18) — "반 삭제" 시 students/student_progress에
// 어떤 cascade가 실제로 일어나는지 라이브에서 1회성으로 실측한다. students/
// units/words/classes의 원본 CREATE TABLE이 저장소의 어떤 supabase_*.sql
// 파일에도 없어(초기에 대시보드에서 직접 만들어짐 — Phase 2 발견 사항) FK의
// ON DELETE 동작을 코드로 확인할 수 없다. AdminScreen.jsx의 deleteClass()는
// classes 행만 지우고(raw delete, 학생 존재 여부 확인 없음), 반 삭제 확인
// 다이얼로그는 "단어/Unit/학습기록이 함께 삭제됩니다"라고만 경고할 뿐 학생
// 계정 자체의 운명은 언급하지 않는다 — 실제로 CASCADE(학생 행까지 삭제 →
// student_progress도 FK cascade로 연쇄 삭제 → 그 반 전원의 진행도 영구 유실)
// 인지 SET NULL(학생은 살아남고 class_id만 비워짐, AdminScreen 로스터의
// "⚠️ 반 미배정" 그룹이 정확히 이 상태를 위해 만들어져 있음)인지 확인 없이는
// "반 삭제"가 관리자에게 얼마나 위험한 작업인지 알 수 없다.
//
// QA_ 접두 데이터만 생성/삭제(프로덕션 데이터 불변). anon key만 사용(로컬
// service role key 없음 — 클라이언트 앱과 동일한 권한으로 실측하는 게 오히려
// 더 정확함, deleteClass()도 anon key로 실행되므로).
//
// 실행: node scripts/testClassDeleteCascade.mjs
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const BASE = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function post(table, body, prefer = 'return=representation') {
  const r = await fetch(`${BASE}/rest/v1/${table}`, { method: 'POST', headers: { ...H, Prefer: prefer }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`POST ${table} 실패: ${r.status} ${(await r.text()).slice(0, 300)}`)
  if (prefer === 'return=minimal') return null // 204 No Content — 본문 없음
  return r.json()
}
async function get(table, query) {
  const r = await fetch(`${BASE}/rest/v1/${table}?${query}`, { headers: H })
  if (!r.ok) throw new Error(`GET ${table} 실패: ${r.status} ${(await r.text()).slice(0, 300)}`)
  return r.json()
}
async function del(table, query) {
  const r = await fetch(`${BASE}/rest/v1/${table}?${query}`, { method: 'DELETE', headers: H })
  return r.ok
}

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('=== 반 삭제 cascade 실측 (QA_ 데이터만 사용) ===\n')

const stamp = Date.now()
const className = `QA_DeleteCascadeTest_${stamp}`
let cls, student

try {
  ;[cls] = await post('classes', { name: className })
  console.log(`반 생성: ${cls.id}`)

  // Prefer: return=representation은 삽입된 행 전 컬럼(select *)을 돌려주는데,
  // v1.9가 anon의 pin_hash 등 4컬럼 SELECT를 회수해서 와일드카드 select 자체가
  // 42501로 통째 실패한다(클라이언트 코드 addStudent()가 항상 `RETURNING id`처럼
  // 명시 컬럼만 쓰는 이유와 정확히 같음) — return=minimal로 넣고 명시 컬럼으로
  // 다시 조회.
  const studentName = `QA_DC_Student_${stamp}`
  await post('students', { name: studentName, class_id: cls.id }, 'return=minimal')
  ;[student] = await get('students', `name=eq.${encodeURIComponent(studentName)}&select=id,name,class_id`)
  console.log(`학생 생성: ${student.id} (class_id=${student.class_id})`)

  await post('student_progress', {
    student_id: student.id, total_stars: 42, cleared_count: 3, streak: 2, stickers_count: 1,
    progress_data: { studentId: student.id, totalStars: 42, note: 'QA_DeleteCascadeTest' },
  }, 'return=minimal')
  const beforeProgress = await get('student_progress', `student_id=eq.${student.id}&select=student_id,total_stars`)
  check('삭제 전: student_progress 행 존재(별 42)', beforeProgress.length === 1 && beforeProgress[0].total_stars === 42)

  console.log(`\n반 삭제 실행 (deleteClass()와 동일한 raw DELETE)...`)
  const delOk = await del('classes', `id=eq.${cls.id}`)
  check('반 DELETE 요청 자체는 성공(200)', delOk)

  const afterStudent = await get('students', `id=eq.${student.id}&select=id,name,class_id`)
  const afterProgress = await get('student_progress', `student_id=eq.${student.id}&select=student_id,total_stars`)

  if (afterStudent.length === 0) {
    console.log('\n  [실측 결과] students 행이 반과 함께 CASCADE 삭제됨')
    check('[위험 확인] 학생 행 자체가 사라짐 — 반 삭제가 그 반 전원의 계정+진행도를 통째로 파괴한다', true)
    check('[위험 확인] student_progress도 연쇄 삭제됨(학생 FK cascade)', afterProgress.length === 0)
  } else {
    console.log('\n  [실측 결과] students 행은 생존 — SET NULL(또는 무관계) 동작')
    check('학생 행 생존', afterStudent.length === 1)
    check('class_id가 null로 정리됨(SET NULL) — AdminScreen "⚠️ 반 미배정" 그룹이 정확히 이 상태를 잡아냄', afterStudent[0].class_id === null)
    check('student_progress(진행도 42)는 학생이 살아있으므로 그대로 보존', afterProgress.length === 1 && afterProgress[0].total_stars === 42)
  }
} finally {
  console.log('\n정리 중...')
  if (student) { await del('students', `id=eq.${student.id}`); await del('student_progress', `student_id=eq.${student.id}`) }
  if (cls) await del('classes', `id=eq.${cls.id}`)
  console.log('정리 완료')
}

console.log(failures === 0 ? '\n검증 완료 (모든 체크 통과 — 위험 시나리오였다면 위 로그의 [위험 확인] 항목을 반드시 handoff에 반영)' : `\n${failures}개 체크 실패`)
process.exit(failures > 0 ? 1 : 0)
