# PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md — 테이블 소유권 매트릭스

_작성: 2026-07-26. **순수 설계 문서 — 코드/SQL/Migration을 이 세션에서
전혀 작성·실행하지 않았다.** `PAUL_EASY_VOCA_MULTITENANT_DATABASE_
DESIGN.md`(27개 테이블 전수 조사 원본)를 그대로 기반으로 하되, 이
문서는 **새로운 분류축**(데이터 성격 Global/Academy/User/Student +
`user_id` 필요 여부)을 추가해 소유권 경계를 확정한다 — 테이블을
재조사하지 않고 기존 조사 결과에 새 렌즈만 적용했다(규칙 3)._

---

## 1. 전체 DB 테이블 목록 (27개 + 1개 뷰)

| table_name | 현재 역할 | 데이터 성격 | `academy_id` 필요 | `user_id` 필요 | RLS 적용 대상 | 이유 |
|---|---|---|---|---|---|---|
| `classes` | 반(=교재 컨테이너) | **Academy** | YES(직접) | NO | YES(anchor) | 학원 소유 자원, 특정 개인 것이 아님 |
| `units` | 반의 하위 유닛 | Academy | NO(체인) | NO | YES(조인) | `class_id` 경유 상속 |
| `words` | 단어 원장 | Academy | NO(체인) | NO | YES(조인) | `unit_id` 경유 상속, 학원이 업로드한 사유 콘텐츠 |
| `students` | 학생 계정 | **Student** | YES(직접) | **자기 자신이 곧 식별자**(`id`) | YES | `class_id` nullable이라 체인만으론 유실 가능 |
| `student_progress` | 누적 진행도 | **Student** | NO(체인) | YES(`student_id`) | YES | 개인 학습 기록 |
| `student_daily_progress` | 일별 요약 | Student | NO | YES | YES | 동일 |
| `daily_assignments` | 반의 숙제 배정 | **Academy** | NO(체인) | NO | YES | 반 전체 대상, 특정 학생 개인 것 아님 |
| `word_status` | 단어별 상태 | Student | NO | YES | YES | 개인 학습 기록 |
| `entrance_tests` | 입실시험 세션 | Academy | NO | NO | YES | 반 단위 이벤트, 특정 개인 것 아님 |
| `entrance_test_results` | 응시 결과 | Student | NO | YES | YES | 개인 응시 기록 |
| `spelling_review_queue` | 쓰기답안 검토 큐 | **Academy** | NO(체인) | NO(`student_id` nullable) | YES | 교사가 학원 단위로 검토하는 큐, 개인 전용 뷰 아님 |
| `writing_answer_statistics` | 반복오답 통계 | **Academy**(집계) | NO(체인) | NO | YES | **여러 학생의 답안을 합산한 집계** — 원본은 개인 데이터지만 집계 자체는 학원 단위 자산 |
| `spelling_ai_grading_cache` | AI 채점 캐시 | Academy(★GLOBAL 후보) | NO(체인) | NO | YES | `word_id` 체인으로 지금은 학원별 — 단, 여러 학원이 동일 시판교재를 쓰면 이론상 GLOBAL 캐시 공유 여지 있음(§3에서 경고) |
| `word_accepted_variants` | 인정 답안 변형 | Academy | NO(체인) | NO | YES | 콘텐츠 데이터 |
| `xp_ledger` | XP 원장 | **Student** | NO | YES(`student_id`) | YES | 개인 행동 기록 |
| `xp_totals`(VIEW) | XP 합계 | Student | NO(뷰) | YES(원본 상속) | YES(원본 상속) | `xp_ledger` 파생 |
| `word_king_history` | 주간 챔피언 결과 | **Academy**(집계) | NO(체인) | NO | YES | 여러 학생 랭킹 집계 — 개인 데이터 아님 |
| `seasons` | 시즌 경계 | **Academy** | **YES(직접+로직재설계)** | NO | YES | FK 자체가 없는 전역 테이블(현재), 로직도 재설계 필요 |
| `student_class_assignments` | 다중교재 배정 | **Student** | NO(체인) | YES(`student_id`) | YES | 그 학생이 어느 반(교재)들을 듣는지 |
| `textbooks` | 교재 원본 | **Academy**(★GLOBAL 후보) | YES(직접) | NO | YES | `owner_class_id` nullable, 향후 공유 템플릿 가능성 있음(§3) |
| `class_textbooks` | 반↔교재 매핑 | Academy | NO(체인) | NO | YES | |
| `passages` | 지문 | Academy | NO(체인) | NO | YES | 콘텐츠 |
| `passage_sentences` | 지문 내 문장 | Academy | NO(체인) | NO | YES | 콘텐츠 |
| `sentence_progress` | 문장학습 진행도 | **Student** | NO | YES(`student_id`) | YES | 개인 학습 기록 |
| `sentence_words` | 문장↔단어 매핑 | Academy | NO(체인) | NO | YES | 콘텐츠 매핑, 개인 무관 |
| `product_events` | 익명 관찰 로그 | **Academy**(비식별 집계) | YES(직접) | **NO(설계상 금지)** | 낮은 우선순위(anon 집계용) | `anon_id`는 역조인 불가가 핵심 — user_id를 추가하면 익명성 설계가 깨짐 |
| `ai_usage_daily` | AI 비용 집계 | **Academy** | YES(직접) | NO | 서버 전용(anon 대상 아님) | 사람 단위가 아니라 학원 단위 집계 |

### 아직 존재하지 않는 카테고리 — 명시적으로 빈 자리 표시

| 카테고리 | 현재 상태 | 향후 필요 시 |
|---|---|---|
| **Global**(전 학원 공유) | **테이블 0개** — 지금 이 스키마에 진짜 전역 데이터는 없다 | 표준 커리큘럼 라이브러리를 만들 경우에만(`textbooks.is_shared_template` 류 플래그, `MULTITENANT_DATABASE_DESIGN.md` §4.2) |
| **User**(원장/교사 개인 계정 데이터 — 프로필/설정) | **테이블 0개** — `academy_members`(설계만 존재, 미구현)가 도입되기 전까지는 이 카테고리 자체가 스키마에 없음 | `academy_members` 실구현 시 프로필/알림설정 등을 여기 담을 것(§4 Rule 6) |

---

## 2. 4대 분류

### GLOBAL DATA

**지금은 없음.** 사용자가 예시로 든 `words`/`units`/`grammar_
contents`는 이 앱에서 **학원별 업로드 콘텐츠**라 Global이 아니라
Academy 데이터다(§1에서 이미 정정). Global 카테고리가 실제로 채워지는
시점은 "여러 학원이 동일한 표준 교재를 공식적으로 공유"하는 기능을
만들 때뿐이며, 지금은 그 기능 자체가 없다.

### ACADEMY DATA

`classes`, `students`(★소유권은 Student이지만 "이 학원 소속 로스터"
라는 관점의 조회는 Academy 레벨 권한이 필요 — §4 Rule 1 예외 참고),
`textbooks`, `daily_assignments`, `entrance_tests`, `seasons`,
`class_textbooks`, `passages`/`passage_sentences`/`sentence_words`,
`word_accepted_variants`, `spelling_ai_grading_cache`, `spelling_
review_queue`, `writing_answer_statistics`(집계), `word_king_
history`(집계), `product_events`(비식별 집계), `ai_usage_daily`(집계),
`units`, `words`

**사용자 예시("teachers"/"assignments")에 대한 매핑**: "teachers"는
아직 실존 테이블이 없다(위 "빈 자리" 참고, `academy_members`가
구현되면 이 카테고리로 편입). "assignments"는 `daily_assignments`
(숙제)로 매핑되며 여기 포함.

### USER DATA

**지금은 없음.** 사용자 예시의 `profiles`/`settings`에 대응하는
실제 테이블이 이 스키마에 없다 — 원장/교사가 아직 "개인 계정"이라는
개념 자체를 갖지 않기 때문(전역 단일 `ADMIN_PIN`). `academy_members`
실구현 시 이 카테고리가 처음 생긴다.

### LEARNING DATA (= 위 §1의 "Student" 데이터 성격과 동일 범주)

`student_progress`, `student_daily_progress`, `word_status`,
`entrance_test_results`, `xp_ledger`/`xp_totals`, `sentence_
progress`, `student_class_assignments`

**주의(중요한 경계 구분)**: `writing_answer_statistics`/`word_king_
history`는 **원본 입력이 개별 학생 데이터**여도, **집계된 결과
자체는 Learning이 아니라 Academy 데이터**로 분류했다(§1의 ★ 표시)
— 여러 학생 데이터를 합친 순간 "그 학원의 자산"이 되지, 어느
특정 학생 한 명의 개인 기록이 아니게 된다. 이 구분을 놓치면 §3의
위험으로 이어진다.

---

## 3. 100개 학원 운영 기준 — 잘못 설계하면 문제가 되는 테이블

| 테이블 | 잘못된 설계 시나리오 | 실제 피해 |
|---|---|---|
| **`seasons`** | "전역 최신 1행=현재 시즌" 로직을 academy_id 컬럼만 추가하고 그대로 둠 | 한 학원이 "새 시즌 시작"을 누르면 **다른 학원의 시즌까지 함께 바뀜** — 가장 위험한 단일 사고 시나리오 |
| **`ai_usage_daily`** | academy_id 없이 전역 집계로 남김 | 한 학원이 하루 AI 예산을 전부 소진하면 **다른 99개 학원의 AI 기능이 동시에 막힘** |
| **`product_events`** | academy_id는 추가하되 실수로 `student_id`(비암호화)까지 함께 노출 | 익명 집계라는 설계 전제가 깨져 개인정보 노출 사고로 격상 |
| **`spelling_ai_grading_cache`** | "비용 절감"을 이유로 academy 경계 없이 전 학원 캐시를 섣불리 공유 | 학원 A의 오답 패턴(학생들이 자주 틀리는 방식)이 학원 B 관리자에게 간접 노출될 가능성 — **§1에서 "GLOBAL 후보"라고 표시했지만 지금은 절대 실제로 공유해서는 안 됨**, 실제 공유는 반드시 명시적 정책 검토 후에만 |
| **`textbooks`** | `owner_class_id` nullable을 방치하고 academy_id도 안 넣음 | 소유권 불명 교재가 다른 학원 화면에 노출될 위험 |
| **`students`** | `class_id`가 비어 있는(반 미배정) 학생의 academy_id도 함께 유실 | 그 학생이 어느 학원 소속인지 시스템이 모르게 됨 — 조회/청구 양쪽에서 사고 |
| **`writing_answer_statistics`/`word_king_history`** | 집계 쿼리가 academy 경계를 넘어 여러 학원 학생을 한 통계에 섞음 | "우리 반 챔피언"이 실은 다른 학원 학생과 비교된 결과가 되는 신뢰 사고 — Word King의 존재 이유(반 내부 선의의 경쟁) 자체가 무너짐 |

---

## 4. 최종 DB Ownership Rule

1. **모든 테이블은 정확히 하나의 소유권 레벨(Global/Academy/User/
   Student)을 가진다** — 두 레벨에 걸쳐 있다고 판단되면(예: `students`)
   **가장 좁은 레벨**(더 개인적인 쪽)을 공식 분류로 채택하고, 더 넓은
   레벨의 조회 권한은 RLS 정책으로 별도 허용한다.
2. **Student/User 레벨 데이터는 반드시 Academy 레벨까지 FK 체인이
   끊기지 않아야 한다** — nullable FK가 체인을 끊는 지점(`students.
   class_id` 등)은 반드시 직접 `academy_id` 컬럼으로 보강한다
   (`MULTITENANT_DATABASE_DESIGN.md` §3의 Q2 기준과 동일).
3. **여러 명의 Student/User 데이터를 합산한 집계 테이블은 그 순간
   Academy 데이터로 재분류된다** — 원본이 개인 데이터라고 해서 집계
   결과까지 개인 데이터로 취급하지 않는다(§2 "주의" 참고, `writing_
   answer_statistics`/`word_king_history`가 실례).
4. **익명화(비식별)된 테이블에는 `user_id`/`student_id`를 절대 나중에
   추가하지 않는다** — `product_events`가 유일한 사례이자 원칙:
   재식별을 가능하게 하는 컬럼 추가는 그 테이블의 존재 이유 자체를
   훼손한다.
5. **Global 데이터는 지금 존재하지 않으며, 만들 때는 반드시 명시적
   "공유" 플래그를 둔다** — 암묵적 공유(예: academy_id를 그냥 안
   붙이는 방식)로 Global을 만들지 않는다. `spelling_ai_grading_
   cache`의 "GLOBAL 후보" 표시가 실제 공유로 이어지려면 반드시 별도
   설계·정책 승인이 선행돼야 한다(§3 경고).
6. **User(개인 계정) 데이터 테이블이 생기면 `academy_id`와
   `auth_user_id` 둘 다 가진다** — "이 사람이 누구인지"(auth_user_id)
   와 "어느 학원 소속인지"(academy_id) 둘 다 있어야 RLS가 성립한다
   (`SAAS_ARCHITECTURE_PLAN.md` §3.4의 `app_metadata.academy_id`
   설계와 동일 원칙).
7. **새 테이블을 추가할 때마다 이 문서의 4단계를 항상 거친다**: ①
   데이터 성격 분류(Global/Academy/User/Student) → ② `academy_id`
   필요 여부(`MULTITENANT_DATABASE_DESIGN.md` §3 기준) → ③ `user_id`
   필요 여부(이 사람 개인 것인가, 학원 전체 것인가) → ④ RLS 정책
   설계. 이 순서를 건너뛰고 테이블부터 만들면 §3과 같은 사고로
   이어진다.

---

## 관련 문서

`PAUL_EASY_VOCA_MULTITENANT_DATABASE_DESIGN.md`(테이블 전수 조사·
FK 체인·academy_id 적용 기준 원본), `PAUL_EASY_VOCA_SAAS_
ARCHITECTURE_PLAN.md`(§3~4 권한 구조·RLS 원본), `DATABASE.md`(현재
스키마 근거), `docs/agent-decisions/0006-multitenant-saas-
architecture.md`.
