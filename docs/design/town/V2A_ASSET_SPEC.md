# Paul Town V2-A — 에셋 스펙 (British Storybook Village)

> 상태: 설계 문서(디자인 전용, 코드 변경 없음). 이 문서가 참조하는
> `PR #44`(V2-A 씬 레이아웃)는 이 브랜치에 병합되어 있지 않고,
> `docs/design/town/*.md`도 이 시점에는 이 파일 하나뿐이다. 실제 배치/렌더
> 로직(셀 높이 px 등 런타임 세부값)은 `src/components/town/TownGrid.jsx`
> 구현체가 최종 결정하며, 이 문서는 **소스 아트(에셋) 캔버스 규격과
> asset_key 계약**만 규정한다.

## 0. 배경

V2-A는 아이가 보는 8x6 격자를 그대로 유지한 채(내부 좌표계는 v1과 동일),
그 위에 세로형(portrait) 영국 스토리북 마을 씬을 렌더한다. 씬 박스 종횡비는
8:13, 폭은 데스크톱에서 컨테이너 폭(최대 512px), 360px 폰에서는 328px다.
셀 폭은 씬 폭의 12.5%(1/8) — 약 41px(328px 씬 기준) / 64px(512px 씬 기준).
오브젝트는 셀의 **하단-중앙(bottom-centre)**에 앵커되고, z-order는 행(row)
순서를 따른다. 렌더링은 `asset_key` 주도 — `src/assets/town/index.js`의
`TOWN_ASSETS`가 `asset_key → 이미지 URL`을 매핑하며, 현재는 빈 객체라
호출부(`TownGrid`/`TownShopPanel`/`TownInventory`)가 전부 이모지로 폴백한다
(확인: `src/assets/town/index.js` 12행, `scripts/testTownUiStatic.mjs`
92행). 카탈로그(`src/utils/town/townCatalog.js`)의 17개 아이템은 이미
`asset_key`를 갖고 있다(`CATEGORY_FOLDER`: house→buildings, nature→nature,
animal→animals, decoration→decorations, special→special).

## 1. 목적 & 공통 규칙

- **파일 포맷**: 투명 배경 PNG 또는 WebP(권장 WebP), sRGB 색공간.
- **그림자**: 베이크된 방향성 그림자 금지, 바닥 접촉부의 부드러운 연락
  그림자(contact shadow, soft blur, 15% 이하 불투명도)만 허용.
- **화각**: 일관된 3/4 탑다운 스토리북 앵글(약 30도), 광원은 좌상단
  고정(모든 에셋 동일 방향).
- **스타일**: 아웃라인 없는 페인터리(outline-free painterly), 아늑하고
  귀엽고 프리미엄한 느낌. 해리포터/호그와트 등 어떤 IP 요소도 금지 —
  문장(crest)/로고 금지. 공식 폴(Paul) 캐릭터는 이 에셋 세트에 절대
  포함하지 않는다(별도 `HeroReaction`/`paulReactions.js` 경로로만 렌더,
  `testTownUiStatic.mjs` 2절이 이를 정적으로 강제).
- **네이밍**: `<folder>/<asset_key>.webp` + 레티나용 `<folder>/<asset_key>@2x.webp`.
  예) `buildings/british-cottage.webp`, `buildings/british-cottage@2x.webp`.
- **앵커 포인트**: 서 있는 오브젝트(건물/자연/장식/동물)는 **하단-중앙**,
  바닥에 까는 오버레이(잔디/길/헤지/포그 타일)는 **중앙(fill)**.
- **발자국(footprint) 클래스** — 씬 폭 대비 최대 렌더 폭:
  - `lg`(집/특별): 씬 폭의 19%, 최대 112px
  - `md`(자연): 씬 폭의 14%, 최대 84px
  - `sm`(동물/장식): 씬 폭의 11%, 최대 64px
- **안전 여백**: 캔버스 가장자리에 투명 여백 4% 이상(크롭 시 잘림 방지).
- **2x 내보내기**: 모든 스프라이트는 1x/2x 세트로 납품(레티나 대응).
- **창문 조명 변형**: 오버레이 방식 채택(아래 "조명 오버레이 컨벤션" 참고,
  건물마다 `-lit` 버전을 통째로 새로 그리지 않는다).

### 조명 오버레이 컨벤션(선택 사항, 확정)

건물류(버딩+special) 각각에 대해 **베이스 스프라이트와 동일한 캔버스/앵커**를
쓰는 `<asset_key>-lights.webp`(+`@2x`) 오버레이 파일을 별도로 준비할 수
있다. 이 파일은 창문 불빛/따뜻한 글로우만 담은 투명 PNG이며, 야간/저녁
분위기(ambient) 기능이 나중에 붙을 때 베이스 이미지 위에 `<img>` 한 장을
추가로 올려 합성하는 용도다. **이번 V2-A 1차 납품에는 필수가 아니다** —
베이스 스프라이트만으로도 완결된 그림이어야 한다. 동일한 방식을 작은
장식류의 점등 변형(`street-lamp-on`)과 동물의 깜빡임 프레임(`-blink`)에도
쓴다(각 해당 행의 메모 참고).

## 2. 에셋 테이블

컬럼: 파일명 | asset_key | 카테고리/폴더 | 타겟 픽셀 1x/2x | 종횡비 | 배경 |
앵커 | 시각 발자국(cell) | 모바일 렌더 360px/512px | 메모·상태 변형

### 2.1 BUILDINGS (`buildings/`, `special/`)

| 파일명 | asset_key | 카테고리/폴더 | 타겟 1x/2x | 종횡비 | 배경 | 앵커 | 발자국(cell) | 렌더 360/512 | 메모 |
|---|---|---|---|---|---|---|---|---|---|
| buildings/my-house.webp | `buildings/my-house` | house(고정, 카탈로그 외) | 128×160 / 256×320 | 4:5 | 투명 | 하단-중앙 | 1×1(lg) | 62×78 / 97×121 | 플레이어 기본 소유 시작 집(구매 불가, `TOWN_ITEM_META`에 없음) — V2-A 브리프 지정, 항상 고정 셀에 존재. `-lights.webp` 오버레이 선택 |
| buildings/british-cottage.webp | `buildings/british-cottage` | house/buildings | 128×160 / 256×320 | 4:5 | 투명 | 하단-중앙 | 1×1(lg) | 62×78 / 97×121 | `-lights.webp` 오버레이 선택 |
| buildings/book-shop.webp | `buildings/book-shop` | house/buildings | 128×160 / 256×320 | 4:5 | 투명 | 하단-중앙 | 1×1(lg) | 62×78 / 97×121 | 책방 간판 요소 포함 가능(텍스트 없이 아이콘화), `-lights.webp` 오버레이 선택 |
| buildings/cafe.webp | `buildings/cafe` | house/buildings | 128×160 / 256×320 | 4:5 | 투명 | 하단-중앙 | 1×1(lg) | 62×78 / 97×121 | 파라솔/야외 테이블 실루엣 허용, `-lights.webp` 오버레이 선택 |
| special/english-school.webp | `special/english-school` | special/special | 128×154 / 256×308 | 5:6 | 투명 | 하단-중앙 | 1×1(lg) | 62×74 / 97×116 | 카탈로그 category는 `special`(house 아님) — asset_key 폴더 `special/` 확인 필요, `-lights.webp` 오버레이 선택 |
| special/clock-tower.webp | `special/clock-tower` | special/special | 128×256 / 256×512 | 1:2 | 투명 | 하단-중앙 | 1×1(lg, 세로 과장) | 62×124 / 97×194 | 마을 랜드마크, 시계 문자반은 텍스트 없이 심볼로만, `-lights.webp` 오버레이 선택 |
| special/bridge.webp | `special/bridge` | special/special | 160×80 / 320×160 | 2:1(가로) | 투명 | 하단-중앙 | 2×1(가로 2칸 시각 span) | 82×41 / 128×64 | 발자국 공식(19%/112px)의 예외 — 폭을 셀 2칸(2×cell width)으로 명시 지정. 배치 충돌 로직상 실제 점유 셀 수는 implementer 확인 필요(이 문서는 시각 규격만 규정), 조명 오버레이 없음(창문 없음) |

### 2.2 NATURE (`nature/`, 단 `stone-fountain`은 카탈로그 규칙상 `decorations/`)

| 파일명 | asset_key | 카테고리/폴더 | 타겟 1x/2x | 종횡비 | 배경 | 앵커 | 발자국(cell) | 렌더 360/512 | 메모 |
|---|---|---|---|---|---|---|---|---|---|
| nature/tree.webp | `nature/tree` | nature/nature | 96×128 / 192×256 | 3:4 | 투명 | 하단-중앙 | 1×1(md) | 46×61 / 72×96 | 낙엽수, 사계절 변형 없음(1차 납품) |
| nature/flower-garden.webp | `nature/flower-garden` | nature/nature | 96×64 / 192×128 | 3:2(가로) | 투명 | 하단-중앙 | 1×1(md) | 46×31 / 72×48 | 낮은 화단, 지면에 밀착 |
| decorations/stone-fountain.webp | `decorations/stone-fountain` | decoration/decorations | 72×72 / 144×144 | 1:1 | 투명 | 하단-중앙 | 1×1(sm) | 36×36 / 56×56 | **주의**: 이 문서의 NATURE 그룹핑은 시각적 분류일 뿐 — `townCatalog.js`의 실제 `category`는 `decoration`이므로 asset_key/폴더/발자국 클래스(sm, 11%)는 `decorations/`를 따른다(카탈로그가 진실 원천) |
| nature/garden-stage-0.webp | `nature/garden-stage-0` | ambient(카탈로그 외) | 64×64 / 128×128 | 1:1 | 투명 | 하단-중앙 | 고정 1플롯(구매 발자국 클래스 미적용) | 약 28×28 / 44×44 | 씨앗(seed) 단계 |
| nature/garden-stage-1.webp | `nature/garden-stage-1` | ambient(카탈로그 외) | 64×64 / 128×128 | 1:1 | 투명 | 하단-중앙 | 고정 1플롯 | 약 28×28 / 44×44 | 새싹(sprout) 단계 |
| nature/garden-stage-2.webp | `nature/garden-stage-2` | ambient(카탈로그 외) | 64×64 / 128×128 | 1:1 | 투명 | 하단-중앙 | 고정 1플롯 | 약 28×28 / 44×44 | 꽃(flower) 단계 |
| nature/garden-stage-3.webp | `nature/garden-stage-3` | ambient(카탈로그 외) | 64×64 / 128×128 | 1:1 | 투명 | 하단-중앙 | 고정 1플롯 | 약 28×28 / 44×44 | 만개(bloom) 단계 |
| nature/garden-stage-4.webp | `nature/garden-stage-4` | ambient(카탈로그 외) | 64×64 / 128×128 | 1:1 | 투명 | 하단-중앙 | 고정 1플롯 | 약 28×28 / 44×44 | 풀만개(full) 단계 — 5단계 전부 동일 앵커·캔버스로 프레임 전환처럼 자연스럽게 교체 가능해야 함 |

### 2.3 DECORATION (`decorations/`, `ui/`)

| 파일명 | asset_key | 카테고리/폴더 | 타겟 1x/2x | 종횡비 | 배경 | 앵커 | 발자국(cell) | 렌더 360/512 | 메모 |
|---|---|---|---|---|---|---|---|---|---|
| decorations/bench.webp | `decorations/bench` | decoration/decorations | 72×48 / 144×96 | 3:2(가로) | 투명 | 하단-중앙 | 1×1(sm) | 36×24 / 56×37 | |
| decorations/town-sign.webp | `decorations/town-sign` | decoration/decorations | 72×108 / 144×216 | 2:3(세로) | 투명 | 하단-중앙 | 1×1(sm) | 36×54 / 56×84 | 표지판 목판에 텍스트 없음(그림만) |
| decorations/shop-lamp.webp | `decorations/shop-lamp` | decoration/decorations | 72×144 / 144×288 | 1:2(세로) | 투명 | 하단-중앙 | 1×1(sm) | 36×72 / 56×112 | 레거시 id(구 `townShop.js` 상수와 동일 가격) |
| decorations/street-lamp.webp | `decorations/street-lamp` | decoration/decorations | 72×144 / 144×288 | 1:2.5(세로) | 투명 | 하단-중앙 | 1×1(sm) | 36×90 / 56×140 | + `decorations/street-lamp-on.webp`(동일 캔버스/앵커, 램프 헤드만 따뜻한 글로우로 점등) — 야간 ambient 붙을 때 스왑용, 1차 납품 선택 |
| decorations/red-post-box.webp | `decorations/red-post-box` | decoration/decorations | 72×108 / 144×216 | 2:3(세로) | 투명 | 하단-중앙 | 1×1(sm) | 36×54 / 56×84 | 버건디(#7a2e3a)가 아닌 전통 영국 우체통 빨강 유지(팔레트 예외 — 우체통은 상징색이 필요), 나머지 톤은 팔레트 준수 |
| ui/parcel.webp | `ui/parcel` | ui(인벤토리 전용) | 48×48 / 96×96 | 1:1 | 투명 | 중앙 | N/A(그리드 미배치) | 고정 48×48(그리드 스케일 미적용) | "미배치 아이템" 상태를 나타내는 인벤토리 카드 아이콘(소포/선물상자 모티프). 그리드에는 렌더되지 않음 |

### 2.4 ANIMALS (`animals/`)

| 파일명 | asset_key | 카테고리/폴더 | 타겟 1x/2x | 종횡비 | 배경 | 앵커 | 발자국(cell) | 렌더 360/512 | 메모 |
|---|---|---|---|---|---|---|---|---|---|
| animals/cat.webp | `animals/cat` | animal/animals | 72×54 / 144×108 | 4:3(가로) | 투명 | 하단-중앙 | 1×1(sm) | 36×27 / 56×42 | 아이들(idle) 포즈. + `animals/cat-blink.webp`(동일 캔버스, 눈 감은 프레임) 선택 — 2프레임 CSS/JS 토글용 |
| animals/puppy.webp | `animals/puppy` | animal/animals | 72×54 / 144×108 | 4:3(가로) | 투명 | 하단-중앙 | 1×1(sm) | 36×27 / 56×42 | 아이들 포즈. + `animals/puppy-blink.webp` 선택 |
| animals/owl.webp | `animals/owl` | animal/animals | 72×96 / 144×192 | 3:4(세로) | 투명 | 하단-중앙 | 1×1(sm) | 36×48 / 56×75 | 나뭇가지/지붕에 걸터앉은 포즈. + `animals/owl-blink.webp` 선택 |

### 2.5 ENVIRONMENT (`backgrounds/`, `ui/`)

| 파일명 | asset_key | 카테고리/폴더 | 타겟 1x/2x | 종횡비 | 배경 | 앵커 | 발자국(cell) | 렌더 360/512 | 메모 |
|---|---|---|---|---|---|---|---|---|---|
| backgrounds/grass.webp | `backgrounds/grass` | 배경/backgrounds | 256×256 / 512×512 | 1:1 | 타일링(seamless) | 중앙(fill) | N/A(배경 레이어) | CSS로 셀/행 크기에 맞춰 스케일(정확한 런타임 px는 `TownGrid` 구현체 결정 — 이 문서는 소스 캔버스만 규정) | 기본 잔디 바닥 |
| backgrounds/grass-clover.webp | `backgrounds/grass-clover` | 배경/backgrounds | 256×256 / 512×512 | 1:1 | 타일링(seamless) | 중앙(fill) | N/A | 위와 동일 | 클로버 무늬가 섞인 잔디 변형(밀도 낮게, 포인트용) |
| backgrounds/dirt-edge.webp | `backgrounds/dirt-edge` | 배경/backgrounds | 256×64 / 512×128 | 4:1(가로 스트립) | 타일링(가로 반복) | N/A(스트립 채움) | N/A | 위와 동일 | 잔디↔길 경계선용 흙 가장자리 스트립 |
| backgrounds/hedge-border.webp | `backgrounds/hedge-border` | 배경/backgrounds | 256×96 / 512×192 | 8:3(가로 스트립) | 타일링(가로 반복) | N/A(스트립 채움) | N/A | 위와 동일 | 씬 가장자리를 둘러싸는 낮은 생울타리 |
| backgrounds/path-straight.webp | `backgrounds/path-straight` | 배경/backgrounds | 128×128 / 256×256 | 1:1 | 타일링(모서리 일치) | 중앙(fill) | 1셀 | 위와 동일 | 자갈길 직선 구간 |
| backgrounds/path-corner.webp | `backgrounds/path-corner` | 배경/backgrounds | 128×128 / 256×256 | 1:1 | 타일링(모서리 일치) | 중앙(fill) | 1셀 | 위와 동일 | 자갈길 코너(90도) 구간 |
| backgrounds/path-t.webp | `backgrounds/path-t` | 배경/backgrounds | 128×128 / 256×256 | 1:1 | 타일링(모서리 일치) | 중앙(fill) | 1셀 | 위와 동일 | 자갈길 T자 분기 구간 |
| backgrounds/fog.webp | `backgrounds/fog` | 배경/backgrounds | 512×512 / 1024×1024 | 1:1 | 타일링(부드러운 알파) | 중앙(fill, 전체 씬 오버레이) | N/A | 위와 동일 | 저채도 노이즈/그라디언트, 낮은 불투명도(원경 흐림 연출용, 전경 오브젝트를 가리지 않도록 상단부에만 짙게) |
| (파일 없음 — CSS만) | — | — | — | — | — | — | — | — | **잠긴 아이템 실루엣**: 새 파일 없이 해당 건물/아이템 스프라이트를 15% 불투명도 + blur(CSS filter)로 재사용 |
| (파일 없음 — CSS만) | — | — | — | — | — | — | — | — | **별 칩(star chip)**: 이미지 없이 CSS(radial-gradient/box-shadow)로 구현 |
| ui/hud-sign-bg.webp | `ui/hud-sign-bg` | ui | 288×96 / 576×192 | 3:1 | 투명(가장자리) | 중앙(fill) | N/A | — | 상단 HUD의 나무 표지판 배경(선택 사항). 3-슬라이스(좌/중/우) 방식으로 폭 가변 대응 — 중앙 조각만 가로로 반복/스트레치 |
| (파일 없음 — CSS만) | — | — | — | — | — | — | — | — | **시트 핸들(bottom-sheet 손잡이)**: 이미지 없이 CSS(작은 rounded bar)로 구현 |

## 3. 생성 프롬프트 템플릿

공통 팔레트: 웜 크림 `#fdebd0`/`#f6e3c8`, 모스 그린 `#cfe3c0`/`#8fb37a`,
머티드 네이비 `#1e2a5a`, 버건디 `#7a2e3a`, 웜 앰버 `#e0a73a`, 소프트 골드
`#c9a227`, 우드 `#8b6f3e`. 공통 네거티브(모든 카테고리 공통 적용):
`no text, no letters, no logos, no crests, no watermark, no human faces,
no Harry Potter or Hogwarts elements, no wizard hats, no lightning bolt
scars, no house crests, no copyrighted IP, no photorealism, no outlines,
no drop shadow, no background`.

- **건물(BUILDINGS)**: "Cozy British storybook village building, 3/4
  top-down isometric-ish angle at ~30 degrees, soft painterly digital
  illustration, warm cream and moss green palette (#fdebd0, #cfe3c0,
  #8b6f3e wood trim), thatched or slate roof, small warm-lit windows,
  light source from top-left, no outlines, transparent background,
  child-friendly and premium feel, single centered building, isolated on
  transparent."
- **자연(NATURE)**: "Storybook illustration of a single [tree / low
  flower garden bed], painterly style, warm moss green and soft gold
  palette (#8fb37a, #c9a227), 3/4 top-down angle ~30 degrees, soft
  rounded shapes, no outlines, light from top-left, transparent
  background, cozy and cute, isolated single object."
- **장식(DECORATION)**: "Small cute British village prop ([wooden bench /
  signpost / street lamp / red post box]), painterly storybook style,
  warm wood tones (#8b6f3e) with navy or burgundy accents (#1e2a5a,
  #7a2e3a), 3/4 top-down angle ~30 degrees, soft shading, no outlines,
  transparent background, isolated single object, child-friendly."
- **동물(ANIMALS)**: "Cute chibi-proportioned village animal ([cat /
  puppy / owl]), 3/4 top-down angle, soft painterly storybook style,
  warm friendly expression (no realistic face detail), muted natural fur
  colors within warm palette, no outlines, transparent background,
  isolated single object, standing/perched idle pose."
- **환경(ENVIRONMENT — 타일)**: "Seamless tileable top-down texture,
  [grass / cobblestone path / low hedge], soft painterly storybook
  style, warm moss green or wood palette, subtle texture variation, no
  outlines, no vignette, edges must tile seamlessly, flat lighting (no
  directional shadow)."

## 4. 연동 방법(how to plug in)

1. `src/assets/town/index.js`의 `TOWN_ASSETS`(현재 `{}`, 12행)에
   asset_key를 키로 하는 import를 추가한다. 예:
   ```js
   import britishCottage from './buildings/british-cottage.webp'
   export const TOWN_ASSETS = {
     'buildings/british-cottage': britishCottage,
     // ...
   }
   ```
2. **로직 변경은 필요 없다** — `TownSprite`류 컴포넌트는 이미
   `townAsset(item.assetKey)`를 호출해 URL이 있으면 `<img>`, 없으면
   이모지(`item.emoji`)로 폴백하는 구조다(`src/assets/town/index.js`
   19~22행 `townAsset()`).
3. **같은 PR 안에서 반드시 함께 고칠 파일**: `scripts/testTownUiStatic.mjs`
   92행의 정적 계약 `export const TOWN_ASSETS\s*=\s*\{\s*\}`(TOWN_ASSETS가
   비어 있어야 통과)은 에셋이 실제로 채워지면 자연히 FAIL한다 — 에셋을
   추가하는 PR은 이 테스트 라인(그리고 필요하면 1절 "파일/폴더 구조"의
   `.gitkeep` 존재 체크 주변 로직)도 함께 갱신해야 `npm run verify:*`가
   깨지지 않는다. 이 문서(docs-maintainer)는 코드를 수정하지 않으므로,
   실제 테스트 라인 수정은 implementer 담당이다.
4. 폴더 스캐폴드(`src/assets/town/{backgrounds,buildings,decorations,
   nature,animals,special,ui}/.gitkeep`)는 이미 존재한다(V1
   `testTownUiStatic.mjs` 95~98행이 이 7개 폴더를 이미 검증 중).

## 5. QA 체크리스트(납품 아트 검수용)

- [ ] 파일 크기가 표의 1x/2x 타겟과 일치하는가(±10% 이내)?
- [ ] 배경이 완전히 투명한가(반투명 halo/잔여 배경색 없음)?
- [ ] 가장자리 안전 여백(4%) 안에 그림이 들어가는가(크롭 잘림 없음)?
- [ ] 앵커(하단-중앙 또는 중앙)가 캔버스 기준으로 정확히 정렬돼, 8x13 씬
      좌표계에 배치했을 때 바닥선이 셀 하단과 맞는가?
- [ ] 360px 폭(모바일)에서 실루엣이 무엇인지 즉시 알아볼 수 있는가(과도한
      디테일로 뭉개지지 않는가)?
- [ ] 200% 확대(레티나 2x) 시에도 계단현상/블러가 눈에 띄지 않는가?
- [ ] 포그(fog) 오버레이를 올린 어두운 배경 위에서도 전경 오브젝트 실루엣이
      충분히 대비되는가?
- [ ] 팔레트(크림/모스그린/네이비/버건디/앰버/골드/우드)를 벗어나는 튀는
      색이 없는가(우체통 빨강처럼 명시된 예외 제외)?
- [ ] 광원 방향(좌상단)이 세트 전체에서 일관되는가?
- [ ] 텍스트/로고/크레스트/해리포터류 IP 요소가 전혀 없는가?
- [ ] 타일류(잔디/길/헤지/포그)가 이음매 없이 반복되는가(seamless 확인)?
