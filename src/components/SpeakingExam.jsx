import { useEffect, useMemo, useRef, useState } from 'react'
import { speak } from '../utils/speech'
import useLocalRecorder from '../hooks/useLocalRecorder'
import SpeakingPracticeItem, { RecorderControls, SituationGuide, BTN } from './SpeakingPracticeItem'
import { SITUATION_EXPRESSIONS, sceneFor } from '../utils/situation/situationContent'
import { saveSession } from '../utils/situation/situationStore'

// 2026-10-04 Speaking UX v2 — 한글 보고 말하기(207차: '그림 보고 말하기 시험'에서 이름·화면 변경).
// 공개 전에는 한글 상황 안내·진행·(선택)녹음만 마운트하고
// 영어 문장/한국어 뜻/듣기/자기 확인은 [답 확인] 뒤에 조건부로 마운트한다(숨김 렌더 금지).
// 자기 확인은 학생의 주관 기록일 뿐 앱이 판정하지 않는다. 기록은 기기 localStorage(키에 students.id UUID)뿐.
// 시험 장면은 전이 상황(b). 연습과 같은 그림으로 바꾸려면 아래 상수만 'a'로.
const EXAM_SCENE = 'b'
const REPORT_LABEL = { can: '🙂 말할 수 있었어요', hard: '🌱 아직 어려워요' }

const localToday = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const safeStorage = () => { try { return window.localStorage } catch { return { getItem: () => null, setItem: () => {} } } }

export default function SpeakingExam({ studentId, onMenu }) {
  const storage = useMemo(safeStorage, [])
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [selfReport, setSelfReport] = useState(null)
  const [recorded, setRecorded] = useState(false)
  const [results, setResults] = useState({}) // 이번 실행의 표현별 자기 확인(요약용)
  const rec = useLocalRecorder()
  const { st } = rec
  const headingRef = useRef(null)
  const total = SITUATION_EXPRESSIONS.length
  const summary = idx >= total
  const expr = summary ? null : SITUATION_EXPRESSIONS[idx]
  const busy = st.status === 'recording'

  useEffect(() => { headingRef.current?.focus() }, [idx])
  useEffect(() => { if (st.status === 'recorded') setRecorded(true) }, [st.status])

  // 답을 확인한 뒤 자기 확인이나 녹음이 있을 때만 저장한다(보기만 한 문항은 기록 없음)
  const persist = () => {
    if (!expr || !revealed || !(selfReport || recorded)) return
    saveSession(storage, studentId, expr.id, {
      date: localToday(), scene: sceneFor(expr.id, EXAM_SCENE).id, stage: 'exam', hintLevel: 0, selfReport, recorded,
    })
    if (selfReport) setResults((r) => ({ ...r, [expr.id]: selfReport }))
  }
  const next = () => {
    persist()
    rec.reset('RESET')
    setRevealed(false); setRetrying(false); setSelfReport(null); setRecorded(false)
    setIdx((i) => i + 1)
  }
  const back = () => { persist(); onMenu() }
  const retry = () => { rec.reset('RESET'); setRetrying(true) }

  return (
    <div data-testid="speaking-exam" data-expr={expr?.id || ''} data-index={idx} data-revealed={revealed ? 'true' : 'false'}
      data-mic-state={rec.mic} className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <button data-testid="exam-back" onClick={back} disabled={busy} className="min-h-[44px] px-2 font-black text-gray-600 btn-press disabled:opacity-40">← 메뉴</button>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-black text-sky-700 outline-none">한글 보고 말하기</h1>
        </div>

        {summary ? (
          <div data-testid="exam-summary" className="bg-white rounded-3xl p-5 card-shadow space-y-3">
            <h2 className="text-lg font-black text-gray-900">오늘 말해 본 표현</h2>
            <ul className="space-y-2">
              {SITUATION_EXPRESSIONS.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 text-base">
                  <span className="font-bold text-gray-900">{e.en}</span>
                  <span className="text-sm text-gray-600 shrink-0">{results[e.id] ? REPORT_LABEL[results[e.id]] : '미기록'}</span>
                </li>
              ))}
            </ul>
            <button data-testid="exam-done" onClick={onMenu} className={`${BTN} w-full bg-sky-500 text-white`}>돌아가기</button>
          </div>
        ) : (
          <>
            <p data-testid="exam-progress" className="text-sm font-bold text-sky-600">{idx + 1} / {total}</p>
            <SituationGuide exam scene={sceneFor(expr.id, EXAM_SCENE)} />

            {revealed && (
              <div className="bg-white rounded-3xl p-5 card-shadow space-y-2">
                <p data-testid="exam-answer-label" className="text-sm font-black text-sky-700">이렇게 말할 수 있어요</p>
                <p data-testid="exam-answer" className="text-2xl font-black text-gray-900">{expr.en}</p>
                <p data-testid="exam-meaning" className="text-base text-gray-600">{expr.ko}</p>
                <button data-testid="exam-listen" onClick={() => speak(expr.en, { source: 'speaking' })} disabled={busy}
                  className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 듣기</button>
                <p data-testid="exam-other-ways" className="text-sm text-gray-500">상황에 맞으면 다른 말로 말해도 좋아요.</p>
              </div>
            )}

            {retrying ? (
              <div data-testid="exam-practice-panel" className="space-y-4 border-t border-gray-200 pt-4">
                <SpeakingPracticeItem expr={expr} scene={sceneFor(expr.id, 'a')} rec={rec} />
              </div>
            ) : (
              <RecorderControls rec={rec} idleText="상황을 읽고 영어로 말해 봐요. 마이크 없이도 할 수 있어요" />
            )}

            {revealed && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="말해 본 느낌">
                {['can', 'hard'].map((v) => (
                  <button key={v} data-testid={v === 'can' ? 'exam-self-can' : 'exam-self-hard'} onClick={() => setSelfReport(v)} aria-pressed={selfReport === v}
                    className={`${BTN} ${selfReport === v ? 'bg-sky-500 text-white' : 'bg-white card-shadow text-gray-700'}`}>{REPORT_LABEL[v]}</button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              {!revealed ? (
                <button data-testid="exam-reveal" onClick={() => setRevealed(true)} disabled={busy}
                  className={`${BTN} bg-amber-500 text-white`}>답 확인</button>
              ) : (
                <button data-testid="exam-retry" onClick={retry} disabled={busy || retrying}
                  className={`${BTN} bg-white card-shadow text-gray-700`}>다시 연습</button>
              )}
              <button data-testid="exam-next" onClick={next} disabled={busy || !revealed}
                className={`${BTN} bg-white card-shadow text-gray-700`}>다음 문제 →</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
