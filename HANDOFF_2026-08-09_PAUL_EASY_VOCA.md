# HANDOFF 2026-08-09/10 — PAUL EASY VOCA (새 세션 인수인계 완전판)

_작성: 2026-08-10 (73~88차 세션 종료 시점). 세부 이력은 `handoff.md`(최상단이
최신), 도메인별 기준서는 `docs/`. 이 문서 하나로 새 세션이 바로 이어갈 수
있게 작성됨._

---

## 1. 현재 production 상태

- **앱**: https://voca-drab.vercel.app — 정상 서비스 중(학생 111명 규모 실사용).
  `main` push = Vercel 자동 배포(코드만 — SQL 자동 실행 경로 전무).
- **DB(Supabase azsjthtdjfpnctffjfsk)**: students 1157(실학생 ~41+Barry, QA/archive 다수) /
  words 971 / units 29 / student_progress 190 / word_status ~1855(자연 증가 중) /
  SCA ~445 / examples **5행**(중2 능률 김기택 Unit 6 — invitation 1·independence 4,
  전부 approved+한국어 해석+본문 핵심 표현 적용) / seasons 1행(무해 마커).
- **verify:all — ALL DOMAINS PASS**(30개 도메인, speaking/listening 2개만
  실기기 오디오 예상 SKIP)가 현재 기준선.

## 2. 마지막 배포 commit/번들

- 마지막 커밋: `37c73c6` (docs: 88차) — origin/main과 로컬 동기, 워킹트리 CLEAN.
- 프로덕션 서빙 번들: `assets/index-C0Oz9loH.js` (배포 확인 완료).
- 주요 기능 커밋: 품질 등급 `957c45d` / Writing MVP `6006900`+`9cad1dd` /
  핵심 표현 정책 `de01e82`·`4366803` / 5행 교체 실행은 87차(DB만, 코드 아님).

## 3. Feature flags (src/config/features.js — 기기 로컬 localStorage 병합)

| 플래그 | 기본값 | 의미 |
|---|---|---|
| `curriculumExamplesStudentUI` | **false** | 학생 "📚 교과서 예문 학습" 단계(핵심 표현+본문 보기) |
| `writingCoachEnabled` | **false** | 학생 Writing Coach(Dashboard 더보기 메뉴 진입) |
| (DB) `classes.gamification_enabled` | **컬럼 미생성**(v2_5 미실행) | Paul Rank/티켓 상점/Word King/House/Season 반별 점등 |
| 애착 시스템 플래그들 | 대부분 true(라이브) | 모자/앨범/정원/PaulTown 등 |

켜는 법: 테스트 기기에서 관리자 화면 → 기능 관리 패널(FeatureManagementPanel)
→ 토글(그 기기에만 적용). 전체 ON = features.js 기본값 변경+배포(운영자 승인).

## 4. Curriculum Phrase(본문 핵심 표현) 상태 — READY

- 정책: practice_sentence = source의 **연속 substring만**(새 문장/의역 전면
  금지 — 저장 계층 강제). 추출기 extractKeyChunk(관용 전치사구 허용, 장소·
  연도 꼬리 차단, bare-prep 시작 회피, 3~10단어, 짧은 문장 전문).
- 품질 등급 chunkQualityGrade HIGH/MEDIUM/LOW — LOW 자동 승인 금지 배지.
- 대표 1개 선정(유닛≫품질≫소스 랭킹) — 학생·관리자 동일 로직.
- 프로덕션 5행 적용 완료(exact_substring 5/5). **본문 전문은 저장 안 됨** —
  40단어 검증은 본문 재붙여넣기 필요(§13 BLOCKED).
- 기준서: `docs/CURRICULUM_EXAMPLES.md`. 관련 파일: `src/utils/curriculum/
  {textImport,practiceSentence,representativeExample,exampleLibrary}.js`,
  `src/components/admin/{TextImportPanel,ExampleManager,ApprovalQueue}.jsx`,
  학생측 `src/learning/adapters/learningItem.js`+`WordDetail.jsx`(본문 보기).

## 5. Writing Coach MVP 상태 — READY(Sentence Writing, 플래그 OFF)

- 로컬 규칙 검사(AI 호출 0): 오답 대필 금지→힌트 최대 3개→자가 수정 인정
  (selfCorrectedCount)→3회 후에만 정답 공개(all-or-null). compact state
  {original,currentAttempt,resolvedErrors,remainingErrors,attemptCount} =
  향후 AI 페이로드 동일 구조.
- 파일: `src/utils/writing/{errorTaxonomy,ruleChecks,writingSession}.js`,
  `src/components/WritingCoach.jsx`, Dashboard 진입(플래그 게이트),
  테스트 `scripts/testWritingCoach.mjs`(74단언, verify:writing-coach).
- **⚠ 서버 AI 검사 BLOCKED**: Vercel Hobby 함수 12개 한도 도달 —
  **api/ 폴더에 새 파일 절대 금지**(배포 안 됨, 과거 실사고). 옵션 3개
  (Supabase Edge Function 권장/기존 함수 통합/Pro) → `docs/WRITING_COACH.md`.
- DB 저장 미구현: `sql_migrations/writing_coach_20260810_design.sql`(설계만).
- targetWords 미연결(Dashboard가 빈 배열 전달 — 주석 표시, P1).

## 6. Game P0 상태

- **라이브(이미 학생 노출)**: 오늘의 미션 4/4(단어/듣기/퀴즈/발음×5)+별/XP/
  티켓 지급(멱등 3중 방어), streak 배지(categories≥4), 선물상자/모자 8종/
  앨범/정원/PaulTown/미니게임.
- **잠재(완성돼 있으나 숨김)**: Paul Rank/티켓 상점/Word King/House/Season —
  `classes.gamification_enabled` v2_5 SQL 1줄이 병목(PRECHECK PASS 완료).
- **신규 코어(미배선 P1)**: `src/utils/gamification/{dailyMissionModel,
  streakModel}.js`(숙제 연동 미션/freeze streak/best — 24단언).
- 설계서: `docs/GAME_REWARD_SYSTEM.md`(현황·로드맵), `docs/GAME_REWARD_RULES.md`(수치).

## 7. 미실행 SQL (전부 파일 준비 완료 — 운영자 수동 실행 대상)

| 파일 | 내용 | 상태 |
|---|---|---|
| `supabase_v2_5_gamification_master_switch.sql` | classes.gamification_enabled | **PRECHECK PASS**(실행문 1줄·additive·기본 false) |
| `supabase_v2_6_word_king.sql` | word_king_history | 대기 |
| `supabase_v2_7_house_system.sql` | students.house_id+백필 | 대기 — **규칙 10 GRANT 동반 확인 필수** |
| `supabase_v2_3_1_xp_action_based.sql` | 인덱스 1개 | 대기 |
| `sql_migrations/unit_naming_20260809/01~05` | 유닛 표기 통일 rename 15건 | **드라이런 5/5 PASS**(`node scripts/dryRunUnitNaming.mjs`) — 01→02(CSV)→03→04 순 |
| `sql_migrations/grammar_points_seed_20260809.sql` | 문법 포인트 20종 시드 | 대기 |
| `sql_migrations/publisher_grade_metadata_proposal_20260809.sql` | 출판사/학년 메타 | **운영자 확정 2건 필요**(출판사 표기·YMB=YBM?/학년 명명 관례) |
| `sql_migrations/writing_coach_20260810_design.sql` | writing 테이블 2종 | 설계 검토 후 실행 |
| `supabase_v3_30_...sql` 하단 [선택 블록] | 황성연 김기택 SCA→Unit 6 | 근거 확정(본인 학습기록 22건), 승인 대기 |
| (v3_5 season lifecycle) | 시즌 번호/원자 전환 | 시즌 운영 시작 전 실행 권장 |

## 8. 실행된 SQL (2026-08-09, 전부 사후 검증 PASS)

v3_29(백업/사전검증) → **v3_30**(빈 유닛 5개 삭제+포인터 이전 — 손실 0 증명)
→ **v3_31**(examples.source_meta) → **v3_32**(examples.practice_sentence).
그 이전: v1_6/1_7/1_9(PIN·RLS), v2_3(xp_ledger), v2_8(seasons), v3_1(교재),
v3_11(커리큘럼 쓰기 락다운), v3_13(curriculum engine), v3_19~28(로스터 정리).

## 9. Unit naming 잔여 이슈

- rename 15건은 §7 패키지로 즉시 실행 가능(충돌 0 재검증됨).
- **보류(과 번호 확정 필요)**: 김기택 빈 "Unit 1"(e4804821)·박준원 빈
  "Unit 1"(67c8268e) — 연결은 archive/QA+황성연 비primary SCA뿐.
- "Unit"(단어 English 1개) 테스트 유닛 3개 — 김기택 건에 **실학생 Harry
  비primary SCA 1건**(처분 시 재연결 필요).
- 재발 방지 코드 배포됨: ensureUnit 정규화 매칭+createClass 자동 생성 제거.
- 감시: `npm run verify:integrity`(신규 빈 유닛/중복 재발 시 FAIL).

## 10. 절대 건드리면 안 되는 데이터

students(이름·PIN 4컬럼·class_id·current_unit_id) / word_status / student_progress
(별·XP) / student_daily_progress / xp_ledger / SCA / words / examples의
english_sentence(본문 원문 — **절대 무수정**)·korean_translation / daily_assignments.
학생 식별은 UUID만(이름 금지). Joy(김가윤)·Colin(황성연)은 **최근 반 이동으로
MS Advanced가 최신** — 과거 DB 기록을 근거로 되돌리지 말 것.

## 11~12. 테스트/Build

- `npm run verify:all` → **ALL DOMAINS: PASS**(30 도메인). 개별: examples 138 /
  writing 74 / gamification 24 / integrity 10 / login 8스크립트(42501=정상 계약).
- `npm run build` → PASS. 신규 검증 도구: verify:integrity / verify:writing-coach /
  verify:gamification / scripts/dryRunUnitNaming.mjs / scripts/testExamplePriorityMock.mjs.

## 13. BLOCKED / 14. 운영자 결정 필요

1. **Unit 6 본문 전문**(재붙여넣기) — 40단어 실전 검증의 유일한 입력
2. **Writing 서버 인프라 3옵션** 결정(Edge Function/함수 통합/Pro)
3. writing_coach SQL 실행 4. v2_5→v2_6→v2_7 게임화 SQL 5. unit_naming 실행
6. grammar_points 시드 7. 출판사/학년 이름 확정 8. 빈 Unit 과 번호 확정
9. 황성연 선택 블록 10. 플래그 3종 전체 ON 시점 11. "Unit" 테스트 유닛 처분

## 15~16. 다음 세션 즉시 작업 순서 (+관련 파일)

**P0-1. Unit 6 본문 재분석 실전 검증** — 운영자가 관리자>커리큘럼>예문>
본문 가져오기에서 [**중2 천재 이상기**/Unit 6] 선택 후 본문 전문(영어+한국어 줄)
(정정 2026-08-10: 기존 예문 5행의 실제 FK 실측 결과 천재 이상기 Unit 6
(4fe5a398)이 맞음 — 초판의 "김기택" 기재는 오류)
붙여넣기 → 분석 → 요약 칩(발견/HIGH·MED·LOW/미발견/해석 매칭) 확인 → 승인
저장. 세션은 결과 표(40단어 커버리지) 검증·보고.
파일: `src/components/admin/TextImportPanel.jsx`, `src/utils/curriculum/
{textImport,practiceSentence}.js`. 중복 5행은 자동 차단됨.

**P0-2. Writing Coach 실사용 검증** — 테스트 기기에서 기능 관리 패널 →
`writingCoachEnabled` ON → 학생 계정(권장: Cookie 테스트 계정) →
Dashboard 더보기 → ✍️ Writing → "I go to park yesterday." 입력 → 힌트 2개
→ 수정 반복 → 완료/3회 후 정답 보기 확인.
파일: `src/components/WritingCoach.jsx`, `src/utils/writing/*`.

**P0-3. Game P0 충돌 검증** — (v2_5 실행 승인 시) SQL 실행 → QA/테스트 반
1개만 `gamification_enabled=true` → 테스트 계정으로 Rank/티켓 UI 노출 확인
→ **기존 별/진도 수치가 변하지 않는지**(xp_ledger는 별과 무관 — total_xp는
totalStars 사본일 뿐 Rank XP 아님을 유의) 전후 수치 비교.
파일: `src/components/Dashboard.jsx`(:629 내 기록 더보기), `supabase_v2_5_*.sql`.

이후: targetWords→Writing 연결, writing SQL 실행+저장 배선, unit_naming 실행.

## 17. Rollback 정보

- 코드: 전 커밋 push됨 — `git revert <hash>`(force push 금지).
- v3_30: v3_29 §1 CSV(운영자 보관)+`05_rollback` 상당 절차(handoff 76차).
- v3_31/v3_32: additive — 롤백 불필요(값 초기화 스크립트는 각 패키지 05 참조,
  컬럼 삭제는 훅이 차단하는 저장소 금지 사항).
- 5행 practice 교체: 이전 값 백업 — 스크래치패드 JSON + handoff 87차 로그
  (He came to Korea by invitation. 등 5개 — 필요 시 역PATCH).
- unit_naming/writing SQL: 각 패키지 05_rollback.sql.

## 18. 학생 화면 테스트 시나리오

1. (플래그 ON 기기) 김기택 Unit 6 → 공부하기 → invitation: "📚 교과서 예문
   학습"에 **"at the invitation of the Korean government"** 표시+TTS →
   "📖 본문 보기" → 원문+해석 확인
2. independence: 대표 1개만 나오는지(4건 중 — "the Korean independence
   movement" 예상: 등급/최신 기준)
3. Writing: P0-2 흐름 + 모바일 키보드가 입력창을 가리지 않는지
4. 기존 회귀: 로그인(PIN)→학습→퀴즈→쓰기→별 적립→오늘의 미션 4/4→선물상자
5. 플래그 OFF 기기에서 위 신규 UI가 전혀 안 보이는지(불활성 확인)

## 19. 관리자 화면 테스트 시나리오

1. 본문 가져오기: P0-1 + LOW 등급 배지·"검토 필요" 동작, 해석 미매칭 배지
2. 예문 목록: 단어별 그룹("⭐ 본문 핵심 표현"+등급 배지+"본문 근거 문장 N개
   펼쳐보기"), 수정 폼에서 substring 위반 문장 저장 차단되는지
3. 검수함: 규칙 보충(pending) 항목의 출처/provenance 표시·승인/반려
4. 학생 관리: 검색/토글(테스트·비활성)/비활성화→재활성화/완전삭제 가드
5. 기능 관리 패널: 플래그 토글이 그 기기에만 적용되는지

## 20. Production 안전 규칙 (요약 — 전문은 CLAUDE.md 헌법)

승인 없이 금지: DELETE/대량 UPDATE/학생 삭제·반 이동/current_unit 강제 변경/
기록 삭제/destructive migration/force push. DB 변경 = precheck→backup→
migration(가드)→verify→rollback 파일 준비 후 정지. **api/ 신규 파일 금지**
(함수 12개 한도). 컬럼 삭제 구문은 훅이 차단. 학생 식별 UUID만. 커밋은
기능 단위 소커밋+push는 코드/테스트/문서만(SQL은 불활성 파일).

---

## START PROMPT (새 세션에 붙여넣기)

```
Paul Easy Voca 작업을 이어간다.

먼저 HANDOFF_2026-08-09_PAUL_EASY_VOCA.md 를 읽고,
git log -5 / git status / npm run verify:integrity 로 현재 상태를 확인해라.
CLAUDE.md 헌법(특히 규칙 4/8/9/10/11)과 docs/WRITING_COACH.md·
docs/CURRICULUM_EXAMPLES.md 를 준수한다.

최우선 3가지(P0):

P0-1. 실제 Unit 6 본문 전체를 다시 넣어 40단어 curriculum phrase 자동 추출
실전 검증 — 내가 본문을 붙여넣으면(관리자>커리큘럼>예문>본문 가져오기,
중2 능률 김기택/Unit 6) 분석 결과를 다음 표로 검증·보고:
단어 40 | 본문 발견 | 핵심 chunk 생성 | HIGH | MEDIUM | LOW | 미발견.
전 chunk의 exact_substring=true 확인. 저장은 내가 화면에서 승인한다.

P0-2. Writing Coach Sentence Writing을 테스트 계정 1명에서 실사용 검증 —
writingCoachEnabled를 테스트 기기에서만 ON,
학생 작성→힌트→수정→재검사→완료 흐름과
"I go to park yesterday." 시나리오를 실제 화면으로 확인.
문제 발견 시 원인 분석→수정→테스트(전체 학생 플래그 ON은 금지).

P0-3. Game P0를 테스트 계정에서만 활성화 검증 —
내가 v2_5 SQL 실행을 승인·완료하면(사후검증부터), QA/테스트 반 1개만
gamification_enabled=true로 켜고 Daily Mission/streak/별·진도 수치가
기존 값과 충돌·변형되지 않는지 전후 수치 비교로 검증.
(주의: student_progress.total_xp는 Rank XP가 아니라 totalStars 사본)

절대 규칙: production DELETE/대량 UPDATE/학생·반·기록 변경 금지,
migration은 파일 준비까지만(실행은 내가), api/ 폴더 신규 파일 금지(12개 한도),
새 학생 UI는 feature flag 기본 OFF. BLOCKED가 생기면 기록하고 다른 안전한
작업(HANDOFF §13~15 목록)을 계속해라.
```
