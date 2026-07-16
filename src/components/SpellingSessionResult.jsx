import { getReactionById, pickReaction } from '../utils/paulReactions'
import HeroReaction from './HeroReaction'
import { useMemo } from 'react'

// v2.0(2026-07-17) 쓰기 모드 세션 결과 요약 — WordBrowser 쓰기 모드에서
// 이번 학습 범위(sessionWords)의 마지막 단어까지 끝냈을 때 한 번 표시.
// 방향별 성적("한→영 8/10 · 영→한 9/10 · 총점 17/20")과 틀린 단어 목록.
//
// 순수 표시 컴포넌트 — 채점/기록(recordSpellingAnswer)은 문제를 푸는 순간
// 이미 끝났고, 여기는 App이 세션 동안 모아둔 stats를 요약해서 보여주기만
// 한다. stats: [{ wordId, word, meaning, direction('kr2en'|'en2kr'),
// correct }] — "첫 시도" 기준(오답 후 재입력 통과는 오답으로 집계, 기존
// 오답노트/콤보와 같은 기준).
export default function SpellingSessionResult({ stats = [], onDone }) {
  const summary = useMemo(() => {
    const sum = { kr2en: { correct: 0, total: 0 }, en2kr: { correct: 0, total: 0 }, wrong: [] }
    for (const s of stats) {
      const bucket = sum[s.direction] || sum.kr2en
      bucket.total++
      if (s.correct) bucket.correct++
      else sum.wrong.push(s)
    }
    return sum
  }, [stats])

  const total = summary.kr2en.total + summary.en2kr.total
  const correct = summary.kr2en.correct + summary.en2kr.correct
  const perfect = total > 0 && correct === total
  const paul = perfect ? getReactionById('levelup') : pickReaction(correct >= total / 2 ? 'success' : 'encourage')

  const DirRow = ({ label, data }) => (
    data.total > 0 && (
      <div className="flex items-center justify-between bg-white rounded-2xl border-2 border-teal-100 px-4 py-3">
        <span className="font-bold text-gray-600 text-sm">{label}</span>
        <span className="font-black text-teal-600 text-lg">{data.correct} / {data.total}</span>
      </div>
    )
  )

  return (
    <div className="min-h-screen p-4 pb-8 bg-gradient-to-br from-teal-50 to-cyan-50">
      <div className="max-w-lg mx-auto pt-6 space-y-4">
        <div className="bg-white rounded-3xl card-shadow p-6 text-center space-y-3">
          <p className="text-gray-500 font-bold text-sm">✏️ 쓰기 시험 결과</p>
          <HeroReaction
            image={paul?.image}
            title={perfect ? '💯 전부 맞혔어요!' : `${correct}개 맞혔어요!`}
            message={paul?.message}
            theme={perfect ? 'levelup' : 'success'}
            size="md"
          />
          <p className="font-black text-3xl text-gray-800">
            총점 {correct} <span className="text-gray-300">/</span> {total}
          </p>
          <div className="space-y-2">
            <DirRow label="🇰🇷→🇺🇸 한글 뜻 보고 영어 쓰기" data={summary.kr2en} />
            <DirRow label="🇺🇸→🇰🇷 영어 보고 한글 뜻 쓰기" data={summary.en2kr} />
          </div>
        </div>

        {summary.wrong.length > 0 && (
          <div className="bg-white rounded-3xl card-shadow p-5">
            <p className="font-black text-orange-500 text-sm mb-2">📔 틀린 단어 ({summary.wrong.length}개) — 오답 복습에서 다시 만나요!</p>
            <div className="space-y-1.5">
              {summary.wrong.map((w) => (
                <div key={`${w.wordId}-${w.direction}`} className="flex items-center gap-3 bg-orange-50 rounded-xl px-3 py-2 text-sm">
                  <span className="font-black text-gray-800">{w.word}</span>
                  <span className="text-gray-500 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{w.meaning}</span>
                  <span className="text-[10px] font-bold text-orange-400 flex-shrink-0">{w.direction === 'en2kr' ? '영→한' : '한→영'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onDone}
          className="w-full bg-teal-500 hover:bg-teal-600 text-white font-black py-4 rounded-3xl btn-press card-shadow text-lg">
          확인 → 단어 목록으로
        </button>
      </div>
    </div>
  )
}
