# docs/ 인덱스

_정리 기준일: 2026-07-31. 이 인덱스가 정리하기 전 상태(2026-07-30까지
미커밋이던 33건 문서 원본)는 스냅샷 커밋 `e035a74`에 그대로 보존돼
있다 — 이후 삭제된 7건도 이 커밋에서 전문을 확인할 수 있다._

---

## 1. 배포(Deployment)

- [`DEPLOY_COMMANDS_V311_V312.md`](./DEPLOY_COMMANDS_V311_V312.md) —
  v3.11/v3.12 배포 턴키 명령 시트(그대로 복사해 실행하는 용도)
- [`DEPLOYMENT_CHECKLIST_V311_V312.md`](./DEPLOYMENT_CHECKLIST_V311_V312.md)
  — 배포 절차/롤백 상세 체크리스트
- [`audit/2026-07-26-v3_11-1hour-runbook.md`](./audit/2026-07-26-v3_11-1hour-runbook.md)
  — 게이트/60분 룰/중단 기준의 원본 문서
- [`audit/2026-07-26-v3_11-lockdown-execution-review.md`](./audit/2026-07-26-v3_11-lockdown-execution-review.md)
  — SQL 의미 분석 + verify 스크립트 42501 예상 부작용 검토

## 2. 아키텍처(Architecture)

- [`agent-decisions/0006-multitenant-saas-architecture.md`](./agent-decisions/0006-multitenant-saas-architecture.md)
  — 멀티테넌트(100학원 SaaS) 아키텍처 ADR — **이 클러스터의 record of
  truth**(구 SAAS_ARCHITECTURE_PLAN.md/MULTITENANT_DATABASE_DESIGN.md는
  2026-07-31 이 문서로 병합됨)
- [`architecture/`](./architecture/) 7건 — 설계 전용 문서(테이블
  소유권/RLS/권한/데이터흐름/관리자대시보드/결제/보안체크리스트).
  **멀티테넌트 코드는 아직 미구현** — 지금은 학원 1곳 베타 단계
- [`SAAS_READINESS_REVIEW.md`](./SAAS_READINESS_REVIEW.md) — 코드 실측
  기반 감사: 멀티테넌트 준비도 **0%**. **이 클러스터 작업을 재개할
  때 가장 먼저 읽어야 할 현실 기준 문서**(위 architecture/ 설계
  문서들과 실제 코드 상태의 간극을 보여줌)
- [`audit/2026-07-26-saas-multi-tenant-security-top10.md`](./audit/2026-07-26-saas-multi-tenant-security-top10.md)
  — 멀티테넌트 전환 시 보안 관점 TOP 10(루트 보안 감사)

## 3. 베타(Beta)

- [`BETA_LAUNCH_STATUS.md`](./BETA_LAUNCH_STATUS.md) — 기능/한계 현황
- [`BETA_FINAL_CHECKLIST.md`](./BETA_FINAL_CHECKLIST.md) — 최종 체크리스트
- [`BETA_LAUNCH_READINESS_REPORT.md`](./BETA_LAUNCH_READINESS_REPORT.md)
  — 종합 Go/No-Go 판정(가장 최신 종합 문서, FINAL_BETA_LAUNCH_REPORT.md
  고유 Check 1~3이 2026-07-31 이 문서로 병합됨)
- [`AUDIO_TTS_VOLUME_RECOMMENDATION.md`](./AUDIO_TTS_VOLUME_RECOMMENDATION.md)
  — 오디오/TTS 볼륨 권장 설정

## 4. 미래 아이디어(Future Ideas)

- [`future-ideas/`](./future-ideas/) 10건 — 2026-07-25/26 SaaS 확장
  설계 스프린트(마스터플랜/사업모델/MVP 로드맵/90일 실행계획/고객
  검증·운영 계획/실운영 시뮬레이션/현황리포트/AI 학습엔진/러닝
  애널리틱스) 산출물. **고객 검증 우선 피벗으로 현재 보류 상태** —
  `future-ideas/PAUL_EASY_VOCA_CUSTOMER_VALIDATION_PLAN.md`가 이
  클러스터를 재개할 때의 다음 행동 문서(원장 인터뷰 등 실제 대화가
  코드보다 먼저)

---

## 삭제된 문서 (2026-07-31, 원본은 스냅샷 커밋 `e035a74`에 보존)

중복/재진술로 판단되어 삭제하고 고유 내용만 병합했다 — 상세 사유는
`handoff.md` 19차 항목 참고:

| 삭제된 문서 | 병합 타깃 |
|---|---|
| `PAUL_EASY_VOCA_AI_AGENT_OS.md` | (삭제 — CLAUDE.md 헌법/DEVELOPER_GUIDE.md 워크플로우로 대체, 병합 없음) |
| `PAUL_EASY_VOCA_AI_DEVELOPMENT_PROTOCOL.md` | (삭제 — 위와 동일) |
| `PAUL_EASY_VOCA_ROLE_PERMISSION_MATRIX.md` | `architecture/PAUL_EASY_VOCA_PERMISSION_MATRIX.md` |
| `PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md` | `agent-decisions/0006-multitenant-saas-architecture.md` |
| `PAUL_EASY_VOCA_MULTITENANT_DATABASE_DESIGN.md` | `agent-decisions/0006-multitenant-saas-architecture.md` |
| `PAUL_EASY_VOCA_EXECUTION_PRIORITY_PLAN.md` | `future-ideas/PAUL_EASY_VOCA_FIRST_90_DAYS_EXECUTION.md` |
| `FINAL_BETA_LAUNCH_REPORT.md` | `BETA_LAUNCH_READINESS_REPORT.md`(Check 1~3만) |
