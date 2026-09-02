# WARN 10건 READ-ONLY 분류 — `health:students` ASSIGNMENT_GHOST_UNIT (2026-09-03)

야간 자율 작업 Track 3. `npm run health:students`가 보고하는 WARN 10건(전부
`ASSIGNMENT_GHOST_UNIT`)을 대상으로, `.env`의 anon key로 PostgREST GET만
사용해 학생별 실측 데이터를 수집하고 분류했다. **쓰기 0건, SQL 실행 0건**
— 이 문서는 순수 조사 결과이며, 조치는 운영자가 별도로 실행한다.

## 요약

- **즉시 수정 필요**: 0건 (전부 `student_class_assignments`/`students`의
  FK 참조 문제이며, 서버가 이미 크래시 없이 폴백 중 — `health:students`
  WARN은 "장애"가 아니라 "정리 대상 데이터"를 알리는 신호)
- **운영자 결정 필요**: 10건 전부 — 이미 준비된 `supabase_v3_43_*.sql`이
  10건 전부를 다루지만, 아래 "v3_43 대조" 절에서 발견한 대로 **2건(Harry,
  이윤제)은 SQL 작성 시점 이후 학생이 실제로 더 진도를 나가서 SQL에 박제된
  목적지 값이 지금은 stale하다** — 그대로 실행하면 SQL 자체의 STEP1
  사전조건 검증(원자적 트랜잭션)이 안전하게 rollback시키겠지만, 목적지
  값을 오늘 기준으로 재계산해 SQL을 갱신하는 편이 낫다.
- **정보성**: 1건 — 현다율의 유령 유닛 `53e380c7`에 실제 `word_status`
  학습 기록 1건이 걸려 있다(v3_44가 이미 이 유닛만 삭제 보류 중인 이유와
  정확히 일치). 이 문서에서 새로 발견한 게 아니라 기존 v3_44 설계와
  교차검증만 했다.
- **false positive**: 0건 — 10건 전부 실제로 유령 유닛(단어 1개, 헤더
  잔재)을 가리키고 있음을 라이브 조회로 재확인했다.

`DB WRITE: 0 / SQL EXECUTION: 0`

---

## 1. WARN 10명 원본 (`npm run health:students --json`)

| 학생 | id | 코드 |
|---|---|---|
| Dain | 58174565-90b1-4b7e-8dc4-61eb2fbb118a | `ASSIGNMENT_GHOST_UNIT:중2 천재 이상기:"Unit"` |
| 권교빈 | 6548dd2a-cc01-4b4f-80d9-746d55bf5014 | `ASSIGNMENT_GHOST_UNIT:고1 능률 민병천:"Unit"` |
| 황다은 | d05dea68-f019-4202-b494-6a917158ccd4 | `ASSIGNMENT_GHOST_UNIT:고1 능률 민병천:"Unit"(primary)` |
| 현다율 | e32b8d7d-ef76-4292-ba46-059fb7b9719e | `ASSIGNMENT_GHOST_UNIT:고1 능률 민병천:"Unit"(primary)` |
| Harry | 77cc6550-6fe2-4549-a23e-7eba510e891b | `ASSIGNMENT_GHOST_UNIT:중2 능률 김기택:"Unit"/2학년 천재소영순:"Unit"(primary)` |
| Song | 4f3e0b72-2452-4780-92bf-32eeceff9c90 | `ASSIGNMENT_GHOST_UNIT:중2 천재 이상기:"Unit"` |
| Luke | 48a8c230-e2c1-4814-82dd-f8bc4d0e3658 | `ASSIGNMENT_GHOST_UNIT:2학년 천재소영순:"Unit"(primary)` |
| 문지유 | 9f115c32-6a4b-4659-a026-f9905a5cc2e2 | `ASSIGNMENT_GHOST_UNIT:중2 천재 이상기:"Unit"` |
| John | 0446069e-eae0-4042-8bd1-d1907d5496d7 | `ASSIGNMENT_GHOST_UNIT:중2 천재 이상기:"Unit"` |
| 이윤제 | c554cad5-078c-4d43-ab29-e5dcc04a3e84 | `ASSIGNMENT_GHOST_UNIT:2학년 천재소영순:"Unit"(primary)` |

전체 37명 중 PASS 27 / WARN 10 / FAIL 0.

## 2. 유령 유닛 인벤토리 (7개, `units` name='Unit' 또는 단어≤1)

라이브 `units`/`words` GET으로 재확인. 전부 단어 1개, 그 1개가 엑셀 헤더
라벨(교재 원본의 "No./어휘·어구/English/Korean/의미" 행이 실수로 단어처럼
임포트된 것) — false positive 아님, 전부 실제 유령.

| 유닛 id | 이름 | 교재 | 생성일 | 유일 단어(word/meaning) | 참조 학생(SCA/students) |
|---|---|---|---|---|---|
| `113ee184` | Unit | 2학년 천재소영순 | 2026-08-19 | 어휘·어구 / 의미 | Harry(primary), Luke(primary), 이윤제(primary) |
| `35ee95ae` | Unit | 중2 능률 김기택 | 2026-08-11 | English / Korean | (WARN 10 중 참조 없음, v3_43 계획에도 그룹 A/B 없음 — 별도 잔여) |
| `3d1c753e` | Unit | 중2 능률 김기택 | 2026-07-15 | English / Korean | Harry(non-primary) + QA/DUP 계정들 |
| `4bc96928` | Unit | 중1 동아 윤정미 | 2026-07-20 | English / Korean | QA 계정만(WARN 10 무관) |
| `53e380c7` | Unit | 고1 능률 민병천 | 2026-08-11 | English / Korean | 권교빈(non-primary), 황다은(primary), 현다율(primary, **실 학습기록 1건**) |
| `5d9db813` | Unit1 | 중2 천재 이상기 | 2026-08-04 | No. / 어휘·어구 | leo_DUP(QA)만(WARN 10 무관) |
| `e327efc3` | Unit | 중2 천재 이상기 | 2026-07-13 | English / Korean | Dain, Harry(non-primary), Song, 문지유, John (전부 non-primary) |

주의: 라이브에서 확인한 `35ee95ae`의 실제 교재는 "중2 능률 김기택"이다
(WARN 코드 텍스트에는 이 유닛이 등장하지 않음 — WARN 10명과는 무관한
별개 유령이며 v3_43/v3_44 계획에도 포함돼 있어 이 문서의 범위 밖).

## 3. 학생별 상세 (읽기 전용 라이브 조회)

공통 표기: **SCA 이동 이력**은 `created_at` 오름차순. "고1 능률 민병천"류
이름은 SCA에서는 "class"=교재 컨테이너 반, `textbook_id`가 가리키는
`textbooks.name`과 사실상 동일(1교재=1전용 컨테이너 반 구조, `DATABASE.md`
"classes 도메인 확정" 참고).

### Dain (58174565)
- students: class=Pre-Middle School, unit_name=Unit5, current_unit_id→**Unit5 @ 2학년 천재소영순**(정상)
- SCA 이력(3행): 중2 능률 김기택(non-primary, 정상 Unit5) → **중2 천재 이상기(non-primary) → 유령 `e327efc3`**(2026-08-24) → 2학년 천재소영순(primary, Unit2, 정상)
- word_status: 3개 유닛(중2 능률 김기택 Unit5=24건, 2학년천재소영순 Unit2=40건, Unit3=22건) — **유령 유닛 학습기록 0건**
- student_progress: updated 09-02, total_stars 784, wordsViewed 40건, 헤더 단어 혼입 0건
- daily 최근 3건: 09-02/08-31/08-26 정상 학습 흔적
- xp 10건, entrance 5건
- **이동 학생**: 예 — 교재 3개를 순차 탐색(중2 능률→중2 천재→2학년 천재소영순), 유령은 non-primary로 남은 "탐색 흔적"

### 권교빈 (6548dd2a)
- students: class=MS Advanced Class, unit_name=Unit10, current_unit_id→**Unit10 @ 고1 6월 학평**(정상, primary SCA와 일치)
- SCA 이력(2행): 고1 6월 학평(primary, Unit10, 정상) → **고1 능률 민병천(non-primary) → 유령 `53e380c7`**(2026-08-11)
- word_status: 고1 6월 학평 Unit7/9/10 총 69건 — **유령 유닛 학습기록 0건**
- student_progress: updated 08-12(WARN 10 중 가장 오래됨), total_stars 1039
- daily 최근 3건: 08-12/08-06/08-04
- xp 7건, entrance 5건
- **이동 학생**: 아니오(주 교재는 처음부터 고1 6월 학평 유지) — 유령은 non-primary 탐색용 부교재 흔적

### 황다은 (d05dea68)
- students: class=MS Advanced Class, unit_name="7", current_unit_id→**"7" @ 고1 능률 민병천**(실유닛, 정상)
- SCA 이력(2행): 고1 6월 학평(non-primary, Unit10) → **고1 능률 민병천(primary=true!) → 유령 `53e380c7`**(2026-08-11)
- word_status: 고1 6월 학평 Unit2 2건뿐 — **유령 유닛 학습기록 0건**
- student_progress: updated 08-26, total_stars 131, wordsViewed 1건, 헤더 혼입 0건
- daily 최근 3건: 08-26/08-25/08-20 — categories_completed 대부분 0(활동 저조)
- xp 6건, entrance 6건(점수 낮음, 5~10/20)
- **primary SCA가 유령을 가리키는 케이스**: `students.current_unit_id`(="7", 실유닛)와 primary SCA(=유령)가 **서로 다른 값** — 두 필드가 어긋나 있음(`DATABASE.md`상 SCA가 source of truth, students는 캐시여야 함). 실제 화면에 뜨는 유닛이 어느 필드를 읽는지는 코드 경로에 따라 달라질 수 있어 이 문서에서는 "즉시 크래시"라고 단정하지 않음 — 최소한 SCA 캐시 동기화가 깨져 있다는 사실만 확인.

### 현다율 (e32b8d7d)
- students: class=MS Advanced Class, unit_name=Unit1, current_unit_id→**Unit1 @ 고1 능률 민병천**(실유닛, 정상)
- SCA 이력(3행): 중2 능률 김기택(non-primary) → 고1 6월 학평(non-primary, Unit1) → **고1 능률 민병천(primary=true!) → 유령 `53e380c7`**(2026-08-11)
- word_status: 4개 실유닛(중2 능률 김기택 Unit4/5/6, 고1 6월 학평 Unit1) 총 74건 + **`53e380c7`(유령) 자체에 실 학습기록 1건**(status=known, updated 2026-08-23T09:14:58Z), 그 다음날 08-27 Unit1(실유닛)로 넘어감
- student_progress: updated 09-01, total_stars 295, wordsViewed 0건(round 데이터 비어있음 — 헤더 혼입 여부 판단 불가)
- daily 최근 3건: 09-01/08-27/08-26
- xp 3건, entrance 6건
- **⚠️ 유일하게 실제 데이터 손실 위험이 있는 케이스**: 유령 유닛 `53e380c7`의 단 하나뿐인 "단어"(헤더 잔재 "English"/"Korean")를 현다율이 실제로 "know" 처리한 기록이 남아 있다. `supabase_v3_44_ghost_units_delete.sql`이 정확히 이 이유로 `53e380c7`을 삭제 대상 6개에서 제외하고 HOLD로 남겨둔 것과 일치(교차검증 완료). **운영자가 이 1건을 어떻게 할지(무시/삭제 후 별도 처리) 별도 결정해야 함.**

### Harry (77cc6550)
- students: class=Pre-Middle School, unit_name=Unit5, current_unit_id→**Unit5 @ 2학년 천재소영순**(실유닛)
- SCA 이력(3행): 중2 YMB 박준원(non-primary, 정상) → **중2 능률 김기택(non-primary) → 유령 `3d1c753e`**(2026-07-22) → **2학년 천재소영순(primary=true!) → 유령 `113ee184`**(2026-08-26)
- word_status: **0건** — 어떤 유닛에서도 word_status 기록이 없음(단어 학습 자체를 아직 안 한 것으로 보임, total_stars 41로 WARN 10 중 최저권)
- student_progress: updated 09-02(오늘), total_stars 41, wordsViewed 0건
- daily 최근 3건: 09-02/08-31/08-26
- xp 1건, entrance 2건
- **⚠️ v3_43 사전조건 재검증에서 발견한 stale 값**: `supabase_v3_43_ghost_sca_reassign.sql`은 이 SCA의 AUTHORITATIVE 목적지를 `2ee167a0`("Unit3")로 하드코딩했는데(작성 시점의 `students.current_unit_id` 스냅샷), 오늘 라이브 조회 결과 `students.current_unit_id`는 이미 `4ce41359`("Unit5")로 **2단계 더 진행**돼 있다. SQL의 STEP1이 `s.current_unit_id`가 `to_unit`과 정확히 같은지 검사하므로, 지금 그대로 실행하면 이 라인에서 안전하게 raise exception → 트랜잭션 전체 rollback(부분 반영 없음, 원자적이라 위험하지 않음). 다만 **목적지 값 재계산 없이는 v3_43 전체가 실행되지 않는다** — Harry/이윤제 두 건 때문에 나머지 8건도 함께 막힌다(한 트랜잭션이므로).
- **이동 학생**: 예 — 3개 교재를 거쳤고, 원래 조사 이후에도 실제로 계속 진도가 나감(활성 사용자)

### Song (4f3e0b72)
- students: class=Pre-Middle School, unit_name=Unit5, current_unit_id→**Unit5 @ 2학년 천재소영순**(실유닛, primary SCA와 일치)
- SCA 이력(6행, WARN 10 중 최다) — 중2 능률 김기택 → 중2 YMB 박준원 → (class_id만 있고 textbook_id/current_unit_id NULL인 행 1개, Pre-Middle School 자체) → 중1 동아 윤정미 → **중2 천재 이상기(non-primary) → 유령 `e327efc3`**(2026-08-24) → 2학년 천재소영순(primary, Unit2→현재 Unit5까지 진행)
- word_status: 6개 실유닛(중2 YMB 박준원 Unit5/6/7, 2학년 천재소영순 Unit2/3/5) 총 193건 — **유령 유닛 학습기록 0건**
- student_progress: updated 09-02(오늘, 방금), total_stars 552
- daily 최근 3건: 09-02(활발, categories 3/quiz 11/11)/09-01/08-30
- xp 7건, entrance 6건
- v3_43에서 **보호 계정(`_protect`) 목록에 명시적으로 포함**되어 있음(expected_plan_rows=1) — SQL이 Song은 정확히 1행(TO_NULL)만 건드리고 그 외 5개 SCA 행/students는 절대 안 건드린다는 것을 스스로 assert함. 실측 결과와 정확히 일치.
- **이동 학생**: 예, 매우 활발히 여러 교재를 탐색 중인 실사용 학생

### Luke (48a8c230)
- students: class=Pre-Middle School, unit_name=Unit2, current_unit_id→**Unit2 @ 2학년 천재소영순**(실유닛, primary SCA와 일치 — v3_43 목적지 값과도 일치)
- SCA 이력(3행): 중2 YMB 박준원(non-primary, Unit7) → (class_id만 있고 unit/textbook NULL인 행, Pre-Middle School) → **2학년 천재소영순(primary=true!) → 유령 `113ee184`**(2026-08-26)
- word_status: **0건**
- student_progress: updated 08-26, total_stars 25(WARN 10 중 최저)
- daily 최근 3건: 08-26/08-19/08-12 — 활동 저조(categories_completed 대부분 0)
- xp 4건, entrance 8건
- **v3_43 목적지 재검증**: 목적지 `d279d1c4`("Unit2")가 라이브 `students.current_unit_id`와 **정확히 일치** — stale 아님, 그대로 실행 가능한 값.
- **이동 학생**: 예(2개 교재 탐색 후 정착)

### 문지유 (9f115c32)
- students: class=Pre-Middle School, unit_name=Unit5, current_unit_id→**Unit5 @ 2학년 천재소영순**(실유닛)
- SCA 이력(3행): 중2 YMB 박준원(non-primary, Unit7) → **중2 천재 이상기(non-primary) → 유령 `e327efc3`**(2026-08-24) → 2학년 천재소영순(primary, Unit2→현재 Unit5)
- word_status: 중2 YMB 박준원 Unit4 5건뿐(전부 unknown) — **유령 유닛 학습기록 0건**
- student_progress: updated 09-02(오늘), total_stars 1955(WARN 10 중 최고 — 매우 활발한 학생)
- daily 최근 3건: 09-02(활발)/08-31/08-30
- xp 24건(최다), entrance 12건
- **이동 학생**: 예, 매우 활발한 실사용 학생 — 유령은 non-primary 탐색 흔적일 뿐 실제 학습에 지장 없음

### John (0446069e)
- students: class=Pre-Middle School, unit_name=Unit5, current_unit_id→**Unit5 @ 2학년 천재소영순**(실유닛)
- SCA 이력(4행): 중2 YMB 박준원(non-primary, Unit4) → **중2 천재 이상기(non-primary) → 유령 `e327efc3`**(2026-08-24) → 중2 능률 김기택(non-primary, Unit5) → 2학년 천재소영순(primary, Unit4→현재 Unit5)
- word_status: 7개 실유닛(중2 YMB 박준원 4개 유닛 + 2학년 천재소영순 3개 유닛) 총 146건 — **유령 유닛 학습기록 0건**
- student_progress: updated 09-02(오늘), total_stars 795
- daily 최근 3건: 09-02/09-01/08-31 — 활발
- xp 22건, entrance 15건(최다)
- **이동 학생**: 예, 4개 교재 탐색한 활발한 학생

### 이윤제 (c554cad5)
- students: class=Pre-Middle School, unit_name=Unit5, current_unit_id→**Unit5 @ 2학년 천재소영순**(실유닛)
- SCA 이력(2행): 중2 YMB 박준원(non-primary, Unit7) → **2학년 천재소영순(primary=true!) → 유령 `113ee184`**(2026-08-26)
- word_status: 중2 YMB 박준원 4개 유닛(Unit2/5/6/7) 총 70건 — **유령 유닛 학습기록 0건**
- student_progress: updated 09-02(오늘), total_stars 71
- daily 최근 3건: 09-02/08-31/08-26 — 활동 저조(stars 2~4)
- xp 6건, entrance 12건
- **⚠️ Harry와 동일한 stale 발견**: v3_43의 AUTHORITATIVE 목적지가 `2ee167a0`("Unit3")로 박제돼 있는데, 라이브 `students.current_unit_id`는 `4ce41359`("Unit5")로 이미 진행됨. Harry와 같은 이유(같은 교재 "2학년 천재소영순"에서 계속 진행 중) — 같은 재계산이 필요하다.

## 4. 분류 표 (10행)

| 학생 | invariant | 현재값 | 예상 정상 구조 | 실제 사용자 영향 | 데이터 손실 위험 | 즉시 수정 필요 | historical(이동) | corruption/FP | 권장 조치 |
|---|---|---|---|---|---|---|---|---|---|
| Dain | SCA.current_unit_id는 유령(단어<2) 유닛을 가리키면 안 됨 | non-primary SCA→`e327efc3`(유령) | NULL(교재 미착수 상태) | 낮음 — non-primary, 실제 학습은 primary(2학년 천재소영순)에서 정상 진행 | 없음 | 아니오 | 예(3교재 이동) | corruption(경미) | v3_43 그룹B 대상, TO_NULL(값 stale 아님, 그대로 유효) |
| 권교빈 | 상동 | non-primary SCA→`53e380c7`(유령) | NULL | 낮음 — non-primary | 없음 | 아니오 | 아니오(주 교재 고정) | corruption(경미) | v3_43 그룹B 대상, TO_NULL(stale 아님) |
| 황다은 | primary SCA.current_unit_id는 students.current_unit_id와 동기화돼야 함 | primary SCA→`53e380c7`(유령), students는 실유닛"7" | SCA도 "7"(=students 값)로 동기화 | 중간 — 어느 필드를 읽는 코드 경로냐에 따라 다름, 최소한 캐시 불일치 확정 | 없음 | 운영자 판단 | 아니오 | corruption(캐시 desync) | v3_43 그룹A 대상, AUTHORITATIVE→"7"(stale 아님, 값 일치 확인됨) |
| 현다율 | 상동 + 유령 유닛에 실학습기록 없어야 함 | primary SCA→`53e380c7`(유령), students는 실유닛Unit1, **게다가 유령 자체에 word_status 1건** | SCA도 Unit1로 동기화, 유령의 학습기록 1건은 운영자 결정 | 중간(SCA 캐시 desync) + **학습기록 1건이 유령에 걸려 있음(정보성 아님, 실 데이터)** | **있음** — 유령 삭제 시 그 1건 CASCADE 소실 | 운영자 판단(SCA는 그대로, 학습기록 1건 처리는 별도) | 아니오 | corruption + 실데이터 혼입 | v3_43 그룹A(SCA만, stale 아님) 실행 가능. **v3_44는 이미 `53e380c7` HOLD 처리**(교차검증 일치) — 학습기록 1건 자체의 운영자 결정은 v3_44 범위 밖, 신규 후속 작업 |
| Harry | 상동 | non-primary SCA→`3d1c753e`, **primary SCA→`113ee184`(둘 다 유령)** | non-primary는 NULL, primary는 students 값과 동기화 | non-primary는 낮음, primary는 캐시 desync(현재 students는 이미 실유닛Unit5로 전진) | 없음(word_status 0건) | 아니오 | 예(3교재), **활성 진행 중** | corruption(경미)+**SQL stale** | v3_43 그룹A/B 둘 다 대상이나 **AUTHORITATIVE 값(Unit3)이 오늘 기준 stale — Unit5로 재계산 필요**, 재계산 전 실행 금지 |
| Song | non-primary SCA는 진행 없어야 함(맞음) | non-primary SCA→`e327efc3`(유령) | NULL | 낮음 — non-primary, primary는 정상 활발 진행 중 | 없음 | 아니오 | 예(6교재 탐색, 최다) | corruption(경미) | v3_43 그룹B 대상(`_protect`로 명시 보호됨, stale 아님) |
| Luke | primary SCA 동기화 | primary SCA→`113ee184`(유령), students는 실유닛Unit2 | SCA도 Unit2로 동기화 | 중간(캐시 desync) | 없음(word_status 0건) | 운영자 판단 | 예(2교재) | corruption(캐시 desync) | v3_43 그룹A 대상, AUTHORITATIVE→Unit2(stale 아님, 라이브값과 일치 확인) |
| 문지유 | non-primary SCA | non-primary SCA→`e327efc3`(유령) | NULL | 낮음 — non-primary, primary는 매우 활발(WARN 10 중 최고 활동) | 없음 | 아니오 | 예(3교재) | corruption(경미) | v3_43 그룹B 대상(stale 아님) |
| John | non-primary SCA | non-primary SCA→`e327efc3`(유령) | NULL | 낮음 — non-primary, primary는 활발히 진행 중 | 없음 | 아니오 | 예(4교재, 최다 이동) | corruption(경미) | v3_43 그룹B 대상(stale 아님) |
| 이윤제 | primary SCA 동기화 | primary SCA→`113ee184`(유령), students는 실유닛Unit5 | SCA도 Unit5로 동기화 | 중간(캐시 desync) | 없음(word_status 0건) | 운영자 판단 | 예(2교재), **활성 진행 중** | corruption(캐시 desync)+**SQL stale** | v3_43 그룹A 대상이나 **Harry와 동일하게 AUTHORITATIVE 값(Unit3) 재계산 필요** |

## 5. v3_43/v3_43b/v3_44 대조

`supabase_v3_43_ghost_sca_reassign.sql`/`_43b_paul_dup_sca_reassign.sql`/
`_44_ghost_units_delete.sql` 헤더 및 본문(`_plan_sca`/`_plan_stu`/`_ghost`
temp table)을 읽어 대조했다(실행하지 않음).

- **WARN 10명의 SCA 행 10개(각 1개씩, Harry만 primary+non-primary 2개
  = 총 11개)는 전부 v3_43의 `_plan_sca`에 정확히 존재한다.** 매핑 누락 0건.
  - 그룹 A(AUTHORITATIVE, primary=true, 학생 자신의 현재 진도로 SCA 동기화):
    황다은, 현다율, Harry(primary분), Luke, 이윤제 — 5행.
  - 그룹 B(TO_NULL, non-primary → NULL로 초기화): Dain, 권교빈, Harry(non-primary분),
    Song, 문지유, John — 6행.
- **`v3_43b`(Paul_DUP 2행 재배정)는 WARN 10명과 무관** — `Paul_DUP_20260722_INACTIVE`
  (38717600-…)는 별개의 ARCHIVED 중복 테스트 계정이며 이 10명에 포함되지 않음.
- **`v3_44`(유령 유닛 6개 삭제, `53e380c7` HOLD)는 v3_43/43b 완료를 전제로
  후속 실행**되는 파일. 현다율의 word_status 1건 때문에 `53e380c7`를 HOLD
  한다는 v3_44 헤더의 설명이 이번 라이브 재조사 결과와 정확히 일치함
  (교차검증 PASS — 새 발견 아님, 기존 설계가 옳았음을 재확인).
- **이번 조사에서 v3_43 문서 자체에 새로 발견된 이슈**: 그룹 A 5행 중
  **Harry, 이윤제 2행의 AUTHORITATIVE 목적지 값(`2ee167a0`="Unit3")이
  오늘 라이브 데이터와 어긋난다** — 두 학생 모두 SQL 작성 이후 실제로
  "2학년 천재소영순" 교재에서 Unit3→Unit4→Unit5까지 계속 진도가 나갔다
  (student_progress.updated_at이 오늘 날짜, 활성 사용자). SQL의 STEP1
  사전조건(`v_cur is distinct from v_rec.to_unit`이면 raise exception)이
  이를 감지해 트랜잭션 전체를 안전하게 rollback시키므로 **데이터가 잘못
  반영될 위험은 없다**(원자적 트랜잭션 + 자체 재검증 설계 덕분). 다만
  이 2행 때문에 **v3_43 전체(나머지 8행 포함, 그룹 A 3행 + 그룹 B 6행)가
  지금 그대로는 실행되지 않는다** — 운영자가 실행하기 전에 Harry/이윤제의
  목적지 값을 오늘 기준(`4ce41359`="Unit5")으로 재계산해 SQL을 갱신해야
  한다(또는 재조사 세션에 위임).

## 6. BLOCKED_FOR_OPERATOR

1. **v3_43 재계산 필요**: Harry(sca `0a6da72e`)와 이윤제(sca `0c8793c3`)의
   AUTHORITATIVE `to_unit`을 `2ee167a0`("Unit3")에서 라이브 값
   `4ce41359`("Unit5")로 갱신하지 않으면 v3_43 전체가 STEP1에서
   실패한다(안전하게 rollback되지만 아무 것도 반영되지 않음). 재계산은
   실행 직전 다시 라이브 조회로 재확인 필요(이 문서 작성과 실제 실행
   사이에도 두 학생이 활성 사용자라 또 진행될 수 있음).
2. **v3_43 → v3_43b → v3_44 실행 순서**는 운영자 수동 실행 대상(현
   저장소 규칙상 에이전트는 DDL 실행 불가).
3. **현다율의 `53e380c7` word_status 1건**: v3_44는 이 유닛을 삭제하지
   않고 영구 보류하는 설계다. 이 학습기록 1건 자체를 어떻게 할지(그대로
   둘지/수동 정리할지)는 v3_43/v3_44 어디에도 포함되지 않은 별도 운영자
   결정 사항.
4. **황다은/현다율/Luke/이윤제의 SCA↔students 캐시 desync**(primary
   SCA가 유령을 가리키는데 students.current_unit_id는 실유닛)는 v3_43
   그룹 A가 SCA 쪽을 students 값으로 동기화하는 것으로 해소되지만, **왜
   애초에 두 필드가 어긋났는지**(어떤 코드 경로가 SCA를 갱신하지 않고
   students만 갱신했는지)는 이 문서의 조사 범위 밖 — 코드 조사가 필요하면
   별도 세션 권장(재발 방지 관점에서 근본 원인 파악 가치 있음).

---

DB WRITE: 0 / SQL EXECUTION: 0
