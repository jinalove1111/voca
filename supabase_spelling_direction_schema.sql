-- 쓰기 시험(Spelling Test) 방향(한글->영어 / 영어->한글 / 랜덤) 반별 설정 컬럼 추가.
-- Supabase 대시보드 SQL Editor에서 실행해주세요.
--
-- 기본값을 기존 동작 그대로인 'kr2en'(한글 뜻 제시 -> 영어 철자 입력)으로
-- 잡아서, 이 SQL을 실행해도 이미 쓰기 시험을 켜둔 반들의 동작은 전혀
-- 바뀌지 않습니다 — 관리자가 반별로 직접 "영어->한글" 또는 "랜덤"으로
-- 바꿔야만 새 방향이 나타납니다 (안정성 우선 원칙, supabase_spelling_test_
-- schema.sql과 동일한 패턴).
--
-- 이 SQL을 아직 실행하지 않았어도 앱은 절대 깨지지 않습니다 — src/utils/
-- wordLibrary.js의 refreshClassSettings()/setClassSettings()가 이 컬럼이
-- 없는 상태를 감지해 자동으로 폴백 처리합니다.

alter table classes
  add column if not exists spelling_direction text not null default 'kr2en';

-- 허용값은 애플리케이션 레벨(wordLibrary.js VALID_SPELLING_DIRECTIONS)에서
-- 'kr2en' | 'en2kr' | 'random' 만 검증·저장합니다. DB 레벨 CHECK 제약은
-- 과도한 설계로 보아 넣지 않았습니다(운영 규모상 관리자 화면 외 경로로
-- 이 컬럼에 직접 쓰는 코드가 없음).
