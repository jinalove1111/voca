# 야간 유령 유닛 감사·재발 방지 보고 (2026-09-02, 자율 야간 세션)

운영자 지시: WARN 10 + 유령 유닛 완전 이해 → v3_43/44 실행 가능성 검증 → 구조적 재발 방지 코드 → 테스트 → 보고서. **Production DB WRITE/SQL 실행/merge/deploy 0** (전 과정 READ-ONLY 조사 + 로컬 코드/SQL 파일 작업만).

## 1. Baseline (시작 시 재실측 → 종료 시 동일)

- health:students = **PASS 27 / WARN 10 / FAIL 0** (시작·중간·종료 3회 실행 모두 동일 — DB 무변경 증명)
- 드리프트 0: students 484 / SCA 341 / units 54 / words 1,816 / word_status 2,963 / progress 192. 유령 참조 SCA 21(집합 어제와 동일)·students 2·word_status 1.
- 보호 계정 전원 정상: Yaeji(18f59bd6 "Unit 7"·Presentation 6), 박민준·박성준(중1 동아 Unit5), Song(Unit5), Paul·Cookie·Jinaa. **야간 작업의 어떤 커밋도 학생 데이터·학습기록·별을 건드리지 않음.**

## 2. ROOT CAUSES (실측 근거 확정)

1. **반복 헤더 행 통과 = 유령 생성 경로.** `AdminScreen.jsx` 기존 안전망은 `!hasHeader && rowIdx <= leadingHeaderEnd` 조건이라, 헤더가 정상 인식된(hasHeader=true) 파일 **중간의 반복 헤더 행**(시트 병합본)이 word="English"/meaning="Korean"/unit="Unit" 으로 통과 → `unit || 'Unit 1'` → `setClassWords` → `ensureUnit` 이 이름 "Unit" 1단어 유닛 생성. 결정적 실측: 고1 능률 민병천 유령 "Unit"(08-11 12:58:16)은 정상 Unit3(08-11 12:58:20)과 **같은 업로드 배치에서 3.4초 먼저** 생성; 이후 업로드가 헤더 단어를 재삽입(유닛 08-11 생성 vs 단어 08-20 재생성 — 소영순·중1동아·김기택도 동일 패턴).
2. **서버 무검증.** `supabase/functions/admin-content-write`(unit.create / words.bulk_replace)에 헤더 라벨·유닛명 검증이 전혀 없음 — 클라이언트 파서가 유일한 방어선이었다.
3. **노출·쓰기 가드 비대칭.** `isLearnableUnit`(단어≥2)은 쓰기 3곳에만 있었고, 학생 Dashboard 드롭다운·학생 생성 폼·TextbookAssignmentPanel 은 유령/0단어 유닛을 그대로 노출. 08-11 14:55 황다은·현다율·권교빈의 SCA 가 유령을 가리키게 된 것이 이 경로이고, **08-23 09:14 현다율이 실제로 그 화면에서 헤더 단어 "English"를 known 처리**(word_status 실측 — "장전된 총이 발사된" 유일 기록).
4. **placeholder 'Unit 1' → 정규화 오매칭.** 유닛 0개 반의 합성 placeholder + 공백제거 정규화 = 유령 "Unit1" 유일매칭(Yaeji 실사고, 편집 폼은 b1da108 로 기봉합). 잔존 구멍: 생성 폼 폴백 `'Unit 1'` 이 서버 create_student 의 명시 이름 매칭(단어수 무검증)으로 유령 채택 가능 → 오늘 봉합(73115cf).
5. **유닛 이름 이원화.** "Unit 7"≡"Unit7"≡"unit 7" 이지만 **"7"은 별개**. 중1 동아에 "7"(08-25)과 "Unit 7"(08-27)이 각각 40단어·실학생 보유로 공존(따옴표 정규화 시 단어 40/40 동일 = 같은 시트 이중 업로드). 또한 업로드용 unitNameKey(선행 0 제거)와 조회용 normalizeUnitKey(0 유지) 두 정규화 공존 — "Unit 07" 업로드 병합 후 조회 불일치 가능. **병합/통일은 진도 이관이 필요해 migration proposal 로만 남김(§8), 코드 변경 없음.**

## 3. 유령 7개 forensic (참조는 v3_43 실행 전 현재값; daily_missed/daily_assignments jsonb 참조 전부 0, xp/reward 참조 0)

| 유령 | 교재 | 생성(unit/word) | stu/scaP/scaS/ws/blob | 판정 |
|---|---|---|---|---|
| 113ee184 "Unit" | 2학년 천재소영순 | 08-19 / 08-26 | 0/3(실3)/0/0/2 | SAFE_AFTER_REASSIGN |
| 35ee95ae "Unit" | 중1 동아 윤정미 | 08-11 / 08-11 | 0/0/0/0/0 | SAFE_DELETE |
| 3d1c753e "Unit" | 중2 능률 김기택 | 07-15 / 07-19 | 1/2/3(실1)/0/2 | SAFE_AFTER_REASSIGN |
| 4bc96928 "Unit" | 중2 YMB 박준원 | 07-20 / 07-20 | 0/0/1/0/1 | SAFE_AFTER_REASSIGN |
| **53e380c7 "Unit"** | 고1 능률 민병천 | 08-11 / 08-20 | 0/2(실2)/1(실1)/**1(실)**/3 | **HOLD** |
| 5d9db813 "Unit1" | 중1 동아 윤정미 | 08-04 / 08-18 | 1/1/0/0/1(Cherry=20) | SAFE_AFTER_REASSIGN |
| e327efc3 "Unit" | 중2 천재 이상기 | 07-13 / 07-13 | 0/2/6(실4)/0/1 | SAFE_AFTER_REASSIGN |

**53e380c7 별도 판정**: 현다율(e32b8d7d, REAL)의 word_status 1행("English" known, 08-23)이 그 단어(62997967)에 걸려 있고 `word_status.word_id → words CASCADE` 라 유닛(→단어) 삭제 시 실학습기록이 소실된다. "기록을 지워서 유닛을 지우는" 해법은 금지 지시 → **v3_44 삭제 목록에서 제외(HOLD), 파일이 실행 시점에 이 상태를 assert**. 보존 대안(운영자 결정): (a) 현행 HOLD 유지(권장, 유닛 1개 잔존은 무해 — UI 필터로 노출 0) (b) word_status 1행을 백업 테이블로 이관 후 삭제(별도 SQL 필요·기록 이동 승인 필요). 진도 blob 키 7건(Cherry=20 포함)은 FK 아님 — 어떤 SQL 도 건드리지 않고 전후 개수 assert 로 보존 증명.

## 4. WARN 10 분류 (11건 전부 ASSIGNMENT_GHOST_UNIT — "경고 제거용 억지 변경" 없음)
- **실오류(primary 5건)**: Harry·이윤제·Luke·황다은·현다율 — primary SCA 가 유령. 지금 화면은 students.current_unit_id 권위값 덕에 정상이나 교재 전환 캡처 경로에서 유령 사용 가능. → REQUIRED.
- **실오류(secondary 6건)**: 문지유·John·Dain·Song·권교빈·Harry — 그 교재로 전환하는 순간 1단어 화면(현다율 사례로 실증). 6명 모두 그 교재 학습기록 0 실측 → NULL 재배정 무손실. → REQUIRED.
- WARN 0 은 수리의 부산물로만 달성(v3_43 실행 후 기대).

## 5. v3_43 대상 분류 (총 23 = SCA 21 + students 2)
- REQUIRED 11 (실학생: A그룹 5 권위값 동기화 + B그룹 6 NULL)
- OPTIONAL 8+2 (비실 계정 SCA 8 + students 2 — v3_44 전제조건용; Barry 만 권위값 Unit6)
- **HOLD 2 → v3_43b 분리** (Paul_DUP_20260722_INACTIVE 2행 — 운영자 명시 승인 파일)
- DANGEROUS/UNNECESSARY 0 (전 행 LIVE 사전조건·학습흔적 재검증)

## 6. Paul_DUP 판정 = **A. 명백한 폐기 테스트 데이터**
Paul_DUP_20260722_INACTIVE(38717600-f114-4092-abb6-c285e531f2d6, ARCHIVED): 계정 생성(07-22 10:31:09)과 **같은 분**에 SCA 3행 생성(자동 dedup 산출물), stars 0 / word_status 0 / xp 0 / 진도 blob 0 / daily 3행뿐. 본계정 Paul(335a9560, stars 223·ws 17·xp 6)과 완전 별개. **그래도 승인 전 확정 금지 지시에 따라**: 어떤 파일도 이 계정·데이터를 삭제하지 않으며, SCA 2행 재배정만 별도 승인 파일 v3_43b 로 분리(실행 자체가 승인 행위가 되도록 헤더 명시). Paul_DUP_20260805(fafa6d09)는 유령 참조 0 — 범위 밖.

## 7. 구현한 재발 방지 코드 (전부 FAIL-FIRST, 실행 에이전트 구현 + 검수)

| 커밋 | 내용 | FAIL-FIRST 실측 |
|---|---|---|
| 2ac2993 | **fix(import)**: excelHeaderGuard.js 신규(단일 원천: isHeaderResidueRow — word·meaning 둘 다 라벨일 때만 폐기, sanitizeUnitLabel — 숫자 없는 "Unit"류 유닛 칸 무효화, 'no.' 별칭 추가) + AdminScreen 무조건 필터(hasHeader/위치 무관) + PDF 경로 필터. 기존 !hasHeader 안전망 유지(규칙 3). | 수정 전 7건 실패 → 32/32 |
| 5c589a8 | **fix(units)**: getLearnable{TextbookUnits,ClassUnits,ClassUnitNames} 헬퍼 + 학생 Dashboard 드롭다운·생성 폼·일괄이동 폴백·TextbookAssignmentPanel 적용. 생성 폼 'Unit 1' 리터럴 제거. 현재값이 필터에 걸리면 "(단어 부족)" 표기로 유지(표시 불파괴). | 수정 전 16건 실패 → 22/22 |
| 73115cf | **fix(students)**: create_student 명시 unitName 매칭에 단어≥2 검증(유령 매칭 시 자동 폴백). | 수정 전 5건 실패 → 34/34 |
| 513b389 | **chore(sql)**: v3_43/v3_43b/v3_44 + ROLLBACK 6파일(§9). | 정적 3중 검증 |

의도적으로 변경하지 않은 곳: AdminScreen 날짜배정/PDF 유닛 선택·EntranceTestAdmin·TestPaperGenerator(학생 배정 상태를 쓰지 않는 교사 콘텐츠 도구 — 0단어 유닛을 채우기 전 보는 것이 정상 워크플로), 생성 폼의 레거시(비교재 반) 유닛 목록 분기(운영상 희귀, 후속 후보).

## 8. 신규/확장 테스트
- scripts/testExcelHeaderResidue.mjs (신규 32단언) · scripts/testGhostUnitFiltering.mjs (신규 22단언) · testCreateStudentUnitAssignment +7(→34) · 기존 testExcelHeaderGuard 하네스 정합(CASE G 를 실사고 근거로 의도적 계약 확장, 오차단 방지 케이스 유지) · testAdminUnitEdit 33 무회귀. 전부 deterministic fixture(가짜 supabase/순수 함수), 라이브 DB 쓰기 0.
- 하네스 등록 완료: `verify:ghost-filtering` / `verify:excel-residue` (registry.mjs unitSwitching 도메인 + package.json — 별도 test(harness) 커밋)

## 9. SQL 최종 상태 (실행 0 — 전부 운영자 SQL Editor 수동, 권장 순서 v3_43 → v3_43b → v3_44)
- **v3_43**(SCA 19 + students 2): 실학생 primary 5 는 실행 시점 students.current_unit_id 와 재대조 후 동기화, 나머지 NULL. Paul_DUP 2행은 `_deferred` 로 명시 제외(상태만 검증).
- **v3_43b**(SCA 2): Paul_DUP 전용 — 실행 = 운영자 승인. 계정·학습기록 무접촉.
- **v3_44**(units 6 + words 6 삭제): 53e380c7 HOLD 제외, 백업 테이블 backup_v3_44_units/words 생성(+anon 권한 회수), pg_constraint 동적 FK 스캔, progress blob 7키 보존 assert. v3_43+43b 완료를 전제조건으로 강제.
- 각 파일 fail-first 트랜잭션 + 학습테이블/PIN 제외 fingerprint + Yaeji 정밀 assert. 정적 검증: 스펙 UUID 대조 FAIL 0 / libpg-query(PostgreSQL 16) 파서 6/6 OK / PL/pgSQL 린트(RAISE 자리표시자·미선언 변수·DIAGNOSTICS) 실오류 0.
- **v3_40/ROLLBACK 은 STALE — 실행 금지**(매핑 11행 전부 이미 목적지 → 즉시 abort).

## 10. 검증 결과
- 시작: build PASS / verify:all ALL DOMAINS PASS / health PASS 27·WARN 10·FAIL 0
- 종료: build PASS(14.94s) / verify:all ALL DOMAINS PASS(신규 2스위트 포함, 개별 PASS 378) / health PASS 27·WARN 10·FAIL 0 (시작과 동일 — DB 무변경)
- health WARN 10 은 **DB 부채**라 코드만으로는 변하지 않는 것이 정상(변하지 않았음 = DB 무변경 증거). v3_43 실행 후 0 이 되는 구조.

## 11. 남은 위험 / 내일 운영자가 할 일
1. **v3_43 검토·실행**(SQL Editor 1회) → `npm run health:students` 로 WARN 10→0 확인.
2. **v3_43b**: Paul_DUP 2행 재배정을 승인한다면 실행(파일 실행 = 승인). 승인하지 않으면 v3_44 는 실행 불가(전제조건이 막음) — 그 경우 지시 주시면 v3_44 를 5개 유닛 버전으로 재작성.
3. **v3_44 실행** → 유령 6개 삭제 확인(53e380c7 은 HOLD 로 잔존 — UI 에는 이미 안 보임). 이후 재실행되는 health 에서 ASSIGNMENT_GHOST_UNIT 0 유지 확인.
4. 이 브랜치(fix/pin-setup-and-unit-fallback)의 야간 커밋들을 PR → Release Gate → merge 로 배포(야간에는 push/merge/deploy 금지 지시라 로컬 커밋까지만).
5. (선택) 53e380c7 최종 처리 방침 결정 / 0단어 "Unit 1" 2개(67c8268e YMB·e4804821 김기택 — e4804821 엔 실학생 Song·황성연의 secondary SCA 가 걸림) 데이터 정리 / "Unit 7" vs "7" 병합 여부 / admin-content-write 엣지 함수 서버측 헤더 검증 추가(재배포 필요) / 생성 폼 레거시 분기 필터.

## 12. 금지사항 준수
PRODUCTION DB WRITE 0 / SQL EXECUTION 0 / DELETE 0 / 학습기록·별·보상 WRITE 0 / Yaeji·박민준·박성준·Song·Paul·Cookie·Jinaa 데이터 변경 0 / MAIN MERGE 0 / PUSH 0 / DEPLOY 0. 커밋은 작업 브랜치 로컬 소커밋만.
