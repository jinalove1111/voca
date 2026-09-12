# Paul Town — Component Architecture (2026-09-12)

_설계 + 호환성 분석 문서. "레이어드 환경(Ground/Path/Object/Ambient/Paul
guide)"이 기존 `TownScreen`/`TownGrid` 구조 위에 어떻게 얹히는지, 배치/이동/
보관 로직을 조금도 깨지 않고 어디까지 재사용·확장 가능한지 실제 소스 대조로
정리한다. 이번 세션이 실제로 건드린 파일은 §5에 명시(전부 additive)._

## 1. 레이어 → 실제 컴포넌트/DOM 매핑

`VISUAL_SYSTEM.md` §3의 개념 레이어를 실제 코드 위치에 그대로 대응시킨다 —
새 컴포넌트 트리를 만들지 않고 **기존 `TownGrid.jsx` 내부의 className/자식
요소 조합**만으로 표현 가능하다는 것이 이번 분석의 핵심 결론이다.

| 레이어 | 개념 | 실제 구현 위치(기존) | 확장 방법(제안) |
|---|---|---|---|
| Ground | 격자 전체 바닥 | `TownGrid.jsx` 그리드 컨테이너 `div`(`bg-gradient-to-b from-[#fdebd0] via-[#f6e3c8] to-[#cfe3c0]`) | 그대로 재사용, 신규 DOM 없음 |
| Path | 가운데 자갈길 행 | `TownGrid.jsx`의 `isPath` 조건부 className(`bg-[#d9d2c5]`) | 그대로 재사용, 톤만 확장 가능(§3 참고) |
| Object | 건물/자연/동물/장식 | 각 셀 버튼 내부 `<img>`/이모지(`townAsset(item.assetKey)` 폴백) | 무변경 |
| Ambient | 지면 변주/미세 불빛 | **신규** — 셀 버튼의 className에 결정론 조건부 클래스 추가(§3) | `pointer-events-none`, 새 상호작용 없음 |
| Paul guide | 가이드 카드 | `TownScreen.jsx`의 `HeroReaction` 렌더 블록 | 무변경(래핑 클래스만 옵션) |

**핵심 발견**: 5개 레이어 중 4개(Ground/Path/Object/Paul guide)는 이미
존재하는 DOM 구조에 대응되고, 유일한 신규 레이어는 Ambient뿐이다 — 즉
"레이어드 환경"은 리팩터링이 아니라 기존 구조에 대한 **명명(naming)** +
Ambient 레이어 1개 추가로 완성된다.

## 2. 배치/이동/보관 로직과의 호환성 분석

이 세션이 제안하는 어떤 시각적 변경도 아래 4가지 진실 원천을 참조하거나
변경하지 않는다(읽기조차 하지 않음) — 순수 표시 레이어이기 때문에 구조적으로
분리돼 있다:

| 진실 원천 | 파일 | 이번 세션 관계 |
|---|---|---|
| 배치 좌표/소유권 판정 | `src/utils/town/townLayout.js` | 미참조(Ambient/Discovery 모두 placements 배열을 그대로 받아 렌더만 함) |
| 구매/잔액 | `purchase_town_item` RPC, `useTownShop.js` | 미참조 |
| 카탈로그 메타 | `src/utils/town/townCatalog.js` | Discovery만 `itemId`를 조회 키로 참조(읽기 전용, `mergeCatalog` 로직 무변경) |
| 레벨 | `src/utils/town/townLevel.js` | 미참조 |

## 3. Ambient 레이어 — 결정론 className 예시(구현 시 참고용 의사코드)

```js
// TownGrid.jsx 내부, 셀 렌더 시(의사코드 — 이번 세션은 실제 반영하지 않음,
// §7 안전 프로토타입이 townDiscovery.js/townDiscoveryUi.js로 분리한 이유는
// TownGrid.jsx 자체의 회귀 표면(testTownUiStatic.mjs 95단언)을 넓히지
// 않기 위함, §6 참고).
const ambientTone = (x + y) % 3 // 0|1|2, 순수 함수 — 리렌더돼도 항상 동일
const ambientClass = ['', 'bg-[#fdebd0]/20', 'bg-[#cfe3c0]/15'][ambientTone]
```

- `pointer-events-none`은 필요 없다 — Ambient는 별도 오버레이 `<span>`이
  아니라 **기존 셀 버튼의 배경 className 조건부 추가**이므로 클릭 판정에
  전혀 개입하지 않는다(버튼 자체의 `onClick`은 무변경).
- 이 방식은 신규 DOM 노드를 0개 추가한다 — `VISUAL_SYSTEM.md` §7의 "셀당
  추가 DOM 노드를 만들지 않는 것을 우선 원칙"을 정확히 만족.

## 4. Discovery 레이어 — 기존 `openPlacementId` 생명주기에 얹기

`TownGrid.jsx`는 이미 `openPlacementId`(로컬 state)로 "지금 어떤 칸의
액션 스트립이 열려 있는지"를 관리한다(`handleCellClick`, idle 모드에서
빈 칸이 아닌 칸을 탭하면 토글). Discovery 카드는 **이 상태를 그대로
재사용**할 수 있다 — 새 state를 추가하지 않고, 액션 스트립이 열릴 때
`item.assetKey`(또는 `item.id`)로 `pickDiscoveryForItem()`을 호출해 같은
absolute 블록 안에 카드를 추가로 렌더하면 된다.

**호환성 확인**: `TownGrid.jsx`가 부모(`TownScreen.jsx`)에게 "지금 어떤
아이템이 열렸는지"를 알려주는 콜백이 현재 없다(열림 상태가 `TownGrid`
내부에만 존재) — Discovery UI를 완전히 `TownGrid.jsx` 내부에 넣으면
부모/자식 간 새 prop 없이 구현 가능하다(가장 낮은 리스크 경로). 이 경로를
택하면 `TownScreen.jsx`는 전혀 수정할 필요가 없다.

## 5. 이번 세션이 실제로 만든 것(전부 additive, 기존 파일 무변경)

- `src/utils/town/townDiscovery.js`(신규) — 순수 도메인, import 0.
- `scripts/testTownDiscovery.mjs`(신규) — 회귀.
- `docs/design/town/*`(신규 문서 6~7종).

**기존 `src/components/town/*.jsx`/`src/utils/town/{townCatalog,townLayout,
townLevel,townMessages}.js`/`src/hooks/useTownShop.js`/`src/App.jsx` 등은
이번 세션에서 단 한 줄도 수정하지 않았다** — §7의 안전 프로토타입도 새
파일(`TownDiscoveryCard.jsx`, 아래 §6)로만 구현하고 기존 컴포넌트에
와이어링하지 않았다(이유는 §6).

## 6. 와이어링을 보류한 이유(정직한 리스크 기록)

`TownGrid.jsx`/`TownScreen.jsx`/`TownHeader.jsx`는 `scripts/testTownUiStatic
.mjs`(95단언, `tests/harness/registry.mjs`에 `extra:false`=필수 게이트로
등록)와 `tests/e2e/townV1.spec.mjs`(다른 에이전트가 최근 480개 E2E 단언까지
확장한 파일, `handoff.md` 127차)로 촘촘히 고정돼 있다. 코드 분석 결과
(§3/§4) 실제 와이어링은 구조적으로 안전해 보이지만(신규 DOM 0, 기존 상태
재사용, 새 prop 불필요), 이 세션의 우선순위는 "설계 문서 1~6번을 완전하게
끝내는 것"이고(운영자 지시 원문), 필수 회귀 게이트 파일을 건드려 우연히
깨뜨릴 경우 그 복구가 이 브랜치의 범위를 벗어난 조사(다른 에이전트의 최근
확장분과의 충돌 diff 분석)로 이어질 수 있어 **의도적으로 범위를 좁혔다** —
정직하게 "왜 안 했는지"를 기록하는 것이 CLAUDE.md 규칙 18의 정신과 같다.
실제 와이어링은 `TownGrid.jsx`/`TownScreen.jsx` 소유 세션이 이 문서의 §3/§4
의사코드를 그대로 적용하는 낮은 리스크 후속 작업으로 남긴다
(`OWNER_DECISIONS.md` §3).

## 7. 확장 시 체크리스트(후속 세션용)

1. `TownGrid.jsx`에 Ambient className 조건부 추가(§3) → `testTownUiStatic
   .mjs` 재실행(회귀 0건 확인, 기존 클래스 문자열을 제거하지 않았는지 확인).
2. Discovery 카드를 `TownGrid.jsx` 내부 `openPlacementId` 블록에 추가(§4) →
   `townDiscovery.js`(이번 세션 산출물)를 import, `item.id`로
   `pickDiscoveryForItem(item.id, studentId)` 호출.
3. `studentId`를 `TownGrid`까지 prop으로 내려주는 배선 1곳 필요(현재
   `TownGrid`는 `studentData` 전체가 아니라 `placements`/`itemById`만 받음
   — `TownScreen.jsx`가 `studentData.id` 또는 `studentData.studentId`를
   추가로 전달해야 함, 정확한 필드명은 `useStudent.js` 소유 세션 확인 필요).
4. 변경 후 `npm run build` + `node scripts/testTownUiStatic.mjs` + `node
   scripts/testTownDiscovery.mjs` + (가능하면) `tests/e2e/townV1.spec.mjs`
   재실행.

## 8. 참고

- `docs/design/town/VISUAL_SYSTEM.md` §3(레이어 정의).
- `docs/design/town/DISCOVERY_SYSTEM.md`(콘텐츠/알고리즘).
- `docs/design/town/UX_FLOW.md` §7(Discovery UX 규칙).
- `docs/design/town/OWNER_DECISIONS.md` §3(와이어링 여부/시점 결정 요청).
