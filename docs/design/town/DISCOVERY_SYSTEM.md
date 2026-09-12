# Paul Town — Discovery System (2026-09-12)

_설계 + 안전 프로토타입 문서. Discovery는 **flavor only**다 — 별(⭐)/Paul
Dollar(💵) 어떤 것도 지급/차감하지 않고, 네트워크 호출도 0이다(순수 로컬
계산). `PAUL_TOWN_V1.md`/`TOWN_ECONOMY_AUDIT_2026-09-11.md`의 화폐 계약을
조금도 건드리지 않는다. 실제 구현은
`src/utils/town/townDiscovery.js`(새 파일, import 0)에 있다._

## 1. 목적

기존 17종 아이템은 탭하면 "이동/보관"만 할 수 있다(`TownGrid.jsx`). Discovery는
그 위에 "이 건물/장소가 왜 여기 있는지"를 짧게 알려주는 **표시 전용** 레이어를
제안한다 — 아이템을 소유/배치했는지와 무관하게, 카탈로그의 어떤 아이템이든
탭하면(또는 인벤토리에서 살펴보면) 그 장소에 어울리는 짧은 문장 하나를 보여준다.

## 2. 결정론 선택 규칙 — 이름 절대 사용 안 함

기존 `src/utils/attachment/paulTown.js`의 `pickTodaysDiscovery()`가 이미 쓰는
djb2 해시 + dayKey 결정론 패턴을 그대로 따른다(CLAUDE.md 규칙 3 — 검증된
패턴 재사용, 새로 발명하지 않음). 차이점은 "하루 1개 전역"이 아니라
"학생마다 다른 문장이 나오되 결정론"이어야 하므로, 시드 문자열에 **학생
UUID**(`students.id`)를 포함한다 — 이름은 절대 쓰지 않는다(CLAUDE.md 규칙 4).

```
seed = `${studentId}:${placeKey}:${dayKey}`
hash = djb2(seed)
index = hash % examples.length
```

- `studentId`가 없으면(비로그인/테스트) `seed`에 `'anon'`을 대신 쓴다 —
  크래시 없이 항상 안전한 인덱스를 반환.
- `dayKey`는 `date.toDateString()`(로컬 자정 경계, 기존 `keyFor()`와 동일
  방식) — 자정이 지나면 다음 날 문장으로 자연스럽게 바뀐다.
- 같은 학생 + 같은 날 + 같은 장소는 항상 같은 문장(순수 함수, `Date.now()`/
  `Math.random()` 미사용).
- 서로 다른 학생은 같은 날 같은 장소를 봐도 서로 다른 문장을 볼 수 있다(시드에
  UUID가 섞이므로) — 이것이 "이름이 아니라 UUID로 다양성을 준다"는 요구를
  만족한다.

## 3. 장소(Place) 정의 — 10곳

카탈로그에 실제로 존재하는 6곳(`itemId`로 연결) + 제안 4곳(카탈로그 미반영,
콘텐츠만 미리 준비 — `PAUL_TOWN_BRITISH_WORLD.md` §7과 같은 성격의 "제안,
DB 아님"). 예시는 각 5~10개, 전부 2줄 이내(영/한), 나이에 맞는 무해한 내용만.

### 3.1 카탈로그에 이미 있는 장소(itemId 매핑)

| placeKey | itemId(town_items) | 발견 주제 |
|---|---|---|
| `book-shop` | `book-shop` | 영국 단어/사실 |
| `post-box` | `red-post-box` | 미니 메시지(편지/우표 관련) |
| `clock-tower` | `clock-tower` | 시간 표현 |
| `garden` | `flower-garden` | 자연 단어 |
| `school` | `english-school` | 미니 챌린지(짧은 퀴즈성 문장) |
| `cafe` | `cafe` | 주문 표현 |

### 3.2 제안 장소(카탈로그 미반영 — 콘텐츠만 준비, DB/코드 미추가)

| placeKey | 발견 주제 | 비고 |
|---|---|---|
| `tea-shop` | 음식 어휘 | `PAUL_TOWN_BRITISH_WORLD.md` §7 `tea-shop-sign` 제안과 연결 |
| `train-platform` | 여행 표현 | §7 `train-platform` 제안과 연결 |
| `market` | 쇼핑 표현 | 향후 카탈로그 확장 후보 |
| `library` | 독서 표현 | `book-shop`과 별개 장소로 제안(도서관 vs 서점) |

## 4. 예시 콘텐츠(placeKey별 8개, EN + KO, 각 ≤2줄)

_아래 문장은 전부 초등/중등 학생 기준 무해한 일반 상식/어휘다. 실제 값은
`src/utils/town/townDiscovery.js`의 `DISCOVERY_CONTENT`에 있고, 이 표는 그
내용을 문서로도 확인할 수 있게 미러링한 것이다(값이 달라지면 이 표도 함께
갱신 — append-only 원칙과 별개로 이 표는 코드와 동기화 대상)._

**book-shop** — "A group of books is called a 'library'." / "책이 모인 곳을
'도서관'이라고 해요." · "British people say 'full stop', not 'period'." /
"영국에서는 마침표를 'full stop'이라고 해요." · "'Colour' is the British
spelling of 'color'." / "'Colour'는 'color'의 영국식 철자예요." · "A 'chapter'
is one part of a book." / "'Chapter'는 책의 한 부분이에요." · "'Author' means
the person who writes a book." / "'Author'는 책을 쓴 사람이라는 뜻이에요." ·
"In the UK, a bookshop is sometimes called a 'bookshop', not 'bookstore'." /
"영국에서는 서점을 'bookstore' 대신 'bookshop'이라고도 해요." · "'Fairy tale'
means a magical story for children." / "'Fairy tale'은 아이들을 위한
마법 같은 이야기예요." · "The word 'story' comes from an old word meaning
'history'." / "'Story'라는 말은 '역사'를 뜻하는 옛말에서 왔어요."

**post-box** — "British post boxes are painted bright red." / "영국 우체통은
빨간색으로 칠해져 있어요." · "'Post' is the British word for 'mail'." /
"영국에서는 'mail' 대신 'post'라고 해요." · "A 'stamp' goes on a letter before
you send it." / "편지를 보내기 전엔 'stamp(우표)'를 붙여요." · "'Dear' is how
British letters often begin." / "영국 편지는 보통 'Dear'로 시작해요." · "'Yours
sincerely' is a polite way to end a letter." / "'Yours sincerely'는 편지를
정중하게 끝내는 말이에요." · "A 'postcard' is a short message you can send
without an envelope." / "'Postcard'는 봉투 없이 보낼 수 있는 짧은 편지예요."
· "'Envelope' is the paper cover for a letter." / "'Envelope'는 편지를 담는
종이 봉투예요." · "'Address' tells the post box where to send your letter." /
"'Address'는 편지를 어디로 보낼지 알려줘요."

**clock-tower** — "'O'clock' means 'of the clock' — an old English phrase." /
"'O'clock'은 '시계의'라는 뜻의 오래된 영어 표현이에요." · "'Half past' means
30 minutes after the hour." / "'Half past'는 정각에서 30분이 지났다는 뜻이에요."
· "'Quarter to' means 15 minutes before the hour." / "'Quarter to'는 정각까지
15분 남았다는 뜻이에요." · "Big Ben is the nickname of a famous London clock
bell." / "빅벤은 런던의 유명한 시계 종의 별명이에요." · "'Noon' means 12 o'clock
in the daytime." / "'Noon'은 낮 12시를 뜻해요." · "'Midnight' means 12 o'clock
at night." / "'Midnight'은 밤 12시를 뜻해요." · "A clock has an 'hour hand' and
a 'minute hand'." / "시계에는 '시침'과 '분침'이 있어요." · "'Tick-tock' is the
sound a clock makes." / "'Tick-tock'은 시계가 가는 소리예요."

**garden** — "A 'garden' in Britain often means a small yard with flowers." /
"영국에서 'garden'은 꽃이 있는 작은 마당을 뜻해요." · "'Bloom' means a flower
opening up." / "'Bloom'은 꽃이 피는 것을 뜻해요." · "A 'petal' is one part of
a flower." / "'Petal'은 꽃잎을 뜻해요." · "'Soil' is the ground plants grow
in." / "'Soil'은 식물이 자라는 흙이에요." · "A 'bee' helps flowers grow by
visiting them." / "'Bee(벌)'는 꽃을 찾아다니며 자라도록 도와줘요." · "'Bud'
means a flower before it opens." / "'Bud'는 아직 피지 않은 꽃봉오리예요." ·
"'Sunshine' helps every garden grow." / "'Sunshine(햇빛)'은 정원을 자라게
해줘요." · "'Watering can' is used to give plants water." / "'Watering can'은
식물에 물을 줄 때 쓰는 물뿌리개예요."

**school** — "Mini challenge: how do you say '안녕' in English?" / "미니
챌린지: '안녕'을 영어로 하면?(Hello!)" · "Mini challenge: what's the opposite
of 'big'?" / "미니 챌린지: 'big'의 반대말은?(Small!)" · "Mini challenge: how do
you spell the color of the sky?" / "미니 챌린지: 하늘 색을 영어로 쓰면?(Blue!)"
· "Mini challenge: what do you call a baby dog?" / "미니 챌린지: 강아지 아기를
영어로 하면?(Puppy!)" · "Mini challenge: how many days are in a week?" /
"미니 챌린지: 일주일은 며칠일까요?(Seven!)" · "Mini challenge: what's the
English word for '사과'?" / "미니 챌린지: '사과'는 영어로?(Apple!)" · "Mini
challenge: what comes after Monday?" / "미니 챌린지: 월요일 다음은?(Tuesday!)"
· "Mini challenge: how do you say 'thank you' politely?" / "미니 챌린지:
'고맙습니다'를 정중하게 하면?(Thank you very much!)"

**cafe** — "'Could I have...?' is a polite way to order." / "'Could I
have...?'는 정중하게 주문하는 표현이에요." · "'Take away' means food to go in
British English." / "영국에서는 포장을 'take away'라고 해요." · "'For here or
to go?' asks how you'll eat your food." / "'For here or to go?'는 여기서
먹을지 포장할지 묻는 말이에요." · "'Biscuit' means 'cookie' in British
English." / "영국에서는 쿠키를 'biscuit'이라고 해요." · "Afternoon tea is a
British tradition with tea and small snacks." / "애프터눈 티는 차와 작은
간식을 즐기는 영국 전통이에요." · "'May I...?' is a polite way to ask for
something." / "'May I...?'는 무언가를 정중하게 부탁하는 말이에요." ·
"'Please' and 'thank you' make any order sound kind." / "'Please'와 'thank
you'는 주문을 더 친절하게 만들어요." · "A 'menu' shows what food you can
order." / "'Menu'는 주문할 수 있는 음식을 보여줘요."

**tea-shop**(제안) — "'Tea time' is a British tradition in the afternoon." /
"'Tea time'은 영국의 오후 전통이에요." · "'Scone' is a small British bread
often eaten with tea." / "'Scone'은 차와 함께 먹는 작은 영국식 빵이에요." ·
"'Milk and sugar?' is a common tea question." / "'Milk and sugar?'는 차에
자주 묻는 말이에요." · "'Kettle' is used to boil water for tea." / "'Kettle'은
차를 끓일 물을 데우는 도구예요." · "'Biscuit' often goes well with tea." /
"'Biscuit'은 차와 잘 어울려요." · "'Cup and saucer' are used together for
tea." / "'Cup and saucer'는 차를 마실 때 함께 써요." · "'Warm' is how good
tea should feel." / "좋은 차는 'warm(따뜻)'해야 해요." · "'Sip' means to
drink a little bit slowly." / "'Sip'은 조금씩 천천히 마시는 것을 뜻해요."

**train-platform**(제안) — "'Platform' is where you wait for a train." /
"'Platform'은 기차를 기다리는 곳이에요." · "'Ticket' lets you get on the
train." / "'Ticket'이 있어야 기차를 탈 수 있어요." · "'Departure' means the
train is leaving." / "'Departure'는 기차가 떠난다는 뜻이에요." · "'Arrival'
means the train has come." / "'Arrival'은 기차가 도착했다는 뜻이에요." ·
"'Mind the gap' is a famous safety phrase in the UK." / "'Mind the gap'은
영국의 유명한 안전 안내 문구예요." · "'Luggage' means the bags you travel
with." / "'Luggage'는 여행할 때 가지고 다니는 가방이에요." · "'Journey' means
a trip from one place to another." / "'Journey'는 한 곳에서 다른 곳으로 가는
여행을 뜻해요." · "'All aboard!' means it's time to get on." / "'All
aboard!'는 탈 시간이라는 뜻이에요."

**market**(제안) — "'How much is this?' asks the price." / "'How much is
this?'는 가격을 물어보는 말이에요." · "'Basket' is used to carry things you
buy." / "'Basket'은 산 물건을 담는 바구니예요." · "'Fresh' means newly made
or picked." / "'Fresh'는 갓 만들어지거나 갓 딴 것을 뜻해요." · "'Bargain'
means a good, low price." / "'Bargain'은 값싸고 좋은 물건을 뜻해요." ·
"'Receipt' is the paper that shows what you bought." / "'Receipt'는 무엇을
샀는지 보여주는 종이예요." · "'Change' means the money you get back." /
"'Change'는 거스름돈을 뜻해요." · "'Stall' is a small shop in a market." /
"'Stall'은 시장 안의 작은 가게예요." · "'Vegetable' and 'fruit' are common
market words." / "'Vegetable'과 'fruit'는 시장에서 자주 쓰는 단어예요."

**library**(제안) — "'Quiet, please' is often said in a library." / "도서관에서는
'Quiet, please(조용히 해주세요)'라고 자주 말해요." · "'Borrow' means to take a
book and bring it back later." / "'Borrow'는 책을 빌려서 나중에 돌려주는 것을
뜻해요." · "'Return' means to bring something back." / "'Return'은 무언가를
다시 가져다 놓는 것을 뜻해요." · "'Shelf' is where books are kept." /
"'Shelf'는 책을 꽂아두는 곳이에요." · "'Librarian' is the person who works in
a library." / "'Librarian'은 도서관에서 일하는 사람이에요." · "'Novel' means
a long story book." / "'Novel'은 긴 이야기책을 뜻해요." · "'Page' is one
sheet in a book." / "'Page'는 책의 한 장을 뜻해요." · "'Bookmark' helps you
remember where you stopped reading." / "'Bookmark'는 어디까지 읽었는지
기억하게 도와줘요."

## 5. IP 세이프가드 — 자동 테스트

`scripts/testTownDiscovery.mjs`(§8, 새 파일)가 두 가지를 검사한다:

1. **결정론**: 같은 `studentId`+`dayKey`+`placeKey`는 항상 같은 인덱스를
   반환(같은 프로세스 내 반복 호출 100회 동일값). 서로 다른 `studentId`는
   전체 학생 집합에서 최소 2개 이상의 서로 다른 인덱스가 나온다(다양성 확인,
   45명 시뮬레이션).
2. **금지어 0건**: 운영자 지시 원문의 15개 금지어(`scripts/testTownDiscovery
   .mjs`의 `FORBIDDEN_TERMS` 상수가 단일 원천 — 이 문서/`PAUL_TOWN_BRITISH_
   WORLD.md` §8은 그 목록을 다시 나열하지 않는다, 나열 자체가 스캔 대상 문서를
   오염시키는 자기 지시적 모순을 피하기 위함)가 `townDiscovery.js` 본문 +
   이번 세션이 만든 `docs/design/town/*.md` 전체에서 0건인지 정규식으로 스캔.
3. **이름 미사용**: `townDiscovery.js` 소스에 `student.name`/`studentName`
   같은 패턴이 시드 조립에 쓰이지 않는지(정규식으로 시드 조립 라인만 검사).

## 6. 이 시스템이 하지 않는 것

- 별/Paul Dollar 지급 없음(순수 표시).
- 네트워크 호출 없음(전부 로컬 상수 + 순수 함수).
- `town_items`/`supabase_v3_50_town_v1.sql` 변경 없음.
- 학생 진행 레코드(`progress_data`)에 아무것도 쓰지 않음 — "본 적 있음" 여부를
  저장하지 않는다(V1은 매번 그날의 문장을 보여주기만 함, 읽음 표시 없음).

## 7. 참고 파일

- `src/utils/town/townDiscovery.js` — 실제 구현(§4 콘텐츠 + §2 알고리즘).
- `src/utils/attachment/paulTown.js`(`pickTodaysDiscovery`) — 이 세션이 참고한
  기존 djb2+dayKey 결정론 패턴(다른 시스템, 이 세션이 수정하지 않음).
- `scripts/testTownDiscovery.mjs` — 결정론/IP/이름-미사용 회귀.
