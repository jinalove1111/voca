# Paul Town — Visual System (2026-09-12)

_설계 문서. `docs/design/PAUL_TOWN_ASSET_SPEC.md`(팔레트/자산 규격의 단일
원천)를 대체하지 않고 그 위에 "화면 레이아웃/레이어링/모션/접근성" 규칙만
더한다. 실제 코드 변경은 최소(§7의 안전 프로토타입 1건, CSS-only)만 하고,
나머지는 향후 구현 세션이 따를 규칙 문서다._

## 1. 팔레트 — `PAUL_TOWN_ASSET_SPEC.md` §5 그대로 재사용

새 색을 추가하지 않는다. 고정 7색 + 기존 그라데이션(`TownGrid.jsx`의
`from-[#fdebd0] via-[#f6e3c8] to-[#cfe3c0]`)을 "시간대" 은유로만 재해석한다.

| 용도 | 색 | 근거 |
|---|---|---|
| 저녁 하늘/포인트 | Navy `#1e2a5a` | 기존 그리드 테두리(`border-[#1e2a5a]/20`)와 동일 |
| 불빛/골드 포인트 | Gold `#c9a227` | 표지판/시계탑 스펙과 동일 |
| 우체통/포인트 | Burgundy `#8b1e2d` | 우체통 스펙과 동일 |
| 밝은 배경 | Cream `#fdebd0` | 기존 그리드 그라데이션 시작색과 동일 |
| 창문/램프 불빛 | Warm amber `#f6c76b` | 램프류 스펙과 동일 |
| 길/건물 벽 | Stone `#b9b3a8` | 기존 자갈길 행(`bg-[#d9d2c5]`)과 동계열 |
| 자연/잔디 | Green `#4f7a4a`(짙은) / `#cfe3c0`(밝은, 기존 그라데이션 끝색) | 나무/꽃밭 스펙과 동일 |

## 2. 타이포그래피 — 재사용만, 신규 폰트 0

프로젝트 전역 폰트/굵기 체계(`font-black`/`font-bold`, Tailwind 유틸리티)를
그대로 쓴다. Town 전용 신규 웹폰트/장식 폰트를 로드하지 않는다(추가 네트워크
요청 0, 번들 예산 §6 위반 방지). "손글씨풍" 느낌이 필요하면 `italic` +
`tracking-wide` 조합처럼 기존 유틸리티 클래스 조합으로만 표현한다.

## 3. 레이어 모델(8×6 격자 위)

기존 `TownGrid.jsx`는 이미 배경(그라데이션 div) → 자갈길 행(mid row) → 셀
버튼(아이템/홈) → 열림 액션 스트립(z-10 absolute) 4단 구조를 갖고 있다. 이
문서는 그 위에 "개념적" 레이어 이름만 부여해 `COMPONENT_ARCHITECTURE.md`가
참조할 수 있게 한다 — 실제 DOM 구조를 늘리는 리팩터링은 하지 않는다.

| 레이어(개념) | 현재 구현 위치 | z 순서 |
|---|---|---|
| Ground(바닥) | 그리드 컨테이너 `bg-gradient-to-b` | 0(최하단) |
| Path(길) | `isPath` 행 `bg-[#d9d2c5]` | 1 |
| Object(오브젝트: 건물/자연/동물/장식) | 셀 버튼 내부 `<img>`/이모지 | 2 |
| Ambient(분위기: 안개/불빛 글로우) | §5, 신규 — CSS만, 선택적 | 3 |
| Action strip(이동/보관) | `absolute z-10` | 4(최상단, 기존 그대로) |

## 4. Footprint(칸 점유) 규칙

모든 기존 17종은 1×1(bridge만 아트 비율 2:1이지만 그리드 점유는 여전히 1칸,
`PAUL_TOWN_ASSET_SPEC.md` §4 "그리드 폭 넓은 타일" 메모 그대로). V1은 멀티셀
오브젝트를 지원하지 않는다(`townLayout.js`가 좌표 1개만 저장) — 이 문서는 이
제약을 바꾸지 않는다. 건물류(`buildings/*`, `special/*`)는 세로로 긴 아트(1:1.2)
를 "칸보다 큰 캔버스 + 하단 정렬"로 그린다는 기존 지침(`PAUL_TOWN_ASSET_REQUEST
_LIST.md` §3 마지막 항목)을 그대로 따르고, 실제 반영 시 `object-contain` →
`object-contain object-bottom`으로 바꾸는 것을 권장(§7에서 코드 변경은 하지
않고 권고만 남김 — 자산이 없는 현재는 검증 불가).

## 5. 지면 변주 · 깊이 단서(Ambient) — 제안 + 안전 프로토타입

목표: "칸마다 똑같은 흰 배경"이 아니라 자연스러운 마을 느낌을 CSS만으로 낸다.

- **지면 변주**: `isPath` 외 나머지 칸도 전부 동일한 `bg-white/40`을 쓰는 대신,
  좌표 기반(순수 함수, 랜덤 아님 — 리렌더마다 흔들리지 않도록) 결정론적 미세
  톤 변화(3단계 이하)를 제안한다. 예: `(x+y) % 3`으로 `bg-white/40` /
  `bg-[#fdebd0]/30` / `bg-[#cfe3c0]/20` 세 톤을 순환 — 이미지 0장, DOM 변화 0
  (className만 조건부).
- **깊이 단서**: 상단 행(y=0)일수록 약간 밝게(하늘에 가까움), 하단 행일수록
  약간 진하게(땅에 가까움) — `opacity` 또는 톤 보정만, 실제 그라데이션 배경은
  이미 위→아래로 cream→green이라 이 규칙과 자연스럽게 맞는다.
  구현 시 CSS `filter: brightness()`처럼 무거운 필터는 피하고 배경색 클래스
  전환만 쓴다(모바일 저사양 기기 리페인트 비용 최소화).
  적용 방식(§7 실제 코드): row 인덱스로 3단 밝기 클래스를 결정론적으로 부여.
- **z-order 규칙**: Ground(0) < Path(1) < Object(2) < Ambient(3) < Action
  strip(4). Ambient는 항상 `pointer-events-none`이라 탭 판정에 절대 관여하지
  않는다(기존 버튼 클릭 로직 무변경 보장).
- **개수 상한**: 화면에 동시 존재하는 ambient 장식(안개/글로우 스팟 등)은
  **최대 3개**(성능/시각적 산만함 방지, `prefers-reduced-motion` 시 0개).

## 6. 애니메이션 규칙 — CSS-only, 동시 3개 이하

- 전부 CSS `transition`/`@keyframes`만 사용(JS 애니메이션 라이브러리 신규 도입
  금지 — CLAUDE.md 규칙 6, 외부 의존성 최소화).
- `prefers-reduced-motion: reduce`일 때 모든 ambient 애니메이션(글로우 펄스,
  안개 흐름 등)을 `animation: none`으로 끈다 — 기존 프로젝트가 이미
  `btn-press`/`animate-fade-in`/`animate-slide-up` 등 커스텀 유틸리티를 갖고
  있으므로(`TownScreen.jsx`/`TownShopPanel.jsx`에서 사용 확인) 이번 세션은
  그 관례를 그대로 따른다.
- **동시 실행 상한 3개**: 예) 램프 불빛 깜빡임(옵션) + 안개 흐름(옵션) + 기존
  `btn-press` 눌림 애니메이션 정도로 제한. 아이템이 여러 개 배치돼도 개별
  아이템마다 독립 애니메이션을 걸지 않는다(칸 수만큼 애니메이션이 늘어나는
  것 자체가 리페인트 비용 폭증의 원인 — 45명 규모 모바일 기기 기준).
- 배치/이동 성공 시 짧은(≤300ms) scale/opacity 트랜지션 정도는 허용(기존
  `transition-all duration-500`가 진행바에 이미 쓰이는 패턴과 동일 톤).

## 7. 모바일 성능 예산

- 신규 이미지 파일 0개(이번 세션 프로토타입은 CSS/이모지만) — `testBundleBudget
  .mjs`의 예산 5번("어떤 청크에도 `src/assets/town` 이미지 URL 없음")을 그대로
  통과해야 한다(TOWN_ASSETS가 채워지기 전까지는 이 상태가 정상).
- Ambient 레이어는 셀당 추가 DOM 노드를 만들지 않는 것을 우선 원칙으로 하고,
  꼭 필요하면 `aria-hidden="true"` + `pointer-events-none`인 단일
  `<span>`/의사요소(`::before`)로 제한한다.
- TownScreen lazy 청크 gzip 예산(≤15KB, `testBundleBudget.mjs`)을 넘기지
  않도록, 신규 CSS는 Tailwind 유틸리티 조합만 쓰고 별도 `.css` 파일/런타임
  CSS-in-JS 라이브러리를 추가하지 않는다.

## 8. 200% 확대 규칙

기존 E2E(`tests/e2e/townV1.spec.mjs` PROXY 섹션)가 이미 상점/내 마을/보관함
3탭에서 200% 확대 시 가로 스크롤 없음을 검증한다. 이 문서가 추가하는 규칙:

- Ambient 장식은 `position: absolute` + 그리드 셀 내부에 완전히 갇혀야 한다
  (셀 경계를 넘어 겹치는 장식은 200% 확대 시 다른 셀의 탭 영역을 가릴 위험 —
  금지).
- 새 텍스트(가이드 라인, 발견 카드 등)는 전부 `text-xs`(12px) 이상, `overflow-
  hidden text-ellipsis` 또는 자연 줄바꿈 허용 — 고정 `white-space: nowrap`으로
  긴 문장을 강제하지 않는다(헤더 캡션처럼 8단어 이내 짧은 문구에 한해서만
  `whitespace-nowrap` 허용, `PAUL_TOWN_V1.md` §12 기존 관례와 동일).

## 9. 참고

- `docs/design/PAUL_TOWN_ASSET_SPEC.md` §5(팔레트 단일 원천, 이 문서가 상속).
- `docs/design/town/COMPONENT_ARCHITECTURE.md` §3(레이어 → 실제 컴포넌트 매핑).
- `scripts/testBundleBudget.mjs`(성능 예산 실측 근거).
