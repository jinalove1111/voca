# wiki/decisions.md — 설계 결정 로그

_이 저장소가 실제로 내린 설계 결정과 그 근거를 `handoff.md`/`ROADMAP.md`/
`CLAUDE.md`/`DATABASE.md`에서 추출한 것입니다. 각 항목은 "무엇을/왜/
언제(커밋 또는 날짜)" 3줄 형식. 발명된 결정 없음 — 전부 원본 문서에
실제로 기록된 것만._

## 1. `students` 테이블에 RLS 대신 컬럼 단위 GRANT 적용

- **무엇을**: 행 단위 RLS(`enable row level security` + policy) 대신,
  PIN 관련 4개 컬럼(`pin_hash`/`pin_fail_count`/`pin_locked_until`/
  `pin_setup_allowed`)만 Postgres 컬럼권한으로 anon/authenticated에서
  회수.
- **왜**: 이 앱은 Supabase Auth를 쓰지 않아 anon key 하나로 모든
  사용자가 접속 — 행 단위로 "누구인지" 구분할 방법이 없어 RLS가
  구조적으로 의미 없음. 진짜 위협(PIN 자격증명 탈취 → 오프라인
  브루트포스)만 잘라내는 최소침습 설계.
- **언제**: v1.9(2026-07-16 밤, P7 감사 후속). 근거:
  [`DATABASE.md` "RLS / 컬럼권한 현황"](../DATABASE.md#rls-컬럼권한-현황).

## 2. 학생 식별자를 이름 → `students.id`(UUID)로 전환

- **무엇을**: 학생 조회/저장/캐시 키를 이름 문자열에서 UUID로 전면
  교체(`wordLibrary.js`/`useStudent.js`/전체 화면).
- **왜**: v1.6 이전에는 이름이 사실상 전역 유일 키라, 동명이인 학생이
  서로의 별/포인트/캘린더/학습기록을 덮어쓰는 실제 프로덕션 데이터
  무결성 사고가 있었음(CTO 최우선순위 P0 대응).
- **언제**: v1.6, 커밋 `e492e29`~`2d6df5f`(2026-07-15~16). 근거:
  [`ROADMAP.md` v1.6 섹션](../ROADMAP.md#v16-학생-identity-p0-리팩터링이름id-이름pin-로그인-코드-완료-sql-마이그레이션-적용-대기-2026-07-16).

## 3. 로그인 UX를 "반 선택 2단계"에서 "이름+PIN"으로 변경

- **무엇을**: 기존 반 선택 → 학생 선택 방식 로그인을, 이름 입력 + 4자리
  PIN 입력 방식으로 전면 교체(등록 탭은 별도 분리).
- **왜**: v1.6 identity 리팩터링 작업 도중 운영자가 로그인 UX 자체를
  바꾸도록 중간 지시 — 동명이인 문제 해결과 함께 접근 제어(PIN)도
  같이 추가하려는 목적.
- **언제**: v1.6과 동시(2026-07-15~16), `StudentSelect.jsx` 전면 교체.
  근거: `handoff.md` "2026-07-15~16 — P0 학생 identity 리팩터링" 섹션.

## 4. 학생 PIN 자기설정을 "관리자 허용 게이트 + 1회 한정"으로 설계

- **무엇을**: 관리자가 특정 학생의 `pin_setup_allowed`를 true로 켜야만,
  그 학생이 `api/self-set-student-pin.js`로 딱 1회 자기 PIN을 설정할
  수 있음(성공 즉시 서버가 다시 false로 원복). 기존 "관리자 PIN
  초기화"/"임시PIN 일괄생성"은 폴백 수단으로 그대로 유지.
- **왜**: 운영자 지시로 PIN 운영 방식을 변경하되, 기존 관리자 주도
  방식을 삭제하지 않고 병행 — 약한 PIN(0000/1234류)은 서버에서 거부해
  자기설정이 보안 구멍이 되지 않도록 함.
- **언제**: v1.7(2026-07-16), 커밋 `99d862d`~`e97eb2a`. 근거:
  [`ROADMAP.md` v1.7 섹션](../ROADMAP.md#v17-pin-운영방식-변경-학생-최초-pin-자기설정-완료-2026-07-16).

## 5. 학생 "현재 유닛"을 `unit_name`(문자열) → `current_unit_id`(FK)로 전환

- **무엇을**: 학생의 현재 유닛 해석을 `unit_name` 문자열 매칭에서
  `students.current_unit_id`(uuid FK) 1차 해석으로 교체
  (`resolveStudentUnitObj()` 단일 경로). `unit_name`은 하위호환 폴백으로
  유지(삭제 안 함).
- **왜**: 문자열 매칭이 표기 차이("Unit 1" vs "Unit1")나 유닛 삭제에
  취약해 "학생이 첫 유닛으로 조용히 되돌아가는" 실버그가 있었음
  (`getClassWords()`의 `units.find(...) || units[0]` 폴백이 원인).
- **언제**: v2.1, 커밋 `98da563`~`7c99924`(2026-07-17 밤). 근거:
  [`ROADMAP.md` v2.1 섹션](../ROADMAP.md#v21-학생-unit-아키텍처-분리-완료-2026-07-17-밤).

## 6. 진행도 동기화를 last-writer-wins에서 필드별 병합으로 전환

- **무엇을**: 두 기기 교차 사용 시 로컬↔클라우드 병합을
  `mergeProgressRecords()`로 필드별 최대값/합집합(별 총합은 max, 스티커는
  id 합집합, 캘린더는 날짜별 병합 등) 방식으로 교체. 다이어리 삭제는
  tombstone(`diaryRemovedIds`)으로 재로그인 시 되살아나지 않게 함.
- **왜**: 기존 "나중에 저장한 쪽이 이긴다"(통째 덮어쓰기) 방식은 두
  기기를 교차로 쓰면 한쪽 진행분이 영구 유실되는 실제 버그가 있었고,
  라이브 대조군으로 재현·확인한 뒤 수정.
- **언제**: v2.2, 커밋 `d42c005`~`445da0b`(2026-07-17 밤 2차). 근거:
  [`ROADMAP.md` v2.2 섹션](../ROADMAP.md#v22-다중-기기-진행도-병합last-writer-wins-제거-완료-2026-07-17-밤-2차).

## 7. PIN 해싱을 외부 라이브러리(`bcrypt` 등) 대신 Node 내장 `crypto`(scrypt)로 구현

- **무엇을**: `api/_pinAuth.js`가 `bcrypt`/`argon2` 같은 외부 패키지 없이
  Node 내장 `crypto.scryptSync` + `timingSafeEqual`로 PIN 해시/검증을
  직접 구현.
- **왜**: 이미 있는 Node 내장 기능으로 해결 가능하면 새 패키지를
  추가하지 않는다는 이 저장소의 "외부 의존성 최소화" 원칙의 실례로
  코드 주석에 명시.
- **언제**: v1.6과 함께 도입(2026-07-15~16). 근거: `CLAUDE.md` 규칙 6,
  `DEVELOPER_GUIDE.md` Development Rules 5번.

## 8. 학부모 주간 리포트를 AI 호출 없이 규칙 기반 템플릿으로 구현

- **무엇을**: "AI가 써준 것처럼 보이는" 학부모 요약 문구를 실제 AI API
  호출 없이 `utils/weeklyReport.js`의 규칙 기반 템플릿으로 생성.
- **왜**: 비용이 드는 AI 기능은 무료 대안을 먼저 찾는다는 원칙 — 이
  기능은 무료 대안(템플릿)만으로 충분히 목적을 달성한다고 판단.
- **언제**: v1.1(2026-07-07). 근거: `CLAUDE.md` 규칙 7,
  `ROADMAP.md` v1.1 섹션. (대조: [`wiki/api-costs.md`](./api-costs.md)의
  `@anthropic-ai/sdk` 실사용처는 이 원칙의 예외가 아니라 "무료 대안이
  없는 다른 기능"에 한정 적용된 사례 — 상세는 해당 페이지 참고.)

## 관련 파일

`C:\voca\ROADMAP.md`, `C:\voca\handoff.md`, `C:\voca\CLAUDE.md`,
`C:\voca\DATABASE.md`
