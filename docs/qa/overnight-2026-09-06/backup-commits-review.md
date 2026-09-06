# backup/local-main-unpushed-2026-08-10 고아 커밋 8개 재평가 (2026-09-06 야간, READ-ONLY)

브랜치는 무접촉(merge/cherry-pick 0). `git show`/`git diff`로만 비교. 원본: `ops/overnight-2026-09-06/track_n_orphan_commits_review.md`.

| 커밋 | 항목 | 판정 | 근거 / 처리 |
|---|---|---|---|
| 97d72d5 | scripts/dataHealthCheck.mjs | SUPERSEDED | healthCheck/studentHealthCheck/auditCurriculumIntegrity/dbIntegrityAudit로 분할 대체 |
| 97d72d5 | scripts/verifyCurriculumText.mjs (DB 모드) | NEEDS_REVIEW | 예문 substring/품질/타깃 존재 라이브 감사기는 현재 없음(S/Low) |
| 97d72d5 | verifyCurriculumText.mjs (파일 모드) | 부분 SUPERSEDED | 중복 탐지는 TextImportPanel UI로, 나머지 9개 검사는 미대체 |
| a9aee55 | docs/CURRICULUM_IMPORT_GUIDE.md | NEEDS_REVIEW | 대체 문서 없음, 현재 UI와 드리프트 가능 |
| a9aee55 | docs/DATA_HEALTH_CHECK.md | SUPERSEDED | production-safety-harness-runbook 등 |
| 9abfaca | words 1000행 페이징 | SUPERSEDED | selectAllRows P0(2026-08-12) |
| 9abfaca | 하우스 점수 조회 중복 제거 | NEEDS_REVIEW | Dashboard.jsx:363-385 여전히 2회 조회(perf only, S/Low) |
| 22bbe55 | fill_blank targetWord 유출(LearningEngine.jsx:94-99, WordDetail.jsx:664) | PORT_WORTHY(플래그 OFF) | `curriculumExamplesStudentUI:false`라 노출 0 — 플래그 ON 전 필수 수정 |
| 22bbe55 | TTS/내 발음 에코 3건 | PORT_WORTHY(플래그 OFF) | 동일 |
| 22bbe55 | 모바일 터치 타깃(SpellingQuestion/SpellingReview) | LOW | 코스메틱 |
| 05c156a | NEXT_7_DAYS.md / TESTING.md append | OBSOLETE | 존재하지 않는 도구명 참조 |
| 05c156a | TECH_DEBT.md §9 | 대부분 OBSOLETE | 5개 하위 항목만 문서 갭 |
| e6b1503 | practiceSentence.js 절 경계·대명사 I | **PORTED → 커밋 cf6cf0a** | 현재 코드에 결함 잔존 확인, FAIL-first 3건 |
| f977286 | textImport.js 곡선 아포스트로피 | **PORTED → 커밋 d738867** | FAIL-first 15건 |
| f977286 | exampleLibrary.js validatePracticeSentence 불변식 + 캐스케이드 select | NEEDS_REVIEW(M) | 호출부가 전체 재제출 패턴이라 사고 0, 데이터 계층 방어 부재 |
| f977286 | testNextFailState 등록 | **PORTED → 커밋 25f40c5** | 죽은 P0 회귀 테스트 |
| f977286 | scripts/testCurriculumDataIntegrity.mjs | NEEDS_REVIEW | exampleLibrary 불변식 포팅 시 함께 |
| 87be00a | handoff 89차 기록 | OBSOLETE(이력) | 필요 시 backup 브랜치에서 열람 |

백업 브랜치는 위 NEEDS_REVIEW 항목 처리가 끝날 때까지 유지 권장(삭제 금지).
