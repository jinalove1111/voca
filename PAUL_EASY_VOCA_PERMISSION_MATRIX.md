# PAUL_EASY_VOCA_PERMISSION_MATRIX.md — 6-역할 전체 권한 구조

_작성: 2026-07-26. **순수 설계 문서 — 코드/SQL/Migration을 이 세션에서
전혀 작성·실행하지 않았다.** `PAUL_EASY_VOCA_RLS_POLICY_DESIGN.md`
(RLS 정책 원본), `PAUL_EASY_VOCA_ROLE_PERMISSION_MATRIX.md`(5-역할
원본), `PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md`(테이블 분류 원본)를
기반으로 한다._

## 이 문서가 이전 문서와 다른 점 — 5-역할 → 6-역할

`ROLE_PERMISSION_MATRIX.md`/`RLS_POLICY_DESIGN.md`는 Super Admin/
Academy Owner/Teacher/Student/Parent **5개 역할**로 설계했다. 이
문서는 **`Academy Admin`을 신규로 추가**한다 — Owner와 Teacher
사이의 실제 학원 운영 현실(원장 외에 실장/부원장 등 **일상 운영을
총괄하지만 계약·결제 당사자는 아닌** 인력이 흔함)을 반영한 확장이다.

```
Super Admin
   │
Academy Owner ── (계약/결제 당사자, 최종 권한)
   │
Academy Admin ── (일상 운영 총괄, 계약/결제 제외)  ★ 신규
   │
Teacher ── (수업 관련 권한만)
   │
   ╌╌╌╌ (계층 밖, 독립 스코프)
   │
Student / Parent
```

**Owner vs Admin 핵심 차이 한 줄**: Admin은 Owner가 할 수 있는 거의
모든 일상 운영을 대신할 수 있지만, **"이 학원 자체의 존폐·계약·다른
Admin/Owner의 권한"에 관련된 것만 못 한다.**

---

## Super Admin (서비스 운영자)

| 항목 | 내용 |
|---|---|
| **조회 가능 테이블** | `academies`(전체), `academy_members`(전체, 지원 목적), 학원별 집계(`ai_usage_daily`/`product_events`/`writing_answer_statistics`/`word_king_history`) — **개별 `student_progress` 등은 감사로그 동반 시만 예외적으로** |
| **수정 가능 테이블** | `academies`(플랜/상태), `academy_members`(지원 목적 초기화 — 예: 계정 잠금 해제) |
| **금지 데이터** | `students`의 PIN 4컬럼(예외 없음), 결제수단 원본(시스템에 없음), 감사로그 없는 개별 Learning 데이터 열람 |
| **RLS 조건** | 대부분 RLS 대상이 아님(전용 Platform Admin API로 처리) — 만약 RLS로 표현한다면 `current_role() = 'super_admin'`(무조건 허용, 단 모든 접근이 로그 기록되는 것이 전제) |
| **Edge Function 필요 여부** | **필수(YES)** — 학원 생성/정지/삭제, 지원용 임시 접근은 전부 전용 서버 API(service_role) 경유. anon key로 직접 되는 것이 없어야 함(전 학원 횡단 권한이므로 가장 엄격) |

---

## Academy Owner (학원 원장, 계약·결제 당사자)

| 항목 | 내용 |
|---|---|
| **조회 가능 테이블** | 자기 `academy_id`의 `classes`/`units`/`words`/`textbooks`/`class_textbooks`/`students`/`daily_assignments`/`entrance_tests`/`entrance_test_results`(집계)/`academy_members`/`subscriptions`·`billing_history`(자기 학원 결제) |
| **수정 가능 테이블** | 위 전체 + `academy_settings` + `academy_members`(교사·Admin 초대/해제) + `subscriptions`(플랜 변경) |
| **금지 데이터** | 타 `academy_id` 전체, PIN 4컬럼, Platform 레벨 데이터(다른 학원 매출 등) |
| **RLS 조건** | `academy_id = current_academy_id() AND current_role() = 'owner'`(계약/결제/구성원관리류), 나머지 일반 콘텐츠는 `academy_id = current_academy_id() AND current_role() IN ('owner','admin','teacher')` |
| **Edge Function 필요 여부** | **부분적(YES for 쓰기, NO for 조회)** — 조회는 anon key+RLS로 직접 가능, 커리큘럼 쓰기는 `admin-content-write` 경유, 결제 플랜 변경은 전용 결제 API(service_role, PG 연동) 경유 |

---

## Academy Admin (운영 실장/부원장 — 신규)

| 항목 | 내용 |
|---|---|
| **조회 가능 테이블** | Owner와 **거의 동일**(`classes`/`units`/`words`/`students`/`daily_assignments`/`entrance_tests`/`academy_members`) — `subscriptions`/`billing_history`는 **조회는 가능하되**(운영 예산 파악 목적) 수정은 불가(아래) |
| **수정 가능 테이블** | `classes`/`units`/`words`/`students`/`daily_assignments`/`entrance_tests`/`class_textbooks`/`spelling_review_queue`(검토), `academy_members`(**Teacher 초대/해제는 가능, Owner·다른 Admin의 권한은 변경 불가**) |
| **금지 데이터** | `subscriptions` 변경/해지, `academies`(학원 자체) 삭제, Owner 권한 이양, 다른 Admin/Owner 계정 해제, 타 `academy_id`, PIN 4컬럼 |
| **RLS 조건** | `academy_id = current_academy_id() AND current_role() IN ('owner','admin')`(구성원 관리류, Teacher까지만 대상), 일반 콘텐츠는 Owner와 동일 조건(`role IN ('owner','admin','teacher')`) |
| **Edge Function 필요 여부** | **YES** — `admin-content-write`의 action별 인가 목록에 Admin이 Owner와 같은 수준으로 포함되되, `academy.delete`/`subscription.update`류 action은 **Owner 전용으로 명시적으로 제외** |

---

## Teacher (선생님)

| 항목 | 내용 |
|---|---|
| **조회 가능 테이블** | 자기 `academy_id`(선택적으로 담당 `class_id` 목록만 — Admin/Owner가 `academy_members`에 설정 시) — `classes`/`units`/`words`/`students`(로스터)/`daily_assignments`/`entrance_tests` |
| **수정 가능 테이블** | `units`/`words`(콘텐츠), `daily_assignments`(숙제 배정), `entrance_tests`(담당 반 시작/종료), `spelling_review_queue`(검토 accept/dismiss) |
| **금지 데이터** | `subscriptions`, `academy_members`(다른 구성원 관리), `academies`(학원 삭제), `classes`/`students` **삭제**(원칙적으로 Owner/Admin 전용), 타 `academy_id`, PIN 4컬럼 |
| **RLS 조건** | `academy_id = current_academy_id() AND current_role() IN ('owner','admin','teacher')`(일반), 담당 반 세분화 시 `class_id IN (담당반목록)` 추가, 파괴적 action은 `role IN ('owner','admin')`만 |
| **Edge Function 필요 여부** | **YES** — `admin-content-write` 경유하되 action 목록이 Owner/Admin보다 좁음(`class.delete`/`class.update_settings`(민감 설정)/`academy_members` 관련 action 전부 거부) |

---

## Student (학생)

| 항목 | 내용 |
|---|---|
| **조회 가능 테이블** | 본인 `student_progress`/`student_daily_progress`/`word_status`/`xp_ledger`/`entrance_test_results`/`sentence_progress`, 소속 `academy_id`의 `words`/`units`(읽기 전용, 콘텐츠 소비) |
| **수정 가능 테이블** | 본인 `student_progress`류(진행도 갱신) — **append 방식**(과거 기록 임의 수정 아님) |
| **금지 데이터** | 다른 학생의 모든 것, **본인 `students` 행의 PIN 4컬럼도 조회 불가**, `words`/`units`/`classes` 등 콘텐츠 **쓰기**, 타 `academy_id`, `subscriptions`/`academy_members` 등 성인 전용 관리 데이터, `analytics`류 집계(성인 전용, `LEARNING_ANALYTICS_PLAN.md`) |
| **RLS 조건** | `student_id = current_student_id()`(본인 Learning 데이터), `academy_id = current_academy_id()`(콘텐츠 읽기, 향후 익명 Auth 세션 클레임 기준) |
| **Edge Function 필요 여부** | **로그인만 YES**(`verify-student-pin`, service_role 경유 PIN 검증) — 일반 학습 기록 갱신은 **NO**, anon key(또는 향후 익명 Auth 세션)+RLS로 직접 |

---

## Parent (학부모)

| 항목 | 내용 |
|---|---|
| **조회 가능 테이블** | `parent_student_link`으로 연결된 **지정된 자녀 1명**의 `student_progress`/`student_daily_progress`류(읽기 전용, `RLS_POLICY_DESIGN.md` §6 설계 재사용) |
| **수정 가능 테이블** | **없음** |
| **금지 데이터** | 다른 학생의 모든 것, `words`/`units`/`classes` 등 Academy 콘텐츠, PIN 관련 전부, `academy_members`/`subscriptions`, `analytics`류 원본 집계 테이블(완곡화된 리포트만 소비, 원본 직접 접근 안 함), 타 `academy_id` |
| **RLS 조건** | `EXISTS (SELECT 1 FROM parent_student_link WHERE access_code = current_parent_code() AND student_id = <조회대상 행의 student_id> AND revoked_at IS NULL)` |
| **Edge Function 필요 여부** | **인증만 YES**(`access_code` 검증 — 학생 PIN 검증과 동일한 서버 전용 원칙), 인증 후 조회 자체는 **NO**(RLS로 직접) |

---

## 6-역할 요약표

| 역할 | 계약/결제 | 학원 삭제 | 구성원 관리 | 콘텐츠 쓰기 | 학생 개인정보 |
|---|---|---|---|---|---|
| Super Admin | 전 학원 조회만 | 통제된 절차로만 | 지원 목적만 | 안 함 | 감사로그 동반 시만 |
| Academy Owner | **가능** | **가능** | 전체(Admin/Teacher) | 가능 | PIN 제외 전체 |
| Academy Admin | 조회만 | **불가** | Teacher까지만 | 가능 | PIN 제외 전체 |
| Teacher | 불가 | 불가 | 불가 | 가능(담당 범위) | 로스터 조회만 |
| Student | 불가 | 불가 | 불가 | 불가(읽기만) | 본인 것만(PIN 제외) |
| Parent | 불가 | 불가 | 불가 | 불가 | 지정 자녀 것만(읽기) |

**한 줄 원칙**: 이 표를 왼쪽에서 오른쪽으로 읽으면 "권한이 좁아지는
순서"이자 동시에 "학생 개인정보에 가까워지는 순서"다 — 권한이 가장
넓은 Owner/Admin도 PIN 4컬럼 앞에서는 Student 본인과 동등하게
차단된다는 것이 이 매트릭스 전체의 유일한 절대 원칙(`RLS_POLICY_
DESIGN.md` §5 재확인).

---

## 관련 문서

`PAUL_EASY_VOCA_RLS_POLICY_DESIGN.md`, `PAUL_EASY_VOCA_ROLE_
PERMISSION_MATRIX.md`, `PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md`,
`PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md`, `DATABASE.md`(v1.9 PIN
컬럼권한 원본).

---

## [2026-07-31 병합] 실제 학원 운영 시 발생하는 권한 문제 예측 (원본: PAUL_EASY_VOCA_ROLE_PERMISSION_MATRIX.md 추가4)

_(2026-07-31 문서 정리: `PAUL_EASY_VOCA_ROLE_PERMISSION_MATRIX.md`에서
병합)_

| 문제 시나리오 | 원인 | 예방 설계 |
|---|---|---|
| 원장이 만들어준 교사 계정이 결제 정보까지 봄 | Teacher 화면에 Owner 전용 UI가 조건 없이 노출 | "Owner 전용 탭 비노출"을 필요 화면에 명시(Teacher 섹션 참고) |
| 여러 교사가 동시에 같은 반 설정을 수정해 충돌 | 낙관적 동시성 제어 부재(현재 단일 관리자 전제 설계의 잔재) | 반 설정 저장 시 마지막 수정자/시각 표시 정도의 최소 대응(완전한 락 시스템은 과설계, 100학원 규모에서도 동시 교사 수가 많지 않아 실사고 확률 낮음) |
| **퇴사한 교사 계정이 즉시 비활성화 안 돼서 계속 접근 가능** | `academy_members.status` 변경이 실제 세션 만료로 즉시 이어지지 않을 수 있음(JWT 캐시 등) | 계정 해제 시 해당 사용자의 활성 세션을 강제 무효화하는 절차 필요(Supabase Auth의 세션 revoke 기능 활용) |
| **학부모가 다른 아이 이름을 알아서 그 아이 정보까지 봄** | `PAUL_EASY_VOCA_REAL_ACADEMY_SIMULATION.md` §2가 이미 실사용 시나리오로 지적 — 지금 학부모 인증이 "이름만으로 조회" | `parent_student_link` 신규 설계(Parent 섹션의 RLS 조건 참고)가 근본 해법 — 다학원 확장 전 반드시 개선 대상으로 표시 |
| Teacher가 실수로 반을 삭제해 Owner가 모르게 데이터 소실(진행도는 보존되지만 반 배정은 풀림) | Teacher에게 파괴적 액션 권한을 과하게 부여 | "반/학생 삭제는 Owner 전용" 원칙 명시(Teacher 섹션 참고) |
