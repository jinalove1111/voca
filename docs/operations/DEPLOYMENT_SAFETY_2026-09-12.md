# 배포 안전 가이드 (2026-09-12 스냅샷)

_작성 근거: `.github/workflows/release-gate.yml`, `handoff.md` 125~131차,
2026-09-12 READ-ONLY 배포 검증 세션. 이 문서는 append-only 문서 체계의
스냅샷 문서이며, 세션별 상세 이력은 `handoff.md`가 진실 원천이다._

## 1. 배포 경로 — 무엇이 무엇을 막는지 (막지 않는지)

- 실제 배포 트리거는 **"GitHub main push → Vercel 자동 배포"** 단
  하나다. `vercel.json`은 이 저장소에 없고, 별도 빌드 훅도 없다 —
  Vercel이 Git 연동으로 push를 직접 감시해 Production을 재빌드한다.
  Production URL: `https://voca-drab.vercel.app`. merge 후 약 30초
  내에 새 배포가 시작된다(2026-09-12 실측).
- `.github/workflows/release-gate.yml`(Release Gate, `pull_request`/
  `push(main)`/`workflow_dispatch`에서 실행)은 **Vercel 배포를 막지
  않는다.** Vercel은 GitHub Actions 상태를 기다리지 않는다 — 이
  사실은 워크플로 파일 상단 주석에 명시돼 있다. 즉 Release Gate가
  빨간불이어도 main에 push가 일어나면 Vercel은 배포를 진행한다.
  Release Gate는 **사후 증거(post-hoc evidence)**이지 배포 게이트가
  아니다.
- Release Gate를 실질적 차단으로 쓰려면 GitHub 저장소 설정에서 main
  브랜치 보호 규칙(Settings > Branches > Require a pull request before
  merging + Require status checks to pass, 필수 체크로 `release-gate`/
  `deploy-ready` 지정)이 **별도로 필요**하다 — 이 저장소에 현재
  적용돼 있는지는 코드로 확인 불가능한 GitHub 설정 영역이며, 워크플로
  파일 자체는 이 설정을 자동으로 바꾸지 않는다.
- Release Gate 6단계 구성(needs 체인으로 실패 시 이후 단계 진행 안
  함, 전부 READ-ONLY):
  1. Gate 1 — `npm run build`
  2. Gate 2 — `npm run verify:all`(기존 도메인 회귀 전수)
  3. Gate 3 — student health(`verify:release --skip-build --skip-verify`,
     baseline 대비 신규 FAIL만 회귀로 판정)
  4. Gate 3b — `prod:check`(READ-ONLY, `--require-env`로 자격증명 부재를
     조용한 SKIP이 아니라 FAIL로 만듦, 학생 이름은 CI에서 항상 강제
     마스킹)
  5. Gate 4 — `prod:hotfix` dry-run WRITE-DISABLED PROOF(CI 감지 시
     항상 STOP, 가짜 토큰 주입으로 "토큰이 있어도 막힌다"는 더 강한
     조건까지 증명, 로그에 `DB WRITE: 0` 문자열 확인)
  6. Gate 5 — `npm run verify:e2e`(Playwright 브라우저 E2E, 전체
     네트워크 mock, 미mock 요청 발생 시 그 자체로 FAIL)
- 정적 자산 캐싱: 서비스워커 없음. `index.html`과 해시된 자산 모두
  `Cache-Control: public, max-age=0, must-revalidate`로 서빙된다 —
  즉 브라우저는 매번 재검증하지만, 새 배포 후 **구 해시 자산은 404**를
  반환한다(캐시 정책 문제가 아니라 자산 자체가 서버에서 사라짐).

## 2. 배포 전 체크리스트

- [ ] 변경이 파일/기능 단위 소커밋으로 나뉘어 있는지 확인(규칙 14).
- [ ] `npm run build` 로컬 통과, 건드린 도메인 `npm run verify:<domain>`
      (또는 `verify:all`) 로컬 통과.
- [ ] PR을 열어 Release Gate(6단계)가 SUCCESS인지 확인 — main에 직접
      push하지 않는다(브랜치 보호가 켜져 있으면 어차피 거부되고,
      꺼져 있어도 Gate 없이 바로 배포되는 경로를 스스로 만들지 않는다).
- [ ] 가능하면 **학생 학습 시간대(대략 KST 14:00~22:00)를 피해서
      merge**한다(131차 운영 권고) — 배포 시점에 세션이 열려 있던 기기가
      청크 재명명 영향을 받을 수 있다(§4).
- [ ] 여러 변경을 모아 배치로 merge하는 것을 고려한다(불필요하게 잦은
      배포는 청크 재명명 노출 창을 늘린다).
- [ ] 새 Supabase 컬럼/테이블이 포함된 변경이면 GRANT·마이그레이션
      멱등성·클라이언트 폴백을 빠짐없이 처리했는지 확인(CLAUDE.md
      규칙 9·10).
- [ ] `.ai-status/`에 체크포인트를 기록했는지 확인(규칙 17).

## 3. 배포 후 READ-ONLY 검증 체크리스트

2026-09-12 세션에서 실제로 사용한 방법(전부 조회만, 학생 데이터/기능
플래그/구매/보상에 쓰기 없음):

1. **배포 상태 확인** — GitHub Deployments API로 해당 merge commit의
   Vercel 배포 상태(success/시각) 조회.
2. **라이브 자산 이름 확인** — `https://voca-drab.vercel.app`의
   `index.html`을 가져와 현재 서빙 중인 `index-<hash>.js`/각 청크 파일명을
   확인.
3. **SHA 일치 확인(md5)** — 해당 merge SHA로 로컬 `npm run build`를
   실행해 나온 `dist/assets/index-<hash>.js`(그리고 필요하면
   `AdminScreen-<hash>.js` 등 건드린 청크)의 md5와 라이브 자산의 md5를
   비교 → 일치하면 "DEPLOY SHA MATCH"로 판정.
4. **변경 마커 확인** — 이번 변경에서 새로 들어간 문자열/식별자가
   라이브 번들에 실제로 포함돼 있는지 grep으로 확인(코드가 실제로
   배포됐다는 추가 증거).
5. **구 자산 404 확인** — 이전 배포의 해시 파일명이 이제 404를
   반환하는지 확인(구 자산이 더 이상 서빙되지 않음을 확인).
6. **Playwright route-abort 시나리오(로그인 없이)** — 첫 청크 요청만
   abort시켜 stale-chunk 자동복구(자동 reload 1회)가 동작하는지,
   계속 abort시키면 두 번째 자동 reload가 0회이고 안내 화면이 유지되는지
   확인(`tests/e2e/staleChunk.spec.mjs`가 CI에서 이미 이 시나리오를
   커버하지만, 라이브 배포 직후에도 별도로 재확인 가능).
7. **prod:check(READ-ONLY)** — `npm run prod:check`로 헬스체크 +
   크로스 테이블 invariant를 조회 전용으로 재확인(PATCH/POST/PUT/DELETE
   없음, `scripts/prodCheck.mjs` 헤더 주석).

기대값: SHA MATCH YES, 구 자산 404, 신규 마커 포함, prod:check verdict
정상(기존에 알려진 FAIL/WARN 외 신규 없음), stale-chunk 시나리오에서
누적 자동 reload 정확히 1회.

## 4. 알려진 위험과 완화

### 4.1 청크 재명명 연쇄(cascade) — P1, 2026-09-12 131차에서 규명·수정

- **메커니즘**: 공유 코드가 조금이라도 바뀌면 `index-<hash>.js`
  파일명이 바뀌고, 이 파일명은 13개 lazy 청크(PaulTown, EnglishGarden,
  HatCollection, WordMuseum, GrowthAlbum, Bookshelf, TimeMachine,
  EntranceTest, ParentScreen, TownScreen, AdminScreen, weeklyReport,
  index) 각각의 import specifier 문자열로 박혀 있다. 그래서 **소스가
  전혀 바뀌지 않은 청크도 매 배포마다 재해시**된다. 배포 전에 이미
  열려 있던 세션이 이후 code-split 화면에 처음 진입하면 구 해시 요청이
  404가 되고, `React.lazy`는 reject를 내부적으로 캐시해 "그냥 다시
  시도"만으로는 복구되지 않는다.
- **완화(배포 완료, PR #40, main `a87866a`)**: `src/utils/
  staleChunkRecovery.js`(순수 함수)가 `ChunkLoadError`류 오류 패턴과
  `vite:preloadError`를 판정해 `sessionStorage` 60초 가드로 자동
  reload를 최대 1회로 제한한다(부팅 30초 후 가드 자동 해제). 2026-09-12
  라이브에서 실측 검증: 자동 reload 1회 발생, 가드가 두 번째 시도를
  막음, 대조군(가드 무관 경로) 0회.
- **잔여 한계**: 가드가 탭 단위(`sessionStorage`)라 여러 탭을 열어둔
  경우 탭마다 최대 1회씩 reload될 수 있다. 클라이언트 크래시
  텔레메트리가 여전히 0건이라, 사고 기기 귀속은 구조적 증명 수준이며
  개별 기기 단위 확진은 아니다(§6 참고).

### 4.2 Release Gate 타임아웃 근접

- 최근 실측 소요시간: Gate 2(verify:all) 10.2~11.5분, Gate 3(student
  health) 3~4분, Gate 5(browser E2E) 약 4분 → 합계 18.5~20분.
  `timeout-minutes: 20`에 근접해 24시간 내 3건의 timeout cancel이
  발생했다(전부 코드 회귀가 아니라 워크플로 타임아웃 — 게이트 자체는
  모두 success였음). PR #41이 `timeout-minutes: 30` 상향을 제안한 상태.

### 4.3 라이브 하네스 스크립트의 플레이크

- `verify:all`/Release Gate 안에서 실제 Supabase에 READ-ONLY로 접근하는
  스크립트(`testDailyAssignment`, `testRlsSecurity` 등)가 일시적
  `Gateway Timeout`으로 실패한 사례가 24시간 내 2건 있었고, 재실행으로
  해소됐다 — 코드 회귀가 아니라 네트워크/인프라성 플레이크로 기록한다.
- `testProdCheck`(`extra:true`)는 CI에서 `--show-names` 관련 단언이
  구조적으로 매번 FAIL한다(CI 환경에서 이름 마스킹이 강제되기 때문 —
  §7의 훅과 무관한 로컬/CI 환경 차이). `extra:true`라 도메인 판정에는
  영향을 주지 않는 기존 이슈다.
- Windows 로컬에서 `testEntranceRosterMinbyungchun.mjs`(`extra:true`,
  라이브 READ-ONLY)가 전 단언 PASS 후 종료 시점에 libuv
  `UV_HANDLE_CLOSING` assertion으로 프로세스가 죽어 FAIL 줄이 찍히는
  경우가 있다 — Windows 전용 종료 플레이크로 기록돼 있고 판정 도메인
  자체에는 영향 없음.

## 5. 롤백

- 프론트엔드 문제는 **DB 롤백을 하지 않는다.** 절차: merge commit을
  revert하는 PR을 올려 Release Gate 통과 후 main에 merge → Vercel이
  revert된 코드를 자동으로 재배포한다.
- DB(마이그레이션) 문제는 이 문서의 범위가 아니다 — `DATABASE.md`와
  운영자 수동 SQL 절차(CLAUDE.md 규칙 8)를 따른다. 에이전트는 어떤
  경우에도 Supabase에 DDL을 직접 실행하지 않는다.

## 6. 금지 사항 (저장소 헌법 인용)

- 규칙 1: 새 코드가 기존 플로우(로그인/학습/퀴즈/동기화 등)를 조금이라도
  위험하게 하면 범위를 줄이거나 중단한다.
- 규칙 5: 매 작업마다 `npm run build` → 오류 확인 → 관련
  `npm run verify:<domain>`(또는 `verify:all`) 실행 없이 완료로 보고하지
  않는다.
- 규칙 8: 에이전트/CI는 Supabase에 DDL을 직접 실행할 수 없다 — 새
  테이블/컬럼은 `supabase_v{n}_{설명}.sql` 준비까지만, 실행은 운영자가
  대시보드 SQL Editor에서 수동으로 한다.
- 규칙 9·10: 마이그레이션은 멱등이어야 하고, `students` 신규 컬럼은
  GRANT를 반드시 함께 실행한다.
- 규칙 16: 다른 세션이 동시에 작업 중인 파일은 읽기만 하고 쓰지 않는다
  — 배포 직전/직후에도 동일하게 적용된다.
- 규칙 18: 훅으로 실제 강제되는 것과 문서로만 강제되는 것을 구분해
  정직하게 기록한다(§7).
- Gate 3b/Gate 4/§3의 검증 절차는 전부 READ-ONLY다 — 배포 검증
  과정에서 학생 데이터/포인트/보상/구매에 쓰기를 발생시키지 않는다.

## 7. 훅으로 강제되는 것 vs 문서 규칙(rule 18)

- **실제로 강제됨(PreToolUse 훅)**: `.claude/settings.json`의
  `scripts/hooks/checkDestructiveSql.mjs`가 `*.sql` 파일에 대한
  Write/Edit/MultiEdit 중 테이블·컬럼·DB·스키마 삭제, 전체 비우기,
  WHERE 없는 무조건부 삭제 등 파괴적 패턴을 감지하면 exit code 2로
  실제 차단한다.
- **문서 규칙으로만 강제됨(훅 아님)**: "배포 전 build/verify 통과",
  "학생 시간대 회피", "배포 후 READ-ONLY 검증 체크리스트 수행" 등 이
  문서의 §2~§3 항목은 훅이 아니라 사람/에이전트의 자율 준수에 의존하는
  프로세스 규칙이다 — 완료 선언 시 자동으로 verify를 실행시키는 강제는
  이 환경에서 신뢰성 있게 구현할 수 없어 만들지 않았다
  (`DEVELOPER_GUIDE.md` "훅 동작 방식" 절 참고).
- **GitHub 브랜치 보호(설정 영역, 코드로 검증 불가)**: Release Gate를
  필수 체크로 지정하는 것은 GitHub 저장소 설정이며, 이 문서나 워크플로
  파일이 그 설정 자체를 증명하지 않는다 — §1에서 명시한 대로 별도
  확인이 필요하다.
