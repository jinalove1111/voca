import { useMemo, useState } from 'react'
import { getStudents, getStudentUnit, fetchDashboardData, fetchWordStatusSummary, fetchXpTotals } from '../../utils/wordLibrary'

// 2026-08-06 P0 후속 — 중복 학생 계정(동명이인 vs 실제 중복 생성 사고) 조사용
// 읽기 전용 점검 패널. 이 컴포넌트는 어떤 쓰기도 하지 않는다(DB write 0건,
// setState만) — 병합/삭제 실행 도구는 별도 설계 검토·승인 후 제공 예정
// (docs/agent-decisions/0007-duplicate-student-merge-design.md 참조 —
// 원 작업 지시서는 "0005"를 지목했으나 실제로는 같은 날 별도 세션이 쓴
// 0007이 이 주제의 설계 문서다, 0005는 무관한 다른 문서라 정정함).
// StudentDirectory.jsx 안에서 접을 수 있는 섹션(<details>)으로만 렌더된다.
//
// 데이터 원천: getStudents()(wordLibrary 로컬 캐시, 앱 시작 시 이미 로드됨
// — 이 컴포넌트가 별도로 네트워크 호출하지 않음)로 이름 그룹을 먼저
// 계산하고, "점검 실행" 버튼을 눌렀을 때만 배치 조회 3종
// (fetchDashboardData/fetchWordStatusSummary/fetchXpTotals — 전부
// wordLibrary.js 기존 export, 새 쿼리 함수 없음)을 그룹에 속한 계정 id만
// 모아 한 번씩 호출한다(계정 수만큼 자동 조회하지 않음 — 조사 목적이라도
// 172명 스캔은 공짜가 아니므로 명시적 클릭 없이는 실행하지 않는다).
//
// "생성일" 관련 정직성 노트: getStudents()가 반환하는 학생 객체에는
// created_at이 포함되지 않는다(wordLibrary.js의 STUDENTS_SELECT_BASE가
// id,name,class_id,unit_name,classes(name)만 선택 — 이 파일은 wordLibrary.js
// 수정 금지 범위라 이 필드를 늘릴 수 없다). 없는 날짜를 지어내는 대신,
// getStudents()가 이미 created_at 오름차순으로 로드된 배열이라는 사실
// (wordLibrary.js refreshStudents의 .order('created_at').order('id'))만
// 근사치로 써서 "등록 순서"를 표시한다 — 대표 계정 추천의 "동률이면 가장
// 오래된 계정" 타이브레이커도 정확한 날짜가 아니라 이 순서로 판정한다.
const QA_PREFIX_RE = /^QA_/i
const norm = (name) => (name || '').trim().toLowerCase().normalize('NFC')

function fmtDateTime(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return null
  }
}

function shortId(id) {
  return id ? `${String(id).slice(0, 8)}…` : '(id 없음)'
}

export default function DuplicateStudentAudit() {
  // 마운트 시 1회 스냅샷 — 그룹 구성(누가 누구와 이름이 겹치는지)은 이미
  // 로드된 로컬 캐시로 즉시 계산 가능하므로 별도 로딩 상태가 필요 없다.
  // 배치 조회(별/XP/단어상태)만 "점검 실행" 클릭 시 시작된다.
  const allStudents = useMemo(() => getStudents(), [])
  const realStudents = useMemo(
    () => allStudents.filter((s) => !QA_PREFIX_RE.test(s.name || '')),
    [allStudents],
  )

  // 등록 순서(오래된 순) — realStudents는 getStudents() 원본 순서를 그대로
  // 보존(필터만 했을 뿐 재정렬 없음), 그 원본이 created_at 오름차순이므로
  // index가 곧 "몇 번째로 오래된 계정인지"의 근사치.
  const orderIndexById = useMemo(() => {
    const map = new Map()
    realStudents.forEach((s, idx) => map.set(s.id, idx))
    return map
  }, [realStudents])

  const groups = useMemo(() => {
    const byKey = new Map()
    for (const s of realStudents) {
      const key = norm(s.name)
      if (!key) continue
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(s)
    }
    return Array.from(byKey.entries())
      .filter(([, list]) => list.length >= 2)
      .map(([key, list]) => ({
        key,
        displayName: list[0].name,
        // 그룹 내부는 등록 순서(오래된 순)로 고정 정렬 — "가장 오래된"
        // 타이브레이커 판정과 화면 표시 순서가 항상 일치하게.
        students: [...list].sort((a, b) => (orderIndexById.get(a.id) ?? 0) - (orderIndexById.get(b.id) ?? 0)),
      }))
      .sort((a, b) => b.students.length - a.students.length)
  }, [realStudents, orderIndexById])

  const allGroupIds = useMemo(() => groups.flatMap((g) => g.students.map((s) => s.id)), [groups])

  const [checked, setChecked] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState(null)
  const [dashboardById, setDashboardById] = useState({})
  const [wordStatusById, setWordStatusById] = useState({})
  const [xpById, setXpById] = useState({})

  // role: 'keep' | 'representative' | 'hold' — 그룹키+학생id별. 어디에도
  // 저장하지 않는다(컴포넌트 state에만 존재, 언마운트되면 사라짐 — 병합/
  // 삭제를 실행하는 코드가 이 값을 읽는 곳은 이 파일 안에 없다).
  const [roleByGroupStudent, setRoleByGroupStudent] = useState({}) // { [groupKey]: { [studentId]: role } }
  const [previewGroupKey, setPreviewGroupKey] = useState(null)

  const runCheck = async () => {
    if (allGroupIds.length === 0) { setChecked(true); return }
    setChecking(true)
    setCheckError(null)
    try {
      const [dashboardRows, wordStatusMap, xpMap] = await Promise.all([
        fetchDashboardData(allGroupIds),
        fetchWordStatusSummary(allGroupIds),
        fetchXpTotals(allGroupIds),
      ])
      setDashboardById(Object.fromEntries(dashboardRows.map((r) => [r.id, r])))
      setWordStatusById(wordStatusMap)
      setXpById(xpMap)
      setChecked(true)
    } catch (err) {
      setCheckError(err.message || String(err))
    } finally {
      setChecking(false)
    }
  }

  const wordStatusTotal = (id) => {
    const w = wordStatusById[id]
    if (!w) return 0
    return (w.known || 0) + (w.unknown || 0) + (w.skipped || 0) + (w.mastered || 0)
  }

  const dataScore = (id) => {
    const stars = dashboardById[id]?.progress?.total_stars || 0
    const xp = xpById[id] || 0
    return stars + xp + wordStatusTotal(id)
  }

  // 대표 계정 추천 규칙: ① 데이터 총량(별+XP+단어상태수) 최대
  // ② 동률이면 최근 생성이 아니라 가장 오래된 계정(원 계정일 확률).
  const recommendFor = (group) => {
    let best = null
    for (const s of group.students) {
      const score = dataScore(s.id)
      const order = orderIndexById.get(s.id) ?? 0
      if (!best || score > best.score || (score === best.score && order < best.order)) {
        best = { id: s.id, score, order }
      }
    }
    return best
  }

  const roleOf = (groupKey, studentId, recommendedId) => {
    const explicit = roleByGroupStudent[groupKey]?.[studentId]
    if (explicit) return explicit
    return studentId === recommendedId ? 'representative' : 'keep'
  }

  const setRole = (groupKey, studentId, role, group) => {
    setRoleByGroupStudent((prev) => {
      const groupRoles = { ...(prev[groupKey] || {}) }
      const recommendedId = recommendFor(group).id
      if (role === 'representative') {
        // 그룹 내 대표는 한 명만 — 다른 계정이 이미(암묵적으로든 명시적
        //으로든) 대표였으면 되돌린다.
        for (const s of group.students) {
          if (s.id !== studentId && roleOf(groupKey, s.id, recommendedId) === 'representative') {
            groupRoles[s.id] = 'keep'
          }
        }
      }
      groupRoles[studentId] = role
      return { ...prev, [groupKey]: groupRoles }
    })
  }

  const copyId = async (id) => {
    try {
      await navigator.clipboard.writeText(id)
    } catch {
      // 클립보드 API 미지원/권한 거부 — 조용히 무시(부가 기능일 뿐, id는
      // 화면에 이미 축약 표시돼 있어 수동으로도 확인 가능).
    }
  }

  const groupsCount = groups.length
  const involvedCount = groups.reduce((sum, g) => sum + g.students.length, 0)

  if (groupsCount === 0) {
    return (
      <div className="text-xs text-gray-400 font-bold py-2">
        이름이 겹치는 계정이 없어요 (QA_ 테스트 계정 제외, 전체 실학생 {realStudents.length}명).
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl px-3 py-2.5 text-xs font-bold text-yellow-800">
        ⚠️ 이 패널은 조회 전용입니다. 병합·삭제는 실행되지 않으며, 병합
        도구는 설계 검토 후 별도 승인으로 제공됩니다(docs/agent-decisions/0007-duplicate-student-merge-design.md 참조).
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-gray-600">
        <span>중복 그룹 {groupsCount}개</span>
        <span>관련 계정 {involvedCount}개</span>
        <span>전체 실학생 {realStudents.length}명</span>
        <button type="button" onClick={runCheck} disabled={checking}
          className="ml-auto bg-purple-500 disabled:bg-gray-300 text-white font-black px-3 py-1.5 rounded-xl text-xs btn-press">
          {checking ? '⏳ 점검 중...' : checked ? '🔄 다시 점검' : '🔍 점검 실행 (별·XP·단어상태 조회)'}
        </button>
      </div>
      {checkError && <p className="text-xs text-red-500 font-bold">점검 중 오류: {checkError}</p>}
      <p className="text-[11px] text-gray-400">
        ※ 계정 생성 일시는 이 화면에서 조회할 수 없어요(학생 캐시에 저장되지 않는 필드) — 아래 "등록순서"는 오래된 순 근사치입니다.
        최근 활동은 로그인 기록이 아니라 학습 진행도(student_progress) 마지막 갱신 시각이에요 — 로그인 기록 자체는 저장되지 않아요.
      </p>

      {groups.map((group) => {
        const recommended = recommendFor(group)
        const representativeId = group.students.find((s) => roleOf(group.key, s.id, recommended.id) === 'representative')?.id || recommended.id
        const showPreview = previewGroupKey === group.key
        const others = group.students.filter((s) => s.id !== representativeId)
        const previewTotals = others.reduce((acc, s) => ({
          stars: acc.stars + (dashboardById[s.id]?.progress?.total_stars || 0),
          xp: acc.xp + (xpById[s.id] || 0),
          wordStatus: acc.wordStatus + wordStatusTotal(s.id),
        }), { stars: 0, xp: 0, wordStatus: 0 })
        const tiedCount = checked ? group.students.filter((s) => dataScore(s.id) === recommended.score).length : 0

        return (
          <div key={group.key} className="bg-gray-50 border-2 border-gray-100 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <p className="font-black text-gray-800">
                {group.displayName} <span className="text-xs text-gray-400 font-bold">({group.students.length}개 계정)</span>
              </p>
              {checked && (
                <p className="text-[11px] text-purple-600 font-bold">
                  추천 대표: {shortId(recommended.id)} — 데이터 총량 {recommended.score}점(별+XP+단어상태 합산)으로 가장 많음
                  {tiedCount > 1 ? ', 동률은 가장 오래된 계정 우선' : ''}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              {group.students.map((s) => {
                const role = roleOf(group.key, s.id, recommended.id)
                const dash = dashboardById[s.id]
                const lastActivity = checked ? (dash?.progress?.updated_at ? fmtDateTime(dash.progress.updated_at) : '데이터 없음') : '점검 실행 필요'
                return (
                  <div key={s.id} className="bg-white rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-bold text-gray-700 whitespace-nowrap">{s.className || '⚠️ 반 미배정'}</span>
                    <span className="text-gray-400 whitespace-nowrap">유닛: {getStudentUnit(s.id)}</span>
                    <button type="button" onClick={() => copyId(s.id)}
                      className="text-gray-500 font-mono bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 btn-press whitespace-nowrap"
                      title="클릭해서 전체 id 복사">
                      {shortId(s.id)} 📋
                    </button>
                    <span className="text-gray-400 whitespace-nowrap">등록순서: {(orderIndexById.get(s.id) ?? 0) + 1}번째</span>
                    <span className="text-gray-400 whitespace-nowrap">최근 활동: {lastActivity}</span>
                    {checked && (
                      <span className="text-gray-500 font-bold whitespace-nowrap">
                        ⭐{dashboardById[s.id]?.progress?.total_stars || 0} · XP{xpById[s.id] || 0} · 단어상태{wordStatusTotal(s.id)}
                      </span>
                    )}
                    <select value={role} onChange={(e) => setRole(group.key, s.id, e.target.value, group)}
                      className="ml-auto border-2 border-gray-200 rounded-lg px-2 py-1 text-xs font-bold bg-white">
                      <option value="keep">그대로 유지</option>
                      <option value="representative">대표 지정</option>
                      <option value="hold">보류</option>
                    </select>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPreviewGroupKey(showPreview ? null : group.key)} disabled={!checked}
                className="text-purple-600 font-bold text-xs btn-press disabled:opacity-40 disabled:cursor-not-allowed">
                {showPreview ? '병합 미리보기 닫기' : '👀 병합 미리보기'}
              </button>
              {!checked && <span className="text-[11px] text-gray-400">(점검 실행 후 이용 가능)</span>}
            </div>
            {showPreview && (
              <div className="bg-purple-50 border-2 border-purple-100 rounded-xl px-3 py-2 text-xs font-bold text-purple-700">
                대표({shortId(representativeId)})로 이동될 항목 요약(다른 {others.length}개 계정 합계): ⭐{previewTotals.stars} · XP{previewTotals.xp} · 단어상태{previewTotals.wordStatus}
                <br /><span className="font-normal text-purple-500">※ 미리보기일 뿐 실제로 이동/병합되지 않았어요. 실행 도구는 아직 없습니다.</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
