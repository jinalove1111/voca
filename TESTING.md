# TESTING.md — Paul Easy Voca `scripts/` 테스트 체계

_작성: 2026-07-18. `scripts/` 전체(69개 파일)를 ls + 각 파일의 import 구문을 grep해서 실제로 무엇에 의존하는지 확인 후 분류했습니다. 이 저장소에는 Jest/Vitest 같은 테스트 러너가 없습니다 — 전부 `node scripts/xxx.mjs`로 직접 실행하는 순수 Node 스크립트이며, `assert`(또는 자체 `check()` 헬퍼)로 PASS/FAIL을 콘솔에 찍습니다.

## 핵심 원칙: 손으로 베낀 로직 금지

이 저장소의 테스트는 로직을 테스트 파일에 재구현하지 않습니다. 대신:
- **순수 유틸**(예: `spelling.js`, `weeklyReport.js`)은 `src/`에서 직접 import — 번들 불필요.
- **React 훅/컴포넌트**(예: `useStudent.js`, `WordDetail.jsx`)는 `esbuild`로 실제 소스를 번들해 Node에서 실행 가능한 `.mjs`로 만든 뒤, 그 번들을 import해서 검증합니다. `react`/`utils/wordLibrary` 같은 브라우저·네트워크 의존 모듈만 스텁으로 교체하고, **테스트 대상 로직 자체는 항상 실제 소스**입니다.

## 4개 카테고리

### 1) 순수 로직 테스트 — DB/번들/네트워크 불필요, `src/`에서 직접 import

| 파일 | 대상 |
|---|---|
| `testSpelling.mjs` | `utils/spelling.js`(`isSpellingCorrect`/`spellingHintFor`/`normalizeSpelling`), `utils/entranceTest.js`(`assignDirections`) |
| `testWeeklyReport.mjs` | `utils/weeklyReport.js`(`buildWeeklyReport`) — "Zero dependencies, so it's importable directly" |
| `testPaulReactions.mjs` | `utils/paulReactions.js`(리액션 선택/메시지 로직) |
| `testEntranceTest.mjs` | `utils/entranceTest.js`만(주석: "DB/네트워크/번들 불필요") |

실행: `node scripts/testXxx.mjs` — 별도 준비 단계 없음.

### 2) fakeReact 시뮬레이션 — 실제 훅/컴포넌트를 esbuild로 번들 + `fakeReact.mjs`의 최소 hooks 런타임으로 실행

`scripts/fakeReact.mjs`가 `useState`/`useEffect`/`useRef`/`useCallback`과 수동으로 진행 가능한 가짜 타이머(`createFakeClock`)를 제공하는 최소 hooks 런타임입니다(범용 React 대체가 아니라, 실제 번들된 훅 코드로 타이밍 레이스를 재현하기 위해 만들어짐). 네트워크/브라우저 API(`localStorage`, `document` 등)는 파일 안에서 `Fake*` 클래스로 직접 목킹합니다.

| 파일 | 먼저 실행할 빌드 스크립트 | 대상 |
|---|---|---|
| `testProgress.mjs` | `buildProgressBundle.mjs` | `useStudent.js` 순수 record/history 함수 |
| `testMergeProgress.mjs` | `buildProgressBundle.mjs` | `mergeProgressRecords()`(v2.2 병합 정책) |
| `testUnitResumeIndex.mjs` | `buildProgressBundle.mjs` | `freshRecord`/`normalizeRecord`/`resumeIndexForUnit`/`isEmptyRecord` |
| `testTtsSingleton.mjs` | (자체 번들, `BUNDLE` 상수 확인) | TTS 중복 호출 방지(`__claimTtsCallForTest`) |
| `testQuizStepReset.mjs` | 자체 esbuild(파일 내부에서 `WordDetail.jsx`를 직접 번들) | 퀴즈 스텝이 단어마다 리마운트되어 상태가 리셋되는지 |
| `testMultiTabRace.mjs` | `buildMultiTabBundle.mjs` | 다중 탭 동시 사용 시 로컬/클라우드 동기화 레이스 |
| `testRestoreSyncRace.mjs` | (해당 빌드 스크립트) | 복구(restore) vs 동기화(sync) 레이스 |
| `testLoginRestoreCrash.mjs` | (해당 빌드 스크립트) | 로그인 직후 복구 중 크래시 여부 |
| `testIdentityMigration.mjs` | (해당 빌드 스크립트, `wordLibraryStub` 사용) | 이름 키 → id 키 레거시 마이그레이션 |

실행 예: `node scripts/buildProgressBundle.mjs && node scripts/testProgress.mjs`

### 3) SSR 렌더 테스트 — 실제 컴포넌트를 `react-dom/server`로 렌더, HTML 문자열로 단언

| 파일 | 대상 |
|---|---|
| `testSpellingDirectionWiring.mjs` | `SpellingQuestion.jsx`/`WordDetail.jsx`를 esbuild로 번들 → `react-dom/server`로 렌더 → 문제 프롬프트/입력 placeholder가 `direction`(kr2en/en2kr/mixed)에 따라 정확히 갈리는지 HTML 문자열로 확인. 채점/방향 로직은 실제 소스, 브라우저 전용 모듈(`speech`/`paulReactions`/`useStudent`/`wordLibrary`)만 가상 스텁. |

실행: `node scripts/testSpellingDirectionWiring.mjs`(내부에서 esbuild 자체 처리, 별도 빌드 스크립트 없음).

### 4) 라이브 Supabase e2e — 실제 DB에 대해 `QA_` 접두 데이터만 생성/검증/정리

`buildWordLibBundle.mjs`(또는 `buildEntranceBundle.mjs`)로 `wordLibrary.js` 실소스를 번들하면, 그 번들은 스텁이 아니라 **실제 `supabaseClient.js`(anon key)**를 그대로 물고 있어 실행 시 진짜 Supabase에 쿼리를 날립니다. 이 카테고리는 전부 그 번들을 import합니다.

| 파일 | 대상 |
|---|---|
| `testMultiDeviceMerge.mjs` | v2.2 다중 기기 진행도 병합(교차 동기화 시 양쪽 진행분 보존) |
| `testStudentUnitDecouple.mjs` | v2.1 `current_unit_id` 백필/폴백 |
| `testSpellingV2Db.mjs` | v2.0 `spelling_direction`/`accepted_meanings`/`spelling_review_queue` |
| `testEntranceTestDb.mjs` | v1.8 입실시험 테이블 round-trip |
| `testFutureAssignment.mjs` / `testDailyAssignment.mjs` | `daily_assignments` 배정/폴백 |
| `testStudentSelectUnitSwitch.mjs` | 로그인 화면에서 기존 학생 유닛 전환 |
| `testFullProgressBackup.mjs` / `testResetWordStatusBackup.mjs` / `testSyncProgress.mjs` | `student_progress` 백업/복원/초기화 |
| `testRenameClass.mjs` / `testMultiClass.mjs` / `testClassDeleteCascade.mjs` | 반 이름 변경/다중 반/반 삭제 시 `ON DELETE SET NULL` 실측 |
| `testDashboard.mjs` | 관리자 대시보드 `fetchDashboardData` |
| `testUnitPersistence.mjs` / `testUnitNaturalSort.mjs` | 유닛 재배정 영속/자연 정렬 |
| `testStudentLogin.mjs` / `testStudentSelectPinStatus.mjs` | 로그인 흐름 |
| `testSpellingSettings.mjs` | 반별 쓰기시험 설정 저장/조회 |
| `testStudentPinAuth.mjs` / `testStudentPinSelfSetup.mjs` / `testClearStudentPin.mjs` | PIN 인증/자기설정/초기화(서버리스 함수 경로, anon 폴백 시 v1.9 컬럼권한에 막히는 케이스 별도 처리) |
| `testRlsSecurity.mjs` | v1.9 컬럼권한(anon의 PIN 컬럼 접근 차단) 실측 |
| `dbIntegrityAudit.mjs` | 읽기 전용 — 고아 FK/중복 행 전수 감사(쓰기 없음, `QA_` 데이터 생성 안 함) |

**QA 데이터 규칙**: 전부 `QA_` 접두 학생/반만 생성하고 테스트 종료 시 정리합니다. 프로덕션 데이터(111명 학생 등)는 절대 건드리지 않습니다.

실행 예: `node scripts/buildWordLibBundle.mjs && node scripts/testMultiClass.mjs`

## 새 테스트 작성 패턴

1. **테스트 대상이 순수 함수(네트워크/훅 없음)면** → 카테고리 1처럼 `src/`에서 직접 import. 가장 간단하고 우선 고려.
2. **테스트 대상이 React 훅이거나 브라우저 API에 의존하면** → 카테고리 2 패턴: `scripts/buildXxxBundle.mjs`(esbuild, `wordLibrary`/`react` 등 외부 의존만 `onResolve`로 스텁 치환) 작성 → 테스트 파일에서 `scripts/.tmp/xxx.bundle.mjs`를 `pathToFileURL().href`로 동적 import → `fakeReact.mjs`의 `renderHook`/`createFakeClock`으로 구동.
3. **테스트 대상이 컴포넌트의 렌더 결과(HTML 구조/텍스트)면** → 카테고리 3 패턴: `react-dom/server`의 `renderToString`으로 렌더 후 문자열 단언. `testSpellingDirectionWiring.mjs`를 템플릿으로 삼을 것.
4. **테스트 대상이 실제 Supabase 데이터 왕복(round-trip)이면** → 카테고리 4 패턴: `buildWordLibBundle.mjs`로 번들 → `QA_` 접두로 반/학생 생성 → 검증 → **반드시 정리 코드까지 작성**(실패 시에도 정리되도록 try/finally 권장) → 프로덕션 데이터 대조군은 절대 만들지 않음.
5. 새 스크립트 파일명은 `test` + PascalCase 시나리오명(`.mjs`)로, 빌드가 필요하면 `build` + 대상 + `Bundle.mjs`로 별도 분리 — 기존 관례를 따름(`DEVELOPER_GUIDE.md` Naming Convention).
6. 회귀 수정 테스트라면, 가능하면 수정 전 코드로 되돌려 테스트가 실제로 FAIL하는지 먼저 확인하는 걸 권장(테스트 자체의 유효성 검증 — `handoff.md` 2026-07-18 `syncGenRef` 수정 사례).

## 관련 파일

`C:\voca\scripts\fakeReact.mjs`, `C:\voca\scripts\fakeReactModule.mjs`, `C:\voca\scripts\buildWordLibBundle.mjs`, `C:\voca\scripts\buildProgressBundle.mjs`, `C:\voca\scripts\buildMultiTabBundle.mjs`, `C:\voca\scripts\buildRaceBundle.mjs`, `C:\voca\scripts\buildEntranceBundle.mjs`, `C:\voca\scripts\testSpellingDirectionWiring.mjs`(SSR 템플릿), `C:\voca\scripts\wordLibraryStub.mjs` / `wordLibraryRaceStub.mjs` / `wordLibraryMultiTabStub.mjs`(스텁 예시)
