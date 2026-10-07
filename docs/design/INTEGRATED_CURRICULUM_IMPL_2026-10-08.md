# 통합 과정 구현 1차 — 공통 데이터 구조 + 회화 초급 시범 Unit "교실에서 물건 빌리기" (2026-10-08, 224차)

_기준 문서: 운영자 첨부 `Paul_English_Integrated_Curriculum_v1.md`(2026-10-08, 220줄, 전문 읽음). 그 문서가 밝힌 대로 기간·문항 수·텍스트 길이는 **운영 가안**이며, 이 문서는 "전체 과정의 설계 완료"가 아니라 "공통 구조 정리 + 시범 Unit 1개 구현"을 기록한다. QA 전용·PR #62 Draft·DB/SQL/Production 무변경._

## 1. 설계안 대조 — 기존 구현에서 재사용·수정·신규

| 설계안 요소(§) | 기존 구현 | 판단 |
|---|---|---|
| 의사소통 목표로 Unit 정의(§3) | `commGoals.js` 목표 13개 × 레벨 3(223차), `speakingTopics.js` 주제 6개 | **재사용**: Unit은 `goalId`로 목표를 가리킨다 |
| 지원 단계 ①~④, 영어 수준과 분리(§3·§11) | 없음(Speaking은 모범→숨김→전이 흐름만) | **신규**: `courseModel.SUPPORT_STAGES` 4단계, 영역(말하기/읽기·쓰기)별 필드 |
| 과정·블록(§2·§5) | 없음 | **신규(데이터만)**: `COURSES` 5·`CONVERSATION_BLOCKS` 6 — 기간은 "가안" 문자열, 영국 학년·CEFR·권수 필드 없음 |
| 상황/이야기 → 어휘 → 듣기 → 읽기 → 문형 → 말하기 → 쓰기 → 새 상황 → 회상(§3) | 이야기·말하기(한 문장 흐름·연습·시험)·쓰기(상황→쓰기→비교) 있음; 어휘·듣기·읽기·문형·복습 활동 없음 | **재사용** 말하기·쓰기, **신규** 어휘·듣기·읽기·문형·복습(작은 선택형·회상형 활동) |
| 모범은 가능한 답 중 하나, 대체 답 인정(§3) | Speaking alternatives, Writing acceptNoteKo | **재사용** 규칙 그대로(문형 문항도 Could I…를 오답으로 두지 않음) |
| 회상 과제는 확인 전 모범 숨김(§3) | Speaking 시험·회상, Writing 비교 전 | **재사용**: 복습 활동도 같은 규칙(공개 전 영어·음성 미마운트) |
| 음성(§13) | `speech.js` en-GB TTS, `useLocalRecorder` 기기 녹음 | **재사용**: 듣기 대화는 문장 TTS 차례 재생(버튼), 녹음은 기존 Speaking 흐름 안에서 |
| 학생 상태 필드(§11·§12): activityCompleted/selfChecked/teacherObserved/demonstratedIndependent/reviewNeeded | Speaking selfReport, Writing drafts(first/revised/helped/compared) | **신규** `unitRecords.js`: 플래그 5개, 앱은 completed·selfChecked만 쓴다 |
| 학생 홈 "오늘의 학습/따로 연습/나의 성장"(§12) | 4카드 홈(단어/문장/말하기/성장) | **최소 수정**: QA 홈 맨 아래 [오늘의 학습 (시범)] 진입 1개 — 여섯 영역 메뉴를 늘리지 않음(설계안 §12 "처음부터 복잡한 메뉴 강제하지 않음") |
| 교사 화면·배정·제출(§12) | 없음 | **이번 범위 밖**(설계만, QA 배정 = 고정 시범 Unit) |
| 파닉스 Unit·음소 모델(§4·§14) | 없음 | **하지 않음**(검수 전 대량 생성 금지) |

## 2. 공통 데이터 구조 (`src/utils/curriculum/`)
- `courseModel.js`: `COURSES`, `CONVERSATION_BLOCKS`, `SUPPORT_STAGES`(모범과 함께/단서로/혼자/새 상황에서), `SUPPORT_AREAS`(speaking/literacy), `RECORD_FLAGS`·`APP_SETTABLE_FLAGS`, `ACTIVITY_KINDS`, `validateUnit(unit)`(데이터 계약 검사기).
- Unit 계약(설계안 §12 필드 제안을 이번 범위로 줄임): `{ id, course, block, goalId, level, titleKo, situationKo, keyItemId, vocab[], listening{turns[], questions[]}, reading{text, items[]}, grammar{noticing[], items[]}, speaking{steps[]}, review[], activities[](화면 순서·연결), sources[](official/research/own 구분), observation[] }`. 학생 기록은 Unit과 분리(`unitRecords.js`): `{ [unitId]: { activities: { [id]: 플래그 5 }, support: { speaking, literacy } } }`, 키 = `students.id` UUID, 기기 임시 저장, 선생님 자동 전송 없음.
- 점수·숙달·진급 필드는 없다. `completed`는 "활동을 끝까지 해 봤다"는 참여 기록이고(설계안 §11 "참여 기록일 뿐 숙달 증거가 아니다"), `teacherObserved`·`demonstratedIndependent`는 교사 확인 수단이 생기기 전까지 앱이 켤 수 없다.

## 3. 시범 Unit: 교실에서 물건 빌리기 (`src/utils/curriculum/unitBorrow.js`)
- 과정 회화 C1 · 목표 요청하기 · 레벨 1→2 · 핵심 표현 기존 s02-03 "Can I borrow a pencil?" · 이야기 = 기존 2화(내 필통의 숟가락 → 연필 없음 → 미아에게 빌림 → 지우개 빌림) — 자체 제작 Paul·Mia 이야기(상업 교재 무관).
- 활동 7종(화면 순서): ① 어휘(상황 필수 말 + 🔊) ② 듣기(폴·미아 대화를 문장 TTS로 듣고 "폴에게 필요한 물건" 고르기, 대본은 '글로 보기' 뒤) ③ 읽기(≤70단어 짧은 이야기 + 이해 3문항, 근거 문장 표시) ④ 말하기(**기존** 2화 한 문장 흐름: 따라 하기 → 영어 숨기고 회상 → 새 상황; 물건 바꿔 말하기는 기존 연습 s02-03/s02-04) ⑤ 문형(Can I borrow…? 관찰 2 + 선택 3, Could I…는 오답 아님) ⑥ 쓰기(**기존** w-s02-03 쓰기→비교→수정) ⑦ 복습(다른 물건·장소 2상황, 확인 전 답 숨김).
- 콘텐츠 상세와 출처(공식 목표/연구/자체 결정 구분)는 `unitBorrow.js`의 `sources`와 교육 설계 담당 메모(§7).

## 4. 화면 (`src/components/UnitScreen.jsx`, QA 전용)
- Unit 개요: 제목·상황·**[다음 활동]** 큰 버튼 + 활동 7개 순서 목록(완료/다음/아직) + 오늘 도움 정도(말하기·읽기·쓰기 따로, 수준이 아님을 명시) + 임시 저장·점수 아님 안내. 한 화면에 "지금 할 것"과 "다음 행동"이 보인다.
- 활동 화면: 선택형은 고른 뒤 맞음/다시 보세요 + 근거만(점수 없음, 다시 고를 수 있음). 문항을 모두 해 보면 `completed`; 자기 확인(할 수 있었어요/아직 어려워요)은 `selfChecked`. 선생님 확인은 안내 문구만.
- 연결: 말하기 → `SpeakingPractice initialMode='key' initialSetId='ep02' menuExits`(← 메뉴가 Unit으로), 쓰기 → `WritingPractice startItemId='w-s02-03'`(← 목록이 Unit으로). 홈에서 다시 말하기/문장 쓰기를 열면 링크 초기화.
- 진입: QA 홈 맨 아래 [📚 오늘의 학습 (시범)]. `App` `QA_ONLY_SCREENS`에 `unit` 추가(비QA 계정은 대시보드로 튕김).

## 5. 설계안 인용의 확인 상태 (이 세션 기준 — 미확인은 근거로 쓰지 않음)
| 설계안 §15 항목 | 확인 |
|---|---|
| England National Curriculum — English programmes of study | **미확인**(이 세션은 Languages KS2 PoS만 원문 확인·OGL). English PoS는 다음 단계에서 원문 확인 |
| Bell EAL Assessment Framework | 미확인(403) — 비상업 조건 가능성, 밴드 이름·서술자 복제 금지 |
| Hulme et al. 2012 / Fricke et al. 2013 / Sweller et al. 2019 / Cepeda et al. 2008 / Graham et al. 2012 | **미확인**(이번 세션 조회 안 함) — 파닉스·발표·독해 구현 전에 초록 이상 확인 |
| Karpicke & Roediger 2008 | 초록 확인(222차) — 대학생 외국어 어휘; 초등 회화 직접 입증 아님 |
- 적용: 시범 Unit의 "모범 숨긴 회상·복습"은 Karpicke & Roediger·Roediger & Karpicke(§8)의 방향 근거, 선택형 문항은 설계안 §13 "규칙으로 평가 가능한 선택형"의 자체 결정. 학습 효과 주장 없음.

## 6. 검증 (결과는 handoff 224차)
- 정적: `scripts/testPilotUnit.mjs`(공통 구조·Unit 계약·기록·화면 핀), `testCommGoals`, `testWritingPractice`, `testKeySentenceFlow`, 경로·청크·번들·QA 게이트·레지스트리.
- 브라우저(1개씩): `unit.spec.mjs`(개요·어휘·듣기·읽기·문형·복습 답 숨김·도움 정도·재진입·말하기/쓰기 왕복·360/390/412/1280) + 영향 받는 `studentHome`(홈 진입 추가)·`speaking`·`speakingExam`·`writing`.
- 미검증: 실기기 TTS 차례 재생 품질, 아이의 활동 이해(설계안 §14 시범 관찰 항목), 교사 확인 시간.

## 7. 교육 설계 담당 메모·출처 (append)
### 7.1 교육 설계 담당(읽기 전용) 검토 결과 — 리드 반영
- **근거 구분**: 공식 목표 참고는 England English PoS 하나(방향만, 이 세션은 Languages KS2만 원문 확인). 연구 근거는 Sweller 2019·Karpicke & Roediger 2008·Cepeda 2008·Fricke 2013(문항 수·지문 길이·복습 간격을 입증한 연구는 없음, Karpicke 2008만 초록 확인). 그 외 Unit 구성·대화·지문·문항·오답 보기·복습 상황은 전부 **자체 설계 결정, 교사 검수 전**.
- **초급 수준에서 어려운 부분(그대로 두고 기록)**: 문형 문항 1(a pencil / pencil / a pencils — 관사·복수를 함께 물음, 가장 어려움, 필요하면 삭제 가능), 관찰 2는 "바뀌는 건 물건 말뿐"만 알려 주고 a/your 차이는 다루지 않음, 오답 보기(Can I borrowing… / I can borrow…?)는 틀린 문장을 읽게 하므로 설명 끝에 올바른 문장을 다시 적음, 읽기 지문의 There is … in it / hasn't got은 순수 초급보다 약간 높음(문장은 전부 ≤9단어, 43단어).
- **읽기 지문에 있지만 어휘 목록에 없는 말**: opens, his, there is, in it, he, has, lots of, asks, says, thank you, now, can, draw(기능어·기본 동사라 어휘 목록에 넣지 않음). rubber는 지문에 없고 듣기 대화에 있음.
- **복습의 ruler·ball**: 새 단어라 [💡 단어 도움] 칩(누를 때만 영어 한 단어)으로 제공 — 지원 단계 "단서로"에 해당. 상황 문장에는 영어 없음.
- **말하기 갭**: 물건 바꿔 말하기는 기존 s02-04(지우개)로 충분(새 문항 없음). 혼자 요청하기(회상·전이)는 둘 다 연필이라 "물건이 바뀌는" 첫 경험은 복습 활동에서만. 설계안 §5의 "정형 대사 뒤 되묻기·선택·확인 과제"는 이 Unit에 없음(다음 Unit 과제).
- **정답 2개 문항**: 문형 3번(Could I…? / Can I…?)은 둘 다 맞음 — 선택형이 `correct: [0,1]`을 지원하도록 구현.
