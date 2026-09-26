
# Paul Town 2.5D — 다음 단계 설계 제안 (2026-09-23)

이 문서는 **설계 제안**이다 — 코드 변경 없음, 착수 승인/우선순위 결정
아님. `docs/design/town/ASTRA_HANDOFF_2026-09-21.md` §0(Stage 1~5 구현
현황)/§0-A(캐릭터 에셋 정식 사양)를 전제로 그다음 세 가지 방향(캐릭터
아트 교체/기존 시스템 연결/파일럿 관찰 지표)을 실제 코드(`ASTRA_HANDOFF`
§8·§9·§11·§19, `src/utils/town/placementContract.js`,
`src/utils/town/townCatalog.js`, `tests/e2e/townProto25d.spec.mjs`,
`scripts/testProto25dBench.mjs`, `src/utils/productEvents.js`)를 실제로
읽고 정리했다. 범위 확장 없음(이 프로토타입의 격리 원칙 §12/§19 그대로
유지) — 각 절 끝에 제품 의사결정이 필요한 항목만 "결정 필요(TODO)"로
표시한다.

---

## 0-B. 2026-09-24 갱신 — Phase 6B 어댑터 완료 후 상태

_이 절은 §1(아래 설계 제안)이 실제로 부분 착수된 뒤의 상태 갱신이다 —
§1 원문은 재작성하지 않는다._

- §1.1(매니페스트 형태)의 제안대로 v2 계약 모듈
  `src/utils/town/proto2_5d/characterSpriteContract.js`가 구현됐다
  (`handoff.md` 2026-09-24(175차)). 다만 이 제안 문서가 스케치한
  3-state(idle/walk/sit) 대신, 그 사이 확정된 `docs/design/town/
  PAUL_TOWN_CHARACTER_SPRITE_SPEC_2026-09-24.md` §2.1을 따라
  **5-state**(`idle`/`walkFront`/`walkBack`/`walkSide`/`sit`, 8프레임)로
  구현됐다 — 매니페스트 형태의 정신(§1.1)은 유지하되 세부 shape은 이
  갱신이 우선한다.
- §1.2(앵커 매핑, glyph span 치환)도 그대로 착수됐다 —
  `ProtoCharacter.jsx`에 v2 렌더 분기가 추가됐지만 **휴면**이다(오늘
  어떤 호출부도 `spriteManifest`를 넘기지 않는다, `App.jsx` 무변경).
  §1.4의 "결정 필요" 항목 중 data-attribute 네이밍은 기존
  `data-proto-character-glyph`를 그대로 두고(교체 안 함) 신규
  `data-character-direction` 속성을 추가하는 쪽으로 실제 구현됐다.
- §1.3(레지스트리 격리)은 아직 착수 전이다 — `src/assets/town/
  character/` 디렉터리 자체가 존재하지 않는다(실 이미지 0장, 운영자
  방침: Kenney/GrafxKid/rgsdev 전부 미채택, Paul Town 전용 커스텀
  캐릭터로만 진행, 아직 승인/생성 안 됨).
- `paulTown2_5dSprite` 플래그는 **이번 Phase에서 의도적으로 추가하지
  않았다**(리드 결정) — 게이팅할 프로덕션 매니페스트가 아직 없기
  때문이다. 플래그 추가는 실 이미지 승인 이후로 미뤄졌다(`handoff.md`
  175차 §5).
- §2(구매/보관함 연결)/§3(파일럿 관찰 지표)는 이 세션에서 손대지
  않았다 — 여전히 아래 설계 제안 상태 그대로다.
- 어댑터 SSR 단위 테스트(50단언, `scripts/testProto25dSpriteAdapter.mjs`)와
  E2E S11(+16, `[town-proto2.5d]` 190→206)도 같은 세션 커밋
  `78125bf`로 착륙했다 — 전부 PASS(`handoff.md` 175차 §6).
- 상세: `handoff.md` 2026-09-24(175차), `docs/design/town/
  SPRITE_CONTRACT_2026-09-24.md` §4/§5, `docs/design/town/
  PAUL_TOWN_CHARACTER_SPRITE_SPEC_2026-09-24.md`.

---

## 1. 실제 캐릭터 교체 계획

### 1.1 매니페스트 형태

§0-A가 요구한 "앵커 매니페스트"의 최소 형태 제안 — 스프라이트 시트
1장(또는 상태별 여러 장) + 그 옆의 JSON:

```json
{
  "states": {
    "idle":  { "frames": [{ "x":0,"y":0,"w":96,"h":128 }], "footAnchorPx": {"x":48,"y":126} },
    "walk":  { "frames": [{"x":96,"y":0,"w":96,"h":128}, {"x":192,"y":0,"w":96,"h":128}], "footAnchorPx": {"x":48,"y":126} },
    "sit":   { "frames": [{"x":288,"y":0,"w":96,"h":96}], "footAnchorPx": {"x":48,"y":94}, "seatAnchorPx": {"x":48,"y":70} }
  }
}
```

`footAnchorPx`/`seatAnchorPx`는 프레임 캔버스 기준 px 오프셋(§0-A가
요구한 그대로). `leaving`은 별도 항목 없이 `walk`를 재사용한다(이미
`Proto25DScreen.jsx`의 `walkPath`가 `phaseLabel`만 다르게 받는 구조라
코드 변경 불필요, ASTRA §0.1 참고).

### 1.2 `ProtoCharacter.jsx` 앵커 매핑(재구현 없이 갈아 끼우기)

현재 3-레이어 구조(outer 앵커 → bob div → facing 레이어 → glyph span,
`ProtoCharacter.jsx` 헤더 주석)를 그대로 유지하고 **glyph span 자리에
스프라이트 프레임 `<img>`/`<canvas>`를 얹는 치환**만 한다:

| 현재(이모지) | 교체 후(스프라이트) |
|---|---|
| outer `div`(`translate(-50%,-100%) scale(${scale})`, transform-origin 50% 100%) | **무변경** — foot anchor가 이 앵커에 오도록 프레임 자체를 `footAnchorPx`가 박스 하단-중앙에 오게 잘라 배치(이미지 crop, 코드 변경 없음). |
| inner bob div(`motion-safe:animate-town-walk-bob`/`town-cat-idle`) | **무변경** — 애니메이션 자체는 CSS keyframe, 스프라이트 프레임 교체와 독립. |
| facing 레이어(`scaleX(-1)`, static) | **무변경** — 좌/우 미러링은 이미 이 레이어가 전담(§0-A "좌우 최소 1세트" 요구와 정확히 일치). |
| `data-proto-character-glyph` span + 이모지 텍스트 | **교체 대상** — 매니페스트 프레임을 그리는 `<img>`(스프라이트시트 crop, `object-fit:none; object-position:-Xpx -Ypx`) 또는 개별 프레임 파일로 교체. |
| `measureGlyphInk`(canvas `measureText`로 매 렌더 잉크 경계 실측) | **제거 대상** — `seatAnchorPx`가 고정값이라 런타임 측정이 필요 없어진다(성능/정확도 둘 다 개선, §0-A가 이미 명시한 목표). |
| `seatSinkLocalPx(...)`(benchInteraction.js) | **입력만 교체** — 함수 시그니처(순수 px 계산)는 그대로 두고, 호출부가 `inkTopPx/inkBottomPx`(런타임 측정값) 대신 `seatAnchorPx`에서 유도한 고정 오프셋을 넘긴다. `SEAT_CONTACT_FRACTION` 상수는 이모지 전용 보정이라 스프라이트 도입 시 폐기(매니페스트가 이미 접촉점을 알고 있음). |

### 1.3 지연 로드/번들 예산

신규 캐릭터 registry(`src/assets/town/character/index.js`, §0-A가 이미
`env/index.js` 패턴 재사용을 권장)는 `Proto25DScreen.jsx`(이미
`React.lazy()`로 지연 로드, `App.jsx:98`)에서만 import한다 — **기존
`src/assets/town/index.js`(V1/V2 공용 카탈로그)는 import하지 않는다**.
이는 미관상 선택이 아니라 §0.10이 기록한 실제 회귀(Stage 4가
`Proto25DScreen`에서 기존 town 레지스트리를 import하면서 공유 청크가
생겨 `testBundleBudget.mjs`가 CI에서 깨졌던 사고)를 재발시키지 않기
위한 구조적 요구사항이다 — 캐릭터 registry를 전용으로 격리하면 메인
청크/`TownScreen` 15KB gzip 예산에 영향이 없다.

### 1.4 그린 유지해야 할 테스트 / 스프라이트 인지 갱신이 필요한 테스트

**변경 없이 그린 유지되어야 함(상태 머신/좌표/워크그리드 무변경이므로)**:
- `scripts/testProto25dWalkGrid.mjs`(28단언)/`testProto25dDepth.mjs`
  (23단언) — 전부 좌표/깊이 순수 함수, 캐릭터 아트와 무관.
- `tests/e2e/townProto25d.spec.mjs`의 `data-character-phase` 속성
  기반 단언(S1~S4, S6, S7, S8c, S10 대부분) — 상태 전이 자체를 보므로
  아트와 무관.
- `character.locator('div').first()`로 bob div의 `animationName`을 읽는
  단언(S5, 1280x800/reduced-motion 라인 543/567) — `ProtoCharacter.jsx`
  헤더 주석이 이미 "bob div는 항상 캐릭터의 첫 번째 div로 남는다"는
  계약을 명시했고, §1.2의 치환은 이 계약을 건드리지 않는다.

**스프라이트 인지 갱신이 필요함(현재 이모지 잉크 측정에 의존)**:
- `tests/e2e/townProto25d.spec.mjs`의 `data-proto-character-glyph`
  로케이터 + `measureGlyphInkOnScreen()`(canvas `measureText` 기반, S8
  1504~1528행 부근) — 아래 4개 단언이 전부 이 함수에 의존:
  - `"항목2 — 접촉점(잉크 하단 실측 - SEAT_CONTACT_FRACTION, 앱 공식과
    독립적으로 재측정)과 벤치 실측 좌석선 사이 오차 < 3px"`
  - `"항목2 — 잉크 하단이 좌석선에 닿거나 겹침(빈틈 없음, ... 오차 허용
    1px)"`
  - `"항목2 — 잉크 하단이 벤치 아트 바닥 경계를 넘지 않음(... 오차 허용
    1px)"`
  - (z-index 비교 단언 1개는 아트와 무관 — 그대로 유지 가능)
  스프라이트 도입 시 이 3개는 "잉크 경계 실측"이 아니라 "스프라이트
  프레임의 `seatAnchorPx`가 화면에 투영된 지점이 벤치 좌석선과
  일치하는지"로 다시 짜야 한다(같은 수치 계약 —  < 3px 오차 — 유지
  권장, 측정 방법만 바뀜).
- `scripts/testProto25dBench.mjs`의 "3c. seatSinkLocalPx" 절(라인
  193~304, `glyphBoxHeightPx`/`inkTopPx`/`inkBottomPx`를 입력으로 받는
  전체 단언 — `gap-only`/`contactFraction 생략 시 기본값 적용`/클램프
  4종/`반복 호출이 완전히 동일(결정론)`/방어 가드 2종) — 함수 자체
  (`seatSinkLocalPx`)는 순수 px 계산이라 재구현 없이 유지 가능하지만,
  "글리프 잉크"라는 입력 개념 자체가 스프라이트에는 없다(매니페스트가
  이미 정답을 알고 있음) — 이 절은 §1.2가 제안한 "고정 오프셋 입력"
  시나리오로 값만 바꿔 재검증하거나, 매니페스트 기반 새 헬퍼로 대체 후
  이 절은 이모지 레거시 경로 검증용으로 남길지 여부를 결정해야 한다
  (아래 TODO).

### 1.5 롤백

이 계획은 `ProtoCharacter.jsx` 1개 파일(+ 신규 자산 registry, + 위 두
테스트 파일의 일부 단언)만 건드린다 — `Proto25DScreen.jsx`/
`walkGrid.js`/`pathfinding.js`/`depthVisual.js`/`benchInteraction.js`
(seatSinkLocalPx 함수 시그니처 자체) 무변경이 목표이므로, 문제가 생기면
`ProtoCharacter.jsx`와 신규 자산 registry만 되돌리면 이모지 플레이스홀더
로 즉시 복귀 가능하다.

**결정 필요(TODO)**
- `data-proto-character-glyph` data-attribute 이름 자체를 유지할지
  (스프라이트에도 같은 이름을 재사용해 테스트 셀렉터 변경을 최소화할지,
  아니면 `data-proto-character-sprite`처럼 새 이름으로 바꿔 "이제
  이모지가 아니다"를 명시적으로 드러낼지)는 순수 네이밍 선택이라 이
  문서가 대신 정하지 않는다.
- §1.4의 `testProto25dBench.mjs` "3c. seatSinkLocalPx" 절을 (a) 그대로
  두고 새 스프라이트 전용 절을 추가할지, (b) 완전히 교체할지 — 운영자
  승인 필요(이모지 레거시를 완전히 제거할 것인지 문서화 목적으로
  남길지의 정책 결정).

---

## 2. 기존 구매/보관함/배치 시스템 연결 계획

`ASTRA_HANDOFF_2026-09-21.md` §8(구매→배치 흐름)·§9(저장/복원)·
§11(재사용/수정/교체 분류표)·§19(기존 서버 계약을 깨지 않고 별도
프로토타입 구축하는 방법)를 전제로 한다 — 여기서는 그 내용을 재기술하지
않는다.

### 2.1 무엇을 연결하는가 — 장애물(OBSTACLES)만 실제 배치로부터 파생

현재 `walkGrid.js`의 `OBSTACLES`는 3개 데모 픽스처(`demo-building`/
`demo-bench`/`demo-tree`, walkGrid.js 헤더 주석 — "실 데이터 아님")다.
1단계 연결 제안은 **오직 이 장애물 목록만** 실제 V2 배치 데이터에서
파생시키는 것이다 — 구매/저장은 여전히 손대지 않는다:

1. `src/utils/town/placementContract.js`의 `CELLS`(이미 world-% 좌표로
   변환된 47칸 + `OBJECT_CLASSES` footprint 폭/높이)와, 학생이 실제로
   소유·배치한 아이템 목록(`useStudent.js`의 `rec.townPlacements`,
   §9-6 "복원" 흐름이 이미 만드는 `visiblePlacements`)을 **읽기 전용
   으로** 조합한다.
2. 각 점유 셀에 대해 `placementContract.js`의 내부 함수
   `footprintBox(x, y, objectClass, scale)`(211행, **비export** —
   `collisionsFor`만 export됨)와 `worldRender.js`의 `landmarkBox(id)`
   (124행, export)가 쓰는 "anchor bottom-center, 발자국 아래쪽
   `h*0.45`만 충돌 판정용 박스로 쓴다"는 패턴(`placementContract.js`
   24~29행 주석)을 그대로 따라 `{id, x0, x1, y0, y1}` 형태의 장애물
   사각형을 만든다(`walkGrid.js`의 `OBSTACLES` 항목과 동일한 모양 — 새
   형식 발명 없음). `footprintBox`를 직접 쓰려면 export를 추가해야
   하는데 이는 V2 계약 파일 수정이므로, 1단계에서는 같은 계산을
   `proto2_5d/` 전용 순수 함수로 복제하는 쪽이 격리 원칙(§19)에 맞다
   (결정 필요 항목 참고).
3. 이렇게 파생된 장애물을 `walkGrid.js`의 3개 데모 픽스처에 **추가**
   한다(교체가 아니라 합집합 — 데모 장애물은 회귀 테스트가 이미
   의존하므로 유지).

### 2.2 무엇이 읽기 전용으로 남는가 / 무엇을 절대 건드리면 안 되는가

- **읽기 전용**: 학생의 `shopState.owned`/`visiblePlacements`(이미
  로드돼 있는 데이터를 Proto 2.5D가 구독만 함, 새 fetch 불필요 —
  `useStudent.js`가 이미 앱 최상위에서 로드).
- **절대 건드리면 안 됨**(CLAUDE.md 규칙 3 "완료된 작업 재구현 금지" +
  §19-3 격리 원칙 그대로): `townLayout.js`의 저장 좌표 스키마,
  `placeItem`/`moveItem`/`storeItem`/`mergeTownLayout`, `star_purchases`/
  `student_progress` RLS, `api/grant-xp.js`의 studentId 신뢰 경계,
  `useTownShop.js`의 구매 리듀서. Proto 2.5D는 이 단계에서도 여전히
  **구매/저장 API를 전혀 호출하지 않는다** — 장애물 파생은 이미 클라이언트
  메모리에 있는 데이터를 한 번 더 읽어 walkGrid 형태로 변환하는 순수
  계산일 뿐, 새로운 네트워크 요청이나 쓰기 경로를 만들지 않는다.

### 2.3 단계 순서와 완료 기준

| 단계 | 내용 | 완료 기준 | 가드 테스트 |
|---|---|---|---|
| 2a | §2.1의 파생 함수(순수, `src/utils/town/proto2_5d/`에 신규 파일)를 작성하되 아직 `Proto25DScreen.jsx`에 연결하지 않음 | 순수 단위 테스트로 "빈 배치 → 데모 3종만", "배치 1개 → 데모 3종 + 파생 1종" 등 결정론 검증 | 신규 `testProto25dPlacedObstacles.mjs`(제안) |
| 2b | `Proto25DScreen.jsx`가 파생 장애물을 `walkGrid.js` 데모 장애물에 합쳐 `findPath`/`isWalkableCell`에 넘김 | 실제 배치된 아이템 근처를 탭하면 캐릭터가 그 주위를 우회 | 기존 `testProto25dWalkGrid.mjs`(28단언, 무회귀) + 신규 E2E 시나리오 1개 |
| 2c(이번 범위 밖) | 깊이 순서(§17)에도 실제 배치 아이템을 편입(캐릭터가 실제 나무/벤치 뒤를 지나가게) | — | `testProto25dDepth.mjs`(23단언, 무회귀) |

**결정 필요(TODO)**
- 2a/2b가 "학생이 실제로 소유·배치한 아이템"을 파일럿 학생 82명
  화면에서 그대로 보여줄지(즉 Proto 2.5D 오버레이 바닥에 실제 내 마을
  배치가 비쳐 보이는 것), 아니면 여전히 좌표/장애물 계산에만 쓰고
  시각적으로는 그리지 않을지는 제품(디자인) 결정이다 — §25(핸드오프
  문서) "학생 대상 신규 기능/UI 전면 확장은 이번 프로토타입 범위 밖"
  원칙과 충돌하지 않는 선을 운영자가 그어야 한다.
- 2c(실제 배치 아이템을 깊이 순서에도 편입) 착수 여부/시점.

---

## 3. 82명 파일럿 관찰 지표

### 3.1 기존 이벤트 로거 — 재사용 가능, 단 이미 실제 Supabase 쓰기 경로

`src/utils/productEvents.js`의 `trackEvent(studentId, event)`가 이
저장소의 유일한 클라이언트 이벤트 로거다 — `anon_id =
sha256(studentId).slice(0,16)`(단방향 해시, 이름/원본 id 없음, CLAUDE.md
규칙 4 UUID 기반 식별과 호환)로 `product_events` 테이블에 insert하고,
`productAnalytics` 플래그로 게이팅되며, 실패/테이블 부재/플래그 OFF
전부 조용히 no-op(학습 흐름을 막지 않음). (세션당, 이벤트+로컬 날짜당)
1회로 dedupe.

**단, 이것은 실제 Supabase 쓰기(insert)다** — 지금까지 이 프로토타입
전체의 핵심 안전 속성이 "Production WRITE 0"이었다는 점과 정면으로
부딪힌다. `product_events`는 **새 테이블이 아니고**(이미 다른 기능이
쓰는 기존 테이블), Proto 2.5D가 여기 새 이벤트 **이름**만 몇 개 추가로
insert하는 것이라 "새 테이블/새 쓰기 인프라"는 아니지만, 이 프로토타입
자체의 "쓰기 0" 불변량은 깨진다 — 그래서 아래를 §3의 핵심
결정사항으로 명시한다(TODO).

### 3.2 제안 지표(전부 `trackEvent` 재사용 가정 시)

| 지표 | 수집 방법 | 이벤트(제안) | 이 지표가 답하는 질문 |
|---|---|---|---|
| 오버레이를 연 세션 수 | `Proto25DScreen` 마운트 시 1회 `trackEvent` | `proto25d_overlay_open` | 82명 중 몇 명이 실제로 플래그를 켜고 들어와 보는가(발견성) |
| 탭→걷기 횟수 | `handleGroundPointerUp`의 `startPlainWalk` 진입 시 | `proto25d_tap_walk` | 클릭-투-워크 상호작용을 실제로 쓰는가(1회성 호기심 vs 반복 사용) |
| 벤치 착석 횟수 | `enterSitting` 진입 시 | `proto25d_bench_sit` | 벤치 같은 "목적 있는" 상호작용까지 발견하는가 |
| 오버레이 체류 시간 | 마운트~언마운트 타임스탬프 차(클라이언트 계산 후 1회 전송) | `proto25d_overlay_close`(payload에 durationMs — **주의**: 현재 `trackEvent` 시그니처는 `event` 문자열만 받고 payload가 없다, §3.3 참고) | 얼마나 오래 머무는가(흥미 vs 즉시 이탈) |
| 크래시/콘솔 에러율 | 기존 앱 전역 에러 경계(§ErrorBoundary)와 별개로 Proto 2.5D 스코프의 `window.onerror`/`console.error` 후킹이 없음(§3.3) | (미구현) | 안정성 |
| Android vs iOS 붕 뜸(float) 불만 | 클라이언트 이벤트로 자동 수집 불가(주관적 시각 판단) — 운영자에게 수동 보고받는 것이 유일한 현실적 경로 | (해당 없음, 수동) | §0.13/§0.9의 float 실측치가 실사용자 인지 기준으로도 허용 범위인지 |

### 3.3 최소 read-only 대안 및 이번 phase의 진짜 제약

"읽기 전용"을 문자 그대로 지키려면(네트워크 쓰기 0) 클라이언트가
`localStorage`/메모리 카운터에만 쌓고 **서버로 절대 보내지 않는** 방식
뿐인데, 이러면 운영자가 82명 전체를 한 곳에서 집계할 방법이 없다(기기
1대씩 직접 열어봐야 함 — 파일럿 관찰의 목적 자체를 못 살림). 즉 "여러
학생의 지표를 한 곳에서 관찰"과 "Production WRITE 0"는 구조적으로
양립하지 않는다 — 이 프로토타입이 지금까지 유지해 온 불변량 중 하나를
의도적으로 완화하는 결정이 필요하다.

또한 `trackEvent(studentId, event)` 시그니처는 **payload를 받지
않는다**(이벤트 이름 문자열 1개뿐, `productEvents.js:29`) — "체류
시간"처럼 숫자 값이 필요한 지표는 지금 이 함수로 표현할 수 없다(이벤트
이름을 버킷화해서 나눠 보내는 우회는 가능하지만 새로운 설계다). 크래시/
콘솔 에러율도 이 저장소에 기존 클라이언트 에러 수집기가 없어(grep
결과 0건) 신규로 만들어야 한다.

**결정 필요(TODO)**
- (핵심) `product_events`/`trackEvent` 재사용을 승인할지 — 승인 시
  Proto 2.5D는 "Production WRITE 0" 문구를 "구매/저장 API 호출 0"으로
  좁혀 재정의해야 한다(§0.8/§19-3의 기존 문구를 수정 없이 새 문서로
  명확화만 할지, 기존 문구 자체를 손볼지도 함께 결정 필요). 비승인 시
  82명 규모 파일럿 관찰은 이번 phase에서는 사실상 불가능(운영자 수동
  샘플링만 가능).
- 승인된다면 payload 없는 이벤트 이름 버킷팅(예: `proto25d_overlay_close_short
  /_medium/_long`)으로 체류시간을 근사할지, 아니면 `trackEvent`
  시그니처 자체에 선택적 payload를 추가할지(기존 다른 기능이 쓰는
  공용 함수라 시그니처 변경은 영향 범위가 이 프로토타입보다 넓다 —
  신중한 별도 검토 필요).
- 크래시/콘솔 에러율 수집기 신규 제작 여부(현재 없음) — 만든다면
  Proto 2.5D 전용으로 격리할지, 앱 전역에 재사용 가능하게 만들지도
  결정 필요.
- Android/iOS float 불만은 자동 수집 불가로 확인됨 — 운영자가 수동
  보고 채널(예: 아침 점검 체크리스트, `ASTRA_HANDOFF` §0.14)을 계속
  1차 소스로 쓸지 확정 필요.

## 0-C. 2026-09-26 갱신 — 산책 모드 v1(월드 확장 + 카메라) 구현·검증 완료(미커밋)

`src/utils/town/proto2_5d/camera.js` + `Proto25DScreen.jsx` 뷰포트 래퍼/토글(`paulEasyVoca_proto25dWalkMode`, 기본 ON)/rAF lerp 카메라, E2E S17. 월드 = `min(vw, vh/1.9)×1.6`의 100:190 상자, 카메라는 월드 경계 clamp(월드가 좁은 축은 중앙 정렬). 기존 이동·충돌·벤치·depth·O2 무변경. 결정 기록 ADR 0010, 상세 `handoff.md` 182차. §2(구매/보관함/배치 연결)와 §3(파일럿 지표)는 여전히 미착수. 후속 후보(운영자 결정): 월드 가장자리 시각 단서, 데스크톱 월드 폭, rAF 캐릭터 ref 캐시.
