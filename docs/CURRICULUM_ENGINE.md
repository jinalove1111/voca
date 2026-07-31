# Curriculum Engine 아키텍처 (v1.0 — 검토용 설계안)

_작성: 2026-07-31. 상태: **설계 전용 — 코드/SQL 미작성, 승인 대기.**
승인 후 Phase 0부터 구현 시작. 근거 선행 문서: `docs/reading/01~10`,
`docs/research/lesson-analyzer-design.md`, `docs/research/memory-engine.md`,
`docs/research/content-pipeline.md`, ADR 0004, `supabase_v3_1/v3_3/v3_4`._

## 0. 승인된 전제 (운영자 결정)

| 결정 | 내용 |
|---|---|
| ✅ 학생 노출 | 학생은 **approved 상태의 예문만** 학습 플로우에서 본다 |
| ✅ publishers 정규화 | `publishers` 테이블을 Phase 0에 생성 |
| ⏸ 숙제 일반화 | 보류 — `daily_assignments` 무변경 (ADR 0004-D 재심은 별도 안건) |

**안전 제약(전 Phase 공통)**: 배포 금지 · 인증/보상/정원/숙제 로직 무변경 ·
프로덕션 SQL/Supabase 무접촉 · 미배포 상태인 `admin-content-write` Edge
Function 무변경 · DDL은 `supabase_v{n}_*.sql` 파일로만 준비하고 실행은
운영자 수동(저장소 헌법 규칙 8) · 클라이언트는 테이블/컬럼 부재 시 안전
폴백(규칙 9).

## 1. 왜 "엔진"인가 — 핵심 원칙

### 1.1 콘텐츠 단일 원천 (Single Source of Truth)

**학습 콘텐츠는 절대 복제하지 않는다.** 예문 1건은 `examples` 테이블의
1행이고, 모든 학습 모드는 그 행의 `id`를 참조한다:

```
                    ┌──────────────────────┐
                    │  examples (1 row)    │
                    │  id · 문장 · 번역 ·   │
                    │  문법 · 난이도 · 승인  │
                    └──────────┬───────────┘
      ┌──────────┬──────────┬──┴───────┬──────────┬─────────┐
      ▼          ▼          ▼          ▼          ▼         ▼
  Word Detail  예문 학습   빈칸 연습    듣기      말하기     복습/퀴즈/시험
  (표시)      (표시+해설)  (런타임     (TTS로    (섀도잉    (조립 규칙이
                          파생 생성)   문장 재생)  대상)     id를 선택)
```

- **파생물은 저장하지 않는다.** 빈칸 문제(`____` 프롬프트)는
  `makeFillBlank(english_sentence, target_word)`로, 듣기는 TTS로, 섀도잉
  대상은 원문으로 — 전부 **런타임 결정론적 계산**이다. 그래서 교사가 문장을
  한 번 수정하면 8개 학습 모드 전부에 즉시 반영되고, 불일치가 구조적으로
  불가능하다.
- 기존 검증된 순수 엔진(`sentenceLearning.js`의 `pickBlank`,
  `shuffleDeterministic` 등)을 재구현하지 않고 재사용한다(선행 설계 확정
  사항).

### 1.2 기존 스택 위 확장, 재작성 금지

커리큘럼 계층의 하부 절반은 이미 프로덕션이다: `classes(반)` →
`class_textbooks` → `textbooks` → `units` → `words` / `passages` →
`passage_sentences`(v3.1/v3.3/v3.4 실행 완료). 엔진은 이 위에 빠진 상부
구조(출판사/학년 축, 문법 엔티티, 예문 모듈, 출처·승인 워크플로우)를
**additive하게** 얹는다. Reading 모듈의 "reading_passages"는 새 테이블이
아니라 **기존 `passages`/`passage_sentences`가 그 자체로 엔진의 Reading
모듈**이다(중복 금지 원칙의 첫 적용).

### 1.3 3-평면 구조

```
③ 전달 평면   숙제 배정(보류) · 복습 스케줄 · 학생 플로우 어댑터 · 퀴즈/시험 조립
② 콘텐츠 평면  Words · Examples · Grammar · Reading · Listening · Speaking · Writing
① 구조 평면   Publisher → Grade → Textbook → Unit(=Lesson)
     ⇅ 횡단: 출처·승인 평면 (teacher/import/rule/ai → draft→pending→approved)
```

## 2. ER 다이어그램

```
publishers ─────────┐ (Phase 0 신규)
 id, name UNIQUE    │
                    ▼
grades          textbooks (기존 + additive 컬럼)
 id, name,       id, name UNIQUE, publisher_name(호환 유지),
 sort_order      + publisher_id FK→publishers (NULL 허용)
 (Phase 0 신규)  + grade_id FK→grades (NULL 허용)
      ▲          + level text, book_order int
      └──────────┘        │
                          ▼
classes ── class_textbooks┘   units (기존 + additive 컬럼)
 (반 = 사람 그룹, 무변경)       id, textbook_id, class_id, name
                              + position int, lesson_no int, objectives text
                              ※ lesson = unit (별도 lessons 테이블 없음 — §9 트레이드오프)
              ┌───────────────┼───────────────────┐
              ▼               ▼                   ▼
        words (기존)     passages (기존)      examples (Phase 0 신규)
         unit_id,         unit_id, title,      id uuid PK
         word, meaning,   position             unit_id FK→units (NULL 허용*)
         position, …        │                  textbook_id FK→textbooks (NULL 허용*)
              ▲             ▼                  word_id FK→words (NULL 허용)
              │       passage_sentences        target_word text NOT NULL (lower 정규화)
              │        (기존: is_key_sentence, english_sentence text NOT NULL
              │         importance_level,      korean_translation text
              │         grammar_point,         grammar_point_id FK→grammar_points (NULL)
              │         chunks)                difficulty int CHECK 1..5 DEFAULT 1
              │             │                  ── 출처·승인 표준 블록 ──
              └── sentence_words (기존 조인)    source CHECK('teacher','import','rule','ai')
                                               approval_status CHECK('draft','pending',
                                                 'approved','rejected') DEFAULT 'draft'
grammar_points (Phase 0 신규)                   created_by, approved_by, approved_at
 id, code UNIQUE, label(≤35자),                ai_model text, ai_meta jsonb (예약 — 미구현)
 grp(12분류), grade_band                       created_at, updated_at
 ← docs/reading/05의 120개 라벨 멱등 시드
unit_grammar_points (Phase 0 신규 조인)
 UNIQUE(unit_id, grammar_point_id)

[후속 Phase 예약 — 스키마는 해당 Phase에서 파일 작성]
listening_items · speaking_prompts · writing_prompts · reading_questions
quiz_blueprints · exam_blueprints · word_review_schedule(Leitner, memory-engine.md)
 → 전부 unit_id FK + 동일한 출처·승인 표준 블록을 갖는 "콘텐츠 모듈 계약" 준수
```

\* `unit_id`/`textbook_id` NULL 허용 이유: 특정 유닛에 정렬되지 않은 범용
예문 풀(레벨/학년만 매칭)을 허용하기 위함. 유닛 정렬 예문이 항상 우선.

**인덱스(Phase 0)**: `lower(target_word)` / `(unit_id, approval_status)` /
`(textbook_id, approval_status)` / `approval_status`.

**RLS**: 생성 시점에는 현행 프로덕션 현실(anon 개방, v3.4 관례)과 동일하게
시작하고, v3.11/v3.12 계열 락다운 정책을 **주석 블록**으로 동봉해 락다운
배포 완료 시 같은 방식으로 합류한다. 트리거 없음(저장소 관례), 파괴적 구문
0, 멱등(IF NOT EXISTS / pg_policies 검사), 코드보다 먼저·나중 어느 순서로
실행돼도 안전(규칙 9).

## 3. 승인 워크플로우 (교사 콘텐츠 · AI 콘텐츠 공존)

```
                 ┌────────── 교사 직접 작성 ──────────┐
                 │      (즉시 승인 가능 — 1인 학원)     │
   teacher ──────┤                                    ▼
   import  ──────┼──→ draft ──→ pending ──→ ┌─ approved ─→ 학생 노출
   rule    ──────┤       ▲          │       └─ rejected
   ai(미래) ─────┘       └── 수정 후 재검수 ←────┘ (회수: approved→rejected)
```

- **학생 노출 = `approval_status='approved'`만.** UI가 아니라 데이터
  계층(`fetchApprovedExamplesForWords`)에서 하드코딩으로 강제.
- **AI/규칙 초안은 교사 행을 절대 덮어쓰지 않는다** — 생성기는 언제나 새
  draft 행을 만든다. upsert는 임포터의 자연키 경로(01 스펙)에만 존재.
- 전이 규칙은 순수 함수 `canTransition(from, to)`로 중앙화: draft→pending,
  pending→approved|rejected, rejected→pending, approved→rejected.
- 관리 화면은 출처 배지(👩‍🏫/📥/⚙️/🤖)를 상시 표시. DB에는 사실만
  저장(승인자/시각) — 감정·평가 텍스트는 저장하지 않는다(제품 불변식).

## 4. AI-Ready 인터페이스 (설계만 — 호출 코드 없음)

```js
// src/utils/curriculum/generatorContract.js — 순수 계약. 모든 생성기가 구현.
generateCandidateExamples(context)
  // context: { unitId?, textbookId?, targetWords?, grammarPointIds?, difficulty? }
  // → { ok, candidates: [{ targetWord, englishSentence, koreanTranslation,
  //      grammarPointId?, difficulty, rationale }] }
  // Phase 0~4: { ok:false, reason:'not_implemented' } (규칙 기반 생성기가 먼저 구현 가능)
reviewCandidate(candidate)
  // 순수 규칙 검증: 필수 필드 · "문장이 target_word를 whole-word 포함" 불변식 ·
  // 금칙 톤(처벌/비교/압박 언어 — docs/reading/07 기준) → { ok, errors[] }
approveExample(id)   // pending → approved (교사 액션 전용)
publishExample(id)   // approveExample의 별칭 — 외부 노출 이름 통일용
```

**AI가 DB 구조 변경 없이 접합되는 이유**: ① `source='ai'`와
`ai_model`/`ai_meta` 컬럼이 Phase 0 스키마에 예약돼 있고 ② 생성기 계약에는
`approved`로 전이하는 함수가 없어서 auto-publish가 **구조적으로 불가능**하며
③ AI 구현체는 기존 AI 프록시/Supabase Edge Function으로 배선(신규 Vercel
함수 0개 — 12/12 한도)하고 기존 `ai_usage_daily` 캡·캐시에 종속된다.

## 5. 폴더 구조

```
supabase_v3_13_curriculum_engine_phase0.sql   (신규 — 파일만, 운영자 실행)

src/learning/                        (신규 — Learning Engine, §13)
  engine/LearningEngine.jsx          제네릭 러너 1개 (모드별 페이지 없음)
  engine/registry.js                 MODES 레지스트리 (모드 = 설정 객체)
  engine/primitives/                 Show · AudioPlay · TextInput · ChoiceGrid ·
                                     Record · Write  (상호작용 프리미티브 6종)
  adapters/learningItem.js           순수: fromWord/fromExample/fromSentence 정규화
  modes/*.js                         순수 모드 설정 (prepare/grade — JSX 없음)

src/utils/curriculum/                (신규 — 순수/IO 분리, readingModel/Api 관례)
  curriculumModel.js     순수: validateExampleFields · canTransition ·
                         matchesFilters · 계층 탐색 헬퍼 (import 0개, 하네스 검증)
  generatorContract.js   순수: §4 계약 + reviewCandidate
  curriculumApi.js       IO: publishers/grades/textbook·unit 메타 CRUD (폴백 포함)
  exampleLibrary.js      IO: 예문 모듈 데이터 계층 (§6)
  grammarApi.js          IO: 문법 분류 조회/유닛 매핑

src/components/admin/               (신규 컴포넌트는 admin/ 아래)
  CurriculumHub.jsx      관리자 탭 진입점 (AdminScreen 탭 배열 +1줄)
  CurriculumTree.jsx     출판사→학년→교재→유닛 구조 탐색/편집
  ExampleManager.jsx     예문 CRUD/검색/필터/승인 (프로토타입 2af1603 UI 승계)
  ApprovalQueue.jsx      타입 불문 통합 검수 인박스
  GeneratorPanel.jsx     "초안 생성" 자리 (규칙 기반 먼저, AI는 후일 플러그인)

src/components/          (기존 파일 최소 수정)
  WordDetail.jsx         조건부 예문 단계 삽입 (§8)
  App.jsx                승인 예문 prefetch 맵 (~6줄)
  GuidedSession.jsx      prop 통과 (1줄)

tests/harness/runExamples.mjs  + package.json "verify:examples" + registry 등록
```

## 6. API 설계 (전부 클라이언트 JS — 신규 서버리스 0개)

```js
// exampleLibrary.js — 콘텐츠 모듈 계약의 표준형 (후속 모듈이 같은 형태 복제)
// 조회: 절대 throw하지 않음, 테이블 부재 → { rows:[], featureDisabled:true }
listExamples(filters, { limit, offset })
  // filters: { publisherId, gradeId, textbookId, unitId, grammarPointId,
  //            targetWord, approvalStatus }
fetchApprovedExamplesForWords(wordTexts)   // → { [단어lower]: example } — 학생 유일 소비 함수
// 쓰기: 관리자 전용. adminPin은 미래 락다운 합류용 예약 인자(현재 미사용,
//        wordLibrary.js 듀얼패스 관례) — 락다운 시 함수 내부만 교체, 호출부 무변경
createExample(fields, adminPin?)           // validateExampleFields 선검증
updateExample(id, fields, adminPin?)
deleteExample(id, adminPin?)
setApprovalStatus(id, next, adminPin?)     // canTransition 검증
approveExample(id, adminPin?) / rejectExample(id, adminPin?) / publishExample(id, adminPin?)
// 테이블 부재 시 쓰기: 명확한 한국어 에러("supabase_v3_13 실행 필요") throw
```

데이터 흐름:

```
관리자:  ExampleManager ─→ exampleLibrary(쓰기) ─→ Supabase(anon, 현행 신뢰 모델)
학생:    App.jsx 마운트 시 fetchApprovedExamplesForWords(오늘 단어들) 1회
         ─→ props ─→ WordDetail (실패/부재 시 {} → 기능 비가시, 플로우 무영향)
```

## 7. 관리자 플로우

1. `AdminScreen` PIN 게이트(무변경) → "📚 커리큘럼" 탭 → `CurriculumHub`.
2. `CurriculumTree`에서 출판사/학년/교재/유닛 선택 (또는 미선택 = 전체).
3. `ExampleManager`: 필터 바(출판사·학년·교재·차시·유닛·문법·단어 검색) →
   목록(출처 배지 + 상태 칩) → 행 액션(수정/삭제/전이 버튼은
   `canTransition` 결과로만 렌더) → 생성 폼.
4. `ApprovalQueue`: pending 전체를 한 화면에서 승인/반려.
5. 테이블 미생성 시: 배너("supabase_v3_13 실행 후 사용 가능")만 표시 —
   마이그레이션 전 배포돼도 안전.

## 8. 학생 플로우

```
단어 → 뜻 → 발음 → [승인 예문 제시 → 빈칸 연습 → 듣기(TTS) → 섀도잉 → 쓰기] → 다음 단어
                   └────────── 승인 예문이 있을 때만 삽입되는 단일 단계 ──────────┘
```

- `WordDetail.buildSteps`에 조건부 스텝 1개 추가. `textbookExamples` prop
  기본값 `null` → **STEPS 계산이 현행과 바이트 단위 동일** (무변경 증명).
- 예문은 `useMemo(..., [word.id])`로 단어당 동결 — 늦게 도착한 데이터가
  진행 중 STEPS를 바꾸지 않음 (기존 실사고 패턴 방어).
- 내부 서브 단계: 제시 → 빈칸(`makeFillBlank` 런타임 파생,
  `autoComplete="off"` 관례) → 듣기(`playWordAudio` TTS 폴백) →
  섀도잉(기존 `SpeechBtn` 재사용) → 쓰기(문장 따라 쓰기 — 채점 없음,
  `checkAnswer` 자가 확인만).
- **보상 격리**: 이 단계는 `onMark*`/`on*Answer` 콜백을 하나도 받지 않는다.
  별/XP/정원/퀴즈 카운터 무접촉 (star-idempotency 설계 참조 주석 의무).
- quiz/write(평가) 모드에는 삽입하지 않는다 — 시험 흐름 타이밍 불변.

## 9. 트레이드오프 (검토 시 판단 요청 항목 포함)

| 결정 | 채택안 | 기각안과 이유 |
|---|---|---|
| lessons 테이블 | **별도 테이블 없음** — `units.lesson_no/position` 메타로 표현 | 요구 목록에는 lessons가 있으나, `docs/reading/01`이 "lesson = units 행"으로 확정했고 기존 데이터/15+ 호출부가 units 기준. 별도 테이블은 이중 계층·마이그레이션 리스크만 추가. **이 항목만 승인 시 명시 확인 요청** |
| approved 표현 | boolean이 아닌 **approval_status enum** | 요구사항의 Approve/Reject 두 액션 + 재검수 흐름은 상태 3개 이상을 요구. boolean이면 reject·재검수·회수를 표현 못 함 |
| 파생 콘텐츠 | **런타임 결정론 계산** (저장 안 함) | 모드별 사전 생성·저장은 교사 수정 시 불일치(중복 금지 원칙 위반)와 동기화 코드를 낳음 |
| examples 정렬 위치 | unit_id·textbook_id **모두 NULL 허용 FK** | NOT NULL 강제는 범용 예문 풀(학년/레벨 매칭)을 막음. 유닛 정렬이 항상 우선 |
| grades 표현 | **정규화 테이블** (승인 사항) + textbooks.grade_id | 자유 텍스트 유지안은 필터 신뢰성이 낮음. 기존 `publisher_name` 텍스트는 삭제하지 않고 FK를 나란히(호환) |
| RLS 초기값 | 현행 anon 개방 + **락다운 주석 동봉** | 즉시 락다운은 미배포 Edge Function에 의존해 dead-end (v3.11 대기 중). 락다운 배포 후 합류 |
| reading_passages | 기존 `passages` 재사용 | 신규 테이블은 중복 금지 원칙 정면 위반 |

## 10. 리스크

| 리스크 | 완화 |
|---|---|
| 학습 중 STEPS 변형 → 단계 상태 붕괴(과거 회귀 이력) | `useMemo([word.id])` 동결 + `key={word.id}` + 평가 모드 미삽입 |
| 의도치 않은 별/보상 지급(이중 지급 사고 이력) | 보상 콜백 0개 수신 + persistence/quiz 회귀 재실행 게이트 |
| prefetch 실패·테이블 부재가 학생 플로우 저해 | 조회 절대 throw 금지, `{}` 폴백 → 기능 비가시 |
| SQL·코드 배포 순서 역전 | 양방향 안전(규칙 9): 테이블만 있으면 무해, 코드만 있으면 폴백 |
| v3.11/v3.12 배포 대기 중인 보안 작업과 간섭 | Edge Function 무변경, 새 테이블은 현행 신뢰 모델, 락다운은 주석 동봉 |
| 복습 동선 파편화 악화(이미 4종 비호환) | Phase 0는 복습에 손대지 않음; Review Engine(후속)이 **단일 진입점으로 통합**하는 설계를 전제 |
| 동시 세션 파일 충돌(규칙 16, 55f0c86 사고) | 신규 파일 위주, 공유 파일 diff는 AdminScreen 1줄·App ~6줄·WordDetail additive |
| Vercel 함수 12/12 한도 | 신규 서버리스 0개 — 전부 클라이언트 계층/기존 인프라 |

## 11. 구현 로드맵 (승인 후)

| Phase | 범위 | 산출물 |
|---|---|---|
| **0. Core** | publishers·grades·grammar_points(+시드)·units 메타·examples + exampleLibrary + ExampleManager/ApprovalQueue + **Learning Engine 코어(러너+레지스트리+프리미티브 6종+어댑터, §13)** + 학생 조건부 단계 = 5-스텝 플랜(승인 예문 노출 ✓) + verify:examples·verify:learning-engine | SQL 파일 1 + 코드 + 하네스, 소커밋 ~10개 |
| **1. Reading** | 기존 passages 스택을 엔진 편입: Importer(01 스펙)·붙여넣기 탭·Lesson Analyzer 규칙 초안 → ApprovalQueue | 임포터 스크립트 + 관리 탭 |
| **2. Listening** | listening_items (TTS 기반, 무료 우선) | SQL + 모듈 |
| **3. Speaking** | speaking_prompts (기존 녹음 인프라 재사용) | SQL + 모듈 |
| **4. Writing** | writing_prompts (기존 채점 파이프라인 재사용) | SQL + 모듈 |
| **5. AI Generator** | generatorContract에 AI 구현체 플러그인(캡·캐시 종속, human-in-the-loop 유지) | Edge Function 배선 |

각 Phase 공통 게이트: `npm run build` + 해당 도메인 `verify:*` + 학생 플로우
접촉 시 student/quiz/daily-ritual/persistence 회귀 + handoff.md append +
`.ai-status/` 체크포인트. 학생 노출 신규 기능은 플래그 뒤 출시(관례).

## 12. 마이그레이션 계획

1. **Phase 0 SQL 1파일**: `supabase_v3_13_curriculum_engine_phase0.sql` —
   publishers/grades/grammar_points(+120 라벨 시드)/unit_grammar_points/
   examples 생성 + textbooks·units에 `ADD COLUMN IF NOT EXISTS` + 인덱스 +
   개방 RLS + GRANT + 주석 락다운 블록 + 하단 검증 쿼리. 전부 멱등,
   파괴 구문 0.
2. **실행 주체**: 운영자만, Supabase 대시보드 SQL Editor (규칙 8). dry-run
   개념 없음(순수 additive라 불필요), 실행 전후 앱 무중단.
3. **롤백**: additive 전용이므로 "롤백 = 신규 테이블 미사용" — 클라이언트가
   자동 폴백. 물리 삭제는 하지 않는다.
4. **기존 데이터 이전**: `words.example_text`는 삭제·이전하지 않고 폴백으로
   유지. 선택적으로 Phase 1 임포터가 기존 예문을 examples로 **복사가 아닌
   승격**(원본 컬럼은 read-only 폴백으로 남김)하는 옵션 제공 — 운영자 선택.
5. **후속 Phase**: 모듈당 SQL 1파일씩(`v3_14+`), 동일 규칙.

## 13. Learning Engine — 재사용 가능한 학습 실행 계층

### 13.1 위치와 원칙

Curriculum Engine이 **무엇을(콘텐츠)** 공급하면 Learning Engine은
**어떻게(모드 실행)** 를 담당한다. §1.1의 "콘텐츠 중복 금지"와 대칭인
원칙: **학습 모드 로직도 복제하지 않는다.** 같은 빈칸 로직·같은 채점
로직·같은 오디오 재생이 단어/예문/문장 어디서든 하나의 구현으로 돈다.

```
Curriculum Engine (콘텐츠 평면)          Learning Engine (실행 계층)
 words · examples · sentences …  ──→  adapter ──→ LearningItem(정규형)
                                                     │
                                        registry.MODES[mode]  (설정 객체)
                                                     │
                                       <LearningEngine mode= item= options= onEvent= />
```

### 13.2 3개 구성 요소

**① LearningItem (콘텐츠 정규형, 순수 어댑터)** — 모드는 테이블을 모른다.
모든 콘텐츠 타입이 같은 모양으로 정규화된다:

```js
// adapters/learningItem.js (순수)
fromExample(exampleRow) / fromWord(wordRow) / fromSentence(sentenceRow)
// → { id, contentType, text,            // 학습 대상 원문 (예문이면 english_sentence)
//     translation, targetWord,          // 없으면 null
//     audioText,                        // TTS 대상 (별도 오디오 URL 있으면 그것)
//     distractorPool }                  // 객관식용 오답 후보 (결정론 선별)
```

**② 모드 = 레지스트리의 설정 객체 (JSX 없음, 순수)** — 하드코딩된 페이지가
아니라 데이터다:

```js
// engine/registry.js
export const MODES = {
  learn:      { primitives: ['show','audio'],        prepare: identity },
  listen:     { primitives: ['audio','show?'],       prepare: prepListen },
  shadowing:  { primitives: ['audio','record'],      prepare: prepShadow },   // 기존 SpeechBtn 인프라
  fill_blank: { primitives: ['show','text-input'],
                prepare: (item,opt) => makeFillBlank(item.text, item.targetWord), // 기존 순수 엔진 재사용
                grade: checkAnswer },
  spelling:   { primitives: ['text-input'],          prepare: prepSpelling,
                grade: normalizeAnswer 기반 },                                  // 기존 채점 재사용
  multiple_choice: { primitives: ['show','choice'],
                prepare: (item,opt) => pickChoices(item, opt.choices ?? 4),    // 결정론 셔플(djb2 LCG)
                grade: byIndex },
  speaking:   { primitives: ['show','record'],       prepare: prepSpeaking },
  write:      { primitives: ['show','write'],        prepare: identity,
                grade: checkAnswer /* 자가 확인 */ },
}
// 각 모드: { primitives 파이프라인, prepare(item, options) 순수, grade(input) 순수,
//           optionsSchema, 이벤트 종류 } — 전부 하네스로 단위 검증 가능
```

**③ 상호작용 프리미티브 6종 (유일한 React 표면)** — `show`(제시) ·
`audio`(재생) · `text-input`(입력) · `choice`(선택지) · `record`(녹음/음성
인식) · `write`(문장 쓰기). 제네릭 러너 `LearningEngine.jsx` 하나가
레지스트리를 조회해 프리미티브 파이프라인을 실행한다:

```jsx
<LearningEngine mode="fill_blank" item={fromExample(ex)} options={{ retries: 2 }}
                seed={word.id} onEvent={handleEvent} />
```

### 13.3 review / exam은 "모드"가 아니라 "플랜 생성기"

9개 요구 모드 중 review와 exam은 실행 방식이 아니라 **어떤 아이템을 어떤
모드로 몇 개 풀지 고르는 조립 규칙**이다. 엔진은 이를 세션 플랜으로 표현한다:

```js
// 세션 플랜 = (mode, item, options) 시퀀스 — 이것도 데이터
plan = [
  { mode: 'learn',      item: e1 },
  { mode: 'fill_blank', item: e1, options: { retries: 2 } },
  { mode: 'listen',     item: e1 },
  { mode: 'shadowing',  item: e1 },
  { mode: 'write',      item: e1 },
]
// review: word_review_schedule(Leitner)이 item들을 선별해 플랜 생성 (§11 Phase 2)
// exam:   exam_blueprints가 잠금 옵션(재시도 0·힌트 없음)으로 플랜 생성 (§11 Phase 4)
// §8의 학생 예문 단계 = 위 5-스텝 플랜 1개를 WordDetail 스텝 안에서 실행하는 것
```

### 13.4 이벤트 방출 — 엔진은 보상·저장을 모른다

엔진은 `onEvent({ type:'result', mode, itemId, correct, attempts })`만
방출한다. DB 기록·별/XP 지급 여부는 **호스트 화면이** 기존 콜백 체계로
결정한다. 보상 격리(§8)가 엔진 계층에서도 구조적으로 유지되고, 같은 모드가
연습(보상 없음)과 퀴즈(보상 있음)에서 재사용 가능해진다. 결정론 원칙 유지:
`seed` prop + 기존 `shuffleDeterministic` — `Math.random()` 금지.

### 13.5 "설정만으로 새 모드 추가"의 정확한 경계 (정직 조항)

- **설정만으로 되는 것**: 기존 프리미티브 조합 + 기존 순수 로직 재사용으로
  표현되는 새 모드(예: "예문 듣고 객관식으로 번역 고르기" = audio+choice
  조합 = 레지스트리 항목 1개, React 0줄). 새 콘텐츠 타입에 기존 모드 전부
  적용(어댑터 1개 추가)도 동일.
- **코드가 필요한 것**: 완전히 새로운 상호작용(예: 드래그 매칭)은
  프리미티브 1개를 새로 만들어야 한다 — 단, 한 번 만들면 모든 모드가
  재사용한다. "모든 미래 모드가 React 0줄"이라고 과장하지 않는다(규칙 18).

### 13.6 기존 플로우와의 관계 (규칙 1 — 재작성 금지)

기존 퀴즈/스펠링/문장학습 화면은 **Phase 0에서 이식하지 않는다** — 검증된
프로덕션 플로우의 재작성은 회귀 위험만 있다. 엔진은 ① 신규 지점(예문
단계)에서 처음 가동되고 ② 이후 새 모듈(듣기/말하기/시험)은 엔진 사용이
의무이며 ③ 기존 화면은 기회가 있을 때(해당 화면을 어차피 크게 손볼 때)
점진 이식한다. `sentenceLearning.js`/`spelling` 채점 등 기존 순수 로직은
엔진이 **감싸서 재사용**하지 재구현하지 않는다.

---
_승인 시 확인 요청 1건: §9 첫 행 — lessons를 별도 테이블 없이
`units.lesson_no`로 표현하는 안에 동의하시는지. 나머지는 승인 즉시 Phase 0
구현 계획(파일·커밋 단위)으로 전개합니다._

---

## 리뷰 반영 노트 (2026-07-31, Phase 0 구현 커밋 F1~F3 — append)

이 섹션은 위 설계 원문을 고치지 않고(append-only, 저장소 헌법 규칙 13)
구현 중 실제로 갈라진 지점만 사실대로 기록한다.

1. **시드 제거 범위 변경(운영자 지시 2026-07-31)**: §2 ER 다이어그램의
   "grammar_points ... ← docs/reading/05의 120개 라벨 멱등 시드" 문구와
   §12-1의 "grammar_points(+120 라벨 시드)"는 **무효**다. 운영자가 구현
   도중 "콘텐츠/시드/샘플/데모 데이터는 일절 만들지 않는다"로 범위를
   축소 지시해, `supabase_v3_13_curriculum_engine_phase0.sql`은
   `grammar_points` **스키마(테이블/컬럼/인덱스/RLS/GRANT)만** 만들고
   라벨 INSERT는 포함하지 않는다(행 0개 상태로 실행됨). 실제 라벨
   채우기는 §11 Phase 5(AI Curriculum Generator) 또는 교사 수동 입력으로
   미룬다. 이 변경 기록은 `supabase_v3_13_...sql` 파일 자체의 "범위 변경
   기록" 주석과 1:1 대응한다.
2. **§4 approve/publish 배치 모순 해소**: §4 코드 블록은
   `generatorContract.js`에 `approveExample(id)`/`publishExample(id)`가
   있는 것처럼 표기돼 있으나, 실제로는 그 두 함수는
   `src/utils/curriculum/exampleLibrary.js`(IO 계층, 교사 액션 전용)에만
   존재하고 `generatorContract.js`(순수 계약)에는 없다. 이는 §4 바로
   아래 산문("생성기 계약에는 approved로 전이하는 함수가 없어서
   auto-publish가 구조적으로 불가능")과 정확히 일치하는 **안전한 해석**을
   채택한 것 — 코드 블록의 표기가 산문과 어긋난 것으로 보고, 더 안전한
   쪽(승인 함수가 순수 계약에 없어 생성기가 절대 호출할 수 없는 쪽)을
   실제 구현 기준으로 확정한다. `generatorContract.js` 파일 하단 주석에도
   동일 근거가 남아 있다.
3. **M3 인덱스 교체**: §2 "인덱스(Phase 0)" 목록의 `lower(target_word)`
   표현식 인덱스는 리뷰(M3)로 폐기하고, 평범한 btree 복합 인덱스
   `(target_word, approval_status)`로 교체했다. 이유: target_word는 이미
   `exampleLibrary.js`의 `createExample`/`updateExample`이
   `normalizeTargetWord`로 저장 시점에 소문자 정규화해서 넣으므로, 조회
   시점에 다시 `lower()`를 씌워 매칭할 이유가 없다(그리고 이 SQL 파일은
   아직 한 번도 실행된 적이 없어 DROP INDEX 없이 정의만 바꾸는 것으로
   충분했다). 상세 근거는 `supabase_v3_13_...sql`의 해당 인덱스 정의
   바로 위 주석 참고.
