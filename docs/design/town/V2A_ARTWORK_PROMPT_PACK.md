# Paul Town V2-A — 아트워크 생성 프롬프트 팩 (P0, 23종)

> 상태: 설계 문서(디자인 전용, 코드/이미지 생성 없음). `docs/design/town/
> V2A_ARTWORK_SPEC_FINAL.md`("FINAL")의 §1(GLOBAL ART DIRECTION SHEET)·
> §2(에셋 그룹 테이블)·§3(그룹별 프롬프트 템플릿)을 근거로, P0 23종
> (카탈로그 중 GROUP C/D/E/F에 속한 18개 + `buildings/my-house` +
> `nature/garden-stage-0..4` 5개) 각각에 대해 즉시 사용 가능한 개별
> 프롬프트를 만든다. 수치(캔버스/비율)는 FINAL을 그대로 인용했고
> 재도출·반올림하지 않았다. 각 항목은 subject / camera·perspective /
> lighting / proportions / crop / transparent background / empty
> margin / anchor consideration / do-not-include 9개 필드를 갖는다.

## 0. 공용 팔레트 & 글로벌 스타일 (FINAL §1 그대로 인용)

**컨셉**: 영국 스토리북 마을(British storybook village), 따뜻하고
마법 같은(warm magical)·아늑한(cozy)·프리미엄한(premium)·교육적인
(educational) 톤 — 절대 어둡거나 무섭지 않게. 페인터리 스토리북
일러스트(soft painterly), 하드 아웃라인 없음.

**팔레트(고정, 세트 전체 공용)**: warm cream `#fdebd0`/`#f6e3c8`, moss
green `#8fb37a`/`#cfe3c0`, muted navy `#1e2a5a`, burgundy `#7a2e3a`,
warm amber `#e0a73a`, soft gold `#c9a227`, wood brown `#8b6f3e`. 유일한
색상 예외는 `decorations/red-post-box`(전통 영국 우체통 빨강 유지).

아래 모든 항목의 **camera/perspective**는 공용으로 `3/4 top-down angle,
~30 degree camera tilt, not fully isometric — soft storybook hand-drawn
feel`이고, **lighting**은 공용으로 `single fixed light source from
top-left, consistent across the whole set, no baked directional cast
shadow, only a very faint hint of contact shadow at the base (opacity
≤15%) — runtime CSS already renders a soft contact shadow, do not
double up`이다. **transparent background**는 23종 전부 `YES,
premultiplied alpha`(밝은 잔디/어두운 네이비 UI 양쪽에서 흰색·회색
헤일로 없어야 함)이고, **empty margin**은 23종 전부 `≥4% on all sides`
다. 이 네 필드는 매 항목마다 반복하지 않고 "§0 공용"으로 표기한다.

## 1. 공용 네거티브 프롬프트(NEG-COMMON, FINAL §3 그대로 인용)

```
no text, no letters, no numbers, no logos, no watermark, no crests, no
coats of arms, no Harry Potter or Hogwarts elements, no wizard hats, no
lightning bolt scars, no recognizable real-world or copyrighted franchise
architecture, no franchise props, no human faces, no realistic human
figures, no photorealism, no hard black outlines, no drop shadow, no
vignette, no busy background, no clutter, no additional objects in frame,
no scary or dark horror elements, no multiple objects, no collage.
```

23개 항목 전부 do-not-include 필드 값은 `NEG-COMMON + "no Paul
character, this asset set never includes Paul."`이며, 항목별 추가
금지사항이 있으면 그 뒤에 이어서 표기한다.

---

## 2. GROUP C — BUILDINGS (`buildings/`, `special/`, 7종)

건물류 공용 proportions: "실루엣이 캔버스 높이의 85~95%를 채워, 같은
배율로 겹쳐 봤을 때 `nature/tree`보다 약 2.4배 커 보이게"(FINAL §1
상대 스케일 규칙). 공용 crop: "isolated single building, centered,
≥4% transparent margin". 공용 anchor: "bottom-center silhouette flush
with canvas bottom edge minus margin".

### `buildings/my-house`
- subject: player's fixed starting home, cozy storybook cottage, the warmest-looking building in the whole set (thatched/slate roof, small warm-lit windows)
- camera/perspective · lighting: §0 공용
- proportions: 건물 공용(위 참고)
- crop: 건물 공용, canvas 128×160 (2x 256×320)
- transparent background · empty margin: §0 공용
- anchor consideration: 건물 공용
- do-not-include: NEG-COMMON + Paul 제외 + "no painted amber halo/glow (added at runtime in CSS, do not bake it into the art)"

### `buildings/british-cottage`
- subject: thatched-roof British storybook cottage, purchasable village house
- camera/perspective · lighting: §0 공용
- proportions: 건물 공용
- crop: 건물 공용, canvas 128×160 (2x 256×320)
- transparent background · empty margin: §0 공용
- anchor consideration: 건물 공용
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

### `buildings/book-shop`
- subject: cozy bookshop with a round window, shop sign area left blank/icon-only (no readable text)
- camera/perspective · lighting: §0 공용
- proportions: 건물 공용
- crop: 건물 공용, canvas 128×160 (2x 256×320)
- transparent background · empty margin: §0 공용
- anchor consideration: 건물 공용
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

### `buildings/cafe`
- subject: small cafe with a modest awning, optional outdoor table/parasol silhouette kept inside frame
- camera/perspective · lighting: §0 공용
- proportions: 건물 공용
- crop: 건물 공용, canvas 128×160 (2x 256×320)
- transparent background · empty margin: §0 공용
- anchor consideration: 건물 공용
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

### `special/english-school`
- subject: village school building, educational and welcoming storybook-cute tone (not institutional-realistic)
- camera/perspective · lighting: §0 공용
- proportions: 건물 공용(캔버스 높이만 154)
- crop: 건물 공용, canvas 128×154 (2x 256×308)
- transparent background · empty margin: §0 공용
- anchor consideration: 건물 공용
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

### `special/clock-tower`
- subject: tall clock tower, the tallest landmark silhouette in the whole set, plain symbolic clock face
- camera/perspective · lighting: §0 공용
- proportions: 1:2 비율로 세로 과장, 세트 전체 중 최고 높이로 읽히게
- crop: 건물 공용, canvas 128×256 (2x 256×512)
- transparent background · empty margin: §0 공용
- anchor consideration: 건물 공용(세로 초과 허용)
- do-not-include: NEG-COMMON + Paul 제외 + "no visible clock numerals or text"

### `special/bridge`
- subject: single stone bridge, wide and low, ground-level architecture — no windows, no doors
- camera/perspective · lighting: §0 공용
- proportions: 2:1 가로 실루엣, 세로 매스 없음(타워 아님)
- crop: 건물 공용, canvas 160×80 (2x 320×160)
- transparent background · empty margin: §0 공용
- anchor consideration: 건물 공용
- do-not-include: NEG-COMMON + Paul 제외 + "no windows, no lit-window glow overlay needed"

---

## 3. GROUP D-1 — NATURE (`nature/`, `decorations/`, 3종)

### `nature/tree`
- subject: single deciduous tree — the set's scale reference that buildings should visually dwarf
- camera/perspective · lighting: §0 공용
- proportions: crown-to-ground silhouette fills ~70-80% of canvas height — large and full
- crop: isolated single tree, centered, canvas 96×128 (2x 192×256)
- transparent background · empty margin: §0 공용
- anchor consideration: bottom-center (trunk base) flush with canvas bottom minus margin
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

### `nature/flower-garden`
- subject: single low flower garden bed, ground-hugging, wide rather than tall
- camera/perspective · lighting: §0 공용
- proportions: low, wide silhouette — clearly smaller/lower than `nature/tree`
- crop: isolated single garden bed, centered, canvas 96×64 (2x 192×128)
- transparent background · empty margin: §0 공용
- anchor consideration: bottom-center flush with canvas bottom minus margin
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

### `decorations/stone-fountain`
- subject: single small stone fountain (시각은 자연류지만 `townCatalog.js` 카테고리/폴더는 decorations)
- camera/perspective · lighting: §0 공용
- proportions: compact, roughly circular, human-scale — clearly smaller than `nature/tree`
- crop: isolated single fountain, centered, canvas 72×72 (2x 144×144)
- transparent background · empty margin: §0 공용
- anchor consideration: bottom-center flush with canvas bottom minus margin
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

---

## 4. GROUP E — DECORATIONS (`decorations/`, 5종)

장식류 공용 proportions: "small human/child-scale street furniture,
clearly smaller and more delicate than any nature or building asset".

### `decorations/bench`
- subject: small wooden park bench
- camera/perspective · lighting: §0 공용
- proportions: 장식류 공용, low and wide (3:2)
- crop: isolated single bench, centered, canvas 72×48 (2x 144×96)
- transparent background · empty margin: §0 공용
- anchor consideration: bottom-center(legs/base) flush with canvas bottom minus margin
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

### `decorations/town-sign`
- subject: carved wooden village signpost with a completely blank sign surface
- camera/perspective · lighting: §0 공용
- proportions: 장식류 공용, narrow and upright (2:3)
- crop: isolated single signpost, centered, canvas 72×108 (2x 144×216)
- transparent background · empty margin: §0 공용
- anchor consideration: bottom-center(post base) flush with canvas bottom minus margin
- do-not-include: NEG-COMMON + Paul 제외 + "no text or symbols on the sign board"

### `decorations/shop-lamp`
- subject: ornate small shop lamp post, unlit base state
- camera/perspective · lighting: §0 공용
- proportions: 장식류 공용, slim and tall (1:2)
- crop: isolated single lamp post, centered, canvas 72×144 (2x 144×288)
- transparent background · empty margin: §0 공용
- anchor consideration: bottom-center(post base) flush with canvas bottom minus margin
- do-not-include: NEG-COMMON + Paul 제외 + "lamp should read unlit/off in this base version"

### `decorations/street-lamp`
- subject: tall street lamp post, unlit base state (별도 `-on` 점등 변형은 이 프롬프트 팩 범위 밖, P1)
- camera/perspective · lighting: §0 공용
- proportions: 장식류 공용, slimmest/tallest decoration-class prop (1:2.5)
- crop: isolated single lamp post, centered, canvas 72×144 (2x 144×288)
- transparent background · empty margin: §0 공용
- anchor consideration: bottom-center(post base) flush with canvas bottom minus margin — must match a future `-on` overlay's canvas/anchor exactly, so keep the lamp head silhouette simple
- do-not-include: NEG-COMMON + Paul 제외 + "lamp should read unlit/off in this base version"

### `decorations/red-post-box`
- subject: traditional British red post box (팔레트 예외 — 전통 빨강 유지, 배경 투명성은 예외 아님)
- camera/perspective · lighting: §0 공용
- proportions: 장식류 공용, narrow and upright (2:3)
- crop: isolated single post box, centered, canvas 72×108 (2x 144×216)
- transparent background · empty margin: §0 공용
- anchor consideration: bottom-center(base) flush with canvas bottom minus margin
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음, 색상 예외는 팔레트 규칙일 뿐 네거티브 목록과 무관)

---

## 5. GROUP F — ANIMALS (`animals/`, 3종)

동물류 공용 proportions: "cute chibi-proportioned(살짝 오버사이즈
머리), 세트 전체에서 가장 작은 시각 스케일 클래스 — 어떤 장식 소품보다
작게 읽혀야 함".

### `animals/cat`
- subject: cute chibi-proportioned sitting cat, idle pose
- camera/perspective · lighting: §0 공용
- proportions: 동물류 공용
- crop: isolated single cat, centered, canvas 72×54 (2x 144×108)
- transparent background · empty margin: §0 공용
- anchor consideration: bottom-center(paws/base) flush with canvas bottom minus margin
- do-not-include: NEG-COMMON + Paul 제외 + "no realistic facial detail"

### `animals/puppy`
- subject: cute chibi-proportioned puppy, standing/idle pose
- camera/perspective · lighting: §0 공용
- proportions: 동물류 공용
- crop: isolated single puppy, centered, canvas 72×54 (2x 144×108)
- transparent background · empty margin: §0 공용
- anchor consideration: bottom-center(paws/base) flush with canvas bottom minus margin
- do-not-include: NEG-COMMON + Paul 제외 + "no realistic facial detail"

### `animals/owl`
- subject: cute chibi-proportioned owl, perched idle pose, drawn isolated with no branch/perch prop in frame
- camera/perspective · lighting: §0 공용
- proportions: 동물류 공용, taller/narrower silhouette (3:4)
- crop: isolated single owl, centered, canvas 72×96 (2x 144×192), no perch/branch object in frame
- transparent background · empty margin: §0 공용
- anchor consideration: bottom-center(feet/base) flush with canvas bottom minus margin
- do-not-include: NEG-COMMON + Paul 제외 + "no realistic facial detail, no branch/perch prop in frame"

---

## 6. GROUP D-2 — GARDEN-STAGE (`nature/garden-stage-0..4`, 5종, ambient)

이 5개는 카탈로그 아이템이 아니라 홈 옆 고정 화단(garden-bed) 박스
안에서 순서대로 스왑되는 "성장 단계" 세트다 — **5개 전부 같은 카메라
각도·같은 화단 형태·같은 캔버스 프레이밍**을 공유해야 애니메이션
프레임처럼 자연스럽게 이어진다(FINAL §3 "정원 단계 전용" 템플릿).

공용 필드(5종 전부 동일): camera/perspective·lighting = §0 공용(5단계
전부 동일 각도·광원, 확대/축소 드리프트 없음). crop = isolated single
garden bed, centered, canvas 64×64 (2x 128×128). transparent
background·empty margin = §0 공용. **anchor consideration(공용, 다른
P0와 다름)**: 화단 실루엣은 캔버스 하단에 붙지 않고 **캔버스 중앙에
위치**한다 — 이 스프라이트는 셀 격자에 하단-중앙 앵커되는 게 아니라
별도 CSS로 고정된 화단 박스 안에 합성되므로, "위에서 살짝 내려다본
완전한 원형 화단"으로 보여야 한다.

### `nature/garden-stage-0` (seed 단계)
- subject: round garden bed, bare soil with a single tiny seed visible
- proportions: 공용 화단 크기/위치, 5단계 전부 동일(확대·축소 드리프트 없음)
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

### `nature/garden-stage-1` (sprout 단계, threshold≥10)
- subject: same bed, a few small green sprouts
- proportions: 공용, stage-0과 동일
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

### `nature/garden-stage-2` (flower 단계, threshold≥30)
- subject: same bed, a handful of blooming flowers
- proportions: 공용, stage-0/1과 동일
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

### `nature/garden-stage-3` (bloom 단계, threshold≥60)
- subject: same bed, a fuller flower bed in bloom
- proportions: 공용, 이전 단계와 동일
- do-not-include: NEG-COMMON + Paul 제외(추가 금지 없음)

### `nature/garden-stage-4` (full 단계, threshold≥100)
- subject: same bed, a lush fully bloomed flower bed with one small bird visiting
- proportions: 공용, 새는 기존 화단 스케일을 깨지 않을 만큼 작게
- do-not-include: NEG-COMMON + Paul 제외 + "no additional birds beyond the one small bird described"

---

## 7. AMBIGUOUS 항목 안내

`nature/garden-stage-0..4`의 **런타임 렌더 픽셀 크기(@360/@512)**는
`V2A_ARTWORK_SPEC_FINAL.md` §2 GROUP D 181행이 명시적 px 없이 고정
화단 박스의 퍼센트 좌표(left 2%/top 12%/width 30%/height 22%)만
규정한다 — 이 프롬프트 팩은 **소스 캔버스(64×64/128×128) 생성**에만
관여하므로 이 모호성의 영향을 받지 않지만, 실제 배치·스케일 검증은
`docs/design/town/V2B_ARTWORK_DROPIN_CONTRACT.md` 6절의 AMBIGUOUS
표기를 참고해 운영자 확인 후 진행해야 한다.

## 8. GROUP H — PAUL(폴 캐릭터) 관련 안내

폴(Paul) 캐릭터는 이 프롬프트 팩에 없다 — 기존 공식 에셋만 사용, 새
얼굴 생성 금지.

---

_작성: docs-maintainer, 2026-09-13(V2-B 세션). 근거:
`V2A_ARTWORK_SPEC_FINAL.md` §1/§2/§3, `V2A_ASSET_SPEC.md`(초안),
`src/utils/town/townCatalog.js`, `src/utils/town/townScene.js`(전부
이 세션에서 직접 Read로 확인, 추측 수치 없음)._
