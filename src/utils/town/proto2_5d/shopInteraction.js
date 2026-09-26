// src/utils/town/proto2_5d/shopInteraction.js — Paul Town 2.5D 캐릭터
// 프로토타입(Phase 2, 2026-09-26, 가게 경험 v1) 가게 입장/상품 순수 기하 +
// 데이터 헬퍼.
//
// 순수 함수/데이터만 — React/DOM 의존 없음, Math.random/Date.now 없음
// (walkGrid.js/sceneFixture.js/benchInteraction.js와 동일 관례). townAsset()
// (src/assets/town/index.js)은 일부러 여기서 import하지 않는다 —
// sceneFixture.js 헤더 주석과 동일 이유(이 파일이 walkGrid.js를 esbuild로
// 번들하는 기존 scripts/testProto25d*.mjs의 import 그래프에 섞여 들어가면
// .webp 정적 asset 때문에 그 번들들이 매번 '.webp':'dataurl' 로더를 추가로
// 요구하게 된다 — 회귀 위험). assetKey는 문자열 데이터로만 들고, 실제 URL
// 해석은 호출부(ProtoShopScreen.jsx, 이미 townAsset을 import 중)와 테스트
// (scripts/testProto25dShop.mjs, 자체적으로 assets/town/index.js를 별도
// 번들)가 각자 한다.
//
// 이 프로토타입엔 상호작용 가능한 건물이 데모 건물(sceneFixture.js
// 'demo-building', assetKey buildings/my-house) 하나뿐이다 — 그 건물을
// "가게"로 재해석해 입장 지점/반경/상품 3종만 이 파일이 신규로 소유한다.
// walkGrid.js/sceneFixture.js/pathfinding.js는 전혀 손대지 않는다(팀장
// 지시 — 씬 지오메트리 재정의 아님, CLAUDE.md 규칙 3).
import { OBSTACLES, CELL_W_PCT, CELL_H_PCT, nearestWalkablePoint } from './walkGrid'

// 가게로 쓰는 씬 오브젝트 id — sceneFixture.js/walkGrid.js의 기존 데모
// 건물(집 한 채)을 그대로 재사용한다(새 씬 오브젝트 추가 없음).
export const SHOP_ID = 'demo-building'

// 가게 콜리전 박스 — walkGrid.js OBSTACLES(sceneFixture.js SCENE_FIXTURE에서
// 파생, 단일 진실 원천)에서 그대로 찾아 쓴다(값 복제 없음 — Proto25DScreen.jsx
// 의 기존 `const BENCH = OBSTACLES.find(...)` 상수와 동일 관례).
export const SHOP_COLLISION_RECT = OBSTACLES.find((ob) => ob.id === SHOP_ID)

// 입장 지점(raw, 아직 nearestWalkablePoint 보정 전) — 가게 콜리전 박스
// 하단-중앙(x 중심, y1) 바로 아래(앞)로 이 gap만큼 띄운다.
// benchInteraction.js BENCH_ARRIVAL_GAP_PCT(2)와 동일 값/동일 이유 — 격자
// 셀 높이(walkGrid.js CELL_H_PCT≈1.2632)보다 커서 항상 건물 박스 바깥
// 걸을 수 있는 칸에 떨어진다(유닛 테스트가 실제 OBSTACLES로 재확인).
const SHOP_ENTRANCE_GAP_PCT = 2
export const SHOP_ENTRANCE_RAW = Object.freeze({
  x: (SHOP_COLLISION_RECT.x0 + SHOP_COLLISION_RECT.x1) / 2,
  y: SHOP_COLLISION_RECT.y1 + SHOP_ENTRANCE_GAP_PCT,
})

// 입장 지점(보정 후, 단일 진실 원천) — 모듈 로드 시 한 번만 계산한다(순수
// 정적 입력에서 파생되는 결정론적 값이라 매 호출 재계산이 필요 없음 —
// walkGrid.js가 OBSTACLES를 모듈 스코프 상수로 미리 계산해 두는 것과
// 동일 관례).
export const SHOP_ENTRANCE = Object.freeze(nearestWalkablePoint(SHOP_ENTRANCE_RAW.x, SHOP_ENTRANCE_RAW.y))

/**
 * 가게 입장 지점(보정 후) — 함수 형태로도 노출한다(호출부 가독성, 팀장
 * 지시 원문의 `getShopEntrance()` 이름 그대로).
 * @returns {{x:number,y:number}}
 */
export function getShopEntrance() {
  return SHOP_ENTRANCE
}

// "가게 들어가기" 버튼을 보여줄 반경(world-%, 타원) — 가로/세로 각각 격자
// 셀 2칸 폭(walkGrid.js CELL_W_PCT/CELL_H_PCT를 그대로 가져다 쓴다 — 리터럴
// 복제가 아니라 그 상수 자체를 참조해, 격자 해상도가 바뀌어도 이 반경이
// 자동으로 같은 "셀 2칸" 의미를 유지한다). 손가락으로 도착 지점 근처에
// 서면 자연스럽게 들어가는 느낌을 주는 절충값(재도출 없음, 팀장 지시 값).
export const SHOP_RADIUS = Object.freeze({ x: 2 * CELL_W_PCT, y: 2 * CELL_H_PCT })

/**
 * 캐릭터가 가게 입장 지점 타원 반경 안에 있는지 — (dx/rx)²+(dy/ry)²<=1
 * (경계 포함). 비정상 입력(NaN 등)은 크래시 대신 false(안 보임)로 안전
 * 폴백한다.
 * @param {number} charX
 * @param {number} charY
 * @returns {boolean}
 */
export function isNearShopEntrance(charX, charY) {
  if (!Number.isFinite(charX) || !Number.isFinite(charY)) return false
  const dx = charX - SHOP_ENTRANCE.x
  const dy = charY - SHOP_ENTRANCE.y
  return (dx / SHOP_RADIUS.x) ** 2 + (dy / SHOP_RADIUS.y) ** 2 <= 1
}

// 상품 3종(임시 — 실 구매/저장/네트워크 없음, 화면 표시 전용). assetKey는
// src/assets/town/index.js TOWN_ASSETS에 실제로 등록된 키만 쓴다(townAsset()
// 이 null을 반환하지 않도록 이 파일 작성 시 그 레지스트리를 직접 읽어
// 확인했다 — decorations/bench·nature/flower-garden·decorations/street-lamp
// 전부 기존 23개 키 안에 있음). flower-pot은 아직 전용 아트가 없어 기존
// 'nature/flower-garden'(화단) 자산을 자리표시자로 재사용한다 — 실제
// 자산이 없어서가 아니라(있음) "이름(꽃 화분)과 그림(화단)이 정확히
// 일치하지 않는 임시 대역"이라는 뜻으로 placeholder:true를 표시한다.
export const SHOP_PRODUCTS = Object.freeze([
  Object.freeze({
    id: 'bench',
    nameEn: 'Bench',
    descEn: 'A cozy bench to rest on.',
    pricePlaceholder: '$5',
    assetKey: 'decorations/bench',
    placeholder: false,
  }),
  Object.freeze({
    id: 'flower-pot',
    nameEn: 'Flower Pot',
    descEn: 'Pretty flowers for your town.',
    pricePlaceholder: '$8',
    assetKey: 'nature/flower-garden',
    placeholder: true,
  }),
  Object.freeze({
    id: 'street-lamp',
    nameEn: 'Street Lamp',
    descEn: 'A bright lamp for the street.',
    pricePlaceholder: '$6',
    assetKey: 'decorations/street-lamp',
    placeholder: false,
  }),
])
