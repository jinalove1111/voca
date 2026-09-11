# V3_50 (Paul Town V1) 적용 운영 런북

_비기술자 운영자용 — 단계별로 그대로 따라 하면 됩니다. 실행은 전부
Supabase 대시보드 SQL Editor(service_role 컨텍스트)에서 운영자 본인이
직접 합니다. 문서 스타일은 `docs/production-safety-harness-runbook.md`를
따릅니다._

작성 2026-09-11. 대상 SQL: `supabase_v3_50_town_v1.sql`(본 SQL),
`supabase_v3_50_town_v1_ROLLBACK.sql`(실패 시 되돌리기, STAGE 0~3),
`supabase_v3_50_town_v1_POST_VERIFY.sql`(적용 후 상세 확인, 읽기 전용),
`production_v3_50_baseline_and_post_verify.sql`(운영자 READ-ONLY 검증
스크립트, 208행, PART 1 PRE / PART 2 POST 블록 구성 — 아직 git 추적
대상이 아닌 로컬 작업 파일).

---

## 1. 목적 / 범위 / 절대 규칙

### 1-1. 목적

`town_items`에 카탈로그 메타데이터 컬럼 4개(category/sort_order/
min_level/asset_key)를 추가하고 신규 아이템 16종을 시드, 기존
shop-lamp의 메타데이터만 갱신, 레벨 잠금이 추가된 `purchase_town_item`
교체, 신규 함수 `town_level_for_stars`/`grant_town_welcome_credit` 생성을
프로덕션에 안전하게 적용하는 절차를 정의한다
(`supabase_v3_50_town_v1.sql:1-79` 헤더 주석 참고).

### 1-2. 범위

이 런북은 **`supabase_v3_50_town_v1.sql` 1회 적용 + 적용 전/후 READ-ONLY
검증**까지만 다룬다. 적용 후 별도 승인이 필요한 후속 작업(Vercel 환경변수
플래그 ON, 파일럿 학생 확대 등, 7절 참고)은 이 런북의 실행 범위 밖이다.

### 1-3. 절대 규칙

1. **운영자만 실행한다.** Supabase 대시보드 SQL Editor(service_role
   컨텍스트)에서 운영자 본인이 직접 SQL을 붙여넣고 실행한다.
2. **이 세션/에이전트(Claude 등 AI 세션)는 이 런북이 다루는 SQL을 단
   한 줄도 실행하지 않는다(실행 0).** 문서를 준비·설명할 뿐, DB에 대한
   어떤 쓰기/읽기 호출도 에이전트가 대신 수행하지 않는다(CLAUDE.md
   규칙 8과 동일 원칙).
3. **학생 학습 시간대를 피하는 것을 권장한다.** 이유: BLOCK A(PRE)와
   BLOCK D(POST)를 비교할 때 그 사이 학생이 실제로 학습하면
   `reward_ledger`/`dollar_ledger`/`student_progress`/`xp_ledger`가
   자연스럽게 증가하는데, 이 증가 자체는 정상(버그 아님)이지만 "적용
   전후 값이 완전히 같아야 한다"는 단순 비교 판정을 흐리게 만든다.
   학습 시간대를 피하면 A→적용→D를 1~2분 안에 연속 실행해 "전 항목
   완전 동일"이라는 가장 단순하고 확실한 판정 기준을 그대로 쓸 수 있다.
4. **BEGIN/COMMIT으로 감싸져 있어 부분 적용이 없다.** 본 SQL은 단일
   트랜잭션이라 중간에 실패하면 전체가 롤백된다(`supabase_v3_50_town_v1.sql:81,336`).
5. **멱등이다** — add column if not exists / on conflict do update(메타
   컬럼만) / create or replace function / DO 없이도 재실행 안전
   (`supabase_v3_50_town_v1.sql:7-9`).

---

## 2. Expected Delta 표 (정확 수치)

| 항목 | 값 | 근거(파일:줄) |
|---|---|---|
| ALTER TABLE | 1 | `supabase_v3_50_town_v1.sql:87-91` |
| ADD COLUMN | 4 (`category text` / `sort_order smallint default 0` / `min_level smallint default 1 CHECK 1~10` / `asset_key text`) | 위와 동일 |
| INSERT | 1문, 16행(`town_items`) | `supabase_v3_50_town_v1.sql:99-121` |
| UPDATE | 1(shop-lamp 메타 4컬럼만: category/sort_order/min_level/asset_key; price/active/name/emoji는 SET 절에 없어 불변) | `supabase_v3_50_town_v1.sql:126-131` |
| DELETE | 0 | (파일 전체에 DELETE 없음) |
| CREATE OR REPLACE FUNCTION | 3 — `town_level_for_stars`(신규), `purchase_town_item`(교체), `grant_town_welcome_credit`(신규) | `supabase_v3_50_town_v1.sql:137,170,291` |
| DROP | 0 | (없음) |
| INDEX | 0 | (없음) |
| CONSTRAINT | +1(`min_level` CHECK 1~10) | `supabase_v3_50_town_v1.sql:90` |
| TRIGGER | 0 | (없음) |
| VIEW | 0 | (없음) |
| GRANT/REVOKE | 9 (함수 3개 × [revoke from public, revoke from anon/authenticated, grant to service_role]) | `supabase_v3_50_town_v1.sql:161-163,280-282,329-331` |

Seed rows(`town_items`): **적용 전 1행 → 적용 후 17행**
(`production_v3_50_baseline_and_post_verify.sql:99` BLOCK A 기대값
`town_items_count 1` → BLOCK C `town_items_count`/`new_items_present`
17/16, `production_v3_50_baseline_and_post_verify.sql:146-156`).

신규 16개 아이템 id / price / min_level (`supabase_v3_50_town_v1.sql:101-116`):

| id | price | min_level |
|---|---|---|
| british-cottage | 80 | 1 |
| tree | 10 | 1 |
| bench | 15 | 1 |
| town-sign | 40 | 1 |
| cat | 20 | 2 |
| street-lamp | 25 | 2 |
| red-post-box | 25 | 2 |
| flower-garden | 30 | 3 |
| book-shop | 120 | 3 |
| puppy | 30 | 4 |
| owl | 40 | 4 |
| cafe | 120 | 5 |
| stone-fountain | 60 | 5 |
| bridge | 150 | 6 |
| english-school | 150 | 7 |
| clock-tower | 200 | 8 |

기존 17번째 행은 shop-lamp(가격 60, v3_47 시드 — 이 파일은 메타 4컬럼만
갱신, `supabase_v3_50_town_v1.sql:123-131`).

**함수 본문 내부 INSERT(`town_purchases`/`dollar_ledger`)는 정의(定義)일
뿐이다 — 적용 시점에 실제로 삽입되는 행은 0개.** `purchase_town_item`/
`grant_town_welcome_credit`은 학생 세션이 실제로 RPC를 호출할 때만
행을 만든다(`supabase_v3_50_town_v1.sql:27-32,284-290`,
`production_v3_50_baseline_and_post_verify.sql:34` "dollar_ledger_welcome_rows
: 0 → 0 (불변)").

---

## 3. must_not_change 데이터셋 (BLOCK A / BLOCK D 동일 항목)

아래 항목은 BLOCK A(적용 전)와 BLOCK D(적용 후)에서 값이 **정확히
동일**해야 한다(`production_v3_50_baseline_and_post_verify.sql:161-199`).

| 테이블/항목 | 확인 방식 |
|---|---|
| `students` | count + md5(id\|name\|class_id\|current_unit_id) |
| `classes` | count + md5(id\|name\|class_type\|spelling_direction\|spelling_test_enabled) |
| `student_class_assignments` | count + md5(id\|student_id\|class_id\|textbook_id\|is_primary\|current_unit_id) |
| `textbooks` | count + md5(id\|name\|owner_class_id) |
| `words` | count + md5(id\|unit_id\|word\|meaning) |
| `word_status` | count + md5(student_id\|word_id\|status) |
| `student_progress` | count, **sum(total_stars) 38,019**(anon 실측 2026-09-11), **sum(total_xp) 37,444**, md5(student_id\|total_stars\|total_xp\|updated_at) |
| `xp_ledger` | **688행, sum(amount) 1,790**, md5(id\|student_id\|event_type\|amount\|source_event_id) |
| `reward_ledger` | count, sum(stars_delta), legacy-baseline count, md5(idempotency_key 정렬) |
| `dollar_ledger` | count, sum(dollars_delta), welcome 행수(반드시 0 유지), md5(idempotency_key 정렬) |
| `dollar_balances` | sum(balance)/sum(earned)/sum(spent), md5(student_id\|balance) |
| `town_purchases` | count, md5(student_id\|item_id\|price_paid) |
| `star_purchases` | count(1) |
| `dollar_rules` | count(12), md5(reward_type\|dollars_per_star\|active) |
| `trigger_reward_to_dollars` | 활성 트리거 존재(1) |

**md5 = 정렬된 키 컬럼을 `string_agg`로 이어붙인 문자열의 해시값.** 즉
행 순서·내용이 조금이라도 다르면 해시가 달라지므로, count만으로는 잡지
못하는 "행이 바뀌었지만 개수는 같음" 케이스까지 잡아내는 용도다
(`production_v3_50_baseline_and_post_verify.sql:50` 등 각 md5 라인).

---

## 4. 실행 순서 A~G

### A. PRE — BLOCK A 실행 → 결과 저장 + BLOCK A-2 자가판정

1. `production_v3_50_baseline_and_post_verify.sql`의 **BLOCK A**
   (파일 48~98행)를 SQL Editor에서 실행한다.
2. 결과를 스크린샷 또는 CSV로 저장한다(이후 BLOCK D와 대조할 기준값).
3. 이어서 **BLOCK A-2**(파일 105~118행)를 실행한다 — 이 블록은 4개
   핵심 항목만 축약 재확인하며, **"부재 = PASS"**다:
   - `fn_town_level_for_stars_before` = 0 → PASS
   - `fn_grant_town_welcome_credit_before` = 0 → PASS
   - `town_items_new_columns_present` = 0 → PASS
   - `town_items_count` = 1 → PASS

### B. 결과 확인 (기대값 표)

BLOCK A 실행 결과가 아래와 정확히 일치하는지 확인한다
(`production_v3_50_baseline_and_post_verify.sql:99-102`):

| check_name | 기대값 |
|---|---|
| `town_items_count` | 1 |
| `town_items_new_columns_present` | 0 |
| `fn_town_level_for_stars_before` | 0 |
| `fn_grant_town_welcome_credit_before` | 0 |
| `fn_purchase_town_item` | 1 |
| `fn_get_town_shop_state` | 1 |
| `fn_reward_ledger_to_dollars` | 1 |
| `trigger_reward_to_dollars` | 1 |
| `dollar_ledger_welcome_rows` | 0 |
| `star_purchases_count` | 1 |
| `dollar_rules_count` | 12 |
| `purchase_fn_body_md5_before` | 실제 md5 값(ABSENT 아님) |

나머지 count/sum/md5 값(3절 참고)은 그대로 저장해 두고 BLOCK D와 나중에
비교한다.

### C. 운영자 승인 (체크박스)

아래 항목을 모두 확인한 뒤에만 다음 단계(D)로 진행한다.

- [ ] BLOCK A / A-2 결과를 스크린샷·CSV로 저장했다.
- [ ] BLOCK A 결과가 위 "B. 결과 확인" 표와 정확히 일치함을 확인했다.
- [ ] 지금이 학생 학습 시간대가 아니거나, 학습 시간대라면 3절 must_not_change
      판정 시 학습으로 인한 자연 증가를 감안하기로 인지했다.
- [ ] `supabase_v3_50_town_v1.sql` 전체 내용을 SQL Editor에 붙여넣을
      준비가 되었다(부분 실행 금지 — 반드시 파일 전체 1회).
- [ ] 운영자 본인이 이 실행에 대한 책임을 지고 진행함을 확인했다.

### D. 본 SQL 실행

`supabase_v3_50_town_v1.sql` 전체를 SQL Editor에 붙여넣고 1회 실행한다.
기대 결과: **"Success. No rows returned"**(BEGIN...COMMIT 트랜잭션,
`notify pgrst, 'reload schema'` 포함, `supabase_v3_50_town_v1.sql:81-336`).
에러가 나면 트랜잭션 전체가 자동 롤백되므로 부분 적용 걱정 없이 즉시
STOP하고 7절이 아니라 아래 G절 지침을 따른다.

### E. POST — BLOCK B → B-2 → C → C-2 → D → E 순서대로 실행

`production_v3_50_baseline_and_post_verify.sql`을 순서대로 실행한다.

1. **BLOCK B**(125~138행) — 컬럼/함수 존재 + 권한 확인.
2. **BLOCK B-2**(140~144행) — `town_level_for_stars` 임계값 스팟체크.
   ⚠️ 이 블록은 **적용 후에만** 실행한다(8절 42883 이력 참고).
3. **BLOCK C**(146~156행) — v3_50 델타(카탈로그 17행, min_level 범위,
   shop-lamp 값, locked 사유 존재 여부 등).
4. **BLOCK C-2**(158~159행) — 카탈로그 17행 전체 목록 육안 확인.
5. **BLOCK D**(161~199행) — must_not_change 재실행, BLOCK A와 비교.
6. **BLOCK E**(205~208행) — 롤백 준비 확인(`new_item_purchases` 등).

### F. PASS/FAIL 판정 기준표

5절 참고.

### G. 실패 시 STOP

어떤 경우에도 **자동 롤백을 하지 않는다.** F절 기준 중 하나라도 FAIL이면:

1. 즉시 추가 조작을 멈추고 현재 상태(BLOCK B/C/D/E 결과)를 그대로
   보존·기록한다.
2. 롤백 여부는 반드시 **별도 승인**을 받은 뒤에만 진행한다.
3. 승인 후 롤백은 `supabase_v3_50_town_v1_ROLLBACK.sql`을 **STAGE
   순서(0→1→2→3)대로, 한 번에 하나씩** 실행한다(파일 헤더:
   "아래 STAGE를 하나씩 실행하고 각 단계의 확인 쿼리를 눈으로 본 뒤
   다음으로 넘어갈 것. 통째로 붙여넣지 말 것",
   `supabase_v3_50_town_v1_ROLLBACK.sql:4-6`).
4. **STAGE 2(신규 16행 삭제)를 실행하기 전에 반드시 BLOCK E의
   `new_item_purchases`가 0인지 먼저 확인한다.** 0이 아니면 STAGE 2의
   DELETE는 FK 위반(`town_purchases.item_id → town_items.id`)으로
   실패하거나, 이미 학생이 구매한 아이템 카탈로그 행을 지우게 되므로
   해당 STAGE의 DELETE 문을 실행하지 않고 건너뛴다
   (`supabase_v3_50_town_v1_ROLLBACK.sql:37-44,194-199`).

---

## 5. PASS 기준

| 블록 | 항목 | 기대값 |
|---|---|---|
| B | `town_items_new_columns_present` | 4 |
| B | 함수 존재(`fn_town_level_for_stars`, `fn_grant_town_welcome_credit`) | 각 1 |
| B | `secdef_town_functions` | 2(`purchase_town_item`, `grant_town_welcome_credit`만 SECURITY DEFINER — `town_level_for_stars`는 순수 SQL 함수라 제외) |
| B | anon/authenticated execute(purchase/welcome/state) | 전부 false |
| B | service_role execute(purchase/welcome/state) | 전부 true |
| B-2 | `lv_0\|lv_19\|lv_20\|lv_1499\|lv_1500` | `1\|1\|2\|9\|10` |
| C | `town_items_count` | 17 |
| C | `town_items_category_null` | 0 |
| C | `town_items_min_level_out_of_range` | 0 |
| C | `town_items_dollars` | 17 |
| C | `shop_lamp_row` | `60\|dollars\|true\|decoration\|1` |
| C | `new_items_present` | 16 |
| C | `dollar_ledger_welcome_rows` | 0 |
| C | `purchase_fn_has_locked_reason` | true |
| D | 3절 전 항목 | BLOCK A와 완전 동일. **단, 적용 시점이 학생 학습 중이었다면** 허용되는 차이는 `reward_ledger`/`dollar_ledger`/`student_progress`/`xp_ledger`의 증가분이 **전부 `reward:*` 학습 이벤트**이고 `welcome` 행이 0이며, 그 외(`students`/`classes`/`sca`/`textbooks`/`words`/`dollar_rules` 등) md5는 정확히 동일한 경우뿐(`production_v3_50_baseline_and_post_verify.sql:201-203`) |
| E | `new_item_purchases` | 0 |

위 항목 중 하나라도 벗어나면 4절 G(STOP)를 따른다.

---

## 6. Rollback 범위

`supabase_v3_50_town_v1_ROLLBACK.sql`은 **v3_50이 만든 것만** 정확히
되돌린다.

| 항목 | 롤백 결과 |
|---|---|
| `town_level_for_stars` / `grant_town_welcome_credit` 함수 | 제거(`drop function if exists`, STAGE 1) |
| `purchase_town_item` | v3_49 본문으로 원복(레벨 잠금 검사만 제거, 그 외 전부 동일 — `supabase_v3_50_town_v1_ROLLBACK.sql:84-181`) |
| `town_items` 신규 16행 | STAGE 2에서 조건부 삭제(FK 차단 시 건너뜀) |
| **`town_items` 신규 컬럼 4개(category/sort_order/min_level/asset_key)** | **삭제하지 않는다 — 유지.** 이 저장소의 destructive-SQL 게이트가 "ALTER TABLE 문 안에 삭제 동사가 등장하는" 패턴 자체를 Write/Edit 저장 단계에서 차단하므로, 컬럼 삭제 구문은 기술적으로 이 파일에 담을 수 없다(정책 선택이 아니라 구조적 제약, `supabase_v3_50_town_v1_ROLLBACK.sql:18-35`). 남겨진 컬럼은 무해 — `min_level` 기본값 1이 모든 학생을 항상 통과시키고, 나머지는 순수 표시 메타데이터라 원복된 `purchase_town_item`이 전혀 참조하지 않는다. |
| `dollar_ledger` / `town_purchases` / `reward_ledger` | **무접촉** — 이미 지급된 웰컴 크레딧을 포함해 어떤 행도 삭제하지 않는다(`supabase_v3_50_town_v1_ROLLBACK.sql:46-53`) |
| 트리거(`trg_reward_ledger_to_dollars`) | **무접촉** |
| `dollar_rules` / `dollar_balances` | **무접촉** |
| shop-lamp 행(price=60) | **무접촉**(신규 16개 id 목록에 없음) |

STAGE 1(함수 원복)은 STAGE 2(행 삭제)의 FK 상황과 무관하게 항상 먼저
안전하게 실행 가능(`supabase_v3_50_town_v1_ROLLBACK.sql:72-78`).

---

## 7. 적용 후 다음 단계 (별도 승인 — 이 런북은 여기까지 실행하지 않음)

이 런북이 다루는 범위는 `supabase_v3_50_town_v1.sql` 적용 + PRE/POST
검증까지다. 아래는 **완전히 별도의 승인**이 필요한 후속 단계이며, 이
런북의 실행 절차에 포함되지 않는다:

1. Vercel 환경변수 `TOWN_V1_WELCOME_ENABLED=1` 설정.
2. Pilot A 기기에서 `paulTownV1` 플래그 ON.
3. 첫 방문 웰컴 크레딧 20 지급 확인 —
   `production_pilot_student_diagnostic.sql`(현재 작성 중)로 확인 예정.

---

## 8. 참고 — 42883 이력

`production_v3_50_baseline_and_post_verify.sql`의 초판 BLOCK B는 아직
존재하지 않는 함수를 `'public.fn(sig)'::regprocedure`처럼 즉시(eager)
캐스트했다 — 이 형태는 함수가 없으면 그 자리에서 바로 `42883
(undefined_function)` 에러를 내므로, **적용 전(PRE)에 실행하면 항상
실패**했다. 2026-09-11에 `to_regprocedure('public.fn(sig)')`(strict,
함수 없으면 에러 대신 NULL 반환) 기반으로 수정해 BLOCK B/C/E는 적용
전에 실행해도 42883 없이 0/ABSENT로 표시되도록 NULL-safe해졌다
(`production_v3_50_baseline_and_post_verify.sql:6-12`). **단, BLOCK
B-2만은 예외다** — `select town_level_for_stars(0), ...` 형태는
Postgres가 파싱 시점에 함수 존재를 확인하므로 CASE/COALESCE로 감싸도
함수가 없으면 42883이 나며, 이는 **적용 전에 실행하면 정상적으로
나는 에러**다(`production_v3_50_baseline_and_post_verify.sql:140-143`).
따라서 BLOCK B-2는 반드시 **적용 후(POST)에만** 실행한다(4절 E 순서
참고).
