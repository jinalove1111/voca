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
      { script: 'scripts/testClearStudentPin.mjs', builders: [] },
      { script: 'scripts/testRlsSecurity.mjs', builders: [] },
      { script: 'scripts/testLoginRestoreCrash.mjs', builders: ['race'] },
    ],
  },
  student: {
    label: '학생 식별자 / 반 소속 무결성',
    checks: [
      { script: 'scripts/testIdentityMigration.mjs', builders: ['race'] },
      { script: 'scripts/testMultiClass.mjs', builders: ['wordlib'] },
      { script: 'scripts/testRenameClass.mjs', builders: ['wordlib'] },
      { script: 'scripts/testClassDeleteCascade.mjs', builders: [] },
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
    ],
  },
  homework: {
    label: '숙제(daily_assignments 배정 + student_daily_progress.categories_completed 완료판정)',
    checks: [
      { script: 'scripts/testDailyAssignment.mjs', builders: ['wordlib'] },
      { script: 'scripts/testFutureAssignment.mjs', builders: ['wordlib'] },
      { script: 'scripts/testSyncProgress.mjs', builders: ['wordlib'] },
    ],
  },
  quiz: {
    label: '퀴즈 스텝 리셋 / 리액션',
    checks: [
      { script: 'scripts/testQuizStepReset.mjs', builders: [] },
      { script: 'scripts/testPaulReactions.mjs', builders: ['paulReactions'], execPath: 'scripts/.tmp/testPaulReactions.bundle.mjs', extra: true, note: '13개 필수 도메인 밖, 보너스 커버리지. PNG 정적 import 때문에 스크립트 자체를 esbuild로 번들해서 실행(파일 헤더 주석이 지시하는 방법 그대로).' },
    ],
  },
  writing: {
    label: '쓰기시험(스펠링 채점 / 방향 배선)',
    checks: [
      { script: 'scripts/testSpelling.mjs', builders: [] },
      { script: 'scripts/testSpellingDirectionWiring.mjs', builders: [] },
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
    ],
  },
  persistence: {
    label: '진행도 저장 / 복원 / 병합(로컬+클라우드) + DB 무결성',
    checks: [
      { script: 'scripts/testProgress.mjs', builders: ['progress'] },
      { script: 'scripts/testMergeProgress.mjs', builders: ['progress'] },
      { script: 'scripts/testRestoreSyncRace.mjs', builders: ['race'] },
      { script: 'scripts/testMultiTabRace.mjs', builders: ['multitab'] },
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
    label: 'Seasonal Progression(2026-07-19) — 시즌 경계 이후만 합산(Ticket 잔액/House 누적 점수), 레벨·뱃지·스트릭 불변 확인',
    checks: [
      { script: 'scripts/testSeasonalProgression.mjs', builders: [], extra: true, note: '순수 함수(ticketEconomy.js sumTicketBalanceSince, houseSystem.js computeHouseSeasonScores) — 시즌 경계 전/후 데이터 분리, 원장 append-only 불변, 레벨/뱃지/스트릭류 필드는 이 계산 경로가 애초에 참조하지 않음을 확인 — 13개 필수 도메인 밖, 신규 보너스 커버리지. 두 함수 모두 완전 순수(React/import.meta.env 없음)라 번들 불필요.' },
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
