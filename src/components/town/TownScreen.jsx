// src/components/town/TownScreen.jsx — Paul Town V1 화면(2026-09-11).
//
// 탭 [🏘 내 마을 | 🛒 상점 | 🎁 보관함] + 헤더(⭐레벨/💵잔액) + 폴 가이드
// (HeroReaction 1개, 화면에 항상 이미지 1장만) + 최초 진입 환영 선물
// 청구(플래그 ON이고 owned 0개·잔액 0일 때 1회). 저장/소유권의 진실
// 원천은 전부 부모가 넘겨준 studentData(townPlacements/townRemovedIds +
// placeTownItem/moveTownItem/storeTownItem, useStudent.js 소유)와
// townShop(state/purchase/claimWelcome, useTownShop.js 소유) — 이 화면은
// 그 둘을 조합해 그리기만 한다.
import { useState, useEffect, useMemo, useRef } from 'react'
import HeroReaction from '../HeroReaction'
import { getReactionById } from '../../utils/paulReactions'
import TownHeader from './TownHeader'
import TownGrid from './TownGrid'
import TownShopPanel from './TownShopPanel'
import TownInventory from './TownInventory'
import { mergeCatalog } from '../../utils/town/townCatalog'
import { visiblePlacements } from '../../utils/town/townLayout'
import { paulGuide, TOWN_PHRASES } from '../../utils/town/townMessages'
// British World Phase 2(2026-09-12) — 안전 프로토타입 실배선. 둘 다
// paulTownV1 게이팅 아래(TownScreen 자체가 이미 그 플래그로만 마운트됨,
// App.jsx)에서만 쓰이고, TownHeader.jsx/townCatalog.js 등 기존 파일의
// 데이터 계약은 조금도 바꾸지 않는다(순수 시각 래퍼 + 순수 조회 함수).
import TownWoodenSignHeader from './TownWoodenSignHeader'

const TABS = [
  { id: 'town', label: '🏘 내 마을' },
  { id: 'shop', label: '🛒 상점' },
  { id: 'inventory', label: '🎁 보관함' },
]

export default function TownScreen({ studentData, townShop, onBack, studentId }) {
  const [tab, setTab] = useState('town')
  const [mode, setMode] = useState({ kind: 'idle' })
  const [guide, setGuide] = useState(null)
  const [guideEvent, setGuideEvent] = useState(null)
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
    setGuideEvent(event)
  }

  // 첫 진입 환영 가이드 — 이 화면 마운트(세션)당 1회. PHASE 4(2026-09-11):
  // 잔액 0 & 보유 0(=아직 아무 것도 못 산 학생)이면 일반 환영 대신
  // earn_hint(공부하면 마을이 자란다는 안내)를 보여준다 — 그 외에는 기존
  // welcome 그대로(동작 변화 없음).
  useEffect(() => {
    if (welcomedRef.current) return
    welcomedRef.current = true
    const noProgressYet = balance === 0 && ownedIds.length === 0
    showGuide(noProgressYet ? 'earn_hint' : 'welcome')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 환영 선물 20 Paul Dollar — owned 0개 & 잔액 0일 때 최초 1회만 청구.
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

  // 마을 레벨 상승 감지(직전 레벨보다 커지면) — Small Steps, Big Dreams.
  useEffect(() => {
    if (prevLevelRef.current != null && level > prevLevelRef.current) {
      showGuide('levelup', { level })
    }
    prevLevelRef.current = level
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level])

  function handlePlaceStart(itemId) {
    setMode({ kind: 'placing', itemId })
    setTab('town')
  }

  function handleMoveStart(placementId) {
    setMode({ kind: 'moving', placementId })
    setTab('town')
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

  const reaction = guide ? getReactionById(guide.reactionId) : null
  const brandPhrase = guideEvent === 'levelup'
    ? TOWN_PHRASES.smallSteps
    : tab === 'town'
      ? TOWN_PHRASES.brighter
      : tab === 'shop'
        ? TOWN_PHRASES.learnEarn
        : null

  return (
    <div className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press hover:text-purple-600">
          ← Paul Town
        </button>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        {/* British World Phase 2(2026-09-12) — TownHeader의 데이터 props/
            PD·레벨 표시 로직은 조금도 바꾸지 않고, 시각 래퍼로만 감싼다
            (TownWoodenSignHeader는 순수 프레젠테이션, TownHeader.jsx 자체는
            무수정 — COMPONENT_ARCHITECTURE.md §1 근거). */}
        <TownWoodenSignHeader>
          <TownHeader level={level} starsEarned={starsEarned} dollarsAvailable={balance} />
        </TownWoodenSignHeader>

        {reaction && guide && (
          <TownWoodenSignHeader>
            <HeroReaction image={reaction.image} message={guide.text} theme="neutral" size="sm" />
          </TownWoodenSignHeader>
        )}

        {toast && (
          <div className="bg-emerald-50 text-emerald-700 text-sm font-bold text-center rounded-2xl p-3">{toast}</div>
        )}

        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 min-h-[44px] rounded-2xl text-sm font-black btn-press ${
                tab === t.id ? 'bg-purple-500 text-white' : 'bg-white text-gray-500 card-shadow'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mode.kind !== 'idle' && (
          <div className="flex items-center justify-between gap-2 bg-purple-50 rounded-2xl p-3">
            <p className="text-xs font-bold text-purple-600">
              {mode.kind === 'placing'
                ? `${(itemById[mode.itemId] && itemById[mode.itemId].name) || ''}을(를) 놓을 칸을 선택하세요`
                : '옮길 칸을 선택하세요'}
            </p>
            <button type="button" onClick={handleCancelMode} className="min-h-[44px] px-3 text-xs font-black text-purple-400 btn-press flex-shrink-0">
              취소
            </button>
          </div>
        )}

        {tab === 'town' && (
          <TownGrid
            placements={placements}
            itemById={itemById}
            mode={mode}
            onCellTap={handleCellTap}
            onStartMove={handleMoveStart}
            onStore={handleStore}
            studentId={studentId}
          />
        )}
        {tab === 'shop' && (
          <TownShopPanel
            items={catalog}
            ownedIds={ownedIds}
            balance={balance}
            level={level}
            purchasingId={pendingPurchaseId}
            onPurchase={handlePurchase}
            onGuide={showGuide}
          />
        )}
        {tab === 'inventory' && (
          <TownInventory
            items={catalog}
            ownedIds={ownedIds}
            placements={placements}
            onPlaceStart={handlePlaceStart}
            onMoveStart={handleMoveStart}
            onGoShop={() => setTab('shop')}
          />
        )}

        {brandPhrase && (
          <p className="text-center text-xs text-gray-400">{brandPhrase}</p>
        )}
      </div>
    </div>
  )
}
