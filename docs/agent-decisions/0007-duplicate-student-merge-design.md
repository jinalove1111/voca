# 0007 — 중복 학생 계정 병합 도구 설계 (설계만, 미구현·미실행)

- 날짜: 2026-08-06
- 상태: **설계 문서 — 병합 실행 코드는 의도적으로 구현하지 않음** (운영자
  지시: "실제 병합은 이번 작업에서 자동 실행하지 마세요")
- 배경: 학생 계정 중복 생성 P0 (같은 날 handoff 40차 참조). 실학생 172명
  중 31개 이름 그룹·96개 계정이 중복. 생성 경로(로그인 화면 자기등록)는
  같은 날 차단됨. 이 문서는 "이미 만들어진 중복"을 나중에 안전하게 합치는
  도구의 설계 기준선이다.

## 1. 전제와 불변식

1. 병합은 **관리자 최종 확인(미리보기 승인) 후에만** 실행된다 — 자동
   트리거 금지.
2. 이름이 같다는 것만으로는 절대 병합 근거가 되지 않는다(동명이인은
   v1.6부터 지원 사양). 병합 판단 주체는 오직 운영자.
3. 원본(비대표) 계정 행은 **삭제하지 않는다** — `merged_into`(uuid,
   nullable, students 자기참조 FK) + `merged_at` 컬럼을 추가해 아카이브
   상태로 보존한다. 로그인 후보 조회(verify-student-pin)와 학생 목록은
   `merged_into is null`만 대상으로 한다.
4. 전 과정은 단일 트랜잭션(Postgres function/RPC) — 부분 병합 상태가
   존재할 수 없어야 한다.
5. 병합 전 상태를 복원할 수 있는 매핑을 감사 테이블에 남긴다(rollback
   가능).

## 2. 신규 스키마 (마이그레이션 초안 — 실행하지 않음)

```sql
-- (초안 — 운영자 승인 전 실행 금지)
alter table students add column if not exists merged_into uuid references students(id);
alter table students add column if not exists merged_at timestamptz;

create table if not exists student_merge_audit (
  id uuid primary key default gen_random_uuid(),
  merged_student_id uuid not null,      -- 비대표(원본) 계정
  representative_id uuid not null,      -- 대표 계정
  admin_note text,                      -- 승인한 관리자의 메모
  moved jsonb not null,                 -- 테이블별 이동 행 id 목록(롤백 매핑)
  snapshot jsonb not null,              -- 병합 직전 두 계정의 핵심 상태 스냅샷
  created_at timestamptz default now()
);
-- service_role 전용(anon 접근 불가) — PIN 컬럼과 동일한 신뢰 경계.
```

## 3. 이동 대상 FK 테이블과 병합 규칙

| 테이블 | 규칙 |
|---|---|
| `student_progress` (student_id unique) | 병합 불가 항목이라 **필드별 규칙**: totalStars=합산 아님·아래 참조, progress_data는 대표 우선 + 비대표에만 있는 unit 키 이식 |
| `student_daily_progress` | (student_id, date) 충돌 시 두 값의 **최대값** 유지, 없던 날짜는 이동 |
| `word_status` | (student_id, word_id) 충돌 시 **더 진행된 상태** 우선(known > unknown > 미기록), 없던 단어는 이동 |
| `xp_events` | 전부 대표로 student_id 이전(**합산 성격** — 이벤트 로그라 중복 개념 없음) |
| `student_class_assignments` | (student_id, class_id) 충돌 시 대표 행 유지 + 비대표 행 삭제 대신 audit에 기록, 없던 반 행은 이전. is_primary는 대표 계정 것 유지 |
| `spelling_review_queue` | (student_id, word) 충돌 시 병합(시도 횟수 합산), 없던 행 이동 |
| `entrance_test_results` | 전부 이전(응시 이력 로그) |
| `sentence_progress` / reading 계열 | (student_id, 콘텐츠 id) 충돌 시 최대 진행 유지 |
| `product_events` | 이전 안 함(익명 관찰 로그, student_id 정합성만 audit에 기록) |

값 분류 원칙(운영자 지시 반영):
- **최대값 유지**: 일별 카운터, 단어별 진행 상태, streak 계산 원천(daily)
- **합산**: xp_events(로그 이전으로 자연 합산), 시도 횟수
- **최근 상태 유지**: current_unit_id, 현재 primary 교재, 장착 모자 등
  "현재 선택" 성격 — 두 계정 중 `student_progress.updated_at`이 최신인
  쪽. totalStars는 "합산"이 아니라 **재계산**(이동 완료 후 진행도 파생
  규칙으로 다시 계산 — 이중 지급 방지).

## 4. 실행 흐름 (RPC `merge_student_accounts(rep uuid, dup uuid, note text)`)

1. 사전 검증: 두 id 모두 존재, `merged_into is null`, rep != dup.
2. snapshot 기록(두 계정의 students 행 + progress 요약) → audit insert.
3. 표의 규칙대로 FK 이전(각 이동 행 id를 moved jsonb에 축적).
4. `update students set merged_into = rep, merged_at = now() where id = dup`.
5. PIN: 비대표 계정의 pin_hash는 그대로 두되 merged_into로 로그인 후보에서
   제외됨(verify-student-pin이 merged 계정 제외하도록 코드 수정 필요 —
   병합 도구 구현 시점에 함께).
6. 전체가 한 트랜잭션 — 어느 단계든 실패 시 전부 롤백.

## 5. 롤백 설계

- audit.moved의 (테이블, 행 id, 원 student_id) 매핑으로 역이전 RPC
  `unmerge_student_accounts(audit_id)` 가능 — 단, 병합 이후 대표 계정으로
  **새로 쌓인** 데이터는 구분 불가하므로 "병합 시점 이전 데이터의 원복"만
  보장(정직한 한계, 도구 UI에 명시할 것).
- `merged_into=null, merged_at=null` 복원으로 계정 재활성.

## 6. UI 게이트 (관리자 승인 흐름)

중복 점검 패널(DuplicateStudentAudit, 2026-08-06 구현된 읽기 전용 버전)에
이후 단계로 붙일 것:
1. 대표 지정 → 2. 병합 미리보기(이동 행 수/규칙별 결과 요약 — 서버 dry-run
   RPC) → 3. 관리자 PIN 재인증 + 명시적 확인 문구 입력 → 4. 실행 → 5.
   audit id 표시(롤백 키).

## 7. 이 설계가 구현되기 전까지의 운영 지침

- 중복 계정은 **그대로 두어도 안전**하다(로그인은 PIN이 다르면 정확히
  갈라지고, 같으면 duplicate_accounts로 거부 — 2026-08-06 수정).
- 급한 정리가 필요하면: 대표 외 계정의 PIN을 초기화하지 말고(학생 혼란),
  운영자가 점검 패널의 추천을 보고 학생에게 "어느 계정이 진짜인지"를
  확인한 뒤, 비대표 계정 처리는 이 도구 구현을 기다릴 것.
