import { useEffect, useMemo, useRef, useState } from 'react'
import useLocalRecorder from '../hooks/useLocalRecorder'
import { stopSpeaking } from '../utils/speech'
import SpeakingPracticeItem, { BTN } from './SpeakingPracticeItem'
import { BASIC_SET_ID, itemsForSet, setLabel } from '../utils/situation/speakingSets'

// 2026-10-04 Speaking UX v2 — 회화 연습 모드(SpeakingPractice 루트에서 lazy 로드: 그림 에셋이 메인 청크에 들어가지 않게).
export default function SpeakingPracticeMode({ setId = BASIC_SET_ID, onMenu, onStartExam }) {
  // 218차: 상대 역할 녹음기는 같은 마이크 스트림을 쓴다. 문항 이동·화면 종료 시 두 녹음기 모두 정리(언마운트 시 훅이 스트림 해제)
  const streamRef = useRef(null)
  const rec = useLocalRecorder({ sharedStreamRef: streamRef })
  const partnerRec = useLocalRecorder({ sharedStreamRef: streamRef })
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(false)
  const headingRef = useRef(null)
  const items = useMemo(() => itemsForSet(setId), [setId])
  const last = items.length - 1
  const busy = rec.st.status === 'recording' || partnerRec.st.status === 'recording' // 이동·뒤로는 녹음 중만 막는다(허용 대기 중엔 떠날 수 있음)
  useEffect(() => { headingRef.current?.focus() }, [idx, done])
  useEffect(() => stopSpeaking, []) // 화면을 떠나면 재생 중인 듣기를 끊는다(220차)

  const move = (fn) => { stopSpeaking(); rec.reset('RESET'); partnerRec.reset('RESET'); fn() }
  const item = items[idx]

  return (
    <div data-testid="speaking-practice" data-expr={item.exprId} data-index={idx} data-mic-state={rec.mic} className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <button data-testid="speaking-back" onClick={onMenu} disabled={busy} className="min-h-[44px] px-2 font-black text-gray-600 btn-press disabled:opacity-40">← 메뉴</button>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-black text-sky-700 outline-none">회화 연습{!done && ` ${idx + 1}/${last + 1}`}</h1>
        </div>
        {setId !== BASIC_SET_ID && <p data-testid="speaking-set-label" className="text-sm font-bold text-sky-600">{setLabel(setId)}</p>}
        <p className="text-sm text-gray-600">🎙️ 녹음은 저장되지 않아요. 연습만 해요</p>
        {done ? (
          <div data-testid="practice-done" className="bg-white rounded-3xl p-5 card-shadow space-y-3">
            <h2 className="text-lg font-black text-gray-900">다 연습했어요!</h2>
            {onStartExam && (
              <>
                <p className="text-base text-gray-600">이번엔 한글 상황만 보고 영어로 말해 볼까요?</p>
                <button data-testid="practice-start-exam" onClick={onStartExam}
                  className="w-full min-h-[64px] px-4 py-4 rounded-2xl font-black text-xl btn-press bg-amber-500 text-white">📝 한글 보고 말하기 시작</button>
              </>
            )}
            <button data-testid="practice-back-menu" onClick={onMenu} className={`${BTN} w-full bg-gray-200 text-gray-700`}>메뉴로</button>
          </div>
        ) : (
          <>
            <SpeakingPracticeItem key={item.id} item={item} rec={rec} partnerRec={partnerRec} />
            <div className="flex justify-between gap-2">
              <button data-testid="practice-prev" onClick={() => move(() => setIdx((i) => i - 1))} disabled={busy || idx === 0}
                className={`${BTN} bg-white card-shadow text-gray-700`}>← 이전</button>
              <button data-testid="practice-next" onClick={() => move(() => (idx === last ? setDone(true) : setIdx((i) => i + 1)))} disabled={busy}
                className={`${BTN} bg-white card-shadow text-gray-700`}>다음 →</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
