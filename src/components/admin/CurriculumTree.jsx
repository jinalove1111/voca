import { useEffect, useState } from 'react'
import {
  listPublishers, createPublisher, updatePublisher, deletePublisher,
  listGrades, createGrade,
  listTextbooksMeta, updateTextbookMeta,
  listUnitsMeta, updateUnitMeta,
} from '../../utils/curriculum/curriculumApi'

// CurriculumTree.jsx — 출판사 → 학년 → 교재 → 유닛 구조 탐색/편집
// (docs/CURRICULUM_ENGINE.md §7 관리자 플로우 2번).
//
// 이 컴포넌트는 반/교재/유닛을 "새로 만들지" 않는다 — 그건 이미
// AdminScreen 반 관리 탭(ClassTextbookLinks/TextbookAssignmentPanel 등)이
// 담당하는 검증된 플로우다(중복 금지 원칙, 설계 문서 §1.2). 여기서 하는
// 일은 오직: ① publishers(출판사) CRUD ② grades(학년) 생성/목록
// ③ 기존 교재에 publisher_id/grade_id/level/book_order 메타 부착
// ④ 기존 유닛에 position/lesson_no/objectives 메타 부착 — 전부 additive
// 컬럼(supabase_v3_13)에 대한 것이라, SQL 미실행이면 각 섹션이 독립적으로
// "아직 준비 안 됨" 배너로 폴백한다(curriculumApi.js의 featureDisabled 계약).
export default function CurriculumTree({ adminPin }) {
  const [publishers, setPublishers] = useState([])
  const [publishersDisabled, setPublishersDisabled] = useState(false)
  const [grades, setGrades] = useState([])
  const [gradesDisabled, setGradesDisabled] = useState(false)
  const [textbooks, setTextbooks] = useState([])
  const [metaDisabled, setMetaDisabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadTop = async () => {
    const [p, g, t] = await Promise.all([listPublishers(), listGrades(), listTextbooksMeta()])
    setPublishers(p.rows)
    setPublishersDisabled(p.featureDisabled)
    setGrades(g.rows)
    setGradesDisabled(g.featureDisabled)
    setTextbooks(t.rows)
    setMetaDisabled(t.featureDisabled)
    setLoaded(true)
  }

  useEffect(() => { loadTop() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return <p className="text-xs text-gray-400 py-2">불러오는 중...</p>

  return (
    <div className="space-y-3">
      {(publishersDisabled || gradesDisabled) && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-3 text-xs font-bold text-orange-700">
          ⚠️ 출판사/학년 기능은 supabase_v3_13 실행 후 사용 가능해요. (관리자: supabase_v3_13_curriculum_engine_phase0.sql을 Supabase SQL Editor에서 실행)
        </div>
      )}

      <PublisherPanel
        publishers={publishers}
        disabled={publishersDisabled}
        busy={busy}
        setBusy={setBusy}
        onChanged={loadTop}
        adminPin={adminPin}
      />

      <GradePanel
        grades={grades}
        disabled={gradesDisabled}
        busy={busy}
        setBusy={setBusy}
        onChanged={loadTop}
        adminPin={adminPin}
      />

      <TextbookMetaPanel
        textbooks={textbooks}
        publishers={publishers}
        grades={grades}
        metaDisabled={metaDisabled}
        busy={busy}
        setBusy={setBusy}
        onChanged={loadTop}
        adminPin={adminPin}
      />
    </div>
  )
}

function PublisherPanel({ publishers, disabled, busy, setBusy, onChanged, adminPin }) {
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await createPublisher(name)
      setName('')
      await onChanged()
    } catch (err) {
      alert('출판사 추가 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (p) => { setEditingId(p.id); setEditingName(p.name) }

  const handleRename = async () => {
    if (!editingName.trim()) return
    setBusy(true)
    try {
      await updatePublisher(editingId, editingName, adminPin)
      setEditingId(null)
      await onChanged()
    } catch (err) {
      alert('출판사 이름 변경 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (p) => {
    if (!window.confirm(`"${p.name}" 출판사를 삭제할까요?\n(이 출판사를 쓰던 교재는 삭제되지 않고 출판사 연결만 해제돼요)`)) return
    setBusy(true)
    try {
      await deletePublisher(p.id, adminPin)
      await onChanged()
    } catch (err) {
      alert('출판사 삭제 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-3 card-shadow space-y-2">
      <p className="text-xs font-black text-gray-700">🏢 출판사 ({publishers.length}개)</p>
      {publishers.length === 0 ? (
        <p className="text-xs text-gray-400">등록된 출판사가 없어요.</p>
      ) : (
        <div className="space-y-1.5">
          {publishers.map((p) => (
            <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5">
              {editingId === p.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 min-w-0 text-xs font-bold border border-gray-300 rounded-lg px-2 py-1"
                  />
                  <button onClick={handleRename} disabled={busy} className="text-blue-500 font-bold text-xs btn-press disabled:opacity-40">저장</button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 font-bold text-xs btn-press">취소</button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0 text-xs font-bold text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap">{p.name}</span>
                  <button onClick={() => startEdit(p)} disabled={busy} className="text-blue-400 font-bold text-xs btn-press disabled:opacity-40">이름변경</button>
                  <button onClick={() => handleDelete(p)} disabled={busy} className="text-red-400 font-bold text-xs btn-press disabled:opacity-40">삭제</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="+ 새 출판사 이름"
          disabled={disabled || busy}
          className="flex-1 min-w-0 text-xs font-bold border-2 border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-40"
        />
        <button onClick={handleCreate} disabled={disabled || busy || !name.trim()}
          className="flex-shrink-0 bg-indigo-500 disabled:bg-gray-300 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press">
          추가
        </button>
      </div>
    </div>
  )
}

function GradePanel({ grades, disabled, busy, setBusy, onChanged }) {
  const [name, setName] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await createGrade(name, grades.length)
      setName('')
      await onChanged()
    } catch (err) {
      alert('학년 추가 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-3 card-shadow space-y-2">
      <p className="text-xs font-black text-gray-700">🎓 학년 ({grades.length}개)</p>
      {grades.length === 0 ? (
        <p className="text-xs text-gray-400">등록된 학년이 없어요.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {grades.map((g) => (
            <span key={g.id} className="text-xs font-bold text-indigo-700 bg-indigo-50 rounded-lg px-2 py-1">{g.name}</span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="+ 새 학년 이름 (예: 중2)"
          disabled={disabled || busy}
          className="flex-1 min-w-0 text-xs font-bold border-2 border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-40"
        />
        <button onClick={handleCreate} disabled={disabled || busy || !name.trim()}
          className="flex-shrink-0 bg-indigo-500 disabled:bg-gray-300 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press">
          추가
        </button>
      </div>
    </div>
  )
}

function TextbookMetaPanel({ textbooks, publishers, grades, metaDisabled, busy, setBusy, onChanged, adminPin }) {
  const [selectedId, setSelectedId] = useState(textbooks[0]?.id || '')
  useEffect(() => {
    if (!selectedId && textbooks.length > 0) setSelectedId(textbooks[0].id)
  }, [textbooks, selectedId])

  const selected = textbooks.find((t) => t.id === selectedId) || null
  const [form, setForm] = useState({ publisherId: '', gradeId: '', level: '', bookOrder: '' })
  useEffect(() => {
    if (!selected) return
    setForm({
      publisherId: selected.publisherId || '',
      gradeId: selected.gradeId || '',
      level: selected.level || '',
      bookOrder: selected.bookOrder ?? '',
    })
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!selected) return
    setBusy(true)
    try {
      await updateTextbookMeta(selected.id, {
        publisherId: form.publisherId || null,
        gradeId: form.gradeId || null,
        level: form.level || null,
        bookOrder: form.bookOrder === '' ? null : Number(form.bookOrder),
      }, adminPin)
      await onChanged()
    } catch (err) {
      alert('교재 메타 저장 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-3 card-shadow space-y-2">
      <p className="text-xs font-black text-gray-700">📖 교재 메타 (출판사/학년/레벨/순서)</p>
      {textbooks.length === 0 ? (
        <p className="text-xs text-gray-400">등록된 교재가 없어요. (교재 자체 생성은 반 관리 탭에서 해주세요)</p>
      ) : (
        <>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
            className="w-full text-xs font-bold border-2 border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            {textbooks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          {metaDisabled && (
            <p className="text-[11px] text-orange-600 font-bold bg-orange-50 rounded-lg p-2">
              ⚠️ 교재 메타 컬럼(publisher_id/grade_id/level/book_order)이 아직 없어요 — supabase_v3_13 실행 필요
            </p>
          )}

          {selected && (
            <div className="space-y-1.5">
              <select value={form.publisherId} onChange={(e) => setForm((f) => ({ ...f, publisherId: e.target.value }))}
                disabled={metaDisabled || busy}
                className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-40">
                <option value="">출판사 선택 안 함</option>
                {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={form.gradeId} onChange={(e) => setForm((f) => ({ ...f, gradeId: e.target.value }))}
                disabled={metaDisabled || busy}
                className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-40">
                <option value="">학년 선택 안 함</option>
                {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                placeholder="레벨(자유 텍스트, 예: 초급)"
                disabled={metaDisabled || busy}
                className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-40"
              />
              <input
                type="number"
                value={form.bookOrder}
                onChange={(e) => setForm((f) => ({ ...f, bookOrder: e.target.value }))}
                placeholder="교재 순서(숫자)"
                disabled={metaDisabled || busy}
                className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-40"
              />
              <button onClick={handleSave} disabled={metaDisabled || busy}
                className="w-full bg-indigo-500 disabled:bg-gray-300 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press">
                교재 메타 저장
              </button>

              <UnitMetaList textbookId={selected.id} busy={busy} setBusy={setBusy} adminPin={adminPin} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function UnitMetaList({ textbookId, busy, setBusy, adminPin }) {
  const [units, setUnits] = useState([])
  const [disabled, setDisabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [drafts, setDrafts] = useState({}) // unitId -> { position, lessonNo, objectives }

  const load = async () => {
    setLoaded(false)
    const { rows, featureDisabled } = await listUnitsMeta(textbookId)
    setUnits(rows)
    setDisabled(featureDisabled)
    const nextDrafts = {}
    rows.forEach((u) => {
      nextDrafts[u.id] = { position: u.position ?? '', lessonNo: u.lessonNo ?? '', objectives: u.objectives || '' }
    })
    setDrafts(nextDrafts)
    setLoaded(true)
  }

  useEffect(() => { load() }, [textbookId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (unitId) => {
    const d = drafts[unitId]
    if (!d) return
    // TEMP DEBUG — remove after 유닛 저장 버그 확정
    const selectedUnit = units.find((u) => u.id === unitId)
    console.log('[unitMeta] handleSave 선택된 유닛 id=', unitId, 'name=', selectedUnit?.name)
    setBusy(true)
    try {
      await updateUnitMeta(unitId, {
        position: d.position === '' ? null : Number(d.position),
        lessonNo: d.lessonNo === '' ? null : Number(d.lessonNo),
        objectives: d.objectives || null,
      }, adminPin)
      await load()
    } catch (err) {
      alert('유닛 메타 저장 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <p className="text-xs text-gray-400 py-1">유닛 불러오는 중...</p>

  return (
    <div className="border-t border-gray-100 pt-2 space-y-1.5">
      <p className="text-[11px] font-black text-gray-500">유닛 메타 (position / 차시 / 학습목표)</p>
      {units.length === 0 && <p className="text-[11px] text-gray-400">이 교재에 연결된 유닛이 없어요.</p>}
      {units.map((u) => (
        <div key={u.id} className="bg-gray-50 rounded-lg p-2 space-y-1">
          <p className="text-xs font-bold text-gray-700">{u.name}</p>
          <div className="flex gap-1.5">
            <input
              type="number"
              value={drafts[u.id]?.position ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [u.id]: { ...d[u.id], position: e.target.value } }))}
              placeholder="순서"
              disabled={busy}
              className="w-16 text-xs border border-gray-200 rounded-lg px-1.5 py-1 disabled:opacity-40"
            />
            <input
              type="number"
              value={drafts[u.id]?.lessonNo ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [u.id]: { ...d[u.id], lessonNo: e.target.value } }))}
              placeholder="차시"
              disabled={disabled || busy}
              className="w-16 text-xs border border-gray-200 rounded-lg px-1.5 py-1 disabled:opacity-40"
            />
            <input
              value={drafts[u.id]?.objectives ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [u.id]: { ...d[u.id], objectives: e.target.value } }))}
              placeholder="학습목표"
              disabled={disabled || busy}
              className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-1.5 py-1 disabled:opacity-40"
            />
            <button onClick={() => handleSave(u.id)} disabled={busy}
              className="flex-shrink-0 bg-indigo-500 disabled:bg-gray-300 text-white font-bold px-2 py-1 rounded-lg text-[11px] btn-press">
              저장
            </button>
          </div>
        </div>
      ))}
      {disabled && (
        <p className="text-[11px] text-orange-600 font-bold bg-orange-50 rounded-lg p-2">
          ⚠️ 차시/학습목표 컬럼은 아직 없어요(순서만 저장 가능) — supabase_v3_13 실행 필요
        </p>
      )}
    </div>
  )
}
