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

---

## 하네스 오케스트레이션 레이어 (`tests/harness/`, 2026-07-18 신규)

_이 섹션부터는 append — 위 내용(4개 카테고리/작성 패턴)은 원본 그대로 보존. 아래는 그 위에 얇게 얹은 실행 편의 레이어일 뿐, 검증 로직을 대체하지 않는다._

기존에는 새 테스트를 돌리려면 `node scripts/buildXxxBundle.mjs && WORDLIB_BUNDLE=... node scripts/testXxx.mjs`처럼 사람이 매번 번들 경로를 손으로 맞춰야 했다. `tests/harness/`는 이 절차를 `npm run verify:도메인` 한 줄로 자동화하는 것 **뿐**이다 — child_process로 기존 `scripts/*.mjs`를 그대로 실행하고 표준 PASS/FAIL 헤더로 재포맷할 뿐, 로직을 손으로 재구현하지 않는다(`tests/harness/registry.mjs`가 어떤 도메인이 어떤 기존 스크립트+빌드 스크립트를 쓰는지 선언).

### 명령어

```
npm run verify:login            npm run verify:writing
npm run verify:student          npm run verify:speaking   (SKIP 고정 — 아래 참고)
npm run verify:admin            npm run verify:listening  (SKIP 고정 — 아래 참고)
npm run verify:homework         npm run verify:unit
npm run verify:quiz             npm run verify:persistence
npm run verify:daily-study      npm run verify:word-assignment
npm run verify:audio-tts        npm run verify:all        (전체 순차, 하나라도 FAIL이면 non-zero exit)
```

### 도메인 ↔ 기존 스크립트 매핑

상세는 `tests/harness/registry.mjs`(단일 진실 원천)를 직접 열어보는 것을 권장 — 아래는 요약.

| 도메인 | 커버 | 실제 실행되는 기존 스크립트 |
|---|---|---|
| login | O | testStudentLogin/testStudentSelectPinStatus/testStudentPinAuth/testStudentPinSelfSetup/testClearStudentPin/testRlsSecurity/testLoginRestoreCrash |
| student | O | testIdentityMigration/testMultiClass/testRenameClass/testClassDeleteCascade |
| admin | O | testDashboard/testSpellingSettings/testSpellingV2Db (+extra: testEntranceTest/testEntranceTestDb) |
| homework | O | testDailyAssignment/testFutureAssignment/testSyncProgress |
| quiz | O | testQuizStepReset (+extra: testPaulReactions) |
| writing | O | testSpelling/testSpellingDirectionWiring |
| speaking | **SKIP** | 없음 — getUserMedia/MediaRecorder는 headless Node에서 실행 불가, 이 도메인을 커버하는 test*.mjs 자체가 저장소에 없음(가짜 PASS 대신 정직한 SKIP) |
| listening | **SKIP** | 없음 — 실제 스피커 출력/청취 인지는 headless 환경에서 관측 불가(audioTts의 testTtsSingleton은 로직만 검증, 실제 소리 검증 아님) |
| unitSwitching | O | testUnitPersistence/testUnitNaturalSort/testUnitResumeIndex/testStudentUnitDecouple/testStudentSelectUnitSwitch |
| persistence | O | testProgress/testMergeProgress/testRestoreSyncRace/testMultiTabRace/testMultiDeviceMerge/testFullProgressBackup/testResetWordStatusBackup (+extra: dbIntegrityAudit) |
| dailyStudy | O | testWeeklyReport |
| wordAssignment | O | testDailyAssignment/testFutureAssignment(homework와 스크립트 공유, 관점만 다름) |
| audioTts | O | testTtsSingleton(로직 전용 — 실제 오디오 재생 아님, listening 참고) |

### Phase 6 최종 검증 매트릭스 (운영자 체크리스트 13항목 대조, 2026-07-18)

`npm run verify:all` 실측 실행 결과(로컬 환경) 기준. SKIP/GAP은 숨기지 않고 그대로 기록.

| 체크리스트 항목 | 하네스 도메인 | 결과(로컬) | 비고 |
|---|---|---|---|
| 로그인 | login | **부분 PASS** — 7개 중 3개 PASS(testStudentLogin/testRlsSecurity/testLoginRestoreCrash), 4개 FAIL | FAIL 4개(testStudentSelectPinStatus/testStudentPinAuth/testStudentPinSelfSetup/testClearStudentPin)는 전부 `SUPABASE_SERVICE_ROLE_KEY`가 로컬 `.env`/`.env.local`에 없어서(`permission denied for table students` 등) — 이번에 새로 생긴 회귀가 아니라 `handoff.md` 2026-07-18 QA 스윕에 이미 "4개는 로컬 환경 제약, 프로덕션은 정상"으로 기록된 기존 갭. service role key가 있는 환경(운영자 로컬 터미널 등)에서 재실행 권장. |
| 학생 | student | PASS | 4/4 |
| 숙제 | homework | PASS | 3/3 |
| 유닛 | unitSwitching | PASS | 5/5 |
| 퀴즈 | quiz | PASS | 1/1(+extra 1) |
| 쓰기 | writing | PASS | 2/2 |
| 말하기 | speaking | **SKIP(GAP)** | headless 환경 구조적 한계, 커버 스크립트 없음 — 실기기 수동 QA 필요 |
| 듣기 | listening | **SKIP(GAP)** | headless 환경 구조적 한계, 커버 스크립트 없음(TTS 중복방지 로직만 audioTts로 별도 검증) — 실기기 수동 QA 필요 |
| 진행도 | persistence | PASS | 7/7(+extra 1) — "영속성"과 동일 도메인으로 통합 |
| 관리자 | admin | PASS | 3/3(+extra 2) |
| 모바일 | (도메인 없음) | **GAP** | Android Chrome 실기기 터치/오디오unlock/권한흐름은 headless Node로 관측 불가 — 기존 QA 스윕(handoff.md)도 "코드 리뷰 결과만, 실기기 확인 필요"로 동일하게 기록. 최근 모바일 터치/에코 버그 수정(git log)은 코드 리뷰+실기기 확인으로 처리된 것이지 자동 하네스 대상 아님. |
| 새로고침 | (login/persistence가 부분 커버) | **부분** | `testLoginRestoreCrash.mjs`(로그인 직후 크래시 없음 + 별/스티커/캘린더 보존)와 `testRestoreSyncRace.mjs`/`testMultiTabRace.mjs`(재동기화 레이스)가 "새로고침 후 상태" 관련 로직을 간접 검증하지만, 실제 브라우저 F5/탭 재로드 자체를 시뮬레이션하지는 않음 — 완전 커버 아님, 정직하게 부분으로 표기. |
| 영속성 | persistence | PASS | 진행도 항목과 동일(위 참고) |

**요약**: 13항목 중 완전 PASS 8개(학생/숙제/유닛/퀴즈/쓰기/진행도/관리자/영속성), 부분 2개(로그인 — 스크립트는 다 있으나 로컬 `SUPABASE_SERVICE_ROLE_KEY` 미설정으로 4/7만 실행; 새로고침 — 간접 커버만), SKIP 2개(말하기/듣기, headless 구조적 한계), GAP 1개(모바일 — 하네스 대상 밖, 기존에도 실기기 수동 QA 영역). 가짜 PASS 없음 — 전부 실측 결과 그대로 기록.
