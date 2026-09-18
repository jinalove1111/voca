# Paul Town V2 — 47칸 배치(placement) 계약 v1 (2026-09-17, uniform-단위 보정판)

이 문서는 `src/utils/town/placementContract.js`(순수 데이터 + 파생 함수)가
실제로 계산한 47칸의 최종 배치 데이터를 사람이 읽을 수 있는 표로 옮긴
것이다. 이 모듈은 아직 어떤 렌더러/컴포넌트에서도 import되지 않는다
(unshipped, 순수 엔지니어링 준비 작업) — `src/components/town/v2/*`,
`townScene.js` 등 기존 코드는 이 모듈을 참조하지 않고, 이 브랜치의 다른
어떤 기존 파일도 수정하지 않았다(단, `worldContract.js`/
`testTownWorldContract.mjs`에는 아래 "단위 버그 수정" 섹션에서 설명하는
새 export/단언을 append했다 — 기존 export/단언은 손대지 않았다).

## 2026-09-17 2차 수정 — y/x 물리 종횡비 단위 버그

최초 버전(이 문서의 1차본)은 WORLD의 x(0~100, 가로 %)와 y(0~100, 세로 %)를
같은 물리 척도로 취급해 모든 박스/거리 계산을 했다. 그러나 실제 물리
종횡비는 100:190(`WORLD.h/WORLD.w = 1.9`)이라, y 1%는 x 1%보다 1.9배 더
긴 물리 거리다. 이 버그의 영향:

- **랜드마크 박스가 실제보다 1.9배 크게 계산됨.** 예: my-house(폭 34,
  hFactor 1.25)의 높이가 `w*hFactor = 42.5`(y-percent로 그대로 취급)였으나,
  올바르게는 `(w*hFactor)/1.9 ≈ 22.4`다 — 박스가 `y:[13.9,53]`(1차,
  전체 집/정원 구역의 절반 가까이 차지)에서 `y:[32.4,53]`(2차, 훨씬
  현실적인 크기)로 줄었다.
- **경로/강/펜스/보호구역 거리 판정도 비등방(anisotropic)이었다** — 두
  점이 y로만 떨어져 있으면 실제보다 더 가깝게(1.9배) 취급됐다.

수정: `worldContract.js`에 `toUniform(pt)`(y만 ×1.9 보정), 그 위에 세운
`distanceToPolylineUniform`/`nearestPathUniform`을 새 export로
append했다(기존 `distanceToPolyline`/`nearestPath`는 그대로 유지 —
`scripts/testTownWorldContract.mjs`의 book-shop/강 클리어런스 등 기존
호출부가 이미 그 raw 의미로 검증돼 있어 손대지 않았다).
`placementContract.js`는 이제 랜드마크/발자국 박스 높이, path/river/
fence/protected 거리, 47칸 최소 간격(6 unit) 전부를 이 uniform 함수로
계산한다. `testTownWorldContract.mjs`에 이 새 함수들을 검증하는 9개
단언을 append했다(87 -> 96개, 수평 선분 1 y-unit 위 점이 uniform
공간에서 1.9 unit임을 직접 증명하는 단언 포함).

이 수정 이후 47칸 좌표를 전부 다시 도출했다(아래 "자기 zone 밖 예외"
섹션 참고 — 재도출 결과 자기 zone 리전 안에 들어가는 칸이 크게
늘었고, `recommended: []`이던 예외 칸도 완전히 없앴다).

## 출발점과 방법론

`docs/design/town/analysis/anchor-collision-2026-09-17.md`(와이어프레임
좌표 기반 47칸 사전분석)를 출발점으로 삼되, `collisionsFor()`를
uniform 거리로 구현한 뒤에는 그 좌표를 그대로 쓸 수 없었다(콜리전
계산식 자체가 달라 처음부터 다시 검증해야 했다). 좌표 탐색은 zone별로
격자 탐색(0.05~0.25 unit 간격) + farthest-point 재배치를 우선 **자기
zone의 REGIONS 박스 안**에서 시도하고, 진짜로 공간이 부족한 경우에만
(아래 예외 참고) 인접 리전으로 넘어갔다. 구역 배분(순서/개수)은 §5
표와 동일하되, 개별 좌표는 이 세션이 다시 도출했다(재설계가 아니라
재배치 — `worldContract.js`의 리전/경로/랜드마크/펜스/보호구역 숫자는
그대로 참조했을 뿐 하나도 바꾸지 않았다).

## 자기 zone 밖 예외 (1개, 허용치 3개 이내)

47칸 중 46칸은 자기 zone에 대응하는 `REGIONS` 박스 안에 있다. 유일한
예외:

- **`7,2`(villageLane, world `(42.65, 68.1)`)** — villageLane의 own
  region은 `REGIONS.connector`(x44–58, y56–70)인데, 이 박스는 trunk/
  square/shop/sea 네 갈래 경로가 모두 만나는 분기점(`PROTECTED.forkA`,
  반경 6)과 겹쳐 거의 전부가 통행로다. own-region 안에서는 격자
  탐색으로 최대 4칸까지만(6.1 unit 이상 간격 유지) 배치할 수 있었고,
  5번째 칸은 `REGIONS.foreground`(y66–100)로 넘어가야 했다 — connector
  중심에서 가장 가까우면서(거리 ≈12.8) 다른 46칸과 6.1 unit 이상
  떨어진 지점을 골랐다.

## `recommended: []` 예외 — 완전히 제거됨

1차본에서는 `5,0` 한 칸이 `recommended: []`(모든 클래스가 콜리전)
였으나, 단위 버그 수정 + 좌표 재도출로 **47칸 전부 최소 1개 이상의
클래스를 recommended로 갖는다.** 47칸 전체 중 `flower`는 모든 칸에서
recommended(가장 작은 발자국이라 항상 여유가 있다), `tree`는 13칸,
`bench`는 19칸에서 recommended다.

## OBJECT_CLASSES(발자국, world unit, scale=1 기준)

| class | w(x-scale) | h(x-scale) | 베이스 박스(h×0.45, y-percent로는 ÷1.9) |
|---|---|---|---|
| tree | 12 | 16 | 12 × (7.2/1.9 ≈ 3.79) |
| flower | 8 | 5 | 8 × (2.25/1.9 ≈ 1.18) |
| bench | 12 | 6 | 12 × (2.7/1.9 ≈ 1.42) |
| lamp | 5 | 18 | 5 × (8.1/1.9 ≈ 4.26) |
| postbox | 5 | 12 | 5 × (5.4/1.9 ≈ 2.84) |
| animal | 7 | 6 | 7 × (2.7/1.9 ≈ 1.42) |
| decoration | 8 | 8 | 8 × (3.6/1.9 ≈ 1.89) |

`LARGE_CLASSES = ['tree', 'bench']` — 이 둘은 핵심 출입구/교차점 8곳
(door/gate/shopEntrance/cafeEntrance/bridgeCrossing/schoolEntrance/
towerBase/paul) uniform 반경 10 unit 안에서는 실제 콜리전 여부와
무관하게 항상 `exclusions`에 강제 포함된다(동선을 시각적으로 막지
않기 위한 큐레이션 규칙, `collisionsFor`의 기하 판정과 별개 — 이
거리도 uniform으로 잰다).

## 콜리전 판정 규칙 (`collisionsFor(cell, objectClass)`)

point 기반(objectClass와 무관, 전부 uniform 거리 — `toUniform`으로
변환한 뒤 계산):

| kind | 판정 |
|---|---|
| `nav` | `y > 95`(화면 하단 네비게이션 밴드, y 자체는 변환 없이 원래 percent) |
| `path` | `nearestPathUniform(pt).distance < width/2 + 1.5` |
| `river` | `distanceToPolylineUniform(pt, RIVER) < RIVER_WIDTH/2 + RIVER_BANK`(=7) |
| `fence` | `distanceToPolylineUniform(pt, GARDEN_FENCE) < 1.5`(단, `GARDEN_GATE`에서 uniform 3 unit 이내는 면제) |
| `protected` | uniform 거리 `< r` |

박스 기반(objectClass의 발자국 크기에 따라 달라짐, 박스 높이는 y-percent
로 표현하기 위해 `/1.9` 보정):

| kind | 판정 |
|---|---|
| `landmark` | 발자국 베이스 박스 vs 랜드마크 박스(anchor bottom-center, `w`, `h = (w*hFactor)/1.9`, 4%/side 축소) AABB 겹침 |
| `cell` | 발자국 베이스 박스 vs 다른 모든 등록 셀의 (같은 objectClass 기준) 베이스 박스 AABB 겹침 |

## 마커 노출 계약 (`visibleMarkerStyle(mode)`) — 변경 없음

| mode | 결과 |
|---|---|
| `'idle'`(평소 마을 화면) | `'none'` |
| `'placing'` \| `'moving'` | `'ground-glow'` |
| 그 외/미확인 | `'none'`(안전 기본값) |

## 열려있는 운영자 결정 사항

`riverApproach`(리버뱅크 3칸)의 잠금해제 레벨은 여전히
`RIVER_CELLS_UNLOCK = 6`(운영자 확인 대기) — 1차본과 동일, 이번 수정과
무관.

## 47칸 전체 표

id는 `townScene.js`의 `SPOT_MAP` 키(`'x,y'`, 8×6 그리드에서
`HOME_CELL(3,2)` 제외)와 정확히 같다. `unlock` 열의 "1(§5 예외)"는
squarePerimeter가 `REGIONS.square`(Lv5) 안에 있어도 §5 스펙대로 Lv1부터
잔디로 쓸 수 있다는 의미.

| id | x | y | zone | depthClass | scale | unlock | recommended | exclusions |
|---|---|---|---|---|---|---|---|---|
| 0,0 | 35.6 | 65.8 | frontGarden | mid | 0.999 | 1 | flower, lamp, postbox, animal, decoration | tree, bench |
| 1,0 | 2.8 | 65.8 | frontGarden | mid | 0.999 | 1 | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 2,0 | 19.2 | 65.2 | frontGarden | mid | 0.994 | 1 | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 3,0 | 34.6 | 57.8 | frontGarden | mid | 0.941 | 1 | flower, lamp, postbox, animal, decoration | tree, bench |
| 4,0 | 3.8 | 57.2 | frontGarden | mid | 0.937 | 1 | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 5,0 | 20.2 | 56.4 | frontGarden | mid | 0.931 | 1 | flower, postbox, animal, decoration | tree, lamp, bench |
| 6,0 | 45.6 | 52.8 | frontGarden | mid | 0.906 | 1 | flower, postbox, animal, decoration | tree, bench, lamp |
| 7,0 | 2 | 48.6 | frontGarden | mid | 0.876 | 1 | flower, lamp, postbox, animal, decoration | tree, bench |
| 0,1 | 41.2 | 45.8 | frontGarden | mid | 0.856 | 1 | flower, lamp, postbox, animal, decoration | tree, bench |
| 1,1 | 45.8 | 38.8 | frontGarden | midBack | 0.776 | 1 | flower, bench, lamp, postbox, animal | tree, decoration |
| 2,1 | 3.2 | 36.2 | houseLawn | midBack | 0.758 | 1 | flower, lamp, postbox, animal, decoration | tree, bench |
| 3,1 | 20.4 | 32.4 | houseLawn | midBack | 0.731 | 1 | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 4,1 | 33.6 | 32.4 | houseLawn | midBack | 0.731 | 1 | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 5,1 | 8.4 | 30 | houseLawn | midBack | 0.714 | 1 | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 6,1 | 45.8 | 29.8 | houseLawn | midBack | 0.713 | 1 | flower, lamp, postbox, animal, decoration | tree, bench |
| 7,1 | 32 | 24.8 | houseLawn | background | 0.639 | 1 | flower | tree, bench, lamp, postbox, animal, decoration |
| 0,2 | 17 | 24.4 | houseLawn | background | 0.637 | 1 | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 1,2 | 2 | 24 | houseLawn | background | 0.636 | 1 | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 2,2 | 56 | 70 | villageLane | foreground | 1.024 | 1 | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 4,2 | 58 | 60.25 | villageLane | mid | 0.959 | 1 | flower, lamp, postbox, animal | tree, bench, decoration |
| 5,2 | 46.2 | 59 | villageLane | mid | 0.950 | 1 | flower, bench, postbox, animal, decoration | tree, lamp |
| 6,2 | 49.4 | 56.15 | villageLane | mid | 0.930 | 1 | flower | tree, bench, lamp, postbox, animal, decoration |
| 7,2 | 42.65 | 68.1 | villageLane(자기 zone 밖 예외) | foreground | 1.012 | 1 | flower, bench, lamp, postbox, animal, decoration | tree |
| 0,3 | 64.6 | 55.2 | squarePerimeter | mid | 0.923 | 1(§5 예외) | flower, postbox, animal, decoration | tree, bench, lamp |
| 1,3 | 54.2 | 43 | squarePerimeter | midBack | 0.806 | 1(§5 예외) | flower, postbox, animal, decoration | tree, bench, lamp |
| 2,3 | 50.4 | 48 | squarePerimeter | mid | 0.871 | 1(§5 예외) | flower, lamp, postbox, animal, decoration | tree, bench |
| 3,3 | 64.8 | 63.8 | squarePerimeter | mid | 0.984 | 1(§5 예외) | flower, lamp, postbox, animal, decoration | tree, bench |
| 4,3 | 46.4 | 42.8 | squarePerimeter | midBack | 0.804 | 1(§5 예외) | flower, lamp, postbox, animal, decoration | tree, bench |
| 5,3 | 41.6 | 49.6 | squarePerimeter | mid | 0.883 | 1(§5 예외) | flower, postbox, animal, decoration | tree, bench, lamp |
| 6,3 | 65 | 59 | squarePerimeter | mid | 0.950 | 1(§5 예외) | flower, postbox, animal | tree, bench, lamp, decoration |
| 7,3 | 52 | 40 | squarePerimeter | midBack | 0.785 | 1(§5 예외) | flower, bench, postbox, animal | tree, lamp, decoration |
| 0,4 | 78 | 48.1 | cafeEdge | mid | 0.872 | 5 | flower | tree, bench, lamp, postbox, animal, decoration |
| 1,4 | 60.5 | 48.1 | cafeEdge | mid | 0.872 | 5 | flower | tree, bench, lamp, postbox, animal, decoration |
| 2,4 | 70.4 | 49.9 | cafeEdge | mid | 0.885 | 5 | flower, postbox, animal, decoration | tree, lamp, bench |
| 3,4 | 80.4 | 65.9 | shopSurround | mid | 0.999 | 3 | flower, postbox, animal | tree, lamp, decoration, bench |
| 4,4 | 84.3 | 46 | shopSurround | mid | 0.857 | 3 | flower, bench, lamp, postbox, animal, decoration | tree |
| 5,4 | 81.4 | 50.8 | shopSurround | mid | 0.891 | 3 | flower, bench, postbox, animal, decoration | tree, lamp |
| 6,4 | 87.1 | 64.2 | shopSurround | mid | 0.987 | 3 | flower | tree, bench, lamp, postbox, animal, decoration |
| 7,4 | 100 | 12 | riverApproach | background | 0.593 | 6(RIVER_CELLS_UNLOCK) | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 0,5 | 87.5 | 89.75 | riverApproach | foreground | 1.140 | 6(RIVER_CELLS_UNLOCK) | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 1,5 | 80.5 | 27.25 | riverApproach | background | 0.647 | 6(RIVER_CELLS_UNLOCK) | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 2,5 | 62.2 | 8 | schoolLawn | background | 0.579 | 7 | flower, lamp, postbox, animal, decoration | tree, bench |
| 3,5 | 28 | 8 | schoolLawn | background | 0.579 | 7 | tree, flower, bench, lamp, postbox, animal, decoration | (none) |
| 4,5 | 62.4 | 20 | schoolLawn | background | 0.621 | 7 | flower, lamp, postbox, animal, decoration | tree, bench |
| 5,5 | 84 | 6 | towerGreen | background | 0.571 | 8 | flower, lamp, postbox, animal, decoration | tree, bench |
| 6,5 | 84 | 17.2 | towerGreen | background | 0.611 | 8 | flower, lamp, postbox, animal, decoration | tree, bench |
| 7,5 | 14.75 | 94 | foregroundVerge | foreground | 1.165 | 1 | flower, lamp, postbox, animal, decoration | tree, bench |

집계: frontGarden 10 / houseLawn 8 / villageLane 5 / squarePerimeter 8 /
cafeEdge 3 / shopSurround 4 / riverApproach 3 / schoolLawn 3 /
towerGreen 2 / foregroundVerge 1 = **47**. `tree` recommended 13칸,
`bench` recommended 19칸. `recommended: []`인 칸 0개. 자기 zone 리전
밖인 칸 1개(`7,2`, 위 "자기 zone 밖 예외" 참고).

## 검증

- `node scripts/testTownPlacementContract.mjs` — **690개 단언, PASS 690
  / FAIL 0**(자기 zone 리전 포함 단언 추가로 617 -> 690).
- `node scripts/testTownWorldContract.mjs` — **96개 단언, PASS 96 /
  FAIL 0**(toUniform/distanceToPolylineUniform/nearestPathUniform 검증
  9개 추가로 87 -> 96, 기존 87개는 전부 unchanged).
- 회귀: `node scripts/testTownSceneV2.mjs`(259/259, unchanged).
- `npm run build` 통과(이 모듈은 아직 아무 곳에서도 import되지 않아
  번들 크기/그래프에 영향 없음).
