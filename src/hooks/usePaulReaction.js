import { useState, useCallback } from 'react'
import { pickReaction, getReactionById } from '../utils/paulReactions'

// 화면 어디서나 폴 선생님 축하 팝업(PaulReaction의 overlay 모드)을
// 띄우기 위한 공용 훅 — 레벨업/별 획득/트로피/연속정답/미션완료처럼
// 화면 전체를 잠깐 덮는 큰 축하 순간에 사용. 퀴즈/쓰기처럼 문제마다
// 나오는 인라인 피드백은 이 훅 없이 pickReaction()을 직접 불러 화면
// 자체 상태에 얹는 편이 더 안전함(각 화면의 기존 타이머와 안 겹치도록).
export function usePaulReaction() {
  const [current, setCurrent] = useState(null)

  const show = useCallback((category) => {
    const r = pickReaction(category)
    if (r) setCurrent(r)
  }, [])

  const showId = useCallback((id) => {
    const r = getReactionById(id)
    if (r) setCurrent(r)
  }, [])

  const hide = useCallback(() => setCurrent(null), [])

  return { current, show, showId, hide }
}
