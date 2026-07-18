// src/hooks/usePaulRank.js — Paul Rank System(2026-07-19) 조회 전용 훅.
// useStudent.js(진행도 쓰기 전담)와 의도적으로 분리 — Rank/XP는 쓰기
// 경로가 서버(api/grant-xp.js)뿐이라 이 훅은 읽기만 한다(별도 로컬 캐시도
// 두지 않음 — xp_totals VIEW를 그대로 읽어 항상 최신 파생값).
//
// **Rank는 student_id 레벨이고 Unit/반 전환에 전혀 영향받지 않는다** —
// 이 훅의 유일한 입력은 studentId 하나뿐이고, computeRankState()의
// 유일한 입력은 xp 숫자 하나뿐이다(paulRankShared.js 참고) — Unit이 이
// 계산 경로 어디에도 들어오지 않는다는 것이 코드 구조 자체로 증명된다.
import { useState, useEffect, useCallback } from 'react'
import { fetchXpTotal } from '../utils/wordLibrary'
import { computeRankState } from '../utils/paulRankShared'

export function usePaulRank(studentId) {
  const [xp, setXp] = useState(0)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!studentId) { setXp(0); setLoading(false); return }
    setLoading(true)
    const total = await fetchXpTotal(studentId) // 테이블/뷰 미존재 시 0(폴백)
    setXp(total)
    setLoading(false)
  }, [studentId])

  useEffect(() => { reload() }, [reload])

  return { xp, loading, reload, rankState: computeRankState(xp) }
}
