// src/utils/town/depthOrder.js — Paul Town V2 월드 깊이(depth) 모델
// (순수 도메인, 2026-09-17).
//
// 배경: 기존 v2 렌더러(townScene.js)의 Z_LAYERS/zIndexFor()는 "구역(district)
// 스택 순서 + 행(row)"만 알던 옛 8x6 좌표계용 z-index 산정 로직이다.
// V2_WORLD_IMPLEMENTATION_PLANNING_2026-09-17.md §1이 설계한 새 월드는
// 자유 배치 앵커(y% 0~100)를 쓰는 12개 개념 레이어(뒤→앞: sky/hills/
// distantLocked/terrain/water/path/architecture/scenery/objects/
// foregroundVegetation/paul/ui)를 요구하므로, 이 파일은 townScene.js의
// Z_LAYERS/zIndexFor()를 바꾸거나 재구현하지 않고(규칙 3 — 이미 동작하는
// 로직을 "새로" 다시 짜지 않는다) 완전히 별도의 새 depth 계산 모델을
// 추가만 한다. 두 시스템은 당분간 공존한다 — 이 파일은 townScene.js에서
// Z_LAYERS만 읽어(호환 문서화용) import하고, 그 외 어떤 파일도 import하지
// 않는다. React/DOM/Date.now/Math.random 없음, 순수 함수만.
//
// LAYER_BASE ↔ 기존 Z_LAYERS 매핑(문서화 목적 — 아래 비교표는 "이 새
// 시스템이 기존 CSS 스택 순서와 모순되지 않는다"는 걸 사람이 검증하기
// 위한 것이지, 두 스케일이 수치적으로 호환된다는 뜻은 아니다. 두 시스템은
// 서로 다른 렌더 트리에 쓰이므로 실제로 같은 DOM에서 섞이지 않는다):
//   sky/hills/distantLocked/terrain/water  ~  Z_LAYERS.ground(0)/patches(2) 계열(배경)
//   path                                    ~  Z_LAYERS.path(1)
//   architecture/scenery/objects            ~  Z_LAYERS.objects(10) 계열(배치 오브젝트)
//   foregroundVegetation                    ~  Z_LAYERS.objects(10)보다 항상 앞
//   paul                                    ~  오브젝트보다 항상 앞(플레이어 토큰)
//   ui                                      ~  Z_LAYERS.overlay(90)/popover(100) 계열(최상단 UI)
//
// LAYER_BASE 설계 노트 — "±1000 간격"이 지켜지는 곳과 의도적으로 안 지켜지는
// 곳: 배경 티어(sky~path, 서로 y와 무관)와 최상단 티어(paul/ui, 역시 y와
// 무관)는 서로 정확히 1000씩 떨어져 있고, "콘텐츠 티어"(architecture/
// scenery/objects/foregroundVegetation, Y_RANKED_LAYERS)와의 경계도 1000
// 이상 떨어져 있다 — 이 경계들은 y값이 무엇이든 절대 넘나들 수 없다(아래
// 계산 참고). 반면 콘텐츠 티어 "내부" 4개 레이어는 서로 딱 1 단위씩만
// 떨어져 있다 — 의도적이다. 건물(architecture)과 그 뒤/앞의 나무
// (scenery/objects), 걸어다니는 동물(objects)과 건물 밑변(baseline) y가
// 서로를 자연스럽게 가리고 가려지려면(같은 지면 위 오브젝트의 "Y-sort"
// 겹침 판정 — top-down/isometric 게임의 표준 기법), 이 4개 레이어는
// 사실상 하나의 공유 y-정렬 밴드로 동작해야 한다. y 기여분(0~900, *9)이
// 이 1 단위 레이어 간격을 항상 압도하므로 "그 콘텐츠 밴드 안에서는 y가
// 우선, 레이어는 동일 y일 때만 미세한 타이브레이크"가 된다 —
// scripts/testTownDepthOrder.mjs의 나무/집, 동물/건물 시나리오가 이
// 요구사항 자체에서 직접 도출된 것이다(예: 동물objects y=50은 건물
// architecture y=53보다는 뒤여야 하지만 건물 y=24보다는 앞이어야 함 — 이건
// 레이어가 절대적으로 이기는 모델로는 수학적으로 만족 불가능하고, y가
// 우선하는 모델에서만 성립한다). 콘텐츠 티어 4개 사이에는 베이스가 1·2·3
// 차이만 나므로 9의 배수인 y 기여분 차이와 절대 우연히도 같아질 수 없어
// (예: 6000+9k = 6001+9j → 9(k−j)=1은 정수해 없음) 서로 다른 레이어의
// depthKey가 완전히 동률이 되는 경우도 없다(콜리전 없음, 테스트로 확인).
//
// 2026-09-22 addendum(Stage 3, Paul Town 2.5D 캐릭터 프로토타입) — 콘텐츠
// 티어에 'character' 레이어 1개를 추가했다(위 문단의 "4개"는 이 추가
// 이전 시점의 원본 설계 기록이라 그대로 남겨두고, 이 addendum이 최신
// 사실을 덧붙인다 — append, 재작성 아님). ASTRA_HANDOFF_2026-09-21.md
// §17이 명시적으로 추천한 설계("Astra는 새 'character' 레이어를 이
// Y_RANKED_LAYERS 세트에 추가하면 된다") 그대로 — architecture/scenery/
// objects/foregroundVegetation 4개는 값을 전혀 바꾸지 않았고(순수
// additive), 'character'만 그 다음(foregroundVegetation 6003 다음, paul
// 8000 이전)인 정수 6004로 추가했다. 콜리전 없음 증명은 일반형으로도
// 그대로 성립한다: 서로 다른 두 콘텐츠 티어 레이어의 base 차이(이제
// 1~4)는 여전히 9의 배수가 될 수 없다(0이 아닌 9 미만 정수). paul(8000)/
// ui(9000)와의 1000 이상 경계 여유도 깨지지 않는다 — character의
// y-랭킹 최댓값(6004+900=6904)은 sceneZ.js CHARACTER_Z(=LAYER_BASE.paul
// -500=7500, 기존 V2 캐릭터 상호작용 오버레이가 이미 의존 중인 경계)보다
// 작고, 그 CHARACTER_Z도 paul(8000)보다 작다.

import { Z_LAYERS } from './townScene'

/** 기존 townScene.js Z_LAYERS와의 매핑을 코드로도 확인 가능하게 남겨둔
 * 문서화 상수(런타임 로직에서는 쓰지 않음 — 위 주석 표와 1:1). */
export const LEGACY_Z_LAYERS_REFERENCE = Object.freeze({ ...Z_LAYERS })

// 뒤(back) → 앞(front) 순서의 13개 개념 레이어(2026-09-22 Stage 3 —
// 'character' 1개 추가, 아래 LAYER_BASE 헤더 주석의 addendum 참고).
export const DEPTH_LAYERS = Object.freeze([
  'sky',
  'hills',
  'distantLocked',
  'terrain',
  'water',
  'path',
  'architecture',
  'scenery',
  'objects',
  'foregroundVegetation',
  'character',
  'paul',
  'ui',
])

// 레이어별 기준 z 정수. DEPTH_LAYERS 순서대로 엄격히 증가한다(strictly
// increasing). 배경 티어(sky~path)·최상단 티어(paul/ui)·그리고 그 둘과
// 콘텐츠 티어 사이 경계는 전부 1000 이상 떨어져 있어(y 기여분 최대 900보다
// 항상 크므로) 그 경계를 y-랭킹이 절대 넘어가지 못한다. 콘텐츠 티어
// 내부(architecture/scenery/objects/foregroundVegetation/character —
// character는 2026-09-22 Stage 3 추가, 기존 4개 값은 변경 없음)만 1 단위
// 간격이다 — 위 설계 노트 참고(의도적, y가 그 안에서 우선하도록).
export const LAYER_BASE = Object.freeze({
  sky: 0,
  hills: 1000,
  distantLocked: 2000,
  terrain: 3000,
  water: 4000,
  path: 5000,
  architecture: 6000,
  scenery: 6001,
  objects: 6002,
  foregroundVegetation: 6003,
  character: 6004, // 2026-09-22 Stage 3 추가 — Paul Town 2.5D 캐릭터 프로토타입(격리 실험) 캐릭터 전용. 순수 additive, 나머지 11개 기존 값 무변경.
  paul: 8000,
  ui: 9000,
})

// 이 레이어들만 "앵커의 y(0=화면 위/멀리, 100=화면 아래/가까이)가 클수록
// 앞에 그려진다"는 랭킹 보정을 받는다. 나머지 레이어(sky/hills/
// distantLocked/terrain/water/path/paul/ui)는 레이어 자체가 이미 전역
// 순서를 결정하므로 y를 depth 계산에 쓰지 않는다(paul/ui는 항상 최상위
// 그룹, 배경 레이어들은 항상 최하위 그룹). character(2026-09-22 Stage 3
// 추가)도 콘텐츠 티어 소속이라 Y-랭킹을 받는다 — 데모 장애물(objects
// 레이어로 랭킹)과 y 기준으로 서로 가리고 가려지려면 필수.
export const Y_RANKED_LAYERS = new Set(['architecture', 'scenery', 'objects', 'foregroundVegetation', 'character'])

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

/**
 * entity = { id, layer, y, tieBreak? } → 정렬용 정수 depth key.
 * - layer가 LAYER_BASE에 없으면 즉시 Error.
 * - layer가 Y_RANKED_LAYERS에 속하면 y는 반드시 유한수여야 함(아니면
 *   Error) — [0,100]으로 clamp 후 *9(0~900)로 보정해 레이어 기준값에 더함.
 * - Y_RANKED_LAYERS에 속하지 않는 레이어는 y를 무시한다(안 줘도 안전).
 */
export function depthKey(entity) {
  if (!entity || typeof entity !== 'object') {
    throw new Error(`depthOrder.depthKey: entity must be an object, got ${String(entity)}`)
  }
  const { layer, y } = entity
  if (!Object.prototype.hasOwnProperty.call(LAYER_BASE, layer)) {
    throw new Error(`depthOrder.depthKey: unknown layer "${String(layer)}" (id=${entity.id})`)
  }
  const base = LAYER_BASE[layer]
  if (!Y_RANKED_LAYERS.has(layer)) return base
  const n = Number(y)
  if (!Number.isFinite(n)) {
    throw new Error(`depthOrder.depthKey: layer "${layer}" requires a finite y in [0,100], got ${String(y)} (id=${entity.id})`)
  }
  const clamped = clamp(n, 0, 100)
  return base + Math.round(clamped * 9)
}

/**
 * 두 entity의 상대 순서(음수: a가 뒤, 양수: a가 앞, 0: 완전 동일 depth+tie).
 * depthKey가 같으면 tieBreak(없으면 id)의 문자열 비교로 항상 총순서
 * (total order)를 만든다 — 그래서 같은 입력을 여러 번 정렬해도 결과가
 * 항상 동일하다(결정론).
 */
export function compareDepth(a, b) {
  const diff = depthKey(a) - depthKey(b)
  if (diff !== 0) return diff
  const ta = String((a && a.tieBreak) ?? (a && a.id))
  const tb = String((b && b.tieBreak) ?? (b && b.id))
  if (ta < tb) return -1
  if (ta > tb) return 1
  return 0
}

/** entities를 depth 오름차순(뒤→앞)으로 정렬한 새 배열. 입력은 mutate하지 않는다. */
export function sortByDepth(entities) {
  const list = Array.isArray(entities) ? entities : []
  return [...list].sort(compareDepth)
}

// CSS z-index로 안전하게 쓸 수 있는 상한(브라우저/사양상 2^31-1보다 훨씬
// 작게 잡아 여유를 둔 값). 이 시스템의 실제 depthKey 최댓값은 9000
// (LAYER_BASE.ui, y-랭킹 없음)이라 클램프는 사실상 발동하지 않지만,
// LAYER_BASE가 나중에 늘어나도 항상 안전한 CSS 값이 나오도록 명시적으로
// clamp한다.
export const CSS_Z_INDEX_MAX = 2_000_000

/** depthKey(entity)를 안전한 CSS z-index 정수로 클램프해 반환. */
export function cssZIndex(entity) {
  return clamp(depthKey(entity), 0, CSS_Z_INDEX_MAX)
}

/** front가 back보다 앞(=위에 그려짐, 즉 back을 가림)이면 true. */
export function occludes(front, back) {
  return compareDepth(front, back) > 0
}
