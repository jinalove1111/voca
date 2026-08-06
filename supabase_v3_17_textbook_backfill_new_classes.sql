-- supabase_v3_17_textbook_backfill_new_classes.sql (2026-08-06)
-- 교과서 저장·조회 P0 후속 — v3.1 백필(supabase_v3_1_textbooks.sql,
-- 2026-07-22 1회 실행) 이후에 생성된 반은 textbooks/class_textbooks 행이
-- 없다. v3.1 백필은 "그 시점의 유닛 보유 반"만 옮겼고, 이후 새로 만든 반을
-- 교재 레이어에 넣어주는 코드가 어디에도 없었다(실측: 2026-08-04 생성
-- "중2 동아 윤정미"/"중1 동아 윤정미"/"고1 능률 민병천" 3개 반, 셋 다 40단어
-- 유닛 보유 — textbooks 행 0, class_textbooks 링크 0).
--
-- 결과 증상(운영자 보고, 라이브 실측으로 확정): 교재 모드에서 이런 반의
-- 학생/SCA 행(textbook_id NULL)이 getOwnTextbookOfClass(반) = null로
-- 해석되고, getStudentPrimaryTextbook이 사람 반 자동 교재로 폴백해 이전
-- 교과서로 되돌아 표시된다. 저장은 SCA에 정상적으로 되지만 조회가 해석하지
-- 못하는 구조 — 즉 이 SQL은 "쓰기 버그"가 아니라 "교재 레이어 등록 누락"을
-- 메운다.
--
-- ★ 이 SQL은 선택사항이다 ★ — 코드 배포 후 관리자가 관리자 화면을 한 번
-- 열면 앱이 같은 백필을 자동 수행한다(src/utils/wordLibrary.js
-- ensureTextbookLayerBackfilled, AdminScreen.jsx 마운트 시 fire-and-forget
-- 호출). 이 SQL을 먼저 실행해도 자동 백필은 멱등이라 안전(둘 다 실행해도
-- 중복 없음, on conflict do nothing).
--
-- v3.1의 (5) 백필 섹션과 동일 패턴 — 다른 점은 WHERE 조건 하나: "유닛은
-- 있지만 아직 textbooks에 없는 반"만 대상으로 한다(v3.1은 그 시점 전체
-- 유닛 보유 반이 전부 미등록 상태였어서 조건이 필요 없었다).
--
-- 무파괴(additive-only, 이 저장소 마이그레이션 규칙 그대로): INSERT/SELECT만
-- 있다. DROP/DELETE/UPDATE 없음. 실행 전 스키마(textbooks/class_textbooks)는
-- supabase_v3_1_textbooks.sql이 이미 만들어 뒀다고 가정 — 미실행 상태면
-- 아래 INSERT들이 "relation does not exist"로 실패하는데, 그 경우 클라이언트는
-- 여전히 규칙 9의 합성 폴백으로 오늘과 동일 동작하므로 앱 무손상.
--
-- 롤백 노트: 이 마이그레이션이 새로 만드는 행은 전부 textbooks(신규 반
-- 이름의 새 행) + class_textbooks(그 반의 자기 연결) 뿐이다. 되돌리려면
-- 그 반 이름으로 생성된 textbooks 행과 연결된 class_textbooks 행만 지우면
-- 되고(다른 반/기존 v3.1 백필 행은 무관), 지워도 클라이언트는 다시 합성
-- 폴백으로 흡수한다(신규 기능 손실 없음, 기존 학습 데이터 무손실).

-- ── 1) textbooks — 유닛은 있지만 아직 교재 레이어에 없는 반만 대상 ──
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
  and not exists (select 1 from textbooks t where t.owner_class_id = c.id)
on conflict (name) do nothing;

-- ── 2) class_textbooks — 새로 생긴 textbooks 행의 자기 연결(반↔교재) ──
insert into class_textbooks (class_id, textbook_id, sort_order)
select t.owner_class_id, t.id, 0
from textbooks t
where t.owner_class_id is not null
on conflict (class_id, textbook_id) do nothing;

-- ── 3) units/student_class_assignments — 새로 커버된 반의 textbook_id 백필 ──
-- (v3.1과 동일 패턴 — 이미 채워진 행은 건드리지 않음, textbook_id is null
-- 조건이라 기존 데이터 무손상)
update units u
set textbook_id = t.id
from textbooks t
where t.owner_class_id = u.class_id and u.textbook_id is null;

update student_class_assignments a
set textbook_id = t.id
from textbooks t
where t.owner_class_id = a.class_id and a.textbook_id is null;

-- ── 실행 후 검증 쿼리 ──
-- (a) 이번에 새로 등록된 교재(v3.1 이후 생성 반들 — 이름으로 확인):
--   select name, publisher_name, owner_class_id from textbooks
--   where name in ('중2 동아 윤정미', '중1 동아 윤정미', '고1 능률 민병천');
-- (b) 미백필 유닛 0건이어야:
--   select count(*) from units where textbook_id is null;
-- (c) 미백필 배정 행 0건이어야:
--   select count(*) from student_class_assignments where textbook_id is null;
-- (d) 유닛 보유 반 중 textbooks 미등록 0건이어야(전수 커버 확인):
--   select c.id, c.name from classes c
--   where exists (select 1 from units u where u.class_id = c.id)
--     and not exists (select 1 from textbooks t where t.owner_class_id = c.id);
