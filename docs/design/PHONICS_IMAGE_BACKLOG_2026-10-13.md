# PAUL PHONICS 이미지 제작 대기 목록 (2026-10-13)

**한 줄 요약**: 그림이 없는 단어는 **105개**이며, 그중 7개는 기존 마을 그림 재사용 후보(승인 결정 필요)이고 **새로 만들 그림은 98개**다. 교사 확인이 필요한 ⚠ 단어는 10개다. Book별(첫 등장 기준): Book 1 13 / Book 2 14 / Book 3 13 / Book 4 29 / Book 5 36. 그림 파일은 만들지 않았다.

## 이미 결정된 것 vs 이 문서에서 새로 한 것

| 이미 있음 (참조) | 이 문서에서 새로 한 것 |
|---|---|
| `PHONICS_IMAGE_SPEC_2026-10-11.md`: 105 = 새 제작 98 + 재사용 후보 7, 단어별 그리기 지시, Book/Unit별 98개 목록 (257차) | 105개 전체를 Book · Unit · 단어로 다시 뽑은 생성 표(재사용·⚠ 표시, 중복 Unit 표시) |
| 같은 문서의 우선순위(260차): P1 = Book 1(13), P2 = Book 2(14), P3 = Book 3~5(78) — Book 단위 3단계 | 제안: Book 단위 5단계로 세분, 단계 안 정렬 규칙, 재사용 후보 7개를 제작 단계에서 분리, ⚠ 단어는 단계 맨 뒤 |
| `handoff.md` 260차·262차·266차: Book 1 13개 제작 목록, 중복 재확인(승인 중복 0) | 의미 카테고리와 그리기 난이도(전부 제안/추정), 그림 없이 가도 되는 후보 |

운영자가 승인한 결정과 충돌하는 제안은 없다. 260차 P1/P2/P3와의 차이: 이 문서는 cat(재사용 후보)을 Book 1 제작 13개에서 빼 **Book 1 새 제작 12개**로 센다(cat은 승인 결정 대기). P2/P3도 같은 이유로 duck·fox·tent·lamp·tree·gate가 빠진다. 단어를 Book에 배정할 때는 **처음 나오는 Unit**을 기준으로 했다(260차 `imagePriority`와 같은 방식).

## 1. Book · Unit별 목록

이 표는 스크립트가 데이터에서 생성한 것이다(손으로 쓰지 않음). 다시 만들려면: `node scripts/phonics/listImageBacklog.mjs`

이미지 필요 105개 · 기존 그림 재사용 후보 ♻ 7개 · 새로 제작 98개 · 확인 필요 ⚠ 10개 · Book 1 13개 / Book 2 14개 / Book 3 13개 / Book 4 29개 / Book 5 36개

♻ = 마을 그림 재사용 후보(승인 필요), ⚠ = 교사 확인 필요 단어, "(…에도 나옴)" = 다른 Unit에도 나오는 단어(첫 번째 나온 Unit이 기준이며 Book별 개수도 첫 등장 기준이라, 표에 보이는 단어 수와 다를 수 있음)

### Book 1 · 단모음 (13개)

| Unit | 목표 소리 | 그림이 필요한 단어 |
|---|---|---|
| 1 | a | cat ♻, hat (Book 2 Unit 3에도 나옴), map |
| 2 | e | bed (Book 2 Unit 3에도 나옴) |
| 3 | i | pig, lip |
| 4 | o | dog (Book 2 Unit 2에도 나옴), box (Book 2 Unit 7에도 나옴), pot (Book 2 Unit 1에도 나옴) |
| 5 | u | sun, bus, mug, nut |

### Book 2 · 단자음 (14개)

| Unit | 목표 소리 | 그림이 필요한 단어 |
|---|---|---|
| 1 | m · s · t · p | mat, tap (Book 3 Unit 6에도 나옴), pot (Book 1 Unit 4에도 나옴) |
| 2 | n · d · g · c | dog (Book 1 Unit 4에도 나옴), can, gum |
| 3 | b · h · f · l | bed (Book 1 Unit 2에도 나옴), hat (Book 1 Unit 1에도 나옴), fan, leg |
| 4 | r · j · k · w | kid |
| 5 | v · y · z | van, zip, vet ⚠ |
| 6 | ll · ss · ff · gg · zz · tt · pp · bb · ck | bell, hill, duck ♻ (Book 4 Unit 1에도 나옴) |
| 7 | qu · x | box (Book 1 Unit 4에도 나옴), fox ♻ |

### Book 3 · 장모음 (13개)

| Unit | 목표 소리 | 그림이 필요한 단어 |
|---|---|---|
| 1 | a_e | gate ♻ |
| 2 | i_e | bike |
| 3 | o_e | bone, cone, rope |
| 4 | u_e (cube) | cube (Unit 6에도 나옴), tube, mule ⚠ |
| 5 | u_e (rule) | flute, prune ⚠ |
| 6 | tap–tape · kit–kite · cap–cape · hop–hope · cub–cube | tap (Book 2 Unit 1에도 나옴), cap, cape, cub ⚠, cube (Unit 4에도 나옴) |

### Book 4 · 이중자음 (29개)

| Unit | 목표 소리 | 그림이 필요한 단어 |
|---|---|---|
| 1 | ck | duck ♻ (Book 2 Unit 6에도 나옴), neck, rock |
| 2 | sh | ship, shop, fish, dish, shell |
| 3 | ch | chip, chin, chick |
| 4 | th (thin) | moth ⚠, cloth ⚠ |
| 6 | wh | whip, whale |
| 7 | ng · nk | ring, king, wing |
| 8 | bl · cl · fl · gl · pl · sl | flag, plum, globe ⚠ |
| 9 | br · cr · dr · fr · gr · tr | drum, frog, crab, brick, truck |
| 11 | nd · nt · mp · st · lk | hand, tent ♻, lamp ♻, nest |

### Book 5 · 모음 조합 및 확장 음가 (36개)

| Unit | 목표 소리 | 그림이 필요한 단어 |
|---|---|---|
| 1 | ai · ay | rain, snail |
| 2 | ee · ea | tree ♻, sea, leaf |
| 3 | oa · ow (snow) | coat, road, snow |
| 4 | ow (cow) · ou (cloud) | cow, town, cloud |
| 5 | oi · oy | coin, oil, boy, toy |
| 6 | igh | night, light |
| 7 | oo (moon) · ou (soup) | moon, spoon, zoo, food, boot |
| 8 | oo (book) | foot, wood |
| 9 | ar | star, park, farm |
| 10 | or | fork, horn ⚠, corn, storm |
| 11 | er · ir · ur | bird |
| 13 | air · ear | hair, stair |
| 14 | ea (bread) | head ⚠, thread ⚠ |

## 2. 카테고리별 정리 (제안/추정 — 데이터가 아님)

카테고리와 그리기 난이도는 이 문서 작성자의 판단이다. 데이터에는 카테고리가 없고, 난이도는 "한 장의 분명한 그림으로 그리기 쉬운 정도"의 추정이다. 모든 단어는 정확히 한 카테고리에 있다. 쉬움 60 / 보통 35 / 어려움 10.

| 카테고리 | 개수 | 쉬움 | 보통 | 어려움 |
|---|---|---|---|---|
| 동물 | 16 | cat ♻, dog, pig, duck ♻, fox ♻, cow, bird, frog, fish, whale, crab, chick, snail | moth ⚠, cub ⚠, mule ⚠ | - |
| 음식 | 8 | nut, plum, corn, cone | gum, prune ⚠, chip | food |
| 탈것 | 5 | bus, van, bike, ship, truck | - | - |
| 사람·신체 | 13 | hand, foot | lip, leg, kid, king, chin, hair, head ⚠, boy, wing | vet ⚠, neck |
| 자연·장소 | 22 | sun, tree ♻, rain, cloud, moon, star, hill, rock, leaf, shell, nest | sea, snow, wood, farm, park, shop, road | storm, night, town, zoo |
| 사물 | 41 | hat, map, bed, pot, box, mug, fan, bell, gate ♻, bone, rope, cube, flute, dish, ring, flag, drum, brick, tent ♻, lamp ♻, spoon, boot, coat, coin, fork | mat, tap, can, zip, tube, cap, cape, whip, globe ⚠, toy, horn ⚠, stair, light | cloth ⚠, oil, thread ⚠ |

데이터에 형용사·동사는 없다(그런 단어는 이미 "그림 없이 학습"으로 분류돼 있음). 105개가 모두 명사로 보이며, 이는 작성자의 눈으로 본 판단이다.

## 3. 제작 우선순위 제안

기준(순서대로): (1) Book 1 먼저, (2) Book 순서 · 앞 Unit 먼저, (3) 단계 안에서 여러 Unit에 나오는 단어(*) 먼저, (4) 쉬운 구체 명사 먼저, (5) 재사용 후보 7개는 제작 대상이 아님, (6) ⚠ 단어는 단계 맨 뒤(교사 확인 전에는 그리지 않는다).

| 단계 | 범위 | 개수 | 그중 ⚠ | 단어 (그릴 순서 제안) |
|---|---|---|---|---|
| 1 | Book 1 | 12 | 0 | hat *, bed *, dog *, box *, pot *, map, pig, sun, bus, mug, nut, lip |
| 2 | Book 2 | 12 | 1 | tap *, fan, van, bell, hill, mat, can, gum, leg, kid, zip, vet ⚠ |
| 3 | Book 3 | 12 | 3 | cube *, bike, bone, cone, rope, flute, tube, cap, cape, mule ⚠, prune ⚠, cub ⚠ |
| 4 | Book 4 | 27 | 3 | rock, ship, fish, dish, shell, chick, whale, ring, flag, plum, drum, frog, crab, brick, truck, hand, nest, shop, chip, chin, whip, king, wing, neck, moth ⚠, globe ⚠, cloth ⚠ |
| 5 | Book 5 | 35 | 3 | rain, snail, leaf, coat, cow, cloud, coin, moon, spoon, boot, foot, star, fork, corn, bird, sea, road, snow, boy, toy, light, wood, park, farm, hair, stair, town, oil, night, zoo, food, storm, horn ⚠, head ⚠, thread ⚠ |
| 합계 | | 98 | 10 | |

별표(*)는 다른 Unit에도 나오는 단어. 단계 안 정렬은 코드로 계산했지만 "쉬움/보통/어려움"은 제안/추정이다.

### 제작이 아니라 승인 결정이 필요한 재사용 후보 7개 (♻)

| 단어 | 처음 나오는 곳 | 비고 |
|---|---|---|
| cat | Book 1 Unit 1 | 마을 그림. 승인 전에는 학습 그림이 아님 (`imageCandidates.js`, 사양 문서 (c)) |
| duck | Book 2 Unit 6 | 마을 그림. 승인 전에는 학습 그림이 아님 (`imageCandidates.js`, 사양 문서 (c)) |
| fox | Book 2 Unit 7 | 마을 그림. 승인 전에는 학습 그림이 아님 (`imageCandidates.js`, 사양 문서 (c)) |
| gate | Book 3 Unit 1 | 마을 그림. 승인 전에는 학습 그림이 아님 (`imageCandidates.js`, 사양 문서 (c)) |
| tent | Book 4 Unit 11 | 마을 그림. 승인 전에는 학습 그림이 아님 (`imageCandidates.js`, 사양 문서 (c)) |
| lamp | Book 4 Unit 11 | 마을 그림. 승인 전에는 학습 그림이 아님 (`imageCandidates.js`, 사양 문서 (c)) |
| tree | Book 5 Unit 2 | 마을 그림. 승인 전에는 학습 그림이 아님 (`imageCandidates.js`, 사양 문서 (c)) |

승인되면 제작 대상에서 빠지고, 승인되지 않으면 해당 단어를 위 단계 표의 같은 Book 끝에 추가한다. 합계 확인: 12 + 12 + 12 + 27 + 35 + 7 = 105.

## 4. 그림 없이 가도 되는 후보 (제안)

그림 한 장으로 뜻이 분명히 전달되기 어려운 단어이며, 운영자가 결정한다. 이 단어를 그림 없는 학습으로 옮기면 "그림 없이 학습" 목록(`NOIMG`)에 넣어야 하고 코드 변경이 필요하다.

| 단어 | 이유 (추정) |
|---|---|
| oil, thread, cloth | 물질·재료라 그림이 모호함 (thread, cloth는 ⚠) |
| food | 총칭 단어라 특정 음식으로 오해될 수 있음 |
| night, storm | 장면이라 한 사물로 그리기 어려움 |
| town, zoo | 장소 총칭, 장면 그림이 필요 |
| neck, vet | 신체 일부 분리·직업 표현이 어려움 (vet은 ⚠) |

## 5. 확인하지 못한 것 / 운영자 결정 필요

- 카테고리와 난이도(쉬움·보통·어려움)는 작성자 추정이며 실제 그려 보기 전에는 검증되지 않았다.
- ♻ 7개를 학습 그림으로 써도 되는지(특히 `dog` 대신 마을 `puppy`가 후보로 거론된 266차 건은 이 7개 목록에 없음).
- ⚠ 10개(vet, mule, prune, cub, moth, cloth, globe, horn, thread, head) 단어를 교사가 유지할지 바꿀지.
- 위 4절의 "그림 없이" 후보를 실제로 옮길지.
- 이미지 생성 도구가 없어 제작 일정·담당은 정하지 않았다. 이 문서는 새 학생 기능을 추가하지 않는다.
