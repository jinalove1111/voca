import { useEffect, useMemo, useRef, useState } from 'react'
import { speak } from '../utils/speech'
import SceneCard from './SceneCard'
import useLocalRecorder from '../hooks/useLocalRecorder'
import { SPEAKING_MESSAGES } from '../utils/speaking/speakingSession'
import { SITUATION_EXPRESSIONS, MAX_HINT, hintText, sceneFor } from '../utils/situation/situationContent'
import { loadRecords, saveSession, dueForReview } from '../utils/situation/situationStore'

// 2026-10-04 상황 보고 말하기 — 그림 보기 → 그림만 보고 말하기(회상) → 다른 상황(전이) → 요약.
// 기록은 기기 localStorage(키에 students.id UUID)뿐이고 별/포인트/완료/숙달 표시는 없다.
// 자기 보고는 학생의 주관 기록일 뿐 판정하지 않는다(설계 §5). 녹음은 메모리 전용(useLocalRecorder).
const BTN = 'min-h-[44px] px-4 py-3 rounded-2xl font-black text-base btn-press disabled:opacity-40'
const EXPR = Object.fromEntries(SITUATION_EXPRESSIONS.map((e) => [e.id, e]))
const REPORT_LABEL = { can: '🙂 말할 수 있었어요', hard: '🌱 아직 어려워요' }

const STAGE_LABEL = { intro: '보기 단계', recall: '회상 단계', transfer: '다른 상황 단계', summary: '요약' }

const localToday = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const safeStorage = () => { try { return window.localStorage } catch { return { getItem: () => null, setItem: () => {} } } }

// 복습 대상은 회상(A→B)부터, 나머지는 보기→회상→전이 순서
function buildSteps(dueIds) {
  const steps = []
  dueIds.forEach((id) => steps.push({ exprId: id, stage: 'recall', which: 'a' }, { exprId: id, stage: 'transfer', which: 'b' }))
  SITUATION_EXPRESSIONS.filter((e) => !dueIds.includes(e.id)).forEach((e) => steps.push(
    { exprId: e.id, stage: 'intro', which: 'a' }, { exprId: e.id, stage: 'recall', which: 'a' }, { exprId: e.id, stage: 'transfer', which: 'b' },
  ))
  return steps
}

export default function SituationRecall({ studentId, onBack }) {
  const today = useMemo(localToday, [])
  const storage = useMemo(safeStorage, [])
  const dueIds = useMemo(() => dueForReview(loadRecords(storage, studentId), today).filter((id) => EXPR[id]), [storage, studentId, today])
  const steps = useMemo(() => buildSteps(dueIds), [dueIds])

  const [idx, setIdx] = useState(0)
  const [hintLevel, setHintLevel] = useState(0)
  const [selfReport, setSelfReport] = useState(null)
  const [recorded, setRecorded] = useState(false)
  const [results, setResults] = useState({}) // 이번 실행의 표현별 마지막 자기 보고(요약용)
  const rec = useLocalRecorder()
  const { st } = rec
  const headingRef = useRef(null)

  const step = steps[idx]
  const stage = step ? step.stage : 'summary'
  const expr = step ? EXPR[step.exprId] : null
  const scene = step ? sceneFor(step.exprId, step.which) : null
  const isReview = !!step && dueIds.includes(step.exprId)

  useEffect(() => { headingRef.current?.focus() }, [idx])
  useEffect(() => { if (st.status === 'recorded') setRecorded(true) }, [st.status])

  const persist = () => {
    if (stage !== 'recall' && stage !== 'transfer') return
    if (!(hintLevel > 0 || selfReport || recorded)) return // 아무것도 안 하고 넘긴 단계는 기록하지 않는다
    saveSession(storage, studentId, step.exprId, { date: today, scene: scene.id, stage, hintLevel, selfReport, recorded })
    if (selfReport) setResults((r) => ({ ...r, [step.exprId]: selfReport }))
  }
  const next = () => {
    persist()
    rec.reset('RESET')
    setHintLevel(0); setSelfReport(null); setRecorded(false)
    setIdx((i) => i + 1)
  }
  const back = () => {
    persist()
    onBack()
  }

  const busy = st.status === 'recording'
  const canRecord = st.status === 'idle'
  const stageNote = stage === 'intro' ? '그림을 보고 문장을 들어 봐요'
    : stage === 'recall' ? '그림을 보고 떠올려서 말해 봐요'
    : stage === 'transfer' ? '다른 곳에서도 같은 말을 쓸 수 있어요' : '오늘 연습한 표현이에요'
  const statusText = st.status === 'recording' ? '녹음 중이에요… 끝나면 그만을 눌러요'
    : st.status === 'requesting' ? '마이크를 켜는 중이에요. 허용을 눌러 주세요'
    : st.status === 'recorded' || st.status === 'playing' ? '잘했어요! 들어보거나 다시 녹음해요'
    : st.status === 'error' ? SPEAKING_MESSAGES[st.errorCode] || SPEAKING_MESSAGES.unknown
    : stageNote

  return (
    <div data-testid="situation-recall" data-stage={stage} data-expr={step?.exprId || ''} data-scene={scene?.id || ''}
      data-mic-state={rec.mic} className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <button data-testid="situation-back" onClick={back} disabled={busy} className="min-h-[44px] px-2 font-black text-gray-600 btn-press disabled:opacity-40">← 돌아가기</button>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-black text-sky-700 outline-none">상황 보고 말하기<span className="sr-only"> — {STAGE_LABEL[stage]}</span></h1>
        </div>
        <p className="text-sm text-gray-600">🎙️ 녹음은 저장되지 않아요. 연습만 해요</p>
        {isReview && stage !== 'summary' && (
          <p data-testid="situation-review-banner" className="text-sm font-bold text-amber-700">🔁 오늘은 복습부터 해요</p>
        )}

        {stage === 'summary' ? (
          <div data-testid="situation-summary" className="bg-white rounded-3xl p-5 card-shadow space-y-3">
            <h2 className="text-lg font-black text-gray-900">오늘 연습한 표현</h2>
            <ul className="space-y-2">
              {SITUATION_EXPRESSIONS.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 text-base">
                  <span className="font-bold text-gray-900">{e.en}</span>
                  <span className="text-sm text-gray-600 shrink-0">{results[e.id] ? REPORT_LABEL[results[e.id]] : '미기록'}</span>
                </li>
              ))}
            </ul>
            <button data-testid="situation-done" onClick={onBack} className={`${BTN} w-full bg-sky-500 text-white`}>돌아가기</button>
          </div>
        ) : (
          <>
            <SceneCard scene={scene} />
            {stage === 'intro' ? (
              <div data-testid="situation-expression" className="bg-white rounded-3xl p-5 card-shadow space-y-2">
                <p className="text-2xl font-black text-gray-900">{expr.en}</p>
                <p className="text-base text-gray-600">{expr.ko}</p>
                <button data-testid="situation-listen" onClick={() => speak(expr.en, { source: 'situation' })} disabled={busy}
                  className={`${BTN} bg-sky-100 text-sky-700`}>🔊 듣기</button>
              </div>
            ) : (
              <div data-testid="situation-hints" className="bg-white rounded-3xl p-4 card-shadow space-y-2">
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3].map((n) => (
                    <button key={n} data-testid={`situation-hint-${n}`} onClick={() => setHintLevel(n)}
                      disabled={n !== hintLevel + 1 || n > MAX_HINT} className={`${BTN} bg-amber-100 text-amber-800`}>💡 힌트 {n}</button>
                  ))}
                </div>
                {hintLevel > 0 && (
                  <p data-testid="situation-hint-text" className="text-2xl font-black text-gray-900">
                    {hintLevel === 3 ? expr.ko : hintText(expr.en, hintLevel)}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
              {(canRecord || st.status === 'requesting' || st.status === 'recorded' || st.status === 'playing') && (
                <button data-testid="situation-record" onClick={rec.start} disabled={!canRecord && st.status !== 'recorded'}
                  className={`${BTN} bg-gradient-to-br from-sky-400 to-blue-600 text-white`}>🎤 {stage === 'intro' ? '따라 말하기' : '말하기'}</button>
              )}
              {busy && (
                <button data-testid="situation-stop" onClick={rec.stop} className={`${BTN} bg-red-500 text-white`}>
                  ⏹ 그만 <span className="motion-safe:animate-pulse">{rec.elapsed}초</span>
                </button>
              )}
              {(st.status === 'recorded' || st.status === 'playing') && (
                <button data-testid="situation-play" onClick={rec.play} disabled={st.status === 'playing'} className={`${BTN} bg-emerald-500 text-white`}>▶ 들어보기</button>
              )}
              {(st.status === 'recorded' || st.status === 'playing' || st.status === 'error') && (
                <button data-testid="situation-retake" onClick={rec.retake} disabled={st.status === 'playing'} className={`${BTN} bg-gray-200 text-gray-700`}>🔁 다시 녹음</button>
              )}
            </div>
            <audio data-testid="situation-audio" {...rec.audioProps} className="hidden" />

            {stage !== 'intro' && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="말해 본 느낌">
                {['can', 'hard'].map((v) => (
                  <button key={v} data-testid={`situation-self-${v}`} onClick={() => setSelfReport(v)} aria-pressed={selfReport === v}
                    className={`${BTN} ${selfReport === v ? 'bg-sky-500 text-white' : 'bg-white card-shadow text-gray-700'}`}>{REPORT_LABEL[v]}</button>
                ))}
              </div>
            )}
          </>
        )}

        <p data-testid="situation-status" role="status" aria-live="polite"
          className="text-center text-base font-bold text-sky-700 min-h-[1.5rem]">{statusText}</p>

        {stage !== 'summary' && (
          <div className="flex justify-end">
            <button data-testid="situation-next" onClick={next} disabled={busy} className={`${BTN} bg-white card-shadow text-gray-700`}>다음 →</button>
          </div>
        )}
      </div>
    </div>
  )
}
