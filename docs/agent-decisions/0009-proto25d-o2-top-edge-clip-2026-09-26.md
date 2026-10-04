# 0009 — Paul Town 2.5D [O2] 상단 경계 스프라이트 잘림 수정 (협의체 결정 기록, IMPLEMENTED — PR #62 커밋)

- DECISION ID: 0009
- DATE: 2026-09-26
- TASK ID: o2-top-edge-clip
- TASK CLASS: B (운영자 요청으로 FULL COUNCIL REVIEW 적용 — Phase 3 라이브 드라이런, 2026-09-25)
- FEATURE / PROBLEM: `paulTown2_5d` 프로토타입에서 화면 상단 경계(world y≈4%)로 이동 시 캐릭터 스프라이트 위쪽이 뷰포트 밖으로 잘림(`docs/design/town/PROTO25D_PILOT_READINESS_2026-09-25.md` §2 [O2]).

## OWNER REQUEST

2026-09-26 운영자 승인: "O2 구현을 승인합니다. 권고안대로 진행." 범위: `walkGrid.js`에 `WORLD_MIN_Y` 추가, 목적지/이동 좌표 상단 clamp, 모든 지원 뷰포트에서 잘림 없음, 동적 계산 금지(사전 측정 기반 정적 상수), 이동·장애물 회피·벤치·depth·애니메이션 무변경, 수정 전후 측정 비교, 단위/E2E/build/verify:all, 데스크톱+모바일 360/390/412/1280 검증, 독립 코드리뷰+QA 통과 후에만 커밋·push, O2 외 확장 금지.

## CURRENT PRODUCT CONTEXT

`clampToWorldBounds`가 x/y 공용 여백 2%([WORLD_MIN, WORLD_MAX]=[2,98])로 목적지를 고정하고, 캐릭터는 발 기준 하단-중앙 앵커(`translate(-50%,-100%)`)라 y가 캐릭터 높이(world-% 환산)보다 작으면 위쪽이 잘린다. 격자 GRID_ROWS=76, CELL_H_PCT≈1.2632은 WORLD_MIN에 앵커링. 씬 오브젝트 최상단 y0=24. `pathfinding.js:163`의 경계 검사는 볼록성으로 안전(코드 리뷰 확인).

## CHILD EXPERIENCE POSITION (파도 1)

REVISE. y-min을 캐릭터 높이 기반으로 별도 계산. 위험: 상수 하나로 3뷰포트 보장 불가(실측 필요), E2E 기대값 갱신, 상단 장애물 접근성. 우려: 특정 기기에서만 재현되는 신뢰 문제.

## GAME DESIGN POSITION (파도 1)

SIMPLIFY. 상단 비대칭 여백 + 경계가 "마을 끝"으로 읽히는 시각 근거. 우려: 보이지 않는 벽. Simpler alternative: 여백만.

## ENGINEERING POSITION (파도 1)

SIMPLIFY. `walkGrid.js` 단일 파일, WORLD_MIN을 x/y로 분리. 동적 높이(DOM 의존)·컨테이너 패딩(영향 반경) 거부. 여백값 실측 필요.

## DEVIL'S ADVOCATE POSITION (파도 3)

OWNER_DECISION_REQUIRED. 최강 이의: 진입점도 없는 프리파일럿에서 아무도 겪지 않은 결함의 우선순위가 근거 없이 매겨짐. 숨은 가정: 학생에게 문제될 것, 상수 하나로 충분할 것. 더 작은 대안: 코드 변경 없이 실측만. 번복 기준: 운영자 우선순위 확정 + 4뷰포트 실측치(→ 2026-09-26 운영자 승인으로 충족).

## MATERIAL DISAGREEMENTS (파도 2)

- Eng→자기 정정: 격자 원점 이동은 전 행 매핑을 바꿈 → 격자 유지 + clamp y-floor + 상단 행 차단으로 축소.
- Eng→UX: 동적 계산은 DOM/px 결합·E2E 값 변동. Eng→Game: 아트 정렬은 별도 후속.
- UX→둘 다: 정적 상수는 작은 화면 잘림 또는 큰 화면 과잉 여백.
- Game→둘 다: 시각 단서 없이는 "이유 없이 멈추는 지점"이 남음.

## LOWEST-COMPLEXITY OPTION

격자 기하 유지. `WORLD_MIN_Y`(사전 측정 최악 뷰포트 기준, 행 경계로 스냅)를 `clampToWorldBounds` y 하한과 `isWalkableCell` 상단 차단에만 적용. x 여백 불변.

## RISKS

상수가 행 내부에 떨어지면 실효 하한이 다음 행으로 밀림(→ 스냅으로 제거). ceil 스냅이 최대 CELL_H_PCT만큼 올림(→ 사전 측정 원시 여백 ≤ 10−CELL_H_PCT≈8.74 가드). 테스트 71/230행이 옛 y=WORLD_MIN clamp를 부호화(→ 사유 명시 후 갱신).

## PRODUCT LEAD RESOLUTION (orchestrator, 1회)

SIMPLIFY(ACCEPT 변형). 동적 계산 REJECT(순수 함수 계약·E2E 결정성). 정적 상수를 최악 뷰포트 기준으로 채택, 여백 상한 10 world-%. 시각 단서 DEFER — "보이지 않는 벽"은 지금도 y=2에 존재하므로 새 혼란 종류가 아님. 우선순위 판단은 운영자 몫 → 2026-09-26 승인됨.

## ACCEPTANCE CRITERIA

- [x] 360x640 / 390x844 / 412x915 / 1280x800에서 화면 최상단 탭 후 캐릭터 bbox 전체가 뷰포트 안(top ≥ 컨테이너 top).
- [x] 상단 여백: 원시 측정 worst case 9.508%(1280x800)가 협의체 사전 상한(8.74/10)을 초과해 Product Lead가 운영자 지시(1280 포함 전 뷰포트, 최악 기준 정적 상수)에 따라 상한을 실측에 맞춤 → WORLD_MIN_Y = 12.105263(행 8 y0 스냅). 잠금 단언: `WORLD_MIN_Y === WORLD_MIN + 8×CELL_H_PCT`, `< 24`.
- [x] x 여백 2% 불변. 씬 오브젝트(최상단 y0=24) 무영향.
- [x] 이동·장애물 회피·벤치·depth·애니메이션 코드 무변경.
- [x] Proto25d 스위트·E2E S14/S15·build·verify:all 그린. 단언 갱신은 옛 y=WORLD_MIN clamp 부호화분에 한정, 사유 명시.
- [x] 수정 전/후 측정값 비교 기록(readiness 문서 §3).

## IMPLEMENTATION SCOPE

`src/utils/town/proto2_5d/walkGrid.js`(WORLD_MIN_Y 스냅 상수·유도 주석, clampToWorldBounds y 하한, isWalkableCell 상단 차단), `scripts/testProto25dWalkGrid.mjs`(71·230행 갱신 + 속성 단언 + ≤10 잠금, 로컬 EPS 1e-6), `scripts/testProto25dPathRandom.mjs`(차단 대역 시작점 결정적 케이스), `tests/e2e/townProto25d.spec.mjs`(상단 탭 시나리오, 뷰포트별 bbox 단언), `docs/design/town/PROTO25D_PILOT_READINESS_2026-09-25.md`(§3 측정 행).

## OUT OF SCOPE

`pathfinding.js`, `ProtoCharacter.jsx`, `sceneFixture.js`, `Proto25DScreen.jsx`, `benchInteraction.js`, 경계 아트, 동적 여백, HUD(O1), 학생 진입점.

## QA PLAN

`node scripts/testProto25dWalkGrid.mjs`(베이스라인 37/37), `testProto25dPathRandom.mjs`, `npm run build`, `npm run verify:all`, `npm run verify:e2e`(townProto25d 포함), 4뷰포트 측정 스크립트 전후 비교. 독립 코드리뷰 + qa-reviewer(PASS/FAIL_FIX_REQUIRED/BLOCKED) 통과 후에만 커밋.

## OWNER APPROVAL REQUIRED

YES — 2026-09-26 승인됨(구현 착수). 머지는 별도(PR #62, Class D).

## TASK ENVELOPE

```
REPO: C:\voca
WORKTREE: C:/Users/jinal/AppData/Local/Temp/claude/C--voca/d95369ce-02f1-41e7-9e92-41e2cb3ce37a/scratchpad/wt-clean-pr
BRANCH: feat/paul-town-v2-clean-pr
BASE_COMMIT: d0308b75
TASK_ID: o2-top-edge-clip
TASK_CLASS: B
ALLOWED_PATHS: 위 IMPLEMENTATION SCOPE 5개 + handoff.md, .ai-status/*.json, 이 ADR
```

## IMPLEMENTED-RESULT REVIEW

- 코드 리뷰(별도 에이전트): APPROVE, 결함 0(행 8 스냅 비트 동일, rows 0~7 차단, 숨은 결합 없음, E2E S16 비동어반복).
- QA(별도 에이전트): PASS — 단위 5스위트 직접 재실행(44/19/24/23/88), build 0 경고, verify:all ALL DOMAINS PASS, verify:e2e 1744/1744, S16 24/24, 봉투 준수. 기록: verify:all 내장 extra E2E에서 S12[1280x800] 3단언 간헐 FAIL(단독 실행 PASS, 무관 코드) — handoff 181차 §5.
- 측정 전/후: 잘림 16.91/12.84/11.41/60.06px → 0/0/0/0, 도착 y=12.1053(readiness §3.1).
- 수정 사이클: 계획 단계 2/2 사용(코드리뷰 1차 CHANGES_REQUIRED, QA 2차 BLOCK), 구현 단계 0/2.

## FINAL STATUS

ACCEPTED → IMPLEMENTED → VERIFIED (2026-09-26, PR #62 커밋·push; 머지는 운영자 Class D)
