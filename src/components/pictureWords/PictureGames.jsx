// 그림 단어 게임/가게 선반을 담는 추가 lazy 청크(250차). 게임 세션: 단어 N개(기본 6) → 요약. React state뿐 — 저장·네트워크·보상 0.
import React, { useEffect, useMemo, useState } from 'react'
import { gameWords } from '../../utils/pictureWords/games.js'
import { stopSpeaking } from '../../utils/speech'
import { GameStyle } from './pictureImg.jsx'
import AlphabetHammer from './AlphabetHammer.jsx'
import HiddenLetters from './HiddenLetters.jsx'
import ShopShelf from './ShopShelf.jsx'

const BTN = 'min-h-[44px] px-4 py-3 rounded-2xl font-black text-lg btn-press disabled:opacity-40'
const newSeed = () => Date.now() % 2147483647

function GameSession({ mode: first, level, from, onPractice, onMenu, onExit }) {
  const [mode, setMode] = useState(first)
  const [seed, setSeed] = useState(newSeed)
  const [difficulty, setDifficulty] = useState('easy')
  const words = useMemo(() => gameWords(level, { count: 6, seed, game: mode, from }), [level, seed, mode, from])
  const [i, setI] = useState(0)
  const [wrongs, setWrongs] = useState([])
  useEffect(() => stopSpeaking, [])
  useEffect(() => { stopSpeaking() }, [i, mode, seed])

  const restart = (m, s = newSeed()) => { setMode(m); setSeed(s); setI(0); setWrongs([]) }
  const next = (wrong) => { stopSpeaking(); setWrongs((x) => [...x, wrong]); setI((n) => n + 1) }

  if (words.length === 0) {
    return (
      <div data-testid="pwg-summary" data-empty="true" className="space-y-3 text-center">
        <p className="text-lg font-black text-gray-700">아직 준비 중이에요</p>
        <button type="button" onClick={onMenu} className={`${BTN} w-full bg-gray-200 text-gray-700`}>뒤로</button>
      </div>
    )
  }
  if (i >= words.length) {
    const first = wrongs.filter((x) => x === 0).length
    return (
      <div data-testid="pwg-summary" className="space-y-3 text-center">
        <p className="text-2xl font-black text-gray-900">게임을 마쳤어요</p>
        <p className="text-lg text-gray-700">처음에 맞힌 단어 <span data-testid="pwg-first-try" className="font-black text-purple-700">{first} / {words.length}</span></p>
        <button type="button" data-testid="pwg-again" onClick={() => restart(mode)} className={`${BTN} w-full bg-purple-600 text-white`}>다시 하기</button>
        <button type="button" data-testid="pwg-other" onClick={() => restart(mode === 'hammer' ? 'hidden' : 'hammer')} className={`${BTN} w-full bg-sky-100 text-sky-700`}>다른 게임</button>
        <button type="button" data-testid="pwg-to-practice" onClick={() => onPractice(words)} className={`${BTN} w-full bg-sky-100 text-sky-700`}>단어 연습으로</button>
        <button type="button" data-testid="pwg-exit" onClick={onExit} className={`${BTN} w-full bg-gray-200 text-gray-700`}>나가기</button>
      </div>
    )
  }
  const w = words[i]
  const wordSeed = seed + 101 * i
  const round = mode === 'hammer'
    ? <AlphabetHammer key={`${w.id}-${i}-${seed}`} word={w} seed={wordSeed} index={i} total={words.length} onNext={next} />
    : <HiddenLetters key={`${w.id}-${i}-${seed}-${difficulty}`} word={w} seed={wordSeed} difficulty={difficulty} onDifficulty={setDifficulty} index={i} total={words.length} onNext={next} />
  return (
    <div className="space-y-3">
      {round}
      <button type="button" data-testid="pwg-quit" onClick={onMenu} className={`${BTN} w-full bg-gray-200 text-sm text-gray-700`}>그만하기</button>
    </div>
  )
}

// kind: 'game' | 'shelf'
export default function PictureGames({ kind, mode, level, from, onPractice, onMenu, onExit }) {
  return (
    <>
      <GameStyle />
      {kind === 'shelf'
        ? <ShopShelf onPractice={onPractice} onBack={onMenu} />
        : <GameSession mode={mode} level={level} from={from} onPractice={onPractice} onMenu={onMenu} onExit={onExit} />}
    </>
  )
}
