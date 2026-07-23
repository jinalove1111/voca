-- Paul Easy Voca v3.10 — 성능 감사 후속(docs/audit/2026-07-24-performance-db.md
-- §5) 인덱스 초안. 아직 실행하지 않았습니다 — 운영자가 Supabase 대시보드
-- SQL Editor에서 직접 실행해주세요(헌법 규칙 8: 에이전트는 DDL을 직접
-- 실행할 수 없음).
--
-- 실행 전 확인 권장: 이 저장소에는 students/classes/units/words(핵심
-- 4테이블) 원본 DDL이 없어(DATABASE.md "핵심 4테이블 — 저장소에 DDL 없음"
-- 섹션 참고) 이 세 FK 컬럼에 이미 인덱스가 있는지 코드만으로 확인할 수
-- 없습니다. `create index if not exists`라 이미 있어도 에러 없이 no-op
-- 이지만, 궁금하면 실행 전 Supabase 대시보드 Table Editor(또는
-- `select indexname from pg_indexes where tablename in ('words','units',
-- 'students')`)로 먼저 확인해도 됩니다.
--
-- 이 SQL을 실행하지 않아도 앱은 절대 깨지지 않습니다 — 순수 인덱스
-- 추가라 조회 결과/쓰기 동작 어느 쪽도 바꾸지 않고, 해당 컬럼으로 필터링
-- 하는 쿼리(아래 각 인덱스 주석 참고)의 응답 속도만 개선합니다. 컬럼
-- 자체가 이미 존재하는 게 확인된 컬럼들만 포함했습니다(DATABASE.md
-- 역추적 표 기준 — words.unit_id/units.class_id/students.class_id 전부
-- "(원본)"부터 있던 컬럼).

-- 1) words.unit_id — supabase_v3_1_textbooks.sql:76의 idx_units_textbook과
--    같은 성격(FK 컬럼 인덱스). 현재 호출부: wordLibrary.js setClassWords()
--    의 .eq('unit_id', unit.id) select/delete(관리자 엑셀/PDF 업로드마다
--    실행) — 감사 문서 §5 참고.
create index if not exists idx_words_unit_id on words (unit_id);

-- 2) units.class_id — 지금은 refreshWordLibrary()가 전체 units를 가져와
--    애플리케이션 레벨에서 매핑하므로(감사 문서 §1) 당장 이 인덱스가
--    체감 효과를 내는 쿼리는 없지만, §1의 근본 수정(반 단위 서버측 필터링)
--    을 적용하는 순간부터 이 인덱스가 필수가 된다 — 선제적으로 추가.
create index if not exists idx_units_class_id on units (class_id);

-- 3) students.class_id — api/compute-word-king.js:57의
--    .eq('class_id', classId) 등 반 단위 학생 조회가 이미 이 컬럼으로
--    직접 필터링 중. 2000명 규모에서 인덱스 없이는 반별 조회마다 전체
--    students 테이블 순차 스캔 비용이 붙는다(감사 문서 §5).
create index if not exists idx_students_class_id on students (class_id);

-- 참고: student_progress/student_daily_progress/word_status/entrance_tests/
-- entrance_test_results/xp_ledger/word_king_history/spelling_review_queue/
-- writing_answer_statistics/spelling_ai_grading_cache 등 기능별 테이블은
-- 이미 각자의 v1.x~v3.x 마이그레이션 파일에서 필요한 인덱스를 갖추고
-- 있음(DATABASE.md/각 SQL 파일 참고) — 이번 감사에서 추가로 필요하다고
-- 판단한 인덱스는 없음.
