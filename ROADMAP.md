# Paul Easy Voca — 로드맵

_최종 갱신: 2026-07-20 (Project Paul Multi-Agent Development Framework 신설 추가 — 기존 섹션은 원본 그대로 유지, 아래에 이어서 추가함)_

## 2026-07-20 — Project Paul Multi-Agent Development Framework 신설

기존 `.claude/agents/`(5개, preserve)를 흡수해 하나의 조직으로 재구성.
신규 7개 역할(Mission Guardian/Orchestrator/Product Guardian/Learning
Designer/Child Experience Designer/Deployment Engineer/Student
Analytics) — 전부 평가/조정/검증 전담, 코드 미작성, CEO 없음. 기준 문서
`PROJECT_PAUL_GOAL.md`(미션 6개 축 + 가드레일), 절차 문서
`MULTI_AGENT_WORKFLOW.md`(토큰효율, 작업당 최대 4명, 사람 승인 필수
정지조건). 첫 파일럿(반 삭제 다이얼로그 안심 문구) 완료 — 상세는
`handoff.md` 2026-07-20(3차), `docs/agent-architecture.md`,
`docs/agent-decisions/0001-class-delete-dialog-copy.md`.

## 2026-07-20 — Vercel 프로덕션 배포 정체 P0 사고 + 해소 (약 1일간 모든 배포 조용히 실패)

2026-07-19 세션 9차(House System, `dbda442`) 이후 Vercel Hobby 플랜의
배포당 서버리스 함수 12개 한도(`api/` 파일 1개=함수 1개 직접 매핑,
Vite/non-Next 프레임워크 특성)를 `api/` 파일 14개로 초과해, 그 이후의
모든 `git push`가 HTTP 에러 없이 **조용히** 배포 실패하는 상태였다 —
2026-07-19 세션 10~11차(Seasonal Progression, Parent Motivation)가 코드
레벨에서는 완료·커밋됐지만 실제 라이브 사이트에는 전혀 반영되지 않고
있었다는 뜻이다.

- **원인 실측 확정**(추측 아님, 3가지 독립 증거 일치): ① `git ls-tree`로
  마지막 성공 배포 커밋(`718d1a9`, 12개) vs 조사 시점 HEAD(14개) 파일 수
  차이, ② Vercel 공식 문서의 Hobby 12개 함수 한도 명시, ③ 라이브 curl
  실측 — 12개는 405(살아있음), House System 이후 신규 2개는 404(배포된
  적 없음).
- **해소**: 정확히 같은 인가 게이트(`checkAdminReauth()`)를 공유하는
  관리자 PIN 액션 3개(`bulk-generate-temp-pins.js`/
  `set-pin-setup-allowed.js`/`unlock-student-pin.js`)를
  `api/admin-pin-actions.js` 하나로 통합(`action` 필드 dispatch) —
  구현 전 security-reviewer PASS 판정 확보. 함수 수 14→12개로 감축,
  배포 정체 해소를 라이브에서 실측 확인(House System/Seasonal
  Progression이 배선한 신규 함수들이 이제 정상 배포돼 405 응답).
- 라이브 스모크 테스트는 라우팅/인가 경로까지만 이 세션에서 확인 —
  3개 액션의 실제 DB 반영(성공 경로)은 로컬/프로덕션 `ADMIN_PIN`이
  서로 다른 값이라(정상 설계) 운영자 확인 1건이 남아있다.
- 신규 아키텍처 제약으로 명문화: 이후 `api/*.js` 신규 파일을 추가하기
  전 반드시 현재 함수 개수를 먼저 확인할 것(`ARCHITECTURE.md` "8. 배포
  프로세스" 4번, `DEVELOPER_GUIDE.md` "Deployment Checklist" 6번).
- 상세: `handoff.md` 2026-07-20(2차), `PROJECT_BOARD.md` VERIFY 카드.

## 2026-07-18 — Production Readiness 5개 영역 종합 감사 + 전체 워크플로우 QA 파괴 테스트 스윕 (production-ready 판정)

전날 밤 v2.1/v2.2 작업 직후, 서로 다른 영역을 맡은 여러 agent가 동시에 진행한 최종 점검 라운드. 상세는 `handoff.md` 2026-07-18 섹션들(Phase 1~5 + QA 스윕 + 9개 목표 대조 + 2시간 종합요약) 참고 — 여기서는 로드맵 관점 요약만.

- **Phase 1(영속성) + Phase 2(DB 무결성)** — `student_progress`/`student_daily_progress`/`word_status`/`daily_assignments`/`entrance_tests`/`entrance_test_results` 등 라이브 DB 전수 무결성 점검(students=111, classes=8, units=16, words=470 규모) **고아/불일치 레코드 0건**. 다중 탭·동기화 중첩 시나리오(`scripts/testMultiTabRace.mjs` 신규)에서 **Critical 1건 발견 즉시 수정**(디바운스 동기화 중첩 시 오래된 호출이 최신 업로드를 덮어쓸 수 있던 레이스 — `useStudent.js`에 `syncGenRef`세대 카운터 도입). **Persistence Score: 88/100, Database Score: 92/100**(핵심 4테이블 DDL 미백필은 기존 Medium 기술부채로 재확인, `DATABASE.md` 참고).
- **Phase 3(성능) + Phase 5(유지보수성)** — 메인 번들 531.53KB → 520.86KB(`EntranceTest` 화면을 배너(`EntranceTestBanner.jsx` 신규)와 분리해 실제 lazy-split 되도록 수정). 확실히 미참조로 재확인된 데드코드 4개 파일 제거: `src/components/HiddenFeatures.jsx`, `src/api/hiddenFeatures.js`, `src/config/dataSchemas.js`, `src/hooks/usePaulReaction.js`(2024년 학원 운영 확장 스캐폴딩의 일부였던 파일들 — `PROJECT_GUIDE.md`/`ARCHITECTURE.md` 참고). 정량 Performance 점수는 `handoff.md`에 별도 수치로 기록되지 않았으나(정성적 측정 결과만 기록), 운영자 보고 기준 **Performance: 78/100**.
- **Phase 4(보안 재감사)** — 신규 Medium 1건 발견(입실시험 결과를 서버 재채점 없이 클라이언트 제출값을 신뢰 — 학원 내부 경쟁 기능 한정이라 상한선 있는 감점). Critical/High 0건. **Security Score: 90/100**.
- **전체 워크플로우 QA 파괴 테스트 스윕** — 회귀 스위트 30/30 PASS(4개는 로컬 환경 제약 — `SUPABASE_SERVICE_ROLE_KEY` 로컬 미설정으로 PIN 관련 라이브 테스트만 차단, 프로덕션은 정상). Critical/High 0건, Medium 2건 발견·기록만(①학생 자기등록 중 PIN 저장 단계만 실패하면 계정이 로그인도 PIN생성도 안 되는 상태로 고아화될 수 있음 — 관리자가 로스터에서 "PIN 설정 허용"으로 수동 복구 가능, ②엑셀 업로드가 빈/손상 파일에 대한 명시적 에러 처리가 없음).
- **종합 판정: production-ready. 실제 코드 변경(이번 라운드)**: `useStudent.js`(`syncGenRef`), `App.jsx`/`Dashboard.jsx`/`EntranceTestBanner.jsx`(신규, lazy-split), 데드코드 4파일 삭제. 나머지는 전부 "발견·기록만"(Medium/Low는 다음 세션 후보로 이월).

## v2.2 — 다중 기기 진행도 병합(last-writer-wins 제거) — 완료 ✅ (2026-07-17 밤 2차)

두 기기(예: 태블릿+폰)를 교차로 쓰는 학생의 진행분이 한쪽으로 영구 유실되던 문제 수정. 라이브 대조군으로 재현·확인 후 수정.

- ✅ 동기화 직전 클라우드 백업 blob을 먼저 읽어 `mergeProgressRecords()`(필드별 max/합집합 병합 — `ARCHITECTURE.md` 6번 섹션 참고)로 병합 후 업로드(읽기 실패 시 업로드 자체를 포기 — 섣부른 덮어쓰기보다 안전)
- ✅ 로그인 시점에도 동일한 병합 로직으로 복원(단순 "최신 것 채택"이 아님)
- ✅ 다이어리 스티커 삭제가 재로그인 시 되살아나지 않도록 tombstone(`diaryRemovedIds`) 도입
- 테스트: `scripts/testMultiDeviceMerge.mjs`(라이브 e2e, QA_ 데이터) 신규 — 두 기기 교차 동기화 후 양쪽 진행분이 클라우드에 모두 반영되는지 확인
- 배포: push → Vercel 자동배포, 라이브 번들(`index-CrCw6LYF.js`)에서 마커 확인 완료

## v2.1 — 학생-Unit 아키텍처 분리 — 완료 ✅ (2026-07-17 밤)

학생의 "현재 유닛"이 `unit_name`(문자열) 매칭 하나에만 의존해 유닛 삭제/표기 차이("Unit 1" vs "Unit1")에 취약했던 구조적 문제 수정 + 학생이 스스로 유닛을 바꿀 UI가 아예 없었던 문제 해결.

- ✅ `students.current_unit_id`(uuid, `units.id` FK, `on delete set null`) 추가 — `resolveStudentUnitObj()` 단일 해석 경로로 통일, `unit_name`은 폴백용으로 유지(하위호환, 삭제 안 함)
- ✅ 학생 홈 화면에 유닛 선택 UI 추가(자기 반의 유닛만, 전환해도 별/스트릭/스티커/오늘 미션 등 진행도는 전혀 리셋 안 됨 — 구조적으로 보장)
- ✅ 유닛별 "이어서 학습" 위치(`lastWordIndexByUnit`) 분리 저장
- SQL: `supabase_v2_1_student_unit_decouple.sql`(컬럼 추가 + FK + 인덱스 + v1.9 GRANT + 기존 데이터 백필, 전부 멱등) — 적용 상태는 `DATABASE.md` 마이그레이션 표 참고
- 테스트: `scripts/testStudentUnitDecouple.mjs`(라이브 e2e), 기존 회귀 스위트(`testLoginRestoreCrash`/`testIdentityMigration`/`testRlsSecurity` 등) 전부 PASS. 배포 후 라이브 번들(`index-CQ2pfFbN.js`)에서 v2.1 마커 6종 확인 완료

## v2.0 / v2.0.1 — 쓰기시험 양방향 혼합형(mixed) + 채점 관대화 + 교사 검토 큐 — 완료 ✅ (2026-07-17)

- ✅ 반별 쓰기시험 출제 방향에 `'mixed'`(세션 단위 정확 50:50 한→영/영→한 배분) 추가, 기본값도 `'mixed'`로 전환(운영자 확정)
- ✅ 단어별 "추가 인정 뜻"(`words.accepted_meanings`)으로 채점 관대화
- ✅ 영→한 문제에서 한글로 답한 애매한 오답을 `spelling_review_queue`에 자동 기록 → 관리자가 "이 답 인정" 원클릭으로 `accepted_meanings`에 반영하는 교사 검토 큐
- 원인 조사: "여전히 한→영만 나온다"는 운영자 리포트를 실측으로 격리 — 운영자 실반 4개 전부 `spelling_direction='kr2en'`(구 컬럼 기본값)이었던 게 원인, 기본값 전환(v2.0.1) + `scripts/opsSetAllClassesMixed.mjs`(기존 반 일괄 전환 DML)로 해결
- SQL: `supabase_v2_0_spelling_mixed.sql`(구 `supabase_spelling_direction_schema.sql` 내용 통합, 이 파일 하나만 실행하면 됨), `supabase_v2_0_1_spelling_default_mixed.sql`(신규 반 컬럼 default만 조정, 실행 안 해도 무방)
- 상태: SQL 적용 완료(운영자 실행 확인 2026-07-17 낮), push+배포+라이브 e2e 검증 완료(`index-BjV6lXr5.js`)

## v1.9 — 보안: `students` PIN 컬럼 클라이언트 차단 — 완료 ✅ (2026-07-16 밤, P7 감사 후속)

anon key(브라우저에 노출)로 `students.pin_hash`/`pin_fail_count`/`pin_locked_until`/`pin_setup_allowed`를 직접 SELECT/UPDATE할 수 있던 구멍을 막음(PIN 해시 탈취 → 오프라인 브루트포스 → 임의 학생 로그인 경로 차단).

- ✅ RLS(행 정책)가 아니라 **컬럼 단위 GRANT**로 설계 — 이 앱이 Supabase Auth 없이 anon key 하나로 동작하는 구조라 행 단위로 "누구인지" 구분할 수 없기 때문(상세 근거는 `DATABASE.md` RLS/컬럼권한 섹션)
- ✅ 클라이언트 전수 조사로 실제 사용 컬럼만 재부여(SELECT는 PIN 4컬럼 제외 전체, UPDATE는 `class_id`/`unit_name`만) — 기존 기능 전부 그대로 동작 확인
- SQL: `supabase_v1_9_security_rls.sql`, 검증: `scripts/testRlsSecurity.mjs`
- **운영 함정 문서화**: 이후 `students`에 새 컬럼을 추가하는 모든 마이그레이션은 GRANT를 함께 실행해야 함(안 하면 fail-closed) — v2.1이 이 절차를 실제로 올바르게 준수

## v1.8 — 입실 단어시험(Entrance Word Test) + 반별 랭킹/오늘의 VIP — 완료 ✅ (2026-07-16 밤, 자율 작업)

수업 시작과 동시에 반 학생들이 각자 폰으로 참여하는 단어시험(종이 시험 대체).

- ✅ 교사가 관리자 화면에서 반/문항수/방향(영→한·한→영·랜덤)/제한시간을 정해 시험 시작 → 학생 홈에 "오늘의 입실시험" 배너(`EntranceTestBanner.jsx`, 이후 Phase 3에서 별도 파일로 완전 분리) → 응시(`EntranceTest.jsx`) → 자동 채점 → 결과 즉시 저장
- ✅ 반별 랭킹(공동 순위 허용)과 오늘의 VIP — 응시 결과에서 실시간 계산, 날짜 바뀌면 자동 리셋
- SQL: `supabase_v1_8_entrance_test.sql`(`entrance_tests`/`entrance_test_results`, 테이블 부재 시 학생 배너/관리자 탭이 자동으로 숨김·"준비 중" 폴백하도록 설계 — SQL 미적용 상태에서도 앱 안 깨짐)
- 상태: SQL 적용 완료 후 e2e 전체 검증 완료(라이브 번들 `index-DpieIwD6.js`), push+배포 완료
- 알려진 갭(2026-07-18 Phase 4 재감사에서 재확인): 응시 결과가 서버 재채점 없이 클라이언트 제출값을 신뢰함(Medium, 학원 내부 경쟁 기능이라 영향 상한선 있음) — 근본 수정안(`api/submit-entrance-result.js` 신설)은 다음 세션 후보로 기록만 됨

## v1.7 — PIN 운영방식 변경: 학생 최초 PIN 자기설정 — 완료 ✅ (2026-07-16)

v1.6에서 만든 이름+PIN 로그인 인프라는 그대로 유지한 채, "학생이 직접 자기 PIN을 만드는" 플로우만 추가(운영자 지시로 PIN 운영 방식 변경).

- ✅ `students.pin_setup_allowed` 플래그 — 관리자가 명시적으로 허용한 학생만, 딱 1회만 자기 PIN 자기설정 가능(설정 성공 즉시 서버가 다시 false로 원복 — 재사용 방지)
- ✅ `api/self-set-student-pin.js`가 서버에서 `pin_setup_allowed` + `pin_hash IS NULL` 둘 다 확인 후에만 저장 허용, 약한 PIN(0000/1234류 24종) 서버 거부
- SQL: `supabase_v1_7_student_pin_selfsetup.sql`
- 관련 프로덕션 크래시 수정(2026-07-17, 별도 항목): PIN 초기화/재설정 후 재로그인 직후 발생하던 `forEach` TypeError — 커밋 `bc49775`/`6b5e0f9`, push+배포 완료(`index-vRV4evrc.js`)

---

## v1.6 — 학생 identity P0 리팩터링(이름→id) + 이름+PIN 로그인 — 코드 완료, SQL 마이그레이션 적용 대기 (2026-07-16)

CTO 최우선순위(P0) 지시: 동명이인 학생이 이름을 전역 유일 키로 써서 서로의 별/포인트/캘린더/학습기록을 덮어쓸 수 있던 데이터 무결성 이슈 수정. 상세 내역은 `handoff.md` 2026-07-15~16 섹션 참고.

- ✅ 학생 식별자를 이름 → `students.id`(UUID)로 전환 (`wordLibrary.js`/`useStudent.js`/모든 화면)
- ✅ 로그인 방식을 반선택 2단계 → **이름+PIN(4자리)** 로 교체(운영자 중간 지시)
- ✅ 로컬스토리지(별/포인트/캘린더/스티커) 마이그레이션 — 원본 보존 + lazy 복사, 20개 회귀 체크 전부 통과
- ✅ 유닛 자연 정렬 버그 별도 수정
- ✅ PIN 해시(서버사이드 전용, Node crypto, 외부 의존성 0개) + 5회 실패 잠금 + 관리자 PIN 재설정/임시PIN 일괄발급
- ⏳ **블로킹**: `supabase_v1_6_student_identity.sql`을 Supabase SQL Editor에서 아직 미실행 — 실행 전까지 동명이인 실제 등록/로그인이 DB UNIQUE 제약으로 계속 막혀 있음(코드는 이미 대응 완료, DB 쪽 수동 조치만 남음)
- ⏳ push/배포 보류 — 전체 회귀(동명이인 실제 시나리오 포함) 통과 후 운영자 최종 확인 필요

> **상태 업데이트(2026-07-18 문서화 세션에서 추가, 원본 문구는 그대로 유지)**: 위 "SQL 미실행"/"push 안 됨" 표기는 이후 시점 기준 옛 정보입니다. `handoff.md` 2026-07-16 밤 섹션에 "PIN 자기설정/PIN 초기화(삭제)/레이스 수정 포함 오늘 밤 이전 커밋까지 전부 push+배포된 상태"라는 명시가 있고, v1.7(같은 날) 이후 모든 버전이 이 위에서 정상 동작을 전제로 진행·검증됐습니다. 다만 `supabase_v1_6_student_identity.sql` 자체가 정확히 언제 적용됐는지의 1차 기록(운영자 확인 로그)은 이 문서화 세션에서 별도로 찾지 못했습니다 — 라이브 재확인이 필요하면 `scripts/testIdentityMigration.mjs`로 검증 가능합니다.

> **버전 번호 관련 참고:** 2026-07-07 새벽 세션에서 사용자가 "v1.2까지 완료, 이제 v1.3(반 50명 실운영 관리 기능) 시작"이라고 요청했습니다. 실제로 구현된 내용은 아래 v1.1의 남은 항목들(날짜별 단어 배정, 숙제 관리, 관리자 통계)과 정확히 일치해서, 문서 상 버전 번호 혼선을 피하기 위해 이 문서에서는 계속 "v1.1"로 기록합니다. 학부모 전용 화면(v1.2)은 이번에 만들지 않았습니다 — 이번에 만든 건 **관리자용** 대시보드입니다.

목표: **초등학생들이 재미있게 매일 영어 단어를 공부하는 앱.**
버전은 v1.0부터 순서대로 완성한다 — 다음 버전 기능은 백로그에만 적어두고, 현재 버전이 안정화되기 전에는 구현하지 않는다.

---

## v1.0 — 완료 ✅

학생이 로그인해서 자기 반 단어를 공부하고, 단어/예문/퀴즈/녹음/미션/캘린더/별/스티커가 안정적으로 작동하는 것.

| 기능 | 상태 | 구현 위치 |
|---|---|---|
| 학생 로그인 (이름+반 선택, 재접속 시 자동 로그인) | ✅ | `StudentSelect.jsx`, `App.jsx` |
| 반별 단어 분리 (classId 기준, className 문자열 비교 아님) | ✅ | `utils/wordLibrary.js` (`classes → units → words` FK 체인) |
| 단어 학습 (발음 듣기) | ✅ | `WordDetail.jsx` |
| 예문 학습 (영어+한글 뜻) | ✅ | `WordDetail.jsx` (`ExampleStep`) |
| 녹음 및 내 발음 듣기 | ✅ | `WordDetail.jsx` (`SpeechBtn`), `utils/speech.js` (`recordWithAutoStop`) |
| 퀴즈 (4지선다 + 발음 연습) | ✅ | `QuizGame.jsx` |
| 오늘의 미션 4개 (단어보기/예문듣기/퀴즈/발음) | ✅ | `hooks/useStudent.js` (`dailyProgress`, 하루 중 반복 가능) |
| 별 / 스티커 / 캘린더 | ✅ | `hooks/useStudent.js`(통합 저장소 `paul_easy_progress`), `StudyCalendar.jsx`, `DiaryPage.jsx` |
| 뜻 풍선 게임 | ✅ | `BalloonGame.jsx` (`MatchGameShell` 기반) |
| 관리자 PIN 및 학생 접근 제한 | ✅ | `api/verify-admin-pin.js`(서버 검증), `AdminScreen.jsx` |

### v1.0 범위를 넘어 이미 함께 배포된 항목 (안정성 우선 원칙에 따라 제거하지 않음)

작업 도중 관련 버그를 고치거나 자연스럽게 확장하며 이미 구현되어 실제 운영 중인 기능들 — 전부 정상 동작 확인됨, 제거 시 오히려 기존 기능을 깨뜨리는 것이므로 유지함:

- 미니 게임 3종 추가(🎣 단어 낚시, 🍕 피자 만들기, 🚂 기차 태우기) — 뜻 풍선 게임과 동일한 로직 공유, 매번 다른 게임이 랜덤으로 나오되 직전 게임은 반복 안 됨
- 별 100/300/500/1000개 달성 배지, 연속 학습 3/7/14/30일 마일스톤 스티커
- 레벨업 미션(퀴즈 오답 복습), 다이어리 스티커 꾸미기
- 관리자: 반 이름 수정, 반별 학생 목록 보기, 엑셀/PDF 업로드 시 중복·덮어쓰기 확인

### v1.0 안정화 과정에서 고친 주요 버그

- Progress(미션/캘린더/별/스티커) 데이터가 여러 localStorage 키에 흩어져 있어 화면마다 다른 숫자를 보여주던 문제 → `paul_easy_progress` 단일 저장소로 통합
- 엑셀 업로드에서 반 선택 시 발생하던 크래시(존재하지 않는 함수 호출)
- 학생 이름 대소문자가 다르면 별개 계정으로 인식되어 진행 기록이 사라진 것처럼 보이던 문제
- 로그인 화면이 실제 폰 좁은 화면(360~414px)에서 오른쪽으로 잘리던 문제

---

## v1.1 — 완료 ✅ (2026-07-07)

날짜별 학습/숙제 관리와 관리자 편의 기능 + 반 50명 실운영을 위한 관리자 대시보드.

- [x] 게임 결과 히스토리 — `useStudent.js`(`gamesPlayed` per-day), `StudyCalendar.jsx` 일별 팝업.
- [x] 관리자 학생 로스터 고도화: 반별 그룹핑, 체크박스 일괄 이동, CSV 내보내기 — `AdminScreen.jsx`(`StudentManagement`).
- [x] **Supabase 진행도 동기화** — `student_progress`(누적: 별/클리어/스트릭/스티커), `student_daily_progress`(일별: 미션완료/별/퀴즈정답률/발음횟수/틀린단어) 테이블 신설. `useStudent.js`가 기록 변경 2초 후 fire-and-forget으로 동기화(`syncStudentProgress`) — 실패해도 로컬 진행에 전혀 영향 없음.
- [x] **날짜별 단어 배정** — `daily_assignments` 테이블. 관리자가 반의 단어 목록에서 체크박스로 오늘(또는 내일 이후 미리) 배정. 배정 없으면 기존처럼 유닛 전체 단어 폴백(기존 동작 100% 유지). `getStudentWords()`가 자동 반영.
- [x] **숙제 관리** — "숙제 = 오늘의 단어 배정 완료 여부"로 설계 통합(별도 스키마 없이 `daily_assignments` + `student_daily_progress.categories_completed>=4`로 커버). 날짜별 미리 배정 가능(`FutureAssignmentPlanner`).
- [x] **관리자 대시보드** (`AdminScreen.jsx` 새 탭) — 반 선택 시 학생별 오늘 공부 여부/숙제 완료 여부/최근 7일 기록/별·스티커·클리어 단어 수·연속학습일/퀴즈 정답률/발음 연습 횟수/많이 틀린 단어(빈도순).
- [x] **학생별 주간 리포트 + 학부모 요약 문구** — 대시보드에서 학생별로 생성. 규칙 기반 템플릿(AI 비용 없음), `src/utils/weeklyReport.js`. 복사하기 버튼 포함.

### v1.1 작업 중 발견·수정한 중요 버그 (2026-07-07)

**Unit 재배정이 재로그인 시 이전 값으로 되돌아가던 문제** — `wordLibrary.js`의 학생 캐시(`_students`)가 앱이 처음 열릴 때 딱 한 번만 채워지고 이후 절대 새로고침되지 않아서, 관리자가 다른 기기에서 학생의 유닛을 바꿔도 그 학생 쪽 탭에서는 로그아웃→재로그인(페이지 새로고침 없는 순수 상태 전환)해도 탭이 처음 열렸을 때의 옛날 값을 계속 보여줬음. `App.jsx`의 로그인 처리와 탭 포커스 복귀 시점에 학생 캐시를 항상 새로고침하도록 수정. `scripts/testUnitPersistence.mjs`로 Unit4→Unit5→재로그인→Unit5 유지까지 검증.

**[진짜 원인] 로그인 화면(StudentSelect.jsx)에서 유닛을 선택해도 기존 학생에게는 반영 안 되던 문제** — 위 캐시 수정으로도 해결 안 돼서 재조사한 끝에 발견. 로그인 화면의 유닛 드롭다운은 신규 학생 등록 때만 쓰이고, 이미 등록된 학생 이름이면 그 선택값을 아예 무시하고 로그인시켰음. 기존 학생이면 그 학생의 현재 반 유닛만 보여주는 드롭다운으로 바꾸고, 실제로 다른 유닛을 고르면 로그인 전에 DB에 반영하도록 수정. `scripts/testStudentSelectUnitSwitch.mjs`로 검증.

### v1.1 추가 기능 — 쓰기 시험(Spelling Test) (2026-07-07)

- [x] 학습 모드 선택(공부하기/퀴즈/쓰기/종합) — `WordBrowser.jsx`. 처음엔 듣기/말하기를 분리했다가 사용자 피드백으로 기존 학습 구조(발음+예문 따라 말하기)를 그대로 유지하는 "공부하기"로 단순화.
- [x] 쓰기 시험: 발음 2~3회 재생, 영어 단어 숨김(한글 뜻만 표시), 대소문자/공백 무시 채점, 오답 시 정답 표시 후 재입력 필수 — `SpellingQuestion.jsx`, 채점 로직은 `utils/spelling.js`
- [x] 오답노트 + 오늘 학습 종료 시 자동 복습(맞을 때까지 반복) — `useStudent.js`(`spellingWrongToday`), `SpellingReview.jsx`
- [x] 종합 모드: 발음+예문+퀴즈+스펠링 전부 완료해야 다음 단어(스펠링은 반 설정 켰을 때만 포함)
- [x] 관리자 반별 설정(쓰기시험 사용/힌트 사용/오답 반복 횟수) — `AdminScreen.jsx`(`SpellingSettingsPanel`), Supabase `classes` 테이블에 컬럼 3개 필요

> **`supabase_spelling_test_schema.sql` 실행 완료 (2026-07-07)** — 실제 라이브 Supabase에 대해 설정 저장/조회 round-trip까지 재검증 통과. 이제 관리자 화면에서 반별로 "쓰기 시험 사용"을 켜면 그 반에 쓰기/종합(스펠링 포함) 모드가 바로 나타납니다.

### v1.1 이후 발견·수정한 버그 (2026-07-10)

**단어만 보고 카테고리를 못 채운 날, 캘린더에 기록이 아예 안 생기던 문제** — 홈 화면엔 오늘 진행 흔적이 보이는데 공부 캘린더는 "0일 연속", 날짜 기록 없음으로 보이던 버그. `history[오늘]` 엔트리가 카테고리(단어/예문/퀴즈/발음) 하나를 완전히 채워야만 생성되던 게 원인 — `markWordViewed`가 단어를 처음 여는 시점에 바로 오늘 기록을 만들도록 수정. 자세한 내용은 `handoff.md` 2026-07-10 항목 참고.

### v1.5 — 완료 ✅ (2026-07-10): 안정화 — 숨김 관리자 Debug 페이지 + 동기화 상태 추적

학생 진행 기록이 클라우드에 실제로 잘 백업되는지 관리자가 눈으로 확인할 방법이 없던 것을 보완. 관리자 화면 제목 5번 탭 → 숨김 "디버그" 탭에서 학생별 로컬↔클라우드 데이터 비교 + 이 기기의 동기화 성공/실패 이력 확인 가능. 학생 쪽 동작/저장 로직은 전혀 안 바뀜 — 순수 관찰 도구 추가. 자세한 내용은 `handoff.md` 2026-07-10 항목 참고.

### v1.5.1 — 완료 ✅ (2026-07-10 밤): 안정성 우선순위 점검 (CTO 지시 대응)

새 기능 없이 "데이터 유실 0% → 동기화 안정성 → 에코 사운드 → 홈/캘린더/관리자 일치 → Skip 검증" 순서로 코드 리뷰 기반 버그 사냥. 가장 위험한 발견: 신규기기 로그인 시 클라우드 복구가 자동동기화 타이머보다 늦게 끝나면 빈 기록으로 클라우드 백업 자체를 덮어쓸 수 있던 레이스 컨디션(수정 완료) — 그 외 관리자 대시보드 "오늘 공부함" 배지 불일치, Skip "전체 초기화"가 클라우드 백업은 안 지우던 문제도 함께 수정. 모바일 UX/성능 최적화(우선순위 3, 7)는 시간 관계상 다음으로 이월. 자세한 내용은 `handoff.md` 2026-07-10 밤 항목 참고.

### v1.5.1 밤 (5차) — 완료 ✅ (2026-07-10): 관리자 CSV 내보내기 + 성능 최적화 + 학부모 화면(v1.2)

- 반 전체 통계 CSV 내보내기 — 아래 "다음에 필요하면 진행할 것"의 첫 항목이 이번에 완료됨.
- 성능: 학생 메인 번들 879KB→484KB(관리자 화면 React.lazy 분리), 앱 복귀 시 중복 API 호출 제거, 미니게임 메모리 누수 재점검(문제 없음 확인).
- **v1.2(학부모 화면) 완료** — 아래 v1.2 섹션 참고. 자세한 내용은 `handoff.md` 2026-07-10 밤(4~5차) 항목 참고.

### 다음에 필요하면 진행할 것 (백로그)

- 숙제를 "오늘의 단어 완료"와 별개의 자유 텍스트 과제(예: "책 3페이지 읽기")로 확장하고 싶다면 별도 `homework` 테이블 설계 필요 — 현재는 의도적으로 그렇게 하지 않음(스키마 단순 유지)

## v1.2 — 완료 ✅ (2026-07-10 밤)

학부모 모니터링. (참고: v1.1에서 만든 건 **관리자용** 대시보드/리포트, v1.2는 학부모가 직접 보는 화면 — 접근 방식은 관리자 PIN과는 별개로, 기존 학생 로그인과 동일한 "이름만으로 조회" 방식을 그대로 채택.)

- [x] 학부모 전용 보기 전용 화면(`ParentScreen.jsx`) — 오늘 학습 여부/숙제 완료/누적 별·연속학습·클리어단어/최근 7일 그래프/퀴즈 정답률/발음 횟수/취약 단어/주간 리포트. v1.1의 `fetchDashboardData`/`buildWeeklyReport` 그대로 재사용, 새 Supabase 쿼리 없음. `computeStudentStats`를 관리자 화면과 공유하는 `utils/weeklyReport.js`로 옮겨 두 화면이 항상 같은 숫자를 보여주도록 함.
- [ ] 반/학생 단위 통계(여러 반 비교 뷰) — 아직 미착수, v1.1 관리자 대시보드로 반 하나씩은 이미 충족.
- [ ] 알림/리포트 발송(문자/카톡) — 아직 "복사하기"만 지원, 발송 자체는 별도 검토 필요.

## v1.3 — 백로그 (미구현, 유료 API 필요 — 신중 검토 후 진행)

비용이 발생할 수 있는 AI 기능. **무료로 구현 가능한 대안이 없는지 먼저 확인하고, 실제 도입 전 반드시 비용/효과를 재확인한다.**

- AI 문장 검사 (학생이 직접 영작한 문장을 AI가 확인)
- STT 기반 발음 정확도 채점 (현재는 "녹음 성공 = 연습 완료"로 처리 중 — 실제 발음 평가로 고도화하려면 Whisper/Azure 등 유료 STT 연동 필요)
- AI 학습 콘텐츠 자동 생성/추천

## 장기 백로그 (v1.3 이후, 우선순위 미정)

`ADVANCED_FEATURES.md`, `EXPANSION_GUIDE.md`에 설계돼 있던 학원 운영 확장 아이디어 — 실제 필요가 생기기 전에는 구현하지 않음:

- 계약/결제 관리, Role-Based Access Control, Feature Flag 시스템

---

## 작업 원칙

1. 안정성 최우선 — 기존 기능을 깨뜨리지 않는 방향으로 개발
2. 한 번에 하나씩 — 작업 단위를 나누어 완료 후 다음으로
3. 매 작업마다 build → 오류 확인 → 기능 테스트
4. 새 기능보다 기존 버그 수정이 항상 우선
5. AI API 비용이 드는 기능은 무료 대안을 먼저 찾고, 없을 때만 검토
