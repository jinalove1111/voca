# BUG_REPORT.md — 확인된 버그 (심각도순, 2026-08-02 감사)

_작성: 2026-08-02, docs-maintainer. 감사 범위/방법은 `PROJECT_AUDIT.md`,
우선순위/선행조건은 `NEXT_PRIORITY.md`, 구조적 이월 부채(버그가 아닌
설계상 갭)는 `TECH_DEBT.md`. 각 항목: 위치(file:line) · 재현 시나리오 ·
영향 · 상태(수정됨/보류/운영자 결정 필요) · 리스크._

---

## HIGH (전부 보류 — 운영자 결정 필요, 코드 무변경)

### H1. `api/verify-student-pin.js:48` — ilike 와일드카드 미이스케이프 [수정 준비 완료]

- **재현**: `POST /api/verify-student-pin` body `{"name":"%","pin":"0000"}`
  1회 호출. `.ilike('name', trimmedName)`(48행)이 `trimmedName`을
  이스케이프 없이 그대로 넘겨, `%`가 SQL LIKE 와일드카드로 해석되어
  **전교생**이 `candidates`에 담긴다.
- **영향**: 전교생을 대상으로 PIN 1개를 스프레이 시도할 수 있고, 틀릴
  때마다 각 학생의 `pin_fail_count`가 증가 — `MAX_FAILS`(5회) 도달 시
  `LOCK_MINUTES`(5분) 잠김이 걸리는 기존 로직(13-14행)과 결합하면, 이
  엔드포인트를 반복 호출하는 것만으로 **전교생 로그인을 동시에 잠그는
  DoS**가 가능하다. 인증 서버 API 무단 접근 없이 공개 엔드포인트만으로
  가능한 실공격 경로.
- **수정안**: 입력값의 `%`/`_`/`\`를 이스케이프(예: PostgREST의
  `ilike`는 `\`를 이스케이프 문자로 지원 — `str.replace(/[%_\\]/g, '\\$&')`
  후 전달) 하거나, 이름 정확 일치(`.eq`, 대소문자는 별도 정규화)로
  전환.
- **상태**: **수정 준비 완료 — 브랜치 `fix/verify-student-pin-ilike`
  (커밋 `fb65dd7`), 운영자 승인 후 머지 대기.** `trimmedName`을
  `.replace(/[\\%_]/g, '\\$&')`로 이스케이프한 뒤 `.ilike()`에 전달하도록
  수정, 정상 이름(한글/공백/어포스트로피) 대소문자 무관 완전일치 동작은
  그대로 유지 확인(빌드 통과). **프로덕션 인증 경로(서버리스, service_role
  key)라 운영자 승인 없이 main에 무감독 병합하지 않는다**는 이 저장소의
  기존 관례(`docs/SECURITY_AUDIT_V311.md`의 CRITICAL 처리 방식과 동일
  원칙)에 따라 브랜치에만 격리해 두었다.
- **리스크**: 승인 후 머지는 국소적(1개 파일, 정규식 이스케이프 1줄
  추가)이라 낮음. 머지 전까지는 방치 리스크가 그대로 유지(현재도 라이브에
  열려 있는 경로).

### H2. `supabase/functions/admin-content-write/index.ts:193-212` — `words.bulk_replace` 검증 전 delete

- **재현**: `handleWordsBulkReplace`(193행)가 `rows` 배열의 유효성
  검증(`insertRows` 구성, `requireString(r?.word, ...)` 등, 199-207행)보다
  **먼저** `supabase.from('words').delete().eq('unit_id', unitId)`(196행)를
  실행한다. 손상된 payload(예: `word` 필드 누락 행 1개 포함)를 관리자
  화면에서 저장 시도하면, delete는 이미 성공한 뒤 insert 단계에서
  `requireString`이 throw — 유닛의 기존 단어가 **전량 소실**되고 새
  단어는 하나도 안 들어간 빈 상태로 남는다.
- **영향**: 엑셀/PDF 일괄 업로드 또는 단어별 추가 경로(`setClassWords`가
  이 액션의 유일한 클라이언트 호출부, `wordLibrary.js:551,564`) 중 손상된
  1개 행만으로 유닛 전체 단어가 사라지는 파괴적 실패 모드.
- **수정안**: `insertRows` 구성(검증 포함)을 delete **앞**으로 옮겨,
  검증 실패 시 delete 자체가 실행되지 않도록 순서 교정. 원자성까지
  보장하려면 Postgres 함수/트랜잭션이 이상적이나, 최소 수정은 순서
  교정만으로 이 버그 클래스를 없앤다.
- **상태**: 보류 — **수정 후 Edge Function 재배포 필요**(`supabase
  functions deploy admin-content-write`). Deno 함수는 로컬 하네스로
  검증 불가(`docs/SECURITY_AUDIT_V311.md` §4 MEDIUM-1과 동일 제약)라
  운영자가 배포를 트리거하는 세션에서 함께 처리하는 것이 안전.
- **리스크**: 수정 자체는 몇 줄 순서 변경으로 낮음. 배포를 놓치면(코드만
  고치고 재배포 안 함) 버그가 라이브에 그대로 남는다는 점이 이 항목의
  핵심 리스크 — `v3.11`/`v3.12` 배포 지연 사고(`docs/SECURITY_AUDIT_V311.md`
  §1 "최악의 중간 상태")가 이미 이 실패 모드의 선례.

### H3. `src/utils/spellingReviewAiApi.js:517-526` + `src/utils/spellingReviewBulkPlan.js:66-78` — `accepted_meanings` 배치 lost-update

- **재현**: 같은 단어에 대한 두 검토 답안(예: 오타 변형 2건)이 한 일괄
  처리 배치에 포함된 경우, 각 처리가 처리 시점의 `words.accepted_meanings`
  스냅샷을 읽어 자신의 답안만 추가한 뒤 **전체 배열을 덮어쓰기(full-
  replace)**한다 — 첫 번째 쓰기가 반영한 인정 답안이 두 번째 쓰기가 읽은
  스냅샷엔 없으므로, 두 번째 쓰기가 완료되면 첫 번째 인정이 사라진다.
- **영향**: 검토 큐 쪽 행은 이미 `status: accepted`로 표시돼 재노출되지
  않으므로 관리자는 이 손실을 알아챌 방법이 없다(**조용한 손실**).
  `writingReviewAutoPilot` 플래그가 꺼져 있는 지금도 관리자가 수동으로
  같은 단어 여러 답안을 한 일괄 처리에 포함시키면 그대로 재현된다 — AI
  자동화 여부와 무관한 구조적 버그.
- **수정안**: (a) 단기: 같은 단어를 대상으로 하는 배치 항목을 순차
  처리(직렬화, 매 항목 처리 직전 최신 `accepted_meanings` 재조회) (b)
  중기: `accepted_meanings`를 배열 컬럼 대신 정규화된 자식 테이블
  (`word_accepted_variants`, 이미 v3_7로 존재)로 완전히 이전해 append-only
  insert로 전환.
- **상태**: 보류 — 로직 변경 대상 파일 2개가 오늘 세션(21~23차)의
  실사용 코드라 회귀 위험 재검토 필요, 운영자 확인 후 진행.
- **리스크**: 중간. 학생 성적/보상에 직접 영향은 없지만(인정된 오타
  변형이 나중에 다시 오답 처리되는 방향), 교사가 이미 "처리 완료"로
  믿은 항목이 조용히 원상복귀된다는 점에서 신뢰도 리스크.

### H4. `src/hooks/useStudent.js:1078-1095` — 라운드 완료 signature 충돌로 보상 스킵

- **재현**: `signature = \`${round.date}:${round.wordsViewed.length}:
  ${round.examplesHeard}:${round.quizSolved}:${round.pronunciationOk}\``
  (1078행)이 같은 날 두 번째 4/4 라운드에서 **첫 번째 라운드와 동일한
  카운트 조합**이면 동일 문자열이 된다. `handledRoundRef.current ===
  signature`(1079행) 가드가 이를 "이미 처리한 라운드"로 오판해 이후
  로직(1082-1105행: `grantReward`/`grantXp`, 및 인접 로직의 선물/스티커/
  라운드 리셋)이 **통째로 스킵**된다.
- **영향**: 코드 주석(1082-1094행)이 스스로 명시하듯 "별/스티커는 라운드
  반복마다 매번 지급"이 **의도된 기존 게임 경제**인데, 카운트가 우연히
  같은 두 번째 라운드에서는 이 의도된 반복 지급이 막힌다 — 보상 경제
  직결 버그.
- **수정안**: signature에 라운드 시작 시각(`round.startedAt` 등 존재하면)
  또는 단조 증가 라운드 카운터를 포함시켜 "카운트 조합이 우연히 같은
  서로 다른 라운드"를 구분. 코드 주석(1093-1094행)이 이미 "날짜 키로의
  변경은 별도 운영자 승인 없이는 하지 않음"이라 명시 — signature
  구성요소 확장도 같은 원칙으로 운영자 승인 전제.
- **상태**: 보류.
- **리스크**: 중간-높음. 재현 조건(같은 카운트 조합)이 흔하지는 않지만
  (매일 4/4 미션을 두 번 완료하는 학생 한정), 발생 시 학생이 눈으로
  보상을 받아야 정상인데 못 받는 체감 버그라 신고로 이어지기 쉽다.

---

## MEDIUM

### M1. `LearningRecommendationsCard` 패턴 등록 adminPin 누락 → v3.11 이후 조용한 저장 실패

- **위치**: `src/components/admin/LearningRecommendationsCard.jsx`
- **재현(과거)**: v3.11 락다운(`classes/units/words` anon UPDATE 차단)
  라이브 적용 이후, 이 컴포넌트가 `adminPin` 없이 `words` 테이블에
  anon UPDATE를 시도해 0행 처리(통계 카드에는 "등록됨"으로 표시되지만
  실제 `accepted_meanings`는 저장 안 됨).
- **상태**: **수정됨**(커밋 `9bbad4a` `fix(writing): 패턴 등록 adminPin
  배선` — 오늘 세션, `PROJECT_AUDIT.md` §4). 실측 확인:
  `LearningRecommendationsCard({ adminPin })` prop 추가 +
  `registerRecommendation(row, adminPin)` 배선(2026-08-02 주석 포함). 같은
  커밋에 데이터 계층 방어도 함께 들어갔다 — `wordLibrary.js:582`
  `setWordAcceptedMeanings()`의 레거시 anon 경로(`adminPin` 미전달 시)가
  `.select()` 없이 update만 호출해 RLS가 0행 처리해도 error 없이 "성공"
  반환하던 조용한 성공(silent-success) 버그를 `.select('id').maybeSingle()`로
  갱신 행을 직접 확인해 0행이면 명확한 Error를 throw하도록 교정 — 위
  adminPin 배선과 별개로, 앞으로 다른 호출부가 adminPin 없이 이 함수를
  호출하는 실수를 해도 조용히 데이터가 사라지는 대신 즉시 눈에 보이는
  에러로 실패하도록 이중 안전장치를 걸었다.
- **리스크**: 해소.

### M2. `StudentSelect` 신규 등록 부분 실패 → 로그인 불가 고아 계정

- **위치**: 학생 신규 등록 플로우(로그인 화면)
- **재현**: 등록 중 일부 단계(예: 반 배정 이후, PIN 설정 이전)에서
  네트워크 오류가 나면 `students` 행은 생성됐지만 로그인에 필요한 후속
  상태가 없는 "고아 계정"이 남을 수 있다.
- **상태**: 문서화만(보류) — 코드 무변경.
- **리스크**: 낮음-중간(발생 빈도 낮음, 발생 시 해당 학생 1명 로그인
  불가 → 운영자 수동 조치 필요).

### M3. `SpellingQuestion` 700ms 타이머 언마운트 미정리

- **위치**: `src/components/SpellingQuestion.jsx`(700ms 지연 타이머)
- **재현**: 타이머 대기 중 컴포넌트가 언마운트되면(화면 전환) 콜백이
  언마운트된 컴포넌트의 상태를 갱신 시도.
- **상태**: 문서화만(보류).
- **리스크**: 낮음(React가 경고를 낼 수 있으나 크래시는 아님).

### M4. `SpeechBtn` 언마운트 후 늦은 성공 콜백 — 이탈 단어에 별 지급

- **위치**: `src/components/SpeechBtn.jsx`
- **재현**: 발음 인식 진행 중 학생이 다음 단어로 넘어가면(컴포넌트
  언마운트), 늦게 도착한 성공 콜백이 이미 이탈한 이전 단어 기준으로
  별을 지급할 수 있다.
- **상태**: 문서화만(보류).
- **리스크**: 낮음-중간(보상 정합성, 학생에게 불리한 방향은 아님 —
  과다 지급 쪽).

### M5. 빈 로컬 복원 경로가 병합 아닌 교체 조건

- **위치**: `src/hooks/useStudent.js:731-739` 부근
- **재현**: 로컬 저장소가 비어 있는 상태에서 클라우드 복원이 일어나는
  경로가 기존 로컬 데이터와 "병합"이 아니라 "교체" 조건으로 분기.
- **상태**: 문서화만(보류).
- **리스크**: 낮음(빈 로컬 상태 한정이라 실손실 시나리오가 좁음).

### M6. `spellingReviewQueue` 삭제된 단어 id 영구 잔존

- **위치**: `spelling_review_queue` 관련 코드(`spellingReviewApi.js`/
  `spellingReviewAiApi.js`)
- **재현**: 단어가 나중에 삭제돼도 큐 행의 word 참조(id 또는 텍스트)가
  정리되지 않고 남는다.
- **상태**: 문서화만(보류).
- **리스크**: 낮음(UI 표시 이상 정도, 데이터 무결성 파괴 아님).

### M7. 오토파일럿 실행 중 UI 미잠금(수동 액션과 동시 쓰기)

- **위치**: `SpellingReviewQueuePanel.jsx`(`writingReviewAutoPilot` 경로)
- **재현**: 오토파일럿이 백그라운드로 규칙+AI 단계를 실행하는 동안
  관리자가 같은 화면에서 수동으로 인정/무시 버튼을 누르면 두 쓰기가
  경합할 수 있다.
- **상태**: 문서화만(보류) — 플래그 기본 off라 실사용 시에만 재현.
- **리스크**: 낮음(플래그 off인 지금은 발생 안 함).

### M8. `wordLibrary` 컬럼 폴백이 "모든 에러"에서 발동

- **위치**: `src/utils/wordLibrary.js`의 컬럼 부재 폴백 로직
- **재현**: `accepted_meanings` 컬럼 조회 실패를 "컬럼 없음"과 "일시적
  네트워크/DB 오류"를 구분하지 않고 동일하게 폴백 처리 → 일시 오류
  발생 시 세션 내내 `accepted_meanings`가 빈 상태로 취급될 수 있다.
- **상태**: 문서화만(보류).
- **리스크**: 낮음-중간(일시적 표시 오류, 저장된 실데이터는 손실 아님).

### M9. `entrance_tests` anon 쓰기 개방이 서버 재채점 무력화

- **위치**: `supabase_v1_8_entrance_test.sql`(`entrance_tests` RLS)
- **재현**: 클라이언트가 anon key로 `entrance_tests` 결과를 직접 쓸 수
  있어, 서버 측 재채점 로직을 우회해 값을 조작할 수 있다.
- **상태**: 문서화만(보류) — `docs/SECURITY_AUDIT_V311.md` §2가 이미
  `entrance_tests`를 "anon 쓰기 필요(설계상 열림)" 목록에 포함한 것과
  같은 계열의 갭.
- **리스크**: 낮음(blast radius가 단일 학원 내부, 입실시험 결과 조작
  동기가 낮음).

### M10. self-set/set-student-pin check-then-act 레이스 [수정 준비 완료]

- **위치**: `api/self-set-student-pin.js` / `api/set-student-pin.js`
  계열(PIN 설정 API)
- **재현**: PIN 설정 가능 여부(`pin_setup_allowed` 등)를 확인(check)한
  뒤 실제 설정(act)하는 두 단계 사이에 동시 요청이 오면 레이스가
  가능 — 같은 학생 row를 대상으로 자기등록 요청 두 개가 거의 동시에
  도착하면 둘 다 SELECT의 `pin_hash IS NULL` 확인을 통과해 둘 다 UPDATE를
  실행하고, 나중에 끝난 쪽이 먼저 쪽의 PIN을 조용히 덮어쓴다(last write
  wins) — 먼저 요청이 성공 응답을 받았는데 실제 로그인 PIN은 다른 값이
  되는 오작동.
- **상태**: **수정 준비 완료 — 브랜치 `fix/verify-student-pin-ilike`
  (커밋 `fb65dd7`), 운영자 승인 후 머지 대기.** `api/admin-pin-actions.js`의
  `set_pin_setup_allowed` 액션과 동일한 패턴으로 UPDATE 자체에
  `.is('pin_hash', null)` 조건을 다시 걸어 원자적으로 재확인 —
  레이스에서 진 요청은 0 rows 영향으로 끝나고 기존 `already_set` 응답
  형태를 그대로 받는다. **관리자 PIN 재설정 경로(`adminAuthed`가 참인
  `api/set-student-pin.js` 호출)는 기존 PIN을 의도적으로 덮어쓰는 것이
  정상 동작이라 이 가드를 의도적으로 적용하지 않았다** — 자기등록
  경로(`adminAuthed`가 아닌 경우)에만 `.is('pin_hash', null)`을 건다.
- **리스크**: 승인 후 머지는 국소적(2개 파일, 조건부 필터 추가)이라
  낮음. 미머지 상태로는 동시 요청 조건이 좁아(발생 빈도 낮음) 리스크
  낮음-중간 그대로 유지.

### M11. `updateTextbookMeta`/`deletePublisher` 듀얼패스 미배선

- **위치**: `src/utils/curriculum/curriculumApi.js`,
  `src/components/admin/CurriculumTree.jsx`
- **내용**: 차기 락다운 배치(`TECH_DEBT.md` 참고) 대상 테이블에 대한
  쓰기 함수인데 아직 adminPin 듀얼패스가 배선돼 있지 않다 — **락다운
  SQL을 먼저 실행하면 이 두 함수가 v3.11/v3.12와 동일한 방식으로 즉시
  깨진다.**
- **상태**: 문서화만(보류) — `TECH_DEBT.md`의 "차기 락다운 배치" 선행
  조건으로 등재.
- **리스크**: 락다운 SQL을 먼저 실행하면 즉시 발현(높음), 지금은 SQL
  미실행이라 발현 안 함(낮음).

### M12. `api/generate-audio.js` — PATCH URL wordId 인코딩 비대칭 [수정 준비 완료]

- **위치**: `api/generate-audio.js`(PATCH 대상 URL 구성부)
- **재현**: 같은 파일의 조회 경로는 `encodeURIComponent(wordId)`로
  이스케이프하는데, 뒤쪽 PATCH URL은 `wordId`를 인코딩 없이 그대로
  문자열에 이어붙인다. `wordId`가 이미 `words` 테이블에 실존하는 값이어야
  이 지점까지 도달하므로(위 lookup에서 404로 먼저 걸러짐) 오늘 당장
  악용 가능한 인젝션 경로는 아니지만, 쿼리스트링 특수문자(`&`/`#` 등)가
  섞일 경우 PATCH 대상이 의도와 다르게 해석될 잠재 위험이 있는
  비일관성. 이번 4축 감사에서 새로 발견된 항목(기존 `BUG_REPORT.md`에는
  미등재 상태였음).
- **상태**: **수정 준비 완료 — 브랜치 `fix/verify-student-pin-ilike`
  (커밋 `fb65dd7`), 운영자 승인 후 머지 대기.** lookup과 동일하게 PATCH
  URL에도 `encodeURIComponent(wordId)` 적용(방어적 일관성, 동작 변화
  없음).
- **리스크**: 낮음(1줄 방어적 수정, 오늘 재현 가능한 실공격 경로는
  아님).

---

## 이 세션 중 추가로 발견·즉시 수정된 저위험 항목 (4축 감사 목록 외, 코드 반영 완료)

4축 감사(§HIGH/§MEDIUM)와 별개로, 같은 세션 안에서 컴포넌트를 훑던 중
발견해 저위험 판단 하에 바로 고친 항목들 — 전부 학생/관리자 화면 리소스
누수·예외·레이스 계열이고 데이터 무결성/보상 경제와는 무관하다.

### L1. `QuizGame.jsx`/`WordDetail.jsx` — 녹음 blob URL 누수 + 재생 예외 미처리 [수정됨 `307a49a`]

- **재현(과거)**: `PronStep`(QuizGame.jsx)/`SpeechBtn`(WordDetail.jsx)이
  녹음마다 `URL.createObjectURL(blob)`을 새로 만들면서 이전 URL을
  `revokeObjectURL`로 해제하지 않아, 같은 단어에서 재녹음을 반복할수록
  blob URL이 계속 쌓였다(누수). 또한 `new Audio(myRecUrl).play()`가
  브라우저 자동재생 정책 등으로 reject되면 unhandled promise rejection.
- **상태**: **수정됨**. 두 컴포넌트 모두 `recUrlRef`로 마지막 blob URL을
  추적해 "새 URL로 교체되는 시점"(언마운트 시점이 아니라)에만
  `revokeObjectURL`하도록 교정(재녹음 중에도 이전 "내 발음" 재생이 도중에
  끊기지 않게 하는 순서 유지) + `.play().catch(() => {})`로 재생 실패를
  조용히 무시. `QuizGame.jsx`는 추가로 (a) 더 이상 쓰이지 않는 이중
  가드(`processing` ref, `handleSelect` 자체가 이미 `isAnswered`로
  막혀 있어 중복 로직) 제거, (b) `PronStep`의 React key를
  `current.word.word`(문자열, 동철이의어 충돌 가능)에서
  `current.word.id`(고유 식별자)로 교정.
- **리스크**: 해소. 데드 훅 `src/hooks/useFeatureAccess.js`(어디서도
  실사용 안 됨, `WordDetail.jsx`가 유일한 import였는데 이 커밋에서
  `useMicReady` 사용 제거와 함께 훅 자체도 삭제)도 같은 커밋에서 함께
  정리.

### L2. 관리자 화면 에러 처리·레이스·중복 헬퍼 5건 [수정됨 `0c10c34`]

- **L2-a `spellingReviewApi.js:fetchPendingSpellingReviews`**: "테이블 없음"과
  "그 외 에러"를 구분 없이 동일 처리하던 것을 `isMissingTableError`일
  때만 `null`("SQL 실행 필요"), 그 외는 빈 배열 + `__fetchError` 마커로
  분리 — 호출부(`WritingStatsDashboard` 등, Phase 2 웨이브에서 이 마커를
  실제로 소비하도록 연결됨)가 "기능 미설치"와 "일시적 조회 실패"를
  구분해 안내할 수 있게 됨.
- **L2-b `AssignmentHistoryPanel.load`**: `AdminScreen.jsx`의
  `loadReqIdRef` stale-응답 가드 패턴을 동일 적용 — 반/날짜 범위를 빠르게
  바꿀 때 먼저 시작된 조회의 응답이 나중에 도착해 현재 선택 화면을
  덮어쓰는 레이스 방지.
- **L2-c `AdminScreen.jsx ExcelUpload.handleFile`**: 기존 `PdfUpload.handleFile`과
  동일하게 try/catch + 한국어 안내 메시지 추가 — 손상된 엑셀 파일
  업로드 시 처리되지 않은 예외로 화면이 멈추던 것을 방지.
- **L2-d `SpellingReviewQueuePanel.revertLastBatch`**: 부분 실패를
  `console.warn`으로만 삼키고 무조건 "완료"로 표시하던 것을 고쳐, 실패
  건수를 요약에 반영하고 실패한 행은 `lastAcceptedBatch`에 남겨 재시도
  가능하게 함(관리자가 "되돌리기 완료"로 오인해 실패 건을 놓치는 것
  방지).
- **L2-e `spellingReviewAiApi.js`**: 바이트 단위로 동일한
  `isMissingRelationError`/`isMissingQueueRelationError` 두 헬퍼를
  하나로 통합(중복 코드 제거, 동작 변화 없음).
- **상태**: 전부 **수정됨**. `npm run build` + 관련 `verify:admin`/
  `verify:writing` PASS 확인(해당 세션 handoff 기록).
- **리스크**: 해소.

---

## 요약 통계

| 등급 | 건수 | 수정됨 | 수정 준비 완료(브랜치, 머지 대기) | 보류(운영자 결정 필요) |
|---|---|---|---|---|
| HIGH | 4 | 0 | 1(H1) | 3 |
| MEDIUM | 12 | 1(M1) | 2(M10/M12) | 9 |

수정 준비 완료 3건(H1/M10/M12)은 전부 브랜치 `fix/verify-student-pin-ilike`
(커밋 `fb65dd7`) 한 곳에 격리돼 있고 main에는 아직 반영되지 않았다 —
운영자 승인 전까지는 라이브(main/Vercel 배포)에서 여전히 미수정 상태로
취급한다.

다음 작업 순서는 `NEXT_PRIORITY.md`, 구조적 이월 부채는 `TECH_DEBT.md`.
