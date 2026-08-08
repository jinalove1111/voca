-- supabase_v3_23_paul_dedup_rename.sql (2026-08-09)
-- 목적: 학생 "Paul" 실계정이 자기등록 중복 사고로 3개 존재 →
-- api/verify-student-pin.js의 ilike 'Paul' 매칭이 3건을 동시에 반환하고,
-- PIN이 그중 여럿(또는 전혀 다른 학생)에 매칭돼 duplicate_accounts로
-- 거부되어 실제 학생이 로그인하지 못하는 상태를 해소한다.
--
-- 실측 확정(2026-08-09, 참조 0 기준 3계정 전수 조회):
--   · CANONICAL(진짜 계정, 절대 건드리지 않음):
--     335a9560-d1f1-4628-bd8d-26bcaa8eaee7 — class "Presentation 6",
--     unit_name '-2026', 생성 07-05. word_status 17행, total_stars 223,
--     total_xp 223, 캘린더에 실제 학습 기록 존재, daily_progress 10건.
--   · 빈 중복 A: 38717600-f114-4092-abb6-c285e531f2d6 — class
--     "MS Advanced", 생성 07-22. word_status 0행, total_stars 0,
--     total_xp 0, 캘린더 {}(빈 객체) — 유의미 학습 데이터 없음.
--   · 빈 중복 B: fafa6d09-8dae-47ac-ba99-189fa8dccf81 — class
--     "MS Advanced", 생성 08-05. word_status 0행, total_stars 0,
--     total_xp 0, 캘린더 {}(빈 객체) — 유의미 학습 데이터 없음.
--
-- 빈 중복 2개(A/B)는 별/XP/word_status가 전부 0이라 canonical로 이관할
-- 학습 데이터가 존재하지 않는다 — 병합(merge) 불필요, 운영자 지시로
-- 병합/행 삭제는 하지 않는다.
--
-- students 스키마 실측 재확인(2026-08-09): soft-delete 성격의 컬럼
-- (active/is_active/deleted_at/archived 등)이 하나도 존재하지 않는다.
-- 따라서 이 정리의 방법은 "행을 없애는 것"이 아니라 "이름을 바꿔 로그인
-- 후보에서 빠지게 하는 것"이다 — verify-student-pin의 ilike 'Paul'
-- 매칭 대상에서 빈 중복 2개만 제외되도록 name 값만 변경한다(비파괴
-- 비활성화). canonical과 그 의존 레코드(student_progress/word_status/
-- student_class_assignments/daily_progress 등)는 이 SQL 어디에서도
-- 참조·수정하지 않는다.
--
-- 무접촉(변경하지 않는 것, 명시):
--   · canonical(335a9560…) 행 자체 및 그 모든 의존 레코드 — 조회조차
--     하지 않는다(백업 테이블 SELECT 대상에도 포함되지만 값만 읽고
--     UPDATE 대상에서는 명시적으로 제외).
--   · 빈 중복 2개의 class_id/current_unit_id/pin_hash 등 이름 외 컬럼 —
--     이 SQL은 name 컬럼만 바꾼다. 반 이동/교재 변경/PIN 재설정 전혀 없음.
--   · 행 삭제·병합 — 3계정 모두 그대로 존재한다(개수 변화 없음).
--
-- canonical PIN 재설정은 이 SQL의 범위가 아니다 — 필요하면 관리자
-- 화면의 기존 "PIN 초기화" 기능으로 별도 진행하며, 평문 PIN은 이 파일
-- 어디에도 기록하지 않는다(규칙 11).
--
-- 실행 주체(규칙 8): students 테이블은 2026-08-09 보안 잠금으로 anon
-- UPDATE 권한이 이미 회수된 상태라(별도 락다운 마이그레이션 기준),
-- 에이전트/CI/anon 클라이언트로는 애초에 실행 불가능하다. Supabase
-- 대시보드 SQL Editor에서 운영자가 postgres/service_role 권한으로
-- 수동 실행한다.
--
-- GRANT: 불필요 — 신규 컬럼/신규 테이블 없음(백업 테이블은 감사/롤백
-- 용도로만 쓰는 정적 스냅샷이라 anon 권한이 필요 없고, students.name은
-- 기존 컬럼). 규칙 10은 "새 컬럼"에만 적용되므로 대상 없음.
--
-- 멱등성(규칙 9): 스텝 ①(백업)은 create table if not exists라 이미
-- 존재하면 no-op. 스텝 ②(rename)는 각각 id 명시 + "현재 name이 여전히
-- 'Paul'일 때만"이라는 2중 조건부 UPDATE라, 이미 이름이 바뀐 뒤
-- 재실행하면 조건 불일치로 0행 처리된다 — 몇 번을 재실행해도 결과가
-- 동일하다. 이 파일 어디에도 스키마/테이블/컬럼을 지우는 구문, 테이블
-- 전체를 한 번에 비우는 구문, WHERE 절 없는 무조건부 행 삭제·변경
-- 구문이 없다(행 자체를 지우거나 없애는 구문 자체가 아예 없음 — 이
-- 파일은 CREATE TABLE IF NOT EXISTS와 조건부 UPDATE 2건뿐).
--
-- 앱 무파손 근거(규칙 9, 배포 순서 무관): 클라이언트/서버 코드 어디도
-- students.name을 학생 식별에 쓰지 않는다(규칙 4 — UUID 기준). 이 SQL이
-- 바꾸는 것은 로그인 시 이름 검색(ilike) 후보 집합뿐이라, 실행 후에는
-- "Paul"로 검색 시 candidate가 3건 → 1건(canonical)으로 줄어 정상
-- 로그인이 가능해진다. canonical 학생의 word_status/star/xp/캘린더/
-- daily_progress는 이 SQL이 전혀 건드리지 않으므로 실행 전후로 동일하게
-- 보존된다. 빈 중복 2개는 애초에 아무도 로그인해 쓴 적이 없는 유령
-- 계정(학습 데이터 0)이라 이름이 바뀌어도 영향받는 실사용자가 없다.

-- ── ① 백업 테이블 (3계정 원본 name/class_id/unit_name/current_unit_id
--      보존 — 롤백의 원천, 이미 있으면 no-op) ──
create table if not exists backup_20260809_paul_dedup as
select id, name, class_id, unit_name, current_unit_id
from public.students
where id in (
  '335a9560-d1f1-4628-bd8d-26bcaa8eaee7',
  '38717600-f114-4092-abb6-c285e531f2d6',
  'fafa6d09-8dae-47ac-ba99-189fa8dccf81'
);
-- 검증: select count(*) from backup_20260809_paul_dedup; -- 3 기대

-- ── ② 빈 중복 2개만 이름 변경(비활성화) — id 명시 + name이 여전히
--      'Paul'일 때만(멱등). canonical(335a9560…)은 대상에 없음 ──
update public.students
set name = 'Paul_DUP_20260722_INACTIVE'
where id = '38717600-f114-4092-abb6-c285e531f2d6'
  and name = 'Paul';

update public.students
set name = 'Paul_DUP_20260805_INACTIVE'
where id = 'fafa6d09-8dae-47ac-ba99-189fa8dccf81'
  and name = 'Paul';

-- ── 실행 후 검증 SELECT ──
-- select id, name, class_id from public.students where name ilike 'Paul';
--   -- 기대: 1행만, id = 335a9560-d1f1-4628-bd8d-26bcaa8eaee7
-- select id, name from public.students
--   where name ilike 'Paul!_DUP!_%' escape '!';
--   -- 기대: 2행(38717600…, fafa6d09…)
-- select count(*) from public.students where id in (
--   '335a9560-d1f1-4628-bd8d-26bcaa8eaee7',
--   '38717600-f114-4092-abb6-c285e531f2d6',
--   'fafa6d09-8dae-47ac-ba99-189fa8dccf81'
-- ); -- 기대: 3 (행 개수 불변 — 삭제·병합 없음을 재확인)

-- ── 롤백(역방향, 참조용 — 백업 테이블 값으로 이름만 원복) ──
-- update public.students s
-- set name = b.name
-- from backup_20260809_paul_dedup b
-- where s.id = b.id
--   and s.id in (
--     '38717600-f114-4092-abb6-c285e531f2d6',
--     'fafa6d09-8dae-47ac-ba99-189fa8dccf81'
--   );
