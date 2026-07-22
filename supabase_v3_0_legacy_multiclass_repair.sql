-- supabase_v3_0_legacy_multiclass_repair.sql (2026-07-22)
-- "기존 학생 다중 교재 전환 불가" 버그의 데이터 수리 — 전부 멱등.
--
-- 근본 원인(코드 쪽은 같은 날 커밋으로 이미 수정됨):
--   구 "반 배정"(setStudentClass/setStudentsClassBulk)이 v2_9 조인 테이블
--   (student_class_assignments)을 유지보수하지 않아, 반을 옮긴 기존 학생에게
--   이전 반의 primary 행(유령)이 남았다. 이 유령 행이 unique(student_id,
--   class_id)로 "그 반을 두 번째 교재로 재추가"(assignTextbook)를 조용히
--   차단했고(23505 → no-op), 클라이언트 read-heal은 화면만 마스킹해 문제를
--   가렸다. 또한 v2_1 백필이 완료되지 않아 203명(2026-07-22 실측)의
--   students.current_unit_id가 NULL(레거시 unit_name 문자열 의존)이라
--   교재별 유닛 진도 분리가 구조적으로 불가능했다.
--
-- 이 SQL 없이도 앱은 동작한다: 수정된 클라이언트가 학생별로 로그인/조회
-- 시점에 같은 수리를 지연 수행(lazy self-heal)한다. 이 SQL은 그 수리를
-- 전 학생에 대해 한 번에 끝내는 가속 실행일 뿐이다(실행 순서 무관 안전 —
-- CLAUDE.md 규칙 9).
--
-- 롤백 노트: 1)/3)은 NULL을 채우기만 하므로 롤백 불필요(잘못 채워질 수
-- 있는 값이 아니라 기존 unit_name/students 값의 결정론적 해석). 2)는
-- 유령 primary 행 삭제 — 삭제 대상은 "students.class_id와 다른 반을
-- 가리키는 primary 행"뿐이며, 이는 정의상 구 반 배정("이동")이 남긴
-- 찌꺼기다. 교사가 의도적으로 만든 secondary 배정(is_primary=false)은
-- 절대 건드리지 않는다. 만약 삭제된 행을 되살려야 하면 관리자 UI의
-- "교재 추가"로 재배정하면 된다(행 자체에 다른 데이터 없음).

-- ── 1) v2_1 백필 완결 — 레거시 학생의 current_unit_id를 unit_name으로 해석 ──
-- NULL인 행만 채운다(비-NULL 덮어쓰기 없음 = 멱등·무손실). 이름이 매칭되는
-- 유닛이 없으면 NULL 유지(클라이언트 첫-유닛 폴백이 계속 커버).
update students s
set current_unit_id = u.id
from units u
where s.current_unit_id is null
  and s.class_id is not null
  and u.class_id = s.class_id
  and u.name = s.unit_name;

-- ── 2) 유령 primary 행 정리 — students.class_id와 불일치하는 primary만 ──
-- (조건부 삭제: 이 학생의, primary이면서, 현재 반이 아닌 행만. 교사가 만든
--  secondary 배정은 is_primary=false라 조건에 절대 안 걸림.)
delete from student_class_assignments a
using students s
where a.student_id = s.id
  and a.is_primary = true
  and s.class_id is not null
  and a.class_id <> s.class_id;

-- ── 3) 현재 반 primary 행 보장 — 없으면 생성, 있으면 primary 승격만 ──
-- on conflict 시 current_unit_id는 기존 행 값을 보존(coalesce) — 교사가
-- setAssignmentUnit으로 정한 반별 진도를 절대 덮어쓰지 않는다(무손실).
insert into student_class_assignments (student_id, class_id, current_unit_id, is_primary)
select s.id, s.class_id, s.current_unit_id, true
from students s
where s.class_id is not null
on conflict (student_id, class_id) do update
set is_primary = true,
    current_unit_id = coalesce(student_class_assignments.current_unit_id, excluded.current_unit_id);

-- ── 4) primary 행의 NULL 유닛 채움 — students 권위 값으로, 반 소속 검증 포함 ──
update student_class_assignments a
set current_unit_id = s.current_unit_id
from students s
where a.student_id = s.id
  and a.is_primary = true
  and a.current_unit_id is null
  and s.current_unit_id is not null
  and exists (select 1 from units u where u.id = s.current_unit_id and u.class_id = a.class_id);

-- ── 실행 후 검증 쿼리 ──
-- (a) 레거시 NULL 잔여(이름 매칭 실패분만 남아야 함 — 0에 가까울수록 좋음):
--   select count(*) from students where class_id is not null and current_unit_id is null;
-- (b) 유령 primary 행 0건이어야 함:
--   select count(*) from student_class_assignments a join students s on s.id = a.student_id
--   where a.is_primary and s.class_id is not null and a.class_id <> s.class_id;
-- (c) 반 배정 학생 전원이 정확히 1개의 primary 행을 보유해야 함:
--   select count(*) from students s where s.class_id is not null and
--   (select count(*) from student_class_assignments a where a.student_id = s.id and a.is_primary) <> 1;
