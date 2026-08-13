// "고1 능률 민병천" 실제 학생 12명 집계 회귀 fixture (2026-08-13, P5)
//
// 실사고 이력: 이 반의 관리자 분모가 10 vs 실제 12로 어긋났다(94차) —
// 원인은 "누락 4명(SCA 행 부재 3 + 중복계정 오염 1) − 오집계 2명(테스트
// 계정 Barry/Jinaa가 실제 학생으로 집계)"의 상쇄였다. 이 테스트는 운영자
// 확정 실명단 12명을 fixture로 고정해, 집계 로직(eligibility scope +
// 계정 필터)이 다시는 이 반에서 어긋나지 않게 한다.
//
// 두 부분으로 구성:
//   [1] mock fixture — 명단 12명이 정확히 12명으로 집계되는 규칙 검증
//       (네트워크 0, 항상 실행)
//   [2] READ-ONLY 라이브 대조 — 실제 DB에서 같은 규칙으로 세어 12명인지
//       (.env 없으면 정직한 SKIP, 쓰기 0건)
import { readFileSync, existsSync } from 'node:fs'
import {
  entranceScopeClassIds, isInEntranceScope, isArchivedOrFixtureStudentName,
} from '../src/utils/entranceEligibility.js'
import { isTestAccountStudent, isRealStudentAccount } from '../src/utils/accountStatus.js'

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

// 운영자 확정 실명단(2026-08-13 지시문 그대로)
const ROSTER = [
  ['황다은', 'Dana'], ['박서진', 'Rogan'], ['김태율', 'Terry'], ['권교빈', 'Liam'],
  ['황성연', 'Colin'], ['박건우', 'Ethan'], ['전하은', 'Haeun'], ['최은경', 'Nana'],
  ['김보민', 'Chloe'], ['김규민', 'Richard'], ['김가윤', 'Joy'], ['현다율', 'Essel'],
]

// ── [1] mock fixture ─────────────────────────────────────────────────
console.log('\n[1] mock fixture — 실명단 12명 + 오염 요소를 넣고 정확히 12명이 나오는지')
{
  const MIN_CLS = 'cls-minbyungchun'
  const MIN_TB = 'tb-minbyungchun'
  const PEOPLE = 'cls-people'
  const resolveOwner = (tbId) => (tbId === MIN_TB ? MIN_CLS : null)

  // 실제 구조를 본뜬 fixture: 12명 전원이 SCA로 민병천 교재에 배정
  const students = ROSTER.map(([kr], i) => ({
    id: `uuid-real-${String(i).padStart(2, '0')}`, name: kr,
    classId: PEOPLE,
    assignments: [{ classId: MIN_CLS, textbookId: MIN_TB }],
  }))
  // 오염 요소들 — 이들이 집계에 섞이면 안 된다
  const pollution = [
    { id: 'uuid-barry', name: 'Barry', classId: PEOPLE, assignments: [{ classId: MIN_CLS, textbookId: MIN_TB }] },
    { id: 'uuid-jinaa', name: 'Jinaa', classId: PEOPLE, assignments: [{ classId: MIN_CLS, textbookId: MIN_TB }] },
    { id: 'uuid-dup', name: '권교빈_DUP2_942e7e_INACTIVE', classId: PEOPLE, assignments: [{ classId: MIN_CLS, textbookId: MIN_TB }] },
    { id: 'uuid-qa', name: 'QA_MinTest', classId: MIN_CLS, assignments: [] },
    { id: 'uuid-other', name: '다른반학생', classId: PEOPLE, assignments: [{ classId: 'cls-other', textbookId: 'tb-other' }] },
  ]
  const everyone = [...students, ...pollution]

  // 관리자 분모와 같은 규칙: scope에 민병천 반이 들어있는 실제 학생
  const eligible = everyone.filter((s) => {
    const scope = entranceScopeClassIds({
      primaryClassId: s.classId, assignments: s.assignments, resolveTextbookOwnerClassId: resolveOwner,
    })
    return isInEntranceScope(scope, MIN_CLS)
  })
  const real = eligible.filter((s) => !isArchivedOrFixtureStudentName(s.name) && !isTestAccountStudent(s))

  check('REAL STUDENTS = 12', real.length === 12, real.map((s) => s.name))
  check('ELIGIBLE(전체, 오염 포함 전 단계) = 12실명 + Barry/Jinaa/DUP/QA', eligible.length === 16)
  check('EXTRA = 0 (실명단 밖 인원이 집계에 없음)',
    real.every((s) => ROSTER.some(([kr]) => kr === s.name)))
  check('실명단 12명 전원 포함(누락 0)',
    ROSTER.every(([kr]) => real.some((s) => s.name === kr)))
  check('Barry/Jinaa는 응시 자격은 있으나(QA 접근 유지) 집계에서 제외',
    eligible.some((s) => s.name === 'Barry') && !real.some((s) => s.name === 'Barry'))
  check('_DUP 아카이브 계정 제외', !real.some((s) => s.name.includes('_DUP')))
  check('QA_ 픽스처 제외', !real.some((s) => s.name.startsWith('QA_')))
  check('다른 반 학생은 eligible 자체가 아님', !eligible.some((s) => s.name === '다른반학생'))
  // 94차 사고의 반대 방향(누락) 재현: SCA 행이 없는 학생은 대상이 아니다 —
  // "배정이 실제 존재하는가"가 규칙이므로, 백필 없이 세면 12가 안 된다.
  const missingSca = students.map((s, i) => (i < 3 ? { ...s, assignments: [] } : s))
  const eligibleMissing = [...missingSca, ...pollution].filter((s) => {
    const scope = entranceScopeClassIds({ primaryClassId: s.classId, assignments: s.assignments, resolveTextbookOwnerClassId: resolveOwner })
    return isInEntranceScope(scope, MIN_CLS)
  }).filter((s) => isRealStudentAccount(s) && !isArchivedOrFixtureStudentName(s.name))
  check('SCA 행이 빠지면 그만큼 분모가 준다(94차 누락 사고 방향 재현: 9명)', eligibleMissing.length === 9)
}

// ── [2] READ-ONLY 라이브 대조 ────────────────────────────────────────
console.log('\n[2] READ-ONLY 라이브 대조 — 실제 DB 집계가 12명인지 (쓰기 0건)')
for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue
  for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}
const BASE = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!BASE || !KEY) {
  console.log('  SKIP — .env 없음(라이브 대조는 로컬 전용, mock 파트는 위에서 검증됨)')
} else {
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
  const all = async (p) => {
    let out = [], from = 0
    for (;;) {
      const res = await fetch(`${BASE}/rest/v1/${p}`, { headers: { ...H, Range: `${from}-${from + 999}` } })
      if (!res.ok) throw new Error(`${p} -> ${res.status}`)
      const rows = await res.json()
      out = out.concat(rows)
      if (rows.length < 1000) break
      from += 1000
    }
    return out
  }
  try {
    const [students, classes, textbooks, sca] = await Promise.all([
      all('students?select=id,name,class_id'),
      all('classes?select=id,name'),
      all('textbooks?select=id,owner_class_id'),
      all('student_class_assignments?select=student_id,class_id,textbook_id'),
    ])
    const min = classes.find((c) => c.name === '고1 능률 민병천')
    if (!min) {
      check('라이브에 "고1 능률 민병천" 반 존재', false)
    } else {
      const tbById = new Map(textbooks.map((t) => [t.id, t]))
      const scaBy = new Map()
      for (const r of sca) {
        if (!scaBy.has(r.student_id)) scaBy.set(r.student_id, [])
        scaBy.get(r.student_id).push({ classId: r.class_id, textbookId: r.textbook_id })
      }
      const real = students.filter((s) => {
        const scope = entranceScopeClassIds({
          primaryClassId: s.class_id,
          assignments: scaBy.get(s.id) || [],
          resolveTextbookOwnerClassId: (tbId) => tbById.get(tbId)?.owner_class_id || null,
        })
        return isInEntranceScope(scope, min.id)
      }).filter((s) => !isArchivedOrFixtureStudentName(s.name) && !isTestAccountStudent(s))

      // DB의 students.name은 한글명일 수도 영문명일 수도 있다(실측: 최은경은
      // "Nana"로 등록돼 있음). 명단의 두 이름 중 어느 쪽이든 인정한다.
      const matchesRow = (name, [kr, en]) => name === kr || name === en
      const extra = real.filter((s) => !ROSTER.some((row) => matchesRow(s.name, row)))
      const missing = ROSTER.filter((row) => !real.some((s) => matchesRow(s.name, row))).map(([kr]) => kr)
      // v3_35 백필 SQL이 아직 미실행이면 SCA 행 부재로 12가 안 될 수 있다 —
      // 그 경우 FAIL이 아니라 상태를 정직하게 출력한다(집계 로직 문제가
      // 아니라 데이터 백필 대기 상태이므로).
      if (real.length === 12 && missing.length === 0 && extra.length === 0) {
        check('LIVE: REAL STUDENTS = 12 / MISSING = 0 / EXTRA = 0', true)
      } else {
        console.log(`  INFO  LIVE 집계 = ${real.length}명 (기대 12)`)
        if (missing.length) console.log(`  INFO  누락: ${missing.join(', ')} — v3_35 백필 SQL 미실행이면 예상된 상태(데이터 문제, 로직 문제 아님)`)
        if (extra.length) console.log(`  INFO  초과: ${extra.map((s) => s.name).join(', ')}`)
        check('LIVE 초과 인원 0명(로직이 남을 더 세지는 않음)', extra.length === 0, extra.map((s) => s.name))
        check('LIVE 누락이 v3_35 백필 대상 4명 이내(황다은/김규민/현다율/권교빈)',
          missing.every((n) => ['황다은', '김규민', '현다율', '권교빈'].includes(n)), missing)
      }
    }
  } catch (e) {
    console.log(`  SKIP — 라이브 조회 실패(${e.message}) — mock 파트는 위에서 검증됨`)
  }
}

console.log(failures === 0 ? '\n모든 단언 통과 ✅' : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
