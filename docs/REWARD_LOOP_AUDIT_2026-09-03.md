# 보상 루프 P0 감사 (2026-09-03, READ-ONLY)

> 이 문서는 코드를 전혀 수정하지 않는 **읽기 전용 감사**다. 모든 주장은
> 실제 파일을 열어 확인한 뒤 `파일:줄` 형태로 인용했다(추측/기억 금지,
> `CLAUDE.md` 규칙 3). "보상+몰입+Paul Town 성장 루프" 후속 작업(P1~P10,
> 13절)을 시작하기 전에 현재 아키텍처를 냉정하게(cold-read) 파악하기
> 위한 지도다.

## 1. 요약

- 오늘의 루프: 학습 행동 → `grantReward`/`grantLedgerReward`(`useStudent.js:977,1025`) →
  금액은 `rewardEngine.js`가 결정 → 로컬 `rewardLedger` 배열 append +
  `POST /api/grant-xp`(`ledger:'reward'` 분기, service_role 전용, `reward_ledger`)
  → 학생 화면에 보이는 "잔액"은 `student_progress` 클라이언트 스냅샷
  (`syncStudentProgress`, `wordLibrary.js:3093`)일 뿐 서버가 재계산하지
  않는다 → 정원(`worldProgress.js` `gardenPoints`, 순수 파생) → 모자
  (`hatSystem.js` 임계값) → 스트릭(`calcStreak`, `useStudent.js:746`).
- 별(stars)과 XP는 **의도적으로 완전히 분리**된 두 원장이다 — 어느 쪽도
  다른 쪽에서 파생되지 않는다(`rewardEngine.js:19-22`, `wiki/decisions.md` #9).
- 게임화 마스터 스위치(`classes.gamification_enabled`)를 여는 SQL
  (`supabase_v2_5_gamification_master_switch.sql`)이 **아직 미실행**이라
  (`DATABASE.md:118`), 현재 전체 서비스에서 Paul Rank/Word King/House/
  Season UI가 반 설정과 무관하게 전부 숨김 상태다 — 그런데도 XP는
  계속 조용히 쌓인다(5절).
- Unit(유닛) 완료라는 보상 이벤트는 **어디에도 없다**(2절 표 하단, 4절).
- 스트릭 프리즈 모델(`streakModel.js`)은 이미 구현돼 있지만 아무 화면/
  훅도 이를 import하지 않는다(6절) — 죽은 코드는 아니고 "완성됐지만
  아직 배선 안 된" 상태.

## 2. 보상 발생 표

| 학습 행동 | 호출 지점 | 보상 타입/금액 | 서버 ledger 기록 |
|---|---|---|---|
| 오늘 단어 학습(GOAL 도달) | `useStudent.js:1359` `grantLedgerReward('word-session-complete', ...)` | +1★ (`rewardEngine.js:41`) | O — `reward_ledger`, 일일상한 1건(`rewardEngine.js:267`) |
| 오늘 쓰기시험 GOAL 도달 | `useStudent.js:1627` | +2★ | O, 일일상한 1건 |
| 오답 단어 복습 성공 | `useStudent.js:1651,1690` `wrong-word-recovered` | +1★ | O, 일일상한 60건(`rewardEngine.js:270`, 유닛당 실측 최대 50 기준) |
| 입실시험 완료(exam-complete) | `useStudent.js:1707` | +2★ | O, 일일상한 10건 + `entrance_test_results` 실재검증(`api/grant-xp.js:167-182`) |
| 오늘의 미션(4/4) 첫 완료 | `useStudent.js:1429` `daily-goal-complete` | +3★ | O, 일일상한 1건 |
| **레거시** 오늘의 미션(4/4) 보너스(반복 지급) | `useStudent.js:1411` `daily-mission-bonus:{signature}` | +10★ (`MISSION_BONUS_STARS`) | X — `grantReward`만, 서버 원장 없음. 라운드가 반복될 때마다(missions repeat all day) 매번 재지급되는 **의도된** 레거시 경제(`useStudent.js:1393-1400`) |
| 연속학습일 보너스(3/5/7일) | `useStudent.js:1491` `streak-bonus` | 2/3/5★(`STREAK_BONUS`) | O, 일일상한 1건 |
| 미니게임(BalloonGame 등, `MatchGameShell`) | `App.jsx:904`, `MatchGameShell.jsx:119` | 4★/정답 라운드(`STAR_PER_CORRECT`), 5라운드/판, **하루 1세션분만** 자격(`gameRewardEligibility`, `matchGame.js:60`) | X — `grantReward`만 호출, `grantLedgerReward` 아님 → `postRewardEvent` 없음, 서버 원장 미기록 |
| 발음 성공(레거시) | `useStudent.js:1255` `pronunciation:{wordId}:{today}` | +1★ | X — 레거시 dedupKey, 서버 원장 없음 |
| 레벨업 미션 클리어(mission-clear) | `useStudent.js:1185` | +3★ | X |
| 중복 스티커 환전 | `useStudent.js:1270` `sticker-duplicate:{id}:{ts}:{rand}` | +20★(`DUPLICATE_BONUS_STARS`) | X — 타임스탬프+난수 키라 구조적으로 매번 새 지급(의도된 반복 허용) |
| 쓰기 콤보(3/5/10) | `useStudent.js:1662` `spelling-combo:{wordId}:{combo}:{today}` | 가변(`bonus`) | X |
| XP: 단어보기/청취/퀴즈/쓰기 카테고리 첫 완료 | `useStudent.js:1350-1362`, `paulRankShared.js:173-176` | 2 XP each | `xp_ledger`(v2.3, 적용됨) |
| XP: 오늘의 미션(4/4) 첫 완료 | `useStudent.js:1421` `daily-mission-complete` | 10 XP | `xp_ledger` |
| **미구현 슬롯**(status:'planned', 서버가 항상 거부) | `paulRankShared.js:181-183` | word-king-complete 15 / weekly-streak 5 / special-event 10 | 도달 불가(`resolveXpAmount`가 null 반환) |

**Unit 완료 보상 이벤트 없음** — `REWARD_STARS`(`rewardEngine.js:40-48`),
`XP_EVENT_TABLE`(`paulRankShared.js:172-184`), `HAT_CATALOG`(`hatSystem.js:41-104`)
어디에도 "유닛 하나를 다 끝냈다" 자체를 트리거로 삼는 별/XP 지급 항목이
없다. 유일하게 유닛 완주를 읽는 것은 `hat_graduation` 모자(`hatSystem.js:78-82`,
`ctx.completedUnits.length >= 1`)뿐이고, 이마저 별/XP와 무관한 코스메틱
1회성 보상이다.

## 3. 중복 지급 가능성

**커버되는 것(구조적으로 안전):**
- `reward_ledger.idempotency_key` 전역 UNIQUE(`supabase_v3_36_reward_ledger.sql`,
  `rewardEngine.js:69-71`이 클라이언트/서버가 같은 문자열을 조립) + 서버가
  직접 재조립(`api/grant-xp.js:138`, 클라이언트가 보낸 키를 신뢰하지 않음).
- `xp_ledger` UNIQUE(`student_id`, `source_event_id`)(`api/grant-xp.js:14-21`).
- `round.starGrantLog`(`useStudent.js:982-989`) + `hasRewardEntry`
  (`rewardEngine.js:128-131`) — 같은 tick 중복 호출까지 막는 2차 방어.
- 서버측 일일 상한(`REWARD_DAILY_CAP`, `rewardEngine.js:266-273`) + KST
  자정 경계(`kstDayStartMs`) — sourceId 자유도가 큰 타입(uuid/date:token)의
  무제한 반복을 유한하게 제한.
- 테스트: `verify:reward-concurrency`(`testRewardConcurrencyMatrix.mjs`),
  `verify:reward-stress`(`testRewardIdempotencyStress.mjs`),
  `verify:reward-hardening-behavior`(`testRewardServerHardeningBehavior.mjs`).

**커버되지 않는 것(레거시 전용 경로, 2절 표의 "X" 행 전부):**
- 미니게임/발음/mission-clear/중복스티커/쓰기콤보는 서버 원장에 **전혀
  기록되지 않는다** — 오직 이 렌더의 React state(`round.starGrantLog`)에만
  존재하고, `postRewardEvent` 자체를 호출하지 않는다.
- 이 5개 경로에는 **여러 기기 동시 로그인 시 병합(merge) 후 중복 방지를
  검증하는 테스트가 없다** — `mergeRound`(`useStudent.js:509-524`)가
  `starGrantLog`를 병합하는지 자체를 별도로 확인하지 않았다(이번 감사
  범위 밖, 다음 세션에서 실측 필요 사실로 남김).
- 중복 스티커 환전은 설계상 "매번 새 dedupKey"라 반복 자체가 의도된
  동작이지만, 그만큼 서버 감사가 불가능하다(로컬 state 손상/조작에
  취약 — `handoff.md`의 "권교빈 2026-07-23 선물상자 37개... 이상 지급
  570별" 사고가 바로 이 계열의 옛 버그였다, `useStudent.js:1458-1460` 주석).

## 4. 누락 가능성

- **Unit 완료**: 위 2절 하단 참고 — 별/XP 어느 쪽도 유닛 완주를 보상하지
  않는다. `hat_graduation` 모자만 유닛 완주를 코스메틱으로 인정.
- **퀴즈/청취(listening)**: 별(stars) 쪽에는 대응 항목이 없다 — 오직 XP만
  지급된다(`quiz-complete`/`listening-complete`, `paulRankShared.js:174,176`).
  즉 게임화 스위치가 꺼진 반(현재 전체, 5절)의 학생은 퀴즈/청취를 아무리
  해도 "눈에 보이는" 보상이 전혀 없다 — word-session-complete(단어보기)와
  writing-complete(쓰기)만 별을 준다.
- **복습/숙달(review/mastery)**: `wrong-word-recovered`만 존재(스펠링
  복습 큐 성공 1건당 +1★). 퀴즈 오답을 다시 맞히는 것 자체에 대한 보상은
  레벨업 미션 클리어(`mission-clear`, 레거시, 서버 원장 없음)만 담당.

## 5. 시각 변화 없는 경로

- `classes.gamification_enabled`이 false(기본값이자, SQL 미실행이라
  **컬럼 자체가 없는** 상태 — `DATABASE.md:118`)인 반의 학생은 Paul Rank/
  Word King/House/Season UI를 절대 보지 못한다(`Dashboard.jsx:332,726,737,746,755,766`
  전부 `gamificationEnabled &&`로 게이팅). 하지만 XP 적립
  (`api/grant-xp.js`)은 이 스위치와 **완전히 무관하게 계속 기록된다**
  (`api/grant-xp.js:27-51` 헤더 주석이 이 설계를 명시 — "노출 게이트로만
  쓴다"). 즉 지금 전체 서비스가 정확히 "시각 변화 없이 XP만 쌓이는" 상태다.
- 세션 종료 화면(`RewardToast.jsx`/`GiftReveal.jsx`/`HatCeremony.jsx`)은
  전부 그 순간의 지급(별/스티커/모자)만 보여줄 뿐, 정원 변화·스트릭
  진행·다음 목표를 **전혀 언급하지 않는다**:
  - `RewardToast.jsx:19-24` — `entry.text`(예: "⭐ +1")만 1.5초 표시.
  - `GiftReveal.jsx:39-60` — 스티커 공개 연출뿐, 정원/스트릭 텍스트 없음.
  - `HatCeremony.jsx:32-53` — 새 모자만 보여줌.
- `streakModel.js`(freeze 포함 완성된 계산 모델)는 어떤 컴포넌트/훅에서도
  import되지 않는다(`grep computeStreak|streakModel` → `streakModel.js`
  자기 자신 1건만 매치) — 실제로 쓰이는 스트릭 계산은 별개의 레거시
  `calcStreak`(`useStudent.js:746`)이다.

## 6. stars vs XP 역할

- **stars**(`totalStars`): `LEVELS`(`rewardEngine.js:57-63`)/`RewardCard`/
  스티커 뽑기 경제를 구동. 유일한 증가 지점은 `grantReward`
  (`useStudent.js:977`).
- **XP**(`xp_ledger`): Paul Rank(`RANKS`, `paulRankShared.js:62-68`)/
  Word King(주간, 미구현)을 구동. 유일한 쓰기 경로는
  `api/grant-xp.js`의 xp 분기(`ledger:'reward'`가 없을 때의 기존 흐름).
- 두 값은 **의도적으로 서로 파생되지 않는다** — `rewardEngine.js:19-22`
  헤더, `wiki/decisions.md` #9("별을 조용히 XP로 변환하지 말라")·#10
  (행동 단위로 트리거만 공유, 값은 독립).

## 7. 정원 성장 공식

- `worldProgress.js:38-40` — `gardenPoints`는 저장 컬럼이 아니라
  `deriveAttachmentStats`가 매번 파생하는 "실제로 학습한 서로 다른
  단어 수"(cleared ∪ completedWords ∪ clearedWords 합집합, 순수 계산이라
  롤백/기기전환에도 상태 어긋남 없음).
- `POINTS_PER_STAGE = 2`(단어 2개당 칸 하나 성장), `PLOT_COUNT = 16`칸,
  라운드로빈 분배(`worldProgress.js:96-101`), 단계는
  empty→seed→sprout→flower→tree(`PLOT_STAGES`).
- 월드 6단계 임계값(`WORLD_STAGES`, `worldProgress.js:42-50`):
  garden 0 / house 30 / bridge 60 / library 100 / village 150 / kingdom 250.
- 2026-08-28 재조정 근거(`worldProgress.js:17-23,79-86`): 예전 축
  (`clearedCount` = 레벨업 미션 3연속 정답 단어 수)은 라이브 실측 190명
  중 170명(89%)이 영구 0칸이었던 역인센티브 버그 — 지금은 학습한 날당
  중앙값 1.9 새 단어 = 약 0.94칸/일(요청 기준 "하루 학습하면 최소 한 번
  눈에 보이는 변화"). 만개(16×4×2=128포인트)까지 중앙값 페이스로 약 67
  학습일.
- "하루 1타일 hard cap 없음"은 문서화된 의도된 결정이다(포인트가 쌓인
  만큼 그날 여러 칸이 한 번에 자랄 수 있음, 파생 계산 자체가 상한을
  두지 않는 구조 — `gardenPlots`에 일일 증가량 제한 로직이 없다).
- 완전 파생(저장 0)이라 **리셋 위험이 구조적으로 없다** — history가
  보존되는 한 정원은 항상 재계산으로 복원된다.

## 8. Paul Town unlock

- `paulTown.js:312-318` `TOWN_PLACES` — museum(minCleared 30)/
  library(100)/clockTower(150) 3개 건물은 `paulTownBuildings` 플래그
  (기본 ON, `features.js:72`)가 켜져야 노출, `garden`/`paulHome`은 항상 열림.
- `townPlacesState`(`paulTown.js:326-336`)가 읽는 축은 정원과 동일하게
  `gardenPoints ?? clearedCount`(2026-08-28 정합화 — 축이 다르면 "정원은
  무성한데 건물은 영원히 잠김" 모순이 생긴다는 이유).
- 영속 저장되는 사실은 3가지뿐(`paulTown.js:16-21` 헤더 주석):
  `hatInventory`(획득 이벤트, append-only)/`equippedHatId`(명시적 선택)/
  `milestones`(타임스탬프 이벤트 로그). 그 외(오늘의 발견을 봤는지 등)는
  전부 dayKey 결정론 파생이며 새 저장 필드를 추가하지 않는다.

## 9. 배지/모자/VIP/Word King/Paul Rank

- **모자**: `HAT_THRESHOLDS`(`hatSystem.js:30-37`) 8종 — 데일리미션 첫완료/
  단어 10클리어/7일연속/퀴즈정답100/단어30마스터/유닛완주1회/
  단어200클리어/한 주 5일학습. 획득은 append-only(회수 없음, 스트릭
  징벌 금지 원칙 — `hatSystem.js:26-28`).
- **STAR_BADGES**: `useStudent.js:1498` `STAR_BADGES.find(...)` — 100/300/
  500/1000★ 임계(정의는 `src/utils/attachment/milestones.js`, 이 파일도
  `calcStreak`/`STREAK_MILESTONES`를 export).
- **STREAK_MILESTONES**: 3/7/14/30일(`useStudent.js:1474`, `milestones.js`).
- **VIP**: 입실시험(entrance test) "오늘의 VIP" — `EntranceTest.jsx:22,51,474`,
  반별 실시간 랭킹 기반, 일일 단위.
- **Word King**: 주간(weekly), `supabase_v2_6_word_king.sql` 신규
  `word_king_history` 테이블 — **미실행, 운영자 실행 대기**
  (`DATABASE.md:119`). 미실행 상태에서는 `api/compute-word-king.js`가
  `table_missing`으로 조용히 응답하고 `wordKingApi.js` 조회는 빈 결과
  폴백(크래시 없음).
- **Paul Rank**: `RANKS`(`paulRankShared.js:62-68`) minXp 0/50/150/400/800
  — 새싹모자/비니/탐험모자/마법모자/왕관모자. `gamification_enabled`이
  켜진 반에서만 노출(5절), XP 자체는 스위치 무관하게 항상 적립.

## 10. 모바일 표시

- 오버레이(`GiftReveal.jsx:40`, `HatCeremony.jsx:33`) 전부
  `fixed inset-0 ... max-w-sm w-full` — 모바일 폭 우선 카드, 배경 클릭
  시 스킵/닫기.
- `RewardToast.jsx:31` `fixed top-4 left-1/2 -translate-x-1/2` + 항목당
  1.5초 자동 dismiss(`RewardToast.jsx:14`) — 학습 흐름을 막지 않는 비모달
  토스트(`pointer-events-none` 컨테이너 + 토스트 자신만 `pointer-events-auto`).

## 11. 테스트/스키마 인프라

**reward 관련 verify 스크립트(`package.json` 67-91행)**:
- `verify:game-reward` → `testGameRewardPolicy.mjs`
- `verify:reward-security` → `testRewardEndpointSecurity.mjs`
- `verify:reward-hardening` → `testRewardServerHardening.mjs`
- `verify:reward-hardening-behavior` → `testRewardServerHardeningBehavior.mjs`
- `verify:reward` → `testRewardEngine.mjs && buildRaceBundle.mjs && testRewardFlow.mjs`
- `verify:reward-baseline` → `testRewardBaselineMigration.mjs`
- `verify:reward-ledger` → `testRewardLedgerMigration.mjs`
- `verify:reward-server` → `testRewardServerWrite.mjs`
- `verify:reward-concurrency` → `testRewardConcurrencyMatrix.mjs`
- `verify:reward-stress` → `buildRaceBundle.mjs && testRewardIdempotencyStress.mjs`

**픽스처**: `scripts/fakeReact.mjs`(React state updater 스텁), 그리고
`testRewardServerHardeningBehavior.mjs:32`가 임시 디렉터리에 직접 만드는
`fakeSupabaseForRewardApi.mjs`(가짜 Supabase 클라이언트 — `api/grant-xp.js`를
실제 네트워크 없이 인메모리로 구동).

**스키마 권한**: `reward_ledger`/`reward_totals`(`supabase_v3_36`)는 GRANT
0건 + RLS enable로 anon/authenticated 완전 차단, service_role만 접근
(`supabase_v3_36_reward_ledger.sql:37-46,72-73,125-126`) — 실행 확인됨
(`DATABASE.md:494`, anon 42501 실측).

**READ-ONLY 하네스**: `health:students`(`studentHealthCheck.mjs`)는 HTTP
GET만 보내고 PATCH/POST/PUT/DELETE 경로 자체가 없다(`studentHealthCheck.mjs:3-8`
"★ READ-ONLY 보장 ★").

**live-WRITE 계열로 분류될 만한 스크립트**: 이번 감사에서 reward 관련
verify 스크립트를 훑은 결과, `testRewardServerWrite.mjs`조차 "네트워크 0,
Supabase 접촉 0"(정적 검사 + 순수 함수 화이트박스 테스트, 파일 헤더
1-33행)이라고 스스로 명시하고 있어, **실제 프로덕션에 쓰는 reward 관련
verify 스크립트는 이번 조사 범위에서 발견되지 않았다** — 다음 세션이
새 하네스를 추가할 때 이 사실(현재 전부 격리됨)이 깨지지 않게 유지할 것.

## 12. 관리자 노출 현황

- `StudentDirectory.jsx`는 `fetchDashboardData`(`wordLibrary.js:3616`
  `student_progress.select('*')`)로 **전체 컬럼**(total_xp/streak/
  stickers_count/calendar_data/mission_data/review_data 포함)을 가져오지만,
  실제로 화면에 렌더하는 건 `lastStudiedDate`/`totalStars`/`clearedCount`
  3개뿐(`StudentDirectory.jsx:1011-1012,1069-1072`) — 나머지는 조회만 되고
  버려진다.
- `AnalyticsPanel.jsx`는 `product_events`를 `anon_id` 단위로만 집계
  (`computeReturnRates`/`computeGardenRevisits`/`computeAvgSessionMinutes`/
  `computeFeatureCounts`, `AnalyticsPanel.jsx:10,39-40`) — 개별 학생 식별
  가능한 리스트가 아니라 익명 집계뿐(익명 관찰 대시보드 설계 원칙,
  `AnalyticsPanel.jsx:1`).

## 13. 설계 결정 (연구 브리프 반영)

`gamification_research.md`(스크래치패드, 2026-09-03 준비)가 정리한 근거
강도순 10개 설계 규칙(원문 §번호 인용):

1. **회상/숙달을 보상하라, 노출/단순정답만으로는 안 됨**(Karpicke &
   Roediger 테스트 효과, 강한 일관된 증거 — §8). → 현재 4절의 "복습/숙달
   보상 누락" 갭과 직결.
2. **피드백은 즉각적이면서 정보성이어야 한다**("무엇이 나아졌는지/다음이
   무엇인지", Wisniewski 2020 d=0.48, Hattie & Timperley — §3). → 현재
   `RewardToast`가 "⭐ +1"만 보여주는 것(5절)은 정보성이 아니라 일반적
   칭찬에 가까움.
3. **가변비율(뽑기형) 보상은 절대 쓰지 않는다** — 가치 있는 것엔 무작위
   금지, 무작위를 쓰더라도 확률을 공개(Zendle & Cairns; King & Delfabbro,
   강한 윤리적 합의 — §6). → 현재 스티커 뽑기(`getRandomSticker`)는
   희소성/경제 없는 코스메틱이라 이 원칙과 충돌 소지가 낮지만, 신규
   보상을 설계할 때 재확인 필요.
4. **보상은 통제 조건이 아니라 정보 피드백으로 프레이밍**(Deci/Koestner/
   Ryan 1999; Cerasoli 2014 — §2).
5. **진행률 바는 절대 0%에서 시작하지 않는다** — 소액 선불(10~15%) 시작
   (Kivetz/Urminsky/Zheng; Nunes/Drèze, 반복 검증됨 — §4).
6. **스트릭 프리즈/유예 메커니즘 추가** — 하루 결석이 66일 습관을
   무너뜨리지 않게(Lally 2010 — §5, 근거 탄탄; Duolingo 수치는 비동료
   심사 자료). → `streakModel.js`가 이미 이 정책을 구현했으나 미배선
   (6절).
7. **8~15세 대상 공개 순위/리더보드는 기본값으로 피한다** — 성장은
   개인/서사 중심으로(초등 게임화 설계 문헌, 중간 정도 증거 — §9). →
   현재 VIP/Word King이 반 단위 순위이므로 설계 시 유의.
8. **보상 크기 인플레이션 대신 콘텐츠/의미를 다양화**(쾌락 적응/게임화
   근시안 문헌 — §7).
9. **소수의 이론 기반 메커니즘만 선택하고 로컬에서 측정**(Dichev &
   Dicheva 2017, 비판적 문헌고찰 — §1).
10. **구체적 "매직넘버"(66일, 21% 이탈감소 등)는 문자 그대로 하드코딩
    말고 방향성으로만 취급, 앱 내 실측으로 검증**(§5, §7 불확실성 플래그).

## 14. P1~P10 계획 요약 표

| ID | 내용 | 운영자 승인 필요 여부 |
|---|---|---|
| P1 | `SessionRewardCard` — 세션 종료 시 "무엇이 늘었는지" 요약 카드(신규 flag `sessionRewardSummary`, 기본 OFF, `features.js`의 기존 `attachmentWorldFull` 패턴 재사용) | **필요**(flag ON 시점은 운영자 결정) |
| P2 | 성장 신호(growth signals) — 기존 `gardenPoints` 축 그대로 재사용 + 새 파생 신호(예: "이번 주 성장한 칸 수") 추가, 저장 리셋 없음(순수 파생 유지) | 불필요(순수 프런트 파생, 기존 SQL/컬럼 변경 없음) |
| P3 | 다음 목표(next-goal) 단기/중기/장기 위젯 — 오늘 목표/이번 주 목표/다음 정원 단계까지 남은 거리 표시 | 불필요(기존 파생값 조합 표시) |
| P4 | 유닛 완료 보상(신규 reward type, 2절 갭 해소) | **필요**(서버 `api/grant-xp.js`의 `REWARD_SOURCE_RULES`/`REWARD_STARS`/`REWARD_DAILY_CAP`에 새 타입 추가 → 재배포 필요) |
| P5 | 복습/숙달 보상 강화 — 기존 `wrong-word-recovered` 확장 + "숙달도 변화"(mastery delta) 기반 보너스 | 신규 서버 reward type이면 **필요**, 기존 타입 금액 조정이면 불필요 |
| P6 | `streakModel.js`(freeze 포함) 실제 배선 — 현재 죽어있는 완성 모델을 UI/훅에 연결 | 불필요(기존 순수 모델 재사용, 신규 DB 없음) — 단, 표시 UX 변경은 운영자 확인 권장 |
| P7 | 코스메틱 전용 서프라이즈(경제/희소성 없는 랜덤 문구 등, §6 원칙 준수) | 불필요(가치 없는 코스메틱 한정) |
| P8 | 성장/언락 로직 추상화(정원/모자/Paul Town이 각자 축을 읽는 현재 구조를 공용 인터페이스로 정리) | 불필요(내부 리팩터, 외부 동작 무변경 전제) |
| P9 | `StudentDirectory` 필드 확장 — 12절에서 확인한 "조회는 되는데 안 보이는" 컬럼(streak/total_xp 등) 중 관리자에게 유용한 것만 노출 | 불필요(읽기 전용 표시 추가) |
| P10 | 무결성 테스트 보강 — 2·3절에서 확인한 레거시 무원장 경로(게임/발음/mission-clear/스티커/콤보)의 다기기 병합 중복 검증 테스트 신설 | 불필요(테스트 추가만) |

---

## 5줄 요약

1. 보상 루프는 별(stars)/XP(paulRank)/정원(gardenPoints) 3축이 완전히
   독립적으로 파생되며, 최근 원장(reward_ledger)은 idempotency+일일상한
   으로 잘 방어되지만 레거시 5개 경로(게임/발음/mission-clear/중복스티커/
   쓰기콤보)는 서버 원장이 아예 없다(3절).
2. Unit 완료 보상 이벤트가 구조적으로 부재하고, 퀴즈/청취는 XP만 주고
   별은 안 준다(2·4절).
3. `classes.gamification_enabled` SQL이 아직 미실행이라 지금 전체
   서비스가 "XP는 쌓이는데 아무 화면도 안 보여주는" 상태다(5절, `DATABASE.md:118`).
4. `streakModel.js`(freeze 포함)는 이미 완성돼 있지만 어디에도 배선되지
   않은 죽은 모듈이고, 세션 종료 화면 3종 모두 정원/스트릭/다음목표를
   전혀 언급하지 않는다(5·6절).
5. 연구 브리프의 회상/숙달 보상·즉각적 정보 피드백 원칙과 현재 구현
   사이의 갭(4·5절)이 P1~P5의 근거이고, 이 중 P4(유닛완료)만 서버
   재배포가 필요한 실제 승인 대상이다(14절).
