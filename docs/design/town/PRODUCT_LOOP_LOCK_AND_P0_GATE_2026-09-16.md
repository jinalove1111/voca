# Paul Town — 제품 루프 확정 + P0 아트 생성 게이트 (2026-09-16)

> 상태: 디자인 전용. 코드/DB/SQL/이코노미/카탈로그/플래그 변경 0, 이미지
> 생성 0(배치 미실행). `WORLD_LAYOUT_REDESIGN_2026-09-16.md`/
> `FINAL_ARTWORK_SPEC_2026-09-16.md`/`ART_GENERATION_HANDOFF_P0_2026-09-16.md`
> 를 대체하지 않는다 — 이 문서는 그 위에 제품 루프 확정 + 기존 시스템
> 재검증 + P0 아트 생성 순서/게이트만 추가하는 append 성격의 신규
> 문서다.

## 0. 상태/범위

디자인 전용, 코드/DB/SQL/이코노미/카탈로그/플래그 변경 0, 이미지 생성 0
(배치 미실행), P0 아트 생성 게이트 문서다.
`WORLD_LAYOUT_REDESIGN_2026-09-16.md`/`FINAL_ARTWORK_SPEC_2026-09-16.md`/
`ART_GENERATION_HANDOFF_P0_2026-09-16.md`를 대체하지 않고 그 위에 제품
루프 확정 + 재검증만 추가한다(append 성격의 신규 문서). 이 문서 이후에도
좌표/캔버스/프롬프트의 유일한 진실 원천은 여전히 그 세 문서다.

## 1. 스타일 키 승인

운영자가 Step 0 스타일-키 이미지(1080×1920, 6-district 세로 스택, 참고
이미지 수준 디테일, 게임 UI/Paul 캐릭터/프랜차이즈 요소 전부 금지)를
APPROVED 처리했다. 이것이 Paul Town의 1차 비주얼 타겟으로 확정됐다.
스타일 키는 최종 배경으로 그대로 쓰지 않고, 향후 구조 환경/고정 건물/
이동 데코/My House 자산으로 분리 제작한다는 원칙을 재확인한다(§1.6
"하나의 매칭 세트" 규칙, `FINAL_ARTWORK_SPEC_2026-09-16.md` 1.6절).
공식 Paul 캐릭터는 이 세트에서 절대 재생성하지 않는다(변경 없음,
`FINAL_ARTWORK_SPEC_2026-09-16.md` 1.7절 금지 목록 그대로).

## 2. 최종 게임 모델(확정)

PAUL TOWN = EXPLORE(공유 마을, 도로/구역/주요 건물은 구조 고정, 학생이
자유 배치 불가) · SHOP = BUY(기존 Paul Dollar 경제로 카탈로그 아이템
구매) · MY HOUSE = DECORATE(학생 개인 커스터마이즈 공간, 기존 배치
엔진) · LEARNING = EARN + UNLOCK(학습이 화폐를 벌고 레벨을 올림).

3계 진행 시스템(레벨/별 = 확장, gardenPoints = 생기, Paul Dollar =
구매/개인화)을 그대로 유지하며, 새 화폐를 도입하지 않는다.

## 3. 기존 시스템 재사용 매핑

아래 사실은 전부 이 세션에서 직접 코드/DATABASE.md/handoff.md를 Read/
Grep으로 확인한 것이며, 어느 것도 이번 게이트에서 재구현하지 않는다.

| 기능 | 기존 구현 | 근거(파일:줄) |
|---|---|---|
| 적립(earning) | `trg_reward_ledger_to_dollars`/`fn_reward_ledger_to_dollars` 트리거(AFTER INSERT on `reward_ledger`) | `supabase_v3_49_paul_dollar.sql:196`(함수 정의), `:243-246`(트리거 생성) — `reward_ledger` 지급 시 `dollar_ledger`에 자동 반영. 실행 완료(`DATABASE.md` 32번 항목 + "2026-09-09 v3_49 실행·검증 종결" 절 — 2026-09-09 운영자가 SQL Editor에서 1회 실행 완료, post-verify A~E 전부 PASS) |
| 구매(purchasing) | `api/grant-xp.js` action `purchase_town_item` | `api/grant-xp.js:191`(action 분기 시작), `:194`(`studentId`는 세션 토큰에서만 취득), `:208`(`supabase.rpc('purchase_town_item', { p_student_id, p_item_id })`) — SECURITY DEFINER, service_role 전용, 학생별 advisory lock(`DATABASE.md:529`) |
| 소유(ownership) | `star_purchases` ∪ `town_purchases`(UNION)가 유일한 진실 원천, `get_town_shop_state()` RPC로만 파생값 조회 | `DATABASE.md:75`(`star_purchases`), `:79`(`town_purchases`, UNION 판정 근거), `api/grant-xp.js:101`(`supabase.rpc('get_town_shop_state', { p_student_id: studentId })`) — 클라이언트 직접 SELECT 불가(정책 0 + GRANT 0, fail-closed) |
| 인벤토리(inventory) | `src/components/town/TownInventory.jsx` + `townShop.state.owned` 배열 | 파일 존재 확인(`src/components/town/TownInventory.jsx`) |
| 배치(placement) | `src/utils/town/townLayout.js`의 `placeItem`/`moveItem`/`storeItem` | `townLayout.js:68`(`placeItem`), `:90`(`moveItem`), `:108`(`storeItem`) — 8×6 좌표, home_cell/cell_occupied/out_of_bounds 가드 |
| 영속(persistence) | `src/hooks/useStudent.js`의 `mergeTownLayout` + `townPlacements`/`townRemovedIds` | `useStudent.js:565`(`mergeTownLayout(...)` 호출) — `student_progress.progress_data`에 저장(클라우드) + 로컬 백업 병합 |
| 학생 격리(student isolation) | `studentId`는 오직 세션 토큰에서만 취득, `req.body.studentId` 미사용 | `api/grant-xp.js:80-81`(주석: "두 action 모두 studentId를 세션 토큰에서만 얻는다 — req.body.studentId는 어디서도 읽지 않는다") — UUID 기반 |
| 실측 검증 | 142차 handoff에서 Kinney(UUID `e0fe0f50-8927-44d9-9331-e454620524d9`)의 실제 프로덕션 데이터로 적립→구매→소유→배치→영속 전체 체인이 라이브 동작 중임을 read-only로 재확인 | `handoff.md` 142차 섹션(잔액 $31, 나무 (4,2) 배치 보존 — `townState: {starsEarned:60, dollars:{available:31, ...`) |

## 4. 갭 분석 (Shop → Buy → Bring Home → Decorate My House)

| 항목 | 상태 | 설명 | 근거 |
|---|---|---|---|
| 적립/구매/소유/배치/영속/학생격리 | 이미 동작 | §3 그대로 | §3 각 행 |
| UI/렌더 갭 | UI·렌더 갭 | 현재 `TownScreenV2.jsx`/`TownGrid.jsx`는 "공개 마을"과 "내 집"을 시각적으로 구분하지 않는 단일 8×6 격자다. `WORLD_LAYOUT_REDESIGN_2026-09-16.md` §9 구현 계획이 이미 이 갭의 해법(district 스택 렌더러, SPOT_MAP, 로트 상태)을 설계해 뒀으나 아직 코드로 구현되지 않았다 | `TownGrid.jsx:141`(`gridTemplateColumns: repeat(${TOWN_GRID.cols}, minmax(40px, 1fr))`), `WORLD_LAYOUT_REDESIGN_2026-09-16.md:49-61`(V1 8×6 grid 설명), §9(구현 계획). 이번 게이트는 이 설계를 재확인만 하고 구현하지 않는다 |
| 아트 갭 | 아트 갭 | `FINAL_ARTWORK_SPEC_2026-09-16.md`/`ART_GENERATION_HANDOFF_P0_2026-09-16.md`가 정의한 P0 16개 파일이 아직 생성되지 않음 | 이번 게이트의 §6/§8이 재확인·순서화 |
| 미래 My House 커스터마이즈 갭(집 외관 자체를 바꾸는 것) | 미래 항목(설계 자체가 아직 없음) | §5에서 최소 안전 아키텍처만 제안, 구현하지 않음 | §5 |
| DB 갭 | 없음(NO) | Lv1 정원 데코 배치에 필요한 모든 DB 객체(`town_items`/`star_purchases`/`town_purchases`/`dollar_ledger`/RPC 2종)는 이미 실행·배포·실측 검증됨. 새 DB 갭을 발명하지 않는다 | §3 전체 |

**건물류의 이중 축**: 별도로 명시하면, 운영자의 SHOP 예시 목록에 있는
"fences"는 현재 `townCatalog.js`의 `TOWN_ITEM_META`에 항목이 없다
(`townCatalog.js`에서 `fence` 패턴 grep 0건, 현재 카탈로그 17개 id 중
없음) — 현재 월드 설계는 hedge/fence를 구조 환경(plate에 베이크, 구매
불가)으로 분류했다. 이동 가능한 "정원 펜스" 데코 아이템을 원한다면 새
카탈로그 행(가격/레벨 신규 지정)이 필요하며, 이는 이번 게이트 범위
밖의 별도 운영자 결정 사항으로 남긴다(발명하지 않음, **UNKNOWN**으로
표기).

또한 명시하면, `townCatalog.js`의 `british-cottage`(house, L1, $80 —
`townCatalog.js:37`, `meta('🏠', 'house', 1, 10, 80, ...)`) 카탈로그
아이템이 새 월드에서 어떤 로트에 대응하는지
`WORLD_LAYOUT_REDESIGN_2026-09-16.md`에 정의돼 있지 않다(그 문서는
`buildings/my-house`를 항상 소유하는 무료 시작 집으로만 다룬다) — 이
카탈로그 아이템의 역할은 **UNKNOWN**으로 표기하고 임의로 해석하지
않는다. 운영자 확인이 필요한 항목으로 남긴다.

## 5. My House 아키텍처

**A. 정원/집 주변 데코(지금 우선순위, P0/P1)**: 기존 배치 엔진(§3)을
그대로 재사용한다 — 새 구조는 불필요하다.

**B. 집 외관 커스터마이즈(미래 확장, 이번에 구현하지 않음)**: 저장소에
이미 존재하는 선례를 재사용하도록 제안한다 — `src/hooks/useStudent.js`
의 `equippedHatId`(`:354`/`:443`/`:659`/`:1185`, `student_progress.
progress_data` JSONB 안의 단순 문자열 필드, 새 DB 테이블 없이 코스메틱
장착 상태를 저장하는 기존 패턴)와 동일한 방식으로 `equippedHouseSkinId`
(가칭) 같은 필드 하나를 `progress_data`에 추가하는 것이 가장 작고
가역적인 확장이다. 레벨 기반 무료 해금(`HAT_THRESHOLDS`와 동일 패턴,
DB 변경 0)을 1차로 권장하고, "구매 가능한 집 스킨"은 새 카탈로그
카테고리(DB 변경 필요)가 필요하므로 별도 운영자 승인 없이는 제안하지
않는다. 이번 게이트에서는 설계 메모로만 기록하고 구현에 착수하지
않는다.

## 6. P0 자산 매니페스트(제품 모델 재검증)

`FINAL_ARTWORK_SPEC_2026-09-16.md` §2.1(P0-A 9개)/§2.2(P0-B 7개) 표를
그대로 인용하되, 각 `asset_key`에 새 열 하나를 추가해 이번 제품 모델
기준으로 분류한다.

| asset_key | 분류 | 기존 카탈로그 대응 |
|---|---|---|
| `env/plate-home` | ENVIRONMENT | 없음(구조, 카탈로그 없음) |
| `env/plate-fog-horizon` | ENVIRONMENT / LOCKED-FUTURE DISTRICT | 없음(구조, 카탈로그 없음) |
| `buildings/my-house` | MY HOUSE | 없음(구조 고정 로트, 카탈로그 없음 — 항상 무료 소유. `british-cottage` 카탈로그 아이템과는 별개, 그 아이템의 새 월드 역할은 UNKNOWN — §4 참고) |
| `nature/tree` | MOVABLE / PURCHASABLE | catalog id `tree` |
| `nature/flower-garden` | MOVABLE / PURCHASABLE | catalog id `flower-garden` |
| `decorations/bench` | MOVABLE / PURCHASABLE | catalog id `bench` |
| `decorations/street-lamp` | MOVABLE / PURCHASABLE | catalog id `street-lamp` |
| `decorations/red-post-box` | MOVABLE / PURCHASABLE | catalog id `red-post-box` |
| `ui/lot-sign` | STRUCTURAL / FIXED | 없음(UI 오버레이, 카탈로그 없음) |
| `nature/garden-stage-0`~`4` | ENVIRONMENT | 없음(학습 연동 오버레이, 카탈로그 없음, gardenPoints 구동) |
| `env/plate-bookshop-lane` | ENVIRONMENT / LOCKED-FUTURE DISTRICT | 없음(Lv3 전까지 잠김) |
| `buildings/book-shop` | STRUCTURAL / FIXED(위치) + MOVABLE/PURCHASABLE(소유) | catalog id `book-shop`(구매 필요) |

건물류(`buildings/my-house`, `buildings/book-shop`)는 "위치는 구조
고정, 소유는 기존 카탈로그 구매"라는 **이중 축**임을 명시한다 —
`book-shop`의 화면상 위치는 lane 밴드의 정해진 로트로 고정 렌더되지만
(OWNER DECISION A, `WORLD_LAYOUT_REDESIGN_2026-09-16.md` §2), 그
로트에 실제로 건물이 그려지는지는 여전히 카탈로그 아이템 `book-shop`
($120, `townCatalog.js:45`)의 소유 여부(`star_purchases` ∪
`town_purchases`)로 판정된다 — 미소유면 §6의 `ui/lot-sign`("for sale"
표지판)이 그 로트 위에 대신 표시된다.

## 7. 스타일 일관성 계약

`ART_GENERATION_HANDOFF_P0_2026-09-16.md`의 GLOBAL MATCHED-SET BLOCK을
요약 인용한다 — 카메라 3/4 top-down ≈30도 고정, 좌상단 광원, contact
shadow만(≤15%, 캐스트 섀도 금지), 팔레트 9색(`FINAL_ARTWORK_SPEC_
2026-09-16.md` 1.4절) + 우체통 빨강 예외, no UI/no Paul/no franchise,
참고 이미지 수준 디테일이지만 1x 렌더 시 2px 미만 마이크로디테일 금지
(1.5절). 이를 "모든 향후 생성 자산이 지켜야 할 계약"으로 재확인한다 —
새 규칙을 추가하지 않는다. 이미 있는 계약이 이번 제품 모델(§2)과
모순되지 않음을 확인만 한다.

## 8. 아트 생성 순서(스타일 드리프트 조기 발견)

1) My House 코티지(`buildings/my-house`, 가장 위험도 높은 세계관 기준
   스프라이트, style-key와 1:1 대조)
2) `env/plate-home`(코티지와 즉시 페어 대조, 접지선/그림자 일치 확인)
3) 이동 데코 5종(`nature/tree`/`nature/flower-garden`/
   `decorations/bench`/`decorations/street-lamp`/
   `decorations/red-post-box`)을 한 배치로 생성해 콘택트시트로 상대
   스케일 대조
4) `ui/lot-sign`(저위험, 24×29 가독성만 확인)
5) **[P0-A 승인 게이트]**
6) `nature/garden-stage-0`~`4`를 한 세트로 생성(5단계 내부 일관성)
7) `env/plate-bookshop-lane`
8) `buildings/book-shop`(`my-house`와 마감 수준 나란히 대조)
9) **[P0-B 승인 게이트]**

이 순서를 고른 이유는, 위험도가 가장 높은 항목(세계관을 정의하는
My House)과 서로 직접 비교해야만 하는 항목(코티지↔plate-home 접지선,
데코 5종 상호 스케일, my-house↔book-shop 마감 수준)을 먼저·함께
생성해 스타일 드리프트를 조기에 잡기 위함이다 — 브리프 §1이 지적한
"assets were generated one by one"이 기존 스케일/원근/스타일 불일치의
근본 원인이었다는 진단(`WORLD_LAYOUT_REDESIGN_2026-09-16.md` §1)을
반복하지 않기 위한 순서다.

## 9. 구현 계획 연결

`WORLD_LAYOUT_REDESIGN_2026-09-16.md` §9를 그대로 인용/재확인한다 —
district 모델 + `SPOT_MAP` + 로트 상태(`townScene.js`의
`DISTRICTS`/`SPOT_MAP`/`lotState` 추가, `TownScene.jsx` 등 렌더
컴포넌트 교체), `paulTownV2` 플래그 OFF 뒤에서 진행하며, 기존
`useStudent.js`/`useTownShop.js`/`townLayout.js`는 무변경(§9 "손대지
않는 파일" 목록: `TownGrid.jsx`(V1), `townLayout.js`, `townShop.js`/
`useTownShop.js`, `townLevel.js`, `townCatalog.js`, 모든 SQL/API).
P0 아트가 승인된 뒤에만 착수하며, DB 변경은 0이다.

## 10. GO/NO-GO

**GO — 단, "첫 최소 배치"로 한정한다.** 첫 배치 = `buildings/my-house.
webp` + `env/plate-home.webp` 2개 파일만(§8 순서의 1~2단계) — 이 둘이
세계관을 정의하는 가장 위험도 높은 쌍이라 먼저 승인받아야 나머지
P0-A/B 생성이 안전해진다. 나머지 P0-A 7개는 이 2개 승인 후, P0-B는
P0-A 전체 승인 후 진행한다. 미해결 항목(§4의 `british-cottage` 역할,
fences 카탈로그 부재)은 첫 배치 생성을 막지 않지만, P0-A 전체 완료
전에 운영자 확인이 필요하다.

## 11. 다음 단계

이미지 생성 가능한 환경에서 `ART_GENERATION_HANDOFF_P0_2026-09-16.md`
의 asset #1(`env/plate-home`)과 #3(`buildings/my-house`) 프롬프트를
그대로 사용해 첫 배치 생성 → 콘택트시트 대조 승인 → 나머지 P0-A 7개 →
P0-B 7개. 운영자 확인 필요: `british-cottage` 카탈로그 아이템의 새
월드 역할, "fences" 데코 아이템 신설 여부.

---

_작성: 2026-09-16. 근거: `WORLD_LAYOUT_REDESIGN_2026-09-16.md`,
`FINAL_ARTWORK_SPEC_2026-09-16.md`, `ART_GENERATION_HANDOFF_P0_
2026-09-16.md`, `DATABASE.md`(32번 항목 + "2026-09-09 v3_49
실행·검증 종결" 절), `handoff.md`(142차), `supabase_v3_49_paul_
dollar.sql`, `api/grant-xp.js`, `src/utils/town/townLayout.js`,
`src/utils/town/townCatalog.js`, `src/hooks/useStudent.js`,
`src/components/town/TownGrid.jsx`(전부 이 세션에서 직접 Read/Grep으로
확인, 추측 수치 없음). 이미지 생성/코드/DB 변경 없음._
