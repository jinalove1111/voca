# 0006 — Paul Easy Voca 멀티테넌트(100학원 SaaS) 아키텍처 설계

_작성: 2026-07-26. **순수 설계 문서 — 이 세션에서 코드/Migration SQL을
전혀 작성·수정하지 않았다.** `docs/audit/2026-07-26-saas-multi-tenant-
security-top10.md`(보안 관점 TOP 10)의 후속으로, 이번엔 데이터 구조·
권한·RLS·분리·결제·운영 관점을 전부 아우르는 아키텍처 설계다. 기존
`docs/agent-decisions/0004-multi-textbook-architecture.md`(반→교재
다대다 설계)와 동일한 문서 성격(승인 전 설계 기록)이라 그 번호 체계를
이어 0006으로 명명했다._

**전제**: 지금 실제로 착수하라는 뜻이 아니다. `PAUL_EASY_VOCA_MASTER_
PLAN.md`와 SaaS TOP10 문서가 이미 명시했듯 **다학원 확장은 사업적
결정이 먼저 나야 착수**한다. 이 문서는 그 결정이 실제로 내려졌을 때
"무엇을 만들어야 하는지"를 미리 정리해 둔 것 — 지금 이 설계대로
구현하라는 지시가 아니다.

**핵심 설계 원칙 (전 섹션에 일관 적용)**:
1. **하위호환** — 지금의 학원 1곳(111명)을 "academy #1"로 자연스럽게
   흡수해야 한다. 마이그레이션 순간 기존 학생이 로그아웃되거나 데이터가
   보이지 않는 전환은 금지(CLAUDE.md 규칙 1과 동일 정신).
2. **컬럼 부재 시 안전 폴백** — 이 저장소 전체가 지켜온 관례(`DATABASE.md`
   전체 마이그레이션 표)를 `academy_id` 도입에도 그대로 적용한다.
3. **최소 침습** — 이미 잘 동작하는 "학생 이름+PIN" 모델, "반=교재
   컨테이너" 모델(0004 결정)을 갈아엎지 않고 그 위에 `academy_id`
   경계 한 겹만 얹는다.
4. **DB 경계가 1차 방어선** — 애플리케이션 코드의 실수(WHERE절 누락 등)
   가 있어도 RLS가 최종 방어선이 되도록 설계한다(v3_11 락다운에서 이미
   증명된 이 저장소의 패턴을 그대로 확장).

---

## 1. 현재 DB 구조에서 멀티테넌트 전환 시 필요한 변경점 (개요)

### 1.1 근본 원인 재확인

`classes` 테이블에 학원을 구분하는 컬럼이 지금 **전혀 없다**(`DATABASE.md`
역추적 컬럼: `id/name/class_type/created_at/spelling_test_enabled/
spelling_hint_enabled/wrong_answer_repeat_count/spelling_direction/
gamification_enabled/weekly_event_enabled` — 학원 경계 컬럼 0개). 이
저장소의 거의 모든 테이블이 결국 `classes`(직접) 또는 `units`/`words`
(그 하위)를 거쳐 연결되므로, **`classes`에 `academy_id`를 추가하는
것이 이 전환의 유일한 진짜 착수점**이고 나머지는 전부 그 위에 얹히는
파생 작업이다.

### 1.2 변경 유형 5개 카테고리

| 카테고리 | 내용 | 아래 섹션 |
|---|---|---|
| A. 스키마 | `academy_id` 컬럼을 어디에 직접 추가하고, 어디는 FK 체인으로 상속시킬지 | §2 |
| B. 인증/신원 | 학생/교사/관리자가 "어느 학원 소속인지"를 시스템이 아는 방법 — 지금은 이 개념 자체가 없음 | §3 |
| C. 접근 통제 | RLS가 그 신원을 실제로 강제하는 방법 | §4 |
| D. 격리 전략 | 논리적 분리 vs 물리적 분리, 어디까지 섞고 어디까지 나눌지 | §5 |
| E. 운영/상업화 | 결제, 플랫폼 관리자 도구 | §6, §7 |

### 1.3 지금 그대로 가져갈 수 있는 것 (다시 만들 필요 없음)

- **학생 식별 = UUID**(이름 아님, v1.6 이후 이미 완료) — 여러 학원이
  섞여도 이름 충돌 문제가 애초에 없다. 재작업 불필요(CLAUDE.md 규칙 3).
- **"반 = 교재 컨테이너"모델**(0004 결정) — `academy_id`가 `classes`에
  얹히면 교재 다대다 구조(`class_textbooks`)는 손대지 않아도 자동으로
  학원별로 분리된다(교재가 `class_id`를 거쳐 연결되므로).
- **컬럼 부재 시 안전 폴백 관례** — `academy_id` 마이그레이션도 이
  관례를 그대로 따르면(컬럼 없으면 "학원 #1"로 간주하는 기본값 전략)
  하위호환이 저절로 보장된다.
- **PIN 해시 아키텍처(server-only, scrypt)** — 학원별 관리자 인증으로
  확장할 때 동일 패턴 재사용 가능(§3).

---

## 2. `academy_id` 적용이 필요한 모든 테이블 분석

grep으로 저장소의 모든 `supabase_*.sql`을 전수 확인한 결과 기준(총
30개 테이블 + 1개 뷰). 세 그룹으로 분류했다 — **(A) 직접 컬럼 추가
필요**, **(B) FK 체인 상속(직접 컬럼 불필요, 조인으로 해결)**, **(C)
특수 처리 필요(체인이 끊기거나 애초에 전역 테이블)**.

### (A) 직접 `academy_id` 컬럼이 필요한 테이블 — anchor/root 또는 nullable 체인

| 테이블 | 왜 직접 필요한가 |
|---|---|
| **`classes`** | 진짜 anchor. 모든 게 여기서 시작 |
| **`students`** | `class_id`가 **nullable**(반 삭제 시 `ON DELETE SET NULL`로 "반 미배정" 상태가 실제로 존재 — `DATABASE.md` 확인 사실)이라, `class_id` 체인만으로는 미배정 학생이 academy 경계 밖으로 떨어져 나간다. **직접 컬럼 필수** |
| **`textbooks`** | `owner_class_id`가 **nullable**(교재가 여러 반에서 재사용되는 설계상 "소유 반 없음"도 유효한 상태). 게다가 교재는 향후 "여러 학원이 같은 시판 교재를 공유"할 잠재적 니즈가 있어 체인 상속보다 직접 컬럼이 안전 |
| **`seasons`** | **FK가 아예 없는 전역 단일 테이블**(가장 위험한 케이스). "가장 최신 행 = 현재 시즌" 로직 자체가 학원 여러 곳이 되는 순간 의미를 잃는다 — `academy_id` 추가 + "학원별 최신 행"으로 로직 자체를 바꿔야 함(단순 컬럼 추가로 안 끝나는 유일한 항목) |
| **`ai_usage_daily`** | **FK가 아예 없는 전역 집계 테이블.** 결제(§6)에서 학원별 AI 비용을 과금하려면 필수. 지금 구조로 100학원이 붙으면 하루 $2 상한을 100개 학원이 공유하게 되는 것과 같아 한 학원이 전체 예산을 소진시킬 수 있음(**보안 TOP10에는 없던 신규 발견 — 결제/비용격리 관점의 Critical급 이슈**) |
| **`product_events`** | `anon_id`가 `sha256(student_id)`라 역조인이 의도적으로 불가능(프라이버시 설계) — 그래서 FK 체인 상속이 구조적으로 안 된다. 학원별 리텐션 통계를 보려면 `academy_id`를 별도 평문 컬럼으로 직접 추가해야 함(재식별 위험 없음 — 학원 소속은 개인정보가 아님) |

### (B) FK 체인으로 자동 상속 — 직접 컬럼 불필요, RLS는 조인으로 해결

| 체인 깊이 | 테이블 | 경로 |
|---|---|---|
| classes 1홉 | `units`, `class_textbooks`, `daily_assignments`, `entrance_tests`, `word_king_history` | `class_id → classes` |
| units 경유 2홉 | `words`, `passages` | `unit_id → units → classes` |
| words 경유 3홉 | `word_status`, `spelling_ai_grading_cache`, `word_accepted_variants`, `writing_answer_statistics`, `sentence_words`(word_id 경로) | `word_id → words → units → classes` |
| passages 경유 3~4홉 | `passage_sentences` → `sentence_progress` | `passage_id → passages → units → classes` |
| students 1홉(단, students가 (A)로 직접 컬럼을 가지면 사실상 0홉) | `student_progress`, `student_daily_progress`, `xp_ledger`, `entrance_test_results`, `sentence_progress`(student 경로), `student_class_assignments` | `student_id → students` |

**설계 판단**: (B)그룹은 마이그레이션에서 컬럼을 추가하지 않는다 —
`students`/`classes`가 (A)로 직접 `academy_id`를 가지면, 이 그룹은
전부 그 두 anchor를 거쳐 조인 한 번으로 academy를 판별할 수 있다.
컬럼을 매 테이블에 복제하면(비정규화) 반 이동/교재 재배정 같은 기존
동작이 있을 때마다 여러 테이블을 동기화해야 하는 새로운 버그 표면이
생긴다 — 지금 저장소가 "파생값 우선"(`xp_totals` VIEW 등 기존 설계
판단)을 이미 선호해온 것과 같은 방향.

### (C) 특수 처리가 필요한 케이스

| 테이블 | 문제 | 권장 처리 |
|---|---|---|
| `spelling_review_queue` | `student_id`가 **nullable**(`on delete set null`) — 학생이 삭제돼도 큐 항목은 남는 설계. `word_id`는 not null이므로 `word_id→words→units→classes` 체인으로 academy 판별은 가능(끊기지 않음), 단 "이 학생이 어느 학원인지"는 알 수 없어질 수 있음(기존에도 마찬가지 — 신규 문제 아님, 그대로 둬도 안전) |
| `xp_ledger` | `student_id`만 있고 `class_id` 없음 — (A)에서 `students.academy_id`를 직접 추가하면 자동 해결, 별도 조치 불필요 |
| **성능 이슈(체인 깊이 4~5홉)** | `sentence_progress`처럼 4~5단계 조인이 필요한 테이블에 RLS 정책마다 매번 5-way join을 걸면 느리다 | §4에서 SECURITY DEFINER 헬퍼 함수로 해결(캐시 가능한 단일 조회로 축약) |

### 요약 — 이번 전환에서 실제로 `ALTER TABLE ... ADD COLUMN academy_id`가 필요한 테이블은 6개뿐

`classes`, `students`, `textbooks`, `seasons`, `ai_usage_daily`,
`product_events` — 나머지 24개+ 테이블은 조인으로 해결된다. 이 사실
자체가 "academy_id를 30개 테이블에 다 넣어야 하나?"라는 우려에 대한
답이다 — **아니다, 6곳이면 된다.**

---

## 3. 학생/선생님/관리자 권한 구조 설계

### 3.1 현재 상태 (2-tier, 매우 단순)

- **학생**: 이름+PIN, 서버(`api/verify-student-pin.js`)가 scrypt로 검증
- **관리자**: 시스템 전체에 **단 하나**의 `ADMIN_PIN`(환경변수) — "교사"라는
  별도 개념 자체가 없다(원장 1인 운영 전제)

### 3.2 목표 상태 (4-tier)

```
Platform Super Admin (Paul Easy Voca 운영사)
   │  — 전 학원 횡단 접근(지원/과금/장애대응), 최고 민감도
   ▼
Academy Owner (원장) ── Academy Teacher (선생님, 선택적)
   │  academy_id에 스코프됨                │ 같은 academy_id, 권한 부분집합
   ▼                                       ▼
Student (학생, 기존 모델 유지) ── Parent (학부모, 읽기 전용, 기존 모델 유지)
```

| 역할 | 스코프 | 권한 | 오늘 대비 신규 여부 |
|---|---|---|---|
| Platform Super Admin | 전체 | 학원 생성/정지/삭제, 청구 조회, 지원용 임시 접근(감사로그 필수) | **완전 신규** |
| Academy Owner(원장) | 자기 `academy_id` | 오늘의 `ADMIN_PIN` 권한 전부 + 교사 초대/해제 + 결제 관리 | 기존 관리자 역할의 학원 스코프 버전 |
| Academy Teacher(선생님) | 자기 `academy_id`, 반 단위로 더 좁힐 수도 있음 | 반/단어/숙제 관리, 학생 진도 조회 — 결제/교사초대/학원삭제 등 소유자 전용 액션은 불가 | **완전 신규**(지금은 "선생님" 개념이 없음) |
| Student | 자기 `academy_id` + `student_id` | 기존과 동일 | 변경 없음(이미 UUID 기반이라 자연 호환) |
| Parent | 조회 대상 학생의 `academy_id` | 기존과 동일(읽기 전용) | 변경 없음 |

### 3.3 `academy_members` 개념 테이블 (설계만, DDL 아님)

```
academy_members
  id
  academy_id      → academies(id)
  role            'owner' | 'teacher'
  auth_user_id     → Supabase Auth auth.users(id)   (§3.4 참고)
  display_name
  status          'active' | 'invited' | 'disabled'
  created_at, invited_by
```

`ADMIN_PIN` 같은 단일 전역 비밀값을 완전히 없애고, 이 테이블 + 아래
인증 모델로 교체하는 것이 목표. 학생 PIN(`students.pin_hash`)은 이
테이블과 무관 — 학생은 계속 지금 모델을 쓴다(3.4에서 이유 설명).

### 3.4 인증 메커니즘 — 역할별로 다르게 (하나로 통일하지 않는다)

| 대상 | 권장 방식 | 이유 |
|---|---|---|
| 학생 | **지금 그대로**(이름+PIN, 서버 scrypt 검증) + 로그인 성공 시 서버가 짧은 서명 세션 토큰 발급(§4에서 RLS 연동) | 8~13세 아동에게 이메일/비밀번호 계정을 요구하는 것은 COPPA류 아동 개인정보 규제 관점에서도, UX 관점에서도 부적절. 지금 모델을 바꿀 이유가 없다 — SaaS TOP10 문서의 4번(세션 토큰) 항목만 이 위에 얹으면 충분 |
| 원장/교사 | **Supabase Auth 도입**(이메일+비밀번호 또는 매직링크) — `app_metadata`에 `academy_id`/`role` 저장(service_role만 쓰기 가능, 사용자 자신은 수정 불가) | 어른 계정이고 로그인 빈도도 낮아 정식 계정 모델이 적합. Supabase Auth는 **이미 쓰고 있는 플랫폼(Supabase)의 내장 기능**이라 "새 외부 의존성 추가"(CLAUDE.md 규칙 6)에 해당하지 않는다 |
| Platform Super Admin | Supabase Auth + **2단계 인증 필수** | 전 학원 횡단 접근 권한을 가진 유일한 계정군 — 이 시스템에서 가장 blast radius가 큰 자격증명이므로 가장 강한 보호가 필요 |

**핵심 아이디어**: 지금까지 이 저장소가 "학생 vs 관리자"라는 이분법으로
설계돼 있던 것을, "저빈도·고권한 어른 계정(Auth 도입)"과 "고빈도·
저마찰 아동 세션(기존 PIN 모델 유지)"이라는 **다른 기준**으로 다시
나누는 것 — 전부 하나로 통일하려는 시도가 오히려 잘못된 방향이다.

---

## 4. RLS(Row Level Security) 정책 설계

### 4.1 핵심 패턴 — JWT 클레임 + SECURITY DEFINER 헬퍼

원장/교사(Supabase Auth 사용자)는 로그인 시 발급되는 JWT의
`app_metadata.academy_id`/`app_metadata.role`을 갖는다. RLS 정책은
이 값을 직접 비교하는 대신, 재사용 가능한 헬퍼 함수를 하나 만들어
쓴다(3~5홉 조인을 정책마다 반복하지 않기 위함, §2 (C) 성능 이슈 대응):

```sql
-- 개념 설계, 실제 문법은 구현 시점에 확정
create function current_academy_id() returns uuid
language sql stable security definer as $$
  select (auth.jwt() -> 'app_metadata' ->> 'academy_id')::uuid
$$;

create function current_role() returns text
language sql stable security definer as $$
  select auth.jwt() -> 'app_metadata' ->> 'role'
$$;
```

### 4.2 anchor 테이블 정책 패턴 (`classes`, `students`, `textbooks`, `seasons`, `ai_usage_daily`, `product_events`)

```sql
-- 예시: classes (개념, 실제 실행 안 함)
create policy "academy scoped select" on classes
  for select using (academy_id = current_academy_id());

create policy "academy scoped write (teacher/owner only)" on classes
  for all using (academy_id = current_academy_id() and current_role() in ('owner','teacher'))
  with check (academy_id = current_academy_id());
```

`v3_11_lockdown_curriculum_write.sql`이 이미 "SELECT만 열고 쓰기는
default-deny"로 만든 패턴을, "전체 열기"에서 "academy 경계 안에서만
열기"로 좁히는 것 — 새로운 개념이 아니라 **기존 패턴의 자연스러운
확장**이다.

### 4.3 하위 체인 테이블 정책 패턴 (`words`, `sentence_progress` 등)

조인 대신 헬퍼 함수로 단순화:

```sql
-- words(unit_id → units → classes) 예시
create policy "academy scoped via chain" on words
  for select using (
    exists (
      select 1 from units u join classes c on c.id = u.class_id
      where u.id = words.unit_id and c.academy_id = current_academy_id()
    )
  );
```

4~5홉(`sentence_progress` 등)은 매 쿼리 성능이 우려되므로, 실제
구현 시점에는 **students 테이블에도 직접 `academy_id`를 갖고 있다는
전제(§2 (A))를 활용해 `student_id` 경로로 짧게 우회하는 정책**을
우선 검토할 것 — 학생 본인 데이터는 `student_id`만으로 1홉에 판별
가능하므로 여기서는 굳이 5홉 체인을 타지 않아도 된다.

### 4.4 학생 조회 경로 — "익명 전체 허용"에서 "academy 스코프"로 전환

지금 학생은 인증 없는 anon key로 `words` 등을 직접 조회한다(v3_11
이후에도 SELECT는 전체 허용 유지). 멀티테넌트에서는 이 자체가 "다른
학원 커리큘럼도 다 보인다"는 정보 노출이 된다. 두 가지 옵션:

| 옵션 | 방법 | 트레이드오프 |
|---|---|---|
| A. 학생도 Supabase Auth 익명 세션(anonymous sign-in) 사용 | 로그인 성공 시 서버가 `auth.signInAnonymously()` 후 `app_metadata.academy_id`를 service_role로 설정 | RLS와 완전히 같은 메커니즘 재사용(§4.1) — **권장** |
| B. RLS 없이 API 레이어(Edge Function)에서만 academy 필터링 | 기존 anon 직접조회 패턴 유지, 서버가 대신 필터 | RLS라는 DB 최종 방어선을 포기하는 것 — 이 저장소가 v3_11에서 이미 "DB 경계가 최종 방어"라는 원칙을 세운 것과 정면 배치. **비권장** |

**권장: A안.** 학생도 결국 익명 Auth 세션 하나만 추가하면 §4.1~4.3의
정책을 그대로 재사용할 수 있어 설계가 단순해진다.

### 4.5 관리자 쓰기 — 기존 `admin-content-write` 패턴의 자연 확장

`v3_11`이 이미 "anon 직접쓰기 차단 + service_role 경유 Edge Function만
쓰기 허용" 구조를 만들어뒀다. 멀티테넌트에서는 이 Edge Function이
`adminPin` 문자열 비교 대신 **Supabase Auth JWT 검증 + `app_metadata.
academy_id`가 요청 대상 `class_id`의 소속 academy와 일치하는지 확인**
하는 것으로 바뀔 뿐, "service_role로 RLS 우회 후 쓰기"라는 구조 자체는
그대로 재사용된다 — **새 아키텍처가 아니라 인가 방식 하나만 교체.**

---

## 5. 학원별 데이터 완전 분리 방법

### 5.1 세 가지 옵션 비교

| 방식 | 설명 | 격리 강도 | 비용/운영 부담 |
|---|---|---|---|
| **A. 논리적 분리(단일 프로젝트 + RLS + `academy_id`)** | §2~4에서 설계한 것 | 중간(RLS 버그 시 전체 노출 가능) | 낮음 — 1개 Supabase 프로젝트, 마이그레이션도 1번만 |
| **B. 스키마 분리(단일 프로젝트, 학원별 Postgres schema)** | `academy_42.classes`처럼 물리적으로 다른 네임스페이스 | 높음 | 중간 — 마이그레이션을 학원 수만큼 반복 실행해야 함 |
| **C. 물리적 분리(학원별 독립 Supabase 프로젝트)** | 완전히 별도 DB 인스턴스 | 최고 | **매우 높음** — 100개 프로젝트 = 100배 관리 비용, 전사 집계 불가, 마이그레이션 100회 |

### 5.2 권장 — 계층형(Tiered) 접근

- **기본 티어(대부분의 학원)**: **A안**(RLS 논리적 분리). 지금 이
  저장소의 전체 설계 철학(무료/최소 인프라 우선, CLAUDE.md 규칙 7)과
  가장 잘 맞고, 100개 학원까지는 Supabase 단일 프로젝트로 충분히
  감당 가능한 규모.
- **엔터프라이즈 티어(선택적, 나중에)**: 특정 학원 체인(프랜차이즈 등)이
  강한 계약상 격리를 요구하면 **C안**(전용 프로젝트)을 별도 상품으로
  제공 — 지금 설계할 필요 없음, "탈출구가 존재한다"는 것만 인지.
- **B안(스키마 분리)은 권장하지 않는다** — A안의 단순함도, C안의 강한
  격리도 없이 마이그레이션 운영 부담만 학원 수만큼 커지는 중간지대.

### 5.3 Defense in Depth — RLS 하나만 믿지 않는다

1. **1차 방어(필수)**: RLS(§4) — DB가 최종 심판.
2. **2차 방어(보조)**: 애플리케이션 레벨 공용 쿼리 헬퍼(`withAcademyScope()`
   류)를 만들어, 코드 리뷰 단계에서도 "academy 스코프 없는 쿼리"가
   눈에 띄게 한다 — `wordLibrary.js`가 이미 데이터 계층을 한 파일에
   모아둔 기존 구조 덕분에 이 헬퍼를 도입하기 좋은 위치에 있다.
3. **3차 방어(감사)**: SaaS TOP10 문서 7번(감사 로그) — RLS가 뚫렸을 때
   사후 탐지.

### 5.4 "완전 분리"의 검증 기준

설계가 제대로 됐는지 확인하는 가장 단순한 테스트: **`academy_id` 하나로
그 학원의 모든 데이터를 export/삭제할 수 있는가?** (SaaS TOP10 문서
8번 "테넌트 오프보딩"과 직결) — §2에서 6개 anchor 테이블에만
`academy_id`를 두고 나머지를 조인으로 상속시킨 설계는, 6개 테이블
기준 필터 하나로 전체 학원 데이터를 정확히 잘라낼 수 있다는 것이
핵심 장점이다(30개 테이블 각각에 흩어진 조건을 따로 관리할 필요 없음).

---

## 6. 결제 시스템 추가 시 필요한 구조

### 6.1 `academies` 테이블 (개념 설계)

```
academies
  id
  name
  plan             'trial' | 'basic' | 'pro' | 'enterprise'
  billing_status   'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
  trial_ends_at
  student_seat_limit     -- 플랜별 학생 수 상한(간단한 과금 축 1)
  payment_provider       'toss' | 'iamport' | 'stripe' 등
  payment_customer_id    -- 결제사 쪽 고객 식별자(카드정보 자체는 저장 안 함)
  created_at
```

`classes.academy_id`가 참조하는 대상이 바로 이 테이블 — §2에서 이미
확정한 anchor 컬럼의 실제 부모 테이블.

### 6.2 사용량 기반 과금 연동

- `ai_usage_daily`에 `academy_id`가 붙으면(§2) 학원별 AI 비용을 그대로
  집계해 과금 근거로 쓸 수 있다 — **이미 존재하는 테이블을 그대로
  재사용**, 결제 전용 새 집계 인프라를 만들 필요 없음.
- 플랜별 학생 수 상한(`student_seat_limit`)은 `students.academy_id`
  기준 `count(*)` 하나로 검증 가능(새 인프라 불필요).

### 6.3 결제 연동 지점 — 기존 패턴 재사용

- 결제 웹훅(PG사 → 우리 서버)은 **Vercel `api/*.js`가 아니라 Supabase
  Edge Function으로** — `admin-content-write`/`grade-writing-answers`가
  이미 같은 이유(Vercel Hobby 12개 함수 한도)로 Edge Function을 쓴
  선례를 그대로 따른다.
- **카드번호 등 결제수단 원본 데이터는 이 시스템에 절대 저장하지
  않는다** — PG사의 호스팅 결제창(Stripe Checkout, 토스페이먼츠
  결제창 등)으로 위임하고 우리 DB에는 `payment_customer_id`/구독
  상태만 저장. PCI-DSS 범위 자체를 이 시스템 밖으로 밀어내는 것이
  원칙(PIN을 해시로만 다루는 기존 원칙과 같은 방향의 최소노출 설계).
- 한국 학원 고객이 대다수라는 점을 고려하면 세금계산서 발행이 필요할
  가능성이 높다 — 이는 보안/아키텍처가 아니라 **법무/회계 요구사항**
  이므로 이 설계 문서에서 답을 내리지 않고, 결제 프로바이더 선택 시
  운영자가 별도로 확인해야 할 항목으로만 표기한다.

### 6.4 구독 상태에 따른 앱 동작 게이팅 — 기존 관례 재사용

`billing_status = 'past_due'`가 되면 학생 학습 화면은 계속 정상
동작하되(수업 중단이 학원/학생에게 가장 큰 피해이므로) 관리자의
신규 반/단어 생성 같은 쓰기 액션만 제한하는 방식을 권장 — 이는 이미
이 저장소가 "컬럼/테이블 부재 시 기능만 조용히 숨기고 크래시하지
않는다"는 관례(`gamification_enabled` false 폴백 등)를 결제 상태
게이팅에도 그대로 적용하는 것뿐이다.

---

## 7. SaaS 운영 시 필요한 관리자 Dashboard 구조

### 7.1 이것은 "AdminScreen.jsx 확장"이 아니다

지금의 `AdminScreen.jsx`는 **학원 내부용**(원장/교사가 자기 학원만
보는 화면)이다. 플랫폼 운영 대시보드는 **전혀 다른 신뢰 등급의 별도
화면**(Platform Super Admin 전용, §3.2) — 같은 컴포넌트 트리 밑에
탭 하나 추가하는 방식으로 만들면 안 된다(권한 경계가 애매해지는
가장 흔한 실수). 별도 라우트·별도 인증 체크·이상적으로는 별도 서브
도메인(`admin.pauleasyvoca.com` 류)을 권장.

혼동 주의: `scripts/generateDashboard.mjs`(`npm run dashboard`)는
**개발자 로컬 도구**(`.gitignore`, Vercel 배포 대상 아님, 학생 앱과
완전 분리)로 이번 절과 이름만 비슷할 뿐 전혀 다른 것 — 그 문서
(`DEVELOPER_GUIDE.md` "개발자 대시보드" 섹션)와 혼동하지 않는다.

### 7.2 필요 화면 (우선순위순)

1. **학원 목록/검색** — 학원명, 플랜, `billing_status`, 학생 수, 가입일
2. **학원 상세** — 사용량(AI 비용 `ai_usage_daily` 집계, 학생 수, 스토리지),
   최근 활동, 감사 로그(SaaS TOP10 7번과 연동)
3. **학원 생명주기 액션** — 신규 학원 온보딩(academy_id 발급 +
   owner 초대), 정지, 오프보딩/삭제 요청 처리(SaaS TOP10 8번의 통제된
   절차 UI화)
4. **청구 현황** — 플랜별 MRR, 연체 학원 목록, 결제 실패 알림
5. **인시던트/헬스 뷰** — SaaS TOP10 10번(모니터링)이 쌓는 알림을
   한 곳에 모아보는 화면
6. **지원용 임시 접근(Impersonation)** — 지원 담당자가 "학원 X 관리자로
   보기"를 쓸 때 **반드시 시간제한 + 자동 감사로그 기록 + 해당 학원에
   접근 사실이 보이는 구조**(몰래 들어가는 게 아니라 "지원팀이
   HH:MM에 접속함" 배너가 그 학원 관리자 화면에도 뜨는 방식 권장)

### 7.3 이 대시보드 자체의 접근 통제

시스템 전체에서 **가장 blast radius가 큰 단일 지점**이므로:
- Supabase Auth + 2FA 필수(§3.4)
- 모든 조회/액션이 감사 로그에 남음(예외 없음)
- IP allowlist 등 추가 방어는 실제 운영 규모가 커졌을 때 재검토
  (지금 설계 단계에서 과설계하지 않음 — `MULTI_AGENT_WORKFLOW.md`
  "방대한 추측성 설계 금지" 원칙과 동일)

---

## 8. 6개월 후 확장 가능한 최종 아키텍처

### 8.1 정직한 전제

"6개월 후 100학원"을 **기술적으로 받아낼 수 있는 아키텍처가 준비된
상태**와 "실제로 100개 학원이 계약을 맺고 쓰고 있는 상태"는 다른
질문이다 — 후자는 영업/마케팅 타임라인이라 이 설계 문서의 범위 밖이다.
이 섹션은 전자, 즉 **"영업이 100번째 계약을 따오는 순간 시스템이
그대로 받아낼 수 있는가"**를 목표로 한다.

### 8.2 최종 상태 아키텍처

```
[학생 브라우저]                    [원장/교사 브라우저]           [플랫폼 운영팀]
   │ anon key + 익명 Auth 세션         │ Supabase Auth(이메일)         │ Supabase Auth+2FA
   │ (academy_id 클레임)               │ (academy_id+role 클레임)      │ (전 학원 접근)
   ▼                                  ▼                               ▼
┌─────────────────────────── React SPA(공통 코드베이스) ───────────────────────────┐
│  학생 화면 / 학원 관리자 화면(AdminScreen) / 플랫폼 운영 화면(별도 라우트, §7.1)   │
└──────────────┬───────────────────────┬───────────────────────┬───────────────────┘
               │ SELECT(anon+세션)      │ 쓰기 요청(adminPin→Auth)│ 플랫폼 API
               ▼                        ▼                        ▼
        ┌──────────────┐      ┌──────────────────────┐   ┌────────────────────┐
        │  Supabase DB  │◄────┤ admin-content-write   │   │ 결제/구독 관리       │
        │  RLS(academy_ │      │ (Edge Fn, service_role│   │ Edge Function        │
        │  id 스코프,   │      │  + academy_id 검증)   │   │ (PG 웹훅 수신)       │
        │  §4)          │      └──────────────────────┘   └────────────────────┘
        │               │      ┌──────────────────────┐
        │  academies /  │◄────┤ grade-writing-answers  │
        │  academy_     │      │ (기존 AI 파이프라인,   │
        │  members(신규)│      │  ai_usage_daily에     │
        └──────┬────────┘      │  academy_id 태깅)      │
               │               └──────────────────────┘
               ▼
      감사로그 + 모니터링(SaaS TOP10 7·10번)
```

### 8.3 페이싱 (월 단위, `PAUL_EASY_VOCA_MASTER_PLAN.md`의 90일 로드맵 이후를 잇는 관점)

| 시기 | 내용 |
|---|---|
| **Month 1–2** | §2의 6개 anchor 테이블에 `academy_id` 추가(기존 학원 = academy #1로 자동 백필) + §3 인증 모델(원장/교사 Supabase Auth 전환, 학생은 익명 세션 추가) + §4 RLS 정책 전면 적용. **이 시점부터 기술적으로 "2번째 학원"을 안전하게 받을 수 있음** |
| **Month 3–4** | §6 결제 구조(`academies`/`academy_members` 실제 사용, PG 연동) + §5 격리 검증(export/삭제 테스트로 6개 anchor 컬럼 필터가 실제로 완전 분리를 보장하는지 실측) + Vercel 유료 플랜 전환(SaaS TOP10 9번, 상업화와 동시 필수) |
| **Month 5–6** | §7 플랫폼 운영 대시보드 + 부하 테스트(합성 데이터로 100학원·2,000명 시뮬레이션, `docs/audit/2026-07-24-performance-db.md`가 이미 지목한 무필터 전체조회 문제를 이 시점에 반드시 해소 — 스코핑 안 된 채로 100학원을 받으면 그 감사가 예측한 병목이 정확히 재현됨) + 소수 파일럿 학원으로 먼저 검증 후 확대 |

### 8.4 이 설계가 기존 문서들과 어떻게 이어지는가

- `PAUL_EASY_VOCA_MASTER_PLAN.md`의 "다학원 확장은 사업 결정 이후"
  원칙 — 이 문서는 그 결정이 내려졌을 때 Month 1로 바로 진입할 수 있게
  미리 준비해두는 것.
- `docs/audit/2026-07-26-saas-multi-tenant-security-top10.md`의 10개
  항목 — 이 문서의 §2(1,7번 항목 근거) / §3·4(2,3,4번) / §5(8번) /
  §6(9번) / §7(10번)가 각각 그 TOP10을 실제 스키마/화면 단위로 구체화한
  것.
- `docs/agent-decisions/0004-multi-textbook-architecture.md`의 "반=교재
  컨테이너" 설계 — §1.3에서 확인했듯 그대로 유지, 재작업 없음.

---

## 관련 문서

`docs/audit/2026-07-26-saas-multi-tenant-security-top10.md`,
`docs/audit/2026-07-26-v3_11-lockdown-execution-review.md`,
`docs/audit/2026-07-26-v3_11-1hour-runbook.md`,
`PAUL_EASY_VOCA_CURRENT_STATUS.md`, `PAUL_EASY_VOCA_MASTER_PLAN.md`,
`DATABASE.md`, `docs/agent-decisions/0004-multi-textbook-architecture.md`,
`docs/audit/2026-07-24-performance-db.md`,
`docs/audit/2026-07-24-deployment-scale.md`.

---

## [2026-07-31 병합] AI 비용 전략 (원본: PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md §8)

_(2026-07-31 문서 정리: `PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md`에서
병합)_

### 문제 정의

지금 파이프라인(rules-first + 캐시 + Provider 추상화 + 일일 $2 상한)은
`docs/audit/2026-07-24-ai-cost.md`가 이미 "학원 1곳 기준 최적화 완료"로
평가했다. 100개 학원이 동시에 쓰면 **GPT/AI 비용이 학원 수에 비례해
증가**하는 것 자체는 당연하지만, 문제는 "비례해서 늘어나는 것"이 아니라
**"통제 없이 늘어나는 것"** — 지금 구조엔 학원별 상한이 없다(§2의
`ai_usage_daily` FK 부재 문제와 동일 뿌리).

### 설계

| 축 | 지금 상태 | 100학원 대응 설계 |
|---|---|---|
| **AI Cache** | (단어,뜻,답안) 조합 캐시, 5필드 키(모델 무관) | `academy_id` 적용 후에도 캐시는 자연히 학원별로 분리됨(word_id가 학원마다 다른 행이므로 별도 조치 불필요). **확장 아이디어(지금 당장 불필요)**: 동일 시판 교재(예: 능률/YBM 특정 단원)를 쓰는 여러 학원 간 "교재 콘텐츠 수준 캐시 공유" — 캐시 키에 학생 식별 정보가 전혀 없어(word/meaning/answer만) 프라이버시 문제 없이 공유 가능, 학원 수가 많아질수록 캐시 히트율이 기하급수적으로 오를 여지 |
| **Usage limit** | 전역 일일 $2 상한(`MAX_DAILY_COST`) | `ai_usage_daily.academy_id`(§2) 기준 **학원별** 일일 상한으로 전환, 요금제별 예산 차등. 상한 초과 시 기존에 이미 있는 "budgetExceeded 강등"(AI 미호출, 규칙기반/사람 검토로 폴백) 로직을 그대로 재사용 — 새 메커니즘 불필요, 스코프만 학원 단위로 좁히면 됨 |
| **Model routing** | `providers.js`가 이미 OpenAI/Gemini/Anthropic 팩토리로 추상화돼 있음(기본 gpt-5-nano) | 이 추상화 위에 **정책 레이어만 추가**: 기본(대부분의 애매한 답안)은 계속 gpt-5-nano로 처리, 반복적으로 낮은 confidence가 나오는 케이스나 Enterprise 요금제에는 더 정밀한 모델(예: Claude Haiku급)로 승격 옵션 제공 — 새 인프라 불필요, 기존 팩토리에 라우팅 규칙만 얹는 것 |
| **GPT nano 사용 영역** | 현재 전량 | 일반 요금제(Free/Starter/Professional)의 기본 채점 — 비용 대비 이미 충분히 검증됨(감사 문서 기준 정확도/비용 균형 양호) |
| **고급 모델 사용 영역** | 없음 | Enterprise 요금제 옵션, 또는 반복 저신뢰(low-confidence) 케이스의 2차 재검증에 한정 — "전부 고급 모델로"가 아니라 "필요한 곳만" |
| **배치 중복 제거** | 미구현(감사에서 지목된 남은 최적화) | 동일 배치 내 여러 학생의 동일 오답을 사전 그룹핑 후 1회만 AI 호출 — 학원 수가 늘수록(동시 접속 학생 수 증가) 이 효과가 커짐, 100학원 규모에서는 이게 오히려 캐시보다 더 큰 절감 레버가 될 수 있음 |

### 핵심 결론

100학원 규모의 AI 비용 문제는 **"AI를 어떻게 더 싸게 쓰느냐"가 아니라
"학원별로 얼마나 쓰는지 계량하고 그 안에서 자동으로 제어되게 하느냐"**
의 문제다 — 계량 인프라(`ai_usage_daily.academy_id`)만 있으면 나머지
(캐시/모델선택/상한강등)는 전부 지금 이미 있는 메커니즘의 스코프만
좁히는 일이다. 새로 발명할 것이 거의 없다는 것 자체가 이 파이프라인이
애초에 잘 설계됐다는 방증.

---

## [2026-07-31 병합] `academy_id` 적용 기준 Q1~Q5 의사결정 트리 (원본: PAUL_EASY_VOCA_MULTITENANT_DATABASE_DESIGN.md §3)

_(2026-07-31 문서 정리: `PAUL_EASY_VOCA_MULTITENANT_DATABASE_DESIGN.md`
에서 병합)_

새 테이블이 추가될 때마다 아래 순서로 판단한다(의사결정 규칙):

```
Q1. 이 테이블에서 academy(classes 또는 students)까지 FK 체인이
    끊김 없이 항상 도달하는가?
      └─ YES → 직접 컬럼 불필요, RLS는 조인으로 처리 (NO 그룹)
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
      └─ YES → 직접 컬럼 + "공유 여부" 플래그를 별도로 검토
```

**원칙**: 기본값은 항상 "직접 컬럼 불필요"(Q1)다 — 비정규화(모든
테이블에 academy_id 복제)는 반 이동/교재 재배정 같은 기존 동작이
있을 때마다 여러 테이블을 동기화해야 하는 새 버그 표면을 만든다.
직접 컬럼은 위 4가지 예외(Q2~Q5)에 해당할 때만 추가한다.

---

## [2026-07-31 병합] Migration 위험 분석 표 (원본: PAUL_EASY_VOCA_MULTITENANT_DATABASE_DESIGN.md §6)

_(2026-07-31 문서 정리: `PAUL_EASY_VOCA_MULTITENANT_DATABASE_DESIGN.md`
에서 병합)_

| 위험 | 시나리오 | 완화 방법 |
|---|---|---|
| **백필 실수** | 기존 111명 데이터에 `academy_id`가 잘못 채워짐(예: NULL로 남거나 잘못된 값) | 마이그레이션을 "컬럼 추가(nullable) → 기존 전체 행에 academy #1 UPDATE → NOT NULL 제약 추가"의 **3단계로 분리**, 각 단계 사이에 검증 쿼리 실행 |
| **GRANT 누락** | `students`에 신규 컬럼을 추가하면서 GRANT를 빠뜨림 | `DATABASE.md`가 이미 이 함정을 명문화(v1.9 이후 테이블 단위 SELECT 회수 상태) — 체크리스트에 명시적으로 포함, v2.1이 올바르게 지켰던 선례를 그대로 재현 |
| **컬럼 추가 ≠ 격리** | 컬럼만 배포하고 RLS 적용을 나중으로 미룸 | 짝으로 배포, 중간 상태를 최소화 |
| **`seasons`을 "컬럼 추가만"으로 오인** | 실제로는 "최신 행=현재 시즌" 쿼리 로직 자체를 "학원별 최신 행"으로 다시 짜야 하는데, 단순 컬럼 추가로 착각하고 넘어감 | §2에서 이미 "로직 재설계"로 별도 표시 — 이 테이블만 별도 작업 티켓으로 분리 권장 |
| **nullable FK 처리 누락** | `students.class_id`/`textbooks.owner_class_id`/`spelling_review_queue.student_id`가 null인 행들이 백필 시 academy_id도 비게 됨(고아 행) | 백필 SQL에 이 nullable 케이스들을 명시적으로 다루는 분기 포함, 백필 후 "academy_id가 NULL인 행이 있는가" 검증 쿼리 필수 |
| **대용량 UPDATE로 인한 락/성능 영향** | 백필 UPDATE가 큰 테이블(진행도류)에서 실행되면 순간적으로 부하 발생 | 지금 규모(111명)에서는 미미하지만, **학원 운영 시간(수업 중)을 피해 실행**하는 습관을 이 시점부터 들여둘 것(향후 더 큰 규모에서 필수가 됨) |
| **롤백 계획 부재** | RLS 적용 후 예상 못한 회귀 발생 시 어떻게 되돌릴지 미리 정의 안 함 | v3_11 검토 세션의 패턴 그대로 재사용: `disable row level security`로 즉시 원복 가능하게 정책을 설계, 컬럼 자체는 `DROP COLUMN` 하지 않고(이 저장소 관례) 남겨둠 |
| **테스트 스크립트 회귀**(v3_11에서 실제로 발생한 패턴 재발 가능성) | QA용 `test*.mjs` 스크립트들이 `academy_id`/신규 인증 없이 호출하면 마이그레이션 후 깨짐 | v3_11 검토 세션에서 이미 이 패턴을 문서화(`docs/audit/2026-07-26-v3_11-lockdown-execution-review.md` 3번) — 같은 방식으로 "예상된 부작용"으로 미리 기록해둘 것 |

---

## [2026-07-31 병합] 100개 학원 운영 시 예상 문제 — DB 관점 (원본: PAUL_EASY_VOCA_MULTITENANT_DATABASE_DESIGN.md §7)

_(2026-07-31 문서 정리: `PAUL_EASY_VOCA_MULTITENANT_DATABASE_DESIGN.md`
에서 병합)_

1. **무필터 전체조회는 `academy_id` 컬럼 추가만으로 자동 해결되지
   않는다** — 코드가 실제로 `WHERE academy_id = ...`를 쓰도록 15+
   호출부를 고쳐야 한다. 컬럼만 있고 스코핑 코드가 없으면 100개
   학원의 데이터를 매번 전부 긁어온 뒤 애플리케이션에서 걸러내는
   최악의 패턴이 될 수 있다.
2. **`academy_id`에 인덱스가 없으면 RLS 정책 평가마다 풀스캔** —
   `idx_classes_academy_id`류 인덱스를 마이그레이션에 반드시 포함
   (기존에도 FK 인덱스 누락이 지적된 전례, `docs/audit/2026-07-24-
   performance-db.md`).
3. **Supabase 커넥션 풀 한계** — 100개 학원이 동시에 앱 포커스를
   되찾는 순간(등원 시간대 등) 버스트 쿼리가 겹칠 수 있음 — 이
   시점에 Supabase Team 티어 검토가 필요할 수 있다.
4. **`ai_usage_daily` 등 집계 테이블의 마이그레이션 이전 데이터
   귀속 문제** — 마이그레이션 시점 이전에 쌓인 사용량 기록을 어느
   academy로 볼지 애매(지금은 학원 1곳뿐이라 전량 academy #1 귀속
   처리하면 되지만, 이 규칙을 명시적으로 문서화 안 해두면 나중에
   혼란).
5. **`seasons` 로직 재작성이 불완전하면 가장 위험한 회귀** — 한
   학원이 "새 시즌 시작" 버튼을 눌렀는데 로직이 여전히 "전역 최신
   1행"으로 남아있으면 **다른 학원의 시즌까지 함께 바뀌는** 사고로
   이어질 수 있다 — 위 Migration 위험 분석에서 별도 티켓으로 분리
   권장한 이유가 바로 이 위험도.
6. **RLS 정책 누적에 따른 쿼리 플래너 오버헤드** — 특히 4~5홉 체인
   테이블(`sentence_progress` 등)은 정책 안에 조인이 들어가므로,
   테이블 수·정책 수가 늘어날수록 누적 비용 — "학생은 `student_id`
   직접 경로로 짧게 우회" 최적화(§4.3)가 이 규모에서 실제로
   필요해질 가능성 높음.
