// PAUL PHONICS 게임 세션(253차 시제품, 254차 Unit 연결, 259차 Book 1, 테스터 전용): 항목 최대 6개(소리 확인은 5개) → 요약. 기록(phonicsAttempt)은 React state에만 쌓는다 — 저장·전송 0.
// 항목·게임·맥락(ctx: bookId/unitId/step/learned/optionPairs/next)은 Unit 허브가 정해서 넘긴다. 교재 순서는 임시이므로 "임시 구성"이라고만 말한다.
// 소리 확인(ctx.step === 'test')의 결과는 { studentId, bookId, unitId, unitTest: { score, total, passMark, passed }, at } 한 건으로 상위 state에만 남는다.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { passMark, sessionItems, testPassed } from '../../utils/phonics/games.js'
import { bubbleSession, reviewForMisses, testSession } from '../../utils/phonics/curriculum.js'
import { stopSpeaking } from '../../utils/speech'
import { BTN, GameStyle, T2, W } from '../pictureWords/pictureImg.jsx'
import SfxControl from '../pictureWords/SfxControl.jsx'
import SoundBubblePop from './SoundBubblePop.jsx'
import WordTrain from './WordTrain.jsx'

const PUR = `${BTN} ${W.purple}`
const newSeed = () => Date.now() % 2147483647
const SESSION_SIZE = 6

export default function PhonicsAdventure({ game, items: pool, ctx, studentId, onRecord, onBack, onStart, onNext }) {
  const [seed, setSeed] = useState(newSeed)
  const [i, setI] = useState(0)
  const [records, setRecords] = useState([])
  const heard = useRef(false) // 세션에서 첫 듣기 탭 이후에만 다음 문제를 자동 재생
  const sentTest = useRef(false)
  const test = ctx?.step === 'test'
  // 소리 확인 = 5문제. Unit 풍선 세션 = 그 Unit의 풍선 단어 + 이전 Unit 복습 문제 최대 3개(정답이 계속 같은 글자가 되지 않게). 그 밖의 세션은 최대 6개.
  const items = useMemo(() => (test ? testSession(ctx.bookId, ctx.unitId, seed) : game === 'bubble' && ctx?.interleave ? bubbleSession(ctx.bookId, ctx.unitId, seed) : sessionItems(seed, SESSION_SIZE, pool)), [seed, pool, game, ctx, test])
  useEffect(() => stopSpeaking, [])
  const finished = i >= items.length
  const firstTry = records.filter((r) => r.correct).length
  const mark = passMark(items.length)
  const passed = testPassed(firstTry, items.length)
  useEffect(() => {
    if (!finished || !test || sentTest.current) return
    sentTest.current = true
    onRecord?.({ studentId, bookId: ctx.bookId, unitId: ctx.unitId, unitTest: { score: firstTry, total: items.length, passMark: mark, passed }, at: Date.now() })
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => { stopSpeaking(); sentTest.current = false; setSeed(newSeed()); setI(0); setRecords([]) }
  const next = () => { stopSpeaking(); setI((n) => n + 1) }
  const record = (r) => { setRecords((x) => [...x, r]); onRecord?.(r) }

  if (finished) {
    const missed = test ? items.filter((it) => records.some((r) => !r.correct && r.itemId === it.id)) : []
    const nxt = ctx?.next
    const noun = test ? '소리' : game === 'train' ? '단어' : '풍선'
    const review = missed.length > 0 && <button type="button" data-testid="pha-review" onClick={() => onStart('bubble', reviewForMisses(ctx.bookId, ctx.unitId, missed, seed), { ...ctx, step: 'review', interleave: false, next: null, retest: { ...ctx, retest: null } })} className={passed ? `${BTN} w-full bg-amber-100 text-amber-800` : PUR}>틀린 소리 다시 만나기</button>
    return (
      <div data-testid="pha-summary" data-records={records.length} data-score={`${firstTry}/${items.length}`} {...(test && { 'data-passed': String(passed), 'data-pass-mark': mark })} className="space-y-3 text-center">
        <GameStyle />
        <p className={T2}>{test ? '소리 확인을 마쳤어요' : '게임을 마쳤어요'}</p>
        <p className="text-lg text-gray-700">한 번에 {game === 'train' ? '만든' : '맞힌'} {noun} <span data-testid="pha-first-try" data-score={`${firstTry} / ${items.length}`} className="font-black text-purple-700">{firstTry}개</span></p>
        {test && <p data-testid="pha-pass-line" className={`text-lg font-black ${passed ? 'text-green-700' : 'text-amber-800'}`}>{passed ? `통과! ${items.length}문제 중 ${mark}개 이상 맞혔어요` : `조금만 더! ${mark}개를 맞히면 통과예요`}</p>}
        {test && <p data-testid="pha-not-saved" className="text-xs font-black text-amber-800">이 점수는 저장되지 않아요</p>}
        {nxt && <button type="button" data-testid="pha-next-step" onClick={() => onNext(nxt.run)} className={PUR}>{nxt.label}</button>}
        {!passed && review}
        {ctx?.retest && <button type="button" data-testid="pha-retest" onClick={() => onStart('bubble', [], ctx.retest)} className={PUR}>소리 확인 다시 하기</button>}
        <button type="button" data-testid="pha-again" onClick={restart} className={`${BTN} w-full ${nxt || !passed || ctx?.retest ? 'bg-sky-100 text-sky-800' : 'bg-purple-600 text-white'}`}>다시 하기</button>
        {test && passed && review}
        <button type="button" data-testid="pha-exit" onClick={onBack} className={`${BTN} ${W.gray}`}>돌아가기</button>
      </div>
    )
  }
  const item = items[i]
  const common = { item, index: i, total: items.length, studentId, onRecord: record, onNext: next, ctx }
  return (
    <div data-testid="pha-root" data-game={game} data-step={ctx?.step} data-skill={ctx?.skill} className="space-y-3">
      <GameStyle />
      <SfxControl />
      {game === 'bubble'
        ? <SoundBubblePop key={`${item.id}-${i}-${seed}`} {...common} seed={seed + 101 * i} autoplay={heard.current} onHeard={() => { heard.current = true }} />
        : <WordTrain key={`${item.id}-${i}-${seed}`} {...common} seed={seed + 101 * i} />}
      <button type="button" data-testid="pha-quit" onClick={onBack} className={`${BTN} w-full bg-gray-200 text-sm text-gray-700`}>그만하기</button>
    </div>
  )
}
