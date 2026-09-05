# Production Safety Harness inventory (Track A, origin/main 2c52a78, READ-ONLY)

| 이름 | 목적 | 입력 | READ/WRITE | FAIL 조건 | 자동화 | 승인 지점 | 약점 |
|---|---|---|---|---|---|---|---|
| scripts/prodCheck.mjs | health+invariants+baseline → verdict | --json --require-env --report-dir --fixture --expect-ref | GET-only(anon) | FAIL 1건 이상 exit 1 | npm prod:check, CI Gate 3b | 없음 | WARN은 절대 차단 안 함; per-check 기계 id 없음; 보고서가 --report-dir에만 남고 중앙 보관 없음 |
| scripts/lib/prodDataLoader.mjs | 스냅샷/learning baseline 로더 | .env | GET/HEAD, 1000/page | INFRA_ERROR | 라이브러리 | — | studentHealthCheck와 select 로직 중복(TODO 통합) |
| scripts/lib/prodInvariants.mjs | 교차 테이블 invariant 26종 | snapshot ctx | 순수 | 항목별 FAIL/WARN | 라이브러리 | — | 상수 수기(UNIT_WORDS_MIN/MAX, Jaccard 0.9); manifest ALLOWLIST와 연결 없음 |
| classifyForUX(prodCheck) | Critical/Needs review/Data debt | 하드코딩 data-debt 집합 | 표시용 | — | 인라인 | — | data-debt 집합 수기 관리 |
| scripts/lib/hotfixManifest.mjs | validate/preflight/postflight/apply·rollback SQL/staticSafetyScan/redact | manifest JSON | 0 IO(SQL 텍스트 생성) | validation errors | 라이브러리 | — | ALLOWLIST UPDATE 전용(students 3컬럼, SCA 3컬럼), INSERT/DELETE/rename 불가 |
| scripts/prodHotfix.mjs | 13단계 fail-closed 오케스트레이터 | manifest --env [--dry-run] | preflight/postflight GET; write는 Management API executor + TTY `APPLY <runId>` + token 필요 | 어느 게이트든 실패 시 STOP | npm prod:hotfix, CI Gate 4(dry-run) | `APPLY <runId>` 정확 입력 | postflight가 set/must_not_change/테이블 해시만 재확인(invariant 재평가 없음); 현장 rollback은 수기 SQL 병행 이력 |
| scripts/lib/sqlExecutor.mjs | 실행기(management-api/dry-run/fake) | ref/token | management-api만 WRITE | non-2xx | 승인 게이트 뒤에서만 | 8단계 | 실제 토큰 없음 → 현장 apply는 SQL Editor 수동(runbook §4) |
| CI 감지 | CI/GITHUB_ACTIONS → 승인 전 STOP | env | — | — | Gate 4가 `DB WRITE: 0` 실증 | — | env 기반(독립 kill switch 아님) |
| manifests: ghost-unit-landing-20260902 | 적용 완료, Gate 4 dry-run 대상 | — | — | preflight-mismatch가 정상 | — | — | **박민준 사례**: 수기 _ROLLBACK.sql 주석 `'Unit'->'Unit5'` vs 실제 pre 'Unit5' — 서술과 expect_before 불일치를 도구가 검사 안 함(handoff 103차) |
| manifests: isanggi-textbook-cleanup-20260903(ops 브랜치) | SCA 8행 | — | — | — | — | — | expect_before 수기 스냅샷 → 라이브 drift로 수기 재편집; 교재/반 rename은 ALLOWLIST 밖(v3_46 SQL, 폐기) |
| manifests: premiddle-primary-textbook-20260904(ops 브랜치) | UPDATE 24 | — | — | — | — | — | INSERT 8은 앱 경로(assignTextbook)로 우회, rollback 2단계 중 DELETE는 수동 |
| scripts/studentHealthCheck.mjs + lib/studentHealthRules.mjs | 학생별 19체크, REAL/TEST/ARCHIVED/QA 분류 | anon | GET-only | 코드별 FAIL | npm health:students, CI Gate 3 | — | 분류가 이름/반 이름 규칙 기반(컬럼 없음); REAL만 게이트 |
| scripts/verifyRelease.mjs + lib/releaseGate.mjs + health/baseline.json | Gate1 build/2 verify:all/3 health-baseline diff | — | GET(Gate3) | 신규 FAIL | CI | — | baseline entries 0(=모든 FAIL 회귀); extractBalancedJson은 stdout 잘림 완화책(근본 원인은 process.exitCode로 수정됨) |
| .github/workflows/release-gate.yml | Gate 1/2/3/3b/4 + Deploy Ready | secrets anon | GET | — | PR/main push | — | 워크플로 실패가 Vercel 배포를 자동 차단하지는 않음(브랜치 보호 설정 필요) |
| tests/harness registry/runAll/runDomain | verify:all | — | — | required 검사 FAIL | CI Gate 2 | — | extra:true FAIL은 exit code 미반영 |
| 회귀 스위트(reward/paul-town/textbook/excel/security/ui) | 순수·번들·phantom-id 프로브 | — | 네트워크 0(security만 phantom 프로브) | 단언 FAIL | verify:all | — | grant-xp 레거시 XP 분기 무인증 KNOWN |

## V2 재사용 계획
1 hotfixManifest.mjs = 단일 진실 원천(expect_before→preflight/apply/rollback/postflight) · 2 invariants findings를 manifest 생성 입력으로 · 3 서술문 lint(자유 텍스트 vs expect_before/set) · 4 SCA INSERT/DELETE 좁은 ALLOWLIST · 5 prod:plan(READ-ONLY, drift/위험도/자격) · 6 prod:report(상태 enum 통일) · 7 로더 통합 · 8 per-check 스키마 · 9 op 변형은 동일 allowlist 규율 · 10 WARN 정책 유지 + --strict 옵션.
