// src/utils/town/proto2_5d/coinDisplay.js — Paul Town 2.5D 캐릭터 프로토타입
// (paulTown2_5d, 기본 false) 경제 단계 A(2026-09-26, 코인 잔액 표시 v1)
// 순수 표시 헬퍼.
//
// 읽기 전용 — 이 파일은 지갑 값을 어디서도 fetch/구매/보상하지 않는다.
// 이미 계산된 wallet 객체(App.jsx가 useTownShop.state에서 파생한 것)를
// 받아 "화면에 어떻게 보일지"만 결정하는 순수 함수 2개다(React/DOM/
// 네트워크 없음). App.jsx가 이미 Dashboard의 wallet prop과 정확히 같은
// 게이트(townShopEnabled && townShop.state)로 만든 { dollarsAvailable }
// 만 넘겨준다는 전제 — 새 fetch/구독을 만들지 않는다(진실 원천 1개,
// Dashboard와 동일한 소스 재사용).
//
// 통화 표시는 src/utils/townShop.js의 formatDollars를 그대로 재사용한다
// (그 파일은 자신도 어떤 것도 import하지 않는 순수 함수 모듈 — 값 복제
// 없이 단일 진실 원천 유지, CLAUDE.md 규칙 3의 "이미 검증된 로직 재구현
// 금지" 정신과 동일).
import { formatDollars } from '../../townShop'

/**
 * wallet.dollarsAvailable을 화면에 표시할 문자열로 변환한다.
 *
 * wallet이 null/undefined/객체가 아니거나, dollarsAvailable이 유한하지
 * 않은 수(NaN/Infinity/문자열/undefined 등)이거나 음수면 표시하지 않는다
 * (null 반환) — 호출부(Proto25DScreen.jsx)는 null이면 배지 자체를 렌더하지
 * 않는다. 0은 유효한 잔액이므로 null이 아니라 "0"류 텍스트를 반환한다.
 *
 * @param {{ dollarsAvailable?: number } | null | undefined} wallet
 * @returns {string | null}
 */
export function coinBadgeText(wallet) {
  if (!wallet || typeof wallet !== 'object') return null
  const n = wallet.dollarsAvailable
  if (!Number.isFinite(n) || n < 0) return null
  return formatDollars(n)
}

/**
 * 코인 배지의 aria-label. coinBadgeText가 null이면(표시 안 함) 이 함수도
 * null을 반환한다 — 배지가 렌더되지 않는데 label만 남는 상황을 만들지
 * 않는다.
 *
 * @param {{ dollarsAvailable?: number } | null | undefined} wallet
 * @returns {string | null}
 */
export function coinBadgeAriaLabel(wallet) {
  const text = coinBadgeText(wallet)
  if (text === null) return null
  const n = Math.max(0, Math.round(Number(wallet.dollarsAvailable) || 0))
  return `코인 ${n}개`
}
