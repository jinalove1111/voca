# DATA_INTEGRITY — 데이터 무결성 보장 체계 (운영 기준서)

_2026-08-10 작성(88차). 학생 데이터가 어떤 장치로 보호되는지, 무결성을
어떻게 상시 검증하는지의 단일 참조 문서. 이력은 handoff.md 73~87차._

## 1. 불변식 (제품 수준)

1. 학생 식별은 항상 `students.id`(UUID) — 이름 문자열 금지(CLAUDE.md 규칙 4).
2. 유닛 연결은 `current_unit_id`(FK) 우선, `unit_name` 문자열은 표시 폴백.
3. PIN 관련 컬럼은 클라이언트가 조회/로깅 금지 — 서버(api/*)만(규칙 11,
   v1_9 RLS가 실제 강제, testRlsSecurity가 상시 검증).
4. 학생 생성은 서버 전용(`create_student` — 관리자 인가+멱등 UUID+중복
   점검). anon INSERT는 42501 거부가 정상 계약(2026-08-06 P0).
5. 원장(별/XP/티켓)은 append-only + 멱등 키 — 저장된 합계 금지, 항상 파생.
6. 마이그레이션은 additive/멱등만. 컬럼/테이블 삭제는 훅(checkDestructiveSql)
   이 실제 차단. 실행은 운영자 수동(규칙 8).
7. 예문: source(원문) 무수정, 핵심 표현은 원문 substring 강제(저장 계층 검증).

## 2. 상시 검증 도구

| 도구 | 명령 | 검증 내용 |
|---|---|---|
| 무결성 감사 | `npm run verify:integrity` | 깨진 FK(students/SCA/words/units 전 방향), 같은 교재 내 정규화 중복 유닛, 신규 빈 유닛(보류 allowlist 외), 예문 상태값 — 라이브 READ-ONLY 10단언 |
| 유닛 정리 드라이런 | `node scripts/dryRunUnitNaming.mjs` | unit_naming 마이그레이션 가드/기대 시뮬레이션(5단언) |
| RLS/락다운 | `npm run verify:login` | PIN 컬럼 차단, 학생 INSERT 거부, phantom-id 권한 검사(실데이터 무접촉) |
| 전체 회귀 | `npm run verify:all` | 29개 도메인(2026-08-10 기준 전 도메인 그린이 기준선) |

## 3. 정리 이력 요약 (2026-08-09)

- v3_29(백업/사전검증) → v3_30(빈 유닛 5개 삭제+포인터 이전) 실행·검증 완료
  — 손실 0 수치 증명. 잔여 보류: 김기택/박준원 빈 Unit 1(과 번호 확정 대기),
  "Unit" 테스트 유닛 3개(김기택 건은 실학생 Harry 비primary SCA 1건 재연결
  필요), 황성연 김기택 SCA→Unit 6(근거 확정, v3_30 선택 블록 승인 대기).
- 재발 방지 코드: ensureUnit 정규화 매칭("Unit 1"≡"Unit1") + createClass
  빈 Unit 자동 생성 제거 — 소스 레벨 가드 테스트로 고정.

## 4. 파괴적 작업 표준 절차 (승인 필수)

precheck(SELECT) → backup(CSV) → migration(트랜잭션+가드 — 예상 count
불일치 시 raise exception 자동 롤백) → verify(SELECT) → (필요 시) rollback.
표준 예: `sql_migrations/unit_naming_20260809/`(01~05+README).

## 5. 대기 중 SQL (전부 실행 금지 상태, 운영자 승인 후)

unit_naming 01~05(드라이런 5/5 PASS) / grammar_points 시드 / 출판사·학년
메타 제안(이름 확정 2건 필요) / writing_coach 설계(추가 예정) / v3_30 선택
블록. 게임화 점등: v2_5(PRECHECK PASS) → v2_6 → v2_7(GRANT 동반, 규칙 10)
→ v2_3_1.
