# Paul Easy Voca — 학생 흐름 전체 지도 (System Flow)

_작성: 2026-08-14 (99차 야간 자율, P1). 목적: 하나를 수정할 때 무엇이 함께
움직이는지 보이게 해서 회귀를 방지한다. 코드 실측 기준(추측 없음) —
각 항목은 실제 import/호출 관계를 grep으로 확인해 기록했다._

## 흐름 요약

```
LOGIN → (CLASS는 배정으로 결정) → TEXTBOOK 선택 → UNIT → WORD LIST
  → STUDY(발음/보기) → WRITING(쓰기) → QUIZ → ENTRANCE TEST → RESULT
  → STARS → RANKING
```

## 단계별 구성 요소

| 단계 | Component | Hook/Util | API/Table | 클라이언트 저장 |
|---|---|---|---|---|
| LOGIN | `StudentSelect.jsx` | `wordLibrary.refreshStudents`, `accountStatus` | `students`(SELECT), `api/verify-student-pin` `api/set-student-pin`(PIN은 서버만) | localStorage `paulEasyVoca_currentStudent`(세션 UUID), `paulEasyVoca_userRole` |
| CLASS | (화면 없음 — 배정이 결정) | `getStudentClassId/getStudentClass` | `students.class_id` | 메모리 `_students` |
| TEXTBOOK | `Dashboard.jsx` 선택기, `TextbookAssignmentPanel.jsx`(관리자) | `getStudentClassAssignments`, `getStudentPrimaryTextbook`, `setPrimaryTextbook` | `student_class_assignments`, `textbooks`, `class_textbooks` | 메모리 `_studentAssignmentsCache`, `_textbooks`, `_classTextbooks` |
| UNIT | `Dashboard.jsx` | `getStudentUnitId/resolveStudentUnitObj`, `setStudentUnit` | `students.current_unit_id`, `student_class_assignments.current_unit_id`, `units` | 메모리 `_cache`(반 트리) |
| WORD LIST | `Dashboard.jsx`, `WordDetail.jsx` | `getStudentWords`, `getWordsByUnitId`, `getClassWords` | `words` (1000행 페이지네이션 — 95차) | 메모리 `_cache` |
| STUDY(발음) | `WordDetail.jsx`, `SpeechBtn` | `useStudent.markPronunciationOk → grantReward` | `student_progress`(동기화) | localStorage `paul_easy_voca_v1`(진도), `paul_easy_name_claims`(이름 소유권) |
| WRITING | `SpellingQuestion.jsx` | `App.jsx assignDirections(mixed)`, `getClassSettings` | `classes.spelling_direction` 등 설정 | 메모리 `_classSettings` |
| QUIZ | `QuizScreen` 계열 | `useStudent` 채점/기록 | `student_progress`, `student_daily_progress` | 위와 동일 |
| ENTRANCE TEST | `EntranceTestBanner.jsx` → `EntranceTest.jsx`, 관리자 `EntranceTestAdmin.jsx` | `entranceEligibility`(자격) + `entranceTestSelection`(선택) + `entranceTestApi` | `entrance_tests`, `entrance_test_results`, `api/submit-entrance-result`(서버 재채점) | 메모리(entranceTestApi `_available`), 선택 유지 ref |
| RESULT | `EntranceTest.jsx` result phase | `computeTestResult`(로컬 즉시) + 서버 재채점 | `entrance_test_results` (unique test_id+student_id) | — |
| STARS | `useStudent.grantReward`(단일 경로) | dedupKey 멱등 + `starGrantLog` | `student_progress.total_stars` 동기화 | localStorage 진도 블롭 |
| RANKING | `EntranceTest.jsx`(RankingList), `EntranceTestAdmin.jsx` | `bestResultPerStudent → rankResults`(반드시 이 순서 합성 — `toRanked`) | `entrance_test_results` | — |

## 수정 시 전파 경로(자주 걸리는 것)

- **`wordLibrary.js`를 만지면**: 위 표의 거의 전 단계가 영향권. 반드시
  `verify:all` + `verify:word-count`(라이브 34유닛 대조).
- **eligibility/선택 로직**: 규칙은 `entranceEligibility.js`(누가) /
  `entranceTestSelection.js`(무엇을) 두 순수 모듈에만 있다. 화면·집계가
  각자 규칙을 갖는 순간 3회 재발한 사고가 돌아온다(94차) —
  `verify:entrance` 일괄 실행.
- **별 지급**: `grantReward` 단일 경로 + dedupKey 필수. 호출부 6곳 전부
  학습 완료 이벤트 내부(98차 전수 감사). 새 호출부를 만들면
  `verify:stars` + `testEntranceClassroomMatrix`(시험 화면 무접촉 단언).
- **배너/폴링**: `EntranceTestBanner`는 시험이 안 보이는 동안 배정을
  fresh 재해석(97차) — 이 동작을 끄면 Amin 사고가 재발한다
  (`verify:entrance-fresh-scope`).
