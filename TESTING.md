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
| `testPaulRank.mjs`(2026-07-19, Paul Rank System; 2026-07-19 v2.3.1 갱신 — 행동 단위 리팩터링) | `utils/paulRankShared.js`(Rank/Hat Stage 계산, XP 이벤트 테이블, 입력검증/기간키 헬퍼) — 이 모듈은 브라우저/서버 양쪽에서 그대로 import되도록 처음부터 완전 순수하게 설계되어 esbuild 번들 없이 직접 import 가능(`api/grant-xp.js`도 같은 소스를 그대로 import). v2.3.1 추가분: 운영자 지정 8개 행동 단위 이벤트(구 word-unit 이벤트는 테이블에서 완전히 제거됐음을 확인) + `isValidDayPeriodKey`/`isValidSourceEventIdForEvent`(기간키 위장/조작 거부) + "여러 단어에 걸쳐 반복해도 하루 1행만" 구조적 증명(6b번 섹션) |
| `testTicketEconomy.mjs`(2026-07-19, Ticket Economy — GAME_DESIGN.md 4·7·10번 섹션) | `utils/ticketEconomy.js`(원장 append/합산/병합, `daily-mission-complete` 하루 1회 지급 가드, `REWARD_CATALOG` 결정론적 구매) — `paulRankShared.js`와 같은 이유로 완전 순수(React/네트워크 없음), esbuild 번들 불필요. "소비(음수 delta)가 옛 클라우드 스냅샷과 병합돼도 부활하지 않음"(3번 섹션)과 "missions repeat all day에도 티켓은 하루 1장만"(5번 섹션)이 이 파일의 핵심 회귀 방지 포인트 |
| `testWordKing.mjs`(2026-07-19, Word King — 게임화 하위카드 7번, GAME_DESIGN.md 5번 섹션) | `utils/wordKing.js`(주간 기간 계산, 소표본 왜곡 보정 16.3, leave-one-out 학급 평균, 이상치 표 16.6, 결정적 tie-break) — `paulRankShared.js`와 같은 이유로 완전 순수, esbuild 번들 불필요. 6번 섹션이 GAME_DESIGN.md 16.3이 지목한 정확한 왜곡 시나리오("1문제 100%" vs "50문제 90%")를 3명 반으로 재현해 소표본 학생이 챔피언이 되지 않음을 실측 — 이 파일의 핵심 회귀 방지 포인트. 베이지안 블렌딩(원래 설계)이 아니라 "학급 평균 완전 대체"로 최종 구현한 이유도 이 테스트로 실측 확인된 것(파일 헤더 주석 참고) |
| `testHouseSystem.mjs`(2026-07-19, House System — 게임화 하위카드 8번, GAME_DESIGN.md 6·8번 섹션) | `utils/houseSystem.js`(HOUSES 상수/getHouseById, `assignBalancedHouseId` 결정론적 균형 배정, `computeHouseCounts`, `getWeekPeriod` ISO 주, `computeHouseWeeklyScores` 양수 delta만 합산, `getOwnHouseWeeklyDisplay`, `WEEKLY_EVENT_TYPES` 빈 슬롯) — 다른 게임화 순수 모듈과 같은 이유로 완전 순수, esbuild 번들 불필요(다른 `src/utils/*.js`도 import하지 않음 — "순수 모듈 간 무의존" 관례). 20명/21명을 순서대로 자동배정했을 때 하우스 인원이 완전 균형(또는 최대-최소 차이 1 이내)에 수렴하는지, 티켓 소비(음수 delta)가 팀 점수 집계에서 실제로 제외되는지가 이 파일의 핵심 회귀 방지 포인트 |
| `testSeasonalProgression.mjs`(2026-07-19, Seasonal Progression — 게임화 하위카드 9번, GAME_DESIGN.md 9번 섹션) | `utils/ticketEconomy.js`(`sumTicketBalanceSince`)/`utils/houseSystem.js`(`computeHouseSeasonScores`) — 둘 다 각 파일에 추가된 함수라 별도 신규 모듈은 없음, 완전 순수, esbuild 번들 불필요. 핵심 회귀 방지 포인트(가장 중요): ①시즌 경계(`>=` 비교, 경계 시각 그 자체도 "이후"에 포함) 전/후 원장 항목이 정확히 분리되는지, ②`sumTicketBalanceSince` 호출이 원장을 절대 mutate하지 않는지(append-only 원칙), ③레벨/뱃지/스트릭류 필드가 섞인 입력을 넣어도 두 함수의 계산 결과와 그 필드들 자체가 전혀 영향받지 않는지(이 계산 경로가 애초에 그 필드를 참조/import하지 않는다는 것을 실측으로 증명 — "레벨/뱃지/스트릭은 시즌 전환에도 절대 안 바뀐다"는 설계 원칙의 코드 레벨 증명) |

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
| `testEntranceTestDb.mjs` | v1.8 입실시험 테이블 round-trip. **2026-07-19 갱신**: 결과 제출은 이제 anon 직접 upsert가 아니라 `api/submit-entrance-result.js`를 (testStudentPinAuth.mjs/testXpLedgerDb.mjs와 동일한) `callHandler(handler, body)` 패턴으로 실 (req,res) 핸들러 직접 호출로 검증 — "7.5. 조작 시도 거부" 섹션이 가짜 score 전송/문제 개수 축소/단어 중복/가짜 단어/방향 위장 5종 조작 시도가 실제로 거부되는지(reason 코드까지) 실측하고, DB에 저장된 값이 조작대로가 아니라 서버 재채점값인지까지 확인 |
| `testFutureAssignment.mjs` / `testDailyAssignment.mjs` | `daily_assignments` 배정/폴백 |
| `testStudentSelectUnitSwitch.mjs` | 로그인 화면에서 기존 학생 유닛 전환 |
| `testFullProgressBackup.mjs` / `testResetWordStatusBackup.mjs` / `testSyncProgress.mjs` | `student_progress` 백업/복원/초기화 |
| `testRenameClass.mjs` / `testMultiClass.mjs` / `testClassDeleteCascade.mjs` | 반 이름 변경/다중 반/반 삭제 시 `ON DELETE SET NULL` 실측 |
| `testDashboard.mjs` | 관리자 대시보드 `fetchDashboardData` |
| `testUnitPersistence.mjs` / `testUnitNaturalSort.mjs` | 유닛 재배정 영속/자연 정렬 |
| `testStudentLogin.mjs` / `testStudentSelectPinStatus.mjs` | 로그인 흐름 |
| `testSpellingSettings.mjs` | 반별 쓰기시험 설정 저장/조회 |
| `testGamificationSettings.mjs`(2026-07-19, Teacher Controls 마스터 스위치) | `classes.gamification_enabled` 저장/조회 — `testSpellingSettings.mjs`와 완전히 같은 패턴이지만, 이 컬럼은 `spelling_direction`처럼 "컬럼 없으면 그 필드만 빼고 재시도"(graceful degradation, `setClassSettings`)라 예외가 아니라 round-trip 값으로 SQL 실행 여부를 판단하는 차이가 있음(파일 헤더 주석 참고). 존재하지 않는 반/신규 반 모두 기본값이 false(opt-in)임을 검증 — Dashboard.jsx의 Paul Rank UI 게이팅과 같은 boundary에서의 등가 테스트(React 렌더 테스트 인프라가 이 저장소에 없어 wordLibrary.js 레벨에서 검증) |
| `testStudentPinAuth.mjs` / `testStudentPinSelfSetup.mjs` / `testClearStudentPin.mjs` | PIN 인증/자기설정/초기화(서버리스 함수 경로, anon 폴백 시 v1.9 컬럼권한에 막히는 케이스 별도 처리) |
| `testAdminPinActionsDispatch.mjs`(2026-07-20, `api/admin-pin-actions.js` 신설 — 관리자 PIN 액션 3개 통합) | DB에 전혀 쓰지 않는(로컬/CI 어디서든 항상 결정적) 순수 라우팅/인가순서/필드검증 10개(method 체크, 인가가 action 분기보다 항상 먼저인지, action 누락·미지정 400, 각 액션 필드 검증) — `testStudentPinAuth.mjs`/`testStudentPinSelfSetup.mjs`와 같은 `callHandler(handler, body)` 직접 호출 패턴이지만, 실제 DB write 경로 검증은 그 두 스크립트가 이미 덮으므로 이 스크립트는 중복하지 않음(빌드 불필요, `builders: []`) |
| `testRlsSecurity.mjs` | v1.9 컬럼권한(anon의 PIN 컬럼 접근 차단) 실측 |
| `dbIntegrityAudit.mjs` | 읽기 전용 — 고아 FK/중복 행 전수 감사(쓰기 없음, `QA_` 데이터 생성 안 함) |
| `testXpLedgerDb.mjs`(2026-07-19, Paul Rank System; 2026-07-19 v2.3.1 갱신) | `xp_ledger`/`xp_totals` — `api/grant-xp.js`를 `testStudentPinAuth.mjs`와 같은 방식(fake `(req,res)` 직접 호출, HTTP 서버 불필요)으로 실행해 중복 지급 방지(같은 `sourceEventId` 두 번 요청 → 두 번째는 `duplicate:true`, 원장 행 1개 유지)와 Unit 전환이 XP에 영향 없음을 실측. v2.3.1 추가분(3b번 섹션): 같은 day 기간키로 8번 반복 요청해도 원장 행이 정확히 1개 유지됨을 실측(여러 단어에 걸친 반복 시뮬레이션) + 조작된 기간키(wordId 끼워넣기/가짜 미래 날짜)와 예약(planned) 이벤트(`word-king-complete`) 거부 실측(5번 섹션). `SUPABASE_SERVICE_ROLE_KEY`가 로컬에 없으면(이 저장소의 알려진 상태) 실제 쓰기 경로 검증은 SKIP — `xp_ledger`가 anon INSERT 권한을 아예 갖지 않도록 설계돼 있어 서비스롤 키 없이는 검증 불가능한 것 자체가 설계 의도(Vercel 프로덕션에서는 서비스롤 키가 설정돼 있어 전체 검증됨) |
| `testComputeWordKingApi.mjs`(2026-07-19, Word King) | `word_king_history` — `api/compute-word-king.js`를 `testXpLedgerDb.mjs`와 같은 fake `(req,res)` 직접 호출 방식으로 실행. **3단계 SKIP**: ① `ADMIN_PIN`이 로컬에 없으면 재인증/입력검증만 스킵(메서드 거부는 인증 이전 단계라 항상 검증), ② `word_king_history` 테이블이 아직 없으면(SQL 미실행) 라이브 계산 e2e 스킵, ③ 테이블은 있어도 `SUPABASE_SERVICE_ROLE_KEY`가 없으면 QA 시드 데이터를 정확히 못 넣어 스킵. 전체 조건이 갖춰지면 3명 QA 학생(diligent/lucky/mediocre)으로 실제 `entrance_tests`/`entrance_test_results`를 만들고 서버가 재집계한 결과가 `word_king_history`에 정확히 저장되는지, 재계산 시 upsert로 행 개수가 늘지 않는지, 학생 0명 반은 안전하게 거부되는지까지 실측. Windows + Node의 알려진 libuv 조기종료 크래시(`testEntranceTestDb.mjs` 워크어라운드와 동일 — SKIP 직후 `process.exit()` 전 300ms 대기)도 동일 패턴으로 처리 |
| `testStartNewSeasonApi.mjs`(2026-07-23, Seasonal Progression 생애주기 확장) | `api/start-new-season.js` 계약 — `seasons`가 `word_king_history`와 달리 `class_id`로 격리되지 않는 **전역 단일 테이블**이라, QA 데이터로 실제 insert/RPC를 검증하면 그 자체가 프로덕션의 진짜 활성 시즌을 바꿔버린다(금지 행동). 그래서 두 계층으로 분리: A) 인증/메서드 가드는 DB 호출 이전에 차단되므로 실제 핸들러를 안전하게 직접 호출(`testAdminPinActionsDispatch.mjs`와 같은 무DB 패턴), B) RPC(`start_new_season`)/레거시 insert 폴백 계약은 `globalThis.fetch`를 가로채는 순수 mock(PostgREST 응답 형태를 흉내, 실제 네트워크 요청 0건)으로 검증 — RPC 정상 매핑/RPC 함수 없음(PGRST202) 시 레거시 폴백/테이블 없음(PGRST205) 시 `table_missing`/RPC 실행 중 실패 시 code·details·hint 삼키지 않고 표면화까지 실측. Postgres 트랜잭션 고유 보장(advisory lock 직렬화, `is_active` partial unique index로 인한 실제 unique_violation)은 JS mock으로 증명 불가라 정직하게 SKIP(`supabase_v3_5_season_lifecycle.sql` 실행 후 라이브 검증 필요, CLAUDE.md 규칙 18) — 대신 참고용으로 SQL 함수 알고리즘을 그대로 옮긴 순수 JS 시뮬레이션(동시성 제외, 시퀀셜 정합성만)을 별도 섹션에 포함 |

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
| login | O | testStudentLogin/testStudentSelectPinStatus/testStudentPinAuth/testStudentPinSelfSetup/testAdminPinActionsDispatch(2026-07-20 신규)/testClearStudentPin/testRlsSecurity/testLoginRestoreCrash |
| student | O | testIdentityMigration/testMultiClass/testRenameClass/testClassDeleteCascade |
| admin | O | testDashboard/testSpellingSettings/testSpellingV2Db (+extra: testGamificationSettings/testEntranceTest/testEntranceTestDb) |
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

---

## 관련 항목: `verify:xxx` 실행 힌트 훅 (2026-07-18, AI 개발 운영체제 구축 세션)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

`.claude/settings.json`(저장소 로컬)의 `PostToolUse` 훅
(`scripts/hooks/suggestVerifyDomain.mjs`)이 `src/`/`api/`/`scripts/`
파일 변경 시 관련 있을 법한 `npm run verify:<domain>` 명령을 파일 경로
키워드 매칭으로 제안한다. **이 하네스 문서가 원본이고 그 훅은 이 표를
사람이 매번 대조하는 수고를 줄여주는 편의 힌트일 뿐** — 실행 자체는
여전히 사람/에이전트가 수동으로 한다(강제 실행 아님, 상세 근거는
`DEVELOPER_GUIDE.md`의 "AI 개발 운영체제 사용 안내" 참고). 매핑이
없는 파일은 조용히 아무 것도 출력하지 않는다.

---

## 관련 항목: 쓰기 답안 검토 AI 보조 v2 테스트 확장 (2026-07-23, implementer C)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

Agent A/B가 완료한 v2 경화 작업(`supabase/functions/grade-writing-answers/pipeline.js`의
NFKC 정규화 + 6필드 캐시 키 버저닝, `src/utils/spellingReviewAiApi.js`의
`runRulesPhase`/`runAiPhase`(25건 청크·30초 타임아웃·비용 상한 헬퍼),
`src/utils/spellingReviewBulkPlan.js`의 확인 모달/필터/정렬 헬퍼,
`supabase/functions/grade-writing-answers/index.ts`의 서버 측
`MAX_ITEMS_PER_REQUEST`/`MAX_EST_COST_USD_PER_REQUEST`/45초 배치 타임아웃)를
검증하기 위해 `scripts/testWritingReviewAiPipeline.mjs`에 섹션 37~49(13개
섹션, 단언 약 90개 추가 — 파일 전체 실측 198 PASS/0 FAIL/5 SKIP)를
append했다. 이미 `tests/harness/registry.mjs`의 `writing` 도메인이 이
스크립트를 실행하고 있어(§ 위 도메인 매핑 표) **레지스트리/`package.json`
변경은 없음** — 새 스크립트가 아니라 기존 스크립트 확장이라 등록 자체는
그대로 유효했다.

새로 추가한 섹션 요약:

| 섹션 | 검증 대상 |
|---|---|
| 37 | 미션 지정 픽스처(`explicitly`/`constant`/`adopt`/`climate`) 정확 문자열 재확인 — `constant`/"끝임없이"는 exact_match로 오탐되지 않고 보수적 levenshtein 경로로만 accept됨을 실측(편집거리 1) |
| 38 | NFKC 정규화 — 전각(full-width) 영문자/전각 공백/전각 마침표가 NFC만으로는 못 잡고 NFKC라야 정규화됨을 대조 실측 |
| 39 | 캐시 키 버저닝 — `partOfSpeech` 차이로 키 분리, `PROMPT_VERSION`/`AI_MODEL_ID` 포함, 6필드 라운드트립 |
| 40 | 타임아웃(AbortError) — `runAiPhase`가 절대 throw 안 하고 review/confidence 0/`ai_unavailable`로 강등 |
| 41 | AI 응답 ID 불일치 — 요청에 없던 id 무시, 누락된 정당 id는 review로 보충 |
| 42 | Edge Function 바디 파싱 불가 — 전부 review/`ai_unavailable`(§ 섹션 9의 pipeline.js 레벨 `parse_error`와는 다른 계층임을 명시) |
| 43 | 143건 배치 — `runRulesPhase`+`runAiPhase` 경유 fetch 호출 수 = ceil(미해결/25), 143건 전부 커버, 미리보기 중 DB mutation 0건(스파이로 실측) |
| 44 | 비용 게이트 — `estimateAiCostUsd` 단조성, `evaluateCostGate` 차단 조건, `localStorage` 상한 헬퍼(Node용 in-memory 셔임 주입) |
| 45 | `buildConfirmSummary` — 단어 10개 초과 시 표시 개수 제한(`wordsTruncatedCount`), 학생 수, `kind`별 변형저장 플래그, 비가역 경고 문구 |
| 46 | `filterProposalsBySource`/`filterRowsByStudent`/`distinctStudentIds`/`sortDisplayItems` — 판정 출처 필터, 학생 필터, 4개 축 정렬(안정 정렬·proposal 없는 행 처리 포함) |
| 47 | 수동 폴백 경로 실체 확인 — `resolveSpellingReview`/`setWordAcceptedMeanings`를 실제 함수 레퍼런스로 얻어 존재/arity(인자 개수) 확인(호출은 0회) |
| 48 | 서버 측 상한(`index.ts`) 순수 비용 수식 재확인 + 라이브 배포 400 응답 형태는 정직한 SKIP |
| 49 | 미래 제출 정합성 — 인정 변형 저장 후 재분류 시 AI 호출 없이 즉시 `synonym` accept(§ 섹션 16과 달리 `decisionSource`까지 명시적으로 확인) |

**새 빌드 인프라(파일 추가 없음, 기존 패턴 재사용)**: 섹션 40/41/42/43/44는
`src/utils/spellingReviewAiApi.js`(브라우저 전용, `supabaseClient`의
`import.meta.env`를 top-level import)를 검증해야 해서, 별도
`scripts/buildXxxBundle.mjs` 파일을 새로 만들지 않고
`testSpellingDirectionWiring.mjs`/`testQuizStepReset.mjs`가 이미 쓰는
"테스트 파일 안에서 esbuild 자체 번들"(새 테스트 작성 패턴 2, 빌드
스크립트 분리 없음) 패턴을 그대로 재사용했다 — `wordLibrary`/
`spellingReviewApi`/`supabaseClient`만 가상 스텁으로 교체하고
`import.meta.env.VITE_SUPABASE_URL` 등은 esbuild `define`으로 빌드 타임
고정 문자열 치환(런타임 크래시 방지, 각 테스트가 `fetch`를 직접 mock하므로
실제 값은 무관). 섹션 47도 같은 원칙으로 `wordLibrary.js`/
`spellingReviewApi.js`를 `supabaseClient`만 스텁 교체해 번들 — 로직
재구현 없이 실제 함수 레퍼런스를 얻어 arity만 확인한다(호출 0회).

**실행 결과(로컬 실측)**: `node scripts/testWritingReviewAiPipeline.mjs`
198 PASS / 0 FAIL / 5 SKIP(전부 배포 의존, § 섹션 36/48). `npm run build`
PASS(신규 경고 없음). `npm run verify:writing`/`npm run verify:all` 실측
결과는 `handoff.md`의 해당 세션 기록 참고.
