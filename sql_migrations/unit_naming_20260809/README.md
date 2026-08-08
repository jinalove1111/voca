# Unit 이름 정규화 마이그레이션 (2026-08-09 야간 준비, 미실행)

목적: 유닛 표시 이름을 canonical 형식(`Unit N`, 공백 1개)으로 통일한다.
`Unit1`/`Unit10` 등 공백 없는 표기 **15건**을 `Unit 1`/`Unit 10`으로 rename.
**과(lesson) 번호를 바꾸는 것이 아니라 같은 유닛의 표기만 바꾼다** — 유닛
id/FK/단어/학습기록은 전혀 변하지 않고, 학생 연결은 id 기반이라 무영향.
숫자 없는 이름("Unit" 3개 — 테스트 의심)과 빈 Unit 1 2개(김기택/박준원,
UNKNOWN)는 이 패키지 범위 밖(운영자 결정 대기).

주의: 실제 과 번호 확정(예: 천재 "Unit 6"이 정말 6과인지)은 별도 문제 —
이 패키지는 확정하지 않는다(운영자가 교과서 대조 후 필요 시 별도 rename).

## 실행 순서 (Supabase 대시보드 SQL Editor, 운영자 수동)

| 순서 | 파일 | 성격 | 통과 조건 |
|---|---|---|---|
| 1 | `01_precheck.sql` | SELECT 전용 | 모든 check의 pass=true |
| 2 | `02_backup.sql` | SELECT 전용 | 결과 전체를 CSV로 저장(롤백 원본) |
| 3 | `03_migration.sql` | UPDATE (트랜잭션+가드) | 에러 없이 commit — 가드 위반 시 자동 전체 롤백 |
| 4 | `04_verify.sql` | SELECT 전용 | 모든 check의 pass=true |
| 5 | (문제 시) `05_rollback.sql` | UPDATE (역방향) | 04를 다시 돌려 원상 확인 |

실행 후 앱 확인: 관리자 유닛 목록/학생 유닛 선택 화면에서 이름이
"Unit N" 형식으로 보이는지, 학생 학습 진입이 정상인지(id 기반이라 영향
없어야 정상). `npm run verify:student && npm run verify:admin` 재실행.

## 변경 내용 요약

- `units.name` 15건 rename (id 명시, 매핑은 각 SQL 파일 상단 CTE)
- `students.unit_name`(표시용 문자열 캐시) 동기화 — `current_unit_id`가
  rename 대상 유닛인 학생만 새 이름으로 UPDATE (표시 폴백 일관성).
  current_unit_id가 null인 레거시 학생의 문자열은 건드리지 않는다
  (01_precheck가 해당 인원 수를 보고 — 있으면 운영자 판단).
- 삭제 0건, INSERT 0건. words/examples/progress/word_status/SCA 무접촉.

## 롤백

`02_backup.sql` CSV가 원본. `05_rollback.sql`이 id 기준 역방향 rename +
students.unit_name 역동기화를 수행한다.
