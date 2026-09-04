# 2026-09-04 운영 자동검증 세션 — 문서 인덱스 (109차)

12시간 자율 운영 자동검증 세션(운영자 부재)이 남긴 조사 문서 모음이다.
**이 세션은 Production DB WRITE 0 / SQL 실행 0 / 학생 데이터 변경 0 /
merge 0 / deploy 0 / main push 0**이며, 라이브 접촉은 anon key `GET`/
`HEAD`뿐이다. 세션 전체 서사와 커밋/단언 수는 `handoff.md`
2026-09-04(109차) 섹션이 진실 원천이고, 이 폴더는 그 근거 자료다.

## 이 폴더의 문서 3종

| 문서 | 무엇을 답하나 | 결론 요약 |
|---|---|---|
| [`harness-inventory.md`](./harness-inventory.md) | "지금 있는 프로덕션 안전 하네스는 무엇이고, 각각 어디까지 막아주나?" | 기존 도구 19행을 목적/입력/READ·WRITE/FAIL 조건/자동화/승인 지점/**약점**으로 분해한 표 + V2 재사용 계획 10항. Harness V2(트랙 B/C)의 설계 입력이 된 문서다. |
| [`garden-growth-paths.md`](./garden-growth-paths.md) | "정원 포인트는 어떤 행동에서 오르나? 빠진 게 있나?" | 코드 추적 결과 **BUG 0**. COUNTS 4 / 설계상 의도적 미집계 7 / **제품 결정 필요 3**(복습 큐 해소·입실시험 정답·미니게임 정답). 임의 변경 없음(CLAUDE.md 규칙 12). |
| [`ghost-legacy-inventory.md`](./ghost-legacy-inventory.md) | "유령 유닛/고아 SCA/레거시 필드가 지금 몇 건이고, 안전하게 지울 수 있나?" | 개별 26항목 = DANGEROUS 1 / LIKELY_CLEANUP 6 / REVIEW 8 / SAFE_TO_IGNORE 11. 어젯밤 대비 유일한 실질 변화는 `4fc69e2d`의 SCA 참조 0 → 1. **아무것도 삭제하지 않았다.** |

관련 문서(이 폴더 밖):

- `docs/qa/ops-report/ops-report-latest.md` — 아래 §"보고서 읽는 법" 참고.
- `docs/production-safety-harness-runbook.md` §7~§9 — `prod:check` →
  `prod:plan` → `prod:apply` 실행 절차와 V2 보안 규칙.
- `PROJECT_BOARD.md` BLOCKED 컬럼 — 이 문서들에서 나온 승인 대기 항목.
- `docs/qa/overnight-2026-09-04/` — 하루 전(108차) 세션의 출발점 문서들.
  `ghost-legacy-inventory.md`는 그 문서를 **재작성하지 않고 REFRESH**한
  것이라, 배경이 필요하면 그쪽을 먼저 본다.

## 읽는 순서 추천

1. 지금 프로덕션이 건강한가 → `docs/qa/ops-report/ops-report-latest.md`
   맨 위 "실행 요약" 한 줄.
2. 무엇을 결정해 달라는 건가 → 같은 보고서 맨 아래 "승인 대기열" +
   `PROJECT_BOARD.md` BLOCKED 카드.
3. 그 항목의 배경이 궁금하면 → 위 표에서 해당 문서로.

---

# `ops-report-latest.md` 읽는 법 (스크린샷 없이)

`npm run prod:report`(READ-ONLY)가 만드는 운영 보고서다. 화면 캡처나
관리자 로그인 없이, 이 마크다운 파일 하나만으로 "지금 무엇이 문제이고
누가 결정해야 하는가"를 읽을 수 있게 설계돼 있다. 구조는 **13개 절 고정
순서**다: 실행 요약 → 프로덕션 헬스 → 학생 무결성 → 교재 무결성 → 정원 →
폴 타운 → 보상 → 엑셀 → 보안 → 성능 → 유령/레거시 → 열린 PR → **승인
대기열**.

## 1. 가장 먼저 볼 두 곳

- **맨 위 "1. 실행 요약"의 `상태:` 한 줄** — 전체 판정.
- **맨 아래 "13. 승인 대기열"** — 사람이 실제로 해야 할 일 목록.

가운데 절들은 근거 자료다. 급하면 이 둘만 봐도 된다.

## 2. 상태 enum 4값이 뜻하는 것

`scripts/lib/opsStatus.mjs`의 `STATUS`가 유일한 정의다(나쁜 순서대로):

| 값 | 뜻 | 사람이 할 일 |
|---|---|---|
| `PASS` | 해당 검사에서 문제 없음 | 없음 |
| `WARN` | 구조적으로 이상하지만 **학생 화면/학습은 정상 동작** | 읽고 판단. 자동 차단 대상 아님 |
| `FAIL` | 불변식 위반 — 실사용 영향 가능 | 즉시 조사(게이트가 차단) |
| `BLOCKED_NEEDS_APPROVAL` | 고치려면 **DB 쓰기가 필요**해서 에이전트가 진행할 수 없음 | 운영자 승인 |

두 가지를 헷갈리지 말 것:

- **`WARN`은 절대 배포/게이트를 차단하지 않는다.** 이 저장소의 baseline
  WARN(유령 유닛 참조, primary 유닛 불일치 등)은 이미 알려진 데이터
  부채이고, 학생 화면은 `students.current_unit_id` 경로로 정상 해석된다.
  "WARN이 많다 = 지금 학생이 못 쓴다"가 **아니다**.
- **미상(unknown) 코드는 조용한 `PASS`가 아니라 `WARN`으로 취급한다.**
  검증하지 못한 것을 통과로 위장하지 않기 위한 의도적 설계다
  (`severityToStatus`, CLAUDE.md 규칙 18).

## 3. finding 한 줄 읽는 법

각 표의 행은 다음 필드로 구성된다:

`status` | `entity`(대상, 학생은 **항상 마스킹** `H***`) |
`check_id`(`health:*` = 학생별 체인 판정 / `invariant:*` = 교차 테이블
불변식) | `expected`(정상 상태) | `actual`(실측값) |
`recommended_action`(다음 행동)

`recommended_action`이 `운영자 결정`이면 그 행은 승인 대기열에도 함께
나타난다. `READ-ONLY 조사`면 쓰기 없이 확인만 하면 되는 항목이다.

JSON 형태(`ops-report-latest.json`)에는 마크다운에 없는 필드가 더 있다 —
`entity_id`(UUID), `timestamp`, `environment`, `entity_type`, `severity`,
`source`, `write_required`, `approval_required`. 자동화는 이쪽을 쓴다.

## 4. 승인 대기열(Approval Queue)이란

`write_required === true` **그리고** `approval_required === true`인
finding만 모은 목록이다. 이 저장소에서 두 값은 **항상 같다** — 에이전트가
프로덕션에 자동으로 쓰는 경로가 어디에도 없으므로, "고치려면 쓰기가
필요하다"는 곧 "운영자가 승인해야 한다"는 뜻이다.

이 목록의 항목을 실제로 고치는 절차(보고서는 **보여줄 뿐 아무것도 고치지
않는다**):

1. `npm run prod:plan -- <manifest.json>` — READ-ONLY로 drift/위험도/
   `apply_eligibility` 확인.
2. `npm run prod:apply -- <manifest.json>` — TTY에서 `APPLY <runId>`를
   정확히 입력 + `SUPABASE_ACCESS_TOKEN` 둘 다 있어야만 실제 쓰기가 진행.

`prod:report`는 `scripts/prodHotfix.mjs`를 **소스 레벨에서 import조차
하지 않으므로**, 이 명령을 아무리 돌려도 구조적으로 apply 경로에 도달할
수 없다.

## 5. 이 보고서가 답하지 못하는 것 (정직한 갭)

가짜 집계를 만들지 않기 위해 의도적으로 비워 둔 부분이다:

- **보상/엑셀/보안 절**은 해당 스위트가 아직 `--json`을 지원하지 않아
  **스크립트 이름 나열**만 한다. 실제 실행은 `npm run verify:<도메인>`으로
  따로 해야 한다.
- **정원 절**의 학생별 world stage 분포는 `prod:check`가 `progress_data`를
  로드하지 않아 계산할 수 없다 — 대신 관련 verify 스위트 링크만 제공한다.
- 보고서 맨 끝에는 항상 `DB WRITE: 0`이 찍힌다. **이 줄이 없으면 버그로
  취급하고 실행을 중단할 것.**

## 6. 오프라인/재생성

라이브 조회 없이(네트워크 0) 저장해 둔 JSON으로 보고서만 다시 만들려면:

```
node scripts/prodReport.mjs --from-dir <dir>   # prodcheck.json + health.json 필요
```

과거 실행분은 `docs/qa/ops-report/history/ops-report-<UTC>.{md,json}`에
그대로 남는다. 테스트/실험용으로 생성할 때는 반드시 `--out-dir`로 출력을
격리해 커밋된 `ops-report-latest.*`를 덮어쓰지 않는다
(`DEVELOPER_GUIDE.md` "운영 하네스/산출물 규칙 4가지" 참고).

---

**후속(2026-09-05, 110차)**: 이 하네스 자체의 write drift guard 배선
수정 + 12종 오류탐지 커버리지 12/12 최종 검증(PR #15 merge는 보류)은
`handoff.md` 2026-09-05(110차) 섹션 참고.
