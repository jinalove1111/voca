// 2026-10-08(227차) 회화 C2 "거기 아니야, 저기는?" — C1 unitLostBag(Where's my …? / under·in) 위에 쌓는 **발전** 수준 Unit(QA 전용). 순수 데이터.
// 같은 목표(asking-info)·같은 상황 가족(교실에서 물건 찾기)에서 C1과 수행이 어떻게 달라지는지 보여 주기 위한 인접 단계 첫 구현
// (docs/design/CURRICULUM_STAGES_2026-10-08.md §9). 자체 Paul·Mia 이야기, 교육 설계 담당 초안 → 리드 확정, 교사 검수 전.
// C1과의 차이: 학생이 Yes/No 질문(Is it …?)을 직접 만들고, 줄인 부정(No, it isn't.)으로 짧게 답한 뒤, What about …?으로 다른 곳을
// 되묻는 3턴 교환을 맡는다(말하기 발전). 회상 단계는 미아의 되묻기에 다시 답하는 followUp(2차 답 확인)까지. 쓰기는 자기 문장 2~3개(쓰기 발전).
const SPEAKING_STEPS = [
  { kind: 'repeat', titleKo: '따라 하기', lines: [
    { speaker: 'Paul', en: 'Is it under the desk?', ko: '책상 밑에 있어?' },
    { speaker: 'Mia', en: "No, it isn't. What about the bag?", ko: '아니, 없어. 가방은?' },
    { speaker: 'Paul', en: "Yes, it is! It's in the bag.", ko: '응, 있어! 가방 안에 있어.' },
  ] },
  { kind: 'swap', titleKo: '장소 바꿔 묻고 되묻기', frameEn: 'Is it ___ the desk?',
    slots: [{ en: 'under', ko: '밑에' }, { en: 'in', ko: '안에' }, { en: 'on', ko: '위에' }],
    replyFrame: "No, it isn't. What about the ___?",
    replySlots: [{ en: 'bag', ko: '가방' }, { en: 'shelf', ko: '선반' }, { en: 'box', ko: '상자' }], replySpeaker: 'Mia' },
  { kind: 'recall', titleKo: '모범 없이 묻고 되묻기',
    situationKo: '미아의 필통이 안 보여요. 책상 밑을 가리키며 거기 있는지 미아에게 물어요.',
    roleKo: '폴이 되어 미아에게 물어요.',
    model: 'Is it under the desk?',
    reply: { speaker: 'Mia', en: "No, it isn't. What about the bag?", ko: '아니, 없어. 가방은?' },
    alternatives: ['Is it in the desk?', 'Is the pencil case under the desk?'],
    followUp: {
      promptKo: '미아가 되물었어요. 가방을 보고 대답해요(필통이 가방 안에 있어요).',
      model: "Yes, it is! It's in the bag.", ko: '응, 있어! 가방 안에 있어.',
      alternatives: ["Yes! It's in the bag.", "It's in the bag."],
    } },
]

export const UNIT_FIND_AGAIN = {
  id: 'c2-find-together-classroom', course: 'conversation', courseKo: '회화', block: 'C2', goalId: 'asking-info', goalTitleKo: '궁금한 것 묻기', level: 2,
  titleKo: '거기 아니야, 저기는?',
  situationKo: '미술 시간 뒤 미아의 필통이 사라졌어요. 폴과 미아가 번갈아 물으며 함께 찾아요.',
  keyItemId: null,
  performance: { speaking: 'developing', writing: 'developing', grammar: 'developing' },
  profile: {
    prerequisitesKo: ["1단계 \"잃어버린 물건 위치 묻기\"의 Where's my …? / It's under·in …을 모범 없이 말해 본 경험", '책상·가방·의자 같은 교실 물건 이름을 듣고 알아볼 수 있다', '폴·미아 두 사람이 번갈아 말하는 6~7턴 대화를 끝까지 들을 수 있다'],
    canDoKo: ['물건이 있을 것 같은 자리를 Is it under/in/on …?으로 직접 물어 확인한다', "상대 질문에 Yes, it is. / No, it isn't.로 짧게 답한다", '아니라고 답한 뒤 What about the …?으로 다른 장소를 되물어 대화를 이어 간다', '어디에 없었고 어디에 있었는지 자기 문장 2~3개로 쓴다'],
    languageKo: ['어휘: 책상·가방·의자·선반·상자·필통, 밑에·안에·위에', "핵심 표현: Is it under the desk? / No, it isn't. What about the bag? / Yes, it is!", "문법 관찰: It is → Is it …? 뒤집기, isn't = is not, What about + the + 장소?"],
    activitiesKo: ['듣기: 7턴 대화에서 필통이 있던 곳과 미아의 되묻기 방식 찾기', '읽기: 61단어 이야기(세 곳을 차례로 확인) + 근거 있는 3문항', '말하기: 3턴 따라 하기 → 위치 말·장소 칩 바꿔 묻고 되묻기 → 모범 없이 묻기 + 되물음에 대답하기', '쓰기: 없던 곳 두 곳과 있던 곳 한 곳을 자기 문장 2~3개로 쓰기 → 예시 비교 → 고치기'],
    teacherCheckKo: ["모범 없이 Is it …?로 질문을 스스로 만드는가(Where's …?만 쓰면 1단계 수준)", "No, it isn't.처럼 줄인 부정으로 짧게 답하는가(No. 한 단어도 전달은 인정, 문형 칸은 따로)", '상대의 아니라는 답을 듣고 What about …?으로 다른 곳을 되묻는가 — 대화가 끊기지 않는지가 핵심', "쓰기에서 부정문(isn't)과 긍정문(It's)을 섞어 2~3문장을 쓰는가"],
    supportKo: ['실물 필통을 실제로 숨기고, 묻는 쪽·답하는 쪽을 정해 두 문장씩만 주고받기부터 시작한다', "판서 틀 Is it ___ the ___? / No, it isn't. What about the ___?와 장소 칩만 보고 완성하게 한다", '되묻기가 어려우면 What about the bag? 한 문장만 먼저 외워 쓰게 하고, 나중에 장소를 바꾼다', "쓰기는 It isn't ___. 두 줄 + It's ___. 한 줄 세 줄 틀로 시작해도 된다"],
    extensionKo: ['상자 안·선반 위처럼 연습하지 않은 장소 조합으로 숨기기 놀이(묻기 → 답하기 → 되묻기 → 역할 교대)', 'Is it big? / Is it red?처럼 모양·색으로도 Yes/No 확인 질문을 만들어 본다', 'Yes, it is!에 Thank you for helping.처럼 도와준 사람에게 한 문장 더 반응한다'],
    recycleKo: ["1단계 \"잃어버린 물건 위치 묻기\"(Where's my bag? / It's under·in …)의 위치 말과 교실 물건 어휘를 그대로 다시 쓴다", '1단계 "물건 빌리기"의 Thank you 반응을 찾은 뒤 마무리로 재사용', '3단계(하루·시간·집·위치)에서 Is it …? / What about …? 되묻기를 집 안 장소로 다시 쓴다(미제작)'],
  },
  vocab: [
    { en: 'pencil case', ko: '필통' },
    { en: 'desk', ko: '책상' },
    { en: 'bag', ko: '가방' },
    { en: 'chair', ko: '의자' },
    { en: 'shelf', ko: '선반' },
    { en: 'box', ko: '상자' },
    { en: "isn't", ko: '아니야, 없어 (is not)' },
    { en: 'What about', ko: '…은 어때? (되묻기)' },
  ],
  listening: {
    turns: [
      { speaker: 'Mia', en: "Oh no! Where's my pencil case?" },
      { speaker: 'Paul', en: 'Is it under the desk?' },
      { speaker: 'Mia', en: "No, it isn't. What about the bag?" },
      { speaker: 'Paul', en: "No, it isn't. Is it on the shelf?" },
      { speaker: 'Mia', en: "No, it isn't. What about the box?" },
      { speaker: 'Paul', en: "Look! Yes, it is! It's in the box." },
      { speaker: 'Mia', en: 'Thank you, Paul!' },
    ],
    questions: [
      { promptKo: '들은 대화에서 미아의 필통은 결국 어디에 있었나요?', options: ['책상 밑', '상자 안', '선반 위'], correct: 1, whyKo: '여섯 번째 말에서 폴이 "Yes, it is! It\'s in the box."라고 했어요.' },
      { promptKo: '폴이 "책상 밑에 있어?"라고 물었을 때 미아는 어떻게 했나요?', options: ['맞다고 하고 끝냈어요', '아니라고 하고 가방을 되물었어요', '모른다고만 했어요'], correct: 1, whyKo: '세 번째 말에서 미아가 "No, it isn\'t. What about the bag?"이라고 했어요. 아니라고 한 뒤 다른 곳을 바로 되물었어요.' },
    ],
  },
  reading: {
    text: 'After art class, Mia\'s pencil case is gone. Paul helps her. He asks, "Is it under the desk?" Mia looks. "No, it isn\'t. What about the chair?" Paul looks under the chair. It isn\'t there. "What about the shelf?" says Mia. Paul looks on the shelf. "Yes, it is!" The pencil case is on the shelf. Mia says, "Thank you, Paul!"',
    items: [
      { type: 'mc', promptKo: '폴이 가장 먼저 물어본 곳은 어디인가요?', options: ['책상 밑', '의자 밑', '선반 위'], correct: 0, evidence: 'Is it under the desk?' },
      { type: 'mc', promptKo: '필통은 결국 어디에 있었나요?', options: ['의자 밑', '가방 안', '선반 위'], correct: 2, evidence: 'The pencil case is on the shelf.' },
      { type: 'tf', promptKo: '필통은 의자 밑에 있었어요.', answer: false, evidence: 'Paul looks under the chair. It isn\'t there.' },
    ],
  },
  grammar: {
    noticing: [
      { en: 'Is it under the desk?', promptKo: '"거기 있어?" 하고 맞는지 확인할 때, 문장은 어떤 말로 시작하나요?', answerKo: "Is it …?로 시작해요. It is를 뒤집어 Is it으로 두면 \"맞아?\" 하고 확인하는 질문이 돼요. 대답은 Yes, it is. / No, it isn't.처럼 짧게 해요." },
      { en: "No, it isn't. What about the bag?", promptKo: '아니라고 대답한 뒤에, 미아는 어떤 말로 다른 곳을 다시 물었나요?', answerKo: "isn't는 is not을 줄인 말이에요. 그다음 What about the …?으로 다른 장소를 바로 되물으면 대화가 끊기지 않고 이어져요." },
    ],
    items: [
      { promptKo: '선반 위에 있는지 묻는 알맞은 문장은?', options: ['It is on the shelf?', 'Is it on the shelf?', 'Is on the shelf it?'], correct: 1, whyKo: '확인하는 질문은 Is it …? 순서로 말해요. → Is it on the shelf?' },
      { promptKo: '책상 밑에 없어요. 짧게 아니라고 대답하는 알맞은 말은?', options: ["No, it isn't.", 'No, it is.', "No, isn't it."], correct: 0, whyKo: "아니라고 할 때는 No, it isn't.예요. isn't는 is not을 줄인 말이에요." },
      { promptKo: '아니라고 한 뒤 선반을 되묻는 알맞은 말은? (맞는 것이 둘이에요)', options: ['What about the shelf?', 'Is it on the shelf?', 'What the shelf about?'], correct: [0, 1], whyKo: 'What about the shelf?도, Is it on the shelf?도 다른 곳을 되묻는 말이에요. 단어 순서가 바뀐 문장은 어색해요.' },
      // 231차 추가 문항(교사 검수 전)
      { promptKo: "폴: Is it in the box? 미아: ___ It's in the box.", options: ['Yes, it is!', "No, it isn't!", "Yes, it isn't!"], correct: 0, whyKo: '상자 안에 있으니 Yes, it is!이에요. 뒤 문장과 이어져요.' },
      { promptKo: '"Is it under the desk?" 책상 밑에 없어요. 알맞은 대답은?', options: ["No, it isn't.", "Yes, it isn't.", 'No, it is.'], correct: 0, whyKo: "없으면 No, it isn't. Yes와 isn't는 안 어울려요." },
      { promptKo: '책상 밑에 없어요. 대화를 이어 가는 알맞은 대답은?', options: ["No, it isn't. What about the bag?", "No, it isn't. What bag about the?", 'No, it is. What about the bag?'], correct: 0, whyKo: "없으면 No, it isn't. 뒤에 What about the …?로 되물어요." },
    ],
  },
  speaking: { steps: SPEAKING_STEPS },
  // 화면 순서·연결. speaking은 Unit 안 3단계(+ followUp), writing은 inline 문항(자기 문장 2~3개)
  activities: [
    { id: 'vocab', kind: 'vocab', titleKo: '이 상황에 필요한 말', goalKo: '책상·가방·의자·선반·상자와 "아니야", "…은 어때?"를 듣고 알아요.' },
    { id: 'listening', kind: 'listening', titleKo: '미아의 필통은 어디에?', goalKo: '폴과 미아가 번갈아 묻고 되묻는 대화를 듣고 필통이 있는 곳을 찾아요.' },
    { id: 'reading', kind: 'reading', titleKo: '세 곳을 차례로', goalKo: '짧은 이야기를 읽고 어디에 없었고 어디에 있었는지 확인해요.' },
    { id: 'speaking', kind: 'speaking', titleKo: '묻기 → 답하기 → 되묻기', goalKo: '3턴 따라 하기 → 장소 바꿔 묻고 되묻기 → 모범 없이 묻고 되물음에 답하기.', steps: SPEAKING_STEPS },
    { id: 'grammar', kind: 'grammar', titleKo: "Is it …? / No, it isn't. What about …?", goalKo: '확인 질문·짧은 대답·되묻기의 모양을 살펴보고 알맞은 문장을 골라요.' },
    { id: 'writing', kind: 'writing', titleKo: '어디에 없고 어디에 있는지 쓰기', goalKo: '없던 곳과 있던 곳을 자기 문장 2~3개로 쓴 뒤 예시와 비교해 고쳐요.', writingItemId: 'w-c2-find' },
    { id: 'review', kind: 'review', titleKo: '다른 물건, 다른 곳에서', goalKo: '모자·책처럼 물건과 장소가 바뀌어도 묻고, 답하고, 되물어 봐요.' },
  ],
  review: [
    { situationKo: '체육 시간 뒤 미아의 모자가 없어요. 의자 밑에 있는지 물어요.', hintEn: 'chair', model: 'Is it under the chair?', alternatives: ['Is it under your chair?', 'Is the hat under the chair?', 'Is your hat under the chair?'] },
    { situationKo: '폴이 책이 책상 안에 있냐고 물어요. 없어요. 선반을 되물어요.', hintEn: 'shelf', model: "No, it isn't. What about the shelf?", alternatives: ['No. What about the shelf?', "No, it isn't. Is it on the shelf?", "It isn't. What about the shelf?"] },
  ],
  observation: [
    "혼자: 모범을 숨겨도 Is it under/in/on …?으로 확인 질문을 스스로 만들고, No, it isn't.로 짧게 답할 수 있는가(Where's …?만 쓰면 1단계 수준으로 기록).",
    '새 상황에서: 모자·책처럼 물건과 장소가 바뀌어도 Is it …? / What about …? 앞부분은 유지하고 위치 말·장소만 바꾸는가(No. What about … / Is it … 되묻기도 인정).',
    "전달: 상대의 아니라는 답을 듣고 멈추지 않고 다른 곳을 되묻는가, 되물음을 듣고 그 자리를 실제로 확인하고 Yes, it is!로 반응하는가. 대화 이어가기 성공과 isn't/Is it 정확성은 따로 기록.",
  ],
  sources: [
    { kind: 'official', what: '듣기·말하기·읽기·쓰기를 한 Unit에서 연결하는 방향', basis: 'England English programmes of study — 방향 참고(OGL v3, L1 잉글랜드 과정; INTEGRATED_CURRICULUM_IMPL §9). 한국 EFL 진도에 직접 이식하지 않음' },
    { kind: 'research', what: '회상 때 모범 숨기기, 칩 바꾸기 뒤 모범 없이 말하기', basis: 'Karpicke & Roediger 2008(전문 확인, §9). 대학생 단어 실험이라 초등 회화 직접 입증 아님' },
    { kind: 'research', what: '선택지 3개, 한 단계에 새 문형 1개(되묻기)만', basis: 'Sweller et al. 2019(초록 확인, §9 — 원칙 수준). 이 UI의 효과를 검증한 것은 아님' },
    { kind: 'own', what: "C2 \"묻고 답하고 되묻기\" 블록에 asking-info 발전 Unit 배치, C1 위치 말 재사용 + Is it …? / isn't / What about …? 추가", basis: 'courseModel.js CONVERSATION_BLOCKS C2 주제(되묻기)와 PERFORMANCE_LEVELS developing(질문·응답 주고받기 / 자기 문장 2~3개). CURRICULUM_STAGES §9 첫 구현 결정(후보 A), 2026-10-08' },
    { kind: 'own', what: '이야기(미아의 필통 함께 찾기)·듣기 대화·읽기 지문·이해/문형 문항·말하기 3단계·복습 상황·쓰기 문항', basis: '2026-10-08 신규 작성(교육 설계 담당 초안 → 리드 확정), 교사 검수 전. 기존 이야기 회차(ep06 물건 찾기)·C1 unitLostBag과는 별개 문장. 필통의 최종 위치가 듣기(상자)·읽기(선반)·말하기(가방)에서 다른 것은 활동 간 답 이월을 막기 위한 의도' },
  ],
}
