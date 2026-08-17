// tests/harness/registry.mjs
//
// 얇은 오케스트레이션 레이어 — 이 파일은 로직을 재구현하지 않는다. 도메인별로
// "어떤 기존 scripts/testX.mjs를, 어떤 scripts/buildXBundle.mjs 실행 후에
// 돌려야 하는가"만 선언한다. 실제 검증 로직은 전부 scripts/의 실제 소스에
// 있다(TESTING.md 4개 카테고리 그대로).
//
// 각 항목은 실제 파일을 grep/read로 열어 process.env.*_BUNDLE 요구사항과
// import(...) 경로를 확인한 뒤 매핑했다(2026-07-18) — 추측 없음.
//
// BUILDERS: scripts/buildXBundle.mjs 하나가 만드는 산출물 1개.
//   env: null이면 해당 build 스크립트가 고정 경로(scripts/.tmp/...)에 쓰고
//        테스트 스크립트도 그 고정 경로를 하드코딩 import하므로 별도 env var
//        주입이 필요 없다(buildRaceBundle.mjs/buildMultiTabBundle.mjs 패턴).
//   env: 'XXX_BUNDLE'이면 테스트 스크립트가 process.env.XXX_BUNDLE을 읽으므로
//        러너가 그 값을 build 산출물 경로로 주입해야 한다.
export const BUILDERS = {
  wordlib: {
    build: 'scripts/buildWordLibBundle.mjs',
    env: 'WORDLIB_BUNDLE',
    out: 'scripts/.tmp/wordLibrary.bundle.mjs',
  },
  entrance: {
    build: 'scripts/buildEntranceBundle.mjs',
    env: 'ENTRANCE_BUNDLE',
    out: 'scripts/.tmp/entranceTestApi.bundle.mjs',
  },
  progress: {
    build: 'scripts/buildProgressBundle.mjs',
    env: 'PROGRESS_BUNDLE',
    out: 'scripts/.tmp/useStudent.progress.bundle.mjs',
  },
  // wordlib와 달리 supabaseClient를 scripts/fakeSupabaseModule.mjs로 갈아끼운
  // 번들 — 네트워크 0으로 refreshWordLibrary() 같은 조회 경로를 결정적으로
  // 검증한다(스텁이 PostgREST 1000행 상한을 실제로 강제한다).
  wordlibOffline: {
    build: 'scripts/buildWordLibOfflineBundle.mjs',
    env: 'WORDLIB_OFFLINE_BUNDLE',
    out: 'scripts/.tmp/wordLibrary.offline.bundle.mjs',
  },
  race: {
    build: 'scripts/buildRaceBundle.mjs',
    env: null, // testXxx.mjs가 scripts/.tmp/useStudent.race.bundle.mjs를 하드코딩 import
    out: 'scripts/.tmp/useStudent.race.bundle.mjs',
  },
  multitab: {
    build: 'scripts/buildMultiTabBundle.mjs',
    env: null, // 마찬가지로 scripts/.tmp/useStudent.multitab.bundle.mjs 하드코딩
    out: 'scripts/.tmp/useStudent.multitab.bundle.mjs',
  },
  speech: {
    build: 'scripts/buildSpeechBundle.mjs',
    env: 'SPEECH_BUNDLE',
    out: 'scripts/.tmp/speech.bundle.mjs',
  },
  paulReactions: {
    // 이건 src 파일이 아니라 테스트 스크립트 자체를 번들한다(파일 안에 PNG
    // 정적 import가 있어 plain Node ESM으로 직접 못 돌림 — 스크립트 헤더
    // 주석이 이미 이 방법을 지시하고 있었음). execPath로 실행 대상을 교체.
    build: 'scripts/buildPaulReactionsBundle.mjs',
    env: null,
    out: 'scripts/.tmp/testPaulReactions.bundle.mjs',
  },
}

// DOMAINS: CLAUDE.md 지시의 13개 도메인 + 실제 존재하는 추가 커버리지(extra:
// true로 표시, 운영자가 나열한 필수 13개 밖이지만 정직하게 같이 보고).
// checks 없이 skip 사유만 있으면 진짜로 실행 불가능한 도메인(가짜 PASS 금지).
export const DOMAINS = {
  login: {
    label: '로그인 / PIN 인증',
    checks: [
      { script: 'scripts/testStudentLogin.mjs', builders: ['wordlib'] },
      { script: 'scripts/testStudentSelectPinStatus.mjs', builders: [] },
      { script: 'scripts/testStudentPinAuth.mjs', builders: [] },
      { script: 'scripts/testStudentPinSelfSetup.mjs', builders: [] },
      { script: 'scripts/testAdminPinActionsDispatch.mjs', builders: [] },
      { script: 'scripts/testClearStudentPin.mjs', builders: [] },
      { script: 'scripts/testRlsSecurity.mjs', builders: [] },
      { script: 'scripts/testLoginRestoreCrash.mjs', builders: ['race'] },
    ],
  },
  student: {
    label: '학생 식별자 / 반 소속 무결성',
    checks: [
      { script: 'scripts/testIdentityMigration.mjs', builders: ['race'] },
      { script: 'scripts/testStarDeltaOnEntry.mjs', builders: ['race'], extra: true, note: '2026-08-12 — 이름 키 소유권 가드(claimName, useStudent.js loadRecord). 동일 기기·동일 표시이름의 다른 studentId가 앞서 생긴 계정의 로컬 진행도(별/스티커/캘린더)를 물려받는 실사고 재현 + 수정 검증. 신규 계정 진입 델타 0(대조군)/동명이인 가로채기 차단/재입장 중복지급 0/dedupKey 재호출 방어/실제 보상 정상 지급/다른 이름 조합 재확인 6개 시나리오, 25단언. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testMultiClass.mjs', builders: ['wordlib'] },
      { script: 'scripts/testRenameClass.mjs', builders: ['wordlib'] },
      { script: 'scripts/testClassDeleteCascade.mjs', builders: [] },
      { script: 'scripts/testRealClassNames.mjs', builders: ['wordlib'], extra: true, note: '2026-08-08 — 교과서 컨테이너 반 노출 차단(classifyRealClassNames 순수 함수, 네트워크 0). 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
    ],
  },
  admin: {
    label: '관리자 대시보드 / 반별 설정',
    checks: [
      { script: 'scripts/testDashboard.mjs', builders: ['wordlib'] },
      { script: 'scripts/testSpellingSettings.mjs', builders: ['wordlib'] },
      { script: 'scripts/testSpellingV2Db.mjs', builders: ['wordlib'] },
      { script: 'scripts/testGamificationSettings.mjs', builders: ['wordlib'], extra: true, note: 'Teacher Controls 마스터 스위치(classes.gamification_enabled) — 13개 필수 도메인 밖, 신규 보너스 커버리지' },
      { script: 'scripts/testEntranceTest.mjs', builders: [], extra: true, note: '입실시험 순수 로직 — 13개 필수 도메인 밖, 보너스 커버리지' },
      { script: 'scripts/testEntranceTestDb.mjs', builders: ['wordlib', 'entrance'], extra: true, note: '입실시험 라이브 e2e — 보너스 커버리지, 테이블 미적용 시 스크립트 자체가 안전하게 SKIP(exit 0)' },
      { script: 'scripts/testUnitNameNormalization.mjs', builders: ['wordlib'], extra: true, note: '2026-08-09 야간 — unitNameKey 정규화 계약(ensureUnit 형제 유닛 분열 재발 방지, "Unit 1"≡"Unit1"≡"unit 01"). 네트워크 0 순수 단언. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testEntranceClassScope.mjs', builders: ['wordlib', 'entrance'], extra: true, note: '2026-08-10 — 입실시험 조회 반 범위 계약(사람 반 ∪ 교재 컨테이너 반). 원장이 교재 반으로 시험을 시작하면 학생 배너가 안 뜨던 실사고 회귀 방지. READ-ONLY 라이브 검증(쓰기 0).' },
      { script: 'scripts/testEntranceEligibilityRules.mjs', builders: [], extra: true, note: '2026-08-11 — 입실시험 eligibility 규칙 순수 단위 테스트(mock 픽스처, 네트워크 0). 라이브 테스트는 그날 데이터에 케이스가 없으면 SKIP만 늘어 규칙 변경을 못 잡으므로, 규칙 자체를 여기서 고정한다(운영자 확정 8개 시나리오 + 반증 테스트).' },
      { script: 'scripts/testEntranceStressMatrix.mjs', builders: [], extra: true, note: '2026-08-14 — 입실시험 조합 스트레스 매트릭스(P4): 학생 수(1/5/8/12/20) × 시험 구성(0/1/2동시/종료후신규) × 교재(1~4개, 반기본±) × 세션(fresh/stale) × 계정 오염(테스트/아카이브/유사이름/대소문자) × 기제출(0~2) 전수 스윕 + 다인원 격리(5/8/12/20명) + 랭킹/중복제출 수렴(bestResultPerStudent -> rankResults 합성 계약 고정). 100 결정론 시나리오 496단언, mock 전용(라이브 DB 무접촉). 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testWritingDirectionEngine.mjs', builders: [], extra: true, note: '2026-08-14 — 쓰기 출제 방향 엔진(P7, Irene 제보 후속): 세 모드 계약 + mixed 40/100/500/1000문제 × 시드 5종 50:50(±홀수1)·쏠림 0·방향전환 하한 + random 대수법칙 + 방어 입력 + 설정 유지 구조(방향의 SoT는 DB 컬럼, localStorage 미저장이라 새로고침/재로그인 표류 불가, Unit 독립). 코드 정상 확정 — Irene 증상의 원인은 반 설정 spelling_direction=kr2en(관리자 화면에서 혼합으로 변경, SQL 불필요). 실기기 확인 PENDING 유지. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testEntranceKr2enCollision.mjs', builders: [], extra: true, note: '2026-08-15 — 입실시험 kr2en 동의어 충돌 회피(운영자 승인 1안): 고1 입실시험(mixed)에서 work out="운동하다"와 exercise="운동하다; 운동"이 같은 시험 풀에 있었는데 kr2en 문항이 exercise로 나오자 동의어 work out 입력이 오답 처리된 실사고(학생 2명 피해)를 재현·고정. mixed/random 모드에서 시험 풀 안에 뜻이 겹치는 다른 단어가 있는 단어는 kr2en을 배정받지 않도록(en2kr 고정) spelling.js answersOverlap + entranceTest.js buildEntranceQuestions를 수정 — 채점 규칙 자체는 무변경. 수정 전 소스로 2개 단언(mixed/random 충돌 배정) FAIL 실측(규칙 15) 후 수정. 고정 방향 시험(en2kr/kr2en 전체 고정) 불변 + mixed 50:50 균형 보존 + 비충돌 풀 무회귀 + prompt/answer 파생 계약까지 26단언. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testEntranceBannerFreshScope.mjs', builders: ['wordlibOffline'], extra: true, note: '2026-08-14 — 수업 직전 배정 반영(stale assignment cache, Amin 실사고). 16:56 교재 배정 -> 17:57 시험 생성 순서에서 이미 켜져 있던 앱 세션의 _studentAssignmentsCache가 배정 이전 상태로 고정돼 배너 scope에 새 교재 반이 없어 시험이 앱 재시작 전까지 안 보였다(서버 eligibility는 PASS — 순수 클라이언트 캐시 문제). getStudentEntranceClassIds { fresh } 옵션(학생당 인덱스 조회 1회, 캐시 재적재) + 배너의 B10 폴링 중단 뒤집기(0건 동안 fresh 재해석, 60초 주기/가시성 가드 유지)를 고정. 기본 호출 캐시 동작 불변/배정 철회 반대 방향/진행도·보상 테이블 무접촉까지 검증. 수정 전 소스로 4단언 FAIL 실측(규칙 15). 오프라인 스텁, 네트워크 0.' },
      { script: 'scripts/testEntranceRosterMinbyungchun.mjs', builders: [], extra: true, note: '2026-08-13 — "고1 능률 민병천" 실제 학생 12명 회귀 fixture(운영자 확정 실명단: 황다은Dana/박서진Rogan/김태율Terry/권교빈Liam/황성연Colin/박건우Ethan/전하은Haeun/최은경Nana/김보민Chloe/김규민Richard/김가윤Joy/현다율Essel). 94차 분모 10 vs 12 사고(SCA 누락 4 − 테스트계정 오집계 2 상쇄)의 양방향 재발 방지: mock 파트(항상 실행)는 오염 요소(Barry/Jinaa/_DUP/QA_/타반)를 섞어도 정확히 12명이 나오는지 + SCA 행이 빠지면 분모가 주는 방향까지 재현. 라이브 파트(READ-ONLY, .env 없으면 SKIP)는 실제 DB 집계 12명/누락0/초과0 대조 — students.name이 한글명/영문명 어느 쪽이든 인정(실측: 최은경은 "Nana"로 등록). 쓰기 0건.' },
      { script: 'scripts/testEntranceClassroomMatrix.mjs', builders: [], extra: true, note: '2026-08-13 — 입실시험 실전 수업 시나리오 매트릭스 CASE 1~20 + 채점 불변식(mock 픽스처, 네트워크 0, 라이브 DB 무접촉). 실제 교실에서 반복 발생한 상황을 코드 계약으로 고정한다: 시험 1개 즉시 진입/두 교재 중 현재 학습 교재 우선/중2의 고1 교재 미차단/동률 시 선택 UI/완료 시험이 새 시험을 가리지 않음/재접속 중복 제출 방지(DB unique + 서버 upsert onConflict + 클라 finishedRef 3중 방어를 소스로 단언)/새로고침 시 선택 유지/40단어 유닛 1~40 전량 출제/마지막 5개 단어 노출/Unit·교재 변경 시 단어 비혼입/시험 재시작 snapshot 분리/종료 시험 미노출/다중 학생 상태 격리/테스트계정 QA 응시 가능하되 통계 제외/이름 부분일치 금지(명시적 account status)/반 이동 이력 학생의 과거 class_id 미노출/추가 교재 배정이 반 전체로 확산되지 않음/모바일 반응형 정적 점검. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testEntranceTestSelection.mjs', builders: [], extra: true, note: '2026-08-12 — 입실시험 "어느 시험을 볼 것인가" 우선순위(entranceTestSelection.js, import 0 순수 모듈). eligibility(누가 볼 수 있는가)와 짝을 이루는 별개 규칙. 실사고: 두 교재에 배정된 Song이 findActiveTest의 created_at 임의 선택 탓에 아침에 열려 종료 안 된 다른 교재 시험에 영영 가려 반 친구와 다른 시험을 봤다(0/10). 1순위 현재 학습 교재+유닛 / 2순위 개별 배정 교재 / 3순위 반 기본 교재 / 동률이면 임의 선택 금지하고 학생 선택 UI. A~G 7시나리오(단일 시험 기존 동작/반 기본≠학습교재/중2의 고1 교재/동률 선택 UI/응시완료 제외/테스트계정 QA 접근 유지/타 학생 노출 불변) 47단언, 네트워크 0.' },
    ],
  },
  homework: {
    label: '숙제(daily_assignments 배정 + student_daily_progress.categories_completed 완료판정)',
    checks: [
      { script: 'scripts/testDailyAssignment.mjs', builders: ['wordlib'] },
      { script: 'scripts/testFutureAssignment.mjs', builders: ['wordlib'] },
      { script: 'scripts/testSyncProgress.mjs', builders: ['wordlib'] },
      { script: 'scripts/testAssignmentPlanner.mjs', builders: [], extra: true, note: '배정 자동 생성 순수 플래너(pickNextAssignment/planBulkDates, 2026-08-01) — 13개 필수 도메인 밖, 신규 보너스 커버리지. assignmentPlanner.js가 완전 순수(Supabase/React 없음)라 번들 불필요.' },
    ],
  },
  quiz: {
    label: '퀴즈 스텝 리셋 / 리액션',
    checks: [
      { script: 'scripts/testQuizStepReset.mjs', builders: [] },
      { script: 'scripts/testPaulReactions.mjs', builders: ['paulReactions'], execPath: 'scripts/.tmp/testPaulReactions.bundle.mjs', extra: true, note: '13개 필수 도메인 밖, 보너스 커버리지. PNG 정적 import 때문에 스크립트 자체를 esbuild로 번들해서 실행(파일 헤더 주석이 지시하는 방법 그대로).' },
      { script: 'scripts/testPureUtils.mjs', builders: [], extra: true, note: '2026-08-08 야간 — 순수 유틸 단위 테스트(네트워크/DB 무접촉)' },
    ],
  },
  writing: {
    label: '쓰기시험(스펠링 채점 / 방향 배선)',
    checks: [
      { script: 'scripts/testSpelling.mjs', builders: [] },
      { script: 'scripts/testSpellingDirectionWiring.mjs', builders: [] },
      { script: 'scripts/testWritingReviewAiPipeline.mjs', builders: [], extra: true, note: 'Task 2(쓰기 답안 검토 AI 보조, 2026-07-23) 규칙 기반 파이프라인/캐시/배치/AI 오류처리/일괄 액션 계획 — 전부 픽스처, AI는 mock(실제 Anthropic 호출 없음). 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
    ],
  },
  speaking: {
    label: '말하기(녹음 후 따라 말하기)',
    skip: 'getUserMedia/MediaRecorder는 실제 마이크 하드웨어 + 브라우저 권한 UI가 필요 — headless Node/CI 환경에서 실행 불가. scripts/ 전체(51개 파일)를 확인했지만 이 도메인을 커버하는 test*.mjs가 존재하지 않는다(TESTING.md 4개 카테고리 어디에도 speaking 전용 항목 없음) — 거짓 PASS 대신 정직한 SKIP.',
  },
  listening: {
    label: '듣기(발음 재생, 실제 소리 인지)',
    skip: '실제 스피커 출력이 사람 귀로 들리는지는 headless 환경에서 관측 불가. audioTts 도메인의 testTtsSingleton.mjs는 "중복 호출 방지(에코 가드)" 로직만 검증하고 실제로 소리가 나는지/음질이 맞는지는 검증하지 않는다 — 별도로 분리해 정직하게 SKIP 처리.',
  },
  unitSwitching: {
    label: '유닛 전환 / 이어서 학습',
    checks: [
      { script: 'scripts/testUnitPersistence.mjs', builders: ['wordlib'] },
      { script: 'scripts/testUnitNaturalSort.mjs', builders: ['wordlib'] },
      { script: 'scripts/testUnitResumeIndex.mjs', builders: ['progress'] },
      { script: 'scripts/testStudentUnitDecouple.mjs', builders: ['wordlib'] },
      { script: 'scripts/testStudentSelectUnitSwitch.mjs', builders: ['wordlib'] },
      { script: 'scripts/testWordLibraryPagination.mjs', builders: ['wordlibOffline'], extra: true, note: '2026-08-12 — words 1000행 절단(P0) + 유닛 임의 폴백 회귀. 실사고: words가 1093행이 되자 range 없는 조회가 1000행만 받아 93개 단어(24개 유닛의 position 38~49)를 에러 없이 버렸고, 40단어 유닛이 38개로 출제됐다. 함께 getClassWords의 `units.find(name) || units[0]` 무음 폴백(요청한 유닛이 없으면 조용히 첫 유닛 단어를 반환)도 제거. 스텁이 PostgREST 1000행 상한을 실제로 강제하므로 페이지네이션이 없으면 반드시 FAIL한다(수정 전 소스로 20단언 FAIL 실측 확인, 규칙 15). 절단 0/동명 유닛 비혼입/Song·Luke 배정 유닛 정확 조회/기존 경로 무회귀 6시나리오, 48단언. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testStaleCacheRevalidation.mjs', builders: ['wordlibOffline'], extra: true, note: '2026-08-15 — stale cache BUG(98차 감사): 관리자 변경(단어 업로드/교재·Unit 배정/반설정)이 켜둔 학생 세션에 반영 안 되는 3개 갭을 고정. 갭① invalidateStudentAssignmentsCache(SCA 캐시를 App.jsx visibility 재검증에 편입, 네트워크 0) — getStudentPrimaryTextbook/getStudentAssignedTextbookIds 같은 동기 소비자의 스테일 해소, 실제 재조회는 다음 실제 읽기가 담당. 갭② refreshAllForLogin(재로그인 시 단어/교재/반설정/SCA 4종 전체 무효화, initWordLibrary 미완료 콜드 상태면 기존 refreshStudents 단독 동작으로 폴백해 중복 fetch 방지). 갭③ revalidateUnitWords(연속 foreground에서 유닛 진입 시 서버 단어 "수"만 HEAD count로 가볍게 확인, 불일치 시에만 전체 refreshWordLibrary, 같은 유닛 60초 스로틀). 수정 전 소스(신규 export 3개를 no-op으로 되돌린 임시 스텁)로 12단언 FAIL 실측(규칙 15) 후 복원. 배너 파일(EntranceTestBanner.jsx) 무접촉/진행도·보상 테이블 무접촉까지 확인.' },
    ],
  },
  persistence: {
    label: '진행도 저장 / 복원 / 병합(로컬+클라우드) + DB 무결성',
    checks: [
      { script: 'scripts/testProgress.mjs', builders: ['progress'] },
      { script: 'scripts/testMergeProgress.mjs', builders: ['progress'] },
      { script: 'scripts/testRestoreSyncRace.mjs', builders: ['race'] },
      { script: 'scripts/testMultiTabRace.mjs', builders: ['multitab'] },
      { script: 'scripts/testClearedStars.mjs', builders: ['multitab'], note: 'M4b Cleared Stars — clearedWords 기반 파생 별, 중복 지급 구조적 불가 증명' },
      { script: 'scripts/testMultiDeviceMerge.mjs', builders: ['wordlib', 'progress'] },
      { script: 'scripts/testFullProgressBackup.mjs', builders: ['wordlib'] },
      { script: 'scripts/testResetWordStatusBackup.mjs', builders: ['wordlib'] },
      { script: 'scripts/dbIntegrityAudit.mjs', builders: [], extra: true, note: '읽기 전용 라이브 고아 레코드 전수 감사 — 13개 필수 도메인 밖, 보너스 커버리지' },
    ],
  },
  dailyStudy: {
    label: '주간 학습 리포트(daily-study)',
    checks: [
      { script: 'scripts/testWeeklyReport.mjs', builders: [] },
    ],
  },
  wordAssignment: {
    label: '반/날짜별 단어 배정(word-assignment, homework와 스크립트 공유 — 배정 자체 관점)',
    checks: [
      { script: 'scripts/testDailyAssignment.mjs', builders: ['wordlib'] },
      { script: 'scripts/testFutureAssignment.mjs', builders: ['wordlib'] },
      { script: 'scripts/testAssignmentPlanner.mjs', builders: [], extra: true, note: '배정 자동 생성 순수 플래너(pickNextAssignment/planBulkDates, 2026-08-01) — homework 도메인과 동일 스크립트 공유(테스트 로직 중복 없음).' },
    ],
  },
  audioTts: {
    label: 'TTS 중복 호출 방지(에코 가드) — 로직 전용, 실제 오디오 재생 아님',
    checks: [
      { script: 'scripts/testTtsSingleton.mjs', builders: ['speech'] },
    ],
  },
  paulRank: {
    label: 'Paul Rank System(2026-07-19) — XP 원장/Rank·Hat Stage 계산/중복 지급 방지',
    checks: [
      { script: 'scripts/testPaulRank.mjs', builders: [], extra: true, note: '순수 함수(Rank/Hat Stage 계산, XP 이벤트 테이블, 중복 방지 입력검증 헬퍼) — 13개 필수 도메인 밖, 신규 보너스 커버리지. paulRankShared.js가 완전 순수(React/import.meta.env 없음)라 번들 불필요.' },
      { script: 'scripts/testXpLedgerDb.mjs', builders: ['wordlib'], extra: true, note: 'xp_ledger 라이브 e2e(중복 지급 실측 차단 증명 + Unit 전환 무영향 실측) — 테이블 미적용 또는 SUPABASE_SERVICE_ROLE_KEY 로컬 미설정 시 스크립트 자체가 안전하게 SKIP(exit 0), Vercel 프로덕션(서비스롤 키 설정됨)에서는 전체 검증.' },
    ],
  },
  ticketEconomy: {
    label: 'Ticket Economy(2026-07-19) — 원장 append/합산/병합, Daily Missions 후킹 중복지급 방지, Rewards 상점',
    checks: [
      { script: 'scripts/testTicketEconomy.mjs', builders: [], extra: true, note: '순수 함수(원장 append-only/idempotent, sumTicketBalance 파생 합산, mergeTicketLedgers id 합집합, grantTicket 하루 1회 방지, REWARD_CATALOG 결정론적 구매) — 13개 필수 도메인 밖, 신규 보너스 커버리지. ticketEconomy.js가 완전 순수(React/import.meta.env 없음)라 번들 불필요.' },
    ],
  },
  wordKing: {
    label: 'Word King(2026-07-19) — 주간·서버 전용 계산(소표본 왜곡 보정, 이상치 표), 관리자 트리거 API',
    checks: [
      { script: 'scripts/testWordKing.mjs', builders: [], extra: true, note: '순수 함수(주간 기간 계산, 소표본 왜곡 보정 16.3, 이상치 표 16.6, 결정적 tie-break) — 13개 필수 도메인 밖, 신규 보너스 커버리지. wordKing.js가 완전 순수(React/import.meta.env 없음)라 번들 불필요.' },
      { script: 'scripts/testComputeWordKingApi.mjs', builders: ['wordlib'], extra: true, note: '관리자 트리거 API 라이브 e2e(재인증/입력검증은 ADMIN_PIN만 있으면 검증, 실제 계산+저장은 word_king_history 테이블 + SUPABASE_SERVICE_ROLE_KEY 둘 다 있어야 — 없으면 스크립트 자체가 안전하게 SKIP(exit 0), Vercel 프로덕션에서는 전체 검증.' },
    ],
  },
  houseSystem: {
    label: 'House System(2026-07-19) — 자동배정 라운드로빈, 주간 팀 점수 집계(양수 delta만), Weekly Events 설정 슬롯',
    checks: [
      { script: 'scripts/testHouseSystem.mjs', builders: [], extra: true, note: '순수 함수(HOUSES 상수/getHouseById, assignBalancedHouseId 결정론적 균형 배정, computeHouseCounts, getWeekPeriod ISO 주, computeHouseWeeklyScores 양수 delta만 합산, getOwnHouseWeeklyDisplay 개인/타하우스 비교 없음, WEEKLY_EVENT_TYPES 빈 슬롯) — 13개 필수 도메인 밖, 신규 보너스 커버리지. houseSystem.js가 완전 순수(React/import.meta.env 없음)라 번들 불필요.' },
    ],
  },
  seasonalProgression: {
    label: 'Seasonal Progression(2026-07-19, 2026-07-23 생애주기 확장) — 시즌 경계 이후만 합산(Ticket 잔액/House 누적 점수), 레벨·뱃지·스트릭 불변 확인 + 시즌 전환 API 계약',
    checks: [
      { script: 'scripts/testSeasonalProgression.mjs', builders: [], extra: true, note: '순수 함수(ticketEconomy.js sumTicketBalanceSince, houseSystem.js computeHouseSeasonScores) — 시즌 경계 전/후 데이터 분리, 원장 append-only 불변, 레벨/뱃지/스트릭류 필드는 이 계산 경로가 애초에 참조하지 않음을 확인 — 13개 필수 도메인 밖, 신규 보너스 커버리지. 두 함수 모두 완전 순수(React/import.meta.env 없음)라 번들 불필요.' },
      { script: 'scripts/testStartNewSeasonApi.mjs', builders: [], extra: true, note: '2026-07-23 season-system-specialist 신규 — api/start-new-season.js 계약 테스트. `seasons`가 전역 단일 테이블이라(word_king_history와 달리 class_id로 격리 불가) QA 데이터로 실제 insert/RPC를 검증할 수 없다 — 인증/메서드 가드는 실제 핸들러를 안전하게 직접 호출(DB 호출 이전 차단), RPC/레거시 폴백 계약은 globalThis.fetch를 가로채는 순수 mock(실제 네트워크 요청 0건)으로 검증. Postgres 트랜잭션 고유 보장(advisory lock 직렬화, is_active unique index)은 JS mock으로 증명 불가라 정직하게 SKIP 처리(supabase_v3_5_season_lifecycle.sql 실행 후 라이브 검증 필요, CLAUDE.md 규칙 18).' },
    ],
  },
  // ── 2026-07-23 등록: standalone 하네스 5종 verify:all 편입 ──
  // 아래 5개 도메인의 검증 로직은 scripts/testX.mjs가 아니라 자기완결형
  // 하네스 파일(tests/harness/run*.mjs — 순수 모듈 직접 import + 자체 단언)에
  // 있다. registry의 기존 관례(checks = scripts/* child-process 실행)에 맞춰
  // 그 하네스 파일 자체를 child-process로 spawn한다 — 각 파일이 이미
  // runDomain.mjs와 동일한 출력 포맷(PASS/FAIL/summary/exit code)을 지키므로
  // 러너 수정 없이 그대로 편입 가능(감사 문서 09 R1). extra 표시를 하지 않는
  // 이유: 이 5개는 각자 npm run verify:<domain> 스크립트를 가진 정식 도메인
  // 하네스라, FAIL이 verify:all의 exit code에 실제로 반영돼야 한다(가짜 PASS 금지).
  dailyRitual: {
    label: '3분 데일리 리추얼 — 적응형 마이크로 세션 플래너 (verify:daily-ritual과 동일 실행)',
    checks: [
      { script: 'tests/harness/runDailyRitual.mjs', builders: [], note: '자기완결형 하네스(src/utils/dailyRitual.js 순수 모듈 직접 import, 번들 불필요) — 118단언.' },
    ],
  },
  attachment: {
    label: '애착 시스템(Attachment & Growth) — 파생 통계/모자/밀스톤/기억/월드/이야기 (verify:attachment와 동일 실행)',
    checks: [
      { script: 'tests/harness/runAttachment.mjs', builders: [], note: '자기완결형 하네스(src/utils/attachment/* 순수 모듈 직접 import, 번들 불필요) — 123단언.' },
    ],
  },
  analytics: {
    label: '익명 관찰 레이어 — 순수 집계(analyticsMath) (verify:analytics와 동일 실행)',
    checks: [
      { script: 'tests/harness/runAnalytics.mjs', builders: [], note: '자기완결형 하네스(src/utils/analyticsMath.js import-0 순수 모듈 직접 import) — 12단언 + 프라이버시 코드 레벨 검사.' },
    ],
  },
  reading: {
    label: 'Reading Foundation(v3.3) — 순수 모델(readingModel) (verify:reading과 동일 실행)',
    checks: [
      { script: 'tests/harness/runReading.mjs', builders: [], note: '자기완결형 하네스(src/utils/readingModel.js import-0 순수 모듈 직접 import) — 21단언.' },
    ],
  },
  sentenceLearning: {
    label: 'Sentence Learning(v3.4) — 순수 엔진(sentenceLearning) (verify:sentence-learning과 동일 실행)',
    checks: [
      { script: 'tests/harness/runSentenceLearning.mjs', builders: [], note: '자기완결형 하네스(src/utils/sentenceLearning.js import-0 순수 모듈 직접 import) — 49단언.' },
    ],
  },
  // ── 2026-08-01 등록: Curriculum Engine Phase 0(docs/CURRICULUM_ENGINE.md)
  // 통합 커밋 I3 — 위 sentenceLearning과 동일한 "자기완결형 하네스를
  // child-process로 spawn" 관례. 두 하네스 모두 내부에서 esbuild로
  // 확장자-없는-상대-import 파일(generatorContract.js/registry.js)만
  // 인메모리 번들(네트워크/환경변수 의존 없음 — 여전히 pure 섹션, 각 파일
  // 헤더 주석 참고)하고, examples는 추가로 live 섹션(env 없으면 SKIP,
  // 있으면 테이블 부재 폴백 확인 또는 전체 CRUD 왕복)을 갖는다.
  examples: {
    label: 'Curriculum Engine — examples 모듈(승인 상태머신/검증/필터 계약) (verify:examples와 동일 실행)',
    checks: [
      { script: 'tests/harness/runExamples.mjs', builders: [], note: '자기완결형 하네스 — pure 섹션(curriculumModel.js 순수 모듈 직접 import + generatorContract.js는 esbuild 인메모리 번들) 36단언 + live 섹션(env 없으면 SKIP, 있으면 테이블 부재 폴백 확인/CRUD 왕복).' },
      { script: 'scripts/testExamplePriorityMock.mjs', builders: [], extra: true, note: '2026-08-09 야간 — 학생 예문 우선순위(SOURCE TEXT FIRST) mock 검증: fetch 가로채기로 네트워크/DB 0회, 배포 코드(exampleLibrary) 번들 그대로 구동. curriculumExamplesStudentUI 플래그 프로덕션 온 전의 사전 검증 자산. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
    ],
  },
  // ── 2026-08-10 등록: Writing Coach MVP(docs/WRITING_COACH.md) — 로컬 규칙
  // 기반 문장 검사/힌트 진행/자가 수정 인정/3회 후 정답 공개 상태 머신.
  // 전부 순수 모듈(네트워크/DB 0) — 플레인 Node 직접 import.
  writingCoach: {
    label: 'Writing Coach — 오류 taxonomy/규칙 검사/세션 상태 머신 (verify:writing-coach와 동일 실행)',
    checks: [
      { script: 'scripts/testWritingCoach.mjs', builders: [], note: '운영자 시나리오 축어 재현("I go to park yesterday." 2오류→자가 수정 인정→완료) + 오탐 방어(무관사 관용 school/home 예외 등) + 3회 후 공개 게이트 — 74단언.' },
    ],
  },
  // ── 2026-08-09 등록: 게임화 코어 순수 모델(docs/GAME_REWARD_RULES.md) —
  // 오늘의 미션 파생 판정 + streak(주 1회 freeze/최고 기록 보존) 계산.
  // 전부 기존 기록(student_daily_progress/word_status)의 파생 — 지급 없음.
  gamificationCore: {
    label: '게임화 코어 — 오늘의 미션/streak 순수 모델 (verify:gamification과 동일 실행)',
    checks: [
      { script: 'scripts/testGamificationModels.mjs', builders: [], note: 'import-0 순수 모듈 직접 로드(네트워크/DB 0회) — 미션 4종 판정/불가능 미션 방지/streak freeze·best 보존·마일스톤 24단언.' },
    ],
  },
  learningEngine: {
    label: 'Learning Engine — 모드 레지스트리/어댑터/결정론 (verify:learning-engine과 동일 실행)',
    checks: [
      { script: 'tests/harness/runLearningEngine.mjs', builders: [], note: '자기완결형 하네스(learningItem.js 순수 모듈 직접 import + registry.js는 esbuild 인메모리 번들) — 21단언.' },
    ],
  },
  // ── 2026-08-01 등록: Memory Engine(docs/research/memory-engine.md) —
  // Leitner 박스 모델(§6.3) + 난이도/복습 큐 + 저장 코덱·백엔드 + 세션
  // 플래너 + 메트릭/AI 플러그 포인트. 위 learningEngine과 동일한
  // "자기완결형 하네스를 child-process로 spawn" 관례.
  memoryEngine: {
    label: 'Memory Engine — Leitner 박스 모델/난이도/복습 큐/저장 코덱/세션 플래너 (verify:memory-engine과 동일 실행)',
    checks: [
      { script: 'tests/harness/runMemoryEngine.mjs', builders: [], note: '자기완결형 하네스 — leitner.js/difficulty.js/reviewQueue.js/reviewDataCodec.js/memoryMetrics.js/memoryPlugPoints.js는 순수 모듈 직접 import(형제 파일은 명시적 .js 확장자라 번들 불필요), reviewDataBackend.js는 mock client/storage 주입으로 실 네트워크 0인 채 전체 로직 검증, sessionPlanner.js는 registry.js와 함께 esbuild 인메모리 번들(sentenceLearning.js 재사용 확인 겸 방출 모드가 Learning Engine 레지스트리에 실재하는지 교차 검증). emit.js(IO 래퍼, productEvents.js 경유)만 소스 레벨 검사(정직한 커버리지 경계 — 모듈 스코프에서 실 Supabase 클라이언트를 생성해 plain Node import 시 크래시하므로 실행하지 않음). 108단언.' },
    ],
  },
  // ── 2026-08-04 등록: Word Asset Library M2(클라이언트 읽기/쓰기 계층,
  // supabase_v3_15_word_assets.sql — 아직 운영자 수동 실행 대기) ──
  wordAssets: {
    label: 'Word Asset Library — 클라이언트 읽기/쓰기 계층(word_assets, M2) (verify:word-assets와 동일 실행)',
    checks: [
      { script: 'tests/harness/runWordAssets.mjs', builders: [], extra: true, note: '자기완결형 하네스 — src/utils/wordAssets.js가 모듈 최상단 static import 0개로 설계돼(supabaseClient/wordLibrary는 함수 내부 동적 import) esbuild 번들 없이 plain Node가 직접 import 가능. mergeWordAsset(교사 입력 비덮어쓰기/meaning 채점 보호/신규 필드 추가/빈 assetMap 참조 동일성)·normalizeWordAssetRow·wordAssetKey·filterWordAssetPayload(쓰기 화이트리스트) 순수 로직 + adminPin 부재 시 네트워크 호출 없이 admin_pin_required 반환하는 계약을 검증. word_asset.upsert(_bulk) 액션은 admin-content-write Edge Function에 아직 미배포(M4 범위)라 실제 왕복은 검증하지 않음 — 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
    ],
  },
  // ── 2026-08-04 등록: Word Asset Library M3b(규칙 기반 단어 자산 생성기,
  // AI 호출 0건 — src/utils/wordAssetRules.js) ──
  wordAssetRules: {
    label: 'Word Asset Library — 규칙 기반 생성기(word_assets, M3b, AI 호출 0건) (verify:word-asset-rules와 동일 실행)',
    checks: [
      { script: 'tests/harness/runWordAssetRules.mjs', builders: [], extra: true, note: '자기완결형 하네스 — src/utils/wordAssetRules.js는 import 0개(진짜 순수, plain Node 직접 import) 설계. guessPartOfSpeech(접미사 고확신 휴리스틱)·estimateSyllables·estimateDifficulty·defaultReviewIntervalDays·buildImagePrompt·buildRuleBasedAsset(s) 검증 — 특히 difficulty 1~5/base_review_interval_days∈BOX_INTERVALS_DAYS 도메인 전수 확인(DB CHECK 위반 시 백필 전체 실패 방지), AI 전용 컬럼(cefr/pronunciation_uk/gesture/emoji/tags/synonyms/antonyms/image_url/ai_model) 미오염, wordAssets.js의 WORD_ASSET_WRITABLE_COLUMNS 화이트리스트 정합. 아직 AdminScreen.jsx/wordLibrary.js 어디에도 배선되지 않음(M3b는 순수 계층만) — 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
    ],
  },

  // ── 2026-08-15 등록: Reward System V1(GAME_REWARD_RULES.md 후속, 별도
  // "레벨/보상" 원장) — Phase 1(순수 규칙 rewardEngine.js) + Phase 2
  // (useStudent.js 배선 + UI) ──
  rewardSystem: {
    label: 'Reward System V1 — 별 지급 규칙(순수)/원장 배선/앵커 5종 (verify:reward와 동일 실행)',
    checks: [
      { script: 'scripts/testRewardEngine.mjs', builders: [], extra: true, note: '2026-08-15 Phase 1 — rewardEngine.js(REWARD_STARS/STREAK_BONUS/LEVELS/rewardIdempotencyKey/streakBonusStars/levelForStars/starsToNextLevel/buildRewardEntry/hasRewardEntry/appendRewardEntry/earnedStars) 완전 순수 계약(import 0개, Date.now/Math.random/new Date 소스 레벨 금지 정적 검사 포함) + supabase_v3_36/v3_37 SQL 정적 단언(멱등/파괴적 DDL 없음/precheck·postcheck) 63단언. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testRewardFlow.mjs', builders: ['race'], extra: true, note: '2026-08-15 Phase 2 — grantLedgerReward(useStudent.js) + 앵커 5종(word-session-complete +1/writing-complete +2/exam-complete +2/wrong-word-recovered +1/daily-goal-complete +3/streak-bonus 가변) 통합 테스트(fakeReact + race 번들, 네트워크 0). 운영자 결정 고정: 레거시 MISSION_BONUS_STARS(+10, 라운드 반복마다 매번 재지급)는 무변경 유지 + 신규 daily-goal-complete는 날짜 키 하루 1회로 별도 공존, rewardIdempotencyKey는 학생별 전역 unique. 신규 학생 진입 델타 0/중복 발화·리마운트·재로그인 재지급 0/mergeRewardLedgers union(local 우선)/구버전 레코드 normalize 안전까지 55단언. 배선 전 30단언 FAIL 실측(규칙 15) 후 배선. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testRewardBaselineMigration.mjs', builders: [], extra: true, note: '2026-08-17 — supabase_v3_37_reward_legacy_baseline.sql 이중 실행 절대 안전성(migration marker) 강화. 취약 시나리오: 첫 실행 당시 total_stars=0이라 대상에서 빠졌던 학생이 가동 후 별을 벌어 total_stars>0이 되면, idempotency_key unique 방어만으로는 재실행 시 그 학생에게 baseline이 새로 삽입돼 이중 계상되던 문제. reward_migration_log(migration_name primary key) marker 테이블을 v3_37 안에서 create if not exists로 추가해, 완료 기록이 있으면 precheck/INSERT/postcheck를 통째로 skip(무해한 no-op)하도록 고정. SQL 정적 단언(marker 테이블/skip 분기/ON CONFLICT/BEGIN·COMMIT/precheck·postcheck/student_progress 파괴적 DDL·DML 0건) + 순수 JS 인메모리 이중 실행 시뮬레이션(1회 실행/즉시 재실행/가동 후 재실행 이중계상 방지/total_stars 전수 불변/marker 없는 대조군의 실제 이중계상 재현 대조) — marker 비활성화 상태로 8단언 FAIL 실측(규칙 15) 후 SQL·스펙 함수에 marker 로직 추가해 PASS 전환. 네트워크 0, Supabase 미접촉. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
    ],
  },

  // ── words.bulk_replace diff 계획(P0 — word_status FK 보존) ──
  wordsBulkReplacePlan: {
    label: 'words.bulk_replace diff 계획(word_status FK 보존, P0) (verify:words-bulk-replace-plan과 동일 실행)',
    checks: [
      { script: 'tests/harness/runWordsBulkReplacePlan.mjs', builders: [], extra: true, note: '자기완결형 하네스 — src/utils/wordLibrary.js의 순수 함수 planWordsBulkReplace/buildAdminBulkReplaceRows를 esbuild 인메모리 번들(더미 env, 네트워크 0)로 직접 검증. 옛 delete-then-insert-all 방식과의 대조군을 포함해 회귀를 고정한다(겹치는 단어의 id가 하나도 보존되지 않아 word_status가 CASCADE 삭제되던 P0 버그). 배포 순서 단언(11~13)이 특히 중요 — 클라이언트 payload가 옛 서버가 읽는 5개 컬럼을 계속 포함하는지 고정해, Vercel만 먼저 배포되고 Edge Function이 아직 옛 코드인 창에서 오디오/예문/번역/암기팁이 null로 덮이는 사고를 막는다. 49단언, 13개 필수 도메인 밖 신규 보너스 커버리지.' },
    ],
  },
}

// Phase 6 최종 검증 매트릭스가 참조하는 "운영자 체크리스트 13항목" ↔ 위 도메인
// id 매핑(이름이 다르게 불릴 수 있어 별도 명시).
export const CHECKLIST_TO_DOMAIN = {
  '로그인': 'login',
  '학생': 'student',
  '숙제': 'homework',
  '유닛': 'unitSwitching',
  '퀴즈': 'quiz',
  '쓰기': 'writing',
  '말하기': 'speaking',
  '듣기': 'listening',
  '진행도': 'persistence',
  '관리자': 'admin',
  '모바일': null, // 아래 참고 — 특정 도메인이 아니라 "실행 환경" 자체의 제약
  '새로고침': null, // login/persistence의 restoreChecked 관련 테스트가 부분 커버(아래 참고)
  '영속성': 'persistence',
}
