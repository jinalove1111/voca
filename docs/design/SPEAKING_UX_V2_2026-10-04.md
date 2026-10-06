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

## 11. 연결된 이야기 속 회화 미션 (2026-10-04, 208차 — append-only)

### 11.1 왜 이야기와 유머인가

- **이유**: 기존 5개 표현은 서로 관련 없는 장면이라 "왜 이 말을 하는지"가 문항마다 새로 설명돼야 했다. 같은 인물·같은 사건이 이어지면 앞 대화가 다음 대화의 이유가 되어, 한글 상황 1~2문장만으로 맥락이 충분해진다. 이미지가 없는 지금(§10) 특히 중요하다.
- **유머 원칙**: 웃음은 그 표현을 말해야 하는 사건에서만 나온다(필통 속 숟가락 → 빌리기, Cookie가 리본을 가져감 → 위치·찾기). 학생을 조롱하지 않고, 모든 문항에 억지 사건을 넣지 않는다. 실존 연예인은 쓰지 않고 "우리가 좋아하는 가수에게 보내지 않는 연습 초대장"이라는 가상 상황으로만 다룬다(답장·등장 없음).
- **아래 연구는 방향을 정하는 근거일 뿐이다.** 우리 콘텐츠의 효과는 검증되지 않았고, "유머/캐릭터가 가장 효과적"이라고 주장하지 않는다(11.6).

### 11.2 표현 선정·난이도·복습 기준

- 회차 주제·회화 기능은 운영자 지정(1화 인사·소개·자리·되묻기 … 10화 정리·격려·감사·감상·다음 약속).
- 회차당 **새 목표 표현 10개**, 전체 100개. 대소문자·문장부호·공백을 지운 뒤 완전히 같은 문장은 다시 세지 않는다. 기존 기본 5개 표현과 같은 문장은 새 목표로 세지 않는다(복습으로만 사용).
- **복습 대사는 별도 집계**(`kind: 'review'`, `reviewOf`로 원래 문항, 원래 문항의 `reuseIn`으로 역방향 연결). 뒤 회차의 실제 사건에서 다시 필요할 때만 넣는다.
- 난이도 `level`: 1 = 3~5단어, 2 = 6~8단어, 3 = 9단어 이상 또는 두 절. 상대방 반응은 목표보다 어렵지 않게.
- 영국 영어 기본(rubber, queue, Shall we…, half past three, Mr Paul). 억지 속어·어려운 말장난 없음.
- 한글 상황(`situationKo`)·역할(`roleKo`): 각 60자 이하, 영어 글자 0, 자기 뜻 문장 미포함, 답을 주는 어간(인사/안녕/반가/미안/사과/고마/감사/도와/도움/부탁/다시 말해 등)과 첫 단어를 암시하는 우회 표현 금지 — "무슨 일이 있었고 무엇을 이루고 싶은지"만 쓴다.

### 11.3 데이터 구조

`src/utils/situation/storyEpisodes.js`(순수 데이터) — `STORY_EPISODES[{ n, id:'epNN', titleKo, summaryKo, nextHookKo }]`, `STORY_ITEMS[{ id:'sEE-OO', episode, order, situationKo, roleKo, en, ko, reply:{ speaker, en, ko }, alternatives[], level, func, kind:'new'|'review', reviewOf, reuseIn[] }]`. 화자: Jamie·Mia·Paul(Mr Paul)·Cookie(소리만)·Shopkeeper(5화)·Guest(9화).

`src/utils/situation/speakingSets.js` — `listSets()`(기본 5개 + 데이터에 있는 회차), `itemsForSet(setId)`(정규화 문항: `id, exprId(저장 키), en, ko, practiceScene, examScene, roleKo, reply`). 기본 세트는 기존 `SITUATION_EXPRESSIONS`/장면 a·b를 그대로 감싼다 → 기존 id(hello…play)·저장 기록과 호환. 이야기 문항은 자기 id(`s01-01` 등)로 기존 `situationStore`에 저장(새 키·새 DB 없음). 이야기 문항은 그림 키가 없어 `hasFinalArt`가 거짓 → 그림 영역 없음(나중에 `src/assets/situations/<id>.webp`를 넣으면 표시).

### 11.4 화면

- Speaking 메뉴 위에 "무엇을 연습할까요?" 세트 선택(기본 표현 5개 / 1화 … 10화, `speaking-set-<id>`, 기본값 기본 5개). 선택한 세트로 기존 두 모드 사용. 홈의 "한글 보고 말하기 바로 가기"는 기본 세트.
- 회화 연습: 한글 상황 + 🙋 내 역할 → "나" 영어 문장 + 뜻 + 🔊(en-GB) → 상대 반응 말풍선(화자·영어·뜻, 🔊 — Cookie는 소리라 듣기 없음) → 선택 녹음·재생 → 다음.
- 한글 보고 말하기: 공개 전 = 한글 상황 + 내 역할 + 진행 상태(+선택 녹음, 답 확인). 목표 영어·뜻·모범 음성·**상대 반응(답을 암시할 수 있음)** 미마운트. 공개 후 = "이렇게 말할 수 있어요" + 문장·뜻·🔊 + 상대 반응(모범 대화) + "상황에 맞으면 다른 말로 말해도 좋아요." + 자기 확인·다시 연습·다음 문제.
- 자동 채점·정답률·합격·숙달 없음. 마이크 없이 전체 흐름 사용 가능. 새 DB·업로드·유료 API·이미지 제작 없음.

### 11.5 연구 근거 (원문 초록 직접 확인 범위 명시)

| 연구 | 대상·방법 | 측정·결과 | 우리 적용 | 한계 |
|---|---|---|---|---|
| Aria, C., & Tracey, D. H. (2003). The use of humor in vocabulary instruction. *Reading Horizons*, 43(3), 162–179. (Western Michigan Univ. ScholarWorks 초록 확인) | 미국 북동부 교외 학교 7학년 84명. 같은 어휘 수업을 유머 맥락 vs 일반 교과서식 맥락으로 실험·통제 비교 | 각 수업 뒤 같은 사전·사후 어휘 시험. 초록: 실험 집단이 "significantly outperformed" 통제 집단. 참여 이론·동기 관점으로 해석 | 유머를 **표현이 필요한 사건**에 묶는다 | 모국어(영어) 읽기 어휘 학습. 말하기·EFL·한국 학생 아님, 단기 측정. 효과의 원인이 유머인지 참여도인지 분리 안 됨 |
| 신미경·권영환 (2013). 개인화(Personalization)가 초등영어 학습자의 의사소통 능력 및 정의적 영역에 미치는 영향. 《영어교과교육》 12(3), 69–89. (KCI·DBpia 초록 확인) | 초등 5학년 2개 반 49명, 통제(2009 개정 교과서 수업) vs 실험(개인화 수업), 12주 | 말하기·쓰기 시험, 의사소통 능력 검사, 흥미·자신감·불안·동기 설문, 학생 소감·교사 일지. 실험 집단 말하기·쓰기에서 통계적으로 유의한 차이, 흥미·자신감 향상 | 학생 본인이 "새로 온 학생" 역할로 이야기에 들어가고, 자기소개(출신·좋아하는 것)를 말한다 | 교사가 진행한 대면 수업 연구. 앱 자기 학습·우리 이야기 형식에 그대로 옮길 수 없음. 우리 콘텐츠의 "나"는 고정 인물이라 완전한 개인화가 아님 |
| Karpicke, J. D., & Roediger, H. L. (2008). The critical importance of retrieval for learning. *Science*, 319(5865), 966–968. doi:10.1126/science.1152408 (WUSTL 초록 원문 확인) | 대학생(초록: "even university students"), 외국어 어휘. 한 번 맞힌 항목을 계속 공부/계속 시험/둘 다 제외로 조작 | 지연 회상. 초록: 학습 후 반복 공부는 효과 없음, 반복 시험(인출)은 큰 긍정 효과, 학생의 자기 예측은 실제 수행과 무관 | 한글 보고 말하기는 영어를 숨기고 먼저 말해 보게 한 뒤 확인(인출 연습). 자기 확인은 판정이 아니라 기록 | 대학생·단어 쌍 회상. 문장 말하기·아동·발음 전이 미확인. 앱은 지연 간격을 강제하지 않음 |
| Sundararajan, N., & Adesope, O. (2020). Keep it coherent: A meta-analysis of the seductive details effect. *Educational Psychology Review*, 32(3), 707–734. doi:10.1007/s10648-020-09522-4 (WSU 기관 보도자료 확인, **출판사 초록은 접근 제한으로 원문 미확인**) | 58개 연구, 7,500명 이상(보도자료) | 흥미를 끌지만 학습과 무관한 세부(seductive details)가 있으면 학습 결과가 낮았다. 보도자료: 정적 요소·관련 도표 옆 배치·종이 매체에서 더 나빴다. 효과 크기 g 값은 원문 확인 전이라 인용하지 않음 | 유머·캐릭터가 **목표 표현과 무관한 볼거리**가 되지 않게: 사건은 그 표현을 말할 이유로만 쓰고, 문항마다 웃긴 장치를 넣지 않는다 | 메타분석은 설명형 자료 중심. 이야기 맥락이 "유혹적 세부"인지 "의미 있는 맥락"인지 우리 콘텐츠에서 측정하지 않음 |

### 11.6 전체 줄거리 (데이터 기준, 9일 월요일 ~ 20일 금요일)

| 회차 | 줄거리(summaryKo) | 다음 회차로 이어지는 사건(nextHookKo) | 문항 | 난이도 1/2/3 | 상대 화자 |
|---|---|---|---|---|---|
| 1화 첫날의 빈자리 | 9일 월요일, 영국 학교로 전학 온 첫날이에요. 폴 선생님과 반 친구들을 만나고 제이미 옆 빈자리에 앉아요. 앞자리 미아는 목소리가 아주 작아요. | 내일 첫 시간은 미술이에요. 준비물을 묻자 제이미가 연필을 꼭 챙기라고 해요. 그런데 정작 제이미는…? | 새 10 + 복습 2 | 4/6/0 | Paul, Jamie, Mia |
| 2화 숟가락이 든 필통 | 미술 시간, 제이미의 필통에서 연필 대신 숟가락이 나와요. 칠판에는 처음 보는 단어가 적혀 있고, 점심시간에는 제이미의 도시락 통에서 수상한 소리가 나요. | 하교 전, 폴 선생님이 교실 문에 종이로 가린 포스터를 붙이며 내일 큰 소식이 있다고 해요. | 새 10 + 복습 2 | 5/3/2 | Jamie, Mia, Paul |
| 3화 축제 팀을 만들자 | 포스터가 공개됐어요. 다음 주 금요일(20일) 3시 반, 운동장에서 학교 축제가 열려요. 셋이 한 팀이 되어 공연과 간식 가게를 정하고 역할을 나눠요. | 리더가 된 미아가 내일 방과 후 음악실에서 첫 연습을 하자고 해요. 그런데 셋 다 춤은 처음이에요. | 새 10 + 복습 1 | 3/6/1 | Mia, Jamie |
| 4화 첫 연습은 엉망진창 | 음악실 첫 연습. 왼쪽 오른쪽이 뒤죽박죽이고 제이미는 커튼 속으로 돌아 들어가요. 천천히 다시 맞추고 서로 칭찬하며 차례로 곡을 골라요. | 폴 선생님이 20파운드를 주며, 내일 방과 후 셋이 학교 앞 가게에 다녀와도 된다고 허락해요. | 새 10 + 복습 1 | 5/5/0 | Mia, Jamie, Paul |
| 5화 필요한 것을 사러 가자 | 금요일 방과 후, 셋이 학교 앞 가게에서 20파운드로 공연용 리본과 간식 재료를 골라요. 비싼 건 내려놓고 개수를 맞춰요. | 미아가 주말 동안 봉지를 맡았다가 월요일 아침 교실 탁자에 올려 두기로 해요. 폴 선생님은 다음 주에 특별한 친구를 데려온대요. | 새 10 + 복습 1 | 7/3/0 | Mia, Shopkeeper, Jamie |
| 6화 Cookie가 가져간 것 | 월요일 아침, 봉지 속 금색 리본이 하나 모자라요. 폴 선생님의 강아지 쿠키가 물고 달아났어요. 리본을 되찾다가 팝콘까지 쏟고 말아요. | 수요일, 교실 라디오에서 우리가 좋아하는 가수의 노래가 흘러나와요. 미아가 눈을 반짝이며 상상을 시작해요. | 새 10 + 복습 1 | 7/3/0 | Mia, Jamie, Paul, Cookie |
| 7화 우리가 좋아하는 가수에게 | 진짜로 보내지는 않는 가상의 초대장 쓰기 연습이에요. 우리가 좋아하는 가수에게 소개, 초대, 날짜, 시간, 장소를 차례로 적어요. | 초대장은 교실 벽에만 붙였어요. 다음 날(목요일) 아침, 제이미의 목소리가 이상하고 날씨 예보에는 금요일 비 표시가 떠요. | 새 10 + 복습 1 | 7/3/0 | Mia, Jamie |
| 8화 축제 전날의 문제 | 축제 전날, 제이미는 목이 아파 노래를 못 하고 금요일에는 비가 온대요. 역할을 바꾸고 장소를 강당으로 옮겨요. | 금요일 오후 3시 반, 밖에는 비가 내리고 강당 문이 열려요. 첫 손님이 들어와요. | 새 10 + 복습 1 | 5/4/1 | Jamie, Mia |
| 9화 드디어 축제 시작 | 강당에서 축제가 시작됐어요. 손님을 맞고, 주문을 받고, 간식을 건네고, 길을 안내해요. 그런데 과자가 다 떨어졌다는 말에 쿠키가 짖어요. | 무대 뒤에서 미아와 금색 리본을 묶었어요. 남은 리본 하나는 쿠키 목에 달아 줬죠. 음악이 시작되고… | 새 10 + 복습 2 | 8/1/1 | Guest, Paul, Cookie, Mia |
| 10화 완벽하지 않아도 성공 | 공연 도중 음악이 멈춰요. 떨리지만 내가 노래를 이어 부르고 미아와 내가 끝까지 춰요. 강당을 정리하며 서로의 마음과 다음 약속을 나눠요. | 이야기 끝 — 목에 금색 리본을 단 쿠키가 꼬리를 흔들어요. | 새 10 + 복습 2 | 7/3/0 | Mia, Jamie, Paul |

**집계**: 새 목표 표현 **100개**(회차당 10, 정규화 후 중복 0, 기본 5개 표현과 중복 0) + 복습 대사 **14개**(별도 집계, `reviewOf`/`reuseIn` 양방향). 난이도 분포 1/2/3 = 58/37/5. 시간 순서: 1화 월(9일) → 2화 화 → 3화 수(축제 발표: 다음 주 금요일 20일 3시 반) → 4화 목 → 5화 금 방과 후(20파운드 장보기: 리본 3개×2파운드 + 간식 6파운드 = 12파운드, 8파운드 남음) → 6화 월(2주차) → 7화 수 → 8화 목(비 예보 → 강당) → 9·10화 금(20일, 강당).

### 11.7 독립 검토 결과 (교육·영어 검토 3회, 콘텐츠 작성자와 분리)

- **1차(줄거리+1화) REVISE, 35건 반영**: 축제 시점("2주 뒤" → "다음 주 금요일"), 토요일 교사 동반 쇼핑 → 금요일 방과 후, 영국 학교 하교 시간에 맞춘 3시 반, 9화 "과자 품절"의 출처(5화 쿠키 구매) 추가, 1화 역할 문장의 답 암시 3건(한 번 더→again, 어떻게→How, 누구인지→Who are you?) 수정, 대체 표현 보강, 2·6화 억지 채움 교체, 미국식 표현 교체("wait in line"→"queue", "Should we"→"Shall we"), 5화 가게 직원·9화 손님 화자 추가.
- **2차(1~5화) APPROVE(소수정), 21건 반영**: 계산 장면("Can we pay for these, please?"), 상대 대사 자연스러움 4건, 역할 문장 답 암시 1건(비슷한→like), 대체 표현 3건. 리드가 1건 기각 — "Jamie의 긴 이름 복원"은 상대 반응이 목표보다 어려워지므로, 대신 1-7 상황을 "이름을 너무 빨리 말했다"로 바꿔 모순을 없앴다.
- **3차(6~10화) APPROVE(수정), 19건 반영**: 10화 무대 인원 모순(제이미는 간식 담당 → 미아와 나만 춤), 9화 금액·쟁반 소품 불일치, 강당 안에서 "down the hall"이 모호 → "corridor", 화장실 위치 상황문이 영어 직역이던 문제, 근접 중복 3건("Let's … together", "keep" 반복) 교체, 부적절 대체 표현 3건 삭제.
- **가상 가수**: 실존 인물 없음, "보내지 않는 가상의 초대장"으로 명시, 가수의 답장·등장 없음(검토 확인).

### 11.8 콘텐츠 한계

- 난이도가 1·2단계에 치우침(3단계 5개). 중학생 상위 학습자에게는 쉬울 수 있다.
- 일부 상황문은 이야기 속 사실(숟가락, 긴 복도 왼편 문 등)을 담아야 해서 **내용**을 알려 준다. 영어 단어·첫 단어는 정적 검사(금지 어간·영어 글자·자기 뜻 문장)와 검토로 막았지만, 의미가 가까운 우회 표현까지 자동으로 잡지는 못한다(검토 3회로 보완).
- 회화 기능의 다양성이 회차마다 고르지 않다(2·6화는 채움 문항을 교체했지만 여전히 가장 얇다).
- "나"는 정해진 인물(한국에서 온 전학생)이라 신미경·권영환(2013)의 완전한 개인화와 다르다.
- 영국 영어 음성은 기기 en-GB 음성(없으면 네트워크 TTS en-GB)이라 기기마다 발음이 다를 수 있다.
- **효과 미검증**: 이야기·유머 형식이 단발 장면(기본 5개)보다 말하기 인출에 낫다는 학생 대상 비교 자료가 없다. 후속 과제: 파일럿 반에서 교사 확인표(①②③)로 기본 세트와 비교, 자기 확인과 교사 관찰의 차이 기록.

### 11.9 구현·검증

결과는 handoff 208차 섹션(정적·e2e·번들·Preview).

## 12. 오늘 기억할 한 문장 — 2화 "Can I borrow a pencil?" (2026-10-05, 209차 — append-only, §11보다 우선)

### 12.1 목표 변경
- 에피소드의 최우선 목표는 **핵심 한 문장을 기억하고 말하기**다. 10개 표현은 대화 재료로 남기되 전부 외우라고 요구하지 않는다.
- 2화 핵심 문장: **Can I borrow a pencil?** (연필 좀 빌려도 돼?). 메뉴에는 한국어 목표("연필을 빌리는 말")만 표시한다 — 메뉴는 시험 직전 화면이므로 영어를 노출하지 않는다.
- 연습을 마친 것 ≠ 기억한 것. 화면은 "연습을 마쳤어요"까지만 말하고, 기억 여부는 다음 수업에서 영어 없이 확인한다(§12.5). 누르기·녹음 여부로 기억/숙달을 판정하지 않으며 저장하는 기록도 없다.

### 12.2 이야기 조정 (id·개수 유지: new 100 / review 14)
- `s02-02` "You can use my pencil." — 내 연필이 **딱 한 자루**이고 그것을 제이미에게 준다 → 내가 연필이 필요해지는 자연스러운 이유.
- `s02-03` → 핵심 문장 "Can I borrow a pencil?"(이전 "Oh no, I forgot my rubber."는 삭제), 상대 미아 "Sure! Here you are."
- `s02-04` "Can I borrow your rubber?"는 같은 틀의 변형 연습으로 유지(상황 문장만 자립적으로 수정).
- 전이 상황(③)은 문항 목록이 아니라 `STORY_EPISODES[ep02].keySentence.transfer`에 둔다(새 표현 개수에 영향 없음): 마지막 수업, 연필이 없는데 제이미가 도시락 통에서 연필을 찾았다(10번 문항의 결말) → 같은 문장을 **다른 상대(제이미)**에게.

### 12.3 다시 꺼내 말하는 흐름 (`KeySentenceFlow.jsx`)
1. **사건 보기 + 듣고 따라 말하기**: 장면이 한 번 재생(닫힌 필통 → 뚜껑 열림 → 연필 대신 숟가락 → 제이미 놀람 → 내 연필을 제이미에게 → 내 손이 빔). 아래에 핵심 문장 EN/KO와 🔊(누를 때만), 선택 녹음.
2. **짧은 대화 뒤 영어 숨기고 다시 말하기**: 1~2번 문항의 짧은 대화를 보여 준 뒤, 한국어 상황·역할과 장면(빈 손 + 미아의 열린 필통)만 보인다. 영어·첫 글자·음성은 [답 확인] 전에는 DOM에 없다. 공개 후 "이렇게 말할 수 있어요" + EN + 듣기 + "다른 말로 말해도 좋아요" + 미아 답, 장면은 미아가 연필을 건네는 동작으로 이어진다.
3. **상대가 바뀐 상황에서 같은 문장**: "이번엔 다른 친구에게" — 제이미와 도시락 통 속 연필(요구르트 자국). 같은 숨김 규칙, 공개 후 제이미가 연필을 건넨다.
4. 끝: "오늘 한 문장 연습을 마쳤어요." + "기억했는지는 다음 수업에서 영어 없이 상황만 듣고 다시 말해 보며 확인해요."

### 12.4 시각 장면 (`PencilCaseScene.jsx`)
- 인라인 SVG + CSS(새 의존성·이미지·유료 API·네트워크·소리 0). 소품(필통·숟가락·연필·도시락 통)을 장면 폭의 약 1/4 이상으로 크게 그리고 등장인물은 한글 이름표(나/제이미/미아)만 쓴다 — **SVG 안 영어 글자 0**(정답 노출 방지).
- 재생은 한 번(약 3초) 후 마지막 장면에서 멈춘다. 반짝임·색종이·계속 움직이는 배경 없음.
- 동작 줄이기(`prefers-reduced-motion`): 애니메이션 없이 의미가 담긴 마지막 장면(열린 필통 + 숟가락 + 놀란 제이미 + 제이미 손의 연필 + 빈 내 손)을 바로 그린다. `aria-label`에 같은 사건을 한국어로 기술.

### 12.5 다음 수업 확인 절차 (교사용 — 기억 효과는 아직 검증되지 않은 설계 가설)
가설: 사건을 눈으로 본 뒤 같은 문장을 세 시점(따라 말하기 → 영어 없이 → 다른 상대)에서 꺼내 말하면, 다음 수업에서 영어 단서 없이 그 문장을 말할 가능성이 높아진다. **효과는 검증 전이다.**

1. 시점: 2화 한 문장 연습을 한 다음 수업(최소 하루 뒤). 수업 시작 직후, 복습·예고 없이.
2. 제시: 영어 글자·음성·첫 글자 힌트 없이 **한국어 상황만** 말로 들려준다. 앱 화면의 이야기 상황을 그대로 쓰지 않고 새 상황을 쓴다(외운 장면 대신 문장 사용 여부를 보기 위해). 예: "미술 시간인데 연필을 집에 두고 왔어요. 옆 친구 필통에 연필이 많아요. 친구에게 뭐라고 말할까요?"
3. 대기: 10초 정도 기다린다. 힌트를 주지 않는다.
4. 기록(학생 이름 대신 반 명부 번호 등 내부 식별자, 기록지에만): ① 핵심 문장 그대로(Can I borrow a pencil? / 같은 뜻의 자연스러운 변형: Could I borrow a pencil?, Can I use your pencil? 등) ② 일부만(예: "Pencil, please?", "Borrow pencil?") ③ 말하지 못함 / 한국어로 말함. 발음·문법 점수는 매기지 않는다.
5. 해석 주의: 한 번의 확인으로 "기억했다/숙달했다"고 결론 내리지 않는다. 앱 연습 여부(했음/안 했음)를 함께 적어 두되, 비교 집단이 없으면 앱의 효과라고 단정하지 않는다. 결과는 다음 회차 설계(핵심 문장 선택·장면 길이)의 근거로만 쓴다.
6. 개인정보: 녹음하지 않는다. 앱 DB에 저장하지 않는다.

### 12.6 범위와 남은 일
- 이번 구현은 2화만(`keySentence`가 있는 회차에만 메뉴 카드 표시). 다른 회차는 같은 구조로 확장 가능하나 핵심 문장 선정은 운영자 결정.
- QA 전용(`qaTestAccounts.js` 게이트 무변경).

## 13. 2화 Paul 중심 완성 — 역할 충돌 정리·시각 장면 개선 (2026-10-05, 212차 — append-only, §12보다 우선)

### 13.1 기획 변경 이유
- 주인공('나')을 승인된 Paul 마스코트로 그리면서, 2화 5~7번의 상대 "폴 선생님"과 얼굴이 같아졌다. 학생이 "나"와 "선생님"을 혼동할 수 있어 **2화 안에서는 교사 Paul을 등장시키지 않는다**(운영자 결정). 다른 9화의 교사 Paul은 그대로다 — 1화·3화 이후와의 충돌은 운영자 결정 대기(§13.6).
- 콘텐츠 리뷰(읽기 전용)와 시각 UX 리뷰(읽기 전용)를 먼저 받고, 구현은 한 명이 취합했다.

### 13.2 2화 콘텐츠 수정 (id·`en`·kind/level/func·복습 연결 유지 → 학습 기록 키 호환)
| id | 바뀐 것 |
|---|---|
| s02-05 | 상대 Paul → **Mia**("Me too! Look at the board."), 상황: 먼저 끝낸 미아가 칠판 쪽을 봄, 뜻 반말("다 했어. 이제 뭐 하면 돼?") |
| s02-06 | 상대 → Mia("I heard it's a day of music, food and fun!"), 상황: 미아가 선생님 설명을 들었음, 뜻 반말 |
| s02-07 | 상대 → Mia(대사 영어 동일), 상황·역할의 "선생님 설명" → "미아 설명", 뜻 반말 |
| s02-08 | "선생님이 칠판을 지워" → "어느새 칠판이 지워졌어요"(교사 행동 제거) |
| ep02 nextHookKo | 주어 "폴 선생님" 제거(3화는 포스터 공개만 언급 — 연속성 영향 없음) |
| s02-03 | "옆자리 미아" → "앞자리 미아"(s02-04·1화와 일치), 역할에서 "잠깐" 제거(borrow 뜻 힌트 약화) |
| keySentence | `watch.situationKo` 신설(보기 단계 상황), recall 역할 "잠깐" 제거, transfer 상황 보완: "내 연필은 제이미가 쓰는 중인데, 제이미가 도시락 통에서 연필을 또 찾았어요"(왜 내 연필을 돌려받지 않는지 설명) |

뜻(`ko`)은 저장 키가 아니다(저장 키 = 문항 id). 존댓말 → 반말은 상대가 같은 반 친구가 되었기 때문.

### 13.3 시각 장면 (`PencilCaseScene.jsx`)
- **Paul**: `src/assets/paul` 원본 파일 무가공. 같은 배율(0.92)로 그리고 모자 중심·모자 꼭대기를 맞춘다(실측: 모자 챙 폭 91~96px로 원본 그림 크기가 같음). `lets_learn`만 원본 속 인물이 작아(챙 64px) 1.48배, 오른쪽 전구는 표시 영역에서만 잘라낸다. 결과: 장면 사이 크기 튐 제거, 390px에서 Paul 높이 약 166~176px.
- **포즈**: 궁금(thinking) → 깜짝(almost) → 연필을 주고 난처(ponder) → 손가락 들고 묻기(lets_learn) → 받아서 엄지(happy). `hello`는 인사로, `one_more`는 눈물 때문에 슬픔으로 읽혀 제외. 원본에 없는 표정·손은 그리지 않았다.
- **소품 인과**: 책상(가로 전체)을 두고 Paul 하반신을 가린다. 내 연필은 Paul 앞 책상 위에 눕혀 두고, 건넬 때 책상 위로 호를 그리며 제이미 손으로 간다. 떠난 자리에는 점선 빈 자리(`data-my-spot=empty`)가 남아 "내 연필이 없다"를 보여 준다. 받을 때는 상대 손 → 내 책상 자리로 같은 호. 필통·도시락 뚜껑은 뒤로 젖혀 열린 모양(사다리꼴)으로 바뀌고, 숟가락이 필통 안에서 올라오며 필통 위에 "!" 하나(흔들림 없음).
- **움직임**: 1회 재생(약 3초) 후 정지, 소리·반짝임·축하 효과 없음. reduced-motion이면 최종 장면(숟가락 나옴 + 제이미 손의 연필 + Paul 난처 + 빈 자리)을 바로 그린다.
- **정답 노출 없음**: 장면 안 글자는 한글 이름표뿐. 회상·새 상황 단계는 [답 확인] 전 영어·듣기·답 영역 미마운트(기존 규칙 유지).

### 13.4 핵심 한 문장 흐름 (기존 `KeySentenceFlow` 그대로, 중복 기능 없음)
① 보기: 장면 + **한국어 상황(신설)** + 영어 + 뜻 + 🔊(누를 때만, en-GB) + 선택 녹음 → ② 짧은 대화 뒤 영어 숨기고 미아에게 → ③ 상대가 바뀐 상황(제이미)에서 다시 → 끝("연습을 마쳤어요"). 누르기·녹음으로 정답·숙달·점수를 만들지 않고, 말했는지 자동 감지하지 않는다.

### 13.5 근거와 한계 (§8·§11.5 재사용 — 새 주장 없음)
- 영어를 숨기고 먼저 떠올리게 하는 단계: Roediger & Karpicke (2006), Karpicke & Roediger (2008) — 대학생·성인 자료, 아동 EFL 구어 전이는 미확인(§8).
- 연습(지원 제공)과 회상(지원 제거) 분리: Bjork (1994) — 이론 종합.
- 그림은 장식이 아닌 상황 설명: Mayer (2005/2009), Carney & Levin (2002)(§9.8).
- 다음 수업 확인: Cepeda et al. (2006) 간격 효과 — 앱은 간격을 강제하지 않음.
- "따라 말하기"와 "상대 바꾸기(전이)"에는 직접 근거 인용이 없다. **이 흐름의 학습·기억 효과는 검증되지 않았다**(§12.5 교사 확인 절차로 관찰 예정).

### 13.6 부족한 Paul 에셋 (제작 필요 — 유료 API 연결 없음)
공통: 기존 마스코트와 같은 그림체(검은 탑햇+배지, 검은 맨투맨, 상반신), 투명 PNG, 모자 챙 폭 약 95px 기준 동일 배율, 영어 글자 없음.
| 파일명 | 권장 크기 | 용도 | 제작 프롬프트 |
|---|---|---|---|
| `paul_surprised.png` | 170×190 | 숟가락 발견 순간 | 같은 Paul 마스코트, 눈을 크게 뜨고 입을 동그랗게 벌린 놀란 얼굴, 한 손으로 앞쪽(오른쪽)을 가리킴, 떨림 선 없음, 투명 배경 |
| `paul_give_pencil.png` | 170×190 | 내 연필을 건네기 | 같은 Paul, 오른손을 앞으로 뻗어 노란 연필을 내미는 상반신, 친절한 미소 |
| `paul_empty_hands.png` | 170×190 | 연필을 준 뒤 빈 손 | 같은 Paul, 두 손바닥을 위로 펴 보이며 살짝 난처한 미소, 손에 아무것도 없음 |
| `paul_ask_hand_raised.png` | 160×190 | 묻기(현재 lets_learn 대체) | 같은 Paul, 한 손을 어깨 높이로 들고 상대를 보며 말하는 표정(입 살짝 벌림), 전구 없음, 다른 포즈와 같은 크기 |
| `paul_receive_pencil.png` | 170×190 | 연필 받기 | 같은 Paul, 두 손으로 노란 연필을 받아 든 상반신, 활짝 웃는 얼굴 |
| (선택) `jamie_*.png`, `mia_*.png` | 170×190 | 상대 인물 그림체 통일 | Paul과 같은 그림체의 영국 초등학생(제이미: 빨간 셔츠 남학생, 미아: 보라 카디건 여학생), 기본·놀람·건네기 3종 |
고해상도: 위 파일은 화면 2~3배 밀도를 위해 2배 크기(@2x)도 함께 권장.

### 13.7 남은 결정
- 1화·3화 이후의 교사 Paul과 주인공 Paul 모습의 충돌(이번 범위 밖, 2화만 정리).
- 부족 에셋 제작 여부(§13.6). 제작 전까지 현재 포즈 매핑을 유지.

## 14. 2화 미아 = 운영자 제공 여성 캐릭터 4포즈 (2026-10-05, 213차 — append-only)

- **원본**: 운영자 제공 `여자폴.png`(1312×1199, RGBA). 알파 실측 — 배경 알파 0(검은 배경 없음), 인물 내부 알파 250~253(약 1~2% 비침), 가장자리만 부분 알파. 내부 알파 ≥240은 255로 올려 완전 불투명 처리(가장자리 안티앨리어싱 유지, 색·모양 무변경).
- **분리**: 네 포즈가 위아래로 맞닿아 있어 사분면 직선 자르기 대신 연결 성분 + 이음매(y 614, 오른쪽 위 인물 팔 아래 끝 y 630까지 위쪽 귀속) 규칙으로 분리, 가장 큰 성분만 남기고 6px 여백. 모자·손 잘림 없음(체크무늬 배경 확인).
- **파일**(`src/assets/speaking/`, 모자 챙 폭 160px로 같은 얼굴 크기): `mia_greet.png`(왼쪽 위 인사, 407×317), `mia_think.png`(오른쪽 위 생각, 222×328), `mia_surprise.png`(왼쪽 아래 놀람, 374×319 — 2화 장면에서는 아직 미사용, 번들 미포함), `mia_give_pencil.png`(오른쪽 아래 연필 건네기, 269×311).
- **연결**: 2화 핵심 한 문장 흐름의 미아 장면(회상 단계)에만 적용, 이름표 "미아"·상대 대사 "Mia"와 같은 인물. 묻기 전 생각 → [답 확인] 후 연필 내밀기(그림 속 연필, 0.7초) → 연필이 호를 그리며 내 책상으로, 미아는 인사(빈 손). 표시 배율 0.5(챙 80단위, Paul 87단위와 비슷), 미아 필통은 가슴 앞 낮게 두어 얼굴을 가리지 않음. 제이미 장면·연습·시험·정답 숨김·문항 id·영어 표현 무변경.
- **한계**: 그림 속 연필(건네기 포즈)과 SVG 연필(이동)이 다른 그림체. 미아 놀람 포즈는 2화에 쓸 자리가 없어 보관만 함. 아이들의 인물 식별·이해는 미검증.

## 15. 운영자 정정: 핵심 한 문장 흐름의 오른쪽 상대 = 미아 한 명 (2026-10-05, 214차 — append-only, §13.3·§14보다 우선)

- **정정 내용**: 제공된 여성 캐릭터는 미아 장면만이 아니라 1/3부터 나오던 임시 SVG 인물(제이미)을 대체한다. 흐름 안의 상대는 **미아 한 명**으로 통일(같은 얼굴의 별도 인물 없음), 남자 Paul 유지.
- **이야기 재구성(흐름 전용)**: 제이미를 이름만 미아로 바꾸면 "내 연필을 미아에게 주고 미아에게 다시 빌리는" 모순이 생긴다. 그래서 흐름은 운영자가 처음 제시한 순서로 되돌렸다 — ① 미술 시간 **내 필통**을 열었더니 숟가락 → 나·미아 놀람 → 내가 묻고 → 미아가 연필을 건넴 ② 그림 그리다 연필심이 부러짐 → 미아에게 다시 ③ 다음 날 필통을 통째로 집에 두고 옴(상황이 다름, 상대는 같은 미아) → 미아에게 다시. 회상 전 짧은 대화는 s02-11("Thank you so much!" / 미아 "You're welcome!") — 키 문장 틀(Can I/borrow) 없음. 3/3 안내 "이번엔 다른 상황에서".
- **장면**: 미아 4포즈 모두 사용(생각 → 놀람 → 연필 건네기 → 인사). 미아 필통은 보라색(내 필통 청록과 구분), 부러진 연필·필통 없는 점선 자리로 각 단계의 이유를 그림으로 보인다. 임시 SVG 인물·도시락 통 장면 삭제.
- **유지**: 키 문장 "Can I borrow a pencil?", 문항 id·영어, 정답 숨김, 연습/시험. 
- **남은 불일치(운영자 결정)**: 2화 **연습 문항** s02-01·02·03·09·10은 여전히 "제이미 필통의 숟가락·도시락 통" 줄거리다(그림 없음, 이름만). 흐름(내 필통)과 줄거리가 다르다 — 연습 문항까지 맞출지는 별도 결정.

## 16. 2화 일반 회화 연습도 Paul·미아 이야기로 (2026-10-05, 215차 — append-only, §15 "남은 불일치" 해소)

- **운영자 결정**: 목표 영어를 지키면 맞출 수 없는 4문항(s02-01·02·09·10)은 **영어만 최소 교체**(ID·순서·나머지 8문항 영어 유지). 나중 회차의 복습 문항이 이 4개를 참조하지 않음을 확인했고, 저장 키는 문항 id라 기록 호환은 유지된다(바뀐 문장에 대한 이전 연습 기록은 이전 문장 기준).
| id | 이전 | 지금 | 상대 반응 |
|---|---|---|---|
| s02-01 | Why is there a spoon in **your** pencil case? (제이미) | Why is there a spoon in **my** pencil case? | Mia: Did you pack in the dark? |
| s02-02 | You can use my pencil. (제이미) | I haven't got a pencil. | Mia: Oh no! I've got lots. |
| s02-03 | Can I borrow a pencil? (유지) | 상황만 "내 필통에는 숟가락뿐이라…" | Mia: Sure! Here you are. |
| s02-09 | Jamie, what's in your lunch box? | Oh no, my pencil broke! | Mia: Here, take another one. |
| s02-10 | Maybe your pencil is in your lunch box. | I left my pencil case at home. | Mia: Again? Don't worry. |
- 줄거리: 내 필통에서 숟가락(01) → 연필이 없다고 알림(02) → 미아에게 빌리기(03) → … 칠판 단어(05~08) → 옮겨 적다 연필이 부러짐(09) → 다음 날 필통을 두고 옴(10). 2화 요약도 같은 줄거리로. 2화 안에 제이미 0.
- **그림 연결**: 01·02·03·09·10에 `pencilScene`(흐름의 `PencilCaseScene` 정지 장면: 숟가락 순간 / 연필 없음 / 부러진 연필 / 필통 없음). **연습에서만** 보이고, 시험은 공개 전 한국어 상황·역할·진행만(그림·영어·듣기 없음) 규칙을 지킨다. 장면에는 영어 글자가 없다.
- 1화·3화 이후 제이미·교사 Paul은 무변경.

## 17. Paul 기준 얼굴 교체 (2026-10-06, 216차 — append-only, §13.3 Paul 포즈 매핑보다 우선)

- **원본**: 운영자 제공 `폴얼굴.png`(1024×1536, RGBA). 알파 실측 — 배경은 이미 알파 0(별도 배경 제거 불필요, 검은 배경 아님), 가장자리 부분 알파는 검은 외곽선 색. 내부 알파 ≥240만 255로(색·모양 무변경).
- **정규화**: 모자 챙 폭 501px → 160px(미아와 같은 기준)으로 축소 → `src/assets/speaking/paul_speaking.png`(327×491, 약 162KB). 장면에서 미아와 같은 배율 0.5(챙 80단위)·모자 꼭대기 y 30 → 두 얼굴 표시 크기 일치.
- **교체 범위**: Speaking 장면(`PencilCaseScene` — 한 문장 흐름 3단계 + 2화 연습 정지 장면)의 Paul 저화질 마스코트 4포즈(thinking/almost/lets_learn/happy)를 이 한 장으로 대체. `src/assets/paul` 마스코트 라이브러리는 다른 화면(반응 스티커 등)이 계속 쓰므로 그대로 둔다.
- **포즈 한계와 보완**: 제공 그림은 엄지 척 한 포즈뿐 — 모든 단계에서 같은 모습. 단계 구분은 미아 4포즈·소품(숟가락 "!", 부러진 연필, 필통 없는 자리)·묻는 순간 "?" 말풍선(영어 글자 없음)으로 한다. 원본 얼굴·표정은 변형하지 않았다. 같은 그림체의 추가 포즈(놀람, 묻기/손 들기, 생각, 연필 받기)가 있으면 단계별로 바꿀 수 있다.

## 18. 2화 완성도 점검 결과 + 1·3화 "오늘 기억할 한 문장" 확장 (2026-10-06, 217차 — append-only)

### 18.1 2화 완성도 점검(독립 리뷰, 읽기 전용) → 수정
- 완료 판정: 인물·소품 일관성(제이미·도시락·교사 Paul 제거), 정답 숨김(공개 전 영어·듣기·답 미마운트, 장면·말풍선 영어 없음, 시험에 그림 없음).
- 수정: ① nextHook "내일" 제거("필통을 두고 온 그날, 하교 전…곧 큰 소식") — 다음 날 장면(s02-10)과 시간 충돌 해소 ② 요약에 "옮겨 적다 연필이 부러져요" 추가 ③ 회상 상황을 s02-09와 같은 시점("공책에 단어를 옮겨 적다…")으로 ④ 새 상황 "옆자리" → "앞자리" ⑤ 역할 힌트 완화: s02-01 "어리둥절해서 미아에게 물어봐요", s02-04 "잠깐" 삭제, s02-08 철자 직접 암시 삭제 ⑥ 화자 이름표 통일 — `SpeakingPracticeItem.SPEAKER_KO` 하나(Mia=미아, Jamie=제이미, Cookie=쿠키)를 흐름도 사용(모든 회차 상대 말풍선 표기가 한글로 바뀜).
- 유지: s02-10 "Again? Don't worry." — 전날 연필 없이(숟가락만) 왔고 이번엔 필통째 두고 와서 "또"가 맞다.
- 이 문서의 stale 서술(현재 코드와 다름 — 아래 절이 우선): §12.2~§12.4의 제이미·도시락·"You can use my pencil" 흐름, §13.3 Paul 포즈 매핑과 §13.6 표의 Paul 마스코트 기준 에셋, §13.4 ③ "상대(제이미)", §14 "mia_surprise 미사용"·"제이미 장면 무변경", §15 "남은 불일치"(§16에서 해소).

### 18.2 1·3화 확장(기존 에셋만 — Paul 기준 그림 1장 + 미아 4포즈 + SVG 소품)
| 회차 | 핵심 문장(기존 문항) | 보기 | 회상(영어 숨김) | 다른 상황 |
|---|---|---|---|---|
| 1화 | s01-08 Could you speak a bit louder? | 미아가 속삭임(희미한 점 말풍선) → Paul "?" → 미아가 두 손 들고 크게(진한 점 + 소리 물결) | 수학 시간에 또 속삭임 → 미아 "Art is first tomorrow!" | 하교 종이 울린 시끌시끌한 교실(소음 물결) → "See you tomorrow!" |
| 3화 | s03-06 That's a great idea! | 미아 생각(전구·음표 말풍선) → 함께 하자(빈 손) | 포스터를 복도에 붙이자(책상 위 포스터 → 벽에) → "Great! Let's put it up." | 팀 이름 정하기 전 간식부터(쿠키) → "Yay! Snacks first!" |
- 선정 이유(운영자 승인 전 임시): 상대가 미아라 기존 그림만으로 장면을 만들 수 있고, 다음 회차에 같은 문장의 복습 문항이 있다(s01-08 → s03-11, s03-06 → s05-11·s08-11). 회차당 문항·ID·영어는 바꾸지 않았다.
- 구조: `keySentence.scenes`(보기/회상/다른 상황의 [공개 전, 공개 후] 장면 이름)를 데이터로 옮겨 `KeySentenceFlow`의 2화 하드코딩을 없앴다(보기 단계 하드코딩 결함을 360px 캡처로 발견·수정). 회상 상대 대사는 `recall.reply`(없으면 핵심 문항의 reply).
- 시각 보완: Paul 그림이 한 포즈(엄지)뿐이라 1화는 Paul "?" 말풍선, 3화는 엄지 자체가 "좋다"는 뜻과 맞음. 원본 얼굴·표정 변형 없음.

### 18.3 미완료(기록)
- 1·3화 핵심 문장 선정은 운영자 확인 필요(임시).
- 1화 연습 문항 s01-01~03의 상대가 "폴 선생님"(교사 Paul) — 주인공 Paul 그림과 이름이 겹침. 흐름 장면에는 나오지 않지만 연습 말풍선 이름표에는 "폴 선생님"으로 나온다(운영자 결정 대기).
- 1·3화 연습 문항에는 정지 장면을 연결하지 않았다(2화만 연결). 제이미는 그림이 없어 제이미 상대 문항은 그림 없이 한국어 상황만.
- Paul 추가 포즈(놀람·묻기·생각·받기) 미제공 — 한 포즈로 유지.
- 4~10화 확장 없음.

## 19. 상대(미아) 역할 녹음 — 2화 (2026-10-06, 218차 — append-only)

- **목표**: 아이가 내 문장(폴)만이 아니라 대화 상대(미아)의 대답도 직접 말해 보고 자기 목소리를 다시 듣는다. 예: 폴 "Can I borrow a pencil?" → 아이가 미아로 "Sure. Here you are!".
- **흐름(연습)**: ① 내 문장 카드에서 🔊 듣기(폴의 문장) ② 🎭 "이번엔 미아 역할도 해 봐요" — [🎙️ 내 대답 녹음] ③ [⏹ 녹음 끝내기] → [▶ 내 목소리 듣기] / [🔁 다시 녹음] ④ 예시 대답(글 + [🔊 예시 대답 듣기], 영국 영어 TTS). 연습에서는 예시 대답이 처음부터 보인다.
- **시험**: 상대 역할 블록은 [답 확인] 뒤에만 나타난다. 예시 대답 글·음성은 [🔊 예시 대답 듣기]를 누르기 전에는 마운트하지 않는다(답 확인 전에는 블록 자체가 없다). 상대 역할이 아닌 문항(1·3화 등)은 기존처럼 답 확인 시 상대 대사를 바로 보여 준다.
- **재사용(중복 구현 없음)**: 녹음은 기존 `useLocalRecorder` 훅을 두 번 쓰고(`sharedStreamRef` 선택 인자로 마이크 스트림 하나 공유 — iOS에서 두 번째 캡처가 앞 스트림을 음소거하는 문제 회피), 버튼 묶음은 기존 `RecorderControls`에 testid 접두·문구·막힘(`blocked`) 선택 인자를 더해 그대로 쓴다(기본값은 이전과 동일). 상대 대사 카드는 기존 `ReplyBubble`(듣기 문구만 인자).
- **정리**: 문항 이동·다시 연습·다음 문제에서 두 녹음기 모두 `reset`(녹음 URL 해제), 화면을 떠나거나 백그라운드로 가면 훅이 마이크 트랙을 놓는다. 한쪽이 녹음 중이면 다른 쪽 녹음·이동·메뉴 버튼은 비활성.
- **하지 않는 것**: 업로드·저장(녹음은 기기 메모리 object URL만), 자동 음성 인식·채점·유료 API·새 DB, 녹음했다고 정답·숙달 판정(상대 역할 상태 문구도 "녹음됐어요"처럼 중립). 시험 자기 확인·기록(`recorded`)은 내 문장 녹음만 반영.
- **범위**: 2화(`STORY_EPISODES` ep02 `partnerRole: true`) 문항 전부, 쿠키 상대 문항은 제외 규칙만 둠. s02-03 예시 대답을 운영자 지정 문구 "Sure. Here you are!"(그럼. 여기 있어!)로 변경 — 핵심 한 문장 흐름의 회상 단계 미아 대사도 같이 바뀐다.
- **검증 구분**: mock(헤드리스 합성 마이크 스트림 + speechSynthesis 스텁)으로 버튼 흐름·스트림 1개 공유·정리·숨김·네트워크 0을 확인했다. **실제 마이크로 녹음·재생 음질, 실기기(iOS/안드로이드) 두 녹음기 전환, 실제 영국 영어 음성 청취는 미검증**.

## 20. 주제별 탐색 — 주제 → 이야기 카드 → 기존 연습 (2026-10-07, 219차 — append-only)

### 20.1 기획 이유
- 아이가 10화 목록(긴 제목)을 읽기 전에 익숙한 주제("학교생활", "쇼핑"…)를 고르게 한다. 기존 "한 이야기에서 한 문장 기억하기"(§12)와 이야기 연결은 그대로 — 주제는 **진입 경로**일 뿐 콘텐츠·진도·기록을 나누지 않는다.
- 근거는 §8·§11.5의 기존 인용만 재사용(맥락 속 제시: Aria & Tracey 2003, 신미경·권영환 2013; 장식 최소화: Sundararajan & Adesope 2020). **주제 우선 진입이 기억을 높인다는 검증은 없다** — 설계 동기로만 쓴다.

### 20.2 데이터(`src/utils/situation/speakingTopics.js`, 순수 모듈)
- `SPEAKING_TOPICS[{ id, emoji, titleKo, descKo, episodes:[회차 id] }]`, `STORY_CARDS[회차 id] = { titleKo(≤12자), lineKo(≤30자), keyItemId(기존 문항 id) }`. 카드의 영어·뜻은 `STORY_ITEMS`에서 읽는다(복사 없음). 1~3화 `keyItemId` = `keySentence.itemId`.
- 한 회차가 여러 주제에 있어도 같은 회차·문항·기록(키 = 문항 id). 새 DB·마이그레이션·저장 없음. 콘텐츠 없는 주제는 `listTopics()`가 내지 않는다(빈 카드 금지).

### 20.3 주제–이야기–핵심 표현 매핑 (콘텐츠 리뷰어 검토 반영)
| 주제 | 설명(실제 문항 기준) | 이야기 | 핵심 표현 |
|---|---|---|---|
| 🏫 학교생활 | 자기소개, 자리, 빌리기, 단어 묻기 | 1화 작게 속삭이는 미아 / 2화 필통에 숟가락이?! | Could you speak a bit louder? / Can I borrow a pencil? |
| 🎉 친구와 놀기 | 취향, 제안, 맞장구, 칭찬, 응원 | 3화 축제 팀 만들기 / 4화 엉망진창 첫 연습 / 10화 음악이 멈춰도 | That's a great idea! / Can we do it again? / We did it! |
| 🍪 음식과 간식 | 주문 받기, 값 말하기, 간식 건네기 | 9화 간식 가게 열기 | What would you like? |
| 🛒 쇼핑 | 가격, 선택, 정해진 돈, 개수, 계산 | 5화 20파운드로 장보기 | How much is this? |
| 🔎 물건·장소 찾기 | 어디 있지?, 보았니?, 확인하기 | 6화 쿠키가 가져간 리본 | Have you seen Cookie? |
| 💬 기분과 문제 해결 | 떨림, 걱정, 사과, 격려 | 4화 / 6화 / 8화 축제 전날의 문제 / 10화 | … / … / Is there anything I can do? / … |

- 운영자 초안의 "길 찾기와 외출"은 실제로 외출 이야기가 없고 길 안내는 s09-07 하나뿐이라 **"물건·장소 찾기"**로 이름을 바꿨다(id `finding`). "도움 요청"(s06-11 복습뿐)·"거절"(표현 없음)·"약속"(s10-10 하나)은 설명에서 뺐다.
- **미분류(의도)**: 7화 "가수에게 쓰는 초대장"(상상 속 초대장 쓰기 — 어느 주제에도 맞지 않음) → 전체 이야기에서만. 주제 설명과 어긋나는 개별 문항(예: s02-06~08 단어 뜻·철자, s09-08 줄 서기, s10-07~08 정리)은 이야기 단위 분류라 그대로 둔다.
- 4~10화의 핵심 표현은 운영자 승인 전 임시 선정(미아 상대·전이 가능·짧음 기준). 한 문장 흐름(§12)은 1~3화만 있으므로 그 외 회차 카드에는 "한 문장 이야기" 버튼이 없다.
- 기본 표현 5개는 이야기가 아니고 주제를 가로지르므로(hello/help/sorry/thanks/play) 복사하지 않고 [📚 전체 이야기 · 기본 표현 5개]로 기존 메뉴에서 연다.

### 20.4 화면·연결(`SpeakingTopics.jsx`, `SpeakingPractice.jsx`)
- 첫 화면 = 주제 카드 6개(각각 "이야기 N개") + [전체 이야기 · 기본 표현 5개] + [← 홈]. 홈의 "한글 보고 말하기 바로 가기"는 전처럼 시험으로 직진입.
- 주제 → 이야기 카드: 그림 + "N화 제목" + 상황 한 줄 + "오늘 기억할 핵심 표현"(영어+뜻) + [🗣️ 연습 시작] (+ 1~3화 [🧠 한 문장 이야기]). 그림은 기존 에셋만 — 1~3화는 흐름 장면 정지(whisper/spoon/idea), 4~10화는 Paul 기준 그림 + 회차별 미아 포즈(같은 필통 그림을 모든 카드에 붙이지 않음).
- [연습 시작] → 기존 회화 연습(세트 = 그 회차; 상황·영어·뜻·듣기·선택 녹음·상대 역할 녹음 그대로) → 끝에서 기존 [한글 보고 말하기 시작] → 시험(답 확인 전 영어·음성·힌트 숨김 그대로). 연습·시험·흐름의 [← 메뉴]는 들어온 화면(주제의 이야기 카드 / 기존 메뉴)으로 돌아간다. 마지막 세트 기억(`loadLastSet`)은 그대로.
- 카드에 핵심 표현을 영어로 먼저 보여 주는 것은 운영자 사양. 콘텐츠 리뷰어는 "인출 우선(§8) 설계와 결이 다르다"고 지적 — 연습은 원래 영어를 보여 주고 시험·회상은 숨기므로 정답 누출은 없지만, 카드에서 영어를 접어 두는 안은 운영자 결정으로 남긴다.
- 노출 범위: QA 계정 게이트(`App.jsx`/`qaTestAccounts.js`) 무변경, PR #62 Draft.

### 20.5 아이 피드백으로 확인할 것(미검증)
- 주제 이름(특히 "물건·장소 찾기", "기분과 문제 해결")을 아이가 자기 말로 이해하는지.
- 주제 카드 → 이야기 카드 두 단계가 "긴 목록보다 빠르다"고 느끼는지, 아니면 바로 이야기 목록을 원하는지.
- 카드의 핵심 표현(영어)을 보고 연습에 들어가는 것이 회상 단계의 재미를 줄이는지.
- 썸네일(인물 그림)만으로 어떤 이야기인지 짐작하는지.
