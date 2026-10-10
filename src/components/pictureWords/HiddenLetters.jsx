// 숨은 글자(250차): a _ p _ e 처럼 비어 있는 글자를 4개 보기에서 고른다. 상태는 React state뿐 — 저장·네트워크·보상 0.
// 숨은 글자와 전체 단어는 맞히기 전에는 DOM에 없다(빈칸은 "_", 전체 단어는 조건부 마운트). 그림 alt는 중립 "그림".
import React, { useMemo, useState } from 'react'
import { hiddenRound, hiddenStart, hiddenPick } from '../../utils/pictureWords/games.js'
import { GamePicture, playEn } from './pictureImg.jsx'

const BTN = 'min-h-[48px] min-w-[48px] px-3 rounded-2xl font-black text-xl btn-press disabled:opacity-40'
const DIFFS = [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']]

// 난이도가 바뀌면 호출한 쪽이 key를 바꿔 라운드를 새로 시작한다.
export default function HiddenLetters({ word, seed, difficulty, onDifficulty, index, total, onNext }) {
  const round = useMemo(() => hiddenRound(word, { difficulty, seed }), [word, difficulty, seed])
  const [st, setSt] = useState(() => hiddenStart(round))
  const blank = round.blanks[st.filled]

  const pick = (letter) => {
    if (st.done) return
    const next = hiddenPick(st, letter)
    setSt(next)
    if (next.done) playEn(word.en) // 사용자 탭 직후
  }

  return (
    <div data-testid="pwl-root" data-index={index} data-done={st.done ? 'true' : 'false'} data-difficulty={difficulty} className="space-y-3">
      <p className="text-center text-sm font-black text-purple-700">숨은 글자 · {index + 1} / {total}</p>
      <div className="flex justify-center gap-2">
        {DIFFS.map(([d, ko]) => (
          <button key={d} type="button" data-testid={`pwl-diff-${d}`} onClick={() => d !== difficulty && onDifficulty(d)}
            className={`min-h-[44px] rounded-full px-4 text-sm font-black btn-press ${d === difficulty ? 'bg-purple-600 text-white' : 'bg-white text-purple-700 border-2 border-purple-200'}`}>{ko}</button>
        ))}
      </div>
      <GamePicture word={word} testid="pwl-picture" />
      <p className="text-center text-lg font-bold text-gray-700 break-words">{word.ko}</p>
      <button type="button" data-testid="pwl-listen" onClick={() => playEn(word.en)} className={`${BTN} w-full bg-sky-100 text-sky-700`}>🔊 듣기</button>
      <div className="flex flex-wrap justify-center gap-1.5">
        {round.cells.map((c, i) => {
          const h = round.hidden.indexOf(i)
          const filled = h < 0 || h < st.filled
          const current = h >= 0 && h === st.filled && !st.done
          return (
            <span key={i} data-testid={`pwl-cell-${i}`} data-blank={h >= 0 ? 'true' : 'false'} data-filled={filled ? 'true' : 'false'}
              className={`flex h-12 min-w-[40px] items-center justify-center rounded-xl border-2 text-2xl font-black ${!c.playable ? 'border-transparent text-gray-500' : current ? 'border-purple-500 bg-purple-50' : h >= 0 && filled ? 'border-green-400 bg-green-50 text-gray-900' : 'border-gray-200 bg-white text-gray-900'}`}>
              {filled ? c.ch : '_'}
            </span>
          )
        })}
      </div>
      {!st.done && blank && (
        <div className="grid grid-cols-4 gap-2">
          {blank.options.map((o, k) => (
            <button key={`${st.filled}-${k}`} type="button" data-testid={`pwl-opt-${k}`} disabled={st.tried.includes(o)} onClick={() => pick(o)}
              className="min-h-[56px] min-w-[48px] rounded-2xl border-2 border-purple-300 bg-white px-3 text-2xl font-black text-purple-700 btn-press disabled:opacity-40">{o}</button>
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
          <p data-testid="pwl-word" className="text-3xl font-black text-gray-900 break-words">{word.en}</p>
          <button type="button" data-testid="pwl-next" onClick={() => onNext(st.wrong)} className={`${BTN} w-full bg-purple-600 text-white`}>{index + 1 >= total ? '결과 보기' : '다음 단어'}</button>
        </div>
      )}
    </div>
  )
}
