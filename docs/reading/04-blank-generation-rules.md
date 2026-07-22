# 04 — 결정론 빈칸 생성 규칙 (Blank Generation Rules)

- **목적**: 문장 학습 `one_blank` 단계의 빈칸 선택 규칙을 문서화한다.
  이 규칙의 **진실 원천은 코드**(`src/utils/sentenceLearning.js`의
  `pickBlank`)이며, 이 문서는 그 구현을 사람이 읽을 수 있게 옮기고
  예시·확장점을 덧붙인 것이다. 문서와 코드가 어긋나면 코드가 맞고 문서를
  고쳐야 한다.
- **버전**: 1.0
- **작성일**: 2026-07-23

## 1. 설계 원칙

1. **결정론** — 같은 문장 + 같은 유닛 단어 목록이면 항상 같은 빈칸이
   나온다. 무작위 함수 사용 금지(하네스가 코드 레벨로 단언).
2. **학습 연계 우선** — 유닛에서 배운 단어가 문장에 있으면 그 단어를
   빈칸으로 뚫어 "단어를 문장 속에서 복습"하게 한다.
3. **정직한 naive** — 품사 분석기가 아니다. 흔한 동사 목록 + 어미
   휴리스틱 + 기능어 제외 목록까지만 쓴다(초등~중등 문장 수준에서
   자연스러운 빈칸이 목표).

## 2. 우선순위 규칙

빈칸 후보(eligible) 토큰 중에서 아래 순서로 **처음 걸리는 것 하나**를
선택한다(단일 빈칸).

| 순위 | 규칙 | 선택 방식 |
|---|---|---|
| ① | **유닛 어휘 일치** — 토큰이 유닛 단어 목록의 어떤 단어와 `normalizeAnswer` 기준으로 **정확히** 일치 | 문장 앞에서부터 첫 일치 |
| ② | **동사로 보이는 토큰** — 흔한 동사 목록(`COMMON_VERBS`) 포함 또는 길이 4 이상이면서 `-ed`/`-ing`로 끝남 | 문장 앞에서부터 첫 일치 |
| ③ | **마지막 내용어** — 기능어(`FUNCTION_WORDS`) 제외 후 마지막 토큰. 전부 기능어면 마지막 eligible 토큰 | 문장 뒤에서 선택 |

후보가 하나도 없으면 `null`을 반환한다(빈칸 문제 생성 불가 — 호출측이
이 단계를 건너뛴다).

## 3. 절대 제외 (빈칸이 될 수 없는 토큰)

- **관사** `a` / `an` / `the`
- **구두점뿐인 토큰** — 앞뒤 구두점을 벗긴 core가 빈 문자열
- **1글자 토큰** — 정규화 후 길이 2 미만 (`I`, `a` 등)

주의: `he`/`she`/`in`/`of` 같은 기능어는 ③의 **폴백에서만** 제외될 뿐
절대 제외는 아니다 — 이론상 ①(유닛 단어로 등록된 경우)로는 선택될 수
있다.

## 4. 현행 구현과의 대응 관계 (실측)

| 문서 개념 | 구현 (`src/utils/sentenceLearning.js`) |
|---|---|
| 토큰화 | `sentence.split(/\s+/)` — 공백 분할 |
| core(정답 원형) | 토큰 앞뒤에서 영숫자/어퍼스트로피가 아닌 문자 제거: `tok.replace(/^[^A-Za-z0-9']+\|[^A-Za-z0-9']+$/g, '')` |
| norm(비교용) | `normalizeAnswer(core)` — 소문자화, `. , ! ? ' " ‘ ’ “ ” …` 제거, 연속 공백 축약, trim (`Don't` → `dont`) |
| eligible | `norm.length >= 2 && !ARTICLES.includes(norm)` |
| ① 유닛 어휘 | `unitWordSlugs`를 `normalizeAnswer`로 정규화한 Set과 norm 동등 비교(부분 문자열 매칭 아님) |
| ② 동사 판정 | `isVerbish`: `COMMON_VERBS` 목록(약 60개) 포함 또는 `len >= 4 && (endsWith('ed') \|\| endsWith('ing'))` |
| ③ 기능어 제외 | `FUNCTION_WORDS`: 관사 + 전치사류(in/on/at/to/of/for/with/from/by/up/down) + 접속·부정(and/or/but/so/not/no) + 대명사·한정사류(he/she/it/we/they/you/his/her/its/their/my/your/our/me/him/them/us/this/that) |
| 반환값 | `{ blankIndex, answer, display }` — `answer`는 core(원문 대소문자 보존), `display`는 해당 토큰의 core만 `_____`로 치환(앞뒤 구두점 보존) |
| 채점 | `checkBlank(input, answer)` — 양쪽 `normalizeAnswer` 후 동등 비교(대소문자/구두점/공백 차이는 오답 아님, 빈 정답은 항상 오답) |

의도적 한계(코드 주석에 명시):

- **3인칭 단수 `-s`는 어미 휴리스틱에서 제외** — 복수 명사와 구분
  불가하기 때문. 목록에 있는 3인칭 단수형(`likes`, `goes` 등)만 잡힌다.
- **`-ing` 휴리스틱의 거짓 양성** — `morning`, `king` 같은 명사도
  동사로 오판될 수 있다(§5 예시 19).
- ③의 "명사"는 실제 품사 판정이 아니라 "기능어가 아닌 마지막 토큰"이다.

유닛 단어 목록(`unitWordSlugs`)의 공급: 호출측이 유닛의 `words` 행에서
문자열 배열로 전달한다. `sentence_words` 테이블(v3.4)은 문장↔단어 수동
연결의 저장소로, pickBlank의 유닛 단어 우선 선택 등에서 소비 예정이라고
스키마에 기록돼 있다(연결 UI는 아직 없음).

## 5. 예시 (규칙별)

표기: 유닛 단어는 `[...]`, 선택 결과는 `answer` / `display`.

### ① 유닛 어휘 일치

| # | 문장 | 유닛 단어 | answer | display | 비고 |
|---|---|---|---|---|---|
| 1 | `I like apples.` | `[apples]` | `apples` | `I like _____.` | ②의 `like`보다 ①이 우선 |
| 2 | `My father is a teacher.` | `[teacher]` | `teacher` | `My father is a _____.` | 토큰의 마침표는 display에 보존 |
| 3 | `I love SUMMER.` | `[summer]` | `SUMMER` | `I love _____.` | 비교는 정규화, answer는 원문 대소문자 보존 |
| 4 | `He likes apples and bananas.` | `[apples, bananas]` | `apples` | `He likes _____ and bananas.` | 앞에서부터 첫 일치 — 결정론 |
| 5 | `We visited the museum.` | `[museum]` | `museum` | `We visited the _____.` | 더 앞의 동사(`visited`)보다 ① 우선 |
| 6 | `I like apples.` | `[app]` | `like` | `I _____ apples.` | 부분 문자열은 매칭 안 됨 → ① 불발, ②로 |

### ② 동사로 보이는 토큰

| # | 문장 | 유닛 단어 | answer | display | 비고 |
|---|---|---|---|---|---|
| 7 | `I like apples.` | `[]` | `like` | `I _____ apples.` | `like` ∈ COMMON_VERBS |
| 8 | `The dog runs fast.` | `[]` | `runs` | `The dog _____ fast.` | 목록의 3인칭 단수형 |
| 9 | `She is happy.` | `[]` | `is` | `She _____ happy.` | be동사도 목록에 있음 |
| 10 | `I am a boy.` | `[]` | `am` | `I _____ a boy.` | `I`는 1글자라 제외, `am`이 첫 후보 |
| 11 | `She walked to school.` | `[]` | `walked` | `She _____ to school.` | `-ed` 어미 휴리스틱 |
| 12 | `Where is my bag?` | `[]` | `is` | `Where _____ my bag?` | 물음표 보존 |
| 13 | `He said, "Stop!"` | `[]` | `said` | `He _____, "Stop!"` | 쉼표/따옴표 보존 |

### ③ 마지막 내용어 폴백

| # | 문장 | 유닛 단어 | answer | display | 비고 |
|---|---|---|---|---|---|
| 14 | `What a beautiful flower!` | `[]` | `flower` | `What a beautiful _____!` | 동사 없음 → 마지막 내용어 |
| 15 | `A book on the desk.` | `[]` | `desk` | `A book on the _____.` | 관사·전치사 제외 후 마지막 |
| 16 | `The weather in Busan today.` | `[]` | `today` | `The weather in Busan _____.` | |
| 17 | `The trip from Seoul to Busan.` | `[]` | `Busan` | `The trip from Seoul to _____.` | `from`/`to`는 기능어 제외 |
| 18 | `Don't touch it.` | `[]` | `touch` | `Don't _____ it.` | `dont`는 목록에 없어 ② 불발 — `it`은 기능어라 `touch`가 마지막 내용어 |

### 한계·엣지 케이스

| # | 문장 | 유닛 단어 | answer | display | 비고 |
|---|---|---|---|---|---|
| 19 | `Good morning, everyone.` | `[]` | `morning` | `Good _____, everyone.` | **거짓 양성**: `-ing` 휴리스틱이 명사 `morning`을 동사로 오판(문서화된 한계 — 결과 자체는 학습상 무해) |
| 20 | `He opens the door.` | `[]` | `door` | `He opens the _____.` | **미탐**: `opens`는 목록에 없고 `-s`는 휴리스틱 제외 → ③ 폴백으로 명사 선택 |
| 21 | `You and me.` | `[]` | `me` | `You and _____.` | 전부 기능어 → 마지막 eligible 토큰 폴백 |
| 22 | `A b c.` | `[]` | — | — | 후보 0개(전부 관사/1글자) → `null` 반환, 호출측이 단계 스킵 |

## 6. 향후 개선 확장점 (지금 구현 금지 — 스펙만)

1. **품사 사전(POS lexicon) 도입** — 교과서 어휘 수준의 소형 품사 사전
   (단어 → 품사 태그)을 정적 데이터로 추가하면 ②/③의 휴리스틱 오판
   (예시 19·20)을 줄일 수 있다. 외부 패키지가 아니라 저장소 내 정적
   JSON/모듈로(CLAUDE.md 규칙 6), `pickBlank`의 우선순위 구조는 유지한
   채 판정 함수만 교체 가능하게.
2. **`sentence_words` 연결 소비** — 교사가 수동 연결한 문장↔단어를
   `unitWordSlugs`보다 앞선 0순위로 쓰는 확장(연결이 있으면 그 단어를
   빈칸으로). 연결 UI가 생기는 라운드에서 함께.
3. **다중 빈칸** — 현행은 단일 빈칸 고정. 확장 시에도 선택은 결정론이어야
   하고(시드 결정론 셔플 관례), 기존 단일 빈칸 반환 계약을 깨지 않는
   별도 함수로 추가한다(CLAUDE.md 규칙 1·3).

어떤 개선이든 §5의 예시는 하네스 테스트 케이스로 옮겨 회귀 기준선으로
삼는다 — 특히 "현행 일치" 예시들이 깨지면 회귀다.
