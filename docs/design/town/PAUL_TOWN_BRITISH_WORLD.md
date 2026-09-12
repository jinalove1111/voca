# Paul Town — British Magical Storybook World Design (2026-09-12)

_설계 문서(AGENT B, 브랜치 `design/paul-town-british-world-2026-09-12`). 코드/DB/
가격/레벨 임계값을 변경하지 않는다 — 기존 `docs/design/PAUL_TOWN_V1.md`(§1~13,
구현 계약의 단일 원천)과 `docs/design/TOWN_ECONOMY_AUDIT_2026-09-11.md`(이코노미
실측)를 재구현하지 않고 그 위에 "세계관/톤/카피" 레이어만 얹는다. 여기 나오는
아이템/가격/레벨은 전부 `supabase_v3_50_town_v1.sql`에 이미 있는 17종 그대로다
— 새 아이템은 §6에 "제안(미구현, DB 미반영)"으로만 분리해 적는다._

## 1. 세계관 한 줄

Paul Town은 학생이 매일 배운 단어만큼 조금씩 밝아지는, 폴 선생님이 함께 가꾸는
작고 따뜻한 영국 시골 마을이다. 어둡거나 무서운 요소 없이, "오늘 하나 배우면
마을이 하나 자란다"는 감각만 남긴다.

## 2. 톤 & 무드

- **아늑함(cozy)**: 창문마다 노란 불빛, 저녁의 따뜻한 색.
- **귀여움(cute)**: 둥근 아웃라인, 카툰 비율, 큰 눈의 동물.
- **프리미엄(premium)**: 절제된 7색 팔레트(`PAUL_TOWN_ASSET_SPEC.md` §5), 과한
  장식/네온/형광색 금지.
- **교육적(educational)**: 모든 장소가 "배움과 연결된 이유"를 갖는다(§4/
  `DISCOVERY_SYSTEM.md`).
- **신비롭지만 안전(mysterious-but-safe)**: 안개 낀 아침, 저녁의 가로등 같은
  "약한 신비감"만 — 공포/오컬트/전투 요소 0.
- 금지: 해리포터/호그와트 계열 캐릭터·크레스트·특정 건물·마법 지팡이·부엉이
  우편 배달 같은 라이선스 모티프 전부(고유 명사 자체를 문서/코드/카피 어디에도
  적지 않는다 — §8 IP 체크 테스트로 고정).

## 3. LEARN → EARN → BUILD → EXPLORE → DISCOVER 루프

기존 이코노미 파이프라인(`PAUL_TOWN_V1.md` §2, `TOWN_ECONOMY_AUDIT` §2)을 그대로
따르되, 학생이 체감하는 5단계로 재서술한다 — 각 단계는 이미 존재하는 이벤트/
함수/화면에 매핑되고, 새 단계는 만들지 않는다.

| 단계 | 학생 행동 | 이미 있는 구현 | 새로 필요한 것 |
|---|---|---|---|
| **LEARN** | 오늘 단어 학습/쓰기/발음/퀴즈 | `useStudent.js`의 12종 보상 이벤트(`REWARD_PATH_AUDIT_2026-09-11.md` 표 A) | 없음 |
| **EARN** | ⭐ 별 적립 → `trg_reward_ledger_to_dollars` → 💵 Paul Dollar 적립 | `reward_ledger`/`dollar_ledger`(v3_49, 6종 서버 도달 — `TOWN_ECONOMY_AUDIT` §0/§3) | 없음(§7 옵션 C 범위, 이 문서 밖) |
| **BUILD** | 상점에서 아이템 구매 → 8×6 격자에 배치 | `purchase_town_item` RPC, `TownShopPanel`/`TownGrid`/`townLayout.js` | 없음 |
| **EXPLORE** | 자기 마을을 둘러보고 이동/재배치 | `TownInventory`/`moveItem`/`storeItem` | 없음 |
| **DISCOVER** | 놓인 건물/장식을 눌러 짧은 영국 단어/사실을 만난다 | 없음(V1은 탭하면 이동/보관 액션만) | `DISCOVERY_SYSTEM.md` — flavor only, 보상/네트워크 0 |

DISCOVER가 이번 세션의 유일한 "새 개념"이고, 나머지 4단계는 기존 계약을 그대로
서술한 것이다. DISCOVER는 §7에서 "제안 + 안전 프로토타입"으로만 다룬다(v1
카탈로그/가격/DB 무변경).

## 4. 레벨별 마을 지도 컨셉(기존 17종 아이템만 사용)

`TOWN_LEVELS`(`townLevel.js`) 임계값 그대로, `min_level`(`supabase_v3_50_town_v1
.sql`)로 이미 정해진 잠금 해제 순서를 그림으로 재서술한다. 배치 좌표/픽셀 위치는
학생이 직접 정하므로(8×6 자유 배치, `townLayout.js`) 아래는 "이 레벨쯤이면
이런 풍경이 자연스럽다"는 **참고 개념도**이지 강제 레이아웃이 아니다.

- **L1(⭐0) — 마을의 시작**: My House(고정 `HOME_CELL`) 옆으로 `tree`, `bench`,
  `town-sign`, `british-cottage`, `shop-lamp`. "작은 오솔길과 나무 몇 그루,
  문패 하나 — 이제 막 생긴 마을."
- **L2(⭐20) — 첫 이웃들**: `cat`, `street-lamp`, `red-post-box` 추가. "저녁에
  가로등이 켜지고, 우체통 앞에 고양이 한 마리가 앉아 있다."
- **L3(⭐50) — 배움의 거리**: `flower-garden`, `book-shop` 추가. "꽃밭 옆에
  작은 책방이 생긴다 — 마을에 처음 생긴 '가게'."
- **L4(⭐100) — 친구들이 늘어난다**: `puppy`, `owl` 추가. "강아지가 뛰어다니고,
  부엉이가 가로등 위에 앉아 마을을 내려본다."
- **L5(⭐200) — 마을 광장**: `cafe`, `stone-fountain` 추가. "카페 테이블 하나,
  분수 하나 — 마을 사람들이 모이는 자리가 생긴다."
- **L6(⭐350) — 마을 밖으로**: `bridge` 추가. "돌다리를 건너면 마을이 조금 더
  넓어 보인다."
- **L7(⭐550) — 배움의 전당**: `english-school` 추가. "Paul Easy English 학교
  — 이 마을 최초의 '학교' 건물."
- **L8(⭐800) — 시간의 상징**: `clock-tower` 추가. "시계탑이 마을 어디서든
  보인다 — 가장 오래 걸려 완성한 랜드마크."
- **L9/L10(⭐1100/1500)**: 신규 잠금 아이템 없음(§14 V2 후보, `PAUL_TOWN_V1.md`)
  — 표시 문구도 없음(`TOWN_LEVEL_UNLOCKS`가 1/3/5/8만 정의, 의도된 동작).
  이 구간은 "완성된 마을을 계속 꾸미고 다니는" 단계로 서술한다(신규 아이템은
  §6 제안 참고, DB 미반영).

## 5. Paul의 역할 — 선생님이자 안내자이자 호스트

Paul은 이 마을을 만든 사람이 아니라 "함께 키우는 선생님"이다. 새 얼굴/포즈를
만들지 않고 기존 `paulReactions.js` 21종만 쓴다(`townMessages.js`의
`EVENT_TEMPLATES`가 이미 이 원칙을 지키고 있음 — 그대로 유지).

가이드 라인은 전부 **8단어 이하**, 영/한 병기. 기존 `TOWN_PHRASES`/
`EVENT_TEMPLATES`와 겹치지 않는 새 제안만 아래에 적는다(적용은 §7의
`townDiscovery.js`가 담당, `townMessages.js`는 이번 세션에서 수정하지 않음 —
파일 소유는 기존 PHASE 4 작업 라인이 계속 갖고, 신규 문구는 새 파일에 둔다).

| 장소 카테고리 | Paul 가이드(EN) | Paul 가이드(KO) |
|---|---|---|
| house(집/건물) | "A cozy home makes a happy town." | "아늑한 집이 마을을 행복하게 해요." |
| nature(자연) | "Every tree makes the town greener." | "나무 한 그루가 마을을 푸르게 해요." |
| animal(동물) | "New friends are moving in!" | "새 친구가 마을에 왔어요!" |
| decoration(장식) | "Small things make a big difference." | "작은 것들이 큰 변화를 만들어요." |
| special(특별) | "This one took real dedication." | "정말 열심히 해서 얻은 거예요." |

## 6. 브랜드 문구 — 기존 5종 유지 + 제안 3종(적용 여부는 운영자 결정)

기존 `TOWN_PHRASES`(`townMessages.js`) 5종은 그대로 둔다: `welcome` /
`learnEarn` / `brighter` / `smallSteps` / `tomorrow`. 아래는 **제안(미적용)** —
`townMessages.js`를 이 세션에서 고치지 않으므로 실제 반영은 별도 구현 세션 몫.

- "A little English, a lot of town." / "작은 영어가 큰 마을이 돼요."
- "Your town grows one word at a time." / "단어 하나마다 마을이 자라요."
- "Cozy town, big dreams." / "아늑한 마을, 큰 꿈."

## 7. 제안 아이템(미구현, DB 미반영) — 참고용

_아래는 향후 카탈로그 확장 아이디어일 뿐, `town_items`/`townCatalog.js`/
`supabase_v3_50_town_v1.sql`을 이번 세션에서 변경하지 않는다. 가격/레벨은
운영자가 §5 이코노미 감사 결론(`TOWN_ECONOMY_AUDIT_2026-09-11.md` §0.7 옵션
A~D)과 함께 검토해야 할 사안이다._

- `nature/rain-puddle`(비 온 뒤 물웅덩이, 장식) — 안개 낀 아침 무드 보강.
- `decorations/tea-shop-sign`(티숍 간판) — DISCOVERY_SYSTEM의 "차 마시기" 어휘와
  연결.
- `special/train-platform`(작은 기차역 플랫폼) — "여행 표현" 발견 콘텐츠와 연결.
- `decorations/lantern-string`(줄 조명) — 저녁 무드 보강, 낮은 우선순위.

## 8. IP 세이프가드 요약

- 금지어 15개(운영자 지시 원문 그대로) — 이 문서를 포함한 이번 세션 산출물
  전체가 `scripts/testTownDiscovery.mjs`의 IP 스캔 대상이라, 그 금지어 자체를
  여기 다시 나열하지 않는다(나열하는 순간 이 문서 자체가 스캔에서 걸리는
  자기 지시적 모순을 피하기 위함) — 정확한 15개 목록은
  `scripts/testTownDiscovery.mjs`의 `FORBIDDEN_TERMS` 상수(단일 원천)를 본다.
  이 문서/코드 어디에도 그 계열 고유명사(캐릭터/학교/스포츠/마법 도구 이름)를
  쓰지 않는다는 원칙만 여기 남긴다.
- 대신 쓰는 일반 모티프: 스톤 코티지, 자갈길, 빨간 우체통, 가로등, 돌다리,
  마을 광장, 영국식 정원, 오래된 책, 랜턴, 부엉이(마을 동물로서, 우편 배달부
  아님), 비 오는 창문, 안개 낀 아침, 티숍, 도서관, 기차 플랫폼, 나무 표지판,
  숨은 골목.
- Paul 캐릭터: 얼굴/포즈 재작업 절대 금지(`PAUL_TOWN_ASSET_SPEC.md` §2/§8과
  동일 원칙, 이 문서가 반복해 명시).

## 9. 참고 파일

- `docs/design/PAUL_TOWN_V1.md` — 구현 계약(카탈로그/레벨/구매 트랜잭션).
- `docs/design/TOWN_ECONOMY_AUDIT_2026-09-11.md` — 이코노미 실측/밸런스.
- `docs/design/PAUL_TOWN_ASSET_SPEC.md` / `PAUL_TOWN_ASSET_REQUEST_LIST.md` —
  일러스트 스펙(이 문서가 대체하지 않음, §5 팔레트를 그대로 계승).
- `docs/design/town/VISUAL_SYSTEM.md` / `DISCOVERY_SYSTEM.md` / `UX_FLOW.md` /
  `ASSET_MANIFEST.md` / `COMPONENT_ARCHITECTURE.md` — 이 문서의 자매 문서.
