# Paul Town — 아트워크 자산 캐노니컬 계약 (Canonical Asset Contract)

_신규: 2026-09-14. 이 문서는 Paul Town 모든 P0 자산(현재 19개: 카탈로그
17개 + `buildings/my-house` + `nature/flower-garden`은 카탈로그에 있으므로
실제로는 카탈로그 17개 + my-house = 18개 P0 대상 + 정원 5단계는 별도
ambient 자산)에 대한 **단일 출처(single source of truth)**다. 지금까지
`assetManifest.js`(캔버스/앵커/발자국/변형 사실) + `townCatalog.js`(가격/
레벨/카테고리) + `V2A_ARTWORK_SPEC_FINAL.md`/`V2A_ARTWORK_PROMPT_PACK.md`/
`V2A_BATCH2_COMMISSION_PACK.md`(팔레트/조명/텍스트 규칙)로 흩어져 있던
사실을 한 표로 통합한다.

**이 문서가 대체하는 것이 아니라 보완하는 것**: 기존 4개 문서
(`V2A_ARTWORK_SPEC_FINAL.md`/`V2A_ASSET_SPEC.md`/
`V2A_ARTWORK_PROMPT_PACK.md`/`V2A_BATCH2_COMMISSION_PACK.md`)는
append-only 원칙(`CLAUDE.md` 규칙 13)에 따라 그대로 보존한다 — 삭제/재작성
없음. 이 문서는 그 4개 문서의 "지금 유효한 결론"만 한 표로 압축한 신규
캐노니컬 계약이며, 향후 세션은 개별 항목의 구체 프롬프트/근거가 필요할
때만 원본 4개 문서를 참조하고, "지금 이 asset_key의 계약이 무엇인가"는
이 문서 하나만 보면 되도록 하는 것이 목적이다. 코드(`assetManifest.js`)와
이 문서가 다르면 **코드가 항상 이긴다** — 이 문서는 코드+원본 스펙 문서를
읽고 파생된 요약이지 별도의 권위가 아니다.

## 0. 전역 공용 규칙 (모든 P0 자산에 동일 적용)

19개 항목마다 반복하지 않고 여기 한 번만 기록한다. 개별 자산 표는 이
규칙에서 벗어나는 예외만 별도 명시한다.

| 항목 | 값 |
|---|---|
| **Perspective** | 3/4 top-down 각도 ~30도, soft painterly 스타일, no outlines |
| **Lighting** | Light from top-left (전 자산 동일 광원 방향) |
| **Alpha requirement** | 실제 RGBA 알파 채널 필수 — `mode=RGBA`이면서 코너/배경 영역이 진짜 `alpha=0`이어야 함. RGB(알파 없음) + 검정/흰색 baked 배경은 항상 REGEN_REQUIRED 사유(안전 처리로 못 고침, §3 참고) |
| **Transparent margin** | 콘텐츠 바운딩박스 기준 전 방향 ≥4%(실제 프로덕션 관행은 crop-to-content 후 ~5~8% repad, batch2/3 실측 사례 다수) |
| **Shadow rule** | Baked cast shadow 없음(런타임 그림자는 CSS/엔진 담당). 예외: `special/bridge`처럼 "faint muted-navy contact shadow"가 스펙에 명시된 경우만 허용 |
| **Anchor** | `bottom-center` (19개 전부 동일) |
| **Fallback** | `townAsset(assetKey)`가 `TOWN_ASSETS`에 키 없으면 `null` 반환 → 호출부(`TownGrid`/`TownShopPanel`/`TownInventory`)가 항상 `TOWN_ITEM_META`의 `emoji`로 폴백(기능 non-breaking 보장, `src/assets/town/index.js` 헤더 주석과 동일 사실) |
| **배경 격리** | Isolated on transparent background — 연못/화단/포장/추가 소품 등 "장면(scene)"이 아니라 단일 오브젝트만 |
| **팔레트 베이스** | 공용 7색 팔레트(버건디 `#7a2e3a`/소프트골드 `#c9a227`/웜크림 `#fdebd0`/우드브라운 `#8b6f3e`/머티드네이비 `#1e2a5a`/모스그린 `#8fb37a`/웜앰버 `#e0a73a`) — 개별 자산은 이 중 일부를 조합. 예외는 표에 명시(예: red-post-box는 전통 영국 우체통 빨강 유지) |

## 1. Lifecycle 상태값

```
SPEC_ONLY       — 스펙/매니페스트만 존재, 후보 이미지 없음
CANDIDATE       — 후보 이미지 존재, 아직 검증 전
REGEN_REQUIRED  — 검증 결과 불합격(C/D 등급), 재생성 대기
APPROVED        — 검증 통과(A/B 등급), 아직 export/wire 안 됨
WIRED           — src/assets/town/index.js TOWN_ASSETS에 연결 + 커밋 완료(아직 미merge)
MERGED          — main에 merge됨(아직 프로덕션 미확인)
DEPLOYED        — 프로덕션 배포·번들 해시 실측 확인 완료
DEFERRED        — 여러 차례 재제출에도 REGEN_REQUIRED 사유가 반복 해소되지
                  않아 현재 배치 범위에서 제외, 후속 배치(V2 아트워크
                  백로그)로 이월. SPEC_ONLY와 달리 "후보가 여러 번 있었지만
                  전부 불합격했다"는 이력을 구분해 남긴다.
```

## 2. 자산 표 (2026-09-14 기준, PR #52 배포 완료 + Batch 3 진행 중 스냅샷)

| asset_key | 파일명 | 카테고리 | 1x | 2x | aspect | footprint | 상대 스케일 | 팔레트 | 텍스트 허용 | 소품 허용 | lit/unlit | level | price | 애니메이션/야간 변형 | **lifecycle** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `buildings/my-house` | my-house.webp | house(카탈로그 외, 고정 소유) | 128×160 | 256×320 | 4:5 | lg | 세계관 기준(Batch1) | 미기록(Batch1 world-defining, 프롬프트팩 없음) | NO | 미기록 | 주간 베이스 | — | — | `-lights` 오버레이(P1, 선택) | **DEPLOYED** |
| `buildings/british-cottage` | british-cottage.webp | house | 128×160 | 256×320 | 4:5 | lg | 세계관 기준(Batch1) | 미기록(Batch1 world-defining) | NO | 미기록 | 주간 베이스 | 1 | 80 | `-lights` 오버레이(P1) | **DEPLOYED** |
| `buildings/book-shop` | book-shop.webp | house | 128×160 | 256×320 | 4:5 | lg | tree 대비 ~2.4배 높이 | 버건디+소프트골드+웜크림(#7a2e3a,#c9a227,#fdebd0) | NO(빈 상점 간판 영역) | 원형 창문만 | 주간 베이스(작은 창문 warm-lit) + `-lights` 오버레이(P1) | 3 | 120 | `-lights`(P1) | **DEPLOYED** |
| `buildings/cafe` | cafe.webp | house | 128×160 | 256×320 | 4:5 | lg | book-shop과 동급 | 웜앰버+웜크림(#e0a73a,#fdebd0) — 실제 승인본은 네이비 지붕+포레스트그린 트림(명시적 편차 허용, handoff 기록) | NO | 야외 테이블/파라솔(프레임 안) 선택 | 주간 베이스(작은 창문 warm-lit) + `-lights`(P1) | 5 | 120 | `-lights`(P1) | **DEPLOYED** |
| `special/bridge` | bridge.webp | special | 160×80 | 320×160 | 2:1 | lg | 수평 실루엣, 수직 tower mass 없음 | 우드브라운+웜크림+페인트 콘택트섀도(#8b6f3e,#fdebd0,#1e2a5a) | NO | 없음(연못/램프/조경 금지) | 해당 없음(창문 없음, `-lights` 제외 대상) | 6 | 150 | 없음 | **WIRED**(art/batch3 브랜치, 미merge) |
| `special/english-school` | english-school.webp | special | 128×154 | 256×308 | 5:6 | lg | 건물군 표준 | 웜크림+모스그린+우드트림(#fdebd0,#cfe3c0,#8b6f3e) | NO(아이콘 전용 방패 문장 허용) | 최소(과도한 화단/현수막/칠판 금지) | 주간 베이스 + `-lights`(P1) | 7 | 150 | `-lights`(P1) | **WIRED**(art/batch3 브랜치, 미merge) |
| `special/clock-tower` | clock-tower.webp | special | 128×256 | 256×512 | 1:2 | lg | 세트 내 최고 랜드마크(가장 큼) | 머티드네이비+소프트골드 링(#1e2a5a,#c9a227) — **편차**: 승인 후보는 몸체가 웜크림/탄색 석재(지붕·트림만 네이비), cafe 선례와 동일한 종류의 명시적 편차(재생성 요청 안 함, 운영자 확인 권장) | **NO**(숫자·문구·"PAUL TOWN" 간판 전부 금지, 시계 얼굴은 상징적 무문자만) | 최소(화단/펜스/램프 등 지상부 장식 금지) | 주간 베이스 + `-lights`(P1) | 8 | 200 | `-lights`(P1) | **WIRED**(clock tower2.png — art/batch3 브랜치에 배선·커밋 완료, PAUL TOWN 간판 없음, 숫자 없음(눈금 표시만), 지상부 장식 없음, 콘텐츠 종횡비 0.487≈1:2 정확) |
| `nature/tree` | tree.webp | nature | 96×128 | 192×256 | 3:4 | md | 스케일 기준점(다른 모든 자산이 이 나무 대비로 비교됨) | 미기록(Batch1 world-defining) | NO | 미기록 | 해당 없음 | 1 | 10 | 없음 | **DEPLOYED** |
| `nature/flower-garden` | flower-garden.webp | nature | 96×64 | 192×128 | 3:2 | md | tree보다 명확히 낮고 넓음 | 모스그린+소프트골드 꽃 포인트(#8fb37a,#c9a227) | NO | 없음 | 해당 없음 | 3 | 30 | 없음 | **SPEC_ONLY**(이번 배치 범위 밖, 후보 미제출) |
| `decorations/stone-fountain` | stone-fountain.webp | decorations(카탈로그 규칙상, nature 그룹 소속) | 72×72 | 144×144 | 1:1 | sm | tree보다 명확히 작음 | 머티드네이비+웜크림+모스 악센트(#1e2a5a,#fdebd0,#8fb37a) | NO | 없음(전체 광장/화단/대형 기둥 금지) | 잔잔한 물(격렬한 분사 금지) | 5 | 60 | 없음 | **WIRED**(fountain2.png — art/batch3 브랜치에 배선·커밋 완료, 단일 1단 분수·잔잔한 물·완전 투명 배경) |
| `nature/garden-stage-0..4` | garden-stage-N.webp | nature(ambient, 카탈로그 외) | 64×64 | 128×128 | 1:1 | null(patches) | 5단계 성장 진행 | 미기록 | NO | 미기록 | 해당 없음 | — | — | 5단계 자체가 진행 애니메이션 | **DEPLOYED**(5개 전부) |
| `decorations/bench` | bench.webp | decorations | 72×48 | 144×96 | 3:2 | sm | 소형 | 우드브라운+머티드네이비 옅은 악센트(#8b6f3e,#1e2a5a) | NO | **없음**(램프/간판/책/꽃/화분/새/포장/배경 장식 전부 금지 — 벤치 단독) | 해당 없음 | 1 | 15 | 없음 | **DEFERRED**(2026-09-15, 운영자 결정 — Batch 3에서 제외, V2 아트워크 백로그로 이월. 사유: bench1/3/4/5/6/7/8/9/10/"bench 10"(11차 재제출) 전부 동일 계열 baked 배경 글로우/비네트 결함, 안전 처리(crop/repad)로 제거 불가함이 §3 "조사했지만 자동화 불가"에 기록된 3종 자동 탐지 실패와 함께 반복 확인됨. bench5/6/9는 벤치+가로등 2오브젝트 합성이라 단일 오브젝트 요건도 위반(6=5 바이트 동일 중복). bench7/8/9/10부터 단일 오브젝트 구도·종횡비(3:2 근접, bench7 실측 1.46)는 정확했으나 글로우만 11차까지 미해결. 재개 조건: 배경 없는 순수 컷아웃(글로우/비네트 전혀 없는) 재출력) |
| `decorations/town-sign` | town-sign.webp | decorations | 72×108 | 144×216 | 2:3 | sm | 소형 | 우드브라운+버건디 악센트(#8b6f3e,#7a2e3a) | **NO(완전히 빈 표지판 면, 텍스트/아이콘/"PAUL TOWN" 전부 금지)** | 최소(모던한 지지대만, 과도한 화단/포장 금지) | 해당 없음 | 1 | 40 | 없음 | **WIRED**(art/batch3 브랜치, 미merge) |
| `decorations/shop-lamp` | shop-lamp.webp | decorations | 72×144 | 144×288 | 1:2 | sm | 소형 장식류 표준 | 우드브라운+소프트골드 트림(#8b6f3e,#c9a227) | NO | 없음(벽걸이 브래킷/간판/화분 결합 금지 — **독립형 지주(post)형, 벽부착 아님**, `V2A_BATCH2_COMMISSION_PACK.md` 확인됨) | **UNLIT/OFF 베이스 필수**(1차 납품은 unlit만) | 1 | 60 | 없음(-on 변형 없음) | **WIRED**(lamp6.png=lamp7.png 바이트 동일 — art/batch3 브랜치에 배선·커밋 완료, 독립형 지주, 유리창 중성색(웜톤 없음)으로 unlit 확인, 배경 외부 전 지점 alpha=0 확인(halo 없음)) |
| `decorations/street-lamp` | street-lamp.webp | decorations | 72×144 | 144×288 | **1:2 vs 1:2.5 — 문서 간 불일치, 아래 각주 참고** | sm | 장식류 중 가장 슬림/최장신 | 우드브라운 또는 머티드네이비+소프트골드 헤드(#8b6f3e,#1e2a5a,#c9a227) | NO | 없음(**독립형 지주형, 벽부착 아님**) | **UNLIT/OFF 베이스 필수**(-on 점등 변형은 P1, 이번 범위 밖) | 2 | 25 | `-on`(P1, 범위 밖) | **WIRED**(street light1.png — 독립형 지주(벽부착 아님)·유리창 실측 중성색(예: (231,232,230)/(249,249,247), 웜앰버 톤 없음 — unlit 확인)·배경 외부 전 지점 alpha=0(halo 없음)·콘텐츠 종횡비 0.19(계약 0.40보다 훨씬 슬림하지만 "장식류 중 가장 슬림/최장신" 취지에는 부합, 절단 없이 램프 전체 포함 확인됨). "street lamp and bench.png" 합성 이미지에서 분리한 동일 계열 후보로도 교차 확인(같은 lit/unlit 판정 재현). shop-lamp(lamp6.png)와는 다른 파일이라 "shop-lamp보다 슬림/장신" 요구 충돌 없음. art/batch3 브랜치에 배선·커밋 완료) |
| `decorations/red-post-box` | red-post-box.webp | decorations | 72×108 | 144×216 | 2:3 | sm | 소형 | **팔레트 예외 — 전통 영국 우체통 빨강 유지**(공용 7색 대체 안 함) + 소프트골드 트림(#c9a227) | NO | 없음 | 해당 없음 | 2 | 25 | 없음 | **DEPLOYED** |
| `animals/cat` | cat.webp | animals | 72×54 | 144×108 | 4:3 | sm | 소형 | 공용 팔레트 내 자연스러운 털색 | NO | 없음(사실적 얼굴 디테일 금지) | 해당 없음 | 2 | 20 | `-blink`(P2, 범위 밖) | **DEPLOYED** |
| `animals/puppy` | puppy.webp | animals | 72×54 | 144×108 | 4:3 | sm | 소형 | 공용 팔레트 내 자연스러운 털색 | NO | 없음 | 해당 없음 | 4 | 30 | `-blink`(P2, 범위 밖) | **DEPLOYED** |
| `animals/owl` | owl.webp | animals | 72×96 | 144×192 | 3:4 | sm | 소형(cat/puppy보다 세로로 김) | 머티드네이비+우드브라운+웜크림 가슴(공용 팔레트 내) | NO | **없음(나뭇가지/횃대 소품 금지 — 완전 독립 포즈)** | 해당 없음 | 4 | 40 | `-blink`(P2, 범위 밖) | **DEPLOYED** |

**각주 — `decorations/street-lamp` 캔버스/종횡비 불일치(정직하게 기록, 임의 해결 안 함)**:
`assetManifest.js` 92행은 캔버스를 `shop-lamp`와 동일한 72×144(픽셀
비율 정확히 1:2)로 선언하면서 `aspectRatio` 필드 값은 `'1:2.5'`로 되어
있고, `V2A_ARTWORK_SPEC_FINAL.md`의 렌더 크기도 36×90(1:2.5 비율)로
캔버스 선언과 어긋난다 — `V2A_BATCH2_COMMISSION_PACK.md` 115~119행에서
이미 발견·기록된 문서 간 불일치이며 이 문서가 새로 발견한 것이 아니다.
**이 계약 문서는 이 불일치를 해결하지 않는다** — 규칙 1번("문서가
불일치하면 추측하지 말고 충돌을 보고")에 따라, street-lamp의 export 시
`aspectRatio` 필드(`1:2.5`, 더 슬림한 실루엣)를 우선 기준으로 삼되(다른
모든 장식류 프롬프트가 "가장 슬림/최장신"이라고 서술하는 것과 일치하므로),
캔버스 필드(72×144)의 코드 수정 여부는 운영자 판단이 필요한 별도 결정
사항으로 남긴다.

## 2.5. Batch 3 클로즈아웃(2026-09-15, 운영자 결정)

목표 8개 자산 중 **7개 배송**(special/bridge, special/english-school,
special/clock-tower, decorations/town-sign, decorations/shop-lamp,
decorations/street-lamp, decorations/stone-fountain) — 전부 WIRED,
art/batch3-remaining-town-assets-2026-09-14 브랜치에 커밋 완료.
**decorations/bench 1개는 DEFERRED** — 11차 재제출까지 동일한 baked
배경 글로우/비네트 결함이 해소되지 않아(§3 "조사했지만 자동화 불가"
참고, 자동 탐지 3종 전부 신뢰 불가로 결론) 운영자가 이번 배치에서
제외하고 V2 아트워크 백로그로 이월하기로 결정. bench는 벤치 없이
플레이스홀더 없이 카탈로그에 그대로 남고(이모지 폴백 유지), 별도
후속 배치에서 재시도한다. 이번 배치는 경제/가격/레벨/DB/플래그
무변경 — 순수 아트워크 자산 추가만.

**자동화 가능(객관적 사실, §0 공용 규칙 + 위 표 대조로 기계 판정 가능)**:
실제 알파 채널 존재 여부, 완전투명 코너 확인, 콘텐츠 바운딩박스 기준
여백 %, 1x/2x 치수, aspect ratio(콘텐츠 크롭 후), 파일명, 중복 파일
해시, `assetManifest.js` 내 asset_key 유일성, PNG/WebP 유효성(디코드
가능 여부), 매니페스트 커버리지(예상 4파일 세트 존재), 고아 자산 탐지
(매니페스트에 없는 파일).

**주관 검증 필수(코드/스크립트로 판정 불가, 사람 또는 비전 모델의 시각
검토 필요)**: 영국 스토리북 톤 일관성, 원근/시점, 상대적 스케일감,
과도한 배경/소품 여부, 원치 않는 텍스트/아이콘(OCR 유사 판단 필요),
부적절한 소품 조합(예: 벤치+램프+간판 결합), 조명 방향 일관성, 저작권
캐릭터 유사성, 아동 친화적 시각 품질. 이번 세션에서 반려된 8/8 초기
후보(bridge/english-school/clock-tower/bench/town-sign/shop-lamp/
street-lamp/stone-fountain)는 전부 이 "주관 검증" 카테고리에서
발견됐다 — 치수/알파 등 객관적 계약은 대부분 만족했지만 텍스트·장면
과다·점등 상태 같은 주관적 위반이 실제 반려 사유였다.

**조사했지만 자동화 불가로 결론난 항목 — 정직하게 기록(2026-09-14)**:
`decorations/bench` 4~8차 후보가 반복적으로 "캔버스 전역에 걸친 은은한
방사형 글로우/비네트"로 반려됐다. 이를 객관적으로 자동 탐지하려고 3가지
방식을 실측 시도했으나 전부 신뢰할 수 없는 것으로 판명됐다:
1. **partial-alpha 비율**(전체 픽셀 중 완전투명도 완전불투명도 아닌
   비율) — bench 결함 사례는 1.8~3.9%였지만, 이미 배선·검증 완료된 정상
   자산 `special/bridge`(잎/덩굴 등 복잡한 윤곽선)도 동일 지표가 3.88%로
   측정돼 구분이 불가능했다.
2. **strict(alpha>128) vs loose(alpha>4) 바운딩박스 면적 비율** — glow
   결함 사례와 정상 사례 전부 1.003~1.007로 사실상 동일했다(바운딩박스는
   이미 객체 자체가 캔버스 대부분을 차지하면 glow가 그 안에 있어도
   박스 크기 자체는 거의 안 늘어남).
3. **"불투명(alpha>200) 영역을 N px 팽창시킨 뒤, 그 밖에서 alpha>10인
   픽셀 비율"**(거리 기반) — 팽창 반경 5~41px, 임계 alpha 10~30 전
   조합에서 결함 사례·정상 사례 전부 0.000%로 측정돼 전혀 구분되지
   않았다(glow가 객체와 시각적으로 끊김 없이 연속 그라디언트로
   이어지기 때문으로 추정).
결론: 이 특정 결함 유형(은은한 baked 배경 글로우/비네트)은 현재 알려진
간단한 픽셀/알파 통계로는 자동 플래깅이 불가능하다 — 억지로 임계값을
꿰맞추면 정상 자산(복잡한 윤곽선)을 오탐하거나 실제 결함을 놓친다.
향후 세션이 같은 접근을 반복 시도해 시간을 낭비하지 않도록 이 3가지
실패 사례를 남긴다. 더 나은 접근이 필요하다면 연결요소(connected
component) 분석이나 소형 비전 모델 판정 같은 더 무거운 방법이 필요할
것으로 보이며, 그 전까지는 §3의 "사람의 시각 검토"에 전적으로 의존하는
것이 정직한 현재 상태다.

## 4. 표준 export 파이프라인(허용된 안전 처리만)

APPROVED 판정 후 실제 처리 절차(batch2/batch3에서 실제로 반복 검증된
방식):

1. 소스를 RGBA로 열고 `getbbox()`로 콘텐츠 바운딩박스 크롭.
2. 목표 canvas(1x/2x)에 대해 여백 ≥4%(실무 기준 5.5%)를 두고 종횡비
   유지 축소.
3. 투명 캔버스에 중앙 배치 후 PNG + WebP(무손실) 각각 1x/2x 총 4파일
   export.
4. `src/assets/town/index.js`에 import + `TOWN_ASSETS` 키 추가(2줄).
5. `assetManifest.js`/`townCatalog.js`는 사전에 이미 정의돼 있으면
   무변경(신규 P0 카탈로그 항목만 추가 필요).

**절대 하지 않는 것**: 크롭/리패딩/리사이즈/알파 정규화/포맷 변환을
넘어서는 재작업(예: 텍스트 지우기, 소품 지우기, 배경 색 키잉/제거,
조명 재작업) — 이런 결함은 전부 REGEN_REQUIRED로 분류하고 원본 재생성을
요청한다(§3 원칙과 동일).
