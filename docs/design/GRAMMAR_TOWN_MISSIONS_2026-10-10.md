# 폴타운 장소 미션 설계 (2026-10-10, 241차)

_QA 전용(PR #62). 마을의 장소(공원 등)에서 문법 단원을 "마을에서 공부하는 경험"으로 잇는다. 첫 구현은 공원 미션 1개이고, 나머지 장소는 이 문서의 표(설계 제안)로만 남긴다. DB·저장·새 보상 없음. 브라우저 검증은 아직 실행하지 않았다._

관련 문서: `docs/design/GRAMMAR_SCENE_MISSION_2026-10-10.md`(그림 미션 시범과 34단원 확장), `handoff.md` 241차.

## 1. 목적과 원칙

운영자 요청의 핵심은 문법 공부를 "마을에서 하는 일"로 느끼게 하되, 지금의 한 장씩 덱 흐름은 바꾸지 않는 것이다.

- 한 장씩 카드 흐름은 그대로 둔다. 새 화면 종류를 만들지 않는다.
- 장소는 학습 상황에 실제로 쓰여야 한다. 장소가 문형을 돕지 않으면 연결하지 않는다(억지 연결 금지). 34단원 중 8단원은 이 이유로 연결하지 않는다(§4).
- 흐름: 마을에서 장소 고르기 → 상황 소개 → 문법 활동 → 듣기·말하기·쓰기(같은 목표 표현) → 마을로 돌아가기.
- 같은 미션은 문법 홈 카드에서도 들어갈 수 있다. 두 입구가 같은 덱을 연다.
- 그림 톤은 따뜻하고 차분한 영국 마을이다. 아기 캐릭터·이모지·장식은 줄인다(§6).
- 이미 있는 이미지 파일만 쓴다. 없는 파일은 이름과 폴더만 목록으로 남긴다(§5).
- 기존 진도와 보상은 건드리지 않고, 같은 보상이 두 번 나가지 않게 한다(§3).

## 2. 구현된 공원 미션

대상 단원은 `g-easy-05`(There is / There are), 장소는 공원이다. 코드는 커밋 3개(마을 입구·문법 복귀, 마을 표지판, 공원 배경)로 나뉘어 있다.

### 2.1 두 가지 입구

| 경로 | 클릭 순서 |
|---|---|
| A. 마을 | 홈 마을 버튼 → 2.5D 마을 → 벤치 왼쪽 앞 표지판 누르기 → Paul이 걸어감 → '공원 미션 시작' → 카드 1/15 → … → 요약 → '마을로 돌아가기' → 표지판에 '완료' |
| B. 문법 홈 | 홈 [문법 Grammar] → '폴타운 미션' → '공원 미션 · There is / There are' → 같은 덱 → 뒤로 = 과정 목록 |

진입 조건: 2.5D 마을은 플래그 `paulTown2_5d` ON과 QA 테스트 계정이 모두 필요하고, 문법은 QA 테스트 계정이 필요하다. 실제 학생에게는 아무것도 보이지 않는다. 마을 플래그가 꺼져 있으면 마을 입구에서 문법 홈으로 돌아간다.

### 2.2 덱 흐름 (기존 시범 덱 15장, 불변)

목표(+상황 소개) → 발견 → 비교 → 선택 ×3 → 만들기 → 읽기 → 듣기 ×2 → 말하기 연습/시험 → 쓰기 → 마무리 → 요약 → 마을로 돌아가기.

상황 소개는 목표 카드에 붙는다. 장소(공원)와 한 줄 소개("폴과 쿠키가 공원에 왔어요. 공원에 무엇이 있는지 영어로 말해 봐요.")가 보인다.

### 2.3 데이터와 화면 요소

미션 데이터는 순수 모듈 `src/utils/grammar/townMissions.js`다. React·이미지·저장소를 쓰지 않는다. 항목은 `id`, `placeKo`, `unitId`, `status`(ready 등), `titleKo`, `introKo`, `grammarEn`, `goalKo`이고, 조회 함수는 id별·단원별·ready 목록이다. 현재 항목은 `park` 하나다.

| 화면 | testid | 설명 |
|---|---|---|
| 마을 표지판 | `proto25d-mission-spot-park` | 기존 `decorations/town-sign` 스프라이트. 장애물이 아님. 누르면 Paul이 도착 칸으로 걸어감 |
| 마을 시작 버튼 | `proto25d-mission-enter` | Paul이 가까이 오면 '공원 미션 시작' |
| 마을 완료 표시 | `proto25d-mission-done-park` | 완료 후 글자 칩 '완료'(이모지 없음). 다시 들어가는 것은 허용 |
| 문법 홈 섹션 | `grammar-missions` | '폴타운 미션' |
| 문법 홈 버튼 | `grammar-mission-park` | '공원 미션 · There is / There are' |
| 단원 목록 장소 태그 | `gu-place-tag` | 미션 단원 행에 '공원' |
| 목표 카드 상황 소개 | `gd-mission-intro` | 장소 + 소개 문구 |
| 요약 카드 | `gd-to-town` | '마을로 돌아가기'(마을 모드에서는 `gd-to-list`를 숨김) |
| 덱 위 뒤로 | `gu-back` | 마을 모드에서 `data-return="town"`, '← 마을' |

표지판 좌표와 판정은 순수 파일 `src/utils/town/proto2_5d/missionSpots.js`에 있다. 표지판 위치는 월드 좌표 (11, 66), Paul 도착 칸은 (17, 68)이다. 미션 props(`missions`, `completedMissionIds`, `onStartMission`)가 없으면 마을 DOM은 이전과 같다. 상점·내 물건·배치 오버레이가 열려 있을 때는 표지판을 숨긴다.

App은 세션 안에서만 사는 상태 두 개를 가진다. 현재 문법 입구(`grammarEntry`)와 완료한 미션 id 목록(`completedMissionIds`)이다. 문법 화면에는 `initialUnitId`, `returnTo`, `onMissionComplete` 세 props가 추가되었다.

## 3. 진도·보상·중복 방지

- 새 보상, XP, DB, 스토리지 키는 없다.
- 마무리 카드의 분석 이벤트 `grammar_scene_finish`는 마운트당 한 번 가드와 제품 이벤트의 세션 안 중복 제거(`이벤트:학생id:로컬날짜` 키)를 그대로 쓴다. 이는 입구와 무관하므로 마을에서 들어가든 문법 홈에서 들어가든 같은 하루 같은 이벤트는 한 번만 남는다.
- 덱 답은 단원별 기존 상태 맵에 남는다. 미션 전용 답 저장소는 없다.
- 마을의 '완료' 칩과 미션 완료 기록은 세션 안에서만 유지된다. 새로고침하면 사라진다. 이것은 알려진 한계다. 완료를 기기나 계정에 남기려면 저장 위치(스토리지 또는 DB)를 운영자가 정해야 한다.
- 학생 식별은 기존과 같이 `students.id`(UUID)를 쓴다. 미션은 이름 문자열을 쓰지 않는다.

## 4. 34단원 장소 연결표

**설계 제안 — 운영자·교사 확정 전.** 아래는 연결 후보일 뿐이고 코드에는 공원(E05)만 들어 있다. 단원 표기는 Easy(E)·Intermediate(I)·Advanced(A)·Middle(M)·High(H) 과정의 번호이며 단원 id의 `g-easy-05` 같은 순번과 같다고 가정한다(E05 = `g-easy-05`로 확인됨, 나머지는 같은 규칙을 적용한 것으로 확정 전). "어울림"은 장소가 학습 상황에 쓰이는 정도다. 이미지 칸의 영문은 `src/assets/town/` 아래 기존 스프라이트 이름이고, NEW는 아직 없는 파일이다.

| 단원 | 장소 | 상황 | 문장 | 어울림 | 장면 변경 | 이미지 |
|---|---|---|---|---|---|---|
| E01 | 학교 (special/english-school) | 교실에서 짝에게 지우개 빌려 달라 부탁 | Can I borrow your ruler? | 보통 | 학교 배경 유지, 문패만 | english-school |
| E02 | 집 (buildings/my-house) | 집에서 잃어버린 가방 위치를 묻고 답함 | Where's my bag? | 강함 | 변경 없음(집 배경) | my-house |
| E03 | 교문 (english-school) | 새 학기 교문에서 서로 소개 | I am Paul. | 보통 | 공원 배경 → 학교 배경, 인물 2명 | english-school |
| E04 | 공원 (nature/tree, decorations/bench) | 공원 친구들이 뛰고 달리는 것을 말함 | Mia can jump. | 강함 | 공원 배경 유지 | tree, bench, animals/puppy |
| E05 | 공원 | 시범 완료 | There are two trees. | 강함 | 변경 없음 | 있음 |
| E06 | 과일 가게 (NEW) | 가게 진열대에서 좋아하는 과일을 말함 | I like apples. | 강함 | 집 배경 → 가게 배경, 과일 가판 3종 | NEW fruit-shop |
| E07 | 카페 (buildings/cafe) | 카페 줄에서 친구 취향을 물음 | Do you like milk? | 보통 | 학교 배경 → 카페 배경, 우유 소품 | cafe |
| E08 | 책방 (buildings/book-shop) | 책방 선반의 가까운/먼 책을 가리킴 | This is a book. | 강함 | 학교 배경 → 가게 배경, 선반 near/far | book-shop |
| I01 | 연결 없음 | 상자 안 물건 맞히기 게임이라 특정 장소 필요 없음 | Is it in the box? | 억지(연결 안 함) | 변경 없음 | - |
| I02 | 집 (my-house) | 식구가 하는 일을 말함 | My mum likes apples. | 강함 | 변경 없음 | my-house |
| I03 | 빵집 (NEW) | 빵집 주문대에서 무엇을 좋아하는지 묻고 되묻기 | What do you like? / What about you? | 강함 | 집 배경 → 빵집 배경, pizza·cake 진열 | NEW bakery |
| I04 | 공원 | 운동장 친구에게 할 수 있는지 묻기 | Can you swim? | 강함 | 공원 배경 유지 | bench, puppy |
| I05 | 광장 (decorations/stone-fountain) | 광장에서 지나는 사람이 지금 하는 일 | Mia is reading. | 보통 | 집 배경 → 거리(광장) 배경, TV 항목은 책/공 | stone-fountain |
| I06 | 정원 (british-cottage, nature/flower-garden) | 마당 고양이가 어디 있는지 | It's behind the tree. | 강함 | 공원 배경 유지, 소품 tree/garden | british-cottage, flower-garden, cat |
| I07 | 연결 없음 | 어제/오늘 시간 비교가 핵심, 장소가 시제를 돕지 않음 | I played with my dog yesterday. | 억지(연결 안 함) | 변경 없음 | - |
| I08 | 카페 (cafe) | 카페 점원이 권하고 손님이 답함 | Would you like some juice? | 강함 | 이미 카페, 간판만 | cafe |
| A01 | 학교 게시판 (english-school + NEW notice-board) | 축제 계획 게시판을 읽고 누가 뭘 할지 말함 | Mia is going to dance at the festival. | 강함 | 학교 배경 유지, 게시판 소품 | NEW notice-board |
| A02 | 연결 없음 | 크기·키 비교는 소품 비율이 핵심, 장소와 무관 | Paul is taller than Mia. | 억지(연결 안 함) | 변경 없음 | - |
| A03 | 연결 없음 | 이유·결과는 어느 장소에서나 성립 | I am hungry, so I eat an apple. | 억지(연결 안 함) | 변경 없음 | - |
| A04 | 연결 없음 | when/if는 날씨·상태 소품이 없고 장소를 쓰지 않음 | When it rains, I stay home. | 억지(연결 안 함) | 변경 없음 | - |
| A05 | 학교 (english-school) | 교실 규칙판을 보고 해야 할 일·좋은 일 말함 | We have to read a book. | 강함 | 학교 배경 유지, 규칙판 | notice-board |
| A06 | 기차역 (NEW) | 역 노선판의 가 본 곳 표시를 보고 경험 묻고 답함 | Have you ever been to the zoo? | 보통 | 공원 배경 → 역 배경, 목적지 칸 | NEW train-station |
| M01 | 시계탑 (special/clock-tower) | 광장 시계탑 아래 시간표로 오늘/어제/내일 구분 | I played soccer yesterday. | 강함 | 공원 배경 → 거리 배경, 시계탑+시간표 타임라인 | clock-tower |
| M02 | 학교 | 교실 규칙·허락을 묻고 답함 | May I open the window? | 강함 | 학교 배경 유지 | english-school |
| M03 | 학교 | 청소 당번표로 누가 무엇을 하는지 | The classroom is cleaned by Mia. | 보통 | 학교 배경 유지, 당번표 | notice-board |
| M04 | 연결 없음 | 사람/사물 설명 문형이라 특정 장소 필요 없음 | Mia is a girl who plays soccer. | 억지(연결 안 함) | 변경 없음 | - |
| M05 | 공원 | 공원에서 달리는 소년·자는 고양이를 꾸밈 | The sleeping cat is here. | 보통 | 학교 배경 → 공원 배경, cat 소품 | cat, tree |
| M06 | 신문 가판대 (NEW) | 마을 신문 날씨란을 읽고 계획 말함 | If it rains, we will stay home. | 보통 | 거리 배경 유지, 신문대 | NEW newspaper-stand |
| H01 | 시계탑 | 마을에 산 기간(for/since) 설명 | Mia has lived here for a year. | 보통 | 거리 배경 유지, 타임라인 | clock-tower |
| H02 | 신문 가판대 | 마을 신문 기사 속 수동태 | This was made by Paul. | 강함 | 학교 배경 → 거리 배경, 기사 대화 | NEW newspaper-stand |
| H03 | 연결 없음 | 긴 문장 속 관계사 해석이라 장소 힘이 없음 | This is the book Mia read. | 억지(연결 안 함) | 변경 없음 | - |
| H04 | 연결 없음 | 상상·가정이라 실제 장소와 반대 | If I were you, I would go. | 억지(연결 안 함) | 단색 배경 유지 | - |
| H05 | 우체통 (decorations/red-post-box) | 폴과 미아의 메시지 전달 | He said that he was happy. | 강함 | 학교 배경 → 거리 배경, 우체통+말풍선 | red-post-box |
| H06 | 다리 (special/bridge) | 집에 가는 길 다리 위 사건 | Walking home, I met Mia. | 강함 | 거리 배경 유지, 다리 | bridge |

연결 26, 연결 안 함 8이다. 이 가운데 지금 구현된 것은 E05(공원) 하나뿐이다.

### 4.1 장소별 호스트 단원

| 장소 | 호스트 단원 | 스프라이트 |
|---|---|---|
| 공원 | E04, E05, I04, M05 | 건물 없음(tree·bench·puppy 사용) |
| 학교 | E01, E03, A01, A05, M02, M03 | special/english-school 있음 |
| 집 | E02, I02 | buildings/my-house 있음 |
| 카페 | E07, I08 | buildings/cafe 있음 |
| 책방 | E08 | buildings/book-shop 있음 |
| 광장 | I05(stone-fountain), M01·H01(clock-tower) | 있음 |
| 정원 | I06 | british-cottage, flower-garden 있음 |
| 우체통 | H05 | red-post-box 있음 |
| 다리 | H06 | special/bridge 있음 |
| 과일 가게 | E06 | 없음(NEW) |
| 빵집 | I03 | 없음(NEW) |
| 기차역 | A06 | 없음(NEW) |
| 신문 가판대 | M06, H02 | 없음(NEW) |
| 게시판 | A01, A05, M03 | 없음(NEW, 소품) |

### 4.2 공원 다음에 연결할 5개 (제안)

1. I08 카페: 스프라이트와 배경이 이미 있어 이미지 비용이 0이다.
2. E08 책방: near/far와 책장이 문형을 돕는다.
3. E04 공원: 놀이 동작 중심으로 하고 E05와 겹치지 않게 한다.
4. E06 과일 가게: 새 파일이 필요하다.
5. I03 빵집: 새 파일이 필요하다.

### 4.3 연결하지 않는 8단원 (문법 홈에서만)

| 단원 | 이유 |
|---|---|
| I01 | 상자 맞히기 게임이라 특정 장소가 필요 없음 |
| I07 | 시제 비교가 핵심이고 장소가 시제를 돕지 않음 |
| A02 | 크기 비교는 소품 비율이 핵심 |
| A03 | 이유·결과는 어느 장소에서나 성립 |
| A04 | when/if에 쓸 날씨 소품이 없음 |
| M04 | 관계사 설명 문형이라 장소 불필요 |
| H03 | 긴 문장 해석이라 장소 힘이 없음 |
| H04 | 가정법은 현실과 반대라 실제 장소와 맞지 않음 |

## 5. 이미지

원칙: 프로젝트에 이미 있는 파일만 쓰고, 없는 파일은 이름과 폴더만 적어 둔다. 이 문서는 파일을 새로 만들지 않는다.

### 5.1 지금 쓰는 실제 파일

- 마을 표지판: `decorations/town-sign` 스프라이트(기존).
- 공원 하늘: `src/assets/town/backgrounds/village-sky-backdrop.webp`.
- 공원 산울타리: `src/assets/town/backgrounds/village-hedge-border.webp`(작은 그림에서는 생략).
- Paul 이미지(`paul/*`), 마을 스프라이트 tree·bench·flower-garden·street-lamp·post box·fountain·house·school·cafe·shop·bridge·tower·puppy·cat·owl(그림 무대가 기존대로 사용).
- 이번 공원 배경 작업에서 새로 내보낸 이미지 파일은 없다. 문법 lazy 청크는 256.4 KB raw / 71.3 KB gzip이다.

### 5.2 아직 임시인 것

- 공원의 잔디와 길은 단색 도형이다. 공 SVG는 임시이다. Cookie는 마을 강아지 대역이다.
- 동작 배지는 아직 이모지다(대체할 이미지 파일이 없다). 장면 카드의 장식 이모지(소리 아이콘, 체크)는 이번에 제거했고, 듣기 버튼은 인라인 스피커 아이콘과 접근성 이름 '듣기'다.
- 다른 배경(집·학교·거리·단색)과 인물·물건 대부분도 임시 도형이다(240차 §13 참고).

### 5.3 필요한 파일 이름과 폴더

규격: 폴더 `src/assets/town/<group>/`, 이름은 kebab-case, 형식은 투명 배경 `.webp`와 같은 이름의 `@2x`, 글자는 그림에 굽지 않는다.

**장소 연결표에서 새로 필요한 14개** (가치순)

| 번호 | 파일 |
|---|---|
| 1 | `buildings/bakery.webp` |
| 2 | `buildings/fruit-shop.webp` |
| 3 | `special/train-station.webp` |
| 4 | `decorations/notice-board.webp` |
| 5 | `decorations/newspaper-stand.webp` |
| 6 | `props/bread-basket.webp` |
| 7 | `props/fruit-crate.webp` |
| 8 | `props/apple.webp` |
| 9 | `props/cake.webp` |
| 10 | `props/timetable-board.webp` |
| 11 | `props/ticket.webp` |
| 12 | `props/newspaper.webp` |
| 13 | `props/letter.webp` |
| 14 | `props/juice.webp` |

**그림 무대(`Stage.jsx` 상단 TODO)가 기록한 파일**

- 배경: `backgrounds/park-backdrop.webp`(하늘·잔디·길 한 장), `home-backdrop.webp`, `school-backdrop.webp`, `street-backdrop.webp`, `plain-backdrop.webp`.
- Cookie: `character/cookie-idle.webp`, `character/cookie-sit.webp`.
- 사람: `character/mia.webp`, `tom`, `mom`, `dad`, `teacher`, `kid`, `grandma`, `driver`(각 `character/<이름>.webp`).
- 동물: `animals/bird.webp`, `animals/fish.webp`.
- 물건(`props/<키>.webp`): ball, box, book, bag, pencil, cup, apple, bike, car, bus, phone, chair, table, bed, door, umbrella, hat, letter, cake, pizza, milk, egg, key, map, clock, guitar, kite, tv, computer, window, desk, board, money, ticket, gift, shoes, jacket, homework, newspaper, medal, trophy.
- 동작 배지: `ui/action-<키>.webp`.

두 목록은 apple·cake·ticket·newspaper·letter가 겹친다. 파일 하나로 두 쪽을 함께 채운다. town 환경 이미지 폴더는 v2 전용 가드(`testTownEnvAssets`)가 있어 그림 무대가 직접 import하지 않는다.

## 6. 그림 톤 규칙

- 따뜻한 영국 마을: 부드러운 풀·돌·벽돌 색, 낮은 채도, 과한 윤곽선 없음.
- 아기 캐릭터풍과 이모지는 줄인다. 글자 칩, 단순한 아이콘, 접근성 이름으로 대신한다.
- 장식을 늘리지 않는다. 장소가 문형에 쓰이는 물건만 놓는다.
- 문장과 정답은 그림에 굽지 않고 화면의 글자로만 둔다.
- 초등(Easy~Advanced)은 구체적인 물건과 동작을 쓴다.
- 중·고등(Middle·High)은 같은 마을 안에서 대화, 메시지, 시간표, 신문 같은 자료 유형을 쓴다. 예: 시계탑 시간표(M01, H01), 신문 가판대(M06, H02), 우체통(H05), 게시판·당번표(A01, M03).

## 7. 검증 상태와 한계

**정적 (구현자 실행)**: 더미 env 빌드 경고 0. `testGrammarCourses` ALL PASS. 신규 `testTownMissions` PASS(15개 점검). 신규 `testTownMissionSpots` 54/54. 기존 `testProto25d*` 12개 스위트와 스프라이트 스위트 PASS. `testQaGate` 17/0. `testBundleBudget`, `testLazyChunkGuards`, `testPilotUnit`, `testRegistryCoverage`, `testStudentPathContracts`, `testTownEnvAssets` PASS. 신규 스펙 4개 `node --check` 통과. 미션 카드의 서버 렌더 스모크 통과(🔊·✅ 없음, 확인 전 듣기 영어 없음).

**브라우저: 미실행.** 여유 RAM 2.01 GB로 3 GB 규칙 미만이다. 새 `[town-mission]` 스펙(마을 → 표지판 → 시작 → 덱 → 요약 → 마을 복귀와 '완료' 칩, 중간 이탈, 문법 홈 입구, 마무리 이벤트 최대 1회, 360×640·1280×800 스크린샷)은 한 번도 실행되지 않았다. CDP 터치 탭과 걷기 타이밍도 검증되지 않았다. `[grammar-scenes]`, `[grammar-scene]`, `[grammar]`, `[proto25d]` 회귀도 대기 중이다. 화면에서의 동작은 확인된 것이 없다.

**알려진 한계**
- 마을로 돌아오면 화면이 다시 마운트되어 Paul 위치가 처음으로 돌아간다.
- 잔디·길·공·Cookie 그림은 임시이고 동작 배지는 아직 이모지다.
- 연결된 장소는 공원 하나뿐이다(계획 26개 중 1개).
- 완료 표시는 세션 안에서만 유지된다. 영구 완료는 운영자의 저장 결정이 필요하다.
- 장소 연결표는 제안이다. 교사·운영자 확정 전이다.

## 8. 다음 단계

1. RAM 3 GB 이상에서 `[town-mission]`, `[grammar-scenes]`, `[grammar-scene]`, `[grammar]`, `[proto25d]`를 한 번에 하나씩 실행하고 스크린샷을 눈으로 확인한다. 실패는 스펙 오류와 제품 결함으로 분류한다.
2. 운영자: §5.3 에셋 제공, §4 장소 연결표 확정, 완료 표시를 기기에 남길지 결정.
3. 연결표 확정 뒤 §4.2 순서(카페 → 책방 → 공원 놀이 → 과일 가게 → 빵집)로 한 장소씩 같은 구조(미션 데이터 항목 + 표지판 + 상황 소개)로 연결한다. 스프라이트가 있는 장소가 먼저다.
