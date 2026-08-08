import { useMemo, useState } from 'react'
import { listUnitsMeta, listUnitWords } from '../../utils/curriculum/curriculumApi'
import { listExamples, createExample, setApprovalStatus } from '../../utils/curriculum/exampleLibrary'
import { splitIntoSentences, matchWordsToSentences, duplicateKey } from '../../utils/curriculum/textImport'
import { generateCandidateExamples } from '../../utils/curriculum/generatorContract'

// TextImportPanel.jsx — 관리자 > 커리큘럼 > 예문 "본문 가져오기"(2026-08-09).
//
// 운영자가 제공한 교과서/학평 영어 본문에서 선택 Unit의 단어가 실제로
// 쓰인 문장을 찾아, 그 문장을 원문 그대로 예문으로 연결한다(SOURCE TEXT
// FIRST — AI 임의 생성이 아니라 실존 문장 연결이 1순위, AI는 본문에 없는
// 단어의 보충 수단으로만 유지).
//
// 설계 원칙(신규 시스템 없음 — 전부 기존 재사용):
//  - 데이터: 기존 examples 테이블 그대로. source='import'(v3_13 CHECK에
//    이미 있는 값), 영어 원문은 english_sentence / 한국어 해석은
//    korean_translation 별도 필드(기존 스키마 그대로 — 신규 컬럼 0개).
//    출처(학교/학년/교재/Unit)는 unit_id/textbook_id FK 경유(교재가
//    grade_id/publisher_id를 가짐) — 중복 필드를 만들지 않는다.
//  - 매칭: textImport.js 순수 모듈(원문 무변경/whole-word/형태 변화는
//    '검토 필요' 구분).
//  - 저장: createExample(source:'import')는 exampleLibrary의 소스 가드로
//    항상 draft로 생성된다(auto-publish 구조적 차단 유지). 관리자가 이
//    화면에서 문장을 하나하나 보고 승인했으므로, 저장 직후 기존 상태머신
//    경로(draft→pending→approved, canTransition 그대로)로 전이시킨다 —
//    검수함(ApprovalQueue)을 우회하는 새 경로를 만들지 않고 같은 전이
//    규칙을 통과한다.
//  - 중복(운영자 지시 11): 같은 target_word+문장(공백/대소문자 정규화)이
//    같은 교재+Unit에 이미 있으면 "이미 등록된 예문"으로 표시하고 저장하지
//    않는다(listExamples로 선조회, DB 스키마 변경 없음).
export default function TextImportPanel({ grades, textbooksMeta, grammarPoints, adminPin, onSaved }) {
  const [gradeId, setGradeId] = useState('')
  const [textbookId, setTextbookId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [units, setUnits] = useState([])
  const [sourceText, setSourceText] = useState('')

  const [analysis, setAnalysis] = useState(null) // { results, unmatched, existingKeys, sentenceCount, wordCount }
  const [busy, setBusy] = useState(false)
  const [saveNote, setSaveNote] = useState(null)
  const [aiNotes, setAiNotes] = useState({}) // word -> note
  // 후보 키(`${word}#${sentenceIndex}`) -> { selected, ko, grammarPointId }
  const [drafts, setDrafts] = useState({})

  // 교재 목록: 학교/학년을 고르면 그 학년의 교재만(ExampleManager의
  // availableTextbooks와 같은 판정 — 메타 미부착 교재는 학년 선택 시 제외).
  const availableTextbooks = useMemo(
    () => (textbooksMeta || []).filter((t) => !gradeId || t.gradeId === gradeId),
    [textbooksMeta, gradeId],
  )

  const handleGradeChange = (v) => {
    setGradeId(v)
    if (textbookId && !(textbooksMeta || []).some((t) => t.id === textbookId && (!v || t.gradeId === v))) {
      setTextbookId(''); setUnitId(''); setUnits([])
    }
  }

  const handleTextbookChange = async (v) => {
    setTextbookId(v)
    setUnitId('')
    setUnits([])
    if (!v) return
    const { rows } = await listUnitsMeta(v)
    setUnits(rows)
  }

  const candidateKeyOf = (word, sentenceIndex) => `${word}#${sentenceIndex}`

  const handleAnalyze = async () => {
    if (!textbookId || !unitId) { alert('교재와 Unit을 먼저 선택해주세요.'); return }
    if (!sourceText.trim()) { alert('영어 본문을 붙여넣어 주세요.'); return }
    setBusy(true)
    setSaveNote(null)
    try {
      const [{ rows: unitWords }, { rows: existingRows }] = await Promise.all([
        listUnitWords(unitId),
        // 중복 판정용 기존 예문 — 같은 교재+Unit 범위만(운영자 지시 11의 조합).
        listExamples({ textbookId, unitId }, { limit: 500 }),
      ])
      if (unitWords.length === 0) {
        alert('이 Unit에 등록된 단어가 없어요 — 단어를 먼저 등록해주세요.')
        return
      }
      const sentences = splitIntoSentences(sourceText)
      if (sentences.length === 0) {
        alert('본문에서 문장을 찾지 못했어요.')
        return
      }
      const matched = matchWordsToSentences(unitWords, sentences)
      const existingKeys = new Set(existingRows.map((r) => duplicateKey(r.targetWord, r.englishSentence)))
      const results = matched.filter((r) => r.matches.length > 0)
      const unmatched = matched.filter((r) => r.matches.length === 0)
      // 기본 선택: exact 매칭이면서 중복이 아닌 후보만 체크 on(형태 변화
      // '검토 필요'는 자동 확정하지 않음 — 운영자 지시 3번).
      const nextDrafts = {}
      results.forEach((r) => {
        r.matches.forEach((m) => {
          const dup = existingKeys.has(duplicateKey(r.word, m.sentence))
          nextDrafts[candidateKeyOf(r.word, m.sentenceIndex)] = {
            selected: m.matchType === 'exact' && !dup,
            ko: '',
            grammarPointId: '',
          }
        })
      })
      setDrafts(nextDrafts)
      setAiNotes({})
      setAnalysis({ results, unmatched, existingKeys, sentenceCount: sentences.length, wordCount: unitWords.length })
    } catch (err) {
      alert('본문 분석 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const updateDraft = (key, patch) => setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }))

  // 저장 — 선택된(exact) 후보만. 문장은 분석 결과의 원문 그대로(무변경),
  // 한국어 해석은 관리자가 입력한 값만 별도 필드로 저장(비워도 됨 — AI
  // 자동 번역은 유료 API 없는 현 인프라에서 만들지 않음, CLAUDE.md 규칙 7.
  // 필요 시 기존 예문 "수정" 폼으로 나중에 채울 수 있다).
  const handleSaveSelected = async () => {
    if (!analysis) return
    const jobs = []
    analysis.results.forEach((r) => {
      r.matches.forEach((m) => {
        const key = candidateKeyOf(r.word, m.sentenceIndex)
        const d = drafts[key]
        if (!d?.selected) return
        if (m.matchType !== 'exact') return // '검토 필요'는 저장 대상이 아님(아래 안내 문구)
        if (analysis.existingKeys.has(duplicateKey(r.word, m.sentence))) return // 이미 등록된 예문
        jobs.push({ word: r.word, wordId: r.wordId, sentence: m.sentence, ko: d.ko, grammarPointId: d.grammarPointId })
      })
    })
    if (jobs.length === 0) { alert('저장할 후보가 없어요 — 체크된 예문이 있는지 확인해주세요.'); return }
    if (!window.confirm(`선택한 예문 ${jobs.length}건을 저장하고 승인할까요?\n(영어 원문은 본문 그대로 저장됩니다)`)) return

    setBusy(true)
    let saved = 0
    const errors = []
    try {
      for (const job of jobs) {
        try {
          const created = await createExample({
            target_word: job.word,
            english_sentence: job.sentence,
            korean_translation: job.ko || null,
            unit_id: unitId,
            textbook_id: textbookId,
            word_id: job.wordId,
            grammar_point_id: job.grammarPointId || null,
            source: 'import',
          }, adminPin)
          // 관리자가 방금 눈으로 검수·선택한 문장 — 표준 전이 경로로 승인.
          await setApprovalStatus(created.id, 'pending', adminPin)
          await setApprovalStatus(created.id, 'approved', adminPin)
          analysis.existingKeys.add(duplicateKey(job.word, job.sentence))
          saved++
        } catch (err) {
          errors.push(`${job.word}: ${err.message || err}`)
        }
      }
      setSaveNote(
        errors.length === 0
          ? `✅ ${saved}건 저장·승인 완료`
          : `${saved}건 저장·승인, ${errors.length}건 실패 — ${errors.join(' / ')}`,
      )
      // 저장분은 중복으로 재표시되도록 분석 상태만 갱신(재분석 불필요).
      setAnalysis((a) => ({ ...a }))
      if (saved > 0 && onSaved) await onSaved()
    } finally {
      setBusy(false)
    }
  }

  // 본문에 없는 단어 — 기존 AI 생성 계약을 보충 수단으로 그대로 재사용
  // (현재 not_implemented 스텁 — 이 패널은 계약 호출만, 구현은 후속 Phase).
  const handleAiSupplement = async (word) => {
    const res = await generateCandidateExamples({ unitId, textbookId, targetWord: word })
    setAiNotes((n) => ({
      ...n,
      [word]: res.ok
        ? `후보 ${res.candidates.length}건 생성됨 — 검수함에서 확인하세요.`
        : 'AI 보충 예문은 아직 준비 중이에요 — 본문 예문이 없는 단어는 기존 "새 예문 추가" 폼으로 직접 넣을 수 있어요.',
    }))
  }

  const selectedCount = analysis
    ? analysis.results.reduce((sum, r) => sum + r.matches.filter((m) => {
        const d = drafts[candidateKeyOf(r.word, m.sentenceIndex)]
        return d?.selected && m.matchType === 'exact' && !analysis.existingKeys.has(duplicateKey(r.word, m.sentence))
      }).length, 0)
    : 0

  return (
    <div className="bg-white rounded-xl p-3 card-shadow space-y-2 border-2 border-indigo-100">
      <p className="text-xs font-black text-indigo-700">📥 본문 가져오기 — 교과서/학평 본문 속 실제 문장을 예문으로 연결</p>
      <p className="text-[11px] text-gray-500">
        본문 원문은 절대 수정되지 않아요. Unit 단어가 실제로 쓰인 문장만 찾아 원문 그대로 예문(source: 📥 본문)으로 저장합니다.
      </p>

      {/* 출처 선택 — 학교/학년(grades) → 교재 → Unit. 출처는 별도 필드가
          아니라 unit_id/textbook_id FK로 보존된다(교재가 학년/출판사 연결). */}
      <div className="grid grid-cols-3 gap-1.5">
        <select value={gradeId} onChange={(e) => handleGradeChange(e.target.value)}
          aria-label="학교/학년 선택"
          className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">학교/학년 전체</option>
          {(grades || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={textbookId} onChange={(e) => handleTextbookChange(e.target.value)}
          aria-label="교재 선택"
          className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">교재 선택</option>
          {availableTextbooks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!textbookId}
          aria-label="Unit 선택"
          className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-40">
          <option value="">Unit 선택</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      <textarea
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        placeholder="영어 본문 전체를 여기에 붙여넣으세요 (원문 그대로 — 수정되지 않아요)"
        aria-label="영어 본문 입력"
        rows={8}
        className="w-full text-xs font-medium border border-gray-200 rounded-lg px-2 py-1.5 leading-relaxed"
      />

      <button onClick={handleAnalyze} disabled={busy || !textbookId || !unitId || !sourceText.trim()}
        className="w-full bg-indigo-500 disabled:bg-gray-300 text-white font-black px-3 py-2 rounded-xl text-xs btn-press">
        {busy ? '⏳ 처리 중...' : '🔍 본문 분석 및 단어 매칭'}
      </button>

      {analysis && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-gray-600">
            문장 {analysis.sentenceCount}개 · Unit 단어 {analysis.wordCount}개 중
            본문 발견 {analysis.results.length}개 / 미발견 {analysis.unmatched.length}개
          </p>

          {/* ── 본문에서 발견된 단어 — 문장별 승인/제외 ── */}
          {analysis.results.map((r) => (
            <div key={r.word} className="bg-green-50/60 border border-green-200 rounded-xl p-2.5 space-y-1.5">
              <p className="text-xs font-black text-green-800">✓ {r.word} <span className="font-normal text-green-600">본문 발견 {r.matches.length}건</span></p>
              {r.matches.map((m) => {
                const key = candidateKeyOf(r.word, m.sentenceIndex)
                const d = drafts[key] || {}
                const isDup = analysis.existingKeys.has(duplicateKey(r.word, m.sentence))
                return (
                  <div key={key} className={`rounded-lg p-2 space-y-1 ${isDup ? 'bg-gray-100' : 'bg-white'}`}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={!!d.selected && !isDup && m.matchType === 'exact'}
                        disabled={isDup || m.matchType !== 'exact'}
                        onChange={(e) => updateDraft(key, { selected: e.target.checked })}
                        aria-label={`${r.word} 예문 승인`}
                        className="mt-0.5 w-4 h-4 accent-indigo-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 break-words">“{m.sentence}”</p>
                        {isDup && <p className="text-[10px] font-bold text-gray-400">이미 등록된 예문이에요 — 중복 저장하지 않아요.</p>}
                        {!isDup && m.matchType === 'inflected' && (
                          <p className="text-[10px] font-bold text-amber-600">
                            ⚠ 검토 필요 — 형태 변화형으로만 등장해요(원형이 문장에 없음). 빈칸 학습 규칙상 이 형태로는 자동 저장하지
                            않아요. 필요하면 &quot;새 예문 추가&quot; 폼에서 직접 등록하세요.
                          </p>
                        )}
                      </div>
                    </div>
                    {!isDup && m.matchType === 'exact' && (
                      <div className="grid grid-cols-2 gap-1.5 pl-6">
                        <input value={d.ko || ''} onChange={(e) => updateDraft(key, { ko: e.target.value })}
                          placeholder="한국어 해석(선택 — 나중에 추가 가능)"
                          aria-label={`${r.word} 한국어 해석`}
                          className="text-[11px] font-medium border border-gray-200 rounded-lg px-2 py-1" />
                        <select value={d.grammarPointId || ''} onChange={(e) => updateDraft(key, { grammarPointId: e.target.value })}
                          aria-label={`${r.word} 문법 포인트`}
                          className="text-[11px] font-bold border border-gray-200 rounded-lg px-2 py-1 bg-white">
                          <option value="">문법 포인트 없음</option>
                          {(grammarPoints || []).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {/* ── 본문에서 찾지 못한 단어 — AI 보충(기존 계약 재사용) ── */}
          {analysis.unmatched.length > 0 && (
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-2.5 space-y-1.5">
              <p className="text-xs font-black text-amber-800">⚠ 본문에서 찾지 못한 단어 ({analysis.unmatched.length})</p>
              <p className="text-[10px] text-amber-700">본문 예문이 1순위(SOURCE TEXT FIRST) — 아래 단어만 AI 보충 대상이에요.</p>
              {analysis.unmatched.map((r) => (
                <div key={r.word} className="flex items-center justify-between gap-2 bg-white rounded-lg px-2 py-1.5">
                  <p className="text-xs font-bold text-gray-700">{r.word}</p>
                  <button onClick={() => handleAiSupplement(r.word)} disabled={busy}
                    className="text-[11px] font-bold bg-gray-100 text-gray-500 rounded-lg px-2 py-1 btn-press disabled:opacity-40 whitespace-nowrap">
                    🤖 AI 보충 예문 생성
                  </button>
                </div>
              ))}
              {Object.entries(aiNotes).map(([w, note]) => (
                <p key={w} className="text-[10px] text-gray-500">· {w}: {note}</p>
              ))}
            </div>
          )}

          <button onClick={handleSaveSelected} disabled={busy || selectedCount === 0}
            className="w-full bg-green-600 disabled:bg-gray-300 text-white font-black px-3 py-2 rounded-xl text-xs btn-press">
            {busy ? '⏳ 저장 중...' : `✅ 선택한 예문 ${selectedCount}건 저장·승인`}
          </button>
          {saveNote && <p className="text-[11px] font-bold text-gray-600">{saveNote}</p>}
        </div>
      )}
    </div>
  )
}
