# Paul Town V2-A — 최종 프로덕션 아트워크 스펙 (British Storybook Village)

> 상태: 설계 문서(디자인 전용). 이미지 생성/코드 변경 없음. `docs/design/town/
> V2A_ASSET_SPEC.md`(초안, 이하 "초안")를 대체하지 않고 **확정판**으로
> 승격한다 — 초안과 배치되는 값이 있으면 이 문서가 우선하고, 배경/근거
> 서술은 초안을 그대로 계승한다. 이 문서가 규정하는 것은 오직 **소스 아트
> 캔버스 규격, asset_key 계약, 생성 프롬프트, 납품 QA**뿐이며, 실제 배치·
> 스케일 로직은 `src/utils/town/townScene.js`(순수 도메인, 진실 원천)와
> `src/components/town/v2/*.jsx`(렌더러) 구현체가 최종 결정한다. 이 문서는
> 그 구현체를 코드로 읽고 **역산해 사실만** 기술했다 — 추측 수치 없음.

## 0. 씬 규격 재확인(근거: 실제 코드)

- 씬 박스 종횡비 8:13(세로형 portrait), 폭은 컨테이너 폭(최대 512px),
  360px 폰에서는 328px(`docs/design/town/V2A_ASSET_SPEC.md` 0절 및 코드
  주석 일치).
- 격자는 8열×6행(`TOWN_GRID` — `townLayout.js`가 진실 원천, `townScene.js`
  는 재수출만). 셀 폭 = 씬 폭의 12.5%(1/8) — 328px 씬 기준 ≈41px, 512px
  씬 기준 ≈64px.
- 레인(길)은 3번째 행(0-index로 row 3, `LANE_ROW = Math.floor(rows/2)` =
  `Math.floor(6/2)` = 3)에 고정.
- 오브젝트 앵커는 **하단-중앙(bottom-centre)** — `anchorFor(x,y)`가
  `leftPct`(칸 가로 중심)와 `bottomPct`(칸 하단)를 반환하고,
  `TownObjectLayer.jsx`가 `transform: translate(-50%, -100%)`로 스프라이트
  하단을 그 좌표에 정확히 붙인다.
- 발자국(footprint) 클래스는 `FOOTPRINT_CLASS`(`townScene.js` 88~92행)가
  유일한 진실 원천 — `lg` 씬 폭 19%/최대 112px, `md` 14%/최대 84px, `sm`
  11%/최대 64px. 328px 씬에서 lg=62px, md=46px, sm=36px; 512px 씬에서
  lg=97px, md=72px, sm=56px(둘 다 max-width 상한에 걸리지 않는 구간).
- z-순서는 `Z_LAYERS`(`townScene.js` 72~80행) — `ground:0 < path:1 <
  patches:2 < fog:5 < objects:10 < overlay:90 < popover:100`. 배치된
  오브젝트(집 포함)는 `objects` 레이어 안에서 다시 `zIndexFor(y) = 10 +
  cy*10`으로 행이 클수록(화면 아래쪽/앞쪽) 위에 그려진다.
- 홈 스프라이트(`HOME_SPRITE`, asset_key `buildings/my-house`)는
  `TownObjectLayer.jsx`에서 래퍼 안쪽에 `scale-[1.3] origin-bottom`이
  추가로 걸려, 표에 적힌 발자국 렌더 크기보다 시각적으로 1.3배 더 크게
  보이고 뒤에 호박색 헤일로(`bg-[#e0a73a]/20 blur-xl`)가 깔린다 — 원화가는
  이 헤일로를 캔버스 안에 베이크하지 않는다(런타임 CSS 레이어).
- 정원 풍성도 단계 임계값은 `GARDEN_STAGE_THRESHOLDS = [0, 10, 30, 60,
  100]`(배운 단어 수 기준) — stage 0~4, 5단계.
- 포그(fog)는 `FOG_START_ROW = 4`(row 4~5, 즉 마을 광장 아래 "마을 바깥"
  구간)를 덮는 바닥 안개이며, `Z_LAYERS.fog(5)`는 `objects(10)`보다
  **아래**다 — 이미 구매해 배치된 아이템이 안개에 가려 흐려 보이는 버그를
  2026-09-13에 고친 결과이므로(코드 주석 68~71행), 안개는 오브젝트 위에
  덮이는 "커튼"이 아니라 오브젝트 뒤에 깔리는 "바닥 습기"로 그려야 한다.

## 1. GLOBAL ART DIRECTION SHEET

**컨셉**: 영국 스토리북 마을(British storybook village). 따뜻하고
마법 같은(warm magical), 아늑한(cozy), 프리미엄한(premium), 교육적인
(educational) 톤 — **절대 어둡거나 무섭지 않게**. 페인터리 스토리북
일러스트(soft painterly), 하드 아웃라인 없음.

**시점/화각**: 모든 에셋이 동일한 3/4 탑다운 화각(약 30도 카메라)을
공유한다. 건물의 정면과 지붕 윗면이 동시에 살짝 보이는 각도이며,
아이소메트릭처럼 완전히 평행하지는 않는다(스토리북 일러스트의 살짝
비뚤어진 손맛 유지).

**광원**: 좌상단 고정 단일 광원. 세트 전체(건물/자연/장식/동물)가 동일한
방향의 하이라이트·음영을 가져야 이질감이 없다. 베이크된 방향성 캐스트
섀도(그림자가 옆으로 길게 눕는 형태)는 금지하고, 바닥 접촉부에만 부드러운
연락 그림자(soft contact shadow, blur 처리, 불투명도 15% 이하)를 허용한다
— 실제로 `TownSprite.jsx`가 모든 스프라이트 뒤에 `bg-[#1e2a5a]/15 blur-[2px]`
타원 그림자를 런타임 CSS로 이미 깔아주므로(24~37행), 원화 자체에 진한
그림자를 그리면 이중으로 겹쳐 보인다 — **원화의 그림자는 아주 옅게만
암시**하고, 진한 접촉 그림자는 런타임 레이어에 맡긴다.

**오브젝트 간 상대 스케일 일관성(중요 — 발자국 클래스와는 별개 규칙)**:
UI 발자국 클래스(lg/md/sm)는 화면 레이아웃(가독성) 기준이지 실제 세계
축척이 아니다. 즉 "코티지(lg, 112px 상한) : 나무(md, 84px 상한)"의 실제
렌더 크기 비는 약 1.3:1에 불과하지만, 이는 **UI가 허용하는 최대 폭**일
뿐이다. 원화가는 각자의 고정 캔버스 **안에서** 오브젝트가 차지하는
실제 그림 면적(패딩을 뺀 순수 실루엣 높이)을 조정해, 나란히 놓았을 때
"코티지 높이 ≈ 나무 높이의 2.4배" 정도의 그림책다운 상대 스케일감이
느껴지도록 그린다 — 예를 들어 나무 캔버스(96×128) 안에서 나무 실루엣이
캔버스 높이의 70~80%를 채우게 크게 그리는 반면, 코티지 캔버스(128×160)
안에서는 지붕 꼭대기부터 바닥까지의 실루엣이 캔버스 높이의 85~95%를
채우도록 그려, 두 캔버스를 같은 배율로 겹쳐 봤을 때 코티지가 나무보다
확연히(약 2.4배) 커 보이게 한다. 이 비율은 목측 가이드이며 픽셀 단위로
강제되지 않는다 — "동화책 속에서 집이 나무보다 훨씬 크다"는 느낌만
살리면 된다.

**팔레트(고정, 세트 전체 공용)**:

| 색 이름 | 헥스 | 용도 |
|---|---|---|
| 모스 그린 | `#8fb37a` / `#cfe3c0` | 잔디/나뭇잎/자연 |
| 웜 크림 | `#fdebd0` / `#f6e3c8` | 벽면/배경 톤 |
| 머티드 네이비 | `#1e2a5a` | 그림자 톤/지붕/포인트 |
| 버건디 | `#7a2e3a` | 지붕/문/포인트 악센트 |
| 웜 앰버 | `#e0a73a` | 창문 불빛/포인트 |
| 소프트 골드 | `#c9a227` | 장식/트림 |
| 우드 | `#8b6f3e` | 목재(벤치/표지판/램프대) |

예외: `decorations/red-post-box`(영국 우체통)만 전통 우체통 빨강을
유지한다(상징색이라 팔레트 예외로 명시 — 나머지 톤은 팔레트 준수).

**투명도/합성 규칙**: 모든 스프라이트는 프리멀티플라이드 알파(premultiplied
alpha)로 내보내 잔디 그라디언트/포그 위에 얹었을 때 흰색 또는 회색 헤일로
(fringe)가 보이지 않게 한다. 캔버스 가장자리 4% 이상은 완전 투명 여백으로
비워 크롭 시 실루엣이 잘리지 않게 한다.

**파일 포맷**: WebP 우선 납품 + PNG 폴백 동시 제공(브라우저 호환), 1x/2x
두 배율 세트. 네이밍은 `<folder>/<asset_key-suffix>.webp`(및 `.png`,
`@2x` 접미사) — 예: `buildings/british-cottage.webp`,
`buildings/british-cottage.png`, `buildings/british-cottage@2x.webp`.

**절대 금지(IP/저작권)**: 해리포터/호그와트 요소, 마법사 모자, 번개
흉터, 하우스 크레스트(문장)/로고/텍스트/워터마크, 인식 가능한 실존
또는 저작권 있는 프랜차이즈 건축물·소품의 모작, 그 외 어떤 프랜차이즈
IP의 재현도 금지. **폴(Paul) 캐릭터는 이 에셋 세트에서 완전히 제외** —
기존 공식 에셋(`src/utils/paulReactions.js` 경로)만 쓰고, 얼굴을
새로 그리거나 대체하지 않는다(8절 참고).

## 2. 에셋 그룹 테이블

컬럼 순서: `asset_key` | 제안 파일명 | 카테고리 | 픽셀 캔버스(1x/2x) |
타겟 렌더 크기 @360/@512 | 종횡비 | 투명(YES/NO) | 앵커 | 맵 발자국(cell) |
z/depth 동작 | 필수 변형 | 애니메이션(YES/NO) | 기존 에셋/신규 제작 |
우선순위(P0/P1/P2).

**우선순위 원칙**: P0 = 카탈로그 17개 아이템 + `buildings/my-house` +
정원 5단계(garden-stage-0..4) — 첫 파일럿에 실제 그림이 반드시 필요한
최소 세트. P1 = 길(path) 타일/헤지/포그/parcel/조명(-lights) 오버레이.
P2 = 지형(terrain) 타일과 애니메이션 프레임(-blink 등).

### GROUP A — ENVIRONMENT / TERRAIN (`backgrounds/`)

현재 `TownGroundLayer.jsx`는 CSS 그라디언트 + 6개의 고정 블러 블롭만으로
바닥을 그리고 있고(코드 확인, 이미지 자산 0개), 이 표는 그것을 대체할
"업그레이드" 자산이다 — **지금 당장 필요하지 않다(P2)**.

| asset_key | 제안 파일명 | 카테고리 | 캔버스(1x/2x) | 렌더@360/@512 | 종횡비 | 투명 | 앵커 | 발자국 | z/depth | 변형 | 애니메이션 | 기존/신규 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `backgrounds/grass-tile` | grass-tile.webp | terrain | 256×256/512×512 | 씬 전체 커버(cover 채움, 셀 단위 아님) | 1:1 | NO | fill(전체) | N/A | ground(0) | 없음 | NO | 신규(CSS 그라디언트가 이미 이 역할 수행 중) | P2 |
| `backgrounds/terrain-patch-1` | terrain-patch-1.webp | terrain | 200×140/400×280 | 씬 폭 대비 38~50%, 씬 높이 대비 10~14%(현재 `BLOBS` 배열 값과 동일 비율 목표) | ≈10:7 | YES(부드러운 알파 블롭) | 없음(퍼센트 좌표 오버레이) | N/A | patches(2) | patch-2/-3와 색조만 다른 세트 | NO | 신규(CSS blur 블롭이 이미 대체 중) | P2 |
| `backgrounds/terrain-patch-2` | terrain-patch-2.webp | terrain | 위와 동일 | 위와 동일 | ≈10:7 | YES | 없음 | N/A | patches(2) | patch-1 세트 중 하나 | NO | 신규 | P2 |
| `backgrounds/terrain-patch-3` | terrain-patch-3.webp | terrain | 위와 동일 | 위와 동일 | ≈10:7 | YES | 없음 | N/A | patches(2) | patch-1 세트 중 하나 | NO | 신규 | P2 |
| `backgrounds/hedge-edge` | hedge-edge.webp | terrain | 256×96/512×192 | 씬 테두리를 따라 가로 반복(현재 CSS는 `shadow-[inset...7px]` 링 + 상단 3.5% 텍스처 밴드) | 8:3(스트립) | YES(안쪽 잎사귀 경계만 알파) | 없음(경계 스트립 채움, 가로 반복) | N/A | patches(2) | 없음 | NO | 신규(CSS 인셋 그림자+radial 밴드가 이미 대체 중) | P2 |
| `backgrounds/village-ground-gradient` | village-ground-gradient.webp | terrain | 512×832/1024×1664(8:13 씬 비율과 동일) | 씬 전체 배경(cover) | 8:13 | NO | fill(전체) | N/A | ground(0) | 없음 | NO | 신규(CSS `bg-gradient-to-b from-[#fdebd0] via-[#e8ecd2] to-[#cfe3c0]`가 이미 대체 중) | P2 |

### GROUP B — PATHS (`backgrounds/`)

`TownPathLayer.jsx`는 현재 CSS radial-gradient 자갈 패턴(`COBBLE_STYLE`)만
쓰고, 코너/T/교차 분기 이미지는 존재하지 않는다(레인이 직선 한 줄뿐이라
현재는 필요 없음 — 향후 구불구불한 길 레이아웃 확장 대비 선제 규격).

| asset_key | 제안 파일명 | 카테고리 | 캔버스(1x/2x) | 렌더@360/@512 | 종횡비 | 투명 | 앵커 | 발자국 | z/depth | 변형 | 애니메이션 | 기존/신규 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `backgrounds/path-straight` | path-straight.webp | path | 128×128/256×256 | 셀 폭 그대로(≈41px/64px) | 1:1 | NO(길이 셀 폭 전체를 채우는 직선 구간이라 풀블리드) | fill(1셀) | 1×1 | path(1) | corner/t/intersection과 모서리 정렬 | NO | 신규(CSS 자갈 패턴이 대체 중) | P1 |
| `backgrounds/path-corner` | path-corner.webp | path | 128×128/256×256 | ≈41px/64px | 1:1 | YES(길이 아닌 코너 바깥쪽은 투명 — 밑의 잔디가 비쳐야 함) | fill(1셀) | 1×1 | path(1) | 4방향 회전은 CSS transform으로 재사용(별도 파일 4장 불필요) | NO | 신규 | P1 |
| `backgrounds/path-t` | path-t.webp | path | 128×128/256×256 | ≈41px/64px | 1:1 | YES(분기하지 않는 한쪽은 투명) | fill(1셀) | 1×1 | path(1) | 회전은 CSS transform 재사용 | NO | 신규 | P1 |
| `backgrounds/path-intersection` | path-intersection.webp | path | 128×128/256×256 | ≈41px/64px | 1:1 | NO(사방이 전부 길이라 풀블리드) | fill(1셀) | 1×1 | path(1) | 없음(대칭이라 회전 불필요) | NO | 신규 | P1 |

### GROUP C — BUILDINGS (`buildings/`, `special/`)

카탈로그 `category`가 `house`인 4개(`british-cottage`/`book-shop`/`cafe` +
고정 소유 `buildings/my-house`)와 `special`인 3개(`english-school`/
`clock-tower`/`bridge`)를 합쳐 총 7종. `footprintFor()`(`townScene.js`
94~100행)가 `house`/`special` 둘 다 `lg`로 매핑하므로 렌더 크기는 동일
클래스를 공유한다.

| asset_key | 제안 파일명 | 카테고리 | 캔버스(1x/2x) | 렌더@360/@512 | 종횡비 | 투명 | 앵커 | 발자국 | z/depth | 변형 | 애니메이션 | 기존/신규 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `buildings/my-house` | my-house.webp | house(카탈로그 외, 고정 소유) | 128×160/256×320 | 62×78/97×121(런타임 1.3배 확대 + 호박색 헤일로는 CSS) | 4:5 | YES | 하단-중앙 | 1×1(lg) | objects(10) | `-lights` 오버레이(선택) | NO | 신규 | P0 |
| `buildings/british-cottage` | british-cottage.webp | house | 128×160/256×320 | 62×78/97×121 | 4:5 | YES | 하단-중앙 | 1×1(lg) | objects(10) | `-lights` 오버레이(P1) | NO | 신규 | P0 |
| `buildings/book-shop` | book-shop.webp | house | 128×160/256×320 | 62×78/97×121 | 4:5 | YES | 하단-중앙 | 1×1(lg) | objects(10) | `-lights` 오버레이(P1) | NO | 신규 | P0 |
| `buildings/cafe` | cafe.webp | house | 128×160/256×320 | 62×78/97×121 | 4:5 | YES | 하단-중앙 | 1×1(lg) | objects(10) | `-lights` 오버레이(P1) | NO | 신규 | P0 |
| `special/english-school` | english-school.webp | special | 128×154/256×308 | 62×74/97×116 | 5:6 | YES | 하단-중앙 | 1×1(lg) | objects(10) | `-lights` 오버레이(P1) | NO | 신규 | P0 |
| `special/clock-tower` | clock-tower.webp | special | 128×256/256×512 | 62×124/97×194 | 1:2(세로 과장) | YES | 하단-중앙 | 1×1(lg, 세로 초과 허용) | objects(10) | `-lights` 오버레이(P1) | NO | 신규 | P0 |
| `special/bridge` | bridge.webp | special | 160×80/320×160 | 82×41/128×64 | 2:1(가로) | YES | 하단-중앙 | 2×1(발자국 공식의 명시적 예외 — 실제 점유 셀 수는 implementer 확인 필요) | objects(10) | 조명 오버레이 없음(창문 없음) | NO | 신규 | P0 |
| `buildings/*-lights`(위 6개 각각) | `<key>-lights.webp` | overlay | 베이스와 동일 캔버스 | 베이스와 동일 | 베이스와 동일 | YES(창문 불빛만) | 베이스와 동일 앵커(정합 필수) | 베이스와 동일 | objects(10), 베이스 바로 위에 겹쳐 합성 | 야간 ambient 기능 붙을 때 사용, 1차 납품 필수 아님 | NO(정적 글로우, 추후 pulse는 CSS) | 신규 | P1 |

### GROUP D — NATURE (`nature/`, `stone-fountain`은 카탈로그 규칙상 `decorations/`)

| asset_key | 제안 파일명 | 카테고리 | 캔버스(1x/2x) | 렌더@360/@512 | 종횡비 | 투명 | 앵커 | 발자국 | z/depth | 변형 | 애니메이션 | 기존/신규 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `nature/tree` | tree.webp | nature | 96×128/192×256 | 46×61/72×96 | 3:4 | YES | 하단-중앙 | 1×1(md) | objects(10) | 없음(사계절 변형은 범위 밖) | NO | 신규 | P0 |
| `nature/flower-garden` | flower-garden.webp | nature | 96×64/192×128 | 46×31/72×48 | 3:2(가로) | YES | 하단-중앙 | 1×1(md) | objects(10) | 없음 | NO | 신규 | P0 |
| `decorations/stone-fountain` | stone-fountain.webp | decoration(주의: 시각적으로는 자연류지만 `townCatalog.js`의 실제 category가 `decoration`이라 폴더/발자국은 decorations 규칙을 따름) | 72×72/144×144 | 36×36/56×56 | 1:1 | YES | 하단-중앙 | 1×1(sm) | objects(10) | 없음 | NO | 신규 | P0 |
| `nature/garden-stage-0` | garden-stage-0.webp | ambient(카탈로그 외, `GARDEN_STAGE_THRESHOLDS[0]=0`) | 64×64/128×128 | 홈 옆 고정 화단 박스(씬 좌표 left 2%/top 12%/width 30%/height 22%) 안에 인라인 배치, 발자국 클래스 미적용 | 1:1 | YES | 하단-중앙(화단 박스 내부) | N/A(고정 화단 오버레이, 배치 불가) | **patches(2)** — 주의: `TownAmbientLayer.jsx`가 이 자리를 objects(10)가 아니라 patches 레이어에서 그린다(코드 확인) | seed(씨앗) 단계 | NO | 신규 | P0 |
| `nature/garden-stage-1` | garden-stage-1.webp | ambient | 64×64/128×128 | 위와 동일 | 1:1 | YES | 하단-중앙 | N/A | patches(2) | sprout(새싹) 단계, threshold≥10 | NO | 신규 | P0 |
| `nature/garden-stage-2` | garden-stage-2.webp | ambient | 64×64/128×128 | 위와 동일 | 1:1 | YES | 하단-중앙 | N/A | patches(2) | flower(꽃) 단계, threshold≥30 | NO | 신규 | P0 |
| `nature/garden-stage-3` | garden-stage-3.webp | ambient | 64×64/128×128 | 위와 동일 | 1:1 | YES | 하단-중앙 | N/A | patches(2) | bloom(만개) 단계, threshold≥60 | NO | 신규 | P0 |
| `nature/garden-stage-4` | garden-stage-4.webp | ambient | 64×64/128×128 | 위와 동일 | 1:1 | YES | 하단-중앙 | N/A | patches(2) | full(풀만개) 단계, threshold≥100 | NO | 신규 | P0 |

> 참고(implementer 확인 필요, docs-maintainer는 코드를 고치지 않으므로
> 사실만 기록): 현재 `TownAmbientLayer.jsx`는 `garden-stage-*` asset_key를
> `townAsset()`으로 조회하지 않고 `STAGE_EMOJI` 상수(이모지 리터럴)를 직접
> 그린다. 즉 이 5개 이미지를 납품해도 **연동 코드가 아직 없다** — 이미지가
> 실제로 화면에 쓰이려면 `TownAmbientLayer.jsx`가 `TownSprite`/`townAsset`
> 경로를 쓰도록 바뀌어야 하며, 이는 코드 변경이라 implementer 담당이다.
> 이 문서는 그 사실을 기록만 하고 코드를 수정하지 않는다.

### GROUP E — DECORATIONS (`decorations/`, `ui/`)

| asset_key | 제안 파일명 | 카테고리 | 캔버스(1x/2x) | 렌더@360/@512 | 종횡비 | 투명 | 앵커 | 발자국 | z/depth | 변형 | 애니메이션 | 기존/신규 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `decorations/bench` | bench.webp | decoration | 72×48/144×96 | 36×24/56×37 | 3:2(가로) | YES | 하단-중앙 | 1×1(sm) | objects(10) | 없음 | NO | 신규 | P0 |
| `decorations/town-sign` | town-sign.webp | decoration | 72×108/144×216 | 36×54/56×84 | 2:3(세로) | YES | 하단-중앙 | 1×1(sm) | objects(10) | 텍스트 없이 그림만(팻말 표면 비워둠) | NO | 신규 | P0 |
| `decorations/shop-lamp` | shop-lamp.webp | decoration | 72×144/144×288 | 36×72/56×112 | 1:2(세로) | YES | 하단-중앙 | 1×1(sm) | objects(10) | 없음 | NO | 신규 | P0 |
| `decorations/street-lamp` | street-lamp.webp | decoration | 72×144/144×288 | 36×90/56×140 | 1:2.5(세로) | YES | 하단-중앙 | 1×1(sm) | objects(10) | `-on` 점등 변형(P1) | NO | 신규 | P0 |
| `decorations/street-lamp-on` | street-lamp-on.webp | decoration(overlay/변형) | 베이스와 동일 캔버스·앵커 | 베이스와 동일 | 1:2.5 | YES(램프 헤드만 따뜻한 글로우 추가) | 하단-중앙 | 1×1(sm) | objects(10) | 야간 ambient용 스왑 프레임 | NO(정적, pulse는 CSS) | 신규 | P1 |
| `decorations/red-post-box` | red-post-box.webp | decoration | 72×108/144×216 | 36×54/56×84 | 2:3(세로) | YES | 하단-중앙 | 1×1(sm) | objects(10) | 팔레트 예외(전통 영국 우체통 빨강 유지) | NO | 신규 | P0 |
| `ui/parcel` | parcel.webp | ui(인벤토리 전용) | 48×48/96×96 | 고정 48×48(그리드 스케일 미적용, 발자국 클래스 무관) | 1:1 | YES | 중앙 | N/A(그리드에 배치되지 않음, 인벤토리 카드 아이콘) | N/A(그리드 z-layer 밖, 인벤토리 UI 자체 z) | 없음 | NO | 신규 | P1 |

### GROUP F — ANIMALS (`animals/`)

| asset_key | 제안 파일명 | 카테고리 | 캔버스(1x/2x) | 렌더@360/@512 | 종횡비 | 투명 | 앵커 | 발자국 | z/depth | 변형 | 애니메이션 | 기존/신규 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `animals/cat` | cat.webp | animal | 72×54/144×108 | 36×27/56×42 | 4:3(가로) | YES | 하단-중앙 | 1×1(sm) | objects(10) | `-blink` 프레임(선택, P2) | NO(기본은 정적) | 신규 | P0 |
| `animals/cat-blink` | cat-blink.webp | animal(변형) | 베이스와 동일 캔버스·앵커 | 베이스와 동일 | 4:3 | YES | 하단-중앙 | 1×1(sm) | objects(10) | 눈만 감은 프레임, 그 외 포즈/실루엣 동일 | YES(2프레임 CSS/JS 토글) | 신규 | P2 |
| `animals/puppy` | puppy.webp | animal | 72×54/144×108 | 36×27/56×42 | 4:3(가로) | YES | 하단-중앙 | 1×1(sm) | objects(10) | `-blink` 프레임(선택, P2) | NO | 신규 | P0 |
| `animals/puppy-blink` | puppy-blink.webp | animal(변형) | 베이스와 동일 | 베이스와 동일 | 4:3 | YES | 하단-중앙 | 1×1(sm) | objects(10) | 눈만 감은 프레임 | YES | 신규 | P2 |
| `animals/owl` | owl.webp | animal | 72×96/144×192 | 36×48/56×75 | 3:4(세로) | YES | 하단-중앙 | 1×1(sm) | objects(10) | `-blink` 프레임(선택, P2) | NO | 신규 | P0 |
| `animals/owl-blink` | owl-blink.webp | animal(변형) | 베이스와 동일 | 베이스와 동일 | 3:4 | YES | 하단-중앙 | 1×1(sm) | objects(10) | 눈만 감은 프레임 | YES | 신규 | P2 |

### GROUP G — LOCKED / FUTURE

| asset_key | 제안 파일명 | 카테고리 | 캔버스(1x/2x) | 렌더@360/@512 | 종횡비 | 투명 | 앵커 | 발자국 | z/depth | 변형 | 애니메이션 | 기존/신규 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `backgrounds/fog` | fog.webp | overlay(잠금 안개) | 512×512/1024×1024 | row 4~5(마을 바깥) 구간을 덮는 씬 하단 전체 폭 오버레이 | 1:1(타일링 소스, 런타임에는 세로 그라디언트로 스트레치) | YES(부드러운 알파, 저채도 노이즈) | fill(하단 오버레이) | N/A | **fog(5)** — objects(10)보다 반드시 아래(2026-09-13 버그 수정 근거, 0절 참고) | 없음 | NO | 신규 | P1 |
| (파일 없음 — CSS 전용) | — | 잠금 실루엣 처리 | — | — | — | — | — | — | fog(5) 위, objects(10) 자리에서 15% 불투명도 적용 | 새 파일 불필요 — **기존 건물/아이템 스프라이트 재사용**, `opacity: 0.15` + `blur` CSS 필터만 적용 | N/A | 신규 자산 없음(로직만) | CSS-only(등급 없음) |
| (파일 없음 — CSS 전용) | — | 잠금 해제 글로우 링 | — | — | — | — | — | — | overlay(90) 부근 | radial-gradient/box-shadow로 구현 | N/A | 신규 자산 없음 | CSS-only(등급 없음) |
| (파일 없음 — CSS 전용) | — | 레벨 마커 칩 | — | — | — | — | — | — | overlay(90) | `fogState()`의 `chip` 문자열("⭐ Lv.N에서 열려요")을 담는 흰 배경 알약(pill) — `TownFogLayer.jsx`가 이미 `bg-white/90 rounded-full` 텍스트 칩으로 구현 중 | N/A | 신규 자산 없음(기존 코드가 이미 CSS로 완결) | CSS-only(등급 없음) |

### GROUP H — PAUL(폴 캐릭터)

새 에셋 요청 없음(no asset request). `src/utils/paulReactions.js`의
`PAUL_REACTIONS`가 이미 공식 리액션 이미지/사운드를 보유하고 있고, 이
V2-A 마을 에셋 세트는 폴 캐릭터를 전혀 다루지 않는다 — `src/assets/town/
index.js`의 헤더 주석이 이를 명시적으로 강제한다("브랜드 마스코트 캐릭터
이미지는 여기 절대 두지 않는다"). 원화가에게 폴 캐릭터의 새 포즈/표정을
새로 그리게 하거나, 마을 씬 안에 폴을 배치하는 작업은 이번 스펙의 범위가
아니다.

## 3. 그룹별 이미지 생성 프롬프트 템플릿

공통 팔레트 문자열(모든 프롬프트에 포함): warm cream (#fdebd0, #f6e3c8),
moss green (#8fb37a, #cfe3c0), muted navy (#1e2a5a), burgundy (#7a2e3a),
warm amber (#e0a73a), soft gold (#c9a227), wood brown (#8b6f3e).

**공통 네거티브 프롬프트(모든 그룹 공통 적용)**:
`no text, no letters, no numbers, no logos, no watermark, no crests, no
coats of arms, no Harry Potter or Hogwarts elements, no wizard hats, no
lightning bolt scars, no recognizable real-world or copyrighted franchise
architecture, no franchise props, no human faces, no realistic human
figures, no photorealism, no hard black outlines, no drop shadow, no
vignette, no busy background, no clutter, no additional objects in frame,
no scary or dark horror elements, no multiple objects, no collage.`

- **A. ENVIRONMENT/TERRAIN**: "Seamless tileable top-down storybook grass
  texture with subtle organic color variation, soft painterly style, moss
  green palette (#8fb37a, #cfe3c0), flat even lighting (no directional
  shadow), tiles edge-to-edge seamlessly, warm and inviting, no outlines."
- **B. PATHS**: "Seamless tileable top-down cobblestone path segment
  ([straight strip / 90-degree corner / T-junction / four-way
  intersection]), soft painterly storybook style, warm stone and wood
  tones (#8b6f3e, #fdebd0), 3/4 top-down angle ~30 degrees, subtle worn
  texture, transparent background outside the stone path shape, edges
  must align with neighboring straight segments, no outlines."
- **C. BUILDINGS**: "Cozy British storybook village building ([thatched
  cottage / bookshop with round window / cafe with small awning / village
  school / tall clock tower / stone bridge]), 3/4 top-down angle ~30
  degrees, soft painterly digital illustration, warm cream and moss green
  palette with wood trim (#fdebd0, #cfe3c0, #8b6f3e), small warm-lit
  windows, single centered building isolated on transparent background,
  light source from top-left, no outlines, premium and child-friendly
  feel." 조명 오버레이용 별도 프롬프트: "Only the glowing warm window
  lights of the same building silhouette, everything else fully
  transparent, soft warm amber glow (#e0a73a), no building outline
  visible, transparent background."
- **D. NATURE**: "Storybook illustration of a single [deciduous tree /
  low flower garden bed / stone fountain], painterly style, warm moss
  green and soft gold palette (#8fb37a, #c9a227), 3/4 top-down angle ~30
  degrees, soft rounded shapes, isolated single object on transparent
  background, no outlines, light from top-left, cozy and cute." 정원
  단계 전용: "A small round garden bed at growth stage [bare soil with a
  single tiny seed / a few small green sprouts / a handful of blooming
  flowers / a fuller flower bed in bloom / a lush fully bloomed flower
  bed with a small bird], painterly storybook style, consistent circular
  bed shape and camera angle across all five stages, transparent
  background, no outlines."
- **E. DECORATIONS**: "Small cute British village prop ([wooden park
  bench / carved wooden signpost with blank surface / ornate shop lamp
  post / tall street lamp post / traditional red British post box]),
  painterly storybook style, warm wood tones (#8b6f3e) with navy or
  burgundy accents (#1e2a5a, #7a2e3a), 3/4 top-down angle ~30 degrees,
  soft shading, isolated single object on transparent background, no
  outlines, child-friendly." 램프 점등 변형: "The same lamp post with
  only the lamp head glowing warmly, soft amber glow (#e0a73a), rest of
  the object unchanged, transparent background."
- **F. ANIMALS**: "Cute chibi-proportioned village animal ([sitting cat /
  small puppy / owl perched pose]), 3/4 top-down angle, soft painterly
  storybook style, warm friendly expression without realistic facial
  detail, muted natural fur/feather colors within the warm palette,
  isolated single object on transparent background, no outlines, gentle
  idle standing or perched pose." 깜빡임 변형: "The exact same animal,
  same pose and silhouette, only with eyes closed, transparent
  background, no other changes."
- **G. LOCKED/FUTURE(포그 타일만 해당, 나머지는 CSS라 프롬프트 불필요)**:
  "Soft low-opacity atmospheric mist texture, muted cool-neutral tone
  blended with warm cream undertone, gentle gradient from transparent at
  the bottom edge to soft haze at the top edge, no hard edges, no visible
  objects inside the mist, seamless horizontal tiling, transparent
  background where mist is absent."
- **H. PAUL**: 해당 없음 — 프롬프트 생성하지 않음(2절 GROUP H 참고).

## 4. 납품 체크리스트 & 검수(QA) 항목

**파일 납품 체크리스트**:

- [ ] `asset_key`별로 `.webp`(1x/2x) + `.png`(1x/2x) 폴백 4파일 세트가
      모두 있고, 파일명이 표의 "제안 파일명"과 정확히 일치하는가?
- [ ] 폴더 배치가 카테고리 열과 일치하는가 — 특히 `stone-fountain`은
      시각적으로 자연류처럼 보여도 반드시 `decorations/` 폴더에 들어가는가?
- [ ] `-lights`/`-on`/`-blink` 등 변형 파일이 베이스와 **동일 캔버스
      크기·동일 앵커**로 픽셀 정합되는가(겹쳐 봤을 때 밀리지 않음)?

**시각 QA 체크리스트**:

- [ ] 픽셀 크기가 표의 1x/2x 타겟과 일치하는가(±10% 이내)?
- [ ] 배경이 완전히 투명하고 프리멀티플라이드 알파로 처리돼, 밝은 배경
      (잔디)과 어두운 배경(네이비 톤 UI) 양쪽에서 모두 흰색/회색 번짐이
      없고, 가장자리 안전 여백(4% 이상) 안에 그림이 들어가 크롭 잘림이
      없는가?
- [ ] 앵커(하단-중앙 또는 중앙)가 캔버스 기준으로 정확히 정렬돼, 8×13
      씬 좌표계 위에 얹었을 때 바닥선이 셀 하단 경계와 맞아떨어지는가
      (검증 방법: 캔버스를 반투명하게 씬 그리드 스크린샷 위에 겹쳐 보기)?
- [ ] 328px 폭(360px 폰 기준)에서 실루엣만으로 즉시 알아볼 수 있고,
      200%(2x 레티나) 확대 시에도 계단현상/블러/노이즈가 눈에 띄지
      않는가?
- [ ] `TownFogLayer.jsx`의 흰색 반투명 안개 그라디언트(`from-white/85
      via-white/60`) 위에 실루엣만 보이는 잠금 상태에서도 형태를 알아볼
      수 있는 대비를 갖는가(잠금 실루엣은 기존 스프라이트 재사용 + CSS
      15% 불투명도이므로, 베이스 스프라이트 자체가 충분히 선명해야 한다)?
- [ ] 잔디/포그 타일(그룹 A/G)이 이음매 없이 반복되고(2×2로 이어 붙여
      경계선 확인), 길 타일(그룹 B)의 코너/T/교차 조합이 서로 다른 인접
      배치에서도 자갈 무늬가 어긋나지 않는가?
- [ ] `bridge`(2:1)가 328px/512px 두 브레이크포인트 모두에서 셀 2칸 폭에
      대응하는 시각 폭으로 자연스럽게 걸쳐지는가(빈틈/겹침 없음)?
- [ ] `garden-stage-0`→`garden-stage-4`를 순서대로 나열했을 때 성장
      과정이 자연스럽게 읽히는가(카메라 각도/화단 형태/앵커가 5단계
      모두 동일한가)?
- [ ] 팔레트를 벗어나는 튀는 색(`red-post-box` 예외 제외)이 없고, 광원
      방향(좌상단)이 세트 전체에서 일관되며, 텍스트/로고/크레스트/
      해리포터류 IP 요소·폴 캐릭터 얼굴이 어디에도 없는가?

## 5. 연동(Integration) 노트 — implementer 전달용

이 절은 문서일 뿐 코드를 바꾸지 않는다 — 아래 항목은 실제 에셋 파일이
납품된 뒤 **같은 PR 안에서 implementer가 처리**해야 할 작업 목록이다.

1. `src/assets/town/index.js`의 `TOWN_ASSETS`(현재 `export const
   TOWN_ASSETS = {}`, 12행)에 `asset_key`를 키로 하는 import를 추가한다:
   ```js
   import britishCottage from './buildings/british-cottage.webp'
   import myHouse from './buildings/my-house.webp'
   export const TOWN_ASSETS = {
     'buildings/british-cottage': britishCottage,
     'buildings/my-house': myHouse,
     // ... 나머지 asset_key도 동일 패턴
   }
   ```
2. **렌더 로직 변경은 필요 없다(그룹 A~F, H)** — `TownSprite.jsx`는 이미
   `townAsset(sprite.assetKey)`를 호출해 URL이 있으면 `<img>`로, 없으면
   이모지(`sprite.emoji`)로 폴백하는 구조를 갖추고 있다(8~53행). 즉
   `TOWN_ASSETS`에 키를 채우는 것만으로 그룹 C/D(단, garden-stage 제외)/
   E/F가 자동으로 이미지 렌더로 전환된다.
3. **예외 — GROUP D의 `garden-stage-0..4`**: 2절 GROUP D 하단 참고 박스에
   적었듯, `TownAmbientLayer.jsx`는 현재 `STAGE_EMOJI` 리터럴을 직접
   그리고 `townAsset()`을 호출하지 않는다. 이 5개 이미지를 실제로 쓰려면
   `TownAmbientLayer.jsx`가 `TownSprite`(또는 `townAsset` 직접 호출) 경로로
   바뀌어야 한다 — 이는 새 기능이 아니라 기존 emoji 렌더를 asset_key 렌더로
   바꾸는 리팩터이므로 안정성 규칙(저장소 헌법 1번) 범위 안에서 신중히
   진행해야 한다.
4. **같은 PR 안에서 반드시 함께 고쳐야 하는 테스트 계약**:
   `scripts/testTownUiStatic.mjs` 92행의 정적 단언
   `check('src/assets/town/index.js — TOWN_ASSETS export', !!assetsIndexSrc
   && /export const TOWN_ASSETS\s*=\s*\{\s*\}/.test(assetsIndexSrc))`은
   "`TOWN_ASSETS`가 반드시 빈 객체여야 통과"하는 계약이다. 에셋을 하나라도
   채우면 이 줄은 자연히 FAIL한다 — implementer는 이 줄을 "`TOWN_ASSETS`가
   특정 asset_key들을 포함해야 한다" 또는 "더 이상 빈 객체 여부를 강제하지
   않는다" 방향으로 갱신해야 `npm run verify:*`가 깨지지 않는다.
5. 폴더 스캐폴드(`src/assets/town/{backgrounds,buildings,decorations,
   nature,animals,special,ui}/.gitkeep`)는 이미 존재하고
   `testTownUiStatic.mjs`가 이미 검증 중이므로 추가 작업 불필요 — 새
   파일을 해당 폴더에 넣기만 하면 된다.
6. 이 문서(docs-maintainer 산출물)는 코드를 직접 수정하지 않는다 — 위
   1~4번은 implementer 에이전트에게 그대로 인계할 작업 목록이다.

---

_작성: docs-maintainer, 2026-09-13. 근거: `docs/design/town/
V2A_ASSET_SPEC.md`, `src/utils/town/townScene.js`, `src/utils/town/
townCatalog.js`, `src/assets/town/index.js`, `src/components/town/v2/
TownSprite.jsx`, `TownGroundLayer.jsx`, `TownPathLayer.jsx`,
`TownAmbientLayer.jsx`, `TownFogLayer.jsx`, `TownObjectLayer.jsx`,
`scripts/testTownUiStatic.mjs`, `src/utils/paulReactions.js`(전부 이
세션에서 직접 Read로 확인, 추측 없음)._
