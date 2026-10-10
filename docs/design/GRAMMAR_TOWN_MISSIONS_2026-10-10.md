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

## 9. 아트 키트 반입(242차)

_242차 추가(2026-10-10, 기준 `59058820`). §5의 "없는 파일" 목록 일부가 이 반입으로 채워졌다. 아래 §9~§13은 추가분이며 §5 이하 기존 내용은 그대로 둔다._

**경위**
- 운영자는 이미지를 `src/assets/town/`에 넣었다고 했으나, 작업 폴더와 `C:\voca` 어디에도 없었다.
- 실제로는 운영자의 Dropbox 폴더에 PNG 원본 95장(각 1~3 MB)만 있었다. 원본은 저장소에 없고 수정하지 않았다.
- 원본을 최적화한 사본으로 반입했다.

**반입 결과**
- 커밋 `e23014a5`. 94개 대상이 WebP 188개(1x는 긴 변 256 px 이하, @2x는 512 px 이하, 배경은 768/1536 px)와 `manifest.json`으로 들어왔다. 합계 약 7.3 MB.
- 파이프라인은 `scripts/town/buildTownKit.py`와 `scripts/town/kit_map.tsv`다. 다시 실행해도 결과가 같다(결정적).
- 검사 `scripts/testTownKitAssets.mjs` 1417개: manifest와 파일 일치, 파일별 크기 예산, kebab-case 이름, 허용된 import 위치.
- 위치는 `src/assets/town/kit/<그룹>/<이름>.webp`와 `<이름>@2x.webp`.

**보류와 표시**
- `character/paul-portrait`(원본 `폴얼굴.png`, 인물 사진풍 초상)는 운영자 확인 전까지 반입하지 않았다(skipped).
- `props/water-barrel`은 그림이 위쪽 캔버스 끝에 닿는다. 원본에서 이미 잘렸을 가능성이 있다.
- `backgrounds/plaza-topdown`은 품질 70에서도 파일 예산을 넘는다. 어디서도 쓰지 않는다.
- 글자가 그림에 구워진 건물 4개(gift-shop "SHOP", school "SCHOOL", bookshop "BOOKSHOP", my-cottage "MY COTTAGE")는 마을 건물로는 괜찮다. 정답이 되는 그림으로는 쓰지 않는다.

## 10. 이미지 ↔ 장소·학습 장면 연결표(94+1개)

`scripts/town/kit_map.tsv` 95행 전부. 파일은 모두 `src/assets/town/kit/` 아래이고 @2x가 같은 이름으로 함께 있다. "사용 중"은 7개(문법 6개와 마을 표지판 1개)이고 나머지 87개(skipped 1개 포함)는 반입만 됐다. 반입만 된 파일은 코드가 참조하지 않아 번들에 들어가지 않는다.

### 10.1 backgrounds (2)

| 원본 이름 | 프로젝트 파일 | 장소 | 학습 장면 용도 | 현재 사용 여부 |
|---|---|---|---|---|
| 배경 | `kit/backgrounds/park-backdrop.webp` | 공원 | 공원 미션 배경(E05, E04, I04, M05) | 사용 중 |
| road | `kit/backgrounds/plaza-topdown.webp` | 광장 | 마을 광장 지도(위에서 본 길). 마을 화면 후보, 학습 장면 미사용 | 반입만(예산 초과) |

### 10.2 character (3)

| 원본 이름 | 프로젝트 파일 | 장소 | 학습 장면 용도 | 현재 사용 여부 |
|---|---|---|---|---|
| 쿠키 | `kit/character/cookie-stand.webp` | 공원/마을 | Cookie 서 있는 모습. dog 세기(E05), 마을 표지판 옆 | 사용 중 |
| dog | `kit/character/cookie-sit.webp` | 공원/마을 | Cookie 앉은 모습. dog 세기, 벤치 장면 | 사용 중 |
| 폴얼굴 | `kit/character/paul-portrait.webp` | 없음 | 인물 사진풍 초상. 학습 장면 미사용(운영자 확인 필요) | 반입 보류(skipped) |

### 10.3 nature (2)

| 원본 이름 | 프로젝트 파일 | 장소 | 학습 장면 용도 | 현재 사용 여부 |
|---|---|---|---|---|
| tree | `kit/nature/tree.webp` | 공원 | 나무 세기·심기(E05), behind the tree(I06) | 사용 중 |
| bush | `kit/nature/hedge.webp` | 공원/정원 | 생울타리. 배경 장식, 위치 표현 기준물 | 반입만 |

### 10.4 props (42)

| 원본 이름 | 프로젝트 파일 | 장소 | 학습 장면 용도 | 현재 사용 여부 |
|---|---|---|---|---|
| flower | `kit/props/sunflower-pot.webp` | 공원/꽃집 | 꽃 세기(E05, 공 대신), I like(E06) | 사용 중 |
| flower2 | `kit/props/flower-cart.webp` | 꽃집/공원 | 꽃수레. 장식, 꽃집 장면 | 반입만 |
| flower(root) | `kit/props/flower-wheelbarrow.webp` | 정원 | 정원 장식 | 반입만 |
| flower22222 | `kit/props/flower-urn.webp` | 공원/정원 | 공원 장식 | 반입만 |
| strawberries | `kit/props/strawberry-pot.webp` | 과일 가게 | I like(E06) | 반입만 |
| lettuce | `kit/props/vegetable-bed.webp` | 채소 가게/정원 | I like, There are | 반입만 |
| bench | `kit/props/bench.webp` | 공원 | 벤치 세기(E05), on the bench(H06) | 사용 중 |
| picnictable | `kit/props/picnic-table.webp` | 공원 | 공원 소품, on/under 위치(E02 대체 장면) | 반입만 |
| swing | `kit/props/swing.webp` | 공원 | 놀이 동작 can(E04, I04) | 반입만 |
| balloons | `kit/props/balloons.webp` | 공원/장난감 가게 | 개수 세기 후보(There are), 장식 | 반입만 |
| present | `kit/props/gift-box.webp` | 장난감 가게 | Would you like(I08), This/That(E08) | 반입만 |
| chest | `kit/props/treasure-chest.webp` | 없음 | 보상 연출 후보(학습 장면 미사용) | 반입만 |
| award | `kit/props/star-trophy.webp` | 없음 | 마무리 카드 후보(보상 규칙 변경 없음) | 반입만 |
| sign | `kit/props/signpost.webp` | 마을 | 마을 미션 표지판 | 사용 중 |
| fence | `kit/props/fence.webp` | 공원/정원 | 울타리. 위치 기준물 | 반입만 |
| fence222 | `kit/props/stile.webp` | 공원 | 울타리 디딤대. 장식 | 반입만 |
| gate22 | `kit/props/garden-gate.webp` | 정원 | 문 open/close(M02, M05) | 반입만 |
| arch | `kit/props/rose-arch.webp` | 공원/정원 | 공원 입구 장식 | 반입만 |
| stair | `kit/props/stone-steps.webp` | 공원 | 장식 | 반입만 |
| stones | `kit/props/stepping-stones.webp` | 공원 | 길 장식 | 반입만 |
| sundial | `kit/props/sundial.webp` | 광장/공원 | 시간 표현(M01) 후보 | 반입만 |
| bee | `kit/props/beehive.webp` | 정원 | 장식 | 반입만 |
| birds | `kit/props/birdhouse.webp` | 공원 | 장식, There is 후보 | 반입만 |
| water | `kit/props/water-barrel.webp` | 정원 | 장식(그림이 위쪽 끝에 닿음, 표시됨) | 반입만 |
| pot | `kit/props/compost-box.webp` | 정원 | 장식 | 반입만 |
| tools | `kit/props/tool-rack.webp` | 정원 | 장식 | 반입만 |
| kettle | `kit/props/watering-can.webp` | 정원 | 현재진행(I05 watering) 후보 | 반입만 |
| bicycle parking | `kit/props/bike-rack.webp` | 거리 | 장식 | 반입만 |
| 시계탑 | `kit/props/street-clock.webp` | 광장 | 시간·일정(M01, H01) | 반입만 |
| 가로등 | `kit/props/bollard.webp` | 거리 | 장식 | 반입만 |
| post lamp | `kit/props/street-lamp.webp` | 거리 | 장식 | 반입만 |
| 쓰레기통 | `kit/props/recycling-bin.webp` | 거리 | should/have to(A05) 후보 | 반입만 |
| bin | `kit/props/litter-bin.webp` | 거리/공원 | should/have to(A05) 후보 | 반입만 |
| 공중전화 | `kit/props/phone-box.webp` | 거리 | 간접화법·메시지(H05) 후보 | 반입만 |
| red post box | `kit/props/post-box.webp` | 거리 | 메시지 전달(H05) | 반입만 |
| fountains | `kit/props/bird-bath.webp` | 공원 | 장식, There is 후보 | 반입만 |
| fountain | `kit/props/fountain.webp` | 광장 | 현재진행(I05) 광장 | 반입만 |
| fountain222 | `kit/props/wall-fountain.webp` | 광장 | 장식 | 반입만 |
| bridge | `kit/props/stone-bridge.webp` | 강 | 분사구문(H06) 다리 | 반입만 |
| ship | `kit/props/sailboat.webp` | 항구 | 장식, going to(A01) 후보 | 반입만 |
| tent | `kit/props/tent.webp` | 공원 | going to 계획(A01) 후보 | 반입만 |
| dog house | `kit/props/dog-house.webp` | 공원/집 | Cookie 집. in/next to 위치(E02, I06) | 반입만 |

### 10.5 animals (5)

| 원본 이름 | 프로젝트 파일 | 장소 | 학습 장면 용도 | 현재 사용 여부 |
|---|---|---|---|---|
| squirrel | `kit/animals/squirrel.webp` | 공원 | 동물 세기·can 후보 | 반입만 |
| rabbit | `kit/animals/rabbit.webp` | 공원 | 동물 세기·can 후보 | 반입만 |
| fox | `kit/animals/fox.webp` | 공원 | 동물 세기 후보 | 반입만 |
| duck | `kit/animals/duck.webp` | 공원 | 동물 세기 후보 | 반입만 |
| owl | `kit/animals/owl.webp` | 공원 | 동물 후보 | 반입만 |

### 10.6 buildings (41)

| 원본 이름 | 프로젝트 파일 | 장소 | 학습 장면 용도 | 현재 사용 여부 |
|---|---|---|---|---|
| train | `kit/buildings/train-engine.webp` | 기차역 | have ever been(A06). 역 건물 그림은 없음 | 반입만 |
| ticket | `kit/buildings/ticket-booth.webp` | 기차역 | 매표소. 주문/요청, A06 | 반입만 |
| bus stop | `kit/buildings/bus-stop.webp` | 거리 | 일정·시간표(M01) 후보 | 반입만 |
| bakery | `kit/buildings/bakery.webp` | 빵집 | 빵집 주문(I03) | 반입만 |
| cafe | `kit/buildings/cafe.webp` | 카페 | Would you like(I08), Do you like(E07) | 반입만 |
| fruit store | `kit/buildings/fruit-shop.webp` | 과일 가게 | I like(E06) | 반입만 |
| vegetable store | `kit/buildings/greengrocer.webp` | 채소 가게 | I like 확장 | 반입만 |
| flower store | `kit/buildings/flower-shop.webp` | 꽃집 | I like·This/That 후보 | 반입만 |
| ice cream | `kit/buildings/ice-cream-stall.webp` | 광장 | Would you like 후보 | 반입만 |
| bookshop | `kit/buildings/bookshop.webp` | 책방 | This/That(E08). 간판 글자 구워짐 | 반입만 |
| school1 | `kit/buildings/school.webp` | 학교 | E01, E03, A01, A05, M02, M03. 간판 글자 구워짐 | 반입만 |
| TOy sstore | `kit/buildings/toy-shop.webp` | 장난감 가게 | This/That·Can I 후보 | 반입만 |
| pet shop | `kit/buildings/pet-shop.webp` | 애완동물 가게 | 동물·좋아해요 후보 | 반입만 |
| music store | `kit/buildings/music-shop.webp` | 음악 가게 | can(play/sing) 후보 | 반입만 |
| art store | `kit/buildings/art-shop.webp` | 미술 가게 | 현재진행(painting) 후보 | 반입만 |
| bicycle | `kit/buildings/bike-shop.webp` | 자전거 가게 | can ride 후보 | 반입만 |
| bell shop | `kit/buildings/bell-shop.webp` | 거리 | 장식 | 반입만 |
| string | `kit/buildings/tailor-shop.webp` | 거리 | 장식 | 반입만 |
| poceline | `kit/buildings/china-shop.webp` | 거리 | 장식 | 반입만 |
| shop1 | `kit/buildings/gift-shop.webp` | 거리 | 장식. 간판 글자 SHOP 구워짐 | 반입만 |
| druggg | `kit/buildings/clinic.webp` | 거리 | should(A05) 후보 | 반입만 |
| drug store | `kit/buildings/potion-shop.webp` | 거리 | 장식 | 반입만 |
| alchemist | `kit/buildings/fire-station.webp` | 거리 | must/have to(M02) 후보 | 반입만 |
| aqua | `kit/buildings/aquarium-shop.webp` | 거리 | 장식 | 반입만 |
| bones | `kit/buildings/museum.webp` | 광장 | 수동태 기사(H02) 후보 | 반입만 |
| council | `kit/buildings/town-hall.webp` | 광장 | 뉴스·공지(H02, M06) 후보 | 반입만 |
| 시계탑 | `kit/buildings/clock-tower.webp` | 광장 | 시제·기간(M01, H01) | 반입만 |
| 천문대 | `kit/buildings/observatory.webp` | 언덕 | 가정법·계획 후보 | 반입만 |
| lighthouse | `kit/buildings/lighthouse.webp` | 항구 | 장식 | 반입만 |
| mill | `kit/buildings/windmill.webp` | 농장 | 수동태(is made) 후보 | 반입만 |
| 마굿간 | `kit/buildings/stable.webp` | 농장 | 장식 | 반입만 |
| stage | `kit/buildings/barn.webp` | 농장 | 장식 | 반입만 |
| shipp | `kit/buildings/boathouse.webp` | 항구 | 장식 | 반입만 |
| castle gate | `kit/buildings/castle-gate.webp` | 마을 입구 | 마을 입구 장식 | 반입만 |
| 팔각정 | `kit/buildings/gazebo.webp` | 공원 | 공원 정자. 장식 | 반입만 |
| reading spot | `kit/buildings/reading-pavilion.webp` | 공원 | 읽기 활동 장소 후보 | 반입만 |
| 가든 | `kit/buildings/greenhouse.webp` | 정원 | 정원 장식 | 반입만 |
| tre ehouse | `kit/buildings/treehouse.webp` | 공원 | going to·can 후보 | 반입만 |
| 집 | `kit/buildings/cottage-large.webp` | 집 | home(E02, I02) | 반입만 |
| house22 | `kit/buildings/cottage-clock.webp` | 집 | 장식 | 반입만 |
| cottage3 | `kit/buildings/my-cottage.webp` | 집 | my house(E02). 간판 글자 구워짐 | 반입만 |

## 11. 공원 미션에 실제로 쓴 파일

커밋 `b108a7f4`. 문법 쪽에서 키트를 import하는 곳은 `src/utils/grammar/parkArt.js` 하나뿐이다. 6개 그림을 1x와 @2x로 쓰며, @2x는 화면 배율(devicePixelRatio)이 1보다 클 때만 고른다.

| 파일 | 무대에서의 쓰임 | 무대 크기 |
|---|---|---|
| `kit/backgrounds/park-backdrop` | 무대 전체 배경(slice, 잔디 유지). 공원 바닥선 198 | 무대 전체 |
| `kit/character/cookie-stand` | dog 세기에서 서 있는 Cookie | 61×73 |
| `kit/character/cookie-sit` | 앉은 Cookie. 세 마리가 뚜렷이 다르도록 서기·앉기를 번갈아 놓음 | 61×73 |
| `kit/nature/tree` | 나무 | 90×90(만들기 4칸 단계에서 너비 76) |
| `kit/props/bench` | 벤치 | 76×73 |
| `kit/props/sunflower-pot` | 꽃 | 46×67 |

- Paul은 기존 Paul PNG를 그대로 쓴다(74×79). 키트의 `paul-portrait`는 쓰지 않는다.
- 줄은 Paul 오른쪽 잔디 위에 가운데 정렬로 같은 간격을 두고 놓는다.
- **공 그림이 없어서** 단원의 `ball`을 모든 곳에서 `flower`로 바꿨다. 선택 3번은 'There ___ three flowers.', 듣기 1번은 'There is a flower.'(보기 flower×1 / flower×2 / dog×1), 말하기 대안, 쓰기 메모, 단어(ball/balls 제거, flower/flowers 추가). 덱은 여전히 15장이고 단계 종류와 id는 같다.
- 단원 안의 모든 그림은 360×220 안에 있고, 물건 겹침은 15% 이하, 간격은 균등, Cookie 이름표는 무대 안, 그림 개수는 문장과 같다. 공원 배경을 쓰는 7개 단원 모두에 핀이 있다.
- 공원 그림은 공원 장면에서만 참조한다. 같은 공원 배경을 쓰는 다른 단원(g-easy-03, g-easy-04, g-int-04, g-int-06, g-adv-06, g-mid-01)은 새 배경을 받고, g-int-06과 g-adv-06은 키트 dog·tree도 받는다.
- g-easy-05에 남은 임시 도형 그림은 0개다.
- 마을 표지판(커밋 `cee61c01`): `kit/props/signpost`가 기존 표지판 스프라이트를 대신하고, 그 옆에 `kit/character/cookie-stand`가 서 있다(장식, 누를 수 없음). 누르는 영역·도착 칸·시작 버튼·완료 칩은 그대로다. 모바일에서 표지판 44×67 px, Cookie 20×24 px, 옆의 Paul 40×53 px.
- 번들에 나가는 이미지: 공원 12개(배경 74 KB / @2x 231 KB, 스프라이트 19~28 KB / @2x 52~90 KB), 표지판 4개(signpost 16/45 KB, cookie-stand 23/72 KB). 문법 청크 257.7 KB raw / 72.1 KB gzip, Proto25DScreen 63.3 KB raw / 20.3 KB gzip.

## 12. 아직 부족한 이미지(정확한 파일명·용도)

파일은 `src/assets/town/kit/` 아래에 `.webp`와 `@2x.webp` 한 쌍, 투명 배경, 글자는 그림에 굽지 않는다.

**공원 미션**
- `props/ball`: 공. There is/are의 원래 어휘이고 지금은 꽃으로 대체했다.
- `character/cookie-run`: 선택. can과 현재진행형 장면용.
- `character/paul-stand`: 전신 Paul. 지금은 기존 Paul PNG를 쓴다. 초상 `paul-portrait`를 쓸지는 운영자 확인이 필요하다.

**다른 미션의 사람**
- `character/mia`, `character/tom`, `character/mom`, `character/dad`, `character/teacher`, `character/kid`.

**음식·가게 소품**
- `props/apple`, `props/bread-basket`, `props/cake`, `props/pizza`, `props/milk`, `props/juice`, `props/book`, `props/pencil`, `props/bag`, `props/box`.

**학교·기차역·뉴스**
- `buildings/train-station`: 기관차와 매표소는 있으나 역 건물이 없다.
- `props/notice-board`, `props/newspaper-stand`, `props/timetable-board`, `props/letter`.

**배경**
- `backgrounds/school-backdrop`, `backgrounds/home-backdrop`, `backgrounds/street-backdrop`, `backgrounds/cafe-backdrop`, `backgrounds/bakery-backdrop`, `backgrounds/fruit-shop-backdrop`.

**동작 배지**
- `ui/action-<key>`: 지금은 이모지다.

**§5.3의 "새로 필요한 14개"가 이번 반입으로 채워진 정도**
- 반입됨(건물 그림): bakery, fruit-shop, cafe, bookshop, school, clock-tower, 다리(`props/stone-bridge`), 우체통(`props/post-box`), 매표소(`buildings/ticket-booth`), 기관차(`buildings/train-engine`), 분수(`props/fountain`). §5의 해당 "NEW" 항목은 더 이상 부족하지 않다. 단, §5.3 목록의 경로(`buildings/bakery.webp` 등)와 달리 실제 위치는 `kit/` 아래이다.
- 여전히 부족: 기차역 건물, 게시판, 신문 가판대, 빵 바구니, 과일 상자, 사과, 케이크, 시간표, 표(ticket), 신문, 편지, 주스. 이 중 이름이 §12 위쪽 목록에 없는 `props/fruit-crate`와 `props/ticket`도 계속 필요하다.

## 13. 검증 상태

**정적(구현자 실행)**: 더미 env 빌드 경고 0. `testGrammarCourses` ALL PASS. `testTownKitAssets` 1417/1417. `testTownMissionSpots` 84/84. `testTownMissions`, `testQaGate` 17/0, `testBundleBudget`, `testLazyChunkGuards`, `testPilotUnit`, `testRegistryCoverage`, `testStudentPathContracts`, `testTownEnvAssets`, `testProto25d*` ALL PASS. 파일럿 장면 카드 13장 서버 렌더 스모크 통과.

**시각(합성 미리보기)**: `scripts/town/renderScenePreview.mjs/.py`가 g-easy-05의 모든 그림(21장)을 앱과 같은 배치 함수로 그린다. 기하·가로세로비·투명도 확인용이며 브라우저 시험이 아니다. 리드가 21장 모음을 두 번 보고 확대·중앙 정렬 보정을 한 번 요청했다. 잘림 없음, 발이 잔디 위, 개수가 분명함, 투명 가장자리 깨끗함까지만 확인했다.

**브라우저: 미실행.** 여유 RAM 2.62 GB(<3 GB 규칙). 실제 화면에서 확인되지 않은 것: 기기에서의 이미지 로딩, 실제 카드 너비에서의 slice 잘림, 누르기·끌기, 음성, 2.5D 마을의 표지판과 Cookie, 실제 레이아웃에서 모바일 360×640 잘림. 이 중 어느 것도 확인됐다고 쓰지 않는다.

**진도·보상**: 241차와 동일. 새 보상·XP·DB·저장 없음. 마무리 분석 이벤트는 입구와 무관하게 하루 한 번 중복 제거.

**클릭 경로(241차와 동일)**: (A) 마을 표지판 → 공원 미션 시작 → 15장 → 마을로 돌아가기. (B) 문법 홈 → 폴타운 미션.

**다음**
1. RAM 3 GB 이상에서 `[town-mission]`, `[grammar-scene]`, `[grammar-scenes]`, `[grammar]`, `[proto25d]`를 한 번에 하나씩 실행한다.
2. 운영자: `paul-portrait` 사용 여부 확인, §12 부족 파일 제공, 장소 연결표 확정.
3. 새 그림 없이 만들 수 있는 다음 미션: 카페(g-int-08), 책방(g-easy-08), 공원 놀이(g-easy-04).

## 14. 문법 마을 지도(243차) — 87개 그림 배치 계획과 구현

운영자 요청(243차): PR #62 작업을 유지한 채 이미지 95장을 조사하고, 쓰이지 않던 87장이 문법 마을 어디에 들어갈지 학습 장소·미션과 연결해 계획한다. 장식이 아니라 학생이 마을을 돌아다니며 배우고, 연습하고, 미션을 끝내는 구조여야 한다. Speaking·Writing·Voca는 바꾸거나 깨뜨리지 않는다. 기준 `d7b0d5ba`, QA 계정 전용, 새 보상·XP·DB·저장 없음.

**구조**: 홈 Grammar 카드 → 문법 마을 지도(7개 구역을 위에서 아래로) → 장소 누르기 → 장소 카드(아래에서 올라오는 시트: 건물 그림, 여기서 하는 일, 미션 목록) → 미션 → 기존 한 장씩 덱(`returnTo 'village'`) → '마을로 돌아가기' → 같은 구역으로 복귀하고 그 미션에 '완료' 칩과 '완료 n / 34'. 지도 맨 아래 '과정 목록으로 보기'는 기존 과정 목록을 그대로 연다. 2.5D 마을 공원 표지판 흐름과 덱 내용은 불변이다.

**배치 원칙**
- 그림 95장 모두 지도에서 정확히 한 번 설명된다. 91장이 지도에 올라간다(탭 가능한 장소 29, 장식 61, 공원 배경 1). 4장은 일부러 올리지 않고 사유를 데이터에 남겼다(`VILLAGE_HELD`).
- 건물은 "그 장소에서 실제로 할 수 있는 미션"이 있을 때만 시작 가능한 장소가 된다(14곳, 26단원). 어울리는 미션이 아직 없는 건물 15곳은 이름과 한 줄 `soonKo`만 보이고 시작할 수 없는 '준비 중' 장소다. 억지로 단원을 붙이지 않았다.
- 소품·동물·식물은 구역에 속한 장식이다(공원엔 공원 것, 정원엔 정원 것). 탭 불가, `alt=""`.
- 장소가 문형을 돕지 않는 8단원은 지도 끝 '문법 노트' 목록에서 같은 덱을 연다(§15.3).
- 데이터는 `src/utils/grammar/village.js`(순수 모듈, 이미지 import 없음), 그림 URL은 `src/utils/grammar/villageArt.js` 한 곳(마을 화면 청크에서만 import). 좌표는 구역 상자 기준 퍼센트, 높이는 manifest 가로세로비에서 계산.

**구현 커밋(기준 `d7b0d5ba`)**
1. `f98e2797` fix: 선택지 줄이 360 px에서 줄바꿈, 미니 공원 그림이 항목 줄로 확대(`miniCrop`) — §16의 1차 브라우저 실행에서 발견한 결함.
2. `b8e1ab71` 마을 데이터: `village.js`, `villageArt.js`, `scripts/testGrammarVillage.mjs`(1608개 점검), `scripts/town/renderVillagePreview.py`. 우체통 탭 영역을 넓히는 데이터 조정 1건 포함.
3. `2b4b27bb` 마을 화면: `src/components/GrammarVillage.jsx`(lazy 청크 44.3 KB raw / 12.2 KB gzip), 공용 단원 데이터 청크 196.5 KB / 53.0 KB gzip, `GrammarCourseScreen` 70.5 KB / 22.5 KB, 메인 청크 gzip 129.85 KB(약 +0.9 KB). 덱 머리글을 한 줄로 줄임(덱 안에서는 바깥 '문법 과정' 줄 숨김) → 카드가 커지고 다음 버튼이 떠 있는 속도 위젯 위로 올라온다.
4. `f26c61f4` e2e: 신규 `[grammar-village]` 스펙, 문법 스펙이 새 진입 경로(홈 카드 → 마을 → `gv-to-courses`)를 따름, 선택지 섞인 순서 처리, 잘린 SVG 사각형 헬퍼, `[town-mission]` 스토리지 허용 목록과 페이지 로드당 마무리 이벤트 점검.

**하지 않은 것**: 스토리지 키, 보상·XP 변경, Speaking·Writing·Voca 코드 변경, 2.5D 엔진 변경, Supabase SQL(필요한 것도 없음).

## 15. 구역·장소·미션 표

출처는 `src/utils/grammar/village.js`와 `grammarUnits.js`의 실제 값이다. 구역 순서는 지도 위에서 아래다.

### 15.1 구역별 장소와 미션(시작 가능 14곳, 26단원)

| 구역 | 장소(그림) | 미션 단원 id · 제목 |
|---|---|---|
| 공원 (배경 `park-backdrop`) | 공원 잔디밭 (`props/signpost`) | g-easy-05 …이 있어요 There is · g-easy-04 할 수 있어요 can · g-int-04 Can you …? 묻기 · g-mid-05 분사로 꾸미기 |
| 집과 정원 | 우리 집 (`buildings/my-cottage`) | g-easy-02 어디 있어? Where's · g-int-02 엄마는 …해요 |
| 집과 정원 | 정원 있는 집 (`buildings/cottage-large`) | g-int-06 위치 말 늘리기 |
| 학교 | 학교 (`buildings/school`) | g-easy-01 부탁하기 Can I …? · g-easy-03 나는 …이야 am·is·are · g-adv-01 계획 말하기 going to · g-adv-05 should·have to · g-mid-02 조동사 can·may·must · g-mid-03 수동태 기초 |
| 시장 거리 | 카페 (`buildings/cafe`) | g-easy-07 …해요? Do you …? · g-int-08 Would you like …? |
| 시장 거리 | 빵집 (`buildings/bakery`) | g-int-03 무엇을 좋아해? |
| 시장 거리 | 과일 가게 (`buildings/fruit-shop`) | g-easy-06 좋아해요 I like |
| 시장 거리 | 서점 (`buildings/bookshop`) | g-easy-08 이것·저것 This is |
| 광장 | 마을회관 (`buildings/town-hall`) | g-mid-06 조건문 if · g-high-02 수동태 심화 |
| 광장 | 시계탑 (`buildings/clock-tower`) | g-mid-01 시제 정리 · g-high-01 완료 시제 |
| 광장 | 분수 (`props/fountain`) | g-int-05 지금 …하고 있어요 |
| 광장 | 우체통 (`props/post-box`) | g-high-05 간접화법 |
| 역과 강 | 기차역 (`buildings/ticket-booth`, 옆에 `train-engine` 장식) | g-adv-06 해 본 적 있어요 |
| 역과 강 | 돌다리 (`props/stone-bridge`) | g-high-06 분사구문 |

언덕과 농장 구역에는 시작 가능한 장소가 아직 없다(전부 '준비 중').

### 15.2 '준비 중' 장소 15곳(시작 불가, 이름과 한 줄만 보임)

| 구역 | 장소 | 보이는 한 줄 |
|---|---|---|
| 시장 거리 | 아이스크림 가게 | 먹고 싶은 것 권하고 답하기 |
| 시장 거리 | 꽃집 | 꽃을 가리키며 이것과 저것 말하기 |
| 시장 거리 | 장난감 가게 | 장난감 빌려 달라고 부탁하기 |
| 시장 거리 | 애완동물 가게 | 동물이 좋아하는 것 말하기 |
| 시장 거리 | 음악 가게 | 악기를 할 수 있는지 묻고 답하기 |
| 시장 거리 | 미술 가게 | 그림 그리는 모습을 지금 하는 일로 말하기 |
| 시장 거리 | 자전거 가게 | 자전거를 탈 수 있는지 말하기 |
| 시장 거리 | 채소 가게 | 채소를 세고 좋아하는 것 말하기 |
| 시장 거리 | 병원 | 아플 때 해야 할 일 조언하기 |
| 광장 | 박물관 | 전시물 비교해서 설명하기 |
| 광장 | 소방서 | 안전 규칙 말하기 (must / have to) |
| 언덕과 농장 | 천문대 | 별을 보며 계획 말하기 (be going to) |
| 언덕과 농장 | 풍차 | 만들어지는 과정 말하기 (수동태) |
| 언덕과 농장 | 헛간 | 농장 동물을 세고 설명하기 |
| 언덕과 농장 | 마구간 | 동물이 어디 있는지 위치 말하기 |

각 줄 앞에는 '미션 준비 중 —'이 붙는다. 이 15곳은 새 미션 후보이지만, 단원 내용이 겹치는 곳이 많아 새 단원을 만들지 기존 단원을 옮길지는 §17의 결정 사항이다.

### 15.3 장소 없이 '문법 노트'에서 여는 8단원

| 단원 | 사유(데이터의 `reasonKo`) |
|---|---|
| g-int-01 Is it …? 대답·되묻기 | 상자 속 물건 맞히기 게임이라 특정 장소가 필요 없다 |
| g-int-07 어제 있었던 일 | 어제와 오늘의 시간 비교가 핵심이라 장소가 도움이 안 된다 |
| g-adv-02 비교하기 | 크기·키 비교는 장소와 상관없다 |
| g-adv-03 because·so 잇기 | 이유와 결과는 어느 장소에서나 말할 수 있다 |
| g-adv-04 when·if 잇기 | when/if 문장은 날씨·상태가 핵심이라 장소를 쓰지 않는다 |
| g-mid-04 관계대명사 who·which | 사람이나 사물을 설명하는 문형이라 특정 장소가 필요 없다 |
| g-high-03 관계사 심화 | 긴 문장 속 관계사 해석이라 장소가 힘이 없다 |
| g-high-04 가정법 | 현실과 반대되는 상상이라 실제 장소와 맞지 않는다 |

### 15.4 장식과 보류

| 구역 | 장식(개수) | 내용 |
|---|---|---|
| 공원 | 25 | 정자, 독서 정자, 나무집, 나무, 새집, 장미 아치, 새 목욕통, 부엉이, 울타리, 텐트, 소풍 탁자, 여우, 그네, 토끼, 다람쥐, 디딤돌, 오리, 울타리 계단, 돌계단, 벤치, Cookie 앉기·서기, 개집, 꽃 항아리, 풍선 |
| 집과 정원 | 13 | 시계 달린 집, 온실, 연장 걸이, 벌통, 물통, 정원 문, 울타리, 채소밭, 퇴비 상자, 꽃 수레, 물뿌리개, 딸기 화분, 해바라기 화분 |
| 학교 | 4 | 버스 정류장, 자전거 거치대, 길거리 시계, 휴지통 |
| 시장 거리 | 11 | 수족관 가게, 선물 가게, 약 가게, 종 가게, 재단 가게, 도자기 가게, 가로등, 말뚝, 분리수거함, 꽃 수레, 선물 상자 |
| 광장 | 4 | 전화 박스, 벽 분수, 해시계, 성문 |
| 역과 강 | 4 | 기관차, 돛단배, 보트 창고, 등대 |
| 언덕과 농장 | 0 | 장식 없음(장소 4곳만) |

같은 그림이 수업에도 쓰이는 4장(`character/cookie-sit`, `nature/tree`, `props/bench`, `props/sunflower-pot`)은 지도에서는 공원·집 장식으로 한 번만 센다.

**일부러 올리지 않은 4장(`VILLAGE_HELD`)**: `props/treasure-chest`, `props/star-trophy`(보상 연출용이라 운영자 결정 전까지 사용 안 함, 보상 규칙은 바꾸지 않았다), `backgrounds/plaza-topdown`(지도 배경 후보이지만 용량이 예산을 넘음), `character/paul-portrait`(인물 사진풍이라 키트 변환에서 제외, 운영자 확인 필요).

## 16. 브라우저 실측 결과(첫 실행)

243차에 처음으로 브라우저를 돌렸다(2026-10-10 15:20~16:35). 방법: Playwright headless를 더미 env 빌드의 `vite preview`에 붙이고, **스펙을 한 번에 하나씩** 실행했다(여유 RAM 1.5~2.8 GB라 운영자 지시대로 분할). 이전 241·242차 문서의 "브라우저 미실행"은 이 실행으로 일부 해소됐고, 해소되지 않은 항목은 아래에 따로 적는다.

**1차(기준 `d7b0d5ba` 빌드)**

| 스펙 | 결과 |
|---|---|
| `[town-mission]` | 21/23 |
| `[grammar-scene]` | 192/205 |
| `[grammar-scenes]` | 9/46 |
| `[speaking]` | 608/608 |
| `[writing]` | 83/83 |
| `[unit]` | 141/141 |
| `[student]` (Voca 흐름) | 34/34 |
| `[student-home]` | 241/241 (+1 skip) |
| `[speaking-exam]` | 216/216 |
| `[hats]` | 67/67 |
| `[town-proto2.5d]` | 1524/1529, 실패 5건 전부 시나리오 S37(1280x800, 모달 반복 개폐) 안의 3000 ms `locator.waitFor` 타임아웃. 메모리에 민감한 것으로 알려진 시나리오이며 이번에 다시 확인하지 않았다 |

**1차에서 찾은 실제 제품 결함 3건(수정함, `f98e2797` 및 마을 커밋)**
1. 360×640에서 `gd-next` 아래쪽이 571 px, 속도 위젯 위쪽이 564 px로 7 px 겹침, 그리고 모든 단원에서 머리글이 두 줄이라 카드가 좁았다. 덱 머리글을 한 줄로 줄여 다음 버튼 줄이 위젯보다 8 px 이상 위에서 끝난다.
2. g-high-03 선택 카드에서 4개 선택지 줄이 뷰포트 밖으로 나갔다. 선택지 줄이 줄바꿈된다.
3. 미니 공원 그림에서 항목이 전체 배경 대비 약 15 px로 작았다. `miniCrop`으로 항목 줄에 확대한다.

**1차에서 찾은 스펙 오류(수정함)**: 섞인 순서(add 모드)인데 데이터 순서로 선택지를 비교했다. 앱 내부 스토리지 키를 변경으로 셌다. 잘린 viewBox 안의 SVG 자식을 뷰포트 밖으로 측정했다.

**정정(241차·242차 문서의 서술)**: `grammar_scene_finish` 분석 이벤트의 중복 제거는 "하루에 한 번"이 아니라 **페이지 로드 + 하루 단위의 메모리 내 제거**(`productEvents`의 `_sentToday`)다. 새로고침을 사이에 둔 관찰에서 POST가 2번 나갔다. 분석 전용이며 보상은 없다. 새로고침을 넘는 중복 제거는 스토리지가 필요하므로 운영자 결정이다. 스펙은 "페이지 로드당 최대 1회"로 바꿨다.

**2차(수정 + 마을을 포함한 최종 빌드)**

| 스펙 | 결과 |
|---|---|
| `[grammar-village]` | 53/53 + 소프트 skip 1(먼 구역 그림이 스크롤 전에 이미 요청됨 — 지연 로딩이 **확인되지 않음**) |
| `[town-mission]` | 23/23 |
| `[grammar-scene]` | 205/205 |
| `[grammar-scenes]` | 46/46 (add 모드 33단원 360×640 + 과정별 첫 단원 1280×800) |
| `[grammar]` | 769/769 (+1 skip: '준비 중' 단원이 이제 없음) |
| `[student-home]` | 242/242 (+1 skip) |

**최종 빌드에서 다시 돌리지 못한 것**: `[speaking]`, `[writing]`, `[unit]`, `[student]`(Voca), `[speaking-exam]`, `[hats]`, `[town-proto2.5d]`. 순차 재실행을 시작했으나 첫 스펙이 끝나기 전에 시스템 메모리 정리기가 중단시켰고(여유 RAM 약 1.8 GB), 운영자 승인 없이는 다시 시작하지 않는다. 이 7종의 1차 통과는 `App.jsx`에 마을 연결이 들어가기 **전** 빌드에서 나온 것이고, 각 스펙의 자체 소스는 이번 라운드에서 바뀌지 않았다. S37은 계속 미확인이다.

**직접 눈으로 본 화면(스크린샷)**: 마을의 표지판과 Cookie와 시작 버튼(360), 공원 미션 발견·만들기·듣기 카드의 수정 전후(360), 마을 구역 공원·집·시장·광장과 카페 장소 카드(360).

**정적(최종 빌드)**: 더미 env 빌드 경고 0. `testGrammarCourses`, `testGrammarVillage` 1608/1608, `testGrammarVillageScreen`, `testTownKitAssets` 1418/1418, `testTownMissions`, `testTownMissionSpots` 84/84, `testQaGate` 17/0, `testBundleBudget`, `testLazyChunkGuards`, `testPilotUnit`, `testRegistryCoverage`, `testStudentPathContracts` ALL PASS.

**알려진 한계**
- 공원 미션의 **수업 그림만** 키트 그림을 쓴다. 나머지 25개 연결 단원의 덱 안 그림은 아직 임시 그림이다(키트 건물은 지도와 장소 카드에만 나온다).
- 장소 이름표와 배치는 360 px에서 스펙과 스크린샷 4장으로만 확인했다. 다른 너비는 미확인이다.
- 지연 로딩 미확인(위 표). 마을 '완료' 표시는 새로고침하면 사라진다(세션 한정).
- 교사 검수 0/34는 그대로다.

**클릭 경로**: 홈 [문법 Grammar] → 문법 마을 지도 → 구역 → 장소(예: 카페) → 장소 카드 → 미션 → 덱 → '마을로 돌아가기'. 과정 목록은 지도 맨 아래 '과정 목록으로 보기'.

## 17. 운영자 결정 필요

SQL은 필요 없고 작성하지도 않았다. 아래 1번처럼 저장이나 DB가 필요한 결정은 결정이 난 뒤에 그 방식에 맞는 파일을 준비한다.

1. **완료 표시 저장**: 마을·미션 완료를 저장(스토리지 또는 DB)할지, 지금처럼 세션 한정으로 둘지. `grammar_scene_finish`의 새로고침 넘는 중복 제거도 같은 결정이다.
2. **마을을 기본 입구로**: 지금은 QA 계정에서만 홈 Grammar 카드가 마을로 간다. 일반 학생 입구로 확대할지.
3. **장소 ↔ 단원 표 확정**: §15.1 연결과 §15.2 '준비 중' 15곳 확정.
4. **`character/paul-portrait` 사용 여부**(인물 사진풍이라 키트 변환에서 제외됨).
5. **보상 그림**: `props/treasure-chest`, `props/star-trophy`를 쓸지. 보상 규칙은 바꾸지 않았다.
6. **구역 배경**: 평평한 바닥색을 쓰는 6개 구역(공원만 실제 배경 있음)의 실제 배경 제공.
7. **남은 수업용 그림**: 인물, 음식 소품, 공 등(§12 목록).
8. **교사 검수**: 현재 0/34.
9. **회귀 스펙 재실행**: 메모리 여유가 생기면 7종을 하나씩 다시 돌릴지(S37 포함) 승인.
