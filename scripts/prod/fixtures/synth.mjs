// Production Safety Harness — 합성 픽스처 빌더 (2026-09-03, Phase 8)
//
// 순수 함수 모듈이다: 네트워크/파일 접근 없음, 실명/실 UUID 없음(전부
// 합성 id/이름). scripts/prod/fixtures/ghost-unit-landing-20260902.json
// (2026-09-02 실측 기반 익명화 픽스처)은 그대로 유지하고, 이 파일은 신규
// invariant 코드를 개별 재현하기 위한 "빌더" 역할만 한다 — 기존 JSON
// 픽스처를 대체하지 않는다.
//
// makeScenario() 는 반1(class_type='regular')/교재컨테이너1(class_type=
// 'textbook')/교재1(+옵션 유령 유닛)이 있는 최소 저장소를 만들고, students
// 스펙 배열을 받아 students/assignments 행을 채운다. 반환값은
// prodInvariants.mjs buildInvariantContext()/studentHealthRules.mjs
// buildContext() 양쪽에 그대로 넘길 수 있는 { classes, textbooks, units,
// words, students, assignments } shape 다.
//
// 컨테이너 반(container class) 지원(2026-09-03, Phase 8b 코디네이터 정정) —
// student_class_assignments.class_id 가 "교재 컨테이너"(classes.class_type=
// 'textbook')를 가리키는 것은 정상 설계다(반≠교재, textbooks.owner_class_id
// 가 컨테이너를 소유). assignments 스펙에 `container: true` 를 주면 기본
// 사람 반(classId) 대신 컨테이너 반(containerClassId)을 가리키게 만든다.

/**
 * @param {{ghostUnit?: boolean, students?: Array<{
 *   id: string, name?: string, classId?: string, currentUnitId?: string|null,
 *   unitName?: string|null,
 *   assignments?: Array<{classId?: string, container?: boolean, textbookId?: string, isPrimary?: boolean, currentUnitId?: string|null, createdAt?: string}>,
 * }>}} opts
 */
export function makeScenario({ ghostUnit = true, students = [] } = {}) {
  const classId = 'synth-class-1'
  const containerClassId = 'synth-class-container-1'
  const textbookId = 'synth-textbook-1'

  const classes = [
    { id: classId, name: '합성반1', class_type: 'regular', spelling_direction: 'kr2en' },
    { id: containerClassId, name: '합성교재컨테이너1', class_type: 'textbook', spelling_direction: 'kr2en' },
  ]
  const textbooks = [{ id: textbookId, name: '합성교재1', owner_class_id: null }]
  const units = [
    { id: 'synth-unit-1', name: 'Unit1', textbook_id: textbookId },
    { id: 'synth-unit-2', name: 'Unit2', textbook_id: textbookId },
    { id: 'synth-unit-5', name: 'Unit5', textbook_id: textbookId },
  ]
  const words = []
  for (const unitId of ['synth-unit-1', 'synth-unit-2', 'synth-unit-5']) {
    for (let i = 0; i < 20; i++) {
      words.push({ id: `${unitId}-w${i}`, unit_id: unitId, word: `word${i}`, meaning: `뜻${i}` })
    }
  }

  const ghostUnitId = 'synth-unit-ghost'
  if (ghostUnit) {
    // studentHealthRules.isGhostUnit 의 BARE_UNIT_NAME 판정("Unit"만 있는
    // 이름)을 그대로 타도록 이름은 "Unit"으로 고정한다(엑셀 헤더 잔재 재현).
    units.push({ id: ghostUnitId, name: 'Unit', textbook_id: textbookId })
    words.push({ id: 'synth-ghost-w1', unit_id: ghostUnitId, word: 'No.', meaning: '어휘·어구' })
  }

  const outStudents = []
  const assignments = []
  for (const spec of students) {
    outStudents.push({
      id: spec.id,
      name: spec.name || spec.id,
      class_id: spec.classId ?? classId,
      current_unit_id: spec.currentUnitId ?? null,
      unit_name: spec.unitName ?? null,
    })
    for (const a of (spec.assignments || [])) {
      assignments.push({
        student_id: spec.id,
        class_id: a.classId ?? (a.container ? containerClassId : classId),
        textbook_id: a.textbookId ?? textbookId,
        is_primary: !!a.isPrimary,
        current_unit_id: a.currentUnitId ?? null,
        created_at: a.createdAt ?? null,
      })
    }
  }

  return { classes, textbooks, units, words, students: outStudents, assignments, ghostUnitId, classId, containerClassId, textbookId }
}

// ── 케이스 A~D(2026-09-03 지시 스펙) ─────────────────────────────────────
// A: 학생 X — unit_name=Unit5, current_unit_id=유령, primary SCA=유령
//    → STUDENT_GHOST_UNIT FAIL + UNIT_NAME_MISMATCH WARN(unit_name과 실제
//      유닛명("Unit")이 다름).
export function makeCaseA() {
  return makeScenario({
    ghostUnit: true,
    students: [{
      id: 'synth-stu-x', name: '합성학생X',
      currentUnitId: 'synth-unit-ghost', unitName: 'Unit5',
      assignments: [{ isPrimary: true, currentUnitId: 'synth-unit-ghost' }],
    }],
  })
}

// B: A의 핫픽스 이후 — X 가 Unit5/Unit5 로 정정됨 → PASS.
export function makeCaseB() {
  return makeScenario({
    ghostUnit: true,
    students: [{
      id: 'synth-stu-x', name: '합성학생X',
      currentUnitId: 'synth-unit-5', unitName: 'Unit5',
      assignments: [{ isPrimary: true, currentUnitId: 'synth-unit-5' }],
    }],
  })
}

// C: 학생 Y — students 는 정상(Unit2/Unit2), 비-primary SCA 행 하나가 유령을
//    가리킴 → SCA_GHOST_UNIT WARN 만(students 레코드 자체는 무접촉).
export function makeCaseC() {
  return makeScenario({
    ghostUnit: true,
    students: [{
      id: 'synth-stu-y', name: '합성학생Y',
      currentUnitId: 'synth-unit-2', unitName: 'Unit2',
      assignments: [
        { isPrimary: true, currentUnitId: 'synth-unit-2' },
        { isPrimary: false, currentUnitId: 'synth-unit-ghost' },
      ],
    }],
  })
}

// D: C의 핫픽스 이후 — 비-primary 행이 유령이 아닌 Unit1 로 재지정됨
//    → SCA_GHOST_UNIT WARN 소멸.
export function makeCaseD() {
  return makeScenario({
    ghostUnit: true,
    students: [{
      id: 'synth-stu-y', name: '합성학생Y',
      currentUnitId: 'synth-unit-2', unitName: 'Unit2',
      assignments: [
        { isPrimary: true, currentUnitId: 'synth-unit-2' },
        { isPrimary: false, currentUnitId: 'synth-unit-1' },
      ],
    }],
  })
}

// ── 케이스 E~G(2026-09-03, Phase 8b 코디네이터 정정 스펙) ────────────────
// 배경: CLASS_ASSIGNMENT_CONTRADICTION 최초 구현이 "교재 컨테이너
// (class_type='textbook')를 가리키는 SCA"를 사람 반 불일치로 오탐했다
// (라이브 실측 19건 — 전부 정상 학생). 아래 세 케이스는 그 정정을 고정한다.

// E: 학생에게 컨테이너 반(class_type=textbook)을 가리키는 SCA만 있음 —
//    정상 설계이므로 CLASS_ASSIGNMENT_CONTRADICTION 오탐이 없어야 한다.
export function makeCaseContainerOnly() {
  return makeScenario({
    ghostUnit: false,
    students: [{
      id: 'synth-stu-e', name: '합성학생E',
      currentUnitId: 'synth-unit-1', unitName: 'Unit1',
      assignments: [{ isPrimary: true, currentUnitId: 'synth-unit-1', container: true }],
    }],
  })
}

// F: 진짜 반 이동 — students.class_id 는 새 사람 반(기본 classId)인데, SCA
//    에는 옛 사람 반(컨테이너 아님)만 남아있음 → 일치하는 배정이 전혀
//    없으므로 CLASS_ASSIGNMENT_CONTRADICTION WARN 이 정당하게 발생해야 한다.
export function makeCaseClassMoved() {
  const scenario = makeScenario({
    ghostUnit: false,
    students: [{
      id: 'synth-stu-f', name: '합성학생F',
      currentUnitId: 'synth-unit-1', unitName: 'Unit1',
      assignments: [{ isPrimary: true, currentUnitId: 'synth-unit-1', classId: 'synth-class-old', createdAt: '2026-01-01T00:00:00Z' }],
    }],
  })
  scenario.classes.push({ id: 'synth-class-old', name: '합성반(이전)', class_type: 'regular', spelling_direction: 'kr2en' })
  return scenario
}

// G: students.class_id 자체가 컨테이너를 가리킴(사람 반이 컨테이너로 잘못
//    설정된 상태) → STUDENT_CLASS_IS_CONTAINER WARN. 이 학생의 SCA 도
//    컨테이너만 가리키므로(위 E 와 동일 이유로) CLASS_ASSIGNMENT_CONTRADICTION
//    은 함께 발생하지 않는다(단일 코드로 깔끔하게 재현하기 위한 설계).
export function makeCaseStudentClassContainer() {
  const scenario = makeScenario({
    ghostUnit: false,
    students: [{
      id: 'synth-stu-g', name: '합성학생G',
      classId: 'synth-class-container-1',
      currentUnitId: 'synth-unit-1', unitName: 'Unit1',
      assignments: [{ isPrimary: true, currentUnitId: 'synth-unit-1', container: true }],
    }],
  })
  return scenario
}
