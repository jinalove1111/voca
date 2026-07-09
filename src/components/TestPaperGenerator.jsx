import { useState } from 'react'
import { getClassNames, getClassWords, getClassUnitNames } from '../utils/wordLibrary'

// 객관식(D) 보기 채울 단어가 모자랄 때 쓰는 예비 오답 풀 — WordDetail.jsx의
// QuizStep과 동일한 패턴(실제 반 단어가 4개 미만이면 부족한 만큼만 채움).
const FALLBACK_MEANINGS = ['탐험하다', '결정하다', '변화하다', '도착하다', '사라지다', '만들다', '이해하다', '중요한', '특별한', '연습하다']

const WORD_COUNTS = [
  { value: '10', label: '10개' },
  { value: '20', label: '20개' },
  { value: '30', label: '30개' },
  { value: 'all', label: '전체' },
]

const TEST_TYPES = [
  { value: 'A', label: 'A. 영어 → 한글 뜻 쓰기' },
  { value: 'B', label: 'B. 한글 뜻 → 영어 쓰기' },
  { value: 'C', label: 'C. 스펠링 빈칸 채우기' },
  { value: 'D', label: 'D. 객관식 뜻 고르기' },
  { value: 'E', label: 'E. 섞어서 출제' },
]

// 스펠링 빈칸(C) — 첫/끝 글자는 남기고 중간 글자의 ~40%를 무작위로 지움
// (3글자 이하 단어는 전부 빈칸). 한 글자도 안 남기고 다 지우면 너무
// 어려워지므로 최소 1글자, 최대(길이-2)글자로 clamp.
function blankSpelling(word) {
  const letters = word.split('')
  if (letters.length <= 3) return letters.map((ch) => (ch === ' ' ? ' ' : '_')).join('')
  // 공백(2단어 이상, 예: "runny nose")은 빈칸 대상에서 제외 — 안 그러면
  // 단어 사이 경계가 뭉개져 보임(예: "ru_ny_ose").
  const middleIdx = letters
    .map((_, i) => i)
    .filter((i) => i !== 0 && i !== letters.length - 1 && letters[i] !== ' ')
  const blankCount = Math.min(middleIdx.length, Math.max(1, Math.round(middleIdx.length * 0.4)))
  const chosen = new Set([...middleIdx].sort(() => Math.random() - 0.5).slice(0, blankCount))
  return letters.map((ch, i) => (chosen.has(i) ? '_' : ch)).join('')
}

// 객관식(D) 보기 4개 — 정답 1개 + 같은 시험 범위 안의 다른 단어 뜻 중
// 무작위 3개(부족하면 FALLBACK_MEANINGS로 채움), 순서 섞음.
function buildChoices(word, pool) {
  const others = pool.filter((w) => w.word !== word.word && w.meaning && w.meaning !== word.meaning)
  const wrongs = [...others].sort(() => Math.random() - 0.5).slice(0, 3).map((w) => w.meaning)
  let fi = 0
  while (wrongs.length < 3 && fi < FALLBACK_MEANINGS.length) {
    const fb = FALLBACK_MEANINGS[fi++]
    if (!wrongs.includes(fb) && fb !== word.meaning) wrongs.push(fb)
  }
  return [word.meaning, ...wrongs].sort(() => Math.random() - 0.5)
}

// 단어 목록 + 유형(A~E)을 실제로 시험지에 낼 문제 배열로 변환. E(섞어서)는
// 문제마다 A~D 중 하나를 무작위로 배정 — 문제별로 type이 다르므로 각
// 문제 객체가 자기 type을 들고 있어야 렌더링/정답지에서 구분 가능.
function buildQuestions(words, testType, pool) {
  const singleTypes = ['A', 'B', 'C', 'D']
  return words.map((w, i) => {
    const type = testType === 'E' ? singleTypes[Math.floor(Math.random() * singleTypes.length)] : testType
    const base = { no: i + 1, type, word: w.word, meaning: w.meaning }
    if (type === 'D') return { ...base, choices: buildChoices(w, pool) }
    if (type === 'C') return { ...base, blanked: blankSpelling(w.word) }
    return base
  })
}

const TYPE_INSTRUCTION = {
  A: '다음 영어 단어의 한글 뜻을 쓰세요.',
  B: '다음 한글 뜻에 맞는 영어 단어를 쓰세요.',
  C: '빈칸을 채워 스펠링을 완성하세요. (한글 뜻 참고)',
  D: '다음 단어의 뜻으로 알맞은 것을 고르세요.',
}

function QuestionRow({ q }) {
  if (q.type === 'A') {
    return (
      <div className="flex items-baseline gap-3 py-2 border-b border-gray-200 print-question">
        <span className="w-7 font-bold text-gray-500">{q.no}.</span>
        <span className="font-black text-lg flex-1">{q.word}</span>
        <span className="text-gray-400">→</span>
        <span className="flex-1 border-b border-gray-400 inline-block min-h-[1.5em]" />
      </div>
    )
  }
  if (q.type === 'B') {
    return (
      <div className="flex items-baseline gap-3 py-2 border-b border-gray-200 print-question">
        <span className="w-7 font-bold text-gray-500">{q.no}.</span>
        <span className="font-black text-lg flex-1">{q.meaning}</span>
        <span className="text-gray-400">→</span>
        <span className="flex-1 border-b border-gray-400 inline-block min-h-[1.5em]" />
      </div>
    )
  }
  if (q.type === 'C') {
    return (
      <div className="flex items-baseline gap-3 py-2 border-b border-gray-200 print-question">
        <span className="w-7 font-bold text-gray-500">{q.no}.</span>
        <span className="font-black text-lg tracking-widest flex-1">{q.blanked}</span>
        <span className="text-gray-400 text-sm">({q.meaning})</span>
      </div>
    )
  }
  // D: 객관식
  return (
    <div className="py-2 border-b border-gray-200 print-question">
      <div className="flex items-baseline gap-3 mb-1">
        <span className="w-7 font-bold text-gray-500">{q.no}.</span>
        <span className="font-black text-lg">{q.word}</span>
      </div>
      <div className="pl-7 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {q.choices.map((c, i) => (
          <span key={i}>{['①', '②', '③', '④'][i]} {c}</span>
        ))}
      </div>
    </div>
  )
}

function answerText(q) {
  if (q.type === 'A') return q.meaning
  if (q.type === 'B' || q.type === 'C') return q.word
  return q.choices.indexOf(q.meaning) // D: 0-based index -> ①②③④
}

function PrintableTestPaper({ className, unitName, questions, onExit }) {
  const mixed = questions.some((q, i, arr) => q.type !== arr[0].type)

  const Header = ({ title }) => (
    <div className="mb-6">
      <h1 className="text-2xl font-black text-center mb-4">영국교사 폴 단어 시험지</h1>
      <div className="flex justify-between text-sm font-bold mb-1">
        <span>반: {className}</span>
        <span>{unitName}</span>
      </div>
      <div className="flex justify-between text-sm font-bold border-t-2 border-black pt-2 mt-2">
        <span>이름: ________________</span>
        <span>날짜: ________________</span>
        <span>점수: _____ / 100</span>
      </div>
      {title && <p className="text-xs text-gray-500 mt-3">{title}</p>}
    </div>
  )

  return (
    <div className="test-paper-overlay fixed inset-0 z-50 bg-gray-100 overflow-y-auto">
      <div className="no-print sticky top-0 z-10 bg-white border-b p-3 flex items-center justify-between">
        <button onClick={onExit} className="text-purple-600 font-bold btn-press">← 뒤로</button>
        <button onClick={() => window.print()}
          className="bg-purple-500 text-white font-black px-6 py-2 rounded-xl btn-press hover:bg-purple-600">
          🖨 인쇄 / PDF 저장
        </button>
      </div>

      <div id="test-paper-print-root" className="max-w-2xl mx-auto bg-white my-4 p-8 print-page">
        <Header title={!mixed ? TYPE_INSTRUCTION[questions[0]?.type] : '문제마다 지시사항을 확인하세요.'} />
        <div>
          {questions.map((q) => (
            <div key={q.no}>
              {mixed && <p className="text-xs text-gray-400 mt-2">{TYPE_INSTRUCTION[q.type]}</p>}
              <QuestionRow q={q} />
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto bg-white my-4 p-8 print-page page-break">
        <h2 className="text-xl font-black text-center mb-4">📝 정답지 (교사용)</h2>
        <div className="flex justify-between text-sm font-bold mb-4 border-b-2 border-black pb-2">
          <span>반: {className}</span>
          <span>{unitName}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          {questions.map((q) => (
            <div key={q.no} className="flex gap-2 border-b border-gray-100 py-1">
              <span className="font-bold text-gray-500 w-6">{q.no}.</span>
              <span className="font-bold flex-1">
                {q.type === 'D' ? `${['①', '②', '③', '④'][answerText(q)]} ${q.meaning}` : answerText(q)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          /* position:fixed prints unreliably across browsers — drop back to
             normal flow so pagination works correctly. */
          .test-paper-overlay { position: static !important; inset: auto !important; overflow: visible !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
          .page-break { page-break-before: always; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>
    </div>
  )
}

// 관리자 화면의 "시험지 만들기" 탭 — 반/Unit/개수/유형을 고르면 인쇄용
// 시험지+정답지를 생성한다. 기존 단어 학습 화면(WordDetail 등)은 전혀
// 건드리지 않고, 이미 저장된 Supabase words 데이터를 읽기만 한다.
export default function TestPaperGenerator() {
  const classList = getClassNames()
  const [cls, setCls] = useState('')
  const [unit, setUnit] = useState('')
  const [wordCount, setWordCount] = useState('20')
  const [testType, setTestType] = useState('A')
  const [error, setError] = useState('')
  const [paper, setPaper] = useState(null) // { className, unitName, questions } | null

  const units = cls ? getClassUnitNames(cls) : []

  const handleGenerate = () => {
    setError('')
    if (!cls) return setError('반을 선택해주세요!')
    if (!unit) return setError('Unit을 선택해주세요!')
    const allWords = getClassWords(cls, unit)
    if (!allWords.length) return setError('이 Unit에는 등록된 단어가 없어요.')
    const count = wordCount === 'all' ? allWords.length : Math.min(Number(wordCount), allWords.length)
    const selected = allWords.slice(0, count)
    const questions = buildQuestions(selected, testType, allWords)
    setPaper({ className: cls, unitName: unit, questions })
  }

  if (paper) {
    return <PrintableTestPaper {...paper} onExit={() => setPaper(null)} />
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-3xl card-shadow p-5 space-y-3">
        <p className="text-sm font-black text-gray-700">📝 시험지 만들기</p>

        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">반 선택</label>
          <select value={cls} onChange={(e) => { setCls(e.target.value); setUnit('') }}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-purple-400 bg-white">
            <option value="">-- 반을 선택하세요 --</option>
            {classList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {cls && (
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">Unit 선택</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-purple-400 bg-white">
              <option value="">-- Unit을 선택하세요 --</option>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">단어 개수</label>
          <div className="grid grid-cols-4 gap-2">
            {WORD_COUNTS.map((o) => (
              <button key={o.value} onClick={() => setWordCount(o.value)}
                className={`py-2 rounded-xl font-black text-sm btn-press transition-colors ${wordCount === o.value ? 'bg-purple-500 text-white' : 'bg-gray-50 text-gray-600 border-2 border-gray-200'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">시험 유형</label>
          <div className="space-y-2">
            {TEST_TYPES.map((o) => (
              <button key={o.value} onClick={() => setTestType(o.value)}
                className={`w-full text-left py-2 px-3 rounded-xl font-bold text-sm btn-press transition-colors ${testType === o.value ? 'bg-purple-500 text-white' : 'bg-gray-50 text-gray-600 border-2 border-gray-200'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-red-500 text-xs font-bold">⚠️ {error}</p>}

        <button onClick={handleGenerate}
          className="w-full bg-purple-500 text-white font-black py-4 rounded-2xl btn-press hover:bg-purple-600">
          📝 시험지 생성 → 미리보기
        </button>
      </div>
    </div>
  )
}
