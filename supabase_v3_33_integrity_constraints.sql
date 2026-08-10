-- Paul Easy Voca v3.33 — 무결성 제약 강화 (2026-08-11, 93차 야간 감사 후속)
--
-- ⚠️ 실행하지 마세요 (아직). 이 파일은 **제안**입니다.
--    헌법 규칙 8: 에이전트/CI는 DDL을 직접 실행하지 않는다. 운영자가
--    Supabase 대시보드 SQL Editor에서 수동 실행합니다.
--    헌법 규칙 13: 실행 전 아래 "사전 점검" 쿼리를 먼저 돌려 위반 행이
--    0건인지 확인하세요. 위반이 있으면 인덱스 생성이 실패합니다(안전한 실패).
--
-- 배경: 2026-08-11 코드 경로 감사에서 P0 2건이 나왔습니다. 지금 데이터는
-- 깨끗하지만(실측: 중복 반 0, 중복 유닛 0), 이를 막는 **DB 레벨 장치가 전혀
-- 없습니다**. 앱 코드가 SELECT-후-INSERT(TOCTOU)로만 막고 있어서, 동시 요청
-- (관리자 더블클릭 / 업로드 재시도 / 두 기기 동시 작업)이면 중복이 생깁니다.
-- 실제로 2026-08-09에 "Unit 1 vs Unit1" 유닛 분열 사고가 있었습니다.
--
-- 이 파일은 **읽기/쓰기 동작을 전혀 바꾸지 않습니다.** 중복 생성만 DB가
-- 거부하게 됩니다(앱은 이미 23505를 "이미 있음"으로 처리하는 코드 경로를
-- 여러 곳에 갖고 있습니다 — ensureTextbookLayerBackfilled, assignTextbook 등).
--
-- 멱등: 전부 `if not exists`. 여러 번 실행해도 안전합니다.

-- ════════════════════════════════════════════════════════════════════
-- 0) 사전 점검 — 실행 전에 이 3개를 먼저 돌려 전부 0행인지 확인하세요.
-- ════════════════════════════════════════════════════════════════════
-- (a) 중복 반 이름
--   select name, count(*) from classes group by name having count(*) > 1;
--
-- (b) 같은 반 안 중복 유닛(정규화 기준 — 공백 제거 + 소문자 + 0 패딩 제거)
--   select class_id,
--          regexp_replace(lower(regexp_replace(name, '\s+', '', 'g')), '0+(\d+)$', '\1') as k,
--          count(*), array_agg(name)
--     from units group by class_id, k having count(*) > 1;
--
-- (c) primary 배정이 2개 이상인 학생
--   select student_id, count(*) from student_class_assignments
--    where is_primary group by student_id having count(*) > 1;
--
-- 2026-08-11 실측: (a) 0행, (b) 0행, (c) 0행 — 지금 실행하면 통과합니다.

-- ════════════════════════════════════════════════════════════════════
-- 1) classes.name UNIQUE — 중복 반 생성 차단 (P0-1)
-- ════════════════════════════════════════════════════════════════════
-- 반 이름이 갈라지면 유닛/단어/학생이 조용히 두 반으로 나뉩니다.
-- 앱은 이미 `_cache[className]` 하나만 신뢰하므로 나머지 반은 유령이 됩니다.
create unique index if not exists classes_name_unique_idx on classes (name);

-- ════════════════════════════════════════════════════════════════════
-- 2) units(class_id, 정규화 이름) UNIQUE — 형제 유닛 분열 차단 (P0-2)
-- ════════════════════════════════════════════════════════════════════
-- 표현식 인덱스로 "Unit 1" ≡ "Unit1" ≡ "unit 01"을 같은 것으로 취급합니다.
-- (앱의 unitNameKey와 같은 정규화 — wordLibrary.js:811 참고)
-- 주의: 이 인덱스는 앱의 정규화 규칙과 **반드시 동일**해야 합니다. 앱
-- 규칙을 바꾸면 이 인덱스도 함께 바꿔야 합니다.
create unique index if not exists units_class_normalized_name_unique_idx
  on units (
    class_id,
    (regexp_replace(lower(regexp_replace(name, '\s+', '', 'g')), '0+(\d+)$', '\1'))
  );

-- ════════════════════════════════════════════════════════════════════
-- 3) 학생당 primary 배정 1개 — partial unique index (P0-3)
-- ════════════════════════════════════════════════════════════════════
-- setPrimaryAssignment/setPrimaryTextbook은 target→true, old→false 두 번의
-- UPDATE로 나뉘어 있어, 중간에 끊기면 primary가 2개로 남습니다.
--
-- ⚠️ 주의: 이 인덱스를 걸면 그 "두 단계" 중 첫 UPDATE가 **실패**하게 됩니다
--    (기존 primary가 아직 true인 상태에서 새 primary를 true로 올리므로).
--    따라서 이 인덱스는 **코드 수정과 짝으로만** 적용해야 합니다:
--    old→false 를 먼저 하고 target→true 를 나중에 하도록 순서를 뒤집거나,
--    서버 RPC로 한 트랜잭션에 묶어야 합니다.
--    => 지금은 실행하지 마세요. 코드 수정 후 함께 적용할 항목입니다.
--
-- create unique index if not exists sca_one_primary_per_student_idx
--   on student_class_assignments (student_id) where is_primary;

-- ════════════════════════════════════════════════════════════════════
-- 4) 사후 확인 — 실행 후 아래로 인덱스가 생겼는지 확인
-- ════════════════════════════════════════════════════════════════════
--   select indexname from pg_indexes
--    where indexname in ('classes_name_unique_idx',
--                        'units_class_normalized_name_unique_idx');
--
-- 실행 후 `npm run verify:integrity`와 `npm run verify:all`을 돌려 기존
-- 동작이 그대로인지 확인하세요(이 파일은 데이터를 전혀 바꾸지 않습니다).
