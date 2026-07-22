-- supabase_v3_1_textbooks.sql (2026-07-22)
-- 도메인 모델 교정: 반(사람 그룹) → 교재(출판사/저자) → 유닛 → 단어.
--
-- 배경(운영자 교정 지시): 지금까지 교재 정체성이 반 이름에 박혀 있었다
-- ("중2 능률 김기택"/"중2 천재 이상기"는 사실 반이 아니라 교재). 학생은
-- 반 하나("중2 YMB 박준원")에 속한 채, 그 반에 연결된 여러 교재를 계정
-- 재등록/반 변경 없이 골라 학습해야 한다.
--
-- 설계 핵심(무파괴 — DROP 0개, 이 저장소 마이그레이션 규칙 그대로):
--   · 유닛을 보유한 기존 반 = 그 교재의 "소유 컨테이너"로 재해석한다.
--     교재(textbooks) 행이 그 컨테이너를 owner_class_id로 가리키고,
--     class_textbooks가 임의의 반↔교재를 연결한다(교재 재사용, 단어 중복 0).
--   · 학생별 교재 상태는 검증된 v2.9 테이블(student_class_assignments)을
--     그대로 재사용 — 행의 class_id는 "교재의 소유 컨테이너"라서 기존
--     unique(student_id, class_id)와 완전히 호환된다(제약 제거 불필요).
--     달라지는 것은 의미론 하나: 교재 전환이 students.class_id(사람 반)를
--     더 이상 바꾸지 않는다(클라이언트 코드에서 교정).
--   · 알려진 한계(정직 기록): 한 컨테이너 반이 직접 소유하는 교재는 1개다.
--     새 교재는 오늘처럼 새 컨테이너(반 생성+업로드)로 만들고 사람 반에
--     연결한다. 컨테이너 하나에 교재 여러 개를 직접 넣는 구조는 기존
--     unique 제약 제거(파괴적 DDL)가 필요해 의도적으로 보류 — 필요해지면
--     운영자 승인 하에 별도 마이그레이션으로 진행.
--
-- 전부 순수 추가(additive) + 멱등. 기존 행 삭제/변경 없음(컬럼 추가와
-- NULL 백필만). 실행 전에는 클라이언트가 테이블 부재를 감지해 "반 = 교재
-- 1개" 합성 폴백으로 오늘과 100% 동일 동작(CLAUDE.md 규칙 9).
--
-- 실측 근거(2026-07-22): 반 9개 중 유닛 보유 5개(QA 반 4개는 유닛 0 —
-- 교재 생성 안 함), 유닛 총 ~20개. 출판사 추론은 이름 패턴 매칭, 실패는
-- NULL + 하단 리뷰 쿼리 보고(추측 금지).
--
-- 롤백 노트: textbooks/class_textbooks는 신규 테이블(지워도 합성 폴백으로
-- 복귀, 기존 기능 무손실). units.textbook_id/student_class_assignments.
-- textbook_id는 NULL로 되돌리면 끝(클라이언트는 NULL을 "반의 자동 교재"로
-- 해석).

-- ── 1) textbooks ──
create table if not exists textbooks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,               -- 표시명(백필은 반 이름 그대로 — 이후 관리자 정리)
  publisher_name text,                     -- 추론 성공 시만(실패 NULL + 리뷰 보고)
  owner_class_id uuid references classes(id) on delete set null, -- 유닛 실소유 컨테이너
  created_at timestamptz not null default now()
);
create index if not exists idx_textbooks_owner_class on textbooks(owner_class_id);
alter table textbooks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'textbooks' and policyname = 'allow anon all textbooks') then
    create policy "allow anon all textbooks" on textbooks for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on textbooks to anon, authenticated;

-- ── 2) class_textbooks — 반↔교재 다대다(교재 재사용, 단어 중복 없음) ──
create table if not exists class_textbooks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  textbook_id uuid not null references textbooks(id) on delete cascade,
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (class_id, textbook_id)
);
create index if not exists idx_class_textbooks_class on class_textbooks(class_id);
create index if not exists idx_class_textbooks_textbook on class_textbooks(textbook_id);
alter table class_textbooks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'class_textbooks' and policyname = 'allow anon all class_textbooks') then
    create policy "allow anon all class_textbooks" on class_textbooks for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on class_textbooks to anon, authenticated;

-- ── 3) units.textbook_id — 유닛의 소속 교재(NULL = 반의 자동 교재로 해석) ──
alter table units add column if not exists textbook_id uuid references textbooks(id) on delete set null;
create index if not exists idx_units_textbook on units(textbook_id);

-- ── 4) student_class_assignments.textbook_id — 상태 행의 교재 축 명시 ──
alter table student_class_assignments add column if not exists textbook_id uuid references textbooks(id) on delete cascade;
create index if not exists idx_sca_textbook on student_class_assignments(textbook_id);
create unique index if not exists uq_sca_student_textbook
  on student_class_assignments(student_id, textbook_id) where textbook_id is not null;

-- ── 5) 백필 — 유닛 보유 반마다 자동 교재 1개(반 이름 그대로) + 자기 연결 ──
insert into textbooks (name, publisher_name, owner_class_id)
select c.name,
  case
    when c.name like '%능률%' then '능률'
    when c.name like '%천재%' then '천재'
    when c.name like '%YBM%' or c.name like '%YMB%' then 'YBM'
    when c.name like '%미래엔%' then '미래엔'
    when c.name like '%동아%' then '동아'
    when c.name like '%비상%' then '비상'
    else null
  end,
  c.id
from classes c
where exists (select 1 from units u where u.class_id = c.id)
on conflict (name) do nothing;

insert into class_textbooks (class_id, textbook_id, sort_order)
select t.owner_class_id, t.id, 0
from textbooks t
where t.owner_class_id is not null
on conflict (class_id, textbook_id) do nothing;

update units u
set textbook_id = t.id
from textbooks t
where t.owner_class_id = u.class_id and u.textbook_id is null;

update student_class_assignments a
set textbook_id = t.id
from textbooks t
where t.owner_class_id = a.class_id and a.textbook_id is null;

-- ── 실행 후 검증/리뷰 쿼리 ──
-- (a) 자동 생성 교재 + 출판사 추론(NULL = 수동 분류 필요 리뷰 대상):
--   select name, publisher_name from textbooks order by name;
-- (b) 미백필 유닛 0건이어야:
--   select count(*) from units where textbook_id is null;
-- (c) 미백필 배정 행 0건이어야:
--   select count(*) from student_class_assignments where textbook_id is null;
-- (d) "송" 시나리오 활성화(관리자 UI 또는 아래 예시 — 반에 교재 연결):
--   insert into class_textbooks (class_id, textbook_id, sort_order)
--   select c.id, t.id, 1 from classes c, textbooks t
--   where c.name = '중2 YMB 박준원' and t.name = '중2 능률 김기택'
--   on conflict (class_id, textbook_id) do nothing;
--   -- (천재 이상기도 동일하게 sort_order 2로)
