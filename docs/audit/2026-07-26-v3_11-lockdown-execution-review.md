# v3.11 커리큘럼 쓰기 락다운 — 실행 검토 리포트

_작성: 2026-07-26. `supabase_v3_11_lockdown_curriculum_write.sql`(2026-07-24
보안 감사 Critical 발견의 수정 SQL) 실행 여부를 운영자가 부재중(한국 복귀
후 실행 예정) 상태에서 검토한 문서. **이 세션에서는 코드/SQL/DB/배포를
전혀 변경하지 않았다** — 순수 분석 + 문서 작성만 수행. SQL 실행 자체는
아래 5번 체크리스트를 운영자가 직접 따라야 하는 별도 액션이다._

관련: `docs/audit/2026-07-24-security.md`(원 발견), `PAUL_EASY_VOCA_
CURRENT_STATUS.md`(E-1 항목), `PAUL_EASY_VOCA_MASTER_PLAN.md`(Week 1-2
로드맵 최우선 항목).

---

## 0. 요약

| 항목 | 상태 |
|---|---|
| 취약점 | `classes`/`units`/`words` 전체가 anon key(로그인/PIN 불필요)로 인증 없이 CRUD 가능 — 라이브 curl 실측 확인됨(2026-07-24) |
| 수정 코드 | 완료 — Edge Function `admin-content-write` + `wordLibrary.js` 8개 함수 adminPin 배선. **`git merge-base --is-ancestor`로 확인: 관련 커밋(`a4d66d9`/`caadea1`/`7234004`) 전부 `origin/main`에 존재** |
| 수정 SQL | 작성 완료(`supabase_v3_11_lockdown_curriculum_write.sql`), **미실행** |
| 이 SQL이 기존 데이터에 주는 영향 | **없음** — DML 구문이 SQL 안에 전혀 없음(아래 3번 상세) |
| 남은 것 | Edge Function 배포(`supabase functions deploy`) + Vercel 프로덕션 배포 확인 + SQL 실행, 이 순서 엄수 |

---

## 1. SQL 내용 분석

파일: `supabase_v3_11_lockdown_curriculum_write.sql` (총 83줄, 실행 구문은
마지막 11줄뿐 — 나머지는 전부 헤더 주석).

### 실행 구문 (전체, 3개 테이블 × 3줄 반복 패턴)

```sql
alter table classes enable row level security;
drop policy if exists "classes anon read only" on classes;
create policy "classes anon read only" on classes for select using (true);

alter table units enable row level security;
drop policy if exists "units anon read only" on units;
create policy "units anon read only" on units for select using (true);

alter table words enable row level security;
drop policy if exists "words anon read only" on words;
create policy "words anon read only" on words for select using (true);
```

### 각 줄이 하는 일

1. **`alter table X enable row level security;`** — 지금까지 이 3개
   테이블은 RLS 자체가 꺼져 있었다(`DATABASE.md` RLS 섹션에 이미 "이
   3테이블은 RLS/GRANT SQL이 저장소에 없음"으로 기록된 기술부채). RLS가
   꺼져 있으면 Postgres는 테이블 단위 GRANT만 보고 행 단위 제약을 전혀
   걸지 않는다 — anon 롤에 기본 부여된 테이블 권한이 그대로 전체
   CRUD로 이어진 것이 이번 취약점의 근본 원인. 이 줄이 RLS 자체를 켠다.
2. **`drop policy if exists ... ;`** — 멱등성 보장용. 이 정책 이름이
   이미 존재하면(예: 재실행/재시도) 지우고 다시 만든다. **`if exists`
   라 정책이 없어도 에러 없이 넘어간다.**
3. **`create policy ... for select using (true);`** — "SELECT만, 조건
   없이(`true`) 허용"하는 정책 하나를 추가한다. **`for select`만
   명시했다는 것이 핵심** — INSERT/UPDATE/DELETE에 대한 정책은 이 SQL
   어디에도 없다. RLS가 켜진 테이블에서 어떤 작업에 대해 정책이
   하나도 없으면 Postgres는 그 작업을 **기본적으로 전부 거부**한다(
   default-deny). 즉 이 SQL은 "쓰기를 막는 정책"을 직접 추가하는 게
   아니라, "읽기만 허용하는 정책 하나만 두고 나머지는 자동으로 막히게"
   하는 방식이다 — `xp_ledger`/`word_king_history`/`seasons`가 이미
   쓰고 있는 것과 동일한 기존 관례(SQL 헤더 주석에 명시, 신규 패턴
   아님).

### DDL/DML 포함 여부

- **DDL(구조 변경)**: `alter table ... enable row level security` 3회
  뿐 — 컬럼/테이블/제약조건 추가·삭제는 전혀 없음.
- **DML(데이터 변경)**: **0건.** `insert`/`update`/`delete`/`truncate`
  구문이 파일 전체에 단 하나도 없다.
- **위험 패턴 감지**: 이 저장소의 `checkDestructiveSql.mjs` 훅이 차단
  대상으로 삼는 DROP TABLE/TRUNCATE/무조건부 DELETE 계열 구문 — 전부
  없음. 실제로 이 SQL을 Write/Edit 했다면 그 훅을 통과했을 성격의
  내용(참고용 확인, 이번 세션에서 실제로 실행/재작성은 안 함).

### 멱등성

`drop policy if exists` + `create policy` 조합과 `enable row level
security`(이미 켜져 있어도 에러 없이 재실행 가능)로 전체가 멱등이다 —
여러 번 실행해도 동일한 최종 상태로 수렴한다(저장소의 다른 모든
`supabase_*.sql`과 동일한 설계 원칙).

---

## 2. 변경 전 / 변경 후 차이

| | **변경 전 (현재 라이브 상태)** | **변경 후 (SQL 실행 후)** |
|---|---|---|
| RLS 상태 | `classes`/`units`/`words` 전부 OFF | 전부 ON |
| **anon key로 SELECT** | 가능(전체 컬럼, 전체 행) | **동일하게 가능** — SELECT 정책이 `using (true)`라 조건 없이 전체 허용, 실질적 변화 없음 |
| **anon key로 INSERT/UPDATE/DELETE** | **가능** — 인증 없이 누구나 커리큘럼 생성/수정/삭제 가능(2026-07-24 curl 실측: 가짜 행 생성 성공, PATCH/DELETE는 대상 매칭 시 실제 작동 확인) | **불가능** — 정책이 없어 default-deny, 시도 시 RLS 위반(빈 결과 또는 권한 오류) |
| **service_role key로 CRUD(Edge Function 경유)** | 가능(원래 RLS가 없어서도 가능했음) | **여전히 가능** — service_role은 Postgres의 `BYPASSRLS` 속성을 가져 RLS 자체를 우회한다. `admin-content-write` Edge Function이 adminPin 검증 통과 후 이 키로 쓰기를 수행하므로, 배선이 끝난 관리자 화면은 이 SQL 실행과 무관하게 계속 정상 동작 |
| **학생 학습 화면(단어 조회)** | 정상 | **정상, 변경 없음** — 이 SQL이 막는 것은 쓰기뿐, 학생은 애초에 이 3테이블에 쓰기를 시도한 적이 없음(읽기 전용 소비자) |
| **관리자 화면(반/단어 생성·수정·삭제)** | 정상(단, 인증 없이 아무나 가능하다는 게 문제였음) | **아래 실행순서를 지켰다면 정상, 안 지켰다면 전부 "관리자 인증 실패"로 즉시 깨짐** — 3번(선행조건) 참고 |
| **외부 공격자(anon key만 보유)** | 커리큘럼 전체 파괴 가능 | 읽기만 가능, 쓰기는 전부 차단 |

**한 문장 요약**: 이 SQL은 "누가 읽을 수 있는가"는 전혀 바꾸지 않고,
"누가 쓸 수 있는가"만 "누구나"에서 "adminPin을 아는 관리자(서버 경유)만"
으로 좁힌다.

---

## 3. 기존 학생 데이터 영향 분석

### 결론: 기존 데이터에 대한 영향은 없음

- 이 SQL은 `classes`/`units`/`words` 3테이블에만 적용되고, `students`/
  `student_progress`/`word_status`/`daily_assignments` 등 학생 데이터가
  실제로 저장되는 테이블은 **단 하나도 건드리지 않는다.**
- DML이 없으므로(위 1번) 기존 행(반 이름, 유닛, 단어, 정답)이 삭제·수정·
  이동될 가능성 자체가 없다 — RLS/정책은 메타데이터(누가 접근 가능한가)
  이지 데이터 자체가 아니다.
- SELECT 정책이 `using (true)`(무조건 허용)이므로, 학생이 매일 쓰는
  단어 학습 화면의 조회 흐름은 이 SQL 실행 전후로 **완전히 동일하게
  동작한다.**

### 간접 영향 — "데이터"가 아니라 "쓰기 가능 여부"

기존 데이터의 내용은 안전하지만, **쓰기 경로가 준비되지 않은 상태로
이 SQL만 먼저 실행하면 관리자가 반/단어를 더 이상 추가·수정할 수 없게
된다** — 이것도 데이터가 손상되는 게 아니라 "새 쓰기가 거부된다"는
뜻이다(에러가 나고 아무 일도 안 일어남, 절반만 저장되는 등의 손상
시나리오는 없음 — Postgres RLS 거부는 원자적).

### QA 테스트 데이터에 대한 영향 (실제 학생 데이터 아님, 별도 발견사항)

이전 세션 검토에서 발견한 항목을 다시 확인차 기록한다: `scripts/
testMultiClass.mjs`/`testRenameClass.mjs`/`testClassDeleteCascade.mjs`
등 라이브 e2e 테스트 스크립트들은 `QA_` 접두 테스트 데이터를 만들 때
`createClass`/`setClassWords` 등을 **adminPin 없이** 호출한다(레거시
anon 경로 의존). 이 SQL 실행 후에는 이 스크립트들이 `42501` 류 오류로
**실패하기 시작한다** — 이것은 실제 학생 데이터에 대한 위험이 아니라
(QA_ 데이터는 애초에 테스트 전용, 프로덕션 학생과 무관) `npm run
verify:admin`/`verify:student` 결과가 이 SQL 실행 후 FAIL로 바뀌는
**예상된 부작용**이다. 회귀가 아니라 이 SQL의 직접적 귀결이므로,
실행 후 이 FAIL을 보고 당황하지 않도록 미리 기록해둔다.

---

## 4. Rollback 방법

이 SQL은 순수 추가(RLS enable + SELECT 정책 3개)라 롤백도 대칭적이다.

### 방법 A — 완전 원복 (권장, 이 SQL 실행 이전 상태로 정확히 복귀)

```sql
alter table classes disable row level security;
alter table units   disable row level security;
alter table words   disable row level security;
```

`disable row level security`는 정책을 삭제하지 않고 무력화만 한다.
정책이 남아있어도 RLS 자체가 꺼지면 전부 무의미해지므로, 이 3줄만으로
"RLS 없음 + anon 전체 CRUD 가능"이던 원래 상태로 정확히 되돌아간다.
멱등(여러 번 실행해도 안전).

### 방법 B — 정책만 제거 (비권장)

```sql
drop policy if exists "classes anon read only" on classes;
drop policy if exists "units anon read only" on units;
drop policy if exists "words anon read only" on words;
```

RLS는 켜진 채로 정책만 지우면 **SELECT까지 막혀** 학생 학습 화면 자체가
깨진다(default-deny가 읽기에도 적용됨) — 진단 목적이 아니면 쓰지 말 것.

### 롤백 시 반드시 인지할 것

**방법 A로 롤백하면 원 취약점(Critical, 무인증 전체 CRUD)이 다시
열린다.** 롤백은 "새 Edge Function 경로 자체에 예상 못한 장애가 생겨
관리자 업무가 급하게 막혔을 때"의 임시 조치로만 쓰고, 롤백 직후 원인을
조사해 재실행하는 것을 전제로 한다 — 롤백 상태로 방치하지 않는다.

### 롤백이 필요한 신호 (실행 직후 확인할 것)

- 관리자 화면에서 반/유닛/단어 저장 시도가 "관리자 인증 실패"로
  실패한다 → **먼저 5번 체크리스트의 1~4단계(Edge Function 배포/배포
  확인)가 실제로 끝났는지부터 재확인** — 대부분의 경우 롤백이 아니라
  누락된 선행조건을 마저 끝내는 것이 맞는 대응이다.
- 그래도 원인 불명으로 관리자 업무가 급히 막혀 있다면 방법 A 롤백 후
  침착하게 원인 조사.

---

## 5. 한국 복귀 후 안전한 실행 체크리스트

**이 순서를 반드시 지킬 것 — 뒤바뀌면 관리자의 반/유닛/단어 CRUD가
전부 "관리자 인증 실패"로 즉시 깨진다.** 각 단계는 이전 단계가 실제로
끝났다는 것을 확인한 뒤에만 다음으로 넘어간다.

### 1단계 — 시크릿 확인 (CLI)

```bash
supabase secrets list
```
- [ ] `ADMIN_PIN`이 목록에 있는가?
- [ ] `SUPABASE_URL`이 목록에 있는가?
- [ ] `SUPABASE_SERVICE_ROLE_KEY`가 목록에 있는가?
- 셋 중 하나라도 없으면: `supabase secrets set ADMIN_PIN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...`
  (이미 `grade-writing-answers` 함수가 쓰고 있는 값과 동일 — 새로 값을
  만들 필요 없이 기존 값 그대로 재사용하면 됨)

### 2단계 — Edge Function 배포 (CLI)

```bash
supabase functions deploy admin-content-write
```
- [ ] 배포 성공 메시지 확인
- [ ] `supabase functions list`에 `admin-content-write`가 `ACTIVE` 상태로 뜨는지 확인

### 3단계 — Vercel 프로덕션 배포 상태 확인

- [ ] Vercel 대시보드에서 최신 배포가 커밋 `7234004`(또는 그 이후,
      `main` HEAD) 기준인지 확인 — 이 저장소는 `git push`(main) →
      Vercel 자동 배포 구조이므로 보통 자동으로 최신이지만, 배포 실패/
      정체 이력이 있었던 저장소이므로(2026-07-20 Vercel 함수 12개 한도
      사고 선례) 반드시 눈으로 재확인

### 4단계 — 실제 배선 라이브 확인 (SQL 실행 전 최종 게이트)

- [ ] 프로덕션 관리자 화면에 로그인
- [ ] 아무 반의 유닛 이름 하나를 저장(수정) 시도
- [ ] **정상 저장되면** → 배포된 `AdminScreen.jsx`가 이미 `adminPin`을
      실어 보내고 있다는 뜻 → SQL 실행해도 안전
- [ ] 저장이 실패하거나 이상 동작하면 → **SQL을 실행하지 말고** 1~3단계로
      돌아가 무엇이 빠졌는지 재확인

### 5단계 — SQL 실행 (Supabase 대시보드 SQL Editor)

- [ ] Supabase 대시보드 → SQL Editor
- [ ] `supabase_v3_11_lockdown_curriculum_write.sql` 내용 그대로 붙여넣고 실행
- [ ] 에러 없이 완료됐는지 확인

### 6단계 — 실행 직후 검증 (2가지 모두 확인)

- [ ] **정상 동작 재확인**: 4단계와 동일하게 관리자 화면에서 유닛 이름
      저장을 다시 시도 → 여전히 정상 저장되는지 확인
- [ ] **취약점이 실제로 막혔는지 확인**: anon key로 `classes` 등에
      비인증 INSERT를 시도(예: 브라우저 개발자도구 콘솔에서 supabase-js
      anon 클라이언트로 `.insert()`, 또는 `curl`) → 이번엔 거부되는지
      확인(2026-07-24 감사에서 재현했던 것과 정확히 같은 시도를 반대
      결과로 재현)

### 7단계 — 알려진 부작용 확인 (놀라지 않기 위한 사전 인지)

- [ ] `npm run verify:admin` / `npm run verify:student` 실행 → 일부
      스크립트(`testMultiClass`/`testRenameClass`/`testClassDeleteCascade`
      등, 3번 항목 참고)가 FAIL로 나올 것 — **이것은 이번 SQL의 예상된
      직접 결과이지 신규 회귀가 아님**. 다음 세션/에이전트에게 이 문서를
      근거로 전달할 것.
- [ ] (선택, 후속 스프린트) 위 테스트 스크립트들이 `adminPin`을 전달하도록
      고치는 작업을 별도 구현 티켓으로 등록 — 이번 실행 자체를 막는
      선행조건은 아니므로 지금 당장 할 필요는 없음.

### 8단계 — 기록

- [ ] `handoff.md` 최상단에 실행 완료 세션 기록(실행 시각, 실행자,
      6단계 검증 결과, 7단계 확인된 부작용) — CLAUDE.md 문서 append 원칙
- [ ] `PROJECT_BOARD.md`의 관련 카드를 `DONE`으로 이동
- [ ] `.ai-status/`에 체크포인트 기록

---

## 관련 파일

`supabase_v3_11_lockdown_curriculum_write.sql`, `supabase/functions/
admin-content-write/index.ts`, `src/utils/wordLibrary.js`(13~75행,
502~770행 부근 — adminPin 배선 구간), `src/components/AdminScreen.jsx`,
`docs/audit/2026-07-24-security.md`, `scripts/testMultiClass.mjs`,
`scripts/testRenameClass.mjs`, `scripts/testClassDeleteCascade.mjs`.
