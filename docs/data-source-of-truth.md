# 데이터 Source of Truth + 캐시/스테일 위험 지도

_작성: 2026-08-14 (99차 야간 자율, P2+P3). 최근 사고들의 공통 패턴 —
"DB는 정상인데 학생 휴대폰에는 이전 값이 보인다" — 를 데이터별로 추적한
결과. Service worker 없음 / Cache API 미사용 / SWR·query 라이브러리 없음 /
Vercel 헤더 정상(`max-age=0, must-revalidate`) — 전부 실측 확인. 따라서
스테일의 근원은 단 두 가지다: **① 모듈 스코프 메모리 캐시(로그인 시 1회
로드)** ② **켜둔 앱에 남은 낡은 번들**._

## 데이터별 SoT와 캐시 경로

| 데이터 | Source of Truth | 클라이언트 캐시 | 갱신 시점 | invalidate | 스테일 위험 |
|---|---|---|---|---|---|
| student identity | `students.id`(UUID) | localStorage `paulEasyVoca_currentStudent` | 로그인 | 로그아웃 시 remove | LOW — 계정 교체(DUP 개명) 시 낡은 UUID 가능(활동 기록으로 판별 가능, Amin 건에서 실측 배제) |
| class | `students.class_id` | 메모리 `_students` | 로그인 1회 | 관리자 화면 조작 시 refresh | MEDIUM — 수업 중 반 이동은 재로그인 전 미반영 |
| textbook 배정 | `student_class_assignments` | 메모리 `_studentAssignmentsCache` | 로그인 + **배너 fresh(97차)** | 배정 변경 함수들이 `delete(studentId)` | **해소됨(입실시험 경로)** — 배너가 시험 없을 때 60초마다 fresh. 그 외 화면은 세션 캐시 |
| current unit | `students.current_unit_id` + `SCA.current_unit_id` | 메모리 `_students`/`_studentAssignmentsCache` | 로그인/유닛 변경 | setStudentUnit이 갱신 | LOW — 본인 조작은 즉시 반영 |
| word list | `words` (JOIN units) | 메모리 `_cache` | 로그인 1회(`refreshWordLibrary`) | 관리자 편집 후 refresh(관리자 세션만) | **HIGH(잔여)** — 수업 중 단어 업로드는 학생 켜둔 앱에 미반영. 95차 절단 수정으로 "로드 자체"는 완전해짐(DB=APP=UI 34유닛 실측) |
| entrance test | `entrance_tests` | 캐시 없음(폴링) | 60초/5초 폴링 | — | LOW — 폴링이 SoT 직결 |
| test result | `entrance_test_results`(unique) | 캐시 없음 | 제출 시 서버 재채점 | — | LOW — 3중 중복 방어 |
| stars | `grantReward` 원장(dedupKey) → `student_progress` | localStorage `paul_easy_voca_v1` | 학습 이벤트 | 이름 소유권 가드(`paul_easy_name_claims`, 95차) | LOW — 28단언 + 호출부 6곳 전수 감사 |
| ranking | `entrance_test_results` | 캐시 없음 | 폴링 | — | LOW |
| 반 설정(쓰기 방향 등) | `classes.spelling_direction` 등 | 메모리 `_classSettings` | 로그인 1회 | 관리자 저장 시 | MEDIUM — 수업 중 설정 변경은 학생 재접속 전 미반영 (Irene 건: 값 자체가 kr2en이라 캐시 문제 아님) |
| **번들(코드)** | Vercel 배포 | 브라우저 메모리(켜둔 탭) | 페이지 로드 | 없음 — **알림 기능 없음** | **HIGH(잔여)** — Haeun 38개 건의 근원. 배포 후에도 켜둔 앱은 옛 코드 실행 |

## "앱을 껐다 켜야 정상화"가 남아있는 목록 (P3 결론)

| # | 항목 | 위험도 | 자동 갱신 제안(승인 대기, 미구현) |
|---|---|---|---|
| 1 | 켜둔 앱의 낡은 번들 | **HIGH** | index.html에 빌드 식별자 → 주기 비교 → "새 버전이 있어요" 새로고침 배너 |
| 2 | 수업 중 단어/유닛 업로드 미반영(`_cache`) | **HIGH** | 배너 fresh와 같은 패턴: 오늘 시험 발견 시 `refreshWordLibrary()` 1회 / 또는 유닛 진입 시 그 유닛만 재조회 |
| 3 | 수업 중 반 이동/설정 변경(`_students`/`_classSettings`) | MEDIUM | 드묾 — 가시성 복귀(visibilitychange) 시 경량 재조회 검토 |
| 4 | 계정 교체 후 낡은 세션 UUID | LOW | 로그인 응답에 계정 상태 포함 → 세션 UUID 검증(이미 이름 소유권 가드가 오염은 차단) |

CRITICAL 등급 없음 — 입실시험 배정 경로(가장 잦은 사고)는 97차 fresh로
해소됐고, 나머지는 발생 빈도가 낮거나(2·3) 데이터 오염이 아니라 표시
지연이다. 1번(번들)은 기능이므로 운영자 승인 후 별도 세션에서.

## 위험 구조("여러 곳에 다른 값") 점검 결과

`DB → API → React state → localStorage → cache` 5층 중 실제로 값이
분기될 수 있는 층은 **메모리 캐시 1곳**뿐이다(진도만 localStorage 병합
로직 보유 — maxNum 병합 + 이름 소유권 가드로 방어). "DB 40 / UI 38" 류는
전부 ①캐시 시점(로그인 이전 데이터) 또는 ②낡은 번들이었고, 로드 로직
자체의 결손은 95차 수정 이후 `verify:word-count`(DB=APP=UI, 34유닛)로
상시 감시한다.
