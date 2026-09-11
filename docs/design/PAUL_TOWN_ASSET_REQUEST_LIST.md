# Paul Town 일러스트 발주 리스트 — 2026-09-11

_이 문서는 `docs/design/PAUL_TOWN_ASSET_SPEC.md`(스타일 가이드/팔레트/폴더
구조/연결 메커니즘의 단일 원천)를 대체하지 않는다. 스펙 문서의 세부
규칙(3/4 정면 뷰, 고정 7색 팔레트, 그림자 규칙, IP 가드레일 상세)은 여기서
재설명하지 않고 참조만 한다 — 실제 발주(외주/이미지 생성 파이프라인)에
바로 넘길 수 있는 "요청 항목 리스트 + 배치 맥락 + 그리드 가독성 근거 +
납품 체크리스트"만 이 문서의 역할이다. 코드/자산 파일은 이 작업에서 만들지
않는다._

## 1. 현재 상태 (한 줄)

`TOWN_ASSETS = {}`(`src/assets/town/index.js:12`)로 21종 아이템 전부가
이모지 폴백으로 렌더되는 중이며, `assetKey` 조회 구조는 이미 완성돼 있어
파일만 채우면 되는 상태다 — Paul 캐릭터 얼굴은 기존 21종
(`src/assets/paul/*.png`)을 그대로 재사용하며 이번 발주에서 신규 생성하지
않는다.

## 2. ASSET REQUEST LIST

`asset_key`는 `docs/design/PAUL_TOWN_ASSET_SPEC.md` §4/§6과 동일한 값을
그대로 파일 경로로 쓴다. 총 21행(아이템 17 + 배경 타일 3 + 선택 프레임 1).

| asset_key | subject | dimensions/aspect | transparent background | visual direction | Town placement | priority |
|---|---|---|---|---|---|---|
| `nature/tree` | 나무 | 256×256 @1x / 512×512 @2x WebP ≤20KB, 1:1 | YES | 영국 시골 마을 한켠에 서 있는 둥근 수관의 따뜻한 녹색 나무, 카툰풍 부드러운 아웃라인 | 1×1 cell sprite | P1 |
| `animals/cat` | 고양이 | 256×256 @1x / 512×512 @2x WebP ≤20KB, 1:1 | YES | 마을 고양이 특유의 여유로운 앉은 자세, 큰 눈의 카툰 라운드 스타일 | 1×1 cell sprite | P1 |
| `decorations/bench` | 벤치 | 256×256 @1x / 512×512 @2x WebP ≤20KB, 1:1 | YES | 목재 톤에 크림색 하이라이트가 있는 아담한 공원 벤치 | 1×1 cell sprite | P1 |
| `buildings/british-cottage` | 영국 코티지 | 256×320 @1x / 512×640 @2x WebP ≤20KB, 1:1.2 | YES | 스톤/브릭 텍스처 벽에 담쟁이 넝쿨과 노란 불빛 창문이 있는 아늑한 영국풍 오두막 | building 1×1 with taller canvas | P1 |
| `decorations/street-lamp` | 가로등 | 256×256 @1x / 512×512 @2x WebP ≤20KB, 1:1 | YES | 클래식 철제 프레임에 앰버 불빛이 켜진 저녁 마을 가로등 | 1×1 cell sprite | P1 |
| `decorations/red-post-box` | 빨간 우편함 | 256×256 @1x / 512×512 @2x WebP ≤20KB, 1:1 | YES | 영국풍 고전 필러 박스 형태의 버건디 빨강 원통형 우체통 | 1×1 cell sprite | P1 |
| `nature/flower-garden` | 꽃밭 | 256×256 @1x / 512×512 @2x WebP ≤20KB, 1:1 | YES | 녹색 베이스 위에 다색 꽃이 옹기종기 모인 작은 화단 | 1×1 cell sprite | P1 |
| `backgrounds/ground-grass` | 잔디 바닥 타일 | 512×512 seamless WebP ≤60KB | N/A(배경 타일) | 따뜻한 저녁빛이 도는 부드러운 녹색 잔디 반복 패턴 | background tile | P1 |
| `backgrounds/ground-cobble` | 자갈길 바닥 타일 | 512×512 seamless WebP ≤60KB | N/A(배경 타일) | 스톤 톤의 클래식 유럽 자갈길 반복 패턴 | background tile | P1 |
| `animals/puppy` | 강아지 | 256×256 @1x / 512×512 @2x WebP ≤20KB, 1:1 | YES | 밝은 갈색/크림 톤의 카툰 라운드 강아지, 친근한 표정 | 1×1 cell sprite | P2 |
| `animals/owl` | 부엉이 | 256×256 @1x / 512×512 @2x WebP ≤20KB, 1:1 | YES | 가로등이나 기둥 위에 앉은 포즈의 마을 부엉이 | 1×1 cell sprite | P2 |
| `buildings/book-shop` | 책방 | 256×320 @1x / 512×640 @2x WebP ≤20KB, 1:1.2 | YES | 진열창에 책 실루엣이 보이고 네이비 차양이 달린 아담한 책방 | building 1×1 with taller canvas | P2 |
| `buildings/cafe` | 카페 | 256×320 @1x / 512×640 @2x WebP ≤20KB, 1:1.2 | YES | 차양(어닝)과 야외 테이블 1~2개, 골드 간판 글자가 있는 마을 카페 | building 1×1 with taller canvas | P2 |
| `decorations/stone-fountain` | 돌 분수 | 256×256 @1x / 512×512 @2x WebP ≤20KB, 1:1 | YES | 스톤 질감에 물줄기 하이라이트가 있는 작은 마을 광장 분수 | 1×1 cell sprite | P2 |
| `decorations/town-sign` | 마을 표지판 | 256×256 @1x / 512×512 @2x WebP ≤20KB, 1:1 | YES | 나무 기둥에 골드 테두리 판이 달린 마을 입구 표지판 | 1×1 cell sprite | P2 |
| `decorations/shop-lamp` | 상점 램프 | 256×256 @1x / 512×512 @2x WebP ≤20KB, 1:1 | YES | 골드 금속 프레임에 따뜻한 앰버 불빛이 도는 상점 앞 램프 | 1×1 cell sprite | P2 |
| `special/bridge` | 돌다리 | 512×256 @1x / 1024×512 @2x WebP ≤20KB, 2:1 | YES | 아치형 스톤 다리, 측면 뷰로 그려 넓은 폭을 강조 | bridge spans visually 1 cell but art 2:1 | P3 |
| `special/english-school` | 영어 학교 | 256×320 @1x / 512×640 @2x WebP ≤20KB, 1:1.2 | YES | 네이비/골드 톤의 "Paul Easy English" 오리지널 문장 스타일 건물 정면(외부 크레스트 참조 금지) | building 1×1 with taller canvas | P3 |
| `special/clock-tower` | 시계탑 | 256×320 @1x / 512×640 @2x WebP ≤20KB, 1:1.2 | YES | 골드 시계 문자반이 달린 스톤 재질의 마을 시계탑 | building 1×1 with taller canvas | P3 |
| `backgrounds/sky-evening` | 저녁 하늘 타일 | 512×512 seamless(가로 반복) WebP ≤60KB | N/A(배경 타일) | 따뜻한 저녁 노을 톤의 하늘 반복 패턴 | background tile | P3 |
| `ui/frame-shop-sign` | 상점 간판 프레임(선택) | 크기 미지정(UI 장식용, 텍스트 영역 투명) | YES(텍스트 영역) | 골드 테두리와 크림 배경의 목재/금속 마을 상점 간판 프레임 | 선택 UI 장식(그리드 배치 아님) | P3(선택) |

## 3. Grid readability review

코드/E2E 실측 기준(추측 아님):

- **칸 크기**: `TownGrid.jsx:59`의 `gridTemplateColumns: repeat(8, minmax(40px, 1fr))`로
  8×6 그리드 전 칸이 항상 ≥40px 보장. `tests/e2e/townV1.spec.mjs`가
  360/375/390/412/768×1024/1280×800/844×390 총 7개 뷰포트에서
  `"보이는 버튼 전체 터치 타겟 높이 >= 40px"`(268행 근처)을 검증한다.
- **좁은 화면(360~390px) 대응**: 그리드가 뷰포트 폭보다 넓어질 수 있어
  `overflow-x-auto` wrapper(`TownGrid.jsx:56`)로 그리드 자체 안에서만 가로
  스크롤되게 격리 — 페이지 전체가 밀리지 않는다(E2E `noHorizontalOverflow`
  단언이 각 탭/뷰포트마다 통과 중).
- **HOME 칸 고정**: `HOME_CELL(3,2)`는 `disabled` 버튼(`TownGrid.jsx:80`)이라
  절대 탭 불가 — 장식 전용, 다른 아이템과 배치 충돌 불가능.
- **아이템 중복 배치 불가능**: `byCell` 매핑(`TownGrid.jsx:20-23`)이 좌표당
  1개 placement만 허용하는 구조라 한 칸에 두 아이템이 겹칠 수 없음(코드
  구조상 원천 차단, 런타임 방어 로직이 아님).
- **액션 스트립 터치 타겟**: 이동/보관 버튼은 `min-h-[44px]`
  (`TownGrid.jsx:103,110`)로 고정, E2E가 44px 이상을 검증.
- **200% 확대 대응**: E2E가 상점/내 마을/보관함 3개 탭 모두에서 폰트
  200% 확대 시 가로 스크롤 없음을 검증(`townV1.spec.mjs` PROXY 섹션,
  412-429행).
- **뷰포트 커버리지**: 세로 모바일 4종(360~412) + 태블릿(768×1024) +
  데스크톱(1280×800) + 가로모드 폰(844×390) 총 7개를 모두 통과.

남은 시각적 리스크(자산 발주로 해결되는 부분과 별개로 명시):

- **이모지 렌더링이 OS별로 다름**(Android Noto Color Emoji vs iOS Apple
  Color Emoji) — 현재 100% 이모지 폴백 상태의 근본 원인. 이번 스프라이트
  발주로 이 편차 자체가 해소된다.
- **자갈길 행(가운데 mid row, `bg-[#d9d2c5]`)과 잔디 그라데이션
  (`from-[#fdebd0] via-[#f6e3c8] to-[#cfe3c0]`) 간 대비** — 배경 타일
  (`ground-grass`/`ground-cobble`) 실제 반영 시 톤 대비를 시각적으로
  재확인 필요.
- **건물이 1×1 칸 대비 큰 비율**(1:1.2, 세로로 김) — 타일 크롭이 아니라
  "칸보다 큰 캔버스 + 하단 정렬"로 대응 권장. `<img>` 태그에
  `object-position: bottom`(현재 `TownGrid.jsx:92`는
  `object-contain`만 사용, 건물 자산 반영 시 CSS 클래스 조정은 구현
  세션의 몫으로 남김 — 이 문서는 방향만 제시).

## 4. Delivery/wiring checklist

1. 파일을 `src/assets/town/<folder>/<asset_key 파일명>.webp`(또는 `.png`)
   경로에 배치 — 폴더 구조는 스펙 §3의 `backgrounds/buildings/decorations/
   nature/animals/special/ui` 그대로.
2. `src/assets/town/index.js`의 `TOWN_ASSETS` 객체에 import 추가 —
   **이 한 파일만** 수정(스펙 §9 그대로, `TownGrid.jsx`/`TownInventory.jsx`/
   `TownShopPanel.jsx`는 이미 `townAsset()` 폴백 경로가 있어 손댈 필요
   없음).
3. `tests/e2e/townV1.spec.mjs:174`의
   `"TownScreen — 폴 이미지(img[alt]) 정확히 1장"` 단언 갱신 필요 — 현재는
   페이지 전체의 `img[alt]` 개수를 세는 방식이라, Town 건물/장식 이미지가
   `<img>`로 추가되는 순간 개수가 늘어나 이 단언이 깨진다. 자산 반영 시
   Paul 얼굴(`HeroReaction`) 전용 셀렉터로 좁히는 수정이 필요(스펙 §9와
   동일 지적, 구현 세션에서 처리).
4. 번들 예산(`scripts/testBundleBudget.mjs`) 영향 없음 — Town 자산은
   `<img src>` URL로 지연 로드(`loading="lazy" decoding="async"`)되는
   정적 파일이라 JS 번들에 포함되지 않는다(메인 청크 gzip ≤135KB,
   TownScreen 청크 gzip ≤15KB 예산과 무관). 다만 **자산 총 용량은 별도로
   관리** — 17개 스프라이트(각 ≤20KB) + 배경 타일 3개(각 ≤60KB) +
   선택 프레임 1개를 합산해 전체 자산 무게가 ≤1.5MB를 넘지 않는지
   납품 시 확인(예산표 계산: 17×20KB + 3×60KB = 520KB, 여유 충분하나
   실제 파일이 스펙 상한을 넘기지 않았는지 확인 절차로 명시).
5. 자산 반영 후 `npm run build` → 관련 verify(town 도메인) 재실행.

## 5. IP 가드레일 (요약)

해리포터/호그와트 계열 캐릭터·문장(크레스트)·교복·마법 지팡이·특정 건물
모티프는 어떤 형태로도 사용 금지 — 일반적인 영국 시골 마을 모티프(스톤
코티지, 빨간 우체통, 가로등, 돌다리)로만 표현한다. `english-school`
문장 요소는 반드시 "Paul Easy English" 오리지널 네이비/골드 디자인만
사용하고 실존/허구 학교의 외부 크레스트를 참조·모사하지 않는다. Paul
캐릭터 얼굴은 어떤 이유로도 재드로잉하지 않는다(상세 근거는
`docs/design/PAUL_TOWN_ASSET_SPEC.md` §8 참고).
