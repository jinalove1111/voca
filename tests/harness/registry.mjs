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
    // ⚠️ CI 커버리지 공백 명시 (2026-08-27, 운영자 결정 "옵션 B", CLAUDE.md 규칙 18)
    // 아래 4개는 ADMIN_PIN(관리자 재인증 자격증명)이 있어야 실행된다.
    //   scripts/testStudentPinAuth.mjs
    //   scripts/testStudentPinSelfSetup.mjs
    //   scripts/testAdminPinActionsDispatch.mjs
    //   scripts/testClearStudentPin.mjs
    // ADMIN_PIN 은 .env.local(git 미추적)에만 있고, 이 저장소는 public 이라
    // GitHub Actions secret 에 넣지 않기로 했다(넣으면 pull_request 트리거 경로로
    // 노출 위험이 생긴다). 그래서 CI(.github/workflows/release-gate.yml)에서는
    // 이 4개가 "SKIP(exit 0)"으로 건너뛰어진다 — 예전처럼 abort(exit 1)로 게이트를
    // 통째로 빨간불로 만들지 않는다.
    //   · 로컬(.env.local 보유)에서는 지금까지와 100% 동일하게 전부 실행된다.
    //   · 대신 "CI 는 PIN 인증/관리자 재인증 경로를 검증하지 않는다"는 공백이
    //     실재한다. 그 경로를 건드리는 변경은 반드시 로컬에서 npm run verify:login
    //     (또는 verify:all)을 돌려 확인할 것.
    // 같은 SKIP 관례 선례: testComputeWordKingApi.mjs(ADMIN_PIN 부재 시 SKIP),
    // testXpLedgerDb.mjs / testEntranceTestDb.mjs(서비스롤 키·테이블 부재 시 SKIP).
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
      { script: 'scripts/testAdminUnitEdit.mjs', builders: [], extra: true, note: '2026-09-02 — 관리자 "반 배정 편집" 유닛 소스/저장 버그(Yaeji 유령 유닛 실사고) 회귀 방지. 예전 편집 폼은 유닛 목록을 사람 반(getClassUnitNames)에서 가져와 운영 반(유닛 미소유)에선 placeholder "Unit 1"만 떴고, saveEdit가 `editUnit || \'Unit 1\'`을 setStudentUnit에 넘겨 findUnitByName 공백제거 정규화(\'unit1\')가 교재의 1단어 유령 "Unit1"에 유일 매칭 → 실학생이 GHOST_UNIT+DIRECTION_INVALID. 또 반이 안 바뀌어도 setStudentClass를 호출해 current_unit_id NULL + SCA demote/껍데기 INSERT. 수정: getStudentUnitPool/getStudentEditableUnits(primary 교재의 학습 가능 유닛, 단어>=2, id 포함) + setStudentUnitById(UUID 저장, 풀 밖/유령 거부, 영향 행 1 검증) + setStudentUnit 강화(미존재 학생·미해석·유령 명시 거부, 0행 갱신 실패 처리) + 편집 폼은 반 변경 시에만 setStudentClass, 유닛은 UUID로만 저장, 실패 시 폼 유지. 하네스: wordLibrary esbuild 번들 + 쓰기 기록형 인메모리 가짜 supabase(network 0). 수정 전 33단언 중 19 FAIL 실측(규칙 15) 후 전체 PASS. 유령 유닛 DB 삭제 0. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testCreateStudentUnitAssignment.mjs', builders: [], extra: true, note: '2026-09-01 — create_student 신규 학생 교재/유닛 배정(P1 실사고 재발 방지). 예전 코드는 units.class_id = <사람 반>으로 유닛을 찾아, 유닛을 소유하지 않는 regular 반(예: Pre-Middle School)에서는 항상 null이 됐고 SCA에 textbook_id를 아예 안 넣어 "껍데기 배정"이 생겼다 — 2026-08-31 박민준·박성준이 이 경로로 UNIT_INVALID FAIL 2건 -> Release Gate 차단(데이터는 v3_41 수동 복구). 새 규칙: 요청 textbookId(학생별 primary 교재, 반 소유 or class_textbooks enabled 연결 검증 — 아니면 invalid_textbook fail-closed) -> 그 교재의 유닛에서 확정(명시 unitName 완전일치/정규화 유일후보 -> 없으면 "첫 학습 유닛" = 단어 2개 이상인 첫 유닛, 1단어 유령 구조적 제외). textbookId 미지정 시 반 소유 교재가 정확히 1개일 때만 폴백(regular 반 다수결 추측 금지), 그 외 기존과 동일 null(하위호환, 규칙 9). UI(StudentDirectory 생성 폼)는 반 선택 시 연결 교재 select 필수 + "첫 학습 유닛(자동)" 기본값. 하네스는 testPinSetupCapability와 동일 방식(esbuild 번들 + 인메모리 가짜 supabase 다중 테이블). 수정 전 27단언 중 13 FAIL 실측(규칙 15) 후 전체 PASS 전환. 네트워크 0, 실제 DB 접촉 0. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
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
      { script: 'scripts/testProdCheck.mjs', builders: [], extra: true, note: '2026-09-03 — Production Safety Harness Phase 1-A(다른 세션 산출물, prod-check-specialist). npm run prod:check — 라이브 프로덕션 데이터를 anon key 로 읽기 전용 조회해(scripts/lib/prodDataLoader.mjs) 불변식(scripts/lib/prodInvariants.mjs, 예: 유령 유닛에 실학생 배정 0건 등)을 검사하는 배포 후 확인 도구. DB write 0, service_role 미사용. 130단언 전체 PASS. 네트워크 0(내부 검증 로직 자체는 순수, 픽스처 기반). 이 registry 등록은 implementer(hotfix-runner-specialist, Phase 1-B)가 관례에 따라 대신 수행 — 파일 내용은 무수정, 동시 작업 파일 소유권 경계(CLAUDE.md 규칙 16) 준수.' },
      { script: 'scripts/testAssignmentUnitGuards.mjs', builders: [], extra: true, note: '2026-09-03 야간 — 관리자 교재 배정 "쓰기" 함수 유령 유닛 재발 방지 가드(2026-09-02 실사고 후속 갭). PR #7(5c589a8)은 유닛 셀렉터 노출만 막았고 setAssignmentUnit/setPrimaryAssignment/setPrimaryTextbook 3개 저장 함수는 여전히 검증 없이 유령 유닛을 SCA/students에 쓸 수 있었다(재발 지점) — 세 함수가 유령 유닛을 거부하고 학습 가능 유닛으로 결정론적 폴백(대상 없으면 throw)하는지 검증. testAdminUnitEdit.mjs와 동일한 쓰기 기록형 인메모리 가짜 supabase + wordLibrary esbuild 번들 패턴(그 파일은 읽기만, 이 파일은 독립 복제본). 규칙 15 FAIL-first 설계 — 가드 부재 코드에서는 3개 함수 전부 유령 유닛을 그대로 채택해 실패했을 경로. 54단언 전체 PASS. 네트워크 0, 실제 DB 접촉 0. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testHardDeleteGuard.mjs', builders: [], extra: true, note: '2026-09-03 야간 — api/admin-pin-actions.js hard_delete_student "데이터 0" 가드에 reward_ledger/entrance_test_results/xp_ledger 3개 카운트가 누락돼 있던 문제(students DELETE의 on delete cascade가 이 3개도 지우는데 가드가 세지 않음) 전용 회귀. testAdminStudentActions.mjs와 동일한 esbuild 번들 + 인메모리 가짜 supabase 패턴의 독립 복제본(그 파일은 다른 스위트 소유, 미수정). 규칙 15 FAIL-first — 3개 테이블 카운트 부재 코드에서는 케이스 (a)(b)(c)가 가드를 우회해 삭제가 실제로 진행되며 반드시 FAIL(파일 헤더 주석에 명시). 22단언 전체 PASS. 네트워크 0, 실제 Supabase 접촉 0. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testClassDeleteGuard.mjs', builders: [], extra: true, note: '2026-09-03 야간 — supabase/functions/admin-content-write/index.ts의 class.delete 액션에 "학습기록 있으면 삭제 차단" 가드가 없던 문제(classes DELETE가 units→words→word_status/spelling_review_queue, entrance_tests→entrance_test_results, student_class_assignments를 CASCADE로 연쇄 삭제하는데 방어 0) 전용 회귀. Deno 전용 Edge Function이라 (a) 순수 판정부 decideClassDelete만 globalThis.Deno 스텁으로 esbuild 번들해 Node 직접 단위 테스트 + (b) handleClassDelete 본문 텍스트 정적 검사(카운트 조회/has_learning_data·force 분기가 실제 delete() 호출보다 앞서 있는지)로 이중 검증. 규칙 15 FAIL-first — 가드 부재 코드에서는 decideClassDelete가 항상 삭제를 허용해 FAIL(파일 헤더 주석에 명시). 18단언 전체 PASS. 라이브 네트워크 0(프로덕션 Edge Function 무수정, 테스트 하네스만). 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testClassDeleteConfirmWiring.mjs', builders: [], extra: true, note: '2026-09-03 야간 — 2f63ff2가 배포한 admin-content-write class.delete의 has_learning_data(HTTP 200, blocked) / force:true 강행 계약을 wordLibrary.js deleteClass()가 클라이언트에 정확히 배선하는지 + AdminScreen 2차 확인 모달 정적 배선 검증. has_learning_data 응답은 throw 대신 { blocked:true, counts } 반환(2차 모달 트리거)/force:true 호출 시 fetch payload에 force 포함/ok:true 성공 경로 반환값 무변경/has_learning_data 이외 실패는 기존처럼 throw 유지 4계약. 규칙 15 FAIL-first — deleteClass가 opts를 받지 않고 force를 전혀 안 보내던 구현 전 코드에서 (a)(b)가 반드시 FAIL(파일 헤더 주석에 실측 명시). testAssignmentUnitGuards.mjs와 동일 esbuild 패턴의 독립 복제본. 22단언 전체 PASS. 네트워크 0(fetch/supabaseClient 전부 모킹). 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testGenerateGhostScaManifest.mjs', builders: [], extra: true, note: '2026-09-03 야간 — scripts/prod/generateGhostScaManifest.mjs(유령 유닛 SCA 재배정 핫픽스 매니페스트 생성기, 다른 트랙 소유) 회귀. buildManifestFromSnapshot이 export되지 않는 CLI 전용 파일이라 spawnSync + --fixture --json으로 CLI를 직접 구동해 검증(scripts/testProdCheck.mjs 4절과 동일 픽스처 기반 CLI 테스트 관례). 자체 합성 픽스처(crypto.randomUUID(), 실명/실 UUID 0)로 changes/affected_students/must_not_change dedupe, validateManifest 통과, buildApplySql의 is null 가드·is_primary=false 가드·student_id/textbook_id/유령 current_unit_id 가드 포함까지 검증. 27단언 전체 PASS. 네트워크 0. 이 등록은 registry 소유 트랙(implementer)이 대신 수행 — 파일 내용 무수정, 동시 작업 파일 소유권 경계(CLAUDE.md 규칙 16) 준수. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testProdHotfix.mjs', builders: [], extra: true, note: '2026-09-03 — Production Safety Harness Phase 1-B. npm run prod:hotfix -- <manifest.json> — 2026-09-02 유령 유닛 착지 핫픽스(VERIFY SQL/본 SQL/VERIFY SQL 을 운영자가 SQL Editor 에 수기 복사 실행)를 대체하는 구조. manifest(ops/hotfix/manifests/*.json, allowlist: students.{current_unit_id,unit_name,class_id} / student_class_assignments.{current_unit_id,is_primary,textbook_id}) 하나에서 preflight 읽기계획/apply SQL/rollback SQL/postflight 읽기계획을 전부 같은 데이터로 생성해(scripts/lib/hotfixManifest.mjs, 순수) VERIFY 와 WRITE 의 precondition 불일치를 구조적으로 제거한다. 실행 순서 고정: manifest 검증 → project_ref 환경 게이트 → 파괴적 키워드 정적 스캔 → 프리플라이트(anon 읽기 전용, supabase-js) → baseline(학습기록 카운트 + students/SCA 무관 행 스냅샷 해시) → 계획 출력 + apply/rollback .sql 파일 저장 → --dry-run/CI/SUPABASE_ACCESS_TOKEN 부재 시 여기서 STOP(exit 0, DB WRITE 0) → 대화형 승인(`APPLY <runId>` 정확히 입력, TTY 필수, --yes 우회 없음) → apply → postflight(값 일치 + 학습기록 카운트 불변 + 무관 행 스냅샷 diff = manifest 변경 id 집합과 정확히 일치 + npm run health:students) → 실패 시 자동 롤백 + 재검증. 이번 단계는 Management API 실호출을 코드로만 갖고(scripts/lib/sqlExecutor.mjs) 어떤 테스트/CLI 경로로도 실제 호출하지 않는다(토큰도 이 저장소에 없음) — 라이브 접근은 anon key 읽기(dry-run 프리플라이트)만. 하네스: runHotfix(options, deps) 로 CLI 로직을 분리해 fake reader/executor/승인/health-check deps 주입으로 161단언(2026-09-03 야간 redactSecrets 강화 포함) 전부 네트워크 0 검증(manifest 검증 9종 + SQL 생성/정적스캔 15종 + preflight fail-closed/dry-run/CI 게이트/TTY 승인 게이트/apply 성공·실패/postflight 값불일치·무관행변경·학습기록카운트변화 각각의 자동 롤백 + env project_ref 불일치 + redactSecrets 의 base64/URL 인코딩·앞 12자 이상 접두 조각 마스킹). 라이브 dry-run 1회(anon 읽기)로 이미 적용된 ghost-unit-landing-20260902.json manifest 가 preflight 단계에서 fail-closed STOP 하는 것도 실측 확인. DB write 0(이 하네스 자체 실행으로는 프로덕션에 어떤 쓰기도 나가지 않음).' },
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
      { script: 'scripts/testWritingDirectionResolution.mjs', builders: ['wordlibOffline'], extra: true, note: '2026-08-20 — 쓰기 방향(spelling direction) 결정 구조의 구조적 버그 수정(John 실사고, 개별 예외 금지·전체 학생 적용 구조 수정). 확정 원인 5개: ① App.jsx:372가 getClassSettings(getStudentClass(studentId))로 항상 "홈 반" 설정만 읽어 학생이 실제로 공부 중인 "학습 교재 반"(SCA primary textbook의 owner_class_id) 설정을 무시 — getStudentSpellingSettings(studentId) 리졸버(학습 교재 반 → 홈 반 → 안전 기본값 우선순위, 원본 캐시 _classSettings로 "진짜 미존재"와 getClassSettings의 조용한 폴백을 구분) 신설로 교체. ② wordLibrary.js DEFAULT_CLASS_SETTINGS.spellingDirection과 ③ refreshClassSettings 폴백이 조회 실패/컬럼 부재/이상값(null/\'\'/\'weird\')을 \'mixed\'로 흡수하던 것을 \'kr2en\'으로 되돌림(운영자 지시 2026-08-20 — mixed는 명시적 설정일 때만). ④ App.jsx:849 복습 경로가 direction=\'mixed\' 문자열을 그대로 SpellingReview에 넘겨 SpellingQuestion 내부 Math.random()에 방향 결정을 맡기던 것을, App.jsx가 세션 시작 시 assignDirections로 미리 배정(reviewMixedDirections)해 SpellingReview가 인덱스(total-words.length, wrongWordIds가 앞에서만 줄어들므로 순서 불변 보장)로 조회하도록 수정. ⑤ mixedDirections/guidedMixedDirections useMemo가 sessionWords.length/classWords.length 변화마다 전체 재셔플되던 것을, wordLibrary.js에 신설한 순수 함수 extendStableDirections(기존 배정 유지 + 늘어난 길이만 append, assignDirections 재사용)로 안정화(useRef 기반 reset-key: 학생/유닛/스코프/방향 설정이 바뀔 때만 재배정). 검증: 오프라인 번들(fakeSupabaseModule.mjs, 네트워크 0)로 리졸버 우선순위 2조합·설정 캐시 빈 상태·컬럼 부재/이상값 4종·명시적 mixed 존중·John 재현(홈/학습 반 둘 다 kr2en인데 설정 조회 실패)·extendStableDirections 안정성을 실제 실행 검증 + SpellingQuestion.jsx phase===answer 블록 정적 추출로 pairedText/targetAnswer 사전 노출 0 확인(이 파일은 무접촉 — "한 문제 안에서 두 언어 동시 렌더" 버그는 없음을 사전 확인 완료) + App.jsx/SpellingReview.jsx 소스 정적 검사(옛 버그 패턴 제거/새 리졸버 사용/안정화 패턴/Math.random 경로 제거). 수정 전 소스로 25개 정적 단언 FAIL 실측(규칙 15, getStudentSpellingSettings/extendStableDirections 부재로 인한 크래시는 safeGetSettings/safeExtend 래퍼로 흡수해 전체 단언을 끝까지 세도록 처리) 후 전체 PASS 전환. 기존 testWritingDirectionEngine.mjs의 mixed 기본값 폴백/getClassSettings(getStudentClass()) 패턴을 검증하던 2개 단언도 이번 변경에 맞춰 최소 갱신(그 파일 자체 헤더 참고). Reward System 파일 무접촉. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
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
      { script: 'scripts/testAssignmentCacheRefill.mjs', builders: ['wordlibOffline'], extra: true, note: '2026-08-24 P0 — 배정 캐시 무효화 후 "누가 다시 채우는가" 계약. 45a7232(갭 ①)가 App.jsx onVisible에서 _studentAssignmentsCache를 비우게 했는데 같은 Promise.all의 4개 refresh(refreshWordLibrary/refreshStudents/refreshClassSettings/refreshTextbooks) 중 어느 것도 그 캐시를 채우지 않아(채우는 곳은 getStudentClassAssignments 단 1곳), setRefreshTick이 빈 캐시로 재렌더를 걸어 getStudentPrimaryTextbook이 null -> getStudentWords의 교재 모드 분기 스킵 -> 홈(사람) 반에 머묾. 홈 반에 단어를 두지 않는 이 학원 구조에서 실학생 41명 중 32명이 탭 전환 한 번에 "교과서를 선택하세요 / 단어가 부족해요"로 떨어졌다(Jinaa Unit5 word_count=40은 DB에 정상 존재, 데이터 무결성 문제 아님). 로그인 경로(handleSelect)는 refreshAllForLogin 직후 getStudentClassAssignments를 다시 await 해서 안전했고 visibility 경로에만 재조회가 빠져 있었다 — 그 비대칭이 원인. 기존 testStaleCacheRevalidation.mjs가 이 사고를 못 잡은 이유는 무효화 직후 테스트 자신이 getStudentClassAssignments를 호출해 프로덕션이 하지 않는 일을 대신 해줬기 때문이라, 이 파일은 App.jsx 소스에서 onVisible의 Promise.all 인자 목록을 파싱해 그대로 실행한다(테스트가 캐시를 대신 채우지 않는 것이 핵심). 검증: Jinaa 실구조 픽스처(홈 반 유닛 0/소유 교재 0 + 타 반 소유 교재의 Unit5 40단어)에서 프라이밍 40개 -> onVisible 후 40개 유지(수정 전 0개) / 3회 연속 onVisible / 교재 선택기 소스 non-null / 정적 계약(무효화와 재조회가 같은 Promise.all, 캐시 set 지점 1곳) / 대조군(홈 반 == 교재 소유 반, 영향 없던 9명)은 수정 전후 불변 / 타 학생 onVisible이 남의 캐시에 영향 없음. 수정 전 13단언 중 4 FAIL 실측(규칙 15). 갭 ②(refreshAllForLogin)·갭 ③(revalidateUnitWords)은 정상이라 보존 — 전체 revert 대신 재조회 1항목 추가 최소 수정. 네트워크 0, Supabase 무접촉, DB 무변경.' },
      { script: 'scripts/testClassMoveUnitResolution.mjs', builders: ['wordlibOffline'], extra: true, note: '2026-08-29 감사 P1 — 반 이동 시 유닛 표기 흔들림으로 학생이 0단어 화면에 착지하던 경로 차단. 실측: 프로덕션 유닛 50개의 명명이 4종 혼재(UnitN 29 / Unit N 13 / 번호없는 Unit 6 / 숫자만 2)이고, setStudentClass 가 정규화 없는 완전일치로만 새 반의 유닛을 찾아 못 찾으면 current_unit_id 를 NULL 로 덮었다. 그러면 resolveStudentUnitObj 가 이름 매칭에 다시 실패해 `|| units[0]` 로 조용히 첫 유닛에 착지했는데, 그 자리에 0단어 유닛 2개(둘 다 이름이 Unit 1)와 1단어 유령 유닛 7개가 실재해 전하은 사건과 같은 계열의 무증상 실패가 났다. resolveClassUnit 은 이미 normalizeUnitKey 로 표기 흔들림을 흡수하고 “정규화 후 후보가 2개 이상이면 고르지 않는다”는 원칙을 갖고 있었는데 나머지 경로가 그 함수를 쓰지 않은 것이 원인 — 새 규칙을 만들지 않고 findUnitByName 으로 분리해 resolveStudentUnitObj / setStudentClass / setStudentUnit 에 연결했다. 착수 전 라이브 실측으로 안전성 확인: 전체 1157명 중 215명은 FK 경로, 942명은 소속 반 유닛 0개라 이미 null — 폴백 제거로 해석이 바뀌는 현재 학생 0명(현재 피해 복구가 아니라 향후 반 이동 대비 안전망). 검증: 해석 불가 시 첫 유닛 대신 null / 표기 흔들림 흡수(Unit6 -> Unit 6) / FK 우선순위 유지 / 모호한 반에서 임의 선택 금지 / 완전일치 무회귀 / 유닛 0개 반에서 타 반 유닛 미반환 + 쓰기 경로 정적 계약(공유 리졸버 사용, raw 완전일치·첫유닛 폴백 부재). 수정 전 12단언 FAIL 실측(규칙 15 — Unit6 학생이 0단어 uB1 에 착지해 단어 0개 재현) 후 35단언 전체 PASS. 커버리지 경계: fakeSupabaseModule 은 읽기 전용이라 setStudentClass 의 쓰기 왕복은 구동하지 못하고 정적 계약으로 고정했다. 범위 밖으로 남긴 것: 목적이 다른 `|| units[0]` 3곳(setPrimaryTextbook 계열 2곳 — 단어 있는 첫 유닛 선택, 시험 범위 1곳)은 건드리지 않았다. 네트워크 0, Supabase 0, DB 무접촉.' },
      { script: 'scripts/testExcelHeaderGuard.mjs', builders: [], extra: true, note: '2026-08-25 — Excel 업로드에서 헤더 행이 가짜 "Unit" 유닛으로 생성되는 재발 방지. 실사고: 교재 9개 중 6개에 이름이 정확히 "Unit"이고 단어가 1개뿐인 유닛이 있었고, 그 1개 단어의 정체는 전부 엑셀 헤더 라벨이었다("English"/"Korean" 5건, "Word / Phrase"/"뜻" 1건). 코드 경로: detectHeaderMap이 완전 일치만 인정해 그 라벨들을 헤더로 못 알아봄 -> hasHeader=false -> rows.slice(1) 미적용으로 헤더 행이 데이터로 편입 -> 위치 추정 분기의 isUnit 정규식 /^(unit|유닛)\s*\d*/i 가 \d* 로 숫자 0자리를 허용해 헤더 라벨 "Unit" 자체를 유닛 값으로 인정 -> AdminScreen 저장 루프가 byUnit["Unit"] 그룹 생성 -> setClassWords -> wordLibrary.ensureUnit이 DB에 "Unit" 유닛을 실제 생성. 2차 피해: setPrimaryTextbook 4단계가 "단어 있는 첫 유닛"을 고르는데 units 정렬이 position(전부 0) tie -> 이름 오름차순이라 "Unit"이 항상 맨 앞이고 단어가 1개라 length>0 가드를 통과 -> 교재 전환 학생이 결정론적으로 1단어 유닛에 배정됨(실측 실학생 15명). 수정(B안, 범위 한정): (1) HEADER_ALIASES에 실측 라벨 추가(word/meaning/unit) — 추가만이라 기존 인식 결과 불변, \'영어\'/\'한글\' 같은 흔한 낱말은 실제 어휘 오탐 방지를 위해 의도적 제외, (2) isUnit 정규식 \d* -> \d+ 로 숫자 필수화, (3) 위치 추정 경로 첫 행이 word·meaning 둘 다 헤더 라벨이면 그 행만 배제(AND 조건 + 첫 행 한정 — 한쪽만 라벨인 실제 어휘 "word"/"말", "unit"/"단위"는 보존). hasHeader 판정식(word && meaning AND)은 운영자 지시로 의도적 무변경 — OR 전환은 meaning만 매칭되는 파일의 첫 데이터 행이 잘리는 회귀 위험이 실재해 범위에서 제외했고, CASE H가 그 무변경을 정적으로 고정한다. 검증 방식: parseExcelRows는 export되지 않은 순수 함수이고 AdminScreen.jsx는 412KB 컴포넌트라 통째 번들이 Node에서 불가 — HEADER_ALIASES~parseExcelRows 구간을 실제 소스 텍스트에서 중괄호 균형으로 잘라 그대로 실행한다(로직 재구현 0, 추출 실패 시 조용히 통과하지 않고 즉시 FAIL). 54단언: 실사고 2종 재현 + 실DB 유닛명 전수 16종 + 한글/변형 표기 3종 무회귀 + 헤더 정상 인식 경로(선택 컬럼 4종 M3c 계약 포함) + 헤더 없는 순수 데이터 + 번호 열 A6 경로 + 과잉 차단 방지(첫 행 아닌 헤더성 행 보존) + hasHeader 무변경 정적 단언. 수정 전 6 FAIL 실측(규칙 15). 기존 stray 데이터는 삭제하지 않았고 학생 current_unit_id도 건드리지 않는다 — 이 변경은 앞으로의 업로드에만 작용한다. 네트워크 0, Supabase 0, DB 무접촉. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testGhostUnitFiltering.mjs', builders: [], extra: true, note: '2026-09-02 야간 — 유령 유닛(엑셀 헤더 잔재/빈 유닛) 재발 방지, 셀렉터 노출 축: getLearnableTextbookUnits/getLearnableClassUnits(Names)(단어>=2 필터, 기존 getTextbookUnits/getClassUnits(Names)는 하위호환 무변경)를 Dashboard 학생 유닛 셀렉트/StudentDirectory 생성 폼·일괄이동 폴백/TextbookAssignmentPanel 유닛 select에 도입 + create_student 서버측도 명시 unitName이 단어<2 유닛에 매칭돼도 채택하지 않고 자동(단어>=2 첫 유닛) 폴백. 수정 전 소스로 되돌려 22단언 중 16 FAIL 실측(규칙 15) 후 전체 PASS 전환. 네트워크 0, DB 접촉 0. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testExcelHeaderResidue.mjs', builders: [], extra: true, note: '2026-09-02 야간 — 반복 헤더 행(시트 병합/페이지 구분으로 남는 English/Korean 등) 차단, 업로드 축: hasHeader=true로 정상 인식된 파일 안에서도 남는 반복 헤더 행이 그대로 데이터로 저장되던 사각지대(기존 `!hasHeader && rowIdx<=leadingHeaderEnd` 안전망은 hasHeader=true 경로를 못 막음)를 isHeaderResidueRow/sanitizeUnitLabel(src/utils/excelHeaderGuard.js, 순수)로 parseExcelRows·handleParse(PDF/텍스트) 양쪽에 적용해 재발 방지. 32단언(순수 판정 + AdminScreen.jsx 정적 계약, FAIL-FIRST 규칙 15로 도입). 네트워크 0, DB 접촉 0. 13개 필수 도메인 밖, 신규 보너스 커버리지(다른 세션 산출물 — 이 등록만 implementer가 수행, 파일 내용 무수정).' },
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
      { script: 'scripts/testReleaseGate.mjs', builders: [], extra: true, note: '2026-08-26 P2 — Release Gate 회귀 판정 규칙(순수). P1 헬스체크를 배포 전 게이트에 연결하되, 원칙은 "정상인 기능은 건드리지 않고 새 변경이 다른 학생/기능을 깨뜨리는 경우에만 배포를 차단한다". 그래서 FAIL 을 baseline(이미 알던 문제, 배포 허용)과 regression(이번 변경이 만든 새 문제, 배포 차단)으로 나눈다 — 게이트가 "항상 빨간불"이 되어 무시당하는 가장 흔한 실패 모드를 구조적으로 막는다. 키는 studentId + 코드 접두로만 만든다: detail 문자열에는 단어 수처럼 흔들리는 값이 들어가 매번 새 회귀로 보이고(그래서 제외), 학생을 빼고 코드만 쓰면 A 학생 문제가 B 학생 문제를 가린다(그래서 포함). 검증: 전원 PASS 통과 / 새 FAIL 차단 / baseline 항목 통과 / detail 변동에도 known 유지 / 같은 학생의 새 코드는 차단(가림 방지) / 다른 학생의 같은 코드는 차단 / 고쳐진 baseline 은 fixed 로 보고(오래된 baseline 이 진짜 회귀를 가리는 것 방지) / WARN 은 비차단 / 잘못된 입력 9종 throw 금지 / summarizeGates 합산 + verifyRelease.mjs 정적 배선 검사(build·verify:all·health 3게이트, --require-env 로 자격증명 부재를 조용한 통과로 만들지 않음, DB 쓰기 경로 0, src/ import 0, exit code 명시) + 기존 흐름 무변경 잠금(verify:all/build/health:students 스크립트 정의 고정). 구현 전 모듈 부재로 0단언 실행(규칙 15) 후 51단언 전체 PASS. 라이브 게이트 실행은 npm run verify:release 가 담당하며 verify:all 에는 넣지 않는다(네트워크 의존 + 자기 자신 호출 순환 방지). 네트워크 0, DB write 0.' },
      { script: 'scripts/testReleaseGateProdCheck.mjs', builders: [], extra: true, note: '2026-09-03 야간 — Release Gate Phase 10 CI 통합(.github/workflows/release-gate.yml) 정적 검사: (a) READ-ONLY 프로덕션 안전 하네스 prod:check(Gate 3b)를 --require-env로 실행해 자격증명 부재가 조용한 SKIP이 아니라 FAIL이 되는지 + (b) prod:hotfix를 가짜 SUPABASE_ACCESS_TOKEN + CI=true로 실행해 매 실행마다 write path가 코드상 도달 불가임을 증명하는지(Gate 4)를 워크플로 YAML 텍스트와 scripts/prodHotfix.mjs 소스 문자열/정규식 단언만으로 검증 — GitHub Actions 실행도 라이브 Supabase 호출도 없음. 이 파일이 소유하는 검증 대상은 워크플로의 Gate 3b/4 두 스텝 + Deploy Ready 잡의 무배포 상태뿐이고, prod:check/prod:hotfix 자체의 동작(testProdCheck.mjs/testProdHotfix.mjs, 같은 registry admin 도메인에 이미 등록됨)과는 겹치지 않는다. 39단언 전체 PASS. 네트워크 0. testReleaseGate.mjs와 마찬가지로 verify:all에는 넣되 라이브 게이트 자체(실제 워크플로 실행)와는 무관 — 이 등록은 registry 소유 트랙(implementer)이 관례에 따라 대신 수행(파일 내용 무수정, 그 파일 자체 헤더가 "이 트랙은 registry를 소유하지 않으므로 등록은 하지 않는다"고 명시). 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testStudentHealthRules.mjs', builders: [], extra: true, note: '2026-08-26 P1 — Student Health Check 순수 판정 규칙. 최근 반복된 회귀가 코드 버그가 아니라 "학생별 해석 체인(로그인→반→주교재→유닛→단어→쓰기방향)이 끊기는 것"이라는 진단에서 나왔다(전하은: 리네임으로 로그인 ID 소멸 / Song: 단어 0개 유닛 / Dain·문지유: 엑셀 헤더 유령 유닛 / Presentation 6: 주교재 소유 반이 kr2en). 코드는 정상이라 단위 테스트로는 못 잡고, 실제 학생 데이터를 체인에 통과시켜야만 잡힌다. 이 스크립트는 그 판정 규칙만 픽스처로 검증한다(네트워크 0, DB 0) — 8개 FAIL 코드(LOGIN_FAIL/CLASS_INVALID/TEXTBOOK_MISSING/UNIT_INVALID/WORDS_ZERO/ORPHAN_ASSIGNMENT/DUPLICATE/DIRECTION_INVALID) 각각 재현 + 정상 학생 오탐 반증 + 앱 리졸버 우선순위(교재소유반→홈반→기본값 kr2en, mixed로 흡수 금지) 고정 + mixed 양방향 최소 단어수(assignDirections half=floor(n/2)라 n=1이면 동전던지기) + 계정 분류(REAL/ARCHIVED/TEST/QA_FIXTURE — 이름만 보던 기존 규칙의 갭 보완: 이름이 평범해도 소속 반이 QA_*면 픽스처) + random은 WARN(총량 균형 미보장, FAIL 승격은 운영자 미결정) + 잘못된 입력 throw 금지. 라이브 검사는 scripts/studentHealthCheck.mjs(GET 전용, npm run health:students)가 별도 담당하며 verify:all에는 넣지 않는다 — 네트워크 의존이고 실데이터 상태에 따라 exit 1이 되므로 코드 게이트와 분리한다. 구현 전 모듈 부재로 0단언 실행 실측(규칙 15) 후 53단언 전체 PASS. DB write 0.' },
      { script: 'scripts/testAssignmentGhostUnitRule.mjs', builders: [], extra: true, note: '2026-08-30 야간 감사 — health check 사각지대: SCA 배정 행이 유령 유닛을 가리키는 경우. 유령 유닛 9개 정리를 위해 참조를 전수 조사하다 발견했다. student_class_assignments 41행이 유령 유닛을 가리켰고 그중 25행이 실학생 소유(실학생 19명, 17명 is_primary)였는데 health 는 PASS 35 / WARN 0 / FAIL 0 이었다. 기존 두 규칙이 각자 자기 관점만 봐서 그 사이로 빠졌다: unit_not_ghost 는 students.current_unit_id(지금 쓰는 유닛)만 보는데 지금 유령을 쓰는 실학생은 0명이고, ASSIGNMENT_CONFLICT ② 는 배정 행 유닛이 그 행 교재 소속인지만 보는데 유령 유닛은 그 교재에 정상 소속돼 있다. 장전된 상태다 — getStudentWords 의 usingOverride 분기가 배정 행의 current_unit_id 를 우선 쓰므로 그 교재로 전환하면 헤더 라벨 1개짜리 화면을 본다(실제로 word_status 에 한 학생이 헤더 단어 English 를 known 으로 학습한 기록 1건 존재). 부수 발견: studentHealthCheck.mjs 가 SCA 조회에서 current_unit_id 를 select 하지 않아 기존 12-b ② 규칙도 지금까지 조용히 죽어 있었다(그 주석의 라이브 실측 0건은 데이터가 깨끗해서가 아니라 검사가 실행되지 않아서였다) — 컬럼 추가로 함께 살렸다. 판정은 기존 isGhostUnit 재사용이라 0단어만으로는 유령이 아니고(이름이 정상인 빈 유닛은 교사 미업로드 가능성) GHOST_MAX_WORDS 가드로 26/40/50단어 정상 유닛은 구조적으로 걸리지 않는다. 심각도는 WARN — 코드 회귀가 아니라 운영자 SQL 재지정이 필요한 데이터 부채라, FAIL 로 두면 실학생 18명이 걸려 Release Gate 가 모든 배포를 무기한 막고 결국 게이트를 끄게 만든다(DIRECTION_RANDOM 선례와 동일). 재지정 완료 후 0건이 되면 FAIL 로 승격이 옳다. 수정 전 5단언 FAIL 실측(규칙 15 — 보조 배정이 유령을 가리켜도 status=PASS/codes=[] 재현) 후 19단언 전체 PASS. 라이브 적용 결과 PASS 17 / WARN 18 / FAIL 0 (exit 0, 배포 무차단). 네트워크 0, DB 쓰기 0.' },
      { script: 'scripts/testAnalyticsPanelPagination.mjs', builders: [], extra: true, note: '2026-08-30 야간 감사 — 관리자 분석 패널 1000행 절단. 라이브 실측: 이 프로젝트의 PostgREST max-rows 는 1000이라 .limit(20000) 이 상한을 올려주지 못한다(words 1,656행에 limit 20000 을 걸어도 1000행만 반환). AnalyticsPanel 의 product_events 60일 창은 실측 5,634행이었고, 잘린 1000행 표본으로 computeReturnRates / computeGardenRevisits / computeFeatureCounts / computeAvgSessionMinutes 4개 지표를 계산하고 있었다 — 재방문율·평균 세션 시간은 anon_id 단위 비율이라 단순 과소집계가 아니라 사용자 자체가 통째로 빠지는 왜곡이다. words 1093행(2026-08-12)·students 1000행이 이미 겪은 같은 사고이고 그때 만든 selectAllRows 패턴이 wordLibrary.js 에 있었는데 관리자 패널만 쓰지 않았다 — 새 방식을 만들지 않고 그 헬퍼를 export 해 재사용한다. 결정적 정렬이 페이지네이션의 전제라(tie 가 있으면 페이지 경계에서 행 누락/중복) 각 테이블의 고유 컬럼으로 order 를 함께 건다(product_events/word_status/student_class_assignments 는 id, student_progress 는 PK 인 student_id). 나머지 3개 조회는 현재 190/2,771(mastered 0)/482행으로 아직 상한 아래지만 넘는 순간 같은 왜곡이 생기므로 함께 감쌌다. 검증: 정적 계약(limit 의존 제거/헬퍼 사용/정렬 존재/export) + 순수 페이지네이션 시뮬레이션(0·1·999·1000·1001·2771·5634행 전량 수집 + 중복 0) + 대조군(limit 20000 단발 요청이 실제로 1000행에서 잘리는 것 재현). 수정 전 10단언 FAIL 실측(규칙 15) 후 30단언 전체 PASS. 네트워크 0, DB 접촉 0.' },
      { script: 'scripts/testGardenGrowthFlow.mjs', builders: [], extra: true, note: '2026-08-28 작성 / 2026-08-30 등록 — Paul Town 정원 성장 end-to-end 계약(84단언). 정원 성장축을 clearedCount 에서 gardenPoints 로 교체한 수정(7fa4641 계열)의 회귀 안전망인데, 작성 당시 registry 에 등록되지 않아 verify:all 에서 한 번도 실행되지 않고 있었다(야간 하네스 감사에서 발견 — 등록 101개 대비 미등록 test 스크립트 11개 중 하나). 네트워크 0 / Supabase 참조 0 이라 그대로 편입 가능했고, 편입 시점에 단독 실행으로 84단언 PASS 확인. 음수/NaN 포인트 클램프까지 포함한다.' },
      { script: 'scripts/testGardenGrowthSources.mjs', builders: ['race'], note: '2026-09-04 — 정원 성장 "소스" 회귀(44단언, 위 testGardenGrowthFlow와 상보적). 실측(READ-ONLY, progress 193행): 정원 포인트 = |cleared ∪ completedWords ∪ clearedWords|(attachmentCore.js deriveAttachmentStats)인데, 퀴즈 정답(recordQuizAnswer)은 정답 시 markWordCleared를 불러 정원을 키우는 반면 철자 시험 정답(recordSpellingAnswer)은 한 번도 부르지 않아 철자 위주로 학습하는 계정은 정원이 전혀 자라지 않았다(철자 정답 347회·정원 0칸 계정 확인, 학습일당 성장 중앙값 0.13칸). 수정은 recordSpellingAnswer의 correct 분기에 markWordCleared(wordId) 한 줄만 배선(+useCallback deps) — 별/XP/콤보/spellingReviewQueue/history는 무변경. 범위에서 clearSpellingReviewWord(복습 화면 큐 정리 이벤트, recordSpellingAnswer 미경유)는 명시적으로 제외했고 그 사실 자체를 단언으로 고정했다. 퀴즈·철자 두 소스가 같은 단어를 어느 순서로 맞혀도 정확히 1포인트만 세는지(멱등 가드), 오답/열람/듣기/발음성공은 성장하지 않는지(no farming), 신규 계정 0→1과 기존 292개 계정 292→293(무손실) 둘 다, 교재/유닛 전환에 성장이 살아남는지, localStorage 영속 및 mergeProgressRecords 로컬↔클라우드 합집합, rewardLedger 50건/totalStars 500이 있어도 학습 단어 0개면 정원 0(독립성)까지 고정. 수정 전 실행 시 44단언 중 12개 FAIL(철자 관련 전부, 규칙 15 재확인) 후 전체 PASS. 네트워크 0, DB 접촉 0(wordLibraryRaceStub 전량 스텁).' },
      { script: 'scripts/testGamificationInvariants.mjs', builders: [], extra: true, note: '2026-08-28 작성 / 2026-08-30 등록 — 보상 불변식 회귀(40단언). 정원 도입 후 별/모자/학습기록이 보호되는지 (정원이 만개해도 별 증가가 멈추지 않는지 등) 고정하는 안전망인데 위와 같은 이유로 미등록 상태였다. 네트워크 0 / Supabase 참조 0, 편입 시점 단독 실행 40단언 PASS.' },
      { script: 'scripts/testHatColorRendering.mjs', builders: [], extra: true, note: '2026-08-26 — 모자 이름과 화면 색이 어긋나던 실사고(Irene: equippedHatId=hat_scientist(하얀색)인데 화면엔 검은 톱햇) 회귀 고정. 원인은 DB/asset이 아니라 표시 계층이었다: 학생 모자 8종은 전부 같은 🎩(U+1F3A9, 이모지 폰트에서 검은색)를 쓰고 색은 HAT_CATALOG.colorHex 틴트로만 구분하는 설계인데(hatSystem.js 헤더), 이모지가 CSS color로 안 물들어 저장소가 채택한 "투명 글자 + text-shadow 실루엣" 기법이 4개 렌더 지점에 빠져 있었다 — HatCollection 아바타/카드, Dashboard 홈 아바타/착용 라벨. HAT_COLOR_STYLE은 PaulTown 한 곳에서만 소비됐고 HatCollection/Dashboard는 import조차 안 했다. 수정: 기존 기법(HatCeremony/PaulTown)을 hatTintStyle()로 끌어올려 4개 지점이 전부 같은 함수를 쓰게 했다(새 기법 발명 0). 밝음 판정은 모자별 하드코딩이 아니라 colorHex의 sRGB 상대휘도(WCAG)로 계산 — 하얀색(#ECEFF1)/금색(#FFD54F)만 1px 어두운 외곽선을 fill 뒤에 깔고 fill 자체는 항상 colorHex(요구사항). 검증: fill이 항상 첫 text-shadow 레이어(외곽선이 색을 덮지 않음)/8종 스타일 전부 상이/카탈로그 밖 임의 색도 같은 규칙(하드코딩 없음 증명)/잘못된 입력 6종 throw 없이 검은색 폴백/미획득 🔒·미장착 👑 분기 보존 + 회귀 잠금(id 8종·colorHex·임계값·evaluateHatUnlocks 결정론/멱등/회수없음·장착 토글 배선). 수정 전 38단언 중 13 FAIL 실측(규칙 15) 후 63단언 전체 PASS. 네트워크 0, Supabase 0, DB write 0. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
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
      { script: 'scripts/testSessionTokenAuth.mjs', builders: [], extra: true, note: '2026-08-24 보안 감사 HIGH 1 대응 — Reward API 인증(서명된 세션 토큰). 이 앱은 Supabase Auth를 쓰지 않아(supabase.auth.* 호출 0건) 서버가 클라이언트가 보낸 studentId를 주장 그대로 신뢰했다. 새 인증 프레임워크를 도입하지 않고 이미 존재하는 유일한 로그인 관문(api/verify-student-pin.js)에서 Node 내장 crypto HMAC-SHA256 서명 토큰을 함께 발급한다(외부 패키지 0, 규칙 6 — PIN 해싱을 bcrypt 대신 내장 scrypt로 한 것과 같은 정신). token = base64url(payload).base64url(HMAC), payload = {sid, exp} 최소화(이름/반/PIN 등 개인정보 0). 학생 경험 변화 0 — 이름+PIN 그대로, 재로그인/계정 재생성 불필요, DB 스키마 변경 0, migration 0. 검증: 유효토큰 허용 / 토큰없음·잘못된서명·만료·token.sid!=body.studentId·다른학생토큰·malformed 9종·payload변조 거부 / 빈·null·임의 studentId 방어 / SESSION_SECRET 미설정 fail-closed(발급·검증 양쪽) / timingSafeEqual 서명비교 / 시크릿 미노출 / 성공응답에만 token(실패응답 0) / PIN 검증 로직 무변경 / 클라이언트 UX 무변경 / payload 키가 sid,exp 뿐. 구현 전 59단언 중 32 FAIL 실측(규칙 15). 61단언, 네트워크 0, production 요청 0.' },
      { script: 'scripts/testPinSetupCapability.mjs', builders: [], extra: true, note: '2026-08-29 보안 감사 P0-1 — PIN 자기설정 계정 탈취 차단(1회용 setup code). 최초 PIN 설정 시점에는 학생-서버 공유 비밀이 없어, self-set-student-pin.js의 두 게이트(pin_setup_allowed===true / pin_hash IS NULL)가 “요청자가 그 학생 본인인가”를 전혀 검증하지 못했다 — 둘 다 계정의 상태일 뿐이다. 확인된 체인: anon key로 students.id 열거(라이브 HTTP 200 실측) -> 무인증 student-pin-status로 pinSetupAllowed 열거(anon 직접 조회는 42501로 막혀 있는데 service_role이 우회 노출) -> 무인증 self-set-student-pin으로 임의 PIN 선점 -> verify-student-pin 로그인 -> signSessionToken 발급 -> 보상 원장 쓰기 권한 획득(2026-08-24 인증 강화 무력화). 해법: 관리자가 “PIN 설정 허용”을 누를 때 서버가 code = base32(HMAC-SHA256(SESSION_SECRET, pinsetup:v1:studentId:bucket))[0..7] 를 파생해 관리자 화면에 표시하고, 학생이 PIN과 함께 입력해야 통과시킨다. DB 컬럼/테이블 추가 0 — 코드값은 매번 파생(저장 안 함), 만료는 시간버킷(10분 버킷 + 현재/직전 2개 허용 = 최대 20분, 운영자 지정 TTL 준수), 1회성은 기존 원자적 UPDATE(.is(pin_hash,null))의 NULL->NOT NULL 전이가 그대로 강제(사용됨 플래그 불필요). 신규 Vercel 함수 0(기존 파일 수정만, 12/12 한도 유지). 하네스는 4개 핸들러를 esbuild로 번들하고 @supabase/supabase-js만 인메모리 가짜로 치환해 실제 구동한다 — 기존 testStudentPinSelfSetup.mjs는 프로덕션 Supabase에 QA 학생/반을 INSERT하므로(anon INSERT 락다운 이후 항상 SKIP) 이 시나리오 재현에 쓸 수 없어 그 대체재다. 검증: 코드 없이 self-set 거부 / 잘못된 코드 5종 거부 / 21분·31분 경과 코드 거부 + 9분 코드 허용 / 타 학생 코드 교차 사용 거부 / 정상 최초 설정 성공 / replay 5회 거부 + 해시 불변 / 기존 PIN 덮어쓰기 거부 / pin_setup_allowed=false면 유효 코드도 거부 / SESSION_SECRET 미설정 fail-closed / status 300건 배치 거부 + 정상 배치 무회귀 / adminPin 없으면 코드 미발급 / 로그인·세션 토큰 발급 무회귀 / 공격 체인 종단 재현. 수정 전 실측 FAIL (코드 없는 self-set이 {ok:true}로 성공, 파생 API 전무) 후 65단언 전체 PASS 전환(규칙 15). 네트워크 0, 실제 DB 접촉 0, 실학생 요청 0.' },
      { script: 'scripts/testRewardServerHardeningBehavior.mjs', builders: [], extra: true, note: '2026-08-23 — 위 강화의 동작 검증. api/grant-xp.js를 esbuild로 번들하되 @supabase/supabase-js만 인메모리 가짜로 치환해 핸들러를 실제 구동한다(production 코드 무수정). 검증: 정상 지급 무회귀 / replay 10회 -> 원장 1건 + duplicate:true / Promise.all 동시 20회 -> 1건 / malformed 6종(타입·소스·형식·streak 범위·legacy-baseline·studentId 위조) / 다른 학생 ID 변조 -> student_not_found / exam-complete 임의 UUID 100개 파밍 -> 지급 0건 + 실제 제출 시험은 정상 지급 / wrong-word-recovered 상한 60 도달 후 25건 거부 / fail-closed 4종(student_lookup/exam_lookup/dup_check/cap_check, op 단위 실패 주입) / 42P01 table_missing 폴백 유지 / 기존 XP 분기 무회귀. 33단언, production 요청 0, DB 무접촉.' },
      { script: 'scripts/testRewardServerHardening.mjs', builders: [], extra: true, note: '2026-08-23 보안 감사 HIGH 2·3·4 대응 — Reward V1 서버측 강화 계약(정적). L1 학생 실재 검증(students 조회, 클라이언트 주장 불신) / L2 exam-complete 실재 검증(entrance_test_results에 (test_id, student_id) 행이 있을 때만 지급 — 임의 UUID 위조 차단) / L3 (student_id, reward_type)별 일일 상한(KST 자정 기준, kstDayStartIso). 전부 fail-closed. 상한값은 실측 근거: 유닛당 단어 최대 50 -> wrong-word-recovered 60, 반·날짜당 시험 최대 8 -> exam-complete 10, 날짜키 4종은 1. 재시도 선판정(L2.5)이 상한보다 먼저 와서 같은 이벤트 재시도가 daily_cap_reached로 오응답되지 않게 한다. HIGH 1(인증)은 저장소에 세션 토큰 개념이 없어 이번 범위에서 닫지 못함 — 8절이 BLOCKED로 명시. 구현 전 26단언 중 18 FAIL 실측(규칙 15). 43단언, 네트워크 0.' },
      { script: 'scripts/testRewardEndpointSecurity.mjs', builders: [], extra: true, note: '2026-08-23 보안 감사 — Reward V1 서버 엔드포인트(api/grant-xp.js ledger:reward) 계약 고정. 잘 막혀 있는 것(금액/키를 클라이언트가 못 정함, 타입·소스 화이트리스트, legacy-baseline API 지급 불가, student_progress/students 무접촉, 23505 흡수, 날짜 기간키 3종)을 회귀 방지로 고정하고, 아직 열려 있는 것을 KNOWN 노출로 명시한다. 알려진 노출 4건(HIGH, 미수정): (1) 엔드포인트에 인증이 없다, (2) exam-complete는 pattern uuid라 임의 UUID마다 +2별 — 실재 시험 검증 없음, (3) wrong-word-recovered는 date:token이라 임의 토큰마다 +1별, (4) 서버측 일일 상한 없음. 대조군: 기존 XP 경로는 정확히 이 문제를 겪고 source_event_id를 기간키(날짜)로 제한해 고친 이력이 있는데(그 파일 주석) Reward V1에 그 교훈이 적용되지 않았다. 영향 범위는 reward_ledger 무결성에 한정 — total_stars는 클라이언트 로컬 값으로만 upsert되고 원장에서 재계산되지 않아 학생이 보는 별은 변하지 않는다(그래서 CRITICAL이 아닌 HIGH). 노출이 닫히면 KNOWN 단언이 CHANGED로 실패해 이 파일을 함께 갱신하도록 강제한다. production 요청 0, 네트워크 0. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testGameRewardPolicy.mjs', builders: [], extra: true, note: '2026-08-22 — 게임 보상 정책 재조정(운영자 지시). 야간 감사 실측에서 게임이 별 경제의 78%를 찍어내고 학생 6명은 별의 100%를 게임으로만 벌었다(최다: 하루 게임 18회 935별). 정책 3가지를 고정: (1) 라운드당 별 10->3, (2) 게임 보상은 하루 2세션까지, (3) 당일 학습 목표 4/4 달성 전에는 보상 0 — 단 플레이는 항상 허용(게임 금지가 아니라 보상 자격만 분리). 값 근거는 가정이 아니라 실데이터 시뮬레이션(학생-일자 312건/실학생 37명): 4/4 달성일의 학습 유래 별 중앙값 35 vs 게임 상한 2x5xN x 첫시도정답률 0.942 — N=3이면 28별로 학습 우위(1:0.80), N=4면 38별로 역전. 즉 3이 학습 우위를 지키는 최대 정수다. 상태 설계: 새 영속 필드 0개 — 오늘 보상받은 세션 수를 round.starGrantLog의 matchgame:<sessionId> 로 파생(날짜가 바뀌면 freshRound가 비움)하므로 마이그레이션/기존 레코드 변경이 없다(규칙 9). 검증: 순수 함수 계약(countRewardedGameSessions/gameRewardEligibility 방어 포함) + App.jsx 정적 검사(플레이는 게이팅하지 않고 보상만) + MatchGameShell 정직한 UI(차단 시 별 0 표시 + 사유 안내) + 경제 불변식(게임 하루 상한 < 학습 중앙값, 4별이면 역전) + 소급 차감/신규 저장키 0건. 구현 전 34단언 중 26개 FAIL 실측(규칙 15) 후 전체 PASS 전환. 네트워크 0, Supabase 0. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testMissionBonusIdempotency.mjs', builders: [], extra: true, note: '2026-08-23 — 레거시 daily-mission-bonus(+10) 중복 지급 버그 회귀 고정. 원인: 4/4 완료 useEffect가 grantReward로 dedup 키를 round.starGrantLog에 기록한 직후 같은 tick에 patch(round: freshRound())로 그 로그를 통째로 비워, 이 이벤트만 중복 방지 기억이 남지 않았다(유일한 가드 handledRoundRef는 useRef라 재마운트마다 초기화). 병합이 wordsViewed=unionList / examplesHeard·quizSolved·pronunciationOk=maxNum으로 리셋된 카운터를 4/4로 되살리므로, 새로고침·재로그인·탭 전환만으로 학습 액션 0개에 +10과 선물상자가 재발했다. production 실측 증거: starGrantLog가 비어있지 않은 학생 16명의 키 종류에 daily-mission-bonus 0개(pronunciation 66/spelling-combo 99/matchgame 32는 생존), 권교빈 2026-07-23 선물상자 37개 vs 필요 퀴즈 185회 대비 실제 20회, 이상 지급 570별(전체 획득 별의 3.0%, 그중 510별이 그 하루). 수정 3점: (1) 리셋이 starGrantLog를 이어받게, (2) signature를 wordsViewed.length(4/4 시점 항상 5라 모든 라운드가 같은 값)에서 실제 단어 집합 기반으로 교체해 라운드를 식별, (3) 선물상자/스티커를 별 지급 성공 여부(bonusGranted)에 묶어 중복 스티커 +20의 무제한 경로 차단. 검증: 수정 전 14단언 중 10개 FAIL 실측(규칙 15, 복원 5회 반복 시 +50별/선물 2->7 재현) 후 전체 PASS. 정상 새 라운드는 여전히 지급됨(무회귀 단언 포함). 7절은 daily-goal-complete(+3, Reward V1)가 같은 취약 구조인지 조사 — rewardLedger가 round 밖 최상위 필드라 freshRound에 지워지지 않고 복원 3회 후에도 원장 1건 유지, 취약하지 않음을 실측 확인. 네트워크 0, Supabase 0. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testRewardFlow.mjs', builders: ['race'], extra: true, note: '2026-08-15 Phase 2 — grantLedgerReward(useStudent.js) + 앵커 5종(word-session-complete +1/writing-complete +2/exam-complete +2/wrong-word-recovered +1/daily-goal-complete +3/streak-bonus 가변) 통합 테스트(fakeReact + race 번들, 네트워크 0). 운영자 결정 고정: 레거시 MISSION_BONUS_STARS(+10, 라운드 반복마다 매번 재지급)는 무변경 유지 + 신규 daily-goal-complete는 날짜 키 하루 1회로 별도 공존, rewardIdempotencyKey는 학생별 전역 unique. 신규 학생 진입 델타 0/중복 발화·리마운트·재로그인 재지급 0/mergeRewardLedgers union(local 우선)/구버전 레코드 normalize 안전까지 55단언. 배선 전 30단언 FAIL 실측(규칙 15) 후 배선. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testRewardBaselineMigration.mjs', builders: [], extra: true, note: '2026-08-17 — supabase_v3_37_reward_legacy_baseline.sql 이중 실행 절대 안전성(migration marker) 강화. 취약 시나리오: 첫 실행 당시 total_stars=0이라 대상에서 빠졌던 학생이 가동 후 별을 벌어 total_stars>0이 되면, idempotency_key unique 방어만으로는 재실행 시 그 학생에게 baseline이 새로 삽입돼 이중 계상되던 문제. reward_migration_log(migration_name primary key) marker 테이블을 v3_37 안에서 create if not exists로 추가해, 완료 기록이 있으면 precheck/INSERT/postcheck를 통째로 skip(무해한 no-op)하도록 고정. SQL 정적 단언(marker 테이블/skip 분기/ON CONFLICT/BEGIN·COMMIT/precheck·postcheck/student_progress 파괴적 DDL·DML 0건) + 순수 JS 인메모리 이중 실행 시뮬레이션(1회 실행/즉시 재실행/가동 후 재실행 이중계상 방지/total_stars 전수 불변/marker 없는 대조군의 실제 이중계상 재현 대조) — marker 비활성화 상태로 8단언 FAIL 실측(규칙 15) 후 SQL·스펙 함수에 marker 로직 추가해 PASS 전환. 네트워크 0, Supabase 미접촉. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testRewardLedgerMigration.mjs', builders: [], extra: true, note: '2026-08-18 — supabase_v3_36_reward_ledger.sql 최소 권한 + 진짜 멱등 강화. production 최대 student_progress.total_stars=1,553(smallint 32767 한계에서 안전) 실측 + src/·api/ 전체에서 reward_ledger/reward_totals를 SELECT하는 코드가 0건임을 실측(rewardEngine.js 주석 5줄이 전부)한 뒤, 앱이 전혀 읽지 않는 anon/authenticated SELECT GRANT + create policy를 완전히 제거(정책 0 + GRANT 0 = anon/authenticated 완전 차단, service_role만 RLS 우회 접근) — 부수 효과로 "정책 재실행 시 already exists 오류" 가능성도 원천 소거. 실행 후 검증 블록 중 실제로 행을 넣고 지우는 부분(anon insert 거부/dup-test-1 중복 insert)을 본문에서 제거해 별도 파일 supabase_v3_36_reward_ledger_VERIFY.sql로 분리(v3_36 본문은 이 파일 없이도 완결). ON DELETE CASCADE(xp_ledger 동일 패턴, 삭제 시 아카이브 트레이드오프)와 smallint 타입(1,553 실측 근거) 둘 다 변경 없이 판단 근거만 주석 보강. SQL 정적 단언(GRANT/policy 0건, VERIFY 분리, 파괴적 DDL·DML 0건 등 22단언) + 순수 JS 인메모리 이중 실행 시뮬레이션(1회/2회 재실행 무회귀, 기존 학생 데이터 전수 불변, anon 거부/service_role 허용/unique 중복 거부/reward_totals 집계 일치, 24단언) — 수정 전(anon SELECT GRANT + create policy + 본문에 dup-test/anon 실험 섞인 버전)으로 11개 정적 단언 FAIL 실측(규칙 15) 후 SQL 수정해 46단언 전체 PASS 전환. 네트워크 0, Supabase 미접촉. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testRewardServerWrite.mjs', builders: [], extra: true, note: '2026-08-18 — Reward System V1 서버 쓰기 경로(api/grant-xp.js의 `ledger:\'reward\'` 분기, service_role 전용) 구현. rewardEngine.js에 REWARD_SOURCE_RULES/isValidRewardType/isValidRewardSource/resolveRewardStars 4개를 추가(기존 export 63단언 무변경, import 0개 순수성 유지) — isValidRewardType은 REWARD_SOURCE_RULES에 없는 legacy-baseline을 항상 false로 원천 배제, isValidRewardSource는 sourceType 뒤바꿈/날짜 형식 위조(useStudent.js todayStr()의 실제 형식 `new Date().toDateString()` = "Www Mmm dd yyyy"에 맞춰 검증, ISO 아님)/uuid 위조/streak 범위(1~3650)를 전부 거부, resolveRewardStars가 서버 금액 결정의 유일한 경로(streak-bonus만 streakBonusStars로 위임, 3/5/7 아니면 0). api/grant-xp.js는 기존 XP 분기를 한 글자도 바꾸지 않고 새 분기만 추가 — req.body의 stars/amount/idempotency_key를 전혀 읽지 않고 항상 resolveRewardStars/rewardIdempotencyKey로 서버가 직접 계산·조립, 23505→duplicate:true, 42P01/PGRST205→table_missing, student_progress/students update/delete 0건. src/utils/wordLibrary.js에 postRewardEvent(postXpEvent와 동일 fire-and-forget 패턴) 추가, useStudent.js의 grantLedgerReward가 로컬 append+grantReward 이후 await 없이 호출. 순수 함수 계약(rewardEngine.js 신규 4개, 화이트박스) + api/grant-xp.js·wordLibrary.js·useStudent.js 소스 정적 검사(주석 오탐 방지를 위해 인라인 주석 제거한 codeOnly로 금액/키 미신뢰 확인) 56단언 — 배선 전 16개 정적 단언 FAIL 실측(규칙 15, 순수 함수는 이미 구현돼 선행 PASS) 후 구현해 전체 PASS 전환. 네트워크 0, Supabase 미접촉(실제 DB insert는 검증하지 않음 — 정직한 커버리지 경계, 파일 헤더 주석 참고). 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testRewardIdempotencyStress.mjs', builders: [], extra: true, note: '2026-08-19 — 중복 지급 방지 스트레스 테스트(4중 방어: hasRewardEntry 사전체크/appendRewardEntry patch 재검사/grantReward starGrantLog 2차방어/서버 idempotency_key UNIQUE). testRewardFlow.mjs(정상 배선 확인)와 별개로 "얼마나 심하게 중복 호출해도 정확히 1회만 지급되는가"만 전담: 더블클릭/5연타/10회 호출/StrictMode 유사 마운트→언마운트→재마운트/새로고침/재로그인/Unit 재전입/오답회복 교차경로 9회/네트워크 reject-재시도/6종 앵커 각 2회(합계 1+2+2+1+3+2=11 정확) 10개 시나리오 + idempotency_key 안정성(반복호출 동일/서로다른이벤트 상이)/날짜 경계(fake Date로 다음날 재마운트 시 새 키로 정상 재지급 확인)/학생간 교차오염 없음(공유 localStorage에서 studentId 다른 두 학생 격리) 3개 추가 단언 + 규칙15 대조군(hasRewardEntry 우회 naive append 10회→실제 10건 vs 실제 appendRewardEntry 10회→1건, 방어 실효성 실측 대조) — production 소스 무접촉, 자체 esbuild 번들(scripts/wordLibraryRaceStub.mjs를 수정하지 않고 그 위에 postRewardEvent 계측 가능한 래퍼 스텁을 scripts/.tmp/에 런타임 생성해 재사용) + 자체 postRewardEvent 카운터로 서버 POST 호출 <=1회까지 확인. 네트워크 0. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
      { script: 'scripts/testRewardConcurrencyMatrix.mjs', builders: [], extra: true, note: '2026-08-22 야간 감사 Phase 4 — 보상 동시성/부하 매트릭스. testRewardIdempotencyStress.mjs(<=10회 순차)를 대체하지 않고 그 위에 얹는다: 동일 논리 이벤트를 2/5/10/50/100회 (A) 한 tick 동기 폭주 / (B) Promise.all 동시 요청으로 몰아쳐도 원장 1건·잔액 1회분·서버 POST<=1이 유지되는지 검증. (C) postRewardEvent 50ms 지연 중 100회 재호출, (D) 누락 검사(서로 다른 100개 이벤트는 정확히 100건 — 중복 방지가 정상 지급을 막지 않음), (E) idempotency key 안정성(동일 입력 100회 -> 키 1개 / 서로 다른 100개 -> 키 100개), (F) Phase 3 정합성(earnedStars 원장 합계 === 실제 잔액 증가분). 자체 esbuild 번들(scripts/.tmp/useStudent.concurrency.bundle.mjs)과 자체 wordLibrary 스텁을 런타임 생성해 기존 테스트 산출물과 충돌하지 않는다 — production 소스/기존 스크립트 무접촉. 59단언, 네트워크 0, Supabase 0. 13개 필수 도메인 밖, 신규 보너스 커버리지.' },
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
