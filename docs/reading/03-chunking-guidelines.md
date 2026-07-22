# 03 — 끊어읽기 청크 작성 지침 (Chunking Guidelines)

- **목적**: `passage_sentences.chunks`(jsonb 배열)에 넣을 끊어읽기 청크를
  교사/콘텐츠 작성자가 **규칙 기반(비AI)** 으로 일관되게 만들 수 있도록
  원칙·길이 규칙·예문·엣지 케이스를 정의한다. v3.4 스키마 주석대로
  chunks는 **수동 입력 전용**(AI 자동 분할 없음)이며, 이 문서는 그 수동
  입력의 표준이다.
- **버전**: 1.0
- **작성일**: 2026-07-23

## 1. 시스템 제약 (실측 — 규칙이 아니라 코드가 강제하는 사실)

`src/utils/sentenceLearning.js`의 `chunksOf`가 청크 유효성의 진실 원천이다:

- 유효 조건: **비어있지 않은 문자열 2개 이상의 배열**. 1개 이하이거나
  형식이 틀리면 문장 전체를 단일 청크로 폴백한다(입력이 무효여도 학생
  화면은 깨지지 않음).
- 퍼즐 단계(`puzzle`)는 이 청크들을 시드 결정론 셔플
  (`shuffleDeterministic`)로 섞어 순서 맞추기 문제로 쓰고, 채점
  (`checkChunkOrder`)은 `normalizeAnswer` 기준(대소문자/구두점/공백
  무시)으로 비교한다. 따라서 **청크에 구두점을 포함해도 채점에 불리함이
  없다** — 원문 구두점을 그대로 유지하라.

작성 검증 규칙(임포트 시, `01-textbook-import-spec.md` §5.3): 청크들을
공백 1칸으로 이어붙이면 `normalizeAnswer` 기준으로 원문과 같아야 한다.

## 2. 의미 단위 원칙

문장을 **의미 단위(sense group)** 로 자른다. 소리 내어 읽을 때 자연스럽게
쉬는 곳이 곧 경계다.

1. **주어부 / 동사부를 가른다** — `My little brother | likes soccer.`
   단, 주어가 1단어(대명사 등)면 동사와 묶는다: `I went | to school.`
2. **동사부는 조동사·be동사와 본동사를 묶는다** — `will go`, `is
   running`, `has finished`, `was built`를 쪼개지 않는다.
3. **전치사구는 통째로 하나** — `to the library`, `with my sister`,
   `on the desk`. 전치사와 명사구 사이를 자르지 않는다.
4. **관사/소유격 + 명사는 쪼개지 않는다** — `a big dog`, `my new
   school`은 한 청크 안에.
5. **수식어구(시간/장소/방법 부사구)는 독립 청크** — `yesterday
   afternoon`, `at the bus stop`, `very quickly`.
6. **to부정사/동명사구는 의미가 통하는 덩어리로** — `to play soccer`,
   `reading books`.
7. **접속사는 뒤 절의 첫 청크에 붙인다** — `because it rained`,
   `when I was young`의 접속사를 홀로 두지 않는다.

## 3. 길이 규칙

- 청크 1개는 **원칙적으로 2~5단어**. 6단어 이상이면 의미 단위를 더
  쪼갠다.
- 예외적으로 1단어 청크 허용: 문두 부사(`Yesterday,`), 감탄사(`Wow,`),
  호격(`Tom,`), `However,` 같은 연결부사. 그 외에는 1단어 청크를 만들지
  않는다(특히 관사/전치사 홀로 두기 금지).
- 문장당 청크 수는 **2~6개**를 권장(퍼즐 난이도와 화면 표시 고려).
  2청크 미만이면 시스템이 어차피 단일 청크 폴백하므로 저장 의미가 없다
  (§1) — 아주 짧은 문장(3단어 이하)은 chunks를 아예 입력하지 않는 것을
  권장.

## 4. 예문 (원문 → 청크 배열)

아래 예문은 전부 중학 교과서 수준 문장이다. 배열 표기는 JSON과 동일.

### 4.1 be동사 기본 문장

| 원문 | 청크 |
|---|---|
| My name is Minho. | `["My name", "is Minho."]` |
| She is my best friend. | `["She is", "my best friend."]` |
| The books are on the desk. | `["The books are", "on the desk."]` |
| He was late for school. | `["He was late", "for school."]` |
| The movie was really exciting. | `["The movie was", "really exciting."]` |
| They were happy yesterday. | `["They were happy", "yesterday."]` |
| This is a present for you. | `["This is a present", "for you."]` |
| The weather is nice today. | `["The weather is nice", "today."]` |

### 4.2 일반동사 문장 (SVO)

| 원문 | 청크 |
|---|---|
| I like listening to music. | `["I like", "listening to music."]` |
| My brother plays soccer every day. | `["My brother", "plays soccer", "every day."]` |
| She teaches English at a middle school. | `["She teaches English", "at a middle school."]` |
| We eat lunch at noon. | `["We eat lunch", "at noon."]` |
| He wrote a letter to his grandmother. | `["He wrote a letter", "to his grandmother."]` |
| The students cleaned the classroom together. | `["The students", "cleaned the classroom", "together."]` |
| My mom makes delicious cookies. | `["My mom makes", "delicious cookies."]` |
| I found my old diary in the drawer. | `["I found", "my old diary", "in the drawer."]` |
| They built a small house near the lake. | `["They built", "a small house", "near the lake."]` |
| She keeps a diary in English. | `["She keeps a diary", "in English."]` |

### 4.3 전치사구가 있는 문장

| 원문 | 청크 |
|---|---|
| I went to the library with my sister. | `["I went", "to the library", "with my sister."]` |
| The cat is sleeping under the table. | `["The cat is sleeping", "under the table."]` |
| We waited for the bus in the rain. | `["We waited", "for the bus", "in the rain."]` |
| He lives in a small town near Seoul. | `["He lives", "in a small town", "near Seoul."]` |
| She looked at the stars in the sky. | `["She looked", "at the stars", "in the sky."]` |
| The children played in the park after school. | `["The children played", "in the park", "after school."]` |
| I put the keys on the kitchen table. | `["I put the keys", "on the kitchen table."]` |
| We walked along the river for an hour. | `["We walked", "along the river", "for an hour."]` |
| He jumped over the fence with one leap. | `["He jumped", "over the fence", "with one leap."]` |
| The store is between the bank and the bakery. | `["The store is", "between the bank", "and the bakery."]` |

### 4.4 시간 표현이 있는 문장

| 원문 | 청크 |
|---|---|
| Yesterday, I visited my grandparents. | `["Yesterday,", "I visited", "my grandparents."]` |
| We have an English test next Friday. | `["We have", "an English test", "next Friday."]` |
| Last summer, my family traveled to Jeju. | `["Last summer,", "my family traveled", "to Jeju."]` |
| I get up at seven every morning. | `["I get up", "at seven", "every morning."]` |
| The festival begins on October fifth. | `["The festival begins", "on October fifth."]` |
| She finished her homework before dinner. | `["She finished her homework", "before dinner."]` |
| We will meet again in two weeks. | `["We will meet again", "in two weeks."]` |
| He has lived here since last year. | `["He has lived here", "since last year."]` |

### 4.5 조동사가 있는 문장

| 원문 | 청크 |
|---|---|
| You should drink more water. | `["You should drink", "more water."]` |
| I can play the guitar very well. | `["I can play", "the guitar", "very well."]` |
| We must follow the safety rules. | `["We must follow", "the safety rules."]` |
| She may come to the party tonight. | `["She may come", "to the party", "tonight."]` |
| You don't have to worry about it. | `["You don't have to", "worry about it."]` |
| He could swim when he was five. | `["He could swim", "when he was five."]` |
| We should be kind to our neighbors. | `["We should be kind", "to our neighbors."]` |
| You must not use your phone in class. | `["You must not use", "your phone", "in class."]` |

### 4.6 의문문

| 원문 | 청크 |
|---|---|
| Do you like Korean food? | `["Do you like", "Korean food?"]` |
| What did you do last weekend? | `["What did you do", "last weekend?"]` |
| Where is the nearest bus stop? | `["Where is", "the nearest bus stop?"]` |
| How often do you exercise? | `["How often", "do you exercise?"]` |
| Why was she angry this morning? | `["Why was she angry", "this morning?"]` |
| Can I borrow your pencil for a minute? | `["Can I borrow", "your pencil", "for a minute?"]` |
| When does the movie start? | `["When does", "the movie start?"]` |
| Have you ever been to Busan? | `["Have you ever been", "to Busan?"]` |

### 4.7 명령문·제안문

| 원문 | 청크 |
|---|---|
| Please open the window for me. | `["Please open the window", "for me."]` |
| Don't run in the hallway. | `["Don't run", "in the hallway."]` |
| Let's go on a picnic this Saturday. | `["Let's go", "on a picnic", "this Saturday."]` |
| Turn off the lights before you leave. | `["Turn off the lights", "before you leave."]` |
| Be careful when you cross the street. | `["Be careful", "when you cross", "the street."]` |
| Why don't we take a short break? | `["Why don't we take", "a short break?"]` |

### 4.8 진행형·미래 표현

| 원문 | 청크 |
|---|---|
| I am reading an interesting book now. | `["I am reading", "an interesting book", "now."]` |
| She is making a cake for her friend. | `["She is making a cake", "for her friend."]` |
| They are practicing for the school festival. | `["They are practicing", "for the school festival."]` |
| We were watching TV at that time. | `["We were watching TV", "at that time."]` |
| I will visit my uncle in Daegu tomorrow. | `["I will visit my uncle", "in Daegu", "tomorrow."]` |
| It is going to rain this afternoon. | `["It is going to rain", "this afternoon."]` |
| He is going to join the soccer club. | `["He is going to join", "the soccer club."]` |
| We are planning a surprise party for her. | `["We are planning", "a surprise party", "for her."]` |

### 4.9 현재완료

| 원문 | 청크 |
|---|---|
| I have just finished my homework. | `["I have just finished", "my homework."]` |
| She has lost her favorite umbrella. | `["She has lost", "her favorite umbrella."]` |
| We have known each other for ten years. | `["We have known", "each other", "for ten years."]` |
| He has never eaten Indian food before. | `["He has never eaten", "Indian food", "before."]` |
| They have already left for the airport. | `["They have already left", "for the airport."]` |
| Have you finished the science report yet? | `["Have you finished", "the science report", "yet?"]` |

### 4.10 to부정사

| 원문 | 청크 |
|---|---|
| I want to be a doctor someday. | `["I want to be", "a doctor", "someday."]` |
| She went to the store to buy milk. | `["She went to the store", "to buy milk."]` |
| It is important to eat breakfast every day. | `["It is important", "to eat breakfast", "every day."]` |
| He decided to study harder this year. | `["He decided", "to study harder", "this year."]` |
| I have a lot of homework to do tonight. | `["I have", "a lot of homework", "to do tonight."]` |
| We were happy to hear the good news. | `["We were happy", "to hear", "the good news."]` |
| She woke up early to catch the first train. | `["She woke up early", "to catch", "the first train."]` |
| My dream is to travel around the world. | `["My dream is", "to travel", "around the world."]` |

### 4.11 동명사

| 원문 | 청크 |
|---|---|
| Reading books is my favorite hobby. | `["Reading books", "is my favorite hobby."]` |
| She enjoys taking pictures of flowers. | `["She enjoys", "taking pictures", "of flowers."]` |
| Thank you for helping me yesterday. | `["Thank you", "for helping me", "yesterday."]` |
| He is good at solving math problems. | `["He is good at", "solving math problems."]` |
| I finished writing the letter at midnight. | `["I finished writing", "the letter", "at midnight."]` |
| Walking every day keeps you healthy. | `["Walking every day", "keeps you healthy."]` |

### 4.12 비교 표현

| 원문 | 청크 |
|---|---|
| My bag is heavier than yours. | `["My bag is heavier", "than yours."]` |
| This is the tallest building in our city. | `["This is", "the tallest building", "in our city."]` |
| She runs as fast as her brother. | `["She runs", "as fast as", "her brother."]` |
| Health is more important than money. | `["Health is", "more important", "than money."]` |
| Today is much colder than yesterday. | `["Today is much colder", "than yesterday."]` |
| He is one of the best players on the team. | `["He is one of", "the best players", "on the team."]` |

### 4.13 수동태

| 원문 | 청크 |
|---|---|
| This bridge was built in 1990. | `["This bridge was built", "in 1990."]` |
| English is spoken in many countries. | `["English is spoken", "in many countries."]` |
| The window was broken by the wind. | `["The window was broken", "by the wind."]` |
| These cookies were made by my grandmother. | `["These cookies were made", "by my grandmother."]` |
| The room is cleaned every morning. | `["The room is cleaned", "every morning."]` |
| The letter was written in simple English. | `["The letter was written", "in simple English."]` |

### 4.14 접속사가 있는 복문

| 원문 | 청크 |
|---|---|
| I stayed home because it rained all day. | `["I stayed home", "because it rained", "all day."]` |
| When I was young, I lived in the country. | `["When I was young,", "I lived", "in the country."]` |
| If you hurry, you can catch the bus. | `["If you hurry,", "you can catch", "the bus."]` |
| She was tired, but she finished the race. | `["She was tired,", "but she finished", "the race."]` |
| I will call you after I get home. | `["I will call you", "after I get home."]` |
| He studied hard, so he passed the exam. | `["He studied hard,", "so he passed", "the exam."]` |
| Although it was cold, we went hiking. | `["Although it was cold,", "we went hiking."]` |
| You can stay here until the rain stops. | `["You can stay here", "until the rain stops."]` |

## 5. 엣지 케이스

### 5.1 관계사절 — 선행사 뒤, 관계사 앞에서 끊는다

관계대명사/관계부사는 자기 절의 첫 청크에 붙인다(§2-7과 동일 원리).

| 원문 | 청크 |
|---|---|
| I have a friend who lives in Canada. | `["I have a friend", "who lives", "in Canada."]` |
| The book that you lent me was fun. | `["The book", "that you lent me", "was fun."]` |
| She is the teacher whom everyone likes. | `["She is the teacher", "whom everyone likes."]` |
| This is the house where I was born. | `["This is the house", "where I was born."]` |
| I remember the day when we first met. | `["I remember the day", "when we first met."]` |
| What I want now is a long vacation. | `["What I want now", "is a long vacation."]` |

### 5.2 분사구문 — 분사구 전체를 한 덩어리로 시작한다

| 원문 | 청크 |
|---|---|
| Walking along the beach, I found a starfish. | `["Walking along the beach,", "I found a starfish."]` |
| Feeling tired, she went to bed early. | `["Feeling tired,", "she went to bed", "early."]` |
| Written in easy words, the book sells well. | `["Written in easy words,", "the book sells well."]` |
| Smiling brightly, he waved at us. | `["Smiling brightly,", "he waved at us."]` |

### 5.3 가정법 — if절과 주절을 각각 의미 단위로 나눈다

| 원문 | 청크 |
|---|---|
| If I were you, I would say sorry first. | `["If I were you,", "I would say sorry", "first."]` |
| If it snows tomorrow, we will make a snowman. | `["If it snows tomorrow,", "we will make", "a snowman."]` |
| I wish I could fly like a bird. | `["I wish", "I could fly", "like a bird."]` |
| If he had studied, he would have passed. | `["If he had studied,", "he would have passed."]` |

### 5.4 간접의문문 — 의문사부터 절 끝까지가 한 의미 단위 축

| 원문 | 청크 |
|---|---|
| I don't know where she lives. | `["I don't know", "where she lives."]` |
| Can you tell me what time it is? | `["Can you tell me", "what time it is?"]` |
| I wonder why he was absent today. | `["I wonder", "why he was absent", "today."]` |
| Do you know who broke the window? | `["Do you know", "who broke the window?"]` |

## 6. 작성 체크리스트 (교사용)

- [ ] 청크를 공백 1칸으로 이어붙이면 원문과 같은가(구두점 포함)?
- [ ] 각 청크가 2~5단어인가(허용 예외: 문두 부사/감탄사/호격 1단어)?
- [ ] 관사/전치사/조동사가 홀로 남거나 명사·본동사와 분리되지 않았는가?
- [ ] 청크 수가 2~6개인가? (1개면 저장하지 말 것 — 시스템이 폴백함)
- [ ] 접속사/관계사가 뒤 절 첫 청크에 붙어 있는가?
