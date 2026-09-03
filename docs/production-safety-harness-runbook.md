# Production Safety Harness 운영 매뉴얼

_비기술자 운영자용 — 단계별로 그대로 따라 하면 됩니다. 명령은 프로젝트
루트(`C:\voca`)에서 PowerShell로 실행합니다. 코드 내용은 실제 소스
(`scripts/prodCheck.mjs`, `scripts/prodHotfix.mjs`,
`scripts/lib/hotfixManifest.mjs`, `scripts/prod/generateGhostScaManifest.mjs`,
`.github/workflows/release-gate.yml`)를 그대로 옮긴 것입니다._

## 0. 한 줄 요약

이 도구는 지금까지 해오던 수동 절차 — "VERIFY SQL을 SQL Editor에 복사해서
실행 → 결과 캡처 → 본 SQL 실행 → 다시 VERIFY SQL 실행 → 캡처해서 전달" —
를 대체합니다. 사람이 VERIFY와 본 SQL을 따로 작성하면 전제조건이 서로
어긋날 위험이 있었는데(2026-09-02 유령 유닛 착지 사고의 원인), 이 도구는
**manifest(JSON) 파일 하나**에서 확인(preflight)·적용(apply)·복구(rollback)
SQL을 전부 같은 데이터로 자동 생성해 그 불일치를 구조적으로 없앱니다.

원칙은 세 가지입니다.

1. **승인 전 DB WRITE 는 항상 0.** `--dry-run`, CI 환경, `SUPABASE_ACCESS_TOKEN`
   미설정 중 하나라도 해당하면 실제 쓰기 이전(승인 게이트 이전)에 무조건
   멈춥니다(`STOP`).
2. **fail-closed.** 확인 단계(프리플라이트) 중 하나라도 예상과 다르면 그
   즉시 중단하고, 적용 후 확인(포스트플라이트)이 실패하면 자동으로
   되돌립니다(rollback).
3. **manifest 가 유일한 원천(single source of truth).** 확인할 값과 적용할
   값을 사람이 따로 두 번 타이핑하지 않습니다 — manifest 하나에서 둘 다
   만들어집니다.

---

## 1. 매일 / 배포 전 — `npm run prod:check` (읽기 전용)

```
npm run prod:check
```

이 명령은 **읽기(GET/HEAD)만** 합니다. 데이터베이스에 아무것도 쓰지
않습니다(스크립트 헤더 주석: "PATCH/POST/PUT/DELETE 경로가 없다").

### 출력 읽는 법

맨 위에 실행 정보, 그 다음 요약 줄, 그 다음 3단 버킷이 나옵니다.

```
PRODUCTION SAFETY CHECK  (run <runId>, <projectRef>, <시각> KST)
PASS: n   WARN: n   FAIL: n        (health, 대상 실학생 n명)
Invariants: FAIL n · WARN n

Critical (즉시 조치):
  ...
Needs review (운영자 판단):
  ...
Data debt (알려진 이력, 조치 불필요):
  ...

============================================================
DB WRITE: 0 (이 스크립트는 GET/HEAD 만 보냅니다)
Safe to continue: YES 또는 NO(FAIL 있음)
리포트: <경로>
```

- **Critical** — FAIL(학생이 지금 실제로 막히거나 틀린 화면을 보는 상태
  또는 invariant FAIL). 여기 있으면 `Safe to continue`가 `NO`입니다.
- **Needs review** — WARN 중 "알려진 데이터 부채"가 아닌 것. 운영자가
  판단해야 하는 항목입니다.
- **Data debt** — WARN 중 이미 알려진 이력(`ASSIGNMENT_GHOST_UNIT`,
  `DIRECTION_RANDOM`, invariant `GHOST_UNIT_PRESENT`)이라 지금 당장 조치가
  필요하지 않은 항목입니다.

전체 판정(verdict)은 `PASS`/`WARN`/`FAIL` 중 하나이고, FAIL이 하나라도
있으면 명령의 종료 코드(exit code)가 1이 됩니다(자동화에서 실패로
잡힙니다). 프로젝트 참조(ref)가 기대와 다르면 종료 코드 2입니다.

### 이름 마스킹

콘솔에 나오는 학생 이름은 기본으로 `홍***`처럼 앞 글자 하나만 보이고
가려집니다. 전체 이름을 보려면:

```
npm run prod:check -- --show-names
```

주의: `--json` 으로 출력하거나 저장되는 리포트 JSON 파일에는 이 마스킹이
적용되지 **않습니다**(콘솔 텍스트 출력에만 적용). 리포트 파일을 외부로
공유할 때는 이름/ID가 그대로 들어있다는 점을 감안하세요.

### 보고서 JSON 위치

매 실행마다 `scripts/.tmp/prod-reports/<runId>.prodcheck.json` 에
저장됩니다(`--report-dir` 로 경로 변경 가능). 이 디렉터리는
`.gitignore` 대상이라 git에는 올라가지 않습니다.

### 자주 쓰는 옵션

| 옵션 | 용도 |
|---|---|
| `--json` | 사람용 텍스트 대신 JSON 전체 출력 |
| `--report-dir <dir>` | 리포트 저장 경로 변경(기본 `scripts/.tmp/prod-reports`) |
| `--expect-ref <ref>` | 지정한 project ref 와 실제가 다르면 즉시 exit 2(다른 프로젝트 오조작 방지) |
| `--require-env` | `.env` 자격증명이 없을 때 조용히 SKIP 하지 않고 FAIL(exit 1) 처리 — CI에서 사용 |
| `--show-names` | 사람용 출력에서 이름 마스킹 해제 |
| `--baseline-students <id,id>` | 지정 학생들의 학습기록 6종 테이블 행 수를 스냅샷 저장 |
| `--compare-baseline <file>` | 저장해둔 baseline 파일과 지금 값을 비교 출력 |

### 코드별 한국어 설명 표 (invariants, `scripts/lib/prodInvariants.mjs` CODE_META)

| 코드 | 영향(impact) | 권장 조치(recommended) |
|---|---|---|
| `STUDENT_UNIT_ORPHAN` | 현재 유닛이 삭제되어 학습 화면 진입이 실패할 수 있음 | 운영자 결정 |
| `SCA_UNIT_ORPHAN` | 배정 행이 삭제된 유닛을 가리켜 해당 교재로 전환 시 실패할 수 있음 | 운영자 결정 |
| `STUDENT_GHOST_UNIT` | 학생이 엑셀 헤더 잔재를 단어로 학습하게 됨 | 운영자 결정 |
| `SCA_GHOST_UNIT` | 지금 당장은 아니지만 이 배정으로 전환하는 순간 유령 단어를 보게 됨 | 운영자 결정 |
| `UNIT_NAME_MISMATCH` | 레거시 표시 이름과 실제 유닛이 달라 관리자 화면에서 혼동될 수 있음 | READ-ONLY 조사 |
| `PRIMARY_UNIT_MISMATCH` | 주교재 배정 유닛과 현재 학습 유닛이 달라 학생이 보는 단어가 예상과 다를 수 있음 | 운영자 결정 |
| `PRIMARY_TEXTBOOK_MISMATCH` | 현재 유닛의 교재가 주교재 배정과 달라 반 전환 시 단어가 섞일 수 있음 | 운영자 결정 |
| `UNIT_WORDS_ABNORMAL` | 단어 수가 비정상 범위라 업로드 사고(누락/중복 합침) 가능성이 있음 | READ-ONLY 조사 |
| `GHOST_UNIT_PRESENT` | 유령 유닛이 저장소에 남아있어 향후 새 배정 시 재발할 위험이 있음 | 운영자 결정 |
| `STUDENT_TEXTBOOK_MISMATCH` | 현재 유닛의 교재가 이 학생의 어떤 배정 교재에도 속하지 않음 — 반 이동 처리 누락 가능성 | READ-ONLY 조사 |
| `SCA_TEXTBOOK_ORPHAN` | 배정 행이 삭제된 교재를 가리켜 교재 정보 조회가 실패할 수 있음 | 운영자 결정 |
| `SCA_UNIT_TEXTBOOK_MISMATCH` | 배정 행의 유닛이 그 행의 교재 소속이 아니라 전환 시 엉뚱한 단어를 보여줄 수 있음 | READ-ONLY 조사 |
| `MULTIPLE_PRIMARY` | 주교재가 2개 이상이라 새로고침마다 다른 교재의 단어를 볼 수 있음 | 운영자 결정 |
| `NO_PRIMARY` | 배정은 있지만 주교재가 없어 주교재 의존 로직(방향 해석 등)이 홈 반으로만 폴백함 | 운영자 결정 |
| `UNIT_TEXTBOOK_ORPHAN` | 유닛이 삭제된 교재를 가리켜 교재 정보 조회가 실패할 수 있음 | 운영자 결정 |
| `UNIT_NAME_ABNORMAL` | 유닛 이름이 비정상(빈 값/번호 없는 별칭/과도한 길이)이라 관리자 화면에서 식별이 어려움 | READ-ONLY 조사 |
| `CLASS_ASSIGNMENT_CONTRADICTION` | 학생의 홈 반과 배정 기록이 서로 달라 반 이동 처리가 누락됐을 가능성 | READ-ONLY 조사 |
| `STUDENT_CLASS_IS_CONTAINER` | 학생의 홈 반이 교재 컨테이너(class_type=textbook)로 잘못 설정되어 반 관련 로직이 예상과 다르게 동작할 수 있음 | 운영자 결정 |

`recommended` 는 이 도구가 "자동으로 고쳐준다"는 뜻이 아닙니다 — 이
저장소 어디에도 자동 수정 코드는 없습니다. 순전히 표시용 분류입니다.

### 코드별 한국어 설명 표 (학생 health, `scripts/prodCheck.mjs` HEALTH_CODE_LABELS)

| 코드 | 설명 |
|---|---|
| `LOGIN_FAIL` | 로그인 식별자 문제 — 로그인 자체가 실패할 수 있음 |
| `CLASS_INVALID` | 반 배정 문제 |
| `TEXTBOOK_MISSING` | 주교재 배정 누락/고아 |
| `UNIT_INVALID` | 현재 유닛 문제(고아 또는 교재 불일치) |
| `WORDS_ZERO` | 현재 유닛에 단어가 0개 |
| `ORPHAN_ASSIGNMENT` | 배정 행이 존재하지 않는 반/교재를 가리킴 |
| `DUPLICATE` | 동명 중복 계정 |
| `DIRECTION_INVALID` | 쓰기 방향 값 문제 |
| `GHOST_UNIT` | 현재 유닛이 유령 유닛(엑셀 헤더 잔재) |
| `ASSIGNMENT_CONFLICT` | 배정 조합 모순(주교재 2개 이상 등) |

---

## 2. 핫픽스 절차(승인은 딱 1번)

### (a) manifest 준비

**방법 1 — 생성기로 자동 생성** (유령 유닛 참조를 정상 유닛으로
재배정하는 케이스 전용, `scripts/prod/generateGhostScaManifest.mjs`):

```
node scripts/prod/generateGhostScaManifest.mjs --dry-run-hotfix
```

- 라이브 값을 읽어 재배정 대상을 계산하고, 기본 경로
  `ops/hotfix/manifests/ghost-sca-reassign-<YYYYMMDD>.json` 에 manifest를
  저장합니다(`--out <path>` 로 경로 변경 가능). `ops/` 는 `.gitignore`
  대상입니다.
- `--dry-run-hotfix` 를 붙이면 생성 직후 자동으로
  `node scripts/prodHotfix.mjs <생성파일> --env production --dry-run --json`
  까지 이어서 실행해 `ready-to-apply` 인지 바로 확인합니다(이 스크립트도
  GET만 보내고, 이어지는 prodHotfix 호출도 `--dry-run` 고정이라 DB WRITE
  는 0건입니다).
- 정리 대상이 0건이면 manifest 파일을 만들지 않고 그냥 종료합니다(exit 0).
- 출력에 재배정 후보 목록, `skipped`(추측하지 않고 제외한 행과 사유),
  비실 계정(TEST/ARCHIVED/QA_FIXTURE) 제외 건수가 함께 나옵니다.

**방법 2 — 수동 작성** (그 외 케이스):
`scripts/prod/manifests/ghost-unit-landing-20260902.json` 을 예시로
참고해 아래 스키마를 그대로 지켜 작성합니다.

| 필드 | 필수 | 설명 |
|---|---|---|
| `id` | O | manifest 고유 ID(문자열) |
| `project_ref` | O | 대상 Supabase 프로젝트 ref. `.env`의 `VITE_SUPABASE_URL` 호스트 앞부분과 일치해야 함 |
| `changes[]` | O(1개 이상) | 실제 변경할 행 목록(아래 참고) |
| `changes[].table` | O | ALLOWLIST 표(아래) 안의 테이블만 허용 |
| `changes[].id` | O | 행의 UUID(PK) — **UUID 형식만 허용, 사람이 읽는 값(이름 등) 금지** |
| `changes[].expect_before` | O | 적용 전 이 값이어야 함(가드) — 프리플라이트가 이 값을 확인함 |
| `changes[].set` | O | 적용 후 값(단일 원천 — `set`에 없는 컬럼은 절대 안 바뀜) |
| `must_not_change[]` | 선택 | 이 행들은 절대 바뀌면 안 됨(적용 전후 모두 확인) |
| `reference_rows_must_exist[]` | 선택 | 참조 대상 행이 실제 존재/일치하는지 확인(예: 목적지 유닛이 실제 그 이름/교재인지, `min_words`로 단어 수 최소값도 확인 가능) |
| `affected_students[]` | 선택 | 영향받는 학생 UUID 목록 — 학습기록 baseline 저장 대상 |
| `learning_baseline_tables[]` | 선택 | `affected_students`의 학습기록 행 수를 적용 전후 비교할 테이블 목록 |
| `max_changes` | 선택 | 기본 20건, 최대 50건까지 명시적으로 확장 가능 |

**ALLOWLIST(쓰기 가능 테이블/컬럼) — 이 표 밖은 절대 쓸 수 없습니다:**

| 테이블 | 허용 컬럼 |
|---|---|
| `students` | `current_unit_id`, `unit_name`, `class_id` |
| `student_class_assignments` | `current_unit_id`, `is_primary`, `textbook_id` |

**반드시 지킬 것:**
- `changes[].id`/`must_not_change[].id`/`reference_rows_must_exist[].id`/
  `affected_students[]` 는 전부 **UUID만** 허용됩니다. 학생 이름·유닛
  이름 같은 사람이 읽는 값을 식별자로 쓰지 않습니다(CLAUDE.md 규칙 4와
  동일 원칙).
- `set`에 넣을 컬럼은 반드시 `expect_before`에도 같은 컬럼이 있어야
  합니다("가드 없는 변경 금지").
- 문자열 값에 `;`, `--`, `/*` 가 들어가면 검증 단계에서 즉시 거부됩니다
  (SQL 인젝션 이중 방어).

### (b) `--dry-run` 으로 계획 확인

```
npm run prod:hotfix -- <manifest.json> --env production --dry-run
```

`--env production|staging` 은 필수입니다(오타 포함 아무 값도 없으면
가장 먼저 STOP). `--env` 를 생략하면 다른 어떤 검증보다 먼저
`env-flag-required` 로 중단됩니다.

**출력 읽는 법:**

1. `정적 안전 스캔 PASS(파괴적 키워드 0건)` — DROP/TRUNCATE/DELETE 등이
   섞여 있지 않은지 자동 확인한 결과.
2. `프리플라이트 PASS — 현재 상태가 manifest 의 기대값과 일치` — 지금
   DB 상태가 `expect_before` 값과 실제로 같은지 읽어서 확인한 결과.
3. `baseline 저장 완료 — students n행(hash …) / SCA n행(hash …)` — 이
   manifest가 손대지 않는 다른 행들이 실행 도중 몰래 바뀌지 않았는지
   비교할 기준값.
4. **변경 계획(before -> after) 표**:
   ```
   === 변경 계획(before -> after) ===
     student_class_assignments:<id>
       current_unit_id: "<before>" -> "<after>"
     예상 UPDATE 행 수: n
   ```
5. `apply SQL 저장: <경로>`, `rollback SQL 저장: <경로>` — 각각
   `<runId>.apply.sql` / `<runId>.rollback.sql` 로
   `scripts/.tmp/prod-reports/`(기본)에 저장됩니다.
6. `READY TO APPLY` 다음에 `STOP(정상) — write path 비활성: --dry-run` 처럼
   STOP 사유가 나오면 정상입니다(승인 전이므로 당연히 멈춥니다).

**STOP 사유로 나올 수 있는 실제 status 값(모두 fail-closed):**

| status | 뜻 | 원인 |
|---|---|---|
| `invalid-manifest` | manifest 스키마/allowlist 위반 | 필수 필드 누락, allowlist 밖 테이블/컬럼, UUID 형식 오류 등 |
| `manifest-sha-mismatch` | `--expect-manifest-sha` 값과 실제 파일 해시 불일치 | manifest 파일이 예상과 다름 |
| `env-flag-required` | `--env production\|staging` 누락/오타 | 명령에 `--env` 를 빠뜨림 |
| `env-mismatch` | 로컬 `.env`의 project ref 와 manifest의 `project_ref` 불일치(exit 2) | 잘못된 환경에서 실행(스테이징 manifest를 프로덕션 env로 등) |
| `unsafe-sql` | 생성된 SQL에 파괴적 키워드(DROP/TRUNCATE/DELETE/INSERT/ALTER/GRANT/REVOKE/CREATE) 발견 | 이 하네스에서는 발생하면 안 됨(버그 신호) |
| `preflight-mismatch` | 현재 DB 상태가 manifest의 `expect_before`와 다름 | **이미 적용됐거나, 그 사이 다른 변경이 있었음** — 아래 FAQ 참고 |
| `ready-to-apply` | 모든 확인 통과, 승인만 하면 적용 가능(exit 0) | `--dry-run`/CI/토큰없음이면 여기서 정상 STOP |
| `not-interactive` | 비대화형(TTY 아님) 환경이라 승인을 받을 수 없음 | 스크립트/파이프에서 실행 시도 |
| `not-approved` | 승인 문구가 정확히 일치하지 않음 | `APPLY <runId>` 오타 |
| `manifest-tampered` | 승인 직후 manifest 파일 재해시가 처음과 다름 | 승인 대기 중 파일이 변경됨(변조 의심) |
| `apply-failed` | 적용 SQL 트랜잭션 실패(미반영) | DB 쪽 에러 |
| `rolled-back` | 적용 후 확인 실패 → 자동 복구 성공 | 포스트플라이트 불일치 또는 `health:students` 실패 |
| `rollback-failed` | 적용 후 확인 실패 + 자동 복구까지 실패 | **수동 조치 필요** — apply/rollback SQL 파일을 운영자에게 전달 |
| `rollback-of-mismatch` | `--rollback-of` 보고서의 manifest와 현재 manifest가 다름 | 되돌리려는 대상이 아님 |

### (c) 승인 실행

**지금(Management API 토큰이 없는) 상태**에서는 승인 게이트 자체에
도달하지 못하고 `--dry-run` 여부와 무관하게 `SUPABASE_ACCESS_TOKEN
미설정` 사유로 `ready-to-apply`(exit 0)에서 멈춥니다. 이 경우 실제 적용은
dry-run이 만들어 준 `<runId>.apply.sql` 파일을 Supabase 대시보드 SQL
Editor에 **한 번** 붙여넣어 실행합니다. 실행 후에는 반드시:

```
npm run prod:check
```

을 다시 실행해 결과를 확인합니다.

토큰이 있는 환경(아래 5절 참고, 아직 미검증)에서는 dry-run 없이 실행하면
정적 스캔·프리플라이트·baseline 저장까지 자동으로 마친 뒤 **TTY(대화형
터미널)에서** 다음 문구를 정확히 입력해야만 적용됩니다.

```
승인하려면 정확히 입력하세요: APPLY <runId>
```

`<runId>` 는 그 실행에서 출력된 값 그대로여야 하며, 한 글자라도 다르면
`not-approved`로 적용하지 않습니다.

### (d) 실패 시 자동 rollback / 이전 적용 되돌리기

적용 후 확인(포스트플라이트 또는 `npm run health:students`)이 실패하면
자동으로 rollback SQL을 실행해 원상 복구를 시도합니다(`rolled-back`).
복구까지 실패하면(`rollback-failed`) 자동으로는 더 진행하지 않고 apply/
rollback SQL 파일을 운영자에게 전달해 수동 조치를 요청합니다.

이미 적용된 과거 실행을 나중에 되돌리려면:

```
npm run prod:hotfix -- <manifest.json> --env production --dry-run --rollback-of <이전 실행의 hotfix 보고서.json>
```

`--rollback-of`는 그 보고서의 `manifestId`/manifest sha256이 지금
manifest와 일치할 때만 동작합니다("당시 적용된 것과 동일한 manifest로만
되돌리기 허용").

### (e) 절대 하지 말 것

- **CI(GitHub Actions 등)에서 이 명령을 실제 적용 목적으로 실행하지
  않는다.** CI 환경(`CI`/`GITHUB_ACTIONS` 감지)에서는 write path가
  코드 수준에서 영구 비활성이며, 이는 이미 배포 게이트(4절)가 매번
  증명하고 있습니다.
- **`--env` 를 생략하지 않는다.** 생략하면 즉시 STOP 하므로 위험하지는
  않지만, 매번 정확히 `production` 또는 `staging`을 명시해야 합니다.
- **manifest를 수동 편집한 뒤 재검증 없이 바로 적용하지 않는다.** 파일을
  고쳤으면 `--dry-run`부터 다시 돌려 새 계획을 확인해야 합니다(승인
  직전에도 재해시로 자동 감지되지만, 확인 없이 적용을 시도하는 습관 자체를
  들이지 않습니다).
- **STOP 사유를 무시하고 우회 방법을 찾지 않는다.** 특히
  `preflight-mismatch`가 뜨면 절대 강제로 진행하지 말고 아래 FAQ를 먼저
  확인합니다.
- **manifest에 이름 등 사람이 읽는 식별자를 쓰지 않는다.** UUID만 사용.

---

## 3. Release Gate 가 자동으로 하는 것

`.github/workflows/release-gate.yml` — `main`에 push/PR 될 때마다 자동
실행됩니다(GitHub Actions). 아무것도 DB에 쓰지 않습니다(전부 SELECT/GET).

| 게이트 | 내용 |
|---|---|
| Gate 1 | `npm run build` |
| Gate 2 | `npm run verify:all`(기존 도메인 회귀 전체) |
| Gate 3 | `npm run verify:release -- --skip-build --skip-verify`(학생별 health, baseline 대비 새 FAIL만 회귀로 차단) |
| Gate 3b | `npm run prod:check -- --require-env --json --report-dir ...`(READ-ONLY, 크로스 테이블 invariants + health) |
| Gate 4 | `node scripts/prodHotfix.mjs scripts/prod/manifests/ghost-unit-landing-20260902.json --env production --dry-run --json`(가짜 토큰 + CI 환경으로 "WRITE-DISABLED" 를 매번 실증) |

Gate 4는 매 실행마다 로그에 `DB WRITE: 0` 문자열이 실제로 있는지, 가짜
토큰(`ci-fake-token-must-never-be-used`) 문자열이 산출물에 새어나오지
않는지까지 검사합니다.

**사람이 결과를 보는 곳:**
- PR/커밋의 **Checks** 탭(`release-gate` / `deploy-ready` 잡 상태, 초록/빨강).
- 각 잡의 **Step Summary**(GitHub Actions 실행 화면 상단) — Gate 3b는 여기에
  `verdict`/health PASS·WARN·FAIL/invariants FAIL·WARN/ux 카운트 표를
  남깁니다(학생 이름이나 findings 원문은 절대 여기 올라가지 않습니다 —
  카운트만).

주의: 이 워크플로가 빨간불이어도 그 자체로는 Vercel 배포를 막지 못합니다
(main push → Vercel 자동 배포가 별도로 연동돼 있음). 실질적으로 배포를
막으려면 GitHub 저장소의 브랜치 보호 규칙에서 이 체크를 "필수"로
지정해야 하며, 이는 코드가 아니라 저장소 설정(운영자 판단) 영역입니다.

---

## 4. Management API 자동 실행을 켜려면 (선택, 아직 미검증)

현재 이 저장소에는 `SUPABASE_ACCESS_TOKEN` 이 어디에도(`.env`, `.env.local`,
CI 시크릿) 없습니다. 그래서 지금은 dry-run까지만 자동화되고, 실제 적용은
위 2-(c)처럼 SQL Editor에 수동으로 붙여넣습니다.

자동 적용(승인 후 `APPLY <runId>` 입력만으로 실제 반영)까지 켜려면:

- `SUPABASE_ACCESS_TOKEN` 값을 **로컬 `.env.local` 파일에만** 추가합니다.
- **CI(GitHub Actions)나 다른 사람과 공유하는 채널에는 절대 넣지
  않습니다.** CI에 넣어도 코드가 CI 감지 시 write path를 막지만, 그 안전을
  실제 토큰 노출 위험과 맞바꿀 이유가 없습니다.
- 처음 켠 뒤 첫 리허설은 반드시 **무해한 manifest**(예: 이미 적용되어
  `preflight-mismatch`가 뜨는 것이 확실한 manifest, 또는 영향 범위가 아주
  작은 테스트용 manifest)로 진행해 승인 흐름 자체를 검증합니다.
- **보안 검토 전에는 켜지 마세요.** 이 실행 경로(`createManagementApiExecutor`,
  `scripts/lib/sqlExecutor.mjs`)는 현재 코드로만 존재하고 어떤 테스트/CLI
  경로에서도 실제로 호출된 적이 없습니다.

---

## 5. 문제 해결 FAQ

**Q1. dry-run에서 `preflight-mismatch` 가 뜨면?**
십중팔구 "이미 적용된 것"입니다. manifest의 `expect_before` 값과 지금
DB의 실제 값이 다르다는 뜻인데, 가장 흔한 원인은 그 변경이 이미 반영됐거나
(예: `scripts/prod/manifests/ghost-unit-landing-20260902.json`은 2026-09-02에
이미 프로덕션에 적용된 건이라 지금 다시 돌리면 항상 이 status가 뜹니다 —
Gate 4가 이 status를 정상으로 취급하는 이유이기도 합니다), 그 사이에 다른
경로(관리자 화면 등)로 같은 행이 바뀐 경우입니다. `npm run prod:check`로
현재 실제 상태를 먼저 확인하고, 필요하면 manifest를 최신 상태 기준으로
다시 만드세요.

**Q2. `env-mismatch` 가 뜨면?**
로컬 `.env`의 `VITE_SUPABASE_URL`이 가리키는 프로젝트 ref와 manifest의
`project_ref`가 다릅니다. 스테이징용 manifest를 프로덕션 `.env`로
돌렸거나 그 반대인 경우가 흔합니다 — `.env` 내용과 manifest의
`project_ref`를 대조하세요. exit code는 2로, 다른 실패(대부분 1)와
구분됩니다.

**Q3. Node 24 + Windows에서 크래시가 난다는데?**
`scripts/prodCheck.mjs` 등은 일부러 `process.exit()`를 호출하지 않고
`process.exitCode`만 설정한 뒤 자연 종료시킵니다. Node 24 + Windows
환경에서 esbuild/fetch와 `process.exit()`가 겹치면 크래시하는 사례가
이 저장소에서 실제로 있었기 때문입니다(102차 발견). 그래서 명령이 끝난
뒤 프롬프트로 돌아오기까지 아주 짧게 지연되는 것처럼 보일 수 있는데,
정상 동작입니다.

**Q4. 보고서 JSON에 왜 secret(토큰 등)이 없는지?**
`prodHotfix.mjs`는 보고서/apply·rollback SQL/콘솔 출력 어디에도 값을
쓰기 전에 `redactSecrets()`를 두 번(로드한 `.env` 값 기준 + 현재
`process.env` 기준) 통과시킵니다. 키 이름에 `KEY`/`TOKEN`/`SECRET`/`PIN`이
들어가고 값이 3자 이상이면, 그 값이 텍스트에 그대로 등장할 때마다
`[REDACTED]`로 치환됩니다. Release Gate의 Gate 4는 가짜 토큰 문자열이
실제로 새어나오지 않는지까지 매번 검사합니다.

**Q5. `prod:check`가 유령 유닛을 찾아도 왜 그 유닛 자체를 지우지 않는지?**
이 하네스(핫픽스 실행기)의 ALLOWLIST는 `students`/
`student_class_assignments` 두 테이블의 몇 개 컬럼 **UPDATE만** 허용하고,
어떤 테이블에서도 DELETE를 만들지 않습니다(정적 안전 스캔이 DROP/
TRUNCATE/DELETE 등을 아예 차단). 즉 유령 *참조*(학생/배정이 유령 유닛을
가리키는 것)는 재배정으로 고칠 수 있지만, 유령 유닛 *레코드 자체*를
지우는 것은 이 도구의 설계 범위 밖입니다. 유령 유닛 삭제는 별도로
준비된 `supabase_v3_44_*.sql`(백업 테이블 생성 + anon 권한 회수 포함)
패키지가 대상이며, 이는 CLAUDE.md 규칙 8에 따라 운영자가 Supabase
대시보드에서 수동 실행해야 하는 DDL이라 이 스크립트들의 자동 경로에
들어있지 않습니다. 게다가 유령 유닛 중 하나(53e380c7)는 실제 학생의
학습기록(`word_status`)이 그 유닛의 단어에 CASCADE로 걸려 있어
"기록을 지워서 유닛을 지우는" 것을 금지 지시에 따라 보류(HOLD)해 둔
상태입니다(`docs/overnight-ghost-unit-audit-2026-09-02.md` §3, §6 참고).

---

## 6. 이 문서가 다루지 않는 것

- **students RLS Phase 2b**(anon 키로 `students` 484행 전체가 조회되는
  구조를 막는 서버 측 세션 발급 작업, `handoff.md` 2026-09-02(102차)
  섹션) — 이 하네스와는 별개의 진행 중 작업입니다.
- **v3_44 유령 유닛 삭제 SQL 패키지의 실행 여부/일정** — 위 FAQ Q5에서
  설명한 대로 이 하네스의 자동 실행 경로에 포함되어 있지 않으며, 실행은
  전적으로 운영자 결정·수동 실행 영역입니다.
