import { Suspense, lazy, useState } from 'react'
import { speak } from '../utils/speech'

// 녹음 중이거나 마이크 허용을 기다리는 중 — 다른 녹음기·이동·듣기를 막는다(220차: requesting도 포함해 getUserMedia 중복 방지)
export const BUSY = (st) => st.status === 'recording' || st.status === 'requesting'
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
const REC_LABELS = { record: '🎤 녹음 시작', stop: '⏹ 그만', play: '▶ 들어보기', retake: '🔁 다시 녹음', recording: '녹음 중이에요… 끝나면 그만을 눌러요', recorded: '잘했어요! 들어보거나 다시 녹음해요' }
// 상대 역할 녹음(218차) — 녹음했다고 칭찬·판정하지 않는 중립 문구
export const PARTNER_REC_LABELS = { record: '🎙️ 내 대답 녹음', stop: '⏹ 녹음 끝내기', play: '▶ 내 목소리 듣기', retake: '🔁 다시 녹음', recording: '녹음 중이에요… 끝나면 녹음 끝내기를 눌러요', recorded: '녹음됐어요. 내 목소리를 듣거나 다시 녹음해요' }
export function recStatusText(st, idle = '', labels = REC_LABELS) {
  return st.status === 'recording' ? labels.recording
    : st.status === 'requesting' ? '마이크를 켜는 중이에요. 허용을 눌러 주세요'
    : st.status === 'recorded' || st.status === 'playing' ? labels.recorded
    : st.status === 'error' ? SPEAKING_MESSAGES[st.errorCode] || SPEAKING_MESSAGES.unknown
    : idle
}

// prefix: testid 접두(기본 speaking — 기존 계약 그대로), labels: 버튼·상태 문구, blocked: 같은 화면의 다른 녹음기가 녹음 중
export function RecorderControls({ rec, idleText = '', prefix = 'speaking', labels = REC_LABELS, blocked = false }) {
  const { st } = rec
  const canRecord = st.status === 'idle' && !blocked
  // 앱 내 브라우저는 마이크가 불안정 — 녹음 영역만 안내로 대체하고 나머지 화면은 그대로 쓴다
  if (isInAppBrowser()) return <InAppBrowserNotice compact />
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {/* 다른 녹음기가 녹음 중(blocked)이어도 버튼은 숨기지 않고 비활성으로 둔다 */}
        {(st.status === 'idle' || st.status === 'requesting' || st.status === 'recorded' || st.status === 'playing') && (
          <button data-testid={`${prefix}-record`} onClick={rec.start}
            disabled={blocked || (!canRecord && st.status !== 'recorded')} className={`${BTN} bg-gradient-to-br from-sky-400 to-blue-600 text-white`}>{labels.record}</button>
        )}
        {st.status === 'recording' && (
          <button data-testid={`${prefix}-stop`} onClick={rec.stop} className={`${BTN} bg-red-500 text-white`}>
            {labels.stop} <span data-testid={`${prefix}-timer`} className="motion-safe:animate-pulse">{rec.elapsed}초</span>
          </button>
        )}
        {(st.status === 'recorded' || st.status === 'playing') && (
          <button data-testid={`${prefix}-play`} onClick={rec.play} disabled={blocked || st.status === 'playing'}
            className={`${BTN} bg-emerald-500 text-white`}>{labels.play}</button>
        )}
        {(st.status === 'recorded' || st.status === 'playing' || st.status === 'error') && (
          <button data-testid={`${prefix}-retake`} onClick={rec.retake} disabled={blocked || st.status === 'playing'}
            className={`${BTN} bg-gray-200 text-gray-700`}>{labels.retake}</button>
        )}
      </div>
      <p className="text-xs text-gray-500">최대 20초까지 녹음돼요</p>
      <audio data-testid={`${prefix}-audio`} {...rec.audioProps} className="hidden" />
      <p data-testid={`${prefix}-status`} role="status" aria-live="polite"
        className="text-center text-base font-bold text-sky-700 min-h-[1.5rem]">{recStatusText(st, idleText, labels)}</p>
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
export function ReplyBubble({ reply, testid, listenTestid, busy = false, listenLabel = '🔊 듣기' }) {
  const who = SPEAKER_KO[reply.speaker] || reply.speaker
  return (
    <div data-testid={testid} className="bg-sky-50 border-2 border-sky-200 rounded-3xl p-4 space-y-1">
      <p className="text-base font-black text-gray-900">{who}: {reply.en}</p>
      <p className="text-sm text-gray-600">{reply.ko}</p>
      {reply.speaker !== 'Cookie' && listenTestid && (
        <button data-testid={listenTestid} onClick={() => speak(reply.en, { source: 'speaking' })} disabled={busy}
          className={`${BTN} bg-sky-100 text-sky-700 text-base`}>{listenLabel}</button>
      )}
    </div>
  )
}

// 218차 상대 역할 녹음 — 내 문장(나)을 들은 뒤 아이가 상대(미아) 역할로 대답을 녹음하고 자기 목소리를 다시 듣는다.
// 녹음은 선택이고 기기 메모리에서만 처리(업로드·인식·채점 없음). 녹음했다고 정답·숙달을 판정하지 않는다.
// 예시 대답: 연습은 처음부터 글+🔊(영국 영어 TTS), 시험은 [예시 대답 듣기]를 누르기 전까지 글·음성을 마운트하지 않는다.
export function PartnerRole({ item, rec, exam = false, blocked = false }) {
  const [shown, setShown] = useState(!exam)
  const who = SPEAKER_KO[item.reply.speaker] || item.reply.speaker
  const busy = blocked || BUSY(rec.st)
  const open = () => { setShown(true); speak(item.reply.en, { source: 'speaking' }) }
  return (
    <div data-testid="partner-role" className="bg-violet-50 border-2 border-violet-200 rounded-3xl p-4 space-y-3">
      <p className="text-base font-black text-violet-800">🎭 이번엔 {who} 역할도 해 봐요</p>
      <p className="text-sm text-gray-700 break-keep">내 말을 들은 {who}라면 뭐라고 대답할까요? 대답을 녹음해 보세요. 녹음은 안 해도 돼요.</p>
      <RecorderControls rec={rec} prefix="partner" labels={PARTNER_REC_LABELS} blocked={blocked} idleText="" />
      {shown ? (
        <ReplyBubble reply={item.reply} testid={exam ? 'exam-reply' : 'practice-reply'} listenTestid={exam ? 'exam-reply-listen' : 'practice-reply-listen'} busy={busy} listenLabel="🔊 예시 대답 듣기" />
      ) : (
        <button data-testid="partner-example" onClick={open} disabled={busy} className={`${BTN} bg-white card-shadow text-violet-700`}>🔊 예시 대답 듣기</button>
      )}
    </div>
  )
}

export default function SpeakingPracticeItem({ item, rec, partnerRec = null }) {
  const expr = item
  const partner = !!(partnerRec && item.partnerRole && item.reply)
  const busy = BUSY(rec.st) || (partner && BUSY(partnerRec.st))
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
      {item.reply && !partner && <ReplyBubble reply={item.reply} testid="practice-reply" listenTestid="practice-reply-listen" busy={busy} />}
      <RecorderControls rec={rec} blocked={partner && BUSY(partnerRec.st)} />
      {partner && <PartnerRole item={item} rec={partnerRec} blocked={BUSY(rec.st)} />}
    </div>
  )
}
