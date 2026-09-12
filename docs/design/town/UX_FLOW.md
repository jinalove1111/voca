# Paul Town — UX Flow (2026-09-12)

_설계 문서. 기존 3탭 구조(내 마을/상점/보관함, `TownScreen.jsx`)와 각 탭의
기존 인터랙션(`TownGrid`/`TownShopPanel`/`TownInventory`)을 그대로 두고, 그
위에 "3초 이해 규칙", 탭 타겟 지도, 에러/빈 상태, Paul 가이드 카피 목록을
정리한다. 새 모달 체인/새 화면 전환은 만들지 않는다._

## 1. 3초 이해 규칙

학생이 Town 화면에 진입한 지 3초 안에 아래 4가지를 알 수 있어야 한다 — 이미
구현된 것과 이번 세션 제안을 구분해 적는다.

| 질문 | 이미 구현됨(변경 없음) | 위치 |
|---|---|---|
| 지금 💵 얼마 있지? | `TownHeader` 상단 배지 | 항상 화면 최상단 |
| 뭘 살 수 있지? | 상점 탭 카드 상태(`buyable`/`insufficient`/`locked`/`owned`) | `TownShopPanel` |
| 뭐가 잠겨 있지? | 잠금 카드에 "Level N에서 열려요" + "Level N = ⭐N" | `TownShopPanel` §PHASE4 |
| 다음 레벨엔 뭐가 열리지? | `TOWN_LEVEL_UNLOCKS`(1/3/5/8만 문구 있음) | `TownHeader` 진행바 근처(현재는 레벨 숫자만, 잠금 해제 아이템 미리보기는 없음) |

**GAP(이번 세션 관찰, 코드 변경 없음)**: "다음 레벨엔 뭐가 열리지?"에 대한
답이 현재는 레벨 숫자(`Lv.N`)와 진행바뿐이고, 실제로 어떤 아이템이 열리는지는
상점 탭에서 잠긴 카드를 직접 봐야 안다. `OWNER_DECISIONS.md` §1에 개선 제안을
별도로 남긴다(이번 세션은 코드로 구현하지 않음 — 헤더 컴포넌트 구조 변경은
범위 밖).

## 2. 탭/화면 지도(변경 없음, 문서화만)

```
Dashboard → [구경가기 버튼] → TownScreen
  ┌─────────────────────────────────────────┐
  │ ← Paul Town                              │
  │ TownHeader(⭐Lv / 진행바 / 💵)            │
  │ [Paul 가이드 카드 — 이벤트 발생 시만]     │
  │ [토스트 — 웰컴 선물 등, 3초 자동 소멸]    │
  │ [🏘 내 마을] [🛒 상점] [🎁 보관함]        │  ← 탭, 모달 아님
  │ (모드 배너 — placing/moving일 때만)       │
  │ ─────────────── 탭별 콘텐츠 ─────────────  │
  └─────────────────────────────────────────┘
```

세 탭은 전부 **같은 화면 안의 상태 전환**(모달 없음, 페이지 이동 없음) —
`TownScreen.jsx`의 `useState('town')`가 유일한 네비게이션 상태. 뒤로가기
버튼(`← Paul Town`)은 항상 Dashboard로 돌아간다(탭 전환과 무관하게 고정
위치).

## 3. 탭 타겟 지도(주요 인터랙션 좌표, 44px+ 확인된 것만)

| 영역 | 컴포넌트 | 최소 높이 | 비고 |
|---|---|---|---|
| 뒤로가기 | `TownScreen` 상단 버튼 | `py-3 -my-3`(44px 이상 히트박스) | |
| 탭 3개 | `TownScreen TABS` | `min-h-[44px]` | |
| 그리드 셀(8×6) | `TownGrid` | `minmax(40px, 1fr)` | 40px(그리드 예외, `PAUL_TOWN_ASSET_REQUEST_LIST.md` §3 근거) |
| 이동/보관 액션 | `TownGrid` 열림 스트립 | `min-h-[44px]` | |
| 카테고리 탭 | `TownShopPanel` | `min-h-[44px]` | |
| 구매/사기/취소 | `TownShopPanel` | `min-h-[44px]` | |
| 마을에 놓기/위치 옮기기 | `TownInventory` | `min-h-[44px]` | |
| 빈 보관함 → 상점으로 가기 | `TownInventory` | `min-h-[44px]` | |

이번 세션은 이 표를 바꾸지 않는다 — `UX_FLOW_STATIC` 테스트(§6)가 44px+
클래스 존재를 재확인만 한다(기존 `testTownUiStatic.mjs`의 7절과 같은 정신,
중복이 아니라 "설계 문서가 스스로 검증 가능함"을 보이기 위한 별도 스위트).

## 4. 노 모달 체인 규칙

현재 유일한 모달은 `TownShopPanel`의 구매 확인 시트(`confirmItem`) 1개뿐이고,
그 안에서 또 다른 모달을 열지 않는다(취소/사기 두 버튼으로 즉시 닫힘). 이
규칙을 명시적으로 고정한다:

- **모달은 화면당 최대 1단계**만 허용 — 모달 위에 모달을 쌓지 않는다.
- 배치/이동 모드(`mode.kind`)는 모달이 아니라 "화면 안 배너 + 셀 탭 대기"
  방식이라 언제든 "취소" 한 번으로 즉시 idle로 돌아간다(뒤로가기 여러 번
  누를 필요 없음).
- Discovery 카드(§5 `UX_FLOW.md`가 제안하는 신규 요소, `DISCOVERY_SYSTEM.md`)는
  **모달이 아니라 인라인 카드**로만 설계한다 — 탭하면 열리고 다시 탭하거나
  다른 칸을 탭하면 닫히는, 기존 `TownGrid`의 "열림 액션 스트립"과 동일한
  상호작용 패턴(새 모달 레이어를 추가하지 않는다).

## 5. 에러/빈 상태(이미 구현된 것 정리 + 신규 제안 없음)

| 상황 | 처리 | 위치 |
|---|---|---|
| 보관함이 비어있음(구매한 것 0개) | 안내 문구 + "🛒 상점으로 가기" 버튼 | `TownInventory` PHASE4 |
| 상점 첫 방문(잔액 0 & 보유 0) | 안내 카드("아직 💵가 없어요…") | `TownShopPanel` PHASE4 |
| 잔액 부족 | "💵 N 더 필요" + "(공부하면 모여요)" | `TownShopPanel` |
| 레벨 미달(잠김) | "🔒 Level N에서 열려요" + "Level N = ⭐N" | `TownShopPanel` |
| 네트워크 실패(구매 RPC) | `townShop.purchase()`가 `{ok:false}` 반환 → 가이드 카드로 안내(기존 `insufficient`/`locked` 재사용, 신규 에러 문구 없음) | `TownScreen.handlePurchase` |
| 이미 놓인 칸에 배치 시도 | `cell_occupied` — UI가 애초에 빈 칸만 탭 가능하게 막음(구조적 방지) | `townLayout.js` |

## 6. Paul 가이드 카피 목록(기존 유지 + 이번 세션 신규 제안)

기존 `EVENT_TEMPLATES`(`townMessages.js`, 이번 세션이 수정하지 않음) 9종:
`welcome`/`shop`/`purchase_success`/`insufficient`/`locked`/`unlock`/`levelup`/
`tutorial`/`first_place`/`earn_hint`/`level_progress`(총 11개, 위 나열은 대표).
`PAUL_TOWN_BRITISH_WORLD.md` §5의 카테고리별 5종은 **제안**(적용 시
`townMessages.js` 소유 세션이 `EVENT_TEMPLATES`에 추가하는 형태를 권장 —
기존 이벤트와 이름이 겹치지 않게 `discovery_house`/`discovery_nature`처럼
접두어를 두는 것을 권장, `OWNER_DECISIONS.md` §2 참고).

## 7. Discovery UX(제안 — `DISCOVERY_SYSTEM.md`와 함께 읽기)

- 진입점: `TownGrid`에서 이미 배치된 아이템 칸을 탭하면 열리는 기존 액션
  스트립(이동/보관) 옆에, **아이템을 하나 더 눌러야 하는 별도 모달이 아니라**
  그 스트립이 열린 상태에서 아래쪽에 카드 1개가 추가로 나타나는 형태를 권장.
- 최대 2줄, 닫기는 다른 칸을 탭하거나 액션 스트립을 다시 탭하면 자동으로
  같이 닫힌다(기존 `openPlacementId` 상태와 동일 생명주기 — 새 상태를 따로
  만들 필요가 없다는 것이 `COMPONENT_ARCHITECTURE.md` §4의 핵심 결론).
- 보상/네트워크 없음이 시각적으로도 분명해야 한다 — 💵/⭐ 아이콘을 Discovery
  카드에 절대 쓰지 않는다(구매/보상 카드와 혼동 방지, "이건 그냥 재미있는
  정보예요"라는 톤을 로그/코드 주석뿐 아니라 UI 톤에서도 지킨다).

## 8. 참고

- `docs/design/town/COMPONENT_ARCHITECTURE.md` §4 — Discovery를 기존
  `openPlacementId` 생명주기에 얹는 구체적 방법.
- `docs/design/town/OWNER_DECISIONS.md` — §1(다음 레벨 미리보기), §2(가이드
  카피 신규 추가 방식) NEEDS DECISION.
