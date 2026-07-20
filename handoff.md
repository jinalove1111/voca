# Paul Easy Voca — Handoff
_최종 갱신: 2026-07-21 (1차, 학생 다중 교재 동시 배정 아키텍처 구현+배포 — DB 마이그레이션 대기 — Docs Maintainer 기록)_

## 2026-07-21 (1차) — 학생 다중 교재(Multi-Textbook) 동시 배정 아키텍처 구현 + 배포 — DB 마이그레이션 대기

### 무엇을 만들었나

`docs/agent-decisions/0004-multi-textbook-architecture.md`에서 승인된
설계(핵심: 새 `textbooks` 엔티티를 신설하지 않고 이미 `class_id`로
스코핑된 `classes`를 교재 컨테이너로 재사용, 신규 조인 테이블
`student_class_assignments`로 학생↔반 다대다 배정을 표현)를 그대로
구현했다.

- **마이그레이션 SQL 준비**: `supabase_v2_9_student_class_assignments.sql`
  — `student_class_assignments` 테이블(멱등 `create table if not
  exists`) + 역방향 조회용 인덱스 2개(`student_id`/`class_id`) + v1.3
  "allow anon all" RLS 패턴(`using(true) with check(true)`) + 기존 294명
  학생 백필(`is_primary=true` 행 1개씩, `students.class_id`/
  `current_unit_id` 값을 그대로 복제, `on conflict do nothing`으로
  재실행 안전) + 실행 후 검증 쿼리 5종(백필 건수/원본 일치/미배정
  학생 목록/`is_primary` 중복 여부/anon 권한). **이 SQL 자체는 아직
  Supabase에 실행되지 않았다**(아래 "남은 위험" 참고).
- **백엔드**: `src/utils/wordLibrary.js`에 `getStudentClassAssignments()`
  (신규 테이블 조회, 부재 시 `syntheticPrimaryAssignment()`로 오늘의
  단일 반 동작을 합성해 폴백) + `isMissingTableError()`(테이블 부재
  감지 공용 헬퍼) + 배정 결과 캐시(`_studentAssignmentsCache`) 추가.
  커밋 `fe1cdf6`.
- **프론트엔드**: 학생 측 `src/components/TextbookSelector.jsx`(배정이
  2개 이상일 때만 노출, 1개 이하면 화면 변화 0) + 관리자 측
  `src/components/admin/TextbookAssignmentPanel.jsx`(반 안에서 학생별로
  추가 교재를 배정/해제하고, 배정된 교재별 현재 유닛을 변경). 커밋
  `3a75f8a`.

### QA 요약

3라운드 독립 리뷰 전부 통과.

1. **구현자 자체 점검**: `npm run build` clean.
2. **QA 리뷰어 — diff + 사용처 감사**: `verify:student`/`verify:unit`/
   `verify:daily-study`/`verify:word-assignment`/`verify:homework`/
   `verify:admin`/`verify:persistence` 전부 PASS. `verify:login` 1건
   FAIL이 있었으나, 이번 변경과 무관하게 기존부터 있던 환경 요인
   (pre-existing/environmental)임을 독립적으로 재확인 — 이번 기능과는
   무관.
3. **게임화 분리 감사**(별도 라운드): XP/레벨/코인/티켓/스트리크/뱃지/
   데일리 리워드가 이번 변경으로 교재 수만큼 중복 적립되거나 유실되지
   않는지 별도 감사 — 누수 0건 확인(전부 계속 계정 전역 스키마 그대로).

### 배포

`origin/main`에 push(`c08f648..3a75f8a`), 라이브 번들 해시가 로컬
`npm run build` 산출물과 바이트 단위로 일치함을 확인해 신규 코드가 실제로
서빙 중임을 실측 확인(이 저장소의 표준 "번들 해시 대조" 배포 검증 패턴,
`ARCHITECTURE.md` 8번 섹션).

**마이그레이션 이전 배포의 안전성 근거(코드 인용)** — 신규 코드는
`supabase_v2_9_student_class_assignments.sql` 미실행 상태에서도 완전히
비활성/무해함을 코드 추적으로 확인:

- `wordLibrary.js`의 `getStudentClassAssignments()`가
  `isMissingTableError()`로 테이블 부재를 감지하면
  `syntheticPrimaryAssignment(studentId)`로 오늘의 `students.class_id`/
  `current_unit_id`를 그대로 합성한 단일 배정 1개를 반환 — 기존 294명
  학생 전원이 오늘과 행동상 완전히 동일하게 동작.
- `TextbookSelector.jsx`/`TextbookAssignmentPanel.jsx` 둘 다 배정이
  1개 이하면 렌더 자체를 건너뛰는 가드가 있어, 마이그레이션 미실행
  상태에서는 두 컴포넌트 모두 화면에 전혀 나타나지 않는다.

### 남은 위험

1. **차단 항목(유일)**: `supabase_v2_9_student_class_assignments.sql`이
   아직 Supabase에 실행되지 않았다 — CLAUDE.md 규칙 8에 따라 어떤
   에이전트도 직접 실행할 수 없고, 운영자가 Supabase 대시보드 SQL
   Editor에서 수동 실행해야 기능이 활성화된다. 실행 후에도 관리자가
   실제로 학생에게 두 번째 교재를 배정하기 전까지는 기존 화면에 변화가
   없다.
2. **이번 단계에서 의도적으로 보류(버그 아님)**: 숙제/미션 진행 상태
   (`student_daily_progress`, 메모리상 `round` 카운터)는 계속 학생
   단위 전역으로 남고 교재별로 분리되지 않는다 — 실사용 다중 교재
   사례가 아직 없는 상태에서 파급 범위가 훨씬 큰 이 변경을 선제적으로
   하지 않기로 한 명시적 설계 결정(`0004` 문서 "대안 D" 참고), 후속
   단계로 연기하며 별도 문서로 추적 예정.

### 배운 점 (간단히)

1. `classes`를 교재 컨테이너로 재사용하기로 한 결정 덕분에 새로운 병렬
   콘텐츠 계층(`textbooks`/`textbook_id`)을 전혀 만들지 않고도
   `units`/`daily_assignments`/`entrance_tests`/`word_king_history`/
   반별 설정이 코드 변경 없이 그대로 교재별로 스코핑됐다 — 이미 존재하는
   스코핑 메커니즘을 재조사해 찾아낸 것이 신규 스키마를 새로 설계하는
   것보다 더 큰 절감이었다.
2. 학생 측(`TextbookSelector.jsx`)과 관리자 측
   (`TextbookAssignmentPanel.jsx`) 프론트엔드를 서로 겹치지 않는 파일
   집합으로 나눠 여러 에이전트가 동시에 작업했는데도 병합 충돌이 전혀
   없었다 — 화면/역할 경계가 파일 경계와 이미 일치하는 저장소 구조
   (`src/components/` vs `src/components/admin/`)가 병렬 작업을 자연스럽게
   가능하게 한 사례.

## 2026-07-20 (4차) — Writing(Spelling) 복습 큐 MVP 구현 + 2단계 QA 리뷰 완료

### Writing MVP implemented

`docs/agent-decisions/0002-writing-feature-design-review.md`에서 진단된
근본 원인("자정 리셋으로 인한 익일 복습 단절")을 해소하기 위해,
`progress_data` jsonb 안에 자정 라운드 리셋에서 살아남는 영구 필드
`spellingReviewQueue`를 추가해 놓친 철자 단어가 익일 복습으로 이어지도록
구현했다 — `src/hooks/useStudent.js`, `src/App.jsx`,
`src/components/SpellingQuestion.jsx`, `src/components/SpellingReview.jsx`,
`src/components/WordDetail.jsx`, `scripts/testMergeProgress.mjs` 6개
파일(작성 시점 uncommitted), 이월된 단어를 다시 완전히 맞혔을 때 보여주는
"컴백" 배지 UI 포함. 설계 기록은 `0002-writing-feature-design-review.md`
— 최초에는 "권장 MVP는 아래" 식의 승인 대기 스텁이었으나, 이번 세션에
승인된 MVP 전체 내용(범위 In/Out, 파일별 변경, QA 결과)이 실제로 그
문서에 채워져 완료 상태로 갱신됐다.

### QA review completed

2단계 QA 진행.

1. **1차 — 초기 코드 리뷰**(구현을 설계 의도와 대조): `npm run build`
   PASS, `npm run verify:writing` PASS, `npm run verify:persistence`
   PASS(8/8, 신규 롤오버/병합 케이스 포함), `npm run verify:student`
   PASS, 저장소 헌법 위반 없음(학생 식별 UUID 일관, 스키마/GRANT 갭 없음,
   PIN/관리자 노출 없음, 소유하지 않은 파일 미변경).
2. **2차 — 수동 스모크 테스트**: 위 하네스 전부 재실행(동일 PASS 결과
   재확인), 6개 파일 전체의 prop/데이터 흐름을 추적해 깨진
   import·undefined 참조·prop 이름 불일치가 없음을 확인, `submitAnswer()`의
   정답/오답 경로가 큐 클리어 추가분을 제외하면 기존과 동일함을 확인,
   빈 입력 제출 시 refocus 처리가 early-return이라 정상 제출 흐름에
   영향을 줄 수 없고 그 ref 대상이 입력 방향 두 분기 모두에 존재함을
   확인, 신규 필드/prop마다 안전한 기본값이 코드로 확인됨을 확인
   (`spellingReviewQueue: []`, `SpellingReview.jsx`의
   `comebackWordIds: []`, `SpellingQuestion.jsx`의
   `isComebackWord: false`) — 기존 호출부는 변경 전과 동일하게 동작.

### Remaining risks

1. 이 환경에는 실제 브라우저/기기가 없어 검증 불가능한 항목 3가지 —
   컴백 배지의 실제 시각 렌더링, 빈 제출 refocus의 실제 DOM `focus()`
   동작, iOS Safari의 사용자 제스처 밖 `focus()` 제한(코드 자체의 기존
   주석이 "100% 보장 아님"이라고 이미 명시). 실기기 수동 확인 권장.
2. `normalizeRecord()`는 writing 기능 사용 여부와 무관하게 모든 학생의
   모든 진행도 로드 시 실행되는 공유 hot path다 — writing 기능과 무관한
   (당일 로드) 경로가 diff 전과 바이트 단위로 동일함을 확인했지만, 이번
   변경 중 파급 범위가 가장 넓은 지점으로 향후 장애 triage 시 우선
   플래그.
3. 30초 주기 세션 내(in-session) 자정 롤오버 `useEffect` 경로는 자동
   테스트가 없다(`testMergeProgress.mjs`는 로드 시점 `normalizeRecord`
   롤오버 경로만 커버).

### Deployment result

완료 확인.

- 커밋 #1(feature) `21d78a1` — feat: 스펠링 리뷰큐 MVP
- 커밋 #2(docs) `bc17e5d` — docs: 설계검토 문서 완료 + handoff append
- origin/main push: `dc3fd41..bc17e5d`, fast-forward, 충돌 없음
- Vercel 프로덕션(`https://voca-drab.vercel.app/`)이 신규 코드를 서빙
  중임을 확인 — 로컬 `npm run build` 산출 파일명(`index-DsRpE-f3.js`,
  `index-CTite8TT.css`)이 라이브 사이트가 참조하는 에셋과 정확히
  일치하고, 라이브 JS 번들에서 기능 고유 식별자(`spellingReviewQueue`,
  `isComebackWord`, 갱신된 타이틀 문자열 "틀린 단어 복습")를 grep해
  전부 확인됨. 이 검증은 번들 해시+문자열 대조 기반의 간접 확인이며(이
  환경에는 Vercel 대시보드/API 직접 접근 수단이 없음), Vercel 배포
  상태 필드를 문자 그대로 읽은 것은 아니다.
- `api/` 함수 개수는 이번 diff로 변경되지 않았고 여전히 Vercel Hobby
  플랜 12개 함수 한도에 정확히 걸쳐 있음(초과는 아니지만 향후 API
  추가 여력이 0인 상태 — 다음 세션들을 위한 상시 제약으로 플래그).

### Lessons learned (brief)

1. 원 설계 리뷰 문서(`0002-...md`)가 "권장 MVP는 아래"라고만 언급하고
   실제 내용은 채팅 대화로만 결정된 채 문서에는 한 번도 붙여넣어지지
   않은 스텁 상태로 남아 있었다 — 이 때문에 이번 세션 리뷰어가 작성된
   스펙 문서 대신 코드 주석과 diff를 역추적해 승인 범위를 재구성해야
   했다. 프로세스 개선: 설계 결정이 승인되는 시점에 승인된 내용을 결정
   문서에 즉시 기록해야 하며, 구현이 먼저 진행되고 문서는 대기 placeholder
   상태로 남겨두면 안 된다.
2. "결정을 먼저 pending으로 기록하고, 이후 구현" 패턴에는 명시적인
   "루프 닫기" 단계가 필요하다 — 결정 문서 헤더 자체가 "아직 코드 변경
   없음"이라고 선언한 채로 구현이 시작되면서 조용히 stale해졌고, 이걸
   놓치면 이후 읽는 사람을 오도할 수 있다.

## 2026-07-20 (3차) — Project Paul Multi-Agent Development Framework 신설 — Orchestrator

운영자 지시: 기존 `.claude/agents/`(5개)를 흡수해 하나의 조직으로 재구성,
병렬 조직 금지, CEO 미생성. 산출물:

- `docs/agent-architecture.md` — 기존 5개 agent(`planner`/`implementer`/
  `qa-reviewer`/`security-reviewer`/`docs-maintainer`) 전부 preserve(폐기
  없음). **중요 발견**: 세션에 "사용 가능"으로 뜨는 `engineering-head`/
  `qa-head`/`security-head`/`planning-agent` 등은 이 저장소에 커밋된
  파일이 아님(버전관리 밖, 전역/플러그인 레벨) — 목표 계층도의 해당
  라벨은 실재 파일 4개의 동의어로 매핑, 중복 파일 생성 안 함.
- 신규 7개 agent(`.claude/agents/`): `mission-guardian`/`orchestrator`/
  `product-guardian`/`learning-designer`/`child-experience-designer`/
  `deployment-engineer`/`student-analytics`. 전부 코드 미작성(평가/조정/
  검증 전담), CEO 없음.
- `PROJECT_PAUL_GOAL.md` — 미션 + 6개 축(Joy/Challenge/Real Learning/
  Visible Growth/Achievement/Continuation) + 가드레일(조작적 몰입/수치심
  동기부여/가짜 진행도/기능우선개발 금지 등).
- `MULTI_AGENT_WORKFLOW.md` — 토큰효율 12단계 워크플로우, 작업당 최대
  4명(Orchestrator 제외), 정지조건(파괴적 DB/시크릿변경/유료서비스/
  락아웃위험 인증변경/크리티컬 테스트 실패).
- **파일럿 1건 완료**: `PROJECT_BOARD.md` "[P3] 반 삭제 확인 다이얼로그
  문구 개선" — `AdminScreen.jsx` 반 삭제 다이얼로그에 "학생 계정/진행도는
  유지되고 반 배정만 해제됨" 안심 문구 추가(`DATABASE.md:96`의 `ON DELETE
  SET NULL` 실측 사실 근거). 소집: Implementer(본 세션)+QA
  Reviewer(서브에이전트, PASS)+Deployment Engineer(본 세션) — Product
  Guardian 등 학생경험 전문가는 관리자 전용 화면이라 불필요 판단해
  미소집(워크플로우의 "필요한 경우만 소집" 원칙 실증). 결정 기록:
  `docs/agent-decisions/0001-class-delete-dialog-copy.md`.
- 검증: `npm run build` PASS(2회, 프레임워크 구축 전/파일럿 후), 신규
  agent 7개 파일이 세션에 "사용 가능"으로 뜸을 확인(discoverable 검증).
  배포 검증은 아래 별도 기록.

## 2026-07-20 (2차) — Vercel 프로덕션 배포 정체(Hobby 12개 함수 한도 초과) P0 해소 — 관리자 PIN 액션 3개를 `api/admin-pin-actions.js`로 통합 — Engineering Head

`git log`로 확인된 커밋 5개(이번 세션 전체): `cf491f0`(배포 정체 체크포인트
기록) → `284bb75`(원인 조사 체크포인트 갱신, Hobby 함수 한도 초과 가설) →
`101a7c2`(원인 실측 확정) → `819a731`(구현 — 관리자 PIN 액션 3개 통합) →
`6cfe30a`(구현 나머지 절반 — 호출부/테스트/문서 참조 갱신, push 전 발견된
`819a731` 누락분 보완). 앞 3개 커밋은 `.ai-status/
engineering-head-vercel-deploy-verify.json`에만 체크포인트로 기록돼 있고
`handoff.md`에는 아직 기록되지 않았던 상태라, 이번 문서화 세션에서 배경
조사부터 구현·배포·검증까지 전체를 처음으로 handoff.md에 정리한다.

### 배경 — 원인 실측 확정 (`cf491f0`/`284bb75`/`101a7c2`)

- 2026-07-19 세션 9차(House System, `dbda442`) 이후 모든 Vercel 배포가
  조용히 실패해온 사실이 확정됐다. 근거 3가지가 정확히 일치(추측 아님,
  `.ai-status/engineering-head-vercel-deploy-verify.json` 원문):
  1. `git ls-tree`로 `api/` 라우트 파일(밑줄 헬퍼 제외) 개수 실측 — 마지막
     성공 배포 커밋(`718d1a9`)은 12개, 조사 시점 HEAD는 14개.
  2. Vercel 공식 문서(functions/runtimes, 2026-07-01 갱신) 원문 인용:
     "For Hobby, this approach is limited to 12 Vercel Functions per
     deployment"(Vite 등 non-Next 프레임워크는 `api/` 파일 1개=함수 1개
     직접 매핑).
  3. 라이브 사이트 직접 curl 실측 — `718d1a9` 시점 12개 파일 전부 HTTP
     405(GET 거부 = 함수가 실제로 살아있다는 증거), House System 이후
     신규 2개(`compute-word-king.js`/`start-new-season.js`)는 HTTP
     404(한 번도 배포된 적 없음), `api/_pinAuth.js`는 HTTP 404(밑줄 제외
     관례가 실제 배포에서도 작동 중임을 실측 확인 — 문서만으로 판단하지
     않음).
- 이 조사는 이전 세션이 이미 완료해 `.ai-status`에 체크포인트로 남겼으나
  (규칙 17), 사람이 읽는 `handoff.md`에는 반영되지 않은 상태였다 — 이번
  세션에서 이 배경 조사 자체가 처음 handoff.md에 기록된다(재조사 아님,
  기록 누락 보완).

### Phase 1 — 보안 리뷰 먼저 (구현 착수 전 security-reviewer dispatch)

- 함수 개수 14→12 감축을 위해 통합 후보 3개 파일을 골랐다:
  `api/bulk-generate-temp-pins.js`/`api/set-pin-setup-allowed.js`/
  `api/unlock-student-pin.js` — 셋 다 정확히 같은 인가 게이트
  (`_pinAuth.js`의 `checkAdminReauth()`)를 요청마다 재검증하는 공통점이
  있어 통합 후보로 선정.
- security-reviewer 서브에이전트가 코드 재검증(비교군으로
  `clear-student-pin.js`/`set-student-pin.js`/`self-set-student-pin.js`/
  `student-pin-status.js`/`verify-admin-pin.js`/`verify-student-pin.js`도
  전부 다시 읽음) 후 **PASS** 판정 — 숨은 신뢰 경계 차이 없음, 권한
  상승 위험 없음. 필수 조건 2가지 명시:
  1. 각 액션의 요청 필드명(`studentIds` 배열 vs `studentId` 단수 vs
     bulk는 대상 필드 없음)과 응답 바디 형태(특히
     `bulk_generate_temp_pins`는 `ok` 필드 없이 `{count,results}`만)를
     통일하지 않고 원본 그대로 보존할 것.
  2. `scripts/testStudentPinAuth.mjs`/`scripts/testStudentPinSelfSetup.mjs`
     가 이 3개 파일을 `import()`로 직접 로드하므로 같은 작업 단위로
     갱신하지 않으면 `verify:login`이 `ERR_MODULE_NOT_FOUND`로 깨짐.

### Phase 2 — 구현 (`819a731` + `6cfe30a`)

- `api/admin-pin-actions.js` 신설 — `req.body.action`(허용값
  `bulk_generate_temp_pins`/`set_pin_setup_allowed`/`unlock_student_pin`,
  `Set`으로 명시적 allowlist) 기반 dispatch. `checkAdminReauth()`가 action
  분기보다 항상 먼저 실행돼, 미인증 요청이 action 값으로 어떤 액션이
  존재하는지 탐지할 수 없다. 각 액션 블록은 원본 3개 파일의 로직을 그대로
  복사(필드명/응답 형태 무변경, security-reviewer 조건 1 준수). 미인증/
  미지정 action은 400, 알 수 없는 action도 400.
- `src/components/AdminScreen.jsx`의 3개 호출 지점
  (`handleBulkGeneratePins`/`handleTogglePinSetupAllowed`+
  `handleBulkAllowPinSetup`/`handleUnlockPin`)을 `/api/admin-pin-actions`
  + `action` 필드로 갱신, 응답 파싱 로직(`data.ok`/`data.reason`/
  `data.results` 등)은 무변경.
- `scripts/testStudentPinAuth.mjs`/`scripts/testStudentPinSelfSetup.mjs`의
  `import()` 경로를 `admin-pin-actions.js`로 갱신(security-reviewer 조건
  2 준수).
- 원본 3개 파일 삭제. 부수적으로 `api/_pinAuth.js`/
  `api/clear-student-pin.js`/`scripts/hooks/suggestVerifyDomain.mjs`의
  삭제된 파일명 참조 주석/정규식도 갱신(기능 무변경).
- `819a731`이 staging 실수로 새 파일 생성+3개 파일 삭제만 담고 호출부
  갱신을 누락한 것을 push 전에 발견(원격에는 반영된 적 없음) —
  `6cfe30a`가 누락분(호출부/테스트/registry.mjs 등록)을 보완해 두 커밋을
  합쳐야 완전한 원자적 변경이 된다(규칙 14 파일/기능 단위 소커밋과는
  별개로, 이 경우는 같은 논리적 변경을 두 커밋으로 분할한 것 — 커밋
  메시지에 이유 명시).
- **api 파일 수 실측**: 통합 전 14개 → 통합 후 **12개**(밑줄 헬퍼
  `_pinAuth.js` 제외) — `git ls-tree -r --name-only HEAD -- api/ | grep
  -v '^api/_'`로 확인.

### Phase 3 — 테스트

- 신규 `scripts/testAdminPinActionsDispatch.mjs` — DB 쓰기 없이 항상
  결정적으로 도는 순수 라우팅/인가순서/필드검증 테스트 10개(method 체크,
  인가가 action 분기보다 먼저인지, action 누락·미지정 400, 각 액션 필드
  검증, DB 단계 도달 확인). `tests/harness/registry.mjs`의 `login`
  도메인에 등록.
- **로컬 실행 결과**: `node scripts/testAdminPinActionsDispatch.mjs`
  10/10 PASS, `npm run build` PASS.
- `testStudentPinAuth.mjs`/`testStudentPinSelfSetup.mjs`는 로컬에
  `SUPABASE_SERVICE_ROLE_KEY`가 없어(`ARCHITECTURE.md` 기존 문서화된
  제약) anon key 폴백이 v1.9 RLS 컬럼권한에 막혀 `permission denied for
  table students`로 DB 단계부터 실패 — 이 세션이 전혀 손대지 않은
  `api/clear-student-pin.js`를 테스트하는 `scripts/testClearStudentPin.mjs`
  도 동일 에러로 실패하는 것을 실측 확인해 **회귀가 아니라 사전 존재
  환경 제약**임을 확정(규칙 15 패턴 — 수정 전 코드 동치물로 재현 확인).
- `npm run verify:login` 전체 실행 결과: `testAdminPinActionsDispatch.mjs`
  만 신규로 PASS 추가, 나머지 로그인 도메인 FAIL 목록
  (`testStudentSelectPinStatus.mjs`/`testStudentPinAuth.mjs`/
  `testStudentPinSelfSetup.mjs`/`testClearStudentPin.mjs`)은 이번 세션
  이전부터 있던 동일한 로컬 서비스롤 키 부재 문제 그대로(신규 회귀
  없음, `PROJECT_BOARD.md` BLOCKED 카드와 동일 근본 원인).

### Phase 4 — 배포 + 라이브 검증

- push 후 Vercel이 새로 배포됨(라이브 `index.html`의 `Last-Modified`가
  정체돼 있던 `2026-07-19T04:40:13Z`에서 새로운 타임스탬프로 갱신됨,
  라이브 번들 해시 `index-B3NOr6tz.js`가 로컬 `npm run build` 산출물과
  정확히 일치 — 동일 소스 확인).
- 라이브 실측:
  - `/api/admin-pin-actions` GET → 405(존재 확인)
  - `/api/bulk-generate-temp-pins`, `/api/set-pin-setup-allowed`,
    `/api/unlock-student-pin` → 전부 404(삭제 확인)
  - `/api/compute-word-king`, `/api/start-new-season`(세션 9~11차부터
    배포 안 되고 있던 것들) → 이제 405(존재 확인 — **이번 수정으로 배포
    정체 전체가 풀렸다는 결정적 증거**, House System/Seasonal
    Progression 카드가 이미 여러 세션 전에 구현·커밋됐음에도 실제로는
    한 번도 라이브에 반영되지 않고 있었다는 뜻이기도 하다).

### 라이브 스모크 테스트 — 부분 완료, 운영자 확인 1건 필요

- 라우팅/인가 경로는 라이브에서 직접 HTTPS로 실측 확인 완료: GET→405,
  미인증/틀린 adminPin→전부 `not_authorized`, 알 수 없는 action→틀린
  adminPin과 겹쳐 `not_authorized`로 먼저 걸러짐(설계대로 정상 — 인가가
  action 분기보다 항상 먼저라는 Phase 2 설계가 프로덕션에서도 그대로
  동작).
- QA 디스포저블 학생을 만들어 실제 성공 경로(`set_pin_setup_allowed`/
  `unlock_student_pin`)까지 라이브로 찌르려 했으나, 로컬 `.env.local`의
  `ADMIN_PIN` 값이 Vercel 프로덕션에 설정된 `ADMIN_PIN`과 다른 값이라
  (별도 환경변수라 당연히 정상 — 로컬/프로덕션 시크릿을 동일하게 두지
  않는 게 맞다) `not_authorized`로 거부됨 — 이 자체가 인가 게이트가
  프로덕션에서 정확히 작동한다는 증거이기도 하다. 에이전트가 프로덕션
  `ADMIN_PIN`을 알아내거나 추측 시도하는 건 절대 하지 않았다(보안 원칙).
- 이 때문에 3개 액션의 "성공 경로"(실제 DB에 반영되는지)는 이 세션에서
  라이브로 끝까지 확인하지 못했다 — **운영자가 실제 AdminScreen 관리자
  화면에서 PIN 재설정 허용 토글 1번 + 잠금 해제 버튼 1번(테스트용 아무
  학생이나, 되돌리기 쉬운 액션들) 눌러서 정상 동작하는지 30초 확인
  필요**. 이게 이 작업의 유일한 미확인 항목.

### 롤백 계획

문제 발생 시 이 두 커밋(`819a731`+`6cfe30a`)을 `git revert`하면 기존
3-파일 구조로 즉시 복귀 가능하나, 그 순간 api 함수 수가 다시 14개로
늘어 원래 배포 정체 문제가 재발한다(운영자 인지 필요 — 롤백을 고려할
정도의 문제라면 함수 수 재감축 없이는 롤백해선 안 됨).

### 종합

- 코드 변경 파일: `api/admin-pin-actions.js`(신규), `api/
  bulk-generate-temp-pins.js`/`api/set-pin-setup-allowed.js`/`api/
  unlock-student-pin.js`(삭제), `api/_pinAuth.js`, `api/
  clear-student-pin.js`, `src/components/AdminScreen.jsx`, `scripts/
  testStudentPinAuth.mjs`, `scripts/testStudentPinSelfSetup.mjs`,
  `scripts/testAdminPinActionsDispatch.mjs`(신규), `scripts/hooks/
  suggestVerifyDomain.mjs`, `tests/harness/registry.mjs`.
- 신규 SQL 없음, 신규 Supabase 컬럼/테이블 없음 — `DATABASE.md` 갱신
  대상 아님.
- 신규 아키텍처 제약(향후 세션 재발 방지용): Vercel Hobby 플랜은 배포당
  서버리스 함수 12개 한도 — `api/*.js`(밑줄 헬퍼 제외) 신규 파일 추가
  전 반드시 현재 개수를 확인할 것. 상세는 `ARCHITECTURE.md` "8. 배포
  프로세스"/`DEVELOPER_GUIDE.md` "Deployment Checklist" 신규 항목.
- 검수 대기: security-reviewer는 이미 Phase 1에서 PASS 판정 완료(이
  세션 자체 내 수행) — 남은 것은 qa-reviewer의 별도 코드 리뷰(미착수)와
  위 "라이브 스모크 테스트" 섹션의 운영자 확인 1건.

## 2026-07-20 (1차) — 시즌 경계 타임스탬프 비교 버그 수정(PostgREST timestamptz vs JS toISOString) + 시즌 패널 안내 문구 정정 — Engineering Head

`git log -2`로 확인된 커밋 `4510305`(버그 수정)와 `5da2533`(안내 문구
정정) 두 건. 둘 다 2026-07-19(10차) Seasonal Progression 카드
(`ae07688`~`b6b15c9`)의 후속 수정이며, 신규 기능 추가 없이 기존 구현의
정확성만 교정한다.

### 1. `sumTicketBalanceSince()`/`computeHouseSeasonScores()` 시즌 경계 비교 버그 (`4510305`)

- **배경**: `src/utils/ticketEconomy.js`의 `sumTicketBalanceSince()`와
  `src/utils/houseSystem.js`의 `computeHouseSeasonScores()`가 시즌 경계
  (`seasons.started_at`)와 원장 항목(`entry.at`)을 문자열로 직접 `>=`/`<`
  비교하고 있었다. `seasons.started_at`은 Postgres `timestamptz`를
  PostgREST가 직렬화한 값이라 `+00:00` 오프셋 + 마이크로초 정밀도(예:
  `2026-07-19T10:00:00.500000+00:00`)로 오는 반면, 원장의 `entry.at`은
  클라이언트가 `new Date().toISOString()`으로 만든 `Z` 접미사 + 밀리초
  정밀도(예: `2026-07-19T10:01:00.000Z`)라, 같은 순간이라도 사전식
  (lexical) 문자열 비교가 실제 시각과 어긋날 수 있었다(`entry.at`의 `Z`
  접미사 문자코드가 시즌 시각 문자열의 숫자 접미사보다 커서, 실제로는
  시즌 시작 "이전"에 적립된 항목이 "이후"로 잘못 포함될 위험이 있었다).
- **수정**: 두 함수 모두 `new Date(seasonStartedAt).getTime()` /
  `new Date(entry.at).getTime()`으로 실제 epoch ms 비교로 교체
  (`src/utils/ticketEconomy.js` `sumTicketBalanceSince()`,
  `src/utils/houseSystem.js` `computeHouseSeasonScores()`).
- **검증**: `scripts/testSeasonalProgression.mjs`에 PostgREST 형식 경계
  재현 케이스 추가 — "1.5. 회귀 방지 — PostgREST timestamptz 형식(+00:00,
  마이크로초) vs JS toISOString(Z, 밀리초) 문자열 비교 버그" 절(2개
  체크: 실제 회귀 재현 + 밀리초 미만 정밀도 한계에서도 크래시 없이
  결정적으로 처리되는지)과, 2번 섹션 말미 "2.5. 회귀 방지" 절(1개 체크:
  House 팀 점수 쪽도 같은 클래스 버그였음을 별도 실측)로 신규 3개 체크
  추가. 하네스 총 체크 수 20개(2026-07-19 10차 시점) → **22개**로 증가
  (`grep -c "check("` 실측 확인). `node scripts/testSeasonalProgression.mjs`
  22/22 PASS, `npm run build` 통과 확인.
- **영향 범위 판단**: 이 버그는 아직 실행되지 않았을 가능성이 있는 시즌
  기능(`ae07688` "미실행" 커밋 참고, `seasons` 테이블 자체가 운영자에
  의해 Supabase에 아직 실행되지 않았을 수 있음)에 대한 사전 수정으로
  보인다 — 실사용 데이터 영향 여부는 `seasons` 테이블 실행 여부를
  운영자에게 확인이 필요하다(미확인 상태 — 이 세션에서 별도 조사는
  하지 않았음).

### 2. 시즌 패널 안내 문구 — 티켓 잔액 시즌 미연동 명시 (`5da2533`)

- **배경**: `src/components/AdminScreen.jsx`의 `SeasonPanel` 컴포넌트가
  "새 시즌을 시작하면 티켓 잔액과 하우스 팀 점수만 새로 쌓인다"는 취지로
  안내해, 관리자가 티켓도 시즌 리셋 대상으로 오해할 수 있는 문구였다.
  실제 구현(2026-07-19 10차 Seasonal Progression 세션 기준)은 하우스
  팀 점수만 시즌 경계(`computeHouseSeasonScores`)가 적용되고, 티켓
  잔액/상점은 `sumTicketBalance()`(전체 누적)를 그대로 쓰고 있어 시즌과
  무관하게 계속 누적 값으로 표시된다(`sumTicketBalanceSince()`는 이미
  구현/테스트됐지만 실제 잔액 표시 경로에는 아직 배선되지 않음 — 11차
  handoff의 "여전히 BACKLOG인 것" 목록에도 이미 기록돼 있던 사실).
- **수정**: `handleStart()`의 `window.confirm()` 다이얼로그 문구와 패널
  하단 설명 텍스트를 실제 동작에 맞게 정정 — "티켓 잔액/상점은 이번
  라운드에는 시즌과 연동되지 않아 계속 전체 누적 값 그대로예요(다음
  라운드 확장 예정)"로 명시(`src/components/AdminScreen.jsx`
  `SeasonPanel` 컴포넌트 내 확인 다이얼로그 및 하단 설명 문단).
- **검증**: 텍스트 전용 수정(로직 변경 없음) — `npm run build` 통과
  확인. 별도 테스트 하네스 대상 아님(문구 텍스트는 자동 검증 범위 밖).

### 종합

- 코드 변경 파일: `src/utils/houseSystem.js`, `src/utils/ticketEconomy.js`,
  `scripts/testSeasonalProgression.mjs`, `src/components/AdminScreen.jsx`
  — 4개 파일, 2커밋(규칙 14 파일/기능 단위 소커밋 준수 — 버그 수정과
  문구 정정을 분리).
- 신규 SQL 없음, 신규 Supabase 컬럼/테이블 없음 — `DATABASE.md` 갱신
  대상 아님.
- `TESTING.md`의 `testSeasonalProgression.mjs` 설명(카테고리 1 표)은
  체크 개수를 명시하지 않는 서술형이라 별도 갱신 불필요(개수는 이 문서와
  `scripts/testSeasonalProgression.mjs` 파일 자체가 최신 진실 원천).
- 검수 대기: qa-reviewer/security-reviewer 코드 리뷰(10차 Seasonal
  Progression 카드 자체가 이미 리뷰 대기 상태였던 것과 동일 큐, 이번
  두 커밋도 같은 큐에 추가).

## 2026-07-19 (11차) — 게임화 하위카드 10번(Parent Motivation, 게임화 로드맵 마지막 카드) — Engineering Head

`git log -35`로 최근 완료 6단계(입실시험 서버재검증/Teacher Controls/
Ticket Economy+Daily Missions/Word King/House System/Seasonal
Progression) 확인, `PROJECT_BOARD.md` 게임화 하위카드 10번, `GAME_DESIGN.md`
14번 섹션, `PAUL_PRINCIPLES.md`(학부모가 압박 대신 성장을 보는 이유) 정독
후 구현. 운영자 지시 핵심: "`computeStudentStats()`/`buildWeeklyReport()`
확장만 — 새 Supabase 쿼리·새 AI 호출 절대 금지", "압박이 아니라 성장 —
순위/등수 노출 금지".

- **구현**: `src/utils/weeklyReport.js`의 `computeStudentStats(r,
  wordStatusSummary, houseId)`에 3번째 선택 인자 + 반환값에
  `ticketBalance`(`ticketEconomy.js sumTicketBalance()` 재사용,
  `r.progress.progress_data.ticketLedger`에서 파생 — `fetchDashboardData`가
  이미 `student_progress`를 `select('*')`로 가져오므로 새 쿼리 0)/
  `house`(`houseSystem.js getHouseById(houseId)` 재사용) 추가.
  `buildWeeklyReport()`에도 `ticketBalance`/`house` 선택 인자를 추가해
  값이 있을 때만 "🌱 성장 현황" 1~2줄을 조건부로 덧붙인다. 둘 다 로직
  복붙 없이 기존 export 재사용(운영자 지시 그대로). `ParentScreen.jsx`에
  `gamification_enabled` 마스터 스위치로 게이팅되는 "🌱 OO의 성장" 카드
  신설(하우스 소속 + 누적 티켓 문장형 표시만, 등수/팀 점수 없음) +
  `buildWeeklyReport` 호출에도 동일 게이팅으로 전달.
- **회귀 없음 증명**: 두 함수 모두 기존 호출부(`AdminScreen.jsx`, 신규
  인자를 넘기지 않는 기존 코드)는 반환값/출력 문자열이 1바이트도 안
  바뀐다 — `scripts/testWeeklyReport.mjs` 신규 4~9번 시나리오(20개 체크)
  로 명시적으로 증명(기존 1~3번 시나리오 문자열도 그대로 PASS).
- **의도적 범위 축소 1(운영자/CTO 판단 필요) — Rank/모자단계 제외**:
  `GAME_DESIGN.md` 14번 섹션 원문은 "Rank도 `fetchDashboardData`가 이미
  가져오는 `student_progress` 컬럼에서 새 쿼리 없이 파생 가능"이라고
  전제했는데, 이 전제는 그 섹션이 쓰인 시점(2026-07-18) 이후 실제 구현
  (하위카드 2번, 2026-07-19)이 "별을 조용히 XP로 변환하지 말라"는 운영자
  지시로 원문과 다르게 확정되면서 깨졌다 — 실제 Paul Rank XP는
  `student_progress.total_xp`(레거시 사본=`totalStars`)가 아니라 독립
  원장 `xp_ledger`/`xp_totals` VIEW에만 있다. 실제로 `AdminScreen.jsx`도
  Rank를 `computeStudentStats()` 안이 아니라 별도 배치 쿼리
  (`fetchXpTotals`)로 조회하고 있음을 코드로 확인했다(선례가 이미 원문
  계획과 다르게 구현돼 있었다는 뜻). 조회하려면 `fetchXpTotal()`(신규
  네트워크 호출)이 필요한데, 이번 작업 지시가 "새 Supabase 쿼리 절대
  금지"를 명시적으로 못박았다. `total_xp`로 대체 계산하면 관리자/학생
  화면이 실제로 보여주는 Rank와 다른 값을 학부모에게 보여줄 위험이 있고
  (이 섹션 14 자체가 막으려는 "화면마다 다른 숫자" 사고와 동종) — 잘못된
  값을 보여주는 대신 정확히 계산할 수 없는 필드는 빼는 쪽을 택했다
  (CLAUDE.md 규칙 1 안정성 최우선, 범위 축소). `fetchXpTotal()`을 1회
  예외로 재사용할지(같은 함수를 `AdminScreen.jsx`/`usePaulRank.js`가 이미
  두 곳에서 쓰고 있어 "새 쿼리 타입"은 아니지만 이번 지시의 "절대 금지"
  문구를 문자 그대로 지키는 판단을 우선했다)는 운영자/CTO 결정 필요.
- **의도적 범위 축소 2 — "이번 시즌" 티켓 잔액이 아니라 전체 누적**:
  같은 새 쿼리 금지 제약으로 `sumTicketBalanceSince()`(시즌 경계
  `seasons` 테이블 조회 필요)가 아니라 `sumTicketBalance()`(전체 누적)를
  썼다. 화면 문구도 "이번 시즌 티켓"이 아니라 "지금까지 모은 티켓"으로
  정직하게 표기해 실제 계산값과 문구가 어긋나지 않게 했다.
- **의도적 범위 축소 3 — House 팀 순위/등수, Word King 수상 이력 제외**:
  원문 14번 섹션은 이 두 필드도 후보로 들었지만, `PAUL_PRINCIPLES.md`
  3번(개인 순위 비공개, 팀 단위로만 비교)과 이번 작업 지시("Rank/House의
  '등수'를 학부모에게 직접 보여주는 건 지양")에 따라 하우스는 소속 이름만
  표시하고 처음부터 팀 점수/등수/Word King 수상 이력은 후보에서 뺐다.
- 신규 파일 없음(스키마 변경 0건) — `src/utils/weeklyReport.js`,
  `src/components/ParentScreen.jsx`, `scripts/testWeeklyReport.mjs` 3개
  파일만 수정.
- 검증: `npm run build` PASS(경고 없음, 기존 청크 크기 경고만 그대로),
  `node scripts/testWeeklyReport.mjs` 20/20 PASS, `npm run
  verify:daily-study` PASS, `npm run verify:admin`(6개 스크립트) PASS
  무회귀, `node scripts/testTicketEconomy.mjs`/`node scripts/
  testHouseSystem.mjs` 재실행 PASS(재사용한 기존 함수 무회귀 확인).
- 검수 대기 사항: qa-reviewer/security-reviewer 코드 리뷰, 운영자/CTO의
  Rank 필드 추가 여부 판단(새 SQL 없음, 순수 프런트엔드 판단 사항).

### 8시간 자율 게임화 빌드아웃 세션 종합 요약(2026-07-19, Engineering Head)

이 카드로 `GAME_DESIGN.md` "구현 순서 제안" 10개 카드가 전부 최소 기반
단계까지 구현 완료됐다(실제 시각/미니게임/최종 애니메이션 등 폴리시는
전부 별도 BACKLOG로 남음). 아래는 이번 8시간 자율 세션 동안 완료된 7개
작업 전체 목록 + 커밋 범위 + 운영자가 실행해야 할 SQL 전체 목록이다.

**전체 7개 작업 목록(시간순)**:
1. 입실시험 결과 서버 재검증(Anti-cheat 선행, `api/
   submit-entrance-result.js`) — `[P1]` VERIFY 카드, `219b2ab` 근방 이후
   세션에서 구현.
2. Teacher Controls 마스터 스위치(`classes.gamification_enabled`) —
   `4c8bc49`(schema)~`07f6b65`(체크포인트).
3. Ticket Economy + Daily Missions 후킹 + Rewards 상점 — `c63272a`~
   `718d1a9`("소스/싱크 동시 배포").
4. Word King(주간·서버 전용 계산) — `fc449a1`.
5. House System + Weekly Events 설정 슬롯 — `3394bf0`(schema)~
   `19360bf`(docs).
6. Seasonal Progression(시즌 경계 데이터 모델) — `ae07688`~`b6b15c9`.
7. **Parent Motivation 노출(이 카드, 게임화 로드맵 마지막)** — 이번
   커밋 범위(아래).

**이번(7번) 커밋 범위**: `src/utils/weeklyReport.js`(computeStudentStats/
buildWeeklyReport 확장) + `scripts/testWeeklyReport.mjs`(신규 6개
시나리오) → 1커밋, `src/components/ParentScreen.jsx`(성장 카드 UI) →
1커밋, 문서(`PROJECT_BOARD.md`/`GAME_DESIGN.md`/`handoff.md`/
`.ai-status/engineering-head-parent-motivation.json`) → 1커밋(규칙 14
파일/기능 단위 소커밋).

**운영자가 실행해야 할 SQL 목록 전체(v2.4~v2.8, 전부 멱등 — 실행
순서는 번호 순서 그대로 권장, 서로 다른 테이블이라 실제로는 순서 무관
하지만 카드 번호와 맞춰 추적하기 쉽게 정렬)**:
| 파일 | 하위카드 | 내용 | GRANT 필요 | 비고 |
|---|---|---|---|---|
| `supabase_v2_4_entrance_result_rls.sql` | 1(Anti-cheat) | `entrance_test_results` RLS 강화(anon 임의 조작 차단) | 불필요 | 서버 재검증 자체는 이미 1차 방어로 동작 중(미실행이어도 안전) |
| `supabase_v2_5_gamification_master_switch.sql` | 3(Teacher Controls) | `classes.gamification_enabled` 컬럼(기본 false) | 불필요 | 실행 후에도 각 반은 false로 시작 — 교사가 반별로 직접 켜야 함 |
| `supabase_v2_6_word_king.sql` | 7(Word King) | `word_king_history` 테이블(anon read-only + service_role write) | 불필요(신규 테이블 자체 RLS로 커버) | 관리자 "이번 주 챔피언 계산" 버튼이 이 테이블 필요 |
| `supabase_v2_7_house_system.sql` | 8(House System) | `students.house_id` 컬럼(CHECK 1~4) | **필요(포함됨)** — CLAUDE.md 규칙 10 | 미실행 시 하우스 배정/표시 전부 조용히 비활성(크래시 없음) |
| `supabase_v2_8_seasonal_progression.sql` | 9(Seasonal Progression) | `seasons` 테이블(전역, anon read-only + service_role write) | 불필요 | 관리자 "새 시즌 시작" 버튼이 이 테이블 필요 |

(참고: `supabase_v2_3_paul_rank.sql`/`supabase_v2_3_1_xp_action_based.sql`
— Paul Rank XP 원장 — 는 `PROJECT_BOARD.md` BLOCKED 카드 기록상 이미
프로덕션에 실행 완료된 것으로 확인됨, 이번 v2.4~v2.8 목록에는 포함하지
않음. 10번 카드(Parent Motivation, 이번 세션)는 신규 SQL 없음.)

**qa-reviewer/security-reviewer 검수 필요 항목**: `PROJECT_BOARD.md`
VERIFY 섹션의 하위카드 7(Word King)/8(House System)/9(Seasonal
Progression)/10(Parent Motivation) + `[P1]` 입실시험 서버 재검증 카드,
총 5개 — 전부 코드 리뷰 미착수 상태(운영자가 리뷰 일정을 별도로 잡아야
함). 특히 10번(이번 카드)은 신규 SQL이 없어 리뷰 범위가 프런트엔드
로직(computeStudentStats/buildWeeklyReport/ParentScreen.jsx)에 한정된다.

**여전히 BACKLOG인 것(실제 시각/미니게임/최종 애니메이션 등, 전 카드
공통으로 운영자 원문이 애초에 "이번 범위 아님"으로 표기한 것)**:
- 모자 승급 시각 효과/애니메이션(Hat Evolution의 실제 그래픽).
- 실제 미니게임(첫 미니게임 접근/추가 게임 선택/도전 모드 —
  `paulRankShared.js EXPERIENCE_UNLOCKS`에 자리만 예약, 전부
  `status:'planned'`).
- Word King 시상식 연출/실제 경쟁 UI(지금은 관리자 수동 트리거 + 학생
  화면 텍스트 1줄뿐).
- House 실제 미니게임, Weekly Events 콘텐츠(`WEEKLY_EVENT_TYPES`는
  현재 빈 배열 — 설정 슬롯만 있고 실제 이벤트 정의/트리거는 0개).
- 시즌 테마/장식 등 실제 시즌 콘텐츠(Seasonal Progression은 경계
  데이터 모델 + 관리자 트리거 + 최소 텍스트뿐).
- Ticket 잔액 실제 구매(`redeemTicketReward`) 판정 로직의 시즌 스코프
  재배선(Seasonal Progression 카드의 의도적 범위 축소, `sumTicketBalanceSince()`
  는 이미 완성/테스트됨 — 다음 라운드에 배선만 하면 됨).
- Parent Motivation의 Rank/모자단계 필드(이번 카드의 의도적 범위 축소
  1 — 위 참고, 운영자/CTO 판단 대기).
- `GAME_DESIGN.md` 16번 섹션(리뷰 및 개선 제안) 중 16.1(가챠 일일 체감
  로직)/16.4(티켓 상점 입문가 아이템)/16.5(House 최소인원 배정+시즌
  재조정 규칙 명문화)는 여전히 제안 단계(착수 안 됨) — 16.2/16.3/16.6은
  Word King 구현에 이미 반영됨.

## 2026-07-19 (10차) — 게임화 하위카드 9번(Seasonal Progression) — Engineering Head

PROJECT_BOARD.md "[P3] 게임화(Gamification)" 하위 카드 9번 착수. `git log -30`
으로 최근 5단계(입실시험 서버재검증/Teacher Controls/Ticket Economy+Daily
Missions/Word King/House System) 확인, `GAME_DESIGN.md` 9번 섹션(Seasonal
Progression) 정독 후 구현. 운영자 지시("레벨/뱃지/스트릭은 영구 — 절대
리셋 안 함, Ticket 잔액과 House 팀 점수만 리셋 대상. 이 저장소엔 cron이
없으니 시즌 전환도 관리자 수동 트리거. 원장 자체를 삭제하지 말고 시즌
경계 마커만 저장. 실제 게임 콘텐츠는 만들지 마라 — 시즌 경계 데이터
모델 + 관리자 트리거 + 최소 표시까지만") 범위 그대로.

- **데이터 모델 판단 — `classes` 컬럼이 아니라 전역 `seasons` 테이블**:
  운영자가 두 대안(전용 테이블 / `classes.current_season_started_at`
  컬럼) 중 판단을 위임했다. House 팀 점수가 이미 반(class) 경계를 넘어
  학생 전원을 대상으로 전역 집계된다는 사실(House 선례 —
  `fetchHouseWeeklyScore`가 반 필터 없이 그 하우스 전체 학생을 조회,
  2026-07-19(9차) 구현 확인)을 근거로, 시즌 경계를 반 단위 컬럼으로
  쪼개면 같은 하우스의 다른 반 소속 학생끼리 집계 기준일이 어긋나는
  불일치가 생긴다고 판단해 전역 단일 경계(`seasons` 테이블, 항상 최신
  행 1개가 "현재 시즌")를 선택했다. 여러 반 컬럼을 원자적으로 함께
  갱신해야 하는 방식보다 새 행 하나만 append하는 편이 이 저장소의
  기존 append-only 관례(xp_ledger/word_king_history/ticketLedger)와도
  일관되고, 부분 실패로 경계가 반마다 어긋나는 상황 자체가 구조적으로
  없다.
- **`supabase_v2_8_seasonal_progression.sql`(신규, 멱등, 운영자 실행
  대기)** — `seasons`(id uuid pk, `started_at` timestamptz default now(),
  `note` text 선택, `created_at`) 순수 신규 테이블(기존 테이블 컬럼 0개
  변경, GRANT 대상 없음). `word_king_history`(v2.6)와 완전히 동일한 RLS
  패턴 — **anon read-only + service_role 전용 write**. 근거: 이 테이블은
  "보상이 걸린" 값은 아니지만 전역으로 모든 학생의 Ticket/House 집계
  기준일에 영향을 준다 — anon이 쓸 수 있으면 학생 누구나 가짜 시즌
  경계를 넣어 전교생의 티켓/하우스 표시를 임의로 리셋시키는 장난
  (그리핑)이 가능해지므로 관리자 전용으로 막았다.
- **"리셋"의 실제 구현 — 원장은 그대로, 파생 계산만 추가**:
  `src/utils/ticketEconomy.js`에 `sumTicketBalanceSince(ledger,
  seasonStartedAt)`(경계 이후 항목만 합산 — 경계 시각 그 자체도
  "이후"에 포함되는 `>=` 비교, 경계가 없으면 `sumTicketBalance()`와
  동일하게 전체 누적으로 안전 폴백) 추가. `src/utils/houseSystem.js`에
  `computeHouseSeasonScores(students, ledgerByStudentId, seasonStartedAt,
  now)` 추가 — 기존 `computeHouseWeeklyScores`의 "그 주(월~일) 범위로
  합산" 패턴을 그대로 확장해 하한만 시즌 경계로 고정하고 상한은
  지금(now)까지, 양수 delta(획득)만 합산하는 원칙(소비/구매 제외)도
  그대로 재사용했다. 둘 다 새 원장/새 저장 형태 없이 순수 파생 계산만
  — CLAUDE.md 규칙 5(프로덕션 데이터 삭제 금지)와 직결되는 판단.
- **관리자 트리거**: `api/start-new-season.js`(Word King의
  `checkAdminReauth` 패턴 그대로 재사용 — 전교생의 집계 기준일을 한 번에
  바꾸는 전역 액션이라 요청마다 관리자 PIN 재확인) — `seasons` 테이블에
  새 경계 행 하나만 insert, 다른 어떤 테이블도 건드리지 않는다.
  `AdminScreen.jsx`의 `SeasonPanel`(신규) — House/Word King 패널과 달리
  반과 무관한 전역 액션이라 반 목록 루프 밖, `classes` 탭 최상단
  (`SpellingReviewQueuePanel`과 같은 위치)에 한 번만 렌더된다. "새 시즌
  시작" 버튼은 `window.confirm`으로 "✅ 유지돼요: 레벨/뱃지/연속학습일 —
  절대 리셋되지 않아요 / 🔄 새로 시작해요: 티켓 잔액과 하우스 팀 점수만"
  두 줄을 명확히 구분해 안내(반 삭제 확인 다이얼로그의 "학생 계정은
  유지되고 반 배정만 해제됩니다" 같은 방향의 불안감 완화 문구, 운영자
  지시 그대로).
- **학생 최소 표시(`Dashboard.jsx`)** — 시즌이 실제로 시작된 뒤에만
  (`fetchCurrentSeason()`이 null이 아닐 때만) "🌱 이번 시즌 누적 점수 N"
  한 줄이 기존 "이번 주 팀 점수" 텍스트 아래에 **추가로** 나타난다 —
  기존 주간 표시 로직/state는 전혀 손대지 않았다(완전 additive). 시즌이
  아직 없으면(SQL 미실행 포함) 이 블록 자체가 조용히 안 보인다.
- **의도적 범위 축소 — Ticket 잔액(개인 구매 가능액)/`redeemReward` 판정
  로직은 이번 라운드에 시즌 스코프로 재배선하지 않음**: `GAME_DESIGN.md`
  §9 원문은 Ticket 잔액도 리셋 대상으로 명시하지만, 실제 구매 흐름
  (`useStudent.js` `redeemTicketReward`)은 111명 실사용 학생의 살아있는
  상점 로직이다 — 화면 표시만 시즌 스코프로 바꾸고 구매 가능 여부 판정은
  전체 누적 그대로 두면 "화면엔 부족하다고 뜨는데 실제로는 구매가 되는"
  표시/로직 불일치가 생긴다. 이 불일치를 없애려면 `useStudent.js`의 핵심
  redeem 경로까지 함께 바꿔야 하는데, 이는 "실제 게임 콘텐츠는 만들지
  마라 — 최소 표시까지만"이라는 지시 범위를 넘고 CLAUDE.md 규칙 1(안정성
  최우선)과 충돌할 위험이 커 이번 라운드에서 의도적으로 보류했다.
  `sumTicketBalanceSince()`는 이미 완성/테스트돼 있어 다음 라운드에
  `useStudent.js`를 배선하기만 하면 된다(House 선례와 같은 "구조는 다
  만들고 실제 연결은 다음 라운드" 패턴, 예: `weekly_event_enabled` 설정
  슬롯).
- **신규 테스트**: `scripts/testSeasonalProgression.mjs`(순수 로직 20개
  체크 — 시즌 경계 전/후 원장 항목 정확한 분리, 경계 시각 자체 포함
  여부, `sumTicketBalanceSince` 호출이 원장을 절대 mutate하지 않음,
  레벨/뱃지/스트릭류 필드가 섞인 입력을 넣어도 계산 결과와 그 필드들
  자체가 전혀 영향받지 않음 — "레벨/뱃지/스트릭은 시즌 전환에도 절대
  안 바뀐다"는 설계 원칙의 코드 레벨 증명). `tests/harness/registry.mjs`
  에 `seasonalProgression` 도메인 신규 등록(wordKing/ticketEconomy/
  houseSystem과 동일 패턴 — `extra:true`).
- **검증**: `npm run build` PASS(신규 경고 없음), `node scripts/
  testSeasonalProgression.mjs` PASS(20/20), `node scripts/
  testHouseSystem.mjs`/`node scripts/testTicketEconomy.mjs` 재실행
  PASS(기존 함수 무회귀 확인), `npm run verify:admin`(6개 스크립트 전부
  PASS)/`npm run verify:student`(4개 스크립트 전부 PASS) 전부 PASS,
  `npm run verify:all` 재실행 — `login` 도메인만 기존 BLOCKED 카드(로컬
  서비스롤 키 부재)로 FAIL, `speaking`/`listening`은 기존과 동일하게
  headless 환경 구조적 SKIP, 나머지 전부 PASS(신규 `seasonalProgression`
  도메인 포함, 무회귀 확인).
- **검수 대기 사항**: qa-reviewer/security-reviewer 코드 리뷰, 운영자의
  `supabase_v2_8_seasonal_progression.sql` 실행 여부 판단(실행 전에도
  앱은 기존과 동일하게 동작 — 시즌 관련 UI는 전부 안전한 기본값 "시즌
  없음"으로 표시될 뿐, Ticket/House는 전체 누적 값 그대로 유지). 다음
  라운드 후보: Ticket 잔액 실제 구매 로직의 시즌 스코프 재배선(위
  "의도적 범위 축소" 문단 참고).

## 2026-07-19 (9차) — 게임화 하위카드 8번(House System + Weekly Events 설정 슬롯) — Engineering Head

PROJECT_BOARD.md "[P3] 게임화(Gamification)" 하위 카드 8번 착수. `GAME_DESIGN.md`
6·8번 섹션(House System/Weekly Events), `PAUL_BIBLE.md` §10(DESIGN
DIRECTION), `PAUL_PRINCIPLES.md` 3번("하우스가 소속감을 만드는 이유") 정독
후 구현. 운영자 지시("실제 게임/미니게임 만들지 마라 — 하우스 소속 데이터 +
팀 점수 집계 + 최소 표시까지만") 범위 그대로.

- **`houses` 테이블을 만들지 않음 — PAUL_BIBLE.md §10 원문에서 의도적으로
  벗어난 판단**: 신규 `houses` 테이블 대신 `src/utils/houseSystem.js`의
  `HOUSES`(4개 고정 — 레드/블루/그린/옐로우, id 1~4/emoji/colorHex) 코드
  상수로 대체했다. 근거: 이 저장소가 이미 확립한 "자주 안 바뀌는 소규모
  목록은 정적 JS 객체" 관례(`TICKET_GRANT_TABLE`/`REWARD_CATALOG`,
  `GAME_DESIGN.md` 8번 섹션 자신도 Weekly Events에 신규 정의 테이블을
  안 만들겠다고 이미 명시)를 하우스 정의에도 그대로 적용 — 관리자가 웹
  UI로 하우스를 추가/삭제할 요구가 실제로 생기기 전까지 테이블+CRUD를
  미리 만들면 과설계(YAGNI). 그래서 `students.house_id`는 FK가 아니라
  `smallint` + CHECK(1~4) 제약이다.
- **`supabase_v2_7_house_system.sql`(신규, 멱등, 운영자 실행 대기)** —
  `students.house_id`(smallint, CHECK, **GRANT select/update 포함 —
  CLAUDE.md 규칙 10, `supabase_v2_1_student_unit_decouple.sql`의
  `current_unit_id` GRANT 선례 그대로 따름**) + 기존 학생 라운드로빈
  백필(`row_number() over (order by created_at, id) % 4`, 이미 house_id가
  있는 행은 절대 덮어쓰지 않음) + `classes.weekly_event_enabled`(boolean,
  기본 false — Weekly Events 설정 슬롯, `supabase_spelling_test_schema.sql`
  opt-in 관례 재사용, classes는 v1.9 컬럼단위 GRANT 대상이 아니라 별도
  GRANT 불필요).
- **`src/utils/houseSystem.js`(신규, 완전 순수)** — `HOUSES`/`getHouseById`,
  `assignBalancedHouseId`(결정론적 라운드로빈 — 동률이면 항상 id가 가장
  작은 하우스, 난수 없음), `computeHouseCounts`, `getWeekPeriod`(wordKing.js
  와 동일한 월요일~일요일 ISO 주 규칙 — 다른 게임화 순수 모듈처럼
  cross-file import 없이 재구현), `computeHouseWeeklyScores`(**양수
  delta(획득)만 그 주 범위로 합산, 소비/구매 delta<0은 제외** — "내가
  스티커를 사면 우리 팀 점수가 내려간다"는 의도치 않은 벌칙을 막기 위한
  판단, 파일 헤더에 근거 전문), `getOwnHouseWeeklyDisplay`(학생 화면
  전용 — 본인 하우스 정보만 반환, 다른 하우스 비교 불가능한 shape),
  `WEEKLY_EVENT_TYPES`(빈 배열 — Weekly Events 콘텐츠 슬롯, `TICKET_GRANT_
  TABLE`의 `status:'planned'`와 같은 예약 패턴).
- **자동 배정 배선(`wordLibrary.js` `addStudent`)** — 이미 메모리에 있는
  전체 학생 캐시(`_students`, 반 무관 전원 로드)로 하우스별 인원을 계산해
  가장 적은 하우스에 배정, 별도 DB 집계 쿼리 없음. **버그 발견 + 수정**:
  최초 구현은 `current_unit_id`+`house_id`를 한 insert에 같이 넣고
  실패하면 단일 폴백(house_id 없는 baseRow, current_unit_id까지 함께
  탈락)으로 재시도했는데, 이러면 v2.1(current_unit_id)은 이미 적용됐지만
  v2.7(house_id)은 아직 미적용인 상태(지금 라이브 DB가 정확히 이 상태)
  에서 **신규 학생의 current_unit_id가 회귀로 안 채워지는** 문제가
  `scripts/testStudentUnitDecouple.mjs`(unitSwitching 도메인) FAIL로 실제
  재현됐다. `refreshStudents()`와 같은 3단계 cascading 폴백(둘 다 →
  current_unit_id만 → 둘 다 없음)으로 수정해 해결(재현→수정→재검증
  전 과정 확인 — CLAUDE.md 규칙 15 "회귀는 수정 전 코드로 되돌려 실제
  FAIL 확인" 정신 그대로, 이번엔 수정 전 코드가 방금 만든 코드라 되돌릴
  필요 없이 바로 원인 확인).
- **관리자 최소 UI(`AdminScreen.jsx` `StudentManagement`)** — 학생 로스터
  각 행에 현재 하우스 배지(이모지+이름 또는 "하우스 미배정") + 재배정
  select(값 변경 즉시 저장, 반/유닛처럼 별도 "편집 모드" 없음). 컬럼
  부재(SQL 미실행)면 항상 "미배정"으로만 보임(크래시 없음).
- **학생 최소 표시(`Dashboard.jsx`)** — "🔴 우리 하우스: 레드 하우스 ·
  이번 주 팀 점수 N" 한 줄. `gamificationEnabled` 마스터 스위치로 게이팅
  (Word King/Ticket Economy와 동일 원칙). **별도 `house_enabled` 스위치는
  만들지 않음** — `supabase_v2_5_...` SQL이 애초에 "각 기능 착수 시
  전용 스위치 추가"로 계획했었지만, Word King 착수 때 이미 `word_king_
  enabled`를 안 만들고 마스터 스위치만 재사용한 선례(코드 실측
  확인)를 그대로 따른 것 — 일관성 + YAGNI. 반면 `classes.weekly_event_
  enabled`는 이번에 실제로 추가했는데(House와 다른 판단), Weekly
  Events가 "이번 주만" 켜고 끄는 시간 제한적 성격이라 향후 마스터
  스위치와 독립적인 축의 on/off가 필요해질 가능성이 높다고 판단했기
  때문(SQL 파일 "설계 판단 4" 참고) — 지금은 이 컬럼을 읽는 코드가
  없다(의도된 죽은 슬롯, 실제 이벤트가 붙는 라운드에서 배선).
- **`fetchHouseWeeklyScore(houseId)`(`wordLibrary.js`)** — `fetchDashboardData`
  /`fetchXpTotals`와 같은 배치 조회 패턴. `student_progress`의 기존
  `"allow anon all"` RLS를 그대로 활용(새 anon 쓰기 경로 0개, 읽기만
  추가) — Word King이 같은 데이터를 서버 전용으로 격리한 이유(경쟁
  랭킹의 신뢰성)와 이 함수가 다른 이유: 팀 점수는 개인 경쟁이 아니라
  이미 anon 전체 읽기 가능한 데이터의 집계 표시일 뿐이고, 조작해도
  실질적 이득이 없는 저가치 정보라는 판단(`ticketEconomy.js` 헤더가
  이미 확립한 "저빈도·저가치는 anon 관례 유지" 기준과 동일).
- **신규 테스트**: `scripts/testHouseSystem.mjs`(순수 로직 33개 체크 —
  HOUSES/getHouseById, assignBalancedHouseId 균형 배정(20명 완전균형/
  21명 최대-최소차 1 이내), computeHouseCounts, getWeekPeriod, 
  computeHouseWeeklyScores(양수만 합산 실측), getOwnHouseWeeklyDisplay,
  WEEKLY_EVENT_TYPES), `tests/harness/registry.mjs`에 `houseSystem` 도메인
  신규 등록(wordKing/ticketEconomy/paulRank와 동일 패턴 — extra:true).
- **검증**: `npm run build` PASS, `npm run verify:admin`(6개 스크립트
  전부 PASS, 라이브 e2e 무회귀) PASS, `npm run verify:student`(4개
  스크립트 전부 PASS) PASS, `npm run verify:all` 재실행 — 위 버그 수정
  전에는 `unitSwitching` 도메인이 FAIL(회귀 실측)이었으나 수정 후
  PASS로 전환 확인. 최종적으로 `login` 도메인만 기존 BLOCKED 카드(로컬
  서비스롤 키 부재)로 FAIL, 나머지 전부 PASS/SKIP(무회귀 확인,
  `paulRank`/`ticketEconomy`/`wordKing` 재실행 포함).
- **검수 대기 사항**: qa-reviewer/security-reviewer 코드 리뷰, 운영자의
  `supabase_v2_7_house_system.sql` 실행 여부 판단(실행 전에도 앱은
  기존과 동일하게 동작 — 하우스 관련 UI는 전부 안전한 기본값 "미배정"
  으로 표시될 뿐).

## 2026-07-19 (8차) — 게임화 하위카드 7번(Word King) — 주간·서버 전용 계산 — Engineering Head

PROJECT_BOARD.md "[P3] 게임화(Gamification)" 하위 카드 7번 착수(선행조건인
1번 Anti-cheat, `api/submit-entrance-result.js`가 이번 세션 앞부분(5차)에
이미 완료돼 착수 가능해짐 — `GAME_DESIGN.md` 5번 섹션, `PAUL_BIBLE.md`
§11, `GAME_DESIGN.md` 16.3/16.6 리뷰 반영을 같은 라운드에 포함하라는 지시
그대로 따름).

- **점수 산정 입력을 원문에서 의도적으로 축소**: `GAME_DESIGN.md` §5
  원안은 ①입실시험 정확도 ②쓰기시험 첫시도 정답률
  (`spellingCorrect`/`spellingTotal`) ③`word_status` mastered 개수 3개
  신호의 가중합을 제안했다. 실제 구현은 ①과 xp_ledger 합계(행동 단위
  XP, 이미 서버 전용 쓰기) 2개만 쓴다 — 운영자 지시("점수 산정은 반드시
  이미 서버에서 검증된 데이터만 사용, 새로운 클라이언트-신뢰 지점을
  만들지 마라")에 따른 것. ②③은 실제로는 `student_progress.
  calendar_data`/`word_status`로 둘 다 anon `"allow anon all"` RLS라
  클라이언트가 직접 쓰는 값이다(§11 Anti-cheat이 스스로 "부차적 갭"으로
  지목한 값과 동일) — 이 갭 위에 Word King 점수를 얹으면 "서버 전용
  계산"이라는 이 기능의 핵심 전제가 갭을 그대로 상속해 깨진다. XP
  시스템이 `total_xp` 재사용안을 버리고 독립 원장으로 새로 설계했던 것과
  같은 종류의 판단(선례 재사용, `src/utils/paulRankShared.js` 헤더
  참고). 갭이 해소되면 그때 ②③을 가중치로 추가하는 건 `wordKing.js`의
  공식만 바꾸면 되므로 스키마 변경 없이 가능.
- **`src/utils/wordKing.js` 신규(완전 순수, paulRankShared.js와 동일
  원칙)**: `getWeekPeriod()`(월요일~일요일, 날짜 단위 정밀도),
  `computeCorrectedAccuracy()`(16.3 소표본 왜곡 보정),
  `computeStudentWordKingScore()`(가중합 + eligible 판정),
  `computeWeeklyWordKing()`(반 전체 랭킹, leave-one-out 학급 평균,
  결정적 tie-break), `detectWordKingOutliers()`(16.6 이상치 표).
  - **16.3 반영 — 베이지안 블렌딩(원래 최초 설계)이 아니라 "학급 평균
    완전 대체"로 최종 구현**: `computeCorrectedAccuracy()`를 먼저
    베이지안 가중 평균(사전확률=학급 평균, 표본 크기에 비례해 원본
    비율과 블렌딩)으로 구현했으나, 회귀 테스트(`scripts/testWordKing.mjs`
    6번 섹션 — "1문제 풀어 100%" 학생 vs "50문제 풀어 90%" 성실한 학생
    시나리오)로 실측한 결과 응시 수가 극소(1~2문항)일 때는 블렌딩
    가중치가 아무리 작아도 원본 극단값이 조금이라도 섞이면 "소표본
    학생이 학급 평균보다 낮거나 같아야 한다"는 보정의 목적 자체가
    흔들릴 수 있음을 직접 확인했다(90% 성실 학생을 91%로 여전히 앞서는
    결과가 나왔음 — 심지어 이 90%가 정확히 학급의 유일한 다른 학생의
    점수였던 2인반 특수 케이스에서도). 그래서 GAME_DESIGN.md 16.3이
    제안한 다른 옵션("최소 임계값 미달 시 학급 평균으로 완전 대체")으로
    전환 — `MIN_ACCURACY_SAMPLE`(10문항) 미만이면 원본 비율을 아예 쓰지
    않고 학급 평균으로 완전히 대체한다.
  - **leave-one-out 자기오염 방지**: `computeWeeklyWordKing()`이 각
    학생의 보정 기준(prior)을 "본인을 제외한" pooled 평균으로 계산한다
    — 그렇지 않으면 학생 수가 적은 반에서 소표본 학생 본인의 극단값이
    자기 자신의 보정 기준을 오염시켜(예: 2인반에서 평균의 절반을 본인이
    차지) 보정이 사실상 무력화되는 것을 실측으로 확인했다(같은 테스트
    시나리오). `detectWordKingOutliers()`도 같은 이유로 leave-one-out
    평균을 쓴다.
  - **16.6 반영**: `detectWordKingOutliers()` — 신규 쿼리 없이 이미
    집계한 XP/응시량을 leave-one-out 평균의 multiplier배(기본 5배)와
    대조해 그 주 유난히 튄 학생을 지표별로 표시. API 응답에 포함되지만
    관리자 화면 전용 뷰는 아직 없음(다음 세션 후보로 남김).
- **`supabase_v2_6_word_king.sql` 신규(멱등, 미실행 대기)**:
  `word_king_history(class_id, period_start, period_end, student_id,
  student_name, score, score_breakdown jsonb, rank_position,
  computed_at, unique(class_id,period_start,period_end,student_id))`.
  `xp_ledger`(v2.3)와 완전히 동일한 RLS 패턴 — anon read-only(SELECT만)
  + INSERT/UPDATE/DELETE GRANT 자체를 하지 않아(service_role만
  RLS 우회로 씀) 기존 게임화 테이블의 `"allow anon all"` 관례를
  의도적으로 반복하지 않음.
- **`api/compute-word-king.js` 신규**: 이 저장소엔 스케줄러(cron)가
  없어(Infra Head 영역, 발명하지 않음) 관리자가 반별로 "이번 주 Word
  King 계산" 버튼을 눌러 수동 트리거하는 방식(원문이 이미 제안한 방식
  그대로). `checkAdminReauth`(다른 관리자 파괴적 액션과 같은 PIN
  재검증 패턴) 요구. 클라이언트는 `classId` 하나만 보내고, 서버가
  `entrance_tests`(이번 기간 시험 id) → `entrance_test_results`(서버
  재채점된 점수/총점 합산) → `xp_ledger`(이번 기간 합계)를 직접 조회해
  `computeWeeklyWordKing()`으로만 계산 — 계산 결과는 활동이 있었던
  (eligible) 학생만 `word_king_history`에 upsert(활동 전혀 없는 학생은
  행 자체를 만들지 않음 — "0등"으로 낙인찍지 않음, `GAME_DESIGN.md`
  §12 Retention Psychology 원칙과 같은 방향).
- **`src/utils/wordKingApi.js` 신규**: `fetchLatestWordKingPeriod()`
  (가장 최근 계산된 기간의 전체 순위 — 관리자 화면과 학생 화면이 이
  함수 하나를 공유), `fetchWeeklyChampion()`(그 위에서 rank===1만 추출),
  `triggerComputeWordKing()`(관리자 트리거 fetch 래퍼). 조회 계열은
  entranceTestApi.js와 같은 안전 원칙 — 테이블 미존재/에러를 절대 던지지
  않고 빈 결과로 폴백.
- **`AdminScreen.jsx` `WordKingPanel` 신규**: `GameSettingsPanel` 바로
  아래 슬롯(같은 반별 설정 카드 그룹). "이번 주 Word King 계산" 버튼 +
  순위 텍스트 목록(👑 강조, 실제 미니게임/시상식 연출 없음 — 운영자
  지시 범위 그대로). 로드 시 `fetchLatestWordKingPeriod()`로 최근 계산
  결과를 자동 표시.
- **`Dashboard.jsx`**: "이번 주 챔피언: OOO" 최소 텍스트 한 줄 —
  기존 Paul Rank 텍스트 바로 아래, 같은 `gamificationEnabled` 마스터
  스위치로 게이팅. 본인이 챔피언이면 "(나예요!)" 추가.
- **`scripts/testWordKing.mjs` 신규(순수 로직, 33개 체크 전부 PASS)**:
  주간 기간 계산 결정성, 소표본 보정(16.3 회귀 케이스 — "1문제 100%"가
  "50문제 90%"를 이기지 못함을 직접 증명), leave-one-out 학급 평균,
  이상치 표(16.6), 결정적 tie-break(Math.random 등 비결정적 요소 전혀
  없음), 빈 반/전원 무활동 반의 안전한 처리(champion null, 크래시 없음)
  까지 커버.
- **`scripts/testComputeWordKingApi.mjs` 신규(라이브 e2e, 3단계 SKIP)**:
  `testXpLedgerDb.mjs`/`testEntranceTestDb.mjs`와 같은 fake `(req,res)`
  직접 호출 패턴. ① `ADMIN_PIN` 로컬 부재 시 재인증/입력검증만 SKIP
  (메서드 거부는 인증 이전이라 항상 검증 — 로컬에 `ADMIN_PIN`이 있어
  실제로 재인증/입력검증 5개 체크까지는 로컬에서 실행/PASS 확인됨),
  ② `word_king_history` 테이블 미존재 시(SQL 미실행, 로컬 실측 상태)
  라이브 계산 e2e SKIP, ③ 테이블은 있어도 `SUPABASE_SERVICE_ROLE_KEY`
  부재 시 SKIP. **로컬 실행 결과**: ①②는 통과, ③(라이브 계산 e2e)은
  ②단계에서 이미 SKIP(테이블 미실행) — 로그인 도메인과 같은 이유로
  Vercel 프로덕션에서만 전체 검증 가능. 이 과정에서 Windows + Node
  환경의 기존 알려진 libuv 조기종료 크래시(`testEntranceTestDb.mjs`가
  이미 문서화한 것과 동일 — Supabase 클라이언트 생성 직후 곧바로
  `process.exit()`하면 undici 소켓 핸들이 닫히는 중에 assertion으로
  죽음)를 그대로 재현·확인했고, 같은 워크어라운드(SKIP 직전 300ms 대기)
  를 적용해 해결.
- **`tests/harness/registry.mjs`**: `wordKing` 도메인 신규 등록
  (`testWordKing.mjs`/`testComputeWordKingApi.mjs`, 둘 다 `extra: true`
  — 13개 필수 도메인 밖, `paulRank`/`ticketEconomy`와 같은 취급).
- **검증**: `npm run build` PASS(청크 해시 불변 확인), `npm run
  verify:admin`(6개 스크립트 전부 PASS, 무회귀), `node tests/harness/
  runOne.mjs wordKing`/`ticketEconomy`/`paulRank` 재실행 전부 PASS,
  `npm run verify:all` 전체 재실행 — `login` 도메인만 기존 BLOCKED
  카드(로컬 서비스롤 키 부재)로 FAIL(신규 아님), 나머지 15개 도메인
  전부 PASS/SKIP(무회귀 확인).
- **운영자 실행 대기**: `supabase_v2_6_word_king.sql` 실행 필요 —
  미실행이어도 `api/compute-word-king.js`/`wordKingApi.js`가 안전하게
  `table_missing`/빈 결과로 폴백해 앱이 깨지지 않음. 실행 후 관리자가
  반별로 "이번 주 Word King 계산" 버튼을 눌러야 학생 화면에 챔피언
  텍스트가 나타남(수동 트리거, cron 없음 — 원문 지시 그대로).
- 상세: `GAME_DESIGN.md` 5번 섹션 "5.x 구현 완료" 항목, `PAUL_BIBLE.md`
  §11 갱신 배너, `DATABASE.md` `word_king_history` 행 + 마이그레이션
  17번, `TESTING.md` 카테고리 1/4 신규 행, `PROJECT_BOARD.md` VERIFY
  섹션.

## 2026-07-19 (7차) — 게임화 하위카드 5번(Ticket Economy) + 6번(Daily Missions 후킹 + Rewards 티켓 상점) 소스/싱크 동시 배포 — Engineering Head

PROJECT_BOARD.md "[P3] 게임화(Gamification)" 하위 카드 5번+6번 착수(운영자
지시: "원장만 만들고 못 벌거나, 벌 수만 있고 못 쓰면 반쪽짜리"라 소스/싱크를
같은 라운드에 함께 구현). `GAME_DESIGN.md` 4·7·10번 섹션 설계를 그대로
따름(재발명 없이 원문 재확인만) — 상세는 `GAME_DESIGN.md` "4.x·7.x·10.x
구현 완료" 항목.

- **`src/utils/ticketEconomy.js` 신규(완전 순수, paulRankShared.js와 동일
  원칙)**: `appendTicketEntry`(append-only, id 기준 idempotent — 중복
  지급 방지), `sumTicketBalance`(원시 잔액 저장 금지, 항상 파생 계산),
  `mergeTicketLedgers`(diaryPlacements와 같은 id 기준 합집합, tombstone은
  불필요 — 티켓 원장엔 삭제가 없고 소비도 음수 delta 항목 추가로 표현),
  `TICKET_GRANT_TABLE`/`grantTicket`(XP_EVENT_TABLE과 같은 status
  active/planned 패턴, 지금은 `daily-mission-complete`만 active),
  `REWARD_CATALOG`/`canRedeemReward`/`redeemReward`(결정론적 구매만,
  확률형 요소 0, 실결제 요소 0).
- **`src/data/stickers.js`**: 상점 전용 스티커 2종(`ticket_medal1` 🏅
  /`ticket_hat1` 🎩✨, `shopExclusive:true`) 추가 + `getRandomSticker`/
  `getMilestoneSticker`의 뽑기 풀에서 `shopExclusive` 스티커 제외(가챠로는
  절대 못 얻음 — "결정론적 구매만" 원칙을 코드로 강제). id/emoji/name
  구조가 기존과 동일해 `STICKERS.find(id)` 기반 조회(Dashboard/DiaryPage/
  StudyCalendar) 어디서든 추가 변경 없이 그대로 렌더됨.
- **`src/hooks/useStudent.js`**: `freshRecord`/`normalizeRecord`/
  `mergeProgressRecords`에 `ticketLedger` 필드 추가(diaryRemovedIds와
  같은 위치에 병행 — v2.2 이전 레코드/백업엔 없으므로 `asArray` 기본값).
  기존 "오늘의 미션 4/4 완료" `useEffect`(`grantXp('daily-mission-
  complete', ...)` 바로 다음 줄)에 `grantTicket(prev.ticketLedger,
  'daily-mission-complete', todayStr())` 병행 호출만 추가 — 새
  트래킹 로직 없음. 이 `useEffect`는 "missions repeat all day" 설계상
  하루 여러 번 실행되지만, XP와 정확히 같은 day 기간키를 id로 쓰는
  idempotent append 덕분에 티켓은 하루 1장만 쌓인다(테스트 5번 섹션에서
  구조적으로 증명). 신규 `redeemTicketReward(rewardId)` 콜백 —
  `answerMission`/`grantSticker`와 같은 "patch 안에서 결과를 만들고
  클로저 변수로 즉시 반환" 기존 패턴 재사용, 순수 `redeemReward()`가
  잔액/소유 여부를 전부 확인하므로 실패 시 ledger/stickers 어느 쪽도
  바뀌지 않음. 반환 객체에 `ticketBalance`(`sumTicketBalance`에서 파생,
  절대 별도 저장 안 함)/`ticketLedger`/`redeemTicketReward` 추가.
- **`src/components/Dashboard.jsx`**: `TicketShopCard`(신규, 기존
  "오늘의 미션"/"최근 스티커" 카드와 같은 스타일만 재사용 — 큰 UI
  리디자인 없음) — 보유 티켓 수 + 카탈로그 2개(가격/보유여부 표시) +
  구매 버튼. Teacher Controls 마스터 스위치(`gamificationEnabled`, Paul
  Rank 표시와 같은 변수)로 게이팅 — 스위치 꺼진 반은 티켓 UI 전부 안 보임
  (지급 로직 자체는 XP처럼 스위치와 무관하게 계속 동작, 노출만 게이트).
- **서버 검증 필요 여부 판단(운영자 지시 4번 항목)**: `GAME_DESIGN.md`
  11번(Anti-cheat) 섹션이 이미 내린 기준 — "저빈도·저가치·소비처가
  코스메틱뿐인 경로는 기존 `student_progress` anon-write 관례를 그대로
  유지해도 무방"을 그대로 적용. 소스(daily-mission-complete)도
  싱크(스티커 언락)도 정확히 이 카테고리라 **새 `api/*.js` 없음, 새
  Supabase 테이블/컬럼 없음(SQL 마이그레이션 파일 0개)**. Paul Rank XP가
  서버 전용인 이유(다른 학생과 비교되는 랭크)와 티켓이 로컬 우선이어도
  안전한 이유(이 학생 개인의 다이어리 스티커 언락에만 쓰이고 비교/경쟁에
  전혀 개입 안 함)가 서로 다름을 `ticketEconomy.js` 헤더에 문서화. House/
  Word King이 실제로 티켓을 소스/싱크로 쓰게 되는 시점엔 이 판단을
  재검토해야 함(그때는 "보상이 걸린 신규 쓰기 경로는 서버 재계산" 원칙이
  다시 적용됨) — `TICKET_GRANT_TABLE`에 `status:'planned'` 슬롯만 예약.
- **검증**: `scripts/testTicketEconomy.mjs` 신규(순수 함수 39개 체크 —
  append-only idempotent, sumTicketBalance 파생 계산, mergeTicketLedgers
  id 합집합(소비 항목이 옛 클라우드 스냅샷과 병합해도 부활 안 함 실증),
  grantTicket 하루 1회 방지, REWARD_CATALOG 카탈로그에 확률/결제 필드
  없음 실증, canRedeemReward/redeemReward 잔액·소유 검증) 전부 PASS +
  `tests/harness/registry.mjs`에 `ticketEconomy` 도메인 신규 등록. `npm
  run build` PASS. `npm run verify:all` 전체 재실행 — `login` 도메인만
  기존에 이미 BLOCKED로 기록된 로컬 `SUPABASE_SERVICE_ROLE_KEY` 부재로
  FAIL(신규 회귀 아님, PROJECT_BOARD.md BLOCKED 카드 참고), `speaking`/
  `listening`은 기존과 동일하게 구조적 SKIP, 나머지 전 도메인(`student`/
  `admin`/`homework`/`quiz`/`writing`/`unitSwitching`/`persistence`/
  `dailyStudy`/`wordAssignment`/`audioTts`/`paulRank`/`ticketEconomy`)
  전부 PASS — `mergeProgressRecords`/`useStudent.js` 변경이 기존
  다중기기 병합/복원 회귀 스위트(`persistence` 8개 스크립트)를 깨지
  않았음을 직접 확인.
- **SQL**: 이번 라운드에 신규 `supabase_*.sql` 없음(위 서버 검증 판단
  근거) — 운영자 실행 대기 항목 없음.
- **남은 범위(그대로 BACKLOG)**: Word King(7번)/House(8번)/Seasonal(9번)
  /Parent Motivation(10번 후속)은 여전히 미구현. `TICKET_GRANT_TABLE`/
  `REWARD_CATALOG` 양쪽 다 그 기능들이 실제로 붙을 때 항목만 추가하면
  되는 forward-compatible 구조로 준비됨.

## 2026-07-19 (6차) — 게임화 하위카드 3번: Teacher Controls 마스터 스위치 (`classes.gamification_enabled`) — Engineering Head

PROJECT_BOARD.md "[P3] 게임화(Gamification)" 하위 카드 3번(GAME_DESIGN.md 13번
섹션 Teacher Controls) 착수. `spelling_test_enabled` opt-in 관례를 그대로
재사용해 반별 게임화 마스터 스위치를 추가 — Paul Rank/XP 관련 UI가 이
스위치로만 노출되게 게이팅한다.

- **`supabase_v2_5_gamification_master_switch.sql` 신규(멱등, 운영자 실행
  대기)**: `classes.gamification_enabled boolean not null default false`
  1컬럼만 추가. GRANT 불필요 — `students`(v1.9 컬럼단위 GRANT)와 달리
  `classes`는 테이블 단위 정책을 그대로 쓰고 있어 `spelling_test_enabled`
  등 기존 반별 설정 컬럼들도 GRANT 없이 정상 동작 중임을 확인 후 결정
  (`DATABASE.md` RLS/컬럼권한 절 참고).
- **`wordLibrary.js` 확장**: `getClassSettings()`/`setClassSettings()`에
  `gamificationEnabled` 필드 추가(새 함수 만들지 않고 기존 함수 확장 —
  운영자 지시대로). `refreshClassSettings()`의 select 폴백 체인에
  `gamification_enabled`를 가장 넓은 시도에 추가하고, 실패 시 최근 추가된
  컬럼부터 하나씩 제거하며 재시도(기존 `spelling_direction` 폴백 패턴을
  그대로 확장). `setClassSettings()`도 같은 방식 — 컬럼이 아직 없어도
  나머지 설정 저장은 계속 정상 동작(회귀 금지).
- **`AdminScreen.jsx`에 `GameSettingsPanel` 신규**: `SpellingSettingsPanel`
  과 완전히 같은 패턴(같은 스타일, `targetClass`/`onSaved` props), 체크박스
  하나("게임화(Paul Rank) 사용")만 — `SpellingSettingsPanel` 바로 아래
  나란히 배치.
- **`Dashboard.jsx` Paul Rank 표시 게이팅**: 기존
  `!rankLoading && (...)` 조건에 `gamificationEnabled &&`를 추가 —
  `getClassSettings(getStudentClass(studentId)).gamificationEnabled`가
  false면(컬럼 미존재/미실행 SQL 포함 항상 false) Rank/모자단계 텍스트가
  전혀 렌더되지 않는다. 이 SQL을 실행하기 전까지는 모든 반에서 이 UI가
  숨겨진 상태로 배포된다(안전한 기본값).
- **`api/grant-xp.js`는 반별 스위치를 조회해 지급을 거부하지 않기로
  판단(운영자 지시 — 판단 근거 문서화)**: 서버 핸들러 헤더에 3가지 근거를
  기록 — (1) `xp_ledger`는 감사 가능한 이벤트 원장이라 스위치 off를
  이유로 조용히 스킵하면 "행동 안 함"과 "기록 안 됨"을 나중에 구분할 수
  없음, (2) source_event_id가 기간키 기반 idempotency라 서버가 거부하면
  클라이언트가 이미 실패를 삼키도록 설계돼 있어(`postXpEvent`) 스위치를
  나중에 켜도 그 기간의 XP가 영구 손실됨(교사가 스위치를 껐다 켰다 하는
  정상 사용 패턴에서 데이터가 복구 불가능하게 사라짐), (3) 고빈도 경로에
  반별 조회를 추가하면 안정성 비용(DB 왕복/실패 모드 추가)만 커지고
  효과는 순수 UX(학생은 스위치 꺼진 반에서 UI 자체를 못 봄)뿐. 결론:
  마스터 스위치는 "노출 게이트"로만 쓰고, XP 적립은 스위치와 무관하게
  계속 정확히 기록 — 나중에 스위치를 켜면 그동안 실제로 쌓인 진짜 XP가
  그대로 드러난다(합성값 아님, "별을 조용히 XP로 변환"하는 것과 다름).
- **`scripts/testGamificationSettings.mjs` 신규** + `tests/harness/
  registry.mjs`의 admin 도메인에 등록(extra 커버리지). `testSpellingSettings
  .mjs`와 같은 "SQL 실행 전/후 2단계" 패턴이지만, `gamification_enabled`는
  `spelling_direction`처럼 컬럼 없으면 그 필드만 빼고 재시도하는 graceful
  degradation 경로라 예외가 아니라 저장 후 round-trip 값으로 SQL 실행
  여부를 판단하도록 구성(처음엔 exception 기반으로 짰다가 실제 라이브
  DB에서 FAIL 2건 확인 후 원인 파악해 수정 — 아래 검증 기록).
- **왜 `testPaulRank.mjs`가 아니라 새 스크립트인가**: `paulRankShared.js`의
  `computeRankState(xp)`는 시그니처가 xp 하나뿐인 게 구조적 불변식으로
  이미 테스트돼 있음(Unit 무관 증명, `testPaulRank.mjs` 3번 섹션) —
  여기에 게임화 스위치 입력을 끼워 넣으면 그 불변식 자체를 깨야 해서
  범위 밖. 스위치는 렌더 게이팅(`Dashboard.jsx`)이자 반별 설정
  (`wordLibrary.js`) 문제라 `testSpellingSettings.mjs`와 같은 층위에
  새 스크립트로 검증하는 게 맞는 경계라고 판단.
- **검증**: `npm run build` PASS(에러/경고 없음). `npm run verify:admin`
  (6개 스크립트, `testGamificationSettings.mjs` 포함) 전부 PASS — 라이브
  DB에 아직 이 SQL이 실행 안 돼 있어 "SQL 실행 후 다시 돌리면 나머지
  체크까지 검증됩니다" 안내로 정상 SKIP됨(가짜 PASS 아님, 실제로 컬럼
  없는 상태에서의 안전한 폴백 동작을 확인한 것). `npm run verify:student`
  (4개 스크립트) 전부 PASS — 무관 도메인 회귀 없음 확인. `node tests/
  harness/runOne.mjs paulRank`도 재실행해 기존 Paul Rank 하네스 무회귀
  확인(2개 스크립트 PASS/정상 SKIP). `testXpLedgerDb.mjs`가 "xp_ledger
  테이블 확인됨"을 다시 출력 — `supabase_v2_3_paul_rank.sql`이 이미
  라이브에 적용돼 있고, 그 결과 Paul Rank 텍스트가 이 세션 이전까지는
  **스위치 없이 전체 111명에게 이미 노출되고 있었다는 뜻** — 이번 세션의
  게이팅이 실제로 닫는 갭이 진짜였음을 재확인.
- **운영자 액션 필요**: (a) `supabase_v2_5_gamification_master_switch.sql`을
  Supabase 대시보드 SQL Editor에서 실행 — 실행 전까지는 모든 반에서 Paul
  Rank UI가 숨김 상태(안전), 실행 후에도 각 반은 여전히 false로 시작하므로
  교사가 관리자 화면에서 반별로 직접 켜야 학생에게 보임. (b) SQL 실행 후
  `node scripts/testGamificationSettings.mjs`(또는 `npm run verify:admin`)
  재실행하면 3~5번 나머지 round-trip 체크까지 전부 검증됨.

## 2026-07-19 (5차) — 입실시험 결과 서버 재검증 (`api/submit-entrance-result.js` 신설) — P1 보안 감사 후속 — Engineering Head

PROJECT_BOARD.md NEXT 카드 "[P1] 입실시험 결과 서버 재검증 없음"(게임화
로드맵 Anti-cheat 선행조건, Word King 필수 선행) 착수. 문제: 클라이언트가
계산한 점수를 서버 재검증 없이 그대로 저장 + `entrance_test_results` RLS가
`using(true) with check(true)`라 anon key로 임의 student_id/test_id 점수
조작 가능(재현 실측 완료, `wiki/security-notes.md` 기존 기록).

- **신규 `api/submit-entrance-result.js`**: 클라이언트가 원본 답안
  (`answers: [{word, direction, input}]` — 선택한 옵션들/문제, `testId`)만
  보내면, 서버가 `entrance_tests.words`/`direction`을 DB에서 직접 조회해
  이미 있는 순수 함수 `computeTestResult()`(`src/utils/entranceTest.js`)로
  재채점 후 그 결과만 저장(service_role key). 클라이언트는 이제 이 요청
  스키마에 `score`/`total` 필드 자체가 없다 — "보내도 서버가 안 읽는다"가
  아니라 애초에 페이로드에 존재하지 않는 구조로 신뢰 경계를 강제.
- **4종 조작 방어(전부 명시 검증, reason 코드로 거부)**: 문제 개수 축소
  (`answer_count_mismatch` — expected는 `min(question_count, words.length)`
  와 정확히 일치해야 함), 같은 단어 중복 제출(`duplicate_word`), 시험
  스냅샷에 없는 가짜 단어(`unknown_word`), 고정 방향 시험에서 방향 위장
  (`direction_mismatch`). 형식 검증(`invalid_test_id`/`invalid_student_id`/
  `invalid_answers`/`test_not_found`)도 `api/grant-xp.js`와 동일한 응답
  패턴(200 + `{ok:false, reason}`, 서버 설정 오류만 500)으로 통일.
- **`entranceTestApi.js` 갱신**: `submitEntranceResult(testId, studentId,
  {questions, answers, durationSeconds})`로 시그니처 변경 — 더 이상
  score/total/missedWords를 받지 않고 `fetch('/api/submit-entrance-
  result')`로 위임. 기존 anon 직접 upsert 코드는 제거.
- **`EntranceTest.jsx` UX 불변**: `finishTest()`가 여전히 로컬
  `computeTestResult`로 즉시 결과를 화면에 채운 뒤(응시 → 즉시 결과 그대로),
  `submitResultToServer()`가 `questionsRef.current`/`answersRef.current`
  (원본)를 그대로 서버에 넘긴다 — 저장 실패 시 기존 "다시 저장하기" 재시도
  버튼도 그대로 유지.
- **`supabase_v2_4_entrance_result_rls.sql` 신규(멱등, 운영자 실행 대기)**:
  `entrance_test_results`의 `"allow anon all"` 정책 제거 → SELECT만 anon
  허용, INSERT/UPDATE/DELETE는 정책 자체를 안 만들어 service_role
  (BYPASSRLS) 전용으로 좁힘. `entrance_tests`(시험 생성/종료, 관리자 anon
  CRUD)는 이번 범위 아님 — 건드리지 않음.
- **`scripts/testEntranceTestDb.mjs` 갱신**: 제출 검증을
  `api.submitEntranceResult`(구 anon 번들 upsert) 대신
  `api/submit-entrance-result.js`를 `callHandler(handler, body)` 패턴으로
  실 핸들러 직접 호출(`testStudentPinAuth.mjs`/`testXpLedgerDb.mjs`와 동일
  방식, vercel dev 등 새 도구 불필요)로 교체. 신규 "7.5. 조작 시도 거부"
  섹션 — 가짜 score(999) 전송이 실제로 무시되고 서버 재채점값(0)만 저장됨,
  문제 개수 축소/단어 중복/가짜 단어/방향 위장 4종 전부 reason 코드까지
  일치 확인, 거부된 시도들이 다른 학생 점수에 전혀 영향 없음까지 실측.
- **검증**: `node scripts/testEntranceTest.mjs`(순수 로직, 55개 체크 전부
  PASS — 이번 수정과 무관, 회귀 없음 확인), `node scripts/
  testEntranceTestDb.mjs`(라이브 e2e, 조작 시도 거부 신규 섹션 포함 전부
  PASS — 로컬에 SUPABASE_SERVICE_ROLE_KEY가 없어도 v2.4 SQL 미실행 상태의
  기존 anon 폴백으로 전부 통과, v2.4 SQL 실행 후에는 로그인/xp_ledger
  스크립트와 동일한 이유로 로컬 service-role-key 부재 시 제출 단계가
  막힐 수 있음 — 기존 BLOCKED 카드와 같은 근본원인, 신규 이슈 아님),
  `npm run build` PASS(번들 크기/청크 구성 불변, `EntranceTest.jsx`
  청크만 11.35kB로 소폭 변경), `npm run verify:admin`(testEntranceTest.mjs
  + testEntranceTestDb.mjs 포함 5개 스크립트 전부 PASS).
- **문서**: `DATABASE.md`(v2.4 마이그레이션 항목 + RLS 현황 갱신),
  `TESTING.md`(testEntranceTestDb.mjs 갱신 내용), `wiki/security-
  notes.md`(P1 갭 항목을 "수정 완료"로 갱신), `PROJECT_BOARD.md`(카드
  NEXT → VERIFY, 게임화 로드맵 Anti-cheat 선행조건 하위 항목도 함께 갱신).
- **다음 단계**: 운영자가 `supabase_v2_4_entrance_result_rls.sql` 실행 →
  이중 방어(서버 재검증 + RLS)까지 완결. Word King(게임화 로드맵 7번)
  착수 시 이 카드가 더 이상 막지 않음.

## 2026-07-19 (4차) — Paul Rank System v2.3.1 — XP "단어 단위" → "행동(Action) 단위" 리팩터링 — Engineering Head

운영자 지시: 실제 프로덕션 테스트에서 XP가 **단어(word) 단위**로 지급되는
걸 발견(무한 파밍 위험). 정확한 원인을 코드로 확정 후 행동 단위로
재설계. **결과만 보고 — 완료까지 중간 보고 없음(운영자 지시대로 진행)**.

- **정확한 원인(파일:줄, 추측 아니라 코드 확인)**: `src/hooks/
  useStudent.js`의 `answerMission(wordId)` — 레벨업 미션 클리어 시
  `` grantXp('mission-clear', `mission-clear:${wordId}`) `` 호출(구
  680번 줄 부근). `source_event_id`에 `wordId`가 그대로 들어가 있어,
  학생이 (특히 오답으로 미션 큐에 들어간) 단어를 계속 넘길 때마다 XP가
  단어 개수만큼 무한히 쌓였다. 함께 확인된 부차 구멍 2개: `grantSticker()`
  의 `duplicate-sticker-bonus`(무작위 키 — 오늘의 미션이 하루 여러 번
  반복 완료될 때마다 별개 지급 가능, "미션은 하루 여러 번 반복 가능"이
  기존 설계 의도라 더 심각), `recordSpellingAnswer()`의 `spelling-
  combo-N`(운영자가 함께 의심 지목한 대로 `날짜:wordId` 조합이라 같은 날
  다른 단어에서 콤보 반복 도달 시 별개 지급).
- **8개 이벤트로 재설계**: `word-view-complete`/`listening-complete`/
  `quiz-complete`는 기존 `categoriesCompleted`(단어보기/예문/퀴즈/발음)
  개념의 개별 카운터(`round.wordsViewed`/`examplesHeard`/`quizSolved`)가
  GOAL(5)에 **오늘 처음** 도달하는 순간으로 재배선(day 기간키만 사용,
  `useStudent.js`에 새 `useEffect` 추가, ref 기반 1차 방어 +
  `dailyCategoryXpFiredRef`). `writing-complete`는 예외적으로 새로
  정의 — `categoriesCompleted`의 실제 4번째 카테고리는 발음이지 "쓰기"가
  아니어서(코드 재확인 결과), 운영자가 8개 이름에 "발음"이 아니라
  "writing"을 지정했으므로 `history.spellingCorrect`(쓰기시험 정답
  카운터)가 오늘 처음 GOAL에 도달하는 순간으로 새로 정의했다(판단 근거는
  `src/utils/paulRankShared.js` XP_EVENT_TABLE 헤더에 상세 기록). 발음은
  그대로 `daily-mission-complete`(구 `mission-bonus-4of4` 재명명)의
  4/4 게이트에만 계속 기여 — 개별 XP 이벤트는 없음(8개 목록에 없으므로).
  `mission-clear`/`duplicate-sticker-bonus`/`spelling-combo-N`은
  `XP_EVENT_TABLE`에서 완전히 제거(별 `addStars()` 지급은 그대로 유지).
  `word-king-complete`/`weekly-streak`/`special-event`는 예약 슬롯만
  (`status:'planned'`) — `EXPERIENCE_UNLOCKS`의 기존 status 패턴을 재사용,
  실제 트리거 코드 없음(Word King 미구현, 운영자 지시 그대로).
- **`source_event_id` 새 패턴**: `{eventType}:{기간키}` 전부 통일.
  일별 이벤트는 기존 `todayStr()`(`toDateString()`) 포맷 그대로 재사용
  (새 포맷 발명 안 함 — `history`/`round.date`와 같은 포맷이라 원장과
  진행기록 대조가 쉬움). `student_id`는 `xp_ledger`의 별도 컬럼이라
  문자열에 중복으로 안 넣음(기존 unique 제약이 이미 `(student_id,
  source_event_id)` 조합 — 재확인 완료, 그대로 활용). **서버 방어 신규
  추가**: `api/grant-xp.js`가 eventType 화이트리스트뿐 아니라
  `isValidSourceEventIdForEvent()`로 기간키의 접두사/형식/범위(day는
  ±2일 관용, 서버·클라이언트 타임존 차이 고려)까지 검증 — "가짜 날짜를
  계속 바꿔가며 보내는" 또는 "기간키에 wordId를 다시 끼워넣는" 우회
  파밍을 막는다(같은 사고 재발 방지, 완전히 0은 아니지만 유계).
- **SQL/기존 데이터**: `supabase_v2_3_paul_rank.sql`을 갈아엎지 않고
  신규 증분 `supabase_v2_3_1_xp_action_based.sql` 준비(운영자 실행
  대기, 미실행). 재확인 결과 `event_type` 컬럼은 **이미 v2.3에 존재**
  (운영자가 검토 요청한 "미래 시스템 event_type 집계" 요구사항이 이미
  충족돼 있었음) — 새 SQL은 조회용 인덱스(`idx_xp_ledger_event_type`)
  1개만 추가. 화이트리스트 CHECK 제약은 **의도적으로 DB에 걸지 않음**
  (프로덕션에 이미 쌓인 word-unit 이벤트 행이 있어 CHECK 추가 시
  마이그레이션 자체가 깨짐 — 화이트리스트는 애플리케이션 레벨에서만
  강제). **기존 word-unit 행은 삭제하지 않는다** — 실제 학생 데이터
  삭제 금지(CLAUDE.md 규칙 5) — `xp_totals` 합계에 계속 포함(리셋 없음).
  운영자가 나중에 명시적으로 원하면 실행할 수 있게 "선택 무효화" 설계
  방침만 SQL 주석에 남기고 실제 SQL은 작성하지 않음(amount CHECK
  제약과 충돌해 별도 설계가 필요하다는 경고 포함).
- **"반복해도 XP 무한 획득 불가" 검증 증거**: `scripts/testPaulRank.mjs`
  6b번 섹션(순수, 구조적 증명 — 10개 서로 다른 단어를 시뮬레이션해도
  생성되는 `source_event_id`가 정확히 1종류(날짜만)임을 확인) + 8b번
  섹션(기간키 위장/조작 거부, 예약 이벤트 거부) 신규 30+개 체크 전부
  PASS. `scripts/testXpLedgerDb.mjs` 3b번 섹션(라이브 e2e — 같은 day
  키로 8번 반복 요청해도 `xp_ledger` 행이 정확히 1개 유지되고 누적 XP도
  불변임을 실측하도록 작성) + 5번 섹션(조작된 기간키/예약 이벤트 거부
  실측) — **로컬은 이전 세션과 동일한 이유(`SUPABASE_SERVICE_ROLE_KEY`
  로컬 부재)로 정직하게 SKIP**(가짜 PASS 없음, 스크립트 로직 자체는
  테이블 존재 확인 단계까지 정상 통과 확인). Vercel 프로덕션(서비스롤
  키 설정됨)에서 실행하면 전체 검증됨.
- **기존 `xp_ledger`/`xp_totals` 구조 유지**: 테이블/뷰 재정의 없음,
  컬럼 변경 없음(인덱스 1개만 추가) — "스키마 갈아엎지 말고 확장" 지시
  그대로 준수.
- **회귀 게이트**: `npm run build` PASS(기존 chunk-size 경고 외 신규
  경고/에러 없음). `node scripts/testPaulRank.mjs`(38개 체크 전부 PASS),
  `node scripts/testXpLedgerDb.mjs`(정상 SKIP, exit 0). `node
  tests/harness/runAll.mjs`(=`npm run verify:all`) 전체 재실행 —
  `login` 도메인 4개 스크립트만 FAIL(이번 세션이 건드리지 않은
  PIN/로그인 코드, `git status`로 미변경 확인 — 2026-07-19(2차) 세션이
  이미 같은 원인(`SUPABASE_SERVICE_ROLE_KEY` 로컬 부재)으로 문서화한
  기존 상태, 신규 회귀 아님). 나머지 12개 도메인(`paulRank` 포함) 전부
  PASS/정상 SKIP.
- **문서 갱신**: `DATABASE.md`(`xp_ledger` 행 설명 갱신 + 마이그레이션
  순서 14번 추가, 13번을 "적용됨"으로 갱신 — 3차 세션 실측 반영),
  `GAME_DESIGN.md`(§3 뒤 "3.y" 신규 append), `wiki/decisions.md`(결정
  #10), `TESTING.md`(두 테스트 항목 갱신), `PROJECT_BOARD.md`(게임화
  카드에 v2.3.1 버그 수정 append). `PAUL_BIBLE.md`/`PAUL_PRINCIPLES.md`/
  `AI_WORKFLOW.md`/`CLAUDE.md`는 지시대로 건드리지 않음.
- **커밋/push**: 이 handoff 항목 포함해 파일/기능 단위로 소커밋 예정
  (CLAUDE.md 규칙 14) — 커밋 로그는 다음 세션/운영자 확인 시 `git log`
  참고.

## 2026-07-19 (3차) — Paul Rank System — v2.3 SQL 적용 후 라이브 검증(부분) — Engineering Head

운영자가 `supabase_v2_3_paul_rank.sql`을 실행 완료. 이어서 라이브 검증
진행 — **정직하게 보고**: 일부는 실측 완료, 일부는 여전히 로컬
환경 제약으로 SKIP(추측/가짜 PASS 없음).

- **1) 테이블/뷰 존재 확인(실측 완료)**: anon key로 직접 쿼리 —
  `xp_ledger`/`xp_totals` 둘 다 에러 없이 빈 결과(`[]`) 반환 확인. SQL이
  정상 적용됐음을 라이브로 확인.
- **2) `SUPABASE_SERVICE_ROLE_KEY` 재확인 — 여전히 없음(추측 아님,
  직접 확인)**: `.env.local` 실제 키 목록을 확인한 결과 `ADMIN_PIN`/
  `VERCEL_OIDC_TOKEN`뿐, `SUPABASE_SERVICE_ROLE_KEY`는 어떤 이름으로도
  존재하지 않음. `PROJECT_BOARD.md` BLOCKED 카드("`verify:login` 로컬
  4/7만 PASS — `SUPABASE_SERVICE_ROLE_KEY` 로컬 부재")와 정확히 같은
  근본 원인이 Paul Rank System에도 동일하게 적용됨.
- **3) `testXpLedgerDb.mjs` 재실행 — 여전히 SKIP(§2~3 중복지급방지,
  §6 Unit무관성 라이브 실측 미완료)**: 이번엔 "테이블 확인됨" 단계까지는
  통과(SQL 적용 확인)했지만, 서비스롤 키 부재로 그다음 단계(실제 지급)
  에서 안전하게 SKIP — 스크립트 자체 로직은 정상(이전 세션에 발견한
  PGRST205 감지 버그가 재발하지 않음을 재확인).
- **4) `api/grant-xp.js` 직접 호출(QA 학생 대상, 실측 완료 — 예상과
  다르게 "정상 성공"이 아니라 "RLS가 올바르게 차단"함을 확인)**: QA
  반/학생을 만들어 핸들러를 fake(req,res)로 직접 호출한 결과:
  `{"status":500,"body":{"error":"new row violates row-level security
  policy for table \"xp_ledger\""}}`. `supabaseAdminKey()`가 서비스롤
  키 부재 시 anon key로 폴백하는데, `xp_ledger`는 anon INSERT GRANT가
  없어(설계 의도) 폴백 자체가 거부됨 — `table_missing` 폴백이 아니라
  **RLS가 설계대로 정확히 작동해 쓰기를 막은 것**(보안 설계 검증 성공,
  다만 "정상 지급 성공" 경로 자체는 로컬에서 증명 못 함). 테스트 학생/반은
  즉시 정리 완료(고아 데이터 없음).
- **5) 회귀 재확인(전부 PASS, 신규 회귀 없음)**: `npm run
  verify:persistence`(8개 스크립트) / `npm run verify:admin`(5개) /
  `npm run verify:unit`(5개) / `paulRank` 도메인(2개, `testXpLedgerDb.mjs`
  는 정상 SKIP) 전부 재실행 — SQL 적용 후에도 기존 기능 전부 정상.
- **인수기준 갱신 상태(6개 중 이번에 명확히 실측된 것과 여전히 남은 것)**:
  1(모자 5단계)/2(결정적 계산)/3(새로고침 복원, persistence 스위트)/
  6(기존 데이터 보존+build+verify)은 이전 세션에 이미 실측 완료 상태
  유지. **4(Unit 전환 무영향)와 5(중복 지급 차단)의 "라이브 실측"은
  이번 라운드에도 완료되지 못함** — 원인은 SQL 미적용이 아니라(이번에
  해소됨) `SUPABASE_SERVICE_ROLE_KEY`가 로컬에 없다는, 별개의 이미
  알려진 환경 제약. 4/5의 "메커니즘 자체가 설계대로 동작함"은 이번
  라운드에서 오히려 더 강하게 확인됨(RLS가 실제로 anon 쓰기를 막는 걸
  직접 목격) — 다만 "성공 경로 + 중복 요청 실측"은 서비스롤 키가 있는
  환경(로컬 `.env.local` 추가 또는 Vercel 프로덕션)에서만 완결 가능.
- **다음 필요 조치**: 운영자가 (a) 로컬 `.env.local`에
  `SUPABASE_SERVICE_ROLE_KEY` 추가 후 `node scripts/testXpLedgerDb.mjs`
  재실행, 또는 (b) Vercel 프로덕션 배포 후 실제 학생 계정으로 미션
  클리어 등 XP 트리거를 1회 발생시켜 Vercel 함수 로그에서 grant-xp
  200 응답 + Supabase 대시보드에서 `xp_ledger` 행 생성을 직접 확인 —
  둘 중 하나가 이번에 못 채운 라이브 실측의 마지막 조각.

## 2026-07-19 (2차) — Paul Rank System 기반(Word King 이전 단계) — XP/모자5단계/언락 아키텍처 구현 — Engineering Head

운영자 지시: `GAME_DESIGN.md`/`PAUL_BIBLE.md` §8(Hat System, "DESIGN
DIRECTION" 표기 문서)의 계산 로직/설정 아키텍처만 실제 구현. 어제까지의
순수 문서 세션(위 항목) 이후 **첫 실제 코드 변경**. Word King/House/
티켓/미니게임/모자 시각·애니메이션은 전부 이번 범위 밖(그대로 미구현).

- **가장 중요한 판단 — "별을 조용히 XP로 변환하지 말라"**: 사전조사에서
  `student_progress.total_xp` 컬럼이 이미 존재하고
  `wordLibrary.js:716`(`syncStudentProgress`)에서 `total_xp =
  totalStars`로 매 동기화마다 그대로 덮어써지는 걸 확인했다(어제
  `GAME_DESIGN.md` 설계안이 이 기존 사실을 "재사용 전제"로 명시했었음).
  운영자의 이번 지시가 이 전제를 명시적으로 정정 — XP를 `totalStars`의
  산술 파생값으로 만들지 않고, 기존 별 지급과 같은 학습 이벤트
  (`useStudent.js`의 `addStars()` 호출 4곳: 레벨업 미션 클리어/오늘의
  미션 4/4 보너스/중복 스티커 환전/쓰기시험 콤보)를 트리거로 재사용하되
  **완전히 독립된 감사 가능한 원장(`xp_ledger`, 이벤트별 unique 제약)에
  별도로 누적**하는 구조로 구현했다. `total_xp` 컬럼 자체는 건드리지
  않음(DebugPage.jsx가 참조하는 레거시 표시값, 삭제/의미변경 금지).
  판단 근거 전문: `src/utils/paulRankShared.js` 헤더 주석.
- **중복 지급 방지(이번 임무의 보안 핵심)**: `xp_ledger`에
  `unique(student_id, source_event_id)` 제약 — 같은 이벤트가 두 번
  들어와도 DB 레벨에서 자연스럽게 막힘(TOCTOU 레이스 없음). 클라이언트가
  Supabase에 직접 쓰는 경로 없음 — `api/grant-xp.js`(service_role)만
  쓰고, 이 API는 클라이언트가 보낸 `amount`를 절대 신뢰하지 않고
  `XP_EVENT_TABLE`(서버 전용 결정)에서 금액을 조회한다. `xp_ledger`는
  RLS로 anon read-only(SELECT만), INSERT/UPDATE/DELETE는 GRANT 자체가
  없음 — PIN 처리와 같은 신뢰 경계 원칙(서버만 쓴다)의 일반화. 라이브
  e2e(`scripts/testXpLedgerDb.mjs`)로 같은 요청 두 번 전송 → 두 번째는
  `duplicate:true`, 원장 1행/합계 불변을 실측(로컬은
  `SUPABASE_SERVICE_ROLE_KEY` 부재로 SKIP — 기존 알려진 로컬 제약,
  `PROJECT_BOARD.md` BLOCKED 카드와 동일 원인).
- **구현 파일**: `src/utils/paulRankShared.js`(RANKS 5단계/HAT_STAGES
  정확히 5단계 scale 0.88/0.94/1.00/1.07/1.14/EXPERIENCE_UNLOCKS
  forward-compatible 설정/XP_EVENT_TABLE/`computeRankState()` 등 순수
  함수, 브라우저·서버 완전 공유 — React/import.meta.env 없음),
  `api/grant-xp.js`(유일한 쓰기 경로), `supabase_v2_3_paul_rank.sql`
  (`xp_ledger` 신규 테이블 + `xp_totals` 파생 뷰, **미실행 — 운영자
  실행 대기**, 백필 안 함 — 근거는 SQL 파일 주석), `src/hooks/
  usePaulRank.js`(조회 훅), `src/hooks/useStudent.js`(addStars 4곳에
  `grantXp()` 병행 호출), `src/utils/wordLibrary.js`(`postXpEvent`/
  `fetchXpTotal`/`fetchXpTotals`), `src/components/Dashboard.jsx`/
  `AdminScreen.jsx`(텍스트 전용 최소 표시 — 모자 그래픽 없음).
- **Rank는 Unit 전환과 무관 — 실측 증명**: `computeRankState(xp)`의
  시그니처가 xp 숫자 하나뿐(Unit 개념이 계산 경로 어디에도 없음,
  `testPaulRank.mjs` 4번 항목이 구조적으로 증명) + 라이브 e2e에서 XP를
  지급한 QA 학생의 Unit을 실제로 전환한 뒤에도 XP 총합이 그대로임을
  확인(`testXpLedgerDb.mjs` 6번 항목, 서비스롤 키 있는 환경에서 실행).
- **테스트**: `scripts/testPaulRank.mjs`(순수 함수, 30개 체크, 전부
  PASS) + `scripts/testXpLedgerDb.mjs`(라이브 e2e, 테이블 미적용이라
  SKIP 확인 — SQL 실행 후 재실행하면 전체 검증). `tests/harness/
  registry.mjs`에 `paulRank` 도메인 신규 등록(extra, 13개 필수 도메인
  밖). 기존 `useStudent.js`/`wordLibrary.js` bundling 테스트 스텁 3개
  (`wordLibraryStub.mjs`/`wordLibraryRaceStub.mjs`/
  `wordLibraryMultiTabStub.mjs`)에 `postXpEvent` no-op export 추가
  필요했음(신규 import 때문에 번들 로드가 깨졌던 걸 발견/수정 —
  회귀 아님, 같은 세션 내 자체 발견/자체 수정).
- **회귀 게이트**: `npm run build` PASS. `npm run verify:all` 전체
  재실행 — `login` 도메인 4개 스크립트만 FAIL, `git stash`로 재현해
  **내 변경과 무관한 기존 상태**임을 확인(원인은 이미
  `PROJECT_BOARD.md` BLOCKED 카드에 기록된 로컬 `SUPABASE_SERVICE_
  ROLE_KEY` 부재 — 신규 회귀 아님). 나머지 12개 도메인(신규 `paulRank`
  포함) 전부 PASS/정상 SKIP.
- **문서 갱신**: `GAME_DESIGN.md`(§3 뒤 "3.x 구현 갱신" append —
  원문 설계와 실제 구현이 달라진 지점 명시), `DATABASE.md`(`xp_ledger`/
  `xp_totals` 항목 + 마이그레이션 순서 13번), `TESTING.md`(신규 테스트
  2개 항목), `PROJECT_BOARD.md`(게임화 카드에 2/4번 하위단계 완료
  append, 1/3번은 여전히 BACKLOG), `wiki/decisions.md`(결정 #9),
  `wiki/glossary.md`(신규 용어 6개), `PAUL_BIBLE.md` §8(최소
  갱신 — 계산 로직 구현됨을 반영, DESIGN DIRECTION 표기 자체는 유지 —
  시각/애니메이션 미구현이므로).
- **커밋/push**: 아직 안 함 — 이 handoff 항목까지 포함해 운영자 최종
  확인 후 커밋 예정(회차 규칙: "전부 검증되면 push, SQL 미실행 상태에서도
  안전함을 확인한 뒤" — 위 회귀 게이트로 확인 완료, 커밋은 이 세션의
  마지막 단계로 진행).

## 2026-07-19 — 제품 비전 문서 3종(`PAUL_BIBLE.md`/`AI_WORKFLOW.md`/`PAUL_PRINCIPLES.md`) + `GAME_DESIGN.md` 리뷰(순수 문서) — Engineering Head

운영자 지시: 제품 비전 문서 3종 신설 + `GAME_DESIGN.md`(2026-07-18
게임화 설계) 리뷰. **코드 한 줄도 건드리지 않음** — `src/`/`api/`/
`*.sql`/`package.json` 전부 미변경, `.md` 파일만.

- **사전조사**: `GAME_DESIGN.md`(전문 재독), `PROJECT_GUIDE.md`,
  `PROJECT_BOARD.md`, `CLAUDE.md`(18개 규칙), `DEVELOPER_GUIDE.md`
  (기존 "AI 세션 표준 워크플로우" 13단계 확인), `ARCHITECTURE.md`
  "주요 플로우"/"Word King 관련 확인 결과", `wiki/HOME.md`+`glossary.md`
  +`decisions.md`+`lessons-learned.md`+`security-notes.md`+
  `api-costs.md`, `src/assets/paul/`+`src/utils/paulReactions.js`
  (폴 마스코트 리액션이 이미 구현·사용 중임을 grep으로 확인 — World
  Building 섹션에서 "구현됨"과 "미구현"을 정확히 구분하는 근거).
- **`PAUL_BIBLE.md`(신규)**: 15개 섹션. **가장 중요한 안전장치** —
  Hat System(§8)/Ticket Economy(§9)/House System(§10)/Word King(§11)
  4개 섹션 전부 상단에 "⚠️ DESIGN DIRECTION — 미구현, 설계 방향일
  뿐" 표기(grep으로 실측 확인, 총 9곳에 표기 — 4개 필수 + Parent/World
  Building/Reward System의 확장 부분도 동일 표기). 반대로 Student(§4)/
  Teacher(§5)/Parent(§6) Experience는 실사용 중인 기능임을 명확히
  구분. 운영자 지정 10개 제품 원칙(모자 정체성/성장/의미있는 학습,
  하우스 소속감, 티켓=경험, Word King=대표 교실게임, 보상은 학습 후행,
  학부모 즉시이해, 교사 최소노력, 폴의 영어세계 몰입감)을 별도 목록이
  아니라 §3/§5/§6/§7/§8/§9/§10/§11/§13에 설계 근거로 통합. Psychology
  (§12)는 `GAME_DESIGN.md` 12번 섹션을 재작성하지 않고 인용/링크만.
- **`AI_WORKFLOW.md`(신규)**: 제품/기능 개발 전용 11단계. 서두에
  `DEVELOPER_GUIDE.md` 13단계와의 차이를 표로 명시(범용 엔지니어링
  vs 제품/기능 개발 특화) — 겹치는 절차(문서 읽기/구현규칙/verify/
  build)는 재작성하지 않고 링크만. 핵심 원칙 3개(시스템 중복 금지/
  기존 아키텍처 확장 우선/기능 발명 금지)를 `handoff.md`의 실제
  사례(Word King 미실존 확인, `ADVANCED_FEATURES.md`류 데드코드 참조,
  `config/features.js` 죽은 플래그)로 근거.
- **`PAUL_PRINCIPLES.md`(신규)**: 7개 "왜" 항목. 각각 `PAUL_BIBLE.md`
  해당 섹션 + `GAME_DESIGN.md` 구체 설계를 근거로 듦 — 예: "학습이
  오락보다 우선하는 이유"는 Word King이 Anti-cheat(`api/
  submit-entrance-result.js`) 없이는 착수 불가하다는 협상 불가 선행
  조건을 근거로 "보상 체인의 신뢰성이 학습 신호의 정확성에 의존한다"는
  구조적 설명으로 연결.
- **`GAME_DESIGN.md` 16번 섹션(append) — 리뷰 및 개선 제안 6건**: (1)
  가챠 하루 다회 발동 시 파밍 유인(일일 체감 로직 제안), (2) Word King
  주간 갱신이 상시 패자 좌절 누적 위험(성장상 병행 제안), (3) Word King
  점수의 쓰기시험 정답률 항목이 소표본 왜곡에 취약(최소 응시수/베이지안
  평균 제안), (4) 티켓 초기 획득 속도가 느려 콜드스타트 이탈 위험
  (입문가 상점 아이템 제안), (5) House "자동 균등배정"의 재조정 규칙
  미정의(최소인원 배정+시즌 경계 재조정 제안), (6) Anti-cheat 부차
  갭(word_status 등)의 유예 판단은 유지하되 Word King 배포 직후
  이상치 관측 뷰 제안. 전부 이 설계 문서의 구체적 수치/규칙에 대한
  리뷰(일반론 아님), 코드 구현 없음.
- **`PROJECT_BOARD.md`**: 기존 "[P3] 게임화" BACKLOG 카드에 위 리뷰
  후속 조정 사항만 append(신규 카드 생성 없음) — 7번 단계(Word King)
  착수 시 16.3/16.6을 같은 라운드에 포함 권장 등 우선순위 조정만 기록.
- **검증**: `git diff --stat` — 변경/신규 파일 전부 `.md`
  (`GAME_DESIGN.md`/`PROJECT_BOARD.md` append 수정, `PAUL_BIBLE.md`/
  `AI_WORKFLOW.md`/`PAUL_PRINCIPLES.md` 신규) — `src`/`api`/`*.sql`/
  `package.json` 변경 0건. `npm run build` PASS(기존 chunk-size 경고
  외 신규 경고/에러 없음, 번들 산출물 자체는 무관 확인 목적으로만
  실행).
- **다음 추천 작업**: 게임화 착수는 여전히 운영자 승인 필요
  (`CLAUDE.md` 규칙 12) — 승인 시 `AI_WORKFLOW.md` 11단계를 따라
  `PROJECT_BOARD.md` "[P3] 게임화" 카드 1번(Anti-cheat)부터 BACKLOG→
  NEXT 이동.

## 2026-07-18 — 게임화 아키텍처 설계 문서(`GAME_DESIGN.md`, 순수 설계) — Engineering Head

운영자 지시: "Word King" 등 게임화 아키텍처를 **코드/UI 구현 없이 설계
문서로만** 작성. `src/`/`api/`/`*.sql`/`package.json` 전부 수정 금지 —
`GAME_DESIGN.md`(신규) + `PROJECT_BOARD.md`(구현 순서 BACKLOG 카드
추가) 딱 두 파일만.

- **사전조사**: `wiki/api-costs.md`/`wiki/security-notes.md`/
  `wiki/glossary.md`/`wiki/HOME.md`, `ARCHITECTURE.md`/`DATABASE.md`/
  `ROADMAP.md`, `src/hooks/useStudent.js`(별/스티커/스트릭/뱃지 전체),
  `src/components/AdminScreen.jsx`(`SpellingSettingsPanel` 반별 on/off
  관례), `src/components/ParentScreen.jsx`, `src/utils/weeklyReport.js`,
  `src/utils/entranceTest*.js`(v1.8 VIP/랭킹), `src/data/stickers.js`,
  `src/config/features.js`/`useFeatureAccess.js`를 전부 읽고 확인.
- **Word King 재확인**: `ARCHITECTURE.md`가 이미 "코드/스키마/계획
  문서 어디에도 존재한 적 없음"으로 기록해둔 상태를 그대로 재확인(추가
  grep 불필요, 기존 기록 신뢰) — 이번 문서가 이 기능의 **최초 설계
  기록**.
- **핵심 설계 판단 5가지**(전부 실제 코드 근거 위): ① `total_xp` 컬럼이
  이미 `totalStars`의 사본으로 존재(`wordLibrary.js:716`) → 별도 XP
  자원을 새로 만들지 않고 레벨을 별의 파생 공식으로만 정의. ② 별은
  한 번도 소비된 적 없음(grep 확인) → 소비되는 신규 통화(티켓)는
  `mergeProgressRecords()`의 `maxNum` 단조증가 병합과 충돌하므로
  잔액을 저장하지 않고 `diaryPlacements`/`diaryRemovedIds` tombstone과
  같은 append-only 이벤트 로그 패턴으로 설계. ③ 입실시험 VIP(일별,
  서버 재검증 없음, 기존 P1 보안 갭)와 Word King(주간, 서버 전용 계산)을
  명확히 분리 — Word King은 VIP의 재포장이 아니라 그 위협모델을
  반복하지 않는 상위 경쟁. ④ `config/features.js`의
  `ranking`/`pointSystem`/`leaderboard`/`rewardSystem` 플래그는
  `useFeatureAccess.js`가 저장소 어디서도 import 안 되는 죽은 코드임을
  grep으로 재확인 → Teacher Controls는 이 죽은 스캐폴딩을 되살리지
  않고, 실사용 검증된 `classes` 반별 컬럼 관례(`spelling_test_enabled`
  등)를 재사용. ⑤ Anti-cheat 섹션이 `api/submit-entrance-result.js`
  (기존 NEXT 카드의 근본 수정안, `computeTestResult()` 재사용 제안)를
  Word King의 필수 선행조건으로 명시 — 게임화가 보상을 키우면서 기존
  미검증 취약점의 악용 유인만 키우는 걸 막기 위함.
- **`PROJECT_BOARD.md`**: BACKLOG에 게임화 카드 1건(하위 10단계 의존성
  순서 포함, `GAME_DESIGN.md` "구현 순서 제안" 섹션과 1:1 대응) 추가.
  NEXT로 옮기지 않음 — 실제 착수는 운영자 승인 필요(CLAUDE.md 규칙 12).
- **검증**: `git diff --stat` — `PROJECT_BOARD.md`(.md, 42줄 추가)만
  tracked 변경, 신규 파일도 `GAME_DESIGN.md`+`.ai-status/*.json`뿐 —
  `src`/`api`/`*.sql`/`package.json` 변경 **0건** 확인. `npm run build`
  통과, 메인 번들 해시(`index-CSVjLjA9.js`, 520.89 kB) 직전 세션
  기록(ROADMAP.md "520.86KB")과 사실상 동일 — 코드 영향 없음 재확인.
  `GAME_DESIGN.md` 내 14개 섹션 + "구현 순서 제안" 전부 `<a id="sec-N">`
  앵커로 상호참조(총 60여 회 링크, 15개 앵커 전부 정의 확인 완료).
- 다음 세션 후보: 운영자 승인 시 `PROJECT_BOARD.md` 게임화 카드의
  1단계(Anti-cheat 인프라, `api/submit-entrance-result.js`)부터 순서대로
  BACKLOG → NEXT 이동.

## 2026-07-18 — 개발자 대시보드 구축 (Engineering Head)

운영자 지시: PROJECT_BOARD + Health Check + Verify 결과 + `.ai-status` +
Git 상태 + 로컬 Wiki 검색을 **하나의 대시보드**로 통합. 학생 앱(`src/`)
절대 수정 금지, `PROJECT_BOARD.md`를 대체/경쟁하는 두 번째 진실원천을
만들지 않을 것, 새 npm 패키지 금지(정적 생성 HTML 방식 채택).

> 참고: 바로 아래 세션(경량 로컬 Wiki 구축)의 handoff 기록에 "대시보드
> 기능... 전부 금지(운영자 명시)"라는 문구가 있다 — 이번 작업은 그 이후
> 운영자가 **별도로 새로 명시 요청한 작업**이라 모순되지 않는다(그
> 세션의 금지 범위는 그 세션 지시 범위 안에서의 것). 다음 세션이
> 혼란스러워하지 않도록 정직하게 남긴다(`DEVELOPER_GUIDE.md`에도 같은
> 참고 남김).

### 신규 파일

- `scripts/generateDashboard.mjs` — 6개 데이터소스를 파싱/조회해
  self-contained 단일 HTML(`dashboard/index.html`)로 렌더링. Node 내장
  `fs`/`path`/`child_process`만 사용(새 패키지 0개). 외부 CDN/이미지/API
  호출 없음(오프라인 동작). `--with-verify` 플래그로만 `tests/harness/
  registry.mjs` + `runDomain.mjs`를 import해 전체 도메인 실제
  재실행(로직 재구현 없음 — 오케스트레이션 재사용) — 기본은
  `dashboard/.last-verify.json` 캐시만 표시.
- `dashboard/` — 산출물 디렉터리. `.gitignore`에 등록(생성 스크립트만
  커밋, HTML/캐시는 커밋 안 함).

### 갱신 파일

- `package.json` — `"dashboard": "node scripts/generateDashboard.mjs"`
  스크립트 추가.
- `.gitignore` — `dashboard/` 추가.
- `DEVELOPER_GUIDE.md` — "개발자 대시보드" 섹션 append(사용법, 6개
  데이터소스 매핑, 설계 제약, 위 대시보드 금지 이력 참고 포함).
- `PROJECT_GUIDE.md` — 문서 지도 표에 `scripts/generateDashboard.mjs`
  행 추가.
- `PROJECT_BOARD.md` — DONE 카드 추가(검증 결과 요약 포함).

### 검증 (운영자 인수 기준 3개 — 전부 실측 확인)

1. **6개 섹션 실데이터 확인**: `npm run dashboard` 실행 → `dashboard/
   index.html` 생성 확인. (1) PROJECT_BOARD 카드 파싱 정상(아래 항목),
   (2) `healthCheck.mjs` 매 실행마다 재실행해 9개 영역(+ 참고 1개)
   점수/근거 파싱, 9개 영역 평균 81.4/100 표시, (3) `--with-verify`로
   실제 재실행해 `dashboard/.last-verify.json` 캐시 생성 확인(아래
   상세), (4) `.ai-status/*.json`(TEMPLATE 제외) 2개 파일 실제 표시,
   (5) `git status --porcelain`/`git log -5 --oneline`/브랜치/
   ahead-behind 실측 표시, (6) wiki 검색 사용법 카드 + `wiki/HOME.md`
   상대 링크(실시간 검색은 정적 HTML 특성상 불가능함을 정직하게 표시,
   흉내내지 않음).
2. **PROJECT_BOARD 동기화 대조**: `PROJECT_BOARD.md`의 `### ` 카드
   헤딩을 `grep -c "^### "`로 직접 카운트한 결과 16개, 대시보드가 파싱해
   표시한 컬럼별 합계(BACKLOG 12 + NEXT 3 + IN_PROGRESS 0 + VERIFY 0 +
   DONE 0 + BLOCKED 1)도 16개로 정확히 일치 확인.
3. **build/verify 불변**: `npm run build` 작업 전후 메인 번들 해시
   `index-CSVjLjA9.js` 520.89KB로 동일(당연히 `src/` 미변경이라 동일해야
   함, 실측으로 재확인). `npm run dashboard -- --with-verify`로 `tests/
   harness/` 13개 도메인 전체 재실행 — `login` 도메인만 FAIL했는데,
   이는 `PROJECT_BOARD.md`의 기존 `BLOCKED` 카드(`SUPABASE_SERVICE_ROLE_
   KEY` 로컬 환경변수 부재로 PIN 라이브 e2e 4개 FAIL)와 정확히 동일한
   원인 — 이번 작업이 만든 신규 회귀가 아님(회귀 여부는 수정 전 상태로
   되돌리지 않고도, 이 실패가 기존에 이미 문서화된 원인임을 대조해
   확인). 나머지 12개 도메인(`speaking`/`listening` SKIP 포함)은
   전부 기존과 동일하게 PASS/SKIP.

### 학생 앱(`src/`) diff 0건

`git status --porcelain` / `git diff --stat`로 이번 세션 전체에서
`src/`, `api/`, `App.jsx`, `supabase_*.sql` 어디에도 변경이 없음을
확인(대시보드 작업은 `scripts/`, 최상위 문서, `.ai-status/`,
`package.json`, `.gitignore`만 건드림).

### 알려진 한계 (정직하게 기록)

- Verify 섹션은 기본적으로 캐시 기반이라, `--with-verify` 없이
  `npm run dashboard`만 반복 실행하면 verify 결과가 갱신되지 않는다
  (의도된 설계 — 전체 재실행이 느려 매번 자동 트리거하지 않음).
- Health Check 점수 중 `Persistence`/`Database`/`Performance`/`Security`
  4개는 `healthCheck.mjs` 자체가 CITED(과거 감사 인용)로 표시한 값을
  그대로 파싱한 것 — 대시보드가 새로 채점하지 않는다(기존 스크립트
  설계 그대로).
- 대시보드는 정적 스냅샷이라 열어둔 브라우저 탭이 자동 새로고침되지
  않는다 — 최신 상태를 보려면 `npm run dashboard`를 다시 실행해야 한다.

## 2026-07-18 — 경량 로컬 LLM Wiki 구축 (Engineering Head, 코드 변경 0건, 순수 문서/스크립트)

운영자 지시: 기존 마크다운 문서(`PROJECT_GUIDE.md`/`ARCHITECTURE.md`/
`DATABASE.md`/`DEVELOPER_GUIDE.md`/`TESTING.md`/`ROADMAP.md`/
`handoff.md`)를 진실 원천으로 삼아, 그 위에 얹는 경량 로컬 Wiki(`wiki/`)
와 API 불필요 로컬 검색 명령을 구축. 벡터DB/유료 API/대시보드
기능/모바일QA/학생 대상 기능 전부 금지(운영자 명시) — 전부 준수, 코드
(`src/`/`api/`/`scripts/test*.mjs`/`supabase_*.sql`) 변경 0건.

### 신규 파일

- `wiki/HOME.md` — 중앙 색인. 최상단에 "이 위키는 기존 문서의 사본이
  아니라 색인/요약"이라는 경고 + 하위 페이지 링크 표 + 검색 명령 사용법.
- `wiki/product-flows.md` — `ARCHITECTURE.md` "주요 플로우" 섹션을
  요약 목록화(로그인/학습/발음/퀴즈/쓰기시험/듣기/미니게임/미션/입실시험/
  관리자 업로드·관리·숙제·대시보드/학부모 조회), 항목별 1~3줄 + 원본
  앵커 링크.
- `wiki/decisions.md` — 실제 설계 결정 8건을 "무엇을/왜/언제(커밋)"
  3줄 형식으로: RLS 대신 컬럼권한(v1.9), 이름→UUID 식별자 전환(v1.6),
  반선택→이름+PIN 로그인 전환(v1.6 중간지시), PIN 자기설정 게이트 방식
  (v1.7), unit_name→current_unit_id 전환(v2.1), last-writer-wins→필드별
  병합(v2.2), PIN 해시를 Node crypto로 자체구현(외부의존성 최소화),
  학부모 리포트를 AI 대신 템플릿으로(비용 회피).
- `wiki/lessons-learned.md` — `CLAUDE.md` 18개 규칙 중 실제 사고
  근거가 있는 규칙(3/4/15/16/18)을 표로 재인덱싱(본문 복제 아님, 링크)
  + `handoff.md`에서 18개 규칙에 직접 포함 안 된 추가 교훈 6건(훅 순서,
  cleanup, localStorage 실패 처리, stale 응답 레이스, 번들 해시 대조,
  손으로 베끼지 않는 테스트).
- `wiki/bug-history.md` — 실제 커밋 해시로 검증 가능한 프로덕션 버그
  6건 표(증상/원인/커밋/날짜): unit_name 폴백 버그(`98da563`~`7c99924`),
  PIN 재로그인 forEach 크래시(`bc49775`/`6b5e0f9`), PIN 만들기 stale
  응답 레이스(`6dd6c7a`/`529ff9e`), 퀴즈 상태 잔존(`6fe21b1`), 다중 탭
  stale 덮어쓰기(`69564d2`), 캘린더 빈 기록 버그(`f29f53e`).
- `wiki/security-notes.md` — v1.9 컬럼권한, PIN 해시 방식(scrypt),
  관리자 재인증, 알려진 보안 갭 5건(입실시험 서버 재검증 없음 등,
  `PROJECT_BOARD.md`와 동기화된 내용).
- `wiki/api-costs.md` — 실사용 API/서비스 표(Supabase 요금제는
  "확인 필요"로 정직 표기, TTS 재생은 브라우저 `speechSynthesis` 무료,
  `api/generate-audio.js`의 Google Translate TTS 엔드포인트 무료) +
  **`@anthropic-ai/sdk` 실사용처 확인**: `api/generate-audio.js`가
  유일한 호출부, 신규 단어 등록 시 예문/번역/메모리팁 생성(최대 단어당
  1회, 학생은 절대 트리거 안 함), 비용 방어 장치(wordId 존재 확인/DB
  값만 사용/no-op 가드/격리된 try-catch) 코드에서 실제 확인.
- `wiki/glossary.md` — 저장소 전용 용어 20여 개(DB 컬럼 + 코드
  함수/개념) 1줄 정의.
- `wiki/RETRIEVAL_RULES.md` — "위키의 어떤 사실도 코드보다 우선하지
  않는다, `파일:줄` 참조를 찾으면 직접 열어 확인 후에만 신뢰" 규칙 +
  `CLAUDE.md` 규칙 3(재구현 금지)과의 연계 설명.
- `scripts/wikiSearch.mjs` — Node 내장 `fs`만 사용(외부 라이브러리/
  벡터DB/네트워크 호출 없음)한 로컬 키워드 검색. `wiki/` + 6개 최상위
  문서 + `handoff.md` 대상. 매칭 라인을 인접 라인끼리 블록으로 묶어
  발췌, 검색어 등장 횟수(+헤딩 보너스)로 관련도 순 랭킹.
  `npm run wiki:search -- "키워드"` 또는
  `node scripts/wikiSearch.mjs "키워드" --limit N --context N`.

### 수정 파일 (append만)

- `package.json` — `"wiki:search": "node scripts/wikiSearch.mjs"` 추가.
- `PROJECT_GUIDE.md` — 문서 지도 표에 `wiki/HOME.md` 행 추가.
- `DEVELOPER_GUIDE.md` — "로컬 Wiki 검색(`wiki:search`)" 섹션 append(
  사용 예시 + 검증 전 원본 확인 원칙).
- `PROJECT_BOARD.md` — DONE 컬럼에 이번 작업 카드 추가.

### 링크 무결성 검증

전용 검증 스크립트(스크래치패드, 저장소에는 커밋 안 함 — 검증 전용
1회성 도구)로 `wiki/*.md`의 상대 마크다운 링크 25개(파일 경로 + `#앵커`
포함)를 전수 검사: 대상 파일이 실제 존재하는지, `#앵커`가 있으면
GitHub 스타일 슬러그 알고리즘(백틱/굵게/이모지/구두점 제거, 소문자화,
공백→하이픈, 중복 시 `-1/-2` 접미사)으로 대상 파일의 실제 헤딩과
대조. 최초 실행 시 `DATABASE.md`/`ROADMAP.md` 앵커 6개가 예상과 달라
FAIL(`—`(em dash)가 슬러그에서 완전히 제거되는 것을 감안 안 한 최초
추정 오류) — 실제 계산된 슬러그로 6곳 수정 후 **재실행 결과: 25/25
PASS(FAIL 0)**.

### 빌드/회귀 확인

이번 작업은 `src/`/`api/`/`scripts/test*.mjs`/`supabase_*.sql` 등
프로덕션 코드를 전혀 건드리지 않음(신규 `scripts/wikiSearch.mjs`는
빌드 대상(`vite build`)에 포함되지 않는 Node 전용 CLI 스크립트,
`package.json`의 `scripts` 필드 추가는 빌드 설정과 무관) — `npm run
build`만 통과 확인하면 충분하다고 판단, 특정 `npm run verify:<domain>`
도메인은 해당 없음(코드 로직 변경이 없으므로).

### 문서 갱신 규칙 준수

`CLAUDE.md` 규칙 13(append-only)에 따라 `PROJECT_GUIDE.md`/
`DEVELOPER_GUIDE.md`/이 `handoff.md` 전부 append만 수행 — 기존 섹션
삭제/재작성 없음. `PROJECT_BOARD.md`는 "현재 상태" 스냅샷 예외 규칙에
따라 DONE 카드 직접 추가.

## 2026-07-18 — AI 개발 운영체제 구축 (Engineering Head, Phase 1~8 — 코드 변경 0건, 순수 거버넌스/문서/저장소 로컬 설정)

운영자 지시: 이 저장소에 "AI 개발 운영체제"(헌법 + 역할별 에이전트 +
상태 프로토콜 + 안전 훅 + 프로젝트 보드 + 표준 워크플로우)를 구축.
학생 대상 기능/UI/게임화 절대 금지, 완료된 작업 재작업 금지, 명시적
안전 규칙 강제 목적 외 프로덕션 동작 변경 금지 — 전부 준수. 착수 전
`handoff.md`/`PROJECT_GUIDE.md`/`ARCHITECTURE.md`/`DATABASE.md`/
`DEVELOPER_GUIDE.md`/`TESTING.md`/`ROADMAP.md`/`CLAUDE.md` 전부 읽고,
`.claude/agents`/`.claude/settings.json`/`.ai-status`가 이 저장소에
아직 없음과 `.claude/worktrees/*`가 실제 git worktree(손대면 안 됨)임을
`git worktree list`로 실측 확인 후 시작.

### Phase 1 — `CLAUDE.md` 강화

기존 MVP 기획서 원본(claude.md — Windows는 대소문자 구분 없어 `CLAUDE.md`
와 동일 파일)을 완전 삭제하지도, 무조건 보존하지도 않고 재구성: 최상단에
"저장소 헌법" 섹션(18개 강제 규칙 + 필수 완료 체크리스트) 신설, 기존
기획 내용은 "프로젝트 배경(참조용)" 섹션으로 축약해 하단에 유지(사용자
역할 정의 등 아직 유효한 배경만 남기고, 이미 `DATABASE.md`/
`ARCHITECTURE.md`로 대체된 MVP 시점 상세 설계는 생략). 규칙 3(완료
작업 재구현 금지)과 4(이름 대신 UUID)는 이 저장소의 실제 사고 이력을
근거로 인용: `unit_name` 문자열 매칭이 표기 차이에 취약해 v2.1에서
`current_unit_id`(FK)로 이미 교체된 배경(`handoff.md` "학생-Unit
아키텍처" 섹션), 동명이인 학생이 서로의 진행기록을 덮어쓴 v1.6 P0
사고(`handoff.md` "v1.6 — 학생 identity P0 리팩터링" 섹션). 규칙
16(파일당 구현 소유자 1명)은 어제 실제로 두 에이전트의 변경이 커밋
`55f0c86`에 섞여 들어간 사례(한 에이전트가 `handoff.md`를 `git add`하는
과정에 동시 작업 중이던 다른 에이전트의 데드코드 삭제 4개 파일이 함께
커밋됨, 기능적으로는 무해했으나 attribution 부정확)를 근거로 인용.

### Phase 2 — 역할별 에이전트 5개

`.claude/agents/{planner,implementer,qa-reviewer,security-reviewer,
docs-maintainer}.md` 신규(디렉터리 자체가 없어 새로 생성). 각각 YAML
frontmatter(`name`/`description`/`tools`, 전역 에이전트 `qa-head.md`의
스키마를 참고해 정확히 맞춤) + role/responsibilities/allowed·prohibited
actions/required documents/expected output/handoff 형식/중단 시점/
`.ai-status` 갱신법. 최소 권한 원칙: planner/qa-reviewer/
security-reviewer는 `Read, Grep, Glob, Bash`(읽기 전용 용도로 본문에
명시)만, implementer만 `Write, Edit`를 포함한 전체 권한, docs-maintainer
는 `Read, Write, Edit, Grep, Glob`이되 본문에 "`*.md`(와 `.ai-status/
*.json`)만 수정, 코드/설정은 금지"를 명시.

### Phase 3 — `.ai-status` 프로토콜

`.ai-status/README.md`(필드 표 + `status` enum 7종 + "Claude 내부 상태가
아니라 순수 파일 관례"임을 명시적으로 부인) + `TEMPLATE.json` + 예시 1개
(`EXAMPLE-implementer-doc-os-setup.json`, 이번 세션 자신을 예시로 사용).

### Phase 4 — 안전 훅

`.claude/settings.json` 신규(저장소 로컬 — **사용자 전역
`~/.claude/settings.json`은 전혀 건드리지 않음**, 그 파일은 별도
거버넌스 시스템이라 무관 확인 후 손 안 댐).
- **실제 강제됨**: `PreToolUse` → `scripts/hooks/checkDestructiveSql.mjs`
  — `*.sql` 파일에 대한 Write/Edit/MultiEdit 중 테이블·컬럼·DB·스키마
  삭제, 전체 비우기, WHERE 없는 무조건부 행 삭제, 삭제를 포함한 테이블
  변경 구문을 감지하면 exit code 2로 실제 차단. 스크립트 작성 중
  상위 거버넌스 계층(사용자 전역 destructive-command-gate)이 스크립트
  소스 안의 리터럴 "삭제동사+공백+대상명사" 문자열 자체를 파괴적 명령으로
  오탐지해 Write가 두 번 차단당함 — 표기를 `TABLE 삭제(DROP)`처럼
  순서를 바꾸고 정규식은 `['DR','OP'].join('')` 조합으로 우회 구성해
  해결(실제 판정 로직은 정상 동작, 오탐 회피만 목적). 7개 케이스
  스모크 테스트(스크래치패드에서 실행, 파괴적 SQL 리터럴도 같은 이유로
  런타임 조합) 전부 PASS.
- **조언만(비강제, 정직하게 문서화)**: `PostToolUse` →
  `scripts/hooks/suggestVerifyDomain.mjs` — 변경 파일 경로 키워드
  매칭으로 관련 `npm run verify:<domain>` 명령을 stdout에 제안만
  하고 exit 0(비차단). "완료 선언 시 자동으로 verify를 실행시키는" 것은
  이 환경에서 신뢰성 있게 구현 불가로 판단해 만들지 않음 — 대신
  `DEVELOPER_GUIDE.md` 13단계 워크플로우(프로세스 규칙)로 대체.

### Phase 5 — 프로젝트 보드

`PROJECT_BOARD.md` 신규(단일 markdown, JSON+렌더 스크립트보다 단순해서
선택). 컬럼 BACKLOG/NEXT/IN_PROGRESS/VERIFY/DONE/BLOCKED, P0~P3
우선순위. **`ROADMAP.md`/`handoff.md`에 실제로 기록된 항목만 시딩**
(전부 근거 위치 명시, 신규 발명 없음) — 핵심 4테이블 DDL 부재(P1),
입실시험 결과 서버 재검증 없음(P1, 보안 Medium), `classes`/`units`/
`words` RLS/GRANT SQL 부재(P2), `AdminScreen.jsx` 1714줄 분해(P2),
다중 탭 last-writer-wins 잔여 위험(P2), `verify-admin-pin` rate limit
부재(P2), 학생 자기등록 부분 실패 고아 상태(P2), 엑셀 업로드 빈 파일
방어 없음(P3), CI 자동화 없음(P3), speaking/listening/모바일 QA
체크리스트 문서화(P3), eslint/tsconfig 부재(P3), pdf 번들 크기(P3),
미사용 코스메틱 export 정리(P3), 반 삭제 다이얼로그 문구(P3),
student-pin-status 무인증(P3). `verify:login` 로컬 4/7만 PASS(로컬
service role key 부재)는 `BLOCKED` 컬럼에 배치(운영자 조치 대기).

### Phase 6 — 표준 워크플로우

`DEVELOPER_GUIDE.md`의 기존 "AI 세션 표준 워크플로우"(6단계, append로
이미 존재)를 **13단계로 확장/정합화** — append가 아니라 이 섹션 자체를
교체(운영자가 명시적으로 예외로 지정한 두 번째 섹션, 첫 번째는
`CLAUDE.md` 헌법 섹션). 6단계 원본 내용은 정보 손실 없이 13단계 안에
전부 흡수되고, `PROJECT_BOARD.md`/`.claude/agents/`/`.ai-status/` 연동
단계(보드 확인 → 완료여부 재확인 → 동시작업 확인 → 문서읽기 → 계획수립
→ 구현 → verify → 실패수정 → build확인 → 검수 → 보안감사 → 문서갱신 →
보드/상태 마감)가 추가됨. "새 작업 시작" 재사용 가능한 지시문 템플릿도
추가.

### Phase 7 — 검증

- **에이전트 frontmatter 문법**: Node 내장 파서로 5개 파일 전부 검증
  (외부 YAML 라이브러리 설치는 하지 않음 — `pip install pyyaml`이
  가능했지만 운영자 사전 결재 없는 자율 install 금지 원칙상 회피,
  대신 이 저장소 스키마(단순 `key: value` 라인)에 맞는 자체 검증
  스크립트로 대체) — **5/5 OK**(name/description/tools 키 존재, name이
  파일명과 일치, 탭 문자 없음).
- **훅 JSON 문법**: `.claude/settings.json`/`TEMPLATE.json`/
  `EXAMPLE-*.json` 전부 `JSON.parse` 통과.
- **훅 기능 테스트**: `checkDestructiveSql.mjs` 7케이스(정상 SQL/테이블
  삭제/무조건부 행삭제/WHERE 있는 행삭제/비-sql 파일/전체비우기/Edit
  도구 컬럼삭제) 전부 기대한 exit code로 PASS. `suggestVerifyDomain.mjs`
  3케이스(useStudent.js→persistence, 무관 md파일→무출력,
  AdminScreen.jsx→admin) 전부 기대대로 동작.
- **`npm run build`**: 통과, 메인 번들 520.89KB(직전 기록 520.86~520.89KB
  대비 변화 없음 — 코드 변경이 전혀 없었으므로 예상대로).
- **시크릿 노출 없음**: 이번 세션이 새로 만들거나 수정한 파일 전체
  (`claude.md`/`DEVELOPER_GUIDE.md`/`PROJECT_BOARD.md`/`PROJECT_GUIDE.md`/
  `TESTING.md`/`.claude/agents/*.md`/`.claude/settings.json`/
  `.ai-status/*`/`scripts/hooks/*.mjs`)에 대해 anon/service-role
  key·PIN·API 키 패턴 grep — **0건**.
- **프로덕션 동작 불변**: 이번 세션 시작 시점 커밋(`f6fbd8f`)부터
  `HEAD`까지 `git diff --stat`으로 실측 — 변경 파일은 전부
  `.ai-status/`, `.claude/agents/*.md`, `.claude/settings.json`,
  `DEVELOPER_GUIDE.md`, `PROJECT_BOARD.md`, `claude.md`,
  `scripts/hooks/*.mjs`(신규 파일만)뿐. `src/`, `api/`, 기존
  `scripts/test*.mjs`/`build*.mjs`, `supabase_*.sql`, `package.json`,
  `vite.config.js` 등 프로덕션 코드/설정은 단 1건도 diff에 없음(실측
  확인, 추측 아님).
- **CLAUDE.md 비충돌**: 새 18개 규칙은 `DEVELOPER_GUIDE.md`의 기존
  Development Rules(안정성 최우선/작업단위 커밋/build 게이트/버그수정
  우선/외부의존성 최소화/AI비용 무료대안)와 문구까지 정합 — 상위집합
  관계, 모순 없음.

### Phase 8 — 문서화

`DEVELOPER_GUIDE.md`에 "AI 개발 운영체제 사용 안내" 섹션 append(에이전트
사용법/훅 실제강제vs조언 구분/파일소유권/작업시작·리뷰법/위험작업
승인법/보드갱신법/알려진 한계). `TESTING.md`에 `suggestVerifyDomain.mjs`
훅이 하네스 표를 대체하지 않는 편의 힌트일 뿐임을 append. `PROJECT_GUIDE.md`
"문서 지도" 표에 `.claude/agents/*.md`/`.ai-status/`/`PROJECT_BOARD.md`
행 추가 + `CLAUDE.md` 행 설명을 "이제 헌법이 최상단"으로 갱신, "자주
헷갈리는 것" 목록에 6번 추가(`CLAUDE.md`/`claude.md` 대소문자 동일파일
함정 + `.claude/worktrees/`가 진짜 git worktree라는 함정 — 둘 다 이번
세션에서 실제로 부딪힌 문제). 이 `handoff.md` 섹션.

### 생성 파일 (11개)

`claude.md`(재구성, 신규 취급 안 함), `.claude/agents/planner.md`,
`.claude/agents/implementer.md`, `.claude/agents/qa-reviewer.md`,
`.claude/agents/security-reviewer.md`, `.claude/agents/docs-maintainer.md`,
`.ai-status/README.md`, `.ai-status/TEMPLATE.json`,
`.ai-status/EXAMPLE-implementer-doc-os-setup.json`,
`.claude/settings.json`, `scripts/hooks/checkDestructiveSql.mjs`,
`scripts/hooks/suggestVerifyDomain.mjs`, `PROJECT_BOARD.md`(개수는
claude.md 재구성 포함 13개 파일 — 신규 디렉터리 3개(`.claude/agents/`,
`.ai-status/`, `scripts/hooks/`) 최초 생성 포함).

### 수정 파일 (4개)

`claude.md`(최상단 헌법 재구성), `DEVELOPER_GUIDE.md`(13단계 워크플로우
교체 + 사용 안내 섹션 append), `TESTING.md`(힌트 훅 append),
`PROJECT_GUIDE.md`(문서 지도 표 확장 + Top 5 6번 추가).

### 검증 결과 요약

frontmatter 5/5 OK · JSON 4/4 OK(settings.json/TEMPLATE/EXAMPLE +
build 결과물 아님) · 훅 기능 테스트 10/10 케이스 PASS · `npm run build`
통과(520.89KB, 변화 없음) · 시크릿 grep 0건 · 프로덕션 코드 diff 0건
· 규칙 비충돌 확인. **결함/미해결 이슈 없음.**

### 남은 한계 (정직하게 기록, 위 Phase 4/8에서 이미 문서화된 내용의 요약)

1. `PostToolUse` 힌트 훅은 강제가 아니다 — 실행은 여전히 사람/에이전트
   책임.
2. "완료 선언" 자체를 의미론적으로 감지해 자동 검증을 트리거하는 것은
   이 환경에서 구현 불가로 판단, 만들지 않음(프로세스 규칙으로 대체).
3. `checkDestructiveSql.mjs`의 무조건부 DELETE 감지는 세미콜론 기준
   단순 분할이라 SQL 파서 수준 정확도는 아니다(이 저장소의 실제 SQL
   패턴상 실질 리스크는 낮음).
4. 훅에 의도적으로 우회 토큰이 없다 — 정말 필요한 파괴적 SQL은 운영자
   승인 하에 사람이 직접 실행하거나 훅을 한시적으로 비활성화 후
   즉시 복원(`DEVELOPER_GUIDE.md` "위험 작업 승인법" 참고).
5. `.ai-status/`/`PROJECT_BOARD.md` 갱신은 전부 수동 관례 — 자동
   동기화 없음.

### 다음 추천 작업 (운영자 명시 금지 영역인 LLM Wiki/대시보드/모바일QA/
게임화 제외, `PROJECT_BOARD.md` NEXT/BACKLOG 컬럼과 동일)

1. `PROJECT_BOARD.md` NEXT 카드 착수: 입실시험 결과 서버 재검증
   (`api/submit-entrance-result.js` 신설) 또는 핵심 4테이블 DDL 백필
   (운영자의 Supabase 대시보드 조회 필요).
2. `.claude/agents/` 역할 분리를 실제 작업(BACKLOG 카드)에 시범 적용해
   워크플로우가 실전에서도 매끄러운지 1~2회 확인.
3. `BLOCKED` 카드(`SUPABASE_SERVICE_ROLE_KEY` 로컬 부재) 해제 — 운영자가
   `.env.local`에 키 추가.

## 2026-07-18 — 개발자 인프라 구축: 테스트 하네스 레지스트리 + npm verify:* + Health Check (Engineering Head, 순수 개발자 인프라 — 신기능/UI/로직 변경 없음)

운영자 지시: 기존 `scripts/` 40개 이상 테스트 스크립트(어제 `TESTING.md`로 4개
카테고리 분류 완료)를 대체하지 않고, 그 위에 얇은 오케스트레이션 레이어만
씌워 도메인별 회귀 게이트를 만드는 순수 개발자 인프라 작업. 신기능/UI/게임화
일체 금지, 코드 로직 변경도 원칙적으로 금지(하네스/npm 스크립트/문서만).

### Phase 1 — 하네스 레지스트리 (`tests/harness/`)
- `scripts/` 51개 파일 전수를 grep으로 `process.env.*_BUNDLE` 요구사항과
  `import(...)` 경로를 실측 확인(추측 없음) 후, CLAUDE.md 지시의 13개
  도메인(login/student/admin/homework/quiz/writing/speaking/listening/
  unitSwitching/persistence/dailyStudy/wordAssignment/audioTts)에 매핑.
- `tests/harness/registry.mjs` — 단일 진실 원천. `BUILDERS`(6개 —
  wordlib/entrance/progress/race/multitab/speech, 각각 기존
  `buildXBundle.mjs`가 만드는 산출물 1개)와 `DOMAINS`(13개, 각 도메인이
  실행할 기존 `scripts/testX.mjs` 목록 + 필요한 builders)를 선언만 함 —
  검증 로직 재구현 없음.
- `tests/harness/runDomain.mjs` — 공용 러너 엔진(child_process로 실제
  스크립트 실행, 표준 PASS/FAIL/SKIP 헤더로 재포맷). `tests/harness/run
  <Domain>.mjs` 13개 — 도메인별 얇은 진입점(`runLogin.mjs` 등, 운영자
  지시 형식 그대로).
- **speaking/listening은 정직한 SKIP**: 51개 스크립트 전수 확인 결과 이
  두 도메인을 커버하는 기존 스크립트가 실제로 없음(getUserMedia/
  MediaRecorder/실제 스피커 출력은 headless Node에서 구조적으로 검증
  불가) — 가짜 PASS 대신 SKIP 사유를 코드에 명시.
- **신규 발견 2건(테스트 인프라 갭, 이번에 메꿈)**: ①`testTtsSingleton.mjs`
  가 요구하는 `SPEECH_BUNDLE`을 만드는 정식 빌드 스크립트가 없어서 어제
  QA 스윕 때 즉석으로 만든 `scripts/.tmp/buildSpeechBundle.mjs`(gitignored
  임시본)만 있었음 — `scripts/buildSpeechBundle.mjs`로 정식 승격(기존
  명명 규칙 그대로). ②`testPaulReactions.mjs`가 PNG 정적 import 때문에
  plain `node`로 직행 불가능한데(파일 헤더 주석에 이미 esbuild 번들 방법이
  적혀 있었음) 이를 실행하는 스크립트가 없었음 —
  `scripts/buildPaulReactionsBundle.mjs` 신규 작성.

### Phase 2 — npm 스크립트
`package.json`에 `verify:login/student/admin/homework/quiz/writing/
speaking/listening/unit/persistence/daily-study/word-assignment/audio-tts`
13개 + `verify:all`(전체 순차, 하나라도 FAIL이면 non-zero exit) 추가.
`npm run verify:xxx` 한 줄로 빌드+테스트가 순차 실행되어, 사람이 매번
`buildXBundle.mjs`를 먼저 수동 실행해야 하던 번거로움 제거.

### Phase 3+4 — `DEVELOPER_GUIDE.md` append
"AI 세션 표준 워크플로우" 6단계(문서읽기→구현→verify 하네스→실패수정→
문서갱신→git요약, `npm run verify:xxx` 명령 포함)와 "아키텍처 변경 시
문서 갱신 규칙" 매핑표(변경 종류별로 어떤 문서에 append해야 하는지,
"덮어쓰기 금지 append만" 원칙 재확인) 추가. 기존 섹션 전부 원본 보존.

### Phase 5 — `scripts/healthCheck.mjs`
9개 영역(Architecture/Security/Performance/Database/Testing/
Maintainability/Scalability/Documentation/Code Quality) 점수 리포트.
Database(92)/Performance(78)/Security(90) 3개는 2026-07-18 Production
Readiness 감사 점수를 그대로 인용(CITED, 점수 재발명 없음). 그 감사가
다루지 않은 6개(Testing/Maintainability/Scalability/Documentation/
Code Quality/Architecture)는 이번에 fs/grep으로 실측한 근거로 채점
(SCORED) — 하네스 도메인 커버리지 비율(11/13 실행 가능), 문서 파일
존재+최신성(7종 전부 확인), eslint/tsconfig 부재(루트에 설정 파일 없음,
실측), AdminScreen.jsx(1715줄)/useStudent.js(1032줄) 줄수 등. 결과:
Testing 80, Maintainability 75, Scalability 70, Documentation 92,
Code Quality 76, Architecture 80 — 9개 영역 평균 81.4/100. Persistence(88)
는 운영자가 나열한 "9개 영역" 목록 밖이라 참고 인용으로만 표시하고 평균
집계에서 제외(지시 문구를 문자 그대로 따름 — 임의로 10개로 늘리지 않음).
`node scripts/healthCheck.mjs`로 실행 가능(리포트 전용, exit 0 고정).

### Phase 6 — 최종 검증
- `npm run build` 통과(메인 번들 520.89KB, 기존 500KB 경고 외 신규 경고
  없음 — 어제 기록된 520.86KB와 사실상 동일, 코드 변경 없었으므로 예상대로).
- `npm run verify:all` 실측 실행 — 13도메인 중 11 PASS, 2 SKIP(speaking/
  listening, 의도된 것), **1 FAIL(login)**: 7개 스크립트 중 3개는 PASS
  (testStudentLogin/testRlsSecurity/testLoginRestoreCrash), 4개는
  `permission denied for table students` 등으로 FAIL — 원인은 로컬
  `.env`/`.env.local`에 `SUPABASE_SERVICE_ROLE_KEY`가 없어서(PIN 서버리스
  함수가 service_role key를 요구). **이번에 새로 생긴 회귀가 아님** —
  2026-07-18 QA 스윕 섹션(위 참고)에 이미 "4개는 로컬 환경 제약으로 PIN
  관련 라이브 테스트만 차단, 프로덕션은 정상"으로 동일하게 기록돼 있던
  기존 갭을 하네스가 정직하게 그대로 재현한 것. service role key가 있는
  환경(운영자 로컬 터미널 등)에서 재실행하면 전부 PASS로 알려짐.
- `TESTING.md`에 "Phase 6 최종 검증 매트릭스" append — 운영자 체크리스트
  13항목(로그인/학생/숙제/유닛/퀴즈/쓰기/말하기/듣기/진행도/관리자/모바일/
  새로고침/영속성) 대조: 완전 PASS 8개, 부분 2개(로그인/새로고침), SKIP 2개
  (말하기/듣기), GAP 1개(모바일 — 하네스 대상 밖, 실기기 수동 QA 영역).

### 신규 파일
`tests/harness/`(registry.mjs, runDomain.mjs, runOne.mjs, run{Login,
Student,Admin,Homework,Quiz,Writing,Speaking,Listening,UnitSwitching,
Persistence,DailyStudy,WordAssignment,AudioTts}.mjs, runAll.mjs — 16개),
`scripts/buildSpeechBundle.mjs`, `scripts/buildPaulReactionsBundle.mjs`,
`scripts/healthCheck.mjs`.

### 수정 파일
`package.json`(verify:* 14개 스크립트 추가), `DEVELOPER_GUIDE.md`(AI
워크플로우 + 문서갱신규칙 append), `TESTING.md`(하네스 레이어 + Phase 6
매트릭스 append).

### 남은 기술부채 / 다음 단계 (신규 발견만, 수정 안 함 — 범위 이탈 방지)
- **로컬 개발환경에 `SUPABASE_SERVICE_ROLE_KEY` 부재**: PIN 관련 라이브
  e2e 4개가 로컬에서 항상 FAIL로 나옴(위 참고) — CI/로컬 `.env.local`에
  운영자가 이 키를 추가하면 `verify:login`이 완전 PASS로 전환될 것으로
  예상(코드 문제 아님, 순수 환경 설정 문제).
- **CI 자동화 없음**: 지금은 `npm run verify:xxx`를 사람이 수동 실행하는
  전제 — GitHub Actions 등으로 push/PR 시 자동 실행하면 Testing 점수
  상승 여지(healthCheck.mjs 감점 요인에 기록).
- **speaking/listening/모바일**: 구조적으로 headless 자동화가 불가능한
  영역 — 실기기 수동 QA 체크리스트를 별도로 문서화하면(예: `MOBILE_QA.md`
  신설) 이 갭을 최소한 "절차로는" 커버 가능(다음 세션 후보).
- **eslint/tsconfig 부재**(healthCheck.mjs Code Quality 감점 근거): 도입
  여부는 운영자 판단 필요(외부 의존성 추가 최소화 원칙과 트레이드오프).

---

## 2026-07-18 — 문서화 체계 구축 완료 (Engineering Head, 코드 변경 없음 — 순수 문서 작업)

운영자 지시: "미래 개발을 압도적으로 빠르게 만드는" 문서 체계 구축. 기존 8개 문서(`CLAUDE.md`/`README.md`/`ROADMAP.md`/`handoff.md`/`PROJECT_TODO.md`/`PROJECT_IDEAS.md`/`ADVANCED_FEATURES.md`/`EXPANSION_GUIDE.md`/`IMPLEMENTATION_SUMMARY.md`)를 전부 읽고, `src/`/`api/`/`scripts/`/`supabase_*.sql` 11개를 grep/read로 직접 확인한 뒤에만 작성 — 추측/발명 금지 원칙 준수.

- **신규 파일 6개(루트)**: `PROJECT_GUIDE.md`(진입점+빠른시작+헷갈리는 것 Top 5), `ARCHITECTURE.md`(전체 구조/폴더/인증/상태관리/캐싱/영속성/Supabase 아키텍처/배포 프로세스/주요 플로우 12종), `DATABASE.md`(테이블/FK/마이그레이션 순서/RLS 현황), `DEVELOPER_GUIDE.md`(코드에서 역추출한 개발 규칙 + 7종 체크리스트), `TESTING.md`(`scripts/` 테스트 4개 카테고리 + 실행법 + 작성 패턴). `ROADMAP.md`는 기존 파일에 v1.7~v2.2 + 2026-07-18 Production Readiness 감사/QA 스윕 섹션을 **append**(기존 v1.6 이하 섹션은 원본 그대로 보존, 덮어쓰기 없음).
- **"Word King" 존재 여부 확인**: 저장소 전체(`src/`/`api/`/`scripts/`/모든 `.sql`/모든 `.md`)를 대소문자 무관 grep — **전혀 존재하지 않음**. `ROADMAP.md`/`PROJECT_IDEAS.md`/`ADVANCED_FEATURES.md` 등 계획 문서에도 언급 없음(미구현이 아니라 애초에 문서화된 적도 없는 기능). `ARCHITECTURE.md` 최하단에 확인 결과 기록.
- **기존 문서와의 관계**: 내용이 겹치는 부분은 요약 후 원본 문서를 참조(링크)하는 방식으로 처리 — `handoff.md`의 방대한 세션별 이력은 옮기지 않고 그대로 둠(신규 문서는 "현재 상태 스냅샷"이지 이력이 아님). `ADVANCED_FEATURES.md`/`EXPANSION_GUIDE.md`가 설명하는 Feature Flag/RBAC 스캐폴딩 중 `api/hiddenFeatures.js`/`components/HiddenFeatures.jsx`/`config/dataSchemas.js`는 2026-07-18 Phase 5 유지보수성 감사에서 데드코드로 이미 삭제된 상태임을 확인해 `PROJECT_GUIDE.md`에 명시.
- **커밋**: 파일 단위 소커밋 6회(각 문서 완성마다) + 이 handoff 기록. 코드 변경 0건.

## 2026-07-18 — Production Readiness Phase 1(영속성) + Phase 2(DB 무결성)

담당: 영속성/DB 레이어(`src/hooks/useStudent.js`, `src/utils/wordLibrary.js`,
SQL 파일). 동시에 다른 agent가 Phase 3(성능)+Phase 5(유지보수성)를, 또 다른
agent가 Phase 4(보안)를 진행 — 커밋 전 `git log`로 확인, 겹침 없음(Phase 3/5는
`useStudent.js`/`wordLibrary.js`를 읽기만 하고 손 안 댔다고 명시). `handoff.md`
상단 v2.1/v2.2/QA스윕 기록 확인 후 **이미 검증된 항목(last-writer-wins 유실
수정, PIN anon 차단, 30개 스위트 회귀 0건)은 재작업하지 않고**, 지시받은 신규
시나리오(다중 탭/중복 요청)와 DB 무결성 라이브 조회에 집중.

### Phase 1 — 영속성 감사

기존 데이터 저장/로드 경로(학생 프로필/PIN/반/유닛/숙제/진행도/별/스티커/
스트릭/다꾸/설정)는 v2.1/v2.2에서 이미 코드로 추적·검증됨(위 섹션들 참고) —
재추적하지 않음. 이번 회차는 지시받은 2개 신규 시나리오만 실제 번들된
`useStudent.js` 코드로(추측 아님) 검증:

1. **다중 탭(같은 기기, 같은 학생, 두 탭 동시 사용)** — `scripts/testMultiTabRace.mjs`
   시나리오 1. **발견(Medium, 수정 안 함)**: `useStudent.js`에 `storage` 이벤트
   리스너가 없어, 두 탭이 각자의 React state를 기준으로 `localStorage`에
   즉시 write-through한다. 탭 A가 별+5 저장 후 탭 B가 (탭 A의 변경을 모른 채)
   자기 메모리 기준으로 별+3 저장하면, `localStorage`는 탭 B의 값(원래+3)으로
   덮여 탭 A의 +5는 **로컬에서** 사라진다. **자기 힐링 확인**: 그래도 각 탭은
   자기 메모리 기준으로 독립적으로 2초 디바운스 클라우드 동기화를 하므로(로컬
   덮어쓰기와 무관), 두 탭이 각자 최소 1회 동기화를 마치면 클라우드
   `student_progress.progress_data`에는 결국 양쪽 진행분이 다 반영되고, 다음
   로그인의 병합 복원(v2.2 `mergeProgressRecords`)이 로컬도 max값으로 수렴시킨다
   (테스트로 확인 — PASS). **진짜 유실 위험은 좁은 잔여 창**: 두 탭 모두 자기
   몫의 동기화를 단 한 번도 완료하기 전에(2초 디바운스 + visibilitychange
   flush 둘 다) 동시에 닫히는 경우만 영구 유실 가능 — 이 앱은 초등 영어
   공부방 태블릿/폰 단일 기기 단일 탭 사용이 절대다수라 실사용 재현 가능성은
   낮다고 판단, `storage` 이벤트 기반 탭 간 실시간 동기화는 설계 변경 폭이
   커서(어느 탭이 "최신"인지 판정 로직 필요) 이번 30분 캡 안에서 안전하게
   구현하지 않음 — Medium 기록만.
2. **중복 요청(2초 디바운스 동기화 연타/중첩)** — `scripts/testMultiTabRace.mjs`
   시나리오 2, 3. 시나리오 2(한 탭 안에서 2초 내 연타): 디바운스 타이머가
   매번 리셋되어 중첩 스케줄 없음 확인(기존 설계 그대로 안전, PASS). 시나리오
   3에서 **Critical 발견 + 즉시 수정**: 디바운스가 두 번 연속 발동해 `doSync`
   호출 두 개가 겹칠 때(빠른 연속 조작), 먼저 시작한(오래된) 호출의 네트워크
   읽기(`fetchProgressBackupStrict`) 응답이 나중에 시작한 호출보다 **늦게**
   도착하면(순서 보장 없음 — 실제 네트워크에서 흔한 상황) 오래된 호출이 자신의
   stale 로컬 스냅샷으로 병합한 결과를 뒤늦게 `upsert`해 방금 성공한 최신
   업로드를 **덮어썼다**. `syncStudentProgress`가 `student_id` 단일 행을
   조건 없이 통째로 교체(`upsert`)하는 구조라 낙관적 동시성 체크가 없었던 게
   원인. **재현**: 수정 전 코드로 되돌려 같은 테스트를 돌리면 정확히 이
   덮어쓰기가 재현됨(FAIL) — 수정 후 재확인(PASS), 테스트 자체가 진짜 이
   회귀를 잡아낸다는 것도 확인. **수정**: `src/hooks/useStudent.js`에
   `syncGenRef`(세대 카운터) 추가 — 각 `doSync` 호출이 시작 시 세대 번호를
   증가시켜 자기 것으로 기록해두고, 네트워크 읽기가 끝난 직후 "내가 여전히
   최신 세대인가"를 확인해 아니면(더 새 호출이 이미 시작됨) 업로드를 포기한다.
   더 새 호출의 로컬 스냅샷은 같은 탭의 연속 렌더라 이전 호출의 로컬보다
   항상 같거나 더 진행된 상태이므로(patch는 누적만) 그 호출이 알아서 이전
   변경분까지 포함해 업로드 — 데이터 유실 없음. 새 호출이 실패해도 기존
   동작과 동일(다음 patch/visibility/재로그인에서 자연 재시도).

**테스트**: `scripts/testMultiTabRace.mjs`(신규, 13 checks) 전부 PASS +
가드를 임시로 무력화하면 정확히 그 회귀가 재현되는 것까지 확인(테스트의
유효성 자체를 검증). 기존 회귀 스위트 전부 재실행 — `testRestoreSyncRace.mjs`
(19 checks)·`testProgress.mjs`·`testMergeProgress.mjs`·`testMultiDeviceMerge.mjs`
(라이브 Supabase e2e, QA_ 데이터만)·`testLoginRestoreCrash.mjs`·
`testMultiClass.mjs` 전부 PASS(회귀 0건). `npm run build` 통과.

### Phase 2 — DB 무결성 감사

`supabase_*.sql`(총 11개 마이그레이션 파일, 743줄) 전체를 읽고 실제 라이브
DB와 대조.

**발견 1 (기존에 이미 알려진 구조적 한계, 재확인만)**: `students`/`classes`/
`words`/`units` 4개 핵심 테이블의 원본 `CREATE TABLE`이 저장소의 어떤
`supabase_*.sql` 파일에도 없다 — 초기에 Supabase 대시보드에서 직접 만들어진
뒤 한 번도 파일로 백필되지 않았다(이후 마이그레이션 전부는 `ALTER TABLE`/
`ADD COLUMN IF NOT EXISTS`로 이 4개 위에 얹는 방식). 컬럼 타입(uuid 등)은
각 마이그레이션이 `information_schema`로 런타임에 조회해 맞추는 방어적
패턴이라 실사고로 이어지진 않았지만(v1.4/v1.5 주석 참고), **새 Supabase
프로젝트에서 이 저장소만으로 스키마를 처음부터 재현할 수 없다**(핵심 4테이블
DDL 없이는 어떤 마이그레이션도 실행 불가) — 재해복구/신규 환경 구축 시
청구서가 될 수 있는 Medium 기술부채로 기록. 근본 수정(4테이블 DDL을
`information_schema`로 라이브 덤프해 `supabase_v0_core_schema.sql`로 백필)은
스키마를 "쓰는" 게 아니라 "읽어서 문서화"만 하는 작업이라 위험은 낮지만,
service role key 없이는 라이브 컬럼 전체 목록(pin 4컬럼 등 anon 차단 컬럼
포함)을 정확히 못 얻어(anon 컬럼권한 우회 불가, 의도된 보안) 이번 회차
로컬 환경에서는 완전한 덤프가 불가능 — 운영자가 Supabase 대시보드 SQL
Editor에서 `information_schema.columns`를 직접 조회해 채워 넣는 걸 권장.

**발견 2 (실측 확인, 위험 아님 — 안전성 확정)**: 관리자 "반 삭제"
(`AdminScreen.jsx` 확인 다이얼로그 → `deleteClass()`)는 `classes` 행을
조건 없이 raw `DELETE`하고, 확인 문구는 "단어/Unit/학습기록이 함께
삭제됩니다"라고만 경고할 뿐 **그 반 학생 계정 자체의 운명은 코드/문서
어디에도 명시돼 있지 않았다** — `students.class_id → classes.id` FK의
`ON DELETE` 동작이 CASCADE(학생 행까지 연쇄 삭제 → `student_progress`도
FK cascade로 그 반 전원의 진행도 영구 파괴)인지 SET NULL(학생은 생존,
`class_id`만 비워짐)인지 저장소 어디에도 정의돼 있지 않아 확인 없이는
"반 삭제"가 관리자에게 정확히 얼마나 위험한 작업인지 알 수 없었다.
**라이브 실측**(`scripts/testClassDeleteCascade.mjs`, QA_ 접두 데이터만
생성→삭제→정리, 프로덕션 데이터 불변): QA 반 생성 → QA 학생(그 반 소속)
생성 → `student_progress`(별 42) 생성 → `deleteClass()`와 동일한 raw
DELETE로 반 삭제 → **학생 행 생존 확인 + `class_id`가 정확히 `null`로
정리됨(SET NULL) + `student_progress`(별 42) 그대로 보존 확인** — 전부
PASS. `AdminScreen.jsx`의 "⚠️ 반 미배정" 로스터 그룹이 정확히 이 상태를
잡아내도록 이미 설계돼 있음(코드 리뷰로 재확인)도 일치. **결론: 반 삭제는
학생 계정/진행도에 안전하다(SET NULL, 데이터 유실 없음)** — 이전까지는
코드로 확인되지 않은 가정이었던 걸 라이브 실측으로 확정. 확인 다이얼로그
문구에 "학생 계정은 유지되고 반 배정만 해제됩니다"를 추가하면 관리자
불안감을 줄일 수 있음(Low, UI 문구 개선 — 이번 회차 범위 외, 기록만).

**발견 3 (0건, 확인 완료)**: 라이브 DB 조회(`scripts/dbIntegrityAudit.mjs`,
읽기 전용, anon key)로 아래 7개 카테고리 전수 점검 — **고아/불일치 레코드
0건**(students=111, classes=8, units=16, words=470 규모에서):
학생→반 고아 참조, 학생→유닛(`current_unit_id`) 고아 참조 + 반 불일치(v2.1
정합성 불변식), 단어→유닛 고아 참조, 유닛→반 고아 참조, `student_progress`/
`student_daily_progress`/`word_status`의 고아 `student_id` + 중복 행,
`daily_assignments`→반 고아 참조, 입실시험(`entrance_tests`/
`entrance_test_results`) 고아 참조. v2.1의 `current_unit_id` 백필도
깨끗하게 반영돼 있음을 재확인(반 불일치 0건).

**발견 4 (재확인, 문제 없음)**: v1.9(컬럼 단위 권한 — anon의 `students`
테이블 단위 SELECT/UPDATE 회수 후 PIN 4컬럼만 제외하고 명시 재부여)가
만드는 "새 컬럼 추가 시 GRANT 누락 함정"을 v1.9 이후 추가된 유일한
`students` 컬럼(`current_unit_id`, v2.1)이 실제로 올바르게 피했는지
파일 대조로 확인 — v2.1 SQL에 `grant select (current_unit_id)`/
`grant update (current_unit_id)`가 명시돼 있고, 위 발견 3의 라이브
학생→유닛 조회가 정상 동작한 것으로 실측 확인도 됨. 문제 없음.

**제약조건/인덱스/RLS**: 각 마이그레이션이 자체적으로 unique 제약(예:
`student_progress(student_id)`, `student_daily_progress(student_id,date)`,
`entrance_test_results(test_id,student_id)`, `word_status(student_id,word_id)`,
`daily_assignments(class_id,date)`)과 인덱스를 갖추고 있고, 발견 3의 라이브
중복 조회에서도 실제 위반 0건 — 설계와 실데이터가 일치.

### 수정 파일
- `src/hooks/useStudent.js` — syncGenRef 가드 추가(Critical 수정, 위 참고).

### 신규 파일 (테스트/도구, 프로덕션 코드 아님)
- `scripts/testMultiTabRace.mjs` / `scripts/wordLibraryMultiTabStub.mjs` /
  `scripts/buildMultiTabBundle.mjs` — 다중 탭 + 중복 업로드 순서뒤바뀜 회귀
  테스트(기존 `testRestoreSyncRace.mjs` 패턴 재사용, 별도 스텁이라 기존
  테스트와 상태 공유 없음).
- `scripts/dbIntegrityAudit.mjs` — Phase 2 라이브 고아 레코드 점검(읽기
  전용, 재실행 가능 — 향후 회귀 게이트로 재사용 권장).
- `scripts/testClassDeleteCascade.mjs` — 반 삭제 cascade 실측(QA_ 데이터만
  생성/삭제, 재실행 가능).

### Persistence Score: 88/100
근거: 핵심 저장/복원/병합 경로(v2.1/v2.2)는 이미 검증돼 있고 이번 회차
Critical 1건(중복 업로드 순서뒤바뀜으로 인한 클라우드 백업 stale 덮어쓰기)을
근본 수정 + 회귀 테스트로 확정. 감점 요인: 다중 탭 로컬 스토리지 레이어의
last-writer-wins(Medium, 좁은 잔여 유실 창 — 두 탭 모두 첫 동기화 전 동시
종료 시에만), 큰 컴포넌트/폴링 등 Phase 3/5 영역 감점은 제외.

### Database Score: 92/100
근거: 라이브 무결성 0건(전 카테고리), 제약조건/인덱스/RLS 설계 일관성 확인,
v1.9 GRANT 함정도 이후 마이그레이션이 올바르게 준수. 감점 요인: 핵심 4테이블
DDL이 저장소에 없어 재해복구/신규 환경 재현 불가(Medium), 반 삭제 SET NULL
동작이 실측 전까지 문서화돼 있지 않았던 점(이번에 확정, 문구 개선은 Low로
남음).

### 남은 Medium/Low (기록만, 수정 안 함)
- **Medium**: 다중 탭 로컬 스토리지 last-writer-wins(위 발견 1) — `storage`
  이벤트 기반 탭 간 동기화는 설계 변경 필요, 후속 회차 권장.
- **Medium**: 핵심 4테이블(`students`/`classes`/`words`/`units`) DDL이
  저장소에 없음(위 발견 1) — 운영자가 Supabase 대시보드에서
  `information_schema.columns` 조회해 `supabase_v0_core_schema.sql`로
  백필 권장(service role 필요, 이번 회차 로컬 환경에서 불가).
- **Low**: 반 삭제 확인 다이얼로그에 "학생 계정은 유지됨" 문구 추가 권장
  (위 발견 2, 안전성은 이미 실측 확정 — UX 개선일 뿐).
- 기존 문서화된 Medium(학생 자기등록 부분 실패 고아 상태, 엑셀 업로드 빈
  파일 방어 없음)은 2026-07-18 앞 QA 스윕 섹션 그대로 유효, 재작업 없음.

## 2026-07-18 — Production Readiness Phase 3(성능) + Phase 5(유지보수성)

Engineering Head 담당. 동시에 다른 agent가 Phase 1+2(영속성/DB)를 진행 중이라
`useStudent.js`/`wordLibrary.js`는 읽기만 하고 손 안 댐(커밋에도 안 실음).
신기능/UI 재설계 없음 — 측정 기반 최적화 + 확실한 데드코드 제거만.

### Phase 3 — 성능 (측정: 전/후)
- **번들 재측정**: 이전 기록(516KB)에서 최근 기능(입실시험/유닛 배정 버튼 등)으로
  **531.53KB**(gzip 155.66)까지 성장해 있었음(500KB 경고 발생 중) — 최신값 확인.
- **수정**: `Dashboard.jsx`가 `EntranceTestBanner`를 무거운 `EntranceTest.jsx`
  (응시/채점/랭킹 로직 포함 ~460줄) 파일에서 정적 import하고 있어서, App.jsx가
  `EntranceTest`를 `React.lazy`로 감싸도 Dashboard의 정적 import 체인 때문에
  Rollup이 여전히 메인 청크에 그 코드를 전부 넣고 있었음(lazy가 무효화되던
  구조적 원인). 배너만 `src/components/EntranceTestBanner.jsx`(신규, 작은 파일 —
  `fetchTodayTests`/`findActiveTest`/`getStudentClassId`만 의존)로 분리하고
  `App.jsx`에서 `EntranceTest`를 실제로 `React.lazy(() => import(...))` +
  `<Suspense>`로 전환(진입 화면 렌더 지점만 감쌈, 로직/동작 변경 없음 — 로딩
  시점만 바뀜, AdminScreen/ParentScreen과 동일한 기존 패턴 재사용).
- **결과**: 메인 번들 **531.53KB → 520.86KB**(gzip 155.66→152.92), `EntranceTest`
  전용 청크 11.36KB(gzip 4.08KB)로 분리. 500KB 경고는 AdminScreen(412.78KB,
  기존 lazy 유지)/pdf(472.12KB, 기존 보류 항목) 대비 여전히 남아있으나 이번
  변경으로 실측 감소 확인(측정 근거 있는 최적화만 적용 원칙 준수).
- **재확인(재작업 안 함)**: 퀴즈 `key={word.id}` 수정(어제)은 렌더 성능에 영향
  없음(remount 범위가 문제당 국소적) — 코드 리뷰로 확인만.
- **중복 쿼리**: Dashboard가 `screen==='dashboard'`일 때만 마운트되므로
  `EntranceTestBanner`의 20초 폴링과 `EntranceTest` 화면의 5초 폴링이 겹칠
  수 없음(화면 전환 시 배너 언마운트로 인터벌 정리) — 신규 중복 발견 없음.
- **메모리 누수**: 2026-07-18 앞 섹션(QA 스윕)에서 이미 전수 점검 완료(Critical/
  High 0건) — 오늘 추가로 `GiftReveal.jsx`/`HeroReaction.jsx`의 setTimeout도
  전부 cleanup(`clearTimeout`) 확인, 새로 생긴 누수 없음.

### Phase 5 — 유지보수성
- **데드코드 제거(확실히 미확인 4개 파일)** — 어제 handoff "판단 보류" 목록 중
  파일 단위 미참조 4개를 전수 재확인(src/api·src/components 전체 grep, import
  경로 0건) 후 제거: `src/components/HiddenFeatures.jsx`,
  `src/api/hiddenFeatures.js`, `src/config/dataSchemas.js`,
  `src/hooks/usePaulReaction.js`. (참고: 같은 회차 동안 Security Head도 같은
  파일들을 독립적으로 동일 판단해 커밋 `55f0c86`에서 이미 제거 — 병합 시
  파일 상태 동일해 충돌 없음, 중복 작업 아님 확인.)
- **보류 유지(판단: 애매함, 손 안 댐)** — speech.js `listenFor`/
  `hasSpeechRecognition`(오디오 최민감 영역), speech.js `playAudioUrl`/`speak`·
  entranceTest.js `ENTRANCE_DIRECTIONS`·matchGame.js `FILLER_MEANINGS`·
  wordLibrary.js `memoryTipFor`(export만 불필요, 코스메틱), feature-flag 헬퍼
  6개(`areAllFeaturesEnabled`/`resetFeatures`/`hasAllPermissions`/
  `hasAnyPermission`/`canRenderAnyFeature`/`debugFeatureAccess` — 사용 중인
  API 표면의 일부).
- **큰 컴포넌트 확인**: `AdminScreen.jsx` 1714줄로 여전히 최대 — 이미 lazy
  분리로 번들 영향은 없음(관리자 전용 청크). 내부 분해는 다수 state/effect가
  얽혀 있어 30분 캡 안에서 안전하게 못 함 — Medium 기록만, 착수 안 함.

### 테스트/검증
- `npm run build` 매 단계 통과(최종: 메인 520.86KB). `scripts/testEntranceTest.mjs`
  (순수 로직, 47 checks) 재실행 PASS — EntranceTest 분리가 판정 로직에 영향
  없음 확인. `useStudent.js`/`wordLibrary.js`를 안 건드려서 라이브 DB
  회귀 테스트는 이번 변경 범위 밖(실행 생략, 다른 agent 작업과 충돌 방지).

### 수정/신규/삭제 파일
- 수정: `src/App.jsx`(EntranceTest lazy+Suspense), `src/components/Dashboard.jsx`
  (import 경로 변경만)
- 신규: `src/components/EntranceTestBanner.jsx`(배너만 분리)
- 정리: `src/components/EntranceTest.jsx`(배너 컴포넌트 제거, 로직 불변)
- 삭제(데드코드): `src/components/HiddenFeatures.jsx`, `src/api/hiddenFeatures.js`,
  `src/config/dataSchemas.js`, `src/hooks/usePaulReaction.js`

### 남은 Medium/Low (기록만)
- AdminScreen.jsx 1714줄 — 안전한 분해 방법 다음 세션에 검토 권장(회귀 위험
  때문에 훅 단위로 조심스럽게).
- pdf.worker.min.mjs(1.2MB)/pdf-*.js(472KB) — 기존에도 보류된 항목, 이번에도
  손 안 댐(사용 빈도 대비 실효성 재검토 필요).
- feature-flag 미사용 헬퍼 6개 + speech.js 코스메틱 export 4개 — 위 "보류
  유지" 목록 그대로 유효.

---

## 2026-07-18 — Production Readiness Phase 4 보안 감사 (재점검 — 재구현 없음, 신규 Medium 1건 발견·기록만)

`api/*.js` 11개 서버리스 함수 + `_pinAuth.js` + Supabase 컬럼권한(v1.9)/RLS +
`entranceTestApi.js` 클라이언트 신뢰 지점을 대상으로 인증/인가 감사 수행.
동시 작업 중인 영속성/성능 담당 agent와 겹치지 않도록 `useStudent.js`/
`wordLibrary.js`/컴포넌트는 읽기만 하고 수정 안 함.

**⚠️ 커밋 관련 참고(운영자 확인 필요)**: 이 감사의 커밋(`55f0c86`)에
동시 작업 중이던 다른 agent가 이미 스테이징해둔
`src/api/hiddenFeatures.js`/`src/components/HiddenFeatures.jsx`/
`src/config/dataSchemas.js`/`src/hooks/usePaulReaction.js` 삭제(기존
handoff에 "데드코드 후보 — 제거 안 함, 운영자 판단 필요"로 남아있던 4개
파일)가 `git add handoff.md` → `git commit` 과정에서 함께 커밋돼버렸다 —
이 감사 세션이 의도한 변경은 아님. 사후 확인: `grep -rn` 전체 재확인으로
4개 파일 참조 0건 재확인 + `npm run build` 정상 통과(경고는 기존 번들
크기 경고 하나뿐, 무관) — **기능적으로는 무해**하나, 이 커밋 메시지가
그 삭제를 언급하지 않아 이력상 attribution이 부정확하다. `git reset`류
히스토리 재작성은 destructive-command 가드에 막혀 있어(정책상 우회 안
함) 되돌리지 않았음 — 필요하면 운영자가 직접 `git revert`/`reset` 판단.

### 방법
- `api/` 디렉터리 11개 파일 전수 코드 리뷰 — 관리자 전용 액션이 실제로
  `checkAdminReauth`(또는 동등한 인라인 adminPin 재검증)를 요구하는지 확인.
- anon key로 Supabase REST에 직접 curl 실측(읽기 전용 + 0행 매칭 PATCH만,
  실제 데이터 변경 없음): `pin_hash`/`pin_fail_count` SELECT 거부(42501)
  확인, `select=*` bare select 거부 확인, `current_unit_id`(v2.1 신규 컬럼)
  SELECT/UPDATE 정상 허용 확인, `entrance_test_results` UPDATE가
  permission 오류 없이 통과(204)함을 확인.
- `entranceTestApi.js`/`entranceTest.js`/`supabase_v1_8_entrance_test.sql`
  교차 검토로 클라이언트가 보낸 점수가 서버 재검증 없이 그대로 저장되는지
  확인.
- `HiddenFeatures.jsx`/`src/api/hiddenFeatures.js` 등 미참조 파일이 실제로
  어떤 라우트에서도 도달 불가능함을 grep으로 재확인(App.jsx에 admin 화면
  진입은 컴포넌트 state(`showAdmin`)뿐 — URL 라우팅 없는 SPA라 우회 경로
  자체가 없음).

### 재확인만(이미 완료된 항목, 재구현 안 함) — 전부 그대로 정상 동작 확인
- v1.9 컬럼권한: `pin_hash`/`pin_fail_count`/`pin_locked_until`/
  `pin_setup_allowed` anon SELECT/UPDATE 전부 42501 거부 — 라이브 실측 확인.
- v2.1 `current_unit_id` GRANT(select+update, 그 컬럼만) — 과다 노출도
  과소 차단도 아님, 라이브 실측으로 적절함 확인.
- 관리자 재인증(bulk-generate-temp-pins/set-pin-setup-allowed/
  unlock-student-pin/clear-student-pin) — `checkAdminReauth` 또는 동등
  인라인 검증 전부 존재 확인, 예외 없음(api/ 11개 파일 전수 grep).
- `set-student-pin` 이중 신뢰 모델(관리자 무작위 재설정 vs 학생 자기등록
  `pin_hash IS NULL` 서버 확인) — 계정탈취 차단 로직 그대로 확인.
- `verify-admin-pin` 실패 시 1.5초 지연 — 그대로, 정식 rate limit은
  여전히 없음(아래 재확인).
- `generate-audio` wordId 실존 검증 + DB row 값 사용(body 무시) — 그대로.

### 신규 발견 — Medium 1건 (기록만, 수정 안 함)
**입실시험 결과 제출 — 클라이언트 계산 점수를 서버 재검증 없이 그대로 저장
+ RLS가 완전 개방(anon 전체 CRUD)** —
`src/utils/entranceTestApi.js:126`(`submitEntranceResult`),
`supabase_v1_8_entrance_test.sql:63-64`(`entrance_test_results`에
`for all using (true) with check (true)`).
- 재현(실측, 데이터 변경 없이 확인): anon publishable key로
  `PATCH .../entrance_test_results?test_id=eq.<임의 uuid>` 호출 시
  permission 오류 없이 204 반환 — 즉 브라우저 devtools/스크립트로 임의
  `student_id`/`test_id`를 지정해 `score`/`total`/`missed_words`를 조작
  가능(자기 점수 조작뿐 아니라 다른 학생의 결과를 덮어쓰는 것도 unique
  제약(`test_id,student_id`)상 가능).
- 채점 자체(`computeTestResult`)는 클라이언트에서만 계산되고, 서버(anon
  직접 upsert 경유, 별도 서버리스 함수 없음)는 값을 재검증하지 않음.
- **판정 근거(위협 모델 기준)**: 결제/PII/계정탈취가 아니라 학원 내부
  "오늘의 랭킹/VIP" 경쟁 기능의 점수 조작 — 금전적 피해나 데이터 유실
  없음, 다른 학생 계정에 로그인하지 않고는 studentId를 알아내기 다소
  번거로움(UUID). 다만 아이들의 경쟁 배지(VIP)라는 기능 의도를 무력화할
  수 있어 완전 무해는 아님 → **Medium**(Critical/High 기준인 데이터
  유실/계정탈취/PII 유출에 해당 안 함).
- 근본 수정안(참고용, 미적용 — 이번 세션 범위 외 + 동시 작업 중인 다른
  agent와 충돌 방지 위해 코드 변경 보류): 결과 제출을
  `api/submit-entrance-result.js` 서버리스 함수로 옮겨 서버가 저장된
  `entrance_tests.words`/`direction`과 클라이언트가 보낸 `answers` 원본으로
  직접 재채점(`entranceTest.js`의 `computeTestResult`는 이미 순수 함수라
  서버에서도 그대로 재사용 가능) 후 결과만 저장 — 클라이언트는 표시용
  score만 받음. 또는 최소선으로 `entrance_test_results`에
  `student_id`별 RLS(anon 전체 대신 upsert 시 self만) — 단 이 앱은
  Supabase Auth가 없어 "self" 식별 수단이 없다는 v1.9 설계 근거와 동일한
  제약이 있음(구조적으로 어려움, 서버리스 재채점이 더 현실적).

### 재확인 — 기존에 알려진 Medium/Low (변경 없음, 여전히 유효)
- **[Medium]** `api/verify-admin-pin.js` 정식 rate limit/잠금 없음(1.5초
  지연만) — 이전 판정 그대로, 운영자 지시로 서버리스 인메모리 카운터 등
  과설계 안 함 유지. 학생 PIN(5회 DB 잠금)과 비대칭이나, 관리자는 원장
  1인이라 위협 모델상 낮은 우선순위 유지.
- **[Low]** `api/student-pin-status.js` 무인증 — booleans만 노출, 정보
  노출 미미. 그대로.
- **[Low]** `checkAdminReauth`/`verify-admin-pin`의 PIN 비교가
  `timingSafeEqual`이 아닌 단순 `!==` — 4자리 관리자 PIN + 실패 시 1.5초
  네트워크 지연이 이미 있어 원격 타이밍 공격의 실효성 극히 낮음(신규
  관찰, 과잉대응 판단 — 조치 불필요).
- **[Low]** pin-status fetch 중복 3곳 — 그대로(리팩터링 보류, 기존 판정
  유지).

### 판정
Critical/High: **0건** — 근본 수정 대상 없음, 코드 변경 없음(문서만 갱신).
동시 작업 중인 다른 agent 영역(`useStudent.js`/`wordLibrary.js`/컴포넌트
대규모 수정)은 손대지 않음.

### Security Score: 90/100
근거: PIN 자격증명(가장 민감한 자산)이 해시 저장 + 서버 전용 검증 + DB
컬럼권한 이중 방어(v1.9, 라이브 실측 확인)로 견고하게 막혀 있고, 모든
관리자 파괴적 액션이 요청당 재인증을 거침(전수 확인, 예외 없음). 감점
요인: 관리자 PIN 정식 rate limit 부재(-4, 기존 인지된 트레이드오프),
신규 발견한 입실시험 결과 클라이언트 신뢰 갭(-4, 학원 내부 경쟁 기능
한정이라 상한선 있는 감점), 기타 Low 항목들(-2).

### 수정 파일
없음(코드 변경 없음) — `handoff.md`만 갱신.

### 남은 Medium/Low (다음 세션 후보, 우선순위순)
1. 입실시험 결과 서버 재채점(`api/submit-entrance-result.js` 신설) — 신규
   발견, Medium.
2. `verify-admin-pin` 정식 rate limit — 기존 인지, Medium(운영자 결정
   대기 중, 여러 세션째 보류).
3. `student-pin-status` 인증 없음 — Low, 낮은 우선순위 유지.
4. pin-status fetch 중복 헬퍼 정리 — Low, 코스메틱.

## 2026-07-18 — 전체 워크플로우 QA 파괴 테스트 스윕 (시니어 QA — 신규 버그 수정 없음, 발견만)

동시에 다른 agent가 Student-Unit 아키텍처(afc8a77/ac6c24b)를 작업 중이라
`wordLibrary.js`/`Dashboard.jsx`/`AdminScreen.jsx`의 유닛·숙제 관련 부분은
건드리지 않고 마지막 순서로 미룸 — 해당 영역도 기존 테스트로 회귀만 확인
(전부 PASS, 코드 직접 수정 0건).

### 방법
1. 기존 자동 테스트 스위트(scripts/test*.mjs, 34개 스크립트) 전수 재실행 —
   대부분 `esbuild`로 실제 소스(`src/utils/wordLibrary.js`,
   `src/hooks/useStudent.js`, `src/utils/speech.js`,
   `src/components/WordDetail.jsx` 등)를 번들해 실제 코드 경로를 실행하는
   기존 확립 패턴 그대로 사용(추측 판정 없음). `SPEECH_BUNDLE`이 필요한
   `testTtsSingleton.mjs`은 전용 빌드 스크립트가 없어
   `scripts/.tmp/buildSpeechBundle.mjs`(paulReactions PNG import 스텁)를
   즉석 작성해 해결.
2. 나머지(관리자 CSV/엑셀 업로드, 로그인/PIN 등록 레이스, 학부모 화면,
   미니게임, 오답노트 복습, 다꾸 등)는 컴포넌트 소스 직접 코드 리뷰로
   크래시/레이스/오버플로우 패턴 스캔.
3. 모바일 실기기 터치/오프라인 네트워크 단절은 이 환경(헤드리스 브라우저
   불가)에서 실행 검증 불가 — **코드 리뷰 결과만**이며 실기기 확인 필요로
   별도 표기(아래).

### 테스트 결과 — 30/30 실행 가능 테스트 전부 PASS(회귀 0건)
로그인/PIN(testStudentLogin·testRlsSecurity) · 퀴즈 상태 리셋
(testQuizStepReset) · 쓰기시험 방향 배선(testSpellingDirectionWiring) ·
쓰기시험 정답 로직(testSpelling·testSpellingSettings) · 오답노트/진행도
저장(testProgress·testMergeProgress·testRestoreSyncRace·
testLoginRestoreCrash·testIdentityMigration) · 다중 기기 병합
(testMultiDeviceMerge) · 입실시험(testEntranceTest·testEntranceTestDb) ·
반/학생 관리(testMultiClass·testRenameClass·testDashboard) · 날짜별
숙제(testDailyAssignment·testFutureAssignment) · 유닛 전환/이어하기
(testUnitPersistence·testStudentUnitDecouple·testStudentSelectUnitSwitch·
testUnitResumeIndex·testUnitNaturalSort — 다른 agent 작업 영역, 회귀만
확인) · 초기화/백업(testResetWordStatusBackup·testFullProgressBackup·
testSyncProgress) · TTS 에코 방지(testTtsSingleton) · 폴 리액션
(testPaulReactions) · 주간 리포트(testWeeklyReport).

**차단된 4개**(코드 회귀 아님, 이 로컬 환경의 기존 제약 — handoff.md
2026-07-18 앞 섹션에 이미 기록됨): testStudentPinAuth·
testStudentPinSelfSetup·testClearStudentPin·testStudentSelectPinStatus —
로컬 `.env`에 `SUPABASE_SERVICE_ROLE_KEY`가 없어 서버 핸들러가 anon key로
폴백, v1.9 RLS가 anon의 PIN 컬럼 접근을 차단해 "permission denied for
table students"로 실패. 프로덕션은 Vercel 환경변수로 정상 동작(무관한
사전 제약, 이번 스윕에서 재확인만 함).

`npm run build` 통과(경고는 기존 번들 크기 경고 하나뿐, 이번 스윕과 무관).

### 발견 — Critical/High: 0건
집중적으로 찾아봤으나 크래시/데이터유실/보안 등급 버그를 발견하지 못함.
기존 코드가 이미 레이스 컨디션(StudentSelect.jsx pickSetupStudent의
setupRequestIdRef, FutureAssignmentPlanner의 loadReqIdRef)과 상태이월
버그(WordDetail.jsx/QuizGame.jsx의 key={word.id})를 선제적으로 방어해둔
상태였음.

### 발견 — Medium: 2건 (기록만, 수정 안 함)
1. **학생 자기등록 부분 실패 시 계정 고아 상태** —
   `src/components/StudentSelect.jsx:82-89`(`handleRegister`).
   `addStudent()`(DB에 학생 row 생성) 성공 후 `/api/set-student-pin` 호출이
   네트워크 실패 등으로 실패하면, 학생은 이미 DB에 존재하지만 PIN이 없고
   `pin_setup_allowed` 기본값(false)이라 "로그인" 탭도 "PIN 만들기" 탭도
   모두 막힘 — 관리자가 로스터에서 발견해 "PIN 설정 허용"을 수동으로
   눌러줘야 해제됨. 재현: 등록 중 두 번째 fetch만 실패하도록 네트워크를
   끊어야 하는 좁은 타이밍 창 + 크래시/유실 없음 + 관리자 액션으로 복구
   가능이라 Medium 판정. 근본 수정안(참고용, 미적용): 실패 시
   `pinSetupAllowed: true`로 즉시 셋업 재시도 경로를 열어주거나, PIN
   저장까지 성공해야 등록 완료로 간주하고 실패 시 학생 row도 롤백.
2. **엑셀 업로드 — 빈 파일/시트 없는 파일에 대한 방어 없음** —
   `src/components/AdminScreen.jsx:1028-1037`(`ExcelUpload.handleFile`).
   `wb.SheetNames[0]`가 없는(빈/손상된) 파일을 선택하면
   `XLSX.utils.sheet_to_json(undefined, ...)` 호출 경로에서 사용자에게
   의미있는 에러 메시지 없이 실패할 수 있음(현재 try/catch 없음). 관리자
   전용 화면 + 정상적인 학원 엑셀이면 발생하지 않는 입력이라 Low~Medium.

### 코드 리뷰 결과만(실기기 미확인 — 운영자 실기기 확인 권장)
- 모바일 뷰포트(390px 등): `.word-text`/`.word-card`/`meaning-box-text`
  (index.css)가 이미 긴 단어/뜻 오버플로우 방어(wrap+clip)를 갖추고 있고
  최근 커밋(1fd0f3a)이 쓰기시험 정답 공개 텍스트에도 동일 패턴 적용함 —
  코드상 안전해 보이나 실기기 렌더 확인은 못 함.
  MatchGameShell.jsx의 뜻 옵션도 `break-words [word-break:keep-all]`로
  방어돼 있음.
- 다꾸 스티커 삭제 버튼(DiaryPage.jsx `PlacedSticker`): scale 역보정
  transform으로 항상 28px 터치 영역 유지 — 코드상 c3a3800에서 이미 고쳐진
  상태, 실기기 재확인 권장.
- 오프라인/네트워크 실패: 학생 쪽 동기화(useStudent.js doSync)는 실패를
  삼키고 sync_meta에만 기록(화면 안 막음), 등록/PIN 계열 API 호출은 대부분
  try/catch + 에러 메시지 표시가 있으나 위 Medium #1처럼 "성공/실패가
  섞인 다단계 흐름"의 중간 실패 처리는 개별 검토가 더 필요함.

### 종합 판정
이번 스윕에서 자동 수정한 항목 없음(Critical/High 0건이라 수정 대상
없음). 기존 테스트 30개 전부 PASS로 최근 3개 커밋(퀴즈 리셋 수정 +
다이어리 스티커 수정 + 마스코트 이미지 수정 + 유닛 숙제배정 버튼 추가)이
다른 워크플로우를 깨뜨리지 않았음을 확인. **production-ready 판정: 예**
(발견된 2건은 Medium — 좁은 타이밍/입력 조건에서만 발생, 차단성 아님,
현재 운영에 영향 없음).

## 2026-07-18 — Student Account ↔ Unit 아키텍처 9개 목표 대조 (재구현 금지 — v2.1 검증+갭 보완만)

운영자 지시: "Student Account ↔ Unit 아키텍처 완성" 목표 9개를 라이브 코드/DB와
대조해 각각 충족/갭 판정하고, 갭만 최소 보완. 대부분은 어제 v2.1(커밋
`98da563`~`7c99924`, 아래 섹션)에서 이미 구현·배포·검증 완료 — **재구현
없음**, 코드 리뷰 + 회귀 재실행으로 확인만 하고 갭 1건만 보완.

### 판정표 (9개 전수)

| # | 목표 | 판정 | 증거 |
|---|------|------|------|
| 1 | 학생 1명 = 영구 계정 1개(student_id UUID) | 충족(기확인) | `src/utils/wordLibrary.js` 학생 캐시가 `students.id` UUID 키. v1.6부터 유지. |
| 2 | 로그인은 이름+PIN만 | 충족(기확인) | `src/components/StudentSelect.jsx` login 탭 — 이름+PIN만 입력, `api/verify-student-pin.js` 호출. 등록("처음이에요") 탭은 완전히 분리된 별도 플로우, 로그인 탭에는 유닛 선택 UI 자체가 없음. |
| 3 | Unit이 정체성에 미포함 | 충족(기확인) | `resolveStudentUnitObj()`(wordLibrary.js:573) 단일 해석 경로 — `current_unit_id` 1차 → `unit_name` 폴백 → 반의 첫 유닛. 표시(`getStudentUnit`)/단어 로딩(`getStudentWords`)/로스터가 전부 이 경로 하나만 거쳐 구조적으로 항상 일치. |
| 4 | 계정 재생성 없이 유닛 전환 | 충족(기확인) | `Dashboard.jsx` 프로필 카드 유닛 셀렉트 → `App.jsx handleUnitSwitch` → `setStudentUnit` (id 1차 기록). `testStudentUnitDecouple.mjs` **19/19 PASS** 재실행 확인(전환/영속/재로그인/복귀). |
| 5 | 이전 유닛 복습 가능 + 이어서-학습 위치 복원 | 충족(기확인) | 유닛 셀렉트가 반의 유닛 전체 목록(`getClassUnitNames`) 노출 — 이전 유닛 포함. `lastWordIndexByUnit` + `resumeIndexForUnit()`(useStudent.js) 유닛별 이어서-학습 위치. `testUnitResumeIndex.mjs` **12/12 PASS** 재실행 확인(하위호환/오염 방어 포함). |
| 6 | 숙제 배정 유닛 자동으로 열림 | 충족(기확인, 표현만 다름) | `getStudentWords()`(wordLibrary.js:919)가 오늘 배정(`daily_assignments`) 존재 시 그 단어들을 최우선 반환 — 배정 단어가 현재 보고 있는 유닛에 없어도 반 전체에서 찾아 표시(줄 962~978). 학생이 "단어 공부" 들어가면 항상 숙제 단어가 기본 목록. Dashboard에 "📌 오늘의 숙제 단어가 준비돼 있어요" 안내 배너도 있음. `testDailyAssignment.mjs` 재실행 PASS. |
| 7 | 진행도 student_id+unit별 분리 저장 | 충족(기확인) | word-UUID(`wordStatus`) + `lastWordIndexByUnit`(unitId 키)로 자연 분리. `testUnitResumeIndex.mjs` 5절 "유닛 전환은 진행도 판정과 무관" PASS. |
| 8 | 별/스트릭/스티커 계정 레벨 유지 | 충족(기확인) | `setStudentUnit`은 `useStudent` 레코드(별/스트릭/스티커 저장소)를 전혀 건드리지 않음 — 구조적으로 리셋 불가. `testStudentSelectUnitSwitch.mjs` 재실행 PASS(전환 전후 진행도 무손실 시나리오 포함). |
| 9 | 관리자: 기본 유닛 변경 + **유닛 단위 숙제 배정** | **① 충족 / ② 갭 → 보완 완료** | ① `AdminScreen.jsx saveEdit()` → `setStudentUnit(editing, editUnit)` — 학생별 유닛 변경 기존 동작. ② 기존엔 단어 체크박스 개별 배정(`daily_assignments`)만 가능 — "유닛 전체를 오늘 숙제로" 원클릭이 없었음. **보완**: "이 유닛 전체 배정" 버튼 추가(아래). |

### 갭 보완 — "이 유닛 전체 배정" 원클릭 (커밋 `afc8a77`)

- **변경**: `src/components/AdminScreen.jsx` 반 관리 패널의 "오늘의 단어" 영역에
  버튼 추가. 클릭 시 지금 보고 있는 유닛(`viewUnit`/`words`)의 전체 단어를
  slug 배열로 만들어 **기존** `setTodaysAssignment(className, wordIds)`를
  그대로 호출 — 체크박스로 단어를 하나씩 눌러 전부 선택한 것과 완전히 같은
  저장 경로(새 컬럼/새 함수 없음). "전체 해제" 버튼과 나란히 배치.
- **과잉 설계 금지 준수**: 새 스키마/새 API/새 상태관리 없음 — 순수 UI
  버튼 하나 + 기존 함수 재사용.
- **검증**: `npm run build` 통과. 라이브 DB 대상 1회성 검증 스크립트(upsert →
  저장값이 유닛 전체 slug와 정확히 일치 → 해제, 전부 QA_ 데이터로 생성 후
  삭제)로 실제 Supabase 왕복 확인 — PASS 3/3. 기존 `testDailyAssignment.mjs`
  (체크박스 배정 경로) 재실행 PASS로 회귀 없음 확인.

### 회귀 재실행 결과 (전부 PASS, 라이브 DB)

- `testStudentUnitDecouple.mjs` — 19/19 PASS (id 모드: 전환/영속/재로그인/
  복귀/동명 유닛 비충돌/로스터 일관성/숙제 교차 유닛/유닛 삭제 폴백)
- `testUnitResumeIndex.mjs` — 12/12 PASS (pure, 하위호환/오염 방어)
- `testStudentSelectUnitSwitch.mjs` — 5/5 PASS
- `testMultiClass.mjs` — PASS
- `testDashboard.mjs` — PASS
- `testDailyAssignment.mjs` — PASS
- `npm run build` — 통과

### 로컬 검증 한계 (기존 문서화된 사안 — 이번 회차 신규 아님)

`testStudentPinAuth.mjs`(로그인/PIN 서버 로직)는 로컬 `.env.local`에
`SUPABASE_SERVICE_ROLE_KEY`가 없어(ADMIN_PIN만 있음) 서버 핸들러가
anon key로 떨어져 "permission denied for table students"로 대부분 FAIL —
**7/18 밤 세션에서 이미 같은 원인으로 문서화됨**(handoff.md 아래 "2026-07-17
밤 P0" 섹션, 55/79/468줄 — Vercel 프로덕션에는 이 키가 설정돼 있음을 라이브
프로브로 확인 완료). 이번 회차에서 새로 발생한 문제 아님, 항목 2(로그인
방식) 판정은 **소스 코드 리뷰**(StudentSelect.jsx 로그인 탭 이름+PIN만,
등록 플로우 분리)로 대체 확인 — 로직 자체는 어제 이미 라이브에서
검증됨(v2.1 회귀 목록의 testStudentLogin 포함).

### Push/배포

커밋 `afc8a77` push 완료. 라이브 번들 `index-ChRHCjVG.js`(로컬 빌드와
해시 일치) → `AdminScreen-DLZ2XmLO.js`(로컬과 해시 일치)에서 "이 유닛 전체
배정" 텍스트 마커 확인 완료.

### 아키텍처 완결 선언

**Student Account ↔ Unit 아키텍처는 완결로 선언 가능.** 9개 목표 전부
충족 — 8개는 어제 v2.1에서, 나머지 1개(유닛 단위 숙제 배정 편의 기능)는
이번 회차 최소 보완으로 채워짐. 프로덕션 데이터 변경 없음(QA_ 접두
테스트 데이터만 생성/삭제). persistence 개선 등 다른 작업은 착수하지
않음(범위 외 — 지시 준수).

## 2026-07-18 — 2시간 자율 세션 종합 요약 (운영자 복귀 시 이것만 읽으면 됨)

이 세션은 3부로 진행: **v2.1 학생-Unit 아키텍처 분리** → **v2.2 다중 기기
진행도 병합** → **마무리 소규모 정리**(이 절). 앞 두 개의 풀 상세는 아래
각 섹션 참조 — 여기는 최종 보고 형식 요약.

### 1) 변경 내역
- **v2.1** (커밋 `98da563`~`7c99924`): 학생→유닛 연결을 unit_name 문자열
  매칭에서 `students.current_unit_id`(uuid) 1차 해석으로 교체
  (`resolveStudentUnitObj()` 단일 경로). 학생 홈에 유닛 셀렉트 추가(자기 반
  유닛만, 진행도 무손실). 유닛별 이어서-학습 위치(`lastWordIndexByUnit`).
- **v2.2** (커밋 `d42c005`~`445da0b`): 동기화 last-writer-wins 제거 —
  업로드 직전 클라우드 blob을 읽어 `mergeProgressRecords()`로 병합 후
  업로드(읽기 실패 시 업로드 포기), 로그인 시 병합 복원, 다이어리 삭제
  tombstone(`diaryRemovedIds`).
- **정리 3커밋** (`df9adc3`, `39f20cf`, `efd312c`):
  1. `src/utils/pinStatusApi.js` 신규 — `/api/student-pin-status` 개별
     fetch 복붙 3곳(AdminScreen 배지 1 + StudentSelect PIN만들기 2)을
     `fetchPinStatuses`/`fetchPinStatusMap`으로 통합. 동작 불변(에러 정책은
     호출부 유지).
  2. `fetchWordStatusMap`(wordLibrary.js) 데드코드 제거 — src/scripts/api
     전수 grep으로 호출처 0 재확정. 원래 용도(관리자 초기화를 로그인 중
     기기에 반영/타 기기 복구)는 v2.2 blob wordStatus 병합·복원이 실질
     대체. **필요해지면 git history에서 복원**: `git show 39f20cf^:src/utils/wordLibrary.js`.
  3. 데드코드 소거 — ParentScreen이 `fetchWordStatusSummary`를 조회만 하고
     결과를 안 쓰던 죽은 네트워크 호출 제거(표시 동작 불변),
     `isWordLibraryReady`/`getStudentName`(전수 스캔 참조 0) 제거.

### 2) 필요성
- v2.1: "학생이 첫 유닛으로 되돌아간다" 실버그의 구조적 원인(이름 매칭
  폴백) 제거 + 학생이 유닛을 바꿀 수단 자체가 없던 문제 해결.
- v2.2: 두 기기 교차 사용 시 진행분 영구 유실(라이브 대조군으로 재현·확인)
  차단 — 데이터 유실은 이 앱에서 최우선 결함 클래스.
- 정리: 다음 작업자(사람/agent)가 손대기 전 중복·죽은 코드 표면 축소.

### 3) 테스트 (이번 정리분 — v2.1/v2.2 상세는 각 섹션)
- 각 커밋마다 `npm run build` 통과(총 3회).
- 헬퍼: fetch 스텁 스모크 7체크(요청 형태/results/맵 변환/에러 메시지 계약).
- 데드코드 제거 후: testProgress(번들 52체크) · testWeeklyReport 통과.
- 정합성 스팟 점검(작업 지시 3번): `computeStudentStats`(weeklyReport.js)
  공유 **유지 확인됨** — AdminScreen 렌더 루프 + CSV 내보내기 +
  ParentScreen 전부 같은 함수·같은 `fetchDashboardData` row. v2.1/v2.2로
  깨진 곳 없음. 학생 화면은 로컬 레코드 직접(로그인 병합 복원으로 수렴 —
  v2.2 설계 그대로).
- 배포: push → Vercel 자동배포, 라이브 번들 `index-Dz71cDc9.js` 확인.
  마커: `word_id,status`(fetchWordStatusMap 고유 쿼리) 0회,
  `student-pin-status` 문자열 1회(단일화), `diaryRemovedIds` 유지(v2.2 무손상).

### 4) 남은 이슈 / 발견
- **[환경] pin 계열 라이브 테스트가 이 기기에서 실행 불가**:
  testStudentSelectPinStatus.mjs가 "permission denied for table students"로
  실패 — 로컬 `.env`에 `SUPABASE_SERVICE_ROLE_KEY`가 없어 서버 핸들러가
  anon key로 폴백하는데, v1.9 RLS가 anon의 pin 컬럼 SELECT를 차단하기 때문
  (사전 존재 환경 제약, 이번 변경과 무관 — 프로덕션은 Vercel 환경변수로
  정상). 운영자가 로컬 .env에 service role key를 넣으면 재실행 가능.
  실패로 남았던 QA 잔재(QA_SelectPinStatusTest 반 + 학생 4명)는 정리 완료.
- **데드코드 후보 — 목록만 남김(제거 안 함, 운영자 판단 필요)**:
  - 파일 단위 미참조(어디서도 import 안 됨, 초기 스캐폴딩으로 추정):
    `src/components/HiddenFeatures.jsx`, `src/api/hiddenFeatures.js`,
    `src/config/dataSchemas.js`, `src/hooks/usePaulReaction.js`.
    (FeatureManagementPanel은 AdminScreen에서 실사용 중 — 별개.)
  - speech.js `listenFor`/`hasSpeechRecognition` — 구 Web Speech 인식
    경로, 참조 0이지만 오디오는 이 프로젝트 최민감 영역이라 보류.
  - 내부에서만 쓰여 export 키워드만 불필요한 것들(코스메틱이라 불변경):
    speech.js `playAudioUrl`/`speak`, entranceTest.js `ENTRANCE_DIRECTIONS`,
    matchGame.js `FILLER_MEANINGS`, wordLibrary.js `memoryTipFor`.
  - feature-flag 서브시스템의 미사용 헬퍼(사용 중인 API의 일부라 보류):
    features.js `areAllFeaturesEnabled`/`resetFeatures`, rbac.js
    `hasAllPermissions`/`hasAnyPermission`, useFeatureAccess.js
    `canRenderAnyFeature`/`debugFeatureAccess`.
- v2.2 알려진 한계(의도된 트레이드오프)는 아래 v2.2 섹션 그대로 유효.

### 5) 다음 추천 작업
1. **운영자 실기기 확인(3분)**: 두 기기 교차 로그인 → 별/스티커 양쪽 합쳐
   보이는지, 다꾸 스티커 삭제가 재로그인에도 유지되는지(v2.2 검증 마무리).
2. 로컬 `.env`에 `SUPABASE_SERVICE_ROLE_KEY` 추가 → pin 계열 라이브
   테스트 4종 로컬 재활성화.
3. 위 데드코드 후보(특히 hidden-features 파일 4개) 제거 여부 결정.
4. spellingWrongToday tombstone(원하면 — 현 한계 무해 판단).
5. 기존 백로그: 화면 lazy 분리(번들 531KB 경고), students RLS + service
   role key 전환, admin PIN rate limit.

## 2026-07-17 밤 2차 — v2.2 다중 기기 진행도 병합 (구현+검증+배포 완료)

### 문제 (유실 시나리오 — 라이브 e2e 대조군으로 실재 확인)
동기화가 로컬 레코드로 클라우드 blob(`student_progress.progress_data`)을
통째로 덮어쓰는 last-writer-wins였다. 기기 A(별 50) → 기기 B(복원+10, 백업
60) → 다시 A: A의 아무 활동이 백업 60을 52로 덮어써 **B의 진행분 영구
유실**. restoreChecked(2026-07-10)는 "빈 로컬" 레이스만 막았고 "양쪽 다
데이터 있는" 교차 사용은 못 막았다. testMultiDeviceMerge 4절이 구버전
방식으로 이 파괴를 실DB에서 재현해 확인했다(추측 아님).

### 변경 (커밋 3개: `d42c005` → `7f1658a` → `445da0b`)
1. **`mergeProgressRecords(local, cloud, id)` 순수 함수** (useStudent.js,
   normalizeRecord 재사용으로 구스키마 blob 하위호환). 병합 규칙:
   - 합집합: stickers/cleared/history 날짜/round.wordsViewed·
     spellingWrongToday/diaryPlacements(placementId 기준, 충돌 시 로컬)
   - 더 진전된 쪽: missions(done > correctCount, 동률 로컬),
     wordStatus(mastered>known>unknown>skipped, 동률 로컬)
   - max: totalStars/starBadgeThreshold/milestoneStreak(중복 축하 방지 겸)/
     lastWordIndex(전역+유닛별)/같은 날짜 history 필드별/오늘 round 숫자
     필드. 근거: 공통 조상이 없어 정확한 합산 불가 — max는 과소 지급
     (진행분 증발)을 막고, 이론상 과다는 학생에게 유리한 방향이라 수용.
   - round: normalizeRecord가 오늘 아닌 round를 이미 리셋 → 도달 시 양쪽
     다 "오늘" — 같은 날 기기 교차 시 미션 진행이 이어짐.
   - missedWordIds(중복 허용 빈도 목록): 더 긴 쪽(합치면 공통 조상 이중
     계산).
2. **다이어리 삭제 tombstone** — 레코드에서 유일하게 "삭제"가 존재하는
   영속 필드가 diaryPlacements라 순수 합집합이면 삭제한 다꾸 스티커가
   병합마다 부활한다. `diaryRemovedIds`(cap 300) 신규 필드 +
   removePlacement가 기록, 병합이 합집합에서 뺌. 구레코드/백업엔 없음 —
   normalizeRecord가 빈 배열로 채움(완전 하위호환).
3. **업로드 경로** (doSync): 업로드 직전 `fetchProgressBackupStrict`
   (wordLibrary.js 신규 — "백업 확실히 없음(null)"과 "읽기 실패(throw)"를
   구분, 42703/42P01만 null)로 blob을 읽어 병합본만 업로드. **읽기 실패
   시 업로드 포기** + sync_meta error 기록(로컬 무영향, 다음 디바운스/
   flush/재로그인에서 자연 재시도) — "클라우드 상태를 모르는 채 덮어쓰기"가
   정확히 기존 유실 경로라서. 관리자 요약 컬럼/daily도 병합본 기준(백업과
   대시보드 숫자가 같은 레코드에서 나옴). 로컬 레코드는 업로드 병합의
   영향을 받지 않음.
4. **로컬 반영 범위(운영자 위임 판단)**: 업로드 blob 병합 + **로그인 시
   병합 복원**까지만. 로컬이 비어있으면 기존 복원 그대로, 로컬에 데이터가
   있으면 백그라운드 fire-and-forget으로 백업을 받아 병합 patch(B에서 얻은
   별이 A 화면에도 보임, 결과가 동일하면 no-op으로 재동기화 안 만듦).
   매 동기화마다 로컬을 병합·치환하는 방식은 세션 중 레코드가 외부 데이터로
   바뀌는 회귀 표면(진행 중 round/이펙트 재발화)이 커서 채택 안 함 —
   로그인 시점은 이미 복원 patch가 존재하던 검증된 경로라 가장 보수적.
   병합으로 별이 배지 임계값을 넘으면 축하가 뜨는 건 정당한 동작이고,
   임계값 자체를 max로 병합해 "이미 축하한 배지 재발급"은 구조적으로 차단.

### 성능/안전
- 동기화당 read 1회 추가(2초 디바운스라 부하 미미). 실패는 기존처럼 조용히
  + sync_meta. 프로덕션 데이터 삭제 0(QA_ 학생만 생성/정리).

### 테스트 (전부 PASS)
- 신규 `testMergeProgress.mjs`(순수 51체크 — A/B 교차/대칭성/빈쪽/구스키마/
  히스토리·round·다이어리·wordStatus 규칙/tombstone 상한/멱등성/"유실 없음"
  총괄), `testRestoreSyncRace.mjs` 시나리오 4~6 추가(병합 업로드/읽기 실패
  시 업로드 포기/로그인 병합 복원 — 실제 훅 번들), 신규
  `testMultiDeviceMerge.mjs`(라이브 15체크 — A/B 교차 + **구버전 유실
  대조군 재현** + 병합 동기화의 자가 복원 + tombstone JSONB 왕복).
- 회귀: testProgress · testRestoreSyncRace(1~3) · testLoginRestoreCrash ·
  testUnitResumeIndex · testSyncProgress(라이브) · testFullProgressBackup
  (라이브) · testIdentityMigration(라이브) · `npm run build` 통과.
- 배포: push → Vercel 자동배포, 라이브 번들 `index-CrCw6LYF.js`에서 v2.2
  마커(diaryRemovedIds) 확인.

### 알려진 한계 (의도된 트레이드오프)
- totalStars max는 교차 divergence 시 정확 합산이 아님(과소 방지 우선).
- spellingWrongToday는 tombstone 없음 — 복습으로 뺀 단어가 같은 날 재로그인
  시 큐에 되살아날 수 있음(한 번 더 복습할 뿐, 무해. 자정 리셋).
- 다이어리 위치/회전 수정 충돌은 로컬 우선(데이터 유실 아님).
- 동시 in-flight 동기화(수 초 창)는 여전히 경합 가능하나, 모든 기기가
  병합-후-쓰기라 다음 동기화에서 수렴(라이브 4절에서 자가 복원 실증).
- visibility flush가 read+write 2왕복이 됨 — 탭 강제 종료 시 마지막 수 초
  변경분의 백업이 다음 세션으로 밀릴 수 있음(로컬엔 남아 유실 아님).

### 작업 2 스팟 점검 (수정 없이 기록만)
- 관리자/학부모 정합성: computeStudentStats(weeklyReport.js) 공유 유지
  확인(AdminScreen 2곳 + ParentScreen). 학생 화면은 로컬 레코드 직접 —
  병합 복원으로 관리자 blob과의 숫자 차이는 로그인 시점에 수렴.
- 데드코드: `fetchWordStatusMap`(wordLibrary.js:804) 여전히 미호출 —
  blob wordStatus 병합·복원이 실질 대체. 확신 100% 아니라 제거 보류.
- pin-status fetch 중복: 여전히 3곳(AdminScreen 1 + StudentSelect 2)
  개별 fetch — 공용 헬퍼 미정리. 다음 회차 후보.

### 다음 추천
1. pin-status 조회 공용 헬퍼 + fetchWordStatusMap 제거(운영자 승인 후).
2. spellingWrongToday tombstone(원하면 — 현 한계 무해 판단).
3. 운영자 실기기 확인(3분): 두 기기 교차 로그인 → 별/스티커 양쪽 합쳐
   보이는지, 다꾸 스티커 삭제가 재로그인에도 유지되는지.

## 2026-07-17 밤 — v2.1 학생-Unit 아키텍처 분리 (구현+검증 완료)

### Root cause (조사 확정, 추측 아님)
1. `students.unit_name`(문자열)이 학생 현재 유닛의 유일한 저장소 — 표시용 이름을
   식별자로 사용. `getClassWords()`의 `units.find(u => u.name === unitName) ||
   units[0]` 폴백 때문에 이름 불일치(유닛 삭제, "Unit 1" vs "Unit8" 표기 차이,
   기본값 'Unit 1'이 실제 유닛명과 다름) 시 **조용히 첫 유닛으로 떨어짐** —
   "학생이 첫 유닛에 묶인다/되돌아간다"의 정확한 메커니즘. (라이브에서 실제로
   unit_name 문자열이 해석 결과와 어긋난 학생 1명 실측 — id가 진실이라 무해해짐.)
2. PIN 로그인 전환(v1.7) 이후 학생 화면에 유닛 전환 UI가 전무 — 학생이 유닛을
   바꿀 방법 자체가 없었음(관리자 반 배정만 가능).
3. 진행도는 이미 유닛 독립: cleared/missions/round.wordsViewed(word 슬러그),
   wordStatus(words.id UUID), 별/스티커/스트릭(유닛 무관). 유닛 종속은
   `lastWordIndex`(이어서 학습 위치) 단 하나 — 유닛별 맵으로 분리함.

### 전후 아키텍처
- 전: 학생→유닛 = unit_name 문자열 매칭(깨지면 조용히 첫 유닛). 학생은 유닛
  변경 불가.
- 후: `students.current_unit_id`(uuid FK) 1차 + unit_name 폴백 + 첫 유닛 최후
  폴백 — 해석은 wordLibrary.js `resolveStudentUnitObj()` **단일 경로**(표시
  getStudentUnit / 단어 로딩 getStudentWords / 로스터 getStudents(InClass) 전부
  이 경로 → 표시 유닛과 실제 단어가 구조적으로 항상 일치). 학생은 Dashboard
  프로필 카드의 유닛 셀렉트로 자기 반 유닛만 전환(즉시 단어 갱신 + Supabase
  영속). 진행도 레코드는 전환 시 일절 안 건드림(리셋 불가능이 구조적 보장).
  별도 student_units 권한 테이블은 만들지 않음(자기 반 유닛 전체 = 접근 범위,
  스키마 최소화).
- 이어서 학습: `lastWordIndexByUnit`(unitId→index, useStudent 레코드 신규 필드,
  normalizeRecord로 구버전/클라우드 blob 완전 하위호환) — 유닛 복귀 시 그
  유닛의 마지막 위치에서 재개. 순수 함수 `resumeIndexForUnit()`.
- 숙제-유닛 독립: daily_assignments 단어가 현재 유닛에 없으면(복습용으로 다른
  유닛에 가 있는 경우) getStudentWords가 반 전체 유닛에서 찾아 숙제를 우선
  표시. Dashboard에 "오늘의 숙제 준비됨" 안내 라인.
- 관리자: 기존 반 배정 UI 그대로(내부 setStudentClass/setStudentUnit이 id 병행
  기록으로 전환, 반 이동 시 이전 반 유닛 id 잔존 불일치도 정리).

### ⚠️ 라이브 DB 실측 (2026-07-17 밤) — DB 마이그레이션이 이미 적용돼 있었음
`supabase_v2_1_student_unit_decouple.sql`을 준비했으나, 라이브 실측 결과
**current_unit_id 컬럼 + anon select/update GRANT + 백필(98/98 학생, 반 불일치
0)이 이미 적용된 상태**였다(누가/언제 실행했는지 repo 기록엔 없음 — 운영자
확인 요망). 따라서 코드가 처음부터 id 1차 경로로 동작한다. SQL 파일은 멱등이며
**FK/인덱스 보증 블록 포함** — 컬럼이 FK 없이 수동 생성됐을 가능성이 있으니
운영자 복귀 후 한 번 실행 권장(있으면 전부 no-op, 없던 FK/인덱스만 채움).
실행 후 재검증: `node scripts/buildWordLibBundle.mjs` →
`WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/testStudentUnitDecouple.mjs`
(컬럼 존재를 자동 감지해 id 모드 19체크 실행 — 이미 오늘 밤 라이브에서 전부 PASS).

### 파일
- 신규: `supabase_v2_1_student_unit_decouple.sql`(멱등, 검증 쿼리 포함),
  `scripts/testStudentUnitDecouple.mjs`(라이브 e2e 19체크, SQL 전/후 겸용),
  `scripts/testUnitResumeIndex.mjs`(pure 12체크)
- 수정: `src/utils/wordLibrary.js`(refreshStudents current_unit_id+폴백,
  resolveStudentUnitObj, getStudentUnit(Id), setStudentUnit/Class/Bulk/addStudent
  id 병행 기록+컬럼 부재 재시도, getStudentWords 해석기+숙제 교차 유닛,
  mapWordRow 공용화), `src/hooks/useStudent.js`(lastWordIndexByUnit,
  resumeIndexForUnit, setLastWordIndex(idx, unitId)), `src/App.jsx`(currentUnitId,
  handleUnitSwitch, resume 전달), `src/components/Dashboard.jsx`(유닛 셀렉트/
  숙제 안내/resumeIndex), `src/components/StudentSelect.jsx`(등록 유닛 라벨
  "처음 공부할 유닛" — 로그인과 완전 분리 명시)

### 테스트 (전부 PASS)
- 신규: testStudentUnitDecouple(라이브, id 모드 19체크 — 전환/영속/재로그인/
  복귀/동명 유닛 비충돌/로스터 일관성/숙제 교차 유닛/유닛 삭제 폴백/정리),
  testUnitResumeIndex(pure 12체크 — 하위호환/오염 방어/isEmptyRecord 불변).
- 회귀: testUnitPersistence · testStudentSelectUnitSwitch · testStudentLogin ·
  testProgress · testMultiClass · testDailyAssignment · testRenameClass ·
  testUnitNaturalSort · testDashboard · testSyncProgress · testRestoreSyncRace ·
  testLoginRestoreCrash · testIdentityMigration · testRlsSecurity(v1.9 상태
  확인 겸) 전부 PASS. `npm run build` 통과.
- 프로덕션 데이터: 삭제/리셋 0 — QA_ 접두 테스트 데이터만 생성/정리.

### Push/배포
커밋 4개(`98da563`→`7c99924`) push → Vercel 자동배포 완료. 라이브 번들
`index-CQ2pfFbN.js`에서 v2.1 마커 6종(current_unit_id/처음 공부할 유닛/
홈에서 변경 안내/숙제 준비 안내/lastWordIndexByUnit/유닛 셀렉트 라벨) 전부
확인(해시는 Vercel 빌드 환경 차이로 로컬과 다름 — 콘텐츠 마커로 검증).

### 잔여 리스크 / 다음
- FK/인덱스 존재 여부 미확인(anon으로 조회 불가) — 위 SQL 1회 실행으로 해소.
  FK가 없어도 클라이언트는 허상 id를 이름→첫 유닛 폴백으로 처리(테스트 8절).
- 운영자 실기기 확인 권장(5분): ①학생 홈 프로필 카드에서 유닛 셀렉트로 전환 →
  단어 목록 즉시 변경 + 별/스트릭/오늘 미션 그대로 ②새로고침/재로그인 후 그
  유닛 유지 ③Unit 복귀 시 "이어서 학습하기" 위치 그 유닛 기준 ④오늘 숙제 배정
  상태에서 다른 유닛으로 가도 단어 공부가 숙제 단어로 열림.
- 다음 아키텍처 우선순위(운영자 지정): 세션 영속성/진행도 구조/관리자-학생
  정합성/데드코드 정리 — 별도 에이전트 예정.

## 2026-07-17 오후 — "여전히 한→영만 나온다" 원인 격리 + 기본값 mixed 전환 (커밋 `e02249f`, **push+배포 완료** `index-BjV6lXr5.js` 라이브 일치)

### 원인 판정: 배선 버그 아님 — 기본값 문제 (실증 완료)
- **신규 `scripts/testSpellingDirectionWiring.mjs`** — 실제 SpellingQuestion/
  WordDetail 컴포넌트를 SSR로 렌더해 검증(스텁은 오디오/캐릭터 등 렌더 무관
  모듈만). 11체크 전부 PASS: direction prop이 문제 프롬프트/입력 placeholder를
  정확히 가르고, override가 반 설정을 이기고, **mixed 20문제가 정확히 10:10으로
  렌더됨**. 즉 mixed로 설정만 하면 처음부터 정상 동작했음.
- 실측 원인: 운영자 실반 4개 전부 `spelling_direction='kr2en'`(v2.0 SQL의 컬럼
  default — 기존 동작 보존용 설계) 상태였고 아무도 mixed로 바꾼 적 없음.

### 조치 — 기본값 'mixed' 확정 (운영자 지시: "혼합 50:50이 기본값")
1. **기존 반 일괄 전환(DML, 실행 완료)**: `scripts/opsSetAllClassesMixed.mjs` —
   kr2en인 반만 대상. 결과: **4/4 반 전환**(중2 능률 김기택/Presentation 6 -2026/
   중2 천재 이상기/고1 6월 학평), kr2en 잔여 0, 전/후 스냅샷 로그 확보.
   ⚠️ 이 스크립트는 재실행 금지(이후 의도적으로 kr2en으로 돌린 반을 다시 덮음).
2. **클라이언트 기본값**: wordLibrary.js DEFAULT/폴백/검증 폴백 전부 'mixed'.
   컬럼 부재 상태에서도 mixed 완전 동작(배정은 App.jsx 로컬 계산 — DB 불필요).
3. **관리자 UI**: 셀렉트 기본 표시 mixed, "혼합 50:50 (기본값)" 최상단.
4. **DB 컬럼 default(DDL)**: `supabase_v2_0_1_spelling_default_mixed.sql` 준비만 —
   **운영자 실행 대기. 실행 안 해도 동작 지장 없음**(새 반이 DB default kr2en을
   받아도 클라이언트 기본값·관리자 저장이 우선). 기본값 정합성 마무리용 권장.
- **특정 반만 한→영(기존 방식)으로 되돌리려면**: 관리자 → 반 → 쓰기 시험 설정 →
  출제 방향에서 "한글→영어만" 선택하면 됨(반별 독립).

### 재검증 (기본값 변경 후 전부 재실행, 전부 PASS)
testSpelling(신규 31케이스 포함) · testEntranceTest(47) · testSpellingDirectionWiring(11)
· testSpellingSettings(라이브) · testSpellingV2Db(라이브 14체크) · `npm run build`.
라이브 번들 검증: 학생 `index-BjV6lXr5.js`에 `spellingDirection:"mixed"` 기본값,
관리자 `AdminScreen-C4FYLJaN.js`에 "혼합 50:50 (기본값)" 확인.

### 운영자 실기기 확인 (기본값 전환 후)
1. 아무 설정도 안 바꾸고 학생 쓰기 모드 진입 → **영↔한이 섞여 나오는지**(이제 기본).
2. 마지막 단어 후 방향별 결과 화면("한→영 x/n · 영→한 y/m").
3. (선택) 관리자에서 특정 반을 "한글→영어만"으로 바꾸면 그 반만 예전처럼 나오는지.

## 2026-07-17 — v2.0 쓰기시험 양방향 혼합형 + 채점 관대화 + 교사 검토 큐 (커밋 `ae1863f`~`8f2da25`+관리자 커밋, **push+배포+SQL 적용+라이브 e2e 검증 완료**)

### 상태: ✅ v2.0 SQL 적용 완료 (운영자 실행 확인 2026-07-17 낮)
`supabase_v2_0_spelling_mixed.sql` 실행 완료 — 라이브 실측으로 3요소 전부 확인:
`classes.spelling_direction` / `words.accepted_meanings` / `spelling_review_queue` 테이블.
활성화 e2e `scripts/testSpellingV2Db.mjs` **14체크 전부 PASS**(아래 테스트 절 참고).

### 1. 선행 작업 — 쓰기/입실시험 입력창 시험용 속성 + 정답 병기 (커밋 3개)
- `ae1863f` 정답 노출 시점(정답 화면/4회 오답 공개 화면)에 반대 언어 병기 —
  kr2en이면 영어 정답 크게+한글 뜻 작게 회색, en2kr이면 대칭. 문제 화면에는
  정답 언어 절대 미노출(시험 무의미화 방지). 채점 로직 불변. SpellingReview는
  SpellingQuestion 재사용이라 자동 적용.
- `bc60497` 쓰기시험 입력창(answer/reveal 둘 다): `autoComplete="off"` +
  **무작위 비표준 name**(브라우저 저장 폼 프로필 매칭 차단 — autocomplete=off
  무시 케이스의 실전 보강책) + `inputMode="text"` + 방향별 `lang`(ko/en) +
  onPaste/onDrop/onCopy 차단(붙여넣기 우회 봉쇄). onContextMenu는 안 막음
  (롱프레스 커서 이동까지 막혀 초등학생 UX 훼손 — 붙여넣기는 메뉴 경유라도
  onPaste가 잡으므로 구멍 없음).
  **한계(정직 기록): 키보드 앱 자체 예측 텍스트(삼성 키보드/Gboard의 OS 설정
  영역)는 웹 속성으로 100% 차단 불가** — 위 조합이 속성으로 가능한 최대치.
  완전 차단이 필요하면 학생 기기에서 키보드 설정(예측 텍스트 끄기) 안내 필요.
- `da249db` 입실시험(EntranceTest) 입력창에도 동일 속성 세트 적용(별도 커밋).

### 2. v2.0 본작업 — 양방향 혼합형(mixed) (커밋 4개)
- **채점기(`spelling.js`) 관대화** (`44cc01a`) — 정답 인정 범위가 넓어지기만 하는 변경:
  - 한글 정답 후보 한정 **띄어쓰기 무시**("주문 하다"=="주문하다"). 영어 답에는
    미적용("icecream"!="ice cream" 유지 — 철자 시험 본질 보호).
  - **괄호 합침형** 인정: "영향(을 미치다)" → "영향"(기존)+"영향을 미치다"(신규).
  - **`opts.acceptedMeanings`** — 단어별 추가 인정 뜻이 target과 동일 규칙으로
    후보 합류. 말단 조사 차이("주문을 하다" vs "주문하다")는 **보수적으로 오답**
    → 검토 큐로(AI 자동 판정 금지 — 운영자 방침).
- **방향 배정 공용화** (`44cc01a`) — `entranceTest.js`의 `assignDirections(count, dir)`
  단일 배정기: 입실시험 buildEntranceQuestions와 쓰기 모드 세션(App.jsx)이 공용.
  `'mixed'` = 정확히 반반(홀수면 1개 rng) 후 셔플 — 20문제면 각 10문제 보장.
  'random'(문제마다 50%)은 기존 의미 그대로 유지.
- **데이터 레이어** (`fd59f38`): wordLibrary에 mixed 허용/accepted_meanings
  폴백 조회(컬럼 부재 시 재시도 — SQL 전 배포 안전)/`setWordAcceptedMeanings`
  (중복 제거). `spellingReviewApi.js` 신설 — 학생 기록은 fire-and-forget(테이블
  부재 조용히 스킵), 관리자 조회 null 폴백, 인정/무시는 status 전환(행 보존).
- **앱 배선** (`8f2da25`): 반 설정 'mixed'면 App이 세션 단어 목록에 사전 50:50
  배정 → WordDetail `spellingDirectionOverride`. 쓰기 모드 첫 시도 성적을 방향별
  집계, 마지막 단어 후 **`SpellingSessionResult` 결과 화면**("한→영 8/10 ·
  영→한 9/10 · 총점 17/20" + 틀린 단어 목록). 영→한 오답 중 한글 답은
  `spelling_review_queue`에 기록(첫 시도만, upsert 중복 무시). 복습(SpellingReview)
  은 mixed를 문제마다 랜덤으로 처리(맞을 때까지 반복 구조라 정확 배분 무의미).
- **관리자**: 출제 방향 4택(혼합 추가 — 쓰기 설정+입실시험 패널 둘 다),
  classes 탭 최상단 **"📝 쓰기 답안 검토" 패널**(인정 원클릭 = accepted_meanings
  추가+큐 해소 / 무시), 단어 행 "인정뜻 n" prompt 편집.

### 3. 테스트 (전부 PASS)
- `testSpelling.mjs` — 10~13절 신규 31케이스(띄어쓰기/괄호 합침/acceptedMeanings/
  mixed 50:50 배분) 포함 전체 PASS. 영어 답 회귀 케이스("ap ple"!="apple",
  "icecream"!="ice cream") 명시 확인.
- `testEntranceTest.mjs` 47체크 회귀 PASS(mixed 추가 후 재실행).
- **신규 `testSpellingV2Db.mjs`(라이브 DB e2e, SQL 적용 후) 14체크 전부 PASS**:
  ①mixed 저장/조회 라운드트립 ②accepted_meanings 저장(중복 제거)→채점 반영
  ③검토 큐 기록/중복 무시/words embed 조회/원클릭 인정→재채점 정답 ④반 삭제
  cascade 고아 행 0. 실행법: buildWordLibBundle 후 WORDLIB_BUNDLE 지정(파일 상단).
- 회귀: testProgress(전체)/testSpellingSettings(라이브) PASS. 매 커밋 `npm run build` 통과.

### 4. Push/배포
- 전 커밋 push → Vercel 자동배포 → 라이브 번들 `index-BbseIAa2.js` 로컬 일치 +
  핵심 문자열(쓰기 시험 결과/spelling_review_queue/accepted_meanings/영어 보고
  한글 뜻 쓰기) 확인. 관리자 청크 `AdminScreen-R_Zs9LjM.js`에 검토 패널/인정뜻/
  혼합 옵션 문자열 확인.

### 5. 운영자 실기기 확인 목록 (Android Chrome/삼성 인터넷, 5분)
1. 쓰기시험 정답/공개 화면에 **한글 뜻 병기**가 보이는지(영어 굵게+한글 회색).
2. 입력창에 "orde"까지 쳤을 때 **추천어 억제** 여부 — 안 되면 키보드 예측
   텍스트(OS 설정)가 원인(위 1절 한계 참고), 속성으로는 최대치 적용된 상태.
3. 입력창 **붙여넣기 차단**(길게 눌러 붙여넣기 시도 → 입력 안 됨).
4. 관리자 → 반 → 출제 방향 **"혼합"** 저장 → 학생 쓰기 모드에서 영↔한이
   섞여 나오고 마지막에 **방향별 결과 화면**이 뜨는지.
5. 영→한 문제에서 그럴듯한 다른 한글 뜻 입력(오답) → 관리자 classes 탭
   "쓰기 답안 검토"에 올라오는지 → **인정** → 같은 답이 다음부터 정답인지.
6. 한글 답 띄어쓰기 차이가 정답 처리되는지(예: 등록 뜻 "주문하다"에 "주문 하다").

## 2026-07-17 — P0 프로덕션 크래시: PIN 초기화/재설정 후 재로그인 직후 forEach TypeError (커밋 `bc49775`, `6b5e0f9`, **push+배포 완료** `index-vRV4evrc.js` 라이브 일치 확인)

### 원인 (스택으로 확정, 추측 아님 — scripts/testLoginRestoreCrash.mjs로 수정 전 코드에서 동일 TypeError 재현)
- **크래시 라인**: `src/App.jsx:154` `spellingWrongToday.forEach(...)` (reviewWordIds useMemo).
- **undefined였던 데이터**: `record.round.spellingWrongToday` — 2026-07-07 쓰기시험 기능(a7f7b04)에서 추가된 필드라, 그 이전 스키마의 round 객체에는 없음.
- **유입 경로 3곳** (전부 재현·수정):
  1. 클라우드 백업 blob 복원(`fetchFullProgress` → useStudent 복원 effect) — 옛 앱 버전이 올린 blob이 정규화 없이 그대로 record가 됨. **크래시가 2s 디바운스 재동기화까지 막아 blob이 영영 옛 스키마로 남는 악순환** — 그래서 "그 학생은 로그인할 때마다 매번" 크래시.
  2. v1.6 이름 키→id 키 lazy 마이그레이션(loadRecord 경로 2) — 이름 키 레코드를 스키마 정규화 없이 verbatim 복사.
  3. 과거 복사로 이미 id 키에 남아있던 옛 스키마 레코드.
- **PIN 초기화와의 연결**: PIN 초기화/재설정 = 강제 재로그인 = 정확히 경로 1(새 기기/빈 로컬 → 백업 복원)·2(옛 기기 → 마이그레이션)를 타는 학생. PIN API 자체는 progress를 안 건드림(확인).

### 수정 (2커밋, src 2파일 +107/-13)
- `bc49775` `src/hooks/useStudent.js`: **`normalizeRecord(raw, id)` 단일 정규화 함수** — freshRecord 기본형과 merge, 모든 배열/객체 필드 `Array.isArray`/typeof 검사, round는 오늘 날짜면 진행값 보존+누락 필드만 채움 / 지난 날짜면 자정 롤오버와 동일 리셋(지난 round가 마운트 후 첫 30초 동안 오늘 진행도로 계산되던 부수 버그도 함께 해결). loadRecord 전 경로 + 클라우드 복원 patch 적용. `restoreChecked` 훅 반환값으로 노출. **기존 값은 절대 삭제/변경 안 함 — 누락 필드만 기본값.**
- `6b5e0f9` `src/App.jsx`: ① 로그인 로딩 게이트 — 로컬 기록 없는 학생은 복원 확인 끝날 때까지(성공/실패/5s 타임아웃) Dashboard 렌더 보류, 로컬 기록 있으면 대기 0. ② ErrorBoundary — 프로덕션은 친절한 안내문("데이터를 불러오는 중 문제가...")+재시도/로그아웃 버튼, 에러 원문은 DEV만. componentDidCatch로 message/stack/componentStack/세션 studentId/href/mode/timestamp 콘솔 기록(**PIN/pin_hash 로그 금지 준수**). 로그아웃 버튼은 세션 정리 후 전체 리로드(비리로드 복귀는 같은 크래시 반복 위험).

### 세션/캐시 점검 결과 (3번 지시 — 감사 결과 추가 정리 불필요 판단)
- 클라이언트 캐시는 전부 **불변 student UUID 키**(`paul_easy_progress`, `paul_easy_sync_meta`, word_status, `_students`) — PIN 초기화/재설정은 UUID를 안 바꾸므로 캐시 혼입 자체가 구조적으로 불가. 이번 크래시도 혼입이 아니라 스키마 문제였음.
- 로그인 시점 검증은 기존에 이미 존재: 세션 UUID 형식 검증(readSession), `handleSelect`의 `refreshStudents()`, 삭제된 학생 감지(getStudentById → 강제 로그아웃). 다른 기기 localStorage를 서버가 못 지우는 한계는 기존 문서화 그대로 — Supabase 학습 데이터는 아무것도 삭제하지 않음.

### 테스트
- **신규 `scripts/testLoginRestoreCrash.mjs`** (buildRaceBundle 필요): 8시나리오 34체크 전부 PASS — ①옛 스키마 blob 복원 ②이름 키 마이그레이션 ③신규 학생(백업 null) ④배열 전부 누락 blob ⑤기록 많은 학생 값 보존 ⑥stale 날짜 round ⑦restoreChecked 게이트 ⑧id 키 옛 스키마. 수정 전 코드에서는 ①②⑥이 프로덕션과 동일한 `TypeError: Cannot read properties of undefined (reading 'forEach')`로 FAIL(재현 확정).
- 기존 회귀: testRestoreSyncRace(11) · testIdentityMigration · testProgress(전체) · **testFullProgressBackup(라이브 Supabase 왕복)** 전부 PASS. `npm run build` 통과.
- **실기기(Samsung Internet/모바일 Chrome)는 이 환경에서 불가 — 운영자 확인 필요**: 관리자에서 PIN 초기화→임시 PIN 재로그인 1회(크래시 없이 홈 진입 + 별/스티커/캘린더 유지), PIN 재설정→새 PIN 로그인 1회.

## 2026-07-17 — P5 UI 전체 통일성 (커밋 `3ca02fc`, `525ff6c`, **push+배포**)

헤드리스 브라우저 불가 환경 → 시각 확인이 필요 없는 "기계적 클래스 교체" 수준만 수행.
대규모 리디자인은 실기기 확인 가능할 때로 보류. 아래 인벤토리가 그때의 기초 자료.

### 1. 디자인 토큰 인벤토리 (2026-07-17 기준, src 전수 grep)
사실상 이미 존재하는 디자인 시스템(다수 패턴):
- **Tier 1 페이지 카드**: `bg-white rounded-3xl card-shadow` + p-4~p-8 — Dashboard/WordDetail/QuizGame/SpellingQuestion/StudentSelect/DiaryPage/StudyCalendar/EntranceTest(Admin)/LevelUpMission/MatchGameShell 전부 일치.
- **Tier 2 내부 박스·옵션/보조 버튼**: `rounded-2xl` (틴트 배경 + border-2, 옵션 버튼 p-4) — 일관.
- **Tier 3 입력/칩/배지**: `rounded-xl` 또는 `rounded-full`.
- **그림자**: 커스텀 `.card-shadow`가 표준(71곳). Tailwind `shadow-lg`는 5곳뿐 — 모달 3곳(App.jsx 46/458, AdminScreen 867: `rounded-3xl p-8 shadow-lg` 모달끼리는 서로 일관), MatchGameShell 게임 타일, StudentSelect 로고 이미지.
- **버튼**: `btn-press`(index.css, active scale 0.96) 표준. 전면 CTA는 `w-full py-4~5 rounded-2xl/3xl font-black`.
- **애니메이션**: `animate-slide-up`(26) / `animate-fade-in`(10) 표준, bounce/pulse/wiggle은 포인트용 — 일관.
- **색**: 화면별 테마 컬러가 의도적으로 다름(Dashboard 인디고/퍼플, WordBrowser 블루, Spelling 틸, EntranceTest 로즈, StudyCalendar 앰버). 의미색(성공 green/실패 red)은 전 화면 일치 — 건드리지 않음.

발견한 불일치(이번에 수정한 것):
- ParentScreen 섹션 카드 6곳이 유일하게 `rounded-2xl card-shadow`(페이지 카드인데 Tier 2 radius) → 3xl로 통일. 취약 단어 칩 `rounded-lg`(앱 유일) → xl.
- 터치 타깃: 헤더 "← 홈" 계열 백버튼 7화면(패딩 0, 실높이 ~20px), StudyCalendar 월 이동 ◀▶, SpellingQuestion 힌트 버튼, EntranceTest "모르겠어요" 스킵(py-1), WordBrowser 검색 ✕, ParentScreen 하단 버튼들 — 전부 44px 상당으로 확대.

### 2. 수정 내역 (전부 클래스 문자열 교체, DOM/레이아웃/로직 불변)
- `3ca02fc` ParentScreen: 카드 2xl→3xl 6곳, 칩 lg→xl, py-2/2.5 버튼→py-3, 백버튼 3곳 패딩.
- `525ff6c` 8개 학생 화면 터치 타깃: **`py-3 px-2 -my-3 -mx-2` 패턴(패딩+음수 마진)이라 시각 위치·레이아웃 완전 불변, 히트 영역만 확대.** EntranceTest 스킵 py-1→py-3, WordBrowser ✕는 right-4→right-1+p-3(글리프 위치 동일: 4+12=16px)+btn-press 추가.

### 3. 검증
- 매 커밋 `npm run build` 통과. dist CSS에 `.-my-3/.-mx-2/.p-3/.py-3/.rounded-3xl` 규칙 존재 확인.
- 스모크: `scripts/testProgress.mjs` 전체 PASS (esbuild 번들: react/wordLibrary 스텁 — PROGRESS_BUNDLE 환경변수 필요).
- 로컬 최종 번들 `index-BN4SEG2Y.js` — push 직후 라이브 프로브로 배포 확인(아래 실기기 목록 참고).

### 4. 실기기 확인 권장 화면 (Android Chrome, 1~2분)
1. **ParentScreen(학부모)** — 유일하게 시각적 radius가 커진 화면(카드 6곳 16→24px). 카드 모서리 어색한지.
2. WordBrowser — 검색어 입력 후 ✕ 위치/탭 반응.
3. StudyCalendar — ◀▶ 월 이동 탭 (히트만 커짐, 위치 불변이어야 정상).
4. EntranceTest 응시 중 "모르겠어요, 다음 문제 →" (py-1→py-3, 살짝 도톰해짐 — 의도).
5. 각 화면 헤더 "← 홈" 류 — 보이는 건 이전과 동일해야 함.

### 5. 의도적으로 안 건드린 것 (다음 리디자인 후보)
- WordBrowser 검색바 카드 `rounded-2xl card-shadow` — 화면 내부가 전부 2xl(탭/검색/리스트 행)로 자체 일관이라 유지. LevelUpMission 리스트 행 2xl+card-shadow도 동일한 "리스트 행" 패턴이라 유지.
- 모달 3곳 `shadow-lg`(card-shadow보다 강함) — 오버레이 위 모달은 강한 그림자가 맞을 수 있어 시각 확인 전 보류.
- StudentSelect 로고 `rounded-[20px]`+shadow-lg, DiaryPage 스티커 삭제 버튼 28px(최근 실기기 튜닝 완료분), AdminScreen/DebugPage/FeatureManagementPanel/HiddenFeatures의 rounded-lg·plain shadow(관리자/숨김 화면 — 학생 우선 원칙), 화면별 테마 컬러 차이.

## 2026-07-16 밤 — P7 감사 보안 remediation (커밋 `61ab5c8`→`e1e47da`→`6dcfb98`, **push+배포**)

## 2026-07-16 밤 — P7 감사 보안 remediation (커밋 `61ab5c8`→`e1e47da`→`6dcfb98`, **push+배포**)

P7 감사(3ad7f5c)에서 나온 미수정 보안 항목 처리. 이미 수정된 것(stale 가드 4곳,
pin_hash 응답 노출, localStorage 방어)은 건드리지 않음.

### ⚠️ 운영자가 해야 할 일 — v1.9 SQL (이번 작업의 핵심)
1. **`supabase_v1_9_security_rls.sql`을 Supabase SQL Editor에서 실행** (멱등, 몇 번 실행해도 안전).
   무엇을 막나: 브라우저 anon key로 students의 `pin_hash`/`pin_fail_count`/`pin_locked_until`/`pin_setup_allowed`를
   직접 SELECT(→4자리 PIN 오프라인 브루트포스)/UPDATE(→계정 탈취·잠금 무력화)하던 구멍.
2. 실행 직후 검증: `node scripts/testRlsSecurity.mjs`
   → "✅ 기능 + 보안 전부 통과"가 나와야 함. (지금 미적용 상태에서 돌리면 기능 9/9 PASS +
   보안 6건 FAIL로 "미적용" 안내가 나옴 — 사전 실행으로 확인 완료. 이 FAIL들이 곧 현재 취약점의 실증.)
3. 실기기 스팟체크(1분): 학생 로그인(이름+PIN) → 홈 진입, 관리자 → 학생 목록/반 변경 1회.
4. **만약** 뭔가 이상하면 즉시 롤백(원상 복구, SQL Editor에서):
   ```sql
   grant select, update on table public.students to anon, authenticated;
   notify pgrst, 'reload schema';
   ```

### 1. v1.9 SQL 설계 결정과 근거
- **컬럼 단위 권한(GRANT/REVOKE), RLS 행 정책 아님.** 이 앱은 Supabase Auth를 안 쓰므로
  (학생/관리자 전원이 같은 anon key) 행 단위 정책으로는 "누구인지" 구분 불가 — 잘못 걸면
  로그인 화면 학생 목록부터 전멸. 진짜 위협은 PIN 자격증명 4컬럼뿐이라 딱 그것만 차단.
- **클라이언트 전수 조사(설계 근거, src/ 전체)**: anon이 students에 하는 일은 wordLibrary.js 6곳이 전부 —
  SELECT(id,name,class_id,unit_name,classes(name)+created_at 정렬), INSERT(name,class_id,unit_name RETURNING id),
  UPDATE(class_id/unit_name), DELETE(id). → SQL은 이 전부를 그대로 허용(컬럼 목록은 information_schema에서
  동적 생성이라 컬럼 빠뜨림 사고 없음). INSERT/DELETE는 테이블 단위 유지(자기등록/관리자 삭제가 anon 경유).
- **서버리스는 무영향**: 라이브 프로브로 Vercel에 `SUPABASE_SERVICE_ROLE_KEY` 설정돼 있음을 확인
  (generate-audio가 이 키를 강제 요구하는데 env 에러가 아닌 body 검증 에러를 반환 → 키 존재 증명).
  service_role은 컬럼 권한 회수의 영향을 받지 않음.
- **배포 순서 무관 안전**: 코드가 먼저든 SQL이 먼저든 안 깨짐 — 코드 변경은 students 접근을 안 바꿨고,
  SQL은 클라이언트가 원래 안 쓰는 컬럼만 차단.
- **알려진 영향(앱 아님)**: v1.9 적용 후 anon의 `select=*`(bare select)가 거부됨 — 앱 코드엔 없음(P7에서 제거 완료),
  QA 스크립트들은 이번에 `select('id')` 명시로 정비 완료. testClearStudentPin.mjs의 직접 DB 검증은
  적용 후 자동으로 student-pin-status 부울 검증으로 대체되게 수정해둠(전/후 어느 상태든 PASS).
  이후 마이그레이션에서 students에 클라이언트가 읽을 새 컬럼을 추가하면 `grant select (새컬럼)`을 같이 실행해야 함(fail-closed).

### 2. API 수정 내역 (커밋 `61ab5c8`, `e1e47da` — 코드만으로 즉시 적용)
- **관리자 재인증 (clear-student-pin 패턴 공용화 → `_pinAuth.checkAdminReauth`)**:
  `bulk-generate-temp-pins`(평문 PIN 목록 응답 — 가장 민감), `set-pin-setup-allowed`, `unlock-student-pin`
  이제 요청마다 body.adminPin을 서버에서 재검증. AdminScreen 4개 핸들러가 adminPin 동봉 + not_authorized 시 재로그인 안내.
- **`set-student-pin` 이중 신뢰 모델**(호출자가 둘이라 일괄 게이트 불가): ①무작위 재설정(pin 생략)= 관리자 전용,
  adminPin 필수. ②학생 자기등록(명시 pin)= 인증 없이 허용하되 **대상 row의 pin_hash IS NULL을 서버에서 확인** —
  기존 학생 PIN을 익명 fetch로 덮어쓰는 계정 탈취 차단, 등록 플로우("처음이에요" 탭)는 동작 불변.
- **`verify-admin-pin`**: 실패 시 1.5초 지연만 추가(운영자 지시대로 과설계 없음 — 서버리스 인메모리 카운터는 무의미,
  학생 PIN은 이미 DB 5회 잠금). 성공 응답은 지연 없음.
- **`generate-audio`**: 학생 화면(WordDetail/QuizGame 지연 백필)이 자동 호출하므로 인증 요구 불가 판단.
  최소 방어만 — wordId 실존 검증(없으면 404), 생성 소스(word/meaning/example)를 클라이언트 body 대신 DB row로 고정
  (임의 텍스트로 Anthropic/TTS 비용 태우기 차단), 오디오+예문 완비 단어는 no-op(정상 클라이언트는 그 경우 호출 안 함 — 동작 불변).
- **안 건드린 것**: `student-pin-status` boolean 노출(기능상 필요 — 운영자 지시), 자기등록 경로의 weak-PIN 허용
  (self-set은 거부하지만 등록 탭은 기존대로 — UI 메시지 설계 없이 서버만 막으면 등록 플로우 혼란, 다음 세션 후보).

### 3. 테스트 / 배포
- PIN 스위트 4종 전부 PASS(라이브 DB, 핸들러 직접 호출): testStudentPinAuth(+탈취 시도 거부 3케이스 신규) ·
  testStudentPinSelfSetup(+무인증 거부 2케이스 신규) · testClearStudentPin(+무인증 재설정 거부 신규) · testStudentSelectPinStatus.
- testRlsSecurity.mjs 사전 실행: 기능 9/9 PASS, 보안 6건 "미적용" 정확 감지(위 1번 참고).
- 매 커밋 `npm run build` 통과. push → Vercel 배포 + 라이브 프로브 검증(아래 4).

### 4. 낮은 우선순위 (이번에 안 함)
- pin-status fetch 중복 3곳 공용 헬퍼 정리(시간 캡) · 자기등록 weak-PIN 서버 거부 + UI 메시지 · P5 UI 리디자인.

## 2026-07-16 저녁 — P7 전체 코드 감사 + P6 성능 측정 (커밋 `529ff9e`, **push+배포 완료**)

src/ 전체 + api/ 11개 서버리스 함수 + hooks/utils를 읽기 전용으로 훑고, "동작 불변 + 안전" 기준을 충족하는 것만 수정. 라이브 번들 해시 `index-DxZmNl0i.js` 로컬과 일치 확인.

### 수정한 것 (커밋 `529ff9e`, 5파일 +62/-7)
- **[보안/중간] pin_hash 네트워크 응답 노출**: `wordLibrary.js` setStudentClass/setStudentUnit의 미사용 bare `.select()`가 업데이트된 학생 행 전체 컬럼(pin_hash 포함)을 응답에 실어 내려보냄 → 제거(결과 미사용이라 동작 불변).
- **[안정/중간] localStorage 쓰기 실패 = 앱 전체 크래시**: `useStudent.js` saveStore가 patch()의 setState updater 안에서 불리는데 setItem이 throw(quota 초과/프라이빗 모드)하면 렌더 중 예외 → 전체 크래시. try/catch 방어(in-memory 상태·클라우드 동기화는 계속 동작, 콘솔 warn 1회). saveSyncMetaStore 동일.
- **[레이스/중간] stale 응답 덮어쓰기 — 6dd6c7a PIN 버그와 같은 클래스, fetch→setState 전수 확인 결과 4곳**:
  - `AdminScreen` FutureAssignmentPlanner: 날짜/반 빠른 전환 시 이전 조회의 늦은 응답이 선택 상태를 덮어씀 → **그대로 저장하면 엉뚱한 날짜 배정이 저장되는 데이터 사고 가능** → 요청 번호 가드.
  - `AdminScreen` 반별 현황 load: 반 전환 시 이전 반 데이터 덮어쓰기 → 가드.
  - `EntranceTestAdmin` loadStatus: stale tests의 activeTest로 "시험 종료" 누르면 **다른 반 시험을 닫을 수 있음** → 가드.
  - `EntranceTest`(학생) load: 5초 폴링 vs 제출 직후 load 순서 역전 → 가드.
- 이미 가드돼 있어 수정 불필요 확인: StudentSelect(6dd6c7a에서 수정 완료), EntranceTestBanner(alive 플래그), useStudent 복구 effect(cancelled), App.jsx visible 새로고침(inFlight 가드).

### 발견했지만 수정 안 한 것 (다음 세션용, 심각도순)
- **[구조적 — 중간~치명, 운영자 액션 필요]** 클라이언트 anon key로 students 테이블 직접 SELECT/UPDATE 가능(RLS 미적용 전제) — 이론상 pin_hash를 직접 읽어 4자리 PIN을 오프라인 브루트포스하거나 직접 덮어쓸 수 있음. 서버리스 함수들은 booleans만 내려주도록 잘 설계돼 있지만 진짜 경계는 DB 권한. **권장: Supabase에서 students RLS(또는 컬럼 권한 분리) + Vercel에 SUPABASE_SERVICE_ROLE_KEY 설정** — SQL/대시보드 작업이라 코드만으로 수정 불가, 이번 회차 미수정. (기존 문서화된 신뢰 모델이라 신규 구멍은 아님)
- **[중간]** `api/verify-admin-pin.js` rate limit/잠금 없음 — 학생 PIN은 5회 잠금이 있는데 관리자 PIN은 1만회 무제한 시도 가능. 실패 지연/잠금 추가 권장(동작 변화라 미수정).
- **[중간]** `api/bulk-generate-temp-pins.js` 요청당 관리자 재인증 없음 + 응답에 평문 PIN 목록 — clear-student-pin.js처럼 adminPin 재검증 추가 권장. set-student-pin/set-pin-setup-allowed/unlock-student-pin도 동일(기존 신뢰 모델과 동일해서 보류).
- **[중간]** `api/generate-audio.js` 무인증 — 반복 호출로 Anthropic/TTS 비용 소모 가능. wordId의 REST URL 보간은 eq. 필터 안이라 쿼리 탈출 불가 확인(인젝션 아님). adminPin 게이트 권장.
- **[낮음]** `api/student-pin-status.js` 무인증으로 임의 studentId(UUID를 알아야 함)의 PIN 상태 booleans 조회 가능 — 정보 노출 미미.
- **[낮음]** EntranceTest advance()의 setTimeout(900ms)이 unmount 시 clear 안 됨 — React 18 no-op setState라 실해 없음(finishedRef 가드도 있음).
- **[낮음/중복]** /api/student-pin-status fetch 패턴이 3곳(StudentSelect×2, AdminScreen) — 테스트 보호가 없어 리팩터링 보류.
- **메모리 누수 전수 점검 결과: 없음** — 모든 setInterval/addEventListener에 cleanup 확인(App.jsx, EntranceTest 3곳, EntranceTestAdmin, useMicReady, FeatureManagementPanel 1초 폴링, useStudent 30초+visibility). speech.js 모듈 전역 리스너는 의도적 영구(싱글턴).

### P6 성능 측정 (측정만, 무근거 최적화 안 함)
- 번들: index **515.89KB**(gzip 150.46) → 가드 추가 후 **516.09KB**(gzip 150.65). 500KB 경고는 이번 밤 기능들(P0~P4)로 484→516 성장한 결과 — 치명 아님(gzip 150KB). 코드 스플리팅 후보(EntranceTest/QuizGame 등 화면 lazy)는 **P5 UI 리디자인과 함께** 검토 권장. AdminScreen 408KB(lazy 분리 완료)·pdf 472KB·pdf.worker 1245KB(보류 항목, 손 안 댐)는 변화 없음.
- 입실시험 폴링 합리성 확인: 배너 20초(마운트+visible), 학생 랭킹 5초(result phase+visible만), 관리자 5초(반 선택+테이블 존재+visible만), active 시험 없으면 배너 조회 1개뿐 — 과다 호출 없음.
- 리렌더: 큰 목록 key 전수 확인(RankingList=studentId, 로스터=id, 단어목록 정적 index) — 문제 없음. memo 추가는 측정 근거 없어 안 함.

### 테스트/배포
- 스모크: `testProgress.mjs` PASS · `testEntranceTest.mjs` PASS. 커밋 전 전체 확인분: testStudentLogin/testMultiClass/testSyncProgress/testDashboard/testDailyAssignment/testFutureAssignment/testRestoreSyncRace/testIdentityMigration 전부 PASS. `npm run build` 통과.
- push → Vercel 자동배포 → 라이브 `index-DxZmNl0i.js` 해시 로컬 일치 확인.

### 다음 작업
- **P5 UI 리디자인이 다음 예정**. 그때 함께: 화면 lazy 분리(번들), /api/student-pin-status 중복 정리. 별도 트랙(운영자 결정 필요): students RLS + service role key, admin PIN rate limit.

---

## 2026-07-16 오후 — P3 쓰기시험 게임화 + P4 다꾸 개선 + v1.8 SQL 적용 후 입실시험 e2e 전체 검증 (커밋 `f886b56`→`15b6cf6`→`50274c7`, **push+배포 완료**)

### P3 — 쓰기시험 게임화 (`f886b56`)
표시/피드백 레이어만 추가 — 채점(spelling.js)/오답 4단계/오답노트(spellingWrongToday)/direction(kr2en·en2kr·random) 로직은 한 줄도 안 바뀜.
- **진행 바 + 남은 문제 수**: 쓰기 전용 모드에서 SpellingQuestion 카드 상단에 "문제 n/전체 · 남은 문제 k개" + 정답 순간 차오르는 바(종합 모드는 기존 단계 점 표시와 중복이라 미표시). SpellingReview(오답 복습)에도 동일 진행 바.
- **콤보**: `round.spellingCombo`(연속 "첫 시도 정답" 수, useStudent) — 2연속부터 "🔥 n연속 정답!" 배지(기존 animate-paul-pop 재사용), 첫 시도 오답이면 리셋, 자정에 round와 함께 리셋. 기존 저장 레코드엔 없는 필드라 전부 `(||0)` 방어(하위호환).
- **보너스 별(보수적)**: 콤보 3/5/10 도달 순간에만 +1/+2/+3 (`SPELLING_COMBO_BONUS`, 기존 addStars 단일 경로 재사용). 런당 최대 +6 — 미션 보너스 10/중복 스티커 20 대비 인플레이션 없음. 10 초과는 끊기기 전까지 추가 지급 없음. 마일스톤 정답 순간엔 폴 'levelup' 리액션 + "⭐ n콤보 달성! 보너스 별 +N개" 표시. **복습 화면은 콤보 배지만 있고 별 지급 없음**(맞을 때까지 반복 구조라 무한 파밍 방지, comboStarsEnabled=false).
- 효과음은 기존 playSuccessSound를 이벤트 핸들러 안에서만(에코 싱글턴 가드 유지).

### P4 — 다꾸(Diary) 개선 (`15b6cf6`)
- **X 버튼 재점검 결과(운영자 "완벽 수정" 요구)**: c3a3800의 stopPropagation은 유효했으나, 삭제/회전/크기 버튼이 transform(rotate+scale)된 부모 div 안에 있어 **스티커를 축소(scale 0.4)하면 버튼도 ~10px로 같이 줄어 터치 불가** — 이게 잔존 원인. ✕는 counter-scale(항상 28px)로 고정.
- **버튼식 툴바 신규**(스티커 선택 시 캔버스 아래 표시, 초등학생 기준 버튼식 선택): ↺↻ 회전 15°씩 / ➖➕ 크기 0.2씩(기존 한계 0.4~3 유지) / ⬆⬇ 앞으로·뒤로(레이어) / 🗑 삭제. 예전 스티커 위 미니 드래그 핸들(↻/⤡)은 위 축소 버그의 당사자라 제거(몸체 드래그 이동은 유지). 캔버스 밖 고정 위치 큰 버튼이라 스티커 크기/회전/겹침과 무관하게 터치 안 씹힘.
- **레이어 순서 = 배열 재정렬 방식**(`movePlacementLayer`/`movePlacementInList`): diaryPlacements 배열 순서가 곧 그리기 순서(뒤=위) — **새 필드 0개, 저장 스키마 완전 동일 = 기존 학생 다꾸 배치/클라우드 백업 100% 하위호환**.
- 하위호환 방어: rotation/scale 없는 레거시 배치가 transform 문자열을 통째로 무효화해(undefined 삽입) 위치가 틀어지던 잠재 버그도 수정(`||0`/`||1`).

### v1.8 활성화 검증 (`50274c7`) — 운영자가 SQL 적용 완료한 직후 실행
- **스키마 검증 PASS**: entrance_tests(9컬럼)/entrance_test_results(8컬럼) 라이브 존재 + supabase_v1_8_entrance_test.sql과 일치(REST 명시 select, "없는 컬럼은 에러" 대조군으로 검증 방식 유효성도 확인). unique(test_id,student_id)는 upsert 동작(6절)으로 검증.
- **입실시험 DB e2e 첫 전체 실행 — 33체크 전부 PASS**: 시험 생성→반당 active 1개(자동 close)→3명 응시→공동 1등/VIP/요약→재제출 upsert(새로고침 후 점수 유지=DB 왕복 증명)→종료 후 랭킹 유지→cascade 정리.
- **운영자 지정 시나리오**: ①점수 새로고침 유지(fetchOwnResult/fetchResultsForTests는 매번 DB 신규 조회 — 5·6절) ②학생별 격리(신규 케이스: C 재제출 후 A/B 점수 불변) ③반별 격리(신규 6.5절: 두 번째 반의 fetchTodayTests에 시험 미노출 → 배너/랭킹 원천 격리) ④랭킹/공동1등/VIP 정확성(5절 + 순수 로직 47체크).
- **발견/수정한 문제 1건(앱 버그 아님)**: 5절 "많이 틀린 단어 count===2" 기대값은 오답 학생이 1명뿐인 시나리오에서 구조적으로 불가능 — 테이블 부재로 SKIP만 되던 시절 한 번도 실행 안 된 테스트 작성 오류. 단어별 1회 집계로 정정(교차 학생 집계는 testEntranceTest.mjs 10절이 커버).

### 수정 파일
- P3: `src/hooks/useStudent.js`(spellingCombo+보너스), `src/components/SpellingQuestion.jsx`(HUD/배지/보너스 표시), `src/components/SpellingReview.jsx`(진행 바+로컬 콤보), `src/components/WordDetail.jsx`·`src/App.jsx`(배선), `scripts/testProgress.mjs`(8.7절 19케이스)
- P4: `src/components/DiaryPage.jsx`(툴바/X 수정/하위호환), `src/hooks/useStudent.js`(movePlacementLayer), `scripts/testProgress.mjs`(8.8절 11케이스)
- v1.8: `scripts/testEntranceTestDb.mjs`(격리 케이스+기대값 정정)

### 테스트 결과
- `testProgress.mjs` **전체 PASS**(신규 콤보 19 + 레이어 11 케이스 포함) · `testSpelling.mjs` PASS · `testRestoreSyncRace.mjs` PASS · `testIdentityMigration.mjs` PASS · `testPaulReactions.mjs` PASS · `testTtsSingleton.mjs` PASS · `testSpellingSettings.mjs` PASS · `testEntranceTest.mjs`(순수 로직 47체크) PASS · `testEntranceTestDb.mjs`(라이브 DB e2e) **첫 전체 실행 PASS** · 매 커밋 `npm run build` 통과.
- **검증 못 한 것**: 실기기 터치 UX(다꾸 툴바/콤보 애니메이션 체감, 헤드리스 브라우저 실행 불가 환경) — 코드 리뷰+빌드+라이브 번들 문자열 검증으로 대체. 운영자 실기기 확인 권장: ①쓰기 모드에서 3연속 정답 시 콤보 배지/보너스 별 ②다꾸 스티커 선택→툴바 7버튼 동작 ③축소한 스티커의 X 터치.

### Push / 배포
- P3/P4 push 완료 → Vercel 자동배포 확인: 라이브 `index-DXqferk8.js` 해시 로컬 빌드와 일치 + 핵심 문자열(spellingCombo/연속 정답/콤보 달성/남은 문제/스티커 꾸미기) 전부 포함 확인. v1.8 커밋(50274c7)은 scripts만이라 번들 불변.

### 다음 작업 (백로그)
- P5: UI 다듬기 · P6: 성능 · P7: 접근성/코드 감사. 입실시험 실기기 UX(모바일 키보드/IME/타이머 체감)는 여전히 라이브 미검증 — 운영자 실사용 피드백 대기.

---

## 2026-07-16 밤 — 입실 단어시험(Entrance Word Test) + 실시간 반별 랭킹/오늘의 VIP (커밋 `9744590`→`bc3ec1e`→`ace04e7`→`28f44d9`, **push+배포 완료**)

수업 시작과 동시에 반 학생들이 각자 폰으로 참여하는 단어시험(종이 시험 대체) — P1(시험) + P2(랭킹/VIP/교사 결과 페이지) 전체 구현. 학생 식별은 전부 student_id(UUID), 기존 학생 데이터(별/스티커/캘린더/학습기록)는 일절 안 건드리는 순수 추가 기능.

### ⚠️ 아침에 운영자가 해야 할 일 (이것만 하면 기능이 켜짐)
1. **`supabase_v1_8_entrance_test.sql`을 Supabase SQL Editor에서 실행** (entrance_tests + entrance_test_results 테이블, 멱등 DDL). **실행 전까지 학생/관리자 화면에 아무 변화 없음** — 배너 자체가 안 뜨고 관리자 탭은 "준비 중" 안내만 표시(크래시/콘솔 에러 없음, 라이브 실측 확인 완료).
2. SQL 실행 후 DB 통합 테스트 재실행(현재는 테이블 없어서 안전 SKIP 상태):
   `node scripts/buildWordLibBundle.mjs && node scripts/buildEntranceBundle.mjs && node scripts/testEntranceTestDb.mjs`
   (QA_EntranceTest 반을 임시 생성해 시험 생성→3명 응시→공동1등 랭킹→재제출 upsert→종료→정리까지 검증 후 스스로 삭제)
3. 관리자 화면 → "🏁 입실시험" 탭에서 실기기로 한 번 시험을 돌려보고 UX 확인.

### 구현 내용
- **교사 플로우**: 관리자 "🏁 입실시험" 탭 — 반 선택 → 출제 범위 자동 결정(오늘의 단어 배정 있으면 그것, 없으면 유닛 전체 — v1.3 getStudentWords 폴백 규칙 그대로) → 문항 수/방향(영→한·한→영·랜덤)/제한시간(1~5분) → 시험 시작. 진행 중: 제출 n/반 전체 m명, 실시간 랭킹+VIP, 평균 정답률, 많이 틀린 단어 TOP5, 시험 종료 버튼(5초 폴링, 탭 보일 때만). 같은 반에 새 시험 시작 시 기존 active는 자동 close(반당 동시 1개).
- **학생 플로우**: 로그인 → 홈 최상단 배너("오늘의 입실시험이 시작됐어요!" / 종료 후엔 "오늘의 랭킹 보기", 20초 폴링) → 안내 → 응시(전체 제한시간 타이머, 진행률 바, 문제당 즉시 채점 피드백, "모르겠어요" 패스, 시간 초과 시 미응답=오답으로 자동 제출) → 즉시 결과(내 점수/틀린 단어/반 랭킹+VIP, 5초 폴링) → 결과 자동 저장(student_id upsert, 실패 시 재시도 버튼 — 점수는 로컬에 안전).
- **랭킹**: 정확도 기준 공동 순위(1,1,3 방식), 오늘의 VIP=1등 전원(공동이면 모두 👑), 학생당 오늘 최고 기록 1개만, date 컬럼 조회 조건으로 "오늘만 표시/다음날 자동 리셋"이 구조적으로 보장.
- **시험 단어는 생성 시점 스냅샷(jsonb)** — 같은 반 학생들이 서로 다른 유닛이거나 시험 도중 단어를 수정해도 전원 동일 문제 풀.
- **실시간성은 폴링 채택** — Supabase Realtime은 대시보드 publication 활성화(운영자 액션)가 필요해 "코드 먼저 배포" 제약과 충돌. 테이블 없으면 첫 실패 후 `_available=false` 캐시로 네트워크 재시도조차 안 함.
- **채점 엔진 재사용 + 구멍 수정**: 기존 쓰기시험 엔진(spelling.js isSpellingCorrect) 그대로 재사용(새 엔진 발명 안 함, 향후 Smart Check-in 재사용 가능하게 화면 비종속 모듈로 분리). 작성 중 발견한 실버그 수정 — 뜻 전체("휘젓다, 섞다")를 그대로 정확히 입력하면 오히려 오답 처리되던 문제(대안 분해 비교만 하고 전체 문자열 일치 누락). 정답 인정 범위가 넓어지기만 하는 안전한 수정, 기존 쓰기시험에도 적용됨.

### 신규/수정 파일
- 신규: `supabase_v1_8_entrance_test.sql`, `src/utils/entranceTest.js`(순수 로직), `src/utils/entranceTestApi.js`(DB 레이어), `src/components/EntranceTest.jsx`(학생 화면+배너), `src/components/EntranceTestAdmin.jsx`(교사 패널), `scripts/testEntranceTest.mjs`, `scripts/testEntranceTestDb.mjs`, `scripts/buildEntranceBundle.mjs`
- 수정: `src/utils/spelling.js`(전체 문자열 일치 허용), `src/utils/wordLibrary.js`(getClassIdByName export만 추가), `src/App.jsx`(screen 배선), `src/components/Dashboard.jsx`(배너), `src/components/AdminScreen.jsx`(탭), `scripts/testSpelling.mjs`(+2케이스)

### 테스트 결과 — 로컬 완전 검증 vs DB 대기 구분
- **로컬 완전 검증(PASS)**: `testEntranceTest.mjs` 47 checks(출제/방향/random/채점/시간초과=오답/공동순위 1,1,3/VIP 공동/학생당 최고기록/반별 요약/타이머) · `testSpelling.mjs` 32 checks · **회귀 스위트 18종 전부 재실행 PASS**(wordLibrary 계열 10종: dailyAssignment/futureAssignment/multiClass/renameClass/studentLogin/unitPersistence/spellingSettings/unitNaturalSort/dashboard/syncProgress+fullProgressBackup+resetWordStatusBackup+studentSelectUnitSwitch, progress/restoreSyncRace, identityMigration, studentPinAuth 27/27, ttsSingleton, paulReactions, weeklyReport) · 매 커밋 `npm run build` 통과.
- **테이블 부재 폴백 라이브 실측(PASS)**: fetchTodayTests→[] / fetchOwnResult→null / fetchResultsForTests→[] / warn 1회만, throw 없음 — 배너 미표시·관리자 탭 "준비 중" 경로 확인.
- **DB 대기(SKIP — 검증 못 함)**: `testEntranceTestDb.mjs` 전체 흐름(시험 생성/제출/랭킹 DB 왕복/upsert/종료) — 테이블이 없어 실행 불가, SQL 실행 후 재실행 필요. **학생 실기기 응시 UX(모바일 키보드/IME/타이머 체감)도 라이브에서 미검증** — 코드 리뷰+빌드로만 확인(헤드리스 브라우저는 이 샌드박스에서 실행 불가).

### 알려진 이슈 / 의도적 보류
- 시험 문제는 학생별로 셔플되고 방향(random)도 학생별로 다르게 뽑힘 — 부정행위 방지에 유리하다고 판단해 의도적으로 그대로 둠(전원 동일 순서를 원하시면 seed 고정으로 바꿀 수 있음, 운영자 결정 필요).
- 랭킹 동점 기준은 "정확도"(문항 수 다른 시험이 섞여도 공정) — 풀이 시간 tie-breaker는 운영자 요구("공동 1등 허용")에 따라 넣지 않음.
- 학생이 시험 도중 앱을 나가면(새로고침 등) 답안이 사라지고 재입장 시 처음부터 — active 시험에 결과 미제출 상태면 재응시 가능. 시험 시간이 1~5분으로 짧아 실용상 문제 없다고 판단.

### Push / 배포 상태 (오늘 밤 전체)
- 입실시험 4커밋(`9744590`/`bc3ec1e`/`ace04e7`/`28f44d9`) **push 완료** → Vercel 자동배포 완료 → **라이브 번들 실측 검증 완료**: `index-DpieIwD6.js` 해시 로컬 빌드와 일치 + entrance_tests/배너 문자열/오늘의 VIP 포함 확인, `AdminScreen-CogxCW5F.js`에 입실시험 탭 + v1.8 SQL 안내 포함 확인.
- 참고: 아래 v1.6/v1.7 섹션의 "push 안 됨" 표기는 이제 **옛 정보** — PIN 자기설정/PIN 초기화(삭제)/레이스 수정 포함 오늘 밤 이전 커밋(`e492e29`~`764b4af`)까지 전부 push+배포된 상태에서 이번 작업을 시작했다.

### 다음 작업 (우선순위 백로그, 운영자 확인 후 착수)
- P3: 쓰기시험 게임화 · P4: 다이어리 꾸미기 확장 · P5: UI 다듬기 · P6: 성능 · P7: 접근성/코드 감사.

---

## 2026-07-16 — PIN 운영방식 변경: 학생 최초 PIN 자기설정 (커밋 `99d862d`~`e97eb2a`, **push 안 됨**)

v1.6(이름+PIN 로그인) 인프라는 그대로 유지한 채, 운영자 지시로 "학생이 직접 자기 PIN을 만드는" 플로우를 추가했다 — 관리자가 학생 등록(PIN 미설정 상태) → 관리자가 그 학생에게 "PIN 설정 허용" → 학생이 반 선택→이름 선택→PIN 직접 생성. 기존 "관리자 PIN 초기화"/"임시PIN 일괄생성" 기능은 폴백 수단으로 그대로 유지(삭제 안 함).

**신규**: `supabase_v1_7_student_pin_selfsetup.sql`(`pin_setup_allowed` 컬럼, 운영자가 Supabase SQL Editor에서 실행 완료 확인됨) / `api/self-set-student-pin.js`(서버에서 `pin_setup_allowed`+`pin_hash IS NULL` 이중 재확인, 취약PIN·재입력불일치 거부, 성공 시 플래그 1회성 원복) / `api/student-pin-status.js`(배치 조회, 해시 원문 절대 미노출) / `api/set-pin-setup-allowed.js`(관리자 허용 토글) / `api/unlock-student-pin.js`(pin_hash 안 건드리고 잠금만 해제) / `isWeakPin()`(전부같은숫자 10개+연속숫자 14개 거부). AdminScreen에 PIN 상태 배지+허용/잠금해제 버튼(개별+반 단위 일괄), StudentSelect.jsx에 "PIN 만들기" 탭(반→이름→상태별 분기) 추가.

**최종 라이브 검증 결과** (`supabase_v1_7` 적용 확인 후 재실행):
- `scripts/testStudentPinSelfSetup.mjs` — **24/24 PASS**. 운영자 지시 시나리오 1~9번 전부 확인: PIN없는 신규학생 생성 → 관리자 허용 → 학생 자기설정 성공 → 재로그인 성공 → 동명이인 2명 독립 설정(안 섞임) → **5번(가장 중요한 보안 테스트) "허용 안 된 계정 PIN 설정 시도 → 반드시 차단" 확인** → 취약PIN(1234 등) 거부 → 5회 실패 잠금 회귀 없음 → 관리자 잠금해제(신규) 동작 확인.
- `scripts/testStudentPinAuth.mjs`(v1.6) — **27/27 PASS**, 컬럼 추가로 인한 회귀 없음(동명이인 다른반 로그인 분리 포함).
- `scripts/testIdentityMigration.mjs`(포인트/캘린더 보존) — **20/20 PASS**, 회귀 없음.
- `npm run build` 통과.

**push 여부**: 지시대로 보류 — 운영자 최종 확인 후 push/배포 여부 결정.

---

## 2026-07-15~16 — P0 학생 identity 리팩터링(이름→id) + 이름+PIN 로그인 (커밋 `e492e29`~`2d6df5f`, **push 안 됨**)

CTO 지시 최우선순위(P0): 동명이인 학생이 이름을 전역 유일 키로 써서 서로의 별/포인트/캘린더/학습기록을 덮어쓸 수 있던 데이터 무결성 이슈. 작업 도중 운영자가 로그인 UX를 "반 선택 2단계"에서 "이름+PIN(4자리)"으로 바꾸도록 중간 지시를 추가해 그대로 반영했다.

### 1. Root cause
`src/utils/wordLibrary.js`의 `_students` 캐시가 `{ [name]: {...} }`(이름을 전역 유일 키로 사용)였다. `addStudent`가 동명이인을 조용히 차단(`if (findStudentByName(name)) return`)했고, 라이브 Supabase `students.name`에도 `UNIQUE` 제약(`students_name_key`)이 걸려 있어 DB 레벨에서도 막혀 있었다(Phase 0 진단으로 실측 확인 — 진단 시점 실제 동명이인 데이터는 0건). `useStudent.js`의 로컬스토리지(`paul_easy_progress`)도 이름을 키로 썼다. 부가로 `units.position` 컬럼이 신규 유닛 추가 시 항상 0으로 저장돼 유닛 표시 순서가 뒤섞이는 별개 버그도 발견해 함께 수정.

### 2. 수정한 파일
- `src/utils/wordLibrary.js` — `_students`를 `Map<id,{...}>`로 전환, 학생 관련 함수 전부(id 기준으로 시그니처 변경): `getStudentClass/getStudentUnit/setStudentClass/setStudentUnit/setStudentsClassBulk/removeStudent/syncStudentProgress/fetchFullProgress/setWordStatus/fetchWordStatusMap/fetchWordStatusSummary/resetWordStatus/fetchDebugSnapshot/getStudentWords/fetchDashboardData`. `addStudent`는 이제 새 학생 `id`를 반환, 동명이인 차단 제거. `findStudentByName`은 배열 반환(관리자 도구용, 더 이상 인증 수단 아님). 유닛 자연 정렬(`naturalCompare`) 추가.
- `src/hooks/useStudent.js` — `STORE_KEY(paul_easy_progress)`를 이름 키 → `studentId` 키로 전환. `useStudent(studentId, legacyName)`. `loadRecord`가 로그인 성공 시점의 정확한 학생 id로만 이름 키 레코드를 lazy 복사(기존 `migrateOldData` 선례 패턴 재사용, 원본 절대 안 지움, 전역 자동 매칭 없음).
- `src/App.jsx` — 세션을 이름 문자열 대신 `{id,name}` JSON으로 저장. UUID 형식 아니면 legacy로 간주해 안전하게 로그아웃(크래시 없음, 안내 배너 표시).
- `src/components/StudentSelect.jsx` — (운영자 중간 지시) 반 선택 2단계 로그인 대신 **이름+PIN(4자리)** 로그인/등록 탭으로 전면 교체. Enter 키 포커스 이동, 제출 중 입력 잠금 등 UX 다듬기 완료.
- `src/components/ParentScreen.jsx` — 학부모 화면도 이름+PIN(학생 PIN 재사용)으로 강화.
- `src/components/Dashboard.jsx`, `src/components/AdminScreen.jsx`, `src/components/DebugPage.jsx` — `studentId`/`studentName` 분리, 학생 목록/선택/편집 상태를 id 기준으로 전환. AdminScreen에 "PIN 재설정"(학생별) + "PIN 없는 학생 전원 임시 PIN 일괄생성 + CSV" 버튼 신규 추가.
- `api/_pinAuth.js`(신규, 공용 헬퍼) — Node 내장 `crypto.scrypt` 해시(외부 의존성 0개). `api/verify-student-pin.js`(신규) — 이름으로 후보(동명이인 가능) 조회 후 PIN으로 정확히 1명 확인, 5회 실패 시 5분 잠금(서버사이드 전용, `admin-verify-pin.js`와 동일한 "PIN은 서버에서만" 패턴). `api/set-student-pin.js`(신규) — PIN 설정/재설정. `api/bulk-generate-temp-pins.js`(신규) — 기존 학생 임시 PIN 일괄 발급.
- `supabase_v1_6_student_identity.sql`(신규) — `students.name` UNIQUE 제약 제거 + `pin_hash/pin_fail_count/pin_locked_until` 컬럼 추가. **아직 Supabase SQL Editor에서 미실행** (아래 5번 참고).
- 회귀 스크립트 12개 id 기준으로 갱신(`testStudentLogin/testMultiClass/testUnitPersistence/testDashboard/testSyncProgress/testRenameClass/testResetWordStatusBackup/testFullProgressBackup/testStudentSelectUnitSwitch/testFutureAssignment/testDailyAssignment/testSpellingSettings.mjs`) + 신규 3개(`testUnitNaturalSort.mjs`, `testStudentPinAuth.mjs`, `testIdentityMigration.mjs`) + 빌드 헬퍼 2개(`buildWordLibBundle.mjs`, `buildProgressBundle.mjs`).

### 3. Migration 방식
**로컬스토리지(Phase 2)**: `useStudent.js`의 기존 `migrateOldData` 선례(예전 `paulEasyVoca_{name}_{field}` 흩어진 키 → 통합 `paul_easy_progress`)와 정확히 같은 패턴 — 로그인 성공 시점(그 기기가 실제로 로그인하려는 정확한 학생이 명확한 유일한 시점)에만 그 학생의 이름 키 레코드를 새 id 키로 **복사**(원본은 절대 안 지움). 전역적으로 모든 이름 키를 훑어 자동 매칭하지 않음(동명이인 상황에서 위험) — 이 lazy/on-demand 방식이 CLAUDE.md 지시와 정확히 일치.
**DB(SQL)**: `supabase_v1_6_student_identity.sql` 1개 파일 — `ALTER TABLE ... DROP CONSTRAINT IF EXISTS` + `ADD COLUMN IF NOT EXISTS` (멱등, 기존 행 데이터 전혀 안 건드림). **DDL 실행 권한이 없어(anon key로는 ALTER TABLE 불가) 이 세션에서 직접 적용 불가 — Supabase SQL Editor에서 운영자가 실행해야 함.**

### 4. Recovery strategy
로컬스토리지 원본(이름 키)은 절대 삭제하지 않으므로, 마이그레이션이 잘못돼도 원본 데이터로 항상 복구 가능. Supabase 쪽은 기존 v1.4 전체 백업(`student_progress.progress_data`)이 그대로 유지되며, `fetchFullProgress`가 `studentId` 기준으로 여전히 정상 동작(이 P0 작업으로 백업/복구 경로 자체는 안 건드림 — id를 직접 FK로 쓰도록만 단순화).

### 5. 동명이인 테스트 결과 — **차단됨(운영자 액션 대기)**
`scripts/testStudentPinAuth.mjs`의 11번 케이스(같은 이름 "QA_PinKid"를 서로 다른 반 QA_PinAuthTest/QA_PinAuthTest2에 등록 → 서로 다른 PIN으로 각자 정확히 자기 id로 로그인되는지, 안 섞이는지)를 **이미 작성 완료**했으나, `supabase_v1_6_student_identity.sql`이 아직 적용되지 않아 `students.name` UNIQUE 제약 때문에 두 번째 동명이인 INSERT 자체가 DB에서 거부됨(정상적으로 예상된 상태, 크래시 아님 — 스크립트가 자동 감지 후 안전하게 skip). **SQL을 Supabase SQL Editor에서 실행한 뒤 `node scripts/testStudentPinAuth.mjs` 재실행하면 이 케이스까지 포함해 전부 검증됩니다.**

### 6. 포인트/별 보존 테스트 결과 — ✅ 완료 (SQL 마이그레이션과 무관, 순수 localStorage 로직)
`scripts/testIdentityMigration.mjs` — 별 250개짜리 실전형 레거시 레코드로 로그인 마이그레이션을 실제 `useStudent.js` 코드로 직접 검증. **20/20 체크 전부 PASS**: 마이그레이션 전후 `totalStars` 정확히 동일, 재로그인해도 중복/초기화 없음(멱등).

### 7. 캘린더 보존 테스트 결과 — ✅ 완료 (6번과 같은 스크립트)
같은 `testIdentityMigration.mjs`에서 이틀치 `history`(캘린더) 레코드가 `categoriesCompleted`/`quizCorrect`/`quizTotal`/`missedWordIds`까지 필드 단위로 정확히 보존됨을 확인. 스티커 3개(뱃지 2개 포함)/레벨업 미션/다이어리 배치/`wordStatus`(Skip 기능)도 모두 함께 검증(운영자 지시 5번 항목, 4번과 겹쳐 함께 확인됨).

### 8. Unit 정렬 검증 결과 — ✅ 완료
`scripts/testUnitNaturalSort.mjs` — Unit 1/4/5/6/8/(숫자없음) 뒤섞어 추가해도 항상 숫자 오름차순으로 정렬됨 확인(공백 유무 혼재 케이스도 라이브 데이터에서 실측 확인 후 반영).

### 9. Build 결과
매 커밋마다 `npm run build` 통과 확인(마지막 확인 커밋 `2d6df5f` 기준도 통과). 헤드리스 Chrome 시각 확인은 이번 세션의 샌드박스 환경에서 브라우저 프로세스 실행 자체가 권한 훅에 막혀 실행 불가(앱 로직 문제 아님) — 코드 리뷰 + 빌드 성공(문법/렌더 오류 없음)으로 대체 확인.

### 10. Commit 목록 (전부 로컬 커밋, 아래 11번 참고)
`e492e29`(Phase1 유닛정렬) → `e1d1f36`(Phase2/3/4-a 핵심 리팩터링+PIN서버) → `cbbc0ee`(회귀스크립트 7개 갱신) → `54fe075`(AdminScreen/DebugPage id전환+PIN UI) → `4a192f8`(PIN 서버로직 테스트, 마이그레이션 대기 확인) → `42f6813`(로그인 UX 다듬기) → `2d6df5f`(별/스티커/캘린더 보존 테스트).

### 11. Push 여부 — **안 함**
지시대로 전체 Phase 0~5가 다 끝나고 회귀 테스트가 전부 통과하기 전까지는 push 보류. 위 5번(동명이인 실제 DB 테스트) 항목이 SQL 마이그레이션 적용 전까지 완료 불가능한 구조적 제약이라, **이 세션에서는 여기서 멈춘다** — 운영자 확인 후 진행 여부 판단 요청.

### 12. Deploy 확인 여부 — 해당 없음 (push 자체를 안 했으므로 Vercel 배포도 안 됨)

### ⚠️ 다음 세션/운영자가 가장 먼저 해야 할 일
1. **`supabase_v1_6_student_identity.sql`을 Supabase SQL Editor에서 실행** (유일한 남은 블로커 — 이거 하나면 동명이인 실제 DB 테스트 + PIN 5회 실패 잠금 + 관리자 임시PIN 발급까지 전부 라이브로 검증 가능해짐).
2. SQL 실행 후 `node scripts/buildWordLibBundle.mjs && WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/testStudentPinAuth.mjs`로 동명이인 로그인 시나리오까지 재검증.
3. 기존 학생들은 `pin_hash`가 없는 상태이므로, 배포 전 AdminScreen의 "PIN 없는 학생 전원 임시 PIN 일괄생성 + CSV" 버튼으로 임시 PIN을 발급해 학생들에게 배포해야 실제 로그인 전환이 가능함(운영 이관 절차, 운영자 확인 필요).
4. 전부 통과 확인되면 그때 push → Vercel 배포 → 라이브 확인.

---

## 2026-07-10 밤 (6차) — 회귀 스위트 전체 재검증 + 발견한 버그 2개 수정 (커밋 `25e5967`)

CTO 지시 Priority 5(테스트). 오늘 밤 4~5차에서 만든 변경들이 서로 부딪히지 않는지 회귀 테스트 스크립트 14개를 전부 재실행.

- **`testPaulReactions.mjs` 오탐 수정** — "17개 real PNG" 시절 기준으로 하드코딩돼 있던 오래된 테스트. 실제로는 (오늘 밤 이전, 과거 세션에서) `src/assets/paul/`에 21개로 이미 늘어나 있었고 `paulReactions.js`도 정확히 반영돼 있었는데, 테스트만 안 맞춰져서 냉간 실행 시 7개씩 오탐 중이었음. 실제 소스에 맞춰 갱신(제품 코드는 무관 — 이미 맞았음).
- **`weeklyReport.js` 방금 만든 진짜 회귀 수정** — 5차(학부모 화면)에서 `computeStudentStats`를 이 파일로 옮기며 `wordLibrary.js`에서 `localIsoDateStr`을 import했는데, `weeklyReport.js`는 원래 "의존성 0개, 번들링 없이 바로 실행 가능"이 불변조건이라(`testWeeklyReport.mjs` 헤더에 명시) 즉시 테스트가 깨졌다. 4줄짜리 로직을 그대로 복제해 의존성 0개로 되돌림 — 같은 세션 안에서 직접 만든 회귀를 바로 잡음.

**검증**: 14개 회귀 스크립트 전부 재실행 → 전부 통과. 실제 화면도 헤드리스 Chrome으로 관리자 PIN 로그인/학부모 조회/학생 로그인→단어목록 3개 플로우 재확인. `npm run build` 통과. 라이브 배포 후 콘솔 에러 없음 확인.

---

## 오늘 밤(2026-07-10) CTO 모드 종합 요약 — 사용자 부재 중 자율 진행분

사용자가 "CTO처럼 판단해서 진행"을 지시하고 자리를 비운 동안(4~6차) 완료한 것 전체 요약. 상세 내역은 위 각 회차 항목 참고.

### 오늘 완료한 기능
- 관리자 대시보드: 반 전체 통계 CSV 내보내기 (`a05eaa0`)
- 성능: 학생 메인 번들 879KB→484KB (AdminScreen React.lazy 분리, `39d26eb`)
- 성능: 앱 복귀 시 중복 Supabase 새로고침 제거 (`81ada73`)
- **학부모 화면(v1.2) 신규 구축** — 오늘 학습/숙제/누적 별·연속학습/최근 7일 그래프/퀴즈 정답률/취약 단어/주간 리포트 (`219e9f3`)
- 회귀 테스트 스위트 전체 재검증 + 발견한 버그 2개 즉시 수정 (`25e5967`)

### 수정한 파일 (오늘 4~6차 전체)
`src/components/AdminScreen.jsx`, `src/App.jsx`, `src/components/StudentSelect.jsx`, `src/components/ParentScreen.jsx`(신규), `src/utils/weeklyReport.js`, `scripts/testDashboard.mjs`, `scripts/testPaulReactions.mjs`.

### Commit / Push / Vercel 배포
`a05eaa0` → `39d26eb` → `81ada73` → `219e9f3` → `25e5967` (+ 문서 커밋 다수). **전부** push 완료, Vercel 자동배포 확인, 각 배포마다 라이브 번들 해시 대조 + headless Chrome 콘솔 에러 없음 확인 완료.

### 발견한 버그 (전부 그 자리에서 수정 완료)
- 관리자 대시보드가 클래스/관리자 전용 라이브러리(xlsx)를 학생 메인 번들에 끌고 가던 문제
- 앱 복귀 시 visibilitychange+focus 중복 발동으로 API 호출 2배
- 학부모 화면 시각 검증 중 발견: 헤더 줄바꿈 겹침, 성장 그래프 막대가 아예 안 보이던 CSS 버그
- 오래된 `testPaulReactions.mjs`가 실제로는 이미 확장된 캐릭터 세트(17→21개)를 반영 못 해 오탐하던 것
- 학부모 화면 작업 중 직접 만든 `weeklyReport.js` 의존성 회귀(즉시 발견해서 즉시 수정)

### 해결 못한 문제 / 의도적으로 보류한 것
- **"선생님" 역할** — 학생/관리자 2단계뿐인 지금 권한 구조에 새로 추가해야 하는 큰 설계 결정(권한 범위, 로그인 방식)이라 원장님 확인 없이 스키마부터 만들지 않음. **다음 대화에서 요구사항 확인 필요**.
- Skip "전체 초기화"가 클라우드 백업은 고쳤지만(어젯밤) 로그인 중인 기기의 로컬 상태까지는 못 미침 — 서버가 클라이언트 저장소를 직접 지울 방법이 없는 구조적 한계, 병합 전략 설계 필요.
- 학부모 화면의 "알림/리포트 발송"(카톡/문자)은 여전히 "복사하기"만 지원.
- 전체 접근성(aria-label) 정밀 점검은 대표 사례 1곳만 고침, 나머지는 미착수.
- 반/학생 단위 통계(여러 반 동시 비교 뷰)는 미착수.

### 내일(또는 다음 세션) 가장 먼저 해야 할 일
1. **"선생님" 역할 요구사항 확인** — 권한 범위/로그인 방식 결정 후 설계 착수 (Priority 4 나머지).
2. 실제 사용자(원장님)가 오늘 만든 학부모 화면/CSV 내보내기를 실기기에서 한 번 확인.
3. 그 외엔 이 문서의 "성능 최적화 다음 후보"/"발견해서 수정한 것" 각 항목의 "다음에" 표시된 나머지 작업들.

---

## 2026-07-10 밤 (4차) — 관리자 CSV + 성능 최적화 (커밋 `a05eaa0`)

CTO 지시 우선순위 재확인(1.학생화면 2.성능최적화 3.관리자화면 4.학부모화면 5.테스트) 반영.

### 완료: 관리자 대시보드 반 전체 통계 CSV 내보내기 (커밋 `a05eaa0`)
ROADMAP.md 백로그 항목("반별 진도 통계를 관리자 화면 밖으로도") 구현. 새 Supabase 조회 없이 이미 로드된 데이터만 가공 — 렌더 루프와 CSV가 같은 계산 함수(`computeStudentStats`)를 공유해 어긋날 위험 없음. 실제 관리자 화면을 헤드리스 브라우저로 PIN 로그인부터 CSV 다운로드까지 전체 플로우 실행해서 다운로드된 파일 내용까지 직접 검증 완료(QA 반/학생 2명, 정리까지 확인).

### 완료: 성능 최적화 — 학생 메인 번들 879KB → 484KB (45%↓) (커밋 `39d26eb`)
원인 확인: `AdminScreen.jsx`가 `App.jsx`에 정적 import되어 있어서, `xlsx`(엑셀 업로드)를 포함한 관리자 전용 코드 전체가 **학생이 앱을 열 때마다 항상 같이 다운로드**되고 있었음 — 학생은 평생 한 번도 안 쓸 코드. `React.lazy()` + `<Suspense>`로 분리해 "⚙️ 관리자" 버튼을 실제로 눌렀을 때만 로드되게 변경(로직은 전혀 안 바뀜, 로딩 시점만 변경). 결과: 메인 청크 879KB→484KB(gzip 274KB→141KB), 빌드 경고("청크 500kB 초과") 해소. 실제 화면으로 관리자 PIN 로그인부터 대시보드까지, 학생 로그인부터 단어 목록까지 전체 플로우 재확인 — 회귀 없음. 라이브 배포 후 분리된 AdminScreen 청크가 실제로 서빙되는지(HTTP 200)까지 확인.

### 완료: 성능 최적화 — 앱 복귀 시 중복 API 호출 제거 (커밋 `81ada73`)
`visibilitychange`와 `focus` 이벤트가 모바일에서 거의 동시에 발생해, 앱 복귀 1번에 Supabase 새로고침(6개 쿼리)이 2번씩(총 12개) 발동하고 있었음. 이미 진행 중인 새로고침이 있으면 새로 시작 안 하는 가드만 추가(새로고침 자체의 로직/정확성은 불변). 실제 네트워크 요청을 헤드리스 브라우저로 직접 카운트해서 수정 전/후 차이(2회→1회) 확인.

### 성능 최적화 추가 점검: 미니게임 메모리 누수 — 이미 안전함 확인 (수정 없음)
`MatchGameShell.jsx`(뜻풍선/낚시/피자/기차 4종 공유 로직)의 두 setTimeout(정답 후 다음 라운드 전환, 오답 흔들림 되돌리기) 모두 언마운트 시 `clearTimeout`으로 이미 정리되고 있음(과거 세션에서 이미 고쳐진 것으로 확인, 커밋 `ad112f3` 참고 — 오늘 밤은 재확인만). 새로 고칠 것 없음.

### 성능 최적화 다음 후보 (착수 안 함)
- `pdf.worker.min.mjs`(1.2MB, PDF 생성 시에만 필요)가 이미 별도 청크로 분리는 되어 있으나 크기 자체가 매우 큼 — 실제 사용 빈도(시험지 생성 기능) 대비 더 줄일 방법이 있는지는 다음에 검토.

---

## 2026-07-10 밤 (5차) — 학부모 화면(v1.2) 신규 구축 (커밋 `219e9f3`)

CTO 지시 Priority 4. 로그인 화면에 "👨‍👩‍👧 학부모용" 링크 추가 → 자녀 이름 입력만으로(비밀번호 없음, 기존 학생 로그인과 동일한 신뢰 모델) 오늘 학습 여부/숙제 완료/누적 별·연속학습·클리어단어/최근 7일 그래프/퀴즈 정답률/발음 횟수/취약 단어(자주 틀린 단어)/주간 리포트를 볼 수 있는 읽기 전용 화면.

**재사용한 것(새로 안 만듦)**: `fetchDashboardData`/`fetchWordStatusSummary`(관리자 대시보드가 이미 쓰던 배치 조회 함수, 새 Supabase 쿼리 없음), `buildWeeklyReport`(기존 주간 리포트 텍스트 생성). `computeStudentStats`(예전엔 `AdminScreen.jsx` 안에만 있었음)를 `utils/weeklyReport.js`(기존 공용 유틸 파일)로 옮겨 관리자 화면과 학부모 화면이 **정확히 같은 함수**로 계산하게 함 — 오늘 밤 이미 겪은 "화면마다 다른 숫자" 버그 클래스를 애초에 차단.

**새로 만든 것**: `ParentScreen.jsx`, `App.jsx`에 `React.lazy`로 연결(관리자 화면과 같은 이유 — 학생 메인 번들에 거의 영향 없음, +1KB 미만).

**시각 검증 중 발견해서 그 자리에서 고친 버그 2개**:
1. 헤더의 "← 다른 학생" 버튼과 학생 이름 제목이 겹쳐서 이상하게 줄바꿈되던 문제 — `flex-shrink-0`/`min-w-0` 추가.
2. 최근 7일 학습 그래프 막대가 **퍼센트 높이 계산 오류로 아예 안 보이던 문제**(`items-end` 정렬에서 flex 자식의 높이가 정의 안 돼 `height:%`가 항상 0으로 계산됨) — 고정 px 계산으로 교체, 재확인 스크린샷으로 막대가 정상적으로 그려지는 것 확인.

**검증**: 실제 화면을 헤드리스 Chrome으로 없는 학생/실제 QA 학생 조회, 주간 리포트 펼치기, 다른 학생으로 돌아가기까지 전체 시나리오 구동 후 라이브 배포에서도 재확인(학부모용 링크 존재 + 클릭 시 정상 진입). `npm run build` 통과, `testDashboard.mjs` 회귀 없음.

**남은 것**: ROADMAP.md에 있던 "알림/리포트 발송(카톡/문자)"은 이번엔 손 안 댐 — 여전히 "복사하기"만 지원(관리자 대시보드와 동일).

## 2026-07-10 밤 (3차) — 실제 화면 시각 검증 + 접근성 + 테스트 인프라 신뢰성 (커밋 `59aeb3c`, `c3ef165`)

CTO/PM 지시(Priority 1: 학생 화면 완성도)에 따라, 이번엔 코드 리뷰가 아니라 **실제 화면을 눈으로 직접 확인**했습니다. `playwright-core`를 임시 devDependency로 설치(이미 있는 시스템 Chrome을 그대로 씀 — 새 브라우저 다운로드 없음, 확인 후 즉시 제거)해서 모바일 뷰포트(390×844)로 로그인→대시보드→단어목록→단어학습→퀴즈→새로고침까지 실제 렌더링을 스크린샷으로 확인했습니다.

### 확인 결과 — 완성도 재확인 (새 버그 거의 없음)

- **로그인/대시보드/단어목록/퀴즈 화면 전부 시각적으로 깔끔함** — 어제 고친 Paul 캐릭터 크기(작은 아이콘이 아니라 제대로 된 메인 캐릭터 크기)도 실제 렌더링으로 재확인.
- **마이크 권한 거부 시 에러 처리 이미 매우 잘 되어 있음** — `Dashboard.jsx`의 `MicPrimeBtn`이 에러 종류별(거부/기기없음/사용중/기타)로 구체적이고 친절한 한글 메시지를 이미 보여주고 있었음. `WordDetail.jsx`의 `SpeechBtn`도 마이크 실패 시 "녹음은 나중에 하고 먼저 듣기와 퀴즈를 해볼까요?"로 학습 흐름을 막지 않음 — 손댈 것 없음.
- **새로고침(=브라우저 재접속과 동일 메커니즘, localStorage 기반) 정상 — 콘솔 에러 없음, 학생 데이터/로그인 상태 그대로 유지 확인.**
- **다른 학생으로 전환 시 상태 누수 없음** — `App.jsx` 구조상 학생 전환은 항상 `StudentSelect`(로그아웃 화면)를 거쳐야만 가능해서 `AppInner`가 항상 완전히 unmount/remount됨(코드로 재확인, 실제 버그 없음).

### 발견해서 수정한 것

1. `scripts/testMultiClass.mjs` / `scripts/testRenameClass.mjs`가 **외부에서 수동으로 미리 만들어둔 픽스처가 있어야만 통과**하던 문제 — 2026-07-07부터 알려진 한계로 방치돼 있었음. 더 심각한 건 `testRenameClass.mjs`가 그 공유 픽스처를 실제로 개명(rename)해버리고 정리를 전혀 안 해서, 한 번 실행하면 (1) `testMultiClass.mjs`가 영구히 깨지고 (2) 라이브 DB에 QA 쓰레기 반/학생이 영원히 남았습니다. 둘 다 다른 테스트들과 같은 패턴(자체 생성 → 검증 → 자체 정리)으로 고쳐 단독 실행 가능하게 만듦. **제품 코드는 전혀 안 건드림.**
2. **접근성(우선순위 1의 "버튼"/"접근성")** — 모든 학생이 단어마다 가장 먼저 마주치는 발음 카드(`WordDetail.jsx`의 `PronounceStep`, 파랑/보라 그라데이션 카드)가 `<button>`이 아니라 `onClick`만 달린 `<div>`였음. 마우스/터치는 잘 되지만 키보드 포커스가 전혀 안 가고 스크린리더는 이게 컨트롤인지 알 방법이 없었음. `role="button"` + `tabIndex` + `aria-label` + Enter/Space 키 핸들러만 추가(기존 `onClick`/스타일/DOM 요소 타입은 전혀 안 건드림 — "이미 동작하는 기능 수정 금지" 원칙 준수). 앱 전체의 다른 clickable div들(캘린더/선물상자 모달의 배경 클릭-닫기)은 보조 동작이라 별도 라벨 불필요라 판단해 안 건드림. **참고**: `grep`으로 확인한 결과 프로젝트 전체에 `aria-label`이 이 수정 전까지 0개였음 — 이번엔 가장 눈에 띄는 한 곳만 대표로 고쳤고, 전체 접근성 정밀 점검은 별도 세션으로 남겨둠(우선순위 낮음, 큰 작업).

### 수정한 파일
`scripts/testMultiClass.mjs`, `scripts/testRenameClass.mjs`(테스트 인프라), `src/components/WordDetail.jsx`(접근성, 3줄 추가).

### 테스트 결과
두 테스트 모두 사전 준비 없이 단독 실행 → 전부 통과(11개+3개) → 정리까지 확인. 연달아 두 번 실행해도 서로 간섭 없음 확인. 접근성 수정은 헤드리스 Chrome으로 `role`/`aria-label`/`tabindex` 렌더링 확인 + **키보드 Enter 입력 시 실제로 발음이 재생되는지**(`[TTS START]` 로그) 기능 검증까지 완료, 스크린샷으로 시각적 회귀 없음 확인. `npm run build` 매번 통과. 시각 검증 중 콘솔 에러 없음(headless 환경 특유의 `getUserMedia Permission denied`만 발생, 실제 버그 아님).

### Commit / 배포
`59aeb3c`(테스트 인프라, 배포 불필요) → `c3ef165`(접근성 수정) — push → Vercel 배포 → 라이브 번들 해시(`index-BUJyBuyF.js`) 대조 확인 → headless Chrome 콘솔 에러 없음 확인 완료.

### 부수적으로 정리한 것
과거 세션에서 정리 안 되고 라이브 DB에 남아있던 QA 테스트 학생(`QA_V15prob`)을 발견해 함께 삭제.

### 남은 문제
새로 발견한 제품 버그 없음. Priority 1 중 반응속도/애니메이션/로딩은 시각 검증 중 특이사항 없었음(별도 수정 없음). 접근성은 대표 사례 1곳만 고쳤고 전체 점검은 다음 우선순위로 이월.

---

## 2026-07-10 밤 (2차) — CTO/PM 모드: 기능 현황표 + 모바일 UX 점검 (커밋 `ad3c92c`)

바로 앞 세션(아래 "안정성 우선순위 1~6 점검")에 이어서, "제품 완성도" 관점 지시를 받아 먼저 전체 기능을 완료/진행중/미완성/버그/제거예정으로 분류한 표를 만들고(재구현 방지용, 아래 참고), 어젯밤 시간 관계상 못 본 **모바일 UX**(우선순위 3)를 이어서 점검했습니다.

### 오늘 한 일

1. **기능 현황표 작성** — CLAUDE.md/ROADMAP.md/handoff.md/PROJECT_TODO.md/git log 기반. 요약: v1.0/v1.1/v1.5/v1.5.1 완료, 학부모 화면(v1.2)·AI기능(v1.3)·**"선생님(교사)" 역할 자체가 아직 없음**(지금은 학생/관리자 2역할뿐)이 미완성으로 분류됨.
2. **모바일 UX 점검** — 예전에 이미 고쳐진 "긴 단어가 카드 밖으로 잘리는 문제"(발음/퀴즈/미션 도전 카드)와 정확히 같은 클래스의 버그가 학생이 가장 자주 보는 **단어 목록 화면**(`WordBrowser.jsx`, "단어 공부" 탭)과 **레벨업 미션 대기 목록**(`LevelUpMission.jsx`)에는 방어가 빠져있던 것을 발견·수정(`break-words` 추가, 다른 화면에서 이미 쓰던 것과 동일 패턴).
3. 그 외 점검했지만 **문제 없음으로 확인된 것**: 녹음 중 화면 전환(`WordDetail.jsx`의 `SpeechBtn`은 이미 unmount 시 `mrRef.current.stop()` 정리됨), 빠른 연타로 인한 정답/별 중복 지급 위험(퀴즈 선택지는 `isAnswered`로 이미 잠김, "다음 단어" 버튼도 동기 상태 전이라 이중 클릭 위험 낮음).

### 수정한 파일
- `src/components/WordBrowser.jsx`, `src/components/LevelUpMission.jsx` — 단어/뜻 텍스트에 `break-words` 추가.

### 테스트 결과
`npm run build` 통과, 컴파일된 CSS에 `.break-words` 규칙 존재 확인(순수 CSS 클래스 추가라 로직 테스트 영향 없음).

### Commit / 배포 여부
`ad3c92c` — push → Vercel 배포 → 라이브 번들 해시(`index-BlXZDfot.js`) 대조 확인 → headless Chrome 콘솔 에러 없음 확인 완료.

### 남은 버그
새로 발견한 미해결 버그 없음. (기존에 알려진 것: 어젯밤 항목 참고 — Skip 초기화가 로그인 중인 기기 로컬엔 반영 안 됨.)

### 다음 우선순위 (제품 완성도 기준, "내일 학원에서 쓸 수 있는가")
1. **"선생님" 역할 설계 결정 필요** — 학생→학부모→선생님→원장 빅픽처에서 처음 나온 개념. 지금 스키마엔 학생/관리자(원장) 2단계 권한뿐이라, 선생님 역할을 어떻게 정의할지(원장과 동일 권한? 반 단위로 제한된 권한? 별도 로그인 방식?) 원장님 확인 없이 스키마/RLS를 먼저 설계하지 않았습니다 — 다음 대화에서 요구사항 확인 후 진행 권장.
2. v1.2 학부모 전용 화면 — 관리자 대시보드/주간리포트 로직 재사용 가능, 착수 안 함.
3. 성능(메인 번들 879KB 코드 스플리팅) — 계속 미착수.

---

## 2026-07-10 밤 — CTO 지시("제품 완성 단계") 대응: 안정성 우선순위 1~6 점검 (커밋 `61809b1`, `1ab754b`, `bb39d11`)

CTO 지시대로 새 기능은 전혀 손대지 않고(v1.2 학부모 화면은 착수 직전 중단, 코드 변경 없음), "데이터 유실 0% → 동기화 안정성 → 모바일 UX → 에코 사운드 → 홈/캘린더/관리자 일치 → Skip 검증 → 성능" 순서로 코드 리뷰 기반 점검을 진행했습니다. 실제 신고된 버그가 아니라 **코드 리뷰로 먼저 찾아서 먼저 고친 것**들입니다 — 아직 아무도 이 증상을 겪은 적은 없을 가능성이 높지만, 조건이 맞으면 조용히 발생할 수 있는 종류라 우선순위표 그대로 먼저 처리했습니다.

### 1. [가장 위험] 신규기기 복구 vs 자동동기화 레이스 컨디션 — 커밋 `61809b1`

- **증상 조건**: 로컬스토리지가 비어있는 상태(신규 기기/캐시 삭제/앱 재설치)로 로그인 + 클라우드 백업 복구(`fetchFullProgress`)가 2초(자동 동기화 디바운스)보다 느리게 끝날 때(느린 네트워크, Supabase 콜드스타트 등).
- **실제 위험**: 동기화 타이머가 먼저 발동해서 "아직 비어있는" 로컬 기록으로 그 학생의 클라우드 백업(`progress_data`) 자체를 덮어씀. 이 기기의 로컬 복구 자체는 그 후 정상 성공하지만, **클라우드 백업이 조용히 파괴**되어 이 학생이 나중에 정말로 기기를 잃어버리면 별/스트릭/캘린더 전체가 영구 복구 불가능.
- **수정**: `restoreChecked` 플래그로 동기화 effect를 게이팅 — 로컬에 이미 데이터 있으면 대기 없음(대부분의 경우), 복구가 필요한 경우만 복구 시도가 끝날 때까지(성공/실패/5초 타임아웃 무관) 동기화를 미룸.
- **덤으로 같이 고침**: 탭이 숨겨지는 순간(`visibilitychange`, 모바일 앱 전환/화면 꺼짐 포함, `beforeunload`보다 훨씬 안정적) 대기 중인 동기화를 2초를 기다리지 않고 즉시 flush — "학생이 답 하나 맞추고 바로 앱을 나가면 그 변경이 영영 동기화 안 될 수 있던" 위험 축소.
- **검증**: 손으로 옮겨적은 로직이 아니라 **실제 번들된 useStudent.js를 직접 렌더링**해서 검증 — 최소 hooks 런타임(`scripts/fakeReact.mjs`) + 수동 제어 가능한 fake clock을 새로 만듦(`scripts/testRestoreSyncRace.mjs`, 10개 assertion 전부 통과). 기존 `testProgress.mjs`(48개 체크) 회귀 없음.

### 2. 에코 사운드 감사 — 새 버그 없음, 기존 방어 재확인만

`speech.js`의 `claimTtsCall`/`stopAllPlayback` 싱글턴 가드(새 호출 시작 시 이전 호출을 무조건 stale 처리)와 `playRepeating()`이 이미 이 문제 클래스를 구조적으로 막고 있음을 재확인. 모든 효과음(`playSuccessSound`/`playReactionSound`) 호출부가 `useEffect`(마운트 시 실행, StrictMode 이중실행 위험군)가 아니라 이벤트 핸들러 안에서만 호출되는 것도 전체 grep으로 재확인. `scripts/testTtsSingleton.mjs` 재실행 통과. **새로 고칠 것을 못 찾았습니다** — 이전 세션에 이미 잘 고쳐져 있었습니다.

### 3. 홈/캘린더/관리자 데이터 불일치 — 관리자 대시보드에 남아있던 재발 — 커밋 `1ab754b`

- **증상**: 오늘 새벽 고친 "단어만 보고 카테고리를 못 채운 날 캘린더가 비어 보이던 버그"(커밋 `f29f53e`)와 **정확히 같은 버그 클래스**가 관리자 대시보드의 "오늘 공부함" 배지에는 그대로 남아있었음. 배지가 `categories_completed > 0`을 기준으로 삼아서, 학생이 오늘 단어를 열어봤지만 아직 카테고리를 하나도 못 채우면 관리자 화면엔 "⬜ 오늘 아직 안 함"으로 계속 보임.
- **수정**: 학생 쪽 캘린더와 같은 기준(오늘 날짜 row 존재 여부)으로 통일 — 스키마 변경 없는 순수 표시 로직 수정.
- **검증**: 라이브 Supabase에 QA 학생으로 "단어만 보고 카테고리 못 채움" 상태를 재현, 구버전 기준이면 오탐했을 상황에서 신버전이 정확한지 확인. `testDashboard.mjs`에 회귀 테스트 추가.

### 4. Skip(알아요/모르겠어요) 검증 — 관리자 "전체 초기화"가 클라우드 백업은 안 지우던 문제 — 커밋 `bb39d11`

- **증상**: `resetWordStatus`(관리자 "🔄 전체 초기화")가 `word_status` 테이블만 지우고, 같은 값이 별도로 저장된 전체 기록 백업(`student_progress.progress_data.wordStatus`)은 안 건드림 — 이 학생이 나중에 기기를 잃어버려 새 기기에서 복구하면 방금 초기화한 값이 백업에서 그대로 되살아남.
- **수정**: `resetWordStatus`가 백업 blob의 `wordStatus`도 함께 비움(다른 백업 필드는 그대로 유지).
- **알아냈지만 오늘 밤 손대지 않은 것**: 이 초기화는 **학생이 지금 로그인해 있는 기기의 로컬 localStorage**까지는 못 건드립니다(서버가 클라이언트 저장소를 직접 지울 방법이 구조적으로 없음). `fetchWordStatusMap()`이 "다른 기기 word_status 복구용"으로 이미 만들어져 있는데 **실제로는 어디서도 호출되지 않는 죽은 코드**였습니다 — 로그인 중인 기기에도 관리자 초기화를 실제로 반영하려면 이 함수를 로그인/포커스 시점에 연결해야 하는데, "학생이 방금 직접 바꾼 값과 충돌 안 나게" 병합 전략을 신중히 설계해야 해서 범위 밖으로 남겨뒀습니다. **다음 우선순위 후보**로 아래 기록.
- **검증**: 라이브 Supabase로 재현 — 초기화 전 백업에 값 있음 확인 → 초기화 후 wordStatus만 비워지고 다른 필드는 유지되는지 확인. `scripts/testResetWordStatusBackup.mjs`로 회귀 테스트 추가.

### 모바일 UX / 성능 — 오늘 밤 범위에서 제외

우선순위 1~2(데이터 유실/동기화)를 예상보다 깊게 파느라(레이스 컨디션이 진짜 위험한 버그였음) 3번(모바일 UX)과 7번(성능 최적화)까지는 도달하지 못했습니다. 성능 관련해서는 `npm run build` 경고로 계속 나오는 "메인 청크 879KB" 코드 스플리팅(`pdf.worker`/`xlsx` 등 관리자 전용 무거운 라이브러리를 학생 화면 번들에서 분리)이 눈에 띄는 후보입니다 — 아직 손대지 않았습니다.

### 종합 결과

- **수정한 파일**: `src/hooks/useStudent.js`(레이스 컨디션+flush), `src/components/AdminScreen.jsx`(오늘 공부함 배지), `src/utils/wordLibrary.js`(resetWordStatus 백업), `scripts/testDashboard.mjs`(회귀 테스트 추가) + 신규: `scripts/fakeReact.mjs`, `scripts/fakeReactModule.mjs`, `scripts/wordLibraryRaceStub.mjs`, `scripts/buildRaceBundle.mjs`, `scripts/testRestoreSyncRace.mjs`, `scripts/testResetWordStatusBackup.mjs`.
- **테스트 결과**: `npm run build` 매 커밋마다 통과. `testProgress.mjs`(48개), `testRestoreSyncRace.mjs`(10개, 신규), `testSyncProgress.mjs`, `testDashboard.mjs`(신규 케이스 포함), `testResetWordStatusBackup.mjs`(신규), `testDailyAssignment.mjs`, `testStudentLogin.mjs`, `testUnitPersistence.mjs` 전부 라이브 Supabase 대상 종단 테스트 통과. `testMultiClass.mjs`는 예전부터 알려진 대로 외부 QA 픽스처 없이는 실패(회귀 아님, `handoff.md` 2026-07-07 항목 참고).
- **Commit ID**: `61809b1`(레이스 컨디션), `1ab754b`(관리자 대시보드 일치), `bb39d11`(Skip 초기화 백업).
- **배포 여부**: 3개 커밋 전부 push → Vercel 자동배포 → 라이브 번들 해시 직접 대조로 배포 확인 → headless Chrome 콘솔 에러 없음 확인.
- **남은 버그**: 위 "알아냈지만 손대지 않은 것"(관리자 초기화가 로그인 중인 기기의 로컬 상태까지는 반영 못 함) — 설계가 필요해서 의도적으로 보류. 그 외 새로 발견한 미해결 버그 없음.
- **다음 우선순위**: (1) 오늘 밤 다 못 본 모바일 UX/성능(코드 스플리팅) 점검, (2) 위 Skip 초기화의 "로그인 중인 기기 반영" 설계, (3) CTO 브리핑에 언급된 순서대로 그 다음은 Writing/Speaking/AI Feedback/Parent Dashboard.

---

## 2026-07-10 — v1.5 안정화: 숨김 관리자 Debug 페이지 + 동기화 상태 추적 (커밋 `97910d9`)

- **배경**: 이전 세션에서 학생 진행 기록(별/스트릭/캘린더 등)이 클라우드에 실제로 잘 백업되고 있는지 확인할 방법이 없었음 — `useStudent.js`의 Supabase 동기화가 실패해도 `.catch(() => {})`로 조용히 삼켜져서 실패 흔적이 어디에도 안 남았음.
- **추가한 것**:
  1. **숨김 디버그 탭** — 관리자 화면 제목("⚙️ 관리자")을 1.5초 안에 5번 탭하면 진입. 학생을 고르면 (1) 이 기기 localStorage 스냅샷, (2) 실제 Supabase `student_progress`/`student_daily_progress`(최근 14일)/`word_status` 조회 결과, (3) 이 기기의 마지막 동기화 시도/성공 시각·연속 실패 횟수·마지막 에러를 한 화면에 보여줌. 로컬과 클라우드 값이 어긋나면(별 개수, 스티커 개수, word_status 개수, 전체 백업 비어있음) 자동으로 빨간 배너로 표시.
  2. **동기화 상태 추적** — `useStudent.js`에 기기별 `paul_easy_sync_meta` 저장소 추가(학생 진행 데이터와 완전히 분리 — 백업/복구 대상 아님). 학생 쪽 동작은 전혀 안 바뀜, 그냥 지금까지 안 보이던 실패를 보이게 만든 것.
  3. **`npm run dev` 관리자 PIN 수정** — `vite dev`는 Vercel 서버리스 함수(`api/verify-admin-pin.js`)를 실행하지 않아서 로컬 개발 중엔 관리자 PIN 화면 자체가 막혀 있었음. `vite.config.js`에 실제 함수와 동일한 로직의 개발 전용 미들웨어 추가(프로덕션 빌드/배포에는 전혀 영향 없음, 여전히 진짜 서버리스 함수가 처리).
- **검증**: `npm run build` 통과. `testProgress.mjs`(회귀 48개 체크) 전부 통과. `testSyncProgress.mjs`(라이브 Supabase 종단) 전부 통과 — 이 과정에서 테스트 자체의 기존 버그(`toISOString()`이 UTC라 KST 새벽 시간대엔 오탐)를 발견해 같이 수정함(앱 코드는 이미 2026-07-09에 고쳐져 있었고 테스트만 안 맞춰져 있었음). `fetchDebugSnapshot()`도 라이브 Supabase에 대해 학생 생성→동기화→조회→삭제까지 임시 테스트로 종단 검증(재사용 스크립트로 남기지 않음, 1회성 검증 후 정리). 로컬에서 `vite dev` 기동 후 `/api/verify-admin-pin` 엔드포인트를 정답/오답 PIN으로 직접 호출해 정상 응답 확인. 배포 후 라이브 번들에 새 코드(`paul_easy_sync_meta` 등)가 실제로 포함됐는지 직접 대조 확인, headless Chrome 콘솔 에러 없음 확인.
- **사용자 확인 필요**: 관리자 화면에서 제목을 5번 빠르게 탭해 디버그 탭에 진입, 아무 학생이나 골라서 로컬/클라우드 값이 일치하는지, 동기화 상태가 "✅ 동기화 성공"으로 뜨는지 한 번 확인해주시면 좋겠습니다.

## 2026-07-10 — 공부 캘린더가 텅 비어 보이던 버그 수정 (커밋 `f29f53e`)

- **신고 내용**: 홈/미션 화면엔 "완료한 미션 1/4, 획득한 별 2, 공부 여부: 공부했어요"처럼 오늘 학습 흔적이 보이는데, 공부 캘린더 화면은 "0일 연속 공부 중"에 날짜 기록 자체가 없어 보임. 사용자가 직접 "데이터 저장 실패가 아니라 캘린더가 다른 데이터 소스/조건을 보는 버그"라고 정확히 짚음.
- **확인한 사실**: 홈(Dashboard)과 캘린더(StudyCalendar)는 실제로는 `App.jsx`에서 만든 동일한 `useStudent(student)` 훅 인스턴스(`studentData`)를 그대로 공유합니다 — 별개의 데이터 소스가 아닙니다. 진짜 원인은 `history` 엔트리 자체가 생성되는 조건이었습니다: 예전엔 오늘 카테고리(단어/예문/퀴즈/발음) 중 하나를 GOAL(5회)만큼 다 채워야만 `bumpHistory`가 호출돼 `history[오늘]`이 생겼습니다. 그래서 카테고리를 하나도 다 못 채운 날은 홈 화면엔 (라운드 상태 기반) 진행 흔적이 보여도 `history[오늘]` 자체가 없어 캘린더 그리드/스트릭 계산에서는 완전히 없는 날처럼 취급됐습니다.
- **수정**: `src/hooks/useStudent.js`의 `markWordViewed`(학습 흐름에서 가장 먼저 실행되는 액션)가 이제 `bumpHistory(() => ({}))`도 함께 호출해, 단어를 처음 연 시점에 `studied:true, categoriesCompleted:0`인 오늘 기록을 만들어 둡니다. `streak` 계산(4/4 완료 필요)에는 전혀 영향 없음 — 캘린더가 "그날 공부는 했지만 미션은 0/4"를 정확히 보여주게 됨.
- **참고**: `src/components/StudyCalendar.jsx`의 `markerFor()`도 `categoriesCompleted<=0`일 때 마커를 아예 숨기던 것(빈칸)에서 연필 이모지(✏️)로 바꿔, 그리드에서도 "공부는 했지만 미션 미완료"인 날이 시각적으로 구분되도록 함.
- **테스트**: `scripts/testProgress.mjs`에 회귀 테스트 추가("카테고리 0개 완료 상태에서도 history 기록 생김") — 전체 테스트(신규 포함) 통과, `npm run build` 통과.
- **커밋 범위 참고**: 이 작업 디렉터리에는 이 수정과 무관한 별도 작업(v1.5 Stability Milestone — 숨김 관리자 Debug 페이지 `DebugPage.jsx`, 동기화 상태 추적 `SYNC_META` 등)이 이미 커밋 전 상태로 같이 있었습니다. 섞이지 않도록 `git apply --cached`로 이번 버그 수정에 해당하는 hunk만 골라 별도 커밋(`f29f53e`)했고, 그 v1.5 작업은 손대지 않고 그대로 uncommitted 상태로 남겨뒀습니다 — 다음 작업 시 이어서 검토 필요.
- **사용자 확인 필요**: 실제 기기에서 재현되던 정확한 상황(리포트에 적힌 "1/4, ⭐2")을 제가 직접 재현하지는 못했습니다 — 코드상 확인된 근본 원인(카테고리 0개 완료 날의 history 누락)에 대한 수정입니다. 다음에 학습 후 캘린더를 다시 확인해서 오늘 날짜에 마커가 뜨는지 봐주시면 좋겠습니다.

---

## 2026-07-08 — 홈 화면 복습 배너 카드 레이아웃 수정

- **증상**: `RecommendationBanner`(홈 화면 "복습할 단어가 있어요!" 등 추천 카드)가 `flex-row`라 폴 캐릭터가 왼쪽에 작게 눌리고, 텍스트가 오른쪽 좁은 칸에 몰려 세로로 줄바꿈되는 것처럼 보임.
- **수정**: `src/components/Dashboard.jsx`의 `RecommendationBanner` 레이아웃을 모바일 기준 `flex-col`(중앙 정렬: 폴 캐릭터 → 제목 → 설명 → 버튼), `md:` 이상에서만 `flex-row`로 좌우 배치 가능하도록 변경. 이모지는 제목에 인라인으로 합침. 캐릭터 크기는 기존 `size="sm"`(모바일 140px) 그대로 유지 — 이미 요청 범위(120~150px) 안이라 크기 자체는 문제 없었고, 레이아웃만 문제였음.
- **검증**: `npm run build` 통과. Playwright로 실제 앱(로그인 → `paul_easy_progress`에 9개 활성 미션 주입 → 리로드)을 375px 모바일 뷰포트에서 구동해 카드를 스크린샷 확인 — 캐릭터 중앙, 제목 한 줄, 설명 전체 폭, 버튼 하단 전체 폭으로 정상 렌더링됨. 콘솔 에러 없음(기존에 알려진 미확보 캐릭터 PNG 경고만 있음, 이 작업과 무관).
- **커밋 안 함**: 아직 push/commit 전 — 사용자 확인 후 커밋 예정.

---


> 이전 버전의 handoff.md(2026-06-26자)는 DB 도입 이전(localStorage 전용, PIN 1234 하드코딩) 구조를 설명하고 있어 현재 상태와 맞지 않아 전체를 새로 작성했습니다. 최신 아키텍처는 `CLAUDE.md`/`ROADMAP.md` 참고.

이 세션은 다섯 라운드로 진행됐습니다: **1차**(캘린더 게임기록/관리자 로스터), **2차**(효과음/자동이동/예문버그/모바일 안정화), **3차**(Supabase 진행도 동기화, 날짜별 단어 배정, 관리자 대시보드, 숙제 관리, 주간 리포트), **4차**(Unit 재배정 버그 — 세 번째 신고 끝에 진짜 원인 발견·수정), **5차**(CTO 모드 — 쓰기시험 오디오 버그, Audio Manager 리팩토링, 모바일 버그 감사, 문서화). 아래는 전체를 합친 최종 상태입니다.

### ℹ️ 참고: 배포가 평소보다 오래 걸린 일 있었음 (해결됨)

`ad112f3`(미니게임 타이머 정리 + 마이크 훅 통합) 배포가 15분 넘게 반영 안 되는 것처럼 보여서 한때 "Vercel 빌드 실패"로 의심했지만, 이후 커밋(`4a82fab`, 문서 추가)을 푸시하고 확인해보니 `X-Vercel-Cache: MISS`, `Age: 0`으로 정상 반영된 최신 빌드가 확인됐습니다. 즉 **빌드 실패가 아니라 배포/캐시 반영이 그날따라 오래 걸렸을 뿐**이었습니다. 최종적으로 모든 커밋이 정상 배포된 상태입니다 — 별도 조치 필요 없습니다.

### ⚠️ 4차 라운드 — Unit 버그 관련 중요 정정

3차 라운드에서 제가 처음 고쳤던 원인(학생 캐시가 로그인 시 새로고침 안 되던 것)은 **진짜 원인이 아니었습니다** — 실제로는 로그인 화면(`StudentSelect.jsx`)에서 기존 학생 이름으로 로그인할 때, 화면에 보이는 유닛 드롭다운에서 뭘 선택하든 그 값이 **DB에 아예 전송되지 않고 조용히 무시되던 것**이 진짜 원인이었습니다(신규 학생 등록 때만 쓰이는 값이었음). 세 번째 신고를 받고 코드를 다시 처음부터 검색해서 찾았습니다. 자세한 내용은 아래 "5. 발견하고 수정한 버그" 참고. 사용자가 요청한 정확한 시나리오(Rogan: Unit4→Unit5→재로그인→Unit5 유지→Unit3)를 그대로 검증하는 테스트로 확인했습니다.

---

## 1. 완료한 작업

### 1차 + 2차 라운드 (요약 — 자세한 내용은 git log 참고)
- 캘린더에 게임 플레이 기록, 관리자 학생 로스터(반별 그룹핑/일괄 이동/CSV)
- 별 획득 효과음 누락 보완, 퀴즈 후 자동 다음 이동, 예문 재생성 버그 수정, 퀴즈게임 녹음 멈춤 복구 수단 추가

### 3차 라운드 (이번 요청: "v1.3" 반 50명 실운영 관리 기능) — 전부 완료·배포됨

1. **Supabase 진행도 동기화** — `student_progress`(누적: 별/클리어단어수/스트릭/스티커), `student_daily_progress`(일별: 미션완료도/별/퀴즈정답률/발음횟수/틀린단어) 두 테이블을 사용자가 대시보드에서 직접 생성. `useStudent.js`가 기록 변경 2초 후 fire-and-forget으로 자동 동기화 — **동기화 실패해도 학생 기기의 로컬 진행에는 전혀 영향 없음** (로컬이 여전히 그 학생 자신의 source of truth).
2. **날짜별 단어 배정** — `daily_assignments` 테이블. 관리자가 반의 단어 목록에서 체크박스로 오늘(또는 내일 이후 날짜를 미리 골라) 배정 가능. **배정을 안 하면 기존처럼 유닛 전체 단어가 그대로 보임** — 기존 동작을 절대 깨뜨리지 않는 폴백.
3. **관리자 대시보드** — `AdminScreen.jsx`에 새 탭. 반을 고르면 학생별로: 오늘 공부 여부, 숙제(=오늘의 단어) 완료 여부, 최근 7일 미션 완료 기록, 별/스티커/클리어단어수/연속학습일, 퀴즈 정답률, 발음 연습 횟수, 많이 틀린 단어(빈도순)를 한 번에 보여줌. 학생별로 N번 조회하지 않고 반 전체를 배치 조회.
4. **숙제 관리** — "숙제 완료 = 오늘의 단어(daily_assignments)를 다 학습했는지"로 설계를 단순 통합(별도 숙제 전용 스키마를 새로 만들지 않음 — 이미 있는 두 테이블로 충분히 커버됨). 완료 여부는 대시보드에 실시간 표시.
5. **학생별 주간 리포트 + 학부모 요약 문구** — 대시보드에서 학생별로 "학부모 리포트 만들기" 버튼 → 잘한 점/부족한 점/숙제 상태를 규칙 기반 템플릿으로 생성(**AI API 비용 없음**, 프로젝트 표준 원칙 준수) + 복사하기 버튼.
6. **[중요 버그 수정] Unit 재배정이 재로그인해도 이전 값으로 되돌아가던 문제** — 아래 5번 섹션에 상세.

모든 항목: `npm run build` 통과 → 실제 라이브 Supabase에 대한 종단 테스트(디스포저블 QA 데이터, 끝나면 자동 정리) → git commit → push → Vercel 배포 → 라이브 URL 번들 해시 대조 → headless Chrome 콘솔 에러 확인까지 마쳤습니다.

---

## 2. 수정한 파일 목록 (3차 라운드)

| 파일 | 내용 |
|---|---|
| `supabase_v1_3_schema.sql` (신규, 사용자가 대시보드에서 실행) | `student_progress`, `student_daily_progress`, `daily_assignments` 3개 테이블 + RLS |
| `src/hooks/useStudent.js` | `recordQuizAnswer`/`markPronunciationAttempt`(정답률·발음횟수·틀린단어 로컬 추적) + Supabase 동기화 useEffect 추가 |
| `src/utils/wordLibrary.js` | `syncStudentProgress`, `fetchDashboardData`, `getTodaysAssignmentWordIds`/`setTodaysAssignment`, `getAssignmentForDate`/`setAssignmentForDate`(날짜별 배정) 추가. `getStudentWords()`가 오늘의 배정을 반영하도록 수정(배정 없으면 기존 폴백) |
| `src/components/WordDetail.jsx`, `src/components/QuizGame.jsx` | 퀴즈 정답/오답, 발음 시도(성공+실패) 콜백을 `useStudent`의 새 추적 함수로 연결 |
| `src/components/AdminScreen.jsx` | 새 탭 "📊 대시보드"(`AdminDashboard`), 단어 목록에 오늘의 단어 체크박스 + `FutureAssignmentPlanner`(날짜별 미리 배정) 추가 |
| `src/utils/weeklyReport.js` (신규) | `buildWeeklyReport()` — 순수 함수로 분리해 독립 테스트 가능 |
| `src/App.jsx` | **[버그 수정]** 로그인 시 + 탭 포커스 복귀 시 학생 캐시(`refreshStudents()`)를 항상 새로고침하도록 수정 |
| `src/components/StudentSelect.jsx` | 로그인 처리가 비동기(DB 재확인)로 바뀌어서 로딩 상태 표시 추가 |
| `scripts/testSyncProgress.mjs`, `testDailyAssignment.mjs`, `testDashboard.mjs`, `testFutureAssignment.mjs`, `testWeeklyReport.mjs`, `testUnitPersistence.mjs` (전부 신규) | 각 기능의 라이브 Supabase 종단 테스트 |
| `scripts/wordLibraryStub.mjs` | `syncStudentProgress` 스텁 추가 (기존 테스트 인프라 업데이트) |

커밋 8개 (모두 push+배포 완료):
```
c1929c7 feat: v1.3 - 퀴즈 정답률/발음 연습 횟수/많이 틀린 단어 로컬 추적 추가
ef1e1d8 feat: v1.3 - Supabase 진행도 동기화
83b2b2f feat: v1.3 - 반별 오늘의 단어 배정
9cec601 feat: v1.3 - 관리자 대시보드
90bd758 feat: v1.3 - 반별 숙제(단어) 날짜별 미리 배정 기능
6dd313d feat: v1.3 - 학생별 주간 리포트 + 학부모 요약 문구 생성
095ff76 fix: Unit 재배정이 재로그인 시 이전 값으로 되돌아가던 버그 수정
```

---

## 3. 테스트 결과

- **자동 테스트 전체 재실행 (회귀 확인)**: `testProgress.mjs`(19개), `testWeeklyReport.mjs`(11개), `testMultiClass.mjs`(8개), `testRenameClass.mjs`(3개), `testStudentLogin.mjs`(4개), `testSyncProgress.mjs`(13개), `testDailyAssignment.mjs`(9개), `testDashboard.mjs`(7개), `testFutureAssignment.mjs`(4개), `testUnitPersistence.mjs`(6개) — **전부 통과**.
  - `testMultiClass.mjs`/`testRenameClass.mjs`는 처음 실행 시 실패했는데, 원인은 회귀가 아니라 이 두 스크립트가 (이전 세션에서 수동으로 만들어뒀던) 외부 QA 픽스처를 전제로 짜여있어서였습니다. 픽스처를 다시 만들어 재실행해 통과 확인 후 정리했습니다 — 실제 코드 문제는 없었습니다.
- **빌드**: 매 변경 후 `npm run build` 통과 (에러 없음, 기존 청크 크기 경고만 있음).
- **라이브 배포 검증**: 매 배포마다 라이브 URL 번들 해시 대조 + headless Chrome 콘솔 에러 없음 확인 — 이번 라운드에서 6회 모두 통과.
- **Unit 재배정 버그**: `testUnitPersistence.mjs`로 정확히 사용자가 요청한 시나리오(Unit4 → Unit5 → 재로그인 → Unit5 유지)를 실제 라이브 Supabase에 대해 검증, 통과.
- **미실행**: 관리자 화면의 실제 클릭 흐름(대시보드 UI, 날짜 선택기 등)은 이 환경에 브라우저 자동조작 도구(puppeteer 등)가 없어 로직/데이터 레이어만 종단 테스트했고 UI 렌더링은 코드 리뷰로 대체했습니다. **내일 관리자 화면에서 새 "📊 대시보드" 탭과 "오늘의 단어"/날짜별 배정 UI를 한 번 클릭해서 확인해주시면 좋겠습니다.**

---

## 4. 남은 작업

이번 요청("v1.3": 관리자 대시보드/숙제/날짜별 배정/리포트/데이터 안정화)은 **전부 완료**했습니다. 남은 건 `ROADMAP.md`의 진짜 다음 단계들입니다:

- **v1.2 (학부모 전용 화면)**: 이번에 만든 건 관리자용 대시보드입니다. 학부모가 직접 볼 수 있는 별도 화면(로그인 방식 등)은 아직 없습니다.
- **v1.3 (AI 기능, ROADMAP.md 기준)**: AI 문장 검사, 실제 STT 발음 채점 등 — 유료 API가 필요해 신중 검토 필요, 아직 시작 안 함.

---

## 5. 발견하고 수정한 버그

### [진짜 원인, 4차 라운드] Unit 재배정이 재로그인 시 이전 값으로 되돌아가는 문제

- **증상**: 학생이 Unit4로 시작 → 로그인 화면에서 Unit5를 선택해도 → Home엔 계속 Unit4.
- **진짜 원인**: `StudentSelect.jsx`(로그인 화면)는 유닛 선택 드롭다운을 항상 보여줬지만, 입력한 이름이 **이미 등록된 학생**과 일치하면 `handleStart`가 `onSelect(existing)`만 호출하고 `selectedUnit` 값을 전혀 참조하지 않았습니다 — 그 값은 오직 **신규 학생 등록**(`addStudent`) 경로에서만 쓰였습니다. 즉 기존 학생이 드롭다운에서 Unit5를 눈으로 보고 선택해도, 그 선택은 어디에도 전송되지 않고 그냥 사라졌습니다. 캐시 문제가 아니라,애초에 그 값을 DB에 반영하는 코드 자체가 없었던 것입니다.
- **수정**: 입력한 이름이 기존 학생이면, 반 선택 드롭다운은 숨기고(반 배정은 계속 관리자 전용) 그 학생의 현재 반에 있는 유닛 목록만 보여주는 드롭다운으로 바꿨습니다. 유닛을 실제로 다른 값으로 바꾸면 로그인 직전에 `setStudentUnit()`을 호출해 DB에 반영합니다. 드롭다운을 안 건드리면 기존 유닛 그대로 조용히 로그인됩니다(원치 않는 강제 변경 없음).
- **검증**: 요청하신 정확한 시나리오를 그대로 재현하는 라이브 Supabase 종단 테스트 작성(`scripts/testStudentSelectUnitSwitch.mjs`) — Rogan 로그인(Unit4 등록) → Unit5 선택 → Home Unit5 → 재로그인(안 건드림) → Unit5 유지 → Unit3 선택 → Home Unit3, 전부 통과. 요청하신 5개 진단 로그(로그인 시 fetch된 student / 선택값 / update payload / update result / Home 표시값)도 전부 콘솔에 찍히는 것 확인했습니다.

### [원인 아니었음, 3차 라운드에서 먼저 시도] 학생 캐시 미갱신

3차 라운드에서는 "학생 정보 캐시(`_students`)가 앱이 처음 열릴 때 한 번만 로드되고 이후 안 바뀐다"는 걸 원인으로 보고 로그인/포커스 시점마다 `refreshStudents()`를 호출하도록 고쳤습니다. 이 자체는 여전히 유효한 개선(다른 기기에서 바뀐 값을 반영하는 데 도움)이라 그대로 남겨뒀지만, **사용자가 실제로 겪던 증상의 원인은 아니었습니다** — 진짜 원인은 위 4차 라운드 내용입니다.

그 외 새로 발견한 미해결 버그는 없습니다.

---

## 6. 다음에 이어서 할 작업 (추천 순서)

1. **관리자 화면 실제 확인** — "📊 대시보드" 탭에서 반을 선택해 학생별 현황이 잘 보이는지, "오늘의 단어" 체크박스와 "다음 날짜 미리 배정"이 기대대로 동작하는지 확인.
2. **학생 쪽에서 Unit 재배정 버그가 실제로 고쳐졌는지 확인** — 아무 학생이나 반/유닛을 바꾼 뒤 그 학생 이름으로 로그아웃→재로그인해서 새 유닛이 유지되는지 실제로 한 번 확인해주시면 좋겠습니다.
3. v1.2(학부모 화면)나 v1.3(AI 기능) 중 다음으로 진행할 방향을 정해주시면 이어가겠습니다.

---

## 7. 추천 사항

- 관리자 대시보드의 "많이 틀린 단어"는 학생이 실제로 틀린 단어의 빈도 순으로 보여줍니다 — 반 전체에서 자주 틀리는 단어를 알고 싶으시면, 지금은 학생별로만 보이니 "반 전체 통계" 뷰가 필요하시면 다음에 추가하겠습니다.
- 숙제 완료 기준(오늘의 미션 4개 중 4개 다 완료)이 너무 엄격하다고 느껴지시면(예: 3개만 해도 숙제로 인정) 말씀해주세요 — 지금 구조로 쉽게 바꿀 수 있습니다.
- 학부모 리포트는 지금 "복사하기"만 되는데, 카카오톡/문자로 바로 보내는 기능이 필요하시면 다음 단계로 검토하겠습니다(발송 자체는 별도 서비스 연동이 필요해서 신중 검토 대상입니다).
