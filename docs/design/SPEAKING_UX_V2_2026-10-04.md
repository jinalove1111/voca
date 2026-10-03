# Speaking UX v2 — 회화 연습 / 그림 보고 말하기 시험 분리 (2026-10-04)

운영자 지시(2026-10-04)로 `SPEAKING_DESIGN_2026-10-02.md`·`SITUATION_RECALL_DESIGN_2026-10-04.md`의 Speaking UX 요구를 **이 문서가 대체**한다. 두 문서의 데이터 원칙(브라우저 메모리 전용 녹음, UUID 키, 완료/숙달/점수 금지, 유료 API 금지)은 그대로 유효하다. 기존 구현(201차 `SpeakingPractice.jsx` + `SituationRecall.jsx`)을 **통합**하며 별도 기능을 중복 생성하지 않는다.

## 1. 변경 이유

| 201차 구조 | 문제 | v2 |
|---|---|---|
| Speaking = 열린 질문 3개 녹음 연습, 하단에 작은 "🖼️ 상황 보고 말하기" 우회 버튼 | 연습과 시험의 구분이 없고 시험 진입이 숨겨져 있음 | Speaking 진입 화면에 **동일 중요도 큰 메뉴 2개**: 회화 연습 / 그림 보고 말하기 시험 |
| 상황 연습은 "보기 → 회상(힌트 1~3) → 전이" 한 줄기 흐름 | 보기 단계에서 그림·문장이 함께 보이지만, 회상 단계의 첫 단어 힌트가 시험 성격을 흐림 | **연습**은 그림+문장+뜻+듣기를 처음부터 함께, **시험**은 그림과 진행 상태만 → "답 확인" 후 문장·음성 |
| 열린 질문 3개(What is your name? 등) | 목표 문장이 없어 "그림 보고 말하기 시험"과 ID·표현을 공유할 수 없음 | 연습·시험 모두 `SITUATION_EXPRESSIONS` 5개(id 동일)로 통일. 열린 질문 3개는 제거(설계 기록만 남김) |

## 2. 화면 구조 (App `screen === 'speaking'` 하나, 내부 `mode`)

```
home ─ 🎤 Speaking 카드 ──────────────▶ speaking(mode: menu)
     └ "🖼️ 그림 시험 바로 가기"(보조) ──▶ speaking(mode: exam)
menu ─ [회화 연습] ▶ practice ─ 5문항 ─ 끝 ─ [그림 시험 시작](큰 버튼) ▶ exam
     └ [그림 보고 말하기 시험] ▶ exam ─ 5문항 ─ 요약 ─ [돌아가기] ▶ menu
```

- 뒤로: practice/exam → menu, menu → home. 재진입은 항상 1번 문항·미공개 상태(진행 위치 저장 안 함 — 시험 중간 상태를 저장하면 "답 봤는지"가 섞인다).
- 플래그: `speakingPracticeV1`(기존, 홈 카드·Speaking 전체) / `situationRecallV1`(기존, 시험 메뉴·홈 보조 버튼 kill switch). 기본값 변경 없음.
- `SituationRecall.jsx`·`screen==='situation'` 삭제(시험으로 흡수). `useLocalRecorder`·`SceneCard`·`situationContent`·`situationStore`·`speakingSession` reducer 재사용.

## 3. 회화 연습 (mode practice)

문항 = 표현 5개 × **연습 상황(scene A)**. 한 화면에 위→아래: 그림(SceneCard, 4:3) → 영어 문장(`text-2xl` 이상) → 한국어 뜻 → 🔊 듣기(`speak(en, {source:'speaking'})` — Voca와 같은 경로, 기기 en-GB 음성 우선 + 네트워크 TTS en-GB 폴백) → 🎤 따라 말하기(선택 녹음: 녹음→그만→들어보기→다시 녹음, 기존 `speaking-*` 동작·문구 그대로) → 이전/다음. 그림을 보기 위한 별도 버튼 없음. 5번째 "다음" → 완료 패널: **[🖼️ 그림 시험 시작]**(큰 버튼) + [메뉴로].

## 4. 그림 보고 말하기 시험 (mode exam)

문항 = 같은 표현 5개(id 동일) × **전이 상황(scene B)**. 연습에서 본 그림과 다른 장면에서 같은 표현을 꺼내는지 본다(교사 확인표 ③ "새 상황 사용"에 대응). _대안: scene A로 바꾸려면 `EXAM_SCENE = 'a'` 상수 하나._

- 공개 전: 그림 + 진행 상태("1 / 5") + 🎤 말하기(선택 녹음) + **[답 확인]**. 영어 문장·한국어 뜻·정답 음성·첫 단어 힌트 전부 **미마운트**(숨김 렌더 금지). SceneCard alt는 한국어 상황 묘사만, 그림 안 글자·말풍선 없음(§6 기준).
- [답 확인] 후: 문장 + 뜻 + 🔊 듣기 + 자기 확인(🙂 말할 수 있었어요 / 🌱 아직 어려워요, aria-pressed) + **[다시 연습]**(같은 문항을 §3 연습 형태로 인라인 표시 — 그림 A + 문장 + 듣기 + 따라 말하기, 이후 [다음 문제] 가능) + **[다음 문제]**.
- 마이크 없이도 전 과정 사용 가능(녹음은 선택). 녹음 중에는 답 확인/다음/뒤로 비활성.
- 요약: 5행 × (자기 확인 라벨 또는 "미기록"). **정답/합격/숙달/점수/별/완료 문구·플래그 없음.** 시험 진입·답 확인은 어떤 상태도 생성하지 않는다. 자기 확인은 "학생 자기 확인"으로만 저장되고, 교사 확인은 종이 확인표(`docs/teacher/SITUATION_RECALL_CHECKLIST_2026-10-04.md`)로 분리.
- 저장: 기존 `situationStore` 키(`paulEasyVoca_situationRecall_<UUID>`)에 `{date, scene, stage:'exam', selfReport, recorded}`(답 확인 후 자기 확인 또는 녹음이 있을 때만). 새 DB·업로드 없음. `dueForReview`는 유지하되 v2 UI에서 사용하지 않음(후속 "복습 추천"용).

## 5. testid 계약 (구현·e2e 공통)

| 영역 | testid |
|---|---|
| 메뉴 | `speaking-menu`, `speaking-menu-practice`, `speaking-menu-exam`, `speaking-menu-home` |
| 연습 | `speaking-practice`(data-expr, data-index, data-mic-state), `scene-card`(data-scene, data-final), `practice-sentence`, `practice-meaning`, `practice-listen`, `speaking-record/stop/play/retake/audio/timer/status`(기존), `practice-prev`, `practice-next`, `practice-done`, `practice-start-exam`, `practice-back-menu`, `speaking-back` |
| 시험 | `speaking-exam`(data-expr, data-index, data-revealed, data-mic-state), `exam-progress`, `scene-card`, `exam-reveal`, `exam-answer`(공개 후만), `exam-meaning`, `exam-listen`(공개 후만), `exam-self-can`, `exam-self-hard`, `exam-retry`, `exam-practice-panel`(다시 연습 인라인), `exam-next`, `exam-summary`, `exam-done`, `exam-back` |
| 홈 | `student-home-menu-speaking`(기존), `student-home-speaking-exam`(보조, 플래그 ON일 때만) |

## 6. 전용 일러스트 제작 명세 (10장)

임시 합성 그림(기존 마을/Paul 에셋 조합)은 **최종본이 아니다**. 이 저장소에는 이미지 생성 기능이 없고 유료 이미지 API는 연결하지 않으므로, 아래 명세로 운영자/일러스트레이터가 제작한다. 교체 경로는 기존 그대로: `src/assets/situations/<scene-id>.webp`를 넣으면 `SceneCard`의 `import.meta.glob`이 자동으로 합성 대신 표시하고 "🖼️ 임시 그림" 배지가 사라진다(코드 변경 0).

**공통 기준**
- 파일: `<scene-id>.webp`, 1024×768(4:3), ≤ 120 KB, sRGB. 썸네일 360px 폭에서도 상황 식별.
- 그림체: 일관된 캐릭터(폴 = 기존 Paul 스티커의 얼굴·색), 동일 팔레트, 플랫·세련된 학습용 일러스트(유아용 과장 금지).
- 구성: 핵심 인물 2명(폴 + 상대)과 행동이 화면의 60% 이상. 배경은 장소를 알 수 있을 만큼만, 장식 최소.
- 표정·시선·손동작으로 관계와 의도가 보일 것. **글자·말풍선·숫자·국기·단어 카드 없음**(영어/한국어 정답 단서 0).
- 검수: (1) 글자 0 (2) 360px 축소본에서 "누가 누구에게 무엇을" 식별 (3) 표현을 말하는 이유를 한 문장으로 설명 가능 (4) 같은 폴 얼굴·팔레트 (5) 성별·문화 고정관념 없음.

**프롬프트(공통 접두)**: "Flat modern educational illustration, consistent character 'Paul' (friendly boy with [기존 스티커 색/머리 특징]), clean palette, no text, no speech bubbles, 4:3, two characters large in frame, minimal background —"

| id | 용도 | 장면 프롬프트(접두 뒤) | 목표 의미 | 허용 가능한 대체 표현(교사용) |
|---|---|---|---|---|
| hello-a | 연습 | Paul at a school gate waving to a new classmate he meets for the first time; both smiling, slight distance, the classmate holds a backpack | 처음 만난 사람에게 인사 | Hi! / Hello, I'm Paul. / Nice to meet you. |
| hello-b | 시험 | Paul on a small bridge in a park meeting an unfamiliar child walking a dog; Paul raises a hand, open friendly posture | 처음 만난 사람에게 인사(새 장소) | Hi there! / Hello! / Nice to meet you. |
| help-a | 연습 | Paul in a bookshop reaching for a book on a high shelf he can't reach, looking toward a nearby adult clerk with a questioning face | 도움 요청 | Can you help me? / Could you help me, please? / Excuse me, can you help? |
| help-b | 시험 | Paul at a street signpost holding a map upside down, confused, looking at a passerby | 도움 요청(길) | Can you help me, please? / Excuse me, where is…? (의미 유사 허용) |
| sorry-a | 연습 | Paul has just knocked over a flower pot in a garden; soil spilled; a friend looks at it; Paul's hands up apologetically | 사과 | Sorry. / I'm sorry. / I'm so sorry. |
| sorry-b | 시험 | Paul in a café bumps a table, a cup spills toward a friend's sleeve; Paul's apologetic face, friend surprised | 사과(새 장소) | I'm sorry! / Sorry! / Oops, sorry. |
| thanks-a | 연습 | A friend hands Paul a wrapped gift at Paul's front door; Paul beams with both hands receiving it | 감사 | Thank you! / Thanks a lot! / Thank you so much! |
| thanks-b | 시험 | In a café a friend places a plate of cookies in front of Paul; Paul delighted, hand on chest | 감사(새 장소) | Thank you! / Thanks! / That's so kind. |
| play-a | 연습 | Under a big tree a friend holds a soccer ball; Paul runs toward them with an inviting gesture | 함께 놀자고 제안 | Let's play! / Can I play too? / Let's play together! |
| play-b | 시험 | By a fountain Paul waves a friend over, a jump rope or ball at his feet | 함께 놀자고 제안(새 장소) | Let's play! / Do you want to play? / Come play with me! |

그림만으로 여러 답이 가능하다는 점은 설계상 전제다. 앱은 **유일 정답을 가정하지 않으며**(자동 채점 없음), 위 "허용 가능한 대체 표현"은 교사가 ①②③ 판정 시 참고하는 데이터다. 코드에는 `SITUATION_EXPRESSIONS[].alternatives`로 보관하되 학생 화면에는 표시하지 않는다.

**교체 목록(현재 상태)**: 10/10 임시 합성(최종본 0). 제작 완료 시 파일을 위 경로에 넣고 `verify:situation-recall`(파일명↔scene id 일치)과 `[speaking-exam]` e2e(배지 부재) 확인.

## 7. 검증 계획

- 단위: `testSpeakingSession`(reducer, 열린 질문 제거 반영), `testSituationRecall`(content·store·`alternatives` 존재, UI 소스에 정답/합격/숙달/점수/⭐/완료 부재, 시험 공개 전 소스에서 EN/KO 조건부 마운트 패턴).
- e2e `speaking.spec.mjs`(재작성): 메뉴 2버튼 동일 크기·44px, 연습 문항에 그림+문장+뜻+듣기 동시 표시(360/390/412/1280), 듣기→녹음→재생→다시 녹음→다음(기존 시나리오 b~j 유지), 마지막 문항 뒤 큰 "그림 시험 시작", 뒤로/재진입 1번 문항.
- e2e `speakingExam.spec.mjs`(`situation.spec` 대체, `[speaking-exam]`): 공개 전 body에 EN/KO 문자열·`exam-answer`·`exam-listen` 없음 + `speak` 호출 0(speechSynthesis/TTS mock 카운트), 답 확인 후 표시, 다시 연습 인라인, 다음 문제 → 미공개 복귀, 뒤로→메뉴→재진입 시 1번·미공개, 홈 보조 버튼 직진입, 자기 확인 UUID 저장(stage 'exam', 다른 UUID 무영향), 요약에 정답/합격/숙달/점수 없음, 마이크 없이 완주, 360/390/412 가로 스크롤 0.
- 회귀(직렬 1브라우저): studentHome, student, mobile, writing 관련, townProto25d. 메모리 가드 중단 시 중단 기록, PASS 기록 금지.

## 8. 연구 근거와 한계 (서지 웹 검색 확인)

| 근거 | 적용 | 한계 |
|---|---|---|
| Roediger & Karpicke (2006). Test-enhanced learning. *Psychological Science*, 17(3), 249–255 | "그림만 보고 먼저 말한 뒤 답 확인" — 재학습보다 인출 시도를 앞세움 | 대학생·산문 자유회상. 아동 EFL 구어 전이 미확인 |
| Bjork (1994). Memory and metamemory considerations in the training of human beings. In Metcalfe & Shimamura (Eds.), *Metacognition: Knowing about knowing* (pp. 185–205). MIT Press | 연습(지원 전부 제공)과 시험(지원 제거)을 분리하는 "바람직한 어려움" 틀 | 이론 종합. 어려움이 지나치면 아동에게 역효과 — 그래서 시험 직후 [다시 연습] 제공 |
| Mayer (2005, *Cambridge Handbook of Multimedia Learning*; 2009, *Multimedia Learning* 2판) multimedia principle | 연습에서 그림+문장+음성 동시 제시; 그림은 장식이 아닌 상황 설명(§6) | 설명형 자료 중심. 장식 그림은 무효/역효과 가능 → §6 "장식 최소" |
| Cepeda et al. (2006). *Psychological Bulletin*, 132(3), 354–380 | 시험을 연습과 다른 시점에 다시 보는 것이 유리(교사 확인표 ②) | 간격 수치는 도출되지 않음. 앱은 간격을 강제하지 않음 |

**적용 한계**: 자동 채점이 없어 앱은 정오를 모른다. "답 확인"은 학습 활동이지 평가가 아니며, 평가는 교사 관찰(확인표)뿐이다. 임시 그림은 상황 설명력이 검증되지 않았으므로 §6 최종본 전까지 시험 결과를 그림 탓/학생 탓으로 해석하지 않는다.
