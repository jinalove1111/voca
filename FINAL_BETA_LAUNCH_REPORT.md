# FINAL Beta Launch Report — Paul Easy Voca

_작성: 2026-07-30. 최종 프로덕션 준비 감사(코드/커밋/DB 변경 없음, 읽기 전용
감사 + 이 문서 작성만). 종합 판정과 상세 참조는 아래. 배포 절차 원본:
`docs/DEPLOYMENT_CHECKLIST_V311_V312.md`, 판단 게이트:
`docs/audit/2026-07-26-v3_11-1hour-runbook.md`, 종합 판정:
`docs/BETA_LAUNCH_READINESS_REPORT.md`._

---

## 0. 최종 판정

**학생 학습 제품 = READY. 실제 베타 GO의 유일한 관문 = 운영자 배포 1시퀀스**
(커밋 push → Vercel 프론트 배포 → Edge Function 배포 → 라이브 게이트 →
v3.11 SQL → v3.12 SQL). 코드/문서는 커밋 완료·검증 PASS. **이 환경에서
실행 불가능한 것(배포/DDL/env 설정)만 남았고, 전부 운영자 액션이다.**

---

## 1. origin/main 대비 커밋 (Check 1)

**로컬 main이 origin/main보다 3커밋 앞섬. 미push(지시대로).**

| Hash | 유형 | 요약 |
|---|---|---|
| `db4e169` | docs | v3.11/v3.12 배포·보안·베타 문서 + handoff |
| `e88cf54` | fix | 미니게임 결과 별 표시를 실제 지급값에 일치 |
| `5b49c92` | fix(security) | v3.12 daily_assignments 무인가 쓰기 락다운 dual-path |

전부 검증 완료(build + verify:writing/persistence/student/quiz/admin PASS).
push: `git push origin main`(운영자 판단).

## 2. 프로덕션에 영향 주는 미커밋 파일 (Check 2)

**없음 — 프로덕션 코드/SQL은 100% 커밋됨.** 미커밋 잔여는 전부 비-런타임:

| 미커밋 항목 | 프로덕션 영향 | 비고 |
|---|---|---|
| `.ai-status/*.json` (3) | 없음 | 내부 프로세스 체크포인트 |
| `docs/SAAS_READINESS_REVIEW.md` | 없음 | SaaS 분석(범위 밖, 의도적 제외) |
| `docs/agent-decisions/0006-*`, `docs/audit/2026-07-26-saas-*` | 없음 | SaaS 문서 |
| `docs/audit/2026-07-26-v3_11-1hour-runbook.md`, `…-execution-review.md` | 없음(런타임) | v3.11 배포 **참고** 문서. 내가 작성 안 함 → 규칙 16로 미스테이징. 커밋된 CHECKLIST가 이들을 참조하므로 운영자가 별도 커밋 권장 |
| `PAUL_EASY_VOCA_*.md` (23) | 없음 | 기존 SaaS 기획 문서(내 세션 이전) |

→ **배포 가능성 관점의 미커밋 블로커 0.** 단, 배포된 프론트가 v3.12 배선을
가지려면 위 3커밋을 **먼저 push + Vercel 빌드**해야 함(§4-B3).

## 3. 환경 변수 (Check 3)

> **한계 명시**: 이 환경에서 Vercel 프로젝트 env / Supabase secrets를 읽을 수
> 없다. 아래는 "코드가 요구하는 것"의 전수(grep)와 "로컬 .env 존재 여부"이며,
> 프로덕션 실제 설정 여부는 **운영자가 배포 시 확인**해야 한다. 단, 현재
> 프로덕션이 ≈111명에게 정상 서비스 중이라는 사실이 **기존 배포 경로의 env는
> 이미 설정돼 있음**을 방증한다.

| 변수 | 사용처 | 로컬 .env | 프로덕션 필요처 | 상태 판단 |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | 프론트 빌드 | ✅ | Vercel(빌드타임) | 🟢 기존 설정됨(앱 동작) |
| `VITE_SUPABASE_ANON_KEY` | 프론트 빌드 | ✅ | Vercel(빌드타임) | 🟢 기존 설정됨 |
| `ADMIN_PIN` | Vercel api/* + Edge Function | ✅(.env.local) | Vercel runtime + **Supabase secret** | 🟡 Vercel은 기존 설정됨. **admin-content-write용 Supabase secret 확인 필요** |
| `SUPABASE_URL` | Vercel api/* + Edge Function | ❌(VITE_만 있음) | Vercel runtime + **Supabase secret** | 🟡 Vercel은 기존 설정됨(api 동작). **Supabase secret 확인 필요** |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel api/* + Edge Function | ❌(민감·미저장) | Vercel runtime + **Supabase secret** | 🟡 Vercel은 기존 설정됨. **Supabase secret 확인 필요** |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` | Edge Function grade-writing-answers | ❌ | Supabase secret(선택) | ⚪ **베타 선택** — 관리자 쓰기검토 AI 보조 전용, 미설정 시 규칙기반 폴백(§5) |

**핵심 env 발견(신규 요구는 이것뿐)**: v3.11/v3.12의 admin-content-write
Edge Function은 Supabase secrets `ADMIN_PIN`/`SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY`가 필요하다. 이는 프로젝트 단위 공유 secret이나,
**현재 어떤 Edge Function도 배포돼 있지 않아(admin-content-write·
grade-writing-answers 모두 404, 2026-07-29 실측) secret이 설정돼 있는지
미확인**이다. → 운영자가 배포 전 `supabase secrets list`로 3개 존재 확인
(런북 ①). 없으면 `supabase secrets set`. **이것이 유일한 신규 env 액션.**

## 4. 배포 블로커 (Check 4)

| # | 블로커 | 심각도 | 해소 |
|---|---|---|---|
| B1 | admin-content-write Edge Function 미배포(404) | 🔴 필수 | `supabase functions deploy admin-content-write` — v3.11+v3.12 공통. 배포 시 현재 깨진 관리자 커리큘럼 쓰기도 복구 |
| B2 | v3.11 + v3.12 SQL 미실행 | 🔴 필수 | 대시보드에서 순서대로 실행(§go-live). 미실행 시 anon 쓰기 열림 유지 |
| B3 | 3커밋 미push → 프론트 v3.12 배선 미배포 | 🔴 필수 | `git push origin main` → Vercel 빌드. **B1보다 먼저**(배포 순서) |
| B4 | Supabase secrets 3개 존재 미확인 | 🟡 확인 | 런북 ①(§3). 없으면 set |
| B5 | 배포 순서(함수·프론트 → SQL) | 🟡 절차 | 순서 위반 시 관리자 쓰기 42501. v3.12는 현재 정상 동작 중인 숙제 배정을 순서 위반 시 깨뜨림 |

**모든 블로커가 운영자 영역(자격증명·배포·DDL·env). 이 환경에서 해소 불가는
정직한 사실이며, 각 블로커의 정확한 명령/순서는 배포 문서에 준비됨.**

## 5. 블로커 아님 / 우아한 저하 (Non-blockers)

- **grade-writing-answers Edge Function 미배포**: 학생 쓰기시험에 영향 없음.
  이 함수는 **관리자 전용**(SpellingReviewQueuePanel의 오답 변형 일괄 인정
  AI 보조)이며, 브라우저측 규칙기반 폴백(`classifyLocally`)이 있어 미배포/
  AI키 부재 시에도 관리자 검수는 규칙기반으로 동작. → AI 제공자 키는 베타 선택.
- **미커밋 SaaS/기획 문서**: 런타임 무관.
- **빌드 chunk-size 경고**: 기존, 기능 무관.

## 6. 제품 결정 대기(코드 미변경, 베타 차단 아님)

- 미니게임 "올클리어 보너스" 실지급 여부(현재 표시=실지급 일치로 정정됨).
- 발음 별 dedup 라운드 스코프 의미(현재 라운드마다 재지급 가능).
- 상세: `docs/SECURITY_AUDIT_V311.md`, `docs/BETA_LAUNCH_STATUS.md`.

---

## 7. Go-Live 시퀀스 (한국 복귀 후, 순서 고정)

_명령: `docs/DEPLOYMENT_CHECKLIST_V311_V312.md` §2. 게이트: 런북._

1. **`git push origin main`** (3커밋) → Vercel 프론트 배포 완료 대기. (B3)
2. **`supabase login` + `link --project-ref azsjthtdjfpnctffjfsk` +
   `secrets list`** — ADMIN_PIN/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 확인,
   없으면 set. (B4)
3. **`supabase functions deploy admin-content-write`** + `functions list`
   ACTIVE + 미인가 스모크(not_authorized). (B1)
4. **Vercel 최신 = HEAD 확인.**
5. **[사람] 라이브 게이트**: 프로덕션 관리자 로그인 → 유닛 이름 저장 +
   숙제 배정 저장 각 1회. **둘 다 성공해야만** 다음. 실패 시 1~4 재확인,
   SQL 금지. (B5)
6. **`supabase_v3_11_...sql` 실행 → `supabase_v3_12_...sql` 실행**
   (대시보드, 각 begin/commit). (B2)
7. **정합성 프로브**: anon 빈 body POST로 classes/units/words/
   daily_assignments 전부 **42501**(잠김 성공).
8. **수동 테스트**(관리자 CRUD + 숙제 배정, 학생 ≥3 실기기) → 이상 시
   롤백(CHECKLIST §4).
9. **베타 오픈**: ≤50명 로스터/PIN/숙제 확인 → Go/No-Go → Day1 모니터
   (관리자 쓰기 실패, 동시 복귀 버스트, 학생 저장 실패).

---

## 8. 최종 사인오프

- ✅ 코드 커밋 완료(3커밋), 검증 5종 PASS, 신규 도달 가능 버그 0.
- ✅ 미커밋 프로덕션 아티팩트 0(문서/상태 파일만 잔존).
- ✅ 신규 env 요구 1건 식별(admin-content-write용 Supabase secrets) — 배포
     시 확인 절차 문서화.
- 🔴 남은 것은 전부 운영자 배포 액션(push·함수 배포·SQL·secret 확인) —
     이 환경에서 실행 불가(자격증명 부재 + 규칙 8), 배포 문서로 turnkey.

_판정: 코드/검증 관점 READY. 배포 시퀀스 완료 = 50명 베타 GO._
