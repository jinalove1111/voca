# Task 1 — Seasonal Progression / House Reset Economy 수리 보고서

_작성: 2026-07-23, season-system-specialist. 범위: `GAME_DESIGN.md` 9번
섹션(Seasonal Progression) 구현 갭 수리. 프로덕션 DB에는 읽기 전용
조회만 수행했고, 실제 "새 시즌 시작" 액션은 프로덕션에 단 한 번도
실행하지 않았다(아래 "안전 준수 증거" 참고)._

## 0. 요약

| 항목 | 상태 |
|---|---|
| 관리자 UI 검사 | 완료 — `SeasonPanel`(`src/components/AdminScreen.jsx`) |
| SQL vs 라이브 DB 대조 | 완료 — 실측(§2) |
| 프론트/DB 이름 대조 | 완료 — 불일치 없음(§3) |
| RPC 계약 | 신규 RPC 설계 + mock 계약 테스트로 검증(§3, §6) |
| 삼켜지는 에러 발견/수리 | 발견 1건, 수리 완료(§5) |
| 잘못된 season-readiness 판정 발견/수리 | 발견 1건, 수리 완료(§5) |
| 4대 요구 동작(종료+생성/번호증가/시작종료일/활성1개보장) | 전부 신규 구현(§4) |
| 원자적 RPC + 동시 실행 보호 | 신규 구현(§4) — Postgres 고유 보장은 SQL 실행 후 라이브 검증 필요 |
| 관리자 확인 모달 강화 | 완료(§7) |
| `npm run build` | PASS |
| `npm run verify:all`(seasonalProgression 포함) | PASS — `login` 도메인만 기존 BLOCKED(로컬 서비스롤 키 부재, 무시 대상) |
| 프로덕션 데이터 훼손 | 없음(읽기 전용 조회만 수행, 실제 시즌 전환 미실행) |

## 1. 먼저 읽은 문서/코드 (조사 근거)

`PROJECT_GUIDE.md` → `GAME_DESIGN.md` 9번 섹션(원문 + "9.x 구현 완료
(2026-07-19)" 부록) → `supabase_v2_8_seasonal_progression.sql` →
`src/utils/seasonApi.js` → `api/start-new-season.js` →
`src/components/AdminScreen.jsx`의 `SeasonPanel` → `src/utils/
ticketEconomy.js`의 `sumTicketBalanceSince` → `src/utils/houseSystem.js`의
`computeHouseSeasonScores` → `scripts/testSeasonalProgression.mjs` →
`tests/harness/registry.mjs`의 `seasonalProgression` 도메인 →
`handoff.md`에서 "Seasonal"/"시즌" 검색(2026-07-19 10차 최초 구현,
2026-07-20 1차 타임스탬프 비교 버그 수정 — 이후 추가 세션 없음, 규칙 3
확인: 이번 라운드가 v2_8 이후 첫 후속 작업).

## 2. SQL vs 라이브 DB 실측 대조

읽기 전용 프로브 스크립트(`.env`/`.env.local`의 `VITE_SUPABASE_URL`/
`VITE_SUPABASE_ANON_KEY`, anon key)로 직접 조회 — **어떤 쓰기도 하지
않음**:

```
seasons select(*) -> { data: [], error: null, status: 200 }  // 0행, 정상
select(season_number, ended_at, is_active) -> error 42703
  "column seasons.season_number does not exist"
ADMIN_PIN 로컬 설정: true
SUPABASE_SERVICE_ROLE_KEY 로컬 설정: false
```

**결론**: `supabase_v2_8_seasonal_progression.sql`은 실제로 실행돼 있다
(`seasons` 테이블 존재, 0행 — 관리자가 아직 한 번도 "새 시즌 시작"을
누른 적이 없다는 뜻이지 테이블 부재가 아님). `season_number`/`ended_at`/
`is_active` 컬럼은 존재하지 않는다 — 이번 라운드에 준비한
`supabase_v3_5_season_lifecycle.sql`은 **아직 미실행**이며, 운영자가
Supabase SQL Editor에서 수동 실행해야 한다(§8).

RLS: `seasons` 테이블은 v2_8 SQL대로 anon read-only(SELECT만 GRANT)로
확인됐다 — anon key로 SELECT는 성공하고, INSERT/UPDATE는 애초에 GRANT가
없어 시도하지 않고도 코드(`api/start-new-season.js`)의 서버 전용 쓰기
경로가 유일한 쓰기 통로임을 재확인했다.

## 3. 프론트엔드 참조 이름 vs 실제 DB 객체 이름 대조

| 프론트/서버 코드가 참조하는 이름 | 실제 DB 객체 | 일치 여부 |
|---|---|---|
| `seasons` 테이블(`id, started_at, note`) | `public.seasons`(동일 3컬럼) | 일치 |
| `seasons.season_number`/`ended_at`/`is_active`(이번 라운드 신규 참조) | v3_5 SQL 실행 전에는 미존재 | **의도적 폴백 설계**(§4, §5) — 불일치가 아니라 graceful degradation |
| `api/start-new-season.js`가 호출하는 RPC `start_new_season(p_note)` | v3_5 SQL 실행 전에는 미존재(함수 자체가 신규) | **의도적 폴백 설계** — PGRST202/42883 감지 시 레거시 insert로 자동 전환 |

기존(v2_8) 3개 컬럼 이름은 프론트/서버/DB 전부 완전히 일치했다 — v2_8
자체에는 이름 불일치 버그가 없었다. 불일치처럼 보일 수 있는 지점은 전부
이번 라운드에 새로 추가한 컬럼/RPC이고, 미실행 상태에서도 앱이 깨지지
않도록 코드가 명시적으로 감지·폴백한다.

## 4. 발견된 구조적 갭(요구 동작 대비) — v2_8 최초 구현의 알려진 한계

`GAME_DESIGN.md` 9.x 부록에 이미 "다음 라운드 후보"로 명시돼 있던 사항
포함, 실제 갭:

1. **시즌 "종료" 개념 자체가 없었다** — v2_8은 `seasons`에 새 행을
   insert만 했다. 이전 시즌을 명시적으로 "종료"(비활성화 + 종료일 기록)
   하는 로직이 없었고, "현재 시즌"은 오직 "가장 최근 `started_at` 행"
   이라는 암묵적 관례에만 의존했다.
2. **시즌 번호가 없었다** — 관리자가 "몇 번째 시즌"인지 확인할 방법이
   없었다.
3. **시작/종료 일자 쌍이 없었다** — `started_at`만 있고 `ended_at`이
   없어 시즌 이력(1번 시즌은 언제 끝났는지)을 조회할 수 없었다.
4. **활성 시즌 유일성이 DB 레벨에서 보장되지 않았다** — "가장 최근 행"
   관례는 대부분 맞지만, DB 제약(unique index)이 없어 데이터가 꼬이면
   (수동 SQL 실수 등) 조용히 틀린 값을 보여줄 수 있었다.
5. **원자적 전환/동시 실행 보호가 없었다** — `api/start-new-season.js`
   최초 버전은 단순 `insert` 한 줄이라, 관리자가 "새 시즌 시작" 버튼을
   더블클릭하거나 네트워크가 재시도하면 두 개의 새 시즌 행이 원자성
   없이 거의 동시에 insert될 수 있었다(레이스 컨디션).

이번 라운드는 위 5가지를 전부 수리했다 — **리셋 대상(House 팀 점수)이나
리셋 안 되는 대상(레벨/뱃지/스트릭/XP/티켓/학습기록/출석/숙제)의 범위는
전혀 바꾸지 않았다**. `sumTicketBalanceSince`/`computeHouseSeasonScores`
(파생 계산 함수, `src/utils/ticketEconomy.js`/`src/utils/houseSystem.js`)
는 이번 라운드에 **한 줄도 수정하지 않았다** — 여전히 `started_at` 문자열
하나만 경계로 쓰고, 신규 컬럼(`season_number`/`ended_at`/`is_active`)은
표시·이력·무결성 보장 용도일 뿐 그 계산 함수들의 시그니처를 바꾸지
않는다(무회귀 확정).

### 수리 내역

- **신규 마이그레이션**: `supabase_v3_5_season_lifecycle.sql`(멱등,
  운영자 실행 대기, §8) — `seasons`에 `season_number integer`/
  `ended_at timestamptz`/`is_active boolean not null default true` 컬럼
  추가, 기존 행 백필(있다면), `is_active` 단일 partial unique index +
  `season_number` unique index, 그리고 원자적 전환 RPC
  `start_new_season(p_note text)`.
- **RPC `start_new_season`**: 한 함수 호출 = 암묵적 트랜잭션 1개. 내부에서
  ① `pg_advisory_xact_lock(hashtext('public.start_new_season'))`으로 동시
  호출을 직렬화, ② 현재 활성 시즌을 `is_active=false, ended_at=now()`로
  종료, ③ `max(season_number)+1`로 새 번호 계산, ④ 새 활성 시즌 insert.
  `SECURITY DEFINER`이지만 `anon`/`authenticated`에서 `EXECUTE` 권한을
  명시적으로 회수하고 `service_role`에만 부여 — RLS를 우회하는 함수라
  이 권한 회수가 유일한 방어선(학생이 직접 RPC를 호출해 전교생 시즌을
  임의로 리셋시키는 그리핑 방지, v2_8 테이블 GRANT 정책과 같은 원칙).
- **`api/start-new-season.js`**: 1순위로 위 RPC를 호출, RPC가 없는 환경
  (PGRST202/42883, v3_5 미실행)에서만 v2_8 시절 단순 insert로 폴백
  (규칙 9 — 실행 순서 무관 안전, 기존 동작 100% 보존). RPC 실행 중 실패
  (제약 위반 등)는 `table_missing`과 구분해 `code`/`details`/`hint`까지
  그대로 클라이언트에 전달(§5).
- **`src/utils/seasonApi.js`**: 확장 컬럼 조회를 우선 시도하고, 컬럼
  없음(42703)/테이블 없음(42P01/PGRST204/PGRST205)이면 v2_8 시절 기본
  컬럼 조회로 폴백. `fetchCurrentSeasonDetailed()`를 신설(§5), 기존
  `fetchCurrentSeason()`(Dashboard.jsx 등 학생 화면 전용)은 시그니처/
  안전 폴백 동작 100% 유지.

## 5. 삼켜지는 에러 / 잘못된 season-readiness 판정 — 발견 및 수리

**발견(수리 전 코드, `src/utils/seasonApi.js` 원본)**:
```js
export async function fetchCurrentSeason() {
  const { data, error } = await supabase.from('seasons')...
  if (error || !data) return null   // 모든 에러를 "시즌 없음"으로 뭉뚱그림
  ...
}
```
`error`가 "테이블 없음"(정상적인 SQL 미실행 상태)이든 "네트워크 끊김/
권한 오류/기타 진짜 장애"든 구분 없이 전부 `null`로 삼켜졌다. 관리자
화면(`SeasonPanel`)은 이 `null`을 그대로 "아직 시즌이 시작되지 않았어요"
로 표시했다 — **진짜 조회 실패를 "시즌 미시작"으로 오판정**하는 버그
(잘못된 season-readiness 판정 조건).

**수리**: `fetchCurrentSeasonDetailed()` 신설 — "테이블/컬럼 없음"(정상,
`error:null` 반환)과 "진짜 조회 실패"(`error:{code,message,details,hint}`
반환)를 코드로 구분한다. `SeasonPanel`이 이 함수로 전환돼 이제 두 상태를
다른 문구로 보여준다:
- 시즌 없음(정상): "아직 시즌이 시작되지 않았어요 — 하우스 팀 점수가
  전체 누적 값으로 표시되고 있어요."
- 진짜 조회 실패: "시즌 정보를 불러오지 못했어요(시즌이 없는 게 아니라
  조회 오류예요): `<message>` (code: `<code>`)"

기존 `fetchCurrentSeason()`(학생 화면 `Dashboard.jsx` 전용)은 **그대로
모든 에러를 null로 삼킨다** — 의도적 유지(학생 화면은 에러를 노출하지
않는다는 기존 원칙, 무회귀).

`api/start-new-season.js`도 기존에는 RPC 실행 중 실패 시 `error.message`
한 줄만 던졌는데, 이번에 `code`/`details`/`hint`까지 응답에 포함하도록
수정했고, `src/utils/seasonApi.js`의 `triggerStartNewSeason()`이 그
필드들을 `Error` 객체에 실어 `SeasonPanel`이 상세 사유를 그대로 보여줄
수 있게 했다(§9 에러 표면화 요구사항 충족).

## 6. RPC 파라미터/반환 구조 대조

| 항목 | 설계 | 검증 방법 |
|---|---|---|
| RPC 이름 | `start_new_season` | mock 테스트가 실제 호출 URL(`/rpc/start_new_season`)을 가로채 확인 |
| 파라미터 이름 | `p_note`(SQL 함수 시그니처와 서버 코드의 `supabase.rpc('start_new_season', { p_note: note })`가 정확히 일치) | mock 테스트 B1에서 실제 전송된 요청 바디의 키가 `p_note`인지 실측 |
| 반환 구조 | `returns table(id, season_number, started_at, ended_at, is_active, note)` — PostgREST가 배열로 반환 | 서버 코드가 `Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data`로 양쪽 형태 모두 안전 처리, mock 테스트가 배열 응답을 정확히 첫 행으로 매핑하는지 실측 |

## 7. 관리자 확인 모달 강화 (`SeasonPanel`, `src/components/AdminScreen.jsx`)

기존에는 `window.confirm`에 고정 문구만 있었다(시즌 번호/영향 학생 수
없음). 이번에 다음을 추가:
- 현재 시즌 이름(메모)·번호·시작일(없으면 "없음(이번이 첫 시즌)")
- 새 시즌 번호(입력한 메모 포함)
- 영향받는 학생 수(`getStudents().length`, `wordLibrary.js` 기존 export
  재사용 — 신규 쿼리 없음)
- "리셋되는 것: 하우스 팀 점수만" / "보존되는 것: XP·누적 포인트·레벨·
  학습 기록·스트릭·티켓 잔액/상점" 명시
- "되돌릴 수 없어요" 경고
- 새 시즌 이름/메모 입력칸 신설(`triggerStartNewSeason`이 원래부터
  `note` 파라미터를 받았지만 `SeasonPanel`이 한 번도 전달한 적이
  없었다 — 이미 설계된 기능을 실제로 연결한 것뿐, 신규 게임 콘텐츠
  아님)
- 실행 중 버튼/입력칸 비활성화는 기존에 이미 있었고 그대로 유지, 추가로
  `startingRef`(useRef) 가드를 얹어 React state 배칭 타이밍과 무관하게
  더블클릭을 동기적으로 즉시 막음(방어 심층화)
- 성공 후 `setSeason(res.season)`으로 즉시 갱신(기존 동작 유지)

학생 대상 화면(`Dashboard.jsx`)은 이번 라운드에 전혀 건드리지 않았다.

## 8. 신규 마이그레이션 파일 — 실행 필요 여부

| 파일 | 실행 필요 여부 |
|---|---|
| `supabase_v2_8_seasonal_progression.sql` | **이미 실행됨**(§2 실측 확인, 재실행 불필요) |
| `supabase_v3_5_season_lifecycle.sql`(신규, 이번 라운드) | **운영자가 Supabase SQL Editor에서 수동 실행 필요**. 미실행 상태에서도 앱은 v2_8 시절과 100% 동일하게 동작(코드가 컬럼/RPC 부재를 감지해 자동 폴백, §4) — 실행을 미뤄도 회귀 없음, 실행하면 시즌 번호/종료일/활성 플래그/원자적 전환/동시 실행 보호가 켜짐. |

## 9. 신규/변경 환경변수

없음. `api/start-new-season.js`는 기존 `ADMIN_PIN`/
`SUPABASE_URL`(또는 `VITE_SUPABASE_URL`)/`SUPABASE_SERVICE_ROLE_KEY`
(또는 `VITE_SUPABASE_ANON_KEY` 폴백)만 그대로 사용한다.

## 10. 테스트 결과

| 테스트 | 방식 | 결과 |
|---|---|---|
| `scripts/testSeasonalProgression.mjs`(기존, 무변경) | 순수 함수(`sumTicketBalanceSince`/`computeHouseSeasonScores`) | **PASS**(20+ 단언, 무회귀 재확인) |
| `scripts/testStartNewSeasonApi.mjs`(신규) A — 인증/메서드 가드 | 실제 `api/start-new-season.js` 핸들러 직접 호출(DB 호출 이전 차단이라 안전) | **PASS** |
| 〃 B1 — RPC 정상 응답 매핑 | `globalThis.fetch` mock(PostgREST 응답 흉내, 실네트워크 0건) | **PASS** |
| 〃 B2 — RPC 함수 없음 → 레거시 insert 폴백 | 〃 | **PASS** |
| 〃 B3/B3.5 — 테이블 없음 → `table_missing` | 〃 | **PASS** |
| 〃 B4 — RPC 실행 중 실패 → code/details/hint 표면화(삼킴 없음) | 〃 | **PASS** |
| 〃 D — RPC 알고리즘 순수 JS 시뮬레이션(번호 증가/유일 활성/이전 시즌 보존, 동시성 제외) | 로컬 순수 계산 | **PASS** |
| 〃 C — advisory lock 동시 요청 직렬화 | Postgres 세션 필요 | **SQL 실행 후 라이브(스테이징/프로덕션) 검증 필요** — JS mock으로 증명 불가, 정직하게 SKIP |
| 〃 C — `is_active` unique index로 인한 실제 unique_violation 발생 | 〃 | **SQL 실행 후 검증 필요** — SKIP |
| 〃 C — 이전 시즌 `season_number`/`ended_at`이 실제 라이브에 채워지는지 | 〃 | **SQL 실행 후 검증 필요** — `season_number` 컬럼 자체가 미존재(42703 실측), SKIP |
| 활성 시즌 유일성(라이브) | DB 제약 확인 | **SQL 실행 후 검증 필요** |
| 원자적 롤백(RPC 실패 시 부분 반영 없음) | Postgres 함수 = 암묵적 트랜잭션(설계상 보장) | 설계는 완료, **실제 실패 케이스 재현은 SQL 실행 후 라이브 검증 필요** |
| 확인 모달/로딩 상태/에러 상세/성공 후 새로고침 | 코드 리뷰 + 수동 시나리오 추적(`SeasonPanel` 구현) | **코드 레벨 확인 완료**(React 렌더 테스트 인프라가 이 저장소에 없음 — `TESTING.md` 카테고리 3 한계와 동일) |
| `npm run build` | vite build | **PASS**(에러/신규 경고 없음) |
| `npm run verify:all` | 전체 하네스 | `login` 도메인만 기존 known FAIL(로컬 서비스롤 키 부재, 지시대로 무시), **나머지 전부 PASS**(`seasonalProgression` 포함, 2개 스크립트) |

## 11. 데이터 보존 증거

1. **원장/기록 테이블 무접촉** — `api/start-new-season.js`(RPC 경로/
   레거시 경로 모두)와 `supabase_v3_5_season_lifecycle.sql`이 다루는
   테이블은 오직 `public.seasons` 하나뿐이다. `students`/`xp_ledger`/
   `student_progress`/`daily_assignments`/`entrance_tests`/
   `word_king_history` 등 어떤 테이블도 SELECT 외에 참조하지 않는다
   (코드 전수 확인 — `grep`으로 이번 변경분에 등장하는 테이블/RPC 대상이
   `seasons`/`start_new_season` 뿐임을 실측).
2. **`sumTicketBalanceSince`/`computeHouseSeasonScores` 무변경** — 이번
   라운드에 이 두 함수를 담은 파일(`ticketEconomy.js`/`houseSystem.js`)을
   **한 줄도 수정하지 않았다**(git status로 미변경 확인). 기존
   `testSeasonalProgression.mjs`가 "레벨/뱃지/스트릭류 필드가 섞여도 그
   계산 경로가 참조/변형하지 않는다"를 이미 실측 증명하고 있고, 이 라운드
   재실행에서도 그대로 PASS했다(§10).
3. **append-only 유지** — RPC는 이전 활성 시즌을 `UPDATE`로
   `is_active=false`/`ended_at`만 채우고 **행 자체를 삭제하지 않는다**.
   `scripts/testStartNewSeasonApi.mjs` §D(순수 JS 시뮬레이션)가 "이전
   시즌 행이 테이블에서 사라지지 않음(길이 불변, append-only)"을 3세대
   전환까지 실측 확인.
4. **학생 화면 무변경** — `Dashboard.jsx`를 이번 라운드에 전혀 건드리지
   않았다(git status 확인). 학생이 보는 "이번 시즌 누적 점수" 표시
   로직/조건은 100% 그대로.

## 12. 안전 준수 증거 (프로덕션 DB 무훼손)

- `seasons` 테이블 조회는 전부 anon key SELECT만 사용(§2) — INSERT/UPDATE/
  DELETE를 프로덕션에 단 한 번도 실행하지 않았다.
- 새 RPC `start_new_season`을 라이브 Supabase에 대해 실행한 적이 없다
  (SQL 파일만 준비 — 규칙 8, 에이전트는 DDL 직접 실행 불가).
- `scripts/testStartNewSeasonApi.mjs`의 B 섹션은 `globalThis.fetch`를
  가로채는 순수 mock이며, 이 파일 안에서 실제 프로덕션 URL로 나가는
  요청은 코드상 존재하지 않는다(mock이 커버하지 못하는 URL로 요청이
  가면 즉시 `throw`하도록 설계 — "이 테스트가 예상하지 못한 실제 네트워크
  요청" 가드).
- `git add`/`git commit`/`git push`를 전혀 실행하지 않았다 — 아래
  "변경 파일" 목록은 전부 작업 트리에만 존재.

## 13. 롤백 방법

- **코드 롤백**: 아래 "변경 파일" 목록을 이전 커밋 상태로 되돌리면 된다
  (아직 커밋되지 않았으므로 `git checkout -- <파일>` 또는 단순 폐기).
  `api/start-new-season.js`/`src/utils/seasonApi.js`는 RPC가 없으면
  자동으로 v2_8 시절 동작으로 폴백하므로, **코드만 롤백하고
  `supabase_v3_5_season_lifecycle.sql`을 실행한 상태로 남겨둬도 안전**
  (새 컬럼/RPC가 있어도 v2_8 시절 코드가 그것들을 그냥 참조하지 않을
  뿐, 에러 없음).
- **SQL 롤백**(운영자가 v3_5를 실행한 뒤 되돌리고 싶을 경우): 이 SQL은
  컬럼 3개 + 인덱스 2개 + 함수 1개만 추가한다. 되돌리려면
  ```sql
  drop function if exists public.start_new_season(text);
  drop index if exists idx_seasons_single_active;
  drop index if exists idx_seasons_season_number;
  alter table public.seasons drop column if exists season_number;
  alter table public.seasons drop column if exists ended_at;
  alter table public.seasons drop column if exists is_active;
  notify pgrst, 'reload schema';
  ```
  (이 롤백 SQL은 파일로 준비하지 않았다 — 실행이 필요해지면 이 보고서
  블록을 그대로 SQL Editor에 붙여넣으면 된다. `id`/`started_at`/`note`
  3개 컬럼과 기존 행은 전혀 건드리지 않아 v2_8 상태로 정확히 복귀한다.)

## 14. 변경 파일 (작업 트리에만 존재, 커밋 안 함)

- `supabase_v3_5_season_lifecycle.sql`(신규)
- `api/start-new-season.js`(수정 — RPC 1순위 + 레거시 폴백 + 에러 표면화)
- `src/utils/seasonApi.js`(수정 — 확장 컬럼 폴백 조회 + `fetchCurrentSeasonDetailed` 신설 + 에러 표면화)
- `src/components/AdminScreen.jsx`(수정 — `SeasonPanel`만: 확인 모달 강화, 로딩/에러 상태 세분화, 더블클릭 가드, 새 시즌 메모 입력칸, `getStudents` import 1개 추가)
- `scripts/testStartNewSeasonApi.mjs`(신규 — mock 계약 테스트)
- `tests/harness/registry.mjs`(수정 — `seasonalProgression` 도메인에 신규 스크립트 등록)
- `TESTING.md`(append — 카테고리 4 표에 신규 테스트 설명 1행 추가)
- `docs/operations/task1-season-report.md`(이 문서, 신규)
- `.ai-status/implementer-season-repair.json`(신규 체크포인트)

## 15. 검수 대기 사항

- qa-reviewer/security-reviewer 코드 리뷰(특히 RPC의 `SECURITY DEFINER`
  + `EXECUTE` 권한 회수 설계, advisory lock 사용이 이 저장소 최초의
  Postgres 함수/RPC 도입이라는 점).
- 운영자의 `supabase_v3_5_season_lifecycle.sql` 실행 여부 판단(§8).
- SQL 실행 후 필요한 라이브 재검증 목록(§10의 "SQL 실행 후 검증 필요"
  행 전부) — 우선순위: ① `set role anon; select * from
  public.start_new_season('x');`이 42501로 거부되는지(그리핑 방지 최종
  확인), ② 관리자 화면에서 실제로 "새 시즌 시작"을 1회 눌러 `season_number`
  가 1로 시작하고 `is_active`가 정확히 1행인지, ③ 두 번째 "새 시즌 시작"
  이후 첫 시즌 행의 `ended_at`이 채워지고 여전히 테이블에 남아있는지.
