# 상황 보고 말하기 — 교사용 확인표 (2026-10-04)

사양: `docs/design/SITUATION_RECALL_DESIGN_2026-10-04.md` §7. 앱 경로(2026-10-04 v2): 홈 → 🎤 Speaking → **회화 연습**(그림 A + 문장 + 뜻 + 듣기) / **그림 보고 말하기 시험**(그림 B만 → 답 확인). 홈의 "🖼️ 그림 시험 바로 가기"로 시험 직진입 가능. ①은 회화 연습에서, ②③은 시험(또는 교사 제시 상황)에서 관찰한다. 시험 그림(B)만으로 여러 표현이 가능할 수 있으므로 허용 가능한 대체 표현은 `docs/design/SPEAKING_UX_V2_2026-10-04.md` §6 표를 참고한다.

**이 표는 교사가 직접 듣고 적는 기록이다.** 앱은 학생이 버튼을 눌렀다는 사실만 알고, "기억했다/숙달했다"를 판정하지 않는다. 앱 안의 자기 보고("말할 수 있었어요"/"아직 어려워요")는 참고 정보이며 교사 판정을 대신하지 않는다.

## 세 가지 확인은 서로 다른 시점에 한다

| 확인 | 언제 | 무엇을 보나 | 값 |
|---|---|---|---|
| ① 즉시 따라하기 | 앱 **보기 단계**를 처음 하는 수업 | 그림을 보며 음성을 듣고 바로 따라 말하는가 | 명확 / 부분 / 불가 |
| ② 다음 수업 회상 | **다음 수업**(최소 하루 뒤) | 그림만 보여 주고(문장·뜻 없이) 말하는가. 힌트는 앱 힌트 또는 교사 단서 | 힌트 없음 / 힌트 1 / 힌트 2–3 / 불가 |
| ③ 새 상황 사용 | ② 이후, 또는 별도 수업 | 앱의 두 번째 그림(상황 B)이나 교사가 새로 만든 상황에서 그 표현을 쓰는가 | 자발 / 유도 / 불가 |

판정 기준
- **명확**: 문장 전체를 알아들을 수 있음. **부분**: 일부 단어만. **불가**: 말하지 못함.
- **힌트 1**: 첫 단어만 듣고 말함. **힌트 2–3**: 영어 문장 또는 한국어 뜻을 본 뒤 말함.
- **자발**: 교사 유도 없이. **유도**: 질문·손짓·"이럴 땐 뭐라고 하지?" 이후.
- 발음 점수는 매기지 않는다. "알아들을 수 있었나"만 기록한다.

## 확인표

학생 1명당 5행. 날짜는 비고에 `YYYY-MM-DD`로 적는다(①②③ 날짜가 다르면 모두).

| 학생 | 표현 | ① 즉시 따라하기 | ② 다음 수업 회상 | ③ 새 상황 사용 | 비고 |
|---|---|---|---|---|---|
| | hello — Hello! Nice to meet you. | | | | |
| | help — Can you help me, please? | | | | |
| | sorry — I'm sorry. | | | | |
| | thanks — Thank you so much! | | | | |
| | play — Let's play together! | | | | |
| | hello — Hello! Nice to meet you. | | | | |
| | help — Can you help me, please? | | | | |
| | sorry — I'm sorry. | | | | |
| | thanks — Thank you so much! | | | | |
| | play — Let's play together! | | | | |

(필요한 만큼 5행 단위로 복사)

## 관찰 가이드

- 음성 인식(ASR)은 쓰지 않는다. 교사가 직접 듣는다. 듣는 포인트: 단어 누락, 어순, 문장 끝 억양, 긴 침묵.
- ②에서는 "앱에서 뭐 했는지" 묻지 않는다. 그림만 보여 준 상태에서 관찰한다.
- 앱 자기 보고와 교사 관찰이 **다르면 그 자체가 정보**다. 비고에 적는다(예: "앱에서는 '말할 수 있었어요', 수업에서는 힌트 2 필요").
- 임시 그림(앱에 `🖼️ 임시 그림` 배지가 있는 장면) 때문에 상황을 못 알아본 경우는 비고에 "임시 그림 혼동"으로 적는다 — 최종 그림 제작 우선순위 근거가 된다.
- ①②③을 같은 날 몰아서 판정하지 않는다. 같은 날 다시 하는 것은 복습이 아니라 반복이다.
- 녹음은 학생 기기 브라우저 안에만 있고 서버로 가지 않는다. 교사가 들으려면 수업 중 학생 기기에서 ▶ 들어보기를 함께 듣는다.

## 이 표로 알 수 없는 것

장기 기억 여부, 실제 대화에서의 사용, 임시 그림의 학습 효과. 파일럿 결과(이 표의 누적)로만 판단한다. 설계 근거와 한계는 설계 문서 §10.

## 부록 (2026-10-04 추가) — 장면별 인정 표현

모범 답과 다르다는 이유로 "못 함"으로 적지 않는다. 그림 상황에 맞는 자연스러운 영어면 인정한다. 아래는 예시이며, 목록에 없는 답도 의도가 맞으면 인정한다. 이 표는 교사용이며 학생 화면에는 나오지 않는다. 앱은 자동 채점·점수·숙달 판정을 하지 않는다. 설계 문서: `docs/design/SPEAKING_UX_V2_2026-10-04.md` §9.6.

| 장면 | 모범 답 | 인정(예시) | 단독이면 목표 의미 아님(교사 판단) |
|---|---|---|---|
| hello-a 학교 앞, 처음 본 반 친구 | Hello! Nice to meet you. | Hi! / Hello! / Hi, I'm Paul. / Nice to meet you. / Hi, what's your name? | Bye. |
| hello-b 공원 다리, 강아지 산책하는 아이 | Hello! Nice to meet you. | Hi there! / Hello! / Hi, nice to meet you. / Hello! Is that your dog? | — |
| help-a 책방, 높은 책장 | Can you help me, please? | Can you help me? / Excuse me, can you help me? / Could you help me, please? / I can't reach it. Can you help? / Can you get that book for me? | I can't reach it. |
| help-b 길모퉁이, 길 잃음 | Can you help me, please? | Excuse me, can you help me? / I'm lost. Can you help me? / Could you help me, please? / Where is the station? | I'm lost. |
| sorry-a 정원, 쓰러진 화분 | I'm sorry. | Sorry! / I'm so sorry. / Oops, sorry! / Oh no, I'm sorry. | Oops. |
| sorry-b 카페, 친구 옷에 쏟음 | I'm sorry. | Sorry! / I'm so sorry! / Oh no, sorry! / I'm sorry. Are you okay? | Are you okay? |
| thanks-a 현관, 선물 받음 | Thank you so much! | Thank you! / Thanks! / Thanks a lot! / Wow, thank you! / Thank you for the gift! | I love it. |
| thanks-b 카페, 쿠키 받음 | Thank you so much! | Thank you! / Thanks! / Thanks a lot! / That's so kind. Thank you! | Yummy! |
| play-a 나무 아래, 공 가진 친구 | Let's play together! | Let's play! / Can I play too? / Can I join you? / Do you want to play? | — |
| play-b 분수 옆, 혼자 있는 친구 | Let's play together! | Do you want to play? / Let's play! / Come and play with me! / Let's play ball! | — |

임시 그림(`🖼️ 임시 그림` 배지)으로 본 장면에서 엉뚱한 표현이 나오면, 학생 실력보다 그림 혼동일 가능성을 먼저 비고에 적는다.
