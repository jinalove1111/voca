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

### 2026-08-11(94차) 추가 — 위 표의 후속 확인

- **"테스트 계정이 필터링 안 됨" → 해결됨.** "고1 능률 민병천" 분모
  사고(겉보기 10 vs 실제 12)를 조사한 결과, 테스트/QA 계정 판별이
  `StudentSelect.jsx`/`StudentDirectory.jsx` 두 곳에 각자 다른 사본으로
  하드코딩돼 있었고 관리자 분모(`fetchEntranceRosterForClass`)와
  Word King 랭킹(`api/compute-word-king.js`)에는 아예 적용조차 안
  돼 있었다(MS Advanced Class 132계정 전부가 Word King 랭킹 대상이던
  버그 포함). `src/utils/accountStatus.js` 신규로 4개 호출부를 단일
  진실 공급원으로 통합했다(워킹트리 변경, 커밋은 다음 세션). 실제 운영자
  QA 계정 `barry`가 기존 두 하드코딩 목록 어디에도 없어 "실제 학생"으로
  잘못 집계되고 있었다는 사실도 이번에 확인됨.
- **신규로 밝혀진 문제 — 실사용 계정이 `_INACTIVE` 이름을 달고 있는
  경우가 있다.** 권교빈 학생의 최근 학습(입실시험 능률 배정 포함)이
  이름이 `권교빈_DUP2_f7d36b_INACTIVE`로 바뀐 계정
  (`942e7e12-1fab-4948-a870-6d5dd5f7d36b`)에서만 발생하고 있었다. 이름
  기반 아카이브 필터(`isArchivedOrFixtureStudentName`)는 정확히 설계대로
  동작했지만, 그 결과 진짜 활동 계정이 "관리자 분모"에서 통째로
  빠지는 부작용이 발생했다 — 필터 로직 결함이 아니라 계정 이름 붙이기
  운영 관례와 실제 로그인 계정이 어긋난 것이 근본 원인. 4번 항목
  "NEEDS APPROVAL" 컬럼 SQL 준비 완료(아래 참고)로 이 계층의 판정을
  이름 문자열이 아닌 명시 컬럼으로 옮기면 구조적으로 재발을 막을 수
  있다.
- **`students.is_test`/`archived` 컬럼 — SQL 준비 완료, 실행 대기.**
  `supabase_v3_34_account_status.sql`(컬럼 + GRANT + 이름 규칙 백필 +
  검증 SELECT + 롤백)이 저장소에 있으나 운영자가 아직 실행하지 않았다
  (규칙 8). `accountStatus.js`/`entranceEligibility.js` 양쪽 다 이
  컬럼이 있으면 우선 사용하고 없으면 이름 폴백으로 이미 대비돼 있다
  (규칙 9) — 실행 전후 어느 쪽이든 앱은 깨지지 않는다. 별도로
  `supabase_v3_35_entrance_textbook_backfill.sql`(황다은/김규민/현다율/
  권교빈 canonical 계정에 능률 교재 SCA 행 4개 순수 INSERT)도 준비돼
  있음 — 상세 절차는 `docs/operations/2026-08-11-entrance-roster-
  backfill.md`, 세션 기록은 `handoff.md` 2026-08-11(94차).

## 7. 회귀 방지

```bash
npm run verify:eligibility   # 규칙 단위 테스트(mock, 네트워크 0) — 36단언
npm run verify:admin         # 라이브 정합성(testEntranceClassScope.mjs 포함)
npm run verify:integrity     # "학습 유닛의 소유 반 ∈ 조회 범위" 불변식
```

규칙을 바꾸려면 **반드시** `entranceEligibility.js` 한 곳만 고치고
`verify:eligibility`를 먼저 통과시킬 것. 호출부에서 개별로 조건을 덧붙이면
같은 사고가 네 번째로 재발한다.
