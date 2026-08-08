-- supabase_v3_22_premiddle_junk_textbooks.sql (2026-08-08)
-- 목적: "Pre-Middle School"/"Pre-Middle school"(대소문자만 다른 별개 이름)
-- 수업 반 생성 순간(2026-08-07 18:37) 자기 이름으로 자동 등록된 정크
-- 교과서 2행을 정리한다.
--
-- 배경: 당시 createClass는 classType과 무관하게 모든 신설 반에 자기 이름
-- 교과서를 자동 등록했다(수업 반도 예외 없이 등록 대상이었다). 라이브러리
-- 모델(2026-08-09 확정, 반↔교과서 다대다·수업 반은 콘텐츠 비소유)에서는
-- 수업 반이 자기 교과서를 가질 이유가 없다 — 이 버그는 같은 날
-- src/utils/wordLibrary.js의 createClass/ensureTextbookLayerBackfilled 수정
-- (classType === 'textbook'일 때만 교재 레이어 자동 등록)으로 재발이
-- 방지됐다. 이 SQL은 그 버그로 이미 만들어진 정크 2행만 제거하는 1회성
-- 정리이며, 코드 수정과 별개로 운영자 결재 후 수동 실행한다.
--
-- 대상(실측 확정 2026-08-08, 참조 0):
--   · textbooks.id = dc91886a-6df3-448a-955f-bb5795b74832
--     name='Pre-Middle School' — owner_class_id NULL(소유 반 없는 고아),
--     소속 유닛 0, student_class_assignments 참조 0, class_textbooks 링크 0.
--   · textbooks.id = e407ed1c-556c-49b3-ba52-cd3d6ab9f1e1
--     name='Pre-Middle school' — 소속 유닛 0, student_class_assignments
--     참조 0, class_textbooks self-링크 1행(class_id=
--     39e9acb1-cbd0-4863-8c43-5256b01e784e = "Pre-Middle school" 수업 반
--     자기 자신 — createClass가 신설 직후 자기 반↔자기 교과서를 스스로
--     링크하는 옛 동작의 산물). owner_class_id는 그 반 id(39e9acb1…)로
--     추정되나(같은 반이 자기 이름 교과서를 만들며 owner_class_id=cls.id로
--     insert하는 옛 createClass 동작과 일치) SQL 자체는 owner_class_id 값에
--     의존하지 않는다(스텝 ②는 id로만 대상을 지정) — 실행 전 재확인
--     SELECT로 정확한 값을 다시 확인한다.
--
-- ⚠️ 되돌릴 수 없는 행 삭제(DELETE) — 운영자 결재 필수. 아래 "실행 전
-- 재확인 SELECT"로 참조(유닛/SCA/링크)가 여전히 0인지 반드시 재확인한 뒤
-- 실행한다. 그 사이 다른 세션이 이 교과서에 유닛/링크/배정을 새로
-- 만들었다면 스텝 ②의 not exists 가드가 자동으로 그 행을 보존한다(대상에서
-- 조용히 제외, 에러 아님).
--
-- 무접촉(변경하지 않는 것, 명시):
--   · "Pre-Middle School"/"Pre-Middle school" 수업 반(classes) 자체 — 이
--     SQL은 classes 테이블을 전혀 건드리지 않는다. 학생 소속(students.
--     class_id)/학습 기록도 무관.
--   · 위 2개 id 이외의 다른 교과서/유닛/링크/배정 전부.
--
-- 실행 주체(규칙 8): anon 쓰기는 supabase_v3_11_lockdown_curriculum_write.sql
-- 로 이미 SELECT-only 락다운돼 있어(RLS default-deny) 에이전트/CI/anon
-- 클라이언트로는 애초에 실행 불가능. Supabase 대시보드 SQL Editor에서
-- 운영자가 postgres/service_role 권한으로 수동 실행한다.
--
-- GRANT: 불필요 — 신규 컬럼/신규 테이블 없음(기존 textbooks/class_textbooks
-- 테이블에서 행 삭제만, 규칙 10은 "새 컬럼"에만 적용되므로 대상 없음).
--
-- 멱등성(규칙 9): 스텝 ①은 (class_id, textbook_id) 2중 조건, 스텝 ②는 id
-- 명시 목록 + "참조(유닛/SCA/링크) 0일 때만" 서브쿼리 가드를 동시에 건다
-- — 이미 삭제된 뒤 재실행하면 대상 행 자체가 없어 두 스텝 모두 0행 처리로
-- 끝난다. 스키마/테이블/컬럼을 지우는 구문, 테이블 전체를 한 번에 비우는
-- 구문, WHERE 절 없는 무조건부 행 삭제는 이 파일 어디에도 없다.
--
-- 앱 무파손 근거(규칙 9): 두 행 모두 참조(유닛/SCA/링크) 0이라 어떤 학생/
-- 관리자 화면도 이 두 textbook id를 조회하고 있지 않다 — 삭제해도 화면에
-- 영향 없음. student_class_assignments.textbook_id는 textbooks(id)를
-- on delete cascade로 참조하지만(supabase_v3_1_textbooks.sql), 이 두 행은
-- SCA 참조가 이미 0이므로 실질적으로 연쇄 삭제될 행이 없다(스텝 ②의
-- 가드가 실행 시점에 이를 다시 보장).

-- ── 실행 전 재확인 SELECT (실행 전 반드시 재확인) ──
-- select id, name, owner_class_id from public.textbooks
--   where id in ('dc91886a-6df3-448a-955f-bb5795b74832', 'e407ed1c-556c-49b3-ba52-cd3d6ab9f1e1');
-- select count(*) from public.units
--   where textbook_id in ('dc91886a-6df3-448a-955f-bb5795b74832', 'e407ed1c-556c-49b3-ba52-cd3d6ab9f1e1'); -- 기대: 0
-- select count(*) from public.student_class_assignments
--   where textbook_id in ('dc91886a-6df3-448a-955f-bb5795b74832', 'e407ed1c-556c-49b3-ba52-cd3d6ab9f1e1'); -- 기대: 0
-- select class_id, textbook_id, sort_order from public.class_textbooks
--   where textbook_id in ('dc91886a-6df3-448a-955f-bb5795b74832', 'e407ed1c-556c-49b3-ba52-cd3d6ab9f1e1');
--   -- 기대: dc91886a… 0행, e407ed1c… 1행(class_id=39e9acb1-cbd0-4863-8c43-5256b01e784e)

-- ── ① class_textbooks 링크 1행 삭제 (e407ed1c의 self-링크, 2중 조건) ──
delete from public.class_textbooks
where class_id = '39e9acb1-cbd0-4863-8c43-5256b01e784e'
  and textbook_id = 'e407ed1c-556c-49b3-ba52-cd3d6ab9f1e1';

-- ── ② textbooks 2행 삭제 (id 명시 목록 + 참조 0일 때만 서브쿼리 가드) ──
delete from public.textbooks
where id in ('dc91886a-6df3-448a-955f-bb5795b74832', 'e407ed1c-556c-49b3-ba52-cd3d6ab9f1e1')
  and not exists (select 1 from public.units u where u.textbook_id = textbooks.id)
  and not exists (select 1 from public.student_class_assignments a where a.textbook_id = textbooks.id)
  and not exists (select 1 from public.class_textbooks ct where ct.textbook_id = textbooks.id);

-- ── 실행 후 검증 SELECT ──
-- select count(*) from public.textbooks
--   where id in ('dc91886a-6df3-448a-955f-bb5795b74832', 'e407ed1c-556c-49b3-ba52-cd3d6ab9f1e1'); -- 기대: 0
-- select count(*) from public.class_textbooks
--   where textbook_id = 'e407ed1c-556c-49b3-ba52-cd3d6ab9f1e1'; -- 기대: 0

-- ── 롤백(역방향, 참조용 — 삭제된 행을 원문 그대로 재생성) ──
-- owner_class_id는 실행 전 재확인 SELECT에서 확인한 실제 값으로 바꿔서
-- 실행할 것(위 "대상" 섹션의 39e9acb1-cbd0-4863-8c43-5256b01e784e는 추정값).
-- insert into public.textbooks (id, name, owner_class_id) values
--   ('dc91886a-6df3-448a-955f-bb5795b74832', 'Pre-Middle School', null),
--   ('e407ed1c-556c-49b3-ba52-cd3d6ab9f1e1', 'Pre-Middle school', '39e9acb1-cbd0-4863-8c43-5256b01e784e');
-- insert into public.class_textbooks (class_id, textbook_id, sort_order) values
--   ('39e9acb1-cbd0-4863-8c43-5256b01e784e', 'e407ed1c-556c-49b3-ba52-cd3d6ab9f1e1', 0);
