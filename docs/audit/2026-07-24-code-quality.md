# Code Quality Audit — Paul Easy Voca (2026-07-24)

이 감사는 `docs/reading/09-codebase-audit.md`(2026-07-23)의 델타 감사입니다 — 그 문서의 모든 항목을 현재 HEAD(`d68a106`) 기준 재확인하고, 그 이후 추가된 쓰기검수-AI 기능(af25b1d..bedec11, 약 5커밋)에서 새로 발견된 것만 별도 표기했습니다.

## 1. 중복 코드

### 1-1. `isMissingTableError` — 대부분 통합됨(이전 감사 R3 완료), 신규 중복 1건 발생
상태: `src/utils/wordLibrary.js:1016`가 `isMissingTableError()`를 export, `readingApi.js:19`/`sentenceProgressApi.js:20`가 이를 import(주석에 "감사 문서 09 §1-1 재복제 중단" 명시) — R3 권고가 실행됨.
신규/Medium: `src/utils/writingAnswerStatsApi.js:31`가 자체 `isMissingRelationError(err)`를 정의(42P01/PGRST205/메시지 정규식 — isMissingTableError와 논리적으로 동일), 같은 파일에서 4회 사용(55, 79, 163, 168행). 09-audit이 지적한 패턴이 쓰기검수-AI 작업 중 다시 발생.
리팩터: wordLibrary.js에서 isMissingTableError를 import하도록 교체. 위험 낮음(순수 predicate 함수), 긴급하지 않은 독립 후속 작업으로 적합. **(2026-07-24 별도 세션이 AdminScreen 분리 리팩터링을 착수 — 이 항목 B는 이번 라운드 범위 밖으로 남음, 다음 라운드 후보)**

### 1-2. 날짜/시간 정규화 — Asia/Seoul 고정오프셋 계산이 2개 파일에 중복
writingAnswerStatsApi.js:129-132(SEOUL_OFFSET_MS)가 "이 저장소 다른 곳의 getSeoulDateString과 동일한 전제"라고 명시적으로 주석 — 즉 존재를 알면서도 재도출.
spellingReviewAiApi.js도 자체 Seoul-day 경계 로직 보유.
09-audit 1-6(3가지 날짜 포맷 — localIsoDateStr/fmtDay/toDateString()/UTC slice) 변경 없음, 그대로.
리팩터: 하나의 getSeoulDateString()/SEOUL_OFFSET_MS를 공유 유틸로 추출(신규 utils/dateSeoul.js 또는 wordLibrary.js에 추가). 위험 낮음(순수함수) — 단 useStudent.js의 todayStr()(toDateString())는 절대 건드리지 마라(모든 학생의 캘린더/스트릭/기록 키에 영향, 09-audit이 명시적으로 High-risk 표기).

### 1-3. normalize* 3개 함수 — 이름은 비슷하나 의미상 진짜 다름
spelling.js:6 normalizeSpelling(대소문자/trim만), sentenceLearning.js:28 normalizeAnswer(문장학습 채점용), grade-writing-answers/pipeline.js:32 normalizeForCompare(NFKC+공백+문장부호 제거, AI검토 중복그룹핑용). 서로 중복 아님 — 이름 충돌 리스크(향후 세션이 서로 바꿔써도 되는 줄 착각할 위험)일 뿐. Severity: Low. 이름 변경은 불필요한 churn — 문서주석 교차참조 정도만 권장.

### 1-4. 나머지(1-2 UI 헤더/카드 중복, 1-3 TTS cancel 우회, 1-5 fail-open catch 패턴) — 변경 없음
TTS 우회: QuizGame.jsx가 여전히 window.speechSynthesis.cancel()을 speech.js 경유 없이 직접 호출(이번 라운드 재검증 안 함, 관련 코드 무변경 확인).
fail-open catch{} 패턴은 신규 쓰기검수-AI 파일들에도 일관 적용됨(writingAnswerStatsApi.js:105,228,255, spellingReviewAiApi.js 다수 — 전부 "조용히 무시" 주석 포함) — 긍정적 연속성 신호.

## 2. 과대해진 파일 — AdminScreen.jsx 증가가 이번 라운드 헤드라인

| 파일 | 라인수(09-audit, 07-23) | 라인수(현재, 07-24) | 변화 |
|---|---|---|---|
| src/components/AdminScreen.jsx | 1,537 | 2,410 | +873 (+57%), 약 1일 |
| src/utils/wordLibrary.js | 2,037 | 2,044 | +7 |
| src/hooks/useStudent.js | 1,345 | 1,345 | 0 |
| src/App.jsx | 846 | 878 | +32 |
| scripts/testWritingReviewAiPipeline.mjs | (없었음) | 1,964 | 신규 |

Critical/High — AdminScreen.jsx가 가속적으로 God Component화되고 있음. 쓰기검수-AI 기능(v1~v1.3+자동학습)에서 5커밋, SpellingReviewQueuePanel(398~1082행, 685줄 단일 함수)이 새로 추가되고 LearningRecommendationsCard(1083~1180)/AiSavingsCard(1181~1213)/LearningRateCard(1214~1257) 3개 카드도 전부 인라인 추가됨. 09-audit R9 권고("AdminScreen 탭별 파일 분리")와 정반대 방향 — 하루에 5개 서로 다른(추정) 세션이 같은 파일을 건드려 규칙 16(파일 소유 경계) 충돌 위험 증가.
리팩터 방향: SpellingReviewQueuePanel(+신규 카드 3개)을 src/components/admin/으로 추출 — StudentDirectory.jsx(725줄, 07-22 추출) 선례와 동일 패턴. 순수 이동+import경로 수정, 로직 변경 없음.
위험 평가: 낮음~중간(단독 추출 커밋으로 하고 즉시 verify:admin 재실행 시). 컴포넌트가 {onChanged, adminPin, onSavingsUpdate} props만 받는 완전 독립 함수로 확인됨(다른 AdminScreen 로컬 state를 closure로 참조 안 함). **(2026-07-24 같은 날 별도 세션에서 이 추출 작업 착수 — `.ai-status/implementer-adminscreen-split.json` 참고)**

scripts/testWritingReviewAiPipeline.mjs가 1,964줄로 scripts/ 내 최대 파일(이전 최대 단일 테스트 스크립트는 약 406줄). 테스트 파일이라 우선순위는 낮으나, 한 모놀리식 파일에 모든 섹션이 누적되는 구조는 병렬 세션이 슬라이스를 나눠 갖기 어렵게 만듦(같은 규칙16 우려의 테스트 버전) — TESTING.md/docs-maintainer 참고용으로 기록.

## 3. 에러 처리 일관성
09-audit의 fail-open 컨벤션(설명 주석이 붙은 조용한 catch{})이 신규 쓰기검수-AI 파일에도 일관 적용됨을 재확인. alert()는 여전히 admin 전용 파일(6개, 전부 lazy-load, 학생 번들에 없음)에 집중 — 기존과 동일한 의도된 패턴. 이번 라운드에서 새로운 불일치 발견 없음(09-audit의 30파일/139건 전수 스윕은 재실행 안 함 — 이번 라운드에 그 파일들이 변경되지 않아서).

## 4. 죽은 코드/미사용 export
09-audit 확인 항목 재검증: wordLibrary.js:325 getTextbookById — 여전히 export되지만 외부 참조 0건(grep 확인). 변경 없음, 이번 신규 기능이 건드리지 않음. 신규 데드코드 후보 없음(신규 쓰기검수-AI 추가분은 전부 실제로 wired-in됨, grep 확인).

## 5. 네이밍 불일치
normalize* 계열 외에(§1-3), variant/meaning/answer 어휘 확인: accepted_meanings(words테이블 컬럼, 실제 채점 데이터) vs word_accepted_variants(v3.7 별도 감사로그 테이블, 동의어 저장 이력) — "accepted"를 공유하지만 서로 다른 두 개념(커밋 61a2c5a 메시지로 확인, spellingReviewAiApi.js:102,488,494에서 각자 맥락에 맞게 정확히 쓰임 확인). 버그는 아니나 새 세션이 헷갈릴 수 있는 Low severity 가독성 함정 — 각 정의부에 짧은 doc-comment로 구분 권장(이미 부분적으로 있음, 강화 여지).
DB컬럼-JS변수 네이밍(student_answer → submittedAnswer vs 단순 answer) 소폭 드리프트 — 리팩터 불필요.

## 6. 테스트 하네스 esbuild 스텁 패턴
7개 scripts/build*Bundle.mjs 빌더 확인 — Type A(리프 유틸 자체 번들, buildWordLibBundle/buildEntranceBundle)와 Type B(useStudent.js 번들+시나리오별 스텁, buildProgressBundle/buildRaceBundle/buildMultiTabBundle)로 명확히 구분되는 의도된 설계(각 스텁이 "이 패턴을 따른다"는 주석 보유, buildMultiTabBundle은 "왜 공유 안 하는지"까지 명시 — syncCalls 배열이 시나리오 간 섞이지 않게 하기 위함). Severity: Low/정보성. 제네릭 팩토리로 통합 가능은 하나, 기존 모든 test*.mjs를 건드리게 되어 위험/보상 비율이 나쁨 — 권장하지 않음.

## 리팩터 우선순위 요약

| # | 발견 | 심각도 | 지금 안전한가 |
|---|---|---|---|
| A | AdminScreen.jsx → SpellingReviewQueuePanel+신규카드3개를 src/components/admin/으로 추출 | High | 예, 단독 이동 커밋으로(동시 작업 세션 없는지 먼저 확인) — **2026-07-24 착수됨** |
| B | writingAnswerStatsApi.js의 isMissingRelationError → 공용 isMissingTableError import로 교체 | Medium | 예, 순수 predicate 교체 — 이번 라운드 미착수, 다음 후보 |
| C | Seoul-offset 날짜 계산 중복(writingAnswerStatsApi.js, spellingReviewAiApi.js) | Medium | 예, 순수함수만 추출 — useStudent.js의 todayStr()는 절대 건드리지 말 것 — 미착수 |
| D | normalize* 네이밍 명확화 | Low | 예, 주석만 — 미착수 |
| E | accepted_meanings vs word_accepted_variants 네이밍 함정 | Low | 예, 주석만 — 미착수 |
| F | 테스트 하네스 빌더 중복 | Low/정보성 | 권장 안 함 |
| G | 이전 감사 미해결 항목(R1 registry 갭, R2 dbIntegrityAudit v3.1 갭, R6 데드코드, R8/R9/R10/R11) | 변경 없음 | 원 09-audit 참고, 재논의 안 함 |

가장 중요한 발견은 A: AdminScreen.jsx가 쓰기검수-AI 기능으로 하루 만에 57%(1,537→2,410줄) 증가, 685줄짜리 신규 컴포넌트 1개+카드 3개가 전부 인라인 추가되며 09-audit R9 리스크가 예상보다 빠르게 현실화되고 규칙16(파일 단독 소유) 위반 위험을 실제로 키우고 있다는 것. 두 번째로 실행 가능한 항목은 작은 저위험 정리: writingAnswerStatsApi.js가 wordLibrary.js에서 이미 export된 isMissingTableError의 중복(isMissingRelationError)을 다시 만들었다는 것 — 07-23 감사가 "export해서 재복제를 막았다"는 수정이 파일 2곳엔 통했지만 그 이후 추가된 3번째 파일엔 전달이 안 됐다. 그 외(에러처리 일관성/데드코드/네이밍/테스트하네스 스텁)는 07-23 감사와 동일하거나, 쓰기검수-AI 기능이 기존 컨벤션(단일원본 AI_MODEL_ID/가격, 일관된 fail-open 주석, admin전용 alert 사용, lazy-load 경계 유지)을 올바르게 따르고 있음을 보여준다. 이번 라운드에서 Critical(빌드깨짐/데이터무결성) 이슈는 발견되지 않았다.
