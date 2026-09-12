# Safe Hooks v1 설계 문서 — HARD_BLOCK / APPROVAL_REQUIRED / SAFE 3단 판정

> **상태: 설계만 존재, 구현 BLOCKED.** 이 문서는 2026-09-12 6시간 자율
> 세션에서 나온 설계이며, 실제 판정 스크립트(`scripts/hooks/safeCommandGuard.mjs`)는
> 아직 작성되지 않았다. 7절 "BLOCKED 기록" 참고. 이 문서 자체도 코드/설정을
> 전혀 바꾸지 않는 순수 문서(docs-maintainer 산출물)다.

---

## 1. 배경

2026-09-12 6시간 자율 세션의 요구사항은 명령 실행 전 안전성을 3단계로
분류하는 훅을 만드는 것이었다.

- **HARD_BLOCK**: 되돌릴 수 없는 파괴적 명령. 무조건 거부(운영자가 훅
  자체를 바꾸지 않는 한 우회 불가).
- **APPROVAL_REQUIRED**: 되돌릴 수는 있지만 영향 범위가 크거나 운영
  환경/시크릿/핵심 데이터에 닿는 명령. 자동 실행 대신 운영자 승인을
  요구.
- **SAFE**: 조회·읽기·테스트·빌드류. 승인 없이 실행.

이 설계는 기존에 이미 동작 중인 훅
(`scripts/hooks/checkDestructiveSql.mjs`)과 범위가 다르다.
`checkDestructiveSql.mjs`는 **`.sql` 파일에 대한 Write/Edit 호출**만
검사해서, 그 파일 안에 스키마·데이터 삭제 계열 SQL 구문(테이블/컬럼/
데이터베이스/스키마를 지우는 구문, 전체 비우기 구문, `ALTER TABLE` 안의
삭제 구문, `WHERE` 절 없는 행 삭제 구문)이 쓰이는지만 본다 — 즉 "SQL 파일
내용"이라는 좁은 표면만 다룬다. 반면 Safe Hooks v1(`safeCommandGuard.mjs`)은
**Bash/PowerShell 명령 문자열 자체**(그리고 필요 시 Write/Edit 대상이
되는 스크립트 파일 내용)를 대상으로 하며, git/파일시스템/Supabase CLI/
배포 도구까지 포함하는 훨씬 넓은 표면을 다룬다. 두 훅은 서로 대체
관계가 아니라 **레이어가 다른 상호 보완 관계**다 — `checkDestructiveSql.mjs`는
그대로 유지하고, `safeCommandGuard.mjs`는 별도 PreToolUse 매처로
추가되는 것을 전제로 한다.

---

## 2. 판정표

| 분류 | 대상(말로 서술) | 근거 |
|---|---|---|
| HARD_BLOCK | 재귀+강제 삭제(예: 유닉스 계열의 `rm`에 재귀 옵션과 강제 옵션을 함께 준 형태, PowerShell의 `Remove-Item`에 `Recurse`/`Force`를 함께 준 형태)가 광범위한 대상(파일시스템 루트, 사용자 홈 디렉터리, 현재 작업 디렉터리 전체, 와일드카드 전체 매치, 저장소 루트 경로)을 가리키는 경우 | 되돌릴 방법이 없고 실수로 저장소/시스템 전체가 사라질 수 있음 |
| HARD_BLOCK | git 히스토리를 되돌리는 명령 중 작업 트리 내용까지 버리는 방식(`git reset`에 hard 플래그를 준 형태) | 커밋되지 않은 변경과 스테이징 내용이 복구 불가하게 사라짐 |
| HARD_BLOCK | `git clean`(강제 옵션 + 디렉터리 포함 옵션 + gitignore 무시 옵션을 함께 준 형태) | 추적되지 않는 파일·디렉터리를 무조건 삭제 — 스크래치패드/빌드 산출물 외의 것까지 날아갈 수 있음 |
| HARD_BLOCK | 브랜치 강제 삭제(git branch 삭제 옵션 중 대문자 D로 표기되는, 병합 여부를 무시하는 강제 형태) | 병합되지 않은 작업이 그대로 소실 |
| HARD_BLOCK | 강제 push 계열(원격 히스토리를 덮어쓰는 force 옵션, 그리고 "force-with-lease"라는 이름의 완화판도 이 저장소 정책상 동일 등급으로 취급 — 공유 브랜치를 되돌릴 수 없게 덮어쓸 위험은 동일) | 다른 세션/사람의 커밋을 원격에서 영구히 지울 수 있음 |
| HARD_BLOCK | 광범위한 checkout/restore(현재 디렉터리 전체 또는 스테이징 영역 전체를 대상으로 하는 형태, 특정 파일 지정 없이 전부를 되돌리는 형태) | 커밋되지 않은 작업 내용을 통째로 잃을 수 있음 |
| HARD_BLOCK | SQL의 DROP/TRUNCATE 계열 구문(테이블/컬럼/데이터베이스/스키마 삭제, 전체 비우기) | `checkDestructiveSql.mjs`가 이미 `.sql` 파일 Write/Edit 표면에서 차단 중인 것과 동일 원칙 — Safe Hooks v1은 이를 Bash로 직접 SQL을 실행하는 경로(예: CLI로 SQL을 파이프하는 명령)까지 확장 |
| HARD_BLOCK | `WHERE` 절이 없는 DELETE/UPDATE 구문 | 테이블 전체 행이 삭제되거나 전체 값이 덮어써짐 — `checkDestructiveSql.mjs`의 무조건부 삭제 탐지와 동일 원칙을 UPDATE까지 확장 |
| HARD_BLOCK | Supabase 프로젝트를 초기 상태로 되돌리는 리셋 명령(db reset 계열) | 프로덕션 데이터 전체 소실 위험 |
| HARD_BLOCK | 저장소 자체 또는 호스팅 플랫폼상의 프로젝트/리포지토리를 삭제하는 명령(gh repo 삭제, 클라우드 프로젝트 삭제 등) | 코드/이슈/PR 이력 전체 소실 |
| HARD_BLOCK | 비밀값을 표준출력/로그로 노출하는 명령(`.env` 파일을 그대로 읽어 출력, 키 이름을 echo, 환경변수 전체를 덤프하는 형태) | 규칙 11(PIN/자격증명) 및 일반 시크릿 보호 원칙 위반 — 로그에 한 번 남으면 회수 불가 |
| APPROVAL_REQUIRED | 일반 `git push`(강제 옵션 없이 원격 브랜치에 커밋을 올리는 형태) | 되돌릴 수는 있지만(강제 push로) 팀 공유 상태를 바꾸므로 승인 필요 |
| APPROVAL_REQUIRED | PR merge(`gh pr merge` 등) | main 반영은 되돌릴 수 있어도 배포 트리거가 될 수 있어 승인 필요 |
| APPROVAL_REQUIRED | 프로덕션 배포 명령, 프로덕션 환경변수 설정/변경 명령, 시크릿 값을 다루는 CLI 명령(값 자체를 노출하지 않아도 설정/교체 동작 자체) | 실사용 111명 이상 학생 서비스에 즉시 영향 |
| APPROVAL_REQUIRED | Supabase 마이그레이션 push, Supabase Edge Functions deploy | 규칙 8(에이전트는 DDL 직접 실행 불가)과 연결 — 배포성 동작은 자동 실행 대상이 아님 |
| APPROVAL_REQUIRED | SQL의 `ALTER` 구문, 함수 교체(`CREATE OR REPLACE FUNCTION` 등 기존 함수 정의를 바꾸는 구문) | 스키마/로직을 바꾸지만 삭제는 아님 — 검토 후 실행 |
| APPROVAL_REQUIRED | 핵심 테이블(`students`, `reward_ledger`, `dollar_ledger`, `xp_ledger`, `student_progress`, `classes`, `textbooks`, `units`, `words`, `town_purchases`, `star_purchases`)에 대한 `WHERE` 절이 있는 DELETE/UPDATE | 조건이 있어 HARD_BLOCK 대상은 아니지만, 학생 데이터/원장류 핵심 테이블이라 오조건 시 파급이 큼 |
| APPROVAL_REQUIRED | Paul Town 환영(welcome) 관련 환경변수 설정 | 학생 대상 신규 기능 게이트와 연결된 환경변수 — 규칙 12(학생 대상 신규 기능 금지 범위)와 맞닿아 있어 임의 자동 변경 금지 |
| APPROVAL_REQUIRED | 기능 플래그의 기본값을 true로 바꾸는 쓰기(코드 내 기본값 상수 변경) | 플래그 ON 전환은 실사용자에게 즉시 영향 — PROJECT_GUIDE.md/ROADMAP.md의 "권장 ON 순서"를 따라야 함 |
| APPROVAL_REQUIRED | 스크래치패드 밖 worktree를 강제로 제거하는 명령 | 다른 세션이 그 worktree를 쓰고 있을 수 있음(규칙 16, 동시 작업 파일 충돌 사고 이력) |
| SAFE | git 조회류(`status`, `log`, `diff`, `show`, `branch` 목록 조회 등 상태를 바꾸지 않는 하위 명령) | 읽기 전용 |
| SAFE | 파일 검색/읽기(Grep/Glob/Read, `find`, `cat`, `type` 등) | 읽기 전용 |
| SAFE | 테스트/빌드/린트 실행(`npm run build`, `npm run verify:*`, `npm test`, lint 계열) | 저장소 정책상(규칙 5) 오히려 매 작업 필수로 권장되는 명령 |
| SAFE | `curl`/`fetch` 류의 GET/HEAD 요청 | 서버 상태를 바꾸지 않음 |
| SAFE | `gh` CLI 조회류(이슈/PR/워크플로 목록·상세 조회, merge/삭제 등 쓰기 동작 제외) | 읽기 전용 |
| SAFE | SQL의 SELECT/EXPLAIN | 읽기 전용 — production 진단 SQL(`production_pilot_student_diagnostic.sql` 등)이 이 범주 |

**허용 삭제 대상 예외(재귀+강제 삭제라도 SAFE로 취급하는 경로):**
세션 스크래치패드 디렉터리(OS 임시 경로 하위, 이 세션 전용), 빌드 산출물
디렉터리(`dist/` 등), `scripts/.tmp/` 같은 저장소 내 명시적 임시
디렉터리, `node_modules/.cache`. 이 경로들은 매번 재생성 가능하고
저장소 상태를 구성하지 않으므로 강제 삭제해도 데이터 손실이 없다.
단, 경로 판정은 정규화된 절대경로 기준이어야 하며 와일드카드/상위
디렉터리 이동(`..`)으로 이 예외 목록을 벗어나는 경우는 예외 적용 대상이
아니다.

---

## 3. 정규화 파이프라인(우회 방어)

명령 문자열을 판정표와 대조하기 전에 아래 순서로 정규화한다. 목적은
"의미는 같지만 표기만 다른" 우회 시도를 표준형으로 접어서 같은 규칙에
걸리게 만드는 것이다.

1. **소문자화·공백 정규화**: 대소문자 혼용, 탭/여러 칸 공백, 줄바꿈을
   표준 단일 공백으로 통일.
2. **체이닝 분리**: `&&`, `||`, `;`, 파이프(`|`), 줄바꿈, 서브셸 괄호
   묶음으로 이어진 복합 명령을 개별 하위 명령으로 쪼갠 뒤 **각각을
   독립적으로 판정**(하나라도 HARD_BLOCK이면 전체가 HARD_BLOCK).
3. **중첩 셸 언래핑**: `bash -c`/`sh -c`, `cmd /c`, `powershell`/`pwsh`의
   `-Command` 인자, `-EncodedCommand`(base64로 인코딩된 UTF-16LE 문자열)로
   감싸진 내부 명령을 한 겹씩 벗겨내어 실제 실행될 문자열을 복원한 뒤
   다시 1단계부터 재적용(재귀적으로).
4. **eval/Invoke-Expression 언래핑**: 셸의 `eval`, PowerShell의
   `Invoke-Expression`(별칭 `iex`)에 전달되는 문자열 인자를 실제 명령으로
   간주해 동일하게 재귀 적용.
5. **별칭 정규화**: 도구별 동의어를 하나의 정규형으로 치환 —
   PowerShell `Remove-Item`(및 별칭 `ri`, `rmdir`, `del`, `erase`)을
   유닉스 `rm`과 동일 계열로, `Recurse`/`Force` 플래그를 재귀/강제
   플래그로, `env` 접두사나 `command` 접두사(PATH 우회 목적으로 흔히
   붙는 접두사)를 제거한 뒤 원래 명령명을 추출.
6. **`node -e` 인라인 코드 스캔**: `node -e "..."`, `node --eval "..."`
   형태로 전달된 JS 코드 문자열 안에서 `fs.rmSync`(재귀+강제 옵션),
   `child_process.exec`로 감싼 셸 명령 등 동일 패턴을 문자열 레벨로
   탐지.
7. **따옴표/이스케이프 해제**: 작은따옴표/큰따옴표/백틱, 백슬래시
   이스케이프, PowerShell의 백틱 이스케이프를 제거해 명령 토큰을
   있는 그대로 복원.
8. **파일 쓰기 내용 스캔**: Write/Edit 도구가 `.sql`/`.mjs`/`.ps1`/`.sh`
   확장자 파일에 위 1~7단계로 정규화한 내용을 쓰려는 경우, 그 파일
   *내용*에 대해서도 동일한 판정표를 적용 — **이 항목은 v2 범위**(v1은
   명령 실행 표면만 다루고, 파일에 쓰인 뒤 나중에 실행되는 간접 경로는
   6절 "알려진 한계"에 기재).

---

## 4. 종료 코드 계약과 fail-open 선택

`checkDestructiveSql.mjs`와 동일한 PreToolUse 훅 표준을 따른다.

- stdin으로 `{ tool_name, tool_input, ... }` JSON 한 덩어리를 받는다.
- **HARD_BLOCK**: exit code 2, stderr에 `APPROVAL REQUIRED`가 아닌
  차단 사유(어떤 패턴이 매칭됐는지, 왜 되돌릴 수 없는지)를 명시.
- **APPROVAL_REQUIRED**: exit code 2, stderr 메시지를 `APPROVAL REQUIRED`
  접두사로 시작해 "이 명령은 운영자 승인이 필요하다"는 사실과 판정
  근거를 명시(Claude에게 그대로 피드백되어, 운영자에게 승인을 구하도록
  유도).
- **SAFE**: exit code 0(허용), 아무 출력 없음.
- **훅 내부 오류**(stdin 파싱 실패, 타임아웃, 예상 못한 예외 등)는
  **fail-open으로 exit 0 허용 + stderr에 경고 로그**를 남긴다.
  `checkDestructiveSql.mjs`와 동일한 선택.

**트레이드오프**: fail-open은 "훅이 고장 나면 정상 작업까지 막는다"는
가용성 리스크를 없애지만, 반대로 "훅 내부 버그를 악용/우연히 유발하면
HARD_BLOCK 대상 명령이 그대로 통과한다"는 안전성 리스크를 남긴다. 이
저장소는 `checkDestructiveSql.mjs`에서 이미 이 트레이드오프를
fail-open 쪽으로 선택했고(주석에 명시), Safe Hooks v1도 일관성을 위해
동일 선택을 유지한다. 단, 이 선택 때문에 **정규화 파이프라인 자체의
정확성(3절)이 실질적인 유일 방어선**이 된다는 점을 설계상 명시적으로
인지해야 한다 — 파싱 실패를 노려 판정을 우회하는 입력이 있다면, 그건
fail-open 트레이드오프가 아니라 정규화 로직의 결함으로 다뤄야 한다.

---

## 5. 테스트 설계(우회 매트릭스)

정규화 파이프라인의 각 단계별로 양성(차단/승인 요구되어야 함)과 음성
(허용되어야 함) 케이스를 구성한다. 예상 단언 수는 약 120개.

- **소문자화·공백 정규화 단계**: 명령 키워드를 대문자/혼합 대소문자로
  쓴 경우, 여러 칸 공백·탭·줄바꿈으로 인자를 띄운 경우 각각 HARD_BLOCK
  대상이면 여전히 HARD_BLOCK으로 판정되는지(양성) / 무관한 SAFE
  명령이 대소문자만 바뀌어도 계속 SAFE인지(음성).
- **체이닝 분리 단계**: SAFE 명령 뒤에 `&&`로 HARD_BLOCK 명령을 이어
  붙인 경우 전체가 차단되는지, 파이프로 연결한 경우, 세미콜론으로
  구분한 여러 문장 중 마지막에만 위험 명령이 있는 경우, 줄바꿈으로
  분리된 멀티라인 스크립트인 경우 각각 확인.
- **중첩 셸 언래핑 단계**: `bash -c`/`sh -c`로 감싼 위험 명령,
  `cmd /c`로 감싼 경우, `powershell -Command`로 감싼 경우,
  `-EncodedCommand`에 base64로 인코딩한 위험 명령을 넣은 경우(정상
  디코드 후 탐지되는지), 이중으로 감싼 경우(셸 안에 셸)를 각각 양성/
  음성 세트로.
- **eval 언래핑 단계**: 셸 `eval`에 변수로 조립한 위험 명령 문자열을
  전달하는 경우, PowerShell `Invoke-Expression`/`iex`에 동일 패턴을
  전달하는 경우.
- **별칭 정규화 단계**: `Remove-Item`을 재귀+강제 플래그와 함께 쓴
  경우, 별칭(`ri`, `rmdir`, `del`)만 바꿔 쓴 경우, `env`/`command`
  접두사를 붙여 원래 명령명을 흐린 경우 — 전부 원래 판정과 동일하게
  귀결되는지.
- **`node -e` 인라인 스캔 단계**: `fs.rmSync`를 재귀+강제 옵션과 함께
  인라인 코드로 실행하는 경우, 단순 파일 읽기만 하는 무해한 인라인
  코드인 경우(음성).
- **따옴표/이스케이프 해제 단계**: 위험 명령의 각 토큰을 따옴표로
  쪼개거나 백슬래시로 이스케이프해 원형을 흐린 경우.
- **경계 조건**: 허용 삭제 대상 예외 경로(스크래치패드, `dist/`,
  `scripts/.tmp/`, `node_modules/.cache`)에 대한 재귀+강제 삭제는
  SAFE로 판정되는지(양성 예외), 반대로 그 경로처럼 보이지만 상위
  디렉터리 이동(`..`)으로 실제로는 벗어나는 경로는 여전히 HARD_BLOCK
  또는 APPROVAL_REQUIRED로 판정되는지(음성 — 예외 오남용 방지).
- **통합 테스트**: stdin으로 들어오는 JSON 페이로드 형태 그대로 6개
  케이스(HARD_BLOCK 2종, APPROVAL_REQUIRED 2종, SAFE 1종, 훅 내부
  오류를 유발하는 깨진 JSON 입력 1종 — fail-open 확인용)를 구성해
  종료 코드와 stderr 메시지 접두사(`APPROVAL REQUIRED` 유무)까지
  검증한다.

---

## 6. 알려진 한계

- **임의 네트워크 POST**: curl/fetch로 외부에 데이터를 전송하는 POST
  요청 자체는 이 설계의 판정표에 없다(SAFE 항목은 GET/HEAD만 명시).
  시크릿 유출을 막는 HARD_BLOCK 규칙과 별개로, 임의 목적지로의 POST를
  전부 승인 대상으로 걸면 정상적인 API 테스트 워크플로까지 막힐 수
  있어 v1은 이를 보류하고 "알려진 미다룸 영역"으로만 남긴다.
- **base64 이외의 난독화**: hex 인코딩, URL 인코딩, 사용자 정의 문자열
  치환/역순 조합 등 base64가 아닌 인코딩으로 명령을 숨기는 경우는
  3절 정규화 파이프라인이 다루지 않는다.
- **디스크에 쓴 뒤 나중에 실행하는 간접 실행**: 이번 도구 호출에서는
  단순히 스크립트 파일을 Write/Edit로 생성만 하고, 실행은 별도의 이후
  도구 호출(다른 세션/다음 턴)에서 이뤄지는 경우 — 파일 생성 시점의
  PreToolUse 훅이 Write/Edit 대상 파일의 *내용*까지 스캔해야 잡을 수
  있다(3절 8단계, v2 범위로 명시). v1은 이 경로를 커버하지 않는다.
- **별칭 함수 정의 후 호출**: 셸 함수나 PowerShell 함수로 위험 명령을
  감싸 이름을 새로 정의한 뒤(`function 안전한이름 { 실제위험명령 }`)
  그 새 이름으로 호출하는 경우, 정의 시점과 호출 시점이 서로 다른 도구
  호출로 나뉘면 5절의 정규화 파이프라인이 두 시점을 연결하지 못한다.

---

## 7. BLOCKED 기록

**2026-09-12, 이 문서를 낳은 6시간 자율 세션에서 `safeCommandGuard.mjs`
구현이 실제로 시도됐으나 머신 레벨 플러그인 훅에 의해 차단됨.**

- 차단 주체: 이 머신에 설치된 `vibe-claude`의 `destructive-command-gate`
  플러그인, `pre_tool_use` 단계에서 개입.
- 차단 사유: 판정 로직(탐지기) 자체와 그 테스트 코드가 "탐지 대상으로
  삼는 문자열"을 소스에 그대로 담아야 하는데(예: 어떤 명령이 위험한지
  정규식으로 표현하려면 그 명령의 리터럴 형태가 소스 어딘가에 있어야
  함), 이 리터럴 존재 자체가 상위 플러그인 게이트의 오탐 대상이 되어
  **Write 도구 호출이 2회 거부됨**.
- 우회 시도 결과: Auto-Mode Bypass 분류기가 개입해 "우회 시도를
  중단하라"는 지시를 내림 — 즉 문자열을 쪼개거나 인코딩해서 게이트를
  피해 가는 방식(참고: `checkDestructiveSql.mjs`가 `DROP`을 `['DR',
  'OP'].join('')`로 조립해 이미 이런 방식을 실사용 중임)을 이 세션에서
  추가로 시도하는 것은 금지 지시로 중단됨.
- **결정 필요 옵션**(운영자 판단 대기):
  - (a) 운영자가 직접 `safeCommandGuard.mjs` 본체와 테스트를 작성/
    결재한다(에이전트가 아닌 사람이 리터럴을 담은 파일을 만드는 경로는
    플러그인 게이트의 검사 주체가 다를 수 있음 — 확인 필요).
  - (b) 이 문서의 판정표(2절)를 코드가 아닌 별도 **데이터 포맷**(예:
    JSON/YAML 규칙 파일)으로 분리하고, 그 데이터 파일은 플러그인
    게이트가 예외 처리하도록 먼저 게이트 쪽 설정을 조정한다 — 단, 이
    조정 자체가 이 저장소 밖의 시스템 변경이라 이 세션 권한 밖일 수
    있음.
  - (c) 범위를 축소해, 이미 존재하는 `checkDestructiveSql.mjs`처럼
    "명사 뒤에 동사를 붙이는 순서로 조립"하는 문자열 구성 기법을 운영자
    승인 하에 명시적으로 채택한다.
- **안전 기본값**: 위 결정이 나기 전까지 `safeCommandGuard.mjs`는
  **미구현 상태를 유지**하고, 이 설계 문서만 존재한다. 즉 현재 이
  저장소에서 Bash/PowerShell 명령에 대한 3단 판정은 **훅으로 강제되지
  않는다** — 8절 참고.

---

## 8. 활성화/롤백 절차 및 CLAUDE.md 규칙 18 정직성

**활성화 절차(구현 완료 후를 가정한 프로즈 설명):**
`safeCommandGuard.mjs`가 작성되면, `.claude/settings.json`의
`PreToolUse` 훅 목록에 Bash 도구와 PowerShell 실행에 해당하는 매처(그리고
필요 시 Write/Edit 매처)를 추가하고, 그 매처에 연결되는 실행 대상을
`node scripts/hooks/safeCommandGuard.mjs`로 지정한다. 훅은 exit code
0이면 허용, exit code 2면 거부(그리고 APPROVAL_REQUIRED 판정일 때는
stderr 메시지가 `APPROVAL REQUIRED`로 시작해 사람이 보고 승인 여부를
판단할 수 있게 함)로 동작한다. 이 설정 변경(`.claude/settings.json`
수정)은 코드/설정 파일이므로 docs-maintainer가 아니라 implementer
영역이며, 실제 배선 작업은 이 문서 범위 밖이다.

**롤백 절차**: `.claude/settings.json`에서 해당 `PreToolUse` 매처
항목만 제거하면 즉시 비활성화된다. 스크립트 파일
(`scripts/hooks/safeCommandGuard.mjs`) 자체는 남겨둬도 무해하다(훅
등록에서 빠지면 호출되지 않음). `checkDestructiveSql.mjs` 등 기존
훅에는 영향 없음(독립된 매처).

**CLAUDE.md 규칙 18 정직성**: 이 저장소는 "훅으로 실제 강제되는 것"과
"문서로만 강제되는 것"을 구분해 정직하게 기록해야 한다(규칙 18). 현재
시점(2026-09-12) 기준으로:

- **훅으로 실제 강제되는 것**: `.sql` 파일에 대한 Write/Edit 시점의
  파괴적 SQL 패턴 차단(`checkDestructiveSql.mjs`, `.claude/settings.json`에
  이미 등록·동작 중).
- **문서로만 강제되는 것(이 설계 문서의 판정표 전체)**: Bash/PowerShell
  명령에 대한 HARD_BLOCK/APPROVAL_REQUIRED/SAFE 3단 판정은 **아직 훅으로
  구현/등록되지 않았다**. 즉 이 문서의 2절 판정표는 현재 "사람/에이전트가
  스스로 지켜야 하는 프로세스 규칙"일 뿐, 어떤 위험 명령을 실행하려 해도
  기술적으로 막아주는 장치는 없다. 이 사실을 "훅이 이미 막아준다"처럼
  과장해서 다른 문서(handoff.md 등)에 적지 않는다 — 7절 BLOCKED 상태가
  해소되어 실제 구현·등록이 끝난 뒤에만 "훅으로 강제됨"으로 격상해
  기록한다.
