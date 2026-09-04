# 학생 데이터 무결성 READ-ONLY 감사 (2026-09-04, 야간 QA Track T5 — P5)

이 문서는 프로덕션 Supabase(`azsjthtdjfpnctffjfsk`)를 **anon key로 GET/HEAD만**
사용해 조사한 결과다. 실행한 HTTP 메서드는 `GET`/`HEAD` 뿐이며, `PATCH`/
`POST`/`PUT`/`DELETE`/RPC/Edge Function 호출은 이 세션 어디에도 없다.
`pin_hash`/`pin_fail_count`/`pin_locked_until`/`pin_setup_allowed`는 어떤
쿼리에서도 select하지 않았다(CLAUDE.md 규칙 11). 학생 실명은 첫 글자만
남기고 마스킹했다(`이***` 형식) — UUID는 원본 그대로 남긴다.

**DB WRITE: 0 / SQL EXECUTION: 0**

## 0. 사용한 도구 (재사용, 재구현 없음)

- `node scripts/studentHealthCheck.mjs --json --require-env --mask-names --all`
  — 학생 493명 전원(활성 제한 없음)의 로그인→반→교재→유닛→단어→방향 체인
  판정(`scripts/lib/studentHealthRules.mjs` `evaluateStudent`/`classifyAccount`).
- `node scripts/prodCheck.mjs --require-env --json --report-dir <snapshots>`
  — 크로스 테이블 invariant 18종(`scripts/lib/prodInvariants.mjs`
  `evaluateInvariants`), REAL 학생만 대상.
- `node scripts/prodCheck.mjs --require-env --json --baseline-students <46개 REAL id> --report-dir <snapshots>`
  — `scripts/lib/prodDataLoader.mjs` `loadLearningBaseline()`로
  `word_status`/`student_progress`/`student_daily_progress`/
  `spelling_review_queue`/`xp_ledger`/`entrance_test_results` 6종 테이블의
  학생별 **행 수(HEAD count)** + `student_progress.total_stars`/`updated_at`.
- 위 세 도구가 다루지 않는 것만 이 세션이 직접 GET으로 추가 조회:
  `class_textbooks`(반 기본교재 링크), `xp_totals`(뷰, `student_id,total_xp`),
  `reward_ledger`(읽기 가능 여부 프로브만), `student_class_assignments`
  전체(부교재/이력 나열용, `loadProductionSnapshot()` 재사용).

원본 JSON 스냅샷: `scratchpad/overnight/snapshots/`(커밋 안 함) —
`studentHealthCheck.json`, `prodCheck.json`, `prodcheck/*.baseline.json`,
`raw_snapshot.json`, `xp_totals.json`, `reward_ledger_probe.json`,
`real_student_table.json`, `p10_data.json` 등.

## 1. 분류 요약

`classifyAccount()`(`accountStatus.js` 규칙 + QA 반 이름 보완) 기준, 전체
**493명**을 REAL/TEST/QA_FIXTURE/ARCHIVED로 나눴다.

| 분류 | 인원 | health 상태 분포 |
|---|---|---|
| **REAL** | 46 | PASS 36 / WARN 10 / FAIL 0 |
| TEST | 140 | PASS 3 / WARN 1 / FAIL 136 |
| QA_FIXTURE | 2 | FAIL 2 |
| ARCHIVED | 305 | FAIL 305 (전원) |
| **합계** | **493** | — |

**ARCHIVED 305명 FAIL 100%는 버그가 아니라 설계다.** 이름에 `_dup`/
`_inactive` 접미사가 붙은 레거시 중복/비활성 계정으로, 그 이름 자체의
`_`(언더스코어)가 서버(`api/verify-student-pin.js`)의 ILIKE 쿼리에서
메타문자로 잡혀 `LOGIN_FAIL:ilike메타문자`가 구조적으로 뜬다 — 즉 "로그인
자체가 안 되게 이름으로 잠가둔" 의도된 아카이브 메커니즘이고,
`studentHealthCheck.mjs`가 그 상태를 정확히 보고하고 있는 것이다. TEST/
QA_FIXTURE 142명도 대부분 같은 이유(`qa_` 접두, 또는 동명 중복 다수)로
FAIL이 뜬다. **이 447명(ARCHIVED 305+TEST 140+QA_FIXTURE 2)의 FAIL은 이번 감사의
관심 대상이 아니다** — 아래 §2부터는 실사용 중인 **REAL 46명**에 집중한다.

## 2. REAL 46명 전수 테이블

컬럼: 주교재=SCA `is_primary=true`의 `textbook_id`, 부교재=나머지 SCA
`textbook_id`, 현재유닛=`students.current_unit_id`(+단어수), 유닛교재=그
유닛이 실제로 속한 교재, 주교재소속=현재유닛이 주교재 소속인가,
word_status=그 학생의 `word_status` 행 수(HEAD count), progress존재=
`student_progress` 행 존재 여부, ★=`total_stars`, XP=`xp_totals` 뷰
합계(뷰에 행이 없으면 0), health=`studentHealthCheck` 판정.

반 유형 `textbook`(교재 컨테이너 반)에 소속된 6명은 §4-2 참고.

| 학생(마스킹) | UUID | 반 | 반유형 | 주교재 | 부교재 | 현재유닛 | 유닛교재 | 주교재소속 | word_status | progress존재 | ★ | 최근업데이트 | XP | health |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 권*** | `6548dd2a-cc01-4b4f-80d9-746d55bf5014` | MS Advanced Class | regular | 고1 6월 학평 | 고1 능률 민병천 | Unit10(50단어) | 고1 6월 학평 | Y | 69 | Y | 1039 | 2026-08-12 | 22 | WARN |
| 김*** | `83ebbdb8-efeb-4890-98fe-e300f872d734` | MS Advanced Class | regular | 고1 능률 민병천 | 고1 6월 학평 | Unit8(40단어) | 고1 능률 민병천 | Y | 77 | Y | 491 | 2026-09-01 | 28 | PASS |
| 김*** | `7592fa07-04a0-4597-89ac-31eae0c01299` | MS Advanced Class | regular | 중2 능률 김기택 | 고1 능률 민병천 | Unit 6(40단어) | 중2 능률 김기택 | Y | 2 | Y | 828 | 2026-08-25 | 6 | PASS |
| 김*** | `1d9d3183-f344-4dbb-8792-d067917cb7b0` | MS Advanced Class | regular | 고1 능률 민병천 | - | Unit8(40단어) | 고1 능률 민병천 | Y | 34 | Y | 429 | 2026-09-01 | 10 | PASS |
| 김*** | `d68a3f24-1e9c-42d9-a1ba-0ce9389f79d6` | MS Advanced Class | regular | 고1 6월 학평 | 고1 능률 민병천 | Unit 1(26단어) | 고1 6월 학평 | Y | 7 | Y | 280 | 2026-07-14 | 0 | PASS |
| 박*** | `e92ab261-f4cb-422b-850a-3e5e4921df55` | MS Advanced Class | regular | 고1 능률 민병천 | 고1 6월 학평 | Unit8(40단어) | 고1 능률 민병천 | Y | 5 | Y | 552 | 2026-09-01 | 50 | PASS |
| 박*** | `a4666b79-cf9f-4525-94f5-bf6e040bf689` | MS Advanced Class | regular | 고1 능률 민병천 | 중2 YMB 박준원 | Unit6(40단어) | 고1 능률 민병천 | Y | 11 | Y | 22 | 2026-08-25 | 0 | PASS |
| 전*** | `16fa6e1c-d5c3-40b4-b55a-b1c18e67e551` | MS Advanced Class | regular | 고1 능률 민병천 | 고1 6월 학평 | Unit8(40단어) | 고1 능률 민병천 | Y | 39 | Y | 214 | 2026-09-01 | 10 | PASS |
| 현*** | `e32b8d7d-ef76-4292-ba46-059fb7b9719e` | MS Advanced Class | regular | 고1 능률 민병천 | 고1 6월 학평, 중2 능률 김기택 | Unit1(40단어) | 고1 능률 민병천 | Y | 95 | Y | 295 | 2026-09-01 | 6 | WARN |
| 황*** | `d05dea68-f019-4202-b494-6a917158ccd4` | MS Advanced Class | regular | 고1 능률 민병천 | 고1 6월 학평 | 7(40단어) | 고1 능률 민병천 | Y | 2 | Y | 131 | 2026-08-26 | 12 | WARN |
| 황*** | `2a86fc9b-510a-4db1-a18d-598a360e142b` | MS Advanced Class | regular | 고1 능률 민병천 | 중2 능률 김기택, 고1 6월 학평 | Unit6(40단어) | 고1 능률 민병천 | Y | 25 | Y | 530 | 2026-08-25 | 8 | PASS |
| N*** | `6148ad1b-48a4-417f-a5fa-0e7efb343397` | MS Advanced Class | regular | 고1 능률 민병천 | 고1 6월 학평 | Unit8(40단어) | 고1 능률 민병천 | Y | 352 | Y | 587 | 2026-09-01 | 14 | PASS |
| 문*** | `9f115c32-6a4b-4659-a026-f9905a5cc2e2` | Pre-Middle School | regular | 2학년 천재소영순 | 중2 YMB 박준원, 중2 천재 이상기 | Unit6(40단어) | 2학년 천재소영순 | Y | 5 | Y | 1955 | 2026-09-03 | 80 | WARN |
| 박*** | `2c6845fc-b30e-4e4d-b260-d13c13fe7b9a` | Pre-Middle School | regular | 중1 동아 윤정미 | 2학년 천재소영순 | Unit6(40단어) | 중1 동아 윤정미 | Y | 6 | Y | 2 | 2026-09-03 | 8 | PASS |
| 박*** | `ab5be7a4-ddac-4b0a-b20b-bbc1cf0a4441` | Pre-Middle School | regular | 중1 동아 윤정미 | - | Unit6(40단어) | 중1 동아 윤정미 | Y | 76 | Y | 0 | 2026-09-03 | 4 | PASS |
| 신*** | `a31037a3-c5c8-4bda-bed8-713188642160` | Pre-Middle School | regular | 2학년 천재소영순 | 중2 YMB 박준원 | Unit5(40단어) | 2학년 천재소영순 | Y | 63 | Y | 91 | 2026-09-02 | 12 | PASS |
| 이*** | `80700290-7fda-4bfa-aa9f-79ada1133b2f` | Pre-Middle School | regular | 2학년 천재소영순 | 중2 YMB 박준원, 고1 6월 학평 | Unit5(40단어) | 2학년 천재소영순 | Y | 64 | Y | 172 | 2026-09-02 | 24 | PASS |
| 이*** | `c554cad5-078c-4d43-ab29-e5dcc04a3e84` | Pre-Middle School | regular | 2학년 천재소영순 | 중2 YMB 박준원 | Unit5(40단어) | 2학년 천재소영순 | Y | 70 | Y | 71 | 2026-09-02 | 12 | WARN |
| D*** | `58174565-90b1-4b7e-8dc4-61eb2fbb118a` | Pre-Middle School | regular | 2학년 천재소영순 | 중2 천재 이상기, 중2 능률 김기택 | Unit5(40단어) | 2학년 천재소영순 | Y | 86 | Y | 784 | 2026-09-02 | 28 | WARN |
| H*** | `77cc6550-6fe2-4549-a23e-7eba510e891b` | Pre-Middle School | regular | 2학년 천재소영순 | 중2 YMB 박준원, 중2 능률 김기택 | Unit5(40단어) | 2학년 천재소영순 | Y | 0 | Y | 41 | 2026-09-02 | 2 | WARN |
| J*** | `0446069e-eae0-4042-8bd1-d1907d5496d7` | Pre-Middle School | regular | 2학년 천재소영순 | 중2 천재 이상기, 중2 능률 김기택, 중2 YMB 박준원 | Unit5(40단어) | 2학년 천재소영순 | Y | 165 | Y | 795 | 2026-09-02 | 52 | WARN |
| L*** | `48a8c230-e2c1-4814-82dd-f8bc4d0e3658` | Pre-Middle School | regular | 2학년 천재소영순 | 중2 YMB 박준원 | Unit2(40단어) | 2학년 천재소영순 | Y | 0 | Y | 25 | 2026-08-26 | 8 | WARN |
| S*** | `4f3e0b72-2452-4780-92bf-32eeceff9c90` | Pre-Middle School | regular | 2학년 천재소영순 | 중2 YMB 박준원, 중2 천재 이상기, 중2 능률 김기택, 중1 동아 윤정미 | Unit6(40단어) | 2학년 천재소영순 | Y | 222 | Y | 552 | 2026-09-03 | 18 | WARN |
| A*** | `74b7d7ca-eb65-4739-87c8-1ae44dd5f499` | Pre-middle school 5학년 | regular | 중1 천재 이상기 | - | Unit 1(40단어) | 중1 천재 이상기 | Y | 0 | N | - | - | 0 | PASS |
| E*** | `04e75b28-3a2a-4d94-a326-76476b7573cf` | Pre-middle school 5학년 | regular | 중1 천재 이상기 | - | Unit 1(40단어) | 중1 천재 이상기 | Y | 0 | N | - | - | 0 | PASS |
| J*** | `17c1e204-9785-4f85-a894-8ff0936c6f14` | Pre-middle school 5학년 | regular | 중1 천재 이상기 | - | Unit 1(40단어) | 중1 천재 이상기 | Y | 0 | N | - | - | 0 | PASS |
| K*** | `e0fe0f50-8927-44d9-9331-e454620524d9` | Pre-middle school 5학년 | regular | 중1 천재 이상기 | - | Unit 1(40단어) | 중1 천재 이상기 | Y | 9 | Y | 1 | 2026-09-03 | 0 | PASS |
| K*** | `6fb47ae6-8b20-4e64-a1d9-b0925e3912c6` | Pre-middle school 5학년 | regular | 중1 천재 이상기 | - | Unit 1(40단어) | 중1 천재 이상기 | Y | 0 | N | - | - | 0 | PASS |
| L*** | `6d0e7d10-6bc1-4a36-9833-57049db2bf42` | Pre-middle school 5학년 | regular | 중1 천재 이상기 | - | Unit 1(40단어) | 중1 천재 이상기 | Y | 0 | N | - | - | 0 | PASS |
| L*** | `17eafbbe-f3c5-4e24-9b8d-66bdc945c091` | Pre-middle school 5학년 | regular | 중1 천재 이상기 | - | Unit 1(40단어) | 중1 천재 이상기 | Y | 0 | N | - | - | 0 | PASS |
| M*** | `3cff7b25-02cd-45a0-8488-a7b84a6d8a58` | Pre-middle school 5학년 | regular | 중1 천재 이상기 | - | Unit 1(40단어) | 중1 천재 이상기 | Y | 0 | N | - | - | 0 | PASS |
| N*** | `394b0053-14a1-4853-a491-3a1458efdedc` | Pre-middle school 5학년 | regular | 중1 천재 이상기 | - | Unit 1(40단어) | 중1 천재 이상기 | Y | 0 | N | - | - | 0 | PASS |
| 김*** | `6ac975c7-91fa-4ae9-946a-c0a7951783ac` | Presentation 6 | regular | 중1 동아 윤정미 | Presentation 6 -2026 | Unit 7(40단어) | 중1 동아 윤정미 | Y | 4 | Y | 647 | 2026-09-01 | 86 | PASS |
| 백*** | `42e04cbf-69bc-4e3b-9188-8204a5ca3212` | Presentation 6 | regular | 중1 동아 윤정미 | 2학년 천재소영순, Presentation 6 -2026 | Unit 8(40단어) | 중1 동아 윤정미 | Y | 1 | Y | 1680 | 2026-09-03 | 180 | PASS |
| A*** | `49e9cf6f-ba27-4f9a-bf5c-17059e88062a` | Presentation 6 | regular | 2학년 천재소영순 | Presentation 6 -2026, 중1 동아 윤정미 | Unit1(40단어) | 2학년 천재소영순 | Y | 44 | Y | 630 | 2026-09-03 | 52 | PASS |
| A*** | `8a109c98-4950-411c-9617-7d6b4175c267` | Presentation 6 | regular | 중1 동아 윤정미 | Presentation 6 -2026 | Unit 8(40단어) | 중1 동아 윤정미 | Y | 18 | Y | 215 | 2026-09-01 | 58 | PASS |
| C*** | `bf05032a-8210-4082-8584-7e1afdcc02e2` | Presentation 6 | regular | 중1 천재 이상기 | Presentation 6 -2026, 2학년 천재소영순, 중1 동아 윤정미 | Unit2(40단어) | 중1 천재 이상기 | Y | 2 | Y | 981 | 2026-09-03 | 50 | PASS |
| I*** | `d4bd8d3d-afda-47ad-9e5e-a12c8376c892` | Presentation 6 | regular | 중1 동아 윤정미 | Presentation 6 -2026, 2학년 천재소영순 | Unit 7(40단어) | 중1 동아 윤정미 | Y | 26 | Y | 1679 | 2026-09-03 | 92 | PASS |
| l*** | `dcd46868-31f7-4953-9380-fb4ea47095c8` | Presentation 6 | regular | 중1 동아 윤정미 | 2학년 천재소영순, Presentation 6 -2026 | Unit 8(40단어) | 중1 동아 윤정미 | Y | 36 | Y | 1767 | 2026-09-03 | 112 | PASS |
| Y*** | `1c585815-98c8-461e-81fc-0187ffdcfa1c` | Presentation 6 | regular | 중1 천재 이상기 | 중1 동아 윤정미, 중2 천재 이상기, Presentation 6 -2026, 2학년 천재소영순 | Unit2(40단어) | 중1 천재 이상기 | Y | 4 | Y | 1615 | 2026-09-03 | 100 | PASS |
| 박*** | `6f249f86-c2ae-4e0a-b366-ba0c64197422` | Presentation 6 -2026 | **textbook** | Presentation 6 -2026 | - | Unit 1(40단어) | Presentation 6 -2026 | Y | 0 | Y | 6 | 2026-07-08 | 0 | PASS |
| 백*** | `fdfb270a-4059-4b9d-ac54-69ab3fe98c94` | Presentation 6 -2026 | **textbook** | Presentation 6 -2026 | - | Unit 1(40단어) | Presentation 6 -2026 | Y | 5 | Y | 140 | 2026-07-23 | 0 | PASS |
| 이*** | `2ba65aaf-13f3-4ddb-bac3-ebf5382a7dbd` | Presentation 6 -2026 | **textbook** | Presentation 6 -2026 | - | Unit 1(40단어) | Presentation 6 -2026 | Y | 0 | Y | 837 | 2026-07-11 | 0 | PASS |
| 임*** | `e22f2367-6fd8-4473-897c-2ce8eda9dab6` | Presentation 6 -2026 | **textbook** | Presentation 6 -2026 | - | Unit8(40단어) | Presentation 6 -2026 | Y | 7 | Y | 352 | 2026-07-14 | 0 | PASS |
| O*** | `d4266dca-064d-47d2-b497-24615f9515e1` | Presentation 6 -2026 | **textbook** | Presentation 6 -2026 | - | Unit8(40단어) | Presentation 6 -2026 | Y | 0 | Y | 598 | 2026-07-15 | 0 | PASS |
| U*** | `53dbdd52-8136-484e-971a-fa6c7e3e58a8` | Presentation 6 -2026 | **textbook** | Presentation 6 -2026 | - | Unit 1(40단어) | Presentation 6 -2026 | Y | 0 | N | - | - | 0 | PASS |

`reward_ledger`는 **읽을 수 없다** — anon GET에 `401 {"code":"42501",
"message":"permission denied for table reward_ledger"}`가 그대로 확인됐다
(RLS가 anon SELECT를 회수한 상태, `DATABASE.md` 기존 기록과 일치). 이
테이블은 위 표 어디에도 포함하지 못했다.

## 3. 요청된 자동 탐지 — 결과

REAL 46명 전원을 대상으로 아래 조건을 코드로 검사했다(`buildContext`/
`evaluateInvariants`의 join 결과 재사용 + 이 세션의 추가 join).

| 탐지 항목 | 건수 | 대상(마스킹 이름 `UUID`) |
|---|---|---|
| 현재유닛이 주교재가 아닌 다른 교재 소속 | **0** | — |
| 주교재(primary SCA) 없음 | **0** | — |
| 주교재 2개 이상(≥2 primary) | **0** | — |
| REAL 비아카이브 학생의 `current_unit_id` NULL | **0** | — |
| SCA가 유령 유닛을 가리킴(`SCA_GHOST_UNIT`) | **10명(행 11개)** | 아래 §4-1 |
| 0단어 유닛이 참조됨 | **1명**(비-primary) | S*** `4f3e0b72-…`(§4-4) |
| `class_textbooks`에 이 반의 링크 자체가 없음(missing) | **0** | — |
| 반의 `class_textbooks` 링크는 있으나 주교재가 그 목록 밖(primary elsewhere) | **2** | A*** `49e9cf6f-…`(Presentation 6 반, 링크=중1동아/중1천재, 주교재=2학년천재소영순) / 김*** `7592fa07-…`(MS Advanced Class 반, 링크=고1학평/고1능률, 주교재=중2능률김기택) |
| `students.unit_name` 문자열이 `units.name`과 불일치 | **0** | — |
| 반이 바뀌었는데 SCA 이력과 모순(`CLASS_ASSIGNMENT_CONTRADICTION`) | **1** | 김*** `1d9d3183-…`(§4-3) |

위 표에서 0건인 항목(주교재 부재/중복, current_unit_id NULL, unit_name
불일치)은 `evaluateInvariants()`의 `NO_PRIMARY`/`MULTIPLE_PRIMARY`/
`UNIT_NAME_MISMATCH` invariant가 REAL 46명 전원에 대해 실제로 계산한
결과이지, 검사를 안 해서 0인 게 아니다(`prodCheck.json`
`invariants.summary`에 해당 코드가 `byCode`에 아예 등장하지 않음 = 0건).

## 4. 상세 — REAL 학생 관련 신규/기존 발견

### 4-1. `SCA_GHOST_UNIT` 10명 — **기존 baseline, 새 발견 아님**

`docs/audit/2026-09-03-warn10-readonly-analysis.md`(Track 3)가 이 10명
(D***/권***/황***/현***/H***/S***/L***/문***/J***/이*** — §2 표의 10행)을 학생별
SCA 이력 전체·`word_status`·`v3_43`/`v3_44` 대조까지 이미 상세 분석했다.
이번 세션 재조회 결과 **건수·대상 학생이 그 문서와 완전히 동일**하다
(10명, H***만 SCA 2행이라 findings 11건) — 데이터가 그 사이 바뀌지
않았다는 뜻이다. 상세는 그 문서를 참고하고 여기서는 재작성하지 않는다.
유일한 예외(**"즉시 수정 필요 아님, 정보성"**): 현***의 유령 유닛
`53e380c7`에 실제 `word_status` 1건이 걸려 있는 상태도 그대로다
(§1의 "정보성" 항목과 동일, `supabase_v3_44_ghost_units_delete.sql`이
이 유닛만 HOLD로 삭제 보류 중인 것과 일치).

### 4-2. `STUDENT_CLASS_IS_CONTAINER` 6명 — **기존 baseline, 새 발견 아님**

`docs/audit/2026-09-03-primary-mismatch-readonly-analysis.md` §3이 이
6명(U***/백***/박***/이***/임***/O*** — §2 표 맨 아래 6행과 동일 인물)을
이미 코드 근거(`StudentSelect.jsx`/`wordLibrary.js`
`classifyRealClassNames`)까지 확인했다: 로그인은 안 막히지만 PIN
자가설정 화면의 반 선택 목록에서 구조적으로 제외된다. 이번 재조회로
**6명·상태 동일**함을 확인했다(신규 발견 없음).

### 4-3. `CLASS_ASSIGNMENT_CONTRADICTION` 1명 — **기존 baseline(정정 이력 있음), 새 발견 아님**

`handoff.md`에 "`CLASS_ASSIGNMENT_CONTRADICTION`은 `class_type='textbook'`
컨테이너 반 제외로 오탐 19→1로 정정"이라는 기록이 이미 있다 — 그 잔여
1건이 바로 이 학생(김***, `1d9d3183-…`)이다. 실측: `students.class_id`는
"MS Advanced Class"(사람 반)인데, 이 학생의 유일한 "사람 반" SCA 행
(2026-08-05 생성, 1건뿐)은 "Presentation 6"을 가리킨다 — 반면
`students.current_unit_id`(Unit8, 고1 능률 민병천)는 primary SCA(고1
능률 민병천, textbook_id 기준)로 정상 해석되고 있다(§2 표에서 이 학생의
`health=PASS`, "주교재소속=Y"). 즉 **화면에 실제로 뜨는 유닛/교재에는
영향이 없고**, 사람 반 축의 SCA 이력만 stale하다 — 반 이동(Presentation
6 → MS Advanced Class) 후 사람 반 SCA 행이 새로 생기지 않고 남아있는
것으로 보인다(추정, 확정 아님).

### 4-4. 0단어 유닛 참조 1건 — **이번 세션 신규 관찰**(단, 위험도 낮음)

`UNIT_WORDS_ABNORMAL` invariant(전체 5건, REAL/전체 공통 유닛 단위라
학생 귀속 아님)에는 단어 0개인 유닛 2개가 포함돼 있다
(`e4804821-…`="Unit 1"@중2능률김기택, `67c8268e-…`="Unit 1"@중2YMB박준원).
이 중 `e4804821`을 REAL 학생 1명(S***, `4f3e0b72-…`)이 **비-primary**
SCA 행(2026-07-20 생성, 가장 오래된 이력)으로 참조한다 — S***의 현재
학습(primary, 2학년천재소영순 Unit6)과는 무관한 죽은 탐색 흔적이다(같은
학생의 다른 유령 참조가 §4-1 WARN10 문서에 이미 나오는 것과 같은
"여러 교재를 순차 탐색한 흔적" 패턴). **`GHOST_UNIT_PRESENT`(단어 1개,
헤더 잔재) 인벤토리 7개와는 다른 카테고리**다 — 이 유닛은 단어가
**0개**(한 번도 업로드되지 않은 빈 유닛)라 `isGhostUnit()`의 "헤더 라벨
전량 일치" 조건 자체가 성립하지 않아 유령으로 분류되지 않는다. 위험도는
낮음(비-primary, `word_status` 0건, 현재 화면에 영향 없음)이나 이번
감사에서 처음 명시적으로 나열한다.

### 4-5. `class_textbooks` primary-elsewhere 2건 — **이번 세션 신규 관찰**(설계상 저위험)

`CLASS_TEXTBOOK_MODEL.md` §2에 따르면 `class_textbooks`는 "학생 화면의
교재 선택기 노출 목록" 용도이며 **입실시험/단어 로딩 판정에는 쓰이지
않는다**(그건 SCA가 authoritative). A***(`49e9cf6f-…`)와
김***(`7592fa07-…`) 둘 다 실제 학습 중인 유닛/교재는 정상 해석되고
있다(§2 표 "주교재소속=Y", health=PASS) — 유일한 실제 영향은 이 두 반의
교재 선택기 드롭다운에 학생의 주교재가 옵션으로 안 뜰 수 있다는 것
(관리자가 반에 그 교재를 `class_textbooks`로 추가로 연결하지 않은
경우). 데이터 손실/오학습 위험은 없다.

## 5. 반이 바뀌면서 옛 교재 SCA 행을 잃은 사례 (best-effort)

SCA `created_at`과 `students.class_id`를 비교했다. §4-1의 WARN10
문서·§4-3이 이미 다룬 "여러 교재를 순차 탐색"(D***/H***/S***/J***/
문*** 등, non-primary SCA 이력이 3~6행)은 전부 **SCA 행 자체가
남아있는 채로** primary만 최신으로 갱신된 정상 진행 이력이지 "잃어버린"
사례가 아니다 — SCA는 `unique(student_id, class_id)`라 반을 다시 골라도
같은 class_id 행은 갱신될 뿐 삭제되지 않는다(`DATABASE.md`
`student_class_assignments` 섹션). 이번 조사에서 "행 자체가 사라진"
사례는 찾지 못했다(구조적으로 SCA UPSERT가 DELETE를 쓰지 않는 한
일어나기 어렵다) — 유일하게 "반 축"이 모순인 사례가 §4-3의 1건이며,
그 경우도 SCA 행이 사라진 게 아니라 "새 반의 SCA 행이 아직 생성되지
않은" 상태다.

## 6. prod:check invariant 교차검증 (18종 전체 대조)

`scripts/lib/prodInvariants.mjs` `INVARIANT_CODES` 18개 전부를 이번 라이브
실행(`prodCheck.json`)과 대조했다.

| invariant | 건수(FAIL/WARN) | 판정 |
|---|---|---|
| `STUDENT_UNIT_ORPHAN` | 0 | — |
| `SCA_UNIT_ORPHAN` | 0 | — |
| `STUDENT_GHOST_UNIT` | 0 | — |
| `SCA_GHOST_UNIT` | 11(WARN) | 기존 baseline(§4-1) |
| `UNIT_NAME_MISMATCH` | 0 | — |
| `PRIMARY_UNIT_MISMATCH` | 27(WARN) | 기존 baseline(`docs/audit/2026-09-03-primary-mismatch-readonly-analysis.md`, 실사용 영향 0 확인됨) |
| `PRIMARY_TEXTBOOK_MISMATCH` | 0 | — |
| `UNIT_WORDS_ABNORMAL` | 5(WARN) | 유닛 단위 인벤토리, §4-4에 REAL 참조 1건 명시 |
| `GHOST_UNIT_PRESENT` | 7(WARN) | P10 보고서(`ghost-legacy-inventory.md`) 참고 |
| `STUDENT_TEXTBOOK_MISMATCH` | 0 | — |
| `SCA_TEXTBOOK_ORPHAN` | 0 | — |
| `SCA_UNIT_TEXTBOOK_MISMATCH` | 0 | — |
| `MULTIPLE_PRIMARY` | 0 | — |
| `NO_PRIMARY` | 0 | — |
| `UNIT_TEXTBOOK_ORPHAN` | 0 | — |
| `UNIT_NAME_ABNORMAL` | 0 | (7개 유령 유닛은 `GHOST_UNIT_PRESENT`가 먼저 잡아 여기선 중복 제외됨 — 코드 자체 설계, `prodInvariants.mjs` 432행 주석) |
| `CLASS_ASSIGNMENT_CONTRADICTION` | 1(WARN) | 기존 baseline(§4-3, handoff.md "오탐 19→1 정정" 기록) |
| `STUDENT_CLASS_IS_CONTAINER` | 6(WARN) | 기존 baseline(§4-2) |

`health.summary`(REAL 46명, `studentHealthRules.evaluateStudent`) =
PASS 36 / WARN 10 / FAIL 0 — WARN 10명은 전부 §4-1의
`ASSIGNMENT_GHOST_UNIT` 코드(같은 10명, 같은 근본 원인의 두 표현).
**REAL 46명 중 FAIL 0명, invariant FAIL 0건** — 실사용 학생 화면에
영향을 주는 미해석 체인은 이번 조사에서 발견되지 않았다.

## 7. BLOCKED_FOR_OPERATOR / 후속 필요

이번 세션에서 새로 발견한 §4-4(0단어 유닛 참조 1건)와 §4-5
(class_textbooks primary-elsewhere 2건)는 운영자 결정 대상이지만 둘 다
저위험(비-primary 또는 선택기 노출 문제)이라 긴급 조치가 필요하지
않다고 판단한다. §4-1/4-2/4-3은 이미 별도 문서에 상세 분석·SQL 준비가
되어 있으므로 이 문서에서 다시 판단을 내리지 않는다.

---

DB WRITE: 0 / SQL EXECUTION: 0 / 사용 HTTP 메서드: GET, HEAD (전부 anon key)
