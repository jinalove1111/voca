# Star Shop(Town Shop V1 + Legacy Baseline v2) 배포 전 패키지

_작성 2026-09-06. 운영자 결재용 — **이 문서가 다루는 SQL/코드는 전부 아직
실행/가동되지 않았다.** 아래 "0) 현재 상태"를 먼저 확인할 것. 조사는
READ-ONLY(anon key GET/HEAD)로만 수행했고, Production에 대한 WRITE는
0건, SQL 실행도 0건이다._

---

## 0) 현재 상태

> **2026-09-08 갱신(116차, superseding note — 아래 표/115차 note 원문은
> 삭제하지 않고 그대로 둔다)**: 별(⭐)이 상점에서 소비되는 화폐라는 전제
> 자체가 폐기됐다. 운영자 승인(2026-09-08)에 따라 `supabase_v3_47_
> town_shop.sql`이 만든 별 기반 차감 RPC(`purchase_town_item`/
> `get_town_shop_state`)는 신규 `supabase_v3_49_paul_dollar.sql`이 완전히
> 교체한다 — ⭐ 별은 이제 `reward_totals` 누적 성취값으로 **절대
> 감소하지 않고**, 상점 구매는 신규 2차 화폐 💵 폴달러(`dollar_ledger`
> 원장, `reward_ledger` 지급 시 트리거로 1★=$1 자동 적립, 컷오버 시점
> 레거시 별 소급 환산 없음 — 전 학생 $0에서 시작)만 소비한다. 아래 표의
> `supabase_v3_47_town_shop.sql`/`supabase_v3_48_reward_legacy_
> baseline_v2.sql` 행은 여전히 유효(순서상 v3_49보다 먼저 실행)하지만,
> 실행 순서 마지막에 v3_49가 추가된다: v3_47 → v3_48 → (코드 배포) →
> **v3_49** → post-verify → `townShopV1` ON 결정. 상세는 이 문서 맨 아래
> 신규 §12 "Paul Dollar v3_49", `handoff.md` 2026-09-08(116차) 참고.
>
> **2026-09-07 갱신(115차, superseding note — 아래 표 원문은 삭제하지
> 않고 그대로 둔다)**: 아래 표의 `supabase_v3_48_reward_legacy_
> baseline_v2.sql` 행이 설명하는 "2026-09-06 하드닝 — EXACT/BOUNDED
> 가드"판은 **레이스 컨디션(클라이언트 `total_stars` 업로드 시각과 서버
> 원장 INSERT 시각의 비동기 간극에 의한 이중 계상/누락)이 있는 것으로
> 밝혀져 폐기**됐다. v3_48은 학생별 `reconcile_legacy_baseline` RPC
> 방식으로 전면 재설계됐고(SQL 실행 자체는 학생별 원장 행을 0건
> 삽입하고, 정산은 각 학생의 다음 로그인 시점에 분산된다), 이 재설계는
> 이미 아래 7절("per-student reconcile 규칙(v3_48, 2026-09-07
> 전면 재설계)")에 반영돼 있다. 배경/레이스 증명 전문은
> `handoff.md` 2026-09-07(115차) 참고. 아래 표는 여전히 **미실행**
> 상태를 정확히 반영하지만 "EXACT/BOUNDED 가드 추가"라는 설계 설명
> 자체는 옛 버전 기준이다.

| 항목 | 상태 |
|---|---|
| 코드(서버 `api/grant-xp.js` 액션 2개, 클라이언트 `townShop.js`/`useTownShop.js`/`PaulTown.jsx`/`Dashboard.jsx`) | **구현 완료, 커밋 0**(`.ai-status/implementer-star-shop-phase1-2026-09-06.json` 참고) |
| 기능 플래그 `townShopV1`(`src/config/features.js`) | **`false`(OFF)** — ON 전까지 UI/네트워크 호출 0 |
| `supabase_v3_47_town_shop.sql` / `_ROLLBACK.sql` | 파일 작성 완료, **미실행** |
| `supabase_v3_48_reward_legacy_baseline_v2.sql` / `_ROLLBACK.sql` | 파일 작성 완료(2026-09-06 하드닝 — EXACT/BOUNDED 가드 추가), **미실행** |
| `supabase_v3_37_reward_legacy_baseline.sql`(v1) | **이미 실행됨**(v3_48이 전제로 삼는 선행 조건, marker `v3_37_reward_legacy_baseline` 존재 확인됨 — `handoff.md` 근거) |
| READ-ONLY 프리플라이트/드라이런/정적 테스트 3종(`scripts/preflightTownShop.mjs`, `scripts/dryRunBaselineV2.mjs`, `scripts/testBaselineV2Sql.mjs`) | **신규 작성, 실행 확인 완료**(전부 PASS, 본 문서 4절 참고) |
| Phase 2(레거시 6개 클라이언트 지급 경로의 서버 기록화) | **구현 완료, 커밋 0**(2026-09-06 추가 세션 — `rewardEngine.js` 레거시 6종 화이트리스트/`REWARD_DAILY_CAP`/`WORD_SLUG_TOKEN_RE` 확장, `api/grant-xp.js` reward 분기 배선, `useStudent.js`/`wordLibrary.js` 재시도 큐. 13경로 중 12개 서버 기록, `pronunciation-unidentified`만 의도적 클라이언트 전용 유지). 신규 테스트 6종 전부 PASS(아래 1절 목록). **여전히 미실행/미배포**: 코드는 커밋되지 않았고 `townShopV1=false`이며, v3_48 실행 자체도 아직 이 문서 §2 순서대로 대기 중 — 이 상태에서는 여전히 `available`이 실제 획득의 일부만 반영한다(2026-09-06 실측 약 20.8%). 상세: `handoff.md` 2026-09-06(114차) |

**요약: 코드/SQL/테스트는 준비됐지만 SQL 실행·플래그 ON·QA 실측 전까지는
학생에게 어떤 영향도 없다.**

---

## 1) 포함 파일 목록

> **2026-09-07 갱신(115차, superseding note)**: 아래 표의 파일명 자체는
> 그대로 유효하지만, `supabase_v3_48_reward_legacy_baseline_v2.sql`(전역
> T 스냅샷 → 학생별 reconcile RPC로 전면 재작성) / `scripts/lib/
> baselineV2Guards.mjs`(가드 상수가 옛 `candidate_count`/
> `total_delta_sum`/`max_individual`/`progress_rows` 4종에서 새
> `TOLERANCE`/`MAX_INDIVIDUAL`/`SNAPSHOT_SLACK`/`SNAPSHOT_MAX` 4종으로
> 전면 교체 — 상태 **PROPOSED_OPERATOR_VALUES**: TOLERANCE=100 /
> MAX_INDIVIDUAL=1500 / SNAPSHOT_SLACK=200은 제안값이며 Production 승인
> 완료가 아님, v3_48 실행 전 운영자 최종 확인 필요) /
> `scripts/testBaselineV2Sql.mjs`(정적 33+시뮬레이션 11 →
> 83단언, 재작성) 세 파일의 **내용**이 바뀌었다. 또한 이 표에는 없던
> 신규 테스트 스크립트 2개가 추가됐다: `scripts/testCutoverReconcile.mjs`
> (서버측 fence, 63단언)/`scripts/testCutoverClient.mjs`(클라이언트측
> fence, `useStudent.js` reconcile effect, 52단언). 상세는 `TESTING.md`
> 2026-09-07(115차) 섹션, `handoff.md` 2026-09-07(115차).

| 파일 | 역할 |
|---|---|
| `supabase_v3_47_town_shop.sql` | Town Shop V1: `town_items`(카탈로그)/`star_purchases`(구매 이력) + `purchase_town_item`/`get_town_shop_state` RPC(service_role 전용) |
| `supabase_v3_47_town_shop_ROLLBACK.sql` | v3_47 되돌리기(기존 검토 완료 — 이번 작업 범위 밖, 손대지 않음) |
| `supabase_v3_48_reward_legacy_baseline_v2.sql` | 레거시 `total_stars` vs 서버 원장(`reward_totals`) 괴리를 통제된 방식으로 원장에 1회 이관(EXACT/BOUNDED 가드 포함, 2026-09-06 하드닝) |
| `supabase_v3_48_reward_legacy_baseline_v2_ROLLBACK.sql` | v3_48이 심은 v2 baseline 행/검토 행/marker만 정확히 되돌림(v1 행·실제 보상 행 무변경) |
| `scripts/preflightTownShop.mjs`(신규) | READ-ONLY(anon GET/HEAD) 배포 전후 상태 확인, `--expect pre\|post-v3_47\|post-v3_48` |
| `scripts/dryRunBaselineV2.mjs`(하드닝) | v3_48 실행 결과를 클라이언트 미러 근사치로 사전 시뮬레이션 + BOUNDED 가드 PASS/FAIL 사전 표시 |
| `scripts/lib/baselineV2Guards.mjs`(신규) | SQL의 가드 상수(EXACT 계산 제외 BOUNDED 4종)를 JS 쪽 단일 진실 원천으로 export, SQL과 리터럴 동기화 대상 |
| `scripts/testBaselineV2Sql.mjs`(신규) | v3_48 SQL 정적 단언 + 인메모리 이중 실행 시뮬레이션(가드 실패/성공 양쪽 경로 포함), 네트워크 0 |

**Phase 2(레거시 지급 서버화) 테스트 스크립트(2026-09-06 추가, 전부 신규, 네트워크 0)**: `scripts/testTownShop.mjs`(75단언, 상점 클라이언트 순수/정적/SSR) · `scripts/testTownShopServer.mjs`(47단언, `api/grant-xp.js` 신규 action 계약) · `scripts/testLegacyRewardServer.mjs`(122단언, 레거시 6종 서버 e2e) · `scripts/testLegacyGrantCoverage.mjs`(60단언, `grantReward`/`grantSticker` 클라이언트 배선) · `scripts/testRewardPostQueue.mjs`(49단언, 내구성 재시도 큐) — 상세는 `TESTING.md` 2026-09-06(114차) 섹션, `handoff.md` 2026-09-06(114차).

---

## 2) 실행 순서

_2026-09-07 갱신 — `supabase_v3_48_reward_legacy_baseline_v2.sql`이 전역
1회성 스냅샷 방식에서 **per-student reconcile RPC** 방식으로 전면
재설계됐다(아래 7절 "왜 전역 BOUNDED 가드를 폐기했는가" 참고). 이에 따라
"Phase 2를 먼저 끝낼지 v3_48을 먼저 실행할지"를 고민하던 옛 5번 항목이
사라졌다 — Phase 2(레거시 지급 서버화)와 reconcile 클라이언트(재시도 큐
드레인 + RPC 호출)가 모두 "코드 배포" 한 단계 안에 포함되고, v3_48 SQL
자체는 설치만 할 뿐 학생별 정산은 그 이후 각자의 로그인 시점에 분산되어
일어난다._

1. **코드 배포(플래그 OFF, reconcile 클라이언트 포함)** — Town Shop
   UI/RPC 배선 + Phase 2(레거시 지급 서버화) + reconcile 클라이언트(로컬
   reward 재시도 큐를 드레인하고, 그 순간의 `total_stars` 스냅샷으로
   `reconcile_legacy_baseline` RPC를 호출하는 로직)까지 전부 이 한
   단계에서 배포한다. `townShopV1=false`라 Town Shop UI/네트워크 호출은
   0이지만, reconcile 클라이언트는 플래그와 무관하게 학생 로그인 시
   동작한다(별 정산은 상점 기능이 아니라 원장 정합성 문제이므로
   `townShopV1` 게이트 밖에 둔다 — 학생에게 보이는 변화는 없음, 3절
   "단계별 기대 delta" 참고).
2. **READ-ONLY 프리플라이트(pre)** — `node scripts/preflightTownShop.mjs --expect pre`
   (2026-09-06 실행 결과 PASS=3 FAIL=0 SKIP=1, 본 문서 4절).
3. **`supabase_v3_47_town_shop.sql` 실행**(운영자, Supabase 대시보드 SQL
   Editor). 실행 후 파일 하단 "실행 후 확인" 블록의 SELECT 3종을 직접
   확인.
4. **post-verify** — `node scripts/preflightTownShop.mjs --expect post-v3_47`
   + 파일 하단 SELECT 스니펫(shop-lamp 1행 price=60, `star_purchases`
   anon 42501/401 등).
5. **`supabase_v3_48_reward_legacy_baseline_v2.sql` 실행**(운영자) —
   **함수(`reconcile_legacy_baseline`) + 뷰(`reward_baseline_v2_status`)
   + 감사용 cutover marker 1행만 설치한다. 이 SQL 실행 자체는 학생별
   원장 행을 단 1건도 삽입하지 않는다** — EXACT 전제조건(v3_37 marker/
   필수 테이블 3개/`reward_totals` 0행 아님)만 확인하고 즉시 끝난다.
6. **학생들이 다음 로그인 시 스스로 정산한다** — 배포된 reconcile
   클라이언트가 각 학생의 다음 로그인마다 `reconcile_legacy_baseline`을
   1회 호출해 `reward_ledger`에 `source_id='v2'` 행을 학생별로 최대 1건씩
   점진적으로 채운다(전체 학생이 동시에 채워지지 않는다 — 로그인
   빈도만큼 시간이 걸린다). 운영자는 아래로 모니터링한다:
   - **진행 상황**: `select * from reward_baseline_v2_status;`
     (`reconciled_students`/`nothing_students`/`baseline_total`/
     `review_rows`가 시간이 지나며 자연스럽게 늘어난다).
   - **review로 빠진 학생(자동 반영되지 않음, SELECT-only, 운영자가
     검토용으로만 실행)**:
     ```sql
     select student_id, total_stars as snapshot, ledger_earned, delta, plausible_max, created_at
       from reward_baseline_review
      where migration_name = 'v3_48_reward_legacy_baseline_v2'
      order by created_at desc;
     ```
   - review 행을 수동으로 원장에 반영하려면(신중하게 검토한 뒤에만),
     아래 INSERT 템플릿을 참고 — **이 문서는 이 문장을 실행하지 않는다
     (NOT EXECUTED, 값은 운영자가 직접 채워 SQL Editor에서 판단 후
     실행)**:
     ```sql
     insert into reward_ledger (student_id, reward_type, source_type, source_id, stars_delta, xp_delta, idempotency_key, created_at)
     values ('<student_id>', 'legacy-baseline', 'migration', 'v2', <운영자가 검토해 확정한 값>, 0, '<student_id>:legacy-baseline:migration:v2', now())
     on conflict (idempotency_key) do nothing;
     ```
7. **QA/TEST 계정으로만 구매 실측**(Cookie/Paul 계정, 실학생 절대 사용
   금지) — QA 계정으로 먼저 로그인해 reconcile이 정상 완료(`reconciled`
   또는 `nothing_to_reconcile`)되는지 확인한 뒤, `townShopV1`을 그
   브라우저에서만 로컬로 켜고(아래 6절 기기 로컬 플래그 주의) 실제 구매
   플로우 1회 수행.
8. **영속성/재로그인 검증** — 구매 후 새로고침·재로그인해도 소유 아이템/
   잔액이 서버 값(`get_town_shop_state`)과 일치하는지, 그리고 재로그인
   시 reconcile이 `already_reconciled`로 조용히 종료되는지(중복 정산
   없음) 확인.
9. **위 전부 통과 후에만** `townShopV1: true`로 배포(전체 학생 대상 ON).
   이 시점에 아직 로그인하지 않아 reconcile이 안 된 학생이 있어도
   안전하다 — `get_town_shop_state`가 `reward_totals`(reconcile 완료분만
   반영)를 그대로 쓰므로, 그 학생은 로그인 후 정산되기 전까지 잔액이
   실제보다 낮게 보일 뿐 크래시/오류는 없다(다음 로그인 시 자연 해소).

---

## 3) 단계별 기대 delta

> **2026-09-07 갱신(115차, superseding note)**: 아래 표의 "v3_48 실행"
> 행은 옛 전역 스냅샷 설계 기준이라 **더 이상 정확하지 않다.** 새
> 설계에서는 `supabase_v3_48_reward_legacy_baseline_v2.sql` **실행 자체는
> `reward_ledger`/`reward_baseline_review`에 학생별 원장 행을 단 1건도
> 삽입하지 않는다**(함수 `reconcile_legacy_baseline`/뷰 `reward_
> baseline_v2_status`/감사용 cutover marker 1행만 설치). "최대
> candidate_count건 신규 삽입(~24건 예상)"은 SQL 실행 시점이 아니라 그
> 이후 **학생들이 각자 로그인할 때마다 점진적으로** 일어난다 — 위 2절
> 갱신된 6번 단계와 `reward_baseline_v2_status` 뷰로 진행 상황을
> 모니터링한다. 상세는 `handoff.md` 2026-09-07(115차).

| 단계 | 무엇이 바뀌는가 | 학생에게 보이는 변화 |
|---|---|---|
| 코드 배포(플래그 OFF) | 번들 크기만 증가 | 없음 |
| v3_47 실행 | `town_items` 1행(shop-lamp), `star_purchases` 0행, RPC 2개 신규 | 없음(아무도 호출 안 함) |
| v3_48 실행 | `reward_ledger`에 legacy-baseline `source_id='v2'` 행 최대 candidate_count건 신규 삽입(2026-09-06 스냅샷 기준 예상 ~24건), `reward_baseline_review`에 review_count건(현재 스냅샷 0건 예상) | 없음(`total_stars` 표시값 불변 — 원장만 보정) |
| QA 계정 구매 1건 | `star_purchases` 1행(QA 학생), RPC 호출 로그 | QA 계정 화면에서만 램프 보유 상태 변화 |
| `townShopV1` ON | 없음(DB 변경 없음, 순수 클라이언트 플래그) | 전체 학생이 상점 UI를 보게 됨 |

---

## 4) must_not_change 목록 + 실측 (2026-09-06, READ-ONLY)

> **2026-09-07 갱신(115차, superseding note)**: 이 절 전체(`--expect
> pre` 결과, `dryRunBaselineV2.mjs` 최초 실행 결과, `testBaselineV2Sql.
> mjs` 정적 33+시뮬레이션 11 결과)는 **폐기된 전역 T 스냅샷 설계 +
> 최초(결함 있는) dry-run 프록시** 기준이다. 최초 프록시(`earned ≈
> client rewardLedger mirror`만 사용)는 v1 baseline 몫을 반영하지 못해
> 아래 "BOUNDED 가드" 수치(candidates=24 등)가 우연히 낮게 나왔을 뿐,
> 같은 결함이 있는 상태로 다시 계산하면 `review`가 187명 중 60명(32%)
> 까지 치솟는 것이 이후 확인됐다(프록시 결함, per-student 규칙 자체의
> 결함 아님). **보정된 프록시(v1 baseline 몫 역산 반영)로 재계산한 결과:
> reconciled 24 / nothing_to_reconcile 163 / review 0 / 실학생 총
> 1,835명**(우연히 reconciled 건수는 24로 같지만 total delta는 다름 —
> 아래 옛 수치 1998과 재계산 프록시는 다른 계산식이다). `testBaselineV2
> Sql.mjs`는 학생별 RPC 설계에 맞춰 83단언으로 전면 재작성됐다(SQL 실행
> 0은 동일하게 유지). 상세: `TESTING.md`/`handoff.md` 2026-09-07(115차).

`scripts/preflightTownShop.mjs`가 매 단계 자동으로 스냅샷을 남긴다
(`scripts/.tmp/preflight-<mode>-<timestamp>.json`). 아래 4개 카운트는
v3_47/v3_48/Town Shop 어떤 단계를 실행해도 **절대 변하면 안 된다**(둘 다
순수 추가 테이블/원장 INSERT일 뿐 기존 테이블을 갱신하지 않으므로):

| 카운트 | 2026-09-06 `--expect pre` 실측값 |
|---|---|
| `students` | 493 |
| `student_progress` | 193 |
| `xp_ledger` | 608 |
| `words` | 1975 |

**`--expect pre` 실행 결과(2026-09-06, 오늘 실제로 아무것도 배포되지
않은 상태 — PASS 기대대로 PASS)**:

```
PASS  town_items 테이블 부재(404/42P01/PGRST205) — status=404 code=PGRST205
PASS  star_purchases 테이블 부재(404/42P01/PGRST205) — status=404 code=PGRST205
SKIP  purchase_town_item/get_town_shop_state RPC 존재 확인 — OpenAPI 루트가 anon에 401(secret key 전용) — RPC를 직접 호출하지 않으므로 SKIP
PASS  must_not_change 카운트 4종 조회 성공
요약: PASS=3 FAIL=0 SKIP=1
```

**`scripts/dryRunBaselineV2.mjs` 실행 결과(2026-09-06, 클라이언트 미러
근사 프록시 — 정확한 서버 원장 값 아님)**:

```
baseline 대상 학생 수(delta_est>0): 24 / 실학생 전체 187
baseline 총액(delta_est 합계): 1998
음수 baseline 개수: 0   duplicate: 0   sum-check 실패: 0
EXACT 가드(참고): negative=0 PASS, duplicate=0 PASS, mismatch=0 PASS
BOUNDED 가드: candidates=24∈[5,80] PASS / total=1998∈[500,24000] PASS /
              maxIndividual=277≤1500 PASS / progressRows=193∈[150,500] PASS
종합: PASS
```

**`scripts/testBaselineV2Sql.mjs` 실행 결과(정적 단언 33개 + 인메모리
시뮬레이션 11개 시나리오, 네트워크 0)**: 전체 PASS(0 FAIL) — 본 문서
5절 하단 "검증 내역" 참고.

---

## 5) 롤백 조건 + 사용할 롤백 파일

| 증상 | 원인 단계 | 롤백 파일 |
|---|---|---|
| `town_items`/`star_purchases`/RPC 관련 오류, 카탈로그 가격 이상 | v3_47 | `supabase_v3_47_town_shop_ROLLBACK.sql` |
| `reward_ledger`에 이상 baseline 행(음수/중복/과다), `reward_migration_log` marker는 있는데 `reward_baseline_review`가 예상과 다름 | v3_48 | `supabase_v3_48_reward_legacy_baseline_v2_ROLLBACK.sql`(STAGE 0으로 먼저 현재 상태 확인 후 STAGE 1 실행 — 파일 내 주석 순서 그대로 따를 것) |
| v3_48 SQL 자체가 **RAISE EXCEPTION으로 실행 중 중단** | 가드 위반(EXACT 또는 BOUNDED) | **롤백 파일 불필요** — `BEGIN`/`COMMIT`으로 감싸져 있어 EXCEPTION 시 트랜잭션 전체가 자동 ROLLBACK된다(부분 삽입 없음). NOTICE로 출력된 측정값을 보고 "정상적인 학습 증가"인지 "구조적 이상"인지부터 판단할 것(7절) |
| QA 구매 후 영속성 불일치(재로그인 시 소유 아이템 사라짐 등) | 클라이언트 캐시/RPC 응답 처리 버그 | SQL 롤백 대상 아님 — 코드 결함이므로 `townShopV1` OFF로 즉시 되돌리고 원인 조사 |

---

## 6) 기능 플래그 활성화 계획(기기 로컬 플래그 주의)

`src/config/features.js`는 플래그를 브라우저 `localStorage`
(`paulEasyVoca_features`)에 저장한다. 이미 어떤 시점에 관리자 화면에서
플래그를 저장한 적이 있는 기기는, 서버 배포로 기본값을 바꿔도 그 기기의
`localStorage` 스냅샷이 우선 적용돼 여전히 OFF로 보일 수 있다(기존
`paulTownBuildings` 항목에 이미 문서화된 동일 한계, 파일 내 주석 참고).

권장 순서:
1. 코드 배포 시점에는 `townShopV1: false`(기본값)로 유지.
2. QA 실측 단계에서는 **QA 계정이 로그인하는 그 브라우저/기기에서만**
   관리자 플래그 패널로 로컬 override를 켠다(전역 배포 아님).
3. 최종 ON 전환 시 `features.js`의 기본값을 `true`로 바꾸는 커밋을
   별도로 만든다 — 이미 플래그를 만져본 적 있는 소수 기기는 여전히
   수동 재설정이 필요할 수 있음을 감안한다.

---

## 7) per-student reconcile 규칙(v3_48, 2026-09-07 전면 재설계)

### 왜 전역 BOUNDED 가드를 폐기했는가(레이스 컨디션)

2026-09-06 하드닝판은 마이그레이션 실행 시각 T 한 번에 전체 학생을
순회하며 `delta = student_progress.total_stars(T) − reward_totals.
earned_stars(T)`를 계산해 원장에 심었다. 그런데 클라이언트는 별을 번 뒤
~2초 디바운스를 거쳐 `total_stars`를 업로드하고, 서버 원장(`reward_
ledger`) 행은 그 지급 POST가 도착한 시점(또는 재시도 큐를 통해 그보다
한참 뒤)에 삽입된다 — "화면에 별이 반영된 시각"과 "서버 원장에 그 별이
기록된 시각" 사이에 신뢰할 수 없는 간극이 있다는 뜻이다. 이 간극 때문에:

- `total_stars` 업로드가 T *이전*, 원장 INSERT가 T *이후*면 → 전역
  스냅샷이 이미 그 별을 baseline으로 잡고, 뒤이은 원장 INSERT가 또 한
  번 더해 **이중 계상**된다.
- 원장 INSERT가 T *이전*, `total_stars` 업로드가 T *이후*면 → 두 계산
  모두 그 별을 놓쳐 **누락**된다.

이 간극은 "타임스탬프를 비교"해서는 메울 수 없다 — `reward_ledger.
source_id`/`student_daily_progress.date`에 들어가는 날짜가 전부
클라이언트 시계 기준이라, 서버가 신뢰할 수 있는 이벤트 시각이 어디에도
없다. 그래서 v3_48은 "모든 학생이 같은 시점 T에 정산된다"는 전역
스냅샷의 전제 자체를 버리고, **학생마다 자신이 선언한 정지(quiescent)
시점에** 그 학생 한 명만 정산하는 방식(`reconcile_legacy_baseline` RPC)
으로 바꿨다 — 타임스탬프 비교가 전혀 없으므로 레이스 자체가 성립하지
않는다.

### per-student 가드 표

옛 BOUNDED 가드(candidate_count/total_delta_sum/max_individual/
progress_rows — 전체 학생 집단에 대한 사전 집계 상한)는 "한 번에 전체를
계산한다"는 전제에서만 의미가 있었으므로 전부 폐기했다. 대신 매
`reconcile_legacy_baseline` 호출마다 그 학생 1명에게만 적용되는 4개
가드로 대체했다:

| 가드 | 위반 시 | 근거(2026-09-07 실측) |
|---|---|---|
| `p_snapshot_total` ∈ [0, SNAPSHOT_MAX=100000] | `invalid_snapshot` | 스냅샷 자체가 정수 범위를 벗어난 명백한 오염 값을 최소 비용으로 차단 |
| `snapshot ≤ uploaded_total_stars + SNAPSHOT_SLACK(200)` | `review`(원장 미삽입, `reward_baseline_review`에 기록) | 클라이언트 스냅샷이 서버에 이미 반영된 값보다 2초 디바운스로는 설명 안 되는 큰 차이로 앞서면 이상치로 간주 |
| `delta ≤ history_since(v3_37 이후 실제 학습 기록 합) + TOLERANCE(100)` | `review` | history-blob-vs-total_stars 노이즈 실측 p90=57/max=370 — 100은 p90 이상을 통과시키고 극단적 이상치만 review로 보냄 |
| `delta ≤ MAX_INDIVIDUAL(1500)` | `review` | 실측 관측된 학생별 최대 delta 277 + 14일×관측 최대 75별/일≈1,330 여유를 반올림 |

가드를 통과하면 `reward_ledger`에 그 학생의 `source_id='v2'` 행이
정확히 1건 삽입되고(`ok=true, reason='reconciled'`), 이미 삽입돼 있으면
재호출은 즉시 `already_reconciled`로 종료된다(타임스탬프 비교 없이
"이미 존재하는가"만 확인) — 옛 postcheck(`inserted+review==candidates`)
같은 전역 카운트 대조는 애초에 "전체 후보 집합"이 존재하지 않는 설계라
필요 없다. 학생 존재 확인(`student_not_found`)과 EXACT 전제조건(v3_37
marker/필수 테이블 3개/`reward_totals` 0행 아님, SQL 설치 시점 1회
확인)은 여전히 유지된다.

가드 상수는 `scripts/lib/baselineV2Guards.mjs`와 SQL(함수 DECLARE 절)
리터럴이 반드시 일치해야 하며, `scripts/testBaselineV2Sql.mjs`(C절)가
이를 정적으로 대조한다.

---

## 8) 열린 결정 (운영자 확인 필요)

> **2026-09-07 갱신(115차, superseding note)**: 아래 1·2번 항목은 폐기된
> 전역 스냅샷 설계 기준으로 작성됐다. **1번은 위 2절 갱신된 순서로 이미
> 답이 정해졌다** — Phase 2(레거시 서버화)와 reconcile 클라이언트가 모두
> "코드 배포" 한 단계에 함께 포함되고, v3_48 SQL 자체는 설치만 할 뿐
> 정산은 각 학생의 로그인 시점에 분산된다(더 이상 "먼저/나중" 순서
> 문제가 아니다). **2번의 "BOUNDED 가드"는 더 이상 존재하지 않는다** —
> 대신 학생별 `TOLERANCE`/`MAX_INDIVIDUAL`/`SNAPSHOT_SLACK`/
> `SNAPSHOT_MAX` 4개 상수(2026-09-07 실측 근거, 위 7절 표)가 매 reconcile
> 호출마다 개별 적용된다. 이 상수들이 "2026-09-07 시점 실측"에 기반하므로
> — 옛 BOUNDED 가드의 "2주 이상 미루면 재확인" 취지는 여전히 유효하다:
> reconcile이 아주 오랜 기간(수개월) 미뤄지면 history 노이즈 분포가
> 달라졌을 수 있어 `TOLERANCE`/`MAX_INDIVIDUAL` 재실측이 필요할 수
> 있다. 3·4번 항목은 여전히 유효하며 변경 없음. 상세: `handoff.md`
> 2026-09-07(115차) "잔여"/"다음 세션 주의".
>
> **2026-09-07 정정(독립 리뷰, 위 문단 대체 아님 — 다기기 잔여 리스크
> 범위 확장)**: 로그인 시 배경 병합 복원 effect(`useStudent.js`,
> `fetchFullProgress` → `mergeProgressRecords` → `totalStars =
> max(local, cloud)`)가 매번 실행되므로, 다른 기기 B가 과거 언제든
> 클라우드에 올려둔 `total_stars`에 B의 미전송 지급(예: 토큰 없는 구
> 세션이라 `unauthorized`로 큐에 남은 POST)이 포함돼 있으면 기기 A의
> reconcile 스냅샷에도 포함된다 → 이후 B가 재로그인해 큐를 flush하면
> 그 별이 이중 계산될 수 있다(학생당 1회성, 크기 = B의 미전송 별 수, B가
> 동시에 켜져 있을 필요 없음). 이벤트 시각을 서버가 신뢰할 수 없어
> 구조적으로 제거 불가. **수용 근거**: 반대 방향(스냅샷에서 병합분
> 제외)은 정당한 레거시 별을 영구 누락시키므로 더 나쁘다. **완화**:
> 재로그인 필수 정책으로 토큰 없는 세션이 소멸할수록 창이 줄어든다.
> 운영자 모니터링: `reward_baseline_v2_status` 뷰 + `reward_baseline_
> review` 테이블로 이상치 감시. 임의 dedup 추가 금지 — 문서화된 수용
> 사항이다. 상세: `handoff.md` 2026-09-07(115차) "잔여".

1. **Phase 2(레거시 7경로 서버 기록화) 순서** — v3_48을 먼저 실행하고
   Phase 2는 나중에 해도 안전한가, 아니면 Phase 2를 먼저 마쳐야 하는가?
   (지금 순서대로 진행해도 크래시는 없지만, v3_48 실행 이후 신규로
   쌓이는 레거시 delta는 다음 baseline 이관 전까지 원장에 반영되지 않는
   한계가 남는다.)
2. **BOUNDED 가드 상수의 유효기간** — 위 7절 상수는 "2026-09-06 시점
   +14일 학습 드리프트" 가정으로 계산됐다. 이 SQL 실행이 2주 이상
   미뤄지면 실행 직전에 `scripts/dryRunBaselineV2.mjs`를 다시 돌려
   가드가 여전히 여유 있게 통과하는지 재확인이 필요하다(값 자체를 SQL
   실행 없이 미리 늘리고 싶다면 `scripts/lib/baselineV2Guards.mjs` +
   SQL 양쪽을 함께 고치고 `testBaselineV2Sql.mjs`로 동기화 재확인할 것).
3. **`townShopV1` 최종 ON 시점** — 위 6절 기기 로컬 플래그 캐시 문제를
   감안해 "배포 즉시 전원 ON"이 아니라 "기본값만 바꾸고 필요 시 개별
   기기 재설정 안내"로 갈지 결정 필요.
4. **QA 계정 실측 후 롤백 여부** — QA 구매로 생긴 `star_purchases` 1행을
   실서비스 데이터에 남길지, 최종 ON 전에 지울지(현재 계획은 v3_47
   ROLLBACK 파일이 관련 데이터를 정리할 수 있으나, 이 파일은 전체
   되돌리기용이라 QA 1건만 선택 삭제하려면 운영자가 SQL Editor에서
   `delete from star_purchases where student_id = '<QA UUID>'` 형태의
   1회성 SELECT/DELETE를 별도로 판단해야 한다 — 이 문서는 그 문장을
   미리 만들어두지 않는다).

---

## 검증 내역(이 문서 작성 세션, 2026-09-06)

- `node scripts/dryRunBaselineV2.mjs` — PASS(4절 인용).
- `node scripts/preflightTownShop.mjs --expect pre` — PASS=3 FAIL=0 SKIP=1.
- `node scripts/testBaselineV2Sql.mjs` — 정적 단언 33개 + 인메모리 시뮬레이션
  11개 시나리오, 전체 PASS.
- `scripts/hooks/checkDestructiveSql.mjs`를 v3_48 forward/ROLLBACK 두
  파일에 대해 재생(stdin JSON) — 둘 다 exit code 0(파괴적 패턴/무조건부
  DELETE 없음).
- SQL 실행 0건, Production WRITE 0건, git commit 0건.

---

## 12) Paul Dollar v3_49(2026-09-08, 116차) — 2재화 분리

_추가: 2026-09-08(116차). 브랜치 `feat/paul-dollar-v1`, 커밋 0, push 0,
SQL 실행 0. 이 절은 위 0~8절(v3_47/v3_48, 상점 V1 + 레거시 baseline v2)을
전제로 그 뒤에 이어지는 신규 마이그레이션을 다룬다 — 위 절들의 내용을
대체하지 않고 그 위에 얹는다(§0 상단 116차 superseding note 참고)._

### 운영자 승인(2026-09-08)

- **규칙 A**: 컷오버 시점부터 서버 지급 별 1개 = 폴달러 $1(`dollars_per_
  star = 1`, 화이트리스트 12종 전부 동일 배율).
- **폴달러는 $0에서 시작** — 레거시 별(그동안 쌓인 `reward_totals.
  earned_stars`)을 폴달러로 소급 환산해 지급하지 않는다.
- **램프 가격 $60 유지** — `town_items.price`(60) 무변경, 화폐 단위만
  별→폴달러로 전환(`price_currency` 컬럼 신설, 기본값 `'dollars'`).

### 설계 — 두 화폐, 두 개의 진실 원천

- ⭐ 별 = `reward_totals`(변경 없음) 기준 서버 권위 누적 업적, **이 SQL
  이후 절대 감소하지 않는다**(구매가 더 이상 별을 차감하지 않음 — v3_47의
  별 기반 차감 RPC 본문을 이 SQL이 완전히 대체).
- 💵 폴달러 = 신규 `dollar_ledger.dollars_delta`의 합(`dollar_balances`
  파생 뷰, 저장 합계 컬럼 없음 — `reward_totals`/`xp_totals`와 동일
  판단).
- `dollar_rules`(신규, PK `reward_type`) — `src/utils/rewardEngine.js`의
  실제 학습 보상 12종만 시드(`legacy-baseline`은 의도적으로 미시드).
  `on conflict do nothing` — 배율/on-off 조정은 코드 배포 없이 SQL
  `UPDATE dollar_rules SET ...`만으로 가능.
- `trg_reward_ledger_to_dollars`(AFTER INSERT on `reward_ledger`) +
  `fn_reward_ledger_to_dollars()` — 화이트리스트에 있으면 같은 비율로
  폴달러를 자동 지급. 함수 전체를 `EXCEPTION WHEN OTHERS`로 감싸 폴달러
  계산 실패가 원 별 지급(INSERT)을 절대 막지 않는다(CLAUDE.md 규칙 1).
- `town_purchases`(신규 테이블, `star_purchases`와 완전히 분리) — 폴달러
  구매 이력 전용. `star_purchases`(v3_47)는 이 SQL이 전혀 건드리지 않고
  그대로 보존(불변 감사 기록, Paul QA `shop-lamp` 1행 포함). "이미
  보유"는 두 테이블의 UNION으로만 판정(`get_town_shop_state()`).
- `get_town_shop_state(uuid)`/`purchase_town_item(uuid, text)` RPC 2개
  교체(시그니처 동일, 반환 shape 변경 — 폴달러 전용, `total_stars`
  미참조).
- `town_items.price_currency` 컬럼 추가(기본값 `'dollars'`, `check in
  ('stars','dollars')`) — 기존 컬럼 0개 변경, `price`(60) 무변경.

### 구현 파일

- `supabase_v3_49_paul_dollar.sql` / `supabase_v3_49_paul_dollar_
  ROLLBACK.sql`(작성 완료, 미실행).
- `api/grant-xp.js` — `get_town_shop_state`/`purchase_town_item` action
  2개 유지(새 action/새 Vercel 함수 파일 없음), 응답 바디 키만 교체
  (`starsEarned`/`dollarsAvailable`/`dollarsEarned`/`dollarsSpent`,
  `items[].priceCurrency`, `purchase_town_item` → `dollarsSpent`/
  `balanceAfter`). `price_currency` 컬럼 미존재 시 폴백 조회(컬럼 없이
  재조회 후 `priceCurrency:'dollars'` 고정).
- `src/utils/townShop.js` — `shopItemState`/`applyPurchaseResult`(
  `starsEarned` 불변)/`normalizeShopState`(신규 계약 정규화 + 레거시
  응답 흡수)/`formatDollars` 신규 export.
- `src/components/Dashboard.jsx` — `wallet` prop(`App.jsx:733`)이 오면
  ⭐ 누적 배지 + 💵 초록 배지, `wallet===null`(기본, 플래그 OFF)이면
  기존 배지와 byte 단위 동일.
- `src/components/PaulTown.jsx` — 상점 줄 💵 잔액 + `💡 책상 램프 —
  $60` + 구매/부족/구매중/보유 4분기 버튼. ⭐는 상점 UI에 등장하지 않음.
- 새 클라이언트 기능 플래그 추가 없음(`townShopV1`,
  `src/config/features.js:73`, 여전히 `false`가 유일한 노출 게이트).

### 테스트

- `scripts/testPaulDollarSql.mjs`(신규, 정적 `check()` 165개 + 인메모리
  시뮬레이션, 네트워크 0/SQL 실행 0).
- `scripts/testTownShop.mjs`(확장) 75→101, `scripts/testTownShopServer.mjs`
  (확장) 47→65 — 2재화 계약 반영.
- `tests/harness/registry.mjs`에 `testPaulDollarSql` 등록(`extra:false`).
- `npm run verify:paul-dollar` 신설(`testPaulDollarSql.mjs &&
  testTownShopSql.mjs && testTownShopServer.mjs && testTownShop.mjs`).
- `scripts/preflightTownShop.mjs`에 `--expect post-v3_49` 모드 추가.
- 관련 회귀 스위트(`verify:stars`/`verify:reward`/`verify:reward-server`/
  `verify:double-events`/`verify:persistence`/`verify:paul-town-
  progression`/`verify:cutover`/`verify:legacy-reward`) 무회귀. Release
  Gate 최종 판정: **리드가 최종 확인**.
- 상세: `TESTING.md` 2026-09-08(116차) 섹션.

### 배포 순서

1. 코드 배포(플래그 `townShopV1=false` 그대로).
2. `node scripts/preflightTownShop.mjs --expect post-v3_49` — 미적용
   확인.
3. 운영자가 Supabase SQL Editor에서 `supabase_v3_49_paul_dollar.sql`
   실행(v3_47/v3_48 실행 확인 후 1회).
4. Post-verify(운영자 SELECT): `dollar_rules` 12행 / 트리거 1행 / 함수
   3개 `prosecdef=true` / `dollar_ledger` 0행 / `town_purchases` 0행 /
   `star_purchases` 1행 불변.
5. QA(Paul) 계정 실측: 별을 벌어 폴달러가 함께 쌓이는지 → 구매(⭐ 불변 /
   💵 −60) → 재로그인 영속성 확인.
6. 전부 통과 후에만 `townShopV1` ON 결정(별도 승인 사안).

### 롤백

`supabase_v3_49_paul_dollar_ROLLBACK.sql` — 트리거+트리거 함수 제거, RPC
2개를 v3_47의 별 기반 본문으로 원복, `dollar_balances` 뷰 제거,
`dollar_ledger`/`town_purchases`에서 이 마이그레이션이 만든 행만 정확히
WHERE 삭제. 테이블 구조/`dollar_rules` 시드 행/`star_purchases`(전체)는
전부 보존. **⚠️ 롤백 시 별 차감 로직이 부활**하므로 `townShopV1`이 이미
ON 배포돼 있다면 롤백 전 반드시 플래그를 OFF로 내릴 것.

### 잔여 / 알려진 한계

- 폴달러는 컷오버 이후부터만 쌓인다 — Paul QA의 레거시 램프 소유는
  `star_purchases`에 그대로 남아 계속 "보유"로 인정된다.
- 첫 로그인 시 상점 상태 조회가 115차 CUTOVER RACE reconcile보다 먼저
  로드되면, 다음 마운트 전까지 ⭐ 표시가 잠깐 실제보다 낮게 보일 수
  있는 레이스가 있다(P2, 데이터 손실 없음, 다음 마운트에서 자연 교정).

### 다음 세션 주의

- 별을 다시 소비 재화로 쓰지 말 것.
- `dollar_rules` 값 변경은 SQL UPDATE로(코드 배포 불필요).
- `legacy-baseline`은 `dollar_rules`에 절대 추가 금지(레거시 별 소급
  환산 금지 설계가 깨짐).

상세: `handoff.md` 2026-09-08(116차).
