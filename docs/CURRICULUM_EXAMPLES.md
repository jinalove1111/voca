# CURRICULUM_EXAMPLES — 본문 예문/핵심 표현 시스템 (운영 기준서)

_2026-08-10 작성(88차). 이 문서는 "본문 가져오기 → 예문 → 본문 핵심 표현 →
학생 노출" 전체 파이프라인의 현재 사실(what is)과 운영 방법을 담는다.
세부 이력은 handoff.md 74~87차._

## 1. 제품 철학 (운영자 확정, 2026-08-09)

- 학생은 결국 **교과서 본문 자체**를 외워야 한다. 예문 시스템의 목적은
  새 예문 생산이 아니라 **본문을 단어 단계에서 미리, 짧게, 반복 노출**하는 것.
- **SOURCE TEXT FIRST**: 본문 원문 > 교사 작성 > 승인 AI. AI가 임의로
  문장을 만들거나 바꾸는 일은 없다.
- **본문 핵심 표현(practice_sentence)** = source_sentence의 **연속
  substring**만 허용. 새 문장/의역/단어 변형 전면 금지 —
  `source.includes(chunk) === true`가 저장 계층에서 강제된다.

## 2. 데이터 모델 (examples 테이블 — 전부 적용 완료)

| 컬럼 | 역할 |
|---|---|
| english_sentence | **본문 원문(source)** — 절대 무수정 |
| practice_sentence | 본문 핵심 표현(원문 substring) — null이면 학생 화면이 원문 폴백 |
| korean_translation | 원문 해석(이중 언어 본문 자동 짝짓기로 채워짐) |
| source | teacher/import/rule/ai — import=본문 |
| source_meta | provenance jsonb {origin, sentence_index} |
| word_id/unit_id/textbook_id | FK — 학교/학년/출판사는 textbook 경유 |

## 3. 관리자 파이프라인 (본문 가져오기)

학교·학년→교재→Unit 선택 → 본문 붙여넣기(영어 줄+한국어 해석 줄 형식 지원)
→ [본문 분석 및 단어 매칭] →
1) 문장 분리(원문 보존, 약어/소수점 보호) + 영↔한 자동 1:1 짝짓기(문장 수
   일치 시만 — 불일치는 미매칭 표시, 지어내지 않음)
2) Unit 단어 whole-word 매칭 — EXACT / SAFE_INFLECTION(규칙+불규칙 사전,
   검토 필요) / AMBIGUOUS(leaves=leaf/leave — 사람 판단) / NOT_FOUND
3) EXACT 후보마다 **핵심 표현 자동 추출**(extractKeyChunk — 좌 전치사구
   관용/우 of·for 보어, 장소·시간 꼬리 차단, bare-prep 시작 회피, 3~10단어,
   짧은 문장은 전문) + 품질 등급(HIGH/MEDIUM/LOW — LOW는 자동 승인 금지,
   검토 배지)
4) 요약 칩(단어/문장/정확 일치/형태 변화/중의적/미발견/중복/해석 매칭/승인
   예정) → 문장별 체크 승인 → 저장(draft→pending→approved 표준 전이)
- 중복(같은 교재+Unit+단어+문장 정규화)은 표시·차단. 미발견 단어는 단어
  자산 재사용 후보(⚙️ 규칙 생성)로만 검수함(pending)에 보낼 수 있다.

## 4. 학생 노출 (플래그 뒤 — 기본 OFF)

- `curriculumExamplesStudentUI`(기기 로컬 플래그) ON일 때: study/종합 모드에
  "📚 교과서 예문 학습" 단계 — **대표 1개만**(같은 단어 여러 예문 중 유닛
  일치 ≫ 핵심 표현 품질 ≫ 소스 랭킹, 관리자 화면과 동일 로직), 기본
  표시/TTS/빈칸은 핵심 표현, **"📖 본문 보기"**로 원문+해석 확인.
- 전체 학생 공개 = features.js 기본값 true + 배포(운영자 승인 사안).

## 5. 현재 데이터 상태 (2026-08-09 실측)

- 예문 5행(중2 능률 김기택 Unit 6 — invitation 1/independence 4), 전부
  approved+해석 연결+핵심 표현 교체 완료(exact_substring 5/5):
  at the invitation of the Korean government / for the independence of
  Korea / the Korean independence movement / shouting for Korean
  independence / fight for Korean independence
- 본문 전문은 저장하지 않는다 — 승인된 예문 문장만 남는다(재분석 시 같은
  본문을 다시 붙여넣으면 중복은 자동 차단되고 새 단어만 추가된다).

## 6. 남은 것 / 운영자 액션

- Unit 6 전체 40단어 실전 검증: **본문 전문 필요**(저장 안 되므로) — 본문을
  다시 붙여넣어 재분석하면 자동으로 커버리지 확대. (BLOCKED: 본문 제공)
- grammar_points 시드(sql_migrations/grammar_points_seed_20260809.sql, 승인 대기)
- 출판사/학년 메타(publisher_grade_metadata_proposal_20260809.sql, 이름 확정 대기)
- 학생 플래그 전체 ON(승인 대기)

## 7. 테스트

`npm run verify:examples` — 문장 분리/이중 언어 짝짓기/매칭 4단계/추출
스펙·품질/substring 강제/대표 선정/중복/승인 상태머신/라이브 CRUD 왕복.
`node scripts/testExamplePriorityMock.mjs` — 학생 우선순위 mock.
