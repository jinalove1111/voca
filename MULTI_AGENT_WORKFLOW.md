# Project Paul — Multi-Agent Workflow

_작성: 2026-07-20. `docs/agent-architecture.md`가 정의한 조직이 실제
작업을 어떻게 진행하는지에 대한 절차 문서. 토큰 효율을 최우선으로
설계됨 — 모든 작업에 9개 역할을 전부 소집하지 않는다._

## 최소 워크플로우

1. Orchestrator가 300단어 이내 작업 브리프를 작성한다.
2. Orchestrator가 이 작업에 실제로 필요한 전문가만 선정한다.
3. 선정된 각 전문가는 200단어 이내로 의견을 낸다.
4. Engineer(Implementer/Engineering Head)가 300단어 이내 구현 제안을
   작성한다.
5. 이견 제기(challenge)는 최대 1라운드만 허용한다.
6. 각 challenge는 100단어 이내로 제한한다.
7. Orchestrator가 최종 결정을 1회 내린다.
8. Implementer가 코드를 수정한다.
9. QA Reviewer가 검증한다.
10. Deployment Engineer가 프로덕션을 검증한다.
11. Product Guardian이 제품 화면/로직에 영향을 주는 변경에 한해 최종
    정렬 점검을 한다(내부 인프라/문서 변경은 생략 가능).
12. Student Analytics는 실제 사용 데이터가 이미 존재할 때만 소집한다.

## 규칙

- 모든 작업에 전체 에이전트를 소집하지 않는다.
- 일반 작업당 활성 에이전트는 최대 4명(Orchestrator 제외).
- 같은 내용을 반복 요약하지 않는다.
- 어떤 에이전트도 전체 작업을 다시 서술하지 않는다 — 필요한 부분만
  참조한다.
- 에이전트는 파일명/테스트/관측된 동작을 근거로 말한다(추측 금지).
- 이견은 짧게 보존한다(삭제하지 않되 장황하게 늘리지 않는다).
- 무제한 토론을 하지 않는다 — challenge는 1라운드까지.
- 근거 없는 학생 반응 예측을 하지 않는다.
- 같은 파일을 동시에 여러 에이전트가 수정하지 않는다(CLAUDE.md 규칙
  16 — 파일당 소유자 1명).
- 문서는 간결하게 유지한다.
- 별도 상태 문서를 새로 만들지 않고 기존 `handoff.md`를 사용한다
  (`.ai-status/`는 체크포인트 전용으로 계속 사용, `docs/agent-decisions/`는
  이 조직 특유의 결정 기록 전용으로 별개 유지).

## 비용/자율성 원칙

토큰 사용량과 장기 재사용성을 최적화한다.

에이전트를 소집하기 전 항상 자문한다: **"이 에이전트가 이 작업에 꼭
필요한가?"**

우선한다:
- 기존 저장소 근거(문서/코드/테스트) 재사용
- 짧고 구조화된 산출물
- 재사용 가능한 템플릿
- 최소한의 파일 변경
- 무료(no-cost) 아키텍처
- 현재 Claude Code 기능 범위 안에서 해결

하지 않는다:
- 외부 에이전트 프레임워크 추가
- 유료 API 추가
- Vercel 업그레이드
- 중복된 에이전트 계층 생성
- 방대한 추측성 전략 문서 생성
- 대상 파일이 명확한데 저장소 전체를 다시 읽는 것
- 결정이 명확해진 뒤에도 대화를 계속 이어가는 것

## 정지 조건 (사람 승인 필수)

다음 경우에는 어떤 에이전트도 진행하지 않고 운영자에게 먼저 확인한다:

- 파괴적 DB 마이그레이션이 필요할 때
- 프로덕션 시크릿을 변경해야 할 때
- 유료 서비스가 필요할 때
- 사용자를 잠글 수 있는(lock out) 인증 변경일 때
- 크리티컬 테스트가 실패했을 때

## 이 워크플로우와 기존 절차의 관계

`DEVELOPER_GUIDE.md`의 "AI 세션 표준 워크플로우"(13단계)는 여전히
유효하다 — 이 문서는 그 위에 "누가/언제 소집되는가"를 추가할 뿐,
build/verify/append 문서화 같은 기존 절차를 대체하지 않는다. 1인 세션
에서는 메인 세션이 Orchestrator를 포함한 여러 역할을 직접 겸해도 된다
(`orchestrator.md` 참고).

## 협의체(Agent Council) 절차 — 2026-09-25 추가 (ADR 0008)

_위 "최소 워크플로우"와 "규칙"은 그대로 유효하다. 이 섹션은 작업 등급,
Class C/D 협의체 흐름, 작업 봉투, 야간 안전 큐를 추가한다._

### 작업 등급 (Task Class) — orchestrator가 브리프 첫 줄에 기록

| 등급 | 예 | 흐름 | 결정 기록 | 운영자 승인 |
|---|---|---|---|---|
| **A 사소** | 오타, 명백한 문구 수정, 작은 CSS, 결정적 비제품 버그 | implementer → qa-reviewer | handoff 1줄 | 불필요 |
| **B 한정 구현** | 이미 승인된 소기능, 확정 요구사항, 작은 상호작용 조정, 한정된 엔지니어링 변경 | orchestrator(브리프+봉투) → planner(필요 시) → implementer → `/code-review` → qa-reviewer | handoff 섹션 + `.ai-status` | 불필요(학생 노출 변경이면 C) |
| **C 제품/설계** | 새 아동 상호작용, 내비게이션 변경, 퀘스트, 보상 메커닉, 새 Paul Town 게임플레이, 의미 있는 시각 상호작용, 진행 시스템 | 아래 협의체 흐름 전체 | ADR(`docs/agent-decisions/TEMPLATE.md`) | **필요**(CLAUDE.md 규칙 12) |
| **D 고위험** | 인증/PIN/RLS, 학생 데이터, 파괴적 마이그레이션, 프로덕션 SQL, 결제, 배포, 보안 정책, 주요 인프라, main 머지, 프로덕션 기능 롤아웃, `.github/workflows`, 플래그 기본값 변경 | C + security-reviewer + deployment-engineer → **운영자 승인 후에만 구현** → 독립 리뷰 → QA → 필요 시 2차 운영자 체크포인트 | ADR + `DECISIONS_PENDING.md` 행 | **필수** |

애매하면 상위 등급. 운영자가 "FAST PATH"를 요청하면 A/B 흐름을 쓰되
**Class D 경계는 절대 우회하지 않는다**. "FULL COUNCIL REVIEW"를 요청하면
등급과 무관하게 C 흐름을 돌린다.

### Class C/D 협의체 흐름 — 파도 3회, 재귀 없음

1. **파도 1 — 독립 평가(병렬)**: orchestrator가 동일 브리프(≤300단어)+
   봉투+파일 포인터를 child-experience-designer / game-designer / planner
   (엔지니어링)에게 **동시에** 보낸다(Agent tool 병렬 호출 — 서로의 답을
   볼 수 없으므로 독립성이 기술적으로 보장된다). "A는 좋다고 했다"류의
   요약을 먼저 주지 않는다. 각 ≤200~250단어, 최소 "가장 큰 이점/가장 큰
   우려/권고" 포함.
2. **파도 2 — 교차 비평(1회)**: 세 입장을 모아 다시 세 명에게 보낸다.
   다른 입장에 대한 이견만 ≤100단어.
3. **파도 3 — devils-advocate**: 브리프+세 입장+이견을 받아 12개 질문에
   답하고 권고(PROCEED/SIMPLIFY/EXPERIMENT_FIRST/DEFER/REJECT/
   OWNER_DECISION_REQUIRED). 거부권 없음.
4. **결정 — orchestrator 1회**: ACCEPT / REJECT / SIMPLIFY / EXPERIMENT /
   DEFER / OWNER_DECISION_REQUIRED. 이견은 ADR에 남긴다.
5. **정지 규칙**: 파도 2 이후 추가 라운드 없음. 물질적 이견이 남으면
   OWNER_DECISION_REQUIRED → `DECISIONS_PENDING.md` 행 추가 → 그 작업
   정지. 에이전트 간 왕복 재질문 금지.
6. **구현 → 코드 리뷰 → QA**: implementer(봉투 검증 후) → `/code-review`
   (구현과 다른 컨텍스트, Class D는 security-reviewer 추가) → qa-reviewer
   (PASS/FAIL_FIX_REQUIRED/BLOCKED/OWNER_DECISION_REQUIRED). FAIL이면
   implementer로, 수정 후 영향 범위 재검사 + 회귀 재실행. 같은 근본 원인
   3회 실패 시 BLOCKED.
7. **구현 결과 재검토(Class C 필수)**: child-experience-designer와
   game-designer가 실제 구현물(Preview/스크린샷/E2E 산출)을 각 ≤150단어로
   재검토. 물질적 문제면 한정된 수정 요청 → implementer. 자동 수정/재검토
   사이클 최대 2회, 초과 시 BLOCKED 또는 OWNER_DECISION_REQUIRED.
8. **회귀 → 운영자 검토 패키지**: qa-reviewer 회귀 재확인 후
   docs-maintainer가 handoff 섹션 + ADR FINAL STATUS +
   `DECISIONS_PENDING.md` 행(있으면)을 작성. 별도 문서 형식 없음.

### 가짜 합의 금지

**에이전트는 동의에 보상받지 않는다.** 역할 근거 없는 "좋아 보인다"는
Class C/D에서 무효. 진짜 합의면 "NO MATERIAL DISAGREEMENT"와 각자의 독립
근거를 기록한다. 이견을 인위적으로 만들지 않는다.

### 작업 봉투 (Task Envelope) — 모든 구현/검수 dispatch의 첫 블록

```
REPO: C:\voca
WORKTREE: <절대 경로>
BRANCH: <브랜치>
BASE_COMMIT: <sha>
TASK_ID: <PROJECT_BOARD 카드 id / ADR id>
TASK_CLASS: A|B|C|D
ALLOWED_PATHS: <files_owned>
ACCEPTANCE_CRITERIA: <또는 ADR 참조>
OWNER_APPROVAL_REQUIRED: YES|NO
DEPENDENCIES: <선행 task_id 또는 없음>
FORBIDDEN: git add -A, 타인 파일 add, merge, rebase, 브랜치 전환, worktree 삭제, .github/, *.sql 실행
```

수정 권한이 있는 에이전트는 편집 전에 `git rev-parse --show-toplevel` /
`--abbrev-ref HEAD` / `--short HEAD`로 대조하고, 하나라도 다르면 **중단·
보고**(브랜치를 바꿔서 맞추지 않는다). 활성/폐기 브랜치 목록은
`PROJECT_BOARD.md` "활성 브랜치/worktree". `.ai-status` 스키마에 같은
필드가 있다(`.ai-status/README.md`).

### 야간 안전 큐 (Overnight Safe Queue)

- 큐 = `PROJECT_BOARD.md` "READY 큐" 섹션의 항목만. 진입 조건: Class A/B
  이거나, Class C/D인데 ADR이 ACCEPT이고 `OWNER_APPROVAL_REQUIRED: NO`
  또는 운영자 승인이 기록됨.
- 상태: `READY → IN_PROGRESS → REVIEW → QA → (FIX_REQUIRED →) DONE |
  BLOCKED | OWNER_DECISION_REQUIRED`.
- 루프: READY 항목 선택 → 봉투 검증 → 구현 → 테스트 → `/code-review` →
  qa-reviewer → 필요 시 수정(최대 2회) → 재테스트 → 문서(docs-maintainer)
  → `.ai-status` 체크포인트 → 다음 READY.
- 막히면 `BLOCKERS.md` 기록 → 다른 독립 READY 항목으로. 같은 원인 3회
  실패면 BLOCKED.
- **READY가 비면 정지.** 작업을 발명하지 않는다. "8시간 작업"은 "큐
  소진"이지 "8시간 바쁘기"가 아니다.
- 기존 운영 규칙 유지: 30분 커밋 상한, 증거 기반 stall 판정, DDL은 SQL
  파일만 준비.

### 운영자 승인 필수 행동 (위 "정지 조건"의 확장 — 준비는 가능, 실행은 불가)

프로덕션 배포 · 파괴적 DB 마이그레이션 · 프로덕션 SQL 실행 일체 · 실학생
데이터 수정 · `students` 테이블/핵심 학생 레코드 변경 · 인증/PIN/RLS 정책
변경 · 시크릿 · 결제 · 유료 외부 서비스 · main 머지(PR #62 포함) · CI
워크플로 변경 · 프로덕션에 영향 주는 플래그 기본값 변경 · worktree 삭제 ·
브랜치 삭제 · 학생 대상 광범위 롤아웃 · 비가역 인프라 변경.

### 토큰/비용 규율

전문가에게는 브리프+봉투+파일 경로/섹션 포인터만. handoff/ADR/BOARD
요약으로 상태를 전달하고 저장소를 다시 읽히지 않는다. 소스 트리를 에이전트
간에 통째로 붙여넣지 않는다. 역할이 끝나면 즉시 종료. 중복 리뷰 금지.
A/B는 최소 소집. 상위 추론 모델은 Class C/D의 아키텍처/제품 충돌 해소
(orchestrator 결정, devils-advocate)에만. 사용자가 선택한 모델 설정을
자동으로 바꾸지 않는다.

### 훅으로 강제되는 것 / 문서로만 강제되는 것 (CLAUDE.md 규칙 18)

현재 훅으로 실제 강제되는 것은 SQL 파괴 패턴 차단뿐이다. 파도 횟수, 자기
승인 금지, 큐 소진 시 정지, 봉투 대조는 **문서 규칙**(각 역할 정의의 자율
준수)이다. 봉투 대조는 PreToolUse 훅으로 강제 가능하나 이번 확장에서는
만들지 않았다(운영자 결정 시 별도 작업).

### 드라이런 교훈 — 읽기 전용 리뷰어도 worktree를 먼저 대조한다 (2026-09-25, 180차)

2026-09-25 Class C 드라이런에서 엔지니어링 리뷰어(planner)가 `C:\voca`(구 브랜치)에서 grep을 실행해 "이 worktree에 2.5D 코드가 없다"고 오보했다(활성 worktree에는 `src/components/town/proto2_5d/` 등이 실존). 따라서 "작업 봉투" 대조(`git rev-parse --show-toplevel` / `--abbrev-ref HEAD` / `--short HEAD`)는 수정 권한 에이전트뿐 아니라 **모든 리뷰어의 첫 명령**이다. 대조 결과가 봉투와 다르면 파일을 읽기 전에 중단·보고한다. orchestrator는 리뷰 산출물에 사실 오류가 있으면 파도 2에 "orchestrator 사실 정정" 블록으로 첨부한다(의견이 아닌 검증된 사실만).

### 활성 상한 4명과 협의체의 관계 (검토 반영, 2026-09-26)

위 "규칙"의 "일반 작업당 활성 에이전트 최대 4명(Orchestrator 제외)"은
**동시 활성** 기준이다. Class C의 파도 1(3명)과 파도 3(devils-advocate
1명)은 순차라 상한 안이며, Class D의 security-reviewer/deployment-engineer는
파도 1과 동시에 띄우지 않고 결정 이후 별도 파도로 순차 소집한다. 어느
시점에도 동시 활성 5명 이상이 되지 않는다. 기존 11번 규칙(product-guardian의
제품 화면/로직 최종 정렬 점검)은 협의체 흐름 8번(운영자 검토 패키지) 직전에
그대로 적용된다.
