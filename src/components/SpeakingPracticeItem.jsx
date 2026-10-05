import { Suspense, lazy } from 'react'
import { speak } from '../utils/speech'
import SceneCard, { hasFinalArt } from './SceneCard'
import InAppBrowserNotice from './InAppBrowserNotice'
import { isInAppBrowser } from '../utils/browserDetect'
import { SPEAKING_MESSAGES } from '../utils/speaking/speakingSession'

// 2026-10-04 Speaking UX v2 — 연습 문항(한글 상황+문장+뜻+듣기+녹음)과 녹음 버튼 묶음.
// 연습 모드와 시험의 "다시 연습" 패널이 같이 쓴다. 녹음은 메모리 전용(useLocalRecorder).
// 2화 일부 문항의 정지 장면(Paul·미아, 영어 없음) — 연습에서만 보이고 시험(공개 전 한국어 상황·역할·진행만)에는 내지 않는다
const PencilCaseScene = lazy(() => import('./PencilCaseScene'))
export const BTN = 'min-h-[44px] px-4 py-3 rounded-2xl font-black text-lg btn-press disabled:opacity-40'

// 상태 문구는 기존 speaking-status 문자열 그대로
export function recStatusText(st, idle = '') {
  return st.status === 'recording' ? '녹음 중이에요… 끝나면 그만을 눌러요'
    : st.status === 'requesting' ? '마이크를 켜는 중이에요. 허용을 눌러 주세요'
    : st.status === 'recorded' || st.status === 'playing' ? '잘했어요! 들어보거나 다시 녹음해요'
    : st.status === 'error' ? SPEAKING_MESSAGES[st.errorCode] || SPEAKING_MESSAGES.unknown
    : idle
}

export function RecorderControls({ rec, idleText = '' }) {
  const { st } = rec
  const canRecord = st.status === 'idle'
  // 앱 내 브라우저는 마이크가 불안정 — 녹음 영역만 안내로 대체하고 나머지 화면은 그대로 쓴다
  if (isInAppBrowser()) return <InAppBrowserNotice compact />
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(canRecord || st.status === 'requesting' || st.status === 'recorded' || st.status === 'playing') && (
          <button data-testid="speaking-record" onClick={rec.start}
            disabled={!canRecord && st.status !== 'recorded'} className={`${BTN} bg-gradient-to-br from-sky-400 to-blue-600 text-white`}>🎤 녹음 시작</button>
        )}
        {st.status === 'recording' && (
          <button data-testid="speaking-stop" onClick={rec.stop} className={`${BTN} bg-red-500 text-white`}>
            ⏹ 그만 <span data-testid="speaking-timer" className="motion-safe:animate-pulse">{rec.elapsed}초</span>
          </button>
        )}
        {(st.status === 'recorded' || st.status === 'playing') && (
          <button data-testid="speaking-play" onClick={rec.play} disabled={st.status === 'playing'}
            className={`${BTN} bg-emerald-500 text-white`}>▶ 들어보기</button>
        )}
        {(st.status === 'recorded' || st.status === 'playing' || st.status === 'error') && (
          <button data-testid="speaking-retake" onClick={rec.retake} disabled={st.status === 'playing'}
            className={`${BTN} bg-gray-200 text-gray-700`}>🔁 다시 녹음</button>
        )}
      </div>
      <p className="text-xs text-gray-500">최대 20초까지 녹음돼요</p>
      <audio data-testid="speaking-audio" {...rec.audioProps} className="hidden" />
      <p data-testid="speaking-status" role="status" aria-live="polite"
        className="text-center text-base font-bold text-sky-700 min-h-[1.5rem]">{recStatusText(st, idleText)}</p>
    </>
  )
}

// 2026-10-04(207차) 한글 상황 안내 카드 — 누가 누구에게 왜 말하는지(scene.situationKo).
// 연습·한글 보고 말하기·다시 연습이 같이 쓴다. 최종 그림이 있는 장면만 그림을 함께 보여 준다(SceneCard.hasFinalArt).
export function SituationGuide({ scene, exam = false, roleKo = null }) {
  return (
    <div className="space-y-3">
      {hasFinalArt(scene.id) && <SceneCard scene={scene} exam={exam} />}
      {!exam && scene.pencil && <Suspense fallback={null}><PencilCaseScene variant={scene.pencil.variant} still={scene.pencil.still} /></Suspense>}
      <div data-testid="situation-guide" data-scene={scene.id}
        className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5 space-y-1">
        <p className="text-sm font-black text-amber-700">상황</p>
        <p data-testid="situation-text" className="text-xl font-bold text-gray-900 leading-relaxed break-keep">{scene.situationKo}</p>
        {roleKo && <p data-testid="situation-role" className="text-base font-bold text-amber-800 break-keep">🙋 내 역할: {roleKo}</p>}
      </div>
    </div>
  )
}

// 화자 이름표 — 장면 이름표(나/미아)와 같은 한글 표기로 통일(217차). KeySentenceFlow도 이것을 쓴다
export const SPEAKER_KO = { Paul: '폴 선생님', Jamie: '제이미', Mia: '미아', Cookie: '쿠키', Shopkeeper: '가게 직원', Guest: '손님' }

// 상대방 대사 — 연습 화면과 시험 공개 후 모범 대화가 같이 쓴다
export function ReplyBubble({ reply, testid, listenTestid, busy = false }) {
  const who = SPEAKER_KO[reply.speaker] || reply.speaker
  return (
    <div data-testid={testid} className="bg-sky-50 border-2 border-sky-200 rounded-3xl p-4 space-y-1">
      <p className="text-base font-black text-gray-900">{who}: {reply.en}</p>
      <p className="text-sm text-gray-600">{reply.ko}</p>
      {reply.speaker !== 'Cookie' && listenTestid && (
        <button data-testid={listenTestid} onClick={() => speak(reply.en, { source: 'speaking' })} disabled={busy}
          className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 듣기</button>
      )}
    </div>
  )
}

export default function SpeakingPracticeItem({ item, rec }) {
  const expr = item
  const busy = rec.st.status === 'recording'
  return (
    <div className="space-y-4">
      <SituationGuide scene={item.practiceScene} roleKo={item.roleKo} />
      <div className="bg-white rounded-3xl p-5 card-shadow space-y-2">
        {item.reply && <p className="text-sm font-black text-sky-700">나</p>}
        <p data-testid="practice-sentence" className="text-2xl font-black text-gray-900">{expr.en}</p>
        <p data-testid="practice-meaning" className="text-base text-gray-600">{expr.ko}</p>
        <button data-testid="practice-listen" onClick={() => speak(expr.en, { source: 'speaking' })} disabled={busy}
          className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 듣기</button>
      </div>
      {item.reply && <ReplyBubble reply={item.reply} testid="practice-reply" listenTestid="practice-reply-listen" busy={busy} />}
      <RecorderControls rec={rec} />
    </div>
  )
}
