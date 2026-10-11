// PAUL PHONICS Unit 허브 (254차, 테스터 전용): 7단계 + 철자 게임. 단계는 준비됨(ready)/잠김(locked) 중 하나이고 잠긴 이유를 항상 보여 준다.
// 기록은 상위(PaulPhonics)가 이 방문 동안 React state로만 들고 있다 — 저장·전송 0. 소리 하나는 선생님 녹음이 있을 때만 들려준다(TTS 없음).
import React, { useMemo } from 'react'
import { STATUS_LABEL_KO, objectiveKo, prereqKo, recordableTargets } from '../../data/phonics/curriculum.js'
import { bubbleRound, summarisePhonemes } from '../../utils/phonics/games.js'
import { hasGame, missedItems, readyWords, unitContext, unitTestLock } from '../../utils/phonics/curriculum.js'
import { gameEligible } from '../../utils/pictureWords/games.js'
import { phonemeClip } from '../../data/phonics/phonemeClips.js'
import PhonemeListen, { LOCKED_TEXT_KO } from './PhonemeListen.jsx'

const BTN = 'min-h-[44px] px-4 py-3 rounded-2xl font-black text-base btn-press disabled:opacity-40'
const MIN_TEST_WORDS = 4

function Step({ n, title, state, reason, children, go }) {
  return (
    <section data-testid={`pph-step-${n}`} data-state={state} className={`rounded-2xl border-2 p-3 ${state === 'ready' ? 'border-sky-200 bg-white' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${state === 'ready' ? 'bg-sky-500 text-white' : 'bg-gray-300 text-gray-600'}`}>{n}</span>
        <p className="min-w-0 break-words text-base font-black text-gray-800">{title}</p>
      </div>
      {reason && <p data-testid={`pph-step-${n}-reason`} className="mt-1 break-words text-sm font-bold text-gray-500">{reason}</p>}
      {children}
      {go && <button type="button" data-testid={`pph-step-${n}-go`} disabled={state !== 'ready'} onClick={go} className={`${BTN} mt-2 w-full bg-purple-600 text-white`}>시작하기</button>}
    </section>
  )
}

export default function UnitHub({ bookId, unitId, records, onBack, onSession, onPractice, onTest, onGame }) {
  const ctx = useMemo(() => unitContext(bookId, unitId), [bookId, unitId])
  const { book, unit, words } = ctx
  const mine = records.filter((r) => r.bookId === bookId && r.unitId === unitId)
  const missedIds = missedItems(records, bookId, unitId)
  const bubbleWords = useMemo(() => words.filter((w) => hasGame(w, 'B') && bubbleRound(w, 0, undefined, { targetIndex: w.targetIndex, optionPairs: w.optionPairs || ctx.optionPairs })), [words, ctx])
  const trainWords = useMemo(() => words.filter((w) => hasGame(w, 'T')), [words])
  const ready = useMemo(() => readyWords(words), [words])
  const missed = bubbleWords.filter((w) => missedIds.includes(w.id))
  const hasWords = words.length > 0
  const rec = recordableTargets(unit)
  const allClips = rec.length > 0 && rec.every((x) => phonemeClip(x.ipa))
  const sess = (game, step, items, extra) => () => onSession(game, items, { bookId, unitId, step, learned: ctx.learned, optionPairs: ctx.optionPairs, ...extra })
  const testLock = unitTestLock(book)
  const none = '단어 준비 중'
  const noSound = '소리 하나를 따로 듣지 않는 Unit이에요'
  const wrongPh = Object.entries(summarisePhonemes(mine)).filter(([, s]) => s.wrong > 0 && !s.improvedAfterReview).map(([ph]) => `/${ph}/`)
  const hammerOk = unit.games.includes('H') && ready.some((w) => gameEligible(w, 'hammer'))
  const hiddenOk = unit.games.includes('L') && ready.some((w) => gameEligible(w, 'hidden'))
  const bubbleLock = !unit.games.includes('B') ? (unit.games.includes('T') ? '이 Unit은 Word Train으로 연습해요' : '철자 게임으로 연습해요') : none
  const trainLock = !unit.games.includes('T') ? (book.id === 'b1' ? 'Book 2부터' : unit.games.includes('B') ? '이 Unit은 Sound Bubble Pop으로 연습해요' : '철자 게임으로 연습해요') : none
  const targetLine = unit.labels ? unit.labels.join('  ·  ') : [...unit.targets.map((x) => `${x.grapheme} /${x.ipa}/`), ...unit.aux.map((p) => `${p.split('|')[0]} (미리 만나요)`)].join('  ·  ')

  const unitName = unit.review ? 'Book 전체 연습' : `Unit ${unit.id.slice(1)}`
  return (
    <div data-testid="pph-unit" data-book={bookId} data-unit={unitId} className="space-y-3">
      <div className="text-center">
        <p className="text-sm font-bold text-gray-500">Book {book.no} · {book.titleEn} ({book.titleKo})</p>
        <p className="text-2xl font-black text-gray-900">{unitName}</p>
        <p className="break-words text-lg font-black text-pink-600">{targetLine}</p>
        <span data-testid="pph-unit-status" className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">{STATUS_LABEL_KO[unit.status]}</span>
        <p data-testid="pph-unit-words" className="text-sm font-bold text-gray-600">{hasWords ? `단어 ${words.length}개` : none}</p>
        {!unit.review && <p data-testid="pph-unit-objective" className="text-sm font-bold text-sky-700">{objectiveKo(book, unit)}</p>}
        {!unit.review && <p data-testid="pph-unit-prereq" className="text-xs font-bold text-gray-500">먼저 배운 것: {prereqKo(bookId, unitId)}</p>}
        {unit.note && <p className="text-xs font-bold text-gray-500">{unit.note}</p>}
      </div>

      <Step n={1} title="소리 듣기" state={hasWords && allClips ? 'ready' : 'locked'} reason={allClips && hasWords ? '' : rec.length ? LOCKED_TEXT_KO : noSound}>
        <div className="mt-2 space-y-1">{rec.map((x) => <PhonemeListen key={x.pair} target={x} />)}</div>
      </Step>
      <Step n={2} title="듣고 따라 말하기" state={hasWords && allClips ? 'ready' : 'locked'} reason={allClips && hasWords ? '' : rec.length ? `${LOCKED_TEXT_KO} — 소리 하나씩 따라 말하려면 선생님 녹음이 있어야 해요. 단어 따라 말하기는 3번에서 해요.` : noSound}>
        {allClips && hasWords && <div className="mt-2 space-y-1">{rec.map((x) => <PhonemeListen key={x.pair} target={x} repeat />)}</div>}
      </Step>
      <Step n={3} title="그림과 단어" state={ready.length ? 'ready' : 'locked'} reason={ready.length ? '그림을 보고 단어를 듣고 따라 말해요' : '그림이 준비된 단어가 없어요'} go={() => onPractice(ready)} />
      <Step n={4} title="Sound Bubble Pop" state={bubbleWords.length ? 'ready' : 'locked'} reason={bubbleWords.length ? '소리를 듣고 풍선을 터뜨려요' : bubbleLock} go={sess('bubble', 'bubble', bubbleWords, unit.review ? undefined : { interleave: true })} />
      <Step n={5} title="Word Train" state={trainWords.length ? 'ready' : 'locked'} reason={trainWords.length ? '소리 블록으로 단어를 만들어요' : trainLock} go={sess('train', 'train', trainWords)} />
      <Step n={6} title="Unit Test" state={!testLock && ready.length >= MIN_TEST_WORDS ? 'ready' : 'locked'} reason={testLock || (ready.length >= MIN_TEST_WORDS ? '그림을 보고 단어를 골라요' : '그림이 준비된 단어가 4개 이상일 때 열려요')} go={() => onTest(ready)} />
      <Step n={7} title="틀린 소리 복습" state={missed.length ? 'ready' : 'locked'} reason={missed.length ? `다시 볼 단어 ${missed.length}개` : '틀린 소리가 없어요'} go={sess('bubble', 'review', missed)} />

      {(hammerOk || hiddenOk) && (
        <div className="space-y-2 rounded-2xl border-2 border-sky-100 bg-white p-3">
          <p className="text-center text-sm font-black text-sky-700">철자 게임</p>
          <div className="grid grid-cols-2 gap-2">
            {hammerOk && <button type="button" data-testid="pph-extra-hammer" onClick={() => onGame('hammer', ready)} className={`${BTN} bg-sky-100 text-sky-700`}>알파벳 망치</button>}
            {hiddenOk && <button type="button" data-testid="pph-extra-hidden" onClick={() => onGame('hidden', ready)} className={`${BTN} bg-sky-100 text-sky-700`}>숨은 글자</button>}
          </div>
        </div>
      )}

      <div data-testid="pph-progress" data-records={mine.length} className="text-center">
        {wrongPh.length > 0 && <p className="rounded-2xl bg-amber-50 p-2 text-sm font-black text-amber-800">다시 볼 소리: {wrongPh.join(', ')}</p>}
      </div>
      <button type="button" data-testid="pph-back" onClick={onBack} className={`${BTN} w-full bg-gray-200 text-gray-700`}>Book으로 돌아가기</button>
    </div>
  )
}
