# Paul Town V2-B / V2-C 로드맵

> 상태: 설계 문서(디자인 전용, 코드 변경 없음). `ONE_TOWN_CONSOLIDATION_PLAN.md`
> (같은 폴더)의 방향을 실행 가능한 작업 단위로 쪼갠다. 근거는 135차
> 구현(`src/components/town/v2/*`, `src/utils/town/townScene.js`,
> `docs/design/town/V2A_ASSET_SPEC.md`)과 `handoff.md` 135차 절.

## 0. 공통 전제

- 모든 작업은 `paulTownV2` 플래그(기본 OFF) 뒤에서 이루어진다 — 꺼져
  있으면 V1(`TownScreen.jsx`)만 렌더되고 V2 코드는 로드조차 안 된다.
- **DB 변경은 기본적으로 하지 않는다.** 카탈로그(`town_items`) 새 행이
  필요한 작업은 "OWNER DECISION"으로 표시하고, 클라이언트만 바꾸는
  대안을 우선한다.
- 경제 영향(가격/레벨 임계/원장)이 있는 작업은 이 로드맵에 없다 —
  전부 시각 계층과 표시 로직만 다룬다.
- 각 작업 메타데이터 표기: **클라이언트전용 / DB변경 / 경제영향 /
  리스크 / 의존**. 테스트는 별도 줄로 표기.

## 1. V2-B — 폴리시(클라이언트 전용)

### 1.1 상점/보관함 바텀시트 접근성

`TownSheet.jsx`(확인: `role="dialog"`만 있고 포커스 트랩/Escape/`body`
스크롤 잠금/닫을 때 포커스 복귀 전부 없음)에 4가지를 추가: 열릴 때
첫 포커스 이동, Tab 순환 트랩, `Escape`로 닫기, 열린 동안 body 스크롤
잠금, 닫히면 트리거 버튼(🛒/🎁)으로 포커스 복귀.

- YES / NO / NO / **low** / 의존 없음
- 테스트: unit `testTownSheetA11y.mjs`(신규), e2e 키보드 전용 흐름 추가

### 1.2 구매했지만 미배치인 아이템 표현(소포 더미)

`V2A_ASSET_SPEC.md`가 이미 `ui/parcel`(소포 아이콘, 인벤토리 전용)을
규정 — `TownInventory.jsx`(V1·V2 공유)에서 소유했지만
`visiblePlacements`에 없는 아이템을 소포 더미 카드로 강조 + 배치 모드
진입 힌트.

- YES / NO / NO / **low-med**(V1과 공유 컴포넌트라 V1 회귀도 확인) /
  1.4는 선택적 의존(에셋 없어도 이모지로 착수 가능)
- 테스트: unit(소유·미배치 집합 계산), static/e2e 스냅샷

### 1.3 배치 UX 다듬기

존 힌트(배치 모드 진입 시 어느 존(`townScene.js ZONES`)에 놓을 수
있는지 안내), 취소 어포던스(이미 존재 — 발견성만 개선), 팝오버 바깥
탭으로 닫기(`TownObjectLayer.jsx` 확인 — 현재 같은 아이템 재탭만
닫힘, 바깥 탭 리셋 로직 없음 → 추가).

- YES / NO / NO / **low** / 의존 없음
- 테스트: unit(존 판정 있다면), e2e(바깥 탭 시 팝오버 닫힘, 힌트 노출)

### 1.4 실제 에셋 통합 아키텍처

`TOWN_ASSETS`(`src/assets/town/index.js`)는 현재 빈 객체이고
`TownSprite.jsx`는 이미 `townAsset(assetKey)` → `<img loading="lazy"
decoding="async">` 또는 이모지 폴백 구조를 갖춤(lazy loading 자체는
**이미 구현됨**). 남은 일: (1) 실제 자산을 `asset_key`별로 import해
`TOWN_ASSETS` 채우기, (2) 같은 PR에서 `testTownUiStatic.mjs` 92행의
"빈 객체여야 통과" 계약 갱신.

- YES / NO / NO / **med**(정적 테스트 동반 갱신 안 하면 verify 즉시
  FAIL) / 실제 이미지 자산 납품(로드맵 범위 밖)에 의존
- 테스트: `testTownUiStatic.mjs` 갱신 + 에셋 유/무 스크린샷 대조 e2e

### 1.5 모바일 폴리시

430px, 가로 모드(844x390), safe-area inset(`env(safe-area-inset-*)`).
135차 e2e는 360/390/430 세로만 커버 — 가로 모드 미커버.

- YES / NO / NO / **low** / 의존 없음
- 테스트: e2e 844x390 케이스 추가(격자 셀 0, 오버플로 0, 버튼≥44px)

### 1.6 죽은 props 정리

135차에서 확인된 미사용 경로 4건: ① `townScene.js freeAnchors(placements,
mode)`의 `mode` 매개변수(eslint-disable 주석과 함께 방치, 반환값에
무영향). ② `TownScene.jsx`가 `TownPlacementOverlay`에 `modeKind`를
넘기지만 그 컴포넌트는 `{anchors, onAnchorTap}`만 구조분해 — 전혀
참조 안 함. ③ `TownSprite.jsx`의 `sizeClass`/`title` props는 내부에서
쓰이지만, 유일한 두 호출부(`TownObjectLayer.jsx`)가 `sprite`/
`className`만 넘겨 항상 `undefined`로만 실행. ④ `townScene.js` 끝의
`export { TOWN_LEVELS }` — grep 결과 `v2/` 폴더 어디서도 이 재노출을
쓰지 않음(모두 `townLevel.js` 직접 import).

- YES / NO / NO / **low**(순수 정리, 동작 무변화가 원칙) / 의존 없음
  (1.1~1.5보다 먼저 처리해도 무방)
- 테스트: 기존 `testTownSceneV2.mjs`/`testTownV2Static.mjs` 전종
  재실행(동작 무변화 확인)

## 2. V2-C — 성장 + 잠금해제

### 2.1 레벨별 안개 걷힘 애니메이션

`fogState`(`townScene.js`)는 이미 다음 레벨 실루엣을 정적 계산 —
레벨업 감지 순간(`TownScreenV2.jsx`의 `prevLevelRef`, 이미 `levelup`
가이드 트리거 존재) `TownFogLayer.jsx`에 페이드아웃 트랜지션 추가.

- YES / NO / NO / **low**(`motion-safe` 접두 필수, 135차 S7 계약 유지) /
  의존 없음
- 테스트: e2e reduced-motion 시 애니메이션 0, levelup 시 전이 확인

### 2.2 정원/마을 성장 — gardenPoints 당일 반영

`ONE_TOWN_CONSOLIDATION_PLAN.md` #2 MERGE 대상. "오늘 배운 단어 → 오늘
새싹"처럼 당일 변화가 당일 보여야 한다(새 저장 필드 없이 기존
`gardenPoints`/`history[오늘]`에서 매번 파생, 레거시
`gardenBandSummary` 정신 재사용). 16칸 격자를 씬에 축소 렌더할지,
`gardenRichness`(현재 0/10/30/60/100 5단계)를 세분화할지는 디자인
결정 필요 — 데이터 축은 어느 쪽이든 `gardenPoints` 하나.

- YES / NO / NO / **med**(당일 반영을 잘못 구현하면 단조성이 깨질
  위험 — `worldProgress.js`의 라운드로빈 해법을 재사용, 재구현 금지) /
  2.1과 트랜지션 인프라 공유 가능(선택적)
- 테스트: unit(같은 stats+날짜 → 같은 결과, 결정론), e2e 스냅샷

### 2.3 건물 탭 발견 카드

132차 Agent B의 `townDiscovery.js`(UUID+일자 해시 결정론, 보상 0,
네트워크 0, `testTownDiscovery.mjs` 69단언 기존)를 **재구현 없이
재사용**(규칙 3). V2 건물(`book-shop`/`english-school`/`clock-tower`)
탭 시 학습 화면 이동 전 발견 카드 1장 표시.

- YES / NO / NO / **med**(PR #44가 아직 OPEN·미merge·Registry
  미등록 — 이 작업 착수 전 처분 결정 선행 필요) / **PR #44 처분
  결정(선행)**, 2.4와 밀접
- 테스트: 기존 `testTownDiscovery.mjs` 재사용(재작성 금지), e2e
  탭→카드→확인→이동 플로우

### 2.4 건물 → 학습 화면 이동 배선

레거시 `TOWN_PLACES`처럼 건물 탭 시 `wordMuseum`/`bookshelf`/
`timeMachine`으로 이동(대상 화면 무변경, `ONE_TOWN_CONSOLIDATION_PLAN.md`
3절 매핑표 그대로). `App.jsx`의 `setScreen` 호출을 V2 오브젝트 탭
핸들러에 연결.

- YES / NO / NO / **low**(라우팅만) / 2.3과 탭 핸들러 공유(2.3 다음
  순서 권장)
- 테스트: e2e 건물 탭→화면 진입→뒤로가기→Town 복귀, 배치 데이터 불변

### 2.5 폴의 하루 한 마디

레거시 "오늘의 발견"(`pickTodaysDiscovery`, Dashboard 카드)과 V2
`PaulGuide`(현재 welcome/earn_hint/levelup/first_place만 대응)를
통합 — Town 진입 시 하루 1회 결정론 메시지 표시. 새 저장 필드 없음
(dayKey 해시 재사용).

- YES / NO / NO / **low-med**(기존 가이드와 동시 표시 충돌 가능 —
  우선순위: 첫 진입 welcome > 레벨업 > 오늘의 발견, 설계는 구현 시점) /
  2.3과 메시지 슬롯(`PaulGuide`) 공유 — 동시 설계 권장
- 테스트: unit(같은 날 같은 데이터 → 같은 메시지, 우선순위), e2e
  진입 시 메시지 정확히 1개

### 2.6 레거시 PaulTown 통합(별도 단계면 V2-D)

`ONE_TOWN_CONSOLIDATION_PLAN.md` 3절 2~3단계(라우팅 전환, 레거시
내비게이션 코드 정리)는 V2-C 범위가 아니라 **V2-D로 분리** —
2.1~2.5가 파일럿 실기기까지 안정화된 뒤 착수해 "다듬어지지 않은 V2를
전 학생에게" 노출하는 리스크를 피한다.

- YES(라우팅 분기만, 신규 데이터 없음) / NO / NO / **high**(전 학생
  노출 전환점 — 롤백은 플래그 OFF지만 발견까지 노출 시간이 리스크) /
  2.1~2.5 전부 완료 + Pilot A 실기기 확인 + 운영자 승인
- 테스트: 전체 회귀(`verify:all`) + 트리플 패스 조합(레거시×V1×V2)
  전수 e2e

## 3. 권장 PR 순서

1. **PR-1**: 1.6 죽은 props 정리(가장 작고 독립적, 회귀 없음을 증명하는
   선행 청소)
2. **PR-2**: 1.1 바텀시트 접근성
3. **PR-3**: 1.3 배치 UX(팝오버 바깥 탭 닫기 + 존 힌트)
4. **PR-4**: 1.5 모바일 폴리시(가로 모드 + safe-area)
5. **PR-5**: 1.2 소포 더미 표현(V1 스크린샷 회귀 포함)
6. **PR-6**: 1.4 실제 에셋 통합(자산 준비 후 — 배선 골격은 자산 없이도
   먼저 낼 수 있음)
7. **PR-7**: PR #44 처분(운영자) → 2.3 발견 카드 + 2.4 학습 화면 이동
   (탭 핸들러 공유 — 한 PR로 묶기 권장)
8. **PR-8**: 2.1 안개 걷힘 + 2.2 정원/마을 성장(디자인 결정 확정 후)
9. **PR-9**: 2.5 폴의 하루 한 마디
10. **PR-10**(V2-D, 별도 승인 게이트): 2.6 레거시 통합 라우팅 전환

## 4. 플래그 전략

- `paulTownV2`는 PR-1~9 전 구간 **기본 OFF 유지** — 각 PR은 플래그
  OFF 시 V1 경로 바이트 동일을 정적 테스트로 계속 증명해야 한다
  (`testTownV2Static.mjs` 패턴 확장).
- **파일럿**: 기존 5명 허용목록(`src/config/pilotTown.js`)에 기기
  플래그 `paulTownV2`가 추가로 ON인 경우에만 V2 노출(`townV1Enabled &&
  paulTownV2Enabled`, 134~135차 게이팅 원칙 그대로). 새 허용목록을
  만들지 않는다.
- PR-10(V2-D)은 파일럿 확인 후 **별도 운영자 승인**을 받아서만
  `paulTownV2` 기본값을 올리거나 허용목록을 확장한다 — 이 문서는 그
  결정을 대신하지 않는다.
