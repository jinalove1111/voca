import { useEffect, useMemo, useState } from 'react'
import {
  listPublishers, listGrades, listTextbooksMeta, listUnitsMeta, listGrammarPoints,
} from '../../utils/curriculum/curriculumApi'
import {
  listExamples, createExample, updateExample, deleteExample, setApprovalStatus,
} from '../../utils/curriculum/exampleLibrary'
import { canTransition, matchesFilters, APPROVAL_STATUSES, validateExampleFields } from '../../utils/curriculum/curriculumModel'
import { generateCandidateExamples } from '../../utils/curriculum/generatorContract'

const SOURCE_BADGE = { teacher: '👩‍🏫', import: '📥', rule: '⚙️', ai: '🤖' }
const STATUS_STYLE = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

function transitionLabel(from, to) {
  if (to === 'pending') return from === 'rejected' ? '🔁 재검수' : '📤 검수요청'
  if (to === 'approved') return '✅ 승인'
  if (to === 'rejected') return from === 'approved' ? '↩️ 회수' : '🚫 반려'
  return to
}

const EMPTY_FORM = {
  id: null,
  targetWord: '', englishSentence: '', koreanTranslation: '',
  textbookId: '', unitId: '', grammarPointId: '', difficulty: 1,
  approveImmediately: false,
}

// ExampleManager.jsx — examples(예문) CRUD/필터/승인
// (docs/CURRICULUM_ENGINE.md §7 관리자 플로우 3번, UI 스타일은
// src/components/prototype/TextbookExamplePrototype.jsx 승계).
//
// 필터 계약(리뷰 반영 — curriculumModel.matchesFilters와 동일한 camelCase
// 키): publisherId/gradeId는 examples 행에 없는 컬럼이라(§2 각주) 먼저
// curriculumApi(listTextbooksMeta)로 해당하는 textbookId 집합을 구한 뒤
// 로컬에서 그 집합에 속하는 행만 남긴다 — 서버 쿼리는 textbookId/unitId/
// grammarPointId/approvalStatus/targetWord만 직접 지원(exampleLibrary.js
// listExamples 계약).
export default function ExampleManager({ adminPin }) {
  const [publishers, setPublishers] = useState([])
  const [grades, setGrades] = useState([])
  const [textbooksMeta, setTextbooksMeta] = useState([])
  const [grammarPoints, setGrammarPoints] = useState([])
  const [units, setUnits] = useState([])
  const [metaLoaded, setMetaLoaded] = useState(false)

  const [filters, setFilters] = useState({
    publisherId: '', gradeId: '', textbookId: '', unitId: '', grammarPointId: '', approvalStatus: '', targetWord: '',
  })

  const [rows, setRows] = useState([])
  const [examplesDisabled, setExamplesDisabled] = useState(false)
  const [rowsLoaded, setRowsLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [aiNote, setAiNote] = useState(null)

  useEffect(() => {
    (async () => {
      const [p, g, t, gp] = await Promise.all([listPublishers(), listGrades(), listTextbooksMeta(), listGrammarPoints()])
      setPublishers(p.rows)
      setGrades(g.rows)
      setTextbooksMeta(t.rows)
      setGrammarPoints(gp.rows)
      setMetaLoaded(true)
    })()
  }, [])

  useEffect(() => {
    (async () => {
      if (!filters.textbookId) { setUnits([]); return }
      const { rows: unitRows } = await listUnitsMeta(filters.textbookId)
      setUnits(unitRows)
    })()
  }, [filters.textbookId])

  // publisher/grade 필터 → 해당하는 textbookId 집합(리뷰 반영 L-계열
  // 계약 — 특정 textbookId를 이미 골랐으면 그게 우선이라 이 집합은 안 씀).
  const resolvedTextbookIds = useMemo(() => {
    if (filters.textbookId) return null // 특정 교재를 이미 선택 — 이 집합 불필요
    if (!filters.publisherId && !filters.gradeId) return null // 제약 없음
    return new Set(
      textbooksMeta
        .filter((t) => (!filters.publisherId || t.publisherId === filters.publisherId) && (!filters.gradeId || t.gradeId === filters.gradeId))
        .map((t) => t.id),
    )
  }, [filters.publisherId, filters.gradeId, filters.textbookId, textbooksMeta])

  const load = async () => {
    setRowsLoaded(false)
    const { rows: r, featureDisabled } = await listExamples({
      textbookId: filters.textbookId || undefined,
      unitId: filters.unitId || undefined,
      grammarPointId: filters.grammarPointId || undefined,
      approvalStatus: filters.approvalStatus || undefined,
      targetWord: filters.targetWord || undefined,
    }, { limit: 200 })
    setExamplesDisabled(featureDisabled)
    // matchesFilters(curriculumModel)로 서버 필터 결과를 다시 한번 방어적으로
    // 재확인(camelCase 계약 그대로 재사용 — 필터 로직을 여기서 재구현하지
    // 않음), 그 위에 publisher/grade → textbookId 집합 포함 여부만 추가로
    // 검사한다(examples 행에는 publisherId/gradeId 컬럼 자체가 없어 이
    // 부분만은 matchesFilters의 계약 밖 — curriculumModel.js 헤더 주석 참고).
    const singleValueFilters = {
      textbookId: filters.textbookId || undefined,
      unitId: filters.unitId || undefined,
      grammarPointId: filters.grammarPointId || undefined,
      approvalStatus: filters.approvalStatus || undefined,
      targetWord: filters.targetWord || undefined,
    }
    const filtered = r
      .filter((row) => matchesFilters(row, singleValueFilters))
      .filter((row) => !resolvedTextbookIds || resolvedTextbookIds.has(row.textbookId))
    setRows(filtered)
    setRowsLoaded(true)
  }

  useEffect(() => { load() }, [filters, resolvedTextbookIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const startCreate = () => { setForm(EMPTY_FORM); setShowForm(true) }
  const startEdit = (row) => {
    setForm({
      id: row.id,
      targetWord: row.targetWord, englishSentence: row.englishSentence, koreanTranslation: row.koreanTranslation || '',
      textbookId: row.textbookId || '', unitId: row.unitId || '', grammarPointId: row.grammarPointId || '',
      difficulty: row.difficulty ?? 1, approveImmediately: row.approvalStatus === 'approved',
    })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    const fields = {
      target_word: form.targetWord,
      english_sentence: form.englishSentence,
      korean_translation: form.koreanTranslation || null,
      textbook_id: form.textbookId || null,
      unit_id: form.unitId || null,
      grammar_point_id: form.grammarPointId || null,
      difficulty: Number(form.difficulty) || 1,
      source: 'teacher',
      approval_status: form.approveImmediately ? 'approved' : 'draft',
    }
    // 2026-08-02 — createExample/updateExample(exampleLibrary.js)이 이미
    // 저장 직전에 validateExampleFields로 검증해 throw하므로 기능적으로는
    // 이미 막혀 있었지만, 그 에러가 "예문 저장 중 오류: " 접두어로 감싸져
    // API 왕복 없이는 못 보던 안내(특히 "영어 문장에 대상 단어가 온전한
    // 단어 형태로 포함돼 있어야 해요")를 여기서 먼저 같은 순수 검증 함수로
    // 확인해, 네트워크 호출 전에 그대로(접두어 없이) 보여준다 — 검증 로직
    // 재구현 없이 재사용(curriculumModel.js 단일 원본).
    const { ok, errors } = validateExampleFields(fields)
    if (!ok) { alert(errors.join('\n')); return }

    setBusy(true)
    try {
      if (form.id) await updateExample(form.id, fields, adminPin)
      else await createExample(fields, adminPin)
      setShowForm(false)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      alert('예문 저장 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (row) => {
    if (!window.confirm(`"${row.englishSentence}" 예문을 삭제할까요?`)) return
    setBusy(true)
    try {
      await deleteExample(row.id, adminPin)
      await load()
    } catch (err) {
      alert('예문 삭제 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleTransition = async (row, next) => {
    setBusy(true)
    try {
      await setApprovalStatus(row.id, next, adminPin)
      await load()
    } catch (err) {
      alert('상태 변경 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleAiGenerate = async () => {
    const res = await generateCandidateExamples({
      unitId: filters.unitId || null,
      textbookId: filters.textbookId || null,
    })
    setAiNote(res.ok ? `생성됨: ${res.candidates.length}건` : `아직 구현되지 않았어요(${res.reason}) — 규칙/AI 생성기는 후속 Phase 범위입니다.`)
  }

  if (!metaLoaded) return <p className="text-xs text-gray-400 py-2">불러오는 중...</p>

  return (
    <div className="space-y-3">
      {examplesDisabled && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-3 text-xs font-bold text-orange-700">
          ⚠️ 예문 기능은 supabase_v3_13 실행 후 사용 가능해요. (관리자: supabase_v3_13_curriculum_engine_phase0.sql을 Supabase SQL Editor에서 실행)
        </div>
      )}

      {/* 필터 바 */}
      <div className="bg-white rounded-xl p-3 card-shadow space-y-1.5">
        <p className="text-xs font-black text-gray-700">필터</p>
        <div className="grid grid-cols-2 gap-1.5">
          <select value={filters.publisherId} onChange={(e) => setFilters((f) => ({ ...f, publisherId: e.target.value }))}
            className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">출판사 전체</option>
            {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filters.gradeId} onChange={(e) => setFilters((f) => ({ ...f, gradeId: e.target.value }))}
            className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">학년 전체</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={filters.textbookId} onChange={(e) => setFilters((f) => ({ ...f, textbookId: e.target.value, unitId: '' }))}
            className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">교재 전체</option>
            {textbooksMeta.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={filters.unitId} onChange={(e) => setFilters((f) => ({ ...f, unitId: e.target.value }))}
            disabled={!filters.textbookId}
            className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-40">
            <option value="">유닛 전체</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={filters.grammarPointId} onChange={(e) => setFilters((f) => ({ ...f, grammarPointId: e.target.value }))}
            className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">문법 전체</option>
            {grammarPoints.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
          <select value={filters.approvalStatus} onChange={(e) => setFilters((f) => ({ ...f, approvalStatus: e.target.value }))}
            className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">상태 전체</option>
            {APPROVAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <input
          value={filters.targetWord}
          onChange={(e) => setFilters((f) => ({ ...f, targetWord: e.target.value }))}
          placeholder="대상 단어 검색"
          className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5"
        />
      </div>

      {/* AI 생성(준비 중) */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-1">
        <button onClick={handleAiGenerate}
          className="w-full bg-gray-200 text-gray-500 font-black px-3 py-2 rounded-xl text-xs btn-press">
          🤖 AI 예문 생성(준비 중)
        </button>
        {aiNote && <p className="text-[11px] text-gray-500">{aiNote}</p>}
      </div>

      {/* 목록 */}
      <div className="space-y-2">
        {!rowsLoaded && <p className="text-xs text-gray-400 py-2">예문 불러오는 중...</p>}
        {rowsLoaded && rows.length === 0 && <p className="text-xs text-gray-400 py-2">조건에 맞는 예문이 없어요.</p>}
        {rows.map((row) => (
          <div key={row.id} className="bg-white rounded-xl p-3 card-shadow space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-indigo-500 font-mono">
                  {SOURCE_BADGE[row.source] || '❓'} {row.targetWord}
                </p>
                <p className="text-sm font-bold text-gray-800 break-words">{row.englishSentence}</p>
                {row.koreanTranslation && <p className="text-xs text-gray-500">{row.koreanTranslation}</p>}
              </div>
              <span className={`flex-shrink-0 text-[10px] font-black px-2 py-1 rounded-full ${STATUS_STYLE[row.approvalStatus] || 'bg-gray-100 text-gray-500'}`}>
                {row.approvalStatus}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {APPROVAL_STATUSES.filter((s) => canTransition(row.approvalStatus, s)).map((s) => (
                <button key={s} onClick={() => handleTransition(row, s)} disabled={busy}
                  className="text-[11px] font-bold bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 btn-press disabled:opacity-40">
                  {transitionLabel(row.approvalStatus, s)}
                </button>
              ))}
              <button onClick={() => startEdit(row)} disabled={busy}
                className="text-[11px] font-bold bg-blue-50 text-blue-700 rounded-lg px-2 py-1 btn-press disabled:opacity-40">
                수정
              </button>
              <button onClick={() => handleDelete(row)} disabled={busy}
                className="text-[11px] font-bold bg-red-50 text-red-600 rounded-lg px-2 py-1 btn-press disabled:opacity-40">
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 생성/수정 폼 */}
      {showForm ? (
        <div className="bg-white rounded-xl p-3 card-shadow space-y-1.5">
          <p className="text-xs font-black text-gray-700">{form.id ? '예문 수정' : '새 예문'}</p>
          <input value={form.targetWord} onChange={(e) => setForm((f) => ({ ...f, targetWord: e.target.value }))}
            placeholder="대상 단어(target_word)" className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5" />
          <input value={form.englishSentence} onChange={(e) => setForm((f) => ({ ...f, englishSentence: e.target.value }))}
            placeholder="영어 문장(대상 단어를 온전한 단어로 포함)" className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5" />
          <input value={form.koreanTranslation} onChange={(e) => setForm((f) => ({ ...f, koreanTranslation: e.target.value }))}
            placeholder="한국어 번역(선택)" className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5" />
          <select value={form.textbookId} onChange={(e) => setForm((f) => ({ ...f, textbookId: e.target.value }))}
            className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">교재 정렬 안 함(범용)</option>
            {textbooksMeta.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={form.grammarPointId} onChange={(e) => setForm((f) => ({ ...f, grammarPointId: e.target.value }))}
            className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">문법 포인트 선택 안 함</option>
            {grammarPoints.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
          <select value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
            className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>난이도 {d}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
            <input type="checkbox" checked={form.approveImmediately} onChange={(e) => setForm((f) => ({ ...f, approveImmediately: e.target.checked }))} />
            즉시 승인(교사 직접 작성 — 검수 없이 학생에게 바로 노출)
          </label>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={busy || !form.targetWord.trim() || !form.englishSentence.trim()}
              className="flex-1 bg-indigo-500 disabled:bg-gray-300 text-white font-black px-3 py-2 rounded-xl text-xs btn-press">
              저장
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }} className="flex-1 bg-gray-100 text-gray-500 font-black px-3 py-2 rounded-xl text-xs btn-press">
              취소
            </button>
          </div>
        </div>
      ) : (
        <button onClick={startCreate}
          className="w-full bg-indigo-500 text-white font-black px-3 py-2 rounded-xl text-xs btn-press">
          + 새 예문 추가
        </button>
      )}
    </div>
  )
}
