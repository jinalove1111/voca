-- supabase_v3_18_class_renames.sql (2026-08-07)
-- 운영자 지시(2026-08-07, 동일 매핑 2회 전송)로 반 이름 3건 변경 요청 —
-- 그중 실행 가능한 2건만 이 파일이 다룬다(3번째는 대상 반이 아직 없어
-- "이름 변경"이 아니라 "신설" 문제 — 아래 3) 안내 참고).
--
-- 배경: anon 클라이언트에서 UPDATE classes를 직접 시도했으나 v3.11
-- 락다운(supabase_v3_11_lockdown_curriculum_write.sql, curriculum 쓰기
-- anon 권한 회수)에 의해 조용히 차단됨 — 에러 없이 0행 변경으로 끝남
-- (증상만 보면 "반영 안 됨"이라 헷갈리기 쉬움, 원인은 정상 동작하는
-- 락다운). 규칙 8 관례대로 서버 실행 없이 SQL만 준비하고, 실제 실행은
-- 운영자가 Supabase 대시보드 SQL Editor에서 service_role 권한으로 한다.
--
-- 안전성: classes.name 딱 한 컬럼만 바꾼다. 학생(students.class_id)/
-- 유닛(units.class_id)/단어(words → units → class)/배정
-- (student_class_assignments.class_id)은 전부 classes.id(UUID) 기준
-- FK라 이름 문자열과 무관하게 그대로 유지된다 — src/utils/wordLibrary.js
-- renameClass() 헤더 주석("linked by class_id ... a rename never breaks
-- an existing student's class assignment")과 동일한 근거. textbooks.name은
-- classes.name과 별개 테이블/컬럼이라 이 UPDATE로 교재 이름은 전혀
-- 바뀌지 않는다 — 반 이름(사람이 속한 반)과 교재 이름(콘텐츠 묶음)은
-- 이 마이그레이션 이후에도 자연스럽게 분리된 상태를 유지한다.
--
-- 멱등성: 두 UPDATE 모두 id(정확 대상 반) + 현재 name(변경 전 값)을
-- 동시에 WHERE에 건다. 이미 이 SQL이 한 번 실행돼 이름이 이미 바뀌어
-- 있으면 두 번째 실행은 조건 불일치로 0행 처리되어 무해하다(재실행
-- 안전 — 규칙 9와 동일 원칙).
--
-- 롤백: 아래 역방향 UPDATE 2줄(주석 처리)을 그대로 실행하면 원래 이름으로
-- 되돌아간다.
--   update public.classes set name = '고1 6월 학평'
--     where id = '0249067d-dd64-465d-9c27-fb8737e9f4c4' and name = 'MS Advanced Class';
--   update public.classes set name = '고1 능률 민병천'
--     where id = '1693f32b-af23-4364-8d66-d4dc5b20eaa6' and name = 'Presentation 6';
--
-- ⚠ 경고(운영자 인지 필요): 두 번째 변경 이후 "Presentation 6"(이번에
-- 새로 이름 붙는 반)과 기존에 이미 있던 "Presentation 6 -2026"(별개 반,
-- 별개 id)이 동시에 존재하게 된다. 이름이 유사해 관리자 화면에서 혼동될
-- 수 있음 — 운영자가 이 매핑을 2회 동일하게 전송하며 지시했으므로 의도된
-- 이름으로 간주하고 그대로 실행한다. 실제 운영 중 혼동이 발생하면 추후
-- "Presentation 6 -2026" 쪽도 별도로 개명하는 후속 조치를 고려할 것.

-- ── 1) 반 이름 변경 (id 기준 조건부 UPDATE, 멱등) ──
update public.classes set name = 'MS Advanced Class'
where id = '0249067d-dd64-465d-9c27-fb8737e9f4c4' and name = '고1 6월 학평';

update public.classes set name = 'Presentation 6'
where id = '1693f32b-af23-4364-8d66-d4dc5b20eaa6' and name = '고1 능률 민병천';

-- ── 2) 실행 후 검증 SELECT ──
-- select id, name from public.classes
-- where id in ('0249067d-dd64-465d-9c27-fb8737e9f4c4', '1693f32b-af23-4364-8d66-d4dc5b20eaa6');

-- ── 3) 참고: 지시 3번째 항목("중등 예비반 → Pre-Middle School")은 이 파일에서
-- 다루지 않음 ──
-- 현재 classes 테이블에 "중등 예비반"이라는 이름의 반이 존재하지 않는다
-- (실측 확인 필요 시 위 검증 SELECT처럼 name으로 조회). 즉 이건 "이름
-- 변경"이 아니라 "신설" 요구일 가능성이 높다 — 신설이 목적이라면 SQL
-- 없이도 관리자 화면의 "반 만들기" 기능에서 반 이름을 바로 "Pre-Middle
-- School"로 입력해 생성하면 된다(2026-08-06 배포 코드부터 신설 반이
-- 교과서 레이어(textbooks/class_textbooks)에도 자동 등록됨 —
-- supabase_v3_17_textbook_backfill_new_classes.sql 및
-- wordLibrary.js ensureTextbookLayerBackfilled 참고). 참고용으로만 아래
-- insert 예시를 주석 처리해 남긴다 — 이 파일 실행으로는 절대 반영되지
-- 않는다(운영자가 관리자 화면 대신 SQL로 직접 신설을 원할 경우에만,
-- 별도 확인 후 주석 해제):
-- insert into public.classes (name) values ('Pre-Middle School');
