# Paul Town 일러스트 자산 스펙 — 2026-09-11

_설계 문서. 코드/자산 파일을 직접 만들거나 배치하지 않는다 — 실제
일러스트 제작·배치는 별도 작업(디자이너/외주 또는 이미지 생성 파이프라인)
이고, 이 문서는 그 결과물이 지켜야 할 스펙과 연결 방법만 정의한다.
`CLAUDE.md` 규칙 12(학생 대상 신규 UI/게임화는 이번 "AI 개발 운영체제"
구축 범위 밖)와 무관 — Paul Town은 운영자 승인 하 별도 게임화 트랙이며
(`docs/design/PAUL_TOWN_V1.md` §1), 이 문서도 그 트랙의 산출물이다._

## 1. 목적

Paul Town V1(`paulTownV1` 플래그, 현재 OFF)은 아이템 17종에 대해
`asset_key`(`supabase_v3_50_town_v1.sql:101-116, 129`)를 이미 갖고 있지만
실제 이미지가 없어 전부 이모지로 렌더된다(`src/assets/town/index.js`의
`TOWN_ASSETS = {}`). 이 문서는 그 빈 자리를 채울 일러스트의 크기/스타일/
파일명/폴더 규칙을 확정해, 자산이 준비되는 즉시 `src/assets/town/
index.js` 한 파일만 고치면 되도록 만든다.

## 2. 재사용 자산 인벤토리(이미 있는 것 — 새로 만들지 않음)

| 자산 | 위치 | 개수/형식 | 용도 |
|---|---|---|---|
| 공식 Paul 캐릭터 얼굴 | `src/assets/paul/*.png`, 배럴 `src/assets/paul/index.js` | 21개 PNG(hello/ponder/great/almost/study/levelup/lets_learn/happy 등) | `HeroReaction`(`src/components/HeroReaction.jsx`)을 통해 Town 포함 전 화면 공용 렌더. **절대 재작업/재드로잉 금지** — Town 전용 새 얼굴을 만들지 않는다. |
| 로그인 로고 | `public/image/KakaoTalk_20260620_210208708.png` | PNG, 약 1.48MB(용량 큼) | `src/components/StudentSelect.jsx`에서 로그인 화면에 사용. Town 자산과 무관하지만 "용량 큰 PNG를 WebP로 낮추면 좋다"는 선례로 별도 개선 후보(이 문서 범위 밖, §8 참고). |
| 별 표시 | ⭐ 이모지 | — | 총 별(⭐) 표시 전역 공용, 변경 없음. |
| 폴달러 표시 | 💵 이모지 + `formatDollars()`(`src/utils/townShop.js:122`) | — | Paul Dollar 잔액/가격 표시 전역 공용, 변경 없음. |
| 배지/모자/스티커 이모지 | 기존 보상 시스템 이모지 | — | Town과 별개 시스템, 변경 없음. |

## 3. 자산 폴더 구조와 연결 메커니즘(이미 있는 스캐폴딩)

```
src/assets/town/
  backgrounds/  .gitkeep   (신규: ground-grass, ground-cobble, sky-evening)
  buildings/    .gitkeep   (신규: british-cottage, book-shop, cafe)
  decorations/  .gitkeep   (신규: bench, town-sign, street-lamp,
                             red-post-box, stone-fountain, shop-lamp)
  nature/       .gitkeep   (신규: tree, flower-garden)
  animals/      .gitkeep   (신규: cat, puppy, owl)
  special/      .gitkeep   (신규: bridge, english-school, clock-tower)
  ui/           .gitkeep   (선택: frame-shop-sign)
  index.js                 (assetKey -> import URL 매핑, 현재 빈 객체)
```

`src/assets/town/index.js` 현재 내용:

```js
export const TOWN_ASSETS = {}
export function townAsset(assetKey) {
  if (typeof assetKey !== 'string' || assetKey.length === 0) return null
  return TOWN_ASSETS[assetKey] || null
}
```

호출부 3곳(`TownGrid.jsx`, `TownInventory.jsx`, `TownShopPanel.jsx`)은
이미 `townAsset(item.assetKey)`가 `null`이면 `item.emoji`로 폴백하도록
구현돼 있고, `<img loading="lazy" decoding="async">` 경로도 이미 있다
(그레핑 확인: 세 파일 모두 `loading="lazy"`/`decoding="async"` 매치).
**즉 자산을 넣는 작업은 `index.js`에 import 문 추가 + `TOWN_ASSETS` 객체에
키 등록, 이 한 파일 수정만으로 끝난다 — 다른 컴포넌트 코드는 손댈 필요가
없다.**

## 4. 신규 자산 스펙 — 아이템 17종

DB `asset_key`(`supabase_v3_50_town_v1.sql`)를 그대로 파일 경로로 쓴다
(`src/assets/town/{asset_key}.png` 또는 `.webp`).

| 자산(한글명) | assetKey | 카테고리 | min_level | 투명배경 | 비율(가로:세로) | 권장 px(기준/1x) | 스타일 메모 |
|---|---|---|---|---|---|---|---|
| 나무 | `nature/tree` | nature | L1 | YES | 1:1.3 | 256×332 | 둥근 수관, 따뜻한 녹색(#4f7a4a), 단일 접지 그림자 타원 |
| 벤치 | `decorations/bench` | decoration | L1 | YES | 1:1 | 256×256 | 목재 톤, 크림(#fdebd0) 하이라이트 |
| 마을 표지판 | `decorations/town-sign` | decoration | L1 | YES | 1:1 | 256×256 | 나무 기둥 + 골드(#c9a227) 테두리 판 |
| 영국 코티지 | `buildings/british-cottage` | house | L1 | YES | 1:1.2 | 256×320 | 스톤/브릭 텍스처, 창문에 따뜻한 노란 불빛, 담쟁이 넝쿨 |
| 상점 램프 | `decorations/shop-lamp` | decoration | L1 | YES | 1:1 | 256×256 | 골드 금속 프레임, 따뜻한 앰버(#f6c76b) 불빛 |
| 고양이 | `animals/cat` | animal | L2 | YES | 1:1 | 256×256 | 카툰 라운드, 큰 눈, 도시 고양이 톤 |
| 가로등 | `decorations/street-lamp` | decoration | L2 | YES | 1:1 | 256×256 | 클래식 철제 가로등, 앰버 불빛 |
| 빨간 우편함 | `decorations/red-post-box` | decoration | L2 | YES | 1:1 | 256×256 | 버건디(#8b1e2d)~영국풍 빨강 원통형 우체통(고전 필러 박스 형태) |
| 꽃밭 | `nature/flower-garden` | nature | L3 | YES | 1:1 | 256×256 | 다색 꽃 클러스터, 녹색 베이스 |
| 책방 | `buildings/book-shop` | house | L3 | YES | 1:1.2 | 256×320 | 진열창에 책 실루엣, 네이비(#1e2a5a) 차양 |
| 강아지 | `animals/puppy` | animal | L4 | YES | 1:1 | 256×256 | 카툰 라운드, 밝은 갈색/크림 톤 |
| 부엉이 | `animals/owl` | animal | L4 | YES | 1:1 | 256×256 | 가로등/기둥 위에 앉은 포즈 권장 |
| 카페 | `buildings/cafe` | house | L5 | YES | 1:1.2 | 256×320 | 차양(어닝) + 야외 테이블 1~2개, 골드 간판 글자 |
| 돌 분수 | `decorations/stone-fountain` | decoration | L5 | YES | 1:1 | 256×256 | 스톤(#b9b3a8) 질감, 물줄기 하이라이트 |
| 돌다리 | `special/bridge` | special | L6 | YES | 2:1 | 512×256 | 아치형 스톤 다리, 옆면 뷰 허용(그리드 폭 넓은 타일) |
| 영어 학교 | `special/english-school` | special | L7 | YES | 1:1.2 | 256×320 | 네이비/골드 문장(紋章) 스타일 — **Paul Easy English 자체 로고 톤만**, 외부 크레스트 금지(§7) |
| 시계탑 | `special/clock-tower` | special | L8 | YES | 1:1.2 | 256×320 | 골드 시계 문자반, 스톤 타워 |

공통: 전부 투명 배경(PNG-24 alpha 또는 WebP alpha), @1x/@2x 두 해상도로
내보내기(@2x는 위 px의 2배), 파일당 목표 용량 ≤20KB(WebP 기준). `bridge`
만 2:1 비율 512×256(그리드에서 폭 2칸을 차지할 수 있도록).

## 5. 전역 스타일 가이드

- **선화**: Paul 캐릭터(`src/assets/paul/*.png`)와 동일한 두께의 부드러운
  아웃라인 카툰. Paul 얼굴 자체는 이 작업에서 다시 그리지 않는다(§2).
- **시점**: 3/4 정면 뷰(등각/탑다운 아님) — 그리드에 나열했을 때 건물
  정면이 보이도록.
- **그림자**: 오브젝트당 접지 그림자 타원 1개(단일, 부드러운 블러).
- **팔레트(고정 7색)**:
  - Navy `#1e2a5a`
  - Gold `#c9a227`
  - Burgundy `#8b1e2d`
  - Cream `#fdebd0`
  - Warm amber `#f6c76b`
  - Stone `#b9b3a8`
  - Green `#4f7a4a`
- **조명**: 저녁의 따뜻한 광원(warm evening light) — 어둡거나 차가운
  톤 금지, 창문/램프류는 앰버 발광 하이라이트로 "마을에 불이 켜진" 느낌.

## 6. 배경/타일 스펙

| 자산 | assetKey | 크기 | 반복(seamless) | 용량 |
|---|---|---|---|---|
| 잔디 바닥 | `backgrounds/ground-grass` | 512×512 | YES | ≤60KB |
| 자갈길 바닥 | `backgrounds/ground-cobble` | 512×512 | YES | ≤60KB |
| 저녁 하늘 | `backgrounds/sky-evening` | 512×512 | YES(가로) | ≤60KB |

## 7. UI 프레임(선택)

`ui/frame-shop-sign` — 상점 패널 헤더 장식용 선택 자산, 없어도 현재
UI(텍스트 헤더)로 기능상 문제 없음. 넣을 경우 골드 테두리 + 크림 배경의
목재/금속 간판 프레임, 텍스트 영역은 투명 처리.

## 8. IP·저작권 가드레일

- 해리포터 계열 캐릭터/호그와트/문장(크레스트)/의상/소품/우산 등 어떤
  형태로도 사용 금지. "British storybook" 컨셉은 일반적인 영국 시골
  마을 모티프(스톤 코티지, 빨간 우체통, 가로등, 돌다리)로만 표현한다.
- `english-school` 문장(紋章) 요소는 반드시 "Paul Easy English" 자체
  네이비/골드 배색의 오리지널 디자인만 — 실존/허구 학교의 외부 크레스트를
  참조·모사하지 않는다.
- Paul 캐릭터 얼굴은 어떤 이유로도 재드로잉하지 않는다(§2) — Town 신규
  일러스트는 건물/자연/동물/장식에 한정.

## 9. 납품 체크리스트 + 연결 방법

1. 위 스펙대로 파일 제작(§4/§6, 필요 시 §7), `src/assets/town/
   {category}/{asset_key 파일명}.png`(또는 `.webp`) 경로에 배치.
2. `src/assets/town/index.js`에 import 추가:
   ```js
   import treeImg from './nature/tree.png'
   export const TOWN_ASSETS = {
     'nature/tree': treeImg,
     // ... 나머지 asset_key도 동일 패턴
   }
   ```
3. **다른 파일은 수정하지 않는다** — `TownGrid.jsx`/`TownInventory.jsx`/
   `TownShopPanel.jsx`는 이미 `townAsset()` 폴백 경로가 구현돼 있다(§3).
4. 자산이 하나라도 채워지면 `npm run build` → 관련 verify(town 도메인)
   재실행으로 번들링/경로 확인.
5. **E2E 회귀 갱신 필요 지점**: `tests/e2e/townV1.spec.mjs:132`의
   `"TownScreen — 폴 이미지(img[alt]) 정확히 1장"` 단언은 현재 Paul
   캐릭터(`HeroReaction`) 1장만 렌더된다는 전제다. Town 건물/장식
   이미지가 `img` 태그로 추가되면 이 단언의 셀렉터(현재 어떤
   `img[alt]`인지 특정하지 않고 "정확히 1장"만 검증)가 새 이미지까지
   집계해 깨질 수 있다 — 자산 반영 시 이 스펙 파일의 셀렉터를
   Paul 얼굴 전용으로 좁히는 수정이 필요하다(구현 세션에서 처리,
   이 문서는 그 필요성만 기록).

## 10. 이 문서에서 다루지 않는 것

- 실제 이미지 생성/외주 발주 프로세스.
- 로그인 로고(`public/image/KakaoTalk_20260620_210208708.png`) 자체의
  WebP 전환 작업 — Town 자산과 무관한 별개 개선 후보로만 언급(§2).
- `docs/design/TOWN_ECONOMY_AUDIT_2026-09-11.md`의 가격/레벨 밸런스
  변경 — 자산 유무와 무관하게 독립적으로 결정될 사안.
