# 운영자 결정 대기 항목 — 2026-09-12

이 문서는 2026-09-12 세션(들)에서 확인된, 운영자 판단이 필요한 항목을
모은 것입니다. 각 항목은 사실 확인만 담고 있으며, "미결정 상태에서 현재
적용 중인 기본값(SAFE DEFAULT)"을 함께 명시합니다.

---

## 1. PR #41 (ci/reliability-2026-09-12) 머지 여부

**QUESTION**: 하네스의 일시적 네트워크 실패 1회 자동 재시도 + Release
Gate timeout을 20분에서 30분으로 늘리는 PR #41을 머지할지.

**WHY IT MATTERS**: 최근 24시간 내 타임아웃으로 인한 하네스 취소가 3건,
Supabase Gateway Timeout으로 인한 실패가 4건 발생했으며, 확인 결과 이
실패들은 코드 회귀가 아니라 네트워크/인프라 일시 지연에 의한 것이었다.
현재 설정(20분, 재시도 없음)이 유지되는 한 같은 유형의 오탐(false
negative) 취소·실패가 반복될 수 있다.

**OPTIONS**:
- 전체 머지(재시도 + timeout 30분 모두 적용)
- timeout 연장만 머지(재시도 로직은 보류)
- 보류(현행 유지)

**RECOMMENDATION**: 전체 머지.

**SAFE DEFAULT**: 미머지 — 현재 Release Gate timeout은 20분이며 하네스에
네트워크 실패 재시도 로직이 없다.

---

## 2. PR #42 (test/lazy-chunk-guards-2026-09-12) 머지 여부

**QUESTION**: lazy 청크 관련 정적 가드 76단언을 추가하는 PR #42를 머지할지.

**WHY IT MATTERS**: 배포마다 lazy 청크 파일명이 재해시되는 이슈(항목 8
참고)와 관련해, 청크 참조 무결성을 정적으로 검증하는 회귀 방지 테스트가
추가된 상태다. 머지되지 않으면 이 76단언은 CI/verify 파이프라인에
포함되지 않는다.

**OPTIONS**:
- 머지
- 보류

**RECOMMENDATION**: 머지.

**SAFE DEFAULT**: 미머지 — 현재 verify 파이프라인에는 해당 76단언이
포함되어 있지 않다.

---

## 3. Safe Hooks v1 구현 차단 처리 방향

**QUESTION**: Safe Hooks v1(위험 명령 사전 확인 훅) 구현이 머신 레벨
플러그인 훅(vibe-claude destructive-command-gate)에 의해 차단된 상태를
어떻게 처리할지. 이 플러그인 훅은 "파괴적 명령 탐지기의 소스 코드/테스트
코드 자체가 탐지 대상 문자열을 포함해야 하는" 구조적 특성 때문에 Write
시도 자체가 거부되며, 우회 시도는 규칙상 중단하도록 지시되어 있다.

**WHY IT MATTERS**: 이 상태로는 에이전트 세션이 Safe Hooks v1을 직접
구현할 수 없다. 설계 문서(`docs/operations/SAFE_HOOKS_V1_DESIGN.md`)만
존재하고 실제 구현은 없는 상태가 계속된다.

**OPTIONS**:
- (a) 운영자가 직접 결재/작성 — 플러그인 훅의 대상이 아닌 사람이 직접
  코드를 작성
- (b) 규칙표(파괴적 명령 패턴 목록)를 탐지기 소스와 분리해, 훅이
  예외 처리하는 데이터 포맷(예: 별도 JSON/YAML 설정 파일)으로 옮겨
  Write 차단을 회피
- (c) 구현을 보류하고 설계 문서 상태만 유지

**RECOMMENDATION**: (a) 또는 (b) 중 선택. 어느 쪽이든 활성화 전 반드시
별도의 격리된 세션에서 우회 테스트(의도적으로 훅을 통과시켜 보는 안전
검증)를 먼저 수행할 것.

**SAFE DEFAULT**: 미구현 — `docs/operations/SAFE_HOOKS_V1_DESIGN.md`
설계 문서만 존재하고 실제 훅 코드는 없다.

---

## 4. scripts/testProdCheck.mjs `--show-names` INFO 단언 처리

**QUESTION**: `scripts/testProdCheck.mjs`의 `--show-names` 관련 INFO
단언이 CI의 이름 마스킹 환경에서 항상 실패하는 문제를 어떻게 처리할지.

**WHY IT MATTERS**: 이 단언은 `extra:true`로 분류되어 있어 Release
Gate/verify:all 등 게이트 판정에는 영향을 주지 않지만, CI 로그에 매번
실패로 표시되어 노이즈를 유발하고 있다.

**OPTIONS**:
- CI 환경에서 해당 단언만 skip 처리
- 스크립트에 CI 전용 분기를 추가
- 현행 유지(노이즈 감수)

**RECOMMENDATION**: CI 환경변수를 감지해 해당 단언을 skip.

**SAFE DEFAULT**: 현행 유지 — CI에서 해당 단언은 계속 실패로 표시되지만
게이트에는 영향 없음(extra:true).

---

## 5. Agent B 브랜치(design/paul-town-british-world-2026-09-12) push/PR 여부

**QUESTION**: 로컬 worktree에만 존재하고 아직 push되지 않은
`design/paul-town-british-world-2026-09-12` 브랜치를 push하고 PR을 열지.

**WHY IT MATTERS**: 이 브랜치에는 설계 문서 9종, 아직 기존 화면에
배선(연결)되지 않은 프로토타입 코드, 관련 테스트가 포함되어 있다.
기존 화면/로직에는 변경이 없는 것으로 확인됐다.

**OPTIONS**:
- push 후 PR을 열어 리뷰 진행(설계 문서 + 코드, 관련 기능 플래그는
  OFF 상태 유지) — 머지 여부는 이후 별도로 결정
- 설계 문서만 분리해 별도 PR로 push
- 보류(로컬 보관 유지)

**RECOMMENDATION**: push + PR로 리뷰 절차 시작(머지 자체는 이후 별도
결정 사항으로 분리).

**SAFE DEFAULT**: 로컬 보관 — 해당 브랜치는 아직 원격에 push되지 않았다.

---

## 6. Pilot A 시작 여부

**QUESTION**: `docs/operations/PILOT_A_PRE_ENABLE_CHECKLIST_2026-09-12.md`
절차에 따라 파일럿 A(학생 5명, UUID 확정, PRE 체크 PASS, P1 배포 완료
상태)를 실제로 시작할지.

**WHY IT MATTERS**: 사전 준비(체크리스트 PASS, 대상 학생 UUID 확정,
관련 배포 완료)는 끝났지만, 기능 플래그가 아직 켜지지 않아 실제 파일럿은
시작되지 않은 상태다.

**OPTIONS**:
- 운영자 기기에서 체크리스트 절차대로 시작(대상 중 Kinney 학생 먼저
  적용)
- 추가 검토 후 시작
- 보류

**RECOMMENDATION**: 운영자 기기 절차로 시작(Kinney 먼저).

**SAFE DEFAULT**: NOT STARTED — `paulTownV1` 플래그 OFF,
`TOWN_V1_WELCOME_ENABLED` 환경변수 미설정 상태.

---

## 7. Supabase 프로젝트 상태 점검

**QUESTION**: 최근 4시간 내 서로 다른 엔드포인트(PostgREST `students`
SELECT, `/api/student-pin-status`, `daily_assignments` 픽스처 생성)에서
발생한 Gateway Timeout 4건과 관련해 Supabase 프로젝트 자체의 상태/리소스를
점검할지.

**WHY IT MATTERS**: 서로 다른 엔드포인트에서 반복적으로 타임아웃이
발생한 것은 특정 쿼리/코드 문제라기보다 인프라 레벨 이슈일 가능성을
시사한다. 다만 같은 기간 학생 라이브 트래픽에 대한 관측된 영향은 0이며
(anon HEAD 요청 응답 시간 0.3~1.3초로 정상), 현재까지 실사용자 체감
장애로는 이어지지 않은 것으로 확인된다.

**OPTIONS**:
- Supabase 대시보드에서 프로젝트 상태/리소스 사용량 확인
- 별도 조치 없이 관찰 지속

**RECOMMENDATION**: Supabase 대시보드 상태/리소스 확인.

**SAFE DEFAULT**: 관찰 — 별도 조치 없이 현재 상태를 유지하며 지켜보고
있다.

---

## 8. 배포 시간대 정책

**QUESTION**: 매 배포마다 모든 lazy 청크 파일명이 재해시(변경)되는
현상과 관련해, 배포 시간대를 제한하는 정책을 둘지.

**WHY IT MATTERS**: PR #40으로 청크 불일치 시 자동 복구(새로고침 유도)는
되어 있지만, 그 과정에서 사용자에게 1회 새로고침이 발생한다. 한국
표준시(KST) 학습 시간대(대략 14시~22시)에 배포가 발생하면 학습 중인
학생이 새로고침을 겪을 가능성이 있다.

**OPTIONS**:
- KST 학습 시간대(대략 14~22시) 배포를 회피하고 변경 사항을 모아
  배치로 머지·배포
- 별도 정책 없이 현행대로 수시 배포

**RECOMMENDATION**: KST 학습 시간대 배포 회피 + 배치 머지.

**SAFE DEFAULT**: 정책 없음 — 현재 배포 시간대에 대한 별도 제약이
적용되어 있지 않다.

---

## 9. 클라이언트 크래시 텔레메트리 도입 여부

**QUESTION**: 클라이언트 측 크래시를 수집하는 텔레메트리가 없어, 131차
세션에서 다뤄진 사고의 실제 영향 범위(몇 명, 얼마나 자주 발생했는지)를
산정할 수 없는 상태를 어떻게 개선할지.

**WHY IT MATTERS**: 현재는 크래시 발생 여부/빈도를 사후에 파악할 방법이
없어, 향후 유사 사고 발생 시에도 영향 범위 산정이 동일하게 불가능하다.

**OPTIONS**:
- `product_events` 테이블에 익명 이벤트(anon_id + event + day 단위)를
  최소 형태로 추가
- 외부 크래시 리포팅 서비스 도입
- 현행 유지(텔레메트리 없음)

**RECOMMENDATION**: `product_events`에 익명 이벤트(anon_id + event +
day) 최소 도입을 설계.

**SAFE DEFAULT**: 없음 — 현재 클라이언트 크래시 텔레메트리는 존재하지
않는다.

---

## 10. 기술 부채 Top 5 우선순위 확인

**QUESTION**: `docs/operations/TECH_DEBT_INVENTORY_2026-09-12.md`에
정리된 기술 부채 Top 5 항목의 처리 우선순위를 확인할지.

**WHY IT MATTERS**: 해당 문서에 이미 목록화되어 있으며, 이 문서에서는
링크만 제공한다.

**OPTIONS**: 해당 문서 참고.

**RECOMMENDATION**: `docs/operations/TECH_DEBT_INVENTORY_2026-09-12.md`
참고.

**SAFE DEFAULT**: 별도 처리 없음 — 목록 상태로만 존재.

---

## 11. 오래된 열린 PR #9/#11/#16/#17/#18 정리(triage)

**QUESTION**: 오래 열려 있는 PR #9, #11, #16, #17, #18의 상태가 불명확한
상태를 어떻게 정리할지(close/rebase 등).

**WHY IT MATTERS**: 각 PR의 현재 유효성(머지 가능 여부, 여전히 필요한
변경인지)이 확인되지 않은 상태로 남아 있다.

**OPTIONS**:
- 다음 세션에서 각 PR을 개별 검토해 close 또는 rebase 결정
- 현행대로 유지

**RECOMMENDATION**: 다음 세션에서 close/rebase 여부를 결정.

**SAFE DEFAULT**: 유지 — 해당 PR들은 현재 상태 그대로 열려 있다.

---

## 12. git worktree 정리

**QUESTION**: 현재 33개 등록되어 있는 git worktree(대부분 과거 세션의
스크래치 작업물) 중, 이번 세션이 생성한 `wt-town-design`, `wt-tests`를
정리할지.

**WHY IT MATTERS**: worktree가 누적되면 디스크 공간과 관리 복잡도가
늘어난다. 다만 이번 세션이 만들지 않은 나머지 worktree는 이번 정리
대상에 포함하지 않는다.

**OPTIONS**:
- 운영자 승인 후 `wt-town-design`, `wt-tests`의 브랜치를 보존한 채
  worktree만 제거
- 현행대로 유지

**RECOMMENDATION**: 운영자 승인 후 정리(브랜치는 보존).

**SAFE DEFAULT**: 유지 — 현재 33개 worktree가 모두 등록된 상태로 남아
있다.

---

*(작성: docs-maintainer, 2026-09-12)*
