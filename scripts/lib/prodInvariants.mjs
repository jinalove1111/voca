// Production Safety Harness — 크로스 테이블 불변식 검사 (2026-09-03, Phase 1-A)
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
}

// 정상 유닛의 단어 수 범위. 이 범위를 벗어나면 데이터 이상 신호로 본다.
// 1개 이하는 유령 유닛/미업로드와 겹치는 신호, 100개 초과는 엑셀 업로드
// 사고(여러 유닛이 한 유닛으로 합쳐짐 등)로 실제 발생한 적 있는 패턴이다.
export const UNIT_WORDS_MIN = 2
export const UNIT_WORDS_MAX = 100

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

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
 * @returns {{findings: Array<{code:string,severity:'FAIL'|'WARN',studentId:string|null,studentName:string|null,detail:string,refs:object}>, summary:{fail:number,warn:number,pass:number,checked:number}}}
 */
export function evaluateInvariants(ctx, opts = {}) {
  const unitById = ctx?.unitById || new Map()
  const textbookById = ctx?.textbookById || new Map()
  const wordsByUnit = ctx?.wordsByUnit || new Map()
  const wordCountByUnit = ctx?.wordCountByUnit || new Map()
  const students = Array.isArray(ctx?.students) ? ctx.students : []
  const findings = []

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

    // 1) STUDENT_UNIT_ORPHAN — students.current_unit_id 가 units 에 없음
    if (student.current_unit_id) {
      addReference(student.current_unit_id, sid)
      const unit = unitById.get(student.current_unit_id) || null
      if (!unit) {
        findings.push({
          code: INVARIANT_CODES.STUDENT_UNIT_ORPHAN, severity: 'FAIL', studentId: sid, studentName: sname,
          detail: `students.current_unit_id(${student.current_unit_id})가 units 에 존재하지 않음`,
          refs: { unitId: student.current_unit_id },
        })
      }
    }

    // 2/4) SCA 행 순회 — 배정 행이 가리키는 유닛의 고아/유령 여부
    for (const a of myAssignments) {
      const uid = a?.current_unit_id
      if (!uid) continue
      addReference(uid, sid)
      const rowUnit = unitById.get(uid) || null
      if (!rowUnit) {
        findings.push({
          code: INVARIANT_CODES.SCA_UNIT_ORPHAN, severity: 'FAIL', studentId: sid, studentName: sname,
          detail: `student_class_assignments.current_unit_id(${uid})가 units 에 존재하지 않음`
            + `${a?.is_primary ? '(primary)' : ''}`,
          refs: { unitId: uid, textbookId: a?.textbook_id ?? null, classId: a?.class_id ?? null, isPrimary: !!a?.is_primary },
        })
        continue // orphan 이면 유령 판정 불가 — 아래로 진행하지 않는다
      }
      // 자기 자신이 지금 쓰는 유닛(=students.current_unit_id)이면 아래 3)
      // STUDENT_GHOST_UNIT 이 이미 보고하므로 여기서는 제외한다(같은 원인
      // 중복 보고 방지 — studentHealthRules.mjs 12-c 주석과 동일 원칙).
      if (uid !== student.current_unit_id && isGhostId(uid)) {
        const tb = a?.textbook_id ? textbookById.get(a.textbook_id) : null
        findings.push({
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
        findings.push({
          code: INVARIANT_CODES.STUDENT_GHOST_UNIT, severity: 'FAIL', studentId: sid, studentName: sname,
          detail: `현재 유닛 "${unit.name}"이 유령 유닛(${verdict.reason || '판정 근거 없음(회귀 픽스처 opts)'})`,
          refs: { unitId: student.current_unit_id, textbookId: unit.textbook_id ?? null },
        })
      }

      // 5) UNIT_NAME_MISMATCH — unit_name(레거시 문자열)이 있고, 유닛도
      //    정상 존재할 때만 비교한다(고아 유닛은 STUDENT_UNIT_ORPHAN 담당).
      if (unit && typeof student.unit_name === 'string' && student.unit_name.trim()
        && norm(student.unit_name) !== norm(unit.name)) {
        findings.push({
          code: INVARIANT_CODES.UNIT_NAME_MISMATCH, severity: 'WARN', studentId: sid, studentName: sname,
          detail: `students.unit_name("${student.unit_name}") != units.name("${unit.name}")`,
          refs: { unitId: student.current_unit_id, expectedName: unit.name, studentUnitName: student.unit_name },
        })
      }

      // 7) PRIMARY_TEXTBOOK_MISMATCH — 현재 유닛의 교재와 주교재가 다름
      if (unit && unit.textbook_id && primary?.textbook_id && unit.textbook_id !== primary.textbook_id) {
        findings.push({
          code: INVARIANT_CODES.PRIMARY_TEXTBOOK_MISMATCH, severity: 'WARN', studentId: sid, studentName: sname,
          detail: `현재 유닛 "${unit.name}"의 교재(${unit.textbook_id})가 주교재 배정(${primary.textbook_id})과 다름`,
          refs: { unitId: unit.id, unitTextbookId: unit.textbook_id, primaryTextbookId: primary.textbook_id },
        })
      }
    }

    // 6) PRIMARY_UNIT_MISMATCH — primary SCA 의 유닛과 students.current_unit_id 가 다름
    if (primary?.current_unit_id && student.current_unit_id
      && primary.current_unit_id !== student.current_unit_id) {
      findings.push({
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
      findings.push({
        code: INVARIANT_CODES.UNIT_WORDS_ABNORMAL, severity: 'WARN', studentId: null, studentName: null,
        detail: `유닛 "${unit.name}" 단어 수 ${wordCount}개(정상 범위 ${UNIT_WORDS_MIN}~${UNIT_WORDS_MAX})`,
        refs: { unitId, textbookId: unit.textbook_id ?? null, wordCount },
      })
    }
  }

  // 9) GHOST_UNIT_PRESENT — 학생 배정과 무관한 저장소 전체 유령 유닛 인벤토리
  const ghosts = findGhostUnits(ctx)
  for (const g of ghosts) {
    const referencing = [...(realStudentsByUnitId.get(g.id) || [])]
    findings.push({
      code: INVARIANT_CODES.GHOST_UNIT_PRESENT, severity: 'WARN', studentId: null, studentName: null,
      detail: `유령 유닛 "${g.name}"(단어 ${g.wordCount}개) — 참조 실학생 ${referencing.length}명`,
      refs: { unitId: g.id, textbookId: g.textbookId ?? null, wordCount: g.wordCount, referencingStudentIds: referencing },
    })
  }

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
