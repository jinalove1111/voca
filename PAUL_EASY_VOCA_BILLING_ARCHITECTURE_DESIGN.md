# PAUL_EASY_VOCA_BILLING_ARCHITECTURE_DESIGN.md — 결제 아키텍처 설계

_작성: 2026-07-26. **순수 설계 문서 — 코드/SQL/Migration을 이 세션에서
전혀 작성·실행하지 않았다.** `docs/agent-decisions/0006-multitenant-
saas-architecture.md`(§7 결제 구조 원본, 구 SAAS_ARCHITECTURE_PLAN.md는
2026-07-31 이 문서로 병합됨)/`TABLE_OWNERSHIP_MATRIX.md`/`PERMISSION_
MATRIX.md`/`RLS_POLICY_DESIGN.md`를 기반으로, 결제 도메인만 상세화한다.
가격 벤치마크는 `PAUL_EASY_VOCA_BUSINESS_MODEL_PLAN.md`가 WebSearch로
실측한 원아워(학생당 월 5,000원) 기준선을 그대로 재사용한다._

**전제**: `PAUL_EASY_VOCA_CUSTOMER_VALIDATION_PLAN.md`가 이미 명시한
것과 동일 — 이 아키텍처는 **검증(§7 조건 충족) 이후 실제 착수**하는
것이지, 지금 당장 구현하라는 지시가 아니다.

---

## 1. SaaS 가격 모델 설계

요청하신 3-티어(Starter/Professional/Enterprise)로 정리한다 —
`BUSINESS_MODEL_PLAN.md`의 4-티어(Starter/Professional/Premium/
Enterprise)에서 **Premium을 Enterprise로 통합**했다(결제 시스템
관점에서는 티어가 적을수록 `plans` 테이블 관리가 단순해지고, 대형
학원의 요구는 대부분 "협의 가능"이라는 공통점을 가지므로 하나로
묶는 것이 합리적).

| 플랜 | 가격 | 학생 수 제한 | 선생님 수 제한 | 기능 제한 |
|---|---|---|---|---|
| **Starter** | 학생당 월 5,000원(50명 예시: 250,000원) | ≤ 50명 | **≤ 1명**(원장 본인만 — 공부방 특성상 다중 교사 불필요) | 핵심 학습루프 + 기본 게임화(Paul Rank/House/Ticket) + 학부모 리포트, AI 사용량 기본(일 $2 상당) |
| **Professional** | 학생당 월 4,500원(150명 예시: 675,000원) | ≤ 150명 | **≤ 3명**(원장+교사 2인) | Starter 전체 + 다중 교사(Teacher 역할) + 다중 교재 + 입실시험 + Word King/Season, AI 사용량 확대(일 $5~10 상당) |
| **Enterprise** | 협의(볼륨+격리 반영) | 협의(500명+) | 협의(무제한) | Professional 전체 + Reading Foundation + 물리적 격리 옵션(`SAAS_ARCHITECTURE_PLAN.md` §5.2) + SLA + 커스텀 브랜딩 + 전담 지원 |

**선생님 수 제한을 두는 이유**: `academy_members`(Owner/Admin/
Teacher) 계정 하나하나가 Supabase Auth 세션을 소비하고 관리 대상이
늘어나므로, 학생 수뿐 아니라 **좌석(seat) 수** 개념도 요금제 구분
축으로 둔다 — 흔한 SaaS 과금 패턴(사용자 좌석 기반)을 이 앱의 학생
수 기반 과금과 **결합**한 하이브리드 모델.

---

## 2. Academy Subscription 구조

### 개념 테이블 관계 (SQL 아님)

```
academies (1) ────────── (1) subscriptions ────────── (N:1) plans
                                │
                                │ (1:N)
                                ▼
                            invoices ────────── (1:N) payment_attempts
```

| 테이블(개념) | 핵심 컬럼 | 역할 |
|---|---|---|
| `academies` | id, name, ... | 테넌트 루트(기존 `SAAS_ARCHITECTURE_PLAN.md` §3) |
| `plans` | id, name, student_limit, teacher_limit, ai_daily_budget_usd, feature_flags(jsonb), price_per_student_krw | 요금제 정의 — **데이터로 관리**해 요금제 변경이 배포 없이 가능(§1 표가 이 테이블의 초기 시드 데이터) |
| `subscriptions` | id, academy_id→academies, plan_id→plans, status('trial'\|'active'\|'past_due'\|'cancelled'), trial_ends_at, current_period_start/end, next_billing_date | **academy 1개당 정확히 1개**(동시에 여러 구독 보유 안 함) |
| `invoices` | id, subscription_id→subscriptions, amount, status('pending'\|'paid'\|'failed'\|'refunded'), period_start/end, issued_at, paid_at | 매 결제 주기(월)마다 1건 생성 — 실제 청구서 단위 |
| `payment_attempts` | id, invoice_id→invoices, provider_ref, status('success'\|'failed'), attempted_at, failure_reason | 결제 재시도 이력(§5 Dunning 프로세스의 데이터 원천) |

### 관계 설명

- **academy ↔ subscription = 1:1**: 학원이 플랜을 여러 개 동시에
  가질 이유가 없다 — 플랜 변경은 새 구독을 만드는 게 아니라 기존
  `subscriptions.plan_id`를 UPDATE하는 것(업그레이드/다운그레이드
  이력은 `invoices`에 자연히 남음).
- **subscription ↔ plan = N:1**: `plans`는 마스터 데이터, 여러
  academy의 subscription이 같은 plan을 참조.
- **subscription ↔ invoice = 1:N**: 구독이 살아있는 동안 매달 하나씩
  누적(append-only, 이 저장소의 기존 원장 패턴(`xp_ledger` 등)과
  같은 정신 — 청구 이력을 지우거나 덮어쓰지 않는다).
- **invoice ↔ payment_attempt = 1:N**: 한 인보이스에 대해 결제가
  실패하면 재시도 이력이 쌓인다 — 이 이력 자체가 §5 Dunning 판단의
  근거.

---

## 3. 학생 수 기반 과금 모델 분석

| 학생 수 | 해당 플랜 | 월 매출(예시) | 참고 |
|---|---|---|---|
| **30명** | Starter | 30 × 5,000 = **150,000원** | 교사 1명 제한 내(원장 1인 운영 전형) |
| **100명** | Professional | 100 × 4,500 = **450,000원** | 교사 3명 이내여야 이 플랜 유지 — 초과 시 업셀 신호 |
| **500명** | Enterprise(협의) | 참고 계산: 500 × 4,000(가정) = **2,000,000원** | **실제로는 정찰제가 아니라 협의** — 이 규모는 다지점/프랜차이즈일 가능성이 높아 물리적 격리 등 추가 비용 요인이 섞임 |

**교사 수 초과 시 처리**: Professional 학원이 교사를 4명째 추가하려
하면 — (a) 자동으로 Enterprise 협의 안내를 띄우거나, (b) 초과 좌석당
추가 요금(예: 좌석당 월 3만원)을 허용하는 두 가지 방향이 있다. **지금
단계에서는 결정하지 않는다** — 실제 파일럿(`CUSTOMER_VALIDATION_
PLAN.md`)에서 Professional 학원이 실제로 이 한도에 부딪히는지부터
관찰.

`BUSINESS_MODEL_PLAN.md` §4의 결론을 재확인: 이 매출 규모에서 AI
비용은 1~2% 수준에 불과하므로, 이 표의 진짜 관심사는 매출 자체보다
**§9의 결제 관리 화면이 정상 작동해서 이 매출을 놓치지 않는 것**이다.

---

## 4. 무료 체험 구조

| 항목 | 설계 |
|---|---|
| 기간 | **30일**(14일이 SaaS 업계 흔한 기본값이지만, 학원은 월 단위로 계획·결제하는 업종 특성상 14일은 충분한 사용 데이터가 안 쌓임 — 한 달 주기를 온전히 경험하게 함) |
| 카드 등록 | **불필요**(`BUSINESS_MODEL_PLAN.md` §2 Free 티어 원칙 재사용 — 진입 장벽 최소화) |
| 제한 | 학생 수 ≤ 20명, AI 사용량 소량 또는 미사용, 게임화/다중교재/입실시험 OFF |
| 종료 시 자동 동작 | `trial_ends_at` 도래 + 카드 미등록 → **학생 학습 화면은 계속 정상 동작**, 관리자 쓰기(신규 반/단어 생성 등)만 제한(§5의 `past_due` 처리와 동일 원칙 — "수업 중단"이 가장 큰 피해이므로 항상 마지막에 막음) |
| 전환 | 체험 중 언제든 카드 등록 시 즉시 유료 플랜(Starter부터) 전환, `subscriptions.status: trial → active` |

---

## 5. 결제 실패 처리 (Dunning)

```
① 정기 결제일 도래 → 자동 결제 시도(PG 웹훅 결과 대기)
        │
        ├─ 성공 → invoice.status='paid', 정상 유지
        │
        └─ 실패 → payment_attempts에 실패 기록
                        │
                        ▼
② 유예 기간(3일) — subscription.status는 아직 'active' 유지,
   재시도 자동화(카드 일시 한도 초과 등 흔한 원인 커버)
        │
        ├─ 재시도 성공 → 정상 복귀
        │
        └─ 재시도도 실패 → subscription.status='past_due'
                        │
                        ▼
③ past_due 상태(최대 14일)
   ── 학생 학습 화면: 정상(수업 지속)
   ── 관리자 쓰기: 제한(신규 콘텐츠/숙제 생성 등)
   ── 고객지원 Agent가 결제수단 갱신 안내 초안 생성
      (`CUSTOMER_OPERATION_PLAN.md` §5, 발송은 운영자 확인 후)
        │
        ├─ 결제수단 갱신 + 재결제 성공 → 즉시 'active' 복귀
        │
        └─ 14일 경과해도 미해결 → §7(오프보딩) 절차 착수 안내
```

**핵심 설계 판단**: 학생 화면은 어떤 단계에서도(§4~7 전부) **가장
마지막에만** 영향받는다 — 결제 실패는 학원(성인)의 문제이지 학생이
그 즉시 피해를 보게 만들지 않는다.

---

## 6. 환불 정책 구조

- **첫 결제 후 7일 이내**: 단순 변심 포함 **100% 환불**(무료체험
  이후 첫 유료 결제에 대한 신뢰 장치).
- **그 외 일반적인 경우**: 원칙적으로 **노리펀드**(월 구독형 SaaS의
  일반적 관행) — 단, **서비스 장애로 인한 경우**(예: 특정 학원에
  영향을 준 다운타임)는 영향받은 기간만큼 **일할 계산 환불** 또는
  다음 달 청구액 차감.
- **환불 처리 경로**: 카드 정보 자체가 이 시스템에 없으므로(§`SAAS_
  ARCHITECTURE_PLAN.md` §7.4 원칙), 실제 환불은 **PG사 API를 경유**
  하고 우리 시스템은 `invoices.status='refunded'`만 기록.
- **구체 금액/일수는 사업 결정 영역** — 이 문서는 구조(언제/어떻게)만
  제안, 최종 정책은 파일럿 학원과의 실제 계약 논의에서 확정.

---

## 7. 학원 탈퇴 시 데이터 처리

```
① 구독 취소 요청(Owner만 가능, §8)
        │
        ▼
② 현재 결제 주기 종료까지 서비스 유지(이미 낸 금액만큼은 계속 이용)
        │
        ▼
③ 주기 종료 시 subscription.status='cancelled'
        │
        ▼
④ 유예 보관 기간(90일) — 데이터 즉시 삭제 안 함
   (재가입 대비 + 법적 분쟁 대비, `SAAS TOP10` 8번 "테넌트
   오프보딩 절차"와 동일 원칙)
        │
        ├─ 유예 기간 중 재가입 → 그대로 복원
        │
        └─ 유예 기간 종료 → `academy_id` 필터 기준 물리 삭제
             (`TABLE_OWNERSHIP_MATRIX.md`의 격리 검증 기준 —
             "academy_id 필터 하나로 완전 분리"가 삭제에도 그대로
             적용됨)
        │
        ▼
⑤ 물리 삭제 전 원장에게 **데이터 export 옵션** 제공(학생 진행
   기록·성장 이력 등 — 학원 입장에서 가치 있는 자산)
```

---

## 8. 결제 관련 권한 구조

`ROLE_PERMISSION_MATRIX.md`/`PAUL_EASY_VOCA_PERMISSION_MATRIX.md`를
그대로 재확인 — 새로 정의하지 않는다:

| 역할 | 결제 관련 권한 |
|---|---|
| Super Admin | 전 학원 결제상태 조회 + 플랫폼 차원 강제조치(장기 연체 계정 정지) |
| **Academy Owner** | **전권**(플랜 변경, 결제수단 등록, 환불 요청, 구독 취소) |
| Academy Admin | **조회만**(현재 플랜, 인보이스 이력, 사용량 대비 상한 — 운영 예산 파악 목적, 수정 불가) |
| Teacher / Student / Parent | **접근 없음** |

---

## 9. Admin Dashboard에서 필요한 결제 관리 화면

### Academy 레벨(Owner 전용, Admin은 조회만)

- 현재 플랜 + 다음 결제일
- 이번 결제 주기 사용량(학생 수/AI 사용량) 대비 요금제 상한 — 초과
  임박 시 업셀 배너
- 결제수단 관리(등록/변경 — PG 호스팅 페이지로 위임)
- 인보이스 이력(다운로드 가능해야 회계 처리에 도움)
- 플랜 변경/구독 취소 버튼

### Platform 레벨(Super Admin 전용, `SAAS_ARCHITECTURE_PLAN.md` §9.1 확장)

- 전 학원 MRR 실시간 집계
- 연체(`past_due`) 학원 목록(대응 우선순위)
- 결제 실패율 추이(시스템 문제인지 개별 학원 문제인지 구분하는 신호)
- 플랜별 학원 분포(Starter/Professional/Enterprise 비율)
- 이번 달 신규/이탈 학원 수(간이 MRR 증감 분해)

---

## 10. 6개월 후 확장 가능한 Billing Architecture

`docs/agent-decisions/0006-multitenant-saas-architecture.md` §8(구
SAAS_ARCHITECTURE_PLAN.md §10)의 페이싱과 맞물린 결제 도메인 전용
진화 경로:

| 단계 | 상태 |
|---|---|
| 지금~파일럿(`CUSTOMER_VALIDATION_PLAN.md`) | **수동**(계좌이체/수기 인보이스) — `plans`/`subscriptions` 테이블조차 아직 없어도 됨, `academies.plan`/`billing_status` 컬럼 몇 개로 충분 |
| Phase 3(20학원, `MVP_ROADMAP.md`) | 이 문서의 §2 전체 테이블 실제 도입 + PG 자동 연동(웹훅 Edge Function) |
| Phase 4(100학원) | Dunning 자동화(§5) 완성, Platform 레벨 결제 대시보드(§9) 완성 |
| 6개월 이후(옵션) | 사용량 기반 종량제 옵션 추가(예: Enterprise의 AI 고급 모델 사용량 초과분 별도 과금 — `AI_LEARNING_ENGINE_PLAN.md` §8 모델 라우팅과 연동), 다지점 프랜차이즈의 **통합 청구**(여러 academy를 한 인보이스로 묶는 상위 개념, 지금 스키마엔 없음 — 실제 프랜차이즈 고객이 생겼을 때 `billing_group` 같은 개념 추가 검토) |

**정직한 전제**: 이 모든 것은 `CUSTOMER_VALIDATION_PLAN.md` §7의
검증 조건이 충족된 뒤에 순서대로 착수하는 것이지, 지금 전부 만드는
것이 아니다.

---

## 관련 문서

`docs/agent-decisions/0006-multitenant-saas-architecture.md`(§7 결제
구조 원본, 구 SAAS_ARCHITECTURE_PLAN.md는 2026-07-31 병합됨),
`PAUL_EASY_VOCA_BUSINESS_MODEL_PLAN.md`(가격 벤치마크),
`PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md`, `PAUL_EASY_VOCA_RLS_
POLICY_DESIGN.md`, `PAUL_EASY_VOCA_PERMISSION_MATRIX.md`,
`PAUL_EASY_VOCA_CUSTOMER_
VALIDATION_PLAN.md`(착수 전제조건).
