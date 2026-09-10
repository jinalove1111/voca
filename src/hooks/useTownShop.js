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
import { fetchTownShopState, postTownPurchase, postTownWelcomeClaim } from '../utils/wordLibrary'
import { normalizeShopState, applyPurchaseResult } from '../utils/townShop'

// Paul Town V1(2026-09-11) — 상점 아이템 신규 필드(category/sortOrder/
// minLevel/assetKey) + 학생 레벨을 후처리로 얹는다. normalizeShopState
// (townShop.js, 다른 에이전트 소유 파일)는 건드리지 않는다 — 그 반환값
// 위에 안전한 기본값으로 덧붙이기만 한다(서버가 아직 이 필드를 안 주는
// 과도기 응답에도 절대 throw하지 않음, 기존 townShopV1 동작 변화 0).
function enrichShopState(base, res) {
  const level = Math.max(0, Number(res && res.level) || 0)
  const items = (Array.isArray(base.items) ? base.items : []).map((item) => ({
    ...item,
    category: typeof item.category === 'string' ? item.category : 'misc',
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : 0,
    minLevel: Math.max(0, Number(item.minLevel) || 0),
    assetKey: typeof item.assetKey === 'string' ? item.assetKey : item.id,
  }))
  return { ...base, level, items }
}

export default function useTownShop(studentId, enabled) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [purchasing, setPurchasing] = useState(false)
  // 구매 진행 중 재진입 방지 — state(리렌더 비동기)보다 즉시 확정적인
  // ref로 가드한다(연타/이중 클릭이 두 번째 요청을 서버에 보내지 않도록).
  const purchasingRef = useRef(false)
  const mountedRef = useRef(true)
  // Paul Town V1 — 환영 보상 마운트당 1회 가드(studentId가 바뀌면 다시
  // 청구 가능해야 하므로 아래 useEffect가 studentId 변경 시 리셋한다).
  const welcomeClaimedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    welcomeClaimedRef.current = false
  }, [studentId])

  const refresh = useCallback(async () => {
    if (!enabled || !studentId) return
    setLoading(true)
    const res = await fetchTownShopState()
    if (!mountedRef.current) return
    if (res && res.ok) {
      setState(enrichShopState(normalizeShopState(res), res))
      setError(null)
    } else {
      setState(null)
      setError((res && res.reason) || 'unknown')
    }
    setLoading(false)
  }, [enabled, studentId])

  // Paul Town V1 — 환영 보상 1회 지급 청구. postTownWelcomeClaim 자체는
  // 몇 번을 불러도 서버(idempotency)가 안전하지만, 화면에서 마운트당
  // 정확히 1회만 시도하도록 여기서 ref로 추가 방어한다. granted:true면
  // 잔액 반영을 위해 refresh() — purchase()와 동일하게 fire-and-forget.
  const claimWelcome = useCallback(async () => {
    if (!enabled || !studentId) return { ok: false, reason: 'disabled' }
    if (welcomeClaimedRef.current) return { ok: false, reason: 'already_claimed_this_mount' }
    welcomeClaimedRef.current = true
    const res = await postTownWelcomeClaim()
    if (mountedRef.current && res && res.granted) refresh()
    return res
  }, [enabled, studentId, refresh])

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

  // Paul Town V1 — 서버가 reason:'locked'(minLevel 미달)로 거절하면 아래
  // res를 그대로 반환·applyPurchaseResult에 그대로 넘긴다(둘 다 'locked'를
  // 특별 취급하지 않으므로 상태는 불변으로 유지되고 reason만 그대로
  // 호출자에게 전달 — 새 분기 불필요, 기존 실패 경로 재사용).
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

  return { state, loading, error, purchasing, refresh, purchase, claimWelcome }
}
