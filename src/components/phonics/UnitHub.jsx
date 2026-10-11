// PAUL PHONICS Unit 허브 (254차, 259차 개편, 테스터 전용). Book 1 = 10단계를 3묶음으로, Book 2~5 = 기존 7단계.
// 단계 상태: next(지금 할 것 1개) · ready · done(이 방문에서 했어요) · locked(조용한 한 줄, 버튼 없음). 기록은 상위(PaulPhonics)가 React state로만 들고 있다 — 저장·전송 0.
// 소리 하나는 선생님 녹음이 있을 때만 들려준다(TTS 없음). Book 1은 소리 찾기(skill sound): 자음은 도우미 글자일 뿐 답을 정하지 않는다.
import React, { useMemo, useState } from 'react'
import { STATUS_LABEL_KO, objectiveKo, prereqKo, recordableTargets } from '../../data/phonics/curriculum.js'
import { bubbleRound, spellParts, summarisePhonemes } from '../../utils/phonics/games.js'
import { detectUnit, detectWords, hasGame, missedItems, readyWords, testSession, unitContext, unitTestLock } from '../../utils/phonics/curriculum.js'
import { gameEligible } from '../../utils/pictureWords/games.js'
import { phonemeClip } from '../../data/phonics/phonemeClips.js'
import { imgUrl, playEn, W } from '../pictureWords/pictureImg.jsx'
import PhonemeListen, { LOCKED_TEXT_KO } from './PhonemeListen.jsx'

const BTN = 'min-h-[44px] px-4 py-3 rounded-2xl font-black text-base btn-press disabled:opacity-40'
const MIN_TEST_WORDS = 4
const MUTED = 'text-xs font-bold text-gray-500'
const NONE = '단어 준비 중'
const TEACHER_SOON = '선생님 목소리는 곧 만나요'
const CHUNKS = ['만나요', '말해요', '놀아요']

// 철자 표시: 목표 소리 글자만 강조, 나머지(도우미 글자)는 회색
const Spelled = ({ item, big }) => (
  <span className={`font-black ${big ? 'text-3xl' : 'text-xl'}`}>{spellParts(item.graphemes, item.targetIndex ?? -1).map((x, k) => <span key={k} data-hl={x.hl ? 'true' : undefined} className={x.hl ? 'text-pink-600' : 'text-gray-400'}>{x.t}</span>)}</span>
)
const Thumb = ({ item, cls }) => (item.image === 'ready' ? <img src={imgUrl(item.asset)} alt="그림" draggable={false} className={cls} /> : null)

const Play = ({ w, id }) => <button type="button" data-testid={id} aria-label="단어 듣기" onClick={() => playEn(w.word)} className="min-h-[44px] min-w-[44px] rounded-2xl bg-sky-100 text-xl btn-press">🔊</button>

function Row({ r, onGo, children }) {
  const next = r.state === 'next'
  return (
    <section data-testid={`pph-step-${r.n}`} data-state={r.state} data-covers={r.covers} className={`rounded-2xl border-2 p-3 ${next ? 'border-purple-400 bg-purple-50' : r.state === 'locked' ? 'border-gray-200 bg-gray-50' : 'border-sky-200 bg-white'}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-full px-1 text-sm font-black ${r.state === 'locked' ? 'bg-gray-300 text-gray-600' : next ? 'bg-purple-600 text-white' : 'bg-sky-500 text-white'}`}>{r.badge || r.n}</span>
        <p className="min-w-0 flex-1 break-words text-base font-black text-gray-800">{r.title}{r.tag && <span data-testid="pph-skill" className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-800">{r.tag}</span>}</p>
        {r.state === 'done' && <span data-testid={`pph-step-${r.n}-done`} className="shrink-0 text-xs font-black text-green-700">✓ 오늘 했어요</span>}
      </div>
      {r.state === 'locked' ? <p data-testid={`pph-step-${r.n}-reason`} className="mt-1 break-words text-sm font-bold text-gray-500">{r.why}</p>
        : r.sub && <p className="mt-1 break-words text-sm font-bold text-gray-600">{r.sub}</p>}
      {children}
      {r.go && r.state !== 'locked' && <button type="button" data-testid={`pph-step-${r.n}-go`} onClick={onGo} className={`${BTN} mt-2 w-full ${next ? 'bg-purple-600 text-white' : 'bg-sky-100 text-sky-800'}`}>{next ? '시작하기' : r.toggle ? '보기' : '하기'}</button>}
    </section>
  )
}

export default function UnitHub({ bookId, unitId, records, seen = [], onSeen = () => {}, onBack, onSession, onPractice, onTest, onGame }) {
  const ctx = useMemo(() => unitContext(bookId, unitId), [bookId, unitId])
  const { book, unit, words } = ctx
  const b1 = book.focus === 'vowel-recognition' && !unit.review
  const [open, setOpen] = useState({})
  const mine = records.filter((r) => r.bookId === bookId && r.unitId === unitId)
  const attempts = mine.filter((r) => !r.unitTest)
  const lastTest = mine.filter((r) => r.unitTest).pop()?.unitTest
  const missedIds = missedItems(records, bookId, unitId)
  const detect = detectUnit(bookId, unitId)
  const bubbleWords = useMemo(() => (detect ? detectWords(bookId, unitId).own : words.filter((w) => hasGame(w, 'B') && bubbleRound(w, 0, undefined, { targetIndex: w.targetIndex, optionPairs: w.optionPairs || ctx.optionPairs }))), [words, ctx, detect, bookId, unitId])
  const trainWords = useMemo(() => words.filter((w) => hasGame(w, 'T')), [words])
  const ready = useMemo(() => readyWords(words), [words])
  const pool = useMemo(() => (detect ? [...bubbleWords, ...detectWords(bookId, unitId).far] : bubbleWords), [detect, bubbleWords, bookId, unitId])
  const missed = pool.filter((w) => missedIds.includes(w.id))
  const hasWords = words.length > 0
  const rec = recordableTargets(unit)
  const allClips = rec.length > 0 && rec.every((x) => phonemeClip(x.ipa))
  const key = (k) => `${bookId}/${unitId}/${k}`
  const isSeen = (k) => seen.includes(key(k))
  const keyWords = [...words].sort((a, b) => (b.image === 'ready') - (a.image === 'ready')).slice(0, 2)
  // 철자 게임: 이 Unit의 목표 글자 칸을 먼저 가린다(숨은 글자). 칸 번호 = 철자 속 글자 위치
  const withPrefer = (w) => {
    let pos = 0
    const prefer = []
    for (const p of spellParts(w.graphemes, w.targetIndex ?? -1)) { if (p.hl) for (let k = 0; k < p.t.length; k++) prefer.push(pos + k); pos += p.t.length }
    return prefer.length ? { ...w, prefer } : w
  }

  let rows = []
  const sess = (game, step, items, extra) => () => onSession(game, items, { bookId, unitId, step, learned: ctx.learned, optionPairs: ctx.optionPairs, skill: book.skill, next: after(step), ...extra })
  const after = (step) => { const r = rows.slice(rows.findIndex((x) => x.key === step) + 1).find((x) => x.chain && x.state !== 'locked'); return r ? { label: `다음: ${r.title}`, run: r.run } : null }
  const played = attempts.length > 0
  const reviewWhy = missed.length ? `다시 볼 단어 ${missed.length}개` : played ? '틀린 소리가 없어요' : '게임을 하면 열려요'
  const bubbleLock = !unit.games.includes('B') ? (unit.games.includes('T') ? '이 Unit은 Word Train으로 연습해요' : '철자 게임으로 연습해요') : NONE
  const trainLock = !unit.games.includes('T') ? (unit.games.includes('B') ? '이 Unit은 Sound Bubble Pop으로 연습해요' : '철자 게임으로 연습해요') : NONE
  const testLock = unitTestLock(book)
  const doneBy = (step) => attempts.some((r) => r.step === step)
  const bubble = { key: 'bubble', chain: true, title: 'Sound Bubble Pop', ok: bubbleWords.length > 0, why: bubbleLock, go: true, done: doneBy('bubble') }
  const train = { key: 'train', chain: true, title: 'Word Train', ok: trainWords.length > 0, why: trainLock, go: true, done: doneBy('train') }
  const review = { key: 'review', sub: reviewWhy, ok: missed.length > 0, why: reviewWhy, go: true, run: sess('bubble', 'review', missed) }

  if (b1) {
    const tag = '소리 찾기'
    rows = [
      { n: 1, key: 'intro', chunk: 0, title: '오늘의 소리 만나기', ok: hasWords, why: NONE, toggle: true, go: true, done: isSeen('intro') },
      { n: 2, key: 'hear', chunk: 0, title: '선생님 소리 듣기', ok: hasWords && allClips, why: TEACHER_SOON, info: true },
      { n: 3, key: 'say', chunk: 1, covers: '3,4,5', badge: '3–5', title: '듣고 따라 말하고 녹음해요', sub: '단어로 따라 말해요', ok: ready.length > 0, why: '그림이 준비된 단어가 없어요', go: true, run: () => onPractice(ready), done: isSeen('say') },
      { n: 6, key: 'gallery', chunk: 1, title: '그림과 단어', sub: '단어 듣기 (읽기는 Book 2에서)', ok: hasWords, why: NONE, toggle: true, go: true, done: isSeen('gallery') },
      { ...bubble, n: 7, chunk: 2, tag, sub: detect ? '소리가 들리는 풍선을 터뜨려요' : '소리를 듣고 알맞은 모음 풍선을 터뜨려요', run: sess('bubble', 'bubble', bubbleWords, { interleave: true }) },
      { ...train, n: 8, chunk: 2, tag, sub: '빈 칸에 들리는 모음을 끼워요', run: sess('train', 'train', trainWords, { vowelTrain: true }) },
      { n: 9, key: 'test', chunk: 2, tag, chain: true, title: '소리 확인', sub: `5문제, 한 문제에 한 번씩 골라요${lastTest ? (lastTest.passed ? ' · 통과' : ' · 다시 도전') : ''}`, ok: testSession(bookId, unitId, 0).length === 5, why: NONE, go: true, run: sess('bubble', 'test', [], { test: true }), done: mine.some((r) => r.unitTest) },
      { ...review, n: 10, chunk: 2, title: '다시 만나는 소리' },
    ]
  } else {
    rows = [
      { n: 1, key: 'hear', title: '소리 듣기', ok: hasWords && allClips, why: rec.length ? LOCKED_TEXT_KO : '소리 하나를 따로 듣지 않는 Unit이에요', info: true },
      { n: 2, key: 'repeat', title: '듣고 따라 말하기', ok: hasWords && allClips, why: rec.length ? `${LOCKED_TEXT_KO} — 소리 하나씩 따라 말하려면 선생님 녹음이 있어야 해요. 단어 따라 말하기는 3번에서 해요.` : '소리 하나를 따로 듣지 않는 Unit이에요', info: true },
      { n: 3, key: 'pic', title: '그림과 단어', sub: '그림을 보고 단어를 듣고 따라 말해요', ok: ready.length > 0, why: '그림이 준비된 단어가 없어요', go: true, run: () => onPractice(ready), done: isSeen('pic') },
      { ...bubble, n: 4, sub: '소리를 듣고 풍선을 터뜨려요', run: sess('bubble', 'bubble', bubbleWords, unit.review ? undefined : { interleave: true }) },
      { ...train, n: 5, sub: '소리 블록으로 단어를 만들어요', run: sess('train', 'train', trainWords) },
      { n: 6, key: 'test', chain: true, title: 'Unit Test', sub: '그림을 보고 단어를 골라요', ok: !testLock && ready.length >= MIN_TEST_WORDS, why: testLock || '그림이 준비된 단어가 4개 이상일 때 열려요', go: true, run: () => onTest(ready), done: isSeen('test') },
      { ...review, n: 7, title: '틀린 소리 복습' },
    ]
  }
  rows = rows.map((r) => ({ ...r, state: !r.ok ? 'locked' : r.done ? 'done' : 'ready' }))
  const nextRow = rows.find((r) => r.go && r.state === 'ready')
  if (nextRow) nextRow.state = 'next'
  const go = (r) => () => {
    onSeen(key(r.key))
    if (r.toggle) setOpen((o) => ({ ...o, [r.key]: !o[r.key] }))
    else r.run()
  }

  const wrongPh = b1 ? [] : Object.entries(summarisePhonemes(attempts)).filter(([, s]) => s.wrong > 0 && !s.improvedAfterReview).map(([ph]) => `/${ph}/`)
  const hammerOk = unit.games.includes('H') && ready.some((w) => gameEligible(w, 'hammer'))
  const hiddenOk = unit.games.includes('L') && ready.some((w) => gameEligible(w, 'hidden'))
  const targetLine = b1 ? unit.targets[0].grapheme : unit.labels ? unit.labels.join('  ·  ') : [...unit.targets.map((x) => `${x.grapheme} /${x.ipa}/`), ...unit.aux.map((p) => `${p.split('|')[0]} (미리 만나요)`)].join('  ·  ')
  const unitName = unit.review ? 'Book 전체 연습' : `Unit ${unit.id.slice(1)}`

  const body = (r) => {
    if (r.key === 'intro' && open.intro) {
      return (
        <div data-testid="pph-intro" className="mt-2 space-y-2 text-center">
          <p data-testid="pph-intro-letter" className="text-6xl font-black text-pink-600">{unit.targets[0].grapheme}</p>
          <div className="grid grid-cols-2 gap-2">
            {keyWords.map((w) => (
              <div key={w.id} data-testid="pph-intro-word" data-picture={w.image === 'ready' ? 'true' : 'false'} className="pw-card pw-card--text pw-card-sm">
                <Thumb item={w} cls="pw-pic" />
                <Spelled item={w} />
                <Play w={w} id="pph-intro-play" />
              </div>
            ))}
          </div>
          <p data-testid="pph-tip" className="rounded-2xl bg-amber-50 p-2 text-sm font-bold text-amber-900">{unit.intro.tipKo}</p>
        </div>
      )
    }
    if (r.key === 'gallery' && open.gallery) {
      return (
        <div data-testid="pph-gallery" className="mt-2 grid grid-cols-2 gap-2">
          {words.map((w) => (
            <div key={w.id} data-testid="pph-gallery-word" className="flex flex-col items-center gap-1 rounded-2xl border-2 border-pink-100 bg-white p-2">
              <Thumb item={w} cls="h-16 w-16 rounded-xl object-contain" />
              <Spelled item={w} />
              <Play w={w} id="pph-gallery-play" />
            </div>
          ))}
        </div>
      )
    }
    if (r.info && r.state !== 'locked') return <div className="mt-2 space-y-1">{rec.map((x) => <PhonemeListen key={x.pair} target={x} hideIpa={b1} repeat={r.key === 'repeat'} />)}</div>
    if (r.key === 'hear' && !b1) return <div className="mt-2 space-y-1">{rec.map((x) => <PhonemeListen key={x.pair} target={x} />)}</div>
    return null
  }
  const line = (r) => <Row key={r.n} r={r} onGo={go(r)}>{body(r)}</Row>

  return (
    <div data-testid="pph-unit" data-book={bookId} data-unit={unitId} data-layout={b1 ? 'book1' : 'classic'} className="space-y-3">
      <div className="text-center">
        <p className="text-sm font-bold text-gray-500">Book {book.no} · {book.titleEn} ({book.titleKo})</p>
        <p className="text-2xl font-black text-gray-900">{unitName}</p>
        <p data-testid="pph-unit-target" className={`break-words font-black text-pink-600 ${b1 ? 'text-6xl' : 'text-lg'}`}>{targetLine}</p>
        {b1 && <div className="flex justify-center gap-2">{keyWords.map((w) => <Thumb key={w.id} item={w} cls="h-14 w-14 rounded-xl border-2 border-pink-200 bg-white object-contain" />)}</div>}
        <span data-testid="pph-unit-status" className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">{STATUS_LABEL_KO[unit.status]}</span>
        <p data-testid="pph-unit-words" className="text-sm font-bold text-gray-600">{hasWords ? `단어 ${words.length}개` : NONE}</p>
        {!unit.review && <p data-testid="pph-unit-objective" className="text-sm font-bold text-sky-700">{objectiveKo(book, unit)}</p>}
        {!unit.review && !b1 && <p data-testid="pph-unit-prereq" className={MUTED}>먼저 배운 것: {prereqKo(bookId, unitId)}</p>}
        {unit.note && <p className={MUTED}>{unit.note}</p>}
      </div>

      {b1
        ? CHUNKS.map((title, c) => (
          <div key={c} data-testid={`pph-chunk-${c + 1}`} className="space-y-2">
            <p className="pt-1 text-sm font-black text-purple-700">{title}</p>
            {rows.filter((r) => r.chunk === c).map(line)}
          </div>
        ))
        : rows.map(line)}

      {(hammerOk || hiddenOk) && (
        <div className="space-y-2 rounded-2xl border-2 border-sky-100 bg-white p-3">
          <p className="text-center text-sm font-black text-sky-700">철자 게임</p>
          <div className="grid grid-cols-2 gap-2">
            {hammerOk && <button type="button" data-testid="pph-extra-hammer" onClick={() => onGame('hammer', ready)} className={`${BTN} bg-sky-100 text-sky-700`}>알파벳 망치</button>}
            {hiddenOk && <button type="button" data-testid="pph-extra-hidden" onClick={() => onGame('hidden', ready.map(withPrefer))} className={`${BTN} bg-sky-100 text-sky-700`}>숨은 글자</button>}
          </div>
        </div>
      )}

      <div data-testid="pph-progress" data-records={attempts.length} className="text-center">
        {wrongPh.length > 0 && <p className="rounded-2xl bg-amber-50 p-2 text-sm font-black text-amber-800">다시 볼 소리: {wrongPh.join(', ')}</p>}
      </div>
      <button type="button" data-testid="pph-back" onClick={onBack} className={`${BTN} ${W.gray}`}>Book으로 돌아가기</button>
    </div>
  )
}
