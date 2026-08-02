# CHANGELOG.md — 세션별 변경 이력 (역순, 최신이 위)

_작성: 2026-08-02. 상세 배경/의도/리스크 판단은 `handoff.md`(세션별
서술형 로그)가 원본이다. 이 문서는 `git log`로 실제 확인한 커밋을
날짜/세션 단위로 짧게 나열하는 용도 — append-only, 기존 섹션 삭제
안 함._

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
