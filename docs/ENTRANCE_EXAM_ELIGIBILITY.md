# 입실시험 Eligibility — 판정 로직 기준서

_작성 2026-08-11 (93차). 개념 정의는 `docs/CLASS_TEXTBOOK_MODEL.md`를 먼저
읽으세요. 이 문서는 "코드가 실제로 어떻게 판정하는가"를 다룹니다._

---

## 1. Canonical Rule

```js
// src/utils/entranceEligibility.js — 순수 함수, 네트워크/DB 무접촉
entranceScopeClassIds({ primaryClassId, assignments, resolveTextbookOwnerClassId })
  → [classId, ...]        // 중복 제거, 사람 반이 항상 첫 원소

isInEntranceScope(scope, entranceTests.class_id) → boolean
```

| 근거 | 조건 | source 코드 |
|---|---|---|
| A | `students.class_id` === 시험 반 | `CLASS_MEMBER` |
| B | 배정 행의 `class_id` === 시험 반 | `INDIVIDUAL_CLASS` |
| C | 배정 행 `textbook_id`의 교재 소유 반 === 시험 반 | `INDIVIDUAL_TEXTBOOK` |

셋 중 **하나라도** 만족하면 대상. `entranceEligibilitySource()`가 어느 근거로
통과했는지 반환하므로, "왜 이 학생이 대상인지"를 코드/테스트에서 추적할 수 있다
(UI 표시는 하지 않음 — 필요해지면 그때).

## 2. 판정에 쓰지 않는 것 (반증 테스트로 고정)

| 제외 | 이유 | 실측 근거 |
|---|---|---|
| `class_textbooks` | 반 링크만으로 전원이 대상이 됨 | 고1 능률 8→15명, Pre-Middle 9명 오노출 |
| `current_unit_id` | 교재를 오가는 학생이 누락됨 | 김보민(학평 학습 중, 능률도 배정) |
| 학년/반 이름 | 중2도 고1 교재 배정 시 봐야 함 | 운영자 확정 원칙 |

`entranceScopeClassIds`는 인자로 객체 하나만 받고 반 이름 문자열을 아예
입력으로 받지 않는다 — 이름 기반 분기가 **구조적으로 불가능**하다.

## 3. 두 화면이 같은 규칙을 쓰는 방법

| 화면 | 함수 | 재료 |
|---|---|---|
| 학생 배너/응시 | `getStudentEntranceClassIds(studentId)` | 배정 캐시(콜드면 1회 조회) |
| 관리자 "반 전체 N명" | `fetchEntranceRosterForClass(classId)` | 반 단위 역방향 조회 |

관리자 쪽은 성능상 "반 → 학생" 역방향 쿼리(`class_id.eq.X OR textbook_id.in.(X 소유 교재)`)
로 같은 집합을 구한다. 두 방향이 어긋나지 않도록 **라이브 교차 테스트**가
`scripts/testEntranceClassScope.mjs` 5번 섹션에 있다:

- 모든 실제 반에서 관리자 분모 == 원시 데이터로 독립 계산한 기대 집합
- 분모의 학생은 학생 화면 조회 범위에도 그 반을 갖는다
- 분모에 아카이브/중복/QA 계정이 섞이지 않는다

## 4. 아카이브/중복/QA 계정

`isArchivedOrFixtureStudentName(name)` — `_DUP`/`_INACTIVE` 접미, `QA_`/`_QA_`
접두(대소문자 무시). **관리자 분모에서만** 제외한다(표시 정확성). 학생 화면
판정에서는 제외하지 않는다 — 그 계정으로 로그인하는 일 자체가 정상 경로가
아니고, 판정 규칙을 계정 종류로 오염시키지 않기 위함.

> 한계: 이 판별은 **이름 문자열 관례**다. `UITest` 같이 규칙에 안 걸리는
> 테스트 계정은 실제 학생으로 집계된다. 근본 해결은 `students`에 명시적
> `archived`/`is_test` 컬럼을 두는 것 — DDL이 필요해 **NEEDS APPROVAL**.

## 5. 시험 생성 쪽 (변경 없음)

관리자가 반을 고르면 `entrance_tests.class_id`에 그 반 id가 저장된다.
생성 시 멤버십 검증은 하지 않는다(원장이 의도적으로 특정 교재 반에 여는
흐름). 채점/제출은 `api/submit-entrance-result.js`가 시험 스냅샷으로
재채점하며 **반 소속을 검증하지 않는다** — 따라서 eligibility 변경이
제출/저장/랭킹 경로에 영향을 주지 않는다.

## 6. 알려진 한계 / 미해결

| 항목 | 상태 |
|---|---|
| 한 학생에게 서로 다른 반의 active 시험이 동시에 있으면 먼저 생성된 것 하나만 보임 | 현재 미해결(발생 시 원장이 하나를 종료하면 됨) |
| 관리자 UI에 eligibility source 표시 없음 | 내부 추적만 가능(의도적) |
| `UITest` 등 규칙에 안 걸리는 테스트 계정 | NEEDS APPROVAL (DDL 필요) |

## 7. 회귀 방지

```bash
npm run verify:eligibility   # 규칙 단위 테스트(mock, 네트워크 0) — 36단언
npm run verify:admin         # 라이브 정합성(testEntranceClassScope.mjs 포함)
npm run verify:integrity     # "학습 유닛의 소유 반 ∈ 조회 범위" 불변식
```

규칙을 바꾸려면 **반드시** `entranceEligibility.js` 한 곳만 고치고
`verify:eligibility`를 먼저 통과시킬 것. 호출부에서 개별로 조건을 덧붙이면
같은 사고가 네 번째로 재발한다.
