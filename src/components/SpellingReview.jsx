import { useEffect, useMemo } from 'react'
import SpellingQuestion from './SpellingQuestion'

// 오늘 틀린 단어 복습 — 오답노트 큐(spellingWrongToday)를 순회하며 맞을
// 때까지 반복. 한 단어를 맞히면 큐에서 빠지고(clearSpellingReviewWord)
// 다음 단어를 보여줌. 큐가 완전히 비면 자동으로 홈으로 돌아감.
//
// 설계 결정: 오답노트 큐(spellingWrongToday)는 wordId만 저장하고 "그때
// 어느 방향으로 틀렸는지"는 기록하지 않는다(스키마·저장 포맷 변경 없이
// 가장 단순하게 처리하기 위한 선택). 그래서 복습도 "틀렸던 그 순간의
// 방향"을 복원하는 대신, 반의 현재 spellingDirection 설정을 그대로
// 재사용한다 — 원 학습 흐름(WordDetail의 SpellingQuestion)과 항상 같은
// 방향 정책을 쓰게 되어 학생 입장에서 혼란이 없고, direction prop을 안
// 넘기면(호출부 미변경) 기존과 완전히 동일하게 'kr2en' 기본값으로 동작한다.
export default function SpellingReview({ wrongWordIds, classWords, onClearWord, onDone, hintEnabled, direction }) {
  const words = useMemo(
    () => wrongWordIds.map(id => classWords.find(w => w.id === id)).filter(Boolean),
    [wrongWordIds, classWords]
  )

  useEffect(() => {
    if (words.length === 0) onDone()
  }, [words.length, onDone])

  if (words.length === 0) return null

  const current = words[0]

  return (
    <div className="min-h-screen p-4 pb-8 bg-gradient-to-br from-orange-50 to-red-50">
      <div className="max-w-lg mx-auto pt-2 mb-4 text-center">
        <p className="text-2xl mb-1">📔</p>
        <h1 className="text-xl font-black text-orange-600">오늘 틀린 단어 복습</h1>
        <p className="text-gray-400 text-xs mt-1">남은 단어 {words.length}개 — 맞을 때까지 반복해요!</p>
      </div>
      <div className="max-w-lg mx-auto">
        <SpellingQuestion
          key={current.id}
          word={current.word}
          meaning={current.meaning}
          wordAudioUrl={current.wordAudioUrl}
          hintEnabled={hintEnabled}
          direction={direction || 'kr2en'}
          onResult={() => {}}
          onDone={() => onClearWord(current.id)}
        />
      </div>
    </div>
  )
}
