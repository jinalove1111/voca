// 레슨 녹음 버튼 두 개. 공용 RecorderControls와 같은 rec 객체·상태 규칙·문구·앱 내 브라우저 안내, 모양만 다름. 녹음은 기기 메모리 전용.
import React from 'react'
import InAppBrowserNotice from '../InAppBrowserNotice'
import { isInAppBrowser } from '../../utils/browserDetect'
import { recStatusText } from '../SpeakingPracticeItem'
import { BTN, ROLE } from './pictureImg.jsx'
import { PICTURE_REC_LABELS as L } from './recLabels.js'

const Lbl = ({ t }) => { const k = t.indexOf(' '); return <><span aria-hidden="true" className="block text-3xl leading-none">{t.slice(0, k)}</span>{' '}<span>{t.slice(k + 1)}</span></> }
const BIG = 'pw-big btn-press disabled:opacity-40'

export default function LessonRecorder({ rec }) {
  const s = rec.st.status
  if (isInAppBrowser()) return <InAppBrowserNotice compact />
  return (
    <>
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
        {(s === 'idle' || s === 'requesting' || s === 'recorded' || s === 'playing') && <button type="button" data-testid="pwp-rec-record" onClick={rec.start} disabled={s === 'requesting' || s === 'playing'} className={`${BIG} ${ROLE.go.strong}`}><Lbl t={L.record} /></button>}
        {s === 'recording' && <button type="button" data-testid="pwp-rec-stop" onClick={rec.stop} className={`${BIG} bg-red-500 text-white`}><Lbl t={L.stop} /> <span data-testid="pwp-rec-timer">{rec.elapsed}초</span></button>}
        <button type="button" data-testid="pwp-rec-play" onClick={rec.play} disabled={s !== 'recorded'} className={`${BIG} col-start-2 ${ROLE.say.strong}`}><Lbl t={L.play} /></button>
      </div>
      {(s === 'recorded' || s === 'playing' || s === 'error') && <button type="button" data-testid="pwp-rec-retake" onClick={rec.retake} disabled={s === 'playing'} className={`${BTN} mx-auto block bg-gray-200 text-gray-700`}>{L.retake}</button>}
      {s === 'idle' && <p data-testid="pwp-rec-hint" className="text-center text-sm font-bold text-gray-500">먼저 따라 말해 보세요</p>}
      <p className="text-center text-xs text-gray-500">최대 20초까지 녹음돼요</p>
      <audio data-testid="pwp-rec-audio" {...rec.audioProps} className="hidden" />
      <p data-testid="pwp-rec-status" role="status" aria-live="polite" className="text-center text-base font-bold text-sky-700 empty:hidden">{recStatusText(rec.st, '', L)}</p>
    </>
  )
}
