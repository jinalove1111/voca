# AI_WORKFLOW.md — 제품/기능 개발 전용 11단계 워크플로우

_작성: 2026-07-19(Engineering Head, 순수 문서 세션). `src/`/`api/`/`*.sql`/
`package.json` 변경 0건._

## 이 문서와 `DEVELOPER_GUIDE.md` "AI 세션 표준 워크플로우"(13단계)의 차이

**두 워크플로우는 겹치는 두 번째 문서가 아니라 서로 다른 작업 유형을
위한 전문화된 버전입니다** — `CLAUDE.md` 규칙 13(재구현 금지)의 정신을
문서 자체에도 적용한 결과입니다.

| | `DEVELOPER_GUIDE.md`의 13단계 | 이 문서(`AI_WORKFLOW.md`)의 11단계 |
|---|---|---|
| 범위 | **범용 엔지니어링 워크플로우** — 버그 수정, 인프라, 리팩터링, 문서/스크립트 작업 전부 포함 | **제품/기능 개발 전용** — 특히 게임화처럼 저장소에 아직 없는 것을 새로 설계·구현하는 작업 |
| 시작점 | `PROJECT_BOARD.md` 카드 확인 | 운영자/CTO의 **요청 자체를 해석**하는 단계부터 시작(카드가 아직 없을 수도 있는 상태 전제) |
| 설계 산출물 | 암묵적(1인 세션이면 계획 단계 생략 가능) | **설계안(design doc) 작성이 명시적 필수 단계** — `GAME_DESIGN.md`가 이 단계의 실제 산출물 사례 |
| 승인 게이트 | DDL 실행만 운영자 승인(규칙 8) | **아키텍처 변경이면 항상 운영자 승인** — DDL이 아니어도(새 성장 축, 새 통화 등) 게이트 |
| 문서 갱신 대상 | 6개 문서 + `handoff.md` | 6개 문서 + `handoff.md` + **`PAUL_BIBLE.md`류 제품 비전 문서 + 로컬 Wiki(`wiki/`)** |

**결론**: 이 문서는 `DEVELOPER_GUIDE.md`를 대체하지 않습니다. 겹치는
단계(문서 읽기, 구현 규칙 준수, verify 실행, 최종 build 확인 등)는
**아래에서 링크만 하고 전체 재작성하지 않습니다** — 실제 규칙 본문은
항상 `DEVELOPER_GUIDE.md`가 원본입니다. 버그 수정/인프라 작업에는 이
문서를 쓰지 말고 `DEVELOPER_GUIDE.md`의 13단계를 그대로 쓰세요.

## 핵심 원칙 3개

이 워크플로우 11단계 전체를 관통하는 원칙 — 어제·오늘 세션들이 실제로
반복 검증해온 습관에서 추출(`handoff.md` 근거):

1. **시스템 중복 금지.** `GAME_DESIGN.md`가 14개 섹션 전부에서 "기존
   코드의 실제 필드/함수/테이블을 인용하며 재사용 vs 신규를 판단"한
   것이 이 원칙의 실례 — 예를 들어 별(XP) 시스템을 새로 만들지 않고
   기존 `total_xp`/`addStars()`를 그대로 재사용하기로 결정했습니다.
2. **기존 아키텍처 확장 우선.** 티켓 잔액을 새 병합 정책으로 발명하지
   않고 기존 `diaryPlacements`/tombstone(append-only + id 합집합) 패턴을
   재사용한 것(`GAME_DESIGN.md` 4번 섹션), House 팀 소속을 `classes`에
   얹지 않고 별도 FK로 분리해 기존 학사 개념과 뒤섞지 않은 것(6번
   섹션)이 실례.
3. **기능 발명 금지 — 문서·코드 근거 없이 "이미 있다고 가정"하지
   않기.** 이건 이 저장소가 실제로 반복 위반할 뻔했다가 잡아낸
   습관입니다:
   - `ARCHITECTURE.md` "Word King 관련 확인 결과" — 과거 세션에서
     구두로 언급됐을 수 있는 "Word King"이 실제로는 코드/스키마/
     계획 문서 어디에도 존재한 적이 없음을 대소문자 무관 grep
     전수 확인으로 밝혀낸 사례. 확인 없이 "이미 부분 구현됐을
     것"이라 가정했다면 존재하지 않는 걸 참조/확장하려는 실패가
     났을 것입니다.
   - `PROJECT_GUIDE.md` 문서 지도의 `ADVANCED_FEATURES.md`/
     `EXPANSION_GUIDE.md`/`IMPLEMENTATION_SUMMARY.md` 항목 —
     이 문서들이 설명하는 `api/hiddenFeatures.js`/
     `components/HiddenFeatures.jsx`/`config/dataSchemas.js`가
     **문서에는 있지만 실제 저장소에는 존재하지 않는 데드코드
     참조**였음이 2026-07-18 유지보수성 감사에서 확인되어 삭제됨
     — "문서가 말하는 기능 = 실제로 존재하는 기능"이 아닐 수 있다는
     반복 교훈.
   - `config/features.js`의 `ranking`/`pointSystem`/`leaderboard`/
     `rewardSystem` 플래그 — 이름이 게임화와 겹치지만 이를 읽는
     `useFeatureAccess.js`가 저장소 어디서도 import되지 않는 죽은
     코드임을 grep으로 확인(`GAME_DESIGN.md` 13번 섹션) — 이름만
     보고 "이미 있다"고 가정했다면 죽은 코드를 되살려야 하는 잘못된
     설계로 이어졌을 것입니다.

## 11단계

### 1. 요청 이해
운영자/CTO의 요청을 **어떤 제품 표면**(학생/교사/학부모/게임화 등)에
해당하는지, 새 기능인지 기존 기능의 확장인지부터 명확히 한다. 요청이
모호하면 이 단계에서 되묻는다 — 다음 단계로 넘어가기 전에 범위를
고정한다.

### 2. 문서 검색
`PAUL_BIBLE.md`(제품 비전 진실원천) + `PROJECT_GUIDE.md`(문서 지도) +
`wiki/HOME.md`(주제별 색인, `npm run wiki:search`)로 관련 배경을
찾는다. 겹치는 절차는 `DEVELOPER_GUIDE.md` "AI 세션 표준 워크플로우"
4번 단계(문서 읽기)와 동일 — 전체 재작성하지 않고 그 단계를 그대로
수행한다.

### 3. git 이력 검색
`git log`/`wiki/decisions.md`(설계 결정 로그, "무엇/왜/언제" 형식)로
비슷한 결정이 이미 내려진 적 있는지 확인한다. `DEVELOPER_GUIDE.md` 3번
단계(동시 작업 확인)와 목적은 다르지만 도구(git)는 같다 — 여기서는
"과거에 이걸 왜 이렇게 했는지"를 찾는 것이 목적이다.

### 4. 기존 구현 검색
grep/read로 요청된 기능이 **이미 부분적으로라도 존재하는지** 확인한다
(`DEVELOPER_GUIDE.md` 2번 단계 "완료 여부 재확인"과 동일 원칙, `CLAUDE.md`
규칙 3). 핵심 원칙 3번(기능 발명 금지)의 실행 단계 — "문서에 이름이
있다"만으로 존재를 가정하지 않고 실제 코드를 확인한다.

### 5. 설계안
새 기능이면 `GAME_DESIGN.md` 같은 **설계 문서**를 작성한다(신규 구현
전 필수). 기존 시스템과의 재사용/신규 경계를 섹션마다 명시하고, 저장
위치·병합 정책·GRANT 필요 여부까지 이 단계에서 판단한다 —
`DEVELOPER_GUIDE.md`의 5번 단계(계획 수립)보다 훨씬 무거운, 제품 기능
전용 확장 단계다.

### 6. 아키텍처 변경 시 승인
새 테이블/새 통화/새 성장 축처럼 **구조적 결정**이 포함되면, 구현
착수 전 운영자 승인을 받는다(`CLAUDE.md` 규칙 12 — 학생 대상 신규
기능/게임화는 이번 AI 개발 운영체제 구축 범위에서 절대 금지, 별도
승인 후에만 `PROJECT_BOARD.md` BACKLOG → NEXT 이동). `DEVELOPER_GUIDE.md`
"위험 작업 승인법"의 DDL 승인 절차보다 넓은 게이트 — DDL이 없는
아키텍처 변경(예: 새 성장 축 정의)도 여기서 걸린다.

### 7. 구현
`DEVELOPER_GUIDE.md`의 Development/Coding/Component/Hook/Database
Rules를 그대로 따른다(6번 단계, 겹치는 부분 재작성 없음).

### 8. 검증
`DEVELOPER_GUIDE.md` 7~9번 단계(관련 verify 하네스 실행 → 실패 수정 →
최종 build 확인)를 그대로 따른다. 같은 문제로 3회 연속 실패하면 구현을
중단하고 설계(5번 단계)를 재검토한다(무한 재시도 금지, `CLAUDE.md`
규칙 15와 동일 정신).

### 9. 문서 갱신
`DEVELOPER_GUIDE.md`의 "아키텍처 변경 시 문서 갱신 규칙" 표를 따르되,
제품/기능 개발에서는 **`PAUL_BIBLE.md`류 제품 비전 문서**도 대상에
추가한다 — 새로 구현된 기능이 있으면 해당 섹션의 "⚠️ DESIGN
DIRECTION" 표기를 제거(또는 "구현됨"으로 갱신)하는 것이 이 단계의
핵심 책임이다(그래야 다음 세션이 최신 상태를 신뢰할 수 있음).

### 10. PROJECT_BOARD 갱신
카드를 실제 진행 상태로 이동(`DEVELOPER_GUIDE.md` 13번 단계와 동일
절차) — 게임화 카드는 하위 단계별로 개별 이동한다
(`PROJECT_BOARD.md` "[P3] 게임화" 카드의 10단계 의존성 순서 참고).

### 11. LLM Wiki 갱신
`wiki/HOME.md` 하위 관련 페이지(`decisions.md`에 새 결정 추가,
`glossary.md`에 새 용어 추가 등)를 append한다. **이 단계는
`DEVELOPER_GUIDE.md` 13단계 원안에는 명시적으로 없던, 이 워크플로우가
추가하는 요소**입니다 — 로컬 Wiki가 2026-07-18에 신설된 뒤로 제품
기능 변경이 위키에도 반영되지 않으면 위키가 stale해지는 문제를 막기
위함(`wiki/HOME.md` "이 위키가 다루지 않는 것" 참고, append 원칙은
`wiki/RETRIEVAL_RULES.md`와 동일).

## 이 문서 자체가 지키는 제약

이 문서는 **워크플로우 정의 문서**일 뿐, 학생 대상 신규 기능/UI를
구현하지 않습니다(`CLAUDE.md` 규칙 12) — 위 11단계는 운영자가 실제
착수를 승인한 이후에만 발동되는 절차이지, 이 문서의 존재 자체가 착수
승인이 아닙니다.

## 관련 파일

`C:\voca\DEVELOPER_GUIDE.md`("AI 세션 표준 워크플로우" 13단계, 원본),
`C:\voca\GAME_DESIGN.md`(5번 단계 설계안의 실제 사례),
`C:\voca\PAUL_BIBLE.md`, `C:\voca\PROJECT_BOARD.md`, `C:\voca\CLAUDE.md`,
`C:\voca\wiki\HOME.md`, `C:\voca\wiki\decisions.md`,
`C:\voca\PROJECT_GUIDE.md`(`ADVANCED_FEATURES.md` 등 데드코드 참조
사례 근거)
