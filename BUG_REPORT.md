# BUG_REPORT.md — 확인된 버그 (심각도순, 2026-08-02 감사)

_작성: 2026-08-02, docs-maintainer. 감사 범위/방법은 `PROJECT_AUDIT.md`,
우선순위/선행조건은 `NEXT_PRIORITY.md`, 구조적 이월 부채(버그가 아닌
설계상 갭)는 `TECH_DEBT.md`. 각 항목: 위치(file:line) · 재현 시나리오 ·
영향 · 상태(수정됨/보류/운영자 결정 필요) · 리스크._

---

## HIGH (전부 보류 — 운영자 결정 필요, 코드 무변경)

### H1. `api/verify-student-pin.js:48` — ilike 와일드카드 미이스케이프

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
- **상태**: 보류. **프로덕션 인증 경로(서버리스, service_role key)라
  운영자 승인 없이 무감독 수정하지 않는다**는 이 저장소의 기존 관례
  (`docs/SECURITY_AUDIT_V311.md`의 CRITICAL 처리 방식과 동일 원칙).
- **리스크**: 승인 후 수정은 국소적(1개 파일, 정규식 이스케이프 1줄
  추가)이라 낮음. 미수정 상태로 방치하는 리스크가 더 큼(현재도 라이브에
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
  `registerRecommendation(row, adminPin)` 배선(2026-08-02 주석 포함).
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

### M10. self-set/set-student-pin check-then-act 레이스

- **위치**: `api/self-set-student-pin.js` / `api/set-student-pin.js`
  계열(PIN 설정 API)
- **재현**: PIN 설정 가능 여부(`pin_setup_allowed` 등)를 확인(check)한
  뒤 실제 설정(act)하는 두 단계 사이에 동시 요청이 오면 레이스가 가능.
- **상태**: 문서화만(보류).
- **리스크**: 낮음(동시 요청 조건이 좁음, PIN 자체는 서버 검증 유지).

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

---

## 요약 통계

| 등급 | 건수 | 수정됨 | 보류(운영자 결정 필요) |
|---|---|---|---|
| HIGH | 4 | 0 | 4 |
| MEDIUM | 11 | 1(M1) | 10 |

다음 작업 순서는 `NEXT_PRIORITY.md`, 구조적 이월 부채는 `TECH_DEBT.md`.
