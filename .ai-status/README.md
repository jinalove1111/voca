# `.ai-status/` — 파일 기반 에이전트 상태 프로토콜

## 이것이 무엇인가 (그리고 무엇이 아닌가)

`.ai-status/`는 이 저장소에서 작업하는 에이전트(또는 사람)가 의미있는
체크포인트마다 JSON 파일 하나를 쓰는 **순수 관례**입니다. Claude Code
런타임의 내부 상태를 읽거나 쓰는 기능이 아니며, 그런 기능은 이 환경에
존재하지 않습니다 — `.ai-status/*.json`은 그냥 이 저장소 안의 평범한
텍스트 파일이고, 누가 지금 무엇을 하고 있(었)는지를 사람이(또는 다음
세션이) 나중에 파일을 열어 읽기 위한 용도입니다. 자동으로 갱신되거나
강제되지 않습니다 — 각 에이전트(`.claude/agents/*.md`)가 자기 역할
문서에 적힌 시점마다 스스로 씁니다.

## 파일 규칙

- 경로: `.ai-status/<agent_name>-<task_id>.json` (예:
  `.ai-status/implementer-fix-login-crash.json`)
- 한 작업(task_id) 진행 중에는 같은 파일을 계속 덮어써서 최신 상태만
  유지합니다(히스토리 보관이 목적이 아니라 "지금 상태" 스냅샷).
- 작업이 `completed`/`failed`로 끝난 뒤에도 파일은 지우지 않고 남겨둡니다
  (다음 세션이 "이 작업은 이미 끝났다"를 확인할 수 있게).
- 스키마는 `TEMPLATE.json`을 복사해서 채웁니다.

## 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `agent_name` | string | `.claude/agents/*.md`의 `name`과 일치(예: `implementer`) |
| `role` | string | 자유 텍스트 요약(예: `"코드 구현"`) |
| `task_id` | string | 작업을 식별하는 짧은 slug(파일명에도 사용) |
| `task` | string | 작업 내용 한 줄 요약 |
| `status` | enum | 아래 status enum 참고 |
| `progress` | number | 0~100 정수(추정치, 정밀할 필요 없음) |
| `started_at` | string (ISO 8601) | 작업 시작 시각 |
| `updated_at` | string (ISO 8601) | 이 파일을 마지막으로 쓴 시각 |
| `files_owned` | string[] | 이번 작업에서 실제로 Write/Edit한 파일 경로(저장소 루트 기준 상대경로) |
| `files_read` | string[] | 참고로 읽기만 한 파일 경로(수정 안 함 — 규칙 16 "파일당 소유자 1명" 확인용) |
| `summary` | string | 지금까지 한 일 요약(다음 세션이 이것만 읽고 이어갈 수 있을 정도) |
| `blocker` | string \| null | 막혀있으면 그 이유, 없으면 `null` |
| `next_action` | string | 다음에 할 일(다른 에이전트에게 넘기는 경우 handoff 대상 명시) |

## `status` enum

- `idle` — 아직 시작 전(계획만 받은 상태)
- `planning` — planner가 조사/계획 수립 중
- `working` — implementer가 구현 중
- `reviewing` — qa-reviewer/security-reviewer가 검수 중
- `blocked` — 진행 불가(원인은 `blocker` 필드에)
- `completed` — 정상 완료
- `failed` — 실패로 종료(원인은 `blocker` 필드에, `next_action`에 후속
  조치 제안)

## 사용 예

```bash
# 작업 시작 시
cat > .ai-status/implementer-fix-login-crash.json <<'EOF'
{ "agent_name": "implementer", "role": "코드 구현", ... "status": "working", ... }
EOF

# 작업 완료 시 같은 파일을 덮어씀
```

Node/Python 어느 쪽으로 써도 무방합니다 — 이 저장소는 특정 런타임을
강제하지 않습니다. 예시는 `EXAMPLE-implementer-doc-os-setup.json` 참고.
