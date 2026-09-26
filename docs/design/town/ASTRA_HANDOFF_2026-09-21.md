# Paul Town V2 — Astra 2.5D 프로토타입 핸드오프 (2026-09-21)

이 문서는 PR #62(`feat/paul-town-v2-clean-pr`)의 4라운드 구현(그라운디드
2.5D 아이템 depth → 자석 드래그 배치 → 2.5D/ambient 폴리시 → 벤치 앉기
상호작용)을 감사(audit)하고, 다음 에이전트("Astra")가 맡을 **완전히 새로운
2.5D 캐릭터 프로토타입** 착수를 위해 작성됐다. 문서 작성 자체는 순수
조사·기록 작업이며, 이 세션은 제품 코드/테스트/애니메이션을 전혀 수정하지
않았다(아래 "검증한 것" 절 참고). `docs/design/town/`의 기존 핸드오프 문서
명명 관례(`*_HANDOFF_2026-MM-DD.md`)를 그대로 따랐다.

---

## 0. 2026-09-23 갱신 — Stage 1~5 완료 현황과 인수인계 (최신, 이 섹션이 아래 §20/§23/§24를 대체)

이 섹션은 2026-09-22~23 사이 별도 세션(들)이 §20(Phase 0~4 계획)을 그대로
따라 Stage 1~5를 전부 구현·경화한 결과를 기록한다(이 갱신 자체는
docs-maintainer 세션의 문서 작업이며, 코드는 건드리지 않았다). §1~§19
(현재 상태 조사/재사용 분류/설계 노트)는 여전히 유효한 배경이라
재기술하지 않고 필요할 때만 참조한다. §20(단계별 계획)/§23(첫 세션 읽기
순서)/§24(첫 작업 범위)는 이미 완료됐으므로 이 섹션이 그 실행 결과로
대체한다 — 원 섹션은 삭제하지 않고 그대로 둔다(append-only, CLAUDE.md
규칙 13).

### 0.1 구현 완료 기능(Stage별, 커밋 순서)

- **Stage 1**(`5779d0d`) — 자체 플래그 `paulTown2_5d`(기본 false) +
  `Proto25DScreen.jsx` 골격 + 클릭/탭-투-무브(순간이동 없이 점진적 전이).
  `App.jsx`가 lazy-load로만 마운트(§10 원칙 그대로 적용).
- **Stage 1 후속**(`e728af4`) — 관리자 기능 패널 카테고리 배열
  (`features.js` `attachment` 카테고리)에 `paulTown2_5d` 누락 수정 — 토글이
  관리자 화면에 안 보이던 사고 수정, `DEFAULT_FEATURES` 자체는 Stage
  1부터 이미 올바름.
- **Stage 2**(`a3dcbb1`) — `src/utils/town/proto2_5d/walkGrid.js`(40×76
  격자, `OBSTACLES` 3종 데모 픽스처, `nearestWalkablePoint`) +
  `pathfinding.js`(8방향 BFS + 코너 컷팅 금지 + string-pulling 경로
  단순화). 장애물 회피 획득.
- **Stage 3**(`dcdb180`) — `src/utils/town/proto2_5d/depthVisual.js`.
  `depthOrder.js`에 `character` 레이어 1개 추가(순수 additive,
  `character: 6004`, `depthOrder.js:107`) + `Y_RANKED_LAYERS`에 편입
  (`depthOrder.js:119`) — 캐릭터/장애물이 y좌표 기준으로 서로 가리고
  가려짐. 새 스케일/깊이 공식 발명 없이 기존
  `worldContract.depthScale`/`depthOrder.depthKey`/`cssZIndex`에 위임만
  함(CLAUDE.md 규칙 3).
- **Stage 4**(`8132dd1`) — `src/utils/town/proto2_5d/benchInteraction.js`
  + `Proto25DScreen.jsx`의 idle→walking→sitting→leaving 상태 머신(§0.4
  참고). 벤치 1개(`demo-bench`)에 걸어가 앉았다 일어나는 상호작용.
- **모바일 시각 보정**(`544fd35`) — 정보 배지 44px 미만, 그림자가
  depth-scale에 눌려 거의 안 보임, 벤치 아트/캐릭터 기준폭 px 하한 부재,
  `?proto25dDebug=1` 쿼리로만 장애물 디버그 박스 표시(기본 숨김, 실기기
  프리뷰에서 벤치 실제 아트와 겹쳐 상호작용을 가리는 회귀 보고) 등 실기기
  프리뷰 실측 회귀 수정.
- **좌석 sink 보정**(`cf18f5f`) — 이모지 글리프 잉크 경계(canvas
  `measureText`)를 실측해 앉은 캐릭터가 좌석 위에 "붕 뜬" 것처럼 보이던
  회귀 수정(`benchInteraction.js`의 `seatSinkLocalPx`/
  `SEAT_CONTACT_FRACTION`).
- **Stage 5 하드닝 + 회귀 테스트**(`d2bfb30`) — §0.5 참고.
- **CI 수정**(`435d6b1`) — `scripts/testBundleBudget.mjs`의 메인 청크
  판별을 `dist/index.html`의 실제 `<script type="module">` 참조 기반으로
  변경(§0.10/`TESTING.md` 신규 절 참고) — Proto 2.5D 코드 자체의 변경이
  아니라 그 코드가 새 공유 청크를 만들어 드러난 기존 테스트의
  순서-의존 버그 수정.

### 0.2 파일 지도

```
src/components/town/proto2_5d/Proto25DScreen.jsx  — 씬 컨테이너, 상태 머신 소유(포인터 핸들러/타이머)
src/components/town/proto2_5d/ProtoCharacter.jsx  — 순수 프레젠테이션(이모지 플레이스홀더 🚶/🧘, scale/z-index/그림자/좌석 sink 렌더)
src/utils/town/proto2_5d/walkGrid.js              — 격자/장애물/걷기 가능 판정(순수)
src/utils/town/proto2_5d/pathfinding.js           — BFS + string-pulling 경로탐색(순수)
src/utils/town/proto2_5d/depthVisual.js           — Y-기반 스케일/z-index(worldContract/depthOrder에 위임, 순수)
src/utils/town/proto2_5d/benchInteraction.js       — 벤치 도착/좌석 지점, 탭 hit-test, 좌석 sink 계산(순수, 의존성 0)
src/utils/town/depthOrder.js                      — 'character' 레이어 1줄 추가(depthOrder.js:107, 순수 additive)
src/config/features.js                            — paulTown2_5d 플래그 정의(:113) + attachment 카테고리 등록(:370)
src/App.jsx                                       — Proto25DScreen lazy mount(:98, 게이팅 :279-282, 마운트 :1097-1101)
scripts/testProto25dWalkGrid.mjs                  — walkGrid/pathfinding 단위 테스트(esbuild 번들, 28단언)
scripts/testProto25dDepth.mjs                     — depthVisual 단위 테스트(esbuild 번들, 23단언)
scripts/testProto25dBench.mjs                     — benchInteraction 단위 테스트(plain node, 88단언)
tests/e2e/townProto25d.spec.mjs                   — S1~S8c, S10 브라우저 E2E(160 PASS, §0.6 참고)
```

### 0.3 좌표/워크그리드/경로탐색/깊이 구조

- 좌표계는 §18 원칙(0~100 world-% + 실측 렌더 박스로 px 환산)을 그대로
  따르되, `walkGrid.js`가 2026-09-23 Stage 5 감사로 정정한 사실 1개를 새로
  남긴다: `proto25d-ground`는 `fixed inset-0 flex-col`의 유일한 `flex-1`
  자식이라 실제로는 뷰포트를 그대로 채우고, CSS `aspectRatio:
  WORLD.w/WORLD.h`는 두 축이 이미 다른 이유로 확정돼 있어 실효가 없다 —
  x-%/y-%의 실제 화면 px 비율은 뷰포트마다 다르다(데스크톱 실측 ≈1.6,
  모바일 실측 ≈0.45). 걷기/경로탐색 로직 자체(순수 world-% 연산)는 이
  사실과 무관하게 정확하지만, 벤치 렌더 크기·좌석 지점처럼 "실제 화면
  px"가 필요한 계산(`benchInteraction.js`)은 고정 비율을 가정하지 않고
  매 호출마다 `groundRef.getBoundingClientRect()`로 실측한 값을 받는다.
- 격자: `GRID_COLS=40`, `GRID_ROWS=76`(`40 × WORLD.h/WORLD.w` 반올림),
  `[WORLD_MIN,WORLD_MAX]=[2,98]`에 정확히 앵커링(여백 밖 사각지대 방지,
  `walkGrid.js` 헤더 주석). `OBSTACLES` 3종(`demo-building`/`demo-bench`/
  `demo-tree`)은 실 데이터가 아니라 이 프로토타입 전용 데모 픽스처
  (`worldContract.js`의 `LANDMARKS`를 라이브 import하지 않음, 스케일
  감각만 참고).
- 경로탐색: 8방향 BFS(코너 컷팅 금지) + 그리디 string-pulling 단순화
  (장애물 없는 구간은 항상 단일 웨이포인트로 수렴). 결정론적
  (Math.random/타이밍 의존 없음).
- 깊이: `depthVisual.js`가 `worldContract.depthScale`/
  `depthOrder.depthKey`/`cssZIndex`에 위임만 하는 얇은 헬퍼. 장애물은
  `objects` 레이어(바운딩 박스 하단 y1을 depth y로 사용), 캐릭터는 신규
  `character` 레이어(고정 id `proto-character`, 항상 1명이라 안정적
  tie-break으로 충분).

### 0.4 상태 머신·타이머 정리

`Proto25DScreen.jsx`가 idle/walking/sitting/leaving 4단계 상태 머신을
소유한다(`TownScene.jsx`의 벤치 앉기 파일럿과 동일 *패턴*만 재사용,
import는 하지 않음 — 격리 유지). 핵심 관례:
- **seq 가드**(`seqRef`) — 사용자가 새 명령(탭)을 낼 때마다 증가하는
  단조 카운터. 모든 예약된 `setTimeout` 콜백은 실행 시점에 자기 seq가
  최신인지 먼저 확인하고, 아니면 조용히 무시한다(스테일 타이머가 최신
  상태를 덮어쓰는 사고 방지).
- **characterRef** — `character` state와 항상 함께 갱신되는 ref.
  `setTimeout` 콜백은 클로저로 붙잡은 오래된 `character` 대신
  `characterRef.current`(최신값)를 읽는다.
- **타이머는 항상 최대 1개**: `walkTimerRef`(걷기 구간 전이) /
  `holdTimerRef`(Stage 4, 착석 유지) 두 ref로 분리 소유, 매 재지정 시
  `clearWalkTimer`/`clearHoldTimer`로 이전 타이머를 먼저 정리.
- **phaseLabel 버그(실측 FAIL로 발견·수정)** — `enterLeaving`이
  `phase:'leaving'`을 먼저 set한 뒤 같은 동기 스택에서 곧바로 걷기
  함수를 부르면 React 18 자동 배칭으로 `'leaving'`이 화면에 한 프레임도
  그려지지 못하고 `'walking'`으로 덮인다(S8/S8b가 이 문제를 FAIL로
  재현, CLAUDE.md 규칙 15 그대로 적용). 수정: `walkLeg`/`walkPath`가
  `phaseLabel` 인자를 받아 그대로 써서 배칭이 일어나도 최종 커밋값
  자체가 의도한 phase가 되도록 함.
- **언마운트 정리** — `walkTimerRef`/`holdTimerRef` 둘 다 언마운트 시
  `clearTimeout`(setState-after-unmount 방지). S10이 sitting 단계
  (holdTimerRef 예약 중)에 관리자 패널 실시간 플래그 토글로 즉시
  언마운트시켜 이 정리가 실제로 동작하는지, 남은 타이머가 발화해도
  setState 경고가 없는지, 재진입 시 idle로 깨끗이 재마운트되는지까지
  검증한다(§0.5).
- **포인터 캡처 정리** — `pointerDownRef`를 `pointercancel`뿐 아니라
  `lostpointercapture`에서도 정리(Stage 5 감사 추가,
  `handleGroundLostPointerCapture`) — 브라우저가 down/up 없이 캡처를
  스스로 회수하는 드문 경로에서도 stale 좌표가 남지 않게 함.

### 0.5 Stage 5 하드닝(`d2bfb30`)이 고친 것

실측으로 확인한 결함 4건:
1. 정보 배지(ⓘ) 탭 타겟이 WCAG 2.5.5/iOS HIG 44px 하한 미달(실측 ~24px)
   → `min-h-[44px]` 추가.
2. `enterLeaving`의 병적 "도달 불가" 분기가 `phase:'leaving'`/`'idle'`을
   별도 setState 두 번으로 나눠 호출 → §0.4의 phaseLabel 버그와 동일
   클래스(도달 시나리오 자체가 현재 OBSTACLES로는 실행되지 않아 이 특정
   분기는 스스로 재현·검증은 못 했지만, 미래 혼동 방지로 단일 호출로
   정리).
3. `onLostPointerCapture` 미처리(§0.4 참고).
4. `walkGrid.js`의 낡은 "정사각 셀" 주석 정정(§0.3의 종횡비 실효성
   정정과 같은 발견).

E2E에 +15 단언 추가(160 PASS): 고정 오버레이(Vercel 툴바류) 클릭이
캐릭터를 움직이지 않음, 배지 ≥44px, sitting/leaving 중 그림자 존재,
S10 상호작용 도중 언마운트(§0.4 참고, setState-after-unmount 없음/
타이머발 재마운트 없음/idle로 깨끗한 재마운트).

### 0.6 테스트 결과

| 스위트 | 결과 |
|---|---|
| `node scripts/testProto25dWalkGrid.mjs` | 28/28 PASS |
| `node scripts/testProto25dDepth.mjs` | 23/23 PASS |
| `node scripts/testProto25dBench.mjs` | 88/88 PASS |
| `node scripts/testTownV2Static.mjs`(회귀, V2 무변경 확인용) | 147/147 PASS, 0 SKIP |
| `node scripts/testTownDepthOrder.mjs`(character 레이어 additive 확인) | 73/73 PASS |
| `node scripts/testTownWorldContract.mjs` | 96/96 PASS |
| `tests/e2e/townProto25d.spec.mjs`(독립 러너, S1~S8c+S10) | 160 PASS / 0 FAIL / 0 SKIP, unmockedRequests 0건, mockErrors 0건 |
| `node scripts/testBundleBudget.mjs`(CI 수정 후) | 24/24 PASS(readdir 순서를 뒤집은 재현 케이스도 24/24) |
| `npm run build` | exit 0 |
| `npm run verify:all` / `npm run verify:e2e` | 실행 중, 결과는 PR #62 코멘트 참조 |

### 0.7 플래그 사용법

- 관리자 패널 → "🎯 기능" → "애착 시스템 (Attachment & Growth)" 카테고리
  → `paulTown2_5d` 체크박스(id `#paulTown2_5d`)로 기기 로컬 토글.
  `paulTownV1`/`paulTownV2`/파일럿 허용목록과 완전히 독립(§19-2 원칙
  그대로 적용, `App.jsx:279-282`).
- 학생 화면 내비게이션 진입점 없음 — 플래그 ON이면 기존 `screen` 상태와
  무관하게 항상 최상위 오버레이(`fixed inset-0 z-[9999]`)로 뜬다
  (`App.jsx:1097-1101`).
- 장애물 디버그 오버레이(점선 상자 + id 라벨)는 기본 숨김 — URL 쿼리
  `?proto25dDebug=1`로만 켠다(localStorage 아님, `Proto25DScreen.jsx`
  헤더 주석 — 세션 넘어 남는 사고 방지).

### 0.8 Preview / Production 영향

- Vercel Preview:
  `https://voca-git-feat-paul-town-v2-clean-pr-jina4926952s-projects.vercel.app`
  (해당 Preview의 관리자 패널에서 플래그를 켜야 보임).
- Production DB WRITE: 0건(Supabase 쓰기 없음 — 이 프로토타입은 구매/저장
  API를 전혀 호출하지 않는다, §19-3 원칙 그대로). E2E는 `installMocks`로
  전체 네트워크를 가로챈다.
- PR #62: OPEN / DRAFT. 이번 세션도 머지/undraft/배포를 하지 않았다.
- 플래그: `paulTownV2:false`, `paulTown2_5d:false`(둘 다 기본값 유지,
  `features.js:112-113`).

### 0.9 알려진 한계(수정 금지 — 실제 스프라이트로 해결할 항목)

- 캐릭터는 이모지 플레이스홀더(🚶 걷기/서기, 🧘 앉기)다 — §0-A가 실제
  아트 사양을 정의한다.
- Android에서 앉은 이모지가 벤치 위에 살짝 떠 보이는 잔여 오차가 있을 수
  있다 — §0.1의 좌석 sink 보정(`cf18f5f`)으로 대부분 해소됐지만, 완전한
  발/엉덩이 앵커가 없는 이모지 특성상 남은 오차의 추가 미세조정은
  **금지**한다(실제 스프라이트 도입으로 해결할 것 — 이모지 보정을 더
  정교하게 다듬는 시간 낭비 방지).
- 바닥 컨테이너는 뷰포트를 그대로 채우는 `flex-1` 자식이라 CSS
  `aspectRatio`가 실효가 없다(§0.3) — 버그가 아니라 실측 기하를 그대로
  쓰는 설계이므로 "고정"하려 하지 말 것.
- 구매/저장/인벤토리 연결 없음(§19-3 그대로), Stage 6 없음(이번 범위
  밖).

### 0.10 CI 이슈 현황

- `scripts/testBundleBudget.mjs`(rewardSystem 도메인, gating) — Proto
  2.5D Stage 4(`8132dd1`)가 `Proto25DScreen`(지연 로드)도 기존 town 자산
  레지스트리(`src/assets/town/index.js`)를 import하게 되면서 그 모듈이
  2개 이상의 lazy chunk + 메인 엔트리에 공유돼 Rollup이 별도 청크로
  분리, 그 청크 이름이 실제 엔트리와 동일한 `index-<hash>.js` 패턴과
  우연히 충돌 → `readdirSync` 열거 순서에 의존해 Linux CI에서만 잘못된
  청크를 "메인"으로 오판(Windows 로컬은 순서상 우연히 통과). `435d6b1`
  에서 `dist/index.html`의 실제 `<script type="module">` 참조로 메인
  청크를 판별하도록 수정(파일명 패턴 매칭에서 실제 엔트리 참조 파싱으로
  전환) — 예산 수치/다른 단언은 무변경, 24/24 PASS로 회귀 확인(순서를
  뒤집은 재현 케이스도 동일하게 PASS). 상세: `TESTING.md` 신규 절.
- `tests/e2e/townV2.spec.mjs`의 S9("배치 앵커 탭 가능성", **Proto 2.5D가
  아니라 기존 V2 자석 드래그 배치 기능의 테스트**) — CI(Linux Chromium)
  1회 FAIL(run 35567109630, 커밋 `1945eb5`, 앵커 bbox ~43.3~43.4px vs
  자체 허용치 ≥43.5px), 이후 재현 안 됨(최신 실행 clean PASS). `e2e`
  도메인은 `extra:true`(non-gating)라 Release Gate를 막지 않는다. 근본
  원인 미확정 — 씬 입장 줌 애니메이션 가설은 로컬 재현으로 반증됨(측정
  시점에 이미 `transform:none`, 애니메이션 종료 후). Linux Chromium
  환경이 없어 추가 조사 불가, 재발 시를 위한 조사 결과만 문서화
  (`TESTING.md` 신규 절, 제품/테스트 변경 없음).
- `scripts/testProdCheck.mjs` — CI에서 FAIL 관측, 최초 관측 원인: 자체
  `--fixture` self-suite(총 292단언) 중 1건 FAIL — `--show-names — INFO
  절에 원본 이름 "DriftStudentS1" 이 보인다`(CI 학생명 마스킹의
  `--show-names` 옵트아웃 플래그가 INFO 절의 마스킹까지는 해제하지 않는
  것으로 보임) — `extra:true`(non-gating), 이 세션 범위 밖이라 원인
  조사/수정은 하지 않고 관측만 기록(상세 §0.15).

### 0.11 롤백 방법

플래그(`paulTown2_5d`) 기본값이 이미 `false`라 이 브랜치가 머지돼도
학생/운영자 화면은 바뀌지 않는다(청크 자체가 지연 로드되지 않아 네트워크
호출 0). 완전 제거가 필요하면 다음 파일만 되돌리면 된다(V1/V2 무변경):
`src/components/town/proto2_5d/*`, `src/utils/town/proto2_5d/*`,
`src/utils/town/depthOrder.js`의 `character` 레이어 1줄, `src/App.jsx`의
lazy mount 블록, `src/config/features.js`의 `paulTown2_5d` 항목 2곳
(DEFAULT_FEATURES + attachment 카테고리), `scripts/testProto25d*.mjs`,
`tests/e2e/townProto25d.spec.mjs`.

### 0.12 다음 에이전트의 첫 작업

`ProtoCharacter.jsx`의 이모지 플레이스홀더를 §0-A 사양을 만족하는
라이선스 스프라이트 세트(idle / 좌우 방향 걷기 / 앉기)로 교체한다 —
상태 머신/워크그리드는 변경하지 않고, 현재 160 E2E + 139 단위 단언
(28+23+88)이 전부 그린을 유지해야 한다.

### 0.13 시각 검증(Phase 6, 2026-09-23, 별도 리뷰어 세션 실행)

§0.8의 Vercel Preview URL은 Vercel SSO 뒤에 있고(`302 →
vercel.com/sso-api`), 이 프로토타입은 학생 로그인 이후에만 마운트된다
(`src/App.jsx`의 `if (!student) return <login>`이 플래그 게이팅 오버레이
보다 먼저 평가됨) — 즉 Preview에서 실제로 로그인하면 Production PIN
인증 API를 그대로 타 쓰기가 발생할 수 있다. "Production WRITE 0" 제약을
지키기 위해, 이 시각 검증은 Preview를 직접 열지 않고 **동일 빌드
산출물**(HEAD `435d6b1`의 `dist/`)을 로컬 `vite preview` +
`installMocks`(Supabase/Vercel 네트워크 요청 0건)로 띄워 실행했다
(스크래치 스크립트 `scripts/.tmp/visual_capture_stage5.mjs`, 스크린샷
`scripts/.tmp/visual_stage5/`, 둘 다 gitignore 대상 — 커밋 안 됨).

- **결과**: 50/50 기능 체크 OK — 1280x800(마우스), 360x740/390x844/
  412x915(CDP 터치, `deviceScaleFactor` 3), 추가로 390x844 +
  `prefers-reduced-motion`에서 idle→walking→sitting(벤치 위에 착석,
  벤치가 보임)→leaving→idle 전체 사이클. 모든 phase에서 그림자 존재
  확인. 장애물 디버그 박스는 기본 0/0(안 보임), `?proto25dDebug=1`에서
  3/3(보임). 장애물 depth는 디버그 박스로 재확인(건물 앞: charZ 6409 >
  buildingZ 6362, 건물 뒤: charZ 6184 < 6362). 어떤 폭에서도 가로 스크롤
  없음.
- **착석 float 잔여 오차 실측치**(§0.9 "알려진 한계"의 정성적 서술을
  수치로 보충 — §0.9 자체는 재작성하지 않는다) — 모바일 ≈15px, 데스크톱
  ≈29px, reduced-motion ≈36px. 전부 §0.9가 이미 "수정 금지"로 명시한
  허용된 한계 범위 안(수치로도 숨겨지지 않고 실측·기록됨).
- **콘솔 경고**: `src/utils/paulReactions.js`(커밋 `d9be08c`)의 기존
  "[Paul] 20개 캐릭터 PNG가 아직 없어서…" 알림 1건뿐 — 이 프로토타입과
  무관한 기존 경고.
- **Vercel 배포 상태**: `435d6b1`에 대한 GitHub 커밋 상태 "success"로
  확인됨(배포 자체는 됨 — 다만 위 이유로 이 세션이 그 Preview에서 직접
  로그인해 시각 확인은 하지 않았다).
- **아침 점검(운영자 Android 실기기)은 원격 세션이 대신할 수 없다** —
  Preview URL에 실제 사용자 로그인 + 관리자 패널에서 플래그 ON까지 해야
  하는 절차라(§0.13 헤더 문단의 SSO/로그인 제약과 동일 이유), 운영자가
  직접 수행해야 한다(§0.14 체크리스트 참고).

### 0.14 아침 점검 체크리스트(운영자용, Preview URL)

`https://voca-git-feat-paul-town-v2-clean-pr-jina4926952s-projects.vercel.app`

1. 로그인 → 관리자 패널 → "🎯 기능" → `paulTown2_5d` ON → 오버레이가 뜸.
2. 바닥 탭 → 캐릭터가 걸어감, 스크롤 제스처에서는 이동하지 않음(드래그
   임계값, §Proto25DScreen.jsx `DRAG_THRESHOLD_PX`).
3. 벤치 탭 → 걸어가서 벤치를 향해 서고, 약 2.5초(`SIT_HOLD_MS`) 앉았다가
   일어나 idle로 복귀(§0.13의 float 수치는 정상 — 결함 아님).
4. `?proto25dDebug=1` 쿼리 → 장애물 박스 3개가 보이고, 캐릭터가 건물
   앞/뒤를 지날 때 올바르게 가려지고 가림.
5. 플래그 OFF → 오버레이가 즉시 사라짐, 나머지 앱 화면은 영향 없음.

### 0.15 `scripts/testProdCheck.mjs` 상세 확인 사실(§0.10 보충)

§0.10이 이미 "CI에서 FAIL 관측, 원인 미조사"로 기록한 항목의 최초
관측 원인을 추가로 남긴다(여전히 조사/수정은 이 세션 범위 밖) — 자체
`--fixture` self-suite(총 292단언) 중 1건 FAIL: `--show-names — INFO
절에 원본 이름 "DriftStudentS1" 이 보인다`(CI 학생명 마스킹의
`--show-names` 옵트아웃 플래그가 INFO 절의 마스킹은 해제하지 않는 것으로
보임). `extra:true`(non-gating), Proto 2.5D와 무관.

---

### 0.16 §0.10 정정(같은 날 후속) — S9 원인 증명·수정, Proto S3 항목11 측정 수정, CI Gate 2 그린

§0.10의 "S9 근본 원인 미확정 → 문서화만"은 2026-09-23 오전 후속 조사로
**증명·수정**됐다(§0.10 본문은 append-only 원칙상 그대로 둔다): CI run
35802684946(`1d97f81`)에서 Gate 2 `verify:all`은 ✅(커밋 `435d6b1` 효과),
Gate 5 `verify:e2e`만 2/1488 FAIL. (1) S9 — 배치 모드 진입 시 애니메이션
재시작은 없음(프로브로 반증). 실제 원인은 씬 루트의 1회성 `townEntrance
450ms` scale(0.97→1) 애니메이션이 **아직 재생 중일 때** 자손 앵커 bbox를
읽는 것(자연 실행 10회 중 1회 367ms 시점 43.95px; 인위적 재생 중 읽기 5/5
43.13~43.39px = CI 값; 종료 대기 후 5/5 44.00). 수정 `d042308`:
`tests/e2e/townV2.spec.mjs`에 `waitForEntranceAnimationSettled(page)`를 S9
bbox 루프 직전 호출(허용치·뷰포트·단언 수 448 무변경, 제품 코드 무변경).
(2) `[town-proto2.5d] S3 항목11 드래그` dist=1.0156 — `Proto25DScreen.jsx:
193-198`의 650ms `setTimeout`(커밋 시 예약)과 650ms CSS transition(다음
페인트 시작)의 시계 차로 phase `idle` 시점에 잔여 이동이 남을 수 있어,
항목9 연속 탭 직후 `boxBeforeDrag`가 그 잔여를 드래그로 오귀속. 수정
`6584b11`: `waitForBoxStable(locator)`로 기준선 샘플만 안정화(허용치 `<1px`·
단언 수 160 무변경). Windows 프로브 12회는 잔여 0px(로컬 재현 안 됨) — CI
재실행이 개선 증명(결과: `handoff.md` 172차 §10, PR #62 코멘트). 상세:
`TESTING.md` 2026-09-23 후속 절.

### 0.17 Phase 6A(2026-09-23 후속, 173차) — 씬 구성·탭 리플·스프라이트 어댑터·sway 앵커 버그

- 커밋 `2095198`(씬 픽스처) / `cd73799`(캐릭터 매니페스트 어댑터). 상세는
  `handoff.md` 173차 — 여기서는 이 문서의 §0 항목 중 바뀐 사실만 적는다.
- §0.2 파일 지도 추가: `src/utils/town/proto2_5d/sceneFixture.js`(씬 구성
  단일 진실 원천, `deriveObstacles`→`walkGrid.OBSTACLES` 3→8개),
  `src/utils/town/proto2_5d/characterManifest.js`(§0-A 매니페스트 계약의
  validator/adapter, 오늘은 호출부가 manifest를 넘기지 않아 비활성).
- §0.3 좌표: 장애물 사각형은 이제 `sceneFixture.js`에서 파생된다. 레거시
  3개 좌표는 `collisionRect`로 byte-identical 고정, 신규 5개(house-annex/
  tree-plaza-nw/tree-plaza-ne/shrub-sw/shrub-se)는 `footprintRect`. 격자·
  BFS·깊이 함수 무변경.
- §0.6 테스트: 단위 139 → 235(sceneFixture 24 + characterManifest 72 추가),
  E2E `townProto25d.spec.mjs` 160 → 190(장애물 8개·오브젝트/그림자 앵커
  4 뷰포트·리플 on/off·우회 2종). 전부 gating(extra:false).
- §0.9 알려진 한계 무변경(이모지 플레이스홀더·착석 float·바닥 aspectRatio)
  — 이 Phase는 §0.9를 건드리지 않았다.
- 새로 기록하는 렌더 규칙: **CSS keyframe이 `transform`을 애니메이션하는
  엘리먼트에는 inline transform 앵커를 두지 말 것** — 실행 중인 애니메이션이
  inline `translate(-50%,-100%)`를 매 프레임 덮어써 top-left가 앵커에 놓인다
  (Phase 6A에서 나무/꽃밭 5개가 실제로 그렇게 어긋났고 래퍼 `div`로 분리해
  수정). `ProtoCharacter.jsx`가 bob/facing 레이어를 분리해 둔 것과 같은
  이유다.
- §0.12 다음 작업 갱신: 스프라이트 아트 확보 시 `src/assets/town/character/
  index.js` registry + 매니페스트를 `Proto25DScreen.jsx`에서
  `<ProtoCharacter manifest={...}>`로 넘기면 된다(어댑터 대기 중). 그때
  `data-proto-character-glyph` 잉크 단언 3개를 `seatAnchorPx` 투영 기준으로
  재작성.

### 0.18 캐릭터 스프라이트 교체 조사·계약(2026-09-24, 174차) — 조건 B, 에셋 승인 대기

- 단일 진실 원천은 `SPRITE_CONTRACT_2026-09-24.md`(같은 폴더). 이 절은
  포인터만 남긴다 — §0-A 사양은 그대로 유효하되, 다음 두 가지가 §0-A를
  **보강**한다: (1) `walkFront`/`walkBack`이 선택 state로 추가되고
  `walk`는 `walkSide`의 별칭(하위호환), (2) 방향 판정 `directionForMove`가
  `WORLD` 종횡비 정규화 규칙으로 확정됐다.
- 조사 결과 idle+walk+sit 3종을 객관적으로 만족하는 라이선스 명확 에셋은
  저장소·공식 배포처(Kenney/OpenGameArt/itch 원작자) 어디에도 없었다. 최유력
  Kenney Toon Characters(CC0, 96×128, 정면 걷기 8프레임)는 sit 포즈와
  옆/뒤 걷기 프레임이 없고 화풍(플랫 벡터)은 사람 판단 사항 — 아카이브
  SHA-256과 프레임 알파 실측 앵커는 계약 문서 §3/§4.4에 기록.
- 앱 캐릭터는 변경하지 않았다(이모지 유지, §0.9 그대로). 적용 시 실행할
  체크리스트는 계약 문서 §5, 테스트 설계는 `sprite-research/TEST_DESIGN_
  2026-09-24.md`.

## 0-A. 캐릭터 에셋 요구사항(정식 사양)

다음 에이전트가 실제 스프라이트를 요청/제작/배선할 때 그대로 따를 최소
사양. `ASTRA_ASSET_AUDIT_2026-09-21.md` §8의 "최소 신규 자산 목록"
제안을 실제 구현 경험(Stage 3~5의 depth-scale/좌석 sink 보정)으로
구체화한 것 — 그 문서의 제안을 재작성하지 않고 필요한 부분만 갱신한다.

- **포맷**: PNG 또는 WebP(알파 채널 필수, 이 저장소 기존 4파일 계약 —
  `.webp`/`.png`/`@2x.webp`/`@2x.png` — 그대로 따를 것,
  `ASTRA_ASSET_AUDIT_2026-09-21.md` §9).
- **상태(states)**: idle, walk, sit 3종 필수. leaving은 별도 아트
  불필요(walk 프레임 재사용 — 현재도 코드상 leaving은 walking과 동일
  이동 로직을 공유, `Proto25DScreen.jsx`의 `walkPath`는 `phaseLabel`
  인자만 다르게 받는다).
- **방향(directions)**: 좌/우 최소(오른쪽 기준 1세트만 제작하고
  `scaleX(-1)`로 미러링 — 이미 `ProtoCharacter.jsx`의 facing 레이어가 이
  방식으로 배선돼 있다, 새 코드 불필요). 전/후 방향은 선택.
- **프레임 수/fps**: idle 1(정적으로 시작 가능), walk 2(최소 스텝
  사이클 절반, 애니메이션 없이도 방향 전환 검증 가능), sit 1.
- **캔버스 크기**: `nature/tree.webp`(96×128)와 동일 캔버스 권장(이미
  검증된 "서 있는 형태" 비율, `ASTRA_ASSET_AUDIT_2026-09-21.md` §8 표).
- **앵커 매니페스트(신규 요구, 이번 구현 경험에서 추가)**: 스프라이트
  시트와 함께 작은 JSON 매니페스트로 프레임별 **foot anchor**(지면 접점,
  `translate(-50%,-100%)`가 겨냥하는 점 — 현재 `ProtoCharacter.jsx`의
  이모지 박스 하단-중앙과 동일 역할)와 **hip/seat anchor**(벤치 좌석
  정렬용 — 현재 `benchInteraction.js`의 `seatSinkLocalPx`가 이모지 잉크
  경계를 런타임에 매번 측정해 근사하는 것을 대체)를 px 오프셋으로 명시할
  것. 실제 아트로 교체되면 이 앵커 매니페스트가 `measureGlyphInk`/
  `seatSinkLocalPx`의 런타임 캔버스 측정 전체를 대체해야 한다(고정
  앵커가 있으면 매 렌더 잉크 측정이 불필요해짐 — 성능/정확도 모두
  개선).
- **패딩**: 프레임 간 일관된 여백(스프라이트시트 자동 슬라이싱 가정).
- **라이선스**: 상업적 이용 가능 라이선스 필수, 출처 기록 필수
  (`ASTRA_ASSET_AUDIT_2026-09-21.md` §13이 이미 지적했듯 이 저장소 기존
  자산 154개 전부가 출처 UNKNOWN인 부채를 새 자산에서는 반복하지 않을
  것).
- **배치**: `src/assets/town/` 하위(예: `src/assets/town/character/`)에
  기존 registry 패턴(`townAsset()`, `env/index.js`가 증명한 "별도
  registry + export + 정적 계약 테스트로 키 개수 고정" 패턴)을 그대로
  복제. 새 설계 불필요(`ASTRA_ASSET_AUDIT_2026-09-21.md` §9).
- **용량 예산**: 이 프로토타입은 이미 `paulTown2_5d` 자체 플래그로
  게이팅돼 플래그 OFF면 청크가 로드되지 않는다 — 신규 스프라이트도
  반드시 지연 로드 청크(`Proto25DScreen`이 import하는 모듈)에만
  포함시키고 메인 청크에 섞이지 않게 할 것. §0.10의
  `testBundleBudget.mjs` 청크 판별 문제가 바로 "지연 로드 모듈이 기존
  공유 모듈을 import해서 메인과 헷갈리는 청크가 생기는" 사례였다 — 새
  캐릭터 자산 registry는 Proto 2.5D 전용으로 격리해 같은 문제가
  재발하지 않게 할 것.

---

## 1. 현재 프로젝트 상태 요약

Paul Town V2는 `paulTownV2` 플래그(기본 `false`, 기기 로컬 오버라이드만
가능, 허용목록 없음) 뒤에서 개발 중인 **완전히 새로운 렌더러**로, V1의
저장/소유권 로직(구매·배치·이동·보관)을 코드 재사용 없이 재구현하지 않고
그대로 재사용하면서, 화면만 8x6 격자(V1 `TownGrid`)가 아니라 퍼센트 앵커
기반 "씬"(V2 `TownScene`, 12개 개념 레이어)으로 바꿔 그린다. 지금까지 4
라운드가 쌓였다 — 아이템 depth/그림자, 자석 드래그 이동, 2.5D 앰비언트
연출(반짝임/흔들림/입장 줌), 벤치 앉기 상호작용(캐릭터 상태 머신 파일럿,
임시 이모지 플레이스홀더). 자동화 테스트(`tests/e2e/townV2.spec.mjs`,
`scripts/testTownV2Static.mjs` 등)는 전부 통과하지만, 운영자가 실제 Vercel
Preview에서 육안으로 확인했을 때 벤치 앉기 캐릭터가 보이지 않았다고
보고했다 — 이 세션이 그 불일치를 조사했다(§5 참고).

## 2. 정확한 브랜치/워크트리/HEAD

- 워크트리: `C:\Users\jinal\AppData\Local\Temp\claude\C--voca\d95369ce-02f1-41e7-9e92-41e2cb3ce37a\scratchpad\wt-clean-pr`
- 브랜치: `feat/paul-town-v2-clean-pr`
- 이 세션 시작 시 HEAD: `8453140`(사전 확인된 origin과 일치, `git status
  --porcelain` clean)
- 이 세션이 만든 새 HEAD: 이 문서 커밋 1개(§ Phase 6, 제품 코드 변경
  없음) — 정확한 해시는 이 문서 마지막의 "검증한 것" 절 참고.

## 3. PR #62 상태

`gh pr view 62` 결과: `OPEN`, `DRAFT`, 제목 "feat(town): add Paul Town V2
behind disabled flag", `https://github.com/jinalove1111/voca/pull/62`.
이 세션은 머지/undraft를 하지 않았다.

## 4. 지금까지 구현된 기능(4라운드, 코드로 재확인)

1. **그라운디드 2.5D 아이템 depth**(`2ac5a50`) — `placedItemVisual()`/
   `depthScale()`가 `src/utils/town/worldRender.js`에 있고
   `src/utils/town/worldContract.js`의 `depthScale`(worldContract.js:192-206,
   y 0~100을 4개 구간 `DEPTH_BANDS`(worldContract.js:173-178)로 스케일
   0.55~1.20에 매핑)를 가져다 쓴다. 접지 그림자 + 선택 lift는
   `src/components/town/v2/TownObjectLayer.jsx:504-518`(그림자)/
   `:536-566`(선택 rim/glow). 시각 메타데이터는 별도 파일
   `src/utils/town/townItemVisualMeta.js`(보호 대상 `townCatalog.js`와는
   분리).
2. **자석 드래그 배치**(`8050103`) — 드래그 상태는
   `TownScene.jsx`(`handleDragPointerDown/Move/Up/Cancel`:346-387,
   `computeNearestAnchor`:290-307, `DRAG_THRESHOLD_PX=8`:145,
   `MAX_SNAP_DISTANCE_PX=44`:153)가 소유. 드래그-캐치 오버레이는
   `TownObjectLayer.jsx`(`data-drag-surface`, 595행 부근 주석). 초록
   하이라이트는 `TownPlacementOverlay.jsx`. 드롭 커밋은 기존 tap-to-anchor
   경로(`handleAnchorTap → onCellTap → TownScreenV2.handleCellTap →
   studentData.moveTownItem`)를 그대로 재사용 — 새 API 없음
   (`TownScene.jsx:378`).
3. **2.5D/앰비언트 폴리시**(`32861bf`) — 선택 glow, 배치 "정착(settle)"
   바운스(`TownObjectLayer.jsx:489-493`, `SETTLE_DURATION_MS` 관련 주석),
   고양이 idle 애니메이션(`TownObjectLayer.jsx:490`), 강 반짝임
   (`TownWaterLayer.jsx`, `river-highlight` 타일만), 초목 흔들림
   (`TownSceneryLayer.jsx`, 결정론적 클러스터 6개), 신규
   `TownAtmosphereLayer.jsx`(결정론적 드리프터 4개, 나비/나뭇잎/빛 알갱이 —
   전체 코드 확인, `DRIFTERS` 배열 TownAtmosphereLayer.jsx:29-34), 신규
   `src/hooks/useDocumentHidden.js`, 씬 마운트 입장 줌
   (`TownScene.jsx:483` `motion-safe:animate-town-entrance`).
4. **벤치 앉기 상호작용**(`8453140`, 현재 HEAD) — 상태 머신
   (idle→walking→sitting→leaving→idle)은 `TownScene.jsx`가 소유
   (`handleItemInteract`:227-258, `interaction`/`interactionRef`/
   `interactionTimerRef`/`interactionSeqRef`:175-178). 신규
   `TownCharacter.jsx`(순수 프레젠테이션, 임시 이모지 `🧒` + 흐린 그림자
   타원). 신규 `src/utils/town/townInteractions.js`
   (`ITEM_INTERACTIONS = { bench: { type: 'sit' } }`:14-16,
   `interactionFor(itemId)`:24-27). 신규
   `src/hooks/usePrefersReducedMotion.js`(JS 레벨 media-query 훅 —
   reduced-motion에서 'walking' 단계 자체를 건너뛰어야 하므로 CSS
   `motion-safe:`만으로는 불충분). 트리거는 기존 배치 아이템 버튼의
   `onClick`에 **추가로** 얹힌다(`TownObjectLayer.jsx:569-573`) — 같은
   클릭이 `onTogglePlacement`(이동/보관 팝오버)와 `onItemInteract`(앉기
   시퀀스)를 **동시에** 호출한다. 이는 우연이 아니라 설계 의도로
   문서화돼 있다(`TownScene.jsx` 헤더 주석 96-109행, S21 테스트 주석
   `tests/e2e/townV2.spec.mjs:3151-3157` "이동 모드 진입 탭 자체는
   팝오버와 함께 앉기 시퀀스도 정상적으로 함께 시작할 수 있다(설계상
   의도된 동작)"). 새 z 상수 `CHARACTER_Z = LAYER_BASE.paul - 500 = 7500`
   (`src/components/town/v2/sceneZ.js:57`). 자동화 테스트
   (`tests/e2e/townV2.spec.mjs` S21, 3026-3170행경)는 전부 PASS, 정적
   계약(`scripts/testTownV2Static.mjs`)도 이 세션 재실행 결과 147/147
   PASS.

## 5. 실제 시각 검증에서 실패한 것 — 조사 결과

**결론부터: 캐릭터 렌더링 코드 자체의 버그는 이 세션에서 재현하지
못했다(반증 시도 성공) — "일반적인 z-index/레이아웃 결함"이라는 가설은
기각한다. 정확한 근본 원인은 여전히 미확정(unconfirmed)이다.**

### 5.1 기각한 가설(코드/실측 근거로 반증)

- **FogLayer가 캐릭터를 가림** — 기각. `TownFogLayer.jsx`의 헤이즈는
  `worldZIndex('distantLocked', ...)`(base 2000대, depthOrder.js:80),
  표지판은 `worldZIndex('scenery', ...)`(base 6001 + y*9, 최대
  6001+900=6901)를 쓴다(`TownFogLayer.jsx:78,91`). `CHARACTER_Z=7500`
  (sceneZ.js:57)은 둘 다보다 항상 크다 — 수학적으로 절대 가릴 수 없다.
- **이모지 글리프가 실제로는 크기 0/보이지 않음** — 기각. 실측 스크린샷
  (§5.2)에서 25~30px(390px 뷰포트 기준) 크기로 뚜렷이 보인다.
- **opacity 0→1 rAF 타이밍 창을 자동화 테스트가 우연히 피해감** — 근거
  약함(운영자 증상은 "깜빡였다"가 아니라 "안 보였다"였음), 이 세션의
  실측에서도 opacity가 0.98~1로 즉시 관측돼 이 가설을 뒷받침하지 않음.
- **이동/보관 팝오버(z=9200, `sceneZ.js:30`)가 캐릭터(z=7500) 위에 그려져
  가림** — 이 세션이 코드 정독으로 **처음 발견한 실제 설계 특성**(모든
  벤치 탭이 팝오버와 앉기 시퀀스를 동시에 시작함, §4-4 참고)이라 유력한
  후보로 보고 실측했으나, **두 서로 다른 앵커 위치(화면 상단 근처
  y=0/`0,0`, 화면 하단 근처 y=5/`7,5`, 팝오버가 각각 `top-full`/
  `bottom-full`로 반대 방향에 열리는 두 케이스)에서 모두 겹치지 않았다**
  (아래 §5.2 실측 데이터). 47칸 전체를 다 확인하지는 못했으므로 특정
  좁은 기하학적 조합에서 겹칠 가능성 자체를 100% 배제할 수는 없지만,
  일반적 원인은 아니다.

### 5.2 실측 방법과 결과(이 세션이 직접 수행)

`tests/e2e/lib/mockRoutes.mjs`의 `installMocks()`와 `tests/e2e/townV2.spec.mjs`
S21과 동일한 mock/로그인/네비게이션 패턴을 재사용한 임시 진단 스크립트
(`scripts/.tmp/diagCharacterVisibility.mjs`, **gitignore 대상, 커밋
안 함**)를 만들어 실제 `vite preview` 빌드(390x844 뷰포트, headless
Chromium)에서 벤치를 배치→탭하고, 캐릭터의 computed style/bounding
box/screenshot을 직접 관찰했다:

```
[앵커 (0,0), world y=0]
character: {zIndex:"7500", opacity:"0.986~1", rect:{x:156,y:408,w:25,h:30}, phase:"walking"→"sitting"}
popover:   {zIndex:"9200", rect:{x:88,y:442,w:101,h:52}}
bounding box 겹침: false
스크린샷: 캐릭터(🧒)가 벤치 옆에 뚜렷이 보임(walking/sitting 모두)

[앵커 (7,5), world y=5]
character: {zIndex:"7500", opacity:"1", rect:{x:70~52,y:617,w:29,h:30}, phase:"walking"→"sitting"}
popover:   {zIndex:"9200", rect:{x:42,y:547,w:101,h:52}} (bottom-full로 반대편에 열림)
bounding box 겹침: false
스크린샷: 캐릭터가 화면 하단부 정원 근처에 뚜렷이 보임
```

두 스크린샷 모두 `scripts/.tmp/diag_character_walking.png`,
`diag_character_sitting.png`로 저장됐다가 그 다음 실행에서 덮어써졌다
(gitignore 대상, 리포에 없음 — 재현하려면 Astra가 같은 스크립트를 다시
실행하면 된다).

### 5.3 미확정이지만 유력한 남은 가설(Astra가 이어서 확인할 것)

- **플래그/파일럿 게이팅 불일치** — `src/App.jsx:267,272-273`:
  `townV2Active = townV1Enabled && paulTownV2Enabled`이고
  `townV1Enabled = paulTownV1Enabled || isPilotTownStudent(studentId)`
  (파일럿 허용목록이 townV1은 우회시키지만 **`paulTownV2`는 허용목록이
  없어 반드시 기기 로컬 플래그로 명시적으로 켜야 함**, `features.js:112`
  주석 "townV1 자격(기기 플래그 OR Pilot A 허용목록)이 있을 때만 의미
  있음. OFF면 V1 격자 그대로"). `features.js:109` 주석은 이미 "관리자가
  플래그를 저장한 적 있는 기기는 localStorage 스냅샷(false)이 이겨서 그
  기기에선 여전히 꺼져 있을 수 있음"이라는 동일 계열의 기기-로컬-플래그
  함정을 documented pitfall로 남겨뒀다 — 운영자가 Preview를 본 세션에서
  `paulTownV2` device flag가 실제로 켜져 있었는지(즉 V1 격자가 아니라
  V2 씬 자체를 보고 있었는지)는 이 세션이 원격으로 확인할 수 없다. 이걸
  가장 먼저 배제/확인해야 한다 — 간단하고 코드 밖 요인이라 자동화 테스트로
  못 잡는다.
- **캐릭터는 원래 짧고(≈3.4초, `CHARACTER_WALK_MS`650+`CHARACTER_SIT_HOLD_MS`
  2500+`CHARACTER_FADE_MS`220, `TownCharacter.jsx:27,31`,
  `TownScene.jsx:136`) 벤치를 명시적으로 "탭"해야만 나타나는 휘발성
  연출** — 운영자가 벤치를 소유/배치하지 않았거나, 배치는 했지만 탭하지
  않고 화면만 봤다면(연출이 자동 트리거가 아님) "안 보였다"는 관찰과
  정확히 일치하되 버그가 아니다. 이 가설도 배제하지 못했다.
- **로컬 `vite preview` 빌드와 실제 Vercel Preview 배포 사이의 차이**
  (예: 오래된 배포/캐시, 실제 Preview URL에서만 발생하는 문제) — 이
  세션은 로컬 빌드만 접근 가능해 이 경로는 전혀 검증하지 못했다.

**Astra 세션 시작 시 권장 순서**: (1) 운영자에게 Preview를 본 세션에서
`localStorage.paulEasyVoca_features`의 `paulTownV2`/`paulTownV1` 값을
물어보거나 직접 확인, (2) 벤치를 실제로 소유·배치·탭했는지 확인, (3) 그래도
재현되면 §5.2의 진단 스크립트를 그 Preview URL 자체에 대해(mock 없이, 실제
로그인으로) 재실행해 실제 배포 DOM을 관찰.

## 6. 관련 파일 전체 지도(이 세션이 실제로 읽은 파일)

```
src/config/features.js                         — 플래그 정의(paulTownV1/V2, 라인 110-112)
src/App.jsx                                     — V1/V2 분기(263-274)
src/components/town/v2/TownScreenV2.jsx         — V2 화면 컨테이너, 데이터 배선
src/components/town/v2/TownScene.jsx            — 씬 렌더러, 드래그/상호작용 상태 소유
src/components/town/v2/TownObjectLayer.jsx      — 배치 아이템 렌더, 탭/드래그 배선
src/components/town/v2/TownCharacter.jsx        — 벤치 앉기 캐릭터(임시 이모지)
src/components/town/v2/TownFogLayer.jsx         — 잠긴 랜드마크 헤이즈/표지판
src/components/town/v2/TownPlacementOverlay.jsx — 배치 가능 칸 오버레이
src/components/town/v2/TownWaterLayer.jsx       — 강 반짝임
src/components/town/v2/TownSceneryLayer.jsx     — 울타리/생울타리/클러스터
src/components/town/v2/TownAmbientLayer.jsx     — 정원 성장(gardenPoints 연동)
src/components/town/v2/TownAtmosphereLayer.jsx  — 순수 대기 장식(나비 등)
src/components/town/v2/TownGroundLayer.jsx      — 지형(읽음, 상세 미검토)
src/components/town/v2/TownPathLayer.jsx        — 경로 타일(읽음, 상세 미검토)
src/components/town/v2/TownHud.jsx              — 상단 HUD(레벨/별/달러)
src/components/town/v2/sceneZ.js                — 씬 로컬 UI z-index 상수
src/utils/town/depthOrder.js                    — 12레이어 depth/z-index 모델(전체 정독)
src/utils/town/worldContract.js                 — 월드 지오메트리 계약(REGIONS/LANDMARKS/PATHS/depthScale)
src/utils/town/placementContract.js             — 47칸 배치 계약(OBJECT_CLASSES 등)
src/utils/town/worldRender.js                   — cellAnchor/freeWorldAnchors/worldZIndex/landmarkBox
src/utils/town/townLayout.js                    — V1/V2 공용 배치 영속화(순수, 전체 정독)
src/utils/town/townInteractions.js              — 아이템 상호작용 레지스트리(전체 정독)
src/utils/town/townCatalog.js                   — 아이템 메타(가격/카테고리/최소레벨, bench 항목만 확인)
src/hooks/useTownShop.js                        — 상점 상태/구매 훅(전체 정독)
src/hooks/useStudent.js                         — townPlacements/townRemovedIds 배선(grep)
src/utils/wordLibrary.js                        — fetchTownShopState/postTownPurchase(전체 확인)
api/grant-xp.js                                 — 서버 RPC 액션(purchase_town_item 등, studentId 신뢰 경계 확인)
DATABASE.md                                     — student_progress.progress_data/star_purchases RLS
tests/e2e/townV2.spec.mjs                       — S21(벤치 앉기) 전체 정독 + 헬퍼 재사용
tests/e2e/lib/mockRoutes.mjs                    — installMocks 시그니처 확인
scripts/testBrowserE2E.mjs                      — E2E 러너 구조(포트/스펙 목록)
scripts/testTownV2Static.mjs                    — 이 세션이 재실행(147/147 PASS)
docs/design/town/*.md                           — 기존 핸드오프 명명 관례 확인
CLAUDE.md                                       — 저장소 헌법 18개 규칙
```

## 7. 핵심 컴포넌트와 데이터 흐름

```
App.jsx (townV2Active 계산)
  └─ TownScreenV2.jsx (데이터 배선: studentData, townShop)
       ├─ TownHud.jsx (레벨/별/달러 표시)
       ├─ TownScene.jsx (씬 렌더 + 드래그/상호작용 상태 소유)
       │    ├─ TownGroundLayer / TownWaterLayer / TownPathLayer / TownSceneryLayer / TownAmbientLayer / TownAtmosphereLayer (배경, z 0~4000+scenery)
       │    ├─ TownObjectLayer.jsx (배치 아이템 렌더, 탭→popover+interact 동시 트리거)
       │    ├─ TownCharacter.jsx (상호작용 시에만 마운트)
       │    ├─ TownFogLayer.jsx (잠긴 랜드마크)
       │    └─ TownPlacementOverlay.jsx (이동/배치 모드일 때만)
       ├─ TownSheet(상점) → TownShopPanel (townShop.purchase)
       └─ TownSheet(보관함) → TownInventory (handlePlaceStart/handleMoveStart)
```

## 8. 핵심 API와 Supabase 테이블

- 엔드포인트 1개: `POST /api/grant-xp`(`api/grant-xp.js`), action으로
  분기 — `get_town_shop_state`(조회) / `purchase_town_item`(구매) /
  `claim_town_welcome`(환영 보상). 세 액션 전부 `studentId`를 세션 토큰
  에서만 읽고 `req.body.studentId`는 절대 읽지 않는다(`api/grant-xp.js:80-81,
  203` 주석 — CLAUDE.md 규칙 4 UUID-only 식별 준수 확인).
- 서버는 각각 `get_town_shop_state(p_student_id)` /
  `purchase_town_item(p_student_id, p_item_id)` RPC를 호출
  (`api/grant-xp.js:101,208`).
- 소유권/구매 이력 테이블: `star_purchases` — RLS 활성화 + 정책 0개 +
  `revoke all ... from anon, authenticated`(`DATABASE.md:527`) — 클라이언트는
  이 테이블을 절대 직접 SELECT하지 않고 항상 RPC 파생값만 받는다.
- 배치 좌표(townPlacements/townRemovedIds)는 **별도 테이블이 아니라**
  `student_progress.progress_data`(jsonb, `useStudent.js` 레코드 전체
  백업)의 일부로 기존 진행도 동기화 파이프라인을 그대로 탄다
  (`DATABASE.md:63`, `useStudent.js:425-426,604-605`).

## 9. 구매 → 보관함 → 배치 → 이동 → 저장 → 복원 흐름

1. **구매**: `TownShopPanel` → `TownScreenV2.handlePurchase` →
   `townShop.purchase(itemId)`(`useTownShop.js:98-119`) →
   `postTownPurchase` → `POST /api/grant-xp {action:'purchase_town_item'}`
   → `purchase_town_item` RPC(`star_purchases` insert, 서버 권위) →
   응답으로 `state.owned`에 낙관적 반영 + `refresh()`로 서버와 재정합.
2. **보관함**: `TownInventory`가 `freeCatalog`(고정 랜드마크 제외 카탈로그) ×
   `ownedIds`로 "소유했지만 안 놓은" 아이템을 보여줌
   (`unplacedOwnedIds`, `townLayout.js:176-180`).
3. **배치**: `TownInventory.onPlaceStart` → `TownScreenV2.handlePlaceStart`
   → `mode={kind:'placing'}` → `TownScene`가 `TownPlacementOverlay`로 빈
   47칸(`freeWorldAnchors`, `worldRender.js:171-188`) 표시 → 탭 →
   `handleAnchorTap` → `onCellTap(x,y)` → `TownScreenV2.handleCellTap` →
   `studentData.placeTownItem(itemId,x,y,ownedIds)` →
   `townLayout.placeItem`(`townLayout.js:68-82`, 순수 함수, **저장 좌표는
   0~7×0~5 정수 그리드 셀 id** — worldContract의 0~100% 월드 좌표가 아님,
   §11 좌표계 절 참고).
4. **이동**: 탭-투-앵커(`handleMoveStart`→같은 `onCellTap`경로,
   `moveItem`) 또는 자석 드래그(`TownScene.jsx` 드래그 상태→
   `handleAnchorTap`으로 합류, 새 API 없음).
5. **저장**: `placeTownItem`/`moveTownItem`/`storeTownItem`은 모두
   `useStudent.js`의 진행 레코드(`rec.townPlacements`)를 갱신하고, 기존
   전체 진행도 동기화(로컬↔클라우드 병합, `mergeTownLayout`,
   `townLayout.js:127-150`, last-write-wins + updatedAt recency)가 그대로
   실어 나른다 — Town 전용 저장 API 없음.
6. **복원**: 새로고침/재로그인 시 `useStudent.js`가 클라우드
   `student_progress.progress_data`에서 레코드를 불러와
   `mergeTownLayout`으로 로컬과 병합 → `visiblePlacements`
   (`townLayout.js:153-157`, 소유하지 않은 아이템의 배치는 방어적으로
   숨김)로 필터링돼 렌더.

## 10. V1/V2 분기와 안전한 롤백 방법

`src/App.jsx:263-274`:
```js
const paulTownV1Enabled = isFeatureEnabled('paulTownV1')
const townV1Enabled = paulTownV1Enabled || isPilotTownStudent(studentId)
const paulTownV2Enabled = isFeatureEnabled('paulTownV2')
const townV2Active = townV1Enabled && paulTownV2Enabled
```
`paulTownV2` 기본값은 `false`(`features.js:112`)이고 **파일럿 허용목록이
V2 자체에는 적용되지 않는다** — V1 자격(`townV1Enabled`)이 있어도
`paulTownV2`를 기기에서 명시적으로 켜지 않으면 항상 V1 격자
(`TownScreen.jsx`)로 폴백한다. **롤백은 코드 변경이 전혀 필요 없다** —
`paulTownV2` 기본값이 이미 `false`이므로 이 PR이 머지돼도 아무 학생 화면도
바뀌지 않는다(플래그 OFF ⇒ V2 청크 자체가 지연 로드되지 않아 네트워크 호출
0건, `V2_WORLD_IMPLEMENTATION_PLANNING_2026-09-17.md` §4).

## 11. 재사용/수정/교체 분류표

| 항목 | 분류 | 근거(파일:라인) | 리스크 |
|---|---|---|---|
| 인증/세션 | **A(그대로 재사용)** | `api/grant-xp.js:80-81` studentId는 토큰에서만, `useStudent.js` 기존 세션 파이프라인 그대로 | 낮음 — 건드릴 이유 없음 |
| 레벨/별/달러 | **A** | `TownScreenV2.jsx:40-44` shopState 파생, `useTownShop.js` 서버 권위 | 낮음 |
| 구매(purchase) | **A** | `useTownShop.js:98-119`, `api/grant-xp.js:191-` `purchase_town_item` RPC | 낮음 — 건드리면 `star_purchases` RLS 재검토 필요 |
| 인벤토리/보관함 | **A** | `townLayout.unplacedOwnedIds`(townLayout.js:176-180), `TownInventory` | 낮음 |
| 소유 아이템(owned) | **A** | `shopState.owned`, 서버 RPC 진실 원천 | 낮음 |
| 배치 저장/복원 | **A** | `townLayout.js` 전체(placeItem/moveItem/storeItem/mergeTownLayout), `student_progress.progress_data` 동기화 | 낮음 — 이미 2026-09-11 P2 사고로 검증된 merge 전략(파일 헤더 16-26행) |
| 플래그/롤백 | **A** | `App.jsx:263-274`, 기본 OFF | 낮음 |
| **드래그 배치** | **B(수정 재사용)** | `TownScene.jsx:290-387` 포인터 기반, 44px 스냅 | 중간 — 2.5D에서는 "클릭-투-워크"로 대체될 가능성이 높음(§13/§24), 완전 폐기 아니라 참고용 |
| **좌표계** | **B** | 저장은 정수 그리드(townLayout.js:28 `TOWN_GRID{cols:8,rows:6}`), 렌더는 0~100% world(worldContract.js:24) 이중 계층 — §19 참고 | 중간 — Astra 프로토타입은 이 이중 계층을 그대로 유지해야 기존 저장 계약이 안 깨짐 |
| **z-index/깊이** | **B** | `depthOrder.js`(12레이어, Y-랭킹 4개 레이어) — 개념은 좋으나 캐릭터가 "걸어다니는" 요구에는 정적 밴드로는 부족(§17) | 중간 |
| **캐릭터 상호작용** | **B** | `TownScene.jsx:227-278` 상태 머신은 그대로 참고할 골격이지만 벤치 1종→다중 아이템/장애물 회피로 확장 필요 | 중간 |
| **반응형 처리** | **B** | `SCENE_ASPECT_RATIO`(퍼센트 기반, 고정 종횡비) + `noHorizontalOverflow` 테스트 — 접근 자체는 유효, 캔버스/스프라이트 전환 시 재검증 필요 | 중간 |
| **평면 배경** | **C(교체)** | `TownGroundLayer`/`TownPathLayer` 등은 2D DOM 레이어 합성 — 진짜 2.5D 걷기/오클루전에는 부적합 | 높음 |
| **아이템 원근 불일치** | **C** | `docs/design/town/*` 아트 스펙은 "3/4 top-down"이라 이동 캐릭터의 4방향 스프라이트와 원근이 안 맞을 수 있음 | 높음 — 아트 방향 결정 필요 |
| **임시 이모지 캐릭터** | **C** | `TownCharacter.jsx:11-18` 주석이 스스로 "★플레이스홀더, 실제 아트 필요★"라고 명시 | 높음 — Astra의 핵심 작업 |
| **2.5D 방향과 충돌하는 렌더 코드** | **C** | DOM absolute-position 레이어 합성 자체(캔버스/WebGL 아님) — 진짜 스프라이트 애니메이션·오클루전에는 구조적 한계 | 높음 |

## 12. 새 2.5D 프로토타입 권장 구조

기존 `src/components/town/v2/`를 건드리지 않고, 완전히 별도 디렉터리에
독립 프로토타입을 둘 것을 권장한다(예: `src/components/town/proto2_5d/` +
`src/utils/town/proto2_5d/`) — 기존 파일 소유권(CLAUDE.md 규칙 16)과 완전히
분리되고, 기존 V2 정적 계약(`scripts/testTownV2Static.mjs`)을 전혀 건드리지
않는다. 재사용은 **import**로만(파일 복붙 금지) — 특히
`worldContract.js`/`placementContract.js`/`depthOrder.js`(순수 도메인,
React 의존 없음)는 좌표계/깊이 모델의 출발점으로 그대로 가져다 쓸 수 있다.

## 13. 필요한 캐릭터 이동 상태

idle, walking, sitting, leaving, celebrating — 기존 벤치 파일럿은
idle/walking/sitting/leaving 4개만 구현(`TownScene.jsx:227-258`의
상태 머신). `celebrating`은 아직 없음 — Astra 범위에서 상태 enum만
설계하고(예: 단어 학습 완료 시 트리거할 미래 훅), 실제 트리거 배선은
이번 범위 밖(§25 비목표).

## 14. 필요한 캐릭터 이동 방향

front, back, left, right — 기존 파일럿은 방향 스프라이트가 전혀 없다
(이모지 하나, `TownCharacter.jsx:105` `🧒` 고정, 좌우 반전조차 없음 —
`dir` 변수(TownScene.jsx:233)는 시작 오프셋 부호에만 쓰이고 스프라이트
좌우 반전(`transform: scaleX(-1)` 등)에는 쓰이지 않는다). Astra는 4방향
스프라이트 세트(또는 최소 좌/우 미러링 + front/back 2장)가 필요하다.

## 15. 설계 노트 — 클릭투무브/벤치앉기/장애물/walkable area/depth sorting

- **클릭-투-무브**: 기존 드래그 배치(`TownScene.jsx` `computeNearestAnchor`)
  의 "포인터 좌표 → 씬 % → 가장 가까운 유효 지점" 계산 패턴은 재사용
  가능하지만, 대상이 47개 이산 배치 앵커가 아니라 연속 walkable area가
  돼야 한다 — 새 지오메트리 자료구조 필요(예: walkable polygon/navmesh 또는
  간단한 grid-based path).
- **벤치 앉기**: 기존 상태 머신(idle→walking→sitting→leaving)을 그대로
  일반화해 "임의의 목표 지점까지 walking → 도착 시 상태 전환"으로 확장.
  `reducedMotion`일 때 walking을 건너뛰는 패턴(`usePrefersReducedMotion.js`)
  은 그대로 유지 권장.
- **장애물 회피**: 기존 코드에 전혀 없음(신규 설계 필요) — `LANDMARKS`
  (worldContract.js:54-62)와 `placementContract.js`의 `OBJECT_CLASSES`
  footprint(placementContract.js:31-39)를 장애물 박스의 출발점으로 재사용
  가능(반경 기반 배제는 이미 `LARGE_CLASS_EXCLUSION_ANCHORS`,
  placementContract.js:48-51 참고).
- **walkable area**: `REGIONS`(worldContract.js:29-45)가 이미 지역별
  바운딩 박스를 정의하지만 "발이 닿을 수 있는 영역"용으로 설계되지
  않았다(배치/잠금해제용) — 재해석하거나 새로 정의해야 함.
- **depth sorting**: §17 참고.

## 16. 배경/건물/캐릭터/장식 레이어 분리 방법

현재 이미 DOM 레이어 분리가 어느 정도 존재한다(`TownScene.jsx:486-531`
순서: Ground→Water→Path→Scenery→Ambient→Atmosphere→[backdrop]→Object→
[Character]→Fog→[PlacementOverlay]). 이 분리 원칙(파일당 단일 관심사)은
2.5D 프로토타입에도 유효하다 — 다만 캐릭터가 건물/오브젝트 "사이"를
지나다닐 수 있으려면(예: 나무 뒤로 지나가기) 정적 DOM 순서가 아니라 §17의
동적 Y-정렬이 캐릭터와 오브젝트를 같은 밴드에 넣어야 한다.

## 17. 권장 Y 기반 depth sorting 접근

`depthOrder.js`의 모델(전체 정독 완료, depthOrder.js:1-165)을 그대로
확장하는 것을 권장한다 — 이미 검증된 설계다: `Y_RANKED_LAYERS`
(architecture/scenery/objects/foregroundVegetation, depthOrder.js:97)가
"레이어 베이스값 차이(1단위)보다 y 기여분(0~900, `y*9`)이 항상 우선"
하도록 설계돼(depthOrder.js:32-47 설계 노트) 나무 뒤에 있는 건물, 건물
앞에 있는 동물이 자연스럽게 오클루전되는 것을 이미
`scripts/testTownDepthOrder.mjs`로 검증했다. Astra는 새 `'character'`
레이어를 이 `Y_RANKED_LAYERS` 세트에 추가하면 된다(현재 `CHARACTER_Z`가
정적 상수로 고정된 것과 달리, §13/14 요구사항상 캐릭터가 씬을 "돌아다니는"
이상 그때그때 y좌표로 재계산돼야 하므로 — 지금의 sceneZ.js 방식은 그대로
쓸 수 없다, 새로 만들 것). `depthKey()`/`compareDepth()`/`sortByDepth()`
(depthOrder.js:110-148)는 순수 함수라 그대로 import해 재사용 가능.

## 18. 데스크톱/모바일 좌표 정규화 접근

기존 접근(그대로 재사용 권장): 모든 배치/앵커 좌표는 픽셀이 아니라 0~100
퍼센트(`worldContract.js:24` `WORLD={w:100,h:190}`)로 저장되고, 렌더 시
`getBoundingClientRect()`로 실제 씬 박스 크기를 구해 픽셀로 환산한다
(`TownScene.jsx:290-307` `computeNearestAnchor`, `rect.width`/`rect.height`
곱셈). 씬 자체는 고정 종횡비(`SCENE_ASPECT_RATIO`)로 CSS `aspect-ratio`를
쓰고 `-mx-4 w-[calc(100%+2rem)]`로 화면 가장자리까지 채운다
(`TownScene.jsx:483-484`). 이 패턴은 데스크톱 마우스/모바일 터치 모두에서
동일하게 동작함이 이미 자동화 테스트(360/390/430px 뷰포트,
`noHorizontalOverflow`)로 검증돼 있다 — Astra가 캔버스/WebGL로 전환한다면
이 "0~100 world % 좌표, 실측 박스로 픽셀 환산"이라는 원칙 자체는 그대로
유지하는 것을 권장(저장 계약과의 호환성).

## 19. 기존 서버 계약을 깨지 않고 별도 프로토타입 구축하는 방법

1. §12의 별도 디렉터리 구조로 기존 V2 파일을 전혀 수정하지 않는다.
2. 프로토타입은 **자체 플래그**(예: `paulTownProto25d`, 기본 `false`)로
   게이팅한다 — 기존 `paulTownV1`/`paulTownV2`와 독립.
3. 프로토타입은 §24 비목표에 따라 **기존 구매/저장 API를 전혀 호출하지
   않는다** — 좌표계/깊이 모델만 재사용하고, 배치 데이터는 프로토타입
   자체의 임시 로컬 상태(마운트 스코프, 영속화 없음)로 둔다. 이러면
   `student_progress`/`star_purchases` 등 기존 프로덕션 데이터 경로를 만질
   방법 자체가 없다(구조적으로 안전).
4. 새 Supabase 테이블/컬럼이 필요해지는 시점(이번 범위 밖)이 오면
   CLAUDE.md 규칙 8/9/10(DDL 파일만 준비, 멱등성, GRANT 동반)을 그대로
   따른다.

## 20. 단계별 구현 계획과 단계별 완료 기준

| Phase | 내용 | 완료 기준 |
|---|---|---|
| 0 | 별도 디렉터리 스캐폴딩 + 자체 플래그(기본 OFF) + 빈 씬 렌더 | `npm run build` 통과, 플래그 OFF 시 네트워크/DOM 변화 0(기존 V1/V2와 동일 검증 패턴) |
| 1 | walkable area 정의 + 캐릭터 1개 정적 렌더(4방향 스프라이트 또는 임시 도형) | 캐릭터가 지정한 world 좌표에 올바른 scale로 그려짐(§17 depth 공식과 일치) |
| 2 | 클릭-투-워크(장애물 없이) | 클릭 지점까지 캐릭터가 걸어가고 방향 스프라이트가 이동 방향과 일치 |
| 3 | 벤치(또는 임의 오브젝트) walk-to-sit | §15 상태 머신 일반화, reduced-motion 시 walking 스킵 유지 |
| 4 | 장애물 회피 + Y 기반 오클루전(오브젝트 뒤로 지나가기) | 캐릭터가 나무/건물 뒤를 지날 때 자연스럽게 가려짐(depthOrder.js 확장 테스트로 검증) |
| 5(이번 범위 밖) | 기존 구매/저장 시스템과 실제 연결 | Astra의 다음 세션 — 이번 첫 작업 범위가 아님(§24) |

각 Phase는 완료 시 `.ai-status/`에 체크포인트를 남기고(CLAUDE.md 규칙 17),
Phase 단위로 소커밋한다(규칙 14).

## 21. 회귀 리스크와 반드시 보존해야 할 테스트

- 프로토타입이 기존 V2 파일을 import는 하되 수정하지 않으므로 구조적
  리스크는 낮다 — 그래도 매 Phase 종료 시 최소
  `node scripts/testTownV2Static.mjs`(빠름, 이 세션도 147/147 확인)와
  전체 `npm run build`는 돌릴 것.
- 절대 건드리면 안 되는 기존 계약: `townLayout.js`의 저장 좌표 스키마
  (§11 B "좌표계" 리스크), `star_purchases`/`student_progress` RLS,
  `api/grant-xp.js`의 studentId 신뢰 경계.
- 보존해야 할 기존 테스트: `tests/e2e/townV2.spec.mjs`(V2 전체 회귀),
  `tests/e2e/townV1.spec.mjs`/`townPilotAllowlist.spec.mjs`/
  `townFlagCrossTab.spec.mjs`(플래그 분기), `scripts/testTownV2Static.mjs`
  (정적 계약), `scripts/testTownDepthOrder.mjs`(depth 모델) — 프로토타입
  작업이 이들을 FAIL시키면 안 된다(별도 디렉터리라 구조적으로 안전해야
  하지만, `npm run verify:all` 등록 여부는 Astra가 새 테스트를 추가할 때
  같이 판단).

## 22. 프로덕션 데이터 보호 규칙(CLAUDE.md 저장소 헌법에서 발췌·적용)

- 학생 식별은 항상 `students.id`(UUID) — 이름 문자열 매칭 금지(규칙 4).
  프로토타입이 어떤 형태로든 학생을 식별해야 한다면(이번 범위에선 필요
  없음, §24) 반드시 UUID.
- PIN/자격증명 컬럼은 클라이언트가 절대 조회/로깅 금지(규칙 11) — 이번
  프로토타입은 인증 관련 코드를 전혀 건드리지 않으므로 해당 없음, 단
  향후 세션 연결 시 재확인할 것.
- 신규 Supabase 컬럼/테이블은 파일만 준비, DDL 직접 실행 금지(규칙 8),
  멱등성(규칙 9), `students` 컬럼 추가 시 GRANT 동반(규칙 10) — 이번
  Phase 0~4는 새 테이블이 전혀 필요 없다(§19-3).
- 학생 대상 신규 기능/UI/게임화는 "AI 개발 운영체제" 구축 범위에서
  절대 금지(규칙 12) — **이 프로토타입은 예외**(운영자가 명시적으로
  요청한 신기능 개발이지 그 규칙이 가리키는 개발-인프라 범위가 아님)
  이지만, Production 배포/플래그 기본값 변경은 여전히 범위 밖(§25).

## 23. Astra의 첫 세션 정확한 파일 읽기 순서

1. `CLAUDE.md`(저장소 헌법 18개 규칙) — 필수 선행.
2. 이 문서(`docs/design/town/ASTRA_HANDOFF_2026-09-21.md`) 전체.
3. `src/config/features.js`(110-113행 플래그 정의) — 실제 값 재확인.
4. `src/App.jsx:260-280`(V1/V2 분기) — 실제 코드 재확인.
5. `src/utils/town/worldContract.js` 전체 — 좌표계/월드 지오메트리.
6. `src/utils/town/depthOrder.js` 전체 — depth/z-index 모델(§17 확장 대상).
7. `src/utils/town/townLayout.js` 전체 — 저장 계약(건드리면 안 되는 부분).
8. `src/components/town/v2/TownScene.jsx` — 기존 상태 머신/드래그 패턴(참고용).
9. `src/components/town/v2/TownCharacter.jsx` — 임시 캐릭터 구현(교체 대상 원형).
10. `tests/e2e/townV2.spec.mjs`의 S21 섹션(3026-3170행경) — 기존 캐릭터
    테스트 패턴(재사용 가능한 mock/헬퍼 확인).
11. `DEVELOPER_GUIDE.md`의 Component/Hook 규칙, `TESTING.md` — 새 파일
    작성 전 규칙 확인.

## 24. Astra의 정확한 첫 작업 범위

**별도 2.5D 프로토타입(기존 V2와 분리된 새 디렉터리, 자체 플래그 OFF
기본)에 캐릭터 1명만 구현**: 클릭-투-워크, 벤치까지 걸어가 앉기, 장애물
회피, 위치 기반 scale과 front/back 오클루전(§17 Y 기반 depth 확장). 기존
구매/저장 시스템과는 **아직 연결하지 않는다**(§19-3 — 로컬 임시 상태만).
이는 팀장이 지정한 범위(원문 항목 24)와 일치하며, 이 세션의 조사 결과와도
모순되지 않는다 — 기존 코드 재사용 가능 부분(§11 분류표 A/B 항목: 좌표계
원칙·depth 모델·상태 머신 골격)이 이미 확인됐으므로 처음부터 새로 설계할
필요가 없는 부분과 정말 새로 만들어야 하는 부분(§11 C 항목: 렌더링 기술
자체, 캐릭터 아트, 다방향 스프라이트)이 명확히 갈린다.

## 25. 명시적 비목표

- 완전한 실시간 3D 전환 — 대상 아님, 2.5D(레이어드 스프라이트 + Y-정렬)로
  충분.
- 기존 아이템 아트 전면 교체 — 이번 범위는 캐릭터 1개, 기존 배치
  아이템(나무/벤치 등) 아트는 그대로.
- Production 배포 — 이 프로토타입은 새 플래그로 게이팅되고 기본 OFF,
  Production에 어떤 영향도 주면 안 됨.
- `paulTownV1`/`paulTownV2` 기본값 변경 — 이번 세션도, Astra의 첫 작업도
  변경 금지.
- PR #62 머지 또는 undraft — 이 PR은 계속 draft로 유지.

---

## 검증한 것(Phase 5)

- 이 문서가 인용한 모든 파일 경로/함수명/라인 번호는 작성 직후 재확인
  (Grep/Read 재실행)했다.
- 이 문서 어디에도 실제 학생 이름/PIN/이메일 등 개인정보나 시크릿이
  없다(테스트 픽스처 상수 `QA_STUDENT_NAME`/`QA_LOGIN_PIN`은 이름 그대로가
  아니라 식별자로만 인용, 값 자체를 문서에 옮기지 않았다).
- `git status --porcelain`은 이 문서 파일 1개 + `scripts/.tmp/`(gitignore
  대상, 커밋 안 됨) 외 아무것도 건드리지 않았음을 확인.
- 제품 코드/테스트/애니메이션을 재구현하거나 리팩터링하지 않았다.
- `npm run verify:e2e`/`npm run verify:all`은 이 작업 범위상 실행하지
  않았다(지시에 따름). 대신 `node scripts/testTownV2Static.mjs`(147/147
  PASS)와, §5.2의 임시 진단 스크립트(gitignore 대상)로 캐릭터 렌더링을
  직접 실측했다.
- Production DB write 0건, `.env` 미접근, `paulTownV2` 여전히 `false`
  (`src/config/features.js:112`) 확인.
