# docs/future-ideas/ — SaaS 확장 설계 스프린트 산출물 (2026-07-25/26)

**상태**: 이 디렉터리의 10개 문서는 2026-07-25~26에 걸쳐 작성된
"다학원 SaaS 확장" 설계/전략 문서 모음이다. 이후 운영자가 **고객
검증을 먼저 하는 쪽으로 피벗**하면서 이 클러스터 전체가 보류
상태다 — 실제 다음 행동은 코드가 아니라
[`PAUL_EASY_VOCA_CUSTOMER_VALIDATION_PLAN.md`](./PAUL_EASY_VOCA_CUSTOMER_VALIDATION_PLAN.md)
가 제시하는 원장 인터뷰 등 **실제 대화**다.

`PAUL_EASY_VOCA_CURRENT_STATUS.md`와
`PAUL_EASY_VOCA_FIRST_90_DAYS_EXECUTION.md`는 각 문서 상단의
2026-07-31 갱신 노트를 먼저 확인할 것 — 이후 발견된 P0급 이슈
(v3_12 등)와 배포 가정 무효화가 반영돼 있다.

## 문서 목록 (1줄 요약)

- [`PAUL_EASY_VOCA_MASTER_PLAN.md`](./PAUL_EASY_VOCA_MASTER_PLAN.md)
  — CTO 종합 실행계획(Memory Engine 설계, AI 에이전트 조직, 90일 로드맵)
- [`PAUL_EASY_VOCA_BUSINESS_MODEL_PLAN.md`](./PAUL_EASY_VOCA_BUSINESS_MODEL_PLAN.md)
  — 교육 SaaS 사업 모델(목표 고객/가격/수익모델/비용구조/경쟁분석)
- [`PAUL_EASY_VOCA_MVP_ROADMAP.md`](./PAUL_EASY_VOCA_MVP_ROADMAP.md)
  — 판매 가능 서비스로 가는 Phase 1~4 단계별 계획 + 절대 금지 기능 TOP10
- [`PAUL_EASY_VOCA_FIRST_90_DAYS_EXECUTION.md`](./PAUL_EASY_VOCA_FIRST_90_DAYS_EXECUTION.md)
  — 복귀 후 90일 일 단위 실행 순서(P0/P1/P2 표 포함, 갱신 노트 있음)
- [`PAUL_EASY_VOCA_CUSTOMER_VALIDATION_PLAN.md`](./PAUL_EASY_VOCA_CUSTOMER_VALIDATION_PLAN.md)
  — "돈을 낼 문제인가" 검증(Mom Test 인터뷰 스크립트, 가격 검증 방법) —
  **이 클러스터의 다음 행동 문서**
- [`PAUL_EASY_VOCA_CUSTOMER_OPERATION_PLAN.md`](./PAUL_EASY_VOCA_CUSTOMER_OPERATION_PLAN.md)
  — 1인 운영자의 100학원 고객 운영 설계(온보딩/CS/장애대응/배포)
- [`PAUL_EASY_VOCA_REAL_ACADEMY_SIMULATION.md`](./PAUL_EASY_VOCA_REAL_ACADEMY_SIMULATION.md)
  — 50명 공부방 실운영 시뮬레이션(실제 코드 동작 기준 문제 시나리오)
- [`PAUL_EASY_VOCA_CURRENT_STATUS.md`](./PAUL_EASY_VOCA_CURRENT_STATUS.md)
  — 현재 상태 종합 리포트(P0~P2 버그/기술부채, 갱신 노트 있음)
- [`PAUL_EASY_VOCA_AI_LEARNING_ENGINE_PLAN.md`](./PAUL_EASY_VOCA_AI_LEARNING_ENGINE_PLAN.md)
  — 데이터 기반 성장형 AI 학습 시스템(약점분석/오답패턴/SRS/AI Teacher)
- [`PAUL_EASY_VOCA_LEARNING_ANALYTICS_PLAN.md`](./PAUL_EASY_VOCA_LEARNING_ANALYTICS_PLAN.md)
  — 5계층(학생/학부모/교사/원장/플랫폼) Learning Analytics 설계

## 관련 문서

- [`PAUL_EASY_VOCA_CUSTOMER_VALIDATION_PLAN.md`](./PAUL_EASY_VOCA_CUSTOMER_VALIDATION_PLAN.md)
  — 재개 시 다음 행동
- [`docs/architecture/`](../architecture/) — 이 스프린트가 낳은 설계
  전용 아키텍처 문서(별도 디렉터리)
- [`docs/agent-decisions/0006-multitenant-saas-architecture.md`](../agent-decisions/0006-multitenant-saas-architecture.md)
  — ADR of record
