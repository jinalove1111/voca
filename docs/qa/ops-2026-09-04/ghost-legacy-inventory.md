# Ghost/Legacy 인벤토리 REFRESH (2026-09-04 새벽, Track O)

**NOTHING WAS DELETED. DB WRITE: 0. SQL EXECUTION: 0.** 사용한 HTTP
메서드는 `GET`/`HEAD` 뿐이며(전부 anon key), `PATCH`/`POST`/`PUT`/`DELETE`/
RPC/Edge Function 호출은 이 세션 어디에도 없다. `pin_hash`/
`pin_fail_count`/`pin_locked_until`/`pin_setup_allowed`는 어떤 쿼리에서도
select하지 않았다(CLAUDE.md 규칙 11). 학생 실명은 첫 글자만 남기고
마스킹(`이***`), UUID는 원본.

이 문서는 어젯밤 `docs/qa/overnight-2026-09-04/ghost-legacy-inventory.md`
(P10)와 `student-integrity-readonly.md`(P5)를 출발점으로 삼아, 오늘
새벽(PR #14/#10 머지 이후) 라이브 프로덕션 데이터에 대해 다시 조회·재계산한
**REFRESH**다. 두 문서의 결론을 재작성하지 않고, 바뀐 부분만 새로 확인하고
전체 표를 최신 데이터로 다시 채웠다.

## 0. 방법 (재사용, 재구현 없음)

1. `node scripts/studentHealthCheck.mjs --json --require-env --mask-names --all`
   — 학생 493명 전원 로그인→반→교재→유닛→단어→방향 체인 판정.
2. `npm run prod:check -- --require-env --json --report-dir <snapshots>`
   — 크로스 테이블 invariant 전체(오늘 기준 **19종** — 아래 §1 참고) 평가.
3. 위 두 도구가 다루지 않는 행 단위 조인(중복 교재/고아 SCA/legacy
   필드/미참조 유닛/중복 SCA/stale-class SCA/특정 유닛 참조자 조회)은
   `scripts/lib/prodDataLoader.mjs`의 `loadSupabaseEnv`/
   `loadProductionSnapshot`(GET 전용, 기존 로더 재사용)로 `students`(493)/
   `classes`(?)/`textbooks`(10)/`units`(57)/`words`/
   `student_class_assignments`/`class_textbooks` 전량을 한 번에 조회한 뒤,
   `scripts/lib/studentHealthRules.mjs`의 `buildContext`/`classifyAccount`/
   `isGhostUnit`(기존 판정 함수 그대로 재사용)로 이 세션이 직접 계산했다.
   이 계산 스크립트(`refreshInventory.mjs`, `unitNameMismatch.mjs`)는 워크트리
   밖 스크래치패드에만 존재하고 저장소에는 커밋하지 않는다(1회성 조회
   스크립트, 파일 소유권 문제 없음).
4. `word_status` 잔존 여부는 `HEAD` + `Prefer: count=exact`로 행 수만
   확인했다(행 내용은 절대 읽지 않음).

원본 스냅샷: `scratchpad/ops/snapshots/`(커밋 안 함) —
`raw_snapshot_2026-09-04.json`, `computed_2026-09-04.json`,
`studentHealthCheck.json`, `20260904035117-e5lb.prodcheck.json`.

## 1. 어젯밤 대비 변경점

- **PR #14/#10 머지 — 코드만 변경, 데이터는 이 PR들이 직접 건드리지
  않음.** 다만 PR #14(야간 QA 스위트)가 `prod:check`에 **신규 invariant
  `UNIT_CONTENT_DUPLICATE`**(단어 목록 내용 기반 중복 탐지, FK 무관)를
  추가했다 — 이번 실행에서 처음으로 이 코드가 잡힌다(§6). invariant 코드
  총계가 어젯밤 18종 → **오늘 19종**(`UNIT_CONTENT_DUPLICATE` +
  `UNIT_TEXTBOOK_CONTAINER_MISMATCH`/`TEXTBOOK_NAME_DUPLICATE`/
  `TEXTBOOK_UNREACHABLE`/`STUDENT_TEXTBOOK_SELECTOR_EMPTY` 도 P11 트랙에서
  이미 추가돼 있었음 — 오늘 실행 결과 이 4개는 전부 0건).
- **`4fc69e2d`(중2 천재 이상기 "Unit 1", 미스업로드 의심)이 어젯밤 SCA
  refs=0 → 오늘 **SCA refs=1**로 바뀌었다.** REAL 학생 Y***
  (`1c585815-…`)가 2026-09-03 08:26 UTC에 이 유닛을 **비-primary** SCA
  행으로 새로 탐색했다(§7 상세). 그리고 오늘 처음 실행된
  `UNIT_CONTENT_DUPLICATE`가 이 유닛을 **콘텐츠 100% 중복**(중1 천재
  이상기 "Unit 1", `36bba4d0-…`와 완전히 동일한 단어 40개)으로 잡았다 —
  "미스업로드"라는 지시의 표현이 무엇을 뜻했는지 이번에 구조적으로
  확인됐다(§7).
- **`Presentation 6`(사람 반, `1693f32b-…`)의 `class_textbooks` 현재
  상태**: `중1 동아 윤정미`/`중1 천재 이상기` 2개 링크(어젯밤 §4-5 기록과
  동일 개수). `Presentation 6 -2026`(컨테이너 반, `26310f76-…`)은 자기
  교재 + 위 2개까지 총 3개 링크. 이 문서는 어젯밤의 정확한 raw
  `class_textbooks` 스냅샷을 갖고 있지 않아 **행 단위 diff는 못 하지만**,
  현재 상태가 §4-5의 결론("primary elsewhere 2건, 학습 영향 없음")과
  모순되지 않음을 재확인했다.
- **문서화 오류 정정(데이터 변경 아님)**: 어젯밤 §1 표에서 유닛
  `5d9db813`("Unit1")의 교재를 "중2 천재 이상기"로 적었으나, 오늘 직접
  재조회한 결과 실제 교재는 **`중1 동아 윤정미`**(`faf6dc71-…`)다(유닛
  id/단어수/참조는 그대로, 교재 라벨만 다름). 에이전트가 DDL을 실행할 수
  없으므로(CLAUDE.md 규칙 8) 이 사이에 데이터가 바뀌었을 리는 없다 — 어젯밤
  표 작성 시 라벨을 잘못 옮겨 적은 것으로 판단하고 아래 §2에서 정정한다.
- 그 외 baseline(GHOST_UNIT_PRESENT 7 / SCA_GHOST_UNIT 11 /
  PRIMARY_UNIT_MISMATCH 27 / STUDENT_CLASS_IS_CONTAINER 6 /
  CLASS_ASSIGNMENT_CONTRADICTION 1 / UNIT_WORDS_ABNORMAL 5)는 **건수·대상
  전부 어젯밤과 동일**하다 — 밤사이 이 항목들에 변화 없음.

## 2. 유령/의심 유닛 인벤토리 (bare/1-word, 11개 — baseline과 동일 대상, 재확인)

| id | 이름 | 교재 | 단어수 | 참조 SCA(REAL/TEST/ARCHIVED) | 참조 students(REAL/TEST/ARCHIVED) | word_status | UI 영향 | 삭제 위험 | 분류 | 안전한 정리 경로 |
|---|---|---|---|---|---|---|---|---|---|---|
| `5d9db813` | "Unit1" | **중1 동아 윤정미**(정정, §1) | 1 | 0/0/1 | 0/0/1 | 0 | `isLearnableUnit`/`isSuspiciousUnit` 비노출 | words 1건 cascade | LIKELY_CLEANUP | v3_43→v3_44(이미 준비, §5) |
| `e4804821` | "Unit 1" | 중2 능률 김기택 | **0** | 2/0/5 | 0/1/5 | 0 | 같음, REAL 2명 전부 비-primary | words 0건(있어야 삭제할 words 자체가 없음), SCA/students 참조만 정리 | REVIEW | SCA/students 재배정 필요(별도 manifest, 미준비) |
| `3d1c753e` | "Unit" | 중2 능률 김기택 | 1 | 1/3/1 | 0/1/0 | 0 | 같음 | words 1건 cascade | LIKELY_CLEANUP | v3_43→v3_44 |
| `e327efc3` | "Unit" | 중2 천재 이상기 | 1 | 4/3/1 | 0/0/0 | 0 | 같음 | words 1건 cascade | LIKELY_CLEANUP | v3_43→v3_44 |
| `67c8268e` | "Unit 1" | 중2 YMB 박준원 | **0** | 0/0/1 | 0/0/2 | 0 | 같음 | words 0건 | REVIEW | SCA/students 재배정 필요(별도 manifest, 미준비) |
| `4bc96928` | "Unit" | 중2 YMB 박준원 | 1 | 0/1/0 | 0/0/0 | 0 | 같음 | words 1건 cascade | LIKELY_CLEANUP | v3_43→v3_44 |
| `35ee95ae` | "Unit" | 중1 동아 윤정미 | 1 | 0/0/0 | 0/0/0 | **0**(완전 고립, §5 확인) | 같음, 참조 0명 | words 1건 cascade | LIKELY_CLEANUP(최우선, 참조 완전 0) | v3_43→v3_44 |
| `53e380c7` | "Unit" | 고1 능률 민병천 | 1 | 3/0/0 | 0/0/0 | **1**(현***, 기존 baseline) | 같음, REAL 3명 | ⚠️ word_status 1건 걸림 — cascade 시 학습기록 소실 | DANGEROUS_TO_TOUCH(HOLD 유지) | `v3_44`가 이미 HOLD로 삭제 대상에서 제외 — 그대로 유지 |
| `113ee184` | "Unit" | 2학년 천재소영순 | 1 | 3/0/0 | 0/0/0 | 0 | 같음 | words 1건 cascade | LIKELY_CLEANUP | v3_43→v3_44 |
| `b16ca5e2` | "7" | 중1 동아 윤정미 | 40 | 1/0/0 | 0/0/0 | 17 | 정상 학습유닛 — 삭제 후보 아님 | 삭제 대상 아님 | SAFE_TO_IGNORE(표기만 비정상) | 표기 정리(선택, UPDATE 1건) |
| `49999e20` | "7" | 고1 능률 민병천 | 40 | 1/0/0 | 1/0/0 | (미조회, 정상유닛이라 후순위) | 같음 | 삭제 대상 아님 | SAFE_TO_IGNORE(표기만 비정상) | 표기 정리(선택) |

건수는 전부 어젯밤과 동일(재확인, 신규 변화 없음). `5d9db813` 교재
라벨만 §1에서 정정. `word_status` 컬럼은 이번 세션이 `HEAD`로 직접
재확인한 값(해당 유닛의 words id 전체에 대해
`word_status?word_id=in.(...)`).

### READ-ONLY 검증 쿼리 (공통 패턴)

```
GET {base}/rest/v1/words?select=id,word,meaning&unit_id=eq.{unit_id}
GET {base}/rest/v1/students?select=id,name&current_unit_id=eq.{unit_id}
GET {base}/rest/v1/student_class_assignments?select=student_id,is_primary&current_unit_id=eq.{unit_id}
HEAD {base}/rest/v1/word_status?select=student_id&word_id=in.({word_id_list})   (Prefer: count=exact)
```

## 3. 고아 유닛(class/textbook orphan) — **0건**

`units` 57개 전량을 `classes`/`textbooks` id와 대조: `class_id`가
`classes`에 없는 행 **0건**, `textbook_id`가 `textbooks`에 없는 행
**0건**, 둘 다 NULL인 행도 **0건**(전부 정상 FK). 정리 대상 없음.

## 4. 0/1-word 유닛(§2와 중복 포함, 전체 스캔) — **9건**(0단어 2 + 1단어 7)

§2의 11개 중 정상 콘텐츠(`b16ca5e2`/`49999e20`, 40단어)를 제외한 9개와
정확히 일치한다 — 별도 표는 생략하고 §2를 참조.

## 5. 중복 교재(정규화 이름 기준) — **참 중복 0건**(재확인)

`textbooks` 10개 전량 재조회, 정규화(trim+lowercase) 이름 기준 그룹핑 —
**어젯밤과 동일하게 0건**. 오늘 신규 invariant `TEXTBOOK_NAME_DUPLICATE`
(P11)도 라이브 실행 결과 **0건**으로 이를 코드 레벨에서 재확인했다.

**두 "천재 이상기" 교재는 정당한 별개 교재이며 중복이 아니다** — 명시:

| id | 이름 | 소유 반 | 유닛 수 |
|---|---|---|---|
| `80e8d5dd` | 중2 천재 이상기 | 중2 천재 이상기 | 3 |
| `0a87be08` | 중1 천재 이상기 | 중1 천재 이상기 | 2 |

정규화해도 "중2 천재 이상기" ≠ "중1 천재 이상기"라 같은 그룹으로 묶이지
않는다. 학년이 다른 별개 교재 — 정리 대상 아님(SAFE_TO_IGNORE).

## 6. 유닛 콘텐츠 중복(`UNIT_CONTENT_DUPLICATE`, 신규 invariant, 3건)

FK와 무관하게 단어 목록 자체가 겹치는지 보는 새 코드다(오늘 처음 실행).
이 문서가 지시받은 카테고리 목록에는 없었지만, §7의 "미스업로드" 유닛을
구조적으로 설명하는 핵심 신호라 별도 기재한다.

| 유닛 A | 유닛 B | 겹침 | A 참조(SCA/students) | B 참조(SCA/students) | 분류 | 사유 |
|---|---|---|---|---|---|---|
| "Unit 1" @ 중1 천재 이상기(`36bba4d0`) | "Unit 1" @ 중2 천재 이상기(`4fc69e2d`) | 100%(40/40) | REAL 11 SCA / REAL 9 students(주력 학습 유닛) | REAL 1 SCA(비-primary), 0 students | REVIEW | §7 상세 — B가 A의 미스업로드 복제본으로 강하게 의심됨 |
| "Unit3" @ 중2 YMB 박준원(`6ec4b139`) | "Unit3" @ 고1 능률 민병천(`0ca64306`) | 98%(40/41) | REAL 1 SCA | 0 SCA/0 students(§8 참고, word_status 85건 과거 이력) | REVIEW | 학년/교재가 전혀 다른데 거의 동일한 단어 목록 — 우연으로 보기엔 겹침이 과도, 콘텐츠 확인 필요(READ-ONLY 조사) |
| "7" @ 중1 동아 윤정미(`b16ca5e2`) | "Unit 7" @ 중1 동아 윤정미(`18f59bd6`) | 95%(39/40) | REAL 1 SCA | REAL 1 SCA, REAL 2 students(현재 학습 중) | REVIEW | 같은 교재 안에서 이름만 다른 근중복 — 둘 다 실사용 중이라 삭제 위험 있음, 관리자 콘텐츠 확인 우선 |

이 셋 다 **삭제 후보로 판단하지 않는다** — 겹침이 커도 콘텐츠 자체가
실제로 잘못된 것인지(진짜 미스업로드)는 이 감사(구조적 무결성)의 스코프
밖이라 운영자가 단어 목록을 직접 봐야 한다.

## 7. `4fc69e2d`(중2 천재 이상기 "Unit 1") 재확인 — **어젯밤 대비 변경**

- id `4fc69e2d-5c59-4089-a851-c25b68b6dda4`, 교재 `중2 천재 이상기`
  (`80e8d5dd`), 단어 40개(재확인, 변화 없음).
- **SCA 참조: 어젯밤 0건 → 오늘 1건.** REAL 학생 **Y*** (`1c585815-…`)**가
  `Presentation 6` 반 소속으로 이 유닛을 **비-primary** SCA 행(created_at
  2026-09-03T08:26:49Z)으로 새로 탐색했다 — 어젯밤 감사 실행(§P5 재조회)
  직전/직후 시점이다. `students.current_unit_id`는 여전히 이 유닛을
  가리키지 않는다(0건, primary 아님 — 이 학생의 실제 학습에는 영향 없음).
- `word_status`: 0건(아직 아무도 이 유닛의 단어를 실제로 풀지 않음).
- **§6에서 확인된 대로 콘텐츠가 `중1 천재 이상기 "Unit 1"`(`36bba4d0`)과
  단어 40개 100% 동일하다** — `36bba4d0`은 REAL 11 SCA/9 students로
  실제 주력 학습 유닛(어젯밤 §2 표의 "Pre-middle school 5학년" 반 9~10명이
  배정된 바로 그 유닛)이다. 즉 `4fc69e2d`는 **같은 단어 목록이 잘못된
  학년/교재(중2 천재 이상기)에 복제 업로드된 것으로 강하게 의심**된다 —
  "mis-upload"라는 운영자 기억과 정확히 일치하는 구조적 증거.

**분류: REVIEW.** 삭제하지 않는다 — REAL 학생 1명의 SCA 참조가 이미
있어(비-primary이지만 참조는 참조), 삭제 전 SCA 재배정이 필요하다. 안전한
정리 경로: ① 운영자가 단어 목록 확인 후 콘텐츠가 정말 미스업로드임을
확정 → ② `v3_43` 패턴처럼 Y***의 SCA 행을 `36bba4d0`(정상본)으로 재배정
→ ③ `v3_44` 패턴처럼 words 먼저 삭제 후 units 삭제. **이번 세션은 SQL을
준비하지 않는다**(READ-ONLY 지시).

### READ-ONLY 검증 쿼리

```
GET {base}/rest/v1/words?select=id,word,meaning&unit_id=eq.4fc69e2d-5c59-4089-a851-c25b68b6dda4
GET {base}/rest/v1/words?select=id,word,meaning&unit_id=eq.36bba4d0-cb16-4a13-b46d-88be3e0efca7
GET {base}/rest/v1/student_class_assignments?select=student_id,is_primary,created_at&current_unit_id=eq.4fc69e2d-5c59-4089-a851-c25b68b6dda4
```

## 8. 미참조 유닛(0 SCA refs, 0 students, word_status 0) — **1건**(재계산으로 축소)

1차 필터(0 SCA + 0 students refs)로는 5개가 걸렸으나, `word_status`를
**실제로 HEAD 재확인**한 결과 4개는 과거 학습 이력이 있어 제외됐다 —
초기 계산 버그를 이 세션이 자체 검증 과정에서 잡아 정정했다(추측 없이
직접 재확인, CLAUDE.md 규칙 18):

| id | 이름 | 교재 | 단어수 | word_status | 판정 |
|---|---|---|---|---|---|
| `35ee95ae` | "Unit" | 중1 동아 윤정미 | 1 | **0** | 진짜 미참조(§2와 동일 행, 유령+완전고립) |
| `0ca64306` | "Unit3" | 고1 능률 민병천 | 40 | 85 | **제외** — 과거 학습 이력 있음(현재는 아무도 안 가리킴, §6 콘텐츠 중복 상대) |
| `c08775a0` | "Unit4" | 고1 능률 민병천 | 40 | 20 | **제외** — 과거 학습 이력 있음 |
| `993bf82f` | "Unit5" | 고1 능률 민병천 | 40 | 78 | **제외** — 과거 학습 이력 있음 |
| `3a2974cb` | "Unit4" | 중1 동아 윤정미 | 40 | 5 | **제외** — 과거 학습 이력 있음 |

제외된 4개는 "정상 콘텐츠인데 지금은 아무 학생도 현재 진도로 안
가리키는" 상태다 — 학생들이 진도를 나가며 지나친 정상 유닛이지 결함이
아니다(SAFE_TO_IGNORE). 진짜 미참조(SCA 0/students 0/word_status 0)는
`35ee95ae` 1건뿐이며, 이는 §2에 이미 있는 유령 유닛과 동일 행이다(신규
카테고리 아님).

## 9. 고아 SCA(student missing / archived / textbook null)

| 항목 | 건수 | 세부 | 분류 |
|---|---|---|---|
| SCA `student_id`가 `students`에 없음(진짜 orphan) | **0** | — | — |
| SCA 학생이 ARCHIVED(존재는 하지만 아카이브) | 172 | 305명 ARCHIVED 누적 이력(정상 부산물, baseline과 동일) | SAFE_TO_IGNORE |
| SCA `textbook_id` NULL | **74** | ARCHIVED 38 / TEST 23 / **REAL 11**(전부 비-primary) / QA_FIXTURE 2 | SAFE_TO_IGNORE(REAL 11건 위험 없음, baseline과 동일) |
| 그중 "regular"(사람) 반 소속 | **74**(74/74 — container 반 소속 0건) | §10 "legacy shape"와 동일 값 | — |

### READ-ONLY 검증 쿼리

```
GET {base}/rest/v1/student_class_assignments?select=student_id,class_id&textbook_id=is.null
GET {base}/rest/v1/students?select=id,name&id=in.({student_id_list})
```

## 10. Legacy 필드

| 항목 | 건수 | 세부 | 분류 |
|---|---|---|---|
| `students.unit_name`(레거시 문자열) vs `current_unit_id`(FK) 해석 결과 불일치 | **272** | ARCHIVED 180 / TEST 90 / QA_FIXTURE 2 / **REAL 0** — 그중 267건은 "unit_name은 있는데 current_unit_id가 NULL"(FK 마이그레이션 이전 잔재), 나머지 5건은 둘 다 있는데 이름이 다른 경우(전부 비-REAL) | SAFE_TO_IGNORE — REAL 학생 영향 0건, `evaluateInvariants`의 `UNIT_NAME_MISMATCH`(REAL 대상)가 0건인 것과 정확히 일치 |
| SCA `textbook_id` NULL + regular 반 = "legacy shape"(반 멤버십만 있고 교재/유닛 미선택) | **74**(§9와 동일 모집단) | REAL 11건 포함, 전부 비-primary·`current_unit_id` NULL | SAFE_TO_IGNORE — unique(student_id,class_id) 제약상 재배정 시 자동 갱신됨 |

CLAUDE.md 규칙 3이 명시한 대로 `unit_name`(문자열)은 v2.1에서
`current_unit_id`(FK)로 이미 교체된 레거시 필드다 — REAL 학생 0건 영향은
그 교체가 REAL 학생 전원에 대해 완전히 끝났다는 뜻이고, 272건은 전부
FK 마이그레이션 대상이 아니었던(애초에 로그인이 막힌) 비활성 계정의
흔적일 뿐이다.

## 11. 중복 SCA(같은 student_id + 같은 textbook_id가 2개 이상 배정 행에 걸침) — **0건**

`student_class_assignments`의 `(student_id, textbook_id)` 쌍을 전량
그룹핑 — 2개 이상 걸리는 쌍 **0건**. `unique(student_id, class_id)`
제약이 서로 다른 class 아래 같은 textbook_id를 중복 배정하는 것 자체는
막지 않지만, 실측 데이터에는 그런 경우가 없다. 정리 대상 없음.

## 12. Stale-class SCA(배정 행의 class_id ≠ students.class_id, regular 반만) — **7건**

`classes.class_type`이 `textbook`(컨테이너)이 아닌 "사람 반" SCA 행만
대상으로, 그 반이 학생의 **현재** `students.class_id`와 다른 경우를
전량 나열했다.

| student(마스킹) | UUID | SCA class(=배정 당시 반) | 현재 students.class_id 반 | primary? | 생성일 | 분류 | 비고 |
|---|---|---|---|---|---|---|---|
| J*** | `738443f3-…` | Presentation 6 | MS Advanced Class | Y | 2026-08-06 | SAFE_TO_IGNORE | TEST 계정, 다른 SCA 행이 실제 현재 반을 별도로 가리킴 가능성 — 아래 재확인 필요 없음(TEST) |
| Q*** | `9112dd6d-…` | QA_PinAuthTest | QA_SelectPinStatusTest | N | 2026-08-06 | SAFE_TO_IGNORE | QA 픽스처 반끼리의 이동 흔적, 실사용 무관 |
| B*** | `1056c7db-…` | MS Advanced Class | Pre-Middle School | N | 2026-08-08 | SAFE_TO_IGNORE | TEST 계정 |
| 김*** | `4f14c445-…` | Presentation 6 | MS Advanced Class | N | 2026-08-07 | SAFE_TO_IGNORE | ARCHIVED 계정(로그인 자체가 막혀 있음) |
| 황*** | `2a86fc9b-…` | Presentation 6 | MS Advanced Class | **Y** | 2026-08-06 | REVIEW | REAL. 이 학생은 MS Advanced Class용 SCA 행도 **별도로 존재**(§13-a 참고) — `students.current_unit_id`는 정상 해석되어 화면엔 영향 없음(PASS), 하지만 primary=true가 stale한 class_id 위에 남아있는 구조적 불일치 — `PRIMARY_UNIT_MISMATCH`(어젯밤 baseline 27건 중 1건)와 같은 근본 원인 |
| 김*** | `d68a3f24-…` | Presentation 6 | MS Advanced Class | N | 2026-08-06 | SAFE_TO_IGNORE | REAL이지만 비-primary, 별도 정상 SCA 행 존재(§13-a) |
| 김*** | `1d9d3183-…` | Presentation 6 | MS Advanced Class | **Y** | 2026-08-05 | REVIEW(기존 baseline) | REAL. `CLASS_ASSIGNMENT_CONTRADICTION`(어젯밤 §4-3과 동일 인물, **유일하게 현재 반과 일치하는 SCA 행이 아예 없는** 경우) — `students.current_unit_id`는 정상 해석되어 화면 영향 없음 |

**REAL 3건**(황***/김***(d68a3f24)/김***(1d9d3183))은 전부 §2 last-night
`docs/audit/2026-09-03-*.md`가 이미 다룬 `PRIMARY_UNIT_MISMATCH`/
`CLASS_ASSIGNMENT_CONTRADICTION` baseline과 같은 근본 원인의 다른
단면이다 — 새 사고 아님. 그중 황***/김***(d68a3f24)는 실제 현재 반을
가리키는 SCA 행이 **별도로 존재**해 "stale-class"가 이 학생의 유일한
문제가 아니지만, 김***(1d9d3183)는 그 별도 행 자체가 없다(그래서만
`CLASS_ASSIGNMENT_CONTRADICTION`이 뜬다). 셋 다 `students.current_unit_id`
경로로 학습 화면은 정상 해석된다(health PASS/WARN, FAIL 없음).

### READ-ONLY 검증 쿼리

```
GET {base}/rest/v1/student_class_assignments?select=student_id,class_id,is_primary,created_at&class_id=eq.{sca_class_id}
GET {base}/rest/v1/students?select=id,class_id&id=eq.{student_id}
GET {base}/rest/v1/classes?select=id,name,class_type
```

## 13. 요약 카운트

두 갈래로 나눠 센다 — **(A) 개별 식별 항목**(유닛/교재쌍/유닛쌍처럼
분류를 매길 수 있는 하나하나)과 **(B) 집계 카테고리**(ARCHIVED 172건처럼
같은 사유로 묶이는 다수의 SCA/학생 행). 서로 다른 단위라 합산하지 않고
표를 분리한다. 같은 항목이 두 절에서 다른 각도로 다뤄진 경우(예:
`4fc69e2d`는 §6과 §7에 모두 등장, `35ee95ae`는 §2와 §8에 모두 등장)는
**한 번만** 센다.

### (A) 개별 식별 항목 — 총 26개

| 분류 | 개수 | 항목 |
|---|---|---|
| DANGEROUS_TO_TOUCH | **1** | `53e380c7`(§2) |
| LIKELY_CLEANUP | **6** | `5d9db813`/`3d1c753e`/`e327efc3`/`4bc96928`/`35ee95ae`/`113ee184`(§2) |
| REVIEW | **8** | `e4804821`/`67c8268e`(0단어 유닛, §2) · 콘텐츠중복 쌍 3건 — `4fc69e2d`↔`36bba4d0`(§6+§7, 최우선) / `6ec4b139`↔`0ca64306`(§6) / `b16ca5e2`↔`18f59bd6`(§6) · stale-class SCA 중 REAL primary 2건 — 황***(`2a86fc9b`)/김***(`1d9d3183`, §12) |
| SAFE_TO_IGNORE | **11** | 정상표기 유닛 `b16ca5e2`/`49999e20`(§2) · 정당한 별개 교재 "두 천재이상기" 1쌍(§5) · 재계산으로 제외된 과거이력 유닛 4개 — `0ca64306`/`c08775a0`/`993bf82f`/`3a2974cb`(§8) · stale-class SCA 5건 — J***/Q***/B***/김***(`4f14c445`)/김***(`d68a3f24`)(§12) |

### (B) 집계 카테고리(행 단위, 전부 baseline 재확인 — 신규 아님)

| 항목 | 건수 | 분류 |
|---|---|---|
| SCA — student ARCHIVED | 172 | SAFE_TO_IGNORE |
| SCA — textbook_id NULL(전부 regular 반, "legacy shape") | 74(REAL 11 포함) | SAFE_TO_IGNORE |
| `students.unit_name` vs `current_unit_id` 불일치 | 272(REAL 0) | SAFE_TO_IGNORE |
| 중복 SCA(student+textbook) | 0 | — |
| 고아 SCA(student 자체 없음) | 0 | — |
| 고아 유닛(class/textbook FK 깨짐) | 0 | — |
| 중복 교재(정규화 이름 진짜 중복) | 0 | — |

## 14. 결론

- 밤사이 구조 자체(유령 유닛 7개/고아 0건/중복 교재 0건)는 **변화 없음**
  — 재확인 완료.
- 유일한 실질 변화는 `4fc69e2d`가 REAL 학생 1명의 새 비-primary
  탐색으로 참조를 얻은 것과, 오늘 처음 실행된
  `UNIT_CONTENT_DUPLICATE` invariant가 그 유닛을 콘텐츠 100% 중복(정상본:
  `36bba4d0`)으로 구조적으로 뒷받침한 것 — "mis-upload" 의심이 이번
  재확인으로 훨씬 구체화됐다(§7).
- 어젯밤 §1 표의 `5d9db813` 교재 라벨 오류를 정정했다(§1) — 데이터
  변경이 아니라 어젯밤 문서 작성 시점의 표기 실수로 판단.
- **이번 세션은 SQL을 작성하지도 실행하지도 않았다.** 정리가 필요한
  항목(LIKELY_CLEANUP 6건)의 실행 SQL은 이미 `supabase_v3_43_*`/
  `supabase_v3_44_*`로 준비돼 있고(어젯밤 문서와 동일 결론, 재작성
  안 함), `4fc69e2d`는 이번에 새로 REVIEW로 분류됐을 뿐 아직 정리 SQL이
  없다(운영자 콘텐츠 확인 선행 필요).

---

**NOTHING WAS DELETED. DB WRITE: 0 / SQL EXECUTION: 0 / 사용 HTTP
메서드: GET, HEAD (전부 anon key).**
