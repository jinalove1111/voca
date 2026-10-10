// src/utils/town/townItemVisualMeta.js — Paul Town V2 배치(placed) 카탈로그
// 아이템 2.5D 프레젠테이션 튜닝 메타(순수 데이터, 2026-09-20, bench-first
// depth/shadow 파일럿).
//
// 왜 townCatalog.js(TOWN_ITEM_META) 안에 넣지 않고 별도 sibling 파일인가 —
// townCatalog.js는 scripts/testTownV2Static.mjs 섹션 4(V1_UNCHANGED_FILES)가
// "V2 작업이 V1을 건드리지 않는다"(CLAUDE.md 규칙 3/16과 같은 정신 — V2가
// 이미 검증된 V1 공유 파일을 재작업으로 건드리지 않는다)는 계약으로
// origin/main과 byte-identical을 강제하는 6개 파일 중 하나다 — 그 계약을
// 건드리지 않으면서도(파일당 소유권 원칙, 다른 세션이 그 불변식에 기대고
// 있을 수 있다) 재사용 가능한 한 곳에 메타를 두기 위해, 같은 폴더(town
// 도메인 유틸 전부가 모이는 곳)의 새 파일로 분리했다 — "흩어진 새 파일"이
// 아니라 이 폴더 자체가 이미 TOWN_ITEM_META의 자리(townCatalog.js)이므로
// 최대한 가까운 co-location이다.
//
// id -> 아래 4개 필드 전부 OPTIONAL(값 자체 생략 가능, 항목 자체도 생략
// 가능) — 없으면 worldRender.js placedItemVisual()의 기본값(visualScale=1,
// groundOffset=0, shadowWidthPct=0.75, shadowOpacity=0.3)을 그대로 쓴다.
// 이 세션은 실측(bench.webp 72x48px, 바닥 패딩 ~0% — 아트 자체의 바닥
// 가장자리가 이미 지면 접점)으로 bench에 groundOffset 오버라이드가 필요
// 없음을 확인했고, tree/cat도 기본값 육안 검증으로 충분해(2026-09-20 이
// 세션의 bench/tree/cat 3종 시각 비교) 이 표는 아직 비어 있다 — 향후
// 특정 아이템의 아트가 바닥 패딩이 있거나(groundOffset), 그림자가
// 시각적으로 너무 크거나 작으면(shadowWidthPct/shadowOpacity) 여기 한
// 줄만 추가하면 된다(재구현 없음, 순수 데이터 확장 — worldRender.js의
// 계산 로직은 바뀌지 않는다). 가격/재고/구매 로직과 무관한 순수 표시
// 튜닝이라 town_items DB와도 무관(그래서 townShop.js/mergeCatalog가 이
// 값을 서버 응답과 병합할 필요도 없다).
//
// import 0(React/DOM/fetch/localStorage/Math.random 없음, 순수·결정론) —
// worldRender.js/TownObjectLayer.jsx가 이 표를 조회해 넘겨줄 뿐, 이
// 파일 자신은 worldRender.js를 import하지 않는다(계산 로직과 데이터의
// 분리 — worldRender.placedItemVisual()이 유일한 계산 지점).
//
// @typedef {{visualScale?:number, groundOffset?:number, shadowWidthPct?:number, shadowOpacity?:number}} TownItemVisualMeta
/** @type {Object<string, TownItemVisualMeta>} */
export const TOWN_ITEM_VISUAL_META = Object.freeze({})
