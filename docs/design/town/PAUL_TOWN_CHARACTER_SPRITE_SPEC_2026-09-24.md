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

**177차(Phase 6C) 갱신 — 위 표는 작성 당시 기록 보존을 위해 고치지
않고, 실측 결과만 이 노트로 남긴다(§14 참고):** `walk 프레임 지속시간
(fps)` → `frameDurationMs 150`으로 CONFIRMED(§3 제안 범위 125–166ms
안쪽, lead 실장 결정). `footAnchorPx` 값 → `{x:48,y:128}`@1x 그대로
CONFIRMED(모든 프레임 실측 일치, 흔들림 없음). `seatAnchorPx` 값·측정
절차 → `{x:48,y:85}`(잉크 높이의 65%)로 실측 CONFIRMED, 단 좌석 접촉이
자연스러운지는 스크린샷만으로 판단했고 실제 벤치 렌더 재확인이
남아있다(§14 "알려진 한계"). `NOTICE.md` 필드 포맷 → §14 설치
과정에서 실제로 채워져 CONFIRMED. `잉크 영역 여백/비율`과 `생성
파라미터(도구/해상도/시드 전략)`는 여전히 미확정이다 — 실제 생성은
운영자가 ChatGPT로 직접 진행했고 §6.4의 권고(레퍼런스 고정/시드 전략)
대신 육안 판정으로 8프레임을 골랐다(§14).

## 12. 변경 이력

- 2026-09-24: 최초 작성. `SPRITE_CONTRACT_2026-09-24.md`(조건 B 판정)
  이후 커스텀 캐릭터 발주를 위한 아트 방향/프레임/앵커/프롬프트 팩
  스펙. 코드/이미지/DB 변경 없음.
- 2026-09-24 lead 검토 — §2.1/§5.4/§9/§10 정정(v2 계약 8프레임 필수,
  퍼센트 앵커 오프셋, 개별 파일 확정), §10 플래그 항목을 미래 항목으로
  명시.
- 2026-09-24 176차 — §13 추가(최종 Paul 캐릭터 파일명·경로 대응, 운영자
  지시로 ChatGPT 제작 확정). 이미지 0장 상태에서 경로/매핑/ingest
  스크립트/135단언 테스트를 준비해 합성·구조 검사로 검증 완료(§13.7),
  버그 1건 발견·수정(`buildPaulSpriteManifest(null)` throw).
- 2026-09-24 177차(Phase 6C) — §14 추가(실장 기록): 운영자가 ChatGPT로
  생성한 8프레임 PNG를 정규화·설치하고 `paulTown2_5d` 플래그 단독
  게이트로 `Proto25DScreen.jsx` 기본 매니페스트에 배선. §11 일부
  PROPOSED 항목을 CONFIRMED로 전환하는 노트 추가(표는 무변경).
- 2026-09-25 178차 — §15 추가(walk-side-b v2 교체 기록): 운영자가
  새로 전달한 측면 걷기 렌더 2장 중 1장을 구도(art/composition) 판단
  으로 미채택하고 `walk-side-a`를 유지, 나머지 1장을 신규
  `walk-side-b`로 채택. `walk-side-a` 등 나머지 7프레임과 계약
  (§0~§13)은 무변경 — 파일명 매핑 1개만 교체. **정정**: 최초 보고의
  "클리핑(잘림)" 판정 근거는 PIL `Image.getbbox()`를 RGBA에 그대로
  적용해 alpha=0 픽셀까지 잉크로 잡은 결과였다 — alpha>16 잉크 bbox
  기준으로는 실제로 잘리지 않았다(§15.1 정정 참고). 같은 세션에서 E2E가
  관측한 "긴 LEFT 걷기에서 idle 직전 미러 순간 해제" 현상을
  재조사했으나 **제품 버그가 아니라 테스트 샘플러의 측정 아티팩트**로
  판명됐다(§15.3-1 정정) — E2E 샘플러를 atomic `page.evaluate` 스냅샷
  방식으로 교체 중이며, 조사 중 발견한 `Proto25DScreen.jsx`의
  `FACING_MIN_DX_PCT` 임계값은 관측된 결함에 대한 수정이 아니라
  예방적 가드(하드닝)로 유지한다(§15.3-1).

## 13. 최종 Paul 캐릭터 파일명·경로 대응 (2026-09-24 추가)

> 운영자 지시(고정): 최종 8프레임은 ChatGPT로 제작한다. 아래는 §0~§12의
> 계약(8프레임 필수, state 키, 앵커, 개별 파일 8개 원칙)을 그대로 둔
> 채, 실제로 도착할 파일의 **이름·경로·검사 절차**만 확정한 것이다.
> 이 절 작성 시점에도 이미지는 **0장**이며, 이 절 자체가 이미지를
> 생성·채택하는 근거가 되지 않는다(§0 원칙 불변).

### 13.1 캐릭터 비주얼 스펙(아트 브리프 원본, art brief of record)

- Paul 얼굴과 파란 눈.
- 약간 통통한 상체와 배.
- 얇은 다리.
- 금색 Paul 문장이 있는 짙은 남색 실크해트.
- 네이비 몽클레어 반팔 티셔츠와 반바지.
- 검정·회색 Air Max 95.
- 투명 배경 PNG.
- 모든 프레임에서 동일한 크기·발 접지선·중심축 유지(§4/§5의 캔버스·
  앵커 규칙을 그대로 따른다는 뜻 — 이 항목이 §4/§5를 대체하지 않는다).

### 13.2 드롭 폴더

`src/assets/town/character/`(`SPRITE_CONTRACT_2026-09-24.md` §5 항목 2
근거). 176차 세션에서 이 폴더와 `README.md`가 생성됐다 — 이미지는
여전히 0장이다(BLOCKED_BY_ASSET, §13.6).

### 13.3 프레임 id ↔ 파일명 ↔ state ↔ 방향 ↔ 미러 대응표

frame id는 §2 표와 **완전히 동일**(v2 계약에서 변경 없음). 아래는 실제
도착할 파일명만 새로 고정한다.

| frame id(§2) | 파일명 | state(§2.1) | 방향 | 미러 |
|---|---|---|---|---|
| `idle-front` | `paul-idle-front.png` | `idle` | 정면 | 없음 |
| `walk-front-a` | `paul-walk-front-a.png` | `walkFront` | 정면 | 없음 |
| `walk-front-b` | `paul-walk-front-b.png` | `walkFront` | 정면 | 없음 |
| `walk-back-a` | `paul-walk-back-a.png` | `walkBack` | 뒷모습 | 없음 |
| `walk-back-b` | `paul-walk-back-b.png` | `walkBack` | 뒷모습 | 없음 |
| `walk-side-a` | `paul-walk-side-a.png` | `walkSide` | 측면(오른쪽 향함으로 그림) | facing이 left일 때만 `scaleX(-1)`(§2.1) |
| `walk-side-b` | `paul-walk-side-b.png` | `walkSide` | 측면(오른쪽 향함으로 그림) | facing이 left일 때만 `scaleX(-1)`(§2.1) |
| `sit` | `paul-sit.png` | `sit` | 정면(또는 3/4) | 없음 |

### 13.4 도착 후 단일 명령과 검사 항목

1. `node scripts/spriteIngestPaul.mjs --check`(읽기 전용, 아무것도 쓰지
   않음): 프레임 누락 / PNG 디코딩 가능 여부 / 실제 알파 채널(투명
   배경) 존재 / 8프레임 동일 캔버스 크기 / 발 접지선 정렬(§4) /
   중심축(앵커) 정합(§5) / 모바일 최소 렌더 크기(§5.5,
   `CHARACTER_MIN_WIDTH_PX=40px`)에서 식별 가능 여부 / 걷기·앉기 state
   연결(§2.1 매핑) 검사.
2. `node scripts/spriteIngestPaul.mjs --write`(검사 통과 후에만):
   `src/assets/town/character/index.js` 레지스트리와
   `paul-sprite-measured.json`(실측 앵커)을 쓴다. `LICENSE.txt`/
   `NOTICE.md`(§8)는 쓰지 않고, `Proto25DScreen.jsx`/`App.jsx` 배선도
   건드리지 않는다 — 둘 다 사람이 하는 남은 단계(§13.6).

### 13.5 관련 신규 모듈(순수 함수, 이미지 0장 상태에서도 동작)

`src/utils/town/proto2_5d/paulSpriteManifest.js`(176차 세션에서 실제
생성 확인) — `PAUL_SPRITE_FILES`(§13.3 매핑 상수),
`PAUL_SPRITE_DEFAULTS`(PROPOSED: 캔버스 96×128, `footAnchorPx
{x:48,y:128}`, `seatAnchorPx {x:48,y:96}`, `frameDurationMs 150` —
§4/§5/§3의 PROPOSED 값과 정합), 및 `buildPaulSpriteManifest(sources…)`/
`paulSpriteBlockers` 헬퍼. 이미지 import가 전혀 없는 순수 모듈이라
이미지가 없어도 빌드와 이모지 폴백에 영향을 주지 않는다(§13.7로
검증됨). 176차 세션 중 `buildPaulSpriteManifest(null)`이 throw하는
버그를 발견·수정했다(구조 분해 기본값은 `undefined`만 커버, `null`은
커버하지 않음 — `isPlainObject` 가드 추가, `null`/`'x'`/`[]`/`42`/
`undefined` 5종 입력에 대해 never-throw를 테스트로 단언).

`scripts/spriteIngestPaul.mjs`(176차 세션에서 실제 생성 확인) — 순수
검사 함수 9개(§13.4의 프레임 누락/디코딩/알파/캔버스/발 접지선/앵커/
모바일 크기/state 연결 각 항목에 대응) + CLI `--check`/`--write`
진입점.

### 13.6 BLOCKED_BY_ASSET 항목(PNG 8장 도착 전까지 진행 불가)

- §13.4의 `--check` 중 실제 이미지가 있어야만 판정 가능한 8개 항목
  (§13.7의 "BLOCKED_BY_ASSET 8건" — 파일 존재/경로 등 구조 검사 11개는
  이미지 없이도 이미 PASS).
- `src/assets/town/character/index.js` 레지스트리 생성(`--write`).
- `paul-sprite-measured.json`(실측 앵커) 생성.
- 실제 브라우저 렌더 확인(모바일 최소 크기 포함).
- `LICENSE.txt`/`NOTICE.md`(§8) 작성 — 이미지 출처가 있어야 채울 수
  있음.
- `characterSpriteManifest.default.js`(§10) 생성 — 실측 앵커 확정 후.
- `paulTown2_5dSprite` 플래그 추가(§10 — 승인된 프로덕션 매니페스트가
  생기는 시점).
- `Proto25DScreen.jsx`에서 매니페스트를 실제로 넘기는 배선(플래그 ON
  시에만).

### 13.7 검증 결과(176차, 이미지 0장 상태의 합성/구조 검사)

| 항목 | 결과 |
|---|---|
| `testPaulSpriteIngest`(신규, 135단언) | 135/135 PASS — 인메모리 합성 PNG만 사용, 디스크에 아무것도 쓰지 않음 |
| `testProto25dSpriteContract` | 172/172 PASS |
| `testProto25dSpriteAdapter` | 50/50 PASS |
| `testProto25dCharacterManifest` | 72/72 PASS |
| E2E `[town-proto2.5d]` | 206/206 PASS, 0 FAIL, 0 SKIP(standalone 러너, vite preview 대상, 2026-09-24 20:2x KST) |
| `npm run build` | PASS |
| `node scripts/spriteIngestPaul.mjs --check` | BLOCKED_BY_ASSET 8건 / 구조 검사(h) 11 PASS / exit 1(이미지 부재 상태에서 예상된 결과) |

## 14. 실장 기록 (2026-09-24, Phase 6C)

> §13이 준비한 경로/파일명/manifest 대응과 ingest 스크립트를 실제
> 운영자 제공 PNG로 채운 기록. §0~§13의 계약(8프레임 필수, state 키,
> 앵커 정의, 개별 파일 8개 원칙)은 그대로다 — 이 절은 그 계약을
> **실제 이미지로 실장**한 사실만 기록한다.

### 14.1 원본 수령·매핑 판정

운영자가 ChatGPT로 생성한 PNG 11장을 2026-09-24 약 20:23 KST에
전달했다(1024×1536, RGBA, 투명 배경). 그중 2장이 바이트 단위 중복이라
실제로는 9장 unique. lead가 다리 스트라이드 쌍을 기준으로 육안 판정해
8프레임에 매핑했다(§6.4의 "레퍼런스/시드 고정" 권고 대신 사후 육안
선별 방식 채택 — §11 177차 노트 참고):

| frame id | 원본 파일명(ChatGPT 타임스탬프) |
|---|---|
| `idle-front` | `ChatGPT Image Sep 24, 2026, 08_23_24 PM.png` |
| `walk-front-a` | `08_23_31` |
| `walk-front-b` | `08_23_28` |
| `walk-back-a` | `08_23_43` |
| `walk-back-b` | `08_23_35` |
| `walk-side-a` | `08_25_58`(오른쪽을 바라봄, §2 규칙과 일치) |
| `walk-side-b` | `08_23_39` |
| `sit` | `08_25_51` |

여분 1장(`08_23_20`)은 `walk-front-a`와 동일한 스트라이드라 미사용.
원본 파일은 저장소 밖(세션 스크래치패드 `ingest/raw/` +
`PROVENANCE.json`)에 보관하고, 원본별 SHA-256을
`src/assets/town/character/NOTICE.md`에 기록했다(§8 요건 충족).

### 14.2 정규화(저장소 밖 스크립트, PIL, 리페인트 없음)

- 균일 스케일 `0.08384`(= `124/1479`, `sit`를 제외한 프레임 중 가장
  키가 큰 잉크 높이 기준), 원본에서 LANCZOS 리샘플.
- 출력: 96×128 @1x + 192×256 @2x(§4 CONFIRMED 캔버스와 일치).
- 발 접지선: 모든 프레임에서 불투명 픽셀 최하단 행이 1x 기준 y=127에
  정렬(§4 규칙 그대로 적용).
- 좌우 중앙 정렬: 잉크 bbox 기준 x=48 ±0.5px.
- `sit`: 동일 스케일, 발이 바닥선에 오도록 정렬.
- 리페인트(그림을 다시 그리거나 손보는 작업)는 하지 않았다 — 순수
  스케일·크롭·정렬만.

### 14.3 검사 결과

§7 일관성 검수표 + §13.4 `--check` 항목(a–h) 전부 PASS: 저장소 밖
스크래치 검사 125/125, 저장소 안 `node scripts/spriteIngestPaul.mjs
--check` PASS 68 / FAIL 0 / BLOCKED 0(§13.6의 BLOCKED_BY_ASSET 8건이
전부 해소됨).

### 14.4 설치된 파일

`src/assets/town/character/`에 다음을 설치했다:

- `paul-<frame-id>.png` + `paul-<frame-id>@2x.png` × 8프레임(총 16
  파일, 약 404KB).
- `index.js` — `--write`가 생성한 레지스트리(`PAUL_SPRITE_SOURCES`/
  `PAUL_SPRITE_SOURCES_2X`/`PAUL_SPRITE_MEASURED` export, §10
  "`env/index.js` 패턴 복제" 요건 충족).
- `paul-sprite-measured.json` — 실측 앵커.
- `LICENSE.txt`/`NOTICE.md` — §8 요건대로 채워짐(생성 도구/모델/날짜/
  원본 SHA-256/편집 절차/승인자 필드).

### 14.5 앵커·타이밍 실측값(CONFIRMED, §11 177차 노트와 동일 값)

- `footAnchor`: 모든 프레임 `{x:48, y:128}`@1x(캔버스 중심 고정, §5.1
  원칙과 일치 — 실측에서도 흔들림 없이 일치).
- `seatAnchor`(`sit` 전용): `{x:48, y:85}`@1x(잉크 높이의 65% 지점에서
  실측). 좌석 접촉이 벤치 렌더에서 자연스러운지는 아직 스크린샷만으로
  판단했다 — §14.7 한계 참고.
- `frameDurationMs`: `150`(§3 제안 범위 125–166ms 안쪽, 한 이동 구간
  650ms 동안 약 4회 프레임 교대).

### 14.6 코드 연결·게이트

- 신규: `src/utils/town/proto2_5d/characterSpriteManifest.default.js`
  — `buildPaulSpriteManifest`(신규 선택 인자 `sources2x` 추가)로
  `PAUL_SPRITE_MANIFEST`를 만든다.
- `Proto25DScreen.jsx`: `spriteManifest` prop 기본값이
  `PAUL_SPRITE_MANIFEST`로 바뀌었다(1줄 변경 + 헤더 주석 갱신).
- **신규 플래그를 추가하지 않았다** — 게이트는 기존
  `paulTown2_5d`(기본 `false`) 하나뿐이다(lead 결정, 운영자가 "우선
  `paulTown2_5d` 하나로 검증"을 요청). §10이 미래 항목으로 남긴
  `paulTown2_5dSprite`(`SPRITE_CONTRACT_2026-09-24.md` §5-1)는 이번
  Phase에서도 추가하지 않았다.
- 이모지는 런타임 폴백으로 그대로 남는다(무효 매니페스트 또는 이미지
  로드 실패 시).
- 번들 청크 격리 확인: `paul-` 문자열이 `Proto25DScreen-*.js` 청크
  (raw 31.1kB / gzip 11.2kB)에만 존재하고, 메인 `index` 청크와
  `TownScreen` 청크에는 없다(§5.5/§5-6 "번들 예산" 요건과 정합 —
  이모지 전용 화면에는 스프라이트 자산이 섞이지 않는다).

### 14.7 알려진 한계

- `sit` 좌석 접촉이 자연스러운지는 스크린샷으로만 판단했다 — 실제
  벤치 렌더에서 사람 재확인 필요.
- 스프라이트 모드에서 다리별(per-leg) facing 미세 조정은 하지 않았다.
- 프레임 교대가 실제 이동 거리(stride length)에 동기화되지 않는다 —
  `frameDurationMs` 고정 간격일 뿐.
- `@3x`는 제공되지 않는다 — DPR 3 기기는 `@2x`를 업스케일한다.
- 자산이 지연 로드 청크에 약 404KB를 추가한다(DPR당 1x 또는 2x 세트
  8파일만 실제로 받아간다).
- 이모지 폴백 경로는 여전히 존재한다(무효 매니페스트/로드 실패 시).

### 14.8 Preview 정책

Vercel Preview(브랜치 alias
`https://voca-git-feat-paul-town-v2-clean-pr-jina4926952s-projects.vercel.app`)는
SSO 차단 없이 렌더되지만, 2.5D 화면은 학생 로그인 이후에만 마운트되고
로그인은 Production PIN API(WRITE)를 호출한다. 따라서 "Production
WRITE 0" 원칙에 따라 실제 시각 검증(데스크톱/모바일)은 동일 빌드를
로컬에서 네트워크 mock으로(Playwright, 360/390/412/1280) 수행하고,
Preview는 로그인 없이(배포가 살아있는지, Proto 청크와 `paul-*` 자산이
서빙되는지만) 확인한다. 173차 §8 선례와 동일한 방식이다. 운영자가
WRITE를 감수하면 실제 기기에서 로그인 후 확인할 수 있다.

### 14.9 제약 확인

`paulTownV1`/`paulTownV2`/`paulTown2_5d` 플래그 전부 `false` 유지, V1/V2
전용 파일 무변경, depth/shadow/pathfinding/bench 코드 무변경,
`.github/workflows/` 무변경, PR #62 OPEN/Draft 유지. 준비 스캐폴딩은
176차에서 이미 커밋 `212538d1`로 분리 커밋됐고, 이번 자산·배선 변경은
별도 커밋 1개로 예정돼 있다(이 문서 작성 시점 기준 아직 미커밋).

### 14.10 검증 결과(2026-09-24 21:47–22:27 KST, 워크트리 `wt-clean-pr`, lead 실행)

| 항목 | 결과 |
|---|---|
| `testPaulSpriteAssets`(신규) | 112/112 PASS |
| `testPaulSpriteIngest` §5–6(이미지 존재 케이스로 조정, 132단언) | 132/132 PASS |
| `testProto25dSpriteAdapter` / `testProto25dSpriteContract` /
  `testProto25dCharacterManifest`(175차 스위트 회귀 재확인) | 50/50, 172/172, 72/72 전부 PASS |
| `testTownEnvAssets`(회귀 재확인) | 196/196 PASS(최초 실행 실패 → 수정 후 PASS, 아래 참고) |
| `testBundleBudget` §4c(신규: 스프라이트 16파일 인벤토리 + 누출
  가드) | 32/32 PASS — main/V1/V2 청크 누출 0, `Proto25DScreen` 청크
  gzip 11.3KB ≤ 60KB 예산 |
| E2E S8/S9/S11(스프라이트 모드로 조정) | 포함 통과 |
| E2E S12(신규, 360/390/412/1280 뷰포트: 스프라이트 로드/크기 밴드/
  클리핑 없음/프레임 교대/그림자/검은 배경 없음/UI 탭이 캐릭터를
  움직이지 않음) | 포함 통과 |
| E2E S13(신규, reduced-motion 정지) | 포함 통과 |
| `tests/e2e/townProto25d.spec.mjs` standalone(vite preview) | 270/270 PASS |
| `node scripts/spriteIngestPaul.mjs --check` | PASS=68 FAIL=0 BLOCKED_BY_ASSET=0 |
| `npm run build` | PASS, 경고 0 |
| `npm run verify:all` | "ALL DOMAINS: PASS", 141 스위트 PASS / 0 FAIL, 약 27분 |
| `npm run verify:e2e` | 1598 PASS / 0 FAIL / 0 SKIP, 미mock 요청 0 |
| 로컬 뷰포트 스크린샷(360/390/412/1280, 12장) | lead 리뷰 완료 — 스프라이트
  정상 렌더, 클리핑/검은 배경 없음, 프레임 교대·방향·착석·그림자·
  reduced-motion·UI 탭 무이동 전부 확인(§14.4 자산 참고) |
| Vercel Preview 확인(로그인 없이) | **완료.** 커밋 `8be6ba99`
  (2026-09-24 22:30 KST) push, GitHub 배포 `6638989777` → success.
  Preview URL
  `https://voca-rs10ezhb4-jina4926952s-projects.vercel.app`(브랜치
  alias `https://voca-git-feat-paul-town-v2-clean-pr-jina4926952s-projects.vercel.app`).
  로그인 없이 GET만(Production WRITE 0): 로그인 화면 렌더, 메인 청크
  스프라이트 참조 0, `Proto25DScreen-*.js` 청크에만 `paul-*` 포함,
  `/assets/paul-*.png` 16개 전부 200 `image/png`, `paulEasyVoca_features`
  localStorage 부재(플래그 기본값 유지). 2.5D 화면 자체는 학생 로그인이
  필요해(Production PIN API WRITE) 열지 않았고, 시각 검증은 위 로컬
  mock 스크린샷이 대신한다. |

1차 전체 체인 실행에서 실제 버그 3건이 드러났고 전부 수정 후
재실행으로 확인됐다:

1. `testTownEnvAssets` — §14의 신규 주석 3곳에 리터럴 문자열
   `"assets/town/env"`가 그대로 들어가 매니처 검사에 걸림 → 문구
   변경으로 수정.
2. `testBundleBudget` §4 — 신규 PNG 16장이 "예기치 않은 파일"로
   판정됨 → §4c 인벤토리 항목 + 누출 가드로 등록.
3. E2E S12 `[412x915]` — `naturalWidth` 1회성 읽기가 전체 러너 안에서
   간헐적으로 flaky → 최대 5초 폴링으로 수정.

상세 배경은 `handoff.md` 2026-09-24(177차) §7,
`TESTING.md`의 177차 "관련 항목" 절 참고.

`tests/harness/registry.mjs`에 `testPaulSpriteIngest` 1줄 등록됨.
자세한 세션 로그는 `handoff.md` 176차 §5 참고.
- `paulTown2_5dSprite` 플래그 추가(§10 — 승인된 프로덕션 매니페스트가
  생기는 시점).
- `Proto25DScreen.jsx`에서 매니페스트를 실제로 넘기는 배선(플래그 ON
  시에만).

## 15. walk-side-b v2 교체 기록 (2026-09-25)

> §14가 실장한 8프레임 중 `walk-side-b` 한 프레임만 새 렌더로 교체한
> 기록. §0~§14의 계약(8프레임 필수, state 키, 앵커 정의, 개별 파일 8개
> 원칙, `walk-side-a`/기타 7프레임)은 전부 그대로다 — 이 절은 프레임
> 1개의 원본 교체·재정규화·매핑 변경만 기록한다.

### 15.1 운영자 원본 판정

운영자가 2026-09-25 새로운 측면(side) 걷기 렌더 2장을 전달했다(둘 다
1024×1536 RGBA, §2 방향 규칙대로 오른쪽을 바라봄).

> **정정(2026-09-25, lead)**: 최초 보고는 `12_54_37 AM (1)`을 "좌측·
> 하단 잘림(클리핑)"으로 기록했으나, 이는 PIL `Image.getbbox()`를
> RGBA에 그대로 적용해 alpha=0(완전 투명) 픽셀까지 잉크로 잡은
> 결과였다. alpha>16 기준 잉크 bbox로 재측정하면 (1)은
> (80,18)–(1004,1431)로 좌/우/하단 여백이 각각 80/20/105px 확보돼
> **클리핑이 아니다**. 운영자가 `walk-side-a`를 유지하고 (2)를
> `walk-side-b-v2`로 채택, (1)을 미사용으로 둔 결정 자체는 구도(art/
> composition) 판단으로 그대로 유효하며 (1)은 계속 저장소 밖에
> 남는다. (2)의 alpha>16 잉크 bbox도 (151,17)–(901,1463)이 맞는
> 값이다(이전 (65,14)–(1000,1472)는 동일하게 non-alpha `getbbox()`로
> 잰 잘못된 값). sha256 `23c4a79f…`가 (2)의 식별 키다.

| 원본 파일명(타임스탬프) | 판정 | 사유 |
|---|---|---|
| `12_54_37 AM (1)` | **REJECTED**(구도 판단) — 미사용 | alpha>16 잉크 bbox (80,18)–(1004,1431), 여백 좌80/우20/하105px — 클리핑 아님(위 정정 참고) |
| `12_54_38 AM (2)` | **ACCEPTED** — 신규 `walk-side-b` | alpha>16 잉크 bbox (151,17)–(901,1463), 한쪽 발 지지 + 반대쪽 다리를 뒤로 굽혀 든 중간 스트라이드 자세. sha256 `23c4a79fe28a2030081f13192d74e1c2bf8fad5bfb595a5ebebe82ccca67ad60`(식별 키) |

**페어링**: 기존 `walk-side-a`(§14.1의 `08_25_58`, 넓은 스트라이드,
무변경) ↔ 신규 채택본(b-v2). 새로 전달된 두 장끼리를 짝짓는 것이
아니다.

### 15.2 정규화

§14.2와 동일한 규칙 재적용(리페인트 없음): 동일 고정 스케일
`0.08384`, LANCZOS 리샘플, 출력 96×128 @1x + 192×256 @2x, 발 접지선
불투명 픽셀 최하단 행이 1x 기준 y=127, 좌우 중심 잉크 bbox 기준
x=48 ±0.5px. 잉크 높이 약 122px로 기존 `walk-side-a`(약 121px)와
거의 동일해 프레임 교대 시 크기 점프가 없다.

### 15.3 설치 파일·매핑

- 신규: `src/assets/town/character/paul-walk-side-b-v2.png` +
  `paul-walk-side-b-v2@2x.png`.
- 레거시: `paul-walk-side-b.png` + `@2x.png`는 디스크에 **보존**하되
  레지스트리에서 더 이상 import되지 않아 빌드 산출물(dist)에는
  포함되지 않는다.
- 코드 변경 범위는 `PAUL_SPRITE_FILES['walk-side-b']` 매핑 값을
  `'paul-walk-side-b-v2.png'`로 바꾸는 것뿐이다. frame id
  `walk-side-b`(§2/§13.3), `state: walkSide`, 앵커
  (`footAnchor {x:48,y:128}`@1x), `frameDurationMs 150`, 미러 규칙
  (facing=left일 때만 동일 페어에 `scaleX(-1)`) 전부 무변경.

### 15.3-1 Proto25DScreen.jsx 예방적 facing 가드(2026-09-25, 관측된 결함 아님)

이 절의 walk-side-b v2 교체와는 별개다. E2E 검증 중 관측된 현상을
재조사한 결과 제품 버그가 아니라 테스트 측정 아티팩트로 판명됐고,
조사 과정에서 발견한 잠재 위험에 대비해 예방적 가드만 추가했다.

- **초기 관측(정정됨)**: 여러 leg로 이어지는 긴 LEFT(왼쪽) 걷기
  경로에서, idle로 전환되기 직전 약 100ms 동안 미러
  (`data-proto-character-sprite-mirror` 속성/`scaleX(-1)`)가
  무미러(오른쪽 방향)로 순간 되돌아가는 것처럼 관측됐다.
- **재조사 결과(정정, lead)**: 이는 **제품 버그가 아니라 테스트 측정
  아티팩트**였다. `findPath`로 확인한 (90,20)→(20,20) 경로는 dx=−70,
  dy=0인 `side` 방향 **단일 leg**이며 도중에 방향이 바뀌지 않는다.
  실제 원인은 E2E 샘플러가 phase/mirror/facing 값을 서로 다른
  Playwright 호출로 순차적으로 읽었고, 두 호출 사이에 걷기가 끝나
  idle로 전환되면서 값이 어긋난 레이스였다.
- **테스트 수정**: `tests/e2e/townProto25d.spec.mjs`의 S12 샘플러를
  phase/mirror/facing을 한 번에 캡처하는 단일 atomic `page.evaluate`
  스냅샷 방식으로 교체 중이다(샘플 간 레이스 제거).
- **예방적 가드로 유지(제품 코드, 관측된 결함에 대한 수정이 아님)**:
  재조사 과정에서, `walkLeg`가 leg마다 그 leg 자신의 `dx`만으로
  facing을 재계산하는 기존 로직이 실제 path-snap 시나리오에서는
  위험할 수 있음을 별도로 확인했다 — 예: (65,62)→(20,62) 경로의
  마지막 leg는 dx=0, dy=−3.8(순수 수직, `walkBack`)인데, 이런 leg에서
  facing을 재계산하면 방향이 잘못 뒤집힐 수 있다. 이를 막기 위해
  `src/components/town/proto2_5d/Proto25DScreen.jsx` 1개 파일에 신규
  상수 `FACING_MIN_DX_PCT = 1.0`(world-% 단위)을 예방적으로(하드닝)
  도입했다 — 스프라이트 모드에서, leg의 이동 방향이 `side`이고
  `|dx| ≥ 1.0`인 **진짜 수평 leg**에서만 facing을 갱신하고, 수직/미세
  leg는 이전 facing을 그대로 유지한다. `walkLeg` 본 루프와
  reduced-motion 점프 경로 양쪽에 동일하게 적용했다.
- **범위**: `walk-side-a`/`walk-side-b`(v2 포함) 모두에 적용되는
  facing 계산 로직 하드닝이며, §15.3의 파일명 매핑 교체와는
  독립적이다. pathfinding 로직, 벤치 착석 방향(`facingToward`),
  depth, shadow, 캐릭터 렌더 크기는 이번 변경 범위 밖(§15.4 참고).

### 15.4 무변경 확인

정면/후면 걷기(`walk-front-*`/`walk-back-*`), `sit`, 벤치,
pathfinding, depth/shadow, 캐릭터 렌더 크기, `paulTownV1`/
`paulTownV2`/`paulTown2_5d` 플래그(전부 `false`), PR #62 OPEN/Draft
상태 전부 이번 변경 범위 밖. (예외: §15.3-1의 예방적 facing 가드
자체는 `Proto25DScreen.jsx` 1개 파일에서 하드닝됐다 — 관측된 결함에
대한 수정은 아니며, 벤치/pathfinding/depth/shadow/크기는 그 가드에도
영향받지 않는다.)

### 15.5 테스트 갱신

`scripts/testPaulSpriteAssets.mjs`/`scripts/testPaulSpriteIngest.mjs`/
`scripts/testBundleBudget.mjs`를 v2 파일명 기준 검사 + 레거시 파일
보존(디스크에는 존재하되 레지스트리/dist 미포함) 케이스로 조정.
`tests/e2e/townProto25d.spec.mjs` S12를 확장해 좌/우 측면 걷기에서
frame id **와** `src` 파일명(basename)이 a ↔ b-v2로 정확히 교대하는지,
렌더 크기와 발 접지선이 흔들리지 않는지를 검사. §15.3-1의 재조사에
맞춰 S12 샘플러를 phase/mirror/facing을 한 번에 캡처하는 atomic
`page.evaluate` 스냅샷 방식으로 교체 중이다(샘플 간 레이스로 인한
오탐 FAIL 제거 — LEFT 걷기 단언 자체를 강화한 것이 아니라 측정
방식을 고친 것). 동 S12의 발 접지선 검사에는 기존부터 있던 walk-bob
CSS 애니메이션(크기에 비례해 진폭 증가)을 반영한 허용 오차(키의 8%
또는 최소 4.5px 중 큰 값)를 추가했다. 동 파일 S13에 측면 걷기 프레임
정지(reduced-motion) 케이스를 추가.

### 15.6 Preview 정책

§14.8/177차 §6과 동일 — Vercel Preview는 로그인 없이(배포 생존 + 자산
서빙 여부만) 확인하고, 실제 시각 검증은 Production PIN API를 호출하지
않는 로컬 Playwright + 네트워크 mock으로 수행한다(Production WRITE 0
원칙).

### 15.7 검증 결과(2026-09-25 01:55–02:42 KST, 워크트리 `wt-clean-pr`, lead 실행)

| 항목 | 결과 |
|---|---|
| `scripts/testPaulSpriteAssets.mjs`(조정) | 125/125 PASS |
| `scripts/testPaulSpriteIngest.mjs`(조정) | 132/132 PASS |
| `scripts/testBundleBudget.mjs`(조정) | 32/32 PASS |
| `scripts/testProto25dSpriteAdapter.mjs`/`testProto25dSpriteContract.mjs`(회귀 재확인) | 50/50, 172/172 전부 PASS |
| `scripts/testTownEnvAssets.mjs`(회귀 재확인) | 196/196 PASS |
| `node scripts/spriteIngestPaul.mjs --check` | PASS=68 FAIL=0 BLOCKED_BY_ASSET=0 |
| `tests/e2e/townProto25d.spec.mjs` S12(확장, §15.3-1 atomic 샘플러 교체 포함) | 좌/우 걷기 frame id/`src` 파일명이 `walk-side-a` ↔ `paul-walk-side-b-v2`로 교대, LEFT 걷기 모든 샘플에서 미러 `'1'`, 크기/발선이 bob 허용 오차 안에서 안정, 4뷰포트. 포함 통과 |
| `tests/e2e/townProto25d.spec.mjs` S13(확장) | `walk-side-a` 기준 측면 걷기 reduced-motion 프레임 정지. 포함 통과 |
| `tests/e2e/townProto25d.spec.mjs` standalone(vite preview) | S12/S13 포함 327/327 PASS |
| `npm run build` | PASS, 경고 0 |
| `npm run verify:all` | "ALL DOMAINS: PASS", 141 스위트 PASS / 0 FAIL, 약 32분 |
| `npm run verify:e2e` | 1655 PASS / 0 FAIL / 0 SKIP, 미mock 요청 0 |
| 로컬 뷰포트 스크린샷(lead 리뷰 완료) | `preview-local/side-{360x640,390x844,412x915,1280x800}-{a,b}.png` — a/b-v2 프레임 동일 크기·발 접지선, 검은 배경/클리핑 없음 |
| Vercel Preview 확인(로그인 없이) | push 후 확인(로그인 없음) — 이 절 작성 시점 기준 아직 push 전. push 후 Preview GET-only 확인 → PR #62 코멘트, 운영자 실기기 확인은 선택 |

상세 배경은 `handoff.md` 2026-09-25(178차) §7,
`TESTING.md`의 178차 "관련 항목" 절 참고.
