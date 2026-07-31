# Beta Launch Readiness Report — Paul Easy Voca (단일 학원 50명 베타)

_작성: 2026-07-30. 이 문서는 여러 세션의 감사·구현·검증을 종합한 **최종
Go/No-Go 판정**이다. 상세는 각 참조 문서로 연결한다(중복 최소화):
`docs/DEPLOYMENT_CHECKLIST_V311_V312.md`(배포 절차/롤백),
`docs/SECURITY_AUDIT_V311.md`(보안), `docs/BETA_LAUNCH_STATUS.md`(기능/한계),
`docs/SAAS_READINESS_REVIEW.md`(멀티테넌트=범위 밖). **이 세션은 코드·DB를
변경하지 않았다(리뷰/검증/문서만). 배포/DDL은 운영자 영역.**_

---

## 1. 판정 요약

| 영역 | 판정 | 근거 |
|---|---|---|
| **학생 학습 제품(핵심)** | 🟢 **READY** | 전 플로우 검증 PASS, 데이터무결성/크래시 결함 0, 50명은 검증된 스케일 이내 |
| **v3.11/v3.12 코드 변경** | 🟢 **READY (검증 완료)** | 신규 도달 가능 버그 0, 에러 처리 완결·일관, build+verify 5종 PASS |
| **보안 락다운 실제 적용** | 🔴 **BLOCKED on deploy** | 코드 code-complete이나 Edge Function 미배포 + SQL 미실행 → anon 쓰기 아직 열림, 관리자 커리큘럼 쓰기 프로덕션 장애 가능 |
| **멀티테넌트** | ⚪ **범위 밖** | 단일 학원 베타. academy_id 없음(설계만) |

**결론: 베타의 실질 게이트는 단 하나 — `docs/DEPLOYMENT_CHECKLIST_V311_V312.md`
순서대로의 운영자 배포(함수 배포 → 프론트 → 라이브 게이트 → v3.11 SQL →
v3.12 SQL).** 이 배포가 (a) 열린 취약점을 닫고 (b) 현재 깨져 있(을 가능성이
높)은 관리자 쓰기를 복구한다. 배포 완료 = **GO**. 배포 전 = 학생 학습만
제한적으로 가능하나 관리자 콘텐츠 편집이 막혀 실질 운영 불가.

---

## 2. Task 1 — v3.11/v3.12 변경 리뷰 결과

변경 파일(미커밋, build+verify 5종 PASS): `admin-content-write/index.ts`
(assignment.set), `wordLibrary.js`(dual-path), `AdminScreen.jsx`(4개 배선),
`MatchGameShell.jsx`(별 표시 정정). 2회 독립 리뷰(구현 세션 diff 리뷰 +
이번 세션 전용 에러처리 리뷰) 결과:

- **신규 도달 가능(reachable) 결함 0건.** 듀얼패스는 v3.11 패턴과 정확히
  동일, 하위호환(adminPin 없으면 레거시 anon 무변경), Edge Function 핸들러는
  기존 8개와 동형 + 스키마(`unique(class_id,date)`) 정합.

## 3. Task 2 — 에러 처리 점검 결과

**완결·일관.** 확인 경로:
- `callAdminContentWrite`(wordLibrary.js:51-77): 네트워크 throw / 비-JSON
  404(body=null) / `!res.ok` / `body.ok===false` / `not_authorized` **모든
  실패 모드가 throw로 전파**, 조용히 삼켜지는 경로 없음.
- `setAssignmentForDate`: `refreshWordLibrary()`가 양쪽 브랜치 후 무조건 실행.
- UI 4개 호출부: 전부 try/catch, 성공 await 후에만 `saved`/`refresh()`,
  실패 시 alert. 거짓 "저장됨" 상태 도달 불가.
- `pin` state는 로그인 성공 후 세션 내 유지 → 실사용에서 항상 Edge Function
  경로(레거시로 조용히 폴백하지 않음).

**문서화된 이론적/기존(pre-existing) 항목 3건 — 도달 불가라 이번에 미수정
(방어적 하드닝 권고로만 기록):**
1. `if (!classId) return` 조용한 no-op — 모든 admin write 공유 패턴,
   `targetClass`가 항상 `_cache` 키라 UI에서 도달 불가.
2. `handleAssignmentSet`의 `wordIds` 요소 타입/크기 미검증 — 호출부가 항상
   문자열 배열 전송.
3. `handleWordsBulkReplace`가 행 검증 전 기존 단어 delete — 잘못된 행이
   오면 단어가 비워질 수 있음(v3.12 아님, 기존). 현재 client는 항상 정형
   행 전송이라 도달 불가. **운영자가 admin-content-write를 다음에 손댈 때
   delete 전 검증으로 순서 바꾸는 방어 하드닝 권고**(index.ts:193-212).

> 이 3건은 전부 undeployed Edge Function이거나 도달 불가 경로라, 무감독
> 자율 세션에서 검증 불가한 수정을 하기보다 문서화가 안전(헌법 규칙 1·5).

## 4. Task 3 — 50명 베타 스케일 리스크

**50명은 신규 스케일 리스크가 아니다** — 현재 프로덕션이 이미 ≈111명
실사용 중이라 50은 검증된 규모 이내. 신규 Vercel 함수 0개(assignment.set은
기존 함수)라 Hobby 12함수 한도 무영향. 하드코딩된 인원 상한/절단 없음.

| 항목 | 50명 영향 | 근거 |
|---|---|---|
| 대시보드/분석 쿼리 | 🟢 무해 | `.in('student_id', ids)` 배치 + `Promise.all`, N+1 아님(wordLibrary.js:1888,2118 등) |
| 일일 진행 조회 | 🟢 무해 | `.limit(14)` 등 바운드 |
| 클라이언트 전체 DB 무필터 로드(perf §1) | 🟡 모니터 | 절대량 작음(50/111). 감사도 "2000명 성장" 시나리오로 명시 |
| **동시 세션 복귀 버스트 vs Supabase 티어(perf §4)** | 🟡 **Day1 모니터** | 수업 시작 등으로 다수가 동시에 앱 복귀 시 클라이언트별 전체 리로드 버스트. 50 동시라도 현재 티어에서 견디는지 첫날 관찰 |
| FK 인덱스 미확인(perf §5) | 🟢 무해(50 규모) | 소규모 테이블 seq scan 무해, 스케일 시에만 이슈 |
| AI 배치 채점 N+1(perf §2) | 🟡 사용량 의존 | 요청당 바운드. 쓰기시험 헤비 사용 시 관찰 |

**결론: 50명 베타에 스케일 블로커 없음.** 유일 관찰 포인트는 동시 복귀
버스트(§4) — 블로커 아닌 Day1 모니터링 항목.

## 5. Task 4 — 관리자 UX

**명확한(도달 가능) 관리자 UX 버그 없음 → 코드 변경 없음**(지시: "clear
bugs만"). §3의 3개 항목은 도달 불가/기존이라 문서화만. `deleteClassUnit`는
호출부 0개(유닛 삭제 UI 부재)이나 이는 결함이 아니라 미구현 기능이라 범위
밖(신규 기능 금지).

## 6. 남은 리스크 (우선순위)

1. 🔴 **보안 배포 미완** — 아무것도 라이브 아님. 배포 전까지 classes/units/
   words/daily_assignments anon 쓰기 열림 + 관리자 커리큘럼 쓰기 404 가능.
   **유일한 실질 블로커.** (2026-07-24부터 열린 상태 — 신규 악화는 아님)
2. 🟡 **배포 순서 리스크** — 함수→프론트→게이트→v3.11 SQL→v3.12 SQL 순서
   위반 시 관리자 쓰기 42501. 특히 v3.12는 현재 정상 동작 중인 숙제 배정을
   순서 위반 시 깨뜨림.
3. 🟡 **미커밋 상태** — 이번까지의 코드/문서 미커밋. 배포 전 커밋/머지 필요.
4. 🟡 **동시 복귀 버스트**(§4) — Day1 모니터.
5. ⚪ **제품 결정 2건(미변경)** — 미니게임 올클리어 보너스 실지급 여부,
   발음 별 dedup 라운드 스코프 의미. 학습/경제 판단이라 운영자 결정.
6. ⚪ **방어 하드닝 권고 3건**(§3) — 다음 함수 편집 시 반영 권장.

## 7. 배포 전 필수 수동 테스트

`docs/DEPLOYMENT_CHECKLIST_V311_V312.md` §5-C/§5-D. 요약: 배포 후 관리자
반/유닛/단어 CRUD + **숙제 배정** 각 1회(라이브 게이트) → 학생 로그인/학습/
발음/쓰기/미션/보상을 ≥3개 실기기(iOS Safari/Android Chrome/데스크톱)에서.

---

## 8. 한국 복귀 후 정확한 첫 행동 (순서대로)

_각 단계 상세 명령: `docs/DEPLOYMENT_CHECKLIST_V311_V312.md` §2. 판단 게이트:
`docs/audit/2026-07-26-v3_11-1hour-runbook.md`(60분 룰/중단 기준)._

1. **이번까지의 변경 커밋/머지/배포.** 로컬 미커밋 변경(5 코드/문서 파일 +
   신규 문서/SQL)을 회귀 재검 후 커밋 → main → Vercel 프론트 배포. **배포된
   구버전 번들에는 assignment.set 배선이 없으므로 이게 먼저.**
   (자신이 소유한 파일만 스테이징 — 헌법 규칙 16, 루트의 pre-existing 설계
   문서 27개 섞지 말 것.)
2. **`supabase login` + `link --project-ref azsjthtdjfpnctffjfsk` + `secrets
   list`**로 ADMIN_PIN/SUPABASE_URL/SERVICE_ROLE_KEY 3개 확인.
3. **`supabase functions deploy admin-content-write`** — 1번으로 v3.11·v3.12
   공통 커버. `functions list`로 ACTIVE 확인 + 미인가 스모크(not_authorized).
4. **프론트 최신 확인**(1번 배포가 프로덕션에 반영됐는지).
5. **[사람] 라이브 게이트** — 프로덕션 관리자 로그인 후 (a) 유닛 이름 저장,
   (b) 숙제 배정 저장 각 1회. **둘 다 성공해야만** 다음. 실패 시 2~4 재확인,
   SQL 금지.
6. **`supabase_v3_11_...sql` 실행**(대시보드, begin/commit) → **`supabase_
   v3_12_...sql` 실행**(그 다음).
7. **정합성 프로브** — anon key 빈 body POST로 classes/units/words/
   daily_assignments 전부 **42501** 확인(잠김 성공).
8. **관리자/학생 기능 테스트**(§7) → 이상 시 롤백(체크리스트 §4: v3.11
   disable RLS 3줄 / v3.12 `allow anon all` 정책 복구).
9. **베타 런치**: ≤50명 로스터/PIN/숙제 배정 확인 → Go/No-Go → Day1 모니터
   (관리자 쓰기 실패 alert, 동시 복귀 버스트, 학생 저장 실패).

---

_판정: 학생 제품은 READY, 코드는 검증 완료. **남은 것은 오직 운영자 배포 1
시퀀스.** 그 시퀀스가 취약점을 닫고 관리자 쓰기를 복구하면 50명 베타 GO._

---

## [2026-07-31 병합] FINAL_BETA_LAUNCH_REPORT.md 고유 감사 내용 (2026-07-30 시점)

_(2026-07-31 문서 정리: `FINAL_BETA_LAUNCH_REPORT.md`에서 병합. 아래는
2026-07-30 시점 스냅샷 — 당시 이 보고서가 지적한 "미커밋 파일" 인벤토리는
이번 2026-07-31 문서 정리로 이미 해소됨(전부 커밋됨). 고라이브 시퀀스는
위 §8과 중복이라 병합하지 않음, `docs/DEPLOY_COMMANDS_V311_V312.md` 참고.)_

### Check 1 — origin/main 대비 커밋 상태 (2026-07-30 시점)

로컬 main이 origin/main보다 3커밋 앞섬(당시 미push, 지시대로).

| Hash | 유형 | 요약 |
|---|---|---|
| `db4e169` | docs | v3.11/v3.12 배포·보안·베타 문서 + handoff |
| `e88cf54` | fix | 미니게임 결과 별 표시를 실제 지급값에 일치 |
| `5b49c92` | fix(security) | v3.12 daily_assignments 무인가 쓰기 락다운 dual-path |

전부 검증 완료(build + verify:writing/persistence/student/quiz/admin PASS).

### Check 2 — 프로덕션에 영향 주는 미커밋 파일 (2026-07-30 시점)

**없음 — 프로덕션 코드/SQL은 100% 커밋됨.** 미커밋 잔여는 전부 비-런타임:

| 미커밋 항목(2026-07-30 시점) | 프로덕션 영향 | 비고 |
|---|---|---|
| `.ai-status/*.json` (3) | 없음 | 내부 프로세스 체크포인트 |
| `docs/SAAS_READINESS_REVIEW.md` | 없음 | SaaS 분석(범위 밖, 의도적 제외) |
| `docs/agent-decisions/0006-*`, `docs/audit/2026-07-26-saas-*` | 없음 | SaaS 문서 |
| `docs/audit/2026-07-26-v3_11-1hour-runbook.md`, `…-execution-review.md` | 없음(런타임) | v3.11 배포 **참고** 문서. 규칙 16에 따라 미스테이징(작성자가 아님) |
| `PAUL_EASY_VOCA_*.md` (23) | 없음 | 기존 SaaS 기획 문서 |

→ 배포 가능성 관점의 미커밋 블로커 0(2026-07-30 시점). **이 인벤토리
전체는 2026-07-31 문서 정리 커밋들로 전부 해소됨** — 위 3커밋도 이후
push 여부는 운영자 확인 필요.

### Check 3 — 환경 변수 (2026-07-30 시점)

> **한계 명시**: 이 환경에서 Vercel 프로젝트 env / Supabase secrets를 읽을 수
> 없다. 아래는 "코드가 요구하는 것"의 전수(grep)와 "로컬 .env 존재 여부"이며,
> 프로덕션 실제 설정 여부는 운영자가 배포 시 확인해야 한다. 단, 당시
> 프로덕션이 ≈111명에게 정상 서비스 중이라는 사실이 기존 배포 경로의 env는
> 이미 설정돼 있음을 방증한다.

| 변수 | 사용처 | 로컬 .env | 프로덕션 필요처 | 상태 판단(2026-07-30) |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | 프론트 빌드 | ✅ | Vercel(빌드타임) | 🟢 기존 설정됨(앱 동작) |
| `VITE_SUPABASE_ANON_KEY` | 프론트 빌드 | ✅ | Vercel(빌드타임) | 🟢 기존 설정됨 |
| `ADMIN_PIN` | Vercel api/* + Edge Function | ✅(.env.local) | Vercel runtime + Supabase secret | 🟡 Vercel은 기존 설정됨. admin-content-write용 Supabase secret 확인 필요 |
| `SUPABASE_URL` | Vercel api/* + Edge Function | ❌(VITE_만 있음) | Vercel runtime + Supabase secret | 🟡 Vercel은 기존 설정됨(api 동작). Supabase secret 확인 필요 |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel api/* + Edge Function | ❌(민감·미저장) | Vercel runtime + Supabase secret | 🟡 Vercel은 기존 설정됨. Supabase secret 확인 필요 |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` | Edge Function grade-writing-answers | ❌ | Supabase secret(선택) | ⚪ 베타 선택 — 관리자 쓰기검토 AI 보조 전용, 미설정 시 규칙기반 폴백 |

**핵심 env 발견(당시 신규 요구는 이것뿐)**: v3.11/v3.12의
admin-content-write Edge Function은 Supabase secrets
`ADMIN_PIN`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`가 필요하다. 이는
프로젝트 단위 공유 secret이나, 당시 어떤 Edge Function도 배포돼 있지
않아(admin-content-write·grade-writing-answers 모두 404, 2026-07-29
실측) secret이 설정돼 있는지 미확인이었다 → 운영자가 배포 전
`supabase secrets list`로 3개 존재 확인 필요, 없으면
`supabase secrets set`.
