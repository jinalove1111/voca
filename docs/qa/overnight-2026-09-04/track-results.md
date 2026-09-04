## T1 (test/paul-town-progression) 4660c34 e773653 e55fb63 — garden e2e 44→74, progression 222→236, 분류 ACTIVE 9/DORMANT 1/NOT IMPL 2/UNREACHABLE 0, 결함 0
## T3 (test/excel-import-fixtures) 8871394 4c98eb3 a2797f5 — 54/54, 파서 결함 0, 개선 2건 → T3b
## T4 (test/reward-double-events) ae1626d fe118d6 — 45/45, 결함 0, 레거시 비원장 보상 5종 문서화
## T6 보안 — Critical/High 0, Medium 1(관리자 PIN 스로틀 커버리지) Low 1(평문 ===) → T6b
## T7 UI/성능 — crash 0, 저위험 후보 3 → T7b
## T3b (test/excel-import-fixtures) a2065ea 4eadd41 — 파서 경고 2종 추가(AdminScreen.jsx parseExcelRows), 62/62, FAIL-first 3
## T2 (fix/textbook-grade-label, PR #10 push) a38db8c ef5092c — 격리 스위트 43/43, 결함 0, FAIL-first(demote→delete 되돌려 2 FAIL 확인), PR #10 Release Gate PASS
## T5 (docs/overnight-qa-2026-09-04) 96e5cdc — REAL 46 PASS36/WARN10/FAIL0; 신규 저위험 2(0-word 유닛 참조 1명 non-primary, primary 교재가 반 selector 미연결 2명); 유령 inventory 57 유닛 중 11 의심(기존 7 + 0-word 2 + '7' 이름 2), 중복 교재 0, orphan SCA 0; 4fc69e2d 40단어 참조 0; HTTP GET/HEAD만
## T7b (fix/ui-stability-overnight) 8d2404a 2ac5ff9 6e08eac 5eec2f9 — GuidedSession key / 포그라운드 10s 쿨다운 / 검색 렌더 200 상한, verify:ui-stability 21/21, FAIL-first 7
