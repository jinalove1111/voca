-- ============================================================================
-- supabase_v3_52_picture_review_DRAFT.sql
-- DRAFT — 미실행. 운영자 승인 전까지 운영 DB 반영 금지.
--
-- 목적: 교사의 그림 단어 승인/제외 결정을 그림 1장당 1행으로 영구 보관한다.
-- 설계 배경과 선택지 비교: docs/design/PICTURE_REVIEW_STORAGE_2026-10-13.md
-- (이 파일은 그 문서의 "준비해 둔 대안(B/하이브리드)"이다. 문서의 권장안은 파일
--  기반(A)이며, 운영자가 DB 기록을 원할 때만 이 파일을 승인한다.)
--
-- 만드는 것: 테이블 1개(public.picture_reviews), 인덱스 1개, RLS 켬, 권한 정리.
-- 추가 전용(additive)이고 멱등이다 — create ... if not exists 만 쓰므로 여러 번
-- 실행해도 안전하다. 기존 테이블은 건드리지 않는다.
-- 학생 데이터 없음: picture_id는 'pics2/anchor' 같은 그림(자산) id다. 학생 id,
-- 학생 이름, PIN 관련 컬럼은 하나도 없다(CLAUDE.md 규칙 4, 11). students 테이블을
-- 건드리지 않으므로 규칙 10(GRANT)의 대상이 아니다.
--
-- 실행 순서 안전성(규칙 9): 현재 어떤 앱 코드(src/, api/, supabase/functions)도
-- 이 테이블을 읽거나 쓰지 않는다. 코드보다 먼저 실행해도, 나중에 실행해도 앱은
-- 지금과 똑같이 동작한다. 나중에 쓰기 경로(admin-content-write의 새 액션)를 만들
-- 때는 테이블 부재 오류(42P01 / PGRST205)를 감지해 "아직 준비되지 않음"으로
-- 처리해야 한다.
--
-- 접근 권한: RLS를 켜고 정책을 만들지 않는다 + anon/authenticated 권한 전부 회수
-- (supabase_v3_51_phonics_progress_DRAFT.sql, v3_45 락다운과 같은 방식). 쓰기와
-- 읽기는 service_role(RLS 우회, 관리자 PIN을 서버에서 확인한 뒤의 서버 경로)만 한다.
-- 이 테이블에는 anon 읽기가 필요 없다 — 학생 화면의 노출 여부는 빌드 산출물
-- (src/data/pictureWords/pictureWords.json)이 결정하기 때문이다.
--
-- 실행 주체: 운영자만, Supabase 대시보드 SQL Editor에서 수동 실행(규칙 8).
-- 승인 시 파일 이름에서 _DRAFT를 떼고 검토 결과를 반영한다.
--
-- 되돌리기: 코드가 이 테이블을 쓰지 않게 하면 끝난다(테이블은 비어 있어도 무해).
-- 물리적 제거는 이 파일 범위가 아니며 운영자가 별도로 판단한다.
-- ============================================================================

begin;

create table if not exists public.picture_reviews (
  -- 그림 id (예: 'pics2/anchor'). 그림 1장당 현재 결정 1행.
  picture_id text primary key
    check (btrim(picture_id) <> '' and char_length(picture_id) <= 120),

  -- scripts/pictureWords/validateDecisions.mjs 의 ACTIONS 와 같은 값.
  -- 'exclude' = 화면에서 말하는 "제외(reject)".
  action text not null check (action in ('approve', 'exclude')),

  -- 교사가 고친 영어/한국어 표기(선택). validateDecisions.mjs 의 okText 규칙과 같다:
  -- 앞뒤 공백 없음, 1~40자.
  corrected_en text
    check (corrected_en is null or (corrected_en = btrim(corrected_en) and char_length(corrected_en) between 1 and 40)),
  corrected_ko text
    check (corrected_ko is null or (corrected_ko = btrim(corrected_ko) and char_length(corrected_ko) between 1 and 40)),

  -- 결정한 사람의 표시용 이름표(예: '원장'). 사람 계정이 아니며 학생이 아니다.
  reviewer_label text
    check (reviewer_label is null or char_length(reviewer_label) <= 40),
  note text
    check (note is null or char_length(note) <= 500),

  -- 결정이 바뀔 때마다 서버 경로가 1씩 올린다(어느 결정이 최신인지 확인용).
  revision integer not null default 1 check (revision >= 1),
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 최근 결정 순서로 훑어 보기 / 내보내기용.
create index if not exists picture_reviews_updated_idx on public.picture_reviews (updated_at desc);

-- RLS: 켜기만 하고 정책은 만들지 않는다(= anon/authenticated 전부 거부).
alter table public.picture_reviews enable row level security;

revoke all on public.picture_reviews from anon, authenticated;
-- 행 제거 권한은 주지 않는다: 결정을 바꾸려면 같은 행을 갱신한다(action을 바꾸거나
-- "보류"는 별도 값 없이 행을 그대로 둔다 — 문서 4절 참고).
grant select, insert, update on public.picture_reviews to service_role;

commit;

-- ── 검증 쿼리 (실행 후 운영자가 SQL Editor에서 확인; 아래는 주석이라 실행되지 않음) ──
-- select to_regclass('public.picture_reviews');                    -- 기대: picture_reviews (null이 아님)
-- select count(*) from public.picture_reviews;                     -- 기대: 0 (이 파일은 행을 넣지 않는다)
-- select relname, relrowsecurity from pg_class
--   where relname = 'picture_reviews';                             -- 기대: relrowsecurity = true
-- select policyname, cmd from pg_policies
--   where tablename = 'picture_reviews';                           -- 기대: 0행 (anon 정책 없음)
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'picture_reviews'
--   order by grantee, privilege_type;                              -- 기대: service_role의 select/insert/update만
-- select column_name, data_type from information_schema.columns
--   where table_name = 'picture_reviews' order by ordinal_position; -- 기대: 위 9개 컬럼, student 관련 컬럼 없음
-- ⚠️ anon 거부는 SQL Editor(postgres 역할)로 확인할 수 없다. scripts/testRlsSecurity.mjs 와
--   같은 방식으로 anon 키 클라이언트에서 이 테이블 조회/삽입이 42501(권한 없음)로 거절되는지 확인할 것.
