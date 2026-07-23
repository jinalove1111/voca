# Lesson Analyzer — 설계 문서 (Design Doc)

_작성: 2026-07-23. 순수 조사/설계 세션 — `src/`/`api/`/`*.sql`/설정 파일을 전혀
건드리지 않고, 기존 코드(`sentenceLearning.js`/`readingModel.js`/
`readingApi.js`/`PassageEditor.jsx`)와 스키마(`passages`/`passage_sentences`/
`sentence_progress`/`sentence_words`)를 읽어서 그 위에 정합하도록 설계했다.
**이 문서는 설계만 다룬다 — 구현 코드/SQL은 한 줄도 포함하지 않는다.**_

## 0. 한 줄 요약

Lesson Analyzer는 "영어 지문 + 한국어 번역"을 입력받아 문장 분리·핵심 문장·
중요도·문법 태그·청크·어휘 연결·퍼즐 데이터·빈칸 후보 8종을 **규칙 기반
(휴리스틱)으로 미리 채워주는 초안 생성기**다. 유료 AI API를 호출하지 않고
(`CLAUDE.md` 규칙 7), 결과는 항상 **교사가 `PassageEditor.jsx`에서 검수·수정
후 저장**하는 기존 흐름 위에 얹힌다 — 새 저장 경로나 새 신뢰 원천을 만들지
않는다.

## 1. 배경 — 지금 무엇이 이미 있고, 무엇이 비어 있는가

`handoff.md` 2026-07-23(2차/3차) 기준으로 Reading Foundation(v3.3)과
Sentence Learning(v3.4)이 이미 프로덕션에 있다. 아래 스키마·엔진·UI가
**전부 이미 존재하며, Lesson Analyzer는 이 위에 "초안 자동 생성" 레이어 하나만
추가하는 설계다** — 새 계층·새 테이블 철학을 발명하지 않는다.

### 1.1 기존 스키마 (역추적 확정, `supabase_v3_3_reading.sql` +
`supabase_v3_4_sentence_learning.sql`)

```
passages
  id, unit_id(FK→units, cascade), title, position

passage_sentences
  id, passage_id(FK→passages, cascade), position, english, korean
  -- v3.4 추가(전부 nullable/기본값 있음, additive):
  is_key_sentence boolean default false
  importance_level int default 1, CHECK(1..5)
  grammar_point text            -- 교사가 적는 자유 텍스트 한 줄
  chunks jsonb                  -- 문자열 배열, 수동 입력 전용(AI 자동 분할 없음)

sentence_progress   -- 학생별 진행도 (student_id, sentence_id) unique
  current_stage('read'|'chunk'|'puzzle'|'one_blank'|'ko_to_en'|'mastered')
  completed_stages jsonb, attempt_count, correct_count, wrong_count,
  mastered_at, last_practiced_at

sentence_words      -- 문장 ↔ 단어 수동 연결(현재 UI/소비 코드 0 — "이번
                     -- Phase에는 연결 UI 없음" 이라고 SQL 헤더에 명시)
  sentence_id(FK→passage_sentences, cascade), word_id(FK→words, cascade)
  unique(sentence_id, word_id)

words (핵심 4테이블, 역추적)
  id, unit_id, word, meaning, position,
  word_audio_url, example_audio_url, example_text, example_translation,
  memory_tip, accepted_meanings(jsonb)
```

### 1.2 기존 순수 엔진 (import-0, 이미 하네스로 검증됨 — 재구현 금지 대상)

- `src/utils/readingModel.js` — `validatePassage`, `normalizeSentences`,
  `movePosition`, `splitPassageText`(마침표/느낌표/물음표 단순 분할, 약어
  뒤에서도 잘리는 정직한 한계를 헤더 주석에 명시).
- `src/utils/sentenceLearning.js` — `STAGES`, `IMPORTANCE_LABELS`,
  `normalizeAnswer`, `pickBlank`(단일 빈칸 결정론 선택 — 유닛단어>동사>마지막
  내용어), `chunksOf`(청크 폴백), `shuffleDeterministic`(퍼즐 셔플, djb2 LCG),
  `checkChunkOrder`/`checkBlank`(채점), `adaptiveState`/`encouragementFor`
  (적응 지원), `applyStageResult`(진행도 리듀서).

### 1.3 기존 관리자 UI (`src/components/admin/PassageEditor.jsx`)

지문/문장을 전부 **수동 입력**한다 — 핵심 문장 체크박스, 중요도 select,
문법 포인트 텍스트 입력, 청크 텍스트에어리어(한 줄=청크 하나) 모두 교사가
손으로 채운다. "본문 붙여넣기"만 `splitPassageText()`로 문장 분리를
자동화해준다. **Lesson Analyzer가 채울 빈틈이 바로 이 지점** — 문장 분리
이후 4개 학습 메타 필드(핵심/중요도/문법/청크) + 신규 2개(어휘 연결/빈칸
후보)를 교사가 0부터 입력하는 대신, 초안을 미리 채워주고 교사는 확인·수정만
하게 만드는 것이 이 설계의 목적이다.

### 1.4 학생 UI 소비 확인 (설계가 실제로 맞물리는 지점)

`SentenceLearningFlow.jsx`가 `pickBlank(sentence.english, unitWordSlugs)`를
호출하는데, `unitWordSlugs`는 **`App.jsx`에서 반 전체 단어 목록**
(`classWords.map(w => w.word)`)을 그대로 넘긴다 — `sentence_words`(문장별
연결)는 현재 전혀 소비되지 않는다. 퍼즐 단계는 `shuffleDeterministic(chunks,
String(sentence.id))`로 **매번 런타임에 셔플하고 저장하지 않는다** — "퍼즐
데이터"는 곧 `chunks` 배열 그 자체이지, 별도 퍼즐 테이블이 아니다. 이 두
가지가 아래 §7/§9의 설계를 직접 규정한다.

## 2. 설계 원칙

1. **규칙 기반, 유료 AI 호출 없음** (`CLAUDE.md` 규칙 7) — 사전(단어) 매칭,
   정규식/키워드, 결정론적 점수화만 쓴다. `Math.random()` 금지(기존
   `sentenceLearning.js` 관례 계승 — 필요한 곳은 `shuffleDeterministic`류
   시드 결정론).
2. **초안(draft)이지 진실 원천이 아니다** — Lesson Analyzer의 출력은 전부
   `PassageEditor.jsx`의 기존 편집 가능 필드에 **사전 채움(pre-fill)** 만
   하고, 저장은 교사가 기존 "💾 문장 저장" 버튼을 눌러야 확정된다. 새로운
   저장 경로/새로운 서버 함수를 만들지 않는다 — 순수 클라이언트 계산
   레이어로 `readingModel.js`/`sentenceLearning.js`와 동일한 위치
   (`src/utils/`)에 놓일 수 있는 **import-0 순수 함수 모음**으로 설계한다.
3. **기존 스키마를 최대한 재사용** — §6(어휘 연결)은 이미 있는
   `sentence_words` 테이블을 그대로 쓴다. §7(퍼즐 데이터)은 새 테이블이
   필요 없다(§1.4). 정말 부족한 지점(§4 문법 태그의 구조화된 다중 태그)만
   "향후 additive 컬럼 후보"로 **제안만** 하고 SQL 파일은 만들지 않는다
   (임무 범위 — 문서 전용).
4. **정직한 한계 명시** — 이 저장소의 기존 관례(`sentenceLearning.js`
   §pickBlank/`readingModel.js` §splitPassageText 헤더 주석)를 그대로
   따른다. 각 항목마다 "규칙 기반으로 가능" vs "사람 검수 필수"를 표로
   명시한다.
5. **학생 대상 신규 기능이 아니다** (`CLAUDE.md` 규칙 12 무관 확인) —
   Lesson Analyzer는 **관리자(교사) 전용 저작 도구**다. 학생이 보는 화면/
   로직은 전혀 바뀌지 않는다 — 결과물이 결국 기존 `passage_sentences`
   필드에 저장되면, 학생 UI는 지금과 똑같이 그 필드를 읽을 뿐이다.

## 3. 전체 파이프라인 개요

```
[관리자 입력]
  영어 지문 전체 텍스트 (붙여넣기)
  한국어 번역 전체 텍스트 (붙여넣기, 문장 순서가 영어와 1:1 대응한다고 가정)
        │
        ▼
① 문장 분리 (splitEnglish, splitKorean, alignPairs)
        │  → SentenceDraft[] { position, english, korean, alignConfidence }
        ▼
② 핵심 문장 탐지 (scoreKeySentence) ─┐
③ 중요도 레벨 (deriveImportance)     ├─ §2/§3 상호 의존(핵심 점수가 중요도의 입력)
        │                             ┘
④ 문법 태그 (tagGrammar)
⑤ 청크 제안 (suggestChunks)
⑥ 어휘 연결 (linkVocabulary)  ← words(unit_id) 목록 필요
⑦ 퍼즐 데이터 (buildPuzzlePreview)  ← ⑤의 출력을 검증만 함(신규 계산 없음)
⑧ 빈칸 생성 후보 (suggestBlankCandidates)  ← ④,⑥의 출력을 신호로 사용
        │
        ▼
[LessonAnalysisResult] (§10 통합 JSON) — PassageEditor draft로 매핑
        │
        ▼
[교사 검수 화면] 문장별로 제안값이 기존 입력 필드에 미리 채워진 채 표시
  → 교사가 각 필드를 그대로 두거나 수정
        │
        ▼
[기존 saveSentences()] — 변경 없음. 여기서부터는 지금과 100% 동일한 저장 경로.
```

핵심 설계 결정: **②~⑧은 서로 느슨하게 의존**한다(예: ⑧은 ④·⑥의 결과를
입력으로 쓴다). 따라서 실행 순서는 위 다이어그램 순서를 지켜야 하지만, 각
단계는 독립적으로 테스트 가능한 순수 함수로 설계한다(기존
`tests/harness/runSentenceLearning.mjs` 같은 Node 하네스로 단언 가능한
구조 — 이 문서는 하네스를 만들지 않지만 "만들 수 있는 형태"로 설계한다).

## 4. 입력 스펙

```jsonc
// LessonAnalyzerInput
{
  "unitId": "uuid",                 // words 테이블 조회 범위(§6에 필요)
  "englishText": "string",          // 영어 지문 전체(줄바꿈/문단 구분 허용)
  "koreanText": "string",           // 한국어 번역 전체(영어와 동일 문장 수 가정)
  "unitWords": [                    // 호출부가 미리 조회해서 넘김(analyzer는
    { "id": "uuid", "word": "apple" } // Supabase를 직접 모른다 — import-0 원칙)
  ]
}
```

- `unitWords`는 이미 `wordLibrary.js`가 조회하는 `words` 테이블의
  `id`/`word` 두 컬럼만 필요 — 새 쿼리가 아니라 기존 `getClassWords()`류
  호출 결과를 그대로 재사용한다(§9 관련 파일 참고).
- 한국어 번역은 **선택**이 아니라 이 도구의 필수 입력이지만(과업 지시대로),
  개별 문장의 `korean`은 기존 스키마처럼 비어 있어도 저장 자체는 허용된다
  — Analyzer가 정렬에 실패한 문장은 `korean: ""`로 두고 `alignConfidence:
  "manual_needed"`만 표시한다(§5.3).

## 5. 문장 분리 (Sentence Split)

### 5.1 규칙

기존 `readingModel.js splitPassageText()`(단순 `/[^.!?]+[.!?]*/g`)를
그대로 재사용하지 않는다 — 그 함수는 헤더 주석에 스스로 "약어 뒤에서도
잘린다"는 정직한 한계를 明示하며 "관리자가 눈으로 확인·수정하는 전제의
보조 도구"라고 선언돼 있다. Lesson Analyzer는 그 위에 **약어 예외 처리
레이어**를 추가한 상위 호환 버전으로 설계한다(기존 함수를 대체하는 게
아니라, "본문 붙여넣기" 버튼의 결과를 그대로 쓰거나 더 정교한 버전 중 택1로
PassageEditor가 선택할 수 있게 — 기존 버튼은 그대로 둔다).

**분리 경계 판정 알고리즘 (토큰 스캔, lookbehind 정규식 미사용 — 구형
Safari 크래시 방지, `splitPassageText` 헤더 주석과 동일 이유)**:

1. 문자열을 왼쪽에서 오른쪽으로 스캔하며 `.`/`!`/`?` 후보 위치를 찾는다.
2. 후보가 `.`이고, 그 직전 "단어"가 알려진 약어 목록(아래)에 있으면
   **분리하지 않는다**.
3. 후보가 `.`이고, 직전 토큰이 순수 숫자(예: `3.5`, `No.3`처럼 마침표
   앞뒤가 모두 숫자)면 **분리하지 않는다**.
4. 후보 뒤에 닫는 인용부호(`"`/`'`/`”`/`’`)가 연속되면, 문장 경계는 그
   인용부호 뒤로 민다(구두점+인용부호를 한 덩어리로 취급).
5. 후보 뒤에 종결부호가 연속되면(`...`, `?!`, `!?`) 전부 하나의 경계로
   묶는다(기존 `splitPassageText` 정규식 `[.!?]*`와 동일 정신).
6. 경계 판정 후, 다음 문장이 소문자로 시작하면 "약한 신호"로 표시만 하고
   **분리는 강행**한다(대소문자만으로 되돌리면 정상 문장도 잘못 합쳐지는
   사례가 더 흔함 — 대신 `splitWarnings`에 기록해 교사가 보게 한다).

**약어 목록(기본 내장, 중학 교과서 지문에서 실제로 나오는 것 위주)**:
`Mr. Mrs. Ms. Dr. St. Jr. Sr. vs. etc. e.g. i.e. a.m. p.m. No. U.S. U.K.`
(대소문자 무시 비교, 목록은 화이트리스트라 새 약어가 나오면 오탐 —
§5.3에서 사람 검수로 흡수).

### 5.2 한영 정렬 (alignPairs)

영어/한국어를 각각 독립적으로 분리한 뒤 **문장 개수가 같으면 순서대로
1:1 매핑**(`alignConfidence: "ok"`). 개수가 다르면:
- 영어 문장 수 > 한국어 문장 수: 뒤쪽 한국어가 없는 문장은 `korean: ""`로
  비워두고 `alignConfidence: "count_mismatch"`.
- 반대의 경우도 동일 — 초과분 한국어는 버리지 않고 마지막 문장에
  이어붙이지 않는다(잘못된 병합보다 빈 칸이 안전 — 기존 헌법 규칙 1
  "안정성 최우선" 정신, 데이터를 조용히 잘못 합치는 것보다 명시적으로
  비워서 교사 눈에 띄게 한다).

### 5.3 JSON 스키마

```jsonc
{
  "sentences": [
    {
      "position": 0,
      "english": "I like spring the best.",
      "korean": "나는 봄을 가장 좋아한다.",
      "alignConfidence": "ok"            // "ok" | "count_mismatch"
    }
  ],
  "splitWarnings": [
    { "position": 3, "reason": "lowercase_next_sentence", "detail": "Mr. Kim, my teacher, ..." }
  ]
}
```

### 5.4 Worked Example

입력(영어, 문단 붙여넣기):
```
I like spring the best. The weather is warm and the flowers bloom. My
family often goes on a picnic in the park. Mr. Kim, my teacher, says
spring is the season of new beginnings. Do you know what "hanami" means
in Japanese? It means watching cherry blossoms. I want to visit Japan
someday to see the cherry blossoms.
```
입력(한국어):
```
나는 봄을 가장 좋아한다. 날씨가 따뜻하고 꽃이 핀다. 우리 가족은 종종
공원으로 소풍을 간다. 우리 선생님이신 김 선생님은 봄이 새로운 시작의
계절이라고 말씀하신다. 너는 일본어로 "hanami"가 무엇을 의미하는지 아니?
그것은 벚꽃을 구경하는 것을 의미한다. 나는 언젠가 벚꽃을 보러 일본을
방문하고 싶다.
```

분리 결과(핵심 포인트: `Mr. Kim`이 문장 경계로 오분리되지 않음):

| position | english | korean | alignConfidence |
|---|---|---|---|
| 0 | I like spring the best. | 나는 봄을 가장 좋아한다. | ok |
| 1 | The weather is warm and the flowers bloom. | 날씨가 따뜻하고 꽃이 핀다. | ok |
| 2 | My family often goes on a picnic in the park. | 우리 가족은 종종 공원으로 소풍을 간다. | ok |
| 3 | Mr. Kim, my teacher, says spring is the season of new beginnings. | 우리 선생님이신 김 선생님은 봄이 새로운 시작의 계절이라고 말씀하신다. | ok |
| 4 | Do you know what "hanami" means in Japanese? | 너는 일본어로 "hanami"가 무엇을 의미하는지 아니? | ok |
| 5 | It means watching cherry blossoms. | 그것은 벚꽃을 구경하는 것을 의미한다. | ok |
| 6 | I want to visit Japan someday to see the cherry blossoms. | 나는 언젠가 벚꽃을 보러 일본을 방문하고 싶다. | ok |

(약어 목록에 `Mr.`이 있어 3번 문장이 두 개로 쪼개지지 않는다 — 목록에
없는 약어였다면 오분리됐을 것이고, 이는 §5.6에서 "사람 검수 필수"로
분류한다.)

### 5.5 규칙 기반 vs 사람 검수

| 항목 | 규칙 기반 가능 | 사람 검수 필수 |
|---|---|---|
| `.`/`!`/`?` 기준 1차 분리 | ✅ | |
| 약어 목록에 있는 예외(`Mr.` 등) | ✅ | |
| 목록에 없는 새 약어/고유명사 축약 | | ✅ (오분리 가능성 — `splitWarnings` 미탐지) |
| 인용부호 안의 종결부호 | ✅ (닫는 인용부호까지 경계를 미는 규칙) | 중첩 인용/비표준 따옴표 | | ✅ |
| 영-한 문장 수 불일치 | ✅ (감지·플래그만) | ✅ (실제 재정렬은 사람) |

## 6. 핵심 문장 탐지 (Key Sentence Detection)

### 6.1 규칙 (가중치 점수 합산 — 전부 정수, 결정론)

| 신호 | 조건 | 점수 |
|---|---|---|
| 위치: 첫 문장 | `position === 0` | +2 |
| 위치: 마지막 문장 | `position === sentences.length - 1` | +1 |
| 길이: 적정 | 토큰 수 6~15개 | +2 |
| 길이: 과도 | 토큰 수 < 4 또는 > 22 | -2 |
| 문법 신호 존재 | §7 `tagGrammar` 결과 태그 ≥ 1개 | +2 |
| 고빈도(high-yield) 문법 신호 | §7 태그 중 `passive`/`comparative`/`relative_clause`/`to_infinitive_purpose`/`modal_obligation` 중 1개 이상 | +1 (문법 신호 점수에 가산) |
| 어휘 연결 존재 | §8 `linkVocabulary` 결과 매치 ≥ 1개(신뢰도 무관) | +2 |
| 감탄/인사/짧은 대꾸 패턴 | 정규식 `^(hi|hello|hey|oh|wow|thanks|thank you|okay|ok|yes|no|bye)\b` (대소문자 무시, 문장 전체가 이 패턴+구두점뿐) | -3 |
| 의문문(Wh-question) | 문장이 `who/what/when/where/why/how`로 시작 + `?`로 끝남 | +1 |

**임계값 및 상한**: 총점 ≥ 3점이면 `keySentenceScore` 기준 후보로 표시.
단, 교과서 지문 특성상 전부 핵심으로 표시되면 무의미하므로 **상한 규칙**을
둔다 — 후보가 전체 문장의 60%를 넘으면, 점수 내림차순으로 상위
`ceil(전체 × 0.6)`개만 `isKeySentence: true` 제안, 나머지는 점수는
보여주되 `suggested: false`로 낮춘다. 문장이 3개 이하인 아주 짧은
지문은 상한을 적용하지 않는다(전부 핵심일 수 있음).

### 6.2 JSON 스키마

```jsonc
{
  "position": 3,
  "keySentenceScore": 5,
  "scoreBreakdown": [
    { "signal": "grammar_present", "points": 2 },
    { "signal": "grammar_high_yield", "points": 1 },
    { "signal": "vocab_link", "points": 2 }
  ],
  "suggestedIsKeySentence": true
}
```

### 6.3 Worked Example (§5.4 지문 기준)

| position | 문장 | 점수 근거 | keySentenceScore | 제안 |
|---|---|---|---|---|
| 0 | I like spring the best. | 첫문장(+2), 짧음 4토큰 경계 | +2 | false(경계 미달) |
| 3 | Mr. Kim, ... new beginnings. | 적정길이(+2), 문법(간접화법·현재시제 says, +2), 어휘연결 없음 | 4 | true |
| 6 | I want to visit Japan someday to see the cherry blossoms. | 적정길이(+2), to부정사 목적(+2+1) | 5 | true |

### 6.4 규칙 기반 vs 사람 검수

| 항목 | 규칙 기반 가능 | 사람 검수 필수 |
|---|---|---|
| 점수 계산 자체(결정론) | ✅ | |
| "이 지문의 진짜 주제 문장이 무엇인가"의 최종 판단 | | ✅ 항상 — 휴리스틱은 통계적 근사일 뿐 의미 이해가 아님 |
| 상한(60%) 초과분 강제 하향 | ✅ (기계적 컷) | ✅ (교사가 컷 이후 문장도 핵심으로 되살릴 수 있어야 함) |

## 7. 중요도 레벨 (Importance Level, 1~5)

`IMPORTANCE_LABELS`(진실 원천, `sentenceLearning.js`)를 그대로 쓴다 —
새 라벨 체계를 만들지 않는다: `5=반드시 암기, 4=자주 출제, 3=중요,
2=읽기 중심, 1=참고`.

### 7.1 매핑 규칙 (§6의 `keySentenceScore`와 §8/§9 신호를 합성)

```
isKeyCandidate = keySentenceScore >= 3
hasHighYieldGrammar = grammarTags에 high-yield 태그(§7.1 표 기준) 존재
hasVocabLink = linkVocabulary 매치 존재(신뢰도 high 또는 medium)

if isKeyCandidate and hasHighYieldGrammar and hasVocabLink:      level = 5
elif isKeyCandidate and (hasHighYieldGrammar or hasVocabLink):    level = 4
elif isKeyCandidate:                                              level = 3
elif hasVocabLink or hasHighYieldGrammar:                         level = 2
else:                                                             level = 1
```

이 규칙은 **§6(핵심 문장)의 부산물**이라 별도 새 신호를 만들지 않는다 —
"핵심 문장이면서 문법+어휘가 겹치면 5, 핵심인데 한쪽만이면 4" 식으로,
교사가 기존 UI에서 보는 "★1~5" select 값을 그대로 채운다.

### 7.2 JSON 스키마

```jsonc
{ "position": 3, "suggestedImportanceLevel": 4, "reason": "핵심 문장 + 문법 신호(간접화법 says)" }
```

### 7.3 Worked Example

| position | 문장 | isKeyCandidate | hasHighYieldGrammar | hasVocabLink | level |
|---|---|---|---|---|---|
| 3 | Mr. Kim, ... beginnings. | true | true(현재형 서술) | false | 4 |
| 6 | I want to visit Japan ... blossoms. | true | true(to부정사 목적) | false | 4 |
| 4 | Do you know what "hanami" means in Japanese? | false(짧고 인용어라 점수 미달 가능) | false | false | 1 |

### 7.4 규칙 기반 vs 사람 검수

| 항목 | 규칙 기반 가능 | 사람 검수 필수 |
|---|---|---|
| §6/§8/§9 출력을 기계적으로 합성한 레벨 산정 | ✅ | |
| "이 문장이 실제 시험에 나올 만큼 중요한가"(교육과정/기출 지식) | | ✅ — 휴리스틱은 텍스트 구조만 보고 실제 출제 이력을 모른다 |

## 8. 문법 태그 (Grammar Tags)

### 8.1 태그 체계 (한국 중학 영어 교육과정 문법 항목 기준, 고정 코드)

기존 `grammar_point`(자유 텍스트 한 줄)는 교사의 개인 메모용으로 그대로
둔다. Lesson Analyzer는 **별도의 구조화된 다중 태그 배열**을 제안한다
(스키마 확장이 필요하다는 점은 §11에서 별도로 다룬다 — 이 문서는 SQL을
만들지 않는다).

| 태그 코드 | 한글 라벨 | 탐지 규칙(키워드/패턴) | 신뢰도 |
|---|---|---|---|
| `tense_present_simple` | 현재시제 | 3인칭 단수 `-s/-es` 동사 또는 `am/is/are` + 일반동사 원형(빈도부사 동반 시 가점) | medium |
| `tense_past_simple` | 과거시제 | `-ed` 어미 또는 불규칙 과거형 목록(`went/saw/ate/...`, 기존 `COMMON_VERBS` 확장) | medium |
| `tense_future_will` | 미래시제(will) | `will`/`won't`/`be going to` | high |
| `tense_present_progressive` | 현재진행 | `am/is/are + -ing` | high |
| `tense_present_perfect` | 현재완료 | `have/has + p.p.`(불규칙 p.p. 목록 필요 — 오탐 가능) | low |
| `modal_obligation` | 조동사(의무/가능) | `can/could/may/must/should/have to/has to` | high |
| `to_infinitive_purpose` | to부정사(목적) | `to + 동사원형`이 문장 뒤쪽에서 "~하기 위해" 위치(콤마/문미 근접) | medium |
| `gerund` | 동명사 | 문장 첫 토큰이 `-ing`이며 뒤에 동사가 이어짐, 또는 전치사+`-ing` | medium |
| `comparative` | 비교급 | `more ~ than` / `-er than` / `as ~ as` | high |
| `superlative` | 최상급 | `the most ~` / `the -est` | high |
| `passive_voice` | 수동태 | `be(is/are/was/were/been) + p.p.` | low(자동사 오탐 다수 — 예: "was born"은 맞지만 "was warm"은 오탐) |
| `relative_clause` | 관계대명사절 | 명사 바로 뒤 `who/which/that/whose` | low(`that`은 접속사/지시사와 구분 불가) |
| `relative_adverb` | 관계부사 | 명사 뒤 `where/when/why` + 완전한 절 | low |
| `conjunction_time` | 시간 접속사 | `when/while/before/after/as soon as` | medium |
| `conjunction_reason` | 이유 접속사 | `because/since/as`(문두 또는 절 연결) | medium |
| `conjunction_condition` | 조건 접속사(if) | `if` | high |
| `conjunction_concession` | 양보 접속사 | `although/though/even though` | high |
| `there_be` | there is/are 구문 | 문두 `there is/are/was/were` | high |
| `indirect_question` | 간접의문문 | `know/wonder/tell me` 뒤 의문사+평서어순 | low |
| `wh_question` | 의문사 의문문 | 문두 `who/what/when/where/why/how` + `?` | high |
| `imperative` | 명령문 | 문두가 동사원형(대문자 시작, 주어 없음) — 대상 인식 어려워 오탐 위험 | low |

각 태그는 `confidence: high|medium|low`를 함께 반환한다. **낮은 신뢰도
태그는 UI에서 "제안(연한 색)"으로만 표시하고, 체크 전까지 저장 대상에서
제외**하는 것을 권장(§10 참고).

### 8.2 JSON 스키마

```jsonc
{
  "position": 3,
  "grammarTags": [
    { "code": "tense_present_simple", "label": "현재시제", "confidence": "medium", "matchedSpan": "says" }
  ]
}
```

### 8.3 Worked Example

| position | 문장 | 태그 |
|---|---|---|
| 3 | Mr. Kim, my teacher, says spring is the season of new beginnings. | `tense_present_simple`(says, medium) |
| 4 | Do you know what "hanami" means in Japanese? | `wh_question`(what, high), `indirect_question`(know what ... means, low) |
| 6 | I want to visit Japan someday to see the cherry blossoms. | `to_infinitive_purpose`(to see, medium) |
| 1 | The weather is warm and the flowers bloom. | (없음 — 단순 현재형이지만 3인칭단수 `-s` 없어 `tense_present_simple` 매치 실패, 정직한 한계) |

### 8.4 규칙 기반 vs 사람 검수

| 항목 | 규칙 기반 가능 | 사람 검수 필수 |
|---|---|---|
| `high` 신뢰도 태그(will/조동사/비교급/최상급/if/there is 등 표층 키워드) | ✅ | 최종 확인은 항상 필요하지만 오탐률 낮음 |
| `medium` 신뢰도 태그(시제/접속사/to부정사 용법 구분) | ✅ (근사) | ✅ 필수 — to부정사 3용법(명사/형용사/부사) 구분은 규칙만으로 불가 |
| `low` 신뢰도 태그(수동태/관계대명사/간접의문문/명령문) | ⚠️ 부분적 | ✅ 필수 — 오탐률 높음(`that` 중의성이 대표 사례) |
| 교육과정 학년(중1/중2/중3) 배정 | | ✅ (이 표는 태그만 정의, 학년 매핑은 교사/커리큘럼 판단) |

## 9. 청크 제안 (Chunk Suggestions — 끊어읽기)

### 9.1 규칙

목표: `passage_sentences.chunks`(문자열 배열, ≥2개여야 유효 —
`chunksOf()` 폴백 규칙과 정합)를 채울 후보를 만든다. 토큰을 스캔하며
**아래 위치 앞에서 새 청크를 시작**한다(경계 규칙, 우선순위 순):

1. 쉼표(`,`) 뒤 — 가장 강한 신호(교과서 관례상 쉼표는 항상 호흡 지점).
2. 등위접속사(`and/but/or/so`) 앞.
3. 종속접속사(`when/while/before/after/because/if/although/that`) 앞 —
   §8의 `conjunction_*` 태그 위치 재사용(중복 계산 없음, §8 출력을
   입력으로 받는다).
4. 관계대명사/관계부사(§8 `relative_clause`/`relative_adverb` 매치 위치) 앞.
5. `to + 동사원형`(§8 `to_infinitive_purpose`) 앞.
6. 전치사구 시작(`in/on/at/to/for/with/from/of` + 명사) — 단, 이미 위
   1~5 규칙으로 청크가 나뉜 상태에서 **문장이 여전히 한 청크에 8토큰
   이상 남아있을 때만** 적용(과도한 세분화 방지 — 교과서 관례는 문장당
   보통 2~5청크).

**병합 규칙(다듬기)**: 위 규칙으로 나눈 뒤, 토큰 수가 1개뿐인 청크는
이웃 청크에 합친다(자연스러운 끊어읽기 단위는 최소 2단어라는 관례 —
`pickBlank`의 "1글자 토큰은 절대 빈칸 아님" 규칙과 같은 정신). 최종
청크가 1개면(분리 지점이 전혀 없는 짧은 문장) `chunks: null`을 반환해
기존 `chunksOf()` 폴백(문장 전체 단일 청크)이 그대로 작동하게 한다 —
새 규칙을 만들지 않는다.

### 9.2 JSON 스키마

```jsonc
{
  "position": 3,
  "suggestedChunks": ["Mr. Kim, my teacher,", "says", "spring is the season", "of new beginnings."]
}
```

### 9.3 Worked Example

| position | 문장 | 제안 청크 |
|---|---|---|
| 2 | My family often goes on a picnic in the park. | `["My family often goes", "on a picnic", "in the park."]` |
| 3 | Mr. Kim, my teacher, says spring is the season of new beginnings. | `["Mr. Kim, my teacher,", "says spring is the season", "of new beginnings."]` |
| 6 | I want to visit Japan someday to see the cherry blossoms. | `["I want", "to visit Japan someday", "to see the cherry blossoms."]` |

### 9.4 규칙 기반 vs 사람 검수

| 항목 | 규칙 기반 가능 | 사람 검수 필수 |
|---|---|---|
| 쉼표/접속사/전치사구 경계 탐지 | ✅ | |
| "자연스러운 호흡 단위"인지(운율/발화 리듬) | | ✅ — 규칙은 문법 경계만 보고 실제 발화 리듬은 사람 판단 |
| 청크 개수가 학습에 적절한지(너무 잘게/거칠게) | ✅ (8토큰 상한으로 완화) | ✅ 최종 조정 |

## 10. 어휘 연결 (Vocabulary Links)

### 10.1 규칙 — 기존 `sentence_words` 테이블을 채우는 것이 목적

문장의 영어 토큰을 유닛 단어 목록(`words.word`, `unitWords` 입력)과
매칭한다. 매칭 강도 3단계:

1. **exact** — `normalizeAnswer(token) === normalizeAnswer(word)`
   (기존 `sentenceLearning.normalizeAnswer` 재사용 — 대소문자/구두점
   무시). confidence: `high`.
2. **stem** — 가벼운 접미사 제거 후 일치(`-s`, `-es`, `-ed`, `-ing`,
   `-ied`→`y` 복원 등 아주 단순한 규칙만, 형태소 분석기 아님 — 기존
   `pickBlank`의 "naive 정직 기록" 관례를 그대로 계승). confidence:
   `medium`.
3. **phrase** — 유닛 단어가 2단어 이상 구(예: "go on a picnic")면
   문장 안에서 정규화된 부분 문자열로 검색. confidence: `low`(부분
   문자열은 오탐 가능 — 예: 짧은 단어가 다른 단어 속에 우연히 포함).

같은 문장에 같은 `wordId`가 여러 토큰과 매치되면 최고 confidence 1건만
남긴다(중복 억제, DB의 `unique(sentence_id, word_id)` 제약과 정합).

### 10.2 JSON 스키마

```jsonc
{
  "position": 2,
  "vocabLinks": [
    { "wordId": "uuid", "word": "picnic", "matchedToken": "picnic", "matchType": "exact", "confidence": "high" }
  ]
}
```

### 10.3 Worked Example

유닛 단어 목록에 `spring`, `weather`, `bloom`, `picnic`, `beginning`이
있다고 가정:

| position | 문장 | vocabLinks |
|---|---|---|
| 0 | I like spring the best. | `spring`(exact, high) |
| 1 | The weather is warm and the flowers bloom. | `weather`(exact, high), `bloom`(exact, high) |
| 2 | My family often goes on a picnic in the park. | `picnic`(exact, high) |
| 3 | ... the season of new beginnings. | `beginning`(stem: `beginnings`→`beginning`, medium) |

### 10.4 저장 경로 설계 메모

`sentence_words`는 이미 스키마가 있고 소비 코드가 0인 상태(§1.4)다.
Lesson Analyzer가 이 표를 처음으로 채우는 실사용처가 된다. 저장은
기존 `saveSentences()`의 delete-then-insert 관례를 그대로 따르는
**신규 함수**(`saveSentenceWordLinks(sentenceId, wordIds)`, 이 문서는
설계만 — 구현 안 함)로 별도 호출한다. 이렇게 채워진 링크는 **당장은
런타임 소비처가 없다**(`pickBlank`는 여전히 반 전체 단어 목록을 씀) —
향후 `SentenceLearningFlow.jsx`가 `unitWordSlugs` 대신 해당 문장의
`sentence_words`만 우선순위로 넘기도록 개선할 수 있다는 **열린 개선
포인트**로 남긴다(이번 설계 범위 밖, §12 참고).

### 10.5 규칙 기반 vs 사람 검수

| 항목 | 규칙 기반 가능 | 사람 검수 필수 |
|---|---|---|
| exact/stem 매칭 | ✅ | 오탐 적으나 stem은 확인 권장 |
| phrase(부분 문자열) 매칭 | ⚠️ | ✅ 필수 — 짧은 단어의 우연한 포함 오탐 가능 |
| "이 문장이 이 단어를 진짜로 학습시키는 문맥인가" | | ✅ — 단순 포함 여부와 학습 가치는 다르다 |

## 11. 퍼즐 데이터 (Puzzle Data)

### 11.1 설계 결론 — 새 데이터 구조 불필요

§1.4에서 확인했듯 퍼즐 단계는 `shuffleDeterministic(chunks,
String(sentence.id))`로 **런타임에 계산되고 저장되지 않는다**. 따라서
"퍼즐 데이터"는 §9(청크 제안)의 출력 그 자체이고, Lesson Analyzer가
추가로 할 일은 **청크 배열이 퍼즐로서 유효한지 검증**하는 것뿐이다.

### 11.2 검증 규칙

- 청크 개수 < 2 → 퍼즐 불가(경고, `chunksOf()` 폴백이 이미 이 경우
  단일 청크로 처리하므로 애초에 퍼즐 단계 자체가 무의미해지지는
  않음 — `nextStage`는 여전히 진행되나 퍼즐이 "정답이 곧 유일한 배치"라
  체감 난이도가 0에 가까움을 경고).
- **중복 청크 경고** — 두 청크가 `normalizeAnswer()` 기준 동일하면
  `checkChunkOrder()`가 "다른 순서인데 우연히 정답과 같은 문자열
  나열"을 정답으로 오판할 수 있다(예: 청크가 `["I", "I", "went"]`처럼
  중복이면 순서를 바꿔도 배열 값이 같아 오판 불가하지만, 값이 다른
  더 긴 청크 안에 같은 부분 문자열이 있는 경우는 실제로는 문제 없음 —
  **정확히는 청크 배열 안에 완전히 동일한 문자열이 2회 이상 나오는
  경우만 경고 대상**).
- 청크 개수 > 6 → "너무 잘게 쪼개짐" 경고(교과서 관례상 상한 참고용).

### 11.3 JSON 스키마

```jsonc
{
  "position": 3,
  "puzzlePreview": {
    "chunks": ["Mr. Kim, my teacher,", "says spring is the season", "of new beginnings."],
    "chunkCount": 3,
    "warnings": []
  }
}
```

### 11.4 규칙 기반 vs 사람 검수

| 항목 | 규칙 기반 가능 | 사람 검수 필수 |
|---|---|---|
| 청크 개수/중복 검증 | ✅ | |
| "이 퍼즐이 학생에게 적절한 난이도인가" | | ✅ |

## 12. 빈칸 생성 후보 (Blank Generation Candidates)

### 12.1 설계 관계 — 기존 `pickBlank()`와의 차이

`pickBlank(sentence, unitWordSlugs)`는 **런타임에 학생에게 보여줄 단일
빈칸**을 결정론으로 고르는 이미 검증된 함수(우선순위: 유닛단어 →
동사류 → 마지막 내용어)다. Lesson Analyzer의 "빈칸 생성 후보"는 이를
대체하지 않는다 — **저작 단계에서 교사가 미리보기로 여러 후보를 보고
검토**할 수 있게, 같은 판단 재료를 **top-3 랭킹**으로 넓혀 보여주는
저작 보조 기능으로 설계한다.

### 12.2 규칙 (랭킹 점수)

`pickBlank`가 이미 구현한 3단계 우선순위(①유닛단어 ②동사류 ③마지막
내용어)의 판정 로직(`ARTICLES`/`COMMON_VERBS`/`FUNCTION_WORDS`,
`isVerbish`)을 **그대로 재사용**하되, 첫 매치에서 멈추지 않고 모든
적격 토큰에 점수를 매겨 상위 3개를 반환한다:

| 신호 | 점수 |
|---|---|
| §10 어휘 연결 매치(confidence high) | +5 |
| §10 어휘 연결 매치(confidence medium) | +3 |
| 동사류(`isVerbish`) | +3 |
| §8 문법 태그가 걸린 토큰(예: 비교급의 `-er`, 수동태의 p.p.) | +2 |
| 형용사류 추정(`-ful/-ous/-ive/-al` 어미) | +1 |
| 부사류 추정(`-ly` 어미) | +1 |
| 관사(a/an/the) | 후보 제외(0점, 애초에 미포함) |
| 기능어(`FUNCTION_WORDS`) | 후보 제외 |
| 문장 첫 토큰(대문자 시작) | -2 (대소문자 처리 모호성 — 완전 배제는 아님) |
| 토큰 길이 < 2 | 후보 제외 |

동점이면 문장 내 등장 순서(왼쪽 우선)로 결정론 정렬 — `Math.random()`
없음.

### 12.3 JSON 스키마

```jsonc
{
  "position": 2,
  "blankCandidates": [
    { "token": "picnic", "score": 5, "reason": "unit_vocab_exact" },
    { "token": "goes",   "score": 3, "reason": "verbish" },
    { "token": "family", "score": 1, "reason": "content_word_fallback" }
  ],
  "runtimeChoice": "picnic"   // pickBlank()가 실제로 고를 값(참고 표시용, 재계산 아님)
}
```

### 12.4 Worked Example

문장: `"My family often goes on a picnic in the park."` (유닛 단어에
`picnic` 포함 가정)

| 순위 | 토큰 | 점수 | 근거 |
|---|---|---|---|
| 1 | picnic | 5 | 어휘 연결(exact) |
| 2 | goes | 3 | 동사류(`isVerbish` — 목록엔 없지만 `-es`... 실제로는 `-s`형은 목록 미포함이라 어미 휴리스틱도 제외되는 정직한 한계, 대체로 3위 후보는 `family`나 `park`가 될 수 있음) |
| 3 | park | 1 | 마지막 내용어 폴백 |

(이 예시는 `sentenceLearning.js`의 "정직한 한계" 그대로 이어받는다 —
`-s`형은 복수 명사와 구분 불가라 동사 어미 휴리스틱에서 의도적으로
제외돼 있다는 원본 주석과 일치시켜야 한다.)

### 12.5 저장 경로 설계 메모 (열린 질문)

현재 스키마는 "교사가 특정 빈칸 토큰을 강제 지정"할 컬럼이 없다 —
`one_blank` 단계는 항상 런타임에 `pickBlank()`를 재계산한다. 만약
교사가 Analyzer의 top-3 중 2·3순위를 선택해 강제로 고정하고 싶다면,
`passage_sentences`에 **nullable 추가 컬럼**(예: 선호 빈칸 토큰 문자열
1개, null이면 기존 `pickBlank()` 그대로 폴백)이 필요하다 — 이 설계
문서는 **SQL을 만들지 않으며**, 이것이 필요한지 여부와 컬럼명/타입
확정은 실제 구현 착수 세션에서 운영자 승인을 받아 별도
`supabase_v{n}_*.sql`로 준비해야 한다(`CLAUDE.md` 규칙 8/9). 지금
설계에서는 **없어도 동작한다** — Analyzer의 후보 목록은 미리보기일 뿐,
실제 학생 화면은 여전히 `pickBlank()`가 결정한다.

### 12.6 규칙 기반 vs 사람 검수

| 항목 | 규칙 기반 가능 | 사람 검수 필수 |
|---|---|---|
| top-3 랭킹 계산(결정론) | ✅ | |
| "이 빈칸이 학생이 배워야 할 진짜 핵심 표현인가" | | ✅ |
| 1순위를 그대로 채택할지 다른 후보로 바꿀지 | | ✅ (§12.5 저장 경로 부재 시 이 선택은 UI 미리보기 참고용에 그침) |

## 13. 통합 출력 스키마 (LessonAnalysisResult)

```jsonc
{
  "unitId": "uuid",
  "generatedAt": "2026-07-23T00:00:00.000Z",   // 참고용, 서버 시각 아님(순수 계산 — 호출부가 채움)
  "splitWarnings": [ /* §5.3 */ ],
  "sentences": [
    {
      "position": 0,
      "english": "I like spring the best.",
      "korean": "나는 봄을 가장 좋아한다.",
      "alignConfidence": "ok",
      "keySentenceScore": 2,
      "suggestedIsKeySentence": false,
      "suggestedImportanceLevel": 1,
      "grammarTags": [],
      "suggestedChunks": null,
      "vocabLinks": [ { "wordId": "uuid", "word": "spring", "matchedToken": "spring", "matchType": "exact", "confidence": "high" } ],
      "puzzlePreview": { "chunks": [], "chunkCount": 0, "warnings": ["too_short_for_puzzle"] },
      "blankCandidates": [ { "token": "spring", "score": 5, "reason": "unit_vocab_exact" } ]
    }
  ]
}
```

이 구조는 **문장 하나당 §5~§9의 8개 출력을 전부 담은 평면 배열**이다 —
`PassageEditor.jsx`의 `draft` 상태(문장별 `{key, english, korean,
isKeySentence, importanceLevel, grammarPoint, chunksText}`)에 대응시킬
때는:

| LessonAnalysisResult 필드 | PassageEditor draft 필드 | 매핑 방식 |
|---|---|---|
| `english`/`korean` | `english`/`korean` | 그대로 |
| `suggestedIsKeySentence` | `isKeySentence` | 그대로 pre-fill(교사가 체크박스로 즉시 override 가능) |
| `suggestedImportanceLevel` | `importanceLevel` | 그대로 pre-fill |
| `grammarTags` | `grammarPoint`(자유 텍스트) | 태그 라벨을 쉼표로 join한 문자열 초안(예: `"현재시제, to부정사(목적)"`) — 구조화 태그 자체는 §11 열린 질문의 신규 컬럼 없이는 저장 불가, 우선은 자유 텍스트로 강등해 기존 스키마에 맞춘다 |
| `suggestedChunks` | `chunksText`(줄바꿈 텍스트) | `chunksToText()`(기존 PassageEditor 로컬 함수와 동일 변환) |
| `vocabLinks` | (신규 UI 필요 — §10.4) | `sentence_words` upsert, 기존 draft 필드 없음 |
| `blankCandidates`/`puzzlePreview` | (신규 미리보기 패널) | 저장 대상 아님 — 참고 표시 전용 |

## 14. 관리자 UX 흐름 (설계 스케치 — 구현 아님)

1. 교사가 "본문 붙여넣기"에 영어 지문을, 새 "번역 붙여넣기" 필드에
   한국어 번역을 넣고 **"AI 아님 · 자동 분석"** 버튼을 누른다(문구는
   유료 AI로 오해되지 않도록 명확히 — `CLAUDE.md` 규칙 7 정신을 UX
   문구까지 확장).
2. Analyzer가 §13 결과를 계산(클라이언트 순수 함수, 네트워크 호출
   없음 — Supabase는 `unitWords` 조회 1회만).
3. 기존 문장 편집 행들이 **제안값으로 미리 채워진 채** 렌더된다 —
   핵심 문장 체크박스가 이미 체크돼 있고, 중요도 select가 이미
   선택돼 있고, 문법 포인트/청크 텍스트가 이미 채워진 초안 상태.
   신뢰도가 `low`인 문법 태그만 시각적으로 옅게 표시(선택 안내).
4. 교사는 기존과 동일하게 각 필드를 자유롭게 수정한다 — Analyzer가
   개입하는 것은 **초기값 채우기뿐**, 저장 로직/검증(`validatePassage`)
   /저장 버튼은 전부 기존 그대로.
5. "💾 문장 저장"을 누르면 기존 `saveSentences()` 그대로 호출 —
   Analyzer 관련 필드(`keySentenceScore`, `blankCandidates` 등)는
   저장 페이로드에 포함되지 않는다(DB 스키마에 없는 필드이므로 애초에
   전송 대상이 아님 — 새 컬럼 없이도 전체 파이프라인이 동작한다는
   것이 이 설계의 핵심 이점).

## 15. 실패 모드 / 한계 총괄

| 실패 모드 | 영향 | 완화 |
|---|---|---|
| 목록에 없는 약어로 문장 오분리 | 문장이 부자연스럽게 쪼개짐 | `splitWarnings` 표시 + 교사가 "문장 병합"(기존 UI에 없음 — 행 삭제 후 재작성으로 우회 가능, 신규 "병합" 버튼은 §16 향후 과제) |
| 한/영 문장 수 불일치 | 일부 문장 한국어 공란 | `alignConfidence: count_mismatch`로 명시, 강제 매핑 안 함(안전 우선) |
| `that`류 다의어로 인한 문법 태그 오탐 | 관계대명사/접속사/지시사 혼동 | confidence: low로 표시, 자유 텍스트로 강등 시 교사가 직접 수정 |
| stem/phrase 어휘 매칭 오탐 | 관련 없는 단어가 연결 제안됨 | confidence 표시 + §10.4 저장 전 체크 필요 |
| 청크 규칙이 실제 호흡과 다름 | 어색한 끊어읽기 | 항상 사람 검수(§9.4) |
| 빈칸 후보가 학습 가치 낮은 토큰 1순위 | 저품질 빈칸 제안 | top-3 노출로 대안 제공(§12.1), 최종 채택은 사람 |

## 16. 향후 열린 질문 (이 설계 문서 범위 밖)

1. §8 문법 태그를 구조화된 배열로 **영구 저장**하려면
   `passage_sentences.grammar_tags jsonb` 같은 additive 컬럼이 필요한가,
   아니면 기존 `grammar_point` 자유 텍스트로 충분한가 — 운영자 판단
   필요(`CLAUDE.md` 규칙 8: 에이전트가 DDL 직접 실행 불가).
2. §12.5 "선호 빈칸 토큰" 고정 컬럼 신설 여부.
3. §10.4 `sentence_words`를 `SentenceLearningFlow.jsx`의 `unitWordSlugs`
   우선순위 신호로 실제 연결할지(현재는 소비처 0) — 별도 세션의
   런타임 개선 과제.
4. 문장 "병합"(오분리 복구) UI — 현재 `PassageEditor.jsx`에는 행 삭제/
   추가/순서 이동만 있고 병합 기능이 없다.
5. 이 설계의 실제 구현 범위(Phase 분할: 문장분리+핵심문장+중요도만
   먼저? 8개 전체 한 번에?)는 `PROJECT_BOARD.md`/`ROADMAP.md`에 별도
   항목으로 올려 우선순위를 정해야 한다 — 이번 조사 세션은 설계만
   다룬다.

## 17. 관련 파일

- `C:\voca\supabase_v3_3_reading.sql`, `C:\voca\supabase_v3_4_sentence_learning.sql`
  — 이 설계가 정합해야 하는 기존 스키마 원본.
- `C:\voca\src\utils\readingModel.js`, `C:\voca\src\utils\sentenceLearning.js`
  — 재사용 대상 순수 엔진(§5/§9/§12가 직접 의존).
- `C:\voca\src\utils\readingApi.js`, `C:\voca\src\utils\wordLibrary.js`
  — I/O 레이어(§4 입력 스펙의 `unitWords` 조회 근거).
- `C:\voca\src\components\admin\PassageEditor.jsx` — §14 UX 흐름이
  얹히는 기존 관리자 화면.
- `C:\voca\src\components\SentenceLearningFlow.jsx`, `C:\voca\src\App.jsx`
  — §1.4/§10.4/§12.5의 런타임 소비 확인 근거(`unitWordSlugs`/`pickBlank`
  호출 지점).
- `C:\voca\DATABASE.md`(§1 기존 4테이블 역추적 근거로 참고했으나
  `passages`/`passage_sentences`/`sentence_progress`/`sentence_words`는
  이 문서 작성 시점 기준 `DATABASE.md`에 아직 기록되지 않음 — 이 설계
  문서의 §1.1이 최신 스키마 원본).
- `C:\voca\CLAUDE.md` 규칙 7(유료 AI 회피)·8/9(DDL 승인/멱등)·12(학생
  대상 신규 기능 금지 — 이 도구는 관리자 전용이라 무관 확인).
