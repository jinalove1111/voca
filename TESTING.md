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

---

## 관련 항목: Provider 추상화 테스트 확장 — 섹션 50~55 (2026-07-24, implementer-ai-provider-tests)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존. 10차 handoff(`git log`
`eace230` 이전)가 "TESTING.md 표는 섹션 50~55 추가분이 아직 미반영"으로
남긴 갭을 이번 세션(docs-maintainer, 11차)에서 채운다._

`providers.js`(OpenAI/Gemini/Anthropic 공통 인터페이스 + `createAIProvider`
팩토리, § `handoff.md` 2026-07-24 10차)를 검증하기 위해
`scripts/testWritingReviewAiPipeline.mjs`에 6개 섹션(50~55)이 추가됐다.
mock `fetchImpl`로 실제 네트워크 요청 0건, 캐시 키가 5필드(모델 제외)로
축소된 스펙에 맞춘 갱신도 기존 섹션(39)에 포함됐다.

| 섹션 | 검증 대상 |
|---|---|
| 39(갱신) | 캐시 키 5필드(모델 제외) 스펙 재확인 — provider가 달라도 캐시 키가 동일함을 명시적으로 단언 |
| 50 | `createAIProvider` 팩토리 — provider 문자열별 올바른 클래스 인스턴스 생성, 미지 provider는 throw 대신 `openai`로 조용히 폴백(`fallbackApplied`/`requestedProvider` 플래그 + `onUnknownProvider` 콜백) |
| 51 | `healthCheck` — 3개 provider(OpenAI/Gemini/Anthropic) 각각의 헬스체크 요청 형태와 성공/실패 응답 처리 |
| 52 | `normalizeResponse` — 3개 provider의 서로 다른 원시 API 응답 형태를 공통 스키마로 정규화하는 로직 |
| 53 | `gradeWritingAnswers` end-to-end — mock `fetchImpl`로 요청 payload 형태(프롬프트 공통성 포함, 운영자 요구사항 8) + 응답 파싱까지 배관 전체 실측 |
| 54 | `estimateCost` — provider/model별 요금표(`MODEL_PRICING_PER_MTOK`, `gemini-2.5-flash` 포함)에 따른 비용 계산 정확성 |
| 55 | 캐시 provider 무관성 — 서로 다른 provider/model로 판정해도 5필드 캐시 키가 동일해 캐시를 공유함을 실측(운영자 요구사항 11, 비용 절약 우선 설계의 직접 증거) |

**실행 결과(implementer-ai-provider-tests 자체 보고)**: `node scripts/
testWritingReviewAiPipeline.mjs` **275 PASS / 0 FAIL / 5 SKIP**(정직한
배포 의존 SKIP, 섹션 36 4건 + 섹션 48 1건 — 기존과 동일). `npm run
verify:writing` PASS(3/3). `npm run build`는 다른 에이전트와의 산출물
충돌을 피하려 의도적으로 미실행(서버 에이전트가 별도로 확인).

---

## 관련 항목: 자동 학습 시스템 테스트 확장 — 섹션 56~61 (2026-07-24, implementer-learning-tests)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

"선생님이 같은 검토를 두 번 하지 않는" 자동 학습 시스템
(`writing_answer_statistics`, § `handoff.md` 2026-07-24 11차)의 서버
(`pipeline.js`의 `statsLookup` 훅/`index.ts`)·클라이언트
(`writingAnswerStatsApi.js`/`spellingReviewApi.js`/`spellingReviewAiApi.js`)
구현이 완료된 뒤, `scripts/testWritingReviewAiPipeline.mjs`에 6개 섹션
(56~61)·72개 신규 단언이 추가됐다. 구현 파일은 이 작업에서 전혀 수정되지
않고 읽기만 됐다(실제 계약을 그대로 재현).

| 섹션 | 검증 대상 |
|---|---|
| 56 | `statsLookup` 훅(요구사항 5, 오답 학습) — 캐시 조회 다음/AI 호출 전 실행 위치, `skip:true`+유효 `decision`이면 `decision_source='stats_repeat'` 확정 + `aiClassify`/`cacheStore` 0회 호출, `decision:'accept'` 반환은 무시(이중 인정 경로 금지), 캐시 히트 항목은 `statsLookup` 자체 미호출, `budgetExceeded` 강등 우선순위(`stats_repeat` 유지 vs 나머지만 강등), `posWarning` 힌트 보존, 옵션 미전달 시 기존 호출부 무영향 |
| 57 | `registerRecommendation`/`dismissRecommendation`(원클릭 학습) — `writingAnswerStatsApi.js`를 esbuild로 번들해 실행. ① `setWordAcceptedMeanings` 실패 시 ②③ 절대 미실행 + throw, 성공 경로의 정확한 호출 순서·인자(`mergedAcceptedMeanings`/`created_by=stats_learning`/`status=accepted`+`status_changed_at`), ②(감사 insert) 실패는 best-effort 무시하고 ③은 진행, ③(status 갱신) 실패는 throw, `dismissRecommendation`은 `status=dismissed` 업데이트만 |
| 58 | `fetchLearningRecommendations`(Top50 쿼리) — 기본(`minCount=3`/`limit=50`)·커스텀 파라미터가 실제 쿼리 체인(`eq status=pending`/`gte count`/`order count desc`/`limit`)에 반영, `words` embed → `planAccept` 호환 필드 매핑, 테이블 미존재(42P01/PGRST205) 시 `null` 폴백 |
| 59 | Dashboard 절약 카운터 + 주간 학습률(요구사항 7·8) — `accumulateSavingsCounters`/`readTodaySavings`(fake localStorage로 같은 날 2회 누적, 다른 날짜 키 미혼입, 전체 0일 때 NaN/Infinity 없이 0), `fetchLearningRateMetrics`(Asia/Seoul 월요일 00:00 경계를 UTC+9 시프트로 직접 검증, 지난주 끝==이번주 시작 경계 이어짐, 지난주 시작이 정확히 7일 전, 테이블 없음은 `null`과 정상 0을 구분) |
| 60 | Performance(요구사항 9, `logSpellingReview` fire-and-forget) — 소스 텍스트로 await 없음 확인 + esbuild 번들 실행 스파이로 mock RPC가 영원히 pending이어도 `logSpellingReview`가 300ms 내 resolve(`Promise.race` 실측), RPC 42883/네트워크 오류 모두 학생 채점 경로로 전파 안 됨 |
| 61 | `statsSkips` 전파(`runAiPhase`) — `rulesResolvedCount>0`이면 모든 청크 요청 바디에 `clientStats.rulesResolvedCount` 동일 포함, 서버 응답 `summary.statsSkips` 청크별 합산(2청크×3=6), 기본값(0)이면 `clientStats` 필드 자체가 요청 바디에서 빠짐, 구버전 응답(필드 없음)도 0으로 안전 폴백 |

**새 esbuild 스텁 필터 버그 발견(테스트 파일 내부, 구현 파일 아님)**:
섹션 56~61 작성 중, 기존 섹션 36/43/47이 재사용해온 `onResolve` 필터
(`/utils[\\/]wordLibrary$/` 등)가 esbuild `args.path`의 실제 원문
상대경로("./wordLibrary")와 매치되지 않아 스텁이 적용되지 않는 잠재
버그가 발견됐다(기존 섹션들은 그 함수를 실제로 호출하지 않는 경로만
테스트해 우연히 통과해왔을 뿐). 이번 신규 섹션(56~61)의 스텁만 정확한
원문 상대경로 필터(`/^\.\/wordLibrary$/`, `/^\.\/supabaseClient$/`)로
고쳐 적용했고, 기존 섹션 36/43/47은 소유 범위 밖이라 손대지 않았다(향후
그 섹션들이 실제 호출을 검증하는 방향으로 확장될 경우 같은 필터 수정이
필요할 수 있음 — qa-reviewer 인계 사항).

**실행 결과(implementer-learning-tests 자체 보고)**: `node scripts/
testWritingReviewAiPipeline.mjs` **347 PASS / 0 FAIL / 5 SKIP**(275
PASS에서 72개 신규 단언 추가, 기존 SKIP 5건은 배포 의존이라 그대로
유지). 결합 재검증(`npm run build`/`npm run verify:writing` 등 전체
워크트리 기준)은 조정자가 후속으로 진행 예정 — `handoff.md` 2026-07-24

---

## 관련 항목: Curriculum Engine Phase 0 — `examples`/Learning Engine 도메인 2종 (2026-08-01, implementer, Phase 0 통합 커밋 I3)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

`docs/CURRICULUM_ENGINE.md` Phase 0 통합(커밋 I1~I3, `handoff.md`
2026-08-01 20차 참고)이 신규 도메인 2개를 `npm run verify:all`에
편입했다. 둘 다 `runSentenceLearning.mjs`/`runReading.mjs`와 동일한
자기완결형 하네스 관례(`tests/harness/run*.mjs` 하나가 PASS/FAIL/summary
표준 출력을 직접 찍고 exit code로 신호) — `registry.mjs`가 child-process로
그 파일 자체를 spawn한다(새 오케스트레이션 코드 없음).

| 도메인 | 명령 | 검증 대상 | 특이사항 |
|---|---|---|---|
| `examples` | `npm run verify:examples` | `curriculumModel.js`(승인 상태머신 `canTransition` 4x4 전체 매트릭스+same-state+unknown, `validateExampleFields` whole-word 불변식·정규식 특수문자 이스케이프·difficulty/source/approval_status enum, `normalizeTargetWord`, `matchesFilters` camelCase 계약) + `generatorContract.js`(`reviewCandidate` 금칙 톤 힌트, `generateCandidateExamples` 미구현 계약 — throw/네트워크 0) | pure 섹션 36단언(항상 실행) + live 섹션(선택) — `.env`/`.env.local`에 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`가 없으면 SKIP(exit 0). 있으면 `exampleLibrary.js`를 esbuild로 인메모리 번들(`import.meta.env` 치환, `scripts/buildWordLibBundle.mjs`와 동일 패턴)해 실제 Supabase 조회 — `examples` 테이블 부재(supabase_v3_13 미실행, 2026-08-01 시점 실제 프로덕션 상태)면 `listExamples`/`fetchApprovedExamplesForWords`의 `featureDisabled:true`/`{}` 폴백 자체를 PASS로 확인하고 CRUD 왕복은 건너뜀. 테이블이 생기면 같은 실행이 자동으로 `verify-harness-<timestamp>` 표시 행 생성→전이(draft→pending→approved)→승인 후 조회 확인→cleanup까지 전체 왕복으로 확장된다(코드 변경 없이 환경만 갖추면 커버리지가 늘어나는 구조). |
| `learningEngine` | `npm run verify:learning-engine` | `src/learning/adapters/learningItem.js`(`fromExample`/`fromWord` shape, 필드 없어도 안전 폴백) + `src/learning/engine/registry.js`(MODES 5종 전부 `primitives`+`prepare` 보유, `fill_blank`의 `makeFillBlank`/`checkAnswer` 왕복 — 대소문자 무관·구두점 무시·정규식 특수문자 단어 안전, `learn`/`listen`/`shadowing`/`write`의 identity prepare, 결정론) | 21단언, 전부 pure(네트워크 0). `learningItem.js`는 import 0 순수 모듈이라 직접 import하지만, `registry.js`는 내부에 확장자 없는 상대 import(`../../utils/textbookExampleModel`, Vite 전용 표기)가 있어 플레인 Node ESM이 직접 못 읽는다 — esbuild로 인메모리 번들해서만 로드(네트워크/환경변수 의존 없음, 여전히 pure). "supabase 접근 없음" 단언은 `.toLowerCase().includes('supabase')` 같은 순진한 substring 검사 대신 실제 사용 패턴(`import ... from '...supabase...'` / `supabase.from(...)` / `createClient(...)`) 정규식으로 정밀 검사한다 — 두 파일의 헤더 주석 자체가 "왜 Supabase가 없는지" 산문으로 설명하며 대문자 `Supabase`/소문자 `supabase`(파일명 `supabase_v3_13` 등)를 언급해 순진한 substring 검사는 오탐(false positive)이 났다(작성 중 실측 발견, 수정). |

두 도메인 모두 `npm run verify:all` 최종 실행에서 PASS 확인(2026-08-01,
`handoff.md` 20차 참고) — 기존 환경 제약 FAIL 4종(login/homework/
wordAssignment/unitSwitching, 전부 이번 세션 이전부터 있던 로컬
`SUPABASE_SERVICE_ROLE_KEY` 미설정/실데이터 상태 기인) + SKIP 2종
(speaking/listening, headless 구조적 한계)은 이 작업으로 전혀 변하지
않았다(신규 회귀 0).

---

## 관련 항목: 쓰기 답안 검토 자기학습형 파이프라인 — 섹션 63~65 (2026-08-01, implementer, `handoff.md` 21차)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

`handoff.md` 21차(실수 유형 그룹 뷰 + 오토파일럿 플래그 3종 + 자동 인정
철회 목록)의 신규 순수 함수(`src/utils/spellingReviewBulkPlan.js`의
`classifyMistakeType`/`selectCertainRejects`/`groupByMistakeType`)를
`scripts/testWritingReviewAiPipeline.mjs`에 3개 섹션(63~65)으로 검증했다
(기존 62개 섹션은 전혀 수정하지 않고 그 뒤에 추가만 — append).

| 섹션 | 검증 대상 |
|---|---|
| 63 | `classifyMistakeType` — 우선순위(noise 최우선 → typo → pos_variant → partial → semantic/wrong_word(AI decision 있을 때만) → unknown) 전체 경로. 경계값: 빈 답안(길이 0)/한 글자 답안(길이 1) noise, 자모만으로 된 답안 noise(NFKC 정규화가 호환 자모를 choseong 블록으로 바꿔버려 정규식이 원문 기준으로만 매치돼야 한다는 실측 버그를 이 섹션 작성 중 발견·수정), 편집거리 1/2는 typo, 편집거리 3 이상은 typo 아님(실측 `editDistance` 값으로 직접 재확인), `possiblePosVariant` 성립 시 pos_variant, substring 관계(편집거리 3 이상으로 typo와 안 겹치게 구성)와 "다의어 중 하나와만 정확히 일치"는 partial, AI 제안 `decision`이 accept/review면 semantic, reject_candidate면 wrong_word, AI 제안 자체가 없으면 unknown, `opts.meaning`/`opts.acceptedMeanings`로 row 자체 값 오버라이드 가능 |
| 64 | `selectCertainRejects` — AI `reject_candidate`+신뢰도 95%↑ 통과, 신뢰도 미달/decision 불일치는 제외, 통계 반복오답(`rejectedCount>=5 && acceptedCount===0`, camelCase/snake_case 필드명 양쪽 모두 인식) 통과, 반복 횟수 미달/인정 이력 존재(`acceptedCount>0`)는 제외, `threshold` 인자로 신뢰도 기준 조정 가능, 빈 배열/undefined 입력 안전(throw 없음) |
| 65 | `groupByMistakeType` — 그룹 개수/순서가 `MISTAKE_TYPE_ORDER`(`typo`/`pos_variant`/`partial`/`semantic`/`unknown`/`noise`/`wrong_word`)와 정확히 일치, count 0인 유형도 항상 포함(관리자가 "이 유형은 지금 0건"을 그대로 볼 수 있게), 각 그룹의 `label`이 `MISTAKE_TYPE_LABELS`와 일치, 전체 rows 합이 입력 건수와 동일(누락/중복 없음), 빈 입력이면 7개 유형 전부 count 0 |

이 세 함수는 `editDistance`/`normalizeForCompare`/`possiblePosVariant`
(전부 `pipeline.js` 기존 export)만 재사용하고 새 판정 로직을 만들지
않는다 — `selectCertainAccepts`(기존, 8차)와 나란히 있는 거울상
`selectCertainRejects`가 유일한 신규 "게이트" 로직이고, 그마저도 기존
`decision`/`confidence`/`decision_source` 필드 계약을 그대로 소비한다.

**실행 결과(implementer 자체 보고)**: `node scripts/
testWritingReviewAiPipeline.mjs` **모든 테스트 통과 ✅**(exit 0, 신규
섹션 63~65 포함 전 구간, 기존 5건 SKIP은 배포 의존이라 그대로 유지).
`npm run build` 통과(신규 경고 없음), `npm run verify:writing`
**3/3 PASS**, `npm run verify:admin` **6/6 PASS**(둘 다 실제 UI/오토파일럿
코드가 있는 `SpellingReviewQueuePanel.jsx`/`spellingReviewAiApi.js`/
`AdminScreen.jsx` 변경 이후 재확인). 오토파일럿의 실제 라이브 동작(비용
상한 실측 초과 시 AI 단계 스킵, 실제 AI 응답 분포에서의 게이트 통과율)은
UI 통합 테스트 성격이라 이번 순수 함수 테스트 범위 밖 — `handoff.md`
21차 "남은 리스크" 참고.
11차 "릴리스 게이트" 참고.

## 관련 항목: `verify:login` 로컬 환경 제약 정직 기록 (2026-08-06/07, 39~41차 재확인)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존. 위 "Phase 6 최종 검증
매트릭스" 표(로그인 행)가 2026-07-18 시점 스냅샷이라, 이후 로그인/PIN
관련 코드가 세 차례(39·40·41차) 더 바뀐 뒤에도 같은 결과가 재확인됐다는
것만 이 섹션에 별도로 남긴다 — 표 자체는 원본 그대로 두고 append만 한다._

`npm run verify:login`(`testStudentSelectPinStatus`/`testStudentPinAuth`/
`testStudentPinSelfSetup`/`testClearStudentPin` 4개 스크립트)이 로컬에서
FAIL하는 것은 **2026-07-18부터 알려진 기존 환경 제약**이고, 39~41차의
콜드스타트 P0 수정·41차의 `verify-student-pin.js` 동명이인 거부 로직
변경과는 무관함이 반복 재확인됐다:

- **원인**: 로컬 `.env`/`.env.local`에 `SUPABASE_SERVICE_ROLE_KEY`가 없어
  `permission denied for table students`(v1.9 컬럼권한이 anon/authenticated의
  PIN 컬럼 접근을 막는 것과 동일한 차단이 서비스롤 키 없이는 우회되지
  않음)로 실패한다 — 코드 버그가 아니라 로컬 개발 환경의 구조적 한계.
- **39차 실측(헌법 규칙 15 — 회귀 의심 시 수정 전 코드로 롤백해 FAIL을
  먼저 재현)**: `git stash`로 39차 수정을 되돌린 상태에서도 동일하게
  4개가 FAIL함을 직접 실행해 확인 — "이번 변경이 새로 깨뜨린 것"이
  아니라는 것을 추측이 아니라 대조군 실행으로 증명했다.
- **40~41차**: `verify-student-pin.js`(동명이인 PIN 일치 시 `duplicate_accounts`
  명시 거부 추가)와 `StudentSelect.jsx`(자기등록 탭 제거) 변경 이후에도
  같은 4개가 같은 이유로 FAIL — "이번 변경과 무관한 기존 환경 제약"으로
  각 세션이 반복 기록(`handoff.md` 2026-08-06(40차) "(4) 검증"/
  (41차) "(5) 검증").
- **가짜 PASS 금지 원칙 재확인**: Vercel 프로덕션 환경변수에는
  `SUPABASE_SERVICE_ROLE_KEY`가 설정돼 있어(서버리스 함수 `api/*.js`가
  실제로 그 키로 동작 중 — 라이브 로그인이 정상 동작한다는 사실 자체가
  간접 증거) 이 4개 스크립트는 그 환경에서는 전체 통과가 기대된다. 이
  문서는 "로컬에서 FAIL하는 게 정상"이라는 사실을 숨기지 않고 매 세션
  반복 기록하는 쪽을 택했다 — 로컬 결과만 보고 로그인 기능이 깨졌다고
  오판하지 않도록 하기 위함.

**`scripts/testPureUtils.mjs`(2026-08-08 야간 신규, 다른 세션이 같은 시각
작업 중 — 코드 자체는 implementer 소유, 여기서는 존재만 기록)**: 파일
헤더 주석 기준 카테고리 1(순수 로직, DB/번들/네트워크 불필요) 패턴으로
`houseSystem.js`(`assignBalancedHouseId`/`computeHouseCounts` 경계
케이스)/`matchGame.js`/`dateSeoul.js`/`analyticsMath.js`/`entranceTest.js`
(`assignDirections` 홀수 mixed) 5개 순수 모듈의 대표 경계 케이스를
`scripts/testHouseSystem.mjs`/`tests/harness/runAnalytics.mjs`와 중복되지
않게 골라 검증한다(파일 헤더에 중복 방지 근거 명시). 이 문서 상단 "1)
순수 로직 테스트" 표(§4개 카테고리)에 정식 행을 추가하는 것과
`tests/harness/registry.mjs` 도메인 등록 여부는 코드 소유 세션의 몫이라
여기서는 존재 확인만 기록하고 표 자체는 건드리지 않는다(append-only,
동시 작업 파일 비접촉 원칙 — `CLAUDE.md` 규칙 16).

## 관련 항목: `verify:homework`/`verify:persistence` 3종 SKIP 전환 (2026-08-09, 62차)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

`testSyncProgress.mjs`(homework 도메인)/`testMultiDeviceMerge.mjs`/
`testFullProgressBackup.mjs`(persistence 도메인)가 `verify:all`에서
FAIL하던 것은 코드 회귀가 아니라 `supabase_v3_16_students_insert_lockdown.sql`
(학생 INSERT 락다운)이 그새 운영자에 의해 실행되어, 이 스크립트들의
QA_ 픽스처 생성용 anon `students` INSERT가 42501(permission denied)로
막힌 것임을 확인했다 — 기존 관례(`788e5ac`/`7eb2d64`의 42501 정직 SKIP
패턴)와 동일하게 각 스크립트가 42501/RLS 에러를 감지하면 SKIP 로그를
찍고 exit 0으로 종료하도록 수정됐다(코드는 implementer 영역, 여기서는
사실 기록만). 결과: `verify:homework` 4/4, `verify:persistence` 9/9로
그린 복귀. **실검증(sync/merge/backup이 실제로 동작하는지)은 서버 경로
(`admin create_student` 등) 기반으로 픽스처 생성을 재작성해야 가능한
후속 과제로 남아있다** — 기존 `testRenameClass` 등과 동일한 성격의
검증 부채. `verify:login` 로컬 고정 FAIL(위 섹션)은 이번 작업과 무관하게
그대로 유효.

## 관련 항목: Production Safety Harness 1단계 — `verify:prod-check`/`verify:prod-hotfix` (2026-09-02, 104차)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

`npm run verify:prod-check`(`testProdCheck.mjs`, 39단언)와
`npm run verify:prod-hotfix`(`testProdHotfix.mjs`, 66단언, 네트워크 0)가
`tests/harness/registry.mjs`에 신규 도메인으로 등록되어 `verify:all`에
편입됐다. 운영 명령은 `npm run prod:check`(읽기 전용 invariant 스캔,
9종 규칙)와 `npm run prod:hotfix`(manifest 단일 원천 preflight/apply/
postflight/rollback + TTY 승인 게이트) — 상세는 `handoff.md` 104차 섹션
참고.

## 관련 항목: 야간 QA 신규 verify 스위트 8종 + registry 정리 (2026-09-04, 108차)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

야간 자율 QA 세션(11 트랙, `handoff.md` 2026-09-04(108차) 참고)이
`tests/harness/registry.mjs`에 신규 등록한 스위트:

| 스크립트 | 도메인 | 단언 | required(`extra`) |
|---|---|---|---|
| `scripts/testPaulTownProgression.mjs` | attachment | 222(진행/최종 236) | required |
| `scripts/testGardenGrowthSources.mjs` | attachment | 44(최종 74) | required |
| `scripts/testExcelImportFixtures.mjs` | unitSwitching | 54→62 | required(`extra:false`) |
| `scripts/testDoubleEvents.mjs` | rewardSystem | 45 | required(`extra:false`) |
| `scripts/testAdminPinThrottle.mjs` | login | 23 | required(`extra:false`) |
| `scripts/testSecurityRegressions.mjs` | login | 35 PASS/2 KNOWN | required(`extra:false`) |
| `scripts/testUiStabilityGuards.mjs` | quiz | 21 | required(`extra:false`) |
| `scripts/testStudentPathContracts.mjs` | quiz | 61 | required(`extra:false`) |
| `scripts/testStdoutFlushOnExit.mjs`(기존 파일, registry 미등록 발견·편입) | attachment | 8 | required(`extra:false`) |

이 세션은 registry 전수 점검 과정에서 **에이전트가 신규 verify
스크립트를 등록할 때 기본값으로 `extra:true`를 붙이는 습관**이 여러
트랙에서 반복 관찰됨을 발견했다 — `extra:true`는 그 스위트의 FAIL이
`verify:all`의 exit code에 반영되지 않는다는 뜻이라, 방치하면 회귀를
잡지 못하는 채로 "PASS"만 보고하는 가짜 안전망이 된다. 위 표의 신규
스위트 중 4개(더블파이어/관리자 PIN 스로틀/UI 안정성/Excel fixture)가
정확히 이 상태로 등록될 뻔한 것을 발견해 `extra:false`(required)로
정정했다(커밋 `a4313b2`/`154dfc9`). 정리 후 registry 전체 totals는
**57 required / 72 extra / 129**(합계) — `extra:true` 스위트의 FAIL은
여전히 exit code에 반영되지 않으므로, 새 스위트를 추가할 때는 원칙적으로
`extra:false`로 시작하고(`DEVELOPER_GUIDE.md` 신규 규칙 참고) 정말
"13개 필수 도메인 밖 보너스 커버리지"인 경우에만 명시적으로 `extra:true`
를 붙인다.

## 관련 항목: 운영 자동검증 스위트 신규 2종 + 기존 3종 확장 (2026-09-04, 109차)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

12시간 자율 운영 자동검증 세션(`handoff.md` 2026-09-04(109차) 참고)이
추가/확장한 스위트다. **전부 네트워크 0**(라이브 조회가 필요한 경로는
`--from-dir`/`--fixture`/`dryRun` 픽스처로 대체) — 이 스위트들을 아무리
많이 돌려도 프로덕션에는 어떤 쓰기도 나가지 않는다.

| 스크립트 | verify 명령 | 도메인 | 단언 | required(`extra`) |
|---|---|---|---|---|
| `scripts/testAdminFlows.mjs`(신규) | `verify:admin-flows` | admin | **63** | required(`extra:false`) |
| `scripts/testAccountClassification.mjs`(신규) | `verify:account-classification` | admin | **34** | required(`extra:false`) |
| `scripts/testOpsStatus.mjs`(신규) | `verify:ops-status` | admin | 141 → **150** | required(`extra:false`) |
| `scripts/testProdPlan.mjs`(신규) | `verify:prod-plan` | admin | 27 → **32** | required(`extra:false`) |
| `scripts/testProdHotfix.mjs`(확장) | `verify:prod-hotfix` | admin | 253 → **301** | `extra:true`(기존 등록 유지) |
| `scripts/testProdCheck.mjs`(확장) | `verify:prod-check` | admin | 162 → **195** | `extra:true`(기존 등록 유지) |

각 스위트가 고정하는 계약:

- **`testAdminFlows.mjs`** — "학생 생성 → 반 이동 → 교재 배정/전환 →
  유닛 변경"을 같은 픽스처 위에 이어 붙인 **복합** 회귀. 개별 흐름은 이미
  `testCreateStudentUnitAssignment`/`testTextbookIsolation`/
  `testAdminUnitEdit`/`testAssignmentUnitGuards`가 각각 보므로 로직을
  재구현하지 않고 **단계 간 상호작용**만 본다(이전 primary가 삭제가 아니라
  demote되는지, 교재 왕복 전환 후에도 각 SCA가 자기 진도를 지키는지, 전
  구간 `student_progress`/`student_daily_progress`/`word_status` 쓰기가
  계속 0건인지). FAIL-first 자가검증(규칙 15): src를 고치지 않고 가짜 DB에
  "delete-instead-of-demote" 옛 동작을 재현해 데모트 단언이 실제로 false가
  됨을 증명했다.
- **`testAccountClassification.mjs`** — `classifyAccount`의 REAL/TEST/
  ARCHIVED/QA_FIXTURE 판정 정책(Paul/Cookie/Jinaa/Barry/QA/archived) 회귀.
  게이트가 REAL만 대상으로 하므로 이 분류가 흔들리면 health/invariant
  결과 전체가 조용히 달라진다.
- **`testOpsStatus.mjs`** — `STATUS` enum 4값, finding 스키마
  (`assertFinding`), `recommendedActionFor`/`writeRequiredFor`/
  `approvalRequiredFor`의 **코드 전수 커버리지**(INVARIANT_CODES + health
  `CHECK_CODES` + WARN 전용 파생 2종 — 미상 코드는 조용한 통과가 아니라
  보수적 폴백), 두 하네스 `--json` → finding 어댑터, `prod:report` CLI
  (`--from-dir` 오프라인 모드, 13절 헤더 순서, **마스킹 우회 방지 decoy
  필드 회귀**).
- **`testProdPlan.mjs`** — `prod:plan`이 항상 `dryRun:true`로만 동작하고
  risk/영향 집계/이름 해석/drift/`apply_eligibility` 4값을 정확히 내는지.
- **`testProdHotfix.mjs` 확장분(V2 보안 하드닝 7종)** — dollar-quote
  태그화, `raise` 데이터 `%%` 이스케이프, manifest 문자열 값의
  `$`/`%`/역슬래시/제어문자 차단, `expect` 타입 검사, 서술 lint 오탐,
  invariant delta 실패 시 fail-closed, `op:'delete'` rollback의
  `created_at` + `op:'insert'`의 `(student_id, class_id)` 선행조건.
  전부 FAIL-first로 추가(수정 전 코드에서 각각 34건/4건 FAIL 실측).
- **`testProdCheck.mjs` 확장분** — 신규 invariant 4종
  (`STALE_CLASS_SCA`/`DUPLICATE_SCA_TEXTBOOK`/`STUDENT_NO_CLASS`/
  `UNIT_NAME_UUID_CONTRADICTION`). FAIL-first(`b11a6a6`에서 16단언 FAIL
  확인) 후 구현.

정리 후 `tests/harness/registry.mjs` totals는 **64 required / 71 extra**다
(108차의 57/72에서 신규 등록 + required 승격 반영). 이번 세션도 신규
스위트가 기본 `extra:true`로 등록되는 습관이 재발해 4종을 required로
승격했다(`50d07cb`/`9bcfcd8`) — 108차에서 한 번 정정한 문제가 다시 나온
것이므로, 규칙을 `DEVELOPER_GUIDE.md`에도 명시했다.

> **주의(정직 기록)**: `docs/production-safety-harness-runbook.md` §9-7은
> `verify:prod-hotfix`를 300단언으로 적어 두었으나 최종 실행 기준은 301이다
> — 마지막 커밋(`2ea5e86`) 이후 1단언 증가분이 런북 문구에만 미반영된
> 상태이며, 코드/테스트 자체의 불일치는 아니다.

### 운영 산출물을 만드는 스위트의 격리 규칙

`prod:report`처럼 **저장소에 커밋되는 산출물**을 만드는 도구의 회귀
테스트는 반드시 `--out-dir` 등으로 출력 경로를 격리해야 한다. 이번
세션에 회귀 테스트가 기본 경로에 그대로 써서 실행할 때마다 커밋된
`docs/qa/ops-report/ops-report-latest.{md,json}`을 덮어쓰는 문제가
발견돼 `4f622ca`로 수정했다.

## 관련 항목: Harness V2 최종 검증 — write drift guard 배선 수정 + 12종 오류탐지 커버리지 12/12 (2026-09-05, 110차)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

운영자 지시로 PR #15 merge는 보류하고 Harness V2 자체만 최종 검증한
세션(`handoff.md` 2026-09-05(110차) 참고)이 `verify:prod-hotfix`/
`verify:prod-check`를 확장했다.

- **`verify:prod-hotfix`(`testProdHotfix.mjs`) 301 → 317단언**
  (`fix/harness-v2-drift-guard-wiring`, 커밋 `9620586`/`41b4f40`). 새 섹션
  `[C3]`(write drift guard — SET 값/대상 row id/row 수 드리프트 3케이스 +
  대조군 실행 0회 단언)와 `[C4]`(`D.onStep` 훅으로 dry-run/apply 성공
  경로의 단계 순서 배열 단언)를 추가. 배경: `verifyWriteDriftGuard`가
  `runHotfix`에 배선되지 않은 죽은 코드였고, 시그니처가
  `(manifest, runId)`로 SQL을 내부에서 재생성해 비교하는 동어반복이었다
  — 시그니처를 `(manifest, applySql, rollbackSql)`로 바꿔 실제 생성·저장된
  SQL을 재파싱 대조하도록 수정하고 `runHotfix` step 6.5에 배선, 새 STOP
  사유 `blocked-write-drift`(표준 상태 `FAIL`)를 추가했다. FAIL-first(규칙
  15): 배선 `return`을 임시 제거하면 정확히 6단언 FAIL(311/317), 복구 후
  317/317.
- **`verify:prod-check`(`testProdCheck.mjs`) 195 → 204단언**
  (`test/harness-v2-coverage`, 커밋 `cc55154`/`af8aea1`/`5c36b7d`/
  `09104d9`). 신규 invariant `TEXTBOOK_SIMILAR_NAME`(WARN) — 같은
  `publisher_name` + 학년 접두(초/중/고 1~6)·괄호·공백을 제거한 정규화
  키가 동일하면 경고(완전동일명은 기존 `TEXTBOOK_NAME_DUPLICATE`가 담당).
  fixture 양성 1건 + 대조군 3건. `prodDataLoader`의 `textbooks` SELECT에
  `publisher_name`을 추가(`src/utils/wordLibrary.js`가 이미 라이브에서
  쓰던 컬럼이라 신규 GRANT 불필요). 라이브 `prod:check`에서 실제로 1건
  검출: 교재 `faf6dc71`/`01afd62a`(출판사 "동아", 정규화 키
  "동아윤정미", 중1/중2).
- 이로써 12종 운영 오류 자동탐지 커버리지가 **12/12**로 확인됐다(상세
  표는 `handoff.md` 110차 참고 — primary 없음/중복, `current_unit_id`
  NULL, unit-교재 불일치, ghost 참조, 비정상 unit, stale SCA, 교재 유사명,
  잘못된 `textbook_id`, garden 기록 누락, spelling/quiz/guided 성장 누락,
  reward/XP 중복 지급).

> **주의(정직 기록)**: `docs/production-safety-harness-runbook.md`
> §9-7의 단언 수(300/301)는 이번 세션에서 317로 다시 늘어났다 — 위 §9-7
> 정정 항목과 마찬가지로 문서 문구 갱신은 다음 세션 인계 사항이다.

## Browser E2E (Playwright) — 학생/관리자 화면 렌더 자동 검증 (2026-09-05)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

지금까지의 4개 카테고리(순수 로직/오프라인 번들/라이브 e2e 스크립트/
정적 검사)는 전부 "코드가 올바른 값을 계산하는가"만 본다 — 그 값이 실제
브라우저 DOM에 **보이는지**는 검증하지 않았다. 운영자가 "학생 화면 스크린샷
보내주세요"를 대신할 수 있는 자동 검증이 필요해, 5번째 카테고리로
Playwright(chromium) 기반 브라우저 E2E를 추가했다(`npm run verify:e2e`,
`tests/e2e/`).

### 설계

- **네트워크 전체 mock** — `tests/e2e/lib/mockRoutes.mjs`가 `page.route()`로
  이 페이지의 모든 요청을 가로챈다: `**/rest/v1/**`(PostgREST, 아래 소형
  에뮬레이터로 응답)·`**/auth/v1/**`·`**/realtime/**`(Supabase Auth/
  Realtime, 빈 응답/차단)·`/api/verify-student-pin`·`/api/verify-admin-pin`
  (로그인 성공 fixture 응답)·그 외 `/api/**`(fire-and-forget 호출부라
  실패해도 화면이 안 깨짐, 무해한 응답). 실제 Supabase 프로젝트/Vercel에
  나가는 요청은 **0건**이 전제 — 가장 먼저 등록하는 catch-all
  `page.route('**/*', ...)`이 위 어느 패턴에도 안 걸리는 요청을
  `unmockedRequests`에 기록하고(공개 폰트 CDN 3종은 정적 에셋이라 허용
  목록으로 제외), 각 spec/러너가 그 배열이 비어있는지 마지막에 단언한다
  (fail-closed — mock을 깜빡한 새 쿼리가 조용히 실제 네트워크로 새는 것을
  테스트 스스로 잡아낸다).
- **소형 PostgREST 에뮬레이터**(`tests/e2e/lib/postgrestMock.mjs`) — 새
  쿼리 빌더/ORM을 만들지 않고, 앱이 실제로 보내는 URL(`/rest/v1/<table>
  ?select=...&col=eq.val&order=...`)과 헤더(`Prefer`, `Accept`)만
  해석해서 인메모리 fixture 테이블에 적용한다. 지원 연산자(`eq/neq/in/is/
  gt/gte/lt/lte`, `select`의 임베디드 관계, `order`, `.single()`/
  `.maybeSingle()`의 PGRST116 계약, upsert의 `on_conflict`)를 벗어나면
  조용히 무시하지 않고 즉시 throw한다 — "이 쿼리는 검증 못 함"이 가짜
  PASS로 둔갑하지 않게 하기 위함(기존 verify 하네스들의 fail-closed
  원칙과 동일). PATCH/POST/DELETE는 메모리 테이블에 실제로 반영되고
  `callLog`에 기록되어(`writesTo(db, table)`) 단언에 쓰인다.
- **fixture**(`tests/e2e/fixtures/index.mjs`) — 실 프로덕션 데이터/실명
  0건, 전부 합성. 교재 4종: "중1 천재 이상기"/"중2 천재 이상기"(둘 다
  publisher_name="천재", 학년만 다름) + 유사명 함정 "중1 동아 윤정미"/
  "중2 동아 윤정미"(publisher_name="동아") — 이 정확한 조합은 가상의
  worst case가 아니라 `verify:prod-check`의 `TEXTBOOK_SIMILAR_NAME`
  invariant가 실제 프로덕션에서 검출한 실제 사례(교재 `faf6dc71`/
  `01afd62a`, 위 섹션 참고)를 그대로 재현한 것이다. QA 학생은
  `src/utils/accountStatus.js`의 `TEST_ACCOUNT_NAMES` 중 하나("cookie")
  — 관리자 화면이 기본적으로 숨기는 테스트 계정이라 실학생 로스터를
  전혀 침범하지 않는다. SCA는 primary=교재A(Unit2 진행 중)/
  secondary=교재B로, "배정 교재가 여러 개"인 실제 운영 패턴을 재현한다.
- **spec 실행 방식** — `npx playwright test`(공식 테스트 러너)를 쓰지
  않고, `scripts/testBrowserE2E.mjs`가 Playwright의 저수준 API
  (`chromium.launch()`)를 Node 스크립트 안에서 직접 구동한다. 각 spec
  (`tests/e2e/student.spec.mjs`/`admin.spec.mjs`)은 `run(browser, baseURL)`
  하나를 export하고, `tests/e2e/lib/harness.mjs`의 초경량 `check`/`skip`
  레코더로 기존 `scripts/test*.mjs` 관례("PASS/FAIL/SKIP 한 줄 로그 +
  마지막에 `총 N단언 — PASS n / FAIL m / SKIP k`")를 그대로 재사용한다 —
  이 저장소에 두 번째 테스트 프레임워크를 들이지 않기 위함(CLAUDE.md
  규칙 6과 같은 정신).

### 실행

```
npm run verify:e2e     # scripts/testBrowserE2E.mjs — 아래 순서로 자동 실행
```

1. `dist/index.html` 존재 확인(없으면 `npm run build` 먼저 실행)
2. Playwright chromium 가용성 확인 — 없으면 아래 "브라우저 미설치" 참고
3. `vite preview`를 고정 포트(기본 4173, `E2E_PREVIEW_PORT`로 변경 가능)로
   기동, 준비될 때까지 폴링
4. `student.spec.mjs` → `admin.spec.mjs` 순차 실행, 브라우저/서버 정리
5. 두 spec의 단언 + "미mock 요청 0건"/"mock 내부 오류 0건" 단언을 합쳐
   기존 하네스와 동일한 형식으로 요약 출력

**브라우저 미설치**: `npx playwright install chromium`을 아직 안 돌렸다면
로컬에서 이 스크립트는 기본적으로 **FAIL(exit 1)**한다(fail-closed —
"검증 못 함"을 조용한 통과로 만들지 않음, CLAUDE.md 규칙 18과 같은 원칙).
`E2E_SKIP_IF_NO_BROWSER=1`을 설정했을 때만 SKIP(exit 0)으로 넘어간다.

### 시나리오 커버리지 (2026-09-05 갱신 — A6 spelling/guided-learning SKIP 해소)

| 시나리오 | 상태 | 비고 |
|---|---|---|
| A1 학생 로그인 | PASS | |
| A2 배정 교재 표시(라벨/A·B 구분) | PASS | |
| A3 현재 Unit 표시 | PASS | |
| A4 Unit dropdown 목록(교재 범위) | PASS | |
| A5 현재 유닛 단어 수 표시 | PASS | |
| A6 퀴즈 정답 → 화면 갱신 + mock 쓰기 로그(`student_progress`) | PASS | |
| A6-spelling 쓰기(철자) 모드 단어 1개 정답 → 화면 갱신 + mock 쓰기 로그 + 정원 포인트 +1(대조군: 같은 단어 재정답 +0) | PASS | 별도 브라우저 컨텍스트/fixture(0 기준선)에서 실행 — A6/A7 퀴즈 진행과 정원 포인트가 섞이지 않는다. |
| A6-guided GuidedSession(3분 데일리 리추얼) 단어 1개(발음→예문→퀴즈) 완료 → 화면 갱신 + `completedWords`/`clearedWords` 동시 기록 + 정원 포인트 +1(합집합) | PASS | PronounceStep/ExampleStep의 "따라 말하기"는 클릭이 필요하지만, headless 환경의 mic 거부 경로(`getUserMedia` reject → `onAnyResult()` 그대로 호출)와 `window.speechSynthesis`의 무음성 `onend`가 실제 마이크/외부 TTS 네트워크 없이도 다음 단계 진행을 가능하게 한다(실측: 미mock 요청 0건). 별도 브라우저 컨텍스트/fixture(0 기준선). |
| A7 English Garden 성장(gardenPoints 증가) | PASS | |
| B1 관리자 로그인 | PASS | |
| B2 학생 카드(실명 없음) | PASS | |
| B3 배정 교재 목록(primary 표시) | PASS | |
| B4 교재/Unit 목록(유닛 수 라벨 포함) | PASS | |
| B5 UUID로 별개 교재 판정(라벨 유사성 무관) | PASS | |
| B6 유사명 함정 교재 비혼입 | PASS | |

총 56단언(PASS 56 / FAIL 0 / SKIP 0), 실행마다 "미mock 요청 0건 / mock
내부 오류 0건"을 함께 확인한다(3회 연속 실행으로 플레이크 0 확인,
2026-09-05).

### 관리자 화면 UI가 작업 지시서 가정과 다른 점(정직 기록)

작업 지시서는 "교재 선택기 옵션에 유닛 수 포함"을 `TextbookAssignmentPanel`
드롭다운 하나로 상정했지만, 실제 코드는 두 화면에 걸쳐 있다:
`src/utils/textbookLabel.js`의 `textbookOptionLabel`(이름 (출판사) · 유닛
N개)이 "학생 관리" 탭의 "📚 교재 관리" 패널(배정할 교과서 select)에서
쓰이고, 카드별 유닛 수(`{units.length}개 유닛`)는 "반 관리" 탭의 반
카드에 별도로 표시된다. `admin.spec.mjs`는 두 화면을 조합해 같은 의도
(B4/B5/B6)를 검증한다.

### 이 하네스의 한계 — mock이라 실 DB 상태는 검증하지 않는다

이 E2E 스위트는 "코드가 주어진 데이터를 올바르게 렌더하는가"만 본다.
실제 프로덕션 데이터가 그 전제(예: primary SCA 행 존재, 유령 유닛 없음)를
만족하는지는 **여기서 검증하지 않는다** — 그건 `npm run prod:check`(위
Production Safety Harness 섹션, READ-ONLY 라이브 invariant 스캔)의
몫이다. 두 하네스는 서로 다른 축을 담당한다: `verify:e2e`=코드가 옳게
그리는가(합성 fixture, DB 무접촉), `prod:check`=지금 DB 데이터가
정상인가(실 데이터 읽기 전용, 렌더 무검증). 학생 화면이 실제로 깨졌다는
제보가 오면 먼저 `prod:check`로 데이터 이상을 배제한 뒤, 그래도 이상하면
`verify:e2e`의 fixture를 그 제보 상황과 비슷하게 조정해 재현을 시도하는
순서를 권장한다.

새 컴포넌트에 브라우저 E2E를 추가할 때 참고할 것: 이번 두 spec 모두
`data-testid`를 **한 개도 추가하지 않았다** — 기존 placeholder(`이름
입력...`/`PIN 4자리`/`비밀번호` 등)·sr-only `<label>`(`교과서 선택`/
`현재 유닛 선택`)·버튼 텍스트·이미 존재하는 CSS 클래스(`.word-text`,
`p.font-black.text-gray-800` 카드 헤더 등)만으로 충분했다. `data-testid`는
헌법상 허용된 유일한 앱 코드 수정 예외지만, 항상 최후 수단으로 남겨둘 것
— 특히 관리자 "반 카드"처럼 `hasText` 부분 문자열 매칭이 **다른 카드가
펼쳐졌을 때 그 안의 드롭다운 옵션에 우연히 같은 이름 문자열이 들어있어**
오탐하는 경우(`admin.spec.mjs`의 `findClassCard`, "🔗 교재 연결" select가
다른 반 이름을 옵션으로 나열)가 실제로 있었다 — 이런 경우 헤더 요소를
정확히 매칭(`^exact$` 정규식)한 뒤 `xpath=ancestor::`로 컨테이너를
거슬러 올라가는 편이, 데이터를 다시 렌더링하는 `data-testid`를 새로
추가하는 것보다 이 저장소의 "앱 코드 원칙적 무수정" 원칙에 더 잘 맞는다.

## 관련 항목: 브라우저 E2E — `npm run verify:e2e` (2026-09-05)

_이 섹션부터는 append — 위 내용은 원본 그대로 보존._

기존 4개 카테고리(순수 로직/오프라인 번들/라이브 READ-ONLY/자기완결형
하네스) 전부 Node 프로세스 안에서 로직만 실행하고 실제 브라우저 렌더는
검증하지 않는다 — 운영자가 "학생/관리자 화면이 실제로 이렇게 보이나요?"를
확인하려면 지금까지는 스크린샷을 직접 봐야 했다. `npm run verify:e2e`
(`scripts/testBrowserE2E.mjs`)는 Playwright(chromium)로 빌드 산출물(`vite
preview`)을 실제 브라우저에 렌더해 학생/관리자 화면의 표시 결과를 자동
단언한다 — **다섯 번째 카테고리**.

### 설계 — 전 네트워크 mock, 실제 Supabase/Vercel 요청 0건

- `tests/e2e/lib/postgrestMock.mjs` — 소형 PostgREST 에뮬레이터. 앱이
  실제로 보내는 쿼리 문자열(`select=`/`eq.`/`in.`/`is.`/`order=`/`limit=`,
  POST/PATCH/DELETE + `Prefer`/`Accept` 헤더)을 파싱해 인메모리 fixture
  테이블에 대해 그대로 해석한다. 미지원 연산자는 조용히 무시하지 않고
  즉시 throw — 호출부(`mockRoutes.mjs`)가 그 throw를 잡아 500 응답 +
  `db.errors`에 기록하므로, "이 쿼리는 검증 못 함"이 가짜 PASS로 둔갑하지
  않는다.
- `tests/e2e/lib/mockRoutes.mjs` — 한 페이지의 모든 네트워크를
  `page.route()`로 가로챈다: `/rest/v1/**`(위 에뮬레이터에 위임),
  `/auth/v1/**`·`/realtime/**`(차단), `/api/verify-student-pin`·
  `/api/verify-admin-pin`(성공 fixture 응답), 그 외 `/api/**`(무해한 실패
  응답 — 호출부가 fire-and-forget이라 화면에 영향 없음). 공개 폰트 CDN
  (`fonts.googleapis.com`/`fonts.gstatic.com`/`cdn.jsdelivr.net`)은
  Supabase/Vercel과 무관한 순수 정적 에셋이라 허용 목록으로 별도 취급하고,
  그 외 어떤 호스트로든 나가는 요청이 하나라도 있으면
  `unmockedRequests`에 기록된다 — 각 spec/러너가 이 배열이 비어있는지를
  fail-closed 가드로 단언한다.
  - Playwright route 등록 순서 주의사항(실제로 여기서 걸렸던 버그):
    여러 `route()`가 같은 요청에 매치되면 **나중에 등록된 것부터**
    실행된다. 그래서 무엇에나 매치되는 catch-all 가드를 제일 먼저
    등록하고, 넓은 `/api/**`를 그다음, 구체적인
    `/api/verify-student-pin`·`/api/verify-admin-pin`을 제일 나중에
    등록한다(제일 나중 등록 = 제일 먼저 실행 = 구체적 mock이 넓은
    패턴에 가려지지 않음).
- `tests/e2e/fixtures/index.mjs` — 실 프로덕션 데이터/실명 0건, 전부 합성.
  교재 2종("중1 천재 이상기"/"중2 천재 이상기", 둘 다 출판사 "천재", 유닛당
  단어 수 20/15/10 vs 12/12/12) + 유사명 함정 교재 2종("중1/중2 동아
  윤정미") + QA 학생 1명(`src/utils/accountStatus.js`의
  `TEST_ACCOUNT_NAMES` 중 "cookie") + SCA(primary=A의 Unit2,
  secondary=B). 로그인 PIN은 fixture 상수("0000"/관리자 "9999")일 뿐 실제
  `.env`/`.env.local`의 PIN과는 무관하다.
- 앱 코드(`src/`, `api/`)는 **한 글자도 수정하지 않았다** — 기존
  sr-only `<label>`(교과서/유닛 select), 버튼 텍스트, `placeholder`,
  `<option value>`(UUID)만으로 전부 선택자를 구성할 수 있어
  `data-testid`조차 추가하지 않았다.

### 실행 흐름 (`scripts/testBrowserE2E.mjs`)

1. `dist/index.html` 존재 확인 — 없으면 `npm run build` 먼저 실행.
2. Playwright chromium 기동 시도 — 실패(바이너리 미설치)하면:
   - `E2E_SKIP_IF_NO_BROWSER=1`이면 **SKIP**(exit 0).
   - 아니면(기본값) **FAIL**(exit 1, fail-closed) — "브라우저가 없으니
     통과로 친다"를 구조적으로 금지.
3. `vite preview`를 자식 프로세스로 기동(고정 포트, 준비될 때까지 폴링).
4. `tests/e2e/student.spec.mjs` → `tests/e2e/admin.spec.mjs` 순서로
   실행하고, 기존 하네스 관례와 동일한 "총 N단언 — PASS n / FAIL m /
   SKIP k" 형식으로 출력(Playwright CLI 러너 대신 playwright API를
   Node에서 직접 구동해 이 출력 형식에 맞춤).
5. 종료 시 브라우저 + preview 서버를 모두 정리.

### 시나리오 커버리지

- **학생 화면**(`student.spec.mjs`, A1~A7): 이름+PIN 로그인 → 배정 교재
  라벨("이름 (출판사)" 형식, primary/secondary가 서로 다른 옵션으로 존재,
  "중1"/"중2"가 각각 정확히 1개 옵션에만 등장) → 현재 Unit(A의 Unit2)
  선택 상태 → Unit dropdown이 A의 Unit1~3 정확히 3개(B 유닛 비혼입) →
  현재 유닛 단어 수(15개) 표시 → 퀴즈 2문항 정답 처리 후 진행 표시 갱신
  + `student_progress` mock 쓰기 호출에 `clearedWords` 반영(2초 디바운스
  대기) → English Garden `gardenPoints`가 2점(단어 2개 clearedWords)
  기준으로 0칸 → 1칸(`POINTS_PER_STAGE=2`) 성장.
  - **(2026-09-05 갱신)** spelling/guided-learning 완료 후 갱신도 채워
    넣었다(각각 별도 브라우저 컨텍스트 + 새 fixture, 0 기준선) — 더는
    SKIP이 아니다.
    - **A6-spelling**: WordBrowser의 "쓰기" 모드(`mode='write'`) 진입 →
      단어 목록에 이미 보이는 원문을 그대로 입력(방향은 fixture 전 클래스
      `spelling_direction='kr2en'`이라 화면엔 뜻만, 입력은 영어 철자) →
      정답 화면 표시 + "문제 N/전체" 진행 갱신 → `student_progress` mock
      쓰기 로그의 `clearedWords`에 반영 → 정원 성장 포인트(EnglishGarden의
      "🌿 성장 포인트 N" 원시값, `readGardenFilled`의 칸 수보다 세밀함)가
      정확히 +1(`useStudent.js`의 `recordSpellingAnswer` 정답 분기가
      `markWordCleared`를 1회만 호출) → 같은 단어를 다시 맞혀도(대조군)
      `markWordCleared`가 멱등이라 +0.
    - **A6-guided**: 대시보드 히어로 CTA("▶ 오늘의 학습 시작")로
      GuidedSession 진입 → 첫 단어의 발음(PronounceStep)·예문
      (ExampleStep)·퀴즈(QuizStep) 3단계를 실제로 통과 → 퀴즈 정답 순간
      `onQuizAnswer`(=`recordQuizAnswer`)가 `markWordCleared`를, STEPS
      소진 시점의 `goNext()`가 `onMarkCompleted`(=`markWordCompleted`)를
      호출해 **같은 단어**가 `student_progress` mock 쓰기 로그의
      `completedWords`/`clearedWords` 양쪽에 모두 기록됨을 확인 →
      `attachmentCore.js`의 `gardenSet`이 `cleared∪completedWords∪
      clearedWords` **합집합**이라 이 단어 하나는 정원 포인트를 정확히
      +1만 늘린다(두 콜백이 불렸다고 +2가 아님 — 실측으로 확정).
      PronounceStep/ExampleStep의 "따라 말하기"는 실제 마이크 녹음을
      요구하지 않는다 — headless Chromium의 `getUserMedia` 거부가
      `WordDetail.jsx`의 mic 에러 캐치 분기(`onAnyResult()`를 그대로
      호출)로 흡수되고, `window.speechSynthesis`도 음성이 0개인
      상태에서 `onend`를 정상 발생시켜(실측) 외부 TTS 네트워크 호출
      (`translate.googleapis.com` 등)로 폴백하지 않는다 — 3회 연속 실행
      전부 미mock 요청 0건.
- **관리자 화면**(`admin.spec.mjs`, B1~B6): PIN 로그인 → "반 관리" 탭에서
  교재 컨테이너 4종이 별개 카드, 카드 라벨에 유닛 수 포함(A/B=3개 유닛,
  C/D=1개 유닛) → "동아 윤정미" 유사명 페어를 각각 펼쳐도 카드별
  단어 id(fixture 접두사가 다름)가 섞이지 않음 → "학생 관리" 탭(기본
  숨김인 "🧪 테스트 계정 보기"를 켜야 QA 학생이 보임)에서 학생 카드 표시
  → "📚 교재 관리" 패널의 배정 요약에 primary(A, "(현재)" 표시)/
  secondary(B) 둘 다 노출, C/D는 미노출 → "배정할 교과서 추가" select에는
  아직 배정 안 된 C/D만 남고 `<option value>`가 각자의 fixture UUID와
  정확히 일치(문자열 라벨이 아니라 value로 판정).
  - 원 시나리오 문구("TextbookAssignmentPanel 드롭다운에 유닛 수 포함")는
    실제 코드 확인 결과와 정확히 일치하지 않았다 — 유닛 수 표시는
    `TextbookAssignmentPanel`이 아니라 "반 관리" 탭의 반 카드
    (`AdminScreen.jsx`의 `renderClassCard`)에 있었다. 두 화면을 조합해
    같은 검증 의도(유닛 수 노출/UUID로 별개 판정/유사명 비혼입)를
    충족시켰다 — 코드가 아니라 애초 문서 가정 쪽의 오차였다는 점을
    정직하게 남긴다.
  - 실측 함정: 반 카드를 펼치면 "🔗 교재 연결" 위젯이 **다른** 반 이름을
    연결 후보 `<option>` 텍스트로 정당하게 포함한다(예: "중1 동아 윤정미"
    카드를 펼치면 그 안에 "중2 동아 윤정미"라는 문자열이 존재) — 카드
    컨테이너 전체를 `hasText`로 찾으면 이 정상 동작 때문에 두 카드가
    동시에 매치되는 오탐이 실제로 재현됐다. 카드 식별은 반드시 헤더
    `<p className="font-black text-gray-800">{className}</p>`만 정확히
    매칭해야 한다(카드 컨테이너 전체 텍스트로 찾지 말 것).

### registry.mjs 편입과 Release Gate

- `tests/harness/registry.mjs`에 `browserE2E` 도메인으로 등록하되
  `extra: true` — 브라우저가 설치되지 않은 환경(로컬 최초 클론 등)에서
  `npm run verify:all`이 이 이유만으로 빨간불이 되지 않게 하기 위함(등록
  항목 note에 이유 명시). `extra: true`는 "실행을 건너뛴다"는 뜻이
  아니라 "실패해도 도메인 전체 PASS/FAIL 판정에는 반영하지 않는다"는
  뜻이다(`tests/harness/runDomain.mjs`) — 그래서 브라우저가 없으면
  `testBrowserE2E.mjs` 자신은 실제로 FAIL(exit 1)하지만, `verify:all`은
  그 FAIL을 extra로 흡수해 계속 그린으로 남는다.
- `scripts/verifyRelease.mjs`에는 **Gate 5**로 필수 편입했다(`npm run
  verify:e2e` 실행, FAIL이면 게이트 FAIL). 로컬(비 CI)에서는
  `E2E_SKIP_IF_NO_BROWSER=1`을 자동 주입해 브라우저 미설치를 SKIP으로
  받아주지만, CI(`process.env.CI`)에서는 그 관용을 끄고 그대로
  fail-closed로 둔다 — `.github/workflows/release-gate.yml`이 Gate 5
  실행 전에 `npx playwright install --with-deps chromium`을 미리 실행해
  CI에서는 항상 브라우저가 있는 상태로 이 게이트를 돈다. `npm run
  verify:release -- --skip-e2e`로 Gate 5만 생략할 수 있다(빠른 반복용,
  CI/배포 전에는 쓰지 말 것 — 다른 Gate의 `--skip-build`/`--skip-verify`와
  동일한 관례).
- `scripts/testReleaseGate.mjs`가 Gate 5의 존재와 CI fail-closed
  배선(정적 검사)을 단언한다.

### 한계 — 이 하네스가 담당하지 않는 것

이 E2E는 **전부 mock**이다 — 실제 Supabase 프로덕션 DB의 현재 상태(유령
유닛 잔존, 배정 고아, 학생별 해석 체인 붕괴 등)는 검증하지 않는다. 그
분업은 `npm run prod:check`(READ-ONLY 라이브 invariant 스캔, Gate 3b)와
`npm run prod:hotfix`(승인 게이트 있는 실제 수정)가 담당한다 — 이 E2E는
"이 코드가 브라우저에서 렌더될 때 표시 결과가 맞는가"만 보고,
"프로덕션 데이터 자체가 건강한가"는 보지 않는다. 또한 실제 마이크/스피커
하드웨어가 필요한 말하기/듣기 도메인은 여전히 이 E2E의 범위 밖(기존
speaking/listening SKIP 사유와 동일한 구조적 한계)이다.
