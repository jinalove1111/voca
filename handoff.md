# Paul Easy Voca — Handoff
_최종 갱신: 2026-07-17 (v2.0.1 — 출제 방향 기본값 mixed 확정 + 기존 반 일괄 전환)_

## 2026-07-17 오후 — "여전히 한→영만 나온다" 원인 격리 + 기본값 mixed 전환 (커밋 `e02249f`, **push+배포 완료** `index-BjV6lXr5.js` 라이브 일치)

### 원인 판정: 배선 버그 아님 — 기본값 문제 (실증 완료)
- **신규 `scripts/testSpellingDirectionWiring.mjs`** — 실제 SpellingQuestion/
  WordDetail 컴포넌트를 SSR로 렌더해 검증(스텁은 오디오/캐릭터 등 렌더 무관
  모듈만). 11체크 전부 PASS: direction prop이 문제 프롬프트/입력 placeholder를
  정확히 가르고, override가 반 설정을 이기고, **mixed 20문제가 정확히 10:10으로
  렌더됨**. 즉 mixed로 설정만 하면 처음부터 정상 동작했음.
- 실측 원인: 운영자 실반 4개 전부 `spelling_direction='kr2en'`(v2.0 SQL의 컬럼
  default — 기존 동작 보존용 설계) 상태였고 아무도 mixed로 바꾼 적 없음.

### 조치 — 기본값 'mixed' 확정 (운영자 지시: "혼합 50:50이 기본값")
1. **기존 반 일괄 전환(DML, 실행 완료)**: `scripts/opsSetAllClassesMixed.mjs` —
   kr2en인 반만 대상. 결과: **4/4 반 전환**(중2 능률 김기택/Presentation 6 -2026/
   중2 천재 이상기/고1 6월 학평), kr2en 잔여 0, 전/후 스냅샷 로그 확보.
   ⚠️ 이 스크립트는 재실행 금지(이후 의도적으로 kr2en으로 돌린 반을 다시 덮음).
2. **클라이언트 기본값**: wordLibrary.js DEFAULT/폴백/검증 폴백 전부 'mixed'.
   컬럼 부재 상태에서도 mixed 완전 동작(배정은 App.jsx 로컬 계산 — DB 불필요).
3. **관리자 UI**: 셀렉트 기본 표시 mixed, "혼합 50:50 (기본값)" 최상단.
4. **DB 컬럼 default(DDL)**: `supabase_v2_0_1_spelling_default_mixed.sql` 준비만 —
   **운영자 실행 대기. 실행 안 해도 동작 지장 없음**(새 반이 DB default kr2en을
   받아도 클라이언트 기본값·관리자 저장이 우선). 기본값 정합성 마무리용 권장.
- **특정 반만 한→영(기존 방식)으로 되돌리려면**: 관리자 → 반 → 쓰기 시험 설정 →
  출제 방향에서 "한글→영어만" 선택하면 됨(반별 독립).

### 재검증 (기본값 변경 후 전부 재실행, 전부 PASS)
testSpelling(신규 31케이스 포함) · testEntranceTest(47) · testSpellingDirectionWiring(11)
· testSpellingSettings(라이브) · testSpellingV2Db(라이브 14체크) · `npm run build`.
라이브 번들 검증: 학생 `index-BjV6lXr5.js`에 `spellingDirection:"mixed"` 기본값,
관리자 `AdminScreen-C4FYLJaN.js`에 "혼합 50:50 (기본값)" 확인.

### 운영자 실기기 확인 (기본값 전환 후)
1. 아무 설정도 안 바꾸고 학생 쓰기 모드 진입 → **영↔한이 섞여 나오는지**(이제 기본).
2. 마지막 단어 후 방향별 결과 화면("한→영 x/n · 영→한 y/m").
3. (선택) 관리자에서 특정 반을 "한글→영어만"으로 바꾸면 그 반만 예전처럼 나오는지.

## 2026-07-17 — v2.0 쓰기시험 양방향 혼합형 + 채점 관대화 + 교사 검토 큐 (커밋 `ae1863f`~`8f2da25`+관리자 커밋, **push+배포+SQL 적용+라이브 e2e 검증 완료**)

### 상태: ✅ v2.0 SQL 적용 완료 (운영자 실행 확인 2026-07-17 낮)
`supabase_v2_0_spelling_mixed.sql` 실행 완료 — 라이브 실측으로 3요소 전부 확인:
`classes.spelling_direction` / `words.accepted_meanings` / `spelling_review_queue` 테이블.
활성화 e2e `scripts/testSpellingV2Db.mjs` **14체크 전부 PASS**(아래 테스트 절 참고).

### 1. 선행 작업 — 쓰기/입실시험 입력창 시험용 속성 + 정답 병기 (커밋 3개)
- `ae1863f` 정답 노출 시점(정답 화면/4회 오답 공개 화면)에 반대 언어 병기 —
  kr2en이면 영어 정답 크게+한글 뜻 작게 회색, en2kr이면 대칭. 문제 화면에는
  정답 언어 절대 미노출(시험 무의미화 방지). 채점 로직 불변. SpellingReview는
  SpellingQuestion 재사용이라 자동 적용.
- `bc60497` 쓰기시험 입력창(answer/reveal 둘 다): `autoComplete="off"` +
  **무작위 비표준 name**(브라우저 저장 폼 프로필 매칭 차단 — autocomplete=off
  무시 케이스의 실전 보강책) + `inputMode="text"` + 방향별 `lang`(ko/en) +
  onPaste/onDrop/onCopy 차단(붙여넣기 우회 봉쇄). onContextMenu는 안 막음
  (롱프레스 커서 이동까지 막혀 초등학생 UX 훼손 — 붙여넣기는 메뉴 경유라도
  onPaste가 잡으므로 구멍 없음).
  **한계(정직 기록): 키보드 앱 자체 예측 텍스트(삼성 키보드/Gboard의 OS 설정
  영역)는 웹 속성으로 100% 차단 불가** — 위 조합이 속성으로 가능한 최대치.
  완전 차단이 필요하면 학생 기기에서 키보드 설정(예측 텍스트 끄기) 안내 필요.
- `da249db` 입실시험(EntranceTest) 입력창에도 동일 속성 세트 적용(별도 커밋).

### 2. v2.0 본작업 — 양방향 혼합형(mixed) (커밋 4개)
- **채점기(`spelling.js`) 관대화** (`44cc01a`) — 정답 인정 범위가 넓어지기만 하는 변경:
  - 한글 정답 후보 한정 **띄어쓰기 무시**("주문 하다"=="주문하다"). 영어 답에는
    미적용("icecream"!="ice cream" 유지 — 철자 시험 본질 보호).
  - **괄호 합침형** 인정: "영향(을 미치다)" → "영향"(기존)+"영향을 미치다"(신규).
  - **`opts.acceptedMeanings`** — 단어별 추가 인정 뜻이 target과 동일 규칙으로
    후보 합류. 말단 조사 차이("주문을 하다" vs "주문하다")는 **보수적으로 오답**
    → 검토 큐로(AI 자동 판정 금지 — 운영자 방침).
- **방향 배정 공용화** (`44cc01a`) — `entranceTest.js`의 `assignDirections(count, dir)`
  단일 배정기: 입실시험 buildEntranceQuestions와 쓰기 모드 세션(App.jsx)이 공용.
  `'mixed'` = 정확히 반반(홀수면 1개 rng) 후 셔플 — 20문제면 각 10문제 보장.
  'random'(문제마다 50%)은 기존 의미 그대로 유지.
- **데이터 레이어** (`fd59f38`): wordLibrary에 mixed 허용/accepted_meanings
  폴백 조회(컬럼 부재 시 재시도 — SQL 전 배포 안전)/`setWordAcceptedMeanings`
  (중복 제거). `spellingReviewApi.js` 신설 — 학생 기록은 fire-and-forget(테이블
  부재 조용히 스킵), 관리자 조회 null 폴백, 인정/무시는 status 전환(행 보존).
- **앱 배선** (`8f2da25`): 반 설정 'mixed'면 App이 세션 단어 목록에 사전 50:50
  배정 → WordDetail `spellingDirectionOverride`. 쓰기 모드 첫 시도 성적을 방향별
  집계, 마지막 단어 후 **`SpellingSessionResult` 결과 화면**("한→영 8/10 ·
  영→한 9/10 · 총점 17/20" + 틀린 단어 목록). 영→한 오답 중 한글 답은
  `spelling_review_queue`에 기록(첫 시도만, upsert 중복 무시). 복습(SpellingReview)
  은 mixed를 문제마다 랜덤으로 처리(맞을 때까지 반복 구조라 정확 배분 무의미).
- **관리자**: 출제 방향 4택(혼합 추가 — 쓰기 설정+입실시험 패널 둘 다),
  classes 탭 최상단 **"📝 쓰기 답안 검토" 패널**(인정 원클릭 = accepted_meanings
  추가+큐 해소 / 무시), 단어 행 "인정뜻 n" prompt 편집.

### 3. 테스트 (전부 PASS)
- `testSpelling.mjs` — 10~13절 신규 31케이스(띄어쓰기/괄호 합침/acceptedMeanings/
  mixed 50:50 배분) 포함 전체 PASS. 영어 답 회귀 케이스("ap ple"!="apple",
  "icecream"!="ice cream") 명시 확인.
- `testEntranceTest.mjs` 47체크 회귀 PASS(mixed 추가 후 재실행).
- **신규 `testSpellingV2Db.mjs`(라이브 DB e2e, SQL 적용 후) 14체크 전부 PASS**:
  ①mixed 저장/조회 라운드트립 ②accepted_meanings 저장(중복 제거)→채점 반영
  ③검토 큐 기록/중복 무시/words embed 조회/원클릭 인정→재채점 정답 ④반 삭제
  cascade 고아 행 0. 실행법: buildWordLibBundle 후 WORDLIB_BUNDLE 지정(파일 상단).
- 회귀: testProgress(전체)/testSpellingSettings(라이브) PASS. 매 커밋 `npm run build` 통과.

### 4. Push/배포
- 전 커밋 push → Vercel 자동배포 → 라이브 번들 `index-BbseIAa2.js` 로컬 일치 +
  핵심 문자열(쓰기 시험 결과/spelling_review_queue/accepted_meanings/영어 보고
  한글 뜻 쓰기) 확인. 관리자 청크 `AdminScreen-R_Zs9LjM.js`에 검토 패널/인정뜻/
  혼합 옵션 문자열 확인.

### 5. 운영자 실기기 확인 목록 (Android Chrome/삼성 인터넷, 5분)
1. 쓰기시험 정답/공개 화면에 **한글 뜻 병기**가 보이는지(영어 굵게+한글 회색).
2. 입력창에 "orde"까지 쳤을 때 **추천어 억제** 여부 — 안 되면 키보드 예측
   텍스트(OS 설정)가 원인(위 1절 한계 참고), 속성으로는 최대치 적용된 상태.
3. 입력창 **붙여넣기 차단**(길게 눌러 붙여넣기 시도 → 입력 안 됨).
4. 관리자 → 반 → 출제 방향 **"혼합"** 저장 → 학생 쓰기 모드에서 영↔한이
   섞여 나오고 마지막에 **방향별 결과 화면**이 뜨는지.
5. 영→한 문제에서 그럴듯한 다른 한글 뜻 입력(오답) → 관리자 classes 탭
   "쓰기 답안 검토"에 올라오는지 → **인정** → 같은 답이 다음부터 정답인지.
6. 한글 답 띄어쓰기 차이가 정답 처리되는지(예: 등록 뜻 "주문하다"에 "주문 하다").

## 2026-07-17 — P0 프로덕션 크래시: PIN 초기화/재설정 후 재로그인 직후 forEach TypeError (커밋 `bc49775`, `6b5e0f9`, **push+배포 완료** `index-vRV4evrc.js` 라이브 일치 확인)

### 원인 (스택으로 확정, 추측 아님 — scripts/testLoginRestoreCrash.mjs로 수정 전 코드에서 동일 TypeError 재현)
- **크래시 라인**: `src/App.jsx:154` `spellingWrongToday.forEach(...)` (reviewWordIds useMemo).
- **undefined였던 데이터**: `record.round.spellingWrongToday` — 2026-07-07 쓰기시험 기능(a7f7b04)에서 추가된 필드라, 그 이전 스키마의 round 객체에는 없음.
- **유입 경로 3곳** (전부 재현·수정):
  1. 클라우드 백업 blob 복원(`fetchFullProgress` → useStudent 복원 effect) — 옛 앱 버전이 올린 blob이 정규화 없이 그대로 record가 됨. **크래시가 2s 디바운스 재동기화까지 막아 blob이 영영 옛 스키마로 남는 악순환** — 그래서 "그 학생은 로그인할 때마다 매번" 크래시.
  2. v1.6 이름 키→id 키 lazy 마이그레이션(loadRecord 경로 2) — 이름 키 레코드를 스키마 정규화 없이 verbatim 복사.
  3. 과거 복사로 이미 id 키에 남아있던 옛 스키마 레코드.
- **PIN 초기화와의 연결**: PIN 초기화/재설정 = 강제 재로그인 = 정확히 경로 1(새 기기/빈 로컬 → 백업 복원)·2(옛 기기 → 마이그레이션)를 타는 학생. PIN API 자체는 progress를 안 건드림(확인).

### 수정 (2커밋, src 2파일 +107/-13)
- `bc49775` `src/hooks/useStudent.js`: **`normalizeRecord(raw, id)` 단일 정규화 함수** — freshRecord 기본형과 merge, 모든 배열/객체 필드 `Array.isArray`/typeof 검사, round는 오늘 날짜면 진행값 보존+누락 필드만 채움 / 지난 날짜면 자정 롤오버와 동일 리셋(지난 round가 마운트 후 첫 30초 동안 오늘 진행도로 계산되던 부수 버그도 함께 해결). loadRecord 전 경로 + 클라우드 복원 patch 적용. `restoreChecked` 훅 반환값으로 노출. **기존 값은 절대 삭제/변경 안 함 — 누락 필드만 기본값.**
- `6b5e0f9` `src/App.jsx`: ① 로그인 로딩 게이트 — 로컬 기록 없는 학생은 복원 확인 끝날 때까지(성공/실패/5s 타임아웃) Dashboard 렌더 보류, 로컬 기록 있으면 대기 0. ② ErrorBoundary — 프로덕션은 친절한 안내문("데이터를 불러오는 중 문제가...")+재시도/로그아웃 버튼, 에러 원문은 DEV만. componentDidCatch로 message/stack/componentStack/세션 studentId/href/mode/timestamp 콘솔 기록(**PIN/pin_hash 로그 금지 준수**). 로그아웃 버튼은 세션 정리 후 전체 리로드(비리로드 복귀는 같은 크래시 반복 위험).

### 세션/캐시 점검 결과 (3번 지시 — 감사 결과 추가 정리 불필요 판단)
- 클라이언트 캐시는 전부 **불변 student UUID 키**(`paul_easy_progress`, `paul_easy_sync_meta`, word_status, `_students`) — PIN 초기화/재설정은 UUID를 안 바꾸므로 캐시 혼입 자체가 구조적으로 불가. 이번 크래시도 혼입이 아니라 스키마 문제였음.
- 로그인 시점 검증은 기존에 이미 존재: 세션 UUID 형식 검증(readSession), `handleSelect`의 `refreshStudents()`, 삭제된 학생 감지(getStudentById → 강제 로그아웃). 다른 기기 localStorage를 서버가 못 지우는 한계는 기존 문서화 그대로 — Supabase 학습 데이터는 아무것도 삭제하지 않음.

### 테스트
- **신규 `scripts/testLoginRestoreCrash.mjs`** (buildRaceBundle 필요): 8시나리오 34체크 전부 PASS — ①옛 스키마 blob 복원 ②이름 키 마이그레이션 ③신규 학생(백업 null) ④배열 전부 누락 blob ⑤기록 많은 학생 값 보존 ⑥stale 날짜 round ⑦restoreChecked 게이트 ⑧id 키 옛 스키마. 수정 전 코드에서는 ①②⑥이 프로덕션과 동일한 `TypeError: Cannot read properties of undefined (reading 'forEach')`로 FAIL(재현 확정).
- 기존 회귀: testRestoreSyncRace(11) · testIdentityMigration · testProgress(전체) · **testFullProgressBackup(라이브 Supabase 왕복)** 전부 PASS. `npm run build` 통과.
- **실기기(Samsung Internet/모바일 Chrome)는 이 환경에서 불가 — 운영자 확인 필요**: 관리자에서 PIN 초기화→임시 PIN 재로그인 1회(크래시 없이 홈 진입 + 별/스티커/캘린더 유지), PIN 재설정→새 PIN 로그인 1회.

## 2026-07-17 — P5 UI 전체 통일성 (커밋 `3ca02fc`, `525ff6c`, **push+배포**)

헤드리스 브라우저 불가 환경 → 시각 확인이 필요 없는 "기계적 클래스 교체" 수준만 수행.
대규모 리디자인은 실기기 확인 가능할 때로 보류. 아래 인벤토리가 그때의 기초 자료.

### 1. 디자인 토큰 인벤토리 (2026-07-17 기준, src 전수 grep)
사실상 이미 존재하는 디자인 시스템(다수 패턴):
- **Tier 1 페이지 카드**: `bg-white rounded-3xl card-shadow` + p-4~p-8 — Dashboard/WordDetail/QuizGame/SpellingQuestion/StudentSelect/DiaryPage/StudyCalendar/EntranceTest(Admin)/LevelUpMission/MatchGameShell 전부 일치.
- **Tier 2 내부 박스·옵션/보조 버튼**: `rounded-2xl` (틴트 배경 + border-2, 옵션 버튼 p-4) — 일관.
- **Tier 3 입력/칩/배지**: `rounded-xl` 또는 `rounded-full`.
- **그림자**: 커스텀 `.card-shadow`가 표준(71곳). Tailwind `shadow-lg`는 5곳뿐 — 모달 3곳(App.jsx 46/458, AdminScreen 867: `rounded-3xl p-8 shadow-lg` 모달끼리는 서로 일관), MatchGameShell 게임 타일, StudentSelect 로고 이미지.
- **버튼**: `btn-press`(index.css, active scale 0.96) 표준. 전면 CTA는 `w-full py-4~5 rounded-2xl/3xl font-black`.
- **애니메이션**: `animate-slide-up`(26) / `animate-fade-in`(10) 표준, bounce/pulse/wiggle은 포인트용 — 일관.
- **색**: 화면별 테마 컬러가 의도적으로 다름(Dashboard 인디고/퍼플, WordBrowser 블루, Spelling 틸, EntranceTest 로즈, StudyCalendar 앰버). 의미색(성공 green/실패 red)은 전 화면 일치 — 건드리지 않음.

발견한 불일치(이번에 수정한 것):
- ParentScreen 섹션 카드 6곳이 유일하게 `rounded-2xl card-shadow`(페이지 카드인데 Tier 2 radius) → 3xl로 통일. 취약 단어 칩 `rounded-lg`(앱 유일) → xl.
- 터치 타깃: 헤더 "← 홈" 계열 백버튼 7화면(패딩 0, 실높이 ~20px), StudyCalendar 월 이동 ◀▶, SpellingQuestion 힌트 버튼, EntranceTest "모르겠어요" 스킵(py-1), WordBrowser 검색 ✕, ParentScreen 하단 버튼들 — 전부 44px 상당으로 확대.

### 2. 수정 내역 (전부 클래스 문자열 교체, DOM/레이아웃/로직 불변)
- `3ca02fc` ParentScreen: 카드 2xl→3xl 6곳, 칩 lg→xl, py-2/2.5 버튼→py-3, 백버튼 3곳 패딩.
- `525ff6c` 8개 학생 화면 터치 타깃: **`py-3 px-2 -my-3 -mx-2` 패턴(패딩+음수 마진)이라 시각 위치·레이아웃 완전 불변, 히트 영역만 확대.** EntranceTest 스킵 py-1→py-3, WordBrowser ✕는 right-4→right-1+p-3(글리프 위치 동일: 4+12=16px)+btn-press 추가.

### 3. 검증
- 매 커밋 `npm run build` 통과. dist CSS에 `.-my-3/.-mx-2/.p-3/.py-3/.rounded-3xl` 규칙 존재 확인.
- 스모크: `scripts/testProgress.mjs` 전체 PASS (esbuild 번들: react/wordLibrary 스텁 — PROGRESS_BUNDLE 환경변수 필요).
- 로컬 최종 번들 `index-BN4SEG2Y.js` — push 직후 라이브 프로브로 배포 확인(아래 실기기 목록 참고).

### 4. 실기기 확인 권장 화면 (Android Chrome, 1~2분)
1. **ParentScreen(학부모)** — 유일하게 시각적 radius가 커진 화면(카드 6곳 16→24px). 카드 모서리 어색한지.
2. WordBrowser — 검색어 입력 후 ✕ 위치/탭 반응.
3. StudyCalendar — ◀▶ 월 이동 탭 (히트만 커짐, 위치 불변이어야 정상).
4. EntranceTest 응시 중 "모르겠어요, 다음 문제 →" (py-1→py-3, 살짝 도톰해짐 — 의도).
5. 각 화면 헤더 "← 홈" 류 — 보이는 건 이전과 동일해야 함.

### 5. 의도적으로 안 건드린 것 (다음 리디자인 후보)
- WordBrowser 검색바 카드 `rounded-2xl card-shadow` — 화면 내부가 전부 2xl(탭/검색/리스트 행)로 자체 일관이라 유지. LevelUpMission 리스트 행 2xl+card-shadow도 동일한 "리스트 행" 패턴이라 유지.
- 모달 3곳 `shadow-lg`(card-shadow보다 강함) — 오버레이 위 모달은 강한 그림자가 맞을 수 있어 시각 확인 전 보류.
- StudentSelect 로고 `rounded-[20px]`+shadow-lg, DiaryPage 스티커 삭제 버튼 28px(최근 실기기 튜닝 완료분), AdminScreen/DebugPage/FeatureManagementPanel/HiddenFeatures의 rounded-lg·plain shadow(관리자/숨김 화면 — 학생 우선 원칙), 화면별 테마 컬러 차이.

## 2026-07-16 밤 — P7 감사 보안 remediation (커밋 `61ab5c8`→`e1e47da`→`6dcfb98`, **push+배포**)

## 2026-07-16 밤 — P7 감사 보안 remediation (커밋 `61ab5c8`→`e1e47da`→`6dcfb98`, **push+배포**)

P7 감사(3ad7f5c)에서 나온 미수정 보안 항목 처리. 이미 수정된 것(stale 가드 4곳,
pin_hash 응답 노출, localStorage 방어)은 건드리지 않음.

### ⚠️ 운영자가 해야 할 일 — v1.9 SQL (이번 작업의 핵심)
1. **`supabase_v1_9_security_rls.sql`을 Supabase SQL Editor에서 실행** (멱등, 몇 번 실행해도 안전).
   무엇을 막나: 브라우저 anon key로 students의 `pin_hash`/`pin_fail_count`/`pin_locked_until`/`pin_setup_allowed`를
   직접 SELECT(→4자리 PIN 오프라인 브루트포스)/UPDATE(→계정 탈취·잠금 무력화)하던 구멍.
2. 실행 직후 검증: `node scripts/testRlsSecurity.mjs`
   → "✅ 기능 + 보안 전부 통과"가 나와야 함. (지금 미적용 상태에서 돌리면 기능 9/9 PASS +
   보안 6건 FAIL로 "미적용" 안내가 나옴 — 사전 실행으로 확인 완료. 이 FAIL들이 곧 현재 취약점의 실증.)
3. 실기기 스팟체크(1분): 학생 로그인(이름+PIN) → 홈 진입, 관리자 → 학생 목록/반 변경 1회.
4. **만약** 뭔가 이상하면 즉시 롤백(원상 복구, SQL Editor에서):
   ```sql
   grant select, update on table public.students to anon, authenticated;
   notify pgrst, 'reload schema';
   ```

### 1. v1.9 SQL 설계 결정과 근거
- **컬럼 단위 권한(GRANT/REVOKE), RLS 행 정책 아님.** 이 앱은 Supabase Auth를 안 쓰므로
  (학생/관리자 전원이 같은 anon key) 행 단위 정책으로는 "누구인지" 구분 불가 — 잘못 걸면
  로그인 화면 학생 목록부터 전멸. 진짜 위협은 PIN 자격증명 4컬럼뿐이라 딱 그것만 차단.
- **클라이언트 전수 조사(설계 근거, src/ 전체)**: anon이 students에 하는 일은 wordLibrary.js 6곳이 전부 —
  SELECT(id,name,class_id,unit_name,classes(name)+created_at 정렬), INSERT(name,class_id,unit_name RETURNING id),
  UPDATE(class_id/unit_name), DELETE(id). → SQL은 이 전부를 그대로 허용(컬럼 목록은 information_schema에서
  동적 생성이라 컬럼 빠뜨림 사고 없음). INSERT/DELETE는 테이블 단위 유지(자기등록/관리자 삭제가 anon 경유).
- **서버리스는 무영향**: 라이브 프로브로 Vercel에 `SUPABASE_SERVICE_ROLE_KEY` 설정돼 있음을 확인
  (generate-audio가 이 키를 강제 요구하는데 env 에러가 아닌 body 검증 에러를 반환 → 키 존재 증명).
  service_role은 컬럼 권한 회수의 영향을 받지 않음.
- **배포 순서 무관 안전**: 코드가 먼저든 SQL이 먼저든 안 깨짐 — 코드 변경은 students 접근을 안 바꿨고,
  SQL은 클라이언트가 원래 안 쓰는 컬럼만 차단.
- **알려진 영향(앱 아님)**: v1.9 적용 후 anon의 `select=*`(bare select)가 거부됨 — 앱 코드엔 없음(P7에서 제거 완료),
  QA 스크립트들은 이번에 `select('id')` 명시로 정비 완료. testClearStudentPin.mjs의 직접 DB 검증은
  적용 후 자동으로 student-pin-status 부울 검증으로 대체되게 수정해둠(전/후 어느 상태든 PASS).
  이후 마이그레이션에서 students에 클라이언트가 읽을 새 컬럼을 추가하면 `grant select (새컬럼)`을 같이 실행해야 함(fail-closed).

### 2. API 수정 내역 (커밋 `61ab5c8`, `e1e47da` — 코드만으로 즉시 적용)
- **관리자 재인증 (clear-student-pin 패턴 공용화 → `_pinAuth.checkAdminReauth`)**:
  `bulk-generate-temp-pins`(평문 PIN 목록 응답 — 가장 민감), `set-pin-setup-allowed`, `unlock-student-pin`
  이제 요청마다 body.adminPin을 서버에서 재검증. AdminScreen 4개 핸들러가 adminPin 동봉 + not_authorized 시 재로그인 안내.
- **`set-student-pin` 이중 신뢰 모델**(호출자가 둘이라 일괄 게이트 불가): ①무작위 재설정(pin 생략)= 관리자 전용,
  adminPin 필수. ②학생 자기등록(명시 pin)= 인증 없이 허용하되 **대상 row의 pin_hash IS NULL을 서버에서 확인** —
  기존 학생 PIN을 익명 fetch로 덮어쓰는 계정 탈취 차단, 등록 플로우("처음이에요" 탭)는 동작 불변.
- **`verify-admin-pin`**: 실패 시 1.5초 지연만 추가(운영자 지시대로 과설계 없음 — 서버리스 인메모리 카운터는 무의미,
  학생 PIN은 이미 DB 5회 잠금). 성공 응답은 지연 없음.
- **`generate-audio`**: 학생 화면(WordDetail/QuizGame 지연 백필)이 자동 호출하므로 인증 요구 불가 판단.
  최소 방어만 — wordId 실존 검증(없으면 404), 생성 소스(word/meaning/example)를 클라이언트 body 대신 DB row로 고정
  (임의 텍스트로 Anthropic/TTS 비용 태우기 차단), 오디오+예문 완비 단어는 no-op(정상 클라이언트는 그 경우 호출 안 함 — 동작 불변).
- **안 건드린 것**: `student-pin-status` boolean 노출(기능상 필요 — 운영자 지시), 자기등록 경로의 weak-PIN 허용
  (self-set은 거부하지만 등록 탭은 기존대로 — UI 메시지 설계 없이 서버만 막으면 등록 플로우 혼란, 다음 세션 후보).

### 3. 테스트 / 배포
- PIN 스위트 4종 전부 PASS(라이브 DB, 핸들러 직접 호출): testStudentPinAuth(+탈취 시도 거부 3케이스 신규) ·
  testStudentPinSelfSetup(+무인증 거부 2케이스 신규) · testClearStudentPin(+무인증 재설정 거부 신규) · testStudentSelectPinStatus.
- testRlsSecurity.mjs 사전 실행: 기능 9/9 PASS, 보안 6건 "미적용" 정확 감지(위 1번 참고).
- 매 커밋 `npm run build` 통과. push → Vercel 배포 + 라이브 프로브 검증(아래 4).

### 4. 낮은 우선순위 (이번에 안 함)
- pin-status fetch 중복 3곳 공용 헬퍼 정리(시간 캡) · 자기등록 weak-PIN 서버 거부 + UI 메시지 · P5 UI 리디자인.

## 2026-07-16 저녁 — P7 전체 코드 감사 + P6 성능 측정 (커밋 `529ff9e`, **push+배포 완료**)

src/ 전체 + api/ 11개 서버리스 함수 + hooks/utils를 읽기 전용으로 훑고, "동작 불변 + 안전" 기준을 충족하는 것만 수정. 라이브 번들 해시 `index-DxZmNl0i.js` 로컬과 일치 확인.

### 수정한 것 (커밋 `529ff9e`, 5파일 +62/-7)
- **[보안/중간] pin_hash 네트워크 응답 노출**: `wordLibrary.js` setStudentClass/setStudentUnit의 미사용 bare `.select()`가 업데이트된 학생 행 전체 컬럼(pin_hash 포함)을 응답에 실어 내려보냄 → 제거(결과 미사용이라 동작 불변).
- **[안정/중간] localStorage 쓰기 실패 = 앱 전체 크래시**: `useStudent.js` saveStore가 patch()의 setState updater 안에서 불리는데 setItem이 throw(quota 초과/프라이빗 모드)하면 렌더 중 예외 → 전체 크래시. try/catch 방어(in-memory 상태·클라우드 동기화는 계속 동작, 콘솔 warn 1회). saveSyncMetaStore 동일.
- **[레이스/중간] stale 응답 덮어쓰기 — 6dd6c7a PIN 버그와 같은 클래스, fetch→setState 전수 확인 결과 4곳**:
  - `AdminScreen` FutureAssignmentPlanner: 날짜/반 빠른 전환 시 이전 조회의 늦은 응답이 선택 상태를 덮어씀 → **그대로 저장하면 엉뚱한 날짜 배정이 저장되는 데이터 사고 가능** → 요청 번호 가드.
  - `AdminScreen` 반별 현황 load: 반 전환 시 이전 반 데이터 덮어쓰기 → 가드.
  - `EntranceTestAdmin` loadStatus: stale tests의 activeTest로 "시험 종료" 누르면 **다른 반 시험을 닫을 수 있음** → 가드.
  - `EntranceTest`(학생) load: 5초 폴링 vs 제출 직후 load 순서 역전 → 가드.
- 이미 가드돼 있어 수정 불필요 확인: StudentSelect(6dd6c7a에서 수정 완료), EntranceTestBanner(alive 플래그), useStudent 복구 effect(cancelled), App.jsx visible 새로고침(inFlight 가드).

### 발견했지만 수정 안 한 것 (다음 세션용, 심각도순)
- **[구조적 — 중간~치명, 운영자 액션 필요]** 클라이언트 anon key로 students 테이블 직접 SELECT/UPDATE 가능(RLS 미적용 전제) — 이론상 pin_hash를 직접 읽어 4자리 PIN을 오프라인 브루트포스하거나 직접 덮어쓸 수 있음. 서버리스 함수들은 booleans만 내려주도록 잘 설계돼 있지만 진짜 경계는 DB 권한. **권장: Supabase에서 students RLS(또는 컬럼 권한 분리) + Vercel에 SUPABASE_SERVICE_ROLE_KEY 설정** — SQL/대시보드 작업이라 코드만으로 수정 불가, 이번 회차 미수정. (기존 문서화된 신뢰 모델이라 신규 구멍은 아님)
- **[중간]** `api/verify-admin-pin.js` rate limit/잠금 없음 — 학생 PIN은 5회 잠금이 있는데 관리자 PIN은 1만회 무제한 시도 가능. 실패 지연/잠금 추가 권장(동작 변화라 미수정).
- **[중간]** `api/bulk-generate-temp-pins.js` 요청당 관리자 재인증 없음 + 응답에 평문 PIN 목록 — clear-student-pin.js처럼 adminPin 재검증 추가 권장. set-student-pin/set-pin-setup-allowed/unlock-student-pin도 동일(기존 신뢰 모델과 동일해서 보류).
- **[중간]** `api/generate-audio.js` 무인증 — 반복 호출로 Anthropic/TTS 비용 소모 가능. wordId의 REST URL 보간은 eq. 필터 안이라 쿼리 탈출 불가 확인(인젝션 아님). adminPin 게이트 권장.
- **[낮음]** `api/student-pin-status.js` 무인증으로 임의 studentId(UUID를 알아야 함)의 PIN 상태 booleans 조회 가능 — 정보 노출 미미.
- **[낮음]** EntranceTest advance()의 setTimeout(900ms)이 unmount 시 clear 안 됨 — React 18 no-op setState라 실해 없음(finishedRef 가드도 있음).
- **[낮음/중복]** /api/student-pin-status fetch 패턴이 3곳(StudentSelect×2, AdminScreen) — 테스트 보호가 없어 리팩터링 보류.
- **메모리 누수 전수 점검 결과: 없음** — 모든 setInterval/addEventListener에 cleanup 확인(App.jsx, EntranceTest 3곳, EntranceTestAdmin, useMicReady, FeatureManagementPanel 1초 폴링, useStudent 30초+visibility). speech.js 모듈 전역 리스너는 의도적 영구(싱글턴).

### P6 성능 측정 (측정만, 무근거 최적화 안 함)
- 번들: index **515.89KB**(gzip 150.46) → 가드 추가 후 **516.09KB**(gzip 150.65). 500KB 경고는 이번 밤 기능들(P0~P4)로 484→516 성장한 결과 — 치명 아님(gzip 150KB). 코드 스플리팅 후보(EntranceTest/QuizGame 등 화면 lazy)는 **P5 UI 리디자인과 함께** 검토 권장. AdminScreen 408KB(lazy 분리 완료)·pdf 472KB·pdf.worker 1245KB(보류 항목, 손 안 댐)는 변화 없음.
- 입실시험 폴링 합리성 확인: 배너 20초(마운트+visible), 학생 랭킹 5초(result phase+visible만), 관리자 5초(반 선택+테이블 존재+visible만), active 시험 없으면 배너 조회 1개뿐 — 과다 호출 없음.
- 리렌더: 큰 목록 key 전수 확인(RankingList=studentId, 로스터=id, 단어목록 정적 index) — 문제 없음. memo 추가는 측정 근거 없어 안 함.

### 테스트/배포
- 스모크: `testProgress.mjs` PASS · `testEntranceTest.mjs` PASS. 커밋 전 전체 확인분: testStudentLogin/testMultiClass/testSyncProgress/testDashboard/testDailyAssignment/testFutureAssignment/testRestoreSyncRace/testIdentityMigration 전부 PASS. `npm run build` 통과.
- push → Vercel 자동배포 → 라이브 `index-DxZmNl0i.js` 해시 로컬 일치 확인.

### 다음 작업
- **P5 UI 리디자인이 다음 예정**. 그때 함께: 화면 lazy 분리(번들), /api/student-pin-status 중복 정리. 별도 트랙(운영자 결정 필요): students RLS + service role key, admin PIN rate limit.

---

## 2026-07-16 오후 — P3 쓰기시험 게임화 + P4 다꾸 개선 + v1.8 SQL 적용 후 입실시험 e2e 전체 검증 (커밋 `f886b56`→`15b6cf6`→`50274c7`, **push+배포 완료**)

### P3 — 쓰기시험 게임화 (`f886b56`)
표시/피드백 레이어만 추가 — 채점(spelling.js)/오답 4단계/오답노트(spellingWrongToday)/direction(kr2en·en2kr·random) 로직은 한 줄도 안 바뀜.
- **진행 바 + 남은 문제 수**: 쓰기 전용 모드에서 SpellingQuestion 카드 상단에 "문제 n/전체 · 남은 문제 k개" + 정답 순간 차오르는 바(종합 모드는 기존 단계 점 표시와 중복이라 미표시). SpellingReview(오답 복습)에도 동일 진행 바.
- **콤보**: `round.spellingCombo`(연속 "첫 시도 정답" 수, useStudent) — 2연속부터 "🔥 n연속 정답!" 배지(기존 animate-paul-pop 재사용), 첫 시도 오답이면 리셋, 자정에 round와 함께 리셋. 기존 저장 레코드엔 없는 필드라 전부 `(||0)` 방어(하위호환).
- **보너스 별(보수적)**: 콤보 3/5/10 도달 순간에만 +1/+2/+3 (`SPELLING_COMBO_BONUS`, 기존 addStars 단일 경로 재사용). 런당 최대 +6 — 미션 보너스 10/중복 스티커 20 대비 인플레이션 없음. 10 초과는 끊기기 전까지 추가 지급 없음. 마일스톤 정답 순간엔 폴 'levelup' 리액션 + "⭐ n콤보 달성! 보너스 별 +N개" 표시. **복습 화면은 콤보 배지만 있고 별 지급 없음**(맞을 때까지 반복 구조라 무한 파밍 방지, comboStarsEnabled=false).
- 효과음은 기존 playSuccessSound를 이벤트 핸들러 안에서만(에코 싱글턴 가드 유지).

### P4 — 다꾸(Diary) 개선 (`15b6cf6`)
- **X 버튼 재점검 결과(운영자 "완벽 수정" 요구)**: c3a3800의 stopPropagation은 유효했으나, 삭제/회전/크기 버튼이 transform(rotate+scale)된 부모 div 안에 있어 **스티커를 축소(scale 0.4)하면 버튼도 ~10px로 같이 줄어 터치 불가** — 이게 잔존 원인. ✕는 counter-scale(항상 28px)로 고정.
- **버튼식 툴바 신규**(스티커 선택 시 캔버스 아래 표시, 초등학생 기준 버튼식 선택): ↺↻ 회전 15°씩 / ➖➕ 크기 0.2씩(기존 한계 0.4~3 유지) / ⬆⬇ 앞으로·뒤로(레이어) / 🗑 삭제. 예전 스티커 위 미니 드래그 핸들(↻/⤡)은 위 축소 버그의 당사자라 제거(몸체 드래그 이동은 유지). 캔버스 밖 고정 위치 큰 버튼이라 스티커 크기/회전/겹침과 무관하게 터치 안 씹힘.
- **레이어 순서 = 배열 재정렬 방식**(`movePlacementLayer`/`movePlacementInList`): diaryPlacements 배열 순서가 곧 그리기 순서(뒤=위) — **새 필드 0개, 저장 스키마 완전 동일 = 기존 학생 다꾸 배치/클라우드 백업 100% 하위호환**.
- 하위호환 방어: rotation/scale 없는 레거시 배치가 transform 문자열을 통째로 무효화해(undefined 삽입) 위치가 틀어지던 잠재 버그도 수정(`||0`/`||1`).

### v1.8 활성화 검증 (`50274c7`) — 운영자가 SQL 적용 완료한 직후 실행
- **스키마 검증 PASS**: entrance_tests(9컬럼)/entrance_test_results(8컬럼) 라이브 존재 + supabase_v1_8_entrance_test.sql과 일치(REST 명시 select, "없는 컬럼은 에러" 대조군으로 검증 방식 유효성도 확인). unique(test_id,student_id)는 upsert 동작(6절)으로 검증.
- **입실시험 DB e2e 첫 전체 실행 — 33체크 전부 PASS**: 시험 생성→반당 active 1개(자동 close)→3명 응시→공동 1등/VIP/요약→재제출 upsert(새로고침 후 점수 유지=DB 왕복 증명)→종료 후 랭킹 유지→cascade 정리.
- **운영자 지정 시나리오**: ①점수 새로고침 유지(fetchOwnResult/fetchResultsForTests는 매번 DB 신규 조회 — 5·6절) ②학생별 격리(신규 케이스: C 재제출 후 A/B 점수 불변) ③반별 격리(신규 6.5절: 두 번째 반의 fetchTodayTests에 시험 미노출 → 배너/랭킹 원천 격리) ④랭킹/공동1등/VIP 정확성(5절 + 순수 로직 47체크).
- **발견/수정한 문제 1건(앱 버그 아님)**: 5절 "많이 틀린 단어 count===2" 기대값은 오답 학생이 1명뿐인 시나리오에서 구조적으로 불가능 — 테이블 부재로 SKIP만 되던 시절 한 번도 실행 안 된 테스트 작성 오류. 단어별 1회 집계로 정정(교차 학생 집계는 testEntranceTest.mjs 10절이 커버).

### 수정 파일
- P3: `src/hooks/useStudent.js`(spellingCombo+보너스), `src/components/SpellingQuestion.jsx`(HUD/배지/보너스 표시), `src/components/SpellingReview.jsx`(진행 바+로컬 콤보), `src/components/WordDetail.jsx`·`src/App.jsx`(배선), `scripts/testProgress.mjs`(8.7절 19케이스)
- P4: `src/components/DiaryPage.jsx`(툴바/X 수정/하위호환), `src/hooks/useStudent.js`(movePlacementLayer), `scripts/testProgress.mjs`(8.8절 11케이스)
- v1.8: `scripts/testEntranceTestDb.mjs`(격리 케이스+기대값 정정)

### 테스트 결과
- `testProgress.mjs` **전체 PASS**(신규 콤보 19 + 레이어 11 케이스 포함) · `testSpelling.mjs` PASS · `testRestoreSyncRace.mjs` PASS · `testIdentityMigration.mjs` PASS · `testPaulReactions.mjs` PASS · `testTtsSingleton.mjs` PASS · `testSpellingSettings.mjs` PASS · `testEntranceTest.mjs`(순수 로직 47체크) PASS · `testEntranceTestDb.mjs`(라이브 DB e2e) **첫 전체 실행 PASS** · 매 커밋 `npm run build` 통과.
- **검증 못 한 것**: 실기기 터치 UX(다꾸 툴바/콤보 애니메이션 체감, 헤드리스 브라우저 실행 불가 환경) — 코드 리뷰+빌드+라이브 번들 문자열 검증으로 대체. 운영자 실기기 확인 권장: ①쓰기 모드에서 3연속 정답 시 콤보 배지/보너스 별 ②다꾸 스티커 선택→툴바 7버튼 동작 ③축소한 스티커의 X 터치.

### Push / 배포
- P3/P4 push 완료 → Vercel 자동배포 확인: 라이브 `index-DXqferk8.js` 해시 로컬 빌드와 일치 + 핵심 문자열(spellingCombo/연속 정답/콤보 달성/남은 문제/스티커 꾸미기) 전부 포함 확인. v1.8 커밋(50274c7)은 scripts만이라 번들 불변.

### 다음 작업 (백로그)
- P5: UI 다듬기 · P6: 성능 · P7: 접근성/코드 감사. 입실시험 실기기 UX(모바일 키보드/IME/타이머 체감)는 여전히 라이브 미검증 — 운영자 실사용 피드백 대기.

---

## 2026-07-16 밤 — 입실 단어시험(Entrance Word Test) + 실시간 반별 랭킹/오늘의 VIP (커밋 `9744590`→`bc3ec1e`→`ace04e7`→`28f44d9`, **push+배포 완료**)

수업 시작과 동시에 반 학생들이 각자 폰으로 참여하는 단어시험(종이 시험 대체) — P1(시험) + P2(랭킹/VIP/교사 결과 페이지) 전체 구현. 학생 식별은 전부 student_id(UUID), 기존 학생 데이터(별/스티커/캘린더/학습기록)는 일절 안 건드리는 순수 추가 기능.

### ⚠️ 아침에 운영자가 해야 할 일 (이것만 하면 기능이 켜짐)
1. **`supabase_v1_8_entrance_test.sql`을 Supabase SQL Editor에서 실행** (entrance_tests + entrance_test_results 테이블, 멱등 DDL). **실행 전까지 학생/관리자 화면에 아무 변화 없음** — 배너 자체가 안 뜨고 관리자 탭은 "준비 중" 안내만 표시(크래시/콘솔 에러 없음, 라이브 실측 확인 완료).
2. SQL 실행 후 DB 통합 테스트 재실행(현재는 테이블 없어서 안전 SKIP 상태):
   `node scripts/buildWordLibBundle.mjs && node scripts/buildEntranceBundle.mjs && node scripts/testEntranceTestDb.mjs`
   (QA_EntranceTest 반을 임시 생성해 시험 생성→3명 응시→공동1등 랭킹→재제출 upsert→종료→정리까지 검증 후 스스로 삭제)
3. 관리자 화면 → "🏁 입실시험" 탭에서 실기기로 한 번 시험을 돌려보고 UX 확인.

### 구현 내용
- **교사 플로우**: 관리자 "🏁 입실시험" 탭 — 반 선택 → 출제 범위 자동 결정(오늘의 단어 배정 있으면 그것, 없으면 유닛 전체 — v1.3 getStudentWords 폴백 규칙 그대로) → 문항 수/방향(영→한·한→영·랜덤)/제한시간(1~5분) → 시험 시작. 진행 중: 제출 n/반 전체 m명, 실시간 랭킹+VIP, 평균 정답률, 많이 틀린 단어 TOP5, 시험 종료 버튼(5초 폴링, 탭 보일 때만). 같은 반에 새 시험 시작 시 기존 active는 자동 close(반당 동시 1개).
- **학생 플로우**: 로그인 → 홈 최상단 배너("오늘의 입실시험이 시작됐어요!" / 종료 후엔 "오늘의 랭킹 보기", 20초 폴링) → 안내 → 응시(전체 제한시간 타이머, 진행률 바, 문제당 즉시 채점 피드백, "모르겠어요" 패스, 시간 초과 시 미응답=오답으로 자동 제출) → 즉시 결과(내 점수/틀린 단어/반 랭킹+VIP, 5초 폴링) → 결과 자동 저장(student_id upsert, 실패 시 재시도 버튼 — 점수는 로컬에 안전).
- **랭킹**: 정확도 기준 공동 순위(1,1,3 방식), 오늘의 VIP=1등 전원(공동이면 모두 👑), 학생당 오늘 최고 기록 1개만, date 컬럼 조회 조건으로 "오늘만 표시/다음날 자동 리셋"이 구조적으로 보장.
- **시험 단어는 생성 시점 스냅샷(jsonb)** — 같은 반 학생들이 서로 다른 유닛이거나 시험 도중 단어를 수정해도 전원 동일 문제 풀.
- **실시간성은 폴링 채택** — Supabase Realtime은 대시보드 publication 활성화(운영자 액션)가 필요해 "코드 먼저 배포" 제약과 충돌. 테이블 없으면 첫 실패 후 `_available=false` 캐시로 네트워크 재시도조차 안 함.
- **채점 엔진 재사용 + 구멍 수정**: 기존 쓰기시험 엔진(spelling.js isSpellingCorrect) 그대로 재사용(새 엔진 발명 안 함, 향후 Smart Check-in 재사용 가능하게 화면 비종속 모듈로 분리). 작성 중 발견한 실버그 수정 — 뜻 전체("휘젓다, 섞다")를 그대로 정확히 입력하면 오히려 오답 처리되던 문제(대안 분해 비교만 하고 전체 문자열 일치 누락). 정답 인정 범위가 넓어지기만 하는 안전한 수정, 기존 쓰기시험에도 적용됨.

### 신규/수정 파일
- 신규: `supabase_v1_8_entrance_test.sql`, `src/utils/entranceTest.js`(순수 로직), `src/utils/entranceTestApi.js`(DB 레이어), `src/components/EntranceTest.jsx`(학생 화면+배너), `src/components/EntranceTestAdmin.jsx`(교사 패널), `scripts/testEntranceTest.mjs`, `scripts/testEntranceTestDb.mjs`, `scripts/buildEntranceBundle.mjs`
- 수정: `src/utils/spelling.js`(전체 문자열 일치 허용), `src/utils/wordLibrary.js`(getClassIdByName export만 추가), `src/App.jsx`(screen 배선), `src/components/Dashboard.jsx`(배너), `src/components/AdminScreen.jsx`(탭), `scripts/testSpelling.mjs`(+2케이스)

### 테스트 결과 — 로컬 완전 검증 vs DB 대기 구분
- **로컬 완전 검증(PASS)**: `testEntranceTest.mjs` 47 checks(출제/방향/random/채점/시간초과=오답/공동순위 1,1,3/VIP 공동/학생당 최고기록/반별 요약/타이머) · `testSpelling.mjs` 32 checks · **회귀 스위트 18종 전부 재실행 PASS**(wordLibrary 계열 10종: dailyAssignment/futureAssignment/multiClass/renameClass/studentLogin/unitPersistence/spellingSettings/unitNaturalSort/dashboard/syncProgress+fullProgressBackup+resetWordStatusBackup+studentSelectUnitSwitch, progress/restoreSyncRace, identityMigration, studentPinAuth 27/27, ttsSingleton, paulReactions, weeklyReport) · 매 커밋 `npm run build` 통과.
- **테이블 부재 폴백 라이브 실측(PASS)**: fetchTodayTests→[] / fetchOwnResult→null / fetchResultsForTests→[] / warn 1회만, throw 없음 — 배너 미표시·관리자 탭 "준비 중" 경로 확인.
- **DB 대기(SKIP — 검증 못 함)**: `testEntranceTestDb.mjs` 전체 흐름(시험 생성/제출/랭킹 DB 왕복/upsert/종료) — 테이블이 없어 실행 불가, SQL 실행 후 재실행 필요. **학생 실기기 응시 UX(모바일 키보드/IME/타이머 체감)도 라이브에서 미검증** — 코드 리뷰+빌드로만 확인(헤드리스 브라우저는 이 샌드박스에서 실행 불가).

### 알려진 이슈 / 의도적 보류
- 시험 문제는 학생별로 셔플되고 방향(random)도 학생별로 다르게 뽑힘 — 부정행위 방지에 유리하다고 판단해 의도적으로 그대로 둠(전원 동일 순서를 원하시면 seed 고정으로 바꿀 수 있음, 운영자 결정 필요).
- 랭킹 동점 기준은 "정확도"(문항 수 다른 시험이 섞여도 공정) — 풀이 시간 tie-breaker는 운영자 요구("공동 1등 허용")에 따라 넣지 않음.
- 학생이 시험 도중 앱을 나가면(새로고침 등) 답안이 사라지고 재입장 시 처음부터 — active 시험에 결과 미제출 상태면 재응시 가능. 시험 시간이 1~5분으로 짧아 실용상 문제 없다고 판단.

### Push / 배포 상태 (오늘 밤 전체)
- 입실시험 4커밋(`9744590`/`bc3ec1e`/`ace04e7`/`28f44d9`) **push 완료** → Vercel 자동배포 완료 → **라이브 번들 실측 검증 완료**: `index-DpieIwD6.js` 해시 로컬 빌드와 일치 + entrance_tests/배너 문자열/오늘의 VIP 포함 확인, `AdminScreen-CogxCW5F.js`에 입실시험 탭 + v1.8 SQL 안내 포함 확인.
- 참고: 아래 v1.6/v1.7 섹션의 "push 안 됨" 표기는 이제 **옛 정보** — PIN 자기설정/PIN 초기화(삭제)/레이스 수정 포함 오늘 밤 이전 커밋(`e492e29`~`764b4af`)까지 전부 push+배포된 상태에서 이번 작업을 시작했다.

### 다음 작업 (우선순위 백로그, 운영자 확인 후 착수)
- P3: 쓰기시험 게임화 · P4: 다이어리 꾸미기 확장 · P5: UI 다듬기 · P6: 성능 · P7: 접근성/코드 감사.

---

## 2026-07-16 — PIN 운영방식 변경: 학생 최초 PIN 자기설정 (커밋 `99d862d`~`e97eb2a`, **push 안 됨**)

v1.6(이름+PIN 로그인) 인프라는 그대로 유지한 채, 운영자 지시로 "학생이 직접 자기 PIN을 만드는" 플로우를 추가했다 — 관리자가 학생 등록(PIN 미설정 상태) → 관리자가 그 학생에게 "PIN 설정 허용" → 학생이 반 선택→이름 선택→PIN 직접 생성. 기존 "관리자 PIN 초기화"/"임시PIN 일괄생성" 기능은 폴백 수단으로 그대로 유지(삭제 안 함).

**신규**: `supabase_v1_7_student_pin_selfsetup.sql`(`pin_setup_allowed` 컬럼, 운영자가 Supabase SQL Editor에서 실행 완료 확인됨) / `api/self-set-student-pin.js`(서버에서 `pin_setup_allowed`+`pin_hash IS NULL` 이중 재확인, 취약PIN·재입력불일치 거부, 성공 시 플래그 1회성 원복) / `api/student-pin-status.js`(배치 조회, 해시 원문 절대 미노출) / `api/set-pin-setup-allowed.js`(관리자 허용 토글) / `api/unlock-student-pin.js`(pin_hash 안 건드리고 잠금만 해제) / `isWeakPin()`(전부같은숫자 10개+연속숫자 14개 거부). AdminScreen에 PIN 상태 배지+허용/잠금해제 버튼(개별+반 단위 일괄), StudentSelect.jsx에 "PIN 만들기" 탭(반→이름→상태별 분기) 추가.

**최종 라이브 검증 결과** (`supabase_v1_7` 적용 확인 후 재실행):
- `scripts/testStudentPinSelfSetup.mjs` — **24/24 PASS**. 운영자 지시 시나리오 1~9번 전부 확인: PIN없는 신규학생 생성 → 관리자 허용 → 학생 자기설정 성공 → 재로그인 성공 → 동명이인 2명 독립 설정(안 섞임) → **5번(가장 중요한 보안 테스트) "허용 안 된 계정 PIN 설정 시도 → 반드시 차단" 확인** → 취약PIN(1234 등) 거부 → 5회 실패 잠금 회귀 없음 → 관리자 잠금해제(신규) 동작 확인.
- `scripts/testStudentPinAuth.mjs`(v1.6) — **27/27 PASS**, 컬럼 추가로 인한 회귀 없음(동명이인 다른반 로그인 분리 포함).
- `scripts/testIdentityMigration.mjs`(포인트/캘린더 보존) — **20/20 PASS**, 회귀 없음.
- `npm run build` 통과.

**push 여부**: 지시대로 보류 — 운영자 최종 확인 후 push/배포 여부 결정.

---

## 2026-07-15~16 — P0 학생 identity 리팩터링(이름→id) + 이름+PIN 로그인 (커밋 `e492e29`~`2d6df5f`, **push 안 됨**)

CTO 지시 최우선순위(P0): 동명이인 학생이 이름을 전역 유일 키로 써서 서로의 별/포인트/캘린더/학습기록을 덮어쓸 수 있던 데이터 무결성 이슈. 작업 도중 운영자가 로그인 UX를 "반 선택 2단계"에서 "이름+PIN(4자리)"으로 바꾸도록 중간 지시를 추가해 그대로 반영했다.

### 1. Root cause
`src/utils/wordLibrary.js`의 `_students` 캐시가 `{ [name]: {...} }`(이름을 전역 유일 키로 사용)였다. `addStudent`가 동명이인을 조용히 차단(`if (findStudentByName(name)) return`)했고, 라이브 Supabase `students.name`에도 `UNIQUE` 제약(`students_name_key`)이 걸려 있어 DB 레벨에서도 막혀 있었다(Phase 0 진단으로 실측 확인 — 진단 시점 실제 동명이인 데이터는 0건). `useStudent.js`의 로컬스토리지(`paul_easy_progress`)도 이름을 키로 썼다. 부가로 `units.position` 컬럼이 신규 유닛 추가 시 항상 0으로 저장돼 유닛 표시 순서가 뒤섞이는 별개 버그도 발견해 함께 수정.

### 2. 수정한 파일
- `src/utils/wordLibrary.js` — `_students`를 `Map<id,{...}>`로 전환, 학생 관련 함수 전부(id 기준으로 시그니처 변경): `getStudentClass/getStudentUnit/setStudentClass/setStudentUnit/setStudentsClassBulk/removeStudent/syncStudentProgress/fetchFullProgress/setWordStatus/fetchWordStatusMap/fetchWordStatusSummary/resetWordStatus/fetchDebugSnapshot/getStudentWords/fetchDashboardData`. `addStudent`는 이제 새 학생 `id`를 반환, 동명이인 차단 제거. `findStudentByName`은 배열 반환(관리자 도구용, 더 이상 인증 수단 아님). 유닛 자연 정렬(`naturalCompare`) 추가.
- `src/hooks/useStudent.js` — `STORE_KEY(paul_easy_progress)`를 이름 키 → `studentId` 키로 전환. `useStudent(studentId, legacyName)`. `loadRecord`가 로그인 성공 시점의 정확한 학생 id로만 이름 키 레코드를 lazy 복사(기존 `migrateOldData` 선례 패턴 재사용, 원본 절대 안 지움, 전역 자동 매칭 없음).
- `src/App.jsx` — 세션을 이름 문자열 대신 `{id,name}` JSON으로 저장. UUID 형식 아니면 legacy로 간주해 안전하게 로그아웃(크래시 없음, 안내 배너 표시).
- `src/components/StudentSelect.jsx` — (운영자 중간 지시) 반 선택 2단계 로그인 대신 **이름+PIN(4자리)** 로그인/등록 탭으로 전면 교체. Enter 키 포커스 이동, 제출 중 입력 잠금 등 UX 다듬기 완료.
- `src/components/ParentScreen.jsx` — 학부모 화면도 이름+PIN(학생 PIN 재사용)으로 강화.
- `src/components/Dashboard.jsx`, `src/components/AdminScreen.jsx`, `src/components/DebugPage.jsx` — `studentId`/`studentName` 분리, 학생 목록/선택/편집 상태를 id 기준으로 전환. AdminScreen에 "PIN 재설정"(학생별) + "PIN 없는 학생 전원 임시 PIN 일괄생성 + CSV" 버튼 신규 추가.
- `api/_pinAuth.js`(신규, 공용 헬퍼) — Node 내장 `crypto.scrypt` 해시(외부 의존성 0개). `api/verify-student-pin.js`(신규) — 이름으로 후보(동명이인 가능) 조회 후 PIN으로 정확히 1명 확인, 5회 실패 시 5분 잠금(서버사이드 전용, `admin-verify-pin.js`와 동일한 "PIN은 서버에서만" 패턴). `api/set-student-pin.js`(신규) — PIN 설정/재설정. `api/bulk-generate-temp-pins.js`(신규) — 기존 학생 임시 PIN 일괄 발급.
- `supabase_v1_6_student_identity.sql`(신규) — `students.name` UNIQUE 제약 제거 + `pin_hash/pin_fail_count/pin_locked_until` 컬럼 추가. **아직 Supabase SQL Editor에서 미실행** (아래 5번 참고).
- 회귀 스크립트 12개 id 기준으로 갱신(`testStudentLogin/testMultiClass/testUnitPersistence/testDashboard/testSyncProgress/testRenameClass/testResetWordStatusBackup/testFullProgressBackup/testStudentSelectUnitSwitch/testFutureAssignment/testDailyAssignment/testSpellingSettings.mjs`) + 신규 3개(`testUnitNaturalSort.mjs`, `testStudentPinAuth.mjs`, `testIdentityMigration.mjs`) + 빌드 헬퍼 2개(`buildWordLibBundle.mjs`, `buildProgressBundle.mjs`).

### 3. Migration 방식
**로컬스토리지(Phase 2)**: `useStudent.js`의 기존 `migrateOldData` 선례(예전 `paulEasyVoca_{name}_{field}` 흩어진 키 → 통합 `paul_easy_progress`)와 정확히 같은 패턴 — 로그인 성공 시점(그 기기가 실제로 로그인하려는 정확한 학생이 명확한 유일한 시점)에만 그 학생의 이름 키 레코드를 새 id 키로 **복사**(원본은 절대 안 지움). 전역적으로 모든 이름 키를 훑어 자동 매칭하지 않음(동명이인 상황에서 위험) — 이 lazy/on-demand 방식이 CLAUDE.md 지시와 정확히 일치.
**DB(SQL)**: `supabase_v1_6_student_identity.sql` 1개 파일 — `ALTER TABLE ... DROP CONSTRAINT IF EXISTS` + `ADD COLUMN IF NOT EXISTS` (멱등, 기존 행 데이터 전혀 안 건드림). **DDL 실행 권한이 없어(anon key로는 ALTER TABLE 불가) 이 세션에서 직접 적용 불가 — Supabase SQL Editor에서 운영자가 실행해야 함.**

### 4. Recovery strategy
로컬스토리지 원본(이름 키)은 절대 삭제하지 않으므로, 마이그레이션이 잘못돼도 원본 데이터로 항상 복구 가능. Supabase 쪽은 기존 v1.4 전체 백업(`student_progress.progress_data`)이 그대로 유지되며, `fetchFullProgress`가 `studentId` 기준으로 여전히 정상 동작(이 P0 작업으로 백업/복구 경로 자체는 안 건드림 — id를 직접 FK로 쓰도록만 단순화).

### 5. 동명이인 테스트 결과 — **차단됨(운영자 액션 대기)**
`scripts/testStudentPinAuth.mjs`의 11번 케이스(같은 이름 "QA_PinKid"를 서로 다른 반 QA_PinAuthTest/QA_PinAuthTest2에 등록 → 서로 다른 PIN으로 각자 정확히 자기 id로 로그인되는지, 안 섞이는지)를 **이미 작성 완료**했으나, `supabase_v1_6_student_identity.sql`이 아직 적용되지 않아 `students.name` UNIQUE 제약 때문에 두 번째 동명이인 INSERT 자체가 DB에서 거부됨(정상적으로 예상된 상태, 크래시 아님 — 스크립트가 자동 감지 후 안전하게 skip). **SQL을 Supabase SQL Editor에서 실행한 뒤 `node scripts/testStudentPinAuth.mjs` 재실행하면 이 케이스까지 포함해 전부 검증됩니다.**

### 6. 포인트/별 보존 테스트 결과 — ✅ 완료 (SQL 마이그레이션과 무관, 순수 localStorage 로직)
`scripts/testIdentityMigration.mjs` — 별 250개짜리 실전형 레거시 레코드로 로그인 마이그레이션을 실제 `useStudent.js` 코드로 직접 검증. **20/20 체크 전부 PASS**: 마이그레이션 전후 `totalStars` 정확히 동일, 재로그인해도 중복/초기화 없음(멱등).

### 7. 캘린더 보존 테스트 결과 — ✅ 완료 (6번과 같은 스크립트)
같은 `testIdentityMigration.mjs`에서 이틀치 `history`(캘린더) 레코드가 `categoriesCompleted`/`quizCorrect`/`quizTotal`/`missedWordIds`까지 필드 단위로 정확히 보존됨을 확인. 스티커 3개(뱃지 2개 포함)/레벨업 미션/다이어리 배치/`wordStatus`(Skip 기능)도 모두 함께 검증(운영자 지시 5번 항목, 4번과 겹쳐 함께 확인됨).

### 8. Unit 정렬 검증 결과 — ✅ 완료
`scripts/testUnitNaturalSort.mjs` — Unit 1/4/5/6/8/(숫자없음) 뒤섞어 추가해도 항상 숫자 오름차순으로 정렬됨 확인(공백 유무 혼재 케이스도 라이브 데이터에서 실측 확인 후 반영).

### 9. Build 결과
매 커밋마다 `npm run build` 통과 확인(마지막 확인 커밋 `2d6df5f` 기준도 통과). 헤드리스 Chrome 시각 확인은 이번 세션의 샌드박스 환경에서 브라우저 프로세스 실행 자체가 권한 훅에 막혀 실행 불가(앱 로직 문제 아님) — 코드 리뷰 + 빌드 성공(문법/렌더 오류 없음)으로 대체 확인.

### 10. Commit 목록 (전부 로컬 커밋, 아래 11번 참고)
`e492e29`(Phase1 유닛정렬) → `e1d1f36`(Phase2/3/4-a 핵심 리팩터링+PIN서버) → `cbbc0ee`(회귀스크립트 7개 갱신) → `54fe075`(AdminScreen/DebugPage id전환+PIN UI) → `4a192f8`(PIN 서버로직 테스트, 마이그레이션 대기 확인) → `42f6813`(로그인 UX 다듬기) → `2d6df5f`(별/스티커/캘린더 보존 테스트).

### 11. Push 여부 — **안 함**
지시대로 전체 Phase 0~5가 다 끝나고 회귀 테스트가 전부 통과하기 전까지는 push 보류. 위 5번(동명이인 실제 DB 테스트) 항목이 SQL 마이그레이션 적용 전까지 완료 불가능한 구조적 제약이라, **이 세션에서는 여기서 멈춘다** — 운영자 확인 후 진행 여부 판단 요청.

### 12. Deploy 확인 여부 — 해당 없음 (push 자체를 안 했으므로 Vercel 배포도 안 됨)

### ⚠️ 다음 세션/운영자가 가장 먼저 해야 할 일
1. **`supabase_v1_6_student_identity.sql`을 Supabase SQL Editor에서 실행** (유일한 남은 블로커 — 이거 하나면 동명이인 실제 DB 테스트 + PIN 5회 실패 잠금 + 관리자 임시PIN 발급까지 전부 라이브로 검증 가능해짐).
2. SQL 실행 후 `node scripts/buildWordLibBundle.mjs && WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/testStudentPinAuth.mjs`로 동명이인 로그인 시나리오까지 재검증.
3. 기존 학생들은 `pin_hash`가 없는 상태이므로, 배포 전 AdminScreen의 "PIN 없는 학생 전원 임시 PIN 일괄생성 + CSV" 버튼으로 임시 PIN을 발급해 학생들에게 배포해야 실제 로그인 전환이 가능함(운영 이관 절차, 운영자 확인 필요).
4. 전부 통과 확인되면 그때 push → Vercel 배포 → 라이브 확인.

---

## 2026-07-10 밤 (6차) — 회귀 스위트 전체 재검증 + 발견한 버그 2개 수정 (커밋 `25e5967`)

CTO 지시 Priority 5(테스트). 오늘 밤 4~5차에서 만든 변경들이 서로 부딪히지 않는지 회귀 테스트 스크립트 14개를 전부 재실행.

- **`testPaulReactions.mjs` 오탐 수정** — "17개 real PNG" 시절 기준으로 하드코딩돼 있던 오래된 테스트. 실제로는 (오늘 밤 이전, 과거 세션에서) `src/assets/paul/`에 21개로 이미 늘어나 있었고 `paulReactions.js`도 정확히 반영돼 있었는데, 테스트만 안 맞춰져서 냉간 실행 시 7개씩 오탐 중이었음. 실제 소스에 맞춰 갱신(제품 코드는 무관 — 이미 맞았음).
- **`weeklyReport.js` 방금 만든 진짜 회귀 수정** — 5차(학부모 화면)에서 `computeStudentStats`를 이 파일로 옮기며 `wordLibrary.js`에서 `localIsoDateStr`을 import했는데, `weeklyReport.js`는 원래 "의존성 0개, 번들링 없이 바로 실행 가능"이 불변조건이라(`testWeeklyReport.mjs` 헤더에 명시) 즉시 테스트가 깨졌다. 4줄짜리 로직을 그대로 복제해 의존성 0개로 되돌림 — 같은 세션 안에서 직접 만든 회귀를 바로 잡음.

**검증**: 14개 회귀 스크립트 전부 재실행 → 전부 통과. 실제 화면도 헤드리스 Chrome으로 관리자 PIN 로그인/학부모 조회/학생 로그인→단어목록 3개 플로우 재확인. `npm run build` 통과. 라이브 배포 후 콘솔 에러 없음 확인.

---

## 오늘 밤(2026-07-10) CTO 모드 종합 요약 — 사용자 부재 중 자율 진행분

사용자가 "CTO처럼 판단해서 진행"을 지시하고 자리를 비운 동안(4~6차) 완료한 것 전체 요약. 상세 내역은 위 각 회차 항목 참고.

### 오늘 완료한 기능
- 관리자 대시보드: 반 전체 통계 CSV 내보내기 (`a05eaa0`)
- 성능: 학생 메인 번들 879KB→484KB (AdminScreen React.lazy 분리, `39d26eb`)
- 성능: 앱 복귀 시 중복 Supabase 새로고침 제거 (`81ada73`)
- **학부모 화면(v1.2) 신규 구축** — 오늘 학습/숙제/누적 별·연속학습/최근 7일 그래프/퀴즈 정답률/취약 단어/주간 리포트 (`219e9f3`)
- 회귀 테스트 스위트 전체 재검증 + 발견한 버그 2개 즉시 수정 (`25e5967`)

### 수정한 파일 (오늘 4~6차 전체)
`src/components/AdminScreen.jsx`, `src/App.jsx`, `src/components/StudentSelect.jsx`, `src/components/ParentScreen.jsx`(신규), `src/utils/weeklyReport.js`, `scripts/testDashboard.mjs`, `scripts/testPaulReactions.mjs`.

### Commit / Push / Vercel 배포
`a05eaa0` → `39d26eb` → `81ada73` → `219e9f3` → `25e5967` (+ 문서 커밋 다수). **전부** push 완료, Vercel 자동배포 확인, 각 배포마다 라이브 번들 해시 대조 + headless Chrome 콘솔 에러 없음 확인 완료.

### 발견한 버그 (전부 그 자리에서 수정 완료)
- 관리자 대시보드가 클래스/관리자 전용 라이브러리(xlsx)를 학생 메인 번들에 끌고 가던 문제
- 앱 복귀 시 visibilitychange+focus 중복 발동으로 API 호출 2배
- 학부모 화면 시각 검증 중 발견: 헤더 줄바꿈 겹침, 성장 그래프 막대가 아예 안 보이던 CSS 버그
- 오래된 `testPaulReactions.mjs`가 실제로는 이미 확장된 캐릭터 세트(17→21개)를 반영 못 해 오탐하던 것
- 학부모 화면 작업 중 직접 만든 `weeklyReport.js` 의존성 회귀(즉시 발견해서 즉시 수정)

### 해결 못한 문제 / 의도적으로 보류한 것
- **"선생님" 역할** — 학생/관리자 2단계뿐인 지금 권한 구조에 새로 추가해야 하는 큰 설계 결정(권한 범위, 로그인 방식)이라 원장님 확인 없이 스키마부터 만들지 않음. **다음 대화에서 요구사항 확인 필요**.
- Skip "전체 초기화"가 클라우드 백업은 고쳤지만(어젯밤) 로그인 중인 기기의 로컬 상태까지는 못 미침 — 서버가 클라이언트 저장소를 직접 지울 방법이 없는 구조적 한계, 병합 전략 설계 필요.
- 학부모 화면의 "알림/리포트 발송"(카톡/문자)은 여전히 "복사하기"만 지원.
- 전체 접근성(aria-label) 정밀 점검은 대표 사례 1곳만 고침, 나머지는 미착수.
- 반/학생 단위 통계(여러 반 동시 비교 뷰)는 미착수.

### 내일(또는 다음 세션) 가장 먼저 해야 할 일
1. **"선생님" 역할 요구사항 확인** — 권한 범위/로그인 방식 결정 후 설계 착수 (Priority 4 나머지).
2. 실제 사용자(원장님)가 오늘 만든 학부모 화면/CSV 내보내기를 실기기에서 한 번 확인.
3. 그 외엔 이 문서의 "성능 최적화 다음 후보"/"발견해서 수정한 것" 각 항목의 "다음에" 표시된 나머지 작업들.

---

## 2026-07-10 밤 (4차) — 관리자 CSV + 성능 최적화 (커밋 `a05eaa0`)

CTO 지시 우선순위 재확인(1.학생화면 2.성능최적화 3.관리자화면 4.학부모화면 5.테스트) 반영.

### 완료: 관리자 대시보드 반 전체 통계 CSV 내보내기 (커밋 `a05eaa0`)
ROADMAP.md 백로그 항목("반별 진도 통계를 관리자 화면 밖으로도") 구현. 새 Supabase 조회 없이 이미 로드된 데이터만 가공 — 렌더 루프와 CSV가 같은 계산 함수(`computeStudentStats`)를 공유해 어긋날 위험 없음. 실제 관리자 화면을 헤드리스 브라우저로 PIN 로그인부터 CSV 다운로드까지 전체 플로우 실행해서 다운로드된 파일 내용까지 직접 검증 완료(QA 반/학생 2명, 정리까지 확인).

### 완료: 성능 최적화 — 학생 메인 번들 879KB → 484KB (45%↓) (커밋 `39d26eb`)
원인 확인: `AdminScreen.jsx`가 `App.jsx`에 정적 import되어 있어서, `xlsx`(엑셀 업로드)를 포함한 관리자 전용 코드 전체가 **학생이 앱을 열 때마다 항상 같이 다운로드**되고 있었음 — 학생은 평생 한 번도 안 쓸 코드. `React.lazy()` + `<Suspense>`로 분리해 "⚙️ 관리자" 버튼을 실제로 눌렀을 때만 로드되게 변경(로직은 전혀 안 바뀜, 로딩 시점만 변경). 결과: 메인 청크 879KB→484KB(gzip 274KB→141KB), 빌드 경고("청크 500kB 초과") 해소. 실제 화면으로 관리자 PIN 로그인부터 대시보드까지, 학생 로그인부터 단어 목록까지 전체 플로우 재확인 — 회귀 없음. 라이브 배포 후 분리된 AdminScreen 청크가 실제로 서빙되는지(HTTP 200)까지 확인.

### 완료: 성능 최적화 — 앱 복귀 시 중복 API 호출 제거 (커밋 `81ada73`)
`visibilitychange`와 `focus` 이벤트가 모바일에서 거의 동시에 발생해, 앱 복귀 1번에 Supabase 새로고침(6개 쿼리)이 2번씩(총 12개) 발동하고 있었음. 이미 진행 중인 새로고침이 있으면 새로 시작 안 하는 가드만 추가(새로고침 자체의 로직/정확성은 불변). 실제 네트워크 요청을 헤드리스 브라우저로 직접 카운트해서 수정 전/후 차이(2회→1회) 확인.

### 성능 최적화 추가 점검: 미니게임 메모리 누수 — 이미 안전함 확인 (수정 없음)
`MatchGameShell.jsx`(뜻풍선/낚시/피자/기차 4종 공유 로직)의 두 setTimeout(정답 후 다음 라운드 전환, 오답 흔들림 되돌리기) 모두 언마운트 시 `clearTimeout`으로 이미 정리되고 있음(과거 세션에서 이미 고쳐진 것으로 확인, 커밋 `ad112f3` 참고 — 오늘 밤은 재확인만). 새로 고칠 것 없음.

### 성능 최적화 다음 후보 (착수 안 함)
- `pdf.worker.min.mjs`(1.2MB, PDF 생성 시에만 필요)가 이미 별도 청크로 분리는 되어 있으나 크기 자체가 매우 큼 — 실제 사용 빈도(시험지 생성 기능) 대비 더 줄일 방법이 있는지는 다음에 검토.

---

## 2026-07-10 밤 (5차) — 학부모 화면(v1.2) 신규 구축 (커밋 `219e9f3`)

CTO 지시 Priority 4. 로그인 화면에 "👨‍👩‍👧 학부모용" 링크 추가 → 자녀 이름 입력만으로(비밀번호 없음, 기존 학생 로그인과 동일한 신뢰 모델) 오늘 학습 여부/숙제 완료/누적 별·연속학습·클리어단어/최근 7일 그래프/퀴즈 정답률/발음 횟수/취약 단어(자주 틀린 단어)/주간 리포트를 볼 수 있는 읽기 전용 화면.

**재사용한 것(새로 안 만듦)**: `fetchDashboardData`/`fetchWordStatusSummary`(관리자 대시보드가 이미 쓰던 배치 조회 함수, 새 Supabase 쿼리 없음), `buildWeeklyReport`(기존 주간 리포트 텍스트 생성). `computeStudentStats`(예전엔 `AdminScreen.jsx` 안에만 있었음)를 `utils/weeklyReport.js`(기존 공용 유틸 파일)로 옮겨 관리자 화면과 학부모 화면이 **정확히 같은 함수**로 계산하게 함 — 오늘 밤 이미 겪은 "화면마다 다른 숫자" 버그 클래스를 애초에 차단.

**새로 만든 것**: `ParentScreen.jsx`, `App.jsx`에 `React.lazy`로 연결(관리자 화면과 같은 이유 — 학생 메인 번들에 거의 영향 없음, +1KB 미만).

**시각 검증 중 발견해서 그 자리에서 고친 버그 2개**:
1. 헤더의 "← 다른 학생" 버튼과 학생 이름 제목이 겹쳐서 이상하게 줄바꿈되던 문제 — `flex-shrink-0`/`min-w-0` 추가.
2. 최근 7일 학습 그래프 막대가 **퍼센트 높이 계산 오류로 아예 안 보이던 문제**(`items-end` 정렬에서 flex 자식의 높이가 정의 안 돼 `height:%`가 항상 0으로 계산됨) — 고정 px 계산으로 교체, 재확인 스크린샷으로 막대가 정상적으로 그려지는 것 확인.

**검증**: 실제 화면을 헤드리스 Chrome으로 없는 학생/실제 QA 학생 조회, 주간 리포트 펼치기, 다른 학생으로 돌아가기까지 전체 시나리오 구동 후 라이브 배포에서도 재확인(학부모용 링크 존재 + 클릭 시 정상 진입). `npm run build` 통과, `testDashboard.mjs` 회귀 없음.

**남은 것**: ROADMAP.md에 있던 "알림/리포트 발송(카톡/문자)"은 이번엔 손 안 댐 — 여전히 "복사하기"만 지원(관리자 대시보드와 동일).

## 2026-07-10 밤 (3차) — 실제 화면 시각 검증 + 접근성 + 테스트 인프라 신뢰성 (커밋 `59aeb3c`, `c3ef165`)

CTO/PM 지시(Priority 1: 학생 화면 완성도)에 따라, 이번엔 코드 리뷰가 아니라 **실제 화면을 눈으로 직접 확인**했습니다. `playwright-core`를 임시 devDependency로 설치(이미 있는 시스템 Chrome을 그대로 씀 — 새 브라우저 다운로드 없음, 확인 후 즉시 제거)해서 모바일 뷰포트(390×844)로 로그인→대시보드→단어목록→단어학습→퀴즈→새로고침까지 실제 렌더링을 스크린샷으로 확인했습니다.

### 확인 결과 — 완성도 재확인 (새 버그 거의 없음)

- **로그인/대시보드/단어목록/퀴즈 화면 전부 시각적으로 깔끔함** — 어제 고친 Paul 캐릭터 크기(작은 아이콘이 아니라 제대로 된 메인 캐릭터 크기)도 실제 렌더링으로 재확인.
- **마이크 권한 거부 시 에러 처리 이미 매우 잘 되어 있음** — `Dashboard.jsx`의 `MicPrimeBtn`이 에러 종류별(거부/기기없음/사용중/기타)로 구체적이고 친절한 한글 메시지를 이미 보여주고 있었음. `WordDetail.jsx`의 `SpeechBtn`도 마이크 실패 시 "녹음은 나중에 하고 먼저 듣기와 퀴즈를 해볼까요?"로 학습 흐름을 막지 않음 — 손댈 것 없음.
- **새로고침(=브라우저 재접속과 동일 메커니즘, localStorage 기반) 정상 — 콘솔 에러 없음, 학생 데이터/로그인 상태 그대로 유지 확인.**
- **다른 학생으로 전환 시 상태 누수 없음** — `App.jsx` 구조상 학생 전환은 항상 `StudentSelect`(로그아웃 화면)를 거쳐야만 가능해서 `AppInner`가 항상 완전히 unmount/remount됨(코드로 재확인, 실제 버그 없음).

### 발견해서 수정한 것

1. `scripts/testMultiClass.mjs` / `scripts/testRenameClass.mjs`가 **외부에서 수동으로 미리 만들어둔 픽스처가 있어야만 통과**하던 문제 — 2026-07-07부터 알려진 한계로 방치돼 있었음. 더 심각한 건 `testRenameClass.mjs`가 그 공유 픽스처를 실제로 개명(rename)해버리고 정리를 전혀 안 해서, 한 번 실행하면 (1) `testMultiClass.mjs`가 영구히 깨지고 (2) 라이브 DB에 QA 쓰레기 반/학생이 영원히 남았습니다. 둘 다 다른 테스트들과 같은 패턴(자체 생성 → 검증 → 자체 정리)으로 고쳐 단독 실행 가능하게 만듦. **제품 코드는 전혀 안 건드림.**
2. **접근성(우선순위 1의 "버튼"/"접근성")** — 모든 학생이 단어마다 가장 먼저 마주치는 발음 카드(`WordDetail.jsx`의 `PronounceStep`, 파랑/보라 그라데이션 카드)가 `<button>`이 아니라 `onClick`만 달린 `<div>`였음. 마우스/터치는 잘 되지만 키보드 포커스가 전혀 안 가고 스크린리더는 이게 컨트롤인지 알 방법이 없었음. `role="button"` + `tabIndex` + `aria-label` + Enter/Space 키 핸들러만 추가(기존 `onClick`/스타일/DOM 요소 타입은 전혀 안 건드림 — "이미 동작하는 기능 수정 금지" 원칙 준수). 앱 전체의 다른 clickable div들(캘린더/선물상자 모달의 배경 클릭-닫기)은 보조 동작이라 별도 라벨 불필요라 판단해 안 건드림. **참고**: `grep`으로 확인한 결과 프로젝트 전체에 `aria-label`이 이 수정 전까지 0개였음 — 이번엔 가장 눈에 띄는 한 곳만 대표로 고쳤고, 전체 접근성 정밀 점검은 별도 세션으로 남겨둠(우선순위 낮음, 큰 작업).

### 수정한 파일
`scripts/testMultiClass.mjs`, `scripts/testRenameClass.mjs`(테스트 인프라), `src/components/WordDetail.jsx`(접근성, 3줄 추가).

### 테스트 결과
두 테스트 모두 사전 준비 없이 단독 실행 → 전부 통과(11개+3개) → 정리까지 확인. 연달아 두 번 실행해도 서로 간섭 없음 확인. 접근성 수정은 헤드리스 Chrome으로 `role`/`aria-label`/`tabindex` 렌더링 확인 + **키보드 Enter 입력 시 실제로 발음이 재생되는지**(`[TTS START]` 로그) 기능 검증까지 완료, 스크린샷으로 시각적 회귀 없음 확인. `npm run build` 매번 통과. 시각 검증 중 콘솔 에러 없음(headless 환경 특유의 `getUserMedia Permission denied`만 발생, 실제 버그 아님).

### Commit / 배포
`59aeb3c`(테스트 인프라, 배포 불필요) → `c3ef165`(접근성 수정) — push → Vercel 배포 → 라이브 번들 해시(`index-BUJyBuyF.js`) 대조 확인 → headless Chrome 콘솔 에러 없음 확인 완료.

### 부수적으로 정리한 것
과거 세션에서 정리 안 되고 라이브 DB에 남아있던 QA 테스트 학생(`QA_V15prob`)을 발견해 함께 삭제.

### 남은 문제
새로 발견한 제품 버그 없음. Priority 1 중 반응속도/애니메이션/로딩은 시각 검증 중 특이사항 없었음(별도 수정 없음). 접근성은 대표 사례 1곳만 고쳤고 전체 점검은 다음 우선순위로 이월.

---

## 2026-07-10 밤 (2차) — CTO/PM 모드: 기능 현황표 + 모바일 UX 점검 (커밋 `ad3c92c`)

바로 앞 세션(아래 "안정성 우선순위 1~6 점검")에 이어서, "제품 완성도" 관점 지시를 받아 먼저 전체 기능을 완료/진행중/미완성/버그/제거예정으로 분류한 표를 만들고(재구현 방지용, 아래 참고), 어젯밤 시간 관계상 못 본 **모바일 UX**(우선순위 3)를 이어서 점검했습니다.

### 오늘 한 일

1. **기능 현황표 작성** — CLAUDE.md/ROADMAP.md/handoff.md/PROJECT_TODO.md/git log 기반. 요약: v1.0/v1.1/v1.5/v1.5.1 완료, 학부모 화면(v1.2)·AI기능(v1.3)·**"선생님(교사)" 역할 자체가 아직 없음**(지금은 학생/관리자 2역할뿐)이 미완성으로 분류됨.
2. **모바일 UX 점검** — 예전에 이미 고쳐진 "긴 단어가 카드 밖으로 잘리는 문제"(발음/퀴즈/미션 도전 카드)와 정확히 같은 클래스의 버그가 학생이 가장 자주 보는 **단어 목록 화면**(`WordBrowser.jsx`, "단어 공부" 탭)과 **레벨업 미션 대기 목록**(`LevelUpMission.jsx`)에는 방어가 빠져있던 것을 발견·수정(`break-words` 추가, 다른 화면에서 이미 쓰던 것과 동일 패턴).
3. 그 외 점검했지만 **문제 없음으로 확인된 것**: 녹음 중 화면 전환(`WordDetail.jsx`의 `SpeechBtn`은 이미 unmount 시 `mrRef.current.stop()` 정리됨), 빠른 연타로 인한 정답/별 중복 지급 위험(퀴즈 선택지는 `isAnswered`로 이미 잠김, "다음 단어" 버튼도 동기 상태 전이라 이중 클릭 위험 낮음).

### 수정한 파일
- `src/components/WordBrowser.jsx`, `src/components/LevelUpMission.jsx` — 단어/뜻 텍스트에 `break-words` 추가.

### 테스트 결과
`npm run build` 통과, 컴파일된 CSS에 `.break-words` 규칙 존재 확인(순수 CSS 클래스 추가라 로직 테스트 영향 없음).

### Commit / 배포 여부
`ad3c92c` — push → Vercel 배포 → 라이브 번들 해시(`index-BlXZDfot.js`) 대조 확인 → headless Chrome 콘솔 에러 없음 확인 완료.

### 남은 버그
새로 발견한 미해결 버그 없음. (기존에 알려진 것: 어젯밤 항목 참고 — Skip 초기화가 로그인 중인 기기 로컬엔 반영 안 됨.)

### 다음 우선순위 (제품 완성도 기준, "내일 학원에서 쓸 수 있는가")
1. **"선생님" 역할 설계 결정 필요** — 학생→학부모→선생님→원장 빅픽처에서 처음 나온 개념. 지금 스키마엔 학생/관리자(원장) 2단계 권한뿐이라, 선생님 역할을 어떻게 정의할지(원장과 동일 권한? 반 단위로 제한된 권한? 별도 로그인 방식?) 원장님 확인 없이 스키마/RLS를 먼저 설계하지 않았습니다 — 다음 대화에서 요구사항 확인 후 진행 권장.
2. v1.2 학부모 전용 화면 — 관리자 대시보드/주간리포트 로직 재사용 가능, 착수 안 함.
3. 성능(메인 번들 879KB 코드 스플리팅) — 계속 미착수.

---

## 2026-07-10 밤 — CTO 지시("제품 완성 단계") 대응: 안정성 우선순위 1~6 점검 (커밋 `61809b1`, `1ab754b`, `bb39d11`)

CTO 지시대로 새 기능은 전혀 손대지 않고(v1.2 학부모 화면은 착수 직전 중단, 코드 변경 없음), "데이터 유실 0% → 동기화 안정성 → 모바일 UX → 에코 사운드 → 홈/캘린더/관리자 일치 → Skip 검증 → 성능" 순서로 코드 리뷰 기반 점검을 진행했습니다. 실제 신고된 버그가 아니라 **코드 리뷰로 먼저 찾아서 먼저 고친 것**들입니다 — 아직 아무도 이 증상을 겪은 적은 없을 가능성이 높지만, 조건이 맞으면 조용히 발생할 수 있는 종류라 우선순위표 그대로 먼저 처리했습니다.

### 1. [가장 위험] 신규기기 복구 vs 자동동기화 레이스 컨디션 — 커밋 `61809b1`

- **증상 조건**: 로컬스토리지가 비어있는 상태(신규 기기/캐시 삭제/앱 재설치)로 로그인 + 클라우드 백업 복구(`fetchFullProgress`)가 2초(자동 동기화 디바운스)보다 느리게 끝날 때(느린 네트워크, Supabase 콜드스타트 등).
- **실제 위험**: 동기화 타이머가 먼저 발동해서 "아직 비어있는" 로컬 기록으로 그 학생의 클라우드 백업(`progress_data`) 자체를 덮어씀. 이 기기의 로컬 복구 자체는 그 후 정상 성공하지만, **클라우드 백업이 조용히 파괴**되어 이 학생이 나중에 정말로 기기를 잃어버리면 별/스트릭/캘린더 전체가 영구 복구 불가능.
- **수정**: `restoreChecked` 플래그로 동기화 effect를 게이팅 — 로컬에 이미 데이터 있으면 대기 없음(대부분의 경우), 복구가 필요한 경우만 복구 시도가 끝날 때까지(성공/실패/5초 타임아웃 무관) 동기화를 미룸.
- **덤으로 같이 고침**: 탭이 숨겨지는 순간(`visibilitychange`, 모바일 앱 전환/화면 꺼짐 포함, `beforeunload`보다 훨씬 안정적) 대기 중인 동기화를 2초를 기다리지 않고 즉시 flush — "학생이 답 하나 맞추고 바로 앱을 나가면 그 변경이 영영 동기화 안 될 수 있던" 위험 축소.
- **검증**: 손으로 옮겨적은 로직이 아니라 **실제 번들된 useStudent.js를 직접 렌더링**해서 검증 — 최소 hooks 런타임(`scripts/fakeReact.mjs`) + 수동 제어 가능한 fake clock을 새로 만듦(`scripts/testRestoreSyncRace.mjs`, 10개 assertion 전부 통과). 기존 `testProgress.mjs`(48개 체크) 회귀 없음.

### 2. 에코 사운드 감사 — 새 버그 없음, 기존 방어 재확인만

`speech.js`의 `claimTtsCall`/`stopAllPlayback` 싱글턴 가드(새 호출 시작 시 이전 호출을 무조건 stale 처리)와 `playRepeating()`이 이미 이 문제 클래스를 구조적으로 막고 있음을 재확인. 모든 효과음(`playSuccessSound`/`playReactionSound`) 호출부가 `useEffect`(마운트 시 실행, StrictMode 이중실행 위험군)가 아니라 이벤트 핸들러 안에서만 호출되는 것도 전체 grep으로 재확인. `scripts/testTtsSingleton.mjs` 재실행 통과. **새로 고칠 것을 못 찾았습니다** — 이전 세션에 이미 잘 고쳐져 있었습니다.

### 3. 홈/캘린더/관리자 데이터 불일치 — 관리자 대시보드에 남아있던 재발 — 커밋 `1ab754b`

- **증상**: 오늘 새벽 고친 "단어만 보고 카테고리를 못 채운 날 캘린더가 비어 보이던 버그"(커밋 `f29f53e`)와 **정확히 같은 버그 클래스**가 관리자 대시보드의 "오늘 공부함" 배지에는 그대로 남아있었음. 배지가 `categories_completed > 0`을 기준으로 삼아서, 학생이 오늘 단어를 열어봤지만 아직 카테고리를 하나도 못 채우면 관리자 화면엔 "⬜ 오늘 아직 안 함"으로 계속 보임.
- **수정**: 학생 쪽 캘린더와 같은 기준(오늘 날짜 row 존재 여부)으로 통일 — 스키마 변경 없는 순수 표시 로직 수정.
- **검증**: 라이브 Supabase에 QA 학생으로 "단어만 보고 카테고리 못 채움" 상태를 재현, 구버전 기준이면 오탐했을 상황에서 신버전이 정확한지 확인. `testDashboard.mjs`에 회귀 테스트 추가.

### 4. Skip(알아요/모르겠어요) 검증 — 관리자 "전체 초기화"가 클라우드 백업은 안 지우던 문제 — 커밋 `bb39d11`

- **증상**: `resetWordStatus`(관리자 "🔄 전체 초기화")가 `word_status` 테이블만 지우고, 같은 값이 별도로 저장된 전체 기록 백업(`student_progress.progress_data.wordStatus`)은 안 건드림 — 이 학생이 나중에 기기를 잃어버려 새 기기에서 복구하면 방금 초기화한 값이 백업에서 그대로 되살아남.
- **수정**: `resetWordStatus`가 백업 blob의 `wordStatus`도 함께 비움(다른 백업 필드는 그대로 유지).
- **알아냈지만 오늘 밤 손대지 않은 것**: 이 초기화는 **학생이 지금 로그인해 있는 기기의 로컬 localStorage**까지는 못 건드립니다(서버가 클라이언트 저장소를 직접 지울 방법이 구조적으로 없음). `fetchWordStatusMap()`이 "다른 기기 word_status 복구용"으로 이미 만들어져 있는데 **실제로는 어디서도 호출되지 않는 죽은 코드**였습니다 — 로그인 중인 기기에도 관리자 초기화를 실제로 반영하려면 이 함수를 로그인/포커스 시점에 연결해야 하는데, "학생이 방금 직접 바꾼 값과 충돌 안 나게" 병합 전략을 신중히 설계해야 해서 범위 밖으로 남겨뒀습니다. **다음 우선순위 후보**로 아래 기록.
- **검증**: 라이브 Supabase로 재현 — 초기화 전 백업에 값 있음 확인 → 초기화 후 wordStatus만 비워지고 다른 필드는 유지되는지 확인. `scripts/testResetWordStatusBackup.mjs`로 회귀 테스트 추가.

### 모바일 UX / 성능 — 오늘 밤 범위에서 제외

우선순위 1~2(데이터 유실/동기화)를 예상보다 깊게 파느라(레이스 컨디션이 진짜 위험한 버그였음) 3번(모바일 UX)과 7번(성능 최적화)까지는 도달하지 못했습니다. 성능 관련해서는 `npm run build` 경고로 계속 나오는 "메인 청크 879KB" 코드 스플리팅(`pdf.worker`/`xlsx` 등 관리자 전용 무거운 라이브러리를 학생 화면 번들에서 분리)이 눈에 띄는 후보입니다 — 아직 손대지 않았습니다.

### 종합 결과

- **수정한 파일**: `src/hooks/useStudent.js`(레이스 컨디션+flush), `src/components/AdminScreen.jsx`(오늘 공부함 배지), `src/utils/wordLibrary.js`(resetWordStatus 백업), `scripts/testDashboard.mjs`(회귀 테스트 추가) + 신규: `scripts/fakeReact.mjs`, `scripts/fakeReactModule.mjs`, `scripts/wordLibraryRaceStub.mjs`, `scripts/buildRaceBundle.mjs`, `scripts/testRestoreSyncRace.mjs`, `scripts/testResetWordStatusBackup.mjs`.
- **테스트 결과**: `npm run build` 매 커밋마다 통과. `testProgress.mjs`(48개), `testRestoreSyncRace.mjs`(10개, 신규), `testSyncProgress.mjs`, `testDashboard.mjs`(신규 케이스 포함), `testResetWordStatusBackup.mjs`(신규), `testDailyAssignment.mjs`, `testStudentLogin.mjs`, `testUnitPersistence.mjs` 전부 라이브 Supabase 대상 종단 테스트 통과. `testMultiClass.mjs`는 예전부터 알려진 대로 외부 QA 픽스처 없이는 실패(회귀 아님, `handoff.md` 2026-07-07 항목 참고).
- **Commit ID**: `61809b1`(레이스 컨디션), `1ab754b`(관리자 대시보드 일치), `bb39d11`(Skip 초기화 백업).
- **배포 여부**: 3개 커밋 전부 push → Vercel 자동배포 → 라이브 번들 해시 직접 대조로 배포 확인 → headless Chrome 콘솔 에러 없음 확인.
- **남은 버그**: 위 "알아냈지만 손대지 않은 것"(관리자 초기화가 로그인 중인 기기의 로컬 상태까지는 반영 못 함) — 설계가 필요해서 의도적으로 보류. 그 외 새로 발견한 미해결 버그 없음.
- **다음 우선순위**: (1) 오늘 밤 다 못 본 모바일 UX/성능(코드 스플리팅) 점검, (2) 위 Skip 초기화의 "로그인 중인 기기 반영" 설계, (3) CTO 브리핑에 언급된 순서대로 그 다음은 Writing/Speaking/AI Feedback/Parent Dashboard.

---

## 2026-07-10 — v1.5 안정화: 숨김 관리자 Debug 페이지 + 동기화 상태 추적 (커밋 `97910d9`)

- **배경**: 이전 세션에서 학생 진행 기록(별/스트릭/캘린더 등)이 클라우드에 실제로 잘 백업되고 있는지 확인할 방법이 없었음 — `useStudent.js`의 Supabase 동기화가 실패해도 `.catch(() => {})`로 조용히 삼켜져서 실패 흔적이 어디에도 안 남았음.
- **추가한 것**:
  1. **숨김 디버그 탭** — 관리자 화면 제목("⚙️ 관리자")을 1.5초 안에 5번 탭하면 진입. 학생을 고르면 (1) 이 기기 localStorage 스냅샷, (2) 실제 Supabase `student_progress`/`student_daily_progress`(최근 14일)/`word_status` 조회 결과, (3) 이 기기의 마지막 동기화 시도/성공 시각·연속 실패 횟수·마지막 에러를 한 화면에 보여줌. 로컬과 클라우드 값이 어긋나면(별 개수, 스티커 개수, word_status 개수, 전체 백업 비어있음) 자동으로 빨간 배너로 표시.
  2. **동기화 상태 추적** — `useStudent.js`에 기기별 `paul_easy_sync_meta` 저장소 추가(학생 진행 데이터와 완전히 분리 — 백업/복구 대상 아님). 학생 쪽 동작은 전혀 안 바뀜, 그냥 지금까지 안 보이던 실패를 보이게 만든 것.
  3. **`npm run dev` 관리자 PIN 수정** — `vite dev`는 Vercel 서버리스 함수(`api/verify-admin-pin.js`)를 실행하지 않아서 로컬 개발 중엔 관리자 PIN 화면 자체가 막혀 있었음. `vite.config.js`에 실제 함수와 동일한 로직의 개발 전용 미들웨어 추가(프로덕션 빌드/배포에는 전혀 영향 없음, 여전히 진짜 서버리스 함수가 처리).
- **검증**: `npm run build` 통과. `testProgress.mjs`(회귀 48개 체크) 전부 통과. `testSyncProgress.mjs`(라이브 Supabase 종단) 전부 통과 — 이 과정에서 테스트 자체의 기존 버그(`toISOString()`이 UTC라 KST 새벽 시간대엔 오탐)를 발견해 같이 수정함(앱 코드는 이미 2026-07-09에 고쳐져 있었고 테스트만 안 맞춰져 있었음). `fetchDebugSnapshot()`도 라이브 Supabase에 대해 학생 생성→동기화→조회→삭제까지 임시 테스트로 종단 검증(재사용 스크립트로 남기지 않음, 1회성 검증 후 정리). 로컬에서 `vite dev` 기동 후 `/api/verify-admin-pin` 엔드포인트를 정답/오답 PIN으로 직접 호출해 정상 응답 확인. 배포 후 라이브 번들에 새 코드(`paul_easy_sync_meta` 등)가 실제로 포함됐는지 직접 대조 확인, headless Chrome 콘솔 에러 없음 확인.
- **사용자 확인 필요**: 관리자 화면에서 제목을 5번 빠르게 탭해 디버그 탭에 진입, 아무 학생이나 골라서 로컬/클라우드 값이 일치하는지, 동기화 상태가 "✅ 동기화 성공"으로 뜨는지 한 번 확인해주시면 좋겠습니다.

## 2026-07-10 — 공부 캘린더가 텅 비어 보이던 버그 수정 (커밋 `f29f53e`)

- **신고 내용**: 홈/미션 화면엔 "완료한 미션 1/4, 획득한 별 2, 공부 여부: 공부했어요"처럼 오늘 학습 흔적이 보이는데, 공부 캘린더 화면은 "0일 연속 공부 중"에 날짜 기록 자체가 없어 보임. 사용자가 직접 "데이터 저장 실패가 아니라 캘린더가 다른 데이터 소스/조건을 보는 버그"라고 정확히 짚음.
- **확인한 사실**: 홈(Dashboard)과 캘린더(StudyCalendar)는 실제로는 `App.jsx`에서 만든 동일한 `useStudent(student)` 훅 인스턴스(`studentData`)를 그대로 공유합니다 — 별개의 데이터 소스가 아닙니다. 진짜 원인은 `history` 엔트리 자체가 생성되는 조건이었습니다: 예전엔 오늘 카테고리(단어/예문/퀴즈/발음) 중 하나를 GOAL(5회)만큼 다 채워야만 `bumpHistory`가 호출돼 `history[오늘]`이 생겼습니다. 그래서 카테고리를 하나도 다 못 채운 날은 홈 화면엔 (라운드 상태 기반) 진행 흔적이 보여도 `history[오늘]` 자체가 없어 캘린더 그리드/스트릭 계산에서는 완전히 없는 날처럼 취급됐습니다.
- **수정**: `src/hooks/useStudent.js`의 `markWordViewed`(학습 흐름에서 가장 먼저 실행되는 액션)가 이제 `bumpHistory(() => ({}))`도 함께 호출해, 단어를 처음 연 시점에 `studied:true, categoriesCompleted:0`인 오늘 기록을 만들어 둡니다. `streak` 계산(4/4 완료 필요)에는 전혀 영향 없음 — 캘린더가 "그날 공부는 했지만 미션은 0/4"를 정확히 보여주게 됨.
- **참고**: `src/components/StudyCalendar.jsx`의 `markerFor()`도 `categoriesCompleted<=0`일 때 마커를 아예 숨기던 것(빈칸)에서 연필 이모지(✏️)로 바꿔, 그리드에서도 "공부는 했지만 미션 미완료"인 날이 시각적으로 구분되도록 함.
- **테스트**: `scripts/testProgress.mjs`에 회귀 테스트 추가("카테고리 0개 완료 상태에서도 history 기록 생김") — 전체 테스트(신규 포함) 통과, `npm run build` 통과.
- **커밋 범위 참고**: 이 작업 디렉터리에는 이 수정과 무관한 별도 작업(v1.5 Stability Milestone — 숨김 관리자 Debug 페이지 `DebugPage.jsx`, 동기화 상태 추적 `SYNC_META` 등)이 이미 커밋 전 상태로 같이 있었습니다. 섞이지 않도록 `git apply --cached`로 이번 버그 수정에 해당하는 hunk만 골라 별도 커밋(`f29f53e`)했고, 그 v1.5 작업은 손대지 않고 그대로 uncommitted 상태로 남겨뒀습니다 — 다음 작업 시 이어서 검토 필요.
- **사용자 확인 필요**: 실제 기기에서 재현되던 정확한 상황(리포트에 적힌 "1/4, ⭐2")을 제가 직접 재현하지는 못했습니다 — 코드상 확인된 근본 원인(카테고리 0개 완료 날의 history 누락)에 대한 수정입니다. 다음에 학습 후 캘린더를 다시 확인해서 오늘 날짜에 마커가 뜨는지 봐주시면 좋겠습니다.

---

## 2026-07-08 — 홈 화면 복습 배너 카드 레이아웃 수정

- **증상**: `RecommendationBanner`(홈 화면 "복습할 단어가 있어요!" 등 추천 카드)가 `flex-row`라 폴 캐릭터가 왼쪽에 작게 눌리고, 텍스트가 오른쪽 좁은 칸에 몰려 세로로 줄바꿈되는 것처럼 보임.
- **수정**: `src/components/Dashboard.jsx`의 `RecommendationBanner` 레이아웃을 모바일 기준 `flex-col`(중앙 정렬: 폴 캐릭터 → 제목 → 설명 → 버튼), `md:` 이상에서만 `flex-row`로 좌우 배치 가능하도록 변경. 이모지는 제목에 인라인으로 합침. 캐릭터 크기는 기존 `size="sm"`(모바일 140px) 그대로 유지 — 이미 요청 범위(120~150px) 안이라 크기 자체는 문제 없었고, 레이아웃만 문제였음.
- **검증**: `npm run build` 통과. Playwright로 실제 앱(로그인 → `paul_easy_progress`에 9개 활성 미션 주입 → 리로드)을 375px 모바일 뷰포트에서 구동해 카드를 스크린샷 확인 — 캐릭터 중앙, 제목 한 줄, 설명 전체 폭, 버튼 하단 전체 폭으로 정상 렌더링됨. 콘솔 에러 없음(기존에 알려진 미확보 캐릭터 PNG 경고만 있음, 이 작업과 무관).
- **커밋 안 함**: 아직 push/commit 전 — 사용자 확인 후 커밋 예정.

---


> 이전 버전의 handoff.md(2026-06-26자)는 DB 도입 이전(localStorage 전용, PIN 1234 하드코딩) 구조를 설명하고 있어 현재 상태와 맞지 않아 전체를 새로 작성했습니다. 최신 아키텍처는 `CLAUDE.md`/`ROADMAP.md` 참고.

이 세션은 다섯 라운드로 진행됐습니다: **1차**(캘린더 게임기록/관리자 로스터), **2차**(효과음/자동이동/예문버그/모바일 안정화), **3차**(Supabase 진행도 동기화, 날짜별 단어 배정, 관리자 대시보드, 숙제 관리, 주간 리포트), **4차**(Unit 재배정 버그 — 세 번째 신고 끝에 진짜 원인 발견·수정), **5차**(CTO 모드 — 쓰기시험 오디오 버그, Audio Manager 리팩토링, 모바일 버그 감사, 문서화). 아래는 전체를 합친 최종 상태입니다.

### ℹ️ 참고: 배포가 평소보다 오래 걸린 일 있었음 (해결됨)

`ad112f3`(미니게임 타이머 정리 + 마이크 훅 통합) 배포가 15분 넘게 반영 안 되는 것처럼 보여서 한때 "Vercel 빌드 실패"로 의심했지만, 이후 커밋(`4a82fab`, 문서 추가)을 푸시하고 확인해보니 `X-Vercel-Cache: MISS`, `Age: 0`으로 정상 반영된 최신 빌드가 확인됐습니다. 즉 **빌드 실패가 아니라 배포/캐시 반영이 그날따라 오래 걸렸을 뿐**이었습니다. 최종적으로 모든 커밋이 정상 배포된 상태입니다 — 별도 조치 필요 없습니다.

### ⚠️ 4차 라운드 — Unit 버그 관련 중요 정정

3차 라운드에서 제가 처음 고쳤던 원인(학생 캐시가 로그인 시 새로고침 안 되던 것)은 **진짜 원인이 아니었습니다** — 실제로는 로그인 화면(`StudentSelect.jsx`)에서 기존 학생 이름으로 로그인할 때, 화면에 보이는 유닛 드롭다운에서 뭘 선택하든 그 값이 **DB에 아예 전송되지 않고 조용히 무시되던 것**이 진짜 원인이었습니다(신규 학생 등록 때만 쓰이는 값이었음). 세 번째 신고를 받고 코드를 다시 처음부터 검색해서 찾았습니다. 자세한 내용은 아래 "5. 발견하고 수정한 버그" 참고. 사용자가 요청한 정확한 시나리오(Rogan: Unit4→Unit5→재로그인→Unit5 유지→Unit3)를 그대로 검증하는 테스트로 확인했습니다.

---

## 1. 완료한 작업

### 1차 + 2차 라운드 (요약 — 자세한 내용은 git log 참고)
- 캘린더에 게임 플레이 기록, 관리자 학생 로스터(반별 그룹핑/일괄 이동/CSV)
- 별 획득 효과음 누락 보완, 퀴즈 후 자동 다음 이동, 예문 재생성 버그 수정, 퀴즈게임 녹음 멈춤 복구 수단 추가

### 3차 라운드 (이번 요청: "v1.3" 반 50명 실운영 관리 기능) — 전부 완료·배포됨

1. **Supabase 진행도 동기화** — `student_progress`(누적: 별/클리어단어수/스트릭/스티커), `student_daily_progress`(일별: 미션완료도/별/퀴즈정답률/발음횟수/틀린단어) 두 테이블을 사용자가 대시보드에서 직접 생성. `useStudent.js`가 기록 변경 2초 후 fire-and-forget으로 자동 동기화 — **동기화 실패해도 학생 기기의 로컬 진행에는 전혀 영향 없음** (로컬이 여전히 그 학생 자신의 source of truth).
2. **날짜별 단어 배정** — `daily_assignments` 테이블. 관리자가 반의 단어 목록에서 체크박스로 오늘(또는 내일 이후 날짜를 미리 골라) 배정 가능. **배정을 안 하면 기존처럼 유닛 전체 단어가 그대로 보임** — 기존 동작을 절대 깨뜨리지 않는 폴백.
3. **관리자 대시보드** — `AdminScreen.jsx`에 새 탭. 반을 고르면 학생별로: 오늘 공부 여부, 숙제(=오늘의 단어) 완료 여부, 최근 7일 미션 완료 기록, 별/스티커/클리어단어수/연속학습일, 퀴즈 정답률, 발음 연습 횟수, 많이 틀린 단어(빈도순)를 한 번에 보여줌. 학생별로 N번 조회하지 않고 반 전체를 배치 조회.
4. **숙제 관리** — "숙제 완료 = 오늘의 단어(daily_assignments)를 다 학습했는지"로 설계를 단순 통합(별도 숙제 전용 스키마를 새로 만들지 않음 — 이미 있는 두 테이블로 충분히 커버됨). 완료 여부는 대시보드에 실시간 표시.
5. **학생별 주간 리포트 + 학부모 요약 문구** — 대시보드에서 학생별로 "학부모 리포트 만들기" 버튼 → 잘한 점/부족한 점/숙제 상태를 규칙 기반 템플릿으로 생성(**AI API 비용 없음**, 프로젝트 표준 원칙 준수) + 복사하기 버튼.
6. **[중요 버그 수정] Unit 재배정이 재로그인해도 이전 값으로 되돌아가던 문제** — 아래 5번 섹션에 상세.

모든 항목: `npm run build` 통과 → 실제 라이브 Supabase에 대한 종단 테스트(디스포저블 QA 데이터, 끝나면 자동 정리) → git commit → push → Vercel 배포 → 라이브 URL 번들 해시 대조 → headless Chrome 콘솔 에러 확인까지 마쳤습니다.

---

## 2. 수정한 파일 목록 (3차 라운드)

| 파일 | 내용 |
|---|---|
| `supabase_v1_3_schema.sql` (신규, 사용자가 대시보드에서 실행) | `student_progress`, `student_daily_progress`, `daily_assignments` 3개 테이블 + RLS |
| `src/hooks/useStudent.js` | `recordQuizAnswer`/`markPronunciationAttempt`(정답률·발음횟수·틀린단어 로컬 추적) + Supabase 동기화 useEffect 추가 |
| `src/utils/wordLibrary.js` | `syncStudentProgress`, `fetchDashboardData`, `getTodaysAssignmentWordIds`/`setTodaysAssignment`, `getAssignmentForDate`/`setAssignmentForDate`(날짜별 배정) 추가. `getStudentWords()`가 오늘의 배정을 반영하도록 수정(배정 없으면 기존 폴백) |
| `src/components/WordDetail.jsx`, `src/components/QuizGame.jsx` | 퀴즈 정답/오답, 발음 시도(성공+실패) 콜백을 `useStudent`의 새 추적 함수로 연결 |
| `src/components/AdminScreen.jsx` | 새 탭 "📊 대시보드"(`AdminDashboard`), 단어 목록에 오늘의 단어 체크박스 + `FutureAssignmentPlanner`(날짜별 미리 배정) 추가 |
| `src/utils/weeklyReport.js` (신규) | `buildWeeklyReport()` — 순수 함수로 분리해 독립 테스트 가능 |
| `src/App.jsx` | **[버그 수정]** 로그인 시 + 탭 포커스 복귀 시 학생 캐시(`refreshStudents()`)를 항상 새로고침하도록 수정 |
| `src/components/StudentSelect.jsx` | 로그인 처리가 비동기(DB 재확인)로 바뀌어서 로딩 상태 표시 추가 |
| `scripts/testSyncProgress.mjs`, `testDailyAssignment.mjs`, `testDashboard.mjs`, `testFutureAssignment.mjs`, `testWeeklyReport.mjs`, `testUnitPersistence.mjs` (전부 신규) | 각 기능의 라이브 Supabase 종단 테스트 |
| `scripts/wordLibraryStub.mjs` | `syncStudentProgress` 스텁 추가 (기존 테스트 인프라 업데이트) |

커밋 8개 (모두 push+배포 완료):
```
c1929c7 feat: v1.3 - 퀴즈 정답률/발음 연습 횟수/많이 틀린 단어 로컬 추적 추가
ef1e1d8 feat: v1.3 - Supabase 진행도 동기화
83b2b2f feat: v1.3 - 반별 오늘의 단어 배정
9cec601 feat: v1.3 - 관리자 대시보드
90bd758 feat: v1.3 - 반별 숙제(단어) 날짜별 미리 배정 기능
6dd313d feat: v1.3 - 학생별 주간 리포트 + 학부모 요약 문구 생성
095ff76 fix: Unit 재배정이 재로그인 시 이전 값으로 되돌아가던 버그 수정
```

---

## 3. 테스트 결과

- **자동 테스트 전체 재실행 (회귀 확인)**: `testProgress.mjs`(19개), `testWeeklyReport.mjs`(11개), `testMultiClass.mjs`(8개), `testRenameClass.mjs`(3개), `testStudentLogin.mjs`(4개), `testSyncProgress.mjs`(13개), `testDailyAssignment.mjs`(9개), `testDashboard.mjs`(7개), `testFutureAssignment.mjs`(4개), `testUnitPersistence.mjs`(6개) — **전부 통과**.
  - `testMultiClass.mjs`/`testRenameClass.mjs`는 처음 실행 시 실패했는데, 원인은 회귀가 아니라 이 두 스크립트가 (이전 세션에서 수동으로 만들어뒀던) 외부 QA 픽스처를 전제로 짜여있어서였습니다. 픽스처를 다시 만들어 재실행해 통과 확인 후 정리했습니다 — 실제 코드 문제는 없었습니다.
- **빌드**: 매 변경 후 `npm run build` 통과 (에러 없음, 기존 청크 크기 경고만 있음).
- **라이브 배포 검증**: 매 배포마다 라이브 URL 번들 해시 대조 + headless Chrome 콘솔 에러 없음 확인 — 이번 라운드에서 6회 모두 통과.
- **Unit 재배정 버그**: `testUnitPersistence.mjs`로 정확히 사용자가 요청한 시나리오(Unit4 → Unit5 → 재로그인 → Unit5 유지)를 실제 라이브 Supabase에 대해 검증, 통과.
- **미실행**: 관리자 화면의 실제 클릭 흐름(대시보드 UI, 날짜 선택기 등)은 이 환경에 브라우저 자동조작 도구(puppeteer 등)가 없어 로직/데이터 레이어만 종단 테스트했고 UI 렌더링은 코드 리뷰로 대체했습니다. **내일 관리자 화면에서 새 "📊 대시보드" 탭과 "오늘의 단어"/날짜별 배정 UI를 한 번 클릭해서 확인해주시면 좋겠습니다.**

---

## 4. 남은 작업

이번 요청("v1.3": 관리자 대시보드/숙제/날짜별 배정/리포트/데이터 안정화)은 **전부 완료**했습니다. 남은 건 `ROADMAP.md`의 진짜 다음 단계들입니다:

- **v1.2 (학부모 전용 화면)**: 이번에 만든 건 관리자용 대시보드입니다. 학부모가 직접 볼 수 있는 별도 화면(로그인 방식 등)은 아직 없습니다.
- **v1.3 (AI 기능, ROADMAP.md 기준)**: AI 문장 검사, 실제 STT 발음 채점 등 — 유료 API가 필요해 신중 검토 필요, 아직 시작 안 함.

---

## 5. 발견하고 수정한 버그

### [진짜 원인, 4차 라운드] Unit 재배정이 재로그인 시 이전 값으로 되돌아가는 문제

- **증상**: 학생이 Unit4로 시작 → 로그인 화면에서 Unit5를 선택해도 → Home엔 계속 Unit4.
- **진짜 원인**: `StudentSelect.jsx`(로그인 화면)는 유닛 선택 드롭다운을 항상 보여줬지만, 입력한 이름이 **이미 등록된 학생**과 일치하면 `handleStart`가 `onSelect(existing)`만 호출하고 `selectedUnit` 값을 전혀 참조하지 않았습니다 — 그 값은 오직 **신규 학생 등록**(`addStudent`) 경로에서만 쓰였습니다. 즉 기존 학생이 드롭다운에서 Unit5를 눈으로 보고 선택해도, 그 선택은 어디에도 전송되지 않고 그냥 사라졌습니다. 캐시 문제가 아니라,애초에 그 값을 DB에 반영하는 코드 자체가 없었던 것입니다.
- **수정**: 입력한 이름이 기존 학생이면, 반 선택 드롭다운은 숨기고(반 배정은 계속 관리자 전용) 그 학생의 현재 반에 있는 유닛 목록만 보여주는 드롭다운으로 바꿨습니다. 유닛을 실제로 다른 값으로 바꾸면 로그인 직전에 `setStudentUnit()`을 호출해 DB에 반영합니다. 드롭다운을 안 건드리면 기존 유닛 그대로 조용히 로그인됩니다(원치 않는 강제 변경 없음).
- **검증**: 요청하신 정확한 시나리오를 그대로 재현하는 라이브 Supabase 종단 테스트 작성(`scripts/testStudentSelectUnitSwitch.mjs`) — Rogan 로그인(Unit4 등록) → Unit5 선택 → Home Unit5 → 재로그인(안 건드림) → Unit5 유지 → Unit3 선택 → Home Unit3, 전부 통과. 요청하신 5개 진단 로그(로그인 시 fetch된 student / 선택값 / update payload / update result / Home 표시값)도 전부 콘솔에 찍히는 것 확인했습니다.

### [원인 아니었음, 3차 라운드에서 먼저 시도] 학생 캐시 미갱신

3차 라운드에서는 "학생 정보 캐시(`_students`)가 앱이 처음 열릴 때 한 번만 로드되고 이후 안 바뀐다"는 걸 원인으로 보고 로그인/포커스 시점마다 `refreshStudents()`를 호출하도록 고쳤습니다. 이 자체는 여전히 유효한 개선(다른 기기에서 바뀐 값을 반영하는 데 도움)이라 그대로 남겨뒀지만, **사용자가 실제로 겪던 증상의 원인은 아니었습니다** — 진짜 원인은 위 4차 라운드 내용입니다.

그 외 새로 발견한 미해결 버그는 없습니다.

---

## 6. 다음에 이어서 할 작업 (추천 순서)

1. **관리자 화면 실제 확인** — "📊 대시보드" 탭에서 반을 선택해 학생별 현황이 잘 보이는지, "오늘의 단어" 체크박스와 "다음 날짜 미리 배정"이 기대대로 동작하는지 확인.
2. **학생 쪽에서 Unit 재배정 버그가 실제로 고쳐졌는지 확인** — 아무 학생이나 반/유닛을 바꾼 뒤 그 학생 이름으로 로그아웃→재로그인해서 새 유닛이 유지되는지 실제로 한 번 확인해주시면 좋겠습니다.
3. v1.2(학부모 화면)나 v1.3(AI 기능) 중 다음으로 진행할 방향을 정해주시면 이어가겠습니다.

---

## 7. 추천 사항

- 관리자 대시보드의 "많이 틀린 단어"는 학생이 실제로 틀린 단어의 빈도 순으로 보여줍니다 — 반 전체에서 자주 틀리는 단어를 알고 싶으시면, 지금은 학생별로만 보이니 "반 전체 통계" 뷰가 필요하시면 다음에 추가하겠습니다.
- 숙제 완료 기준(오늘의 미션 4개 중 4개 다 완료)이 너무 엄격하다고 느껴지시면(예: 3개만 해도 숙제로 인정) 말씀해주세요 — 지금 구조로 쉽게 바꿀 수 있습니다.
- 학부모 리포트는 지금 "복사하기"만 되는데, 카카오톡/문자로 바로 보내는 기능이 필요하시면 다음 단계로 검토하겠습니다(발송 자체는 별도 서비스 연동이 필요해서 신중 검토 대상입니다).
