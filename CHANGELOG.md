# CHANGELOG.md — 세션별 변경 이력 (역순, 최신이 위)

_작성: 2026-08-02. 상세 배경/의도/리스크 판단은 `handoff.md`(세션별
서술형 로그)가 원본이다. 이 문서는 `git log`로 실제 확인한 커밋을
날짜/세션 단위로 짧게 나열하는 용도 — append-only, 기존 섹션 삭제
안 함._

---

## 2026-08-02 — 제품 폴리시 웨이브: 아동 경험 + 교사·성능 (implementer, 27차 하드닝 세션 이후 별도 세션)

27차 하드닝 세션(아래 섹션) 마감 이후 이어진 별도 세션 — 2축 감사(아동
경험 / 교사 생산성·성능) 후 저위험 즉시수정 웨이브. 상세: `handoff.md`
28차. 9커밋(학생 4 + 교사·성능 5), 렌더 스모크 읽기 점검(발견 0건), 그
직전에 자체 발견·수정한 런타임 버그 1건 포함.

### 학생 경험(4커밋)

- `405209f` `polish(writing): 축하 노출 시간·오답 입력 표시·힌트 방향·
  키보드 확인키` — 쓰기 시험 콤보 마일스톤/컴백 단어 축하를 더 길게
  노출, 오답 직후 "내가 쓴 것: ___" 표시, 힌트 버튼 위치 문구 정정,
  모바일 키보드 확인(done) 키 힌트.
- `5d2bf83` `polish(audio): 재생 중 표시·오디오 실패 안내·퀴즈 진행점
  줄바꿈·단어 진행률` — QuizGame/WordDetail 오디오 재생 중 펄스 표시,
  3단 폴백 전체 실패 시 안내 문구, 퀴즈 진행점 줄바꿈 허용, WordDetail
  상단에 세션 내 단어 진행률(N/전체) 표시.
- `30aca6e` `polish(feedback): 격려 문구 풀 확장(500개 자산 코드 적용)` —
  `docs/reading/07-encouragement-messages.md`(2026-07-23 작성 시점부터
  "자산(asset) — 코드 미적용" 상태로 남아있던 500개 격려 문구)의 일부가
  이 커밋에서 처음 `paulReactions.js`의 `MESSAGE_POOLS`(success/fail/
  levelup/encourage/complete)에 실제로 반영됨 — 그 전까지는 문서만
  존재하고 코드 노출 경로가 전혀 없었음.
- `4e016a9` `polish(home): 시간 약속 정직화·숙제 안내/완료 표시·미션 빈
  상태·진행바 클램프·선물 스킵` — "3분" 표현을 실제로 가변적인 세션
  길이에 맞게 "짧은 세션"으로 정정, 홈 숙제 안내가 실제 눌러야 하는
  버튼을 가리키게 수정 + 완료 시 문구 교체, 유닛 전환 직후 미션/진행바가
  빈 배열·100% 초과로 보이던 표시 버그 완화, GiftReveal 연출 스킵 허용.

### 교사·성능(5커밋)

- `25760a9` `perf(admin): 관찰 패널 지연 마운트·xlsx 동적 로딩·인터벌
  제거·메모이제이션` — `<details>` 닫힘 상태에서도 마운트돼 탭 진입마다
  실행되던 관찰 패널 대용량 조회를 지연 마운트로 차단, xlsx를 동적
  import로 전환해 관리자 번들에서 429kB 청크 분리(엑셀 업로드 클릭 시에만
  로드), FeatureManagementPanel 1초 폴링 제거, 배정 이력 단어 조회
  Map·검토 큐 인정 후보 계산 useMemo화, 입실시험 배너 폴링 20초→60초 +
  0건이면 중단.
- `3839db3` `feat(admin): 업로드 재선택·번호열 오인식 방어·업로드 후 해당
  유닛 바로 열기` — 같은 파일 재선택 시 change 이벤트 미발생 버그 수정,
  헤더 미검출 시 번호 열을 단어로 오인식하던 것 방어 + 경고 배지, 업로드
  완료 후 해당 반/유닛 카드 자동 오픈.
- `d130905` `feat(admin): 오늘 배정에도 자동 생성 허용 + 이력에서 배정
  복사` — "다음 날짜 미리 배정" 패널의 최소 날짜를 내일→오늘로 완화(오늘
  숙제에도 자동 생성 사용 가능), 배정 이력 카드에 "오늘로 복사" 버튼
  추가.
- `9585acd` `fix(admin): AdminDashboard에 전달 안 된 adminPin 참조 수정` —
  직전 커밋(d130905)에서 `AdminDashboard` 내부가 `adminPin`을 참조하게
  됐는데 그 prop을 받지 않아 대시보드 탭 렌더 시 런타임 ReferenceError가
  나던 것을 자체 발견·즉시 수정(빌드는 통과, 렌더 시에만 드러남 — 아래
  handoff.md 28차 "검증 공백" 절 참고).
- `858b015` `feat(admin): 대시보드 미완료 필터·리포트 라벨 정직화·시험지
  출제 범위` — 대시보드 "숙제 미완료만 보기" 퀵필터 + 미완료 우선 정렬,
  주간 리포트 "이번 주 학습 현황" 라벨을 실제 집계 창(최대 60일)에 맞게
  "최근 학습 기록"으로 정정, 시험지 생성기에 출제 시작 위치(offset) 입력
  추가(기본값 1 = 기존 동작과 동일).

### 번들 크기 변화

`25760a9`의 xlsx 정적→동적 import 전환으로 `AdminScreen` 청크에서
xlsx(429.03 kB, gzip 143.08 kB)가 분리돼 별도 청크(`xlsx-*.js`)로
지연 로딩된다 — 엑셀 업로드 탭을 실제로 열기 전까지는 관리자 화면
초기 로드에 포함되지 않음.

---

## 2026-08-02 — Phase 2 품질 웨이브 + 보안 브랜치 격리 (implementer, 하드닝 세션 이어서)

아래 "프로덕션 하드닝 세션" 5커밋 이후, 같은 날 이어서 진행된 두 갈래
작업 — (A) 저위험 품질 개선 6커밋(main), (B) `BUG_REPORT.md` H1/M10/
generate-audio 3건을 다루는 보안 수정 1커밋(별도 브랜치, main 미머지).
상세: `handoff.md` 27차, `BUG_REPORT.md`.

### (A) Phase 2 품질 웨이브 — main, 6커밋

1. `5f8f45d` `refactor(admin): wordSlug/isoDaysAgoStr 단일 원본화(중복
   정의 제거)` — `wordSlug`/`isoDaysAgoStr`가 `wordLibrary.js`(미export)/
   `AdminScreen.jsx`/`AssignmentHistoryPanel.jsx` 3곳에 바이트 단위로
   중복 정의돼 있던 것을 `wordLibrary.js`에서 export하는 단일 원본으로
   통합(숙제 배정 매칭 핵심 규칙이라 드리프트 위험 제거, 로직 변경 없는
   순수 리팩터).
2. `b6f168a` `chore(cleanup): 이월분 — React 기본 import 2건 + wordLibrary
   진단 로그 DEV 게이트` — `LearningRecommendationsCard.jsx`/
   `SpellingReviewQueuePanel.jsx`의 불필요한 React 기본 import 제거(자동
   JSX 런타임) + `wordLibrary.js` 진단 로그 DEV 빌드 게이팅.
3. `7fdc33c` `feat(admin): 조회 화면 로딩·빈 상태·에러 상태 보강` —
   `WritingStatsDashboard`가 `fetchPendingSpellingReviews()`의
   `__fetchError` 마커를 처음 소비해 실제 조회 실패를 빈 상태와 구분(에러
   배너 + 재시도 버튼).
4. `20fc059` `fix(admin): null 안전 감사 + 숫자 입력 표시/저장 일치 +
   예문 폼 검증 메시지` — 오답 반복 횟수 입력 클램프 이중화(UI+데이터
   계층), `ExampleManager`가 `validateExampleFields`를 폼 제출 전에
   재사용해 API 왕복 없이 한국어 검증 메시지 노출.
5. `c933749` `chore(ai-status): phase2 품질 웨이브 체크포인트 — commit
   1-3 완료`
6. `6c13170` `a11y(admin): 아이콘 버튼 aria-label·폼 라벨 연결` —
   `AssignmentHistoryPanel`/`CurriculumTree`/`ExampleManager`/
   `SpellingReviewQueuePanel`의 아이콘 전용 버튼 + placeholder만 있던
   입력에 `aria-label` 연결(레이아웃/포커스 변경 없음).
7. `ffcf9eb` `chore(ai-status): phase2 품질 웨이브 완료 체크포인트 —
   commit 1-4 전부 완료`

매 커밋마다 `npm run build` + 관련 `verify:*` PASS 확인, `api/` 파일은
전혀 건드리지 않음. 상세는 `.ai-status/implementer-phase2-quality-wave.json`.

### (B) 보안 수정 — 별도 브랜치 `fix/verify-student-pin-ilike`, main 미머지

- `fb65dd7` `fix(security): PIN 인증 ilike 와일드카드 이스케이프 + PIN
  설정 레이스 가드 + URL 인코딩` — `api/verify-student-pin.js`(ilike
  메타문자 이스케이프, `BUG_REPORT.md` H1) + `api/self-set-student-pin.js`/
  `api/set-student-pin.js`(check-then-act 레이스 가드, `BUG_REPORT.md`
  M10) + `api/generate-audio.js`(PATCH URL 인코딩 비대칭 해소,
  `BUG_REPORT.md` M12) 3건. **프로덕션 인증 경로(서버리스, service_role
  key) 변경이라 main에 병합하지 않고 브랜치에만 격리** — Vercel이 main을
  배포하므로 운영자 승인 전 무감독 머지를 하지 않는다는 이 저장소의
  기존 관례(`docs/SECURITY_AUDIT_V311.md` CRITICAL 처리 방식과 동일
  원칙)를 그대로 따름. `npm run build` 통과 확인, 운영자 승인 후 머지
  대기.

---

## 2026-08-02 — 프로덕션 하드닝 세션 (implementer, 병렬 감사 4종 이후)

야간 폴리시 세션(아래 26차) 마감 커밋(`0661ce6f`) 이후, 같은 날 이어서
진행된 저위험 즉시 수정 5커밋. 배경/재현/영향 상세는 `BUG_REPORT.md`
(M1 항목), 감사 범위는 `PROJECT_AUDIT.md`.

1. `307a49a` `fix(student): 데드 훅 폴링·blob URL 누수·재생 예외·
   PronStep key 등 저위험 하드닝` — 학생 컴포넌트/훅 감사(축 A)에서
   나온 저위험 리소스 누수·예외 계열 수정.
2. `9bbad4a` `fix(writing): 패턴 등록 adminPin 배선 — v3.11 이후 조용한
   저장 실패 차단` — `LearningRecommendationsCard.jsx`에 `adminPin`
   prop 배선, `registerRecommendation(row, adminPin)` 호출로 v3.11
   락다운 이후 조용히 실패하던 patterns 등록을 복구. 상세:
   `BUG_REPORT.md` M1(수정됨으로 표기).
3. `60b3cea` `chore(cleanup): 미사용 React 기본 import 제거(자동 JSX
   런타임)` — 기계적 스윕(축 D) 발견, 동작 변화 없는 정리성 커밋.
4. `ced4117` `perf(logs): speech.js/StudentDirectory 진단 로그 DEV
   게이트` — `src/utils/speech.js`/`src/components/admin/
   StudentDirectory.jsx`의 진단 로그를 DEV 빌드에서만 찍히도록 게이팅
   (프로덕션 콘솔 노이즈 감소, 동작 변화 없음).
5. `0c10c34` `fix(admin): 에러 분류·stale 응답 가드·엑셀 예외·되돌리기
   부분실패 표시·중복 헬퍼 통합` — 저위험 하드닝 5건:
   `fetchPendingSpellingReviews` 에러 분류(테이블 없음 vs 그 외 에러
   구분), `AssignmentHistoryPanel.load`에 stale-응답 가드 적용,
   `ExcelUpload.handleFile` 예외 처리 추가, `revertLastBatch` 부분
   실패를 요약에 반영, `isMissingRelationError`/
   `isMissingQueueRelationError` 중복 헬퍼 통합.

**이번 감사에서 새로 발견돼 아직 코드로 반영되지 않은 항목**(HIGH 4건 +
MEDIUM 10건)은 `BUG_REPORT.md` 참고 — 이 CHANGELOG는 실제로 커밋된
변경만 기록한다(계획/미착수 항목은 `NEXT_PRIORITY.md`).

이 시점 기준 `npm run build`/`npm run verify:*` 재확인은 이 문서
작성 세션(docs-maintainer, 문서 전용 쓰기 권한)의 범위 밖 — 직전
implementer 세션(핸드오프 26차)의 최종 게이트만 아래 요약 참고.

---

## 2026-08-02 (26차) — 야간 학생 경험 폴리시 세션 마감

퀴즈/단어학습/세션/홈 4개 화면 폴리시 웨이브 + 하네스 v3.11 정직 SKIP
확장. 커밋 8개(시간순): `788e5ac`(하네스 42501 정직 SKIP) →
`7e6f733`(W1 퀴즈) → `7956c17`(W2 단어학습) → `7398550`(W3 세션·복습) →
`8551f4c`(W4 홈·진입) → `b1e907a`(W5-A 로그 게이트+플레이키 수정) →
`96b071e`(W5-B vendor 청크 분리) → `3a3c3fc`(v3.11 픽스처 쓰기 정직
SKIP 확장). 마감 문서 커밋: `0661ce6f`. 상세: `handoff.md` 2026-08-02
(26차), `COMPLETE_REPORT.md` 최상단.

## 2026-08-02 (24차) — Edge Function 배포·E2E 검증 완료

운영자가 v3_6/v3_7/v3_8/v3_9 SQL 실행 + `grade-writing-answers`/
`admin-content-write` 배포 + OpenAI 시크릿 설정. `scripts/
testEdgeFunctionsE2E.mjs` 신규(커밋 `f86fd0ab`) — 서버측 PIN 게이트/
숙제 배정 저장→반영→해제/AI 채점 실호출/캐시 재호출 방지 전 항목 통과.
이후 v3.11 정책명 갭 진단(`31c9e71`) → 유닛 메타 저장 0-row 오탐 수정
(`7067fbf`) → v3.11 락다운 완성 확인(`5a7a551`)까지 이어짐. 상세:
`handoff.md` 2026-08-02(24차), `COMPLETE_REPORT.md`.

## 2026-08-01 (21~23차) — 쓰기 검수 자기학습형 파이프라인 + 숙제 자동 생성 + Leitner 메모리 엔진 인프라

- 21차(커밋 `8ee7302`~`d2ed7f1`): 실수 유형 분류 + 오토파일럿 플래그
  3종(기본 off) + 자동 인정 철회 목록.
- 22차(커밋 `ad59e0e`~`fec92af`): 숙제 배정 자동 생성 순수 플래너 +
  배정 이력/완료 현황 패널. 같은 구간에 별도 세션의 Leitner 메모리
  엔진 인프라 커밋(`1c0d456`~`a6e0ef1`, review_data jsonb 코덱/세션
  플래너/메트릭)도 병렬로 들어감.
- 23차(커밋 `8f02320`~`e6478a6`): 쓰기 검수 통계 대시보드 + 큐 최적화
  + 배치 UX(sticky 액션바/진행률/되돌리기/휴지통).

상세: `handoff.md` 2026-08-01(21차/22차/23차).

## 2026-08-01 이전 — v1.0~v3.13, Curriculum Engine Phase 0까지

`ROADMAP.md`(버전별 완료 현황) + `handoff.md`(세션별 상세, 1차~20차)
참고. 요약 지표: 커밋 500+ (2026-08-02 `.git/logs/HEAD` 실측), 학생
111명 규모 실사용, `docs/reading/09-codebase-audit.md`(2026-07-23)
기준 `src/` 약 18,769줄.
