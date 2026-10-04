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

## 9. 그림 품질·상황 식별성 개선 (2026-10-04, 206차 — §6 보완, append-only)

운영자 지시: 연습·시험 기능은 동작 확인됨. 최우선은 그림 품질과 상황 식별성. 새 기능·마을 꾸미기 없음. §6의 표와 공통 기준은 유지하고, 아래가 **우선한다**. 이 저장소에는 이미지 생성 도구가 없고 유료 이미지 API는 쓰지 않는다(헌법 규칙 7) → 이 절은 제작 명세이며, 임시 그림을 다시 조합해 완료 처리하지 않는다.

### 9.1 현재 임시 그림 진단 (360×640 실제 표시 크기 캡처, 10장 전부)

캡처 방법: QA 픽스처로 mock 로그인 → 회화 연습 5문항·시험 5문항의 `scene-card`를 360px 폭(DPR 2)에서 스크린샷(스크래치, 커밋 안 함). 10장 모두 `data-final="false"`.

**공통 원인(10장 모두)**
1. **건물·소품이 주인공이다.** 배경 에셋이 카드 높이의 70%로 중앙을 차지하고, 폴(35%)과 상대(30%)는 양쪽 아래 구석에 작게 붙어 있다. 시선이 건물로 간다.
2. **두 인물이 서로를 보지 않는다.** 폴 스티커와 동물 스티커가 모두 정면(관객)을 본다. "누가 누구에게"가 화면에 없다. 둘 사이 거리도 화면 폭 전체만큼 멀다.
3. **행동의 원인이 그려지지 않는다.** 원인(쏟은 컵, 건네는 선물, 닿지 않는 책)이 사건으로 그려지지 않고, 하늘에 뜬 이모지(👋❓📚🪴☕💧🎁🍪⚽)로 대체된다. 이모지는 인물·사물과 연결되지 않은 기호라 무엇을 가리키는지 추측해야 한다.
4. **상대가 동물이다.** 강아지·고양이·부엉이는 "처음 만난 친구", "책방 직원", "옷이 젖은 친구"라는 관계를 전달하지 못한다(§6은 사람 상대를 요구했으나 임시본은 동물 에셋뿐).
5. **폴 표정 스티커가 장면과 따로 논다.** 같은 스티커가 여러 장면에 재사용된다(paulSorry ×2, paulHappy ×2). 엄지 척(thanks-b), 전구(play-b), 손가락 하트(thanks-a)는 해당 말을 하는 순간의 몸짓이 아니다.
6. **그림체 혼합.** 실사풍 캐리커처(폴) + 픽셀풍 건물 + 3D풍 동물 + 플랫 이모지가 한 화면에 섞여 있다.
7. **"🖼️ 임시 그림" 배지**가 좌상단을 가린다(의도된 표시이며 최종본에서 사라짐).

**장면별 원인**

| id | 용도 | 학생이 실제로 보게 되는 것(360px) | 알아보기 어려운 이유 |
|---|---|---|---|
| hello-a | 연습 | 학교 건물이 중앙, 구석의 폴이 손바닥을 들고, 반대 구석에 강아지 | 처음 만나는 사이인지 알 수 없음. 손 흔들기와 하늘의 👋가 중복이고, 인사 상대가 강아지라 "만나서 반가워"의 관계가 없음 |
| hello-b | 시험 | 돌다리가 중앙, 폴과 고양이가 양 끝 | 둘이 서로를 보지 않아 "만남"이 없음. 단서가 손바닥과 👋뿐이라 "안녕/잘 가" 구분 불가 |
| help-a | 연습 | 책방 건물(간판 "BOOK SHOP" 글자 보임), ❓와 📚, 머리를 짚은 폴, 부엉이 | 책이 손 닿지 않는 높이에 있다는 사건이 없음. 폴은 생각 중이지 상대에게 요청하지 않음. **그림 안에 영어 글자가 있음(금지 위반)** |
| help-b | 시험 | 빈 표지판, ❓, 턱을 만지는 폴, 지나가는 고양이 | 길을 잃었다는 단서(지도, 갈림길)가 없음. 상대가 고양이라 도움을 청할 대상이 아님 |
| sorry-a | 연습 | 화단이 중앙, 하늘에 멀쩡한 화분 🪴, 시무룩한 폴, 고양이 | 화분이 쓰러지지 않았고 흙도 없음 → 실수가 보이지 않음. 시무룩한 표정만으로는 "슬퍼/미안해" 구분 불가 |
| sorry-b | 시험 | 카페 건물, 하늘에 커피잔과 물방울, 시무룩한 폴, 강아지 | 쏟는 사건과 피해(젖은 옷)가 없음. 컵·물방울이 하늘에 떠 있어 "목말라/커피" 같은 오해 가능 |
| thanks-a | 연습 | 집이 중앙, 하늘에 🎁, 손가락 하트 폴, 부엉이 | 선물을 **누가 누구에게** 주는지 없음(손에서 손으로 건네는 순간이 없음). 하트는 "사랑해"로 읽힘 |
| thanks-b | 시험 | 카페 건물, 하늘에 🍪, 엄지 척 폴, 고양이 | 쿠키를 받는 행동이 없음. 엄지 척은 "좋아/맛있어"로 읽힘 |
| play-a | 연습 | 큰 나무, 나무 위 ⚽, 엄지 척 폴, 강아지 | 공을 가진 쪽이 불분명하고 놀이를 제안하는 몸짓(다가감·손짓)이 없음 |
| play-b | 시험 | 분수, 분수 위 ⚽, 손가락을 든 폴과 전구 💡, 고양이 | 전구는 "좋은 생각"으로 읽힘. 공이 발밑이 아니라 분수 위에 떠 있음. 상대에게 오라는 손짓 없음 |

**결론**: 10장 모두 "누가·누구에게·왜"를 화면만으로 말할 수 없다. 원인은 그림 실력이 아니라 **구성**(조합 방식)이므로, 에셋을 다시 배치해도 해결되지 않는다 → 전용 일러스트만 최종본으로 인정한다(§6 유지).

### 9.2 전용 일러스트 공통 명세 (§6 공통 기준을 대체·강화)

- **인물 2~3명 이내.** 폴 + 상대 1명이 기본. help-a만 직원 1명 추가 가능(최대 3명). 동물은 장면 의미에 필요할 때만 소품으로(hello-b 산책 중인 개). **대화 상대는 사람(또래 아이 또는 어른)**.
- **"말하기 직전 1초"를 그린다.** 원인 사건은 이미 일어났고(컵이 넘어짐, 선물이 손에 닿음), 폴이 상대를 바라보며 입을 막 열려는 순간.
- **시선**: 폴과 상대가 서로를 본다(3/4 측면, 마주 봄). 관객을 보지 않는다.
- **표정·손**: 장면별 표에 지정. 의미가 겹치는 상징 제스처 금지(엄지 척, 손가락 하트, 전구, V 사인).
- **원인 소품은 두 인물 사이 중앙에 크게.** 소품이 인물과 물리적으로 닿아 있어야 한다(손에 든 선물, 쏟아져 소매에 닿는 물).
- **비율**: 두 인물 합산이 그림 높이의 70% 이상, 폭의 60% 이상. 인물 머리가 360px 표시에서 각 40px 이상.
- **배경**: 장소를 알 수 있는 최소 요소 1~2개, 채도·대비를 낮춤(배경 시각 비중 25% 이하). 하늘·바닥 단색 위주.
- **글자 0**: 간판·책 표지·컵·옷의 글자, 말풍선, 숫자, 국기, 이모지 기호, 물음표·느낌표 모두 금지. 감정 기호(땀방울·하트·별)도 금지 — 표정으로만.
- **그림체**: 한 명의 작가(또는 하나의 스타일 프롬프트)로 10장. 플랫 벡터, 굵기 일정한 외곽선, 제한 팔레트(아래), 그림자 1단계. 실사·픽셀·3D 혼합 금지. 유아용 과장(큰 머리 2등신) 금지 — 3~4등신 초등학생 비율.
- **폴 캐릭터 고정**: 초등학생 남자아이, 짧은 짙은 갈색 머리, 따뜻한 피부톤, 검은 실크해트(정면 작은 금색 문장), 검은 스웨트셔츠. 10장 모두 같은 얼굴·옷.
- **팔레트(공통)**: 하늘 `#DFF3FF`, 바닥 `#F6EFD9`, 폴 의상 `#1F2430`, 강조(소품) `#F2994A`·`#56CCF2`, 상대 의상은 장면마다 다른 단색 1개(빨강·초록·노랑 계열 순환). 피부·머리색은 인물마다 다양하게(고정관념 없음).
- **파일**: `src/assets/situations/<scene-id>.webp`, 1024×768(4:3), 120 KB 이하, sRGB, 투명 배경 금지(카드 그라디언트와 섞임 방지).
- **검수(장당, 제작자·교사 각 1회)**: ① 글자·기호 0 ② 360px 폭에서 "누가 누구에게 무엇을 왜"를 한국어 한 문장으로 말할 수 있다 ③ 그 한 문장이 목표 표현의 상황과 같다 ④ 두 인물이 서로를 본다 ⑤ 원인 소품이 두 인물 사이에 있고 인물과 닿아 있다 ⑥ 폴 외형·팔레트가 대표 장면과 같다 ⑦ 다른 4개 표현 중 하나로 읽힐 여지가 없다(예: thanks가 "좋아"로 읽히지 않음). ②③⑦은 그림을 처음 보는 학생 1명에게 보여 확인하면 가장 정확하다.

### 9.3 장면별 제작 명세 (10장)

**공통 프롬프트 접두(모든 장면 앞에 붙임)**

> Flat vector educational illustration for a children's English app, consistent style across a series. Main character "Paul": an elementary-school boy (3–4 heads tall), short dark-brown hair, warm skin, black top hat with a small gold crest on the front, plain black sweatshirt, no logos. Two characters facing each other in three-quarter view, filling most of the frame, eye level of a child. Clean even outlines, one level of soft shadow, limited palette (sky #DFF3FF, ground #F6EFD9, accents #F2994A and #56CCF2). Minimal, low-contrast background with one or two place cues only. Absolutely no text, letters, numbers, signs with writing, speech bubbles, emoji, question marks or symbols. 4:3, 1024×768.

**공통 네거티브**: text, letters, words, logo, signage text, speech bubble, emoji, question mark, exclamation mark, heart symbol, thumbs up, light bulb, sweat drop, photorealistic, pixel art, 3D render, chibi, cluttered background, animals as conversation partners, characters looking at the viewer.

| id | 용도 | 목표 표현 | 누가 → 누구에게 / 왜 | 구도(왼쪽 · 가운데 · 오른쪽) | 표정·시선·손 | 장면 프롬프트(접두 뒤) |
|---|---|---|---|---|---|---|
| hello-a | 연습 | Hello! Nice to meet you. | 폴 → 오늘 처음 본 같은 반 친구 / 처음 만나서 | 폴 · (한 걸음 거리) · 새 친구(책가방, 이름표 없음) | 둘 다 밝은 미소, 서로 봄. 폴은 오른손을 가슴 높이로 들어 가볍게 흔듦, 새 친구는 수줍게 가방끈을 잡음 | At a school gate on the first morning, Paul meets a new classmate for the first time. The new classmate, holding a backpack strap shyly, has just arrived; Paul smiles and lifts his right hand in a small friendly wave. They stand about one step apart, looking at each other. Background: a simple gate pillar and a hint of a school wall. |
| hello-b | 시험 | Hello! Nice to meet you. | 폴 → 공원에서 처음 만난 아이(강아지 산책 중) / 처음 만나서 | 폴 · 강아지(작게, 바닥) · 처음 보는 아이(목줄 잡음) | 둘 다 미소, 서로 봄. 폴은 손을 들어 인사, 상대는 반가운 표정 | On a small park bridge, Paul meets an unfamiliar child who is walking a small dog on a leash. They have just stopped in front of each other; Paul raises his hand in greeting with a warm smile, the other child smiles back. The dog sits quietly between them, small. Background: a few railing posts and soft trees. |
| help-a | 연습 | Can you help me, please? | 폴 → 책방 직원(어른) / 책장 맨 위 책에 손이 닿지 않아서 | 폴(까치발, 위로 뻗은 손) · 높은 책장(책등에 글자 없음) · 직원(책 정리 중) | 폴은 까치발로 손을 뻗었다가 고개를 돌려 직원을 봄, 부탁하는 표정(눈썹 위로). 직원은 폴을 돌아봄 | In a bookshop, Paul stands on tiptoe stretching his arm toward a bright orange book on the very top shelf that he clearly cannot reach. He turns his head to look at a kind adult shop clerk nearby, with a hopeful, asking expression. The clerk, holding a few books, turns toward Paul. Book spines have no writing. |
| help-b | 시험 | Can you help me, please? | 폴 → 지나가는 어른 / 길을 잃어서 | 폴(지도 펼침) · 글자 없는 갈림길 표지(화살표 모양만) · 행인(장바구니) | 폴은 곤란한 표정으로 지도를 들고 행인을 올려다봄. 행인은 걸음을 멈추고 몸을 폴 쪽으로 돌림 | At a street corner with a blank two-way arrow signpost, Paul holds an open map with a puzzled face and looks up at a passing adult carrying a shopping bag. The adult has just stopped walking and turns toward Paul attentively. No writing on the map or sign. |
| sorry-a | 연습 | I'm sorry. | 폴 → 친구 / 폴이 친구의 화분을 쓰러뜨려서 | 폴(두 손을 앞으로, 미안한 자세) · 쓰러진 화분과 흙(가운데 바닥, 크게) · 친구(물뿌리개를 든 채 놀람) | 폴은 눈썹이 처지고 입을 조금 벌린 미안한 얼굴, 친구를 봄. 친구는 놀라서 화분을 내려다봄 | In a small garden, Paul has just accidentally knocked over his friend's flower pot with his elbow; the pot lies on its side with soil spilled across the ground between them. Paul holds both hands open toward his friend, eyebrows down, clearly apologetic, looking at the friend. The friend, holding a watering can, looks at the fallen pot in surprise. |
| sorry-b | 시험 | I'm sorry. | 폴 → 친구 / 폴이 컵을 쳐서 친구 옷에 쏟아서 | 폴(팔을 막 뻗은 자세) · 넘어진 컵과 물줄기(탁자 가운데) · 친구(젖은 소매를 듦) | 폴은 미안한 얼굴로 친구를 봄, 한 손은 입 근처. 친구는 젖은 소매를 들어 보며 놀람 | At a small café table, Paul has just knocked a cup with his arm; the cup is tipped over and juice splashes onto his friend's sleeve. Paul looks at his friend with an apologetic face, one hand near his mouth. The friend lifts the wet sleeve, surprised. The cup and the splash are large and central. |
| thanks-a | 연습 | Thank you so much! | 폴 → 친구 / 친구가 선물을 줘서 | 친구(선물을 내밂) · 선물 상자(두 사람 손 사이, 크게) · 폴(두 손으로 받음) | 폴은 눈이 커지고 활짝 웃으며 두 손으로 상자를 받음, 친구를 봄. 친구는 뿌듯하게 웃음 | At Paul's front door, a friend holds out a wrapped gift box with both hands and Paul receives it with both hands; the box is between them, touching both of their hands. Paul's eyes are wide with joy, big smile, looking at the friend. The friend smiles proudly. Background: just the door frame and a doormat. |
| thanks-b | 시험 | Thank you so much! | 폴 → 친구 / 친구가 쿠키를 가져다줘서 | 친구(접시를 내려놓는 중) · 쿠키 접시(탁자 가운데) · 폴(앉아서 올려다봄) | 폴은 기뻐서 한 손을 가슴에 대고 친구를 올려다봄. 친구는 접시를 폴 앞에 내려놓으며 미소 | At a café table, a friend is placing a plate of cookies in front of Paul, the friend's hands still on the plate. Paul, seated, looks up at the friend with a delighted, grateful smile, one hand on his chest. No thumbs up. |
| play-a | 연습 | Let's play together! | 폴 → 공을 가진 친구 / 같이 놀고 싶어서 | 폴(달려오며 손 내밂) · 축구공(친구 발 앞, 크게) · 친구(공에 발을 올림) | 폴은 신나는 표정으로 친구에게 손을 펼쳐 내밂. 친구는 폴을 보며 반가워함 | Under a big tree, a friend stands with one foot on a soccer ball. Paul is running toward the friend, smiling, one hand open and reaching out in an inviting gesture. Both look at each other; the ball is large and central between them. |
| play-b | 시험 | Let's play together! | 폴 → 혼자 있는 친구 / 같이 놀고 싶어서 | 폴(공을 옆구리에 낌, 손짓) · (두세 걸음 거리) · 혼자 벤치에 앉은 친구 | 폴은 한 손으로 공을 들고 다른 손으로 "이리 와" 손짓, 친구를 봄. 친구는 고개를 들어 폴을 봄 | Beside a simple fountain, Paul holds a ball under one arm and waves his other hand in a "come here" gesture toward a friend sitting alone on a bench. The friend looks up at Paul with interest. No light bulb, no pointing finger. |

### 9.4 대표 장면 먼저 (스타일 확정 절차)

1. **대표 장면: `sorry-b`**. 원인 사건(쏟음) + 피해(젖은 소매) + 감정(미안함/놀람) + 두 인물 마주 봄을 모두 요구해 명세의 모든 규칙을 한 번에 시험한다. 시험 장면이라 식별성 기준이 가장 엄격하다.
2. 제작 → 9.2 검수 ①~⑦ → 360px 앱 안 표시 확인(9.7) → 운영자 승인.
3. 승인된 이미지를 나머지 9장의 **스타일 기준 이미지**로 사용(같은 작가 또는 image-to-image 스타일 참조). 폴 외형·팔레트·외곽선 굵기를 이 장면과 대조한다.
4. 나머지 9장은 연습(A) 5장 → 시험(B) 4장 순서. 장마다 같은 검수.

### 9.5 시험 그림이 모호할 때 — 짧은 한국어 상황 안내 (설계, 미구현)

**제안**: 시험(scene B) 공개 전 그림 바로 아래에 한 줄 한국어 **상황 안내** `examGuideKo`를 표시한다. 상황(누가·무엇을·왜)만 말하고 **할 말은 말하지 않는다**.

| id | 상황 안내(안) | 확인: 목표 표현 단서 없음 |
|---|---|---|
| hello-b | 공원 다리에서 강아지와 산책하는 아이를 처음 만났어요. | "안녕·반가워·인사" 없음 |
| help-b | 길을 잃었어요. 지나가던 어른이 멈춰 섰어요. | "도와·도움·부탁" 없음 |
| sorry-b | 내 팔에 컵이 넘어져서 친구 옷이 젖었어요. | "미안·죄송·사과" 없음 |
| thanks-b | 친구가 내 앞에 쿠키를 가져다줬어요. | "고마·감사" 없음 |
| play-b | 공을 들고 있는데, 친구가 벤치에 혼자 앉아 있어요. | "놀자·같이 놀·함께" 없음 |

**규칙**
- 한두 문장, 40자 이내, 1인칭 상황 시점("내 팔에", "친구가 나에게").
- 금지: 목표 표현의 한국어 뜻·영어 단어·첫 단어 힌트, 말하는 행위를 지시하는 동사(인사해요, 사과해요, 부탁해요, 놀자고 해요), 금지 어간 `안녕 반가 인사 도와 도움 부탁 미안 죄송 사과 고마 감사 놀자 같이 놀 함께 놀`.
- 표시: 그림 아래 회색 작은 글씨, 라벨 "상황". 공개 후에도 유지. 연습(scene A)에는 추가하지 않는다(연습은 이미 문장+뜻 동시 제시).
- 음성으로 읽어 주지 않는다(듣기 버튼은 공개 후 영어 정답 전용 유지).

**기존 요구와 달라지는 점(기록)**: §4는 공개 전 화면을 "그림 + 진행 상태(+ 말하기·답 확인)만"으로 정했다. 이 제안은 공개 전에 **한국어 상황 문장 1줄**을 추가한다. 정답(영어 문장·한국어 뜻·정답 음성·첫 단어)은 여전히 공개 전 미마운트다. 바뀌는 것은 "그림만으로 상황을 알아내야 한다"는 조건 하나이며, 근거는 9.1 진단(현재 그림이 상황을 전달하지 못함)과 시험의 목적(상황 해석이 아니라 **표현 인출**)이다.

**구현 시 범위(이번에 하지 않음)**: `SITUATION_SCENES` B 5개에 `examGuideKo` 필드, `SpeakingExam.jsx` 공개 전 `<p data-testid="exam-situation">`, `testSituationRecall`에 금지 어간·영어 단어 부재 검사, `speakingExam.spec`에 공개 전 표시·정답 미노출 재확인. 최종 그림이 들어온 뒤에도 유지할지는 파일럿에서 교사 확인표 ②(그림만 보여 줌) 관찰로 결정한다.

### 9.6 교사용 허용 표현 (장면별) — 모범 답과 달라도 오답 아님

앱은 자동 채점·점수·숙달 판정을 하지 않는다(유지). 아래는 교사 확인표 판정 시 "의도에 맞게 말했다"로 인정하는 예시다. 목록에 없어도 상황에 맞는 자연스러운 영어면 인정한다. 코드의 표현 단위 `alternatives`는 그대로 두고, 장면 단위 목록은 교사 문서(`docs/teacher/SITUATION_RECALL_CHECKLIST_2026-10-04.md` 부록)에 둔다(학생 화면 비표시).

| id | 모범 답 | 인정(예시) | 주의(단독이면 목표 의미 아님 — 교사 판단) |
|---|---|---|---|
| hello-a | Hello! Nice to meet you. | Hi! / Hello! / Hi, I'm Paul. / Nice to meet you. / Hi, what's your name? | Bye. |
| hello-b | Hello! Nice to meet you. | Hi there! / Hello! / Hi, nice to meet you. / Hello! Is that your dog? | — |
| help-a | Can you help me, please? | Can you help me? / Excuse me, can you help me? / Could you help me, please? / I can't reach it. Can you help? / Can you get that book for me? | I can't reach it.(요청 없음) |
| help-b | Can you help me, please? | Excuse me, can you help me? / I'm lost. Can you help me? / Could you help me, please? / Where is the station?(길 묻기) | I'm lost.(요청 없음) |
| sorry-a | I'm sorry. | Sorry! / I'm so sorry. / Oops, sorry! / Oh no, I'm sorry. | Oops.(사과 없음) |
| sorry-b | I'm sorry. | Sorry! / I'm so sorry! / Oh no, sorry! / I'm sorry. Are you okay? | Are you okay?(사과 없음) |
| thanks-a | Thank you so much! | Thank you! / Thanks! / Thanks a lot! / Wow, thank you! / Thank you for the gift! | I love it.(감사 없음) |
| thanks-b | Thank you so much! | Thank you! / Thanks! / Thanks a lot! / That's so kind. Thank you! | Yummy!(감사 없음) |
| play-a | Let's play together! | Let's play! / Can I play too? / Can I join you? / Do you want to play? | — |
| play-b | Let's play together! | Do you want to play? / Let's play! / Come and play with me! / Let's play ball! | — |

### 9.7 이미지 교체 시 검증 (코드 변경 없을 때 최소 범위)

1. **로드**: `src/assets/situations/<id>.webp` 10개 존재·파일명이 scene id와 일치 → `npm run verify:situation-recall`(파일명↔id) + build 경고 0 + `testBundleBudget`(장당 120 KB 이하).
2. **표시**: `[speaking]`·`[speaking-exam]` e2e — `scene-card[data-final="true"]`, `scene-temp-badge` 0, 360/390/412/1280에서 카드 안에 이미지 전체 표시(가로 스크롤 0).
3. **정답 비노출**: `[speaking-exam]` 공개 전 body에 EN 5문장·KO 5뜻 없음 + `speak` 호출 0(기존 단언 그대로). 그림 속 글자는 자동 검사 불가 → 9.2 검수 ①을 사람이 확인하고 체크리스트에 기록.
4. 9.5를 구현하면 `testSituationRecall` 금지 어간 검사와 `[speaking-exam]` 공개 전 `exam-situation` 표시 검사를 추가.

### 9.8 근거 보완 (서지 웹 검색 확인)

| 근거 | 이번 적용 | 한계 |
|---|---|---|
| Carney, R. N., & Levin, J. R. (2002). Pictorial illustrations still improve students' learning from text. *Educational Psychology Review*, 14(1), 5–26 | 그림은 내용을 **표현·해석**할 때 학습을 돕고 장식 그림은 효과가 없다 → 9.1 "건물이 주인공"·"하늘에 뜬 이모지"는 장식에 해당. 9.2에서 원인 사건을 그리도록 요구 | 읽기(텍스트 이해) 연구 종합. 그림을 보고 **말하기** 인출에 대한 직접 증거 아님 |
| Mayer, R. E., & Fiorella, L. (2014; 3판 2021). Principles for reducing extraneous processing in multimedia learning: Coherence, signaling, redundancy, spatial contiguity, and temporal contiguity principles. In R. E. Mayer (Ed.), *The Cambridge Handbook of Multimedia Learning*. Cambridge University Press | 일관성 원리(불필요한 요소 제거) → 배경 비중 25% 이하, 소품 1개. 신호 원리(핵심 강조) → 원인 소품을 가운데 크게, 시선으로 관계 표시 | 설명형 학습 자료 중심. 아동 EFL 말하기 과제에서의 효과 크기는 미확인 |
| (기존 §8) Roediger & Karpicke 2006, Bjork 1994, Mayer 2005/2009, Cepeda et al. 2006 | 9.5 상황 안내는 인출 대상(표현)을 숨긴 채 인출 단서(상황)만 주므로 시험의 인출 성격을 유지 | 상황 안내가 그림을 대신하면 그림의 역할이 줄어듦 → 최종 그림 후 유지 여부를 파일럿으로 결정 |

**적용 한계(추가)**: 위 연구들은 그림이 **잘 만들어졌을 때**의 효과다. 9.1의 임시 그림으로 얻은 시험 결과는 표현 인출 실패인지 그림 해석 실패인지 구분할 수 없으므로, 최종본 전 결과를 학생 실력으로 해석하지 않는다(§8 한계와 동일).

### 9.9 교체 목록 (현재 상태)

10/10 임시 합성, 최종본 0. 이미지 생성 도구 없음 → 운영자/일러스트레이터 제작 대기. 대표 장면 `sorry-b`부터. 넣을 경로: `src/assets/situations/hello-a.webp`, `hello-b.webp`, `help-a.webp`, `help-b.webp`, `sorry-a.webp`, `sorry-b.webp`, `thanks-a.webp`, `thanks-b.webp`, `play-a.webp`, `play-b.webp`(코드 변경 불필요 — `SceneCard`가 파일이 있으면 자동 사용하고 임시 배지를 없앤다).

## 10. 한글 상황 기반 Speaking (2026-10-04, 207차 — §3·§4·§9.5를 대체하는 부분만 기록, append-only)

### 10.1 변경 이유

운영자 지시로 우선순위 변경: **이미지 제작·교체는 보류**하고, 한글 상황 안내로 Speaking을 먼저 완성한다. §9.1 진단대로 임시 그림 10장은 "누가 누구에게 왜"를 전달하지 못하므로, 그림 없이도 완결되는 화면으로 바꾼다. 새 기능을 따로 만들지 않고 기존 연습/시험 구현에 통합했다.

### 10.2 구조

| 항목 | 이전(§3·§4) | 207차 |
|---|---|---|
| 연습 문항 | 그림(임시) → 영어 문장 → 뜻 → 🔊 → 녹음 | **한글 상황 카드** → 영어 문장 → 뜻 → 🔊(기존 en-GB 경로) → 따라 말하기·선택 녹음·재생 → 다음 |
| 시험 이름 | 그림 보고 말하기 시험 | **한글 보고 말하기**(메뉴 `📝 한글 보고 말하기`, 제목, 연습 완료 버튼 `📝 한글 보고 말하기 시작`, 홈 보조 버튼 `📝 한글 보고 말하기 바로 가기`) |
| 시험 공개 전 | 그림 + 진행 상태 | **한글 상황 카드 + 진행 상태**(+ 선택 녹음 + 답 확인). 영어 문장·뜻·첫 단어 힌트·모범 음성 미마운트(기존 그대로) |
| 시험 공개 후 | 문장·뜻·🔊·자기 확인·다시 연습·다음 문제 | 같음 + 라벨 **"이렇게 말할 수 있어요"** + 문구 "상황에 맞으면 다른 말로 말해도 좋아요." 한글 상황 카드는 유지 |
| 그림 | 임시 합성 표시 + 배지 | **최종 일러스트 파일이 있는 장면만 표시**(`SceneCard.hasFinalArt`). 지금은 10장 모두 없음 → 그림 영역 자체가 없음 |

- 데이터: `SITUATION_SCENES` 10개에 `situationKo` 1개 필드 추가(연습=장면 a, 한글 보고 말하기=장면 b). 표현 5개·id·`alt`·`examAlt`·`backdrop`·`paulSticker`·`partner`는 보존 → 나중에 그림을 넣으면 `src/assets/situations/<scene-id>.webp`만 추가하면 상황 카드 위에 자동으로 나타난다(코드 변경 불필요). 이미지 준비는 완료 조건이 아니다.
- 컴포넌트: `SpeakingPracticeItem.jsx`에 `SituationGuide`(상황 카드, `data-testid="situation-guide"`/`situation-text`, `data-scene`)를 추가하고 연습·시험·다시 연습 패널이 공유. 새 화면·새 라우트·새 플래그 없음. 기존 플래그 `speakingPracticeV1`/`situationRecallV1` 의미 그대로.
- `alternatives`(교사용)는 여전히 학생 화면에 표시하지 않는다. 대신 "다른 말로 말해도 좋아요" 문구로 여러 표현이 가능함을 알린다. 교사용 장면별 인정 표현은 §9.6·교사 확인표 부록.
- 자동 채점·점수·합격·숙달·정답 문구 없음(기존 금지어 검사 유지). 마이크 없이 전 과정 사용 가능(녹음 선택). 새 DB·음성 업로드·유료 API 없음. 저장은 기존 `situationStore`(기기 localStorage, 키에 students.id UUID)만.
- QA 전용 게이트(205차) 유지: 홈·Speaking은 QA UUID만.

### 10.3 한글 상황 안내 10개

| id | 용도 | situationKo |
|---|---|---|
| hello-a | 연습 | 학교 첫날, 처음 보는 반 친구가 내 옆에 왔어요. |
| hello-b | 한글 보고 말하기 | 공원 다리에서 강아지와 산책하는 아이를 처음 만났어요. |
| help-a | 연습 | 책방 맨 위 칸 책에 손이 닿지 않아요. 옆에 직원이 있어요. |
| help-b | 한글 보고 말하기 | 길을 잃었어요. 지나가던 어른이 멈춰 섰어요. |
| sorry-a | 연습 | 내 팔꿈치에 친구 화분이 쓰러져서 흙이 쏟아졌어요. |
| sorry-b | 한글 보고 말하기 | 내 팔에 컵이 넘어져서 친구 옷이 젖었어요. |
| thanks-a | 연습 | 친구가 나에게 예쁘게 포장한 선물을 건네줬어요. |
| thanks-b | 한글 보고 말하기 | 친구가 내 앞에 쿠키를 가져다줬어요. |
| play-a | 연습 | 친구가 공을 가지고 있어요. 나도 끼고 싶어요. |
| play-b | 한글 보고 말하기 | 공을 들고 있는데, 친구가 벤치에 혼자 앉아 있어요. |

규칙(정적 검사로 강제, `scripts/testSituationRecall.mjs`): 45자 이하, 영어 글자 0, 목표 뜻·말하기 행위 어간(`안녕 반가 인사 도와 도움 부탁 미안 죄송 사과 고마 감사 놀자 같이 놀 함께 놀`) 0, 한국어 뜻 문장 미포함. 직역 시험이 되지 않도록 "무엇을 말하라"가 아니라 "무슨 일이 있었는지"만 쓴다.

### 10.4 기존 요구와 달라진 점

- §4 "공개 전 그림과 진행 상태만" → "공개 전 **한글 상황**과 진행 상태만". 정답 비노출 원칙(영어·뜻·첫 단어·모범 음성 미마운트)은 그대로.
- §9.5(설계만 했던 시험 한국어 상황 안내)는 이번에 구현되었고, 대상이 시험 5개 → 연습 포함 10개로 넓어졌다(연습은 상황 + 문장 + 뜻을 함께).
- "정답" 대신 "이렇게 말할 수 있어요".

### 10.5 근거와 한계

§8·§9.8 근거 유지. 한글 상황 안내는 인출 대상(영어 표현)을 숨긴 채 인출 단서(상황)만 주므로 "먼저 말해 보고 확인" 구조(Roediger & Karpicke, 2006)를 유지한다. 한계: 한국어 상황 문장이 학생에게 "번역해서 말하기"로 받아들여질 수 있다 — 그래서 상황 문장에 목표 뜻을 넣지 않고, 공개 후 "다른 말로 말해도 좋아요"를 함께 보여 준다. 효과는 파일럿 교사 관찰(확인표)로만 판단한다.

### 10.6 검증

결과는 handoff 207차 섹션에 기록(정적 `testSituationRecall` + e2e `[speaking]`·`[speaking-exam]`·`[student-home]`·`[student]`·`[mobile]`, 360/390/412/1280).
