# wiki/security-notes.md — 보안 노트

_`DATABASE.md`/`handoff.md`/`PROJECT_BOARD.md`의 보안 관련 사실만
요약. 상세 근거/영향 분석은 원본 문서 참고._

## 인증 모델 (Supabase Auth 미사용)

이 앱은 Supabase Auth를 쓰지 않습니다 — 학생/관리자 전부 같은 anon key로
접속하고, "누구인지"는 애플리케이션 레벨(이름+PIN, 관리자 단일 PIN)로만
구분합니다. 이 전제가 아래 대부분의 보안 설계 결정의 출발점입니다.
근거: [`ARCHITECTURE.md` "1. 전체 아키텍처"](../ARCHITECTURE.md#1-전체-아키텍처).

## `students` 컬럼 권한 (v1.9)

- RLS(행 정책) 대신 **컬럼 단위 GRANT** — 행 단위로 "누구인지" 구분할
  방법이 없어 RLS가 의미 없음(위 인증 모델 참고).
- PIN 관련 4개 컬럼(`pin_hash`/`pin_fail_count`/`pin_locked_until`/
  `pin_setup_allowed`)은 anon/authenticated의 SELECT/UPDATE가 완전히
  회수됨 — 클라이언트 코드가 실수로도 접근 불가.
- **운영 함정**: `students`에 새 컬럼을 추가하는 모든 향후 마이그레이션은
  `grant select (새컬럼) on public.students to anon, authenticated;`를
  반드시 같이 실행해야 함 — 빠뜨리면 그 컬럼만 못 읽는 게 아니라 관련
  조회 전체가 fail-closed로 깨질 수 있음(v2.1이 이 절차를 올바르게
  준수한 사례). 근거:
  [`DATABASE.md` "RLS / 컬럼권한 현황"](../DATABASE.md#rls-컬럼권한-현황).

## PIN 해시 방식

`api/_pinAuth.js` — Node 내장 `crypto.scryptSync` + `timingSafeEqual`로
직접 구현(외부 라이브러리 없음, `bcrypt` 등을 쓰지 않는 것이 이 저장소의
"외부 의존성 최소화" 원칙의 실례). 5회 연속 실패 시
`pin_fail_count`/`pin_locked_until`로 서버 측 잠금. PIN 검증/설정은
**오직 `api/*.js`(서버리스, service_role key)만** 수행 — 클라이언트는
PIN을 직접 검증하지 않음.

## 관리자 재인증

`AdminScreen.jsx` 진입 시 PIN(`ADMIN_PIN` 환경변수) 검증 후
`authed=true` state가 생기지만, 파괴적/유출성 액션(PIN 초기화, 임시PIN
일괄발급 등)은 **매 요청마다 `checkAdminReauth()`로 서버에서 다시
`ADMIN_PIN`을 확인**함 — 클라이언트 state만으로는 그런 API를 호출할 수
없도록 방어(2026-07-16 P7 감사 후속).

## 알려진 보안 갭 (미수정, 기록만 — `PROJECT_BOARD.md`와 동기화)

- **[P1, Medium] 입실시험 결과 서버 재검증 없음 — 2026-07-19 수정 완료
  (VERIFY, `PROJECT_BOARD.md` 참고).** 원래 문제: 클라이언트가 계산한
  점수를 서버 재검증 없이 그대로 저장 + `entrance_test_results`의 RLS가
  `using (true) with check (true)`라 anon key로 임의 `student_id`/
  `test_id`의 점수 조작 가능(재현 실측 완료). 위협 모델: 결제/PII/계정탈취
  아님 — 학원 내부 "오늘의 VIP" 경쟁 배지 조작 한정.
  **수정 내용**: `api/submit-entrance-result.js` 신설 — 클라이언트는
  이제 `score`/`total`을 아예 보낼 수 없고, 실제로 푼 문제(word+direction)
  와 입력한 답만 보낸다. 서버가 `entrance_tests.words`(DB 스냅샷)로 정답을
  직접 조립해 기존 순수 함수 `computeTestResult()`로 재채점한 결과만
  저장한다. 개수 축소/단어 중복/가짜 단어/방향 위장 등 4종 조작 시도를
  전부 명시적으로 거부(`answer_count_mismatch`/`duplicate_word`/
  `unknown_word`/`direction_mismatch`) — `scripts/testEntranceTestDb.mjs`
  "7.5. 조작 시도 거부" 섹션에서 실측 확인(클라이언트가 `score:999`를
  같이 보내도 서버가 무시하고 실제 입력을 재채점해 0점으로 저장하는
  것까지 증명). `entranceTestApi.js`의 기존 anon 직접 upsert 경로는
  제거됨(이제 이 API 경유만). RLS 강화 SQL(`supabase_v2_4_entrance_
  result_rls.sql` — `entrance_test_results` anon 쓰기 전면 차단, SELECT만
  유지)도 함께 작성했으나 **운영자 실행 대기**(멱등, 미실행이어도 이
  API 자체가 이미 재검증하므로 이중 방어 중 하나만 아직 안 걸린 상태).
- **[P2, Medium] `api/verify-admin-pin.js` 정식 rate limit 부재.**
  실패 시 1.5초 지연만 있고 정식 rate limit/잠금 없음(학생 PIN은 5회 DB
  잠금과 비대칭). 관리자가 원장 1인이라 위협 모델상 우선순위 낮게 유지.
- **[P2] 학생 자기등록 부분 실패 시 계정 고아 상태.** `addStudent()`
  성공 후 `/api/set-student-pin` 호출이 네트워크 실패 등으로 실패하면
  학생이 DB엔 있지만 로그인도 PIN 생성도 막힘 — 관리자가 로스터에서
  "PIN 설정 허용"으로 수동 복구 가능(크래시/유실 없음).
- **[P3] `api/student-pin-status.js` 무인증.** boolean만 노출, 정보
  노출 미미하다고 판단해 낮은 우선순위 유지.
- **[P1, 기술부채] 핵심 4테이블(`students`/`classes`/`units`/`words`)
  DDL이 저장소에 없음.** 새 Supabase 프로젝트에서 이 저장소만으로 스키마
  재현 불가 — 보안 취약점은 아니지만 재해복구 리스크.
- **[P2, 기술부채] `classes`/`units`/`words` — RLS/GRANT SQL이 저장소에
  없음.** 원본 대시보드 생성 시 설정을 파일로 확인 불가 — 위 DDL 부재와
  같은 뿌리.

## 관련 파일

`C:\voca\supabase_v1_9_security_rls.sql`, `C:\voca\api\_pinAuth.js`,
`C:\voca\DATABASE.md`, `C:\voca\PROJECT_BOARD.md`,
`C:\voca\scripts\testRlsSecurity.mjs`,
`C:\voca\api\submit-entrance-result.js`,
`C:\voca\supabase_v2_4_entrance_result_rls.sql`,
`C:\voca\scripts\testEntranceTestDb.mjs`
