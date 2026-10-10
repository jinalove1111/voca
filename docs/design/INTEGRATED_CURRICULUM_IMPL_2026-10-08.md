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

## 8. 225차 (2026-10-08) — 첫 Unit 독립 검수 결과·수정, 두 번째 Unit "잃어버린 물건 위치 묻기", Unit 간 격리 (append)

### 8.1 첫 Unit 독립 검수(읽기 전용 QA 에이전트, 코드·데이터 기준) → 리드 판정·수정
| # | 발견 | 판정 | 처리(커밋 1a397226) |
|---|---|---|---|
| 1 | 선택형 완료 판정이 **클릭 횟수**(보기를 바꿔 누르면 다른 문항 없이 끝남) | 제품 결함(중) | `Choice`/`TrueFalse`가 **첫 응답만** `onAnswered` 호출. e2e에 "한 문항 두 번 눌러도 끝나지 않음" 추가 |
| 2 | 말하기·쓰기는 기존 화면으로 나가기만 해 `completed`가 영원히 꺼짐 → `unit-all-done` 도달 불가 | 제품 결함(중) | App이 `returnedFrom`(speaking/writing)을 넘기고 UnitView 마운트 시 그 활동을 `completed`(참여 기록)만 켠다. 점수·숙달 아님 |
| 3 | 듣기 `playAll` onEnd 체인이 `stopSpeaking()` 뒤에도 다음 턴을 이어 말함(추정) | 제품 결함(중, 브라우저 미재현) | `alive` ref를 언마운트 시 false로 → 체인 중단. 실기기 재현은 미검증 |
| 4 | 자기 확인 미응답 상태가 "아직 어려워요"로 강조됨(`aria-pressed={!selfChecked}`) | 결함(하) | 세션 로컬 `selfPicked`로 미응답 구분(둘 다 강조 없음). 저장 스키마 변경 없음(불리언 유지) |
| 5 | `pilotUnit` 단일 하드코딩·`key` 없음·로드 전 빈 화면 | 결함(하) | `units.js` 목록 + 선택 화면 + `UnitView key={unit.id}`(04cc3f0f). 청크 로드 실패 시 빈 화면은 남음(아래 미해결) |
| 6 | 쓰기 "다음 문장 →"이 같은 주제 다른 문항으로 이동 | 개선(하) | **보류** — WritingPractice 공용 동선이라 Unit 전용 분기를 넣지 않음. 교사 가이드에 "← 목록으로 돌아오기" 안내 |
| 7 | 듣기 1번이 단원 상황문("연필 대신 숟가락")으로 오디오 없이 풀림, 2번은 어휘 소거로 풀림 | 콘텐츠 결함(중) | 1번을 "미아는 연필이 얼마나 있다고 했나요?"(I've got lots.)로 교체 — 들어야만 알 수 있는 내용. 2번은 유지(소거 가능성 기록) |
| 8 | 복습 `ruler`·`ball`이 어휘에 없어 💡 도움이 사실상 필수 | 콘텐츠(중) | 어휘에 `ruler`·`ball` 추가(9개). 읽기 `hasn't got`·`Here you go`·`Could I` 첫 등장 등 약 20개 비목록 표현은 **그대로 두고 기록**(교사 가이드 ⑥) |
| 9 | 문형 2번 오답 `I can borrow a pencil?`은 올림 억양 평서 의문으로 방어 가능 | 참고 | `Can borrow I a pencil?`(명백한 어순 오류)로 교체 |
| 10 | 복습 대체어 비대칭(`a ruler`·`Can I use your ball?` 없음) | 참고 | 대체어 보강 |
| 11 | "끝냈어요"는 오답만 눌러도 켜져 숙달처럼 읽힘 | 참고 | "해 봤어요"로 표기 통일(참여 기록) |
- 통과 확인(검수 결과): 읽기 근거 3개 본문 그대로, 복습 공개 전 모범·듣기·대체어 언마운트, 교사 확인·점수 UI 경로 없음, 기록 UUID 키·Unit별 분리, 이탈 시 `stopSpeaking`.
- **미해결로 기록**: 청크 로드 실패 시 빈 화면(뒤로 수단 없음 — QA 전용·mock 환경에선 재현 안 됨, 다음 차수), 듣기 2번 소거 가능성, 비목록 표현 부담.

### 8.2 두 번째 Unit — 회화 C1 · 정보 묻기(asking-info) · "잃어버린 물건 위치 묻기" (`src/utils/curriculum/unitLostBag.js`, 커밋 0e534738)
- 핵심: "Where's my bag?" / "It's under the chair." 자체 Paul·Mia 이야기(미술 시간 뒤 폴이 가방·필통을 찾고 미아가 단서를 줌). 기존 이야기 회차에 이 문장이 없으므로 **말하기는 Unit 안 3단계**(`steps`: `repeat` 따라 하기 → `swap` 물건 바꾸기 → `recall` 모범 없이 묻고 답하기), **쓰기는 inline 문항** `w-u2-under`(주제 '물건·장소 찾기')로 연결. 새 화면은 `UnitSpeaking` 하나(기존 `RecorderControls`·`useLocalRecorder`·`speak` 재사용, 녹음 선택, 답 확인 전 영어·음성 미마운트, 답 확인으로 `completed`만).
- 위치 말: under·in 핵심, on은 선택 확장(바꾸기 칩·어휘·지문에만; 복습 상황은 under·in). 어휘 7(bag, pencil case, chair, desk, under, in, on) · 듣기 5턴 21단어 · 읽기 44단어(문장 ≤9) · 이해 3(근거 본문 그대로) · 문형 관찰 2 + 선택 3(2번은 Where's/Where is 둘 다 정답) · 복습 2(모자 찾기 → Where's my hat? / 책 위치 대답 → It's in the desk.).
- 공통 템플릿 재사용 결과: `validateUnit` 통과, 활동 7종 같은 순서, `UnitScreen`의 어휘·듣기·읽기·문형·복습 화면은 **수정 없이** 그대로 동작(듣기 안내 문구 1곳만 Unit 중립 문장으로). 템플릿이 다른 의사소통 목표에도 재사용 가능함을 확인 — 단, 핵심 문장이 이야기 회차에 없으면 `steps`/inline 경로가 필요하다는 점이 템플릿의 두 번째 경로로 추가됨.
- 진입: QA 홈 [📚 오늘의 학습 (시범)] → **Unit 선택 목록**(`unit-list`, Unit이 1개면 자동 선택) → Unit 화면. Unit 화면의 ← 는 "목록"으로(2개 이상일 때), 목록의 ← 홈.
- 교사 검수 전 콘텐츠. 초급 부담 지점: `Oh no!`, `Look!`, `No, it isn't.`(축약 부정), 읽기의 `looks for`, `is there`, 문형 3번 보기의 틀린 문장 2개 — 교사 가이드에 기록.

### 8.3 Unit 간·계정 간 격리 (검증 방법: `tests/e2e/unit.spec.mjs` e·f, `scripts/testPilotUnit.mjs`)
- 기록은 `paulEasyVoca_unitRecords_<students.id UUID>` 한 키 안에 `{ [unitId]: … }`로 Unit별 분리 → Unit 2 말하기·쓰기·문형을 끝내도 Unit 1은 `data-next=vocab`·말하기/쓰기 미완료 그대로. 다른 UUID 키에 심은 기록은 QA 학생 화면에 나타나지 않음. 새로고침·재로그인 뒤 Unit 2 기록 유지.
- 문항 격리: `UnitView key={unit.id}`로 활동 상태(선택·공개·재생) 리셋, 핵심 문장이 다른 Unit 텍스트에 없음(정적 핀). 음성: 활동/화면 이탈 시 `stopSpeaking` + 듣기 체인 `alive` 가드, 녹음기는 `UnitSpeaking` 언마운트로 정리.
- 비QA 계정: `QA_ONLY_SCREENS`에 `unit` 포함(testQaGate 17 PASS) — 변경 없음.

## 9. 225차 — §5 미확인 인용 7건의 확인 결과 (웹 조회 서브에이전트, 리드 검토; §5는 그대로 두고 여기서 갱신)
| # | 항목 | 확인 | 서지 | 실제 주장(요약) | 연구 대상 | 우리 용도의 한계 | 접근 |
|---|---|---|---|---|---|---|---|
| 1 | Hulme et al. 2012 | **확인** | Hulme, Bowyer-Crane, Carroll, Duff, Snowling. "The Causal Role of Phoneme Awareness and Letter-Sound Knowledge in Learning to Read…" *Psychological Science* 23(6):572–577. DOI 10.1177/0956797611435921 | 20주 음운+읽기 중재의 글자-소리·음소 인식 향상이 5개월 뒤 단어 읽기·철자 향상을 완전 매개 → 둘이 초기 단어 문해의 인과 요인이라 추론 | 영국 5세 152명, **언어 능력 하위** 선별, L1 | 단어 **해독** 교수에만 해당. L2/EFL·한국·어휘 의미·회화·말하기·앱/문항 형식 증거 아님 | 전문(Bangor OA PDF) |
| 2 | Fricke et al. 2013 | **확인** | Fricke, Bowyer-Crane, Haley, Hulme, Snowling. "Efficacy of language intervention in the early years." *JCPP* 54(3):280–290. DOI 10.1111/jcpp.12010 | RCT: 30주 구어 프로그램(어휘·서사·듣기, 후반 음운/글자-소리)이 구어·서사와 6개월 뒤 독해를 향상; 단어 수준 문해 효과는 약함 | 영국 4세 180명, 구어 약한 아동 선별, L1, 성인 소그룹 진행 | L1·성인 주도 구어 교수 근거. L2/자기주도 앱/회상 형식·보기 수 증거 아님. 해독 근거로 인용하면 약함 | 전문(White Rose OA) |
| 3 | Sweller, van Merriënboer & Paas 2019 | **확인** | "Cognitive Architecture and Instructional Design: 20 Years Later." *Educ Psychol Rev* 31:261–292. DOI 10.1007/s10648-019-09465-5 | 인지부하 이론 20년 이론 리뷰(내재/외재 부하, 예시 학습, 요소 상호작용, 전문성 역전 등) | 비실증·종합(주로 성인·중등·고등 복잡 과제) | 일반 설계 원칙만. 어린 EFL·어휘 앱·모범 숨긴 회상·3지선다 직접 증거 아님. 1998년 동명 논문과 혼동 주의 | 초록(Springer 유료) |
| 4 | Cepeda et al. 2008 | **확인** | Cepeda, Vul, Rohrer, Wixted, Pashler. "Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention." *Psychological Science* 19(11):1095–1102. DOI 10.1111/j.1467-9280.2008.02209.x | 32개 상식 사실, 간격×보유기간 26조건: 최적 간격은 보유기간이 길수록 커지되 비율은 줄어듦(1주 20–40%, 1년 5–10%); 적절한 간격이 망각을 약 절반으로 | 성인 1,354명(평균 34세) 인터넷 패널, 타이핑 단서 회상 | 날·주 단위 간격 복습 지지. 아동·L2 어휘·말하기·3지선다/모범 숨김 형식 증거 아님 | 전문(저자 PDF) |
| 5 | Graham et al. 2012 | **확인(식별)** | Graham, McKeown, Kiuhara, Harris. "A Meta-Analysis of Writing Instruction for Students in the Elementary Grades." *J Educ Psychol* 104(4):879–896. DOI 10.1037/a0029185 | 115편 메타분석(1–6학년): 전략 교수 1.02, SRSD 1.17, 동료 보조 0.89, 산출 목표 0.76 … 문법 교수는 유의하지 않음 | 초등(대부분 미국·L1) **작문** 교수 | L1 작문 범위. 문장 쓰기/받아쓰기/철자/EFL 앱 마이크로 쓰기 증거 아님. "문법 교수 무효"를 L2에 일반화 금지. 동명 다른 2012 논문 있음 → DOI로 인용 | 초록(APA 유료) |
| 6 | England National Curriculum — English PoS | **확인** | GOV.UK DfE, 2013-09-11 발행·2014-07-16 갱신. https://www.gov.uk/government/publications/national-curriculum-in-england-english-programmes-of-study | KS1–KS4 영어(구어·읽기(파닉스 포함)·쓰기) 법정 프로그램 | 잉글랜드 지방정부 관리 학교 5–16세, **L1** | **OGL v3.0** — 출처 표기로 재사용·각색 가능. EAL/EFL 언급 없음. 학년 기대치는 L1 아동용 → 우리 학습자가 "충족하는 기준"으로 제시 금지 | 공식 페이지 전문 |
| 7 | Bell Foundation EAL Assessment Framework | **부분**(2016 시범판 PDF만; 공식 페이지·2018 PDF 403) | Primary/Secondary, Band A–E, 4영역. 공식 https://www.bell-foundation.org.uk/eal-programme/teaching-resources/eal-assessment-framework/ (403), 미러 languagesciences.cam.ac.uk(Issue 1, 2016-12) | 잉글랜드 학교의 EAL 학생 영어 숙달도 보고·추적용 밴드 서술자 | 잉글랜드 영어 매체 학교 EAL 학습자, 교사 판단용 | 2016판 약관: **비상업 인쇄/다운로드만**(출처 표기), **수정·각색·번역·제3자 공유 금지**, 상업 복제는 서면 동의 → 우리 앱에 밴드 서술자 재사용·의역 **불가**. 개념 인용+링크만 | 2016판 전문(미러); 현행 약관 미확인 |
- **공통 한계**: 1–5 어느 것도 한국(또는 어떤) EFL 아동, 모범 숨긴 회상 설계, 3지선다, Unit 안 말하기를 연구하지 않았다. **원칙 수준 지지**(명시적 파닉스=해독, 구조화된 구어 어휘 교수, 인지부하 관리, 간격 복습, 전략 기반 작문)일 뿐 우리 문항 형식·대상의 근거가 아니다. 학습 효과 주장 금지 유지.
- **운영자 확인 항목**: Bell 약관은 2016 시범판 문구만 봤으므로, 서술자 문구를 어디에든 쓰기 전에 운영자가 브라우저로 현행 PDF 약관을 직접 확인해야 한다.
- 조회 출처: psychologicalscience.org, bangor.ac.uk(PDF), eprints.whiterose.ac.uk/88748, digitalcommons.usf.edu/psy_facpub/1766, evullab.org(PDF), asu.elsevierpure.com, gov.uk, languagesciences.cam.ac.uk. 서지·DOI는 출판사/저장소 기록 기준(날조 없음 확인). `unitBorrow.js`/`unitLostBag.js`의 `sources[]` "미확인" 표기는 데이터 파일을 다시 건드리지 않고 이 표로 갱신한 것으로 본다(다음 차수에 `basis` 문구 정리).
