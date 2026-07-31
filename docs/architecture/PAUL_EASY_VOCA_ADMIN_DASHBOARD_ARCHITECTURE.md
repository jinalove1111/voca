# PAUL_EASY_VOCA_ADMIN_DASHBOARD_ARCHITECTURE.md — 플랫폼 관리자 대시보드 설계

_작성: 2026-07-26. **순수 설계 문서 — 코드/SQL/Migration을 이 세션에서
전혀 작성·실행하지 않았다.** `docs/agent-decisions/0006-multitenant-
saas-architecture.md`(§9.1, 구 SAAS_ARCHITECTURE_PLAN.md는 2026-07-31
병합됨)/`PAUL_EASY_VOCA_BILLING_ARCHITECTURE_DESIGN.md`(§9)/`PAUL_EASY_
VOCA_PERMISSION_MATRIX.md`/`PAUL_EASY_VOCA_RLS_POLICY_DESIGN.md`
를 기반으로, **Super Admin(플랫폼 운영자)이 100개 학원을 매일 운영할
때 실제로 쓰는 화면 9종**을 구체화한다._

**전제**: `PAUL_EASY_VOCA_CUSTOMER_VALIDATION_PLAN.md`의 검증 조건이
충족된 뒤, 그리고 실제 학원 수가 이 대시보드가 필요할 만큼(§10)
늘어난 시점에 착수하는 것 — 지금 당장 구현 대상이 아니다.

## 공통 원칙 (전 화면 적용)

- **`AdminScreen.jsx`(학원 내부용)와 완전히 별도의 라우트/컴포넌트
  트리** — 탭 하나 추가하는 방식 금지(`docs/agent-decisions/0006-
  multitenant-saas-architecture.md` §9.1의 경고 재확인, 구
  SAAS_ARCHITECTURE_PLAN.md는 2026-07-31 병합됨).
- **Supabase Auth + 2FA**, 모든 접근이 감사로그에 기록(`RLS_POLICY_
  DESIGN.md` §8).
- **개별 학생 데이터를 일상적으로 노출하지 않는다** — 이 대시보드
  9개 화면 중 어디에도 "학생 이름 목록"이 기본 노출되지 않는다(§4·§5
  참고, `PERMISSION_MATRIX.md` Super Admin 정의).

---

## 1. Super Admin Dashboard 구조 (전체 개요/홈)

| 항목 | 내용 |
|---|---|
| **목적** | 로그인 직후 "지금 이 플랫폼이 괜찮은 상태인가"를 3초 안에 파악 |
| **주요 데이터** | 전체 학원 수·활성 학원 수, 오늘 신규 가입, 이번 달 MRR, 연체 학원 수, 미해결 보안 알림 수, 미해결 지원 티켓 수 — **§9(일일 KPI)의 요약판**을 홈에 배치 |
| **필요한 권한** | Super Admin 전용 |
| **자동화 가능 부분** | 전체 — 순수 집계 쿼리, 사람 개입 불필요. 단 임계값 초과 항목(예: 연체 학원 급증)은 시각적으로 강조 표시만 자동, 대응은 사람 |

---

## 2. Academy 관리 화면

| 항목 | 내용 |
|---|---|
| **목적** | 개별 학원 현황 파악 + 상세 화면 진입점 |
| **주요 데이터**(목록, 요청하신 항목 그대로) | 학원명, 사용자 수(`academy_members` 카운트), 학생 수, 선생님 수, 플랜(`BILLING_ARCHITECTURE_DESIGN.md` §1 티어), 사용량(AI/스토리지, `ai_usage_daily` 집계), 상태(`active`/`trial`/`past_due`/`cancelled`) + 가입일·마지막 활동일(정렬/필터용) |
| **상세 화면(드릴다운)** | 반/유닛 개수, 결제 이력 링크(§6), 지원 티켓 이력 링크(§8), 최근 감사로그 |
| **필요한 권한** | Super Admin(조회 전체), 수정은 통제된 절차(플랜 변경/정지/오프보딩)만 — `docs/agent-decisions/0006-multitenant-saas-architecture.md` §5.4 |
| **자동화 가능 부분** | 목록/집계는 완전 자동. 상태 배지(연체·휴면 학원 자동 하이라이트)도 자동. **학원 정지/오프보딩 실행 자체는 사람 확인 필수**(`CUSTOMER_OPERATION_PLAN.md` §6 원칙 재사용 — 파괴적 액션은 자동화하지 않음) |

---

## 3. User 관리 화면

| 항목 | 내용 |
|---|---|
| **목적** | Owner/Admin/Teacher 계정(성인 계정) 전체 관리 — **학생 계정은 이 화면 대상이 아님**(§4에서 별도, PII 최소 노출 원칙) |
| **주요 데이터** | 이메일(마스킹 고려), 소속 academy, role(owner/admin/teacher), 상태(active/invited/disabled), 마지막 로그인 |
| **필요한 권한** | Super Admin — 계정 강제 비활성화(퇴사자 즉시 세션 무효화, `PERMISSION_MATRIX.md`가 이미 지적한 위험 대응)까지 가능 |
| **자동화 가능 부분** | 90일+ 미접속 계정 자동 플래그(휴면 후보), 초대 후 7일+ 미수락 초대 자동 만료 — **계정 강제 비활성화 자체는 지원 요청이 확인된 뒤 사람이 실행** |

---

## 4. Student Analytics 화면

| 항목 | 내용 |
|---|---|
| **목적** | 플랫폼 전체 학생 활동 건강도 파악 — **개별 학생이 아니라 집계** |
| **주요 데이터** | 전체 활성 학생 수, 학원별 리텐션 비교(**익명화**, `product_events` 집계 — `LEARNING_ANALYTICS_PLAN.md` §5 Platform Admin Dashboard 재사용), 전체 완료율/이탈 추세 |
| **필요한 권한** | Super Admin — 이 화면은 **집계 결과만** 접근 가능하고 원본 개별 데이터로 드릴다운하는 경로가 없어야 함(설계 원칙) |
| **자동화 가능 부분** | 전체 자동(배치 집계 또는 실시간 뷰) |

---

## 5. Learning 데이터 분석

| 항목 | 내용 |
|---|---|
| **목적** | §4와 다른 관점 — **콘텐츠/AI 품질** 인사이트(학습 효과가 아니라 "무엇이 어려운지/AI가 잘 작동하는지") |
| **주요 데이터** | 전 플랫폼 단어 난이도 랭킹(`writing_answer_statistics` 집계, 특정 교재/단어가 구조적으로 어려운지 → 콘텐츠 개선 신호, `AI_LEARNING_ENGINE_PLAN.md` §10.1), AI 판정 분포(accept/review/reject_candidate 비율 추세 — 급변 시 프롬프트/모델 이슈 신호), 학습 방식 코호트 비교(`LEARNING_ANALYTICS_PLAN.md`의 AI 활용 3번 — **다학원 규모에서 비로소 통계적으로 의미 있어짐**, 지금은 참고용) |
| **필요한 권한** | Super Admin |
| **자동화 가능 부분** | 집계 대부분 자동(정기 배치). 코호트 비교 해석과 "이걸 교재 개선에 어떻게 반영할지"는 사람(구 `AI_AGENT_OS.md`의 Learning Science Agent 협업 개념 — 삭제됨, CLAUDE.md 헌법/DEVELOPER_GUIDE.md 워크플로우로 대체)의 몫 |

---

## 6. Billing 관리 화면

`BILLING_ARCHITECTURE_DESIGN.md` §9 Platform 레벨을 그대로 이 문서의
공식 화면으로 채택(중복 설계 없음):

| 항목 | 내용 |
|---|---|
| **목적** | 매출/결제 건강도 파악 |
| **주요 데이터** | 실시간 MRR, 연체(`past_due`) 학원 목록, 결제 실패율 추이, 플랜별 학원 분포, 이번 달 신규/이탈 학원 수 |
| **필요한 권한** | Super Admin |
| **자동화 가능 부분** | 집계 전부 자동. 연체 알림 **초안 자동 생성**(고객지원 Agent, `CUSTOMER_OPERATION_PLAN.md`), 발송은 사람 확인 후 |

---

## 7. Security Monitoring 화면

| 항목 | 내용 |
|---|---|
| **목적** | 침해 시도/이상 패턴 조기 탐지 — `RLS_POLICY_DESIGN.md` §9 사고 시나리오의 실시간 관측 창구 |
| **주요 데이터** | 인증 실패 시도 추이(브루트포스 탐지, 관리자 PIN/학생 PIN/Parent access_code 전부 포함), RLS 거부 로그 빈도(비정상적으로 높으면 공격 시도 신호), service_role 경유 지원용 임시 접근 로그(§8 원칙과 연동, Super Admin 본인의 활동도 여기 기록), 미배포 보안 패치 현황(예: `v3_11`류 항목이 아직도 열려 있는 학원이 있는지) |
| **필요한 권한** | Super Admin(+ Security Agent가 정기 분석) |
| **자동화 가능 부분** | 임계값 기반 자동 알림(예: 특정 계정에서 실패 시도 급증) — **실제 대응(계정 잠금/차단)은 사람이 확인 후 실행**(오탐 시 정상 사용자를 막을 위험 있으므로) |

---

## 8. Support 관리 화면

| 항목 | 내용 |
|---|---|
| **목적** | 학원 문의 처리 현황 관리 — `CUSTOMER_OPERATION_PLAN.md` §5 고객지원 Agent의 실제 작업대 |
| **주요 데이터** | 미해결 문의 목록, SLA 타이머(요금제별 응답시간, `BUSINESS_MODEL_PLAN.md` §2), 반복 문의 패턴(문서 Agent가 FAQ화 대상으로 식별한 것) |
| **필요한 권한** | Super Admin(또는 향후 전담 지원 인력이 생기면 그 역할로 위임 가능하도록 설계 — 지금은 Super Admin이 겸함) |
| **자동화 가능 부분** | 고객지원 Agent가 답변 초안 자동 생성, SLA 타이머 자동 계산·임박 알림 — **발송은 항상 사람 확인 후**(`CUSTOMER_OPERATION_PLAN.md` §5 원칙 재확인) |

---

## 9. 운영자가 매일 확인해야 하는 KPI

`REAL_ACADEMY_SIMULATION.md` §7("원장이 매일 확인해야 하는 것")의
**플랫폼 버전** — 9개 화면을 매번 다 열어보지 않아도 되도록 압축한
핵심 지표:

1. 어제 신규 가입 학원 수
2. 연체(`past_due`)/이탈 위험 학원 수(§2·§6)
3. 어제 결제 실패 건수(§6)
4. 보안 이상 징후 알림 수(§7)
5. SLA 임박한 미해결 지원 티켓 수(§8)
6. 시스템 오류/다운타임 여부(모니터링 알림)

**현실적 소요 시간**: `REAL_ACADEMY_SIMULATION.md`와 동일하게 정직히
표기 — 지금은 **실측된 적 없다.** 학원 수가 적을 때(파일럿~Phase 2)는
5~10분 내로 예상되지만, 100학원 규모에서 실제로 얼마나 걸리는지는
Phase 3~4에서 직접 재봐야 한다.

---

## 10. 6개월 후 확장 가능한 Admin Architecture

`docs/agent-decisions/0006-multitenant-saas-architecture.md` §8(구
SAAS_ARCHITECTURE_PLAN.md §10)의 페이싱과 맞물린 이 대시보드의
단계별 필요 수준:

| 시기 | 필요 수준 |
|---|---|
| 지금~파일럿(`CUSTOMER_VALIDATION_PLAN.md`) | **불필요** — 학원 2~5곳은 스프레드시트/직접 DB 조회로 충분 |
| Phase 2(첫 외부 학원, `MVP_ROADMAP.md`) | §2(Academy 관리)만 최소 버전으로 착수 — 나머지는 아직 |
| Phase 3(20학원) | §2·§3·§6(User/Billing) 본격 구축 — 수동 관리가 한계에 도달하는 시점 |
| Phase 4(100학원) | §1·§4·§5·§7·§8 전부 완성 — 9개 화면 풀 구성 |
| 6개월 이후(옵션) | §5(Learning 데이터 분석)의 코호트 비교가 실제로 통계적 의미를 갖기 시작(다학원 데이터 누적), §8을 전담 지원 인력에게 위임하는 구조로 전환 검토 |

**정직한 전제**: `CUSTOMER_VALIDATION_PLAN.md`가 이미 여러 차례
강조했듯, 이 9개 화면을 전부 미리 만드는 것이 목표가 아니다 — 각
Phase에서 **실제로 수동 관리가 한계에 부딪히는 순간에만** 그 화면을
만든다.

---

## 관련 문서

`docs/agent-decisions/0006-multitenant-saas-architecture.md`(§9.1 원본,
구 SAAS_ARCHITECTURE_PLAN.md는 2026-07-31 병합됨), `PAUL_EASY_
VOCA_BILLING_ARCHITECTURE_DESIGN.md`(§9), `PAUL_EASY_VOCA_
PERMISSION_MATRIX.md`, `PAUL_EASY_VOCA_RLS_POLICY_DESIGN.md`,
`docs/future-ideas/PAUL_EASY_VOCA_LEARNING_ANALYTICS_PLAN.md`(§5),
`docs/future-ideas/PAUL_EASY_VOCA_CUSTOMER_OPERATION_PLAN.md`(§5~6
고객지원 Agent 원본), `docs/future-ideas/PAUL_EASY_VOCA_REAL_
ACADEMY_SIMULATION.md`(§7 일일 확인 목록 원형), `docs/future-ideas/
PAUL_EASY_VOCA_CUSTOMER_VALIDATION_PLAN.md`(착수 전제조건).
