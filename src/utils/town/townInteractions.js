// src/utils/town/townInteractions.js — Paul Town V2 배치 아이템 상호작용
// 레지스트리(순수 도메인, 2026-09-21, 벤치 앉기 파일럿).
//
// 배치된 아이템을 탭했을 때(idle 모드) 벌어지는 짧은 연출을 "어떤 아이템이
// 무슨 종류의 연출을 지원하는가"만 선언하는 단일 표 — TownScene.jsx가
// TownObjectLayer.jsx의 탭 콜백을 받을 때마다 이 표를 조회해 상호작용
// 여부/종류를 판정한다(itemId 하드코딩을 이 파일 하나로 모은다). 미래에
// cat/cafe/book-shop/stone-fountain/english-school 등이 각자의 연출을
// 얻더라도 이 파일에 항목만 추가하면 된다 — 새 플러그인 시스템/이벤트
// 버스는 만들지 않는다(오늘 필요한 만큼만, 벤치 하나).
//
// import 0(React/DOM 없음) — townCatalog.js와 같은 성격의 순수 데이터
// 파일이다.
export const ITEM_INTERACTIONS = Object.freeze({
  bench: Object.freeze({ type: 'sit' }),
})

/**
 * itemId가 등록된 상호작용을 갖는지 조회 — 없거나 문자열이 아니면 null
 * (크래시 없음).
 * @param {string} itemId
 * @returns {{type:string}|null}
 */
export function interactionFor(itemId) {
  if (typeof itemId !== 'string') return null
  return ITEM_INTERACTIONS[itemId] || null
}
