import { isInAppBrowser } from '../utils/browserDetect'
import { speak } from '../utils/speech'
import InAppBrowserNotice from './InAppBrowserNotice'
import useLocalRecorder from '../hooks/useLocalRecorder'
import { SPEAKING_QUESTIONS, SPEAKING_MESSAGES } from '../utils/speaking/speakingSession'

// 2026-10-04 Speaking 첫 체험 — 녹음→들어보기만 하는 연습 화면. 저장/채점/전송 없음.
// 마이크/MediaRecorder 연결(스트림 보유·해제 규칙 포함)은 2026-10-04 상황 보고 말하기에서
// 공용 훅 useLocalRecorder로 옮겼다(동작 동일 — 주석은 그 훅 참고).
// 주의(운영자 기기 점검): iOS에서 두 번째 캡처가 공유 스트림을 mute할 수 있다 —
// 이 화면을 다녀온 뒤 WordDetail 따라 말하기가 정상인지 실기기에서 확인할 것.

const BTN = 'min-h-[44px] px-4 py-3 rounded-2xl font-black text-lg btn-press disabled:opacity-40'

export default function SpeakingPractice({ onBack, onGoSituation = null }) {
  const { st, mic, elapsed, start, stop: stopRecording, play, retake, reset: move, audioProps } = useLocalRecorder()

  if (isInAppBrowser()) {
    return (
      <div data-testid="speaking-practice" className="min-h-screen p-4 pb-24">
        <div className="max-w-lg mx-auto space-y-4">
          <button onClick={onBack} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 홈</button>
          <InAppBrowserNotice />
        </div>
      </div>
    )
  }

  const q = SPEAKING_QUESTIONS[st.index]
  const busy = st.status === 'recording'
  const canRecord = st.status === 'idle'
  const statusText = st.status === 'recording' ? '녹음 중이에요… 끝나면 그만을 눌러요'
    : st.status === 'requesting' ? '마이크를 켜는 중이에요. 허용을 눌러 주세요'
    : st.status === 'recorded' || st.status === 'playing' ? '잘했어요! 들어보거나 다시 녹음해요'
    : st.status === 'error' ? SPEAKING_MESSAGES[st.errorCode] || SPEAKING_MESSAGES.unknown
    : ''

  return (
    <div data-testid="speaking-practice" data-mic-state={mic} className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <button onClick={onBack} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 홈</button>
          <h1 className="text-xl font-black text-sky-700">말하기 연습</h1>
        </div>
        {onGoSituation && (
          <button data-testid="speaking-go-situation" onClick={onGoSituation} disabled={busy}
            className="min-h-[44px] px-4 py-3 rounded-2xl font-black text-base btn-press bg-amber-100 text-amber-800 disabled:opacity-40">🖼️ 상황 보고 말하기</button>
        )}
        <p className="text-sm text-gray-600">🎙️ 녹음은 저장되지 않아요. 연습만 해요</p>

        <div data-testid="speaking-question" className="bg-white rounded-3xl p-5 card-shadow space-y-2">
          <p className="text-sm font-bold text-sky-600">질문 {st.index + 1}/{SPEAKING_QUESTIONS.length}</p>
          <p className="text-2xl font-black text-gray-900">{q.en}</p>
          <p className="text-base text-gray-600">{q.ko}</p>
          <button onClick={() => speak(q.en, { source: 'speaking' })} disabled={busy}
            className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 질문 듣기</button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(canRecord || st.status === 'requesting' || st.status === 'recorded' || st.status === 'playing') && (
            <button data-testid="speaking-record" onClick={start}
              disabled={!canRecord && st.status !== 'recorded'} className={`${BTN} bg-gradient-to-br from-sky-400 to-blue-600 text-white`}>🎤 녹음 시작</button>
          )}
          {st.status === 'recording' && (
            <button data-testid="speaking-stop" onClick={stopRecording} className={`${BTN} bg-red-500 text-white`}>
              ⏹ 그만 <span data-testid="speaking-timer" className="motion-safe:animate-pulse">{elapsed}초</span>
            </button>
          )}
          {(st.status === 'recorded' || st.status === 'playing') && (
            <button data-testid="speaking-play" onClick={play} disabled={st.status === 'playing'}
              className={`${BTN} bg-emerald-500 text-white`}>▶ 들어보기</button>
          )}
          {(st.status === 'recorded' || st.status === 'playing' || st.status === 'error') && (
            <button data-testid="speaking-retake" onClick={retake} disabled={st.status === 'playing'}
              className={`${BTN} bg-gray-200 text-gray-700`}>🔁 다시 녹음</button>
          )}
        </div>

        <p className="text-xs text-gray-500">최대 20초까지 녹음돼요</p>

        <audio data-testid="speaking-audio" {...audioProps} className="hidden" />

        <p data-testid="speaking-status" role="status" aria-live="polite"
          className="text-center text-base font-bold text-sky-700 min-h-[1.5rem]">{statusText}</p>

        <div className="flex justify-between gap-2">
          <button data-testid="speaking-prev" onClick={() => move('PREV')} disabled={busy || st.index === 0}
            className={`${BTN} bg-white card-shadow text-gray-700`}>← 이전</button>
          <button data-testid="speaking-next" onClick={() => move('NEXT')} disabled={busy || st.index === SPEAKING_QUESTIONS.length - 1}
            className={`${BTN} bg-white card-shadow text-gray-700`}>다음 →</button>
        </div>
      </div>
    </div>
  )
}
