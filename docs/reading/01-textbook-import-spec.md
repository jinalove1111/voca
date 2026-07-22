# 01 — 교재 일괄 임포트 JSON 스펙 (Textbook Import Spec)

- **목적**: 교재(리딩 지문 포함)를 한 번에 들여오기 위한 JSON 교환 형식과
  현행 DB 스키마 매핑, 검증 규칙, 멱등 임포트 전략을 정의한다. **이 문서는
  스펙만 정의하며, 임포트 도구 구현은 이 문서의 범위가 아니다(향후 구현용
  — 지금 구현 금지).**
- **버전**: 1.0
- **작성일**: 2026-07-23

## 1. 개요와 계층 구조

임포트 단위는 "교재(Textbook) 1권 = JSON 파일 1개"다. 계층은 다음과 같다.

```
Textbook (교재 1권)
└── Lesson (= Unit, 단원)          ← DB의 units 행
    ├── Word (유닛 단어, 선택)     ← DB의 words 행 (기존 단어 업로드 체계와 병행)
    └── Passage (읽기 지문)        ← DB의 passages 행
        └── Sentence (문장)        ← DB의 passage_sentences 행
            └── SentenceWord (문장↔단어 연결, 선택) ← DB의 sentence_words 행
```

주의(현행 스키마의 사실 관계, `supabase_v3_1_textbooks.sql` /
`supabase_v3_3_reading.sql` / `supabase_v3_4_sentence_learning.sql` 실측):

- **Lesson이라는 별도 테이블은 없다.** 임포트 스펙의 `lessons`는 그대로
  `units` 행에 대응한다(이 저장소에서 "유닛 = 단원 = 레슨").
- `units.class_id`는 not null 관례(유닛은 소유 컨테이너 반에 귀속)이고,
  `units.textbook_id`는 v3.1에서 추가된 교재 축이다(NULL = 반의 자동
  교재로 해석). 임포트 시 두 값 모두 채워야 한다 — 교재의
  `owner_class_id`가 유닛의 `class_id`가 된다.
- `sentence_words.word_id`는 UUID FK인데 JSON 작성 시점엔 UUID를 알 수
  없으므로, JSON에서는 **단어 문자열**로 연결을 표현하고 임포터가 같은
  유닛의 `words` 행에서 `normalizeAnswer` 기준으로 해석(resolve)한다
  (§5.4).

## 2. 최상위 JSON 구조

```
{
  "format": "paul-easy-voca/textbook-import",   // 필수, 고정 문자열
  "format_version": 1,                           // 필수, 이 스펙의 정수 버전
  "textbook": { ... },                           // 필수, 교재 1권
  "lessons": [ { ... }, ... ]                    // 필수, 1개 이상
}
```

## 3. 필드 매핑 표 (JSON → DB)

### 3.1 `textbook` → `textbooks`

| JSON 필드 | 타입/필수 | DB 컬럼 | 비고 |
|---|---|---|---|
| `name` | string, 필수 | `textbooks.name` | 전역 unique(스키마 제약). 멱등 매칭의 자연키(§6) |
| `publisher_name` | string, 선택 | `textbooks.publisher_name` | 미상이면 생략(null) — 추측 금지, v3.1 백필과 동일 원칙 |
| `owner_class_name` | string, 선택 | (해석용) → `textbooks.owner_class_id` | 임포터가 `classes.name`으로 해석. 생략 시 임포터 실행 인자로 컨테이너 반을 지정 |

### 3.2 `lessons[]` → `units`

| JSON 필드 | 타입/필수 | DB 컬럼 | 비고 |
|---|---|---|---|
| `name` | string, 필수 | `units.name` | 교재 내 unique 권장(예: "Unit 1"). 멱등 매칭 자연키의 일부(§6) |
| `position` | int, 선택 | (정렬용) | DB에 대응 컬럼이 확인되지 않음 — 배열 순서가 곧 표시 순서라는 전제로 기록만. 임포터는 배열 순서를 보존해 insert |
| — | — | `units.class_id` | JSON에 없음. 교재의 `owner_class_id`를 임포터가 채움 |
| — | — | `units.textbook_id` | JSON에 없음. 해석된 `textbooks.id`를 임포터가 채움 |

### 3.3 `lessons[].words[]` → `words` (선택 블록)

기존 단어 업로드 체계(관리자 화면)와 병행하는 선택 블록이다. 지문만
임포트할 때는 생략 가능.

| JSON 필드 | 타입/필수 | DB 컬럼 | 비고 |
|---|---|---|---|
| `word` | string, 필수 | `words.word` | |
| `meaning` | string, 필수 | `words.meaning` | |
| `accepted_meanings` | string[], 선택 | `words.accepted_meanings` (jsonb) | v2.0 채점 보조 정답 |
| — | — | `words.unit_id` | 임포터가 소속 유닛 id로 채움 |

주의: `words`의 전체 라이브 컬럼 목록은 `DATABASE.md`에 "역추적, 100%
일치 미확인"으로 기록돼 있다. 임포터 구현 시점에 실제 컬럼을 재확인할 것.

### 3.4 `lessons[].passages[]` → `passages`

| JSON 필드 | 타입/필수 | DB 컬럼 | 비고 |
|---|---|---|---|
| `title` | string, 필수 | `passages.title` | not null. 유닛 내 unique 권장 — 멱등 매칭 자연키(§6) |
| `position` | int, 선택 | `passages.position` | 생략 시 배열 인덱스(0부터) |
| — | — | `passages.unit_id` | 임포터가 소속 유닛 id로 채움 |

### 3.5 `lessons[].passages[].sentences[]` → `passage_sentences`

| JSON 필드 | 타입/필수 | DB 컬럼 | 비고 |
|---|---|---|---|
| `english` | string, 필수 | `passage_sentences.english` | not null·비어있으면 안 됨(`validatePassage`와 동일 규칙) |
| `korean` | string, 선택 | `passage_sentences.korean` | 생략 시 `''`(스키마 default) |
| `position` | int, 선택 | `passage_sentences.position` | 생략 시 배열 인덱스. 로드 시 `normalizeSentences`가 0..n-1로 재색인하므로 구멍/중복이 있어도 치명적이진 않으나, 임포터는 0..n-1 연속값으로 저장 |
| `is_key_sentence` | boolean, 선택 | `passage_sentences.is_key_sentence` | 생략 시 `false`(default). 핵심 문장만 6단계 학습 진입 |
| `importance_level` | int(1..5), 선택 | `passage_sentences.importance_level` | 생략 시 `1`. CHECK(1..5). 라벨 기준은 `06-exam-importance-standards.md` |
| `grammar_point` | string, 선택 | `passage_sentences.grammar_point` | 한 줄 텍스트. 표준 문구는 `05-grammar-taxonomy.md` |
| `chunks` | string[], 선택 | `passage_sentences.chunks` (jsonb) | 유효 조건: 비어있지 않은 문자열 **2개 이상** 배열(아니면 클라이언트 `chunksOf`가 단일 청크 폴백). 작성 지침은 `03-chunking-guidelines.md` |
| `linked_words` | string[], 선택 | → `sentence_words` 행들 | 단어 **문자열** 배열. 임포터가 같은 유닛 `words`에서 해석(§5.4) |

### 3.6 `linked_words` 해석 결과 → `sentence_words`

| 값 | DB 컬럼 | 비고 |
|---|---|---|
| (해석된 문장 id) | `sentence_words.sentence_id` | |
| (해석된 단어 id) | `sentence_words.word_id` | `unique(sentence_id, word_id)` — 중복 연결은 스키마가 거부 |

## 4. JSON 예시

### 4.1 예시 A — 단순(필수 필드만, 지문 1개)

```json
{
  "format": "paul-easy-voca/textbook-import",
  "format_version": 1,
  "textbook": {
    "name": "중2 능률 김기택"
  },
  "lessons": [
    {
      "name": "Unit 1",
      "passages": [
        {
          "title": "My New School",
          "sentences": [
            { "english": "I go to a new school." },
            { "english": "My school has a big library." },
            { "english": "I like reading books there." }
          ]
        }
      ]
    }
  ]
}
```

### 4.2 예시 B — 전체 필드(단어/학습 메타/연결 포함)

```json
{
  "format": "paul-easy-voca/textbook-import",
  "format_version": 1,
  "textbook": {
    "name": "중2 미래엔 최연희",
    "publisher_name": "미래엔",
    "owner_class_name": "중2 미래엔 최연희"
  },
  "lessons": [
    {
      "name": "Unit 3",
      "position": 2,
      "words": [
        { "word": "library", "meaning": "도서관" },
        { "word": "borrow", "meaning": "빌리다", "accepted_meanings": ["빌려오다"] }
      ],
      "passages": [
        {
          "title": "A Day at the Library",
          "position": 0,
          "sentences": [
            {
              "english": "Yesterday, I went to the library with my sister.",
              "korean": "어제 나는 여동생과 함께 도서관에 갔다.",
              "position": 0,
              "is_key_sentence": true,
              "importance_level": 4,
              "grammar_point": "과거시제(went) + 전치사구 with",
              "chunks": ["Yesterday,", "I went", "to the library", "with my sister."],
              "linked_words": ["library"]
            },
            {
              "english": "We borrowed three books about science.",
              "korean": "우리는 과학에 관한 책 세 권을 빌렸다.",
              "position": 1,
              "is_key_sentence": true,
              "importance_level": 5,
              "grammar_point": "과거시제(borrowed)",
              "chunks": ["We borrowed", "three books", "about science."],
              "linked_words": ["borrow"]
            },
            {
              "english": "It was a really fun day.",
              "korean": "정말 즐거운 하루였다.",
              "position": 2,
              "is_key_sentence": false,
              "importance_level": 2
            }
          ]
        }
      ]
    }
  ]
}
```

## 5. 검증 규칙 (임포터가 저장 전에 전부 검사)

검증 실패 시 **아무것도 저장하지 않고** 오류 목록 전체를 보고한다
(부분 임포트 금지 — all-or-nothing).

### 5.1 구조

1. `format` === `"paul-easy-voca/textbook-import"`, `format_version`은
   임포터가 아는 정수(현재 1). 아니면 즉시 거부.
2. `textbook.name` 비어있지 않은 문자열.
3. `lessons` 길이 ≥ 1, 각 `lessons[].name` 비어있지 않은 문자열.
4. 같은 파일 안에서 lesson `name` 중복 금지, 같은 lesson 안에서 passage
   `title` 중복 금지(멱등 자연키가 무너지므로, §6).

### 5.2 지문/문장 (`src/utils/readingModel.js` `validatePassage`와 일치)

5. 각 passage: `title` 필수, `sentences` 길이 ≥ 1.
6. 각 sentence: `english` trim 후 비어있지 않아야 함. `korean`은 선택
   (빈 문자열 허용).

### 5.3 학습 메타 (v3.4 스키마·`sentenceLearning.js`와 일치)

7. `importance_level`이 있으면 1..5 정수(DB CHECK와 동일).
8. `is_key_sentence`가 있으면 boolean.
9. `chunks`가 있으면: 문자열 배열이고, trim 후 비어있지 않은 원소가
   **2개 이상**이어야 유효. 1개 이하면 오류가 아니라 **경고 + 필드
   드롭**(null 저장)을 권장 — 클라이언트 `chunksOf`가 어차피 단일 청크로
   폴백하므로 저장할 가치가 없다.
10. `chunks`가 있으면 청크들을 공백 1칸으로 이어붙인 결과가
    `normalizeAnswer` 기준으로 `english`와 일치해야 한다(청크 누락/오타
    감지). 불일치는 오류.

### 5.4 단어 연결

11. `linked_words`의 각 문자열은 같은 lesson의 `words[]`(또는 임포트
    시점에 그 유닛에 이미 존재하는 `words` 행) 중 하나와
    `normalizeAnswer` 기준으로 일치해야 한다. 불일치는 오류(추측 매칭
    금지). 학생/단어 식별은 항상 id(UUID)로 — 해석은 임포트 시 1회만
    하고 이후엔 FK로만 참조한다(CLAUDE.md 규칙 4의 정신).

## 6. 멱등 임포트 전략 (향후 구현용 — 지금 구현 금지)

같은 파일을 두 번 실행해도 중복 행이 생기지 않아야 한다. 원칙:
**자연키 upsert, 삭제 없음**(파괴적 구문 0 — 이 저장소 마이그레이션
관례와 동일).

| 계층 | 자연키 | 동작 |
|---|---|---|
| textbook | `textbooks.name` (DB unique) | 있으면 재사용, 없으면 insert. `publisher_name`은 기존 값이 null일 때만 채움(덮어쓰기 금지) |
| unit | `(textbook_id, units.name)` | 있으면 재사용, 없으면 insert(`class_id` = 교재 owner_class_id) |
| word | `(unit_id, normalizeAnswer(word))` | 있으면 재사용, 없으면 insert |
| passage | `(unit_id, title)` | 있으면 재사용, 없으면 insert |
| sentence | `(passage_id, position)` | 있으면 **update**(english/korean/메타 갱신), 없으면 insert. 파일보다 DB에 문장이 더 많아도 **삭제하지 않고** 초과분을 보고만 한다 |
| sentence_word | `(sentence_id, word_id)` (DB unique) | `on conflict do nothing` |

추가 원칙:

- **DDL 없음**: 임포터는 DML(insert/update)만 수행한다. 스키마 변경이
  필요하면 `supabase_v{n}_*.sql` 파일 준비 후 운영자 수동 실행
  (CLAUDE.md 규칙 8).
- **삭제성 구문 0**: delete/truncate 금지. 기존 행 축소가 필요한 상황은
  임포터 범위 밖 — 보고 후 운영자 판단.
- **드라이런 필수**: 실제 쓰기 전에 "insert N건 / update N건 / skip
  N건 / 경고 목록"을 출력하는 `--dry-run` 모드를 기본값으로 한다.
- **폴백 안전**: v3.4 컬럼(`is_key_sentence` 등)이 아직 없는 DB에
  실행되면 42703을 감지해 해당 필드를 제외하고 v3.3 필드만 저장
  (클라이언트 cascading 폴백과 같은 정신, CLAUDE.md 규칙 9).

## 7. 관련 문서

- 문장 자동 분리(붙여넣기 보조): `02-sentence-splitting-rules.md`
- 청크 작성 지침: `03-chunking-guidelines.md`
- 빈칸 규칙(임포트와 무관하게 런타임 결정): `04-blank-generation-rules.md`
- `grammar_point` 표준 문구: `05-grammar-taxonomy.md`
- `importance_level` 기준: `06-exam-importance-standards.md`
