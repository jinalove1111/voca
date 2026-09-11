# Paul Town 이코노미 감사 — 2026-09-11

_설계/감사 문서. 코드·SQL·`handoff.md` 실측만 반영했고, 이 문서 자체는
어떤 코드/설정/SQL도 변경하지 않는다. §9 권장안은 **미적용(NEEDS
DECISION)** — 운영자 승인 없이 구현 착수 금지(`CLAUDE.md` 규칙 3, 14)._

## 0. 정정(2026-09-11 오후) — 전제 오류: 서버 원장 도달 유형은 6종이 아니라 12종

정정 근거: 커밋 `52db9e4`(2026-09-06, "feat(reward): 레거시 별 지급 6경로
서버 원장 기록 + 재시도 큐")로 `src/hooks/useStudent.js:1042-1045`의
`grantReward()`가 레거시 6종(pronunciation/mission-clear/
daily-mission-bonus/spelling-combo/sticker-duplicate/matchgame —
`LEGACY_REWARD_TYPES`, `src/utils/rewardEngine.js:68-71`)에 대해서도
`parseLegacyDedupKey(dedupKey)` → `postRewardEvent(...)`를 호출하도록
이미 바뀌어 있고, `api/grant-xp.js`는 `isValidRewardType`을 통과하는
모든 `reward_type`(13개 `REWARD_STARS` 키 중 `legacy-baseline` 1개만
제외한 12개)을 허용한다. 즉 **아래 §3의 "6종만 서버 원장 도달" 전제는
틀렸다** — 12종 전부가 `reward_ledger` → `trg_reward_ledger_to_dollars`
(12종 전 유형 rate=1)를 거쳐 폴달러로 도달한다. §3/§5/§7/§8/§9는 이
정정 이전 전제로 작성된 것이라 제목에 "(구 전제 — 0절 정정 참고)"를
붙여 남겨 두되 삭제하지 않는다(`CLAUDE.md` 규칙 13, append-only).

### 0.1 재계산된 일일 Paul Dollar 획득(실측 상수 기준,
`scripts/testTownEconomySim.mjs`)

| 시나리오 | PD/일 |
|---|---|
| 평범(typical) | **36** |
| 열심(active/hard) | **75** |
| 매우많이(theoretical max, 상시 재현 가능한 값 아님) | **186** |

(구 전제: §5 "전형 6 PD / 활발 ≈12 PD / 최대(이론상) ≈77 PD" — 6종만
서버 반영된다는 잘못된 전제로 계산돼 전부 과소평가됐다.)

### 0.2 재계산된 가격대별 소요일(웰컴 20 PD 있음/없음, 36·75 PD/일)

`days = ceil(max(0, 가격−웰컴)/일일PD)`.

| 가격(PD) | 웰컴 없음 36/일 | 웰컴 없음 75/일 | 웰컴 20 포함 36/일 | 웰컴 20 포함 75/일 |
|---|---|---|---|---|
| 10 | 1일 | 1일 | 즉시(0일) | 즉시(0일) |
| 20 | 1일 | 1일 | 즉시(0일) | 즉시(0일) |
| 30 | 1일 | 1일 | 1일 | 1일 |
| 50 | 2일 | 1일 | 1일 | 1일 |
| 80 | 3일 | 2일 | 2일 | 1일 |
| 120 | 4일 | 2일 | 3일 | 2일 |
| 150 | 5일 | 2일 | 4일 | 2일 |
| 200 | 6일 | 3일 | 5일 | 3일 |

참고: §6 아이템 17종 중 L1~L3 소속 9종의 가격 합(tree 10 + bench 15 +
shop-lamp 60 + town-sign 40 + british-cottage 80 + cat 20 +
street-lamp 25 + red-post-box 25 + flower-garden 30 + book-shop 120 =
**425 PD**)은 열심 75 PD/일 기준 ≈6일(425/75=5.67→6), 평범 36 PD/일
기준 ≈12일(425/36=11.8→12)이면 전부 구매 가능하다. clock-tower
(200 PD, L8)조차 잔액만 보면 평범 6일 / 열심 3일이면 충당된다(레벨
게이트는 별개 축, 0.3 참고).

### 0.3 재계산된 레벨 도달 소요일(`reward_totals.earned_stars`, 신규
학생 기준 — 이제 12종 전부가 이 값에 반영되므로 일일 PD 획득 속도와
동일 속도로 별도 쌓인다)

| 레벨(임계 ★) | 평범 36/일 | 열심 75/일 | 매우많이 186/일 |
|---|---|---|---|
| L2(20) | 1일 | 1일 | 1일 |
| L3(50) | 2일 | 1일 | 1일 |
| L4(100) | 3일 | 2일 | 1일 |
| L5(200) | 6일 | 3일 | 2일 |
| L6(350) | 10일 | 5일 | 2일 |
| L7(550) | 16일 | 8일 | 3일 |
| L8(800) | 23일 | 11일 | 5일 |

(구 전제: §8 "L8 134일(전형)/67일(활발)" — 실제로는 23일/11일이라,
초등 파일럿 학기 안에 신규 학생도 충분히 도달 가능하다.)

### 0.4 정정된 밸런스 판정

- **L1~L3(가격 10~120 PD대)** — TOO CHEAP~GOOD. 웰컴 20을 포함하면
  tree(10)·cat/street-lamp/red-post-box(20)는 첫 방문 즉시 구매되고,
  L1~L3 9종 가격 합(425 PD)조차 열심 기준 6일·평범 기준 12일이면 전부
  소진 가능하다 — "며칠 안에 저가~중가 카탈로그를 다 사버리는" 구조라
  장기 동기부여 루프로는 GOOD보다 TOO CHEAP 쪽에 더 가깝다.
- **L5~L8(임계 200~800★, 가격 60~200 PD대)** — GOOD(평범 기준),
  fast(열심 기준). 레벨 게이트는 평범 6~23일·열심 3~11일로 파일럿
  학기 안에 도달 가능해 GOOD이지만, clock-tower(200, L8)가 레벨
  도달과 거의 같은 시점(평범 6일/열심 3일)에 잔액도 충당되므로
  열심 사용자에게는 "레벨업 성취감"과 "가격 부담 해소"가 동시에 와서
  사실상 too fast로 체감될 수 있다.
- 이전 판정("L6~L8 TOO SLOW for 초등 저학년 파일럿", 구 §8)은
  **역전된다** — 실제 병목은 "너무 느림"이 아니라 "너무 빠르게 다
  살 수 있음"이다.

### 0.5 추가 리스크 — 기존 재학생의 선(先)적립분

v3_49 트리거는 2026-09-08부터 프로덕션에 라이브였다. 즉 기존
재학생은 그 이후 매일 평범 36~열심 75 PD가 실제로 누적돼 왔을 수
있다. Pilot A 대상 5명(예지 `1c585815-...`·Cherry `bf05032a-...`·
이동훈 `80700290-...`·신지율 `a31037a3-...`·Lucas `17eafbbe-...`)이
현재 몇 PD를 보유했는지는 **운영자 확인 필요(NEEDS DECISION)** —
`paulTownV1` 플래그를 켜기 전에 `production_pilot_student_diagnostic
.sql` 3번째 블록(`dollar_balances`)으로 5명 잔액을 먼저 조회해야
한다. 이미 수백 PD가 쌓여 있다면 웰컴 20 PD는 사실상 무의미하고,
파일럿 첫날 카탈로그 상당 부분을 즉시 구매 가능한 상태일 수 있다.

### 0.6 레벨(★)에 대한 별도 주의 — 레거시 baseline

기존 학생의 `reward_totals.earned_stars`에는 `legacy-baseline`(⭐만
있고 애초에 PD 미전환 대상, §4 참고)이 이미 포함돼 있어 다수가
L8~L10 구간이다 — 이는 0.3의 "신규 학생" 표와는 별개다. 신규 학생은
0.3처럼 평범 36 PD/일 기준으로 L8까지 23일이 걸린다.

### 0.7 옵션 A~D — 미적용, 운영자 결정 필요(NEEDS DECISION)

- **옵션 A — 가격 인상(×3~5)**: `town_items.price`만 DB에서 조정
  (예: tree 10→30~50, clock-tower 200→600~1000, 운영자 승인 후 신규
  `supabase_v3_5X_town_price_rebalance.sql`). 레벨 게이트(min_level)는
  그대로 유지, 코드 배포 불필요.
- **옵션 B — 적립률 인하**: 고빈도 유형(pronunciation/mission-clear/
  spelling-combo 등)의 `dollar_rules.dollars_per_star`를 0 또는
  소수(예: 0.2~0.5)로 낮춘다 — 별(⭐, 레벨) 적립 속도에는 영향 없이
  폴달러 적립만 완화. DB 데이터 UPDATE만, 코드 배포 불필요.
- **옵션 C — 현행 유지 + 데이터 관찰**: Pilot A 실사용 데이터(0.5의
  진단 SQL 포함)를 먼저 확인한 뒤 재조정 여부를 결정.
- **옵션 D — A+B 동시 적용**: 가격 인상과 적립률 인하를 함께 적용해
  루프 길이를 이중으로 늘린다.

네 옵션 모두 **이 문서에서 구현하지 않는다** — 운영자 승인 후 별도
세션(SQL 데이터 UPDATE만, 코드 변경 0)에서 적용한다.

## 1. 목적과 범위

Paul Town V1(`docs/design/PAUL_TOWN_V1.md`, 플래그 `paulTownV1` 기본 OFF,
`supabase_v3_50_town_v1.sql` 미실행)의 화폐 흐름(⭐ → 💵 → 아이템)이
초등 저학년 파일럿 규모(현재 111명 실사용, `PROJECT_GUIDE.md`)에서
"너무 쉬움/너무 어려움" 어느 쪽으로도 치우치지 않는지 정량 검증한다.
결론은 §8 밸런스 평가 + §9 권장 옵션(미적용) 두 절에 있다.

## 2. 이코노미 파이프라인(실측)

```
학습 이벤트(6종만 서버 반영, §3)
  → grantLedgerReward()                      src/hooks/useStudent.js:1091
  → api/grant-xp.js  req.body.ledger==='reward' 분기   api/grant-xp.js:349
  → reward_ledger INSERT (idempotency_key UNIQUE)
  → trigger trg_reward_ledger_to_dollars      supabase_v3_49_paul_dollar.sql:243-244
      (dollar_rules에서 reward_type별 dollars_per_star 조회, 전부 rate=1)
  → dollar_ledger INSERT (idempotency_key = reward_ledger.idempotency_key || ':dollar')
  → view dollar_balances (SUM(dollars_delta))
  → RPC get_town_shop_state(p_student_id)     supabase_v3_49_paul_dollar.sql:304
  → Town Shop UI (TownShopPanel.jsx)
  → RPC purchase_town_item(p_student_id, p_item_id)  supabase_v3_50_town_v1.sql:170-276
      (pg_advisory_xact_lock, unique(student_id,item_id) 재구매 차단,
       min_level 검사 v3_50 추가분, 잔액 검사)
  → town_purchases INSERT + dollar_ledger 음수 delta INSERT
```

레벨(잠금 해제 폭)과 잔액(구매 가능 여부)은 완전히 분리된 두 축이다 —
레벨은 `reward_totals.earned_stars`(⭐ 누적, 감소 없음)로만 정해지고,
잔액은 `dollar_balances`(💵, 구매 시 감소)로만 정해진다
(`docs/design/PAUL_TOWN_V1.md` §3).

## 3. (구 전제 — 0절 정정 참고) 보상 타입 12종 — 서버 원장 도달 여부

`dollar_rules`는 12개 `reward_type` 전부에 `dollars_per_star=1,
active=true`를 시드하지만(`supabase_v3_49_paul_dollar.sql:127-140`),
실제로 서버 `reward_ledger`까지 도달하는(=폴달러로 전환되는) 것은 클라
이언트가 `grantLedgerReward()`를 호출하는 6종뿐이다. 나머지 6종은
`grantReward()`(로컬 전용, 서버 미기록)만 호출하므로 rate=1이 시드돼
있어도 실제 적립은 0이다 — **이것은 버그가 아니라 현재 구조의 사실**이다
(§3 하단 참고).

| # | reward_type | 클라이언트 함수(파일:라인) | 규칙(별 → PD) | 일일 상한 |
|---|---|---|---|---|
| 1 | `word-session-complete` | `grantLedgerReward` — useStudent.js:1445 | 1★/일 → 1 PD | 1/일 |
| 2 | `writing-complete` | `grantLedgerReward` — useStudent.js:1796 | 2★/일 → 2 PD | 1/일 |
| 3 | `daily-goal-complete` | `grantLedgerReward` — useStudent.js:1515 | 3★/일 → 3 PD | 1/일 |
| 4 | `streak-bonus` | `grantLedgerReward` — useStudent.js:1583 | 연속 3/5/7일차 2/3/5★ → 동일 PD | 1/일(cap) |
| 5 | `wrong-word-recovered` | `grantLedgerReward` — useStudent.js:1830, 1869 | 복구 단어당 1★ → 1 PD | 60/일 |
| 6 | `exam-complete` | `grantLedgerReward` — useStudent.js:1886 | 입학테스트당 2★ → 2 PD | 10/일 |
| 7 | `pronunciation` | `grantReward`(로컬) — useStudent.js:1320, 1322 | — | **0 PD(서버 미도달)** |
| 8 | `mission-clear` | `grantReward`(로컬) — useStudent.js:1253 | — | **0 PD** |
| 9 | `daily-mission-bonus` | `grantReward`(로컬) — useStudent.js:1497 | — | **0 PD** |
| 10 | `spelling-combo` | `grantReward`(로컬) — useStudent.js:1841 | — | **0 PD** |
| 11 | `sticker-duplicate` | `grantReward`(로컬) — useStudent.js:1356 | — | **0 PD** |
| 12 | `matchgame` | `grantReward`(로컬, MatchGameShell.jsx 계열) | — | **0 PD** |

구조적 함의: 학생이 체감하는 "총 별"(⭐, 레벨 판정)은 12종 전부를 반영
하지만, 실제 쓸 수 있는 "폴달러"(💵, 구매력)는 6종만 반영한다. 즉 레벨은
빨리 오르는데 지갑은 그만큼 안 차는 구조가 이미 내장돼 있다(신규
학생일수록 이 갭이 작고, §6에서 보듯 레거시 학생일수록 이 갭이 커진다).

## 4. 프로덕션 참고 수치(2026-09-09, 117차 post-verify, `handoff.md:838`)

- `reward_ledger` 509행 / 33,160★ 중 `legacy-baseline` 156행 / 32,642★
  (v1/v2/v3_37/v3_48 소급분, `dollar_rules`에 의도적으로 없어 폴달러
  미전환 — `supabase_v3_49_paul_dollar.sql:37`).
- 비(非)레거시(실제 서버 반영 보상) 순수분 = 509−156 = **353행 /
  33,160−32,642 = 518★**, 약 3주(2026-09-09 시점 기준 v3_49 적립 시작
  이후 경과) 누적 — 이번 감사의 "일일 PD" 추정치(§5)와 자릿수가 맞는
  참고선이다.

## 5. (구 전제 — 0절 정정 참고) 일일 Paul Dollar 획득 추정

| 시나리오 | 구성 | 추정 PD/일 |
|---|---|---|
| 전형(typical) | word-session 1 + writing 2 + daily-goal 3 | **6 PD** |
| 활발(active) | 전형 6 + wrong-word 복구 3건(3) + 입학테스트일 2 + streak 평균 1.4 | **≈12 PD** |
| 최대(이론상, 상시 아님) | wrong-word 상한 60 + 입학테스트 3건(6) + 전형 6 + streak 5 | **≈77 PD** |

최대치는 하루 60개 오답 복구 + 시험 3회가 동시에 겹치는 극단 가정으로,
상시 재현 가능한 값이 아니다. §6~§8 판단은 6 PD(전형)와 12 PD(활발) 두
기준선으로만 한다.

## 6. 마을 레벨 임계값과 아이템 가격/최소레벨(실측)

레벨 임계값(`src/utils/town/townLevel.js:10-21`, `reward_totals
.earned_stars` 기준 — **레거시 158,642★ 포함**이므로 기존 학생은 이미
높은 레벨이고, 신규 학생만 서버 원장 누적치≈PD 누적치와 비슷한 속도로
레벨이 오른다):

`TOWN_LEVELS = [L1:0, L2:20, L3:50, L4:100, L5:200, L6:350, L7:550,
L8:800, L9:1100, L10:1500]`

아이템 17종(가격/최소레벨, `supabase_v3_50_town_v1.sql:101-116` 신규
16종 + 기존 `shop-lamp` v3_47 시드 60/L1, 129행 갱신):

| 아이템 | 가격(PD) | min_level |
|---|---|---|
| tree | 10 | L1 |
| bench | 15 | L1 |
| shop-lamp | 60 | L1 |
| town-sign | 40 | L1 |
| british-cottage | 80 | L1 |
| cat | 20 | L2 |
| street-lamp | 25 | L2 |
| red-post-box | 25 | L2 |
| flower-garden | 30 | L3 |
| book-shop | 120 | L3 |
| puppy | 30 | L4 |
| owl | 40 | L4 |
| cafe | 120 | L5 |
| stone-fountain | 60 | L5 |
| bridge | 150 | L6 |
| english-school | 150 | L7 |
| clock-tower | 200 | L8 |

## 7. (구 전제 — 0절 정정 참고) 가격대별 필요 일수(신규 학생, 레거시 별 0 가정)

전형 6 PD/일 · 활발 12 PD/일, 웰컴 크레딧 20 PD(1회, 모든 학생 첫 방문 시
지급 — §10) 있음/없음 두 경우. `days = ceil(max(0, 가격−웰컴)/일일PD)`.

| 가격(PD) | 대표 아이템 | 웰컴 없음 6/일 | 웰컴 없음 12/일 | 웰컴 20 포함 6/일 | 웰컴 20 포함 12/일 |
|---|---|---|---|---|---|
| 10 | tree | 2일 | 1일 | **즉시(0일)** | **즉시(0일)** |
| 20 | cat·street-lamp·red-post-box | 4일 | 2일 | **즉시(0일)**\* | **즉시(0일)**\* |
| 30 | flower-garden·puppy | 5일 | 3일 | 2일 | 1일 |
| 50 | (참고점, 실제 아이템 없음) | 9일 | 5일 | 5일 | 3일 |
| 80 | british-cottage | 14일 | 7일 | 10일 | 5일 |
| 120 | book-shop·cafe | 20일 | 10일 | 17일 | 9일 |
| 150 | bridge·english-school | 25일 | 13일 | 22일 | 11일 |
| 200 | clock-tower | 34일 | 17일 | 30일 | 15일 |

\* 가격은 웰컴 20으로 즉시 충당되지만 `cat`(min_level 2)은 잔액과 무관
하게 레벨 게이트로 막혀 있어, 실제로는 L2 도달(§8) 전까지 구매 불가.

## 8. (구 전제 — 0절 정정 참고) 레벨 도달 소요일 + 밸런스 판정

| 레벨(임계 ★) | 6 PD/일 | 12 PD/일 | 해금 아이템(min_level) |
|---|---|---|---|
| L2(20) | 4일 | 2일 | cat·street-lamp·red-post-box |
| L3(50) | 9일 | 5일 | flower-garden·book-shop |
| L4(100) | 17일 | 9일 | puppy·owl |
| L5(200) | 34일 | 17일 | cafe·stone-fountain |
| L6(350) | 59일 | 30일 | bridge |
| L7(550) | 92일 | 46일 | english-school |
| L8(800) | 134일 | 67일 | clock-tower |

**단, 이 표는 "레거시 별이 0인 신규 학생"에만 성립한다.** 기존
학생(158,642★ 레거시 baseline이 `earned_stars`에 이미 포함)은
레벨 판정이 이미 L8~L10 구간이므로, 이들에게는 §7의 가격표(잔액 제약)만
실질적 병목이고 레벨 게이트는 사실상 무의미하다. 반대로 신규 학생은
레벨 게이트가 가격보다 먼저 병목이 되는 구간(L5 이상)이 생긴다.

**밸런스 판정(신규 학생 기준):**

- **L1(0~10 PD대, tree/bench/town-sign/shop-lamp/cottage)** — BALANCED.
  첫날부터 접근 가능, 웰컴 20으로 즉시 1개 구매 가능.
- **L2~L3(20~50, cat/lamp/postbox/garden/bookshop 중 저가)** — BALANCED.
  1주 이내 도달권.
- **L5(200, cafe 120 / fountain 60)** — SLOW. 레벨 자체가 6 PD/일로
  34일, 12 PD/일로도 17일 걸리는데 그 위에 가격(120)까지 더해짐 —
  전형 사용자는 사실상 한 달 이상 걸리는 목표.
- **L6~L8(350~800, bridge/english-school/clock-tower 150~200)** —
  TOO SLOW for 초등 저학년 파일럿. 전형 6 PD/일 기준 L8은 134일(약
  4.5개월), 활발 12 PD/일도 67일(약 2.2개월) — 파일럿 학기(대개 수개월)
  안에 신규 학생이 실제로 도달하기 어려운 목표로, 동기부여 효과보다
  "영영 못 사는 아이템"이라는 체감이 클 위험이 있다.

## 9. (구 전제 — 0절 정정 참고) 권장 옵션 — **미적용, 운영자 결정 필요(NEEDS DECISION)**

아래 세 옵션은 상호 배타적이지 않으며, 이 문서는 구현하지 않는다.

- **옵션 A — 상위 티어 가격 인하**: `dollar_rules`가 아니라
  `town_items.price`만 조정(운영자가 Supabase 대시보드에서 직접, 또는
  신규 `supabase_v3_5X_town_price_rebalance.sql`로). 예: book-shop/cafe
  120→90, bridge/english-school 150→110, clock-tower 200→150. 레벨
  게이트(min_level)는 그대로 두므로 "레벨은 성취, 가격은 화폐"라는 §2
  설계 원칙을 유지한 채 구매력만 개선.
- **옵션 B — 핵심 3종 보상 배율 2배**: `dollar_rules`에서
  `word-session-complete`/`writing-complete`/`daily-goal-complete`의
  `dollars_per_star`를 1→2로(SQL UPDATE, 코드 배포 불필요 —
  `supabase_v3_49_paul_dollar.sql` 헤더 주석이 이 테이블을 "코드 배포
  없이 배율 조정 가능"한 화이트리스트로 설계했음을 명시). 전형 시나리오가
  6→12 PD/일로 뛰어 §8 표의 "12 PD/일" 열이 사실상 기본 시나리오가 된다.
  단 레벨(⭐) 임계값·`reward_totals`에는 영향 없음(레벨 속도는 불변,
  구매력만 개선) — §3의 "레벨은 빠른데 지갑은 안 참" 갭이 줄어드는
  방향.
- **옵션 C — 클라이언트 전용 6종을 서버 원장으로 편입**: pronunciation
  등 나머지 6종의 `grantReward` 호출을 `grantLedgerReward`로 바꿔 실제
  폴달러 적립원을 12종 전부로 확대. **이것은 보상 로직 자체의 변경이라
  이번 감사 범위 밖**이며, 별도 계획(planner)·구현(implementer) 세션이
  필요하다(멱등성/일일 상한/idempotency_key 설계를 새로 해야 함).

## 10. 웰컴 크레딧 20 PD — 판정

기존 결정(변경 대상 아님, 기록만): 웰컴 20 PD는 **모든 학생의 첫 Town
방문 시** 지급되며(기존 학생 포함, 소급 없음) `grant_town_welcome_credit`
함수로 적립된다(`docs/design/PAUL_TOWN_V1.md` §3 "이중 게이트로 실제
지급은 0건" — 실행 시점 기준 미발동 상태였고, 실제 배포 후 지급 이력은
운영 로그로 별도 확인 필요).

**판정: 적당(BALANCED).** 전형 6 PD/일 기준 ≈2~3일치 획득량에 해당하는
액수로, 접속 즉시 `tree`(10)를 살 수 있어 "환영 선물을 실제로 쓸 수
있다"는 체감을 준다. 다만 `cat`(20)은 가격은 충당되고도 10 PD가 남지만
`min_level 2`라 레벨 게이트에 막혀 첫날 구매는 불가능 — 이는 가격
설계의 문제가 아니라 §2의 "레벨/가격 분리" 설계가 의도한 동작이다.

## 11. 요약

1. 12종 보상 중 6종만 실제로 폴달러화된다(§3) — 구조적 사실, 수정하지
   않는 한 계속 유지됨.
2. L1~L3 가격/레벨은 신규 학생 기준으로도 balanced, L5는 slow, L6~L8은
   초등 파일럿 규모에 too slow(§8).
3. 웰컴 20은 적당하다(§10).
4. 개선이 필요하다고 판단되면 옵션 A(가격 인하)·B(배율 2배) 중 최소
   변경(SQL 데이터 업데이트만, 코드 변경 0)으로 시작하는 편이 옵션
   C(로직 변경)보다 리스크가 낮다 — 단, 세 옵션 다 **운영자 승인 후
   별도 세션에서 적용**할 것.
