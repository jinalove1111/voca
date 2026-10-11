// PAUL PHONICS learning-progress sections (257차) shared by the student sample screen and the admin sample tab. Presentational only: it gets records and draws CSS bars.
// No network, storage or chart library. The records it is given today are always the FICTIONAL sample (data/phonics/sampleProgress.js).
import React from 'react'
import { GAME_NAME } from '../../data/phonics/curriculum.js'
import { bookProgress, recentActivity, reviewWords, unitName, unitTestResults, weakPhonemes } from '../../utils/phonics/progress.js'

const BAR_COLOR = { b1: 'bg-pink-400', b2: 'bg-emerald-400', b3: 'bg-sky-400', b4: 'bg-yellow-400', b5: 'bg-purple-400' }
const BOX = 'min-w-0 rounded-2xl border-2 border-purple-100 bg-white p-3'
const H = 'text-base font-black text-gray-800'
const GAME_KO = { bubble: GAME_NAME.B, train: GAME_NAME.T }
export const slash = (p) => `/${p}/`
export const Empty = ({ children }) => <p className="text-sm font-bold text-gray-500">{children}</p>

export function Bar({ percent, color }) {
  return (
    <span className="block h-3 w-full overflow-hidden rounded-full bg-gray-100">
      <span className={`block h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
    </span>
  )
}

export default function ProgressViews({ records, prefix }) {
  const books = bookProgress(records)
  const tests = unitTestResults(records)
  const weak = weakPhonemes(records)
  const words = reviewWords(records)
  const recent = recentActivity(records, 5)
  return (
    <div className="min-w-0 space-y-3">
      <section data-testid={`${prefix}-books`} className={BOX}>
        <p className={H}>Book별 학습 진도</p>
        <ul className="mt-2 space-y-2">
          {books.map((b) => (
            <li key={b.bookId} data-testid={`${prefix}-book`} data-book={b.bookId} data-percent={b.percent} className="min-w-0">
              <p className="flex justify-between text-sm font-bold text-gray-700"><span>Book {b.no}</span><span>Unit {b.completed} / {b.total} 완료</span></p>
              <Bar percent={b.percent} color={BAR_COLOR[b.bookId]} />
            </li>
          ))}
        </ul>
      </section>

      <section data-testid={`${prefix}-tests`} className={BOX}>
        <p className={H}>Unit별 시험 결과</p>
        {tests.length ? (
          <ul className="mt-2 space-y-1">
            {tests.map((t) => <li key={`${t.bookId}${t.unitId}`} data-testid={`${prefix}-test`} className="flex justify-between gap-2 text-sm font-bold text-gray-700"><span>{unitName(t.bookId, t.unitId)}</span><span>{t.score} / {t.total}</span></li>)}
          </ul>
        ) : <Empty>아직 Unit 시험을 보지 않았어요.</Empty>}
        <p className="mt-2 text-xs font-bold text-gray-500">Book 1은 시험 대신 소리 풍선으로 확인해요.</p>
      </section>

      <section data-testid={`${prefix}-weak`} className={BOX}>
        <p className={H}>반복해서 틀린 소리</p>
        {weak.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {weak.map((w) => <li key={w.phoneme} data-testid={`${prefix}-weak-item`} className="rounded-full bg-rose-50 px-3 py-1 text-sm font-black text-rose-700">{slash(w.phoneme)} · {w.attempts}번 중 {w.wrong}번 틀렸어요</li>)}
          </ul>
        ) : <Empty>반복해서 틀린 소리는 아직 없어요.</Empty>}
      </section>

      <section data-testid={`${prefix}-review-words`} className={BOX}>
        <p className={H}>복습이 필요한 단어</p>
        {words.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {words.map((w) => <li key={w.itemId} data-testid={`${prefix}-review-word`} className="rounded-full bg-sky-50 px-3 py-1 text-sm font-black text-sky-800">{w.word}</li>)}
          </ul>
        ) : <Empty>복습할 단어가 아직 없어요.</Empty>}
      </section>

      <section data-testid={`${prefix}-recent`} className={BOX}>
        <p className={H}>최근 학습 활동</p>
        {recent.length ? (
          <ul className="mt-2 space-y-1">
            {recent.map((r, i) => (
              <li key={i} data-testid={`${prefix}-recent-item`} className="min-w-0 break-words text-sm font-bold text-gray-700">
                {unitName(r.bookId, r.unitId)} · {r.kind === 'test' ? `Unit 시험 ${r.score} / ${r.total}` : `${GAME_KO[r.gameId] || r.gameId}${r.step === 'review' ? ' (복습)' : ''} · ${r.word} · ${r.correct ? '한 번에 맞혔어요' : '다시 해 보면 좋아요'}`}
              </li>
            ))}
          </ul>
        ) : <Empty>아직 학습 기록이 없어요.</Empty>}
      </section>
    </div>
  )
}
