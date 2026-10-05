import { useEffect, useRef, useState } from 'react'
import { speak } from '../utils/speech'
import useLocalRecorder from '../hooks/useLocalRecorder'
import { RecorderControls, ReplyBubble, SituationGuide, BTN } from './SpeakingPracticeItem'
import PencilCaseScene from './PencilCaseScene'
import { STORY_ITEMS } from '../utils/situation/storyEpisodes'
import { keySentenceFor } from '../utils/situation/speakingSets'

// 2026-10-05 QA 전용 "오늘 기억할 한 문장" — ① 보고 듣기 ② 상황만 보고 말해 보기 ③ 새 친구에게 말해 보기 ④ 끝.
// 연습을 마친 것과 기억한 것은 다르다 — 이 화면은 누르기만으로 "기억했다"고 판정하지 않고, 점수·기록·저장이 없다.
// 공개 전에는 영어 문장/듣기/첫 글자 힌트를 마운트하지 않는다(숨김 렌더 금지). 소리는 학생이 🔊를 누를 때만 난다(자동 재생 없음).
const STEPS = ['watch', 'recall', 'transfer']
// 짧은 대화의 상대 이름표(장면 이름표와 같은 한글 이름)
const SPEAKER_KO = { Mia: '미아', Jamie: '제이미', Paul: '폴 선생님' }
const MIC_IDLE = '말해 봐요. 마이크 없이도 할 수 있어요'

function Answer({ ks, reply, testPrefix }) {
  return (
    <div data-testid={`${testPrefix}-answer`} className="bg-white rounded-3xl p-5 card-shadow space-y-2">
      <p data-testid={`${testPrefix}-answer-label`} className="text-sm font-black text-sky-700">이렇게 말할 수 있어요</p>
      <p data-testid={`${testPrefix}-answer-en`} className="text-2xl font-black text-gray-900">{ks.en}</p>
      <p className="text-base text-gray-600">{ks.ko}</p>
      <button data-testid={`${testPrefix}-listen`} onClick={() => speak(ks.en, { source: 'speaking' })} className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 듣기</button>
      <p data-testid={`${testPrefix}-other-ways`} className="text-sm text-gray-500">상황에 맞으면 다른 말로 말해도 좋아요.</p>
      <ReplyBubble reply={reply} testid={`${testPrefix}-reply`} />
    </div>
  )
}

export default function KeySentenceFlow({ setId, onMenu }) {
  const ks = keySentenceFor(setId)
  const rec = useLocalRecorder()
  const [step, setStep] = useState('watch')
  const [revealed, setRevealed] = useState(false)
  const headingRef = useRef(null)
  const busy = rec.st.status === 'recording'
  useEffect(() => { headingRef.current?.focus() }, [step])
  if (!ks) return null

  const item = STORY_ITEMS.find((i) => i.id === ks.itemId)
  const intro = (ks.introIds || []).map((id) => STORY_ITEMS.find((i) => i.id === id)).filter(Boolean)
  const go = (s) => { rec.reset('RESET'); setRevealed(false); setStep(s) }
  const idx = STEPS.indexOf(step)
  const part = step === 'recall' ? ks.recall : ks.transfer
  const key = step === 'recall' ? 'recall' : 'transfer'
  const reply = step === 'recall' ? item.reply : ks.transfer.reply
  const scene = step === 'watch' ? 'spoon' : step === 'recall' ? (revealed ? 'handover-mia' : 'ask') : (revealed ? 'handover-forgot' : 'forgot')

  return (
    <div data-testid="key-flow" data-step={step} data-mic-state={rec.mic} className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <button data-testid="key-back" onClick={onMenu} disabled={busy} className="min-h-[44px] px-2 font-black text-gray-600 btn-press disabled:opacity-40">← 메뉴</button>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-black text-sky-700 outline-none">오늘 기억할 한 문장</h1>
        </div>

        {step === 'end' ? (
          <div data-testid="key-end" className="bg-white rounded-3xl p-5 card-shadow space-y-3">
            <h2 className="text-lg font-black text-gray-900">오늘 한 문장 연습을 마쳤어요.</h2>
            <p className="text-base text-gray-600">기억했는지는 다음 수업에서 영어 없이 상황만 듣고 다시 말해 보며 확인해요.</p>
            <div className="flex flex-wrap gap-2">
              <button data-testid="key-restart" onClick={() => go('watch')} className={`${BTN} bg-white card-shadow text-gray-700`}>처음부터 다시</button>
              <button data-testid="key-menu" onClick={onMenu} className={`${BTN} bg-sky-500 text-white`}>메뉴로</button>
            </div>
          </div>
        ) : (
          <>
            <p data-testid="key-progress" className="text-sm font-bold text-sky-600">{idx + 1} / 3</p>
            {step === 'transfer' && <p className="text-base font-black text-gray-800">이번엔 다른 상황에서</p>}

            {step === 'watch' ? (
              <>
                <PencilCaseScene variant="spoon" />
                <SituationGuide scene={{ id: 'key-watch', situationKo: ks.watch.situationKo }} />
                <div data-testid="key-sentence" className="bg-white rounded-3xl p-5 card-shadow space-y-2">
                  <p className="text-sm font-black text-sky-700">오늘 기억할 한 문장</p>
                  <p data-testid="key-sentence-en" className="text-2xl font-black text-gray-900">{ks.en}</p>
                  <p className="text-base text-gray-600">{ks.ko}</p>
                  <button data-testid="key-listen" onClick={() => speak(ks.en, { source: 'speaking' })} className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 듣기</button>
                </div>
                <RecorderControls rec={rec} idleText="들은 문장을 따라 말해 봐요. 녹음은 안 해도 돼요" />
              </>
            ) : (
              <>
                {step === 'recall' && (
                  <div data-testid="key-intro" className="bg-white rounded-3xl p-4 card-shadow space-y-1">
                    <p className="text-sm font-black text-gray-700">짧은 대화</p>
                    {intro.map((i) => (
                      <p key={i.id} className="text-base text-gray-900"><span className="font-black">나:</span> {i.en} <span className="text-sm text-gray-600">({i.ko})</span><br />
                        <span className="font-black">{SPEAKER_KO[i.reply.speaker] || i.reply.speaker}:</span> {i.reply.en} <span className="text-sm text-gray-600">({i.reply.ko})</span></p>
                    ))}
                  </div>
                )}
                <PencilCaseScene key={scene} variant={scene} />
                <SituationGuide scene={{ id: `key-${key}`, situationKo: part.situationKo }} roleKo={part.roleKo} />
                {revealed && <Answer ks={ks} reply={reply} testPrefix="key" />}
                <RecorderControls rec={rec} idleText={MIC_IDLE} />
              </>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              {step !== 'watch' && !revealed ? (
                <button data-testid="key-reveal" onClick={() => setRevealed(true)} disabled={busy} className={`${BTN} bg-amber-500 text-white`}>답 확인</button>
              ) : <span />}
              <button data-testid="key-next" onClick={() => go(step === 'watch' ? 'recall' : step === 'recall' ? 'transfer' : 'end')}
                disabled={busy || (step !== 'watch' && !revealed)} className={`${BTN} bg-white card-shadow text-gray-700`}>다음 →</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
