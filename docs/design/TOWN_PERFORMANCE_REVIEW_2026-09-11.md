# Paul Town V1 — 성능 리뷰 (2026-09-11 야간 성능 트랙, Task 8)

_이 문서는 append-only 문서(`handoff.md`/`ROADMAP.md` 등)가 아니라 이 세션이
신규로 소유하는 설계/감사 기록 파일이다. 범위: (1) 기존 `dist/`(다른
에이전트 소유, 이 세션은 절대 빌드하지 않았다)를 대상으로 한 번들 크기
예산 감사, (2) `src/components/town/*.jsx` + `src/hooks/useTownShop.js` +
`src/App.jsx` town 배선의 정적 리렌더 리뷰. **src/ 코드는 한 글자도
수정하지 않았다 — 전부 권고 사항이다.**_

## 0. 실행 환경 및 제약

- 브랜치: `qa/overnight-town-2026-09-11`
- git 상태 변경 없음, 네트워크 호출 없음
- `npm run build`/`npm run verify:e2e` 미실행(다른 에이전트가 `dist/`를
  소유 중 — 기존 `dist/`를 있는 그대로만 읽었다)
- 측정 시점 `dist/assets/` 스냅샷: `index-CGtfu2_E.js`,
  `TownScreen-BW6ESV7K.js` 등(정확한 해시는 빌드마다 바뀌므로 아래 표의
  파일명은 이 세션 스냅샷 기준)

## 1. 번들 크기 예산 감사

새 하네스 `scripts/testBundleBudget.mjs`(registry `rewardSystem` 도메인,
`extra:false`)가 검사한 내용을 그대로 옮긴다. 스크립트는 `dist/`를 생성하지
않고(빌드 트리거 없음) 있으면 검사, `dist/assets` 없으면 SKIP(`exit 0`)한다.

### 1-1. 크기 표(원본 raw, 실측치)

| 파일 | raw (KB) | 구분 |
|---|---:|---|
| pdf.worker.min-CrMmvqMo.mjs | 1245.4 | 관리자 전용(성적표 PDF 내보내기, Town 이전부터 존재) |
| pdf-Dk_XKybW.js | 472.1 | 관리자 전용(위와 동일 기능군) |
| xlsx-D_0l8YDs.js | 429.5 | 관리자 전용(엑셀 내보내기, Town 이전부터 존재) |
| index-CGtfu2_E.js (메인) | 391.0 | 핵심 시작 경로 |
| AdminScreen-4cp0pPDy.js | 342.7 | 핵심 시작 경로(관리자 로그인 시에만 지연 로드, 단 pdf/xlsx만큼 크지 않음) |
| vendor-supabase-CMEY6uiz.js | 213.6 | 핵심 시작 경로 |
| vendor-react-nf7bT_Uh.js | 140.9 | 핵심 시작 경로 |
| **TownScreen-BW6ESV7K.js** | **19.3** | 핵심 시작 경로(Town, 지연 로드) |
| EntranceTest-BypwyrfA.js | 16.3 | 핵심 시작 경로 |
| ParentScreen-DTZOZL1F.js | 9.5 | 핵심 시작 경로 |
| PaulTown-D_QGICJh.js | 7.9 | 핵심 시작 경로(기존 애착 시스템 화면, Town V1과 다른 파일) |
| WordMuseum / GrowthAlbum / Bookshelf / weeklyReport / EnglishGarden / TimeMachine / HatCollection | 각 2.8~4.9 | 핵심 시작 경로 |

### 1-2. gzip 예산 대조

| 항목 | 실측 gzip | 예산 | 결과 | 비고 |
|---|---:|---:|---|---|
| 메인 청크(index-*.js) | 122.6 KB | ≤ 135 KB | **PASS**(여유 ≈9%) | Town 이전 베이스라인 ≈121.2KB로 알려짐 — Town 도입으로 메인 청크 자체는 거의 늘지 않음(대부분 코드가 지연 로드 청크로 분리된 결과, 아래 1-3 참고) |
| TownScreen 청크 | 6.8 KB | ≤ 15 KB | **PASS**(여유 ≈55%) | |

### 1-3. 코드 분할 / 플래그 / 에셋 검사

| 검사 | 결과 |
|---|---|
| TownScreen이 별도 청크 파일로 존재 | PASS |
| `dist/index.html`이 TownScreen 청크 파일명을 직접 참조하지 않음(정적 `<script>`/`modulepreload` 아님) | PASS — `index.html`은 메인 청크 + `vendor-react`/`vendor-supabase` modulepreload만 참조, TownScreen 언급 0 |
| 메인 청크가 `TownScreen-` 파일명 문자열을 담고 있음(동적 `import()` 배선 증거) | PASS |
| 메인 청크에 `paulTownV1:!1`(minify된 `false`) 리터럴 존재 | PASS — 배포본에도 플래그 기본 OFF가 그대로 반영됨 |
| `assets/town/` 이미지 경로 문자열이 어떤 청크에도 없음 | PASS |
| 마을 아이템(집/나무/동물 등) 이미지 파일이 `dist/assets`에 없음 | PASS — `TOWN_ASSETS={}` 상태와 일치, 현재 전부 이모지 폴백 |

### 1-4. "총 JS 원본 ≤ 1.2MB" — 스코프 결정(정직하게 기록)

`dist/assets/*.js` **전체** 원본 합계는 실측 **≈3.31MB**(decimal)다. 이
숫자 그대로 1.2MB와 비교하면 항상 FAIL한다 — 원인은 Town과 무관한 기존
관리자 전용 대용량 서드파티 3개(`pdf.worker.min-*.mjs` ≈1.25MB +
`pdf-*.js` ≈0.47MB + `xlsx-*.js` ≈0.43MB = **≈2.15MB**, 성적표 PDF/엑셀
내보내기 화면을 실제로 열 때만 지연 로드, Town 도입 이전부터 존재)에
있다. 이 셋을 포함해 예산을 검사하면 Town 코드 변경 여부와 무관하게
상시 FAIL하는 죽은 게이트가 되어(이 저장소의 Release Gate
baseline/regression 분리 원칙, `handoff.md` 관례와 반대 방향) 실제 회귀
신호를 가려버린다.

그래서 `scripts/testBundleBudget.mjs`는 이 3개 파일을 제외한 **"핵심
시작 경로" JS 원본 합계**를 1.2MB 예산과 비교한다:

- 핵심 시작 경로 합계(실측): **≈1.168MB**
- 예산: 1.2MB
- 여유: **≈2.7%** — "정상 변동은 통과시키되 러너웨이(예: Town 관련
  화면/훅이 갑자기 수백 KB 늘어나는 경우)는 잡는다"는 취지에 맞는 빠듯한
  여유
- 제외분(pdf/pdf.worker/xlsx) 자체 합계도 스크립트가 정보용으로 그대로
  출력한다(숨기지 않음) — 이 문서 1-1 표에도 동일하게 노출

**결론: Town V1이 학생이 매번 받는 초기 로드(메인 청크)에 준 실질 영향은
거의 0에 가깝다.** TownScreen 자체는 19.3KB(gzip 6.8KB)짜리 완전히
분리된 지연 청크이고, 메인 청크 증가분은 예산 대비 여유 안에 있다. 유일한
주의점은 "핵심 시작 경로" 예산 자체의 여유가 2.7%로 빠듯하다는 것 —
다음에 Town 관련 화면이 하나 더 늘거나 공용 유틸이 커지면 이 예산을 다시
검토(상향 또는 pdf/xlsx 자체를 더 잘게 쪼개는 별도 작업)해야 할 수 있다.

### 1-5. 실행 결과

```
$ node scripts/testBundleBudget.mjs
... (10개 단언 전체 PASS, 표는 위 1-1~1-3과 동일)

$ node scripts/testRegistryCoverage.mjs
... 8개 단언 중 실패 1개(관측 시점에 따라 미등록 목록이 변동 —
    scripts/testTownLayoutIsolationStress45.mjs 및/또는
    scripts/testTownPurchaseStress45.mjs). 이 세션이 만든 파일이 아니며
    이 세션의 담당 범위(scripts/testBundleBudget.mjs + registry 1줄) 밖 —
    같은 야간 세션의 다른 트랙이 registry.mjs에 실시간으로 항목을
    추가하고 있음을 두 차례 실행 사이의 결과 변화(2개→1개)로 직접
    확인했다(git status 상 tests/harness/registry.mjs가 이미 다른
    변경으로 M 상태였던 것과 일치). 참고용으로만 기록하고 직접 등록하지
    않았다(파일 소유권 미확인 상태에서 남의 트랙 항목을 대신 등록하면
    충돌·attribution 오염 위험, CLAUDE.md 규칙 16). 내가 추가한
    `scripts/testBundleBudget.mjs` 항목 자체는 두 실행 모두에서 실패
    목록에 없었다(정상 등록 확인).
```

## 2. 정적 리렌더 리뷰(권고 전용 — 코드 미수정)

검토 대상: `src/components/town/{TownScreen,TownGrid,TownShopPanel,
TownInventory,TownHeader}.jsx`, `src/hooks/useTownShop.js`,
`src/App.jsx`의 town 배선(`useTownShop` 호출부 + `<TownScreen>` 렌더).

| 항목 | 현재 상태 | 영향 | 권고 | 심각도 |
|---|---|---|---|---|
| `mergeCatalog(shopState.items)` | `TownScreen.jsx` 44행에서 `useMemo(..., [shopState])`로 이미 메모이제이션됨 | 없음(양호) — `shopState` 참조가 바뀔 때(구매/새로고침 응답)만 재계산 | 변경 불필요 | 없음(정보) |
| `groupByCategory(items)` | `TownShopPanel.jsx` 18행 — 렌더마다(메모 없이) 재계산. 탭 전환/구매 확인 시트 열고 닫기/`purchasingId` 변경(구매 중 표시)마다 이 컴포넌트가 리렌더되고 그때마다 재실행됨 | 카탈로그가 현재 17개 항목 × 5카테고리라 실제 비용은 무시할 수준(<1ms 추정)이나, 매 리렌더마다 불필요한 재계산이라는 패턴 자체는 카탈로그가 커지면(수백 개) 선형으로 비용이 늘어남 | `useMemo(() => groupByCategory(items), [items])`로 감싸기 — `items`는 부모(`TownScreen`)에서 이미 안정된 참조(useMemo)로 내려오므로 캐시 적중률이 높다 | P3 |
| `TownGrid`의 `byCell` 인덱스 | `TownGrid.jsx` 20-23행 — `placements` 배열을 렌더마다 순회해 로컬 오브젝트로 재구성. `townLayout.js`가 이미 export하는 `cellMap()` 유틸(동일 목적)을 쓰지 않고 같은 로직을 인라인으로 **중복 구현**하고 있음 | 배치 수가 최대 48칸(그리드 전체 크기)이라 성능 영향은 미미. 다만 `cellMap()`과 로직이 두 곳으로 갈라져 있어 한쪽만 수정되면 드리프트(불일치) 위험 — 성능보다 유지보수 리스크가 더 큼 | `cellMap(state)`을 그대로 import해 재사용(중복 로직 제거) + 필요 시 `useMemo(() => cellMap({townPlacements: placements, townRemovedIds: []}), [placements])`로 감싸기 | P3 |
| `TownScreen`의 `studentData` prop 전체 구독 | `App.jsx`가 `useStudent()`의 반환 객체(`useStudent.js` 2231행 `return { ... }`, 이 반환 자체는 `useMemo` 없이 매 렌더 새 객체)를 `studentData`로 그대로 `TownScreen`에 전달. `TownScreen`은 그 안에서 필요한 필드(`townPlacements`/`townRemovedIds`)만 `useMemo`로 다시 좁혀 쓰므로 **비싼 파생 계산(mergeCatalog/visiblePlacements) 자체는 이미 안전하게 가드됨**. 다만 `TownScreen`(+3개 자식)은 `React.memo`가 없어 `studentData` 참조가 바뀔 때마다 함수 바디는 매번 재실행/재조정됨 | 현재 트리 크기(8×6=48칸 그리드, 17개 카탈로그)에서 리렌더 자체의 비용은 낮아 체감 영향은 미미. App이 잦은 재렌더를 유발하는 상황(폴링/타이머 등)에서 Town 화면이 열려 있으면 불필요한 재조정이 누적될 여지는 있음. **이 패턴은 Town 전용 문제가 아니라 앱 전역 기존 설계**(`useStudent` 반환 객체 자체가 원래 메모이제이션되어 있지 않음 — 다른 화면들도 동일한 특성 공유)임을 분명히 한다 | (선택) `TownGrid`/`TownShopPanel`/`TownInventory`를 `React.memo`로 감싸 얕은 비교로 불필요한 재조정을 스킵. 근본 해결(=`useStudent()` 반환 객체 자체의 안정화)은 Town 범위를 벗어나는 앱 전역 리팩터라 별도 트랙에서 다룰 사안 | P3 |
| `useTownShop.refresh()` 마운트당 호출 횟수 | `useEffect(..., [enabled, studentId])` 단 1곳에서만 마운트/`studentId` 변경 시 호출(83-92행). 구매(`purchase`)/환영 선물(`claimWelcome`) 성공 후 추가로 부르는 것은 "그 액션 이후 서버와 최종 정합"을 위한 의도된 fire-and-forget이지 마운트 시 중복 호출이 아님 | 없음(양호) — 요구된 "마운트당 1회 초과 금지" 충족 | 변경 불필요 | 없음(정보) |
| `<img loading="lazy" decoding="async">` | `TownGrid`/`TownShopPanel`/`TownInventory` 3곳 모두 이미 적용(`testTownUiStatic.mjs` 8절이 회귀 고정 중). 다만 `TOWN_ASSETS={}`라 `townAsset()`이 항상 `null`을 반환해 이 `<img>` 분기 자체가 지금은 한 번도 실제로 렌더되지 않음(전부 이모지 `<span>`으로 대체) | 없음(양호, 잠재적) — 최종 일러스트가 채워지는 시점에 이 속성이 즉시 효력을 발휘 | 변경 불필요 — 에셋을 채우는 커밋에서 이 속성이 그대로 남아있는지만(회귀 없는지) 재확인 권장 | 없음(정보) |
| 동일 에셋 반복 로드(브라우저 캐시) | 현재 `TOWN_ASSETS` 비어있어 실제 이미지 네트워크 요청 자체가 0건(해당 없음). 향후 채워지더라도 `assetKey → 고정 URL` 1:1 매핑이라 같은 아이템은 그리드/상점/보관함 어디서 몇 번 그려지든 항상 같은 URL을 참조 — 브라우저 HTTP 캐시가 자연스럽게 적중, 별도 프리로드/캐시 로직 불필요 | 없음(향후 설계 검증) | 변경 불필요 | 없음(정보) |

### 2-1. 요약

Paul Town V1의 실제 액션 항목은 **P3 2건(그룹핑 메모이제이션 누락,
`cellMap` 유틸 미재사용으로 인한 로직 중복)**뿐이다. 둘 다 현재 규모
(카탈로그 17개, 그리드 48칸)에서는 체감 성능에 영향을 주지 않으며, 굳이
지금 고치지 않아도 사용자가 느낄 정도의 문제는 없다 — 다만 카탈로그가
수백 개로 커지거나(`cellMap` 드리프트처럼) 유지보수 중 실수가 나기 쉬운
지점이라 다음에 이 파일들을 만지는 세션이 참고할 수 있도록 기록해 둔다.
`studentData` 전체 구독 건은 Town이 만든 문제가 아니라 기존 앱 설계의
연장선이라는 점을 명확히 하는 것이 이번 리뷰의 핵심 결론이다 — Town이
그 위에 얹혀서 딱히 상황을 악화시키지 않았다(비싼 파생 계산은 이미
`useMemo`로 잘 가드돼 있음).

## 3. 결론

- 번들 예산 5개 항목(코드 분할/gzip 2건/플래그/에셋 미번들) **전부 PASS**,
  스코프를 명시적으로 좁힌 "핵심 시작 경로 원본 합계" 예산도 **PASS**
  (여유 ≈2.7% — 빠듯하니 다음 확장 시 재검토 권장).
- 정적 리렌더 리뷰에서 발견된 액션 항목은 **P3 2건**(둘 다 코드 변경
  권고, 이 세션은 미적용 — src/ 무수정 원칙).
- P2 심각도 항목은 없음(현재 규모에서 학생 경험에 실질적 영향을 주는
  성능 문제 없음).
