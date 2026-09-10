// scripts/fixtures/elementary45.mjs — 초등 5반×9명=45명 합성 학생 격리
// fixture (2026-09-11).
//
// 순수 데이터 빌더. 네트워크/Supabase 접촉 0, 실제 학생 데이터 0 — 모든
// id는 crypto.randomUUID()로 합성한다(CLAUDE.md 규칙 4 — 이름이 아니라
// UUID가 학생 식별자). 프로덕션 구조를 그대로 미러링한다:
//   · 5개 `regular` 반(spelling_direction 'kr2en', spelling_test_enabled
//     false) — 학생의 "홈"(사람) 반.
//   · 3개 교재 컨테이너 반(class_type 'textbook') — 각각 교재 1개를 소유.
//     교재A(4유닛×40단어)/교재B(2유닛×60단어)/교재Ghost(1유닛×1단어,
//     BARE_UNIT_NAME "Unit" — src/utils/wordLibrary.js의 유령 유닛 판정과
//     동일 규칙).
//   · class_textbooks로 홈 반 ↔ 교재를 다대다 연결(교재A는 홈1~3, 교재B는
//     홈3~5, 교재Ghost는 홈5에만 — 반 간 배타적 연결을 검증하기 위함).
//   · 학생마다 SCA 2행: 홈 행(class_id=홈 반, textbook_id null,
//     is_primary false) + primary 행(class_id=교재 소유 컨테이너,
//     textbook_id/현재유닛, is_primary true).
//   · students.class_id=홈 반, students.current_unit_id=primary 유닛과
//     동일(권위 있는 값 — getStudentClassAssignments가 이 값으로 primary
//     행을 보정한다, wordLibrary.js 주석 참고).
//
// 까다로운 이름 케이스(전부 UUID가 다른 별개 학생):
//   · "Kinney" 동명이인 2명(서로 다른 반/유닛) — KINNEY_A/KINNEY_B.
//   · 대소문자/공백 변형: "kinney "(끝공백+소문자) — KINNEY_TRAIL,
//     "Kin ney"(내부 공백) — KINNEY_INNER.
//   · QA 계정 패턴 이름 "Barry" — QA_BARRY.
//   · 아카이브 중복 패턴 이름 "Kinney_DUP_2026_INACTIVE" — ARCHIVED_DUP.
//   · 1단어 유령 유닛을 current_unit_id로 갖는 학생 — GHOST_STUDENT.
import crypto from 'node:crypto'

const uid = () => crypto.randomUUID()

function makeUnit(classId, textbookId, name, wordCount, wordBase) {
  const unitId = uid()
  const words = Array.from({ length: wordCount }, (_, i) => ({
    id: uid(), unit_id: unitId, word: `${wordBase}${i + 1}`, meaning: `뜻-${wordBase}${i + 1}`, position: i + 1,
  }))
  return { unit: { id: unitId, class_id: classId, textbook_id: textbookId, name, position: 0 }, words }
}

export function buildElementary45Dataset() {
  // ── 5개 홈(사람) 반 ──────────────────────────────────────────────────
  const home = Array.from({ length: 5 }, (_, i) => ({
    id: uid(), name: `초등${i + 1}반`, class_type: 'regular',
    spelling_direction: 'kr2en', spelling_test_enabled: false,
  }))
  const [HOME1, HOME2, HOME3, HOME4, HOME5] = home.map((c) => c.id)

  // ── 3개 교재 컨테이너 반 + 교재 ──────────────────────────────────────
  const contA = { id: uid(), name: '교재A컨테이너', class_type: 'textbook', spelling_direction: 'mixed', spelling_test_enabled: false }
  const contB = { id: uid(), name: '교재B컨테이너', class_type: 'textbook', spelling_direction: 'en2kr', spelling_test_enabled: false }
  const contGhost = { id: uid(), name: '교재Ghost컨테이너', class_type: 'textbook', spelling_direction: 'mixed', spelling_test_enabled: false }

  const TB_A = { id: uid(), name: '교재A', publisher_name: '출판사A', owner_class_id: contA.id }
  const TB_B = { id: uid(), name: '교재B', publisher_name: '출판사B', owner_class_id: contB.id }
  const TB_GHOST = { id: uid(), name: '교재Ghost', publisher_name: '출판사G', owner_class_id: contGhost.id }

  const class_textbooks = [
    { class_id: HOME1, textbook_id: TB_A.id, enabled: true, sort_order: 1 },
    { class_id: HOME2, textbook_id: TB_A.id, enabled: true, sort_order: 1 },
    { class_id: HOME3, textbook_id: TB_A.id, enabled: true, sort_order: 1 },
    { class_id: HOME3, textbook_id: TB_B.id, enabled: true, sort_order: 2 },
    { class_id: HOME4, textbook_id: TB_B.id, enabled: true, sort_order: 1 },
    { class_id: HOME5, textbook_id: TB_B.id, enabled: true, sort_order: 1 },
    { class_id: HOME5, textbook_id: TB_GHOST.id, enabled: true, sort_order: 2 },
  ]

  // ── 유닛 + 단어 ────────────────────────────────────────────────────
  const unitsA = [1, 2, 3, 4].map((n) => makeUnit(contA.id, TB_A.id, `Unit${n}`, 40, `a${n}_`))
  const unitsB = [1, 2].map((n) => makeUnit(contB.id, TB_B.id, `Unit${n}`, 60, `b${n}_`))
  const ghost = makeUnit(contGhost.id, TB_GHOST.id, 'Unit', 1, 'ghost_') // bare name -> BARE_UNIT_NAME 유령

  const groups = { A: unitsA, B: unitsB, GHOST: [ghost] }
  const owner = { A: { cls: contA, tb: TB_A }, B: { cls: contB, tb: TB_B }, GHOST: { cls: contGhost, tb: TB_GHOST } }

  // ── 45명 로스터 스펙 — (name, home 반, 교재그룹, 유닛 인덱스) ─────────
  const spec = [
    // HOME1 — 교재A만 연결
    ['Alice', HOME1, 'A', 0], ['Bob', HOME1, 'A', 1],
    ['Kinney', HOME1, 'A', 1], // KINNEY_A
    ['Kin ney', HOME1, 'A', 0], // 내부 공백 변형(별개 학생)
    ['Barry', HOME1, 'A', 2], // QA 계정 이름 패턴
    ['Grace', HOME1, 'A', 3], ['Henry', HOME1, 'A', 0], ['Ivy', HOME1, 'A', 1], ['Jack', HOME1, 'A', 2],
    // HOME2 — 교재A만 연결
    ['Kinney', HOME2, 'A', 0], // KINNEY_B(동명이인, 다른 반/유닛)
    ['kinney ', HOME2, 'A', 3], // 소문자+끝공백 변형(별개 학생)
    ['Kinney_DUP_2026_INACTIVE', HOME2, 'A', 1], // 아카이브 중복 패턴
    ['Leo', HOME2, 'A', 2], ['Mia', HOME2, 'A', 0], ['Noah', HOME2, 'A', 1],
    ['Olivia', HOME2, 'A', 3], ['Peter', HOME2, 'A', 2], ['Quinn', HOME2, 'A', 0],
    // HOME3 — 교재A+B 둘 다 연결(학생별로 primary가 갈림)
    ['Rachel', HOME3, 'A', 2], ['Sam', HOME3, 'B', 0], ['Tina', HOME3, 'B', 1],
    ['Uma', HOME3, 'A', 0], ['Victor', HOME3, 'A', 3], ['Wendy', HOME3, 'B', 0],
    ['Xavier', HOME3, 'A', 1], ['Yara', HOME3, 'B', 1], ['Zack', HOME3, 'A', 2],
    // HOME4 — 교재B만 연결
    ['Aaron', HOME4, 'B', 0], ['Bella', HOME4, 'B', 1], ['Carl', HOME4, 'B', 0],
    ['Dana', HOME4, 'B', 1], ['Ethan', HOME4, 'B', 0], ['Fiona', HOME4, 'B', 1],
    ['Gabe', HOME4, 'B', 0], ['Hana', HOME4, 'B', 1], ['Iris', HOME4, 'B', 0],
    // HOME5 — 교재B+Ghost 연결(유령 유닛 학생 1명 포함)
    ['GhostKid', HOME5, 'GHOST', 0],
    ['Jade', HOME5, 'B', 0], ['Kyle', HOME5, 'B', 1], ['Liam2', HOME5, 'B', 0],
    ['Mona', HOME5, 'B', 1], ['Noel', HOME5, 'B', 0], ['Opal', HOME5, 'B', 1],
    ['Percy', HOME5, 'B', 0], ['Queenie', HOME5, 'B', 1],
  ]
  if (spec.length !== 45) throw new Error(`fixture 로스터가 45명이 아님: ${spec.length}`)

  const students = []
  const student_class_assignments = []
  const student_progress = []
  const roster = []
  const nameToIds = new Map()

  for (const [name, homeClassId, group, unitIdx] of spec) {
    const id = uid()
    const { cls: ownerCls, tb } = owner[group]
    const { unit, words } = groups[group][unitIdx]
    students.push({
      id, name, class_id: homeClassId, unit_name: unit.name, current_unit_id: unit.id, house_id: null,
    })
    student_class_assignments.push({
      id: uid(), student_id: id, class_id: homeClassId, textbook_id: null, current_unit_id: null, is_primary: false,
    })
    student_class_assignments.push({
      id: uid(), student_id: id, class_id: ownerCls.id, textbook_id: tb.id, current_unit_id: unit.id, is_primary: true,
    })
    student_progress.push({ id: uid(), student_id: id, correct_count: roster.length, updated_at: '2026-09-11T00:00:00Z' })
    const expectedWordIds = new Set(words.map((w) => w.id))
    roster.push({
      id, name, homeClassId, homeClassName: home.find((c) => c.id === homeClassId).name,
      ownerClassId: ownerCls.id, ownerClassName: ownerCls.name,
      textbookId: tb.id, textbookName: tb.name, unitId: unit.id, unitName: unit.name,
      spellingDirection: ownerCls.spelling_direction, expectedWordIds, expectedWordCount: words.length,
    })
    if (!nameToIds.has(name)) nameToIds.set(name, [])
    nameToIds.get(name).push(id)
  }

  const classes = [...home, contA, contB, contGhost]
  const textbooks = [TB_A, TB_B, TB_GHOST]
  const units = [...unitsA, ...unitsB, ghost].map((u) => u.unit)
  const words = [...unitsA, ...unitsB, ghost].flatMap((u) => u.words)

  const dataset = {
    classes, textbooks, class_textbooks, units, words, students, student_class_assignments,
    student_progress, daily_assignments: [],
  }

  const byName = (name) => roster.find((r) => r.name === name)
  const allByName = (name) => roster.filter((r) => r.name === name)

  return {
    dataset,
    roster,
    nameToIds,
    HOME: { HOME1, HOME2, HOME3, HOME4, HOME5 },
    TB: { TB_A, TB_B, TB_GHOST },
    CONT: { contA, contB, contGhost },
    GHOST_UNIT: ghost.unit,
    byName,
    allByName,
    KINNEY_A: allByName('Kinney')[0],
    KINNEY_B: allByName('Kinney')[1],
    KINNEY_TRAIL: byName('kinney '),
    KINNEY_INNER: byName('Kin ney'),
    QA_BARRY: byName('Barry'),
    ARCHIVED_DUP: byName('Kinney_DUP_2026_INACTIVE'),
    GHOST_STUDENT: byName('GhostKid'),
  }
}
