# Paul Town 2.5D — 캐릭터 스프라이트 계약·후보·적용 체크리스트 (2026-09-24, 확정판)

이 문서는 임시 이모지 캐릭터(🚶/🧘)를 실제 걷기·앉기 스프라이트로 교체하기
위한 **단일 진실 원천**이다. 2026-09-24 세션(PR #62, 시작 HEAD `b932682`)이
읽기 전용 조사 4종(에셋 감사 / 계약 검토 / 테스트 설계 / 통합 리스크)과
리드의 직접 재검증(라이선스 원문·아카이브 해시·프레임 알파 실측)으로
작성했다. **결론: 조건 B — 객관적으로 확정 가능한 에셋 없음, 앱 캐릭터
무변경, "에셋 승인 대기".** 코드 변경 0.

관련 문서: `ASTRA_HANDOFF_2026-09-21.md` §0-A(원 사양)/§0.9(수정 금지
항목)/§0.10(번들 격리 사고), `PROTO25D_NEXT_STEPS_2026-09-23.md` §1,
`ASTRA_ASSET_AUDIT_2026-09-21.md` §5/§13, 부록
`sprite-research/ASSET_CANDIDATES_2026-09-24.md`(에셋 감사 원문),
`sprite-research/TEST_DESIGN_2026-09-24.md`(테스트 설계 원문),
`sprite-research/kenney_malePerson_anchors.json`(알파 실측 원본).

---

## 1. 판정 요약

| 항목 | 결과 |
|---|---|
| 저장소 내 사용 가능한 캐릭터 스프라이트 | **없음**(LICENSE/NOTICE/CREDITS 0건, 캐릭터·걷기·앉기 이미지 0건, 기존 154개 자산 전부 출처 UNKNOWN — 감사 문서 §5/§13과 파일시스템 재확인 일치) |
| 외부 후보(공식 배포처, 최대 3) | Kenney Toon Characters(CC0) / rgsdev Hand-Drawn Square Characters(CC0) / GrafxKid RPG Character Sprites(CC0) |
| idle+walk+sit 3종을 객관적으로 만족하는 후보 | **없음** — Kenney는 sit 부재(duck=쪼그림), rgsdev는 사람 형태 아님(큐브 블롭)+sit 부재, GrafxKid는 포즈 구성 미문서화+픽셀아트 |
| 실제 적용 여부 | **미적용**(조건 B). 앱 소스에 외부 이미지 0장 추가, `src/assets/town/character/` 미생성 |
| 사람이 결정할 것 | §7 참조(3건) |

---

## 2. 후보 비교표(리드 재검증 반영)

| 후보 | 배포처/제작자 | 라이선스 | 시점/화풍 | idle | walk | sit | 캔버스 | @2x | 판정 |
|---|---|---|---|---|---|---|---|---|---|
| **Toon Characters** | kenney.nl / Kenney | CC0(아카이브 내 `License.txt` 동봉) | 3/4 정면 치비 카툰(플랫 벡터). 페이지 태그는 platformer이나 실제 포즈는 정면 idle/8프레임 정면 walk/뒷모습 `back`/옆모습 `side` 포함 | O(`idle`, 정면) | O(`walk0`~`walk7` 정면 8프레임, `run0`~`run2`) — **옆/뒤 걷기 프레임 없음**(`side`/`back` 각 1장 정지) | **X**(`duck`=쪼그림, `down`=넘어짐 — 벤치 착석 아님) | **96×128**(§0-A 권장값과 정확히 일치), 45포즈×6캐릭터 | O(`Poses HD` 192×256) | 라이선스·캔버스·정면 걷기는 충족, **sit 부재 + 옆/뒤 걷기 프레임 부재 + 화풍(플랫 벡터 vs 수채화)** → 객관 확정 불가 |
| Hand-Drawn Square Characters | itch.io / rgsdev | CC0(제작자 페이지 명시) | 완전 top-down, 큐브형 블롭(사람 아님) | O(8방향) | O(8방향) | X | 128×128 | ? | 사람 형태 아님, sit 없음 → 부적합 |
| RPG Character Sprites | opengameart.org / GrafxKid | CC0 | 픽셀아트 | 미문서화 | 미문서화 | 미문서화 | 미기재 | ? | 포즈 구성 확인 불가 → 부적합 |

---

## 3. 라이선스 증거

| 후보 | 원본 URL | 라이선스 원문 URL | 인용(≤15단어) | 다운로드 | SHA-256 |
|---|---|---|---|---|---|
| Kenney Toon Characters v1.0(2019-09-26) | https://kenney.nl/assets/toon-characters (직접 링크 `https://kenney.nl/media/pages/assets/toon-characters/4e8a6e4e53-1774770819/kenney_toon-characters.zip`) | http://creativecommons.org/publicdomain/zero/1.0/ (아카이브 `License.txt` 동일 URL) | "free to use in personal, educational and commercial projects" (License.txt) | 2026-09-24, 5,474,287 bytes | `d4c0eb31f9d9af074315af251a53e8c74925dec84fbd53703c91c9ed4a4cace9` |
| rgsdev Hand-Drawn Square Characters | https://rgsdev.itch.io/hand-drawn-square-characters-animated-8-directions-top-down-free-cc0 | https://creativecommons.org/publicdomain/zero/1.0/ | "The license is CC0, so you can use any way you want, even commercially." | 2026-09-24(zip은 itch 세션 필요로 미수령, 프리뷰 2장만) | preview_1.png `538e60f615d4ab81e27a05d40709e0bb88d773796a912961b8a4f288a5452582` / anim1.gif `6c3c274445606ae85ee66e84e73cc39065671651d1d99f7cc5850d5c832ddd3c` |
| GrafxKid RPG Character Sprites | https://opengameart.org/content/rpg-character-sprites | https://creativecommons.org/publicdomain/zero/1.0/ | "CC0 (Creative Commons Zero) – public domain"(페이지 라이선스 필드) | 미다운로드(포즈 미문서화로 판정 불가) | — |

CC0 원문(creativecommons.org, 리드 직접 확인): "You can copy, modify,
distribute and perform the work, even for commercial purposes, all without
asking permission."

다운로드물은 전부 세션 스크래치(`scratchpad/sprite-research/downloads/`,
저장소 밖)에만 있다. 저장소에는 이 문서와 부록 3개(마크다운/JSON)만 들어간다.

---

## 4. 스프라이트 계약(확정)

### 4.1 상태(states)와 프레임

| state | 프레임 | fps | loop | 앵커 | 미러 |
|---|---|---|---|---|---|
| `idle` | 1 | 무시 | — | `footAnchorPx` 필수 | 미러 레이어 경로 유지(1세트면 사실상 무의미) |
| `walkSide`(=`walk` 별칭, 하위호환) | ≥2 | >0 필수 | 항상 | `footAnchorPx` | **적용** — 오른쪽 기준 1세트, 왼쪽은 기존 facing 레이어 `scaleX(-1)` |
| `walkFront`(신규, 선택) | ≥1 | frames>1이면 >0 | 항상 | `footAnchorPx` | **미적용**(정면은 좌우 대칭 가정) |
| `walkBack`(신규, 선택) | ≥1 | frames>1이면 >0 | 항상 | `footAnchorPx` | **미적용** |
| `sit` | 1 | 무시 | — | `footAnchorPx` + `seatAnchorPx` 필수 | 미러 개념 없음 |

- `leaving`은 전용 아트 없이 walk 계열을 재사용한다(`stateKeyForPhase`
  `walking|leaving→walk`, `characterManifest.js:121-125` 현행 그대로).
- 프레임은 `{x,y,w,h}`(시트 좌표, `sheet.src` 필요) 또는 `{src,w,h}` 중
  하나. **시트 1장 권장**(프레임별 `src` 교체는 fps마다 디코드 발생 —
  통합 리스크 §6). `sheet.srcSet`으로 @2x는 브라우저 DPR 선택, JS 분기 0.
- "프레임은 walking/leaving 중에만 바뀐다"는 idle/sit이 1프레임이라는
  사양으로 **암묵적으로 성립**(`useSpriteFrameIndex`의 `framesLength>1`
  가드, `ProtoCharacter.jsx:177-191`). 별도 phase 화이트리스트 불필요.
- reduced-motion: 이동은 계속(220ms transition), bob/idle 효과 off, 프레임은
  `reducedMotion.freezeFrameIndex`(기본 0) 고정 — 현행 그대로.

### 4.2 방향 판정(신규 순수 함수, 미구현)

`directionForMove(dx, dy)` → `'side'|'front'|'back'`. dx/dy는 `walkLeg`의
이전 좌표→`path[index]` 델타(world-%). `WORLD={w:100,h:190}`
(`worldContract.js:24`)로 정규화: `dxN=dx/100, dyN=dy/190`;
`|dyN|>|dxN|`이면 `dy>0→front`, `dy<0→back`, 아니면 `side`. `dx===dy===0`이면
이전 방향 유지. `stateKeyForPhase(phase, direction)`로 시그니처 확장, direction
생략 시 현행과 100% 동일. `walkFront`/`walkBack`이 매니페스트에 없으면
`walkSide`로 폴백(선택 state이므로 `VALID_MANIFEST` 픽스처가 계속 유효).

**기존 누락(재검증 완료)**: 일반 바닥 보행 `startPlainWalk`
(`Proto25DScreen.jsx:315`)는 오늘 `facing`을 갱신하지 않는다 — 벤치 보행
`startWalkToBench`(`:329-344`)만 `facingToward`로 정한다. 스프라이트 적용 시
같은 함수로 일반 보행에도 facing을 정해야 좌/우 미러가 동작한다(좌표·경로
로직 무변경, facing 값 1개만 추가 갱신).

### 4.3 앵커 매핑(현행 코드 그대로)

- outer 앵커: `translate(-50%,-100%) scale(s)`, transform-origin `50% 100%` —
  박스의 (w/2, h)가 (leftPct, topPct)에 놓인다(`ProtoCharacter.jsx` 헤더 증명).
- anchor-offset 래퍼(자식): `dx = canvasW/2 − anchor.x`, `dy = canvasH −
  anchor.y`, sitting이면 `seatAnchorPx`, 아니면 `footAnchorPx`
  (`ProtoCharacter.jsx:264-273, 396`). outer scale 안쪽이라 depth-scale과
  자동 동기화. facing 레이어의 자식이라 미러 시 부호 반전 코드 불필요.
- **그림자는 이미 depth 박스의 형제**(`ProtoCharacter.jsx:330-344`)로
  `leftPct/topPct`를 직접 따라가며 sitting 중엔 `benchSeatPoint` 좌표를 쓴다 —
  스프라이트/이모지 분기와 무관, **무변경**.
- 스프라이트 모드는 `measureGlyphInk`/`seatSinkLocalPx`/`SEAT_CONTACT_FRACTION`을
  **호출하지 않는다**(현행 분기 그대로). `benchInteraction.js` export 시그니처
  무변경.

### 4.4 Kenney 프레임 알파 실측(리드, `scripts/.tmp/measure_alpha_anchors.mjs`, 임계 α>16)

`Male person/PNG/Poses`, 96×128. 전 프레임 하단 정렬(불투명 최하단 행 = 127,
즉 `footAnchorPx.y = 128`). 지면 접점 x(하단 4행 불투명 픽셀 평균):

| 프레임 | ink x0–x1 | ink y0–y1 | footAnchorPx |
|---|---|---|---|
| idle | 14–81 | 34–127 | (48, 128) |
| back | 14–81 | 34–127 | (48, 128) |
| side | 22–75 | 34–127 | (49, 128) |
| walk0 / walk1 / walk2 / walk3 | 7–81 / 12–76 / 17–75 / 11–75 | 33–127 | (45,127) / (55,128) / (44,128) / (36,128) — 발 교대로 x 흔들림, 잉크 중심 x≈44 |
| walk4 / walk5 / walk6 / walk7 | 7–81 / 11–76 / 17–75 / 11–75 | 35–127 | (58,128) / (54,128) / (49,128) / (37,128) |
| duck(쪼그림) | 15–75 | 50–127 | (42, 128) — sit 대용으로 쓰려면 `seatAnchorPx`는 별도 판단 필요(엉덩이 접점 없음) |

권장 매니페스트 값(채택 시): 모든 walk 프레임 `footAnchorPx = {x:48, y:128}`
(캔버스 중심 고정 — 발 교대에 따라 앵커를 흔들면 캐릭터가 좌우로 떨린다),
idle/back/side 동일. HD(`Poses HD` 192×256)는 값 ×2.

---

## 5. 적용 체크리스트(조건 A로 전환될 때 그대로 실행)

1. **플래그** `paulTown2_5dSprite: false` — `src/config/features.js`
   `DEFAULT_FEATURES` + `getFeaturesByCategory('attachment')` 배열 +
   `FeatureManagementPanel.jsx` `FEATURE_DETAILS` + `testFeatureFlagStore.mjs`
   15번 섹션(14번 `paulTown2_5d`와 동형). 두 곳 누락은 `e728af4`가 고친
   실사고 클래스. 소비는 `Proto25DScreen.jsx`에서 `useSyncExternalStore(
   subscribeFeatures, () => isFeatureEnabled('paulTown2_5dSprite'), () => false)`
   로, ON일 때만 `<ProtoCharacter manifest={...}>`.
2. **레지스트리** `src/assets/town/character/index.js` — `env/index.js`
   패턴 복제, `src/assets/town/index.js` import 금지(§0.10 회귀).
   `Proto25DScreen.jsx`에서만 import.
3. **에셋 파일** `src/assets/town/character/*.webp` + `@2x.webp` (4파일 계약) +
   `src/assets/town/character/LICENSE.txt`(원문 동봉) + `NOTICE.md`(출처 URL·
   제작자·라이선스·다운로드 날짜·아카이브 SHA-256·변환 절차).
4. **매니페스트** `src/utils/town/proto2_5d/characterManifest.default.js`(순수
   데이터) — §4.4 값. `validateCharacterManifest` 통과를 단위 테스트로 고정.
5. **코드** `characterManifest.js`: `frameIndexAt(elapsedMs, fps, framesLength)`
   순수 export(훅은 이를 호출), `directionForMove`, `stateKeyForPhase(phase,
   direction)`, `walkFront/walkBack` 선택 state 검증. `ProtoCharacter.jsx`:
   `data-proto-character-sprite-frame-index` 속성, side일 때만 `scaleX(-1)`.
   `Proto25DScreen.jsx`: 일반 보행 facing 갱신 + direction 계산.
6. **번들 예산** `testBundleBudget.mjs`에 `Proto25DScreen-*.js` gzip ≤ 60KB
   단언 + `character/` 키가 메인/`TownScreen-` 청크에 새지 않는지 §4b 동형
   검사 추가(현재 Proto 청크 8.0KB gzip, 메인 예산 여유 11KB).
   에셋 자체: 시트 ≤60KB @1x, ≤160KB @2x.
7. **테스트** 부록 `TEST_DESIGN_2026-09-24.md` 표 12행(약 75단언 추가):
   `frameIndexAt` 18 / direction 표 12 / idle 정지 4 / walking 프레임 변화 5 /
   미러 6 / reduced-motion 4 / 발앵커·그림자 4뷰포트 16 / 벤치 seat 3 /
   로드 실패 폴백 3 / 플래그 OFF DOM 동일 3 / 플래그 기본값 1. 기존 잉크
   단언 3개는 이모지 모드 조건부로 유지, `testProto25dBench.mjs` "3c" 절 유지.
8. **게이트** 커밋마다: 단위(`testProto25dCharacterManifest/Bench/Depth/
   WalkGrid/SceneFixture`, `testFeatureFlagStore`, `testTownDepthOrder`,
   `testTownV2Static`) → `npm run build` → `testBundleBudget` → 단독 E2E
   러너 → `verify:all`. `.github/workflows/` diff는 항상 비어 있어야 한다.
9. **롤백** 플래그 OFF가 즉시 이모지 경로. 코드 롤백은 `ProtoCharacter.jsx`/
   `characterManifest.js`/레지스트리/매니페스트 4개 파일만.

---

## 6. 통합 리스크(요약)

| 리스크 | 가능성 | 가드 |
|---|---|---|
| 새 플래그를 카테고리/패널에 누락(e728af4 재발) | 중 | `testFeatureFlagStore` 15번 섹션 |
| Proto 청크 무제한 증가(현재 예산 없음) | 높음(수정 전) | §5-6 예산 단언 |
| `character/` 이미지가 메인/V1 청크로 누출 | 낮~중 | §5-6 누출 검사 |
| 프레임별 `src` 교체로 모바일 디코드 지연 | 낮~중 | 시트 1장 강제(§4.1) |
| 학생 데이터/네트워크 접촉 | 매우 낮음(현재 0) | `grep supabase\|fetch(` proto2_5d 0건 유지 |
| 워크플로 파일 접촉 | 매우 낮음 | staged diff 검사 |

Blast radius: `ProtoCharacter/characterManifest/Proto25DScreen`을 참조하는
곳은 `App.jsx:98/1099`뿐. V1/V2/구매/보관함/`useStudent`/`api/**` 참조 0.
CI Release Gate `timeout-minutes: 30`(`.github/workflows/release-gate.yml:75`)은
기록만 — 이 작업은 워크플로 파일을 건드리지 않는다.

---

## 7. 사람이 결정할 항목(최대 3)

1. **Kenney Toon Characters 채택 여부** — 라이선스·캔버스·정면 걷기 사이클은
   객관적으로 충족. 미충족: (a) sit 포즈 없음(`duck` 쪼그림을 임시 sit으로
   허용할지, sit 1프레임을 별도 제작/커미션할지), (b) 옆/뒤 걷기 프레임
   없음(정면 8프레임을 모든 방향에 쓰고 `back` 정지 1장만 뒤로 걸을 때
   쓸지), (c) 플랫 벡터 카툰이 수채화 마을과 어울리는지(순수 미술 판단).
2. **신규 제작 경로** — 기존 자산 톤(3/4 수채화)에 맞춘 idle/walk(8)/sit
   커미션 또는 AI 생성 + 라이선스 문서화. 감사 문서 §14-1이 예견한 방향.
3. **방향 세트 범위** — §0-A 최소(좌/우 미러)로 갈지, walkFront/walkBack까지
   요구할지. Kenney를 쓰면 front가 기본이고 side가 정지 1장이라 §0-A의
   "옆모습 기준 1세트" 전제와 반대다(계약은 두 경우 모두 수용하도록 §4.1에
   선택 state로 정의해 두었다).
