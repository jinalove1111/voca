// 알파벳 망치(250차): 섞인 글자 타일을 망치로 두드려 순서대로 빈칸에 채운다. 상태는 React state뿐 — 저장·네트워크·보상 0.
// 영어 단어는 완성하기 전에는 DOM에 없다(조건부 마운트). 그림 alt는 중립 "그림".
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { hammerRound, hammerStart, hammerTap } from '../../utils/pictureWords/games.js'
import { GamePicture, playEn, useReducedMotion } from './pictureImg.jsx'

const BTN = 'min-h-[48px] min-w-[48px] px-3 rounded-2xl font-black text-xl btn-press disabled:opacity-40'

// 맞은 글자가 타일 자리에서 칸으로 날아간다(FLIP: 타일/칸 rect를 재서 transform 전환). 순수 장식 — 상태는 이미 갱신돼 있다.
const SWING_MS = 150, FLY_MS = 280
function Fly({ ch, dx, dy, from, onEnd }) {
  const [go, setGo] = useState(false)
  useEffect(() => {
    const a = setTimeout(() => setGo(true), SWING_MS)
    const b = setTimeout(onEnd, SWING_MS + FLY_MS + 20)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span data-testid="pwh-fly" style={{ position: 'fixed', left: from.x, top: from.y, width: from.w, height: from.h, zIndex: 50, pointerEvents: 'none', transition: `transform ${FLY_MS}ms ease-out`, transform: go ? `translate(${dx}px, ${dy}px)` : 'none' }}
      className="flex items-center justify-center rounded-2xl border-2 border-green-400 bg-green-50 text-3xl font-black text-gray-900">{ch}</span>
  )
}

export default function AlphabetHammer({ word, seed, index, total, onNext }) {
  const round = useMemo(() => hammerRound(word, seed), [word, seed])
  const [st, setSt] = useState(() => hammerStart(round))
  const [fx, setFx] = useState(null) // { id, ok } — 방금 두드린 타일(효과용)
  const [flies, setFlies] = useState([]) // 날아가는 글자들 { key, ch, cell, from, dx, dy }
  const slotRefs = useRef({})
  const flyKey = useRef(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!fx) return undefined
    const t = setTimeout(() => setFx(null), 450)
    return () => clearTimeout(t)
  }, [fx])

  const tap = (tile, el) => {
    if (st.done || st.usedTileIds.includes(tile.id)) return
    const next = hammerTap(st, tile.id)
    setSt(next)
    if (!reduced) setFx({ id: tile.id, ok: next.last === 'right' })
    if (!reduced && next.last === 'right' && el) {
      // 이번에 채워질 칸 = 글자 칸 중 st.placed 번째
      const cell = round.cells.map((c, i) => (c.playable ? i : -1)).filter((i) => i >= 0)[st.placed]
      const to = slotRefs.current[cell]?.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      if (to) setFlies((f) => [...f, { key: ++flyKey.current, ch: tile.ch, cell, from: { x: b.left, y: b.top, w: b.width, h: b.height }, dx: to.left + (to.width - b.width) / 2 - b.left, dy: to.top + (to.height - b.height) / 2 - b.top }])
    }
    if (next.done) playEn(word.en) // 사용자 탭 직후라 자동재생 정책에 걸리지 않는다
  }

  let k = 0 // 채워야 할 글자 칸의 순번
  return (
    <div data-testid="pwh-root" data-index={index} data-done={st.done ? 'true' : 'false'} className="space-y-3">
      <p className="text-center text-sm font-black text-purple-700">알파벳 망치 · {index + 1} / {total}</p>
      <GamePicture word={word} testid="pwh-picture" />
      <p data-testid="pwh-ko" className="text-center text-lg font-bold text-gray-700 break-words">{word.ko}</p>
      <button type="button" data-testid="pwh-listen" onClick={() => playEn(word.en)} className={`${BTN} w-full bg-sky-100 text-sky-700`}>🔊 듣기</button>
      <div className={`flex flex-wrap justify-center gap-1.5 ${st.done && !reduced ? 'pw-bounce' : ''}`}>
        {round.cells.map((c, i) => {
          const filled = !c.playable || k++ < st.placed
          return (
            <span key={i} ref={(e) => { slotRefs.current[i] = e }} data-testid={`pwh-slot-${i}`} data-filled={filled ? 'true' : 'false'}
              className={`pw-cell flex items-center justify-center rounded-xl border-2 text-3xl font-black ${c.playable ? (filled ? 'border-green-400 bg-green-50 text-gray-900' : 'border-dashed border-purple-300 bg-white') : 'border-transparent text-gray-500'}`}>
              {filled && c.playable ? <span style={flies.some((f) => f.cell === i) ? { visibility: 'hidden' } : undefined}>{c.ch}</span> : filled ? c.ch : ''}
            </span>
          )
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {round.tiles.map((t, i) => {
          const used = st.usedTileIds.includes(t.id)
          const shake = fx && fx.id === t.id && !fx.ok
          return (
            <span key={t.id} className="relative inline-block">
              <button type="button" data-testid={`pwh-tile-${i}`} data-used={used ? 'true' : 'false'} disabled={used || st.done} onClick={(e) => tap(t, e.currentTarget)}
                className={`pw-cell pw-tile rounded-2xl px-3 text-3xl font-black btn-press disabled:opacity-40 border-2 border-purple-300 bg-white text-purple-700 ${used ? 'scale-75 opacity-30' : ''} ${shake ? 'pw-shake' : ''}`}>{t.ch}</button>
              {fx && fx.id === t.id && (
                <span className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-3"><span data-testid="pwh-hammer" className="pw-swing block text-6xl leading-none">🔨</span></span>
              )}
            </span>
          )
        })}
      </div>
      {flies.map((f) => <Fly key={f.key} ch={f.ch} dx={f.dx} dy={f.dy} from={f.from} onEnd={() => setFlies((x) => x.filter((y) => y.key !== f.key))} />)}
      {st.last && (
        <p data-testid="pwh-feedback" data-result={st.last} className={`rounded-2xl p-2 text-center text-base font-black ${st.last === 'right' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {st.done ? '다 맞혔어요!' : st.last === 'right' ? '좋아요!' : '괜찮아요, 다시 해 볼까요?'}
        </p>
      )}
      {st.done && (
        <div className="space-y-2 text-center">
          <p data-testid="pwh-word" className="text-3xl font-black text-gray-900 break-words">{word.en}</p>
          <button type="button" data-testid="pwh-next" onClick={() => onNext(st.wrong)} className={`${BTN} w-full bg-purple-600 text-white`}>{index + 1 >= total ? '결과 보기' : '다음 단어'}</button>
        </div>
      )}
    </div>
  )
}
