
# Paul Town 월드 레이아웃 재설계 (2026-09-16)

> 상태: 설계 문서(디자인 전용, 코드/DB/경제/플래그 변경 0). 근거는
> `WORLD_DESIGN_BRIEF.md`(2026-09-16, lead 확정본, main `9eec10d` 기준
> 코드 감사 포함)이며, 이 브리프가 유일한 진실 원천이다 — 이 문서는
> 브리프를 반박하지 않고, 브리프가 "작성자가 정한다"고 위임한 숫자
> (셀→앵커 좌표, 로트 좌표 등)만 이 문서가 구체적으로 확정한다. 참고
> 문서: `ONE_TOWN_CONSOLIDATION_PLAN.md`(레거시/V1/V2 통합 로드맵),
> `V2B_V2C_ROADMAP.md`(V2 폴리시 작업 단위 분해).

## 0. 상태/범위

- **디자인 전용.** 이번 산출물은 (1) 이 문서, (2) `wireframe/
  paul-town-world-wireframe.html` 두 파일뿐이다. `src/`, `api/`,
  SQL, 테스트 코드는 단 한 줄도 바꾸지 않는다.
- **`paulTownV2` 플래그는 OFF로 유지한다.** 이 재설계는 V2 렌더러
  (`src/components/town/v2/*`)를 대체하는 차기 구현 대상이지 지금
  당장 배포되는 코드가 아니다.
- **보존해야 하는 기능**(브리프 §9 원문, 그대로 인용):

  > Paul Dollar 잔액/earning logic, Stars, XP, rewards, purchases,
  > ownership, inventory, placement persistence, townPlacements,
  > townRemovedIds, idempotency keys, level thresholds, prices,
  > student isolation (UUID identity). No Production student data
  > changes, no purchase tests, no SQL/migrations, no flag changes,
  > no deploy/merge.

- 학생 대상 신규 기능/게임화는 이 작업 범위에 없다(`CLAUDE.md` 규칙
  12) — 이 재설계는 **같은 시스템(별/레벨/Paul Dollar/gardenPoints)을
  더 나은 그림으로 보여주는 시각 계층 교체**이지, 새 보상/화폐/퀘스트가
  아니다.

## 1. [TASK 1] 현재 V2 씬 감사

아래 6개 문제는 브리프 §1의 진단을 그대로 따르되, 이번 세션에서 직접
코드를 읽어 확인한 파일:줄 인용을 덧붙인다. V1(`TownGrid.jsx`, Pilot A가
실제로 보는 경로, `paulTownV2` OFF)의 대응/차이도 각 항목 끝에 붙인다.

| # | 증상 | 원인(파일:줄) | 왜 "보드"로 읽히는가 |
|---|---|---|---|
| 1 | 사각형 보드 | `TownScene.jsx:86-87`(`rounded-[28px] card-shadow`, `style={{aspectRatio:'8/13'}}`) | 화면 크기와 무관하게 고정 비율 하나의 둥근 상자에 전부를 담아, 지평선·하늘·원근이 애초에 존재할 자리가 없다 |
| 2 | 지형이 서로 분리됨 | `TownGroundLayer.jsx:34`(단일 수직 그라데이션) + `:17-24`(BLOBS 6개, `blur-2xl opacity-60`) + `:56-59`(inset 링) + `:60-63`(상단 헤지 밴드) — `TownPathLayer.jsx` 전체(1-39행)가 별도 파일/레이어로 독립 렌더 | 블롭은 블러 처리돼 거의 안 보이고, 안쪽 링 + 상단 헤지 밴드가 "액자 테두리"로 읽힌다. 길(Path)은 바닥과 색/질감으로 이어지지 않는 얹혀진 밴드일 뿐이다 |
| 3 | 수평 길 띠 | `townScene.js:21`(`LANE_ROW = Math.floor(TOWN_GRID.rows/2)` = 3행) + `TownPathLayer.jsx:22-25`(`left-2 right-2`, `laneTopPct`≈50%, `laneHeightPct`≈16.7% — 전체 폭을 가로지르는 알약형) + `:26-36`(집까지의 짧은 세로 스퍼만 있고 반대쪽 끝엔 아무 목적지도 없음) | 길이 화면 폭 전체(거의 8칸 전부)를 가로지르는 굵은 띠인데 어느 쪽 끝에도 도착지가 없다 — `FOOTPRINT_CLASS.lg`(`townScene.js:89`, 폭 19%)인 집보다 시각적으로 더 두꺼운 요소가 화면을 관통한다 |
| 4 | 빈 공간 | `townScene.js:213-225`(`freeAnchors()`가 최대 47개 빈 칸 반환) + `townScene.js:88-92`(FOOTPRINT lg 19%/md 14%/sm 11%, 배치돼야 뭔가 보임) + `TownFogLayer.jsx:11,14`(`FOG_START_ROW=4` 두 행 전체가 조건부 안개) + `TownAmbientLayer.jsx:26-32,49-65`(장식은 집 옆 30%×22% 타원 하나에 이모지 군집뿐) | Lv1-3 학생은 아이템을 1-4개만 갖고 있는데 칸은 48개다. 아무것도 놓이지 않은 칸엔 정말 아무것도 그려지지 않는다(고정 배경 자체가 텅 빔) |
| 5 | 약한 My House | `townScene.js:113-118`(`HOME_SPRITE.footprint = 'lg'`, 카탈로그의 book-shop/cafe/school/clock-tower/bridge와 동일 크기 등급) + `townScene.js:95-99`(`footprintFor()`가 category만 보고 크기를 정함 — 집이라고 더 크게 취급하지 않음) + `TownObjectLayer.jsx:31,39-40`(FOOTPRINT_CLASS lg 적용 후 `scale-[1.3]` + 앰버 halo) | 집이 "특별 건물"이 아니라 그냥 lg 등급 아이템 중 하나로 취급된다. 브리프 §0이 지적하듯 my-house 에셋 자체도 정원이 캔버스 안에 이미 녹아 있어 코티지 몸체가 더 작다 |
| 6 | 스케일/원근/스타일 불일치 | `townScene.js:88-100`(footprint 3등급이 카테고리만으로 정해짐, 실제 에셋 원본 크기 무시) + `TownSprite.jsx:41,57`(이미지든 이모지 폴백이든 예외 없이 동일한 CSS 타원 그림자, 광원 방향과 무관) + `townScene.js` 전체에 깊이(depth)별 스케일 변수 부재(`Z_LAYERS.objects`는 단일 값, `zIndexFor()`도 그리기 순서만 바꿀 뿐 크기는 그대로) | 정면 샷 상점/3·4쿼터 코티지/탑다운 정원 타일/사진 배경/이모지 폴백이 한 화면에 섞이고, 모두 동일한 규칙 기반 그림자를 지니는데 그 규칙이 실제 조명과 무관하다 |

**V1(`TownGrid.jsx`, Pilot A 실사용 경로) 차이점** — V2와 근본 구조는
같지만(8×6 CSS `grid`, `gridTemplateColumns: repeat(8, minmax(40px,1fr))`,
`TownGrid.jsx:139-141`) 두 가지가 다르다: (a) 하늘/헤지 배경이 사진
이미지(`village-sky-backdrop.webp`, `village-hedge-border.webp`,
`TownGrid.jsx:129-138`)로 grid 컨테이너 "위"에 별도 헤더 띠로 얹혀 있어
격자 자체와 물리적으로 분리된 밴드로 더 뚜렷하게 보이고, (b) My House가
에셋조차 없이 `🏠` 이모지 그대로다(`TownGrid.jsx:210`, `CellSprite`는
`placed`(구매·배치된 아이템)에만 쓰이고 홈 셀은 아예 분기 밖에 있다) —
즉 V1은 V2보다 집이 더 약하다. 정원 장식 스프라이트 3개(사용자 승인
아트, `GARDEN_ACCENTS`, `TownGrid.jsx:49-53`)와 실제 자갈길 텍스처
타일(`village-cobblestone-tile.webp`, `TownGrid.jsx:39-43`)이 V2의 CSS
전용 처리보다 사진적으로는 더 완성돼 보이지만, 여전히 균일한 8×6
`grid`(gap 4px) 안에 얹혀 있어 셀 리듬 자체는 사라지지 않는다.

## 2. [TASK 2] 월드 구조

**아트 디렉션 목표(레퍼런스 이미지는 화풍 기준일 뿐 배치/UI를 그대로
베끼지 않는다)**: reference-grade rich painterly storybook
illustration, no hard outlines, not photoreal, readable at phone
scale — 즉 레퍼런스 이미지(`마을그림.png`) 수준의 고밀도 페인터리
스토리북 일러스트를 목표 화풍으로 삼는다. 아웃라인 없이, 사진처럼
보이지 않으면서도, 손바닥만 한 모바일 화면에서 축소해도 읽히는
디테일 밀도가 기준이다(단순한 카툰 톤 다운 아님).

브리프 §2의 5계층 구조(구조 월드 → 로트 위 고정 건물 → 배치 엔진
데코레이션 → 잠김/미래 구역 → 인터랙티브 목적지)를 그대로 채택한다.
아래는 브리프 §3의 구역(district) 표를 그대로 복사한 것이다 — 숫자는
브리프가 이미 확정했고, 이 문서는 바꾸지 않는다.

| id | name | height ×W | sprite scale | unlock | contents |
|---|---|---|---|---|---|
| tower | Clock Tower & hills/sky | 0.95 | 0.56 | Lv8 | sky, far hills, distant rooftops, Clock Tower lot centre, path ends at tower square |
| school | English School | 0.80 | 0.64 | Lv7 | School lot centre-left, courtyard, school garden, path enters bottom-centre exits top-right |
| river | River & Stone Bridge | 0.50 | 0.70 | Lv6 | stream across band, Bridge lot centre, ducks (P2), path crosses bridge |
| square | Village Square & Café | 0.90 | 0.76 | Lv5 | Café lot right, Stone Fountain lot centre, flower ring, benches spots, path enters bottom-left, circles fountain, exits top-centre |
| lane | Book Shop Lane | 0.85 | 0.86 | Lv3 | Book Shop lot left-mid, reading garden right, lamp/post-box spots along path, path enters bottom-right exits top-left |
| home | My Home & Garden | 1.15 | 1.00 | Lv1 | cottage lot centre (baseline 66% of band), front garden + 2 baked flower beds, hedge boundary L/R/bottom, front gate bottom-centre, path bottom-centre → door → curves up-right, exits top-right |
| fog | (virtual) fog horizon | 0.32 | — | — | misty continuation of the path + silhouette of next destination + chip |

**경로 연속성(snake, 브리프 §3 그대로)**: home 상단-우측(x≈78%) 진출 →
lane 하단-우측 진입, 상단-좌측(x≈22%) 진출 → square 하단-좌측 진입,
상단-중앙(50%) 진출 → river 다리 중앙 → school 하단-중앙 진입,
상단-우측(≈70%) 진출 → tower 하단-우측 진입, 탑 광장에서 종료. 길 폭은
home에서 13%W이고 구역 깊이 스케일을 그대로 곱해 좁아진다(lane
≈11.2%, square ≈9.9%, river ≈9.1%, school ≈8.3%, tower ≈7.3%). 길은
별도 레이어가 아니라 각 구역 판(plate) 안에 함께 그려진다(감사 2번
문제의 직접적 해결책).

**2026-09-16 3차 수정 — home 밴드 내부 경로 모양**: home 안에서는
길이 코티지를 정면으로 가로지르지 않도록 포크(fork) 구조를 쓴다 —
정문(50%,100%)에서 곧장 올라가 포크(50%,84%)에 이르고, 거기서 두
갈래로 나뉜다: (1) 짧은 디딤돌 스텁(폭 8%W, 메인 경로보다 좁음)이
그대로 직진해 현관 앞(50%,72%)에서 끝나고, (2) 메인 경로(폭 13%W)는
포크에서 대각선 베지어 3구간(제어점 (70,82)→(82,75), (90,58)→(92,44),
(87,18)→(78,0))으로 꺾여 코티지 로트 오른쪽을 감싼 뒤 상단-우측
(78%,0%)으로 진출한다(초안은 (66,80)/(82,62)/(85,44) 경유였으나,
(4,2) Kinney 스팟과의 여유가 부족해 오른쪽으로 조금 더 밀어 지금
값으로 확정했다). 메인 경로는 코티지 로트 바운딩박스·(2,2)/(4,2)
스팟·디딤돌 스텁(포크 지점 제외) 모두와 항상 ≥8%W 이상 떨어지도록
좌표를 잡았다(구체적 제어점은 `paul-town-world-wireframe.html`의
`PATHS.home`/`STUBS.home` 참고, Playwright 실측 검증은 아래 §3
"3차 수정" 절 참고). 이 교정 이전에는 메인 경로가 현관 앞에서
그대로 오른쪽으로 수평 이동해 Kinney 나무 (4,2)·"MY HOUSE" 라벨·
현관 자체를 가리는 문제가 있었다.

**원근/스케일 표(브리프 §3 relative-scale-guide, 요약 재구성)**:

| 요소 | home 기준 폭(%W) | 비고 |
|---|---|---|
| cottage | 42 | 문/온기창/굴뚝/작은 앞뜰/헤지·펜스/현관 돌길 필수 |
| tree | 20 | 높이 ≈ cottage 높이의 0.9배 |
| flower-garden | 18×8 | |
| bench | 13 | |
| street-lamp | 6 | 높이 ≈ cottage 높이의 0.6배 |
| red-post-box | 6 | |
| town-sign | 9 | |
| cat/puppy | 8 | |
| owl | 6 | |
| Book Shop(lane, ×0.86) | 36 | 구역 스케일 적용 전 값 |
| Café(square, ×0.76) | 34 | |
| fountain(square) | 16 | |
| bridge(river) | 44 | |
| school(×0.64) | 40 | |
| clock tower(×0.56) | 16 wide × 44 tall | |

**My House의 역할**: 폭 42%W(≈150px@390, ≈138px@360, ≈167px@430) —
첫 화면(Lv1, home+fog)에서 씬 전체 넓이의 약 25%를 차지한다. 반드시
문·따뜻한 창문·굴뚝·작은 앞뜰·헤지/펜스·현관까지의 돌길을 보여줘야
한다. 스프라이트 자체는 코티지 본체 + 현관 계단만 담당하고, 화단/헤지/
길은 판(plate)에 함께 그려 정원 생기(garden-stage) 오버레이와 데코
아이템이 그 주변에 자연스럽게 얹히게 한다.

**고정 요소 vs 커스터마이즈 가능 요소(브리프 §2)**: 구조 월드(바닥,
잔디, 헤지/돌 경계, 길, 강, 언덕, 하늘, 빈 건물 로트, 화단 흙바닥)는
배치 불가·구매 불가. My House/Book Shop/Café/Stone Bridge/English
School/Clock Tower/Stone Fountain은 "로트 위 고정 건물" — 카탈로그의
동일 아이템을 Paul Dollar로 구매하는 것은 그대로지만, 배치 엔진으로
자유롭게 옮길 수 없다(아래 OWNER DECISION A). tree/flower-garden/bench/
street-lamp/red-post-box/town-sign/shop-lamp/cat/puppy/owl은 기존
배치 엔진(`townLayout.js` placeItem/moveItem/storeItem, 8×6 좌표
불변)으로 그대로 커스터마이즈 가능.

**OWNER DECISION A vs B(브리프가 이미 A를 권고, 여기서 근거 재정리)**:

- **A(권고, 채택)**: 건물은 구역별 로트 하나에 고정 렌더 — 소유 시
  로트 위에 건물이 그려지고, 레벨은 열렸지만 미구매면 기초(foundation)
  + "for sale" 나무 표지판 + 가격이 상점에 표시되고, 레벨 자체가
  안 열렸으면 안개 지평선 뒤 실루엣만 보인다.
- **B(기각)**: 건물도 데코레이션처럼 8×6 아무 칸에나 자유 배치.
- **A를 권고하는 이유**: (1) 감사 5번 "약한 My House" 문제의 근본
  원인이 "집도 그냥 lg 등급 배치 아이템 중 하나"였다는 것인데, B를
  유지하면 이 문제가 새 아트로도 재발한다 — 건물은 지형(길/광장 위치)
  과 서사적으로 묶여 있어야 한다(예: Book Shop은 Book Shop Lane의
  길가에, Café/분수는 광장 중앙에). (2) 배치 엔진 자유도가 실제로
  쓰이는 사례는 데코레이션(나무/벤치/가로등 등)이지 건물이 아니다 —
  Pilot A 실데이터(브리프 §0)에도 건물 재배치 기록이 없다. (3) B를
  유지하면 학생이 Café를 강 한가운데 놓는 등 "판(plate)에 그려진 길·
  다리·화단"과 어긋나는 배치가 가능해져, 이번 재설계의 핵심 목표(지형과
  오브젝트가 하나로 이어져 보이는 것)를 스스로 깨뜨린다. **레거시
  데이터 호환**: 이미 `townPlacements`에 건물 배치 레코드가 있어도
  데이터는 그대로 두고(삭제/마이그레이션 없음), 새 렌더러가 그 칸을
  무시하고 로트만 그린다(Pilot A 실데이터 기준 Kinney의 나무 1개
  (4,2)만 존재 — 건물 배치 레코드 자체가 없어 리스크 없음).

**인터랙티브 목적지(P2, 이번 범위 아님)**: Book Shop 탭 → 책장 화면,
Clock Tower 탭 → 타임머신 화면처럼 레거시 `PaulTown.jsx`의 건물 카드와
유사한 라우팅은 `ONE_TOWN_CONSOLIDATION_PLAN.md` §2 7번 행이 이미
"MERGE INTO V2"로 판정해 둔 항목이다 — 이번 문서에서는 로트/실루엣
렌더링까지만 다루고 탭 인터랙션은 다음 단계로 미룬다.

## 3. 데코레이션 스팟 맵 (cell → world anchor)

브리프 §4가 위임한 대로, 이 문서가 정확한 좌표를 확정한다. 규칙 요약
(브리프 §4): y=0,1,2 → home(23개 스팟, (3,2)는 집 로트), y=3 → lane
(8개), y=4 → square(8개), y=5 → river/school/tower(8개: river 2 +
school 3 + tower 3). 모든 값은 **그 구역(district) 밴드 기준 퍼센트**
(left% = 밴드 폭 대비, top% = 밴드 높이 대비 baseline/bottom-anchor
위치)이며 격자(lattice)가 아니라 수작업 배치다. home 밴드 제약(브리프
그대로): (2,2)·(4,2)는 코티지와 같은 baseline 높이(🌳 🏡 🌳), row 2는
전경 top 62-92%, row 1은 집 옆면 top 34-58%, row 0은 집 뒤편(배경) top
14-28%.

**추가 설계 결정(브리프가 명시하지 않아 이번 문서가 정함)**: home
밴드는 유일하게 3개 행(y=0,1,2)을 갖는 구역이라, 같은 구역 안에서도
행(row)별로 "얼마나 가까운가"가 다르다 — 이를 반영해 구역 스케일
(1.00)에 행별 깊이 보정 배수를 곱한다: row 2(전경) ×1.00, row 1(옆면)
×0.90, row 0(배경) ×0.82. lane/square/river/school/tower는 각자
스팟 행이 하나뿐이라 이 보정이 필요 없다(구역 스케일 그대로 적용).
**스팟 간 최소 간격(44px 탭 타겟, 40px 간격)은 이 문서가 1차값을
제안하되, 실제 검증은 브리프 §10 구현 계획 6번의 "spot-map coverage
test"(자동화 테스트)가 최종 게이트다** — 와이어프레임은 개념 증명이지
프로덕션 좌표 확정이 아니므로, 최종 px 간격은 실제 에셋 풋프린트가
정해진 뒤 그 테스트로 재검증한다.

### 3.1 로트(고정 건물) 표

| building | district | left% | top%(baseline) | width%(구역 스케일 적용 전, W 기준) |
|---|---|---|---|---|
| My House | home | 50 | 66 | 42 |
| Book Shop | lane | 30 | 62 | 36 |
| Café | square | 78 | 60 | 34 |
| Stone Fountain | square | 50 | 55 | 16 |
| Stone Bridge | river | 50 | 50 | 44 |
| English School | school | 38 | 55 | 40 |
| Clock Tower | tower | 50 | 60 | 16 |

### 3.2 셀 → 앵커 표 (48칸 전체)

scale 열은 "구역 스케일 × home 행별 보정"의 최종값이다.

| (x,y) | district | left% | top%(baseline) | scale |
|---|---|---|---|---|
| (0,0) | home | 3 | 22 | 0.82 |
| (1,0) | home | 17 | 15 | 0.82 |
| (2,0) | home | 33 | 26 | 0.82 |
| (3,0) | home | 46 | 16 | 0.82 |
| (4,0) | home | 58 | 24 | 0.82 |
| (5,0) | home | 72 | 14 | 0.82 |
| (6,0) | home | 73 | 27 | 0.82 |
| (7,0) | home | 97 | 19 | 0.82 |
| (0,1) | home | 7 | 37 | 0.90 |
| (1,1) | home | 15 | 45 | 0.90 |
| (2,1) | home | 23 | 53 | 0.90 |
| (3,1) | home | 11 | 58 | 0.90 |
| (4,1) | home | 72 | 34 | 0.90 |
| (5,1) | home | 80 | 46 | 0.90 |
| (6,1) | home | 73 | 58 | 0.90 |
| (7,1) | home | 28 | 40 | 0.90 |
| (0,2) | home | 5 | 84 | 1.00 |
| (1,2) | home | 15 | 72 | 1.00 |
| (2,2) | home | 25 | 66 | 1.00 |
| (3,2) | **home lot(My House)** | 50 | 66 | 1.00 |
| (4,2) | home | 75 | 66 | 1.00 |
| (5,2) | home | 80 | 90 | 1.00 |
| (6,2) | home | 93 | 86 | 1.00 |
| (7,2) | home | 66 | 95 | 1.00 |
| (0,3) | lane | 8 | 30 | 0.86 |
| (1,3) | lane | 18 | 55 | 0.86 |
| (2,3) | lane | 12 | 78 | 0.86 |
| (3,3) | lane | 60 | 25 | 0.86 |
| (4,3) | lane | 72 | 45 | 0.86 |
| (5,3) | lane | 82 | 68 | 0.86 |
| (6,3) | lane | 90 | 85 | 0.86 |
| (7,3) | lane | 48 | 88 | 0.86 |
| (0,4) | square | 10 | 35 | 0.76 |
| (1,4) | square | 20 | 60 | 0.76 |
| (2,4) | square | 93 | 55 | 0.76 |
| (3,4) | square | 85 | 75 | 0.76 |
| (4,4) | square | 65 | 28 | 0.76 |
| (5,4) | square | 68 | 82 | 0.76 |
| (6,4) | square | 88 | 35 | 0.76 |
| (7,4) | square | 45 | 90 | 0.76 |
| (0,5) | river | 15 | 55 | 0.70 |
| (1,5) | river | 85 | 55 | 0.70 |
| (2,5) | school | 12 | 70 | 0.64 |
| (3,5) | school | 85 | 40 | 0.64 |
| (4,5) | school | 78 | 75 | 0.64 |
| (5,5) | tower | 20 | 50 | 0.56 |
| (6,5) | tower | 75 | 45 | 0.56 |
| (7,5) | tower | 80 | 85 | 0.56 |

이 표는 `wireframe/paul-town-world-wireframe.html`의 `SPOT_MAP`/`LOTS`
JS 상수와 숫자가 동일하다(스크린샷과 표를 1:1로 대조할 수 있게 하기
위함). Pilot A 실데이터(Kinney의 나무, (4,2))는 이 표에서 home 구역
left75/top66/scale1.00 지점에 그려지며, 좌우 트리 슬롯 중 "집 오른쪽"
자리와 일치한다 — 기존 배치가 새 레이아웃에서도 자연스러운 자리로
떨어진다(우연이 아니라 §2의 "(2,2)/(4,2) = 집 좌우 나무" 규칙을 그대로
따른 결과).

**2026-09-16 3차 수정 — 스팟 재배치(9개) + 실측 검증 방법**:
home 밴드의 메인 경로를 정문→포크→코티지 오른쪽을 감싸는 대각선(아래
"경로" 절 참고)으로 다시 그리면서, 새 경로와 너무 가까워진(중심선
기준 반경 < 경로 폭의 절반 + 4%W) 스팟을 옮겼다. 초안은 손 계산(볼록껍질
경계 기반)으로 했지만, 최종 확정은 Playwright로 `wireframe/
paul-town-world-wireframe.html`을 실제로 headless 렌더해 360/390/430 ×
Lv1/3/5/6/7/8 전 조합에서 `console.warn` 로그를 수집하는 방식으로
검증했다(`computeSpotWarnings()`가 매 렌더마다 자동 실행) — 이 실측
과정에서 손 계산이 놓쳤던 square 구역 2개((2,4)/(3,4), Lv5부터 활성)와
tower 구역 1개((7,5), Lv8) 위반도 추가로 발견해 함께 옮겼다. home
row1의 1차 재배치안(4,1/5,1/6,1/7,1)은 경로 회피만 계산하고 코티지
로트 바운딩박스 회피를 빠뜨려 스크린샷에서 지붕/창문 위에 점이 얹히는
2차 결함을 냈다 — 코티지 우측의 좁은 회랑(x 71~81%대)과 기존 좌측
군집 사이 빈틈(28/40)을 다시 계산해 최종값으로 교정했다.

(4,2) Kinney 나무는 옮기지 않았다 — 실제 Pilot A 데이터를 대표하는
스팟이라 임의 재배치 대상이 아니며, §2가 명시한 "(2,2)/(4,2)는
경로에서 8%W 이상 떨어져야 한다"는 개별 규칙은 새 경로에서도
만족한다(여유 ≈9.9%W). 다만 이번 절이 새로 추가한 일반 규칙(모든
스팟은 경로 폭의 절반+4%W 이상) 기준으로는 실측 결과 390px에서
36.8px(필요 37.6px) — 약 0.8px 부족해 `console.warn`은 계속 뜨지만,
와이어프레임은 의도적으로 이 스팟만 빨간 링 표시에서 제외한다(실제
학생 데이터를 "고장난 것처럼" 보이게 하지 않기 위함, `render()`의
`spotWarnings.delete('4,2')` 주석 참고). 코드보다 더 정확한 값을
원하면 홈 경로를 아주 약간 더 밀어내는 후속 조정이 가능하다.

| 스팟 | 이전(left/top) | 이후(left/top) | 사유 |
|---|---|---|---|
| (6,0) | 85/27 | 73/27 | 새 경로가 top14-28 구간에서 x≈84-89%를 지남 |
| (4,1) | 81/39 | 72/34 | 코티지 로트(x29-71) 우측 회랑으로 이동(경로+집 동시 회피) |
| (5,1) | 89/47 | 80/46 | 〃 |
| (6,1) | 94/55 | 73/58 | 〃 |
| (7,1) | 92/33 | 28/40 | 좌측 기존 군집과 코티지 좌측 경계 사이의 빈틈으로 이동 |
| (5,2) | 85/74 | 80/90 | 포크(50,84)~디딤돌 스텁(50,72) 및 경로 분기점(82,75)과 근접 |
| (2,4) | 32/80 | 93/55 | (Playwright 실측으로 발견) square 경로가 좌측 진입~분수 회랑을 지남 |
| (3,4) | 35/30 | 85/75 | (Playwright 실측으로 발견) 〃 |
| (7,5) | 50/80 | 80/85 | (Playwright 실측으로 발견) tower 경로 종점(광장 앞) 부근과 근접 |

**"MY HOUSE 42%W" 라벨**: 이전엔 로트 가로 중앙(디딤돌 스텁이 지나는
바로 그 x=50% 지점) 기준으로 정렬돼 있어 텍스트가 디딤돌과 겹쳤다.
로트 로컬 좌표 `left:-9%`로 왼쪽으로 옮겨 라벨 우측 끝이 디딤돌
좌표보다 항상 왼쪽에 오도록(390px 기준 여유 ≈10px, 360px 기준
≈3px) 고쳤다.

## 4. 레벨 확장

브리프 §5를 그대로 따른다.

- **Lv1 MY HOME**: home 판 + 코티지 + 안개 지평선(Book Shop 실루엣 +
  칩). 아이만 있고 나머지는 구경뿐.
- **Lv2**: 새 구역 없음 — cat/street-lamp/red-post-box 구매 가능,
  화단 스팟이 풍성해짐.
- **Lv3 BOOK SHOP LANE**: 안개가 걷히고 home 위에 lane 판 등장 —
  Book Shop 로트(미구매 시 "for sale" 표지판, $120), 리딩 가든, 벤치/
  가로등/우체통 스팟. 안개 지평선은 이제 Café/분수 실루엣.
- **Lv4**: 새 구역 없음 — puppy/owl 구매 가능.
- **Lv5 VILLAGE SQUARE**: square 판 — Café 로트, 분수 로트, 꽃 링,
  마을이 붐비기 시작.
- **Lv6 STONE BRIDGE**: river 판 — 다리 로트, 길이 물에 닿음.
- **Lv7 ENGLISH SCHOOL**: school 판 — 학교 로트, 안뜰, 학교 정원.
- **Lv8 CLOCK TOWER**: tower 판(하늘/언덕 포함) — 시계탑 로트, 소유
  건물 전체에 풍성함 기반 조명 오버레이 활성화(P1).
- **Lv9/10**: 새 구역/아이템 없음 — 환경 풍성함만(P2: 새, 계절 개화).

**학습 = 생명(gardenPoints) 매핑**(임계값 불변, `townScene.js:120`
`GARDEN_STAGE_THRESHOLDS=[0,10,30,60,100]`):

| gardenPoints | 효과 | 위치 |
|---|---|---|
| 0-9 | stage 0 화단(빈 화단 + 새싹 하나) | home 판의 baked 화단 2곳 |
| 10-29 | stage 1-2 화단(꽃 피기 시작) | 〃 |
| ≥30 | 창문 warm light 오버레이(`my-house-lights`, P1) | 코티지 |
| 30-59 | stage 3 화단 | 화단 |
| ≥60 | 담쟁이(ivy) 오버레이(P2) | 코티지 |
| 60-99 | stage 4 화단(풀 만개) | 화단 |
| ≥100 | 새(birds) 스프라이트(P2) | 코티지 주변 |

P2 확장: 풍성함이 구역 판 자체도 밝혀준다(가로등 바구니 개화, 카페
화분 등) — 설계만, 이번 구현 범위 아님.

**다음 목표 가시성**: 안개 지평선 칩은 기존 `nearGoal()`/`fogState()`
(`townScene.js:179-193`, `:199-207`) 텍스트를 그대로 쓴다 — 새 계산
로직 없음. 실루엣은 다음 구역의 대표 건물 스프라이트를 CSS 그레이스케일/
블러 필터로 흐리게 보여주는 것뿐(새 에셋 불필요).

**동기부여 가드레일**(브리프 그대로): 스트릭 처벌, 룰렛/가챠, 도박성
요소, 타이머, 퀘스트, 파밍 없음. 영어 학습이 항상 주(primary) 동선.

## 5. 모바일 레이아웃

브리프 §6 숫자 그대로.

| 폭 | 씬 폭 W | home 밴드 높이 | Lv1 전체 높이(home+fog) |
|---|---|---|---|
| 360 | 328 | 377 | 482 |
| 390 | 358 | 412 | 526 |
| 430 | 398 | 458 | 585 |

360×640에서는 Lv1도 약 90px 스크롤이 필요하지만(482+HUD 56 ≈ 538 >
640-여유), 코티지 자체는 로드 시점에 이미 완전히 보인다(브리프
"cottage still fully visible on load"). 레벨이 올라갈수록 전체 씬
높이(×W 배수)는 Lv1-2: 1.47 → Lv3-4: 2.32 → Lv5: 3.22 → Lv6: 3.72 →
Lv7: 4.52 → Lv8+: 5.15(안개 없음)로 늘어난다 — 이 문서 §3의 표는
이 각 레벨에서 어떤 구역까지 렌더되는지를 그대로 따른다(레벨별 표시
구역은 §2 표의 `unlock` 열).

**가로 모드(844×390)**: 씬 최대 폭 512px로 캡, 동일한 세로 스택 유지
(가로 스크롤/패닝은 절대 없음). **safe-area**: `env(safe-area-inset-*)`
존중(기존 V2 `TownScreenV2.jsx:145`의 `pb-[max(6rem,env(safe-area-inset-bottom))]`
관례와 동일 정신, 재설계 후에도 유지).

**화면 순서**: HUD(레벨 칩 + 별 바 + $ 칩, ≤56px) → 씬(홈 구역이 보이는
상태로 시작) → 폴 가이드(씬 좌하단에 작은 말풍선, 기존 공식 리액션
이미지 재사용, 새로 그리지 않음) → 상점/보관함 바텀시트(기존
`TownSheet.jsx` 그대로). 현재 `TownScreenV2.jsx:144-195`는 HUD →
PaulGuide(큰 카드) → 토스트 → 모드 배너 → 씬 순서라 씬이 390px 기준
약 520px 아래에서 시작한다(감사 결과, "below the fold") — 재설계는
이 순서를 HUD → 씬 → (작은) 폴 말풍선으로 뒤집어 씬을 첫 화면에
바로 보이게 한다.

## 6. 자산 분류

브리프 §7 + §0 contact sheet 사실을 근거로 재구성.

| 분류 | 에셋 | 이유(한 줄) |
|---|---|---|
| TEMPORARY | animals/cat, animals/puppy, animals/owl | **2026-09-16 리드 업데이트로 KEEP→TEMPORARY 재분류.** 레퍼런스 이미지(`마을그림.png`)가 1차 화풍 기준이고 그 목표는 §2 "아트 디렉션 목표"의 rich painterly storybook illustration인데, 현재 동물 세트는 그보다 단순한 카툰체라 목표 해상도/밀도에 못 미친다 — 서로 간에는 일관적이라 당장 자리 채우기는 가능하지만(P2 전까지 임시 사용), 매칭 세트 제작 시 반드시 재생성 대상 |
| TEMPORARY | buildings/book-shop, buildings/cafe, buildings/british-cottage | 정면 샷이라 3/4 탑다운 화풍과 다르지만 매칭 세트 나올 때까지 자리 채우기 용도로는 사용 가능 |
| TEMPORARY | special/english-school, special/clock-tower, special/bridge | 페인터리하고 스케일도 봐줄 만함(브리프 §0 "ok-ish") |
| TEMPORARY | nature/tree | 페인터리하지만 상대적으로 과대(over-large) |
| TEMPORARY | decorations/street-lamp, red-post-box, town-sign, stone-fountain, shop-lamp | 페인터리, 스케일 약간 안 맞지만 임시로 자리는 채움 |
| REPLACE | buildings/my-house | 너무 작고(정원이 캔버스에 녹아있음) 위계(집=특별)에 안 맞음 |
| REPLACE | nature/garden-stage-0..4 | 고립된 사각 돌 테두리 타일, 화단(soil)과 원근이 안 맞음 |
| REPLACE | backgrounds/village-sky-backdrop, village-hedge-border, village-cobblestone-tile, garden-accent-1..3 | 사진(photographic) 소재라 페인터리 매칭 세트와 미디어가 섞임 |
| REPLACE | 모든 이모지 폴백(최종 아트 기준) | 화풍 불일치, TownSprite.jsx의 임시 안전망일 뿐 |
| REPLACE | TownGroundLayer/TownPathLayer/TownFogLayer의 CSS 전용 처리 | §1 감사에서 지적한 "분리된 지형" 문제의 직접 원인 |

## 7. [TASK 6] 보존 시스템

브리프 §9 원문(§0에서 이미 인용한 것과 동일, 재확인 목적으로 반복):

> Paul Dollar 잔액/earning logic, Stars, XP, rewards, purchases,
> ownership, inventory, placement persistence, townPlacements,
> townRemovedIds, idempotency keys, level thresholds, prices,
> student isolation (UUID identity).

**DB 변경 필요: NO. 경제 변경: NO.** 이 재설계가 건드리는 것은 오직
`townScene.js`의 좌표 파생 함수와 렌더 컴포넌트뿐이다 — `townLayout.js`
(배치 저장), `townShop.js`/`useTownShop.js`(구매/잔액), `townLevel.js`
(레벨 임계), `townCatalog.js`(가격/ID)는 시그니처·데이터 형태 모두
그대로다.

## 8. [TASK 7] 제품 점검

> 2026-09-16 리드 2차 수정 — 아래 10문항은 운영자(오너)가 지정한
> 정확한 문항이다(이전 초안의 A~J는 이 세션이 임의로 구성한 것이라
> 교체했다 — 옛 문항은 §8b에 "저장소 안전 점검"으로 이름을 바꿔
> 그대로 남긴다). 각 문항은 이 설계에서 나온 근거 한 문장으로 YES/NO
> 판정한다.

| # | 점검 항목 | 판정 | 근거(한 줄) |
|---|---|---|---|
| A | 아이가 "내 집(My House)"을 바로 알아볼 수 있는가?(Can a child immediately identify "My House"?) | YES | §2 "My House의 역할"이 폭 42%W(첫 화면의 약 25%)를 명시하고, §10 와이어프레임 수정으로 문/따뜻한 창문 2개/굴뚝/현관 돌길이 붙은 하나의 코티지 실루엣으로 렌더되며(지붕이 몸체에서 분리돼 뜨는 버그를 수정), home 밴드가 항상 로드 시점 첫 화면에 보인다 |
| B | 화면이 보드가 아니라 마을처럼 보이는가?(Does the screen look like a village rather than a board?) | YES | §1이 지적한 6개 "보드" 원인(고정 8/13 박스+액자 테두리, 분리된 지형, 전체 폭 관통 길, 빈 칸, 약한 집, 불일치 스케일)을 §2~§3이 구역별 판+로트+수작업 스팟으로 대체했고, §10 와이어프레임 수정에서 길을 로트를 피해 굽이치는 베지어 곡선으로, 헤지를 가장자리를 따라 도는 스캘럽 라인으로, 안개를 실루엣 있는 미스트로 바꿔 "격자/액자" 인상을 제거했다 |
| C | 아이가 마을이 어디로 성장할지 볼 수 있는가?(Can the child see where the Town will grow?) | YES | §4 "다음 목표 가시성"과 안개 지평선(§2 fog district)이 항상 다음 구역의 실루엣 + "⭐ Lv.N에서 열려요" 칩을 최상단 잠긴 구역 바로 위에 보여준다(Lv8 전까지 항상 존재) |
| D | 공부가 환경을 눈에 띄게 개선하는가?(Does studying visibly improve the environment?) | YES | §4 "학습 = 생명 매핑" 표가 `gardenPoints`(배운 단어 수) 임계값 0/10/30/60/100을 화단 단계·창문 불빛·담쟁이·새로 직접 연결한다 — 화폐가 아니라 학습량 자체가 시각 변화를 만든다 |
| E | Paul Dollar가 의미 있는 용도를 갖는가?(Does Paul Dollar have a meaningful use?) | YES | §7이 보존을 명시한 Paul Dollar 구매/소유 경제가 그대로 유지되고, §2 OWNER DECISION A에서 건물도 "for-sale → built" 전환에 여전히 같은 카탈로그 구매가 필요하며, 데코레이션 10종도 여전히 구매 대상이다 |
| F | 아이가 마을 전체를 설계하지 않고도 개인화할 수 있는가?(Can children personalize without needing to design the whole Town?) | YES | §2 "고정 요소 vs 커스터마이즈 가능 요소"가 구조 월드(바닥/길/헤지/로트)는 고정, 데코레이션 10종(47개 스팟)만 배치 가능하도록 나눠 — 아이는 이미 완성된 마을에 소품만 얹는다 |
| G | 다음 목표가 보이는가?(Is the next goal visible?) | YES | C와 동일 근거(안개 칩) + §4 "다음 목표 가시성"이 기존 `nearGoal()`(`townScene.js:179-193`) 텍스트를 그대로 재사용해 "⭐ N 더 모으면 ~가 열려요" 문구를 HUD에도 노출 |
| H | 초등학생에게 충분히 단순한가?(Is the Town simple enough for elementary students?) | YES | §5가 세로 스크롤 전용(가로 패닝 없음), HUD ≤56px 3칩만, §2가 상호작용을 idle-탭(이동/보관)과 배치 모드 2가지로 한정 — 화면 수/제스처 종류를 늘리지 않는다 |
| I | 마을이 주(primary) 게임이 되지 않으면서 학습을 촉진하는가?(Does the Town encourage learning without becoming the primary game?) | YES | §4 "동기부여 가드레일"(스트릭 처벌/가챠/타이머/퀘스트/파밍 없음)과 §0(새 화폐·보상 없음, 기존 별/Paul Dollar/gardenPoints 축만 재사용) — 마을은 학습 결과의 전시대일 뿐 별도 루프가 아니다 |
| J | 아이가 자기 마을을 다른 학생에게 보여주고 싶어할 만한가?(Would a child plausibly want to show their Town to another student?) | YES | §2 "아트 디렉션 목표"(레퍼런스급 rich painterly storybook)와 6개의 뚜렷이 구분되는 구역(§2 구역표), 학습에 따라 눈에 보이게 자라는 정원(§4)이 "내가 키운 것을 자랑하고 싶은" 대상이 되도록 설계됐다 — 다만 이는 설계 의도이고 실측 검증(아이들이 실제로 보여주고 싶어하는지)은 이 문서 범위 밖이다 |

모두 YES이므로 위 설계를 수정할 필요는 없었다.

### 8b. 저장소 안전 점검(이전 초안 A~J, 참고용으로 유지)

> 이 세션이 처음에 임의로 구성했던 체크리스트다. 8절의 정식 문항이
> 아니라는 점을 제외하면 여전히 유효한 점검이라 삭제 대신 이름만
> 바꿔 남긴다 — `CLAUDE.md` 18개 규칙 관점의 안전 점검용.

| # | 점검 항목 | 판정 | 근거(한 줄) |
|---|---|---|---|
| A | 기존 저장 데이터(`townPlacements`/`townRemovedIds`)가 깨지는가? | YES(안전) | §2 OWNER DECISION A가 레거시 건물 배치 레코드를 삭제 대신 "무시하고 로트로 렌더"하도록 설계했고, 데코 아이템은 `anchorFor(x,y)`가 SPOT_MAP을 통해 계속 좌표를 해석하므로 어떤 (x,y)도 미해석 상태가 되지 않는다 |
| B | 가격/레벨 임계/카탈로그 ID가 바뀌는가? | YES(안 바뀜) | §2/§4/§7이 `townLevel.js`/`townCatalog.js`/DB `town_items` 값을 전부 그대로 인용, 새 값 도입 없음 |
| C | 학생 식별에 UUID를 쓰는가?(해당 여부 확인) | YES(해당 없음, 위반 아님) | 이 재설계는 학생 식별 로직 자체를 다루지 않음 — `studentData`/`townShop`가 이미 UUID 기반으로 배선돼 있고 그대로 통과시킴 |
| D | PIN/자격증명 컬럼을 클라이언트가 조회/로깅하는가? | YES(안 함) | 이 문서가 다루는 좌표/에셋 계층은 `pin_hash` 등과 무관, 관련 코드 경로 없음 |
| E | 플래그 OFF 상태에서 기존 V1 학생 경험이 그대로인가? | YES | §0 "paulTownV2 OFF 유지" — `TownGrid.jsx`(V1)는 이 문서가 손대는 파일 목록(§9)에 없음, `ONE_TOWN_CONSOLIDATION_PLAN.md`가 이미 V1을 별도 폴백 경로로 분리해 둠 |
| F | 신규 게임화(스트릭 처벌/가챠/타이머 등)가 섞였는가? | YES(안 섞임) | §4 "동기부여 가드레일" 절이 브리프 원문을 그대로 재확인, 새 화폐/퀘스트 없음(§0) |
| G | 모바일 360/390/430에서 오버플로/44px 미만 탭 타겟이 있는가? | YES(없음) | §5 표가 브리프 §6 숫자를 그대로 채택, §3의 "최소 간격은 자동화 테스트로 재검증" 각주로 실제 구현 시점 보장 |
| H | 접근성(스크린리더/aria) 회귀가 있는가? | YES(없음) | §2/§9가 기존 `role="group"`/`aria-label`/포커스 복귀 패턴(`TownScene.jsx:33-38,84-85`)을 유지 대상으로 명시, 새 레이어도 동일 관례를 따르도록 §9에 명기 |
| I | IP 안전(해리포터 등 프랜차이즈) 요소가 있는가? | YES(없음) | 브리프 §8 "IP SAFETY" 절을 그대로 채택, 이 문서는 새 아트를 발명하지 않고 브리프 규칙을 재인용만 함 |
| J | 롤백 가능한가(플래그 OFF 한 줄)? | YES | §0/§9 — `paulTownV2` 플래그가 이미 존재하고 이번 구현도 그 뒤에서만 이뤄질 것(브리프 §10) |

모두 YES이므로 위 설계를 수정할 필요는 없었다.

## 9. 구현 계획

브리프 §10을 그대로 따르되, 이번 문서가 확정한 좌표(§3)를 구현
1단계의 입력으로 명시한다.

1. `src/utils/town/townScene.js`(순수): `DISTRICTS`(id, unlockLevel,
   heightUnits, scale, lots[], spots[]) + `SPOT_MAP(x,y)` →
   `{district, leftPct, topPct}`(§3.2 표 그대로 하드코딩) 추가.
   `anchorFor(x,y)` 시그니처는 유지하되 내부에서 `SPOT_MAP`을 거치도록
   교체. 신규 `districtsVisible(level)`, `sceneHeightUnits(level)`,
   `lotState(item, level, ownedIds)`(`'hidden'|'for-sale'|'built'`),
   `fogState` → 지평선 밴드 데이터로 확장. 단위 테스트
   `scripts/testTownSceneV2.mjs`.
2. `src/components/town/v2/TownScene.jsx`: 고정 8/13 박스를 `<TownDistrict>`
   밴드의 세로 스택으로 교체(판 이미지 배경 + 절대배치 스프라이트).
   `TownGroundLayer.jsx`/`TownPathLayer.jsx`의 CSS 처리 제거,
   `TownFogLayer.jsx` → 지평선 밴드로 교체, `TownObjectLayer.jsx`는
   로트(건물) + 스팟(데코) 둘 다 구역 스케일을 적용해 렌더,
   `TownPlacementOverlay.jsx` → 열린 구역에서만 스팟 글로우. 이동/보관
   팝오버 UI와 모든 핸들러(§1에서 확인한 `TownScene.jsx:33-78`의 포커스
   복귀/Escape/바깥 탭 닫기 로직 포함)는 그대로 유지.
3. `TownScreenV2.jsx`: 순서를 HUD → 씬 → 폴 말풍선으로 재배치, 마운트
   시 home 밴드로 스크롤. 데이터 훅/effect(환영 가이드, 환영 선물,
   레벨업 감지 등, `TownScreenV2.jsx:55-96`)는 전부 그대로.
4. `TownSprite.jsx`: 매칭 세트 스프라이트일 때(매니페스트로 판별)
   CSS 타원 그림자를 생략(§1 문제 6의 직접 수정).
5. 에셋은 `src/assets/town/index.js` + `assetManifest.js` 항목으로
   배선(§6 키). 이모지 폴백은 그대로 보존.
6. 테스트: `scripts/testTownV2Static.mjs`(grid-cols 금지 계약 유지),
   `townV2.spec.mjs`(data-anchor 기준 앵커 계약 유지), 신규 스팟맵
   커버리지 테스트 추가(모든 (x,y)가 해석되는지, 로트와 겹치지 않는지,
   최소 간격 — §3의 "1차값, 최종 검증은 이 테스트" 각주가 가리키는
   바로 그 테스트), 구역별 lazy 로딩 번들 예산 테스트. V1
   `TownGrid.jsx`는 ONE-TOWN 컷오버 결정 전까지 손대지 않는다.
7. 롤아웃: `paulTownV2` OFF 뒤에서 빌드 → 로컬 360/390/430 프리뷰
   스크린샷 → 운영자 승인 → Pilot A 기기 플래그만. DB 변경 없음,
   경제 변경 없음.

**손대는 파일(요약)**: `src/utils/town/townScene.js`,
`src/components/town/v2/{TownScene,TownGroundLayer,TownPathLayer,
TownAmbientLayer,TownObjectLayer,TownFogLayer,TownPlacementOverlay,
TownSprite,TownScreenV2}.jsx`, `src/assets/town/index.js`,
`src/assets/town/assetManifest.js`. **손대지 않는 파일**:
`src/components/town/TownGrid.jsx`(V1), `townLayout.js`, `townShop.js`/
`useTownShop.js`, `townLevel.js`, `townCatalog.js`, 모든 SQL/API.

**롤백**: `paulTownV2` 플래그 OFF 한 줄로 즉시 V1 경로로 복귀(이미
오늘도 OFF 상태이므로 사실상 "새로 배포하지 않으면 자동으로 안전").

**리스크**: (1) 구역별 판 이미지가 실제 아트로 납품되기 전까지는
와이어프레임 수준의 CSS 도형으로 프리뷰해야 함(§10.10 참고) — 이 문서
자체는 아트 리스크를 낮추지 않는다. (2) 스팟맵 좌표(§3.2)는 1차
초안이라 실제 스프라이트 풋프린트가 확정되면 겹침/간격이 재조정될 수
있음(§9 6번 자동화 테스트가 최종 게이트). (3) `anchorFor()` 시그니처
변경은 소비처가 많아(Object/Path/Placement 레이어 전부) 한 파일
안에서 원자적으로 바뀌어야 함 — 부분 배포 시 렌더 불일치 위험, 단일
PR로 묶어야 한다.

## 10. 와이어프레임

파일: `docs/design/town/wireframe/paul-town-world-wireframe.html`.
목적은 스케일·깊이·경로 흐름·건물 위계·지리·진행도를 증명하는 것이지
최종 아트가 아니다 — 플랫 벡터 placeholder(CSS 도형 + 인라인 SVG)로
브리프 §8 팔레트만 재사용한다.

**여는 법**: 파일을 브라우저로 직접 열면 된다(외부 요청 0, 네트워크
불필요). 쿼리 파라미터로 상태를 고정할 수 있다 — 예:
`paul-town-world-wireframe.html?w=390&lv=3&edit=1`.

**컨트롤**:

- **기기 폭**(360/390/430): 각 폭의 폰 프레임(좌우 16px 거터) 안에
  씬을 렌더 — 씬 폭 W = 기기 폭 − 32.
- **레벨**(Lv1/Lv3/Lv5/Lv6/Lv7/Lv8): 해당 레벨에서 열리는 구역까지만
  렌더하고, Lv8 미만이면 최상단 구역 위에 안개 밴드를 얹는다.
- **edit mode**: 켜면 열려 있는 구역의 스팟마다 옅은 잔디 글로우 +
  얇은 펄스 링을 표시(잠긴 구역은 표시 안 함).
- **show spot ids**: 각 스팟 위에 `(x,y)` 라벨을 표시.
- **show lot outlines**: 로트 경계 점선을 표시.
- **Kinney sample**(기본 ON): (4,2)에 나무 placeholder를 렌더해 실제
  Pilot A 데이터가 새 레이아웃에서 어디에 떨어지는지 보여준다.

**로드 시 동작**: 뷰포트는 세로로 스크롤 가능하며, 로드 직후 home
밴드가 완전히 보이도록 자동으로 최하단까지 스크롤된다(문서 §5의
"scroll-to-home on mount" 요구사항과 동일). 렌더가 끝나면
`<body data-ready="1">`이 설정된다.

**리드가 캡처해야 할 스크린샷 파일명**:

- `wireframe-360-lv1.png`
- `wireframe-390-lv1.png`
- `wireframe-430-lv1.png`
- `wireframe-390-lv3.png`
- `wireframe-390-lv5.png`
- `wireframe-390-lv8.png`
- `wireframe-390-lv3-edit.png`(Lv3 + edit mode ON)
</content>
