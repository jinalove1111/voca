# Security Audit — Paul Easy Voca v3.11 (Beta Gate)

_작성: 2026-07-29. 이 문서는 v3.11 커리큘럼 쓰기 락다운의 현재 보안 상태를
라이브 실측 + 코드 리뷰로 정리하고, 베타 출시 전 남은 보안 작업을 우선순위로
기록한다. **이 세션은 코드 1건(학생 화면 표시 버그, 보안 무관)만 수정했고,
Supabase DDL/Edge Function 배포는 하지 않았다(운영자 수동 영역, 헌법 규칙 8).**_

관련: `supabase_v3_11_lockdown_curriculum_write.sql`,
`supabase_v3_12_lockdown_daily_assignments.sql`(신규, 미적용),
`supabase/functions/admin-content-write/index.ts`,
`docs/audit/2026-07-24-security.md`,
`docs/audit/2026-07-26-v3_11-lockdown-execution-review.md`,
`docs/audit/2026-07-26-v3_11-1hour-runbook.md`.

---

## 1. 한눈에 보는 현재 보안 상태 (2026-07-29 실측)

| 항목 | 상태 | 근거 |
|---|---|---|
| classes/units/words anon 직접 쓰기 | 🔴 **아직 열림** | v3_11 SQL 미실행 — anon INSERT 프로브가 42501이 아닌 23502(not-null) 반환(무부작용 프로브, 행 생성 안 됨) |
| admin-content-write Edge Function | 🔴 **미배포(404)** | OPTIONS/POST 모두 404 NOT_FOUND. 대조군 grade-writing-answers도 404 |
| **결과: 관리자 커리큘럼 쓰기(프로덕션)** | 🔴 **현재 깨져 있을 가능성 높음** | 프론트는 pin(truthy)으로 404 함수에 라우팅 → throw. §3 참고 |
| daily_assignments anon 직접 쓰기 | 🔴 **열림(신규 발견)** | `allow anon all using(true) with check(true)`, v3_11 범위에서 누락. §4 CRITICAL |
| students PIN 컬럼(pin_hash 등) 클라이언트 노출 | 🟢 **보호됨** | 클라이언트 코드가 PIN 컬럼을 select/log하지 않음(grep 확인), 서버 api/*.js만 취급 |
| students 조회 노출면 | 🟢 **최소** | 클라이언트 select는 `id,name,class_id,unit_name,classes(name)`만(STUDENTS_SELECT_BASE) |
| 관리자 인가(Edge Function 코드) | 🟢 **올바름** | 매 요청 ADMIN_PIN 서버 재검증 → 통과 후에만 service_role, 응답에 키 미포함 |

**요약**: v3.11의 **코드는 완성·정확하지만, 라이브에는 아무것도 적용되지
않았다.** Edge Function 미배포 + SQL 미실행이라 (a) 취약점은 여전히 열려 있고,
(b) 프론트는 이미 락다운을 전제로 배포돼 관리자 쓰기가 404로 깨져 있는,
"최악의 중간 상태"다. 이 중간 상태를 닫는 것이 베타 최우선 보안 작업.

---

## 2. RLS 상태 (테이블별)

- **`using (true)`(열림, anon 전체 허용)**: `daily_assignments`(🔴 §4),
  `student_progress`, `student_daily_progress`, `word_status`,
  `entrance_tests`, `spelling_review_queue`, `textbooks`, `class_textbooks`,
  `passages`, `passage_sentences`, `sentence_progress`, `product_events` 등.
  → 학생 진행/기록 계열은 설계상 anon 쓰기가 필요(학생이 로그인 없이 자기
  진행을 저장)해 열려 있음. blast radius는 단일 학원 내부 데이터.
- **anon 읽기 전용 + service_role 쓰기**: `xp_ledger`, `word_king_history`,
  `seasons`, `entrance_test_results`. v3_11 실행 후 여기 `classes`/`units`/
  `words` 합류 예정, v3_12 실행 후 `daily_assignments` 합류 예정.
- **컬럼 단위 GRANT/REVOKE**: `students`만 유일(`supabase_v1_9_security_
  rls.sql`) — 테이블 SELECT/UPDATE 회수 후 컬럼별 재부여, PIN 4컬럼 제외.
- **주의(헌법 규칙 10)**: `students`에 새 컬럼 추가 시 GRANT를 같이 실행하지
  않으면 그 컬럼뿐 아니라 기존 조회까지 fail-closed로 깨질 수 있음.

---

## 3. Edge Function 상태 — admin-content-write

- **코드: 정확함(리뷰 통과).** 매 요청 `Deno.env.get('ADMIN_PIN')`와 body
  adminPin을 action 분기 **전에** 재검증, 실패 시 항상 동일한
  `not_authorized`(action 열거 방지) + 1.5초 지연. service_role client는
  인가 통과 후에만 생성(index.ts:295), 응답 바디에 키 미포함. 8개 action
  전부 구현, wordLibrary.js의 `callAdminContentWrite('...')` 호출 8종과
  1:1 일치. 주입 위험 없음(전부 supabase-js 파라미터라이즈드 쿼리).
- **클라이언트 처리: 정확함.** `callAdminContentWrite`(wordLibrary.js:70)가
  `!res.ok || !body || body.ok===false`를 검사 → 404(body null)와
  HTTP200+`{ok:false}` 모두 throw, `not_authorized`는 명확한 메시지.
- **배포: 안 됨(404).** → 아래 permission risk의 근원.
- **알려진 함정(문서화)**: 프론트가 이미 락다운 전제로 배포돼 있어,
  Edge Function을 배포하지 않으면 관리자 반/유닛/단어 CRUD가 404로 실패한다.
  운영자는 `docs/audit/2026-07-26-v3_11-1hour-runbook.md`의 순서(①시크릿 →
  ②함수 배포 → ③Vercel 최신 확인 → ④관리자 저장 1회 테스트 → ⑤SQL 실행)를
  지켜야 한다.

---

## 4. Permission Risks (우선순위순)

### 🔴 CRITICAL-1 — daily_assignments 숙제 배정 무인가 쓰기 (신규 발견)
- **무엇**: `setTodaysAssignment`/`setAssignmentForDate`(wordLibrary.js:2151,
  2169)가 adminPin 없이 anon key로 직접 쓴다. `daily_assignments` RLS는
  `allow anon all`(전체 CRUD 허용). AdminScreen 3개 호출부도 pin 미전달.
- **영향**: 공개 anon key(배포 번들에 포함)만으로 인터넷 누구나 인증 없이
  임의 반의 임의 날짜 숙제 단어를 덮어쓰거나 비울 수 있다. classes/units/
  words와 **정확히 같은 취약점 클래스**인데 v3_11 범위에서 누락됨. 지금
  라이브에서 실제로 열려 있다.
- **왜 이 세션에서 코드로 고치지 않았나(안전 결정)**: 완전한 수정은 v3_11과
  동일하게 (a) Edge Function에 `assignment.set` action 추가·**배포**(운영자
  전용, 이 세션 불가), (b) 프론트 배선을 요구한다. 그런데 지금 숙제 배정은
  **정상 동작 중**(anon 경로)이라, 프론트만 먼저 배선·배포하면 v3_11처럼
  404로 깨진다 — 즉 배포 순서를 못 지키면 잘 되는 기능을 새로 깨뜨린다
  (헌법 규칙 1). 검증 하네스도 이 Edge Function 경로를 테스트하지 못한다.
  따라서 무감독 자율 세션에서 보안 경계 코드를 배포 불가 상태로 바꾸는 것은
  위험 → **비활성(inert) SQL 아티팩트(`supabase_v3_12_...sql`, 미적용, 강한
  실행 금지 경고 헤더)만 준비**하고, 코드 배선은 운영자 승인 세션으로 남긴다.
- **권고 조치**: v3_12 SQL 헤더의 6단계(§실행 전 선행 코드 작업) 순서대로.
  v3_11 배포 작업과 한 배치로 처리하는 것이 효율적.
- **UPDATE 2026-07-30**: 위 "코드로 고치지 않았다"는 이후 세션에서 해소됨.
  daily_assignments 듀얼패스가 v3.11과 동일 패턴으로 **code-complete**
  (admin-content-write `assignment.set` action + wordLibrary.js dual-path +
  AdminScreen 4개 호출부 pin 배선, build+verify:admin 등 전체 PASS). 이제
  v3.12는 v3.11과 대칭(코드 완료·배포 대기)이며, 함수 배포 1번으로 둘 다
  커버된다. 상세: `docs/DEPLOY_COMMANDS_V311_V312.md`, handoff 2026-07-30.

### 🔴 CRITICAL-2 — v3.11 미적용으로 인한 이중 노출
- classes/units/words가 여전히 anon CRUD로 열려 있고(SQL 미실행), 동시에
  관리자 쓰기는 404로 깨져 있다(함수 미배포). 런북대로 배포+실행하면 닫힌다.

### 🟡 MEDIUM-1 — class.update_settings 필드 allowlist 없음
- `handleClassUpdateSettings`(index.ts:239)가 클라이언트 `settings`를
  검증 없이 `{...settings}`로 `.update()`에 그대로 전개. adminPin을 이미
  가진 자가 5개 설정 필드 외 임의 `classes` 컬럼(예: class_type)을
  세팅 가능(권한 상승은 아님 — 이미 관리자면 class.rename/delete도 가능).
- **권고**: 다른 핸들러처럼 키 allowlist(`spelling_test_enabled`,
  `spelling_hint_enabled`, `wrong_answer_repeat_count`, `spelling_direction`,
  `gamification_enabled`) 후 toSend 구성. **이 세션에서 고치지 않은 이유**:
  Edge Function은 미배포라 편집이 라이브에 영향 없고, Deno 함수를 로컬
  하네스로 검증할 수 없어(테스트 불가) 무감독 편집은 지양 — 운영자가
  admin-content-write를 배포할 때 함께 반영 권장.

### 🟢 LOW-1 — PIN 평문 완전일치 비교(timing-safe 아님)
- `verifyAdminPin`(index.ts:92)의 `===`는 constant-time이 아님. 단,
  `api/_pinAuth.js`/`grade-writing-answers`와 **의도적으로 동일**한 관례이며
  실제 방어선은 "서버측 검증 + 실패 1.5초 지연"이다(4자리 PIN의 진짜 위험은
  타이밍 사이드채널이 아니라 브루트포스 레이트). 새 발견 아님, 일관성 유지.

### 🟢 정보 — deleteClassUnit 죽은 import
- AdminScreen.jsx:3에서 import하지만 호출부 0개. 보안 이슈 아님(유닛 삭제
  UI 경로 자체가 없음). 후속 정리 대상.

---

## 5. 확인된 보호(정상 동작 재확인)

- **students PIN 컬럼 클라이언트 미노출**: `src/` 전체 grep 시 `pin_hash`/
  `pin_fail_count`/`pin_locked_until`/`pin_setup_allowed` 사용처가 전부
  (a) 보호 설명 주석, (b) 서버 api/*.js에 보내는 action 이름 문자열
  (`'set_pin_setup_allowed'`)뿐. 클라이언트가 이 컬럼을 select/log하지
  않음. wordLibrary.js:975-1089는 오히려 pin_hash 노출을 막으려 bare
  `.select()`를 제거한 P7 감사 흔적.
- **관리자 전용 쓰기 서버측 게이트**: 커리큘럼 쓰기는 admin-content-write
  `verifyAdminPin`, 학생 PIN 관리는 `api/admin-pin-actions.js`→
  `checkAdminReauth`. 유일 예외가 §4 CRITICAL-1(daily_assignments).
- **학생 식별 UUID 일관**: dashboard/homework/roster 함수 전부 students.id
  (UUID)/class_id(FK) 기준, 이름 문자열 매칭 없음(v1.6 P0 수정 유지).

---

## 6. 권고 — 향후 보안 개선(우선순위)

1. **(베타 차단) v3.11 배포 순서 완료** — 런북 ①~⑤. Edge Function 배포로
   현재 깨진 관리자 쓰기 복구 + SQL로 anon 쓰기 차단.
2. **(베타 차단) daily_assignments 락다운** — §4 CRITICAL-1, v3_12 SQL
   헤더의 6단계. v3.11과 한 배치 권장.
3. class.update_settings 필드 allowlist(§MEDIUM-1) — 함수 배포 시 함께.
4. 관리자 콘텐츠 쓰기 감사 로그(누가/언제/무엇을) — 다수 고객 전 필수는
   아니나 베타 운영 신뢰도 향상.
5. 학생 점수/XP 제출에 세션 토큰(현재 studentId만 알면 대리 제출 가능,
   단일 학원 내부라 현재 Low) — 멀티테넌트 전 필수, `docs/SAAS_READINESS_
   REVIEW.md` §7-5.
6. 실질 rate limit(현재 고정 1.5초 지연만, 병렬 요청에 무력) — 외부 의존성
   필요(규칙 6과 충돌)라 상업화 시점에.

_이 문서의 §4-6은 권고/분석이다. 이 세션은 보안 코드/DDL/배포를 변경하지
않았다(학생 표시 버그 1건만 수정, 보안 무관)._

---

## 7. v3_13(Curriculum Engine Phase 0) 합류 노트 (2026-07-31 append, 리뷰 반영)

`supabase_v3_13_curriculum_engine_phase0.sql`(신규, 아직 미실행)이 만드는
5개 신규 테이블(`publishers`/`grades`/`grammar_points`/
`unit_grammar_points`/`examples`)은 이 문서 §2가 서술한 "anon 개방 →
v3.11/v3.12 계열 락다운으로 합류" 패턴을 그대로 따르는 **추가 합류
대상**이다. 이 문서의 §1~§6은 v3.11/v3.12 범위(classes/units/words/
daily_assignments)만 다루므로, v3_13이 실행된 뒤에도 그 표들을 다시
읽을 때 `examples` 등은 "아직 별도 항목"으로 취급해야 한다.

- **경고**: v3.11+v3.12만 라이브에 배포되고 v3_13의 락다운 합류 블록을
  실행하지 않으면, `examples`는 **anon이 그대로 쓸 수 있는 상태**로
  남는다 — 공개 anon key(배포 번들에 포함)만으로 누구나 예문을
  삽입/수정/삭제할 수 있다는 뜻이며, 이는 §4의 CRITICAL-1
  (daily_assignments)과 같은 유형의 리스크다. `examples`를 잠그려면
  v3_13 파일 안의 "[락다운 합류 블록 — 주석 처리, 현재 미실행]"을 이
  문서 관련 시트인 `docs/DEPLOY_COMMANDS_V311_V312.md` §8이 서술한
  순서로 별도 실행해야 한다.
- **M1 재실행 가드 참고**: v3_13의 개방 정책 생성 가드는(2026-07-31
  리뷰 반영) 정책 이름이 아니라 "그 테이블에 정책이 하나라도 있는가"만
  확인한다 — 락다운 합류 블록을 먼저 실행한 뒤 v3_13 파일 앞부분을
  실수로 재실행해도 개방 정책이 되살아나지 않는다(안전판, 실행 순서
  자체를 대체하지는 않음).
