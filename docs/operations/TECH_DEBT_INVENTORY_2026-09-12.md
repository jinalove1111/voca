# 기술 부채 인벤토리 (2026-09-12, main `a87866a` 기준)

_카운트는 2026-09-12 세션에서 main `a87866a` 기준으로 측정된 값이다.
이후 커밋으로 숫자가 달라질 수 있으므로, 재사용 시 날짜/커밋을 함께
확인할 것. 근거: 세션 측정치, `handoff.md`, `tests/harness/registry.mjs`,
`api/` 디렉터리, `src/` 디렉터리, GitHub PR 목록._

## 규모 스냅샷

| 항목 | 값 |
|---|---|
| `src/` 파일 수 | 195 |
| `scripts/test*.mjs` 수 | 190 |
| registry 등록 스위트 수 | 197 (그중 `extra:true` 73) |
| Vercel serverless 함수 수 | 12/12(Hobby 플랜 상한 도달, `api/_pinAuth.js` 헬퍼는 제외 카운트) |
| 저장소 루트 untracked 운영자 SQL 파일 | 16개(`production_*.sql`, `supabase_v3_38/39/39b/46*.sql` 등) — **의도적으로 untracked, 삭제 금지**(운영자 실행 대기/이력 파일) |
| 등록된 git worktree 수 | 33(다수가 이전 세션들의 임시 scratchpad 잔재로 추정, stale) |
| 오픈 PR | #41(CI 신뢰성, 신규), #32(docs, elementary-45, 운영자 보류), #18/#17/#16/#11/#9(오래됨, 상태 미확인 — "triage 필요") |

가장 큰 파일: `src/utils/wordLibrary.js` 4104줄,
`src/components/AdminScreen.jsx` 2434줄, `src/hooks/useStudent.js`
2297줄, `src/components/admin/StudentDirectory.jsx` 1780줄,
`src/App.jsx` 1270줄,
`src/components/admin/SpellingReviewQueuePanel.jsx` 1214줄.

## 부채 항목 표

| id | 영역 | 설명 | 근거/출처 | 위험 | 규모(S/M/L) | 운영자 결정 필요 | 권장 다음 단계 |
|---|---|---|---|---|---|---|---|
| a | 관측성 | 클라이언트 크래시 텔레메트리 0건 — 학생 기기에서 발생한 render-phase 오류를 사후에 확인할 방법이 없다 | `docs/operations/ELEMENTARY_45_ROLLOUT_PACKAGE.md` §7, `handoff.md` 131차 P1 사고(청크 재명명, 사고 기기 콘솔 미확보로 귀속을 LIKELY 이상으로 못 올림) | 중~높음(다음 P1도 동일하게 READ-ONLY 추정에 그칠 수 있음) | M | Y(외부 로깅 도입 여부는 비용/개인정보 판단 필요) | 최소 범위 `anon_id` 기반 이벤트 로깅 설계안을 별도 세션에서 검토 |
| b | CI/배포 | Release Gate가 `timeout-minutes: 20`에 근접(실측 18.5~20분) — 24시간 내 timeout cancel 3건(전부 코드 회귀 아님, 게이트는 success) | `.github/workflows/release-gate.yml`, `handoff.md` 130·131차 | 중(불필요한 재실행으로 CI 시간·러너 낭비) | S | N | PR #41의 `timeout-minutes: 30` 상향안 리뷰·merge |
| c | 테스트 인프라 | 실제 Supabase에 READ-ONLY로 접근하는 라이브 하네스 스크립트가 Release Gate 안에서 실행되며, 일시적 `Gateway Timeout`으로 플레이크(24h 내 2건, 재실행으로 해소) | `handoff.md` 131차, PR #41 | 낮음~중(게이트 신뢰도 저하로 "빨간불 무시" 습관화 위험) | M | N | PR #41의 재시도(retry) 로직 리뷰·merge |
| d | 테스트 인프라 | `testProdCheck`(`extra:true`)가 CI에서 `--show-names` 관련 단언에 매번 FAIL(CI 이름 마스킹 강제와 테스트 기대값 불일치) | 세션 측정(CI 로그), `registry.mjs`의 `extra:true` 표시 | 낮음(`extra:true`라 도메인 판정 비영향, 다만 "상시 빨간불" 학습 위험) | S | N | 테스트 기대값을 CI 마스킹 동작에 맞게 조정하거나 CI 전용 분기 추가 |
| e | 인가/RBAC | `rbac.js`의 localStorage 기반 role 시스템이 실제 로그인 플로우에서 전혀 쓰이지 않음 — PR #38에서 `AdminScreen`이 `adminSession` prop으로 우회 연결(bridge)했고, 레거시 `paulEasyVoca_userRole` 키는 하위 호환으로 남아 있음 | `handoff.md` 130차(근본원인/수정 내용) | 낮음(현재는 prop 기반으로 안전하게 우회됐으나, 죽은 경로가 남아 있어 재도입 시 동일 버그 재발 가능) | M | Y(레거시 key/rbac.js 전체를 정리할지, 향후 다중 역할 요구가 생기면 재설계할지는 제품 판단) | 향후 세션에서 `rbac.js` 사용처 전수 재확인 후 완전 제거 또는 명시적 재설계 결정 |
| f | 데드코드(이미 해결됨) | `HiddenFeatures.jsx`/`api/hiddenFeatures.js`/`config/dataSchemas.js`/`hooks/usePaulReaction.js` — 2026-07-18 Phase 5 감사에서 데드코드로 이미 삭제 완료. 2026-09-12 세션에서 `src/` 전수 glob으로 재확인한 결과 현재 저장소에 **파일 자체가 존재하지 않음**(재발 없음) | `handoff.md` 2026-07-18 Phase 5 절, 2026-09-12 재확인(glob 0건) | 없음(참고용 기록) | - | N | 조치 불필요 — 향후 같은 이름의 스캐폴딩을 "새로" 만들려는 시도가 있으면 이미 삭제된 이력임을 먼저 확인 |
| g | 피처 플래그 아키텍처 | 피처 플래그가 기기-로컬(localStorage) 저장이라 학생 단위 서버 allowlist가 없음 | Pilot A 관련 세션 기록(130차 Pilot A 체크리스트) | 중(파일럿 대상 학생을 기기 단위로만 통제 가능, 오배포 시 전체 노출 위험) | L | Y(서버 사이드 allowlist 도입은 스키마 추가 필요) | Pilot A 확대 전 서버 allowlist 필요성 여부를 운영자와 재확인 |
| h | 보상 시스템 | 레거시 reward key 포맷과 V1 reward key 포맷이 공존(`parseLegacyDedupKey`), `pronunciation-unidentified` 경로는 클라이언트 전용으로 비멱등 동작이 현재 상태로 고정돼 있음 | 이전 세션들의 reward 하드닝 기록(feedback_stale_ai_status 계열), `parseLegacyDedupKey` 소스 | 중(레거시 포맷 지원 코드를 건드릴 때 회귀 위험 높음) | M | Y(비멱등 동작을 지금처럼 둘지 서버 이관할지는 NEEDS DECISION으로 별도 기록돼 있음) | 결정 전까지 관련 코드는 손대지 않고 유지 |
| i | 테스트 범위 | 45명 규모 스트레스 스위트가 합성(synthetic) 데이터 기반 — 실제 111명 프로덕션 부하 패턴과 다를 수 있음 | 세션 측정치(스트레스 스위트 성격 기록) | 낮음~중 | S | N | 신규 규모 확장(예: 전교생 롤아웃) 전 실측 부하 패턴과 비교 검토 |
| j | 테스트 신뢰도 | 정규식류 패턴(`\b504\b`)이 단언 카운트 등 무관한 숫자에 우연히 매칭될 수 있음(무해하지만 재실행 유발) | PR #41 리뷰 코멘트 | 낮음 | S | N | 패턴을 더 구체적인 컨텍스트(예: HTTP status 필드)로 좁히는 것을 다음 PR #41 후속 작업으로 고려 |
| k | 테스트 신뢰도(Windows 전용) | `testEntranceRosterMinbyungchun.mjs`(`extra:true`)가 Windows 로컬에서 전 단언 PASS 후 종료 시점 libuv `UV_HANDLE_CLOSING` assertion으로 프로세스가 죽어 FAIL 줄을 남김 | 세션 측정치, `handoff.md` 128·131차 | 낮음(`extra:true`, 판정 도메인 비영향, CI(ubuntu)에서는 미재현) | S | N | 필요 시 스크립트 종료부의 리소스 정리 순서를 별도로 점검(우선순위 낮음) |
| l | 이코노미/가격 정책 | Paul Town 이코노미 가격이 다수 항목에서 "TOO CHEAP"으로 플래그됨, 정책은 현재 OPTION C(관찰) 유지 중 | `handoff.md` 127차(가격 재산정 근거) | 중(파일럿 확대 시 조기 소진/밸런스 붕괴 가능) | M | Y(가격/적립률 조정 여부는 파일럿 관찰 후 운영자 결정 예정) | Pilot A 관찰 데이터 축적 후 재검토, 그 전까지 가격 무변경 유지 |
| m | 인프라 제약 | Vercel serverless 함수 12/12로 Hobby 플랜 상한에 도달 — 신규 API 엔드포인트 추가가 구조적으로 막혀 있음 | 세션 측정치(`api/` 디렉터리) | 높음(신규 서버 로직 필요 시 기존 함수 통합/플랜 업그레이드가 선행돼야 함) | L | Y(플랜 업그레이드 여부 또는 기존 함수 통합 리팩터는 비용/설계 판단) | 신규 API가 필요한 작업이 나오면 먼저 기존 12개 함수 통합 가능성부터 검토 |
| n | 저장소 위생 | git worktree 33개 등록(다수가 이전 세션 scratchpad 잔재로 추정) | 세션 측정치(`git worktree list` 규모) | 낮음(디스크/혼란 비용, 기능 위험은 없음) | S | Y(다른 세션/에이전트 소유 worktree를 임의로 force-remove하지 않는다 — 규칙 16 정신) | 정리 전 각 worktree의 소유 세션·미커밋 변경 여부를 확인하고 운영자 승인 하에 정리 |

## 상위 5개 위험(Top 5 by risk)

1. **(m) Vercel 함수 12/12 상한** — 신규 서버 기능 자체가 구조적으로
   막혀 있어, 향후 어떤 신규 API 요구가 와도 먼저 이 제약과 충돌한다.
2. **(a) 클라이언트 크래시 텔레메트리 부재** — 131차 P1 사고처럼
   실제 사고가 나도 READ-ONLY 추정 이상으로 원인을 확정할 수 없다.
3. **(g) 피처 플래그의 기기-로컬 한계** — 파일럿을 학생 단위가 아니라
   기기 단위로만 통제할 수 있어, 확대 시 오배포·오노출 위험이 있다.
4. **(l) 이코노미 가격 TOO CHEAP** — 파일럿 확대 전 미해결 시 밸런스
   붕괴·조기 소진 위험이 실사용 단계에서 현실화될 수 있다.
5. **(e) rbac.js 레거시 경로 잔존** — 이미 한 번 실제 버그(130차)를
   냈던 구조가 완전히 제거되지 않고 우회만 된 상태라, 다른 화면에서
   같은 실수가 재발할 수 있다.

## 참고

- (f) 항목은 "부채"가 아니라 "이미 해결되어 재발하지 않았음을
  재확인한 기록"이다 — 향후 같은 이름의 코드를 실수로 다시 만들지
  않도록 표에 남겨 둔다.
- 이 문서는 코드 변경을 포함하지 않으며, 각 항목의 "권장 다음 단계"는
  1줄 권고 이상의 구체적 설계/구현 계획을 제시하지 않는다.
