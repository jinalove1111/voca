# 0008 — 에이전트 협의체(Agent Council) 설계: 기존 12역할 조직의 최소 확장 (승인됨 — Phase 2 구현 완료, PR #62 커밋)

- 날짜: 2026-09-25
- 상태: **승인됨(ACCEPTED) → 구현됨(IMPLEMENTED, PR #62 커밋 2026-09-26)** — 2026-09-25 운영자가 Phase 2 지시로 승인. Phase 2 구현 기록은 §13. 이전 상태(PROPOSED) 문구는 §0~§12에 그대로 보존(append-only).
- 범위: 개발 인프라 문서만. `src/`/`api/`/`*.sql`/`.github/`/배포 변경 0건. 학생 대상 기능 없음(CLAUDE.md 규칙 12).
- 근거 문서: `docs/agent-architecture.md`(2026-07-20), `MULTI_AGENT_WORKFLOW.md`(2026-07-20), `AI_WORKFLOW.md`, `DEVELOPER_GUIDE.md` "AI 세션 표준 워크플로우", `.ai-status/README.md`, `DECISIONS_PENDING.md`, `BLOCKERS.md`, `docs/agent-decisions/0001~0007`.
- 감사 기준 상태: 활성 worktree `scratchpad/wt-clean-pr`, 브랜치 `feat/paul-town-v2-clean-pr`, HEAD `3c26a5bb`, PR #62(Draft, base main), 179차 세션 기록.

## 0. 한 줄 결론

새 조직을 만들지 않는다. 이미 커밋된 12역할(`.claude/agents/`) + 1라운드 challenge 절차(`MULTI_AGENT_WORKFLOW.md`) + ADR(`docs/agent-decisions/`) + 운영자 결정 큐(`DECISIONS_PENDING.md`) + 블로커(`BLOCKERS.md`) + 체크포인트(`.ai-status/`)를 그대로 쓰고, 빠진 것 **2개 역할(game-designer, devils-advocate)** 과 **4개 규칙(작업 등급, 작업 봉투, 야간 안전 큐, 결정 기록 템플릿)** 만 추가한다. 전역 vibe-claude 플러그인(Head/Sub 계층, masterplan-agent, critic-lead)은 `docs/agent-architecture.md`가 이미 "저장소에 중복 생성하지 않는다"고 결정했으므로 이 설계에도 편입하지 않는다(개념만 차용).

## 1. 목표 협의체 → 실제 역할 매핑

| 목표 개념 | 실제 역할(파일) | 조치 |
|---|---|---|
| OWNER | 운영자(사람) | 변경 없음. 최종 권한. |
| PRODUCT LEAD | `orchestrator.md` | **확장**: 수용 기준(acceptance criteria) 작성, 작업 등급(§3) 판정, 결정 기록 템플릿(§5) 사용, 작업 봉투(§6) 발급을 책임에 추가. "전문가 의견에 그냥 동의하지 않는다" 명문화. |
| KIDS UX / DESIGN | `child-experience-designer.md` | **확장**: 탭 타깃 44px/가독성/모바일 4뷰포트/불필요 텍스트/온보딩/접근성 기본 항목 + "구현된 결과물(Preview/스크린샷/E2E 산출) 재검토" 단계 추가. |
| GAME DESIGN | (없음) → **신규 `game-designer.md`** | 읽기 전용(Read/Grep/Glob). 질문: "아이가 왜 이걸 다시 하고 싶어지는가?" 동기/보상 루프/진행/탐험/수집/반복 피로/도전/페이싱/Paul Town 세계관 일관성. `learning-designer.md`의 보상 파밍 거부권은 그대로 유지(게임 디자이너는 학습 판정을 하지 않는다). `product-guardian.md`의 6축 판정과 중복되지 않도록 "판정(APPROVE/REJECT)"이 아니라 "설계 의견(position)"만 낸다. |
| ENGINEERING | `planner.md` | **재사용**: 이미 "영향 범위·위험·파일 목록" 전담. 협의체에서는 아키텍처/재사용/복잡도/성능/데이터모델/Supabase 영향/마이그레이션 위험/테스트 가능성/구현 비용 관점의 "엔지니어링 입장"을 낸다. 불필요한 복잡도에 반드시 반대 의견을 낸다. |
| DEVIL'S ADVOCATE | (없음) → **신규 `devils-advocate.md`** | 읽기 전용. 필수 질문 8개(§4.3). 기능 제안 금지 — 현재 제안이 틀릴 이유만 찾는다. 전역 doctrine `agent-review-discipline.md`의 "사전 예측(pre-commitment) 3~5개를 먼저 적고 본문을 읽는다" 규칙을 차용. |
| IMPLEMENTER | `implementer.md` | **확장**: 승인된 범위만 구현. 구현 중 설계 문제 발견 시 STOP → orchestrator에 반환(즉흥 제품 결정 금지). 작업 봉투(§6) 검증 후에만 편집. 자기 승인 금지. |
| CODE REVIEW | 내장 `/code-review` 스킬(구현 세션과 다른 컨텍스트) + Class D는 `security-reviewer.md` | **재사용**: 새 에이전트 파일 없음. 구현자와 다른 세션/컨텍스트에서 실행해야 한다(`agent-review-discipline.md` 자기승인 금지). |
| QA / REGRESSION | `qa-reviewer.md` | **확장**: 체크리스트에 모바일(360/390/430)/계정 분리(UUID, 규칙 4)/학생 데이터 무결성/런타임 오류/접근성 기본/성능 회귀 추가. FAIL(NEEDS-WORK) 시 implementer로 되돌리는 루프 최대 2회, 초과 시 BLOCKED. |
| RELEASE REVIEW | `deployment-engineer.md` | 재사용, 변경 없음. |
| DOCS | `docs-maintainer.md` | 재사용, 변경 없음(*.md와 `.ai-status/*.json` 유일 작성자). |
| MISSION 게이트 | `mission-guardian.md`, `product-guardian.md` | 재사용. Class C/D에서만 소집. |
| OVERNIGHT WORKER | (전담 역할 없음, 만들지 않음) | 야간 세션 = orchestrator 역할을 겸한 메인 세션이 §7 안전 큐를 순회. 별도 역할 파일 불필요. |

새 파일은 정확히 2개(`game-designer.md`, `devils-advocate.md`). 둘 다 Write/Edit 없음.

## 2. 진실 원천(Source of Truth) — 기존 메커니즘 유지, 역할만 명시

| 항목 | 정본(canonical) | 보조 | 비고 |
|---|---|---|---|
| 현재 작업 | `PROJECT_BOARD.md` IN_PROGRESS | `.ai-status/*.json`(status=working) | 두 곳이 다르면 `.ai-status` 최신 파일이 최근 사실, BOARD가 의도 |
| 제품 상태 | `handoff.md`(최신 세션) | `ROADMAP.md` | ROADMAP/BOARD의 옛 카드는 append-only라 뒤처질 수 있음 — 실례: v3_50은 127차 적용·129차 POST 검증 PASS 종결됐지만 BOARD 125차 카드에는 "미실행"이 남아 있음. 에이전트는 상태 판단 시 반드시 handoff 최신 섹션을 우선한다. |
| 결정(대형) | `docs/agent-decisions/000N-*.md` | — | Class C/D 결정만 |
| 결정(운영자 대기) | `DECISIONS_PENDING.md` | — | OWNER_DECISION_REQUIRED 결과는 전부 여기 행 추가 |
| 블로커 | `BLOCKERS.md` | `.ai-status` blocker 필드 | |
| 다음 안전 작업 | `PROJECT_BOARD.md` NEXT (등급 표기된 항목) | — | §7 |

새 상태 파일을 만들지 않는다. 확장은 `.ai-status/README.md` 스키마에 필드 추가(§6)뿐이다.

## 3. 작업 등급(Task Class) — 기존 정지 조건을 등급으로 정리

| 등급 | 예 | 소집 | 결정 기록 | 운영자 승인 |
|---|---|---|---|---|
| **A 사소** | 오타, 문구, 명백한 CSS 수정, 주석 | implementer → qa-reviewer(verify 하네스만) | handoff 1줄 | 불필요 |
| **B 한정 구현** | 요구사항이 이미 확정된 소기능, 기존 기능의 소규모 상호작용, 테스트 추가, 이미 승인된 ADR의 하위 작업 | orchestrator(브리프+봉투) → planner(영향 1문단) → implementer → `/code-review` → qa-reviewer | handoff 섹션 + `.ai-status` | 불필요(단, 학생 화면 노출 변경이면 C) |
| **C 제품/설계** | 새 학생 상호작용, 게임 메커닉, 내비게이션 변경, 보상 변경, 플래그 기본값 변경 검토 | 전체 협의체(§4): child-experience-designer, game-designer, planner, devils-advocate(=활성 4명, `MULTI_AGENT_WORKFLOW.md` 상한과 일치) + 필요 시 learning-designer/product-guardian를 후속 판정으로 | ADR `docs/agent-decisions/000N` | **필요**(CLAUDE.md 규칙 12: 학생 대상 기능은 별도 승인) |
| **D 고위험** | 인증/PIN(규칙 11), DDL/마이그레이션(규칙 8~10), `students` 컬럼, 실학생 데이터, 배포/프로덕션 alias, `.github/workflows`(172차에 권한 정책으로 거부된 실례), 플래그 기본값 실제 변경, main 머지, 시크릿, 유료 서비스 | C + security-reviewer + deployment-engineer | ADR + `DECISIONS_PENDING.md` 행 | **필수** |

등급 판정은 orchestrator가 브리프 첫 줄에 적는다. 애매하면 상위 등급.

## 4. 결정 흐름(Class C/D) — 파도 3회, 재귀 없음

1. **파도 1 — 독립 평가(병렬)**: orchestrator가 동일 브리프(≤300단어)+작업 봉투를 child-experience-designer/game-designer/planner에게 **동시에** 보낸다(Agent tool 병렬 호출 — 서로의 답을 볼 수 없으므로 독립성이 기술적으로 보장됨). 각 ≤200단어.
2. **파도 2 — 교차 비평(병렬, 1회만)**: 세 입장을 모아 다시 세 명에게 보낸다. 각자 다른 입장에 대한 이견만 ≤100단어(`MULTI_AGENT_WORKFLOW.md` 5~6번 규칙 그대로).
3. **파도 3 — 악마의 변호인**: devils-advocate가 브리프+세 입장+이견을 받아 §4.3 질문에 답하고 "가장 단순한 대안"과 "출시 후 후회할 이유"를 적는다(≤250단어).
4. **결정**: orchestrator가 1회 결정 — `ACCEPT / REJECT / SIMPLIFY / EXPERIMENT / DEFER / OWNER_DECISION_REQUIRED`. 이견은 삭제하지 않고 ADR에 남긴다.
5. **정지 규칙**: 파도 2 이후 추가 라운드 없음. 결정이 OWNER_DECISION_REQUIRED면 `DECISIONS_PENDING.md`에 행을 추가하고 멈춘다. 에이전트끼리 서로에게 재질문하는 대화(SendMessage 왕복)는 금지.
6. **구현 후 재검토**: implementer → `/code-review` → qa-reviewer 통과 후, child-experience-designer와 game-designer가 **구현 결과물**(Preview URL/스크린샷/E2E 로그)을 각 ≤150단어로 재검토한다. "설계와 다르다"만 지적하고 새 요구를 추가하지 않는다. 지적은 implementer 수정 루프(최대 2회)로.
7. **운영자 검토 패키지**: docs-maintainer가 handoff 섹션 + ADR 상태 갱신 + `DECISIONS_PENDING.md` 행(있으면)을 작성. 이것이 OWNER-REVIEW PACKAGE다. 별도 문서 형식을 새로 만들지 않는다.

### 4.3 devils-advocate 필수 질문
왜 이걸 만들어야 하는가 / 실제 학생 문제를 푸는가 / 더 단순하게 같은 효과를 낼 수 없는가 / 인상적으로 보이려고 복잡해진 건 아닌가 / 기존 기능과 충돌하는가 / 무엇이 잘못될 수 있는가 / 다른 모두가 공유하는 가정은 무엇인가 / 출시 후 후회할 이유는 무엇인가.

## 5. 결정 기록 템플릿(ADR 확장) — Class C/D에만

```
DECISION ID: 000N
FEATURE / PROBLEM / OWNER REQUEST:
TASK CLASS: C|D
DESIGN(child-experience-designer) POSITION:
GAME(game-designer) POSITION:
ENGINEERING(planner) POSITION:
DEVIL'S ADVOCATE POSITION:
DISAGREEMENTS (파도 2, 각 ≤100단어):
LOWEST-COMPLEXITY OPTION:
RISKS:
PRODUCT LEAD(orchestrator) DECISION: ACCEPT|REJECT|SIMPLIFY|EXPERIMENT|DEFER|OWNER_DECISION_REQUIRED
ACCEPTANCE CRITERIA:
IMPLEMENTATION SCOPE / OUT OF SCOPE:
QA PLAN (verify:<domain>, e2e 스펙, 뷰포트):
OWNER APPROVAL REQUIRED: YES|NO
TASK ENVELOPE: (§6)
```
Class A/B는 이 템플릿을 쓰지 않는다(관료화 금지).

## 6. 작업 봉투(Task Envelope) — worktree 안전

모든 구현/검수 dispatch 프롬프트의 첫 블록은 다음이며, 에이전트는 편집 전에 `git rev-parse --show-toplevel`, `git rev-parse --abbrev-ref HEAD`, `git rev-parse --short HEAD`로 대조해 하나라도 다르면 **즉시 중단·보고**한다.

```
REPO: C:\voca
WORKTREE: <절대 경로>
BRANCH: <브랜치>
BASE_COMMIT: <sha>
TASK_ID: <PROJECT_BOARD 카드 id 또는 ADR id>
TASK_CLASS: A|B|C|D
ALLOWED_PATHS: <files_owned>
FORBIDDEN: git add -A, 다른 에이전트 파일 add, merge, rebase, checkout -b 외 브랜치 전환, worktree 삭제, .github/, *.sql 실행
```

`.ai-status/README.md` 스키마에 `worktree`, `branch`, `base_commit`, `task_class`, `allowed_paths`(=`files_owned` 별칭) 필드를 추가한다(Phase 2). `agent_name`은 12역할(+2) 중 하나여야 한다 — 최근 파일들이 "lead"로 표류한 점을 바로잡는다. 폐기 브랜치(예: `feat/paul-town-v2-world-contract-2026-09-17`)는 `PROJECT_BOARD.md` 상단 "활성 브랜치/worktree" 표에 OBSOLETE로 표기해 봉투 발급 자체를 막는다. 35개 잔여 worktree는 이 설계 범위에서 삭제하지 않는다.

## 7. 야간 안전 큐(Overnight Safe Queue)

- 큐 = `PROJECT_BOARD.md` NEXT 중 **등급 A/B이거나, 등급 C/D인데 ADR이 ACCEPT이고 운영자 승인이 기록된 항목**만. 그 외는 큐에 없는 것으로 간주.
- 루프: 항목 선택 → 봉투 발급 → implementer(sonnet) → build+verify:<domain> → `/code-review` → qa-reviewer → FAIL이면 수정(최대 2회) → 재검증 → docs-maintainer append → `.ai-status` 체크포인트 → 다음 항목.
- 막히면: `BLOCKERS.md`에 기록 → 다른 독립 항목으로. 같은 원인으로 3회 실패 시 그 항목 BLOCKED(`AI_WORKFLOW.md` 8단계와 동일).
- 큐가 비면 **정지**. 작업을 발명하지 않는다. "8시간 작업"은 "8시간 동안 큐를 소진"이지 "8시간 동안 바쁘기"가 아니다.
- 기존 운영 규칙 유지: 30분 커밋 상한, 증거 기반 stall 판정, DDL은 SQL 파일만 준비.

## 8. 운영자 승인이 항상 필요한 행동

프로덕션 배포/alias 변경, 파괴적·비멱등 DB 마이그레이션, SQL 실행 일체(규칙 8), 실학생 데이터 수정, `students` 컬럼 추가(규칙 10), 인증/PIN/RLS 정책 변경(규칙 11), 시크릿 노출·변경, 유료 서비스, main 머지(특히 Draft PR #62), `.github/workflows` 변경, 플래그 기본값 실제 변경(학생 노출), worktree/브랜치 삭제, 학생 대상 신규 기능 구현 착수(규칙 12).

## 9. 토큰/비용 정책

- 전문가에게는 브리프+봉투+**파일 경로/섹션 포인터**만 준다. 저장소 재탐색 금지(handoff 최신 섹션·ADR·BOARD 카드로 충분).
- 구조화 산출물(입장 ≤200단어, 이견 ≤100단어, DA ≤250단어)만 교환. 큰 분석 재복제 금지.
- 모델 정책(설정 변경은 Phase 2 이후, 지금은 정책만): implementer/qa-reviewer/docs-maintainer/Explore = sonnet; orchestrator 결정·devils-advocate·엔지니어링 충돌 해소 = 상위 추론 모델.
- 역할이 끝난 에이전트는 즉시 종료. 활성 상한 4명 유지.
- Class A/B는 협의체를 소집하지 않는다.

## 10. 현재 Claude Code 설정으로 가능한 것 / 문서로만 강제되는 것(규칙 18)

- **가능(즉시)**: 병렬 독립 평가(Agent tool 동시 호출), 모델 지정(`model` 파라미터), 역할별 도구 제한(agents/*.md `tools`), 독립 코드 리뷰(`/code-review`), 파일 소유 분리(files_owned), 체크포인트(.ai-status).
- **훅으로 강제 가능(Phase 2 선택)**: PreToolUse 훅이 Write/Edit 대상 파일이 현재 `.ai-status` 작업 파일의 `allowed_paths`/`worktree` 안인지 검사 — 기존 `checkDestructiveSql.mjs`와 같은 방식. 이것만이 "잘못된 worktree 편집"의 실제 강제 수단이다.
- **문서로만 강제(정직하게 표기)**: 파도 횟수 제한, 자기 승인 금지, 큐 소진 시 정지, 이견 기록 — 텍스트 의미 해석이 필요해 훅으로 신뢰성 있게 강제할 수 없다.

## 11. Phase 2 변경 파일 목록(승인 후에만, 구현 아님)

| 파일 | 조치 |
|---|---|
| `.claude/agents/game-designer.md` | 신규(읽기 전용) |
| `.claude/agents/devils-advocate.md` | 신규(읽기 전용) |
| `.claude/agents/orchestrator.md` | 확장(§1 PRODUCT LEAD 행) |
| `.claude/agents/implementer.md` | 확장(STOP-반환, 봉투 검증, 자기승인 금지) |
| `.claude/agents/qa-reviewer.md` | 확장(체크리스트, FAIL 루프 2회) |
| `.claude/agents/child-experience-designer.md` | 확장(구현 결과 재검토) |
| `docs/agent-architecture.md` | append: 협의체 매핑 섹션 |
| `MULTI_AGENT_WORKFLOW.md` | append: §3 등급, §4 흐름, §6 봉투, §7 야간 큐 |
| `docs/agent-decisions/TEMPLATE.md` | 신규(§5 템플릿) |
| `.ai-status/README.md` | append: 새 필드 5개 |
| `PROJECT_BOARD.md` | append 상단: 활성 브랜치/worktree 표(OBSOLETE 표기) |
| `DEVELOPER_GUIDE.md` | append: 이 ADR 포인터 1문단 |
| (선택) `scripts/hooks/checkTaskEnvelope.mjs` + `.claude/settings.json` | 훅 강제 원할 때만 |

변경하지 않는 것: `src/`, `api/`, `*.sql`, `.github/`, 배포 설정, 전역 `~/.claude/*`, 기존 12개 에이전트 파일의 도구 권한(Write/Edit 보유자는 implementer/docs-maintainer 그대로).

## 12. 이 ADR 작성 시점의 확인 사항

제품 코드 변경 0, DB 작업 0, SQL 실행 0, 브랜치 전환 0, merge/rebase 0, worktree 삭제 0, 배포 0, commit/push 0. 이 파일과 `.ai-status/orchestrator-agent-council-phase1.json`만 활성 worktree에 미커밋 상태로 추가됨.

## 13. Phase 2 구현 기록 (2026-09-25, 180차)

§11의 목록대로 구현했다(선택 항목인 훅은 만들지 않음). 신규: `.claude/agents/game-designer.md`, `.claude/agents/devils-advocate.md`, `docs/agent-decisions/TEMPLATE.md`, `.ai-status/orchestrator-agent-council-phase2.json`. append 확장: `orchestrator.md`, `implementer.md`, `qa-reviewer.md`, `child-experience-designer.md`, `docs/agent-architecture.md`, `MULTI_AGENT_WORKFLOW.md`, `.ai-status/README.md`, `PROJECT_BOARD.md`(활성 브랜치 표 + READY 큐), `DEVELOPER_GUIDE.md`(운영자 사용 안내). 기존 줄 삭제 0.

드라이런 3종: Class C(우편함) → 파도 3회 후 orchestrator 결정 OWNER_DECISION_REQUIRED(물질적 이견 "학습 연결 게이트 여부" 기록, 토론 종결), Class A(오타) → 협의체 미소집 확인, Class D(RLS) → 운영자 승인 하드스톱 확인. 드라이런에서 읽기 전용 리뷰어가 잘못된 디렉터리(`C:\voca`)에서 검색해 "2.5D 코드 없음"으로 오보한 사례가 실제로 발생 → `MULTI_AGENT_WORKFLOW.md` "작업 봉투" 절에 "읽기 전용 리뷰어도 첫 명령으로 worktree 대조" 규칙 추가. 상세: `handoff.md` 2026-09-25(180차).

제품 코드/SQL/CI/배포 변경 0. 2026-09-26 운영자 최종 검토(결함 5건 수정) 후 3개 커밋(`cea6c6fc` 역할, `34b5155e` 거버넌스, 세 번째는 이 기록)으로 PR #62 브랜치에 push. FINAL STATUS: IMPLEMENTED — PR #62에서 운영자 머지 판단 대기(머지는 Class D, 운영자 전용).
