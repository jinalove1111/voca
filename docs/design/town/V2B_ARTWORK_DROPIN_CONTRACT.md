# Paul Town V2-B — 아트워크 드롭인 계약 (Artwork Drop-in Contract)

> 상태: 설계 문서(디자인 전용, 코드 변경 없음). `docs/design/town/
> V2A_ARTWORK_SPEC_FINAL.md`("FINAL")를 유일한 권위 있는 수치 출처로
> 삼아, 그 표를 **재해석 없이 그대로** 실제 납품 파일명·목적지 폴더·
> 연동 상태로 옮겨 적은 "실무용 체크리스트"다. FINAL과 이 문서가
> 배치되는 값이 있으면 FINAL이 항상 이긴다 — 이 문서는 FINAL을
> 대체하지 않는다. 근거 확인을 위해 이번 세션에서 직접 Read한 파일:
> `V2A_ARTWORK_SPEC_FINAL.md`, `V2A_ASSET_SPEC.md`(초안), `src/utils/
> town/townCatalog.js`, `src/utils/town/townScene.js`, `src/assets/
> town/index.js`, `src/components/town/v2/TownAmbientLayer.jsx`,
> `src/components/town/v2/TownSprite.jsx`, `scripts/testTownSceneV2.mjs`,
> `scripts/testTownV2Static.mjs`, `scripts/testTownUiStatic.mjs`.

## 0. 이 계약의 성격 — 프레젠테이션 전용

이 문서가 다루는 모든 항목은 **표시(presentation) 계층**에만 속한다.
`town_items`(DB) 및 그 위에서 파생되는 가격·최소 레벨(`minLevel`)·
소유권(`ownedIds`)·배치 좌표(`townPlacements`)는 여전히 서버/도메인
로직(`townCatalog.js`/`townLayout.js`/`townShop.js`)이 유일한 권위다.
실제 그림 파일을 끼워 넣는 작업(아트 통합)에는 **DB 마이그레이션이
0건**, **배치 데이터 스키마 변경이 0건** 필요하다. 아트가 도착했을 때
실제로 필요한 코드 변경은 정확히 두 가지뿐이다.

1. `src/assets/town/index.js`의 `TOWN_ASSETS`(현재 `export const
   TOWN_ASSETS = {}`)에 `asset_key`를 키로 하는 import를 채운다.
2. `scripts/testTownUiStatic.mjs` 92행의 정적 단언 — 현재 `TOWN_ASSETS`가
   **반드시 빈 객체여야 통과**하는 계약(`/export const TOWN_ASSETS\s*=\s*
   \{\s*\}/`)이므로, 에셋을 하나라도 채우면 이 줄은 자연히 FAIL한다.
   "특정 asset_key들을 포함해야 한다" 또는 "빈 객체 여부를 더 이상
   강제하지 않는다" 쪽으로 같은 PR 안에서 갱신해야 `npm run verify:*`가
   깨지지 않는다.

렌더 로직(`TownSprite.jsx`의 `townAsset(assetKey)` → `<img>` 또는
이모지 폴백 분기)은 이미 완성돼 있어 그룹 C/D(garden-stage 제외)/E/F는
**추가 코드 변경 없이** 이미지 렌더로 자동 전환된다(1번만으로 충분).
예외는 아래 5절 GROUP D-2(정원 5단계)뿐이다 — 이 예외는 이미 이번
세션(V2-B)에 해소되었음을 실제 코드로 확인했다(5절 참고).

## 1. 파일명/폴더 규칙(공통, FINAL §1 그대로)

표의 `asset_key`는 곧 **파일명 베이스(폴더 포함)**다. 실제 납품 파일은
이 베이스에서 정확히 4개로 자동 확장된다: `<base>.webp`,
`<base>@2x.webp`, `<base>.png`, `<base>@2x.png`. 예)
`buildings/british-cottage` → `buildings/british-cottage.webp`,
`buildings/british-cottage@2x.webp`, `buildings/british-cottage.png`,
`buildings/british-cottage@2x.png`(4파일). 목적지 폴더는 항상
`src/assets/town/<asset_key의 첫 세그먼트>/`(예: `src/assets/town/
buildings/`) — 폴더 스캐폴드(`.gitkeep` 7종)는 이미 존재하고
`testTownUiStatic.mjs` 1절이 이미 검증 중이라 추가 작업 불필요하다.
`-lights`/`-on`/`-blink` 등 변형 파일은 베이스와 **동일한 4파일 확장
규칙**을 따르되 베이스 이름 뒤에 접미사가 붙는다(예:
`buildings/british-cottage-lights.webp` 등 4종).

투명 배경(프리멀티플라이드 알파, 가장자리 4% 이상 투명 여백)은 **P0
23개 전부 YES** — 유일한 색상 예외는 `decorations/red-post-box`(전통
영국 우체통 빨강 유지)이며, 이는 색상 팔레트 예외일 뿐 **배경 투명성
요구사항 자체는 동일하게 YES**다.

이하 P0 각 그룹의 표에서 앵커는 `anchorX ∈ {left, center, right}` /
`anchorY ∈ {top, center, bottom}` 쌍으로 명시한다. 정원 5단계를 제외한
모든 P0 오브젝트는 `center / bottom`(하단-중앙)이며, 정원 5단계는 셀
격자 앵커가 아니라 **고정 화단(garden-bed) 박스 내부**에 배치되는
별도 방식이라 5절에서 그 차이를 명시적으로 구분한다.

## 2. P0 — GROUP C 건물(`buildings/`, `special/`, 7종)

카탈로그 `category`가 `house`인 3개(`british-cottage`/`book-shop`/
`cafe`) + 고정 소유 `buildings/my-house` + `special`인 3개
(`english-school`/`clock-tower`/`bridge`), 총 7종. `footprintFor()`
(`townScene.js` 94~100행)가 `house`/`special` 둘 다 `lg`로 매핑한다.

| asset_key | 캔버스 1x/2x | 렌더 @360/@512 | anchorX/Y | 발자국 | z/layer | 변형 |
|---|---|---|---|---|---|---|
| `buildings/my-house` | 128×160/256×320 | 62×78/97×121(런타임 CSS `scale-[1.3]`+호박색 헤일로 별도 합성, 원화 자체는 표기 크기로만 제작) | center/bottom | lg | objects(10) | `-lights` 목록에 포함† |
| `buildings/british-cottage` | 128×160/256×320 | 62×78/97×121 | center/bottom | lg | objects(10) | `-lights`(P1) |
| `buildings/book-shop` | 128×160/256×320 | 62×78/97×121 | center/bottom | lg | objects(10) | `-lights`(P1) |
| `buildings/cafe` | 128×160/256×320 | 62×78/97×121 | center/bottom | lg | objects(10) | `-lights`(P1) |
| `special/english-school` | 128×154/256×308 | 62×74/97×116 | center/bottom | lg | objects(10) | `-lights`(P1) |
| `special/clock-tower` | 128×256/256×512 | 62×124/97×194 | center/bottom | lg(세로 초과 허용) | objects(10) | `-lights`(P1) |
| `special/bridge` | 160×80/320×160 | 82×41/128×64 | center/bottom | lg 공식의 명시적 예외 — 실제 시각 폭은 2×1(가로 span), 실점유 셀 수는 implementer 확인 필요 | objects(10) | 없음(창문 없음, FINAL 171행) |

† **주의(과제 지시문과 FINAL 원문의 불일치, 정직하게 기록)**: 이 문서
작성을 요청한 지시문은 "bridge와 my-house 둘 다 `-lights` 변형이
불필요하다"고 서술했으나, `V2A_ARTWORK_SPEC_FINAL.md` 165행("`-lights`
오버레이(선택)")과 172행("`buildings/*-lights`(위 6개 각각)" — my-house/
british-cottage/book-shop/cafe/english-school/clock-tower 6종을 가리킴,
bridge 제외)을 직접 재확인한 결과 **my-house는 `-lights` 변형 목록에
포함**돼 있다(단, P1 태그가 붙은 나머지 5종과 달리 "선택"으로만 표기).
FINAL이 이 문서보다 우선하므로, 이 표는 FINAL 원문을 따르고 지시문의
서술을 반영하지 않았다. `bridge`가 조명 오버레이 대상이 아니라는 점은
FINAL 171행("조명 오버레이 없음, 창문 없음")과 지시문이 일치한다.

**해결(같은 밤 후속 조치)**: 이 문서가 지적한 불일치를 근거로
`src/assets/town/assetManifest.js`의 `buildings/my-house` 항목을
`variants: []` → `variants: ['my-house-lights']`로 정정했다(코드
빌드·수동 검증 완료). 이제 코드와 이 문서 모두 FINAL 165/172행과
일치한다 — 운영자 재검토는 더 이상 필요 없다.

**투명 배경**: 7종 전부 YES. **폴백**: 이모지 폴백 — `TownSprite.jsx`가
`townAsset(assetKey)`이 null이면 자동으로 `sprite.emoji`를 렌더(7종
전부 동일). **검증 테스트**: `scripts/testTownSceneV2.mjs` 4절
(`footprintFor` — `house`/`special` → `lg` 매핑, 카탈로그 17개 전체를
순회 확인) + 5절(`spriteFor` null-safety, `HOME_SPRITE.assetKey ===
'buildings/my-house'` 184행 단언) + `scripts/testTownV2Static.mjs` 20절
(`TownSprite.jsx` — `data-asset-key` 속성 + `<img loading="lazy"
decoding="async">` 조건부 렌더 정적 확인) + `scripts/testTownUiStatic.mjs`
1절(`src/assets/town/buildings/.gitkeep`, `special/.gitkeep` 존재).

## 3. P0 — GROUP D-1 자연(`nature/`, `decorations/`, 3종)

`stone-fountain`은 시각적으로는 자연류지만 `townCatalog.js`의 실제
`category`가 `decoration`이라 폴더/발자국은 `decorations/` 규칙을
따른다(카탈로그가 진실 원천).

| asset_key | 캔버스 1x/2x | 렌더 @360/@512 | anchorX/Y | 발자국 | z/layer | 변형 |
|---|---|---|---|---|---|---|
| `nature/tree` | 96×128/192×256 | 46×61/72×96 | center/bottom | md | objects(10) | 없음 |
| `nature/flower-garden` | 96×64/192×128 | 46×31/72×48 | center/bottom | md | objects(10) | 없음 |
| `decorations/stone-fountain` | 72×72/144×144 | 36×36/56×56 | center/bottom | sm(주의: 그룹명은 "자연"이지만 실제 발자국 클래스는 decorations 규칙) | objects(10) | 없음 |

**투명 배경**: 3종 전부 YES. **폴백**: 위 GROUP C와 동일 문구. **검증
테스트**: `testTownSceneV2.mjs` 4절(`nature`→`md`, `decoration`→`sm`
매핑을 카탈로그 17개 전체에 대해 확인) + 5절(`spriteFor(treeCatalogItem)`
직접 단언, 178~182행) + `testTownV2Static.mjs` 20절 + `testTownUiStatic.mjs`
1절(`nature/.gitkeep`, `decorations/.gitkeep`).

## 4. P0 — GROUP E 장식(`decorations/`, 5종)

| asset_key | 캔버스 1x/2x | 렌더 @360/@512 | anchorX/Y | 발자국 | z/layer | 변형 |
|---|---|---|---|---|---|---|
| `decorations/bench` | 72×48/144×96 | 36×24/56×37 | center/bottom | sm | objects(10) | 없음 |
| `decorations/town-sign` | 72×108/144×216 | 36×54/56×84 | center/bottom | sm | objects(10) | 없음(팻말 표면은 텍스트 없이 그림만) |
| `decorations/shop-lamp` | 72×144/144×288 | 36×72/56×112 | center/bottom | sm | objects(10) | 없음 |
| `decorations/street-lamp` | 72×144/144×288 | 36×90/56×140 | center/bottom | sm | objects(10) | `-on` 점등 변형(P1) |
| `decorations/red-post-box` | 72×108/144×216 | 36×54/56×84 | center/bottom | sm | objects(10) | 없음(팔레트 예외 — 전통 영국 우체통 빨강 유지, 배경 투명성 자체는 예외 아님) |

**투명 배경**: 5종 전부 YES(색상 예외인 `red-post-box`도 배경은
투명). **폴백**: 위와 동일 문구. **검증 테스트**: `testTownSceneV2.mjs`
4절(`decoration`→`sm` 매핑) + `testTownV2Static.mjs` 20절 +
`testTownUiStatic.mjs` 1절(`decorations/.gitkeep`).

## 5. P0 — GROUP F 동물(`animals/`, 3종)

| asset_key | 캔버스 1x/2x | 렌더 @360/@512 | anchorX/Y | 발자국 | z/layer | 변형 |
|---|---|---|---|---|---|---|
| `animals/cat` | 72×54/144×108 | 36×27/56×42 | center/bottom | sm | objects(10) | `-blink`(선택, P2) |
| `animals/puppy` | 72×54/144×108 | 36×27/56×42 | center/bottom | sm | objects(10) | `-blink`(선택, P2) |
| `animals/owl` | 72×96/144×192 | 36×48/56×75 | center/bottom | sm | objects(10) | `-blink`(선택, P2) |

**투명 배경**: 3종 전부 YES. **폴백**: 위와 동일 문구. **검증 테스트**:
`testTownSceneV2.mjs` 4절(`animal`→`sm` 매핑) + `testTownV2Static.mjs`
20절 + `testTownUiStatic.mjs` 1절(`animals/.gitkeep`).

## 6. P0 — GROUP D-2 정원 5단계(`nature/garden-stage-0..4`) — 별도 취급 필요

이 5개는 앞의 18개(카탈로그 17 + my-house)와 **z-layer/앵커 방식/폴백
경로/검증 테스트가 전부 다르다** — 반드시 별도 항목으로 취급한다.

| asset_key | 캔버스 1x/2x | 렌더 @360/@512 | anchorX/Y | 발자국 | z/layer | 변형(성장 단계) |
|---|---|---|---|---|---|---|
| `nature/garden-stage-0` | 64×64/128×128 | AMBIGUOUS — FINAL §2 GROUP D 181행은 렌더 px를 명시하지 않고 "홈 옆 고정 화단 박스(left 2%/top 12%/width 30%/height 22%)" 퍼센트 좌표만 규정한다(초안 `V2A_ASSET_SPEC.md`는 참고용으로 "약 28×28/44×44"를 제시하나 FINAL이 이를 명시적으로 계승하지 않음) — needs owner decision | center/bottom(단, **화단 박스 내부** 앵커 — 셀 격자 앵커 아님) | null/N/A(FOOTPRINT_CLASS 미적용, `gardenStageSprite()`가 `footprint: null` 반환, 실측 확인) | **patches(2)**(objects(10) 아님) | seed(씨앗) 단계 |
| `nature/garden-stage-1` | 64×64/128×128 | 위와 동일(AMBIGUOUS) | 위와 동일 | null/N/A | patches(2) | sprout(새싹), threshold≥10 |
| `nature/garden-stage-2` | 64×64/128×128 | 위와 동일(AMBIGUOUS) | 위와 동일 | null/N/A | patches(2) | flower(꽃), threshold≥30 |
| `nature/garden-stage-3` | 64×64/128×128 | 위와 동일(AMBIGUOUS) | 위와 동일 | null/N/A | patches(2) | bloom(만개), threshold≥60 |
| `nature/garden-stage-4` | 64×64/128×128 | 위와 동일(AMBIGUOUS) | 위와 동일 | null/N/A | patches(2) | full(풀만개), threshold≥100 |

**투명 배경**: 5종 전부 YES.

**현재 폴백(중요 — 이번 세션에 실측 재확인한 최신 상태)**:
`src/components/town/v2/TownAmbientLayer.jsx`를 직접 Read로 확인한
결과, 이 파일은 **이미 이번 세션(V2-B, 2026-09-13)에** `townAsset`/
`TownSprite`를 import하고 `gardenStageSprite(r.stage)`로 얻은
`assetKey`를 `townAsset()`으로 조회해, 값이 있을 때만 화단 박스 안에
`<TownSprite>`를 배경으로 조건부 렌더하도록 바뀌어 있다(코드 22~24행,
39~40행, 53~57행; 파일 헤더 주석 16~21행에 "드롭인 아트 준비(시각
변화 없음)"이라고 명시). 즉 **TownAmbientLayer.jsx가 아직 이 경로를
쓰지 않다가 이번 세션(V2-B)에 townAsset() 존재 여부로 조건부 배경
스프라이트를 추가했다 — 실 파일이 없으면 오늘과 동일하게 아무것도
추가로 렌더되지 않는다**(`TOWN_ASSETS`가 여전히 빈 객체라
`townAsset()`이 항상 null을 반환하므로, 기존 `STAGE_EMOJI` 이모지
군집 렌더만 그대로 보인다 — byte-for-byte 시각 변화 없음, 헤더 주석과
일치). `V2A_ARTWORK_SPEC_FINAL.md` 187~193행이 "연동 코드가 아직
없다"고 적어둔 것은 FINAL 작성 시점(같은 날 더 이른 시각) 기준이며,
그 이후 같은 세션 안에서 리팩터가 실제로 진행된 것으로 보인다 — 이
문서는 가장 최근 코드 상태(직접 Read 확인)를 우선해 기록한다.

**검증 테스트**: **no test yet — needed before art lands.** 실측
확인(`grep`) 결과, `scripts/testTownSceneV2.mjs` 6절은
`GARDEN_STAGE_THRESHOLDS === [0,10,30,60,100]`라는 **임계값 배열**만
검증하며, `gardenStageSprite()`가 반환하는 `assetKey`(`nature/
garden-stage-N`)/`footprint: null` 계약이나 `TownAmbientLayer.jsx`의
`townAsset()` 조건부 렌더 자체를 검증하는 단언은 `scripts/` 어디에도
없다(`testTownV2Static.mjs` 16절은 이 파일의 `sr-only` 문장만 검증).
아트가 실제로 납품되기 전에 최소 다음을 커버하는 신규 unit 테스트가
필요하다: `gardenStageSprite(0..4)`의 `assetKey`/`footprint` 값,
`TownAmbientLayer`가 `townAsset()`이 값을 반환할 때만 배경 스프라이트
DOM을 추가하고 null일 때는 추가하지 않는지(스냅샷 또는 정적 검사).

## 7. P1 요약표(길/헤지/포그/parcel/조명 오버레이) — 상세 축소

| asset_key | 폴더/캔버스 | anchor/z | 발자국 | 상태 |
|---|---|---|---|---|
| `backgrounds/path-straight` | backgrounds/, 128×128/256×256 | fill/path(1) | 1×1 | 신규, CSS 자갈 패턴이 현재 대체 중 |
| `backgrounds/path-corner` | backgrounds/, 128×128/256×256 | fill/path(1) | 1×1 | 신규, 4방향 회전은 CSS transform 재사용(별도 4장 불필요) |
| `backgrounds/path-t` | backgrounds/, 128×128/256×256 | fill/path(1) | 1×1 | 신규, CSS transform 재사용 |
| `backgrounds/path-intersection` | backgrounds/, 128×128/256×256 | fill/path(1) | 1×1 | 신규, 대칭이라 회전 불필요 |
| `backgrounds/hedge-edge` | backgrounds/, 256×96/512×192 | 경계 스트립(가로 반복)/patches(2) | N/A | 신규, CSS 인셋 그림자+밴드가 현재 대체 중 |
| `backgrounds/fog` | backgrounds/, 512×512/1024×1024 | fill 하단 오버레이/**fog(5), objects(10)보다 반드시 아래** | N/A | 신규, 2026-09-13 z-순서 버그 수정 근거 유지 필요 |
| `ui/parcel` | ui/, 48×48/96×96 | center/center(그리드 밖 UI, 인벤토리 카드 아이콘) | N/A | 신규, 소포/선물상자 모티프 |
| `buildings/*-lights`(6종: my-house/british-cottage/book-shop/cafe/english-school/clock-tower) | 베이스 폴더와 동일, 캔버스 동일 | 베이스와 동일 앵커/objects(10), 베이스 위 합성 | 베이스와 동일 | 신규, 창문 불빛만 담은 투명 오버레이 |
| `decorations/street-lamp-on` | decorations/, 72×144/144×288(베이스 동일) | 베이스와 동일 앵커/objects(10) | 1×1(sm) | 신규, 램프 헤드만 따뜻한 글로우 |

## 8. P2 요약표(지형 타일/애니메이션 프레임) — 상세 축소

| asset_key | 폴더/캔버스 | anchor/z | 발자국 | 상태 |
|---|---|---|---|---|
| `backgrounds/grass-tile` | backgrounds/, 256×256/512×512 | fill 전체/ground(0) | N/A | 신규, CSS 그라디언트가 현재 대체 중(지금 당장 불필요) |
| `backgrounds/terrain-patch-1/2/3` | backgrounds/, 200×140/400×280 | 퍼센트 오버레이/patches(2) | N/A | 신규, CSS blur 블롭이 현재 대체 중 |
| `backgrounds/village-ground-gradient` | backgrounds/, 512×832/1024×1664(8:13 씬 비율) | fill 전체/ground(0) | N/A | 신규, CSS 그라디언트가 현재 대체 중 |
| `animals/{cat,puppy,owl}-blink`(3종) | 각 베이스 폴더와 동일, 캔버스 동일 | 베이스와 동일 앵커/objects(10) | 1×1(sm) | 신규, 눈 감은 프레임 — 2프레임 CSS/JS 토글용 |

## 9. 납품 전 재확인 체크리스트 위치

시각 QA(픽셀 오차·투명도·앵커 정합·잔디/포그 이음매 등)는 이 문서가
아니라 `V2A_ARTWORK_SPEC_FINAL.md` 4절("납품 체크리스트 & 검수(QA)
항목")이 이미 상세히 규정하므로 여기서 중복하지 않는다. 이 문서는
"어떤 파일을 어디에 놓고, 지금 무엇으로 대체되고 있고, 무엇으로
검증되는가"만 다룬다.

---

_작성: docs-maintainer, 2026-09-13(V2-B 세션). 코드/문서 실측 확인만
반영했으며 추측 수치를 넣지 않았다 — 애매한 값은 "AMBIGUOUS"로,
불일치는 각주로 정직하게 남겼다._
