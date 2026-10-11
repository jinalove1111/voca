// Phonics Adventure 시제품 세션(253차, 테스터 전용): 항목 6개 → 요약. 기록(phonicsAttempt)은 React state에만 쌓는다 — 저장·전송 0.
// 교재 순서가 확정되지 않았으므로 묶음은 "시제품 묶음"으로만 부르고, 레벨/순서를 말하지 않는다.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { sessionItems } from '../../utils/phonics/games.js'
import { PHONICS_SET_LABEL_KO } from '../../data/phonics/phonicsWords.js'
import { stopSpeaking } from '../../utils/speech'
import { GameStyle } from '../pictureWords/pictureImg.jsx'
import SfxControl from '../pictureWords/SfxControl.jsx'
import SoundBubblePop from './SoundBubblePop.jsx'
import WordTrain from './WordTrain.jsx'

const BTN = 'min-h-[44px] px-4 py-3 rounded-2xl font-black text-lg btn-press disabled:opacity-40'
const newSeed = () => Date.now() % 2147483647

export default function PhonicsAdventure({ game: first, studentId, onMenu, onExit }) {
  const [game, setGame] = useState(first)
  const [seed, setSeed] = useState(newSeed)
  const [i, setI] = useState(0)
  const [records, setRecords] = useState([])
  const [mode, setMode] = useState('practice') // 풍선 터뜨리기: 연습(힌트 있음) | 도전
  const heard = useRef(false) // 세션에서 첫 듣기 탭 이후에만 다음 문제를 자동 재생
  const items = useMemo(() => sessionItems(seed, 6), [seed])
  useEffect(() => stopSpeaking, [])

  const restart = (g) => { stopSpeaking(); setGame(g); setSeed(newSeed()); setI(0); setRecords([]) }
  const next = () => { stopSpeaking(); setI((n) => n + 1) }
  const record = (r) => setRecords((x) => [...x, r])

  if (i >= items.length) {
    const firstTry = records.filter((r) => r.correct).length
    return (
      <div data-testid="pha-summary" data-records={records.length} className="space-y-3 text-center">
        <GameStyle />
        <p className="text-2xl font-black text-gray-900">게임을 마쳤어요</p>
        <p className="text-lg text-gray-700">처음에 맞힌 것 <span data-testid="pha-first-try" className="font-black text-purple-700">{firstTry} / {items.length}</span></p>
        <button type="button" data-testid="pha-again" onClick={() => restart(game)} className={`${BTN} w-full bg-purple-600 text-white`}>다시 하기</button>
        <button type="button" data-testid="pha-other" onClick={() => restart(game === 'bubble' ? 'train' : 'bubble')} className={`${BTN} w-full bg-sky-100 text-sky-700`}>다른 게임</button>
        <button type="button" data-testid="pha-exit" onClick={onExit} className={`${BTN} w-full bg-gray-200 text-gray-700`}>나가기</button>
      </div>
    )
  }
  const item = items[i]
  const common = { item, index: i, total: items.length, studentId, onRecord: record, onNext: next }
  return (
    <div data-testid="pha-root" data-game={game} className="space-y-3">
      <GameStyle />
      <SfxControl />
      <p className="text-center text-xs font-bold text-gray-500">{PHONICS_SET_LABEL_KO}</p>
      {game === 'bubble'
        ? <SoundBubblePop key={`${item.id}-${i}-${seed}`} {...common} seed={seed + 101 * i} mode={mode} onMode={setMode} autoplay={heard.current} onHeard={() => { heard.current = true }} />
        : <WordTrain key={`${item.id}-${i}-${seed}`} {...common} seed={seed + 101 * i} />}
      <button type="button" data-testid="pha-quit" onClick={onMenu} className={`${BTN} w-full bg-gray-200 text-sm text-gray-700`}>그만하기</button>
    </div>
  )
}
