-- supabase_v3_2_product_events.sql (2026-07-23)
-- 익명 제품 이벤트(관찰 레이어) — "Paul Town의 어떤 부분이 아이를 자발적
-- 으로 돌아오게 하는가"를 답하기 위한 최소 수집.
--
-- 프라이버시 설계(운영자 규칙): 개인정보 0 — 이름/학생 id 원본을 저장하지
-- 않는다. anon_id는 sha256(student_id) 앞 16hex(클라이언트 계산, 단방향)
-- 로, students 테이블과 의도적으로 조인 불가(FK 없음). 이벤트는 하루/
-- 학생/이벤트당 1행(클라이언트 dedupe)이라 볼륨이 작다.
-- append-only: UPDATE/DELETE 정책 자체를 만들지 않는다.
--
-- 실행 전에는 클라이언트 trackEvent가 테이블 부재를 감지해 조용히 no-op
-- (규칙 9). 롤백: 아무것도 지울 필요 없음 — 수집만 멈추면 되는 고립 테이블.
create table if not exists product_events (
  id uuid primary key default gen_random_uuid(),
  anon_id text not null,          -- sha256(student_id) 앞 16hex — 역조인 불가
  event text not null,            -- productEvents.js EV 상수
  day date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_product_events_event_day on product_events(event, day);
create index if not exists idx_product_events_anon_day on product_events(anon_id, day);
alter table product_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'product_events' and policyname = 'anon insert product_events') then
    create policy "anon insert product_events" on product_events for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'product_events' and policyname = 'anon read product_events') then
    create policy "anon read product_events" on product_events for select using (true);
  end if;
end $$;
grant select, insert on product_events to anon, authenticated;

-- 검증: select event, count(*) from product_events group by event order by 2 desc;
