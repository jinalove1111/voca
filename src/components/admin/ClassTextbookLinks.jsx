import React, { useState } from 'react'
import {
  getClassNames, getClassIdByName, getClassTextbooks, getAllTextbooks,
  isTextbookMode, linkTextbookToClass, unlinkTextbookFromClass,
} from '../../utils/wordLibrary'

// 반↔교재 연결 관리 패널 (2026-07-22, v3.1 교재 도메인 모델 후속 관리자
// UI) — 반 관리 탭에서 반을 펼쳤을 때, 그 반에 연결된 교재 목록을 보고
// 연결(+)/해제를 할 수 있는 작은 패널. 스타일/패턴은 같은 폴더의
// TextbookAssignmentPanel(학생별 교재 배정)을 그대로 따른다.
//
// 백엔드는 전부 wordLibrary.js의 v3.1 함수(이 작업 범위에서 수정 금지
// 파일 — 이미 export돼 있는 것만 소비):
// - getClassTextbooks(classId): 연결된 교재 목록(sort_order 순 — 목록
//   순서 자체가 정렬 순서 표시. 순서 편집 UI는 복잡도 대비 가치가 낮아
//   의도적으로 생략, 새 연결은 항상 목록 끝에 붙는다).
// - linkTextbookToClass / unlinkTextbookFromClass: 연결/해제.
//   해제는 class_textbooks 연결 행만 지우고 교재/유닛/단어 데이터는 절대
//   삭제하지 않는다(wordLibrary.js 해당 함수 주석 — 운영자 요구사항).
// - 자기 반이 소유 컨테이너인 교재(textbook.ownerClassId === classId)는
//   해제 버튼을 아예 숨긴다 — 그 반의 자체 콘텐츠라 연결을 끊는 개념이
//   성립하지 않고, 끊으면 반이 자기 단어를 못 보는 사고가 된다.
//
// 교재 모드 꺼짐(isTextbookMode() === false — supabase_v3_1_textbooks.sql
// 미실행/백필 전 합성 폴백) 상태에서는 합성 교재를 진짜 연결처럼 보여주면
// 연결/해제가 DB에 반영되지 않아 혼란만 주므로, 패널 대신 짧은 안내만
// 표시한다.
export default function ClassTextbookLinks({ targetClass, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [addId, setAddId] = useState('')
  // link/unlink가 내부에서 refreshTextbooks()로 모듈 캐시를 갱신하므로,
  // 성공 후 이 카운터만 올려 재렌더하면 최신 목록이 보인다.
  const [, setVersion] = useState(0)
  const bumpVersion = () => setVersion(v => v + 1)

  const classId = getClassIdByName(targetClass)
  if (!classId) return null

  if (!isTextbookMode()) {
    return (
      <div className="bg-indigo-50 rounded-xl p-3">
        <p className="text-xs font-black text-indigo-700 mb-1">🔗 교재 연결</p>
        <p className="text-xs text-gray-500">
          교재 연결 관리는 다중 교재 모드가 켜진 뒤 사용할 수 있어요.
          (관리자: supabase_v3_1_textbooks.sql을 Supabase SQL Editor에서 실행하면 켜져요)
        </p>
      </div>
    )
  }

  // ownerClassId -> 반 이름 (소유 컨테이너 표시용). getClassNames +
  // getClassIdByName 조합 — 전부 동기 캐시 조회라 네트워크 비용 없음.
  const classNameById = {}
  getClassNames().forEach((name) => {
    const id = getClassIdByName(name)
    if (id) classNameById[id] = name
  })

  const linked = getClassTextbooks(classId) || []
  const linkedIds = new Set(linked.map(t => t.id))
  const addable = getAllTextbooks()
    .filter(t => !linkedIds.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const tbLabel = (t) => [t.name, t.publisherName && `(${t.publisherName})`].filter(Boolean).join(' ')

  const handleLink = async () => {
    if (!addId) return
    setBusy(true)
    try {
      // sortOrder = 목록 끝(기존 연결 수) — 새 교재는 항상 마지막에 붙는다.
      await linkTextbookToClass(classId, addId, linked.length)
      setAddId('')
      bumpVersion()
      onChanged?.()
    } catch (err) {
      alert('교재 연결 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleUnlink = async (t) => {
    if (t.ownerClassId === classId) return // 자체 교재 — 버튼이 없지만 방어
    if (!window.confirm(`"${t.name}" 교재를 "${targetClass}" 반에서 연결 해제할까요?\n\n연결만 끊는 거예요 — 교재의 유닛/단어 데이터는 삭제되지 않고, 다시 연결하면 그대로 보여요.`)) return
    setBusy(true)
    try {
      await unlinkTextbookFromClass(classId, t.id)
      bumpVersion()
      onChanged?.()
    } catch (err) {
      alert('교재 연결 해제 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
      <p className="text-xs font-black text-indigo-700">🔗 교재 연결 ({linked.length}개)</p>
      {linked.length === 0 ? (
        <p className="text-xs text-gray-400">아직 연결된 교재가 없어요.</p>
      ) : (
        <div className="space-y-1.5">
          {linked.map((t) => {
            const isOwn = t.ownerClassId === classId
            const ownerName = t.ownerClassId ? classNameById[t.ownerClassId] : null
            return (
              <div key={t.id} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5">
                <span className="flex-1 min-w-0 text-xs font-bold text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap" title={tbLabel(t)}>
                  {tbLabel(t)}
                  {!isOwn && ownerName && ownerName !== t.name && (
                    <span className="text-gray-400 font-normal"> · 원본: {ownerName}</span>
                  )}
                </span>
                {isOwn ? (
                  <span title="이 반의 자체 교재(소유 콘텐츠)라 연결을 해제할 수 없어요."
                    className="flex-shrink-0 text-[11px] font-bold text-indigo-400 bg-indigo-100 rounded-lg px-2 py-1 whitespace-nowrap cursor-help">
                    자체 교재
                  </span>
                ) : (
                  <button onClick={() => handleUnlink(t)} disabled={busy}
                    className="flex-shrink-0 text-red-400 font-bold text-xs btn-press disabled:opacity-40 whitespace-nowrap min-h-[40px] px-2">
                    연결 해제
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <select value={addId} onChange={(e) => setAddId(e.target.value)} disabled={busy}
          className="flex-1 min-w-0 text-xs font-bold border-2 border-indigo-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">+ 연결할 교재 선택</option>
          {addable.map((t) => <option key={t.id} value={t.id}>{tbLabel(t)}</option>)}
        </select>
        <button onClick={handleLink} disabled={busy || !addId}
          className="flex-shrink-0 bg-indigo-500 disabled:bg-gray-300 text-white font-black px-3 py-1.5 min-h-[40px] rounded-lg text-xs btn-press">
          {busy ? '⏳' : '교재 연결'}
        </button>
      </div>
      {addable.length === 0 && (
        <p className="text-[11px] text-gray-400">더 연결할 수 있는 교재가 없어요.</p>
      )}
    </div>
  )
}
