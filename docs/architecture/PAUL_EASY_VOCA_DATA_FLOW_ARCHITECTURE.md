# PAUL_EASY_VOCA_DATA_FLOW_ARCHITECTURE.md — 역할별 데이터 흐름 아키텍처

_작성: 2026-07-26. **순수 아키텍처 문서 — 코드/SQL/Migration을 이
세션에서 전혀 작성·실행하지 않았다.** `PAUL_EASY_VOCA_TABLE_
OWNERSHIP_MATRIX.md`/`PAUL_EASY_VOCA_RLS_POLICY_DESIGN.md`/`PAUL_
EASY_VOCA_PERMISSION_MATRIX.md`/`PAUL_EASY_VOCA_SAAS_SECURITY_
IMPLEMENTATION_CHECKLIST.md`를 "테이블이 무엇을 허용하는가"에서
"실제로 어떤 순서로 데이터가 생성·조회·수정되는가"로 재구성한다._

## 전 섹션 공통 원칙 — "anon+RLS 직접" vs "Edge Function(service_role) 경유" 판단 기준

이 문서 전체에서 반복되는 판단이라 먼저 한 번 정리한다:

```
단순 CRUD(단일 행, academy_id/student_id 조건 하나로 충분)
   → anon key + RLS 직접(Edge Function 불필요)
   예: 숙제 배정(daily_assignments), 학생 반 배정 변경

복잡한 비즈니스 로직(중복 확인/delete-then-insert/여러 테이블에
걸친 트랜잭션성 처리, 또는 PIN·access_code 같은 자격증명 검증)
   → Edge Function(service_role) 경유, RLS 우회 후 함수 내부 검증
   예: 커리큘럼 콘텐츠 쓰기(classes/units/words, `admin-content-
   write`), 학생 PIN 검증(`verify-student-pin`), 학부모 access_code
   검증(신규)
```

이 기준이 왜 존재하는지: **RLS는 "누가 이 행에 접근 가능한가"는
잘 표현하지만, "여러 단계로 이뤄진 절차(예: 없으면 생성, 있으면
기존 것 반환)"는 표현하기 어렵다** — 그래서 이 앱은 이미 커리큘럼
쓰기를 Edge Function으로 옮겼고(v3_11), 이 원칙을 다른 워크플로우에도
일관되게 적용한다.

---

## 1. Student Lifecycle

```
[가입]
Owner/Admin/Teacher가 학생 이름 입력
        │
        ▼
students INSERT ── anon key + RLS 직접
   (WITH CHECK academy_id = current_academy_id())
   ※ classes/units/words와 달리 단순 INSERT 하나뿐이라
     Edge Function 불필요 — 위 판단 기준의 실례
        │
        ▼
[academy 연결] ── 별도 단계 아님, 생성 시점에 이미 확정
   등록 주체(Owner/Admin/Teacher)의 academy_id를 그대로 상속
        │
        ▼
bulk-generate-temp-pins ── Edge Function(service_role) 경유
   (PIN 해시 저장은 자격증명 처리라 §공통원칙의 두 번째 케이스)
        │
        ▼
[class 배정]
students.class_id UPDATE ── anon key + RLS 직접
   (WITH CHECK academy_id 일치 — 다른 academy 반으로 배정 시도 시 거부)
   또는 student_class_assignments INSERT(다중 교재 모델, 0004 결정)
        │
        ▼
[학습 기록 생성]
학생 로그인(이름+PIN) → verify-student-pin ── Edge Function
   (service_role, scrypt 검증)
        │
        ▼
(향후) 익명 Auth 세션 발급 ── academy_id+student_id 클레임 부여
        │
        ▼
word_status/student_progress/student_daily_progress/xp_ledger 등
계속 기록 ── anon key(또는 익명세션) + RLS 직접
   (WITH CHECK student_id = current_student_id())
```

---

## 2. Teacher Workflow

```
[학생 관리]
로스터 조회 ── anon+RLS(SELECT, academy_id 조건, 담당 class 세분화 시
   class_id 조건 추가)
반 배정 변경 ── anon+RLS(UPDATE, academy_id+role IN (owner,admin,teacher))
        │
        ▼
[숙제 생성]
daily_assignments INSERT/UPDATE ── anon+RLS 직접
   (단순 CRUD, Edge Function 불필요 — §공통원칙 첫 번째 케이스)
        │
        ▼
[평가 기록]
spelling_review_queue 검토(accept/dismiss) ── anon+RLS(UPDATE,
   status/status_changed_at 컬럼만 — 기존 v3.9 설계 그대로 재사용)
        │
        ▼
정답 인정 시 words.accepted_meanings UPDATE
   ── Edge Function(admin-content-write, word.accepted_meanings.update)
   (기존에 이미 이 경로로 설계돼 있음 — 콘텐츠 테이블이라 §공통원칙의
   Edge Function 케이스)
```

---

## 3. Parent Workflow

```
[자녀 연결]
학생 등록 시 Owner/Admin이 parent_student_link 함께 생성
   ── Edge Function(service_role, 학생 등록과 같은 트랜잭션성 처리)
        │
        ▼
access_code를 오프라인 채널로 학부모에게 전달(기존 임시 PIN 전달
   관례와 동일, `CUSTOMER_OPERATION_PLAN.md`)
        │
        ▼
학부모가 access_code 입력 ── Edge Function(service_role, PIN 검증과
   동일한 서버 전용 원칙 — 자격증명 검증이므로 §공통원칙 두 번째 케이스)
        │
        ▼
[진행률 조회]
student_progress/student_daily_progress 등 SELECT ── anon+RLS 직접
   (parent_student_link 경유 조건, `RLS_POLICY_DESIGN.md` §6)
```

---

## 4. Academy Admin Workflow

```
[직원 관리]
academy_members INSERT(Teacher 초대) ── anon+RLS
   (WITH CHECK academy_id=current_academy_id() AND current_role()
   IN ('owner','admin'), 초대 대상 role은 'teacher'로 제한)
academy_members UPDATE/DELETE(Teacher 해제) ── 동일 조건
   ※ Owner·다른 Admin 대상은 이 경로 자체가 거부(`PERMISSION_
   MATRIX.md` Admin 정의 재확인)
        │
        ▼
[학생 관리]
students CRUD ── Owner와 동일 패턴(§1 참고)
        │
        ▼
[콘텐츠 관리]
classes/units/words 관리 ── Edge Function(admin-content-write)
   Owner와 동일 action 목록, 단 subscription/academies 관련 action은
   Admin에게 애초에 노출되지 않음(§공통원칙과 별개로 action별 role
   화이트리스트가 이중으로 작동)
```

---

## 5. Super Admin Workflow

```
[학원 생명주기]
academies INSERT(신규 학원 생성) ── Edge Function(전용 Platform API,
   service_role) — 학원 생성은 Owner 계정 발급까지 묶인 트랜잭션성
   처리라 §공통원칙의 Edge Function 케이스
academies UPDATE(플랜/상태 변경) ── 동일
academies "삭제"(오프보딩) ── 동일, 즉시 물리 삭제가 아니라 통제된
   절차(`SAAS_ARCHITECTURE_PLAN.md` §5.4)
        │
        ▼
[집계 조회]
전 학원 `ai_usage_daily`/`product_events`/매출 집계 SELECT ── 전용
   Platform Admin API(service_role) — anon+RLS 직접 노출 안 함(전
   학원 횡단 조회는 RLS로 표현하기보다 서버가 명시적으로 집계해
   반환하는 것이 안전, `PERMISSION_MATRIX.md` Super Admin "Edge
   Function 필수" 판정과 일치)
        │
        ▼
[지원 목적 임시 접근]
특정 학원 데이터 열람 ── Edge Function(service_role) + **모든 호출
   감사로그 자동 기록**(이 경로가 이 아키텍처 전체에서 가장 민감)
```

---

## 6. 데이터 이동 방향 Diagram

```
                    ┌─────────────────────────┐
                    │   Super Admin Console    │
                    │  (전용 라우트, Auth+2FA)  │
                    └────────────┬─────────────┘
                                 │ service_role 전용
                                 ▼
                    ┌─────────────────────────┐
                    │       academies          │  ← 유일한 전역 루트
                    └────────────┬─────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                         ▼
┌───────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ Academy Owner  │◄────►│  Academy Admin    │◄────►│     Teacher      │
│ (Auth, 계약주체)│      │ (Auth, 운영총괄)   │      │ (Auth, 수업담당)  │
└───────┬────────┘      └─────────┬─────────┘      └────────┬─────────┘
        │  anon+RLS 직접(단순) 또는 Edge Function(복잡)      │
        └────────────────────────┬────────────────────────┘
                                  ▼
                    ┌─────────────────────────┐
                    │  classes/units/words/    │
                    │  students/daily_          │
                    │  assignments/textbooks    │
                    └────────────┬─────────────┘
                                 │ 조회(읽기)만, RLS로 academy_id 스코프
                                 ▼
                    ┌─────────────────────────┐
                    │        Student            │
                    │ (PIN 모델, 향후 익명Auth)  │
                    └────────────┬─────────────┘
                                 │ 학습기록 append
                                 ▼
                    ┌─────────────────────────┐
                    │ student_progress/word_    │
                    │ status/xp_ledger/...      │
                    └────────────┬─────────────┘
                                 │ parent_student_link 경유 조회만
                                 ▼
                    ┌─────────────────────────┐
                    │         Parent             │
                    │  (access_code, 읽기전용)   │
                    └─────────────────────────┘
```

**방향성 요약**: 콘텐츠(classes/units/words)는 **위(Owner/Admin/
Teacher)에서 아래(Student)로만** 흐른다(학생은 읽기만). 학습 기록은
**아래(Student)에서 위로 관측만 허용**된다(Owner/Admin/Teacher는
조회, Parent는 그보다 더 좁게 조회) — **어느 화살표도 역방향 쓰기
권한을 갖지 않는다.**

---

## 7. RLS 적용 위치 표시

위 1~5의 모든 화살표를 "RLS 직접" vs "Edge Function 경유"로 재분류한
요약표 — 실제 구현 시 이 표가 그대로 작업 체크리스트가 된다.

| 흐름 | 처리 방식 | 근거 |
|---|---|---|
| 학생 등록(INSERT) | anon+RLS | 단순 INSERT |
| 학생 PIN 발급/검증 | Edge Function | 자격증명 |
| 학생 반 배정(UPDATE) | anon+RLS | 단순 UPDATE |
| 학생 학습기록 append | anon+RLS(또는 향후 익명세션+RLS) | 단순 INSERT, 본인 조건만 |
| 반/유닛/단어 콘텐츠 CRUD | Edge Function(`admin-content-write`) | delete-then-insert 등 복잡 로직 |
| 숙제 배정(daily_assignments) | anon+RLS | 단순 CRUD |
| 쓰기 답안 검토(accept/dismiss) | anon+RLS(컬럼 제한) | 단순 UPDATE, 컬럼도 제한적 |
| 정답 인정 반영(accepted_meanings) | Edge Function | 콘텐츠 테이블(words) 하위 |
| 학부모 연결 생성 | Edge Function | 학생 등록과 묶인 트랜잭션 |
| 학부모 access_code 검증 | Edge Function | 자격증명 |
| 학부모 진행률 조회 | anon+RLS | 조건부 SELECT만 |
| 직원 초대/해제 | anon+RLS | role 조건부 CRUD |
| 학원 생성/상태변경/오프보딩 | Edge Function(전용 Platform API) | 전역 루트, 트랜잭션성 |
| 전 학원 집계 조회 | Edge Function(전용 Platform API) | RLS로 표현하기보다 서버 집계 |
| AI 채점 파이프라인(캐시/통계 쓰기) | Edge Function(`grade-writing-answers`) | 기존 설계 그대로 |
| 결제 웹훅 | Edge Function(전용) | 서명 검증 포함 트랜잭션 |

**핵심 결론**: 27개+ 테이블에 걸친 모든 워크플로우가 결국 **딱 두
가지 경로**(anon+RLS 직접, 또는 Edge Function 경유)로 수렴한다 —
새 워크플로우가 추가될 때마다 이 문서 서두의 판단 기준 하나만 적용
하면 되고, 매번 새로운 아키텍처 패턴을 발명할 필요가 없다.

---

## 관련 문서

`PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md`, `PAUL_EASY_VOCA_RLS_
POLICY_DESIGN.md`, `PAUL_EASY_VOCA_PERMISSION_MATRIX.md`, `PAUL_
EASY_VOCA_SAAS_SECURITY_IMPLEMENTATION_CHECKLIST.md`,
`docs/agent-decisions/0006-multitenant-saas-architecture.md`(구
SAAS_ARCHITECTURE_PLAN.md는 2026-07-31 병합됨),
`docs/future-ideas/PAUL_EASY_VOCA_CUSTOMER_OPERATION_PLAN.md`
(§1~3 온보딩 프로세스 원본).
