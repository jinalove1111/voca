# Performance / DB Scalability Audit — 2026-07-24

감사 대상: `src/utils/wordLibrary.js`, `src/hooks/useStudent.js`,
`src/components/admin/*Panel.jsx`(+ `AdminScreen.jsx`, `StudentDirectory.jsx`,
`AnalyticsPanel.jsx`, `EntranceTestAdmin.jsx`), `api/*.js`,
`supabase/functions/**`, 모든 `supabase_v*.sql`의 인덱스 정의.

가정: 현재 111명 단일 학원 규모 → **학생 2000명(100명×20학원) 동시 접속**
가정 감사. 이 저장소/스키마에는 academy/tenant 개념 자체가 없음(전역
`students`/`classes`/`units`/`words` 4테이블, `grep -r "academy|tenant"
src/`로 확인 — UI feature-flag 파일 5개에서만 무관한 매치, 실제 스키마/
쿼리에는 tenant 컬럼 없음). 그래서 "2000명 규모"는 두 가지로 해석 가능:
(a) 이 앱을 그대로 20개 학원이 한 Supabase 프로젝트를 공유하며 쓰는 경우,
(b) 한 학원이 2000명으로 성장하는 경우. 아래 Critical 발견(§1)은 **두 해석
모두에서 동일하게 문제**다 — 현재 클라이언트 데이터 계층이 "보고 있는 반"이
아니라 "전체 DB"를 매번 통째로 읽어오기 때문. (a) 해석이면 여기에 더해
학원 간 데이터 격리(프라이버시) 문제까지 추가된다(이 감사 범위는 성능이라
격리는 §1에서 부수적으로만 언급).

---

## §1. [Critical] 클라이언트가 매 세션·매 포커스 복귀마다 "전체 DB"를 무필터로 로드

**file:line**: `src/utils/wordLibrary.js:112-164`(`refreshWordLibrary`),
`:105-110`(`fetchWordsRows`), `:193-232`(`refreshStudents`),
`src/App.jsx:389-405`(포커스 복귀 트리거)

**무엇**:
- `refreshWordLibrary()`는 `classes`/`units`/`words`/`daily_assignments`
  4개 테이블을 **어떤 `class_id`/academy 필터도 없이** 전부 select한다
  (`supabase.from('words').select(...).order('position')` — `.eq()`/`.limit()`
  없음, `fetchWordsRows()` 106-110행).
- `refreshStudents()`도 `students` 테이블 전체를 `class_id` 필터 없이
  select한다(199-211행).
- 이 두 함수 + `refreshClassSettings()`(합쳐서 쿼리 6개 — 코드 주석
  `App.jsx:389`이 스스로 "refreshWordLibrary 4개 + refreshStudents 1개 +
  refreshClassSettings 1개"라고 명시)가 **로그인 시 1회 + 앱이 포커스를
  되찾을 때마다(`visibilitychange`/`focus`) 매번** 다시 실행된다
  (`App.jsx:398`, `Promise.all([refreshWordLibrary(), refreshStudents(),
  refreshClassSettings()])`).

**2000명 규모에서 왜 문제인가(정량 추정)**:
- 현재(111명, 반 12개 정도) 기준으로도 이미 "학생 1명의 브라우저가 자기
  반 유닛 몇 개만 필요한데 전체 학원 단어를 전부" 받는 구조다. 20학원
  공유 시나리오라면 반 수는 최소 12×20=240개, 유닛/단어 수는 자릿수가
  하나 이상 늘어난다(유닛당 15~30단어 가정 시 words 테이블만 수만 행
  가능) — 매 로그인·매 탭 포커스마다 학생 1명이 **자기와 무관한 19개
  다른 학원의 반/유닛/단어까지 전부** 다운로드한다.
- 동시 접속 2000명이 각자 탭을 백그라운드→포그라운드 전환할 때마다(모바일
  기기에서 흔함) 이 6-쿼리 풀스캔이 재발화된다 — 순간 동시 요청 수가
  "2000명 × 6쿼리"에 근접할 수 있는 버스트 패턴(§4 connection pool 항목과
  연결).
- `_students`(Map)가 학생마다 전교생(2000명) 레코드를 메모리에 들고
  있어야 함 — 학생 화면에는 전혀 필요 없는 데이터(다른 반/다른 학원 학생
  명단)가 매 학생 브라우저 메모리에 상주.

**권장 수정**:
1. `refreshWordLibrary`/`refreshStudents`를 로그인한 학생의 `class_id`
   (또는 관리자가 보고 있는 반)로 스코프 좁히기 — 최소한 `.eq('class_id',
   studentClassId)`(학생 세션) / 관리자는 명시적으로 선택한 반만.
2. 학원(academy/tenant) 개념이 실제로 필요하면(20개 학원이 한 DB를
   공유하는 배포가 맞다면) `classes`/`students`에 `academy_id` 컬럼을
   추가하고 모든 select에 그 필터를 강제하는 게 근본 수정 — 이건 스키마
   변경(헌법 규칙 8, DDL은 운영자 수동 실행)이 필요한 큰 작업이라 이번
   감사에서는 코드 수정하지 않음.
3. 즉시 적용 가능한 완화책(스코프 확대 없이): `refreshWordLibrary`에
   `classId` 파라미터를 추가해 학생 세션에서는 자기 반만 조회하고, 관리자
   화면(반 전체 관리가 필요)만 무필터 전체 조회를 유지하는 절충.

**지금 안전하게 고칠 수 있는가**: **아니오, 이번 라운드에서는 아님.**
`_cache`/`_students`는 앱 전역에서 15개 이상 호출부가 "이미 다 채워져
있다"고 가정하고 동기로 읽는 구조(주석에 명시, `wordLibrary.js:1023-1027`
근처)라, 스코프를 좁히면 관리자 화면(전체 반 관리)·교재 선택기·반 배정
등 다수 호출부의 동작을 재검증해야 하는 광범위 변경이다. 회귀 위험이 높아
"감사만" 범위를 넘음 — 별도 설계 세션 필요.

---

## §2. [Critical] AI 배치 채점 Edge Function의 통계 반영 단계가 N+1(최대 400 쿼리/요청)

**file:line**: `supabase/functions/grade-writing-answers/index.ts:437-476`
(`bumpWritingAnswerStatAfterAiJudgment`), `:884-892`(호출부),
`:126`(`MAX_ITEMS_PER_REQUEST = 200`)

**무엇**: AI가 새로 판정한 proposal마다(`freshAiProposals`, 캐시 히트/통계
스킵 제외) `Promise.all(freshAiProposals.map(...))`로
`bumpWritingAnswerStatAfterAiJudgment`를 병렬 호출하는데, 이 함수 자체가
**항목 1개당 SELECT 1번 + UPDATE 1번**(446-450행 select, 469행 update)을
한다. `MAX_ITEMS_PER_REQUEST` 기본값이 200이므로, 관리자가 한 번의
"AI 일괄 채점" 요청으로 최대 200개 답안이 전부 신규 AI 판정을 받으면
**최대 400개의 개별 DB 요청이 한 Edge Function 실행 안에서 동시 발화**된다.

**2000명 규모에서 왜 문제인가**: 이 기능은 관리자가 수동 트리거하는
저빈도 배치이긴 하지만(학생 요청 경로 아님), 20학원 규모가 되면 학생 수만�
는 게 아니라 **학원 수만큼 관리자도 늘어나고, 각자 자기 학원 큐에 대해
이 배치를 독립적으로 돌린다** — 20명의 관리자가 비슷한 시간대(예: 저녁
수업 준비 시간)에 각자 200건씩 트리거하면, Supabase 프로젝트 하나가
순간 수천 건의 개별 select+update를 동시에 받는다. Edge Function은
`Promise.all`로 200개를 한꺼번에 열어젖히므로 Supabase의 동시 연결/요청
한도(특히 무료·저가 티어의 PostgREST/Supavisor pool)에 부딪힐 수 있다
(§4).

**권장 수정**: 이 함수를 "먼저 전체 대상 (word_id, registered_meaning,
normalized_answer) 조합을 `.in()` 배치로 한 번에 select → 메모리에서 각
proposal에 대응하는 기존 카운트 계산 → `upsert`(다건 배열)로 한 번에
반영"하는 구조로 바꾸면 400쿼리가 2쿼리로 줄어든다(이미 §1의
`writing_answer_statistics` UNIQUE 키가 `(word_id, registered_meaning,
normalized_answer)`라 배치 select/upsert가 자연스럽게 가능한 구조).

**지금 안전하게 고칠 수 있는가**: **부분적으로 예.** 이 함수는 update
전용이고 실패해도 응답을 막지 않는 fire-and-forget 설계(주석 435행)라
회귀 위험이 상대적으로 낮다 — 배치 select+upsert로 바꾸는 리팩터링은
다음 라운드에서 시도할 만한 후보. 단 `accepted_count`/`rejected_count`
증가 로직(466-467행, `existing.count + 1`)이 read-then-write라 배치로
바꿀 때 동시성(같은 실행 안에서 같은 조합이 두 번 잡히는 경우는 없음 —
proposal은 pending_answer_id 단위라 중복 없음, 안전)을 재확인해야 한다.

---

## §3. [High] 관리자 분석/학생 디렉터리 화면이 전교생 데이터를 무필터·무페이지네이션으로 로드

**file:line**: `src/components/admin/AnalyticsPanel.jsx:26-27, 33-37`,
`src/components/admin/StudentDirectory.jsx:75, 119-137`

**무엇**:
- `AnalyticsPanel.jsx:26-27` — `product_events` 조회에
  `.limit(20000)`이 있지만, 이건 안전장치가 아니라 **조용한 데이터
  손실**이다: 60일치 이벤트가 20000건을 넘으면(2000명 규모에서 학생 1명이
  하루 5개 이벤트만 남겨도 2000×5×60=600,000건 — 20000의 30배) 최근/오래된
  이벤트가 무작위로 잘려나가고 복귀율(`computeReturnRates`) 계산이
  조용히 틀려진다. 에러 없이 통계만 왜곡되는 게 더 위험한 실패 모드.
- `AnalyticsPanel.jsx:33-37` — `student_progress`(전체 컬럼
  `progress_data`, 학생별 큰 JSON blob), `word_status`(status='mastered'
  전체), `student_class_assignments`(전체) **세 테이블 모두 어떤
  `.eq()`/`.limit()`도 없이 전체 테이블을 select**한다. 2000명 규모에서
  `student_progress.progress_data`는 학생당 수 KB~수십 KB(다이어리
  배치/캘린더 히스토리/티켓 원장 등을 다 담는 "전체 백업" blob,
  `DATABASE.md` `student_progress` 설명 참고) — 전교생 것을 한 번에
  관리자 브라우저로 내려받으면 페이로드가 수십 MB 단위가 될 수 있다.
- `StudentDirectory.jsx:75`(`useState(() => getStudents())`)와
  `:119-137`(`loadPinStatus`)가 **반 필터 없이 전교생**을 항상 불러오고,
  `fetchPinStatusMap(list.map(s => s.id))`로 **전교생 id를 한 번에**
  `/api/student-pin-status`에 POST한다(→ `api/student-pin-status.js:38`의
  `.in('id', studentIds)`가 2000개 UUID로 실행됨). 컴포넌트는 반별
  아코디언(펼친 반만 렌더)으로 DOM은 절제했지만, **DB 조회 자체는 여전히
  전체 학생 규모**다.

**2000명 규모에서 왜 문제인가**: 관리자 1명이 실제로 관리하는 건 자기
반/자기 학원 학생(약 100명)뿐인데, 화면을 열 때마다 전체(2000명) 규모의
쿼리·페이로드가 발생한다 — O(자기 반 학생 수)여야 할 작업이 O(전체 학생
수)로 실행되는 전형적 패턴. `AnalyticsPanel`은 학원별 분리조차 없어(관리자
화면이 학원 A 소속이어도 학원 B의 통계까지 한 대시보드에 섞여 보임) 기능
자체가 다학원 배포와 안 맞는다.

**권장 수정**: `AnalyticsPanel`/`StudentDirectory` 둘 다 "관리자가 속한
학원/반 범위"로 조회를 스코프해야 한다(§1과 같은 근본 원인 — academy_id
부재). `product_events`는 `.limit(20000)` 대신 서버 측 집계(RPC로 미리
합산된 값만 반환) 또는 최소 최근 N일로 조회 기간을 축소 + 명시적 초과 시
경고 표시.

**지금 안전하게 고칠 수 있는가**: `product_events.limit(20000)` →
경고 로그 추가(초과 시 콘솔/화면에 "표본 잘림" 명시)는 **낮은 위험으로
즉시 가능**. 나머지(반/학원 스코프 좁히기)는 §1과 마찬가지로 데이터
모델 변경이 선행돼야 해 이번 라운드 범위 밖.

---

## §4. [High] Supabase 무료/저가 티어 연결·요청 한도 리스크 — 포커스 복귀 버스트 + Edge Function 병렬 폭주

**file:line**: `src/App.jsx:389-405`(포커스 복귀 트리거),
`supabase/functions/grade-writing-answers/index.ts:884-892`(§2와 동일)

**무엇**: 클라이언트는 PostgREST(HTTP)만 쓰고(`src/utils/supabaseClient.js`
— 일반 `createClient`, 커넥션 풀링 옵션 없음) 매 API 함수(`api/*.js`)도
호출마다 새 `createClient`를 만들지만 이것도 HTTP 기반이라 "DB 커넥션
고갈"이라는 전통적 의미의 문제는 상대적으로 낮다. 그러나:
1. §1의 6-쿼리 풀스캔이 **동시에 다수 학생 브라우저에서 재발화**되면
   (예: 쉬는 시간 종료 후 2000명이 동시에 탭 복귀) Supabase
   PostgREST/DB 자체의 동시 요청 처리 한도(특히 무료/Pro 티어 하위
   플랜의 max connections, 기본값이 낮음 — 대개 수십~200 수준)에
   순간적으로 부딪힐 수 있다. 쿼리 자체가 무필터 풀스캔(§1)이라 개별
   쿼리 처리 시간도 길어 동시 처리 창이 넓어진다(느린 쿼리가 커넥션을
   오래 붙잡음).
2. §2의 `Promise.all` 200병렬 select+update가 Edge Function 런타임에서
   동시에 나가면, 그 순간만큼은 이 Edge Function 하나가 최대 400개의
   동시 DB 요청을 만든다 — 이게 여러 학원 관리자가 겹치는 시간대에
   중첩되면 순간 부하가 배가된다.

**2000명 규모에서 왜 문제인가**: 두 항목 다 "동시성 곱셈" 문제다 — 개별
쿼리는 지금도 존재하지만, 111명 규모에서는 동시 발화 확률이 낮아 눈에 안
띄고, 2000명·20학원 규모에서는 동시 발화가 사실상 상시 일어난다.

**권장 수정**: (a) §1 스코프 좁히기로 쿼리 자체를 가볍게 만드는 게
근본 해법. (b) 포커스 복귀 리프레시에 지수 백오프/랜덤 지터를 추가해
"정각에 몰림"을 흩뜨리는 것도 저비용 완화책. (c) §2는 배치 select/upsert로
바꿔 동시 요청 수 자체를 줄임.

**지금 안전하게 고칠 수 있는가**: (b)의 지터 추가는 낮은 위험으로 가능
(순수 타이밍 변경, 기능 동작 불변) — 다음 라운드 후보로 적합. (a)/(c)는
§1/§2와 동일하게 범위 밖.

---

## §5. [Medium] 핵심 4테이블(`students`/`classes`/`units`/`words`)의 FK 컬럼 인덱스 여부를 저장소에서 확인 불가

**file:line**: `DATABASE.md:5-11`(핵심 4테이블 DDL 부재 기술부채 — 기존
문서화됨), 전체 `supabase_v*.sql` grep 결과(위 "인덱스 정의" 절 참고)

**무엇**: 이 저장소의 어떤 `supabase_*.sql`에도 `words.unit_id`,
`units.class_id`, `students.class_id`에 대한 `create index`가 없다.
Postgres는 FK 컬럼을 자동으로 인덱싱하지 않으므로(PK만 자동), 이 세
컬럼이 실제 라이브 DB에 인덱스가 있는지는 **대시보드에서 원본 생성 당시
설정된 것인지 여부에 달려 있고, 이 저장소 코드만으로는 확인 불가**
(`DATABASE.md`가 이미 기록한 "핵심 4테이블 DDL 없음" 기술부채와 같은
뿌리).
- `words.unit_id`: `refreshWordLibrary()`가 매핑 시 사용(`unitById[w.unit_id]`,
  애플리케이션 레벨 join이라 DB 인덱스와 무관 — 이건 §1 때문에 사실
  지금은 영향 없음), 하지만 `setClassWords()`(`wordLibrary.js:546-551`)의
  `.eq('unit_id', unit.id)` select/delete는 실제 DB에서 이 컬럼으로
  필터링한다 — 관리자가 엑셀 업로드로 단어를 저장할 때마다 실행.
- `units.class_id`: 현재는 `refreshWordLibrary()`가 전체를 가져와
  애플리케이션에서 매핑하므로(§1) 지금은 인덱스가 없어도 이 경로 자체는
  느려지지 않는다 — 다만 §1의 근본 수정(class_id로 서버측 필터링)을
  적용하면 **그 순간부터** 이 인덱스가 필수가 된다.
- `students.class_id`: `entrance_test`류/`compute-word-king.js:57`
  (`.eq('class_id', classId)`)가 이미 이 컬럼으로 직접 필터링 중.

**2000명 규모에서 왜 문제인가**: `students.class_id`가 인덱스 없이 20학원
×2000명 규모라면, `compute-word-king.js` 같은 `.eq('class_id', classId)`
조회가 순차 스캔(전체 `students` 2000행)이 된다 — 지금은 111행이라
체감 차이가 없지만, 2000행이면 반별 조회 하나마다 전체 테이블 스캔
비용이 붙는다.

**권장 수정**: `create index if not exists idx_words_unit_id on
words(unit_id);`, `create index if not exists idx_units_class_id on
units(class_id);`, `create index if not exists idx_students_class_id on
students(class_id);` — 아래 `supabase_v3_10_perf_indexes.sql` 초안 참고.

**지금 안전하게 고칠 수 있는가**: **SQL 파일 작성까지는 예**(헌법 규칙
8 — 실행은 운영자 몫), 하지만 **실제 라이브 DB에 이미 이 인덱스가
있는지 먼저 운영자가 Supabase 대시보드에서 확인하는 걸 권장**(중복
인덱스 방지 — `if not exists`라 에러는 안 나지만 이미 있으면 그냥
no-op이므로 사실 확인 없이 실행해도 안전).

---

## §6. [Medium] 지문 순서 변경(`movePassage`)이 재정렬 항목마다 개별 UPDATE

**file:line**: `src/utils/readingApi.js:168-174`(`movePassage`), 호출부
`src/components/admin/PassageEditor.jsx`(재정렬 시 순회 호출 — 파일
자체 주석 170행이 이미 "지문 수는 유닛당 소수라 개별 update로 충분"이라고
스스로 인정)

**무엇**: 지문(passage) 순서를 바꾸면 재정렬된 목록의 각 지문마다
`movePassage(passageId, position)`을 한 건씩 호출 — N개 지문 재정렬에
N번의 UPDATE 왕복.

**2000명 규모에서 왜 문제인가**: 이건 학생 수 스케일과 무관하다(유닛당
지문 개수는 학생 수가 늘어도 안 늘어남, 여전히 "소수") — **낮은 우선순위
로 유지가 맞다**, 다만 감사 항목에 포함된 패턴이라 기록. 20학원으로 늘면
"동시에 지문을 편집하는 관리자 수"는 늘지만 요청당 크기는 그대로다.

**권장 수정**: 필요 시 `upsert([...])` 배치로 교체 가능하나 우선순위
낮음.

**지금 안전하게 고칠 수 있는가**: 예(위험 낮음) — 하지만 ROI가 낮아
이번 라운드에서는 보류 권장.

---

## §7. [Low] `writing_answer_statistics`/`spelling_ai_grading_cache` 등 신규 캐시 테이블은 이미 배치 조회 원칙을 잘 따름 — 참고용 긍정 기록

**file:line**: `supabase/functions/grade-writing-answers/index.ts:622-650`
(`statsLookup`이 `.in('word_id', uniqueWordIds)`로 배치 조회),
`src/utils/wordLibrary.js:895-903, 1667-1676, 1700-1711`
(`fetchHouseWeeklyScore`/`fetchXpTotals`/`fetchWordStatusSummary` — 전부
"학생별 N번 조회 안 함" 배치 패턴, 코드 주석에도 명시)

**무엇**: 이건 발견(버그)이 아니라 **감사 대상 코드베이스가 이미 잘하고
있는 부분**을 기록해 다음 세션이 "왜 여기는 안 고쳤나" 헷갈리지 않게
하기 위함이다. `fetchDashboardData`/`fetchWordStatusSummary`/
`fetchXpTotals`/`fetchHouseWeeklyScore`/`AdminDashboard`(`AdminScreen.jsx:1386`
의 `getStudentsInClass(className)` 스코프)는 전부 "학생별 개별 쿼리
대신 `.in(studentIds)` 배치 1회" 원칙을 정확히 지키고 있고, `AdminDashboard`
자체는 §3의 `StudentDirectory`/`AnalyticsPanel`과 달리 **반 단위로
스코프**돼 있다(전교생이 아니라 선택된 반 학생만 조회). 새로 이 패턴을
건드리는 세션은 이 구조를 그대로 재사용하면 된다 — §1/§3 수정 시 이
파일의 기존 배치 조회 함수들이 좋은 참고 템플릿.

---

## 요약 — 재현/검증 방법

이번 라운드는 감사만 수행했고 코드/SQL을 실행하지 않았다. 다음 라운드에서
안전한 항목부터 착수할 때 참고할 순서 제안:
1. §5 인덱스 3개 — 운영자가 라이브 DB에서 존재 여부 확인 후, 없으면
   `supabase_v3_10_perf_indexes.sql`(아래) 실행.
2. §3 `product_events.limit(20000)` 초과 시 경고 로그 — 코드만 수정,
   위험 낮음.
3. §4(b) 포커스 리프레시 지터 — 코드만 수정, 위험 낮음.
4. §2 Edge Function 배치화 — 중간 위험, 별도 세션 권장.
5. §1/§3 스코프 좁히기(academy_id 도입 여부 포함) — 가장 큰 설계 결정,
   운영자 확인(정말 20학원이 한 DB를 공유하는 배포인지) 먼저 필요.
