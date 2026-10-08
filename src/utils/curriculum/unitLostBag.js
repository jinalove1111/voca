// 2026-10-08(225차) 통합 과정 두 번째 시범 Unit — 회화 C1 "잃어버린 물건 위치 묻기"(QA 전용). 순수 데이터.
// 공통 템플릿(unitBorrow.js와 같은 계약) 재사용 검증용. 이야기·대화·지문·문항·복습 상황은 전부 이번에 새로 쓴 자체 Paul·Mia 이야기
// (교육 설계 담당 초안 → 리드 확정, 교사 검수 전). 상업 교재의 대화·단원 배열과 무관.
// 핵심 표현 "Where's my bag?" / "It's under the chair."는 기존 이야기 회차에 없으므로 말하기 활동은 Unit 안 3단계(steps)로,
// 쓰기는 inline 문항(w-u2-under)으로 연결한다 — 기존 녹음기·TTS·WritingPractice 화면 재사용, 새 화면 없음.
// 위치 말은 under·in 둘을 핵심으로, on은 선택 확장(물건 바꾸기 칩·어휘·지문에만, 복습 상황은 under·in만).
const SPEAKING_STEPS = [
  { kind: 'repeat', titleKo: '따라 하기', lines: [
    { speaker: 'Paul', en: "Where's my bag?", ko: '내 가방 어디 있어?' },
    { speaker: 'Mia', en: "It's under the chair.", ko: '의자 밑에 있어.' },
  ] },
  { kind: 'swap', titleKo: '물건 바꾸기', frameEn: "Where's my ___?",
    slots: [{ en: 'bag', ko: '가방' }, { en: 'pencil case', ko: '필통' }, { en: 'book', ko: '책' }],
    replyFrame: "It's ___ the chair.", replySlots: [{ en: 'under', ko: '밑에' }, { en: 'on', ko: '위에' }], replySpeaker: 'Mia' },
  { kind: 'recall', titleKo: '모범 없이 묻고 답하기',
    situationKo: '가방이 안 보여요. 미아에게 가방이 어디 있는지 물어요.',
    roleKo: '폴이 되어 미아에게 말해요.',
    model: "Where's my bag?", reply: { speaker: 'Mia', en: "It's under the chair.", ko: '의자 밑에 있어.' },
    alternatives: ['Where is my bag?', 'Have you seen my bag?'] },
]

export const UNIT_LOST_BAG = {
  id: 'c1-lost-bag-classroom', course: 'conversation', courseKo: '회화', block: 'C1', goalId: 'asking-info', goalTitleKo: '정보 묻기', level: 1,
  titleKo: '잃어버린 물건 위치 묻기',
  situationKo: '미술 시간이 끝났는데 폴의 가방이 보이지 않아요. 옆자리 미아에게 물어봐요.',
  keyItemId: null,
  // 227차: 수행 수준(말하기·쓰기 따로) + 교육 프로필. 말하기는 묻고 답하는 짝이 있어 기초~발전 사이지만, 모범 없이 단계가 한 문장(묻기)이라 기초로 둔다
  performance: { speaking: 'basic', writing: 'basic' },
  profile: {
    prerequisitesKo: ['가방·의자·책상 같은 교실 물건·가구 이름을 듣고 알아볼 수 있다', '1단계 "물건 빌리기"처럼 한 문장 부탁을 말해 본 경험(권장, 필수 아님)'],
    canDoKo: ['물건이 안 보일 때 Where\'s my …?로 어디 있는지 묻는다', '상대가 알려 준 위치(under / in)를 듣고 그 자리로 간다', '미아 역할로 It\'s under the chair.처럼 위치를 한 문장으로 알려 준다·쓴다'],
    languageKo: ['어휘: 가방·필통·의자·책상, 밑에(under)·안에(in)·위에(on, 확장)', '핵심 표현: Where\'s my bag? / It\'s under the chair.', '문법 관찰: Where\'s = Where is, It\'s + 위치 말 + 장소'],
    activitiesKo: ['듣기: 5턴 대화에서 가방 위치와 먼저 물어본 곳 찾기', '읽기: 44단어 이야기(필통 찾기) + 근거 있는 3문항', '말하기: 따라 하기 → 물건·위치 칩 바꾸기 → 모범 없이 묻고 답하기(Unit 안 3단계)', '쓰기: 미아 역할로 위치 알려 주는 한 문장 → 예시 비교 → 고치기'],
    teacherCheckKo: ['모범 없이 Where\'s my …?로 묻는가', '모범 없이 It\'s under/in …으로 대답하는가(묻기와 대답하기를 따로 봄)', '상대 대답을 듣고 실제로 그 자리로 가거나 Thank you로 반응하는가; under/in/on 정확성은 별도 칸'],
    supportKo: ['실물을 의자 밑·책상 안에 실제로 놓고 가리키며 under·in 둘만 다룬다(on은 나중)', '판서 틀 Where\'s my ___? / It\'s ___ the ___.와 칩만 보고 완성하게 한다', '복습 2번(대답하기)은 "이번엔 네가 미아"라고 먼저 알려 준다'],
    extensionKo: ['on까지 세 위치 말로 숨기기 놀이(묻기 → 대답 → 찾아가기, 역할 교대)', 'Is it in your desk? / No, it isn\'t.처럼 확인 질문과 짧은 부정 대답까지 맡아 본다', '모자·책처럼 연습하지 않은 물건과 교실 다른 장소로 새 상황에서 말한다'],
    recycleKo: ['1단계 "물건 빌리기"의 교실 물건 어휘(필통)와 Thank you 반응 재사용', '회화 3단계(하루·시간·집·위치)에서 Where\'s …? / It\'s … 틀을 집 안 위치로 다시 쓴다(미제작)'],
  },
  vocab: [
    { en: 'bag', ko: '가방' },
    { en: 'pencil case', ko: '필통' },
    { en: 'chair', ko: '의자' },
    { en: 'desk', ko: '책상' },
    { en: 'under', ko: '~ 밑에' },
    { en: 'in', ko: '~ 안에' },
    { en: 'on', ko: '~ 위에' },
  ],
  listening: {
    turns: [
      { speaker: 'Paul', en: "Oh no! Where's my bag?" },
      { speaker: 'Mia', en: 'Is it in your desk?' },
      { speaker: 'Paul', en: "No, it isn't." },
      { speaker: 'Mia', en: "Look! It's under the chair." },
      { speaker: 'Paul', en: 'Oh, yes! Thank you, Mia.' },
    ],
    questions: [
      { promptKo: '들은 대화에서 폴의 가방은 어디에 있었나요?', options: ['책상 안', '의자 밑', '문 옆'], correct: 1, whyKo: '네 번째 말에서 미아가 "It\'s under the chair."라고 했어요.' },
      { promptKo: '미아가 먼저 물어본 곳은 어디인가요?', options: ['문 옆', '의자 밑', '책상 안'], correct: 2, whyKo: '미아가 "Is it in your desk?"라고 묻자 폴이 "No, it isn\'t."라고 했어요.' },
    ],
  },
  reading: {
    text: 'After art class, Paul looks for his pencil case. It is not in his bag. It is not on the desk. Mia says, "Look under your book!" Paul looks under the book. The pencil case is there! He says, "Thank you, Mia!"',
    items: [
      { type: 'mc', promptKo: '폴이 찾는 물건은 무엇인가요?', options: ['가방', '필통', '책'], correct: 1, evidence: 'Paul looks for his pencil case.' },
      { type: 'mc', promptKo: '필통은 어디에 있었나요?', options: ['책 밑', '책상 위', '의자 위'], correct: 0, evidence: 'Paul looks under the book.' },
      { type: 'tf', promptKo: '필통은 가방 안에 있었어요.', answer: false, evidence: 'It is not in his bag.' },
    ],
  },
  grammar: {
    noticing: [
      { en: "Where's my bag?", promptKo: '물건이 있는 곳을 물을 때, 문장은 어떤 말로 시작하나요?', answerKo: 'Where\'s …?로 시작하면 "…은 어디에 있어?"라는 뜻이에요. Where\'s는 Where is를 줄인 말이고, 끝에 물음표를 써요.' },
      { en: "It's under the chair. / It's in the bag.", promptKo: '두 대답에서 서로 다른 부분은 어디인가요?', answerKo: "바뀐 건 under/in과 장소 말뿐이에요. It's는 그대로 두고 위치 말과 장소만 바꿔요." },
    ],
    items: [
      { promptKo: '가방이 의자 밑에 있어요. 빈칸에 알맞은 말은? It\'s ___ the chair.', options: ['under', 'in', 'on'], correct: 0, whyKo: '"~ 밑에"는 under예요. → It\'s under the chair.' },
      { promptKo: '가방이 있는 곳을 묻는 알맞은 문장은? (맞는 것이 둘이에요)', options: ["Where's my bag?", 'Where is my bag?', 'Where my bag is?'], correct: [0, 1], whyKo: "Where's는 Where is를 줄인 말이라 둘 다 맞아요. 'Where my bag is?'는 단어 순서가 어색해요." },
      { promptKo: '필통이 가방 안에 있다고 대답하는 알맞은 문장은?', options: ['It in the bag.', "It's in the bag.", 'Is in the bag.'], correct: 1, whyKo: "대답은 It's … 로 시작해요(It is의 줄임말). → It's in the bag." },
    ],
  },
  speaking: { steps: SPEAKING_STEPS },
  // 화면 순서·연결. speaking은 Unit 안 3단계(steps), writing은 inline 문항
  activities: [
    { id: 'vocab', kind: 'vocab', titleKo: '이 상황에 필요한 말', goalKo: '가방·필통·의자·책상과 "밑에", "안에", "위에"를 듣고 알아요.' },
    { id: 'listening', kind: 'listening', titleKo: '폴의 가방은 어디에?', goalKo: '폴과 미아의 대화를 듣고 가방이 있는 곳을 찾아요.' },
    { id: 'reading', kind: 'reading', titleKo: '사라진 필통', goalKo: '짧은 이야기를 읽고 필통이 있던 곳을 확인해요.' },
    { id: 'speaking', kind: 'speaking', titleKo: '따라 하기 → 묻고 답하기', goalKo: '따라 하기 → 물건 바꾸기 → 모범 없이 묻고 답하기.', steps: SPEAKING_STEPS },
    { id: 'grammar', kind: 'grammar', titleKo: "Where's …? / It's under …", goalKo: '묻는 말과 대답의 모양을 살펴보고 알맞은 문장을 골라요.' },
    { id: 'writing', kind: 'writing', titleKo: '가방이 어디 있는지 쓰기', goalKo: '상황을 보고 직접 쓴 뒤 예시와 비교해 고쳐요.', writingItemId: 'w-u2-under' },
    { id: 'review', kind: 'review', titleKo: '다른 물건, 다른 곳에서', goalKo: '책·모자처럼 물건과 장소가 바뀌어도 같은 말로 묻고 답해 봐요.' },
  ],
  review: [
    { situationKo: '체육 시간 뒤에 모자가 안 보여요. 미아에게 어디 있는지 물어요.', hintEn: 'hat', model: "Where's my hat?", alternatives: ['Where is my hat?', 'Have you seen my hat?'] },
    { situationKo: '미아가 책이 어디 있냐고 물어요. 책은 책상 안에 있어요. 대답해요.', hintEn: 'desk', model: "It's in the desk.", alternatives: ['It is in the desk.', 'In the desk.'] },
  ],
  observation: [
    "혼자: 모범을 숨겨도 Where's my …?로 물건이 있는 곳을 묻고, It's under/in …으로 대답할 수 있는가.",
    '새 상황에서: 모자·책처럼 물건과 장소가 바뀌어도 Where\'s …? / It\'s … 앞부분은 유지하고 물건·위치 말만 바꾸는가(Where is … / Have you seen … 등도 인정).',
    '전달: 상대의 대답(It\'s under the chair.)을 듣고 물건이 있는 곳으로 가거나 Thank you로 반응하는가. 전달 성공과 under/in/on 정확성은 따로 기록.',
  ],
  sources: [
    { kind: 'official', what: '듣기·말하기·읽기·쓰기를 한 Unit에서 연결하는 방향', basis: 'England English programmes of study — 방향 참고(원문 미확인, 224차와 동일 상태). 한국 EFL 진도에 직접 이식하지 않음' },
    { kind: 'research', what: '회상 때 모범 숨기기, 물건 바꾸기 뒤 모범 없이 말하기', basis: 'Karpicke & Roediger 2008(초록 확인). 대학생 단어 실험이라 초등 회화 직접 입증 아님' },
    { kind: 'research', what: '선택지 3개, 한 단계에 위치 말 1~2개만', basis: 'Sweller et al. 2019(미확인·방향만). 이 UI의 효과를 검증한 것은 아님' },
    { kind: 'own', what: 'C1에 정보 묻기(asking-info) 두 번째 Unit 배치, under·in 핵심 + on 확장', basis: '설계안 v1 §3·§5(운영 가안)에서 위치 표현은 원래 C3 블록이지만, 운영자가 두 번째 시범 Unit으로 지정(2026-10-08) — 템플릿 재사용 검증 목적. 교육 설계 담당 메모' },
    { kind: 'own', what: '이야기(폴의 가방·필통 찾기)·듣기 대화·읽기 지문·이해/문형 문항·말하기 3단계·복습 상황', basis: '2026-10-08 신규 작성(교육 설계 담당 초안 → 리드 확정), 교사 검수 전. 기존 이야기 회차(ep06 물건 찾기)와는 별개 문장' },
  ],
}
