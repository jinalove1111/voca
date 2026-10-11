// 숨은 글자(250차): a _ p _ e 처럼 비어 있는 글자를 4개 보기에서 고른다. 상태는 React state뿐 — 저장·네트워크·보상 0.
// 숨은 글자와 전체 단어는 맞히기 전에는 DOM에 없다(빈칸은 "_", 전체 단어는 조건부 마운트). 그림 alt는 중립 "그림".
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { hiddenRound, hiddenStart, hiddenPick } from '../../utils/pictureWords/games.js'
import { playSfx } from '../../utils/pictureWords/sfx.js'
import { GamePicture, PwProgress, playEn, T3, useReducedMotion, W } from './pictureImg.jsx'
import { Sparkles, useSuccessThenSpeak } from './gameFx.jsx'
import { BTN } from './AlphabetHammer.jsx'

const DIFFS = [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']]

// 난이도가 바뀌면 호출한 쪽이 key를 바꿔 라운드를 새로 시작한다.
export default function HiddenLetters({ word, seed, difficulty, onDifficulty, index, total, onNext }) {
  const round = useMemo(() => hiddenRound(word, { difficulty, seed, prefer: word.prefer }), [word, difficulty, seed])
  const [st, setSt] = useState(() => hiddenStart(round))
  const blank = round.blanks[st.filled]
  const reduced = useReducedMotion()
  const [celebrate, setCelebrate] = useState(false)
  const stRef = useRef(st) // 탭마다 한 번만 처리
  const { finish, cancel } = useSuccessThenSpeak()
  useEffect(() => {
    if (!celebrate) return undefined
    const t = setTimeout(() => setCelebrate(false), 600)
    return () => clearTimeout(t)
  }, [celebrate])

  const pick = (letter) => {
    const cur = stRef.current
    if (cur.done) return
    const next = hiddenPick(cur, letter)
    if (next === cur) return
    stRef.current = next
    setSt(next)
    if (next.done) { playSfx('tap'); if (!reduced) setCelebrate(true); finish(word.en) } else playSfx(next.last === 'right' ? 'right' : 'wrong')
  }

  return (
    <div data-testid="pwl-root" data-index={index} data-done={st.done ? 'true' : 'false'} data-difficulty={difficulty} className="space-y-3">
      <PwProgress testid="pwl-progress" label="숨은 글자 ·" n={index + 1} total={total} />
      <div className="flex justify-center gap-2">
        {DIFFS.map(([d, ko]) => (
          <button key={d} type="button" data-testid={`pwl-diff-${d}`} onClick={() => d !== difficulty && onDifficulty(d)}
            className={`min-h-[44px] rounded-full px-4 text-sm font-black btn-press ${d === difficulty ? 'bg-purple-600 text-white' : 'bg-white text-purple-700 border-2 border-purple-200'}`}>{ko}</button>
        ))}
      </div>
      <div className="relative">
        <GamePicture word={word} testid="pwl-picture" glow={celebrate && !reduced} />
        {celebrate && !reduced && <Sparkles />}
      </div>
      <p className="text-center text-lg font-bold text-gray-700 break-words">{word.ko}</p>
      <button type="button" data-testid="pwl-listen" onClick={() => playEn(word.en)} className={`${BTN} ${W.sky}`}>🔊 듣기</button>
      <div className="flex flex-wrap justify-center gap-1.5">
        {round.cells.map((c, i) => {
          const h = round.hidden.indexOf(i)
          const filled = h < 0 || h < st.filled
          const current = h >= 0 && h === st.filled && !st.done
          return (
            <span key={i} data-testid={`pwl-cell-${i}`} data-blank={h >= 0 ? 'true' : 'false'} data-filled={filled ? 'true' : 'false'}
              className={`flex h-12 min-w-[40px] items-center justify-center rounded-xl text-2xl font-black ${!c.playable ? 'border-2 border-transparent text-gray-500' : h < 0 ? 'border-2 border-gray-200 bg-white text-gray-900' : h >= 0 && filled ? 'pw-slot-on pw-click' : current ? 'pw-slot pw-slot-now' : 'pw-slot'}`}>
              {filled ? c.ch : '_'}
            </span>
          )
        })}
      </div>
      {!st.done && blank && (
        <div className="grid grid-cols-4 gap-2">
          {blank.options.map((o, k) => (
            <button key={`${st.filled}-${k}`} type="button" data-testid={`pwl-opt-${k}`} disabled={st.tried.includes(o)} onClick={() => pick(o)}
              className={`pw-letter pw-c${k % 4} min-h-[56px] min-w-[48px] rounded-2xl px-3 text-2xl font-black btn-press disabled:opacity-40 ${st.tried.includes(o) ? 'pw-shake' : ''}`}>{o}</button>
          ))}
        </div>
      )}
      {st.last && (
        <p data-testid="pwl-feedback" data-result={st.last} className={`rounded-2xl p-2 text-center text-base font-black ${st.last === 'right' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {st.done ? '다 찾았어요!' : st.last === 'right' ? '좋아요!' : '괜찮아요, 다시 해 볼까요?'}
        </p>
      )}
      {st.done && (
        <div className="space-y-2 text-center">
          <p data-testid="pwl-word" className={T3}>{word.en}</p>
          <button type="button" data-testid="pwl-next" onClick={() => { cancel(); onNext(st.wrong) }} className={`${BTN} ${W.purple}`}>{index + 1 >= total ? '결과 보기' : '다음 단어'}</button>
        </div>
      )}
    </div>
  )
}
