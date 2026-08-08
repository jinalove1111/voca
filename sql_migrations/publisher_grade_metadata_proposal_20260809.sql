-- sql_migrations/publisher_grade_metadata_proposal_20260809.sql
-- ============================================================================
-- ★ 실행 금지 — 제안(PROPOSAL) 문서. 운영자가 이름/매핑을 확정·수정한 뒤에만
--   Supabase SQL Editor에서 수동 실행 (2026-08-09 준비)
--
-- 목적: 예문 탭/본문 가져오기의 출판사→학년→교재 계단식 필터를 채우는
-- 마스터 데이터 입력. 74차 조사 결론(코드는 정상, publishers 1행뿐)의
-- 데이터 입력분을 SQL로 준비 — 구조 탭 UI로 입력해도 동일 결과(운영자 선택).
--
-- ⚠ 운영자 확정 필요 사항 2가지:
--   (A) 출판사 이름 표기 — 아래는 교재명에서 유추한 제안(동아/능률/YBM/천재).
--       기존 "천재 이상기" 행은 이름이 교재명이라 "천재"로 rename 제안
--       (§2 — updatePublisher와 동일 효과, FK 무영향).
--   (B) 학년(grades) 명명 관례 — 기존 행이 "풍양중 2"(학교 기반)라 아래
--       §3은 같은 관례의 제안만 담고 기본 주석 처리. 일반형("중2")을 원하면
--       운영자가 수정.
--
-- 안전성: INSERT는 on conflict do nothing(멱등), UPDATE는 id 명시 + 현재값
-- 가드. 학생/단어/유닛/예문 무접촉. 롤백: 각 절 하단 주석.
-- ============================================================================

-- ── §1 출판사 마스터(제안) — name UNIQUE, 멱등 ─────────────────────────────
insert into publishers (name) values ('동아'), ('능률'), ('YBM')
on conflict (name) do nothing;

-- ── §2 기존 "천재 이상기" 출판사 rename 제안(→ "천재") ─────────────────────
-- 현재값 가드: 이름이 정확히 '천재 이상기'일 때만 변경(재실행 멱등).
update publishers set name = '천재'
where id = 'a8899191-059b-4514-a759-ad68200e308b' and name = '천재 이상기';

-- ── §3 학년(grades) — 기본 주석 처리, 관례 확정 후 해제 ────────────────────
-- (학교 기반 관례 예 — 기존 "풍양중 2"와 동일 계열)
-- insert into grades (name, sort_order) values
--   ('풍양중 1', -1), ('풍양중 3', 1), ('고 1', 10)
-- on conflict (name) do nothing;

-- ── §4 교재 → 출판사 메타 부착(제안 매핑 — 교재명 유추 근거 주석) ──────────
-- 각 UPDATE는 id 명시 + publisher_id가 아직 null일 때만(이미 수동 입력했다면
-- 덮어쓰지 않음 — 멱등/비파괴).
update textbooks set publisher_id = (select id from publishers where name = '동아')
  where id = '01afd62a-e3bf-4ff0-8095-259de69f86ba' and publisher_id is null; -- 중2 동아 윤정미
update textbooks set publisher_id = (select id from publishers where name = '동아')
  where id = 'faf6dc71-c929-491e-beaa-b175d558b7e2' and publisher_id is null; -- 중1 동아 윤정미
update textbooks set publisher_id = (select id from publishers where name = '능률')
  where id = '86fdd554-9e8d-4a09-a894-5d05034d3f29' and publisher_id is null; -- 중2 능률 김기택
update textbooks set publisher_id = (select id from publishers where name = '능률')
  where id = '09c073dd-a136-4a66-8e39-44a392f236d8' and publisher_id is null; -- 고1 능률 민병천
update textbooks set publisher_id = (select id from publishers where name = 'YBM')
  where id = '59e0a0b7-c00c-4d48-a25e-4d159bb4ccf8' and publisher_id is null; -- 중2 YMB 박준원(교재명 오타 YMB=YBM 추정 — 운영자 확인)
-- 중2 천재 이상기(80e8d5dd-…)는 이미 publisher_id 연결됨(a8899191 → §2 rename 후 "천재") — 무접촉.
-- 고1 6월 학평(2106b090-…)/Presentation 6 -2026(26310f76-…)은 출판 교과서가
-- 아니라(모의고사/자체 교재) 출판사 매핑 없음 — 의도적으로 제외.

-- ── §5 교재 → 학년 메타(§3 확정 후 운영자가 채울 자리 — 기본 주석) ─────────
-- update textbooks set grade_id = (select id from grades where name = '...')
--   where id = '...' and grade_id is null;

-- 검증(SELECT 전용):
-- select t.name, p.name as publisher, g.name as grade
-- from textbooks t left join publishers p on p.id = t.publisher_id
--                  left join grades g on g.id = t.grade_id order by t.name;

-- 롤백:
--  §1: delete from publishers where name in ('동아','능률','YBM')
--      and id not in (select publisher_id from textbooks where publisher_id is not null);
--  §2: update publishers set name = '천재 이상기' where id = 'a8899191-...' and name = '천재';
--  §4: update textbooks set publisher_id = null where id in (위 5개 id);
--      (publishers.id FK는 on delete set null이라 §1 롤백만으로도 안전)
