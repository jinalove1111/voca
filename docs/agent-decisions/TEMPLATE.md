# 000N — <제목> (<상태>)

_결정 기록 템플릿(2026-09-25, ADR 0008) — Class C/D 작업에만 사용한다.
Class A/B는 이 템플릿을 쓰지 않는다(관료화 금지, `MULTI_AGENT_WORKFLOW.md`
"작업 등급"). 파일명은 `docs/agent-decisions/000N-<slug>.md`, 번호는 기존
최대값+1. 항목이 해당 없으면 "해당 없음"이라고 적고 지우지 않는다._

- DECISION ID: 000N
- DATE: YYYY-MM-DD
- TASK ID: (PROJECT_BOARD 카드 id / `.ai-status` task_id)
- TASK CLASS: C | D
- FEATURE / PROBLEM:

## OWNER REQUEST

(운영자 요청 원문 또는 요지)

## CURRENT PRODUCT CONTEXT

(handoff 최신 섹션/ROADMAP/코드 근거 — 재사용 가능한 기존 시스템 명시)

## CHILD EXPERIENCE POSITION (child-experience-designer, 파도 1, ≤200단어)

## GAME DESIGN POSITION (game-designer, 파도 1, ≤250단어)

## ENGINEERING POSITION (planner, 파도 1, ≤200단어)

## DEVIL'S ADVOCATE POSITION (devils-advocate, 파도 3, ≤250단어)

## MATERIAL DISAGREEMENTS (파도 2 교차 비평, 각 ≤100단어)

(없으면 "NO MATERIAL DISAGREEMENT" + 각자의 독립 근거 요약)

## LOWEST-COMPLEXITY OPTION

## RISKS

## PRODUCT LEAD RESOLUTION (orchestrator, 1회)

ACCEPT | REJECT | SIMPLIFY | EXPERIMENT | DEFER | OWNER_DECISION_REQUIRED

근거:

## ACCEPTANCE CRITERIA

- [ ] ...

## IMPLEMENTATION SCOPE

## OUT OF SCOPE

## QA PLAN

(verify:<domain>, e2e 스펙, 뷰포트 360/390/430, 계정 분리, 회귀 범위)

## OWNER APPROVAL REQUIRED

YES | NO — (YES면 `DECISIONS_PENDING.md`에 행 추가)

## TASK ENVELOPE

```
REPO: C:\voca
WORKTREE:
BRANCH:
BASE_COMMIT:
TASK_ID:
TASK_CLASS:
ALLOWED_PATHS:
```

## IMPLEMENTED-RESULT REVIEW (Class C 필수, 구현 후)

- child-experience-designer (≤150단어):
- game-designer (≤150단어):
- 수정 사이클: N/2

## FINAL STATUS

PROPOSED | ACCEPTED | IMPLEMENTED | VERIFIED | OWNER_REVIEW | DONE | REJECTED | DEFERRED
