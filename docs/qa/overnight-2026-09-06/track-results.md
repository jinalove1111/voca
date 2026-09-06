# Overnight QA 2026-09-06 — 트랙별 결과 (Production WRITE 0)

- 브랜치: `test/overnight-qa-2026-09-06` · base = origin/main `f2fde30a2d2e61b4f70a2899a9cc1adbca225501`
- 실행 시각: 2026-09-05T19:54Z ~ (KST 09-06 새벽) · 운영자 부재 자율 세션
- 불변식(전 구간 준수): **Production DB WRITE 0 · SQL 실행 0 · 승인 티켓 발급 0 · prod:apply 0 · manifest 무수정 · 학생 데이터 변경 0 · v3_38/v3_39 파일 무수정·미실행 · 핫픽스 F 재시도 0 · main/backup 브랜치 무접촉 · push/PR/merge 0**
- 라이브 접근은 anon key `GET`(PostgREST select)과 READ-ONLY 스크립트(`health:students`/`prod:check`/`verify:integrity`/`verify:class-textbooks`)만 사용.
- 서브에이전트 원본 보고서(학생 실명 포함)는 gitignored `ops/overnight-2026-09-06/`에만 존재. 이 문서는 실명 마스킹본.

## 0. 커밋 (전부 이 브랜치, 미push)

| # | 해시 | 종류 | 내용 | FAIL-first(전→후) |
|---|---|---|---|---|
| 1 | `25f40c5` | test(harness) | `scripts/testNextFailState.mjs`(2026-08-08 d28709d P0 PIN 재잠금 루프 회귀) registry 미등록 → login 도메인 등록(extra:false) | 미실행 확정 → verify:login 11스크립트 PASS |
| 2 | `cf6cf0a` | fix(curriculum) | `practiceSentence.js` 절 경계가 닫는 따옴표(`movement,"`)에서 무력화 + 대명사 "I"가 고유명사 연쇄로 오인(-3) | runExamples 133P/3F → 136P/0F |
| 3 | `d738867` | fix(curriculum) | `textImport.js` 곡선 아포스트로피(’‘ʼʻ′＇) 문장에서 `don't`류 축약형이 NOT_FOUND — 매칭 판정 사본에만 정규화(원문 보존) + `scripts/testTextImportApostrophe.mjs` 신규(examples 도메인) | 2P/15F → 17P/0F |
| 4 | `028214a` | feat(prod-check) | 신규 READ-ONLY invariant `WORD_HEADER_RESIDUE`(WARN): 유령 유닛(≤3단어)이 아닌 정상 유닛 안의 헤더 잔재 행 탐지 | testProdCheck 218P/4F → 224P/0F |
| 5 | `d76e8ce` | fix(admin) | `DuplicateStudentAudit.jsx` "전체 실학생 N명"이 `/^QA_/`만 제외해 TEST/ARCHIVED 포함(라이브 187 vs 실제 46) → `isRealStudentAccount` 단일 원천 사용 | 35P/2F → 37P/0F |
| 6 | `c6704b6` | fix(ui) | 고정 `SpeedBtn`(bottom-5 right-5)이 대시보드 "퀴즈" 카드/단어 목록 마지막 행을 덮어 탭 가로챔 — 학생 화면 9개 래퍼 `pb-8→pb-24` + e2e 겹침 단언 2건 | e2e 55P/3F → 58P/0F |
| 7 | `cea23da` | test(harness) | 실사고 가드 4종(testStarDeltaOnEntry/testWordLibraryPagination/testEntranceTestSelection/testMissionBonusIdempotency) extra:true → false(게이팅) | 당일 전부 PASS 확인 후 승격 |
| 8 | `08b05bc` | chore(status) | implementer 체크포인트 | — |
| 9~ | handoff 113차 §커밋 표 참조 | fix(prod-check) | `WORD_HEADER_RESIDUE` 오탐 보정("meaning→의미"처럼 영단어 자체가 헤더 라벨인 정상 어휘 제외) + 미러 드리프트 가드 | — |

수정 원칙: 모두 Track J 허용 범위(Production 데이터 무관, 명백한 결함, 재현 테스트 있음, 소범위). 실 학생 기능 추가 0(규칙 12).

## A. Test / Build / Static

| 검증 | 결과 | 비고 |
|---|---|---|
| `npm run build` | PASS (22.6s) | 경고 없음 |
| `npm run verify:all` (base f2fde30) | ALL DOMAINS PASS — 스크립트 139 PASS / 1 FAIL(extra) / 도메인 SKIP 2(speaking/listening 설계상) | extra:true 72개 포함 실행됨(extra는 "미실행"이 아니라 "exit 코드 비반영") |
| ↳ 유일한 FAIL `scripts/testBrowserE2E.mjs` | **D(환경)** — `Cannot find package 'playwright'`(로컬 node_modules에 미설치) | 서브에이전트가 `npm install`(package.json/lock 무변경) 후 재실행 56/56 PASS. package-lock 추적 파일 무변경 확인 |
| `npm run verify:release -- --skip-build --skip-verify` (Gate 3+5) | RELEASE GATE PASS | Gate 3 health 46명 PASS 45/WARN 1/FAIL 0(WARN = 권*** ASSIGNMENT_GHOST_UNIT, 핫픽스 F 대상, KNOWN) · Gate 5 e2e 56/56 |
| `node --check` api/*.js, scripts/lib, scripts/prod*, tests/harness | 0 실패 | eslint/tsconfig 부재는 KNOWN 백로그(P3) |
| dist 번들 시크릿 스캔 | service_role/anon JWT 리터럴 0 | "admin_pin_required" 사유 문자열 4건 = NOISE |
| 수정 후 `verify:all` | 구현 에이전트 2차 실행 ALL DOMAINS PASS(1차에서 `testStudentPinAuth.mjs` Node/libuv `UV_HANDLE_CLOSING` 크래시 1회 — 단독 재실행 PASS, 파일 무수정 → **D/F 플레이크**) | 메인 세션 최종 재실행 결과는 handoff 113차 참조 |

분류 A(실제 src 결함): 없음(FAIL 기준). B(stale fixture): 없음. C(테스트 결함): registry 미등록 11개 스크립트(아래). D(환경): playwright 미설치, libuv 크래시 1회. E(예상된 prod 경고): health WARN 1, prod:check WARN 46(전부 KNOWN, §C). F: 없음.

**C-1 registry 미등록(한 번도 실행되지 않는) 스크립트 11개**: `testCiNameMasking`, `testEdgeFunctionsE2E`, `testLegacyMultiClassLive`, `testLesson5Journey`, `testMultiTextbookLive`, `testMultiTextbookLiveFixed`, `testNextFailState`(→ 커밋 1로 등록), `testReadingLive`, `testStudentsRlsPhase2b`, `testTextbookExample`, `testTextbookModelLive`. 문서 참조 0건. 대부분 `*Live*`(라이브 DB 필요) — 의도적 보관인지 폐기인지 운영자 판단 필요.

## B. 핵심 학생 Journey (코드+테스트 근거)

| 단계 | 구현 | 회귀 테스트 | 판정 |
|---|---|---|---|
| 1 로그인/PIN | StudentSelect.jsx, api/verify-student-pin.js, api/_pinAuth.js | login 도메인 필수 7종(+커밋 1로 P0 재잠금 가드 추가) | COVERED |
| 2 학생 식별(UUID) | useStudent.js id 키 저장소, `.eq('name')` 식별 0건 | testIdentityMigration(필수) | COVERED |
| 3 반 선택 | wordLibrary.js setStudentClass(컨테이너 반 가드) | testRenameClass/testMultiClass/testTextbookIsolation | COVERED |
| 4 교재 배정 | App.jsx textbookOptions(홈 반 class_textbooks ∪ 본인 SCA), getStudentPrimaryTextbook | testTextbookIsolation | COVERED |
| 5 현재 유닛 | resolveStudentUnitObj(08-29 수정) / **getStudentWords usingOverride 분기 `\|\| units[0]` 폴백 잔존**(wordLibrary.js ~3519) | testAssignmentGhostUnitRule(WARN, extra) | **PARTIAL — KNOWN P1(PROJECT_BOARD NEXT, 운영자 보류)** |
| 6 학습 시작 | App.jsx GuidedSession | testUiStabilityGuards | COVERED |
| 7 영↔한 방향 | getStudentSpellingSettings(학습 교재 소유 반 → 홈 반 → kr2en) | testWritingDirectionResolution(extra) | PARTIAL(비게이팅) |
| 8 spelling | spelling.js | testSpelling | COVERED |
| 9~14 skip/오답/별/완료/저장/복원 | useStudent.js syncGenRef·mergeProgressRecords·보상 dedup | testMultiTabRace/testMergeProgress/testDoubleEvents/persistence 9종 | COVERED |
| 15 입실시험 | entranceTest.js, api/submit-entrance-result.js | 500+ 단언 — **전부 extra:true**(커밋 7로 selection 1종 게이팅) | PARTIAL |
| 16 Paul Town/보상 | src/utils/attachment/* | garden 84 + growth-sources 74 + progression 237(필수) | COVERED |

과거 사고 재발 여부: 입실시험 일부만 표시(재현 안 됨, testEntranceRosterMinbyungchun/extra) · Song/Luke 누락(재현 안 됨, selection→커밋 7 게이팅, pagination→커밋 7 게이팅) · 타 학생/교재 단어 출제(재현 안 됨, testTextbookIsolation 필수) · Amin stale 세션(재현 안 됨, testEntranceBannerFreshScope/extra) · 전*** 단어 26개(08-27 SCA primary 유실 → 첫 유닛 폴백): **setPrimaryTextbook가 2026-09-03부터 current_unit_id를 학습 가능 유닛으로 재정렬함을 코드로 확인, 단 "primary 교체 → current_unit_id가 새 primary의 학습 가능 유닛" 회귀 테스트 없음(GAP, 아래 O)** · 권*** 별 증가(testStarDeltaOnEntry → 커밋 7 게이팅) · 학생 전체 보기 순간 표시(isRealDirectoryStudent 전용 테스트 없음, GAP) · PIN 생성/lookup 혼동(최신 보안 수정은 testPinSetupCapability, 이전 UI 2건 미테스트) · 반 vs 교재 컨테이너(testRealClassNames/extra) · primary/non-primary(testAssignmentUnitGuards/testAdminFlows).

## C. Assignment / SCA 무결성 (라이브 READ-ONLY)

- `health:students`: 493 계정 중 REAL 46 — PASS 45 / WARN 1 / FAIL 0 (ARCHIVED 305 · TEST 140 · QA_FIXTURE 2 제외).
- `prod:check`: invariants FAIL 0 / WARN 46 / PASS 15. WARN 코드 8종 전부 **KNOWN**: PRIMARY_UNIT_MISMATCH 24(기준 27, 학생 영향 0 분석 문서 존재) · STUDENT_CLASS_IS_CONTAINER 6 · SCA_GHOST_UNIT 1(권***, 핫픽스 F) · UNIT_WORDS_ABNORMAL 2 · GHOST_UNIT_PRESENT 7 · UNIT_CONTENT_DUPLICATE 3 · TEXTBOOK_SIMILAR_NAME 1 · AMBIGUOUS_TEXTBOOK 2.
- **개선 관측**: SCA_GHOST_UNIT 11→1, UNIT_WORDS_ABNORMAL 5→2, **STALE_CLASS_SCA 3→0** — PROJECT_BOARD BLOCKED "[P1] STALE_CLASS_SCA REAL 3건" 카드는 해소된 것으로 보임(운영자 확인 후 DONE 이동 권장).
- 직접 검사 전부 0: primary SCA 0개/2개 이상, current_unit이 primary 교재 밖, current_unit 단어<2, 학습 가능 유닛 0인 교재 배정, 중복 (student,textbook) SCA, 고아 SCA(375행 전수), 같은 교재 primary+non-primary 공존.
- NOISE(설계상): students.class_id ≠ primary SCA class 36건(개별 교재 배정 구조) · SCA.class_id ≠ textbook.owner_class 10건(컨테이너 반 구조, 코드화된 불변식 아님 — 설계 결정 필요).

## D. Curriculum / Unit / Word 품질 (라이브 READ-ONLY, 전수)

총량: 교재 10 · 반 19 · 유닛 58 · 단어 1,976(전수 페이지네이션) · class_textbooks 26 · 학생 493 · SCA 375.

| 항목 | 결과 | 분류 |
|---|---|---|
| 정상 유닛 안의 엑셀 헤더 잔재 행 | **1건 확정**: 중2 YMB 박준원 "Unit3"(`6ec4b139`, 41단어) word="영어·어구" meaning="의미", position 0, 2026-08-12 업로드(08-25 헤더 가드 이전) — REAL SCA 1 | **NEW MEDIUM** — 서브에이전트는 5건/HIGH로 보고했으나 메인 세션 라이브 재검증 결과 4건("word→말, 단어", "meaning→의미, 뜻" 등)은 position 14~26·예문·발음 자산 보유 정상 어휘 = **오탐**. 삭제는 운영자 결정(관리자 단어 편집 UI 또는 별도 SQL) |
| 유닛 번호 공백 | Presentation 6 -2026(3~7 없음) · 중2 능률 김기택(2,3) · 중2 천재 이상기(2~5) · 고1 6월 학평(4,8) | NEW LOW — 부분 업로드로 추정, 운영자 확인 |
| `중1 천재 이상기`.publisher_name = null(형제는 "천재") | 유사명 invariant가 이 쌍을 비대칭 판정 | NEW LOW |
| 교재 내 유닛 간 어휘 반복 141건 | 유닛 내 중복 0 | NOISE(복습 설계) |
| 빈 뜻/빈 영어/영=한 동일/공백/이상문자/중복 유닛명/학습 가능 유닛 0 교재 | 전부 0 | 클린 |
| KNOWN 재확인 | "7" 숫자 유닛 · 유령 1단어 유닛 7개 · 53e380c7 HOLD · 0단어 "Unit 1" 2개 · "Unit 7" vs "7" · 중1/중2 천재 이상기 | 변동 없음 |

## E. Admin 운영 흐름

- 반 이동(단건/일괄), 학생 생성, 유닛 배정(setAssignmentUnit/setPrimaryAssignment/setPrimaryTextbook)은 전부 `realClassList` + `isSuspiciousUnit`(유령/0단어) 가드 존재 — handoff 103차의 "재발 갭(유닛 배정 함수 미검증)"은 **2026-09-03 이후 닫힘**(문서만 stale, docs-maintainer 갱신 대상).
- `EntranceTestAdmin.jsx:207` 반 선택이 `getClassNames()`(컨테이너 포함) — 2026-09-02 유령 감사 문서가 "학생 배정 상태를 쓰지 않는 교사 콘텐츠 도구라 의도적으로 미변경"으로 기록 → **NOISE(의도된 상태)**.
- `students.account_status`(v3_34) 컬럼은 src/ 참조 0 — 미실행 SQL과 코드가 서로 무관(문서 드리프트, LOW).
- **NEW MEDIUM(커밋 5로 수정)**: 중복 학생 감사 패널 실학생 집계 오류.

## F. Reward / Paul Town / Progression

- 별 지급 조건·중복 지급·재입장 별 생성·유닛 완료 보상·진행 threshold·정원 성장·마을 해금·멱등키·다중 탭 race·stale client·실패 후 중복: 기존 단언(reward 15스크립트, double-events 45, progression 237, garden 84+74)으로 **PASS — 신규 테스트 불필요**.
- 유일한 문제는 분류: Reward System V1 도메인 13개 중 12개 extra:true(비게이팅), 입실시험 스위트 전부 extra:true. 커밋 7로 실사고 가드 4종만 게이팅 승격, 나머지는 운영자 정책 결정(아래 Open Questions).

## G. 모바일 학생 UX (Playwright 360×640/390×844 실측 + 정적)

| # | 심각도 | 위치 | 내용 | 상태 |
|---|---|---|---|---|
| 1 | HIGH | App.jsx(라우터 없음) | 폰 뒤로가기가 앱을 빠져나가 빈 페이지(history 미증가, goBack→about:blank). 진행 중 퀴즈/시험 화면 상태 소실(로컬 진행도는 저장됨) | 확인됨 — 아키텍처 결정 필요, 미수정 |
| 2 | HIGH→**수정(커밋 6)** | App.jsx:152 SpeedBtn | 고정 버튼이 "퀴즈" 카드(bbox 겹침 true)·단어 목록 마지막 행을 덮어 탭 가로챔 | 확인됨(bbox 실측) |
| 3 | MEDIUM | Dashboard.jsx:415,491 | `window.confirm()` 네이티브 다이얼로그(유닛 전환/로그아웃) | 추정 — 제품 결정 |
| 4 | MEDIUM | GiftReveal/HatCeremony 모달 | max-h/overflow 없음 → 짧은 뷰포트에서 확인 버튼이 화면 밖 가능 | 추정 |
| 5 | LOW | Bookshelf BookSpine | 긴 제목 잘림(말줄임 없음) | 추정 |
| 6 | LOW | SpellingQuestion | 키보드 표시 시 scrollIntoView 안전망 없음 | 추정(저신뢰) |

클린 확인: 긴 이름 줄바꿈, 이중 제출 가드, TTS 스팸 가드, UUID/내부 용어 노출 0, alert() 0, 탭 타깃 ≥44px, 로그인 에러/disabled 상태.

## H. Security / Privacy (정적)

Critical 0 · High 0 · Medium 3(전부 KNOWN 계열) · Low-Medium 1(NEW지만 의도된 상태로 재분류).
- Medium KNOWN: `api/grant-xp.js` 레거시 XP 분기 무인증 · `student_class_assignments` RLS allow-anon-all · `api/submit-entrance-result.js` 세션 토큰/소유권 검사 없음(보상 엔드포인트 강화와 불일치).
- PASS 재확인: service_role 클라이언트 노출 0 · PIN 로깅 0 · `.env`/실명 덤프 추적 0 · 이름 기반 식별 0 · 엣지 함수 전부 관리자 게이트 · 학생 화면 UUID 텍스트 노출 0.

## I. Health Check Blind Spots

studentHealthRules 17개 체크 + prodInvariants 25(→26) 코드 인벤토리는 `ops/…/trackC_I_M_report.md`에 원본. 잡히지 않던 조건:
1. **정상 규모 유닛 안의 헤더 잔재 행** — isGhostUnit이 ≤3단어 유닛만 판정 → **커밋 4/9 `WORD_HEADER_RESIDUE`로 해소**(라이브 1건 탐지).
2. 학습 기록 테이블(word_status/student_progress/xp_ledger/entrance_test_results)을 어떤 검사도 보지 않음 — 임시 조인 결과 word_status↔현재 SCA 교재 불일치 0(라이브 위험 낮음, 자동 회귀 없음).
3. 2~3단어 "정크" 유닛은 유령 판정·UNIT_WORDS_ABNORMAL 모두 통과(라이브 0).
4. UNIT_TEXTBOOK_CONTAINER_MISMATCH는 units.class_id가 있는 유닛만 대상(레거시 유닛 대부분 제외).
5. SCA.class_id ↔ textbook.owner_class 관계는 어느 방향도 불변식 없음(설계 결정 필요).
6. 관리자 로스터 조회 ↔ 학생별 health 결과 교차 검증 없음.

## J. 수정 요약 — §0 참조. 미수정(판단 보류) 항목은 아래 "Open Questions".

## K/L. v3_38 / v3_39 — `v3_38_v3_39_decision.md` 참조.

## M. 테스트 계정 격리

- 단일 원천 `src/utils/accountStatus.js`는 입실 로스터/Word King API/StudentDirectory "전체 학생" 카운트에서 정상 사용.
- **NEW MEDIUM → 커밋 5**: DuplicateStudentAudit.jsx 로컬 `/^QA_/` 필터.
- 참고(대상 밖): House 팀 점수(houseSystem.js)는 테스트 계정 필터 없음이나 학생 화면용이며 해당 마이그레이션 미실행.

## N. 고아 커밋 재평가 — `backup-commits-review.md` 참조. PORT_WORTHY 상위 4건은 커밋 1~3으로 포팅 완료.

## O. 신규 테스트 (blind spot 확인분만)

- `scripts/testNextFailState.mjs` 등록(P0 가드 부활) · `scripts/testTextImportApostrophe.mjs`(17단언) · runExamples +6 · testProdCheck +6(+커밋 9) · testAccountClassification +2 · e2e +2(겹침 bbox) · 게이팅 승격 4종.
- 설계만(미구현, 운영자 우선순위 결정): "primary 교재 교체 → students.current_unit_id가 새 primary의 학습 가능 유닛" 회귀(testAssignmentUnitGuards 확장, 전*** 08-27 경로 고정) · isRealDirectoryStudent/isRealSetupStudent 전용 단위 테스트 · word_status↔SCA 교재 정합 READ-ONLY 검사.

## Open Questions (운영자 결정 필요)

1. v3_38 적용 여부(대상 실학생 1명뿐, 관리자 UI 토글로 대체 가능) — `v3_38_v3_39_decision.md`.
2. v3_39 잔여 1행(Presentation 6 연결) — 관리자 "🔗 교재 연결" UI로 처리 권장, SQL 파일은 재실행 불가 상태.
3. 헤더 잔재 단어 1행(`f804c099`, YMB Unit3) 삭제 방식.
4. extra:true 스위트(입실시험 전부, reward 12/13)의 게이팅 정책.
5. registry 미등록 스크립트 10개(`*Live*` 등) 보관/폐기.
6. STALE_CLASS_SCA 카드 DONE 이동 확인.
7. 모바일 뒤로가기(라우터 부재) 대응 여부 — 아키텍처 결정.
8. SCA.class_id ↔ textbook.owner_class 관계를 불변식으로 고정할지.
