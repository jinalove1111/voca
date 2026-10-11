# PAUL PHONICS 이미지 제작 사양 (257차, 2026-10-11)

단어 표에서 `image: 'needed'`인 105개 단어 중 **새로 제작해야 하는 98개**와 기존 마을 그림 후보 7개를 정리한다.
이 환경에는 이미지 생성 도구가 없어 그림 파일은 만들지 않았다 — 제작 사양만 정의한다. 목록은 데이터에서 자동 추출했다(손으로 쓰지 않음).

## (a) 스타일 / 형식

- 한 장에 사물 하나, 화면 가운데, 단색(흰색 또는 아주 연한) 배경, 기존 그림 단어와 같은 밝고 단순한 만화 스타일.
- 글자·숫자·상표 금지. 그림 안에 단어를 쓰지 않는다(학생이 먼저 맞히는 게임이 있다).
- 출력: 정사각 원본 → `scripts/pictureWords/buildPictureWords.py`가 256 px WebP로 변환(40KB 예산은 기존 그림 단어와 동일).
- 파일 이름 = 영어 단어 그대로(소문자, 예: `cat.webp`). 영국식 어휘와 사물(chip, tap, jumper 등)을 따른다.

## (b) 새로 제작할 98개 (Book / Unit별)

굵게 표시한 단어는 아래 "그림 지시"가 있다.

- Book 1 Unit 1: hat, **map**
- Book 1 Unit 2: bed
- Book 1 Unit 3: pig, **lip**
- Book 1 Unit 4: dog, box, **pot**
- Book 1 Unit 5: **sun**, **bus**, mug, nut
- Book 2 Unit 1: **mat**, **tap**
- Book 2 Unit 2: **can**, **gum**
- Book 2 Unit 3: **fan**, **leg**
- Book 2 Unit 4: **kid**
- Book 2 Unit 5: **van**, **zip**, **vet**
- Book 2 Unit 6: **bell**, **hill**
- Book 3 Unit 2: **bike**
- Book 3 Unit 3: **bone**, **cone**, rope
- Book 3 Unit 4: **cube**, **tube**, **mule**
- Book 3 Unit 5: **flute**, **prune**
- Book 3 Unit 6: **cap**, **cape**, **cub**
- Book 4 Unit 1: **neck**, **rock**
- Book 4 Unit 2: **ship**, **shop**, fish, **dish**, **shell**
- Book 4 Unit 3: **chip**, **chin**, **chick**
- Book 4 Unit 4: **moth**, **cloth**
- Book 4 Unit 6: **whip**, **whale**
- Book 4 Unit 7: **ring**, **king**, **wing**
- Book 4 Unit 8: flag, plum, **globe**
- Book 4 Unit 9: drum, frog, crab, brick, truck
- Book 4 Unit 11: **hand**, **nest**
- Book 5 Unit 1: rain, snail
- Book 5 Unit 2: **sea**, leaf
- Book 5 Unit 3: **coat**, **road**, **snow**
- Book 5 Unit 4: cow, **town**, cloud
- Book 5 Unit 5: **coin**, **oil**, boy, **toy**
- Book 5 Unit 6: **night**, **light**
- Book 5 Unit 7: moon, spoon, **zoo**, **food**, **boot**
- Book 5 Unit 8: foot, **wood**
- Book 5 Unit 9: star, **park**, **farm**
- Book 5 Unit 10: fork, **horn**, corn, **storm**
- Book 5 Unit 11: bird
- Book 5 Unit 13: **hair**, **stair**
- Book 5 Unit 14: **head**, **thread**

### 그림 지시 (모호한 단어만)

- bell — 손으로 흔드는 작은 종
- bike — 자전거(옆모습)
- bone — 개 뼈다귀(만화풍)
- boot — 장화 한 짝
- bus — 2층 버스
- can — 통조림 깡통(tin can). 조동사 can이 아님
- cap — 챙 달린 야구 모자(hat과 구별)
- cape — 망토(어깨에 두른 천)
- chick — 노란 병아리
- chin — 어린이 얼굴에서 턱을 강조
- chip — 영국식 chip = 두툼하게 튀긴 감자. 미국식 과자 chip 아님
- cloth — 접힌 천 한 장(검토 필요 단어)
- coat — 겨울 외투
- coin — 동전 하나(앞면)
- cone — 아이스크림 콘(교통 콘 아님)
- cub — 새끼 곰(검토 필요 단어)
- cube — 정육면체 블록 하나
- dish — 접시 하나
- fan — 선풍기(날개가 보이게)
- farm — 빨간 헛간이 있는 농장
- flute — 플루트(가로로 부는 은색 관악기)
- food — 접시에 담긴 음식
- globe — 탁상용 지구본(검토 필요 단어)
- gum — 껌 한 통 또는 껌 한 조각
- hair — 긴 머리카락
- hand — 손바닥을 편 손 하나
- head — 어린이 머리(정면, 검토 필요 단어)
- hill — 둥근 초록 언덕
- horn — 금관악기 호른(동물 뿔 아님)
- kid — 어린이 한 명
- king — 왕관을 쓴 왕
- leg — 다리 한 쪽
- light — 켜진 전구
- lip — 입술(얼굴 아래쪽)
- map — 접힌 종이 지도 한 장
- mat — 바닥 깔개(작은 사각 매트)
- moth — 나방(날개를 펼친 모습, 나비와 구별)
- mule — 노새 한 마리(검토 필요 단어)
- neck — 어린이 상반신에서 목 부분을 강조
- nest — 알이 든 새 둥지
- night — 달과 별이 있는 밤하늘
- oil — 기름병에서 기름이 따라지는 모습
- park — 벤치와 나무가 있는 공원
- pot — 손잡이 둘 달린 요리용 냄비
- prune — 말린 자두 한두 알(검토 필요 단어)
- ring — 보석 반지(전화벨 아님)
- road — 가운데 선이 있는 도로
- rock — 둥근 바위 하나
- sea — 파도가 있는 바다
- shell — 소라/조개 껍데기 하나
- ship — 큰 배(돛단배 아님)
- shop — 간판이 있는 작은 가게(글자 없음)
- snow — 눈 내리는 풍경
- stair — 계단 몇 칸
- storm — 번개가 치는 먹구름
- sun — 단순한 해
- tap — 싱크대 수도꼭지(water tap). 가볍게 두드리는 동작 아님
- thread — 실패에 감긴 실(검토 필요 단어)
- town — 작은 건물이 모인 마을 풍경
- toy — 장난감 곰 인형
- tube — 길쭉한 종이 통
- van — 승합차(트럭과 구별)
- vet — 청진기를 든 동물 의사(검토 필요 단어)
- whale — 고래 한 마리
- whip — 손잡이에 긴 끈이 달린 채찍(동물을 때리는 장면 없이)
- wing — 새의 날개 하나
- wood — 통나무 한두 개
- zip — 지퍼
- zoo — 동물원 입구 문(동물 그림 간판, 글자 없음)

## (c) 기존 에셋 후보 7개 (승인 필요)

Paul Town 그림이며 학습용으로 승인된 것이 아니다. 관리자 검토 탭의 "기존 에셋 후보"에 썸네일로 보인다. 학생 화면에는 쓰지 않는다.

- cat — `src/assets/town/animals/cat.webp`
- tree — `src/assets/town/nature/tree.webp`
- lamp — `src/assets/town/decorations/street-lamp.webp`
- duck — `src/assets/town/kit/animals/duck.webp`
- fox — `src/assets/town/kit/animals/fox.webp`
- tent — `src/assets/town/kit/props/tent.webp`
- gate — `src/assets/town/kit/props/garden-gate.webp`

비슷해 보이지만 일치하지 않아 쓰지 않는 그림 단어 항목: `rubber duck`(UNCERTAIN), `rocks`(UNCERTAIN), `globe`(MISMATCH) — 보류 상태 유지.

## (d) 승인 경로

1. 제작된 그림(또는 후보 재사용 결정)을 운영자가 검토한다.
2. 그림단어 관리자 탭에서 승인한다 — 승인된 그림만 `src/data/pictureWords`에 들어온다.
3. 같은 영어 단어의 승인된 그림이 생기면 단어 표가 자동으로 `image: 'ready'`로 바꾼다(코드 변경 없음).
4. 그 전까지 이 단어들은 "듣기 단어" 카드(글자 카드)로 학습한다.

## 우선순위 (260차, 2026-10-11)

제작 우선순위는 단어가 처음 나오는 Book으로 정한다: P1 = Book 1, P2 = Book 2, P3 = Book 3~5. 관리자 검토 탭 단어 표에서 P1/P2/P3로 거를 수 있다.

**그림 파일은 만들지 않았다.** 이 환경에는 이미지 생성 도구가 없고, 이 문서는 제작 대기 목록과 그리기 지시만 정리한다.

재확인: 제작 대기 105개를 승인된 그림 단어와 다시 대조했다. 이름이 겹쳐 보이는 `dog`(dog bowl, hot dog), `rope`(skipping rope), `boot`(wellington boot)는 서로 다른 그림이라 계속 제작 대기다. 같은 그림인 중복은 없었다.

| 우선순위 | 개수 |
|---|---|
| P1 | 13 |
| P2 | 14 |
| P3 | 78 |

### P1 (Book 1) — 그리기 지시

- bed — 침대 한 개(옆에서, 베개 포함)
- box — 뚜껑 열린 골판지 상자
- bus — 2층 버스
- cat — 앉아 있는 고양이 한 마리(기존 마을 후보 재사용 가능)
- dog — 서 있는 강아지 한 마리(그릇·핫도그 아님)
- hat — 챙 있는 모자 하나
- lip — 입술(얼굴 아래쪽)
- map — 접힌 종이 지도 한 장
- mug — 손잡이 달린 머그컵
- nut — 껍질째 호두 한 알
- pig — 분홍색 돼지 한 마리
- pot — 손잡이 둘 달린 요리용 냄비
- sun — 단순한 해

### P2 (Book 2)

bell, can, duck, fan, fox, gum, hill, kid, leg, mat, tap, van, vet, zip

### P3 (Book 3~5)

bike, bird, bone, boot, boy, brick, cap, cape, chick, chin, chip, cloth, cloud, coat, coin, cone, corn, cow, crab, cub, cube, dish, drum, farm, fish, flag, flute, food, foot, fork, frog, gate, globe, hair, hand, head, horn, king, lamp, leaf, light, moon, moth, mule, neck, nest, night, oil, park, plum, prune, rain, ring, road, rock, rope, sea, shell, ship, shop, snail, snow, spoon, stair, star, storm, tent, thread, town, toy, tree, truck, tube, whale, whip, wing, wood, zoo
