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
