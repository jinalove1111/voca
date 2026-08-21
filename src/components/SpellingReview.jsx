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
//
// mixedDirections(2026-08-20, 구조적 버그 수정 4번) — 예전엔 반 설정이
// mixed면 direction='mixed' 문자열을 그대로 SpellingQuestion에 넘겼는데,
// SpellingQuestion 내부(pickDirection)는 'mixed'를 'random'과 동일하게
// 취급해 문제마다 Math.random()으로 방향을 뽑았다(50:50 미보장). 이제
// App.jsx가 세션 시작 시 assignDirections로 미리 결정한 배열을
// mixedDirections로 받아 인덱스로 조회한다 — Math.random() 경로 없음.
// 인덱스는 `total - words.length`(0-base, currentNo-1과 동일한 값):
// wrongWordIds는 앞에서부터만 빠지고(clear) 순서가 재배치되지 않으므로,
// "지금까지 몇 개를 clear했는가"가 그대로 "원래 순서상 이 단어의 위치"와
// 같다 — App.jsx의 reviewMixedDirections도 동일한 growth-only 소스
// (wrongWordIds.length)로 배정되므로 인덱스 축이 일치한다. mixedDirections가
// null이면(mixed가 아닌 반) 기존과 동일하게 direction을 그대로 쓴다.
export default function SpellingReview({ wrongWordIds, classWords, onClearWord, onDone, hintEnabled, direction, comebackWordIds = [], mixedDirections = null }) {
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
  // mixed일 때만 사전 배정 배열을 인덱스로 조회(위 헤더 주석 참고). mixed가
  // 아니면(mixedDirections=null) 기존과 동일하게 direction을 그대로 쓴다.
  const resolvedDirection = mixedDirections
    ? (mixedDirections[total - words.length] || 'kr2en')
    : (direction || 'kr2en')

  return (
    <div className="min-h-screen p-4 pb-8 bg-gradient-to-br from-orange-50 to-red-50">
      <div className="max-w-lg mx-auto pt-2 mb-4 text-center">
        <p className="text-2xl mb-1">📔</p>
        {/* Writing MVP: 큐에 오늘치+이월된 단어가 섞일 수 있어 "오늘" 한정
            문구를 뺐다(실제로 며칠 전 놓친 단어가 섞여 있을 수 있으므로). */}
        <h1 className="text-xl font-black text-orange-600">틀린 단어 복습</h1>
        <p className="text-gray-400 text-xs mt-1">남은 단어 {words.length}개 — 맞을 때까지 반복해요!</p>
        {/* 탈출구(4-1) — 이 화면은 "맞을 때까지 반복"이라 나가는 길이 없었음.
            onClearWord(큐 축소 로직)는 그대로 두고 onDone만 직접 호출 —
            학습 데이터 손실 없음(지금까지 맞은 단어는 이미 큐에서 빠진 뒤). */}
        <button onClick={onDone}
          className="mt-2 text-orange-500 text-xs font-bold underline btn-press">
          오늘은 여기까지
        </button>
        <p className="text-gray-300 text-[11px] mt-0.5">여기서 멈춰도 지금까지 한 건 저장돼 있어요</p>
      </div>
      <div className="max-w-lg mx-auto">
        <SpellingQuestion
          key={current.id}
          word={current.word}
          meaning={current.meaning}
          wordAudioUrl={current.wordAudioUrl}
          hintEnabled={hintEnabled}
          // v2.0(2026-08-20 갱신): mixed면 위 resolvedDirection이 App.jsx가
          // 미리 배정한 구체 방향(kr2en/en2kr)을 인덱스로 조회한 값 —
          // Math.random() 경로 없음(위 헤더 주석 참고).
          direction={resolvedDirection}
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
