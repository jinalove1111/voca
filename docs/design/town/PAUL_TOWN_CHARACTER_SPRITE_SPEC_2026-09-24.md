# Paul Town 2.5D — 캐릭터 스프라이트 디자인·제작 스펙 (2026-09-24)

> 상태: 설계 문서(디자인 전용). **이 문서로 이미지를 생성·채택하지 않는다.**
> 이 문서는 `docs/design/town/SPRITE_CONTRACT_2026-09-24.md`가 확정한
> "조건 B — 객관적으로 확정 가능한 기성 에셋 없음, 커스텀 제작 필요"
> 판정(§1/§7) 이후의 다음 단계로, 커스텀 캐릭터를 **발주·생성하기 위한**
> 아트 방향/프레임 목록/앵커/프롬프트 팩/라이선스 기록 규칙을 규정한다.
> 코드/이미지/DB 변경 없음. 최종 이미지는 아직 존재하지 않으며, 어떤
> 에이전트도 이 문서를 근거로 이미지를 생성하거나 저장소에 채택해서는
> 안 된다 — 승인은 사람(리드/운영자)의 몫이다.

## 0. 목적·범위·고정 결정사항

**목적**: `SPRITE_CONTRACT_2026-09-24.md` §7이 사람에게 넘긴 결정(신규
제작 경로, §7-2) 중 "무엇을, 어떤 모양으로, 어떤 앵커로 만들 것인가"를
구체화해 실제 이미지 생성 작업(사람 또는 별도 세션)이 바로 착수할 수
있는 발주서를 만든다. `SPRITE_CONTRACT_2026-09-24.md` §4의 스프라이트
**계약**(state/frame/앵커 런타임 규칙, 이미 확정)을 재정의하지 않고
그 위에 **아트 콘텐츠 사양**만 얹는다(CLAUDE.md 규칙 3).

**범위**: 캐릭터 아트 방향, 8프레임 목록과 파일명, 애니메이션 타이밍,
캔버스/해상도/앵커, 이미지 생성용 프롬프트 팩, 일관성 검수표, 라이선스·
생성 이력 기록 규칙, 코드 연결 지점 요약. **범위 밖**: 실제 이미지 생성,
코드 구현(`characterManifest.default.js`/레지스트리/플래그 배선 — 전부
`SPRITE_CONTRACT_2026-09-24.md` §5 적용 체크리스트가 이미 규정), DB/
이코노미 변경.

**이미 고정된 결정(재논의하지 않음)**:

- Kenney Toon Characters / GrafxKid RPG Character Sprites / rgsdev
  Hand-Drawn Square Characters 전부 **미채택**(`SPRITE_CONTRACT_2026-09-24.md`
  §1/§2 — sit 부재 또는 사람 형태 아님 또는 포즈 미문서화로 idle+walk+sit
  3종을 객관적으로 만족하는 후보 없음). 추가 무료 에셋 검색도 하지 않는다.
- **Paul Town 전용 커스텀 캐릭터**로만 간다.
- 최종 이미지는 **아직 승인되지 않았고**, 어떤 에이전트도 이 문서를 근거로
  이미지를 생성·채택해서는 안 된다.
- 승인된 스프라이트가 생기기 전까지 **이모지 폴백**(🚶 idle/walk, 🧘 sit,
  `characterManifest.js` `EMOJI_GLYPH_BY_STATE`)을 그대로 유지한다.
- 이모지의 다리 움직임 부재는 **알려진 한계**이며 CSS로 흉내 내지 않는다
  (스프라이트가 생길 때까지 그대로 둔다).

## 1. 캐릭터 아트 방향

- 초등학생 느낌, 성별 중립.
- 밝고 친근한 인상.
- 기존 마을과 어울리는 부드러운 페인터리(painterly) 3/4 시점.
- 굵은 외곽선(하드 아웃라인) 금지.
- 평면 벡터(플랫 카툰) 금지.
- 과도한 사실주의(포토리얼리즘) 금지.
- 채도/선명도는 `house/tree/bench` 등 배경·오브젝트 자산보다 높지 않게
  — 캐릭터가 씬에서 과하게 튀지 않아야 한다.
- 모바일 소형 렌더(§5 `CHARACTER_MIN_WIDTH_PX = 40px`)에서도 머리·몸·다리
  동작이 식별 가능해야 한다.
- 투명 배경.
- 모든 프레임에서 동일 인물·동일 얼굴·동일 헤어·동일 의상·동일 비율·
  동일 광원(§7 일관성 검수표로 검증).

### 1.1 하우스 스타일 요약 (5줄, `sprite-research/paultown-ref/README.md` 근거)

1. 3/4 정면-측면 각도(살짝 위에서 내려다보는, top-down은 아님) — 캐릭터/
   오브젝트 공통, 바닥 타일만 완전 top-down.
2. 페인터리/반사실적 디지털 일러스트 — 부드러운 에어브러시 그라디언트
   음영, 검은 외곽선·셀 셰이딩 없음.
3. 건물/자연물은 자연스러운 비례, 동물/폴(Paul) 캐릭터는 귀엽고 둥근
   비례 — 새 캐릭터도 후자(귀엽고 둥근 비례) 쪽을 따른다.
4. 팔레트는 따뜻하고 채도 있는 톤 — 짙은 녹색, 따뜻한 돌/나무 갈색,
   부드러운 파스텔 꽃 색, 골든아워 하이라이트.
5. 조명은 좌상단/정면에서 오는 부드럽고 확산된 빛 — 강한 방향성 그림자
   없음, 은은한 낙하 그림자만.

## 2. 프레임 목록

8프레임 고정(추가/삭제 없음). 좌측 이동은 `walk-side` 프레임을
`scaleX(-1)`로 재사용하며 별도 좌측 프레임을 만들지 않는다(§5, 코드
쪽 근거는 `ProtoCharacter.jsx:10-18` 헤더 주석 + `:388-396` facing 레이어).
측면(`side`) 프레임은 **오른쪽을 바라보는 모습**으로 그린다.

| 파일명(stem) | 4파일(§9) | 논리 상태(manifest) | 방향 | 애니메이션 순서 | 프레임 지속시간 |
|---|---|---|---|---|---|
| `idle-front` | `.webp`/`.png`/`@2x.webp`/`@2x.png` | `idle` | 정면 | 단독(정지) | 해당 없음(1프레임) |
| `walk-front-a` | 〃 | `walkFront`(§2.1) | 정면 | a→b 교대 1번째 | §3 참고(PROPOSED) |
| `walk-front-b` | 〃 | `walkFront` | 정면 | a→b 교대 2번째 | §3 참고(PROPOSED) |
| `walk-back-a` | 〃 | `walkBack`(§2.1) | 뒷모습 | a→b 교대 1번째 | §3 참고(PROPOSED) |
| `walk-back-b` | 〃 | `walkBack` | 뒷모습 | a→b 교대 2번째 | §3 참고(PROPOSED) |
| `walk-side-a` | 〃 | `walkSide`(§2.1) | 측면(오른쪽 향함) | a→b 교대 1번째 | §3 참고(PROPOSED) |
| `walk-side-b` | 〃 | `walkSide` | 측면(오른쪽 향함) | a→b 교대 2번째 | §3 참고(PROPOSED) |
| `sit` | 〃 | `sit` | 정면(또는 살짝 3/4) | 단독(정지) | 해당 없음(1프레임) |

### 2.1 manifest state 키 매핑 (CONFIRMED — lead 결정, 2026-09-24)

`characterManifest.js`(v1, `REQUIRED_STATES = ['idle', 'walk', 'sit']`,
`characterManifest.js:17`)는 그대로 유지한다 — 기존 72개 테스트의
하위호환을 위해 손대지 않는다(CLAUDE.md 규칙 3). 스프라이트 도입은
**별도의 v2 계약** `src/utils/town/proto2_5d/characterSpriteContract.js`
(Phase 3, 현재 구현 중)로 간다. v1은 오늘 유일한 실제 렌더 경로(이모지)를
그대로 소유하고, v2는 스프라이트 전용 경로다 — 서로 재구현하지 않고
v2는 v1의 공유 이모지 glyph 상수(`EMOJI_GLYPH_BY_STATE`)만 참조한다(§10).

v2 규칙:

- **8프레임 전부 필수** — 매니페스트에 8개 중 하나라도 빠지면 그
  매니페스트 자체가 무효이고 캐릭터 전체가 이모지로 폴백한다(부분
  폴백 없음 — `SPRITE_CONTRACT_2026-09-24.md` §4.2가 미구현으로 남겨둔
  "매니페스트에 없으면 `walkSide`로 폴백" 방식은 v2에서 채택하지
  않는다).
- state 키(5개): `idle` / `walkFront` / `walkBack` / `walkSide` / `sit`.
- 프레임→state 매핑:
  - `idle-front` → `idle`
  - `walk-front-a`/`walk-front-b` → `walkFront`
  - `walk-back-a`/`walk-back-b` → `walkBack`
  - `walk-side-a`/`walk-side-b` → `walkSide`
  - `sit` → `sit`
- 방향 판정: `directionForMove(dx, dy)`가 이동 한 구간(leg)마다
  world-정규화된 dx/dy로 결정한다 — `|dy| > |dx|`면 dy의 부호로
  front/back, 아니면 side; 이동량이 0이면 이전 방향을 유지한다.
- 미러(`scaleX(-1)`)는 **state가 `walkSide`이고 facing이 left일 때만**
  적용한다 — front/back/idle/sit 프레임은 어떤 경우에도 미러링하지
  않는다.
- `leaving`은 그 순간 방향에 해당하는 walk state(`walkFront`/`walkBack`/
  `walkSide` 중 하나)를 재사용한다.

## 3. 애니메이션

- `walk-*-a`/`walk-*-b`는 서로 교대(alternate)하며 무한 반복(loop,
  `SPRITE_CONTRACT_2026-09-24.md` §4.1 표 "loop: 항상").
- **frameDurationMs — PROPOSED**: 125–166ms(=6–8fps) 권장. 근거: 프레임
  스테핑은 `useSpriteFrameIndex`가 `setInterval(1000/fps)`로 구현돼 있어
  (`ProtoCharacter.jsx:177-191`, 특히 `:187` `1000/fps`) fps 1개 값이 곧
  프레임 지속시간을 결정한다. 이동 자체의 전이 시간(`WALK_TRANSITION_MS
  = 650ms`, `ProtoCharacter.jsx:161`)은 별개 축(타일 간 left/top 보간)이라
  fps 선택에 제약을 주지는 않지만, 한 이동 구간(650ms) 동안 다리 교대가
  최소 2회 이상 보여야 "걷는" 느낌이 살아 이 값의 대략적 하한 근거가
  된다(650ms ÷ 2프레임 ≈ 325ms/스텝비교 여유). 6–8fps는 모바일 소형
  캐릭터(`CHARACTER_MIN_WIDTH_PX=40px`)에서 과도한 깜빡임 없이 다리 교대가
  식별되는 일반적인 2D 캐릭터 워크사이클 범위로 제안한다 — **코드/문서
  어디에도 확정된 수치가 없으므로 사람 확정 필요(§11)**.
- `idle`: 1프레임(정지) — 코드가 `frames.length>1`일 때만 프레임을
  스테핑하므로(`useSpriteFrameIndex` 가드) 1프레임 state는 fps 검사 자체가
  생략된다(`characterManifest.js:100-102` 주석).
- `sit`: 1프레임(정지) — 동일.
- `leaving`: 전용 아트 없음. `walk` 계열을 그대로 재사용
  (`stateKeyForPhase`, `characterManifest.js:121-125`).
- reduced-motion: 이동(left/top) 전이는 계속되지만 더 짧아지고
  (`REDUCED_MOTION_TRANSITION_MS=220ms`), 프레임은
  `manifest.reducedMotion.freezeFrameIndex`(기본 0)로 고정된다
  (`ProtoCharacter.jsx:251-252`, `useSpriteFrameIndex`의
  `reducedMotion` 분기).

## 4. 캔버스·해상도

- **96×128px @1x, 192×256px @2x** — **CONFIRMED**,
  `SPRITE_CONTRACT_2026-09-24.md` §0-A 항목 5(`ASTRA_HANDOFF_2026-09-21.md`
  §0-A 원 사양) "캔버스 크기: 권장 96×128px — `nature/tree.webp`와 동일
  캔버스(검증된 '서 있는' 종횡비)"와 §4.4 "HD(`Poses HD` 192×256)는 값
  ×2"가 일치. 기존 자산 `assetManifest.js:74`의 `nature/tree` 항목도
  `canvas {w:96,h:128}` / `canvas2x {w:192,h:256}`로 동일 규격을 이미
  쓰고 있다.
- 투명 여백 규칙(**CONFIRMED** — lead 결정, 2026-09-24: 개별 파일 8개
  확정, §9): 좌/우/상단에 각각 최소 2px 투명 여백을 둔다. 하단은 여백을
  두지 않는다 — 마지막 행이 곧 발 기준선(foot line, `footAnchorPx.y=128`)
  이다. 개별 파일로 납품하므로(§9) 스프라이트시트 자동 슬라이싱 자체가
  일어나지 않아, 슬라이싱용 패딩(`ASTRA_HANDOFF_2026-09-21.md` §0-A 항목 7,
  `SPRITE_CONTRACT_2026-09-24.md` §4.1)은 더 이상 필요하지 않다 — 위
  2px 여백은 순수 시각적 여유(트리밍 실수 방지)일 뿐이다.
- 실제 잉크 영역 권장 범위 — **PROPOSED**: 96×128 캔버스 기준 세로
  잉크 높이 약 88~96px(캔버스의 약 69~75%), 캔버스 하단(발) 정렬,
  좌우 중앙 정렬. 근거: `SPRITE_CONTRACT_2026-09-24.md` §4.4가 실측한
  Kenney 96×128 프레임의 잉크 y범위(`34–127`, 즉 93px)를 크기 감각의
  참고치로 인용(Kenney 화풍 자체를 채택하는 것은 아님 — §0). 최종
  수치는 실제 커스텀 그림이 그려진 뒤 사람이 확정한다.
- 발이 캔버스 하단에 닿는 규칙: 모든 상태(idle/walk 전 방향/sit)에서
  불투명 픽셀의 최하단 행이 캔버스 마지막 행(1x 기준 y=127, 즉
  `footAnchorPx.y = 128`)과 일치해야 한다 — §4.4의 Kenney 실측이 보여준
  "전 프레임 하단 정렬" 규칙을 그대로 커스텀 캐릭터에도 적용한다
  (CONFIRMED 규칙, 수치 자체는 §4.4 인용).

## 5. 앵커

### 5.1 footAnchorPx

- **PROPOSED 기본값**: `{x: 48, y: 128}` @1x, `{x: 96, y: 256}` @2x —
  모든 walk 프레임(정면/뒷면/측면) 및 idle에 **동일 값**을 쓴다.
- 근거(`SPRITE_CONTRACT_2026-09-24.md` §4.4): "모든 walk 프레임
  `footAnchorPx = {x:48, y:128}`(캔버스 중심 고정 — 발 교대에 따라
  앵커를 흔들면 캐릭터가 좌우로 떨린다)". Kenney 실측에서도 프레임마다
  발 접점 x가 36~58px로 흔들렸지만 앵커는 캔버스 중심(x=48)으로
  고정하도록 권고했다 — 같은 원칙을 커스텀 캐릭터에도 적용해 그림을
  그릴 때 "발이 어디를 밟든 앵커는 캔버스 가로 중심"으로 맞춰 그리는
  것을 전제로 한다(그림 자체가 이 규칙을 지키게 그려야 하며, 그리고
  나서 실측 검증한다 — §7).
- 확정 방법: 그림 완성 후 알파 채널 실측(§4.4가 쓴 방식,
  `scripts/.tmp/measure_alpha_anchors.mjs`, 임계 α>16과 동일 절차를
  커스텀 프레임에도 적용 권장)으로 재검증 후 `{x:48,y:128}`에서 벗어나면
  실측값으로 교체한다.

### 5.2 seatAnchorPx (`sit` 전용)

- **PROPOSED**: 기본값 없음(캐릭터 포즈에 따라 달라 미리 추정하지
  않는다) — 정의: 캐릭터의 엉덩이/좌석 접촉점, 즉 앉은 포즈에서 몸이
  벤치 상판과 맞닿는 것으로 그려진 지점.
- 측정 절차(PROPOSED, §4.4의 foot anchor 알파 실측과 동일 정신을
  hip 접촉점에 맞게 확장): (1) `sit` 프레임에서 엉덩이/허벅지 하단
  윤곽이 수평으로 맞닿는 것으로 그려진 y좌표 구간을 육안으로 특정한다.
  (2) 그 구간에서 불투명 픽셀의 x축 중심을 `seatAnchorPx.x`로 삼는다.
  (3) 그 구간의 y좌표(벤치 상판 접촉선)를 `seatAnchorPx.y`로 삼는다.
  (4) 가능하면 §4.4와 동일한 알파 임계(α>16) 스크립트를 hip 밴드에
  맞게 확장해 재실측·교차검증한다.
- 코드 쪽 소비 지점: `spriteActiveAnchor = isSitting ?
  visual.seatAnchorPx : visual.footAnchorPx`(`ProtoCharacter.jsx:271`)
  — sitting 중에는 이 앵커가 `leftPct/topPct`(벤치 좌석 좌표,
  `benchSeatPoint`)에 정렬된다. `footAnchorPx`와 달리 좌우 흔들림
  문제가 없어(앉은 자세는 1프레임 고정) 캔버스 중심 고정 원칙을
  강제할 필요는 없다.

### 5.3 그림자 기준점

발 앵커(또는 sitting 중엔 좌석 앵커, `benchSeatPoint`)와 **동일**
좌표를 쓴다. 그림자는 오늘 이미 캐릭터 박스의 **형제 엘리먼트**로
분리돼 있어(`ProtoCharacter.jsx:322-344` `data-proto-character-shadow`)
`leftPct`/`topPct`를 캐릭터 박스와 똑같이 그대로 읽는다 — 스프라이트/
이모지 모드와 무관하게 **무변경**(§0 고정 결정과 별개로, 스프라이트
도입 시에도 이 부분은 코드 수정이 필요 없다).

### 5.4 이미지 좌표 ↔ world 좌표 관계

- outer 앵커(`translate(-50%,-100%) scale(s)`, `transform-origin: 50%
  100%`)는 "캐릭터 박스 자신의 (w/2, h)가 (`leftPct`, `topPct`)에
  놓인다"만 보장한다(`ProtoCharacter.jsx` 파일 헤더 증명, §67-85 주석 및
  `:354`).
- anchor-offset 자식 래퍼가 `dx = canvasW/2 − anchor.x`, `dy = canvasH
  − anchor.y`만큼 추가로 이동해, 고정 캔버스의 실제 `footAnchorPx`/
  `seatAnchorPx`가 박스 중심 (w/2, h)와 정확히 일치하지 않는 차이를
  보정한다(`ProtoCharacter.jsx:264-273, 396`). 이 계산이 outer scale
  **안쪽**에서 일어나 depth-scale과 자동 동기화된다.
- **구현 결정(Phase 4, lead 2026-09-24)**: 위 px 기반 anchor-offset
  래퍼(`dx = canvasW/2 − anchor.x`, px 단위)는 프레임이 캔버스 px
  그대로 렌더된다는 전제인데, 실제로는 캐릭터 박스가 `max(8%, 40px)`로
  리사이즈되므로(§5.5) 그 전제가 깨져 박스를 벗어난다. v2 어댑터는
  프레임을 박스 폭의 100%(종횡비 유지)로 렌더하고, 오프셋을 프레임의
  **퍼센트**로 적용한다: `dxPct = (canvas.w/2 − anchor.x)/canvas.w × 100`,
  `dyPct = (canvas.h − anchor.y)/canvas.h × 100` — 해상도에 무관해지고
  depth-scale 안쪽에 그대로 머문다. 매니페스트의 앵커 값은 실제로 어떤
  해상도의 이미지를 배선하든 **항상 1x 캔버스(96×128) px 기준**으로
  기록한다.
- world 좌표계: `WORLD = { w: 100, h: 190 }`(x/y 모두 0~100 스케일이며
  실제 물리 세로:가로 비는 190:100) — **CONFIRMED**,
  `src/utils/town/worldContract.js:24`.
- depth-scale 범위: `[0.55, 1.20]`(y값 구간별 선형 보간) — **CONFIRMED**,
  `src/utils/town/worldContract.js:173-178` `DEPTH_BANDS`(4구간:
  maxY 28/45/66/100, scale [0.55,0.65]→[1.00,1.20]) 및
  `depthScale(y)` 함수(`:192-206`). `ProtoCharacter.jsx`가 실제로
  쓰는 것은 `depthVisual.js`의 `characterScale`/`characterZIndex`
  (이 파일은 `worldContract.depthScale`/`depthOrder.cssZIndex`에
  위임만 하는 얇은 헬퍼, `SPRITE_CONTRACT_2026-09-24.md` §4.3 및
  `ASTRA_HANDOFF_2026-09-21.md` §0.3).

### 5.5 모바일 최소 표시 크기

`CHARACTER_MIN_WIDTH_PX = 40` — **CONFIRMED**, `ProtoCharacter.jsx:133`.
캐릭터 기준 폭은 `max(8%, 40px)`로 CSS 계산되며(`ProtoCharacter.jsx:353`),
이 하한 때문에 §1의 "소형 렌더에서도 식별 가능해야 한다" 요구가
생겼다(390px 이하 뷰포트에서 8%는 30px 미만이라 가독성 문제,
`ProtoCharacter.jsx:127-132` 주석).

## 6. 이미지 생성용 프롬프트 팩

> 규칙: 아래 프롬프트로 생성한 결과는 **승인 전까지 저장소 밖 검토
> 폴더**(예: 세션 스크래치패드, 저장소 밖 `sprite-research/` 유사
> 디렉터리)에만 두고, 사람이 §7 검수표로 승인하기 전에는 `src/assets/`
> 어디에도 커밋하지 않는다.

### 6.1 공통 프롬프트(영문)

```
Paul Town character sprite, elementary-school-age child, gender-neutral,
bright and friendly expression, soft painterly / semi-realistic digital
illustration style matching a warm English-village storybook game,
3/4 front-angled perspective (slightly elevated, not top-down), soft
airbrushed gradient shading, no hard black outlines, no cel-shading,
no flat vector cartoon style, not photorealistic, warm saturated but
soft color palette (muted compared to background scenery), soft diffuse
light source from the upper-left, consistent single character sheet:
same face, same hairstyle, same outfit, same proportions, same lighting
across every frame, transparent background, clean isolated character
with no ground shadow baked in, canvas 96x128px portrait aspect ratio,
character standing/posed with feet aligned to the bottom edge of the
canvas.
```

### 6.2 프레임별 보조 프롬프트(8개)

| 파일 | 보조 프롬프트(영문, 공통 프롬프트 뒤에 이어붙임) |
|---|---|
| `idle-front` | `, facing camera (front view), relaxed standing pose, arms resting at sides, neutral friendly stance` |
| `walk-front-a` | `, facing camera (front view), mid-stride walk cycle pose A, left leg forward, arms in natural counter-swing` |
| `walk-front-b` | `, facing camera (front view), mid-stride walk cycle pose B (opposite leg from pose A), right leg forward, arms in natural counter-swing` |
| `walk-back-a` | `, viewed from directly behind (back view, 3/4 back-angled), mid-stride walk cycle pose A matching the front-view pose A leg timing` |
| `walk-back-b` | `, viewed from directly behind (back view, 3/4 back-angled), mid-stride walk cycle pose B matching the front-view pose B leg timing` |
| `walk-side-a` | `, side view facing right, mid-stride walk cycle pose A, forward leg extended, natural arm swing` |
| `walk-side-b` | `, side view facing right, mid-stride walk cycle pose B (opposite leg from pose A), forward leg extended, natural arm swing` |
| `sit` | `, seated pose on a bench edge, facing camera or slight 3/4 angle, legs bent at the knee, hands resting on lap or knees, relaxed posture, hips/seat clearly contacting a horizontal surface at the bottom of the pose` |

### 6.3 Negative prompt

```
hard outlines, black linework, cel-shading, flat vector art, flat cartoon
style, photorealistic, hyperrealistic skin texture, chibi exaggeration,
adult body proportions, multiple characters, extra limbs, missing limbs,
different face between frames, different hairstyle between frames,
different outfit between frames, different color palette between frames,
harsh directional shadow, cast shadow on ground, background scenery,
text, watermark, logo, weapon, brand reference
```

### 6.4 생성 파라미터 권장(PROPOSED)

- 프레임 간 일관성을 텍스트 프롬프트만으로 담보하기 어려우므로, 가능한
  도구에서는 **캐릭터 레퍼런스 이미지/시드 고정(img2img 또는 캐릭터
  일관성 기능)**을 우선 사용하고, 독립적인 text-to-image 8회 생성보다
  하나의 "캐릭터 시트" 생성 후 크롭하는 방식을 권장한다.
- 해상도: 최소 2x 캔버스(192×256) 이상으로 생성한 뒤 1x(96×128)로
  다운스케일 — §4의 "1x 다운스케일 시 읽히는지만 확인" 관례
  (`FINAL_ARTWORK_SPEC_2026-09-16.md` §1.5와 동일 원칙 계승)와 일치.
- 배경: 생성 도구가 투명 배경을 직접 지원하지 않으면 단색 배경으로
  생성 후 별도 배경 제거 단계를 거친다(§9 `edit/` 단계).
- 이 항목 전체는 **PROPOSED**(도구/예산에 따라 달라짐) — 실제 생성
  담당자가 확정.

## 7. 프레임 간 일관성 검수표

승인 전 8프레임 전체에 대해 체크(어느 하나라도 실패 시 재생성/재수정):

- [ ] 얼굴이 8프레임 모두 동일 인물로 보이는가
- [ ] 헤어스타일이 8프레임 모두 동일한가
- [ ] 의상(색상/디자인)이 8프레임 모두 동일한가
- [ ] 신체 비율(머리:몸:다리)이 8프레임 모두 동일한가
- [ ] 광원 방향(좌상단/정면 확산광)이 8프레임 모두 동일한가
- [ ] 발 위치가 모든 walk/idle 프레임에서 캔버스 하단에 정렬돼 있는가
      (§4 "발이 캔버스 하단에 닿는 규칙")
- [ ] 캔버스 정렬(좌우 중앙, 프레임 간 스케일 동일)이 맞는가
- [ ] 투명 배경인가(베이크된 그림자/배경 잔여물 없음)
- [ ] 굵은 외곽선이 없는가(§1 "하드 아웃라인 금지")
- [ ] 채도가 비교 대상(`nature/tree.webp`, `decorations/bench.webp`,
      `buildings/british-cottage.webp`)보다 튀지 않는가(§1)

## 8. 라이선스·생성 이력 기록 규칙

`src/assets/town/character/` 아래 다음 2개 파일을 **최종본과 함께**
커밋한다(`SPRITE_CONTRACT_2026-09-24.md` §5 항목 3의 요건을 이 문서가
구체화):

- **`LICENSE.txt`**: 사용한 생성 도구/모델의 라이선스 원문(또는
  커미션 작가와의 라이선스 합의문) 그대로 동봉.
- **`NOTICE.md`**: 다음 필드를 표로 기록(PROPOSED 포맷 — 저장소에
  선례 없음, `ASTRA_HANDOFF_2026-09-21.md` §0-A 항목 8의 "라이선스:
  상업적으로 사용 가능해야 하며 출처를 문서화해야 함" 요건을 채우기
  위해 이 문서가 새로 제안):
  - 생성 도구(tool)
  - 모델/버전
  - 생성 날짜
  - 프롬프트 해시(§6 프롬프트의 재현 가능한 다이제스트 — 예:
    SHA-256(프롬프트 전문))
  - 편집 도구(있다면 — 배경 제거/리터칭 등)
  - 최종 승인자
  - 승인일

**반드시 지킬 것**: 저장소의 기존 154개 자산은 전부 출처 UNKNOWN이고
(`SPRITE_CONTRACT_2026-09-24.md` §1 "기존 154개 자산 전부 출처
UNKNOWN"), 이는 이미 진 라이선스 부채로 취급된다 — 캐릭터 자산은 이
부채를 **반복하지 않는다**. `LICENSE.txt`/`NOTICE.md` 없이는 최종본을
커밋하지 않는다.

## 9. 원본/편집본/최종본 구분 규칙

저장소 밖 작업 디렉터리(세션 스크래치패드 등)에서 다음 3단계로 관리하고,
**`final/`만** 저장소에 들어간다:

- **`raw/`**: 생성 도구가 뱉은 원본(전처리/배경 제거 전), 재현을 위해
  보관(저장소 밖).
- **`edit/`**: 배경 제거, 캔버스 크롭(96×128/192×256 맞춤), 색 보정 등
  후처리를 거친 중간본(저장소 밖).
- **`final/`**: §7 검수표를 통과하고 사람이 승인한 것만. 파일당
  4파일 세트(`ASTRA_HANDOFF_2026-09-21.md` §0-A 항목 1의 기존 4파일
  관례 — `<stem>.webp`/`<stem>.png`/`<stem>@2x.webp`/`<stem>@2x.png`)를
  갖춰 `src/assets/town/character/`에 커밋한다.

시트 합본 vs 개별 파일(**CONFIRMED** — lead 결정, 2026-09-24): **개별
파일 8개로 확정, 스프라이트시트를 만들지 않는다.** `SPRITE_CONTRACT_
2026-09-24.md` §4.1의 "시트 1장 권장"(프레임별 `src` 교체가 fps마다
디코드를 유발하는 문제 방지)은 v1 계약 시점의 권고였으나, v2 계약
(`characterSpriteContract.js`, §2.1/§10)은 프레임을 id별로 개별 `src`로
주소화하도록 설계돼 있어 이 우려가 적용되지 않는다 — 8개의 작은 webp는
각각 한 번만 디코드된 뒤 브라우저 캐시에 남고, 대신 시트 슬라이싱/
패딩(§4)의 복잡도가 통째로 사라진다.

## 10. 코드 연결 지점 (요약만)

**v1(변경 없음)**: `src/utils/town/proto2_5d/characterManifest.js`는
이모지 폴백 상수(`EMOJI_GLYPH_BY_STATE`)와 `stateKeyForPhase`를 그대로
유지한다 — v2는 이 공유 상수 하나만 참조하고 나머지는 재구현하지
않는다(§2.1).

**v2(Phase 3~4, CONFIRMED — lead 결정, 2026-09-24)**:

- `src/utils/town/proto2_5d/characterSpriteContract.js` — 순수
  validator/resolver. 의존성은 `./characterManifest.js`(공유 이모지
  glyph 상수) 하나뿐.
- 예시 매니페스트 픽스처: `tests/fixtures/proto2_5d/spriteManifest.example.mjs`
  — **어떤 프로덕션 파일도 import하지 않는다**(테스트 전용).
- 프로덕션 기본 매니페스트(미래, 승인 후에만):
  `src/utils/town/proto2_5d/characterSpriteManifest.default.js`.
- 에셋 레지스트리(미래): `src/assets/town/character/index.js` —
  `SPRITE_CONTRACT_2026-09-24.md` §5 항목 2("`env/index.js` 패턴 복제,
  `src/assets/town/index.js` import 금지").
- 플래그: `paulTown2_5dSprite`(기본 `false`) — **미래 항목, 이번 Phase
  3~4에서는 추가하지 않는다**(lead 결정 2026-09-24: 게이팅할 프로덕션
  매니페스트가 아직 없고, 플래그 등록은 관리자 패널 노출을 동반하므로
  승인된 매니페스트가 생기는 시점에 `SPRITE_CONTRACT_2026-09-24.md`
  §5 항목 1대로 추가). 그 전까지 `Proto25DScreen.jsx`는 선택적
  `spriteManifest` prop만 받고 `App.jsx`는 아무것도 넘기지 않는다
  (기본 렌더 = 이모지).

v2 매니페스트 최소 필드:

| 필드 | 설명 |
|---|---|
| `version` | `2` 고정 |
| `characterId` | 캐릭터 식별자 |
| `license` | `{source, author, licenseName, generatedBy?, approvedBy?, approvedAt?}` |
| `canvas` | `{w, h}`(1x 기준) |
| `pixelRatio` | `1｜2` |
| `frameDurationMs` | walk 프레임 지속시간(§3) |
| `mirrorX` | 미러 적용 규칙(§2.1) |
| `reducedMotion` | `{freezeFrameIndex}`(선택) |
| `frames` | 8개 id 각각에 `{src, src2x?, state, direction, footAnchor{x,y}, seatAnchor{x,y}(sit 전용), inkBounds{x,y,w,h}?}` |

전체 적용 체크리스트(플래그 등록 누락 방지, 번들 예산, 테스트 75개
항목 등)는 `SPRITE_CONTRACT_2026-09-24.md` §5를 그대로 따른다 — 이
문서에서 중복 기술하지 않는다.

## 11. 미확정 항목 목록(PROPOSED 일괄)

| 항목 | 이 문서의 제안값 | 근거/성격 | 누가/언제 확정 |
|---|---|---|---|
| walk 프레임 지속시간(fps) | 6–8fps(125–166ms) | 휴리스틱(§3) | 사람 — 실제 애니메이션 확인 후 |
| 잉크 영역 여백/비율 | 세로 약 88–96px(캔버스의 ~69–75%), 하단 정렬 | Kenney 실측 유추(§4.4 인용) | 사람 — 실제 원화 완성 후 |
| `footAnchorPx` 값 | `{x:48,y:128}`@1x, `×2`@2x | §4.4 권고 재적용 | 사람 — 알파 실측 재검증 후 |
| `seatAnchorPx` 값·측정 절차 | 절차만 제안, 값 없음(§5.2) | 신규 제안 | 사람 — `sit` 원화 완성 후 실측 |
| 생성 파라미터(도구/해상도/시드 전략) | §6.4 권고 | 도구 의존 | 실제 생성 담당자 |
| `NOTICE.md` 필드 포맷 | §8 표 | 신규 제안(저장소 선례 없음) | 사람 — 첫 커밋 시 확정 |

## 12. 변경 이력

- 2026-09-24: 최초 작성. `SPRITE_CONTRACT_2026-09-24.md`(조건 B 판정)
  이후 커스텀 캐릭터 발주를 위한 아트 방향/프레임/앵커/프롬프트 팩
  스펙. 코드/이미지/DB 변경 없음.
- 2026-09-24 lead 검토 — §2.1/§5.4/§9/§10 정정(v2 계약 8프레임 필수,
  퍼센트 앵커 오프셋, 개별 파일 확정), §10 플래그 항목을 미래 항목으로
  명시.
