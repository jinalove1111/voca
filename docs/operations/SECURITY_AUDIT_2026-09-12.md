# 보안 감사 — 2026-09-12

## 범위 / 방법

**범위**

- PR #36 (`markPronunciationOk` 키)
- PR #38 (Features 패널 관리자 세션)
- PR #40 (stale chunk 복구)
- `api/grant-xp.js` town actions
- 라이브(운영) anon posture

**방법**

- 코드 읽기 기반 리뷰(read-only, 코드 변경 없음)
- `node scripts/testRlsSecurity.mjs` 실행 — 기능 4/4 PASS, 보안 7/7 PASS,
  SKIP 1건(authenticated 롤 부재로 인한 스킵)
- `node scripts/testSecurityRegressions.mjs` 실행 — 35/35 PASS, KNOWN(기지
  이슈로 분류되어 실패 처리하지 않음) 2건
- 위 두 하네스 모두 anon key, phantom id(존재하지 않는 학생/레코드 id),
  GET/HEAD 요청만 사용(운영 데이터를 변경하는 쓰기 호출 없음)

## 신규 발견 (등급표)

| 등급 | 건수 |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| Info | 2 |

### Info-1: `staleChunkRecovery.js`의 `isStaleChunkError`

- 브라우저/Vite가 실제로 던지는 import 실패 메시지에만 도달하는 조건이며,
  임의 문자열로 트리거되지 않음.
- reload 동작은 `window.location.reload()`로 고정되어 있어 open-redirect
  가능성 없음.
- 상태 저장은 `sessionStorage`만 사용.
- DEV 전용 에러 텍스트는 JSX 텍스트 노드로 렌더링되어 XSS 경로 없음.

### Info-2: `useStudent.js`의 `pronunciation-unidentified` 키

- `wordText`를 콜론 기준으로 정규화하지 않는 상태로 키를 구성.
- 다만 `wordText`는 관리자가 관리하는 커리큘럼 데이터이며 학생이 통제할 수
  있는 입력이 아님.
- `parseLegacyDedupKey`가 이 케이스에서 항상 `null`을 반환하므로 서버까지
  도달하지 않음.

## PR별 판정

### PR #38 — Features 패널 관리자 세션

- authed 판정은 `AdminScreen.jsx:1901`의 `/api/verify-admin-pin` 호출 결과
  `data.ok` 단일 경로로만 이루어짐.
- 이 변경으로 새로 추가된 storage 쓰기는 0건.
- `AdminScreen.jsx:1910`의 `!authed` 조기 반환에 의해 PIN 검증 없이 패널에
  도달할 수 없음.

**기존 Low(신규 아님, PR #38 이전부터 존재)**

- `rbac.js:127-129` `canManageFeatures`의 OR 절 중 `hasPermission(MANAGE_FEATURES)`
  경로는 브라우저 콘솔에서 `setUserRole('admin')`을 호출하는 방식으로 우회
  가능하며, 해당 패널 UI 자체가 그 우회 방법을 안내하고 있음.
- 다만 이 패널은 localStorage 플래그를 토글하는 UI일 뿐이며, 실제 서버 쓰기
  (`grant-xp.js`, `admin-pin-actions.js`)는 각각 독립적으로 인증을 수행하므로
  이 우회가 서버 측 데이터 변경으로 이어지지 않음.

**권고(코드 변경을 즉시 요구하는 것은 아님)**: 향후 이 패널에 실제 파괴적
액션이 연결되는 시점에는 OR 레거시 절을 제거하고 `checkAdminReauth` 패턴을
적용할 것.

### PR #36 — `markPronunciationOk` 키

- Info-2 항목 참고. 신규 취약점 없음.

### PR #40 — stale chunk 복구

- Info-1 항목 참고. 신규 취약점 없음.

### `api/grant-xp.js` town actions

- 재확인 항목(아래) 참고. 신규 취약점 없음(레거시 XP 분기의 기지 이슈는
  변경 없이 유지).

## 재확인 항목 (변경 없음, KNOWN)

- `api/grant-xp.js`의 레거시 XP 분기는 세션 토큰 검증이 부재
  (HIGH-1, BLOCKED 상태 — `handoff.md` 2026-09-02 §5 참고).
- `student_class_assignments`에 대한 anon phantom DELETE가 잠겨 있지 않음
  (`testSecurityRegressions.mjs` §6).
- `students` 테이블 PIN 관련 4개 컬럼(`pin_hash`/`pin_fail_count`/
  `pin_locked_until`/`pin_setup_allowed`)은 SELECT/UPDATE 시 42501로 차단됨.
- `reward_ledger`/`xp_ledger`에 대한 anon GRANT는 0건.
- 관리자 파괴적 API 3곳 모두 `await checkAdminReauth`가 정상 동작.
- `.env` 파일이 git 이력에 노출된 적 없음(0건).
- 클라이언트 코드에서 `service_role` 키 사용 0건.

## 라이브 실측 결과

- `node scripts/testRlsSecurity.mjs`: 기능 4/4 PASS, 보안 7/7 PASS,
  SKIP 1건(authenticated 롤 부재로 인한 스킵)
- `node scripts/testSecurityRegressions.mjs`: 35/35 PASS, KNOWN 2건
- 두 하네스 모두 anon key + phantom id + GET/HEAD 요청만 사용, 운영 데이터에
  대한 쓰기 없음

## 권고

- PR #38 관련: 향후 Features 패널에 실제 파괴적 액션이 추가되는 시점에
  `rbac.js`의 OR 레거시 절 제거 및 `checkAdminReauth` 패턴 적용.
- 재확인 항목 중 `api/grant-xp.js` 레거시 XP 분기 세션 토큰 검증 부재
  (HIGH-1)와 `student_class_assignments` anon phantom DELETE 미잠금은 기존
  BLOCKED/KNOWN 상태를 유지하며, 이번 감사에서 상태 변경 없음.

## 결론 (Verdict)

- "PR #36/#38/#40에 의해 새로 도입된 취약점이 있는가: 없다(NO NEW
  VULNERABILITY — YES, 즉 '신규 취약점 없음'이 맞다)."
- Security Score 변동 없음.

## 참고 파일 목록

- `AdminScreen.jsx` (라인 1901, 1910)
- `rbac.js` (라인 127-129)
- `api/grant-xp.js`
- `api/admin-pin-actions.js`
- `staleChunkRecovery.js`
- `useStudent.js`
- `scripts/testRlsSecurity.mjs`
- `scripts/testSecurityRegressions.mjs`
- `handoff.md` (2026-09-02 §5)
