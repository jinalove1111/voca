# Paul Town — Asset Manifest (2026-09-12)

_이 문서는 `ASSET_MANIFEST.json`(기계 판독용, 21행 = 기존 카탈로그 17 + 제안
4)의 사람용 요약이다. **이 문서/JSON 어느 쪽도 Supabase `town_items`에 아무
값도 쓰지 않는다** — price/min_level/asset_key의 단일 원천은 항상
`supabase_v3_50_town_v1.sql`이고, 여기 적힌 `level`은 그 SQL 값을 그대로
미러링한 참고용 표시다. `docs/design/PAUL_TOWN_ASSET_SPEC.md`(팔레트/규격
단일 원천)와 `PAUL_TOWN_ASSET_REQUEST_LIST.md`(발주 리스트)를 대체하지 않고,
이 세션이 추가한 UX/Discovery 매핑(interaction/z_order/mobile_priority
관점)만 더한다._

## 1. 기존 카탈로그 17종(요약)

| asset_key | 표시명(en/ko) | 카테고리 | 레벨 | footprint | interaction | 상태 |
|---|---|---|---|---|---|---|
| `buildings/british-cottage` | British Cottage / 영국 코티지 | house | 1 | 1×1(1:1.2) | 탭→이동/보관 | placeholder |
| `nature/tree` | Tree / 나무 | nature | 1 | 1×1 | 탭→이동/보관 | placeholder |
| `decorations/bench` | Bench / 벤치 | decoration | 1 | 1×1 | 탭→이동/보관 | placeholder |
| `decorations/town-sign` | Town Sign / 마을 표지판 | decoration | 1 | 1×1 | 탭→이동/보관 | placeholder |
| `decorations/shop-lamp` | Desk Lamp / 책상 램프 | decoration | 1 | 1×1 | 탭→이동/보관 | placeholder(레거시 아이템) |
| `animals/cat` | Cat / 고양이 | animal | 2 | 1×1 | 탭→이동/보관 | placeholder |
| `decorations/street-lamp` | Street Lamp / 가로등 | decoration | 2 | 1×1 | 탭→이동/보관 | placeholder |
| `decorations/red-post-box` | Red Post Box / 빨간 우체통 | decoration | 2 | 1×1 | 탭→이동/보관 + Discovery(`post-box`) | placeholder |
| `nature/flower-garden` | Flower Garden / 꽃밭 | nature | 3 | 1×1 | 탭→이동/보관 + Discovery(`garden`) | placeholder |
| `buildings/book-shop` | Book Shop / 책방 | house | 3 | 1×1(1:1.2) | 탭→이동/보관 + Discovery(`book-shop`) | placeholder |
| `animals/puppy` | Puppy / 강아지 | animal | 4 | 1×1 | 탭→이동/보관 | placeholder |
| `animals/owl` | Owl / 부엉이 | animal | 4 | 1×1 | 탭→이동/보관 | placeholder |
| `buildings/cafe` | Cafe / 카페 | house | 5 | 1×1(1:1.2) | 탭→이동/보관 + Discovery(`cafe`) | placeholder |
| `decorations/stone-fountain` | Stone Fountain / 돌 분수 | decoration | 5 | 1×1 | 탭→이동/보관 | placeholder |
| `special/bridge` | Bridge / 다리 | special | 6 | 1×1(art 2:1) | 탭→이동/보관 | placeholder |
| `special/english-school` | English School / 영어 학교 | special | 7 | 1×1(1:1.2) | 탭→이동/보관 + Discovery(`school`) | placeholder |
| `special/clock-tower` | Clock Tower / 시계탑 | special | 8 | 1×1(1:1.2) | 탭→이동/보관 + Discovery(`clock-tower`) | placeholder |

z_order는 17종 전부 `2`(Object 레이어, `VISUAL_SYSTEM.md` §3) — 건물류
(house/special)라고 다른 레이어에 있지 않다, 1칸 1아이템 모델이 유지된다.

## 2. Ambient 애니메이션 후보(선택, 기본 꺼짐)

`shop-lamp`/`street-lamp`(불빛 깜빡임), `stone-fountain`(물 반짝임),
`clock-tower`(시침 미세 움직임) 4종만 CSS-only ambient 애니메이션 후보로
표시했다(`VISUAL_SYSTEM.md` §6의 "동시 3개 이하, `prefers-reduced-motion`
시 0개" 규칙 적용 대상). 이번 세션은 실제 애니메이션 코드를 구현하지
않는다(제안만).

## 3. 제안(미구현) 4종 — DB 미반영

| asset_key | 표시명(en/ko) | 비고 |
|---|---|---|
| `nature/rain-puddle` | Rain Puddle / 빗물 웅덩이 | 안개 낀 아침 무드 보강용 장식 |
| `decorations/tea-shop-sign` | Tea Shop Sign / 티숍 간판 | Discovery `tea-shop` 콘텐츠 이미 준비됨(`DISCOVERY_SYSTEM.md`) |
| `special/train-platform` | Train Platform / 기차 플랫폼 | Discovery `train-platform` 콘텐츠 이미 준비됨 |
| `decorations/lantern-string` | Lantern String / 줄 조명 | 저녁 무드 보강, 낮은 우선순위 |

이 4종은 `town_items`/`supabase_v3_5X_*.sql`/`townCatalog.js`
`TOWN_ITEM_META` 어디에도 추가되지 않았다 — 실제 추가는 운영자 승인 +
가격/레벨 정책 결정(`TOWN_ECONOMY_AUDIT_2026-09-11.md` §0.7과 함께 검토) 후
별도 세션의 몫이다.

## 4. 연결 방법 — 기존 문서와 동일(재설명만)

자산 파일 배치/`index.js` 등록 절차는 이 문서가 새로 정의하지 않는다 —
`PAUL_TOWN_ASSET_SPEC.md` §9의 절차(`src/assets/town/index.js` 한 파일만
수정)를 그대로 따른다. 이 매니페스트는 "무엇을(what)"만 구조화했고
"어떻게 연결하는가(how)"는 기존 문서가 단일 원천이다.

## 5. 참고

- `docs/design/town/ASSET_MANIFEST.json` — 기계 판독용 원본(21행).
- `docs/design/PAUL_TOWN_ASSET_SPEC.md` — 팔레트/규격 단일 원천.
- `docs/design/PAUL_TOWN_ASSET_REQUEST_LIST.md` — 발주 리스트(우선순위 P1~P3).
- `docs/design/town/VISUAL_SYSTEM.md` §3/§6 — 레이어/애니메이션 규칙.
