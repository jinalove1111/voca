-- Paul Easy Voca v1.7 — 학생 "최초 PIN 자기설정" 기능을 위한 컬럼 추가.
--
-- Supabase SQL Editor에 전체를 그대로 붙여넣고 실행하세요.
--
-- 배경(2026-07-16, 운영자 지시로 PIN 운영 방식 변경):
--   v1.6에서 만든 이름+PIN 로그인 인프라(student_id 기준, pin_hash/
--   pin_fail_count/pin_locked_until, scrypt 해시, 5회 실패 잠금)는 전부
--   그대로 유지한다 — 이번엔 그 위에 "학생이 직접 자기 PIN을 만드는"
--   플로우만 추가한다. 관리자가 명시적으로 허용한 학생만, 딱 1회만 자기
--   PIN을 설정할 수 있게 하기 위한 플래그 컬럼이 필요하다(안 그러면
--   아무나 다른 학생 이름으로 들어가 그 학생의 PIN을 가로챌 수 있음).
--
-- 안전 설계:
--   - ADD COLUMN IF NOT EXISTS — 이미 반영된 상태에서 다시 실행해도
--     안전(멱등), 기존 행 데이터는 전혀 안 건드림. 기본값 false라
--     기존 학생 전원은 안전한 "허용 안 됨" 상태로 시작.
--   - 이 컬럼만으로는 아무 것도 못 함 — 실제 자기설정 허용 여부는 항상
--     서버(api/self-set-student-pin.js)가 이 값 + pin_hash IS NULL 둘 다
--     확인 후에만 저장을 허용한다.

alter table students add column if not exists pin_setup_allowed boolean not null default false;

comment on column students.pin_setup_allowed is
  '관리자가 "PIN 설정 허용" 버튼을 눌렀을 때만 true — 그 학생이 자기 PIN을 1회 자기설정할 수 있게 하는 1회성 플래그. 학생이 실제로 PIN 설정에 성공하면 서버(api/self-set-student-pin.js)가 즉시 다시 false로 원복한다(재사용 방지). pin_hash가 이미 있는 학생은 이 값과 무관하게 자기설정이 항상 거부된다.';
