# v3.11 + v3.12 배포 커맨드 시트 (운영자용 복붙 참고)

_작성: 2026-07-30. 이 문서는 명령어 "복붙 참고"다. **판단 게이트(언제 멈출지,
무엇을 눈으로 확인할지)는 반드시 `docs/audit/2026-07-26-v3_11-1hour-runbook.md`
를 따르라** — 이 시트는 그 런북의 명령어만 모은 것이고, 런북의 60분 룰/중단
기준을 대체하지 않는다._

**왜 에이전트가 대신 실행하지 못했나**: 이 개발 환경에는 Supabase 액세스
토큰/프로젝트 링크/service_role 키가 없고(CLI 미인증), 저장소 헌법 규칙 8이
에이전트의 DDL 실행을 금지한다. 또 런북 게이트 ④(프로덕션 관리자 UI 로그인
후 저장 테스트)는 사람이 브라우저에서만 할 수 있다. 그래서 코드/문서/검증만
완료하고, 아래 배포는 운영자가 실행한다.

프로젝트 ref: `azsjthtdjfpnctffjfsk` (공개 URL에 포함, 비밀 아님).

---

## 0. 이번 배포로 닫히는 것

- **v3.11**: classes/units/words anon 직접 쓰기 차단 + 현재 404로 깨진 관리자
  커리큘럼 쓰기 복구.
- **v3.12**: daily_assignments(숙제 배정) anon 직접 쓰기 차단. **assignment.set
  action이 같은 admin-content-write 함수에 추가돼 있어, 함수 배포 1번으로 v3.11·
  v3.12 쓰기 경로가 모두 커버된다**(코드 배선 완료, 이 세션에서 code-complete).

---

## 1. 사전 준비 (런북 ①)

```bash
# CLI 로그인(대화형, 1회)
supabase login

# 프로젝트 링크(1회)
supabase link --project-ref azsjthtdjfpnctffjfsk

# 시크릿 확인 — ADMIN_PIN / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 3개가 있어야 함
supabase secrets list
# 없으면(값은 절대 이 문서/로그에 남기지 말 것):
# supabase secrets set ADMIN_PIN=**** SUPABASE_URL=https://azsjthtdjfpnctffjfsk.supabase.co SUPABASE_SERVICE_ROLE_KEY=****
```

## 2. Edge Function 배포 (런북 ②) — v3.11 + v3.12 공통

```bash
supabase functions deploy admin-content-write

# 배포 확인
supabase functions list           # admin-content-write 가 ACTIVE 인지
```

배포 후 빠른 라이브 스모크(선택, anon key로 미인가 응답 확인 — 실제 쓰기 안 함):
```bash
# adminPin 없이 호출 → { "ok": false, "reason": "not_authorized" } (HTTP 200) 여야 정상
curl -s -X POST "https://azsjthtdjfpnctffjfsk.supabase.co/functions/v1/admin-content-write" \
  -H "apikey: <anon_key>" -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" -d '{"action":"assignment.set"}'
```

## 3. 프론트 최신 확인 (런북 ③)

Vercel 대시보드에서 최신 프로덕션 배포가 `main` HEAD(이 세션 변경 포함)인지
확인. 구버전이면 재배포. **주의: 아래 SQL 실행 전에 반드시 최신 프론트 +
배포된 함수가 라이브여야 한다**(안 그러면 관리자 쓰기가 42501로 깨짐).

## 4. 배선 라이브 게이트 (런북 ④) — 사람이 직접

프로덕션 관리자 로그인 → 아무 반의 (a) 유닛 이름 저장, (b) **오늘의 단어(숙제)
배정 저장** 각 1회 → 둘 다 정상 저장돼야 v3.11·v3.12 배선이 라이브에서 맞다는
뜻. **하나라도 실패하면 SQL 실행 금지**, ①~③ 재점검.

## 5. SQL 실행 (런북 ⑤) — 순서 중요: v3.11 먼저, 그 다음 v3.12

Supabase 대시보드 SQL Editor에서 **각각 begin/commit으로 감싸서** 실행:

```sql
-- (1) v3.11 — supabase_v3_11_lockdown_curriculum_write.sql 내용
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
-- (2) v3.12 — supabase_v3_12_lockdown_daily_assignments.sql 내용
begin;
alter table daily_assignments enable row level security;
drop policy if exists "allow anon all" on daily_assignments;
drop policy if exists "daily_assignments anon read only" on daily_assignments;
create policy "daily_assignments anon read only" on daily_assignments for select using (true);
commit;
```

## 6. 실행 후 검증 (런북 ⑥·⑦)

런북 §4(관리자 기능 12항목: 반 CRUD + 숙제 배정 포함) + §5(학생 기능) 전부
클릭 테스트. 하나라도 "관리자 인증 실패"류면 런북 §6 롤백 판단 트리
(`disable row level security` 3줄, 멱등)로 즉시 롤백 후 ①~④ 재점검.

## 7. 배포 후 정합성 프로브 (선택, anon key로 쓰기 차단 확인)

락다운이 실제로 걸렸는지 무부작용 프로브(빈 body → 42501이면 잠김 성공):
```bash
for t in classes units words daily_assignments; do
  echo "== $t =="; curl -s -o /dev/null -w '%{http_code}\n' \
    "https://azsjthtdjfpnctffjfsk.supabase.co/rest/v1/$t" -X POST \
    -H "apikey: <anon_key>" -H "Authorization: Bearer <anon_key>" \
    -H "Content-Type: application/json" -d '{}'
done
# 기대: 42501(권한 거부) → 락다운 성공. 23502 등 다른 오류면 아직 안 걸린 것.
```

---

_이 시트의 명령은 운영자 실행용이다. 코드/문서는 code-complete이며 검증
통과 상태(build + verify:writing/persistence/student/quiz/admin PASS)._

---

## 8. v3_13(Curriculum Engine Phase 0) 합류 노트 (2026-07-31 append, 리뷰 반영)

`supabase_v3_13_curriculum_engine_phase0.sql`(별도 파일, 아직 미실행)이
만드는 신규 테이블 5개(`publishers`/`grades`/`grammar_points`/
`unit_grammar_points`/`examples`)는 **이 시트의 v3.11/v3.12와 완전히
같은 신뢰 모델 전환 대상**이다 — 처음에는 이 문서의 §0~§7과 동일하게
anon 개방 RLS로 시작하고, v3.11/v3.12 락다운이 실제로 라이브에 배포된
뒤에만 별도 마이그레이션으로 잠근다.

- **경고**: 이 시트의 v3.11/v3.12만 실행하고 v3_13은 그대로 두면,
  `examples`(및 나머지 4개 신규 테이블)는 **여전히 anon이 직접 쓸 수
  있는 상태로 남는다** — v3.11/v3.12는 `classes`/`units`/`words`/
  `daily_assignments`만 잠그고 `examples` 등은 건드리지 않기 때문이다.
  즉 "v3.11+v3.12 완료 = 전체 커리큘럼 쓰기 잠김"이 아니다. `examples`를
  잠그려면 v3_13 파일 안의 "락다운 합류 블록"(현재 주석 처리)을 **별도로,
  이 시트의 순서(비밀 확인 → Edge Function 배포 → 프론트 확인 → 배선
  라이브 게이트 → SQL 실행 → 사후 검증) 그대로** 다시 밟아야 한다.
- **join 지점**: v3_13 파일 안의 "[락다운 합류 블록 — 주석 처리, 현재
  미실행]"이 바로 이 시트의 §5(SQL 실행)에 해당하는 v3_13용 대응
  단계다 — 전제조건 3개(admin-content-write 배포·adminPin 실배선·
  v3.11/v3.12 선실행)를 그 블록 바로 위 주석에서 확인할 것.
- **M1 재실행 경고(품질 참고)**: v3_13의 개방 정책 가드는 정책 **이름**이
  아니라 "그 테이블에 정책이 하나라도 있는지"만 확인하도록 수정돼 있다
  (2026-07-31 리뷰 반영). 즉 위 락다운 합류 블록을 먼저 실행한 뒤에
  v3_13 파일의 앞부분(1~5번 절)을 실수로 다시 실행해도 anon 개방 정책이
  재생성되지 않는다 — 이 시트의 v3.11/v3.12 SQL과 달리 별도 재실행 방지
  조치가 파일 자체에 내장돼 있다는 뜻(안전판이지 실행 순서를 대체하지는
  않음).
