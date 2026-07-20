# Project Paul — Agent Architecture

_작성: 2026-07-20. Project Paul Multi-Agent Development Framework 구축
세션. 기존 `.claude/agents/` 5개 역할을 흡수해 하나의 일관된 조직으로
재구성한다 — 별도 병렬 조직을 만들지 않는다._

## 중요한 사실 확인 (먼저 읽을 것)

이 저장소 `.claude/agents/`에 실제로 커밋돼 있는 파일은 **5개뿐**이다:
`planner.md`, `implementer.md`, `qa-reviewer.md`, `security-reviewer.md`,
`docs-maintainer.md`(`DEVELOPER_GUIDE.md` "AI 개발 운영체제 사용 안내"
섹션에 명시된 공식 목록과 일치).

세션 환경에서 "사용 가능한 에이전트"로 보이는 `engineering-head`/
`qa-head`/`security-head`/`planning-agent`/`doctrine-auditor`/`backend`/
`frontend` 등은 **이 저장소에 커밋된 파일이 아니다** — 버전 관리 밖(전역/
플러그인 레벨)에서 주입되는 것으로 보이며, `DEVELOPER_GUIDE.md` 어디에도
문서화돼 있지 않다. 아래 매핑은 이 사실을 근거로, 사용자가 제시한 목표
계층도의 "Planning Agent/Engineering Head/QA Head/Security Head" 라벨을
**저장소에 실재하는 4개 파일(`planner`/`implementer`/`qa-reviewer`/
`security-reviewer`)의 동의어**로 취급한다 — 겹치는 새 파일을 만들면
"권한 중복 금지" 원칙에 어긋나기 때문이다.

## 목표 계층 (책임 계층이지 파일 개수가 아님)

```
MISSION GUARDIAN
    |
ORCHESTRATOR
    |
    |-- Product Guardian          (신규)
    |-- Learning Designer         (신규)
    |-- Child Experience Designer (신규)
    |-- Planning Agent            = planner.md (기존, 라벨만 매핑)
    |-- Engineering Head          = implementer.md (기존, 라벨만 매핑)
    |-- QA Head                   = qa-reviewer.md (기존, 라벨만 매핑)
    |-- Security Head             = security-reviewer.md (기존, 라벨만 매핑)
    |-- Deployment Engineer       (신규)
    |-- Student Analytics         (신규)
    |
    |-- Docs Maintainer           = docs-maintainer.md (기존, 유지)
```

## 매핑 표

| 현재 이름 | 유지 책임 | 보고 관계 | 조치 | 근거 |
|---|---|---|---|---|
| `planner.md` | 조사·계획 수립, 코드 미작성 | Orchestrator에게 계획서 handoff | **preserve** (Planning Agent 라벨로 참조) | 이미 명확한 단일 책임, 새로 만들 이유 없음 |
| `implementer.md` | 유일한 Write/Edit 실행자 | Planner/Orchestrator → Implementer → QA Reviewer | **preserve** (Engineering Head 라벨로 참조) | 5개 중 유일하게 코드 수정 권한 보유, 중복 금지 원칙상 새 "Engineering Head" 파일 불필요 |
| `qa-reviewer.md` | build/verify 재확인 + 체크리스트 대조 | Implementer → QA Reviewer → Docs Maintainer | **preserve** (QA Head 라벨로 참조) | 이미 PASS/NEEDS-WORK 판정 책임 보유 |
| `security-reviewer.md` | 인증/RLS/신뢰경계 감사 | 인증 인접 변경 시 QA Reviewer와 병행 | **preserve** (Security Head 라벨로 참조) | 이번 세션(admin-pin-actions 통합)에서 이미 이 역할로 정상 작동 확인 |
| `docs-maintainer.md` | *.md append, 소스 미수정 | 모든 역할의 마지막 단계 | **preserve** (그대로 유지) | 그대로 잘 작동 중(이번 세션에서도 handoff.md/ROADMAP.md 갱신에 사용) |
| (없음) | 미션 드리프트 감시, 코드 미작성 | 최상위, Orchestrator 위 | **신규 생성** — `mission-guardian.md` | 기존 5개 중 "우리가 원래 목표에서 벗어나고 있는가"를 전담하는 역할 없음 |
| (없음) | 요청→작업 브리프 변환, 에이전트 선정, 최종 결정 기록 | Mission Guardian 아래, 전문가 계층 위 | **신규 생성** — `orchestrator.md` | 기존 5개는 전부 "실행 계층"이라 조정자 역할 없음(1인 세션이 암묵적으로 겸해왔음 — 이제 명문화) |
| (없음) | Joy/Challenge/Real Learning/Visible Growth/Achievement/Continuation 평가, APPROVE/REVISE/REJECT | Orchestrator 직속 전문가 | **신규 생성** — `product-guardian.md` | 제품 방향성 평가는 기존 5개(전부 기술 실행/검수) 밖 |
| (없음) | 진짜 학습/난이도/인지부하/재시도/복습/숙달 점검 | Orchestrator 직속 전문가 | **신규 생성** — `learning-designer.md` | 학습 설계 평가 역할 없음(구현 아님 — 규칙 12 준수) |
| (없음) | 지루함/혼란/마찰/시각과부하/피드백/정서안전/즐거움 점검 | Orchestrator 직속 전문가 | **신규 생성** — `child-experience-designer.md` | UX/정서 평가 역할 없음(구현 아님 — 규칙 12 준수) |
| (없음) | build/GitHub/Vercel/production alias/Hobby 한도 검증 | Orchestrator 직속 전문가, Implementer 이후 | **신규 생성** — `deployment-engineer.md` | 이번 세션에서 겪은 Vercel Hobby 함수 한도 사고 같은 배포 검증을 전담하는 상시 역할 없었음(이번 세션은 즉석으로 처리) |
| (없음) | 실측 데이터만 사용한 사용 패턴 리포트 | Orchestrator 직속 전문가, 데이터 존재 시에만 소집 | **신규 생성** — `student-analytics.md` | 통계 실측 리포트 역할 없음(추측 금지, 데이터 없으면 활동 안 함) |

## CEO 미생성 사유

사용자 지시("Do not create a CEO agent")에 따라 CEO 역할은 만들지 않는다
— Mission Guardian(미션 수호, 실행 없음)과 Orchestrator(조정, 최종 결정
기록)가 그 자리를 대체한다. 어느 쪽도 사람(운영자) 승인 없이 프로덕션에
자율 배포하지 않는다(`MULTI_AGENT_WORKFLOW.md` 정지 조건 참고).

## 폐기(retire)된 역할

없음 — 기존 5개 전부 명확하고 겹치지 않는 책임을 갖고 있어 폐기 대상이
아니다(사용자 지시 "Do not delete working agents unless they are clearly
duplicated"와 일치).
