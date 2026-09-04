# Ghost/Legacy 인벤토리 READ-ONLY 감사 (2026-09-04, 야간 QA Track T5 — P10)

**NOTHING IS TO BE DELETED TONIGHT.** 이 문서는 순수 인벤토리·조사
결과이며, 이 세션은 SQL을 작성/실행하지 않았다. 조회는 전부 anon key
GET(+`HEAD`)만 사용했다 — `PATCH`/`POST`/`PUT`/`DELETE`/RPC/Edge Function
호출 없음. `pin_*` 컬럼은 어디에서도 select하지 않았다. 학생 실명은
마스킹(`이***`), UUID는 원본.

**DB WRITE: 0 / SQL EXECUTION: 0**

## 0. 방법

`scripts/studentHealthCheck.mjs --json --all`의 `ghostUnits`(7개, 단어
1개+헤더 잔재 판정 — `scripts/lib/studentHealthRules.mjs` `isGhostUnit`/
`findGhostUnits`)와 `scripts/prodCheck.mjs`의 `GHOST_UNIT_PRESENT`
invariant(같은 7개)를 출발점으로 삼고, 이 세션이 직접 `units`(57행)
전체를 다시 스캔해 **word_count≤1 또는 이름이 `Unit`/`유닛`/`단원`
그대로(번호 없음) 또는 이름이 `/Unit\s*\d+/i` 패턴에 안 맞는** 유닛까지
넓혀 확인했다(총 11개, §1). `textbooks`(10개)/`class_textbooks`(26행)/
`student_class_assignments`(369행)/`units`(57행)/`students`(493행)도
GET으로 전량 조회해 중복 교재·고아 참조·null FK를 직접 계산했다(§2~§6).

## 1. 의심 유닛 인벤토리 (11개, `units` 57개 전량 스캔)

| id | 이름 | 교재 | 단어수 | 사유 | 참조(REAL/TEST/QA/ARCHIVED) | 현재 UI 영향 | 삭제 위험 |
|---|---|---|---|---|---|---|---|
| `5d9db813` | "Unit1" | 중2 천재 이상기 | 1 | ≤1단어(헤더잔재) | 0/0/0/1 | `isLearnableUnit`(<2단어)이 학습유닛 지정 신규 차단, `isSuspiciousUnit`도 True → 셀렉터 비노출(2026-09-02 봉합) | words 1건 cascade(word_status/spelling_review_queue 있으면 함께) |
| `e4804821` | "Unit 1" | 중2 능률 김기택 | **0** | 0단어(빈 유닛, 헤더잔재 아님) | **2**/1/0/5 | 같음. REAL 2명(황***, S***) 전부 **비-primary** | words 0건이라 word 삭제 자체는 없음. SCA/students 참조만 정리 필요 |
| `3d1c753e` | "Unit" | 중2 능률 김기택 | 1 | ≤1단어+번호없는 별칭 | **1**/3/0/1 | 같음 | words 1건 cascade |
| `e327efc3` | "Unit" | 중2 천재 이상기 | 1 | ≤1단어+번호없는 별칭 | **4**/3/0/1 | 같음 | words 1건 cascade |
| `67c8268e` | "Unit 1" | 중2 YMB 박준원 | **0** | 0단어(빈 유닛) | 0/0/0/2 | 같음 | words 0건 |
| `4bc96928` | "Unit" | 중2 YMB 박준원 | 1 | ≤1단어+번호없는 별칭 | 0/1/0/0 | 같음 | words 1건 cascade |
| `35ee95ae` | "Unit" | 중1 동아 윤정미 | 1 | ≤1단어+번호없는 별칭 | 0/0/0/0 | 같음, 참조 0명(완전 고립) | words 1건 cascade |
| `53e380c7` | "Unit" | 고1 능률 민병천 | 1 | ≤1단어+번호없는 별칭 | **3**/0/0/0 | 같음, REAL 3명 중 현***은 **primary** | ⚠️ **word_status 1건 걸림**(현***) — cascade 시 학습기록 소실 |
| `113ee184` | "Unit" | 2학년 천재소영순 | 1 | ≤1단어+번호없는 별칭 | **3**/0/0/0 | 같음 | words 1건 cascade |
| `b16ca5e2` | "7" | 중1 동아 윤정미 | 40 | 이름이 `Unit N` 패턴 아님(숫자만) | **1**/0/0/0 | 정상 학습유닛(40단어, `isLearnableUnit` 통과) — **삭제 후보 아님**, 이름 표기만 비정상 | 삭제 대상 아님 |
| `49999e20` | "7" | 고1 능률 민병천 | 40 | 이름이 `Unit N` 패턴 아님(숫자만) | **2**/0/0/0 | 같음 — 삭제 후보 아님 | 삭제 대상 아님 |

`GHOST_UNIT_PRESENT`(prodCheck invariant)가 잡는 7개
(`5d9db813`/`3d1c753e`/`e327efc3`/`4bc96928`/`35ee95ae`/`53e380c7`/
`113ee184`)는 위 표의 "≤1단어+번호없는 별칭"과 정확히 일치한다 —
`isGhostUnit()`이 "단어가 1개 이상 있고 그 전부가 헤더 라벨"이어야
유령으로 판정하기 때문에, **0단어(`e4804821`/`67c8268e`)는 구조적으로
이 인벤토리에서 빠진다** — 이번 세션이 `units` 57개를 직접 스캔해서야
드러난 카테고리다(신규 관찰). 마지막 2개("7")는 단어가 40개라 실제
학습 콘텐츠가 정상 존재하는 유닛이고, 이름 표기만 관례를 벗어났다 —
삭제 대상이 아니라 **표기 정리(선택)** 대상이다.

### READ-ONLY 검증 쿼리 (각 항목 공통 패턴)

```
# 단어 수 재확인
GET {base}/rest/v1/words?select=id,word,meaning&unit_id=eq.{unit_id}

# 참조 확인(학생 현재유닛)
GET {base}/rest/v1/students?select=id,name&current_unit_id=eq.{unit_id}

# 참조 확인(SCA)
GET {base}/rest/v1/student_class_assignments?select=student_id,is_primary&current_unit_id=eq.{unit_id}

# word_status 잔존 확인(삭제 전 필수 — 걸리면 CASCADE 손실)
GET {base}/rest/v1/word_status?select=student_id,status&word_id=eq.{word_id}
```

### 안전한 정리 경로

- **`53e380c7`(현*** 학습기록 1건 걸림)**: 관리자 UI 유닛 삭제(Edge
  guard)로도 CASCADE는 동일하게 발생한다 — **삭제 전에 반드시 이
  `word_status` 1행을 운영자가 확인**해야 한다(그대로 소실 허용/별도
  백업 후 삭제 중 택1, 이 문서는 판단하지 않는다). 이미
  `supabase_v3_44_ghost_units_delete.sql`이 이 유닛을 정확히 이 이유로
  **HOLD(삭제 제외)** 처리하도록 설계돼 있다(§5 대조 참고) — 이 판단을
  다시 열 필요는 없다, 그대로 유지 권장.
- **나머지 5개(`5d9db813`/`3d1c753e`/`e327efc3`/`4bc96928`/`35ee95ae`)**:
  `supabase_v3_43_ghost_sca_reassign.sql`(SCA/students 참조를 실제 진도
  값으로 재배정) → `supabase_v3_43b_paul_dup_sca_reassign.sql` →
  `supabase_v3_44_ghost_units_delete.sql`(유닛+단어 6개 삭제, HOLD 1개
  제외) 순서로 **이미 준비돼 있다**. 단, `docs/audit/2026-09-03-warn10-readonly-analysis.md`
  §5가 발견한 대로 H***/이*** 두 SCA 행의 목적지 값이 SQL 작성 시점
  이후 stale해졌을 수 있어 **실행 직전 재계산 필요**(운영자 검토 후).
- **`e4804821`/`67c8268e`(0단어, 신규 관찰)**: v3_43/v3_44 계획에
  포함되지 않은 새 카테고리다. 단어가 아예 없어 words/word_status
  cascade 위험 자체가 없다 — 정리 필요 시 SCA/students 참조(REAL 2명
  포함, 전부 비-primary)만 NULL 또는 정상 유닛으로 재배정하면 된다.
  별도 manifest 준비가 필요(**이번 세션은 준비하지 않음**, READ-ONLY
  지시).
- **`b16ca5e2`/`49999e20`("7", 신규 관찰)**: 삭제 대상이 전혀 아니다.
  운영자가 원하면 `units.name`을 "Unit7"류로 표기 정리하는 UPDATE 1건
  (id로 정확히 지정, 단어/참조 무변경)만 필요 — 이것도 이번 세션은
  SQL을 만들지 않았다.

## 2. 중복 교재 검사 — **참 중복 0건**

`textbooks` 10개 전체를 정규화(trim+lowercase) 이름으로 그룹핑했다.
**정규화 이름 기준 중복이 0건**이다 — 전부 서로 다른 이름의 1:1
컨테이너 반 소유 교재다.

| id | 이름 | 소유 컨테이너 반 | 유닛 수 |
|---|---|---|---|
| `59e0a0b7` | 중2 YMB 박준원 | 중2 YMB 박준원 | 8 |
| `86fdd554` | 중2 능률 김기택 | 중2 능률 김기택 | 5 |
| `26310f76` | Presentation 6 -2026 | Presentation 6 -2026 | 4 |
| `faf6dc71` | 중1 동아 윤정미 | 중1 동아 윤정미 | 10 |
| `09c073dd` | 고1 능률 민병천 | 고1 능률 민병천 | 9 |
| `2106b090` | 고1 6월 학평 | 고1 6월 학평 | 8 |
| `80e8d5dd` | 중2 천재 이상기 | 중2 천재 이상기 | 3 |
| `01afd62a` | 중2 동아 윤정미 | 중2 동아 윤정미 | 1 |
| `1ba6ec3d` | 2학년 천재소영순 | 2학년 천재소영순 | 7 |
| `0a87be08` | 중1 천재 이상기 | 중1 천재 이상기 | 2 |

지시에서 언급한 **"두 `천재 이상기` 책"** = `80e8d5dd`(중2)와
`0a87be08`(중1)이다 — 정확히 학년이 다른 별개 교재이고, 두 이름 모두
정규화해도 `중2 천재 이상기` ≠ `중1 천재 이상기`라 애초에 같은
그룹으로 묶이지 않는다. **이 둘은 정당한 별개 교재이며 정리 대상이
아니다** — 지시대로 명시적으로 확인한다. 그 외 "진짜 중복"(예: 소유자만
다른 동일 교재)은 **0건**이다.

## 3. 고아/null FK 인벤토리

| 항목 | 건수 | 상세 |
|---|---|---|
| SCA 행인데 그 `student_id`가 `students`에 아예 없음(진짜 orphan) | **0** | — |
| SCA 행의 학생이 ARCHIVED(존재는 하지만 아카이브) | 172 | 305명 ARCHIVED 학생의 누적 SCA 이력, 정상 아카이브 부산물 |
| SCA 행의 `textbook_id`가 NULL | **74** | 아래 세분화 |
| `units`의 `textbook_id`가 NULL | **0** | — |
| `class_textbooks`가 없는 `textbook_id`를 가리킴 | **0** | — |
| `class_textbooks`가 없는 `class_id`를 가리킴 | **0** | — |

### SCA `textbook_id IS NULL` 74건 세분화

| accountType | 건수 |
|---|---|
| ARCHIVED | 38 |
| TEST | 23 |
| **REAL** | **11** |
| QA_FIXTURE | 2 |

REAL 11건 전부 **비-primary**, `current_unit_id`도 NULL — 즉 "이 반에
소속돼 있지만 아직 교재/유닛을 안 고른" **순수 반-멤버십 행**이다(예:
`Pre-middle school 5학년`/`Pre-Middle School` 소속 SCA 1건씩, v2.9 도입
초기 패턴). `unit_belongs_to_textbook`/`no_orphan_assignment` 등
`evaluateStudent`의 기존 판정에서도 이 11명 전원 통과(§P5 보고서 표
참고, health=PASS) — **위험 없음**, 삭제 필요성도 없다(SCA
`unique(student_id,class_id)` 제약상 재배정 시 자동 갱신됨).

## 4. `class_textbooks` 무결성

26행 전체를 `textbooks`/`classes` id와 대조 — **없는 교재/반을 가리키는
행 0건**. §1의 "primary elsewhere" 2건(§P5 보고서 §4-5)은 FK 무결성
문제가 아니라 "이 반의 기본교재 링크 목록에 학생의 주교재가 없다"는
**표시 목록 완결성** 문제이며, 이 섹션의 스코프(FK 고아) 밖이다.

## 5. "Unit 1" @ 중2 천재 이상기 미스업로드 재확인

지시된 `4fc69e2d…` 재확인: **id `4fc69e2d-5c59-4089-a851-c25b68b6dda4`,
이름 "Unit 1", 교재 `중2 천재 이상기`(`80e8d5dd`), 단어 수 **40개**(현재
라이브 재카운트, GET `words?select=id&unit_id=eq.4fc69e2d-...` 결과) —
지시에 적힌 "40 words, mis-upload" 설명과 정확히 일치한다.**

같은 교재(중2 천재 이상기)의 유닛 3개:

| id | 이름 | 단어수 |
|---|---|---|
| `e327efc3` | Unit | 1(유령, §1) |
| `4fe5a398` | Unit6 | 40 |
| `4fc69e2d` | **Unit 1** | **40**(재확인) |

`4fc69e2d`는 단어 40개로 **정상 콘텐츠 유닛**이라 `isLearnableUnit`/
`isSuspiciousUnit` 어느 것도 걸리지 않는다(학습 가능, UI 정상 노출) —
"mis-upload"라는 지시의 표현은 아마 "이 교재에 원래 있으면 안 되는
잘못 업로드된 유닛"이라는 별도 맥락(운영자 기억)일 수 있으나, 이번
READ-ONLY 재조회로 확인 가능한 사실은 **단어 40개, FK 정상, 참조 관계
정상**이라는 것뿐이다 — "잘못 업로드됐다"는 판단 자체는 콘텐츠(단어
목록이 실제로 이 교재/학년에 맞는지)를 봐야 하는데, 이는 이 감사의
스코프(구조적 무결성) 밖이라 여기서 판정하지 않는다. 참조:
`student_class_assignments`/`students` 어느 쪽도 이 유닛을
`current_unit_id`로 가리키지 않는다(0건) — 즉 이 유닛은 현재 **아무도
학습 중이 아니다**.

## 6. 삭제 위험 요약 (cascade 체인)

`DATABASE.md`/`supabase_v3_1_textbooks.sql`/`supabase_v3_44_*.sql`에서
확인한 FK 방향:

```
textbooks --(on delete SET NULL, 확인됨)--> units.textbook_id
units     --(?)--> words.unit_id
words     --(on delete CASCADE, 확인됨)--> word_status.word_id
words     --(on delete CASCADE, 확인됨)--> spelling_review_queue.word_id
```

`word_status`/`spelling_review_queue`가 `words.id`에 CASCADE 걸린 것은
`DATABASE.md`(178/256/421~442행)에 명시돼 있어 확인됨으로 표시했다.
**`units.textbook_id`(SET NULL, `supabase_v3_1_textbooks.sql:75`)를
제외하면, `words.unit_id → units.id`의 정확한 ON DELETE 동작은 이
저장소에 추적되는 SQL 파일 어디에도 원본 DDL이 없어(v1 스키마 시절,
번호 마이그레이션 체계 이전) 이번 조사로 확정하지 못했다** — 정직하게
"미확인"으로 남긴다(CLAUDE.md 규칙 18). 다만 실무적으로는 이게
문제되지 않는다: `supabase_v3_44_ghost_units_delete.sql`은 **cascade에
의존하지 않고** STEP3에서 `words`를 먼저 명시적으로 DELETE한 뒤 `units`를
DELETE한다(59~64행 순서 그대로) — 즉 유닛 삭제 SQL을 준비할 때는 항상
"단어 먼저, 유닛 나중" 순서로 명시 DELETE하는 것이 이 저장소의 실제
관례이고, 그 위에 STEP1이 `pg_constraint` 카탈로그를 **동적으로 스캔**해
삭제 대상 외 참조가 0건인지 실행 시점에 재확인한다(이미 검증된 안전
장치, 재구현하지 않음). `word_status.word_id`는 CASCADE라 DB 제약
자체는 삭제를 막지 않는다 — 대신 `supabase_v3_44_*.sql` STEP1이
"삭제 대상 단어를 가리키는 `word_status` 행이 0건"임을 **SQL 자체의
사전조건 assert**로 명시 검사해, 0건이 아니면(§1 `53e380c7`처럼)
`raise exception`으로 트랜잭션 전체를 중단시킨다(189~192행) — 그래서
`53e380c7`은 애초에 `_del`이 아니라 `_hold`에 담겨 이 트랜잭션의 삭제
대상에서 빠져 있다. 즉 "CASCADE로 학습기록이 조용히 사라지는" 시나리오는
FK 제약이 아니라 **이 SQL의 설계(사전조건 assert + HOLD 분리)**가
막고 있다는 뜻이다 — 새로 유닛 삭제 SQL을 준비할 때도 이 패턴(삭제 전
`word_status` 잔존 여부를 먼저 확인)을 그대로 따라야 한다.

## 7. 결론

- 유령/의심 유닛: **11개**(그중 7개는 기존 `GHOST_UNIT_PRESENT` baseline,
  2개는 0단어 신규 관찰, 2개는 이름 표기만 비정상인 정상 유닛).
- 중복 교재: **0건**(두 "천재 이상기" 교재는 정당).
- 고아 SCA(학생 자체가 없음): **0건**. `textbook_id` NULL SCA:
  74건(REAL 11건, 전부 비-primary·위험 없음).
- `units.textbook_id` NULL: **0건**. `class_textbooks` 고아 링크: **0건**.
- "Unit 1" @ 중2 천재 이상기(`4fc69e2d`) 재확인: 40단어, 정상 FK, 참조자
  0명(아무도 학습 안 함) — 구조적 문제 없음.
- 6개(HOLD 1개 제외) 유령 유닛의 정리 SQL은 **이미 준비돼 있다**
  (`v3_43`→`v3_43b`→`v3_44`), 실행 전 H***/이*** 목적지 값 재계산만
  필요.

**NOTHING WAS DELETED. NO SQL WAS WRITTEN OR EXECUTED IN THIS SESSION.**

---

DB WRITE: 0 / SQL EXECUTION: 0 / 사용 HTTP 메서드: GET, HEAD (전부 anon key)
