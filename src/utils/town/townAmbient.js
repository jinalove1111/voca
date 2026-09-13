// src/utils/town/townAmbient.js — Paul Town British World, Ambient ground
// variation(순수 도메인, 2026-09-12). 설계 원문:
// docs/design/town/VISUAL_SYSTEM.md §5, COMPONENT_ARCHITECTURE.md §3.
//
// import 0 — React/DOM 없음. 좌표(x,y) -> 결정론 톤 인덱스만 계산하는 순수
// 함수라 리렌더/새로고침/기기 간 동기화와 무관하게 항상 같은 결과를 낸다
// (Math.random 없음). 이 파일은 어떤 DOM도 만들지 않는다 — className 조합은
// 호출부(향후 TownGrid.jsx 확장, 이번 세션은 와이어링하지 않음,
// COMPONENT_ARCHITECTURE.md §6)의 책임이다.

// (x+y) % 3 -> 0|1|2. HOME_CELL을 포함한 모든 좌표에 안전(어떤 좌표든 정의됨).
export function ambientTone(x, y) {
  const xi = Number.isInteger(x) ? x : 0
  const yi = Number.isInteger(y) ? y : 0
  return ((xi + yi) % 3 + 3) % 3
}

// tone(0|1|2) -> Tailwind 배경 유틸리티 클래스. 전부 기존 팔레트
// (PAUL_TOWN_ASSET_SPEC.md §5)에서만 파생 — 새 색 추가 없음. tone 0은
// "추가 클래스 없음"(기존 기본 배경 유지)이라 빈 문자열을 반환한다.
const TONE_CLASSES = ['', 'bg-[#fdebd0]/20', 'bg-[#cfe3c0]/15']

export function ambientClassFor(x, y) {
  return TONE_CLASSES[ambientTone(x, y)]
}

// row(y) -> 깊이 단서용 밝기 보정 클래스(상단일수록 밝게, 하단일수록
// 진하게). rows는 TOWN_GRID.rows(기존 townLayout.js 상수, 이 파일은 그
// 상수를 import하지 않는다 — 호출부가 rows를 넘긴다, 순수성 유지).
export function depthClassFor(y, rows) {
  const total = Number.isInteger(rows) && rows > 0 ? rows : 6
  const yi = Number.isInteger(y) ? Math.max(0, Math.min(total - 1, y)) : 0
  const band = Math.floor((yi / total) * 3) // 0(상단/밝음) ~ 2(하단/진함)
  return ['opacity-90', 'opacity-100', 'opacity-100'][Math.min(2, band)]
}
