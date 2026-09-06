# v3_38 / v3_39 운영 판단 자료 (2026-09-06 야간, READ-ONLY 조사 — 실행/수정 0)

두 SQL 파일은 저장소 루트에 untracked로 그대로 있으며 이 세션에서 읽기만 했다. 라이브 조회는 anon key GET만 사용. 원본 dossier(실명 포함)는 gitignored `ops/overnight-2026-09-06/trackK_L_v3_38_v3_39_dossier.md`.

## v3_38 — "중2 YMB 박준원" 반 쓰기 설정(kr2en→mixed, spelling_test_enabled false→true)

| 질문 | 확인 결과 |
|---|---|
| 원래 요구 | 2026-08-21 e92e993(쓰기 방향 source of truth = 학습 교재 소유 반, J*** 실사고) 직후 운영자 지시(08-22). 해당 교재로 공부하는 학생 전원의 출제 방향을 mixed로 |
| 현재 production 값 | `9e9ce482` spelling_direction=**kr2en**, spelling_test_enabled=**false** → **미적용** |
| UI 해석 | `wordLibrary.js getStudentSpellingSettings`: 학습 교재 소유 반 → 홈 반 → 기본 kr2en. 관리자 화면 SpellingSettingsPanel이 두 값을 반별로 직접 토글 가능(SQL 불필요, handoff에 다른 반 UI 적용 선례) |
| 유사 반 비교 | 19개 반 전부 spelling_test_enabled=false(적용 시 최초 활성화 반). direction은 kr2en 14 / mixed 5 |
| 적용 시 영향 | 교재 `59e0a0b7`(소유 반 9e9ce482) primary SCA 21행 중 실활성 학생 **1명**(C***) — 08-22 당시 추정 ~9명에서 로스터 정리로 급감. 원 사고 학생 J***는 현재 다른 교재(1ba6ec3d)가 primary라 무관 |
| 미적용 시 문제 | 실학생 1명이 kr2en 고정·쓰기 단계 비활성(운영자가 여전히 원하는지에 달림) |
| 롤백 의미 | 두 컬럼을 kr2en/false로 되돌림(학습 기록 무관) |
| 대체 여부 | 코드로 대체된 것 없음. 관리자 UI 토글이 동일 효과 |

**판정: NEEDS_OWNER_DECISION** — (1) 실학생 1명·최초 활성화 반이어도 여전히 원하는가? (2) 원하면 SQL 대신 관리자 UI 토글로 적용(멱등·감사 로그 UI 경로) 후 SQL 파일 폐기.

## v3_39 — "2학년 천재소영순" 교재를 Presentation 6 / Pre-Middle School에 노출 연결

| 질문 | 확인 결과 |
|---|---|
| 2행 가드 이유 | 헤더: "운영자 지시 — 2가 아니면 rollback"(fail-closed) |
| 현재 상태 | class_textbooks(1ba6ec3d) = 컨테이너 766dffcb + **Pre-Middle School 39e9acb1(2026-08-24 11:45 생성)**. Presentation 6(1693f32b) **미연결** |
| 드리프트 원인 | 파일 트랜잭션은 inserted_rows≠2면 전체 롤백이므로 "1행만 남는" 상태를 만들 수 없음 → PMS 행은 이 SQL이 아니라 관리자 "🔗 교재 연결" UI(ClassTextbookLinks.jsx)로 추가된 것. P6에도 08-08·09-03에 같은 UI로 다른 교재가 연결됨(운영자가 그 패널을 실제로 사용 중) |
| 실제 필요 | P6 실활성 8명 중 6명은 개별 SCA로 이미 접근 가능(연결 없어도 보임). **2명**(김***, A***)만 접근 경로 0 |
| 지금 실행하면 | 1행만 삽입 → STEP2 ① 가드로 롤백(DB 무손상, 그러나 영원히 실행 불가) |
| 대체 수단 | 관리자 UI 반 관리 › Presentation 6 › 🔗 교재 연결 — 동일 효과, 멱등 |

**판정: APPLY_REVISED_1_ROW — 단, SQL 수정이 아니라 관리자 UI 1클릭 권장.** 새 SQL은 작성하지 않았다. 운영자 질문: (1) 반 전체 노출이 여전히 필요한가(2명에게만 실효)? (2) 처리 후 v3_39 파일 2개 폐기 승인?
