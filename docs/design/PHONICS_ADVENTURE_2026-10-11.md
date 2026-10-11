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
