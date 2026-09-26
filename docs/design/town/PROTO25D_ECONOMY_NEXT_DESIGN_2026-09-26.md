# Paul Town 2.5D — 경제 연결 다음 단계 설계 (코인·구매·인벤토리·배치·저장)

이 문서는 **설계 제안**이다. 이 세션에서는 코드/SQL/git 어떤 것도 건드리지
않았다 — 아래 전부 미구현, 착수 승인/우선순위 결정 아님. 목적은 산책
프로토타입(`Proto25DScreen.jsx`, ADR 0010) 이후 단계인 코인 표시·실제
구매·인벤토리·마을 배치·Supabase 저장/복원을 기존 시스템 재사용으로 설계하는
것이다. 새 테이블/새 화폐는 제안하지 않는다 — 갭이 있으면 최소 확장만
"운영자 승인 필요(Class D: DDL)"로 표시한다.

## 1. 현재 자산

- **화폐(Paul Dollar)**: `dollar_ledger`(원장, append-only) / `dollar_rules`
  (환산 화이트리스트, `rewardEngine.js` 학습 보상 12종만 시드,
  `legacy-baseline` 제외) / `dollar_balances`(VIEW, `security_invoker`, GRANT
  0, service_role 전용) — `supabase_v3_49_paul_dollar.sql`. **DATABASE.md의
  "미실행" 태그는 stale** — `handoff.md` 180차(§0)가 "v3_47~v3_50은 운영자가
  이미 적용·종결(127차 적용, 129차 POST 검증 PASS)"로 확정, 117차가 v3_49
  post-verify PASS를 별도 기록했다. 즉 테이블/트리거/RPC는 프로덕션에
  **이미 존재**하지만, 클라이언트 플래그 4개(`townShopV1`/`paulTownV1`/
  `paulTownV2`/`paulTown2_5d`, `src/config/features.js` 기본 `false`)가
  전부 OFF라 학생 화면은 아직 아무것도 호출하지 않는다.
- **상점 RPC**: `get_town_shop_state(uuid)`/`purchase_town_item(uuid, text)`
  — `SECURITY DEFINER`, `service_role`만 EXECUTE, 학생별 advisory lock으로
  직렬화. 클라이언트는 `api/grant-xp.js`의 기존 action을 통해서만 호출한다
  (세션 토큰 `sid`로 식별, `studentId`/가격/잔액은 클라이언트 비신뢰).
  구매 이력의 진실 원천은 `star_purchases`(레거시 별, v3_47, 보존)와
  `town_purchases`(폴달러, v3_49, unique `(student_id, item_id)`=
  idempotency)의 UNION.
- **훅**: `src/hooks/useTownShop.js` — 조회+구매 전용, 서버 응답을 메모리
  state로만 유지(소유권은 매번 서버 재조회). `enabled=false`면 fetch 0회.
- **카탈로그**: `src/utils/town/townCatalog.js` — `TOWN_ITEM_META`(16+1종,
  emoji/카테고리/최소레벨/정렬/에셋키 초안), `mergeCatalog()`가 항상 서버
  `town_items` 값(가격/활성여부)을 우선. import 0.
- **배치/인벤토리**: `src/utils/town/townLayout.js` — 순수 함수
  `placeItem`/`moveItem`/`storeItem`/`mergeTownLayout`, state shape
  `{ townPlacements: [{placementId,itemId,x,y,placedAt,updatedAt}],
  townRemovedIds: [] }`. `TOWN_GRID = 8×6`, `HOME_CELL` 배치 불가,
  `mergeTownLayout`은 `updatedAt` recency 기반 last-write-wins(2026-09-11
  P2, 기기 간 stale overwrite 재현·수정 이력 — 재구현 금지, 규칙 3).
- **저장 경로**: `townPlacements`/`townRemovedIds`는 `progress_data`의 기존
  필드(`diaryPlacements`와 동일 정신)라 `useStudent.js`가 이미 로드/병합/
  백업한다 — 2.5D 전용 새 fetch/저장 경로 없음.
- **2.5D가 지금 건드리지 않는 것**: `Proto25DScreen.jsx`는 순수 클라이언트
  상태 머신(걷기/충돌/벤치/depth/카메라)이고 네트워크 쓰기 0이다(ADR 0010).
  장애물은 `walkGrid.js`의 `OBSTACLES = deriveObstacles(SCENE_FIXTURE)` 데모
  3종(`demo-building`/`demo-bench`/`demo-tree`)뿐이고, 실제 학생 소유/배치
  데이터는 아직 연결돼 있지 않다(NEXT_STEPS §2, 0-C에서도 "미착수" 재확인).

## 2. 목표 플레이 흐름(다음 단계)

산책(현재 구현) → 가게 입장(신규 UI 진입점, 2.5D 씬 안 랜드마크 또는 기존
`TownShopPanel.jsx` 재사용) → 상품 구경(기존 카탈로그 그리드) → 코인으로
구매(기존 `purchase_town_item` 호출) → 인벤토리(기존 `townPlacements`
미배치 보유 목록) → 마을 배치(2.5D 좌표계에 놓기, §6) → 저장/복원(기존
progress 동기화, §7).

## 3. 코인 — Paul Dollar 재사용

- **잔액 출처**: `dollar_balances` 뷰가 아니라 항상 `get_town_shop_state`
  응답의 파생 필드를 쓴다 — 클라이언트가 뷰/원장을 직접 SELECT하는 경로는
  만들지 않는다(GRANT 0가 이미 구조적으로 막고 있음, 규칙 10 위반 아님).
- **적립 원천**: `dollar_rules` 화이트리스트의 학습 보상 12종
  (`rewardEngine.js`)뿐 — 학생 화면에 "폴달러를 직접 늘리는" 버튼/경로가
  없다(`PROJECT_PAUL_GOAL.md` "가짜 진행도 표시 금지"와 일치, 코인은 항상
  실제 학습 이벤트의 파생값).
- **채굴 금지**: 화면은 서버가 준 잔액만 표시하고, 구매 낙관적 UI
  (optimistic ownership)도 쓰지 않는다(§4).
- **파밍 방지**: `xp_ledger`가 이미 word-unit 파밍 버그를 "행동 단위"로
  막은 전례가 있다(v2.3.1) — `trg_reward_ledger_to_dollars`는
  `reward_ledger` insert에만 반응해 같은 방어가 자동 상속된다. 2.5D 씬
  자체(걷기/탭/벤치)는 `dollar_rules`에 없어 폴달러를 발생시키지 않는다
  — 새로 추가하지 않는다(§9).

## 4. 실제 구매 — Town Shop RPC 재사용

- RPC: `purchase_town_item(p_student_id uuid, p_item_id text)`
  (`supabase_v3_50_town_v1.sql`이 최신 본문 — 레벨 잠금 포함, 반환
  `{ok, reason, dollars_spent, balance_after}`). `api/grant-xp.js`의
  `purchase_town_item` action을 그대로 호출 — 새 Vercel 함수 파일 추가
  없음(12개 함수 한도 유지).
- **idempotency**: `town_purchases(student_id, item_id)` UNIQUE가 서버 측
  이중 처리 방지의 유일한 근거 — 클라이언트는 `useTownShop.js`의
  `purchasingRef`(즉시 확정적 ref 가드)로 연타만 막는다. 새 키 없음.
- **실패 UI**: `src/utils/town/townMessages.js`의 기존 문구 재사용 —
  `purchase_busy`/`purchase_failed`. 2.5D 전용 새 문구를 만들지 않는다.
- **낙관적 소유권 금지**: 구매 즉시 인벤토리에 그려 넣지 않는다 —
  `useTownShop.js`의 "소유권은 매 마운트/로그인마다 서버 재조회" 원칙대로
  응답 성공 후에만 반영.

## 5. 인벤토리 — Town V1 모델 재사용

- 인벤토리 = "소유했지만 `townPlacements`에 없는 아이템"(owned ∖ placed),
  `townLayout.js`가 이미 이 계산에 필요한 원자료(placements)를 들고
  있다 — 새 인벤토리 테이블/필드 없음.
- **2.5D 씬이 장애물을 파생하는 법(NEXT_STEPS §2.1, 읽기 전용)**:
  `useStudent.js`의 `rec.townPlacements`(이미 로드됨, 새 fetch 0회)를
  `placementContract.js`의 `CELLS`/`OBJECT_CLASSES` footprint 규칙과
  같은 정신으로 `{id, x0, x1, y0, y1}` 사각형으로 변환해
  `walkGrid.js`의 `OBSTACLES`(데모 3종)에 **합집합**으로 추가한다(교체
  아님 — 기존 회귀 테스트가 데모 픽스처에 의존).
  `placementContract.js`의 `footprintBox`는 비export이므로, 이 계산은
  `src/utils/town/proto2_5d/` 전용 순수 함수로 **복제**한다(V2 계약
  파일을 export 변경으로 건드리지 않는 격리 원칙, ASTRA §19).
- **읽기 전용 경계**: `shopState.owned`/`townPlacements`는 2.5D가 구독만
  하고 `placeItem`/`moveItem`/`storeItem`/`mergeTownLayout`/
  `star_purchases`/`student_progress` RLS/`useTownShop.js` 구매 리듀서는
  절대 건드리지 않는다(CLAUDE.md 규칙 3 + ASTRA §19-3 그대로 계승).

## 6. 마을 배치 — 2.5D 배치 UX 원칙

- **입력 방식**: 기존 Town V1 격자(8×6, 셀 탭)가 아니라 2.5D 월드 좌표
  (world-%, `placementContract.js`의 좌표 계약과 동일 축)에 배치하려면
  좌표계 변환이 필요하다 — 이번 설계는 "기존 8×6 그리드 배치 UI를 2.5D
  씬 위에서도 그대로 쓰되, 확정된 배치는 여전히 `townLayout.js` 셀
  좌표(x,y)로 저장"하는 쪽을 권장한다(새 좌표 스키마 발명 금지, 규칙 3).
- **모바일**: 기존 탭 타깃 44px 이상 원칙(월드 UI 전반의 기존 관례)을
  유지 — 신규 배치 핸들 크기를 별도로 축소하지 않는다.
- **충돌**: 배치 시도 셀이 `SCENE_FIXTURE`(데모 3종) 또는 다른
  `townPlacements` 항목과 겹치면 `townLayout.js`의 기존 `cell_occupied`/
  `out_of_bounds`/`home_cell` reason을 그대로 재사용해 실패 안내 —
  2.5D가 새 충돌 규칙을 만들지 않는다.
- **카메라**: ADR 0010의 월드 clamp(카메라가 월드 경계 밖을 노출하지
  않음)를 배치 모드에서도 유지 — 배치 UI가 카메라를 임의 이동시키지
  않는다(기존 lerp 추적과 별도 배치 전용 카메라 로직 금지, 단순성 유지).

## 7. Supabase 저장/복원

- 새 DDL 없이 기존 경로 재사용을 우선한다 — `townPlacements`/
  `townRemovedIds`는 이미 `progress_data`의 필드이므로 `useStudent.js`의
  기존 `fetchFullProgress`/백업 strict 동기화(다른 필드와 동일한 배치
  경로)가 그대로 커버한다. 2.5D 전용 새 컬럼/테이블은 제안하지 않는다.
- **GRANT/폴백(규칙 9/10) 점검**: 이번 설계가 기존 컬럼/테이블만 재사용
  하는 한 신규 GRANT 불필요. 만약 §6에서 "2.5D 좌표를 별도로 저장"하는
  방향으로 결정되면(비권장) 그건 `progress_data`(jsonb) 안의 새 키라
  스키마 마이그레이션 없이도 가능 — 다만 이 경우도 클라이언트는 부재
  시 빈 배열로 안전 폴백해야 한다(규칙 9와 동일한 원칙).
- **동시 기기 충돌**: `townLayout.js`의 `updatedAt` recency 병합을
  그대로 신뢰한다 — 2.5D가 별도 병합 전략을 만들 필요 없음.

## 8. 단계 분할(각 1 사이클, Class 표기, 승인 게이트)

| 단계 | 내용 | Class | 완료 기준 | 테스트 추가 |
|---|---|---|---|---|
| A | 잔액 표시(read-only) — `useTownShop.js`를 2.5D HUD에 연결, `enabled` 게이트 유지 | B(코드, DDL 없음) | 잔액이 HUD에 보이고 플래그 OFF 시 fetch 0회 | `testProto25dEconomyHud.mjs`(제안) |
| B | 구매(신규 서브플래그, 예: `paulTown2_5dShop`) — 기존 `TownShopPanel.jsx` 패턴을 2.5D 진입점에서 오픈 | B | 구매 성공/`insufficient`/`locked`/`busy` 4 케이스 UI 확인, 낙관적 소유권 없음 | 기존 `testTownShop*.mjs` 무회귀 + E2E 1개 |
| C | 인벤토리(보유∖배치 목록 표시) | B | 구매 직후 보관함에 노출, 새로고침 후에도 서버 재조회로 일치 | 신규 순수 단위 테스트(owned∖placed 계산) |
| D | 배치(§6, 씬 위 배치 UX) | B | 배치 성공 시 `walkGrid.js` 장애물에 반영(§5), 충돌/경계 reason 안내 | `testProto25dPlacedObstacles.mjs`(NEXT_STEPS §2a 제안 재사용) |
| E | 저장(§7, 기존 sync 경로 확인) | A(검증만, 코드 최소) | 기기 A 배치 → 기기 B 새로고침 후 반영, stale overwrite 없음 | 기존 `testTownLayoutIsolationStress45.mjs` 무회귀 재실행 |

각 단계는 이전 단계 완료·verify 확인 후에만 착수(CLAUDE.md 규칙 5). DDL이
필요해지는 시점(있다면)은 "운영자 승인 필요(Class D: DDL)"로 별도 표시.

## 9. 위험과 결정 필요 항목(운영자)

- **플래그 전략**: `paulTown2_5d`를 그대로 게이팅에 쓸지, 경제 기능만 별도
  서브플래그(`paulTown2_5dShop` 등)로 분리해 82명 산책 파일럿(NEXT_STEPS
  §3)과 독립적으로 롤아웃할지 — 분리를 권장하나 최종은 운영자 결정.
- **상점 RPC**: `purchase_town_item`(v3_50 최신 본문, 레벨 잠금 포함)이
  유일한 라이브 버전 — "레벨 잠금을 2.5D에서도 노출할지"만 UX 결정 필요.
- **파일럿 반**: §8 단계를 82명 산책 파일럿과 동일 집합에 먼저 노출할지,
  더 좁힐지.
- **아트 라이선스**: 카탈로그 아이템 렌더용 에셋이 필요하면 캐릭터
  스프라이트와 동일하게(§0-A 방침) 상용 라이선스 확인 후 진행 — 이 문서는
  아트 자체를 새로 제안하지 않는다.
- **파일럿 관찰 지표**: NEXT_STEPS §3.3이 지적한 "Production WRITE 0과
  다인원 지표 집계는 양립 불가" 문제가 경제 기능에도 그대로 적용된다 —
  구매/배치를 `trackEvent`로 남길지는 별도 운영자 승인 필요(기존 미해결
  항목 상속, 신규 결정 아님).

## 10. 이번 세션 선언 및 참고 문서

이번 세션은 순수 설계이며 코드/SQL/git 변경 0건이다. 참고: NEXT_STEPS
`docs/design/town/PROTO25D_NEXT_STEPS_2026-09-23.md`(§2, §3, 0-C), ADR
`docs/agent-decisions/0010-proto25d-walk-mode-v1-2026-09-26.md`,
`DATABASE.md`(town_items/star_purchases/dollar_rules/dollar_ledger/
town_purchases/dollar_balances, v3_47/49/50, "V3_49 CLOSED"), `handoff.md`
180차·117차·125차/129차, `ROADMAP.md` Paul Town 섹션,
`PROJECT_PAUL_GOAL.md`, `src/hooks/useTownShop.js`,
`src/utils/town/townCatalog.js`/`townLayout.js`/`townMessages.js`,
`src/utils/town/proto2_5d/sceneFixture.js`/`walkGrid.js`.
