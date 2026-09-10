# 초등 5개 반 / 약 45명 확장 준비 패키지

> **이 문서는 실행 문서가 아니라 준비 패키지다. Production WRITE/SQL/
> 학생 생성/반 생성은 운영자가 별도 승인 후 직접 수행한다.**
>
> 조사는 전부 READ-ONLY(anon key SELECT, 2026-09-11 스냅샷: 20개 반 /
> 493명 학생 / 386개 student_class_assignments(SCA) / 62개 유닛 /
> 2175개 단어)로 수행했다. 이 문서 안의 SQL/명령/절차는 전부 **제안**이며
> 이 세션에서 실행된 것은 0건이다. 모르는 값은 추측하지 않고
> "NEEDS OPERATOR INPUT"으로 표기한다.

---

## 1. 현재 초등 반 inventory

READ-ONLY 2026-09-11 anon 스냅샷 기준. "현재 유닛"은
`students.current_unit_id`(앱이 실제로 읽는 필드) 기준이며, SCA
북마크가 이와 다른 경우(같은 교재 내 drift)는 별도 표기했다.

| 반 | UUID | 실학생 | QA/테스트 | primary 교재(전원) | 현재 유닛(students.current_unit_id) | SCA primary/non-primary | spelling_direction | spelling_test_enabled | hint | wrong_answer_repeat | 숙제(daily_assignments) | 최근 7일 활동 | READY |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Presentation 6 | `1693f32b-af23-4364-8d66-d4dc5b20eaa6` | 8 | 3(`_DUP`/`_INACTIVE`) | 중1 천재 이상기 ×8 | Unit4 ×3·Unit5 ×5 (SCA 북마크는 Unit 1 ×8 — 같은 교재 내 drift, LOW) | 8 / 23 | kr2en | false | false | 3 | 0행 | 8/8 | READY |
| Pre-Middle School | `39e9acb1-cbd0-4863-8c43-5256b01e784e` | 11 | 1(Barry) | 중3 동아 윤정미(동아) ×9 + 2학년 천재소영순 ×1 + 중1 동아 윤정미 ×1 | 중3 Unit1 ×9·소영순 Unit5·동아 Unit6 | 11 / 32 | kr2en | false | false | 3 | 0행 | 11/11 | READY(연결 교재 8종 중 0단어 유닛 2개 주의 — 2절 참고) |
| Pre-middle school 5학년 | `36bcd6fa-36b5-4585-b3d3-f299c87ecee4` | 9 | 0 | 중1 천재 이상기 ×9 | Unit 1 ×9 | 9 / 9 | kr2en | false | false | 3 | 0행 | 9/9 | READY |
| (4번째 반) | 없음 | — | — | — | — | — | — | — | — | — | — | — | **NEW CLASS REQUIRED** |
| (5번째 반) | 없음 | — | — | — | — | — | — | — | — | — | — | — | **NEW CLASS REQUIRED** |

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
- 신규 관측: 2026-09-11 스냅샷에서 중1 천재 이상기 교재에 Unit5
  (`fd6462fc-9f25-475f-961d-1d4c3f365dc2`, 40단어)가 추가되어 있음이
  확인됐다(운영자 작업으로 추정 — 이 세션의 변경 아님).

---

## 2. 데이터 블로커(READ-ONLY audit, 수정 0건)

전부 조회만 수행했고 SQL 실행은 0건이다. 실행 여부/순서는 운영자가
결정한다.

| 분류 | UUID | 현재 값 | 기대 값 | 영향 학생 | 위험 | 운영자 조치 |
|---|---|---|---|---|---|---|
| GHOST UNIT(1단어 헤더 잔재, 초등 참조 0) | `35ee95ae-545b-4c0c-822b-258127142eed`(중1 동아 윤정미) | 유닛명 "Unit", 단어 `739bec2e-bbfe-47b8-928e-ce492147e923`("English"/"Korean") | 삭제 대상 헤더 잔재 | 0 | LOW | 단어 삭제 후 유닛 삭제(SQL 파일 준비 → 운영자 실행) |
| GHOST UNIT | `5d9db813-3fc9-45fd-8fe5-bc5e369f1eba`(중1 동아) | 유닛명 "Unit1", 단어 `7189faf8-98ef-4071-b48a-ac916590eba2`("No."/"어휘·어구") | 삭제 대상 헤더 잔재 | 0 | LOW | 동일 |
| GHOST UNIT | `113ee184-c5c7-4ee5-8b6c-99d547a06525`(2학년 천재소영순) | 유닛명 "Unit", 단어 `4eb625e1-69af-467d-93ae-639499c14faf`("어휘·어구"/"의미") | 삭제 대상 헤더 잔재 | 0 | LOW | 동일 |
| GHOST UNIT | `4bc96928-baf4-41ec-b50a-b8be07dde846`(중2 YMB) | 단어 `aa301dbf-ce88-415f-a653-da031f40f351` | 삭제 대상 헤더 잔재 | 0 | LOW | 동일 |
| GHOST UNIT | `3d1c753e-fc1e-4f54-93d3-8dd0a4898939`(중2 능률) | 단어 `6f2e9f4c-dabf-48a7-8dca-c737846e6900` | 삭제 대상 헤더 잔재 | 0 | LOW | 동일 |
| GHOST UNIT | `e327efc3-5d35-4b9d-b915-20cb77a79120`(중2 천재) | 단어 `b9084df0-2c4e-492b-8be4-f237ef62785a` | 삭제 대상 헤더 잔재 | 0 | LOW | 동일 |
| DUPLICATE UNIT | 중1 동아 윤정미: "Unit 7" `18f59bd6-18ea-426a-b356-e2dc807f3cdb`(40단어) vs "7" `b16ca5e2-c7d4-4cc8-916c-92628d00573f`(40단어, 39/40 단어 동일) | 두 유닛 병존 | 하나로 통합 | 초등 학생 SCA 참조 3 | MEDIUM(유닛 목록 중복 노출·진도 분산) | 참조 SCA를 "Unit 7"로 이동 후 "7" 삭제(운영자 결정) |
| CURLY QUOTE | 단어 `d89bf4ce-8edb-4d3e-852b-9259efae0c39`("Why don't we ~?", 유닛 "7", 곡선 아포스트로피 `'`) | 곡선 따옴표 | 직선 아포스트로피 `'` | kr2en 문항 응시 전원(오답 확정) | HIGH(해당 문항) | word를 "Why don't we ~?"(직선)로 정정 — 또는 채점기에 곡선/직선 동등 처리 정책 도입(택1, 운영자 결정) |
| 0-WORD UNIT | 중2 능률 김기택 Unit 1 `e4804821-5bab-408f-b2eb-4d991d9d3c22` | 단어 0개 | 단어 채움 또는 유닛 제거 | 초등 Pre-Middle 학생 S*** `4f3e0b72`가 비-primary SCA `1e02ed69-3ba6-41ad-bd02-568803aead65`로 이 유닛을 북마크 → 교재 전환 시 0단어 화면 | HIGH/MEDIUM | 단어 채우기 또는 유닛 제거 + 북마크 재지정 |
| 0-WORD UNIT | 중2 YMB Unit 1 `67c8268e-41b6-4307-918a-47713522f43b` | 단어 0개 | 단어 채움 또는 유닛 제거 | 초등 참조 0 | MEDIUM | 동일 |
| LONG MEANING | 단어 `a42894a0-97c9-4793-9229-e2e059a84c68`("참고로 (=for your information)", 27자) | 27자 뜻 | 화면 표시 길이 검토 대상 | 미상(길이만 확인, 학생 영향 미측정) | LOW | 필요 시 축약, 급하지 않음 |
| current_unit_id ≠ SCA 북마크(같은 교재 내) | Presentation 6 8명 + Pre-Middle 1명(`ab5be7a4-...`) | students.current_unit_id와 SCA 북마크 유닛 상이 | 일치 권장(운영 편의) | 9명 | LOW — 앱은 `students.current_unit_id`를 읽으므로 실제 학습 영향 없음 | prod:check notes 채널로 계속 관찰만, 즉시 조치 불요 |

정상 확인(문제 없음, 참고용): 초등 실학생 28명 전원 primary SCA
정확히 1개 보유, 교재/유닛 참조 유효, 오디오 URL 2175/2175 존재,
예문 2175/2175 존재, 빈 단어/뜻 0건, 유닛 내 중복 단어 0건, orphan
SCA 0건.

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

---

## 4. 신규 2개 반 creation package(생성하지 않음)

아래는 신규 반 2개에 대한 템플릿 초안이다. 실제 생성은 운영자가
관리자 화면에서 직접 수행한다.

| 항목 | 값 |
|---|---|
| class name | NEEDS OPERATOR INPUT |
| class_type | `'regular'` |
| 교재 | 중1 천재 이상기 `0a87be08-50c5-4896-a0c1-b3d559acffaa` 재사용 여부 NEEDS OPERATOR INPUT(기존 2개 반이 이미 이 교재를 사용 중 — Presentation 6, Pre-middle school 5학년) |
| spelling_direction | `kr2en`(홈 반 값. 단, 유효 설정은 **교재를 소유한 반** `2724dc62-3149-4f0d-afa3-a697392b10f1`에서 해석됨에 유의) |
| spelling_test_enabled | `false`(현행 3개 반과 동일. 일일 의식에 쓰기 시험을 포함하려면 **교재 소유 반**을 `true` + `mixed`로 설정) |
| hint | `false` |
| wrong_answer_repeat | `3`(현재 코드에서 미소비 상태 — 사용 여부는 결정 대기) |
| 발음(pronunciation) | 기본 ON(반별 별도 설정 없음) |
| 보상 | 코드 기본값 그대로(rewardSystem 관련 기능 플래그 상태와 무관하게 별/원장 지급은 기본 동작) |
| 숙제(daily_assignments) | 행이 없으면 해당 유닛의 단어 전체가 노출됨(기본 동작) |
| 초기 유닛 | Unit 1 `36bba4d0-cb16-4a13-b46d-88be3e0efca7`(중1 천재 이상기 교재 사용 시) |
| 예상 학생 수 | NEEDS OPERATOR INPUT |

반 생성 순서(제안):

1. 관리자 화면에서 반 생성.
2. `class_textbooks` 연결(관리자 화면).
3. 설정 확인 — READ-ONLY SELECT로 반/교재 설정값 재확인.
4. QA 계정 1개 생성(이름 `QA_...` 접두 — 통계 집계에서 자동 제외됨).
5. 스모크 테스트: 로그인 → 유닛 진입 → 단어 학습 → 쓰기 → 퀴즈 →
   보상 지급 확인.
6. 실학생 등록.

SCA(student_current_assignments) 생성 순서(제안):

1. 관리자 `create_student`(홈 SCA 자동 생성).
2. primary 교재 배정 — `set_primary_textbook`(유령 유닛 가드 내장).
3. `pin_setup_allowed` 활성화.
4. 학생이 직접 PIN 생성(setup code 유효시간 20분).

롤백 메모: 학생 0명 상태에서의 반 삭제는 `class.delete`가 학습 기록이
있으면 차단한다(`has_learning_data` 가드). 학생을 다른 반으로
이동시키려면 `set_student_class`를 사용한다.

검증 SELECT 예시(READ-ONLY, 실행은 운영자):

- 반별 `students` count.
- SCA `primary = true` count = 해당 반 학생 수와 일치 확인.
- `current_unit`에 연결된 단어 수 ≥ 2 확인(1단어 GHOST UNIT 재발 방지).

---

## 5. 45명 onboarding 절차 비교

세 가지 방식을 비교한다.

| 방식 | 내용 |
|---|---|
| (A) 일괄 45 | 45명 전원을 한 번에 온보딩 |
| (B) staged 5→10→15→15 | 4단계로 나누어 순차 확대 |
| (C) 반 단위(9명씩 5회) | 반이 완성될 때마다 그 반 학생 전원(약 9명)을 온보딩 |

**권장: (B) 또는 (C).** 근거: 17명(전체의 약 38%)이 신규 반 소속이라
기존 반보다 검증되지 않은 요소(신규 반 설정, 신규 SCA 배정 경로)가
많다. (A) 일괄 45는 문제 발생 시 원인 반/학생을 좁히기 어렵고
동시다발 실패가 서비스 전체를 덮을 위험이 있다. (B)는 초기 소규모
배치로 근본 문제를 조기에 걸러내고 이후 배치 크기를 키워 속도를
확보한다. (C)는 반 단위로 원인 격리가 가장 쉽지만 신규 반 완성
시점에 좌우돼 일정이 유동적이다. 최종 선택은 운영자 일정에 달려
있으므로 (B)/(C) 중 택1은 **NEEDS OPERATOR INPUT**.

각 단계 rollback 조건(하나라도 해당하면 해당 배치 즉시 중단):

- 로그인 실패 1건 이상 미해결.
- 진도 유실 1건 이상.
- 보상 중복 지급 1건 이상.
- 타 학생 데이터 노출 1건 이상.

중단 시 조치: 해당 배치 학생의 PIN 회수(`clear_student_pin`) + 원인
조사. 원인 해소·재검증 전에는 다음 배치로 진행하지 않는다.

배치 사이 최소 조건: 이전 배치 학생의 숙제 완료 1회 이상 확인 +
READ-ONLY `prod:check` PASS.

---

## 6. Pilot gate

각 반에서 1~2명(총 5~10명)을 우선 투입해 24시간 또는 숙제 1회 완료
후 아래 체크리스트를 전부 PASS해야 다음 배치로 진행한다.

- [ ] 로그인 성공
- [ ] 올바른 교재로 진입
- [ ] 올바른 유닛으로 진입
- [ ] 숙제 완료 처리 정상
- [ ] 스펠링 양방향(kr2en/en2kr) 정상 동작
- [ ] 발음 듣기/녹음 정상 동작
- [ ] 보상 최소 1회 지급 확인
- [ ] 진도 보존(재접속 후 이어서 학습 가능) 확인
- [ ] 중복 보상 0건 — READ-ONLY:
      `SELECT idempotency_key, COUNT(*) FROM reward_ledger GROUP BY idempotency_key HAVING COUNT(*) > 1;`
      결과 0행
- [ ] 학부모/학생 민원 0건

전부 PASS해야만 다음 배치로 진행한다. 하나라도 FAIL이면 5절의
rollback 절차를 따른다.

---

## 7. 오류 관측성 현황(코드 확인)

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

## 8. 최종 결정 대기 목록

1. 신규 2개 반의 이름 / 학생 수 / 사용 교재.
2. 부족한 17명을 신규 2반 vs 기존 3반 충원 중 어떤 조합으로 배정할지.
3. 일일 의식에 쓰기 시험을 포함할지(교재 소유 반 `spelling_test_enabled`
   설정 변경 여부).
4. 2절 데이터 블로커 6개 분류의 구체적 처리 여부·순서(GHOST UNIT
   삭제, DUPLICATE UNIT 통합, CURLY QUOTE 정정, 0-WORD UNIT 처리,
   LONG MEANING 축약 여부, current_unit_id/SCA drift 방치 여부).
5. 3절 보상 예산 판정 후속 조치(NO CHANGE / SERVER HARDENING /
   DB GUARD / DB GUARD REQUIRED 중 택1).
6. `wrong_answer_repeat` 값의 실제 의미와 활용 여부(현재 코드
   미소비).
7. 파일럿 인원(각 반 1~2명, 총 5~10명) 구체 지정.
