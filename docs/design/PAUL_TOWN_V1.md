# Paul Town V1 — 설계 기록 (2026-09-11)

_브랜치 `feat/paul-town-v1`(`ab66332`+ 6커밋: `08e5ba8` 도메인 · `84e6664`
서버 · `6ec7df4` 서버 테스트 · `c5b65fe` SQL v3_50 · `21a2a61` 영속성/플래그 ·
`a8168d6` UI). 기능 플래그 `paulTownV1`(`src/config/features.js`) 기본
**false**, SQL `supabase_v3_50_town_v1.sql` **미실행**, PR **미머지**. 이
문서는 이번 라운드의 설계 산출물을 있는 그대로 기록한다 — 실행/배포/PR
결정은 전부 운영자 몫이다._

## 1. 목적

기존 Paul Town 별 상점(V1 이전, `townShopV1` 플래그, 책상 램프 1개만
판매)을 "마을을 실제로 꾸미는" 확장으로 넓힌다. 학생이 이미 갖고 있는
성취(⭐ 별, `reward_ledger`)를 사용 가능한 화폐(Paul Dollar, `dollar_ledger`,
v3_49)로 자연 전환해, 그 달러로 마을 아이템을 사서 8×6 격자에 배치하고
레벨이 올라가면 더 큰 건물이 열리는 흐름을 만드는 것이 목표다. 학생 대상
신규 게임화이므로 CLAUDE.md 규칙 12(이번 "AI 개발 운영체제 구축" 범위에서
학생 UI 신규 금지)는 이 기능 자체에는 적용되지 않는다 — Paul Town 계열은
2026-07-22부터 운영자 승인 하에 별도 트랙으로 이미 진행 중인 기존
게임화(`townShopV1`/`paulTownBuildings` 등)의 연장선이기 때문이다. 다만
새 화폐/새 결제 로직/Production 반영은 전부 0으로 유지했다(§8 안전 경계).

## 2. 게임 루프

```
STUDY(학습 행동)
  → reward_ledger 행 INSERT(⭐, 절대 감소 없음, 기존 12종 보상 경로 무변경)
  → trg_reward_ledger_to_dollars 트리거(v3_49, 이미 실행됨) → dollar_ledger 행(💵)
  → Town Shop에서 dollar_ledger 잔액(dollar_balances 뷰)으로 아이템 구매
  → purchase_town_item RPC(v3_49 본문 + v3_50 레벨 잠금 검사) → town_purchases 행
  → progress_data.townPlacements에 배치(로컬 우선, 클라우드 병합)
  → 마을 성장(레벨업 시 새 아이템 잠금 해제)
```

새 화폐는 0개(⭐/💵 기존 2종 그대로), 결제 로직 클라이언트 복제는 0개
(구매 여부/금액 판정은 전부 `purchase_town_item` RPC), `total_stars` 차감은
0(별은 이 라운드에서도 절대 감소하지 않음), Production DB WRITE/SQL 실행/
백필은 전부 0.

## 3. 스타 경제 — 총 별 vs Paul Dollar

| | 총 별(⭐) | Paul Dollar(💵) |
|---|---|---|
| 저장 위치 | `reward_totals.earned_stars`(서버 원장 파생, v3_47/v3_48/v3_49로 이미 확립) | `dollar_ledger`의 `SUM(dollars_delta)`(`dollar_balances` 뷰) |
| 증감 방향 | 오직 증가(성취 누적, 레벨 판정 기준) | 증가(보상 발생 시 트리거 자동 적립) + 감소(구매 시 `purchase_town_item`이 음수 delta INSERT) |
| 이 라운드 변경 | 0(v3_50은 `reward_ledger`/`reward_totals`를 전혀 건드리지 않음) | `grant_town_welcome_credit`(신규 함수, $20 웰컴)만 추가 — 실제 지급은 이중 게이트로 0건(§7) |
| 레벨 판정 | `town_level_for_stars(reward_totals.earned_stars)` — 별이 레벨을 결정 | 레벨과 무관, 오직 "얼마나 살 수 있는가"만 결정 |

즉 "레벨(잠김 해제 폭)은 별이 정하고, 실제 구매 가능 여부(잔액)는 달러가
정한다" — 두 축이 완전히 분리돼 있다(`purchase_town_item` 함수 본문의
잔액 계산이 `dollar_balances`만 참조하고 `reward_totals`/`total_stars`를
지출 판정에 전혀 쓰지 않음, `supabase_v3_50_town_v1.sql` 주석 5번 항목).

## 4. 데이터 모델

### 4-1. `town_items`(기존 v3_47/v3_49 테이블, v3_50이 컬럼 4개만 추가)

| 컬럼(v3_50 신규) | 타입 | 비고 |
|---|---|---|
| `category` | text | `house`/`nature`/`animal`/`decoration`/`special` — `src/utils/town/townCatalog.js`의 `TOWN_CATEGORIES`와 값 일치 |
| `sort_order` | smallint, not null default 0 | 카테고리 내 표시 순서 |
| `min_level` | smallint, not null default 1, CHECK 1~10 | 이 레벨 미만이면 `purchase_town_item`이 `locked` 반환 |
| `asset_key` | text | `src/assets/town/index.js` 폴더 매핑 키(예: `buildings/british-cottage`) — 실제 일러스트 자산이 없으면 이모지 폴백 |

신규 행 16개(가격/레벨은 §5 표) + 기존 `shop-lamp`(v3_47 시드, 가격 60
불변) 메타데이터만 갱신. `price`/`active`는 v3_50이 어떤 값도 SET하지
않는다(운영자가 대시보드에서 조정했을 수 있는 값 보존 원칙, v3_47/v3_49와
동일).

### 4-2. 신규 함수 2개(v3_50)

- **`town_level_for_stars(p_stars integer) returns integer`** — `language
  sql immutable`, 테이블 미참조 순수 계산. 임계값
  `[0,20,50,100,200,350,550,800,1100,1500]` → 레벨 1~10, null/음수는
  레벨 1. `service_role`만 EXECUTE(anon/authenticated 차단). 클라이언트
  `src/utils/town/townLevel.js`의 `TOWN_LEVELS`가 독립적으로 같은 값을
  복제하고 있고(두 파일은 서로 import하지 않음), 이 동등성은
  `scripts/testTownLevelLock.mjs`(53단언)와 `scripts/testTownV1Sql.mjs`
  (209단언, SQL 텍스트/townLevel.js/테스트 자체 하드코딩 3중 대조)가
  회귀로 고정한다.
- **`grant_town_welcome_credit(p_student_id uuid) returns table(granted
  boolean, balance_after integer)`** — `dollar_ledger`에 `event_type=
  'welcome:town-v1'`, `dollars_delta=20` 행을 `idempotency_key =
  '${student_id}:welcome:town-v1'` UNIQUE 제약(v3_49가 이미 만든 컬럼
  제약)으로 정확히 1회만 삽입. `service_role`만 EXECUTE. 이 마이그레이션
  자체는 어떤 학생에게도 지급하지 않는다(함수 정의만).

### 4-3. `purchase_town_item` 교체(v3_49 본문 + 레벨 잠금 1곳만 추가)

아이템 조회 직후·advisory lock 이전에 `town_level_for_stars(reward_totals.
earned_stars)`로 학생 레벨을 계산해 `min_level`보다 낮으면 `locked`을
반환하고(어떤 자원도 잠그지 않고 즉시 반환, `balance_after`는 실제 현재
잔액을 함께 돌려줌), 그 외 로직(`already_owned`/`insufficient`/원자적
2-INSERT/`unique_violation`→`already_owned`)은 v3_49와 **바이트 단위로
동일**하다.

## 5. 카탈로그(정책 초안 — DB가 진실)

16개 신규 + 기존 `shop-lamp` = 17개. 가격/레벨은 `supabase_v3_50_town_v1
.sql`과 `src/utils/town/townCatalog.js`(`TOWN_ITEM_META`) 양쪽에 동일하게
반영돼 있다(정책 확정 아님, NEEDS DECISION §11):

| 아이템 | 가격($) | 최소 레벨 | 카테고리 |
|---|---|---|---|
| tree | 10 | 1 | nature |
| bench | 15 | 1 | decoration |
| town-sign | 40 | 1 | decoration |
| british-cottage | 80 | 1 | house |
| cat | 20 | 2 | animal |
| street-lamp | 25 | 2 | decoration |
| red-post-box | 25 | 2 | decoration |
| flower-garden | 30 | 3 | nature |
| book-shop | 120 | 3 | house |
| puppy | 30 | 4 | animal |
| owl | 40 | 4 | animal |
| cafe | 120 | 5 | house |
| stone-fountain | 60 | 5 | decoration |
| bridge | 150 | 6 | special |
| english-school | 150 | 7 | special |
| clock-tower | 200 | 8 | special |
| shop-lamp(기존) | 60 | 1 | decoration |

레벨 임계값(`TOWN_LEVELS`, 별 총량 기준): `[0,20,50,100,200,350,550,800,
1100,1500]` → 레벨 1~10. 앞 5단계(0/20/50/100/200)는 `rewardEngine.js
LEVELS`(기존 학업 보상 레벨)와 의도적으로 동일 — 두 파일은 서로
import하지 않는 독립 복제이고, 드리프트는 `testTownLevelLock.mjs`가 잡는다
(`src/utils/town/townLevel.js` 헤더 주석).

## 6. 구매 트랜잭션 · 멱등

`purchase_town_item(p_student_id, p_item_id)` 단일 함수 호출이 전체
트랜잭션이다 — 학생 존재 확인 → 아이템/가격/화폐/`min_level` 조회 →
`dollars` 화폐가 아니면 거부 → **레벨 잠금 검사(v3_50 신규)** → 학생별
advisory lock(`pg_advisory_xact_lock`, 더블클릭/재시도 경합을 학생 단위로
직렬화) → 잔액 조회(`dollar_balances` 뷰만 신뢰) → 이미 보유(레거시
`star_purchases` 또는 `town_purchases`, 화폐 무관) 시 `already_owned` →
잔액 부족 시 `insufficient` → 실제 차감(`town_purchases` INSERT +
`dollar_ledger` 음수 INSERT, 같은 트랜잭션) → `unique_violation`이면
`already_owned`로 흡수. 응답 shape은 v3_49와 동일(`ok, reason,
dollars_spent, balance_after`) — `locked`이 새 `reason` 값으로 추가된
것 외에는 기존 계약을 조금도 바꾸지 않는다.

## 7. 웰컴 크레딧 — 이중 게이트로 이 PR은 지급 0건

신규 학생에게 $20을 정확히 1회 지급하는 흐름(`api/grant-xp.js`의 신규
action `claim_town_welcome` → `grant_town_welcome_credit` RPC)이지만, 이번
라운드는 아래 두 게이트를 **둘 다** 열지 않은 채로 코드/SQL만 준비한다:

1. 클라이언트 — `paulTownV1` 기능 플래그가 `false`라 UI 자체가 이 액션을
   호출하지 않는다.
2. 서버 — `api/grant-xp.js`가 `process.env.TOWN_V1_WELCOME_ENABLED ===
   '1'`이 아니면 RPC 호출 자체를 하지 않고 `disabled`를 반환한다(환경
   변수 미설정 상태 = 항상 이 분기).

두 게이트 중 하나만 열려도 나머지가 막으므로, 이 PR이 그대로 배포돼도
Production에서 실제 지급은 0건이다. 클라이언트는 `postTownWelcomeClaim`
(`src/utils/wordLibrary.js`)으로 이 액션을 호출하고, `useStudent.js`가
`townPlacements`/`townRemovedIds`와 함께 세션 토큰 재사용 + 네트워크 실패
흡수(fire-and-forget과 유사하되 결과를 반영)로 배선돼 있다.

## 8. 레이아웃 — 8×6 격자

`src/utils/town/townLayout.js`(import 0, `useStudent.js`의 `diaryPlacements`
tombstone 병합 패턴을 그대로 재사용): 8열×6행 고정 격자, `HOME_CELL =
(3,2)`는 "My House"가 항상 차지하는 고정 칸(구매/배치/이동 대상에서
제외). 이번 V1은 아이템당 배치 1개만 허용(`already_placed` 거부).
`placeItem`/`moveItem`/`storeItem` 5가지 실패 사유(`not_owned`/
`out_of_bounds`/`home_cell`/`already_placed`/`cell_occupied`)를 갖고,
`mergeTownLayout`은 `placementId` 기준 union + 충돌 시 로컬 우선 +
tombstone union(클라우드의 살아있는 배치까지 제거 가능, `diaryPlacements`
와 동일 정신) + 상한 300 + `cloud` null 방어. `visiblePlacements`는
미소유 아이템을 절대 표시하지 않는다. 학생 UUID로 완전히 격리되며
(동명이인 두 계정도 독립 레이아웃), `crypto.randomUUID` 기반
`placementId`가 45명 시뮬레이션에서 충돌 0건임을
`testTownLayout.mjs`/`testTownPlacementsPersistence.mjs`가 확인했다.

## 9. 레벨 · 잠금

레벨은 오직 별(`reward_totals.earned_stars`) 총량으로만 결정되고, 서버
(`purchase_town_item`)가 최종 권위다 — 클라이언트 `townLevel.js`는 표시용
계산이며 실제 잠금 판정은 항상 서버가 다시 한다(레벨 표시-잠금 값이
어긋나도 보안 문제는 아니고 UX 버그로만 남는다, SQL 헤더 "실행 순서 참고"
절). `TOWN_LEVEL_UNLOCKS`는 레벨 1/3/5/8에만 문구가 있는 표시 전용
상수(레벨 2/4/6/7/9/10은 잠금 해제 안내 문구 없음 — 아이템 자체는 여전히
`min_level`로 정상 잠금 해제됨).

## 10. Paul 통합 · 브랜드

Paul 캐릭터는 **기존 21종 에셋만** 사용한다(`HeroReaction` +
`getReactionById`/`paulReactions.js`의 `hello`/`ponder`/`great`/`almost`/
`study`/`levelup`/`lets_learn`/`happy` — 신규 Paul 이미지 0장, 컴포넌트당
1회만 렌더). 브랜드 문구는 `TOWN_PHRASES` 5종을 화면당 최대 1개만
노출하고, 팔레트(navy/gold/burgundy/cream/warm-amber/green)는 전부 CSS
그라데이션으로 구현한다(이미지 자산 0장). `testTownUiStatic.mjs`가 이
두 제약(Paul 새 이미지 0/`<img paul>` 0, 문구 파일당 최대 1회)을 소스
정규식으로 고정한다.

## 11. 자산 구조

`src/assets/town/{backgrounds,buildings,decorations,nature,animals,special,
ui}/` 7개 폴더 + `src/assets/town/index.js`(assetKey → 실제 파일 매핑,
현재 비어 있음 → 폴백은 이모지). 최종 일러스트가 준비되면 `index.js`에만
매핑을 추가하면 되고, `town_items.asset_key`/`TOWN_ITEM_META.assetKey`는
이미 값이 채워져 있어 자산 교체가 카탈로그/SQL 변경 없이 `index.js` 한
파일로 끝난다.

## 12. 모바일 · 성능

`TownScreen.jsx`는 `App.jsx`에서 `React.lazy` + `Suspense`로 별도 청크
분리돼 있다 — `paulTownV1` 플래그가 꺼져 있으면(현재 기본값) 이 청크
자체가 로드되지 않는다(네트워크/번들 영향 0). 주요 CTA(구매/사기/취소/
마을에 놓기/위치 옮기기/이동/보관/탭)는 전부 `min-h-[44px]` 이상,
에셋 `<img>`는 `loading="lazy" decoding="async"`가 붙어 있다
(`testTownUiStatic.mjs`가 소스 정규식으로 고정).

## 13. 45명 격리

`townPlacements`/`townRemovedIds`는 `progress_data`의 학생별 필드라
기존 진행 레코드와 동일하게 `students.id`(UUID)로만 격리된다(이름 매칭
금지, CLAUDE.md 규칙 4). `testTownV1Server.mjs`가 동시성 매트릭스 N=5/10/
20/45명 규모로 웰컴(N건 정확히)·구매(2N건 정확히)·잔액 일치·교차오염
0을 확인했고, `testTownPlacementsPersistence.mjs`도 45명×3배치=135건
합계로 `placementId` 전역 유일·교차오염 0을 확인했다(둘 다 인메모리
시뮬레이션 — 실제 v3_50 SQL은 미실행 상태이므로 이 보장은 "코드가
서술하는 계약"이고, 실제 Postgres 트랜잭션/advisory lock 동시성은
운영자가 SQL을 실행한 뒤에만 최종 확인 가능하다, TESTING.md 기존
관례와 동일한 정직한 경계).

## 14. V2 후보(미구현, 설계만)

- Class Town(반 단위 공용 마을)
- 시즌제 마을 이벤트(House/Ticket 시즌 리셋과 유사한 경계 설계 필요)
- 배지(마을 완성도 기반 수집형 보상)
- 친구 마을 방문(읽기 전용 열람) — 개인정보/이름 노출 정책 재검토 필요

## 15. 결정 대기(NEEDS DECISION)

1. 위 §5 가격표 확정(현재는 정책 초안).
2. 웰컴 금액 $20 확정.
3. `dollar_rules` 적립 rate(사용 가능 별 적립 ~6~15/일 추정치) 유지 여부.
4. 실제 일러스트 자산 제작 — 현재는 전부 이모지 폴백, `asset_key`만
   준비돼 있음.
5. 기능 플래그 `paulTownV1` ON 시점(예: Pilot A 기기부터 단계적 적용).
6. 서버 env `TOWN_V1_WELCOME_ENABLED` 설정 시점(§7).
7. `supabase_v3_50_town_v1.sql` 실행 시점 — 운영자가 Supabase 대시보드
   SQL Editor에서 수동 실행(CLAUDE.md 규칙 8), `supabase_v3_49_paul_dollar
   .sql`(이미 2026-09-09 실행 완료) 이후 아무 때나 안전.

## 참고 파일

- 도메인: `src/utils/town/{townCatalog,townLevel,townLayout,townMessages}.js`
- UI: `src/components/town/{TownScreen,TownGrid,TownShopPanel,TownInventory,
  TownHeader}.jsx`, `src/assets/town/index.js`
- 배선: `src/App.jsx`(`screen==='town'`, `React.lazy`, `paulTownV1Enabled`
  게이트), `src/components/PaulTown.jsx`(`onGoTown` 카드),
  `src/hooks/useStudent.js`(`townPlacements`/`townRemovedIds`/place·move·
  store), `src/hooks/useTownShop.js`(레벨/`claimWelcome`),
  `src/utils/wordLibrary.js`(`postTownWelcomeClaim`), `src/config/features.js`
  (`paulTownV1: false`)
- 서버: `api/grant-xp.js`(`get_town_shop_state` 3단 컬럼 폴백 + `level`
  응답 필드, `claim_town_welcome` 액션 + `TOWN_V1_WELCOME_ENABLED` 서버
  게이트)
- SQL: `supabase_v3_50_town_v1.sql` / `_ROLLBACK.sql` / `_POST_VERIFY.sql`
- 테스트: `scripts/testTownCatalog.mjs`(50) · `testTownLayout.mjs`(64) ·
  `testTownLevelLock.mjs`(53) · `testTownV1Sql.mjs`(209) ·
  `testTownV1Server.mjs`(87) · `testTownPlacementsPersistence.mjs`(65) ·
  `testTownUiStatic.mjs`(70) — 전부 `tests/harness/registry.mjs`
  `extra: false`(required)
