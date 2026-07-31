# docs/architecture/ — 멀티테넌트(100학원 SaaS) 아키텍처 설계 문서

**상태**: 이 디렉터리의 7개 문서는 전부 **설계 전용**이다 — 구현
코드는 **0줄**(RLS 정책 미적용, `academy_id` 컬럼 미존재, Supabase
Auth 미도입). 학원 1곳(111명) 베타 운영 중인 현재 코드베이스와는
직접적 관련이 없다. 이 클러스터의 작업을 재개할 때는 이 설계
문서들보다 먼저 [`docs/SAAS_READINESS_REVIEW.md`](../SAAS_READINESS_REVIEW.md)
(코드 실측 기준 멀티테넌트 준비도 0% 감사)를 읽어 현재 실제 상태를
먼저 확인할 것.

이 문서들의 record of truth(개정 대상)는
[`docs/agent-decisions/0006-multitenant-saas-architecture.md`](../agent-decisions/0006-multitenant-saas-architecture.md)
다 — 구 `SAAS_ARCHITECTURE_PLAN.md`/`MULTITENANT_DATABASE_DESIGN.md`는
2026-07-31 문서 정리로 그 문서에 병합됐다.

## 문서 목록 (1줄 요약)

- [`PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md`](./PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md)
  — 전체 테이블을 Global/Academy/User/Student 4대 데이터 성격으로 분류
- [`PAUL_EASY_VOCA_RLS_POLICY_DESIGN.md`](./PAUL_EASY_VOCA_RLS_POLICY_DESIGN.md)
  — Supabase RLS 정책 설계(테이블별 SELECT/INSERT/UPDATE/DELETE 조건)
- [`PAUL_EASY_VOCA_PERMISSION_MATRIX.md`](./PAUL_EASY_VOCA_PERMISSION_MATRIX.md)
  — Super Admin/Owner/Admin/Teacher/Student/Parent 6-역할 권한 구조
- [`PAUL_EASY_VOCA_DATA_FLOW_ARCHITECTURE.md`](./PAUL_EASY_VOCA_DATA_FLOW_ARCHITECTURE.md)
  — 역할별 데이터 흐름(anon+RLS 직접 vs Edge Function 경유 판단 기준)
- [`PAUL_EASY_VOCA_ADMIN_DASHBOARD_ARCHITECTURE.md`](./PAUL_EASY_VOCA_ADMIN_DASHBOARD_ARCHITECTURE.md)
  — Platform Super Admin 전용 대시보드 9화면 설계
- [`PAUL_EASY_VOCA_BILLING_ARCHITECTURE_DESIGN.md`](./PAUL_EASY_VOCA_BILLING_ARCHITECTURE_DESIGN.md)
  — 결제 아키텍처(요금제/구독/Dunning/환불/탈퇴 데이터 처리)
- [`PAUL_EASY_VOCA_SAAS_SECURITY_IMPLEMENTATION_CHECKLIST.md`](./PAUL_EASY_VOCA_SAAS_SECURITY_IMPLEMENTATION_CHECKLIST.md)
  — 위 설계들이 실제 구현된 뒤 검증할 체크리스트(구현 전 최종 검증용)

## 관련 문서

- [`docs/agent-decisions/0006-multitenant-saas-architecture.md`](../agent-decisions/0006-multitenant-saas-architecture.md)
  — ADR of record
- [`docs/SAAS_READINESS_REVIEW.md`](../SAAS_READINESS_REVIEW.md) —
  코드 실측 현실 기준
- [`docs/audit/2026-07-26-saas-multi-tenant-security-top10.md`](../audit/2026-07-26-saas-multi-tenant-security-top10.md)
  — 루트 보안 감사 TOP10
