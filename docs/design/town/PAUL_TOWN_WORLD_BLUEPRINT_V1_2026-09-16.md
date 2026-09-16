# PAUL TOWN WORLD BLUEPRINT V1

## 0. 상태/범위 및 이미 완료된 것과의 관계

**이 문서는 설계 전용(design-only) 통합 문서다.** 이 문서 자체는 코드/DB/이코노미/카탈로그/플래그를 단 한 줄도 바꾸지 않는다. 여기 실린 모든 구조 수치(district 스택/로트 좌표/레벨 임계값/카탈로그 가격 등)는 이미 결정되고 구현되고 검증된 값을 그대로 인용한 것이며, 이 문서가 새로 추측하거나 재설계한 값은 없다(섹션 5/6만 예외 — 명시적으로 "신규 설계"라고 표시함).

PM 디렉티브의 "REJECTED 시각 구성" 목록(사각 보드, 평평한 지형, 가로 조약돌 띠, 작은 이모지 집, 붕 뜬 오브젝트)은 **오늘 밤 빌드 이전의 상태**를 가리킨다. 오늘 밤(2026-09-16, 150~151차, 커밋 `021498e`→`f6f8dd1`→`0f92321`)에 이미 그 구성은 폐기되고 아래에 정리된 "6개 district 세로 스택 + 연속 길 + 고정 로트" 구조가 결정론적 코드(`src/utils/town/townScene.js`의 `DISTRICTS`/`LOTS`/`SPOT_MAP`/`PATHS`, `src/components/town/v2/*`)로 구현·검증 완료됐다(build clean, `testTownV2Static` 103/103, `testTownSceneV2` 253/253, `testTownUiStatic` 126/126, `verify:e2e` 972/972, 독립 QA 리뷰 PASS 0 critical/major, Playwright 360/390/430px × Lv1/3/5/8 스크린샷 전부 clean). 즉 PM이 "거부"한 대상은 이미 오늘 밤 자체적으로 교체됐다 — 이 사실은 이 블루프린트가 요청받은 작업을 생략할 사유가 아니라, 요청받은 모든 섹션을 이미 결정된 정답 위에서 정리해 내놓는 근거다. `paulTownV2` 플래그는 여전히 OFF이며 V1(실제 학생 Kinney 경로)은 완전히 무접촉 상태다.

---

## 1. MOBILE WORLD MAP

6개 district를 `heightUnits`(district별 깊이 스케일)로 정규화해 월드 전체(홈=하단 0%, 시계탑=상단 100%, Lv8 전체 해금 기준)에서 각 district가 차지하는 세로 구간을 계산했다. 분모 = `1.15+0.85+0.90+0.50+0.80+0.95 = 5.15`(district heightUnits 합, `FINAL_ARTWORK_SPEC_2026-09-16.md` §1.2 표 그대로).

| district | heightUnits | sprite scale | 해금 레벨 | 월드 내 구간(%, 하단 0%~상단 100%) | 이 구간을 차지하는 이유 |
|---|---|---|---|---|---|
| home (My House) | 1.15 | 1.00 | Lv1 | **0% ~ 22.33%** | 스택 최하단, 항상 무료 소유 |
| lane (Book Shop) | 0.85 | 0.86 | Lv3 | **22.33% ~ 38.83%** | home 바로 위 |
| square (Café+Fountain) | 0.90 | 0.76 | Lv5 | **38.83% ~ 56.31%** | lane 바로 위 |
| river (Stone Bridge) | 0.50 | 0.70 | Lv6 | **56.31% ~ 66.02%** | square 바로 위, 가장 얇은 밴드 |
| school (English School) | 0.80 | 0.64 | Lv7 | **66.02% ~ 81.55%** | river 바로 위 |
| tower (Clock Tower) | 0.95 | 0.56 | Lv8 | **81.55% ~ 100.00%** | 스택 최상단, Lv8에서 처음 하늘/먼 언덕 노출 |

**fog/horizon 밴드**: heightUnits 0.32 (district 스택과 같은 단위 기준, 전체 5.15 대비 약 6.2%p 두께). 위치는 고정이 아니라 동적 — 학생 레벨 < 8일 때, 현재 해금된 최상단 district의 상단 경계 바로 위에 항상 이 두께만큼 얹힌다. 예: Lv5(square까지 해금)면 fog는 56.31%~62.5% 근방에 걸리고, 그 위(river/school/tower 구간)는 화면에 아예 나타나지 않는다(월드 자체가 그 높이까지 아직 "존재"하지 않는 것처럼 렌더). Lv8에 도달하면 fog가 완전히 사라지고 tower 구간(81.55%~100%) 위로 처음 하늘/먼 언덕이 드러난다.

**Explore 확장 지점(미래, 미구현 — 상세는 §6)**: tower district 상단 경계(100%) 바로 위, x≈70%(tower district 안에서 길이 끝나는 지점과 동일 x) — 즉 오늘 밤 구현이 "하늘/먼 언덕"으로만 채워둔, Lv8에서 열리지만 아무 콘텐츠가 없는 바로 그 공간이다. 새 heightUnits를 추가하지 않는다 — 기존 tower 밴드의 여백을 재해석할 뿐이다.

**로트 좌표 원표(참고, district 내부 좌표 — 위 %와는 별도 축)**: My House(home, 50%, 66%, 42%, 항상 건축됨/무료) · Book Shop(lane, 30%, 62%, 36%) · Café(square, 78%, 60%, 34%) · Stone Fountain(square, 50%, 55%, 16%) · Stone Bridge(river, 50%, 50%, 44%, 미구매여도 길은 항상 다리를 건넘) · English School(school, 38%, 55%, 40%) · Clock Tower(tower, 50%, 60%, 16%).

---

## 2. LEVEL-BY-LEVEL VISUAL PROGRESSION (Lv1–Lv8)

두 축은 독립이다 — **레벨(stars 임계값)** = 공간 확장(어느 district/로트가 보이는가), **gardenPoints**(`gardenRichness`) = 생기/성장(같은 공간이 얼마나 살아있게 보이는가). 레벨이 낮아도 gardenPoints가 높으면 home 구역은 이미 무성할 수 있고, 반대로 레벨이 높아져 새 district가 열려도 그 구역의 생기는 별개로 쌓인다.

| Lv | stars 임계값 | 새로 보이는 것 | 새로 해금되는 것 | 환경 성장(gardenRichness 연동) | 앞으로의 예고(fog 너머) |
|---|---|---|---|---|---|
| **Lv1** | 0 | home 구역(정원+마당) 전체, 길이 78%에서 위로 나가지만 그 위는 fog | My House(항상 무료), 카탈로그 Lv1 아이템(tree/bench/town-sign/shop-lamp/british-cottage-역할미정) 구매 가능 | gardenPoints 0부터 시작(stage 0, 씨앗) | lane 구역이 fog 뒤 실루엣으로 은은히 비침 |
| **Lv2** | 20 | (공간 확장 없음, home 구역 내 밀도만 증가) | 카탈로그 Lv2 아이템(cat/street-lamp/red-post-box) 구매 가능 | gardenPoints 누적 중, 10 도달 시 stage 1(새싹) 진입 가능 | 변화 없음(여전히 lane이 다음 목표) |
| **Lv3** | 50 | lane 구역(Book Shop Lane) 열림, home→lane 연결 길이 22%에서 78%로 완주 | Book Shop 로트에 "for sale" 표지판 노출(카탈로그 구매 전), flower-garden 아이템 해금 | gardenPoints 30 도달 시 windowsLit(창문 불빛) 시작 가능 | square 구역이 fog 뒤 실루엣 |
| **Lv4** | 100 | (공간 확장 없음, lane 밀도 증가) | 카탈로그 Lv4 아이템(puppy/owl) 구매 가능 | stage 2(꽃봉오리) 도달 가능(gardenPoints 30) | 변화 없음(여전히 square가 다음 목표) |
| **Lv5** | 200 | square 구역(Village Square) 열림, Café 로트+Stone Fountain 로트 노출 | Café/stone-fountain 카탈로그 구매 가능 | stage 3(만개, gardenPoints 60) 도달 가능, ivy(담쟁이) 시작 가능 | river 구역(Stone Bridge)이 fog 뒤 실루엣 |
| **Lv6** | 350 | river 구역(가장 얇은 밴드) 열림, Stone Bridge 로트 노출(길은 미구매여도 항상 다리를 건넘) | Bridge 카탈로그 구매 가능 | stage 4(만발) 근접, ivy 지속 성숙 | school 구역이 fog 뒤 실루엣 |
| **Lv7** | 550 | school 구역(English School) 열림 | English School 카탈로그 구매 가능 | gardenPoints 100 도달 시 birds(새) 등장 가능 | tower 구역이 fog 뒤 실루엣, "월드 최상단이 가깝다"는 신호 |
| **Lv8** | 800 | tower 구역(Clock Tower) 열림, **fog 완전히 사라지고 처음으로 하늘/먼 언덕 노출**(하단 5개 구역은 하늘이 안 보이는 앵글 유지, tower만 예외) | Clock Tower 카탈로그 구매 가능 — 이 시점에 6개 district 전체 해금 완료 | 생기 축은 계속 gardenPoints에 따라 독립 성장 | 없음(district 확장은 여기서 끝) — 열린 하늘/먼 언덕 공간 자체가 §6의 Explore 확장 여지 |

**Lv9/Lv10**: 기존 설계(`townLevel.js` 임계값 1100/1500)상 새 district는 없다 — 6개 district 스택은 Lv8에서 완결이다. Lv9/10에서 학생이 얻는 시각적 보상은 (a) gardenRichness 축의 계속된 성장(더 높은 gardenPoints로 인한 더 풍성한 stage/ivy/birds 밀도 — 단 `GARDEN_STAGE_THRESHOLDS`는 [0,10,30,60,100]으로 이미 100에서 최대 stage에 도달하므로 실제로는 stage 자체보다 windowsLit/ivy/birds 복합 밀도 체감이 더 의미 있음), (b) 카탈로그상 이미 남아있는 미구매 아이템(장식류)을 계속 채워 넣는 커스터마이즈 심화다. Lv8에서 열린 tower 상단의 하늘/먼 언덕 공간은 콘텐츠 없이 예약된 여백으로 남는다 — 이 여백이 정확히 §6에서 제안하는 Explore 확장 지점이다.

---

## 3. FIXED VS CUSTOMIZABLE MATRIX

17개 카탈로그 아이템 전수 분류. **주의(정직한 편차 표기)**: PM 디렉티브 예시는 FIXED WORLD를 5개(bridge/english-school/clock-tower/book-shop/cafe)로 들었으나, 실제 `WORLD_LAYOUT_REDESIGN_2026-09-16.md` §2 OWNER DECISION A 원문("My House/Book Shop/Café/Stone Bridge/English School/Clock Tower/**Stone Fountain**은 '로트 위 고정 건물'")은 **Stone Fountain도 동일하게 고정 로트**로 명시하고 있다 — square 구역 중앙 로트(50%, 55%, 16%)로 §1의 "Fixed lots" 원표에도 다른 5개 건물과 동일한 구조로 함께 실려 있다. 따라서 이 문서는 실측 근거(§1의 원표 + OWNER DECISION A 원문)를 따라 **FIXED WORLD 6개 + CUSTOMIZABLE 10개 + RECONSIDER 1개**로 분류한다(PM 예시의 "나머지 11개 CUSTOMIZABLE"과 1개 차이 — 그 1개가 stone-fountain).

| id | category/minLv/price | 분류 | 근거(1줄) |
|---|---|---|---|
| `british-cottage` | house/1/$80 | **RECONSIDER** | 역할 UNKNOWN, 항상 무료인 my-house 스프라이트(카탈로그 외)와는 별개 아이템이다 — 소유자 판단 필요 |
| `tree` | nature/1/$10 | CUSTOMIZABLE | 기존 배치 엔진(SPOT_MAP) 그대로 재사용, 재배치 이력 있는 전형적 데코 |
| `bench` | decoration/1/$15 | CUSTOMIZABLE | 위와 동일 — 스팟 배치 데코 |
| `town-sign` | decoration/1/$40 | CUSTOMIZABLE | 위와 동일 |
| `cat` | animal/2/$20 | CUSTOMIZABLE | 위와 동일(동물도 스팟 배치) |
| `street-lamp` | decoration/2/$25 | CUSTOMIZABLE | 위와 동일 |
| `red-post-box` | decoration/2/$25 | CUSTOMIZABLE | 위와 동일 |
| `flower-garden` | nature/3/$30 | CUSTOMIZABLE | 위와 동일 |
| `book-shop` | house/3/$120 | **FIXED WORLD** | lane 구역을 정의하는 로트 자체 — OWNER DECISION A, 위치 고정·소유는 카탈로그 구매로 판정 |
| `puppy` | animal/4/$30 | CUSTOMIZABLE | 스팟 배치 데코 |
| `owl` | animal/4/$40 | CUSTOMIZABLE | 위와 동일 |
| `cafe` | house/5/$120 | **FIXED WORLD** | square 구역을 정의하는 로트 자체 — OWNER DECISION A |
| `stone-fountain` | decoration/5/$60 | **FIXED WORLD** | square 구역 중앙 고정 로트(50/55/16) — OWNER DECISION A 원문이 명시적으로 포함, 카테고리는 decoration이지만 위치는 건물급으로 고정 |
| `bridge` | special/6/$150 | **FIXED WORLD** | river 구역을 정의하는 로트, 길은 미구매여도 항상 다리를 건넘 |
| `english-school` | special/7/$150 | **FIXED WORLD** | school 구역을 정의하는 로트 자체 |
| `clock-tower` | special/8/$200 | **FIXED WORLD** | tower 구역을 정의하는 로트이자 세트 내 최고 랜드마크 |
| `shop-lamp`(레거시 데스크램프) | decoration/1/$60 | CUSTOMIZABLE | `townShop.js` 레거시 `shop-lamp`와 동일 id로 흡수된 항목, 기존 배치 엔진 그대로 |

**FUTURE 분류는 없음**: 17개 전 항목이 위 세 분류(RECONSIDER 1 / FIXED WORLD 6 / CUSTOMIZABLE 10) 중 하나로 이미 다뤄진다 — 카탈로그에 있지만 아직 세계관에서 자리를 못 찾은 항목은 없다.

---

## 4. LEARNING → ENVIRONMENT MATRIX

| 기존 학습 신호 | 파생 시각 상태 | 이미 렌더하는 컴포넌트 |
|---|---|---|
| gardenPoints(= cleared∪completed∪mastered 단어 수, 순수 파생값) | `gardenRichness(gardenPoints)` → `{stage: 0-4, windowsLit, ivy, birds}` | `src/utils/town/townScene.js` (`gardenRichness`, `GARDEN_STAGE_THRESHOLDS = [0,10,30,60,100]`) |
| gardenPoints ≥ 10/30/60/100 | 화단 성장 단계(stage 1~4, 씨앗→새싹→봉오리→만개) | `src/components/town/v2/TownAmbientLayer.jsx` (stage 렌더) |
| gardenPoints ≥ 30 | `windowsLit`(집 창문에 불빛) | `TownAmbientLayer.jsx` (`r.windowsLit` 분기) |
| gardenPoints ≥ 60 | `ivy`(담쟁이) | `TownAmbientLayer.jsx` (`r` 구조분해 값 사용) |
| gardenPoints ≥ 100 | `birds`(새 등장) | `TownAmbientLayer.jsx` (`r` 구조분해 값 사용) |
| (호출 지점) | `richness = gardenRichness(gardenPoints)` | `src/components/town/v2/TownScreenV2.jsx:163` |

**명시**: 새 화폐 없음, 새 DB write 없음. `gardenPoints`는 오늘 밤 구현이 그대로 재사용하는 순수 파생값이고(진행 데이터를 다시 세는 것일 뿐 별도 원장/테이블에 쓰지 않음), `gardenRichness()` 함수와 임계값 배열도 오늘 밤 구현 그대로다 — 이 섹션은 재구현을 제안하지 않고 기존 흐름을 표로 정리했을 뿐이다.

---

## 5. OWNER / VISITOR FUTURE ARCHITECTURE (design only — 신규)

**명시: 이 섹션 전체는 설계만이다. 지금 구현하지 않는다.**

### (a) 신규 SECURITY DEFINER RPC 개념

`get_town_shop_state_readonly(p_viewer_student_id, p_target_student_id)` — 함수 내부는 **엄격히 SELECT-only**: town 배치/소유/월드 상태를 읽어 반환할 뿐, mutating RPC(`purchase_town_item` 등)를 절대 호출하지 않는다. 권한 체크를 함수 첫 단계에서 수행 — 시작 범위는 **동일 `class_id`**(`student_class_assignments` 조인 테이블, `supabase_v2_9_student_class_assignments.sql`, `DATABASE.md` 2026-09-02 정정표 기준 **실제 프로덕션에 실행 완료**돼 있고 341행 anon 조회 가능한 상태로 확인됨 — 새 테이블을 만들 필요 없이 이미 있는 반 배정 관계를 그대로 재사용할 수 있다는 뜻)로 제한한다. 더 넓은 "친구" 소셜 그래프(반이 다른 학생끼리 서로의 마을 방문)는 그런 관계를 담을 테이블이 아직 전혀 없으므로 이번 설계에 포함하지 않고, §10의 미해결 항목으로 명시적으로 미룬다.

### (b) 왜 기존 세션-토큰 패턴이 이미 유리한 출발점인가

`api/grant-xp.js:80-81`의 기존 원칙 — "두 action 모두 studentId를 세션 토큰에서만 얻는다 — `req.body.studentId`는 어디서도 읽지 않는다(남의 studentId를 실어 대신 구매/조회시키는 경로 자체가 코드에 없다)" — 은 이미 "요청 바디에 실린 타인 ID로 그 사람 행세를 하는" 클래스의 버그를 구조적으로 봉쇄해 놓았다. Visitor 모드는 이 성질을 반드시 보존해야 한다: **뷰어 자신의 세션 토큰만 서버로 전송되고, 타깃(구경하려는 대상)의 토큰이나 자격증명은 클라이언트가 절대 가지고 있지 않는다.** `p_target_student_id`는 뷰어가 UI에서 "누구를 구경할지" 선택한 값을 평문 파라미터로 넘기는 것뿐이고, 그 값으로 무엇을 할 수 있는지(읽기 허용 여부)는 전적으로 RPC 내부 권한 체크(동일 class_id)가 결정한다 — 즉 target_student_id를 조작해도 "권한 없는 반의 타깃"이면 RPC가 빈 결과/거부를 반환할 뿐, 그 학생의 실제 소유/배치/PIN 어느 것도 노출되지 않는다.

### (c) 클라이언트 측 `mode: 'owner' | 'visitor'`

`TownScreenV2`에 `mode` 개념을 관통시킨다 — `visitor` 모드에서는:
- 모든 mutation 핸들러(구매/배치/이동/보관) 비활성화(호출 자체를 막음, 단순 UI disabled가 아니라 핸들러 자체가 no-op이어야 함)
- Shop/Inventory 진입점 완전히 숨김(렌더 트리에서 제외, CSS로 숨기는 방식 지양 — 존재 자체가 없어야 실수로라도 mutation 경로가 열리지 않음)
- 렌더 컴포넌트(`TownGroundLayer`/`TownPathLayer`/`TownFogLayer`/`TownObjectLayer`/`TownAmbientLayer`)는 **100% 그대로 재사용**, 다만 데이터 소스만 "내 progress_data" 대신 "RPC가 반환한 타깃의 읽기전용 스냅샷"으로 교체된다 — 새 렌더 로직을 만들 필요가 없다는 것이 이 설계의 핵심 장점

### (d) Visitor에게 절대 노출되면 안 되는 것

- 타깃 학생의 사용 가능 Paul Dollar 잔액(소유/배치 상태만 보여주면 되고, 잔액은 "돈 관리" 정보이지 "마을 구경" 정보가 아님)
- PIN/자격증명 컬럼 일체(규칙 11과 동일한 원칙 — 애초에 이 RPC는 그 컬럼들을 SELECT하지 않아야 함)
- 어떤 형태로든의 mutation capability(배치 이동, 구매, 삭제 트리거로 이어질 수 있는 어떤 반환 필드도 없어야 함 — 예: "이 아이템의 이동 가능 여부" 같은 편집용 메타데이터를 읽기전용 응답에 섞지 않는다)

### (e) 재확인

위 (a)~(d)는 전부 **설계 개념**이다. RPC 함수, class_id 기반 권한 체크, `mode` prop, UI 분기 어느 것도 이번 세션에서 코드로 작성되지 않았다 — "이런 아키텍처가 나중에 필요하다"는 것을 기록해 둘 뿐이다.

---

## 6. EXPLORE EXPANSION POINT (design only — 신규)

**제안**: 미래의 "Explore" 진입점(역/이정표류 요소)을 tower district의 **먼 쪽/상단 가장자리**, 즉 Clock Tower를 지나 길이 향하는 방향(§1 원문: "tower enters bottom-right(70%), ends at the tower's small square" — 길이 끝나는 바로 그 x≈70% 지점)에 놓는다. 이 위치는 정확히 Lv8에서 열리지만 아직 아무 콘텐츠가 없는 하늘/먼 언덕 여백(§2 Lv9/10 설명 참고) 안에 들어간다 — 기존 설계가 이미 "예약해 둔" 헤드룸을 그대로 쓰는 것이지, 새 heightUnits나 새 district를 추가하는 게 아니다.

**왜 재작업이 필요 없는가**:
1. **x좌표 재사용**: tower 밴드의 길 끝 x-position(70%)이 이미 코드(`PATHS`)에 실제 좌표로 존재한다 — Explore 이정표는 그 좌표를 그대로 진입/도착점으로 쓰면 된다.
2. **fog-treatment 패턴 재사용**: "레벨이 아직 안 됐으면 안개 지평선 뒤 실루엣만 보인다"는 패턴이 이미 매 district마다 동일하게 구현돼 있다(§2 표의 "앞으로의 예고" 열) — Explore도 콘텐츠가 실제로 만들어지기 전까지는 이 동일한 패턴으로 "아직 열리지 않은 먼 지점"처럼 흐릿하게 보여주면 된다. 새 시각 언어를 만들 필요가 없다.
3. **district 스택 불변**: Lv8까지의 6개 district 순서/heightUnits/scale 무엇도 바뀌지 않는다 — Explore는 tower 위 여백에 "추가되는" 것이지 기존 스택을 재배열하지 않는다.

**명시**: 지금 구현하지 않는다. Explore가 실제로 무엇을 담을지(콘텐츠/목적지)는 이 섹션에서 의도적으로 설계하지 않는다 — §10에 미해결로 남긴다.

---

## 7. MASTER ART DIRECTION + P0/P1/P2 ARTWORK

### 7.1 이미 확정된 카메라/조명/팔레트/그림자 규칙 (인용, 재도출 없음)

`FINAL_ARTWORK_SPEC_2026-09-16.md` §1 그대로:
- **카메라**: 3/4 top-down, 고정 elevation ≈30도(참고 이미지보다 조금 더 위에서 — 세로로 쌓인 6개 district가 서로를 가리지 않도록)
- **지평선**: tower 밴드 최상단에만 하늘이 걸림, Lv1~7은 하늘 없음(fog가 대신 가림), Lv8에 tower가 열려야 처음 하늘/먼 언덕 노출
- **광원**: 좌상단 고정 warm late-afternoon 단일 광원, 세트 전체(플레이트+스프라이트) 동일 방향
- **팔레트(9색 + 예외)**: 웜 크림 `#fdebd0`/`#f6e3c8`, 소프트 모스 `#cfe3c0`, 세이지 `#8fb37a`, 웜 스톤 `#d9d2c5`/`#b9ab95`, 머티드 네이비 `#1e2a5a`, 버건디 `#7a2e3a`, 웜 앰버 `#e0a73a`, 소프트 골드 `#c9a227`, 목재 브라운 `#8b6f3e` — 예외로 `decorations/red-post-box`는 전통 영국 우체통 빨강 유지
- **그림자**: 베이크된 방향성 캐스트 섀도 금지, 콘택트 섀도만(≤15% 불투명도)
- **스타일**: painterly, not photoreal(1.5절 — 참고 이미지 수준 디테일, IP/텍스트/이모지/하드 아웃라인 금지)

### 7.2 왜 P0/P1/P2 목록에서 `env/plate-*`를 전부 뺐는가

오늘 밤 아키텍처 변경으로 바닥/길/생울타리 지오메트리가 **영구 코드**(`townScene.js`의 `DISTRICTS`/`LOTS`/`SPOT_MAP`/`PATHS`, `src/components/town/v2/TownGroundLayer.jsx`/`TownPathLayer.jsx` 등)가 됐다 — 더 이상 AI로 굽는 배경판(`env/plate-home`/`env/plate-fog-horizon`/`env/plate-bookshop-lane` 등, `FINAL_ARTWORK_SPEC` §2.1~2.2 원안)이 필요 없다. 따라서 이번 개정된 P0/P1/P2는 **고립된 단일 오브젝트 스프라이트(건물/장식)만** 남기고 배경판 항목 전부를 뺀다.

### 7.3 개정 P0 (Lv1–3 신뢰도)

| asset_key | filename | canvas(master) | render(1x @W=358) | transparent | anchor | perspective/scale | variants | priority |
|---|---|---|---|---|---|---|---|---|
| `buildings/my-house` | my-house.webp | 768×640(FINAL_ARTWORK_SPEC 개정안) 또는 기존 128×160(이미 APPROVED/DEPLOYED — 재사용, 아래 참고) | 150×125(42%W, home scale 1.00) | YES | bottom-center | 세계관 기준 스프라이트(다른 모든 자산이 이 대비로 스케일됨) | `-lights`(P1, 이번 배치 제외) | **이미 배포됨 — 그대로 재사용** |
| `nature/tree` | tree.webp | 384×512 | 72×96(20%W) | YES | bottom-center | tree height ≈ 0.9×cottage height | 없음 | P0 |
| `nature/flower-garden` | flower-garden.webp | 384×192 | 64×32(18%W×8%) | YES | bottom-center | — | 없음 | P0 |
| `decorations/bench` | bench.webp | 320×224 | 47×33(13%W) | YES | bottom-center | — | 없음 | P0 |
| `decorations/street-lamp` | street-lamp.webp | 160×576 | 22×79(6%W, height≈0.6×cottage) | YES | bottom-center | — | `-on`(P1, 제외) | P0 |
| `decorations/red-post-box` | red-post-box.webp | 160×352 | 22×48(6%W) | YES | bottom-center | 팔레트 예외(전통 빨강) | 없음 | P0 |
| `buildings/book-shop` | book-shop.webp | 704×704 | 스케일 전 129×129 → lane scale 0.86 적용 시 111×111(36%W) | YES | bottom-center | tree 대비 참고, lane 로트 고정 위치 | `-lights`(P1, 제외) | P0 |

**my-house 참고**: `PAUL_TOWN_ASSET_CONTRACT.md`상 `buildings/my-house`는 이미 **DEPLOYED**(128×160, 세계관 기준 world-defining, Batch1)이고 오늘 밤 구현 화면에도 그대로 자동 표시되고 있다. `FINAL_ARTWORK_SPEC`은 owner 검토 후 "OWNER-CORRECTED FINAL" 프롬프트(768×640, 42%W 42% footprint로 확대)로의 재생성을 제안해 둔 상태지만, 이는 별도 결정 대기 항목이지 지금 배포된 my-house를 못 쓴다는 뜻이 아니다 — P0 목록에서는 "이미 배포됨, 그대로 재사용" 상태로 표기했다.

### 7.4 개정 P1 (Lv5–6)

| asset_key | filename | canvas(master) | render(스케일 적용) | anchor | variants | priority |
|---|---|---|---|---|---|---|
| `buildings/cafe` | cafe.webp | 704×704 | 121×121 → square scale 0.76 시 92×92 | bottom-center | `-lights`(P1) | P1 |
| `decorations/stone-fountain` | stone-fountain.webp | 384×384 | 57×57 → square scale 0.76 시 44×44 | bottom-center | 없음 | P1 |
| `decorations/town-sign` | town-sign.webp | 256×384 | 32×48(9%W) → 배치 밴드 scale 적용 | bottom-center | 없음 | P1 |
| `special/bridge`(구 `buildings/bridge`) | bridge.webp | 960×480 | 157×78 → river scale 0.70 시 110×55 | bottom-center | 없음(창문 없음) | P1 |

### 7.5 개정 P2 (Lv7–8/미래)

| asset_key | filename | canvas(master) | render(스케일 적용) | anchor | variants | priority | 비고 |
|---|---|---|---|---|---|---|---|
| `special/english-school` | english-school.webp | 832×704 | 143×121 → school scale 0.64 시 92×77 | bottom-center | `-lights`(P1) | P2 | — |
| `special/clock-tower` | clock-tower.webp | 384×1024 | 57×157(16폭×44높이) → tower scale 0.56 시 32×88 | bottom-center | `-lights`(P1) | P2 | 세트 내 최고 랜드마크 |
| `animals/cat`·`animals/puppy`·`animals/owl` | 기존 파일명 유지 | 기존 매니페스트 캔버스 유지(144×108/144×108/144×192, 2x) | 기존 렌더 유지 | bottom-center | `-blink`(P2) | P2 | **TEMPORARY PLACEHOLDER**(2026-09-16 lead override) — 이미 존재/DEPLOYED이지만 더 이상 스타일 앵커가 아니며 재생성 대상으로 이미 플래그돼 있음(이번 문서가 새로 발견한 사항 아님, 기존 결정 인용) |
| (신규) Explore 이정표/역 자산 | 미정(§6 참고) | 미정 | 미정 | bottom-center(예상) | 없음 | P2/future | §6에서 위치만 제안, 콘텐츠/디자인은 미착수 |

**모든 항목 공통값**: 3/4 top-down ≈30도, 좌상단 warm 광원, ≤15% soft contact shadow, 공용 9색 팔레트(예외: red-post-box 전통 빨강 유지), transparent PNG/WEBP, bottom-center anchor, my-house를 세계관 기준 스케일 레퍼런스로 삼아 상대 크기 산정(§1.3 상대 스케일 가이드: cottage 42 · tree 20 · flower-garden 18×8 · bench 13 · street-lamp 6 · red-post-box 6 · town-sign 9 · cat/puppy 8 · owl 6 · Book Shop 36 · Café 34 · fountain 16 · bridge 44 · school 40 · clock tower 16×44).

---

## 8. VISUAL MOCK STRUCTURE

**새 목업을 만들지 않는다** — 이미 이 요구를 충족하는 두 산출물이 존재한다:

1. **인터랙티브 와이어프레임**: `docs/design/town/wireframe/paul-town-world-wireframe.html` — Playwright로 검증됨(콘솔 경고 0, 오버플로 0), 3라운드 독립 리뷰를 거쳐 확정된 지오메트리.
2. **오늘 밤 실제 구현 스크린샷**: 360/390/430px × Lv1/3/5/8, 총 5장, 세션 스크래치패드에 저장 — 코드가 실제로 렌더한 연속된 마을(placeholder 아트, 실제 최종 아트워크는 아직 없음)을 보여준다.

이 둘이 이미 "구성(composition)"을 증명한다 — 최종 아트워크가 아니라 구성 검증이 요청의 목적이었고, 그 목적은 이미 충족됐다.

---

## 9. PM ACCEPTANCE TEST

1. **하나의 연속된 마을처럼 보이는가?** YES — Playwright 스크린샷(360/390/430px × Lv1/3/5/8) 5장이 끊김 없이 이어진 6-district 세로 스택을 보여주고, district 간 길이 고정 진입/이탈 x좌표로 이어짐이 확인됨.
2. **최종 수준 아트워크로 보이는가?** **PARTIAL** — 구성/지형/길은 실제 코드로 확정됐지만, 건물은 여전히 placeholder 도형이다(my-house 하나만 실제 승인 아트 사용). §7의 P0/P1/P2가 실제로 생성·배선돼야 완전한 YES가 된다.
3. **집이 세계관을 정의하는 랜드마크로 보이는가?** YES — my-house가 42%W(스케일 기준 1.00)의 로트 고정 건물로 스택 최하단에 앉아 있고, 다른 모든 자산이 이 크기 대비로 산정됨(§1.3).
4. **레벨업마다 새 공간이 열리는 느낌이 있는가?** YES — §2 표대로 Lv1/3/5/6/7/8마다 새 district가 실제로 순차 해금됨(build/e2e 검증 완료).
5. **학습이 눈에 보이게 반영되는가?** YES — gardenRichness(gardenPoints) 축이 stage/windowsLit/ivy/birds로 독립적으로 이미 렌더됨(§4), 새 DB write 없이 기존 진행 데이터를 파생.
6. **모바일에서 깨지지 않는가?** **PARTIAL(사실상 YES에 가까움, 단서 有)** — 360/390/430px 3개 폭 × 4개 레벨에서 오버플로 0/콘솔 에러 0로 확인됐으나, 이는 placeholder 도형 기준 검증이다. 실제 P0/P1/P2 아트워크가 들어간 뒤 동일 폭에서 재검증이 한 번 더 필요하다(아트 자체가 없어 "완전히 깨지지 않는다"를 최종 아트 기준으로는 아직 증명할 수 없음).
7. **기존 학생 데이터/economy를 건드리지 않는가?** YES — DB WRITE 0, SQL 0, 경제/카탈로그/가격/레벨 변경 0, `paulTownV2` 플래그 여전히 false, V1/Kinney/production 무접촉(오늘 밤 세션 안전 요약).
8. **고정 로트와 커스터마이즈 가능 아이템이 명확히 구분되는가?** YES — §3에서 17개 전 카탈로그 아이템이 FIXED WORLD(6)/CUSTOMIZABLE(10)/RECONSIDER(1)로 실측 근거와 함께 분류됨.
9. **미래 확장(Explore/Visitor)이 기존 구조를 재작업하게 만드는가?** NO — §5/§6 둘 다 기존 좌표·컴포넌트·패턴을 그대로 재사용하도록 설계됨(새 heightUnits 없음, 새 렌더 컴포넌트 없음).
10. **미해결 항목이 정직하게 남아있는가?** YES — §10에 4개 항목이 숨김 없이 명시됨.

---

## 10. OPEN OWNER DECISIONS

- **`british-cottage` 카탈로그 아이템의 역할**(이전 세션에서 이월, 여전히 미해결) — my-house(항상 무료, 카탈로그 외)와 별개인 $80 house 아이템이 새 세계관에서 무엇을 하는지 소유자 결정 필요.
- **"펜스"가 신규 카탈로그 아이템이 되는가**(이전 세션에서 이월, 여전히 미해결) — 이번 문서에서 새로 다루지 않음.
- **Visitor 모드 권한 범위**(§5, 신규) — 동일 class_id로 시작 범위를 제안했으나, 반이 다른 학생 간 "친구" 방문 허용 여부는 소셜 그래프 테이블이 아예 없어 더 큰 설계 결정이 필요.
- **Explore 기능의 실제 콘텐츠/목적지**(§6, 신규) — 위치(tower 너머, x≈70%)만 제안했고, 그 지점에서 학생이 실제로 무엇을 하게 될지는 의도적으로 설계하지 않았다.
