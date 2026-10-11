# Phonics Adventure 시제품 (253차, 2026-10-11)

테스터 전용 프로토타입. 그림 단어 선택 화면(`pwp-root`, `pictureWordsEnabled` 테스터만)에서만 열린다. 일반 학생 화면·진도·보상과 무관하다.

## 1. 조사로 확인한 사실 (그래서 이렇게 만들었다)

- 저장소에는 **파닉스 커리큘럼 콘텐츠와 확정된 교재 순서가 없다** (`docs/design/PHONICS_PILOT_SPEC_2026-10-08.md`, `CURRICULUM_STAGES_2026-10-08.md` §11.2). 그래서 모든 항목은 `unitId: null`, `orderConfirmed: false`이고 묶음 이름은 "시제품 묶음 (교재 순서 아님)"뿐이다. 이 묶음에 대해 어떤 화면·코드도 단원/단계/레벨을 말하지 않는다.
- **단독 음소 음원이 없다.** 브라우저 TTS가 글자 하나/자소/IPA 한 조각을 어떻게 읽는지 검증된 바 없고, 흔히 "알파벳 이름"으로 읽는다. 그래서 이 시제품은 글자·자소·IPA를 TTS로 보내지 않는다. 소리는 기존 영국식 단어 발음 helper(`playEn` → `playWordAudio`, 알파벳 망치와 같은 호출)로 **단어 전체**를 읽는 것과 Web Audio 효과음뿐이다.

## 2. 시제품 게임 2종

- **Sound Bubble Pop** (`pbp-*`): 단어를 듣고(`🔊 듣기`, 첫 문제는 자동 재생 없음, 첫 듣기 탭 이후 다음 문제는 1회 자동 재생) 그 단어의 **첫 소리**에 해당하는 글자 풍선 4개 중 하나를 터뜨린다. 오답 풍선은 흐려지고 비활성(정답은 어떤 방식으로도 표시하지 않음, 안 누른 풍선은 속성·클래스가 동일). 정답이면 pop 효과음(`sfx.js`에 `pop` 보이스 추가) + 그림 카드·단어(첫 글자 강조)·뜻이 공개되고 약 0.5초 뒤 단어 발음. 연습 모드에만 `💡 힌트`(그림+철자 공개), 도전 모드는 힌트 버튼이 마운트되지 않는다.
- **Word Train** (`pwt-*`): 그림·뜻·`🔊 듣기`는 보이고 철자는 완성 전까지 DOM에 없다. 소리 블록(자소 묶음; sh/ch/ee/oa/ck 같은 이중자는 한 타일) 타일을 차례로 눌러 기차 칸을 채운다. 방해 타일 1개. 완성하면 성공음 → 기차 출발(CSS, 0.25s 지연 + 0.6s) → 약 0.5초 뒤 단어 발음, 철자는 `sh · ir · t`처럼 블록 단위로 공개.
- 세션은 6항목 → 요약(`pha-summary`, `n / 6`은 처음에 맞힌 수, `data-records`). 기록은 React state에만 쌓는다.

## 3. 데이터 출처

`src/data/phonics/phonicsWords.js`의 20행(영국식 RP)은 리드가 작성한 표를 그대로 옮긴 것이다. 그림은 `src/data/pictureWords`의 `learn: true` 항목과 id·`en`이 모두 일치할 때만 쓰며, 하나라도 어긋나면 그 행은 화면에서 제외된다(정적 테스트가 현재 20행 전부 해석됨을 확인). `pics2/candy` 행의 단어는 영국식 "sweet"이다(그림은 사탕).

## 4. 시도 기록 형태와 향후 테이블 (설계만 — SQL 파일 없음, DB 변경 없음)

`phonicsAttempt({ studentId, gameId, unitId = null, targetPhonemes, itemId, correct, retries, completed })`는 `v: 1`을 붙인 동결 객체를 돌려줄 뿐 아무것도 저장·전송하지 않는다. `studentId`는 세션의 학생 UUID이다(이름 아님).

장래 저장이 필요해지면 항목당 한 행의 테이블을 생각할 수 있다: 학생 UUID, 게임 id, 단원 id(교재 순서 확정 전에는 null), 목표 음소 목록, 항목 id, 정답 여부, 재시도 횟수, 완료 여부, created_at. 이는 제안일 뿐이며 이번 작업에서는 파일도 실행도 하지 않았다. 실제 도입 시에는 `students` UUID FK, RLS, 멱등 마이그레이션, 클라이언트 폴백(규칙 9)이 필요하다.

## 5. Bubble Pop이 "단어의 첫 소리"를 묻는 이유

순수 음소 프롬프트("/b/ 소리를 찾아요")는 음소 단독 재생이 필요한데, 지금은 그 음원이 없고 TTS로 대신할 수도 없다. 순수 음소 프롬프트로 바꾸려면 **교사가 음소별로 녹음한 클립**(자음·모음·이중자 각각)이 필요하다. 클립이 생기면 `bubbleRound`의 목표(`target.ipa`)를 그대로 재생 키로 쓸 수 있도록 데이터는 이미 자소·음소가 1:1로 맞춰져 있다.

## 6. 아직 만들지 않은 것

Treasure Hunt, Sound Bridge. 교재 순서 확정, 실제 음소 음원, 저장/학부모 리포트 연동도 이번 범위 밖이다.


## PAUL PHONICS 5권 (254차, 2026-10-11)

이름이 **PAUL PHONICS (폴 파닉스)**로 바뀌었고(코드 폴더 이름은 그대로), 그림 단어 선택 화면의 진입 버튼은 `pwg-open-phonics` 하나다. 책장(5권) → Book(Unit 목록) → Unit 허브(7단계) → 기존 연습 카드·그림 시험·알파벳 망치·숨은 글자 + 시제품 게임 2종으로 이어진다. 테스터 전용, 저장·네트워크·보상·DB 없음은 그대로.

### 5권 개요 (운영자) 와 임시 Unit (리드 초안, 승인 전)

- Book 1 단모음 / Book 2 단자음 / Book 3 장모음 / Book 4 이중자음 / Book 5 이중모음 — 이 다섯 권의 구성은 운영자 개요다.
- 그 안의 **Unit 구성은 전부 리드가 쓴 초안(`status: 'draft'`, 화면에 `임시` 배지)** 이고 승인된 Unit은 0개다. `unitsOf(book, { includeDraft: false })`는 모든 권에서 빈 목록이며 테스터 화면만 `includeDraft: true`로 부른다. 책장에는 "Unit과 단어 목록은 관리자 승인 전 임시 구성입니다"를 항상 보여 준다.
- 목표는 `자소|음소` 쌍(영국식 RP)이다. Book 2의 묶음 순서는 알파벳 순이며 임시. Book 4는 글자 두 개가 소리 하나를 내는 digraph(`kind: 'digraph'`)만 Unit으로 두고, dr·tr·sl 같은 consonant cluster는 글자마다 제 소리를 내므로 따로 Unit 없이 Book 2의 글자로 만든다는 안내를 Book 화면에 둔다. 소리가 둘인 경우(th, ou 등)와 다르게 읽히는 경우(u_e, ea, ow)는 Unit 메모로 보여 준다.
- 각 권에는 "Book 전체 연습"(`review`) 노드가 있고 목표는 그 권 전체다.

### 단어가 나오는 규칙 (`src/utils/phonics/curriculum.js`)

- `learnedPairs(book, unit)` = 앞선 모든 Unit(권 순서, Unit 순서)의 쌍 + 이 Unit의 쌍. Book 전체 연습은 그 권 끝까지.
- Book 1(`vowel-recognition`): 이 Unit의 모음 쌍을 가진 단어. 다른 글자는 익혔는지 따지지 않는다(아이는 모음만 듣고 고른다). 풍선 보기는 단모음 5개.
- Book 2~5: 이 Unit의 쌍을 하나 이상 가지면서 단어의 **모든** 자소|음소 쌍이 `learnedPairs` 안에 있는 단어만. 그래서 rice(c|s), ink(n|ŋ), dress(ss), egg(gg), cheese(se), r-controlled 단어는 Book 2~5에 나오지 않는다 — 의도된 동작이며 완화하지 않는다.
- 풍선 보기와 기차 방해 타일도 `learnedPairs`의 글자에서만 나온다("배우지 않은 소리 없음" 정적 보장, 모든 Unit·복습 노드 x 시드 0..19).

### 콘텐츠가 적은 이유와 Unit별 단어 (계산 결과)

단어는 승인된 `learn: true` 그림 단어 중 `phonicsWords.js` 24행(기존 20 + 분리 이중자 4: cake·tape·kite·slide)만 쓴다. 그래서 대부분의 Unit이 비어 있고, 비어 있으면 "단어 준비 중"으로 보이며 단계가 잠긴다(숨기지 않음).

- Book 1: u1 bag·jam / u2 pen·desk·egg·dress / u3 milk·ink / u4 sock / u5 cup (전체 연습 10)
- Book 2: u1 bag / u2 jam·milk / u3 pen·cup·desk / u4 없음 (전체 연습 6)
- Book 3: u1 cake·tape / u2 kite·slide / u3·u4 없음 (전체 연습 4)
- Book 4: u5 sock만, 나머지 없음 (전체 연습 1)
- Book 5: u1 train / u2 sweet·peach / u3 boat / u4 없음 / u5 soup (전체 연습 5)

### 7단계 허브

1 소리 듣기 · 2 듣고 따라 말하기 — 소리 하나는 **선생님이 승인한 녹음**(`phonemeClips.js`)으로만 들려주고, 지금은 하나도 없어 모두 "선생님 녹음 준비 중"으로 잠긴다. 글자·자소·IPA는 TTS로 절대 보내지 않는다(정적 핀). 3 그림과 단어 = 기존 연습 카드(단어 전체 듣기 + 녹음 + 내 목소리), 4 Sound Bubble Pop(가운데/끝 소리도 묻는다), 5 Word Train(Book 2부터), 6 Unit Test = 기존 그림 시험(단어 4개 이상), 7 틀린 소리 복습 = 이번 방문에서 놓친 항목만 Bubble Pop을 `step: 'review'`로 다시. 철자 게임 2개(`pph-extra-*`)는 같은 단어 목록을 넘긴다. 어느 단계에서 돌아와도 같은 Unit 허브로 오며, 허브는 연습/시험/게임 중에도 숨겨진 채 마운트되어 기록과 위치를 유지한다.

### 소리 음원 등록 방법

`src/data/phonics/phonemeClips.js`의 `PHONEME_CLIPS`(지금은 `{}`)에 키 `자소|IPA`로 `{ src, status: 'teacher-approved', approvedBy, approvedOn }`를 추가한다(`src`는 `src/assets/phonics/clips/`에서 import한 파일). `phonemeClip(pair)`는 `teacher-approved`일 때만 항목을 돌려주고 아니면 null이다. 항목이 생기면 1단계는 `<audio>`로 들려주고 2단계는 기존 로컬 녹음기(같은 훅·라벨)를 붙여 아이가 듣고, 말하고, 자기 목소리를 듣는다(`PhonemeListen.jsx`, 지금은 모든 소리가 "준비 중" 상태만 그려진다).

### 추적 설계 (설계만 — SQL 파일 없음, DB 변경 없음)

`phonicsAttempt`에 `bookId`·`unitId`·`step`('bubble'|'train'|'test'|'review')이 추가됐다(여전히 동결된 메모리 객체). `summarisePhonemes(records)`는 목표 음소별 `{ attempts, wrong, retries, improvedAfterReview }`를 돌려주는 순수 함수로, `improvedAfterReview`는 복습 아닌 단계에서 틀렸던 음소를 이후 `review` 단계에서 처음에 맞혔을 때 true다. 허브의 "다시 볼 소리"는 틀렸고 아직 복습으로 개선되지 않은 음소의 목록이다(반복해서 틀리는 음소 = wrong 합이 큰 음소). 장래 저장이 필요하면 항목당 한 행(학생 UUID, 게임 id, 권, Unit, 단계, 목표 음소, 항목 id, 정답 여부, 재시도, created_at)을 생각할 수 있고, 실제 도입 시에는 UUID FK·RLS·멱등 마이그레이션·클라이언트 폴백(규칙 9, 10)이 필요하다. 이번 작업에서는 파일도 실행도 하지 않았다.

### 아직 만들지 않은 것

Treasure Hunt, Sound Bridge, 마을 건물 연결, 저장/학부모 리포트, 실제 소리 음원, 승인된 Unit 구성.


## 43 Unit (구조 승인, 255차, 2026-10-11)

### 운영자가 승인한 것 / 승인하지 않은 것

- **승인:** 5권 안의 **Unit 구조(43개: Book 1~5 = 5/7/6/11/14)** 뿐이다.
- **승인하지 않음:** 단어, 소리, 이미지, 음성(녹음). 그래서 43개 Unit은 전부 `status: 'draft'`(화면 배지 "임시")이고, 승인된 Unit 목록(`unitsOf(.., { includeDraft: false })`)은 모든 Book에서 비어 있다. 단어 목록은 리드가 쓰고 검증한 임시 표다.

### 24 Unit 초안에서 달라진 것

초안 24개 → 최종 43개. 리드 정리: **수정 9, 병합 2, 분리 1, Book 5 Unit 14(같은 철자, 다른 소리) 추가** — 앞서 "그래도 43"이라던 산수는 틀렸고 43 − 2 + 1 = 42이므로 리드가 Book 5 Unit 14를 추가해 43을 맞췄다. Book 1 단어는 이제 5개씩이고 Book 5의 제목은 "모음 조합 및 확장 음가"이다.

### 전체 Unit 목록 (게임: B = Sound Bubble Pop, T = Word Train, H = Alphabet Hammer, L = Hidden Letters)

**Book 1 · Short Vowels · 단모음** (5 Unit)

| Unit | 철자 | 소리 | 난이도 | 게임 | 단어 |
|---|---|---|---|---|---|
| 1 | a | /æ/ | 2 | B | bag, jam, cat, hat, map |
| 2 | e | /e/ | 2 | B | pen, desk, egg, bed, red |
| 3 | i | /ɪ/ | 2 | B | milk, ink, pig, six, lip |
| 4 | o | /ɒ/ | 2 | B | sock, dog, box, hot, pot |
| 5 | u | /ʌ/ | 3 | B | cup, sun, bus, mug, nut |

**Book 2 · Single Consonants · 단자음** (7 Unit)

| Unit | 철자 | 소리 | 난이도 | 게임 | 단어 |
|---|---|---|---|---|---|
| 1 | m · s · t · p | /m/ /s/ /t/ /p/ | 1 | BTHL | mat, sat, tap, pot, sip |
| 2 | n · d · g · c | /n/ /d/ /ɡ/ /k/ | 1 | BTHL | pen, cup, dog, can, dig |
| 3 | b · h · f · l | /b/ /h/ /f/ /l/ | 2 | BTHL | bag, bed, hat, fan, leg |
| 4 | r · j · k · w | /r/ /dʒ/ /k/ /w/ | 2 | BTHL | jam, milk, desk, red, wet |
| 5 | v · y · z | /v/ /j/ /z/ | 3 | BTHL | van, yes, zip, vet, yam |
| 6 | ll · ss · ff · gg · zz · tt · pp · bb · ck (doubles) | /l/ /s/ /f/ /ɡ/ /z/ /t/ /p/ /b/ | 1 | THL | egg, dress, bell, hill, miss, sock, duck |
| 7 | qu · x (quex) | /kw/ /ks/ | 2 | THL | box, six, fox, quiz, quit |

**Book 3 · Long Vowels · 장모음** (6 Unit)

| Unit | 철자 | 소리 | 난이도 | 게임 | 단어 |
|---|---|---|---|---|---|
| 1 | a_e | /eɪ/ | 2 | BTHL | cake, tape, gate, name, game |
| 2 | i_e | /aɪ/ | 2 | BTHL | kite, slide, bike, five, time |
| 3 | o_e | /əʊ/ | 2 | BTHL | bone, home, cone, rope, note |
| 4 | u_e | /juː/ | 2 | BTHL | cube, tube, cute, mule, tune |
| 5 | u_e | /uː/ | 2 | BTHL | rule, june, flute, rude, prune |
| 6 | tap–tape · kit–kite · cap–cape · hop–hope · cub–cube (contrast) | — | 3 | B | tap, tape, kit, kite, cap, cape, hop, hope, cub, cube |

**Book 4 · Consonant Teams · 이중자음** (11 Unit)

| Unit | 철자 | 소리 | 난이도 | 게임 | 단어 |
|---|---|---|---|---|---|
| 1 | ck (digraph) | /k/ | 1 | BTHL | sock, duck, kick, neck, rock |
| 2 | sh (digraph) | /ʃ/ | 2 | BTHL | ship, shop, fish, dish, shell |
| 3 | ch (digraph) | /tʃ/ | 2 | BTHL | chip, chin, rich, much, chick |
| 4 | th (digraph) | /θ/ | 3 | BTHL | thin, thick, moth, thud, tenth |
| 5 | th (digraph) | /ð/ | 3 | BTHL | this, that, them, then, with |
| 6 | wh (digraph) | /w/ | 1 | BTHL | when, whip, which, whiz, whisk |
| 7 | ng · nk (digraph) | /ŋ/ /ŋk/ | 2 | BTHL | ink, ring, king, song, pink |
| 8 | bl · cl · fl · gl · pl · sl (cluster) | — | 3 | THL | slide, flag, clap, plum, glad |
| 9 | br · cr · dr · fr · gr · tr (cluster) | — | 3 | THL | dress, grapes, drum, frog, crab |
| 10 | st · sp · sn · sm · sk · sw (cluster) | — | 2 | THL | desk, stop, spot, snap, swim |
| 11 | nd · nt · mp · st · lk (cluster) | — | 2 | THL | milk, hand, tent, lamp, nest |

**Book 5 · Vowel Teams · 모음 조합 및 확장 음가** (14 Unit)

| Unit | 철자 | 소리 | 난이도 | 게임 | 단어 |
|---|---|---|---|---|---|
| 1 | ai · ay | /eɪ/ | 2 | BTHL | train, rain, snail, day, play |
| 2 | ee · ea · e_e | /iː/ | 2 | BTHL | sweet, peach, green, tree, sea, pete, eve |
| 3 | oa · ow | /əʊ/ | 2 | BTHL | boat, coat, road, snow, grow |
| 4 | ow · ou | /aʊ/ | 2 | BTHL | cow, town, brown, loud, cloud |
| 5 | oi · oy | /ɔɪ/ | 2 | BTHL | coin, oil, boil, boy, toy |
| 6 | igh | /aɪ/ | 2 | BTHL | night, light, high, right, fight |
| 7 | oo · ou | /uː/ | 3 | BTHL | moon, spoon, zoo, food, boot, soup, group, you |
| 8 | oo | /ʊ/ | 3 | BTHL | book, foot, cook, good, wood |
| 9 | ar | /ɑː/ | 2 | BTHL | car, scarf, star, park, farm |
| 10 | or | /ɔː/ | 2 | BTHL | fork, born, corn, storm, short |
| 11 | er · ir · ur | /ɜː/ | 3 | BTHL | shirt, skirt, bird, turn, her |
| 12 | er | /ə/ | 2 | HL | butter, pepper, jumper, rubber, winter |
| 13 | air · ear | /eə/ | 2 | BTHL | chair, pear, hair, pair, fair |
| 14 | ow snow/cow · oo moon/book · ea sea/bread · ou cloud/soup (contrast) | /e/ | 3 | THL | snow, cow, moon, book, sea, bread, cloud, soup |


### 규칙

- **ck 보조 철자:** Book 2 Unit 6(겹자음)은 `aux: ['ck|k']`로 ck를 **미리 만난다**(sock·duck 때문). 정식 학습은 Book 4 Unit 1이다. `learnedPairs`는 보조 쌍도 그 Unit부터 "배운 것"으로 센다 — 이 처리를 빼면 sock·duck 해독 검사가 실패한다(변이 검사 5건 FAIL로 확인).
- **자음군(Book 4 Unit 8~11):** 글자마다 제 소리를 내고 이어 읽는 것이라 새 소리 쌍이 없다(`targets` 0, 표시용 `labels`만). 녹음 불필요, Sound Bubble Pop 없음, Word Train에서도 낱글자 타일로 남는다.
- **Book 3 vs Book 5 목표:** Book 3 = "silent-e로 장모음 읽기", Book 5 = "같은 소리의 다른 철자 익히기"(Book 3 소리가 다시 나오면 관리자 표에 "재사용 /ipa/ (같은 녹음)"), 단모음·장모음/철자 비교 Unit(Book 3 Unit 6, Book 5 Unit 14) = "소리 구별 복습".
- **그림 없는 단어:** Sound Bubble Pop과 Word Train은 그림 없이도 돈다(Word Train은 "잘 듣고 소리 블록을 이어 보세요" 듣기 전용 안내). 알파벳 망치·숨은 글자·연습 카드(3단계)·그림 시험(6단계)은 **그림이 준비된(`image: 'ready'`) 단어만** 쓴다.
- **이미지 목록(리드 확정):** 197개 단어 중 그림 준비 32 / 이미지 제작 대기 94 / 그림 없이 학습 71. 슬롯 230(같은 단어 반복 포함) 중 그림 있는 슬롯 50.

### 녹음 42개와 등록·승인 흐름

`src/data/phonics/phonemeClips.js`의 `RECORDING_LIST`가 가르치는 순서대로 소리 42개(대표 철자·예시 단어)를 가진다. **지금 존재하는 녹음은 0개**이므로 전부 "대기"이고 1·2단계는 모든 Unit에서 잠겨 있다. /kw/ /ks/ /ŋk/, 겹자음, 자음군은 녹음이 필요 없다. 레지스트리는 **소리(ipa) 기준**이라 u_e /uː/와 oo /uː/는 같은 녹음을 쓴다. 흐름: 교사가 녹음 파일을 넘김 → 파일을 `src/assets/phonics/clips/`에 두고 레지스트리에 `{ src, status: 'teacher-approved', approvedBy, approvedOn }` 항목 추가 → `recordingStatus(ipa)`가 'approved'. 관리자 업로드 화면은 저장소와 SQL이 필요하므로 **만들지 않았다.** 글자·자소·IPA 하나는 어디서도 TTS로 보내지 않는다.

### 관리자 검토 탭

관리자 화면의 새 탭 "🔤 파닉스 검토"(`src/components/admin/PhonicsReviewPanel.jsx`, lazy 청크)는 **읽기 전용**이다(저장·네트워크·편집 컨트롤 없음). 요약 칩, Book별 표(Unit·상태·목표 음소·철자 패턴·대표 단어와 그림 표시·게임·음성 준비·이미지 준비·난이도·선수 학습·비고), 이미지 제작 대기 목록, 그림 없이 학습 목록, 녹음 42행, 방언 메모(영국식 RP 기준)를 보여 준다. 숫자는 데이터에서 계산한다.


## 256차 품질 개선 (2026-10-11)

운영자 부재 중 리드 지시로 진행. 모든 Unit은 여전히 `status: 'draft'`이고 녹음은 0개다.

### 반영한 검수 결과 (리드 확정, 원문 목록은 `phonicsFinal2.mjs`)
- **단어:** b2u2 + gum, b2u4 + kid, b2u5 yam→yum, b2u6 + off·buzz, b2u7 quit→quick, b4u3 rich·much→chop·lunch, b4u4 thud→cloth, b4u6 whiz·whisk→white·whale, b4u7 + ring·king·song·wing·ink·pink, b4u8 glad→globe + black, b4u9 + brick·truck, b4u10 + smell·skip, b5u10 born→horn, b5u13 fair→stair. 결과: 단어 210(그림 준비 32 / 제작 대기 105 / 그림 없이 73), 슬롯 236, 디코딩 불가 0.
- **b5u2:** `e_e`(these, Pete)는 드물어 목표에서 뺐다(예외로만 소개, Unit 비고). **b5u14:** 대비 Unit이 아니라 진짜 `ea /e/` Unit(게임 BTHL, 난이도 3). 같은 철자 다른 소리 4쌍(snow/cow, moon/book, sea/bread, cloud/soup)은 Book 5 전체 연습의 안내 줄.
- **소리 둘짜리 목표:** `qu`(/kw/)·`x`(/ks/)·`nk`(/ŋk/)는 `twoSounds` — 풍선 목표가 될 수 없고 녹음 1개도 필요 없다. b4u7 풍선은 ng 단어 4개, ink·pink는 Word Train/철자 항목. `ng`는 그대로 digraph.
- **표시:** Unit 라벨은 Book 안에서 유일(`th (thin)`/`th (this)`, `u_e (cube)`/`u_e (rule)`, `oo (moon) · ou (soup)`/`oo (book)`, `ea (bread)`, `oa · ow (snow)`/`ow (cow) · ou (cloud)`). 고유명사는 `display`로 대문자 유지(June). 교사 확인 필요 단어 17개(`REVIEW_WORDS`: mule, prune, tenth, cub, moth, vet, rude, yum, cloth, globe, horn, thread, spread, breath, head, jumper, rubber — jumper는 영국식 sweater, rubber는 eraser). `wordDifficulty`: 3 = 자소 5개 이상 / 자음군 2번 이상 / 음절 2개 이상, 2 = 자소 4개 또는 글자가 둘 이상인 자소(이중자음·분리 이중자음·모음 조합) 또는 자음군 1번, 1 = 그 밖. 방언 메모: tube/tune /tʃuː-/, air/ear /ɛː/, with /wɪθ/, tr/dr /tʃr dʒr/, ow.
- **Book 1 Unit Test 잠금:** 그림 시험(6단계)은 아직 배우지 않은 자음이 든 단어 전체 읽기라 Book 1(Unit·전체 연습)에서 잠그고 "Book 1은 소리 풍선으로 확인해요"를 보인다. 3단계(그림 + 듣기 + 따라 말하기)는 그대로.

### Sound Bubble Pop — 복습 섞기
단일 목표 Unit에서는 모든 정답이 같은 글자였다. 이제 세션 = 그 Unit의 풍선 단어 전부 + 이전 Unit(책 순서·Unit 순서, 대비 Unit 제외) 풍선 단어에서 시드로 뽑은 복습 최대 3개. 복습은 이 Unit의 목표와 다른 글자를 우선하고 글자당 1개, 각 항목은 **자기 Unit의 목표 글자와 기록(book/unit)** 을 갖는다. Book 1은 Book 1 앞 Unit에서만, 보기는 단모음 5개. Book 1 Unit 1은 복습이 없다(앞 Unit이 없음). 순서는 셔플. 다중 목표 Unit은 덜 쓰인 목표를 고른다(b2u2: n c d c g g). 정적 검사: 풍선이 있고 앞 Unit이 있는 모든 Unit × 시드 0..19에서 정답 글자 ≥ 2종류. 팝 애니메이션 0.28s(≤ 300ms), 정답/오답 효과음이 다르고 오답은 정답을 알려 주지 않으며, 연타(같은 오답 반복·정답 뒤 클릭)에서도 오답 수 = 서로 다른 오답 풍선 수, 완료·기록 1건씩. `pbp-listen-sound`("소리 듣기")는 그 소리의 승인된 녹음이 있을 때만 마운트 — 지금은 0개.

### Word Train — 출발한 기차
원인 확정은 못 했다(코드만으로는 transition이 끝에 머무는 구조라 재현이 안 됐다). 구조로 막았다: 출발을 `animation: pwt-go ... forwards`(끝 상태 translateX(130%) + visibility:hidden)로 바꿔 끝난 뒤에도 돌아올 수 없게 하고, 같은 칸(CSS grid 겹침, 높이 불변)에 완성한 단어를 채워진 칸 줄 `pwt-result`로 보인다. 다음 버튼 y 이동 ≤ 8px(브라우저 검사), 동작 줄이기: 애니메이션 없이 기차 숨김 + 결과 줄 즉시. 클러스터는 낱글자 타일(black = b·l·a·ck, 360×640 터치 6단어 완주). 타일을 맞게 누르면 그 소리의 승인된 녹음이 있을 때만 재생, 완성 시 모든 자소의 녹음이 승인된 경우에만 성공음 → 소리 하나씩(≈350ms 간격) → 단어 전체; 아니면 기존대로. 모두 `playPhonemes(ipas)` 한 곳을 통하며 승인 없는 소리가 하나라도 있으면 **아무것도 하지 않는다**(TTS 폴백 없음). 다음/나가기 시 대기 중 재생 취소.

### 선생님 녹음 42개 — 파일·승인 흐름
- 파일 규칙: `src/assets/phonics/clips/ph-<NN>-<id>.<mp3|m4a|wav>` (NN = 두 자리 순번). 예: `ph-01-a.mp3`, `ph-31-th-thin.mp3`, `ph-32-th-this.mp3`. 크기 2KB~500KB. 순번·id 목록은 `src/data/phonics/recordings.js`의 `RECORDINGS`(가르치는 순서: a e i o u · m s t p n d g k b h f l r j w v y z · ai ie oa ue oo-long · sh ch th-thin th-this ng · ee ow oi oo-short ar or er schwa air).
- 선생님이 파일을 넘기면 개발자가 위 이름으로 폴더에 둔다 → `node scripts/phonics/validateRecordings.mjs`가 이름·번호/id 짝·중복·확장자·크기를 점검(상태 `uploaded`) → 교사가 **듣고 승인**하면 `PHONEME_APPROVALS`에 `'<id>': { approvedBy: '<교사>', approvedOn: 'YYYY-MM-DD' }`를 추가 → `approved`가 되어서야 재생된다. 파일만 있거나 승인만 있으면 재생되지 않는다(승인 항목이 파일 없이 있으면 검증 오류).
- 상태 `missing`(파일 없음) | `uploaded`(파일만) | `approved`(파일 + 완전한 승인). 지금은 42개 전부 `missing`: `파일 0 / 42 · 승인 0 / 42`. 관리자 화면은 건드리지 않았다(숫자는 그대로 데이터에서 계산).


## 259차 Book 1 — 소리 알아듣기와 단어 읽기를 나누고, Book 1을 실제로 배울 수 있게 (2026-10-11)

운영자 부재 중 리드 계약(B1)으로 진행. 모든 Unit은 여전히 `status: 'draft'`, 선생님 녹음은 0개, 소리 하나를 TTS로 읽히는 코드는 0줄이다. 저장·네트워크·보상·새 저장소 키 없음.

### 원칙 — 소리 알아듣기(sound)와 단어 읽기(reading)
- Book 1(단모음 5개)은 자음을 배우기 전에 모음 소리부터 가르친다. 그래서 Book 1 활동은 **자음이 있어야 답이 정해지는 일이 없다**. 자음은 회색 "도우미 글자"로만 보인다. 단어 **읽기**는 Book 2부터다.
- 데이터: Book에 `skill` — Book 1 `'sound'`, Book 2~5 `'reading'`(`src/data/phonics/curriculum.js`). 허브는 Book 1의 7·8·9단계에 작은 "소리 찾기" 표시를 단다. 시도 기록(`phonicsAttempt`)의 모양은 바꾸지 않았다(학습 발달 파일은 다른 작업 소관).

### 10단계 → 3묶음
| 묶음 | 단계 | 화면 |
|---|---|---|
| 만나요 | 1 목표 소리 소개 | 소개 카드(`pph-intro`): 큰 글자, 핵심 단어 최대 2개(승인된 그림이 있으면 그림 카드, 없으면 글자 카드, 🔊는 단어 전체), 입 모양 한 줄(`pph-tip`) |
| | 2 선생님 소리 듣기 | 승인 녹음이 생기면 큰 재생 버튼 하나(숨은 `<audio>` 유지). **지금은 조용한 한 줄 "선생님 목소리는 곧 만나요"(`data-state=locked`), 버튼·오디오·발음 0** |
| 말해요 | 3–5 듣고 따라 말하기·내 목소리 녹음·녹음 듣기 | 한 줄(`pph-step-3`, `data-covers="3,4,5"`): 기존 연습 카드 흐름(단어 듣기 → 녹음 → 다시 듣기 → 다시 하기). 소제목 "단어로 따라 말해요" — 소리 하나를 따라 말하는 단계는 선생님 녹음이 생겨야 열린다 |
| | 6 그림과 단어 | 허브 안 갤러리(`pph-gallery`, 가장 작은 구현): 단어마다 그림(승인된 것만)·철자(모음 강조, 자음 회색)·🔊. "단어 듣기 (읽기는 Book 2에서)" |
| 놀아요 | 7 Sound Bubble Pop | 아래 |
| | 8 Word Train(Book 1 형태) | 아래 |
| | 9 소리 확인 | 아래 |
| | 10 다시 만나는 소리 | 이 방문에서 틀린 소리가 있을 때만 열림. 게임 전 "게임을 하면 열려요", 게임 후 틀림 없음 "틀린 소리가 없어요" |

- 한 화면에 purple "시작하기"는 **다음 할 일 1개**(`data-state="next"`)뿐이고, 나머지는 작은 "하기/보기" 행(`ready`). 이 방문에서 한 행은 "✓ 오늘 했어요"(`done`). 메모리 안 기록(+ 소개·연습·갤러리를 열었는지 `seen`)에서만 파생되고 저장하지 않으므로 "완료/저장"이라는 말은 쓰지 않는다. 잠긴 행은 버튼 없는 한 줄.
- 요약 화면: "한 번에 맞힌 풍선/단어/소리 n개"(`pha-first-try`의 `data-score="n / total"`, `pha-summary`의 `data-score="n/total"`) + 다음 단계 버튼("다음: Word Train" 등, `pha-next-step`) + 다시 하기 + 돌아가기.
- Book 2~5는 7단계를 그대로 두되 같은 규칙(다음 1개 강조, 오늘 했어요, 버튼 없는 잠긴 줄, 복습 문구, 요약의 다음 버튼)을 쓴다. "Unit Test" 표기는 Book 2~5에서 유지. Book 1 "전체 연습" 노드는 7단계 배치이고 그림 시험은 계속 잠겨 있다(소리 확인이 대신한다).

### Sound Bubble Pop
- **Book 1 Unit 1(앞에 섞을 Unit이 없는 첫 소리) = 감지 과제 — needsReview(교육학 판단은 리드/교사 몫).** 세션 8문제 = Unit 1 단어 5개(a 있음) + 다른 Book 1 Unit 단어 3개(a 없음, 서로 다른 모음). 풍선은 정확히 둘: 모음 `a`와 "다른 소리"(`pbp-bubble-other`). 순수 규칙 `bubbleRound(..., { detect: true, vowel })`(기존 동작 불변). 왜: 정답이 늘 `a` 하나면 "아무 풍선이나 a"가 되고 Unit 1에는 섞을 이전 Unit이 없다. 이 설계가 맞는지는 교사 확인이 필요하다.
- Unit 2~5는 5모음 선택 + 이전 Unit 복습(기존).
- 연습/도전 토글 제거: 연습 세션은 늘 💡 힌트, 소리 확인은 힌트 없음(`pbp-root`의 `data-mode`는 속성으로만 남김).
- 🔊 듣기는 처음 듣기 전까지 맥박(`pbp-pulse`)이고 **풍선은 단어를 한 번 듣기 전까지 잠긴다**(자동 재생도 들은 것으로 침). 들은 뒤 "🔊 다시 듣기".
- 정답 뒤 작은 카드 변형(`pw-card-sm`)을 쓰고 풍선 칸을 접어 `다음`이 360×640에서 스크롤 없이 보인다. 칭찬은 시드 3문구 순환("좋아요!"·"잘 들었어요!"·"바로 그 소리예요!").
- 발음은 겹치지 않는다: 새 단어 재생 전에 이전 재생을 멈추고, 정답 뒤 발음 타이머는 다음/나가기에서 취소된다.

### Word Train — Book 1 형태
빈 칸 하나(모음), 나머지 자음 칸은 회색 도우미 글자로 미리 채워져 있고, 타일은 모음 5개(`pwt-tile-va` 등). 틀리면 흔들림만(정답을 알려 주지 않음). 순수 규칙 `trainRoundVowel`/`vowelTap`. 완성하면 기차 출발·결과 칸(`pwt-result`)·단어 전체 발음. 모든 Book: 완성하면 `다음` 버튼에 포커스(`preventScroll`).

### 소리 확인 (Unit Test, Book 1)
5문제(Unit 단어 + 복습/대비 최대 2개, Unit 1은 감지 문제), 한 문제에 **한 번만** 고른다(고른 뒤 풍선 칸이 접히고 단어가 보임, 틀리면 부드러운 문구). 진행 "소리 확인 n / 5". 요약 `data-score="n/5"`, "한 번에 맞힌 소리 n개", 틀린 게 있으면 "다시 만나기"(틀린 문제만 바로 복습). 결과는 메모리에 `{ studentId, bookId, unitId, unitTest: { score, total }, at }` 한 건만 남는다(`progress.js`가 읽는 모양) — 저장·전송 없음. 틀린 문제는 단계 10에도 쌓인다.

### 알파벳 망치 — 글자 소리를 읽어 주지 않는 이유
글자 이름(에이/비)은 소리와 다르고, 소리 하나는 선생님 녹음이 있어야 하며, TTS에 글자 하나를 보내면 이름이 읽힌다. 그래서 망치에는 글자 이름·소리 음성을 **넣지 않았다**(효과음과 성공 시 단어 발음만). UI에는 이 이유를 쓰지 않았다. 타일에 `aria-label="글자 x"`(자기 글자만 — 정답 순서 정보 없음)와 완성 시 `다음 단어` 포커스만 더했다.

### 숨은 글자
Unit에서 시작하면 그 Unit의 목표 글자 칸을 먼저 가린다(`hiddenRound(word, { prefer })`, 기본 동작 불변). 단어 객체에 `prefer`(철자 속 글자 위치)를 붙여 기존 게임 청크로 넘긴다. 정답 뒤 영국식 단어 발음은 그대로.

### 아이 UX 검토 — 채택 / 미채택
- 채택: 3묶음, 다음 1개만 강조, 오늘 했어요 표시(저장 아님), 조용한 잠금 한 줄, 큰 재생 버튼, 발음 기호 숨김(IPA는 관리자만), 짧은 헤더, 듣기 먼저 → 풍선 열림, 작은 정답 카드, 칭찬 순환, 아이 말투 문구.
- 미채택/보류: `SfxControl`의 "한 번만 표시" 이동 — 이미 화면(세션)당 한 번만 보이는 구조라 옮기지 않았다(번들 예산). 잘못 누른 타일의 소리 파일 재생은 승인 녹음이 0개라 코드만 두었다(효과음만 남). 헤더의 핵심 단어 그림은 소개 카드와 겹쳐 작은 썸네일로만.
- 열린 교육학 질문: ① Unit 1 감지 과제가 맞는가(다른 소리 풍선의 의미를 7~10세가 이해하는가), ② 입 모양 문구 5개(초안, `tipNeedsReview`), ③ 소리 확인 5문제 — 합격선/재시도 정책, ④ 3–5단계가 소리가 아닌 단어 따라 말하기인 채로 충분한가.

### 규칙 15 — "기차가 돌아온다" 보고
256차 이전 `WordTrain.jsx`·`pictureImg.jsx`(`4c0a997b^`)로 임시 빌드해 256차 단언("1.5초 뒤 기차가 없고 결과 칸이 보임")을 돌렸다. 결과: **단언은 FAIL이지만 이유는 결과 칸(`pwt-result`) 부재**였고, 기차가 돌아오는 증상 자체는 이 탐침에서 재현되지 않았다(1.5초 뒤 기차는 트랙 밖). 즉 256차 수정이 막는 것 중 확정된 건 "결과 칸이 남는다"뿐이고, "기차 복귀"는 여전히 원인 미확정이다(256차 기록과 같음).

## 260차 (2026-10-11): 녹음 등록 절차와 관리자 미리보기

**관리자 "파닉스 검토" 탭의 녹음 표**에 미리보기가 붙었다: 파일을 고르면 형식(mp3/m4a/wav)·크기(2~500 KB)·길이(0.2~3.0초)·파일 이름(`ph-NN-id.mp3`, 다르면 경고만)을 검사하고, 재생해 보고, "승인(미리보기) / 반려(미리보기)"를 눌러 볼 수 있다. 선택한 파일은 이 브라우저 메모리에만 있다(저장·업로드·새 저장소 키 0, 새로고침하면 사라짐). 학생 화면에는 연결되지 않으며 `recordingStatuses`·재생 가능 여부를 바꾸지 않는다. 실제 줄 "실제 등록 0 / 42 · 승인 0 / 42"는 이 화면에서 움직이지 않는다.

**실제 등록 절차(지금 가능한 유일한 방법)**
1. 선생님이 42개 소리 파일을 건넨다(소리 하나는 음성 합성으로 만들지 않는다).
2. `node scripts/phonics/validateRecordings.mjs`로 이름·형식·크기를 검사한다.
3. 파일을 `src/assets/phonics/clips/`에 넣고 커밋한다.
4. `PHONEME_APPROVALS`에 `approvedBy`/`approvedOn`을 적는다(승인은 사람이 듣고 한다).
5. 미리보기 배포에서 운영자가 직접 듣는다.
6. 이상 없으면 병합한다.

**진짜 업로드 기능에 필요한 것(만들지 않았다)**: 저장소(버킷), 파일 메타 테이블, 서버리스 경로(관리자 재인증 + 크기·형식 재검증 — 클라이언트 검사는 믿지 않는다), 승인 감사 기록(누가·언제·어떤 파일), 학생 화면은 승인된 파일만 읽는 경로. 서버리스 함수 12개 한도를 먼저 확인해야 한다.

## 261차 추가 (2026-10-11): 소리 확인 통과 기준과 틀린 소리 복습
- **통과 기준 80%**: 5문제 → 4개 이상. 값은 `src/data/phonics/settings.js`의 `PHONICS_SETTINGS.testPassRatio` 한 곳(정적 검사가 0.8 리터럴이 그 파일에만 있음을 고정). 호출부(`passMark`, `testPassed`)는 설정 객체를 매개변수로 받고 기본값만 이 상수다.
- **관리자 설정이 붙는 자리(만들지 않음)**: 나중에 관리자 값이 생기면 호출부가 `{ testPassRatio }` 모양의 다른 객체를 넘기면 된다(덮어쓰기 지점은 `PhonicsAdventure`가 `passMark`/`testPassed`를 부르는 곳 한 곳). 허용 범위 예: 0.5~1.0(범위 밖은 기본값으로 되돌림). 저장하려면 테이블/컬럼과 운영자가 실행하는 SQL이 필요하다 — 지금은 없고, 에이전트는 DDL을 실행하지 않는다.
- **표시**: 통과 "통과! 5문제 중 4개 이상 맞혔어요", 아직 "조금만 더! 4개를 맞히면 통과예요". 빨강·"실패" 없음. 기록은 메모리 `unitTest: { score, total, passMark, passed }`뿐.
- **틀린 소리 복습 규칙**: 통과 못 하면 주 버튼이 복습이다. 복습 = 틀린 문제 전부 + 같은 소리(Unit 1은 "a가 들림/다른 소리" 같은 판정 형태)를 익히는 이 Unit·이전 Unit 단어를 더해 3~6개. 시드로만 섞는다. 끝나면 "소리 확인 다시 하기".
- **만들지 않은 것**: 관리자 설정 화면·저장·DB, Book 2~5 통과 기준, 점수 저장. 2단계(선생님 소리)는 승인 녹음 0개인 동안 잠김, 단일 소리 TTS 없음, 모든 Unit은 초안.

## Book 1 녹음 등록 절차 (262차, 2026-10-12)

Book 1(단모음)이 실제 수업에서 쓰이려면 **소리 5개**(a, e, i, o, u)만 있으면 된다. 지금 녹음 파일은 0개이고, 이 단계에서도 만들지 않았다(소리 하나는 음성 합성으로 만들지 않는다).

**정확한 파일 이름 5개** (`src/assets/phonics/clips/`에 넣는다)

| 소리 | 파일 이름 | Unit |
|---|---|---|
| /æ/ (a) | `ph-01-a.mp3` | Book 1 Unit 1 |
| /e/ (e) | `ph-02-e.mp3` | Unit 2 |
| /ɪ/ (i) | `ph-03-i.mp3` | Unit 3 |
| /ɒ/ (o) | `ph-04-o.mp3` | Unit 4 |
| /ʌ/ (u) | `ph-05-u.mp3` | Unit 5 |

확장자는 `mp3` / `m4a` / `wav` 모두 인식한다(위는 권장 형식). 이름의 번호와 id가 맞아야 한다.

**형식·크기·길이 규칙** (코드 상수와 같은 값 — `data/phonics/recordings.js`의 `EXTENSIONS`/`MIN_BYTES`/`MAX_BYTES`, `utils/phonics/recordingUpload.js`의 `MIN_SEC`/`MAX_SEC`)
- 형식: mp3, m4a, wav
- 크기: 2 KB ~ 500 KB
- 길이: 0.2 ~ 3.0초(관리자 미리보기가 검사. 파일 검사 스크립트는 이름·형식·크기·승인만 본다)

**등록 순서**
1. 선생님이 5개 파일을 건넨다.
2. 파일을 `src/assets/phonics/clips/`에 넣는다.
3. 검사: `node scripts/phonics/validateRecordings.mjs --book1` (또는 `--only a,e,i,o,u`). 소리별 예상 파일 이름·있음/없음·승인 상태를 보이고, 이름/형식/크기가 틀렸거나 파일 없이 승인만 있으면 오류로 종료(코드 1). 파일이 0개면 "미등록 5 / 5", 오류 없음, 종료 코드 0.
4. 관리자 "파닉스 검토" 탭의 맨 위 "Book 1 수업 준비"에서 5줄의 파일 이름을 확인하고, "표에서 보기"로 42행 표의 해당 줄로 가서 파일을 골라 미리 들어 본다(메모리 전용, 저장 안 됨).
5. 선생님이 직접 들은 뒤 `PHONEME_APPROVALS`에 승인을 넣는다. 예: `a: { approvedBy: '<선생님 이름>', approvedOn: '2026-10-12' }` (승인자와 `YYYY-MM-DD` 날짜가 모두 있어야 한다).
6. 미리보기 배포에서 운영자가 직접 듣고, 이상 없으면 병합한다.

**학생 화면에서 달라지는 것**
- 지금(등록 전): Book 1 모든 Unit에서 2단계 "선생님 소리 듣기"는 잠겨 있고 "선생님 목소리는 곧 만나요"가 보인다.
- 등록 후: 한 Unit의 2단계는 **그 Unit의 소리 파일이 있고 AND 승인이 완전할 때만** 열린다. 파일만 있거나 승인만 있으면 계속 잠긴다. 다른 Unit은 각자 자기 소리가 등록될 때까지 잠겨 있다(`scripts/testPhonicsProgress.mjs`가 메모리 속 가짜 목록으로 이 규칙을 검증한다 — 저장소에 파일을 쓰지 않는다).

**영국식 발음 녹음 안내 — 선생님이 확인해야 할 안내(제안, 확정 아님)**
- 순수한 짧은 소리 하나만 낸다. 뒤에 "어(uh)"를 붙이지 않는다(예: /æ/이지 "애-어"가 아니다).
- 길이는 약 0.3~1초. 조용한 방에서, 입을 마이크에서 한 뼘쯤 떼고, 앞뒤 무음은 짧게.
- 영국식 RP 기준: o /ɒ/는 입을 둥글게(미국식 /ɑː/ 아님), u /ʌ/는 짧고 편안하게. 방언 메모는 관리자 화면 아래 "방언 메모" 참고.
- 파일마다 한 소리만 담는다(여러 번 반복해 담지 않는다).

## 관리자용 단모음 녹음 등록 체크리스트 (263차, 2026-10-12)

위 "Book 1 녹음 등록 절차 (262차)"를 순서대로 줄인 체크리스트다(세부 규칙은 거기를 본다). **지금 상태: 미등록 5 / 5.** 파일 업로드·저장 기능은 없다 — 파일은 사람이 직접 넘기고 개발자가 폴더에 넣는다.

1. 선생님이 단모음 소리 5개를 녹음한다.
2. 파일 이름은 `ph-01-a` … `ph-05-u` (.mp3 / .m4a / .wav).
3. 관리자 "파닉스 검토" 탭에서 미리 검사한다(파일 선택 칸, 아무것도 저장되지 않는다).
4. 파일을 개발자에게 넘기면 `src/assets/phonics/clips/`에 넣는다.
5. 승인 기록에 승인자와 날짜를 적는다.
6. `node scripts/phonics/validateRecordings.mjs --book1` 로 검사한다.
7. 미리보기 배포에서 직접 들어 본다.
8. 그 다음에야 병합 여부를 운영자가 결정한다.
