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

### [P0] PR #8 merge 결정 — 운영자 승인 대기 (2026-09-03, 105차)
- 근거: `handoff.md` 2026-09-03(105차),
  https://github.com/jinalove1111/voca/pull/8 (브랜치
  `fix/pin-setup-and-unit-fallback`).
- 내용: 야간 세션 커밋 다수(재발 방지 가드 4종 + Production Safety
  Harness 강화 + WARN 10 분석 + 보안 마스킹 7건) 추가 후 재push 완료.
  Release Gate 결과는 아침 보고서에서 확인 필요 — merge 는 운영자 승인
  후에만.

### [P1] `supabase functions deploy admin-content-write` 배포 대기 — class.delete 가드 반영 (2026-09-03, 105차)
- 근거: `handoff.md` 2026-09-03(105차) 커밋 `2f63ff2`.
- 내용: Edge Function `class.delete` 에 학습기록 fail-closed + force
  옵션을 코드로 반영했으나 실제 배포는 운영자만 실행 가능(에이전트는
  Supabase 대시보드/CLI 배포 권한 없음). 배포 전까지는 옛 무가드 버전이
  라이브에서 계속 동작.

### [P1] 유령 SCA 재배정 승인 1회 대기 — WARN 10 해소 (2026-09-03, 105차)
- 근거: `handoff.md` 2026-09-03(105차) 커밋 `a9bcb65`,
  `docs/audit/2026-09-03-warn10-readonly-analysis.md`.
- 내용: `node scripts/prod/generateGhostScaManifest.mjs --dry-run-hotfix`
  재실행 → 생성된 `<runId>.apply.sql` 을 SQL Editor 에 1회 붙여넣기
  (또는 토큰 등록 후 `prod:hotfix` APPLY) → `npm run prod:check` 로
  WARN 10 → 0 확인. 대상 11행(A조 5/B조 6), 라이브 dry-run
  ready-to-apply 확인됨(DB WRITE 0).

---

## NEXT

### [P1] `getStudentWords` usingOverride 분기의 첫 유닛 폴백 — 운영자 판단 대기 (2026-08-30 야간 감사)
- 근거: `src/utils/wordLibrary.js` `getStudentWords` 의 `usingOverride`
  분기(해당 줄에 같은 내용의 주석을 남겨 뒀다).
- 내용: 2026-08-29/30 수정으로 `resolveStudentUnitObj`/`setStudentClass`/
  `setStudentUnit`/`setStudentsClassBulk` 에서 "이름으로 못 찾으면 반의
  첫 유닛" 폴백을 제거했는데, 이 분기에만 `|| units[0]` 가 남아 있다.
  배정 행의 `current_unit_id` 가 없으면 그 반의 첫 유닛 단어를 조용히
  보여준다 — 실측상 첫 유닛 자리에 0단어 유닛 2개와 1단어 유령 유닛
  7개가 있어 같은 계열의 무증상 실패가 가능하다.
- **고치지 않은 이유(중요)**: 라이브 실측 결과 `student_class_assignments`
  482행 중 `current_unit_id` 가 NULL 인 행이 **212행(44%)**, 그중
  `is_primary=true` 가 203행이다. 그대로 null 로 바꾸면 그 학생들이 지금
  보던 화면 대신 **0단어**를 보게 된다. "첫 유닛을 보여준다" vs "빈 상태로
  안내한다" 중 무엇이 맞는지는 제품 판단이라 에이전트가 임의로 정하지 않았다.
- 선행 조건: 유령 유닛 9개 정리(0단어 2 + 1단어 7)가 먼저면 위험이 크게
  줄어든다 — 다만 그건 DB DELETE 라 운영자 SQL 실행 필요(헌법 규칙 8).

### [P2] 유령 유닛 9개 정리 — 운영자 SQL 실행 필요 (2026-08-30 야간 감사)
- 근거: `npm run health:students` 유령 유닛 인벤토리 + 라이브 유닛 50개
  전수 단어 수 실측.
- 내용: 0단어 유닛 2개(둘 다 이름이 `Unit 1`) + 1단어 유령 유닛 7개
  (엑셀 헤더 라벨이 단어로 저장된 잔재) = 50개 중 9개(18%)가 학습 불가
  상태다. 현재 배정된 실학생은 0명이라 즉시 피해는 없지만, 위 P1 폴백과
  `setPrimaryTextbook` 의 "단어 있는 첫 유닛" 선택이 1단어 유령 유닛을
  **정상 유닛보다 먼저** 고를 수 있다.
- 순서 주의: 폴백 제거(2026-08-29/30, 완료)가 먼저였고 그다음이 정리다.
  순서를 뒤집으면 정리 중에 학생이 다른 유닛으로 옮겨갈 수 있었다.
- 에이전트는 SQL 파일만 준비할 수 있고 실행은 운영자 몫이다(헌법 규칙 8).
  이번 야간 세션은 SQL 파일도 만들지 않았다(운영자 지시 범위 밖).

### [P1] `supabase_v3_34_account_status.sql` + `supabase_v3_35_entrance_textbook_backfill.sql` 실행 대기 — "고1 능률 민병천" 분모 10 vs 실제 12 사고 해결
- 근거: `handoff.md` 2026-08-11(94차), `docs/ENTRANCE_EXAM_ELIGIBILITY.md`
  6번 "2026-08-11(94차) 추가", `docs/operations/2026-08-11-entrance-
  roster-backfill.md`.
- 내용: 94차 세션이 분모 10 vs 실제 12 차이를 "누락 4명(SCA 행 부재/
  중복계정 오염) − 오집계 2명(테스트 계정 Barry/Jinaa)"으로 완전히
  분해·확정. 순서: ① `supabase_v3_34_account_status.sql`
  (`students.is_test`/`archived` 컬럼 + GRANT + 이름 규칙 백필, 롤백
  포함) 실행 → ② `supabase_v3_35_entrance_textbook_backfill.sql`
  (황다은/김규민/현다율/권교빈 canonical 계정에 능률 교재 SCA 행 4개
  순수 INSERT, 멱등) 실행 → ③ 관리자 화면에서 "고1 능률 민병천" 분모가
  12명인지 육안 확인.
- 미확인(정직 기록): SQL 실행 전이라 실제 적용 후 분모가 사전 시뮬레이션
  대로 정확히 12명이 되는지는 **아직 확인되지 않음**.
- ⚠️ 2026-08-30 정정: 아래 "아직 미커밋"은 사실이 아니다 —
  `src/utils/accountStatus.js`는 `f228b5c`로 이미 커밋됐다. SQL 두 개의
  **실행 대기**만 여전히 유효하다(라이브 재확인: `students.is_test` 조회가
  HTTP 400 / 42703 이라 v3_34 미실행 확정).
- 관련 코드 변경(당시 워킹트리 기준 기록, 지금은 커밋됨): `src/utils/accountStatus.js`
  (테스트/아카이브 계정 판별 단일화, `barry` 테스트 계정 추가) —
  `fetchEntranceRosterForClass`/`compute-word-king.js`/
  `EntranceTestAdmin.jsx`/`StudentSelect.jsx`/`StudentDirectory.jsx`
  5곳에 적용. `npm run build`/`verify:eligibility`(44/44)/`verify:admin`/
  `verify:all` 전부 PASS. 다음 세션이 리뷰 후 커밋 필요.

### ~~[P1] 별(star) 오염 버그~~ — **해결됨(2026-08-12, `3590cd5`). DONE으로 이동 대상**
> ⚠️ 2026-08-30 야간 감사 정정 — 이 카드는 이미 해결된 문제가 NEXT에 남아
> 있던 것이다. `claimName()` 이름 키 소유권 가드가 `loadRecord` 앞에
> 추가됐고(`useStudent.js:694-705`), 회귀 테스트
> `scripts/testStarDeltaOnEntry.mjs`(6시나리오 25단언)가 registry에 등록돼
> `verify:all`에서 실행 중이다. 아래 본문은 당시 원인 분석 기록으로만
> 남긴다 — **다시 고치지 말 것**(헌법 규칙 3).
- 근거: `handoff.md` 2026-08-11(94차) "별 오염 버그" 섹션.
- 내용: `src/hooks/useStudent.js:645-659`의 `loadRecord`가 이 기기에서
  처음 보는 `studentId`에 대해 `store[legacyName]`(이름 문자열 키)로
  로컬 진도를 찾아 **소유자 검사 없이** 채택 → 396-398행
  `normalizeRecord`가 `studentId: id`로 덮어써 남의 진도를 이 계정
  것으로 만듦 → 554행 마운트 병합이 `maxNum`으로 보존 → 1553-1584행
  디바운스 동기화가 그 값을 새 계정 UUID로 Supabase 업로드. 로그아웃
  (`App.jsx:953`)은 세션 키만 지우고 진도 저장소는 지우지 않음.
- 실측 증거: 같은 기기·같은 이름의 "권교빈" 계정 5개가 119별을 공유,
  그중 2개는 별/스티커/학습일까지 완전 동일한 클론.
- 별 지급 자체(`useStudent.js:891` `grantReward`)는 6개 호출부 전부
  실제 행동에 묶여 있어 지급 경로 자체의 결함은 아님 — 오염은 **로컬
  진도 복원 경로**에서만 발생.
- 이번 세션은 수정하지 않음(원인 특정까지만). 착수 전 회귀 테스트
  2종(신규 계정 마운트 시 stars 0 유지 / 이름 키 블롭이 남은 기기에서
  새 UUID 오염 방지)을 먼저 작성해 수정 전 코드로 FAIL 재현 필요(규칙
  15).

### [P2] 권교빈/전하은 중복 계정 통합 여부 — 운영자 판단 대기
- 근거: `handoff.md` 2026-08-11(94차) "중복 계정 포렌식 결론".
- 내용: 권교빈 canonical `6548dd2a…`(별 1039) vs DUP
  `942e7e12…`(고유 학습분 159별, 나머지 119별은 canonical과 중복 —
  계정 간 별 합산 금지). 전하은 canonical `16fa6e1c…` vs DUP
  `89e62c9f…`(고유 학습 92별, 기기별로 다른 계정을 쓰는 상태로 추정,
  중복 지급 아님). 이번 세션은 포렌식만 수행하고 병합/삭제는
  하지 않음 — 병합 여부·방법은 운영자 판단 필요.

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

### ~~[P3] `api/student-pin-status.js` 무인증~~ — **P0였음. 2026-08-29 차단 완료(`c09b09c`)**
> ⚠️ 2026-08-30 정정 — 아래 "정보 노출 미미, 낮은 우선순위" 판정은 **틀렸다.**
> 이 boolean 하나(`pinSetupAllowed`)가 계정 탈취 체인의 열쇠였다:
> anon key로 `students.id` 열거(라이브 HTTP 200) → 무인증 status API로
> `pinSetupAllowed` 열거(anon 직접 조회는 42501로 막혀 있는데 service_role이
> 우회 노출) → 무인증 `self-set-student-pin`으로 임의 PIN 선점 →
> `verify-student-pin` 로그인 → `signSessionToken` 발급 → 보상 원장 쓰기
> 권한 획득. 즉 2026-08-24 세션 토큰 인증 강화가 통째로 무력화되는 경로였다.
> **교훈: "노출되는 값이 작다"가 아니라 "그 값으로 무엇을 할 수 있나"로
> 판정해야 한다.** 비슷한 카드를 다시 P3로 내리기 전에 이 문장을 볼 것.
- 조치: 관리자 발급 1회용 setup code(SESSION_SECRET HMAC 파생, TTL 20분,
  DB 컬럼 추가 0)를 제2 인증 요소로 요구 + status API 배치 상한 100(보조 방어).
  회귀 테스트 `scripts/testPinSetupCapability.mjs` 65단언.
- 근거: `handoff.md` 2026-07-18 Phase 4 보안 감사 재확인 목록 #2(원래 판정).

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
     **2026-07-19 구현 완료 — 위 VERIFY 섹션 참고.**
  8. House System(`students.house_id` 신규 컬럼 — GRANT 필수, CLAUDE.md
     규칙 10) + Weekly Events(`classes.weekly_event_enabled`).
     `GAME_DESIGN.md` 6·8번 섹션. **2026-07-19 구현 완료 — 위 VERIFY
     섹션 참고.**
  9. **Seasonal Progression — 2026-07-19 구현 완료(VERIFY 카드로 이동,
     위 VERIFY 섹션 참고)** — Ticket/House 리셋 경계만 신규(레벨/뱃지/
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
- **3번(Teacher Controls 마스터 스위치) 구현 완료(2026-07-19, Engineering
  Head)** — `classes.gamification_enabled`(기본 false, 신규
  `supabase_v2_5_gamification_master_switch.sql`, 멱등, GRANT 불필요,
  운영자 실행 대기) 추가. `wordLibrary.js` `getClassSettings`/
  `setClassSettings` 확장(새 함수 없이 기존 함수에 필드 추가),
  `AdminScreen.jsx`에 `GameSettingsPanel`(체크박스 1개, `SpellingSettings
  Panel`과 동일 패턴) 신규. **Dashboard.jsx의 Paul Rank 표시가 이제 이
  스위치로 게이팅됨** — SQL 미실행/false인 반은 학생 화면에 Rank/모자
  단계 텍스트가 전혀 렌더되지 않음(안전한 기본값). `api/grant-xp.js`는
  반별 스위치를 조회해 지급을 거부하지 않기로 판단(판단 근거 3가지를
  파일 헤더에 문서화 — 감사 가능성/데이터 영구손실 방지/고빈도 경로 안정성
  비용, `handoff.md` 2026-07-19(6차) 참고) — 마스터 스위치는 "노출
  게이트"로만 동작, XP 적립 자체는 스위치와 무관하게 계속 정확히 기록됨.
  `scripts/testGamificationSettings.mjs` 신규(`tests/harness/registry.mjs`
  admin 도메인 등록) — `npm run build`/`verify:admin`/`verify:student`
  전부 PASS, `paulRank` 도메인 재실행으로 무회귀 확인. **운영자 실행
  대기**: `supabase_v2_5_gamification_master_switch.sql` 실행 후 각 반은
  여전히 false로 시작 — 교사가 관리자 화면에서 반별로 직접 켜야 학생에게
  Paul Rank UI가 보임. 4~10번(Hat Evolution 실제 시각/Ticket/Daily
  Missions 후킹/Word King/House/Weekly Events/Seasonal/Parent Motivation
  노출)은 여전히 미구현(그대로 BACKLOG).
- **5번(Ticket Economy)+6번(Daily Missions 후킹+Rewards) 구현 완료
  (2026-07-19, "소스/싱크 동시 배포" 운영자 지시, Engineering Head)** —
  `progress_data.ticketLedger`(append-only 원장, `diaryPlacements` 패턴
  재사용, tombstone 불필요) 신규 + 오늘의 미션 4/4 완료 `useEffect`에
  티켓 지급 병행 후킹(하루 1회, XP와 같은 day 기간키 idempotent 가드) +
  `Dashboard.jsx` `TicketShopCard`(상점 전용 스티커 2종 언락, 비확률/
  결정론적 구매만, 실결제 0) + Teacher Controls 마스터 스위치로 게이팅.
  **신규 Supabase 마이그레이션 없음**(SQL 파일 0개) — 티켓은 서버 원장이
  아니라 기존 `stars`/`stickers`와 동일한 로컬 우선(progress_data 백업)
  관례를 따르기로 판단(저빈도·저가치·코스메틱 전용이라 서버 검증
  불필요, 판단 근거는 `src/utils/ticketEconomy.js` 헤더). 순수 함수
  테스트 39개 전부 PASS(원장 append/idempotent/합산/병합/구매 검증,
  `scripts/testTicketEconomy.mjs` + `registry.mjs` `ticketEconomy` 도메인
  신규), `npm run build` PASS, `npm run verify:all` 재실행 — `login`
  도메인만 기존 BLOCKED 카드(로컬 서비스롤 키 부재)로 FAIL, 나머지 전부
  PASS/SKIP(무회귀 확인, `persistence`/`student`/`admin`/`paulRank` 재실행
  포함). 8번(House)/9번(Seasonal)/10번의 나머지(Weekly Events)는 여전히
  미구현(그대로 BACKLOG) — `TICKET_GRANT_TABLE`에 `status:'planned'`
  슬롯만 예약. **7번(Word King)은 이후 별도 세션(2026-07-19(8차))에서
  구현 완료 — 위 VERIFY 섹션 참고. 8번(House System + Weekly Events
  설정 슬롯)도 이후 별도 세션(2026-07-19(9차))에서 구현 완료 — 위 VERIFY
  섹션 참고(9번 Seasonal, 10번의 실제 이벤트 콘텐츠는 여전히 BACKLOG).**
  상세: `handoff.md` 2026-07-19(7차),
  `GAME_DESIGN.md` "4.x·7.x·10.x 구현 완료" 항목.
- **게임화 로드맵 최종 정리(2026-07-19, Engineering Head, 10번 카드
  완료 직후 작성)** — `GAME_DESIGN.md` "구현 순서 제안" 10개 카드 전부
  최소 기반 단계까지 구현 완료(실제 시각/미니게임/최종 애니메이션 등은
  전부 별도 BACKLOG로 남음, 과장 없이 아래에 하나씩 명시):
  1. **Anti-cheat 인프라** — 완료. `api/submit-entrance-result.js`(서버
     재검증). RLS 강화 SQL(`supabase_v2_4_entrance_result_rls.sql`)은
     운영자 실행 대기.
  2. **Player Progression/XP 표준화** — 완료(원문과 다르게 구현, 운영자
     지시로 정정: "별을 조용히 XP로 변환하지 말라" → 독립 원장
     `xp_ledger` 신설). Rank/Hat Stage 계산은 `paulRankShared.js
     computeRankState()` 순수 함수로 완결.
  3. **Teacher Controls 마스터 스위치** — 완료. `classes.
     gamification_enabled`(기본 false) + 관리자 반별 on/off UI. 이후
     모든 학생 노출 게임화 UI가 이 스위치 뒤에서만 켜짐.
  4. **Hat Evolution** — 완료(원문과 다르게 구현: 신규 컬럼 대신
     `computeRankState(xp)`의 순수 파생값). **실제 모자 시각/애니메이션은
     미구현**(PAUL_BIBLE.md §8이 DESIGN DIRECTION으로 표기한 부분,
     여전히 BACKLOG).
  5. **Ticket Economy** — 완료. `progress_data.ticketLedger`(append-only
     원장), 새 SQL 없음(기존 `progress_data` 재사용).
  6. **Daily Missions 후킹 + Rewards 카탈로그** — 완료. 오늘의 미션 4/4
     완료 시 티켓 지급 + 상점 전용 스티커 2종(코스메틱만, 실결제 0).
  7. **Word King** — 완료(기반: 주간·서버 전용 계산 + 저장 + 관리자
     수동 트리거 + 최소 텍스트). `supabase_v2_6_word_king.sql` 운영자
     실행 대기. **실제 시상식 연출/미니게임은 미구현**(BACKLOG).
  8. **House System + Weekly Events** — 완료(기반: 소속 데이터 + 팀
     점수 집계 + 최소 표시). `supabase_v2_7_house_system.sql` 운영자
     실행 대기. **Weekly Events는 설정 슬롯만**(`classes.
     weekly_event_enabled` + `WEEKLY_EVENT_TYPES`(현재 빈 배열)) —
     실제 이벤트 콘텐츠/트리거는 전부 미구현(BACKLOG). **실제
     하우스 미니게임도 미구현**(BACKLOG).
  9. **Seasonal Progression** — 완료(기반: 시즌 경계 데이터 모델 +
     관리자 수동 트리거 + 최소 표시). `supabase_v2_8_
     seasonal_progression.sql` 운영자 실행 대기. **실제 시즌 테마/장식
     등 콘텐츠는 미구현**(BACKLOG). Ticket 잔액의 실제 구매
     (`redeemTicketReward`) 판정 로직도 시즌 스코프로 아직 재배선 안 됨
     (의도적 범위 축소, 다음 라운드 후보로 명시).
  10. **Parent Motivation 노출** — 완료(기반: 이번 카드). 신규 SQL
      없음(스키마 변경 0건). **Rank/모자단계는 이번 라운드에서 의도적
      제외**(위 VERIFY 섹션 "의도적 범위 축소" 참고 — "새 Supabase
      쿼리 절대 금지" 지시와 실제 XP 원장 구조의 충돌, 운영자/CTO 판단
      대기).
  - **공통적으로 여전히 BACKLOG인 것(전 카드 공통, 운영자 원문이 애초에
    "이번 범위 아님"으로 표기)**: 실제 미니게임(첫 미니게임 접근/추가
    게임 선택/도전 모드 — `EXPERIENCE_UNLOCKS`에 자리만 예약,
    `status:'planned'`), 모자 승급 시각 효과/애니메이션, Word King
    시상식 연출, House 실제 미니게임/Weekly Events 콘텐츠, 시즌
    테마/장식. `GAME_DESIGN.md` 16번 섹션(리뷰 및 개선 제안)의
    16.1(가챠 일일 체감 로직)/16.2(Word King 좌절 누적 완화)/16.3은
    Word King 구현에 이미 반영됐고 16.1/16.4/16.5는 여전히 제안 단계
    (착수 안 됨).
  - **운영자 실행 대기 SQL 전체 목록(v2.4~v2.8)**: 아래 handoff.md
    "8시간 자율 게임화 빌드아웃 세션 종합 요약"에 실행 순서까지 정리.
  - **검수 대기**: VERIFY 섹션의 하위카드 7/8/9/10번(및 위 [P1] 입실시험
    카드) 전부 qa-reviewer/security-reviewer 코드 리뷰 미착수 —
    운영자가 리뷰 일정을 별도로 잡아야 함.

---

## IN_PROGRESS

_(현재 없음 — 작업 시작 시 여기로 카드 이동 + `.ai-status/` 상태 파일 생성)_

## VERIFY

### [P0] Word Asset 전체 재검증(8축) + 실버그 2건 수정 — qa-reviewer/security-reviewer 검수 대기
- 근거: `handoff.md` 2026-08-05(38차), `ROADMAP.md` 2026-08-05(17차).
- 내용: 운영자 지시로 Word Asset 시스템(이미지/예문/memory tip/
  distractor/음성/저장/캐시/재생성) 전체 8축 재검증을 수행하는 과정에서
  실버그 2건 발견·수정. ①AI 생성 무저장 침묵(`f19ed56`) —
  `summarizeAiGenerationOutcome` 순수 함수 신설, 관리자 패널 배너에 AI
  미호출 여부/사유(중복 제거 최대 3건)/경고 건수 노출(하네스 17단언
  추가, 총 80). ②학생 삭제 무반응 + 관리자 캐시 1000행 잘림 P0
  (`8e15ff7`) — `removeStudent()`를 캐시 조회 대신 UUID 직접 DELETE로
  교체(헌법 규칙 4), `refreshStudents()`에 1000행 페이지네이션(+id 2차
  정렬) 추가.
- 검증: `npm run verify:all` 27개 도메인 스윕. Word Asset 관련 도메인
  전부 PASS. `testSyncProgress`/`testMultiDeviceMerge`/
  `testFullProgressBackup`이 실버그 #2 수정으로 FAIL→PASS(테스트 코드
  0줄 수정), `git stash` baseline 대조로 무회귀 확인. 라이브 8축 검증
  결과는 `.ai-status/verify-word-asset-live-2026-08-05.json`.
- 발견 경위 특기: 실버그 #2는 최초 진단("RLS 락다운 환경 문제, SKIP
  처리")을 받은 implementer가 헌법 규칙 15(수정 전 코드로 재현 확인)에
  따라 그 진단이 틀렸음을 증명(students INSERT/DELETE는 락다운된 적
  없음)하는 과정에서 발견됨 — 틀린 진단을 그대로 SKIP 구현했다면 테스트가
  이 실버그를 은폐했을 사례.
- **미확정(운영자 액션 필요)**: AI 생성 저장 실패의 근본 원인은 Edge
  Function 로그 접근 불가로 이번 세션에서 미확정 — 운영자가 AI 생성
  버튼을 재클릭해 새 배너가 표시하는 사유를 확인해야 함.
- 검수 대기 사항: qa-reviewer/security-reviewer 코드 리뷰 미착수.

### [P2] Word Asset AI 생성 배선(`801e53c`) + M4d 관측 배선(`8efb8dc`) — qa-reviewer 검수 대기
- 근거: `handoff.md` 2026-08-05(37차) (3)/(4)/(5)/(6), `ROADMAP.md`
  2026-08-05(16차).
- 내용: ①`WordAssetPanel` "🤖 AI 생성" 배선 — `wordAssets.js`
  `selectAiGenerationCandidates`/`buildAiGeneratedAssetPayload`/
  `generateWordAssetsViaAi` 순수 함수 3종(승인 행 스킵, 기존 값 무덮어쓰기,
  무-throw, AI 예산 초과 시 미저장), 하네스 30단언 추가(총 64). ②M4d
  게이트 관측 배선 — `history[date].completedTodayCount` 신설(high-water
  패턴, 자정 훅 비의존, `maxNum` 병합), 보상/XP/UI 판정 변경 0건.
- 검증: `npm run build` PASS, `npm run verify:admin`/`npm run
  verify:student` PASS. `npm run verify:persistence` 2건 FAIL은
  수정 전 baseline 대조로 기존 환경 이슈(RLS 락다운의 anon 삭제 차단)임을
  확인, 회귀 아님.
- **미검증(정직 기록)**: Word Asset AI 생성의 라이브 DB 왕복 —
  `word_assets` 테이블 자체가 `supabase_v3_15_word_assets.sql` 미실행
  상태라 이번 세션은 하네스 폴백 경로만 검증했다(운영자가 SQL 실행 후
  라이브 검증 필요).
- 검수 대기 사항: qa-reviewer/security-reviewer 코드 리뷰 미착수.

### [P0] Vercel 프로덕션 배포 정체(Hobby 12개 함수 한도 초과) — 해소 완료, 운영자 확인 1건 대기
- 근거: `.ai-status/engineering-head-vercel-deploy-verify.json`,
  `.ai-status/engineering-head-admin-pin-actions-consolidation.json`,
  `handoff.md` 2026-07-20(2차), `ROADMAP.md` 2026-07-20 섹션.
- 내용: 2026-07-19 세션 9차(House System) 이후 `api/` 파일이 14개가
  되면서 Vercel Hobby 플랜의 배포당 12개 함수 한도를 초과, 그 이후 모든
  배포가 HTTP 에러 없이 조용히 실패해왔음을 3가지 독립 증거(`git
  ls-tree` 파일 수/Vercel 공식 문서/라이브 curl 실측)로 확정.
- 해소: 정확히 같은 인가 게이트(`checkAdminReauth()`)를 공유하는 관리자
  PIN 액션 3개(`bulk-generate-temp-pins.js`/`set-pin-setup-allowed.js`/
  `unlock-student-pin.js`)를 `api/admin-pin-actions.js` 하나로 통합
  (`action` 필드 dispatch). 구현 전 security-reviewer 서브에이전트
  dispatch → **PASS** 판정(숨은 신뢰 경계 차이 없음, 권한 상승 위험
  없음) 확보 후 착수. 함수 수 14→12개로 감축 실측 확인.
- 배포+라이브 검증: push 후 Vercel 재배포 확인(라이브 번들 해시가 로컬
  빌드와 정확히 일치), House System/Seasonal Progression이 이미 배선해둔
  신규 함수(`/api/compute-word-king`, `/api/start-new-season`)가 이제
  405(존재)로 응답 — 배포 정체가 이 두 기능 전체에 걸쳐 있었고 이번
  수정으로 전부 풀렸음을 확인. 삭제된 3개 엔드포인트는 라이브에서 404
  확인.
- 신규 테스트: `scripts/testAdminPinActionsDispatch.mjs`(순수 라우팅/
  인가순서/필드검증 10개 PASS, `tests/harness/registry.mjs` login
  도메인 등록). `npm run build` PASS.
- **미확인 항목(운영자 액션 필요)**: 3개 액션의 실제 DB 반영(성공 경로)
  은 로컬 `.env.local`의 `ADMIN_PIN`이 Vercel 프로덕션 값과 달라(정상
  설계 — 별도 시크릿) 이 세션에서 라이브로 끝까지 확인하지 못함(에이전트가
  프로덕션 `ADMIN_PIN`을 알아내려는 시도는 하지 않음). **운영자가
  AdminScreen에서 PIN 재설정 허용 토글 1번 + 잠금 해제 버튼 1번을 눌러
  정상 동작하는지 30초 확인 필요**.
- 롤백 계획: 문제 발생 시 관련 두 커밋을 `git revert`하면 기존 3-파일
  구조로 복귀 가능하나, 그 순간 함수 수가 다시 14개로 늘어 배포 정체가
  재발함(운영자 인지 필요).
- 검수 대기 사항: security-reviewer는 Phase 1에서 이미 PASS(이 카드
  자체 작업 내 수행) — 남은 것은 qa-reviewer의 별도 코드 리뷰(미착수)와
  위 운영자 확인 1건.

### [P3] 게임화 하위카드 10번(Parent Motivation) — 구현 완료, 검수 대기 — **게임화 로드맵 마지막 하위카드**
- 근거: BACKLOG "[P3] 게임화" 하위 카드 10번, `GAME_DESIGN.md` 14번 섹션,
  `PAUL_PRINCIPLES.md` 7번("학부모가 압박 대신 성장을 보는 이유").
- 범위(운영자 지시 그대로): `computeStudentStats()`/`buildWeeklyReport()`
  확장만 — 새 Supabase 쿼리·새 AI 호출 없음. `ParentScreen.jsx`에 최소
  텍스트 섹션만 추가(리디자인 없음). 순위/경쟁 강조 금지.
- `src/utils/weeklyReport.js` `computeStudentStats(r, wordStatusSummary,
  houseId)`에 3번째 선택 인자 + 반환값에 `ticketBalance`(`ticketEconomy.js
  sumTicketBalance()` 재사용, `progress_data.ticketLedger`에서 새 쿼리
  없이 파생)/`house`(`houseSystem.js getHouseById()` 재사용) 추가.
  `buildWeeklyReport()`도 같은 두 값을 선택 인자로 받아 조건부 성장
  문장 1~2줄 추가. `ParentScreen.jsx`에 `gamification_enabled` 게이팅되는
  "🌱 OO의 성장"(하우스 소속 + 누적 티켓, 등수 없음) 카드 신설.
- **의도적 범위 축소(운영자/CTO 판단 필요) — Rank/모자단계 제외**:
  `GAME_DESIGN.md` 14번 원문은 Rank도 `student_progress` 컬럼에서 새
  쿼리 없이 파생 가능하다고 전제했지만, 실제 Paul Rank XP는(하위카드
  2번이 "별을 조용히 XP로 변환하지 말라"로 원문과 다르게 구현된 이후)
  독립 원장 `xp_ledger`/`xp_totals` VIEW에만 있어 이 전제가 깨졌다 —
  조회하려면 `fetchXpTotal()`(새 네트워크 호출)이 필요한데 이번 지시가
  "새 쿼리 절대 금지"를 명시했으므로, 부정확한 값(레거시 `total_xp`)을
  보여주는 대신 Rank를 이번 라운드에서 뺐다. 같은 이유로 "이번 시즌"
  티켓 잔액도 시즌 경계 조회가 필요해 전체 누적으로 대체(문구도 정직하게
  "지금까지 모은 티켓"). House 팀 순위/등수·Word King 수상 이력은
  PAUL_PRINCIPLES.md 원칙에 따라 애초에 배제(소속 이름만 표시). 상세
  근거: `GAME_DESIGN.md` "14.x 구현 완료" 항목.
- 신규 테스트: `scripts/testWeeklyReport.mjs` 4~9번 시나리오 신규(20개
  체크) — 기존 호출부 무회귀, 조건부 성장 섹션, 등수/순위 단어 미포함
  확인.
- 검증: `npm run build` PASS, `node scripts/testWeeklyReport.mjs`
  20/20 PASS, `npm run verify:daily-study` PASS, `npm run verify:admin`
  (6개 스크립트) PASS 무회귀, `testTicketEconomy.mjs`/`testHouseSystem.mjs`
  재실행 PASS(재사용 함수 무회귀).
- 검수 대기 사항: qa-reviewer/security-reviewer 코드 리뷰, 운영자/CTO의
  Rank 필드 추가 여부 판단(새 SQL 없음, 순수 프런트엔드 판단). 신규 SQL
  파일 없음(이번 카드는 스키마 변경 0건).
- **이 카드가 `GAME_DESIGN.md` "구현 순서 제안" 10개 카드의 마지막**
  — 아래 BACKLOG "[P3] 게임화" 카드에 전체 10개 하위카드 최종 정리
  섹션 추가.

### [P3] 게임화 하위카드 8번(House System + Weekly Events 설정 슬롯) — 구현 완료, 검수 대기
- 근거: BACKLOG "[P3] 게임화" 하위 카드 8번, `GAME_DESIGN.md` 6·8번 섹션,
  `PAUL_BIBLE.md` §10, `PAUL_PRINCIPLES.md` 3번("하우스가 소속감을 만드는
  이유").
- 범위(운영자 지시 그대로): 하우스 소속 데이터 + 팀 점수 집계 + 최소
  표시까지만 — 실제 게임/미니게임 없음.
- **`houses` 테이블 대신 코드 상수로 대체(PAUL_BIBLE.md §10 원문과 다른
  점)**: `src/utils/houseSystem.js`의 `HOUSES`(4개 고정) — 근거는
  `GAME_DESIGN.md` "6.x 구현 완료" 항목. `students.house_id`는 FK가
  아니라 CHECK(1~4) 제약 smallint.
- 팀 점수는 티켓 원장의 양수 delta(획득)만 그 주(월~일) 범위로 합산 —
  소비/구매(delta<0)는 제외(의도치 않은 벌칙 방지 판단).
- 별도 `house_enabled` 스위치는 만들지 않고 기존 `gamification_enabled`
  마스터 스위치를 재사용(Word King 선례와 일관). `classes.weekly_event_
  enabled`는 이번에 추가했으나 아직 아무 코드도 읽지 않는 설정 슬롯(향후
  실제 이벤트가 붙는 라운드에서 배선).
- 신규 파일: `supabase_v2_7_house_system.sql`(GRANT 포함, 멱등, **운영자
  실행 대기**), `src/utils/houseSystem.js`(순수 배정/집계),
  `scripts/testHouseSystem.mjs`(순수 로직 33개 체크 PASS). `wordLibrary.js`
  (`setStudentHouse`/`getStudentsInHouse`/`fetchHouseWeeklyScore` 신규,
  `refreshStudents`/`addStudent` 컬럼 폴백 확장), `AdminScreen.jsx` 로스터
  하우스 배지/재배정 select, `Dashboard.jsx` 최소 텍스트.
- **구현 중 회귀 발견 + 즉시 수정**: `addStudent()`의 최초 구현이 단일
  폴백이라 `house_id` 컬럼 미실행 상태에서 이미 적용된 `current_unit_id`
  까지 함께 못 쓰게 되는 회귀를 `testStudentUnitDecouple.mjs` FAIL로
  재현·확인 후 3단계 cascading 폴백으로 수정(`handoff.md` 2026-07-19(9차)
  상세).
- 검증: `npm run build` PASS, `npm run verify:admin`(6개 스크립트 전부
  PASS)/`npm run verify:student`(4개 스크립트 전부 PASS), harness
  `houseSystem` 도메인 신규 등록 PASS, `npm run verify:all` 재실행 —
  `login` 도메인만 기존 BLOCKED 카드(로컬 서비스롤 키 부재)로 FAIL,
  나머지 전부 PASS/SKIP(회귀 수정 후 무회귀 재확인).
- 검수 대기 사항: qa-reviewer/security-reviewer 코드 리뷰, 운영자의
  `supabase_v2_7_house_system.sql` 실행 여부 판단. 상세: `handoff.md`
  2026-07-19(9차).

### [P3] 게임화 하위카드 9번(Seasonal Progression) — 구현 완료, 검수 대기
- 근거: BACKLOG "[P3] 게임화" 하위 카드 9번, `GAME_DESIGN.md` 9번 섹션.
- 범위(운영자 지시 그대로): 시즌 경계 데이터 모델 + 관리자 수동 트리거 +
  최소 표시까지만 — 실제 시즌 테마/장식 등 콘텐츠는 이번 범위 아님.
- **레벨/뱃지/스트릭은 절대 리셋하지 않는다는 원칙을 그대로 준수** —
  이번 구현이 건드리는 테이블은 신규 `seasons` 하나뿐, `students`/
  `xp_ledger` 등 영구 기록 테이블은 0개 변경. "리셋"은 원장을 지우지
  않고 시즌 경계 이후 항목만 다시 합산하는 파생 계산으로 구현
  (`sumTicketBalanceSince`/`computeHouseSeasonScores`).
- **`classes` 컬럼 대신 전역 `seasons` 테이블(GAME_DESIGN.md 원문의 두
  대안 중 이 세션의 판단)**: House 팀 점수가 이미 반 경계를 넘어 전역
  집계되므로(House 선례) 시즌 경계도 반별이 아니라 전역 단일 값이어야
  일관됩니다. `seasons`(append-only, 최신 행 1개 = 현재 시즌) +
  anon read-only/service_role 전용 write(word_king_history와 동일 패턴,
  그리핑 방지).
- 신규 파일: `supabase_v2_8_seasonal_progression.sql`(GRANT 불필요, 멱등,
  **운영자 실행 대기**), `api/start-new-season.js`(관리자 재인증),
  `src/utils/seasonApi.js`(클라이언트 접근 레이어), `scripts/
  testSeasonalProgression.mjs`(순수 로직 20개 체크 PASS). `src/utils/
  ticketEconomy.js`(`sumTicketBalanceSince`)/`src/utils/houseSystem.js`
  (`computeHouseSeasonScores`) 함수 추가(새 파일 아님), `src/utils/
  wordLibrary.js`(`fetchHouseSeasonScore` 신규), `AdminScreen.jsx`
  (`SeasonPanel`, 반 목록 루프 밖 전역 패널)/`Dashboard.jsx`(시즌
  누적 점수 텍스트, 시즌 시작 전엔 안 보임) 최소 통합.
- **의도적 범위 축소**: Ticket 잔액의 실제 구매 가능액/`redeemReward`
  판정 로직은 이번 라운드에 시즌 스코프로 재배선하지 않음 — 111명
  실사용 학생의 살아있는 구매 흐름(`useStudent.js`)까지 건드리면 "최소
  표시"를 넘는 위험 확대라 판단(상세 근거는 `GAME_DESIGN.md` "9.x 구현
  완료" 항목). `sumTicketBalanceSince()`는 이미 완성/테스트돼 다음
  라운드에 배선만 하면 됨.
- 검증: `npm run build` PASS, `npm run verify:admin`/`npm run
  verify:student` 전부 PASS(무회귀), `houseSystem`/`ticketEconomy`
  도메인 재실행 PASS(기존 함수 무회귀), harness `seasonalProgression`
  도메인 신규 등록 PASS, `npm run verify:all` 재실행 — `login` 도메인만
  기존 BLOCKED 카드(로컬 서비스롤 키 부재)로 FAIL, 나머지 전부
  PASS/SKIP(신규 회귀 없음).
- 검수 대기 사항: qa-reviewer/security-reviewer 코드 리뷰, 운영자의
  `supabase_v2_8_seasonal_progression.sql` 실행 여부 판단. 상세:
  `handoff.md` 2026-07-19(10차).

### [P3] 게임화 하위카드 7번(Word King) — 구현 완료, 검수 대기
- 근거: BACKLOG "[P3] 게임화" 하위 카드 7번, `GAME_DESIGN.md` 5번 섹션,
  `PAUL_BIBLE.md` §11. 선행조건(1번 Anti-cheat,
  `api/submit-entrance-result.js`)이 이번 세션 앞부분에 이미 완료돼
  착수 가능해졌고, 이번 세션에서 구현까지 완료.
- 범위(운영자 지시 그대로): 주간·서버 전용 계산 + 저장 + 관리자 수동
  트리거 버튼 + 최소 텍스트 표시 — 실제 미니게임/시상식 연출은 이번
  범위 아님.
- 점수 산정 입력을 원문(`GAME_DESIGN.md` 5번 섹션 3신호)에서 의도적으로
  축소 — ①입실시험 정확도(`entrance_test_results`, 서버 재검증됨) +
  ②XP 합계(`xp_ledger`, 서버 전용 쓰기) 2개만 사용. ③쓰기시험 정답률/
  ④mastered 단어 수는 둘 다 anon `"allow anon all"`로 클라이언트가
  직접 쓰는 값이라(§11 Anti-cheat이 이미 지목한 부차 갭과 동일) "새로운
  클라이언트-신뢰 지점을 만들지 마라"는 운영자 지시에 따라 제외 — 갭이
  해소되면 공식만 조정해 추가 가능.
- 16.3(소표본 왜곡 보정)/16.6(이상치 표) 리뷰를 같은 라운드에 반영 —
  회귀 테스트로 베이지안 블렌딩이 아니라 "학급 평균(leave-one-out)
  완전 대체"가 실제로 왜곡을 막는지 확인 후 그 방식으로 최종 구현
  (`src/utils/wordKing.js` 헤더 주석 전문).
- 신규 파일: `supabase_v2_6_word_king.sql`(anon read-only + service_role
  write, 멱등, **운영자 실행 대기**), `src/utils/wordKing.js`(순수 계산),
  `src/utils/wordKingApi.js`, `api/compute-word-king.js`(관리자 재인증),
  `AdminScreen.jsx` `WordKingPanel`, `Dashboard.jsx` "이번 주 챔피언"
  텍스트(`gamificationEnabled` 게이팅), `scripts/testWordKing.mjs`(순수
  로직 33개 체크 PASS)/`scripts/testComputeWordKingApi.mjs`(라이브 e2e,
  3단계 SKIP — 로컬은 `word_king_history` 테이블 미실행으로 SKIP,
  Vercel 프로덕션에서는 전체 검증).
- 검증: `npm run build` PASS, `npm run verify:admin`(6개 스크립트 전부
  PASS, 무회귀), harness `wordKing`/`ticketEconomy`/`paulRank` 도메인
  재실행 PASS, `npm run verify:all` 재실행 — `login` 도메인만 기존
  BLOCKED 카드(로컬 서비스롤 키 부재)로 FAIL, 나머지 전부 PASS/SKIP
  (신규 회귀 없음).
- 검수 대기 사항: qa-reviewer/security-reviewer 코드 리뷰, 운영자의
  `supabase_v2_6_word_king.sql` 실행 여부 판단. 상세: `handoff.md`
  2026-07-19(8차).

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
- **2026-09-03(105차, 야간 자율 세션)** Production Safety Harness 강화 +
  재발 방지 가드 — 103차가 남긴 재발 갭(`setAssignmentUnit`/
  `setPrimaryTextbook`/`setPrimaryAssignment` 유령 유닛 무가드)을
  `isSuspiciousUnit` + `unit_name` 동기화로 해소(`testAssignmentUnitGuards`
  45단언), `hard_delete_student` 가드에 `reward_ledger`/
  `entrance_test_results`/`xp_ledger` 카운트 추가(`testHardDeleteGuard`
  22단언), Edge Function `class.delete` 학습기록 fail-closed + force
  옵션(`testClassDeleteGuard` 18단언, **배포는 운영자 몫**:
  `supabase functions deploy admin-content-write`), 반 삭제 2차 확인
  모달(카운트 + 반 이름 재입력 + force). `prod:hotfix` 는 manifest
  sha·변조 감지 + `APPLY <runId>` 정확 일치로 강화(`testProdHotfix`
  148→157단언), `prod:check` 는 invariant 18종·마스킹 UX·synth
  픽스처(`testProdCheck` 130단언)로 확장돼 CI Gate 3b(READ-ONLY)/Gate
  4(WRITE-DISABLED 증명)에 편입(`testReleaseGateProdCheck` 39단언).
  `generateGhostScaManifest` 신규 — 유령 SCA 재배정 manifest 라이브
  자동 생성(A조 5/B조 6=11행, `testGenerateGhostScaManifest` 27단언),
  라이브 dry-run ready-to-apply 확인(DB WRITE 0). 보안 High 1건(PUBLIC
  저장소 CI 로그 학생 실명 마스킹 — `prodCheck`/`studentHealthCheck`
  `--mask-names` + CI 강제, `testCiNameMasking` 32단언) + Low 2건
  (`unlock_student_pin` UUID 검증 등) 수정. WARN 10 전수 분석 완료(전부
  `ASSIGNMENT_GHOST_UNIT`, false positive 0, 즉시 수정 필요 0).
  Production WRITE 0, PR merge 0. 근거: `handoff.md` 2026-09-03(105차),
  `docs/production-safety-harness-runbook.md`,
  `docs/audit/2026-09-03-warn10-readonly-analysis.md`. PR #8 merge/
  Edge Function 배포/유령 SCA 재배정 승인은 아래 BLOCKED 카드 참고.
