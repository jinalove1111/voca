# Paul Town 2.5D 프로토타입 — 학생 파일럿 직전 품질 정리 (2026-09-25)

> 이 문서는 `paulTown2_5d` 플래그(기본 `false`)로 격리된 Paul Town 2.5D
> 캐릭터 프로토타입을 **학생 대상 파일럿에 앞서** 읽을 상태 요약이다.
> Production WRITE/DB/워크플로우 변경은 이 세션(179차, 2026-09-25) 동안
> 0건이며, PR #62는 OPEN/Draft를 유지한다. 상세 작업 로그는
> `handoff.md` 2026-09-25(179차) 섹션, 결정 대기 항목은
> `DECISIONS_PENDING.md`를 참고한다.

## 1. 지금 프로토타입이 하는 것

- **탭 이동**: 화면을 탭하면 목표 지점으로 Paul이 걸어간다.
- **경로탐색**: 40×76 걷기 격자 위 8방향 BFS(코너 컷팅 금지) + 경로
  단순화(string-pulling). 2026-09-25 world-space 정확 교차 계산으로
  교체(§2 "결함 D1" 참고) — 장애물 모서리를 스치는 지름길 버그를 고쳤다.
- **장애물**: 데모 건물/벤치/나무 3종에 막혀 우회 경로를 계산한다.
- **깊이감**: y좌표 기반 depth scale과 z-index(뒤/앞 배치), 발 그림자.
- **벤치 앉기/일어서기**: 벤치까지 걸어가 앉고, 다시 일어나 나간다.
- **Paul 스프라이트 8프레임**: idle-front, walk-front a/b, walk-back a/b,
  walk-side a/b(2026-09-25부터 b는 v2 프레임, a는 무변경), sit. 좌측
  이동은 side 프레임을 `scaleX(-1)` 미러링해 재사용한다.
- **reduced-motion**: OS 설정이 "모션 줄이기(reduced-motion)"일 때
  단일 정지 프레임으로 걷기(사이드 걷기 포함), bob(상하 흔들림)
  애니메이션 없음.
- **@2x 실패 시 이모지 폴백**: 스프라이트 이미지 로드 실패 시 2x부터
  1x로 한 단계 낮춰 재시도하고, 그래도 실패하면 이모지(🚶/🧘)로
  안전하게 대체한다(2026-09-25 추가, §3 Q2). 단위 테스트뿐 아니라
  실제 브라우저에서 두 경로("@2x만 실패 → 강등된 1x 렌더", "@2x+1x
  모두 실패 → 이모지")를 검증하는 E2E S15(13단언, 커밋 `b5430e9e`)로
  실측 확인됐다(§2 "sticky-global 강등" 참고).
- **플래그 게이트**: `paulTown2_5d` 기본 `false`. OFF면 이 화면/청크/
  네트워크 호출이 전혀 로드되지 않는다(`src/App.jsx` 확인).

## 2. 알려진 한계

- **[O1] 모바일 정보 토글 HUD 버튼이 탭을 가로챔**: 화면 좌상단 부근
  (world-% 기준 대략 x 12–231, y 12–56px)의 정보 토글 버튼 영역에서
  탭이 이동 대신 HUD를 연다. 좁은 화면일수록 캐릭터 이동 시작 지점과
  겹칠 여지가 있다 — `DECISIONS_PENDING.md` 참고.
- **[O2] 화면 상단 경계에서 스프라이트가 뷰포트 밖으로 나감**: world
  y≈4 부근에서 캐릭터 bounding box가 뷰포트 상단을 넘어선다(캐릭터
  앵커가 발 기준 하단 정렬이라 위쪽 여백이 부족한 지점 존재).
- **키보드/스크린리더 경로 없음**: 탭/클릭 전용이며 키보드 이동, 포커스
  트랩, ARIA 라이브 리전 갱신 등 접근성 경로가 없다(overlay에
  `role="region"`+`aria-label`은 2026-09-25 추가됐으나 포커스 트랩은
  없음, §3 Q3).
- **@2x 강등이 "sticky-global"**: 한 번이라도 @2x 이미지 로드가
  실패하면, 그 세션 동안 다른 프레임/다른 이미지의 @2x 요청까지 전역
  으로 1x로 강등된 상태가 유지된다(프레임별로 독립적으로 재시도하지
  않음). 2026-09-25 독립 검토(Phase 8)가 이를 결함이 아니라 의도된
  안전장치(fail-safe)로 확인했다 — 한 번 실패한 네트워크/캐시 상태에서
  프레임마다 반복 재시도해 추가 실패를 만들지 않기 위함. E2E S15로
  실측 검증됨(§1 참고).
- **leg 단위 facing 재계산**: 걷기 경로가 여러 leg로 꺾일 때 facing은
  leg마다 그 leg의 `dx`로 재계산한다(leg 진행 방향이 곧 바라보는
  방향). 2026-09-25 `FACING_MIN_DX_PCT` 가드로 순수 수직 leg(예:
  `walkBack`)에서 facing이 잘못 뒤집히는 것을 예방했다(관측된 결함이
  아니라 사전 하드닝).
- **@3x 자산 없음**: 1x/@2x만 존재. 고밀도(@3x) 디바이스는 @2x를
  업스케일해 표시한다.
- **애니메이션 cadence가 보행 속도(stride)에 동기화되지 않음**: 프레임
  전환 주기가 고정값이고 실제 이동 속도와 연동되지 않는다.
- **HUD 탭 영역이 이동 탭 영역과 분리돼 있지 않음**([O1]과 동일 이슈의
  원인).
- **학생 진입점 없음**: 학생이 실제로 도달할 수 있는 화면/버튼이 아직
  없다(플래그 OFF + 진입 UI 미배선) — 파일럿 전 결정 필요
  (`DECISIONS_PENDING.md`).

## 3. 모바일 실기기 확인표

에이전트 측정(자동화된 뷰포트 시뮬레이션, Playwright)은 아래 "결과(에이전트)"
열에 이미 채워져 있다. "결과(실기기)"/"일시"/"확인자" 열은 운영자가
실제 모바일 기기에서 확인한 뒤 채운다(§6 체크리스트 참고).

| 뷰포트 | 확인 항목 | 결과(에이전트, 2026-09-25) | 결과(실기기) | 일시 | 확인자 |
|---|---|---|---|---|---|
| 360×640 | 도착 오차 / 프레임 지속 / A↔B 전환 횟수 / depth scale / 발선-그림자 정렬 / z-index / 앉기 seatPct / 가장자리 탭 clamp / 뷰포트 높이 변화 시 world-% 유지 / reduced-motion 정지 프레임 | PASS(11/11) — 도착 오차 0, 프레임 지속 ≤141ms, side 걷기 A/B 전환 12/8회, depth scale 0.9714(=depthScale(y)) | | | |
| 390×844 | 상동 | PASS(11/11) — depth scale 0.5643(=depthScale(y)), 그 외 상동 | | | |
| 412×915 | 상동 | PASS(11/11) — depth scale 1.1765(=depthScale(y)), 그 외 상동 | | | |
| 1280×800 | 상동 | PASS(11/11) — 데스크톱 대조군, 그 외 상동 | | | |

공통 확인(4개 뷰포트 전부): 발 접지선-그림자 중심 Δ0px, z-index가
depthKey 기준 뒤/앞 정확히 일치, 앉기 seatPct가 벤치 seat 기준
소수점 4자리까지 일치, 가장자리 탭이 [2,98] world-%로 clamp, 뷰포트
높이 변화(예: 모바일 브라우저 주소창 접힘/펼침) 시에도 world-% 위치
유지, reduced-motion에서 side 걷기가 단일 프레임(`walk-side-a`)으로
고정되고 bob 애니메이션 없음.

측정 방법: 위 "결과(에이전트)" 값은 Playwright로 4개 뷰포트를 순회하며
`page.evaluate`로 DOM 스타일/좌표를 직접 읽는 결정론적 측정이다(수동
스크린샷 육안 판단이 아님). 상세 스펙/좌표 계산식은
`tests/e2e/townProto25d.spec.mjs`의 해당 섹션과 `handoff.md`
2026-09-25(179차) §4 참고.

## 4. 에셋/라이선스 출처

Paul 캐릭터 스프라이트 8종(프레임당 1x+@2x, 총 18개 PNG — 원본
`walk-side-b`(레거시) + v2 포함)은 `src/assets/town/character/`에 있다.

- 출처/라이선스 요약: `src/assets/town/character/LICENSE.txt`
  (ChatGPT 이미지 생성, 운영자 직접 지시로 생성, 2026-09-24 생성/승인,
  라이선스는 proprietary — operator-owned generated artwork, 제3자
  재배포용 아님).
- 프레임별 상세 출처(원본 파일명, sha256, 정규화 방법): `src/assets/
  town/character/NOTICE.md`.
- `walk-side-b-v2`(2026-09-25 신규 채택): 원본 `ChatGPT Image Sep 25,
  2026, 12_54_38 AM (2).png`, sha256 `23c4a79f…`. 레거시
  `paul-walk-side-b.png`/`@2x`(원본 sha256 `653d1b73…`)는 디스크에
  보존되며 레지스트리(`PAUL_SPRITE_FILES`)에서만 제외돼 있다 — 삭제
  여부는 `DECISIONS_PENDING.md` 항목.

## 5. 롤백 방법

- **플래그 OFF (즉시, 권장 1차 수단)**: `paulTown2_5d`를 `false`로
  유지/복귀하면 이 화면 전체가 로드조차 되지 않는다. 코드 변경 불필요.
- **코드 롤백**: 아래 커밋을 역순으로 revert하면 2026-09-25 세션(179차)의
  변경을 걷어낼 수 있다(PR #62 브랜치 기준, origin 최신 커밋은
  `b5430e9e`, 순서는 `handoff.md` 179차 §5 커밋 목록과 동일).
  - `a3824b1f` — pathfinding world-space LOS 수정(D1 결함 수정)
  - `09fe5a62` — Q1(cadence 단위 시간 락)/Q2(@2x→1x 강등)/Q3(오버레이
    region 라벨)
  - `4982d933` — E2E S14(전환 행렬, 52단언)
  - `193b1e42` — Q4 정리(스테일 주석, 상수화 등 행동 변화 없는 5건)
  - `b5430e9e` — E2E S15(@2x 강등 실측 검증, 13단언)
- **자산 롤백**: `walk-side-b-v2` 이전 상태로 되돌리려면
  `PAUL_SPRITE_FILES['walk-side-b']` 매핑을 레거시
  `paul-walk-side-b.png`/`@2x`로 되돌린다 — 레거시 파일은 디스크에
  그대로 보존돼 있어 파일 자체를 복구할 필요가 없다.

## 6. 운영자 5분 Preview 체크리스트

Vercel Preview에서 운영자 본인 기기로 직접 확인하는 절차다(Production
아님 — Preview 배포, SSO 필요, §7 참고).

1. 본인 계정으로 Preview에 로그인한다.
2. 관리자 화면 → 기능 관리 패널에서 `paulTown2_5d`를 ON으로 켠다.
3. 5회 탭으로 확인: 오른쪽 걷기, 왼쪽 걷기, 위로 걷기, 아래로 걷기,
   벤치 쪽으로 걷기(앉기까지).
4. 왼쪽/오른쪽 걷기에서 A↔B 프레임이 번갈아 나오는지(다리가 바뀌는
   애니메이션처럼 보이는지) 확인한다.
5. 왼쪽으로 걸을 때 캐릭터가 좌우 반전(미러링)되는지 확인한다.
6. 벤치에서 앉는 동작과 발 그림자가 자연스러운지 확인한다.
7. 걷는 동안 검은 박스나 이미지 깨짐(클리핑)이 없는지 확인한다.
8. 확인이 끝나면 `paulTown2_5d`를 다시 OFF로 되돌린다.

## 7. 미결정 사항

파일럿 시작 전 운영자 결정이 필요한 항목은 `DECISIONS_PENDING.md`에
모아뒀다 — 키보드/스크린리더 경로, 포커스 트랩, HUD 탭 영역 처리,
학생 진입점 및 파일럿 반 지정 시점, @3x 자산 여부, cadence 동기화,
레거시 `walk-side-b` 파일 삭제 여부, Vercel Preview 공유 링크 보호
설정, V2 S16 자석 드래그 간헐 실패 재현/분리(179차 검증 중 발견,
§8 참고)를 포함한다.

## 8. 검증 결과

| 스위트 | 결과 |
|---|---|
| `testProto25dPathRandom.mjs`(신규) | 16/16 PASS |
| `testProto25dWalkGrid.mjs`(28→37) | 37/37 PASS |
| `testProto25dSpriteAdapter.mjs`(50→70) | 70/70 PASS |
| `testProto25dSpriteContract.mjs` | 177/177 PASS |
| `testPaulSpriteIngest.mjs` | 132/132 PASS |
| `testPaulSpriteAssets.mjs` | 125/125 PASS |
| `testBundleBudget.mjs` | 32/32 PASS |
| `tests/e2e/townProto25d.spec.mjs` standalone(S1–S15) | **392/392 PASS**(379 + S15 13, 5회 연속 재실행 전부 동일 — flake 없음) |
| `npm run build`(HEAD `b5430e9e`/`01450a0d`) | PASS, 경고 0 |
| `npm run verify:all`(HEAD `b5430e9e`) | "ALL DOMAINS: PASS", 142 스위트 PASS/0 FAIL, 약 28분 |
| `npm run verify:e2e` run 1(HEAD `b5430e9e`) | 1718/1720 — S15 타이밍 이슈 2건(제품 코드 무변경, 커밋 `01450a0d`로 수정) |
| `npm run verify:e2e` run 2(HEAD `01450a0d`) | 1718/1720 — S15 PASS로 전환, `[town-v2] S16[390x844,mouse] 자석 드래그 배치 항목17` 간헐 FAIL 2건(179차가 손대지 않은 기존 V2 코드, `BLOCKERS.md`/`DECISIONS_PENDING.md` 참고) |
| `npm run verify:e2e` run 3(HEAD `01450a0d`, 2026-09-25 05:38–05:53 KST) | **1720/1720 PASS, 0 FAIL, 0 SKIP, 미mock 요청 0** — S15 PASS, V2 S16도 PASS해 run 2의 FAIL이 간헐적이었음을 확인 |
| Vercel Preview(HEAD `b5430e9e`, 배포 `6646333620`) 에이전트 GET-only 확인 | 완료 — 200, 로그인 화면 렌더, `Proto25DScreen-BOHDiVxF.js` 청크에 v2 스프라이트/degrade 속성/region 라벨 포함(로컬 빌드와 동일), `/assets/paul-*.png` 16개 200 `image/png`, 저장된 플래그 없음, 로그인 없음(Production WRITE 0) |

179차 검증 체인이 전부 완료됐다(build/verify:all/verify:e2e 3회/
Vercel Preview). 남은 것은 운영자 확인/결정뿐이다 — §6의 운영자 5분
Preview 체크리스트, §3 모바일 실기기 확인표의 "실기기" 열,
`DECISIONS_PENDING.md`의 10개 항목(V2 S16 자석 드래그 간헐 실패
재현/분리 포함). 상세 배경(결함 D1, Q1–Q4, Phase 6/8 리뷰 결과, V2
간헐 실패 근거)은 `handoff.md` 2026-09-25(179차) §2~§3.1, §6~§6.1 및
`TESTING.md` "관련 항목"(179차)을 참고한다.
