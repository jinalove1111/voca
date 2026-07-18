# wiki/glossary.md — 용어집

_이 저장소 전용 용어를 코드/`DATABASE.md`에서 추출해 1줄씩 정의. 알파벳
순(컬럼/변수) → 개념 순으로 정리._

## DB 컬럼/테이블

- **`student_id`** — 대부분의 진행도류 테이블(`student_progress`,
  `word_status` 등)이 `students.id`를 참조하는 FK 컬럼명.
- **`current_unit_id`** — `students`의 컬럼(v2.1). 학생의 진짜 현재
  유닛을 가리키는 `units.id` FK. `unit_name`(문자열) 폴백보다 우선.
- **`unit_name`** — `students`의 레거시 컬럼(원본). 유닛 이름 문자열.
  v2.1 이후 `current_unit_id` 조회 실패 시에만 쓰이는 하위호환 폴백.
- **`daily_assignments`** — 반의 날짜별 "오늘의 단어" 배정 테이블
  (`class_id`, `date`, `word_ids` jsonb). 비어있으면 유닛 전체 단어로
  자동 폴백. 사실상 "숙제 배정"의 구현체.
- **`categories_completed`** — `student_daily_progress`의 컬럼. 오늘
  4개 카테고리(단어/예문/퀴즈/발음) 중 완료한 개수. **`>=4`가 "숙제
  완료"의 판정 기준.**
- **`spelling_direction`** — `classes`의 컬럼. 쓰기시험 출제 방향
  (`'kr2en'`\|`'en2kr'`\|`'random'`\|`'mixed'`). 값 검증은 DB CHECK가
  아니라 애플리케이션 레벨(`wordLibrary.js`).
- **`entrance_tests`** / **`entrance_test_results`** — 입실 단어시험
  (v1.8) 세션/결과 테이블. 반별 랭킹·오늘의 VIP 계산 원천.
- **`pin_setup_allowed`** — `students`의 boolean 컬럼(v1.7, 기본
  false). 관리자가 켜야만 학생이 자기 PIN을 1회 자기설정할 수 있음 —
  설정 성공 즉시 서버가 다시 false로 원복(재사용 방지).
- **`pin_hash`/`pin_fail_count`/`pin_locked_until`** — PIN 자격증명
  관련 컬럼 3종. v1.9로 anon/authenticated의 SELECT/UPDATE가 완전히
  차단됨, `api/*.js`(service_role)만 접근.
- **`word_status`** — 단어별 "알아요/모르겠어요"(Skip 기능) 상태 테이블
  (`known`\|`unknown`\|`skipped`\|`mastered`).
- **`accepted_meanings`** — `words`의 jsonb 컬럼(v2.0). 채점 시
  `meaning` 외에 추가로 정답 인정할 후보 목록.
- **`spelling_review_queue`** — 영→한 쓰기시험에서 한글로 답한 애매한
  오답을 교사가 검토해 `accepted_meanings`에 반영할지 결정하는 큐.
- **`progress_data`** — `student_progress`의 jsonb 컬럼. `useStudent.js`
  record(별/스티커/미션/캘린더 등 진행도 전체)를 통째로 백업.
- **`xp_ledger`** — Paul Rank System(v2.3, 2026-07-19) XP 지급 원장.
  `student_id`+`source_event_id` unique 제약이 중복 지급 방지
  메커니즘. anon read-only, 쓰기는 `api/grant-xp.js`(service_role)만.
  `total_xp`(레거시, `totalStars` 사본)와 무관한 완전히 별도의 값.
- **`xp_totals`** — `xp_ledger`를 학생별 `sum(amount)`로 집계한 VIEW
  (저장 컬럼 아님, 매 조회 재계산 — "파생값 우선" 원칙의 실례).

## Paul Rank System(v2.3, 2026-07-19) 개념

- **Rank(모자 색)** — 메이저 축. 누적 XP 임계값으로 결정되는 5단계
  (새싹모자/비니/탐험모자/마법모자/왕관모자, `RANKS` 배열,
  `src/utils/paulRankShared.js`).
- **Hat Stage(모자 크기)** — 현재 Rank 안에서 다음 Rank까지의 진행률을
  나타내는 5단계(Tiny 0.88/Small 0.94/Growing 1.00/Big 1.07/Max 1.14,
  `HAT_STAGES` 배열). 모자 색과 별개 축 — 색은 "어느 Rank인지", 크기는
  "그 Rank 안에서 얼마나 왔는지".
- **`computeRankState(xp)`** — Rank/Hat Stage/다음 단계까지 진행률을
  전부 계산하는 단일 순수 함수(입력은 xp 숫자 하나뿐 — Unit/반 등
  어떤 것도 입력에 없음, 그래서 Unit 전환이 Rank에 영향을 줄 수 없다는
  게 시그니처 자체로 보장됨).
- **경험 언락(Experience Unlock)** — `EXPERIENCE_UNLOCKS` 설정.
  Hat Stage별로 미래에 무엇이 열릴지의 매핑(forward-compatible 스키마).
  지금은 Tiny(핵심 학습)만 `status:'active'`이고 나머지 4단계는 전부
  `status:'planned'`(실제로 아무 기능도 이 설정을 소비하지 않음).
- **`XP_EVENT_TABLE`** — 서버(`api/grant-xp.js`)가 신뢰하는 유일한 XP
  금액 원천. 클라이언트는 이벤트 종류만 알리고, 금액은 항상 이
  테이블에서 서버가 조회(클라이언트가 보낸 amount는 절대 읽지 않음).

## 코드 개념/함수

- **`STORE_KEY`(`paul_easy_progress`)** — `useStudent.js`가 소유하는
  단일 localStorage 저장소 키. 진행도 관련 새 필드는 여기에 추가(별도
  키 신설 금지).
- **`restoreChecked`** — 클라우드 백업 복원 시도(성공/실패/타임아웃
  무관)가 끝났는지 나타내는 게이트. 로컬이 비어있는 학생은 이게 true가
  될 때까지 Dashboard 렌더가 보류됨.
- **`syncGenRef`** — 동기화 세대 카운터. 디바운스 동기화가 겹쳐
  실행돼도 "내가 여전히 최신 세대인지" 확인 후에만 업로드하게 하는
  레이스 가드(2026-07-18 도입).
- **`mergeProgressRecords()`** — v2.2 병합 정책의 핵심 함수. 필드별
  최대값/합집합으로 로컬↔클라우드 진행도를 병합(last-writer-wins 아님).
- **`resolveStudentUnitObj()`** — 학생의 현재 유닛을 해석하는 단일
  경로(v2.1). `current_unit_id` 우선, 없으면 `unit_name` 폴백.
- **`checkAdminReauth()`** — 관리자의 파괴적 액션마다 서버에서
  `ADMIN_PIN`을 다시 확인하는 함수. 클라이언트 `authed` state만으로는
  우회 불가.
- **`_cache`/`_students`/`_classSettings`** — `wordLibrary.js`의 모듈
  스코프 인메모리 캐시 3종(React state 아님). 로그인/앱 포커스 복귀
  시 새로고침.
- **`buildSteps(mode, ...)`** — `WordDetail.jsx`의 순수 함수. 학습
  모드(공부하기/퀴즈/쓰기/종합)별 스텝 배열을 조립.
- **`QA_` 접두** — 라이브 Supabase e2e 테스트가 생성하는 반/학생 이름
  접두사. 프로덕션 데이터(111명 학생)와 구분, 테스트 종료 시 정리.
- **`ADMIN_PIN`** — 관리자 인증용 환경변수(단일 PIN, 학생 PIN과 별개
  체계).

## 관련 파일

`C:\voca\DATABASE.md`, `C:\voca\src\hooks\useStudent.js`,
`C:\voca\src\utils\wordLibrary.js`
