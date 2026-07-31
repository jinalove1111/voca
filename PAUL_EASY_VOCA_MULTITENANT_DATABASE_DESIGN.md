# PAUL_EASY_VOCA_MULTITENANT_DATABASE_DESIGN.md — DB 설계 상세

_작성: 2026-07-26. **순수 설계 문서 — 코드/SQL을 이 세션에서 전혀
작성·실행하지 않았다.** `PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md`
(§4 DB 전략)와 `docs/agent-decisions/0006-multitenant-saas-
architecture.md`(전체 테이블 grep 조사 원본)를 기반으로, 이번엔
**테이블 하나하나를 빠짐없이** 다루는 DB 전용 상세판이다. 저장소의
모든 `supabase_*.sql`을 이미 전수 조사한 결과(27개 테이블 + 1개
뷰)를 그대로 재사용했다 — 재조사하지 않았다(CLAUDE.md 규칙 3)._

---

## 1. 현재 테이블 목록 분석 (전수, 27개 + 1개 뷰)

| 테이블 | 현재 역할 | `academy_id` 필요 여부 | 이유 | 데이터 분리 방식 |
|---|---|---|---|---|
| **`classes`** | 반(=교재 컨테이너, 0004 결정) | **YES(직접)** | 테넌트 anchor, 모든 게 여기서 시작 | 직접 컬럼 + RLS |
| **`units`** | 반의 하위 유닛 | NO | `class_id`(not null) 경유 1홉 상속 | RLS에서 `classes` 조인 |
| **`words`** | 단어 원장 | NO | `unit_id`(not null) 경유 2홉 상속 | RLS에서 `units→classes` 조인 |
| **`students`** | 학생 계정 | **YES(직접)** | `class_id`가 **nullable**(반 미배정 상태 실존) — 체인만으로는 학원 경계 밖으로 유실 가능 | 직접 컬럼 + RLS, GRANT 필수(규칙 10) |
| `student_progress` | 학생 누적 진행도 | NO | `student_id`(not null, unique) 경유 상속 | `students` 조인 |
| `student_daily_progress` | 일별 학습 요약 | NO | `student_id`(not null) 경유 상속 | `students` 조인 |
| `daily_assignments` | 반의 날짜별 숙제 배정 | NO | `class_id`(not null) 경유 상속 | `classes` 조인 |
| `word_status` | 단어별 알아요/모름/숙달 | NO | `word_id`+`student_id`(둘 다 not null) 경유 상속 | `students` 또는 `words` 경유 조인 |
| `entrance_tests` | 입실시험 세션 | NO | `class_id`(not null) 경유 상속 | `classes` 조인 |
| `entrance_test_results` | 입실시험 결과 | NO | `test_id`+`student_id`(둘 다 not null) 경유 상속 | `students` 조인 |
| `spelling_review_queue` | 쓰기 답안 검토 큐 | NO | `word_id`(not null) 경유 상속(`student_id`는 nullable이지만 `word_id` 체인은 안 끊김) | `words` 조인 |
| `writing_answer_statistics` | 반복 오답 통계 | NO | `word_id`(not null) 경유 상속 | `words` 조인 |
| `spelling_ai_grading_cache` | AI 채점 캐시 | NO | `word_id`(not null) 경유 상속 | `words` 조인 |
| `word_accepted_variants` | 인정된 답안 변형 | NO | `word_id`(not null) 경유 상속 | `words` 조인 |
| `xp_ledger` | XP 지급 원장 | NO | `student_id`(not null) 경유 상속 | `students` 조인 |
| `xp_totals`(VIEW) | XP 합계 파생값 | NO(뷰, 원본 테이블 정책을 그대로 물려받음) | `xp_ledger` 기반 뷰라 별도 정책 불필요 | 원본 `xp_ledger` RLS 상속 |
| `word_king_history` | 주간 챔피언 계산 결과 | NO | `class_id`+`student_id`(둘 다 not null) 경유 상속 | `classes` 조인 |
| **`seasons`** | 시즌 경계(전역 단일 행) | **YES(직접) + 로직 재설계** | **FK 자체가 없는 전역 테이블** — "최신 행=현재 시즌" 로직 자체가 학원별로 안 나뉨(유일하게 컬럼 추가만으로 안 끝나는 케이스) | 직접 컬럼 + "학원별 최신 행"으로 쿼리 로직 재작성 |
| `student_class_assignments` | 다중 교재 동시 배정(v2.9) | NO | `student_id`+`class_id`(둘 다 not null) 경유 상속 | `classes`/`students` 조인 |
| **`textbooks`** | 교재(단어 묶음 원본) | **YES(직접)** | `owner_class_id`가 **nullable**(교재 재사용 설계상 소유 반 없음도 유효) | 직접 컬럼 + RLS(§4에서 공유 정책 추가 논의) |
| `class_textbooks` | 반↔교재 다대다 | NO | `class_id`+`textbook_id`(둘 다 not null) 경유 상속 | `classes` 조인 |
| `passages` | 지문(Reading Foundation) | NO | `unit_id`(not null) 경유 상속 | `units→classes` 조인 |
| `passage_sentences` | 지문 내 문장 | NO | `passage_id`(not null) 경유 상속 | `passages` 경유 조인 |
| `sentence_progress` | 문장 학습 진행도 | NO | `student_id`+`sentence_id`(둘 다 not null) 경유 상속 | `students` 경유(짧은 체인 우선, §6 성능 참고) |
| `sentence_words` | 문장↔단어 매핑 | NO | `sentence_id`+`word_id`(둘 다 not null) 경유 상속 | `words` 조인 |
| **`product_events`** | 익명 관찰 로그(리텐션 통계) | **YES(직접)** | `anon_id`가 `sha256(student_id)`라 **역조인이 의도적으로 불가능**(프라이버시 설계) — 체인 상속 자체가 구조적으로 안 됨 | 직접 컬럼(평문, 재식별 위험 없음 — 학원 소속은 개인정보 아님) |
| **`ai_usage_daily`** | AI 사용량/비용 일별 집계 | **YES(직접)** | **FK가 아예 없는 전역 집계 테이블** — 학원별 과금·상한의 전제조건 | 직접 컬럼 + RLS(anon 접근 자체가 없는 서버 전용 테이블이므로 RLS보다 애플리케이션 스코핑이 실질 방어선) |

**요약**: 27개 테이블 중 **직접 `academy_id` 컬럼이 필요한 것은 6개**
(`classes`/`students`/`textbooks`/`seasons`/`product_events`/`ai_
usage_daily`)뿐이고, 그중 `seasons`만 유일하게 컬럼 추가를 넘어선
로직 재설계가 필요하다. 나머지 21개+1뷰는 전부 FK 체인 조인으로
해결된다.

---

## 2. 핵심 테이블 관계도

### 2.1 요청하신 개념도와 실제 구조의 차이 — 먼저 정정

사용자가 제시한 순서(`academy → users → teachers → students →
classes → assignments → progress`)는 **선형 체인처럼 보이지만 실제
FK 방향은 그렇지 않다.** 가장 중요한 정정: **`classes`가 `students`를
담는 컨테이너이지, `students`가 `classes`보다 먼저 오는 게 아니다**
(`students.class_id → classes.id`, 반대 방향 FK 없음). 실제 구조는
아래처럼 **academy를 루트로 한 트리**에 가깝다.

### 2.2 실제 관계도

```
academies (신규 anchor)
   │
   ├── academy_members ─── auth.users(Supabase Auth, 신규)
   │     (role: owner|teacher)         "users/teachers"에 대응
   │
   ├── classes(academy_id)
   │     │
   │     ├── units(class_id) ── words(unit_id)
   │     │     │                    │
   │     │     └── passages(unit_id)  └── word_status/spelling_review_queue/
   │     │           │                    writing_answer_statistics/
   │     │           └── passage_sentences   spelling_ai_grading_cache/
   │     │                 │                 word_accepted_variants(word_id)
   │     │                 └── sentence_progress/sentence_words
   │     │
   │     ├── daily_assignments(class_id)      "assignments"에 대응
   │     ├── entrance_tests(class_id)
   │     ├── word_king_history(class_id)
   │     └── class_textbooks(class_id) ── textbooks(academy_id, 직접)
   │
   ├── students(academy_id, class_id nullable)   "students"에 대응
   │     │
   │     ├── student_progress / student_daily_progress   "progress"에 대응
   │     ├── word_status / xp_ledger / entrance_test_results
   │     ├── sentence_progress / student_class_assignments
   │     └── (학생 자체 인증 — Supabase Auth 미사용, PIN 모델 유지)
   │
   ├── seasons(academy_id, 신규) ── 전역 아님, 학원별 최신 1행
   ├── ai_usage_daily(academy_id, 신규) ── 전역 아님, 학원별 집계
   └── product_events(academy_id, 신규) ── anon_id는 여전히 비식별
```

### 2.3 개념도 대응표

| 사용자 개념도 | 실제 테이블 | 비고 |
|---|---|---|
| academy | `academies`(신규) | 루트, 유일한 anchor |
| users | `auth.users`(Supabase Auth, 원장/교사만) | 학생은 별도 인증(PIN), Auth 사용자 아님 |
| teachers | `academy_members`(role 컬럼으로 owner/teacher 구분) | "teachers"가 아니라 "academy 소속 인력" 전체를 다루는 테이블 |
| students | `students`(academy_id 직접) | |
| classes | `classes`(academy_id 직접) | **students보다 먼저 존재하는 컨테이너** — 개념도의 순서와 실제 FK 방향이 반대 |
| assignments | `daily_assignments`(class_id) | "숙제"라는 뜻이면 이 테이블, "다중교재 배정"이면 `student_class_assignments` — 두 의미가 섞이지 않게 구분 |
| progress | `student_progress`/`student_daily_progress`/`word_status`/`xp_ledger`/`entrance_test_results`/`sentence_progress` 등 6종 이상 | 단일 테이블이 아니라 목적별로 이미 분리돼 있음(재사용, 새로 합치지 않음) |

---

## 3. `academy_id` 적용 기준

새 테이블이 추가될 때마다 아래 순서로 판단한다(의사결정 규칙):

```
Q1. 이 테이블에서 academy(classes 또는 students)까지 FK 체인이
    끊김 없이 항상 도달하는가?
      └─ YES → 직접 컬럼 불필요, RLS는 조인으로 처리 (§1의 NO 그룹)
      └─ NO(아래로)

Q2. 체인이 끊기는 이유가 "중간 FK가 nullable"이기 때문인가?
    (예: students.class_id, textbooks.owner_class_id)
      └─ YES → 직접 컬럼 필요 (nullable을 우회할 다른 안전한 경로가
               없다면)

Q3. 애초에 FK 자체가 하나도 없는 전역 테이블인가?
    (예: seasons, ai_usage_daily)
      └─ YES → 직접 컬럼 필요, **로직 자체가 "전역 1개" 전제로
               짜여 있다면 로직도 함께 재검토**(seasons가 유일한 예)

Q4. 이 테이블이 의도적으로 비식별화(익명화)돼 있는가?
    (예: product_events의 anon_id)
      └─ YES → 직접 컬럼 필요(비식별 원칙은 유지한 채 학원 구분만 추가)

Q5. 여러 academy가 콘텐츠를 공유할 가능성이 있는가?
    (예: textbooks — 표준 교재 콘텐츠 라이브러리 구상 시)
      └─ YES → 직접 컬럼 + "공유 여부" 플래그를 별도로 검토(§4에서 상세)
```

**원칙**: 기본값은 항상 "직접 컬럼 불필요"(Q1)다 — 비정규화(모든
테이블에 academy_id 복제)는 반 이동/교재 재배정 같은 기존 동작이
있을 때마다 여러 테이블을 동기화해야 하는 새 버그 표면을 만든다.
직접 컬럼은 위 4가지 예외(Q2~Q5)에 해당할 때만 추가한다.

---

## 4. 공통 데이터와 학원 데이터 분리

### 4.1 사용자 예시에 대한 정정 — `words`/`units`는 오늘 구조에서 "공통"이 아니다

제시하신 예시(공통=`words`/`units`, 학원별=`students`/`homework`/
`progress`)는 **지향점으로는 타당하지만, 지금 이 앱의 실제 구조와는
다르다**는 것을 먼저 명확히 한다. 지금 `words`/`units`는 **각
학원(관리자)이 엑셀/PDF로 직접 업로드하는 사유 콘텐츠**다 —
`class_id`를 거쳐 결국 그 학원 소유이지 플랫폼 공통 자산이 아니다.
정확한 현재 구조:

| 분류 | 테이블 | 근거 |
|---|---|---|
| **진짜 공통(전 학원 공유, 지금은 존재 안 함)** | 없음 | 아직 "표준 커리큘럼 라이브러리" 같은 개념 자체가 이 앱에 없음 |
| **학원별(직접 컬럼)** | `classes`/`students`/`textbooks`/`seasons`/`product_events`/`ai_usage_daily` | §1 |
| **학원별(체인 상속, 컬럼은 없지만 결국 그 학원 소유)** | `units`/`words`(★사용자 예시의 "공통"과 다름)/`daily_assignments`(=homework)/`student_progress` 등 progress류 전체 | §1 |

### 4.2 "진짜 공통 콘텐츠"를 만들고 싶다면 — 향후 옵션(지금 설계 범위 밖)

사용자 예시가 지향하는 방향(표준 단어장을 여러 학원이 공유) 자체는
합리적인 미래 확장이다. 만들려면:

- `textbooks`에 `is_shared_template boolean`(신규, 개념만) — true인
  교재는 `academy_id`가 있어도 **모든 학원이 읽기 전용으로 복제 없이
  참조** 가능하도록 RLS를 별도 정책으로 예외 처리.
- 학원이 "공통 템플릿을 가져와서 내 것으로 커스터마이징"하면 그
  순간부터는 일반 `academy_id` 소유 데이터로 분기(복제 시점에 소유권
  이전).
- **지금은 만들지 않는다** — `MULTI_AGENT_WORKFLOW.md`의 "방대한
  추측성 설계 금지" 원칙(과설계 방지), 실제 수요(여러 학원이 같은
  능률/YBM 교재를 쓰고 싶어하는지)가 확인된 뒤 착수.

---

## 5. RLS 적용 전 데이터 흐름

**"RLS 적용 전"이란 지금(v3_11 이후, `academy_id` 미도입) 상태를
말한다** — 이 흐름을 명확히 보여야 왜 RLS가 필수인지 근거가 선다.

```
[anon key(공개, 배포된 JS 번들에 포함)]
        │
        ▼
classes/units/words ── SELECT: 전체 허용(v3_11 이후에도 유지, 조회는
        │                       원래 다 열려 있어야 학생 학습 화면이
        │                       동작하므로)
        │
        ▼
지금(단일 학원): 문제없음 — 어차피 전체가 한 학원 것
        │
        ▼
academy_id 컬럼만 추가하고 RLS를 안 걸면?
        │
        ▼
⚠️ 여전히 위험 — SELECT가 여전히 "전체 허용"이므로 anon key로 조회하면
   **모든 학원의 커리큘럼이 한꺼번에 보인다.** academy_id 컬럼 자체는
   메타데이터일 뿐, RLS 정책이 그 컬럼을 실제로 필터링해야만 격리가
   생긴다 — "컬럼 추가"와 "격리"는 다른 단계라는 것이 이 섹션의
   핵심 메시지.
```

**RLS 적용 후(목표 상태, `SAAS_ARCHITECTURE_PLAN.md` §4 패턴)**:
`current_academy_id()` 헬퍼가 요청자의 JWT에서 academy_id를 읽어
`classes.academy_id = current_academy_id()` 조건으로 SELECT 자체를
좁힌다 — 이 시점부터 anon key라도 자기 academy 것만 보인다(학생은
익명 Auth 세션으로 이 클레임을 받음, §4.4 `SAAS_ARCHITECTURE_PLAN.md`
참고).

**설계 교훈**: `academy_id` 컬럼 마이그레이션과 RLS 정책 적용은
**반드시 짝으로 배포**해야 한다 — 컬럼만 먼저 넣고 RLS를 나중에
걸겠다는 단계적 접근은 그 중간 기간 동안 오히려 "학원이 여럿인데
격리는 없는" 가장 위험한 상태를 만든다.

---

## 6. Migration 위험 분석

| 위험 | 시나리오 | 완화 방법 |
|---|---|---|
| **백필 실수** | 기존 111명 데이터에 `academy_id`가 잘못 채워짐(예: NULL로 남거나 잘못된 값) | 마이그레이션을 "컬럼 추가(nullable) → 기존 전체 행에 academy #1 UPDATE → NOT NULL 제약 추가"의 **3단계로 분리**, 각 단계 사이에 검증 쿼리 실행 |
| **GRANT 누락** | `students`에 신규 컬럼을 추가하면서 GRANT를 빠뜨림 | `DATABASE.md`가 이미 이 함정을 명문화(v1.9 이후 테이블 단위 SELECT 회수 상태) — 체크리스트에 명시적으로 포함, v2.1이 올바르게 지켰던 선례를 그대로 재현 |
| **컬럼 추가 ≠ 격리**(§5와 동일 위험) | 컬럼만 배포하고 RLS 적용을 나중으로 미룸 | 짝으로 배포, 중간 상태를 최소화 |
| **`seasons`을 "컬럼 추가만"으로 오인** | 실제로는 "최신 행=현재 시즌" 쿼리 로직 자체를 "학원별 최신 행"으로 다시 짜야 하는데, 단순 컬럼 추가로 착각하고 넘어감 | §1에서 이미 "로직 재설계"로 별도 표시 — 이 테이블만 별도 작업 티켓으로 분리 권장 |
| **nullable FK 처리 누락** | `students.class_id`/`textbooks.owner_class_id`/`spelling_review_queue.student_id`가 null인 행들이 백필 시 academy_id도 비게 됨(고아 행) | 백필 SQL에 이 nullable 케이스들을 명시적으로 다루는 분기 포함, 백필 후 "academy_id가 NULL인 행이 있는가" 검증 쿼리 필수 |
| **대용량 UPDATE로 인한 락/성능 영향** | 백필 UPDATE가 큰 테이블(진행도류)에서 실행되면 순간적으로 부하 발생 | 지금 규모(111명)에서는 미미하지만, **학원 운영 시간(수업 중)을 피해 실행**하는 습관을 이 시점부터 들여둘 것(향후 더 큰 규모에서 필수가 됨) |
| **롤백 계획 부재** | RLS 적용 후 예상 못한 회귀 발생 시 어떻게 되돌릴지 미리 정의 안 함 | v3_11 검토 세션의 패턴 그대로 재사용: `disable row level security`로 즉시 원복 가능하게 정책을 설계, 컬럼 자체는 `DROP COLUMN` 하지 않고(이 저장소 관례) 남겨둠 |
| **테스트 스크립트 회귀**(v3_11에서 실제로 발생한 패턴 재발 가능성) | QA용 `test*.mjs` 스크립트들이 `academy_id`/신규 인증 없이 호출하면 마이그레이션 후 깨짐 | v3_11 검토 세션에서 이미 이 패턴을 문서화(`docs/audit/2026-07-26-v3_11-lockdown-execution-review.md` 3번) — 같은 방식으로 "예상된 부작용"으로 미리 기록해둘 것 |

---

## 7. 100개 학원 운영 시 예상 문제 (DB 관점)

1. **무필터 전체조회는 `academy_id` 컬럼 추가만으로 자동 해결되지
   않는다** — 코드가 실제로 `WHERE academy_id = ...`를 쓰도록 15+
   호출부를 고쳐야 한다(`SAAS_ARCHITECTURE_PLAN.md`가 이미 지적).
   컬럼만 있고 스코핑 코드가 없으면 100개 학원의 데이터를 매번 전부
   긁어온 뒤 애플리케이션에서 걸러내는 최악의 패턴이 될 수 있다.
2. **`academy_id`에 인덱스가 없으면 RLS 정책 평가마다 풀스캔** —
   `idx_classes_academy_id`류 인덱스를 마이그레이션에 반드시 포함
   (기존에도 FK 인덱스 누락이 지적된 전례, `docs/audit/2026-07-24-
   performance-db.md`).
3. **Supabase 커넥션 풀 한계** — 100개 학원이 동시에 앱 포커스를
   되찾는 순간(등원 시간대 등) 버스트 쿼리가 겹칠 수 있음 —
   `BUSINESS_MODEL_PLAN.md` §4.2가 이미 이 시점에 Supabase Team
   티어 검토가 필요할 수 있다고 지적.
4. **`ai_usage_daily` 등 집계 테이블의 마이그레이션 이전 데이터
   귀속 문제** — 마이그레이션 시점 이전에 쌓인 사용량 기록을 어느
   academy로 볼지 애매(지금은 학원 1곳뿐이라 전량 academy #1 귀속
   처리하면 되지만, 이 규칙을 명시적으로 문서화 안 해두면 나중에
   혼란).
5. **`seasons` 로직 재작성이 불완전하면 가장 위험한 회귀** — 한
   학원이 "새 시즌 시작" 버튼을 눌렀는데 로직이 여전히 "전역 최신
   1행"으로 남아있으면 **다른 학원의 시즌까지 함께 바뀌는** 사고로
   이어질 수 있다 — §6에서 별도 티켓으로 분리 권장한 이유가 바로 이
   위험도.
6. **RLS 정책 누적에 따른 쿼리 플래너 오버헤드** — 특히 4~5홉 체인
   테이블(`sentence_progress` 등)은 정책 안에 조인이 들어가므로,
   테이블 수·정책 수가 늘어날수록 누적 비용 — `SAAS_ARCHITECTURE_
   PLAN.md` §4.3이 이미 제안한 "학생은 `student_id` 직접 경로로 짧게
   우회" 최적화가 이 규모에서 실제로 필요해질 가능성 높음.

---

## 관련 문서

`PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md`(§4 DB 전략 원본),
`docs/agent-decisions/0006-multitenant-saas-architecture.md`(전체
테이블 조사 원본), `DATABASE.md`(현재 스키마 근거), `docs/audit/
2026-07-26-v3_11-lockdown-execution-review.md`(마이그레이션 위험
분석의 실제 선례), `docs/audit/2026-07-24-performance-db.md`,
`PAUL_EASY_VOCA_BUSINESS_MODEL_PLAN.md`(§4.2 인프라 스케일 비용).
