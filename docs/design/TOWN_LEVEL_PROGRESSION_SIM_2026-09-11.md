# Paul Town 레벨업/이코노미 시뮬레이션 — 2026-09-11

_설계/감사 문서. `scripts/testTownEconomySim.mjs`(결정론 순수 시뮬레이션,
`npm run verify:reward`/`verify:all`에 편입, `extra:false`)의 실행 결과를
그대로 옮긴 것 — 이 문서 자체는 어떤 코드·SQL·설정도 변경하지 않는다.
§7 V2 권장안은 **미적용(NEEDS DECISION)** — 운영자 승인 없이 구현 착수
금지(`CLAUDE.md` 규칙 3, 14). 브랜치 `qa/town-loop-hardening-2026-09-11`._

## 0. 이 문서의 존재 이유 — 핵심 재발견

`docs/design/TOWN_ECONOMY_AUDIT_2026-09-11.md`(이하 "구 감사 문서")의 숫자
(전형 6 / 활발 12 / 최대 77 PD, L8 도달 134일)를 **그대로 믿지 말고
코드에서 재도출**하라는 지시에 따라 `src/hooks/useStudent.js`의
`grantLedgerReward`/`grantReward` 호출부와 `src/utils/rewardEngine.js`를
다시 읽은 결과, 구 감사 문서 §3의 핵심 전제 — "12종 보상 중 6종
(`pronunciation`/`mission-clear`/`daily-mission-bonus`/`spelling-combo`/
`sticker-duplicate`/`matchgame`)은 클라이언트 로컬(`grantReward`)만
호출해 서버 `reward_ledger`에 전혀 도달하지 않는다(0 PD)" — 는 **더 이상
사실이 아니다.**

**근거(코드, 2026-09-06 커밋, 구 감사 문서가 쓰지 못한 정보):**

1. `src/hooks/useStudent.js`의 `grantReward()`는 매 호출마다
   `rewardEngine.parseLegacyDedupKey(dedupKey)`로 레거시 6종의 dedupKey
   프리픽스(`pronunciation:`/`mission-clear:`/`daily-mission-bonus:`/
   `spelling-combo:`/`sticker-duplicate:`/`matchgame:`)를 인식하고,
   인식되면 `postRewardEvent(studentId, rewardType, sourceType, sourceId)`
   를 그대로 호출한다 — `grantLedgerReward()`가 신규 6종에 쓰는 것과
   **완전히 동일한 함수**(`src/utils/wordLibrary.js:3503`)다.
2. `api/grant-xp.js`의 `reward` 분기는 rewardType을 6개로 하드코딩하지
   않고 `isValidRewardType()`(= `REWARD_SOURCE_RULES`에 정의된 타입이면
   전부 허용, `legacy-baseline`만 의도적으로 제외)로 제네릭하게 받는다.
3. `dollar_rules`는 12개 `reward_type` 전부에 `dollars_per_star=1,
   active=true`를 시드한다(`supabase_v3_49_paul_dollar.sql:127-140`,
   레거시 6종 포함) — 즉 레거시 6종이 원장에 도달하기만 하면 폴달러
   전환은 이미 준비돼 있었다.
4. 이 구조를 검증하는 회귀 스위트(`scripts/testLegacyGrantCoverage.mjs`,
   `scripts/testLegacyRewardServer.mjs`)가 이미 registry에 등록돼 있고
   당시(2026-09-06) PASS 상태였다 — 이번 세션이 새로 만든 코드가 아니라,
   **이미 배포된 기존 동작을 구 감사 문서가 반영하지 못했을 뿐**이다.

`scripts/testTownEconomySim.mjs`는 이 사실을 재구현하지 않고
`isValidRewardType`을 그대로 import해 "실제로 원장에 도달하는
rewardType"(`LEDGER_TYPES`)을 코드에서 직접 파생시킨다 — 그 결과
`LEDGER_TYPES`는 13개 `REWARD_STARS` 키 중 `legacy-baseline` 1개만 제외한
**12개**가 된다. 이 문서 전체(§2 이후)의 "PD_LEDGER"는 이 12종 전부를
반영한 값이다. 원 설계 의도(6-anchor만, 이번 작업 지시문이 준 프레임과
동일)로 본 값은 "PD_LEGACY6"로 별도 병기한다 — 아래 표에서 두 값이 왜
이렇게 크게 벌어지는지가 이 문서의 첫 번째 결론이다.

**아직 검증하지 못한 것(운영 로그로 별도 확인 필요, 이 문서 범위 밖):**
production `reward_ledger`/`dollar_ledger`를 실제로 조회해 레거시 6종
행이 정말로 쌓이고 있는지(위 코드 경로가 옳다면 쌓여야 정상)는 이 오프라인
순수 시뮬레이션으로는 확인할 수 없다 — READ-ONLY 프로덕션 조회가 필요한
후속 작업으로 남긴다(§7 권장 C).

## 1. 학생-일 모델 3종 — 정의와 가정

프로필에 명시되지 않은 값은 전부 아래에 이유를 남긴다(추측을 숨기지
않는다). 원문 그대로:

- **평범**: 40단어 세션 1회, 쓰기 5정답, 하루목표 달성, 발음 20단어, 퀴즈
  20정답, 시험 0.
- **열심**: 2세션, 쓰기 10정답, 발음 40, 퀴즈 40, 오답복구 5, 시험 1,
  streak day.
- **매우많이**: 3세션/유닛 2, 발음 80, 오답복구 20, 시험 2, 매치게임 5,
  선물중복 1, 콤보 3/5/10.

| 가정 필요 항목 | 평범 | 열심 | 매우많이 | 근거 |
|---|---|---|---|---|
| 예문 듣기(examplesHeard) | GOAL(5) | GOAL×2=10 | GOAL×3=15 | "하루목표 달성"/"N세션"은 `countCategoriesCompleted(round)>=4`(4/4)를 전제하므로, 명시 안 된 카테고리도 라운드당 최소 GOAL은 채웠다고 가정. |
| 퀴즈(매우많이만) | — | — | GOAL×3=15 | 동일 이유(3라운드 4/4 완료 전제), 명시 없음. |
| streak day 실제 일수 | — | 3일차 | — | "streak day"만 언급, 구체적 연속일수 없음 → `STREAK_BONUS`(3/5/7) 최소 단계로 보수적 가정. 실제로 5·7일차면 이 시뮬레이션보다 PD/STARS가 더 커질 뿐 작아지지 않는다. |
| 콤보(평범/열심) | 0 | 0 | [3,5,10] | 콤보는 연속 정답에서만 증가(오답 시 0으로 리셋). 프로필이 "콤보"를 명시적으로 언급한 모델은 매우많이뿐이므로, 나머지 두 모델은 정답 사이에 오답이 섞여 콤보 마일스톤에 도달하지 않았다고 가정(보수적 — 실제로 100% 연속 정답이면 평범/열심도 콤보-3이 자동으로 걸린다). |
| 매치게임(평범/열심) | 0 | 0 | 5 | "매치게임 5" = `ROUNDS`(matchGame.js, 실측 5) 전승 1세션, `GAME_REWARD_DAILY_LIMIT`(실측 1) 준수. |
| 세션/라운드 수 → 4/4 완료 횟수 | 1 | 2 | 3 | "N세션" = daily-mission 라운드(4/4) 완료 횟수로 해석(useStudent.js 주석 "missions repeat all day" — 4/4를 채우면 라운드가 리셋되고 다시 쌓을 수 있음). `daily-goal-complete`(날짜 키, 하루 1회)와 `daily-mission-bonus`(라운드 시그니처 키, 반복 지급)가 이 횟수에 서로 다르게 반응한다(§2 표 참고). |

## 2. STARS / PD / XP — 실측 표(스크립트 그대로 옮김)

| 모델 | STARS(12종) | PD_LEDGER(12종, 실제 코드) | PD_LEGACY6(구 6-anchor 설계) | XP |
|---|---|---|---|---|
| 평범 | 36 | 36 | 6 | 18 |
| 열심 | 75 | 75 | 15 | 18 |
| 매우많이 | 186 | 186 | 30 | 18 |

STARS와 PD_LEDGER가 세 모델 전부 정확히 같다 — 우연이 아니라 §0의
재발견 그대로(세 모델 어디에도 `legacy-baseline`/`mission-clear`가
쓰이지 않았고, 나머지 전부가 `isValidRewardType` 기준 원장 도달 타입이기
때문). PD_LEGACY6는 6/15/30으로, 구 감사 문서의 "전형 6 / 활발 12"와
거의 같은 자릿수다 — **구 감사 문서가 계산한 숫자 자체는 6-anchor만
본다면 여전히 맞다.** 문제는 "6-anchor만 본다"는 전제가 2026-09-06 이후
더 이상 코드와 일치하지 않는다는 것.

XP가 세 모델 전부 18로 동일한 것은 설계 그대로다 — `paulRankShared.js`의
5개 active 이벤트(`word-view-complete`/`listening-complete`/
`writing-complete`/`quiz-complete`/`daily-mission-complete`)가 전부
"오늘 그 카테고리를 처음 완료"라는 **day 기간키** 이벤트라, 하루에 얼마나
많이 반복 학습하든 XP 총량은 바뀌지 않는다(이 자체가 스크립트의 구조적
GATE 단언 — "학습량과 무관하게 하루 상한 고정"). 나머지 3개(`word-king-
complete`/`weekly-streak`/`special-event`)는 `status:'planned'`라
`resolveXpAmount`가 여전히 null을 반환함을 회귀 가드로 확인했다.

**단언 결과(스크립트 원문):**
- GATE(구조, 실패 시 스크립트 exit 1) 14개 전부 PASS — 단조성(STARS/PD
  둘 다 평범≤열심≤매우많이), XP 불변성, planned 이벤트 게이팅, 캡 미도달
  자가점검 등.
- FINDING(정책/밸런스, 실패해도 exit code 비관여) 4개 중 1개 FAIL:
  **"PD_LEDGER/일(평범)이 [4,10] 대역 안"이 FAIL — 실측값 36.**
  PD_LEGACY6 기준 같은 판정은 PASS(6, 대역 안). 이 FAIL은 버그가 아니라
  §0 재발견을 정량화한 것 그대로다 — 상수를 건드려 통과시키지 않았다
  (CLAUDE.md 규칙 15).

## 3. 아이템 구매력 표 — PD_LEDGER 기준 재계산

평범 PD/일 = 36, 열심 PD/일 = 75(둘 다 PD_LEDGER, 위 §2), 웰컴
크레딧 = 20 PD(`supabase_v3_50_town_v1.sql` RPC 고정값, JS import 불가라
문서/SQL 사실로 인용), 폴달러 환율 = 1(`supabase_v3_49_paul_dollar.sql`
dollar_rules 시드, 마찬가지로 SQL 사실).

판정 규칙(작업 지시 그대로): 평범(웰컴 없음) 일수 ≤1 → TOO CHEAP, 열심
(웰컴 없음) 일수 >21 → TOO EXPENSIVE, 나머지 → GOOD.

| 아이템 | 가격 | 최소레벨 | d(평범,웰컴无) | d(평범,웰컴20) | d(열심,웰컴无) | 판정 |
|---|---|---|---|---|---|---|
| tree | 10 | L1 | 1 | 0 | 1 | **TOO CHEAP** |
| bench | 15 | L1 | 1 | 0 | 1 | **TOO CHEAP** |
| cat | 20 | L2 | 1 | 0 | 1 | **TOO CHEAP** |
| street-lamp | 25 | L2 | 1 | 1 | 1 | **TOO CHEAP** |
| red-post-box | 25 | L2 | 1 | 1 | 1 | **TOO CHEAP** |
| flower-garden | 30 | L3 | 1 | 1 | 1 | **TOO CHEAP** |
| puppy | 30 | L4 | 1 | 1 | 1 | **TOO CHEAP** |
| town-sign | 40 | L1 | 2 | 1 | 1 | GOOD |
| owl | 40 | L4 | 2 | 1 | 1 | GOOD |
| shop-lamp | 60 | L1 | 2 | 2 | 1 | GOOD |
| stone-fountain | 60 | L5 | 2 | 2 | 1 | GOOD |
| british-cottage | 80 | L1 | 3 | 2 | 2 | GOOD |
| book-shop | 120 | L3 | 4 | 3 | 2 | GOOD |
| cafe | 120 | L5 | 4 | 3 | 2 | GOOD |
| bridge | 150 | L6 | 5 | 4 | 2 | GOOD |
| english-school | 150 | L7 | 5 | 4 | 2 | GOOD |
| clock-tower | 200 | L8 | 6 | 5 | 3 | GOOD |

**집계: TOO CHEAP 7 / GOOD 10 / TOO EXPENSIVE 0 (총 17종).**

구 감사 문서 §8은 "L6~L8(bridge/english-school/clock-tower)이 초등
파일럿 규모에 TOO SLOW(평범 기준 134일/L8)"라고 결론지었다. PD_LEDGER
기준으로 재계산하면 **정확히 반대** — clock-tower(가장 비싼 아이템)도
평범 6일, 열심 3일이면 산다. TOO EXPENSIVE 판정이 하나도 없다는 것 자체가
새로운 finding이다(§4에서 계속).

**운영자 목표 인코딩 단언(finding, non-gating):**
- "L1 아이템 전부가 웰컴 20 포함 평범 3일 이내 구매 가능" → **PASS**
  (tree/bench 0일, cat 0일이지만 L2라 레벨 게이트로 별도 차단, town-sign/
  shop-lamp/british-cottage 전부 ≤2일).
- "L1~L3 아이템 합계(425 PD)가 열심 5일 획득량(375 PD, 웰컴 제외)으로
  소진되지 않는다" → **PASS, 그러나 88%까지 근접**(375/425) — 6일째면
  소진된다. 여유가 거의 없다.

## 4. 레벨 진행 Lv1~10 — PD_LEDGER=stars_earned 기준

`TOWN_LEVELS`의 `min`은 `reward_totals.earned_stars` 누적 기준이고,
§0의 재발견에 따라 이 누적치는 이제 12종 전부(PD_LEDGER와 동일 소스)를
반영한다 — 구 감사 문서가 "레벨은 12종 전부 반영, PD는 6종만 반영"이라고
쓴 것 자체가 §0 재발견 이후 더 이상 성립하지 않는 이분법이다: **둘 다
같은 12종 기준**이다.

| 레벨 | 임계★ | d(평범) | d(열심) | 신규 해금 | 최저가 | 웰컴+누적 구매가능? |
|---|---|---|---|---|---|---|
| L1 | 0 | 0 | 0 | tree, bench, town-sign, shop-lamp, british-cottage | 10 | YES |
| L2 | 20 | 1 | 1 | cat, street-lamp, red-post-box | 20 | YES |
| L3 | 50 | 2 | 1 | flower-garden, book-shop | 30 | YES |
| L4 | 100 | 3 | 2 | puppy, owl | 30 | YES |
| L5 | 200 | 6 | 3 | stone-fountain, cafe | 60 | YES |
| L6 | 350 | 10 | 5 | bridge | 150 | YES |
| L7 | 550 | 16 | 8 | english-school | 150 | YES |
| L8 | 800 | 23 | 11 | clock-tower | 200 | YES |
| L9 | 1100 | 31 | 15 | (없음) | — | N/A |
| L10 | 1500 | 42 | 20 | (없음) | — | N/A |

구 감사 문서: L8 도달 134일(평범)/67일(열심). 이 시뮬레이션(PD_LEDGER 기준):
**23일/11일** — 약 6배 빠르다. 이 차이는 전부 §0 재발견(레거시 6종도
원장에 도달)에서 나온다.

**죽은 구간(dead zones) — 개수를 0으로 강제하지 않고 그대로 보고:**
- **L1: 5개 동시 해금(과밀)** — tree/bench/town-sign/shop-lamp/
  british-cottage가 첫 로그인 순간 전부 열린다. 이 중 실제로 웰컴+
  당일 누적으로 살 수 있는 건 tree/bench뿐(§5).
- **L2: 3개 동시 해금(과밀)** — cat/street-lamp/red-post-box.
- **L9, L10: 0개 해금(빈 레벨)** — 900+400=총 1000★(L8→L10 구간)를
  더 쌓아도 카탈로그에 새로 열리는 아이템이 없다. `TOWN_ITEM_META`의
  최대 `minLevel`이 8(clock-tower)이라 L9/L10은 순수 "레벨 숫자만
  오르는" 구간이다.
- "해금됐지만 그 시점 누적 PD로는 전부 구매 불가"(all-unaffordable) 유형의
  죽은 구간은 **0건** — PD_LEDGER 가속 덕분에 이 유형은 이제 나타나지
  않는다(구 감사 문서 시절엔 이 유형이 실질적 병목이었을 가능성이 높다).

## 5. 웰컴 크레딧 20 PD

- tree(가격 10)를 즉시 구매 가능, 잔액 10 남음 — 확인.
- tree 구매 후 잔액 10 PD로 **구매 불가능한 L1 아이템**: bench(15),
  town-sign(40), shop-lamp(60), british-cottage(80) — 4종. 웰컴이
  카탈로그 전체를 열어주지는 않는다(의도된 설계, 구 감사 문서 §10과
  동일 결론 — 이 부분은 §0 재발견과 무관하게 그대로 유지).

## 6. §1~§5 요약 — 무엇이 실제로 바뀌었나

1. **레거시 6종(pronunciation/mission-clear/daily-mission-bonus/
   spelling-combo/sticker-duplicate/matchgame)은 2026-09-06 이후 코드
   기준으로 더 이상 "0 PD"가 아니다.** `isValidRewardType`이 전부 참을
   반환하고, `dollar_rules` rate=1이 이미 시드돼 있으므로 서버가
   실제로 받기만 하면(코드상 받는다) 폴달러로 전환된다.
2. 이 재발견을 반영하면 PD/레벨 가속도가 구 감사 문서 대비 약 5~6배
   빠르다(평범 PD/일 6→36, L8 도달 134일→23일).
3. 아이템 구매력 판정도 뒤집힌다 — 구 감사의 "L6~L8 TOO SLOW"는
   TOO EXPENSIVE 0건(전부 GOOD)으로, 대신 "L1~L2 저가 7종 TOO CHEAP"이
   새 병목이다(1일 내 구매 가능 = 즉시 소진).
4. 운영자의 두 목표(첫날 실망 방지 / 5일 내 미소진)는 **둘 다 기술적으로
   PASS**하지만, 5일 소진 목표는 88%까지 근접해 여유가 거의 없다.
5. XP는 이 재발견과 무관하게 하루 18로 불변(day 기간키 설계, §2).
6. Production `reward_ledger`/`dollar_ledger`에 레거시 6종 행이 실제로
   쌓이고 있는지는 이 오프라인 시뮬레이션으로 확인 불가 — 별도
   READ-ONLY 조회가 필요하다(§7 권장 C).

## 7. V2 권장 옵션 — **미적용, 운영자 결정 필요(NEEDS DECISION)**

이 절은 threshold/가격을 변경하지 않는다. 상호 배타적이지 않다.

- **권장 A — 레거시 6종의 `dollar_rules.dollars_per_star`를 0으로
  낮춘다(SQL UPDATE만, 코드 변경 0)**: 구 감사 문서의 원래 설계 의도
  (6-anchor만 PD, §0의 "PD_LEGACY6")를 코드 사실과 다시 일치시킨다.
  레벨(⭐, `reward_totals.earned_stars`)은 이 rate와 무관하게 12종 전부
  계속 누적되므로(레벨 = 원장 stars_delta 합, dollars_per_star는 별도
  환율일 뿐) 레벨 속도는 바뀌지 않고 **구매력만** 원래 설계로 되돌아간다.
  단, 이렇게 하면 §4의 "L9/L10 빈 레벨" + "PD_LEGACY6 6/일"의 조합으로
  레벨은 여전히 빠르게(12종 기준) 오르는데 지갑(6종 기준)은 느리게
  채워지는 구조가 다시 생긴다 — 구 감사 문서 §3이 이미 지적한 "레벨은
  빠른데 지갑은 안 참" 갭이 되돌아온다는 뜻, 트레이드오프로 인지 필요.
- **권장 B — 현재 상태(12종 전부 PD)를 공식 설계로 채택하고, 가격만
  상향 조정한다**: §3의 TOO CHEAP 7종(tree/bench/cat/street-lamp/
  red-post-box/flower-garden/puppy)을 각각 2~3배 인상(예: tree 10→25,
  bench 15→35)해 "1일 내 소진"을 막는다. `town_items.price`만 SQL로
  조정, 레벨 게이트(`min_level`)는 그대로 둔다(§2 설계 원칙 "레벨은
  성취, 가격은 화폐" 유지).
- **권장 C(선행 필요) — production `reward_ledger`/`dollar_ledger` 실측
  확인**: 이 문서의 모든 "PD_LEDGER" 수치는 **코드가 이렇게 동작해야
  한다**는 정적 추론이다. 레거시 6종의 `postRewardEvent` 호출이 실제
  네트워크에서 성공하고 있는지(fire-and-forget이라 실패가 조용히
  삼켜진다, `postRewardEvent` 헤더 주석), 재시도 큐(`testRewardPostQueue.
  mjs`)가 정상 동작 중인지는 READ-ONLY 프로덕션 조회로만 확인 가능하다.
  권장 A/B 중 무엇을 택하든, 그 전에 실제 `dollar_ledger`의 reward_type
  분포를 한 번 확인해 "이론과 실측이 일치하는지"부터 검증할 것을
  권장한다.
- 세 옵션 다 **운영자 승인 후 별도 세션에서 적용**(계획은 planner,
  구현은 implementer 세션 분리).
