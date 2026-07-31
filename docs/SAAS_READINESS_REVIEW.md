# SaaS Readiness Review — Paul Easy Voca

_작성: 2026-07-29. **분석 전용 문서다 — 이 세션은 SaaS 기능을 구현하지 않았고,
코드/SQL/DB/스키마를 전혀 변경하지 않았다.** 이 문서는 "지금 코드에 실제로
무엇이 있는가(CODE-REALITY)"와 "설계 문서가 무엇을 제안하는가
(DESIGN-DOC-PROPOSAL)"를 명확히 구분해 기록한다. 운영자는 이미 SaaS 구축보다
고객 검증(customer validation)을 먼저 하기로 피벗했으므로, 이 문서의 어떤
항목도 "지금 착수하라"는 뜻이 아니다._

관련 근거 문서: `docs/audit/2026-07-24-performance-db.md`,
`docs/audit/2026-07-24-security.md`,
`docs/audit/2026-07-26-saas-multi-tenant-security-top10.md`,
`DATABASE.md`, `docs/architecture/PAUL_EASY_VOCA_*.md`(설계 문서군,
2026-07-31 `docs/architecture/`로 재배치됨) + `docs/future-ideas/
PAUL_EASY_VOCA_*.md`(사업/전략 문서군, 같은 날 `docs/future-ideas/`로
재배치됨),
`docs/agent-decisions/0006-multitenant-saas-architecture.md`.

---

## 1. 결론 요약 (한 문단)

현재 Paul Easy Voca는 **구조적으로 단일 학원(single-tenant) 앱**이다.
academy/tenant 개념은 스키마·쿼리·인증 어디에도 존재하지 않으며,
`academy_id`/`tenant`/`org_id`라는 식별자는 **오직 설계 문서(Markdown)의
서술 안에만** 존재한다(코드/SQL 0건). 따라서 "멀티테넌트 준비도"는
"부분적으로 돼 있다"가 아니라 **"아직 시작 지점(0)"**이 정확한 상태 —
이건 결함이 아니라 지금까지 단일 학원(≈111명) 프로덕션에 집중한 결과이며,
베타 출시(단일 학원)에는 아무 문제가 없다. 멀티테넌트는 별도의 큰
아키텍처 전환 프로젝트로, 고객 검증 통과 후에 착수할 대상이다.

---

## 2. 학원 분리(Academy Separation) 준비도 — CODE-REALITY

**현재 코드/스키마에 tenant 경계가 전혀 없다.**

- `academies` 테이블 없음, 어떤 테이블에도 `academy_id` 컬럼 없음.
- 인증에 "어느 학원인가" 개념 자체가 없음: 관리자 역할은 전역 단일
  `ADMIN_PIN`(Vercel 환경변수) 하나, 학생은 이름+4자리 PIN으로
  `students.id`(UUID)에만 스코프됨(학원 스코프가 불가능 — 존재하지
  않으므로).
- `docs/audit/2026-07-24-performance-db.md`(SaaS 탐색 문서군보다 먼저
  작성됨)가 이미 grep으로 확인: "이 저장소/스키마에는 academy/tenant
  개념 자체가 없음".

준비도 판정: **0 / 시작 전.** 나쁜 뜻이 아니라 "단일 학원 제품으로서
완성도를 올려온 결과"다.

---

## 3. `academy_id` / `tenant` / `org_id` 사용 현황 — grep 실측

`src/`, `api/`, `supabase/`, 루트 `supabase_v*.sql` 전체 대상:

| 검색어 | 코드/SQL 매치 | 실제 위치 |
|---|---|---|
| `academy_id` | **0** | 전부 Markdown 설계/감사 문서(`docs/architecture/PAUL_EASY_VOCA_*.md`, `docs/future-ideas/PAUL_EASY_VOCA_*.md`, `docs/agent-decisions/0006-*`, `docs/audit/2026-07-26-*`, `handoff.md`) + 그 문서를 참조하는 `.ai-status/*.json` 1개 |
| `tenant` | **0** | 전부 Markdown 문서. 일부 감사 문서는 "코드에 이 개념이 없다"고 명시하려고 언급한 것 |
| `org_id` | **0** | 저장소 전체 어디에도 없음 |

**결론: tenant 개념은 설계 문서 산문(prose)에만 존재. 실제 스키마 0,
실제 쿼리 0, 실제 코드 0.**

---

## 4. 학생 데이터 격리(Student Data Isolation) — CODE-REALITY

모든 학생 데이터가 **단일 학원 전역**이다. 두 번째 tenant를 실수로라도
격리할 row-level 필터가 하나도 없다.

- 핵심 4테이블(`students`/`classes`/`units`/`words`)은 저장소에
  `CREATE TABLE` DDL 자체가 없다 — Supabase 대시보드에서 직접 생성됐고,
  이후 마이그레이션은 전부 방어적 `ALTER TABLE ... ADD COLUMN IF NOT
  EXISTS`뿐(`DATABASE.md`). 즉 `academy_id`를 붙일 **정본 DDL 파일조차
  없어**, 라이브 스키마 덤프가 선행돼야 한다.
- RLS 정책 패턴(모든 `supabase_*.sql`의 `enable row level security` /
  `create policy` grep):
  - **지배적 패턴은 `using (true)`** — RLS는 켜져 있으나 anon에 무조건
    허용. 이 패턴 테이블: `student_progress`, `student_daily_progress`,
    `daily_assignments`, `word_status`, `entrance_tests`,
    `spelling_review_queue`, `textbooks`, `class_textbooks`, `passages`,
    `passage_sentences`, `sentence_progress`, `product_events` 등.
  - "anon 읽기 전용 + service_role 쓰기" 소수 그룹: `xp_ledger`,
    `word_king_history`, `seasons`, (v3_11 SQL 실행 후)
    `classes`/`units`/`words`.
  - `students`만 유일하게 **컬럼 단위 GRANT/REVOKE**(`supabase_v1_9_
    security_rls.sql`) — 테이블 SELECT/UPDATE를 회수하고 컬럼별로 재부여,
    PIN 자격증명 4컬럼은 명시적으로 제외.
- **핵심: 이 정책들 중 어느 것도 컬럼으로 필터하지 않는다.**
  `using (true)`는 "모든 행, 조건 없음". 내일 `academy_id`를 추가해도
  기존 RLS는 전부 `using (academy_id = current_academy())` 형태로
  **전면 재작성**해야 하고, 이 앱은 Supabase Auth를 쓰지 않으므로
  그 조건을 걸 `auth.jwt()` 클레임이 없다(top-10 문서 item #3).

---

## 5. 관리자 권한 모델(Admin Permission Model) — CODE-REALITY

- **전역 단일 시크릿, 학원 개념 없음.** `api/_pinAuth.js`
  (`checkAdminReauth`)가 `req.body.adminPin`을 프로세스 전역
  `process.env.ADMIN_PIN` 문자열 하나와 비교. 올바른 PIN을 가진 요청은
  시스템의 **모든** 관리자 액션에 인가됨 — 관리자 identity도, 관리자
  테이블도, 스코프도 없음.
- `api/admin-pin-actions.js`(PIN 일괄 관리)와
  `supabase/functions/admin-content-write/index.ts`(커리큘럼 CRUD)
  둘 다 action 분기 전에 이 동일한 단일 PIN 검사를 통과시킴
  (`admin-content-write/index.ts:280-284`가 `Deno.env.get('ADMIN_PIN')`로
  동일 비교).
- `_pinAuth.js`에 약한 PIN 형식 경고(`isWeakAdminPinFormat`)가 있으나
  진단용 콘솔 경고일 뿐 요청을 막지 않음.
- **두 학원이 이 모델을 공유하면**: A 학원 관리자가 단일 `ADMIN_PIN`을
  알면 B 학원의 반/유닛/단어/학생 로스터 전체에 대한 read/write/delete +
  전 학원 학생 PIN 관리 액션(일괄 리셋/잠금해제 등)이 전부 가능. 이건
  "설정 실수한 멀티테넌트"가 아니라 **애초에 단일 테넌트 신뢰 모델**이다.

---

## 6. 향후 과금 구조(Billing) — DESIGN-DOC-PROPOSAL (미구현)

`docs/architecture/PAUL_EASY_VOCA_BILLING_ARCHITECTURE_DESIGN.md` /
`docs/future-ideas/PAUL_EASY_VOCA_BUSINESS_MODEL_PLAN.md` 요약. 두
문서 모두 상단에
"순수 설계 문서 — 코드/SQL/DB 변경 없음" 명시. **아래는 전부 제안이며
구현된 것이 하나도 없다.**

- **가격**: 학생당 월정액, 경쟁사(1hour.ai ≈ ₩5,000/학생/월) 벤치마크.
  3티어(Starter ≤50명 ₩5,000 / Professional ≤150명 ₩4,500 / Enterprise
  500+ 협의·물리 격리 옵션). 비즈니스 모델 문서는 별도로 4티어(Premium
  추가) 버전도 제안.
- **개념 스키마(미생성)**: `academies`(tenant root) → `subscriptions`
  (학원당 1:1) → `plans`(마스터 데이터/기능 플래그) → `invoices`
  (1:N append-only) → `payment_attempts`(1:N dunning trail).
- **트라이얼**: 30일 무료, 카드 불요, ≤20명 상한.
- **Dunning**: 3일 유예 → `past_due`(관리자 쓰기 제한, ~14일) →
  오프보딩. 학생 학습 화면은 과금 상태와 무관하게 **가장 마지막까지**
  제한하지 않도록 설계.
- **환불**: 최초 결제 7일 내 100%, 이후 무환불(서비스 장애 제외 pro-rated).
- **오프보딩**: 취소 → 기간 말까지 서비스 → `cancelled` → 90일 유예 →
  `academy_id` 필터 물리 삭제(사전 데이터 export 제공).
- **단계적 시작**: 초기엔 완전 수동 과금(계좌이체/수기 인보이스, `plans`/
  `subscriptions` 테이블 불요), 유료 파일럿 검증 성공 후에만 실제 결제
  게이트웨이 연동 스키마 구축 제안.
- 세 문서 및 `docs/future-ideas/PAUL_EASY_VOCA_CUSTOMER_VALIDATION_
  PLAN.md` 모두 동일 전제: **고객 검증(학원장 인터뷰) 선행**이 조건.

---

## 7. 멀티테넌트 리스크 / 블로커 — 실제 코드 기반, 의존성 순서

멀티테넌트 착수 전 반드시 풀어야 하는, 코드로 검증된 블로커(대략
의존성 순서). `docs/audit/2026-07-26-saas-multi-tenant-security-top10.md`
(그 자체도 분석 전용)와 정합적.

1. **`academy_id`가 어디에도 없고, 붙일 정본 DDL도 없다.** 핵심 4테이블은
   저장소에 `CREATE TABLE`이 없다(`DATABASE.md`). 라이브 스키마 덤프 →
   마이그레이션 순서 필요, DDL은 운영자 수동(규칙 8).
2. **모든 기존 쿼리가 전역 무필터.** `src/utils/wordLibrary.js`가
   `classes`/`units`/`students`를 스코프 술어 없이 `.select()` — 두
   학원을 한 Supabase 프로젝트에 합치면 모든 화면에서 즉시 섞임.
3. **RLS가 이진(binary)이지 tenant-aware가 아님.** 전부 `using (true)`
   (열림) 또는 anon 완전 차단(service-role 전용) — per-row 학원 식별자
   없음. Supabase Auth 미사용이라 `auth.jwt()` 클레임으로 필터할 근거도
   없음(top-10 item #3).
4. **전역 단일 `ADMIN_PIN`** (`api/_pinAuth.js`, `admin-pin-actions.js`,
   `admin-content-write/index.ts:280-284`) — 하나의 시크릿이 공유 배포의
   모든 학원 커리큘럼 쓰기 + 학생 PIN 관리를 통제. 스코프할 per-academy
   관리자 identity가 없음.
5. **학생 세션 토큰 없음.** `studentId` UUID를 아는 호출자는 그 학생
   명의로 점수/XP 제출 가능(top-10 item #4). 현재는 단일 학원 내부
   랭킹에 국한돼 Low지만, 여러 tenant의 UUID가 한 시스템을 공유하면
   blast radius가 cross-academy로 커짐.
6. **실질적 rate limit / 브루트포스 방어 없음** — 두 관리자 Edge
   Function에 고정 1.5초 지연뿐, Vercel 서버리스 병렬 요청엔 무력
   (top-10 item #6). 실제 방어는 외부 의존성(Redis/Vercel KV)이 필요해
   규칙 6(외부 의존성 최소화)과 충돌 — 상업화가 그 예외를 정당화할 때만.
7. **관리자 콘텐츠 쓰기 감사 로그 없음**(top-10 item #7) — 유료 고객
   다수 공유 전 분쟁 해결용으로 필요.
8. **tenant 오프보딩/삭제 절차 없음** — 현재 훅이 파괴적 SQL(DROP/
   TRUNCATE/무조건 DELETE)을 설계상 차단. 학원 스코프 삭제 경로는 그
   가드레일을 약화시키지 않고 별도 구축 필요(top-10 item #8).
9. **Vercel Hobby ToS 리스크** — Hobby는 비상업 용도 한정. 다수 학원
   유료 판매는 상업화와 **동시에** 플랜 업그레이드 필요(top-10 item #9).
10. **모니터링/알림 없음** — 한 학원 관리자 계정 브루트포스 같은
    이상징후를 tenant 넘어 탐지할 수단 없음(top-10 item #10).

---

## 8. 권고 (분석 결론 — 착수 지시 아님)

- **베타(단일 학원)에는 위 블로커가 무관하다.** 전부 "2번째 학원을
  붙일 때"의 문제이므로 베타 출시 판단에 영향 없음.
- 멀티테넌트는 "기존 앱에 academy_id 몇 개 추가"가 아니라 **인증
  모델(Supabase Auth 도입 or 학원별 관리자 테이블) + 전 쿼리 스코프 +
  전 RLS 재작성**이 얽힌 대형 전환이다. 반드시 고객 검증(지불 의사)
  확인 후 독립 프로젝트로.
- 착수 시 순서 권고: (a) 라이브 스키마 덤프로 정본 DDL 확보 →
  (b) `academies` + `academy_id` FK 도입(기존 데이터는 default 학원
  1개로 백필) → (c) 인증을 학원 스코프로 전환 → (d) 전 RLS를
  tenant-aware로 재작성 → (e) 그 다음에야 과금. (a)~(d) 전에 과금부터
  붙이는 건 격리 없는 상태에서 돈을 받는 것이라 금물.

_이 문서의 모든 항목은 분석이다. 어떤 것도 이 세션에서 구현하지 않았다._
