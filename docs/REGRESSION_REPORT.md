# 회귀 검사 보고서 — 2026-08-11 (93차 야간)

_병렬 읽기 전용 감사 4건 + 라이브 데이터 검사 + 전 도메인 하네스 실행
결과입니다. 발견 항목은 **검증 후** 기록했습니다 — 감사에서 올라온 지적
중 실제로는 정상인 것(오탐)도 그 근거와 함께 남깁니다._

---

## 1. 하네스 결과 (기준선 = 종료 시점, 동일)

| 명령 | 결과 |
|---|---|
| `npm run build` | PASS (에러/신규 경고 0) |
| `npm run verify:all` | **전 도메인 PASS** (speaking/listening은 기존 SKIP) |
| `npm run verify:integrity` | PASS — 15개 단언(오늘 2개 추가) |
| `npm run verify:eligibility` | PASS — 36단언 (오늘 신규) |
| `npm run verify:class-textbooks` | 정보 출력 (오늘 신규, exit 0) |

---

## 2. 라이브 데이터 무결성 (21항목)

**P0: 0건 / P1: 0건 / P2: 2건 / 정상: 18건** — 상세는
`docs/DATA_INTEGRITY_REPORT.md`.

특기: `is_primary` 2개 이상인 학생 **0명**, 고아 유닛/단어 **0건**,
`students.current_unit_id` 깨진 참조 **0건**, 실제 학생 동명이인 **0건**.

---

## 3. 확정 결함 (검증 완료)

| # | 항목 | 심각도 | 조치 |
|---|---|---|---|
| D1 | eligibility 규칙이 3곳에 흩어져 3일간 3번 재발 | P1 | **수정 완료** — 순수 모듈로 단일화 + 36단언 고정 |
| D2 | `practice_sentence` 쓰기 경로에 데이터 계층 검증 없음 | P1 | **감지 추가** — `verify:integrity`가 저장된 값을 사후 재검증(25건 PASS). 쓰기 차단은 NEEDS APPROVAL |
| D3 | 관리자 분모 조회 실패가 "0명"과 구분되지 않음 | P2 | **수정 완료** — "확인 실패" 표시 |
| D4 | 시험 중 새로고침 시 제한시간 리셋 | P2 | 미수정 — `docs/MOBILE_QA.md` R1 (더 나쁜 실패 모드 위험, 정책 결정 필요) |
| D5 | 종료된 시험에 지각 제출 가능(표시 없음) | P2 | 미수정 — 설계상 허용, 표시 여부는 운영자 판단 |
| D6 | `classes.name` / `units(class_id,name)` UNIQUE 제약 없음 | P0(구조) | SQL 제안만 — `supabase_v3_33_integrity_constraints.sql` (미실행) |
| D7 | primary 배정 플립이 비원자적(2개 창) | P0(구조) | 감지만 추가(현재 위반 0). 제약은 코드 수정과 짝이라 보류 |
| D8 | `UITest` 계정이 실제 학생으로 집계됨 | P3 | 이름 규칙의 한계 — NEEDS APPROVAL |
| D9 | 교재/유닛 `<select>` 터치 타깃 34px | P3 | 미수정(네이티브 select는 OS 히트박스 보정) |

---

## 4. 감사에서 올라왔으나 **검증 결과 정상**이었던 것 (오탐)

에이전트 지적을 그대로 반영했다면 오히려 기능을 망가뜨렸을 항목입니다.

| 지적 | 검증 결과 |
|---|---|
| "숙제 완료 현황(`AssignmentHistoryPanel`)의 분모가 `students.class_id`라 틀렸다 — SCA 기준으로 바꿔야" | **오탐.** 숙제(`daily_assignments`)는 `wordLibrary.js:2868`에서 **`humanClassId`(사람 반) 기준**으로 조회된다. 즉 숙제 대상 자체가 사람 반이므로 현재 분모가 **맞다.** SCA 기준으로 바꿨다면 완료율이 틀어졌을 것 |
| "`DuplicateStudentAudit`가 `_DUP`/`_INACTIVE`를 제외하지 않는다" | **오탐(의도된 동작).** 이 화면은 **중복 계정을 조사하는 도구**라 `_DUP` 계정을 봐야 한다. 제외하면 도구가 무력화된다. 다만 "전체 실학생 N명" **라벨**은 오해 소지가 있어 P3로 남김 |
| "학생 화면에 모바일 오버플로 위험" | **오탐.** `.word-text`/`.meaning-box-text`가 이미 처리(`index.css:61-91`) |

---

## 5. 성능 관측 (수정하지 않음 — Correctness > Performance)

| 항목 | 관측 | 판단 |
|---|---|---|
| 탭 포커스 복귀마다 `refreshWordLibrary()`로 전체 카탈로그 재조회 | 학생 폰이 앱 전환 후 돌아올 때마다 전 단어·전 학생 재로드 | 가장 큰 읽기 증폭원. 다만 데이터 정확성 보장 장치와 얽혀 있어 **야간에 건드리지 않음** — NEEDS APPROVAL |
| 로그인 시 `getStudentClassAssignments` 2회 호출 | 의도된 "2차 방어"(콜드스타트 수정) | 쿼리 1건 절약 vs 회귀 위험 → 유지 |
| 진행도 저장이 read-then-write 3라운드트립(2초 디바운스) | 다기기 데이터 손실 방지 장치 | 유지(디바운스 확대는 검토 가능) |
| 페이징 헬퍼가 두 곳에 복사됨 | 과거 P0 2건(words/students 1000행 잘림)의 재발 경로 | 공용 헬퍼 추출 권장(미수정) |

---

## 6. 새로 추가된 회귀 방지 장치

| 장치 | 무엇을 막나 |
|---|---|
| `verify:eligibility` (36단언, 네트워크 0) | eligibility 규칙 변경/재발. "같은 반 다른 교재 미노출", "초등부+고1 배정 시 노출", "두 교재 배정 시 양쪽 대상", **반증 테스트**(class_textbooks·current_unit_id·반 이름이 판정에 못 들어옴) |
| `verify:integrity` 신규 2단언 | 본문에 없는 `practice_sentence`, target word 누락 |
| `verify:class-textbooks` | 근거 없는 반-교재 링크 누적 감지 |
| `testEntranceClassScope.mjs` 5번 섹션(어제 추가) | 관리자 분모 ≠ 학생 대상 드리프트 |

---

## 7. 다음 세션이 먼저 볼 것

1. `docs/CLASS_TEXTBOOK_MODEL.md` — 5개 개념을 섞으면 같은 사고가 재발한다
2. `docs/DATA_INTEGRITY_REPORT.md`의 NEEDS APPROVAL 5건
3. `docs/MOBILE_QA.md`의 R1(시험 중 새로고침) 정책 결정
