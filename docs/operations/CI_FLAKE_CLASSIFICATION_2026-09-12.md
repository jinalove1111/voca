# CI Flake Classification — 2026-09-12

## 배경

Release Gate(`.github/workflows/release-gate.yml`, job `release-gate`,
`timeout-minutes: 20`)가 실제로는 18.5~20분이 걸린다(Gate 2 `verify:all`
10.2~11.5분 + Gate 3 3~4분 + Gate 5 E2E ~4분). 지난 24시간 CI 이력을 실행
결과 기준으로 4개 클래스로 분류한다.

- `TIMEOUT_CAP` — 게이트 전부 그린인데 20분 캡에 걸려 워크플로가 취소됨
  (앱/테스트 버그 아님, 타임아웃 여유 부족).
- `TRANSIENT_SUPABASE_504` — 라이브 Supabase를 때리는 하네스 스크립트가
  게이트웨이 타임아웃/5xx로 실패했다가 동일 코드로 재실행하면 통과.
- `PREEXISTING_EXTRA_FAIL` — `extra:true`(13개 필수 도메인 밖) 스크립트의
  기존에 알려진 실패로, 도메인 판정에는 영향 없음(required가 아님).
- `PASS` — 게이트 전부 그린으로 정상 완료.

## 사건 표

| Run ID | Class | Evidence | Mitigation |
|---|---|---|---|
| 34630202665 (main 8837d75, attempt 1) | TIMEOUT_CAP | 모든 게이트 로그가 실패 없이 진행 중 20분 시점에 워크플로가 취소됨 | `timeout-minutes: 20 → 30` (release-gate.yml) |
| 34642334203 (PR #38, attempt 1) | TIMEOUT_CAP | 상동 — 게이트 그린, 20분 캡 취소 | `timeout-minutes: 20 → 30` |
| 34646093186 (main aa89e43, attempt 1) | TIMEOUT_CAP | 상동 — 게이트 그린, 20분 캡 취소 | `timeout-minutes: 20 → 30` |
| 34677106528 | TRANSIENT_SUPABASE_504 | `scripts/testDailyAssignment.mjs`가 첫 라이브 호출에서 uncaught `{ message: 'Gateway Timeout' }` throw로 실패 | 하네스 재시도(`isTransientFailure` / `runWithTransientRetry`, `tests/harness/runDomain.mjs`) |
| 34681887802 (PR #40 head 63149d6, attempt 1) | TRANSIENT_SUPABASE_504 | `scripts/testRlsSecurity.mjs`가 `FAIL [보안] SELECT pin_hash 거부(42501) — {"message":"Gateway Timeout"}`로 실패(assertion 실패 문구가 아니라 라이브 호출 자체의 Gateway Timeout) | 상동 |
| 34681887802 (PR #40 head 63149d6, attempt 2) | TRANSIENT_SUPABASE_504 | 동일 코드로 재실행해도 동일 스크립트가 다시 Gateway Timeout으로 실패 | 상동 (재시도 1회로는 이 attempt 자체는 못 구했지만, 재시도가 없었으면 attempt 2도 즉시 실패였을 위치 — 아래 attempt 3 참고) |
| 34681887802 (PR #40 head 63149d6, attempt 3) | PASS | 코드 무변경 상태로 3번째 재실행에서 통과 — 두 실패가 코드 결함이 아니라 라이브 Supabase 쪽 일시적 5xx/타임아웃이었음을 입증 | 상동 — 이 왕복 재실행 비용(사람이 "Re-run failed jobs"를 2번 누름) 자체를 하네스 내부 자동 재시도로 흡수하는 것이 이번 변경의 목적 |
| 34640484935 | PASS (+ PREEXISTING_EXTRA_FAIL 관찰) | 게이트 자체는 그린. `scripts/testProdCheck.mjs`(`extra:true`)가 `--show-names` INFO 단언에서 실패(CI가 학생 이름을 마스킹하므로 구조적으로 항상 실패) — required 13개 도메인 판정에는 영향 없음 | 아래 "owner decision" 참고 |
| 34676151345 | PASS (+ PREEXISTING_EXTRA_FAIL 관찰) | 상동 — 게이트 그린, `testProdCheck.mjs` extra 실패만 반복 관찰 | 상동 |

## `testProdCheck.mjs --show-names` — owner decision 필요

`scripts/testProdCheck.mjs`는 `extra:true`(13개 필수 도메인 밖)라 이 스크립트
하나의 실패가 도메인 PASS/FAIL 판정을 바꾸지 않는다. 하지만 CI에서 매번
"FAIL"로 표시되는 자체가 노이즈이며, 진짜 회귀와 이 사전에 알려진 실패를
사람이 매번 구분해야 하는 비용이 있다. 이번 변경 범위에서는 이 스크립트/
CI 워크플로를 수정하지 않는다 — 다음 중 하나를 운영자가 결정해야 한다:

1. CI 환경에서만 `--show-names` 관련 INFO 단언을 스킵(마스킹이 CI 기본
   동작임을 스크립트가 인지하게 함).
2. 현재 상태 유지(`extra:true`로 이미 게이트에 영향 없음 — 노이즈만 감수).

## 이번 변경이 다루지 않는 것

- `testProdCheck.mjs` 자체는 무수정(위 owner decision 대기).
- `TRANSIENT_SUPABASE_504` 재시도는 "동일 스크립트를 5초 뒤 정확히 1회만"
  재시도한다 — 무한 재시도가 아니며, 일반 assertion 실패(`AssertionError`,
  `총 N개 단언 중 실패 M개` 등)는 절대 재시도하지 않는다
  (`scripts/testHarnessTransientRetry.mjs` 회귀 참고).
