-- sql_migrations/grammar_points_seed_20260809.sql
-- ============================================================================
-- ★ 실행 금지 — 운영자 승인 후 Supabase SQL Editor에서 수동 실행 (2026-08-09 준비)
--
-- grammar_points 시드 — 중학 영어 빈출 문법 포인트 20개.
-- 배경: v3_13이 테이블만 만들었고(현재 0행) 예문 탭/본문 가져오기의 "문법
-- 포인트" dropdown이 비어 있다. 라벨 체계는 시험 대비 관점의 관례적 분류.
--
-- 안전성:
--   - INSERT만(UPDATE/DELETE 없음), code UNIQUE + on conflict do nothing —
--     멱등(재실행 무해), 기존 행 무접촉.
--   - grp = dropdown 그룹핑(listGrammarPoints가 grp 순 정렬), grade_band =
--     대상 학년대(정보성).
--   - 항목 추가/수정은 운영자가 자유롭게 — append 전용 테이블(v3_13 주석).
-- 롤백: 이 시드가 넣은 행만 code로 특정 삭제 가능(파일 하단 주석).
-- ============================================================================

insert into grammar_points (code, label, grp, grade_band) values
  ('tense_present_perfect',  '현재완료 (have + p.p.)',            '시제',       '중2-중3'),
  ('tense_past_progressive', '과거진행 (was/were -ing)',          '시제',       '중1-중2'),
  ('modal_should_must',      '조동사 should/must/have to',        '조동사',     '중1-중3'),
  ('modal_would_could',      '조동사 would/could (공손/추측)',    '조동사',     '중2-중3'),
  ('to_infinitive_noun',     'to부정사 명사적 용법',              '부정사/동명사', '중1-중3'),
  ('to_infinitive_adv',      'to부정사 부사적 용법 (목적/감정)',  '부정사/동명사', '중2-중3'),
  ('gerund_subject_object',  '동명사 (주어/목적어)',              '부정사/동명사', '중1-중3'),
  ('participle_present',     '현재분사/분사 수식',                '분사',       '중2-중3'),
  ('participle_past',        '과거분사/분사 수식',                '분사',       '중2-중3'),
  ('passive_voice',          '수동태 (be + p.p.)',                '수동태',     '중2-중3'),
  ('relative_pronoun',       '관계대명사 who/which/that',         '관계사',     '중2-중3'),
  ('relative_adverb',        '관계부사 when/where/why',           '관계사',     '중3'),
  ('comparative',            '비교급 (-er / more ~)',             '비교',       '중1-중2'),
  ('superlative',            '최상급 (the -est / most ~)',        '비교',       '중1-중2'),
  ('conjunction_that',       '접속사 that절',                     '접속사',     '중2-중3'),
  ('conjunction_time_cond',  '시간/조건 접속사 (when/if/while)',  '접속사',     '중1-중3'),
  ('indirect_question',      '간접의문문',                        '문장 구조',  '중2-중3'),
  ('svoc_5th_pattern',       '5형식 (make/keep + 목적어 + 보어)', '문장 구조',  '중2-중3'),
  ('it_that_emphasis',       'It ~ that 강조/가주어',             '문장 구조',  '중3'),
  ('phrasal_verb',           '구동사 (phrasal verb)',             '어휘 문법',  '중1-중3')
on conflict (code) do nothing;

-- 검증(SELECT 전용):
-- select grp, count(*) from grammar_points group by grp order by grp;
-- 기대: 시드 후 총 20행(기존 행이 있었다면 code 충돌분만큼 적게 추가).

-- 롤백(필요 시에만 — 이 시드가 넣은 code만 특정, 다른 행 무접촉):
-- delete from grammar_points where code in (
--   'tense_present_perfect','tense_past_progressive','modal_should_must',
--   'modal_would_could','to_infinitive_noun','to_infinitive_adv',
--   'gerund_subject_object','participle_present','participle_past',
--   'passive_voice','relative_pronoun','relative_adverb','comparative',
--   'superlative','conjunction_that','conjunction_time_cond',
--   'indirect_question','svoc_5th_pattern','it_that_emphasis','phrasal_verb'
-- ) and id not in (select distinct grammar_point_id from examples where grammar_point_id is not null);
-- ※ 예문이 이미 연결된 포인트는 롤백에서 자동 제외(마지막 and 조건).
