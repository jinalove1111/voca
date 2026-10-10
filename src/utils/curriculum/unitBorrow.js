// 2026-10-08(224차) 통합 과정 시범 Unit — 회화 C1 "교실에서 필요한 물건 빌리기"(QA 전용). 순수 데이터.
// 이야기·핵심 표현은 기존 2화(storyEpisodes s02-01~04, keySentence ep02)를 그대로 쓰고, 듣기 대화·읽기 지문·이해/문형 문항·복습 상황만
// 이번에 새로 썼다(교육 설계 담당 초안 → 리드 확정, 교사 검수 전). 상업 교재의 대화·문항·단원 배열과 무관(자체 Paul·미아 이야기).
// 말하기·쓰기는 기존 화면(KeySentenceFlow ep02, 연습 s02-03/s02-04, WritingPractice w-s02-03)으로 연결한다 — 중복 구현 없음.
// 근거 구분(sources.kind): official = 공식 교육 목표 참고, research = 연구 근거(방향만), own = 자체 설계 결정.
export const UNIT_BORROW = {
  id: 'c1-borrow-classroom', course: 'conversation', courseKo: '회화', block: 'C1', goalId: 'requesting', goalTitleKo: '요청하기', level: 1,
  titleKo: '교실에서 필요한 물건 빌리기',
  situationKo: '미술 시간, 폴의 필통을 열었더니 연필 대신 숟가락이 나왔어요. 앞자리 미아에게 필요한 물건을 빌려요.',
  keyItemId: 's02-03',
  // 227차: 수행 수준(말하기·쓰기 따로) + 교육 프로필(운영자 지시 8항목). 기초 = 한 문장 말하기 / 문장 틀 완성·한 문장
  performance: { speaking: 'basic', writing: 'basic', grammar: 'basic' },
  profile: {
    prerequisitesKo: ['교실 물건 이름(연필·지우개·필통) 몇 개를 듣고 알아볼 수 있다', '폴·미아 두 사람의 짧은 대화를 끝까지 들을 수 있다'],
    canDoKo: ['필요한 물건이 없을 때 짝에게 한 문장으로 빌려 달라고 말한다', '상대의 Sure. Here you are!에 Thank you로 반응한다', '같은 부탁을 다른 물건으로 바꿔 말하거나 쓴다'],
    languageKo: ['어휘: 연필·지우개·필통·숟가락·자·공, 없어·여기 있어', '핵심 표현: Can I borrow a pencil? / Can I borrow your rubber?', '문법 관찰: Can I …? 부탁 틀, 물건 말만 바뀜(관사·소유는 가볍게)'],
    activitiesKo: ['듣기: 6턴 대화를 듣고 미아의 연필 수·다음 물건 찾기', '읽기: 43단어 이야기 + 근거 있는 3문항', '말하기: 따라 하기 → 영어 숨기고 회상 → 새 상황(기존 2화 흐름)', '쓰기: 상황만 보고 한 문장 쓰기 → 예시 비교 → 고치기'],
    teacherCheckKo: ['모범을 숨겨도 Can I borrow …?로 시작해 말하는가', '물건이 바뀌어도 앞부분을 유지하는가(Could I / Can I use도 인정)', '상대 응답을 알아듣고 반응하는가(전달 성공과 문형 정확성은 따로)'],
    supportKo: ['판서 틀 Can I borrow ___?와 물건 카드만 보고 완성하게 한다(지원 단계: 단서로)', '실물 연필·지우개를 들고 짝과 주고받기부터 시작한다', '읽기 지문의 There is / hasn\'t got은 뜻만 확인하고 넘어간다'],
    extensionKo: ['빌린 물건을 돌려주며 한 문장 더(Here you are. Thank you!)', '교실 밖 물건(공·자)으로 같은 부탁을 새 상황에서 말한다', '미아 역할로 응답(Sure. / Sorry, I need it.)까지 맡아 본다'],
    recycleKo: ['2화 이야기의 상황(필통 속 숟가락)과 기존 말하기 연습 s02-03·s02-04 재사용', '다음 단계(2단계 교실 물건 주인 묻기)에서 Can I borrow …?를 되묻기와 함께 다시 쓴다'],
  },
  vocab: [
    { en: 'pencil', ko: '연필' },
    { en: 'rubber', ko: '지우개' },
    { en: 'pencil case', ko: '필통' },
    { en: 'spoon', ko: '숟가락' },
    { en: 'borrow', ko: '빌리다' },
    { en: "haven't got", ko: '(나는) 없어' },
    { en: 'Here you are', ko: '여기 있어' },
    { en: 'ruler', ko: '자' },
    { en: 'ball', ko: '공' },
  ],
  listening: {
    turns: [
      { speaker: 'Paul', en: "I haven't got a pencil." },
      { speaker: 'Mia', en: "Oh no! I've got lots." },
      { speaker: 'Paul', en: 'Can I borrow a pencil?' },
      { speaker: 'Mia', en: 'Sure. Here you are!' },
      { speaker: 'Paul', en: 'Thank you. Can I borrow your rubber?' },
      { speaker: 'Mia', en: 'Sure. Here you go.' },
    ],
    questions: [
      { promptKo: '들은 대화에서 미아는 연필이 얼마나 있다고 했나요?', options: ['하나도 없어요', '하나 있어요', '많이 있어요'], correct: 2, whyKo: '두 번째 말에서 미아가 "I\'ve got lots."(많이 있어)라고 했어요.' },
      { promptKo: '들은 대화에서 폴이 연필 다음으로 필요한 물건은?', options: ['연필', '지우개', '숟가락'], correct: 1, whyKo: '다섯 번째 말에서 폴이 "Can I borrow your rubber?"라고 했어요.' },
    ],
  },
  reading: {
    text: 'Paul opens his pencil case. There is a spoon in it! He hasn\'t got a pencil. Mia has lots of pencils. Paul asks, "Can I borrow a pencil?" Mia says, "Sure. Here you are!" Paul says thank you. Now he can draw.',
    items: [
      { type: 'mc', promptKo: '폴의 필통에는 무엇이 있었나요?', options: ['연필', '숟가락', '지우개'], correct: 1, evidence: 'There is a spoon in it!' },
      { type: 'mc', promptKo: '폴은 미아에게 무엇을 빌려 달라고 했나요?', options: ['숟가락', '지우개', '연필'], correct: 2, evidence: 'Paul asks, "Can I borrow a pencil?"' },
      { type: 'tf', promptKo: '미아는 연필이 없어요.', answer: false, evidence: 'Mia has lots of pencils.' },
    ],
  },
  grammar: {
    noticing: [
      { en: 'Can I borrow a pencil?', promptKo: '미아의 물건을 써도 되는지 물을 때, 문장은 어떤 말로 시작하나요?', answerKo: 'Can I … ?로 시작하면 "…해도 돼?" 하고 부탁하는 말이에요. 끝에 물음표를 써요.' },
      { en: 'Can I borrow a pencil? / Can I borrow your rubber?', promptKo: '두 문장에서 서로 다른 부분은 어디인가요?', answerKo: '바뀐 건 물건 말뿐이에요. 앞부분 Can I borrow는 그대로 두고 필요한 물건만 바꿔요.' },
    ],
    items: [
      { promptKo: '빈칸에 알맞은 말은? Can I borrow ___?', options: ['a pencil', 'pencil', 'a pencils'], correct: 0, whyKo: '연필 한 자루를 말할 때는 a pencil이라고 해요. → Can I borrow a pencil?' },
      { promptKo: '친구에게 연필을 빌려 달라고 하는 알맞은 문장은?', options: ['Can I borrow a pencil?', 'Can I borrowing a pencil?', 'Can borrow I a pencil?'], correct: 0, whyKo: '물어볼 때는 Can I borrow …? 순서로 말해요. → Can I borrow a pencil?' },
      { promptKo: '지우개를 빌려 달라고 할 때 알맞은 문장은? (맞는 것이 둘이에요)', options: ['Could I borrow your rubber?', 'Can I borrow your rubber?', 'Can borrow I your rubber?'], correct: [0, 1], whyKo: 'Could I …?도 Can I …?처럼 정중한 부탁이에요. 단어 순서가 바뀐 문장은 어색해요.' },
      // 231차 추가 문항(교사 검수 전)
      { promptKo: '빈칸에 알맞은 말은? Can I borrow ___ ball?', options: ['your', 'yours', 'you'], correct: 0, whyKo: '"너의 공"은 your ball이에요. → Can I borrow your ball?' },
      { promptKo: '자를 빌려 달라고 하는 알맞은 문장은?', options: ['Can I borrow your ruler?', 'Borrow I can your ruler?', 'Can your I borrow ruler?'], correct: 0, whyKo: '순서는 Can I borrow …? 이고 끝에 물음표(?)를 써요.' },
      { promptKo: '단어 순서가 틀린 문장은 어느 것일까요?', options: ['Can I borrow a pencil?', 'Can borrow I your ball?', 'Can I borrow your rubber?'], correct: 1, whyKo: 'Can I borrow 순서여야 해요. Can borrow I는 틀렸어요.' },
    ],
  },
  speaking: {
    steps: [
      { step: '따라 하기', itemIds: ['s02-03'], flow: 'KeySentenceFlow ep02 watch', note: '"Can I borrow a pencil?"을 모범 음성과 함께 따라 해요.' },
      { step: '물건 바꿔 말하기', itemIds: ['s02-03', 's02-04'], flow: 'SpeakingPracticeMode ep02', note: 'Can I borrow a pencil? → Can I borrow your rubber?로 물건만 바꿔요(기존 연습 문항 재사용, 새 문항 없음).' },
      { step: '혼자 요청하기', itemIds: ['s02-03'], flow: 'KeySentenceFlow ep02 recall → transfer', note: '모범을 숨기고 말한 뒤, 필통을 두고 온 다음 날 상황에서 다시 말해요.' },
    ],
  },
  // 화면 순서·연결(설계안 §3). speaking/writing은 기존 화면으로
  activities: [
    { id: 'vocab', kind: 'vocab', titleKo: '이 상황에 필요한 말', goalKo: '연필·지우개·필통·숟가락과 "없어", "여기 있어"를 듣고 알아요.' },
    { id: 'listening', kind: 'listening', titleKo: '폴에게 무엇이 필요할까?', goalKo: '폴과 미아의 대화를 듣고 필요한 물건을 찾아요.' },
    { id: 'reading', kind: 'reading', titleKo: '숟가락이 든 필통', goalKo: '짧은 이야기를 읽고 무슨 일인지 확인해요.' },
    { id: 'speaking', kind: 'speaking', titleKo: '따라 말하기 → 혼자 요청하기', goalKo: '한 문장 이야기: 듣고 따라 하기 → 영어를 숨기고 떠올리기 → 다른 상황에서 다시.', flow: 'key', setId: 'ep02' },
    { id: 'grammar', kind: 'grammar', titleKo: 'Can I borrow …?', goalKo: '부탁하는 말의 모양을 살펴보고 알맞은 문장을 골라요.' },
    { id: 'writing', kind: 'writing', titleKo: '연필을 빌려 달라고 쓰기', goalKo: '상황을 보고 직접 쓴 뒤 예시와 비교해 고쳐요.', writingItemId: 'w-s02-03' },
    { id: 'review', kind: 'review', titleKo: '다른 물건, 다른 곳에서', goalKo: '자·공처럼 물건이 바뀌어도 같은 부탁을 말해 봐요.' },
  ],
  review: [
    { situationKo: '수학 시간에 자가 필요한데 내 필통에 없어요. 짝에게 말해요.', hintEn: 'ruler', model: 'Can I borrow your ruler?', alternatives: ['Could I borrow your ruler?', 'Can I borrow a ruler?', 'Can I use your ruler?'] },
    { situationKo: '쉬는 시간에 놀고 싶은데 공이 없어요. 공 가진 친구에게 말해요.', hintEn: 'ball', model: 'Can I borrow your ball?', alternatives: ['Could I borrow your ball?', 'Can I borrow a ball?', 'Can I use your ball?', 'Can I play with your ball?'] },
  ],
  observation: [
    '혼자: 모범을 숨겨도 Can I borrow …?로 시작해 요청을 말하거나 쓸 수 있는가.',
    '새 상황에서: 자·공처럼 물건과 장소가 바뀌어도 앞부분은 유지하고 물건만 바꾸는가(Could I … / Can I use … 등도 인정).',
    '전달: 미아의 응답(Sure. Here you are!)을 알아듣고 Thank you 등으로 반응하는가. 전달 성공과 문형 정확성은 따로 기록.',
  ],
  sources: [
    { kind: 'official', what: '듣기·말하기·읽기·쓰기를 한 Unit에서 연결하는 방향', basis: 'England English programmes of study — 방향 참고(이 세션은 Languages KS2만 원문 확인; English PoS는 미확인). 한국 EFL 진도에 직접 이식하지 않음(설계안 §15)' },
    { kind: 'research', what: '선택지 3개, 모범 뒤 단서 줄이기, 화면 요소 최소화', basis: 'Sweller et al. 2019(미확인·방향만). 이 UI의 효과를 검증한 것은 아님' },
    { kind: 'research', what: '회상 때 모범 숨기기, 복습을 다음 회차에', basis: 'Karpicke & Roediger 2008(초록 확인), Cepeda et al. 2008(미확인). 대학생 단어 실험·최적 간격은 보편적이지 않음' },
    { kind: 'research', what: '이야기와 어휘를 함께 제공', basis: 'Fricke et al. 2013(미확인). 어린 아동 중재 연구라 연령 일반화 불가' },
    { kind: 'own', what: 'Unit 구성 순서와 C1에 Can I borrow…? 배치', basis: '설계안 v1 §3·§5(운영 가안)' },
    { kind: 'own', what: '목표 requesting·레벨 1·기존 2화 문장 재사용', basis: 'commGoals.js, storyEpisodes.js ep02(자체 이야기, 상업 교재 미사용)' },
    { kind: 'own', what: '듣기 대화·읽기 지문·이해 문항·문형 문항·복습 상황', basis: '2026-10-08 신규 작성(교육 설계 담당 초안 → 리드 확정), 교사 검수 전' },
  ],
}
