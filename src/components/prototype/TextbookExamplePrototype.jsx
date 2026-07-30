import React, { useMemo, useState } from 'react'
import { playWordAudio } from '../../utils/speech'
import {
  listGrades,
  listTextbooks,
  listUnits,
  makeFillBlank,
  checkAnswer,
} from '../../utils/textbookExampleModel'

// 교과서 예문(교과서-연계 오리지널 예문) 프로토타입.
//
// 완전히 자기완결(self-contained) 컴포넌트다 — 로컬 useState와
// textbookExampleModel.js의 순수 함수, textbookExamples.js의 정적 샘플
// 데이터만 쓴다. DB/네트워크에 아무것도 읽거나 쓰지 않는다(오디오 재생만
// 예외 — playWordAudio는 기존 발음 재생 유틸을 그대로 재사용).
//
// 관리자 전용 DebugPage 안에서만 마운트된다. 학생이 보는 화면 어디에도
// 연결되지 않는다 — 새로운 학생 대상 라우트/기능이 아니다.
export default function TextbookExamplePrototype() {
  const [mode, setMode] = useState('teacher') // 'teacher' | 'student'

  // ── 교사 워크플로우 상태 ──────────────────────────────────────────────
  const grades = useMemo(() => listGrades(), [])
  const [grade, setGrade] = useState(grades[0] || '')
  const textbooks = useMemo(() => listTextbooks(grade), [grade])
  const [textbook, setTextbook] = useState(textbooks[0] || '')
  const units = useMemo(() => listUnits(grade, textbook), [grade, textbook])
  const [unitId, setUnitId] = useState(units[0]?.id || '')
  const unit = units.find((u) => u.id === unitId) || units[0] || null

  const [selectedWords, setSelectedWords] = useState(() => new Set())
  const [generated, setGenerated] = useState(false)
  const [approved, setApproved] = useState(() => new Set()) // key: `${word}|${en}`
  const [published, setPublished] = useState(null) // array of {word, meaning, en, ko} | null

  function onGradeChange(g) {
    setGrade(g)
    const tbs = listTextbooks(g)
    const nextTb = tbs[0] || ''
    setTextbook(nextTb)
    const us = listUnits(g, nextTb)
    setUnitId(us[0]?.id || '')
    resetWorkflow()
  }
  function onTextbookChange(tb) {
    setTextbook(tb)
    const us = listUnits(grade, tb)
    setUnitId(us[0]?.id || '')
    resetWorkflow()
  }
  function onUnitChange(id) {
    setUnitId(id)
    resetWorkflow()
  }
  function resetWorkflow() {
    setSelectedWords(new Set())
    setGenerated(false)
    setApproved(new Set())
    setPublished(null)
  }

  function toggleWord(word) {
    setSelectedWords((prev) => {
      const next = new Set(prev)
      if (next.has(word)) next.delete(word)
      else next.add(word)
      return next
    })
  }

  const generatedItems = useMemo(() => {
    if (!generated || !unit) return []
    const items = []
    for (const v of unit.vocab) {
      if (!selectedWords.has(v.word)) continue
      for (const ex of v.examples) {
        items.push({ word: v.word, meaning: v.meaning, en: ex.en, ko: ex.ko })
      }
    }
    return items
  }, [generated, unit, selectedWords])

  function toggleApprove(key) {
    setApproved((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function publish() {
    const approvedItems = generatedItems.filter((it) => approved.has(`${it.word}|${it.en}`))
    setPublished(approvedItems)
  }

  // ── 학생 경험 미리보기 상태 ──────────────────────────────────────────
  // published가 있으면 그걸, 없으면(아직 교사가 발행 전이라도 항상
  // 데모가 되도록) 현재 선택된 단원의 예문을 fallback으로 쓴다.
  const studentItems = useMemo(() => {
    if (published && published.length > 0) return published
    if (!unit) return []
    const items = []
    for (const v of unit.vocab) {
      for (const ex of v.examples) {
        items.push({ word: v.word, meaning: v.meaning, en: ex.en, ko: ex.ko })
      }
    }
    return items
  }, [published, unit])

  return (
    <div className="space-y-3">
      <div className="bg-indigo-50 border-2 border-indigo-300 rounded-xl p-3 text-xs font-bold text-indigo-800">
        📚 교과서 예문 프로토타입 — 개발/관리자 전용. 실제 학생 데이터/DB에 저장하지 않는 미리보기입니다.
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setMode('teacher')}
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-black btn-press ${
            mode === 'teacher' ? 'bg-purple-500 text-white' : 'bg-white border-2 border-gray-200 text-gray-500'
          }`}
        >
          👩‍🏫 교사 워크플로우
        </button>
        <button
          onClick={() => setMode('student')}
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-black btn-press ${
            mode === 'student' ? 'bg-purple-500 text-white' : 'bg-white border-2 border-gray-200 text-gray-500'
          }`}
        >
          🧑‍🎓 학생 경험 미리보기
        </button>
      </div>

      {mode === 'teacher' ? (
        <TeacherWorkflow
          grades={grades}
          grade={grade}
          onGradeChange={onGradeChange}
          textbooks={textbooks}
          textbook={textbook}
          onTextbookChange={onTextbookChange}
          units={units}
          unitId={unitId}
          onUnitChange={onUnitChange}
          unit={unit}
          selectedWords={selectedWords}
          toggleWord={toggleWord}
          generated={generated}
          setGenerated={setGenerated}
          generatedItems={generatedItems}
          approved={approved}
          toggleApprove={toggleApprove}
          publish={publish}
          published={published}
        />
      ) : (
        <StudentPreview items={studentItems} />
      )}
    </div>
  )
}

function TeacherWorkflow({
  grades, grade, onGradeChange,
  textbooks, textbook, onTextbookChange,
  units, unitId, onUnitChange, unit,
  selectedWords, toggleWord,
  generated, setGenerated, generatedItems,
  approved, toggleApprove, publish, published,
}) {
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl p-3 card-shadow space-y-2">
        <p className="text-xs font-black text-gray-700">1. 학년 / 교과서 / 단원 선택</p>
        <select value={grade} onChange={(e) => onGradeChange(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 font-bold text-sm bg-white">
          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={textbook} onChange={(e) => onTextbookChange(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 font-bold text-sm bg-white">
          {textbooks.map((tb) => <option key={tb} value={tb}>{tb}</option>)}
        </select>
        <select value={unitId} onChange={(e) => onUnitChange(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 font-bold text-sm bg-white">
          {units.map((u) => <option key={u.id} value={u.id}>Unit {u.unitNo}. {u.topic}</option>)}
        </select>

        {unit && (
          <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-2 text-xs">
            <p className="font-black text-purple-700">📖 {unit.topic}</p>
            <p className="font-bold text-purple-600 mt-1">문법 포인트: {unit.grammarPoint}</p>
          </div>
        )}
      </div>

      {unit && (
        <div className="bg-white rounded-xl p-3 card-shadow space-y-2">
          <p className="text-xs font-black text-gray-700">2. 단어 선택</p>
          <div className="space-y-1">
            {unit.vocab.map((v) => (
              <label key={v.word} className="flex items-center gap-2 text-xs font-bold text-gray-700 py-1 border-b border-gray-100 last:border-0">
                <input type="checkbox" checked={selectedWords.has(v.word)} onChange={() => toggleWord(v.word)} />
                <span className="font-mono">{v.word}</span>
                <span className="text-gray-400">— {v.meaning}</span>
              </label>
            ))}
          </div>
          <button
            onClick={() => setGenerated(true)}
            disabled={selectedWords.size === 0}
            className="w-full bg-blue-500 text-white font-black px-4 py-2 rounded-xl btn-press disabled:opacity-40 text-sm"
          >
            ✨ 예문 생성
          </button>
        </div>
      )}

      {generated && (
        <div className="bg-white rounded-xl p-3 card-shadow space-y-2">
          <p className="text-xs font-black text-gray-700">3. 예문 검수</p>
          <p className="text-[11px] text-gray-400 font-bold">
            원문은 검수된 오리지널 예문에서 구성됩니다.
          </p>
          {generatedItems.length === 0 && (
            <p className="text-xs text-gray-400 font-bold">선택한 단어의 예문이 없습니다.</p>
          )}
          <div className="space-y-2">
            {generatedItems.map((it) => {
              const key = `${it.word}|${it.en}`
              return (
                <div key={key} className="border-2 border-gray-200 rounded-xl p-2 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black text-purple-500 font-mono">{it.word}</p>
                      <p className="text-sm font-bold text-gray-800">{it.en}</p>
                      <p className="text-xs text-gray-500">{it.ko}</p>
                    </div>
                    <label className="flex items-center gap-1 text-[10px] font-bold text-green-600 shrink-0">
                      <input type="checkbox" checked={approved.has(key)} onChange={() => toggleApprove(key)} />
                      승인
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
          {generatedItems.length > 0 && (
            <button
              onClick={publish}
              className="w-full bg-green-500 text-white font-black px-4 py-2 rounded-xl btn-press text-sm"
            >
              🚀 학생에게 발행(미리보기)
            </button>
          )}
        </div>
      )}

      {published && (
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-3 text-xs font-bold text-green-700">
          ✅ 발행됨(프로토타입): {published.length}개 예문 — 실제 DB 발행 아님
        </div>
      )}
    </div>
  )
}

function StudentPreview({ items }) {
  const [idx, setIdx] = useState(0)
  const [step, setStep] = useState('word') // word | meaning | sentence | audio | fillblank | writing
  const [fillInput, setFillInput] = useState('')
  const [fillResult, setFillResult] = useState(null) // null | true | false
  const [writeInput, setWriteInput] = useState('')
  const [writeResult, setWriteResult] = useState(null)

  const item = items[idx] || null
  const fb = item ? makeFillBlank(item.en, item.word) : null

  function resetForItem() {
    setStep('word')
    setFillInput('')
    setFillResult(null)
    setWriteInput('')
    setWriteResult(null)
  }

  function goNext() {
    if (idx + 1 < items.length) {
      setIdx(idx + 1)
      resetForItem()
    }
  }

  function playAudio() {
    if (!item) return
    playWordAudio(null, item.en, { source: 'textbook-proto' })
  }

  function submitFill() {
    setFillResult(checkAnswer(fillInput, fb.answer))
  }
  function submitWrite() {
    setWriteResult(checkAnswer(writeInput, item.en))
  }

  if (!item) {
    return (
      <div className="bg-white rounded-xl p-3 card-shadow text-xs text-gray-400 font-bold">
        표시할 예문이 없습니다. 교사 워크플로우에서 단어를 선택해 주세요.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-3 card-shadow space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black text-gray-500">예문 {idx + 1} / {items.length}</p>
        <p className="text-[10px] font-bold text-gray-400 uppercase">{step}</p>
      </div>

      <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-3 text-center">
        <p className="text-lg font-black text-purple-700 font-mono">{item.word}</p>
      </div>

      {step === 'word' && (
        <button onClick={() => setStep('meaning')} className="w-full bg-purple-500 text-white font-black px-4 py-2 rounded-xl btn-press text-sm">
          뜻 보기 →
        </button>
      )}

      {step !== 'word' && (
        <p className="text-center text-sm font-bold text-gray-700">{item.meaning}</p>
      )}

      {step === 'meaning' && (
        <button onClick={() => setStep('sentence')} className="w-full bg-purple-500 text-white font-black px-4 py-2 rounded-xl btn-press text-sm">
          예문 보기 →
        </button>
      )}

      {(step === 'sentence' || step === 'audio' || step === 'fillblank' || step === 'writing') && (
        <div className="border-2 border-gray-200 rounded-xl p-2 space-y-1">
          <p className="text-sm font-bold text-gray-800">{item.en}</p>
          <p className="text-xs text-gray-500">{item.ko}</p>
        </div>
      )}

      {step === 'sentence' && (
        <button onClick={() => setStep('audio')} className="w-full bg-purple-500 text-white font-black px-4 py-2 rounded-xl btn-press text-sm">
          다음 →
        </button>
      )}

      {step === 'audio' && (
        <div className="space-y-2">
          <button onClick={playAudio} className="w-full bg-blue-500 text-white font-black px-4 py-2 rounded-xl btn-press text-sm">
            🔊 오디오 듣기
          </button>
          <button onClick={() => setStep('fillblank')} className="w-full bg-purple-500 text-white font-black px-4 py-2 rounded-xl btn-press text-sm">
            다음 →
          </button>
        </div>
      )}

      {step === 'fillblank' && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-500">빈칸 채우기</p>
          <p className="text-sm font-bold text-gray-800 bg-gray-50 rounded-lg p-2">{fb.prompt}</p>
          <input
            type="text"
            value={fillInput}
            onChange={(e) => setFillInput(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 font-bold text-sm"
            placeholder="정답을 입력하세요"
          />
          <button onClick={submitFill} className="w-full bg-blue-500 text-white font-black px-4 py-2 rounded-xl btn-press text-sm">
            확인
          </button>
          {fillResult !== null && (
            <p className={`text-xs font-black ${fillResult ? 'text-green-600' : 'text-red-600'}`}>
              {fillResult ? '✓ 정답이에요!' : `다시 시도해 보세요. (정답: ${fb.answer})`}
            </p>
          )}
          {fillResult && (
            <button onClick={() => setStep('writing')} className="w-full bg-purple-500 text-white font-black px-4 py-2 rounded-xl btn-press text-sm">
              다음 →
            </button>
          )}
        </div>
      )}

      {step === 'writing' && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-500">문장 전체 쓰기 연습</p>
          <input
            type="text"
            value={writeInput}
            onChange={(e) => setWriteInput(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 font-bold text-sm"
            placeholder="문장을 그대로 입력하세요"
          />
          <button onClick={submitWrite} className="w-full bg-blue-500 text-white font-black px-4 py-2 rounded-xl btn-press text-sm">
            확인
          </button>
          {writeResult !== null && (
            <p className={`text-xs font-black ${writeResult ? 'text-green-600' : 'text-red-600'}`}>
              {writeResult ? '✓ 정확해요!' : '다시 시도해 보세요.'}
            </p>
          )}
          <button
            onClick={goNext}
            disabled={idx + 1 >= items.length}
            className="w-full bg-green-500 text-white font-black px-4 py-2 rounded-xl btn-press disabled:opacity-40 text-sm"
          >
            {idx + 1 >= items.length ? '마지막 예문입니다' : '다음 예문 →'}
          </button>
        </div>
      )}
    </div>
  )
}
