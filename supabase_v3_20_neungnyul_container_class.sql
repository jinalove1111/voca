-- supabase_v3_20_neungnyul_container_class.sql (2026-08-08)
-- 목적: 교과서 "고1 능률 민병천"(09c073dd-a136-4a66-8e39-44a392f236d8)의
-- 소유 컨테이너/콘텐츠(units)가 실반 "Presentation 6"
-- (1693f32b-af23-4364-8d66-d4dc5b20eaa6, 초등 반)에 잘못 얹혀 있는 상태를
-- 교정한다 — supabase_v3_18_class_renames.sql이 "고1 능률 민병천"이라는
-- 반 이름을 "Presentation 6"으로 개명하면서, 그 반이 원래 갖고 있던
-- 교과서 소유권/유닛까지 함께 "실반" 밑에 남아버린 잔재.
--
-- 운영자 확정 구조(2026-08-08): 다른 6개 교과서 컨테이너
-- (supabase_v3_19_class_type_textbook_containers.sql이 class_type='textbook'
-- 표시한 6개)와 동일하게, "고1 능률 민병천" 전용 컨테이너 반을 새로 만들어
-- 소유권/유닛을 그리로 이사시키고, class_textbooks 링크는 실반
-- "MS Advanced Class"(0249067d-dd64-465d-9c27-fb8737e9f4c4, 고1 6월 학평
-- 소유)에 새로 추가, "Presentation 6"에서는 제거한다.
--
-- 무접촉(변경하지 않는 것, 명시):
--   · student_class_assignments(SCA) — 학생 배정 8건은 textbook_id 기준
--     FK라 컨테이너 class_id 이동과 무관하게 그대로 유지(아래 검증 (e)).
--   · 학습 기록(user_progress 등) — 전부 word_id/student_id 기준, 이 SQL이
--     건드리는 어떤 테이블에도 FK로 얽혀있지 않음.
--   · units 행 2개(Unit1 e402499b… 40단어, 빈 "Unit 1" 8a34adf4… 0단어)는
--     UUID 그대로 유지 — 오직 class_id 컬럼값만 새 컨테이너로 이동(단어
--     행/단어 수는 전혀 건드리지 않음).
--   · Presentation 6 실반 자체(id/이름/학생 소속) — class_textbooks 링크
--     1행만 제거되고, 그 반의 재학생 4명은 student_class_assignments가
--     primary로 접근을 계속 제공하므로 학생 화면에 변화 없음.
--
-- 실행 주체(규칙 8): 이 파일은 DDL이 아니라 DML(INSERT/UPDATE/DELETE)이지만
-- 동일 원칙 적용 — classes/units/class_textbooks에 대한 anon 쓰기는 이미
-- supabase_v3_11_lockdown_curriculum_write.sql로 SELECT-only 락다운돼 있어
-- (RLS default-deny), 에이전트/CI/anon 클라이언트로는 애초에 실행 불가능.
-- Supabase 대시보드 SQL Editor에서 운영자가 postgres/service_role 권한으로
-- 수동 실행한다.
--
-- GRANT: 불필요. 신규 컬럼/신규 테이블이 전혀 없다(classes/textbooks/units/
-- class_textbooks 전부 기존 테이블, 기존 컬럼만 사용) — 규칙 10은 "새
-- 컬럼"에만 적용되므로 대상 없음.
--
-- 멱등성(규칙 9): 5개 스텝 전부 대상을 이미 처리된 상태와 구분하는 조건을
-- 동시에 건다 — ①은 이름 not exists, ②③은 "현재 소유/소속이 여전히 P6일
-- 때만"(이미 이사했으면 조건 불일치로 0행), ④는 각각 not exists(class_id,
-- textbook_id) 유니크 조건과 동일한 중복 검사, ⑤는 (class_id, textbook_id)
-- 2중 조건부 DELETE(이미 제거됐으면 대상 0행). 재실행해도 안전 — 두 번째
-- 실행부터는 전 스텝이 0행 처리로 끝난다.
--
-- 앱 무파손 근거(규칙 9, 배포 순서 무관):
--   · 실행 전(코드가 이 SQL보다 먼저 배포되는 경우): 클라이언트는 오늘과
--     동일하게 owner_class_id=P6, units.class_id=P6로 조회하므로 화면 변화
--     없음 — 이 SQL이 실행되기 전까지는 "현행 유지"일 뿐이다.
--   · 실행 후(이 SQL이 코드보다 먼저 실행되는 경우): 관리자 화면/학생 화면의
--     모든 조회는 textbook_id(UUID) 또는 student_class_assignments 행 기준
--     이지 class_id 문자열/컨테이너 위치에 의존하지 않으므로(규칙 4와 동일
--     원칙 — UUID FK 기준), class_id 이동은 자동으로 반영되고 코드 배포를
--     기다릴 필요가 없다. Presentation 6 재학생 4명의 학습 화면은
--     student_class_assignments가 여전히 그 학생들의 접근 경로를 제공하므로
--     변화 없음.

-- ── ① 전용 컨테이너 반 생성 (이미 있으면 no-op) ──
insert into public.classes (name, class_type)
select '고1 능률 민병천', 'textbook'
where not exists (select 1 from public.classes where name = '고1 능률 민병천');

-- ── ② 교과서 소유권 이전 (컨테이너가 정확히 1개일 때만, 현재 소유가 P6일 때만) ──
update public.textbooks
set owner_class_id = (
  select id from public.classes
  where name = '고1 능률 민병천' and class_type = 'textbook' limit 1
)
where id = '09c073dd-a136-4a66-8e39-44a392f236d8'
  and owner_class_id = '1693f32b-af23-4364-8d66-d4dc5b20eaa6'
  and (
    select count(*) from public.classes
    where name = '고1 능률 민병천' and class_type = 'textbook'
  ) = 1;

-- ── ③ 민병천 유닛 2행(Unit1 40단어 + 빈 Unit 1) 컨테이너로 이동 (조건 동일) ──
update public.units
set class_id = (
  select id from public.classes
  where name = '고1 능률 민병천' and class_type = 'textbook' limit 1
)
where textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
  and class_id = '1693f32b-af23-4364-8d66-d4dc5b20eaa6'
  and (
    select count(*) from public.classes
    where name = '고1 능률 민병천' and class_type = 'textbook'
  ) = 1;

-- ── ④ 링크: 컨테이너 자기링크 + MS Advanced 제공 (기존 6개 컨테이너 관례와 동일, 멱등) ──
insert into public.class_textbooks (class_id, textbook_id, sort_order)
select c.id, '09c073dd-a136-4a66-8e39-44a392f236d8', 0
from public.classes c
where c.name = '고1 능률 민병천' and c.class_type = 'textbook'
  and not exists (
    select 1 from public.class_textbooks
    where class_id = c.id and textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
  );

insert into public.class_textbooks (class_id, textbook_id, sort_order)
select '0249067d-dd64-465d-9c27-fb8737e9f4c4', '09c073dd-a136-4a66-8e39-44a392f236d8',
  coalesce((
    select max(sort_order) + 1 from public.class_textbooks
    where class_id = '0249067d-dd64-465d-9c27-fb8737e9f4c4'
  ), 0)
where not exists (
  select 1 from public.class_textbooks
  where class_id = '0249067d-dd64-465d-9c27-fb8737e9f4c4'
    and textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
);

-- ── ⑤ Presentation 6 링크 제거 (2중 조건부 단일행 DELETE — P6 학생 4명은
--      student_class_assignments primary로 접근 유지, 화면 영향 없음) ──
delete from public.class_textbooks
where class_id = '1693f32b-af23-4364-8d66-d4dc5b20eaa6'
  and textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8';

-- ── 실행 후 검증 SELECT ──
-- (a) 컨테이너 반 정확히 1개, class_type='textbook':
--   select id, name, class_type from public.classes where name = '고1 능률 민병천';
-- (b) 교과서 소유권이 컨테이너로 이전됨:
--   select id, owner_class_id from public.textbooks
--   where id = '09c073dd-a136-4a66-8e39-44a392f236d8';
--   -- 기대: owner_class_id = (a)의 id
-- (c) 유닛 2행이 컨테이너로 이동, 단어 수 불변(40 / 0):
--   select u.id, u.class_id, u.name, count(w.id) as word_count
--   from public.units u left join public.words w on w.unit_id = u.id
--   where u.textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
--   group by u.id, u.class_id, u.name;
--   -- 기대: 2행, class_id = (a)의 id, word_count 각각 40/0 (e402499b…/8a34adf4…)
-- (d) 링크 상태 — 컨테이너 자기링크 + MS Advanced 제공, P6는 부재:
--   select class_id, textbook_id, sort_order from public.class_textbooks
--   where textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8';
--   -- 기대: ((a)의 id, 09c073dd…, 0), (0249067d…, 09c073dd…, n) 2행만,
--   --       (1693f32b…, 09c073dd…) 행은 없어야 함
-- (e) SCA 8건 불변(학생 배정은 이 SQL이 건드리지 않음):
--   select count(*) from public.student_class_assignments
--   where textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8';
--   -- 기대: 8

-- ── 롤백(역방향, 전부 조건부 — 대상 상태가 이 SQL 실행 후일 때만 반영) ──
-- update public.textbooks set owner_class_id = '1693f32b-af23-4364-8d66-d4dc5b20eaa6'
--   where id = '09c073dd-a136-4a66-8e39-44a392f236d8'
--     and owner_class_id = (select id from public.classes where name = '고1 능률 민병천' and class_type = 'textbook');
--
-- update public.units set class_id = '1693f32b-af23-4364-8d66-d4dc5b20eaa6'
--   where textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
--     and class_id = (select id from public.classes where name = '고1 능률 민병천' and class_type = 'textbook');
--
-- insert into public.class_textbooks (class_id, textbook_id, sort_order)
--   select '1693f32b-af23-4364-8d66-d4dc5b20eaa6', '09c073dd-a136-4a66-8e39-44a392f236d8', 0
--   where not exists (
--     select 1 from public.class_textbooks
--     where class_id = '1693f32b-af23-4364-8d66-d4dc5b20eaa6' and textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
--   );
--
-- delete from public.class_textbooks
--   where class_id = '0249067d-dd64-465d-9c27-fb8737e9f4c4' and textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8';
-- delete from public.class_textbooks
--   where class_id = (select id from public.classes where name = '고1 능률 민병천' and class_type = 'textbook')
--     and textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8';
--
-- -- 컨테이너 반 자체는 롤백에서 지우지 않는다(빈 반 하나만 남는 무해한
-- -- 상태 — DROP/무조건부 DELETE 금지 원칙과 별개로, 컨테이너 삭제는 별도
-- -- 운영자 판단 필요 시에만 수동으로).
