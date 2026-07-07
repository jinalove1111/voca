import { useState, useEffect } from 'react'
import { playSuccessSound } from '../utils/speech'

function makeOptions(w, allWords) {
  const others = allWords.filter(x => x.id !== w.id).sort(() => Math.random() - 0.5).slice(0, 3)
  const opts = [w.meaning, ...others.map(x => x.meaning)].sort(() => Math.random() - 0.5)
  return { opts, correctIdx: opts.indexOf(w.meaning) }
}

const PROGRESS_MSGS = ['보스 단어 등장! ⚔️', '이 단어는 거의 잡았어요! 💪', '한 번만 더 맞히면 탈출! 🔥']

export default function LevelUpMission({ missions, words, onAnswer, onBack }) {
  const [practiceId, setPracticeId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [didClear, setDidClear] = useState(false)
  const [opts, setOpts] = useState(null)
  const [correctIdx, setCorrectIdx] = useState(null)

  const activeMissions = missions.filter(m => !m.done)
  const doneMissions   = missions.filter(m => m.done)

  const startPractice = (wordId) => {
    const w = words.find(x => x.id === wordId)
    if (!w) return
    const { opts: o, correctIdx: ci } = makeOptions(w, words)
    setOpts(o)
    setCorrectIdx(ci)
    setSelected(null)
    setDidClear(false)
    setPracticeId(wordId)
  }

  const handleSelect = (i) => {
    if (selected !== null) return
    setSelected(i)
    if (i === correctIdx) {
      // 별 보너스(+3⭐)는 기존 그대로 3번째 정답(클리어)에만 지급 — 매
      // 정답마다 별을 추가로 주는 건 보상 구조를 바꾸는 것이라 요청받은
      // 범위를 넘어서므로 하지 않음. 정답 효과음/축하 연출은 매번.
      playSuccessSound()
      const cleared = onAnswer(practiceId)
      if (cleared) setDidClear(true)
    }
  }

  const handleNext = () => {
    setPracticeId(null)
    setSelected(null)
    setDidClear(false)
  }

  // 정답/오답을 1.5~2초 보여준 뒤 자동으로 다음 문제로 — 클리어(보스 단어
  // 완전 정복) 화면은 별도 축하 순간이라 자동 넘김 대상에서 제외, 계속
  // "계속하기" 버튼으로 직접 넘어가게 둠(기존 동작 유지).
  useEffect(() => {
    if (selected === null || didClear) return
    const isCorrect = selected === correctIdx
    const t = setTimeout(handleNext, isCorrect ? 1500 : 2000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, didClear])

  if (practiceId) {
    const w = words.find(x => x.id === practiceId)
    const m = missions.find(x => x.wordId === practiceId)
    const isAnswered = selected !== null
    const isCorrect  = isAnswered && selected === correctIdx
    const count = m?.correctCount ?? 0

    return (
      <div className="min-h-screen p-4 pb-8 flex flex-col items-center justify-center">
        <div className="w-full max-w-md animate-fade-in">
          {didClear ? (
            <div className="bg-white rounded-3xl card-shadow p-8 text-center animate-slide-up">
              <div className="text-7xl mb-4">🎉</div>
              <h2 className="text-3xl font-black text-green-600 mb-2">보스 단어 클리어!</h2>
              <p className="text-gray-500 mb-4">
                <span className="font-black text-gray-800">{w?.word}</span>을 완전히 외웠어요!
              </p>
              <p className="text-yellow-600 font-bold text-lg mb-6">+3⭐ 보너스 획득!</p>
              <button onClick={handleNext} className="w-full bg-green-500 text-white font-black py-4 rounded-2xl btn-press">
                계속하기 →
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl card-shadow p-6">
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-3 mb-5 text-center">
                <p className="text-red-600 font-black">{PROGRESS_MSGS[Math.min(count, 2)]}</p>
                <div className="flex justify-center gap-2 mt-2">
                  {[0,1,2].map(i => (
                    <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${i < count ? 'bg-green-400 text-white' : 'bg-gray-200 text-gray-400'}`}>
                      {i < count ? '✓' : i + 1}
                    </div>
                  ))}
                </div>
              </div>

              {/* 문제를 푸는 동안에는 영어 단어만 — 뜻은 정답을 고르기
                  전까지 절대 보여주지 않음(보기에 이미 뜻이 있으므로,
                  같이 보이면 문제를 읽지 않고도 답이 보이는 버그였음). */}
              <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 text-white text-center mb-5 word-card">
                <p className="word-text font-black">{w?.word}</p>
              </div>

              <div className="space-y-3">
                {opts?.map((opt, i) => {
                  const isThis  = selected === i
                  const isRight = i === correctIdx
                  let cls = 'border-2 border-gray-200 bg-gray-50 text-gray-700'
                  if (isAnswered) {
                    if (isRight)      cls = 'border-2 border-green-400 bg-green-50 text-green-800'
                    else if (isThis)  cls = 'border-2 border-red-400 bg-red-50 text-red-700'
                    else              cls = 'border-2 border-gray-200 bg-gray-50 text-gray-400'
                  }
                  return (
                    <button key={i} onClick={() => handleSelect(i)} disabled={isAnswered}
                      className={`w-full p-4 rounded-2xl font-bold text-left transition-all btn-press ${cls}`}>
                      {String.fromCharCode(65+i)}. {opt}
                    </button>
                  )
                })}
              </div>

              {/* 정답을 고른 뒤에만 뜻을 공개(word = meaning) — 여기서부터가
                  "학습/복습" 구간. 정답은 초록 체크+축하, 오답은 빨간
                  X+정답 안내만(효과음 없음, 기존 앱 전체와 동일한 원칙). */}
              {isAnswered && (
                <div className={`mt-4 p-4 rounded-2xl border-2 text-center animate-slide-up ${isCorrect ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <p className="text-3xl mb-1">{isCorrect ? '✅ 🎉' : '❌'}</p>
                  <p className="font-black text-lg mb-1">{isCorrect ? 'Correct!' : 'Wrong!'}</p>
                  <p className="font-bold">
                    <span className="text-base">{w?.word}</span>
                    <span className="mx-2 opacity-60">=</span>
                    <span className="text-base">{w?.meaning}</span>
                  </p>
                  {isCorrect && (
                    <p className="text-xs mt-2 opacity-80">{Math.max(0, 3 - (count + 1))}번 더 맞히면 클리어! (+3⭐)</p>
                  )}
                </div>
              )}

              {isAnswered && (
                <button onClick={handleNext} className="w-full mt-4 bg-red-500 text-white font-black py-4 rounded-2xl btn-press animate-slide-up">
                  다음 →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="flex items-center gap-3 max-w-lg mx-auto mb-4 pt-2">
        <button onClick={onBack} className="text-red-500 font-bold btn-press">← 홈</button>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-red-500">⚔️ 레벨업 미션</h1>
          <p className="text-gray-400 text-xs">{activeMissions.length}개 도전 중 · {doneMissions.length}개 클리어</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        {activeMissions.length === 0 ? (
          <div className="bg-white rounded-3xl card-shadow p-10 text-center animate-fade-in">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-xl font-black text-gray-600 mb-2">미션이 없어요!</h2>
            <p className="text-gray-400 text-sm mb-6">퀴즈에서 틀린 단어가 여기 나타나요.</p>
            <button onClick={onBack} className="bg-purple-500 text-white font-bold px-6 py-3 rounded-2xl btn-press">
              퀴즈 하러 가기 🎮
            </button>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in">
            <div className="bg-red-50 rounded-2xl p-3 border-2 border-red-100 text-center mb-4">
              <p className="text-red-600 font-bold text-sm">💡 3번 맞히면 클리어! (+3⭐)</p>
            </div>

            {activeMissions.map((m) => {
              const w = words.find(x => x.id === m.wordId)
              if (!w) return null
              return (
                <div key={m.wordId} className="bg-white rounded-2xl card-shadow p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-black text-xl text-gray-800">{w.word}</span>
                    </div>
                    {/* 뜻은 여기서도 절대 노출 안 함 — "도전!" 누르기 전에
                        정답을 미리 보고 들어갈 수 있었던 것도 같은 버그의
                        연장선. 목록에는 단어와 진행도만. */}
                    <div className="flex items-center gap-1">
                      {[0,1,2].map(i => (
                        <div key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${i < m.correctCount ? 'bg-green-400 text-white' : 'bg-gray-200 text-gray-400'}`}>
                          {i < m.correctCount ? '✓' : i+1}
                        </div>
                      ))}
                      <span className="ml-1 text-xs text-gray-400">{3 - m.correctCount}번 더!</span>
                    </div>
                  </div>
                  <button
                    onClick={() => startPractice(m.wordId)}
                    className="flex-shrink-0 bg-red-500 text-white font-bold px-4 py-3 rounded-xl btn-press hover:bg-red-600 transition-colors"
                  >도전!</button>
                </div>
              )
            })}

            {doneMissions.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-gray-400 font-bold mb-2 px-1">✅ 클리어한 단어 ({doneMissions.length}개)</p>
                <div className="flex flex-wrap gap-2">
                  {doneMissions.map(m => {
                    const w = words.find(x => x.id === m.wordId)
                    return w ? (
                      <span key={m.wordId} className="bg-green-100 text-green-700 font-bold text-sm px-3 py-1 rounded-full">
                        ✓ {w.word}
                      </span>
                    ) : null
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
