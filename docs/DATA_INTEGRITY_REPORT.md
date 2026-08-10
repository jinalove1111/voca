# 데이터 무결성 보고서 — 2026-08-11 (93차 야간)

_100% READ-ONLY 조사. 프로덕션 DB에 INSERT/UPDATE/DELETE/DDL을 단 한 건도
실행하지 않았습니다. 자동 수정도 하지 않았습니다._

---

## 요약

| 구분 | 결과 |
|---|---|
| 라이브 데이터 검사 21항목 | **P0: 0건 / P1: 0건 / P2: 2건 / 정상: 18건** |
| 코드 경로 위험(구조적) | P0 3건 / P1 3건 / P2 4건 / P3 5건 — 전부 **미실행 제안**만 |

**현재 저장된 데이터 자체는 건강합니다.** 발견된 위험은 대부분 "지금은
괜찮지만 동시성/향후 입력에서 깨질 수 있는 구조"입니다.

조사 범위: `classes` 16 / `textbooks` 8 / `units` 29 / `words` 971 /
`students` 1157 / `student_class_assignments` 447 / `class_textbooks` 20.

---

## 1. 라이브 데이터 검사 결과

### 정상 (18항목)

중복 반 이름 0 · 중복 교재 이름 0 · 같은 반 내 정규화 중복 유닛 0 ·
고아 유닛 0 · 고아 단어 0 · 유닛의 깨진 `textbook_id` 참조 0 ·
`textbook_id` NULL인데 반이 교재 소유 0 · 같은 유닛 내 중복 단어 0 ·
`is_primary` 0개 학생 0 · **`is_primary` 2개 이상 학생 0** ·
`class_textbooks` 깨진 참조 0 · 중복 행 0 · `owner_class_id` 없는 교재 0 ·
소유 반 타입 불일치 0 · `students.current_unit_id` 깨진 참조 0 ·
실제 학생 동명이인 0 · 배정 0건인 실제 학생 0 · `words`/`students` 페이징 정상

### P2-1. 단어 0개 유닛 2건

`중2 능률 김기택 / Unit 1`, `중2 YMB 박준원 / Unit 1`

이미 `auditCurriculumIntegrity.mjs`의 **알려진 보류 allowlist**에 등록된
2건과 동일합니다(운영자 결정 대기). 학생 화면에는 빈 유닛으로 보일 수
있으므로 정리하거나 allowlist를 유지하거나 둘 중 하나를 택하면 됩니다.
→ **NEEDS APPROVAL** (데이터 삭제 판단은 운영자 몫)

### P2-2. 근거 0 `class_textbooks` 링크 6건

그 반 학생 중 **아무도** 그 교재를 배정받지도, 학습하지도 않는 링크입니다.

| 반 | 교재 | 소속 실제 학생 | 그중 배정/학습 | 분류 |
|---|---|---|---|---|
| Pre-Middle School | 고1 6월 학평 | 9명 | **0명** | LIKELY_WRONG |
| Pre-Middle School | 중1 동아 윤정미 | 9명 | **0명** | LIKELY_WRONG |
| Pre-Middle School | 중2 동아 윤정미 | 9명 | **0명** | LIKELY_WRONG |
| Pre-Middle School | 중2 천재 이상기 | 9명 | **0명** | LIKELY_WRONG |
| 중2 YMB 박준원(컨테이너, 소속 0명) | 중2 능률 김기택 | 0명 | 0명 | NEEDS_OWNER_CONFIRMATION |
| 중2 YMB 박준원(컨테이너, 소속 0명) | 중2 천재 이상기 | 0명 | 0명 | NEEDS_OWNER_CONFIRMATION |

**영향 범위**: 2026-08-11 확정 규칙에 따라 `class_textbooks`는 **입실시험
판정에 쓰이지 않습니다**. 따라서 이 링크들이 시험 노출에 미치는 영향은
**없습니다**. 남은 영향은 학생 화면 **교재 선택기 노출**뿐입니다 — 지금
Pre-Middle 9명은 선택기에서 고1·중2 타 교재를 골라 단어 학습을 할 수
있습니다(시험은 안 뜸).

**안전성 확인**: 이 링크를 지워도 **접근을 잃는 학생은 0명**입니다. 모든
실제 학생이 자기가 공부하는 교재에 대해 개별 배정(SCA)을 이미 갖고 있기
때문입니다(전수 확인). 그래도 **삭제하지 않았습니다** — 운영자 판단 사항.

### KEEP으로 분류된 링크 (삭제 금지)

| 반 | 교재 | 근거 |
|---|---|---|
| 각 교재 컨테이너 반 | 자기 소유 교재 | 구조상 필수 |
| MS Advanced Class | 고1 능률 민병천 | 8/15명 배정 보유 |
| MS Advanced Class | 고1 6월 학평 | 11/15명 배정 보유 |
| Pre-Middle School | 중2 YMB 박준원 | 7/9명 |
| Pre-Middle School | 중2 능률 김기택 | 3/9명 |
| Presentation 6 | 중1 동아 윤정미 | 2/8명 (Cherry·Irene) |
| Presentation 6 -2026 | 중1 동아 윤정미 | 1/7명 (Paul) |
| Presentation 6 -2026 | Presentation 6 -2026 | 7/7명 |

---

## 2. 코드 경로 구조 위험 (데이터는 아직 정상)

동시성/미래 입력에서 깨질 수 있는 지점입니다. **전부 제안만** 했고 코드
수정은 하지 않았습니다(대규모 refactor 금지 원칙).

### P0-1. `classes.name`에 UNIQUE 제약 없음 — 중복 반 생성 가능
`wordLibrary.js` `ensureClass()`는 SELECT 후 INSERT(TOCTOU). 동시 실행 시
같은 이름 반 2개가 생겨 유닛/단어/학생이 조용히 갈라질 수 있습니다.
→ SQL 제안: `supabase_v3_33_integrity_constraints.sql` (미실행)

### P0-2. `units(class_id, name)`에 UNIQUE 제약 없음 — 형제 유닛 분열 재발 가능
2026-08-09에 실제로 겪은 "Unit 1 vs Unit1" 사고의 재발 경로입니다. 현재는
`unitNameKey` 정규화로 **읽기 시점 감지**만 하고 쓰기 시점 차단은 없습니다.
→ 같은 SQL 파일에 제안(정규화 표현식 인덱스, 미실행)

### P0-3. primary 배정 플립이 원자적이지 않음 — "primary 2개" 창
`setPrimaryAssignment`/`setPrimaryTextbook`이 target→true, old→false 두 번의
UPDATE로 나뉘어 있어 중간에 네트워크가 끊기면 primary가 2개로 남습니다.
현재 실측 위반 **0건**이지만 감지 장치가 없었습니다.
→ **오늘 `verify:integrity`에 감지 단언을 추가**(아래 3절)

### P1-1. `setClassWords` 레거시 경로가 UPDATE/INSERT/DELETE 3단계 비원자적
중간 실패 시 유닛이 반쯤 마이그레이션된 상태로 남습니다. 관리자 PIN 경로
(`admin-content-write`)를 쓰면 서버가 처리하므로, **레거시 anon 경로를
쓰지 않는 것**이 현재의 완화책입니다.

### P1-2. 읽기 함수가 fire-and-forget 쓰기를 트리거 (`getStudentClassAssignments`)
레거시 모드에서만 발동하며 현재 프로덕션은 교재 모드라 비활성입니다.

### P1-3. `createClass`의 classType 불일치를 `console.warn`만 하고 진행
저장된 `class_type`이 의도와 달라지면 백필이 영구히 그 반을 건너뜁니다.

### P2 이하
`curriculumApi.listUnitsMeta`가 신뢰 불가한 `position` 컬럼으로 정렬(실측:
29개 유닛 중 27개가 0/NULL) · 기존 NULL `textbook_id` 유닛 소급 백필 없음 ·
`planWordsBulkReplace`가 입력 목록 자체는 dedupe하지 않음 · 곱슬 따옴표
정규화 불일치로 예문 중복 가능 · `unitNameKey`의 `0+(\d+)$` 정규식이
"Unit 2020" 같은 이름을 잘못 정규화 가능(현재 해당 데이터 없음).

---

## 3. 오늘 추가한 감지 장치 (코드만, DB 무변경)

`npm run verify:integrity`에 다음 불변식이 추가되어 있습니다:

- 학습 중인 유닛의 소유 반 ∈ 학생의 입실시험 조회 범위 (91차, 수정 전 8건 위반 → 현재 0건)
- `SCA.textbook_id` 전부 실존 교재 / `textbooks.owner_class_id` 전부 실존 반
- 두 축(class_id vs textbook_id) 갈라짐 건수 INFO 기록 (현재 56건, 설계상 정상)

---

## 4. NEEDS APPROVAL — 운영자 결정이 필요한 항목

| # | 항목 | 위험 | 필요한 조치 |
|---|---|---|---|
| 1 | 근거 0 `class_textbooks` 6건 정리 | 없음(접근 상실 0명) | 삭제 여부 판단 |
| 2 | 빈 유닛 2건 | 낮음 | 정리 또는 allowlist 유지 |
| 3 | `classes.name` / `units(class_id,name)` UNIQUE 제약 | 중복 생성 가능 | SQL 실행(대시보드) |
| 4 | `students`에 명시적 `archived`/`is_test` 컬럼 | 이름 규칙 의존(`UITest` 누락) | 스키마 추가 판단 |
| 5 | `UITest` 계정 처리 | 실제 학생으로 집계됨 | 이름 변경 또는 4번 |

**SQL 파일은 준비만 하고 실행하지 않았습니다**(헌법 규칙 8·13).
