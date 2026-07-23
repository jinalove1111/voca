# Decision 0005 — 시즌 / 쓰기검수(writing-review) 작업 안전 체크포인트 & 롤백 노트

**작성일**: 2026-07-23
**상태**: 작업 시작 전 체크포인트 기록 (Task 1/Task 2 진행 중 갱신)

## 시작 커밋 (rollback 기준점)

- **시작 SHA**: `6f5d6bd8226d9c5b5443749125d067e2a46fa215`
- local HEAD = origin/main 완전 일치, 추적 파일 무변경 상태에서 시작.
- 직전 마일스톤(제품 리뷰 S티어 수정 + 릴리스 게이트)은 `b8afc07`(코드) +
  `6f5d6bd`(문서)로 이미 커밋·push·배포 검증 완료(프로덕션 번들 SHA-256
  일치 실측, handoff.md 2026-07-23 (5차) 섹션).
- **전체 롤백 방법**: `git revert <작업 커밋들>` (이력 보존) 또는 긴급 시
  Vercel 대시보드에서 6f5d6bd 시점 배포로 인스턴트 롤백. `git reset --hard`
  는 협업 이력 파괴라 금지.

## 시작 시점의 미추적 파일 (이 작업과 무관 — 절대 커밋/삭제 금지)

- `docs/research/` 연구 문서 7건 (운영자 결정: 미커밋 유지)
- `.ai-status/researcher-*.json` 7건, `analyst-*.json`, `implementer-polish-sweep.json`
  (각 소유 에이전트 몫, 헌법 규칙 16)

## 신규 마이그레이션 (생성 시 여기에 추가)

- **`supabase_v3_5_season_lifecycle.sql`** (Task 1, 2026-07-23) — seasons
  테이블에 season_number/ended_at/is_active 컬럼 추가 + 활성 시즌 유일성
  partial unique index + 원자적 `start_new_season(p_note)` RPC(advisory
  lock, SECURITY DEFINER, anon/authenticated EXECUTE 회수, service_role만
  허용). 멱등(add column if not exists / create index if not exists /
  create or replace / 조건부 백필). 파괴적 구문 없음(DROP/TRUNCATE/DELETE
  0건, UPDATE는 seasons 메타데이터 정합화만). 신규 GRANT 불필요(v2_8의
  테이블 단위 SELECT가 새 컬럼에 자동 적용).
  **실행 상태: 운영자 수동 실행 대기** — 실행 전에도 코드가 v2_8 동작으로
  안전 폴백(규칙 9 실측 검증됨). 롤백: 이 SQL은 실행 후에도 기존 데이터를
  변경하지 않으므로(프로덕션 seasons 0행) 코드 커밋 revert만으로 충분.

- **`supabase_v3_6_writing_review_ai_cache.sql`** (Task 2, 2026-07-23) —
  신규 `spelling_ai_grading_cache` 테이블(AI 판정 캐시, words FK cascade).
  멱등(create table/index if not exists, drop policy if exists는 정책 재생성
  관례 — 데이터 파괴 아님). RLS: anon SELECT만, 쓰기는 service_role(Edge
  Function) 전용. **실행 상태: 운영자 수동 실행 대기** — 미실행 시에도
  Edge Function이 캐시 없이 동작하고, 클라이언트 기존 워크플로우는 이
  테이블과 완전 무관(안전 폴백 실측 검증).
- **Supabase Edge Function `grade-writing-answers`** (Task 2) — 코드만
  저장소에 존재(supabase/functions/). **배포는 운영자 수동**:
  `supabase functions deploy grade-writing-answers` + 시크릿
  `supabase secrets set ANTHROPIC_API_KEY=... ADMIN_PIN=...`.
  배포 전에는 feature flag OFF라 버튼 자체가 안 보임.

## 사용 Feature Flag (사용 시 여기에 추가)

- Task 1: 사용 안 함 — 기존 SeasonPanel 개선이라 별도 플래그 없음(SQL
  미실행 시 자동 레거시 폴백이 사실상의 게이트).
- Task 2: **`writingReviewAiAssist` (src/config/features.js, 기본 OFF) 확정**
  — SpellingReviewQueuePanel의 AI 미리보기 버튼 게이트. preview-only,
  자동 거부 없음, 실제 인정/무시는 기존 수동 버튼만 수행.

## 파일 소유권 (헌법 규칙 16 — 동시 쓰기 금지 경계)

**Task 1 (시즌) 예상 소유** — 확정 시 갱신:
- `src/utils/seasonApi.js`, `api/start-new-season.js`
- `src/utils/ticketEconomy.js` / `src/utils/houseSystem.js` (시즌 경계 계산부)
- `src/components/AdminScreen.jsx` 시즌 패널 부분
- `scripts/testSeasonal*.mjs` (신규 dry-run 검증 스크립트 포함)
- `.ai-status/implementer-season-*.json`

**Task 2 (쓰기 검수) 예상 소유** — Task 1 완료·보고 후에만 시작:
- `src/utils/spellingReviewApi.js`
- `src/components/AdminScreen.jsx` 검수 섹션 (**Task 1과 공유 파일 —
  순차 실행 강제 이유**)
- 신규 admin 컴포넌트(생성 시 기록), 관련 마이그레이션 SQL(설계만)
- `.ai-status/implementer-writing-review-*.json`
- ⚠️ 신규 `api/*.js` 파일 생성 **불가** — Vercel Hobby 함수 12/12 한도
  여유 0 (handoff.md 5차 경고). 서버 로직이 필요하면 기존 함수 action
  dispatch로 통합.

## Task 안전 제약 (운영자 지시 원문 요지)

- Task 1: 실제 시즌 리셋 트리거 금지 — dry-run/트랜잭션 롤백/mock/격리
  테스트 데이터만. 누적 학생 데이터 보존을 before/after 단언으로 검증.
- Task 2: preview-only로 시작. 기존 프로덕션 답안(약 99건) 자동
  수락/거부 금지 — AI 판단은 관리자가 확인할 때까지 "제안(proposal)"으로만
  저장. v1에서 자동 거부(automatic reject)는 비활성 유지. 기존 수동
  인정/무시 워크플로우는 폴백으로 보존.
- 완료 선언 조건: git diff 리뷰 + 회귀(verify) PASS + build PASS +
  마이그레이션/환경변수 명시 보고 + 롤백 절차 문서화(이 파일 갱신).
