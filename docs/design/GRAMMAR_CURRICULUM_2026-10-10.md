# Grammar 과정 설계 — 5개 과정(Easy·Intermediate·Advanced·Middle School·High School) (2026-10-10)

_이 문서는 `CURRICULUM_STAGES_2026-10-08.md` §12(Grammar 통합, 231~232차)의 "Grammar 진입 화면" 부분을 대체한다. §12는 이력으로 남는다(삭제 없음). Speaking·Writing 과정 구조는 바뀌지 않는다. 모든 내용은 **교사 검수 전**이며 검수 완료가 아니다. 범위는 PR #62뿐이고 merge·운영 배포는 없다._

## 0. 요약·전제

**운영자 요구(2026-10-10) 요약**
- Grammar 최상위 과정은 5개다: Easy, Intermediate, Advanced(숙련도), Middle School, High School(학교 문법). 학년과 숙련도는 다른 축이다.
- 중·고등 단원에서 필요하면 Easy/Intermediate의 기초 설명으로 이동할 수 있어야 한다.
- 과정을 고르면 단원 목록과 학습 목표가 보인다.
- 단원은 9단계 순서(§2)를 따르고, 한 화면에 개념을 과다하게 넣지 않는다.
- Easy는 친숙한 단어와 짧은 문장을 쓴다. 학생이 배우지 않은 어휘로 평가를 왜곡하지 않는다.
- 영작 예시는 유일한 정답이 아니다. 용어 암기 단원은 만들지 않는다.
- 기존 문법 화면·문항·데이터를 재사용한다. 같은 문법이 여러 과정에 있으면 개념은 공유하고 깊이·난이도로 차별한다.
- 기존 문항의 배정 근거를 기록하고, 부적절한 것만 고친다.
- 준비 안 된 단원은 '준비 중'으로 표시한다. 중·고 학년이나 교육과정과 일치한다고 단정하지 않는다.
- 연구 근거는 동료심사 논문·메타분석으로 하고, 연구 결과와 제품 판단을 구분한다.

**가정(모두 운영자·교사 확인 전)**
1. 학원 레벨 이름과 앱의 Easy/Intermediate/Advanced 대응은 확인되지 않았다(`CURRICULUM_STAGES` §11 참고). 이 문서의 과정 이름은 제안이다.
2. 중·고등 과정이 실제 학년·교육과정과 맞는지 확인되지 않았다. 화면에 "학교 문법 — 학년·교육과정 대응 미확인"을 표시한다.
3. 단원 수와 순서는 콘텐츠 설계자의 초안이다. 학원 문법 교재 순서와 대조하지 않았다.
4. 점수, 자동 판정, 새 DB 테이블·컬럼, 영구 저장이 없다. QA 계정 전용이며 학생에게 공개하는 결정은 운영자가 한다.
5. 교사 검수를 거치지 않은 모든 예문·문항·설명은 "검수 대기"이며 검수 완료로 표기하지 않는다.

**수치 정정 메모**: 리드 지시는 "준비 중 32개"였으나 초안 목록을 세면 준비 중 31개(Easy 6, Intermediate 7, Advanced 6, Middle 6, High 6)이고 ready 3개를 더해 총 34단원이다. 이 문서는 센 값(31)을 쓴다. 리드가 32로 확정했다면 누락된 1개 단원을 알려 달라.

## 1. 과정 5개

| id | 영문 | 한국어 | 종류 | 설명 | 표기 규칙 |
|---|---|---|---|---|---|
| `easy` | Easy | 쉬운 문법 | 숙련도 | 친숙한 단어·짧은 문장으로 가장 기본 문형을 익힌다. 단원 8개 | '(제안)' |
| `intermediate` | Intermediate | 중간 문법 | 숙련도 | Easy 문형을 질문·대답·시제로 넓힌다. 단원 8개 | '(제안)' |
| `advanced` | Advanced | 심화 문법 | 숙련도 | 이유·조건·비교·경험처럼 문장을 이어 말한다. 단원 6개 | '(제안)' |
| `middleSchool` | Middle School | 중학교 문법 | 학교 | 학교 문법 주제를 다룬다. 단원마다 먼저 볼 기초 단원(`basicsUnitId`)을 연결한다. 단원 6개 | '(제안)' + "학교 문법 — 학년·교육과정 대응 미확인" |
| `highSchool` | High School | 고등학교 문법 | 학교 | 중학교 주제를 더 깊이·긴 문장으로 다룬다. 단원 6개 | '(제안)' + "학교 문법 — 학년·교육과정 대응 미확인" |

- 숙련도 과정(Easy~Advanced)은 학년과 무관하다. 초등 학생이 Advanced를, 중학생이 Easy를 풀 수 있다.
- 학교 과정(Middle·High)은 학교 문법 주제 묶음일 뿐, 특정 학년 배정이나 교과서 일치를 뜻하지 않는다.
- 과정 이름의 '(제안)'은 운영자가 학원 이름·기준을 확정하기 전까지 유지한다.

## 2. 단원 구조 9단계 ↔ 데이터 필드 ↔ 화면 섹션

| 단계 | 내용 | 데이터 필드 | 화면 섹션 | testid |
|---|---|---|---|---|
| 1 | 학습 목표 | `goalKo`, `titleKo` | 단원 머리 | `gu-goal` |
| 2 | 친숙한 상황·짧은 예문 + 자연스러운 한국어 | `examples[{en,ko}]` | 예문 카드(영어 듣기 버튼 `speak`) | `gu-examples`, `gu-example-<i>`, `gu-example-<i>-listen` |
| 3 | 쉬운 한국어 설명(전문용어 풀어 쓰기) | `explainKo[]` | 설명 목록 | `gu-explain` |
| 4 | 문장 구조(주어·동사·나머지 색·글자 라벨) | `structure[{s,v,rest,ko}]` | 구조 막대 | `gu-structure`, `gu-structure-<i>` (S/V/+ 칩 sky/emerald/amber) |
| 5 | 긍정·부정·의문 비교(필요한 단원만) | `compare{aff,neg,q}` (없으면 생략) | 비교 표 | `gu-compare` |
| 6 | 흔한 오류(틀린 예문 + 수정 이유) | `errors[{wrong,right,whyKo}]` | 오류 카드 | `gu-errors`, `gu-error-<i>` |
| 7 | 단계별 연습: 선택 → 빈칸 → 순서 배열 → 문장 만들기 | `practice.choice`(`fromUnitId`의 `grammar.items` 재사용), `practice.blank`, `practice.order`, `practice.build` | 연습 영역 4단계 | `gu-practice`, `gu-step-choice`(`gu-choice-<i>-opt-<j>`), `gu-step-blank`(`gu-blank-<i>-opt-<j>`/`-why`/`-retry`), `gu-step-order`(`gu-order-<i>-word-<j>`/`-answer`/`-check`/`-clear`/`-why`/`-retry`), `gu-step-build`(`gu-build-<i>-input`/`-reveal`/`-compare`), `gu-practice-status`('풀이 N/M'), `gu-practice-done` |
| 8 | 직접 사용(짧은 말하기/쓰기) | `use{kind,promptKo,exampleEn,exampleKo}` | 직접 사용 카드 | `gu-use`, `gu-use-listen`, `gu-use-done`, `gu-use-note`; 쓰기형은 `gu-use-input`/`-reveal`/`-compare` |
| 9 | 오답 피드백·다시 풀기 | 각 문항 `whyKo`, 화면 재시도 상태 | 피드백 문구 + [다시 풀기] | `gu-feedback`, 문항별 `-why`/`-retry`, 전체 `gu-reset-all` |

공통 필드: `id`, `courseId`, `order`, `conceptId`, `prereqIds`, `status`(`ready`/`preparing`), `fromUnitId`(기존 Unit 연결), `basicsUnitId`(중·고만), `sources`.

설계 규칙
- 한 화면에는 개념 하나만 둔다. 구조(4)와 비교(5)는 단원 목표에 필요할 때만 쓴다(Easy 1번은 비교 생략).
- 영작 `build` 문항은 `exampleEn`을 유일 정답으로 쓰지 않고 `acceptNoteKo`로 다른 정답을 안내한다. 자동 채점하지 않는다.
- `order` 문항은 가능한 순서가 하나뿐인 단어 묶음만 쓴다.
- 문항의 어휘는 해당 단원의 예문·선수 단원에 나온 말로 제한한다.
- (238차) 위 9섹션은 데이터 구조로 그대로 유지하고, 화면에서는 한 장씩 넘기는 카드 덱으로 나뉘어 보인다. 대응은 §12 참고(이 §2는 다시 쓰지 않았다).

## 3. 과정별 단원 표

문제 유형 약어: 선=선택, 빈=빈칸, 순=순서 배열, 만=문장 만들기, 사=직접 사용. 준비 중 단원은 설명·문항이 없다(`examples`·`explainKo`·`practice`가 빈 배열, `use`가 null).

### 3.1 Easy (숙련도) — ready 2 / 준비 중 6

| 순서 | id | 제목 | 학습 목표 | 선수(prereqIds) | conceptId | 설명 예시 | 문제 유형 | 상태 |
|---|---|---|---|---|---|---|---|---|
| 1 | `g-easy-01` | 부탁하기 Can I …? | 필요한 물건을 빌려 달라고 말할 수 있어요 | — | `request-can-i` | Can I borrow a pencil? / 연필 빌려도 돼? | 선 6(`c1-borrow-classroom`)·빈 2·순 2·만 2·사 | ready |
| 2 | `g-easy-02` | 어디 있어? Where's | 물건이 어디 있는지 묻고 답할 수 있어요 | — | `where-is-location` | Where's my bag? / 내 가방 어디 있어? | 선 6(`c1-lost-bag-classroom`)·빈 2·순 2·만 2·사 | ready |
| 3 | `g-easy-03` | 나는 …이야 am·is·are | 나와 친구가 누구인지 말할 수 있어요 | — | `be-am-is-are` | — | — | 준비 중 |
| 4 | `g-easy-04` | 할 수 있어요 can | 내가 할 수 있는 것과 없는 것을 말할 수 있어요 | `g-easy-01` | `can-ability` | — | — | 준비 중 |
| 5 | `g-easy-05` | …이 있어요 There is | 방에 무엇이 있는지 말할 수 있어요 | `g-easy-02` | `there-is-are` | — | — | 준비 중 |
| 6 | `g-easy-06` | 좋아해요 I like | 내가 좋아하는 것을 말할 수 있어요 | `g-easy-03` | `present-simple-like` | — | — | 준비 중 |
| 7 | `g-easy-07` | …해요? Do you …? | 친구에게 Yes/No로 답하는 질문을 할 수 있어요 | `g-easy-06` | `present-simple-question` | — | — | 준비 중 |
| 8 | `g-easy-08` | 이것·저것 This is | 가까운 것과 먼 것을 가리켜 말할 수 있어요 | `g-easy-03` | `this-that` | — | — | 준비 중 |

_234차 주: 위 표는 233차 시점 기록이다. 03~08의 현재 상태(콘텐츠 구현 완료·교사 검수 전)는 §10에 있다._

### 3.2 Intermediate (숙련도) — ready 1 / 준비 중 7

| 순서 | id | 제목 | 학습 목표 | 선수 | conceptId | 설명 예시 | 문제 유형 | 상태 |
|---|---|---|---|---|---|---|---|---|
| 1 | `g-int-01` | Is it …? 대답·되묻기 | 있는지 확인하고 짧게 답한 뒤 되물을 수 있어요 | `g-easy-02` | `yes-no-question-short-answer` | Is it in the box? / 상자 안에 있어? | 선 6(`c2-find-together-classroom`)·빈 2·순 2·만 2·사 (비교 있음) | ready |
| 2 | `g-int-02` | 엄마는 …해요 | 가족이나 친구가 하는 일을 말할 수 있어요 | `g-easy-06` | `third-person-s` | — | — | 준비 중 |
| 3 | `g-int-03` | 무엇을 좋아해? | What으로 묻고 What about you?로 되물을 수 있어요 | `g-easy-07`, `g-int-01` | `wh-question-what` | — | — | 준비 중 |
| 4 | `g-int-04` | Can you …? 묻기 | 할 수 있는지 묻고 짧게 답할 수 있어요 | `g-easy-04`, `g-int-01` | `can-question-short-answer` | — | — | 준비 중 |
| 5 | `g-int-05` | 지금 …하고 있어요 | 지금 하는 일을 말할 수 있어요 | `g-easy-06` | `present-continuous` | — | — | 준비 중 |
| 6 | `g-int-06` | 위치 말 늘리기 | next to·behind로 위치를 더 자세히 말할 수 있어요 | `g-easy-02` | `prepositions-place-more` | — | — | 준비 중 |
| 7 | `g-int-07` | 어제 있었던 일 | 어제 있었던 일을 짧게 말할 수 있어요 | `g-easy-06` | `past-simple` | — | — | 준비 중 |
| 8 | `g-int-08` | Would you like …? | 무엇을 원하는지 묻고 권할 수 있어요 | `g-easy-07` | `would-you-like-some` | — | — | 준비 중 |

_237차 주: 위 표의 상태는 233차 시점 기록이다. 상태는 §11 기준._

### 3.3 Advanced (숙련도) — 전부 준비 중 (6)

| 순서 | id | 제목 | 학습 목표 | 선수 | conceptId | 설명 예시 | 문제 유형 | 상태 |
|---|---|---|---|---|---|---|---|---|
| 1 | `g-adv-01` | 계획 말하기 going to | 앞으로 할 일을 말할 수 있어요 | `g-int-05` | `going-to-plan` | — | — | 준비 중 |
| 2 | `g-adv-02` | 비교하기 | 둘을 비교해서 말할 수 있어요 | `g-int-03` | `comparatives` | — | — | 준비 중 |
| 3 | `g-adv-03` | because·so 잇기 | 이유와 결과를 이어서 말할 수 있어요 | `g-int-07` | `because-so` | — | — | 준비 중 |
| 4 | `g-adv-04` | when·if 잇기 | 때와 조건을 이어서 말할 수 있어요 | `g-adv-03` | `when-if-clause` | — | — | 준비 중 |
| 5 | `g-adv-05` | should·have to | 해야 하는 일과 하면 좋은 일을 말할 수 있어요 | `g-easy-04` | `should-have-to` | — | — | 준비 중 |
| 6 | `g-adv-06` | 해 본 적 있어요 | 해 본 경험을 말할 수 있어요 | `g-int-07` | `present-perfect-experience` | — | — | 준비 중 |

_237차 주: 상태는 §11 기준._

### 3.4 Middle School (학교) — 전부 준비 중 (6) · 학년·교육과정 대응 미확인

| 순서 | id | 제목 | 학습 목표 | 선수 | conceptId | basicsUnitId | 설명 예시 | 문제 유형 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `g-mid-01` | 시제 정리 | 현재·과거·미래를 구분해 쓸 수 있어요 | — | `tense-system` | `g-int-07` | — | — | 준비 중 |
| 2 | `g-mid-02` | 조동사 can·may·must | 허락·의무를 나타내는 말을 쓸 수 있어요 | `g-mid-01` | `modal-verbs` | `g-easy-04` | — | — | 준비 중 |
| 3 | `g-mid-03` | 수동태 기초 | "…당했다"는 문장을 만들 수 있어요 | `g-mid-01` | `passive-voice` | `g-easy-03` | — | — | 준비 중 |
| 4 | `g-mid-04` | 관계대명사 who·which | 두 문장을 하나로 이어 설명할 수 있어요 | `g-mid-01` | `relative-clause` | `g-int-03` | — | — | 준비 중 |
| 5 | `g-mid-05` | 분사로 꾸미기 | -ing·-ed로 명사를 꾸밀 수 있어요 | `g-mid-01` | `participle` | `g-int-05` | — | — | 준비 중 |
| 6 | `g-mid-06` | 조건문 if | 만약의 상황을 말할 수 있어요 | `g-mid-01` | `conditional-if` | `g-easy-06` | — | — | 준비 중 |

_237차 주: 상태는 §11 기준._

### 3.5 High School (학교) — 전부 준비 중 (6) · 학년·교육과정 대응 미확인

| 순서 | id | 제목 | 학습 목표 | 선수 | conceptId | basicsUnitId | 설명 예시 | 문제 유형 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `g-high-01` | 완료 시제 | 과거와 지금을 이어서 말할 수 있어요 | — | `perfect-tense` | `g-int-07` | — | — | 준비 중 |
| 2 | `g-high-02` | 수동태 심화 | 시제·조동사가 있는 수동태를 쓸 수 있어요 | `g-high-01` | `passive-voice` | `g-easy-03` | — | — | 준비 중 |
| 3 | `g-high-03` | 관계사 심화 | 긴 문장 속 관계사를 해석하고 쓸 수 있어요 | `g-high-01` | `relative-clause` | `g-int-03` | — | — | 준비 중 |
| 4 | `g-high-04` | 가정법 | 사실과 다른 상황을 말할 수 있어요 | `g-high-01` | `subjunctive-conditional` | `g-easy-06` | — | — | 준비 중 |
| 5 | `g-high-05` | 간접화법 | 남이 한 말을 전달해 말할 수 있어요 | `g-high-01` | `reported-speech` | `g-int-07` | — | — | 준비 중 |
| 6 | `g-high-06` | 분사구문 | 분사로 문장을 짧게 이어 쓸 수 있어요 | `g-high-01` | `participle` | `g-int-05` | — | — | 준비 중 |

_237차 주: 상태는 §11 기준._

참고
- 준비 중 단원의 `basicsUnitId`가 가리키는 기초 단원 중 일부(`g-int-07`, `g-int-03`, `g-int-05`, `g-easy-03`, `g-easy-04`, `g-easy-06`)도 아직 준비 중이다. 기초 이동 링크는 대상이 준비 중이면 '준비 중'으로 보여야 한다.
- 선수 문법과 `basicsUnitId`는 설계자 초안이며 교사 검수 전이다. 문법 난이도 순서를 학원 교재와 대조하지 않았다.
- 중·고 제목의 문법 주제(수동태, 관계사, 분사, 가정법 등)는 일반적인 학교 문법 범주명일 뿐 특정 학년 교육과정 일치를 단정하지 않는다.

## 4. 기존 문항 배정 근거

기존 파일럿 Unit의 `grammar.items`(각 6개, 232차 기준)를 `fromUnitId`로 연결해 "선택" 연습에 그대로 쓴다. 문항을 새로 만들거나 옮기지 않았다.

| 기존 Unit | 연결 단원 | 수준 | 배정 근거 |
|---|---|---|---|
| `c1-borrow-classroom` (빌리기) | `g-easy-01` (Easy) | 기초 | 문항 6개 모두 한 문장 틀(Can I borrow ___?) 안의 빈칸·어순이다. 기초(`grammarKo`)와 일치한다. |
| `c1-lost-bag-classroom` (위치 묻기) | `g-easy-02` (Easy) | 기초 | 질문·대답이 나오지만 문항은 각각 한 문장 틀 안에서 고른다. 짝짓기 문항이 없다. |
| `c2-find-together-classroom` (함께 찾기) | `g-int-01` (Intermediate) | 발전 | 질문에 맞는 대답·되묻기를 짝지어 고르는 문항이라 발전(`grammarKo`)과 일치한다. |

- 어휘 의존: Easy 두 단원은 자기 Unit 어휘만 쓴다. Intermediate는 Easy-02 어휘에 shelf·box가 더해진다. 그래서 `g-int-01`의 선수가 `g-easy-02`다.
- 경계 사례: 빌리기 3번(Could I도 가능한 다답)과 위치 묻기 2번(Where's / Where is 다답)은 한 문장 안 선택이라 기초로 유지한다.
- **부적절 배정 없음, 변경 0.**

## 5. 개념 공유·차별화 규칙

같은 `conceptId`가 여러 단원·과정에 나올 수 있다. 개념 설명 본문은 공유하고, 깊이와 문항 난이도로 구분한다.

| conceptId | Middle School | High School | 기초 설명 이동(basicsUnitId) |
|---|---|---|---|
| `passive-voice` | `g-mid-03` 수동태 기초: 현재·과거의 단순한 "…당했다" 문장 | `g-high-02` 수동태 심화: 시제·조동사가 들어간 수동태 | 둘 다 `g-easy-03`(be 동사) |
| `relative-clause` | `g-mid-04` who·which로 두 문장을 하나로 잇기 | `g-high-03` 긴 문장 속 관계사 해석·쓰기 | 둘 다 `g-int-03`(what 질문·되묻기) |
| `participle` | `g-mid-05` -ing·-ed로 명사 꾸미기 | `g-high-06` 분사구문으로 문장 잇기 | 둘 다 `g-int-05`(현재 진행) |

규칙
1. 같은 conceptId의 핵심 설명 문장(`explainKo`)은 과정 간에 복사하지 않고 한 곳에서 관리한다. 더 깊은 과정은 설명을 더하되 앞 과정 설명을 대체하지 않는다.
2. 깊이 차별: 기초 과정은 한 문형·짧은 문장, 심화 과정은 시제·조동사 결합·긴 문장을 다룬다.
3. 난이도 차별: 같은 유형(선택→빈칸→순서→만들기)이라도 문장 길이, 오답 보기의 헷갈림 정도, 어휘 수준을 올린다.
4. 학교 과정 단원의 [기초 설명 보기]는 `basicsUnitId`의 Easy/Intermediate 단원으로 이동한다. 대상이 준비 중이면 '준비 중'을 표시한다.
5. 중·고에서 같은 conceptId라는 사실이 두 과정이 특정 학년에 대응한다는 뜻은 아니다.
6. 숙련도 과정 안에서는 conceptId가 중복되지 않는다. 현재 중복은 Middle/High뿐이다(`tense-system` 등 나머지는 단일).

## 6. 연구 근거

검증 방법: 각 DOI를 Crossref API(`api.crossref.org/works/<doi>`)로 조회해 제목·저자·연도·학술지·권호·쪽수·초록을 확인했다. Ellis 2006은 Crossref에 초록이 없어 OpenAlex 초록을 썼다(JSTOR 페이지는 열리지 않았다).

"연구 결과"는 초록에 적힌 내용이고, "제품 설계 판단"은 이 앱의 판단이다. 두 열은 섞지 않는다.

| # | 질문 | 제목 | 저자 | 연도 | 학술지·출판 | DOI | 검증 | 연구 결과(초록 기준) | 제품 설계 판단(연구 주장 아님) | 한계 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | a | Effectiveness of L2 Instruction: A Research Synthesis and Quantitative Meta-analysis | Norris & Ortega | 2000 | Language Learning 50(3), 417-528 | 10.1111/0023-8333.00136 | VERIFIED (Crossref) | 49개 연구(1980-1998)에서 초점 있는 L2 교수는 큰 효과가 있었다. 명시적 유형이 암시적 유형보다 낫고, Focus on Form과 Focus on Forms의 효과는 비슷하게 컸으며, 효과는 지속됐다. | 짧은 명시적 규칙 설명은 정당화된다. 암시적 방식만 고집할 필요가 없다. | 저자들이 구인 조작화가 부실해 일반화가 제한된다고 밝혔다. 결과 측정이 명시적 교수에 유리한 경우가 많고 성인 학습자가 대부분이다. |
| 2 | a | Interactions Between Type of Instruction and Type of Language Feature: A Meta-Analysis | Spada & Tomita | 2010 | Language Learning 60(2), 263-308 | 10.1111/j.1467-9922.2010.00562.x | VERIFIED (Crossref) | 영어 문법 41개 연구에서 명시적 교수가 단순·복잡 문법 모두에서 암시적 교수보다 낫고, 통제된 지식과 자발적 사용 모두에 도움이 됐다. | 어려운 문법에도 명시적 설명을 기본값으로 삼는 것이 합리적이다. | 영어만 다룬다. 성인·상급 학습자 중심이다. 명시/암시 구분이 거칠다. |
| 3 | a | Implicit and explicit instruction in L2 learning | Goo, Granena, Yilmaz & Novella | 2015 | *Implicit and Explicit Learning of Languages* (Studies in Bilingualism 48, Benjamins), 443-482 | 10.1075/sibil.48.18goo | VERIFIED (Crossref) | 34개 연구(Norris & Ortega의 11개 + 새 23개)에서 명시적 교수가 전반적으로 더 효과적이었다. | 1·2행과 같은 기본값을 뒷받침한다. | 대상 집단 한계는 같다. 초록은 조절 변수를 언급하지만 결과는 주지 않는다. 책 장이라 권호가 없다. |
| 4 | b | The Effectiveness of Corrective Feedback in SLA: A Meta-Analysis | Li | 2010 | Language Learning 60(2), 309-365 | 10.1111/j.1467-9922.2010.00561.x | VERIFIED (Crossref) | 33개 연구에서 교정 피드백은 중간 크기의 지속 효과를 보였다. 암시적 피드백의 효과가 명시적보다 더 오래 유지됐다. 실험실 연구가 교실 연구보다 효과가 컸고, 짧은 처치와 외국어 환경에서 효과가 컸다. | 오답 뒤 피드백은 원칙적으로 지지된다. 피드백은 짧게 한다. | 대부분 구두 피드백·성인이다. 실험실 효과가 교실보다 부풀려 있다. 다시 풀기 반복은 검증하지 않았다. |
| 5 | b | Oral Feedback in Classroom SLA: A Meta-Analysis | Lyster & Saito | 2010 | Studies in Second Language Acquisition 32(2), 265-302 | 10.1017/S0272263109990520 | VERIFIED (Crossref) | 교실 연구 15개(N=827)에서 교정 피드백은 유의하고 지속적인 효과를 보였다. 유도(prompt)가 재구성(recast)보다 낫고, 자유 산출 측정에서 효과가 가장 컸으며, 어린 학습자가 더 큰 이득을 봤다. | 정답만 보여 주기보다 학생이 스스로 고치게 하는 다시 풀기 단계가 더 맞다. | 앱이 아니라 교사의 구두 피드백이다. 연구가 15개뿐이다. 나이 효과는 적은 연구에 대한 단순 회귀다. |
| 6 | b | The Efficacy of Written Corrective Feedback in Improving L2 Written Accuracy: A Meta-Analysis | Kang & Han | 2015 | Modern Language Journal 99(1), 1-18 | 10.1111/modl.12189 | VERIFIED (Crossref) | 21개 연구에서 서면 교정 피드백이 L2 글쓰기의 문법 정확도를 높였다. 효과는 숙련도·환경·장르에 따라 달랐다. | 입력한 문장에 대한 서면 교정은 그럴듯하며 효과는 학습자 수준에 따라 다르다. | 자유 글쓰기 연구이며 선택·빈칸 같은 닫힌 문항이 아니다. 아동·한국 EFL 대상이 아니다. |
| 7 | c | Current Issues in the Teaching of Grammar: An SLA Perspective | Ellis | 2006 | TESOL Quarterly 40(1), 83-107 | 10.2307/40264512 | VERIFIED (Crossref: 제목·권호, OpenAlex: 초록). JSTOR 페이지는 열리지 않음 | 문법을 가르칠지, 무엇을·언제·어떻게 가르칠지 8개 질문을 다룬 서술형 검토다. 저자는 SLA가 확정적 답을 주지 않는다고 하며 자신의 신념으로 끝맺는다. | 의사소통 교육과정 안에서 문법을 가르치는 이유를 설명하는 근거로 쓴다. 효과 크기의 증거가 아니다. | 실증 연구가 아닌 입장 논문이다. Crossref에는 시작 쪽(83)만 있다. **끝 쪽 107은 인용 전 출판사 페이지에서 확인해야 한다.** |
| 8 | d (추가) | Comprehension-Based Versus Production-Based Grammar Instruction: A Meta-Analysis of Comparative Studies | Shintani, Li & Ellis | 2013 | Language Learning 63(2), 296-329 | 10.1111/lang.12001 | VERIFIED (Crossref) | 35개 프로젝트에서 두 방식 모두 큰 효과였다. 수용 지식은 1주 안에는 이해 중심이 앞섰지만 격차가 줄었다. 산출 지식은 단기에는 비슷했고 지연 평가에서는 산출 중심이 더 나았다. 초기 이해 중심 우위는 대부분 Processing Instruction 때문이었다. | 인식 과제는 초기에 도움이 될 수 있다. 빈칸·순서·문장 만들기 같은 산출 과제는 오래가는 산출 이득을 위해 넣을 만하다. | 이해 중심 대 산출 중심 비교이며 인식→산출 단계 사다리를 검증한 것이 아니다. 대부분 성인 연구다. |
| 9 | d (추가) | The Effectiveness of Processing Instruction and Production-based Instruction on L2 Grammar Acquisition: A Meta-Analysis | Shintani | 2014 | Applied Linguistics 36(3), 306-325 | 10.1093/applin/amu067 | **NOT VERIFIED** (서지 기록만 Crossref에서 확인, 초록 없음) | 기재하지 않음. 초록을 읽지 못했으므로 어떤 결과도 보고하지 않는다. | 없음. 검증된 결과가 없다. | **초록을 읽기 전에는 이 논문의 결과를 인용하지 않는다.** |
| 10 | d, e (추가, 단일 연구) | Does it matter when you review? | Rogers & Cheung | 2020 | Studies in Second Language Acquisition 43(5), 1138-1156 | 10.1017/s0272263120000236 | VERIFIED (Crossref) | 홍콩 초등 EFL 학생 66명의 어휘 학습에서 짧은 간격 복습과 긴 간격 복습은 차이가 없었다. 저자들은 성인 실험실 결과가 아동 교실에 일반화되지 않을 수 있다고 말한다. | 성인 실험실 연구를 근거로 아동용 복습 일정을 과하게 설계하지 말라는 주의로 쓴다. | 메타분석이 아닌 단일 연구다. 문법이 아니라 어휘다. |

**(e) 인지 부하·한 화면 개념 제한**: 근거를 찾지 못했다. Crossref에서 L2 문법 교수의 인지 부하를 다룬 쓸 만한 논문이 나오지 않았다. 이 점에 대해 동료심사 L2 문헌을 권하지 않는다. 인지 부하 이론은 일반 교육심리학이며 여기서 확인하지 않았다.

**연구가 지지하지 않는 것**
1. 이 앱의 정확한 순서(선택 → 빈칸 → 순서 → 만들기)와 "오답 피드백 → 다시 풀기" 반복 구조를 직접 검증한 연구는 없다.
2. 대부분의 연구는 성인·대학생의 실험실이나 소규모 교실 연구이며 한국 EFL 아동을 다루지 않는다. 어린 학습자의 이득이 더 컸다고 보고한 것은 Lyster & Saito뿐이다.
3. 명시적 교수의 효과는 명시적 지식에 유리한 측정 때문에 부풀려졌을 수 있다(Norris & Ortega가 지적). 효과 크기를 예측값으로 쓰지 않고 설계 방향의 근거로만 쓴다.

**설계 판단별 근거와 제품 판단의 범위**

| 설계 판단 | 근거 행 | 연구가 말하는 범위 | 제품 판단인 부분 |
|---|---|---|---|
| 명시적 설명 사용(3·4단계) | 1, 2, 3 | 명시적 교수가 암시적보다 낫다는 메타분석 결과 | 한국어 풀어쓴 설명 문장의 길이·표현, 구조 막대의 색·라벨 형태 |
| 짧은 피드백 + 다시 풀기(9단계) | 4, 5, 6 | 교정 피드백의 지속 효과, 유도가 재구성보다 낫다는 것, 짧은 처치가 더 컸다는 것 | 재시도 횟수·방식, 앱 화면에서의 구현. 앱 형태의 다시 풀기는 검증되지 않았다 |
| 예문 먼저·사용으로 마무리(2·8단계) | 7 | 의사소통 교육과정 안에서 문법을 가르치는 입장 논문(실증 아님) | 예문 → 설명 → 연습 → 직접 사용이라는 순서 자체 |
| 인식 → 산출 순서(7단계) | 8 (9는 인용 금지) | 이해 중심은 초기에, 산출 중심은 지연된 산출 지식에 이점이 있다는 비교 결과 | 선택 → 빈칸 → 순서 → 만들기라는 4단계 사다리와 그 순서. 연구가 검증한 것은 두 방식의 비교뿐이다 |
| 한 화면 개념 제한 | 근거 없음 ((e) 참고) | 해당 없음 | 전적으로 제품 판단이다. 운영자 요구이며 L2 문헌 근거를 주장하지 않는다 |
| 복습 일정을 단순하게 유지 | 10 | 어휘 학습에서 간격 차이 없음(단일 연구) | 문법 복습 일정을 아직 설계하지 않는다는 결정 |

## 7. 검증 계획

결과 칸은 비어 있다. 실행 후 리드가 채운다.

| 항목 | 확인 내용 | 방법 | 결과 |
|---|---|---|---|
| 5개 과정 선택 | 5개 과정 카드가 보이고 종류(숙련도/학교)·'(제안)'·학교 라벨이 표시된다 | 자동 E2E + 수동 | [grammar] 시나리오 a: 5개 과정·숙련도/학교 (제안) 배지·ready/전체 개수 확인. 수동·Preview 실화면 미확인 |
| 단원 목록 | 과정마다 단원 순서·학습 목표·ready/준비 중이 맞다(Easy 8, Intermediate 8, Advanced 6, Middle 6, High 6) | 데이터 단위 테스트 + E2E | 정적 `testGrammarCourses` PASS + [grammar] 시나리오 a(개수)·b(Easy 목록) |
| 단원 진입 | ready 3단원은 열리고 준비 중은 비활성 '준비 중'이다 | E2E | [grammar] 시나리오 b(g-easy-01)·d(g-int-01) 진입, e(중·고 전 단원 준비 중 비활성 + 학교 문법 안내). g-easy-02는 정적 검증만이고 e2e 진입 시나리오 목록에는 없음 |
| 설명 표시 | 9단계 섹션이 순서대로 보이고, 비교는 `g-int-01`만 보이며 Easy는 생략된다 | E2E | [grammar] 시나리오 b(g-easy-01 9섹션 순서, 듣기 1회 재생)·d(g-int-01 비교 섹션) |
| 문제 풀이 | 선택 → 빈칸 → 순서 → 만들기 → 직접 사용이 동작하고 `build`가 유일 정답을 강요하지 않는다 | E2E + 수동 | [grammar] 시나리오 c(풀이 M/M → 연습 다 했어요 → 직접 사용, 만들기는 판정 문구 없이 비교만)·d(되묻기 순서 배열). 1차 실행 테스트 측 실패 1건(정규식이 운영자 규칙 문구 '정답은 아니에요'를 판정어로 오탐) 수정 후 재실행 124/0. 수동 미확인 |
| 오답 피드백 | 오답 시 `whyKo`가 보이고 다시 풀 수 있다 | E2E | [grammar] 시나리오 c(빈칸·순서 오답 → 설명 → 다시 풀기 → 정답, 전체 다시 풀기 → 0/M) |
| 기초 이동 | 중·고 단원에서 `basicsUnitId`로 이동하고 대상이 준비 중이면 '준비 중'이다 | E2E | 화면에 `gu-basics-link`/`gu-basics-back`은 구현됨. 중·고 단원이 전부 준비 중이라 [grammar] 시나리오 e는 비활성 확인까지이며 기초 링크 이동 e2e는 시나리오 목록에 없음(미검증) |
| PC/모바일 | 데스크톱·모바일 폭에서 레이아웃이 깨지지 않는다 | E2E 뷰포트 + 수동 | [grammar] 시나리오 g: 360/390/412/1280, 잘린 요소 검사 포함. 실기기·수동 미확인 |
| 데이터 정합 | `prereqIds`·`basicsUnitId`·`fromUnitId`가 실제 id를 가리키고 순환이 없다 | 데이터 단위 테스트 | 정적 `testGrammarCourses` PASS(`validateGrammarUnit`: id 참조, 빈칸 `___`, 순서 answers가 words 사용) |
| 회귀 | 기존 Unit 문형 활동, Speaking/Writing, 홈 흐름 불변. `npm run build`, 관련 verify | build + verify | 더미 env 빌드 경고 0. 정적 testPilotUnit·testStudentPathContracts·testRegistryCoverage·testWritingPractice·testKeySentenceFlow PASS, testQaGate 17/0, testLazyChunkGuards 95/95, testBundleBudget 32/0. mock e2e [writing] 83/0, [speaking] 608/0, [speaking-exam] 216/0, [unit] 141/0, [student-home] 223/0/1 SKIP(기존 fixture 한계) |

### 구현 상태 (리드 갱신 예정)

| 항목 | 값 |
|---|---|
| 데이터 모듈 `src/utils/grammar/` | `grammarCourses.js`(5 과정), `grammarUnits.js`(34 단원 + `validateGrammarUnit`·`resolveChoice`·`SCHOOL_GRAMMAR_NOTE_KO`) |
| 화면(5개 과정 선택·단원 목록·단원 상세) | `GrammarCourseScreen.jsx`(lazy 청크 약 26.5 KB). 과정 목록 → 단원 목록(학습 목표, 준비 중 비활성) → 단원 9섹션, 준비 중 단원은 안전 화면. 저장 없음. `UnitScreen.jsx`에서 선택기 문법 intent와 `GrammarSetScreen` 제거(`GrammarActivity` 유지) |
| 홈 [📘] 진입 (QA 전용) | 홈 '📘 문법 과정 (Easy ~ High School)' → `App.jsx` onGo 'grammar' → 화면 `grammarCourses`(QA_ONLY_SCREENS 6) |
| build 결과 | 더미 env 빌드 경고 0 |
| 관련 verify / E2E 결과 | 정적 PASS(위 회귀 행), mock e2e [grammar] 신규 스펙 a~g 최종 124/0 (통과 124 / 실패 0, 미mock 요청 0·mock 오류 0). 1차 122/2는 둘 다 테스트 측(정규식 오탐, 앱 동기화 키 `paul_easy_sync_meta`를 새 키로 계수) → 수정 |
| 커밋 SHA | 코드 `577a00a0`, e2e `0689cd92` |
| 단원 현황 | ready 3 / 준비 중 31 (총 34) — 코드 기준 확인(Easy 6, Intermediate 7, Advanced 6, Middle 6, High 6) |
| (234차 추가) 단원 현황 | ready 9 / 준비 중 25 (총 34) — Easy 8/8 ready, Intermediate 1/8, Advanced·Middle·High 0. 교사 검수 완료 0 |
| (234차 추가) 코드 커밋 | 코드 `d2842265` (Easy 03~08 콘텐츠, 데이터 계약 추가). e2e 커밋 `febadb2f`, `[grammar]` 최종 238/0 |
| (234차 추가) 정적·빌드 | 더미 env 빌드 경고 0, GrammarCourseScreen 청크 43.8 KB(gzip 13.7 KB). `testGrammarCourses`·`testPilotUnit`·`testStudentPathContracts`·`testRegistryCoverage` ALL PASS, `testQaGate` 17/0, `testLazyChunkGuards` 95/95, `testBundleBudget` 32/0 |
| (237차 추가) 단원 현황 | ready 34 / 준비 중 0 (총 34) — Easy 8, Intermediate 8, Advanced 6, Middle 6, High 6 모두 ready. 교사 검수 완료 0. 상세는 §11 |
| (237차 추가) 코드 커밋 | e2e 일반화 `8f82a313`, Intermediate+Advanced 13단원 `e1e799da`, 학교 단원 `119e3b89`, 번들 예산 1.7 → 1.8 MB `d5c2f1bd` |
| (237차 추가) 정적·빌드 | 각 단계마다 정적 스위트 ALL PASS. grammar lazy 청크 최종 빌드 120.2 KB raw / 33.5 KB gzip, main gzip 불변. 정적 스위트 전부 PASS |
| (237차 추가) mock e2e | `e1e799da` 기준 `[grammar]` 431/0/1 SKIP(시나리오 k는 ready 학교 단원이 없어 건너뜀), `[hats]` 67/0, `[student-home]` 223/0/1 SKIP, `[writing]` 83/0, `[speaking]` 608/0, `[unit]` 141/0. 학교 단원 추가 후 `[grammar]` 659/0/1 SKIP(상세는 §11.7) |
| (234차 추가) mock e2e | `[grammar]` 시나리오 h·i 추가. 1차 235/3(3건 모두 테스트 측), 최종 238/0(미mock 요청 0·mock 오류 0). `[student-home]` 223/0/1 SKIP(기존 fixture 한계)은 재실행했다. `[unit]`·`[writing]`·`[speaking]`·`[speaking-exam]`은 재실행하지 않았다(변경이 문법 화면·데이터에 한정) |
| (238차 추가) 화면 | 단원 상세 = 한 장씩 덱(`grammarDeck.js` `buildDeck` + `GrammarCourseScreen.jsx` `GrammarUnitDeck`), 단원당 22~26장. 홈 문법 카드를 5카드 그리드로 승격(§12) |
| (238차 추가) 코드 커밋 | 홈 그리드 `c79d5df1`, student-home e2e `9068800c`, 덱 `34712051`, 문법 e2e 재작성 `c769ab8a`, 360x640 보정 `ff82e531`·`c47b1e10` |
| (238차 추가) 단원 현황 | 콘텐츠 구현 34/34 불변, 교사 검수 0. 바뀐 것은 화면 구조뿐 |
| (238차 추가) 검증 | 정적 스위트 전부 PASS, `[student-home]` 241/0/1 SKIP, `[grammar]` 708/0/1 SKIP(덱 첫 빌드 기준). `c47b1e10` 레이아웃 보정은 브라우저 미검증(§12.7) |

## 8. 미완료 콘텐츠 목록

**준비 중 단원 31개 전부**: 설명(`examples`·`explainKo`·`structure`·`errors`), 연습 4종, 직접 사용이 비어 있다.

| 과정 | 준비 중 단원 id |
|---|---|
| Easy (6) | `g-easy-03`, `g-easy-04`, `g-easy-05`, `g-easy-06`, `g-easy-07`, `g-easy-08` |
| Intermediate (7) | `g-int-02`, `g-int-03`, `g-int-04`, `g-int-05`, `g-int-06`, `g-int-07`, `g-int-08` |
| Advanced (6) | `g-adv-01` ~ `g-adv-06` |
| Middle School (6) | `g-mid-01` ~ `g-mid-06` |
| High School (6) | `g-high-01` ~ `g-high-06` |

**수준별 문항 공백**(`PERFORMANCE_LEVELS`의 `grammarKo` 기준, §12.5 이어짐)
- 입문(그림·모양 보고 알맞은 말 고르기): 문항 없음.
- 확장(시제·이유를 이어 알맞은 문장 고르기): 문항 없음.
- 발표(짧은 글에서 틀린 곳 찾아 고치기): 문항 없음.
- 기초 12문항·발전 6문항은 있으나 교사 검수 대기다.

**기타**
- ready 3단원의 `blank`·`order`·`build`·`use`와 `errors`는 이번에 새로 쓴 초안이며 교사 검수 전이다.
- 학교 과정과 실제 학년·교육과정의 대응, 학원 교재 순서와의 대조는 하지 않았다.

## 9. 교사 확인 메모·검수 상태

**검수 상태: 미검수.** 이 문서의 모든 예문·문항·설명·순서는 교사 검수 전이며 검수 완료가 아니다.

교사 확인 요청
1. 순서 배열 문항은 가능한 순서가 하나뿐이라 정답을 하나로 둔다. 여러 정답 인정은 만들기 문항의 `acceptNoteKo`에서 한다. 이 구분이 적절한가?
2. `g-easy-01` 구조의 "I can borrow"는 어순 비교용이다. 능력의 can은 `g-easy-04`에서 따로 다룬다. 이 분리가 학생에게 헷갈리지 않는가?
3. be동사 단원이 `g-easy-03`이라 `g-easy-02`에서 Where's(= Where is)가 먼저 나온다. Where's를 덩어리 표현으로 먼저 가르쳐도 되는가?
4. 빈칸·순서·만들기 문항의 오답 보기가 학생에게 자연스러운 오류인지, `whyKo` 설명이 쉬운지 확인해 달라.
5. 중·고 단원의 주제 묶음과 순서, `basicsUnitId` 연결이 적절한지, 학교 교재와 맞는지 확인해 달라(맞추려면 교재명과 단원 순서가 필요하다).

## 10. (234차) Easy 03~08 콘텐츠 구현

2026-10-10 02:10~02:50. 기준: PR #62 원격 `84f78d37`, 코드 커밋 `d2842265`. 운영자 지시: 5개 과정 틀과 3개 단원은 "커리큘럼 완성"이 아니다. Easy의 준비 중 6단원을 제목·목표만이 아니라 실제로 배울 수 있는 내용(목표, 친숙한 상황, 짧은 예문+한국어, 쉬운 설명, 구조, 오류, 단계별 연습, 직접 사용, 오답 설명)으로 채운다.

**커리큘럼 전체 완료 아님.** 콘텐츠 구현 완료와 교사 검수 완료를 분리해 기록한다.

| 구분 | 단원 수 | 내용 |
|---|---|---|
| 콘텐츠 구현 완료(ready) | 9 | Easy 8(01·02는 233차, 03~08은 이번), Intermediate 1(`g-int-01`) |
| 교사 검수 완료 | 0 | 9단원 전부 `reviewStatus: 'unreviewed'` |
| 미제작(준비 중) | 25 | Intermediate 7, Advanced 6, Middle School 6, High School 6 |

### 10.1 단원별 요약

공통: 예문 4, 설명 3, 구조 2, 비교(긍정·부정·의문) 있음, 오류 2, 연습은 선택 3·빈칸 2·순서 2·만들기 2, 직접 사용은 말하기. 풀이 대상(선택+빈칸+순서)은 단원당 7문항이고 만들기 2와 직접 사용은 채점하지 않는다. 구현 상태 ready, 검수 상태 미검수, 출처 own.

| 순서 | id | 제목 | 목표 | 선수 | 예문 | 오류 | 선택/빈칸/순서/만들기 | 직접 사용 | 구현 | 검수 |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | `g-easy-03` | 나는 …이야 am·is·are | 나와 친구가 누구인지 말할 수 있어요 | — | 4 | 2 | 3/2/2/2 | 말하기: I am … / You are my friend. | ready | 미검수 |
| 4 | `g-easy-04` | 할 수 있어요 can | 내가 할 수 있는 것과 없는 것을 말할 수 있어요 | `g-easy-01` | 4 | 2 | 3/2/2/2 | 말하기: I can … / I can't … | ready | 미검수 |
| 5 | `g-easy-05` | …이 있어요 There is | 방에 무엇이 있는지 말할 수 있어요 | `g-easy-02` | 4 | 2 | 3/2/2/2 | 말하기: 교실에서 보이는 것 세 가지 | ready | 미검수 |
| 6 | `g-easy-06` | 좋아해요 I like | 내가 좋아하는 것을 말할 수 있어요 | `g-easy-03` | 4 | 2 | 3/2/2/2 | 말하기: 좋아하는 것 둘 + 안 좋아하는 것 하나 | ready | 미검수 |
| 7 | `g-easy-07` | …해요? Do you …? | 친구에게 Yes/No로 답하는 질문을 할 수 있어요 | `g-easy-06` | 4 | 2 | 3/2/2/2 | 말하기: Do you …? 질문 세 개 | ready | 미검수 |
| 8 | `g-easy-08` | 이것·저것 This is | 가까운 것과 먼 것을 가리켜 말할 수 있어요 | `g-easy-03` | 4 | 2 | 3/2/2/2 | 말하기: This is … / That is … 세 문장 | ready | 미검수 |

`g-easy-01`·`02`는 시범 Unit 문항 6개를 그대로 쓰므로 선택 6(+빈칸 2·순서 2·만들기 2)이다. 03~08은 단원 자체 선택 문항 3개다. 만들기 문항은 `acceptNoteKo`로 다른 정답을 안내하며 자동 판정하지 않는다.

### 10.2 단원 간 연결(콘텐츠 담당 메모)

- 03: 선수 없음(01·02의 명사만 쓴다). 04 ← 01: 같은 can, 새 뜻(부탁 → 능력). 05 ← 02: under·in·on을 다시 쓴다.
- 06: I like를 I am(03)과 대비한다("I am like"를 오류로 다룸). 07 ← 06: 06에서 배운 동사를 Do you …?로 묻는다. 08: 03의 is와 01의 my·your를 재사용한다.

### 10.3 데이터 계약 추가(코드 `d2842265`)

- `reviewStatus`('unreviewed' | 'reviewed'): 구현 상태(`status`)와 교사 검수를 분리한다. 단원 목록에 '검수 전' 배지(`grammar-unit-<id>-review`), 단원 머리에 `gu-review-status`. 과정 버튼은 'ready n/total · 검수 r'을 보여 주며 `courseCounts.reviewed`는 모든 과정에서 0이다.
- 단원별 `words`(영어·한국어 목록)와 `practiceCounts` 도우미.
- `validateGrammarUnit` 어휘 규칙: 예문, 구조, 비교, 오류의 right, 선택의 정답 보기, 빈칸 문장·정답, 순서 단어, 만들기·직접 사용 예시의 모든 영어 단어는 문법어(FUNCTION_WORDS), 이름(Paul·Mia), 해당 단원 `words`, 선수 단원 `words` 중 하나여야 한다. Easy는 `g-easy-01`·`02`의 words도 쓸 수 있다. 오답 보기(swimming, jumps 같은 틀린 형태)는 의도적으로 틀린 형태라 검사하지 않는다.

### 10.4 연구 근거 매핑

근거 표는 §6을 재사용했다. 새 논문을 추가하지 않았다. 연구 결과와 제품 판단을 구분한다.

| 설계 판단 | 구분 | 근거 |
|---|---|---|
| 짧은 명시적 한국어 설명을 둔다 | 연구 결과에 기댄 설계 방향 | Norris & Ortega 2000, Spada & Tomita 2010, Goo et al. 2015(§6 행 1~3). 명시적 교수가 암시적보다 낫다는 메타분석. 효과 크기를 예측값으로 쓰지 않는다 |
| 오답 시 짧은 설명 + 다시 풀기 | 연구 결과에 기댄 설계 방향 | Li 2010, Lyster & Saito 2010, Kang & Han 2015(행 4~6). 앱 형태의 다시 풀기는 검증되지 않았다 |
| 예문을 먼저 보이고 마지막에 직접 사용 | 제품 판단(입장 논문만 참고) | Ellis 2006(행 7)은 실증 연구가 아니다 |
| 선택 → 빈칸 → 순서 → 만들기 순서 | 제품 판단 | 직접 근거 없음. 행 8은 이해 중심 대 산출 중심 비교일 뿐 4단계 사다리를 검증하지 않았다 |
| 단원당 개념 하나 | 제품 판단 | 근거 없음(§6 (e)). 운영자 요구 |

### 10.5 교사 확인 항목(콘텐츠 담당 메모 4건 + 리드 1건)

1. 03: 비교에 Are you …?, I am not이 나오지만 연습은 긍정 am·is·are만이다. 미리보기로 충분한가?
2. 04: "Mia can jump."에 -s가 없다(3인칭 -s는 `g-int-02`). can't와 cannot을 모두 인정하는 안내가 적절한가?
3. 05: 복수 -s와 two를 가볍게만 다룬다. 부정은 "There isn't"를 골랐다. 적절한가?
4. 06·08: 06이 don't를 07의 Do보다 먼저 가르친다. 08의 isn't·Is this는 비교에만 나온다. 이 순서가 괜찮은가?
5. (리드) 06 예문 "I play ball."이 자연스러운가? 대안은 "I play with a ball."이다.

### 10.6 검증(2026-10-10, 브라우저 1개 순차, vite preview :4193)

| 항목 | 결과 |
|---|---|
| 빌드 | 더미 env 빌드 경고 0. GrammarCourseScreen 청크 43.8 KB(gzip 13.7 KB) |
| 정적 | `testGrammarCourses`·`testPilotUnit`·`testStudentPathContracts`·`testRegistryCoverage` ALL PASS, `testQaGate` 17/0, `testLazyChunkGuards` 95/95, `testBundleBudget` 32/0 |
| mock e2e `[grammar]` | 시나리오 a 과정 문구 / b 검수 배지 / c g-easy-01 흐름 / **h** Easy ready 단원 전부 진입 → 9섹션 순서, 문항 수 = 데이터, 검수 배지, 어휘 규칙 / **i** g-easy-06 전체 연습 흐름. 1차 235/3, 최종 238/0(e2e 커밋 `febadb2f`) |
| 1차 실패 3건 | 모두 테스트 측. 스펙이 틀린 형태 오답 보기(swimming·jumps·swims·has)를 어휘 검사 대상으로 삼았으나 검증기는 이를 의도적으로 허용한다. 스펙을 검증기에 맞춰 수정 |
| 회귀 재실행 | `[student-home]` 223/0/1 SKIP(기존 fixture 한계) |
| 미재실행 | `[unit]`·`[writing]`·`[speaking]`·`[speaking-exam]`은 이번에 재실행하지 않았다. 변경이 문법 화면과 데이터에 한정되어서이며 이 범위는 검증하지 않았다 |
| 미검증 | Preview 실화면, 실기기, 교사 검수. 로드 실패 경로·기초 링크 이동 e2e는 여전히 없다 |

### 10.7 미완료 25단원

| 과정 | 준비 중 id | 비고 |
|---|---|---|
| Intermediate (7) | `g-int-02` ~ `g-int-08` | 다음 제작 순서 1 |
| Advanced (6) | `g-adv-01` ~ `g-adv-06` | 순서 2 |
| Middle School (6) | `g-mid-01` ~ `g-mid-06` | 순서 3 |
| High School (6) | `g-high-01` ~ `g-high-06` | 순서 4 |

운영자 지정 제작 순서: Intermediate → Advanced → Middle → High. 이번 작업 범위가 아니다. 학교 과정과 학년·교육과정 대응, 학원 교재 순서 대조는 여전히 하지 않았다.

**커리큘럼 전체 완료 아님**: 25개 단원이 준비 중이고, 구현된 9개 단원도 교사 검수 전이다.

## 11. (236~237차, 2026-10-10 야간) Intermediate·Advanced·Middle School·High School 콘텐츠 구현

2026-10-10 03:44~ 야간 자율 세션(운영자 취침 중). 기준: `5ae73092` → 체크포인트 push `e1e799da`(04:03). 진행 순서: 상태 확인 → Grammar 콘텐츠(Intermediate 7 → Advanced 6 → Middle 6 → High 6) → 모자 헤더 1.25em → 8단계 승급 설계 문서. 콘텐츠 초안은 읽기 전용 학습 설계 에이전트가 쓰고, 리드가 전달하고, 구현 에이전트가 붙여 넣어 `validateGrammarUnit`(어휘 규칙 포함)으로 검증했다. 저장소 커밋: e2e 일반화 `8f82a313`, Intermediate+Advanced 13단원 `e1e799da`, 학교 단원 `119e3b89`, 번들 예산 1.7 → 1.8 MB `d5c2f1bd`(push 완료 `d5c2f1bd`).

**상태 구분 (이 절의 핵심)**

| 구분 | 단원 수 | 내용 |
|---|---|---|
| 콘텐츠 구현 완료(ready) | 34 / 34 | Easy 8, Intermediate 8, Advanced 6, Middle School 6, High School 6 |
| 교사 검수 완료 | 0 | 34단원 전부 `reviewStatus: 'unreviewed'` |
| 미제작(준비 중) | 0 | — |

**커리큘럼이 구현되었으나 교사 검수 전이다. "커리큘럼 완료"는 선언하지 않는다.** Middle·High는 '학년·교육과정 대응 미확인'을 유지한다(§3.4·§3.5 참고).

공통 구조(신규 25단원): 예문 3~4, 쉬운 설명 3, 구조 2, 비교(필요한 단원만), 오류 2, 연습 선택 3·빈칸 2·순서 2·만들기 2, 직접 사용 1, 구현 상태 ready, 검수 미검수, 출처 own. 풀이 대상(선택+빈칸+순서)은 단원당 7문항이고 만들기와 직접 사용은 채점하지 않는다.

### 11.1 Intermediate 02~08 (7단원, 직접 사용 = 말하기)

| 순서 | id | 제목 | 목표 | 선수 | 문항(선/빈/순/만) | 구현 | 검수 |
|---|---|---|---|---|---|---|---|
| 2 | `g-int-02` | 엄마는 …해요 | 가족이나 친구가 하는 일을 말할 수 있어요 | `g-easy-06` | 3/2/2/2 | ready | 미검수 |
| 3 | `g-int-03` | 무엇을 좋아해? | What으로 묻고 What about you?로 되물을 수 있어요 | `g-easy-07`, `g-int-01` | 3/2/2/2 | ready | 미검수 |
| 4 | `g-int-04` | Can you …? 묻기 | 할 수 있는지 묻고 짧게 답할 수 있어요 | `g-easy-04`, `g-int-01` | 3/2/2/2 | ready | 미검수 |
| 5 | `g-int-05` | 지금 …하고 있어요 | 지금 하는 일을 말할 수 있어요 | `g-easy-06` | 3/2/2/2 | ready | 미검수 |
| 6 | `g-int-06` | 위치 말 늘리기 | next to·behind로 위치를 더 자세히 말할 수 있어요 | `g-easy-02` | 3/2/2/2 | ready | 미검수 |
| 7 | `g-int-07` | 어제 있었던 일 | 어제 있었던 일을 짧게 말할 수 있어요 | `g-easy-06` | 3/2/2/2 | ready | 미검수 |
| 8 | `g-int-08` | Would you like …? | 무엇을 원하는지 묻고 권할 수 있어요 | `g-easy-07` | 3/2/2/2 | ready | 미검수 |

교사 확인(모듈 헤더 기준): int-02 does/doesn't는 비교+선택 1개뿐(easy-06 대비 Does 신규) / int-03 "What do you have in your bag?"가 자연스러운지(8단어, 예문 아님) / int-05 with는 문법어 / int-06 explainKo 3행 재작성 / int-07 Did/didn't는 미리보기, was/were만 불규칙 / int-08 부정 = No, thank you.

### 11.2 Advanced 01~06 (6단원, 직접 사용 = 말하기)

| 순서 | id | 제목 | 목표 | 선수 | 문항(선/빈/순/만) | 구현 | 검수 |
|---|---|---|---|---|---|---|---|
| 1 | `g-adv-01` | 계획 말하기 going to | 앞으로 할 일을 말할 수 있어요 | `g-int-05` | 3/2/2/2 | ready | 미검수 |
| 2 | `g-adv-02` | 비교하기 | 둘을 비교해서 말할 수 있어요 | `g-int-03` | 3/2/2/2 | ready | 미검수 |
| 3 | `g-adv-03` | because·so 잇기 | 이유와 결과를 이어서 말할 수 있어요 | `g-int-07` | 3/2/2/2 | ready | 미검수 |
| 4 | `g-adv-04` | when·if 잇기 | 때와 조건을 이어서 말할 수 있어요 | `g-adv-03` | 3/2/2/2 | ready | 미검수 |
| 5 | `g-adv-05` | should·have to | 해야 하는 일과 하면 좋은 일을 말할 수 있어요 | `g-easy-04` | 3/2/2/2 | ready | 미검수 |
| 6 | `g-adv-06` | 해 본 적 있어요 | 해 본 경험을 말할 수 있어요 | `g-int-07` | 3/2/2/2 | ready | 미검수 |

교사 확인(모듈 헤더 기준): 순서 문항은 정답 하나(절 순서 교체 시 칩 구두점 변동) / adv-02 bigger·taller만 / adv-03 현재시제만·compare 생략·here/she 문법어 / adv-05 have to는 I/We만 / adv-06 규칙 분사 played·visited + been(seen 제외), int-07 이후 수업 / "I play ball"·"Have you ever played ball?"이 자연스러운지.

### 11.3 Middle School 01~06 (6단원, 직접 사용 = 말하기 · 학년·교육과정 대응 미확인)

| 순서 | id | 제목 | 목표 | 선수 | basicsUnitId | 문항(선/빈/순/만) | 구현 | 검수 |
|---|---|---|---|---|---|---|---|---|
| 1 | `g-mid-01` | 시제 정리 | 현재·과거·미래를 구분해 쓸 수 있어요 | — | `g-int-07` | 3/2/2/2 | ready | 미검수 |
| 2 | `g-mid-02` | 조동사 can·may·must | 허락·의무를 나타내는 말을 쓸 수 있어요 | `g-mid-01` | `g-easy-04` | 3/2/2/2 | ready | 미검수 |
| 3 | `g-mid-03` | 수동태 기초 | "…당했다"는 문장을 만들 수 있어요 | `g-mid-01` | `g-easy-03` | 3/2/2/2 | ready | 미검수 |
| 4 | `g-mid-04` | 관계대명사 who·which | 두 문장을 하나로 이어 설명할 수 있어요 | `g-mid-01` | `g-int-03` | 3/2/2/2 | ready | 미검수 |
| 5 | `g-mid-05` | 분사로 꾸미기 | -ing·-ed로 명사를 꾸밀 수 있어요 | `g-mid-01` | `g-int-05` | 3/2/2/2 | ready | 미검수 |
| 6 | `g-mid-06` | 조건문 if | 만약의 상황을 말할 수 있어요 | `g-mid-01` | `g-easy-06` | 3/2/2/2 | ready | 미검수 |

교사 확인(모듈 헤더 기준): mid-01 words 9개·mid-05 7개(목표 6 초과: 활용형·때 단어) / mid-04 plays·reads(3인칭 -s)를 int-02 선수 없이 사용 / mid-04·05 compare 생략 / mid-03 explainKo 안에 영어 능동문(검증 대상 아님) / mid-06 순서 문항은 정답 하나(대문자·쉼표) / 학년·교육과정 대응 주장 없음.

### 11.4 High School 01~06 (6단원, 직접 사용 = 쓰기 · 학년·교육과정 대응 미확인)

| 순서 | id | 제목 | 목표 | 선수 | basicsUnitId | 문항(선/빈/순/만) | 구현 | 검수 |
|---|---|---|---|---|---|---|---|---|
| 1 | `g-high-01` | 완료 시제 | 과거와 지금을 이어서 말할 수 있어요 | — | `g-int-07` | 3/2/2/2 | ready | 미검수 |
| 2 | `g-high-02` | 수동태 심화 | 시제·조동사가 있는 수동태를 쓸 수 있어요 | `g-high-01` | `g-easy-03` | 3/2/2/2 | ready | 미검수 |
| 3 | `g-high-03` | 관계사 심화 | 긴 문장 속 관계사를 해석하고 쓸 수 있어요 | `g-high-01` | `g-int-03` | 3/2/2/2 | ready | 미검수 |
| 4 | `g-high-04` | 가정법 | 사실과 다른 상황을 말할 수 있어요 | `g-high-01` | `g-easy-06` | 3/2/2/2 | ready | 미검수 |
| 5 | `g-high-05` | 간접화법 | 남이 한 말을 전달해 말할 수 있어요 | `g-high-01` | `g-int-07` | 3/2/2/2 | ready | 미검수 |
| 6 | `g-high-06` | 분사구문 | 분사로 문장을 짧게 이어 쓸 수 있어요 | `g-high-01` | `g-int-05` | 3/2/2/2 | ready | 미검수 |

교사 확인(모듈 헤더 기준): 어휘는 사람이 직접 확인만 함 / high-01 "since 2020"은 시간이 지나면 낡음(2020은 숫자라 검증기가 무시) / high-03 which 생략 허용 / high-05 시제 일치(backshift)는 교과서 규칙 / high-06 주어가 같은 경우만 / 학년 대응 주장 없음.

### 11.5 개념 공유 (Middle ↔ High)

`passive-voice`(`g-mid-03` ↔ `g-high-02`), `relative-clause`(`g-mid-04` ↔ `g-high-03`), `participle`(`g-mid-05` ↔ `g-high-06`)는 §5 규칙대로 같은 conceptId를 공유한다. 중학은 단순한 문형, 고등은 시제·조동사·긴 문장으로 깊이와 문항 난이도를 구분하고, 기초 설명 이동(basicsUnitId)은 각 쌍이 같은 기초 단원을 가리킨다(`g-easy-03`·`g-int-03`·`g-int-05`). 같은 conceptId라는 사실이 특정 학년 대응을 뜻하지 않는다. 설명 본문(`explainKo`)은 단원별로 따로 써 있으며 과정 간 복사는 하지 않았다.

### 11.6 연구 근거

새 인용 없음. §6 표를 재사용했고 설계 판단은 §10.4와 같다(연구 결과에 기댄 설계 방향과 제품 판단을 구분).

### 11.7 검증 (2026-10-10 야간, 브라우저 1개 순차)

| 항목 | 결과 |
|---|---|
| 정적 | 각 단계마다 정적 스위트 ALL PASS. 모든 신규 단원이 `validateGrammarUnit`(어휘 규칙 포함) 통과 |
| 번들 | grammar lazy 청크 최종 빌드 120.2 KB raw / 33.5 KB gzip, main gzip 불변. raw 합계 한도 1.7 → 1.8 MB 상향(`testBundleBudget`). ponytail: 과정별 청크 분리는 후속 |
| mock e2e (`e1e799da` 기준) | `[grammar]` 431/0/1 SKIP(시나리오 k 기초 링크 이동은 ready 학교 단원이 없어 건너뜀), `[hats]` 67/0, `[student-home]` 223/0/1 SKIP(기존 fixture 한계), `[writing]` 83/0, `[speaking]` 608/0, `[unit]` 141/0 |
| mock e2e (학교 단원 추가 후, `119e3b89`) | `[grammar]` 659/0/1 SKIP. h: 5개 과정 ready 34단원 전부 진입(9섹션 순서·문항 수·배지·어휘 검사) / i: 중·고 포함 각 과정 첫 ready 단원 전체 연습 흐름 / k: 모든 학교 단원의 [기초 설명 보기] 링크와 ← 돌아가기 통과 / l: 로드 실패 안내 통과 / SKIP 1건은 m "준비 중 단원 없음". 미mock 요청 0·mock 오류 0 |
| e2e 일반화(`8f82a313`) | 시나리오 h·i를 과정별로 일반화, k 기초 링크 이동(Middle/High → 기초 단원 → 돌아가기), l 로드 실패 경로, m 준비 중 안전 화면 |
| 미검증 | Vercel Preview 실화면(SSO), 실기기, 교사 검수 |

### 11.8 남은 일

교사 검수 34단원, 학원 레벨명·교재 순서 대조, 학교 과정의 학년·교육과정 대응, Preview 실화면 확인, 과정별 청크 분리. 모두 이 절 범위 밖이다.

## 12. (238차, 2026-10-10) 한 장씩 진행하는 단원 덱 + 홈 Grammar 카드

운영자 요청: (1) 문법 단원을 긴 스크롤 한 화면이 아니라 한 장에 하나씩 넘기는 덱으로, (2) 홈에서 문법을 Voca·Speaking·Writing과 같은 크기의 카드로, (3) 검증 목록 제시. 콘텐츠(§3~§11)는 바꾸지 않았고 화면 구조만 바꿨다. 범위는 PR #62뿐, merge·운영 배포 없음.

### 12.1 §2 단일 스크롤에서 달라진 점

| §2 (237차까지) | §12 (238차) |
|---|---|
| 9섹션이 한 화면에 세로로 모두 나열 | 카드 1장 = 개념/문제 1개, 이전/다음으로 이동 |
| 연습 4유형이 한 영역에서 동시에 노출 | 문제마다 카드 1장, 한 문제씩 |
| 문항별 `gu-*` testid | 카드 공통 `gd-*` testid (아래 표) |
| 답 확인 결과는 문항 아래 | 같은 카드에 정답과 이유 표시, 학생이 다음을 눌러야 이동 |
| 상태는 화면 로컬 | 단원별 상태 맵(ref), 저장 없음 |

### 12.2 카드 목록 (`buildDeck`, 순수 함수)

| kind | stepKo | 내용 | 답 확인 규칙 | testid |
|---|---|---|---|---|
| `goal` | 목표 | 단원 제목, 학습 목표, 상황(첫 예문 한국어), 중·고 단원은 기초 설명 링크 | 없음. 다음 바로 가능 | `gd-goal`, `gu-basics-link` |
| `examples` | 예문 | 예문 전체 + 듣기 | 없음 | `gd-example-<i>`, `gd-example-<i>-listen` |
| `explain` ×(2~4) | 설명 | 쉬운 설명 한 줄 + 해당 예문(`explainKo[i]`, 없으면 첫 예문) | 없음 | `gd-explain`, `gd-explain-listen` |
| `structure` | 구조 | S/V/+ 색 칩 | 없음 | `gd-structure-<i>` |
| `compare` (0/1) | 비교 | 긍정·부정·의문 (`compare` 필드가 있는 단원만) | 없음 | `gd-compare`, `gd-compare-<aff\|neg\|q>` |
| `error` ×2 | 오류 | 틀린 문장, 바른 문장, 이유 | 없음 | `gd-error` |
| `choice` ×(3 또는 6) | 연습 · 선택 | 선택 문제 1개 | 보기를 고르면 같은 카드에 정답·이유. 다음 열림 | `gd-choice-opt-<j>`, `gd-result`, `gd-why`, `gd-retry` |
| `blank` ×2 | 연습 · 빈칸 | 빈칸 문제 1개 | [답 확인] 후 정답·이유. 다음 열림 | `gd-blank-opt-<j>`, `gd-check`, `gd-result`, `gd-why`, `gd-retry` |
| `order` ×2 | 연습 · 순서 | 단어 눌러 문장 배열 | [답 확인] 후 정답·이유. [지우기] 있음 | `gd-order-word-<j>`, `gd-order-answer`, `gd-order-clear`, `gd-check`, `gd-result` |
| `build` ×2 | 연습 · 만들기 | 내 문장 쓰기 → [예시와 비교] | 비교하면 예시와 안내 표시. 예시가 유일한 정답이 아님(자동 채점 없음) | `gd-build-input`, `gd-build-compare`, `gd-build-example` |
| `use` | 활용 | 말하기형 [말해 봤어요] / 쓰기형 입력→비교. 활동이 없으면 안내 문구 | 말하기형은 버튼, 쓰기형은 비교 후 다음 열림 | `gd-use`, `gd-use-listen`, `gd-use-done`, `gd-use-done-note`, `gd-use-input`, `gd-use-compare`, `gd-use-example` |
| `summary` | 마무리 | 학습 요약 | 마지막 카드라 다음 없음 | `gd-summary`, `gd-summary-counts`, `gd-summary-wrong-<id>`, `gd-retry-wrong`, `gd-to-list` |

카드 수 = 목표 1 + 예문 1 + 설명 2~4 + 구조 1 + 비교 0~1 + 오류 2 + 선택 3 또는 6 + 빈칸 2 + 순서 2 + 만들기 2 + 직접 사용 1 + 마무리 1 = 단원당 22~26장. 고정 예: `g-easy-01` 23장(설명 4줄), `g-int-01` 23장(비교 있음 + 설명 3줄). 모든 ready 단원이 덱을 만든다(정적 pin).

카드 id는 `<kind>` 또는 `<kind>-<번호>`. 같은 kind가 여럿이면 제목에 ` 1/3`처럼 번호를 붙인다.

### 12.3 화면 틀

- 머리: `gd-step`(현재 단계 이름), `gd-progress`("n / 전체"), `gd-bar`(진행 막대 폭 = n/전체). 단원 제목과 검수 배지(`gu-review-status`)가 그 위에 있다.
- 본문: 카드 한 장(`gd-card`, `data-kind`·`data-id`). 카드 안은 `max-h-[72vh] overflow-y-auto`라서 작은 화면에서는 카드 안에서만 스크롤하고, 글자 크기는 줄이지 않는다.
- 아래: 큰 버튼 `gd-prev`(← 이전, 첫 카드에서 비활성)와 `gd-next`(다음 →, 마지막 카드에서는 렌더하지 않음).
- 잠금 힌트: 다음이 잠겨 있으면 `gd-next-hint`에 "답을 확인한 뒤 다음으로 가요".
- 루트 `gd-root`는 `data-idx`·`data-total`·`data-kind`를 노출한다(e2e용).

### 12.4 다음 버튼 잠금 규칙 (`canAdvance`)

| 카드 | 다음이 열리는 조건 |
|---|---|
| goal, examples, explain, structure, compare, error, summary | 항상 열림(설명 카드는 다음을 눌러 넘어감) |
| choice | 보기를 하나라도 고름(`picked != null`) |
| blank, order | [답 확인]을 누름(`checked`) |
| build | [예시와 비교]를 누름(`compared`) |
| use | 활동 없음이면 열림, 말하기형은 [말해 봤어요], 쓰기형은 비교 |

- 문제는 자동으로 넘어가지 않는다. 답 확인 후 같은 카드에 정답과 이유가 보이고, 학생이 다음을 누를 때만 이동한다.
- 틀리면 [다시 풀기]가 나온다(`gd-retry`). 다시 풀기는 그 카드의 답을 지우고 다시 고르게 하며 자동 이동은 없다.
- 이동할 때마다 `stopSpeaking()`(재생 중인 듣기 중단), `window.scrollTo({ top: 0 })`, 새 카드 제목으로 포커스 이동. 카드 `key`가 카드 id라서 카드 안 스크롤도 처음으로 돌아간다.

### 12.5 상태·저장

- 단원별 상태 `{ idx, answers }`. `answers`는 카드 id별 `{ picked, blankPick, orderSeq, checked, ok, text, compared, done, retry }`.
- `GrammarCourseScreen`의 ref 맵(`deckStates`)에 단원 id로 보관한다. 이 맵은 단원 목록에서 단원을 새로 열 때 해당 단원 항목을 지우고, [단원 목록]으로 나갈 때도 비운다. 저장소(localStorage·DB)에는 쓰지 않는다.
- 이전 카드로 돌아가면 이전 답이 그대로 복원된다(선택 문제는 `initialPicked`로 고른 보기를 복원).
- 기초 설명 왕복: goal 카드의 [기초 설명 보기]로 기초 단원에 갔다가 [← 돌아가기]를 누르면, 맵에 남은 상태 덕분에 원래 단원의 같은 카드와 답이 복원된다.
- 참여 기록(마무리 카드)은 횟수만 보여 준다: 설명 카드 수, 문제 수, 맞힘, 틀림. 점수·등급·별은 없다.

### 12.6 마무리 카드와 홈 카드

- 마무리: 참여 기록 한 줄, 틀린 문제 목록(`promptKo`), [틀린 문제 다시 풀기]가 첫 번째 틀린 문제의 답을 지우고 그 카드로 이동, [단원 목록으로].
- 홈: `StudentHome`의 메인 메뉴가 5카드. 첫 줄 Voca·Speaking, 둘째 줄 Writing·Grammar, 셋째 줄 My Growth(전체 폭, `wide`). 문법 카드는 '📘 문법 / Grammar'(인디고→바이올렛), testid `student-home-menu-grammar`. `grammarEnabled`(App의 QA 테스트 학생)가 꺼져 있으면 다른 카드와 같은 "준비 중" 형태이고 누르면 "문법은 곧 열려요!" 안내만 나온다. 이전의 작은 바로가기 `student-home-grammar`는 제거했다.
- 클릭 경로: 홈 [📘 문법 / Grammar] → 과정 Easy → 1. 부탁하기 → 카드 1/23 목표 → 다음 … → 선택 문제 → 답 확인 → 다음 … → 마무리.

### 12.7 검증 (2026-10-10, 브라우저 1개 순차)

| 항목 | 결과 |
|---|---|
| 정적 스위트 | 덱 도입 후 전부 PASS (덱 pin: `g-easy-01` 23장, `g-int-01` 23장, 모든 ready 단원 덱 생성) |
| `[student-home]` | 241/0/1 SKIP (5카드 그리드, Tab 순서 9정지, 시나리오 r·q 갱신. SKIP 1건은 기존 fixture 한계). 커밋 `9068800c` |
| `[grammar]` 덱 스펙 | 708/0/1 SKIP (덱 첫 빌드 `34712051`, e2e 커밋 `c769ab8a`). b 모든 카드 순회, c·i 과정별 연습 흐름, d 뒤로 갔을 때 답 유지, k 기초 설명 왕복, h 34덱 전부 열림, g 레이아웃 360/390/412/1280 + 스크린샷. SKIP 1건 = m "준비 중 단원 없음" |
| 회귀 재실행 | 같은 빌드에서 `[unit]` 141/0, `[hats]` 67/0, `[speaking]` 608/0, `[writing]` 83/0, `[student-home]` 241/0/1 |
| 리드 확인 스크린샷 | 홈 5카드 그리드, 목표 1/23, 설명 3/23(예문 + 🔊), 선택 10/23 오답 후(설명 + 다시 풀기), 마무리 23/23 참여 기록, 1280 목표 카드 |
| 360x640 결함 | 선택 카드에서 다음 버튼이 떠 있는 속도 위젯에 일부 가려짐. 1차 `ff82e531`(카드 56vh, 루트 pb-28, e2e g 단언 "다음 하단 <= innerHeight-76") 후 705/3(레이아웃 단언 3건 실패). 2차 `c47b1e10`(컴팩트 헤더: 단원 목록 텍스트 버튼을 제목 줄로, 단계·진행 한 줄, 카드 52vh) |
| **미검증 변경** | **`c47b1e10` 레이아웃 보정 — 산술상 537px <= 564px, 브라우저 재실행은 메모리 부족으로 미실행; 운영자/다음 세션이 RAM >=3GB에서 `[grammar]` 재실행 필요** |
| 미확인 | Vercel Preview 실화면(SSO 그대로), 실기기, 교사 검수 |

### 12.8 상태 구분

- 콘텐츠 구현 34/34: 불변.
- 교사 검수: 0/34, 불변. 이번 변경은 검수 상태와 무관하다.
- 화면: 덱 구조로 전환 완료. 검증 수치는 §12.7 채움 후 확정.
- 후속(범위 밖): 교사 검수, Preview 실화면 확인, 실기기에서 작은 화면 카드 내부 스크롤 체감 확인, 과정별 청크 분리.
