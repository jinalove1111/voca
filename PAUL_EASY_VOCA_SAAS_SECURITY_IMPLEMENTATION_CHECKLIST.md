# PAUL_EASY_VOCA_SAAS_SECURITY_IMPLEMENTATION_CHECKLIST.md — 구현 전 최종 검증 체크리스트

_작성: 2026-07-26. **순수 검증 문서 — 코드/SQL/Migration을 이 세션에서
전혀 작성·실행하지 않았다.** `PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md`
/`PAUL_EASY_VOCA_RLS_POLICY_DESIGN.md`/`PAUL_EASY_VOCA_PERMISSION_
MATRIX.md`를 기반으로 한다. **이 문서 자체는 설계도가 아니라 그 3개
설계가 실제로 구현된 뒤 무엇을 확인해야 하는지를 정리한 체크리스트**
다 — `PAUL_EASY_VOCA_AI_AGENT_OS.md`의 QA Agent/Security Agent가 실제
구현 단계에서 이 문서를 실행 스크립트처럼 쓰는 것을 전제로 한다._

---

## 1. Multi Tenant 전환 체크리스트

### `academy_id` 적용 여부

- [ ] 6개 anchor 테이블(`classes`/`students`/`textbooks`/`seasons`/
      `product_events`/`ai_usage_daily`)에 `academy_id` 컬럼 존재
      확인(`TABLE_OWNERSHIP_MATRIX.md` §1)
- [ ] `students.academy_id`에 GRANT가 함께 적용됐는지 확인(CLAUDE.md
      규칙 10 — 빠뜨리면 기존 조회까지 fail-closed로 깨짐)
- [ ] `seasons`의 "학원별 최신 행" 쿼리 로직이 **단순 컬럼 추가가
      아니라 실제로 재작성**됐는지 확인(`MULTITENANT_DATABASE_
      DESIGN.md` §6 — 이 저장소에서 유일하게 컬럼 추가만으로 안
      끝나는 테이블)
- [ ] 나머지 21개+ 테이블은 컬럼 추가 없이 FK 체인 조인으로만
      처리됐는지 확인(불필요한 비정규화가 없는지 — `PERMISSION_
      MATRIX.md`가 전제한 구조와 일치하는지)

### 데이터 격리 확인

- [ ] 임의의 학원 A `academy_id`로 필터링 시 **정확히 그 학원 데이터만**
      반환되는지(다른 학원 데이터 0건) 실측
- [ ] `writing_answer_statistics`/`word_king_history` 같은 **집계
      테이블**이 여러 학원 데이터를 섞지 않고 학원별로 정확히
      분리되는지 확인(`TABLE_OWNERSHIP_MATRIX.md` §3 경고 항목)
- [ ] `spelling_ai_grading_cache`가 **의도치 않게** 학원 간 공유되고
      있지 않은지 확인(공유는 명시적 정책 승인 후에만 — 지금은 격리
      상태가 기본값이어야 함)
- [ ] `product_events`에 `student_id`가 **여전히 추가되지 않았는지**
      확인(비식별 원칙 유지 재확인)

### 신규 academy 생성 흐름

- [ ] `academies` 레코드 생성 → Owner 계정 발급(Supabase Auth) →
      기본 `academy_settings` 초기화까지 end-to-end 성공 확인
- [ ] 신규 academy 생성 직후 **기존 학원(academy #1) 데이터가 전혀
      영향받지 않는지** 확인(백필 로직이 신규 생성 경로에 실수로
      섞여 들어가지 않았는지)
- [ ] 신규 academy가 즉시 Free/Starter 등 올바른 기본 플랜 상태로
      시작하는지 확인(`SAAS_ARCHITECTURE_PLAN.md` §7.2)

---

## 2. Auth 체크리스트

### 회원가입

- [ ] Owner/Admin/Teacher는 Supabase Auth(이메일)로 가입되는지 확인
- [ ] Student는 **여전히 기존 PIN 모델**(이름+PIN, 서버 scrypt
      검증) — Auth 계정으로 잘못 전환되지 않았는지 확인(`PERMISSION_
      MATRIX.md`가 이미 이 구분을 전제)
- [ ] Parent는 `access_code` 기반 인증이며 Supabase Auth 계정이
      아닌지 확인(불필요한 계정 증식 방지)

### 초대 방식

- [ ] Owner가 Admin/Teacher를 초대하는 플로우가 정상 동작(초대
      이메일/링크)
- [ ] 초대 링크에 **만료 시간**이 있는지 확인(무기한 유효 링크는
      보안 위험)
- [ ] Admin이 Teacher를 초대할 수 있되, **Owner나 다른 Admin을
      초대/변경할 수 없는지**(`PERMISSION_MATRIX.md` Admin 정의) 확인

### 역할 부여

- [ ] `academy_members`의 역할(`role`) 값이 화이트리스트(`owner`/
      `admin`/`teacher`)를 벗어난 값으로 저장될 수 없는지 확인
- [ ] 기본값(초대 링크로 신규 가입 시 초기 role)이 **의도한 역할과
      정확히 일치**하는지 — 실수로 Teacher 초대 링크가 Admin 권한을
      부여하지 않는지 확인
- [ ] 역할 변경(예: Teacher→Admin 승격)이 **Owner 또는 Admin만**
      할 수 있는지 확인(Teacher가 자기 자신을 승격시킬 수 없어야 함)

### 탈퇴 처리

- [ ] Teacher/Admin 계정 해제 시 **활성 세션이 즉시 무효화**되는지
      확인(`ROLE_PERMISSION_MATRIX.md` §4가 이미 지적한 "퇴사한 교사
      계정이 계속 접근 가능" 위험)
- [ ] 학생 계정 삭제 시 진행도 데이터가 **즉시 영구 삭제가 아니라**
      기존 관례(`ON DELETE SET NULL`/보존 후 별도 정리 절차)를
      따르는지 확인
- [ ] Parent `access_code` 회수(`revoked_at`)가 **즉시 접근 차단으로
      이어지는지**(캐시된 세션이 남아있지 않은지) 확인
- [ ] Academy 자체 탈퇴(계약 해지) 시 `SAAS_ARCHITECTURE_PLAN.md`
      §5.4의 통제된 오프보딩 절차(즉시 물리 삭제 아님)를 따르는지 확인

---

## 3. RLS 적용 체크리스트

### 테이블별 정책 확인 — SELECT

- [ ] 6개 anchor 테이블: `academy_id = current_academy_id()` 조건이
      실제로 걸려 있는지(정책이 없어서 "전체 허용"으로 새는 테이블이
      없는지)
- [ ] 체인 테이블: 조인 조건이 올바른 방향(짧은 경로 우선, §`RLS_
      POLICY_DESIGN.md` §4)으로 걸려 있는지
- [ ] 학생 전용 데이터(`student_progress` 등): `student_id = current_
      student_id()` 조건이 **academy 조건과 혼동되지 않고** 정확히
      적용됐는지
- [ ] Parent 조건: `parent_student_link` 경유 조건이 실제로 걸려
      있는지(이게 없으면 §5의 "다른 academy 학생 ID 직접 입력" 시나리오
      그대로 뚫림)

### 테이블별 정책 확인 — INSERT/UPDATE

- [ ] Student가 **자기 자신의 것만** INSERT/UPDATE 가능한지(다른
      `student_id`로 위장한 요청이 거부되는지)
- [ ] Teacher가 파괴적이지 않은 콘텐츠만 UPDATE 가능하고, Owner/Admin
      전용 설정(`class.update_settings`의 민감 필드 등)은 거부되는지
- [ ] Parent의 INSERT/UPDATE 시도가 **테이블 어디에서든** 100% 거부
      되는지(설계상 완전 읽기 전용)

### 테이블별 정책 확인 — DELETE

- [ ] `classes`/`students` DELETE가 **Owner/Admin만** 가능하고
      Teacher는 거부되는지(`PERMISSION_MATRIX.md` Teacher 정의)
- [ ] `academy_members` DELETE(구성원 해제)가 역할 계층을 지키는지
      (Admin이 Owner를 해제할 수 없는지)
- [ ] `academies` 자체의 DELETE가 **직접 노출된 경로로는 존재하지
      않는지**(§1의 통제된 오프보딩 절차로만 가능해야 함)

### 권한 검증 — 공통

- [ ] RLS가 켜져 있는데 정책이 하나도 없는 작업(예: 어떤 테이블의
      INSERT)이 **의도한 대로 자동 거부**되는지(fail-closed 확인,
      `RLS_POLICY_DESIGN.md` §1 원칙 3)
- [ ] service_role 경유 Edge Function이 RLS 우회 후에도 **함수 내부
      자체 검증**(academy_id/role 일치)을 반드시 거치는지(`RLS_
      POLICY_DESIGN.md` §8)

---

## 4. Role별 테스트 시나리오

| 역할 | 시나리오 | 기대 결과 | 실패 시 위험도 |
|---|---|---|---|
| **Super Admin** | 전체 academy 목록·집계 조회 시도 | 전 학원 데이터 정상 조회, 모든 조회가 감사로그에 기록됨 | 감사로그 누락 시 Medium(추적 불가) |
| **Academy Owner** | 자기 academy 데이터 조회 + **다른 academy_id를 URL/API 파라미터로 직접 지정**해 조회 시도 | 자기 것은 성공, 타 academy는 **빈 결과 또는 명시적 거부** | **Critical**(성공하면 전체 격리 실패) |
| **Academy Admin** | 학생 등록/반 관리 등 운영 데이터 관리 + **결제 플랜 변경 시도** | 운영 데이터 관리는 성공, 결제 변경은 **거부**(`PERMISSION_MATRIX.md` Admin 정의) | High(거부 안 되면 권한 경계 붕괴) |
| **Teacher** | 담당 반 콘텐츠 수정 + **담당 아닌 반 또는 반 삭제 시도** | 담당 반 수정 성공, 비담당 반/삭제는 **거부** | High |
| **Student** | 본인 진행도 조회/제출 + **다른 학생 UUID로 진행도 조회 시도** | 본인 것은 성공, 타 학생은 **거부** | **Critical**(성공하면 전 학생 데이터 노출 가능) |
| **Parent** | 연결된 자녀 조회 + **`access_code`를 다른 학생 것으로 바꿔 시도** | 연결된 자녀만 성공, 임의 변경은 **거부** | **Critical**(성공하면 임의 학생 정보 유출) |

---

## 5. 보안 사고 테스트 (실측 침투 테스트, v3_11 검증 방법론 재사용)

`docs/audit/2026-07-24-security.md`/`docs/audit/2026-07-26-v3_11-
lockdown-execution-review.md`가 이미 쓴 방법론(anon key로 curl 직접
호출, 0행 매칭 쓰기 시도까지만 — 실 데이터 변경 금지)을 그대로
확장한다.

- [ ] **다른 academy 학생 ID 직접 입력** — 로그인된 학생 세션으로
      다른 academy 소속 임의 `student_id`(UUID 추측/타 학원 응답에서
      획득 가능성 고려)를 진행도 조회 API에 넣어 시도 → 거부 확인
- [ ] **URL 변경 접근** — 프론트엔드 라우트를 직접 조작해(예:
      `showAdmin`류 state를 개발자도구로 강제 true) 권한 없는 화면
      진입 시도 → **화면은 열려도 실제 데이터 API 호출은 거부**되는지
      확인(프런트 상태는 신뢰 경계가 아니라는 원칙의 실측)
- [ ] **API 직접 호출**(curl, anon key만 사용) — `admin-content-write`
      류 Edge Function에 유효하지 않은 인증(잘못된 adminPin/Auth 토큰)
      으로 직접 POST → `not_authorized` 일관 응답 확인(action 존재
      여부를 추측 못 하게, `RLS_POLICY_DESIGN.md` §8과 동일 원칙)
- [ ] **권한 상승 시도** — Teacher 계정으로 Owner 전용 action(`class.
      delete`/`subscription.update`류)을 직접 요청 → 거부 확인 +
      **JWT `app_metadata`를 클라이언트에서 직접 수정 시도**(브라우저
      스토리지 조작) → 서버가 클라이언트가 보낸 클레임이 아니라 자체
      검증된 토큰만 신뢰하는지 확인
- [ ] **Parent `access_code` 무차별 대입 시도**(짧은 코드 형식이면
      추측 가능) → 실패 횟수 제한/지연이 실제로 걸리는지 확인
- [ ] 위 시도 중 **실제로 성공하는 것이 하나라도 있으면 즉시 배포
      중단** — 이 섹션의 항목들은 전부 "0건 성공"이 통과 기준

---

## 6. Production 배포 전 확인사항

- [ ] 위 1~5 섹션 **전 항목 PASS**(하나라도 미확인 상태로 배포하지
      않음)
- [ ] `npm run build`/`npm run verify:all` PASS(SKIP 도메인 제외)
- [ ] QA Agent 독립 재검증 완료(`AI_AGENT_OS.md` §7 원칙 — self-report
      불신)
- [ ] Security Agent가 §5 침투 테스트 결과를 **evidence(실행 로그)와
      함께** 별도 보고
- [ ] 롤백 계획 존재 확인(RLS는 `disable row level security`로,
      `academy_id` 컬럼 추가는 되돌리지 않고 남겨두는 기존 관례—
      `MULTITENANT_DATABASE_DESIGN.md` §6)
- [ ] 스테이징 환경에서 전체 마이그레이션+RLS 적용을 **먼저 실행**해
      회귀 없음을 확인한 뒤에만 프로덕션 적용(`CUSTOMER_OPERATION_
      PLAN.md` §7 QA Agent 책임)
- [ ] 모니터링/알림이 실제로 가동 중인지 확인(배포 직후 이상 징후를
      사람이 수동으로 찾지 않아도 되게)
- [ ] 감사 로그가 실제로 기록되고 있는지(빈 로그가 "이상 없음"이
      아니라 "로그 자체가 안 됨"일 수 있음 — 반드시 최근 실제 액션이
      로그에 남았는지 눈으로 확인)
- [ ] Vercel 유료 플랜 전환 완료(상업적 이용 ToS 준수, 이 체크리스트
      실행 자체가 이미 외부 학원을 받는다는 전제이므로 필수)
- [ ] 위 전 항목을 통과한 시점을 `handoff.md`에 기록하고 `PROJECT_
      BOARD.md` 카드를 `DONE`으로 이동

---

## 관련 문서

`PAUL_EASY_VOCA_TABLE_OWNERSHIP_MATRIX.md`, `PAUL_EASY_VOCA_RLS_
POLICY_DESIGN.md`, `PAUL_EASY_VOCA_PERMISSION_MATRIX.md`, `PAUL_
EASY_VOCA_AI_AGENT_OS.md`(QA/Security Agent 역할 원본), `docs/audit/
2026-07-26-v3_11-lockdown-execution-review.md`(침투 테스트 방법론
원본), `docs/audit/2026-07-24-security.md`.
