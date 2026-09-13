# Paul Town V2-A — Batch 2 커미션 팩 (남은 15개 P0 자산)

> 상태: 설계 문서(디자인 전용). 이미지 생성/코드 변경 없음. `docs/design/town/
> V2A_ARTWORK_SPEC_FINAL.md`("FINAL")를 유일한 권위 있는 수치 출처로 삼고,
> `src/assets/town/assetManifest.js`("매니페스트")를 캔버스 규격의 그라운드
> 트루스로 삼는다. 이 문서와 FINAL/매니페스트가 배치되면 FINAL과
> 매니페스트가 항상 이긴다 — 이 문서는 그것들을 대체하지 않는다.
>
> **선행 확인(이 세션에서 직접 Read)**: `V2A_ARTWORK_SPEC_FINAL.md`,
> `V2A_ARTWORK_PROMPT_PACK.md`, `V2B_ARTWORK_DROPIN_CONTRACT.md`,
> `src/assets/town/assetManifest.js`, `src/assets/town/index.js`,
> `src/utils/town/townCatalog.js`, `src/utils/town/townScene.js`,
> `src/utils/townShop.js`. `TOWN_ASSETS`(`src/assets/town/index.js`
> 24~33행)에 실제 채워진 8개 키(`buildings/my-house`,
> `buildings/british-cottage`, `nature/tree`, `nature/garden-stage-0`~
> `garden-stage-4`)를 실측 확인했다 — PR #51(Batch 1) 병합 산출물이며,
> 기능 플래그 `paulTownV2`는 여전히 OFF다.

## 0. 범위 재확인 — 남은 15개, P0 23개 중 Batch 1(8개) 제외

이 지시문 원문은 "Buildings (4): book-shop, cafe, special/english-school,
special/clock-tower, special/bridge"라고 적었지만 **직접 나열한 항목이
이미 5개**다 — `assetManifest.js`의 `BUILDINGS` 배열(55~69행)을 재확인한
결과 실제로도 **건물 5종**이 맞다(book-shop/cafe/english-school/
clock-tower/bridge). 지시문의 "(4)"라는 괄호 숫자가 오기이며, 이후 산출물
전체에서 건물 그룹은 5종으로 취급한다. 나머지 카운트(자연 2 + 장식 5 +
동물 3 = 10)는 지시문과 일치하며, 5(건물)+2(자연)+5(장식)+3(동물) =
**15개**로 매니페스트 총 23개 − Batch 1 라이브 8개와 정확히 일치한다.

남은 15개 전체 목록(그룹순):

- **건물(5)**: `buildings/book-shop`, `buildings/cafe`,
  `special/english-school`, `special/clock-tower`, `special/bridge`
- **자연(2)**: `nature/flower-garden`, `decorations/stone-fountain`
- **장식(5)**: `decorations/bench`, `decorations/town-sign`,
  `decorations/shop-lamp`, `decorations/street-lamp`,
  `decorations/red-post-box`
- **동물(3)**: `animals/cat`, `animals/puppy`, `animals/owl`

**범위 밖(P1/P2, 이번 커미션 대상 아님)**: 길(path) 4종, 헤지, 포그,
`ui/parcel`, `-lights`/`-on`/`-blink` 변형 전부, 지형(terrain) 5종. 이
목록과 상태는 (지시문이 인용한 `V2A_ARTWORK_SPEC_FINAL.md` §7/§8이
아니라) **`V2B_ARTWORK_DROPIN_CONTRACT.md` 7절(P1 요약표)과 8절(P2
요약표)**에 정리돼 있다 — FINAL 자체는 절을 "§7/§8"로 번호 매기지 않고
GROUP A~H 표로 구성돼 있으므로, 지시문의 인용 표기를 여기서 정정해
기록한다(값 자체는 동일 출처, 인용 위치만 정정).

## 1. 15개 전체 공용 규칙(매 행마다 반복하지 않음)

아래 7개 필드는 15개 자산 **전부** 동일하며, 2절 이후 표에서 별도
컬럼으로 반복하지 않는다(FINAL §1/`V2A_ARTWORK_PROMPT_PACK.md` §0과
동일한 "공용" 표기 관례를 따른다).

- **투명 배경**: YES, premultiplied alpha, 가장자리 4% 이상 완전 투명
  여백(모든 P0 23개 공통, `red-post-box`도 배경 투명성 자체는 예외
  아님 — 색상 팔레트만 예외).
- **앵커**: 하단-중앙(bottom-center) — 매니페스트 `anchor:
  'bottom-center'`가 15개 전부에 고정.
- **z-depth**: `objects(10)` — 15개 전부 `zLayer: 'objects'`(매니페스트
  확인, `patches`인 항목은 garden-stage뿐이고 이번 15개 안에는 없다).
- **광원**: 좌상단 고정 단일 광원, 방향성 캐스트 섀도 금지, 접촉부에만
  15% 이하 옅은 그림자 암시(`TownSprite.jsx`가 런타임 CSS로 진한
  접촉 그림자를 이미 그린다 — 원화에 이중으로 그리지 않는다).
- **화각**: 3/4 탑다운, 카메라 틸트 약 30도, 완전한 아이소메트릭 아님.
- **가장자리 처리**: 소프트 페인터리, 하드 아웃라인 없음, 프리멀티플라이드
  알파, 4% 이상 안전 여백.
- **잠금/포그 실루엣 변형**: **불필요** — FINAL GROUP G(2절)에 따라
  잠긴 상태는 새 파일이 아니라 **기존 베이스 스프라이트를 `opacity:
  0.15` CSS로 재사용**한다. 15개 전부 별도 잠금 파일을 만들지 않는다.

## 2. 커미션 매니페스트 — 건물(`buildings/`, `special/`, 5종)

`footprintFor()`(`townScene.js` 94~100행)가 `house`/`special` 둘 다
`lg`로 매핑해 5종 전부 동일 발자국 클래스를 공유한다.

| asset_key | 파일 | 캔버스 1x/2x | 렌더 @360/@512 | 종횡비 | 발자국 | 팔레트 강조 | 야간(`-lights`) 필요 | 폴백 이모지 | 인게임 위치/용도 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|
| `buildings/book-shop` | buildings/book-shop.webp | 128×160/256×320 | 62×78/97×121 | 4:5 | lg | 버건디+소프트골드 우세(고서점 느낌), 웜크림 벽면 | YES(매니페스트 `variants: ['book-shop-lights']`) | 📚 | Lv3, price 120(dollars), category house — 책방(책방/Book Shop) | 8 |
| `buildings/cafe` | buildings/cafe.webp | 128×160/256×320 | 62×78/97×121 | 4:5 | lg | 웜앰버+웜크림 우세(차양/따뜻한 조명) | YES(`cafe-lights`) | ☕ | Lv5, price 120, category house — 카페(카페/Cafe) | 12 |
| `special/english-school` | special/english-school.webp | 128×154/256×308 | 62×74/97×116 | 5:6 | lg | 웜크림+모스그린 우세, 우드 트림(친근한 교육 톤, 비-권위적) | YES(`english-school-lights`) | 🏫 | Lv7, price 150, category special — 영어 학교(영어 학교/English School) | 14 |
| `special/clock-tower` | special/clock-tower.webp | 128×256/256×512 | 62×124/97×194 | 1:2(세로 과장) | lg(세로 초과 허용) | 머티드네이비 우세(탑 본체/지붕) + 소프트골드 악센트(시계 판 테두리만, 숫자/텍스트 없음) | YES(`clock-tower-lights`) | 🕰️ | Lv8, price 200, category special — 세트 최고 랜드마크 시계탑(시계탑/Clock Tower) | 15 |
| `special/bridge` | special/bridge.webp | 160×80/320×160 | 82×41/128×64 | 2:1(가로) | lg 공식의 명시적 예외 — 실제 점유 셀 수 implementer 확인 필요(FINAL 171행 각주 그대로 승계) | 우드+웜크림 우세(석재는 팔레트 전용색이 없어 우드/크림으로 근사) + 머티드네이비 옅은 그림자 | **NO**(창문 없음, FINAL 171행 "조명 오버레이 없음"과 매니페스트 `variants: []` 둘 다 확인) | 🌉 | Lv6, price 150, category special — 다리(다리/Bridge) | 13 |

**공통 애니메이션/변형 메모(건물 5종)**: `-lights` 창문 불빛 오버레이는
4종(book-shop/cafe/english-school/clock-tower)에서 P1로 필요하지만
**이번 커미션의 1차 납품 범위는 아니다**(FINAL "1차 납품 필수 아님").
지시문 원문이 "5개 건물 모두" `-lights` 대상이라고 서술했으나, 실제로는
`bridge`가 명시적으로 제외된 **4개**뿐임을 매니페스트/FINAL 양쪽에서
재확인했다 — 이 문서는 원문의 숫자를 따르지 않고 코드 사실을 따른다.

## 3. 커미션 매니페스트 — 자연(`nature/`, `decorations/`, 2종)

`stone-fountain`은 시각적으로 자연류지만 `townCatalog.js`의 실제
`category`가 `decoration`이라 폴더/발자국은 decorations 규칙을 따른다
(카탈로그가 진실 원천, FINAL GROUP D 각주와 동일).

| asset_key | 파일 | 캔버스 1x/2x | 렌더 @360/@512 | 종횡비 | 발자국 | 팔레트 강조 | 야간 변형 | 폴백 이모지 | 인게임 위치/용도 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|
| `nature/flower-garden` | nature/flower-garden.webp | 96×64/192×128 | 46×31/72×48 | 3:2(가로) | md | 모스그린 우세 + 소프트골드(꽃 악센트) | NO(장식/자연류는 창문 개념 없음) | 🌷 | Lv3, price 30, category nature — 꽃밭(꽃밭/Flower Garden) | 7 |
| `decorations/stone-fountain` | decorations/stone-fountain.webp | 72×72/144×144 | 36×36/56×56 | 1:1 | sm(주의: 그룹명은 "자연"이지만 실제 발자국 클래스는 decorations 규칙 — md 아님) | 머티드네이비+웜크림 우세(석재 근사) + 모스그린 이끼 악센트 | NO | ⛲ | Lv5, price 60, category decoration — 돌 분수(돌 분수/Stone Fountain) | 11 |

## 4. 커미션 매니페스트 — 장식(`decorations/`, 5종)

장식류 공용 proportions(FINAL §3 GROUP E): "사람/아이 스케일의 작은
거리 소품 — 자연/건물류보다 확연히 작고 섬세하게".

| asset_key | 파일 | 캔버스 1x/2x | 렌더 @360/@512 | 종횡비 | 발자국 | 팔레트 강조 | 야간 변형 | 폴백 이모지 | 인게임 위치/용도 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|
| `decorations/bench` | decorations/bench.webp | 72×48/144×96 | 36×24/56×37 | 3:2(가로) | sm | 우드 우세 + 머티드네이비 옅은 악센트 | NO | 🪑 | Lv1, price 15, category decoration — 벤치(벤치/Bench) | 1 |
| `decorations/town-sign` | decorations/town-sign.webp | 72×108/144×216 | 36×54/56×84 | 2:3(세로) | sm | 우드 우세 + 버건디 악센트, 팻말 표면은 완전히 빈 채로 | NO | 🪧 | Lv1, price 40, category decoration — 마을 표지판(마을 표지판/Town Sign) | 2 |
| `decorations/shop-lamp` | decorations/shop-lamp.webp | 72×144/144×288 | 36×72/56×112 | 1:2(세로) | sm | 우드 램프대 + 소프트골드 트림, 꺼진(unlit) 상태로 제작 | NO(1차 납품은 unlit 베이스만) | 💡 | Lv1, price 60, category decoration — **주의**: asset_key는 `shop-lamp`지만 `townCatalog.js` 55행 기준 실제 표시명은 "책상 램프/Desk Lamp"(레거시 `townShop.js` `shop-lamp` 항목을 카탈로그가 그대로 흡수한 결과, 이름과 asset_key가 불일치) | 3 |
| `decorations/street-lamp` | decorations/street-lamp.webp | 72×144/144×288 | 36×90/56×140 | 1:2.5(세로, **주의 각주 참고**) | sm | 우드/머티드네이비 램프대 + 소프트골드 램프 헤드, 꺼진(unlit) 상태 | NO(1차 납품은 unlit 베이스만; `-on` 점등 변형은 P1 — 이번 커미션 범위 밖) | 🪔 | Lv2, price 25, category decoration — 가로등(가로등/Street Lamp) | 5 |
| `decorations/red-post-box` | decorations/red-post-box.webp | 72×108/144×216 | 36×54/56×84 | 2:3(세로) | sm | **팔레트 예외** — 전통 영국 우체통 빨강 유지(배경 투명성 자체는 예외 아님) + 소프트골드 트림 | NO | 📮 | Lv2, price 25, category decoration — 빨간 우체통(빨간 우체통/Red Post Box) | 6 |

**각주(`street-lamp` 캔버스/종횡비 불일치, 정직하게 기록)**: 매니페스트의
`decorations/street-lamp` 항목은 캔버스를 `shop-lamp`와 **동일한**
72×144(픽셀 비율 정확히 1:2)로 규정하면서도 `aspectRatio` 필드 값은
`'1:2.5'`로 적혀 있고, FINAL/드롭인 계약 문서의 렌더 크기도 36×90(1:2.5
비율)로 캔버스와 어긋난다 — 즉 "캔버스 72×144(1:2)"와 "표기 종횡비/렌더
1:2.5"가 산술적으로 맞지 않는다. 이 불일치는 FINAL 작성 시점부터 이미
존재했고(이번 문서가 새로 만든 값이 아니다), `assetManifest.js`가
코드이므로 이 문서(docs-maintainer, `*.md`만 수정 가능)는 그 값을 고치지
않는다 — 원화가/운영자는 **캔버스 규격은 매니페스트의 72×144를 그대로
따르되, 세로로 더 슬림·롱한 실루엣(가로등이 가로등 램프보다 눈에 띄게
더 길쭉해 보이도록)으로 그려 1:2.5에 가까운 "체감 종횡비"를 캔버스 안
여백 배분으로 흉내내는 것으로 해석**하는 편이 가장 안전하다(코드 수정
없이 의도를 살리는 해석). 실제 코드 정정이 필요하다고 판단되면
implementer에게 별도로 위임해야 한다.

## 5. 커미션 매니페스트 — 동물(`animals/`, 3종)

동물류 공용 proportions(FINAL §3 GROUP F): "치비(chibi) 비례로 약간
오버사이즈 머리, 세트 전체에서 가장 작은 시각 스케일 클래스".

| asset_key | 파일 | 캔버스 1x/2x | 렌더 @360/@512 | 종횡비 | 발자국 | 팔레트 강조 | 애니메이션 | 폴백 이모지 | 인게임 위치/용도 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|
| `animals/cat` | animals/cat.webp | 72×54/144×108 | 36×27/56×42 | 4:3(가로) | sm | 우드/웜크림 톤의 차분한 자연 털색 | 기본 정적, `-blink` 2프레임은 **P2로 이연**(이번 커미션은 베이스 정지 포즈만) | 🐱 | Lv2, price 20, category animal — 고양이(고양이/Cat) | 4 |
| `animals/puppy` | animals/puppy.webp | 72×54/144×108 | 36×27/56×42 | 4:3(가로) | sm | 웜크림/우드 톤 털색 | 위와 동일(P2 이연) | 🐶 | Lv4, price 30, category animal — 강아지(강아지/Puppy) | 9 |
| `animals/owl` | animals/owl.webp | 72×96/144×192 | 36×48/56×75 | 3:4(세로) | sm | 머티드네이비/우드 깃털톤 + 웜크림 가슴깃 | 위와 동일(P2 이연) | 🦉 | Lv4, price 40, category animal — 부엉이(부엉이/Owl) | 10 |

## 6. 자산별 생성 프롬프트

**중요(중복 방지 고지)**: `V2A_ARTWORK_PROMPT_PACK.md`를 이 세션에서
다시 확인한 결과, 그 문서는 이미 P0 23종 **전체**(8개 라이브 자산뿐
아니라 이 15개 포함)에 대해 subject/camera/lighting/proportions/crop/
transparent background/empty margin/anchor consideration/do-not-include
9필드 구조 프롬프트를 갖고 있다 — 지시문이 전제한 "8개만 담고 있다"는
설명과 실제 파일 내용이 다르다는 점을 정직하게 밝힌다. 따라서 이
6절은 그 9필드 구조를 **그대로 반복하지 않는다.** 대신 같은 정보를
**FINAL §3 그룹 템플릿과 동일한 한 문단짜리(paste-ready single
paragraph) 포맷**으로 압축해, 원화가에게 빠르게 붙여넣을 수 있는
간이 버전을 제공한다 — 필드별 세부값이 필요하면
`V2A_ARTWORK_PROMPT_PACK.md`의 해당 섹션(§2 GROUP C/§3 GROUP D-1/
§4 GROUP E/§5 GROUP F)이 항상 우선하는 상세 출처다. 공용 네거티브
프롬프트(NEG-COMMON)와 팔레트 문자열은 `V2A_ARTWORK_PROMPT_PACK.md`
§0/§1을 그대로 참조하며 여기 재인용하지 않는다.

### 건물

- **book-shop**: "Cozy British storybook bookshop with a round window
  and a blank shop-sign area (no readable text), 3/4 top-down angle ~30
  degrees, soft painterly illustration, palette leaning burgundy and
  soft gold with warm cream walls (#7a2e3a, #c9a227, #fdebd0), small
  warm-lit windows, silhouette filling 85-95% of canvas height so it
  reads roughly 2.4x taller than `nature/tree` at the same scale,
  isolated on transparent background, light from top-left, no outlines,
  premium child-friendly feel."
- **cafe**: "Small British storybook cafe with a modest awning and an
  optional outdoor table/parasol silhouette kept inside frame, 3/4
  top-down angle ~30 degrees, soft painterly style, palette leaning warm
  amber and warm cream (#e0a73a, #fdebd0) with wood trim, small
  warm-lit windows, isolated on transparent background, light from
  top-left, no outlines."
- **english-school**: "Village school building, educational and
  welcoming storybook-cute tone (not institutional-realistic), 3/4
  top-down angle ~30 degrees, soft painterly style, palette leaning
  warm cream and moss green with wood trim (#fdebd0, #cfe3c0, #8b6f3e),
  small warm-lit windows, isolated on transparent background, light
  from top-left, no outlines, canvas proportions 128:154."
- **clock-tower**: "Tall clock tower, the tallest landmark silhouette
  in the whole set, plain symbolic clock face with no visible numerals
  or text, 3/4 top-down angle ~30 degrees, soft painterly style,
  palette leaning muted navy for the tower body and roof with a soft
  gold accent ring around the clock face only (#1e2a5a, #c9a227),
  vertically exaggerated 1:2 proportions, isolated on transparent
  background, light from top-left, no outlines."
- **bridge**: "Single stone bridge, wide and low, ground-level
  architecture with no windows and no doors, 2:1 horizontal silhouette
  with no vertical tower mass, 3/4 top-down angle ~30 degrees, soft
  painterly style, palette leaning wood brown and warm cream with a
  faint muted-navy contact shadow (#8b6f3e, #fdebd0, #1e2a5a), isolated
  on transparent background, light from top-left, no outlines, no
  lit-window glow overlay needed."

### 자연

- **flower-garden**: "Single low flower garden bed, ground-hugging,
  wide rather than tall, clearly smaller/lower than `nature/tree` at
  the same scale, 3/4 top-down angle ~30 degrees, soft painterly style,
  palette leaning moss green with soft gold flower accents (#8fb37a,
  #c9a227), isolated on transparent background, light from top-left,
  no outlines."
- **stone-fountain**: "Single small stone fountain, compact and
  roughly circular, human-scale — clearly smaller than `nature/tree`,
  3/4 top-down angle ~30 degrees, soft painterly style, palette leaning
  muted navy and warm cream for the stone body with a faint moss-green
  moss accent (#1e2a5a, #fdebd0, #8fb37a), isolated on transparent
  background, light from top-left, no outlines."

### 장식

- **bench**: "Small wooden park bench, low and wide (3:2), 3/4 top-down
  angle ~30 degrees, soft painterly style, palette leaning wood brown
  with a faint muted-navy accent (#8b6f3e, #1e2a5a), isolated on
  transparent background, light from top-left, no outlines."
- **town-sign**: "Carved wooden village signpost with a completely
  blank sign surface (no text or symbols on the board), narrow and
  upright (2:3), 3/4 top-down angle ~30 degrees, soft painterly style,
  palette leaning wood brown with a burgundy accent (#8b6f3e, #7a2e3a),
  isolated on transparent background, light from top-left, no
  outlines."
- **shop-lamp**: "Ornate small shop lamp post, unlit/off base state,
  slim and tall (1:2), 3/4 top-down angle ~30 degrees, soft painterly
  style, palette leaning wood brown with a soft gold trim
  (#8b6f3e, #c9a227), isolated on transparent background, light from
  top-left, no outlines."
- **street-lamp**: "Tall street lamp post, unlit/off base state,
  slimmest and tallest decoration-class prop, 3/4 top-down angle ~30
  degrees, soft painterly style, palette leaning wood brown or muted
  navy for the post with a soft gold lamp head cap (#8b6f3e, #1e2a5a,
  #c9a227), keep the lamp head silhouette simple so a future lit `-on`
  overlay (P1, not part of this batch) can align exactly, isolated on
  transparent background, light from top-left, no outlines."
- **red-post-box**: "Traditional British red post box, narrow and
  upright (2:3), 3/4 top-down angle ~30 degrees, soft painterly style,
  palette exception — keep the traditional red post-box color (do not
  substitute the shared 7-color palette here), soft gold trim accent
  (#c9a227), isolated on transparent background, light from top-left,
  no outlines."

### 동물

- **cat**: "Cute chibi-proportioned sitting cat, idle pose, 3/4
  top-down angle, soft painterly style, muted natural fur tones within
  the warm palette (wood brown/warm cream), no realistic facial detail,
  isolated on transparent background, light from top-left, no
  outlines."
- **puppy**: "Cute chibi-proportioned puppy, standing/idle pose, 3/4
  top-down angle, soft painterly style, muted natural fur tones within
  the warm palette (warm cream/wood brown), no realistic facial detail,
  isolated on transparent background, light from top-left, no
  outlines."
- **owl**: "Cute chibi-proportioned owl, perched idle pose drawn in
  isolation with no branch/perch prop in frame, taller/narrower 3:4
  silhouette, 3/4 top-down angle, soft painterly style, muted feather
  tones within the warm palette (muted navy/wood brown with a warm
  cream chest), no realistic facial detail, isolated on transparent
  background, light from top-left, no outlines."

## 7. GENERATION BATCH PLAN — Batch 2 / 3 / 4

Batch 1(PR #51, 라이브 완료)은 "세계관을 정의하는" 최소 3종
(`buildings/my-house`, `buildings/british-cottage`, `nature/tree`) +
정원 5단계였다 — 집 두 채와 스케일 기준 나무를 한 세트로 묶어 세계관의
시각적 골격(마을이 어떤 크기/톤인지)을 먼저 확정한 선례다. 이 선례의
논리("세계관을 정의하는 것 먼저, 소소한 장식은 나중")를 그대로 이어
남은 15개를 3배치로 나눈다.

### Batch 2 — 건물 5종(book-shop, cafe, english-school, clock-tower,
bridge)

**왜 한 배치로 묶는가**: 이 5종은 Batch 1이 확정한 "동화책 마을"의
건축 언어(지붕/창문/벽면 질감/상대 스케일)를 **직접 계승·확장**해야
하는 자산이다 — 만약 이 5종을 서로 다른 세션(다른 아티스트 컨디션/다른
날)에 나눠 그리면, 지붕 형태·창문 비율·벽 질감이 미묘하게 달라져
나란히 배치했을 때(마을 광장에 책방·카페·학교·시계탑이 동시에 보임)
이질감이 가장 크게 드러난다. FINAL §1의 "오브젝트 간 상대 스케일
일관성" 규칙(코티지가 나무보다 약 2.4배 커 보여야 함)도 건물류
전체에서 한 번에 검증하는 편이 안전하다. 지시문의 기본 제안(건물을
한 배치로)이 이 근거로 타당하다고 판단해 그대로 채택한다.

**배치 내부 순서(우선순위 열 기준)**: book-shop(8) → cafe(12) →
bridge(13) → english-school(14) → clock-tower(15) — Lv3/Lv5/Lv6/Lv7/Lv8
순으로, 학생이 더 낮은 레벨에서 먼저 마주치는 건물을 배치 안에서도
먼저 완성해 부분 납품(전부 끝나기 전 먼저 써먹을 수 있는 것)이
가능하게 한다.

### Batch 3 — 자연/장식 7종(flower-garden, stone-fountain, bench,
town-sign, shop-lamp, street-lamp, red-post-box)

**왜 한 배치로 묶는가**: 이 7종은 전부 "땅에 붙은 작은 오브젝트"
스타일 클래스를 공유한다 — 건물처럼 지붕/창문 같은 복잡한 구조가
없고, 동물처럼 생물의 포즈/표정을 신경 쓸 필요도 없다. 우드/스톤
질감과 작은 실루엣 처리 방식(FINAL §3 GROUP D-1/E 공용 문구)이
거의 동일해 한 아티스트가 한 세션에 몰아 그려도 스타일 드리프트
위험이 낮다. 또한 이 배치는 **Lv1짜리 두 항목(bench, town-sign)**을
포함해, Batch 2(건물, 최저 레벨 Lv3)보다 학생이 실제로 더 일찍
마주치는 자산이 섞여 있다 — 그럼에도 Batch 2를 먼저 둔 이유는 순전히
레벨 순서가 아니라 "세계관 골격(건물)을 먼저 완성해야 나머지 소품이
그 건축 언어에 맞춰 톤을 잡기 쉽다"는 스타일 종속성 때문이다(장식류
프롬프트가 이미 "건물/자연류보다 확연히 작고 섬세하게"라는 상대적
문구를 쓰므로, 건물의 최종 톤이 먼저 있어야 장식류 아티스트가 비교
기준을 가진다).

**배치 내부 순서**: bench(1) → town-sign(2) → shop-lamp(3) →
street-lamp(5) → red-post-box(6) → flower-garden(7) →
stone-fountain(11) — Lv1 두 개를 가장 먼저, Lv5 stone-fountain을
가장 나중에 두는 순수 레벨 오름차순(동일 레벨 내 가격 오름차순,
2절~5절의 "우선순위" 열과 동일한 산식: minLevel 오름차순 → price
오름차순 → 동률 시 townCatalog.js `sortOrder` 오름차순).

### Batch 4 — 동물 3종(cat, puppy, owl)

**왜 마지막인가**: 동물은 생물체(living creature) 스타일 클래스로,
건물/자연/장식(전부 무생물 오브젝트)과 그림 언어가 가장 이질적이다
(치비 비례, 표정 없는 부드러운 얼굴 처리 등 별도 규칙 필요). Batch
1에서도 동물은 P0에 속해 있었지만 첫 배치(3종 세계관 자산)에
포함되지 않고 후순위로 밀렸던 것과 동일한 논리를 유지한다 — "마을의
뼈대(건물·자연·장식)가 먼저 서야, 그 위에 놓이는 생물이 스케일
기준을 잡기 쉽다"(동물류 공용 프롬프트 자체가 "세트 전체에서 가장
작은 시각 스케일 클래스"라고 상대적으로 정의돼 있어, 비교 대상인
장식류가 먼저 확정돼 있어야 함). 개수도 3종으로 가장 적어 마지막
배치로 두어도 전체 일정에 미치는 영향이 작다.

**배치 내부 순서**: cat(4) → puppy(9) → owl(10) — Lv2/Lv4/Lv4 순,
동일 레벨(puppy/owl 둘 다 Lv4)은 price 오름차순(30 < 40).

### 배치 간 전체 진행 순서 요약

Batch 2(건물 5) → Batch 3(자연/장식 7) → Batch 4(동물 3). 이는 지시문의
제안 그룹핑을 그대로 채택한 결과이며, 근거는 "스타일 종속성(건물이
먼저 확정돼야 나머지가 톤을 맞추기 쉽다)"이 "순수 레벨 도달 순서"보다
우선한다는 판단이다 — 다만 배치 **내부**에서는 항상 레벨/가격 오름차순을
지켜, 부분 납품 시 학생이 실제로 가장 먼저 만나는 자산이 각 배치
안에서도 가장 먼저 나온다.

## 8. 폴(Paul) 캐릭터 관련 안내

이 15개 자산 중 폴 캐릭터를 요청하거나 필요로 하는 항목은 **없다**.
기존 `src/utils/paulReactions.js`의 공식 리액션 이미지/사운드만
계속 유일한 폴 소스로 남으며, 이번 커미션 팩은 폴의 새 포즈/표정을
전혀 다루지 않는다(FINAL GROUP H, `V2A_ARTWORK_PROMPT_PACK.md` §8과
동일한 범위 제한을 그대로 승계).

---

_작성: docs-maintainer, 2026-09-14. 근거: `V2A_ARTWORK_SPEC_FINAL.md`,
`V2A_ARTWORK_PROMPT_PACK.md`, `V2B_ARTWORK_DROPIN_CONTRACT.md`,
`src/assets/town/assetManifest.js`, `src/assets/town/index.js`,
`src/utils/town/townCatalog.js`, `src/utils/town/townScene.js`,
`src/utils/townShop.js`(전부 이 세션에서 직접 Read/Grep으로 확인,
추측 수치 없음). 지시문 원문과 실제 코드/문서 사실이 갈리는 지점
(건물 개수 "(4)"→실제 5, 프롬프트 팩이 "8개만"이 아니라 23개 전체를
이미 담고 있는 점, `street-lamp` 캔버스/종횡비 불일치)은 전부 각
해당 절에 각주로 정직하게 남겼다._
