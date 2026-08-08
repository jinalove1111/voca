# GAME_REWARD_SYSTEM — Paul Easy Voca 게임화/보상 시스템 설계서

_2026-08-09 야간(81차). 전제: 2026-08-09 코드 전수 인벤토리(하단 §19 근거).
수치 명세의 단일 원본은 `docs/GAME_REWARD_RULES.md`. 이 문서는 철학/구조/
현황/로드맵을 담는다._

## 0. 가장 중요한 발견 — "이미 만들어져 있고, 꺼져 있다"

이 저장소에는 2026-07-19에 구축된 게임화 레이어가 **완성 상태로 잠재**해
있다: Paul Rank(XP 5이벤트/랭크/모자 단계), Ticket Economy(원장+상점),
Word King(주간 챔피언), House(4팀), Season. 이들 전부가
`classes.gamification_enabled`(v2_5 SQL, **프로덕션 미실행**) 뒤에 숨어
학생에게 보이지 않는다. 별도로 **이미 라이브인 게임화**도 많다: 오늘의
미션(4/4 라운드)·streak 배지·별/스티커/선물상자·모자 컬렉션·성장 앨범·
정원·Paul Town·미니게임 4종·HeroReaction 연출.

→ 이번 설계의 1순위는 "새로 만들기"가 아니라 **켜고, 정합시키고, 빈 곳만
채우는 것**이다.

## 1. 게임화 철학

- **학습이 먼저, 보상은 뒤**: 보상은 학습 행동 완료의 결과로만 발생한다.
  출석/접속 보상 없음. 게임이 학습을 대체하거나 앞서는 화면 배치 금지.
- **목표**: ①복습(특히 unknown 단어 재도전)을 늘리고 ②세션을 끝까지
  완료하게 하고 ③다음날 재방문을 만든다. 접속시간 극대화는 목표가 아니다.
- **연구 근거 요약(§20 상세)**: 자기결정이론(SDT — 유능감·자율성·관계성),
  숙달 지향(mastery), 인출 연습(retrieval practice), 분산 학습(spaced),
  즉각 피드백, 목표-경사 효과(goal-gradient), 진행 피드백. 반대로 —
  과도한 외적 보상은 내재 동기를 잠식(overjustification)하므로 정답 1개당
  연출은 최소, 보상의 무게는 "완료·숙달·성장"에 둔다. 도박성 변동비율
  보상(loot box)은 금지.

## 2. Core Loop (현행 구조에 그대로 매핑됨)

```
접속 → [홈] 오늘의 미션 4칸 확인(라이브) → 학습(단어/듣기/퀴즈/발음)
  → 정답 즉시 소보상(별, 라이브) → 카테고리 완료(미션 바 진행)
  → 4/4 완료 → 선물상자(GiftReveal)+별 보너스+XP+티켓(라이브)
  → 모자/밀스톤/앨범 성장(라이브) → [홈] streak/다음 목표 확인
  → 다음날 재방문(streak 유지 동기)
```
빠져 있는 고리: **"다음 목표 공개"의 명시성**(다음 모자/마일스톤까지 남은
양 — P0-next), **숙제 배정 연동 미션**(P1, §4), **주간 챌린지**(P1).

## 3. Reward Economy — 자원 결정

**신규 화폐를 만들지 않는다.** Star(즉시)·XP(성장/레벨)·Ticket(꾸미기 화폐)
3축이 이미 원장 관례(append-only, 저장 합계 금지, `{event}:{기간키}` 멱등
키, 서버측 금액 결정)로 구현돼 있다 — 상세 수치는 RULES §1. Coin 불채택.
주의(인벤토리 확정 사실): `student_progress.total_xp`는 Rank XP가 아니라
totalStars의 레거시 사본 — Rank XP는 `xp_ledger`가 유일 원천.

## 4. Daily Mission

- **현행(라이브)**: 4카테고리×5개(단어 보기/듣기/퀴즈/발음) 라운드 미션.
  4/4 시 별(라운드마다)+XP/티켓(일 1회) — 반복 라운드 구조.
- **제안(P1, 설계+순수 모델 구현 완료·미배선)**: 숙제 배정 연동형 미션
  (`dailyMissionModel.js` — 오늘 배정 단어 수 목표/뜻 퀴즈/철자 쓰기/
  unknown 재학습). 현행 미션과 **다른 축**이므로 교체가 아니라 "오늘의
  숙제 미션" 카드로 병행 도입을 제안(운영자 결정). unknown 0개면 "오늘은
  없음!" 자동 달성 — 불가능 미션 금지.

## 5. Weekly Challenge (P1 — 미구현)

RULES §6. 기간은 기존 `getWeekPeriod`(wordKing/house 공용) 재사용.
완료 지급은 `weekly-streak`/`weekly-event-complete`(이미 planned로 예약된
이벤트 타입) 활성화로 — 서버 `XP_EVENT_TABLE`/`TICKET_GRANT_TABLE`의
status만 active로 바꾸면 지급 인프라는 이미 있다.

## 6. Streak

- **현행(라이브)**: `calcStreak` — categoriesCompleted≥4 연속일. 배지/
  캘린더/다이어리 배경 언락(3/5/7/…30)/스티커 마일스톤(3/7/14/30)/모자
  (7일) 이미 동작.
- **제안(P1, 순수 모델 구현 완료·미배선)**: `streakModel.js` — ①인정
  기준 완화 옵션(categories≥1 또는 정답≥10) ②**주 1회 자동 freeze**(하루
  공백 보호, 연속 공백 불가) ③best 영구 표시(끊겨도 자산 보존 — 좌절
  방지). 학생 표시 의미가 바뀌므로 운영자 승인 후 교체/병행 결정.

## 7. XP / Level

현행 Paul Rank 5랭크 + XP 5이벤트(active) 위에, RULES §3의 레벨 곡선
`25n(n−1)`을 **표시 레이어로만** 얹는다(원장 무변경). 초반 3레벨은 2~3일
내 도달(goal-gradient), 이후 선형 — 초등이 계산 가능한 예측성.

## 8. Stars/Coins 결정 → §3 (Coin 불채택, 기존 3축 유지)

## 9. Badges

현행: "badge=특정 스티커 id(비가챠 확정 지급)" + 별 뱃지(100/300/500/1000)
+ 앨범 밀스톤 + 모자 8종 — 3축이 이미 있다. RULES §5의 12종은 이 축들에
**매핑해 통합**한다(신규 테이블 없이 기존 `record.milestones[]` append +
스티커 확정 지급 경로 재사용). 잠긴 목록+조건 노출 화면은 P1(모자
컬렉션의 잠금 표시 패턴 재사용).

## 10. Paul Collection

자산 실사(인벤토리 §7): PNG 21종(전부 저해상도 111~191px — 추후 고해상도
교체 대상), 요청되었으나 미보유 20종 목록 존재. 현행 수집물: 모자 8종·
스티커·다이어리 배경 9종·정원/마을 데코. **새 이미지 없이 가능한 확장**:
기존 21종 PNG를 "Paul 포즈 카드" 수집물로 재사용(중복 스티커 교환처럼
Ticket 소비처로) — P2. 신규 제작 필요: 의상/배경 레이어(§7의 미보유
목록이 곧 제작 위시리스트).

## 11. Ranking / VIP

단순 총량 순위는 채택하지 않는다(늦게 시작한 학생 영구 불리 — 동기 훼손).
- 현행 Word King이 이미 보정 설계(정확도 0.6+XP 0.4, 소표본 보정) — 재사용.
- House 4팀(팀 단위 — 개인 비교 완화)도 잠재 상태로 존재.
- **개인 성취형 recognition(P1)**: Personal Best(주간 자기 기록 갱신)/
  Most Improved(오답 개선율)/Perfect Homework(주 숙제 100%)/Comeback
  (7일 공백 후 복귀 — 현행 comeback 밀스톤 재사용)/Consistency(주 5일).
  전부 기존 daily/progress 데이터 파생 — 신규 테이블 불필요.

## 12. Celebration UX

현행 자산: HeroReaction(21종)+GiftReveal+HatCeremony+세션 완료 카드 —
계층은 RULES §9(정답≤400ms → 콤보≤800ms → 세션≤1.5s → 미션≤2.5s →
레벨업≤3s, 전부 탭 스킵, transform/opacity만, 동시 1개 큐). 현행 대비
갭: 콤보(5연속) 소연출 없음(P1), 연출 큐잉 규칙 명문화 필요.

## 13. Anti-farming

현행 방어(인벤토리 §2 확정): XP 3중(unique 제약+서버 기간키 검증+세션
가드), 별 grantReward 단일 경로+dedupKey 필수, 티켓 id 멱등. RULES §7의
6규칙 중 미충족 갭: ①단어당 일일 캡의 전면화(현행은 이벤트별 상이)
②관리자 이상 감지 뷰(P1, §14) ③티켓 서버 검증 없음(문서화된 의도 —
코스메틱 전용이라 수용).

## 14. 관리자 기능 (P1 설계)

반별 마스터 스위치(`gamification_enabled` — SQL 미실행이 현재 병목)와
기존 Teacher Controls 위에: 학생별 XP/별/streak/미션 완료/최근 지급
(xp_ledger 최근 N행) 테이블 + 이상 플래그(일 XP>200 등, RULES §7-6) +
수동 보너스 지급(기존 grant-xp의 `special-event` planned 타입을 admin
전용 active로 — source_event_id에 지급 사유 포함 = audit log). 신규
테이블 불필요.

## 15. 연령별 UX

RULES §10 — 데이터/규칙 단일, 표시 프로파일 3종(elementary/middle/high)을
반 단위 설정으로. 현행 구조상 `classes` additive 컬럼 1개(`ux_profile`)
또는 기존 class_settings 재사용 — P2, SQL 설계만.

## 16. 데이터 모델 (현행 그대로 — 신규 테이블 0으로 P0/P1 대부분 가능)

- `xp_ledger`(적용됨) / `student_progress.progress_data`(ticketLedger,
  hatInventory, milestones, starGrantLog) / `student_daily_progress`
  (categories_completed, stars_earned, quiz_*) / `word_status`.
- **미실행 SQL(전부 기존 파일 존재 — 운영자 실행만 남음)**: v2_5
  `classes.gamification_enabled`(최우선), v2_7 house_id+weekly_event,
  v2_6 word_king_history, v2_3_1 인덱스, v3_5 시즌 lifecycle(상태 불명).
- P1 추가 후보(additive 설계만): `reward_events`(RULES §8) — 미션/뱃지/
  streak 지급 멱등 원장 통일. 기존 xp_ledger 관례 복제.

## 17. Event Analytics (§15 지표)

측정 지표: homework completion rate(categories_completed≥4 일수/등원일),
session completion rate, next-day/7-day return, unknown retry rate,
spelling accuracy 추이, streak 참여율, words mastered, 숙제 소요시간.
로깅 인프라: **`product_events`(익명 해시, v3_2)가 이미 있다** — 게임화
전후 비교용 이벤트 추가(`mission_complete`, `streak_milestone`,
`reward_shown` 등)는 trackEvent 호출만. 학생 식별 분석은 기존
weeklyReport/student-analytics 경로(실데이터만, 반응 지어내기 금지).

## 18. P0 / P1 / P2 로드맵

평가축: 학습효과/개발난이도/DB위험/운영난이도/재미/유지율 기대.

**P0 (즉시 — DB 위험 0~SQL 1줄)**
1. `classes.gamification_enabled` SQL 실행 + 반별 토글로 잠재 레이어 점등
   (학습효과 ●●● 난이도 ○ DB위험 additive 1줄 재미 ●●●) — **BLOCKED(승인)**
2. 홈 "다음 목표" 명시화: 다음 모자/밀스톤까지 남은 수치 1줄(파생 계산만,
   기존 evaluateHatUnlocks/milestones 재사용) — 코드 소규모
3. streak best 표시(streakModel 재사용, 표시 전용)
4. 분석 이벤트 추가(trackEvent 3~5개) — 게임화 전후 비교 기반 마련

**P1 (엔게이지먼트)**
5. 숙제 연동 미션 카드(dailyMissionModel 배선, 플래그 기본 OFF)
6. streak freeze 도입(streakModel 교체/병행 — 운영자 결정)
7. 주간 챌린지(planned 이벤트 활성화) 8. 콤보 소연출
9. Badge 12종 통합 화면(잠금+조건 노출) 10. 관리자 게임화 모니터+수동
지급(audit) 11. 개인 성취 recognition

**P2 (확장)**
12. Paul 포즈 카드 수집/의상 레이어(신규 자산) 13. 연령 프로파일
14. reward_events 원장 통일 15. House/Word King 본격 운영(주간 이벤트)

## 19. 구현된 것 / 20. 미구현 (이번 야간 세션 기준)

- **이번 세션 구현(안전·미배선)**: `src/utils/gamification/dailyMissionModel.js`
  + `streakModel.js`(순수, 24단언 테스트, verify:gamification 등록) —
  P1 5·6번의 코어. 학생 UI 배선은 하지 않음(운영 중 학생 화면 무접촉 원칙).
- **기존 구현(라이브)**: §0 목록. **기존 구현(잠재)**: Rank/티켓상점/
  WordKing/House/Season — SQL+토글 대기.
- **미구현**: 주간 챌린지 지급, badge 통합 화면, 관리자 모니터, 콤보 연출,
  연령 프로파일, Paul 카드 수집.

## 21. DB migration 필요사항 (전부 설계/기존 파일 — 실행은 운영자)

| 순서 | 파일 | 내용 | 위험 |
|---|---|---|---|
| 1 | `supabase_v2_5_gamification_master_switch.sql` | classes.gamification_enabled(additive, default false) | 낮음 — 기본 false라 실행해도 화면 무변화, 반별 토글로 점등 |
| 2 | `supabase_v2_6_word_king.sql` | word_king_history 테이블 | 낮음(additive) |
| 3 | `supabase_v2_7_house_system.sql` | students.house_id+백필, classes.weekly_event_enabled | 중간 — students 컬럼 추가라 **GRANT 동반 필수(CLAUDE.md 규칙 10)**, 파일 내 확인 후 실행 |
| 4 | `supabase_v2_3_1_xp_action_based.sql` | 인덱스 1개 | 낮음 |
| 5 | (P1) reward_events 신규 | RULES §8 — 추후 별도 설계 파일 | 낮음(additive) |

## 22. 테스트 결과 / 23. 다음 실행 순서 → 야간 보고서(handoff 81차) 참조.
핵심: verify:gamification 24/24, 기존 전 도메인 회귀 없음(verify:all PASS
기준선 유지), build PASS.

## 20-부록. 연구 근거 상세

- **SDT**: 유능감(진행 바·레벨·숙달 티어), 자율성(보너스 선택 화면·꾸미기
  선택), 관계성(House 팀·Paul 캐릭터 애착). 통제적 보상(마감 압박·상실
  위협)은 금칙 — generatorContract의 금칙 톤 사전과 동일 철학.
- **Overjustification 경계**: 이미 흥미로운 활동에 과한 외적 보상을 걸면
  내재 동기가 준다 — 정답 1개당 보상을 최소(별 1)로, 큰 보상은 "완료·
  숙달·재도전"에만. 보상 예고보다 완료 후 확인형.
- **Retrieval/Spaced practice**: unknown 재학습에 최고 XP 단가(RULES §1),
  Leitner 기반 Memory Engine과 접속 — 게임화가 복습 간격을 앞당기지 않게
  (미션은 "오늘의 복습 큐"를 소비할 뿐 새 반복을 강요하지 않음).
- **Goal-gradient**: 미션 바 4칸·레벨 초반 급성장·"N개 남음" 표시 —
  목표에 가까울수록 노력 증가 효과.
- **Loss aversion 완화**: streak freeze+best 보존 — 상실 공포로 몰지 않고
  회복 서사(Comeback 밀스톤이 이미 존재)를 준다.
