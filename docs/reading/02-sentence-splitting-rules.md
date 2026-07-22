# 02 — 자동 문장 분리 규칙 (Sentence Splitting Rules)

- **목적**: 영어 지문 원문을 문장 단위로 자동 분리할 때 따라야 할 목표
  규칙을 정의하고, 현행 구현(`splitPassageText`)의 의도적 한계를 명시하며,
  향후 개선 구현이 통과해야 할 테스트 케이스를 제공한다. **이 문서는
  스펙이며, 지금 코드를 바꾸라는 지시가 아니다.**
- **버전**: 1.0
- **작성일**: 2026-07-23

## 1. 현행 구현과 그 한계 (실측, `src/utils/readingModel.js`)

현행 `splitPassageText(text)`는 다음이 전부다:

- `raw.match(/[^.!?]+[.!?]*/g)` — "종결부호(`.` `!` `?`)가 아닌 글자들 +
  종결부호(연속 허용)" 덩어리로 자른 뒤 trim, 빈 조각 제거.
- lookbehind 정규식을 쓰지 않는다(구형 Safari에서 파싱 시점 SyntaxError로
  번들 전체가 깨질 수 있음 — 관리자 전용 기능이 학생 기기 안정성을 해치면
  안 됨, CLAUDE.md 규칙 1).
- 결정적(같은 입력 → 항상 같은 출력), 빈/공백 입력은 `[]`.

**정직한 한계(코드 주석에 명시된 의도적 단순화)** — 다음 경우 전부
잘못 자른다:

| 한계 | 예 | 현행 결과 |
|---|---|---|
| 약어 뒤 마침표 | `Mr. Kim is here.` | `["Mr.", "Kim is here."]` |
| 소수점/금액 | `Pi is 3.14.` | `["Pi is 3.", "14."]` |
| 인용부호 밖 배치 | `He said, "Stop!" and left.` | `["He said, "Stop!", "" and left."]` (닫는 따옴표가 다음 조각으로 밀림) |
| 괄호 안 종결부호 | `(See p. 12.) Next.` | 괄호 무시하고 분리 |
| 유니코드 말줄임 `…` | `Wait… What?` | `…`가 종결부호가 아니라서 한 덩어리로 붙음 |

이 한계는 "관리자 편집기에서 분할 결과를 눈으로 확인·수정하는 전제의
보조 도구"라는 설계 판단의 결과다. 아래 §2~§3은 그 전제를 유지하면서
자동 분할의 정확도를 올리고 싶을 때의 목표 스펙이다.

## 2. 목표 규칙

입력을 왼쪽부터 스캔하며, 종결 후보(`.` `!` `?` `…` 및 이들의 연속)를
만나면 아래 규칙으로 "여기서 문장이 끝나는가"를 판정한다.

### R1. 약어 — 마침표가 약어의 일부면 분리하지 않는다

- 약어 목록(대소문자 구분, 마침표 포함 토큰 그대로 매칭):
  `Mr.` `Mrs.` `Ms.` `Dr.` `Prof.` `St.` `Mt.` `Jr.` `Sr.` `vs.` `etc.`
  `e.g.` `i.e.` `a.m.` `p.m.` `No.` `U.S.` `U.K.` `U.N.` `Jan.`~`Dec.`
  (월 약어 12종)
- 단, `etc.`처럼 **문장 끝에도 자연스럽게 오는 약어**는 다음 토큰이
  대문자로 시작하면 문장 끝으로 판정한다(예외 규칙 R1-1). 나머지 약어
  (`Mr.` 등 호칭류, `e.g.`/`i.e.`)는 항상 비분리.

### R2. 숫자 — 숫자 사이의 마침표는 소수점이다

- `숫자 . 숫자` 패턴(`3.14`, `1.50`, `2.5`)의 마침표에서는 분리하지
  않는다. 통화기호(`$1.50`)·단위(`2.5 km`)가 붙어도 동일.
- 소수로 끝나는 문장(`...costs $1.50.`)은 마지막 마침표(숫자 뒤이지만
  그 뒤에 숫자가 없음)에서 정상 분리한다.

### R3. 인용문 — 종결부호 직후의 닫는 따옴표는 문장에 포함한다

- `." `.'` `!"` `?"` 등 "종결부호 + 닫는 따옴표(`"` `'` `”` `’`)"는
  닫는 따옴표까지 포함해 문장을 끝낸다.
- 단, 닫는 따옴표 뒤가 **소문자로 이어지거나 인용 동사 절**(`he said`,
  `she asked` 등)이면 문장이 계속되는 것이므로 분리하지 않는다(R3-1).
  예: `"Stop!" he shouted.`는 한 문장.

### R4. 괄호 — 괄호가 열려 있는 동안은 분리하지 않는다

- `(`~`)` 내부의 `.` `!` `?`에서는 분리하지 않는다.
- 괄호로만 이루어진 완결 문장(`(See page 12.)`)은 닫는 괄호까지 포함해
  한 문장으로 끝낸다.

### R5. 말줄임 — `...`(3점)과 `…`(U+2026)은 동등하게 취급한다

- 말줄임 뒤가 대문자 시작이면 문장 끝, 소문자 시작이면 같은 문장의
  휴지(pause)로 보고 분리하지 않는다.

### R6. 공통

- `?!` `!!` `!?` 등 연속 종결부호는 하나의 종결로 묶는다(현행과 동일).
- 종결부호 없는 마지막 꼬리 문장도 버리지 않고 보존한다(현행과 동일).
- 줄바꿈/연속 공백은 공백 1칸으로 취급, 각 문장은 trim.
- 결정적이어야 한다(같은 입력 → 항상 같은 출력). 무작위/외부 API 금지
  (CLAUDE.md 규칙 6·7).
- 어떤 개선 구현도 **lookbehind 정규식 금지** 제약을 유지한다(§1).

## 3. 테스트 케이스 (입력 → 기대 출력)

기대 출력은 §2 목표 규칙 기준이다. "현행" 열은 현행 `splitPassageText`가
이미 이 기대와 일치하는지(=회귀 기준선인지, 개선 대상인지)를 표시한다.

| # | 분류 | 입력 | 기대 출력 | 현행 일치 |
|---|---|---|---|---|
| 1 | 기본 | `I like apples. She likes bananas.` | `["I like apples.", "She likes bananas."]` | O |
| 2 | 기본 | `Do you like it? Yes, I do!` | `["Do you like it?", "Yes, I do!"]` | O |
| 3 | 기본 | `Wait What?!` | `["Wait What?!"]` | O |
| 4 | 기본 | `This is the end` (종결부호 없음) | `["This is the end"]` | O |
| 5 | 기본 | `  ` (공백뿐) | `[]` | O |
| 6 | 기본 | `One.\nTwo.\nThree.` (줄바꿈 구분) | `["One.", "Two.", "Three."]` | O |
| 7 | 기본 | `Really?? No way!!` | `["Really??", "No way!!"]` | O |
| 8 | 약어 | `Mr. Kim is my teacher.` | `["Mr. Kim is my teacher."]` | X |
| 9 | 약어 | `Mrs. Park teaches English. Mr. Lee teaches math.` | `["Mrs. Park teaches English.", "Mr. Lee teaches math."]` | X |
| 10 | 약어 | `Dr. Smith works at the hospital.` | `["Dr. Smith works at the hospital."]` | X |
| 11 | 약어 | `Ms. Choi is kind.` | `["Ms. Choi is kind."]` | X |
| 12 | 약어 | `I visited the U.S. last year.` | `["I visited the U.S. last year."]` | X |
| 13 | 약어 | `The U.S. is big. The U.K. is small.` | `["The U.S. is big.", "The U.K. is small."]` | X |
| 14 | 약어 | `The class starts at 9 a.m. and ends at 3 p.m.` | `["The class starts at 9 a.m. and ends at 3 p.m."]` | X |
| 15 | 약어 | `Bring fruits, e.g. apples and pears.` | `["Bring fruits, e.g. apples and pears."]` | X |
| 16 | 약어(R1-1) | `I like dogs, cats, etc. They are cute.` | `["I like dogs, cats, etc.", "They are cute."]` | X |
| 17 | 약어 | `Prof. Han lives on Mt. Halla Street.` | `["Prof. Han lives on Mt. Halla Street."]` | X |
| 18 | 숫자 | `Pi is about 3.14.` | `["Pi is about 3.14."]` | X |
| 19 | 숫자 | `The juice costs $1.50.` | `["The juice costs $1.50."]` | X |
| 20 | 숫자 | `It is 2.5 km from here. Let's walk.` | `["It is 2.5 km from here.", "Let's walk."]` | X |
| 21 | 숫자 | `He got 99.9 points! Amazing!` | `["He got 99.9 points!", "Amazing!"]` | X |
| 22 | 숫자 | `Open your book to No. 7.` | `["Open your book to No. 7."]` | X |
| 23 | 인용 | `He said, "I am happy." Then he smiled.` | `["He said, \"I am happy.\"", "Then he smiled."]` | X |
| 24 | 인용 | `"Stop!" he shouted.` | `["\"Stop!\" he shouted."]` | X |
| 25 | 인용 | `She asked, "Where are you going?" I didn't answer.` | `["She asked, \"Where are you going?\"", "I didn't answer."]` | X |
| 26 | 인용 | `"Let's go!" said Tom. "Okay," said Jane.` | `["\"Let's go!\" said Tom.", "\"Okay,\" said Jane."]` | X |
| 27 | 인용 | `My favorite word is "hope." It keeps me going.` | `["My favorite word is \"hope.\"", "It keeps me going."]` | X |
| 28 | 인용 | `He whispered, 'Be quiet.' We stopped talking.` | `["He whispered, 'Be quiet.'", "We stopped talking."]` | X |
| 29 | 괄호 | `Read the note (see p. 12) before class.` | `["Read the note (see p. 12) before class."]` | X |
| 30 | 괄호 | `(Don't be late.) The bus leaves at nine.` | `["(Don't be late.)", "The bus leaves at nine."]` | X |
| 31 | 괄호 | `He won first prize (wow!) at the contest.` | `["He won first prize (wow!) at the contest."]` | X |
| 32 | 말줄임 | `Well... I think so.` | `["Well... I think so."]` | X |
| 33 | 말줄임 | `He waited and waited... Nothing happened.` | `["He waited and waited...", "Nothing happened."]` | X |
| 34 | 말줄임 | `Wait… What is that?` | `["Wait…", "What is that?"]` | X |
| 35 | 말줄임 | `Maybe… maybe not.` | `["Maybe… maybe not."]` | X |
| 36 | 복합 | `Mr. Kim said, "The test is at 9 a.m." We nodded.` | `["Mr. Kim said, \"The test is at 9 a.m.\"", "We nodded."]` | X |
| 37 | 복합 | `The book costs $3.50. Dr. Lee bought it.` | `["The book costs $3.50.", "Dr. Lee bought it."]` | X |

주의:

- 표의 `\"`는 마크다운 표기용 이스케이프일 뿐, 실제 기대값은 큰따옴표
  문자 자체다. `\n`은 실제 줄바꿈.
- "현행 일치: O"인 7개(#1~7)는 **회귀 기준선**이다 — 어떤 개선도 이
  7개를 깨면 안 된다(CLAUDE.md 규칙 1).
- 개선 구현 시 이 표를 `tests/harness/` 하네스(예: `runReading.mjs`
  확장)에 그대로 옮겨 단언할 것. 하네스 등록(`registry.mjs`)은 코드
  영역이므로 implementer가 수행한다.

## 4. 스펙이 다루지 않는 것 (의도적 범위 제외)

- 완전한 자연어 문장 경계 인식(ML 기반 등) — 외부 의존성 최소화 원칙
  (CLAUDE.md 규칙 6)과 "관리자가 눈으로 확인·수정" 전제에 따라 목록/패턴
  기반 규칙까지만 다룬다.
- 한국어 문장 분리 — 지문 원문은 영어이고, `korean`은 문장 단위로
  교사가 직접 입력한다.
