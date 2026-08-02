# TECH_DEBT.md — 이월 부채 (2026-08-02 기준)

_작성: 2026-08-02, docs-maintainer. "버그"(재현 가능한 오동작)는
`BUG_REPORT.md`, 우선순위 실행 순서는 `NEXT_PRIORITY.md`. 이 문서는
**구조적으로 남겨진 채무**(당장 오작동은 아니지만 다음 변경을 어렵게
하거나, 특정 순서를 지키지 않으면 위험해지는 것들)를 다룬다. append-only
— 해소된 항목은 삭제하지 않고 "해소됨"으로 표시한다._

---

## 1. 차기 락다운 배치 후보 (선행 조건 있음 — 순서 위반 시 v3.11 재발)

### 대상 테이블

`entrance_tests`, `textbooks`, `class_textbooks`, `passages`,
`passage_sentences`, `publishers`, `grades`, `grammar_points`, `examples`
— 현재 anon key로 CRUD 가능(`docs/SECURITY_AUDIT_V311.md` §2 "using
(true)" 목록의 일부 + v3_13 신설 테이블).

### 선행 조건 (반드시 이 순서로)

`classes`/`units`/`words`(v3.11)와 `daily_assignments`(v3.12) 락다운
때 이미 한 번 겪은 사고 패턴 — **Edge Function(듀얼패스) 배선·배포가
SQL 락다운 실행보다 먼저 끝나 있어야 한다.** 순서를 지키지 않으면
"코드는 락다운을 전제로 배포됐는데 함수가 없어 관리자 쓰기가 404로
깨지는" 중간 상태가 재발한다(`docs/SECURITY_AUDIT_V311.md` §1 "최악의
중간 상태" 실측 기록 참고).

1. `supabase/functions/admin-content-write/index.ts`에 이 9개 테이블용
   action 핸들러 추가(각 테이블 CRUD를 adminPin 검증 후 service_role로
   수행).
2. `src/utils/curriculum/curriculumApi.js`/`wordLibrary.js` 등 클라이언트
   쓰기 함수를 듀얼패스(pin 있으면 Edge Function, 없으면 기존 anon —
   과도기 호환) 또는 pin 필수로 전환. **특히
   `updateTextbookMeta`/`deletePublisher`(`BUG_REPORT.md` M11)는 지금
   전혀 배선돼 있지 않다 — 이 두 함수부터 먼저 배선해야 한다.**
3. 함수 배포(운영자, `supabase functions deploy admin-content-write`) +
   실배포 확인(404→401 전환 실측).
4. 그 다음에야 락다운 SQL(`supabase_v3_1x_...sql`, 신규 파일 필요) 실행.
5. verify 하네스에 42501 정직 SKIP 래퍼(기존 v3.11/v3.12 패턴,
   `chore(harness)` 커밋들 참고) 추가.

### 상태

미착수(설계만). 신규 SQL 파일 없음 — 위 1~2단계(코드)가 먼저다.

---

## 2. `isMissingTableError`/`isMissingRelationError` 3벌 중복

`api/` 계층(Node 서버리스)과 `src/` 계층(브라우저) 각각에 "테이블
부재 감지" 헬퍼가 별도로 존재(`docs/reading/09-codebase-audit.md` §1-1
에서 이미 확인, 2026-07-23 시점): 원본(미export)
`src/utils/wordLibrary.js:1009-1014`, 완전 동일 사본
`src/utils/readingApi.js:20-25`/`src/utils/sentenceProgressApi.js:20-25`,
api/ 변형 `api/compute-word-king.js:28`=`api/start-new-season.js:26`.

- **통합 위험도**: 낮음(순수 판정 함수, export만 추가하면 됨) — 단
  api/(Node)와 src/(브라우저)는 번들 경계가 달라 완전 1개로 합치지
  말고 계층별 1개씩(총 2개)으로 수렴이 현실적.
- **상태**: 미착수. 우선순위 낮음(동작 오류 없음, 순수 유지보수성
  문제).

---

## 3. `wordLibrary.js` 세대 카운터(`syncGenRef` 계열) 부재 영역

`useStudent.js`는 동시 저장 레이스를 막는 세대 카운터 패턴을 이미
쓰고 있지만(2026-07-18 Phase 1 수정, `handoff.md` 근거), `wordLibrary.js`
쪽 일부 쓰기 경로(특히 관리자 화면의 다중 탭 동시 편집 시나리오)는
동일 보호가 없다.

- **상태**: 미착수, 재현 조건이 좁아(관리자가 다중 탭으로 동시 편집)
  우선순위 낮음.

---

## 4. 오토파일럿 원자성

`writingReviewAutoPilot`(기본 off) 실행 중 배치 처리가 항목 단위로
순차 실행되며 중간에 실패해도 이미 처리된 항목은 롤백되지 않는다 —
`BUG_REPORT.md` H3(lost-update)와 M7(UI 미잠금)의 근본 원인과 겹치는
구조적 갭.

- **상태**: 미착수. `word_accepted_variants`(v3_7) 기반 append-only
  전환(§H3 수정안 (b))이 이 항목도 함께 해소할 가능성.

---

## 5. `ai_usage_daily` read-modify-write 비원자

일일 AI 비용 상한 게이트(`evaluateCostGate`)가 현재 사용량을 읽고
+ 새 사용량을 더해 다시 쓰는 read-modify-write 패턴 — 동시 요청 2개가
겹치면 카운터가 한쪽 증분을 잃을 수 있다(원자적 `increment` RPC 미사용).

- **영향**: 비용 상한이 실제보다 느슨하게 적용될 수 있음(금전적
  리스크는 `MAX_DAILY_COST` 설정값이 낮아 제한적).
- **상태**: 미착수. Postgres RPC(`increment_ai_usage(amount)`) 도입이
  표준 해법이나 신규 SQL 필요.

---

## 6. 메모리 엔진(Leitner) 배선 선행조건

`src/learning/memory/`(2026-08-01 22차, 커밋 `1c0d456`~`a6e0ef1`)는
설계·순수 로직·하네스(108단언)까지 완성됐지만 학생 화면에 아직
연결되지 않은 **의도된 스캐폴딩**(`PROJECT_AUDIT.md` §3의 "죽은 것
같지만 살아있는 파일" 4중 검증 대상 중 하나).

- **선행 조건**: `wordLibrary.js:1697` 부근 `review_data` 병합 로직
  수정이 먼저 필요(현재 병합 방식이 메모리 엔진이 기대하는 스키마와
  어긋나는 지점 존재 — `handoff.md` 2026-08-02(24차) "다음 단계" §5
  "review_data 병합 수정(메모리 엔진 배선 전)"에 이미 명시된 순서).
- **상태**: 코드 인프라 완료, 배선 미착수(운영자 우선순위 결정 대기).

---

## 7. 운영자 승인 대기 — 삭제 후보 파일

아래 파일들은 저장소 어디에서도 참조되지 않는 것으로 확인됐으나,
**docs-maintainer는 코드 파일을 삭제할 권한이 없다** — implementer
세션이 운영자 승인 후 삭제해야 한다.

- `gen_quiz3.py`
- `QUICK_START.js`
- `IMPLEMENTATION_SUMMARY.md`(이 파일은 `.md`이지만 "문서 체계"
  8종에 속하지 않는 1회성 산출물로 판단 — docs-maintainer 소유
  범위 밖, 별도 승인 필요)

- **상태**: 미착수(승인 대기).

---

## 8. `verify:login` 환경 FAIL (기존, 회귀 아님)

로컬 `SUPABASE_SERVICE_ROLE_KEY` 미설정으로 `testStudentSelectPinStatus.mjs`
/`testStudentPinAuth.mjs`/`testStudentPinSelfSetup.mjs`/
`testClearStudentPin.mjs` 4개가 `verify:all`에서 FAIL로 뜬다 — 코드
버그가 아니라 로컬 환경 변수 부재(`handoff.md` 22~26차에 반복
기록된 기존 갭, `COMPLETE_REPORT.md`도 동일하게 "환경, 코드 무관"으로
표기).

- **해소 방법**: 로컬 `.env`에 `SUPABASE_SERVICE_ROLE_KEY` 설정(운영자
  전용 시크릿 — 이 저장소 환경 특성상 반복 재설정 필요할 수 있음) 또는
  이 4개 스크립트에 login 도메인 전용 정직 SKIP 래퍼 추가(v3.11 패턴
  재사용, 코드 작업).
- **상태**: 미착수(우선순위 낮음 — 매번 FAIL 판정이 코드 문제가 아님을
  세션마다 재확인해야 하는 반복 비용만 있음).

---

## 요약 표

| 항목 | 선행조건 | 상태 |
|---|---|---|
| 차기 락다운 배치(9테이블) | 듀얼패스 배선·배포 → SQL 실행 순서 엄수 | 미착수(설계만) |
| isMissingTableError 3벌 통합 | 없음 | 미착수(저우선순위) |
| wordLibrary 세대 카운터 부재 | 없음 | 미착수(저우선순위) |
| 오토파일럿 원자성 | H3(lost-update) 수정과 연계 | 미착수 |
| ai_usage_daily 비원자 | Postgres RPC 신규 SQL | 미착수 |
| 메모리 엔진 배선 | review_data 병합 수정 먼저 | 코드 완료, 배선 대기 |
| 삭제 후보 3파일 | 운영자 승인 | 대기 |
| verify:login 환경 FAIL | SERVICE_ROLE_KEY 설정 또는 SKIP 래퍼 | 미착수(저우선순위) |
