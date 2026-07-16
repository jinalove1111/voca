-- ============================================================================
-- supabase_v1_9_security_rls.sql — students PIN 컬럼 클라이언트(anon) 차단
-- 2026-07-16 P7 코드 감사 후속. Supabase SQL Editor에서 1회 실행(멱등 —
-- 여러 번 실행해도 안전).
--
-- ── 무엇을 막나 ─────────────────────────────────────────────────────────
-- 지금까지는 앱의 anon key(브라우저 번들에 포함, 누구나 추출 가능)로
-- students 테이블의 모든 컬럼을 직접 SELECT/UPDATE할 수 있었다:
--   * SELECT pin_hash → 4자리 PIN이라 해시를 손에 넣으면 오프라인
--     브루트포스로 수초 내 원문 복원 → 임의 학생으로 로그인 가능.
--   * UPDATE pin_hash → 자기가 아는 PIN의 해시로 덮어써서 계정 탈취.
--   * UPDATE pin_fail_count/pin_locked_until → 5회 잠금(브루트포스 방어) 무력화.
--   * UPDATE pin_setup_allowed → 자기설정 창구를 스스로 열어 PIN 가로채기.
-- 이 SQL 실행 후에는 anon/authenticated 역할이 위 4개 컬럼을 SELECT/UPDATE
-- 할 수 없다(권한 오류 42501). PIN 관련 조작은 전부 서버리스 함수
-- (api/*.js — Vercel에 SUPABASE_SERVICE_ROLE_KEY 설정 확인 완료, service_role
-- 은 이 SQL의 영향을 받지 않음)만 가능해진다.
--
-- ── 왜 RLS(행 단위 정책)가 아니라 "컬럼 권한"인가 ───────────────────────
-- 이 앱은 Supabase Auth를 쓰지 않는다 — 학생/관리자/모두가 같은 anon key로
-- 접속하므로 행 단위 정책으로는 "누구인지"를 구분할 방법이 없다. RLS를
-- 켜면 로그인 화면의 학생 목록 로딩(refreshStudents), 학생 자기등록
-- (addStudent), 관리자 반/유닛 변경까지 전부 즉사한다. 진짜 위협은
-- "PIN 자격증명 4개 컬럼"이므로, 딱 그 컬럼만 Postgres 컬럼 단위 권한으로
-- 잘라내는 것이 앱을 안 깨뜨리는 가장 보수적인 설계다.
--
-- ── 클라이언트 전수 조사 결과 (2026-07-16, src/ 전체 grep) ──────────────
-- anon key가 students에 하는 작업은 wordLibrary.js의 6곳이 전부:
--   SELECT: id,name,class_id,unit_name,classes(name) + ORDER BY created_at
--           (refreshStudents — 로그인 화면 학생 목록/전 화면 로스터 캐시)
--   INSERT: name,class_id,unit_name RETURNING id (addStudent — 학생 자기등록)
--   UPDATE: class_id / unit_name / (class_id,unit_name) (반·유닛 변경, 일괄 이동)
--   DELETE: id 기준 (removeStudent — 관리자 학생 삭제)
-- → 아래 GRANT는 이 전부를 그대로 허용한다. PIN 4컬럼은 어떤 클라이언트
--   코드도 읽거나 쓰지 않는다(P7 감사에서 bare .select() 2곳도 이미 제거됨).
--
-- ── 실행 전/후 클라이언트 동작 ──────────────────────────────────────────
-- 실행 전(현재): 모든 기능 정상 + PIN 컬럼 노출(취약).
-- 실행 후:
--   * 로그인 화면 학생 목록, 학생 등록, PIN 로그인, PIN 만들기, 진행도
--     동기화, 관리자 화면 전체 — 전부 그대로 동작(위 전수 조사 컬럼만 사용).
--   * anon으로 students의 pin_hash 등 4컬럼 SELECT/UPDATE → 42501 거부.
--   * anon으로 students에 select=* (bare select) → 42501 거부. 앱 코드에는
--     그런 호출이 없다. QA 스크립트들은 select('id') 명시로 이미 정비 완료.
--   * 서버리스 함수(api/*.js)는 service_role 키 사용(Vercel 프로덕션 확인
--     완료) — 영향 없음. 단, 로컬에서 서버리스 핸들러를 직접 돌리는 QA
--     스크립트는 anon 폴백(_pinAuth.js)이라 pin 컬럼 접근이 거부된다 —
--     testClearStudentPin.mjs는 그 경우 student-pin-status 부울로 자동
--     대체하게 이미 수정돼 있고, 나머지는 scripts/testRlsSecurity.mjs로 검증.
--
-- ── 배포 순서 안전성 ────────────────────────────────────────────────────
-- 코드(61ab5c8/e1e47da)가 먼저 배포되든 이 SQL이 먼저 실행되든 안전:
-- 코드 변경은 students 접근 방식을 바꾸지 않았고, 이 SQL은 클라이언트가
-- 원래 안 쓰는 컬럼만 차단하기 때문. 순서 제약 없음.
--
-- ── 주의: 이후 마이그레이션에서 students에 새 컬럼을 추가하면 ───────────
-- 테이블 단위 SELECT가 회수된 상태라, 클라이언트가 읽어야 하는 새 컬럼은
-- 반드시 `grant select (새컬럼) on public.students to anon, authenticated;`
-- 를 함께 실행해야 한다(안 하면 그 컬럼만 못 읽음 — fail-closed).
--
-- ── 롤백(원상 복구) ─────────────────────────────────────────────────────
--   grant select, update on table public.students to anon, authenticated;
--   notify pgrst, 'reload schema';
-- (테이블 단위 재부여로 v1_9 이전과 동일해진다. 아래에서 추가한 컬럼 단위
--  grant는 상위 권한에 흡수되므로 그대로 둬도 무해.)
-- ============================================================================

do $$
declare
  allowed_cols text;
begin
  -- PIN 자격증명 4컬럼을 제외한 "현재 존재하는 모든 컬럼" 목록을 동적으로
  -- 구성한다 — 이 파일이 실제 라이브 스키마와 어긋날 수 없게(컬럼을 하나
  -- 빼먹어서 SELECT가 깨지는 사고 방지).
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into allowed_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'students'
    and column_name not in ('pin_hash', 'pin_fail_count', 'pin_locked_until', 'pin_setup_allowed');

  if allowed_cols is null then
    raise exception 'students 테이블을 찾을 수 없습니다 — 지금 SQL Editor에서 보고 있는 프로젝트가 이 앱이 실제로 쓰는 Supabase 프로젝트가 맞는지 먼저 확인해주세요.';
  end if;

  -- 1) 테이블 단위 SELECT/UPDATE 회수 (INSERT/DELETE는 유지 — 학생 자기등록
  --    과 관리자 삭제가 anon 경유. INSERT로 pin_hash 값을 넣는 것은 "자기가
  --    만드는 새 row"에만 영향이라 기존 학생 계정 탈취와 무관).
  execute 'revoke select, update on table public.students from anon, authenticated';

  -- 2) 컬럼 단위로 다시 부여 — PIN 4컬럼만 빠진 전체 컬럼 SELECT.
  execute format('grant select (%s) on table public.students to anon, authenticated', allowed_cols);

  -- 3) UPDATE는 클라이언트가 실제로 쓰는 2컬럼만(반/유닛 변경, 일괄 이동).
  execute 'grant update (class_id, unit_name) on table public.students to anon, authenticated';

  raise notice 'v1_9 적용 완료 — anon/authenticated의 students SELECT 허용 컬럼: %', allowed_cols;
end $$;

-- PostgREST(Supabase REST 레이어)에 스키마/권한 캐시 갱신을 알린다 —
-- 이거 없이도 수 분 내 자동 반영되지만, 즉시 반영을 보장.
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 직후 이 자리에서 바로 확인(선택): 아래 두 줄의 결과가
--   ① permission denied (42501) ② 정상 행 반환
-- 이면 성공. (SQL Editor는 기본적으로 postgres 권한이므로 set role로 anon을
-- 흉내낸다. 실행 후 반드시 reset role까지 함께 실행할 것.)
--
--   set role anon; select pin_hash from public.students limit 1;  -- ① 거부돼야 함
--   reset role;
--   set role anon; select id, name, class_id, unit_name, created_at from public.students limit 1;  -- ② 성공해야 함
--   reset role;
--
-- 전체 검증은 로컬에서: node scripts/testRlsSecurity.mjs
-- ============================================================================
