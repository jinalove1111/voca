# PAUL_EASY_VOCA_ROLE_PERMISSION_MATRIX.md — 역할별 권한 매트릭스

_작성: 2026-07-26. **순수 설계 문서 — 코드/SQL/Migration을 이 세션에서
전혀 작성·실행하지 않았다.** `PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md`
(Global/Academy/User/Student 데이터 성격 분류 원본)를 그대로 기반으로,
그 데이터 성격 축에 **5개 역할**을 곱해 실제 접근 권한을 확정한다._

---

## 1. Super Admin (서비스 운영자)

| 항목 | 내용 |
|---|---|
| **볼 수 있는 데이터** | 전 학원의 **Academy 레벨 집계**(`academies`, 학원별 사용량/매출/오류로그), 학원 목록·플랜·과금상태. **Student/Learning 레벨 개별 데이터는 기본적으로 안 봄** — 지원 목적으로만, 감사로그 기록 시에만 예외 접근 |
| **수정 가능한 데이터** | `academies`(플랜/상태), `academy_members`(지원 목적 초기화 — 예: 비밀번호 재설정 트리거) |
| **삭제 가능한 데이터** | `academies`(단, 즉시 삭제가 아니라 통제된 오프보딩 절차를 통해서만 — `SAAS_ARCHITECTURE_PLAN.md` §5.4) |
| **절대 접근하면 안 되는 데이터** | `students`의 PIN 4컬럼(`pin_hash` 등, v1.9 원칙 — **Super Admin도 예외 없음**), 결제수단 원본(애초에 시스템에 저장 안 됨), 감사로그 없는 개별 Learning 데이터 열람 |
| **필요한 화면** | Platform Admin Dashboard(`SAAS_ARCHITECTURE_PLAN.md` §9.1) — 기존 `AdminScreen.jsx`와 완전히 별도 라우트/인증 |
| **필요한 API 권한** | `academies` CRUD, 학원별 집계 통계 조회 API, 지원용 임시 접근(시간제한+자동 감사로그) — **service_role 수준이지만 모든 호출이 로그로 남는 것이 전제조건** |

---

## 2. Academy Owner (학원 원장)

| 항목 | 내용 |
|---|---|
| **볼 수 있는 데이터** | 자기 `academy_id`의 Academy 레벨 데이터 전체(`classes`/`students`/`textbooks`/`daily_assignments`/집계 통계), 자기 학원 학생들의 Learning 데이터(반 전체 성과 조회 목적), 결제상태 |
| **수정 가능한 데이터** | `classes`/`units`/`words`(콘텐츠), `students`(로스터·반배정), `daily_assignments`(숙제 배정), `class_textbooks`, `entrance_tests`(시작/종료), `academy_members`(교사 초대/해제), `academy_settings` |
| **삭제 가능한 데이터** | `classes`(반 삭제, `ON DELETE SET NULL`로 학생 보존), `students`(학생 삭제), `academy_members`(교사 해제) — **전부 파괴적 액션이라 매 요청 재인증 필요**(`checkAdminReauth` 패턴 그대로) |
| **절대 접근하면 안 되는 데이터** | 다른 `academy_id`의 모든 데이터, `students`의 PIN 4컬럼(원장도 예외 없음 — v1.9 원칙은 역할 무관 절대 원칙), Platform 레벨 데이터(다른 학원 매출·통계), Super Admin 전용 기능 |
| **필요한 화면** | 기존 `AdminScreen.jsx` 그대로 + 결제상태 탭(신규, `SAAS_ARCHITECTURE_PLAN.md` §9.2) |
| **필요한 API 권한** | `admin-content-write`(현재 adminPin → 향후 Auth 토큰 전환) 전체 action, `admin-pin-actions` 전체, 자기 `academy_id` 스코프의 전 CRUD |

---

## 3. Teacher (선생님)

| 항목 | 내용 |
|---|---|
| **볼 수 있는 데이터** | Owner와 대부분 동일(자기 academy의 Academy/Learning 데이터) — 단 원장이 `academy_roles`로 **담당 반 범위**를 좁혔다면 그 범위만 |
| **수정 가능한 데이터** | Owner의 부분집합: `classes`/`units`/`words` 콘텐츠, `daily_assignments`, `entrance_tests`(담당 반), `spelling_review_queue` 검토(accept/dismiss) |
| **삭제 가능한 데이터** | **원칙적으로 없음(또는 매우 제한적)** — 반/학생 삭제 같은 학원 전체에 영향을 주는 파괴적 액션은 **Owner 전용으로 제한**하는 것을 권장(§4의 "권한 문제 예측"과 직결되는 설계 판단) |
| **절대 접근하면 안 되는 데이터** | 결제/플랜 변경, 다른 교사 초대·해제, 학원 삭제, 다른 `academy_id` 전체, PIN 4컬럼 |
| **필요한 화면** | `AdminScreen.jsx`의 **부분집합** — Owner 전용 탭(결제/교사관리/학원설정)이 안 보이는 형태(**신규 UI 작업 필요**, 지금은 이 구분 자체가 없음) |
| **필요한 API 권한** | `admin-content-write`의 **일부 action만 허용**(`class.delete`/`class.update_settings`류 Owner 전용 action은 거부) — 지금 이 action별 차등 인가는 존재하지 않으므로 **신규 구현 필요**(`SAAS_ARCHITECTURE_PLAN.md` §3의 Teacher 역할 도입과 함께) |

---

## 4. Student (학생)

| 항목 | 내용 |
|---|---|
| **볼 수 있는 데이터** | 자기 자신의 Learning 데이터 전체, 자기 소속 학원의 Academy 콘텐츠(`words`/`units`, **조회만**) |
| **수정 가능한 데이터** | 자기 자신의 Learning 데이터 — 단 "과거 기록을 임의로 고치는" 것이 아니라 **새 기록을 append하는 방식**(퀴즈/쓰기 답안 제출, 진행도 갱신) |
| **삭제 가능한 데이터** | **없음** — 학생은 어떤 데이터도 삭제 권한이 없다 |
| **절대 접근하면 안 되는 데이터** | 다른 학생의 모든 데이터, **자기 자신의 PIN 해시도 조회 불가**(v1.9 원칙 — 본인조차 예외 없음), Academy 콘텐츠 쓰기(반/단어 편집), 다른 `academy_id` 전체 |
| **필요한 화면** | 기존 학생 화면 전체(변경 없음) |
| **필요한 API 권한** | `verify-student-pin`(로그인), 진행도 sync API(fire-and-forget), 조회는 anon key 직접 — 단 향후 `academy_id` RLS 스코프 내로 제한(`SAAS_ARCHITECTURE_PLAN.md` §4.4 학생 익명 Auth 세션) |

---

## 5. Parent (학부모)

| 항목 | 내용 |
|---|---|
| **볼 수 있는 데이터** | **지정된 자녀**의 Learning 데이터(읽기 전용) |
| **수정 가능한 데이터** | **없음** |
| **삭제 가능한 데이터** | **없음** |
| **절대 접근하면 안 되는 데이터** | 다른 학생의 모든 데이터, 자녀 데이터의 수정(읽기 전용 원칙), PIN 관련 전부, Academy 콘텐츠, 다른 `academy_id` 전체, 원장/교사 전용 관리 기능 |
| **필요한 화면** | 기존 `ParentScreen.jsx`(변경 없음) |
| **필요한 API 권한** | 조회 전용 — **현재 별도 인증 없이 학생 이름만으로 조회**(`REAL_ACADEMY_SIMULATION.md` §2에서 이미 지적한 프라이버시 갭) — **개선 필요**: "이 학부모가 정말 이 학생의 보호자인가"를 확인하는 최소한의 연결 고리(예: 학생 등록 시 발급하는 학부모 전용 조회 코드)가 지금 없다. §4에서 상세 |

---

## 추가 1. Role Hierarchy 설계

```
Super Admin
   │  (전 학원 횡단, 일상적으로는 접근 안 함 — 감사로그 필요시만)
   ▼
Academy Owner
   │  (자기 academy_id 내 최고권한)
   ▼
Teacher
   │  (Owner가 위임한 범위 내)
   │
   ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ (계층 밖 — 상속 관계 아님)
   │
   ├── Student  (자기 자신의 데이터만, 독립적 스코프)
   └── Parent   (지정된 자녀 데이터만, 독립적 스코프)
```

**핵심 설계 판단**: Student/Parent는 Owner/Teacher 계층의 "가장
아래"가 아니라 **완전히 별도의 스코프**다 — 원장이라고 학생의 모든
것을 무제한으로 볼 수 있는 게 아니다(PIN 4컬럼은 원장도 못 봄). **상위
역할이 하위 역할의 권한을 자동으로 포함하지 않는다**는 것이 이
계층도의 가장 중요한 예외.

---

## 추가 2. Permission Rule (일반 원칙)

1. **계층이 곧 전지전능을 뜻하지 않는다** — Super Admin이든 Owner든,
   `students`의 PIN 4컬럼처럼 **역할과 무관하게 절대 차단되는 데이터**
   가 있다(v1.9 원칙, 규칙 11).
2. **조회 권한과 쓰기 권한은 항상 별도로 판단한다** — 예: Teacher는
   반 전체 통계를 볼 수 있지만 학원 설정을 바꿀 수는 없다(§3).
3. **파괴적 액션은 역할과 무관하게 항상 재인증을 요구한다** —
   `checkAdminReauth` 패턴을 Teacher/Owner 구분과 별개로 유지.
4. **최소 권한 원칙(need-to-know)** — 특히 Teacher 도입 시, "이
   교사가 이 정보를 몰라도 업무에 지장 없다면 기본값은 비노출"로
   설계(예: 결제 정보는 Teacher 화면에 애초에 렌더링 자체를 안 함,
   "권한 없음" 에러가 아니라 UI에서 아예 안 보이게).
5. **Student/Parent는 "과거 기록 수정"이 아니라 "새 기록 추가"만
   가능하다** — 이미 이 앱의 append-only 진행도 철학(`useStudent.js`
   record 패턴)과 일치, 새로 발명한 규칙이 아니라 기존 관례의 재확인.

---

## 추가 3. RLS 정책에 필요한 조건

`TABLE_OWNERSHIP_MATRIX.md`의 데이터 성격별로 RLS 조건이 다르다:

| 데이터 성격 | RLS 조건 |
|---|---|
| Academy 데이터 | `academy_id = current_academy_id()` **AND** (쓰기라면) `current_role() IN ('owner','teacher')` |
| Academy 데이터 중 Owner 전용 액션(삭제/설정/교사관리) | 위 조건 + `current_role() = 'owner'` |
| Student/Learning 데이터(학생 본인 접근) | `student_id = current_student_id()`(학생 세션 클레임) |
| Student/Learning 데이터(교사/원장의 반 전체 조회) | `academy_id = current_academy_id()` **AND** `current_role() IN ('owner','teacher')` — 학생 개인 식별자 노출은 최소화 |
| Parent 접근 | **`parent_student_link` 같은 신규 연결 테이블 필요**(지금 존재하지 않음) — `linked_student_id`가 요청 대상과 일치할 때만 SELECT 허용. **현재 "이름만으로 조회" 모델은 이 조건 자체가 없다는 뜻**(§4에서 개선안) |
| Global 데이터(현재 없음) | 조건 없이 전체 허용(SELECT만) — 향후 실제로 생기면 `is_shared_template=true` 같은 명시적 플래그 조건 추가 |

---

## 추가 4. 실제 학원 운영 시 발생하는 권한 문제 예측

| 문제 시나리오 | 원인 | 예방 설계 |
|---|---|---|
| 원장이 만들어준 교사 계정이 결제 정보까지 봄 | Teacher 화면에 Owner 전용 UI가 조건 없이 노출 | §3에서 이미 "Owner 전용 탭 비노출"을 필요 화면에 명시 |
| 여러 교사가 동시에 같은 반 설정을 수정해 충돌 | 낙관적 동시성 제어 부재(현재 단일 관리자 전제 설계의 잔재) | 반 설정 저장 시 마지막 수정자/시각 표시 정도의 최소 대응(완전한 락 시스템은 과설계, 100학원 규모에서도 동시 교사 수가 많지 않아 실사고 확률 낮음) |
| **퇴사한 교사 계정이 즉시 비활성화 안 돼서 계속 접근 가능** | `academy_members.status` 변경이 실제 세션 만료로 즉시 이어지지 않을 수 있음(JWT 캐시 등) | 계정 해제 시 해당 사용자의 활성 세션을 강제 무효화하는 절차 필요(Supabase Auth의 세션 revoke 기능 활용) |
| **학부모가 다른 아이 이름을 알아서 그 아이 정보까지 봄** | `REAL_ACADEMY_SIMULATION.md` §2가 이미 실사용 시나리오로 지적 — 지금 학부모 인증이 "이름만으로 조회" | §추가3의 `parent_student_link` 신규 설계가 근본 해법 — 다학원 확장 전 반드시 개선 대상으로 표시 |
| Teacher가 실수로 반을 삭제해 Owner가 모르게 데이터 소실(진행도는 보존되지만 반 배정은 풀림) | Teacher에게 파괴적 액션 권한을 과하게 부여 | §3에서 이미 "반/학생 삭제는 Owner 전용" 원칙 명시 |

---

## 추가 5. 100개 학원 SaaS 운영 기준 최종 권한 모델

| 역할 | 스코프 | 인증 방식 | 핵심 원칙 |
|---|---|---|---|
| Super Admin | 전 학원 | Supabase Auth + 2FA(`SAAS_ARCHITECTURE_PLAN.md` §7.3) | 모든 접근이 감사로그에 남음, 일상적 개별 데이터 열람 안 함 |
| Academy Owner | 자기 academy_id | Supabase Auth | 학원 내 최고권한이지만 PIN 4컬럼 등 절대 차단 데이터는 예외 없음 |
| Teacher | 자기 academy_id(선택적으로 담당 반) | Supabase Auth | Owner의 부분집합, 파괴적 액션 대부분 제외 |
| Student | 자기 student_id + 자기 academy_id | 기존 PIN 모델 + 익명 Auth 세션(향후) | 계층 밖 독립 스코프, 본인 PIN도 조회 불가 |
| Parent | 지정된 자녀 student_id | **신규 연결 모델 필요**(`parent_student_link`) | 현재 모델(이름 조회)은 다학원 확장 전 반드시 교체 대상 |

**최종 원칙 3가지**:
1. **PIN 4컬럼 절대 차단은 이 매트릭스 전체에서 유일하게 역할 무관
   절대 원칙**이다 — Super Admin부터 Student 본인까지 예외 없음.
2. **파괴적 액션(삭제/설정변경/과금)은 Owner 이상만** — Teacher 도입이
   "권한 확대"가 아니라 "위임 가능한 일상 업무만 넘기는 것"이라는
   원칙을 지킨다.
3. **Parent 인증 모델 교체가 다학원 확장의 숨은 전제조건**이다 —
   지금까지 이 문서 스위트 어디에도 명시적으로 "반드시 고쳐야 할
   것"으로 못박히지 않았던 것을 여기서 확정한다: `academy_id` 격리가
   아무리 완벽해도, 학부모 인증이 "이름만"이면 **같은 학원 안에서도**
   다른 가정의 자녀 정보가 새는 구조는 그대로 남는다.

---

## 관련 문서

`PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md`(데이터 성격 분류 원본),
`PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md`(§3~4 권한/RLS 원본),
`PAUL_EASY_VOCA_REAL_ACADEMY_SIMULATION.md`(§2 학부모 프라이버시 갭
최초 발견), `DATABASE.md`(v1.9 PIN 컬럼권한 원칙).
