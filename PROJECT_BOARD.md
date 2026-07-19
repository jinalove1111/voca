# PROJECT_BOARD.md — Paul Easy Voca 작업 보드

_작성: 2026-07-18. 이 보드가 작업 우선순위의 **단일 권위 소스**입니다.
새 작업을 시작하기 전에 여기서 카드를 확인/이동하세요. 카드는 전부
`ROADMAP.md`/`handoff.md`에 실제로 기록된 발견·백로그에서만 시딩했습니다
(추측/신규 발명 없음) — 각 카드의 "근거"에 원문 위치를 남깁니다._

## 사용법

- 컬럼: `BACKLOG`(아직 착수 계획 없음) → `NEXT`(다음에 집을 후보) →
  `IN_PROGRESS`(누군가 작업 중 — `.ai-status/`에 해당 task_id 상태 파일
  존재해야 함) → `VERIFY`(구현 완료, qa-reviewer/security-reviewer 검수
  대기) → `DONE`(검수 통과 + 문서화 완료) 또는 `BLOCKED`(운영자 조치 등
  외부 요인으로 정지).
- 우선순위 태그: `P0`(즉시/차단) / `P1`(높음, 데이터무결성·보안) /
  `P2`(보통, 유지보수성·커버리지) / `P3`(낮음, 코스메틱·편의).
- 카드를 옮길 때 `.ai-status/`에 대응하는 상태 파일도 함께 갱신하세요
  (규칙 17).
- 이 보드 갱신은 `docs-maintainer` 역할이 담당하되, 어떤 에이전트든
  자기 작업의 카드 이동은 직접 반영해도 됩니다(append 원칙과 달리 이
  보드는 "현재 상태" 스냅샷이라 덮어쓰기가 정상 동작입니다).

---

## BLOCKED

### [P2] `verify:login` 로컬 4/7만 PASS — `SUPABASE_SERVICE_ROLE_KEY` 로컬 부재
- 근거: `handoff.md` 2026-07-18 "개발자 인프라 구축" Phase 6, "Phase 6 최종
  검증 매트릭스"(`TESTING.md`).
- 상태: PIN 관련 라이브 e2e 4개(`testStudentSelectPinStatus`/
  `testStudentPinAuth`/`testStudentPinSelfSetup`/`testClearStudentPin`)가
  로컬 `.env`/`.env.local`에 service role key가 없어 anon key로 폴백 →
  v1.9 컬럼권한이 anon의 PIN 컬럼 접근을 차단해 FAIL. **프로덕션(Vercel)은
  정상** — 이번 라운드 신규 회귀 아님.
- 차단 해제 조건: 운영자가 로컬 `.env.local`에
  `SUPABASE_SERVICE_ROLE_KEY` 추가.
- **2026-07-19 추가 확인**: `supabase_v2_3_paul_rank.sql`(Paul Rank
  System) 실행 후 `scripts/testXpLedgerDb.mjs`도 정확히 같은 근본
  원인으로 SKIP됨(`xp_ledger` 테이블 자체는 라이브로 존재 확인됨 —
  `api/grant-xp.js`를 QA 학생 대상 직접 호출한 결과 anon key 폴백이
  RLS로 정확히 차단되는 것까지 실측, "정상 지급 성공" 경로만 서비스롤
  키 부재로 로컬 미검증). 신규 이슈 아님 — 이 카드가 막는 범위가
  로그인/PIN 4개 스크립트에서 XP 원장 1개 스크립트로 확장된 것뿐.
  상세: `handoff.md` 2026-07-19(3차).

---

## NEXT

### [P1] 핵심 4테이블(`students`/`classes`/`units`/`words`) DDL이 저장소에 없음
- 근거: `DATABASE.md` "핵심 4테이블 — 저장소에 DDL 없음" 섹션,
  `handoff.md` 2026-07-18 Phase 2 발견 1.
- 내용: 초기에 Supabase 대시보드에서 직접 생성된 뒤 한 번도
  `supabase_*.sql`로 백필되지 않음 — 새 Supabase 프로젝트에서 이
  저장소만으로 스키마 전체를 재현 불가(재해복구 리스크).
- 해결 방법(문서화됨): 운영자가 Supabase 대시보드 SQL Editor에서
  `information_schema.columns`를 service_role 권한으로 조회해
  `supabase_v0_core_schema.sql`로 백필. anon key로는 PIN 컬럼 등 권한
  차단된 컬럼까지 정확히 못 얻어 에이전트가 로컬에서 완전히 대신할 수
  없음 — 운영자 액션 필요.

### [P2] `classes`/`units`/`words` — RLS/GRANT SQL이 저장소에 없음
- 근거: `DATABASE.md` "RLS / 컬럼권한 현황" 마지막 항목.
- 내용: 이 3개 테이블에 대한 `enable row level security`/`create policy`가
  어떤 마이그레이션 파일에도 없음 — 위 4테이블 DDL 부재와 같은 뿌리의
  기술부채(원본 대시보드 설정을 파일로 확인 불가).

---

## BACKLOG

### [P2] `AdminScreen.jsx` 1714~1715줄 — 분해 검토
- 근거: `handoff.md` 2026-07-18 "Phase 3(성능)+Phase 5(유지보수성)" 큰
  컴포넌트 확인, `ROADMAP.md` 남은 Medium/Low.
- 내용: 저장소 최대 컴포넌트. 이미 `React.lazy`로 관리자 전용 청크
  분리돼 있어 번들 영향은 없음(성능 이슈 아님) — 내부 다수 state/effect가
  얽혀 있어 안전한 분해에 별도 세션 필요(유지보수성 이슈).

### [P2] 다중 탭 로컬스토리지 last-writer-wins 잔여 유실 창
- 근거: `ARCHITECTURE.md` "영속성 전략" 알려진 잔여 위험,
  `handoff.md` 2026-07-18 Phase 1 발견 1.
- 내용: 같은 기기의 두 탭이 동시에 열려 있으면 `localStorage`
  write-through 자체가 서로 덮어쓸 수 있음 — 각 탭이 최소 1회 클라우드
  동기화를 마치면 다음 로그인 병합 복원이 수렴시키므로 실사용 위험은
  낮음(초등 공부방 단일기기·단일탭 패턴). 근본 수정은 `storage` 이벤트
  기반 탭 간 동기화(설계 변경 필요, 다음 세션 후보로 명시적으로 보류됨).

### [P2] `api/verify-admin-pin.js` 정식 rate limit 부재
- 근거: `handoff.md` 2026-07-18 Phase 4 보안 감사 "재확인 — 기존에 알려진
  Medium/Low" #1. 여러 세션째 운영자 결정 대기 중인 항목.
- 내용: 실패 시 1.5초 지연만 있고 정식 rate limit/잠금 없음(학생 PIN은
  5회 DB 잠금과 비대칭). 관리자는 원장 1인이라 위협 모델상 우선순위
  낮게 유지 중 — 서버리스 인메모리 카운터 등 과설계는 운영자 지시로
  보류.

### [P2] 학생 자기등록 부분 실패 시 계정 고아 상태
- 근거: `handoff.md` 2026-07-18 "전체 워크플로우 QA 파괴 테스트 스윕"
  발견 Medium #1 — `src/components/StudentSelect.jsx:82-89`.
- 내용: `addStudent()` 성공 후 `/api/set-student-pin` 호출이 네트워크
  실패 등으로 실패하면 학생이 DB엔 있지만 로그인도 PIN 생성도 막힘 —
  관리자가 로스터에서 "PIN 설정 허용"으로 수동 복구 가능(크래시/유실
  없음). 재현엔 좁은 네트워크 타이밍 창 필요.

### [P3] 엑셀 업로드 — 빈 파일/시트 없는 파일 방어 없음
- 근거: 위와 동일 섹션, 발견 Medium #2 —
  `src/components/AdminScreen.jsx:1028-1037`(`ExcelUpload.handleFile`).
- 내용: `wb.SheetNames[0]`가 없는 파일 선택 시 의미있는 에러 메시지 없이
  실패 가능(try/catch 없음). 관리자 전용 화면 + 정상 학원 엑셀이면
  발생하지 않는 입력이라 우선순위 낮음.

### [P3] CI 자동화 없음
- 근거: `handoff.md` 2026-07-18 "개발자 인프라 구축" 남은 기술부채.
- 내용: `npm run verify:xxx`를 사람이 수동 실행하는 전제 — GitHub
  Actions 등으로 push/PR 시 자동 실행하면 `healthCheck.mjs`의 Testing
  점수 상승 여지.

### [P3] `speaking`/`listening`/모바일 실기기 QA 체크리스트 문서화
- 근거: `handoff.md` 2026-07-18 개발자 인프라 남은 기술부채,
  `TESTING.md` Phase 6 최종 검증 매트릭스 GAP 표기.
- 내용: headless 환경 구조적으로 자동화 불가한 영역(오디오 재생/녹음/
  실기기 터치) — 별도 `MOBILE_QA.md` 체크리스트로 절차 커버 가능(다음
  세션 후보로 이미 제안됨).

### [P3] `eslint`/`tsconfig` 부재
- 근거: `handoff.md` 2026-07-18 개발자 인프라 남은 기술부채
  (`healthCheck.mjs` Code Quality 감점 근거).
- 내용: 도입 여부는 외부 의존성 최소화 원칙과 트레이드오프라 운영자
  판단 필요.

### [P3] `pdf.worker.min.mjs`(1.2MB)/`pdf-*.js`(472KB) 번들 크기 재검토
- 근거: `handoff.md` 2026-07-18 Phase 5 남은 Medium/Low.
- 내용: 기존에도 보류된 항목 — 사용 빈도 대비 실효성 재검토 필요(제거는
  아님, PDF 업로드 기능 자체가 이 라이브러리에 의존).

### [P3] 미사용 코스메틱 export/헬퍼 정리
- 근거: `handoff.md` 2026-07-18 Phase 5 "보류 유지" 목록.
- 내용: `speech.js`의 `listenFor`/`hasSpeechRecognition`(오디오 최민감
  영역이라 보류), `playAudioUrl`/`speak`·`entranceTest.js`
  `ENTRANCE_DIRECTIONS`·`matchGame.js` `FILLER_MEANINGS`·
  `wordLibrary.js` `memoryTipFor`(export만 불필요) · feature-flag 미사용
  헬퍼 6종(`areAllFeaturesEnabled`/`resetFeatures`/`hasAllPermissions`/
  `hasAnyPermission`/`canRenderAnyFeature`/`debugFeatureAccess`) — 전부
  코스메틱, 손대도 동작 불변.

### [P3] 반 삭제 확인 다이얼로그 문구 개선
- 근거: `handoff.md` 2026-07-18 Phase 2 발견 2, `DATABASE.md` 반 삭제
  섹션.
- 내용: 반 삭제는 `ON DELETE SET NULL`로 학생 계정/진행도가 보존됨이
  라이브 실측으로 이미 확정됐으나, 확인 다이얼로그 문구에 "학생 계정은
  유지되고 반 배정만 해제됩니다"를 추가하면 관리자 불안감 감소(안전성
  자체는 이미 확정 — 순수 UX 개선).

### [P3] `api/student-pin-status.js` 무인증
- 근거: `handoff.md` 2026-07-18 Phase 4 보안 감사 재확인 목록 #2.
- 내용: booleans만 노출, 정보 노출 미미 — 낮은 우선순위 유지.

### [P3] 게임화(Gamification) — `GAME_DESIGN.md` 설계 완료, 착수는 운영자 승인 필요
- 근거: `GAME_DESIGN.md`(신규, 2026-07-18, Engineering Head 순수 설계
  세션 — 코드/스키마 변경 0건). CLAUDE.md 규칙 12("학생 대상 신규
  기능/UI/게임화는 이번 'AI 개발 운영체제' 구축 범위에서 절대 금지")에
  따라 이 카드들은 **설계 문서화 단계일 뿐** — 실제 구현 착수는 운영자
  승인 후 아래 순서대로 BACKLOG → NEXT로 개별 이동.
- 하위 카드(의존성 순서, `GAME_DESIGN.md` "구현 순서 제안" 섹션 그대로):
  1. **Anti-cheat 인프라 선행 — 2026-07-19 구현 완료(VERIFY 카드로 이동,
     위 VERIFY 섹션 참고)** — `api/submit-entrance-result.js` 신설
     (기존 `[P1] 입실시험 결과 서버 재검증 없음` 카드와 동일 항목, Word
     King의 필수 선행조건으로 재확인됐던 것). `GAME_DESIGN.md` 11번 섹션.
     RLS 강화 SQL은 운영자 실행 대기지만, Word King(7번) 착수 자체를 막던
     선행조건은 해소됨.
  2. Player Progression/XP 표준화 — 새 저장 필드 없이 기존
     `student_progress.total_xp`(=`totalStars` 사본)를 그대로 재사용해
     레벨 공식만 정의. `GAME_DESIGN.md` 1·2번 섹션.
  3. Teacher Controls 마스터 스위치 — `classes.gamification_enabled`
     등 신규 컬럼(기본 false, `spelling_test_enabled` opt-in 관례
     재사용). `GAME_DESIGN.md` 13번 섹션.
  4. Hat Evolution — `student_progress.hat_stage` 신규 컬럼(레벨의
     순수 파생값, 병합은 기존 `maxNum` 재사용). `GAME_DESIGN.md` 3번
     섹션.
  5. Ticket Economy — `progress_data.ticketLedger`(append-only,
     `diaryPlacements`/`diaryRemovedIds` tombstone 패턴 재사용, 원시
     잔액 저장 금지 — `mergeProgressRecords`의 `maxNum` 단조증가
     가정과 충돌하기 때문). `GAME_DESIGN.md` 4번 섹션.
  6. Daily Missions 후킹(기존 4/4 완료 `useEffect`에 티켓 지급만 추가,
     새 트래킹 없음) + Rewards 티켓 상점(비확률형, 실결제 0건) — 소스/
     싱크 동시 배포. `GAME_DESIGN.md` 7·10번 섹션.
  7. Word King — 신규 `word_king_history` 테이블(anon read-only +
     service_role 전용 write, 기존 게임화 테이블과 달리 `"allow anon
     all"` RLS 쓰지 않음). **1번 선행 필수.** `GAME_DESIGN.md` 5번 섹션.
  8. House System(`students.house_id` 신규 컬럼 — GRANT 필수, CLAUDE.md
     규칙 10) + Weekly Events(`classes.weekly_event_enabled`).
     `GAME_DESIGN.md` 6·8번 섹션.
  9. Seasonal Progression — Ticket/House 리셋 경계만 신규(레벨/뱃지/
     스트릭은 영구 유지, 절대 리셋 안 함). `GAME_DESIGN.md` 9번 섹션.
  10. Parent Motivation 노출 — `computeStudentStats()`/
      `buildWeeklyReport()` 확장만(새 Supabase 쿼리·새 AI 호출 없음).
      `GAME_DESIGN.md` 14번 섹션.
- 명시적 비-대상(재확인만, 이번 카드 범위 아님): `config/features.js`의
  `ranking`/`pointSystem`/`leaderboard`/`rewardSystem` 플래그는 죽은
  코드(`useFeatureAccess.js` 무사용 확인) — 재사용하지 않고 건드리지도
  않음(append-only 원칙, 삭제는 별도 CTO 판단 필요 시에만).
- **리뷰 후속(2026-07-19, `GAME_DESIGN.md` 16번 섹션 "리뷰 및 개선
  제안" — 신규 카드 아님, 기존 하위 단계에 반영할 조정 사항만 기록):**
  7번(Word King) 착수 시 점수 산정 소표본 왜곡 보정(16.3)과 부차
  Anti-cheat 갭 조기 관측용 이상치 표(16.6)를 **같은 라운드에 포함**
  권장 — 후속으로 미루면 이미 배포된 공식/운영 관례 변경 비용이 더
  커짐. 6번(Daily Missions+Rewards) 착수 시 가챠 일일 체감 로직(16.1)
  과 티켓 상점 입문가 아이템(16.4)을 함께 검토. 7번 이후 성장상 병행
  발표(16.2), 8번(House) 착수 시 최소인원 배정+시즌 재조정 규칙
  명문화(16.5) 반영 권장. 전부 설계 단계 제안이며 착수는 여전히
  운영자 승인 후.
- **1단계 구현 완료(2026-07-19, "Paul Rank System 기반" 운영자 지시,
  Engineering Head)** — 위 하위 카드 중 **2번(XP 표준화)과 4번(Hat
  Evolution)의 계산/설정 아키텍처만** 구현됨(실제 시각/미니게임/티켓/
  Word King/House는 여전히 미구현, 아래 항목 계속 BACKLOG):
  - 2번은 원문 계획(`total_xp` 재사용)과 다르게 구현됨 — 운영자가 "별을
    조용히 XP로 변환하지 말라"고 명시 지시해 원문 전제가 정정됨. XP는
    독립 원장(`xp_ledger`, 신규 SQL `supabase_v2_3_paul_rank.sql`, 운영자
    실행 대기)에 서버(`api/grant-xp.js`)만 쓴다. 상세는 `GAME_DESIGN.md`
    "3.x 구현 갱신" 항목과 `wiki/decisions.md` 항목 9.
  - 4번(Hat Evolution)도 원문 계획(`student_progress.hat_stage` 사본
    컬럼)과 다르게 구현 — 컬럼을 두지 않고 `computeRankState(xp)` 순수
    함수로 매번 파생 계산(`src/utils/paulRankShared.js`).
  - **1번(Anti-cheat 선행, `api/submit-entrance-result.js`)은 이 시점엔
    미구현이었음** — 이 카드 작성 당시엔 Word King에 착수하지 않아 이
    선행조건이 막는 대상이 아직 없었다. **2026-07-19(5차)에 별도 세션에서
    구현 완료** — 위 VERIFY 섹션과 하위 카드 1번 항목 참고.
  - 3번(Teacher Controls 마스터 스위치)도 미구현 — 이번 세션 범위 아님.
  - 신규 관련 문서: `TESTING.md`(`testPaulRank.mjs`/`testXpLedgerDb.mjs`),
    `DATABASE.md`(`xp_ledger`/`xp_totals`), `handoff.md` 2026-07-19 항목.
- **v2.3.1 버그 수정(2026-07-19, XP 행동 단위 리팩터링, Engineering
  Head)** — 운영자가 실제 프로덕션에서 "XP가 단어 단위로 지급된다"(무한
  파밍 위험)를 발견, 위 2번(XP 표준화)의 트리거를 "단어"에서 "행동(그날의
  학습 카테고리 완료)"으로 재배선. `mission-clear`/`duplicate-sticker-
  bonus`/`spelling-combo-N` 3개 이벤트를 XP 트리거에서 제거(별 지급은
  유지)하고, 운영자 지정 8개 행동 단위 이벤트로 `XP_EVENT_TABLE` 재정의.
  Word King/Hat 시각/House/티켓은 여전히 미구현(그대로 BACKLOG) —
  `word-king-complete`/`weekly-streak`/`special-event`는 이번에 이벤트
  타입 슬롯만 예약(`status:'planned'`, 서버가 실제 지급 거부, 실제
  기능 구현 아님). 스키마는 `xp_ledger`/`xp_totals` 그대로 유지(신규
  `supabase_v2_3_1_xp_action_based.sql`은 조회 인덱스 1개만 추가) — 상세는
  `wiki/decisions.md` #10, `GAME_DESIGN.md` "3.y" 항목, `handoff.md`
  2026-07-19 항목.

---

## IN_PROGRESS

_(현재 없음 — 작업 시작 시 여기로 카드 이동 + `.ai-status/` 상태 파일 생성)_

## VERIFY

### [P1] 입실시험 결과 서버 재검증 없음 (보안 Medium) — 구현 완료, 검수 대기
- 근거: `handoff.md` 2026-07-18 "Production Readiness Phase 4 보안 감사"
  신규 발견 — `src/utils/entranceTestApi.js:126`(`submitEntranceResult`),
  `supabase_v1_8_entrance_test.sql:63-64`(anon 전체 CRUD RLS). 구현은
  `handoff.md` 2026-07-19(5차), Engineering Head.
- 내용(수정 전): 클라이언트가 계산한 점수를 서버 재검증 없이 그대로 저장 +
  RLS가 `using (true) with check (true)`라 anon key로 임의 `student_id`/
  `test_id`의 점수를 조작 가능(재현 실측 완료, 데이터 변경 없이 확인).
- 구현 완료 내용: `api/submit-entrance-result.js` 신설 — 클라이언트는
  원본 답안(`{word, direction, input}` 배열)만 보내고, 서버가
  `entrance_tests.words`/`direction`을 DB에서 직접 조회해 순수 함수
  `computeTestResult()`(`src/utils/entranceTest.js`)로 재채점한 결과만
  저장. 문제 개수 축소/단어 중복/가짜 단어/방향 위장 4종 조작을 명시
  거부(reason 코드까지 테스트로 확인). `entranceTestApi.js`의 기존 anon
  직접 upsert 경로 제거, `EntranceTest.jsx`의 "응시 → 즉시 결과" UX는
  로컬 계산을 그대로 유지해 불변. RLS 강화 SQL
  (`supabase_v2_4_entrance_result_rls.sql`, 멱등)도 작성 완료 —
  **운영자 실행 대기**(미실행이어도 서버 재검증 자체가 이미 1차 방어).
- 검증: `node scripts/testEntranceTest.mjs`(순수 로직 55개 체크 PASS,
  무관 확인), `node scripts/testEntranceTestDb.mjs`(라이브 e2e, 신규
  "7.5. 조작 시도 거부" 섹션 포함 전부 PASS), `npm run build` PASS,
  `npm run verify:admin`(5개 스크립트 전부 PASS).
- 위협 모델 참고: 결제/PII/계정탈취 아님 — 학원 내부 "오늘의 VIP" 경쟁
  배지 조작 한정이라 Medium(Critical 아님).
- 검수 대기 사항: qa-reviewer/security-reviewer 코드 리뷰, 운영자의
  `supabase_v2_4_entrance_result_rls.sql` 실행 여부 판단.

## DONE (최근 완료, 참고용 — 전체 이력은 `ROADMAP.md`/`handoff.md`)

- 개발자 대시보드(`scripts/generateDashboard.mjs`, `npm run dashboard`)
  신설(Engineering Head, 2026-07-18) — PROJECT_BOARD.md(읽기 전용 파싱)/
  Health Check/Verify 결과(`--with-verify` 옵션, 기본은 캐시)/
  `.ai-status`/git 상태/wiki 검색 안내 6개를 self-contained 단일
  HTML(`dashboard/index.html`, 산출물은 `.gitignore`)로 통합. 새 npm
  패키지 0개(Node 내장 fs/child_process만), `src/`/`App.jsx`/Vercel
  배포 대상 변경 0건(학생 앱과 완전 분리), `npm run build` 번들 해시
  불변 확인. PROJECT_BOARD 카드 수(16개) 대시보드 표시와 정확히 일치
  확인, `--with-verify`로 13개 도메인 실 재실행 캐시 생성 확인(login
  도메인은 기존에 이미 BLOCKED로 기록된 로컬 service-role-key 부재로
  FAIL — 신규 회귀 아님). 근거: 이 handoff.md 최상단 세션 기록,
  `DEVELOPER_GUIDE.md` "개발자 대시보드" 섹션.
- 경량 로컬 Wiki(`wiki/HOME.md` + 하위 7페이지) + `npm run wiki:search`
  신설(Engineering Head, 2026-07-18) — 기존 6개 문서/`handoff.md`를
  복제하지 않고 요약/색인만 하는 레이어. 벡터DB/유료 API/대시보드/모바일
  QA/학생 기능 없음(운영자 명시 금지 범위 준수). 링크 25개 전수 검증
  PASS(파일+앵커 둘 다), `npm run build` 통과, 코드 변경 없음(순수
  문서/스크립트). 근거: 이 handoff.md 최상단 세션 기록,
  `wiki/HOME.md`.
- v2.2 — 다중 기기 진행도 병합(last-writer-wins 제거), `syncGenRef` 세대
  카운터로 동기화 중첩 레이스 수정 (`ROADMAP.md` v2.2, `handoff.md`
  2026-07-18 Phase 1)
- v2.1 — 학생-Unit 아키텍처 분리(`current_unit_id` FK 도입, 유닛별
  이어서-학습) (`ROADMAP.md` v2.1)
- Production Readiness 5개 영역 종합 감사 — production-ready 판정
  (Persistence 88 / Database 92 / Performance 78 / Security 90 /
  Maintainability 등, `ROADMAP.md` 2026-07-18 섹션)
- 데드코드 4파일 제거(`HiddenFeatures.jsx`/`hiddenFeatures.js`/
  `dataSchemas.js`/`usePaulReaction.js`)
- 테스트 하네스 레지스트리(`tests/harness/`) + `npm run verify:*` 14종 +
  `scripts/healthCheck.mjs` 신설 (`handoff.md` 2026-07-18 개발자 인프라)
- 문서 체계 6종 신설(`PROJECT_GUIDE.md`/`ARCHITECTURE.md`/`DATABASE.md`/
  `DEVELOPER_GUIDE.md`/`TESTING.md` + `ROADMAP.md` append)
