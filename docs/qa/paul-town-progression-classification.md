# Paul Town 진행 요소 분류 — ACTIVE / DORMANT / UNREACHABLE / NOT IMPLEMENTED

_scripts/testPaulTownProgression.mjs가 매 실행마다 재생성하는 machine-readable 분류표(overnight QA track T1, 2026-09-04). 값이 바뀌면 이 파일도 다음 실행 시 갱신된다 — 수동 편집 금지, 소스는 이 테스트 파일의 `CLASSIFICATION` 배열._

| id | 요소 | 분류 | 근거(file:line) |
|---|---|---|---|
| garden-screen | 정원 화면(EnglishGarden, 4x4 텃밭) | ACTIVE | attachmentWorldGarden 기본 true(src/config/features.js:56) — Dashboard.jsx:810-812 나의 정원 버튼 → EnglishGarden.jsx:11-102 전체 화면 렌더 |
| world-label-rows | 월드 단계(집/다리/도서관/마을/왕국) — 목록 행 | ACTIVE (라벨 행) | 플래그 무관 항상 렌더: EnglishGarden.jsx:87-96 world.stages.map — 잠금 아이콘/이름/설명만 있는 행. 데이터: worldProgress.js:42-51 WORLD_STAGES |
| world-full-screens | 월드 단계별 전용 화면(집/다리/도서관/마을/왕국 각각의 독립 상세 화면) | NOT IMPLEMENTED | 해당 화면 컴포넌트가 저장소에 존재하지 않음(grep 결과 0건) — attachmentWorldFull 플래그를 켜도 EnglishGarden.jsx:92의 라벨 문구만 바뀔 뿐 새 화면/라우트가 생기지 않는다(App.jsx의 screen 분기에 house/bridge/village/kingdom 라우트 없음) |
| attachmentWorldFull-flag | attachmentWorldFull 플래그가 게이팅하는 분기(라벨 텍스트) | DORMANT | 기본 false(src/config/features.js:57) — 켜면 EnglishGarden.jsx:92의 "곧 구경할 수 있어요" 대신 "열려 있어요!"로 바뀌는 분기가 실제로 존재(정적 하네스 6.UI GATING 섹션에서 정확히 1곳임을 고정) |
| town-museum | Paul Town 박물관(museum, 단어 박물관 이동) | ACTIVE | paulTownBuildings 기본 true(src/config/features.js:72) — PaulTown.jsx:163-186 discoveredPlaces 카드 → onGo(p.screen) → App.jsx:845-849 WordMuseum 렌더 |
| town-library | Paul Town 도서관(library, 책장 이동) | ACTIVE | paulTownBuildings 기본 true + attachmentBookshelf 기본 true(src/config/features.js:58,72) — PaulTown.jsx:36 canEnter, App.jsx:866-870 Bookshelf 렌더 |
| town-clockTower | Paul Town 시계탑(clockTower, 타임머신 이동) | ACTIVE | paulTownBuildings 기본 true(src/config/features.js:72) — PaulTown.jsx:163-186 → App.jsx:871-874 TimeMachine 렌더 |
| hats | 모자 컬렉션 8종(수집/장착) | ACTIVE | attachmentHats 기본 true(src/config/features.js:52) — Dashboard.jsx:801-803 나비 버튼 → App.jsx:841 HatCollection, PaulTown.jsx:99-143 모자걸이 장착 UI |
| milestones | 밀스톤(성장 앨범, GrowthAlbum) | ACTIVE | attachmentAlbum 기본 true(src/config/features.js:54) — Dashboard.jsx:807-809 나비 버튼 → App.jsx:850 GrowthAlbum 렌더 |
| home-deco | 폴의 집 소품 6종 | ACTIVE | 플래그 게이트 없음(paulHomeDeco 결과가 있으면 무조건 렌더) — PaulTown.jsx:144-157 |
| story | 이어지는 이야기(STORY_TEMPLATES/buildStoryChapter) | NOT IMPLEMENTED | attachmentStory 기본 false(src/config/features.js:59)이고, 데이터/템플릿 함수 자체는 storyFoundation.js에 구현돼 있으나(코드 존재) 어떤 컴포넌트도 이를 import/소비하지 않음(grep 0건, attachmentWorldFull과 달리 "플래그를 켜도 바뀌는 코드 분기"가 아예 없다) — 백엔드 함수는 있지만 UI 소비자가 전혀 없어 DORMANT(플래그로 켤 수 있는 분기)보다 NOT IMPLEMENTED가 정확 |
| bookshelf | 책장(Bookshelf, 완료 유닛에서 파생된 책 목록) | ACTIVE | attachmentBookshelf 기본 true(src/config/features.js:58) — Bookshelf.jsx:13 getBookshelf/getTextbookBooks 소비, App.jsx:866-870에서 렌더(story와 달리 이 함수들은 실제로 import되어 쓰인다) |

분류 요약: ACTIVE 9 / NOT IMPLEMENTED 2 / DORMANT 1 (총 12개)
