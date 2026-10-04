# 0013 — Paul Town 2.5D 경제 단계 B: 상품 1개 로컬 구매 (운영자 지정, IMPLEMENTED·VERIFIED, 커밋 완료)

- DECISION ID: 0013
- DATE: 2026-09-27
- TASK ID: proto25d-economy-stage-b
- TASK CLASS: C (운영자 지정 범위, 로컬 전용)
- FEATURE / PROBLEM: 가게에서 상품 1개를 Paul Dollar로 구매하되, 차감은 화면 상태만.

## OWNER REQUEST
기존 가게 진입·오버레이 재사용, 테스트 상품 1개(Bench $5), 상점에도 같은 잔액 표시, 확인창, 충분하면 화면 상태에서만 차감, 부족하면 안내만, 중복 탭 방지, 닫은 뒤 복구, 4뷰포트, 플래그 false 회귀. 실제 DB/RPC/Supabase/Production 쓰기 0, 인벤토리·다중 상품·환불·내역 없음.

## ENGINEERING POSITION (orchestrator, Ponytail full)
기존 가게 오버레이(`ProtoShopScreen`)를 그대로 재사용. `Proto25DScreen`에 `spent` 상태 1개만 추가하고 잔액은 조회값에서 빼는 파생값으로 계산. 순수 함수 `tryPurchase(balance, price)` 1개로 성공/실패를 판정, 새 상태 관리 라이브러리·라우트 없음. `SHOP_PRODUCTS`를 상품 1개로 축소해 다중 상품 처리를 만들지 않음.

## DEVIL'S ADVOCATE POSITION
해당 없음 — 운영자 지정 범위, 로컬 전용.

## MATERIAL DISAGREEMENTS
없음.

## PRODUCT LEAD RESOLUTION
ACCEPT.

## ACCEPTANCE CRITERIA
- [x] 잔액 부족 시 차감 없이 "Paul Dollar가 부족해요", Buy 유지(S21 a)
- [x] 충분하면 확인 → 성공 시 차감·"구매 완료!", 배지·가게 잔액 동일 갱신, 버튼 "구매 완료" 비활성(S21 b)
- [x] 중복 탭(dblclick/연속 터치) 시 1회만 차감(S21 c)
- [x] 가게 닫은 뒤 걷기·카메라 이동·재입장 정상 복구(S21 d)
- [x] 쓰기 호출 0건(purchase_town_item/claim, REST POST/PATCH/DELETE), 4뷰포트 확인창·버튼·토스트 화면 안·44px 이상(S21 e)
- [x] 플래그 3개 false 시 2.5D 화면·배지 없음, 조회 0건, 대시보드 정상
- [x] 단위 shop 48/coin 27/camera 76/testTownUiStatic 126, build 0 경고
- [x] `npm run verify:e2e` 2062/2062, `npm run verify:all` ALL DOMAINS PASS

## IMPLEMENTED-RESULT REVIEW
독립 코드리뷰 APPROVE(2개 nit 반영: 처리 중 방지용 죽은 ref 삭제, 잔액을 모를 때 잔액 줄 숨김), 독립 QA PASS.

## RISKS
구매 판정이 비동기·서버 호출로 바뀌면 현재의 "동기 상태 갱신이 두 번째 탭을 막는다"는 전제가 깨지므로 가게 닫기와 같은 ref 가드가 다시 필요. 차감은 화면 상태뿐이라 새로고침 시 초기화됨(의도된 범위).

## FINAL STATUS
ACCEPTED → IMPLEMENTED → VERIFIED (2026-09-27, PR #62 커밋)
