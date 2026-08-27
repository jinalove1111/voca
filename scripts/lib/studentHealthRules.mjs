// Student Health Check — 순수 판정 규칙 (2026-08-26, P1)
//
// 이 모듈은 계산만 한다: 네트워크/DB/파일 접근이 없고, 같은 입력이면 항상
// 같은 결과다(결정론). 라이브 조회는 scripts/studentHealthCheck.mjs 가
// 전담하며 그쪽도 SELECT 전용이다 — 이 시스템 전체에 쓰기 경로가 없다.
//
// ── 왜 필요한가 ────────────────────────────────────────────────────────
// 최근 반복된 회귀는 코드 버그가 아니라 "학생별 해석 체인이 끊기는 것"이다.
//   로그인 → 반 → 주교재 → 유닛 → 단어 → 쓰기 방향
// 이 체인 중 한 칸만 어긋나도 그 학생만 조용히 망가지는데, 코드는 정상이라
// 단위 테스트로는 절대 잡히지 않는다. 실제 사고 이력:
//   · 전하은 — 중복 정리 리네임으로 로그인 ID("Haeun")가 사라져 not_found
//   · Song   — current_unit_id가 단어 0개 유닛을 가리켜 "단어 0개"
//   · Dain/문지유 — 엑셀 헤더가 만든 유령 유닛("Unit", 단어 1개)에 배정
//   · Presentation 6 — 주교재 소유 반이 kr2en이라 쓰기가 한 방향 고정
//
// ── 방향 해석은 앱 리졸버를 그대로 재현한다(재구현 아님) ────────────────
// src/utils/wordLibrary.js getStudentSpellingSettings 의 우선순위:
//   ① 주교재(SCA is_primary)의 owner_class 설정
//   ② 홈 반(students.class_id) 설정
//   ③ 안전한 기본값 kr2en  ← mixed로 흡수하지 않는다(2026-08-20 운영자 지시)
// 앱이 이 우선순위를 바꾸면 이 파일도 함께 고쳐야 한다 —
// scripts/testStudentHealthRules.mjs 4절이 그 우선순위를 단언으로 고정한다.
//
// ── 등급 정책 ──────────────────────────────────────────────────────────
// FAIL : 학생이 지금 수업에서 실제로 막히거나 틀린 화면을 보는 상태
// WARN : 값 자체는 유효하나 운영자 판단이 필요한 상태(현재 random 방향)
// PASS : 체인이 끝까지 해석됨
// random을 FAIL로 올릴지는 운영자 미결정 사항이라 임의로 정하지 않고
// WARN으로 노출만 한다(추측 금지 — CLAUDE.md 규칙 18의 정직성 원칙).

export const CHECK_CODES = {
  LOGIN_FAIL: 'LOGIN_FAIL',
  CLASS_INVALID: 'CLASS_INVALID',
  TEXTBOOK_MISSING: 'TEXTBOOK_MISSING',
  UNIT_INVALID: 'UNIT_INVALID',
  WORDS_ZERO: 'WORDS_ZERO',
  ORPHAN_ASSIGNMENT: 'ORPHAN_ASSIGNMENT',
  DUPLICATE: 'DUPLICATE',
  DIRECTION_INVALID: 'DIRECTION_INVALID',
  GHOST_UNIT: 'GHOST_UNIT',
  // 배정 조합 모순(2026-08-28 추가) — 개별 FK 는 전부 유효한데 "조합"이
  // 모순이라 앱이 조용히 엉뚱한 단어를 보여줄 수 있는 상태.
  // 2026-08-27 전하은 사건(주교재가 바뀐 뒤 current_unit 이 옛 교재를
  // 가리켜 앱이 "첫 유닛" 폴백으로 26단어만 보여준 건)과 같은 계열이다.
  // 그 사건 자체는 기존 UNIT_INVALID:교재불일치 가 이미 잡지만, 아래 세
  // 가지는 수정 전 규칙이 전부 PASS 를 주던 사각지대였다(실측 확인).
  ASSIGNMENT_CONFLICT: 'ASSIGNMENT_CONFLICT',
}

// ── 유령 유닛(ghost unit) 판정 ──────────────────────────────────────────
// 엑셀 업로드에서 헤더 행이 데이터로 편입돼 만들어진 가짜 유닛이다. 실제로
// 교재 6개에 이름이 "Unit"이고 단어가 1개뿐인 유닛이 생겼고, 그 1개 단어의
// 정체는 전부 헤더 라벨이었다(커밋 4379a4d — 업로드 파싱은 그때 고쳤지만
// 이미 만들어진 유닛은 "별도 건"으로 남겨졌다).
//
// 라벨 목록은 새로 만들지 않고 앱의 정의를 그대로 옮긴다 —
// src/components/AdminScreen.jsx HEADER_ALIASES / isHeaderLabel.
// 앱이 별칭을 추가하면 여기도 함께 갱신해야 한다.
const HEADER_LABELS = new Set([
  'word', '단어', '영단어', 'word / phrase', 'word/phrase', 'english', '영어·어구', '어휘·어구',
  'meaning', '뜻', '의미', '한글뜻', 'korean',
  'unit', '유닛', '단원',
  'no', '번호',
])

// 실데이터의 "No." 처럼 뒤에 마침표가 붙은 라벨을 정규화한다(앱의
// isHeaderLabel은 trim+lowercase만 하므로 여기서 한 단계 더 관대하게).
const labelKey = (v) => String(v ?? '').trim().toLowerCase().replace(/[.:：]+$/, '')
const isHeaderLabel = (v) => HEADER_LABELS.has(labelKey(v))

// 번호 없는 unit 별칭 이름 — AdminScreen isUnit 정규식이 \d+ 를 요구하도록
// 고쳐진 뒤로는 새로 생기지 않지만, 그 이전에 만들어진 것이 남아 있다.
const BARE_UNIT_NAME = /^(unit|유닛|단원)\s*$/i

// 이 크기를 넘는 유닛은 절대 ghost로 보지 않는다 — 실제 어휘가 우연히
// 헤더 라벨과 같을 수 있기 때문이다("word"="단어"는 진짜 단어다).
// 실측 유령 유닛은 전부 단어 0~1개다.
export const GHOST_MAX_WORDS = 3

/**
 * 이 유닛이 헤더 행 잔재(가짜 유닛)인가. 순수 함수.
 * @returns {{ghost: boolean, reason: string}}
 */
export function isGhostUnit(unit, words) {
  const ws = Array.isArray(words) ? words : []
  if (!unit) return { ghost: false, reason: '' }
  if (ws.length > GHOST_MAX_WORDS) return { ghost: false, reason: '' }
  if (BARE_UNIT_NAME.test(String(unit.name ?? ''))) {
    return { ghost: true, reason: `이름이 번호 없는 유닛 별칭("${unit.name}")` }
  }
  if (ws.length >= 1 && ws.every((w) => isHeaderLabel(w?.word) && isHeaderLabel(w?.meaning))) {
    const sample = ws.map((w) => `"${w.word}"="${w.meaning}"`).join(', ')
    return { ghost: true, reason: `단어가 전부 엑셀 헤더 라벨(${sample})` }
  }
  return { ghost: false, reason: '' }
}

/** 학생 배정과 무관하게 저장소 전체의 유령 유닛을 찾는다(정리 대상 인벤토리). */
export function findGhostUnits(ctx) {
  const out = []
  const unitById = ctx?.unitById || new Map()
  const wordsByUnit = ctx?.wordsByUnit || new Map()
  for (const [id, unit] of unitById) {
    const verdict = isGhostUnit(unit, wordsByUnit.get(id) || [])
    if (verdict.ghost) {
      out.push({ id, name: unit.name, textbookId: unit.textbook_id ?? null,
        wordCount: (wordsByUnit.get(id) || []).length, reason: verdict.reason })
    }
  }
  return out
}

// src/utils/wordLibrary.js VALID_SPELLING_DIRECTIONS 와 동일해야 한다.
export const VALID_DIRECTIONS = new Set(['kr2en', 'en2kr', 'random', 'mixed'])

// src/utils/wordLibrary.js DEFAULT_CLASS_SETTINGS.spellingDirection 과 동일.
export const DEFAULT_DIRECTION = 'kr2en'

// src/utils/accountStatus.js TEST_ACCOUNT_NAMES 와 동일해야 한다.
export const TEST_ACCOUNT_NAMES = ['cookie', 'paul', 'jinaa', 'barry']

// mixed가 한 세션에서 양방향을 내려면 문항이 최소 2개 필요하다.
// entranceTest.js assignDirections: half = floor(n/2) 이므로 n=1이면
// 남는 1개를 rng로 정하는 동전던지기가 되어 방향 혼합이 구조적으로 불가능.
export const MIN_WORDS_FOR_MIXED = 2

const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '')
const rawName = (s) => (typeof s?.name === 'string' ? s.name : '')

/**
 * 조회 결과를 판정용 인덱스로 바꾼다. 순수 함수(입력을 변형하지 않음).
 * @param {{classes?, textbooks?, units?, words?, assignments?, students?}} data
 */
export function buildContext(data) {
  const d = data || {}
  const classes = Array.isArray(d.classes) ? d.classes : []
  const textbooks = Array.isArray(d.textbooks) ? d.textbooks : []
  const units = Array.isArray(d.units) ? d.units : []
  const words = Array.isArray(d.words) ? d.words : []
  const assignments = Array.isArray(d.assignments) ? d.assignments : []
  const students = Array.isArray(d.students) ? d.students : []

  const classById = new Map(classes.map((c) => [c.id, c]))
  const textbookById = new Map(textbooks.map((t) => [t.id, t]))
  const unitById = new Map(units.map((u) => [u.id, u]))

  // 단어 수와 함께 원문(word/meaning)도 유닛별로 모은다 — 유령 유닛 판정에
  // 필요하다. 조회 쪽(studentHealthCheck.mjs)이 word,meaning 을 함께
  // select 하지 않으면 ghost 판정이 조용히 무력화되므로 주의.
  const wordCountByUnit = new Map()
  const wordsByUnit = new Map()
  for (const w of words) {
    if (!w || w.unit_id == null) continue
    wordCountByUnit.set(w.unit_id, (wordCountByUnit.get(w.unit_id) || 0) + 1)
    const list = wordsByUnit.get(w.unit_id) || []
    list.push(w)
    wordsByUnit.set(w.unit_id, list)
  }

  const assignmentsByStudent = new Map()
  for (const a of assignments) {
    if (!a || a.student_id == null) continue
    const list = assignmentsByStudent.get(a.student_id) || []
    list.push(a)
    assignmentsByStudent.set(a.student_id, list)
  }

  // 로그인 후보 수 — 서버(api/verify-student-pin.js)가 name ILIKE 로 후보를
  // 찾으므로, 정규화된 이름이 같은 행이 2개 이상이면 PIN까지 같을 때
  // duplicate_accounts 로 로그인이 막힌다. 그 위험을 미리 센다.
  const nameCounts = new Map()
  for (const s of students) {
    const k = norm(rawName(s))
    if (!k) continue
    nameCounts.set(k, (nameCounts.get(k) || 0) + 1)
  }

  return { classById, textbookById, unitById, wordCountByUnit, wordsByUnit, assignmentsByStudent, nameCounts }
}

/**
 * 계정 종류. src/utils/accountStatus.js 규칙을 재현하되, 조사에서 드러난
 * 갭 하나를 보완한다: 기존 규칙은 학생 "이름"만 보기 때문에 이름이 평범한
 * QA 픽스처(Cksa / QACombo1)가 실학생으로 새어 들어왔다. 소속 반 이름이
 * QA_* 이면 QA_FIXTURE 로 분류해 실학생 집계에서 분리한다.
 * @returns {'REAL'|'ARCHIVED'|'TEST'|'QA_FIXTURE'}
 */
export function classifyAccount(student, ctx) {
  const name = rawName(student)
  if (/_dup|_inactive/i.test(name)) return 'ARCHIVED'
  if (/^(qa_|_qa_)/i.test(name)) return 'TEST'
  if (TEST_ACCOUNT_NAMES.includes(norm(name))) return 'TEST'
  const cls = ctx?.classById?.get(student?.class_id)
  if (cls && /^qa_/i.test(String(cls.name || ''))) return 'QA_FIXTURE'
  return 'REAL'
}

/**
 * 학생 1명의 로그인→반→교재→유닛→단어→방향 체인을 끝까지 해석한다.
 * 절대 throw하지 않는다(운영 도구가 학생 1명 때문에 죽으면 안 됨).
 */
export function evaluateStudent(student, ctx) {
  const checks = []
  const codes = []
  const warnings = []
  const add = (id, label, ok, code, detail) => {
    checks.push({ id, label, ok: !!ok, detail: detail || '' })
    if (!ok && code) codes.push(detail ? `${code}:${detail}` : code)
  }

  const classById = ctx?.classById || new Map()
  const textbookById = ctx?.textbookById || new Map()
  const unitById = ctx?.unitById || new Map()
  const wordCountByUnit = ctx?.wordCountByUnit || new Map()
  const wordsByUnit = ctx?.wordsByUnit || new Map()
  const assignmentsByStudent = ctx?.assignmentsByStudent || new Map()
  const nameCounts = ctx?.nameCounts || new Map()

  // 1) 레코드 존재
  const exists = !!(student && student.id)
  add('record_exists', 'student record 존재', exists, CHECK_CODES.LOGIN_FAIL, exists ? '' : '레코드없음')

  const name = rawName(student)
  const trimmed = name.trim()

  // 2) 로그인 식별자 — students.name 이 곧 로그인 ID다(별도 컬럼 없음).
  //    서버는 입력을 trim 한 뒤 name ILIKE 로 완전일치 조회한다.
  if (!trimmed) {
    add('login_identifier', '로그인 식별자 정상', false, CHECK_CODES.LOGIN_FAIL, '빈이름')
  } else if (name !== trimmed) {
    // DB값에 앞뒤 공백이 있으면 학생이 정확히 입력해도 trim 후 불일치.
    add('login_identifier', '로그인 식별자 정상', false, CHECK_CODES.LOGIN_FAIL, '앞뒤공백')
  } else if (/[%_]/.test(trimmed) || trimmed.indexOf(String.fromCharCode(92)) >= 0) {
    // %, _, 역슬래시는 ILIKE 메타문자 — 서버가 이스케이프하므로 로그인은
    // 되지만 이름 자체가 위험 신호이고 관리자 검색/집계를 흔든다.
    add('login_identifier', '로그인 식별자 정상', false, CHECK_CODES.LOGIN_FAIL, 'ilike메타문자')
  } else {
    add('login_identifier', '로그인 식별자 정상', true)
  }

  // 3) 계정 활성 — is_active/archived/is_test 컬럼이 DB에 없어서 이름/반
  //    관례가 유일한 판정 근거다(구조적 취약점, 보고서에 명시).
  const accountType = classifyAccount(student, ctx)
  add('account_active', '활성 계정 분류', true, null, accountType)

  // 13) 중복 활성 계정
  const dupCount = nameCounts.get(norm(trimmed)) || 0
  add('no_duplicate_active', '동명 중복 계정 없음', dupCount <= 1,
    CHECK_CODES.DUPLICATE, dupCount > 1 ? `동명 ${dupCount}건` : '')

  // 4~5) 홈 반
  const homeClass = classById.get(student?.class_id) || null
  add('class_id_present', 'class_id 존재', !!student?.class_id, CHECK_CODES.CLASS_INVALID,
    student?.class_id ? '' : '없음')
  add('class_exists', '반 레코드 존재', !student?.class_id || !!homeClass,
    CHECK_CODES.CLASS_INVALID, student?.class_id && !homeClass ? 'orphan' : '')

  // 12) 배정 고아 — primary/비-primary 전부 확인
  const myAssignments = assignmentsByStudent.get(student?.id) || []
  const orphanDetails = []
  for (const a of myAssignments) {
    if (a?.textbook_id && !textbookById.has(a.textbook_id)) orphanDetails.push('교재')
    if (a?.class_id && !classById.has(a.class_id)) orphanDetails.push('반')
  }
  add('no_orphan_assignment', '배정 고아 없음', orphanDetails.length === 0,
    CHECK_CODES.ORPHAN_ASSIGNMENT, orphanDetails.length ? [...new Set(orphanDetails)].join('/') : '')

  // 12-b) 배정 조합 모순(2026-08-28) — 개별 FK 는 멀쩡한데 조합이 모순이라
  //       앱이 "조용히" 다른 교재/유닛의 단어를 보여줄 수 있는 상태들.
  //
  //   ① primary 2개 이상
  //      앱(wordLibrary.js getStudentAssignments)은 is_primary DESC 로 정렬한
  //      뒤 앞의 행을 주교재로 쓴다. primary 가 둘이면 동률이라 DB 가 주는
  //      순서에 따라 주교재가 갈리고, 같은 학생이 새로고침할 때마다 다른
  //      교재의 단어를 볼 수 있다. 아래 헬스체크 자신도 .find() 로 첫 행만
  //      집기 때문에 이 상태를 표시하지 않으면 검사기까지 임의의 한쪽만
  //      보고 PASS 를 준다(실측: 수정 전 PASS).
  //
  //   ② SCA 행의 current_unit 이 그 행의 교재 소속이 아님
  //      학생이 그 교재로 전환하는 순간 전하은 사건과 똑같은 상태가 된다.
  //      기존 unit_belongs_to_textbook 은 students.current_unit_id(=지금
  //      쓰는 교재)만 보므로, 아직 전환하지 않은 보조 교재 행의 지뢰는
  //      전환 전까지 보이지 않는다 — 터지기 전에 잡는 것이 목적이다.
  //
  //   ③ 같은 교재에 SCA 행이 2개 이상
  //      교재 배정 해제/재배정이 겹칠 때 생길 수 있고, 어느 행의
  //      current_unit 이 이기는지가 불확정이 된다.
  //
  //   셋 다 2026-08-28 라이브 실측에서는 0건이다(SCA 482행 전수 확인) —
  //   즉 지금 있는 문제를 덮는 규칙이 아니라 재발 탐지용 안전망이다.
  const conflicts = []
  const primaryRows = myAssignments.filter((a) => a?.is_primary)
  if (primaryRows.length > 1) conflicts.push(`primary${primaryRows.length}개`)
  for (const a of myAssignments) {
    if (!a?.current_unit_id || !a?.textbook_id) continue
    const rowUnit = unitById.get(a.current_unit_id)
    if (rowUnit && rowUnit.textbook_id !== a.textbook_id) conflicts.push('배정행유닛불일치')
  }
  const tbCounts = new Map()
  for (const a of myAssignments) {
    if (!a?.textbook_id) continue
    tbCounts.set(a.textbook_id, (tbCounts.get(a.textbook_id) || 0) + 1)
  }
  if ([...tbCounts.values()].some((n) => n > 1)) conflicts.push('같은교재중복배정')
  add('no_assignment_conflict', '배정 조합 모순 없음', conflicts.length === 0,
    CHECK_CODES.ASSIGNMENT_CONFLICT, conflicts.length ? [...new Set(conflicts)].join('/') : '')

  // 6~7) 주교재
  const primary = myAssignments.find((a) => a?.is_primary) || null
  const textbook = primary?.textbook_id ? textbookById.get(primary.textbook_id) || null : null
  add('primary_assignment_exists', '주교재 배정 존재', !!primary,
    CHECK_CODES.TEXTBOOK_MISSING, primary ? '' : 'primary없음')
  add('primary_textbook_valid', '주교재 레코드 유효',
    !primary || !primary.textbook_id || !!textbook,
    CHECK_CODES.TEXTBOOK_MISSING, primary?.textbook_id && !textbook ? 'orphan' : '')

  // 8) 교재 소유 반 — 쓰기 방향을 실제로 결정하는 주체
  const ownerClass = textbook?.owner_class_id ? classById.get(textbook.owner_class_id) || null : null
  add('textbook_owner_class_valid', '교재 소유 반 유효',
    !textbook || !textbook.owner_class_id || !!ownerClass,
    CHECK_CODES.CLASS_INVALID, textbook?.owner_class_id && !ownerClass ? '교재소유반orphan' : '')

  // 9~11) 현재 유닛
  const unit = student?.current_unit_id ? unitById.get(student.current_unit_id) || null : null
  add('current_unit_present', 'current_unit_id 존재', !!student?.current_unit_id,
    CHECK_CODES.UNIT_INVALID, student?.current_unit_id ? '' : '없음')
  add('current_unit_exists', '유닛 레코드 존재', !student?.current_unit_id || !!unit,
    CHECK_CODES.UNIT_INVALID, student?.current_unit_id && !unit ? 'orphan' : '')
  const unitBelongs = !unit || !textbook || unit.textbook_id === textbook.id
  add('unit_belongs_to_textbook', '유닛이 현재 주교재 소속', unitBelongs,
    CHECK_CODES.UNIT_INVALID, unitBelongs ? '' : '교재불일치')

  const unitResolved = !!unit && unitBelongs
  const wordCount = unit ? (wordCountByUnit.get(unit.id) || 0) : 0
  add('unit_word_count', '유닛 단어 1개 이상', !unit || wordCount > 0,
    CHECK_CODES.WORDS_ZERO, unit && wordCount === 0 ? '단어0개' : '')

  // 유령 유닛 — 단어가 1개라도 "있으면" WORDS_ZERO에 걸리지 않고, 방향이
  // kr2en이면 DIRECTION_INVALID에도 안 걸린다. 그 조합에서 학생이 엑셀
  // 헤더 라벨을 단어라고 공부하는데 헬스체크가 PASS를 주던 결함을 막는다.
  const ghost = unit ? isGhostUnit(unit, wordsByUnit.get(unit.id) || []) : { ghost: false, reason: '' }
  add('unit_not_ghost', '유닛이 헤더 행 잔재가 아님', !ghost.ghost,
    CHECK_CODES.GHOST_UNIT, ghost.ghost ? ghost.reason : '')

  // 14~16) 쓰기 방향 — 앱 리졸버 우선순위 그대로
  const directionClass = ownerClass || homeClass || null
  const rawDirection = directionClass?.spelling_direction
  const direction = VALID_DIRECTIONS.has(rawDirection) ? rawDirection : DEFAULT_DIRECTION
  add('direction_resolvable', '쓰기 방향 해석 가능', true, null,
    directionClass ? `${ownerClass ? '교재소유반' : '홈반'}` : '기본값폴백')
  const dirValueOk = !directionClass || VALID_DIRECTIONS.has(rawDirection)
  add('direction_valid_value', '방향 값이 허용값', dirValueOk,
    CHECK_CODES.DIRECTION_INVALID, dirValueOk ? '' : `허용외값(${rawDirection})`)

  // mixed 양방향 가능 여부는 유닛이 정상 해석된 경우에만 판정한다
  // (유닛이 깨진 학생에게 같은 원인으로 두 코드가 중복 보고되는 것 방지).
  if (direction === 'mixed' && unitResolved) {
    const bidirectional = wordCount >= MIN_WORDS_FOR_MIXED
    add('mixed_bidirectional', 'mixed 양방향 생성 가능', bidirectional,
      CHECK_CODES.DIRECTION_INVALID,
      bidirectional ? '' : `mixed인데 단어 ${wordCount}개(양방향 불가)`)
  } else {
    add('mixed_bidirectional', 'mixed 양방향 생성 가능', true, null,
      direction === 'mixed' ? '유닛 미해석으로 판정보류' : '해당없음')
  }

  // random 은 유효값이지만 문항마다 독립 추첨이라 총량 균형을 보장하지
  // 않는다(20문제가 한 방향으로 쏠릴 수 있음). 운영자 결정 전까지 WARN.
  if (dirValueOk && rawDirection === 'random') {
    warnings.push(`DIRECTION_RANDOM:${directionClass?.name || '?'} — 총량 균형 미보장`)
  }

  // 17) 체인 end-to-end
  const chainOk = codes.length === 0
  add('chain_end_to_end', '로그인→반→교재→유닛→단어→방향 전체 해석', chainOk)

  const status = codes.length ? 'FAIL' : (warnings.length ? 'WARN' : 'PASS')
  return {
    studentId: student?.id ?? null,
    name: trimmed || '(이름없음)',
    accountType,
    status,
    codes,
    warnings,
    checks,
    resolved: {
      homeClassName: homeClass?.name || null,
      textbookName: textbook?.name || null,
      unitName: unit?.name ?? null,
      wordCount,
      direction,
      directionClassName: directionClass?.name || null,
      directionSource: ownerClass ? 'textbook_owner_class' : (homeClass ? 'home_class' : 'default'),
    },
  }
}

/** 결과 배열 집계. ok=false면 게이트 실패(exit != 0). */
export function summarize(results) {
  const list = Array.isArray(results) ? results : []
  const byCode = {}
  let pass = 0
  let warn = 0
  let fail = 0
  for (const r of list) {
    if (r?.status === 'FAIL') fail++
    else if (r?.status === 'WARN') warn++
    else pass++
    for (const c of (r?.codes || [])) {
      const key = String(c).split(':')[0]
      byCode[key] = (byCode[key] || 0) + 1
    }
  }
  return { total: list.length, pass, warn, fail, byCode, ok: fail === 0 }
}
