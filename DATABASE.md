# DATABASE.md — Paul Easy Voca (Supabase / Postgres)

_작성: 2026-07-18. 저장소의 `supabase_*.sql` 11개 파일 전체를 읽고 확인한 내용입니다. 라이브 DB 자체는 조회하지 않았습니다(문서 작업 범위 — 필요하면 `scripts/dbIntegrityAudit.mjs`, `scripts/testRlsSecurity.mjs`로 라이브 검증)._

## 핵심 4테이블 — 저장소에 DDL 없음 (알려진 기술부채)

`students` / `classes` / `units` / `words`는 이 프로젝트의 뼈대이지만, **저장소의 어떤 `supabase_*.sql` 파일에도 원본 `CREATE TABLE`이 없습니다.** 초기에 Supabase 대시보드에서 직접 만들어진 뒤 한 번도 파일로 백필되지 않았고, 이후 모든 마이그레이션은 이 4개 위에 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로만 얹는 방식입니다(각 마이그레이션이 `information_schema.columns`를 런타임 조회해 컬럼 타입을 방어적으로 맞추는 이유이기도 합니다).

- **영향**: 새 Supabase 프로젝트에서 이 저장소만으로 스키마를 처음부터 재현할 수 없습니다(핵심 4테이블 DDL 없이는 어떤 마이그레이션도 실행 불가) — 재해복구/신규 환경 구축 시 비용이 되는 Medium 기술부채로 2026-07-18 감사에서 기록됨(`handoff.md` 같은 날짜 Phase 2 섹션).
- **근본 수정 방법(미실행)**: `information_schema`를 service_role key로 라이브 조회해 `supabase_v0_core_schema.sql`로 백필 — anon key로는 PIN 4컬럼 등 권한 차단된 컬럼까지 정확히 못 얻어 이번 문서화 세션에서는 수행하지 않음. 운영자가 Supabase 대시보드 SQL Editor에서 직접 덤프해 채워 넣는 걸 권장.
- 아래 4테이블의 컬럼 목록은 이후 마이그레이션 파일들이 참조/추가하는 내용에서 **역추적**한 것이며, 원본 DDL이 없으므로 "이게 전부"라는 보장은 없습니다(타입/제약/그 외 컬럼이 더 있을 수 있음).

### `students` (역추적)

| 컬럼 | 타입 | 도입 | 비고 |
|---|---|---|---|
| `id` | uuid, PK | (원본) | v1.6부터 학생의 유일한 식별자(이름 아님) |
| `name` | text | (원본) | v1.6에서 `students_name_key`(UNIQUE) 제거 — 동명이인 허용 |
| `class_id` | uuid, FK → `classes(id)` | (원본) | anon UPDATE 허용 컬럼(v1.9) |
| `unit_name` | text | (원본) | 유닛 이름 문자열. v2.1 이후 하위호환 폴백 전용, `current_unit_id` 우선 |
| `current_unit_id` | uuid, FK → `units(id)`, `on delete set null` | v2.1 | 학생의 진짜 현재 유닛(FK). anon SELECT/UPDATE 명시 GRANT됨 |
| `pin_hash` | text | v1.6 | scrypt `salt:hash`. **anon/authenticated SELECT/UPDATE 차단(v1.9)** — 서버리스 함수(service_role)만 접근 |
| `pin_fail_count` | integer, default 0 | v1.6 | 5회 도달 시 잠금. anon 접근 차단(v1.9) |
| `pin_locked_until` | timestamptz | v1.6 | 브루트포스 방지 잠금 해제 시각. anon 접근 차단(v1.9) |
| `pin_setup_allowed` | boolean, default false | v1.7 | 관리자가 켜야만 학생 자기 PIN 설정 1회 허용. anon 접근 차단(v1.9) |
| `created_at` | (추정) | (원본) | v1.4 주석에서 참조만, 타입 미확인 |

### `classes` (역추적)

| 컬럼 | 타입 | 도입 | 비고 |
|---|---|---|---|
| `id` | uuid, PK | (원본) | |
| `name` | text | (원본) | |
| `spelling_test_enabled` | boolean, default false | `supabase_spelling_test_schema.sql` | 반별 쓰기시험 on/off |
| `spelling_hint_enabled` | boolean, default false | 〃 | |
| `wrong_answer_repeat_count` | integer, default 3 | 〃 | |
| `spelling_direction` | text, default `'kr2en'`→`'mixed'`(v2.0.1) | `supabase_spelling_direction_schema.sql`(→ v2.0으로 통합) | `'kr2en'\|'en2kr'\|'random'\|'mixed'`. 값 검증은 DB CHECK가 아니라 애플리케이션 레벨(`wordLibrary.js`) |
| `gamification_enabled` | boolean, default false | `supabase_v2_5_gamification_master_switch.sql`(2026-07-19) | Teacher Controls 마스터 스위치(`GAME_DESIGN.md` 13번 섹션) — `spelling_test_enabled`와 동일한 opt-in 관례. 학생 화면의 Paul Rank/XP UI(`Dashboard.jsx`)는 이 값이 true인 반에서만 렌더됨. XP 적립(`api/grant-xp.js`) 자체는 이 스위치와 무관하게 계속 기록됨(판단 근거는 `api/grant-xp.js` 헤더 주석) |

### `units` (역추적)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid, PK | |
| `class_id` | uuid, FK → `classes(id)` | |
| `name` | text | v2.1 백필 매칭에 쓰임(공백 무시 비교 포함) |

### `words` (역추적)

| 컬럼 | 타입 | 도입 | 비고 |
|---|---|---|---|
| `id` | uuid, PK | (원본) | |
| `unit_id` | uuid, FK → `units(id)` | (원본) | (v1.5 주석에서 존재 확인, 정확한 컬럼명은 코드 확인 권장) |
| `word` / `meaning` / ... | text 등 | (원본) | ROADMAP/CLAUDE.md 초안 기준 word/meaning/pronunciation/level/memoryTip/examples — 실제 라이브 컬럼과 100% 일치 여부는 미확인 |
| `accepted_meanings` | jsonb, default `[]` | v2.0 | 채점 시 `meaning` 외 추가 정답 후보. anon SELECT/UPDATE 명시 GRANT |

## 기능별 테이블 (저장소에 DDL 있음, 전부 `create table if not exists` — 멱등)

| 테이블 | 도입 | 핵심 컬럼 | FK | 용도 |
|---|---|---|---|---|
| `student_progress` | v1.3, v1.4 확장 | `student_id`(unique), `total_stars`, `cleared_count`, `streak`, `stickers_count`, `last_studied_date`, **`progress_data` jsonb**(전체 백업, `useStudent.js` record 통째), `streak_count`, `total_xp`, `calendar_data`, `mission_data`, `review_data`, `updated_at` | `student_id → students(id)` cascade | 학생 누적 진행도 클라우드 백업/복원(v2.2 병합 정책의 대상) |
| `student_daily_progress` | v1.3 | `student_id`, `date`, `categories_completed`(≥4=숙제완료), `stars_earned`, `quiz_correct`, `quiz_total`, `pronunciation_attempts`, `missed_word_ids` jsonb, unique(`student_id`,`date`) | `student_id → students(id)` cascade | 관리자 대시보드/학부모 화면의 일별 통계 원천 |
| `daily_assignments` | v1.3 | `class_id`, `date`, `word_ids` jsonb, unique(`class_id`,`date`) | `class_id → classes(id)` cascade | 반의 날짜별 오늘의 단어 배정(숙제). 비어있으면 유닛 전체로 폴백 |
| `word_status` | v1.5 | `student_id`, `word_id`, `status`(`known`\|`unknown`\|`skipped`\|`mastered`, CHECK 제약), `last_seen_at`, `updated_at`, unique(`student_id`,`word_id`) | `student_id → students(id)`, `word_id → words(id)` 둘 다 cascade | 단어별 "알아요/모르겠어요"(Skip 기능), 관리자 대시보드 집계 |
| `entrance_tests` | v1.8 | `class_id`, `date`, `status`(`active`\|`closed`), `direction`(`en2kr`\|`kr2en`\|`random`), `question_count`, `time_limit_seconds`, `words` jsonb(출제 스냅샷) | `class_id → classes(id)` cascade | 입실 단어시험 세션(교사가 시작) |
| `entrance_test_results` | v1.8 | `test_id`, `student_id`, `score`, `total`, `missed_words` jsonb, `duration_seconds`, `submitted_at`, unique(`test_id`,`student_id`) | `test_id → entrance_tests(id)`, `student_id → students(id)` 둘 다 cascade | 학생별 응시 결과 — 반별 랭킹/오늘의 VIP 계산 원천 |
| `spelling_review_queue` | v2.0 | `word_id`, `student_id`(nullable, `on delete set null`), `submitted_answer`, `direction`, `status`(`pending`\|`accepted`\|`dismissed`), `date`, unique(`word_id`,`submitted_answer`) | `word_id → words(id)` cascade | 영→한 쓰기시험에서 한글로 답한 애매한 오답의 교사 검토 큐 |
| `xp_ledger` | v2.3(2026-07-19, Paul Rank System), v2.3.1(2026-07-19, 행동 단위 리팩터링으로 `idx_xp_ledger_event_type` 인덱스만 추가 — 컬럼 변경 없음) | `student_id`, `event_type`, `amount`(smallint, CHECK 0<amount≤100), `source_event_id`, `created_at`, **unique(`student_id`,`source_event_id`)** | `student_id → students(id)` cascade | XP 지급 원장 — Rank/Hat Stage 계산의 유일한 원천. `total_xp`(위 `student_progress`)와 무관한 완전히 별도의 값(설계 판단은 `src/utils/paulRankShared.js` 헤더 참고) — 서버(`api/grant-xp.js`, service_role)만 쓰고 anon은 SELECT만 가능(아래 RLS 절 참고). unique 제약이 곧 idempotency 메커니즘. **v2.3.1**: XP는 이제 "단어"가 아니라 "행동(그날의 학습 카테고리 완료)" 단위로만 지급된다(운영자가 실측 발견한 word-unit 파밍 버그 수정 — `mission-clear`/`duplicate-sticker-bonus`/`spelling-combo-N` 이벤트는 XP 트리거에서 완전히 제거, 새 8개 행동 단위 이벤트로 교체, 상세는 `src/utils/paulRankShared.js` XP_EVENT_TABLE 헤더/`wiki/decisions.md` #10). `event_type` 값에 DB 레벨 화이트리스트 CHECK는 **의도적으로 없음**(기존 word-unit 이벤트 행이 실존해 CHECK 추가 시 마이그레이션이 깨짐 — 화이트리스트는 애플리케이션 레벨(`api/grant-xp.js`)에서만 강제, `supabase_v2_3_1_xp_action_based.sql` 헤더 참고). 과거 word-unit 행은 삭제하지 않고 그대로 두며 `xp_totals` 합계에 계속 포함됨(리셋 없음) |

**`xp_totals`(VIEW, 테이블 아님)** — `xp_ledger`를 `student_id`별로 `sum(amount)` 집계한 파생 뷰(저장 컬럼 아님, 매 조회 시 재계산). "저장된 중복값보다 파생값을 우선한다"는 이번 지시를 스키마 레벨에서 강제하기 위해 `student_progress.hat_stage` 같은 "빠른 조회용 사본 컬럼" 패턴 대신 VIEW를 선택했다(`supabase_v2_3_paul_rank.sql` 주석 참고). anon/authenticated에 SELECT GRANT됨.

## 관계도 (FK, 텍스트)

```
classes 1──N units 1──N words
classes 1──N students(class_id)
units   1──N students(current_unit_id, v2.1)  ※ nullable, on delete set null
students 1──1 student_progress (student_id unique)
students 1──N student_daily_progress
students 1──N word_status         N──1 words
classes 1──N daily_assignments
classes 1──N entrance_tests 1──N entrance_test_results N──1 students
words   1──N spelling_review_queue (student_id nullable)
```

- **반 삭제(`deleteClass()`, `AdminScreen.jsx`)의 실제 동작(라이브 실측 확인, 2026-07-18)**: `classes` 행 삭제 시 `students.class_id`는 **`ON DELETE SET NULL`**(학생 계정/진행도 보존, 반 배정만 해제) — CASCADE로 학생까지 연쇄 삭제되는 게 아님. `scripts/testClassDeleteCascade.mjs`로 QA 데이터에 대해 실측 확인됨.

## 마이그레이션 실행 순서

파일명에 버전이 내포돼 있고, 전부 `if not exists`/`add column if not exists` 기반 멱등 설계라 순서를 엄격히 지키지 않아도 대부분 안전하지만, **의미상 아래 순서**입니다. `[적용 상태]`는 `ROADMAP.md`/`handoff.md`에서 확인된 값입니다.

1. `supabase_v1_3_schema.sql` — `student_progress`(구버전)/`student_daily_progress`/`daily_assignments` 최초 생성. **[적용됨]**
2. `supabase_v1_4_full_progress_backup.sql` — `student_progress` 재정의/보강(`progress_data` 등 전체 백업 컬럼). **[적용됨]**
3. `supabase_v1_5_word_status.sql` — `word_status` 생성. **[적용됨]**
4. `supabase_spelling_test_schema.sql` — `classes`에 쓰기시험 on/off 3컬럼. **[적용됨, 2026-07-07]**
5. `supabase_spelling_direction_schema.sql` — `classes.spelling_direction` 추가 (**이후 v2.0 파일에 내용이 합쳐져 대체됨** — 이 파일을 아직 안 돌렸어도 v2.0 하나만 실행하면 됨).
6. `supabase_v1_6_student_identity.sql` — `students` UNIQUE(name) 제거 + `pin_hash`/`pin_fail_count`/`pin_locked_until`. **[적용됨, 2026-07-15/16]**
7. `supabase_v1_7_student_pin_selfsetup.sql` — `students.pin_setup_allowed`. **[적용됨]**
8. `supabase_v1_8_entrance_test.sql` — `entrance_tests`/`entrance_test_results`. **[적용됨, 2026-07-16]**
9. `supabase_v1_9_security_rls.sql` — `students` 컬럼권한(anon PIN 4컬럼 차단). **[적용됨, 2026-07-16]**
10. `supabase_v2_0_spelling_mixed.sql` — `classes.spelling_direction`(`spelling_direction_schema.sql` 내용 통합)+`words.accepted_meanings`+`spelling_review_queue`. **[적용됨, 2026-07-17]**
11. `supabase_v2_0_1_spelling_default_mixed.sql` — `classes.spelling_direction` 컬럼 기본값을 `'mixed'`로 변경(신규 반 대비, DML은 별도 `scripts/opsSetAllClassesMixed.mjs`로 이미 완료). **[권장, 실행 안 해도 무방]**
12. `supabase_v2_1_student_unit_decouple.sql` — `students.current_unit_id` 추가 + FK + 백필 + GRANT. **[상태 재확인 필요 — ROADMAP.md v1.6 섹션은 이보다 이전 시점 기준으로 "미실행 SQL 있음"을 마지막으로 기록했고, handoff.md 2026-07-17/18 기록은 이미 적용된 상태를 전제로 진행됨. 다음 세션에서 라이브 확인 권장.]**
13. `supabase_v2_3_paul_rank.sql`(2026-07-19) — `xp_ledger` 신규 테이블 + `xp_totals` 뷰. 기존 4테이블 어떤 컬럼도 건드리지 않는 순수 추가. 백필 없음(전 학생 XP=0에서 시작 — 판단 근거는 SQL 파일 주석). **[적용됨(2026-07-19, 운영자 실행 확인 — `handoff.md` 2026-07-19(3차) 섹션, `xp_ledger`/`xp_totals` 라이브 anon 쿼리로 실측). 실제 지급 경로(service_role)는 로컬 `SUPABASE_SERVICE_ROLE_KEY` 부재로 여전히 SKIP — `node scripts/testXpLedgerDb.mjs`]**
14. `supabase_v2_3_1_xp_action_based.sql`(2026-07-19, XP 행동 단위 리팩터링) — `xp_ledger`에 `idx_xp_ledger_event_type` 인덱스만 추가(컬럼/뷰 변경 없음, `event_type` 컬럼은 v2.3에 이미 존재). 스키마 변경은 이 인덱스가 전부이고, 실제 리팩터링은 대부분 애플리케이션 레벨(`src/utils/paulRankShared.js`/`src/hooks/useStudent.js`/`api/grant-xp.js`). **[미실행 — 운영자 실행 대기]**
15. `supabase_v2_4_entrance_result_rls.sql`(2026-07-19, P1 보안 감사 후속 — 입실시험 결과 서버 재검증) — `entrance_test_results`의 기존 `"allow anon all"`(using(true) with check(true)) 정책을 제거하고 `select`만 anon 허용하는 정책으로 교체(INSERT/UPDATE/DELETE는 정책을 아예 안 만들어 anon/authenticated 전면 차단, service_role만 BYPASSRLS로 계속 쓰기 가능). 새 쓰기 경로는 `api/submit-entrance-result.js`(서버가 `entrance_tests.words`로 직접 재채점 후 저장) 하나뿐 — 기존 `entranceTestApi.js`의 anon 직접 upsert 경로는 제거됨. 스키마 자체(컬럼/테이블)는 변경 없음, RLS 정책 교체만. **[미실행 — 운영자 실행 대기, 실행 전에도 이 API는 기존 v1.8 permissive 정책 하에서 정상 동작(서버가 재검증하므로 이중 방어)]**
16. `supabase_v2_5_gamification_master_switch.sql`(2026-07-19, 게임화 하위 카드 3번 — Teacher Controls 마스터 스위치) — `classes.gamification_enabled boolean not null default false` 컬럼 1개만 추가(`add column if not exists`, 멱등). GRANT 불필요(위 RLS 절 참고 — `classes`는 v1.9 컬럼단위 GRANT 대상이 아니라 테이블 단위 정책을 그대로 씀, `spelling_test_enabled` 등 기존 반별 설정 컬럼도 GRANT 없이 정상 동작 중임을 확인 후 결정). **[미실행 — 운영자 실행 대기. 실행 전에는 `wordLibrary.js`의 select 폴백 체인이 이 컬럼 없이 조회하고, `getClassSettings().gamificationEnabled`은 항상 false로 안전 폴백 — Dashboard.jsx의 Paul Rank UI는 이 SQL 실행 여부와 무관하게 계속 숨김 상태 유지]**

`supabase_v1_1_progress_sync.sql`(더 이전 버전)은 `v1_3` 파일 주석에 "대체됨, 실행 불필요"로 명시돼 있으며 저장소에 파일 자체가 없습니다(이미 정리된 것으로 보임).

## RLS / 컬럼권한 현황

이 앱은 Supabase Auth를 쓰지 않아 행 단위로 "누구인지" 구분할 방법이 없습니다. 그래서 두 가지 다른 전략이 섞여 있습니다.

**RLS "anon 전체 허용" 정책 적용된 테이블** (행 단위 보안 없음 — 표에 없는 위협은 막지 못함, 의도된 설계):
`student_progress`, `student_daily_progress`, `daily_assignments`, `word_status`, `entrance_tests`, `spelling_review_queue` — 전부 `enable row level security` + `create policy "allow anon all" ... using (true) with check (true)`.

**`entrance_test_results` — 2026-07-19부터 위 "anon 전체 허용" 그룹에서 제외 (P1 보안 감사 후속)**: `supabase_v2_4_entrance_result_rls.sql`(미실행 대기)이 적용되면 anon은 SELECT만 가능하고 INSERT/UPDATE/DELETE는 service_role 전용으로 좁혀진다. 근거: 기존 permissive 정책(using(true) with check(true))에서는 anon key로 임의 student_id/test_id의 점수를 조작 저장할 수 있었다(재현 실측). 쓰기는 이제 `api/submit-entrance-result.js`(서버가 `entrance_tests.words` 스냅샷으로 직접 재채점 후 저장, 클라이언트가 보낸 score/total은 아예 읽지 않음) 경유만 가능 — `entrance_tests`(시험 생성/종료, 관리자 전용 화면)는 이번 범위가 아니라 여전히 anon 전체 허용 그룹에 남아있다.

**`students` — RLS 대신 컬럼 단위 GRANT (v1.9, 유일하게 다른 전략)**:
- 테이블 단위 `SELECT`/`UPDATE`를 anon/authenticated에서 회수(`revoke`).
- `SELECT`는 PIN 4컬럼(`pin_hash`/`pin_fail_count`/`pin_locked_until`/`pin_setup_allowed`)을 제외한 전체 컬럼에 명시 재부여.
- `UPDATE`는 클라이언트가 실제 쓰는 컬럼만: `class_id`, `unit_name`(v1.9), `current_unit_id`(v2.1 추가 GRANT).
- `INSERT`/`DELETE`는 테이블 단위로 유지(회수 안 됨) — 학생 자기등록(`addStudent`), 관리자 삭제(`removeStudent`)가 이 경로를 씀.
- **운영 함정(반드시 지킬 것)**: `students`에 새 컬럼을 추가하는 모든 향후 마이그레이션은 `grant select (새컬럼) on public.students to anon, authenticated;`(필요시 `update`도)를 **반드시 같이** 실행해야 합니다 — 안 하면 그 컬럼만 못 읽는 게 아니라 클라이언트가 원래 읽던 컬럼까지 한 번에 깨질 수 있는 fail-closed 구조입니다(v2.1이 이 절차를 올바르게 준수한 사례로 확인됨, `handoff.md` 2026-07-18 Phase 4).

**`classes`/`units`/`words` — 저장소에 RLS/GRANT SQL 없음**: 위 grep 결과 기준으로 이 3테이블에 대한 `enable row level security`/`create policy`는 어떤 마이그레이션 파일에도 없습니다(원본 대시보드 생성 당시 설정이 무엇인지 파일로 확인 불가 — 핵심 4테이블 DDL 부재와 같은 뿌리의 기술부채). `words.accepted_meanings`만 v2.0에서 명시적으로 컬럼 GRANT 됨.

## 관련 파일

`C:\voca\supabase_v1_3_schema.sql` ~ `C:\voca\supabase_v2_5_gamification_master_switch.sql`(16개 전체), `C:\voca\src\utils\wordLibrary.js`(컬럼 부재 폴백 로직), `C:\voca\api\_pinAuth.js`(service_role 접근), `C:\voca\api\submit-entrance-result.js`(입실시험 결과 서버 재검증, 2026-07-19), `C:\voca\api\grant-xp.js`(XP 지급, 반별 스위치와 무관하게 항상 기록 — 판단 근거는 파일 헤더), `C:\voca\scripts\dbIntegrityAudit.mjs`, `C:\voca\scripts\testRlsSecurity.mjs`, `C:\voca\scripts\testClassDeleteCascade.mjs`, `C:\voca\scripts\testEntranceTestDb.mjs`, `C:\voca\scripts\testGamificationSettings.mjs`(신규, 2026-07-19)
