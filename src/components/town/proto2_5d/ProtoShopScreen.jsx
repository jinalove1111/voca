// src/components/town/proto2_5d/ProtoShopScreen.jsx — Paul Town 2.5D 캐릭터
// 프로토타입(Phase 2, 2026-09-26, 가게 경험 v1 / 2026-09-27, 경제 단계 B)
// 가게 내부 오버레이.
//
// 경제 단계 B(2026-09-27) — 화면 상태만 차감, 서버/DB 쓰기 없음. 구매
// 성공/실패 판정은 shopInteraction.js의 순수 함수 tryPurchase(부모
// Proto25DScreen.jsx가 balance/spent를 들고 그 함수를 호출)에 전부
// 맡긴다 — 이 컴포넌트는 그 결과(ok/insufficient)를 받아 확인 다이얼로그 →
// 토스트로 보여주는 UI만 담당. Paul Town 기존 팔레트(TownShopPanel.jsx의
// emerald/white/rounded-full/btn 관례)를 그대로 재사용한다(새 색상 체계
// 발명 없음).
//
// 리뷰 수정 1차(2026-09-26, child-experience-designer) — 안내 문구를 탭한
// 카드 아래 작은 텍스트(text-xs)에서, 가게 다이얼로그 한가운데 뜨는 하나의
// 큰 토스트로 바꿨다(카드마다 따로 뜨면 어떤 카드를 눌렀는지 시선이
// 갈라지고, 글자가 작아 아이가 읽기 어렵다는 지적). data-testid/문구는
// 그대로라 기존 유닛/E2E 셀렉터는 안 바뀐다.
import { useEffect, useRef, useState } from 'react'
import { townAsset } from '../../../assets/town'
import { formatDollars } from '../../../utils/townShop'
import { coinBadgeText, coinBadgeAriaLabel } from '../../../utils/town/proto2_5d/coinDisplay'

// 안내 토스트가 화면에 머무는 시간(ms) — 요구사항 "약 2초" 그대로.
const PURCHASE_NOTICE_MS = 2000

export default function ProtoShopScreen({ products, onBack, closing, balance, purchasedIds, onPurchase }) {
  const [noticeText, setNoticeText] = useState(null)
  const [confirmProduct, setConfirmProduct] = useState(null)
  const noticeTimerRef = useRef(null)

  // 언마운트 시 예약된 안내 타이머 정리(setState-after-unmount 방지 —
  // Proto25DScreen.jsx의 기존 타이머 정리 관례와 동일).
  useEffect(() => () => {
    if (noticeTimerRef.current != null) clearTimeout(noticeTimerRef.current)
  }, [])

  function showNotice(text) {
    if (noticeTimerRef.current != null) clearTimeout(noticeTimerRef.current)
    setNoticeText(text)
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null
      setNoticeText(null)
    }, PURCHASE_NOTICE_MS)
  }

  function handleBuy(item) {
    setConfirmProduct(item)
  }

  function handleConfirmCancel() {
    setConfirmProduct(null)
  }

  // 2026-09-27 리뷰 수정 — 연타/더블탭 방지는 별도 busy ref가 아니라 이
  // 핸들러가 동기라는 사실 자체에서 나온다: React 18은 같은 discrete
  // 이벤트(클릭) 안의 state 업데이트를 한 커밋으로 flush하므로,
  // setConfirmProduct(null)이 확인 버튼을 이 함수 리턴 즉시 언마운트하고
  // (성공 시) purchasedIds가 같은 커밋에서 Buy를 비활성화한다 — 두 번째
  // 클릭이 도착할 시점엔 이미 누를 대상이 없다(S21 항목b/c가 더블클릭/
  // 빠른 연속 터치탭으로 $32(⟵37-5)를 실측, $27(두 번 차감)이 아님을
  // 확인). ponytail: sync handler relies on unmount; if onPurchase becomes
  // async, hold a ref until it resolves(같은 패턴을 Proto25DScreen.jsx의
  // shopBusyRef가 가게 닫기 경로에서 이미 씀).
  //
  // 2026-09-27(실기기 결함 수정) — purchasedIds는 이제 부모(Proto25DScreen)
  // state이므로 여기선 setState하지 않는다. onPurchase가 이미 산 상품이면
  // { ok:false, reason:'purchased' }를 돌려주고(재차감 없음), 그 외
  // 실패는 기존과 동일하게 잔액 부족으로 취급한다.
  function handleConfirmYes() {
    if (!confirmProduct) return
    const item = confirmProduct
    const result = onPurchase(item)
    setConfirmProduct(null)
    if (result.ok) {
      showNotice('구매 완료! 마을에서 🪑 배치하기를 눌러요') // F2 — 다음 행동 안내("구매 완료" 문구 유지)
    } else if (result.reason === 'purchased') {
      showNotice('이미 구매했어요')
    } else {
      showNotice('Paul Dollar가 부족해요')
    }
  }

  const balanceWallet = { dollarsAvailable: balance }

  return (
    <div
      data-testid="proto25d-shop"
      role="dialog"
      aria-label="가게"
      className="absolute inset-0 z-[9000] bg-[#dff3ea] flex flex-col"
    >
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        <h2 className="text-center text-lg font-black text-emerald-700">🏪 Paul's Shop</h2>
        {/* 2026-09-27 리뷰 수정 — balance가 null(미확인/pre-fetch)이면 HUD
            배지와 동일한 규칙으로 이 줄 자체를 렌더하지 않는다(이전엔
            "$0"으로 표시해 "잔액이 0"과 "아직 모름"을 혼동시켰다). */}
        {balance !== null && (
          <p
            data-testid="proto25d-shop-balance"
            role="status"
            aria-label={coinBadgeAriaLabel(balanceWallet)}
            className="text-center text-sm font-black text-amber-600"
          >
            💵 {coinBadgeText(balanceWallet)}
          </p>
        )}
        {products.map((item) => {
          const url = townAsset(item.assetKey)
          const purchased = purchasedIds.has(item.id)
          // ↑ purchasedIds는 부모 prop(가게를 닫아도 유지) — 이 컴포넌트
          // 자체 state가 아니다(2026-09-27 실기기 결함 수정).
          // F1(2026-09-28) — 잔액 미확인(null)이면 Buy를 막는다(이전엔 눌리고
          // tryPurchase가 null을 잔액 부족으로 판정해 거짓 "부족해요"가 떴다).
          const balanceUnknown = balance === null
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
                  <p className="text-xs font-bold text-emerald-600">{formatDollars(item.price)}</p>
                </div>
              </div>
              <button
                type="button"
                data-testid="proto25d-shop-buy"
                data-product-id={item.id}
                onClick={() => handleBuy(item)}
                disabled={purchased || balanceUnknown}
                aria-busy={!purchased && balanceUnknown ? 'true' : undefined}
                className="min-h-[44px] w-full rounded-xl bg-purple-500 text-white text-sm font-black shadow btn-press disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {purchased ? '구매 완료' : balanceUnknown ? '잔액 확인 중' : '사기'}
              </button>
            </div>
          )
        })}
      </div>

      {/* 경제 단계 B(2026-09-27) — 구매 확인 다이얼로그. 오버레이 안쪽
          중앙에 뜨는 카드 하나(role="dialog", 뒤로가기/가게 다이얼로그와
          별도 role) — 취소는 이 패널만 닫고, 뒤로가기 버튼/Escape는 여전히
          가게 전체를 그대로 닫는다(이 패널은 언마운트로 함께 사라짐). */}
      {confirmProduct && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 px-6">
          <div
            data-testid="proto25d-shop-confirm"
            role="dialog"
            aria-label="구매 확인"
            className="w-full max-w-xs rounded-2xl bg-white shadow-lg p-4 flex flex-col gap-3"
          >
            <p className="text-sm font-black text-gray-800 text-center">
              {confirmProduct.nameEn}를 {formatDollars(confirmProduct.price)}에 살까요?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="proto25d-shop-confirm-no"
                onClick={handleConfirmCancel}
                className="min-h-[44px] flex-1 rounded-xl bg-gray-200 text-gray-700 text-sm font-black shadow btn-press"
              >
                취소
              </button>
              <button
                type="button"
                data-testid="proto25d-shop-confirm-yes"
                onClick={handleConfirmYes}
                className="min-h-[44px] flex-1 rounded-xl bg-emerald-500 text-white text-sm font-black shadow btn-press"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 리뷰 수정 1차 — 카드별 작은 문구 대신 다이얼로그 한가운데 뜨는
          단일 토스트. role="status"+aria-live="polite" — 스크린리더가
          문구 등장을 조용히 알림(포커스 강탈 없음). pointer-events-none —
          토스트 자체를 눌러도 아무 동작이 없어야 하고, 뒤의 카드/뒤로가기
          버튼 탭도 막지 않는다. */}
      {noticeText && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-6">
          <p
            data-testid="proto25d-shop-notice"
            role="status"
            aria-live="polite"
            className="pointer-events-none rounded-2xl bg-orange-50 border-2 border-orange-300 text-orange-600 text-base font-black px-5 py-3 shadow-lg text-center"
          >
            {noticeText}
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
