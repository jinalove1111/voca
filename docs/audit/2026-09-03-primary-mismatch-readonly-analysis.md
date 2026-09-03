# PRIMARY_UNIT_MISMATCH(27) / STUDENT_CLASS_IS_CONTAINER(6) READ-ONLY 분석 (2026-09-03)

야간 자율 작업 Track 15. `npm run prod:check`가 새로 보고한 WARN 두 종류를
대상으로, `.env`의 anon key로 PostgREST GET/HEAD만 사용해 학생별 실측
데이터를 수집하고, 앱 리졸버 코드(`src/utils/wordLibrary.js`)를 직접 읽어
"학생 화면이 실제로 보는 값"을 확정한 뒤 분류했다. **쓰기 0건, SQL 실행
0건** — 이 문서는 순수 조사 결과이며, 조치는 운영자가 별도로 결정·실행한다.

관련 문서: `docs/audit/2026-09-03-warn10-readonly-analysis.md`(Track 3,
`health:students` ASSIGNMENT_GHOST_UNIT 10건 — 이번 27건과 학생이 일부
겹치고 `v3_43_*.sql`이 이미 준비돼 있으나 스코프가 "유령 유닛 목적지"로
한정돼 있어 이번 27건 전체(유령 유닛이 아닌 정상 유닛 간 stale 포함)를
커버하지 않는다).

## 0. 요약

| 구분 | 건수 |
|---|---|
| `PRIMARY_UNIT_MISMATCH` 총 | 27 |
| ├ SCA만 stale(무해, 정합화만 필요) | 20 |
| └ 데이터 분기(운영자 결정) | 7 |
| ├ primary(stale) 쪽에만 학습기록 | 3 (Dain, 황성연, 김보민) |
| └ 두 유닛 모두에 학습기록 | 4 (현다율, Song, 이동훈, Nana) |
| **실사용 영향(학생 화면이 엉뚱한 유닛을 보여줌)** | **0** |
| `STUDENT_CLASS_IS_CONTAINER` 총 | 6 |
| ├ 실제 로그인 이력(학습기록 존재) 있음 | 2 (백아민, 임예지) |
| └ 학습기록 0건(PIN 미설정 추정, 확인 불가 — 아래 BLOCKED 참고) | 4 (UITest, 박규한, 이예원, Olivia) |

`PRIMARY_UNIT_MISMATCH` 27건은 **전부** 앱이 실제로 학생에게 보여주는
유닛(`students.current_unit_id`)이 정상적으로 해석된다 — 즉 이 WARN이
가리키는 "primary SCA 유닛"은 리졸버가 애초에 참조하지 않는 죽은 값이다
(근거는 §1). `STUDENT_CLASS_IS_CONTAINER` 6건은 로그인 자체는 막히지
않지만, PIN 자가설정 화면(반 선택 목록)에서 이 6명이 원천적으로 노출되지
않는다는 것이 코드 주석에도 명시돼 있다(§3).

## 1. 앱 리졸버 코드 근거 — "학생 화면이 실제로 보는 유닛"

`src/utils/wordLibrary.js`:

- **`resolveStudentUnitObj(id)`**(1909~1946행) — v2.1 이후 "단일 진실
  공급원". `_textbookMode`(교재 모드, 라이브에서 true)에서는:
  1. `getStudentPrimaryTextbook(id)`(617~626행)로 **primary SCA 행의
     `textbook_id`**를 교재로 확정한다.
  2. 그 교재의 유닛 목록(`getTextbookUnits(tb.id)`) 안에서
     `s.unitId`(= `students.current_unit_id`, 425/427행에서 로드)를
     **id로** 찾는다(1921~1923행). 찾으면 그 유닛을 그대로 반환한다.
  3. id로 못 찾을 때만 `unitName` 문자열 매칭으로 폴백하고(1929행), 그마저
     실패하면 조용한 "첫 유닛" 폴백 없이 `null`을 반환한다(2026-08-29
     P0 수정, 1925~1928행 주석).
- **`getStudentUnitId(id)`**(1955행) = `resolveStudentUnitObj(id)?.id`.
  화면 표시(`getStudentUnit`)와 단어 로딩(`getStudentWords`)이 **반드시
  같은 함수**를 거친다(1907행 주석) — 표시되는 유닛과 실제 단어가 어긋날
  수 없는 구조.
- **`getStudentPrimaryTextbook(studentId)`**(617~626행)는
  `_studentAssignmentsCache`(=`getStudentClassAssignments`가 채우는 SCA
  캐시)에서 `isPrimary`인 행의 `textbookId`를 쓴다 — **이 함수가 SCA에서
  실제로 쓰는 필드는 `is_primary`와 `textbook_id`뿐이고, SCA의
  `current_unit_id` 컬럼은 어디에서도 읽지 않는다.**

결론: 학생이 실제로 보는 유닛은 항상
`students.current_unit_id`(교재 unit id 기준)이고, primary
SCA 행의 `current_unit_id`는 **리졸버 경로 어디에도 참조되지 않는 죽은
컬럼**이다. `PRIMARY_UNIT_MISMATCH`는 이 죽은 컬럼과 실제 사용 컬럼이
다르다는 신호일 뿐, 그 자체로는 화면에 아무 영향이 없다 — 단, 예외는
`studentUnitId`가 primary 교재의 유닛 목록에 없는 경우(byId 실패 →
`unitName` 폴백 또는 `null`)인데, **실측 27건 전부 byId로 정상 해석됨**을
확인했다(§2 표의 "실사용 영향 0" 근거).

## 2. `PRIMARY_UNIT_MISMATCH` 27건 상세

방법: 각 학생의 `students.current_unit_id`(앱이 보여주는 값)와 primary
SCA의 `current_unit_id`(stale 후보)가 실제로 같은 primary 교재 소속인지
`units.textbook_id`로 확인하고, 두 유닛 각각에 대해 `word_status`를
`words.unit_id`로 집계해 학습기록 위치를 판정했다.

| 학생 | 반 | students.current_unit_id(앱이 실제로 보여줌) | primary SCA.current_unit_id(stale) | 학습기록 위치 | 분류 |
|---|---|---|---|---|---|
| Dain | Pre-Middle School | Unit5 (2학년 천재소영순, 40단어) | Unit2 (2학년 천재소영순, 40단어) | **primary(stale)쪽만**(40건, 최근 2026-08-26) | 데이터 분기(운영자 결정) |
| 박성준 | Pre-Middle School | Unit5 (중1 동아 윤정미, 40단어) | Unit2 (중1 동아 윤정미, 40단어) | student쪽만(40건, 최근 2026-09-01) | SCA만 stale(무해) |
| 백채아 | Presentation 6 | Unit1 (2학년 천재소영순, 40단어) | Unit5 (2학년 천재소영순, 40단어) | 둘 다 기록 없음 | SCA만 stale(무해) |
| Irene | Presentation 6 | 7 (중1 동아 윤정미, 40단어) | Unit 8 (중1 동아 윤정미, 40단어) | student쪽만(17건, 최근 2026-09-02) | SCA만 stale(무해) |
| Cherry | Presentation 6 | Unit2 (중1 동아 윤정미, 40단어) | Unit 7 (중1 동아 윤정미, 40단어) | student쪽만(1건, 최근 2026-08-18) | SCA만 stale(무해) |
| 김태율 | MS Advanced Class | Unit8 (고1 능률 민병천, 40단어) | Unit1 (고1 능률 민병천, 40단어) | 둘 다 기록 없음 | SCA만 stale(무해) |
| Yaeji | Presentation 6 | Unit 7 (중1 동아 윤정미, 40단어) | Unit3 (중1 동아 윤정미, 40단어) | 둘 다 기록 없음 | SCA만 stale(무해) |
| 전하은 | MS Advanced Class | Unit8 (고1 능률 민병천, 40단어) | 7 (고1 능률 민병천, 40단어) | 둘 다 기록 없음 | SCA만 stale(무해) |
| 황다은 | MS Advanced Class | 7 (고1 능률 민병천, 40단어) | Unit (고1 능률 민병천, **1단어=유령 유닛**) | 둘 다 기록 없음 | SCA만 stale(무해) |
| 박건우 | MS Advanced Class | Unit8 (고1 능률 민병천, 40단어) | Unit1 (고1 능률 민병천, 40단어) | 둘 다 기록 없음 | SCA만 stale(무해) |
| Amin | Presentation 6 | Unit 8 (중1 동아 윤정미, 40단어) | 7 (중1 동아 윤정미, 40단어) | 둘 다 기록 없음 | SCA만 stale(무해) |
| 김시윤 | Presentation 6 | Unit 7 (중1 동아 윤정미, 40단어) | Unit5 (중1 동아 윤정미, 40단어) | 둘 다 기록 없음 | SCA만 stale(무해) |
| 황성연 | MS Advanced Class | Unit6 (고1 능률 민병천, 40단어) | Unit2 (고1 능률 민병천, 40단어) | **primary(stale)쪽만**(3건, 최근 2026-08-10) | 데이터 분기(운영자 결정) |
| 신지율 | Pre-Middle School | Unit5 (2학년 천재소영순, 40단어) | Unit2 (2학년 천재소영순, 40단어) | student쪽만(23건, 최근 2026-09-02) | SCA만 stale(무해) |
| 현다율 | MS Advanced Class | Unit1 (고1 능률 민병천, 40단어) | Unit (고1 능률 민병천, **1단어=유령 유닛**) | **양쪽 다**(student 20건/최근 2026-08-27, primary 1건/최근 2026-08-23) | 데이터 분기(운영자 결정) |
| 박서진 | MS Advanced Class | Unit6 (고1 능률 민병천, 40단어) | Unit1 (고1 능률 민병천, 40단어) | 둘 다 기록 없음 | SCA만 stale(무해) |
| Harry | Pre-Middle School | Unit5 (2학년 천재소영순, 40단어) | Unit (2학년 천재소영순, **1단어=유령 유닛**) | 둘 다 기록 없음 | SCA만 stale(무해) |
| Song | Pre-Middle School | Unit5 (2학년 천재소영순, 40단어) | Unit2 (2학년 천재소영순, 40단어) | **양쪽 다**(student 29건/최근 2026-09-02, primary 34건/최근 2026-08-26) | 데이터 분기(운영자 결정) |
| Luke | Pre-Middle School | Unit2 (2학년 천재소영순, 40단어) | Unit (2학년 천재소영순, **1단어=유령 유닛**) | 둘 다 기록 없음 | SCA만 stale(무해) |
| 이동훈 | Pre-Middle School | Unit5 (2학년 천재소영순, 40단어) | Unit3 (2학년 천재소영순, 40단어) | **양쪽 다**(student 19건/최근 2026-09-01, primary 19건/최근 2026-08-30) | 데이터 분기(운영자 결정) |
| leo | Presentation 6 | Unit 8 (중1 동아 윤정미, 40단어) | Unit 7 (중1 동아 윤정미, 40단어) | 둘 다 기록 없음 | SCA만 stale(무해) |
| 문지유 | Pre-Middle School | Unit5 (2학년 천재소영순, 40단어) | Unit2 (2학년 천재소영순, 40단어) | 둘 다 기록 없음 | SCA만 stale(무해) |
| John | Pre-Middle School | Unit5 (2학년 천재소영순, 40단어) | Unit4 (2학년 천재소영순, 40단어) | student쪽만(21건, 최근 2026-09-02) | SCA만 stale(무해) |
| 이윤제 | Pre-Middle School | Unit5 (2학년 천재소영순, 40단어) | Unit (2학년 천재소영순, **1단어=유령 유닛**) | 둘 다 기록 없음 | SCA만 stale(무해) |
| 김가윤 | MS Advanced Class | Unit8 (고1 능률 민병천, 40단어) | Unit1 (고1 능률 민병천, 40단어) | 둘 다 기록 없음 | SCA만 stale(무해) |
| 김보민 | MS Advanced Class | Unit 1 (고1 6월 학평, 26단어) | Unit 5 (고1 6월 학평, 50단어) | **primary(stale)쪽만**(7건, 최근 2026-07-14) | 데이터 분기(운영자 결정) |
| Nana | MS Advanced Class | Unit8 (고1 능률 민병천, 40단어) | Unit6 (고1 능률 민병천, 40단어) | **양쪽 다**(student 10건/최근 2026-09-01, primary 40건/최근 2026-08-23) | 데이터 분기(운영자 결정) |

**"SCA만 stale(무해)" 20건**: `students.current_unit_id`가 primary
교재 안의 실제 유닛으로 정상 해석되고(§1의 byId 경로 성공), primary
SCA의 stale 값 쪽에는 학습기록이 없거나(대부분) 있어도 지금 화면과
무관한 값이다. `primary SCA.current_unit_id := students.current_unit_id`
로 정합화해도 학습기록(word_status 등) 자체는 전혀 건드리지 않으므로
안전하다.

**"데이터 분기(운영자 결정)" 7건**: primary SCA의 stale 유닛 쪽에도
실제 `word_status` 기록이 있다. 이는 "학생이 그 유닛에서도 공부한 적이
있다"는 뜻이지만, 지금 화면은 그 기록을 다시 보여주지 않는다(리졸버가
`students.current_unit_id`만 따라간다, §1). 두 경우로 나뉜다:
- primary(stale)쪽에만 기록(Dain/황성연/김보민 3건): 학생이 그 유닛에서
  학습했던 시점이 있고, 이후 `students.current_unit_id`가 다른 유닛으로
  바뀌었는데 SCA는 갱신 안 됨 — **반이동/유닛 재배정 이력을 SCA가 못
  따라간 것으로 추정**(추측 명시, 확정 아님). SCA를 단순 정합화(=
  `students.current_unit_id`로 덮어쓰기)하면 이 stale 유닛에 대한 "마지막
  배정 근거" 자체가 사라진다 — 운영자가 "이 학생이 왜 그 유닛에 잠깐이라도
  배정됐었는지" 확인이 필요하면 정합화 전에 먼저 열람할 것.
- 양쪽 다 기록(현다율/Song/이동훈/Nana 4건): 두 유닛 모두에서 학습한
  이력이 있다 — 정상적인 유닛 진행 히스토리일 가능성이 높다(예: Song은
  primary=Unit2에서 34건, 현재=Unit5에서 29건 — Unit2를 먼저 끝내고
  Unit5로 진행한 자연스러운 흐름과 일치). 이 경우도 SCA 정합화 자체는
  안전하지만, "데이터 분기"로 분류해 운영자가 맥락을 확인할 기회를 남긴다.

## 3. `STUDENT_CLASS_IS_CONTAINER` 6건 상세

### 3-1. 코드 근거 — 컨테이너 반이 학생에게 미치는 실제 영향

- **PIN 자가설정 화면 노출 차단(실제 영향, 확정)**:
  `src/components/StudentSelect.jsx` 98행 `const setupClassNames =
  getRealClassNames()`. `getRealClassNames()`(`wordLibrary.js`
  1104~1108행)는 `classifyRealClassNames`(1082~1092행)를 호출하는데,
  구조 모드(`class_type='textbook'` 값이 하나라도 있으면 활성 — 현재 라이브
  상태)에서는 `classType === 'textbook'`인 반을 **목록에서 완전히
  제외**한다(1085~1088행). `StudentSelect.jsx` 92~97행 주석이 이 영향을
  이미 명시하고 있다: *"교과서명 반에 아직 소속된 학생(정리 전)은 이
  목록에서 찾을 수 없다"*. "Presentation 6 -2026"은 `class_type='textbook'`
  이므로(prod:check 원본 detail 참고) PIN 만들기 반 선택 드롭다운에
  **절대 나타나지 않는다** — 이 6명은 PIN이 아직 없다면 자기 PIN을
  스스로 만들 방법이 없다(관리자가 직접 반을 실반으로 옮겨야 나타남,
  코드 주석 97행).
- **`getStudentsInClass(className)`**(`wordLibrary.js` 1731~1737행)는
  `students.class_id`로만 필터한다 — 컨테이너 반이 목록에서 원천 제외되므로
  이 함수가 컨테이너 반 이름으로 호출될 일 자체가 없다(즉 이중으로 막힘).
- **로그인(이름+PIN, PIN 이미 있는 경우) 자체는 안 막힘**:
  `api/verify-student-pin.js` 93행 select에
  `classes(name)`을 그대로 포함 — `class_type`을 걸러내지 않는다. 즉 PIN이
  이미 설정된 학생은 로그인에 성공하고, 서버가 돌려주는 `className`은
  컨테이너 반 이름("Presentation 6 -2026") 그대로다 — 학생 화면 상단 등에
  실제 반이 아닌 교재 컨테이너명이 표시되는 부작용은 있으나 학습
  자체(단어 로딩)는 `resolveStudentUnitObj`가 `_textbookMode`에서 primary
  교재 기준으로 해석하므로 별도 영향은 없다(§1).

### 3-2. 학생별 실측

전원 SCA 행이 **1개뿐**이며, 그 1개도 `is_primary=true`로 동일 컨테이너
반("Presentation 6 -2026")을 가리킨다 — 즉 `students.class_id`뿐 아니라
SCA에도 이 6명을 실반과 연결하는 다른 흔적이 전혀 없다.

| 학생 | students.class_id 반 | students.current_unit_id 유닛 | SCA 행 수 | SCA 내용 | 학습기록 | 실제 영향 판정 |
|---|---|---|---|---|---|---|
| UITest | Presentation 6 -2026 | Unit 1 | 1 | Presentation 6 -2026(textbook, primary=true) | 없음 | PIN 자가설정 목록 미노출(§3-1). 이름 자체가 QA/테스트 픽스처로 보임 — `isRealSetupStudent` 필터의 알려진 패턴(`_dup`/`_inactive`/`qa_`/`accountStatus.js` 목록)엔 안 걸리지만 운영자 확인 권장 |
| 백아민 | Presentation 6 -2026 | Unit 1 | 1 | Presentation 6 -2026(textbook, primary=true) | Unit 1 5건(최근 2026-07-10) | PIN 자가설정 목록 미노출. 과거 학습기록 존재 — PIN은 이미 설정돼 있을 가능성이 높음(§3-1 "로그인 자체는 안 막힘" 참고, 단 pin_hash는 서버 전용이라 직접 확인 불가) |
| 박규한 | Presentation 6 -2026 | Unit 1 | 1 | Presentation 6 -2026(textbook, primary=true) | 없음 | PIN 자가설정 목록 미노출. 학습기록 0건 — PIN 미설정 상태로 화면에 아예 못 나타나는 학생일 가능성 |
| 이예원 | Presentation 6 -2026 | Unit 1 | 1 | Presentation 6 -2026(textbook, primary=true) | 없음 | 박규한과 동일 |
| 임예지 | Presentation 6 -2026 | Unit8 | 1 | Presentation 6 -2026(textbook, primary=true) | Unit8 1건(최근 2026-07-11) + Unit 1 6건(최근 2026-07-11) | 과거 학습기록 존재(2개 유닛에 걸쳐) — 백아민과 동일 판정 |
| Olivia | Presentation 6 -2026 | Unit8 | 1 | Presentation 6 -2026(textbook, primary=true) | 없음 | 박규한과 동일 |

**해석**: 학습기록이 있는 2명(백아민/임예지)은 과거 어느 시점에 실제로
로그인해 공부했다는 뜻이므로, PIN이 이미 설정돼 있고 지금도 로그인
자체는 가능할 개연성이 높다 — 이들의 실질 피해는 "반 이름이 컨테이너로
잘못 표시되는" 수준일 수 있다. 학습기록이 0건인 4명(UITest/박규한/
이예원/Olivia)은 PIN 자가설정 화면에서 애초에 보이지 않으므로 **PIN
자체를 아직 못 만들었을 가능성**이 있다 — 다만 `pin_hash`/
`pin_setup_allowed`는 CLAUDE.md 규칙 11에 따라 클라이언트/이 감사
어디서도 조회하지 않으므로(서버 전용) 확정할 수 없다(§4 BLOCKED 참고).

## 4. 정합화 규칙 제안

**대상**: §2의 "SCA만 stale(무해)" 20건(그리고 "데이터 분기" 7건도
운영자가 stale 값의 배경을 확인한 뒤 동일 규칙 적용 가능).

**규칙**: `student_class_assignments`에서 `is_primary = true`인 행의
`current_unit_id`를, 같은 학생의 `students.current_unit_id`로 갱신한다.
조건:
- `students.current_unit_id`가 그 primary 행의 `textbook_id` 소속
  유닛이어야 한다(§1의 byId 경로가 실제로 성공하는 케이스만 — 27건 전부
  해당, 실사용 영향 0건이므로 이 조건은 이미 충족).
- `word_status`/`student_progress`/`student_daily_progress` 등 학습기록
  테이블은 전혀 건드리지 않는다(§1에서 확인했듯 리졸버가 SCA의
  `current_unit_id`를 아예 읽지 않으므로 갱신해도 학생 화면/학습기록에
  0 영향).

**생성기 방식**: `generateGhostScaManifest`(`v3_43_*.sql`을 만든 생성기,
Track 3 산출물)와 동일한 패턴 — 라이브 SCA를 읽어 "무엇을 무엇으로
바꾸는지"를 명시적으로 나열하는 manifest를 만들고, 그 manifest로부터
멱등 UPDATE SQL(`update student_class_assignments set current_unit_id =
$new where student_id = $sid and is_primary = true and current_unit_id =
$old`— WHERE에 old 값을 포함해 이중 실행에도 안전)을 생성하는 방식을
그대로 재사용할 수 있다. 다만 이번 27건은 `v3_43`의 스코프(유령 유닛
목적지)보다 넓다(정상 유닛 간 stale 포함) — 새 SQL 파일
번호(`v3_45` 등)로 별도 준비가 필요하다(**이번 세션은 READ-ONLY
지시라 SQL 파일 자체를 만들지 않았다** — §5 참고).

`STUDENT_CLASS_IS_CONTAINER` 6건은 SQL 정합화가 아니라 **학생 재배정**
(관리자 화면에서 `students.class_id`를 실반으로 이동) 문제라 이 생성기
패턴과 무관하다 — 어느 실반으로 옮길지는 데이터만으로 판단할 수 없다
(원래 소속이 기록에 남아있지 않음, §3-2 "SCA 행 수 1개뿐" 참고).

## 5. BLOCKED_FOR_OPERATOR

1. **`STUDENT_CLASS_IS_CONTAINER` 6명의 PIN 설정 여부** — `pin_hash`/
   `pin_setup_allowed`는 CLAUDE.md 규칙 11에 따라 서버(`api/*.js`,
   service_role)만 조회할 수 있다. 이 6명 중 학습기록 0건인 4명이
   PIN을 못 만들어서 한 번도 로그인 못 한 상태인지, 아니면 PIN은
   있는데 단순히 아직 공부를 안 한 것인지는 이 read-only 감사로는
   구분 불가 — 운영자가 관리자 도구(`student-pin-status` API 등)로
   확인 필요.
2. **컨테이너 반 6명을 어느 실반으로 옮길지** — SCA/학습기록 어디에도
   "원래 실반이 무엇이었는지"의 흔적이 없다(§3-2). 운영자가 수기로
   실제 반을 파악해 관리자 화면에서 재배정해야 한다.
3. **"데이터 분기" 7건의 stale 유닛 배경**(§2 하단) — 왜 그 시점에
   그 유닛으로 SCA가 찍혔는지(반이동/오배정/정상 진행 중 스냅샷 등)는
   운영자의 기억/수업 기록에 의존해야 확정 가능하다.
4. **정합화 SQL 자체는 이번 세션에서 준비하지 않았다** — 이번 트랙은
   READ-ONLY 지시였으므로 §4는 "가능한 규칙 제안"까지만이고, 실제
   SQL 파일 작성은 별도 작업(승인 후)으로 남긴다.

---

`DB WRITE: 0 / SQL EXECUTION: 0`
