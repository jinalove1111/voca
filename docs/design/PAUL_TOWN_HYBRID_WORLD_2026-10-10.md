# Paul Town 하이브리드 2.5D 마을 (C 방식) — 3구역 프로토타입 설계

_2026-10-10 (244차). 브랜치 `feat/paul-town-hybrid-world-2026-10-10`(PR #62 head `d12f145b`에서 분기, PR #62 브랜치는 건드리지 않음). QA 계정 전용, 플래그 `paulTownWorld` 기본 꺼짐. DB·SQL·병합·배포 없음, Preview 확인용._

이 문서는 **확인된 사실**과 **계획**을 구분한다. 각 절 머리에 구분을 적었다. 구현 요약과 세션 기록은 `handoff.md` 244차, 시험 결과는 `TESTING.md` 244차.

## 0. 요청 요약

- C 방식: 캐릭터 직접 이동 + 지도 빠른 이동. 7개 구역을 하나로 이어진 마을로 만든다.
- 구역과 과목: 공원=Grammar, 학교=Writing, 시장=Speaking, 집과 정원=Conversation, 광장=Presentation(기본 시작), 연못과 강=Reading, 언덕과 농장=Voca.
- 탐험 모드(PC 방향키·WASD, 모바일 터치 조이스틱, 건물 근처 미션 표시, 길·건물 충돌, 이동 중 학습 상태 유지)와 지도 모드(전체 지도 버튼, 7개 구역, 장소를 고르면 구역 입구로 이동, 같은 학습 기록, 이동 방식과 무관하게 중복 보상 없음).
- 그림: 쓸 수 있는 그림을 먼저 사용, 크기·그림자·원근·겹침 통일, 바닥과 중복되는 그림 제외, 결정 대기 그림 미사용, 구역별 배치 목록.
- 1단계 범위: 광장 + 공원 + 학교만. 나머지 4구역은 닫힌 문과 '준비 중' 표시.
- 안전: PR #62 보존, 별도 브랜치, DB·SQL 없음, 병합·배포 없음, Preview만.

## 1. 기존 구조 조사 (사실 — 코드 읽기로 확인, 계산값은 "계산"으로 표시, 추측은 "추측")

약칭: P=`src/components/town/proto2_5d/Proto25DScreen.jsx`(2424줄), C=`ProtoCharacter.jsx`(579줄), U=`src/utils/town/proto2_5d/`, W=`src/utils/town/worldContract.js`.

### 1.1 기존 2.5D 프로토타입 엔진 (A)

- **좌표계**: 논리 세계는 두 축 모두 퍼센트 0..100. `WORLD={w:100,h:190}`(W:28)은 세로 비율일 뿐이라 걷기 모드에서 y 1%는 x 1%의 약 1.9배 픽셀이다(계산). 이동 가능 범위 2..98(U/walkGrid.js:24-25), 위쪽 약 12%는 머리 잘림 방지로 못 간다(walkGrid.js:87).
- **세계 크기**: 걷기 모드 켬이 기본. `computeWorldSizePx`(U/camera.js:37-45)가 `min(뷰포트 가로, 세로/1.9) × 1.6`으로 세로로 긴 띠를 만든다. 1280×800에서 674×1280 px(계산)라 PC에서는 1280 폭 안의 좁은 세로 띠가 된다. 새 화면은 이 함수를 쓸 수 없다.
- **카메라**: P:525-624 rAF 루프가 캐릭터·바닥 사각형을 읽고 `computeCameraTarget`(camera.js:57)으로 목표를 구하고 `stepCamera`(보간 0.15)로 `translate3d`를 직접 쓴다. 10프레임 안정되면 멈추고 캐릭터 변화로 다시 깨운다. `computeCameraTarget`·`stepCamera`·`lerp`·`cameraSettled`는 일반형이라 재사용 가능.
- **이동**: 탭해서 걷기만 있다. 키보드 이동·조이스틱 없음(keydown은 Escape뿐, P:1531-1538). 탭 → `classifyTap` → `findPath` → `walkPath`. 경로 한 구간이 setState 한 번, CSS 전환 650 ms 고정(C:168), 다음 구간은 `setTimeout(650)`. 거리와 무관하게 구간 시간이 같고 프레임 단위 갱신이 없어 연속 입력에 쓸 수 없다. 매 이동이 2400줄 컴포넌트를 다시 그린다.
- **격자**: 40×76, 8방향 BFS, 모서리 통과 금지(walkGrid.js:58-59, pathfinding.js). 격자 크기·경계는 모듈 상수라 다른 크기의 세계에 쓸 수 없다.
- **스프라이트**: `PAUL_SPRITE_MANIFEST`(U/characterSpriteManifest.default.js:26). 앞/뒤/옆 3방향, 캔버스 96×128, 발 기준점 (48,128), 걷기는 두 프레임을 150 ms로 번갈아, 옆모습은 오른쪽 기준이고 왼쪽은 좌우 반전. 대각선 없음.
- **재사용 판정(A3, 내보내기 grep 확인)**: 재사용 가능 — `camera.js`의 일반 함수 4종, `depthVisual.js`, `depthOrder.js`, `W.depthScale`, `sceneFixture.js`의 `footprintRect`·`deriveObstacles`·`sceneUnitPx`·`objectRenderedWidthPx`, `characterSpriteContract.js`(`directionForMove`는 world 인자 받음), `benchInteraction.js`의 사각형 기반 도우미, `shopArrivalOk`(타원 판정). 재사용 불가 — `walkGrid.js`·`pathfinding.js`(고정 격자), `missionSpots`·`shopInteraction` 데이터·`placementSlots`(모듈 로드 시 기본 장애물로 계산), `ProtoCharacter`(전환 시간을 줄이는 prop이 없음. 고치면 고정된 구성요소를 건드림).
- **오브젝트 그리기(A4)**: 바닥 중앙 기준 앵커, 폭 = `max(최소폭, 폭% × 장면단위 × 깊이배율)`, 높이는 파일 가로세로비. y 순 정렬(`obstacleZIndex`). 장식 층은 `pointer-events-none`, z 5000.
- **화면을 떠나면 사라지는 상태(A5)**: App이 화면을 조건부로 렌더하므로(App.jsx:1258) 학습 화면으로 가면 언마운트된다. Paul 위치(시작점 50,62로 초기화)·상점·구매·배치·카메라가 사라진다. 그래서 미션 후 돌아오면 Paul이 시작점에 있다. 저장되는 것은 걷기 모드 선호(`paulEasyVoca_proto25dWalkMode`) 하나. 미션 완료는 App 상태(`completedMissionIds`·`completedUnitIds`, App.jsx:273-276)라 새로고침하면 사라진다.
- **현재 화면을 고정하는 시험(A6)**: 정적 약 15종(격자 40×76, 장애물 8개, 시작점 (50,62), 오버스캔 1.6, 청크 gzip ≤60 KB, QA 게이트 패턴 등)과 브라우저 `townProto25d.spec.mjs`(시나리오 S1~S37, 장애물 8·오브젝트 7·그림자 7 등). 세계 크기·이동 모델·오브젝트 목록을 제자리에서 바꾸면 이들이 깨진다.

### 1.2 학습 진입점·복귀·보상 (B)

- 공통: `QA_ONLY_SCREENS`(App.jsx:260-261)는 QA 계정만 통과. 홈 진입은 `StudentHome onGo`(App.jsx:866-873).
- **Grammar(공원)**: 기존 미션 버튼이 `setGrammarEntry({unitId, returnTo:'proto25d'})` → 단원 로드 → `setScreen('grammarCourses')`(App.jsx:1266-1268). 복귀는 덱의 뒤로가기/마무리 버튼이 `townReturn ? proto25d : villageBack ? grammarVillage : home`(App.jsx:930). 틈: `pilotUnits` 로딩 중 대체 화면 버튼(App.jsx:919)은 마을이 아니라 home.
- **Writing(학교)**: 홈 `onGo(writingCoach)`는 선택기를 거쳐(intent writing, App.jsx:869-873) `UnitScreen`(App.jsx:942-949)에서 `onWriting`으로 쓰기 화면. 뒤로가기는 모두 home에 하드코딩(App.jsx:899-901, 910, 944).
- **Speaking(시장)**: 선택기(intent speaking) 또는 직접 말하기 화면. 뒤로가기는 home 하드코딩(App.jsx 884-886 부근).
- **Voca(언덕과 농장)**: 홈 카드가 `setScreen('dashboard')`(StudentHome.jsx:42). 대시보드는 QA 전용이 아니고, 안내 세션 완료는 dashboard로(App.jsx:1019). 출발 위치를 기억하는 구조 없음.
- **Presentation·Conversation·Reading·Phonics·Middle·News**: `courseModel.js:7-16`의 6개 과정이 같은 단원 선택기로 열린다. `UnitScreen`은 `initialSelection`(courseId 등)과 intent를 받는다. 단원 안에서 뒤로가기는 선택기로 먼저 가므로 나가려면 두 번 눌러야 한다.
- **결론**: 마을로 복귀시키려면 App 수준 표식 하나를 두고 home 하드코딩 약 6곳에서 확인해야 한다(참고 패턴: `grammarEntry.returnTo`+`townReturn`).
- **보상·진도**: Grammar·Writing·Speaking·`UnitScreen`에는 보상 호출이 없다(`rewardEngine`·`grantReward`·`addStars` grep 0건). 문법 완료는 App 세션 상태 + 분석 이벤트(`grammar_scene_finish`), 쓰기는 localStorage `paulEasyVoca_writingDrafts_<UUID>`, 단원 기록은 `paulEasyVoca_unitRecords_<UUID>`. **실제 보상은 Voca·대시보드·게임 경로에만 있다**: `useStudent.grantReward(amount, dedupKey)`(useStudent.js:1005, dedupKey 없으면 거부, 원장으로 멱등). 보상이 학습 컴포넌트/훅 층에서 내용 키로 지급되므로 마을·홈·지도 어디서 열어도 중복 지급되지 않는다. 주의: 문법은 현재 아무것도 지급하지 않는다.

### 1.3 플래그·게이트 (C)

- `DEFAULT_FEATURES`(features.js:44), 저장 키 `paulEasyVoca_features`, 저장값이 기본값 위에 병합되므로(features.js:204-215) 기본값이 있는 새 플래그는 이전이 필요 없다.
- `paulTown2_5dEnabled = 플래그 AND qaTestStudent`(App.jsx:335). QA 허용 목록은 `students.id` UUID만(규칙 4).
- 새 플래그 추가 체크리스트: 기본값, 관리자 패널 범주 배열(안 넣으면 토글이 안 보임 — 과거 사고), 선택적 `FEATURE_DETAILS`, 시험 템플릿, App 게이트 + `QA_ONLY_SCREENS` + lazy import.

### 1.4 그림 (D)

- `src/assets/town/kit/manifest.json`은 target을 키로 하는 객체. 합계 95, 빌드 94, 건너뜀 1(`character/paul-portrait`). 그룹: animals 5, backgrounds 2, buildings 41, character 3, nature 2, props 42.
- 지금 키트를 쓰는 곳: `parkArt.js`(공원 미션 6장), `villageArt.js`(마을 지도 청크 전용, glob으로 전부), `townMission.js`(표지판·Cookie).
- **import 제한**: `testTownKitAssets.mjs`는 키트 경로 문자열을 `src/components/grammar/`, `src/utils/grammar/`, `src/components/town/proto2_5d/`, `src/utils/town/proto2_5d/`에서만 허용한다. 옛 `assets/town/env`는 `src/components/town/v2/`에서만 허용(`testTownEnvAssets`). 그래서 새 화면과 모듈은 `proto2_5d/` 두 디렉터리 아래에 둔다.

### 1.5 문법 '정답이 미리 보임' 현재 상태 (E) — 이번 작업에서 고치지 않음

방법: 34단원 전부(`GRAMMAR_UNITS`)와 `buildDeck(unit, [])`에 대한 노드 스크립트. 같은 덱의 **앞쪽 카드**에 화면으로 그려진 글에 정답 문장이 그대로 들어 있으면 "유출".

- 검사한 연습 정답 434개(자체 선택 93, 빈칸 68, 순서 68, 장면 고르기 114, 장면 듣기 21, 장면 읽기 77; 만들기·말하기는 자유 응답이라 제외).
- **앞 카드에 정답이 이미 있는 것 316/434**, 34단원 모두에 1개 이상.
- 출처: 예문 카드가 선택 75·빈칸 52·순서 51·장면 고르기 46·읽기 31·듣기 12. 비교 카드·구조 카드·오류 카드·설명·장면 발견/비교 캡션도 일부.

주요 발견(파일:줄):
1. **위치로 정답이 드러남(설계 아님)**: 자체 선택 93개와 빈칸 68개 전부 정답이 0번 선택지이고 순서를 섞지 않는다(UnitScreen.jsx:20-37, GrammarCourseScreen.jsx:36-52). 첫 버튼이 비장면 문항의 약 89%에서 정답. 장면 카드는 추가 모드에서만 섞는다(SceneCards.jsx:26, sceneMission.js:176). 테스트 id가 데이터 인덱스라 섞으면 e2e도 고쳐야 한다(추측: 스펙에 opt-0=정답 가정이 있을 수 있음, 미확인).
2. 예문 카드(GrammarCourseScreen.jsx:156-157)가 모든 예문을 먼저 보여주고 뒤 문항이 그대로 재사용. 풀이 예시 후 연습은 의도된 교수법이지만 베끼기에 가깝다.
3. 설명 카드(:158-163), 구조·비교 카드(:164-186), 오류 카드(:187-193)도 뒤 정답과 겹침.
4. 장면 발견·비교(SceneCards.jsx:54-84)의 캡션이 뒤 장면 문항 정답과 겹침. 장면 읽기는 그림이 `(j+1) mod n`으로 항상 한 칸씩 밀려 규칙을 알면 짝이 드러난다(SceneCards.jsx:173).
5. 장면 고르기·만들기는 고른 선택지를 문장 틀에 미리 넣어 보여주므로 확인 전에 시험해 볼 수 있다(정답 노출은 아님).
6. 말하기·쓰기: 연습 카드는 모범 문장을 앞에 보이는 것이 설계, 시험(SpeakExam)과 쓰기·만들기는 비교 뒤에만 공개 — 정상.
7. 못 찾은 것: 기본 선택된 보기, CSS로 숨긴 정답 글, 정답을 담은 `data-*`·aria, sr-only 정답.

가장 실행 가능한 순서: (1) 비장면 선택·빈칸 보기를 결정적으로 섞기(시험 갱신 동반), (2) 연습 문장을 예문·캡션과 다르게 하거나 연습 중 예문 숨기기, (3) 읽기의 고정 +1 어긋남 제거. **별도 작업으로 분리**하며 이 PR 범위가 아니다.

## 2. 설계 결정과 이유 (결정)

**기존 2.5D 프로토타입을 고치지 않고, 새 플래그 뒤에 새 화면을 만든다.** 이유: (a) 40×76 격자·2..98 경계·100×190 세계·OBSTACLES/SHOP/MISSION 상수가 모듈 수준이라 큰 다구역 세계를 담으려면 고정된 모듈을 고쳐야 한다. (b) Paul이 상태 + 650 ms 전환으로 움직이고 프레임 루프가 없다. (c) 시나리오 37개와 정적 약 15종이 현재 형태를 고정한다. (d) 상점·배치·벤치 기능이 이력/popstate 처리와 얽혀 있다. (e) 이동마다 컴포넌트 전체가 다시 그려진다.

- 재사용: 카메라 일반 함수, 깊이 도우미, 캐릭터 스프라이트 manifest/계약(수정 없이 import), 키트 그림.
- 새 순수 모듈(`src/utils/town/proto2_5d/world/`): `worldMap.js`, `freeMove.js`, `inputVector.js`, `proximity.js`, `fastTravel.js`. React·이미지·저장소 없음, 결정론적.
- 새 화면(`src/components/town/proto2_5d/world/`): `TownWorld.jsx`, `WorldJoystick.jsx`, `WorldMap.jsx`, `PlaceSheet.jsx`, `worldArt.js`. 키트 import 허용 디렉터리 안.
- 위치는 세션 한정(App 상태). 저장소 키를 만들지 않는다(`townMission.spec`이 저장소 변경 0을 단언, 규칙 9·SQL 불필요).

## 3. 세계·구역·좌표 (사실 — `worldMap.js` 기준)

- 세계 320×240 월드 단위, y는 남쪽으로 증가, Paul 키 12. 오브젝트 앵커 = 바닥 중앙, 발자국 `foot{w,d}`.
- 구역 사각형은 가장자리를 공유하며 겹치지 않는다.

| 구역 | 과목 | 상태 | 사각형 x,y,w,h | 입구 | 바닥 |
|---|---|---|---|---|---|
| 중앙 광장 plaza | Presentation | 준비됨(시작) | 105,60,110,90 | 160,122 | 포장 |
| 공원 park | Grammar | 준비됨 | 0,60,105,120 | 94,112 | 잔디 |
| 학교 school | Writing | 준비됨 | 215,60,105,120 | 236,112 | 마당 |
| 시장 거리 market | Speaking | 준비 중 | 0,0,320,60 | - | 거리 |
| 집과 정원 home | Conversation | 준비 중 | 0,180,105,60 | - | 정원 |
| 연못과 강 pond | Reading | 준비 중 | 105,150,110,90 | - | 물 |
| 언덕과 농장 hill | Voca | 준비 중 | 215,180,105,60 | - | 농장 |

- **시작점** 160,122(분수 남쪽, 길 위). 장소 3곳: 마을회관(142,91), 공원 잔디밭(88,112), 학교(268,95).
- **닫힌 문** 4개(garden-gate 그림, h 9): 시장 160,60 · 연못 192,150 · 집 52,180 · 언덕 268,180. 준비 중 구역 전체가 하나의 충돌 상자.
- **길**: 광장 둘레, 시장·연못 방향 짧은 길, 공원 본길과 두 갈래(트리하우스·정자), 집 방향 길, 학교 길, 언덕 방향 길(모두 폭 5, 크림색, 어떤 충돌 발자국도 가로지르지 않음).
- **크기 클래스(h)**: 큰 건물 30–36, 가게·주택 26–30, 작은 구조물 18–24, 나무 18–22, 표지·가로등·시계 10–14, 벤치·탁자 등 소품 5–9, 화분·꽃 4–6, Cookie 5, Paul 12. 그림자는 한 가지 스타일(폭 0.8배 타원), 모두 y 정렬.
- **걸을 수 있는 면적**: 준비된 구역마다 95~96%.

## 4. 탐험 모드 (사실 — 구현·브라우저 확인된 범위)

- 입력: PC 방향키·WASD, `M`은 지도, `Escape`는 닫기. 모바일은 왼쪽 아래 터치 조이스틱(기반 96 px, 포인터 캡처, `(pointer: coarse)` 또는 폭 900 미만에서 표시). 탭해서 걷기는 새 마을에 없다.
- 이동: 한 번의 rAF 루프, 위치는 ref, 프레임당 한 번만 상태 반영, 탭이 숨겨지거나 시트·지도가 열리면 멈춤. 충돌은 축 분리 슬라이드, 하위 단계 ≤ 반지름이라 2000회 무작위 이동에서 통과(터널링) 0.
- 장소 근처 안내: `'<장소> 미션 보기'` 버튼. 들어갈 때 7, 나갈 때 9 단위 히스테리시스.
- 학습 상태 유지: 위치·방문은 App 세션 상태(`townWorldSession`)에 보관, 미션에서 돌아오면 저장된 위치 1 단위 이내에 복귀.
- 준비 중 구역: 걸어서 들어갈 수 없음(닫힌 문 + 구역 전체 충돌).

## 5. 지도 모드 (사실)

- 전체 지도 버튼(`tw-map-open`)이 7개 구역 대화상자를 연다. 준비된 3곳은 선택 가능, 4곳은 '준비 중'으로 비활성.
- 구역·장소를 고르면 Paul이 그 입구로 이동하고 지도가 닫힌다. 장소 선택 시 건물 옆에 서서 미션 버튼이 바로 보인다.
- 현재 구역에 '여기' 표시. 걷기와 지도는 같은 미션 진입점과 같은 학습 기록을 쓴다.

## 6. 학습 연동·기록·보상 (사실)

| 장소 | 구역 | 미션 | 연결 |
|---|---|---|---|
| 공원 잔디밭(표지판) | park | 문법 4단원 g-easy-05, g-easy-04, g-int-04, g-mid-05 | 기존 문법 진입 `returnTo:'world'` |
| 학교 | school | Writing | 기존 쓰기 진입(과정→레벨→단원 선택기, intent writing) |
| 마을회관 | plaza | Presentation | 기존 단원 선택기를 발표 과정에 미리 선택 |

- 기존 미션·단원 id를 그대로 사용. 새 저장소 키 없음.
- 홈 복귀 하드코딩 7곳(말하기 뒤로, 쓰기 뒤로, 쓰기 홈, 단원 로드 실패, 문법 로드 실패, 문법 뒤로, `UnitScreen` 뒤로)을 `learningHome()` 도우미 하나로 교체. 마을 방문 중에는 'townWorld', 아니면 기존 'home'. 플래그가 꺼져 있으면 동작이 이전과 같다.
- **완료 표시**: 문법 미션만 '완료'(기존 완료 단원 상태 기준). 쓰기·발표는 완료 신호가 없어 '다녀옴'으로 표시(정직한 라벨). 둘 다 세션 한정이라 새로고침하면 사라진다.
- **보상**: 월드 파일에 보상 호출 없음(시험이 `reward`·`rewardEngine`·`grantReward` import 부재를 고정). Grammar·Writing·Speaking 화면에도 보상 호출 없음. 보상은 Voca 경로의 dedupKey 원장뿐이라 걷기·지도·홈 어느 경로로 열어도 중복 지급이 불가능한 구조다. (언덕과 농장=Voca를 연결할 때는 §12에서 이중 지급을 따로 확인한다.)

## 7. 7개 구역 이미지 배치 목록

범례. **상태**: 배치됨(화면에 그려짐) / 계획(좌표만 `worldMap.js`에 있고 화면은 그리지 않음). **역할**: 학습 장소 / 장식 / 경계(막는 선) / 통과 가능 장식(충돌 없음). 크기는 h(월드 단위, 너비는 파일 가로세로비). 같은 그림이 여러 개 놓이면 개수를 적었다. 그림은 kit 경로 `src/assets/town/kit/<경로>.webp`(1x, @2x).

### 7.1 중앙 광장 plaza — 배치된 오브젝트 19개

| 그림 | 종류·크기(h) | 상태 | 역할 |
|---|---|---|---|
| buildings/town-hall | 큰 건물 32 | 배치됨 | 학습 장소(마을회관, Presentation) |
| buildings/clock-tower | 큰 건물 30 | 배치됨 | 장식(랜드마크) |
| props/fountain | 구조물 18 | 배치됨 | 장식(광장 중심) |
| buildings/castle-gate | 구조물 24 | 배치됨 | 경계(남쪽 마을 입구) |
| props/post-box | 표지류 10 | 배치됨 | 장식 |
| props/phone-box | 표지류 12 | 배치됨 | 장식 |
| props/sundial | 소품 8 | 배치됨 | 장식 |
| props/street-clock | 표지류 13 | 배치됨 | 장식 |
| props/wall-fountain | 표지류 12 | 배치됨 | 장식 |
| props/street-lamp ×4 | 표지류 14 | 배치됨 | 장식(네 모서리) |
| props/bollard ×6 | 소품 6 | 배치됨 | 경계(남쪽 가장자리 말뚝) |
| buildings/museum | 큰 건물 30–36 | 계획 | 광장이 붐벼 이번에는 놓지 않음 |
| buildings/fire-station | 큰 건물 30–36 | 계획 | 광장이 붐벼 이번에는 놓지 않음 |

### 7.2 공원 park — 배치된 오브젝트 30개

| 그림 | 종류·크기(h) | 상태 | 역할 |
|---|---|---|---|
| props/signpost | 표지류 12 | 배치됨 | 학습 장소(공원 잔디밭, Grammar) |
| props/rose-arch | 구조물 18 | 배치됨 | 통과 가능 장식(광장 쪽 공원 입구) |
| props/dog-house | 소품 9 | 배치됨 | 장식(Cookie 집) |
| character/cookie-sit | Cookie 5 | 배치됨 | 장식(개집 옆, 충돌 없음) |
| buildings/treehouse | 구조물 24 | 배치됨 | 장식(랜드마크) |
| buildings/gazebo | 구조물 20 | 배치됨 | 장식 |
| buildings/reading-pavilion | 구조물 20 | 배치됨 | 장식(Reading 후보 장소 — 지금은 장식) |
| nature/tree ×6 | 나무 20 | 배치됨 | 장식·경계 |
| nature/hedge ×3 | 소품 8 | 배치됨 | 경계(광장 쪽 울타리) |
| props/bench ×2 | 소품 7 | 배치됨 | 장식 |
| props/picnic-table | 소품 8 | 배치됨 | 장식 |
| props/swing | 표지류 14 | 배치됨 | 장식 |
| props/tent | 소품 9 | 배치됨 | 장식 |
| props/balloons | 표지류 11 | 배치됨 | 장식 |
| props/bird-bath | 소품 7 | 배치됨 | 장식 |
| props/birdhouse | 표지류 10 | 배치됨 | 장식 |
| props/flower-urn ×2 | 화분 6 | 배치됨 | 장식(표지판 옆) |
| props/sunflower-pot ×3 | 화분 6 | 배치됨 | 장식 |
| props/stepping-stones | 화분급 5 | 배치됨 | 통과 가능 장식 |
| character/cookie-stand | Cookie 5 | 계획 | 구역 배정만(이번에는 놓지 않음) |

### 7.3 학교 school — 배치된 오브젝트 27개

| 그림 | 종류·크기(h) | 상태 | 역할 |
|---|---|---|---|
| buildings/school | 큰 건물 34 | 배치됨 | 학습 장소(학교, Writing) |
| buildings/bus-stop | 구조물 20 | 배치됨 | 장식 |
| props/bike-rack | 소품 6 | 배치됨 | 장식 |
| props/garden-gate | 소품 9 | 배치됨 | 통과 가능 장식(마당 서쪽 문) |
| props/litter-bin | 소품 7 | 배치됨 | 장식 |
| props/bench | 소품 7 | 배치됨 | 장식 |
| props/street-lamp | 표지류 14 | 배치됨 | 장식 |
| nature/tree ×3 | 나무 20 | 배치됨 | 장식 |
| props/fence ×17 | 소품 6 | 배치됨 | 경계(마당 서쪽 8 + 남쪽 9, 문·허브 길 자리는 틈) |

### 7.4 시장 거리 market (Speaking) — 계획, 화면에는 닫힌 문만

| 그림 | 종류·크기(h) | 상태 | 역할 |
|---|---|---|---|
| buildings/cafe, bakery, fruit-shop, bookshop, greengrocer, flower-shop, toy-shop, pet-shop, music-shop, art-shop, bike-shop | 가게 27 | 계획(북쪽 줄 11개) | 학습 장소 후보(말하기·주문 장면) |
| buildings/ice-cream-stall, clinic, bell-shop, tailor-shop, china-shop, gift-shop, potion-shop, aquarium-shop | 가게 27 | 계획(남쪽 줄 4+4개) | 장식 또는 장소 후보 |
| props/flower-cart | 소품 9 | 계획 | 장식 |
| props/gift-box | 화분급 6 | 계획 | 장식 |
| props/recycling-bin | 소품 8 | 계획 | 장식 |
| props/garden-gate (문) | 소품 9 | 배치됨(닫힌 문) | 경계 |

### 7.5 집과 정원 home (Conversation) — 계획

| 그림 | 종류·크기(h) | 상태 | 역할 |
|---|---|---|---|
| buildings/my-cottage, cottage-large, cottage-clock | 주택 26 | 계획 | 학습 장소 후보(회화) |
| buildings/greenhouse | 주택 26 | 계획 | 장식 |
| props/flower-wheelbarrow, beehive, water-barrel, compost-box, tool-rack | 소품 6 | 계획 | 정원 장식 |
| props/watering-can, vegetable-bed, strawberry-pot | 화분 6 | 계획 | 정원 장식 |
| props/garden-gate (문) | 소품 9 | 배치됨(닫힌 문) | 경계 |

### 7.6 연못과 강 pond (Reading) — 계획

| 그림 | 종류·크기(h) | 상태 | 역할 |
|---|---|---|---|
| buildings/ticket-booth | 구조물 20 | 계획 | 학습 장소 후보 |
| buildings/train-engine | 구조물 20 | 계획 | 장식 |
| props/stone-bridge | 소품 8 | 계획 | 통과 가능(다리, 물 위 걷는 띠 필요) |
| props/stone-steps | 화분급 6 | 계획 | 장식 |
| props/sailboat | 구조물 18 | 계획 | 장식(물) |
| buildings/boathouse | 주택급 26 | 계획 | 장식 |
| buildings/lighthouse | 주택급 28 | 계획 | 랜드마크 |
| props/garden-gate (문) | 소품 9 | 배치됨(닫힌 문) | 경계 |

### 7.7 언덕과 농장 hill (Voca) — 계획

| 그림 | 종류·크기(h) | 상태 | 역할 |
|---|---|---|---|
| buildings/windmill | 주택급 26 | 계획 | 학습 장소 후보(Voca) |
| buildings/barn | 주택급 26 | 계획 | 장식 |
| buildings/stable | 주택급 26 | 계획 | 장식 |
| buildings/observatory | 주택급 26 | 계획 | 랜드마크 |
| props/stile | 소품 5 | 계획 | 경계(울타리 디딤대) |
| props/garden-gate (문) | 소품 9 | 배치됨(닫힌 문) | 경계 |

집계(`worldMap.js` 실제 데이터): 배치된 오브젝트 광장 19·공원 30·학교 27(서로 다른 그림 36장, 닫힌 문 그림 포함 여부는 `activeArts()`). 구역 배정(`ZONE_PLAN`)은 광장 13·공원 20·학교 6·시장 22·집 12·연못 7·언덕 5 = 85개 target. 제외 10개와 합쳐 manifest 95개를 정확히 한 번씩 덮는다(시험이 확인).

## 8. 제외·보류 그림 (사실 — `EXCLUDED_ART`)

| 그림 | 이유 |
|---|---|
| backgrounds/park-backdrop | 원근 배경 — 수업 화면 전용(위에서 본 마을과 시점이 다름) |
| backgrounds/plaza-topdown | 바닥 그림과 중복, 시점 다름 |
| props/treasure-chest | 보상 연출 후보 — 이번 범위 아님(보상 규칙 변경 없음) |
| props/star-trophy | 보상 연출 후보 — 이번 범위 아님(보상 규칙 변경 없음) |
| character/paul-portrait | 운영자 결정 대기(인물 초상, manifest에서도 건너뜀) |
| animals/squirrel, rabbit, fox, duck, owl | 운영자 결정 대기(화풍) |

- 운영자가 말한 "쓸 수 있는 그림 84장"과 "결정 대기 3장"은 데이터와 한 칸씩 어긋난다: `ZONE_PLAN`은 85개, 제외는 10개(결정 대기 6 = 초상 1 + 동물 5, 보상 후보 2, 시점·중복 2). 84/3으로 어떤 항목을 세었는지는 확인하지 못했다. 운영자 확인 필요(§13).
- 바닥 그림이 키트에 없다. 바닥은 단색 + 그린 길이며 실제 바닥 그림은 없다.

## 9. 검증

### 9.1 정적 (실행됨 — 최종 빌드)

`testTownWorld` 168/168(도달성 flood fill, 2000회 이동 터널링 없음, 크기 클래스, 키트 target 전부를 `ZONE_PLAN ∪ EXCLUDED_ART`가 덮음), `testTownWorldScreen` 58/58, `testTownWorldWiring`, `testBundleBudget`, `testQaGate` 17/0, `testLazyChunkGuards`, `testGrammarCourses`, `testGrammarVillage`, `testGrammarVillageScreen`, `testStudentPathContracts`, `testPaulSpriteAssets`, `testTownEnvAssets`, `testTownKitAssets`, `testRegistryCoverage`, `testPilotUnit` 전부 PASS. 더미 env 빌드 경고 0.

번들: 월드 청크 36.8 KB raw / 12.7 KB gzip, 메인 청크 130.25 KB gzip. 고정 핀 조정: `QA_ONLY_SCREENS` 목록, 문법 종료 도우미, Paul 스프라이트 청크 허용 목록에 월드 청크 추가, 총 코드 예산 2.0 → 2.1 MB(실측 2.010 MB), 환경 키 누수 검사가 키트의 'sunflower-pot'을 환경 키 'flower-pot'으로 보지 않게 수정.

### 9.2 브라우저 (실제 실행 — Playwright headless, 더미 env 빌드의 `vite preview`, 스펙 하나씩, 여유 RAM 1.8~2.6 GB)

- **`[town-world]` 71/71**. 1차는 70/71이었고 스펙 허용 오차 1건(조이스틱 손잡이 중심 ±3 px, 2 px 테두리 때문)을 고친 뒤 통과. 제품 변경 없음. 확인 범위: PC 1280×800 방향키·WASD 이동, 충돌(위치가 고체 안에 들어가지 않음), 공원 표지판까지 걷기 → 미션 버튼 → 시트(미션 4개), 지도 빠른 이동(학교·광장), 문법 덱 왕복 후 저장 위치 1 단위 이내 복귀, g-easy-05 완료 후 완료 칩, 쓰기·발표 진입에서 마을 복귀, 모바일 360×640 조이스틱 끌기·놓기, HUD 44 px 이상, 페이지 가로 넘침 없음, 닫힌 문이 막음, 준비 중 구역은 걸어서도 지도로도 진입 불가, 잘못된 쓰기·저장소 변경·콘솔 오류 없음.
- **같은 최종 빌드의 회귀**: `[town-mission]` 23/23, `[grammar-village]` 53/53(+소프트 skip 1), `[grammar-scene]` 205/205, `[grammar-scenes]` 46/46, `[grammar]` 769/769(+skip 1), `[student-home]` 242/242(+skip 1), `[writing]` 83/83, `[student]`(Voca) 34/34, `[speaking]` 608/608, `[unit]` 141/141, `[speaking-exam]` 216/216, `[hats]` 67/67.
- **`[town-proto2.5d]`(기존 2.5D, 긴 스펙): 문서 작성 시점에 실행 중이라 결과 미확정.** 이전 빌드의 실행은 1524/1529였고 실패 5건은 전부 메모리에 민감한 S37이었다. 최종 빌드 결과는 확인되기 전까지 통과로 쓰지 않는다.
- 리드가 직접 본 화면: 광장 1280×800, 공원·학교·지도·장소 시트 360×640.

### 9.3 실행하지 않았거나 확인 못 한 것

실기기 터치(Playwright 마우스/터치 에뮬레이션만), 360 px·1280 px 외 뷰포트, 장시간 이동 시 성능, 화면 읽기 프로그램, 이미지 지연 로딩(준비된 3구역만 참조하므로 해당 없음).

## 10. 문법 '정답 미리 보임' 현재 상태 (별도 작업)

§1.5 참조. 상태: **발견·측정 완료, 수정하지 않음, 별도 작업으로 분리**. 핵심 수치: 연습 정답 434개 중 316개가 앞 카드에 그대로 있음, 자체 선택·빈칸 161개는 정답이 항상 0번 선택지.

## 11. 미완료·한계 (사실)

- 7개 구역 중 3개만 놀 수 있다.
- 바닥은 단색 + 그린 길(키트에 바닥 그림 없음).
- Paul 정지 프레임은 앞모습만 있다.
- NPC 없음. Cookie는 정지 상태.
- 새 마을에 탭해서 걷기 없음.
- Speaking·Voca·Conversation·Reading 구역은 아직 연결되지 않음.
- 파닉스·중등·뉴스 단계는 기존 선택기 안에서만 열린다.
- 저장 없음: 마을 위치와 '완료/다녀옴'은 새로고침하면 사라진다.
- 실기기 터치 미확인. 수업 화면 안의 그림은 이번에 바꾸지 않았다. 교사 검수 0/34.

## 12. 나머지 4구역 확장 계획 (**계획이며 구현되지 않음**)

구역당 같은 순서: 오브젝트 배치 → 발자국 → 입구 → `status:'ready'` → e2e 경로. 한 번에 한 구역만 열고 브라우저를 한 번씩 돌린다.

| 구역 | 과목 | 계획 | 확인할 것 |
|---|---|---|---|
| 시장 거리 | Speaking | 가게 19개를 광장 북쪽 두 줄로. 미션 = 기존 Speaking 진입 + 가게 테마 문법 단원 | Speaking 뒤로가기도 `learningHome()` 경유 |
| 집과 정원 | Conversation | 주택 3 + 온실 + 정원 소품. Conversation 과정 선택기 | 과정 미리 선택 방식은 발표와 동일 |
| 연못과 강 | Reading | 매표소·기관차·다리·배·등대. Reading 과정 | 물 바닥과 다리 보행 띠 필요 |
| 언덕과 농장 | Voca | 풍차·헛간·마구간·천문대. 기존 Voca 학습 | **Voca는 dedupKey 보상이 있다 — 복귀 시 이중 지급이 없는지 확인** |

## 13. 운영자 결정 필요

1. 이 브랜치를 별도 Draft PR로 올릴지, PR #62에 합칠지.
2. 마을 위치·완료 표시의 영구 저장(저장소 또는 DB — 준비된 SQL 없음).
3. 동물 그림의 화풍.
4. 보류 그림(treasure-chest, star-trophy, paul-portrait).
5. 바닥·길 그림(그려진 바닥) 제작.
6. 새 마을이 기존 2.5D 프로토타입과 평면 문법 마을 지도를 대체해 기본 입구가 될지.
7. 나머지 4구역을 여는 순서.
8. 문법 정답 미리 보임 수정 작업의 착수 여부.
9. "쓸 수 있는 그림 84장 / 결정 대기 3장"과 데이터(85 / 6)의 차이 확인.

**테스터 경로**: QA 테스트 계정 → 관리자 기능 패널(애착 범주)에서 `studentHomeMenu` + `paulTownWorld` 켬 → 홈 → 마을 버튼 → 광장 → 방향키/WASD 또는 조이스틱 → '지도'로 빠른 이동.
