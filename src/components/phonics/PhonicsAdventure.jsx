// PAUL PHONICS 게임 세션(253차 시제품, 254차 Unit 연결, 테스터 전용): 항목 최대 6개 → 요약. 기록(phonicsAttempt)은 React state에만 쌓는다 — 저장·전송 0.
// 항목·게임·맥락(ctx: bookId/unitId/step/learned/optionPairs)은 Unit 허브가 정해서 넘긴다. 교재 순서는 임시이므로 "임시 구성"이라고만 말한다.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { sessionItems } from '../../utils/phonics/games.js'
import { bubbleSession } from '../../utils/phonics/curriculum.js'
import { stopSpeaking } from '../../utils/speech'
import { GameStyle } from '../pictureWords/pictureImg.jsx'
import SfxControl from '../pictureWords/SfxControl.jsx'
import SoundBubblePop from './SoundBubblePop.jsx'
import WordTrain from './WordTrain.jsx'

const BTN = 'min-h-[44px] px-4 py-3 rounded-2xl font-black text-lg btn-press disabled:opacity-40'
const newSeed = () => Date.now() % 2147483647
const SESSION_SIZE = 6

export default function PhonicsAdventure({ game, items: pool, ctx, studentId, onRecord, onBack }) {
  const [seed, setSeed] = useState(newSeed)
  const [i, setI] = useState(0)
  const [records, setRecords] = useState([])
  const [mode, setMode] = useState('practice') // 풍선 터뜨리기: 연습(힌트 있음) | 도전
  const heard = useRef(false) // 세션에서 첫 듣기 탭 이후에만 다음 문제를 자동 재생
  // Unit 풍선 세션 = 그 Unit의 풍선 단어 + 이전 Unit 복습 문제 최대 3개(정답이 계속 같은 글자가 되지 않게). 그 밖의 세션은 최대 6개.
  const items = useMemo(() => (game === 'bubble' && ctx?.interleave ? bubbleSession(ctx.bookId, ctx.unitId, seed) : sessionItems(seed, SESSION_SIZE, pool)), [seed, pool, game, ctx])
  useEffect(() => stopSpeaking, [])

  const restart = () => { stopSpeaking(); setSeed(newSeed()); setI(0); setRecords([]) }
  const next = () => { stopSpeaking(); setI((n) => n + 1) }
  const record = (r) => { setRecords((x) => [...x, r]); onRecord?.(r) }

  if (i >= items.length) {
    const firstTry = records.filter((r) => r.correct).length
    return (
      <div data-testid="pha-summary" data-records={records.length} className="space-y-3 text-center">
        <GameStyle />
        <p className="text-2xl font-black text-gray-900">게임을 마쳤어요</p>
        <p className="text-lg text-gray-700">처음에 맞힌 것 <span data-testid="pha-first-try" className="font-black text-purple-700">{firstTry} / {items.length}</span></p>
        <button type="button" data-testid="pha-again" onClick={restart} className={`${BTN} w-full bg-purple-600 text-white`}>다시 하기</button>
        <button type="button" data-testid="pha-exit" onClick={onBack} className={`${BTN} w-full bg-gray-200 text-gray-700`}>돌아가기</button>
      </div>
    )
  }
  const item = items[i]
  const common = { item, index: i, total: items.length, studentId, onRecord: record, onNext: next, ctx }
  return (
    <div data-testid="pha-root" data-game={game} data-step={ctx?.step} className="space-y-3">
      <GameStyle />
      <SfxControl />
      {game === 'bubble'
        ? <SoundBubblePop key={`${item.id}-${i}-${seed}`} {...common} seed={seed + 101 * i} mode={mode} onMode={setMode} autoplay={heard.current} onHeard={() => { heard.current = true }} />
        : <WordTrain key={`${item.id}-${i}-${seed}`} {...common} seed={seed + 101 * i} />}
      <button type="button" data-testid="pha-quit" onClick={onBack} className={`${BTN} w-full bg-gray-200 text-sm text-gray-700`}>그만하기</button>
    </div>
  )
}
