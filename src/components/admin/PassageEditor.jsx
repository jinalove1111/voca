import React, { useState } from 'react'
import { validatePassage, movePosition, splitPassageText } from '../../utils/readingModel'
import {
  fetchPassagesForUnit, createPassage, updatePassageTitle, deletePassage,
  saveSentences, movePassage, checkReadingTablesExist,
} from '../../utils/readingApi'

// Reading Foundation(v3.3) 관리자 지문 편집기 — AdminScreen 반 관리 탭의
// 유닛 펼침 영역에 렌더된다(readingFoundation 플래그 게이팅은 호출부).
// 시각 언어/구조는 같은 폴더의 ClassTextbookLinks + AdminScreen의 접힌
// 관찰 섹션(<details>, 열 때만 조회) 관례를 그대로 따른다.
//
// 학생 화면과 완전히 무관한 순수 관리자 도구다 — 학생용 읽기 학습 UI는
// 의도적으로 이번 범위 밖(features.js readingStudentUI=false 예약 플래그만
// 존재, 소비 코드 0).
//
// 테이블 미존재(supabase_v3_3_reading.sql 미실행)면 편집 UI 대신 안내만
// 표시한다(SpellingReviewQueuePanel의 "SQL 실행하면 켜져요" 관례).

// 문장 행 로컬 키 — DB id가 없는 새 행(추가/붙여넣기)을 React key로
// 안정 식별하기 위한 단조 카운터(저장 시에는 사용되지 않음).
let localKeySeq = 0
const nextKey = () => `local-${++localKeySeq}`

export default function PassageEditor({ unitId, unitName }) {
  const [loaded, setLoaded] = useState(false)      // details 첫 open 시 1회 조회
  const [loading, setLoading] = useState(false)
  const [tablesExist, setTablesExist] = useState(true)
  const [passages, setPassages] = useState([])
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [expandedId, setExpandedId] = useState(null) // 문장 편집 중인 지문 id
  const [draft, setDraft] = useState([])           // 편집 중 문장 [{key,id?,english,korean}]
  const [draftErrors, setDraftErrors] = useState([])
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)

  const load = async () => {
    setLoading(true)
    const [exists, list] = await Promise.all([
      checkReadingTablesExist(),
      fetchPassagesForUnit(unitId),
    ])
    setTablesExist(exists)
    setPassages(list)
    setLoading(false)
  }

  const handleToggle = (e) => {
    if (e.target.open && !loaded) { setLoaded(true); load() }
  }

  // ── 지문 목록 액션 ──────────────────────────────────────────────────
  const handleAddPassage = async () => {
    const title = newTitle.trim()
    if (!title) return alert('지문 제목을 입력해주세요.')
    setBusy(true)
    try {
      await createPassage(unitId, title, passages.length) // 목록 끝에 추가
      setNewTitle('')
      await load()
    } catch (err) {
      alert('지문 추가 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleRename = async (p) => {
    const raw = window.prompt('지문 제목 수정', p.title)
    if (raw === null) return
    const title = raw.trim()
    if (!title || title === p.title) return
    setBusy(true)
    try {
      await updatePassageTitle(p.id, title)
      await load()
    } catch (err) {
      alert('제목 수정 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (p) => {
    if (!window.confirm(`"${p.title}" 지문을 삭제할까요?\n\n지문과 문장이 삭제됩니다. (단어/유닛 데이터는 영향 없어요)`)) return
    setBusy(true)
    try {
      await deletePassage(p.id)
      if (expandedId === p.id) setExpandedId(null)
      await load()
    } catch (err) {
      alert('지문 삭제 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleMovePassage = async (index, dir) => {
    const to = index + dir
    const reordered = movePosition(passages, index, to)
    if (reordered[index] === passages[index]) return // no-op(경계)
    setBusy(true)
    try {
      // 재정렬된 배열 순서 = 새 position. 지문 수는 유닛당 소수라 순차
      // update로 충분(readingApi.movePassage 주석 참고).
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].position !== i) await movePassage(reordered[i].id, i)
      }
      await load()
    } catch (err) {
      alert('순서 변경 중 오류가 발생했어요: ' + (err.message || err))
      await load() // 부분 반영됐을 수 있으니 서버 상태로 재동기화
    } finally {
      setBusy(false)
    }
  }

  // ── 문장 편집 ──────────────────────────────────────────────────────
  const openSentenceEditor = (p) => {
    setExpandedId(p.id)
    setDraft(p.sentences.map((s) => ({ key: s.id || nextKey(), english: s.english, korean: s.korean || '' })))
    setDraftErrors([])
    setPasteText('')
    setShowPaste(false)
  }

  const setDraftRow = (key, field, value) =>
    setDraft((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)))

  const addDraftRow = () => setDraft((prev) => [...prev, { key: nextKey(), english: '', korean: '' }])

  const deleteDraftRow = (key) => setDraft((prev) => prev.filter((r) => r.key !== key))

  const moveDraftRow = (index, dir) => setDraft((prev) => movePosition(prev, index, index + dir))

  const applyPaste = () => {
    const parts = splitPassageText(pasteText)
    if (parts.length === 0) return alert('붙여넣은 본문에서 문장을 찾지 못했어요.')
    setDraft((prev) => [...prev, ...parts.map((en) => ({ key: nextKey(), english: en, korean: '' }))])
    setPasteText('')
    setShowPaste(false)
  }

  const handleSaveSentences = async (p) => {
    const { ok, errors } = validatePassage({ title: p.title, sentences: draft })
    setDraftErrors(errors)
    if (!ok) return
    setBusy(true)
    try {
      await saveSentences(p.id, draft)
      setExpandedId(null)
      await load()
    } catch (err) {
      alert('문장 저장 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="bg-sky-50 rounded-xl" onToggle={handleToggle}>
      <summary className="cursor-pointer select-none list-none p-3 text-xs font-black text-sky-700">
        📖 읽기 지문 — {unitName}{loaded && !loading && tablesExist ? ` (${passages.length}개)` : ''}
      </summary>
      <div className="px-3 pb-3 space-y-2">
        {loading ? (
          <p className="text-xs text-gray-400">불러오는 중...</p>
        ) : !tablesExist ? (
          <p className="text-xs text-orange-500 font-bold bg-orange-50 rounded-lg p-2">
            ⚠️ 준비 중 — supabase_v3_3_reading.sql 실행 후 사용 가능해요.
          </p>
        ) : (
          <>
            {passages.length === 0 && (
              <p className="text-xs text-gray-400">이 유닛에 아직 지문이 없어요.</p>
            )}
            {passages.map((p, i) => (
              <div key={p.id} className="bg-white rounded-lg p-2 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="flex-1 min-w-0 text-xs font-bold text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap" title={p.title}>
                    {p.title} <span className="text-gray-400 font-normal">· 문장 {p.sentences.length}개</span>
                  </span>
                  <button onClick={() => handleMovePassage(i, -1)} disabled={busy || i === 0}
                    className="flex-shrink-0 text-gray-400 font-bold text-xs btn-press disabled:opacity-30 px-1.5 py-1">↑</button>
                  <button onClick={() => handleMovePassage(i, 1)} disabled={busy || i === passages.length - 1}
                    className="flex-shrink-0 text-gray-400 font-bold text-xs btn-press disabled:opacity-30 px-1.5 py-1">↓</button>
                  <button onClick={() => handleRename(p)} disabled={busy}
                    className="flex-shrink-0 text-gray-500 font-bold text-xs btn-press disabled:opacity-40 px-1.5 py-1">제목</button>
                  <button onClick={() => (expandedId === p.id ? setExpandedId(null) : openSentenceEditor(p))} disabled={busy}
                    className="flex-shrink-0 text-sky-600 font-bold text-xs btn-press disabled:opacity-40 px-1.5 py-1">
                    {expandedId === p.id ? '닫기' : '문장 편집'}
                  </button>
                  <button onClick={() => handleDelete(p)} disabled={busy}
                    className="flex-shrink-0 text-red-400 font-bold text-xs btn-press disabled:opacity-40 px-1.5 py-1">삭제</button>
                </div>

                {expandedId === p.id && (
                  <div className="border-t border-gray-100 pt-2 space-y-2">
                    {draft.length === 0 && (
                      <p className="text-xs text-gray-400">문장이 없어요 — 아래에서 추가하거나 본문을 붙여넣으세요.</p>
                    )}
                    {draft.map((row, ri) => (
                      <div key={row.key} className="bg-gray-50 rounded-lg p-2 space-y-1">
                        <div className="flex items-start gap-1.5">
                          <span className="flex-shrink-0 text-[11px] font-black text-gray-400 pt-1.5 w-5 text-right">{ri + 1}.</span>
                          <textarea value={row.english} rows={2}
                            onChange={(e) => setDraftRow(row.key, 'english', e.target.value)}
                            placeholder="영어 문장"
                            className="flex-1 min-w-0 text-xs border-2 border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-sky-400 bg-white" />
                          <div className="flex-shrink-0 flex flex-col gap-0.5">
                            <button onClick={() => moveDraftRow(ri, -1)} disabled={busy || ri === 0}
                              className="text-gray-400 font-bold text-xs btn-press disabled:opacity-30 px-1">↑</button>
                            <button onClick={() => moveDraftRow(ri, 1)} disabled={busy || ri === draft.length - 1}
                              className="text-gray-400 font-bold text-xs btn-press disabled:opacity-30 px-1">↓</button>
                          </div>
                          <button onClick={() => deleteDraftRow(row.key)} disabled={busy}
                            className="flex-shrink-0 text-red-400 font-bold text-xs btn-press disabled:opacity-40 px-1 pt-1">✕</button>
                        </div>
                        <input type="text" value={row.korean}
                          onChange={(e) => setDraftRow(row.key, 'korean', e.target.value)}
                          placeholder="한글 번역 (선택)"
                          className="text-xs border-2 border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-sky-400 bg-white" style={{ width: 'calc(100% - 1.6rem)', marginLeft: '1.6rem' }} />
                      </div>
                    ))}

                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={addDraftRow} disabled={busy}
                        className="bg-white border-2 border-sky-200 text-sky-600 font-bold px-2.5 py-1.5 rounded-lg text-xs btn-press disabled:opacity-40">
                        + 문장 추가
                      </button>
                      <button onClick={() => setShowPaste((v) => !v)} disabled={busy}
                        className="bg-white border-2 border-gray-200 text-gray-500 font-bold px-2.5 py-1.5 rounded-lg text-xs btn-press disabled:opacity-40">
                        📋 본문 붙여넣기
                      </button>
                    </div>

                    {showPaste && (
                      <div className="space-y-1.5">
                        <textarea value={pasteText} rows={4}
                          onChange={(e) => setPasteText(e.target.value)}
                          placeholder="영어 본문 전체를 붙여넣으면 마침표/물음표/느낌표 기준으로 문장을 나눠서 아래에 추가해요. (약어 뒤에서도 잘릴 수 있으니 결과를 확인해주세요)"
                          className="w-full text-xs border-2 border-sky-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-sky-400 bg-white" />
                        <button onClick={applyPaste} disabled={busy || !pasteText.trim()}
                          className="bg-sky-500 disabled:bg-gray-300 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press">
                          문장으로 나눠서 추가
                        </button>
                      </div>
                    )}

                    {draftErrors.length > 0 && (
                      <div className="bg-red-50 rounded-lg p-2">
                        {draftErrors.map((e, ei) => (
                          <p key={ei} className="text-[11px] font-bold text-red-500">· {e}</p>
                        ))}
                      </div>
                    )}

                    <button onClick={() => handleSaveSentences(p)} disabled={busy}
                      className="w-full bg-sky-500 disabled:bg-gray-300 text-white font-black py-2 rounded-lg text-xs btn-press">
                      {busy ? '⏳ 저장 중...' : '💾 문장 저장'}
                    </button>
                  </div>
                )}
              </div>
            ))}

            <div className="flex items-center gap-2">
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && handleAddPassage()}
                placeholder="새 지문 제목 (예: Lesson 1 본문)"
                className="flex-1 min-w-0 text-xs font-bold border-2 border-sky-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-sky-400" />
              <button onClick={handleAddPassage} disabled={busy || !newTitle.trim()}
                className="flex-shrink-0 bg-sky-500 disabled:bg-gray-300 text-white font-black px-3 py-1.5 min-h-[40px] rounded-lg text-xs btn-press">
                지문 추가
              </button>
            </div>
          </>
        )}
      </div>
    </details>
  )
}
