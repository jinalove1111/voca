# 05 — 문법 분류 체계 (Grammar Taxonomy)

- **목적**: `passage_sentences.grammar_point`(한 줄 텍스트, v3.4)에 적는
  문법 포인트를 한국 중학 교육과정과 호환되는 분류 체계로 표준화한다.
  자유 텍스트 필드이므로 시스템이 강제하지 않는다 — 이 문서는 입력
  일관성을 위한 **작성 표준**이다(검색/집계 기능이 생길 때 이 표준 문구가
  그대로 필터 값이 될 수 있도록).
- **버전**: 1.0
- **작성일**: 2026-07-23

## 1. 필드 사실관계 (실측)

- `passage_sentences.grammar_point` — `text`, nullable, 기본값 없음
  (`supabase_v3_4_sentence_learning.sql`). 스키마 주석: "교사가 적는 문법
  포인트 한 줄(선택)".
- 학생 화면 채점/단계 전이에 관여하지 않는다 — 표시·교습용 메타다.
  따라서 표준을 벗어난 자유 서술도 시스템을 깨뜨리지 않지만, 일관성을
  위해 아래 표준 문구를 권장한다.

## 2. 입력 표준 문구 형식

```
<표준 분류명>                      예: 수동태(be+p.p.)
<표준 분류명>(<이 문장의 실제 형태>) 예: 관계대명사 who(주격)
<포인트1> + <포인트2>              예: 과거시제(went) + 전치사구 with
```

- 한 줄, **35자 이내 권장**. 포인트는 최대 2개까지만 `+`로 연결(그 이상은
  핵심 1~2개만 남긴다).
- 괄호 안에는 그 문장에 실제로 나온 형태(단어/구)를 적을 수 있다.
- 분류명은 §4 표의 "표준 문구" 열을 그대로 쓴다(띄어쓰기 포함).

## 3. 학년별 매핑

2015/2022 개정 교육과정 기반의 **대표적 배치**다. 출판사/교재별로 단원
배치가 다르므로 절대 기준이 아니라 기본값으로 쓰고, 실제 교재 목차가
우선한다.

| 학년 | 주요 문법 항목 |
|---|---|
| 중1 | 인칭대명사·be동사, 일반동사 현재/과거, 현재진행형, 미래(will / be going to), 조동사(can/may/must), 명령문·제안문, 감탄문, There is/are, 비교급·최상급 기초, 접속사(and/but/or/so/when/because), 부정대명사(one), 빈도부사 |
| 중2 | 현재완료, to부정사(명사적/형용사적/부사적), 동명사, 수동태 기초, 접속사(if/that/although), 비교 구문 확장(as~as, 배수), 관계대명사(who/which/that) 기초, 지각동사·사역동사, 의문사+to부정사, 부가의문문, 재귀대명사 |
| 중3 | 현재완료 심화(완료진행), 과거완료, 수동태 확장(조동사/4·5형식 수동태), 관계대명사 심화(소유격 whose, what, 계속적 용법), 관계부사(where/when/why/how), 분사(명사 수식)·분사구문, 가정법 과거/과거완료, 간접의문문, it 가주어·가목적어, too~to / enough to, 화법 전환, so~that |

## 4. 분류 체계와 표준 문구

### 4.1 문장 기초

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `1형식(S+V)` ~ `5형식(S+V+O+OC)` | 문장의 형식 | The sun rises. / She made me happy. |
| `There is/are` | 존재문 | There are two books on the desk. |
| `명령문` | 동사원형 시작 / Don't | Open your book. / Don't run. |
| `제안문(Let's)` | Let's + 동사원형 | Let's go on a picnic. |
| `감탄문(What/How)` | What a ~! / How ~! | What a beautiful flower! |
| `부가의문문` | ~, isn't it? | It's cold, isn't it? |

### 4.2 시제

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `현재시제` | 습관·사실 | I get up at seven. |
| `과거시제` | 규칙/불규칙 과거형 | We visited Jeju last year. |
| `미래(will)` | will + 동사원형 | I will call you tomorrow. |
| `미래(be going to)` | be going to + 동사원형 | It is going to rain. |
| `현재진행형` | am/is/are + -ing | She is reading a book. |
| `과거진행형` | was/were + -ing | We were watching TV. |
| `현재완료(경험)` | have p.p. + ever/never/before | Have you ever been to Busan? |
| `현재완료(계속)` | have p.p. + for/since | He has lived here since 2020. |
| `현재완료(완료)` | have p.p. + just/already/yet | I have just finished my homework. |
| `현재완료(결과)` | have p.p. | She has lost her umbrella. |
| `과거완료` | had p.p. | The train had already left. |

### 4.3 조동사

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `조동사 can(능력)` / `조동사 can(허가)` | can + 동사원형 | I can swim. / Can I come in? |
| `조동사 must(의무)` / `조동사 must(추측)` | must + 동사원형 | You must wear a helmet. / He must be tired. |
| `조동사 should` | should + 동사원형 | You should drink more water. |
| `조동사 may` | 허가/추측 | It may snow tonight. |
| `have to` | 의무 / don't have to(불필요) | You don't have to worry. |
| `had better` | 강한 충고 | You had better hurry. |
| `used to` | 과거의 습관 | I used to live in Busan. |
| `would like to` | 정중한 희망 | I would like to join the club. |

### 4.4 수동태

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `수동태(be+p.p.)` | be + 과거분사 (+ by 행위자) | This bridge was built in 1990. |
| `조동사 수동태` | 조동사 + be + p.p. | The work must be done today. |
| `수동태(by 이외 전치사)` | be known for/to, be covered with 등 | The mountain is covered with snow. |

### 4.5 to부정사

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `to부정사(명사적)` | 주어/목적어/보어 | I want to be a doctor. |
| `to부정사(형용사적)` | 명사 수식 | I have homework to do. |
| `to부정사(부사적-목적)` | ~하기 위해 | She went out to buy milk. |
| `to부정사(부사적-감정원인)` | 감정형용사 + to | We were happy to hear the news. |
| `의문사+to부정사` | what/how/where + to | I don't know what to say. |
| `too~to` | 너무 ~해서 …할 수 없다 | He is too young to drive. |
| `enough to` | ~할 만큼 충분히 | She is old enough to travel alone. |
| `It(가주어)~to` | It is ~ to부정사 | It is important to eat breakfast. |

### 4.6 동명사

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `동명사(주어)` | -ing가 주어 | Reading books is fun. |
| `동명사(목적어)` | enjoy/finish/mind + -ing | She enjoys taking pictures. |
| `동명사(전치사의 목적어)` | 전치사 + -ing | Thank you for helping me. |
| `동명사 vs to부정사` | remember/forget/try 의미 차이 | Remember to lock the door. |

### 4.7 분사·분사구문

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `현재분사(명사 수식)` | -ing가 명사 수식 | The sleeping baby is my cousin. |
| `과거분사(명사 수식)` | p.p.가 명사 수식 | This is a book written in English. |
| `분사구문` | 부사절 축약 | Walking along the beach, I found a starfish. |

### 4.8 비교

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `원급 비교(as~as)` | as + 원급 + as | She runs as fast as her brother. |
| `비교급(than)` | -er/more ~ than | My bag is heavier than yours. |
| `최상급` | the -est/most ~ | This is the tallest building in our city. |
| `비교급 강조(much)` | much/even/far + 비교급 | Today is much colder than yesterday. |
| `the 비교급, the 비교급` | ~할수록 더 … | The more, the better. |
| `one of the 최상급` | one of the + 최상급 + 복수명사 | He is one of the best players. |

### 4.9 관계사

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `관계대명사 who(주격)` | 사람 선행사 | I have a friend who lives in Canada. |
| `관계대명사 which(주격)` / `관계대명사 which(목적격)` | 사물 선행사 | The book which is on the desk is mine. |
| `관계대명사 that` | 사람/사물 | The movie that we saw was great. |
| `관계대명사 whose(소유격)` | 소유 관계 | I met a girl whose dream is to be a pilot. |
| `관계대명사 what` | 선행사 포함 | What I want now is a long vacation. |
| `관계대명사(계속적 용법)` | 콤마 + which/who | He passed the test, which surprised us. |
| `관계부사 where` / `when` / `why` / `how` | 장소/시간/이유/방법 | This is the house where I was born. |

### 4.10 가정법

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `가정법 과거` | If + 과거, would + 동사원형 | If I were you, I would say sorry. |
| `가정법 과거완료` | If + had p.p., would have p.p. | If he had studied, he would have passed. |
| `I wish 가정법` | I wish + 과거/과거완료 | I wish I could fly. |
| `as if 가정법` | as if + 과거 | He talks as if he knew everything. |

### 4.11 접속사·간접의문문

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `등위접속사(and/but/or/so)` | 절·구 연결 | She was tired, but she finished the race. |
| `종속접속사 when` / `if` / `because` / `although` | 부사절 | I stayed home because it rained. |
| `접속사 that(명사절)` | I think that ~ | I think that he is honest. |
| `상관접속사` | both A and B, not only A but also B, either A or B | Both Tom and Jane came. |
| `간접의문문` | 의문사 + 주어 + 동사 어순 | I don't know where she lives. |
| `so~that` | 너무 ~해서 …하다 | It was so cold that we stayed home. |

### 4.12 기타

| 표준 문구 | 형태/설명 | 예문 유형 |
|---|---|---|
| `사역동사` | make/have/let + 목적어 + 동사원형 | My mom made me clean my room. |
| `지각동사` | see/hear/feel + 목적어 + 동사원형/-ing | I saw him cross the street. |
| `it 가주어` / `it 가목적어` | It ~ to/that | It is true that he moved. |
| `수일치` | 주어-동사 일치 | Each student has a locker. |
| `재귀대명사` | -self/-selves | She looked at herself in the mirror. |
| `부정대명사(one/another/other)` | 지시 대상 구분 | I lost my pen, so I need a new one. |
| `화법 전환` | 직접화법 ↔ 간접화법 | He said that he was busy. |
| `전치사구` | 전치사 + 명사구(수식) | The store is between the bank and the bakery. |

## 5. 작성 지침 (교사용)

1. 문장에 문법 포인트가 여러 개면 **그 문장을 지문에 넣은 이유가 된
   핵심 포인트 1개**(최대 2개)만 적는다.
2. 표에 없는 항목이 필요하면 위 형식(`분류명(형태)`)을 따르는 새 문구를
   만들어 쓰되, 같은 교재 안에서는 같은 표기를 유지한다. 반복 사용되는
   새 문구는 이 문서에 추가 제안(append)한다.
3. `importance_level`과의 관계: 문법 포인트가 있는 문장이 자동으로
   중요한 것은 아니다 — 중요도 판정 기준은
   `06-exam-importance-standards.md`를 따른다.
4. 학년 매핑(§3)은 참고용 기본값이다. 교재 목차와 다르면 교재가 우선.
