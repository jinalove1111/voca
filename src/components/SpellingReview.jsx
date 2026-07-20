import { useEffect, useMemo, useRef, useState } from 'react'
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
//
// P3 게임화(2026-07-16) — 이 화면 안에서만 유효한 로컬 콤보(연속 첫 시도
// 정답)와 진행 바를 추가. 복습은 "맞을 때까지 반복" 구조라 여기서 별을
// 주면 무한정 벌 수 있으므로 별 지급은 없음(comboStarsEnabled를 안 켬 —
// 배지/진행 바 같은 시각 피드백만). 학습 기록(recordSpellingAnswer)도
// 기존과 동일하게 복습에서는 호출하지 않음.
//
// Writing MVP(2026-07-20) — wrongWordIds는 이제 App.jsx가 오늘치 큐
// (spellingWrongToday)와 영구 복습 대기열(spellingReviewQueue)을 합쳐서
// 넘겨준다(이 컴포넌트는 그 구분을 몰라도 되게 그대로 유지 — 순회 로직
// 무변경). comebackWordIds(=원본 spellingReviewQueue)만 별도로 받아 "이
// 단어가 적어도 하루 전에 놓친 단어인지"를 판단해 SpellingQuestion에
// isComebackWord로 전달한다.
export default function SpellingReview({ wrongWordIds, classWords, onClearWord, onDone, hintEnabled, direction, comebackWordIds = [] }) {
  const words = useMemo(
    () => wrongWordIds.map(id => classWords.find(w => w.id === id)).filter(Boolean),
    [wrongWordIds, classWords]
  )
  const [combo, setCombo] = useState(0)
  // 진행 바의 분모 = 이 복습 세션이 시작될 때의 큐 길이. 복습 중 큐는
  // 줄어들기만 하지만(clear만 있음), 혹시 모를 상황에 대비해 최대값으로
  // 안전하게 고정.
  const initialTotalRef = useRef(wrongWordIds.length)
  if (wrongWordIds.length > initialTotalRef.current) initialTotalRef.current = wrongWordIds.length
  const total = initialTotalRef.current

  useEffect(() => {
    if (words.length === 0) onDone()
  }, [words.length, onDone])

  if (words.length === 0) return null

  const current = words[0]
  const currentNo = Math.min(total, total - words.length + 1) // 지금 몇 번째 문제인지 (1-base)

  return (
    <div className="min-h-screen p-4 pb-8 bg-gradient-to-br from-orange-50 to-red-50">
      <div className="max-w-lg mx-auto pt-2 mb-4 text-center">
        <p className="text-2xl mb-1">📔</p>
        {/* Writing MVP: 큐에 오늘치+이월된 단어가 섞일 수 있어 "오늘" 한정
            문구를 뺐다(실제로 며칠 전 놓친 단어가 섞여 있을 수 있으므로). */}
        <h1 className="text-xl font-black text-orange-600">틀린 단어 복습</h1>
        <p className="text-gray-400 text-xs mt-1">남은 단어 {words.length}개 — 맞을 때까지 반복해요!</p>
      </div>
      <div className="max-w-lg mx-auto">
        <SpellingQuestion
          key={current.id}
          word={current.word}
          meaning={current.meaning}
          wordAudioUrl={current.wordAudioUrl}
          hintEnabled={hintEnabled}
          // v2.0: 반 설정이 'mixed'(세션 단위 50:50)여도 복습은 "맞을 때까지
          // 반복"이라 문제 수가 고정이 아니어서 정확 배분이 무의미 — mixed는
          // SpellingQuestion이 문제마다 랜덤과 동일하게 처리(방어 내장).
          direction={direction || 'kr2en'}
          acceptedMeanings={current.acceptedMeanings}
          isComebackWord={comebackWordIds.includes(current.id)}
          onResult={(correct) => setCombo(c => (correct ? c + 1 : 0))}
          onDone={() => onClearWord(current.id)}
          combo={combo}
          progress={{ current: currentNo, total }}
        />
      </div>
    </div>
  )
}
