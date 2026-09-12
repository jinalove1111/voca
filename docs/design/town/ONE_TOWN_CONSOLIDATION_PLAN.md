# Paul Town 통합 계획 — 궁극적으로 "하나의 Paul Town"

> 상태: 설계 문서(디자인 전용, 코드 변경 없음). 135차 세션(`handoff.md`
> 2026-09-13, 브랜치 `feat/paul-town-v2a-visual-shell-2026-09-13`)까지의
> 실제 코드 상태를 근거로 작성했다. 이 문서 자체는 어떤 코드/SQL/플래그
> 기본값도 바꾸지 않는다.

## 0. 목표 한 줄 요약

지금 학생 화면에는 사실상 **세 개의 마을**이 공존한다 — (1) 레거시
`PaulTown.jsx`(정원 4x4 + 폴의 집 + 건물 카드, 오늘 기본 ON), (2) Town
V1(`TownScreen.jsx`, 별 상점/배치/보관함, 기본 OFF + Pilot A 허용목록),
(3) Town V2-A(`TownScreenV2.jsx`, V1과 같은 데이터를 스토리북 씬으로
렌더, 기본 OFF). 목표는 이 셋을 **하나의 Paul Town 화면**으로 수렴시키는
것이다: Stars/Level(V1/V2 경제)이 "무엇을 사고 잠금해제할지"를 결정하고,
학습(gardenPoints)은 "이미 가진 마을을 얼마나 생기 있게 보이게 할지"를
결정한다. **화폐를 두 개로 나누지 않는다** — gardenPoints는 새 화폐가
아니라 기존 Paul Dollar/별 경제 위에 얹는 순수 시각 파생값이다.

## 1. 현재 상태 지도

### 1.1 레거시(오늘 기본 ON, `PaulTown.jsx`)

| 요소 | 소스 | 판정 축 | 기본 상태 |
|---|---|---|---|
| 소급 환영 | `paulTown.js retroWelcome` | `gardenPoints` | `paulTownGarden:true` |
| 마을 성장 단계(정원/집/다리/도서관/마을/왕국) | `worldProgress.js WORLD_STAGES`(0/30/60/100/150/250) | `gardenPoints` | 항상 계산, `paulTownGarden` 켜야 카드 노출 |
| 정원 4x4(16칸, `PLOT_COUNT`) | `worldProgress.js gardenPlots`(2026-08-28 9칸→16칸, 3점→2점 재조정) | `gardenPoints` | `paulTownGarden:true` |
| 폴의 집 모자걸이 | `hatInventory`/`equippedHatId`(영속 사실) | 모자 규칙(`hatSystem.js`, 미열람이나 `paulTown.js` 참고상 존재) | 항상 ON |
| 방 소품(화분/그림/책/시계/트로피/곰인형) | `paulTown.js HOME_DECO_ITEMS` | `clearedCount`/`masteredCount`/`studiedDayCount`/`totalStarsEarned` | 항상 ON |
| 건물(박물관≥30/도서관≥100/시계탑≥150) → `wordMuseum`/`bookshelf`/`timeMachine` | `paulTown.js TOWN_PLACES`/`townPlacesState` | `gardenPoints` | `paulTownBuildings:true`(도서관은 `attachmentBookshelf:true`도 필요) |
| 오늘의 발견 | `paulTown.js pickTodaysDiscovery`(Dashboard 카드) | dayKey 해시 + 실데이터 | Dashboard, Town 화면 밖 |
| 홈 밴드("🏡 Paul Town 정원") | `Dashboard.jsx` 879행 이하, `gardenBandSummary` | `gardenPoints`(filledPlots) | `paulTownHomeBand:true` |
| 별 상점 진입 카드("내 마을 — Welcome to Paul Town") | `PaulTown.jsx` `onGoTown` 블록 | `townV1Enabled` | V1 자격 있을 때만 |

### 1.2 Town V1/V2(오늘 기본 OFF)

| 요소 | 소스 | 판정 축 |
|---|---|---|
| 레벨(Lv.1~10) | `townLevel.js TOWN_LEVELS`(0/20/50/100/200/350/550/800/1100/1500) | `starsEarned`(누적 별, 학업 보상과 같은 축) |
| Paul Dollar 잔액/상점/구매 | `useTownShop.js`(미열람, `TownScreen.jsx`가 소비) | 서버 원장(`townShop.state`) |
| 인벤토리/배치(8x6, `TOWN_GRID`) | `townLayout.js`(placeItem/moveItem/storeItem/mergeTownLayout) | `townPlacements`/`townRemovedIds`(영속) |
| 마을 지도(레인/광장/외곽 존) | V2-A `townScene.js ZONES`(홈/레인/광장/외곽, `TOWN_GRID.rows` 파생) | 좌표만, V1과 동일 8x6 |
| 안개/다음 잠금해제 | V2-A `townScene.js fogState`/`nearGoal` | `level`/`starsEarned` + 카탈로그 `minLevel` |
| 정원 생기(창문 불빛/담쟁이/새) | V2-A `townScene.js gardenRichness`(임계 0/10/30/60/100) | `gardenPoints` — **레거시 WORLD_STAGES(0/30/60/100/150/250)와 임계값이 다르다(아래 5절 리스크)** |

## 2. 기능별 판정: KEEP / MERGE INTO V2 / RETIRE / DEFER

각 행: 결정 · 근거 · 대상 단계(V2-C/V2-D) · 손대는 데이터(경제 원칙상
전부 "없음"이어야 한다) · 롤백(플래그).

| # | 레거시 기능 | 결정 | 근거 | 대상 단계 | 손대는 데이터 | 롤백 |
|---|---|---|---|---|---|---|
| 1 | `gardenPoints` 자체(학습 서로 다른 단어 수 합집합) | **KEEP** | 이미 V2-A `gardenRichness`가 같은 값을 소비 중(`TownScreenV2.jsx` `gardenPoints={attachment.stats.gardenPoints}`) — 축 자체는 통합의 접착제 | 해당 없음(이미 공유) | 없음 | 해당 없음 |
| 2 | 정원 4x4(16칸, seed→sprout→flower→tree) | **MERGE INTO V2** | V2-A는 이미 "정원 생기" 개념(`gardenRichness`)이 있지만 16칸 격자 시각 자체는 아직 없다 — 별도 화면이 아니라 마을 씬 안 홈 근처 화단으로 흡수 | V2-C | 없음(파생만) | `paulTownV2` |
| 3 | `WORLD_STAGES`(집/다리/도서관/마을/왕국, 0/30/60/100/150/250) | **RETIRE**(내비게이션 단계로는) / **MERGE**(임계 감각은 V2 안개·다음 목표 문구로) | V2의 "무엇이 열리는지"는 이미 레벨(별) 축이 전담 — 같은 정보를 gardenPoints 축으로 또 보여주면 "무엇이 나를 성장시키는지" 이중 서사가 된다. 다만 "정원이 이만큼 컸다"는 감성은 gardenRichness로 남긴다 | V2-C | 없음 | `paulTownV2`(레거시는 `paulTownGarden`으로 계속 살아있어 안전망) |
| 4 | 소급 환영(`retroWelcome`) | **MERGE INTO V2** | 첫 진입 시 "네가 배운 단어 N개로 마을이 이만큼 자랐어" 서사는 V2 `PaulGuide`의 `welcome`/`earn_hint` 가이드에 gardenPoints 문구 한 줄만 추가하면 흡수 가능(구조 변경 없음) | V2-C | 없음 | `paulTownV2` |
| 5 | 폴의 집 모자걸이(`hatInventory`/`equippedHatId`) | **KEEP** | 학생이 이미 획득한 append-only 자산 — 없앨 이유가 없다. V2 HUD/표지판에 노출(4절 참고) | V2-C(표시 위치만 이동) | 없음(기존 진실 원천 그대로) | `paulTownV2` |
| 6 | 방 소품(`HOME_DECO_ITEMS`, 화분/그림/책/시계/트로피/곰인형) | **DEFER** | V2 My House는 아직 실내 뷰가 없다(외경만) — 실내 소품 전시는 My House 탭/뷰가 생긴 뒤에나 의미가 있다 | V2-D 이후(미정) | 없음 | `paulTownV2` |
| 7 | 건물(박물관/도서관/시계탑) → 학습 보조 화면 | **MERGE INTO V2** | V2 카탈로그의 `book-shop`/`english-school`/`clock-tower`가 이미 이름·가격·레벨을 갖고 있다(`townCatalog.js`) — 탭하면 기존 `wordMuseum`/`bookshelf`/`timeMachine` 화면으로 이동하도록 연결(3절 매핑표) | V2-C | 없음(라우팅만) | `paulTownV2` |
| 8 | 오늘의 발견(`pickTodaysDiscovery`, Dashboard 카드) | **MERGE INTO V2**(건물 탭 발견 카드로) | 132차 Agent B가 이미 유사 결정론 로직(`townDiscovery.js`, PR #44, 미merge)을 만들어 뒀다 — 재구현이 아니라 재사용 대상(규칙 3) | V2-C | 없음 | `paulTownV2` |
| 9 | 홈 밴드("🏡 Paul Town 정원") | **KEEP**(라우팅 대상만 전환) | 학생이 Town에 들어오는 유일한 진입점(`onGo('paulTown')`, `Dashboard.jsx` 903행) — 통합 후에는 이 밴드가 곧장 하나의 Town으로 안내 | V2-C(3절 라우팅 계획) | 없음 | 해당 없음(문구/타깃만 변경, 플래그로 게이트) |
| 10 | 별 상점 V1 진입 카드("내 마을 — Welcome to Paul Town") | **RETIRE**(레거시 PaulTown 안 카드로서는) | 통합 후 레거시 `PaulTown.jsx`가 사라지면 이 카드도 함께 제거 — Town 자체가 유일한 진입점이 되므로 "마을 안에 마을 가는 카드"가 불필요해짐 | V2-D | 없음 | `paulTownV1`/`paulTownV2` |
| 11 | 마일스톤(`milestones`, cleared-10/50/100/200 등) | **KEEP** | 애착 시스템 공유 사실(영속 이벤트 로그) — Town 통합과 무관하게 유지, HUD/표지판에 배지로만 노출 검토 | V2-C(표시만) | 없음 | `paulTownV2` |
| 12 | 별 상점 V1 탭 UI(`TownScreen.jsx`, 탭 3개) | **RETIRE**(V2 채택 확정 시) | V2 바텀시트 방식(`TownSheet.jsx`)이 이미 V1의 상점/보관함 패널을 그대로 재사용하며 대체 가능 — 탭 UI 자체만 사라짐, 데이터/로직 재사용 | V2-D | 없음 | `paulTownV2` |

## 3. 라우팅 계획

**현재**: `Dashboard` → `onGo('paulTown')` → `PaulTown.jsx`(레거시, 항상
접근 가능) → (`onGoTown` 있으면) → `screen='town'` → `townV2Active`
여부로 `TownScreenV2` 또는 `TownScreen` 중 하나.

**전환 목표(단계적)**:
1. **1단계(V2-C 진행 중)**: 위 흐름 유지. 파일럿/기기 플래그로만 V2 확인.
2. **2단계(V2-D, 통합 결정 확정 후)**: `Dashboard`의 홈 밴드/구경가기가
   `townV1Enabled`(기존 조건 그대로, 이름 변경 없음)일 때 곧장
   `screen='town'`(하나의 Town)으로 가고, 자격이 없는 학생만 레거시
   `PaulTown.jsx`로 간다 — 즉 **레거시는 사라지지 않고 "Town 자격이 아직
   없는 학생을 위한 폴백"으로 격하**된다. 코드 변경은 `Dashboard.jsx`의
   `onGo` 타깃 분기 하나뿐, 새 데이터 없음.
3. **3단계(전 학생 Town 자격 부여 후)**: `PaulTown.jsx`/`worldProgress.js`
   내비게이션 부분(건물 카드/`TOWN_PLACES`)은 코드에서 제거하되,
   `gardenPoints`/`retroWelcome` 등 순수 파생 함수는 Dashboard 홈 밴드가
   계속 참조할 수 있으므로 **파일 삭제가 아니라 사용처 정리**로 접근한다
   (`worldProgress.js`/`paulTown.js`를 통째로 지우면 Dashboard 홈 밴드가
   깨진다 — 실제 삭제 여부는 implementer가 사용처 전수 확인 후 결정).

라우팅 전환의 매 단계는 플래그(`paulTownV1`/`paulTownV2`) 뒤에서만
일어나고, 되돌리는 방법은 항상 플래그 OFF다(코드 되돌리기 불필요).

## 4. 레거시 장소 → V2 건물 매핑

| 레거시 장소(`TOWN_PLACES`) | 임계(gardenPoints) | 이동 화면 | V2 카탈로그 대응 | V2 임계(레벨) | 탭 시 동작(통합 후) |
|---|---|---|---|---|---|
| 🏛️ 박물관 | ≥30 | `wordMuseum` | `book-shop`(📚, minLevel 3) | Lv.3(별 50) | 건물 탭 → 기존 `wordMuseum` 화면 그대로 오픈(라우팅만, 화면 자체는 무변경) |
| 📚 도서관 | ≥100 | `bookshelf` | `english-school`(🏫, minLevel 7) 또는 `book-shop` 중 운영자 확정 필요 | Lv.7(별 550) | 동일 |
| 🕰️ 시계탑 | ≥150 | `timeMachine` | `clock-tower`(🕰️, minLevel 8) | Lv.8(별 800) | 동일 |

**주의(리스크)**: 레거시는 "학습량(gardenPoints)"으로 건물이 열리고, V2
카탈로그는 "구매(Paul Dollar) + 레벨(별)"로 건물이 열린다. 통합 시
"박물관에 가려면 공부해야 하는가, 사야 하는가"라는 서사 충돌이 생긴다 —
**운영자 결정 필요 사항**으로 5절에 남긴다. 이번 문서는 매핑(이름/화면
연결)만 제안하고 잠금 조건 통합은 판단하지 않는다.

## 5. 모자/마일스톤 처리

- **모자(`hatInventory`/`equippedHatId`)**: 회수 없는 append-only 자산.
  통합 후에도 학생이 이미 얻은 모자는 그대로 남고, 표시 위치만 레거시
  "폴의 집 모자걸이" 카드에서 V2 HUD(`TownHud.jsx`) 또는 나무 표지판
  영역으로 옮기는 것을 V2-C 범위로 제안(6절, 시안 확정은 implementer).
- **마일스톤(`milestones`)**: 타임스탬프 이벤트 로그, 판정 로직
  변경 없음(`useAttachment.js` `detectNewMilestones`). Town 화면에는
  배지/HUD 요약으로만 노출 검토 — 새 저장 필드 없음.
- 두 자산 모두 **판정 로직 자체는 이 통합 계획의 범위 밖**이다
  (`hatSystem.js`/`milestones.js` 무변경 전제).

## 6. 경제 무변경 원칙(재확인)

이 문서가 제안하는 어떤 항목도 다음을 바꾸지 않는다:
- `townShop`/`townLevel`/`townCatalog`의 가격·레벨 임계·RPC(`useTownShop.js`,
  `api/grant-xp.js` 등) — 전부 미열람이지만 135차 handoff가 "RPC/가격/
  카탈로그/원장 무변경"을 명시.
- Paul Dollar/별 원장, `star_purchases`, `purchase_town_item` 등 서버
  권위 테이블.
- 새 화폐 도입 — gardenPoints는 화폐가 아니라 표시 파생값(`gardenPoints`는
  `Set.size`, 저장 0)이다.

## 7. 리스크 목록

1. **트리플 패스 동시 존재 기간의 유지보수 비용**: 레거시(`PaulTown.jsx`)
   + V1(`TownScreen.jsx`) + V2(`TownScreenV2.jsx`)가 한동안 공존한다.
   세 곳 모두 `mergeCatalog`/`visiblePlacements`/`townShop.state` 등
   같은 데이터를 각자 읽으므로, 한쪽만 고치고 다른 쪽을 놓치는 회귀
   가능성이 있다(V1→V2 복제 시 135차가 이미 이 패턴 — 헤더 주석에
   "V1의 데이터 배선을 그대로 복제" 명시).
2. **플래그 매트릭스 조합 폭발**: `paulTownV1`(기기) × `isPilotTownStudent`
   (허용목록) × `paulTownV2`(기기) × `paulTownGarden`/`paulTownBuildings`
   (레거시, 기본 ON) — 조합에 따라 학생이 보는 화면이 4갈래 이상 갈릴 수
   있다. 통합 이전에는 QA가 조합별 회귀를 각각 확인해야 한다(현재
   135차 e2e는 `townV1Enabled` OFF/ON, `paulTownV2` OFF/ON, Pilot A
   여부까지는 커버하나 레거시 `paulTownGarden`/`paulTownBuildings`를
   OFF로 끈 조합은 별도 확인 필요).
3. **허용목록(Pilot A) 관리 부채**: `src/config/pilotTown.js`의 5명
   UUID 허용목록이 코드에 하드코딩돼 있다(134차) — 통합이 끝나기 전까지
   이 목록을 계속 손으로 관리해야 하며, 통합 후에는 "전 학생 허용"으로
   전환하면서 허용목록 코드 자체를 제거하는 마무리 작업이 필요하다.
4. **임계값 축 불일치**(4절 리스크 재확인): 레거시 건물 임계
   (gardenPoints 30/100/150)와 V2 카탈로그 임계(레벨 3/7/8, 별 축)가
   서로 다른 성장 축을 쓴다 — 통합 시 "왜 어떤 건 공부로 열리고 어떤 건
   사야 여는지" 학생 경험 일관성 문제는 이 문서가 해결하지 않고
   운영자 결정 필요 사항으로 남긴다.
5. **PR #44 처분 미결**: 135차 시점 여전히 OPEN이며 Registry 미등록
   스크립트로 Release Gate FAIL 상태(`handoff.md` 135차 1절). V2-C가
   `townDiscovery.js`를 재사용하려면 이 PR을 닫거나 rebase하는 선행
   작업이 필요하다.
6. **My House 실내 뷰 부재**: 방 소품(6절 DEFER 대상)을 옮길 화면이
   아직 없어, 그 결정을 미루는 동안 학생이 "예전엔 있던 소품이 안
   보인다"고 느낄 여지가 있다 — 소품 데이터 자체는 삭제하지 않으므로
   실 손실은 없지만, 노출 여부는 V2-D 결정 전까지 레거시 화면에만
   남는다.

## 8. 요약

통합의 핵심은 **레거시를 지우는 것이 아니라 두 축(별/레벨=언락,
gardenPoints=생기)을 하나의 화면에 합치는 것**이다. 표에서 RETIRE로
표시한 항목도 즉시 삭제가 아니라 "V2가 같은 역할을 흡수한 뒤에만"
제거하도록 순서를 지킨다(플래그 뒤 단계적 전환, 규칙 1/9). 다음 문서
(`V2B_V2C_ROADMAP.md`)는 이 계획의 V2-C 항목들을 실행 가능한 작업
단위로 쪼갠다.
