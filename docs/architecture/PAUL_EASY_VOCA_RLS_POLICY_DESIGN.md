# PAUL_EASY_VOCA_RLS_POLICY_DESIGN.md — Supabase RLS 정책 설계

_작성: 2026-07-26. **순수 설계 문서 — 코드/SQL/Migration을 이 세션에서
전혀 작성·실행하지 않았다.** `PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md`
(데이터 성격 분류)와 `PAUL_EASY_VOCA_PERMISSION_MATRIX.md`(역할별
권한, 구 ROLE_PERMISSION_MATRIX.md는 그 5-역할 버전이 이 문서로 대체됨)
를 그대로 기반으로, 이번엔 **Supabase RLS 정책이라는 실행 레이어**
로 구체화한다. SQL은 작성하지 않고 정책의 **논리(누가/무엇을/어떤
조건으로)**만 설계한다._

---

## 1. RLS 기본 원칙

1. **DB 레벨이 최종 방어선이다** — 애플리케이션 코드에 버그가 있어도
   RLS가 막아야 한다(`v3_11` 락다운에서 이미 증명된 이 저장소의 원칙).
2. **컬럼 추가 ≠ 격리** — `academy_id` 컬럼이 있어도 그 컬럼을 실제로
   필터링하는 정책이 없으면 아무 의미 없다(`MULTITENANT_DATABASE_
   DESIGN.md` §5 재확인).
3. **Fail-closed가 기본값** — RLS를 켜고 정책을 하나도 안 만들면
   Postgres는 해당 작업을 자동으로 전부 거부한다. 이 앱은 이미 이
   원칙을 실제로 쓰고 있다(`v3_11`의 "SELECT 정책만 두고 나머지는
   default-deny"가 그 예).
4. **두 가지 다른 메커니즘을 이미 병행 중이다** — ①**행 단위 RLS**
   (이번 문서의 대상)와 ②**컬럼 단위 GRANT**(`students`의 PIN 4컬럼,
   v1.9) — 이 둘은 독립적이다. PIN 컬럼 차단은 RLS로 대체되지 않고
   **그대로 유지**된다(§5).
5. **service_role은 RLS를 완전히 우회한다** — 이 저장소의 Edge
   Function들이 이미 이 특성을 활용 중(`admin-content-write` 등) —
   그래서 이 키를 쓰는 코드 안에서는 **애플리케이션 레벨 검증이
   RLS를 대신하는 최종 방어선**이 된다(§8).
6. **클라이언트 state는 신뢰하지 않는다** — `authed` 같은 프런트엔드
   state는 UX용일 뿐, 실제 인가는 항상 서버(JWT 클레임 또는
   service_role 경유 검증)에서 이뤄진다.
7. **정책은 최소 권한에서 시작한다** — 새 테이블/역할이 추가될 때
   기본값은 항상 "차단", 필요가 명확히 확인된 것만 허용을 추가한다.

---

## 2. Role별 접근 정책 (SELECT/INSERT/UPDATE/DELETE, 일반 원칙)

테이블별 구체 조건은 §3에서 다룬다 — 여기서는 역할 전체를 관통하는
CRUD 패턴만 정리한다.

| 역할 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **Super Admin** | Academy 레벨 집계 전체(전 학원), 개별 Learning 데이터는 감사로그 동반 시만 | `academies`/`academy_members`(지원 목적) | 동일 | `academies`(통제된 오프보딩 절차 경유만) |
| **Academy Owner** | 자기 `academy_id`의 전체(Academy+Learning 집계) | 자기 academy 범위 콘텐츠·로스터 | 동일 | 반/학생/교사(재인증 필수) |
| **Teacher** | 자기 academy(선택적으로 담당 반만) | 콘텐츠/숙제 배정/검토 큐 처리 | 동일 | **원칙적으로 없음**(§7) |
| **Student** | 본인 Learning 데이터 + 소속 academy 콘텐츠(읽기만) | 본인 학습기록(append 방식) | 본인 진행도(upsert이지만 과거 기록 임의수정 아님) | **없음** |
| **Parent** | 지정된 자녀 Learning 데이터만 | **없음** | **없음** | **없음** |

**패턴 요약**: 아래로 갈수록(Super Admin→Parent) 쓰기 권한이 급격히
좁아지고, Parent는 유일하게 **네 가지 작업 중 SELECT 하나만** 허용된
역할이다.

---

## 3. Table별 RLS 설계

사용자가 제시한 10개 테이블명 중 일부는 이 저장소의 실제 테이블명과
다르다 — 실제 대응 테이블로 매핑해 설계한다(`profiles`/`teachers`/
`assignments`/`analytics`는 실제로 존재하지 않거나 여러 테이블의
집합이다).

| 요청하신 이름 | 실제 대응 | 데이터 소유자 | 접근 가능 역할 | 차단해야 하는 접근 | 필요한 조건 |
|---|---|---|---|---|---|
| **academies** | `academies`(신규) | Academy(자기 자신이 루트) | Super Admin(전체), Owner/Teacher(자기 academy 조회만) | 타 academy 조회, Owner/Teacher의 플랜·과금 UPDATE | `id = current_academy_id()` (Owner/Teacher) 또는 무조건 허용(Super Admin) |
| **profiles** | `academy_members`(신규, 원장/교사 개인 계정 프로필) | User(그 사람 본인 + 소속 academy) | 본인(전체), 같은 academy Owner(조회), Super Admin(지원 목적) | 타 academy 소속 계정 조회/수정 | `auth_user_id = auth.uid()` (본인) 또는 `academy_id = current_academy_id() AND current_role()='owner'` |
| **teachers** | `academy_members`(role='teacher'인 부분집합, `profiles`와 **같은 테이블**) | Academy | Owner(초대/해제/조회), 본인(자기 것만 조회) | Teacher가 다른 Teacher 계정을 관리 | `academy_id = current_academy_id() AND current_role()='owner'` (관리), `auth_user_id=auth.uid()`(본인 조회) |
| **students** | `students` | **Student**(§`TABLE_OWNERSHIP_MATRIX.md`) | Owner/Teacher(로스터 조회·관리), 학생 본인(자기 레코드만), **Parent는 이 테이블 직접 접근 안 함**(§6) | 타 academy, PIN 4컬럼(전 역할 예외 없음, GRANT 레벨 차단) | `academy_id = current_academy_id()` (staff), `id = current_student_id()`(본인) |
| **classes** | `classes` | Academy | Owner/Teacher(관리), 학생(읽기, 자기 반만) | 타 academy | `academy_id = current_academy_id()` |
| **assignments** | `daily_assignments`(숙제 배정) | Academy(체인, `class_id` 경유) | Owner/Teacher(관리), 학생(읽기, 자기 반 배정만) | 타 academy | `class_id`가 속한 `classes.academy_id = current_academy_id()` |
| **student_progress** | `student_progress` | **Student** | 본인(전체), Owner/Teacher(조회만, 자기 academy 학생) | 타 academy, 타 학생, **Parent의 직접 UPDATE**(읽기 전용 원칙) | `student_id = current_student_id()`(본인) 또는 `academy_id`(staff, `students` 조인) |
| **words** | `words` | Academy(체인, `unit_id`→`unit`→`class` 경유) | Owner/Teacher(관리), 학생(읽기) | 타 academy, 학생의 쓰기(콘텐츠 편집 금지) | `unit_id`가 속한 `units.class_id`가 속한 `classes.academy_id = current_academy_id()` |
| **units** | `units` | Academy(체인) | 동일 | 동일 | `class_id`가 속한 `classes.academy_id = current_academy_id()` |
| **analytics** | **여러 테이블의 집합**: `product_events`/`writing_answer_statistics`/`word_king_history`/`ai_usage_daily` | Academy(집계, `TABLE_OWNERSHIP_MATRIX.md`의 재분류 규칙) | Owner/Teacher(자기 academy 집계 조회), Super Admin(전 학원 집계) | 학생/학부모의 직접 접근(집계 데이터는 성인 전용, `LEARNING_ANALYTICS_PLAN.md`의 청중별 차등 원칙과 일관), 타 academy 집계와 섞임 | `academy_id = current_academy_id()`(각 테이블 직접 컬럼 또는 체인) |

---

## 4. `academy_id` 기반 데이터 격리 방식

`MULTITENANT_DATABASE_DESIGN.md` §5의 결론을 정책 레벨로 구체화한다:

1. **anchor 6개 테이블**(`classes`/`students`/`textbooks`/`seasons`/
   `product_events`/`ai_usage_daily`)은 **직접 컬럼 비교**:
   `academy_id = current_academy_id()`.
2. **체인 테이블**(나머지 21개+)은 **조인 기반 EXISTS 조건**으로
   anchor까지 거슬러 올라가 확인 — 단, 4~5홉 체인(`sentence_progress`
   등)은 성능을 위해 **더 짧은 경로**(`student_id`가 있으면 학생
   테이블을 통해 직접, `class_id`가 있으면 반 테이블을 통해 직접)를
   우선 사용.
3. **`current_academy_id()` 헬퍼 함수**(SECURITY DEFINER)가 모든
   정책에서 재사용되는 단일 진실 원천 — 매 정책마다 JWT 파싱 로직을
   반복하지 않는다.
4. **학생은 별도 헬퍼**(`current_student_id()`)를 쓴다 — 학생은
   academy 전체가 아니라 **자기 자신**만 볼 수 있는 게 원칙이므로,
   academy 조건과 student 조건을 같은 정책에 섞지 않고 테이블 성격에
   따라 다른 헬퍼를 적용(§3에서 이미 구분).
5. **격리 검증 기준**: `academy_id` 필터 하나로 export 시 정확히 그
   academy 데이터만 나와야 한다(`SAAS_ARCHITECTURE_PLAN.md` §5.4의
   검증 기준 재확인) — 이게 RLS 설계가 "제대로 됐는지"의 유일한
   실측 가능한 합격선.

---

## 5. 학생 개인정보 보호 정책

- **PIN 4컬럼(`pin_hash`/`pin_fail_count`/`pin_locked_until`/`pin_
  setup_allowed`)은 RLS 대상이 아니라 컬럼 단위 GRANT 차단**(v1.9) —
  **이 문서가 설계하는 어떤 RLS 정책도 이 차단을 대체하거나 우회하지
  않는다.** 학생 본인도, Owner도, Super Admin도 이 4컬럼은 어떤
  경로로도 조회 불가 — 유일하게 서버(`api/_pinAuth.js`, service_role)
  만 접근.
- **학생 식별은 항상 UUID**(`students.id`) — 이름으로 매칭하는
  정책/조건을 어디에도 만들지 않는다(규칙 4 재확인).
- 학생의 학습 데이터(진행도/오답 등)는 **본인 + 소속 academy의
  Owner/Teacher까지만** — 다른 학생, 다른 academy, Parent(직접 테이블
  접근으로는 안 됨, §6)는 전부 차단.
- **익명화된 `product_events`는 재식별 금지가 최우선 원칙** — 이
  테이블에 `academy_id`를 추가해도 `student_id`는 추가하지 않는다
  (`TABLE_OWNERSHIP_MATRIX.md` §4 Rule 4).
- 향후 학생도 Supabase 익명 Auth 세션을 쓰게 되면(`SAAS_ARCHITECTURE_
  PLAN.md` §4.4), 그 세션의 `app_metadata`에도 **PIN 관련 정보는 절대
  담지 않는다** — `student_id`/`academy_id`만.

---

## 6. Parent 접근 제한 정책

### 현재 모델의 근본 문제 (재확인)

`ROLE_PERMISSION_MATRIX.md`가 이미 확정한 사실: 지금은 학부모 인증
자체가 없다("이름만으로 조회"). **RLS를 아무리 잘 설계해도, 애초에
"이 사람이 정말 이 학생의 보호자인가"를 확인하는 정책 조건 자체가
지금 없다.**

### 설계 — `parent_student_link` (개념, SQL 아님)

```
parent_student_link (개념)
  id, student_id → students(id), access_code(발급된 조회 코드),
  created_at, revoked_at(nullable — 학부모 접근 회수 시)
```

- **발급 시점**: 학생 최초 등록 시 관리자가 `access_code`를 생성해
  보호자에게 전달(임시 PIN 발급과 동일한 오프라인 채널 관례 재사용,
  `REAL_ACADEMY_SIMULATION.md` §1).
- **RLS 조건**: 학부모 세션은 `parent_student_link.access_code`로
  인증하고, 그 링크의 `student_id`에 대해서만 `student_progress` 등
  Learning 테이블 SELECT 허용 — `EXISTS (SELECT 1 FROM parent_
  student_link WHERE access_code = current_parent_code() AND
  student_id = <조회대상행의 student_id> AND revoked_at IS NULL)`.
- **접근 회수**: `revoked_at`을 채우는 것만으로 즉시 차단 가능(학생
  전학/졸업 시 원장이 처리).
- **완전 읽기 전용**: 이 연결 테이블 자체도 학부모는 SELECT조차 못함
  (자기 `access_code`를 아는 것 자체가 인증 수단이지, 그 테이블을
  조회할 필요는 없음).

### Parent가 절대 접근하면 안 되는 것 (재확인)

`words`/`units`/`classes` 등 Academy 콘텐츠, 다른 학생의 모든 것,
PIN 관련 전부, 원장/교사 전용 관리 기능, `analytics`(집계 데이터는
성인 전용 원칙, `LEARNING_ANALYTICS_PLAN.md` §2와 일관 — 학부모는
**완곡화된 리포트**를 볼 뿐 원본 집계 테이블에 직접 접근하지 않는다).

---

## 7. Teacher 권한 제한 정책

### 원칙 — "위임"이지 "권한 확대"가 아니다

- **파괴적 액션 배제**: 반 삭제, 학생 삭제, 교사 초대/해제, 학원
  삭제, 결제/플랜 변경 — 전부 `current_role() = 'owner'` 조건이
  추가로 필요.
- **action별 인가**(`admin-content-write` Edge Function의 dispatch
  패턴 확장): `class.delete`/`class.update_settings`(민감 설정)/
  `academy_members` 관련 action은 Owner 전용, `words.bulk_replace`/
  `word.accepted_meanings.update`/`daily_assignments` 관련 action은
  Teacher도 허용.
- **UI 차원에서도 이중 방어**: Owner 전용 기능은 Teacher 화면에서
  아예 렌더링하지 않음(§`ROLE_PERMISSION_MATRIX.md` §3 "권한 없음
  에러가 아니라 안 보이게") — RLS가 최종 방어선이지만, UX 혼란을
  막기 위한 앞단 필터링도 함께.
- **담당 반 세분화(선택적)**: `academy_roles`/`academy_members`에
  담당 `class_id` 목록을 두면, Teacher RLS 조건에 `class_id IN
  (담당 반 목록)`을 추가 — 이건 Owner가 선택적으로 켤 수 있는
  세밀한 권한이지 기본값은 아님(작은 학원은 전체 반 공유가 자연스러움).

---

## 8. Service Role 사용 영역

| 사용처 | 이유 | 추가 방어 필요 사항 |
|---|---|---|
| `admin-content-write`(기존) | 커리큘럼 쓰기(`classes`/`units`/`words`) — RLS가 SELECT만 허용하므로 쓰기는 이 경로로 우회 | 함수 내부에서 **adminPin/향후 Auth 토큰 + academy_id 일치 여부**를 직접 검증(RLS가 없는 구간이므로 이 검증이 유일한 방어선) |
| `grade-writing-answers`(기존) | AI 채점 파이프라인, 캐시/통계 테이블 쓰기 | 동일 원칙 — 함수 내부 인가 검증이 최종 방어선 |
| 향후 결제 웹훅(`SAAS_ARCHITECTURE_PLAN.md` §7.4) | PG사 콜백이 `subscriptions`/`billing_history` 쓰기 | 웹훅 서명 검증(PG사 제공 시크릿) + `academy_id` 일치 확인 — **이중 검증**(서명 실패 시 즉시 거부) |
| 향후 Platform Admin API(§Super Admin 지원 액션) | 학원 오프보딩/강제 초기화 등 | **모든 호출을 감사로그에 기록** — service_role 사용처 중 가장 민감(전 학원 접근 가능) |

**핵심 원칙**: service_role 키는 **브라우저에 절대 노출되지 않는다**
(기존 원칙 그대로) — 이 표의 모든 사용처는 서버(Edge Function/API)
안에서만 이 키를 쓰고, **RLS가 없는 구간이므로 그 함수 자체가 자기
안에서 RLS와 동등한 검증을 다시 구현해야 한다**는 것이 이 섹션의
핵심 메시지(§1 원칙 5의 실행판).

---

## 9. 100개 학원 운영 시 보안 사고 시나리오

| 시나리오 | 원인 | 예방 |
|---|---|---|
| **RLS 정책 배포 순서 실수** | `academy_id` 컬럼만 먼저 배포하고 정책은 나중(또는 반대) | `MULTITENANT_DATABASE_DESIGN.md` §5·§6이 이미 "컬럼과 RLS는 짝으로 배포"를 필수 원칙으로 명시 |
| **service_role 키 유출**(Edge Function 로그/코드에 실수로 노출) | 디버그 로그에 시크릿 값 출력, 에러 메시지에 키 포함 | 로그에 시크릿을 절대 출력하지 않는 기존 관례(PIN 비교 로직과 동일 원칙) 재확인, 코드 리뷰 시 Security Agent가 필수 확인 |
| **Teacher/Owner 세션으로 다른 academy JWT 클레임 위조 시도** | `app_metadata.academy_id`가 클라이언트에서 조작 가능하면 위험 | `app_metadata`는 **service_role만 쓰기 가능**(Supabase Auth 표준 특성) — 사용자 자신은 자기 클레임을 수정할 수 없음, 이 특성이 깨지지 않았는지 구현 시 재확인 |
| **Parent `access_code` 추측/무차별 대입** | 짧거나 예측 가능한 코드 형식 | 충분히 긴 랜덤 코드(PIN 4자리보다 훨씬 긴 문자열) + 실패 횟수 제한(학생 PIN과 동일한 브루트포스 방어 패턴 재사용) |
| **`spelling_ai_grading_cache` 등 캐시 테이블을 성급히 GLOBAL로 공유** | 비용 절감을 이유로 academy 경계 없이 캐시 공유 구현 | `TABLE_OWNERSHIP_MATRIX.md` §3이 이미 경고 — 공유는 반드시 명시적 정책 승인 후에만 |
| **`seasons` 로직 재작성 누락으로 크로스 학원 오염** | 컬럼은 추가했지만 "학원별 최신 행" 쿼리 로직을 안 고침 | `MULTITENANT_DATABASE_DESIGN.md` §6·§7이 이미 별도 작업 티켓으로 분리 권장 |
| **4~5홉 체인 테이블의 RLS 성능 저하가 타임아웃으로 이어짐** | 인덱스 없는 조인 정책이 100학원 규모 데이터에서 느려짐 | `academy_id`/FK 컬럼에 인덱스 필수(§4), 짧은 경로 우선 원칙(§3) |

---

## 10. 최종 RLS Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ 1차 방어선: 컬럼 단위 GRANT (v1.9, RLS와 별개)                │
│   students.pin_hash 등 4컬럼 — 전 역할 예외 없이 차단          │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│ 2차 방어선: 행 단위 RLS (이 문서의 대상)                       │
│                                                               │
│  anon key(학생/공개 조회) ──► academy_id/student_id 조건 정책  │
│  Supabase Auth(Owner/Teacher) ──► app_metadata 클레임 기반 정책│
│  Parent(access_code) ──► parent_student_link 기반 정책        │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│ 3차 방어선: service_role 경유 Edge Function 내부 검증          │
│   RLS가 우회되는 유일한 구간 — 함수 자체가 academy_id/role을    │
│   다시 검증(§8)                                               │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│ 4차 방어선: 비식별화 (product_events)                         │
│   애초에 재식별이 불가능하도록 설계 — 위 3개 방어선이 다 뚫려도│
│   이 테이블만은 개인 특정이 구조적으로 불가능                  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│ 5차 방어선: 감사 로그 + 모니터링                                │
│   위 4개가 전부 뚫렸을 때의 사후 탐지(SaaS TOP10 7·10번)       │
└─────────────────────────────────────────────────────────────┘
```

**설계 철학**: 어느 한 방어선도 단독으로 완전하다고 가정하지 않는다
— RLS(2차)가 이 문서의 주 대상이지만, 컬럼권한(1차)·서버 검증(3차)·
비식별(4차)·감사(5차)가 없으면 RLS 하나로는 부족하다는 것이 100개
학원 규모에서 이 아키텍처가 실제로 버텨야 하는 이유다.

---

## 관련 문서

`PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md`, `PAUL_EASY_VOCA_
PERMISSION_MATRIX.md`, `docs/agent-decisions/0006-multitenant-saas-
architecture.md`(§4 RLS 구현 패턴 원본, §5~7 격리 흐름·마이그레이션
위험 — 구 SAAS_ARCHITECTURE_PLAN.md/MULTITENANT_DATABASE_DESIGN.md는
2026-07-31 이 문서로 병합됨), `PAUL_EASY_VOCA_REAL_
ACADEMY_SIMULATION.md`(§2 학부모 프라이버시 갭 최초 발견),
`DATABASE.md`(v1.9 컬럼권한 원본).
