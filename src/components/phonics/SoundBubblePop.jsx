// Sound Bubble Pop (253차 시제품, 254차 Unit 연결, 259차 Book 1): 단어를 듣고 목표 소리(첫/가운데/끝)의 글자 풍선을 터뜨린다. 상태는 React state뿐 — 저장·네트워크·보상 0.
// 정답 전에는 그림·영어 단어·뜻이 DOM에 없다(힌트만 예외, 소리 확인에는 힌트가 없다). 아직 누르지 않은 풍선은 정답이든 아니든 속성·클래스가 똑같다(Book 1 첫 Unit의 "다른 소리" 풍선은 글자 크기만 다르다).
// 글자/소리 하나를 음성으로 읽히지 않는다 — 발음은 단어 전체만(playEn). 소리 하나는 선생님이 승인한 녹음이 있을 때만 '소리 듣기' 버튼으로 들려준다(지금은 없음).
// 단어를 한 번 듣기 전에는 풍선이 잠겨 있다. 소리 확인(ctx.step === 'test')은 힌트 없이 한 번만 고른다. 복습 문제(item.origin)는 자기 Unit의 기록으로 남는다.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { OTHER_SOUND_KO, POSITION_KO, bubblePick, bubbleRound, bubbleStart, phonicsAttempt, spellParts } from '../../utils/phonics/games.js'
import { phonemeClip } from '../../data/phonics/phonemeClips.js'
import { playPhonemes } from '../../utils/phonics/playPhonemes.js'
import { playSfx } from '../../utils/pictureWords/sfx.js'
import { stopSpeaking } from '../../utils/speech'
import { GamePicture, PwProgress, playEn, useReducedMotion } from '../pictureWords/pictureImg.jsx'

const BTN = 'min-h-[48px] min-w-[48px] px-3 rounded-2xl font-black text-lg btn-press disabled:opacity-40'
const PRAISE = ['좋아요!', '잘 들었어요!', '바로 그 소리예요!']

export default function SoundBubblePop({ item, seed, index, total, autoplay, onHeard, studentId, onRecord, onNext, ctx }) {
  const ti = item.targetIndex ?? 0
  const test = ctx?.step === 'test'
  const round = useMemo(() => bubbleRound(item, seed, undefined, { targetIndex: ti, optionPairs: item.optionPairs || ctx?.optionPairs, detect: item.detect, vowel: item.vowel }), [item, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const [st, setSt] = useState(() => bubbleStart(round))
  const [fx, setFx] = useState(null) // 방금 틀린 풍선 index (흔들림 효과용)
  const [popped, setPopped] = useState(-1)
  const [hinted, setHinted] = useState(false)
  const [played, setPlayed] = useState(!!autoplay) // 단어를 한 번 들은 뒤에만 풍선을 누른다(자동 재생도 들은 것으로 친다)
  const [gone, setGone] = useState(false) // 답한 뒤 풍선 칸을 접어 "다음"이 한 화면에 보이게
  const stRef = useRef(st) // 탭마다 한 번만 처리
  const timer = useRef(null)
  const sent = useRef(false) // 기록·다음은 한 번만
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

  useEffect(() => {
    if (!st.done) return undefined
    const t = setTimeout(() => setGone(true), 500)
    return () => clearTimeout(t)
  }, [st.done])

  const listen = () => { clearTimeout(timer.current); stopSpeaking(); setPlayed(true); onHeard?.(); playEn(item.word) }
  const pick = (i) => {
    const cur = stRef.current
    if (cur.done || cur.tried.includes(i)) return
    const next = bubblePick(cur, i, { once: test })
    stRef.current = next
    setSt(next)
    if (next.done) {
      if (next.last === 'right') { setPopped(i); playSfx('pop'); playSfx('right') } else playSfx('wrong')
      timer.current = setTimeout(() => { stopSpeaking(); playEn(item.word) }, 500) // 팝 소리 뒤에 단어 발음
    } else {
      playSfx('wrong')
      if (!reduced) setFx(i)
    }
  }
  const finish = () => {
    if (sent.current) return
    sent.current = true
    clearTimeout(timer.current)
    onRecord(phonicsAttempt({ studentId, gameId: 'bubble', bookId: item.origin?.bookId ?? ctx?.bookId, unitId: item.origin?.unitId ?? ctx?.unitId, step: ctx?.step ?? 'bubble', targetPhonemes: [item.phonemes[ti]], itemId: item.id, correct: st.wrong === 0 && !hinted, retries: st.wrong, completed: true }))
    onNext()
  }

  const reveal = st.done || hinted
  const posKo = POSITION_KO[round.target.position]
  const clip = phonemeClip(round.target.ipa)
  const parts = spellParts(item.graphemes, ti)
  if (item.display && item.display !== item.word && parts.length) parts[0] = { ...parts[0], t: item.display[0] + parts[0].t.slice(1) } // 고유명사는 대문자로
  const label = test ? '소리 확인' : item.detect ? '소리 풍선 ·' : `${posKo} 소리 풍선 ·`
  return (
    <div data-testid="pbp-root" data-mode={test ? 'challenge' : 'practice'} data-position={round.target.position} data-detect={item.detect ? 'true' : 'false'} data-item-index={index} data-done={st.done ? 'true' : 'false'} data-wrong={st.wrong} className="space-y-3">
      <PwProgress testid="pbp-progress" label={label} n={index + 1} total={total} />
      <p className="text-center text-base font-bold text-gray-700">{item.detect ? `잘 듣고 ${item.vowel} 소리가 나는지 골라요` : `잘 듣고 ${posKo} 소리 풍선을 터뜨려요`}</p>
      <button type="button" data-testid="pbp-listen" onClick={listen} className={`${BTN} w-full bg-sky-100 text-sky-700 ${!played || (st.last === 'wrong' && !st.done) ? 'pbp-pulse' : ''}`}>{played ? '🔊 다시 듣기' : '🔊 듣기'}</button>
      {clip && <button type="button" data-testid="pbp-listen-sound" onClick={() => playPhonemes([round.target.ipa])} className={`${BTN} w-full bg-pink-100 text-pink-700`}>소리 듣기</button>}
      {!(st.done && gone) && (
        <div className="grid grid-cols-2 place-items-center gap-3 py-2">
          {round.options.map((g, i) => (
            <span key={i} className={reduced ? 'block' : 'pbp-float block'} style={reduced ? undefined : { animationDelay: `${i * 450}ms` }}>
              <button type="button" data-testid={g === OTHER_SOUND_KO ? 'pbp-bubble-other' : `pbp-bubble-${i}`} data-tried={st.tried.includes(i) ? 'true' : 'false'} disabled={!played || st.done || st.tried.includes(i)} onClick={() => pick(i)}
                style={g === OTHER_SOUND_KO ? { fontSize: '1.25rem' } : undefined}
                className={`pbp-bubble pw-letter pw-c${i % 4} btn-press ${popped === i ? 'pbp-pop' : ''} ${fx === i ? 'pbp-wobble' : ''}`}>{g}</button>
            </span>
          ))}
        </div>
      )}
      {st.last === 'wrong' && !st.done && <p data-testid="pbp-feedback" data-result="wrong" className="rounded-2xl bg-amber-50 p-2 text-center text-base font-black text-amber-700">다시 들어 볼까요?</p>}
      {!test && !st.done && !hinted && <button type="button" data-testid="pbp-hint" onClick={() => setHinted(true)} className={`${BTN} w-full bg-yellow-100 text-yellow-800`}>💡 힌트</button>}
      {reveal && (
        <div data-testid="pbp-reveal" className="space-y-2">
          {item.asset && <GamePicture word={item} testid="pbp-picture" glow={st.done && !reduced} small />}
          {(() => {
            const word = <p data-testid="pbp-word" className="text-center text-3xl font-black text-gray-900 break-words">{parts.map((x, k) => (x.hl ? <span key={k} data-hl="true" className="text-pink-600">{x.t}</span> : <React.Fragment key={k}>{x.t}</React.Fragment>))}</p>
            return item.asset ? word : <div data-testid="pbp-text-card" className="pw-card pw-card--text pw-card-sm"><span className="pw-card-tag">듣기 단어</span>{word}</div>
          })()}
          {item.ko && <p data-testid="pbp-ko" className="text-center text-lg font-bold text-gray-700 break-words">{item.ko}</p>}
        </div>
      )}
      {st.done && (
        <>
          {st.last === 'right'
            ? <p data-testid="pbp-feedback" data-result="right" className="rounded-2xl bg-green-50 p-2 text-center text-base font-black text-green-700">{PRAISE[seed % 3]}</p>
            : <p data-testid="pbp-feedback" data-result="wrong" className="rounded-2xl bg-amber-50 p-2 text-center text-base font-black text-amber-700">이 소리를 다시 만나 볼게요</p>}
          <button type="button" data-testid="pbp-next" onClick={finish} className={`${BTN} w-full bg-purple-600 text-white`}>{index + 1 >= total ? '결과 보기' : '다음'}</button>
        </>
      )}
    </div>
  )
}
