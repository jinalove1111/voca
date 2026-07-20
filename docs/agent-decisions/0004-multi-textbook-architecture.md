# Decision 0004 — 학생 1계정 다중 교재(Multi-Textbook) 동시 배정 아키텍처

_2026-07-21. 두 차례 사전 조사(스키마 실측 감사) 결과를 바탕으로 한 승인된
설계 기록. 이 문서 자체는 구현 착수 승인이며, 실제 구현(코드 변경 +
`supabase_vN_*.sql` 작성)은 별도 세션에서 진행한다._

## 배경 / 문제 정의

현재 한 학생 계정(`students` 행)은 정확히 하나의 반(`class_id`)과 그 반에
속한 정확히 하나의 현재 유닛(`current_unit_id`)만 가질 수 있다. 학생이
두 번째 교재(예: YBM 외에 미래엔도 병행)를 배우려면 "처음이에요" 플로우로
**중복 계정을 새로 만들어야** 한다 — 이름+PIN이 다른 별개 학생으로
등록되어, XP/레벨/코인/스트리크/뱃지 같은 계정 단위 게임화 자산이
계정별로 쪼개지고, 교사/학부모 입장에서도 "이 아이가 사실 같은 아이"라는
사실이 시스템에 드러나지 않는다.

요청 시나리오: 학생 "다인"이 YBM→Unit 6, 미래엔→Unit 3, Paul Easy
Voca→Unit 12를 **동시에** 진행할 수 있어야 한다. 계정 재등록 없이.

## 조사 방법

두 차례 스키마 실측 감사(코드/SQL/문서 grep, 추측 없이 확인된 사실만
채택):

1. `students.class_id`(단일 FK) + `students.current_unit_id`(단일 FK)는
   "가입(enrollment)" 모델이 아니라 "포인터(pointer)" 모델임을 확인
   (`DATABASE.md:19,21`).
2. `units.class_id`가 콘텐츠 스코핑의 유일한 키. 유닛/단어는 정확히 하나의
   반에 완전히 귀속된다 — `supabase_v2_1_student_unit_decouple.sql:129-133`
   의 정합성 검증 쿼리(`current_unit_id`가 가리키는 유닛은 반드시 그
   학생의 `class_id` 소속이어야 함, 0행이 정상)가 이 불변식을 코드로
   못박아 두고 있다.
3. `classes` 테이블에는 교재/커리큘럼을 나타내는 구조화된 필드가 없다.
   반 이름이 "중2 능률 김기택"처럼 출판사+학년+교사를 자유 텍스트로
   인코딩하는 비공식 관례만 있을 뿐(`handoff.md:2663` 인근),
   "교재(textbook)"라는 개념 자체가 별도 엔티티로 존재하지 않는다.
4. 이미 `class_id`로 완전히 스코핑되어 있는 테이블/설정을 전수 확인:
   `daily_assignments`(`unique(class_id, date)`), `entrance_tests`,
   `entrance_test_results`, `word_king_history`, 그리고 반 단위 설정
   (`spelling_test_enabled`, `spelling_hint_enabled`,
   `wrong_answer_repeat_count`, `spelling_direction`,
   `gamification_enabled`, `weekly_event_enabled`).
5. 학생↔반, 학생↔유닛 간 다대다(many-to-many) 관계를 표현하는 junction
   테이블은 저장소 전체에 하나도 존재하지 않음(전수 grep으로 확인).
6. 단어 단위 숙련도(`wordStatus[wordId]`, progress_data jsonb 내부)는
   `word_id`가 전 반을 통틀어 전역 유일(globally unique)하기 때문에, 스키마
   변경 없이도 이미 교재별로 자연스럽게 분리되어 있다 — YBM 단어와 미래엔
   단어가 이 맵 안에서 절대 충돌하지 않는다.

## 승인된 설계

### 핵심 결정 — `classes`를 교재 컨테이너로 재사용(새 `textbooks` 테이블 신설 금지)

`units`/`words`/`daily_assignments`/`entrance_tests`/`word_king_history`/
반 단위 설정이 **전부 이미 `class_id`로 스코핑**되어 있으므로, 교재
하나하나(YBM, 미래엔, Paul Easy Voca)는 그냥 각자의 유닛/단어를 가진
독립된 `classes` 행이다. 이 결정 하나로 교재별 일일 숙제 배정, 입실
시험, Word King 랭킹이 **해당 테이블들에 대한 변경 없이 그대로** 따라온다
— `textbook_id`라는 병렬 계층을 새로 만들면 이미 존재하는 이 모든
스코핑 메커니즘을 의미 없이 중복 구축하게 된다.

### 새 테이블 — `student_class_assignments`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` PK | |
| `student_id` | `uuid` FK → `students(id)` `on delete cascade` | |
| `class_id` | `uuid` FK → `classes(id)` `on delete cascade` | |
| `current_unit_id` | `uuid` FK → `units(id)` `on delete set null`, nullable | 이 교재(반) 안에서의 현재 진도 |
| `is_primary` | `boolean not null default false` | 아래 참고 |
| `created_at` | `timestamptz default now()` | |

제약: `unique(student_id, class_id)`.

이 테이블이 학생의 **모든** 반/교재 소속(지금의 "하나뿐인" 반 포함, 추가
분뿐 아니라)을 나타내는 단일 진실 원천(source of truth)이 된다.
`students.class_id`/`students.current_unit_id`는 삭제하지 않고,
**`is_primary = true`인 행의 캐시(sync)** 로 유지한다 — 이렇게 하면
`getStudentClassId`/`getStudentWords`/`_dailyAssignments` 캐시/입실
시험/관리자 명단 도구 등 `wordLibrary.js`/`AdminScreen.jsx`에 흩어진
15개 이상의 "학생은 반이 하나"를 전제하는 기존 호출부가 **전혀 손대지
않아도** 계속 정상 동작한다.

마이그레이션은 기존 111명 학생 각각에 대해 정확히 1개의
`is_primary=true` 행을 현재 `class_id`/`current_unit_id`와 동일하게
백필한다 — 오늘과 행동상 완전히 동일하며, 두 번째 교재를 받지 않는 한
기존 학생에게는 회귀가 전혀 없다.

### 게임화 자산 분리(요청자의 명시적 제품 결정, 2026-07-21)

- **계정 전역(스키마 변경 없음 — 오늘도 이미 전역):** XP, 레벨, 코인,
  티켓, 스트리크, 뱃지, 데일리 리워드. 다중 교재 학생도 이 자산은
  교재 수와 무관하게 **한 번만** 쌓인다(교재별로 곱해지지 않음).
- **교재별(`student_class_assignments` 행 기준 `class_id`로 스코핑):**
  현재 유닛, 숙제, 단어 진행도, 듣기, 퀴즈, 발음, 쓰기, 완료 유닛.
  단어 단위 진행도는 `word_id` 전역 유일성 덕분에 이미 무료로 분리된다.
  다만 하루 단위 "라운드" 미션 진행도(`wordsViewed`/`examplesHeard`/
  `quizSolved`/`pronunciationOk`)와 `student_daily_progress`/숙제완료
  추적은 학생 단위가 아니라 (student_id, class_id) 단위로 스코핑되어야
  하는데, 이는 실질적인 스키마/로직 변경(`student_daily_progress`에
  nullable `class_id` 컬럼 추가, 메모리상 `round` 상태를 활성 배정별로
  키잉)이므로 **이번 조인 테이블 1차 롤아웃에 묶지 않고, 별도의 후속
  구현 단계로 명시적으로 분리**한다.

### UX

- **학생**: 로그인 자체는 무변경. 배정이 0개 또는 1개면 교재 선택
  UI는 완전히 보이지 않음(기존 111명 학생은 화면 변화 0). 2개 이상이면
  학습 진입 전 선택기가 나타나며, 기존 유닛 전환 UI 패턴
  (`App.jsx:192` `handleUnitSwitch`)을 재사용한다. 마지막으로 쓴 교재는
  기존 로컬 진행도 블롭에 클라이언트 측으로 기억한다(`ticketLedger`와
  동일 패턴, 새 DB 필드 불필요).
- **관리자**: 반별 학생 필터링은 기존 기능 그대로 유지. 반 안에서 학생별
  추가 교재를 배정/해제하고, 배정된 교재별 현재 유닛을 변경할 수 있어야
  한다. 오늘의 흐름보다 단순해야 한다.

### 마이그레이션 안전성(CLAUDE.md 규칙 8/9/10 준수)

- 새 테이블만 추가 — `students`에 컬럼을 추가하지 않으므로 기존 컬럼의
  GRANT 갭 리스크(규칙 10)는 이 변경에서 해당 없음.
- 새 테이블은 v1.3 시대 테이블들과 동일한 패턴으로 자체 RLS +
  `create policy "allow anon all" ... for all using (true) with check
  (true)`가 필요하며(`supabase_v1_3_schema.sql:55,58,61` 확인된 기존
  패턴), `create table if not exists`로 멱등하게 작성한다.
- 마이그레이션은 어떤 에이전트도 직접 실행하지 않는다 — CLAUDE.md 규칙 8에
  따라 `supabase_vN_*.sql` 파일만 준비하고, 실행은 운영자가 Supabase
  대시보드 SQL Editor에서 수동으로 한다.
- 모든 애플리케이션 코드는 테이블 부재를 감지해 오늘의 단일 반 동작으로
  폴백해야 한다(규칙 9) — 따라서 코드는 마이그레이션 실행 **이전에도**
  프로덕션에 배포 가능하며, 테이블이 생기기 전까지는 안전하게 비활성
  상태로 남는다.
- 롤백: `drop table if exists student_class_assignments`는 완전히
  안전/가역적이다 — `students.class_id`/`current_unit_id`가 기존 학생에
  대해 처음부터 끝까지 권위 있는 필드로 남아 있으므로, 새 테이블은
  순수하게 부가적(additive)이며 기존 학생에게는 결코 유일한 진실
  원천이 아니다.

## 제외된 대안(Rejected Alternatives)

### 대안 A — 새 `textbooks`/`courses` 엔티티 신설

`textbooks` 테이블을 새로 만들고 `units.textbook_id`, `daily_assignments.
textbook_id` 등으로 기존 `class_id` 스코핑 체계 옆에 병렬 계층을
추가하는 방안. **기각**: `units`/`daily_assignments`/`entrance_tests`/
`word_king_history`/반 단위 설정이 이미 전부 `class_id`로 완전히
스코핑되어 있음이 조사로 확인됐다(위 "조사 방법" 4번). `classes` 자체가
이미 사실상 "교재 인스턴스"로 기능하고 있으므로, 별도 엔티티는 이미
존재하는 스코핑 메커니즘을 기능적으로 그대로 복제할 뿐 실질적 이득이
없이 마이그레이션 범위와 코드 복잡도만 키운다.

### 대안 B — 조인 테이블 없이 `classes` 재사용만으로 해결(다중 배정 자체를 포기)

`student_class_assignments` 같은 다대다 테이블 없이, 학생이 교재를
바꿀 때마다 `students.class_id`/`current_unit_id`를 그때그때 덮어쓰는
방식(사실상 지금 구조 그대로, UI만 "전환 스위치"를 추가). **기각**:
요청 시나리오 자체가 "동시(simultaneous)" 진행 — 다인이 YBM Unit 6과
미래엔 Unit 3을 **둘 다 살아있는 상태로** 유지해야 한다. 단일 포인터를
덮어쓰는 방식은 항상 최근에 전환한 교재의 진도만 남고 나머지 교재의
`current_unit_id`가 유실되므로 요구사항을 충족하지 못한다. 다대다
관계를 표현할 최소한의 구조(조인 테이블)가 필수다.

### 대안 C — 교재별 게임화 자산 분리(XP/레벨/코인/스트리크도 교재마다 별도)

요청 시나리오에서 자연스럽게 제기될 수 있는 대안이나, **요청자가 명시적으로
기각**(2026-07-21 제품 결정) — 다중 교재 학생이 XP/레벨/코인 등을 교재
수만큼 배로 얻거나, 반대로 교재마다 처음부터 다시 쌓아야 하는 것은 둘 다
바람직하지 않은 제품 경험으로 판단했다. 계정 전역 자산은 오늘 이미 전역
스키마이므로 이 대안을 채택하지 않는 것 자체가 추가 작업 없음(현행 유지)
이라는 점도 근거로 작용했다.

### 대안 D — `student_daily_progress`/`round` 미션 상태의 교재별 분리를 1차 범위에 포함

`student_daily_progress`에 `class_id`를 즉시 추가하고 미션 진행 로직을
전면 교재별로 스코핑하는 방안. **1차 범위에서 기각(완전 포기가 아니라
후속 단계로 연기)**: 이 변경은 관리자 숙제 현황판, 학부모 주간 리포트,
Word King 등 파급 범위(blast radius)가 조인 테이블 자체보다 훨씬 크고,
"학생 1명이 실제로 2개 이상 교재를 동시에 쓰는 실사용 사례"가 아직
없는 상태에서 선제적으로 손대는 것은 규칙 1(안정성 최우선)에 어긋난다.
1차는 배정 구조(조인 테이블)만 만들어 두고, 미션 상태 분리는 실사용
데이터로 필요성이 확인된 뒤 별도 설계 문서로 진행한다.

## 남은 범위(Open/Deferred)

- 교재별 미션/스트리크/XP 분리 — 명시적으로 채택하지 않음(대안 C, 계속
  전역 유지).
- 교재별 `student_daily_progress`/숙제완료(`round` 미션 상태) 분리 —
  후속 단계로 연기(대안 D), 별도 문서로 추적 예정.
- 새 `textbooks`/`courses` 엔티티 — `classes` 재사용으로 대체, 신설하지
  않음(대안 A).
- 관리자 UI 상세 설계(교재 배정/해제 화면 와이어프레임)는 이 문서
  범위 밖 — 별도 구현 세션에서 `PROJECT_BOARD.md` 카드로 분리해 다룬다.

## 근거 코드/문서 위치

- `DATABASE.md:19,21` — `students.class_id`/`current_unit_id` 컬럼 정의.
- `supabase_v2_1_student_unit_decouple.sql:129-133` — 학생 현재 유닛이
  자기 반 소속이어야 한다는 정합성 불변식(검증 쿼리로 명시).
- `handoff.md:2663` 인근 — 반 이름의 출판사/학년/교사 비공식 인코딩
  관례("중2 능률 김기택") 실례.
- `supabase_v1_3_schema.sql:55,58,61` — 이 저장소의 anon RLS 정책 패턴
  (`create policy "allow anon all" ... using (true) with check (true)`),
  신규 테이블에 동일 패턴 적용 예정.
- `App.jsx:192` `handleUnitSwitch` — 재사용 대상 기존 유닛 전환 UI 패턴.
