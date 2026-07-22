# 09 — 코드베이스 감사 보고서 (Codebase Audit)

_작성: 2026-07-23. 분석·보고 전용 세션 — 이 문서를 만들면서 프로덕션 코드/SQL은
한 줄도 수정하지 않았다. 모든 발견은 실제 grep/read/빌드 실행으로 실측했고,
각 항목에 파일:줄 근거를 인용한다. 추측으로 넣은 항목은 없다. "이미 handoff.md/
ROADMAP.md에 기록된 부채"와 "이번 감사에서 새로 확인한 부채"를 구분해 표기한다._

## 0. 저장소 규모 스냅샷 (실측)

| 지표 | 값 | 근거 |
|---|---|---|
| `src/` 총 라인 수 | 약 18,769줄 | `wc -l src/**` 실측 |
| 학생/공용 컴포넌트 | 41개 (`src/components/*.jsx`) + 관리자 5개 (`src/components/admin/*.jsx`) | 파일 목록 실측 |
| 서버리스 함수 | `api/` 13파일 = 배포 함수 12개 + 공유 헬퍼 1개(`api/_pinAuth.js`, 언더스코어 접두라 미배포) | 파일 목록 실측 |
| SQL 마이그레이션 | 25개 = 버전 넘버링 23개(`supabase_v1_3`~`supabase_v3_4`) + 무버전 2개(`supabase_spelling_direction_schema.sql`, `supabase_spelling_test_schema.sql`). 버전 시퀀스에 `v2_2` 결번 존재 | `ls *.sql` 실측 |
| 커밋 수 | 382 | `git rev-list --count HEAD` |
| 세션 로그 | `handoff.md` 4,078줄 | `wc -l` 실측 |

---

## 1. 중복 코드

### 1-1. `isMissingTableError` — 완전 동일 사본 3곳 + 변형 2곳 + 인라인 2곳

"테이블 부재 감지" 헬퍼가 v2.9에서 공용 헬퍼로 만들어졌다고 기록됐지만
(`handoff.md` 2026-07-21 1차 — "isMissingTableError()(테이블 부재 감지 공용
헬퍼)"), 실제로는 **export되지 않아** 이후 세션들이 파일마다 다시 복제했다:

- 원본(미export): `src/utils/wordLibrary.js:1009-1014`
- 완전 동일 사본: `src/utils/readingApi.js:20-25` (v3.3), `src/utils/sentenceProgressApi.js:20-25` (v3.4)
- api/ 변형(서로 동일): `api/compute-word-king.js:28` = `api/start-new-season.js:26`
- 그 외 인라인 변형 2곳 (에러 코드 문자열을 조건식에 직접 씀)

동일성: src/ 3곳은 문자 단위 동일(42P01/PGRST205 + 메시지 텍스트 보조 확인).
통합 위험도: **낮음** — 순수 판정 함수라 wordLibrary.js에서 export 후 나머지가
import하도록 바꿔도 동작 변화가 없다. 단 api/(Node 서버리스)와 src/(브라우저)는
번들 경계가 달라 파일을 억지로 공유하지 말고 계층별 1개씩(총 2개)으로 수렴이
현실적이다.

### 1-2. 화면 공용 UI 컴포넌트 0개 — 헤더/카드 패턴 인라인 복제

- 공용 `Header`/`BackButton`/`Card` 컴포넌트가 존재하지 않는다(`src/components/`
  전수 확인). 뒤로가기 헤더(`← 홈으로/← 홈/← 나가기` 버튼 + 동일 클래스 문자열
  `py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press ...`)가
  **15곳 이상** 인라인 복제: 대표로 `HatCollection.jsx:17`, `WordMuseum.jsx:60`,
  `GrowthAlbum.jsx:24`, `EnglishGarden.jsx:20`, `PaulTown.jsx:44`,
  `Dashboard.jsx:373` — 클래스 문자열까지 동일한 곳이 다수.
- 카드 스타일 조합(`rounded-2xl/3xl` + `card-shadow` + `bg-white` 류)은
  **36개 파일에서 246회** 등장(실측 카운트).
- 통합 위험도: **중간** — 시각적으로는 동일해 보여도 화면별 미세 차이(색상
  변형 `text-purple-600` vs `text-purple-400`, 라벨 텍스트)가 있어, 공용화는
  "새 화면부터 공용 컴포넌트 사용 + 기존 화면은 건드리지 않음" 점진 전략이
  안전하다(규칙 1: 기존 플로우 무손상).

### 1-3. TTS 정지(cancel) 우회 호출 복제

- `src/utils/speech.js`가 단일 재생 진입점(`speak()`)과 내부 정지 로직을
  갖고 있지만 **정지 함수가 export되지 않아**, `QuizGame.jsx`가
  `window.speechSynthesis.cancel()`을 **4곳에서 직접 호출**한다
  (`QuizGame.jsx:54, 264, 298, 322`). 신규 `SentenceLearningFlow.jsx:169-170`도
  인라인 우회를 스스로 주석으로 인정.
- 위험도: **중간** — speech.js는 Android WebView 무음/큐 꼬임 워크어라운드를
  내장하고 있는데(파일 상단 주석), 우회 호출은 그 워크어라운드를 건너뛰므로
  기기별 재생 버그의 잠재 원인이다. `safeCancelSpeech` export 후 호출부 교체는
  소규모·검증 가능한 리팩터.

### 1-4. localStorage 직접 접근 산재 + 키 네이밍 2규칙 혼재

- `localStorage.getItem/setItem` 직접 호출 **11개 파일 64회**(실측).
- 키 네이밍이 2규칙 혼재: `paulEasyVoca_*`(카멜, 예: `paulEasyVoca_currentStudent`
  — `App.jsx:679`, `paulEasyVoca_features` — `config/features.js:87`) vs
  `paul_easy_*`(스네이크, 예: `paul_easy_progress` — `hooks/useStudent.js`의
  `STORE_KEY`). `features.js`는 같은 키 문자열 리터럴을 4회 반복(비상수화).
- 위험도: 키 문자열 상수화는 **낮음**, 그러나 **기존 키 이름 변경은 절대
  금지** — 전 학생 기기의 로컬 진행도/세션이 그 키에 저장돼 있다(규칙 1).

### 1-5. 에러 무시/빈 폴백 패턴 — 30개 파일 139회

- `catch { /* 무시 */ }` 계열 패턴이 **30개 파일 139회**. 이 저장소의 의도된
  fail-open 관례(학습 흐름 불차단 — `App.jsx:237` 주석 "이 파일 전체의
  fail-open 원칙")이므로 패턴 자체는 버그가 아니다.
- 다만 폴백 값이 문맥마다 달라(`[]`/`null`/`{}`/기본 설정 객체) 일괄 헬퍼화는
  **위험 높음** — 통합하지 말고 1-1의 판정 함수 공유 정도만 안전하다.

### 1-6. 날짜 키 생성 로직 3포맷 공존 (중복 중 최고 위험)

| 계열 | 구현 | 사용처 | 비고 |
|---|---|---|---|
| X. 로컬 ISO `YYYY-MM-DD` | `localIsoDateStr()` `src/utils/wordLibrary.js:51-56` | 숙제/배정 날짜 축 | KST 안전 |
| X'. 동일 로직 재구현 | `fmtDay()` `src/utils/analyticsMath.js:25` | 관찰 레이어 집계 | X와 사실상 동일 — 재구현 중복 |
| Y. `toDateString()` 문자열 | `todayStr()` `src/hooks/useStudent.js:161` | **진행도 실제 영속 키**(캘린더/스트릭/history), milestones/paulTown/paulMemory/`StudyCalendar.jsx` | `"Wed Jul 23 2026"` 형태 |
| Z. `toISOString().slice(0,10)` UTC | `src/components/admin/AnalyticsPanel.jsx:21` | 관리자 관찰 패널 60일 창 | **UTC 밀림 — KST 오전 9시 이전에 날짜가 하루 어긋날 수 있는 알려진 버그 패턴**(analyticsMath에서는 하네스가 같은 버그를 잡아 고쳤다고 `handoff.md` 2026-07-23 관찰 레이어 섹션에 기록됨) |
- 위험도: X↔X' 통합(순수 함수 1개로)은 **안전**. 그러나 Y(진행도 영속 키)를
  X로 바꾸는 "포맷 통일"은 전 학생의 캘린더/스트릭/history 키 마이그레이션이
  필요한 **고위험** 작업 — 절대 가볍게 하지 말 것. Z는 X 방식으로 교체 검토
  가치가 있다(관리자 화면 한정, 학생 데이터 무관).

---

## 2. 미사용 코드 후보 (grep으로 참조 0을 실제 확인한 것만)

방법: 214개 소스 파일 대상 단어 경계(`\bNAME\b`) 정적 참조 스캔.
`node_modules`/`dist`/`scripts/.tmp`(생성 번들)/`.claude/worktrees`(별도
체크아웃) 제외. **동적 import(`React.lazy(() => import(...))`)와 문자열 참조까지
확인**했다. "플래그 OFF지만 import는 살아있는" 코드는 미사용으로 분류하지 않았다.

### 2-1. 참조 완전 0 — 확정

| 항목 | 근거 |
|---|---|
| `src/hooks/useFeatureAccess.js` **파일 전체** (`canRenderFeature`/`canRenderAnyFeature`/`debugFeatureAccess`) | 소스 코드 참조 0. `.md` 문서(ARCHITECTURE.md, EXPANSION_GUIDE.md:235/572 등)에서만 언급되며 문서 스스로 "어디서도 import되지 않는 죽은 코드"라 서술 — **기록된 기지 부채** |
| `src/utils/wordLibrary.js:322` `getTextbookById` | 정의 1회뿐, 자기 파일 내부 호출도 0 — **신규 발견**(v3.1 교재 레이어 작성 시 잉여로 남은 것으로 추정) |
| `src/utils/speech.js:435` `hasSpeechRecognition` | 정의 1회뿐, 외부 참조 0 — **신규 발견** |
| `src/utils/speech.js:705` `listenFor` | 705 정의 + 708 자기 내부 `console.warn` 문자열뿐, 실제 호출 0 — **신규 발견** |
| `scripts/auditLegacyMultiClass.mjs`, `scripts/preMigrationCounts.mjs`, `scripts/testReadingLive.mjs` | package.json scripts/`tests/harness/registry.mjs`/코드/문서 어디에도 참조 0 — **신규 발견**(일회성 마이그레이션 검증 스크립트 잔재로 추정) |

### 2-2. "export만 잉여" (외부 import 0, 내부에서는 사용 — 코드는 살아있음)

`matchGame.js`의 `FILLER_MEANINGS`/`shuffle`, `wordLibrary.js`의
`memoryTipFor`(내부 :1783 사용)/`getStudentsInHouse`(내부 :888/:917),
`speech.js`의 `playAudioUrl`(내부 :308/:337), `attachment/attachmentCore.js`의
`parseHistoryKey`, `attachment/milestones.js`의 `CLEARED_MILESTONES`/
`COMEBACK_GAP_DAYS`, `attachment/worldProgress.js`의 `PLOT_STAGE_EMOJI`,
`entranceTest.js`의 `ENTRANCE_DIRECTIONS`, `hooks/useAttachment.js`의
`buildWordsByUnit`(내부 :42 사용) — 총 11건. 삭제 대상이 아니라 `export`
키워드만 제거 가능한 수준(하네스가 나중에 쓸 수 있으므로 급하지 않음).

### 2-3. 미사용이 아님을 확인한 것 (기존 의심 해소)

- **`@anthropic-ai/sdk`는 실사용 중** — `api/generate-audio.js`에서 import.
  `PROJECT_GUIDE.md:15`의 "실제 호출 코드는 미확인 — 사용처 재확인 필요"는
  이 감사로 해소됨(문서 갱신 후보).
- 컴포넌트 46개 전부 도달 가능(App.jsx 정적 19 + lazy 10 + 컴포넌트 간 중첩).
- api 배포 함수 12개 전부 클라이언트에서 fetch됨. package.json 의존성 미사용 0.
- 플래그 OFF 파운데이션(`storyFoundation.js` 등)도 `Bookshelf.jsx`/하네스가
  import — 데드코드 아님.

### 2-4. 역방향 발견 — 존재하지 않는 엔드포인트 참조 (신규 발견)

`src/utils/speech.js`의 `transcribeViaServerSTT`가 `/api/transcribe`를 fetch
하지만 `api/transcribe.js` 파일이 **존재하지 않는다**. 미사용 코드가 아니라
"클라이언트가 없는 서버를 참조"하는 반대 방향의 부채 — 현재는 STT 스텁 폴백
경로라 크래시는 없지만, api/ 12/12 한도(아래 4-3)와 함께 STT 실구현 시의 제약
요인이다.

---

## 3. 대형 컴포넌트/모듈 (줄 수 실측)

| 파일 | 줄 수 | 소견 |
|---|---|---|
| `src/utils/wordLibrary.js` | **2,037** | 반/유닛/단어/배정/교재/설정/하우스/대시보드 조회까지 담는 데이터 계층 단일 파일. 캐시 5종 이상(`_cache`/`_students`/`_dailyAssignments`/`_studentAssignmentsCache`/교재 캐시) 공존 |
| `src/components/AdminScreen.jsx` | **1,537** | 탭 8개+숨김 debug가 한 파일(패널 함수 10여 개 내장: `AdminScreen.jsx:64-1093`). 학생 관리는 2026-07-22 6차에서 `admin/StudentDirectory.jsx`(725줄)로 이미 분리된 선례 있음 |
| `src/hooks/useStudent.js` | **1,345** | 사실상 God-hook: 별/스티커/미션/캘린더/스트릭/스펠링/티켓/XP/모자/밀스톤/병합·복원까지 9~10개 책임(주요 반환 API 30개 이상). `PROJECT_GUIDE.md` "헷갈리는 것 4번"이 인정하는 구조 |
| `src/App.jsx` | **846** | 단일 `screen` 문자열 state 스위치로 **화면 20개** 분기(`App.jsx:482-673`) — 라우터 없음 |
| `src/utils/speech.js` | 750 | TTS/녹음/STT 스텁/오디오 재생 단일 파일 |
| `src/components/Dashboard.jsx` | 736 | 홈 + 내장 하위 컴포넌트 5개(MicPrimeBtn/MissionBar/RecommendationBanner/PaulTownHomeBand/TicketShopCard/NavBtn) |
| `src/components/admin/StudentDirectory.jsx` | 725 | 분리된 지 하루째 — 성장 관찰 대상 |
| `src/components/WordDetail.jsx` | 660 | 학습 코어(발음/예문/퀴즈/스펠링 4단계) — 재사용성은 높음(GuidedSession이 그대로 재사용) |

---

## 4. 기술부채 목록

### 4-A. 이미 handoff.md/ROADMAP.md에 기록된 것 (재확인)

1. **verify 하네스 registry 미등록 5종** — `verify:daily-ritual`(118단언)/
   `verify:attachment`(123)/`verify:analytics`(12)/`verify:reading`(21)/
   `verify:sentence-learning`(49)이 전부 standalone이라 `verify:all`이 실행하지
   않는다. 실측 근거: `tests/harness/registry.mjs:61-199`의 `DOMAINS`에 이 5개
   도메인이 없고, `tests/harness/runAll.mjs:7`이 `DOMAINS`만 순회한다.
   기록 위치: `handoff.md` 2026-07-22 리추얼 §알려진 수용 갭 3, 애착 §알려진 갭
   마지막 항목, `ROADMAP.md` 애착 §후속. **이 문서 작성 시점에 5개로 늘었다는
   점(analytics/reading/sentence-learning 추가)은 신규 확인** — 미등록 하네스가
   기능 추가마다 1개씩 누적되는 추세 자체가 부채다.
2. **`scripts/dbIntegrityAudit.mjs`의 v3.1 교재 모델 미인지** — 반/유닛 일치
   검사가 v2.1 불변식만 검사(`dbIntegrityAudit.mjs:64` — `current_unit_id`의
   유닛이 학생 `class_id` 소속인지)하고 units fetch(`:29`)가 `textbook_id`를
   가져오지 않아, 교재 모드에서 "반≠유닛 보유 컨테이너"가 정상인 학생 4건을
   오탐한다. 기록: `handoff.md` 2026-07-22 8차 §갭("스크립트 갱신 별도 건").
3. **feature flag가 기기 로컬(localStorage)** — `src/config/features.js:88`
   병합 로더 + `paulEasyVoca_features` 키. 전역 킬스위치가 아니라서 "관리자가
   플래그를 저장한 적 있는 기기는 스냅샷이 이겨 새 기본값 ON이 안 먹는" 실제
   한계를 코드 주석이 자인(`features.js:47-51`, `:72` — paulTownBuildings).
   기록: handoff 애착 §갭, 8차 §갭.
4. **Vercel Hobby 함수 한도 12/12 도달(여유 0)** — 배포 함수 12개 = 한도.
   신규 서버 엔드포인트를 1개도 추가할 수 없다(STT `/api/transcribe` 실구현의
   직접 제약). 기록: `handoff.md` 2026-07-21 2차 §7 "신규 엔드포인트 여유 0".
5. **UX 라벨/흐름 갭** — WordDetail 뒤로가기 "← 단어 목록" 하드코딩(가이드
   세션에선 실제로 홈으로 나감, `WordDetail.jsx:584`), GiftReveal 닫기 시
   spellingReview 전환으로 가이드 세션 언마운트, 수여식이 앱 진입 시점 판정.
   기록: handoff 리추얼 §갭 1·2, 7차 §갭.
6. **dead 문서-코드 불일치** — `useFeatureAccess.js`(2-1)와
   `ADVANCED_FEATURES.md` 계열 문서의 스캐폴딩 잔재. 기록: `PROJECT_GUIDE.md`
   문서 지도 마지막 행.

### 4-B. 이번 감사에서 새로 확인한 것

7. **빌드 청크 크기 경고 (실측)** — `npm run build`가 "500 kB 초과" 경고를
   출력하며, 최대 청크는 `pdf.worker` **1,245.45 kB**(관리자 PDF 업로드 전용
   lazy 청크 — 학생 영향 없음), 학생 메인 번들 `index-*.js` **615.80 kB**.
   학생 번들이 이미 615kB라는 점은 저학년 기기/느린 회선에서 첫 로드 체감에
   직결 — Dashboard 정적 import 축소 여지(예: 게임화 하위 카드) 검토 가치.
8. **날짜 키 3포맷 공존** — 1-6 참조. 특히 `AnalyticsPanel.jsx:21`의 UTC
   슬라이스는 이미 같은 세션에서 `analyticsMath.js`가 잡았던 KST 버그 패턴의
   잔존 사례라 우선 교정 후보.
9. **TTS cancel 우회 4곳** — 1-3 참조.
10. **isMissingTableError 재복제 확산** — 1-1 참조. v3.3/v3.4 세션이 각각
    사본을 새로 만들었다 — "공용 헬퍼인데 export 안 됨"이 복제를 유발하는 구조.
11. **localStorage 키 2규칙 혼재/64회 직접 접근** — 1-4 참조.
12. **미사용 확정 6건(함수 3 + 스크립트 3)** — 2-1 참조.
13. **`/api/transcribe` 미구현 참조** — 2-4 참조.
14. **TODO 주석은 단 2건** — `src/utils/paulRankShared.js:292, :301`. 주석
    부채는 사실상 없음(관리가 잘 되고 있다는 긍정 신호).
15. **마이그레이션 시퀀스 결번/무버전 파일** — `v2_2` 결번, 무버전 2개
    (`supabase_spelling_*.sql`). 실행 순서 문서(`DATABASE.md`)와 대조해 신규
    운영자가 헷갈리지 않게 명시할 가치.

---

## 5. 리팩터 후보 (위험도/효익 표)

_아래는 제안일 뿐 이번 세션에서 아무것도 실행하지 않았다. "학생 화면 무변화 +
verify 하네스로 검증 가능"한 것 위주로 위험도를 매겼다._

| # | 후보 | 위험도 | 효익 | 비고 |
|---|---|---|---|---|
| R1 | 신규 하네스 5종 registry 등록 (`tests/harness/registry.mjs` DOMAINS 추가) | **낮음** (테스트 인프라만) | **높음** — `verify:all` 커버리지 복원, 회귀 자동 감지 | 이미 ROADMAP 후속 권장 항목 |
| R2 | `dbIntegrityAudit.mjs` v3.1 인지 (units에 textbook_id 포함 + 컨테이너 반 예외 처리) | **낮음** (감사 스크립트만) | **높음** — 오탐 4건 제거, 무결성 게이트 신뢰 회복 | handoff 8차 명시 후속 |
| R3 | `isMissingTableError` export 통일 (src 1개 + api 1개) | **낮음** | 중간 — 신규 테이블 기능마다의 재복제 중단 | 1-1 |
| R4 | `localIsoDateStr`↔`fmtDay` 통합 + `AnalyticsPanel.jsx:21` UTC 슬라이스 교체 | **낮음** (순수 함수 + 관리자 화면) | 중간 — KST 버그 잠복 제거 | **Y계열(진행도 키) 통일은 별건·고위험 — 여기 포함 금지** |
| R5 | `safeCancelSpeech` export + `QuizGame.jsx` 4곳/`SentenceLearningFlow.jsx` 교체 | 중간 (실기기 재생 검증 필요) | 중간 — Android 재생 버그 잠재 원인 축소 | 1-3 |
| R6 | 미사용 확정 6건 삭제 (2-1) | 낮음 | 낮음 — 코드량 소폭 감소, 혼란 방지 | 삭제 전 grep 재확인 관례 유지 |
| R7 | localStorage 키 문자열 상수 모듈화 (키 이름 변경 없이) | 낮음 | 낮음 | 기존 키 rename 절대 금지 |
| R8 | 공용 `BackHeader`/`Card` 도입 — 신규 화면부터 적용 | 중간 | 중간 — 화면 추가 속도/일관성 | 기존 15+곳 일괄 교체는 비권장(회귀 면적 큼) |
| R9 | AdminScreen 탭별 파일 분리 계속 (dashboard/excel/pdf 패널 → `admin/`) | 중간 | 중간 — 1,537줄 해소, 병렬 작업성(규칙 16 파일 소유 경계) | StudentDirectory 분리 선례 그대로 |
| R10 | useStudent.js 도메인 분해 (티켓/모자/스펠링 큐를 하위 모듈로) | **높음** — 진행도 영속·병합 로직 회귀 위험 | 높음(장기) | 착수 전 `verify:persistence` 확장 + 규칙 15(회귀 재현 우선) 필수 |
| R11 | 학생 메인 번들 615kB 축소 (Dashboard의 게임화 하위 카드 lazy화 등) | 중간 | 중간 — 첫 로드 체감 | 번들 해시 대조 배포 검증 관례로 확인 가능 |

## 6. 총평

- **잘 관리되고 있는 것**: 데드 의존성 0, 미사용 컴포넌트 0, TODO 2건, 모든
  신규 기능에 하네스 동반, fail-open 폴백 일관성, 파일 소유 경계(규칙 16)가
  실제로 admin/ 분리 같은 구조 개선으로 이어짐.
- **누적 추세가 걱정되는 것**: ① registry 미등록 하네스가 3→5종으로 증가
  (기능 속도가 테스트 인프라 통합 속도를 앞지름), ② 공용화 안 된 헬퍼
  (isMissingTableError/safeCancelSpeech)가 세션마다 재복제됨, ③ 날짜 키
  3포맷처럼 "각자 옳게 만들었지만 서로 다른" 저수준 관례.
- **가장 저렴하고 효과 큰 다음 한 걸음**: R1+R2 (테스트/감사 인프라를 현재
  모델에 맞추는 것 — 학생 코드 무접촉).
