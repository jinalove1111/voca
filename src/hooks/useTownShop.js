// src/hooks/useTownShop.js — Paul Town 별 상점 V1(townShopV1, 2026-09-06)
// 조회+구매 전용 훅. usePaulRank.js와 같은 원칙: 서버(api/grant-xp.js)가
// 유일한 진실 원천(star_purchases)이고, 이 훅은 그 서버 응답을 화면에
// 그리기 좋은 메모리 상태로만 들고 있다 — 어떤 것도 localStorage/학생
// 진행 레코드(useStudent.js)에 쓰지 않는다(소유권은 매 마운트/로그인/
// 새로고침마다 서버에서 다시 조회 — "client keeps ownership ONLY as
// in-memory UI state" 스펙).
//
// enabled(=townShopV1 플래그 ON && studentId 있음)가 false면 이 훅은
// 아무것도 하지 않는다 — fetch 0회, state는 항상 null. 이게 "플래그 OFF ⇒
// 네트워크 호출 0" 보장의 실제 구현 지점이다.
import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchTownShopState, postTownPurchase } from '../utils/wordLibrary'
import { normalizeShopState, applyPurchaseResult } from '../utils/townShop'

export default function useTownShop(studentId, enabled) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [purchasing, setPurchasing] = useState(false)
  // 구매 진행 중 재진입 방지 — state(리렌더 비동기)보다 즉시 확정적인
  // ref로 가드한다(연타/이중 클릭이 두 번째 요청을 서버에 보내지 않도록).
  const purchasingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refresh = useCallback(async () => {
    if (!enabled || !studentId) return
    setLoading(true)
    const res = await fetchTownShopState()
    if (!mountedRef.current) return
    if (res && res.ok) {
      setState(normalizeShopState(res))
      setError(null)
    } else {
      setState(null)
      setError((res && res.reason) || 'unknown')
    }
    setLoading(false)
  }, [enabled, studentId])

  useEffect(() => {
    if (!enabled || !studentId) {
      setState(null)
      setLoading(false)
      setError(null)
      return
    }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, studentId])

  const purchase = useCallback(async (itemId) => {
    if (purchasingRef.current) return { ok: false, reason: 'in_flight' }
    if (state && Array.isArray(state.owned) && state.owned.includes(itemId)) {
      return { ok: true, reason: 'already_owned' }
    }
    purchasingRef.current = true
    setPurchasing(true)
    try {
      const res = await postTownPurchase(itemId)
      if (mountedRef.current) {
        setState((prev) => applyPurchaseResult(prev || { starsEarned: 0, dollars: { available: 0, earned: 0, spent: 0 }, owned: [] }, itemId, res))
      }
      if (res && res.ok) {
        // 서버와 최종 정합 — fire-and-forget(응답을 기다리지 않는다).
        refresh()
      }
      return res
    } finally {
      purchasingRef.current = false
      if (mountedRef.current) setPurchasing(false)
    }
  }, [state, refresh])

  return { state, loading, error, purchasing, refresh, purchase }
}
