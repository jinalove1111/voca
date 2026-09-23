# Paul Town 2.5D 캐릭터 스프라이트 후보 조사 (2026-09-24)

조사 대상 저장소: `feat/paul-town-v2-clean-pr` (HEAD `b932682`), 읽기 전용 워크트리.
요구 사양 출처: `docs/design/town/ASTRA_HANDOFF_2026-09-21.md` §0-A — idle(1프레임)
+ walk 좌/우 2프레임(scaleX(-1) 미러링 전제) + sit(1프레임), 96×128 캔버스 권장,
PNG/WebP + 알파, foot anchor + hip/seat anchor, 상업적 이용 가능 라이선스 + 출처 기록 필수.
기존 town 오브젝트(건물/나무/장식)는 **3/4 정면(살짝 위에서 내려본) 수채화풍 스토리북
일러스트**.

---

## 1. 저장소 감사 결과

- `ASTRA_ASSET_AUDIT_2026-09-21.md`(2026-09-21 작성, 2026-09-23 갱신 포인터 포함)
  §5가 이미 전수 감사를 수행했고, 이 세션이 파일시스템으로 독립 재확인했다.
- **LICENSE/NOTICE/CREDITS/ATTRIBUTION 파일**: 저장소 전체에 `find . -iname
  "LICENSE*" -o -iname "NOTICE*" -o -iname "CREDITS*" -o -iname "*ATTRIBUTION*"`
  실행 결과 **0건**. `src/assets`, `public`, `docs` 어디에도 라이선스/출처 문서
  없음.
- **캐릭터류 이미지 디렉터리 검색**: `find src/assets -iname "*character*" -o
  -iname "*sprite*" -o -iname "*walk*" -o -iname "*idle*" -o -iname "*sit*"`
  실행 결과 **0건** — 감사 문서 §5.4/§5.5/§5.6의 "0건" 판정과 일치.
- `src/assets/` 하위는 `paul/`(21개, 대화상자 리액션 초상화, 111×142~184×193px,
  정면 얼굴+상반신만, 하반신 없음)과 `town/`(133개, 건물/장식/자연/환경 타일,
  전부 3/4 정면 또는 top-down 정적 오브젝트) 단 2개 폴더뿐임을 재확인했다.
  `town/animals/`(cat/owl/puppy)는 정지 포즈 단일 프레임이며 사람 형태가 아니라
  캐릭터로 전용 불가.
- 154개 파일 전부 **출처 `UNKNOWN`**(감사 문서 §13과 일치) — EXIF/텍스트
  청크까지는 이 세션도 확인하지 않았으나, README/커밋 메시지/문서 어디에도
  출처 표기가 없다는 점은 `find` 결과로 재확인했다.

**결론: 저장소 내 사용 가능한 캐릭터 스프라이트 세트 = 없음(NO).** idle/walk/sit
3종을 만족하는 사람형 스프라이트는 물론, 걷기/방향/상태별 아트 자체가 전혀
존재하지 않는다. 현재 런타임은 `TownCharacter.jsx`의 이모지(`🧒`)로 임시 대체
중이다(코드 확인 사항이며 이번 조사가 별도 검증한 것은 아님, 감사 문서
§5.3 인용).

---

## 2. 외부 후보 비교표

| 후보 | 배급처 | 라이선스 | 스타일/시점 | idle | walk | sit | 캔버스 | 3/4 painterly와의 정합성 |
|---|---|---|---|---|---|---|---|---|
| Hand-Drawn Square Characters — Animated 8 Directions Top Down (Free CC0) | itch.io (rgsdev, 원저작자 본인 배포) | CC0 | 손그림풍이지만 굵은 검정 외곽선 + 평면 채색의 큐트/블롭 캐릭터, **완전 top-down**(정수리 각도) | O(8방향) | O(8방향, walk=idle과 동일 프레임 세트로 보임) | **X(없음)** | 128×128 (스프라이트시트 프리뷰 기준) | **낮음** — top-down 큐브형 캐릭터라 3/4 정면 수채화 건물과 원근·화풍이 모두 다름 |
| RPG Character Sprites | OpenGameArt.org (GrafxKid) | CC0 | 픽셀아트, top-down/쿼터뷰 추정 | 페이지에 명시 안 됨 | 페이지에 명시 안 됨("템플릿" 성격) | **명시 안 됨(사실상 없음으로 추정)** | 페이지에 명시 안 됨 | **낮음** — 픽셀아트 자체가 painterly 수채화 톤과 이질적, 게다가 상태별 프레임 구성이 문서화돼 있지 않아 idle/walk/sit 충족 여부를 확정할 수 없음 |
| Toon Characters | Kenney.nl (Kenney, 공식 CC0) | CC0 | 평면 벡터 카툰, **플랫포머(횡스크롤) 태그** — 옆에서 본 플랫폼 게임용 캐릭터 | 불명(포즈 다수라고만 명시) | 불명 | **불명(페이지에 sit 언급 없음)** | 270px 기준(정확한 프레임 치수 페이지에 미기재) | **낮음** — 옆에서 본 플랫포머 스타일이라 top-down/3-4뷰 마을 씬과 카메라 각도 자체가 다름 |

세 후보 모두 idle+walk+sit 3종을 동시에 명시적으로 확인할 수 없었고(1번은
sit이 확실히 없음, 2·3번은 페이지 문서화 부족으로 확인 불가), 스타일도 painterly
3/4 마을 오브젝트와 이질적이다(1번 top-down 블롭, 2번 픽셀아트, 3번 플랫포머
횡스크롤).

---

## 3. 라이선스 증거

### 3-1. Hand-Drawn Square Characters (rgsdev, itch.io)
- URL: `https://rgsdev.itch.io/hand-drawn-square-characters-animated-8-directions-top-down-free-cc0`
- 창작자 자신의 페이지 명시 문구(WebFetch로 페이지 인용): "The license is
  CC0, so you can use any way you want, even commercially." (13 단어)
- CC0 라이선스 본문(`https://creativecommons.org/publicdomain/zero/1.0/`,
  WebFetch로 직접 확인): "You can copy, modify, distribute and perform the
  work, even for commercial purposes, all without asking permission." (19
  단어, 상업적 이용·수정·재배포 전부 허용됨을 확인)
- 실물 확인: 페이지 내 공개 프리뷰 이미지 2장을 연구 폴더에 다운로드해 직접
  열람(`downloads/rgsdev_preview_1.png`, `downloads/rgsdev_anim1.gif`) —
  제목 배너("Free Animated Characters Top Down", "8 directions")와 실제
  8방향 순환 애니메이션(빨간 캐릭터, idle 8포즈)을 육안 확인. **sit 포즈는
  이 2개 프리뷰 어디에도 없음**(itch.io가 zip 다운로드는 결제/세션 플로우를
  요구해 이번 조사에서는 무료 zip 자체는 받지 못했고 공개 프리뷰만 확인함,
  아래 "확인 못한 점" 참고).
- 다운로드 파일 SHA-256(연구 폴더에 저장한 프리뷰 이미지 기준, zip 아님):
  - `rgsdev_preview_1.png` SHA-256: `538e60f615d4ab81e27a05d40709e0bb88d773796a912961b8a4f288a5452582`
  - `rgsdev_anim1.gif` SHA-256: `6c3c274445606ae85ee66e84e73cc39065671651d1d99f7cc5850d5c832ddd3c`
- 다운로드 날짜: 2026-09-24

### 3-2. RPG Character Sprites (GrafxKid, OpenGameArt)
- URL: `https://opengameart.org/content/rpg-character-sprites`
- 페이지 명시: "CC0 (Creative Commons Zero) – public domain"
- CC0 라이선스 본문 동일 인용(§3-1과 동일 텍스트, 상업적 이용 허용 확인).
- 이 후보는 실제 파일을 다운로드하지 않았다(§2 표에서 이미 idle/walk/sit
  구성이 페이지에 문서화되지 않아 스펙 충족을 판정할 근거가 부족하다고
  판단했기 때문 — 라이선스는 CC0로 명확하나 포즈 구성 불명이라는 별개 결함).

### 3-3. Toon Characters (Kenney.nl)
- URL: `https://kenney.nl/assets/toon-characters`
- 페이지 명시: "Creative Commons CC0"
- CC0 라이선스 본문 동일 인용.
- 이 후보 역시 파일을 다운로드하지 않았다(플랫포머 횡스크롤 스타일이라
  §0-A가 요구하는 top-down/3-4뷰 마을 씬과 카메라 각도 자체가 맞지 않음이
  페이지 태그("platformer")로 이미 명확했기 때문).

---

## 4. 판정

**적합 후보 없음.**

세 후보 모두 CC0로 라이선스 자체는 명확하고 상업적 이용에 문제가 없지만,
`ASTRA_HANDOFF_2026-09-21.md` §0-A가 요구하는 **idle + walk(좌우) + sit 3종
전부**를 동시에 명시적으로 만족하는 후보가 없었다:

1. rgsdev 손그림 캐릭터 — 라이선스는 가장 깨끗하고(창작자 본인이 명시적으로
   CC0 선언) idle/walk 8방향은 실물 프리뷰로 직접 확인했지만, **sit 포즈가
   확인 가능한 자료(프리뷰 2장) 어디에도 없다.** 스타일도 top-down 큐브형
   블롭 캐릭터라 기존 3/4 정면 수채화 건물과 나란히 두면 이질적이다(감사
   문서가 이미 지적한 "top-down env vs 3/4 오브젝트" 원근 불일치 문제를
   캐릭터 단에서 한 번 더 반복하게 된다).
2. GrafxKid RPG Character Sprites — 라이선스는 CC0로 명확하나, 페이지 자체가
   "템플릿 성격"이라고만 설명할 뿐 idle/walk/sit 각 상태의 프레임 구성을
   문서화하지 않아 스펙 충족 여부를 객관적으로 판정할 근거가 없다. 픽셀아트
   스타일도 painterly 톤과 이질적이다.
3. Kenney Toon Characters — 공식 CC0라 출처/라이선스 신뢰도는 가장 높지만,
   플랫포머(횡스크롤) 용도로 제작된 팩이라 카메라 각도 자체가 이 프로젝트의
   top-down/3-4뷰 마을 씬과 맞지 않는다.

**권장**: 기존 town 오브젝트와 같은 톤(3/4 정면, 접지 그림자 CSS 재사용,
96×128 캔버스)의 idle/walk/sit 캐릭터는 이번 조사 범위(공식 CC0/CC-BY
배급처 3곳)에서 찾지 못했다 — `ASTRA_ASSET_AUDIT_2026-09-21.md` §14-1이
이미 예견한 "캐릭터 아트 스타일 방향은 순수 미술 의사결정"이라는 판단이
이번 조사로도 재확인된다. 기존 자산과 톤을 맞추려면 신규 제작(사람 또는
AI 생성 + 라이선스 문서화)이 필요해 보인다는 것이 이번 조사의 관찰이며,
이는 결정이 아니라 관찰임을 명시한다.

---

## 확인 못한 점 (정직하게 기록)

- itch.io의 무료(name-your-own-price) zip 다운로드는 결제/세션 기반 플로우를
  요구해(정적 `curl`로는 다운로드 URL을 얻지 못함) rgsdev 후보의 **실제 zip
  파일은 받지 못했다.** 공개 프리뷰 이미지 2장(정적 이미지 1장 + gif
  애니메이션 1장)만 다운로드해 육안 확인했다 — sit 포즈 부재 판정은 이
  2장의 프리뷰 범위 내에서 내린 결론이며, zip 안에 프리뷰에 없는 추가
  포즈가 있을 가능성을 완전히 배제하지는 못한다(단, 페이지 자체 설명도
  "Idle/Walk animation, Jump animation, Death FX/Explosion"만 언급하고
  sit을 언급하지 않아 정황상 일치한다).
- GrafxKid/Kenney 두 후보는 스타일 불일치가 페이지 정보만으로 이미 명확해
  실제 아카이브를 다운로드하지 않았다(§4 판정 근거 참고) — 요청서의 "SHA-256
  of the downloaded archive"는 이 두 후보에 대해서는 산출하지 못했다.
## 저장된 파일 (연구 폴더 내)
- `downloads/page.html` — rgsdev itch.io 페이지 원본 HTML
- `downloads/rgsdev_preview_1.png` — 630×500 프리뷰 이미지(원본 URL:
  `https://img.itch.zone/aW1nLzEzNTQyNzUxLnBuZw==/original/axxGR6.png`)
- `downloads/rgsdev_anim1.gif` — 8방향 idle 애니메이션 프리뷰(원본 URL:
  `https://img.itch.zone/aW1hZ2UvMjI4NTEwMi8xMzU0Mjc1Ni5naWY=/original/sc8Y5E.gif`)
