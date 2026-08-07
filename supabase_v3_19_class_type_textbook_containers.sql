-- supabase_v3_19_class_type_textbook_containers.sql (2026-08-08)
-- 목적: "교과서 컨테이너 반이 실반으로 노출되는 것을 구조적으로 차단" —
-- ops/account-cleanup-2026-08-07/class_migration_summary.md §6 제안의 구현.
-- 반(classes)은 역사적으로 교과서 컨테이너를 겸했고, 현재 실DB 13개 반 중
-- 6개가 "반 이름=소유 교과서 이름 1:1"인 순수 교과서 컨테이너다(라이브
-- 실측 완료 — 아래 목록). 이 6개 반에 class_type='textbook'을 명시해,
-- "학생에게 반을 고르게 하는" 화면(현재 StudentSelect.jsx PIN 만들기)이
-- 이름 문자열이 아니라 이 컬럼 값으로 실반/교과서 컨테이너를 구조적으로
-- 구분할 수 있게 한다(src/utils/wordLibrary.js classifyRealClassNames가
-- 이 값을 읽는다).
--
-- ⚠ 판별 기준으로 "교과서 소유 여부" 자체는 절대 쓸 수 없다: 실반
-- "MS Advanced Class"(고1 6월 학평 소유)와 "Presentation 6"(고1 능률
-- 민병천 소유)도 교과서를 소유한다(실측 완료). 이 SQL이 만드는 신호는
-- 오직 classes.class_type='textbook' 명시값뿐이다.
--
-- 신규 컬럼 아님 — GRANT 불필요: classes.class_type 컬럼은 이미 존재하고
-- (값 'regular'/'special'만 쓰이던 상태), classes 테이블 SELECT는 기존에
-- 이미 부여돼 있다(wordLibrary.js refreshWordLibrary가 이미 이 컬럼을
-- select에 포함해 읽고 있음 — 이 파일은 값만 UPDATE, 권한 변경 없음).
--
-- 멱등성(규칙 9): 각 UPDATE는 대상 id + "아직 'textbook'이 아닌 행"
-- 조건을 동시에 건다(is distinct from) — 재실행해도 안전, 0행 처리.
-- UUID 기준(이름 개명에 안전)으로 대상을 지정한다 — "Presentation 6"과
-- "Presentation 6 -2026"처럼 이름이 유사한 반이 동시에 존재하는 상태라
-- (supabase_v3_18_class_renames.sql 경고 참고) 이름 기반 WHERE는 절대
-- 안전하지 않다.
--
-- 코드 배포 순서 무관(규칙 9): 이 SQL 실행 전에는 classes.class_type에
-- 'textbook' 값이 하나도 없으므로 classifyRealClassNames가 구조 신호
-- 부재를 감지해 이름 allowlist로 폴백한다(오늘 StudentSelect.jsx 동작과
-- 100% 동일) — 즉 코드가 이 SQL보다 먼저 배포돼도, 이 SQL이 코드보다
-- 먼저 실행돼도 앱이 절대 깨지지 않는다.
--
-- 실행은 Supabase 대시보드 SQL Editor에서 운영자가 수동으로 한다(규칙 8
-- — 에이전트/CI는 DDL을 직접 실행할 수 없음. 이 파일도 DDL이 아니라 DML
-- (UPDATE)이지만 동일 원칙 적용 — 실행 권한이 없다).

-- ── 1) 교과서 컨테이너 반 6개 → class_type = 'textbook' (id 기준 조건부 UPDATE, 멱등) ──
update public.classes set class_type = 'textbook'
where id = '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512' -- 중2 능률 김기택 (학생 40)
  and class_type is distinct from 'textbook';

update public.classes set class_type = 'textbook'
where id = '9e9ce482-d7c0-4771-8e01-37966ee64d79' -- 중2 YMB 박준원 (32)
  and class_type is distinct from 'textbook';

update public.classes set class_type = 'textbook'
where id = 'dcd497c2-a091-4d22-b0cd-d4e269205a6a' -- Presentation 6 -2026 (68)
  and class_type is distinct from 'textbook';

update public.classes set class_type = 'textbook'
where id = 'e09e147b-7a01-4e58-8bfd-d7205ee8b856' -- 중2 천재 이상기 (19)
  and class_type is distinct from 'textbook';

update public.classes set class_type = 'textbook'
where id = '4f7ad20a-54a4-4dae-aec9-1408527275f5' -- 중2 동아 윤정미 (3)
  and class_type is distinct from 'textbook';

update public.classes set class_type = 'textbook'
where id = '2b53d4eb-7545-4b6a-8f14-86de868ea2e3' -- 중1 동아 윤정미 (1)
  and class_type is distinct from 'textbook';

-- ── 2) 실행 후 검증 SELECT ──
-- select name, class_type from public.classes order by name;
-- 기대 결과: 위 6개 반(중2 능률 김기택/중2 YMB 박준원/Presentation 6 -2026/
-- 중2 천재 이상기/중2 동아 윤정미/중1 동아 윤정미)은 class_type='textbook',
-- 나머지 7개 반 = 실반 2개(MS Advanced Class, Presentation 6) +
-- QA_ 테스트 반 5개, 전부 기존 그대로 'regular'(또는 'special').
-- 참고: 'Pre-Middle School'은 아직 미생성(생성 승인 대기) — 생성되면
-- 'regular'로 자동 실반 취급.

-- ── 3) 롤백(같은 6 UUID를 'regular'로 되돌림) ──
-- update public.classes set class_type = 'regular'
--   where id in (
--     '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512',
--     '9e9ce482-d7c0-4771-8e01-37966ee64d79',
--     'dcd497c2-a091-4d22-b0cd-d4e269205a6a',
--     'e09e147b-7a01-4e58-8bfd-d7205ee8b856',
--     '4f7ad20a-54a4-4dae-aec9-1408527275f5',
--     '2b53d4eb-7545-4b6a-8f14-86de868ea2e3'
--   ) and class_type = 'textbook';
