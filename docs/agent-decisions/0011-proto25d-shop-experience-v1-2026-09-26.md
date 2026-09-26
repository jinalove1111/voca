# 0011 — Paul Town 2.5D "가게 체험" v1: 입장·상품 진열·구매 안내 (운영자 지정 설계, IMPLEMENTED·VERIFIED, 커밋 완료)

- DECISION ID: 0011
- DATE: 2026-09-26
- TASK ID: proto25d-shop-experience-v1
- TASK CLASS: C (운영자 지정 범위)
- FEATURE / PROBLEM: 8h 자율 세션 Phase 2 목표 플레이 흐름 — 캐릭터가 가게 앞에 다가가면 입장할 수 있고, 상품을 구경하고, 구매를 시도하면 준비 중 안내를 받고 마을로 돌아올 수 있게 한다.

## OWNER REQUEST
8h 자율 세션 Phase 2 목표 플레이 흐름: 가게 입구 접근 → 입장 버튼 → 가게 오버레이(상품 진열) → Buy 시도 → 안내 → 마을로 복귀. Phase 1 산책 모드(0010) 위에서 진행, 플래그 3개 false, DB/SQL/Supabase WRITE 0, 실제 결제·코인·인벤토리 저장 없음.

## CURRENT PRODUCT CONTEXT
Phase 1(0010)에서 확장된 월드 + 카메라 추적이 적용된 상태. `sceneFixture.js`에 오브젝트 8개, `walkGrid.js`의 OBSTACLES에서 충돌 상자 파생. 메인 자산 레지스트리(`src/assets/town/index.js`)에 라이선스 자산 보유, `src/assets/town/env/*`는 V2 전용 격리 자산.

## ENGINEERING POSITION (planner)
가게 = `demo-building`(anchor {50,42}, 스폰 인근). 입구는 충돌 상자 하단 중앙에서 `nearestWalkablePoint`로 해석. 상호작용 반경은 셀 비정방형을 반영한 타원(2×CELL_W_PCT, 2×CELL_H_PCT). 상품 3개는 메인 자산 레지스트리의 `decorations/bench`, `nature/flower-garden`(화분 자리표시자, placeholder:true), `decorations/street-lamp`만 재사용 — `src/assets/town/env/*`는 V2 격리 자산이라 신규 기능에 사용 금지.

## CHILD EXPERIENCE POSITION (구현 결과 재검토)
1차 REVISE: 상품 카드 아래 작은 text-xs 안내는 놓치기 쉬움. 수정 후 중앙 토스트(≥16px, role=status)로 교체 → APPROVE.

## GAME DESIGN POSITION (구현 결과 재검토)
ACCEPT. 물질적 이슈 없음. 후속 후보(비차단): 코인 잔액 스텁, Buy 버튼 비활성 표현.

## DEVIL'S ADVOCATE POSITION
해당 없음 — 운영자 지정 설계로 설계 파도 생략.

## MATERIAL DISAGREEMENTS
없음.

## PRODUCT LEAD RESOLUTION (orchestrator)
ACCEPT(운영자 설계). Phase 3(전체 diff 재검토, 누수/입력 충돌/reduced-motion/HUD 겹침, 테스트 보완)과 후속 후보(코인 스텁, Buy 비활성, 화분 전용 이미지, 월드 가장자리 시각 단서)는 운영자 결정으로 DEFER.

## ACCEPTANCE CRITERIA
- [x] 스폰 시 입장 버튼 미표시, 입구 타원 진입 후 표시(S18 a)
- [x] 입장 버튼 ≥52px, HUD 비겹침(S18 b)
- [x] 입장 시 가게 오버레이 표시, 상품 3개 진열(S18 c)
- [x] 가게 열림 중 바닥 탭 무시, 이동 잠금(S18 d)
- [x] Buy 클릭 시 중앙 토스트 "구매 기능 준비 중" 표시(S18 e)
- [x] 뒤로가기 빠른 더블클릭 후에도 가게가 닫힌 채 유지, 히스토리 1칸만 소비(S18 f — 수정 3사이클 끝에 해결)
- [x] 마을 복귀 후 위치·방향 보존(S18 g)
- [x] 가게에서 멀어지면 입장 버튼 숨김, 카메라 추적·오버플로 없음(S18 h)
- [x] 단위 shop 44/44 + 기존 6스위트(camera/walkGrid/pathRandom/sceneFixture/depth/bench) PASS
- [x] `npm run build` 0 경고
- [x] `npm run verify:e2e` 1917/1917, `npm run verify:all` ALL DOMAINS PASS
- [x] 플래그 3개 false, DB/SQL/Supabase WRITE 0, 실결제·코인·인벤토리 저장 없음

## IMPLEMENTATION SCOPE
`src/utils/town/proto2_5d/shopInteraction.js`(신규), `src/components/town/proto2_5d/ProtoShopScreen.jsx`(신규), `src/components/town/proto2_5d/Proto25DScreen.jsx`, `scripts/testProto25dShop.mjs`(신규), `tests/harness/registry.mjs`, `tests/e2e/townProto25d.spec.mjs`(S18).

## OUT OF SCOPE
실제 결제/코인 잔액/인벤토리 저장, Town Shop RPC 연동, 화분 전용 이미지, 월드 가장자리 시각 단서, Phase 3 전체 diff 재검토.

## IMPLEMENTED-RESULT REVIEW
- 코드 리뷰: 1차 CHANGES_REQUIRED(뒤로가기 히스토리 이중 후퇴 경쟁) → 수정 1. S18(f) 재현 FAIL 지속 → 운영자 지정 수정 2(재진입 400ms 가드) 적용도 동일 FAIL. 진단 스크립트로 `closeShopNow`의 함수형 업데이터 내부 변수를 같은 틱에서 동기적으로 읽던 구조가 React 18 배칭에서 죽은 코드였음을 확정 → 수정 3(가드 무조건 실행, 운영자 승인 하 3번째 사이클) → 최종 APPROVE.
- UX 재검토: 1차 REVISE(안내 문구 가독성) → 수정 후 APPROVE.
- 게임 재검토: ACCEPT(수정 없음).
- QA: PASS(운영자 지정 9항목 전부 증거 매핑).
- 수정 사이클: 3회 — 3번째는 운영자 승인 하 진행.

## RISKS
React 함수형 업데이터(`setState((cur) => ...)`) 내부에서 세운 변수를 같은 동기 실행 흐름의 다음 줄에서 읽으면 React 18 배칭 하에서 업데이터 실행 시점이 늦어져 그 변수가 죽은 코드가 될 수 있다 — 이번 결함의 근본 원인이자 재사용 가능한 교훈. 부가 스위트 `testRewardFlow.mjs`가 병렬 부하 중 간헐 FAIL(단독 실행 시 PASS, 이번 diff와 무관, 후속 조사 후보).

## FINAL STATUS
ACCEPTED → IMPLEMENTED → VERIFIED (2026-09-26, PR #62 커밋)
