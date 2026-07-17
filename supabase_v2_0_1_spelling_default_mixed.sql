-- Paul Easy Voca v2.0.1 — 쓰기시험 출제 방향 DB 컬럼 기본값을 'mixed'로 변경.
--
-- Supabase 대시보드 SQL Editor에서 실행해주세요. (멱등 — 몇 번 실행해도 안전)
--
-- 배경(2026-07-17): 운영자 확정 — "혼합 50:50이 기본값". 클라이언트 기본값
-- (wordLibrary.js DEFAULT_CLASS_SETTINGS)과 기존 반 데이터는 이미 'mixed'로
-- 전환 완료(scripts/opsSetAllClassesMixed.mjs — DML이라 코드 배포로 처리됨).
--
-- 이 파일은 "앞으로 새로 만드는 반"의 DB 컬럼 default만 맞추는 마무리 DDL:
-- ⚠️ 실행 안 해도 동작에는 지장 없음 — 새 반이 DB default로 'kr2en'을 받아도
-- 관리자 화면에서 방향을 한 번이라도 저장하면 그 값으로 덮이고, 학생 쪽은
-- 클라이언트 기본값/설정값을 따름. 다만 DB와 클라이언트 기본값이 어긋난
-- 상태를 남기지 않기 위해 실행을 권장.

alter table classes
  alter column spelling_direction set default 'mixed';

-- 참고: 기존 행 일괄 전환(update)은 이 파일에 넣지 않았습니다 — 이미
-- 2026-07-17에 opsSetAllClassesMixed.mjs로 완료됐고, 이후 운영자가 특정 반을
-- 의도적으로 'kr2en' 등으로 바꿨을 수 있으므로 여기서 다시 덮으면 안 됩니다.
