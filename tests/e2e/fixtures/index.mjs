// tests/e2e/fixtures/index.mjs
//
// 브라우저 E2E 하네스 전용 fixture — 실 프로덕션 데이터/실명 0건, 전부 합성.
// 학생은 accountStatus.js의 TEST_ACCOUNT_NAMES(scripts/lib/studentHealthRules.mjs
// 가 아니라 src/utils/accountStatus.js가 실제 SoT — 관리자 화면이 "🧪 테스트"
// 배지로 감추는 것도 이 목록 기준)에서 하나를 그대로 쓴다.
//
// 교재 2종("중1 천재 이상기"/"중2 천재 이상기", 둘 다 publisher_name="천재")
// + 유사명 함정 교재 2종("중1 동아 윤정미"/"중2 동아 윤정미") — 관리자 화면
// 텍스트북 드롭다운이 이름이 겹치는 4개를 UUID 기준으로 정확히 분리하는지
// 검증하기 위함(admin.spec.mjs 시나리오 5·6).
//
// SCA(student_class_assignments): primary=교재A(Unit2 선택), secondary=교재B.

function uid(tag) {
  return `e2e-${tag}`
}

export const QA_STUDENT_NAME = 'cookie' // src/utils/accountStatus.js TEST_ACCOUNT_NAMES
export const QA_STUDENT_ID = uid('student-qa')
export const QA_LOGIN_PIN = '0000'
export const ADMIN_PIN = '9999'

export const REAL_CLASS_ID = uid('class-real')
export const REAL_CLASS_NAME = 'MS Advanced Class' // ROADMAP/DATABASE.md 상 "진짜 반"으로 확정된 이름 재사용(허구 이름 아님)

export const TB_A = { id: uid('tb-a'), name: '중1 천재 이상기', publisher: '천재', classId: uid('class-a'), unitWordCounts: [20, 15, 10] }
export const TB_B = { id: uid('tb-b'), name: '중2 천재 이상기', publisher: '천재', classId: uid('class-b'), unitWordCounts: [12, 12, 12] }
export const TB_C = { id: uid('tb-c'), name: '중1 동아 윤정미', publisher: '동아', classId: uid('class-c'), unitWordCounts: [5] }
export const TB_D = { id: uid('tb-d'), name: '중2 동아 윤정미', publisher: '동아', classId: uid('class-d'), unitWordCounts: [5] }
export const ALL_TEXTBOOKS = [TB_A, TB_B, TB_C, TB_D]

function buildTextbookUnitsAndWords(tb) {
  const units = []
  const words = []
  tb.unitWordCounts.forEach((wordCount, i) => {
    const unitId = uid(`unit-${tb.id}-${i + 1}`)
    units.push({ id: unitId, class_id: tb.classId, name: `Unit ${i + 1}`, position: i + 1, textbook_id: tb.id })
    for (let w = 1; w <= wordCount; w++) {
      words.push({
        id: uid(`word-${tb.id}-${i + 1}-${w}`),
        unit_id: unitId,
        word: `${tb.id}-w${i + 1}-${w}`,
        meaning: `뜻-${tb.id}-${i + 1}-${w}`,
        position: w,
        word_audio_url: null,
        example_audio_url: null,
        example_text: null,
        example_translation: null,
        memory_tip: null,
        accepted_meanings: [],
      })
    }
  })
  return { units, words }
}

/** 매 테스트마다 독립적인 새 fixture 테이블 세트를 만든다(테스트 간 상태 격리). */
export function buildFixtureTables() {
  const classes = [
    { id: REAL_CLASS_ID, name: REAL_CLASS_NAME, class_type: null, spelling_test_enabled: false, spelling_hint_enabled: false, wrong_answer_repeat_count: 3, spelling_direction: 'kr2en', gamification_enabled: false, created_at: '2026-01-01T00:00:00Z' },
    ...ALL_TEXTBOOKS.map((tb, i) => ({
      id: tb.classId, name: tb.name, class_type: 'textbook',
      spelling_test_enabled: false, spelling_hint_enabled: false, wrong_answer_repeat_count: 3,
      spelling_direction: 'kr2en', gamification_enabled: false,
      created_at: `2026-01-01T00:0${i + 1}:00Z`,
    })),
  ]

  const textbooks = ALL_TEXTBOOKS.map((tb) => ({ id: tb.id, name: tb.name, publisher_name: tb.publisher, owner_class_id: tb.classId }))
  const classTextbooks = ALL_TEXTBOOKS.map((tb) => ({ class_id: tb.classId, textbook_id: tb.id, enabled: true, sort_order: 0 }))

  let units = []
  let words = []
  for (const tb of ALL_TEXTBOOKS) {
    const built = buildTextbookUnitsAndWords(tb)
    units = units.concat(built.units)
    words = words.concat(built.words)
  }

  const unitA2 = units.find((u) => u.class_id === TB_A.classId && u.name === 'Unit 2')
  const unitB1 = units.find((u) => u.class_id === TB_B.classId && u.name === 'Unit 1')

  const students = [{
    id: QA_STUDENT_ID,
    name: QA_STUDENT_NAME,
    class_id: REAL_CLASS_ID,
    unit_name: unitA2.name,
    current_unit_id: unitA2.id,
    house_id: null,
    created_at: '2026-01-02T00:00:00Z',
    classes: { name: REAL_CLASS_NAME },
  }]

  const studentClassAssignments = [
    { id: uid('sca-primary'), student_id: QA_STUDENT_ID, class_id: TB_A.classId, current_unit_id: unitA2.id, is_primary: true, textbook_id: TB_A.id },
    { id: uid('sca-secondary'), student_id: QA_STUDENT_ID, class_id: TB_B.classId, current_unit_id: unitB1.id, is_primary: false, textbook_id: TB_B.id },
  ]

  return {
    classes,
    units,
    words,
    textbooks,
    class_textbooks: classTextbooks,
    students,
    student_class_assignments: studentClassAssignments,
    daily_assignments: [],
    student_progress: [],
    reward_ledger: [],
    xp_ledger: [],
    product_events: [],
    entrance_tests: [],
    entrance_test_results: [],
    word_status: [],
    spelling_review_queue: [],
  }
}

export const EMBEDS = {
  classes: { table: 'classes', localCol: 'class_id', foreignCol: 'id', as: 'classes' },
}

/** 관리자 학생 카드가 보여줄, 이 fixture의 Unit2 단어 수(테스트 단언용). */
export const TB_A_UNIT2_WORD_COUNT = TB_A.unitWordCounts[1]
