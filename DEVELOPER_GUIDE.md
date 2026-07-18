# DEVELOPER_GUIDE.md — Paul Easy Voca 개발 규칙

_작성: 2026-07-18. 발명한 규칙이 아니라 이 저장소가 실제로 지켜온 패턴을 코드/커밋/`handoff.md`에서 역추출한 것입니다. 각 항목에 근거 파일을 표시했습니다._

## Development Rules (이 저장소의 최상위 원칙)

1. **안정성 최우선 — 기존 기능을 절대 깨뜨리지 않는다.** `ROADMAP.md` 작업 원칙 1번, 그리고 거의 모든 `supabase_*.sql` 상단 주석의 "이 SQL을 실행하지 않아도 앱은 절대 깨지지 않습니다" 문구가 이 원칙의 실천.
2. **한 번에 하나씩, 작업 단위로 커밋.** 큰 리팩터링(예: v1.6 identity 전환)도 파일/기능 단위로 나눠 진행.
3. **매 작업마다 build → 오류 확인 → 기능 테스트.** 커밋 전 `npm run build` 통과가 사실상 필수 게이트로 반복 사용됨.
4. **새 기능보다 기존 버그 수정이 우선.**
5. **외부 의존성 최소화.** 이미 있는 라이브러리로 해결 가능하면 새 패키지를 추가하지 않는다 — PIN 해싱을 `bcrypt` 등 대신 Node 내장 `crypto`(scrypt)로 직접 구현한 것이 대표 사례(`api/_pinAuth.js` 주석에 "외부 의존성 최소화... 표준 정책"으로 명시).
6. **AI 비용이 드는 기능은 무료 대안을 먼저 찾는다.** 학부모 주간 리포트는 실제 AI 호출 없이 규칙 기반 템플릿(`utils/weeklyReport.js`)으로 "AI처럼 보이게" 구현된 것이 이 원칙의 실례.

## Coding Standards / Naming Convention

| 대상 | 관례 | 예시 |
|---|---|---|
| React 컴포넌트 파일 | PascalCase, 컴포넌트당 1파일(화면급 컴포넌트) | `WordDetail.jsx`, `AdminScreen.jsx` |
| 훅 | `use` 접두 camelCase, `src/hooks/` | `useStudent.js`, `useMicReady.js` |
| 유틸/데이터 계층 함수 | camelCase, 동사+명사 | `refreshWordLibrary()`, `syncStudentProgress()`, `getStudentUnitId()` |
| Supabase 서버리스 함수 | kebab-case = URL 경로 그대로(Vercel 관례) | `api/verify-student-pin.js` → `POST /api/verify-student-pin` |
| 서버리스 공용 헬퍼(라우트 아님) | `_` 접두 — Vercel이 라우트로 인식하지 않게 하는 관례 | `api/_pinAuth.js` |
| 테스트 스크립트 | `test` + PascalCase 시나리오명, `.mjs` | `testMultiTabRace.mjs`, `testClassDeleteCascade.mjs` |
| 번들 빌드 스크립트 | `build` + 대상 + `Bundle.mjs` | `buildProgressBundle.mjs`, `buildWordLibBundle.mjs` |
| 1회성 운영 스크립트 | `ops` 접두 | `opsSetAllClassesMixed.mjs`(DML, 코드 배포로 다룸 — SQL 아님) |
| SQL 마이그레이션 파일 | `supabase_v{major}_{minor}[_{patch}]_{설명}.sql` | `supabase_v2_1_student_unit_decouple.sql` |
| QA/테스트용 라이브 DB 데이터 | `QA_` 접두 — 실제 학생 데이터와 구분, 정리 로직 필수 | `testMultiDeviceMerge.mjs`, `testClassDeleteCascade.mjs` |

## Component Rules

- **학생이 매일 쓰는 메인 번들에 관리자/학부모/입실시험 전용 코드를 절대 정적 import로 얹지 않는다.** `AdminScreen`(xlsx 포함), `ParentScreen`, `EntranceTest`는 `App.jsx`에서 `React.lazy()`로 분리 — "매일 앱을 여는 학생 전원이 한 번도 안 쓸 관리자 코드를 매번 다운로드"하던 실제 성능 문제(879KB→484KB)의 수정 사례가 근거(`App.jsx` 주석, `ROADMAP.md` v1.5.1 밤 5차).
- **에러 경계(`AppErrorBoundary`)로 전체 화면을 감싼다.** 프로덕션에서는 내부 에러 메시지를 학생에게 그대로 노출하지 않고(`import.meta.env.DEV`일 때만 표시), 진단 정보(PIN 제외)는 콘솔에만 남긴다. "로그아웃 후 다시 시작"(세션 정리 후 강제 리로드)과 "그냥 다시 시도"(state만 리셋) 두 가지 복구 경로를 항상 제공한다.
- **화면 전환은 문자열 state 스위치(`screen`)로, 별도 라우터 라이브러리 없이 처리한다.** 새 화면을 추가할 때 기존 패턴(`{screen === 'xxx' && <Component .../>}`)을 따를 것 — 다른 라우팅 방식을 섞지 않는다.
- **스텝형 화면(단어 학습 등)은 모드별 스텝 배열을 순수 함수로 조립한다.** `WordDetail.jsx`의 `buildSteps(mode, hasExample, spellingAllowed)` 패턴 — 분기 로직을 컴포넌트 JSX 안에 흩어놓지 않는다.

## Hook Rules

- **훅 호출 순서 규칙을 조건부 return보다 우선한다.** `App.jsx`의 `AppInner`는 `if (!studentData.restoreChecked) return <로딩화면>`을 **반드시 모든 훅 호출 뒤에** 배치한다(코드 주석에 "반드시 위의 모든 훅 호출 뒤에 있어야 함 — 훅 순서 규칙"으로 명시). 새 조건부 early-return을 추가할 때 이 순서를 절대 어기지 말 것.
- **학생 진행도 관련 새 필드는 `useStudent.js`의 단일 저장소(`STORE_KEY`)에 추가한다.** 별도 `localStorage` 키를 새로 만들지 않는다 — 예전에 흩어진 키(`paulEasyVoca_{name}_{field}`) 때문에 화면마다 다른 숫자를 보여주던 실제 버그가 이 규칙의 근거(`ROADMAP.md` v1.0 안정화 섹션).
- **localStorage 쓰기 실패(QuotaExceededError 등)는 절대 throw하지 않고 삼킨다.** `saveStore()`가 `setState` updater 안에서 호출되므로, 여기서 throw하면 렌더 중 예외로 앱 전체가 크래시한다(2026-07-16 P7 감사 수정) — 새로운 localStorage 쓰기 경로를 추가할 때 이 방어를 유지할 것.
- **취소 가능한 비동기 반복 작업은 반드시 cleanup에서 취소한다.** React StrictMode의 개발 모드 effect 이중 실행이 실제로 "반복재생 겹침(에코)" 프로덕션 버그를 낸 적이 있음 — 이후 `speech.js`의 `playRepeating()`처럼 정리 함수를 반환하는 공용 함수로만 반복 작업을 만든다.

## Database Rules

- **에이전트/CI는 Supabase에 DDL을 직접 실행할 수 없다(anon key만 사용).** 새 테이블/컬럼이 필요하면 `supabase_v{n}_{설명}.sql` 파일만 준비하고, 운영자가 Supabase 대시보드 SQL Editor에서 수동 실행한다.
- **모든 마이그레이션은 코드보다 먼저 실행되든 나중에 실행되든 안전해야 한다.** 클라이언트 코드는 새 컬럼/테이블 조회 실패를 감지해 기존 폴백 값으로 동작해야 한다(예: `wordLibrary.js`의 `getClassSettings()`가 `spelling_test_enabled` 부재 시 전부 꺼짐으로 폴백, `spelling_direction` 부재 시 `'kr2en'` 폴백). "코드 먼저 배포 vs SQL 먼저 실행" 순서를 걱정하지 않아도 되게 만드는 것이 설계 목표다.
- **모든 마이그레이션은 멱등(`if not exists` 계열)이어야 한다.** 여러 번 실행해도 안전해야 하며, 컬럼 타입은 하드코딩하지 않고 `information_schema.columns`를 조회해 기존 FK 대상 컬럼 타입에 맞춘다(`student_progress`/`word_status` 도입 시 패턴).
- **`students` 테이블에 새 컬럼을 추가하면 GRANT를 반드시 함께 실행한다.** v1.9로 테이블 단위 SELECT/UPDATE가 회수된 상태라, `grant select (새컬럼) on public.students to anon, authenticated;`(쓰기가 필요하면 `update`도)를 빠뜨리면 그 컬럼뿐 아니라 관련 조회 전체가 fail-closed로 깨질 수 있다. 상세는 `DATABASE.md`.
- **PIN 관련 컬럼(`pin_hash`/`pin_fail_count`/`pin_locked_until`/`pin_setup_allowed`)은 클라이언트 코드가 절대 SELECT하지 않는다.** DB 컬럼권한으로도 막혀 있지만(v1.9), 코드 레벨에서도 이 4컬럼을 조회하는 새 코드를 작성하지 않는다 — PIN 관련 로직은 전부 `api/*.js`(서버리스, service_role)로만 처리한다.
- **DML(데이터 값 일괄 변경)은 SQL 파일이 아니라 `scripts/ops*.mjs`로 코드 배포와 함께 처리한다.** 스키마 변경(컬럼 default 등)과 기존 행 값 일괄 변경을 분리 — `supabase_v2_0_1_...sql`(신규 반의 컬럼 default만 변경)과 `scripts/opsSetAllClassesMixed.mjs`(기존 행 값 일괄 변경)가 실제 분리 사례.

## Migration Rules

- 파일명에 버전을 명시하고(`v{major}_{minor}[_{patch}]`), 실행 순서는 `DATABASE.md`의 "마이그레이션 실행 순서" 표를 따른다.
- 파일 상단 주석에 최소한 다음을 명시한다: ①무엇을·왜 바꾸는지 ②안전 설계(멱등/기존 데이터 불변 여부) ③이 SQL을 실행하지 않아도 앱이 깨지지 않는지 여부와 그 이유 ④실행 후 검증 쿼리(가능하면).
- 컬럼/테이블 삭제(DROP)는 이 저장소 전체에서 한 번도 쓰인 적이 없다 — 하위호환 컬럼(`unit_name` 등)은 새 컬럼 도입 후에도 삭제하지 않고 남겨둔다("제거는 추후 별도 결정"으로 명시적으로 미룸).

## Testing Rules

상세 카테고리/실행법은 `TESTING.md` 참고. 핵심 규칙만 요약:

- **테스트는 반드시 실제 소스를 esbuild로 번들해서 실행한다 — 로직을 손으로 베껴 테스트 파일에 재구현하지 않는다.** `scripts/build*Bundle.mjs`가 `src/hooks/useStudent.js` 등을 실제로 번들하고, `test*.mjs`는 그 번들을 import해서 검증한다(react/wordLibrary 등 브라우저·네트워크 의존성만 스텁으로 교체). 이렇게 해야 "테스트가 통과하는데 실제 버그가 남아있는" 괴리가 생기지 않는다.
- **라이브 Supabase에 대한 e2e 테스트는 `QA_` 접두 데이터만 만들고 반드시 정리(cleanup)한다.** 프로덕션 학생 데이터(111명)는 절대 건드리지 않는다.
- **회귀가 의심되면 수정 전 코드로 되돌려 같은 테스트가 실제로 FAIL하는지 먼저 확인한다("테스트 자체의 유효성 검증").** 2026-07-18 세대 카운터(`syncGenRef`) 수정 시 이 패턴이 실제로 쓰였다(가드를 임시 무력화 → FAIL 재현 확인 → 복구 → PASS 확인).

## Deployment Checklist

1. `npm run build` 통과 확인(에러/경고 확인).
2. 변경이 DB 스키마를 요구하면 `supabase_v{n}_*.sql` 파일 준비(코드와 별도 배포 트랙 — 운영자가 수동 실행).
3. `git push`(main) → Vercel 자동 배포.
4. **번들 해시 대조로 실제 배포 확인.** 로컬 `dist/assets/*.js` 해시 파일명과 라이브 사이트가 서빙하는 파일명을 대조하고, 이번 변경에서만 생기는 고유 문자열(신규 UI 라벨/함수명)이 포함돼 있는지 확인 — "push는 했지만 배포가 아직 반영 안 됨"을 로그가 아니라 실제 서빙 코드로 확정하는 이 저장소의 반복 습관.
5. SQL이 필요한 변경이면 운영자에게 실행을 요청하고, 실행 전에는 반드시 폴백 동작(3번 항목)이 실제로 안전한지 재확인.

## Code Review Checklist

- 학생 식별에 이름을 쓰지 않고 `students.id`를 쓰는가?
- 새 localStorage 키를 만들지 않고 기존 통합 저장소(`paul_easy_progress`)를 확장했는가?
- 관리자/학부모/시험 전용 무거운 코드가 학생 메인 번들에 정적 import로 섞여 들어가지 않는가?
- 조건부 early-return이 모든 훅 호출 뒤에 있는가(Hook 규칙 위반 없는가)?
- 새 Supabase 컬럼/테이블에 대해 클라이언트가 부재 시 폴백하는가(컬럼 없어도 안 깨지는가)?
- `students`의 PIN 4컬럼을 클라이언트가 조회/노출하지 않는가?
- 파괴적 관리자 액션(삭제/초기화/일괄발급)이 요청마다 서버에서 재인증되는가(`checkAdminReauth` 패턴)?
- 외부 라이브러리를 새로 추가하지 않고 기존 것/Node 내장으로 해결했는가? (필요하다면 왜 예외인지 명시)

## Security Checklist

- PIN(관리자/학생 모두)이 어떤 형태로도 로그에 남지 않는가(`AppErrorBoundary`가 studentId만 로깅하고 PIN은 절대 안 남기는 것이 명시적 규칙).
- PIN 검증이 클라이언트가 아니라 서버(`api/*.js`, `_pinAuth.js`)에서만 이뤄지는가.
- 새로 추가하는 `students` 컬럼이 민감정보라면 v1.9 패턴대로 컬럼권한에서 anon/authenticated를 명시적으로 제외했는가.
- 관리자 재인증(`checkAdminReauth`)이 클라이언트의 `authed` state만으로 우회 가능한 구조가 아닌가.
- 새 anon 전체허용(`allow anon all`) RLS 정책을 추가하기 전에 그 테이블이 정말 "학생 이름/PIN만으로 동작하는 이 앱의 신뢰 모델"에 맞는지(민감 데이터가 없는지) 확인했는가.

## Performance Checklist

- 관리자/학부모/시험 전용 화면이 `React.lazy`로 분리돼 있는가.
- `visibilitychange`/`focus` 등 여러 이벤트가 겹쳐 발생할 수 있는 리스너에 `inFlight`류 중복 방지 가드가 있는가(모바일에서 두 이벤트가 거의 동시에 발생해 API를 중복 호출하던 실제 사례 근거).
- 클라우드 동기화처럼 빈번히 트리거되는 쓰기가 디바운스돼 있고, 겹쳐 실행될 때 오래된 호출이 최신 결과를 덮어쓰지 않도록 세대/순서 가드가 있는가(`syncGenRef` 패턴).

## 관련 파일

`C:\voca\src\App.jsx`, `C:\voca\src\hooks\useStudent.js`, `C:\voca\src\utils\wordLibrary.js`, `C:\voca\api\_pinAuth.js`, `C:\voca\scripts\` 전체, `C:\voca\supabase_v1_9_security_rls.sql`

---

## AI 세션 표준 워크플로우

_추가: 2026-07-18(개발자 인프라 구축 세션, Phase 3), **2026-07-18 갱신**
(AI 개발 운영체제 구축 세션, Phase 6 — 6단계를 13단계로 확장/정합화).
이 갱신은 append가 아니라 **이 섹션 자체를 새 버전으로 교체**한
의도적 예외입니다(`CLAUDE.md` 규칙 13 — append 원칙의 명시적 예외는
"저장소 헌법" 섹션과 이 워크플로우 섹션뿐). 6단계 원본이 다루던 내용은
전부 아래 13단계 안에 그대로 흡수돼 있습니다 — 삭제된 지침 없음, 정보
손실 없이 재정렬 + `.claude/agents/`/`.ai-status/`/`PROJECT_BOARD.md`
연동만 추가됨._

새 AI 세션(사람이든 에이전트든)이 이 저장소에서 작업할 때 따라야 하는
13단계. 역할별로 나눠 작업할 때는 괄호 안 역할 에이전트(`.claude/agents/`)
를 참고 — 한 세션이 여러 역할을 겸해도 무방합니다(1인 조직 전제).

1. **보드 확인** — `PROJECT_BOARD.md`에서 작업할 카드를 고르거나(기존
   BACKLOG/NEXT 카드) 새 요청이면 새 카드를 만든다. 착수 시 카드를
   `IN_PROGRESS`로 옮긴다.
2. **완료 여부 재확인** — `ROADMAP.md`/`handoff.md`에서 이미 완료된
   작업이 아닌지 확인한다(`CLAUDE.md` 규칙 3 — 재구현 금지). 이미
   완료됐으면 여기서 중단하고 그 사실만 보고.
3. **동시 작업 확인** — `git log`/`git status`로 다른 세션이 같은 파일을
   건드리고 있지 않은지 확인한다(`CLAUDE.md` 규칙 16 — 파일당 소유자
   1명). 겹치면 그 파일은 읽기만 하고 손대지 않는다.
4. **문서 읽기** (`planner` 역할) — 작업 범위에 맞는 문서만 골라 읽는다
   (전부 다 읽을 필요 없음). 최소한 `PROJECT_GUIDE.md`(헷갈리는 것
   Top 5)는 항상 먼저 읽는다.
   ```
   PROJECT_GUIDE.md          # 항상
   ARCHITECTURE.md           # 화면/데이터 흐름을 건드릴 때
   DATABASE.md                # 테이블/컬럼/RLS를 건드릴 때
   TESTING.md                  # 새 테스트를 작성하거나 verify 실패를 조사할 때
   handoff.md 상단 몇 섹션      # "왜 이렇게 돼있지"가 궁금할 때만 검색
   ```
5. **계획 수립** (`planner` 역할) — 영향 범위/위험/작업 단위를
   `.ai-status/`에 `status: planning`으로 기록하고, `implementer`에게
   넘길 handoff 텍스트를 작성한다(1인 세션이면 이 단계는 암묵적으로
   통과해도 무방하되, 계획 없이 바로 구현에 들어가지 않는다).
6. **기능 구현** (`implementer` 역할) — `Development Rules`/`Coding
   Standards`/`Component Rules`/`Hook Rules`/`Database Rules`(이 문서
   위 섹션들) 준수. 새 파일은 `Naming Convention` 표를 따른다. 착수 시
   `.ai-status`를 `status: working`으로 갱신.
7. **관련 verify 하네스 실행** — 건드린 영역에 해당하는 도메인만 우선
   실행(전체는 마지막에 한 번):
   ```
   npm run verify:login            # PIN/로그인 로직을 건드렸을 때
   npm run verify:persistence      # useStudent.js/동기화/병합을 건드렸을 때
   npm run verify:unit             # 유닛 전환/이어하기를 건드렸을 때
   npm run verify:writing          # 쓰기시험/스펠링 채점을 건드렸을 때
   npm run verify:homework         # daily_assignments/숙제완료 판정을 건드렸을 때
   npm run verify:admin            # 관리자 화면/대시보드/반 설정을 건드렸을 때
   ...                              # 전체 목록은 package.json scripts 또는 tests/harness/registry.mjs
   npm run verify:all              # 최종적으로 전체 회귀 확인(SKIP 도메인 제외 전부 PASS 필수)
   ```
   `speaking`/`listening`은 headless 환경 특성상 항상 SKIP으로
   출력된다(정상) — 이 두 도메인을 건드렸다면 코드 리뷰 + 실기기 확인을
   별도로 명시할 것(`TESTING.md` 참고). `.claude/settings.json`의
   `suggestVerifyDomain.mjs` PostToolUse 훅이 건드린 파일에 맞는 도메인을
   힌트로 제안하지만(비차단, advisory), 실제 실행은 이 단계에서 사람/
   에이전트가 직접 한다 — 훅이 대신 실행해주지 않는다(`CLAUDE.md`
   규칙 18).
8. **실패 수정** — 하네스가 FAIL을 보고하면 표준 출력(PASS/FAIL, 실패
   위치 `파일:스크립트`, stdout tail)을 그대로 근거로 삼는다. 회귀가
   의심되면 `Testing Rules`의 "수정 전 코드로 되돌려 FAIL 재현 확인"
   패턴을 따른다(`CLAUDE.md` 규칙 15). 같은 문제로 3회 연속 실패하면
   구현을 중단하고 설계를 재검토한다(무한 재시도 금지).
9. **최종 build 확인** — `npm run build` 통과(에러/신규 경고 없음)를
   확인하고 커밋을 준비한다. 파일/기능 단위 소커밋(`Development Rules`
   2번, `CLAUDE.md` 규칙 14) — 자신이 소유하지 않은 파일은 커밋 범위에
   넣지 않는다. 카드를 `VERIFY`로 옮긴다.
10. **검수** (`qa-reviewer` 역할) — build/verify를 독립적으로 재실행해
    `DEVELOPER_GUIDE.md` Code Review Checklist와 대조한다. implementer의
    보고를 재실행 없이 신뢰하지 않는다(evidence 기반 PASS/NEEDS-WORK).
11. **보안 감사** (`security-reviewer` 역할, 인증/DB 권한/클라이언트
    신뢰 경계를 건드린 경우만) — `Security Checklist` 대조 + 필요 시
    anon key 읽기 전용 실측.
12. **문서 갱신** (`docs-maintainer` 역할) — 아래 "아키텍처 변경 시 문서
    갱신 규칙" 표를 참고해 관련 문서에 **append**한다(이 워크플로우
    섹션과 `CLAUDE.md` 헌법 섹션을 제외하면 덮어쓰기 금지). `handoff.md`
    최상단에 새 세션 섹션을 삽입.
13. **보드/상태 마감** — `PROJECT_BOARD.md` 카드를 `DONE`(또는
    `BLOCKED`)으로 이동하고, `.ai-status`를 `status: completed`(또는
    `blocked`/`failed`)로 갱신. 변경 파일 목록 + 실행한 verify 도메인 +
    PASS/FAIL/SKIP 요약을 커밋 메시지/handoff 기록에 포함.

### "새 작업 시작" 재사용 가능한 지시문 템플릿

새 세션(사람이 에이전트에게 새 작업을 시킬 때)에 그대로 복사해 쓰는 짧은
템플릿 — 위 13단계를 세션이 스스로 따르게 만드는 트리거 문구:

```
[작업 요청]
<한 줄 목표>

PROJECT_BOARD.md에서 관련 카드를 확인하고(없으면 새로 만들고)
IN_PROGRESS로 옮긴 뒤, CLAUDE.md 18개 규칙 + DEVELOPER_GUIDE.md의
"AI 세션 표준 워크플로우" 13단계를 그대로 따라 진행해줘. 특히:
- 이미 완료된 작업인지 handoff.md/ROADMAP.md로 먼저 확인 (규칙 3)
- 학생 식별은 UUID만 사용 (규칙 4)
- 동시 작업 중인 파일은 건드리지 말 것 (규칙 16)
- 관련 npm run verify:<domain> 실행까지 마치고 handoff.md에 append
- 완료/부분/차단 여부와 다음 추천 작업을 마지막에 요약
```

## 아키텍처 변경 시 문서 갱신 규칙

**전부 append만 — 기존 문서 내용을 덮어쓰거나 삭제하지 않는다.** 어떤 변경이 어떤 문서를 건드려야 하는지 매핑:

| 변경 종류 | 갱신할 문서 | 비고 |
|---|---|---|
| 새 Supabase 테이블/컬럼 추가 | `DATABASE.md`(테이블/컬럼/마이그레이션 표에 append) + `handoff.md`(세션 기록) | `students` 신규 컬럼이면 GRANT 필요 여부도 명시(`Database Rules` 참고) |
| 새 화면/컴포넌트 추가 | `ARCHITECTURE.md`(폴더 구조 표 + 관련 플로우 섹션에 append) | 학생 메인 번들에 영향 있으면 `React.lazy` 여부도 기록 |
| 새 훅 추가 | `ARCHITECTURE.md`(상태관리 섹션) + `DEVELOPER_GUIDE.md`(Hook Rules에 새 규칙이 생겼다면 append) | |
| 새 API(`api/*.js`) 서버리스 함수 추가 | `ARCHITECTURE.md`(인증 흐름 섹션, 해당되면) + `DEVELOPER_GUIDE.md`(Security Checklist에 새 항목 필요 시 append) | 파괴적 액션이면 `checkAdminReauth` 패턴 준수 여부 명시 |
| 새 테스트 스크립트(`scripts/testX.mjs`) 추가 | `TESTING.md`(카테고리 표에 행 추가) + `tests/harness/registry.mjs`(해당 도메인 `checks` 배열에 추가) | 새 빌드 스크립트가 필요하면 `BUILDERS`에도 추가 |
| 새 도메인(기존 13개 밖) 기능 추가 | `tests/harness/registry.mjs`(새 `DOMAINS` 항목) + `package.json`(`verify:신규도메인` 스크립트) + `TESTING.md` | 커버할 스크립트가 없으면 정직한 SKIP 사유 명시(가짜 PASS 금지) |
| 로드맵/버전 완료 | `ROADMAP.md`(버전 섹션 append, 기존 v1.x 이하 섹션 원본 유지) + `handoff.md`(세션 상세 기록) | |
| 개발 규칙/체크리스트 변경 | `DEVELOPER_GUIDE.md`(해당 섹션에 append, 새 규칙이 왜 생겼는지 근거 파일/사례 명시) | |
| 헷갈리기 쉬운 새 함정 발견 | `PROJECT_GUIDE.md`("자주 헷갈리는 것" 목록에 append, Top 5 번호를 새로 매기지 않고 6번부터 이어감) | |

세션 종료 시 `handoff.md` 최상단에 한 섹션 추가(기존 세션들 위에, 아래로 밀어내지 않고 새로 삽입)하는 것이 이 저장소의 표준 마감 절차 — 위 표의 각 문서 갱신도 이 handoff 기록에서 링크/요약된다.

---

## AI 개발 운영체제 사용 안내

_추가: 2026-07-18(AI 개발 운영체제 구축 세션, Phase 8). `CLAUDE.md`(18개
규칙) + `.claude/agents/*.md`(역할 5개) + `.ai-status/` + `.claude/
settings.json`(훅) + `PROJECT_BOARD.md`를 실제로 어떻게 쓰는지에 대한
요약. 각 구성요소의 상세는 해당 파일 자체가 원본이고, 여기는 진입점
역할만 한다._

### 에이전트 사용법

`.claude/agents/{planner,implementer,qa-reviewer,security-reviewer,
docs-maintainer}.md` 5개는 역할 정의 문서다. 1인 조직 운영 특성상 한
세션이 여러 역할을 순서대로 겸해도 되고(예: 조사→구현→자체검수를 한
세션이 순차 수행), 위험도가 높은 작업(DB/보안 관련)만 역할을 분리해
독립 세션으로 교차검증하는 것을 권장한다(`qa-reviewer.md`가 명시하듯
"자기 자신이 만든 코드를 스스로 PASS 판정하지 않는다"는 원칙은 최소한
보안/DB 변경에는 지킬 것). 각 역할 문서의 "허용 행동"/"금지 행동"/
"중단 시점" 섹션이 그 역할의 실제 경계다.

### 훅 동작 방식 — 실제 강제 vs 조언

- **실제로 강제됨**: `.claude/settings.json`의 `PreToolUse` 훅
  (`scripts/hooks/checkDestructiveSql.mjs`)은 `*.sql` 파일에 테이블·
  컬럼·데이터베이스·스키마 삭제, 전체 비우기, WHERE 절 없는 무조건부
  행 삭제, 삭제를 포함한 테이블 변경 구문을 쓰려는 Write/Edit/MultiEdit
  호출을 실제로 **차단**한다(exit code 2, 7개 케이스 스모크 테스트로
  검증됨). 이건 이 환경에서 실제로 관찰되는 PreToolUse 차단 계약(exit
  code 2 + stderr → Claude에게 사유 피드백)에 기반한다.
- **조언만 함(비강제)**: `PostToolUse` 훅(`scripts/hooks/
  suggestVerifyDomain.mjs`)은 `src/api/scripts` 파일이 바뀌면 관련
  `npm run verify:<domain>` 명령을 stdout에 제안하지만, 이미 끝난 도구
  호출에 대한 사후 힌트라 실행을 강제하지 않는다. **"완료 선언 시
  자동으로 verify를 실행시키는" 것은 이 환경에서 신뢰성 있게 구현할
  방법이 없어 만들지 않았다** — 그 대신 `DEVELOPER_GUIDE.md`의 13단계
  워크플로우(7번 단계)가 프로세스 규칙으로 이 역할을 대신한다. 배포 전
  수동 확인, 유료 API 활성화 승인 등도 마찬가지로 훅이 아니라 프로세스
  규칙(아래 "위험 작업 승인법")으로만 강제된다.

### 파일 소유권

`CLAUDE.md` 규칙 16 — 파일당 실제 구현 소유자는 한 세션만. 작업 시작
전 `git log`/`git status`로 동시 작업 흔적을 확인하고, `.ai-status/`의
다른 활성 상태 파일(`status: working`/`reviewing`)이 겹치는 파일을
다루고 있지 않은지 확인한다. 커밋 시 `git diff --staged`로 자신이
의도한 파일만 스테이징됐는지 항상 재확인할 것(`55f0c86` 커밋
attribution 혼선 사고가 실제 근거).

### 작업 시작법 / 리뷰법

`DEVELOPER_GUIDE.md`의 "AI 세션 표준 워크플로우" 13단계 + "새 작업 시작"
지시문 템플릿을 그대로 쓴다. 리뷰(검수)는 `qa-reviewer.md`(build/verify
재실행 + Code Review Checklist 대조, evidence 기반 PASS/NEEDS-WORK
판정)와, 인증/DB 권한/클라이언트 신뢰 경계를 건드렸다면
`security-reviewer.md`(Security Checklist 대조 + anon key 읽기 전용
실측)를 추가로 거친다.

### 위험 작업 승인법

- **DDL 실행**: 에이전트는 Supabase에 DDL을 직접 실행할 수 없다(규칙
  8) — `supabase_v{n}_*.sql` 파일만 준비하고, 운영자가 Supabase
  대시보드 SQL Editor에서 수동 실행한다.
- **파괴적 SQL 파일 작성 자체**: `checkDestructiveSql.mjs`가 차단한다.
  이 훅에는 우회 토큰/바이패스 메커니즘이 의도적으로 없다 — 정말 필요한
  파괴적 변경(예: 완전히 폐기된 컬럼 정리)이 있으면, 운영자가 그 필요성
  을 직접 확인한 뒤 (a) 그 변경만 별도로 사람이 직접 SQL Editor에서
  실행하거나, (b) 운영자 명시 승인 하에 한시적으로 `.claude/
  settings.json`의 해당 훅 항목을 주석 처리/삭제했다가 작업 후 즉시
  복원한다 — 두 경우 모두 `handoff.md`에 승인자/사유/원복 여부를 반드시
  기록한다. 에이전트가 임의로 이 훅을 약화시키는 것은 금지.
- **유료 API 활성화**: 이 저장소에 자동 승인 게이트는 없다(만들지
  않음, 정직한 한계) — `CLAUDE.md` 규칙 7과 `ROADMAP.md`의 v1.3 백로그
  원칙("비용 발생 기능은 무료 대안을 먼저 찾고, 없을 때만 검토")을
  프로세스로 지킨다. 실제 활성화 전 운영자의 명시적 텍스트 승인을 받고
  그 사실을 handoff.md에 남긴다.

### 보드 갱신법

`PROJECT_BOARD.md`는 "현재 상태" 스냅샷이라 append 원칙의 예외로
직접 덮어써서(카드를 다른 컬럼으로 이동) 갱신한다. 카드를 옮길 때마다
그 근거(어떤 커밋/verify 결과로 완료됐는지)를 카드 설명에 남기고,
`.ai-status/`도 함께 갱신한다.

### 알려진 한계 (정직하게 기록)

- 훅은 파일 시스템 이벤트(Write/Edit/MultiEdit) 기준으로만 동작한다 —
  에이전트가 텍스트로만 "완료했다"고 선언하는 것을 의미론적으로
  검증/차단하는 장치는 없다(이 환경에서 신뢰성 있게 불가능 — 거짓으로
  구현했다고 하지 않는다).
  `checkDestructiveSql.mjs`의 무조건부 DELETE 감지는 세미콜론 기준
  단순 분할 휴리스틱이라, 문자열 리터럴 안에 세미콜론이 들어있는 등
  희귀한 SQL 형태에서는 오탐/미탐 가능성이 이론상 있다(이 저장소의
  실제 `supabase_*.sql` 11개는 전부 단순 DDL/GRANT 위주라 실질적
  리스크는 낮음).
- `PostToolUse` 훅의 제안은 파일 경로 키워드 매칭 휴리스틱이라 모든
  도메인 매핑을 커버하지 않는다(`scripts/hooks/suggestVerifyDomain.mjs`
  의 `HINTS` 목록 참고) — 매칭되지 않으면 조용히 아무 것도 출력하지
  않는다(안전한 실패, 하지만 완전한 커버리지는 아님).
- `.ai-status/`는 아무도 강제로 갱신시키지 않는다 — 에이전트가 자기
  역할 문서의 지시를 따르지 않으면 상태 파일이 stale로 남을 수 있다
  (파일 기반 관례의 근본적 한계, 자동 강제 아님을 `.ai-status/README.md`
  에 명시).
- `PROJECT_BOARD.md` 카드 이동은 수동이다 — verify 통과가 자동으로
  카드를 `VERIFY`→`DONE`으로 옮겨주지 않는다.
