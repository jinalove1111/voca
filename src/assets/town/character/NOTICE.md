# Paul 캐릭터 스프라이트 — 출처(NOTICE)

`src/assets/town/character/`의 8종 캐릭터 스프라이트(각 1x 96×128 + @2x
192×256, 총 16개 PNG)의 프레임별 출처 기록이다. LICENSE.txt와 함께 읽는다.

- 생성 도구: ChatGPT 이미지 생성 기능. 모델/버전: 운영자가 기록해두지 않아
  특정할 수 없음("ChatGPT image generation (model version not recorded by
  operator)") — 임의로 버전을 지어내지 않는다.
- 생성 지시자: operator(Paul Easy Voca), 2026-09-24.
- 원본 파일: 1024×1536 RGBA PNG(ChatGPT 다운로드본), 배경 투명.
- 정규화: 균일 스케일 0.08384(= 124/1479), LANCZOS 리샘플, 잉크
  바운딩박스 기준 가로 중심 정렬 + 캔버스 하단 기준 발 접지선 정렬(127행),
  96×128(1x) + 192×256(2x) 캔버스로 리사이즈. 리페인트/리터칭 없음(픽셀
  값은 원본 리샘플 결과 그대로).
- 정규화 도구: PIL 12.3, `normalize_paul.py`(운영자 측 스크립트).
- 승인: operator, 2026-09-24.

## 프레임별 출처

| frameId | 파일(1x/@2x) | 원본 소스 파일명 | 원본 sha256 |
|---|---|---|---|
| idle-front | `paul-idle-front.png` / `paul-idle-front@2x.png` | `ChatGPT Image Sep 24, 2026, 08_23_24 PM.png` | `56f4082a45d2010383f1cb7a49d6058438c68742a508c67c0bf8684841f77f0f` |
| walk-front-a | `paul-walk-front-a.png` / `paul-walk-front-a@2x.png` | `ChatGPT Image Sep 24, 2026, 08_23_31 PM.png` | `16de47829b38106a9624a42a36c8c83bb72b3fe55d89fc2fb68ea32f83620021` |
| walk-front-b | `paul-walk-front-b.png` / `paul-walk-front-b@2x.png` | `ChatGPT Image Sep 24, 2026, 08_23_28 PM.png` | `e45cca13b5da9f5de893239087808f4d8e20fbe10bee75b6763d19c3002ff00a` |
| walk-back-a | `paul-walk-back-a.png` / `paul-walk-back-a@2x.png` | `ChatGPT Image Sep 24, 2026, 08_23_43 PM.png` | `6d949eb6e74f0e1ebb70411831e9fb4d07e630d2ff11d2ff039ec7ac67dc4763` |
| walk-back-b | `paul-walk-back-b.png` / `paul-walk-back-b@2x.png` | `ChatGPT Image Sep 24, 2026, 08_23_35 PM.png` | `acb23978710b7818ef34a714345aee75462d0930775cab33b3bb5d0b83c5022f` |
| walk-side-a | `paul-walk-side-a.png` / `paul-walk-side-a@2x.png` | `ChatGPT Image Sep 24, 2026, 08_25_58 PM.png` | `84d144d4d319e1a6084f960b07d15e5444284dca3a561cc049535f7151666e73` |
| walk-side-b | 보존(미등록, 2026-09-25 v2로 교체) — `paul-walk-side-b.png` / `paul-walk-side-b@2x.png` | `ChatGPT Image Sep 24, 2026, 08_23_39 PM.png` | `653d1b73d93a39884a40e30c129021476ec7ebc2b2b63f2a0f949e7bd3f6fc24` |
| walk-side-b-v2 | `paul-walk-side-b-v2.png` / `paul-walk-side-b-v2@2x.png` | `ChatGPT Image Sep 25, 2026, 12_54_38 AM (2).png` | `23c4a79fe28a2030081f13192d74e1c2bf8fad5bfb595a5ebebe82ccca67ad60` |
| sit | `paul-sit.png` / `paul-sit@2x.png` | `ChatGPT Image Sep 24, 2026, 08_25_51 PM.png` | `e8d801666406de4f1d0285fbb997302072a90280ac92f1c3c3c25ff9cc398f71` |

모든 원본 파일: 1024×1536 RGBA, 배경 투명. 정규화: 위 "정규화" 항목과 동일
(스케일 0.08384, LANCZOS, 잉크 bbox 중심 정렬 + 하단 발 접지선 정렬,
96×128 @1x / 192×256 @2x, 리페인트 없음).

### walk-side-b-v2 (2026-09-25)

운영자 결정으로 walk-side-b 프레임의 아트를 교체했다(frameId
`walk-side-b`는 변경 없음, 등록 파일만 `paul-walk-side-b-v2.png`/`@2x`로
전환). 레거시 `paul-walk-side-b.png`/`@2x`는 디스크에 그대로 보존하되
`paulSpriteManifest.js`/`index.js` 어디에서도 더 이상 import하지 않는다.
원본 파일: 1024×1536 RGBA, 배경 투명. 정규화: 위와 동일한 파이프라인,
동일 스케일 0.08384(기존 8장과 동일 s=124/1479 고정 재사용, 재도출 아님).

실측 검증 이력: `node scripts/spriteIngestPaul.mjs --check`, 2026-09-24 —
68개 항목 전부 PASS(프레임 누락 0, alpha 투명도, 발 접지선, 중심축, 모바일
렌더 크기, 상태 연결 포함). `node scripts/spriteIngestPaul.mjs --check`,
2026-09-25(walk-side-b-v2 교체 후 재실행) — 68개 항목 전부 PASS(동일
검증 항목, walk-side-b 프레임이 v2 아트로 검사됨).
