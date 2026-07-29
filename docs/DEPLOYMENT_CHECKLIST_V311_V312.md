# v3.11 + v3.12 배포 체크리스트 (통합本) — 커리큘럼/숙제 쓰기 보안 락다운

_작성: 2026-07-30. 이 문서 하나로 (1)변경 파일 검증 (2)정확한 배포 명령
(3)마이그레이션 순서 (4)롤백 (5)50명 베타 런치 체크리스트를 전부 담는다.
**판단 게이트(언제 멈출지)의 원본은 `docs/audit/2026-07-26-v3_11-1hour-
runbook.md`**이고 이 문서는 그 실행판 + v3.12 통합 + 베타 확장이다._

배경: `docs/SECURITY_AUDIT_V311.md`(취약점/상태), `docs/SAAS_READINESS_
REVIEW.md`(멀티테넌트=범위 밖). 프로젝트 ref `azsjthtdjfpnctffjfsk`(공개).

> ⚠️ **에이전트는 배포/DDL을 실행하지 못한다** — 이 환경에 Supabase 액세스
> 토큰/프로젝트 링크/service_role 키가 없고(CLI 미인증), 헌법 규칙 8이 에이전트
> DDL을 금지하며, 라이브 관리자 저장 게이트(④)는 사람만 가능. 아래는 전부
> **운영자 실행용**이다. 코드/문서는 code-complete + 검증 PASS 상태.

---

## 1. 변경 파일 검증 (Task 1) — 2026-07-30 재확인

전부 로컬 워킹트리에 존재(미커밋), build + verify 5종 PASS로 회귀 없음 확인.

### 배포에 실제로 반영되는 코드 (프론트 빌드 + Edge Function)

| 파일 | 변경 | 검증 |
|---|---|---|
| `supabase/functions/admin-content-write/index.ts` | `handleAssignmentSet` + `'assignment.set'` 등록(기존 8 action/auth/CORS 무변경) | grep 2건 확인, 업서트 onConflict `class_id,date`가 `supabase_v1_3_schema.sql` `unique(class_id,date)`와 정합 |
| `src/utils/wordLibrary.js` | `setTodaysAssignment`/`setAssignmentForDate`에 옵셔널 `adminPin` dual-path(falsy=레거시 anon 무변경) | grep 확인, verify:admin PASS(레거시 경로 회귀 0) |
| `src/components/AdminScreen.jsx` | 4개 호출부에 pin 배선(FutureAssignmentPlanner prop 포함) | grep 확인(setTodaysAssignment pin 3곳 + planner prop 1곳) |
| `src/components/MatchGameShell.jsx` | 미니게임 결과 별 표시를 실제 지급값에 일치(과다약속 제거) | `PERFECT_BONUS` 참조 0건 확인, 지급 로직 무변경 |

### DB 마이그레이션 파일 (운영자 수동 실행)

| 파일 | 상태 | 멱등 |
|---|---|---|
| `supabase_v3_11_lockdown_curriculum_write.sql` | classes/units/words RLS enable + SELECT-only | ✅ `drop policy if exists` 후 재생성 |
| `supabase_v3_12_lockdown_daily_assignments.sql` | daily_assignments 기존 `allow anon all` 제거 → SELECT-only | ✅ 동일 패턴 |

### 문서 (참고)

`docs/DEPLOYMENT_CHECKLIST_V311_V312.md`(이 문서), `docs/DEPLOY_COMMANDS_
V311_V312.md`, `docs/SECURITY_AUDIT_V311.md`, `docs/BETA_LAUNCH_STATUS.md`,
`docs/SAAS_READINESS_REVIEW.md`.

**검증 결과(2026-07-30 재실행)**: `npm run build` ✅ / `verify:writing` 3/3 ✅
/ `verify:persistence` 8/8 ✅ / `verify:student` 4/4 ✅ / `verify:quiz` 2/2 ✅
/ `verify:admin` 6/6 ✅.

---

## 2. 정확한 배포 명령 (Task 2)

### 2-1. 사전 준비 (1회)
```bash
supabase login
supabase link --project-ref azsjthtdjfpnctffjfsk
supabase secrets list    # ADMIN_PIN / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 3개 존재 확인
# 없을 때만(값은 문서/로그에 남기지 말 것):
# supabase secrets set ADMIN_PIN=**** SUPABASE_URL=https://azsjthtdjfpnctffjfsk.supabase.co SUPABASE_SERVICE_ROLE_KEY=****
```

### 2-2. Edge Function 배포 (v3.11 + v3.12 공통 — 1번으로 둘 다 커버)
```bash
supabase functions deploy admin-content-write
supabase functions list      # admin-content-write = ACTIVE 확인
```
배포 스모크(미인가 응답 = 정상, 실제 쓰기 없음):
```bash
curl -s -X POST "https://azsjthtdjfpnctffjfsk.supabase.co/functions/v1/admin-content-write" \
  -H "apikey: <anon_key>" -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" -d '{"action":"assignment.set"}'
# 기대: {"ok":false,"reason":"not_authorized"} (HTTP 200)
```

### 2-3. 프론트 배포 확인
Vercel 프로덕션 최신 배포가 `main` HEAD(이 세션 변경 포함)인지 확인. 구버전이면
재배포하고 완료까지 대기. **SQL 실행 전 반드시 최신 프론트 + 배포된 함수가 라이브.**

### 2-4. SQL 실행 (Supabase 대시보드 SQL Editor, 각각 begin/commit)
```sql
-- (1) v3.11 먼저
begin;
alter table classes enable row level security;
drop policy if exists "classes anon read only" on classes;
create policy "classes anon read only" on classes for select using (true);
alter table units enable row level security;
drop policy if exists "units anon read only" on units;
create policy "units anon read only" on units for select using (true);
alter table words enable row level security;
drop policy if exists "words anon read only" on words;
create policy "words anon read only" on words for select using (true);
commit;
```
```sql
-- (2) v3.12 다음
begin;
alter table daily_assignments enable row level security;
drop policy if exists "allow anon all" on daily_assignments;
drop policy if exists "daily_assignments anon read only" on daily_assignments;
create policy "daily_assignments anon read only" on daily_assignments for select using (true);
commit;
```

### 2-5. 락다운 정합성 프로브 (anon key, 쓰기 차단 확인)
```bash
for t in classes units words daily_assignments; do
  echo -n "$t: "; curl -s -o /dev/null -w '%{http_code}\n' \
    "https://azsjthtdjfpnctffjfsk.supabase.co/rest/v1/$t" -X POST \
    -H "apikey: <anon_key>" -H "Authorization: Bearer <anon_key>" \
    -H "Content-Type: application/json" -d '{}'
done
# 기대: 42501(권한 거부)=잠김 성공. 23502 등이면 아직 안 걸린 것.
```

---

## 3. 마이그레이션 순서 (Task 3) — 어기면 관리자 쓰기가 깨진다

**엄격한 의존성 순서 (각 단계는 앞 단계 완료가 전제):**

```
① secrets 확인
      ↓
② admin-content-write 배포  ─── (관리자 커리큘럼+숙제 쓰기가 이 함수로 라우팅)
      ↓
③ 프론트 최신 배포 확인      ─── (pin을 함수에 실어 보내는 배선이 라이브)
      ↓
④ [사람] 관리자 저장 라이브 게이트: 유닛 이름 1회 + 숙제 배정 1회 저장
      ↓   (둘 다 성공해야만 다음 — 하나라도 실패 시 ①~③ 재확인, SQL 금지)
⑤ supabase_v3_11 SQL 실행   ─── (classes/units/words anon 쓰기 차단)
      ↓
⑥ supabase_v3_12 SQL 실행   ─── (daily_assignments anon 쓰기 차단)
      ↓
⑦ 정합성 프로브(42501) + 관리자/학생 기능 테스트(§5-C/§5-D)
```

**왜 이 순서인가:**
- **함수 배포(②)가 SQL(⑤⑥)보다 먼저**: SQL이 anon 쓰기를 막으므로, 그 전에
  service_role로 쓰는 함수가 살아 있어야 관리자 쓰기가 계속된다. 순서를
  뒤집으면 관리자 반/유닛/단어/숙제 저장이 전부 42501로 즉시 깨진다.
- **v3.11 SQL(⑤)이 v3.12 SQL(⑥)보다 먼저**: 필수는 아니나 실패 지점을
  좁히기 위해 커리큘럼 먼저 확정 후 숙제. 둘 다 독립적이라 순서 자체가
  기능을 깨지는 않지만, 문제 격리를 위해 권장 순서를 지킨다.
- **게이트 ④(사람)가 SQL 앞**: SQL은 준-비가역(롤백은 되지만 프로덕션
  영향)이라, 배선이 라이브에서 실제 동작함을 사람이 눈으로 확인한 뒤에만
  잠근다. v3.12에서 특히 중요 — 숙제 배정은 **현재 정상 동작 중**이라
  게이트 없이 잠그면 잘 되던 기능을 깨뜨린다.
- **미커밋 코드 주의**: 이 세션 변경은 아직 미커밋이다. ③의 "프론트 최신"이
  성립하려면 운영자가 **먼저 이 변경을 커밋/머지/배포**해야 한다(회귀 재검 후).
  배포된 구버전 번들에는 assignment.set 배선이 없다.

---

## 4. 롤백 (Task 4)

원본: `docs/audit/2026-07-26-v3_11-lockdown-execution-review.md` §4. SQL은
순수 정책 추가라 롤백도 대칭적(멱등).

### 4-1. v3.11 롤백 (classes/units/words 원상)
```sql
alter table classes disable row level security;
alter table units   disable row level security;
alter table words   disable row level security;
```
### 4-2. v3.12 롤백 (daily_assignments 원상)
```sql
-- SELECT-only 정책을 없애고 원래의 전체허용 정책을 되살린다(정확한 원상복귀).
drop policy if exists "daily_assignments anon read only" on daily_assignments;
create policy "allow anon all" on daily_assignments for all using (true) with check (true);
```
> 주의: classes/units/words는 원래 RLS가 **없던** 테이블이라 `disable row
> level security` 3줄로 정확히 원상복귀된다(§4-1). 반면 daily_assignments는
> 원래 `allow anon all` 정책이 **있던** 테이블이므로, 단순히 RLS를 끄기보다
> 위처럼 그 정책을 되살리는 것이 원래 상태로 가장 정확히 복귀하는 방법이다.

### 4-3. 언제 롤백하나 (판단)
- **롤백은 최후 수단**: 롤백하면 원 취약점(무인증 전체 CRUD)이 다시 열린다.
  "새 함수 경로에 예상 못한 장애로 관리자 업무가 급히 막혔을 때"의 임시
  조치로만.
- **관리자 저장이 42501/인증실패로 깨지면** → 먼저 §3의 ②③(함수 배포/프론트
  최신)가 실제로 끝났는지 재확인. 대부분 롤백이 아니라 누락된 선행조건을
  마저 끝내는 게 정답.
- **코드 롤백은 별개 축**: SQL 롤백과 무관하게, 프론트/함수는 Vercel/Supabase
  이전 배포로 되돌린다(사전에 현재 배포 ID/커밋 해시 기록해둘 것).
- **원칙**: 롤백 상태로 방치하지 않는다. 롤백 직후 원인 조사 → 재실행.

---

## 5. 50명 베타 런치 체크리스트 (Task 5)

전제: **단일 학원 베타**(멀티테넌트 아님 — `docs/SAAS_READINESS_REVIEW.md`).
현재 프로덕션이 이미 ≈111명 실사용 중이므로 **50명은 검증된 스케일 이내**라
인프라 증설 불필요. 신규 Vercel 함수 0개(assignment.set은 기존 함수에 추가)라
Hobby 12함수 한도도 무영향.

### 5-A. 런치 전 (보안·배포 게이트)
- [ ] 이 세션 변경 커밋/push(운영자 회귀 재검 후) — §3 ③ 전제
- [ ] §2 전체(함수 배포 → 프론트 → 게이트 ④ → v3.11 SQL → v3.12 SQL) 완료
- [ ] §2-5 정합성 프로브: classes/units/words/daily_assignments 모두 42501
- [ ] 실행 전 백업(런북 §2): 현재 정책 상태 쿼리 캡처, classes/units/words CSV
      export, 현재 Vercel 배포 ID 기록
- [ ] Supabase 플랜 자동 백업/PITR 활성 여부 대시보드 확인

### 5-B. 런치 전 (콘텐츠·로스터)
- [ ] 베타 대상 반/유닛/단어가 관리자 화면에 정상 등록(엑셀/PDF 업로드 성공)
- [ ] 베타 학생 ≤50명 로스터 생성, 각 학생 반/유닛 매핑(UUID 기준) 확인
- [ ] 각 학생 PIN 발급/전달 방식 확정(pin_setup_allowed 토글 or 초기 PIN 배포)
- [ ] 오늘/이번 주 숙제 배정(daily_assignments) 저장 정상 확인 — 배포 후 경로

### 5-C. 런치 전 (관리자 기능 수동 테스트 — 배포 후)
`docs/audit/2026-07-26-v3_11-1hour-runbook.md` §4. 테스트 전용 반에서:
- [ ] 반 생성 / 이름변경 / 삭제
- [ ] 유닛 추가
- [ ] 단어 엑셀 업로드 / PDF 업로드 / 개별 수정
- [ ] 추가 정답(뜻) 인정, (해당 시) 쓰기검토 AI 일괄 인정
- [ ] 쓰기시험 설정 / 게임화 설정 변경
- [ ] **숙제 배정 저장(오늘/특정일) — v3.12 신규 경로**
- [ ] (대조군) 학생 반 일괄이동 — 항상 정상이어야 정상

### 5-D. 런치 전 (학생 기능 수동 테스트)
런북 §5. ≥3개 실기기(iOS Safari / Android Chrome / 데스크톱):
- [ ] 로그인(이름+PIN) / 세션 유지 / 새로고침 복구
- [ ] 유닛 전환 / 단어 학습 / 발음 듣기·녹음
- [ ] 예문 학습 / 퀴즈 / 쓰기시험
- [ ] 4·4 미션 → 기프트 / 별·스티커 저장 / 캘린더 / 다이어리
- [ ] 미니게임(풍선/낚시/피자/기차) 결과 별 표시 = 실제 지급값(이 세션 수정 확인)
- [ ] 백그라운드 복귀 재동기화 / 오프라인→온라인 진행도 병합

### 5-E. 런치 데이 (Go/No-Go)
- [ ] 위 5-A~5-D 전부 통과 = **GO**. 하나라도 미해결 = **NO-GO**(연기)
- [ ] 관리자 1명 이상이 반/숙제 편집 흐름 숙지
- [ ] 학부모 안내(있다면) 발송, 학생 PIN 배포 완료
- [ ] 롤백 절차(§4) 및 이전 배포 ID를 손 닿는 곳에 준비

### 5-F. 런치 후 첫 주 모니터링
- [ ] Day1: 관리자 쓰기 실패(alert/42501) 관찰 — 발생 시 §4-3 판단
- [ ] Day1~3: 학생 로그인/진행도 저장 실패 리포트 수집
- [ ] 실사용 데이터로 완료율/이탈/오답 관찰(student-analytics — 실데이터만)
- [ ] 알려진 한계(`docs/BETA_LAUNCH_STATUS.md` §4) 재확인: 발음 별 dedup
      의미·미니게임 올클리어 보너스 실지급 여부(제품 결정 대기)
- [ ] 50명 안정 후 확장 판단 — 멀티테넌트는 별도 프로젝트(고객 검증 후)

---

## 부록 — 미완/주의

- **커밋 상태**: 이 세션까지의 코드/문서 변경은 **미커밋**. 운영자 회귀 재검
  후 본인이 커밋/push(헌법 규칙 14 소커밋, 규칙 16 자신 파일만).
- **함수 배포 = 유일한 실 배포 액션**: 이후 관리자 쓰기가 함수 경로로 확정되므로,
  배포 직후 게이트 ④를 반드시 사람이 확인.
- **제품 판단 2건**(범위 밖, 미변경): 발음 별 dedup 라운드 스코프, 미니게임
  올클리어 보너스 실지급. `docs/SECURITY_AUDIT_V311.md`·`BETA_LAUNCH_STATUS.md`.
