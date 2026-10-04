import { useEffect, useRef, useState } from 'react'
import useLocalRecorder from '../hooks/useLocalRecorder'
import SpeakingPracticeItem, { BTN } from './SpeakingPracticeItem'
import { SITUATION_EXPRESSIONS, sceneFor } from '../utils/situation/situationContent'

// 2026-10-04 Speaking UX v2 — 회화 연습 모드(SpeakingPractice 루트에서 lazy 로드: 그림 에셋이 메인 청크에 들어가지 않게).
export default function SpeakingPracticeMode({ onMenu, onStartExam }) {
  const rec = useLocalRecorder()
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(false)
  const headingRef = useRef(null)
  const last = SITUATION_EXPRESSIONS.length - 1
  const busy = rec.st.status === 'recording'
  useEffect(() => { headingRef.current?.focus() }, [idx, done])

  const move = (fn) => { rec.reset('RESET'); fn() }
  const expr = SITUATION_EXPRESSIONS[idx]

  return (
    <div data-testid="speaking-practice" data-expr={expr.id} data-index={idx} data-mic-state={rec.mic} className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <button data-testid="speaking-back" onClick={onMenu} disabled={busy} className="min-h-[44px] px-2 font-black text-gray-600 btn-press disabled:opacity-40">← 메뉴</button>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-black text-sky-700 outline-none">회화 연습{!done && ` ${idx + 1}/${last + 1}`}</h1>
        </div>
        <p className="text-sm text-gray-600">🎙️ 녹음은 저장되지 않아요. 연습만 해요</p>
        {done ? (
          <div data-testid="practice-done" className="bg-white rounded-3xl p-5 card-shadow space-y-3">
            <h2 className="text-lg font-black text-gray-900">다 연습했어요!</h2>
            {onStartExam && (
              <>
                <p className="text-base text-gray-600">그림을 보고 말해 보는 시험을 해 볼까요?</p>
                <button data-testid="practice-start-exam" onClick={onStartExam}
                  className="w-full min-h-[64px] px-4 py-4 rounded-2xl font-black text-xl btn-press bg-amber-500 text-white">🖼️ 그림 시험 시작</button>
              </>
            )}
            <button data-testid="practice-back-menu" onClick={onMenu} className={`${BTN} w-full bg-gray-200 text-gray-700`}>메뉴로</button>
          </div>
        ) : (
          <>
            <SpeakingPracticeItem key={expr.id} expr={expr} scene={sceneFor(expr.id, 'a')} rec={rec} />
            <div className="flex justify-between gap-2">
              <button data-testid="practice-prev" onClick={() => move(() => setIdx(idx - 1))} disabled={busy || idx === 0}
                className={`${BTN} bg-white card-shadow text-gray-700`}>← 이전</button>
              <button data-testid="practice-next" onClick={() => move(() => (idx === last ? setDone(true) : setIdx(idx + 1)))} disabled={busy}
                className={`${BTN} bg-white card-shadow text-gray-700`}>다음 →</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
