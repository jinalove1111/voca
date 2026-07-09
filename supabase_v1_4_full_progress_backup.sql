-- Paul Easy Voca v1.4 — 학생 공부 기록(streak/calendar/XP/미션/복습기록)
-- 클라우드 백업 컬럼 추가.
-- Supabase 대시보드 SQL Editor에서 통째로 실행해주세요.
--
-- 배경: 학생의 공부 기록(별/스티커/캘린더 히스토리/레벨업 미션/일기 배치 등)
-- 은 지금까지 기기의 localStorage에만 저장되고, Supabase에는 관리자 대시보드용
-- "요약 수치"(총 별/스트릭 등)만 한 방향으로(local -> DB) 동기화되고 있었습니다.
-- 즉 학생이 브라우저 데이터를 지우거나, 기기를 바꾸거나, 저장공간이 부족해
-- localStorage가 비워지면 그 학생의 기록을 복구할 방법이 전혀 없었습니다
-- ("사라지는" 근본 원인). 이 마이그레이션은 기존 student_progress 테이블에
-- 전체 기록을 통째로 JSON으로 백업하는 컬럼 하나를 추가해서, 다음 로그인
-- 시 로컬 데이터가 비어있으면 이 백업에서 자동 복구할 수 있게 합니다.
--
-- 기존 테이블/데이터에는 영향 없음(컬럼 추가만, NULL 허용) — 실행해도
-- 안전합니다.

alter table student_progress add column if not exists full_record jsonb;

comment on column student_progress.full_record is
  '학생 로컬 진행도 전체 백업(JSON) — streak/calendar/XP/미션/복습기록 등 useStudent.js의 record 객체 전체. 로컬 데이터 유실 시 복구용.';
