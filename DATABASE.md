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
| `house_id` | smallint, CHECK(1~4) | `supabase_v2_7_house_system.sql`(2026-07-19, 게임화 하위카드 8번) | House System 팀 소속. **FK 아님** — 참조할 `houses` 테이블을 의도적으로 만들지 않고 `src/utils/houseSystem.js`의 `HOUSES` 코드 상수(id 1~4)로 대체(근거는 그 SQL/JS 파일 헤더 "설계 판단 1/2" 참고). anon SELECT/UPDATE 명시 GRANT됨(규칙 10) |
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
| `weekly_event_enabled` | boolean, default false | `supabase_v2_7_house_system.sql`(2026-07-19, 게임화 하위카드 8번) | Weekly Events **설정 슬롯만**(`GAME_DESIGN.md` 8번 섹션) — 실제 이벤트 정의/트리거는 이번 라운드 범위 아님(`src/utils/houseSystem.js`의 `WEEKLY_EVENT_TYPES`가 빈 배열). 이번 라운드는 이 컬럼을 읽는 코드가 없다(의도된 죽은 슬롯 — 향후 실제 이벤트가 붙는 라운드에서 배선). House System 자체는 이 컬럼이 아니라 기존 `gamification_enabled` 마스터 스위치로 게이팅됨(Word King 선례와 일관성 — 판단 근거는 SQL 파일 "설계 판단 3" 참고) |

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
| `writing_answer_statistics` | v3.9(2026-07-24, 미실행) | `word_id`, `registered_meaning`, `student_answer`, `normalized_answer`, `count`, `accepted_count`, `rejected_count`, `distinct_student_ids` uuid[](상한 200), `first_seen`, `last_seen`, `last_decision`, `last_confidence`, `status`(`pending`\|`accepted`\|`dismissed`), `status_changed_at`, unique(`word_id`,`registered_meaning`,`normalized_answer`) | `word_id → words(id)` cascade | "선생님이 같은 검토를 두 번 하지 않는" 반복 오답 통계 — 상세는 아래 전용 서브섹션 참고 |
| `xp_ledger` | v2.3(2026-07-19, Paul Rank System), v2.3.1(2026-07-19, 행동 단위 리팩터링으로 `idx_xp_ledger_event_type` 인덱스만 추가 — 컬럼 변경 없음) | `student_id`, `event_type`, `amount`(smallint, CHECK 0<amount≤100), `source_event_id`, `created_at`, **unique(`student_id`,`source_event_id`)** | `student_id → students(id)` cascade | XP 지급 원장 — Rank/Hat Stage 계산의 유일한 원천. `total_xp`(위 `student_progress`)와 무관한 완전히 별도의 값(설계 판단은 `src/utils/paulRankShared.js` 헤더 참고) — 서버(`api/grant-xp.js`, service_role)만 쓰고 anon은 SELECT만 가능(아래 RLS 절 참고). unique 제약이 곧 idempotency 메커니즘. **v2.3.1**: XP는 이제 "단어"가 아니라 "행동(그날의 학습 카테고리 완료)" 단위로만 지급된다(운영자가 실측 발견한 word-unit 파밍 버그 수정 — `mission-clear`/`duplicate-sticker-bonus`/`spelling-combo-N` 이벤트는 XP 트리거에서 완전히 제거, 새 8개 행동 단위 이벤트로 교체, 상세는 `src/utils/paulRankShared.js` XP_EVENT_TABLE 헤더/`wiki/decisions.md` #10). `event_type` 값에 DB 레벨 화이트리스트 CHECK는 **의도적으로 없음**(기존 word-unit 이벤트 행이 실존해 CHECK 추가 시 마이그레이션이 깨짐 — 화이트리스트는 애플리케이션 레벨(`api/grant-xp.js`)에서만 강제, `supabase_v2_3_1_xp_action_based.sql` 헤더 참고). 과거 word-unit 행은 삭제하지 않고 그대로 두며 `xp_totals` 합계에 계속 포함됨(리셋 없음) |
| `word_king_history` | v2.6(2026-07-19, 게임화 하위카드 7번 — Word King) | `class_id`, `period_start` date, `period_end` date, `student_id`, `student_name` text(표시용 스냅샷), `score` numeric(6,2), `score_breakdown` jsonb(그 주 계산에 쓰인 원시 집계값 스냅샷), `rank_position` int, `computed_at`, **unique(`class_id`,`period_start`,`period_end`,`student_id`)** | `class_id → classes(id)`, `student_id → students(id)` 둘 다 cascade | 주간·서버 전용 계산 결과 스냅샷 — 관리자가 반별로 수동 트리거(`api/compute-word-king.js`)할 때마다 upsert. `entrance_tests`/`entrance_test_results`(원시 응시 데이터)를 재사용하지 않고 신규 테이블(계산 결과)로 분리한 이유는 SQL 파일 헤더 주석 참고. `xp_ledger`와 같은 이유로 `"allow anon all"`이 아니라 **anon read-only + service_role 전용 write**(아래 RLS 절 참고) — 보상(주간 챔피언 타이틀)이 걸려 조작 유인이 커지는 값이기 때문. 활동이 전혀 없는(입실시험 미응시 + XP 0) 학생은 그 주 행이 아예 생성되지 않음(0등으로 낙인찍지 않음) |
| `seasons` | v2.8(2026-07-19, 게임화 하위카드 9번 — Seasonal Progression) | `id`, `started_at` timestamptz(default now()), `note` text(선택, 순수 참고용), `created_at` | FK 없음(반/학생 무관 전역 마커) | 시즌 경계 마커 — 관리자가 "새 시즌 시작" 버튼(`api/start-new-season.js`)을 누를 때마다 새 행 1개 insert(append-only, 삭제/업데이트 없음). 가장 최근 행(`started_at` 최댓값)이 "현재 시즌". `students`/`xp_ledger`/`progress_data.ticketLedger` 등 어떤 기존 테이블도 이 SQL이 건드리지 않는다 — "리셋"은 이 경계 이후 원장 항목만 다시 합산하는 파생 계산(`src/utils/ticketEconomy.js sumTicketBalanceSince`, `src/utils/houseSystem.js computeHouseSeasonScores`)일 뿐, 물리적 삭제가 아니다(설계 판단은 SQL 파일 헤더 참고). `word_king_history`와 같은 이유로 anon read-only + service_role 전용 write(그리핑 방지 — anon 쓰기 허용 시 학생 누구나 가짜 경계로 전교생의 시즌 표시를 리셋시킬 수 있음) |

**`xp_totals`(VIEW, 테이블 아님)** — `xp_ledger`를 `student_id`별로 `sum(amount)` 집계한 파생 뷰(저장 컬럼 아님, 매 조회 시 재계산). "저장된 중복값보다 파생값을 우선한다"는 이번 지시를 스키마 레벨에서 강제하기 위해 `student_progress.hat_stage` 같은 "빠른 조회용 사본 컬럼" 패턴 대신 VIEW를 선택했다(`supabase_v2_3_paul_rank.sql` 주석 참고). anon/authenticated에 SELECT GRANT됨.

**Word King 점수 산정 입력에 대한 참고(2026-07-19)** — `GAME_DESIGN.md` §5 원안은 입실시험 정확도 + 쓰기시험 첫시도 정답률(`spellingCorrect`/`spellingTotal`) + `word_status` mastered 개수 3개 신호를 제안했으나, 실제 구현은 ①입실시험 정확도(`entrance_test_results`, 서버 재검증됨)와 ②XP 합계(`xp_ledger`, 서버 전용 쓰기) 2개만 쓴다. 나머지 두 신호는 각각 `student_progress.calendar_data`/`word_status`로 anon `"allow anon all"`이라 클라이언트가 직접 쓸 수 있는 값이라 "서버 전용 계산"이라는 이 기능의 핵심 전제와 맞지 않아 의도적으로 제외했다(`src/utils/wordKing.js` 헤더 주석 전문 참고). §11 Anti-cheat이 이미 지목한 부차 갭이 해소되면 그때 가중치만 추가하면 된다(스키마 변경 불필요).

**Ticket Economy(2026-07-19, GAME_DESIGN.md 4번 섹션) — 신규 테이블/컬럼 없음.** `student_progress.progress_data`(위 표) 안의 `useStudent.js` record에 `ticketLedger`(append-only 배열, `{id, delta, reason, at}`)가 다른 필드(`diaryPlacements` 등)와 똑같이 얹혀 그대로 백업/복원된다 — XP(`xp_ledger`)와 달리 서버 전용 원장이 아니라 기존 `stars`/`stickers`와 동일한 로컬 우선 관례를 따르기로 판단했다(판단 근거는 `src/utils/ticketEconomy.js` 헤더 주석 — 저빈도·저가치·코스메틱 소비처뿐이라 클라이언트 조작의 실질적 이득이 없음). 잔액은 저장하지 않고 `sumTicketBalance()`로 항상 파생 계산(`xp_totals`와 같은 정신). SQL 마이그레이션 파일 없음 — GRANT 대상 컬럼도 없음.

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
classes 1──N word_king_history N──1 students
seasons                                    ※ FK 없음, 반/학생과 무관한 전역 시즌 경계 마커(항상 최신 1행 = 현재 시즌)
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
17. `supabase_v2_6_word_king.sql`(2026-07-19, 게임화 하위카드 7번 — Word King) — `word_king_history` 신규 테이블(순수 추가, 기존 테이블 컬럼 0개 변경) + anon read-only RLS + service_role 전용 write. `xp_ledger`(v2.3)와 완전히 동일한 RLS 패턴 재사용. **[미실행 — 운영자 실행 대기. 실행 전에는 `api/compute-word-king.js`가 upsert 실패(테이블 없음)를 감지해 `ok:false, reason:'table_missing'`로 응답하고, `src/utils/wordKingApi.js`의 조회 함수들은 조용히 빈 결과로 폴백 — Dashboard.jsx의 "이번 주 챔피언" 텍스트는 이 SQL 실행 여부와 무관하게 안 보일 뿐 크래시 없음]**
18. `supabase_v2_7_house_system.sql`(2026-07-19, 게임화 하위카드 8번 — House System + Weekly Events 설정 슬롯) — `students.house_id`(smallint, CHECK 1~4, GRANT select/update — houses 테이블 없이 `houseSystem.js`의 코드 상수로 대체, 설계 판단은 SQL/JS 파일 헤더 참고) + 기존 학생 라운드로빈 백필(`row_number() % 4`) + `classes.weekly_event_enabled`(boolean, default false — 아직 아무 코드도 읽지 않는 설정 슬롯). **[미실행 — 운영자 실행 대기. 실행 전에는 `wordLibrary.js`의 select 폴백 체인(3단계 cascading — current_unit_id+house_id 둘 다 → current_unit_id만 → 둘 다 없음)이 이 컬럼 없이 조회하고, `addStudent()`의 자동 하우스 배정은 insert 실패 시 house_id 없는 payload로 재시도해 신규 학생 등록 자체는 막히지 않음. AdminScreen 로스터의 하우스 select는 항상 "미배정"으로 보이고, Dashboard.jsx의 팀 점수 텍스트는 `myHouse`가 null이라 렌더되지 않음(크래시 없음)]**
19. `supabase_v2_8_seasonal_progression.sql`(2026-07-19, 게임화 하위카드 9번 — Seasonal Progression) — `seasons` 신규 테이블(순수 추가, 기존 테이블 컬럼 0개 변경) + anon read-only RLS + service_role 전용 write. `word_king_history`(v2.6)와 완전히 동일한 RLS 패턴 재사용. **[미실행 — 운영자 실행 대기. 실행 전에는 `src/utils/seasonApi.js` fetchCurrentSeason()이 테이블 없음 에러를 감지해 null로 폴백 — AdminScreen.jsx SeasonPanel은 "아직 시즌이 시작되지 않았어요" 안내만 보이고, Dashboard.jsx의 "이번 시즌 누적 점수" 텍스트는 이 SQL 실행 여부와 무관하게 안 보일 뿐 크래시 없음. Ticket/House 표시는 SQL 미실행/시즌 미시작 상태에서 전부 기존 "전체 누적" 값 그대로 유지된다(회귀 없음)]**

`supabase_v1_1_progress_sync.sql`(더 이전 버전)은 `v1_3` 파일 주석에 "대체됨, 실행 불필요"로 명시돼 있으며 저장소에 파일 자체가 없습니다(이미 정리된 것으로 보임).

20. `supabase_v2_9_student_class_assignments.sql`(2026-07-21, 학생 다중 교재 동시 배정 — 설계 근거 `docs/agent-decisions/0004-multi-textbook-architecture.md`) — `student_class_assignments` 신규 테이블(순수 추가, 기존 4테이블 컬럼 0개 변경) + 인덱스 2개 + v1.3 "allow anon all" RLS 패턴 + 기존 학생 백필. **[미실행 — 운영자 실행 대기, 2026-07-21 코드 배포는 완료(커밋 `fe1cdf6`/`3a75f8a`)됐으나 이 SQL만 아직 대기 중]**. 실행 전에는 `wordLibrary.js`의 `getStudentClassAssignments()`가 `isMissingTableError()`로 테이블 부재를 감지해 `syntheticPrimaryAssignment()`(오늘의 `students.class_id`/`current_unit_id`를 그대로 합성한 단일 배정 1개)로 폴백 — 기존 294명 학생(2026-07-21 라이브 실측) 전원이 오늘과 완전히 동일하게 동작하고, `TextbookSelector.jsx`/`TextbookAssignmentPanel.jsx`는 배정이 1개 이하면 렌더 자체를 건너뛴다. 상세: `handoff.md` 2026-07-21(1차).

21. `supabase_v3_9_writing_answer_statistics.sql`(2026-07-24, "선생님이 같은 검토를 두 번 하지 않는" 자동 학습 시스템 — 반복 오답 재사용) — `writing_answer_statistics` 신규 테이블 + `record_writing_answer_stat` RPC(SECURITY DEFINER) + `ai_usage_daily`에 절약 컬럼 3종(`alter table if exists ... add column if not exists` — `supabase_v3_8_ai_usage_daily.sql` 미실행이어도 안전한 no-op) 추가. **[미실행 — 운영자 실행 대기]**. `v3_6`/`v3_7`/`v3_8`(쓰기 검수 AI 보조 캐시/동의어변형/일일사용량 — 이 문서에 아직 별도 섹션으로 반영 안 된 기존 기술부채, § 아래 신규 서브섹션 참고)과 실행 순서 무관(전부 `if exists`/`if not exists` 가드). 실행 전에는 `pipeline.js`의 `statsLookup` 훅이 `index.ts`에서 테이블 미존재(42P01/PGRST205) 감지 시 `null`로 비활성화되어 기존 캐시→AI 흐름과 100% 동일하게 동작(회귀 없음, 헌법 규칙 9), `src/utils/spellingReviewApi.js`의 `record_writing_answer_stat` RPC 호출은 42883/PGRST202로 실패하고 `_statsAvailable=false`로 세션 내 재시도만 끈 채 조용히 스킵되며 학생 채점 흐름에는 영향 없음(fire-and-forget), 관리자 화면 신규 카드 3개는 "SQL 실행 필요"/"데이터 수집 중" 안내로 폴백. 상세: `handoff.md` 2026-07-24(11차).

22. `supabase_v3_13_curriculum_engine_phase0.sql`(2026-08-01, Curriculum Engine Phase 0 — `docs/CURRICULUM_ENGINE.md`) — 신규 테이블 4개(`publishers`/`grades`/`grammar_points`(스키마만, 시드 없음)/`unit_grammar_points`) + `examples`(신규 콘텐츠 테이블, §"`examples`(v3.13)" 아래 신규 서브섹션 참고) + `textbooks`/`units` additive 컬럼(`publisher_id`/`grade_id`/`level`/`book_order`, `position`/`lesson_no`/`objectives` — `units.position`은 v1.x부터 이미 존재해 `add column if not exists`가 무시하고 기존 값 보존). 전부 순수 추가, 파괴적 구문 0. **[미실행 — 운영자 실행 대기]**. `v3_11`/`v3_12` 락다운(둘 다 이 시점 배포 대기 중)과 무관하게 독립 실행 가능 — 신규 5개 테이블은 현행 anon 개방 RLS(v3.4 관례)로 시작하고, 락다운 배포 후 합류할 주석 처리된 블록을 SQL 파일 자체에 동봉(파일 헤더 "[락다운 합류 블록]" 참고). 실행 전에는 `src/utils/curriculum/*.js`(전부 이번 세션 신규 파일)의 모든 조회가 `isMissingTableError`/42703(undefined_column) 감지로 `{ rows:[], featureDisabled:true }` 또는 `{}`/`null`로 폴백하고, 학생 화면은 예문 학습 단계 자체가 조건부(승인 예문이 있을 때만 삽입, §8)라 이 SQL 미실행 상태에서 아무 단계도 추가되지 않음(기존 플로우 byte-identical). 관리자 "📚 커리큘럼" 탭(`CurriculumHub`/`CurriculumTree`/`ExampleManager`/`ApprovalQueue`, `AdminScreen.jsx`)은 "supabase_v3_13 실행 후 사용 가능" 배너로 폴백. 상세: `handoff.md` 2026-08-01(20차).

23. `supabase_v3_15_word_assets.sql`(2026-08-04, Word Asset Library — 단어 텍스트 키 기반 콘텐츠 자산) — `word_assets` 신규 테이블 1개(순수 추가, `words` 테이블 컬럼 0개 변경) + 인덱스 4개 + anon SELECT-only RLS(처음부터 락다운 상태로 시작 — 아래 신규 서브섹션 "RLS 설계 정정" 참고) + 규칙 기반 백필(`words.example_text`/`memory_tip`을 그대로 복사, AI 비용 0원, 기대 결과 599행). 전부 순수 추가, 파괴적 구문 0. **[미실행 — 운영자 실행 대기]**. 상세: 아래 신규 서브섹션 "`word_assets`(v3.15)".

## `student_class_assignments` (v2.9, 2026-07-21 — 코드 배포 완료 / SQL 미실행)

학생 1계정이 여러 반(=교재 컨테이너, "핵심 결정" 참고)을 동시에 진행할 수 있게 하는 신규 다대다 조인 테이블. 설계 전문은 `docs/agent-decisions/0004-multi-textbook-architecture.md`, DDL 원문은 `supabase_v2_9_student_class_assignments.sql`.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` 기본값 |
| `student_id` | uuid, FK → `students(id)`, `on delete cascade` | not null |
| `class_id` | uuid, FK → `classes(id)`, `on delete cascade` | not null. 여기서 "class"는 곧 "교재" — 새 `textbooks` 엔티티는 만들지 않고 기존 `classes`를 재사용(핵심 설계 결정, 0004 문서) |
| `current_unit_id` | uuid, FK → `units(id)`, `on delete set null` | nullable. **이 교재(반) 안에서의** 현재 진도 — `students.current_unit_id`(전역 단일 포인터)와 별개 |
| `is_primary` | boolean, not null default false | 아래 참고 |
| `created_at` | timestamptz, default `now()` | |

제약: `unique(student_id, class_id)`. 인덱스: `idx_student_class_assignments_student_id`, `idx_student_class_assignments_class_id`(둘 다 역방향 조회용).

**RLS**: v1.3 시대부터 써온 "allow anon all" 패턴(`enable row level security` + `create policy "allow anon all" ... for all using (true) with check (true)`) 그대로 재사용 — `student_progress`/`daily_assignments` 등과 동일 그룹. `xp_ledger`/`word_king_history`처럼 서버 전용 계산값이 아니라 학생 자기 자신의 배정 상태를 클라이언트가 직접 읽고 쓰는 일반 데이터로 판단했기 때문(0004 문서 "RLS 정책" 절 근거).

**현재 상태(2026-07-21 기준, NOT YET LIVE)**: 이 SQL은 아직 Supabase에 실행되지 않았다. 코드(`wordLibrary.js`/`TextbookSelector.jsx`/`TextbookAssignmentPanel.jsx`)는 이미 배포돼 있지만, 테이블이 없는 동안은 `getStudentClassAssignments()`가 항상 폴백 경로(`syntheticPrimaryAssignment()`)만 타므로 이 테이블을 실제로 조회/삽입하는 코드는 아직 라이브에서 한 번도 실행된 적이 없다. 실행 이후에도 트리거는 두지 않기로 결정했다(이 저장소 전체가 DB 트리거를 쓰지 않는 기존 관례를 유지) — 신규 학생 생성(`addStudent`) 시 `is_primary=true` 배정 행을 함께 insert하는 로직은 이번 SQL에 포함되지 않은 후속 구현 과제로 명시적으로 남아 있다(SQL 파일 헤더 "트리거를 쓰지 않는 이유" 절 참고).

**`students.class_id`/`students.current_unit_id`의 의미 갱신(이 마이그레이션 실행 이후부터 적용)**: 이 두 컬럼(위 "students(역추적)" 표 참고)은 삭제되지 않고 계속 존재하지만, 이 SQL 실행 이후로는 "학생의 유일한 반/유닛"이 아니라 **`student_class_assignments`에서 `is_primary = true`인 행의 동기화된 캐시(synced cache)** 로 이해해야 한다 — 진실 원천(source of truth)은 조인 테이블로 옮겨가고, 이 두 컬럼은 "학생은 반이 하나"를 전제하는 기존 15개 이상의 호출부(`getStudentClassId`/`getStudentWords`/입실시험/관리자 명단 도구 등)가 코드 변경 없이 계속 정상 동작하도록 하기 위한 하위호환용 미러(mirror)다. 마이그레이션 미실행 상태 또는 학생이 배정 1개(주 교재)만 가진 상태에서는 이 구분이 관측 가능한 차이를 만들지 않는다 — 두 번째 이상 교재가 배정된 학생부터 "이 학생의 전체 반 목록은 `student_class_assignments`를 봐야 한다"는 차이가 실질적으로 드러난다.

## `writing_answer_statistics` (v3.9, 2026-07-24 — 코드 완료 / SQL 미실행)

"선생님이 같은 검토를 두 번 하지 않는" 자동 학습 시스템의 핵심 테이블 —
학생이 실제로 제출한 (단어, 등록 뜻, 정규화 답안) 조합의 등장/판정
이력을 집계해, 반복적으로 `reject_candidate` 판정을 받은 조합은 AI를
다시 부르지 않고 그 판정을 재사용한다. DDL 원문은
`supabase_v3_9_writing_answer_statistics.sql`, 설계/사용 상세는
`handoff.md` 2026-07-24(11차).

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` 기본값 |
| `word_id` | uuid, FK → `words(id)`, `on delete cascade` | not null |
| `registered_meaning` | text | 판정 당시 등록 뜻 스냅샷 — 관리자가 나중에 `meaning`을 고치면 새 스냅샷 조합이 새 행으로 분리됨(`spelling_ai_grading_cache.meaning_snapshot`과 동일 설계 원칙) |
| `student_answer` | text | 마지막 원문 예시(가장 최근 제출 원문 그대로, 표시/디버깅용) |
| `normalized_answer` | text | `pipeline.js normalizeForCompare()` 결과 |
| `count` | integer, default 1 | 이 (단어, 등록뜻, 정규화답안) 조합의 총 등장(제출) 횟수 |
| `accepted_count` | integer, default 0 | AI가 `accept`로 판정한 횟수 |
| `rejected_count` | integer, default 0 | AI가 `reject_candidate`로 판정한 횟수 — 반복 스킵의 핵심 신호 |
| `distinct_student_ids` | uuid[], default `{}` | 고유 학생 UUID만 저장(이름 절대 저장 안 함, 헌법 규칙 4). 상한 200개 — 초과분은 `count`와 무관하게 배열에 더 추가 안 됨 |
| `first_seen` / `last_seen` | timestamptz | |
| `last_decision` | text | `'accept'` \| `'review'` \| `'reject_candidate'` \| null |
| `last_confidence` | numeric | |
| `status` | text, default `'pending'`, CHECK(`pending`\|`accepted`\|`dismissed`) | 관리자가 이 통계 행 자체를 확인·정리했는지 표시(관리자 UI가 `status`/`status_changed_at`만 UPDATE) |
| `status_changed_at` | timestamptz | |

제약: `unique(word_id, registered_meaning, normalized_answer)`. 인덱스:
`idx_writing_answer_statistics_word_id`.

**RLS(테이블 자체는 anon 직접 쓰기 불가 — RPC 전용 쓰기 경로)**:
- `enable row level security` + `SELECT`는 anon/authenticated 전체
  허용(관리자 패널 조회용, `using (true)`).
- `UPDATE`는 컬럼 단위로 `(status, status_changed_at)`만 anon/
  authenticated에 GRANT — 관리자가 "이 반복 오답 통계를 확인했다"고
  표시하는 용도로만 열려 있고, `count`/`accepted_count`/
  `rejected_count`/`distinct_student_ids` 등은 클라이언트가 절대 직접
  못 바꾼다.
- `INSERT`/`DELETE`는 anon/authenticated에 GRANT하지 않음(의도적) —
  행 생성/`count` 증가는 오직 아래 RPC를 통해서만 가능.

**`record_writing_answer_stat(p_word_id uuid, p_registered_meaning text,
p_student_answer text, p_normalized_answer text, p_student_id uuid
default null) returns void`** — SECURITY DEFINER, `search_path=public`
고정. 입력 검증(빈 문자열 거부, `student_answer<=500자`,
`normalized_answer<=200자`). `INSERT ... ON CONFLICT (word_id,
registered_meaning, normalized_answer) DO UPDATE`로 원자적 upsert —
`count+1`, `student_answer`는 최신 원문으로 교체, `last_seen=now()`,
`distinct_student_ids`는 중복/`null`/200개 상한을 방어한 뒤 append.
`PUBLIC`에서 EXECUTE 권한을 회수한 뒤 `anon`/`authenticated`/
`service_role`에만 재부여 — 테이블 자체에 대한 INSERT/UPDATE 권한 없이도
SECURITY DEFINER로 함수 소유자 권한을 빌려 `count` 등을 갱신하므로,
"테이블 직접 쓰기 권한 없이 이 RPC 하나로만 증가 가능한 구조"가 남용
면적을 최소화하는 의도된 설계다. 호출부: `src/utils/spellingReviewApi.js`
의 `logSpellingReview`(학생 채점 경로, await 없이 fire-and-forget).

**서버 측 반영(update 전용, 이 RPC와 별도)**: `supabase/functions/
grade-writing-answers/index.ts`의 `bumpWritingAnswerStatAfterAiJudgment`
가 AI가 실제로 새로 판정한 proposal에 대해서만(캐시 히트/통계 스킵
제외) 이미 존재하는 행의 `last_decision`/`last_confidence`와
`accepted_count`(accept 시) 또는 `rejected_count`(reject_candidate 시)
를 `service_role`로 갱신한다 — 행이 없으면(아직 RPC로 안 만들어짐)
조용히 스킵하는 update 전용 함수이고, 이 함수는 새 행을 만들지 않는다
(행 생성은 오직 위 RPC 몫).

**`ai_usage_daily` 절약 컬럼 3종(같은 SQL 파일에 포함)**:
`rules_resolved_count`/`cache_hit_count`/`stats_skip_count`(전부
integer, default 0) — `alter table if exists ... add column if not
exists`로 `supabase_v3_8_ai_usage_daily.sql`(쓰기 검수 AI 보조 Provider
추상화 세션, 이 문서에는 아직 별도 섹션으로 반영되지 않은 기존 기술부채
— `v3_6`/`v3_7`/`v3_8`도 함께 미문서화 상태) 미실행이어도 안전하게
no-op된다.

**pg_cron 배치 없음(의도적)**: 관리자 화면의 "AI 추천 학습"/"학습률"
카드는 이 테이블을 새벽 배치 없이 라이브 쿼리로 직접 조회한다 — 111명
규모에서 별도 배치 인프라를 새로 만들 필요가 없다는 판단(무료/최소
인프라 우선, 헌법 규칙 7). SQL 파일 헤더에 이 판단 근거가 명시돼 있다.

## `examples` + `publishers`/`grades`/`grammar_points`/`unit_grammar_points` (v3.13, 2026-08-01 — 코드 완료 / SQL 미실행)

Curriculum Engine Phase 0(`docs/CURRICULUM_ENGINE.md`)의 콘텐츠 평면
핵심 신규 테이블 5개. DDL 원문은
`supabase_v3_13_curriculum_engine_phase0.sql`, 설계 상세는
`docs/CURRICULUM_ENGINE.md` §2(ER 다이어그램)/§3(승인 워크플로우), 통합
작업 로그는 `handoff.md` 2026-08-01(20차).

| 컬럼(`examples`) | 타입 | 비고 |
|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` 기본값 |
| `unit_id` | uuid, FK → `units(id)`, `on delete set null` | **nullable** — 특정 유닛에 정렬되지 않은 범용 예문 풀 허용(§2 각주) |
| `textbook_id` | uuid, FK → `textbooks(id)`, `on delete set null` | nullable, 위와 동일 이유 |
| `word_id` | uuid, FK → `words(id)`, `on delete set null` | nullable |
| `target_word` | text, not null | 저장 시점에 `normalizeTargetWord`(소문자+trim)로 정규화 — `fetchApprovedExamplesForWords`의 조회 키와 항상 일치 |
| `english_sentence` | text, not null | `target_word`를 whole-word(대소문자 무관)로 포함해야 함(클라이언트 `validateExampleFields`가 DB 왕복 전에 먼저 검증) |
| `korean_translation` | text | nullable |
| `grammar_point_id` | uuid, FK → `grammar_points(id)`, `on delete set null` | nullable |
| `difficulty` | int, not null default 1, CHECK 1..5 | |
| `source` | text, not null default `'teacher'`, CHECK(`teacher`\|`import`\|`rule`\|`ai`) | 생성기/임포트/AI 경로(`source!=='teacher'`)는 `exampleLibrary.js`의 `createExample`이 `approval_status`를 항상 `'draft'`로 강제(교사 행을 절대 auto-publish 못 하게 하는 구조적 가드) |
| `approval_status` | text, not null default `'draft'`, CHECK(`draft`\|`pending`\|`approved`\|`rejected`) | 학생 노출 = `approved`만(§3) — 이 하드코딩은 SQL이 아니라 `fetchApprovedExamplesForWords`(데이터 계층)에 있음 |
| `created_by` / `approved_by` / `approved_at` | text / text / timestamptz | 감사 목적 — 감정/평가 텍스트는 저장하지 않음(제품 불변식) |
| `ai_model` / `ai_meta` | text / jsonb | 예약 컬럼 — §11 Phase 5(AI Generator) 전까지 미사용 |
| `created_at` / `updated_at` | timestamptz | |

인덱스: `(target_word, approval_status)`(btree 복합 — `lower(target_word)`
표현식 인덱스 원안은 저장 시점 정규화로 불필요해져 리뷰 반영으로
교체됨), `(unit_id, approval_status)`, `(textbook_id, approval_status)`,
`approval_status` 단독.

**승인 상태 전이(순수 함수 `canTransition`, `src/utils/curriculum/
curriculumModel.js`가 유일한 판정 원천)**: `draft→pending`,
`pending→approved|rejected`, `rejected→pending`(재검수),
`approved→rejected`(회수). 그 외 전이(예: `draft→approved` 직행)는 전부
거부 — "AI/규칙 초안이 검수 없이 학생에게 노출될 수 없다"는 불변식을
DB CHECK가 아니라 이 함수 하나가 지킨다(DB는 값이 4개 enum 중 하나인지만
본다).

**`publishers`(출판사, 승인 사항)** / **`grades`(학년 축, 승인 사항)**:
각각 `id uuid PK` / `name text not null unique` (+ `grades.sort_order int
default 0`). `textbooks.publisher_id`/`textbooks.grade_id`가 이 두
테이블을 FK로 참조(`on delete set null` — 출판사/학년을 지워도 교재
데이터는 살아남음). 기존 `textbooks.publisher_name`(자유 텍스트)는
삭제하지 않고 FK와 나란히 유지(호환).

**`grammar_points`(문법 포인트 엔티티, 스키마만 — 시드 데이터 없음)**:
`id`/`code text unique`/`label text`/`grp text`/`grade_band text`.
**범위 변경 기록(2026-07-31, 운영자 지시)**: 원 설계는
`docs/reading/05-grammar-taxonomy.md` 기반 ~120개 라벨 시드 INSERT를
포함했으나, "콘텐츠/시드/샘플/데모 데이터는 일절 만들지 않는다"는 운영자
지시로 범위가 축소돼 스키마만 실행되고 라벨 행은 0개로 시작한다(교사
수동 입력 또는 §11 Phase 5 AI Generator가 후속 채움 — SQL 파일 자체의
"범위 변경 기록" 주석과 1:1 대응).

**`unit_grammar_points`**: `unit_id`/`grammar_point_id` 다대다 조인,
`unique(unit_id, grammar_point_id)`.

**`textbooks`/`units` additive 컬럼**: `textbooks`에
`publisher_id`/`grade_id`/`level text`/`book_order int`, `units`에
`position int`/`lesson_no int`/`objectives text`(`units.position`은
v1.x부터 이미 존재 — "별도 `lessons` 테이블 없음, lesson = units 행"
설계 결정, §9 트레이드오프 표 첫 행).

**RLS(전 5개 테이블 공통, 현행 anon 개방 유지)**: 신규 테이블 5개 모두
v3.4 관례("allow anon all" — `for all using (true) with check (true)`)로
시작한다 — v3.11/v3.12 락다운이 이 시점 아직 배포 대기 중이라 즉시
락다운은 dead-end(미배포 `admin-content-write` Edge Function에 의존,
설계 §9). SQL 파일에 락다운 합류용 블록이 주석 처리된 채로 동봉돼
있고(전제조건 3가지 명시), 락다운이 실제 배포된 뒤 별도 마이그레이션으로
그 블록만 실행하면 합류한다.

**GRANT**: 5개 테이블 전부 `grant select, insert, update, delete on
<table> to anon, authenticated`(헌법 규칙 10 — 신규 컬럼/테이블은 GRANT
동반).

**클라이언트 폴백(SQL 미실행 상태, 2026-08-01 시점 실제 프로덕션 상태)**:
`src/utils/curriculum/exampleLibrary.js`/`curriculumApi.js`의 모든 조회는
`isMissingTableError`(42P01/PGRST205, `wordLibrary.js`에서 재사용) 또는
42703(undefined_column — `textbooks`/`units`는 이미 있는 테이블이라
컬럼만 없는 상태를 별도 감지)을 잡아 `{ rows:[], featureDisabled:true }`
또는 `{}`로 폴백하고 절대 throw하지 않는다. 쓰기 함수(`createExample`
등)는 테이블/컬럼 부재 시 명확한 한국어 에러("supabase_v3_13 실행
필요")를 던진다(관리자가 "저장된 줄 착각"하지 않도록). 학생 화면은
승인 예문 조회가 실패/빈 결과여도 예문 학습 단계 자체가 조건부 삽입이라
(WordDetail.jsx §8) 아무 영향이 없다.

## `word_assets` (v3.15, 2026-08-04 — SQL 미실행)

`words` 테이블은 이 마이그레이션이 한 줄도 건드리지 않는다. 대신 정규화된
단어 텍스트(`word_key = lower(btrim(word))`)를 키로 하는 별도 테이블을
만들어, 클라이언트가 필요할 때 단어 텍스트로 조회해 병합하는 구조다. DDL
원문은 `supabase_v3_15_word_assets.sql`.

**왜 `words`를 안 건드리는가(라이브 실측 근거)**: `words` 총 691행, 고유
단어(대소문자·공백 무시) 599개, 중복 13.3%(최다 4회 등장) — 2026-08-04
실측. **갱신(2026-08-05 재측정)**: 그 사이 교사가 단어를 계속 추가해 총
811행 / 고유 695개로 늘었다. 이 수치는 단어가 추가될 때마다 계속 달라지므로
"이 문서의 숫자"가 아니라 SQL 실행 직전 `supabase_v3_15_word_assets.sql`
하단 (b-0) 쿼리(`select count(distinct lower(btrim(word))) from words ...`)
결과를 정확한 기대값으로 쓸 것. `words` 스키마를 전혀 바꾸지 않으면 기존
학생·반·숙제·채점 경로에 구조적으로 영향이 0이고, 백필도 신규 테이블에
고유 단어 수만큼만 채우면 되며, 롤백은 "클라이언트가 조회하지 않는 것"
하나로 완전 가역이다 — 이 결론은 행 수와 무관하게 그대로 유효.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` 기본값 |
| `word_key` / `sense_key` | text not null / text not null default `''` | `unique(word_key, sense_key)`가 조회 키. `sense_key`는 동형이의어 분리용 예약 슬롯(현재 전부 `''`) |
| `word` | text not null | 원본 표기(대표 표기 1개, `btrim`만 적용) |
| `meaning_primary` | text | **표시/힌트 전용 — 채점 진실 아님.** 채점 진실은 영구히 `words.meaning` + `words.accepted_meanings`(교사가 유닛별로 입력). 중복 단어 81종 중 41종은 유닛마다 뜻이 다름(예: temperature=체온/기온) — `word_assets`는 유닛 컨텍스트가 없는 word_key 단위라 이 필드로 채점하면 오답 처리 위험 |
| `part_of_speech` / `cefr` | text / text | `cefr`은 A1~C2 자유 텍스트, DB CHECK 없음 |
| `pronunciation_uk` | text | 영국식 IPA |
| `example_sentence` / `example_translation` | text / text | |
| `example_source` | text not null default `'none'`, CHECK(`none`\|`import`\|`ai`\|`teacher`) | 예문 필드만의 출처(레코드 전체 출처인 `source`와 별개) |
| `difficulty` | int, CHECK 1..5 | 콘텐츠 정적 난이도(v3.13 `examples.difficulty`와 동일 도메인). **`src/learning/memory/difficulty.js`의 학생별 0~1 행동 점수와 다른 값**(이름만 비슷, 소유자·도메인 다름) |
| `image_prompt` / `image_url` / `image_status` | text / text / text not null default `'none'` | `image_status` CHECK(`none`\|`prompt_ready`\|`queued`\|`generating`\|`ready`\|`failed`). 이 마이그레이션은 이미지를 생성/큐잉하지 않음 — 스키마만 미래 호환 준비 |
| `gesture` / `emoji` / `story_memory` | text / text / text | |
| `base_review_interval_days` | int, CHECK(`0,1,3,7,14,30`) | **학생별 복습 상태가 아니다** — 자산의 "기본" 간격 메타데이터일 뿐. 학생별 실제 간격/박스 상태는 `src/learning/memory/leitner.js`(`BOX_INTERVALS_DAYS`)가 `student_progress.review_data.memoryEngine.boxes`에서 전적으로 소유. 도메인을 `leitner.js`와 정확히 일치시킴 |
| `tags` / `synonyms` / `antonyms` | text[] / text[] / text[] | |
| `source` | text not null default `'teacher'`, CHECK(`teacher`\|`import`\|`rule`\|`ai`) | 레코드 전체 출처 |
| `approval_status` | text not null default `'draft'`, CHECK(`draft`\|`pending`\|`approved`\|`rejected`) | v3.13 `examples`와 동일한 출처·승인 표준 블록 관례 재사용. 학생 노출 강제는 이 SQL 범위 밖(향후 조회 함수가 담당) |
| `pipeline_status` | text not null default `'pending'`, CHECK(`pending`\|`partial`\|`complete`\|`failed`) | 행 전체의 생성 진행 상태 |
| `generated_fields` / `ai_model` / `created_by` | jsonb / text / text | 예약 컬럼 |
| `created_at` / `updated_at` | timestamptz | |

인덱스: `pipeline_status`, `image_status`, `cefr`, `approval_status` 단독
4개(`unique(word_key, sense_key)` 복합 인덱스가 `word_key` 단독 조회도
leftmost prefix로 커버해 별도 인덱스 불필요).

**RLS 설계 정정(v3.13 관례를 뒤집음)**: 최초 지시는 v3.13처럼 "개방
정책으로 시작 + 락다운 합류 블록을 주석으로 동봉"이었으나, 라이브 실측으로
`supabase_v3_11_lockdown_curriculum_write.sql`이 이미 적용돼 있음이
확인됐다(anon key로 `words` INSERT 시도 시 42501 반환 — `words`는 이미
anon SELECT-only). 그래서 `word_assets`는 처음부터 anon SELECT-only로
시작한다(`words`/`classes`/`units`와 동일 신뢰 모델) — INSERT/UPDATE/DELETE
정책이 아예 없어 RLS default-deny, GRANT도 `select`만 부여. 쓰기는
service_role(RLS 우회, 향후 Edge Function/관리 스크립트) 전용. SQL 파일
하단에는 "락다운 합류용"이 아니라 반대 방향인 "역방향 비상 블록"(주석
처리, 평시 실행 금지 — 락다운을 임시로 되돌려야 하는 예외 상황 전용)이
동봉돼 있다.

**백필(규칙 기반, AI 비용 0원)**: 기존 `words.example_text`(691행 중
100% 채워짐, 2026-08-04 실측)와 `words.memory_tip`(94% 채워짐)을
`word_key`별로 `distinct on`(타이브레이커는 `words.id` — `words.created_at`
컬럼이 라이브에 존재하는지 이 세션에서 확인되지 않아 원본 DDL 미확보
상태에서 안전하게 존재가 보장된 `id`를 씀, `DATABASE.md` "핵심 4테이블 —
저장소에 DDL 없음" 섹션 참고)로 뽑아 `word_assets`로 복사한다. 기대 결과는
2026-08-04 시점 599행이었으나 2026-08-05 재측정으로 695행으로 늘었고
(위 "왜 `words`를 안 건드리는가" 문단 참고), 실행 시점의 정확한 값은
SQL 파일 (b-0) 쿼리로 직접 구할 것 — 이 문서/SQL 파일의 숫자를 고정값으로
믿지 말 것. `on conflict (word_key, sense_key) do nothing`이라 재실행해도
안전(멱등).

**GRANT**: `grant select on table word_assets to anon, authenticated`만
(헌법 규칙 10 — 신규 테이블 GRANT 동반. INSERT/UPDATE/DELETE는 의도적으로
GRANT하지 않음, 위 RLS 정정 참고).

**클라이언트 폴백(SQL 미실행 상태, 이 문서 작성 시점 실제 프로덕션 상태)**:
이 시점 `word_assets`를 조회하는 코드는 아직 저장소에 없다(이 마이그레이션은
스키마 파일만 준비). 향후 조회 함수를 작성할 때는 `wordLibrary.js`/
`exampleLibrary.js`의 `isMissingTableError` 폴백 관례를 그대로 재사용해야
한다(재구현 금지, 헌법 규칙 3).

**갱신(2026-08-05, M1~M3c 세션)** — 위 "클라이언트 폴백" 문단은 SQL
미실행 시점(2026-08-04) 기준 서술이라 이제 일부 낡았다: `word_assets`를
읽고/쓰는 코드가 이 세션에서 추가됐다 —
`src/utils/wordAssets.js`(조회/병합/upsert 계약, 어떤 실패에서도 throw
없음), `src/utils/wordAssetRules.js`(규칙 기반 자산 생성 순수 함수,
AI 미사용), `supabase/functions/admin-content-write/index.ts`의
`word_asset.upsert`/`word_asset.upsert_bulk` 액션(service_role 전용
쓰기), `src/components/AdminScreen.jsx`의 엑셀 업로드 경로(단어 저장
"이후" fire-and-forget으로 자산 upsert 시도, 실패해도 단어 저장 자체는
이미 끝난 상태라 교사에게 "저장 실패"로 보이지 않음). 이 코드들은 전부
`word_assets` 테이블 부재(42P01/PGRST205)를 감지해 throw 없이 폴백하도록
작성됐다(SQL 미실행 상태에서도 기존 엑셀 업로드 플로우는 byte-identical).
**학생 화면 노출은 여전히 0**(헌법 규칙 12, 이번 세션 범위 아님) — 관리자
쓰기 경로만 배선됐다.

### `word_status` — CASCADE 데이터 손실 위험과 완화(2026-08-05)

`word_status.word_id → words(id) on delete cascade`(`supabase_v1_5_word_status.sql:33-35`)다.
과거 `setClassWords`(`src/utils/wordLibrary.js`)와
`handleWordsBulkReplace`(`supabase/functions/admin-content-write/index.ts`)는
유닛의 단어를 저장할 때마다 그 유닛의 `words` 행을 **통째로 delete한 뒤
insert**했다 — 새로 insert된 행은 매번 새 `gen_random_uuid()`를 받으므로,
교사가 유닛에 단어를 하나만 추가해도 그 유닛 전체 학생의
`word_status`(알아요/모르겠어요/mastered 기록)가 CASCADE로 함께 삭제되는
구조였다. 회귀 재현(2026-08-04~05 세션, 실측): 학생 1명("중2 YMB
박준원") 기준 Unit 5 — 단어 40개에 `word_status` 174행이 걸려 있었고,
그 유닛을 재저장하는 동작이 이 174행을 삭제하는 것으로 확인됐다(수정
전 코드로 대조군 재현 — 헌법 규칙 15). **주의**: 이는 "메커니즘이 다음
재저장에서 재현된다"는 것만 확정이며, 이 저장소에 감사 로그가 없어
과거 실제 운영 중에 이 CASCADE가 몇 번 발생했는지는 **증명되지
않았다/미확인**이다.

**완화(수정됨, 커밋 `75beefa`)**: `setClassWords`/`handleWordsBulkReplace`
둘 다 delete-then-insert 대신 word 텍스트(대소문자 무시) 매칭 기반
diff로 교체됐다 — 겹치는 단어는 기존 `id`를 보존한 UPDATE, 새 단어만
INSERT, 목록에서 빠진 단어만 DELETE. 겹치는 단어의 `word_status`는 이제
재저장에도 살아남는다. `word_status`의 스키마/FK(CASCADE 포함)는 전혀
바꾸지 않았다 — 순수 애플리케이션 레벨 수정(`src/utils/wordLibrary.js`의
`planWordsBulkReplace`/`buildAdminBulkReplaceRows`, 순수 함수, 하네스
`tests/harness/runWordsBulkReplacePlan.mjs`로 검증). **운영자 조치
필요**: 이 수정은 `supabase/functions/admin-content-write` 재배포 없이는
라이브에 반영되지 않는다 — 배포 전까지는 옛 delete-then-insert 로직이
그대로 라이브에서 동작 중이므로, **배포 전에 어떤 유닛도 재저장(엑셀
재업로드 등)하면 안 된다.** 상세: `handoff.md` 이번 세션 섹션.

## RLS / 컬럼권한 현황

이 앱은 Supabase Auth를 쓰지 않아 행 단위로 "누구인지" 구분할 방법이 없습니다. 그래서 두 가지 다른 전략이 섞여 있습니다.

**RLS "anon 전체 허용" 정책 적용된 테이블** (행 단위 보안 없음 — 표에 없는 위협은 막지 못함, 의도된 설계):
`student_progress`, `student_daily_progress`, `daily_assignments`, `word_status`, `entrance_tests`, `spelling_review_queue` — 전부 `enable row level security` + `create policy "allow anon all" ... using (true) with check (true)`.

**`entrance_test_results` — 2026-07-19부터 위 "anon 전체 허용" 그룹에서 제외 (P1 보안 감사 후속)**: `supabase_v2_4_entrance_result_rls.sql`(미실행 대기)이 적용되면 anon은 SELECT만 가능하고 INSERT/UPDATE/DELETE는 service_role 전용으로 좁혀진다. 근거: 기존 permissive 정책(using(true) with check(true))에서는 anon key로 임의 student_id/test_id의 점수를 조작 저장할 수 있었다(재현 실측). 쓰기는 이제 `api/submit-entrance-result.js`(서버가 `entrance_tests.words` 스냅샷으로 직접 재채점 후 저장, 클라이언트가 보낸 score/total은 아예 읽지 않음) 경유만 가능 — `entrance_tests`(시험 생성/종료, 관리자 전용 화면)는 이번 범위가 아니라 여전히 anon 전체 허용 그룹에 남아있다.

**`students` — RLS 대신 컬럼 단위 GRANT (v1.9, 유일하게 다른 전략)**:
- 테이블 단위 `SELECT`/`UPDATE`를 anon/authenticated에서 회수(`revoke`).
- `SELECT`는 PIN 4컬럼(`pin_hash`/`pin_fail_count`/`pin_locked_until`/`pin_setup_allowed`)을 제외한 전체 컬럼에 명시 재부여.
- `UPDATE`는 클라이언트가 실제 쓰는 컬럼만: `class_id`, `unit_name`(v1.9), `current_unit_id`(v2.1 추가 GRANT), `house_id`(v2.7 추가 GRANT).
- `INSERT`/`DELETE`는 테이블 단위로 유지(회수 안 됨) — 학생 자기등록(`addStudent`), 관리자 삭제(`removeStudent`)가 이 경로를 씀.
- **운영 함정(반드시 지킬 것)**: `students`에 새 컬럼을 추가하는 모든 향후 마이그레이션은 `grant select (새컬럼) on public.students to anon, authenticated;`(필요시 `update`도)를 **반드시 같이** 실행해야 합니다 — 안 하면 그 컬럼만 못 읽는 게 아니라 클라이언트가 원래 읽던 컬럼까지 한 번에 깨질 수 있는 fail-closed 구조입니다(v2.1이 이 절차를 올바르게 준수한 사례로 확인됨, `handoff.md` 2026-07-18 Phase 4).

**`classes`/`units`/`words` — 저장소에 RLS/GRANT SQL 없음**: 위 grep 결과 기준으로 이 3테이블에 대한 `enable row level security`/`create policy`는 어떤 마이그레이션 파일에도 없습니다(원본 대시보드 생성 당시 설정이 무엇인지 파일로 확인 불가 — 핵심 4테이블 DDL 부재와 같은 뿌리의 기술부채). `words.accepted_meanings`만 v2.0에서 명시적으로 컬럼 GRANT 됨.

## 관련 파일

`C:\voca\supabase_v1_3_schema.sql` ~ `C:\voca\supabase_v2_5_gamification_master_switch.sql`(16개 전체), `C:\voca\src\utils\wordLibrary.js`(컬럼 부재 폴백 로직), `C:\voca\api\_pinAuth.js`(service_role 접근), `C:\voca\api\submit-entrance-result.js`(입실시험 결과 서버 재검증, 2026-07-19), `C:\voca\api\grant-xp.js`(XP 지급, 반별 스위치와 무관하게 항상 기록 — 판단 근거는 파일 헤더), `C:\voca\scripts\dbIntegrityAudit.mjs`, `C:\voca\scripts\testRlsSecurity.mjs`, `C:\voca\scripts\testClassDeleteCascade.mjs`, `C:\voca\scripts\testEntranceTestDb.mjs`, `C:\voca\scripts\testGamificationSettings.mjs`(신규, 2026-07-19), `C:\voca\supabase_v2_9_student_class_assignments.sql`(신규, 2026-07-21, 미실행), `C:\voca\src\components\TextbookSelector.jsx`(신규, 2026-07-21), `C:\voca\src\components\admin\TextbookAssignmentPanel.jsx`(신규, 2026-07-21), `C:\voca\supabase_v3_9_writing_answer_statistics.sql`(신규, 2026-07-24, 미실행), `C:\voca\supabase\functions\grade-writing-answers\index.ts`(`statsLookup`/`bumpWritingAnswerStatAfterAiJudgment`), `C:\voca\supabase\functions\grade-writing-answers\pipeline.js`(`classifyBatch` `statsLookup` 훅), `C:\voca\src\utils\writingAnswerStatsApi.js`(신규, 2026-07-24), `C:\voca\src\utils\spellingReviewApi.js`(`record_writing_answer_stat` fire-and-forget 호출부)
