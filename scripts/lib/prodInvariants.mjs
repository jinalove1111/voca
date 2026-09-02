// Production Safety Harness — 크로스 테이블 불변식 검사 (2026-09-03, Phase 1-A)
// 2026-09-03 Phase 8 확장: SCA/유닛 텍스트북 정합성, primary 카디널리티,
// class_id 모순, impact/recommended 메타데이터 추가.
//
// 순수 함수 모듈이다: 네트워크/DB/파일 접근이 없고, 같은 입력이면 항상 같은
// 결과다(결정론). 라이브 조회는 scripts/lib/prodDataLoader.mjs, 학생별
// 로그인→반→교재→유닛→단어→방향 체인 판정은 scripts/lib/studentHealthRules.mjs
// 가 담당한다 — 이 모듈은 그 둘이 보지 않는 "여러 학생/여러 유닛에 걸친
// 정합성"만 본다(학생 1명 관점이 아니라 저장소 전체 관점).
//
// 예: 2026-09-02 유령 유닛 착륙 사고 — students.current_unit_id 는 유령을
// 가리키는데 student_class_assignments 의 같은 학생 다른 행은 정상이거나,
// 반대로 primary SCA 행과 students.current_unit_id 가 서로 다른 유닛을
// 가리키는 것처럼, "한 학생의 여러 레코드 사이" 불일치는 studentHealthRules
// 의 evaluateStudent(학생 1명 관점)만으로는 전부 잡히지 않는다.
//
// 유령 유닛 판정은 studentHealthRules.mjs 의 isGhostUnit/findGhostUnits 를
// 그대로 재사용한다(재구현 금지 — CLAUDE.md 규칙 3).
import { buildContext, classifyAccount, isGhostUnit, findGhostUnits } from './studentHealthRules.mjs'

export const INVARIANT_CODES = {
  STUDENT_UNIT_ORPHAN: 'STUDENT_UNIT_ORPHAN',
  SCA_UNIT_ORPHAN: 'SCA_UNIT_ORPHAN',
  STUDENT_GHOST_UNIT: 'STUDENT_GHOST_UNIT',
  SCA_GHOST_UNIT: 'SCA_GHOST_UNIT',
  UNIT_NAME_MISMATCH: 'UNIT_NAME_MISMATCH',
  PRIMARY_UNIT_MISMATCH: 'PRIMARY_UNIT_MISMATCH',
  PRIMARY_TEXTBOOK_MISMATCH: 'PRIMARY_TEXTBOOK_MISMATCH',
  UNIT_WORDS_ABNORMAL: 'UNIT_WORDS_ABNORMAL',
  GHOST_UNIT_PRESENT: 'GHOST_UNIT_PRESENT',
  // ── Phase 8 확장(2026-09-03) ──
  STUDENT_TEXTBOOK_MISMATCH: 'STUDENT_TEXTBOOK_MISMATCH',
  SCA_TEXTBOOK_ORPHAN: 'SCA_TEXTBOOK_ORPHAN',
  SCA_UNIT_TEXTBOOK_MISMATCH: 'SCA_UNIT_TEXTBOOK_MISMATCH',
  MULTIPLE_PRIMARY: 'MULTIPLE_PRIMARY',
  NO_PRIMARY: 'NO_PRIMARY',
  UNIT_TEXTBOOK_ORPHAN: 'UNIT_TEXTBOOK_ORPHAN',
  UNIT_NAME_ABNORMAL: 'UNIT_NAME_ABNORMAL',
  CLASS_ASSIGNMENT_CONTRADICTION: 'CLASS_ASSIGNMENT_CONTRADICTION',
  // Phase 8b(2026-09-03, 코디네이터 정정) — class_type='textbook' 컨테이너 반 대응
  STUDENT_CLASS_IS_CONTAINER: 'STUDENT_CLASS_IS_CONTAINER',
}

// 정상 유닛의 단어 수 범위. 이 범위를 벗어나면 데이터 이상 신호로 본다.
// 1개 이하는 유령 유닛/미업로드와 겹치는 신호, 100개 초과는 엑셀 업로드
// 사고(여러 유닛이 한 유닛으로 합쳐짐 등)로 실제 발생한 적 있는 패턴이다.
export const UNIT_WORDS_MIN = 2
export const UNIT_WORDS_MAX = 100

// 유닛 이름이 비정상으로 취급되는 최대 길이. 30자를 넘는 이름은 엑셀 셀
// 통째(문장/설명문)가 유닛명으로 잘못 들어간 정황일 확률이 높다.
export const UNIT_NAME_MAX_LEN = 30

// scripts/lib/studentHealthRules.mjs BARE_UNIT_NAME 의 미러. 그 모듈은 이
// 트랙의 소유가 아니라(파일 소유권, CLAUDE.md 규칙 16) export 를 추가할 수
// 없어 정규식 값만 복제한다 — 원본이 바뀌면 이 상수도 함께 갱신해야 한다.
const BARE_UNIT_NAME_MIRROR = /^(unit|유닛|단원)\s*$/i

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

// ── 코드 → 한국어 설명/영향/권장 조치 ────────────────────────────────────
// impact: 학생이 겪을 증상(사람용 출력 "Critical"/"Needs review" 줄에 그대로
//         쓰인다).
// recommended: 'READ-ONLY 조사' | '운영자 결정' | '코드 과제' 중 하나 —
//         자동 수정 코드는 이 모듈 어디에도 없다(절대 금지).
export const CODE_META = {
  STUDENT_UNIT_ORPHAN: {
    impact: '현재 유닛이 삭제되어 학습 화면 진입이 실패할 수 있음',
    recommended: '운영자 결정',
  },
  SCA_UNIT_ORPHAN: {
    impact: '배정 행이 삭제된 유닛을 가리켜 해당 교재로 전환 시 실패할 수 있음',
    recommended: '운영자 결정',
  },
  STUDENT_GHOST_UNIT: {
    impact: '학생이 엑셀 헤더 잔재를 단어로 학습하게 됨',
    recommended: '운영자 결정',
  },
  SCA_GHOST_UNIT: {
    impact: '지금 당장은 아니지만 이 배정으로 전환하는 순간 유령 단어를 보게 됨',
    recommended: '운영자 결정',
  },
  UNIT_NAME_MISMATCH: {
    impact: '레거시 표시 이름과 실제 유닛이 달라 관리자 화면에서 혼동될 수 있음',
    recommended: 'READ-ONLY 조사',
  },
  PRIMARY_UNIT_MISMATCH: {
    impact: '주교재 배정 유닛과 현재 학습 유닛이 달라 학생이 보는 단어가 예상과 다를 수 있음',
    recommended: '운영자 결정',
  },
  PRIMARY_TEXTBOOK_MISMATCH: {
    impact: '현재 유닛의 교재가 주교재 배정과 달라 반 전환 시 단어가 섞일 수 있음',
    recommended: '운영자 결정',
  },
  UNIT_WORDS_ABNORMAL: {
    impact: '단어 수가 비정상 범위라 업로드 사고(누락/중복 합침) 가능성이 있음',
    recommended: 'READ-ONLY 조사',
  },
  GHOST_UNIT_PRESENT: {
    impact: '유령 유닛이 저장소에 남아있어 향후 새 배정 시 재발할 위험이 있음',
    recommended: '운영자 결정',
  },
  STUDENT_TEXTBOOK_MISMATCH: {
    impact: '현재 유닛의 교재가 이 학생의 어떤 배정 교재에도 속하지 않음 — 반 이동 처리 누락 가능성',
    recommended: 'READ-ONLY 조사',
  },
  SCA_TEXTBOOK_ORPHAN: {
    impact: '배정 행이 삭제된 교재를 가리켜 교재 정보 조회가 실패할 수 있음',
    recommended: '운영자 결정',
  },
  SCA_UNIT_TEXTBOOK_MISMATCH: {
    impact: '배정 행의 유닛이 그 행의 교재 소속이 아니라 전환 시 엉뚱한 단어를 보여줄 수 있음',
    recommended: 'READ-ONLY 조사',
  },
  MULTIPLE_PRIMARY: {
    impact: '주교재가 2개 이상이라 새로고침마다 다른 교재의 단어를 볼 수 있음',
    recommended: '운영자 결정',
  },
  NO_PRIMARY: {
    impact: '배정은 있지만 주교재가 없어 주교재 의존 로직(방향 해석 등)이 홈 반으로만 폴백함',
    recommended: '운영자 결정',
  },
  UNIT_TEXTBOOK_ORPHAN: {
    impact: '유닛이 삭제된 교재를 가리켜 교재 정보 조회가 실패할 수 있음',
    recommended: '운영자 결정',
  },
  UNIT_NAME_ABNORMAL: {
    impact: '유닛 이름이 비정상(빈 값/번호 없는 별칭/과도한 길이)이라 관리자 화면에서 식별이 어려움',
    recommended: 'READ-ONLY 조사',
  },
  CLASS_ASSIGNMENT_CONTRADICTION: {
    impact: '학생의 홈 반과 배정 기록이 서로 달라 반 이동 처리가 누락됐을 가능성',
    recommended: 'READ-ONLY 조사',
  },
  STUDENT_CLASS_IS_CONTAINER: {
    impact: '학생의 홈 반이 교재 컨테이너(class_type=textbook)로 잘못 설정되어 반 관련 로직이 예상과 다르게 동작할 수 있음',
    recommended: '운영자 결정',
  },
}

/**
 * studentHealthRules.buildContext() 결과에 evaluateInvariants 가 필요로
 * 하는 원본 배열(students/assignments)을 더한 컨텍스트를 만든다.
 * evaluateInvariants(ctx, opts) 의 ctx 는 이 함수의 반환값(또는 동일한
 * shape)이어야 한다 — buildContext() 만으로는 원본 students/assignments
 * 배열이 없어(맵으로만 인덱싱됨) 학생 단위 순회가 불가능하다.
 * @param {object} data loadProductionSnapshot() 또는 픽스처의 { data } 와 동일한 형태
 */
export function buildInvariantContext(data) {
  const base = buildContext(data)
  return {
    ...base,
    students: Array.isArray(data?.students) ? data.students : [],
    assignments: Array.isArray(data?.assignments) ? data.assignments : [],
  }
}

/**
 * 저장소 전체 관점의 불변식을 검사한다. 절대 throw하지 않는다.
 * @param {ReturnType<typeof buildInvariantContext>} ctx
 * @param {{ghostUnitIds?: Iterable<string>}} [opts]
 *   ghostUnitIds — isGhostUnit() 판정과 별개로 유령으로 취급할 유닛 id 목록
 *   (회귀 픽스처 전용, STUDENT_GHOST_UNIT/SCA_GHOST_UNIT 두 검사에만 적용).
 * @returns {{findings: Array<{code:string,severity:'FAIL'|'WARN',studentId:string|null,studentName:string|null,detail:string,refs:object,impact:string,recommended:string}>, summary:{fail:number,warn:number,pass:number,checked:number}}}
 */
export function evaluateInvariants(ctx, opts = {}) {
  const unitById = ctx?.unitById || new Map()
  const textbookById = ctx?.textbookById || new Map()
  const classById = ctx?.classById || new Map()
  const wordsByUnit = ctx?.wordsByUnit || new Map()
  const wordCountByUnit = ctx?.wordCountByUnit || new Map()
  const students = Array.isArray(ctx?.students) ? ctx.students : []
  const rawFindings = []

  // Phase 8b(2026-09-03, 코디네이터 정정) — classes.class_type==='textbook' 인
  // 반은 "교재 컨테이너"이고 실제 사람이 소속되는 반이 아니다(반≠교재 설계 —
  // textbooks.owner_class_id 가 컨테이너를 소유하고, student_class_assignments.
  // class_id 가 정상적으로 컨테이너를 가리킨다). class_type 이 없거나(null/
  // 미상) 'textbook' 이 아니면 사람 반으로 취급한다(과거 데이터/미마이그레이션
  // 대비 — 규칙 4는 "기존처럼 취급"이라 미상을 컨테이너로 보지 않는다).
  const isContainerClass = (classId) => classById.get(classId)?.class_type === 'textbook'

  // impact/recommended 는 코드에서 파생되므로 push 시점에 자동으로 붙인다
  // (호출부마다 반복 기입하지 않게 — 누락 방지).
  const push = (f) => {
    const meta = CODE_META[f.code] || {}
    rawFindings.push({ ...f, impact: meta.impact || '', recommended: meta.recommended || 'READ-ONLY 조사' })
  }

  const ghostIdSet = new Set(opts?.ghostUnitIds || [])
  const isGhostId = (unitId) => {
    if (!unitId) return false
    if (ghostIdSet.has(unitId)) return true
    const unit = unitById.get(unitId)
    if (!unit) return false
    return isGhostUnit(unit, wordsByUnit.get(unitId) || []).ghost
  }

  const realStudents = students.filter((s) => s && classifyAccount(s, ctx) === 'REAL')

  // 유닛 단어 수 이상 검사(체크 8)를 위해 실학생이 참조하는 유닛 id 를 모은다.
  const referencedUnitIds = new Set()
  // 유령 유닛 인벤토리(체크 9)의 "참조 실학생 수"를 위한 역인덱스.
  const realStudentsByUnitId = new Map()
  const addReference = (unitId, studentId) => {
    if (!unitId) return
    referencedUnitIds.add(unitId)
    const set = realStudentsByUnitId.get(unitId) || new Set()
    set.add(studentId)
    realStudentsByUnitId.set(unitId, set)
  }

  for (const student of realStudents) {
    const sid = student.id
    const sname = typeof student.name === 'string' ? student.name : null
    const myAssignments = (ctx?.assignmentsByStudent || new Map()).get(sid) || []
    const primary = myAssignments.find((a) => a?.is_primary) || null

    // Phase 8: MULTIPLE_PRIMARY / NO_PRIMARY — primary 카디널리티
    const primaryRows = myAssignments.filter((a) => a?.is_primary)
    if (primaryRows.length > 1) {
      push({
        code: INVARIANT_CODES.MULTIPLE_PRIMARY, severity: 'FAIL', studentId: sid, studentName: sname,
        detail: `주교재(is_primary=true) 배정이 ${primaryRows.length}개 — 어느 쪽이 이길지 DB 반환 순서에 좌우됨`,
        refs: { primaryTextbookIds: primaryRows.map((a) => a?.textbook_id ?? null) },
      })
    } else if (myAssignments.length > 0 && primaryRows.length === 0) {
      push({
        code: INVARIANT_CODES.NO_PRIMARY, severity: 'WARN', studentId: sid, studentName: sname,
        detail: `배정 ${myAssignments.length}건은 있으나 주교재(is_primary=true)가 없음`,
        refs: { assignmentCount: myAssignments.length },
      })
    }

    // Phase 8b(2026-09-03, 코디네이터 정정) — STUDENT_CLASS_IS_CONTAINER
    // students.class_id 자체가 교재 컨테이너를 가리키면(사람 반이 컨테이너로
    // 잘못 설정됨) 별도로 보고한다. CLASS_ASSIGNMENT_CONTRADICTION 과는 독립
    // 신호다(그쪽은 배정 기록과의 불일치, 이쪽은 students.class_id 값 자체의
    // 타당성).
    if (student.class_id && isContainerClass(student.class_id)) {
      const containerCls = classById.get(student.class_id)
      push({
        code: INVARIANT_CODES.STUDENT_CLASS_IS_CONTAINER, severity: 'WARN', studentId: sid, studentName: sname,
        detail: `students.class_id(${student.class_id})가 교재 컨테이너 반 "${containerCls?.name || '?'}"(class_type=textbook)을 가리킴 — 사람 반이 아님`,
        refs: { classId: student.class_id, className: containerCls?.name ?? null },
      })
    }

    // Phase 8b(2026-09-03, 코디네이터 정정) — CLASS_ASSIGNMENT_CONTRADICTION
    // 최초 구현은 SCA.class_id 가 교재 컨테이너를 가리키는 정상 배정까지
    // "모순"으로 오탐했다(라이브 실측 19건 전부 컨테이너 SCA를 가진 정상
    // 학생 — 코디네이터가 프로덕션 읽기 전용 조회로 확인 후 정정 지시).
    // 컨테이너 반을 가리키는 SCA 는 이 비교에서 제외하고, 남은 "사람 반"
    // 배정 중 students.class_id 와 일치하는 것이 하나도 없을 때만 모순으로
    // 본다(이동 이력 오판 방지 — 과거 반 SCA 가 남아있으면 일치로 인정).
    const regularAssignments = myAssignments.filter((a) => a?.class_id && !isContainerClass(a.class_id))
    if (student.class_id && regularAssignments.length > 0
      && !regularAssignments.some((a) => a.class_id === student.class_id)) {
      const createdDates = regularAssignments.map((a) => a?.created_at).filter(Boolean).sort()
      const earliest = createdDates[0] || null
      const latest = createdDates[createdDates.length - 1] || null
      const refClassIds = [...new Set(regularAssignments.map((a) => a.class_id))]
      const unknownTypeNote = regularAssignments.some((a) => classById.get(a.class_id)?.class_type == null)
        ? '(일부 class_type 미상)' : ''
      push({
        code: INVARIANT_CODES.CLASS_ASSIGNMENT_CONTRADICTION, severity: 'WARN', studentId: sid, studentName: sname,
        detail: `students.class_id(${student.class_id})와 일치하는 배정 반이 없음 — 배정된 반: ${refClassIds.join(', ')}${unknownTypeNote}`
          + (earliest || latest ? ` — SCA 배정일 최초 ${earliest || '?'} ~ 최신 ${latest || '?'}` : ''),
        refs: { studentClassId: student.class_id, referencedClassIds: refClassIds, earliestAssignmentAt: earliest, latestAssignmentAt: latest },
      })
    }

    // 1) STUDENT_UNIT_ORPHAN — students.current_unit_id 가 units 에 없음
    if (student.current_unit_id) {
      addReference(student.current_unit_id, sid)
      const unit = unitById.get(student.current_unit_id) || null
      if (!unit) {
        push({
          code: INVARIANT_CODES.STUDENT_UNIT_ORPHAN, severity: 'FAIL', studentId: sid, studentName: sname,
          detail: `students.current_unit_id(${student.current_unit_id})가 units 에 존재하지 않음`,
          refs: { unitId: student.current_unit_id },
        })
      }
    }

    // 2/4) SCA 행 순회 — 배정 행이 가리키는 교재/유닛의 고아·모순·유령 여부
    for (const a of myAssignments) {
      // Phase 8: SCA_TEXTBOOK_ORPHAN — uid 유무와 무관하게 textbook_id 자체의
      // 유효성을 본다(유닛이 없는 행도 textbook_id 는 있을 수 있음).
      if (a?.textbook_id && !textbookById.has(a.textbook_id)) {
        push({
          code: INVARIANT_CODES.SCA_TEXTBOOK_ORPHAN, severity: 'FAIL', studentId: sid, studentName: sname,
          detail: `student_class_assignments.textbook_id(${a.textbook_id})가 textbooks 에 존재하지 않음`
            + `${a?.is_primary ? '(primary)' : ''}`,
          refs: { textbookId: a.textbook_id, isPrimary: !!a?.is_primary },
        })
      }

      const uid = a?.current_unit_id
      if (!uid) continue
      addReference(uid, sid)
      const rowUnit = unitById.get(uid) || null
      if (!rowUnit) {
        push({
          code: INVARIANT_CODES.SCA_UNIT_ORPHAN, severity: 'FAIL', studentId: sid, studentName: sname,
          detail: `student_class_assignments.current_unit_id(${uid})가 units 에 존재하지 않음`
            + `${a?.is_primary ? '(primary)' : ''}`,
          refs: { unitId: uid, textbookId: a?.textbook_id ?? null, classId: a?.class_id ?? null, isPrimary: !!a?.is_primary },
        })
        continue // orphan 이면 유령/교재정합성 판정 불가 — 아래로 진행하지 않는다
      }

      // Phase 8: SCA_UNIT_TEXTBOOK_MISMATCH — 배정 행의 유닛이 그 행의
      // 교재 소속이 아님(둘 다 non-null 일 때만).
      if (a?.textbook_id && textbookById.has(a.textbook_id) && rowUnit.textbook_id && rowUnit.textbook_id !== a.textbook_id) {
        push({
          code: INVARIANT_CODES.SCA_UNIT_TEXTBOOK_MISMATCH, severity: 'WARN', studentId: sid, studentName: sname,
          detail: `배정 행의 유닛 "${rowUnit.name}"(교재 ${rowUnit.textbook_id})이 그 행의 교재(${a.textbook_id})와 다름`
            + `${a?.is_primary ? '(primary)' : ''}`,
          refs: { unitId: uid, unitTextbookId: rowUnit.textbook_id, rowTextbookId: a.textbook_id, isPrimary: !!a?.is_primary },
        })
      }

      // 자기 자신이 지금 쓰는 유닛(=students.current_unit_id)이면 아래 3)
      // STUDENT_GHOST_UNIT 이 이미 보고하므로 여기서는 제외한다(같은 원인
      // 중복 보고 방지 — studentHealthRules.mjs 12-c 주석과 동일 원칙).
      if (uid !== student.current_unit_id && isGhostId(uid)) {
        const tb = a?.textbook_id ? textbookById.get(a.textbook_id) : null
        push({
          code: INVARIANT_CODES.SCA_GHOST_UNIT, severity: 'WARN', studentId: sid, studentName: sname,
          detail: `배정 행(${tb?.name || a?.textbook_id || '?'}${a?.is_primary ? ', primary' : ', 비-primary'})이 `
            + `유령 유닛 "${rowUnit.name}"을 가리킴`,
          refs: { unitId: uid, textbookId: a?.textbook_id ?? null, isPrimary: !!a?.is_primary },
        })
      }
    }

    if (student.current_unit_id) {
      const unit = unitById.get(student.current_unit_id) || null
      // 3) STUDENT_GHOST_UNIT
      if (unit && isGhostId(student.current_unit_id)) {
        const verdict = isGhostUnit(unit, wordsByUnit.get(student.current_unit_id) || [])
        push({
          code: INVARIANT_CODES.STUDENT_GHOST_UNIT, severity: 'FAIL', studentId: sid, studentName: sname,
          detail: `현재 유닛 "${unit.name}"이 유령 유닛(${verdict.reason || '판정 근거 없음(회귀 픽스처 opts)'})`,
          refs: { unitId: student.current_unit_id, textbookId: unit.textbook_id ?? null },
        })
      }

      // 5) UNIT_NAME_MISMATCH — unit_name(레거시 문자열)이 있고, 유닛도
      //    정상 존재할 때만 비교한다(고아 유닛은 STUDENT_UNIT_ORPHAN 담당).
      if (unit && typeof student.unit_name === 'string' && student.unit_name.trim()
        && norm(student.unit_name) !== norm(unit.name)) {
        push({
          code: INVARIANT_CODES.UNIT_NAME_MISMATCH, severity: 'WARN', studentId: sid, studentName: sname,
          detail: `students.unit_name("${student.unit_name}") != units.name("${unit.name}")`,
          refs: { unitId: student.current_unit_id, expectedName: unit.name, studentUnitName: student.unit_name },
        })
      }

      // 7) PRIMARY_TEXTBOOK_MISMATCH — 현재 유닛의 교재와 주교재가 다름
      if (unit && unit.textbook_id && primary?.textbook_id && unit.textbook_id !== primary.textbook_id) {
        push({
          code: INVARIANT_CODES.PRIMARY_TEXTBOOK_MISMATCH, severity: 'WARN', studentId: sid, studentName: sname,
          detail: `현재 유닛 "${unit.name}"의 교재(${unit.textbook_id})가 주교재 배정(${primary.textbook_id})과 다름`,
          refs: { unitId: unit.id, unitTextbookId: unit.textbook_id, primaryTextbookId: primary.textbook_id },
        })
      }

      // Phase 8: STUDENT_TEXTBOOK_MISMATCH — 현재 유닛의 교재가 이 학생의
      // 어떤 SCA.textbook_id 에도 없음(primary 만이 아니라 전체 SCA 기준 —
      // 이동 학생이 아직 primary 를 전환하지 않았을 뿐일 수 있어 primary
      // 하나만 보면 오판한다). SCA 행이 아예 없는 상태(마이그레이션 미실행/
      // 폴백)에서는 판단 근거가 없으므로 건너뛴다.
      if (unit && unit.textbook_id && myAssignments.length > 0
        && !myAssignments.some((a) => a?.textbook_id === unit.textbook_id)) {
        push({
          code: INVARIANT_CODES.STUDENT_TEXTBOOK_MISMATCH, severity: 'WARN', studentId: sid, studentName: sname,
          detail: `현재 유닛 "${unit.name}"의 교재(${unit.textbook_id})가 이 학생의 배정(SCA) ${myAssignments.length}건 중 어디에도 없음`,
          refs: { unitId: unit.id, unitTextbookId: unit.textbook_id, assignmentTextbookIds: myAssignments.map((a) => a?.textbook_id ?? null) },
        })
      }
    }

    // 6) PRIMARY_UNIT_MISMATCH — primary SCA 의 유닛과 students.current_unit_id 가 다름
    if (primary?.current_unit_id && student.current_unit_id
      && primary.current_unit_id !== student.current_unit_id) {
      push({
        code: INVARIANT_CODES.PRIMARY_UNIT_MISMATCH, severity: 'WARN', studentId: sid, studentName: sname,
        detail: `primary 배정 유닛(${primary.current_unit_id})이 students.current_unit_id(${student.current_unit_id})와 다름`,
        refs: { studentUnitId: student.current_unit_id, primaryUnitId: primary.current_unit_id, textbookId: primary.textbook_id ?? null },
      })
    }
  }

  // 8) UNIT_WORDS_ABNORMAL — 실학생이 참조하는 유닛(존재하는 것만) 중 단어
  //    수가 비정상인 것. 유닛 단위 검사라 studentId 는 null.
  for (const unitId of referencedUnitIds) {
    const unit = unitById.get(unitId)
    if (!unit) continue // 고아는 위에서 이미 FAIL 로 보고됨
    const wordCount = wordCountByUnit.get(unitId) || 0
    if (wordCount < UNIT_WORDS_MIN || wordCount > UNIT_WORDS_MAX) {
      push({
        code: INVARIANT_CODES.UNIT_WORDS_ABNORMAL, severity: 'WARN', studentId: null, studentName: null,
        detail: `유닛 "${unit.name}" 단어 수 ${wordCount}개(정상 범위 ${UNIT_WORDS_MIN}~${UNIT_WORDS_MAX})`,
        refs: { unitId, textbookId: unit.textbook_id ?? null, wordCount },
      })
    }

    // Phase 8: UNIT_TEXTBOOK_ORPHAN — 실학생이 참조하는 유닛만(스펙 명시).
    if (unit.textbook_id && !textbookById.has(unit.textbook_id)) {
      push({
        code: INVARIANT_CODES.UNIT_TEXTBOOK_ORPHAN, severity: 'FAIL', studentId: null, studentName: null,
        detail: `유닛 "${unit.name}"의 textbook_id(${unit.textbook_id})가 textbooks 에 존재하지 않음`,
        refs: { unitId, textbookId: unit.textbook_id },
      })
    }
  }

  // 9) GHOST_UNIT_PRESENT — 학생 배정과 무관한 저장소 전체 유령 유닛 인벤토리
  const ghosts = findGhostUnits(ctx)
  const ghostUnitIdSet = new Set(ghosts.map((g) => g.id))
  for (const g of ghosts) {
    const referencing = [...(realStudentsByUnitId.get(g.id) || [])]
    push({
      code: INVARIANT_CODES.GHOST_UNIT_PRESENT, severity: 'WARN', studentId: null, studentName: null,
      detail: `유령 유닛 "${g.name}"(단어 ${g.wordCount}개) — 참조 실학생 ${referencing.length}명`,
      refs: { unitId: g.id, textbookId: g.textbookId ?? null, wordCount: g.wordCount, referencingStudentIds: referencing },
    })
  }

  // Phase 8: UNIT_NAME_ABNORMAL — 저장소 전체 유닛 대상(참조 여부 무관,
  // GHOST_UNIT_PRESENT 와 동일하게 인벤토리 성격). 유령 판정된 유닛은
  // GHOST_UNIT_PRESENT 가 이미 보고하므로 여기서 제외한다(중복 보고 방지).
  for (const [unitId, unit] of unitById) {
    if (!unit || ghostUnitIdSet.has(unitId)) continue
    const rawName = String(unit.name ?? '')
    const trimmedName = rawName.trim()
    const isBareAlias = BARE_UNIT_NAME_MIRROR.test(rawName)
    const isBlank = trimmedName === ''
    const isTooLong = trimmedName.length > UNIT_NAME_MAX_LEN
    if (isBareAlias || isBlank || isTooLong) {
      const reason = isBlank ? '빈 값/공백' : (isBareAlias ? '번호 없는 유닛 별칭' : `${UNIT_NAME_MAX_LEN}자 초과`)
      push({
        code: INVARIANT_CODES.UNIT_NAME_ABNORMAL, severity: 'WARN', studentId: null, studentName: null,
        detail: `유닛 이름 "${rawName}" 비정상(${reason})`,
        refs: { unitId, textbookId: unit.textbook_id ?? null, name: rawName, reason },
      })
    }
  }

  const findings = rawFindings
  const failStudentIds = new Set(findings.filter((f) => f.severity === 'FAIL' && f.studentId).map((f) => f.studentId))
  const warnStudentIds = new Set(findings.filter((f) => f.severity === 'WARN' && f.studentId).map((f) => f.studentId))
  const pass = realStudents.filter((s) => !failStudentIds.has(s.id) && !warnStudentIds.has(s.id)).length

  const summary = {
    fail: findings.filter((f) => f.severity === 'FAIL').length,
    warn: findings.filter((f) => f.severity === 'WARN').length,
    pass,
    checked: realStudents.length,
  }
  return { findings, summary }
}
