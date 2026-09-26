// src/components/town/proto2_5d/ProtoShopScreen.jsx — Paul Town 2.5D 캐릭터
// 프로토타입(Phase 2, 2026-09-26, 가게 경험 v1) 가게 내부 오버레이.
//
// 실제 구매/저장/네트워크 없음 — "Buy" 버튼은 UI 전용 안내(구매 기능
// 준비 중)만 잠깐 보여준다(shopInteraction.js SHOP_PRODUCTS가 유일한
// 데이터 소스, pricePlaceholder는 실제 경제 로직과 무관). Paul Town 기존
// 팔레트(TownShopPanel.jsx의 emerald/white/rounded-full/btn 관례)를 그대로
// 재사용한다(새 색상 체계 발명 없음). 상태는 이 컴포넌트 안의 순수 UI
// 타이머(안내 문구 노출 여부)뿐 — 소유권/잔액 같은 서버 상태는 이 화면이
// 아예 모른다.
//
// 리뷰 수정 1차(2026-09-26, child-experience-designer) — 안내 문구를 탭한
// 카드 아래 작은 텍스트(text-xs)에서, 가게 다이얼로그 한가운데 뜨는 하나의
// 큰 토스트로 바꿨다(카드마다 따로 뜨면 어떤 카드를 눌렀는지 시선이
// 갈라지고, 글자가 작아 아이가 읽기 어렵다는 지적). data-testid/문구는
// 그대로라 기존 유닛/E2E 셀렉터는 안 바뀐다.
import { useEffect, useRef, useState } from 'react'
import { townAsset } from '../../../assets/town'

// 구매 안내 문구가 화면에 머무는 시간(ms) — 요구사항 "약 2초" 그대로.
const PURCHASE_NOTICE_MS = 2000

export default function ProtoShopScreen({ products, onBack, closing }) {
  const [noticeVisible, setNoticeVisible] = useState(false)
  const noticeTimerRef = useRef(null)

  // 언마운트 시 예약된 안내 타이머 정리(setState-after-unmount 방지 —
  // Proto25DScreen.jsx의 기존 타이머 정리 관례와 동일).
  useEffect(() => () => {
    if (noticeTimerRef.current != null) clearTimeout(noticeTimerRef.current)
  }, [])

  // 어떤 상품의 Buy를 눌러도 같은 토스트 하나만 보여준다(요구사항 — "재탭
  // 하면 타이머를 리셋"). 이미 떠 있는 상태에서 다시 누르면 기존 타이머를
  // 지우고 새로 2초를 다시 잰다.
  function handleBuy() {
    if (noticeTimerRef.current != null) clearTimeout(noticeTimerRef.current)
    setNoticeVisible(true)
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null
      setNoticeVisible(false)
    }, PURCHASE_NOTICE_MS)
  }

  return (
    <div
      data-testid="proto25d-shop"
      role="dialog"
      aria-label="가게"
      className="absolute inset-0 z-[9000] bg-[#dff3ea] flex flex-col"
    >
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        <h2 className="text-center text-lg font-black text-emerald-700">🏪 Paul's Shop</h2>
        {products.map((item) => {
          const url = townAsset(item.assetKey)
          return (
            <div
              key={item.id}
              data-testid="proto25d-shop-product"
              data-product-id={item.id}
              className="bg-white/90 rounded-2xl shadow p-3 flex flex-col gap-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center rounded-xl bg-emerald-50 overflow-hidden">
                  {url ? (
                    <img src={url} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span aria-hidden="true" data-placeholder="true" className="text-2xl">🎁</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="text-sm font-black text-gray-800 overflow-hidden text-ellipsis whitespace-nowrap">{item.nameEn}</p>
                  <p className="text-xs text-gray-500">{item.descEn}</p>
                  <p className="text-xs font-bold text-emerald-600">{item.pricePlaceholder}</p>
                </div>
              </div>
              <button
                type="button"
                data-testid="proto25d-shop-buy"
                data-product-id={item.id}
                onClick={handleBuy}
                className="min-h-[44px] w-full rounded-xl bg-purple-500 text-white text-sm font-black shadow btn-press"
              >
                Buy
              </button>
            </div>
          )
        })}
      </div>

      {/* 리뷰 수정 1차 — 카드별 작은 문구 대신 다이얼로그 한가운데 뜨는
          단일 토스트. role="status"+aria-live="polite" — 스크린리더가
          문구 등장을 조용히 알림(포커스 강탈 없음). pointer-events-none —
          토스트 자체를 눌러도 아무 동작이 없어야 하고, 뒤의 카드/뒤로가기
          버튼 탭도 막지 않는다. */}
      {noticeVisible && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-6">
          <p
            data-testid="proto25d-shop-notice"
            role="status"
            aria-live="polite"
            className="pointer-events-none rounded-2xl bg-orange-50 border-2 border-orange-300 text-orange-600 text-base font-black px-5 py-3 shadow-lg text-center"
          >
            구매 기능 준비 중
          </p>
        </div>
      )}

      {/* 리뷰 수정 1차 — history.back() popstate가 도착할 때까지(비동기
          창) 뒤로가기 버튼을 disabled+aria-busy로 보여준다(연타 방지의
          실제 정합성은 Proto25DScreen.jsx의 shopBusyRef 가드가 담당하고,
          이 disabled는 그 위에 얹는 시각적 확인일 뿐 — 버튼이 아직
          렌더되기 전의 아주 짧은 창에서는 ref 가드가 유일한 방어선). */}
      <button
        type="button"
        data-testid="proto25d-shop-back"
        onClick={onBack}
        disabled={closing}
        aria-busy={closing ? 'true' : 'false'}
        className="min-h-[52px] w-full bg-emerald-500 text-white text-base font-black shadow-inner disabled:opacity-60 disabled:cursor-not-allowed"
      >
        🏘️ 마을로 돌아가기
      </button>
    </div>
  )
}
