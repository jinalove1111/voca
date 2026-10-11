// Sound Bubble Pop (253차 시제품): 단어를 듣고 첫 소리의 글자 풍선을 터뜨린다. 상태는 React state뿐 — 저장·네트워크·보상 0.
// 정답 전에는 그림·영어 단어·뜻이 DOM에 없다(연습 모드 힌트만 예외). 아직 누르지 않은 풍선은 정답이든 아니든 속성·클래스가 똑같다.
// 글자/소리 하나를 음성으로 읽히지 않는다 — 발음은 단어 전체만(playEn).
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { bubblePick, bubbleRound, bubbleStart, phonicsAttempt } from '../../utils/phonics/games.js'
import { playSfx } from '../../utils/pictureWords/sfx.js'
import { GamePicture, PwProgress, playEn, useReducedMotion } from '../pictureWords/pictureImg.jsx'

const BTN = 'min-h-[48px] min-w-[48px] px-3 rounded-2xl font-black text-lg btn-press disabled:opacity-40'

export default function SoundBubblePop({ item, seed, index, total, mode, onMode, autoplay, onHeard, studentId, onRecord, onNext }) {
  const round = useMemo(() => bubbleRound(item, seed), [item, seed])
  const [st, setSt] = useState(() => bubbleStart(round))
  const [fx, setFx] = useState(null) // 방금 틀린 풍선 index (흔들림 효과용)
  const [popped, setPopped] = useState(-1)
  const [hinted, setHinted] = useState(false)
  const stRef = useRef(st) // 탭마다 한 번만 처리
  const timer = useRef(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (autoplay) playEn(item.word) // 첫 문제는 제스처가 없어 자동 재생하지 않는다(autoplay=false)
    return () => clearTimeout(timer.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (fx == null) return undefined
    const t = setTimeout(() => setFx(null), 250)
    return () => clearTimeout(t)
  }, [fx])

  const listen = () => { onHeard?.(); playEn(item.word) }
  const pick = (i) => {
    const cur = stRef.current
    if (cur.done || cur.tried.includes(i)) return
    const next = bubblePick(cur, i)
    stRef.current = next
    setSt(next)
    if (next.done) {
      setPopped(i)
      playSfx('pop'); playSfx('right')
      timer.current = setTimeout(() => playEn(item.word), 500) // 팝 소리 뒤에 단어 발음
    } else {
      playSfx('wrong')
      if (!reduced) setFx(i)
    }
  }
  const finish = () => {
    clearTimeout(timer.current)
    onRecord(phonicsAttempt({ studentId, gameId: 'bubble', targetPhonemes: [item.phonemes[0]], itemId: item.id, correct: st.wrong === 0 && !hinted, retries: st.wrong, completed: true }))
    onNext()
  }

  const reveal = st.done || (hinted && mode === 'practice')
  const rest = item.graphemes.slice(1).join('')
  return (
    <div data-testid="pbp-root" data-item-index={index} data-done={st.done ? 'true' : 'false'} data-wrong={st.wrong} className="space-y-3">
      <PwProgress testid="pbp-progress" label="첫 소리 풍선 ·" n={index + 1} total={total} />
      <div data-testid="pbp-mode" data-mode={mode} className="grid grid-cols-2 gap-2">
        {[['practice', '연습'], ['challenge', '도전']].map(([m, label]) => (
          <button key={m} type="button" data-testid={`pbp-mode-${m}`} aria-pressed={mode === m} onClick={() => onMode(m)}
            className={`min-h-[44px] rounded-full text-sm font-black btn-press ${mode === m ? 'bg-purple-600 text-white' : 'border-2 border-purple-200 bg-white text-purple-700'}`}>{label}</button>
        ))}
      </div>
      <p className="text-center text-base font-bold text-gray-700">잘 듣고 첫 소리 풍선을 터뜨려요</p>
      <button type="button" data-testid="pbp-listen" onClick={listen} className={`${BTN} w-full bg-sky-100 text-sky-700 ${st.last === 'wrong' && !st.done && !reduced ? 'pbp-pulse' : ''}`}>🔊 듣기</button>
      <div className="grid grid-cols-2 place-items-center gap-3 py-2">
        {round.options.map((g, i) => (
          <span key={i} className={reduced ? 'block' : 'pbp-float block'} style={reduced ? undefined : { animationDelay: `${i * 450}ms` }}>
            <button type="button" data-testid={`pbp-bubble-${i}`} data-tried={st.tried.includes(i) ? 'true' : 'false'} disabled={st.done || st.tried.includes(i)} onClick={() => pick(i)}
              className={`pbp-bubble pw-letter pw-c${i % 4} btn-press ${popped === i ? 'pbp-pop' : ''} ${fx === i ? 'pbp-wobble' : ''}`}>{g}</button>
          </span>
        ))}
      </div>
      {st.last === 'wrong' && !st.done && <p data-testid="pbp-feedback" data-result="wrong" className="rounded-2xl bg-amber-50 p-2 text-center text-base font-black text-amber-700">다시 들어 볼까요?</p>}
      {mode === 'practice' && !st.done && !hinted && <button type="button" data-testid="pbp-hint" onClick={() => setHinted(true)} className={`${BTN} w-full bg-yellow-100 text-yellow-800`}>💡 힌트</button>}
      {reveal && (
        <div data-testid="pbp-reveal" className="space-y-2">
          <GamePicture word={item} testid="pbp-picture" glow={st.done && !reduced} />
          <p data-testid="pbp-word" className="text-center text-3xl font-black text-gray-900 break-words"><span className="text-pink-600">{item.graphemes[0]}</span>{rest}</p>
          <p data-testid="pbp-ko" className="text-center text-lg font-bold text-gray-700 break-words">{item.ko}</p>
        </div>
      )}
      {st.done && (
        <>
          <p data-testid="pbp-feedback" data-result="right" className="rounded-2xl bg-green-50 p-2 text-center text-base font-black text-green-700">좋아요!</p>
          <button type="button" data-testid="pbp-next" onClick={finish} className={`${BTN} w-full bg-purple-600 text-white`}>{index + 1 >= total ? '결과 보기' : '다음'}</button>
        </>
      )}
    </div>
  )
}
