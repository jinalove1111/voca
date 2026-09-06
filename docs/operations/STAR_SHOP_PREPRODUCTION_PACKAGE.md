# Star Shop(Town Shop V1 + Legacy Baseline v2) 배포 전 패키지

_작성 2026-09-06. 운영자 결재용 — **이 문서가 다루는 SQL/코드는 전부 아직
실행/가동되지 않았다.** 아래 "0) 현재 상태"를 먼저 확인할 것. 조사는
READ-ONLY(anon key GET/HEAD)로만 수행했고, Production에 대한 WRITE는
0건, SQL 실행도 0건이다._

---

## 0) 현재 상태

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

1. **코드 배포(플래그 OFF)** — 이미 구현 완료 상태(커밋 대기). 배포돼도
   `townShopV1=false`라 UI/네트워크 호출 0.
2. **READ-ONLY 프리플라이트(pre)** — `node scripts/preflightTownShop.mjs --expect pre`
   (2026-09-06 실행 결과 PASS=3 FAIL=0 SKIP=1, 본 문서 4절).
3. **`supabase_v3_47_town_shop.sql` 실행**(운영자, Supabase 대시보드 SQL
   Editor). 실행 후 파일 하단 "실행 후 확인" 블록의 SELECT 3종을 직접
   확인.
4. **post-verify** — `node scripts/preflightTownShop.mjs --expect post-v3_47`
   + 파일 하단 SELECT 스니펫(shop-lamp 1행 price=60, `star_purchases`
   anon 42501/401 등).
5. **[Phase 2: 레거시 7경로 서버 기록화 — 별도 작업, 미착수]** — 이 단계
   없이 v3_48/Town Shop을 가동해도 안전하지만(크래시 없음), `available`이
   실제 획득의 일부만 반영한다는 한계가 남는다. 운영자가 이 갭을 감수하고
   먼저 진행할지, Phase 2를 먼저 마칠지 결정 필요(8절 "열린 결정" 참고).
6. **`supabase_v3_48_reward_legacy_baseline_v2.sql` 실행**(운영자). 실행
   전 SQL Editor 콘솔에 뜨는 `guard-precheck`/`precheck` NOTICE로
   candidate_count/total_delta_sum/max_individual/progress_rows를 육안
   확인 — 가드 위반 시 RAISE EXCEPTION으로 자동 중단(아무 행도 남지
   않음, 7절 "EXACT vs BOUNDED 가드 표" 참고).
7. **post-verify** — `node scripts/preflightTownShop.mjs --expect post-v3_48`
   (이 스크립트는 `reward_ledger`를 anon으로 직접 읽지 않고, 대신 운영자가
   SQL Editor에서 실행할 SELECT 스니펫을 출력한다) + `reward_migration_log`/
   `reward_baseline_review` 행 수 확인.
8. **QA/TEST 계정으로만 구매 실측**(Cookie/Paul 계정, 실학생 절대 사용
   금지) — `townShopV1`을 QA 계정이 로그인한 그 브라우저에서만 로컬로
   켜고(아래 6절 기기 로컬 플래그 주의) 실제 구매 플로우 1회 수행.
9. **영속성/재로그인 검증** — 구매 후 새로고침·재로그인해도 소유 아이템/
   잔액이 서버 값(`get_town_shop_state`)과 일치하는지 확인.
10. **위 전부 통과 후에만** `townShopV1: true`로 배포(전체 학생 대상 ON).

---

## 3) 단계별 기대 delta

| 단계 | 무엇이 바뀌는가 | 학생에게 보이는 변화 |
|---|---|---|
| 코드 배포(플래그 OFF) | 번들 크기만 증가 | 없음 |
| v3_47 실행 | `town_items` 1행(shop-lamp), `star_purchases` 0행, RPC 2개 신규 | 없음(아무도 호출 안 함) |
| v3_48 실행 | `reward_ledger`에 legacy-baseline `source_id='v2'` 행 최대 candidate_count건 신규 삽입(2026-09-06 스냅샷 기준 예상 ~24건), `reward_baseline_review`에 review_count건(현재 스냅샷 0건 예상) | 없음(`total_stars` 표시값 불변 — 원장만 보정) |
| QA 계정 구매 1건 | `star_purchases` 1행(QA 학생), RPC 호출 로그 | QA 계정 화면에서만 램프 보유 상태 변화 |
| `townShopV1` ON | 없음(DB 변경 없음, 순수 클라이언트 플래그) | 전체 학생이 상점 UI를 보게 됨 |

---

## 4) must_not_change 목록 + 실측 (2026-09-06, READ-ONLY)

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

## 7) EXACT vs BOUNDED 가드 표(v3_48)

| 구분 | 가드 | 위반 시 | 근거 |
|---|---|---|---|
| EXACT | 음수 delta 미삽입 | 구조상 불가능(`CONTINUE WHEN v_delta<=0`) + postcheck 재확인 | `stars_delta<=0` 행이 원장에 있으면 즉시 EXCEPTION |
| EXACT | 중복 키 0건 | `idempotency_key` UNIQUE + postcheck(v2 행수==inserted_count) | 두 값이 다르면 unique 제약 우회 경로가 있다는 뜻 |
| EXACT | v3_37 marker 존재 | RAISE EXCEPTION | v1이 선행돼야 plausible_max 기준점(`v_v1_at`) 확보 가능 |
| EXACT | 4개 테이블 존재(`reward_totals`/`reward_ledger`/`student_progress`/`student_daily_progress`) | RAISE EXCEPTION | 하나라도 없으면 delta 계산 자체가 무의미 |
| EXACT | `reward_totals` 0행 아님 | RAISE EXCEPTION | v1 baseline 유실 오인 시 전원 이중 계상 위험 |
| EXACT | inserted+review==candidates | RAISE EXCEPTION(기존 postcheck) | 부분 처리 방지 |
| BOUNDED | candidate_count ∈ [5, 80] | RAISE EXCEPTION | 실측 24 · 활성 학생 증가로만 커짐 · 43%(80명) 초과는 구조적 이상 |
| BOUNDED | total_delta_sum ∈ [500, 24000] | RAISE EXCEPTION | 실측 1,998 + 활성 ~31명×p75 43별×14일 여유(≈+18,700)≈20,698→24,000 반올림 |
| BOUNDED | max_individual ≤ 1500 | RAISE EXCEPTION | 실측 277 + 14일×관측 최대 75별/일≈1,330→1,500 |
| BOUNDED | student_progress 행 수 ∈ [150, 500] | RAISE EXCEPTION | 모집단 크기 정합성(111명 규모 학생 수 기준) |

BOUNDED 상수는 `scripts/lib/baselineV2Guards.mjs`와 SQL 리터럴이 반드시
일치해야 하며, `scripts/testBaselineV2Sql.mjs`(C절)가 이를 정적으로
대조한다.

---

## 8) 열린 결정 (운영자 확인 필요)

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
