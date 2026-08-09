import { useMemo, useState } from 'react'
import { listUnitsMeta, listUnitWords } from '../../utils/curriculum/curriculumApi'
import { listExamples, createExample, setApprovalStatus } from '../../utils/curriculum/exampleLibrary'
import { parseBilingualPassage, matchWordsToSentences, duplicateKey, preferManualKo } from '../../utils/curriculum/textImport'
import { suggestPracticeSentence, validatePracticeSentence } from '../../utils/curriculum/practiceSentence'
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

  const [analysis, setAnalysis] = useState(null) // { results, unmatched, existingKeys, unitAssets, sentenceCount, wordCount }
  const [busy, setBusy] = useState(false)
  const [saveNote, setSaveNote] = useState(null)
  const [aiNotes, setAiNotes] = useState({}) // word -> note
  // word -> { targetWord, englishSentence, koreanTranslation } — 규칙 기반
  // 보충 후보(기존 단어 자산 재사용). 저장 시 draft→pending으로만 보낸다
  // (생성 예문은 검수함 통과 필수 — 이 화면에서 즉시 승인하지 않음).
  const [supplements, setSupplements] = useState({})
  const [supplementBusyWord, setSupplementBusyWord] = useState(null)
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
      // 이중 언어 파싱(2026-08-09) — "영어 문장 다음 줄 한국어 번역" 형식을
      // 자동 짝짓기. 한국어가 없으면 pairs가 기존 splitIntoSentences 결과와
      // 동일하므로(ko 전부 null) 영어 전용 본문의 기존 동작은 그대로다.
      // 번역은 입력값을 연결만 함(생성/의역 없음) — 불확실하면 ko=null.
      const { pairs, hasKorean } = parseBilingualPassage(sourceText)
      const sentences = pairs.map((p) => p.en)
      const koBySentence = pairs.map((p) => p.ko)
      if (sentences.length === 0) {
        alert('본문에서 문장을 찾지 못했어요.')
        return
      }
      const matched = matchWordsToSentences(unitWords, sentences)
      const existingKeys = new Set(existingRows.map((r) => duplicateKey(r.targetWord, r.englishSentence)))
      const results = matched.filter((r) => r.matches.length > 0)
      const unmatched = matched.filter((r) => r.matches.length === 0)
      // unitWords를 분석 결과에 보관 — 미발견 단어의 규칙 기반 보충 후보
      // (generateCandidateExamples의 wordAssets 입력, 추가 조회 없음).
      const unitAssets = unitWords.map((w) => ({ word: w.word, exampleText: w.exampleText, exampleTranslation: w.exampleTranslation }))
      // 기본 선택: exact 매칭이면서 중복이 아닌 후보만 체크 on(형태 변화
      // '검토 필요'는 자동 확정하지 않음 — 운영자 지시 3번).
      const nextDrafts = {}
      results.forEach((r) => {
        r.matches.forEach((m) => {
          const key = candidateKeyOf(r.word, m.sentenceIndex)
          const dup = existingKeys.has(duplicateKey(r.word, m.sentence))
          // 한국어 해석 프리필: 자동 매칭된 번역. 단, 재분석 전에 관리자가
          // 이미 손으로 입력해 둔 값이 있으면 그 값을 우선 보존한다
          // (운영자 지시 10 — 수동 입력을 자동 분석이 덮어쓰지 않음).
          // 본문 핵심 표현 자동 추출(2026-08-09 정책 전환) — 본문 문장에서
          // target이 든 chunk를 그대로 잘라 제안(source.includes(chunk)
          // 구조 보장). 새 문장/단어 자산 제안 전면 금지. 실패 시 빈칸.
          // 재분석 시 수동 수정값 우선 보존(ko와 동일 규칙).
          const suggestion = m.matchType === 'exact'
            ? suggestPracticeSentence({ targetWord: r.word, sourceSentence: m.sentence })
            : null
          nextDrafts[key] = {
            selected: m.matchType === 'exact' && !dup,
            ko: preferManualKo(drafts[key]?.ko, koBySentence[m.sentenceIndex]),
            practice: preferManualKo(drafts[key]?.practice, suggestion?.sentence || ''),
            grammarPointId: drafts[key]?.grammarPointId || '',
          }
        })
      })
      setDrafts(nextDrafts)
      setAiNotes({})
      setSupplements({})
      setAnalysis({ results, unmatched, existingKeys, unitAssets, koBySentence, hasKorean, sentenceCount: sentences.length, wordCount: unitWords.length })
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
        jobs.push({ word: r.word, wordId: r.wordId, sentence: m.sentence, sentenceIndex: m.sentenceIndex, ko: d.ko, practice: (d.practice || '').trim(), grammarPointId: d.grammarPointId })
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
          // 핵심 표현 저장 전 최종 검증(2026-08-09 정책) — target 포함 +
          // **본문 substring**이 아니면 저장 차단(새 문장/의역 금지를 저장
          // 계층에서도 강제).
          if (job.practice) {
            const pv = validatePracticeSentence(job.word, job.practice, job.sentence)
            if (!pv.ok) throw new Error(`본문 핵심 표현 검증 실패 — ${pv.warnings[0]}`)
          }
          const created = await createExample({
            target_word: job.word,
            english_sentence: job.sentence,
            practice_sentence: job.practice || null,
            korean_translation: job.ko || null,
            unit_id: unitId,
            textbook_id: textbookId,
            word_id: job.wordId,
            grammar_point_id: job.grammarPointId || null,
            source: 'import',
            // provenance(v3_31 additive 컬럼, 부재 시 exampleLibrary가 자동
            // 폴백) — 본문 몇 번째 문장에서 왔는지. 교재/유닛/단어는 위
            // FK가 이미 담당(중복 저장 안 함).
            source_meta: { origin: 'textbook_passage', sentence_index: job.sentenceIndex },
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

  // 본문에 없는 단어 — 규칙 기반 보충(2026-08-09 구현): 기존 단어 자산
  // (words.example_text)을 generateCandidateExamples(순수 계약)에 넘겨 후보를
  // 받는다. AI 호출 0 — 새 문장을 지어내지 않고 이미 검수된 자산만 재사용.
  const handleAiSupplement = async (word) => {
    const res = await generateCandidateExamples({
      unitId, textbookId, targetWords: [word],
      wordAssets: analysis?.unitAssets || [],
    })
    if (res.ok && res.candidates[0]) {
      setSupplements((s) => ({ ...s, [word]: res.candidates[0] }))
      setAiNotes((n) => ({ ...n, [word]: null }))
    } else {
      setAiNotes((n) => ({
        ...n,
        [word]: res.reason === 'no_valid_candidates'
          ? '재사용할 단어 자산 예문이 없어요(자산 미생성 또는 검증 불통과) — "새 예문 추가" 폼으로 직접 넣을 수 있어요.'
          : '보충 후보를 만들 수 없어요 — "새 예문 추가" 폼으로 직접 넣을 수 있어요.',
      }))
    }
  }

  // 보충 후보 저장 — source='rule'로 draft 생성 후 pending까지만 전이
  // (검수함에서 승인해야 학생 노출 — 본문 승인 흐름과 달리 여기서
  // approved로 보내지 않는다: 자산 예문은 이 화면에서 문장 맥락 검토를
  // 거치지 않았으므로 생성 예문 취급).
  const handleSaveSupplement = async (word) => {
    const cand = supplements[word]
    if (!cand) return
    if (analysis.existingKeys.has(duplicateKey(cand.targetWord, cand.englishSentence))) {
      setAiNotes((n) => ({ ...n, [word]: '이미 등록된 예문이에요 — 중복 저장하지 않아요.' }))
      return
    }
    setSupplementBusyWord(word)
    try {
      const created = await createExample({
        target_word: cand.targetWord,
        english_sentence: cand.englishSentence,
        korean_translation: cand.koreanTranslation || null,
        unit_id: unitId,
        textbook_id: textbookId,
        word_id: (analysis.unmatched.find((r) => r.word === word) || {}).wordId || null,
        source: 'rule',
        source_meta: { origin: 'word_asset' },
      }, adminPin)
      await setApprovalStatus(created.id, 'pending', adminPin)
      analysis.existingKeys.add(duplicateKey(cand.targetWord, cand.englishSentence))
      setSupplements((s) => ({ ...s, [word]: null }))
      setAiNotes((n) => ({ ...n, [word]: '📤 검수함(pending)으로 보냈어요 — 승인해야 학생에게 노출돼요.' }))
      if (onSaved) await onSaved()
    } catch (err) {
      setAiNotes((n) => ({ ...n, [word]: '보충 예문 저장 실패: ' + (err.message || err) }))
    } finally {
      setSupplementBusyWord(null)
    }
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

      {analysis && (() => {
        // 분석 요약 카운트(운영자 지시 11) — 렌더마다 파생 계산(상태 아님).
        const allMatches = analysis.results.flatMap((r) => r.matches.map((m) => ({ ...m, word: r.word })))
        const stat = {
          exact: allMatches.filter((m) => m.matchType === 'exact').length,
          inflected: allMatches.filter((m) => m.matchType === 'inflected').length,
          ambiguous: allMatches.filter((m) => m.matchType === 'ambiguous').length,
          dup: allMatches.filter((m) => analysis.existingKeys.has(duplicateKey(m.word, m.sentence))).length,
          // 해석 매칭 N/M(운영자 지시 8): M = 발견된 영어 예문 총수,
          // N = 해석까지 연결된 예문 수(자동 매칭 또는 수동 입력).
          koPaired: allMatches.filter((m) =>
            (drafts[candidateKeyOf(m.word, m.sentenceIndex)]?.ko || '').trim()
            || analysis.koBySentence[m.sentenceIndex]).length,
        }
        return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
            <span className="bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">단어 {analysis.wordCount}</span>
            <span className="bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">문장 {analysis.sentenceCount}</span>
            <span className="bg-green-100 text-green-700 rounded-full px-2 py-0.5">✓ 정확 일치 {stat.exact}</span>
            <span className="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">⚠ 형태 변화 {stat.inflected}</span>
            {stat.ambiguous > 0 && <span className="bg-red-100 text-red-600 rounded-full px-2 py-0.5">❓ 중의적 {stat.ambiguous}</span>}
            <span className="bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">미발견 {analysis.unmatched.length}</span>
            {analysis.hasKorean && (
              <span className="bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                해석 매칭 {stat.koPaired}/{allMatches.length}
              </span>
            )}
            {stat.dup > 0 && <span className="bg-gray-200 text-gray-500 rounded-full px-2 py-0.5">중복 {stat.dup}</span>}
            <span className="bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">승인 예정 {selectedCount}</span>
          </div>

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
                        {!isDup && m.matchType === 'ambiguous' && (
                          <p className="text-[10px] font-bold text-red-500">
                            ❓ 중의적 — 이 변화형은 유닛의 다른 단어와도 겹쳐요(예: leaves = leaf/leave). 어느 단어의 예문인지
                            사람이 판단해야 하므로 자동 저장하지 않아요.
                          </p>
                        )}
                      </div>
                    </div>
                    {/* 이중 언어 본문인데 이 문장만 번역 짝을 못 찾은 경우 —
                        임의 번역을 만들지 않고 미매칭으로 정직하게 표시
                        (운영자 지시 11). 직접 입력으로 보완 가능. */}
                    {!isDup && m.matchType === 'exact' && analysis.hasKorean
                      && !analysis.koBySentence[m.sentenceIndex] && !(d.ko || '').trim() && (
                      <p className="pl-6 text-[10px] font-bold text-orange-500">⚠ 한국어 해석 미매칭 — 아래 칸에 직접 입력할 수 있어요.</p>
                    )}
                    {/* 본문 핵심 표현(2026-08-09 정책) — 본문에서 그대로 잘라낸
                        chunk만 허용(substring 실시간 검증). 관리자는 경계를
                        조정할 수 있으나 본문에 없는 문장은 저장 불가. */}
                    {!isDup && m.matchType === 'exact' && (() => {
                      const v = (d.practice || '').trim()
                      const pv = v ? validatePracticeSentence(r.word, v, m.sentence) : null
                      return (
                        <div className="pl-6 space-y-0.5">
                          <input value={d.practice || ''} onChange={(e) => updateDraft(key, { practice: e.target.value })}
                            placeholder="✂️ 본문 핵심 표현(본문에서 그대로 추출, 4~10단어 — 비우면 문장 전체 사용)"
                            aria-label={`${r.word} 본문 핵심 표현`}
                            className="w-full text-[11px] font-medium border border-indigo-200 rounded-lg px-2 py-1" />
                          {pv && !pv.ok && <p className="text-[10px] font-bold text-red-500">{pv.warnings[0]}</p>}
                          {pv && pv.ok && pv.warnings.map((w) => <p key={w} className="text-[10px] font-bold text-amber-600">{w}</p>)}
                        </div>
                      )
                    })()}
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
                <div key={r.word} className="bg-white rounded-lg px-2 py-1.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-gray-700">{r.word}</p>
                    <button onClick={() => handleAiSupplement(r.word)} disabled={busy}
                      className="text-[11px] font-bold bg-gray-100 text-gray-500 rounded-lg px-2 py-1 btn-press disabled:opacity-40 whitespace-nowrap">
                      ⚙️ 보충 예문 후보(단어 자산 재사용)
                    </button>
                  </div>
                  {supplements[r.word] && (
                    <div className="border border-gray-200 rounded-lg p-2 space-y-1">
                      <p className="text-xs font-bold text-gray-800 break-words">“{supplements[r.word].englishSentence}”</p>
                      {supplements[r.word].koreanTranslation && (
                        <p className="text-[11px] text-gray-500">{supplements[r.word].koreanTranslation}</p>
                      )}
                      <button onClick={() => handleSaveSupplement(r.word)} disabled={supplementBusyWord === r.word}
                        className="text-[11px] font-bold bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 btn-press disabled:opacity-40">
                        {supplementBusyWord === r.word ? '⏳ 저장 중...' : '📤 검수함으로 저장(pending)'}
                      </button>
                    </div>
                  )}
                  {aiNotes[r.word] && <p className="text-[10px] text-gray-500">{aiNotes[r.word]}</p>}
                </div>
              ))}
            </div>
          )}

          <button onClick={handleSaveSelected} disabled={busy || selectedCount === 0}
            className="w-full bg-green-600 disabled:bg-gray-300 text-white font-black px-3 py-2 rounded-xl text-xs btn-press">
            {busy ? '⏳ 저장 중...' : `✅ 선택한 예문 ${selectedCount}건 저장·승인`}
          </button>
          {saveNote && <p className="text-[11px] font-bold text-gray-600">{saveNote}</p>}
        </div>
        )
      })()}
    </div>
  )
}
