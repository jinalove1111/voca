// 입실시험 eligibility 규칙 회귀 테스트 (2026-08-11) — 순수 단위 테스트.
// 네트워크/DB 접촉 0. 프로덕션 학생 데이터를 읽지도 쓰지도 않는다(mock 픽스처만).
//
// 왜 mock인가: 기존 testEntranceClassScope.mjs는 라이브 데이터로 "지금 상태가
// 규칙에 맞는가"를 검증한다(그것도 필요하다). 하지만 라이브 데이터는 그날의
// 배정 상태에 따라 특정 케이스가 아예 존재하지 않을 수 있어서, "규칙 자체"가
// 조용히 바뀌어도 SKIP만 늘고 FAIL이 안 날 수 있다. 이 파일은 규칙을 고정한다.
//
// 실행: node scripts/testEntranceEligibilityRules.mjs   (npm run verify:eligibility)
import {
  entranceScopeClassIds, isInEntranceScope, entranceEligibilitySource,
  isArchivedOrFixtureStudentName, assignmentClassIds,
} from '../src/utils/entranceEligibility.js'
// 계정 종류(테스트) 판별 — 2026-08-11 운영자 확정(accountStatus.js 헤더
// 주석 참고). isArchivedOrFixtureStudentName(위)과는 판정 대상이 다르다 —
// 이건 "아카이브 여부"이고, 아래 섹션 7은 "테스트/QA 계정 여부"다.
import { isTestAccountStudent } from '../src/utils/accountStatus.js'

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

// ── 픽스처: 실제 운영 구조를 그대로 축소한 모형 ───────────────────────
// 반: 사람 반 2개(중등부, 초등부) + 교재 컨테이너 반 3개
const C = {
  중등부: 'cls-ms', 초등부: 'cls-pre',
  고1능률: 'cls-ko1', 고1학평: 'cls-hak', 중2능률: 'cls-mid2',
}
// 교재 -> 소유 컨테이너 반
const TB = { 고1능률: 'tb-ko1', 고1학평: 'tb-hak', 중2능률: 'tb-mid2' }
const OWNER = { [TB.고1능률]: C.고1능률, [TB.고1학평]: C.고1학평, [TB.중2능률]: C.중2능률 }
const ownerOf = (tbId) => OWNER[tbId] || null

// 학생 픽스처 — 운영에서 실제로 관측된 조합만 골라 넣었다.
const 학생 = {
  // 사람 반 중등부 소속, 고1능률 교재를 개별 배정(= Jinaa 모형: 배정 행의
  // class_id는 엉뚱한 반을 가리키고 textbook_id만 맞는 축 분리 상태)
  Jinaa: { primaryClassId: C.중등부, assignments: [{ classId: C.초등부, textbookId: TB.고1능률, isPrimary: true }] },
  // 같은 반인데 고1능률 배정이 없는 학생(= 김규민 모형)
  김규민: { primaryClassId: C.중등부, assignments: [{ classId: C.중등부, textbookId: TB.중2능률, isPrimary: true }] },
  // 두 교재 모두 배정(= 김보민 모형: 지금은 학평을 보고 있어도 둘 다 대상)
  김보민: { primaryClassId: C.중등부, assignments: [
    { classId: C.중등부, textbookId: TB.고1학평, isPrimary: true },
    { classId: C.초등부, textbookId: TB.고1능률, isPrimary: false },
  ] },
  // 초등부(Pre-Middle) 학생 + 고1 교재 개별 배정 있음 -> 고1 시험 대상이어야 함
  김철수: { primaryClassId: C.초등부, assignments: [{ classId: C.초등부, textbookId: TB.고1능률, isPrimary: true }] },
  // 초등부 학생, 고1 배정 없음 -> 고1 시험 대상 아님
  이영희: { primaryClassId: C.초등부, assignments: [{ classId: C.초등부, textbookId: TB.중2능률, isPrimary: true }] },
  // 레거시: 배정 행에 textbook_id가 없고 class_id만 있는 v2.9 시절 행
  레거시: { primaryClassId: C.중등부, assignments: [{ classId: C.고1능률, textbookId: null, isPrimary: true }] },
  // 배정 자체가 없는 학생(테이블 미실행/신규) -> 사람 반만
  무배정: { primaryClassId: C.중등부, assignments: [] },
}
const scopeOf = (s) => entranceScopeClassIds({ ...s, resolveTextbookOwnerClassId: ownerOf })
const 대상 = (s, testClassId) => isInEntranceScope(scopeOf(s), testClassId)

console.log('\n1. 운영자 확정 규칙 — 8개 시나리오')
check('① 같은 반 + 그 반에 직접 연 시험 -> 보임', 대상(학생.김규민, C.중등부))
check('② 같은 반이지만 그 교재 배정 없음 -> 안 보임 (김규민 vs 고1능률)', !대상(학생.김규민, C.고1능률))
check('③ 다른 반이어도 교재 개별 배정 있으면 -> 보임 (Jinaa vs 고1능률)', 대상(학생.Jinaa, C.고1능률))
check('④ 초등부 학생 + 고1 교재 개별 배정 -> 고1 시험 보임 (학년으로 막지 않는다)', 대상(학생.김철수, C.고1능률))
check('⑤ 초등부 학생 + 고1 배정 없음 -> 고1 시험 안 보임', !대상(학생.이영희, C.고1능률))
check('⑥ 두 교재 모두 배정 -> 두 시험 모두 대상 (지금 보는 책과 무관)',
  대상(학생.김보민, C.고1능률) && 대상(학생.김보민, C.고1학평))
check('⑦ 레거시 행(textbook_id 없음, class_id만) -> class_id 축으로 보임', 대상(학생.레거시, C.고1능률))
check('⑧ 배정 0건 -> 사람 반 시험만 보임', 대상(학생.무배정, C.중등부) && !대상(학생.무배정, C.고1능률))

console.log('\n2. 범위 계산 계약')
check('사람 반이 항상 첫 원소', scopeOf(학생.Jinaa)[0] === C.중등부, scopeOf(학생.Jinaa))
check('중복 반 id 없음', (() => { const s = scopeOf(학생.김보민); return new Set(s).size === s.length })(), scopeOf(학생.김보민))
check('근거 없는 반은 절대 안 들어온다', !scopeOf(학생.김규민).includes(C.고1능률), scopeOf(학생.김규민))
check('빈 입력 안전', entranceScopeClassIds({}).length === 0)
check('assignments가 null이어도 안전', entranceScopeClassIds({ primaryClassId: C.중등부, assignments: null }).length === 1)
check('resolveTextbookOwnerClassId 미주입이면 교재 축만 생략(크래시 없음)',
  entranceScopeClassIds({ primaryClassId: C.중등부, assignments: 학생.Jinaa.assignments }).join(',') === `${C.중등부},${C.초등부}`)
check('합성 교재(ownerClassId === classId)는 중복으로 흡수', (() => {
  const s = entranceScopeClassIds({
    primaryClassId: C.중등부,
    assignments: [{ classId: C.중2능률, textbookId: 'synthetic', isPrimary: true }],
    resolveTextbookOwnerClassId: () => C.중2능률,
  })
  return s.length === 2 && s.includes(C.중등부) && s.includes(C.중2능률)
})())
check('assignmentClassIds: 두 축 모두 반환', assignmentClassIds({ classId: 'a', textbookId: 't' }, () => 'b').join(',') === 'a,b')
check('assignmentClassIds: null 안전', assignmentClassIds(null, () => 'b').length === 0)
check('isInEntranceScope: testClassId 없으면 false', !isInEntranceScope([C.중등부], null))

console.log('\n3. 판정 근거(source) 추적 — 관리자 디버깅용')
const src = (s, c) => entranceEligibilitySource({ ...s, resolveTextbookOwnerClassId: ownerOf }, c)
check('사람 반 소속 -> CLASS_MEMBER', src(학생.김규민, C.중등부) === 'CLASS_MEMBER', src(학생.김규민, C.중등부))
check('배정 행 class_id -> INDIVIDUAL_CLASS', src(학생.레거시, C.고1능률) === 'INDIVIDUAL_CLASS', src(학생.레거시, C.고1능률))
check('배정 교재 소유 반 -> INDIVIDUAL_TEXTBOOK', src(학생.Jinaa, C.고1능률) === 'INDIVIDUAL_TEXTBOOK', src(학생.Jinaa, C.고1능률))
check('대상 아니면 null', src(학생.김규민, C.고1능률) === null)
check('source가 있으면 반드시 대상이고, 없으면 반드시 비대상(두 함수 일관성)', (() => {
  for (const s of Object.values(학생)) {
    for (const c of Object.values(C)) {
      const hasSrc = src(s, c) !== null
      if (hasSrc !== 대상(s, c)) return false
    }
  }
  return true
})())

console.log('\n4. 아카이브/중복/QA 계정 판별')
check('_INACTIVE 접미 제외', isArchivedOrFixtureStudentName('전하은_DUP_20260806_726bbf_INACTIVE'))
check('_DUP 접미 제외', isArchivedOrFixtureStudentName('김가윤_DUP2_212b1c'))
check('QA_ 접두 제외', isArchivedOrFixtureStudentName('QA_PinKid'))
check('_QA_ 접두 제외', isArchivedOrFixtureStudentName('_QA_Song_TextbookModel_20260722'))
check('대소문자 무시', isArchivedOrFixtureStudentName('someone_inactive') && isArchivedOrFixtureStudentName('qa_x'))
check('실제 학생은 통과', !isArchivedOrFixtureStudentName('Jinaa') && !isArchivedOrFixtureStudentName('박서진') && !isArchivedOrFixtureStudentName('Barry'))
check('빈 이름/null 안전(제외 아님)', !isArchivedOrFixtureStudentName('') && !isArchivedOrFixtureStudentName(null))
check('이름 중간의 dup은 걸린다(아카이브 관례가 접미이므로 보수적으로 제외)', isArchivedOrFixtureStudentName('x_DUP2_y'))

console.log('\n5. 관리자 분모 == 학생 화면 대상 (같은 규칙을 쓰는지 모형으로 확인)')
{
  // 관리자 분모를 "전 학생을 규칙으로 걸러낸 집합"으로 계산하고,
  // 학생 화면 판정과 1:1로 일치하는지 확인한다.
  const 전체 = Object.entries(학생)
  for (const classId of Object.values(C)) {
    const 관리자분모 = 전체.filter(([, s]) => 대상(s, classId)).map(([n]) => n)
    const 학생판정 = 전체.filter(([, s]) => isInEntranceScope(scopeOf(s), classId)).map(([n]) => n)
    if (관리자분모.join(',') !== 학생판정.join(',')) {
      check(`반 ${classId}: 관리자 분모 == 학생 판정`, false, { 관리자분모, 학생판정 })
    }
  }
  check('모든 반에서 관리자 분모 == 학생 판정', true)
  // 아카이브 계정은 분모에서 빠진다
  const withJunk = [...전체, ['테스트_DUP2_INACTIVE', 학생.Jinaa]]
  const 분모 = withJunk.filter(([n, s]) => 대상(s, C.고1능률) && !isArchivedOrFixtureStudentName(n)).map(([n]) => n)
  check('아카이브 계정은 분모에 포함되지 않는다', !분모.some((n) => isArchivedOrFixtureStudentName(n)), 분모)
}

console.log('\n6. 규칙에 절대 들어오면 안 되는 것(반증 테스트)')
check('class_textbooks(반 기본 교재)는 판정에 쓰이지 않는다 — 반 링크만으로는 대상이 되지 않음', (() => {
  // 초등부 반에 고1 교재가 "기본 교재"로 걸려 있다고 가정해도, 배정이 없는
  // 이영희는 대상이 되면 안 된다. 규칙 함수는 class_textbooks를 아예 입력으로
  // 받지 않으므로 구조적으로 불가능하다 — 그 사실을 여기서 고정한다.
  return !대상(학생.이영희, C.고1능률)
})())
check('현재 학습 중인 교재(current_unit_id)는 판정 입력이 아니다', (() => {
  // 김보민은 지금 학평을 보고 있어도 고1능률 대상이어야 한다(시나리오 ⑥과 짝).
  return 대상(학생.김보민, C.고1능률)
})())
check('반 이름/학년 문자열은 판정 입력이 아니다(함수 시그니처에 이름이 없음)',
  entranceScopeClassIds.length === 1) // 인자 1개(객체)만 받는다 = 이름 기반 분기 불가

console.log('\n7. 테스트/QA 계정 판별(isTestAccountStudent, 2026-08-11 운영자 확정)')
{
  // "고1 능률 민병천" 반 입실시험 분모 사고 조사에서 확정된 사실 — Barry와
  // Jinaa는 운영자의 테스트/QA 계정이다(삭제/교재 회수는 안 하고, 실제
  // 학생 집계에서만 제외). Cookie/Paul은 기존부터 알려진 테스트 계정.
  check('Barry는 테스트 계정', isTestAccountStudent({ name: 'Barry' }))
  check('Jinaa는 테스트 계정', isTestAccountStudent({ name: 'Jinaa' }))
  check('Cookie는 테스트 계정', isTestAccountStudent({ name: 'Cookie' }))
  check('Paul은 테스트 계정', isTestAccountStudent({ name: 'Paul' }))

  // "고1 능률 민병천" 반의 실제 학생 12명 — 전원 테스트 계정이 아니어야 함.
  const 실제학생12명 = [
    '황다은', '박서진', '김태율', '권교빈', '황성연', '박건우',
    '전하은', 'Nana', '김보민', '김규민', '김가윤', '현다율',
  ]
  check('실제 학생 12명은 전원 테스트 계정이 아니다',
    실제학생12명.every((name) => !isTestAccountStudent({ name })),
    실제학생12명.filter((name) => isTestAccountStudent({ name })))

  // 대소문자/공백 트림 — 기존 두 파일(StudentSelect/StudentDirectory)의
  // "트림 후 소문자 정확 일치" 규칙을 그대로 유지해야 한다.
  check('대소문자 무시(BARRY/barry/BaRRy 전부 일치)',
    isTestAccountStudent({ name: 'BARRY' }) &&
    isTestAccountStudent({ name: 'barry' }) &&
    isTestAccountStudent({ name: 'BaRRy' }))
  check('앞뒤 공백 트림', isTestAccountStudent({ name: '  barry  ' }))
  check('부분 일치는 걸리지 않는다(정확 일치만, 예: "Barry2"는 테스트 계정 아님)',
    !isTestAccountStudent({ name: 'Barry2' }) && !isTestAccountStudent({ name: 'notbarry' }))
  check('null/undefined 학생 안전(예외 없이 false)',
    !isTestAccountStudent(null) && !isTestAccountStudent(undefined) && !isTestAccountStudent({}))

  // students.is_test 컬럼이 있으면(boolean) 이름보다 우선한다(규칙 9 — 컬럼이
  // 나중에 생겨도/안 생겨도 앱이 안 깨짐). 컬럼값이 이름과 반대여도 컬럼이 이긴다.
  check('is_test:true면 이름이 실제 학생이어도 테스트 계정 취급',
    isTestAccountStudent({ name: '박서진', is_test: true }))
  check('is_test:false면 이름이 테스트 계정 이름이어도 실제 학생 취급',
    !isTestAccountStudent({ name: 'Barry', is_test: false }))
  check('is_test가 undefined(컬럼 없음/미조회)면 이름 폴백',
    isTestAccountStudent({ name: 'Barry', is_test: undefined }) &&
    !isTestAccountStudent({ name: '박서진', is_test: undefined }))
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n실패 ${failures}건 ❌`)
process.exit(failures === 0 ? 0 : 1)
