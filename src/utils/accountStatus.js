// 계정 종류(테스트/아카이브) 판별 — 단일 진실 공급원(순수 함수, 네트워크/DB
// 무접촉).
//
// 왜 이 파일이 생겼나(2026-08-11 운영자 확정): "고1 능률 민병천" 반의
// 입실시험 분모가 10인데 실제 학생은 12명인 사고를 조사하다가, 테스트 계정
// (Cookie/Paul/Jinaa) 판별이 StudentSelect.jsx(21행 부근)와
// StudentDirectory.jsx(59행 부근) 두 곳에 서로 다른 사본으로 하드코딩돼
// 있었고, 운영자의 실제 QA 계정인 Barry는 그 어느 목록에도 없어 "테스트
// 계정"이 아니라 "실제 학생"으로 집계되고 있었다는 사실을 발견했다. 게다가
// 이 판별은 입실시험 분모(wordLibrary.js의 fetchEntranceRosterForClass)와
// Word King 랭킹(api/compute-word-king.js)에는 아예 적용조차 안 돼 있었다 —
// 로그인 화면과 관리자 학생 디렉터리 각자에만 로컬 사본이 있었다는 뜻. 이
// 파일은 그 중복/누락을 한 곳으로 모은다 — 새 판정 규칙을 만드는 게 아니라
// 기존 규칙(cookie/paul/jinaa 이름 정확 일치) + 운영자가 이번에 확정한 사실
// (barry 추가)을 한 군데에 두는 것뿐이다.
//
// 주의: 이 파일의 술어는 전부 "집계/표시 전용"이다. 학생이 실제로 시험을
// 볼 수 있는지/화면에 뭐가 보이는지(입실시험 응시 자격 등)에는 **쓰지
// 않는다** — 그건 entranceEligibility.js의 몫이고, 테스트 계정도 QA 목적
// 으로 계속 정상 응시할 수 있어야 한다(운영자 요구 — 삭제 금지/교재 배정
// 회수 금지/응시 가능 유지).
//
// 아카이브 판정(이름 기반)의 정의 자체는 여기서 새로 쓰지 않는다 —
// entranceEligibility.js가 그 규칙의 단일 소유자이므로 여기서는 re-export만
// 한다(판정 로직 중복 금지).
import { isArchivedOrFixtureStudentName } from './entranceEligibility.js'

export { isArchivedOrFixtureStudentName }

// 알려진 테스트/QA 계정 이름 — 트림 후 소문자 정확 일치(기존 두 파일과
// 동일 규칙). barry는 2026-08-11 운영자 확정으로 새로 추가된 항목이다.
export const TEST_ACCOUNT_NAMES = ['cookie', 'paul', 'jinaa', 'barry']

const normalizeName = (name) => (name || '').trim().toLowerCase()

// 이 학생이 테스트/QA 계정인가 — students.is_test 컬럼이 있으면(값이
// boolean으로 명시돼 있으면) 그 값을 우선하고, 컬럼이 없거나(undefined,
// 아직 조회 select에 포함되지 않은 경우 포함) 이름 폴백으로 판정한다
// (CLAUDE.md 규칙 9 — 컬럼이 나중에 생겨도/안 생겨도 앱이 깨지지 않아야
// 함). 이 컬럼은 아직 DB에 존재하지 않는다(2026-08-11 시점, 이 세션은
// DDL을 실행하지 않음) — 지금은 사실상 항상 이름 폴백 경로를 탄다.
export function isTestAccountStudent(student) {
  if (!student) return false
  if (typeof student.is_test === 'boolean') return student.is_test
  return TEST_ACCOUNT_NAMES.includes(normalizeName(student.name))
}

// 이 학생이 아카이브(비활성/중복/QA 픽스처) 계정인가 — students.archived
// 컬럼이 있으면 우선, 없으면 이름 규칙(entranceEligibility.
// isArchivedOrFixtureStudentName) 폴백. 위와 동일한 이유로 컬럼 유무와
// 무관하게 안전(규칙 9). archived 컬럼도 아직 DB에 존재하지 않는다.
export function isArchivedStudent(student) {
  if (!student) return false
  if (typeof student.archived === 'boolean') return student.archived
  return isArchivedOrFixtureStudentName(student?.name)
}

// "실제 학생 집계"용 술어 — 아카이브도 테스트 계정도 아닌 경우만 true.
// 관리자 분모/랭킹/통계처럼 "진짜 학생 수"를 세야 하는 곳에서만 쓴다.
// 학생 화면의 시험 노출/응시 판정에는 쓰지 않는다(위 헤더 주석 참고).
export function isRealStudentAccount(student) {
  return !isArchivedStudent(student) && !isTestAccountStudent(student)
}
