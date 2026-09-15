# Paul Town — 최종 아트워크 스펙 (FINAL ARTWORK SPEC, 2026-09-16)

> 상태: 설계 문서(디자인 전용). 이미지 생성/코드/DB/이코노미 변경 없음.
> 이 문서가 규정하는 것은 오직 **새 월드 컴포지션(6개 district 스택) 기준
> 아트 캔버스 규격·시점/조명/팔레트 규칙·asset_key별 계약·플레이트 연속성·
> 납품 QA**뿐이다. 실제 배치/렌더 로직은 여전히
> `src/utils/town/townScene.js`(향후 `townLayout.js`+district 데이터로
> 확장 예정)와 `src/components/town/v2/*.jsx`가 최종 결정하며, 이 문서는
> 구현 전 아트 발주를 위한 스펙이다. 근거는
> `WORLD_DESIGN_BRIEF.md`(2026-09-16, lead 확정 브리프, 이하 "브리프")와
> 브리프가 인용한 실제 코드(`townLayout.js`/`townLevel.js`/
> `townCatalog.js`/`townScene.js`)이며, 추측 수치는 쓰지 않았다.

## 0. 상태 / 범위 / 기존 문서와의 관계

**대체하는 것(supersede)**: `V2A_ASSET_SPEC.md`와 `V2A_ARTWORK_SPEC_FINAL.md`
가 규정하던 **월드 컴포지션**(단일 8:13 박스, 8×6 CSS 격자 1:1 좌표 매핑,
`LANE_ROW=3` 가로 길, 균일 그라디언트 바닥)과 그 컴포지션에 종속된
**캔버스 규격**(예: 구 `buildings/my-house` 128×160, 구
`nature/garden-stage-N` 64×64 정사각 타일)은 이 문서가 **대체**한다. 브리프
§0~§1이 진단했듯 그 구조 자체가 "보드처럼 보이는" 근본 원인이었고, 브리프
§2~§6이 6개 district 세로 스택 + 고정 건물 로트 + 기존 배치 엔진 병행 구조로
이를 새로 규정했다 — 이 문서는 그 새 구조에 맞춘 아트 발주 스펙이다.

**보존하는 것(preserve)**: 다음은 이 문서가 바꾸지 않는다.
- `asset_key` 계약(문자열 키 형식 `<folder>/<name>`, `assetManifest.js`의
  필드 구조 — `assetKey`/`filename`/`folder`/`canvas`/`canvas2x`/
  `aspectRatio`/`transparent`/`anchor`/`footprint`/`zLayer`/`variants`/
  `priority`) — 새 asset_key는 같은 필드 구조를 그대로 쓴다.
- 이모지 폴백 규칙: `townAsset(assetKey)`가 `TOWN_ASSETS`에 키가 없으면
  `null`을 반환하고 호출부가 `TOWN_ITEM_META.emoji`로 폴백하는 구조
  (`PAUL_TOWN_ASSET_CONTRACT.md` §0) — 이 문서가 규정하는 신규 자산이
  아직 납품/배선되지 않은 동안에도 앱은 절대 깨지지 않는다.
- `PAUL_TOWN_ASSET_CONTRACT.md` §1의 lifecycle 상태값(`SPEC_ONLY` →
  `CANDIDATE` → `REGEN_REQUIRED`/`APPROVED` → `WIRED` → `MERGED` →
  `DEPLOYED`, 그리고 `DEFERRED`)은 이 문서가 정의하는 신규 asset_key에도
  동일하게 적용한다. 이 문서 시점에는 전부 후보 이미지가 없으므로 2절
  표의 모든 신규 항목은 `SPEC_ONLY`다.
- `PAUL_TOWN_ASSET_CONTRACT.md` §0의 전역 규칙(알파 요건, 4% 이상 투명
  여백, 그림자 규칙, `bottom-center` 앵커, 공용 팔레트 베이스) — 이
  문서는 이를 6개 district 세로 스택 구조에 맞게 **확장**할 뿐 모순되지
  않는다(팔레트에 `warm stone` 계열을 추가하는 것 등은 확장이지 대체가
  아니다).
- **보존 시스템(브리프 §9 그대로 — 이 문서와 무관하게 절대 불변)**:
  Paul Dollar 잔액/적립 로직, Stars, XP, 리워드, 구매, 소유권, 인벤토리,
  배치 영속성(`townPlacements`/`townRemovedIds`), 멱등성 키, 레벨
  임계값, 가격, 학생 identity(UUID) 격리. 프로덕션 학생 데이터 변경 없음,
  구매 테스트 없음, SQL/마이그레이션 없음, 플래그 변경 없음, 배포/merge
  없음 — 이 문서는 순수 아트 발주 스펙이며 위 어느 것도 건드리지 않는다.

**아직 존재하지 않는 문서 참조**: 3절의 로트 파운데이션 정확 좌표(%)는
`WORLD_LAYOUT_REDESIGN_2026-09-16.md`(동시 작성 중인 별도 문서)가
원출처다 — 이 문서는 그 수치를 추측해 적지 않고 참조만 한다.

## 1. 월드 퍼스펙티브 시트

### 1.1 카메라 / 지평선 / 광원 / 그림자

- **카메라**: 3/4 top-down, 고정 elevation ≈30도. 브리프 §3: "a little more
  top-down than the reference so stacked bands do not occlude each
  other" — 참고 이미지(`마을그림.png`)보다 조금 더 위에서 내려다보는
  각도로, 여섯 district를 세로로 쌓았을 때 뒤 district가 앞 district
  지붕에 가려 안 보이는 일이 없게 한다. 모든 플레이트/스프라이트가 동일
  각도를 공유해야 한다("one matched set" 규칙, 1.5절).
- **지평선(horizon)**: tower(시계탑) 밴드의 최상단에만 하늘이 걸린다 —
  그 아래 5개 district(school/river/square/lane/home)는 하늘이 보이지
  않는, 마을 안쪽만 보이는 앵글이다. Lv1~7까지는 화면에 하늘이 전혀
  없고(fog 밴드가 하늘을 대신 가림), Lv8에서 tower 플레이트가 열려야
  처음으로 하늘/먼 언덕이 보인다.
- **광원**: 좌상단 고정 warm late-afternoon 단일 광원, 세트 전체(플레이트+
  스프라이트) 동일 방향. 참고 이미지에서 관찰한 대로 전체적으로 화사하고
  따뜻한 색온도이되, 그림자가 길게 눕는 강한 태양광이 아니라 부드럽게
  퍼지는 늦은 오후 빛이다.
- **그림자 규칙**: 베이크된 방향성 캐스트 섀도 금지. 콘택트 섀도만
  허용하며 불투명도 ≤15%, 오브젝트 바로 아래에서 살짝 우측-하단으로
  치우친 부드러운 블러 형태(런타임 `TownSprite.jsx`의 CSS 타원 그림자와
  이중으로 겹치지 않도록 원화 자체 그림자는 아주 옅게만 암시 —
  `V2A_ARTWORK_SPEC_FINAL.md` §1과 동일 원칙 계승). 플레이트에는 런타임
  그림자가 없으므로, 로트 파운데이션 주변의 은은한 콘택트 섀도는 플레이트
  자체에 베이크해도 된다(단 옆으로 눕는 캐스트 섀도 형태는 금지).

### 1.2 district별 깊이 스케일 표 (브리프 §3 그대로 복사, 추측 없음)

| district id | 이름 | height(×W) | sprite scale | 잠금 해제 레벨 | path width(=14%×scale) |
|---|---|---|---|---|---|
| `tower` | Clock Tower & hills/sky | 0.95 | 0.56 | Lv8 | ≈7.8%(브리프 표기 "≈8%") |
| `school` | English School | 0.80 | 0.64 | Lv7 | 9.0% |
| `river` | River & Stone Bridge | 0.50 | 0.70 | Lv6 | 9.8% |
| `square` | Village Square & Café | 0.90 | 0.76 | Lv5 | 10.6% |
| `lane` | Book Shop Lane | 0.85 | 0.86 | Lv3 | 12.0% |
| `home` | My Home & Garden | 1.15 | 1.00 | Lv1 | 14.0% |
| `fog`(가상) | 안개 지평선 | 0.32 | — | — | 해당 없음(길이 안개 속으로 흐려짐) |

path width % 열은 브리프가 "path width: 14% W in home, narrowing with the
depth scale per district"라고만 서술한 것을, 각 district의 `sprite scale`
값을 곱해 이 문서가 역산했다(계산식 명시 — 추측 수치 아님). `home` 값
14%와 `tower` 근사값 "≈8%"는 브리프 원문 그대로이며, 계산 결과(7.84%)와
브리프의 "≈8%"가 일치해 이 공식이 브리프 의도와 부합함을 교차 확인했다.

**씬 폭 W**: 360px 폰 328px / 390px 폰 358px / 430px 폰 398px / 데스크톱
최대 512px(브리프 §3). 이 문서의 모든 렌더 px 예시는 W=358(390px 폰) 기준을
기본값으로 쓰고, 다른 폭은 동일 %를 그 폭에 곱해 구한다.

### 1.3 상대 스케일 가이드 (브리프 §3 그대로, home band 기준 % of W)

cottage 42 · tree 20(height ≈ 0.9×cottage height) · flower-garden 18×8 ·
bench 13 · street-lamp 6(height ≈ 0.6×cottage height) · red-post-box 6 ·
town-sign 9 · cat/puppy 8 · owl 6 · Book Shop(lane, ×0.86) 36 ·
Café(square, ×0.76) 34 · fountain 16 · bridge(river) 44 · school(×0.64) 40 ·
clock tower(×0.56) 16 wide × 44 tall.

이 표의 % 값은 전부 **district 스케일 적용 전(home-equivalent) 기준**이다
— 실제 화면 렌더 px = (% × W) × 해당 district의 `sprite scale`. 예:
Book Shop = 36% × 358px = 129px(스케일 전) × 0.86(lane scale) = 111px
(실제 lane 밴드 표시 폭). 브리프 §8이 book-shop 렌더를 "≈129×129 before
×0.86 lane scale"이라고 명시해 이 계산식을 직접 검증한다.

### 1.4 팔레트 (공용, hex + 용도)

| 색 이름 | hex | 용도 |
|---|---|---|
| 웜 크림 | `#fdebd0` / `#f6e3c8` | 벽면/포장/배경 톤 베이스 |
| 소프트 모스 | `#cfe3c0` | 잔디 하이라이트/잎 밝은 톤 |
| 세이지 | `#8fb37a` | 잔디/생울타리/잎 기본 톤(모스보다 채도 낮은 중간톤) |
| 웜 스톤(신규 — `V2A_ARTWORK_SPEC_FINAL.md` 팔레트에 없던 톤, 브리프가
  추가) | `#d9d2c5` / `#b9ab95` | 건물 석벽/포장 돌/로트 파운데이션 —
  참고 이미지의 따뜻한 베이지 석재 벽면 톤을 반영 |
| 머티드 네이비 | `#1e2a5a` | 지붕/그림자 톤/포인트 |
| 버건디 | `#7a2e3a` | 지붕/문/포인트 악센트 |
| 웜 앰버 | `#e0a73a` | 창문 불빛/포인트 |
| 소프트 골드 | `#c9a227` | 장식/트림 |
| 우드 브라운(계승 — `V2A_ARTWORK_SPEC_FINAL.md` §1에서 계승, 브리프
  본문에 재기재는 없으나 모순 없이 확장) | `#8b6f3e` | 목재(벤치/표지판/
  램프대 목재부) |

예외: `decorations/red-post-box`는 전통 영국 우체통 빨강을 유지(팔레트
대체 안 함, 브리프 §8 명시).

### 1.5 텍스처 / 아웃라인 / 디테일 레벨 규칙 — 참고 이미지가 1차 기준(2026-09-16 lead override)

> **2026-09-16 lead override**: 이 절의 원래 초안은 참고 이미지를
> "컴포지션 전용"으로 한정하고 디테일 레벨은 기존 KEEP 동물 세트(간단한
> 카툰 페인터리)에 맞추도록 판단했었다. 운영자(lead)가 이를 명시적으로
> 뒤집었다 — 참고 이미지(`마을그림.png`)를 **1차(primary) 비주얼
> 레퍼런스**로 삼고, "프리미엄", "촘촘하지만 읽히는 디테일(dense but
> readable)", "레이어드/깊이감 있는", "하나로 통일된 일러스트 스타일"을
> 명시적으로 요구했다. 이에 따라 아래 내용으로 전면 수정한다.

참고 이미지(`마을그림.png`)는 이제 **컴포지션뿐 아니라 렌더 디테일/
마감 수준까지 포함한 1차 비주얼 레퍼런스**다. 목표 디테일 레벨은
참고 이미지 수준의 **풍부한 페인터리 스토리북 일러스트**(따뜻하고
질감 있는 석벽, 잎이 뭉쳐진 풍성한 식생 덩어리, 은은하게 빛나는 창문,
부드러운 페인트 음영)이며, 아래 원칙만 지킨다:
- 하드 아웃라인 없음(no hard outlines) — 유지.
- 사진처럼 사실적(photorealistic)이지는 않음 — 유지(참고 이미지보다는
  살짝 더 페인터리/일러스트적인 마감이어도 되지만, 단순화된 카툰으로
  후퇴하지 않는다).
- 아동 친화적(child-friendly) — 유지.
- 휴대폰 화면 배율(1x 렌더 기준)에서 약 2px 미만이 되는 마이크로
  디테일(예: 개별 나뭇잎 한 장 한 장, 벽돌 한 장 한 장의 세부 질감)은
  피한다 — "촘촘하지만 읽히는(dense but readable)" 요구를 실제 렌더
  크기(1.2절 W=358 기준 렌더 px)에서 뭉개지지 않게 지키기 위한 제약이지,
  디테일 밀도 자체를 낮추라는 뜻이 아니다. 마스터 캔버스(2x)에는 훨씬
  촘촘한 디테일을 그려도 되며, 1x 다운스케일 시 읽히는지만 확인한다.

참고 이미지에서 가져오는 규칙은 컴포지션뿐 아니라 마감 수준까지
확장된다:
- 건물이 나무/장식보다 압도적으로 큰 스케일 위계(1.3절 상대 스케일 가이드로
  이미 수치화됨) — 그 큰 스케일 안에서 참고 이미지 수준의 촘촘한 석벽
  질감/창틀/지붕 기와 디테일을 담는다.
- 길(path)이 마을 중심부에서 넓게 열리고 건물 사이로 자연스럽게
  구불거리며 이어지는 형태(3절 플레이트 연속성 계약), 포장석 하나하나가
  읽히는 자갈 질감.
- 전경(홈 밴드 하단)일수록 크고 선명·디테일 풍부, 배경(포그/원경)일수록
  작고 흐릿해지는 깊이감 — district 스케일 표(1.2절)로 이미 수치화됨.
- 건물 파사드에 아이비/꽃장식/창가 화분 등 식생이 **뭉쳐서 풍성하게**
  붙어 있는 느낌(참고 이미지의 밀도感을 목표로 함). 단, 이는 여전히
  바닥 화단/생울타리처럼 **플레이트에 베이크**하거나 건물 스프라이트
  자체의 일부로만 포함하고, 별도 배치 가능한 오브젝트로 중복 표현하지
  않는다 — 이 배치 원칙(레이어 분리)은 디테일 레벨과 무관하게 그대로
  유지된다.
- 늦은 오후 웜톤 조명과 부드러운 대기 원근(멀수록 살짝 옅고 차가운 톤),
  창문의 따뜻한 실내 불빛 글로우(참고 이미지처럼 낮에도 은은하게 켜진
  느낌) — district 스케일에 따른 축소와 더불어 원경(school/tower)일수록
  아주 살짝 채도를 낮춰 깊이감을 더한다.

이 결정에 따라 `animals/cat`·`animals/puppy`·`animals/owl`은 더 이상
"KEEP(스타일 앵커)"으로 취급하지 않는다 — 기존 카툰 스타일이 새 목표
디테일 레벨보다 훨씬 단순해 더 이상 일관성의 기준이 될 수 없으므로,
**TEMPORARY PLACEHOLDER로 재분류하고 P2에서 참고 이미지 수준으로
재생성**한다(2.4절/5절에 반영).

### 1.6 "하나의 매칭 세트(one matched set)" 규칙

P0-A/P0-B 13개(정확히는 16개 파일 — 2절 각주 참고) 자산은 반드시 **같은
생성 세션/같은 스타일-키 참조 이미지**로 만들어야 한다. `ART_GENERATION_
HANDOFF_P0_2026-09-16.md`의 Step 0(스타일-키 마스터 오버뷰)이 이 절차를
구체화한다 — 매 프롬프트 앞에 동일한 global block(카메라/조명/팔레트/
텍스처/금지 목록)을 붙이는 것도 같은 목적이다.

### 1.7 금지 요소 (Forbidden elements)

사진(photographic) 소재, 이모지, 하드 아웃라인, 스톡 이미지 합성,
프랜차이즈/IP 요소(해리포터/호그와트류 마법사 모자·번개 흉터·문장·
로고 — IP SAFETY 전문은 브리프 §8 그대로), 실존/저작권 있는 건축물의
모작, 캔버스 안 텍스트/레터링(표지판 포함 — 표지판은 그림만, 문구 없음),
공식 Paul 캐릭터(신규 생성 금지, 기존 `paulReactions.js` 리액션 이미지만
재사용).

## 2. 자산 표

컬럼: `asset_key` | filename | type | canvas(master, 2x px) | render
(1x @ W=358, district 미적용 → district 적용) | aspect ratio | transparent |
anchor | perspective note | light dir | shadow | footprint(% of W) |
z-depth 동작 | variants | priority | lifecycle.

**공통값(표에서 반복 생략)**: light dir = 전부 top-left 동일. shadow =
스프라이트류는 ≤15% soft contact shadow(1.1절), 플레이트류는 로트
파운데이션 주변만 옅게 베이크 가능. perspective = 전부 3/4 top-down ≈30도
동일(1.1절), 표에는 district별 스케일 차이만 특기.

### 2.1 P0-A (Lv1 신뢰도, 9개 파일 — 브리프 §8 순서 그대로)

| asset_key | filename | type | canvas(master) | render(1x, district 적용) | aspect | transparent | anchor | footprint(%W) | z-depth | variants | lifecycle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `env/plate-home` | `plate-home.webp` | plate | 1080×1242 | 씬 폭 전체 fill, height=1.15×W(=W=358이면 412px) | 1:1.15 | NO(opaque, full-bleed) | top-left fill | N/A(배경 전체) | ground/band baseline — 스택 최하단(가장 앞) | 없음(P0) | SPEC_ONLY(신규 컴포지션, 구 `backgrounds/village-*` 대체) |
| `env/plate-fog-horizon` | `plate-fog-horizon.webp` | plate | 1080×346 | 씬 폭 전체 fill, height=0.32×W(=115px @358) | 1:0.32 | NO(opaque) | top-left fill | N/A | fog band — 최상단 잠금 district 위에 재사용(범용) | 없음 | SPEC_ONLY(구 `TownFogLayer` CSS 그라디언트+`backgrounds/fog` P1 계획 대체) |
| `buildings/my-house` | `my-house.webp` | sprite(lot) | 768×640 | 150×125(42%W, home scale 1.00) | 6:5 | YES | bottom-center | 42 | objects — home 밴드 cottage 로트 고정 위치 | `my-house-lights`(P1, 이번 배치 제외) | SPEC_ONLY — **REPLACE** 구 `buildings/my-house`(128×160, DEPLOYED, 브리프 §7 "too small, garden baked, wrong hierarchy") |
| `nature/tree` | `tree.webp` | sprite(spot) | 384×512 | 72×96(20%W, home scale 1.00) | 3:4 | YES | bottom-center | 20 | objects — SPOT_MAP 스팟, y-order로 정렬 | 없음 | SPEC_ONLY — **REPLACE** 구 `nature/tree`(96×128, DEPLOYED, 브리프 §7 TEMPORARY PLACEHOLDER→이번 배치로 교체) |
| `nature/flower-garden` | `flower-garden.webp` | sprite(spot) | 384×192 | 64×32(18%W, home scale 1.00) | 2:1 | YES | bottom-center | 18(폭)×8(높이 비율 참고) | objects — SPOT_MAP 스팟 | 없음 | SPEC_ONLY — 구 `nature/flower-garden`은 `PAUL_TOWN_ASSET_CONTRACT.md` 기준 SPEC_ONLY(후보 미제출 상태)였으므로 완전 신규 |
| `decorations/bench` | `bench.webp` | sprite(spot) | 320×224 | 47×33(13%W, home scale 1.00) | 10:7 | YES | bottom-center | 13 | objects — SPOT_MAP 스팟 | 없음 | SPEC_ONLY — **주의: 이 asset_key는 `DEFERRED` 이력 有**(4절 QA 특기사항 참고) |
| `decorations/street-lamp` | `street-lamp.webp` | sprite(spot) | 160×576 | 22×79(6%W, home scale 1.00) | 5:18(≈1:3.6, 구 계약 1:2/1:2.5보다 대폭 슬림) | YES | bottom-center | 6 | objects — SPOT_MAP 스팟 | `-on` 점등(P1, 제외) | SPEC_ONLY — **REPLACE** 구 `decorations/street-lamp`(144×288 2x, WIRED 미merge, 캔버스 대폭 변경) |
| `decorations/red-post-box` | `red-post-box.webp` | sprite(spot) | 160×352 | 22×48(6%W, home scale 1.00) | 5:11(≈2:3, 구 계약과 동일 비율대) | YES | bottom-center | 6 | objects — SPOT_MAP 스팟 | 없음 | SPEC_ONLY — **REPLACE** 구 `decorations/red-post-box`(144×216 2x, DEPLOYED) — 팔레트 예외(전통 우체통 빨강) 유지 |
| `ui/lot-sign` | `lot-sign.webp` | ui(overlay) | 160×192 | 24×29(로트 위 고정 배치, home scale 1.00) | 5:6 | YES | bottom-center | 로트 크기에 종속(별도 footprint % 없음) | overlay — 소유 안 된 로트 위, 로트 파운데이션과 건물 사이 z | 없음 | SPEC_ONLY(완전 신규 — "for sale" 나무 팻말, 텍스트 없이 그림만) |

### 2.2 P0-B (Lv1 학습가시성 + Lv3, 7개 파일)

| asset_key | filename | type | canvas(master) | render(1x, district 적용) | aspect | transparent | anchor | footprint(%W) | z-depth | variants | lifecycle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `nature/garden-stage-0` | `garden-stage-0.webp` | overlay(patch) | 448×224 | home 플레이트의 베이크된 화단 형태에 맞춤 — 정확 px는 `WORLD_LAYOUT_REDESIGN_2026-09-16.md` §3의 화단 좌표 확정 후 결정(3.3절 참고) | 2:1 | YES | bottom-center(화단 내부) | N/A(고정 화단, footprint 클래스 없음) | patch — 플레이트 위, 로트/스팟 스프라이트보다 아래 | 5단계 자체가 진행 애니메이션(stage-0..4) | SPEC_ONLY — **REPLACE** 구 `nature/garden-stage-0`(64×64 정사각 독립 타일, DEPLOYED, 브리프 §7 "isolated square tiles, wrong perspective") |
| `nature/garden-stage-1` | `garden-stage-1.webp` | overlay(patch) | 448×224 | 위와 동일 | 2:1 | YES | 위와 동일 | N/A | 위와 동일 | 위와 동일 | SPEC_ONLY — REPLACE(동일 사유) |
| `nature/garden-stage-2` | `garden-stage-2.webp` | overlay(patch) | 448×224 | 위와 동일 | 2:1 | YES | 위와 동일 | N/A | 위와 동일 | 위와 동일 | SPEC_ONLY — REPLACE(동일 사유) |
| `nature/garden-stage-3` | `garden-stage-3.webp` | overlay(patch) | 448×224 | 위와 동일 | 2:1 | YES | 위와 동일 | N/A | 위와 동일 | 위와 동일 | SPEC_ONLY — REPLACE(동일 사유) |
| `nature/garden-stage-4` | `garden-stage-4.webp` | overlay(patch) | 448×224 | 위와 동일 | 2:1 | YES | 위와 동일 | N/A | 위와 동일 | 위와 동일 | SPEC_ONLY — REPLACE(동일 사유) |
| `env/plate-bookshop-lane` | `plate-bookshop-lane.webp` | plate | 1080×918 | 씬 폭 전체 fill, height=0.85×W(=304px @358) | 1:0.85 | NO(opaque) | top-left fill | N/A | ground/band — lane 밴드(home 위) | 없음 | SPEC_ONLY(신규 district) |
| `buildings/book-shop` | `book-shop.webp` | sprite(lot) | 704×704 | 스케일 전 129×129 → lane scale 0.86 적용 시 실제 111×111(36%W×0.86, 1.3절 계산식 검증됨) | 1:1 | YES | bottom-center | 36(스케일 전 기준) | objects — lane 밴드 Book Shop 로트 고정 위치 | `book-shop-lights`(P1, 제외) | SPEC_ONLY — 구 `buildings/book-shop`(128×160, DEPLOYED)을 **교체**(브리프 §7은 TEMPORARY PLACEHOLDER로 분류했으나 이번 P0-B가 바로 그 교체 배치) |

> 파일 수 각주: 브리프 §8 P0-B 문단은 "(13 assets total: ... garden-stage-0..4
> (one block with 5 stage descriptions), plate-bookshop-lane, book-shop)"라고
> 표현했다. 이 문서는 P0-A 9개 파일 + P0-B 7개 파일(garden-stage 5개 개별
> 파일 + plate-bookshop-lane + book-shop) = **총 16개 파일**로 집계했다 —
> 브리프가 "garden-stage-0..4"를 하나의 항목으로 묶어 셀 때(9+1+2=12
> "항목") 표현과 개별 파일 수(16개) 사이에 산술 차이가 있다. 이 문서는
> 추측으로 숫자를 맞추지 않고 실제 파일 목록(2.1+2.2 표의 행 수)을
> 그대로 진실로 삼는다 — `ART_GENERATION_HANDOFF_P0_2026-09-16.md`도
> 동일하게 "12개 프롬프트 블록(garden-stage는 5단계를 한 블록에), 16개
> 산출 파일" 기준으로 작성했다.

### 2.3 P1 (이번 배치 범위 밖 — 표만 선제 규정, 생성 지시 없음)

| asset_key | filename | type | canvas(master) | render(1x, district 적용) | aspect | transparent | anchor | footprint(%W, 스케일 전) | z-depth | variants | lifecycle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `env/plate-square` | `plate-square.webp` | plate | 1080×972 | height=0.90×W(322px @358) | 1:0.9 | NO | top-left fill | N/A | ground/band — square 밴드 | 없음 | SPEC_ONLY |
| `buildings/cafe` | `cafe.webp` | sprite(lot) | 704×704 | 스케일 전 121×121 → square scale 0.76 적용 시 92×92 | 1:1 | YES | bottom-center | 34 | objects — square 밴드 Café 로트 | `cafe-lights`(P1) | SPEC_ONLY — REPLACE 구 `buildings/cafe`(128×160, DEPLOYED) |
| `decorations/stone-fountain` | `stone-fountain.webp` | sprite(lot, 광장 중앙) | 384×384 | 스케일 전 57×57 → square scale 0.76 적용 시 44×44 | 1:1 | YES | bottom-center | 16 | objects — square 밴드 중앙 로트 | 없음 | SPEC_ONLY — REPLACE 구 `decorations/stone-fountain`(144×144, WIRED 미merge) |
| `decorations/town-sign` | `town-sign.webp` | sprite(spot) | 256×384 | 스케일 전 32×48(9%W) → 배치 밴드의 scale 적용 | 2:3 | YES | bottom-center | 9 | objects — SPOT_MAP 스팟 | 없음 | SPEC_ONLY — REPLACE 구 `decorations/town-sign`(144×216, WIRED 미merge) |
| `buildings/my-house-lights` | `my-house-lights.webp` | overlay | 768×640(베이스와 동일) | 베이스와 동일 | 6:5 | YES(창문 불빛만) | 베이스와 동일 | 베이스와 동일 | objects — 베이스 바로 위 합성 | — | SPEC_ONLY |
| `buildings/book-shop-lights` | `book-shop-lights.webp` | overlay | 704×704(베이스와 동일) | 베이스와 동일 | 1:1 | YES(창문 불빛만) | 베이스와 동일 | 베이스와 동일 | objects — 베이스 바로 위 합성 | — | SPEC_ONLY |
| `env/plate-river` | `plate-river.webp` | plate | 1080×540 | height=0.50×W(179px @358) | 1:0.5 | NO | top-left fill | N/A | ground/band — river 밴드 | 없음 | SPEC_ONLY |
| `special/bridge` | `bridge.webp` | sprite(lot, 강 중앙) | 960×480 | 스케일 전 157×78 → river scale 0.70 적용 시 110×55 | 2:1 | YES | bottom-center | 44 | objects — river 밴드 중앙 로트, 길이 다리를 건너는 구간에 정합 | 없음(창문 없음, `-lights` 대상 아님) | SPEC_ONLY — REPLACE 구 `special/bridge`(320×160, WIRED 미merge) |

### 2.4 P2 (이번 배치·다음 배치 모두 범위 밖 — 표만 선제 규정)

| asset_key | filename | type | canvas(master) | render(1x, district 적용) | aspect | transparent | anchor | footprint(%W, 스케일 전) | z-depth | variants | lifecycle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `env/plate-school` | `plate-school.webp` | plate | 1080×864 | height=0.80×W(286px @358) | 1:0.8 | NO | top-left fill | N/A | ground/band — school 밴드 | 없음 | SPEC_ONLY |
| `special/english-school` | `english-school.webp` | sprite(lot) | 832×704 | 스케일 전 143×121 → school scale 0.64 적용 시 92×77 | ≈1.18:1 | YES | bottom-center | 40 | objects — school 밴드 로트(센터-레프트) | `english-school-lights`(P1) | SPEC_ONLY — REPLACE 구 `special/english-school`(256×308, WIRED 미merge) |
| `env/plate-tower` | `plate-tower.webp` | plate | 1080×1026 | height=0.95×W(340px @358), 하늘/먼 언덕 포함(district 스택 유일하게 지평선 노출) | 1:0.95 | NO | top-left fill | N/A | ground/band — tower 밴드(스택 최상단) | 없음 | SPEC_ONLY |
| `special/clock-tower` | `clock-tower.webp` | sprite(lot, 광장 중앙) | 384×1024 | 스케일 전 57×157(16 wide×44 tall) → tower scale 0.56 적용 시 32×88 | 3:8 | YES | bottom-center | 16(폭)×44(높이) | objects — tower 밴드 중앙 로트, 세트 내 최고 랜드마크 | `clock-tower-lights`(P1) | SPEC_ONLY — REPLACE 구 `special/clock-tower`(256×512, WIRED 미merge) |
| `nature/*-ivy`(P2, 정원 richness ≥60) | — | overlay | 대상 건물 베이스와 동일 캔버스 | 베이스와 동일 | 베이스와 동일 | YES | 베이스와 동일 | 베이스와 동일 | objects — 베이스 위 합성 | — | SPEC_ONLY(범위 밖, 캔버스만 선제 규정) |
| `nature/*-birds`(P2, 정원 richness ≥100) | — | overlay/sprite | TBD(작은 새 실루엣, 독립 스프라이트로 추정) | TBD | TBD | YES | bottom-center 추정 | 소형(sm급 추정) | objects | — | SPEC_ONLY(범위 밖, 세부 미정 — 이 문서가 확정하지 않음) |
| `decorations/street-lamp-on`(P1→P2 경계, 브리프는 P1 표기) | `street-lamp-on.webp` | overlay | 160×576(베이스와 동일) | 베이스와 동일 | 5:18 | YES(램프 헤드 글로우만) | 베이스와 동일 | 베이스와 동일 | objects — 베이스 위 합성 | — | SPEC_ONLY |
| `animals/cat`·`animals/puppy`·`animals/owl` | 기존 파일명 유지(cat.webp/puppy.webp/owl.webp) | sprite(spot) | 기존 매니페스트 캔버스 유지(144×108/144×108/144×192 2x) — 재생성 시에도 캔버스 규격은 유지 | 기존 렌더 유지 | 기존 유지(4:3/4:3/3:4) | YES | bottom-center | 8(cat/puppy)·6(owl) | objects — SPOT_MAP 스팟 | `-blink`(기존 계획) | **TEMPORARY PLACEHOLDER → P2 재생성 대상(2026-09-16 lead override, 1.5절 참고)** — 기존 DEPLOYED 카툰 스타일은 더 이상 스타일 앵커가 아니며, 참고 이미지(`마을그림.png`) 수준의 디테일로 매칭 세트에 맞춰 재생성한다. 현재 파일은 재생성 전까지 임시로 계속 사용(non-breaking) |
| 계절 만개(seasonal bloom) 오버레이 | — | overlay | district 플레이트별 상이(TBD) | TBD | TBD | YES | N/A | N/A | patches | — | SPEC_ONLY(범위 훨씬 밖 — 캔버스도 미정, 이 문서가 발명하지 않음) |
| 인터랙티브 목적지 히트 영역(Book Shop 탭 등) | — | 해당 없음(아트 자산 아님, UI 히트 영역) | — | — | — | — | — | — | — | — | N/A — 이미지 자산이 아니므로 lifecycle 없음 |

## 3. 플레이트 연속성 계약 (Plate Continuity Contract)

### 3.1 길(path) 진입/이탈 x-position 고정값 (브리프 §3 원문 그대로)

한 마을을 하나의 연속된 길로 이어야 하므로, 각 플레이트 하단(이전
district에서 들어오는 지점)과 상단(다음 district로 나가는 지점)의 길
x-좌표(% of W)는 아래처럼 고정되고, 인접 플레이트끼리 이 값이 정확히
맞아야 이음매 없이 이어진다.

| plate | 진입(하단, % x) | 진행 | 이탈(상단, % x) |
|---|---|---|---|
| `plate-home` | 50%(정문 앞, bottom-centre) | 문 앞 → 우측으로 곡선 상승 | 78% |
| `plate-bookshop-lane` | 78%(home의 이탈 x와 정합) | Book Shop 로트를 지나 | 22% |
| `plate-square` | 22%(lane의 이탈 x와 정합) | 분수를 원형으로 돎 | 50%(top-centre) |
| `plate-river` | 50%(square의 이탈 x와 정합) | 다리를 중앙으로 가로지름 | 50%(school의 진입 x와 정합) |
| `plate-school` | 50%(river의 이탈 x와 정합) | 교사 앞 교정을 지나 | ≈70% |
| `plate-tower` | ≈70%(school의 이탈 x와 정합) | 시계탑 광장에서 종결 | 해당 없음(마을 최종 종착지, 더 이상 이탈 없음) |
| `plate-fog-horizon` | 해당 district 최상단 이탈 x와 동일한 위치에서 길이 계속되되 안개 속으로 흐려짐(정확한 시각 처리는 4절 참고) | — | — |

이 표는 브리프 §3 "Path continuity (snake)" 문단을 표로 재구성했을 뿐
새 수치를 만들지 않았다.

### 3.2 각 플레이트에 베이크되는 것 / 되지 않는 것

**베이크됨(플레이트 자체에 그려짐)**: 지면(ground)/잔디(lawn), 생울타리·
돌담 경계(hedges/stone boundary), 구불구불한 자갈길(cobblestone path),
강(river, river 플레이트만), 언덕·하늘(hills/sky, tower 플레이트만),
빈 건물 로트의 **파운데이션(foundation footprint)만**(건물 자체는
아님 — 발판/기초 윤곽만), 정원 단계(garden-stage) 오버레이가 올라갈
**베이크된 화단 흙(flower-bed soil)** 자리.

**베이크되지 않음(별도 레이어/스프라이트로 분리)**: **모든 건물**(My
House/Book Shop/Café/Bridge/English School/Clock Tower — 소유 여부와
무관하게 전부 별도 sprite, 로트 파운데이션 위에 조건부로 얹힘),
**모든 장식**(tree/flower-garden/bench/street-lamp/red-post-box/
town-sign/stone-fountain/cat/puppy/owl — SPOT_MAP을 통해 배치되는
전부), **정원 단계(garden-stage) 오버레이 자체**(화단의 "흙"만 베이크,
그 위에 얹히는 성장 단계 그림은 분리된 오버레이 이미지), **안개 칩(fog
chip)**(다음 잠금 해제까지 남은 별 수 텍스트 — `fogState().chip`
문자열을 담는 흰 배경 알약(pill)은 CSS/DOM UI이지 베이크된 이미지가
아님).

### 3.3 로트 파운데이션 정확 위치 — 별도 문서 참조

각 로트(My House/Book Shop/Café/Fountain/Bridge/English School/Clock
Tower)의 플레이트 내 정확한 % 좌표는 이 문서가 발명하지 않는다.
`WORLD_LAYOUT_REDESIGN_2026-09-16.md`(동시에 다른 저자가 작성 중인 별도
설계 문서) §3이 그 원출처이며, 이 문서는 §3의 확정 좌표를 참조해
사용한다 — 원화가는 플레이트를 그릴 때 로트 자리에 **파운데이션(기초
윤곽 실루엣)만** 남겨 둔 채로 그리고, 정확한 위치/크기는 그 문서가 확정한
좌표를 따라 배치를 검증한다(2절 표의 "position TBD, pending WORLD_LAYOUT"
표기가 이 사실을 가리킨다).

## 4. 딜리버리 + QA

### 4.1 파일 포맷 / 네이밍

- **마스터**: PNG(무손실, 알파 채널 포함 RGBA) — 2절 표의 "canvas(master)"
  px가 이 마스터 해상도다.
- **납품**: WebP 1x + WebP 2x(무손실) — 기존 `PAUL_TOWN_ASSET_CONTRACT.md`
  §4 표준 export 파이프라인(콘텐츠 bbox 크롭 → 여백 ≥4% repad → 투명
  캔버스 중앙 배치 → PNG+WebP 1x/2x export)을 그대로 따른다.
- **네이밍**: `<folder>/<asset_key-suffix>.webp`(및 `@2x.webp`) — 기존
  컨벤션 그대로. 예: `buildings/my-house.webp`,
  `buildings/my-house@2x.webp`, `env/plate-home.webp`.
- **색공간**: sRGB.

### 4.2 투명도 / 알파 — `validateTownAssetCandidate.mjs` 실제 검사 기준과 일치

- **스프라이트/오버레이류(plate 제외)**: 실제 RGBA 알파 필수. 검증
  스크립트가 실제로 확인하는 항목 그대로 — `colorType=6`이면서
  `transparentPct > 0.5%`(완전 불투명 파일이 아님)이어야 하고, 콘텐츠
  바운딩박스 기준 전 방향 여백 ≥4%(`PAUL_TOWN_ASSET_CONTRACT.md` §0과
  동일). WebP 납품 후보는 컨테이너 헤더(`VP8X`/`VP8L`)의 `hasAlpha`
  플래그로 알파 유무만 확인 가능하고 픽셀 단위 여백/vignette는 스크립트가
  검사하지 못하므로(스크립트 주석에 명시된 한계) **육안 검토가 여전히
  필수**다.
- **베이크된 배경/글로우/비네트 절대 금지**: 검증 스크립트 주석이 이미
  기록했듯, 은은한 baked radial glow/vignette는 알파 통계(partial-alpha
  비율, bbox 비율, dilate 거리 등 3가지 시도)로 자동 탐지가 불가능함이
  실측 확인됐다 — 즉 **이 결함은 자동 게이트를 통과해도 실제로는
  REGEN_REQUIRED 사유일 수 있다**. 원화 발주 단계에서부터 "no drop
  shadow, no vignette, no glow, isolated on transparent background,
  single object, no scene, no extra background elements"를 모든
  스프라이트 프롬프트에 명시해 애초에 이 결함이 생기지 않도록 해야
  한다(`ART_GENERATION_HANDOFF_P0_2026-09-16.md`의 negative prompt가
  이를 담당).
- **플레이트류**: opaque, full-bleed — 투명 배경 요건이 스프라이트와
  다르다(2절 표에 `transparent: NO`로 명시된 행 전부). 플레이트끼리
  이어지는 상/하단 경계선만 3.1절 x-position이 맞으면 되고, 플레이트
  자체는 배경이 채워진 그림이다.

### 4.3 크기 예산(size budget)

- 플레이트(plate): WebP 1x 기준 ≤180KB.
- 스프라이트/오버레이(sprite/overlay/ui): WebP 1x 기준 ≤60KB.
- 예산 초과 시 원화가/발주자가 압축 설정을 조정하되, 알파 손실·해상도
  다운스케일로 4.2절 요건을 깨지 않는 선에서 처리한다.

### 4.4 리뷰 게이트(순서 엄수)

1. **스타일-키 승인** — `ART_GENERATION_HANDOFF_P0_2026-09-16.md` Step 0의
   마스터 오버뷰 이미지(1080×1920, 비납품용 참조 전용)를 운영자가 먼저
   승인한다. 이 단계를 건너뛰고 개별 자산을 생성하면 "매칭 세트" 요건
   (1.6절)이 깨질 위험이 크다.
2. **P0-A 생성 → 검증 → 승인**(9개 파일, 2.1절).
3. **P0-B 생성 → 검증 → 승인**(7개 파일, 2.2절) — P0-A 승인 후 착수(P0-A
   에서 확정된 스타일/스케일 기준을 P0-B가 그대로 이어받아야 하므로).
4. **P0-A+B 전체를 실제 화면(360/390/430px)에 배치해 본 뒤에만** P1의
   Café/School/Tower로 확장 여부를 평가한다 — 지시문이 명시한 순서
   ("evaluate before Café/School/Tower")이며, 이는 브리프 §1의
   "assets were generated one by one" 진단(스케일/원근/스타일 불일치의
   근본 원인)을 반복하지 않기 위함이다.

### 4.5 자산별 인수(acceptance) 체크리스트

모든 자산 공통(2.1/2.2절 16개 전부):
- [ ] 마스터 캔버스 px가 2절 표의 "canvas(master)" 값과 정확히 일치
- [ ] WebP 1x/2x 4파일 세트(PNG 마스터 포함 시 6파일) 존재, 파일명이
      2절 표의 filename과 정확히 일치
- [ ] `node scripts/validateTownAssetCandidate.mjs <assetKey> <filePath>`
      객관적 검증 전부 PASS(알파/여백/해상도)
- [ ] 좌상단 광원, 팔레트(1.4절 표) 준수, IP/텍스트/이모지/아웃라인
      금지 목록(1.7절) 위반 없음 — 사람의 시각 검토
- [ ] 다른 P0 자산들과 나란히 놓았을 때 상대 스케일이 1.3절 가이드와
      일치하는 느낌인가 — 사람의 시각 검토(픽셀 강제 아님)

추가로 자산별 특기사항:
- **`decorations/bench`** — `PAUL_TOWN_ASSET_CONTRACT.md` §2.5 기록상
  11차 재제출까지 전부 동일 계열 baked glow/vignette로 반려되어
  `DEFERRED` 처리된 이력이 있는 asset_key다. 이번 재발주는 캔버스/구도가
  완전히 바뀌었지만(320×224, home 밴드 SPOT_MAP 스팟) **같은 결함이
  재발할 위험이 가장 높은 항목으로 간주**하고, 검수 시 "배경 전체에
  걸친 은은한 방사형 밝기 변화가 있는가"를 다른 자산보다 더 엄격하게
  육안 확인한다. 자동 게이트가 이 결함을 못 잡는다는 사실(4.2절)이
  이 항목에 가장 직접적으로 적용된다.
- **`decorations/street-lamp`** — 구 계약 문서의 캔버스/종횡비 불일치
  각주(`PAUL_TOWN_ASSET_CONTRACT.md` "각주" 섹션, `1:2` vs `1:2.5`)는
  이 문서의 새 캔버스(160×576, 종횡비 5:18 ≈ 1:3.6)로 **완전히
  대체**된다 — 새 발주는 그 불일치를 물려받지 않으며, 기존 각주는
  "이번 문서 이전 캔버스에 대한 이력"으로만 유효하다.
- **`nature/garden-stage-0..4`** — 5단계를 나란히 놓았을 때 성장 과정이
  자연스럽게 읽히는지(카메라 각도/화단 형태/앵커가 5단계 모두 동일한지)
  반드시 확인(구 스펙 QA 항목 계승).
- **`env/plate-*` 전체** — 인접 플레이트와 이어 붙였을 때(3.1절
  x-position) 길/생울타리 경계선이 어긋나지 않는지 스크린샷 합성으로
  확인.

## 5. DO NOT 목록 + 이모지 폴백 보존

### 5.1 현재 자산에서 재사용 금지 (브리프 §7 REPLACE 목록 그대로)

다음은 새 원화 작업 시 **레퍼런스로도, 부분 합성 소스로도** 절대 재사용
금지: `buildings/my-house`(구 파일, 너무 작고 정원이 베이크돼 있으며
스케일 위계가 틀림), `nature/garden-stage-0..4`(구 파일, 독립 정사각
타일·잘못된 원근), `backgrounds/village-sky-backdrop`,
`backgrounds/village-hedge-border`, `backgrounds/village-cobblestone-tile`,
`backgrounds/garden-accent-1..3`(전부 사진 소재/혼합 매체), 모든 이모지
폴백(최종 아트에 이모지 사용 금지 — 폴백 전용), CSS 전용 지면/길/헤지/
포그 처리(전부 이번 배치의 베이크 플레이트로 대체).

**추가(2026-09-16 lead override, 1.5절 참고)**: `animals/cat`·
`animals/puppy`·`animals/owl`의 기존 DEPLOYED 파일은 위 REPLACE 목록에는
속하지 않는다(기능은 계속 정상 동작 — TEMPORARY PLACEHOLDER로 P2
재생성 전까지 그대로 사용). 다만 **스타일/디테일 레벨의 기준(레퍼런스)
으로는 더 이상 쓰지 않는다** — 이전 버전의 이 절이 이 세 자산을 새 P0
자산군의 디테일 레벨을 낮추는 근거로 인용했던 것이 lead에 의해
철회됐으므로, 새로 원화를 발주/검수하는 어떤 세션도 이 세 자산의 현재
카툰 스타일을 참고 삼아 새 자산의 디테일을 그쪽에 맞추지 않는다.

### 5.2 이모지 폴백 보존 — 이 문서는 엔지니어링 계약을 바꾸지 않는다

이 문서가 규정하는 신규 자산이 아직 `TOWN_ASSETS`에 배선되지 않은 동안
(lifecycle `SPEC_ONLY`/`CANDIDATE`/`REGEN_REQUIRED`/`APPROVED` 단계 전부),
`townAsset(assetKey)`는 여전히 `null`을 반환해야 하고 호출부는 여전히
`TOWN_ITEM_META.emoji`로 폴백해야 한다(`PAUL_TOWN_ASSET_CONTRACT.md` §0,
`V2A_ASSET_SPEC.md` §4 연동 노트와 동일 원칙). 이 문서는 "그림이 어떻게
생겨야 하는가"만 규정하고 "그림이 없을 때 무엇을 보여주는가"는 손대지
않는다 — 새 world 컴포지션(district 스택/로트/SPOT_MAP)으로 렌더러가
바뀌더라도 이 폴백 계약은 동일하게 유지돼야 한다(구현 시 implementer
책임, `WORLD_DESIGN_BRIEF.md` §10 구현 계획 참고).

---

_작성: 2026-09-16. 근거: `WORLD_DESIGN_BRIEF.md`(lead 확정 브리프),
참고 이미지 `마을그림.png`(컴포지션/원근/스케일/식생/깊이감/조명 관찰),
`docs/design/town/PAUL_TOWN_ASSET_CONTRACT.md`,
`docs/design/town/V2A_ARTWORK_SPEC_FINAL.md`,
`docs/design/town/V2A_ASSET_SPEC.md`,
`src/assets/town/assetManifest.js`,
`scripts/validateTownAssetCandidate.mjs`(전부 이 세션에서 직접 Read로
확인, 추측 수치 없음). 이미지 생성/코드/DB 변경 없음._
