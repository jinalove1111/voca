# v3_31 — examples.source_meta(예문 출처 메타) 마이그레이션 패키지 (미실행)

본 마이그레이션(03)은 저장소 루트의 `supabase_v3_31_examples_source_meta.sql`
이다(additive jsonb 컬럼 1개, 멱등). 이 폴더는 그 실행 전후 절차를 담는다.

| 순서 | 파일 | 성격 |
|---|---|---|
| 1 | `01_precheck.sql` | SELECT 전용 — 컬럼 부재/기준 행 수/GRANT 전제 확인 |
| 2 | (02_backup 불필요) | additive 컬럼 추가는 기존 데이터를 변경하지 않음 — 01의 행 수 기록이 기준값 |
| 3 | `../../supabase_v3_31_examples_source_meta.sql` | ALTER(add column if not exists) |
| 4 | `04_verify.sql` | SELECT 전용 — 컬럼 존재/행 수 동일/권한 확인 |
| 5 | (문제 시) `05_rollback.sql` | 정책상 컬럼은 제거하지 않음(훅 강제) — 값 초기화(주석 해제식) 또는 무조치 문서 |

실행 타이밍 자유 — 코드는 컬럼 유무 양쪽에서 정상(42703 폴백). 실행 후
본문 가져오기로 예문을 저장하면 `{origin, sentence_index}` provenance가
기록되기 시작한다.
