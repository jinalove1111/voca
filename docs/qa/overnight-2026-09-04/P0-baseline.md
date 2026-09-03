# Overnight QA baseline — 2026-09-04 (KST 새벽, UTC 2026-09-03T19:11Z)

## Git
- origin/main: 1712cf5 (Merge PR #12 정원 철자 수정) = production SHA 1712cf57e13a16fab4635f710fd1c5dcae926ced
- 작업 시작 checkout: test/paul-town-progression (origin/main + 2 test commits, 미push)
- 열린 PR: #9 feat/reward-loop(29 ahead), #10 fix/textbook-grade-label(4 ahead), #11 fix/student-card-name-overlap(3 ahead)
- 미push 로컬 브랜치: test/paul-town-progression(2), ops/isanggi-textbook-cleanup(3, pushed)
- untracked(무접촉 유지): supabase_v3_38~41/hotfix/restore/verify SQL 13개, rows.json, .ai-status/implementer-pin-setup-code-lookup.json

## Production
- Vercel production: success · Release Gate(main): success · Deploy Ready: success · https://voca-drab.vercel.app 200
- 배포 번들 assets/index-CuuhNhuS.js = origin/main 로컬 빌드 해시 일치

## Local verification (origin/main + test commits)
- npm run build: build exit=0
- verify:all: ALL DOMAINS PASS (SKIP 도메인 제외), exit 0

## DB READ-ONLY baseline
- health:students: total 46 / PASS 36 / WARN 10 / FAIL 0 · excluded ARCHIVED 305, TEST 140, QA_FIXTURE 2 · ghostUnits 7
- prod:check: verdict WARN · invariants FAIL 0 / WARN 57 / PASS 12 · ux critical 0 / needsReview 50 / dataDebt 17 · DB WRITE 0

## 재확인된 알려진 상태
- Pre-Middle 9명(Kinney 포함) primary 교재 중1 천재 이상기(0a87be08) / Unit 1(36bba4d0) 정상
- 중1 천재 이상기(0a87be08) / 중2 천재 이상기(80e8d5dd) 별개 교재 유지(rename 없음)
- 학생 교재 선택 라벨 = textbooks.name (+publisher_name), grade 추론 없음
- English Garden 철자 정답 연결 수정 배포됨(PR #12)
- Paul Town progression 자동검사 222단언/38단계 PASS (test/paul-town-progression, 미push)
- 실제 학생 데이터 변경 없이 progression 검증 가능 확인
- ghost-unit WARN 10 = 별도 cleanup 대상(오늘 밤 미수정)

## Invariants tonight
Production DB WRITE 0 · SQL WRITE 0 · 실제 학생 데이터 변경 0 · merge 0 · deploy 0
