-- ============================================================================
-- supabase_v2_1_student_unit_decouple.sql — 학생-Unit 아키텍처 분리 (v2.1)
-- 2026-07-17. Supabase SQL Editor에서 1회 실행. 멱등 — 여러 번 실행해도 안전.
--
-- ── 왜 ──────────────────────────────────────────────────────────────────
-- 지금까지 학생의 "현재 유닛"은 students.unit_name(표시용 문자열)이 유일한
-- 저장소였다. 유닛 조회가 이름 문자열 매칭이라:
--   * 유닛이 삭제되거나 이름 표기가 다르면("Unit 1" vs "Unit1") 조용히
--     첫 유닛으로 폴백 — "학생이 첫 유닛에 묶인다/되돌아간다" 버그의 원인.
--   * 단어/유닛 관계는 이미 unit_id(UUID FK)로 건전한데 학생→유닛 연결만
--     문자열이라 정합성이 깨질 수 있는 유일한 지점이었다.
-- 이 SQL은 students.current_unit_id(uuid, units.id FK, nullable)를 추가하고
-- 기존 unit_name에서 백필한다. unit_name 컬럼은 삭제하지 않는다(하위호환 —
-- 구버전 클라이언트/폴백 경로가 계속 읽는다. 제거는 추후 별도 결정).
--
-- ── 실행 순서 안전성 ────────────────────────────────────────────────────
-- 코드(v2.1)가 먼저 배포돼도 안전: 클라이언트는 이 컬럼 조회가 실패하면
-- 자동으로 기존 unit_name 문자열 경로로 폴백한다(refreshStudents/
-- setStudentUnit/addStudent 전부 재시도 패턴). 이 SQL이 먼저 실행돼도 안전:
-- 구버전 코드는 새 컬럼을 아예 모르며, 새 컬럼은 nullable이라 INSERT에
-- 영향 없다. 순서 제약 없음.
--
-- ── v1.9 컬럼 단위 권한 함정 (handoff.md 문서화된 필수 사항) ─────────────
-- v1.9에서 students의 테이블 단위 SELECT/UPDATE가 회수되고 명시 컬럼만
-- anon에 허용된 상태다. 새 컬럼은 반드시 GRANT를 함께 실행해야 클라이언트가
-- 읽고 쓸 수 있다(안 하면 fail-closed로 select 전체가 42501). 아래 3)에서
-- select + update 둘 다 부여한다 — 학생이 홈 화면에서 직접 유닛을 전환하는
-- 것이 이번 기능의 핵심이므로 update가 필요하다. (PIN 4컬럼 차단은 그대로 —
-- 이 GRANT는 current_unit_id 한 컬럼만 추가 허용.)
-- ============================================================================

-- 1) 컬럼 추가 (멱등). FK는 유닛 삭제 시 자동 null — 클라이언트는 null이면
--    unit_name 문자열 → 첫 유닛 순서로 폴백(기존 동작과 동일한 안전망).
alter table public.students
  add column if not exists current_unit_id uuid references public.units(id) on delete set null;

-- 1-b) 컬럼이 이 SQL 이전에 (FK 없이) 이미 만들어져 있던 경우 대비 — FK를
--     별도로 보증한다(add column if not exists는 기존 컬럼에 FK를 추가하지
--     않음). 2026-07-17 라이브 실측: current_unit_id 컬럼+GRANT+백필이 이미
--     적용된 상태였음 — 이 블록이 그 상태에서도 FK/인덱스 정합성을 맞춘다.
--     FK 추가 전 허상 참조(가리키는 유닛이 삭제된 행)는 null로 보정
--     (데이터 삭제 아님 — 끊어진 포인터 정리, 클라이언트 폴백이 커버).
update public.students s
set current_unit_id = null
where current_unit_id is not null
  and not exists (select 1 from public.units u where u.id = s.current_unit_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.students'::regclass
      and confrelid = 'public.units'::regclass
      and contype = 'f'
      and conkey = (
        select array[attnum] from pg_attribute
        where attrelid = 'public.students'::regclass and attname = 'current_unit_id'
      )
  ) then
    alter table public.students
      add constraint students_current_unit_id_fkey
      foreign key (current_unit_id) references public.units(id) on delete set null;
  end if;
end $$;

-- 2) 인덱스 (멱등) — 관리자 "이 유닛을 보는 학생" 역조회/FK 삭제 성능용.
create index if not exists idx_students_current_unit_id
  on public.students (current_unit_id);

-- 3) anon/authenticated GRANT — v1.9 이후 필수(위 주석 참고). 멱등(GRANT는
--    중복 실행 무해).
grant select (current_unit_id) on table public.students to anon, authenticated;
grant update (current_unit_id) on table public.students to anon, authenticated;
-- 학생 자기등록(addStudent)이 첫 유닛 id를 함께 INSERT한다 — v1.9는 테이블
-- 단위 INSERT를 회수하지 않았으므로 별도 컬럼 GRANT 불필요(전 컬럼 INSERT
-- 가능 상태 유지). 명시적으로 남겨두는 확인용 주석.

-- 4) 백필 — unit_name 문자열을 "그 학생이 속한 반의 유닛" 중 이름이 일치하는
--    행으로 해석해 current_unit_id를 채운다. 이미 채워진 행(재실행)은 건너뜀
--    (멱등 + 이후 학생이 직접 바꾼 값을 절대 덮어쓰지 않음).
--    이름 매칭은 공백 무시(replace) — 라이브 데이터에 "Unit 1"/"Unit8" 표기
--    혼재가 실측 확인돼 있어(handoff 참고), 엄격 매칭이면 백필 누락이 난다.
--    같은 반에 공백만 다른 동명 유닛이 둘 있으면(비정상 데이터) 정확 일치를
--    우선한다.
update public.students s
set current_unit_id = u.id
from public.units u
where s.current_unit_id is null
  and s.class_id = u.class_id
  and (
    u.name = s.unit_name
    or replace(u.name, ' ', '') = replace(coalesce(s.unit_name, ''), ' ', '')
  )
  -- 정확 일치 우선: 공백 무시 매칭은 정확 일치 유닛이 없을 때만.
  and (
    u.name = s.unit_name
    or not exists (
      select 1 from public.units u2
      where u2.class_id = s.class_id and u2.name = s.unit_name
    )
  );

-- PostgREST 스키마/권한 캐시 즉시 갱신.
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서 바로 실행)
--
-- ① 백필 결과 요약 — matched(채워짐) vs unmatched(반의 어느 유닛과도 이름
--    불일치 — null 허용, 클라이언트가 문자열→첫 유닛 폴백으로 기존과 동일
--    하게 동작. 아래 ②로 목록 확인 후 관리자 화면에서 재배정 권장):
--   select
--     count(*) filter (where current_unit_id is not null) as matched,
--     count(*) filter (where current_unit_id is null and class_id is not null) as unmatched,
--     count(*) filter (where class_id is null) as no_class
--   from public.students;
--
-- ② 매칭 실패 행 목록 (로깅용 — 삭제/수정하지 말 것):
--   select s.id, s.name, c.name as class_name, s.unit_name
--   from public.students s
--   left join public.classes c on c.id = s.class_id
--   where s.current_unit_id is null and s.class_id is not null
--   order by c.name, s.name;
--
-- ③ anon 권한 확인 (실행 후 반드시 reset role):
--   set role anon; select id, current_unit_id from public.students limit 1; reset role;
--   -- 정상 행 반환이어야 함. pin_hash는 여전히 42501 거부(변경 없음).
--
-- ④ 정합성 — current_unit_id가 가리키는 유닛이 반드시 그 학생의 반 소속인지
--    (0행이어야 정상):
--   select s.id, s.name from public.students s
--   join public.units u on u.id = s.current_unit_id
--   where u.class_id is distinct from s.class_id;
--
-- 전체 라이브 검증은 로컬에서:
--   node scripts/buildWordLibBundle.mjs
--   WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/testStudentUnitDecouple.mjs
-- ============================================================================
