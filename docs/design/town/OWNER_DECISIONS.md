# Paul Town British World — Owner Decisions (2026-09-12)

_AGENT B(설계 세션, 브랜치 `design/paul-town-british-world-2026-09-12`)가
운영자 결정이 필요하다고 판단한 항목만 모은 문서. 전부 미적용 — 코드/DB
변경 없음. 형식: QUESTION / WHY IT MATTERS / OPTIONS / RECOMMENDATION /
SAFE DEFAULT(운영자가 결정하지 않아도 현재 상태로 안전하게 유지되는 값)._

## 1. "다음 레벨엔 뭐가 열리지?" 미리보기 부재(`UX_FLOW.md` §1 GAP)

- **QUESTION**: `TownHeader`의 레벨 진행바 근처에 "다음 레벨에서 열리는
  아이템 이름/이모지" 미리보기를 추가할지?
- **WHY IT MATTERS**: 현재는 레벨 숫자와 진행바만 보이고, 실제로 무엇이
  열리는지는 상점 탭에서 잠긴 카드를 직접 봐야 안다 — "3초 이해 규칙"의
  네 번째 질문에 대한 답이 약하다.
- **OPTIONS**:
  A. `TownHeader.jsx`에 "다음: 📚 Book Shop" 같은 1줄 추가(구현 필요, 신규
     로직 — 다음 레벨의 `min_level` 아이템을 카탈로그에서 찾아야 함).
  B. 현행 유지(레벨 숫자만).
  C. 상점 탭 진입 시 잠긴 카드 중 "가장 가까운 레벨"만 상단에 강조(정렬
     변경, `groupByCategory` 로직 확장 필요).
- **RECOMMENDATION**: A(가장 낮은 리스크, `TownHeader.jsx` 1개 파일만
  수정 — 단 이 세션은 구현하지 않음, `TownHeader.jsx`가 필수 회귀 게이트
  `testTownUiStatic.mjs` 12절에서 "새 `<img>` 없음"만 검사하므로 텍스트 추가
  자체는 안전할 가능성이 높다는 것만 분석 결과로 남긴다).
- **SAFE DEFAULT**: 현행 유지(B) — 아무것도 안 해도 회귀 없음.

## 2. Paul 가이드 신규 카피 5종(`PAUL_TOWN_BRITISH_WORLD.md` §5) 반영 방식

- **QUESTION**: 카테고리별 가이드 라인 5종(house/nature/animal/decoration/
  special)을 `townMessages.js EVENT_TEMPLATES`에 실제로 추가할지, 추가한다면
  이벤트 이름을 어떻게 지을지?
- **WHY IT MATTERS**: `townMessages.js`는 필수 회귀 게이트가 문자열 존재
  여부를 정확히 검사하는 파일이라(`testTownUiStatic.mjs` §11), 이름 충돌 시
  기존 이벤트(`welcome`/`purchase_success`/`locked`/`levelup`)의 카피
  자체가 바뀌면 안 된다.
- **OPTIONS**:
  A. `discovery_house`/`discovery_nature`/... 접두어로 5개 신규 이벤트 추가.
  B. 카테고리 텍스트를 `townMessages.js`가 아니라 `townDiscovery.js`(이번
     세션 산출물, 이미 카테고리 개념이 없음 — 확장 필요)로 옮겨 관리.
  C. 현행 유지(카테고리별 가이드 없음, 아이템 배치 시 항상 `first_place`
     문구만 재사용).
- **RECOMMENDATION**: A — 기존 파일 소유 경계를 지키면서(`townMessages.js`
  소유 세션이 직접 추가) 가장 단순.
- **SAFE DEFAULT**: C(현행 유지) — `townMessages.js`를 이번 세션에서
  수정하지 않았으므로 이미 이 상태.

## 3. 안전 프로토타입 실제 와이어링 시점(`COMPONENT_ARCHITECTURE.md` §6)

- **QUESTION**: `TownDiscoveryCard.jsx`/`TownWoodenSignHeader.jsx`/
  `townAmbient.js`를 실제 `TownGrid.jsx`/`TownScreen.jsx`에 언제 연결할지?
- **WHY IT MATTERS**: 코드 분석(§3/§4)상 구조적으로 안전해 보이지만
  (신규 DOM 0, 기존 `openPlacementId` 상태 재사용, 새 prop 불필요), 실제
  연결은 필수 회귀 게이트(`testTownUiStatic.mjs` 95단언 + `tests/e2e/
  townV1.spec.mjs` 480단언, 이 세션이 소유하지 않는 파일)를 재실행해
  확인해야 하는 작업이라 이 세션 범위를 의도적으로 좁혔다(정직한 기록,
  `COMPONENT_ARCHITECTURE.md` §6).
- **OPTIONS**:
  A. `TownGrid.jsx`/`TownScreen.jsx` 소유 세션(Engineering/QA)이 §7
     체크리스트를 그대로 따라 연결 — 낮은 리스크로 추정되나 실측 필요.
  B. 연결하지 않고 설계 문서로만 남김(이번 세션 산출물 그대로 보류).
- **RECOMMENDATION**: A, 단 별도 세션에서 `testTownUiStatic.mjs` +
  `tests/e2e/townV1.spec.mjs` 재실행을 완료 조건으로.
- **SAFE DEFAULT**: B(현재 상태) — 아무것도 안 해도 기존 화면 무변화,
  회귀 위험 0.

## 4. 제안 아이템 4종(`PAUL_TOWN_BRITISH_WORLD.md` §7 / `ASSET_MANIFEST.md` §3) 카탈로그 반영 여부

- **QUESTION**: `rain-puddle`/`tea-shop-sign`/`train-platform`/
  `lantern-string`을 실제 `town_items`에 추가할지, 추가한다면 가격/레벨은?
- **WHY IT MATTERS**: `TOWN_ECONOMY_AUDIT_2026-09-11.md` §0.7이 이미
  "L1~L3 가격이 TOO CHEAP"라고 판정한 상태라, 새 저가 아이템을 더 추가하면
  그 문제를 심화시킬 수 있다.
- **OPTIONS**: A. 가격 재조정(§0.7 옵션 A~D)과 함께 일괄 검토. B. 카탈로그
  확장 보류, 콘텐츠(Discovery 문장)만 미리 준비된 상태 유지(현재 상태).
- **RECOMMENDATION**: B — 이코노미 밸런스 결정이 먼저다.
- **SAFE DEFAULT**: B(현행 유지, DB 미반영 그대로).

## 5. 스크린샷/프리뷰 미생성 사유(작업 지시 §9)

- **QUESTION 아님, 투명성 기록**: 작업 지시 §9는 "로컬 도구가 허용하면"
  스크린샷을 만들라고 했다. 이번 세션은 `paulTownV1:true`로 화면을 켜도
  실제로 렌더에 반영되는 새 시각 요소가 없다(§3 결정으로 프로토타입을
  아직 어디에도 와이어링하지 않았기 때문 — 기존 `TownScreen`/`TownGrid`가
  그대로 렌더된다). 즉 지금 스크린샷을 찍어도 "기존 화면과 픽셀 단위로
  동일한 이미지"만 나온다 — 새 디자인을 보여주는 스크린샷이 아니므로
  작업 우선순위(운영자 지시 "1~6번을 완전하게 끝내는 것을 절반짜리
  프로토타입보다 우선")에 따라 이번 세션은 스크린샷 생성을 생략했다.
  §3에서 실제 와이어링이 이뤄진 뒤 스크린샷을 다시 시도하는 것을 권장한다.

## 6. 참고

- `docs/design/town/UX_FLOW.md` §1/§7
- `docs/design/town/PAUL_TOWN_BRITISH_WORLD.md` §5/§7
- `docs/design/town/COMPONENT_ARCHITECTURE.md` §6/§7
- `docs/design/town/ASSET_MANIFEST.md` §3
- `docs/design/TOWN_ECONOMY_AUDIT_2026-09-11.md` §0.7
