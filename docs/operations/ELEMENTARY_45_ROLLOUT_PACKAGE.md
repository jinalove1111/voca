# 초등 5개 반 / 약 45명 확장 준비 패키지

> **이 문서는 실행 문서가 아니라 준비 패키지다. Production WRITE/SQL/
> 학생 생성/반 생성은 운영자가 별도 승인 후 직접 수행한다.**
>
> 조사는 전부 READ-ONLY(anon key SELECT, 2026-09-11 스냅샷: 20개 반 /
> 493명 학생 / 386개 student_class_assignments(SCA) / 62개 유닛 /
> 2175개 단어)로 수행했다. 이 문서 안의 SQL/명령/절차는 전부 **제안**이며
> 이 세션에서 실행된 것은 0건이다. 모르는 값은 추측하지 않고
> "NEEDS OPERATOR INPUT"으로 표기한다.

**문서 갱신 이력**: 2026-09-11 v3(PR #34 머지·배포 반영, Town V1 정책
확정, v3_50 미적용) — PR #34(Paul Town V1) 머지 커밋 `7c98392` ·
배포 성공 2026-09-10 23:22Z 반영, 신규 8절 "Paul Town V1 현황" 추가,
6절 Pilot A에 실제 대상 5명(READ-ONLY 선정) 반영, 9절(구 8절) 최종
결정 대기 목록에서 이미 확정된 Town 정책 3건 제거. 상세는 8절 참고.

이전: 2026-09-11 v2 — PR #33 merged & deployed
2026-09-10 18:06Z 반영(발음/녹음 저장 실패 시 `onEnd` 다중 호출 P1
수정). 전체를 Phase 1~7 구조로 재편: Phase 1 반 inventory 재확인 ·
Phase 2 rollout 설계 · Phase 3 보상 readiness 체크 · Phase 4 데이터
블로커 분류 · Phase 5 운영자 입력 템플릿 · Phase 6 Pilot A~D · Phase 7
오류 관측성/최종 결정 대기. 이 리비전은 제안 문서이므로 append-only가
아니라 기존 섹션을 실측값 기준으로 갱신했다(핸드오프 규칙 13 예외 —
이 문서는 handoff.md가 아님).

---

## 1. 현재 초등 반 inventory (Phase 1)

READ-ONLY 2026-09-11(PR #33 merged & deployed 2026-09-10 18:06Z 반영)
anon 재스냅샷 기준. "현재 유닛"은 `students.current_unit_id`(앱이
실제로 읽는 필드) 기준이며, SCA 북마크가 이와 다른 경우(같은 교재 내
drift)는 2절에 별도 표기했다.

| 반 | UUID | 전체(총원) | 실학생 | QA/테스트 | spelling(direction/test/hint/repeat) | 숙제(daily_assignments) | READY |
|---|---|---|---|---|---|---|---|
| Presentation 6 | `1693f32b-af23-4364-8d66-d4dc5b20eaa6` | 11 | 8 | 3(`전하은_DUP_20260806_726bbf_INACTIVE`, `전하은_DUP2_f0633d_INACTIVE`, `권교빈_DUP2_f7d36b_INACTIVE`) | kr2en / false / false / 3 | 0행 | READY |
| Pre-Middle School | `39e9acb1-cbd0-4863-8c43-5256b01e784e` | 12 | 11 | 1(Barry) | kr2en / false / false / 3 | 0행 | READY(연결 교재 8종 중 0단어 유닛 2개 주의 — 2절) |
| Pre-middle school 5학년 | `36bcd6fa-36b5-4585-b3d3-f299c87ecee4` | 9 | 9 | 0 | kr2en / false / false / 3 | 0행 | READY |
| (4번째 반) | 없음 | — | — | — | — | — | **NEW CLASS REQUIRED** |
| (5번째 반) | 없음 | — | — | — | — | — | **NEW CLASS REQUIRED** |

### Presentation 6 상세 (`1693f32b-af23-4364-8d66-d4dc5b20eaa6`)

- 연결 교재 3종: 중1 동아 윤정미 10유닛·322단어(유령 유닛 2 — 2절
  참고, 소유 반 혼재 mixed); 중1 천재 이상기 5유닛·200단어(Unit5
  신규 포함); 2학년 천재소영순 7유닛·241단어(유령 유닛 1).
- 현재 유닛(`students.current_unit_id`): Unit5 ×5, Unit4 ×3.
- primary SCA 무결성: 중복 0 · 누락 0 · stale(유효하지 않은 유닛
  참조) 0.
- 비-primary 0단어 유닛 북마크: 0건.
- 진도: `student_progress` 8/8 · 최근 7일 활동 8/8 · `total_stars`
  범위 323~1927.
- 오디오 URL 결손: 0.

### Pre-Middle School 상세 (`39e9acb1-cbd0-4863-8c43-5256b01e784e`)

- 연결 교재 8종: 고1 6월 학평; 중1 동아 윤정미; 중2 동아; 중2
  천재(유령 유닛 1); 중2 능률(0단어 유닛 1·유령 유닛 1); 중2
  YMB(0단어 유닛 1·유령 유닛 1·소유 반 `test_en=true`); 2학년
  천재소영순; 중3 동아 윤정미.
- 현재 유닛: 중3 Unit1(60단어) ×9, 소영순 Unit5 ×1, 동아 Unit6 ×1.
- primary SCA 무결성: 중복 0 · 누락 0 · stale 0.
- 비-primary 0단어 유닛 북마크: 1건 — 학생 `4f3e0b72` → 중2 능률
  Unit 1.
- 진도: 11/11 · 최근 7일 활동 11/11 · `total_stars` 범위 9~2022.
- 오디오 URL 결손: 0.

### Pre-middle school 5학년 상세 (`36bcd6fa-36b5-4585-b3d3-f299c87ecee4`)

- 연결 교재 1종: 중1 천재 이상기.
- 현재 유닛: Unit 1 ×9.
- primary SCA 무결성: 중복 0 · 누락 0 · stale 0.
- 진도: 9/9 · 최근 7일 활동 9/9 · `total_stars` 범위 35~169.
- 오디오 URL 결손: 0.

### 공통 사항

- **발음/녹음**: 반 설정 없이 코드 기본 ON. PR #33(2026-09-10
  18:06Z 배포)으로 저장 mp3 실패 시 `onEnd` 다중 호출 P1이 수정됨.
- **보상 원장**: `reward_ledger`는 service_role 전용(anon SELECT
  401 확인) — `grant-xp`의 idempotency `UNIQUE` 제약으로 중복 지급을
  방지.
- **진도 저장 경로**: `student_progress` upsert(`onConflict
  student_id`, anon 정책 "allow anon all") + `student_daily_progress`
  (unique `student_id,date`) + `word_status`(unique
  `student_id,word_id`).
- **숙제**: 초등 3반 전부 `daily_assignments` 0행 — 해당 유닛 단어
  전체가 노출되는 기본 동작.
- **앱의 현재 유닛 권위 필드**: `students.current_unit_id`(SCA
  북마크와 별개로 존재할 수 있음, 2절 참고).

메모:

- DB에 "Presentation School"이라는 이름의 반은 존재하지 않는다(운영자
  언급과 유사한 이름: "Pre-Middle School" `39e9acb1-...`). 이름 혼동
  가능성이 있으므로 신규 반 계획 전 운영자 확인이 먼저다.
- "Presentation 6 -2026"(`dcd497c2-...`)은 `class_type = 'textbook'`인
  교재 컨테이너 반이며(휴면 5명), 초등 학습 반이 아니다. 4/5번째 반
  후보에서 제외한다.
- **합계: 실학생 28명(8+11+9)** → 45명 목표 대비 **17명 부족**. 신규
  2개 반 신설 + 기존 3개 반 충원을 어떤 조합으로 할지는
  **NEEDS OPERATOR INPUT**(예: 신규 2반에 각 8~9명씩 배정하면 정확히
  45명에 근접하지만, 기존 반 추가 편입 여부는 운영자 결정 사항).

---

## 2. 데이터 블로커 — Phase 4 분류(READ-ONLY 재확인 2026-09-11)

전부 조회만 재수행했고 SQL 실행은 0건이다. 아래 분류는 실행 가능성
기준이다:

- **SAFE CLEANUP**: 실학생 참조 0, FK 영향 없음 — 운영자 승인만
  있으면 즉시 실행 가능.
- **NEEDS OPERATOR DECISION**: 실학생 데이터가 걸려 있어 자동 처리
  불가, 운영자가 제시된 옵션 중 택1.
- **DO NOT TOUCH**: 정상 동작 중이거나 앱이 다른 필드를 읽어 영향이
  없음 — 조치 자체가 불필요.

| 항목 | 현재 상태 | 분류 | 근거 |
|---|---|---|---|
| 중복 유닛 "Unit 7" vs "7"(중1 동아 윤정미) | "Unit 7" `18f59bd6-18ea-426a-b356-e2dc807f3cdb`(40단어, 실학생 SCA 북마크 3: `d4bd8d3d`/`49e9cf6f`/`6ac975c7` — Presentation 6, 비-primary) vs "7" `b16ca5e2-c7d4-4cc8-916c-92628d00573f`(40단어, SCA 참조 0) | **NEEDS OPERATOR DECISION** | "7"에는 실학생 `d4bd8d3d`의 `word_status` 17행 + `spelling_review_queue` 58행이 걸려 있어 삭제 시 CASCADE로 학습 기록 소실 — 자동 삭제 금지. 옵션: (a) "7"의 `word_status`/review 행을 "Unit 7" 동일 단어로 이관 후 "7" 삭제, (b) 그대로 두고 관리자 화면에서 "7" 숨김. |
| 곡선 아포스트로피 | 단어 `d89bf4ce-8edb-4d3e-852b-9259efae0c39` "Why don’t we ~?"(U+2019 곡선)(유닛 "7"; 직선 쌍둥이 `336e1f40` "Why don't we ~?"(U+0027 직선)는 Unit 7에 존재) | **SAFE CLEANUP** | 단어 텍스트 1건을 직선 아포스트로피로 UPDATE — FK 영향 0, 입실시험 스냅샷은 제출 시점 텍스트라 과거 결과 불변. |
| 유령 1단어 유닛 6개 | 유닛 `35ee95ae-545b-4c0c-822b-258127142eed` / `5d9db813-3fc9-45fd-8fe5-bc5e369f1eba` / `113ee184-c5c7-4ee5-8b6c-99d547a06525` / `4bc96928-baf4-41ec-b50a-b8be07dde846` / `3d1c753e-fc1e-4f54-93d3-8dd0a4898939` / `e327efc3-5d35-4b9d-b915-20cb77a79120` — 헤더 단어 `739bec2e-bbfe-47b8-928e-ce492147e923` / `7189faf8-98ef-4071-b48a-ac916590eba2` / `4eb625e1-69af-467d-93ae-639499c14faf` / `aa301dbf-ce88-415f-a653-da031f40f351` / `6f2e9f4c-dabf-48a7-8dca-c737846e6900` / `b9084df0-2c4e-492b-8be4-f237ef62785a` | **SAFE CLEANUP** | 실학생 SCA/students 참조 0, `word_status` 0, review 0; 테스트 계정 북마크 소수는 FK on delete set null로 자동 정리. 순서: 헤더 단어 DELETE(where id in) → 유닛 DELETE(where id in) → post-verify SELECT. |
| 0단어 중2 능률 김기택 Unit 1 | `e4804821-5bab-408f-b2eb-4d991d9d3c22` | **NEEDS OPERATOR DECISION** | 실학생 비-primary SCA 북마크 2건(`4f3e0b72` Pre-Middle, `2a86fc9b` MS Advanced) — 단어 채우기 vs 북마크 재지정 후 삭제. |
| 0단어 중2 YMB Unit 1 | `67c8268e-41b6-4307-918a-47713522f43b` | **NEEDS OPERATOR DECISION** | 실참조 0이지만 YMB 교재 자체는 운영 중 — 채우기 vs 삭제. |
| `students.current_unit_id` ≠ SCA 북마크(같은 교재) 9건 | Presentation 6 8명 + Pre-Middle 1명(`ab5be7a4-...`) | **DO NOT TOUCH** | 앱은 `students.current_unit_id`를 읽으므로 실제 학습 영향 없음 — prod:check notes 채널로 계속 관찰만, 즉시 조치 불요. |
| 초등 실학생 학습 기록 전체 | 진도/북마크/녹음/보상 이력 | **DO NOT TOUCH** | 정상 동작 데이터 — 정리 대상 아님. |

그 외 정상 확인(문제 없음, 참고용): primary SCA 전원 정확히 1개
보유, 교재/유닛 참조 유효, 오디오 URL 2175/2175 존재, 예문 2175/2175
존재, 빈 단어/뜻 0건, 유닛 내 중복 단어 0건, orphan SCA 0건(1절
상세는 각 반 소단락 참고).

---

## 3. 보상 예산 결정 지원

정책 변경 없음. `rewardEngine.js`의 실측 상수를 근거로 한
예산 시뮬레이션이다.

| 구분 | typical(전형) | realistic max(현실적 상한) | theoretical max(이론상 상한) |
|---|---|---|---|
| 학생 1명 / 1일 | 189★ | 277★ | 951★ |
| 45명 / 1일 | 8,505★ | 12,465★ | 42,795★ |

유형별 daily cap(rewardEngine.js 실측 상수) — theoretical max 산출 근거:

| 보상 유형 | 1회당 ★ | 1일 cap | theoretical(★×cap) |
|---|---|---|---|
| word-session-complete | 1 | 1 | 1 |
| writing-complete | 2 | 1 | 2 |
| exam-complete | 2 | 10 | 20 |
| wrong-word-recovered | 1 | 60 | 60 |
| daily-goal-complete | 3 | 1 | 3 |
| streak-bonus | 최대 5 | 1 | 5 |
| pronunciation | 1 | 120 | 120 |
| mission-clear | 3 | 40 | 120 |
| daily-mission-bonus | 10 | 12 | 120 |
| spelling-combo | 최대 3 | 60 | 180 |
| sticker-duplicate | 20 | 15 | 300 |
| matchgame | 4 | 5 | 20 |
| **합계** | | | **951** |

가정:

- **typical**: 40단어 1유닛 첫 학습, 스펠링 콤보 3/5/10 각 1회, 시험
  1회, 오답 복구 5건.
- **realistic**: typical + 7일 연속 streak, 매치게임 5회, 중복 스티커
  2회, 시험 2회, 오답 복구 20건, 콤보 보상 2배 빈도.

원장(서버) 기록 유형 6종과 클라이언트 전용(서버 미기록) 별 6종을
구분한다:

- **서버 원장(reward_ledger) 기록 6종**: word-session, writing,
  daily-goal, streak, wrong-word, exam.
- **클라이언트 전용 별 6종(서버 미기록)**: mission-clear,
  pronunciation, spelling-combo, daily-mission-bonus,
  sticker-duplicate, matchgame.

기술 판단(중복 지급 가능성):

- 동일 idempotency key로의 재요청은 DB `UNIQUE` 제약(에러 코드
  23505)이 정확히 1회만 보장한다.
- 서로 다른 `sourceId`로 동시에 여러 요청이 들어오면, 서버 로직은
  "먼저 count 확인 후 insert"(L3 check-then-insert) 구조라
  in-flight 요청 수만큼 일일 cap을 초과할 수 있다. 단일 기기를 쓰는
  학생 1명 기준으로는 동시 2~3건 수준이 현실적 상한으로 추정된다.
- 선택지: (a) NO CHANGE(현행 유지) / (b) SERVER HARDENING(insert 전
  count 확인을 트랜잭션 또는 RPC로 원자화) / (c) DB GUARD(트리거 또는
  부분 unique index 추가) / (d) DB GUARD REQUIRED(강제 필수 판정).

**판정: SERVER HARDENING RECOMMENDED (DB GUARD는 45명 투입 전 필수 아님)**

근거(2026-09-11 하네스 실측, scripts/testRewardStress45.mjs 26단언 ·
testLoadConcurrency45.mjs 52단언, 네트워크 0): (1) 동일 idempotency
key는 reward_ledger UNIQUE(23505)로 DB가 정확히 1회를 보장 —
더블클릭/새로고침/재시도/재로그인/동시 동일 이벤트 전부 duplicate 0,
stars·XP mismatch 0, 학생 교차 0(12타입×9시나리오×동시성 5/10/20/45).
(2) 남은 갭은 L3 일일 cap의 check-then-insert TOCTOU 하나 — 서로 다른
sourceId N건이 같은 순간 도착하면 cap을 in-flight 수만큼
초과(프로브: cap 10에서 45건 동시 → 초과 44, 기존 testRewardCapRace
KNOWN GAP과 동일). (3) 실사용 노출은 작다: 학생 1명은 기기 1대에서
순차 요청이라 in-flight는 2~3건 수준이고, 서버 원장 6종 중
word-session/writing/daily-goal/streak는 sourceId가 날짜라 경합
자체가 불가, 경합 가능한 wrong-word-recovered(1★, cap 60)·
exam-complete(2★, cap 10)의 초과 피해는 이벤트당 1~2★. 고액 유형
(sticker-duplicate 20★, daily-mission-bonus 10★)은 클라이언트 전용
별이라 이 서버 경합과 무관. (4) 45명 동시 파이프라인(진행도/
word_status/보상)에서 lost update 0, 중복 행 0.

후속(정책 변경 아님, 별도 PR): api/grant-xp.js의 cap 검사+insert를
단일 RPC(SQL 함수, count와 insert를 한 트랜잭션)로 원자화 — 그 시점에
testRewardCapRace/testRewardStress45의 KNOWN GAP 단언을 뒤집는다.
예산 자체(typical 189★/realistic 277★/theoretical 951★ per student)는
운영자 결정 사항으로 유지.

### Phase 3 보상 readiness 체크

- 동일 행동 중복 방지: DB `UNIQUE` idempotency로 보장
  (`testRewardStress45.mjs` 26/26 단언 PASS).
- `writing-complete`는 하루 1회로 제한(idempotency key
  `writing-complete:date` + cap 1).
- `pronunciation` 별은 클라이언트 전용 — `grantReward`의 로컬 dedup
  키 `pronunciation:wordId:date`로만 중복을 막고, 서버 원장에는
  기록되지 않는다(랭킹 XP와 무관).
- `quiz`/`word-session`은 1회/일.
- retry·더블클릭·reload 안전(`testRewardRetryExactlyOneRow.mjs` ·
  `testRewardStress45.mjs`).
- XP↔별 불일치 가능성: 클라이언트 전용 별 6종이 있어 `total_stars`
  ≠ `reward_ledger` 합계가 설계상 정상(별도 reconcile 감사는 NEEDS
  DECISION — anon key로는 `reward_ledger` 조회 자체가 불가하다).
- 45명 규모 stress 테스트 PASS.
- 학생별 isolation PASS(교차 지급 0).
- QA/테스트 계정 제외 적용 범위: 로그인 목록·관리자 디렉터리·
  입실시험 결과·word-king 서버 계산·wordLibrary 로스터 필터에서
  `isTestAccountStudent`/`isArchivedOrFixtureStudentName` 적용
  (`QA_` 접두 반 포함, PR #29). **House 점수 집계에는 명시적 제외가
  없음**(관찰 사항, 처리 여부는 9절 결정 대기).

---

## 4. Phase 2 — 5반/45명 rollout 설계(생성 순서 · FK/unique/idempotency)

아래는 신규 반 생성부터 보상 지급까지 전체 파이프라인의 순서·제약·
멱등성·위험을 단계별로 정리한 설계다. 실제 실행은 0건이며 운영자가
관리자 화면/DB에서 직접 수행한다.

| 순서 | 단계 | 도구(액션) | 제약(FK/unique) | 멱등 재실행 안전성 | 위험 |
|---|---|---|---|---|---|
| 1 | class 생성 | 관리자 화면 | `classes` name unique index | 이름 중복 시 unique index로 거부(재실행해도 안전, 에러로 즉시 확인 가능) | 이름 오타로 별도 반이 생성되면 혼동 |
| 2 | textbook 연결/재사용 | 관리자 화면(교재 관리) | `units (class, normalized name)` unique index | 유닛명 중복 생성 시 unique index로 거부 | 재사용 교재는 **소유 반**에서 spelling 설정이 해석됨(아래 참고) — 소유 반을 잘못 알면 설정이 다른 반에 영향 |
| 3 | `class_textbooks` 연결 | 관리자 화면 class_textbooks | class_id FK | 이미 연결돼 있으면 중복 연결 시도는 무해(가정 — 실제 unique 제약 확인은 NEEDS OPERATOR INPUT) | 교재 미연결 → 학생 화면에 교재 없음 |
| 4 | student 생성 | `create_student`(클라이언트 UUID 멱등키, service_role. anon INSERT는 v3_16으로 회수됨) | `students.name` NOT unique(동명이인 지원) — 식별은 UUID만 | 같은 UUID로 재호출하면 멱등(같은 학생 재사용), 다른 UUID로 재호출하면 동명이인 신규 생성 → **반드시 관리자 화면에서 1회만** 실행 | 실수로 재실행하면 동명이인 중복 학생 생성 |
| 5 | student_class_assignments(홈 SCA) | `create_student` 시 자동 생성 | SCA unique(`student_id, class_id`) | 이미 존재하면 unique로 재삽입 불가(안전) | 없음(자동 생성) |
| 6 | primary assignment | `set_primary_textbook` / `set_primary_assignment`(유령 유닛 거부, 학습 가능 유닛 폴백 가드 내장) | SCA unique(`student_id, class_id`) 재사용 | 이미 primary면 재호출해도 무해(idempotent update) | primary 없음 → `resolveStudentUnitObj` null → "단어가 없어요" 카드 |
| 7 | current_unit 설정 | `set_student_unit`(UUID 저장) | `students.current_unit_id` FK | 동일 유닛으로 재호출하면 무해 | 유령 유닛(단어 0개) 지정 시 쓰기 가드가 거부(코드 보호 있음) |
| 8 | initial progress | 별도 INSERT 불필요 | `student_progress` unique(`student_id`); `student_daily_progress` unique(`student_id, date`); `word_status` unique(`student_id, word_id`) | 첫 로그인 시 upsert로 자동 생성 | 사전 INSERT 시도는 오히려 unique 충돌 위험 — **하지 말 것** |
| 9 | login/access(PIN) | `set_pin_setup_allowed` → setup code(20분 유효) → 학생이 직접 PIN 생성 | `pin_setup_allowed` 플래그, setup code TTL | 재요청 시 새 코드 발급(이전 코드 무효화 여부는 NEEDS OPERATOR INPUT 확인 필요) | 20분 내 PIN 미생성 시 재요청 필요 |
| 10 | spelling 설정 | 교재 **소유 반** 설정(`spelling_direction`/`spelling_test_enabled`) | 없음(반 설정 컬럼) | 설정값 재저장은 단순 UPDATE라 멱등 | 재사용 교재는 소유 반 설정이 그 교재를 쓰는 **모든** 반에 영향 |
| 11 | pronunciation | 코드 기본 ON, 반 설정 없음 | 없음 | N/A | 없음 |
| 12 | reward | `grant-xp`(`reward_ledger.idempotency_key` unique, `xp_ledger` unique(`student_id, source_event_id`)) | 위 unique 2종 | 동일 idempotency_key 재요청은 DB가 정확히 1회로 보장 | 3절 SERVER HARDENING 권장 참고(다른 sourceId 동시 요청 시 cap 초과 가능성, LOW) |

재사용 교재 원칙 재명시: 중1 천재 이상기(`0a87be08-50c5-4896-a0c1-
b3d559acffaa`)를 신규 반에서 재사용할 경우, 유효한 spelling 설정은
그 교재를 **소유한 반** `2724dc62-3149-4f0d-afa3-a697392b10f1`에서
해석된다(신규 반 자체의 spelling 설정 값은 무시됨).

실제 INSERT/UPDATE는 이 문서에서 0.

---

## 5. Phase 5 — 운영자 입력 템플릿(UUID 없음)

아래 템플릿에 운영자가 값을 채우면 4절 순서대로 실행에 들어갈 수
있다. UUID/SCA/PIN setup code는 이 단계에서 채우지 않는다 — 전부
실행 시스템(관리자 화면/서버 액션)이 생성·조회한다.

### 신규 반 A

| 항목 | 값 |
|---|---|
| 반 이름 | NEEDS OPERATOR INPUT |
| class_type | `regular`(고정) |
| 연결 교재 | ☐ 중1 천재 이상기 ☐ 2학년 천재소영순 ☐ 중3 동아 윤정미(동아) ☐ 기타: __________ |
| 시작 Unit | NEEDS OPERATOR INPUT(교재의 유닛명, 예: "Unit 1") |
| 쓰기 | 쓰기 연습 양방향은 자동(항상 mixed) — 일일 의식에 쓰기 포함 ☐(포함 시 교재 소유 반 설정 변경 필요) |
| 숙제 | ☐ 유닛 전체 자동(기본) ☐ 관리자 배정 사용 |
| 예상 학생 수 | NEEDS OPERATOR INPUT |

### 신규 반 B

| 항목 | 값 |
|---|---|
| 반 이름 | NEEDS OPERATOR INPUT |
| class_type | `regular`(고정) |
| 연결 교재 | ☐ 중1 천재 이상기 ☐ 2학년 천재소영순 ☐ 중3 동아 윤정미(동아) ☐ 기타: __________ |
| 시작 Unit | NEEDS OPERATOR INPUT(교재의 유닛명, 예: "Unit 1") |
| 쓰기 | 쓰기 연습 양방향은 자동(항상 mixed) — 일일 의식에 쓰기 포함 ☐(포함 시 교재 소유 반 설정 변경 필요) |
| 숙제 | ☐ 유닛 전체 자동(기본) ☐ 관리자 배정 사용 |
| 예상 학생 수 | NEEDS OPERATOR INPUT |

### 학생 로스터 템플릿

신규 2개 반 + 기존 3개 반 충원분을 합쳐 부족한 17명(또는 운영자가
정한 인원)만큼 행을 추가한다. 이름/영어이름/반 배정은 전부
NEEDS OPERATOR INPUT — 이 문서에서 임의로 채우지 않는다.

| # | 학생 이름(한글) | English name | 반 | 비고(동명이인 여부) |
|---|---|---|---|---|
| 1 | NEEDS OPERATOR INPUT | NEEDS OPERATOR INPUT | NEEDS OPERATOR INPUT | |
| 2 | NEEDS OPERATOR INPUT | NEEDS OPERATOR INPUT | NEEDS OPERATOR INPUT | |
| 3 | NEEDS OPERATOR INPUT | NEEDS OPERATOR INPUT | NEEDS OPERATOR INPUT | |
| … | (필요한 만큼 행 추가, 최소 17행 예상) | | | |

---

## 6. Phase 6 — Pilot A~D

4단계로 파일럿을 확대하며, 각 단계는 이전 단계가 전부 PASS해야만
시작한다.

| 항목 | 확인 방법 |
|---|---|
| login | 로그인 성공 |
| word load | 올바른 교재·유닛으로 진입, 단어 목록 로드 |
| audio | 발음 듣기 정상 재생 |
| recording | 녹음 저장 정상(PR #33 반영 후 재확인) |
| spelling(양방향 1문제씩) | kr2en 1문제 + en2kr 1문제 정상 채점 |
| quiz | 퀴즈 진입·채점 정상 |
| progress save(재접속 후 유지) | 로그아웃 → 재로그인 후 진도 유지 확인 |
| reward(정확히 1회) | 동일 행동 반복 시 보상이 정확히 1회만 지급 |
| duplicate | 운영자 SQL Editor READ-ONLY: `SELECT idempotency_key, COUNT(*) FROM reward_ledger GROUP BY idempotency_key HAVING COUNT(*) > 1;` 결과 0행 |
| mobile(360~412) | 뷰포트 360~412px에서 레이아웃 정상 |
| reload · retry | 새로고침/재시도 시 중복 처리 없음 |

이 체크리스트(위 표)를 아래 각 파일럿에 동일하게 적용한다.

### Pilot A — 기존 학생 5명

- 대상: 기존 3개 반(Presentation 6 / Pre-Middle School / Pre-middle
  school 5학년)에서 1~2명씩 총 5명. **Town V1(8절) 파일럿 대상으로
  READ-ONLY 조회 기준 이미 선정 완료**(실행/플래그 ON은 0건): 예지
  `1c585815-...` · Cherry `bf05032a-...` · 이동훈 `80700290-...` ·
  신지율 `a31037a3-...` · Lucas `17eafbbe-...`. 이 5명은 일반 45명
  확장 Pilot A와 Town V1 Pilot A를 겸한다.
- 기간: 숙제 1회 완료 또는 24시간 중 먼저 도달하는 시점까지.
- 위 체크리스트 전항목 PASS 필요. Town(`paulTownV1`)을 함께 켜서
  진행할 경우 8절 "Pilot A 게이트 추가 항목(Town)"도 동시 충족해야
  한다.

### Pilot B — 10명

- 대상: 기존 반 추가 + (있다면) 신규 반 초기 학생 포함, 총 10명.
  구성은 **NEEDS OPERATOR INPUT**.
- 기간: 숙제 1회 완료 또는 24시간.
- 위 체크리스트 전항목 PASS 필요.

### Pilot C — 새 반 1개 전체

- 대상: 신규 반 A 또는 B 중 먼저 준비된 반 전체(약 8~9명). 반 지정은
  **NEEDS OPERATOR INPUT**.
- 기간: 숙제 1회 완료 또는 24시간.
- 위 체크리스트 전항목 PASS 필요.

### Pilot D — 5개 반 약 45명 전체

- 대상: 최종 5개 반 전원.
- **사전조건**: 착수 전 `prod:check` READ-ONLY PASS 필수.
- 기간: 숙제 1회 완료 또는 24시간.
- 위 체크리스트 전항목 PASS 필요.

### STOP 조건(4개 파일럿 공통)

항목 하나라도 FAIL 또는 학생 간 데이터 노출 1건 → 해당 배치 즉시
중단, 해당 배치 전원 PIN 회수(`clear_student_pin`) + 원인 조사. 원인
해소·재검증 전에는 다음 파일럿으로 진행하지 않는다.

---

## 7. 오류 관측성 현황(코드 확인)

- PR #33(2026-09-10 18:06Z 배포)으로 발음 녹음 저장 실패 시 `onEnd`
  다중 호출 P1이 수정됨 — 관측성 인프라가 아니라 재현 테스트로
  확인·수정된 버그 자체의 수정이지만, 파일럿 단계에서 재확인 대상.
- `product_events`는 `anon_id`(sha256 앞 16 hex) + `event` + `day`만
  저장한다(개인 추적 불가, 설계 의도).
- 클라이언트 `AppErrorBoundary`는 `console.error`만 수행하고 서버로
  전송하지 않는다.
- 앱 버전/커밋 스탬프는 현재 코드에 없다.
- 서버 함수 로그는 Vercel 함수 로그로만 남는다(console 호출 4곳).
- 입실시험(placement) 오답의 input/expected/direction은 PR #31로
  저장이 시작됐다.

최소 개선 후보(P2, 이번 문서에서 코드 변경은 0건):

1. 빌드 시 `import.meta.env.VITE_BUILD_SHA`를 주입하고
   ErrorBoundary 로그에 포함.
2. 로그인 실패 사유(reason)별 카운트 집계 — 서버 응답에 이미
   `reason` 필드가 존재하므로 대시보드 조회만 추가하면 된다(코드
   변경 없음, 조회 스크립트 추가 수준).
3. 보상 누락 의심 시 조회용 READ-ONLY SQL 스니펫: 학생별·일자별
   `reward_ledger` 합계 vs `student_progress.total_stars` 비교.

**대규모 로깅 인프라 도입은 이 범위에서 명시적으로 배제한다.**

---

## 8. Paul Town V1 현황(PR #34, 2026-09-11 아침 기준)

### 배포 상태

- PR #34 **머지 및 배포 완료** — 머지 커밋 `7c98392`, 배포 성공
  2026-09-10 23:22Z, 배포 번들은 직전 번들과 byte-identical(기능
  플래그가 기본 OFF라 실사용자 영향 0).
- 기능 플래그 `paulTownV1` 기본값 **OFF**(배포 번들 확인:
  `paulTownV1:!1`), `townShopV1`도 **OFF**. 두 플래그 모두 관리자
  화면(FeatureManagementPanel)에서 기기별(device-local)로만 켤 수
  있다 — 서버 강제 ON 없음.
- 플래그가 꺼져 있는 한 학생 경험은 이전과 동일(Town 화면 진입 불가,
  기존 로그인/학습/퀴즈/동기화 플로우 영향 0).

### v3_50 마이그레이션 — 미적용

- `supabase_v3_50_town_v1.sql`은 **아직 프로덕션에 적용되지
  않았다**(이 세션 READ-ONLY 확인 기준).
- 적용 패키지 구성: `supabase_v3_50_town_v1.sql` +
  `supabase_v3_50_town_v1_ROLLBACK.sql` +
  `supabase_v3_50_town_v1_POST_VERIFY.sql` + 운영자용
  `production_v3_50_baseline_and_post_verify.sql`(실행 순서: PRE
  BLOCK A → 마이그레이션 적용 → POST BLOCK B/C/D/E).
- 예상 변화량(BASELINE 대비): `town_items` 1행 → 17행, 신규 컬럼
  +4개, 함수 신규 +2개 / 교체 1개, `dollar_ledger` ·
  `reward_ledger` · `students` · `student_progress` 행 수 변화
  **0**(데이터 마이그레이션 없음, 순수 스키마·시드 추가).
- **v3 시점에 수정 중**: `production_v3_50_baseline_and_post_verify.sql`의
  사전 함수 존재 확인 블록이 42883(존재하지 않는 함수 조회 시 오류)
  로 실패하는 문제 — 사전 체크는 함수 부재 시에도 에러 없이
  "미존재"로 보고하도록 수정 작업이 진행 중이다.

### 운영 현황(WRITE 0)

- Production WRITE는 이 트랙 전체에서 **0건**(스키마 미적용 포함).
- Pilot A는 아직 **활성화되지 않았다** — 대상 5명 선정(READ-ONLY)만
  완료됐고, 실제 플래그 ON·Town 방문은 0건.
- welcome 크레딧은 아직 **누구에게도 지급되지 않았다**(0건).

### 확정된 정책(운영자 결정 완료 — 9절 최종 결정 대기에서 제외)

- **welcome 지급**: 모든 학생의 Town **첫 방문**에 20 PD 지급.
  기존 학생도 포함(신규 가입 학생에 한정하지 않음), 소급(backfill)
  지급은 없음(배포 이전 방문 기록에 대한 사후 지급 없음). 평생
  정확히 1회만 지급되도록 UNIQUE idempotency 키로 보장한다. 활성화
  조건은 Vercel 환경변수 `TOWN_V1_WELCOME_ENABLED=1` **AND** 기기별
  `paulTownV1` 플래그 ON을 모두 충족해야 한다(둘 중 하나만 켜져
  있으면 지급 안 됨).
- **상점 가격**: 현재 가격 변경 없음(Pilot A 실사용 데이터 확보 후
  조정 검토).
- **`dollar_rules`(화폐 환전/적립 비율)**: 변경 없음.
- **비주얼(아이템 이미지)**: 파일럿 단계에서는 emoji/assetKey
  폴백 표시를 허용한다. 최종 일러스트는 이후 `TOWN_ASSETS` 맵으로
  교체한다. **폴(Paul) 얼굴 일러스트는 어떤 경우에도 다시 그리지
  않는다**(기존 자산 유지).
- **rollout 순서**: Pilot A(기존 학생 5명 — 예지 `1c585815-...` ·
  Cherry `bf05032a-...` · 이동훈 `80700290-...` · 신지율
  `a31037a3-...` · Lucas `17eafbbe-...`, READ-ONLY로 이미 선정
  완료) → Pilot B(10명) → 신규 반 1개 전체 → 5개 반 약 45명 전체.
  이 순서는 6절의 일반 45명 확장 Pilot A~D 단계와 동일 구조를
  공유한다(대상 학생이 겹칠 수 있음).

### Pilot A 게이트 추가 항목(Town, `paulTownV1` ON 전제)

Town 기능을 함께 켜고 Pilot A를 진행할 경우, 6절 공통 체크리스트에
아래 항목을 추가로 통과해야 한다:

| 항목 | 확인 방법 |
|---|---|
| welcome 지급 정확히 1회 | 운영자 SQL Editor READ-ONLY: `SELECT student_id, COUNT(*) FROM dollar_ledger WHERE source_type='welcome' GROUP BY student_id HAVING COUNT(*)<>1;` 결과 0행(첫 방문 학생당 정확히 1행) |
| 구매 1회 → 잔액 반영 | 구매 1건마다 `town_purchases` 1행 생성 + 지갑 잔액이 정확히 가격만큼 감소 |
| 배치 재접속 유지 | 로그아웃 → 재로그인, 새로고침(reload) 후에도 인벤토리·잔액 유지 |
| ⭐(`total_stars`) 불변 | Town 방문·구매 전후 `student_progress.total_stars` 값 변화 없음(기존 별 체계와 분리된 화폐) |

진단 도구: `production_pilot_student_diagnostic.sql`(운영자 SQL
Editor, READ-ONLY 조회 전용) + `scripts/pilotStudentDiag.mjs
--student <uuid>`(작성 중). 두 도구 모두 READ-ONLY이며 이 세션
실행은 0건이다.

---

## 9. 최종 결정 대기 목록

1. 신규 2개 반(A/B)의 이름 / 학생 수 / 사용 교재(5절 템플릿 작성).
2. 부족한 17명을 신규 2반 vs 기존 3반 충원 중 어떤 조합으로 배정할지.
3. 일일 의식에 쓰기 시험을 포함할지(교재 소유 반
   `spelling_test_enabled` 설정 변경 여부).
4. 데이터 블로커 처리 실행 여부·순서(2절): (a) "Unit 7"
   (`18f59bd6-...`) vs "7"(`b16ca5e2-...`) — "7"의 학습 기록을
   "Unit 7"로 이관 후 삭제 vs 관리자 화면 숨김만, (b) 0단어 Unit 1
   두 건(중2 능률 `e4804821-...`, 중2 YMB `67c8268e-...`) 단어
   채우기 vs 삭제 vs 방치, (c) 유령 1단어 유닛 6개(SAFE CLEANUP
   분류 완료) 실제 삭제 실행 승인, (d) 곡선 아포스트로피 단어 1건
   (SAFE CLEANUP 분류 완료) 실제 UPDATE 실행 승인.
5. 3절 보상 예산 판정 후속 조치 — `grant-xp`의 cap 검사+insert를
   단일 RPC로 원자화(SERVER HARDENING)할 착수 시점.
6. House 점수 집계에 QA/테스트 계정 제외 로직(`isTestAccountStudent`
   등)을 추가할지 여부.
7. 유령 유닛(0/1단어) 재발을 막을 "교재 관리 화면 self-heal"(생성 시
   헤더 잔재 자동 정리) 도입 여부.
8. `wrong_answer_repeat` 값의 실제 의미와 활용 여부(현재 코드
   미소비).
9. v3_50 마이그레이션 적용 시점(8절 — 42883 사전 체크 수정 완료
   후로 예상, 확정 일정은 운영자 결정).
10. `TOWN_V1_WELCOME_ENABLED` 환경변수 활성화 시점(파일럿 단계별로
    언제 켤지 — Pilot A부터 즉시 vs 검증 후).
11. Town 최종 일러스트 자산 제작 일정(현재 emoji/assetKey 폴백 상태,
    8절 참고).
12. Pilot B~D(6절/8절)의 실명/반 구성 확정(Pilot A 5명은 이미 확정
    완료).
