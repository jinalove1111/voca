# 0012 — Paul Town 2.5D 경제 단계 A: 코인 잔액 읽기 전용 표시 (운영자 지정, IMPLEMENTED·VERIFIED, 커밋 완료)

- DECISION ID: 0012
- DATE: 2026-09-26
- TASK ID: proto25d-economy-stage-a
- TASK CLASS: B (운영자 지정, 읽기 전용)
- FEATURE / PROBLEM: 2.5D 화면에 코인(Paul Dollar) 잔액을 읽기 전용으로 표시한다.

## OWNER REQUEST
코인 잔액을 화면에 표시하는 범위만. 구매 차감·보상 지급·환영 코인 수령·인벤토리 저장·DB/SQL/Production 변경은 0. 플래그 3개(paulTownV1/paulTownV2/paulTown2_5d) false 유지. 설계 근거 `docs/design/town/PROTO25D_ECONOMY_NEXT_DESIGN_2026-09-26.md` §8 단계 A.

## CURRENT PRODUCT CONTEXT
서버 Paul Dollar 원장이 단일 진실 공급원. `src/hooks/useTownShop.js`(App.jsx 1회 마운트)가 `get_town_shop_state`(조회)로 받아 대시보드 지갑에 이미 사용 중이며, 환영 코인 수령·구매는 TownScreen/TownScreenV2가 명시적으로 호출할 때만 실행된다. 조회 게이트는 `townShopV1 || paulTownV1`이라 `paulTown2_5d`만 켠 파일럿에는 잔액이 조회되지 않는다 — 게이트 확장 여부는 이번 범위 밖(§9 운영자 결정).

## ENGINEERING POSITION (orchestrator)
대시보드 지갑과 동일한 게이트·출처를 재사용해 App.jsx에서 `Proto25DScreen`에 숫자만 전달한다. 2.5D 화면은 새 fetch를 만들지 않고, HUD에 누를 수 없는 배지(role=status, pointer-events-none)로만 표시한다. 값이 없으면(게이트 미충족 또는 미조회) 배지를 렌더하지 않아 실제 잔액과 다른 값을 보여줄 위험을 없앤다.

## DEVIL'S ADVOCATE POSITION
해당 없음 — 운영자 지정 범위, 읽기 전용, 설계 파도 생략.

## MATERIAL DISAGREEMENTS
코드리뷰가 배지 용어("코인")와 대시보드 표기("Paul Dollar")의 불일치를 비차단으로 지적. 운영자가 "코인"으로 지시했으므로 이번 구현은 유지하고, 용어 통일 여부는 운영자 결정으로 남긴다.

## PRODUCT LEAD RESOLUTION
ACCEPT. 용어 통일과 조회 게이트 확장은 운영자 결정 대기.

## ACCEPTANCE CRITERIA
- [x] townShopV1 미충족 시 배지 미표시(S20 a)
- [x] townShopV1 충족 + 잔액 37 → 배지 "$37" 표시, role=status, 뷰포트 안, HUD/입장 버튼과 비겹침(S20 b)
- [x] 가게 열고 Buy 클릭 후 닫아도 잔액 불변(S20 c)
- [x] 쓰기 액션(purchase_town_item, claim_town_welcome) 0건, REST POST/PATCH/DELETE 0건, 조회 get_town_shop_state ≥1(S20 d)
- [x] 가로 스크롤 없음(S20 e)
- [x] 단위 coin 27/27, `npm run build` 0 경고
- [x] `npm run verify:e2e` 1965/1965, `npm run verify:all` ALL DOMAINS PASS
- [x] 플래그 3개 false, DB/SQL/Production WRITE 0

## IMPLEMENTED-RESULT REVIEW
독립 코드리뷰 APPROVE(2.5D 화면은 숫자만 받는 구조라 쓰기 경로가 구조적으로 없음, 용어 지적은 비차단), 독립 QA PASS. 수정 사이클 0.

## RISKS
조회 게이트를 `paulTown2_5d`로 확장할 경우 TownScreen의 `claimWelcome` 경로가 2.5D로 함께 끌려오지 않도록 재검토가 필수 — 이번 구현은 조회만 재사용했을 뿐 쓰기 경로는 옮기지 않았다.

## FINAL STATUS
ACCEPTED → IMPLEMENTED → VERIFIED (2026-09-26, PR #62 커밋)
