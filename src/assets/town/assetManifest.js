// src/assets/town/assetManifest.js — Paul Town V2-A 아트워크 매니페스트
// (프레젠테이션 전용 메타데이터, 2026-09-13).
//
// 이 파일은 순수 데이터 + 순수 헬퍼만 담는다 — React/DOM/네트워크/DB 없음.
// `docs/design/town/V2A_ARTWORK_SPEC_FINAL.md`의 GROUP C/D/E/F(P0) +
// `buildings/my-house` + 정원 5단계(garden-stage-0..4)를 그대로 옮긴
// 캔버스/앵커/발자국/변형 "사실"만 담는다 — 가격/레벨/소유권/구매 가능
// 여부는 여기서 절대 다루지 않는다(그 권위는 항상 `town_items`
// DB/`townCatalog.js`/서버에 있다, CLAUDE.md 저장소 헌법과 동일 원칙).
//
// 이 파일은 `TownSprite.jsx`의 렌더 경로에서 전혀 쓰이지 않는다 — 렌더는
// 이미 `townAsset(assetKey)`(URL 또는 null → 이모지 폴백)만으로 완결돼
// 있고, 앞으로도 그렇게 유지돼야 한다. 이 파일이 존재하는 이유는 (a) 나중에
// `TOWN_ASSETS`(src/assets/town/index.js)가 실제 파일로 채워질 때, 채워진
// 모든 키가 실제 매니페스트 항목과 일치하는지 테스트가 검증할 수 있게
// 하기 위해서, (b) 캔버스/앵커/발자국/변형 사실을 프로즈(문서)에서 매번
// 다시 파싱하지 않고 툴링/문서가 기계로 읽을 수 있는 단일 출처로 쓰기
// 위해서다. `TownSprite.jsx`나 다른 렌더 경로에 이 파일을 import하지
// 않는다 — 프레젠테이션 로직은 지금 그대로 유지하고, 이 파일은 오직
// 테스트/문서 소비용 메타데이터다.

/**
 * @typedef {Object} TownAssetManifestEntry
 * @property {string} assetKey
 * @property {string} filename
 * @property {string} folder
 * @property {{w:number, h:number}} canvas
 * @property {{w:number, h:number}} canvas2x
 * @property {string} aspectRatio
 * @property {boolean} transparent
 * @property {'bottom-center'} anchor
 * @property {'lg'|'md'|'sm'|null} footprint
 * @property {'objects'|'patches'} zLayer
 * @property {string[]} variants
 * @property {'P0'} priority
 */

function entry(assetKey, filename, folder, canvas, canvas2x, aspectRatio, footprint, zLayer, variants) {
  return Object.freeze({
    assetKey,
    filename,
    folder,
    canvas: Object.freeze({ ...canvas }),
    canvas2x: Object.freeze({ ...canvas2x }),
    aspectRatio,
    transparent: true,
    anchor: 'bottom-center',
    footprint,
    zLayer,
    variants: Object.freeze([...variants]),
    priority: 'P0',
  })
}

// GROUP C — BUILDINGS(`buildings/`, `special/`). 6개 건물(my-house 제외)
// 중 `-lights` 변형이 있는 5개(british-cottage/book-shop/cafe/
// english-school/clock-tower) — my-house는 스펙상 `-lights`가
// "선택(옵션)/1차 납품 필수 아님"으로 명시돼 제외, bridge는 "조명
// 오버레이 없음(창문 없음)"으로 명시돼 제외.
const BUILDINGS = [
  entry('buildings/my-house', 'my-house.webp', 'buildings', { w: 128, h: 160 }, { w: 256, h: 320 }, '4:5', 'lg', 'objects', []),
  entry('buildings/british-cottage', 'british-cottage.webp', 'buildings', { w: 128, h: 160 }, { w: 256, h: 320 }, '4:5', 'lg', 'objects', ['british-cottage-lights']),
  entry('buildings/book-shop', 'book-shop.webp', 'buildings', { w: 128, h: 160 }, { w: 256, h: 320 }, '4:5', 'lg', 'objects', ['book-shop-lights']),
  entry('buildings/cafe', 'cafe.webp', 'buildings', { w: 128, h: 160 }, { w: 256, h: 320 }, '4:5', 'lg', 'objects', ['cafe-lights']),
  entry('special/english-school', 'english-school.webp', 'special', { w: 128, h: 154 }, { w: 256, h: 308 }, '5:6', 'lg', 'objects', ['english-school-lights']),
  entry('special/clock-tower', 'clock-tower.webp', 'special', { w: 128, h: 256 }, { w: 256, h: 512 }, '1:2', 'lg', 'objects', ['clock-tower-lights']),
  entry('special/bridge', 'bridge.webp', 'special', { w: 160, h: 80 }, { w: 320, h: 160 }, '2:1', 'lg', 'objects', []),
]

// GROUP D — NATURE(`nature/`, `stone-fountain`은 카탈로그 규칙상
// `decorations/`) + 정원 5단계(ambient, 카탈로그 외).
const NATURE = [
  entry('nature/tree', 'tree.webp', 'nature', { w: 96, h: 128 }, { w: 192, h: 256 }, '3:4', 'md', 'objects', []),
  entry('nature/flower-garden', 'flower-garden.webp', 'nature', { w: 96, h: 64 }, { w: 192, h: 128 }, '3:2', 'md', 'objects', []),
  entry('decorations/stone-fountain', 'stone-fountain.webp', 'decorations', { w: 72, h: 72 }, { w: 144, h: 144 }, '1:1', 'sm', 'objects', []),
  entry('nature/garden-stage-0', 'garden-stage-0.webp', 'nature', { w: 64, h: 64 }, { w: 128, h: 128 }, '1:1', null, 'patches', []),
  entry('nature/garden-stage-1', 'garden-stage-1.webp', 'nature', { w: 64, h: 64 }, { w: 128, h: 128 }, '1:1', null, 'patches', []),
  entry('nature/garden-stage-2', 'garden-stage-2.webp', 'nature', { w: 64, h: 64 }, { w: 128, h: 128 }, '1:1', null, 'patches', []),
  entry('nature/garden-stage-3', 'garden-stage-3.webp', 'nature', { w: 64, h: 64 }, { w: 128, h: 128 }, '1:1', null, 'patches', []),
  entry('nature/garden-stage-4', 'garden-stage-4.webp', 'nature', { w: 64, h: 64 }, { w: 128, h: 128 }, '1:1', null, 'patches', []),
]

// GROUP E — DECORATIONS(`decorations/`). street-lamp의 `-on` 점등 변형은
// P1(1차 납품 필수 아님)이라 여기 variants에 포함하지 않는다 — 이 표는
// 오직 "P0 항목이 갖는 변형"만 기록하고, 향후 P1 변형이 실제로 납품되면
// 그때 이 파일에 append한다(신규 세션이 append로 확장).
const DECORATIONS = [
  entry('decorations/bench', 'bench.webp', 'decorations', { w: 72, h: 48 }, { w: 144, h: 96 }, '3:2', 'sm', 'objects', []),
  entry('decorations/town-sign', 'town-sign.webp', 'decorations', { w: 72, h: 108 }, { w: 144, h: 216 }, '2:3', 'sm', 'objects', []),
  entry('decorations/shop-lamp', 'shop-lamp.webp', 'decorations', { w: 72, h: 144 }, { w: 144, h: 288 }, '1:2', 'sm', 'objects', []),
  entry('decorations/street-lamp', 'street-lamp.webp', 'decorations', { w: 72, h: 144 }, { w: 144, h: 288 }, '1:2.5', 'sm', 'objects', []),
  entry('decorations/red-post-box', 'red-post-box.webp', 'decorations', { w: 72, h: 108 }, { w: 144, h: 216 }, '2:3', 'sm', 'objects', []),
]

// GROUP F — ANIMALS(`animals/`). `-blink` 변형은 P2(범위 밖)라 제외.
const ANIMALS = [
  entry('animals/cat', 'cat.webp', 'animals', { w: 72, h: 54 }, { w: 144, h: 108 }, '4:3', 'sm', 'objects', []),
  entry('animals/puppy', 'puppy.webp', 'animals', { w: 72, h: 54 }, { w: 144, h: 108 }, '4:3', 'sm', 'objects', []),
  entry('animals/owl', 'owl.webp', 'animals', { w: 72, h: 96 }, { w: 144, h: 192 }, '3:4', 'sm', 'objects', []),
]

/** @type {Readonly<Object<string, TownAssetManifestEntry>>} */
export const TOWN_ASSET_MANIFEST = Object.freeze(
  [...BUILDINGS, ...NATURE, ...DECORATIONS, ...ANIMALS].reduce((acc, item) => {
    acc[item.assetKey] = item
    return acc
  }, {}),
)

/**
 * @param {string} assetKey
 * @returns {TownAssetManifestEntry|null}
 */
export function getManifestEntry(assetKey) {
  if (typeof assetKey !== 'string' || assetKey.length === 0) return null
  return TOWN_ASSET_MANIFEST[assetKey] || null
}

/** @returns {string[]} */
export function manifestAssetKeys() {
  return Object.keys(TOWN_ASSET_MANIFEST)
}

/**
 * @param {string} assetKey
 * @returns {boolean}
 */
export function isKnownAssetKey(assetKey) {
  return getManifestEntry(assetKey) !== null
}
