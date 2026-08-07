-- supabase_v3_21_hakpyeong_container_class.sql (2026-08-08)
-- 목적: 교과서 "고1 6월 학평"(2106b090-cf02-4f47-86e8-880ae4c681f3)의 소유
-- 컨테이너/콘텐츠(units)가 실반 "MS Advanced Class"
-- (0249067d-dd64-465d-9c27-fb8737e9f4c4)에 직접 얹혀 있는 상태를 교정한다.
-- 교과서 라이브러리 정규화(운영자 확정 2026-08-08 — 반↔교과서 다대다,
-- 교과서는 반에 영구 소속되지 않음)의 마지막 예외 케이스로, 이 교과서
-- 소속 유닛 8개(Unit 1/2/3/5, Unit6/7/9/10 — 단어 수 26/26/26/50/50/50/
-- 50/50, 합계 328)가 전부 MS Advanced Class 밑에 있다.
--
-- v3_20(고1 능률 민병천 / Presentation 6)과 동일 패턴: "고1 6월 학평" 전용
-- 컨테이너 반(class_type='textbook')을 새로 만들어 소유권/유닛을 그리로
-- 이사시킨다. 단, v3_20과 달리 이 마이그레이션에는 "⑤ 실반 링크 제거"
-- 스텝이 없다 — MS Advanced Class는 이 교과서를 계속 실제로 사용 중이므로
-- class_textbooks의 (MS Advanced, 이 교과서) 링크는 이미 존재하는 정상
-- 링크이고, 새로 만들지도 제거하지도 않는다(아래 스텝 ④ 주석 참고).
--
-- 무접촉(변경하지 않는 것, 명시):
--   · student_class_assignments(SCA) — 실측 완료(재조사 불필요): MS
--     Advanced 실계정 138명 전원 primary SCA에 이 textbook_id가 명시돼
--     있어, 반 소유 폴백(getOwnTextbookOfClass)에 의존하는 학생이 0명이다.
--     소유권 이전으로 학생 화면에 영향 없음.
--   · class_textbooks의 (MS Advanced Class, 이 교과서) 링크 — 이미 존재하며
--     제거 대상이 아니다(MS Advanced가 이 책을 계속 사용).
--   · 학습 기록(user_progress 등) — 전부 word_id/student_id 기준, 이 SQL이
--     건드리는 어떤 테이블에도 FK로 얽혀있지 않음.
--   · units 8행의 UUID/단어 행 — 오직 class_id 컬럼값만 새 컨테이너로
--     이동(단어 행/단어 수는 전혀 건드리지 않음).
--   · MS Advanced Class 실반 자체(id/이름/학생 소속) — 전혀 건드리지 않음.
--
-- 실행 주체(규칙 8): DDL이 아니라 DML(INSERT/UPDATE)이지만 동일 원칙
-- 적용 — classes/units/class_textbooks에 대한 anon 쓰기는 이미
-- supabase_v3_11_lockdown_curriculum_write.sql로 SELECT-only 락다운돼 있어
-- (RLS default-deny), 에이전트/CI/anon 클라이언트로는 애초에 실행 불가능.
-- Supabase 대시보드 SQL Editor에서 운영자가 postgres/service_role 권한으로
-- 수동 실행한다.
--
-- GRANT: 불필요. 신규 컬럼/신규 테이블이 전혀 없다(classes/textbooks/units/
-- class_textbooks 전부 기존 테이블, 기존 컬럼만 사용) — 규칙 10은 "새
-- 컬럼"에만 적용되므로 대상 없음.
--
-- 멱등성(규칙 9): 3개 스텝 전부 대상을 이미 처리된 상태와 구분하는 조건을
-- 동시에 건다 — ①은 이름 not exists, ②③은 "현재 소유/소속이 여전히 MS
-- Advanced Class일 때만"(이미 이사했으면 조건 불일치로 0행) + 컨테이너
-- count=1 가드, ④는 not exists(class_id, textbook_id) 유니크 조건과
-- 동일한 중복 검사. 스키마/테이블/컬럼을 지우는 구문, 테이블 전체를
-- 한 번에 비우는 구문, WHERE 절 없는 무조건부 행 삭제는 이 파일 어디에도
-- 없다 — 재실행해도 안전하며, 두 번째 실행부터는 전 스텝이 0행 처리로
-- 끝난다.
--
-- 앱 무파손 근거(규칙 9, 배포 순서 무관):
--   · 실행 전(코드가 이 SQL보다 먼저 배포되는 경우): 클라이언트는 오늘과
--     동일하게 owner_class_id=MS Advanced, units.class_id=MS Advanced로
--     조회하므로 화면 변화 없음 — 이 SQL이 실행되기 전까지는 "현행 유지".
--   · 실행 후(이 SQL이 코드보다 먼저 실행되는 경우): 관리자 화면/학생 화면의
--     모든 조회는 textbook_id(UUID) 또는 student_class_assignments 행 기준
--     이지 class_id 문자열/컨테이너 위치에 의존하지 않으므로(규칙 4와 동일
--     원칙 — UUID FK 기준), class_id 이동은 자동으로 반영된다. MS Advanced
--     Class 재학생 138명은 student_class_assignments의 primary
--     textbook_id로 이미 접근하고 있어(반 소유 폴백 미사용) 학습 화면에
--     변화 없음.

-- ── ① 전용 컨테이너 반 생성 (이미 있으면 no-op) ──
insert into public.classes (name, class_type)
select '고1 6월 학평', 'textbook'
where not exists (select 1 from public.classes where name = '고1 6월 학평');

-- ── ② 교과서 소유권 이전 (컨테이너가 정확히 1개일 때만, 현재 소유가 MS Advanced일 때만) ──
update public.textbooks
set owner_class_id = (
  select id from public.classes
  where name = '고1 6월 학평' and class_type = 'textbook' limit 1
)
where id = '2106b090-cf02-4f47-86e8-880ae4c681f3'
  and owner_class_id = '0249067d-dd64-465d-9c27-fb8737e9f4c4'
  and (
    select count(*) from public.classes
    where name = '고1 6월 학평' and class_type = 'textbook'
  ) = 1;

-- ── ③ 학평 유닛 8행(Unit 1/2/3/5, Unit6/7/9/10) 컨테이너로 이동 (조건 동일) ──
update public.units
set class_id = (
  select id from public.classes
  where name = '고1 6월 학평' and class_type = 'textbook' limit 1
)
where textbook_id = '2106b090-cf02-4f47-86e8-880ae4c681f3'
  and class_id = '0249067d-dd64-465d-9c27-fb8737e9f4c4'
  and (
    select count(*) from public.classes
    where name = '고1 6월 학평' and class_type = 'textbook'
  ) = 1;

-- ── ④ 링크: 컨테이너 자기링크만 추가 (기존 6개 컨테이너 관례와 동일, 멱등).
--      MS Advanced Class ↔ 이 교과서 링크는 이미 존재하며 MS Advanced가
--      계속 이 책을 사용하므로 새로 만들지도, 제거하지도 않는다. ──
insert into public.class_textbooks (class_id, textbook_id, sort_order)
select c.id, '2106b090-cf02-4f47-86e8-880ae4c681f3', 0
from public.classes c
where c.name = '고1 6월 학평' and c.class_type = 'textbook'
  and not exists (
    select 1 from public.class_textbooks
    where class_id = c.id and textbook_id = '2106b090-cf02-4f47-86e8-880ae4c681f3'
  );

-- ── ⑤ 없음 — v3_20의 ⑤(잘못된 링크 제거)에 해당하는 스텝이 이 마이그레이션에는
--      존재하지 않는다. 제거해야 할 잘못된 class_textbooks 링크가 없기
--      때문이다: MS Advanced Class는 이 교과서를 실제로 계속 사용하므로
--      그 링크는 정상이며 그대로 둔다. ──

-- ── 실행 후 검증 SELECT ──
-- (0) 실행 전 참고용 — 이 교과서의 SCA 건수를 미리 기록해두고 실행 후 동일한지 대조:
--   select count(*) from public.student_class_assignments
--   where textbook_id = '2106b090-cf02-4f47-86e8-880ae4c681f3';
-- (a) 컨테이너 반 정확히 1개, class_type='textbook':
--   select id, name, class_type from public.classes where name = '고1 6월 학평';
-- (b) 교과서 소유권이 컨테이너로 이전됨:
--   select id, owner_class_id from public.textbooks
--   where id = '2106b090-cf02-4f47-86e8-880ae4c681f3';
--   -- 기대: owner_class_id = (a)의 id
-- (c) 유닛 8행이 컨테이너로 이동, 단어 수 불변(합계 328):
--   select u.id, u.class_id, u.name, count(w.id) as word_count
--   from public.units u left join public.words w on w.unit_id = u.id
--   where u.textbook_id = '2106b090-cf02-4f47-86e8-880ae4c681f3'
--   group by u.id, u.class_id, u.name
--   order by u.name;
--   -- 기대: 8행, class_id = (a)의 id, word_count 합계 328
--   --       (Unit 1/2/3/5는 각 26, Unit6/7/9/10은 각 50)
-- (d) 링크 상태 — 컨테이너 자기링크 + MS Advanced 기존 링크 = 2행:
--   select class_id, textbook_id, sort_order from public.class_textbooks
--   where textbook_id = '2106b090-cf02-4f47-86e8-880ae4c681f3';
--   -- 기대: ((a)의 id, 2106b090…, 0), (0249067d…, 2106b090…, n) 2행만
-- (e) SCA 건수 불변(학생 배정은 이 SQL이 건드리지 않음, (0)과 동일해야 함):
--   select count(*) from public.student_class_assignments
--   where textbook_id = '2106b090-cf02-4f47-86e8-880ae4c681f3';

-- ── 롤백(역방향, 전부 조건부 — 대상 상태가 이 SQL 실행 후일 때만 반영) ──
-- update public.textbooks set owner_class_id = '0249067d-dd64-465d-9c27-fb8737e9f4c4'
--   where id = '2106b090-cf02-4f47-86e8-880ae4c681f3'
--     and owner_class_id = (select id from public.classes where name = '고1 6월 학평' and class_type = 'textbook');
--
-- update public.units set class_id = '0249067d-dd64-465d-9c27-fb8737e9f4c4'
--   where textbook_id = '2106b090-cf02-4f47-86e8-880ae4c681f3'
--     and class_id = (select id from public.classes where name = '고1 6월 학평' and class_type = 'textbook');
--
-- delete from public.class_textbooks
--   where class_id = (select id from public.classes where name = '고1 6월 학평' and class_type = 'textbook')
--     and textbook_id = '2106b090-cf02-4f47-86e8-880ae4c681f3';
--
-- -- MS Advanced Class ↔ 이 교과서 링크는 이 SQL이 만든 것이 아니므로
-- -- 롤백에서도 절대 건드리지 않는다(제거 금지).
--
-- -- 컨테이너 반 자체는 롤백에서 지우지 않는다(빈 반 하나만 남는 무해한
-- -- 상태 — 파괴적 변경 금지 원칙과 별개로, 컨테이너 삭제는 별도 운영자
-- -- 판단 필요 시에만 수동으로).
