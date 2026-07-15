-- Paul Easy Voca v1.6 — 학생 identity P0 수정: 이름 UNIQUE 제약 제거 +
-- 이름+PIN 로그인을 위한 컬럼 추가.
--
-- Supabase SQL Editor에 전체를 그대로 붙여넣고 실행하세요.
--
-- 배경(P0 진단, 2026-07-15):
--   라이브 진단 스크립트로 확인한 결과 students.name에 UNIQUE 제약
--   (students_name_key)이 걸려 있었다 — 그래서 동명이인 학생(다른 반이라도)
--   등록 자체가 DB 레벨에서 막혀 있었고, 클라이언트 코드도 addStudent()에서
--   같은 방어를 중복으로 하고 있었다(현재 클라이언트 코드는 이미 그 방어를
--   제거함, src/utils/wordLibrary.js 참고). 학생은 이제 이름이 아니라
--   students.id(UUID)로 식별되므로 이름 중복은 더 이상 문제가 아니다.
--   진단 시점 기준 실제 동명이인 데이터는 없었음(0건) — 안전하게 제약만
--   제거하면 됨, 기존 행 데이터는 전혀 건드리지 않는다.
--
--   추가로 "이름+PIN" 로그인 방식(운영자 지시, 반 선택 UI 대신 채택)을
--   위해 pin_hash(평문 절대 저장 안 함, api/_pinAuth.js의 scrypt 해시만
--   저장) + 5회 실패 잠금을 위한 pin_fail_count/pin_locked_until 컬럼을
--   추가한다.
--
-- 안전 설계:
--   - DROP CONSTRAINT IF EXISTS / ADD COLUMN IF NOT EXISTS — 이미 반영된
--     상태에서 다시 실행해도 안전(멱등), 기존 행 데이터는 전혀 안 건드림.
--   - pin_hash가 비어있는 기존 학생은 로그인 시 서버(api/verify-student-
--     pin.js)가 "PIN 미설정" 상태로 안전하게 거부한다(크래시 아님) —
--     이 마이그레이션 SQL 자체는 기존 학생에게 임시 PIN을 자동 부여하지
--     않는다(평문 PIN을 SQL로 심는 건 위험). 임시 PIN 일괄 발급은
--     관리자 화면의 "임시 PIN 일괄 생성" 버튼(api/bulk-generate-temp-
--     pins.js)으로 관리자가 직접, 필요할 때 실행한다 — 평문 PIN이
--     생성되는 화면은 관리자 인증 뒤에서만 접근 가능해야 하므로.

alter table students drop constraint if exists students_name_key;

alter table students add column if not exists pin_hash text;
alter table students add column if not exists pin_fail_count integer not null default 0;
alter table students add column if not exists pin_locked_until timestamptz;

comment on column students.pin_hash is
  '이름+PIN 로그인용 4자리 PIN의 해시(scrypt, salt:hash 형식) — 평문은 절대 저장하지 않음. api/_pinAuth.js 참고. 클라이언트 코드는 이 컬럼을 절대 select하지 않는다(서버리스 함수에서만 조회).';
comment on column students.pin_fail_count is
  'PIN 로그인 연속 실패 횟수 — api/verify-student-pin.js가 서버사이드에서만 증가/초기화. 5회 도달 시 pin_locked_until 설정.';
comment on column students.pin_locked_until is
  'PIN 로그인 잠금 해제 시각 — 이 시각 이전에는 PIN이 맞아도 로그인 거부(브루트포스 방지).';

create index if not exists idx_students_pin_locked_until on students (pin_locked_until) where pin_locked_until is not null;
