# PAUL_EASY_VOCA_FIRST_90_DAYS_EXECUTION.md — 복귀 후 90일 실행 순서

_작성: 2026-07-26. **순수 실행 계획 문서 — 코드/SQL을 이 세션에서
전혀 작성·실행하지 않았다.** `PAUL_EASY_VOCA_EXECUTION_PRIORITY_
PLAN.md`(P0/P1/P2 + 30/60/90일 개요), `docs/audit/2026-07-26-v3_11-
1hour-runbook.md`(Day 1 상세 절차), `PAUL_EASY_VOCA_REAL_ACADEMY_
SIMULATION.md`(Day 8~30 실관찰 대상), `PAUL_EASY_VOCA_SAAS_
ARCHITECTURE_PLAN.md`(Day 31~60 스키마), `PAUL_EASY_VOCA_CUSTOMER_
OPERATION_PLAN.md`(Day 61~90 온보딩)를 일 단위로 더 세분화한
실행판이다._

---

## Day 1~7 — 긴급 보안 수정 + 테스트

| 작업 | 목적 | 필요한 이유 | 완료 기준 | 실패 위험 |
|---|---|---|---|---|
| **Day 1: v3_11 보안수정 배포**(`v3_11-1hour-runbook.md` 그대로) | 커리큘럼 무인증 쓰기 취약점 완전 차단 | 라이브에 열려 있는 유일한 Critical 보안 이슈 | 런북 6단계(실행 직후 관리자 CRUD 정상 + anon 쓰기 시도 거부 둘 다 실측 확인) | 5단계 이전(시크릿/Edge Function/Vercel 배포/관리자 배선) 중 하나라도 미완료 상태로 SQL 실행 시 관리자 CRUD 전체 마비 — 런북의 롤백 절차(`disable row level security` 3줄)로 즉시 원복 가능 |
| **Day 1: GitHub Pages 완전 차단** | 그림자 배포 재발 가능성 제거 | 이미 원인 규명된 리스크, 5분이면 끝남 | Settings→Pages→Source=None 확인 | 낮음 |
| **Day 2~3: 쓰기 AI 보조 실운영화**(Edge Function 배포+SQL 2건+flag ON) | 완성된 자산이 실제 가치를 내기 시작 | 코드 완료 후 몇 주째 방치 중 | flag ON 후 관리자 화면에서 AI 미리보기 실동작 확인 + `npm run verify:writing` PASS | 시크릿(`ANTHROPIC_API_KEY` 등) 누락 시 조용히 실패할 수 있음(에러 메시지가 명확한지 반드시 실측) |
| **Day 3~4: 게임화 SQL 일괄 실행**(v2.5~v2.8) | Paul Rank/House/Ticket/Word King/Season이 학생 화면에 실제로 노출 | 코드는 이미 배포됨, SQL만 밀려있음 | 반별로 하나씩 켜서 정상 노출 확인 | 낮음(전부 opt-in 기본 false) |
| **Day 5: 관리자 PIN 형식/강도 검증** | 최소 보안 위생 | 학생 PIN엔 이미 있는 검증이 관리자 PIN엔 없음 | 약한 PIN 입력 시 경고/거부 동작 확인 | 낮음 |
| **Day 6~7: 전체 회귀 테스트**(`npm run verify:all`) | 이번 주 변경이 기존 기능을 깨뜨리지 않았는지 최종 확인 | Day 1~5의 5개 변경이 누적된 상태를 한 번에 검증해야 함 | SKIP 도메인(speaking/listening) 제외 전 도메인 PASS, FAIL 발견 시 원인 규명까지 이번 주 안에 완료 | 회귀 발견 시 어느 변경이 원인인지 특정하는 데 시간 소요 — 하루 단위로 나눠 배포했으므로 git 이력으로 특정 자체는 어렵지 않음 |

---

## Day 8~30 — 내부 학원 안정화

**목표**: 새 기능을 만들지 않는다. 지금 있는 것이 진짜 안정적인지
**실제로 관찰**한다.

| 작업 | 목적 | 필요한 이유 | 완료 기준 | 실패 위험 |
|---|---|---|---|---|
| `REAL_ACADEMY_SIMULATION.md`의 시나리오(§1~6) **실관찰**(1~2주) | 시뮬레이션이 실제와 맞는지 검증, 새 문제 발견 | 문서는 코드 근거의 추론이지 실측이 아님 — 실제 운영에서만 드러나는 문제가 있을 수 있음 | 관찰 기간 중 발견된 문제를 목록화(문서 아님, 원장의 실사용 메모 수준으로 충분) | 관찰을 건너뛰고 바로 다음 단계로 가면 SaaS 판매 후에야 문제를 발견하게 됨(비용이 훨씬 커짐) |
| `academy_id` 스키마 **설계 확정**(SQL 파일 작성은 아직 실행 안 함, 개발 단계에서 진행) | 다음 30일(§Day 31~60)의 실제 구현 전제조건 마련 | 설계는 이미 `SAAS_ARCHITECTURE_PLAN.md` §4에서 끝남 — 이 기간엔 그 설계를 실제 컬럼/제약으로 정밀화 | 6개 anchor 테이블(`classes`/`students`/`textbooks`/`seasons`/`ai_usage_daily`/`product_events`)의 정확한 컬럼 스펙 확정 | 설계를 건너뛰고 바로 SQL부터 짜면 되돌리기 어려운 실수(예: GRANT 누락) 가능성 상승 |
| **Vercel 유료 플랜 전환** | Hobby ToS 리스크 완전 제거 | 외부 학원을 받는 순간(§Day 61~90) 이미 늦음 — 미리 전환 | 결제 완료 + Pro 플랜 정상 적용 확인 | 낮음 |
| 무필터 전체조회 **스코핑 설계**(구현은 §Day31~60) | 다학원 확장 시 확정적으로 터질 성능 병목 선제 대응 | `academy_id` 작업과 같은 파일들을 건드리므로 이 시기에 함께 설계 | 영향받는 15+ 호출부 목록화 + 스코핑 방식 확정 | 설계 없이 급하게 고치면 기존 폴백 로직(컬럼 부재 시 안전 동작)을 깨뜨릴 위험 |
| Memory Engine SRS 스키마(`word_review_schedule`) 설계 확정 | `MASTER_PLAN.md`가 이미 "최고 ROI" 판정한 항목의 구현 준비 | 다학원 여부와 무관하게 독립적 가치 | 컬럼 스펙 확정(box_level/next_review_date 등) | 낮음(신규 테이블, 기존 로직 영향 없음) |
| 학부모 문의 응대 스크립트 준비(`REAL_ACADEMY_SIMULATION.md` §2) | 발음 채점 등 설계상 이유를 정직하게 설명할 문구 | 외부 고객에게도 같은 질문이 반드시 나옴 | 3가지 시나리오(캘린더 기록/발음 만점/학부모 화면 접근)에 대한 응대 문구 확정 | 준비 없이 외부 고객을 받으면 신뢰 문제로 번질 수 있음 |

---

## Day 31~60 — SaaS 준비

**목표**: 실제로 여러 학원을 받을 수 있는 인프라를 만든다.

| 작업 | 목적 | 필요한 이유 | 완료 기준 | 실패 위험 |
|---|---|---|---|---|
| `academy_id` 마이그레이션 **실제 작성 및 실행**(멱등 SQL, 기존 학원 academy #1 백필) | 다학원 전제조건 완성 | Day 8~30의 설계를 실제 스키마로 전환 | 6개 테이블 컬럼 추가 완료 + 기존 111명 학생 전원이 여전히 정상 동작 확인(회귀 없음) | **이 90일 계획에서 가장 위험도 높은 단일 작업** — 기존 학원 데이터에 영향 줄 수 있는 유일한 변경, 반드시 스테이징/QA Agent 사전 검증 후 실행 |
| RLS 정책 적용(`SAAS_ARCHITECTURE_PLAN.md` §4 패턴) | 학원 간 데이터 격리의 DB 레벨 최종 방어선 | RLS 없이는 academy_id 컬럼만으로 진짜 격리가 안 됨 | anon key로 다른 academy_id 데이터 접근 시도 시 거부 확인(v3_11 검증과 동일한 실측 방식) | 정책 설계 오류 시 조회 자체가 막히는 회귀 가능(SELECT 정책 빠뜨림 등) |
| 무필터 전체조회 스코핑 **구현** | 성능 병목 실제 해소 | Day 8~30에서 설계 끝남 | 15+ 호출부 전부 `class_id`/`academy_id` 스코핑 적용 + 기존 verify 도메인 회귀 없음 | 광범위한 코드 변경 — 파일/기능 단위 소커밋 원칙 엄수 필요 |
| Memory Engine SRS **최소 구현**(6-box Leitner + Garden 연동) | 학습 효과 자체의 핵심 개선 | `MASTER_PLAN.md` §1 최고 ROI 판정 | 박스 승급/강등 로직 순수 함수 테스트 PASS + Garden 시각화 연동 확인 | 낮음(신규 로직, 기존 학습 루프 비침습) |
| AI 배치 채점 N+1 수정 | 성능/비용 개선 | 기존 감사에서 유일하게 남은 실질 최적화 | batch select/upsert 전환 후 기존 채점 결과 동일성 확인 | fire-and-forget 경로라 회귀 위험 낮음 |
| 학원별 관리자 인증 전환 **설계 확정**(전역 `ADMIN_PIN` 폐지 준비) | Day 61~90 파일럿에서 실제 필요해짐 | 5곳만 돼도 전역 PIN 공유는 치명적(`MVP_ROADMAP.md` Phase 2) | `academy_members` 스펙 확정, Supabase Auth 전환 계획 확정(구현은 이 기간 내 착수, 완료는 유동적) | 인증 모델 변경이라 신중한 단계적 전환 필요 |
| CUSTOMER_OPERATION_PLAN §1~2 온보딩 플로우 **구현 착수**(셀프서비스 가입폼 등) | Day 61~90 파일럿 온보딩의 실제 도구 | 수동으로도 되지만(Phase 2는 수동 승인 허용) 최소한의 폼은 필요 | 가입폼→academy 레코드 생성까지 e2e 동작 확인 | 낮음(신규 화면, 기존 흐름 비침습) |

---

## Day 61~90 — 첫 외부 학원 테스트

**목표**: `MVP_ROADMAP.md` Phase 2 실제 착수 — 이론이 아니라 진짜
외부 학원으로 검증.

| 작업 | 목적 | 필요한 이유 | 완료 기준 | 실패 위험 |
|---|---|---|---|---|
| **파일럿 학원 1~3곳 실제 접촉/계약** | 실제 데이터로 전체 설계 검증 | 지금까지 전부 111명 단일 학원 기준 시뮬레이션이었음 — 실증 필요 | 최소 1곳 이상 실제 온보딩 완료 | 파일럿 학원이 예상 못한 사용 패턴을 보일 가능성(예: 훨씬 큰 학생 수, 다른 커리큘럼 구조) — 처음부터 완벽을 기대하지 않고 관찰·수정 반복 |
| CUSTOMER_OPERATION_PLAN §1~2 프로세스 **실전 사용** | 설계가 실제로 작동하는지 검증 | 문서로만 존재하던 절차의 첫 실사용 | 파일럿 학원이 실제로 가입→세팅→학생 등록까지 마침 | 온보딩 병목 발견 가능(§3 학생 CSV 일괄등록 갭이 여기서 실제로 드러날 수 있음) |
| **데이터 격리 실측 검증**(파일럿 학원 데이터가 기존 학원과 완전 분리되는지) | 이 90일 전체의 가장 중요한 검증 목표 | 격리가 안 되면 전체 사업 모델이 성립 안 함 | `academy_id` 필터 하나로 export 시 정확히 그 학원 데이터만 나오는지 실측 | 실패 시 즉시 신규 학원 확대 중단, 원인 해소까지 파일럿 규모 유지 |
| 고객지원 Agent/교육 Agent **초기 버전 가동** | 응대 자동화의 첫 실전 테스트 | 100곳으로 갈 때 자동화가 필수라는 것이 이미 결론(`BUSINESS_MODEL_PLAN.md` §4.3) — 지금부터 검증 시작 | 파일럿 학원 문의에 실제로 초안 생성이 도움이 되는지 확인(발송은 여전히 사람 확인 후) | 아직 이르면 사람이 전량 직접 대응해도 무방 — 강제하지 않음 |
| **90일 종료 시점 평가** | `MVP_ROADMAP.md` Phase 1→Phase 2 전환 완료 판정 | 다음 분기 계획의 기준점 | 위 모든 항목의 완료 기준 대조 + 파일럿 학원 실사용 1주 이상 무사고 | 평가 자체를 생략하고 계속 확대하면 §Day31~60의 리스크가 누적된 채 규모만 커짐 |

---

## 역할 분리 — 대표 / AI Agent / 개발자

### "대표가 직접 해야 하는 일" (사람만 할 수 있는 것)

- **Supabase SQL Editor에서 직접 SQL 실행**(v3_11, `academy_id`
  마이그레이션 등) — CLAUDE.md 규칙 8, 어떤 Agent/개발자도 대신할
  수 없음
- Vercel/Supabase 유료 플랜 결제, 시크릿(API 키 등) 설정
- GitHub Pages Settings 변경
- 유료 API 활성화 최종 승인(`AI_DEVELOPMENT_PROTOCOL.md` §8 규칙 7)
- **파일럿 학원과의 실제 대화·계약**(Day 61~90) — Agent가 초안은
  만들되 최종 소통은 대표
- PIN 잠금 해제 등 **본인 확인이 필요한 액션**(전화/구두 확인 후 처리)
- 반/학생 삭제 등 파괴적 액션의 최종 확인
- 요금제·가격 최종 확정(`BUSINESS_MODEL_PLAN.md`의 제안치는 참고,
  결정은 대표)
- 미션 이탈 가능성이 있는 결정(신규 과목 확장 등)의 최종 판단

### "AI Agent에게 맡길 일" (분석·초안·검증 — `AI_AGENT_OS.md`/
`CUSTOMER_OPERATION_PLAN.md` 역할 재사용)

- **CTO Agent(조사 모드)**: "이미 완료된 것 아닌가?" 재확인, 이 90일
  계획 자체가 이미 그 산출물
- **QA Agent**: 매 배포 전 build/verify 독립 재실행(Day 1~90 전체
  관통)
- **Security Agent**: RLS/인증 변경 리뷰(Day 1의 v3_11, Day 31~60의
  RLS 적용 시 필수)
- **고객지원 Agent**: 문의 응답 초안(Day 61~90부터, 발송은 대표 확인)
- **교육 Agent**: 파일럿 학원 온보딩 콘텐츠 개인화(Day 61~90)
- **문서 Agent**: 응대 스크립트(Day 8~30) 초안, 각 단계 완료 시
  `handoff.md` 기록

### "개발자가 해야 하는 일" (실제 코딩 — Developer/Database Agent +
사람 감독, `AI_DEVELOPMENT_PROTOCOL.md` §4 규칙 그대로)

- Day 1~7의 각 항목 코드 배포(대부분 이미 완성된 코드의 배포 작업)
- Day 8~30: `academy_id`/SRS 스키마 SQL 파일 **작성**(실행은 대표)
- Day 31~60: 마이그레이션 코드 실제 반영, RLS 정책 코드, 무필터
  조회 스코핑, SRS 로직 구현, N+1 수정
- Day 61~90: 셀프서비스 가입폼, 데이터 격리 검증 스크립트

---

## 관련 문서

`PAUL_EASY_VOCA_EXECUTION_PRIORITY_PLAN.md`(30/60/90일 개요 원본),
`docs/audit/2026-07-26-v3_11-1hour-runbook.md`(Day 1 상세),
`PAUL_EASY_VOCA_REAL_ACADEMY_SIMULATION.md`(Day 8~30 관찰 대상),
`PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md`(Day 31~60 스키마 원본),
`PAUL_EASY_VOCA_CUSTOMER_OPERATION_PLAN.md`(Day 61~90 온보딩 원본),
`PAUL_EASY_VOCA_AI_AGENT_OS.md`, `PAUL_EASY_VOCA_AI_DEVELOPMENT_
PROTOCOL.md`, `PAUL_EASY_VOCA_MVP_ROADMAP.md`(Phase 1→2 전환 기준).
