# Paul Town — P0 아트 드롭인 매니페스트 (P0 ART DROP-IN MANIFEST)
## 2026-09-16

> **상태**: 운영자/개발자 대상 매니페스트(operator-facing manifest),
> 설계/준비(design/prep) 단계. **최종 아트 파일은 아직 하나도 존재하지
> 않는다.** 이 문서는 이미지가 도착했을 때 "어느 파일을 어디에 놓아야
> 하는지"를 혼동 없이 확정하기 위한 표/좌표 문서이며, 이 문서 자체는
> 코드/DB를 전혀 건드리지 않는다(작성 세션에서 git add/commit 없음). 아트
> 디렉션/캔버스 수치의 출처(source of truth)는
> `docs/design/town/PAUL_TOWN_WORLD_BLUEPRINT_V1_2026-09-16.md`이며, 이
> 문서와 수치가 다르면 블루프린트 쪽이 우선한다.

이 문서는 P0로 확정된 7개 자산 각각에 대해 (1) 정확한 파일 경로, (2) 논리
캔버스/@2x 캔버스 크기, (3) 렌더 스케일 기대값, (4) 폴백(fallback) 동작,
(5) 렌더러 경로, (6) 코드 의존성 유무를 한 곳에 모은다. 이미지 제작자와
드롭인 작업자가 서로 다른 사람이어도 이 표만으로 작업이 완결되도록
작성했다.

---

## 1. buildings/my-house

- asset_key: `buildings/my-house`
- filename: `my-house.webp`
- logical canvas: 128×160px
- @2x canvas: 256×320px
- expected directory: `src/assets/town/buildings/my-house.webp` (이미
  존재 — 이번 작업은 **교체(REPLACEMENT)**이지 신규 파일이 아니다. 비교를
  원하면 덮어쓰기 전에 기존 파일을 백업해 둘 것)
- anchor: bottom-center
- render scale: W=358 기준 세로 ≈150px(42%W) — **월드 전체 스케일
  기준점**. 다른 모든 자산의 크기는 이 자산을 기준으로 상대 비율로
  정해진다
- fallback: TownSprite의 onError 경로를 통한 이모지 🏠(기존에 이미 있는
  메커니즘, 이번 작업으로 변경 없음)
- renderer: `src/components/town/v2/TownObjectLayer.jsx`, 전용
  `HOME_SPRITE`/`TownSprite` 경로(LOTS 배열이 아님 — My House는 항상 지어져
  있는 상태로 별도 렌더링됨)
- code dependency: **없음** — 같은 경로에 새 파일을 덮어쓰기만 하면 됨,
  이미 배선(wiring) 완료

## 2. buildings/book-shop

- asset_key: `buildings/book-shop`
- filename: `book-shop.webp`
- logical canvas: 128×160px
- @2x canvas: 256×320px
- expected directory: `src/assets/town/buildings/book-shop.webp` (이미
  존재 — **교체**)
- anchor: bottom-center
- render scale: Book Shop Lane 구역의 0.86 스케일 적용 후 W=358 기준
  세로 ≈111px(스케일 적용 전 36%W)
- fallback: `TownObjectLayer.jsx`의 LOTS 렌더링 경로를 통한 플레이스홀더
  박스(solid=지어짐/dashed=분양중). 이번 세션(브랜치
  `chore/paul-town-p0-art-pipeline-2026-09-16`)에 이 경로가 다른 모든
  자산과 동일한 `townAsset()`/`TownSprite` 리졸버를 호출하도록
  일반화되어, 이제 아트가 없을 때만 플레이스홀더 박스로 폴백한다
- renderer: `src/components/town/v2/TownObjectLayer.jsx`, LOTS 배열,
  `lot.id === 'book-shop'`
- code dependency: **없음(이번 세션 패치 기준)** — 이전에는 렌더러가
  등록된 아트 유무와 무관하게 항상 플레이스홀더 박스를 강제해 막혀
  있었으나, 그 일반화 패치가 반영되어 이제는 파일만 놓으면 됨(단, 이
  브랜치의 패치가 머지된 이후여야 함)

## 3. nature/tree

- asset_key: `nature/tree`
- filename: `tree.webp`
- logical canvas: 96×128px
- @2x canvas: 192×256px
- expected directory: `src/assets/town/nature/tree.webp` (이미 존재 —
  **교체**)
- anchor: bottom-center
- render scale: W=358 기준 세로 ≈72px(20%W), 나무 높이는 코티지 높이의
  ≈0.9배
- fallback: TownSprite의 onError 경로를 통한 이모지 🌳
- renderer: `TownObjectLayer.jsx`의 데코레이션 배치 경로(`placements.map()`
  루프, `spriteFor()`/`TownSprite` 경유 — 다른 모든 이동형 데코레이션과
  동일한 메커니즘)
- code dependency: **없음**

## 4. nature/flower-garden

- asset_key: `nature/flower-garden`
- filename: `flower-garden.webp`
- logical canvas: 96×64px
- @2x canvas: 192×128px
- expected directory: `src/assets/town/nature/flower-garden.webp`
  (**아직 존재하지 않음 — 진짜 신규 파일**)
- anchor: bottom-center
- render scale: W=358 기준 가로 ≈64px(18%W×8%)
- fallback: 이모지 🌷(현재 상태 — 카탈로그 아이템의 `assetKey`가 이미
  `nature/flower-garden`으로 정확히 해석됨을 이번 세션에 확인했음
  (`assetKeyFor()` 기존 로직), 카탈로그 쪽 변경 불필요)
- renderer: `TownObjectLayer.jsx`의 데코레이션 배치 경로(tree와 동일한
  메커니즘)
- code dependency: **1줄** — 위 경로에 파일이 도착한 후,
  `src/assets/town/index.js`에 import문(`import flowerGarden from
  './nature/flower-garden.webp'`) 한 줄과 `TOWN_ASSETS` 객체에 키 한 줄
  (`'nature/flower-garden': flowerGarden,`) 추가. 이 "import 1줄 + 키
  1줄" 패턴은 이 프로젝트의 모든 이전 아트 배치(batch)와 동일하며 새로운
  메커니즘이 아니다

## 5. decorations/street-lamp

- asset_key: `decorations/street-lamp`
- filename: `street-lamp.webp`
- logical canvas: 72×144px
- @2x canvas: 144×288px
- expected directory: `src/assets/town/decorations/street-lamp.webp`
  (이미 존재 — **교체**)
- anchor: bottom-center
- render scale: W=358 기준 가로 ≈22px(6%W), 높이는 코티지 높이의 ≈0.6배
- fallback: TownSprite의 onError 경로를 통한 이모지 🪔(가로등 이모지)
- renderer: `TownObjectLayer.jsx`의 데코레이션 배치 경로
- code dependency: **없음**

## 6. decorations/red-post-box

- asset_key: `decorations/red-post-box`
- filename: `red-post-box.webp`
- logical canvas: 72×108px
- @2x canvas: 144×216px
- expected directory: `src/assets/town/decorations/red-post-box.webp`
  (이미 존재 — **교체**)
- anchor: bottom-center
- render scale: W=358 기준 가로 ≈22px(6%W)
- fallback: TownSprite의 onError 경로를 통한 이모지 📮
- renderer: `TownObjectLayer.jsx`의 데코레이션 배치 경로
- code dependency: **없음**

## 7. decorations/bench

- asset_key: `decorations/bench`
- filename: `bench.webp`
- logical canvas: 72×48px
- @2x canvas: 144×96px
- expected directory: `src/assets/town/decorations/bench.webp` (**아직
  존재하지 않음 — 진짜 신규 파일**)
- anchor: bottom-center
- render scale: W=358 기준 가로 ≈47px(13%W)
- fallback: 이모지 🪑(현재 상태 — 카탈로그 아이템의 assetKey가 이미
  `decorations/bench`로 정확히 해석됨, 카탈로그 쪽 변경 불필요)
- renderer: `TownObjectLayer.jsx`의 데코레이션 배치 경로
- code dependency: **1줄** — flower-garden과 동일한 패턴: 파일이 도착한
  후 `src/assets/town/index.js`에 import 1줄 + 키 1줄 추가

---

## 공통 규칙 (모든 7종 동일)

카메라 3/4 top-down ≈30°, 좌상단 warm late-afternoon 광원, ≤15% 콘택트
섀도만(원화에 그림자 직접 그리지 않음), 투명 여백 ≥4%, 실제 RGBA 알파
필수(baked 배경 금지), 앵커 bottom-center 전부 동일, PNG 마스터 + WebP
배포, 팔레트는 웜 크림/소프트 모스/세이지/웜 스톤/머티드 네이비/버건디/웜
앰버/소프트 골드/목재 브라운(단 red-post-box는 전통 영국 우체통 빨강 예외
유지).

## 요약표

| asset_key | 현재 파일 존재 여부 | 코드 의존성 | 작업 |
|---|---|---|---|
| `buildings/my-house` | 존재 | 없음 | 교체만 |
| `buildings/book-shop` | 존재 | 없음(이번 세션 패치로 해소) | 교체만 |
| `nature/tree` | 존재 | 없음 | 교체만 |
| `nature/flower-garden` | 미존재 | 1줄 등록 필요 | 신규 파일 + 등록 |
| `decorations/street-lamp` | 존재 | 없음 | 교체만 |
| `decorations/red-post-box` | 존재 | 없음 | 교체만 |
| `decorations/bench` | 미존재 | 1줄 등록 필요 | 신규 파일 + 등록 |
