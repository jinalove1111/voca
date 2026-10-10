# Writing 첫 버전 — 주제별 문장 쓰기(상황 → 직접 쓰기 → 예시 비교 → 고치기) (2026-10-07, 222차)

_QA 계정 전용·PR #62 Draft. 기존 Writing Coach MVP(`docs/WRITING_COACH.md`, 플래그 `writingCoachEnabled` 기본 OFF, 오늘 단어로 자유 문장 + 규칙 검사기)와는 다른 과제라 화면을 새로 두되, 진입(홈 ✍️ 카드·`writingCoach` 화면 id)·문항(Speaking 이야기 문항 id)·주제(Speaking 주제 id)·저장 방식(기기 localStorage, UUID 키)·화면 문법(BTN·카드)은 전부 기존 것을 재사용한다. 기존 WritingCoach 컴포넌트와 규칙 검사기는 그대로 남아 있으며(비QA 경로·`testWritingCoach` 유지) 삭제·수정하지 않았다._

## 1. 기획 이유
- 말하기에서 연습한 표현을 **학생이 직접 한 문장으로 써 보고**, 예시와 비교해 스스로 고친 뒤, 선생님에게 확인받는다. 베껴 쓰기가 아니라 **먼저 떠올려 쓰기**(예시는 비교 단계까지 숨김)가 핵심이다.
- 무작위 번역 문항이 아니라 Speaking 이야기의 상황(situationKo)·역할·상대 대답을 그대로 쓴다 — 같은 콘텐츠 id, 같은 영어 문장. 새 문장은 만들지 않았다.

## 2. 문항 구조 (`src/utils/writing/writingItems.js`, 순수)
`{ id: 'w-<문항id>', itemId, topic, promptKo, hintWords, noteKo, acceptNoteKo? }` — 상황·역할·영어 목표 표현(= 예시 답안)·뜻·대체 답안(`alternatives`)·상대 대답(`reply`)은 **Speaking 문항에서 읽는다**(복사 없음). 주제 id는 `speakingTopics`와 같다. 문항이 있는 주제만 `listWritingTopics()`에 나온다(지금은 학교생활·쇼핑).

| 주제 | Writing id | Speaking 문항 | 목표 표현(예시) | 대체 답안(문항의 alternatives) | 단어 도움 |
|---|---|---|---|---|---|
| 학교생활 | w-s01-04 | s01-04 | Is this seat free? | Is anyone sitting here? 등 | seat, free |
| 학교생활 | w-s01-10 | s01-10 | What do I need for tomorrow? | What should I bring…? 등 | need, tomorrow |
| 학교생활 | w-s02-02 | s02-02 | I haven't got a pencil. | I don't have a pencil. 등 | haven't got, pencil |
| 학교생활 | w-s02-03 | s02-03 | Can I borrow a pencil? | Could I borrow a pencil? 등 | borrow, pencil |
| 학교생활 | w-s02-08 | s02-08 | How do you spell it? | Can you spell it for me? 등 | how, spell |
| 쇼핑 | w-s05-01 | s05-01 | How much money do we have? | How much have we got? 등 | how much, money |
| 쇼핑 | w-s05-03 | s05-03 | How much is this? | How much does this cost? 등 | how much, this |
| 쇼핑 | w-s05-04 | s05-04 | That's too expensive. | We can't buy that. 등 | too, expensive |
| 쇼핑 | w-s05-05 | s05-05 | Is there a cheaper one? | Do you have a cheaper one? 등 | cheaper, one |
| 쇼핑 | w-s05-09 | s05-09 | Can we pay for these, please? | Can I pay…? 등 | pay, please |

- `promptKo`(≤45자, 영어 없음, 문항의 뜻 문장을 그대로 담지 않음)·`noteKo`(≤50자)·`acceptNoteKo`(≤40자)는 콘텐츠 리뷰어(읽기 전용)가 작성·검토. 리뷰어 메모: s01-04 "자리 주인이 있는지", s02-03 "잠깐 쓰게 해 달라고"는 뜻에 가까운 안내(문장 자체는 다름); "haven't got"·"how much" 단어 도움은 구조 힌트에 가깝다 — 도움을 본 경우를 "도움 보고 썼어요"로 구분하는 이유.

## 3. 흐름 (`src/components/WritingPractice.jsx`)
1. 주제 카드(학교생활·쇼핑) → 문항 목록(한국어 안내만; 쓴 문장이 있으면 "📝 쓴 문장 있음 · 예시와 비교했어요") →
2. **쓰기**: 한국어 상황 + ✍️ 안내 + 입력창. 영어 예시·듣기·대체 답안은 DOM에 없다. [💡 도움 보기] → 단어 2~3개만(문장 전체 아님). 빈 입력·공백만이면 [예시와 비교하기] 비활성.
3. **비교**: 내가 쓴 문장(혼자 썼어요 / 도움 보고 썼어요)을 그대로 두고, "이렇게 쓸 수 있어요 (예시)" + 뜻 + 🔊 듣기(영국 영어 TTS) + "이렇게 써도 좋아요: 대체 답안" + 설명 + 상대 대답 + 같은/다른 문장 표시("뜻이 통하면 다른 말도 괜찮아요"). 예시가 유일한 정답이라고 말하지 않는다.
4. **고치기**: [✏️ 내 문장 고치기] → 내 문장이 미리 채워진 입력창 → 저장 → 수정 전(내가 쓴 문장)과 수정 후(고친 문장)를 함께 표시.
5. [다음 문장 →]. 문항에 다시 들어오면 비교 상태와 두 문장이 복원된다.
- 선생님 확인: "✅ 예시와 비교했어요. 선생님 확인은 수업에서 받아요 — 이 앱은 확인 기록을 저장하지 않아요." **기존 저장 방식에 교사 확인 기록이 없으므로 안내만**, 확인 기록처럼 표시하지 않는다.

## 4. 저장과 개인정보 (`src/utils/writing/writingDrafts.js`)
- 기존 Writing 저장은 설계 SQL(`sql_migrations/writing_coach_20260810_design.sql`)만 있고 미실행·DB 접근 0 → 새 DB·마이그레이션 없이 **QA용 기기 임시 저장**(localStorage, 키 `paulEasyVoca_writingDrafts_<students.id UUID>`, 이름 키 금지). 레코드는 `{ first, revised, helped, compared, updatedAt }`뿐 — 점수·정답·숙달·교사 확인 값 없음.
- 화면 안내: "쓴 문장은 이 기기에 임시 저장되며 선생님에게 자동 전송되지 않아요." 계정별 키 분리(다른 UUID의 초안은 보이지 않음, e2e c). 학생 이름·답안을 외부로 보내지 않는다(e2e: 로그인 외 REST 쓰기 0건).
- 한계: 기기를 바꾸면 사라진다. 선생님이 보려면 수업에서 화면을 보여 주거나, 다음 단계에서 기존 설계 SQL 기반 저장을 검토한다.

## 5. 평가 범위(하지 않는 것)
- 유료 AI 채점 API 없음, 자동 정답·합격·숙달·문법 점수 없음, 예시와 달라도 오답 처리 없음. `sameSentence`는 대소문자·문장부호·공백 차이를 무시하고 "예시와 같은 문장인지"만 표시한다(문법 판정 아님).
- "예시와 비교했어요"(compared)와 "선생님 확인"은 다르며 후자는 기록하지 않는다.

## 6. Speaking 연결
- Speaking 연습 끝 화면(`SpeakingPracticeMode` done)에 **[✍️ 이 표현 써보기]** — 그 세트의 핵심 표현에 Writing 문항이 있을 때만(2화 s02-03, 5화 s05-03). 누르면 그 Writing 문항이 바로 열리고, [← 목록]은 원래 Speaking(그 세트의 연습 끝 화면)으로 돌아간다(`App.writingLink`, `SpeakingPractice initialMode='practiceDone'`). 홈에서 문장 쓰기를 열면 링크는 초기화된다. 녹음·듣기·시험 상태는 건드리지 않는다(연습 끝 화면은 녹음기가 이미 정리된 상태).

## 7. 교육 근거(리서치 담당 확인, **전부 초록·2차 요약 수준 — 원문 전체는 열지 못함**)
| 출처 | 대상·방법 | 결과 | 우리 적용 한계 |
|---|---|---|---|
| Hanaoka (2007). Output, noticing, and learning: An investigation into the role of spontaneous attention to form in a four-stage writing task. *Language Teaching Research*, 11(4), 459–479 (초록·2차 요약) | 일본 여대생 37명, 그림 서사문 작성 → 모범문 비교 → 재작성 → 2개월 뒤 재작성 | 자기 글에서 막힌 곳이 모범문 주목을 이끌었고 주목의 대부분(약 92%)이 어휘, 수정본에 반영 | 성인·긴 글·통제집단 확인 못함. 한국 10~12세 한 문장·교사 없음에 일반화 불가 |
| Coyle & Roca de Larios (2014). *SSLA*, 36(3), 451–485 (초록 요약) | 스페인 EFL 11~12세 짝 활동: 쓰기 → 비교(오류 교정 vs 모범문) → 재작성 | 아동은 문법보다 어휘를 주목·반영; **오류 교정 조건이 일부 지표에서 모범문보다 유리** | 짝 협동·긴 글. 모범문 비교가 교사 교정을 대신한다고 볼 수 없음 → 우리 "선생님 확인" 단계를 둔 이유 |
| Cánovas Guirao, Roca de Larios & Coyle (2015). *System*, 52, 63–77 | 초등 EFL 아동, 모범문 피드백 | **서지만 확인, 결과 미확인** | 인용 보류 |
| Karpicke & Blunt (2011). *Science*, 331, 772–775 / Rowland (2014). *Psychological Bulletin*, 140(6) / Slamecka & Graf (1978) (초록·2차) | 대학생·실험실, 인출 연습 vs 재학습, 생성 효과 | 산출형 인출·직접 생성이 재학습·읽기보다 지연 기억에 유리 | 성인·단어/텍스트. 문장 작문 전이는 별개 |
- 설계 가설: ① 예시를 보기 전 스스로 쓰면 베끼기보다 비교 단계에서 예시의 어휘·표현을 더 주목할 것이다 ② 막힌 부분(도움을 본 단어)이 비교에서 더 잘 보일 것이다 ③ 주목은 문법보다 어휘에 치우칠 것이므로 비교 초점을 핵심 표현에 둔다.
- **주장하지 않는 것**: 쓰기 실력·정확성 향상(근거 연구 조건이 다르고 우리 조건은 미검증), 자동 피드백·채점과 동등하다는 주장(아동 연구에서 교정이 모범문보다 유리한 지표가 있음).

## 8. 검증 결과·미검증
- 결과는 handoff 222차 섹션. 미검증: 실기기 키보드(가상 키보드와 입력창 가림은 `pb-40` 여백으로만 대응), 아이가 혼자 쓰기를 시도하는지·예시를 본 뒤 고치는지(실사용 관찰 전), 로그인 Preview 실화면.

## 9. 다음 수업 관찰 항목(교사 기록, 앱 저장 없음)
혼자 쓰기를 시도했는지(도움 보기 전에 썼는지) / 예시를 보고 무엇을 고쳤는지(어휘·어순·물음표) / 다음 수업에 같은 상황을 말로·글로 다시 할 수 있는지 / 어느 화면에서 도움을 요청했는지.
