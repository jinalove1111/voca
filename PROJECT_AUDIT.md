# PROJECT_AUDIT.md — 프로덕션 하드닝 전수 감사 (2026-08-02)

_작성: 2026-08-02, docs-maintainer. 이 문서는 같은 날 병렬로 실행된 4개의
**읽기 전용** 감사 에이전트(코드 1줄도 수정하지 않음)의 산출물을 근거로
작성됐다. 발견된 개별 버그의 상세(파일:줄/재현/영향/상태)는
`BUG_REPORT.md`, 이월 작업은 `TECH_DEBT.md`, 우선순위는
`NEXT_PRIORITY.md`를 본다 — 이 문서는 **감사 범위·방법·총계·강점**만
다룬다(중복 방지)._

관련 기존 감사 문서(이번 감사가 대체하는 게 아니라 이어지는 것 —
`docs/reading/09-codebase-audit.md`는 2026-07-23 시점 스냅샷, 이번 감사는
2026-08-02 시점 재확인+신규 영역):

- `handoff.md` 19차~26차(2026-07-31~08-02, 문서정리/Curriculum Engine/
  쓰기 오토파일럿/숙제자동생성/배포 E2E/야간 폴리시 세션)
- `COMPLETE_REPORT.md`(같은 구간 종합 보고, v3.11 락다운 완성 경위)
- `docs/SECURITY_AUDIT_V311.md`(2026-07-29, v3.11 베타게이트 보안 감사)
- `docs/reading/09-codebase-audit.md`(2026-07-23, 중복/미사용 코드 감사)

## 1. 감사 범위와 방법 (4축)

| 축 | 대상 | 방법 |
|---|---|---|
| A. 학생 컴포넌트·훅 | `src/components/*.jsx`(관리자 제외), `src/hooks/*.js` | 코드 읽기 + 언마운트/타이머/레이스 패턴 수동 추적 |
| B. 관리자·데이터 계층 | `src/components/admin/*.jsx`, `src/utils/*Api.js`, `src/utils/wordLibrary.js` 등 | 코드 읽기 + 쓰기 경로(anon vs adminPin 듀얼패스) 대조 |
| C. 서버·보안·RLS | `api/*.js`, `supabase/functions/*/index.ts`, `supabase_*.sql` | 인가 게이트 실측 확인, 검증 순서(validate-then-write vs write-then-validate) 추적 |
| D. 기계적 스윕 | 저장소 전체 | grep 기반: TODO/FIXME, export 참조 카운트, import 근거, "죽은 듯 보이는" 파일의 동적 import/문서 인용 4중 교차 확인 |

4개 에이전트 전부 **읽기 전용**(프로덕션 코드/SQL 무수정) — 발견 사항은
같은 날 별도 세션(implementer)이 일부만 즉시 수정했고 나머지는
운영자 결정 대기로 `BUG_REPORT.md`에 상태를 명시한다(규칙 18: 코드로
강제된 것과 문서로만 기록된 것을 구분).

## 2. 발견 총계 (리스크 등급별)

| 등급 | 건수 | 비고 |
|---|---|---|
| HIGH | 4 | 전부 프로덕션 인증/데이터/보상 경로 직결, 전부 **운영자 결정 대기**(코드 미변경) — 상세 `BUG_REPORT.md` §HIGH |
| MEDIUM | 10 | 그중 2건은 같은 날 별도 세션이 즉시 수정(`9bbad4a`/`307a49a` — 아래 §4), 나머지 8건은 문서화만 — 상세 `BUG_REPORT.md` §MEDIUM |
| 이월 부채(비버그, 구조적) | 다수 | `TECH_DEBT.md` 참고 — 락다운 배치 후보, 중복 헬퍼 통합, 원자성 개선 등 |

HIGH 4건을 코드로 바로 고치지 않은 이유는 공통적으로 "프로덕션 인증/
쓰기 경로 직결이라 무감독 자율 수정을 지양한다"는 이 저장소의 기존
관례(`docs/SECURITY_AUDIT_V311.md`의 CRITICAL-1 처리 방식과 동일 원칙)를
그대로 따른 것 — 새로 만든 규칙이 아니다.

## 3. 코드베이스 강점(정직하게 함께 기록)

버그·부채만 나열하면 실제 상태를 왜곡하므로, 이번 감사에서 실측으로
확인된 강점도 남긴다:

- **TODO/FIXME 사실상 0건.** `src/`/`api/`/`supabase/functions/` 전수
  grep 결과 진행 중 표시용 TODO/FIXME가 거의 없다 — 이 저장소는 미완
  항목을 코드 주석이 아니라 `handoff.md`/`ROADMAP.md`/`TECH_DEBT.md`
  같은 문서로 관리하는 규율을 실제로 지키고 있다(2026-07-23 감사
  `docs/reading/09-codebase-audit.md` §2에서 이미 관찰된 "export만
  잉여" 패턴도 같은 규율의 연장).
- **유틸 export ~110개 중 진짜 미사용은 2개뿐.** 나머지는 전부 내부
  사용/동적 import/테스트 하네스에서 참조 확인. 2026-07-23 감사가 확정한
  "미사용 후보"(§2-1) 중 상당수가 이번 재확인에서도 그대로 유지.
- **모든 import에 근거 주석.** 특히 `supabase/functions/admin-content-write/
  index.ts`처럼 각 액션 핸들러가 `wordLibrary.js`의 어느 함수·줄과
  1:1 대응하는지 주석으로 명시하는 관례가 신규 파일에도 일관 적용됨(예:
  `handleWordsBulkReplace` 주석의 "wordLibrary.js:551,564 대응").
- **"죽은 것 같지만 살아있는" 파일이 실제로는 의도된 전방 스캐폴딩임을
  4중 검증으로 확인.** 예: 학생 조건부 예문 학습 단계
  (`curriculumExamplesStudentUI` 플래그, 기본 off)나 `src/learning/memory/`
  아래 메모리 엔진 인프라는 플래그가 꺼져 있어 학생 화면엔 아무 영향이
  없지만 (a) `AdminScreen.jsx`/`Bookshelf.jsx` 등에서 정적/동적 import로
  실제 도달 가능하고, (b) 전용 테스트 하네스(`verify:examples`,
  `verify:learning-engine`)가 존재하며, (c) 설계 문서(`docs/CURRICULUM_ENGINE.md`)에
  근거가 있고, (d) `ROADMAP.md`/`handoff.md`에 "Phase 0 완료, 다음 Phase
  대기"로 명시적으로 기록돼 있다 — 4가지가 전부 일치해야 "의도된
  스캐폴딩"으로 분류했고, 하나라도 어긋나면(예: 문서 근거만 있고 코드
  도달 불가) 미사용 후보로 남겼다(`docs/reading/09-codebase-audit.md`
  §2-1의 `useFeatureAccess.js`가 이 기준에서 탈락한 실례).

## 4. 오늘 이미 반영된 즉시 수정 (별도 세션, 이 문서 작성 시점 기준)

감사 발견 중 2건은 이 감사 문서 작성 전/중에 별도 implementer 세션이
저위험 판단 하에 즉시 수정했다(코드 diff 실측 확인 완료):

- 커밋 `9bbad4a` `fix(writing): 패턴 등록 adminPin 배선` —
  `LearningRecommendationsCard.jsx`가 `adminPin` prop을 받아
  `registerRecommendation(row, adminPin)`로 전달하도록 배선(v3.11 락다운
  이후 words anon UPDATE가 조용히 0행 처리되던 저장 실패를 차단). 상세는
  `BUG_REPORT.md` §MEDIUM.
- 커밋 `307a49a` `fix(student): 데드 훅 폴링·blob URL 누수·재생 예외·
  PronStep key 등 저위험 하드닝` — 학생 화면 리소스 누수/예외 계열.

나머지 발견(HIGH 4건 전부 + MEDIUM 8건)은 이 문서 작성 시점까지
**미수정**(코드 무변경) — `BUG_REPORT.md`의 상태 컬럼이 최신 진실.

## 5. 감사 커버리지 한계 (정직 표기, 규칙 18)

- `src/utils/wordLibrary.js` 1560-1650, 1681-1900 구간은 시간 제약으로
  **스킵 수준**(전체 정독이 아니라 함수 시그니처/호출 관계만 훑음) —
  이 구간에 이번 감사가 못 잡은 버그가 있을 수 있다.
- `src/utils/spelling.js`, `src/utils/weeklyReport.js`,
  `src/utils/dailyRitual.js`, `src/utils/attachment/*`는 **grep 스캔
  수준**(패턴 매칭으로 의심 지점만 확인, 라인 단위 정독 안 함) — 이
  파일들에 대한 "버그 없음" 결론은 아직 없다, 단지 "이번 감사 범위에서
  못 봤다"는 뜻.
- 4축 감사 전부 **정적 분석 + 코드 읽기**이고 실제 브라우저/모바일
  기기 재현은 하지 않았다 — HIGH/MEDIUM 항목의 "재현 시나리오"는 코드
  추적 기반 추론이며, `BUG_REPORT.md`에 실측 재현이 있는 항목과 코드
  추론만 있는 항목을 구분해 표기했다.

## 6. 다음 단계

우선순위/선행조건은 `NEXT_PRIORITY.md`, 이월 구조적 부채는
`TECH_DEBT.md`, 이번 세션 커밋 이력은 `CHANGELOG.md` 참고.
