import { useEffect, useState } from 'react'
import {
  getClassNameById, getClassUnits, setStudentUnit,
  getStudentClassAssignments, assignTextbook, removeTextbookAssignment, setAssignmentUnit,
  getAllTextbooks, getOwnTextbookOfClass,
  // 2026-09-02(유령 유닛 셀렉터 노출 봉합) — 유닛 select 옵션에서 단어<2
  // 유닛(엑셀 헤더 잔재/빈 유닛)을 제외하는 버전.
  getLearnableClassUnits,
} from '../../utils/wordLibrary'

// v2.9 다중 교재(Multi-Textbook) 관리자 UI — decision 0004
// (docs/agent-decisions/0004-multi-textbook-architecture.md), 백엔드는
// src/utils/wordLibrary.js의 getStudentClassAssignments/assignTextbook/
// removeTextbookAssignment/setAssignmentUnit(commit fe1cdf6).
//
// 설계 의도(요청 3 — "오늘보다 관리를 더 단순하게"): 교사가 primary/
// secondary라는 내부 개념을 몰라도 되도록, 한 학생의 "배정된 교재" 목록을
// 한 줄에 [반 이름: 유닛 ▾] 형태로 나란히 보여주고 그 옆에 "+ 교재 추가"
// 만 둔다(별도 모달/페이지 없음). 다만 유닛 저장 방식은 내부적으로 분기:
// 주 교재(⭐ 표시, 오늘까지의 유일한 반/유닛 = students.class_id/
// current_unit_id)는 기존에 검증된 setStudentUnit()을 그대로 호출해
// students 테이블을 갱신하고(학생 실제 학습 화면이 읽는 값 = 이 값,
// resolveStudentUnitObj), 추가 교재는 setAssignmentUnit()으로
// student_class_assignments 행만 갱신한다 — 이 분기는 UI 뒤에 완전히
// 숨겨져 있어 교사에게는 보이지 않는다(요청 3 그대로 충족). 주 교재를
// setAssignmentUnit으로도 갱신하면 students.current_unit_id와 조인 테이블
// 행이 서로 어긋나(학생이 보는 화면은 students 테이블만 읽음) 관리자 화면과
// 실제 학습 화면이 다른 유닛을 보여주는 조용한 불일치가 생길 수 있어
// 피했다.
//
// 테이블 미존재(supabase_v2_9_student_class_assignments.sql 미실행,
// CLAUDE.md 규칙 8에 따라 운영자가 수동 실행 예정 — 지금은 프로덕션의
// 실제 상태)면 assignTextbook/removeTextbookAssignment/setAssignmentUnit이
// 명확한 에러를 던진다(wordLibrary.js 주석 참고) — 아래 isTableMissingError
// 로 잡아서 놀라지 않을 안내 문구로 바꾼다(요청 4).
function isTableMissingError(err) {
  return String(err?.message || err || '').includes('student_class_assignments 테이블이 아직 없습니다')
}

export default function TextbookAssignmentPanel({ studentId, onChanged }) {
  const [assignments, setAssignments] = useState(null) // null = 로딩 중
  const [tableMissing, setTableMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [addTarget, setAddTarget] = useState('')

  const load = async () => {
    setAssignments(await getStudentClassAssignments(studentId))
  }
  useEffect(() => { load() }, [studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (assignments === null) return <p className="text-xs text-gray-400 py-2">불러오는 중...</p>

  // 2026-08-07 정책 9 — 관리자 배정 UI는 반 목록이 아니라 textbooks 목록을
  // 보여준다(반/교과서 도메인 분리). 저장 구조(SCA class_id=소유 컨테이너)는
  // 무변경 — assignTextbook은 여전히 교재의 소유 컨테이너 반 id를 받는다.
  // 이미 배정된 교재 판정: 각 행의 textbookId(getStudentClassAssignments가
  // NULL 레거시 행이면 getOwnTextbookOfClass로 이미 해석해서 준다)와 비교.
  const assignedTextbookIds = new Set(
    assignments.map((a) => a.textbookId || getOwnTextbookOfClass(a.classId)?.id).filter(Boolean)
  )
  const addableTextbooks = getAllTextbooks()
    .filter((t) => !String(t.id).startsWith('synthetic-tb:'))
    .filter((t) => !assignedTextbookIds.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const handleAdd = async () => {
    if (!addTarget) return
    const tb = getAllTextbooks().find((t) => t.id === addTarget)
    if (!tb || !tb.ownerClassId) return
    setBusy(true)
    try {
      await assignTextbook(studentId, tb.ownerClassId)
      setAddTarget('')
      await load()
    } catch (err) {
      if (isTableMissingError(err)) setTableMissing(true)
      else alert('교과서 추가 배정 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (a) => {
    const tbForRow = a.textbookId ? getAllTextbooks().find((t) => t.id === a.textbookId) : null
    const clsName = tbForRow?.name || getClassNameById(a.classId) || '(알 수 없는 반)'
    if (!window.confirm(`"${clsName}" 교과서 배정을 해제할까요?\n(이 교과서에서 쌓은 진행 기록은 지워지지 않고 그대로 남아요)`)) return
    setBusy(true)
    try {
      await removeTextbookAssignment(studentId, a.classId)
      await load()
    } catch (err) {
      if (isTableMissingError(err)) setTableMissing(true)
      else alert('교과서 해제 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleUnitChange = async (a, unitId) => {
    setBusy(true)
    try {
      if (a.isPrimary) {
        // 주 교재는 항상 기존 setStudentUnit 경로로 — 학생 실제 학습
        // 화면이 읽는 students.current_unit_id를 여기서 갱신해야 관리자
        // 화면과 실제 화면이 어긋나지 않는다(파일 헤더 주석 참고).
        const clsName = getClassNameById(a.classId)
        const unitName = clsName && getClassUnits(clsName).find((u) => u.id === unitId)?.name
        if (unitName) await setStudentUnit(studentId, unitName)
      } else {
        await setAssignmentUnit(studentId, a.classId, unitId)
      }
      onChanged?.()
      await load()
    } catch (err) {
      if (isTableMissingError(err)) setTableMissing(true)
      else alert('유닛 변경 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-purple-50 rounded-xl p-3 space-y-2">
      <p className="text-xs font-black text-purple-700">📚 배정된 교과서</p>
      <p className="text-[11px] text-purple-500">
        다른 출판사 교과서를 주고 싶을 때 여기서 추가 배정하세요 — 새 계정을 만들 필요가 없어요. 배정된 교과서는 학생 홈 드롭다운에 나타나요.
      </p>
      {tableMissing && (
        <p className="text-xs text-orange-600 font-bold bg-orange-50 rounded-lg p-2">
          ⚠️ 다중 교과서 기능은 아직 활성화되지 않았어요. (관리자: supabase_v2_9_student_class_assignments.sql을 Supabase SQL Editor에서 실행하면 켜져요)
        </p>
      )}
      {assignments.length === 0 ? (
        <p className="text-xs text-gray-400">아직 배정된 교과서가 없어요 — 먼저 "반 배정"으로 기본 반을 정해주세요.</p>
      ) : (
        <div className="space-y-1.5">
          {assignments.map((a) => {
            const clsName = getClassNameById(a.classId)
            // 행 라벨 = 교과서 이름 우선(정책 9), textbookId 해석 불가 시 기존 반 이름 라벨로 폴백.
            const tbForRow = a.textbookId ? getAllTextbooks().find((t) => t.id === a.textbookId) : null
            const label = tbForRow?.name || clsName || '(알 수 없는 반)'
            // 2026-09-02 — 학습 가능 유닛(단어>=2)만 옵션으로. 단, 이 행의
            // 현재 unitId가 필터로 빠지면(과거에 유령 유닛에 배정된 행 등)
            // 드롭다운 표시가 깨지지 않도록 그 유닛을 목록 맨 앞에 유지하고
            // 이름 뒤에 표기를 붙여 구분한다(학습 불가 상태를 숨기지 않음).
            const learnableUnits = clsName ? getLearnableClassUnits(clsName) : []
            const currentUnit = a.unitId && clsName ? getClassUnits(clsName).find((u) => u.id === a.unitId) : null
            const currentMissing = currentUnit && !learnableUnits.some((u) => u.id === a.unitId)
            const units = currentMissing
              ? [{ ...currentUnit, name: `${currentUnit.name} (단어 부족)` }, ...learnableUnits]
              : learnableUnits
            return (
              <div key={a.classId} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5">
                <span className="text-xs font-bold text-gray-700 flex-shrink-0 max-w-[7rem] overflow-hidden text-ellipsis whitespace-nowrap" title={label}>
                  {a.isPrimary && '⭐ '}{label}
                </span>
                <select value={a.unitId || ''} disabled={busy}
                  onChange={(e) => { if (e.target.value) handleUnitChange(a, e.target.value) }}
                  className="flex-1 min-w-0 text-xs font-bold border border-gray-200 rounded-lg px-1.5 py-1 bg-white">
                  <option value="">유닛 선택</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                {!a.isPrimary && (
                  <button onClick={() => handleRemove(a)} disabled={busy}
                    className="flex-shrink-0 text-red-400 font-bold text-xs btn-press disabled:opacity-40">
                    해제
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <select value={addTarget} onChange={(e) => setAddTarget(e.target.value)} disabled={busy}
          className="flex-1 min-w-0 text-xs font-bold border-2 border-purple-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">➕ 배정할 교과서 선택</option>
          {addableTextbooks.map((tb) => <option key={tb.id} value={tb.id}>{tb.name}</option>)}
        </select>
        <button onClick={handleAdd} disabled={busy || !addTarget}
          className="flex-shrink-0 bg-purple-500 disabled:bg-gray-300 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press">
          배정
        </button>
      </div>
      {addableTextbooks.length === 0 && !tableMissing && (
        <p className="text-[11px] text-gray-400">추가로 배정할 수 있는 교과서가 없어요.</p>
      )}
    </div>
  )
}
