// src/components/town/v2/TownScreenV2.jsx — Paul Town V2-A 화면(2026-09-13).
//
// V1 TownScreen.jsx의 데이터 배선(shopState/ownedIds/balance/level/
// starsEarned/catalog/itemById/rawLayout/placements, 환영 가이드/환영
// 선물 청구/토스트/레벨업 effect, handlePlaceStart/handleMoveStart/
// handleCancelMode/handleCellTap/handleStore/handlePurchase)을 그대로
// 복제한다 — 저장/소유권의 진실 원천은 여전히 studentData(useStudent.js)
// 와 townShop(useTownShop.js)이고, 이 화면은 그 둘을 조합해 스토리북
// 장면(TownScene.jsx)으로 그리기만 한다. 탭 3개(내 마을/상점/보관함)
// 대신 장면 위에 항상 마을을 보여주고, 상점/보관함은 바텀시트로 연다.
import { useState, useEffect, useMemo, useRef } from 'react'
import TownHud from './TownHud'
import TownScene from './TownScene'
import PaulGuide from './PaulGuide'
import TownSheet from './TownSheet'
import TownShopPanel from '../TownShopPanel'
import TownInventory from '../TownInventory'
import { mergeCatalog } from '../../../utils/town/townCatalog'
import { visiblePlacements } from '../../../utils/town/townLayout'
import { paulGuide, TOWN_PHRASES } from '../../../utils/town/townMessages'
import { gardenRichness, fogState, nearGoal } from '../../../utils/town/townScene'

export default function TownScreenV2({ studentData, townShop, onBack, gardenPoints }) {
  const [sheet, setSheet] = useState(null)
  const [mode, setMode] = useState({ kind: 'idle' })
  const [guide, setGuide] = useState(null)
  const [pendingPurchaseId, setPendingPurchaseId] = useState(null)
  const [toast, setToast] = useState(null)
  const welcomedRef = useRef(false)
  const welcomeClaimAttemptedRef = useRef(false)
  const prevLevelRef = useRef(null)

  const shopState = townShop && townShop.state
  const ownedIds = (shopState && Array.isArray(shopState.owned)) ? shopState.owned : []
  const balance = (shopState && shopState.dollars && Number(shopState.dollars.available)) || 0
  const level = Math.max(1, (shopState && Number(shopState.level)) || 1)
  const starsEarned = (shopState && Number(shopState.starsEarned)) || 0

  const catalog = useMemo(() => mergeCatalog(shopState ? shopState.items : []), [shopState])
  const itemById = useMemo(() => {
    const out = {}
    for (const it of catalog) out[it.id] = it
    return out
  }, [catalog])

  const rawLayout = useMemo(() => ({
    townPlacements: Array.isArray(studentData && studentData.townPlacements) ? studentData.townPlacements : [],
    townRemovedIds: Array.isArray(studentData && studentData.townRemovedIds) ? studentData.townRemovedIds : [],
  }), [studentData && studentData.townPlacements, studentData && studentData.townRemovedIds])
  const placements = useMemo(() => visiblePlacements(rawLayout, ownedIds), [rawLayout, ownedIds])

  function showGuide(event, ctx) {
    setGuide(paulGuide(event, ctx))
  }

  // 첫 진입 환영 가이드 — V1과 동일(마운트당 1회, 잔액 0 & 보유 0이면
  // earn_hint로 폴백).
  useEffect(() => {
    if (welcomedRef.current) return
    welcomedRef.current = true
    const noProgressYet = balance === 0 && ownedIds.length === 0
    showGuide(noProgressYet ? 'earn_hint' : 'welcome')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 환영 선물 20 Paul Dollar — V1과 동일 조건/1회 청구.
  useEffect(() => {
    if (!shopState || !townShop || typeof townShop.claimWelcome !== 'function') return
    if (welcomeClaimAttemptedRef.current) return
    const owned = Array.isArray(shopState.owned) ? shopState.owned : []
    const available = shopState.dollars ? Number(shopState.dollars.available) : 0
    if (owned.length === 0 && available === 0) {
      welcomeClaimAttemptedRef.current = true
      townShop.claimWelcome().then((res) => {
        if (res && res.granted) setToast('🎁 환영 선물 20 Paul Dollar!')
      })
    }
  }, [shopState, townShop])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  // 마을 레벨 상승 감지 — V1과 동일.
  useEffect(() => {
    if (prevLevelRef.current != null && level > prevLevelRef.current) {
      showGuide('levelup', { level })
    }
    prevLevelRef.current = level
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level])

  function handlePlaceStart(itemId) {
    setMode({ kind: 'placing', itemId })
  }

  function handleMoveStart(placementId) {
    setMode({ kind: 'moving', placementId })
  }

  function handleCancelMode() {
    setMode({ kind: 'idle' })
  }

  function handleCellTap(x, y) {
    if (mode.kind === 'placing' && studentData && typeof studentData.placeTownItem === 'function') {
      const res = studentData.placeTownItem(mode.itemId, x, y, ownedIds)
      if (res && res.ok) {
        const item = itemById[mode.itemId]
        setMode({ kind: 'idle' })
        showGuide('first_place', { name: item ? item.name : '' })
      }
    } else if (mode.kind === 'moving' && studentData && typeof studentData.moveTownItem === 'function') {
      const res = studentData.moveTownItem(mode.placementId, x, y)
      if (res && res.ok) setMode({ kind: 'idle' })
    }
  }

  function handleStore(placementId) {
    if (studentData && typeof studentData.storeTownItem === 'function') {
      studentData.storeTownItem(placementId)
    }
  }

  async function handlePurchase(itemId) {
    if (!townShop || typeof townShop.purchase !== 'function') return { ok: false, reason: 'disabled' }
    setPendingPurchaseId(itemId)
    try {
      return await townShop.purchase(itemId)
    } finally {
      setPendingPurchaseId(null)
    }
  }

  const richness = gardenRichness(gardenPoints)
  const fog = fogState(catalog, level)
  const goal = nearGoal(catalog, starsEarned)

  return (
    <div className="min-h-screen p-4 pb-24" data-testid="town-screen-v2">
      <div className="max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press hover:text-purple-600">
          ← Paul Town
        </button>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <TownHud
          level={level}
          starsEarned={starsEarned}
          dollarsAvailable={balance}
          goal={goal}
          onOpenShop={() => setSheet('shop')}
          onOpenInventory={() => setSheet('inventory')}
        />

        <PaulGuide guide={guide} />

        {toast && (
          <div className="bg-emerald-50 text-emerald-700 text-sm font-bold text-center rounded-2xl p-3">{toast}</div>
        )}

        {mode.kind !== 'idle' && (
          <div className="flex items-center justify-between gap-2 bg-purple-50 rounded-2xl p-3">
            <p className="text-xs font-bold text-purple-600">
              {mode.kind === 'placing'
                ? `${(itemById[mode.itemId] && itemById[mode.itemId].name) || ''}을(를) 놓을 자리를 선택하세요`
                : '옮길 자리를 선택하세요'}
            </p>
            <button type="button" onClick={handleCancelMode} className="min-h-[44px] px-3 text-xs font-black text-purple-400 btn-press flex-shrink-0">
              취소
            </button>
          </div>
        )}

        <TownScene
          placements={placements}
          itemById={itemById}
          mode={mode}
          onCellTap={handleCellTap}
          onStartMove={handleMoveStart}
          onStore={handleStore}
          richness={richness}
          gardenPoints={gardenPoints}
          fog={fog}
        />

        <p className="text-center text-xs text-gray-400">{TOWN_PHRASES.brighter}</p>
      </div>

      <TownSheet open={sheet === 'shop'} title="🛒 상점" onClose={() => setSheet(null)}>
        <TownShopPanel
          items={catalog}
          ownedIds={ownedIds}
          balance={balance}
          level={level}
          purchasingId={pendingPurchaseId}
          onPurchase={handlePurchase}
          onGuide={showGuide}
        />
      </TownSheet>

      <TownSheet open={sheet === 'inventory'} title="🎁 보관함" onClose={() => setSheet(null)}>
        <TownInventory
          items={catalog}
          ownedIds={ownedIds}
          placements={placements}
          onPlaceStart={(id) => { setSheet(null); handlePlaceStart(id) }}
          onMoveStart={(pid) => { setSheet(null); handleMoveStart(pid) }}
          onGoShop={() => setSheet('shop')}
        />
      </TownSheet>
    </div>
  )
}
