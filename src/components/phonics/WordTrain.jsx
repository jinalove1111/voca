// Word Train (253차 시제품, 254차 Unit 연결): 소리 블록(글자 묶음) 타일을 차례로 눌러 기차 칸을 채워 단어를 만든다. 상태는 React state뿐 — 저장·네트워크·보상 0.
// 영어 철자는 완성하기 전에는 보여 주지 않는다(조건부 마운트, 그림 alt는 중립). 발음은 단어 전체만(finish → playEn).
// 소리 하나는 선생님이 승인한 녹음이 있을 때만 들려준다(playPhonemes는 승인 없으면 아무것도 안 함). 출발한 기차는 다시 돌아오지 않고, 같은 자리에 완성한 단어(pwt-result)가 남는다.
// Book 1(ctx.vowelTrain): 자음 칸은 회색 도우미 글자로 미리 채워져 있고 모음 칸 하나만 비어 있다 — 아이는 들리는 모음 타일(a e i o u) 하나를 고른다. 틀려도 정답을 알려 주지 않는다.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { phonicsAttempt, trainRound, trainRoundVowel, trainStart, trainTap, vowelTap } from '../../utils/phonics/games.js'
import { playPhonemes, allApproved } from '../../utils/phonics/playPhonemes.js'
import { getSfxSettings, playSfx, SUCCESS_MS } from '../../utils/pictureWords/sfx.js'
import { GamePicture, PwProgress, ROLE, playEn, useReducedMotion } from '../pictureWords/pictureImg.jsx'
import { BTN, KO, NEXT, WRONG } from './SoundBubblePop.jsx'
import { Sparkles, useSuccessThenSpeak } from '../pictureWords/gameFx.jsx'


// 맞은 타일이 제자리에서 기차 칸으로 날아간다(FLIP). 순수 장식 — 상태는 이미 갱신돼 있다.
const FLY_MS = 200
function Fly({ text, dx, dy, from, onEnd }) {
  const [go, setGo] = useState(false)
  useEffect(() => {
    const a = setTimeout(() => setGo(true), 20)
    const b = setTimeout(onEnd, FLY_MS + 40)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span data-testid="pwt-fly" style={{ position: 'fixed', left: from.x, top: from.y, width: from.w, height: from.h, zIndex: 50, pointerEvents: 'none', transition: `transform ${FLY_MS}ms ease-out`, transform: go ? `translate(${dx}px, ${dy}px)` : 'none' }}
      className="flex items-center justify-center rounded-2xl border-2 border-green-400 bg-green-50 text-2xl font-black text-gray-900">{text}</span>
  )
}

export default function WordTrain({ item, seed, index, total, studentId, onRecord, onNext, ctx }) {
  const vowelMode = !!ctx?.vowelTrain
  const round = useMemo(() => (vowelMode ? trainRoundVowel(item, seed) : trainRound(item, seed, { learned: ctx?.learned })), [item, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const slot = vowelMode ? round.target.slot : -1
  const nextBtn = useRef(null)
  const [st, setSt] = useState(() => trainStart(round))
  const [fx, setFx] = useState(null) // 방금 틀린 타일 id (흔들림 효과용)
  const [flies, setFlies] = useState([])
  const stRef = useRef(st) // 탭마다 한 번만 처리: 상태의 진실은 ref(동기) + state(그리기)
  const carRefs = useRef({})
  const flyKey = useRef(0)
  const { finish, cancel } = useSuccessThenSpeak()
  const stopPh = useRef(null)
  const timers = useRef([])
  const reduced = useReducedMotion()
  const graphemes = round.target.graphemes
  useEffect(() => { if (st.done) nextBtn.current?.focus({ preventScroll: true }) }, [st.done])

  const stopAll = () => { stopPh.current?.(); stopPh.current = null; timers.current.forEach(clearTimeout); timers.current = []; cancel() }
  useEffect(() => stopAll, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fx) return undefined
    const t = setTimeout(() => setFx(null), 300)
    return () => clearTimeout(t)
  }, [fx])

  const tap = (tile, el) => {
    const cur = stRef.current
    if (cur.done || cur.usedTileIds.includes(tile.id)) return
    const next = vowelMode ? vowelTap(cur, tile.id) : trainTap(cur, tile.id)
    stRef.current = next
    setSt(next)
    if (next.last === 'wrong') {
      playSfx('wrong')
      if (!reduced) setFx(tile.id)
      return
    }
    if (!next.done) { playSfx('right'); playPhonemes([item.phonemes[cur.placed]]) } // 마지막 칸의 성공음은 finish()가 낸다
    if (!reduced && el) {
      const to = carRefs.current[vowelMode ? slot : cur.placed]?.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      if (to) setFlies((f) => [...f, { key: ++flyKey.current, text: tile.grapheme, car: vowelMode ? slot : cur.placed, from: { x: b.left, y: b.top, w: b.width, h: b.height }, dx: to.left + (to.width - b.width) / 2 - b.left, dy: to.top + (to.height - b.height) / 2 - b.top }])
    }
    if (next.done) {
      if (allApproved(item.phonemes)) { // 성공음 → 소리 하나씩(350ms 간격) → 단어 전체
        const { on, volume } = getSfxSettings()
        if (on && volume > 0) playSfx('success')
        timers.current.push(setTimeout(() => { stopPh.current = playPhonemes(item.phonemes, { onDone: () => playEn(item.word) }) }, on && volume > 0 ? SUCCESS_MS + 110 : 0))
      } else finish(item.word) // 성공음 → 단어 전체 발음(겹치지 않게)
    }
  }
  const next = () => {
    stopAll()
    onRecord(phonicsAttempt({ studentId, gameId: 'train', bookId: ctx?.bookId, unitId: ctx?.unitId, step: ctx?.step ?? 'train', targetPhonemes: item.targetIndex != null ? [item.phonemes[item.targetIndex]] : item.phonemes, itemId: item.id, correct: st.wrong === 0, retries: st.wrong, completed: true }))
    onNext()
  }

  return (
    <div data-testid="pwt-root" data-item-index={index} data-done={st.done ? 'true' : 'false'} data-wrong={st.wrong} data-placed={st.placed} className="space-y-3">
      <PwProgress testid="pwt-progress" label="단어 기차 ·" n={index + 1} total={total} />
      {item.asset ? (
        <div className="relative">
          <GamePicture word={item} testid="pwt-picture" glow={st.done && !reduced} />
          {st.done && !reduced && <Sparkles />}
        </div>
      ) : (
        <div className="relative">
          <div data-testid="pwt-text-card" className="pw-card pw-card--text">
            <span className="pw-card-tag">듣기 단어</span>
            <p data-testid="pwt-listen-only" className="text-base font-black text-gray-800">{vowelMode ? '잘 듣고 빈 칸에 들어갈 모음을 골라요' : '잘 듣고 소리 블록을 이어 보세요'}</p>
          </div>
          {st.done && !reduced && <Sparkles />}
        </div>
      )}
      {item.ko && (item.asset || st.done) && <p data-testid="pwt-ko" className={KO}>{item.ko}</p>}
      <button type="button" data-testid="pwt-listen" onClick={() => playEn(item.word)} className={`${BTN} w-full ${ROLE.listen.soft}`}>🔊 듣기</button>
      <p className="text-center text-sm font-bold text-gray-600">{vowelMode ? '회색 글자는 도우미예요. 빈 칸의 모음을 골라요' : '소리 블록을 차례로 이어 보세요'}</p>
      <div className="pwt-track">
        <div data-testid="pwt-train" className={`pwt-train ${st.done ? 'pwt-depart' : ''}`}>
          <span className="pwt-engine" aria-hidden="true">🚂</span>
          {graphemes.map((g, i) => {
            const helper = vowelMode && i !== slot
            const filled = helper || (vowelMode ? st.done : i < st.placed)
            const now = vowelMode ? i === slot : i === st.placed
            return (
              <span key={i} ref={(e) => { carRefs.current[i] = e }} data-testid={`pwt-car-${i}`} data-filled={filled ? 'true' : 'false'} data-helper={helper ? 'true' : undefined}
                className={`pw-cell flex items-center justify-center rounded-lg px-1 text-2xl font-black ${helper ? 'border-2 border-gray-300 bg-gray-100 text-gray-400' : filled ? 'pw-slot-on' : now ? 'pw-slot pw-slot-now' : 'pw-slot'}`}>
                {filled ? <span style={flies.some((f) => f.car === i) ? { visibility: 'hidden' } : undefined}>{g}</span> : ''}
              </span>
            )
          })}
        </div>
        {st.done && (
          <div data-testid="pwt-result" className="pwt-result">
            {graphemes.map((g, i) => <span key={i} className="pw-cell pw-slot-on flex items-center justify-center rounded-lg px-1 text-2xl font-black">{g}</span>)}
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {round.tiles.map((t, i) => {
          const used = st.usedTileIds.includes(t.id)
          return (
            <button key={t.id} type="button" data-testid={`pwt-tile-${t.id}`} data-used={used ? 'true' : 'false'} disabled={used || st.done} onClick={(e) => tap(t, e.currentTarget)}
              className={`pw-cell pw-letter pw-c${i % 4} rounded-2xl px-3 text-2xl font-black btn-press disabled:opacity-40 ${used ? 'scale-75 opacity-30' : ''} ${fx === t.id ? 'pw-shake' : ''}`}>{t.grapheme}</button>
          )
        })}
      </div>
      {flies.map((f) => <Fly key={f.key} text={f.text} dx={f.dx} dy={f.dy} from={f.from} onEnd={() => setFlies((x) => x.filter((y) => y.key !== f.key))} />)}
      {st.last === 'wrong' && !st.done && <p data-testid="pwt-feedback" data-result="wrong" className={WRONG}>다시 해 볼까요?</p>}
      {st.done && (
        <div className="space-y-2 text-center">
          <p data-testid="pwt-word" className="break-words text-3xl font-black text-gray-900">{graphemes.join(' · ')}</p>
          <p data-testid="pwt-spelled" className="break-words text-xl font-bold text-gray-600">{item.display}</p>
          <p data-testid="pwt-feedback" data-result="right" className="rounded-2xl bg-green-50 p-2 text-base font-black text-green-700">기차가 출발해요!</p>
          <button ref={nextBtn} type="button" data-testid="pwt-next" onClick={next} className={NEXT}>{index + 1 >= total ? '결과 보기' : '다음'}</button>
        </div>
      )}
    </div>
  )
}
