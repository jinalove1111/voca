-- v2_5_pilot 01_postcheck_after_v2_5.sql — 100% SELECT 전용 (2026-08-10)
-- supabase_v2_5_gamification_master_switch.sql 실행 **직후** 확인용.

-- 1: 컬럼 생성 + 전 반 false (기대: total 16, enabled 0)
select count(*) as total,
       count(*) filter (where gamification_enabled) as enabled_count
from classes;

-- 2: 반별 값 눈 확인
select name, class_type, gamification_enabled from classes order by name;

-- 3: 타 테이블 무접촉 (기대: 1157 / 971 / 29 / 190)
select (select count(*) from students)         as students,
       (select count(*) from words)            as words,
       (select count(*) from units)            as units,
       (select count(*) from student_progress) as progress;
