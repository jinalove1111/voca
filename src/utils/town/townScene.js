// src/utils/town/townScene.js — Paul Town V2-A 스토리북 씬 좌표/파생값
// (순수 도메인, 2026-09-13).
//
// import는 townLayout.js(TOWN_GRID/HOME_CELL)과 townLevel.js(TOWN_LEVELS/
// starsToNextTownLevel/townLevelForStars)만 허용한다 — React/DOM/Date.now/
// Math.random 없음. 이 파일은 기존 8x6 좌표계(townLayout.js가 진실
// 원천)를 절대 바꾸지 않고, 그 좌표를 "장면(scene)" 픽셀/퍼센트 앵커로
// 변환하는 순수 파생 함수만 제공한다. 입력을 mutate하지 않고, 손상된
// 입력(undefined/NaN/범위 밖)에도 크래시 없이 안전한 기본값을 반환한다.

import { TOWN_GRID, HOME_CELL as TOWN_LAYOUT_HOME_CELL } from './townLayout'

// townLayout.js가 유일한 좌표 진실 원천 — 이 파일은 재수출만 한다(v2
// 레이어 컴포넌트들이 townLayout.js와 townScene.js 양쪽을 왔다갔다
// import하지 않도록).
export const HOME_CELL = TOWN_LAYOUT_HOME_CELL
import { TOWN_LEVELS, starsToNextTownLevel, townLevelForStars } from './townLevel'

export const SCENE_ROWS = TOWN_GRID.rows
export const SCENE_COLS = TOWN_GRID.cols
export const LANE_ROW = Math.floor(TOWN_GRID.rows / 2)

// 행(row) 밴드 -> 존(zone) 매핑. TOWN_GRID.rows/LANE_ROW에서 파생하므로
// 그리드가 커지거나 줄어도(현재 8x6) 모든 행이 정확히 하나의 존에 속한다.
function buildZones() {
  const rows = SCENE_ROWS
  const lane = LANE_ROW
  const homeRows = []
  for (let y = 0; y < lane; y++) homeRows.push(y)
  const laneRows = [lane]
  const squareRow = lane + 1
  const squareRows = squareRow < rows ? [squareRow] : []
  const outskirtsRows = []
  for (let y = squareRow + 1; y < rows; y++) outskirtsRows.push(y)
  return [
    { id: 'home', rows: homeRows, label: '집과 정원' },
    { id: 'lane', rows: laneRows, label: '마을 길' },
    { id: 'square', rows: squareRows, label: '마을 광장' },
    { id: 'outskirts', rows: outskirtsRows, label: '마을 바깥' },
  ].filter((z) => z.rows.length > 0)
}

export const ZONES = Object.freeze(
  buildZones().map((z) => Object.freeze({ ...z, rows: Object.freeze(z.rows) })),
)

function clampCoord(v, max) {
  const n = Number.isInteger(v) ? v : 0
  return Math.max(0, Math.min(max - 1, n))
}

/**
 * 셀(x,y) -> 장면 박스 기준 퍼센트 앵커. 오브젝트는 바닥 기준(bottom-anchor)
 * 으로 배치하므로 leftPct(가로 중심)와 bottomPct(칸 하단)를 쓰고, topPct는
 * 배치 오버레이(칸 중심 원형 버튼) 등 중심 정렬이 필요한 곳에서 쓴다.
 * @returns {{leftPct:number, topPct:number, bottomPct:number}}
 */
export function anchorFor(x, y) {
  const cx = clampCoord(x, SCENE_COLS)
  const cy = clampCoord(y, SCENE_ROWS)
  return {
    leftPct: ((cx + 0.5) / SCENE_COLS) * 100,
    topPct: ((cy + 0.5) / SCENE_ROWS) * 100,
    bottomPct: ((cy + 1) / SCENE_ROWS) * 100,
  }
}

// fog는 잠긴 구역 위에 깔리는 "바닥 안개"일 뿐이다 — objects(배치된
// 스프라이트)보다 아래(z 낮음)에 있어야, 이미 구매해 놓은 아이템이 잠긴
// 것처럼 흐리게 보이는 일이 없다(2026-09-13 수정: 안개가 objects 위에
// 있어 rows 4–5에 놓인 소유 아이템이 blur/dim 처리되던 버그).
export const Z_LAYERS = Object.freeze({
  ground: 0,
  path: 1,
  patches: 2,
  fog: 5,
  objects: 10,
  overlay: 90,
  popover: 100,
})

/** y가 클수록(장면 아래쪽/앞쪽일수록) 더 큰 z-index — 원근 겹침 순서. */
export function zIndexFor(y) {
  const cy = clampCoord(y, SCENE_ROWS)
  return 10 + cy * 10
}

export const FOOTPRINT_CLASS = Object.freeze({
  lg: 'w-[19%] max-w-[112px]',
  md: 'w-[14%] max-w-[84px]',
  sm: 'w-[11%] max-w-[64px]',
})

/** 카테고리 -> 발자국 크기('lg'|'md'|'sm'). null-safe, 알 수 없는 카테고리는 'sm'. */
export function footprintFor(item) {
  const category = item && item.category
  if (category === 'house' || category === 'special') return 'lg'
  if (category === 'nature') return 'md'
  return 'sm'
}

/** 카탈로그 아이템 -> 렌더 스프라이트 서술(TownSprite.jsx 입력). null-safe. */
export function spriteFor(item) {
  if (!item) return { assetKey: null, emoji: '🎁', footprint: 'sm', label: '' }
  return {
    assetKey: item.assetKey || null,
    emoji: item.emoji || '🎁',
    footprint: footprintFor(item),
    label: item.name || '',
  }
}

export const HOME_SPRITE = Object.freeze({
  assetKey: 'buildings/my-house',
  emoji: '🏡',
  footprint: 'lg',
  label: 'My House',
})

export const GARDEN_STAGE_THRESHOLDS = Object.freeze([0, 10, 30, 60, 100])

/**
 * 배운 단어 수(gardenPoints) -> 정원 풍성함 단계. 비유한/음수는 stage 0 +
 * 모든 플래그 false로 안전하게 취급한다.
 * @returns {{stage:0|1|2|3|4, windowsLit:boolean, ivy:boolean, birds:boolean}}
 */
export function gardenRichness(gardenPoints) {
  const n = Number(gardenPoints)
  const points = Number.isFinite(n) && n > 0 ? n : 0
  let stage = 0
  for (let i = GARDEN_STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= GARDEN_STAGE_THRESHOLDS[i]) { stage = i; break }
  }
  return {
    stage,
    windowsLit: points >= 30,
    ivy: points >= 60,
    birds: points >= 100,
  }
}

/**
 * 현재 레벨보다 높은 minLevel을 가진 카탈로그 아이템 중, 가장 가까운
 * 다음 레벨(minLevel)에 걸린 것들만 정렬해 반환. 잠긴 아이템이 없으면
 * { nextLevel:null, items:[] }.
 */
export function nextUnlocks(catalog, level) {
  const items = Array.isArray(catalog) ? catalog : []
  const lvl = Math.max(1, Number.isFinite(Number(level)) ? Number(level) : 1)
  const locked = items.filter((it) => it && Number.isFinite(Number(it.minLevel)) && Number(it.minLevel) > lvl)
  if (locked.length === 0) return { nextLevel: null, items: [] }

  let nextLevel = Infinity
  for (const it of locked) nextLevel = Math.min(nextLevel, Number(it.minLevel))

  const atNextLevel = locked
    .filter((it) => Number(it.minLevel) === nextLevel)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))

  return { nextLevel, items: atNextLevel }
}

// 한글 종성(받침) 유무에 따른 주격 조사 선택 — 받침 있으면 "이", 없으면
// "가"(2026-09-13 카피 결함 수정: "꽃밭가 열려요"처럼 받침 단어에 항상
// "가"를 붙이던 문제). 한글 완성형 범위(가~힣) 밖의 마지막 글자(영문/숫자/
// 이모지 등)는 안전하게 기존 동작("가")을 유지한다.
function subjectParticle(word) {
  const w = typeof word === 'string' ? word : ''
  const ch = w.charCodeAt(w.length - 1)
  if (Number.isNaN(ch) || ch < 0xac00 || ch > 0xd7a3) return '가'
  return (ch - 0xac00) % 28 === 0 ? '가' : '이'
}

/**
 * 다음 마을 레벨까지 남은 별 + 그때 열리는 아이템 이름(최대 2개) 안내문.
 * starsToNextTownLevel(별 축)과 nextUnlocks(레벨→아이템 축)을 조합한다.
 * 조사(가/이)는 나열된 이름 중 마지막 이름의 받침 유무를 따른다.
 */
export function nearGoal(catalog, starsEarned) {
  const stars = Number.isFinite(Number(starsEarned)) ? Math.max(0, Number(starsEarned)) : 0
  const { nextLevel, remaining } = starsToNextTownLevel(stars)
  if (nextLevel == null) {
    return { nextLevel: null, remaining: 0, names: [], text: '모든 마을이 열렸어요!' }
  }

  const { items } = nextUnlocks(catalog, townLevelForStars(stars))
  const names = items.slice(0, 2).map((it) => it.name).filter(Boolean)
  const text = names.length > 0
    ? `⭐ ${remaining} 더 모으면 ${names.join(' · ')}${subjectParticle(names[names.length - 1])} 열려요`
    : `⭐ ${remaining} 더 모으면 다음 레벨이 열려요`

  return { nextLevel, remaining, names, text }
}

/**
 * 다음 레벨에서 열리는 아이템(최대 3개)을 안개 실루엣으로 보여주기 위한
 * 서술. 잠긴 아이템이 하나도 없으면 visible:false.
 */
export function fogState(catalog, level) {
  const lvl = Math.max(1, Number.isFinite(Number(level)) ? Number(level) : 1)
  const { nextLevel, items } = nextUnlocks(catalog, lvl)
  if (nextLevel == null || items.length === 0) {
    return { visible: false, nextLevel: null, silhouettes: [], chip: '' }
  }
  const silhouettes = items.slice(0, 3).map((it) => ({ id: it.id, emoji: it.emoji || '🎁', name: it.name || '' }))
  return { visible: true, nextLevel, silhouettes, chip: `⭐ Lv.${nextLevel}에서 열려요` }
}

/**
 * HOME_CELL과 이미 배치가 있는 칸을 제외한 모든 빈 칸 좌표(배치 오버레이용).
 * placements 배열에 null이 섞여 있어도 안전. mode는 V1과 동일한 시맨틱을
 * 유지하기 위한 자리(이동 중인 배치 자신의 칸도 여전히 점유로 취급) —
 * 현재는 결과에 영향을 주지 않지만 시그니처를 스펙대로 유지한다.
 */
// eslint-disable-next-line no-unused-vars
export function freeAnchors(placements, mode) {
  const list = Array.isArray(placements) ? placements.filter(Boolean) : []
  const occupied = new Set(list.map((p) => `${p.x},${p.y}`))
  const out = []
  for (let y = 0; y < SCENE_ROWS; y++) {
    for (let x = 0; x < SCENE_COLS; x++) {
      if (x === HOME_CELL.x && y === HOME_CELL.y) continue
      if (occupied.has(`${x},${y}`)) continue
      out.push({ x, y })
    }
  }
  return out
}

// TOWN_LEVELS는 이 파일에서 직접 쓰진 않지만(starsToNextTownLevel/
// townLevelForStars가 내부에서 이미 사용), 씬 레이어(TownHud.jsx 등)가
// 별도 계산 없이 재사용할 수 있도록 재노출한다.
export { TOWN_LEVELS }
