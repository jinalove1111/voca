// Middle School scenes (content draft 2026-10-10, teacher review pending)
const PH = '그림을 보고 빈칸에 알맞은 말을 고르세요.'

// ---- g-mid-01: same actor, three times ----
const soccer = (labelKo, action = 'play') => [{ obj: 'paul', action, labelKo }, { obj: 'ball', at: 'next to', ref: 'paul' }]
const sp = [{ obj: 'paul' }, { obj: 'ball', at: 'next to', ref: 'paul' }]
const tl3 = [
  { labelKo: '어제', layout: soccer('폴') },
  { labelKo: '오늘', layout: soccer('폴') },
  { labelKo: '내일', layout: soccer('폴', 'think') },
]

// ---- g-mid-02: school rules (three situations) ----
const stayHome = [{ obj: 'house' }, { obj: 'paul', at: 'in front of', ref: 'house' }, { obj: 'mia', at: 'next to', ref: 'paul' }]
const sunnyPlay = [{ obj: 'paul', action: 'play' }, { obj: 'ball', at: 'next to', ref: 'paul' }, { obj: 'mia', at: 'next to', ref: 'paul' }]
const askLayout = [{ obj: 'kid', action: 'wave', labelKo: '허락을 구하는 학생' }, { obj: 'window', at: 'next to', ref: 'kid' }, { obj: 'teacher', labelKo: '선생님' }]
const dutyLayout = [{ obj: 'teacher', labelKo: '꼭 해야 해요' }, { obj: 'board' }, { obj: 'homework', at: 'on', ref: 'board' }]
const winKid = [{ obj: 'kid', action: 'wave' }, { obj: 'window', at: 'next to', ref: 'kid' }, { obj: 'teacher' }]
const winKidIdle = [{ obj: 'kid' }, { obj: 'window', at: 'next to', ref: 'kid' }, { obj: 'teacher' }]
const winKidOpen = [{ obj: 'kid', action: 'open' }, { obj: 'window', at: 'next to', ref: 'kid' }, { obj: 'teacher' }]
const lA = { layout: winKid, lines: [{ who: 'kid', ko: '창문을 열어도 될까요?' }] }
const lB = { layout: winKidIdle, lines: [{ who: 'teacher', ko: '창문을 열면 안 돼요.' }] }
const lD = { layout: winKidOpen, lines: [{ who: 'teacher', ko: '창문을 꼭 열어야 해요.' }] }
const banLayout = [{ obj: 'teacher', labelKo: '하면 안 돼요' }, { obj: 'door', at: 'next to', ref: 'teacher' }]

export default {
  // ============================== g-mid-01 시제 ==============================
  'g-mid-01': {
    scene: {
      id: 'mid01-timeline', mode: 'add', titleKo: '폴의 축구 시간표', bgKo: '운동장', bg: 'park',
      characters: ['paul', 'teacher'],
      objects: {
        paul: { en: 'Paul', ko: '폴' },
        ball: { en: 'ball', enPlural: 'balls', ko: '공' },
        teacher: { en: 'teacher', enPlural: 'teachers', ko: '선생님' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'timeline',
          promptKo: '같은 폴이 어제·오늘·내일 무엇을 할까요? 가운데 "오늘" 칸의 폴을 눌러 보세요.',
          panels: tl3, focus: 1,
          tap: { obj: 'paul', en: 'I play soccer today.', ko: '나는 오늘 축구를 해.' },
          noteKo: '오늘 하는 일이나 늘 하는 일은 play처럼 원래 모양으로 말해요. 때를 나타내는 말(today)이 힌트예요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '어제의 폴과 내일의 폴을 비교해 보세요. 동사 모양이 어떻게 다를까요?',
          left: { layout: soccer('어제의 폴'), en: 'I played soccer yesterday.', ko: '나는 어제 축구를 했어.' },
          right: { layout: soccer('내일의 폴', 'think'), en: 'I will play soccer tomorrow.', ko: '나는 내일 축구를 할 거야.' },
          explainKo: ['지난 일(yesterday)은 played처럼 동사 모양이 바뀌어요.', '앞으로의 일(tomorrow)은 will + play예요. will 뒤에는 동사 원래 모양을 써요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { promptKo: PH + ' ("어제" 칸을 보세요)', view: 'timeline', panels: tl3, focus: 0,
              frame: 'Paul ___ soccer.', options: ['played', 'plays', 'will play'], correct: 0,
              whyKo: '"어제" 칸이라 지난 일이에요. 과거 모양 played를 써요.' },
            { promptKo: PH + ' ("내일" 칸을 보세요)', view: 'timeline', panels: tl3, focus: 2,
              frame: 'Paul ___ soccer.', options: ['played', 'plays', 'will play'], correct: 2,
              whyKo: '"내일" 칸이라 앞으로의 일이에요. will + play를 써요.' },
            { promptKo: PH + ' (선생님의 질문과 폴의 대답을 읽어 보세요)', view: 'dialogue',
              layout: [{ obj: 'teacher', labelKo: '선생님' }, { obj: 'paul', labelKo: '폴' }],
              lines: [
                { who: 'teacher', ko: '폴, 어제 축구했니?', en: 'Did you play soccer?' },
                { who: 'paul', ko: '아니요, 어제는 축구를 안 했어요.' },
              ],
              frame: 'I ___ play soccer yesterday.', options: ["didn't", "don't", 'will'], correct: 0,
              whyKo: "어제 안 했다는 과거의 부정이라서 didn't를 써요. 뒤에는 동사 원래 모양 play가 와요." },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'I played soccer yesterday.', view: 'dialogue', layout: sp, lines: [{ who: 'paul', ko: '어제 축구를 했어요.' }] },
            { en: 'I play soccer today.', view: 'dialogue', layout: sp, lines: [{ who: 'paul', ko: '오늘 축구를 해요.' }] },
            { en: 'I will play soccer tomorrow.', view: 'dialogue', layout: sp, lines: [{ who: 'paul', ko: '내일 축구를 할 거예요.' }] },
          ] },
      ],
    },
    wordsAdd: [{ en: 'plays', ko: '(운동을) 한다' }],
  },

  // ============================== g-mid-02 can·may·must ==============================
  'g-mid-02': {
    scene: {
      id: 'mid02-school-rules', mode: 'add', titleKo: '우리 반 규칙', bgKo: '교실', bg: 'school',
      characters: ['teacher', 'kid', 'paul'],
      objects: {
        teacher: { en: 'teacher', enPlural: 'teachers', ko: '선생님' },
        kid: { en: 'kid', enPlural: 'kids', ko: '학생' },
        paul: { en: 'Paul', ko: '폴' },
        window: { en: 'window', enPlural: 'windows', ko: '창문' },
        door: { en: 'door', enPlural: 'doors', ko: '문' },
        board: { en: 'board', enPlural: 'boards', ko: '칠판' },
        homework: { en: 'homework', ko: '숙제' },
        phone: { en: 'phone', enPlural: 'phones', ko: '휴대폰' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '교실이 더워요. 학생이 선생님께 정중하게 물어요. 학생을 눌러 보세요.',
          layout: askLayout,
          lines: [{ who: 'kid', ko: '선생님, 너무 더워요.' }, { who: 'teacher', ko: '그래, 부탁할 때는 정중하게 말해 보렴.' }],
          tap: { obj: 'kid', en: 'May I open the window?', ko: '창문을 열어도 될까요?' },
          noteKo: 'May I …?는 "…해도 될까요?" 하고 정중하게 허락을 구하는 말이에요. 뒤에는 동사 원래 모양을 써요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 규칙을 비교해 보세요. 하나는 꼭 해야 하고, 하나는 하면 안 돼요.',
          left: { layout: dutyLayout, en: 'You must do your homework.', ko: '너는 숙제를 꼭 해야 해.' },
          right: { layout: banLayout, en: "You mustn't open the door.", ko: '너는 문을 열면 안 돼.' },
          explainKo: ['must는 "꼭 해야 한다"는 의무예요. 뒤에 to 없이 동사 원래 모양을 써요.', "mustn't는 \"하면 안 된다\"는 금지예요. 허락(해도 돼요)과 헷갈리지 마세요."] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { promptKo: '선생님이 휴대폰 규칙을 말해요. ' + PH, view: 'dialogue',
              layout: [{ obj: 'teacher', labelKo: '선생님' }, { obj: 'kid', labelKo: '학생' }, { obj: 'phone', at: 'next to', ref: 'kid' }],
              lines: [{ who: 'teacher', ko: '수업 중에는 휴대폰을 쓰면 안 돼요.' }],
              frame: 'You ___ use the phone.', options: ['must', "mustn't", 'may'], correct: 1,
              whyKo: "쓰면 안 된다는 금지라서 mustn't를 써요." },
            { promptKo: '학생이 선생님께 정중하게 허락을 구해요. ' + PH, view: 'dialogue',
              layout: askLayout,
              lines: [{ who: 'kid', ko: '(정중하게) 창문을 열어도 될까요?' }],
              frame: '___ I open the window?', options: ['Am', 'Must', 'May'], correct: 2,
              whyKo: '"해도 될까요?" 하고 허락을 구할 때는 May I + 동사 원래 모양이에요.' },
            { promptKo: '칠판에 오늘 숙제가 적혀 있어요. ' + PH, view: 'dialogue',
              layout: dutyLayout,
              lines: [{ who: 'teacher', ko: '이 숙제는 내일까지 꼭 해 와야 해요.' }],
              frame: 'You ___ do your homework.', options: ['must', "mustn't", 'may'], correct: 0,
              whyKo: '꼭 해야 하는 의무라서 must를 써요.' },
          ] },

        { kind: 'listen', stepKo: '듣기',
          items: [
            { en: 'May I open the window?', view: 'dialogue', options: [lA, lB, lD], correct: 0,
              whyKo: '"해도 될까요?" 하고 정중하게 허락을 구하는 말이라서, 학생이 손을 들고 묻는 그림이에요.' },
            { en: 'You must open the window.', view: 'dialogue', options: [lB, lD, lA], correct: 1,
              whyKo: 'must는 꼭 해야 하는 의무예요. 선생님이 꼭 열어야 한다고 말하고 학생이 여는 그림이에요.' },
            { en: "You mustn't open the window.", view: 'dialogue', options: [lD, lA, lB], correct: 2,
              whyKo: "mustn't는 하면 안 된다는 금지예요. 선생님이 열면 안 된다고 말하는 그림이에요." },
          ] },
      ],
    },
    wordsAdd: [{ en: 'use', ko: '쓰다, 사용하다' }],
  },

  // ============================== g-mid-03 수동태 ==============================
  'g-mid-03': {
    scene: {
      id: 'mid03-who-does-it', mode: 'add', titleKo: '누가 했을까?', bgKo: '교실', bg: 'school',
      characters: ['paul', 'mia', 'mom'],
      objects: {
        paul: { en: 'Paul', ko: '폴' },
        mia: { en: 'Mia', ko: '미아' },
        mom: { en: 'Mom', ko: '엄마' },
        window: { en: 'window', enPlural: 'windows', ko: '창문' },
        desk: { en: 'desk', enPlural: 'desks', ko: '책상' },
        cake: { en: 'cake', enPlural: 'cakes', ko: '케이크' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견',
          promptKo: '엄마가 케이크를 만들었어요. 이번에는 케이크가 주인공이에요. 케이크를 눌러 보세요.',
          layout: [{ obj: 'mom', action: 'cook', labelKo: '만든 사람' }, { obj: 'cake', at: 'next to', ref: 'mom', labelKo: '만들어진 것' }],
          tap: { obj: 'cake', en: 'The cake is made by Mom.', ko: '케이크는 엄마에 의해 만들어져.' },
          noteKo: '"…된다/…당한다"는 is·are + -ed 말이에요. 받는 쪽(케이크)을 먼저 말하고, 한 사람(엄마)은 by 뒤에 써요. 지금 만드는 중이 아니라 "엄마가 만든다"는 사실을 말하는 문장이에요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '같은 그림을 두 가지 방법으로 말해요. 누가 주인공일까요?',
          left: { layout: [{ obj: 'paul', action: 'open', labelKo: '하는 사람' }, { obj: 'window', at: 'next to', ref: 'paul' }], en: 'Paul opens the window.', ko: '폴이 창문을 열어.' },
          right: { layout: [{ obj: 'paul', action: 'open', labelKo: '하는 사람' }, { obj: 'window', at: 'next to', ref: 'paul' }], en: 'The window is opened by Paul.', ko: '창문은 폴에 의해 열려.' },
          explainKo: ['왼쪽 문장은 하는 사람(폴)이 주인공이에요.', '오른쪽 문장은 열리는 창문이 주인공이라서 is + opened를 쓰고, 한 사람은 by Paul로 말해요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { promptKo: PH, layout: [{ obj: 'paul', action: 'open', labelKo: '폴' }, { obj: 'window', n: 1, at: 'next to', ref: 'paul' }],
              frame: 'The window ___ opened by Paul.', options: ['is', 'are', 'am'], correct: 0,
              whyKo: '창문이 하나라서 is를 써요.' },
            { promptKo: PH, layout: [{ obj: 'mia', action: 'clean', labelKo: '미아' }, { obj: 'desk', n: 3, at: 'next to', ref: 'mia' }],
              frame: 'The ___ cleaned by Mia.', options: ['desks are', 'desk is', 'desks is'], correct: 0,
              whyKo: '책상이 세 개라서 desks are를 써요. 여러 개일 때는 desks와 are가 짝이에요.' },
            { promptKo: PH, layout: [{ obj: 'mom', action: 'cook', labelKo: '엄마' }, { obj: 'cake', at: 'next to', ref: 'mom' }],
              frame: 'The cake is made ___ Mom.', options: ['by', 'in', 'at'], correct: 0,
              whyKo: '만든 사람(하는 사람)은 by 뒤에 말해요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'The window is opened by Paul.', layout: [{ obj: 'paul', action: 'open', labelKo: '폴' }, { obj: 'window', at: 'next to', ref: 'paul' }] },
            { en: 'The desks are cleaned by Mia.', layout: [{ obj: 'mia', action: 'clean', labelKo: '미아' }, { obj: 'desk', n: 2, at: 'next to', ref: 'mia' }] },
            { en: 'The cake is made by Mom.', layout: [{ obj: 'mom', action: 'cook', labelKo: '엄마' }, { obj: 'cake', at: 'next to', ref: 'mom' }] },
          ] },
      ],
    },
    wordsAdd: [{ en: 'opens', ko: '연다' }, { en: 'made', ko: '만들어진' }],
  },

  // ============================== g-mid-04 who·which ==============================
  'g-mid-04': {
    scene: {
      id: 'mid04-who-which', mode: 'add', titleKo: '누구? 무엇?', bgKo: '교실', bg: 'school',
      characters: ['paul', 'mia', 'teacher'],
      objects: {
        paul: { en: 'Paul', ko: '폴' },
        mia: { en: 'Mia', ko: '미아' },
        teacher: { en: 'teacher', enPlural: 'teachers', ko: '선생님' },
        book: { en: 'book', enPlural: 'books', ko: '책' },
        bag: { en: 'bag', enPlural: 'bags', ko: '가방' },
        ball: { en: 'ball', enPlural: 'balls', ko: '공' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '선생님이 책을 읽는 아이를 찾아요. 알맞은 아이를 눌러 보세요.',
          layout: [
            { obj: 'paul', action: 'read', labelKo: '책을 읽는 아이' }, { obj: 'book', at: 'next to', ref: 'paul' },
            { obj: 'mia', action: 'play', labelKo: '공놀이하는 아이' }, { obj: 'ball', at: 'next to', ref: 'mia' },
          ],
          lines: [{ who: 'teacher', ko: '책을 읽는 소년이 누구죠?' }],
          tap: { obj: 'paul', en: 'Paul is a boy who reads books.', ko: '폴은 책을 읽는 소년이야.' },
          noteKo: '사람을 설명하는 말을 이을 때 who를 써요. 사람 + who + 동작 순서예요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '사람과 물건을 설명하는 말이 어떻게 다른지 비교해 보세요.',
          left: { layout: [{ obj: 'mia', action: 'play', labelKo: '사람' }, { obj: 'ball', at: 'next to', ref: 'mia' }], en: 'Mia is a girl who plays soccer.', ko: '미아는 축구를 하는 소녀야.' },
          right: { layout: [{ obj: 'bag', size: 'l', labelKo: '물건' }], en: 'This is a bag which is new.', ko: '이것은 새 가방이야.' },
          explainKo: ['앞말이 사람(girl, boy)이면 who를 써요.', '앞말이 물건(bag, book)이면 which를 써요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { promptKo: PH, layout: [{ obj: 'mia', action: 'read', labelKo: '책을 읽는 아이' }, { obj: 'book', at: 'next to', ref: 'mia' }],
              frame: 'Mia is a girl ___ reads books.', options: ['who', 'which', 'what'], correct: 0,
              whyKo: 'girl은 사람이라서 who를 써요.' },
            { promptKo: PH, layout: [{ obj: 'bag', size: 'l', labelKo: '새 가방' }],
              frame: 'This is a bag ___ is new.', options: ['which', 'who', 'where'], correct: 0,
              whyKo: 'bag은 물건이라서 which를 써요.' },
            { promptKo: PH, layout: [{ obj: 'paul', action: 'play', labelKo: '공놀이하는 아이' }, { obj: 'ball', at: 'next to', ref: 'paul' }],
              frame: 'Paul is a boy ___ plays soccer.', options: ['who', 'which', 'where'], correct: 0,
              whyKo: 'boy는 사람이라서 who를 써요.' },
            { promptKo: PH, layout: [{ obj: 'mia', action: 'read', labelKo: '미아' }, { obj: 'book', at: 'next to', ref: 'mia', labelKo: '미아가 읽는 책' }],
              frame: 'This is a book ___ Mia reads.', options: ['which', 'who', 'where'], correct: 0,
              whyKo: 'book은 물건이라서 which를 써요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'Paul is a boy who reads books.', layout: [{ obj: 'paul', action: 'read', labelKo: '책을 읽는 아이' }, { obj: 'book', at: 'next to', ref: 'paul' }] },
            { en: 'Mia is a girl who plays soccer.', layout: [{ obj: 'mia', action: 'play', labelKo: '공놀이하는 아이' }, { obj: 'ball', at: 'next to', ref: 'mia' }] },
            { en: 'This is a bag which is new.', layout: [{ obj: 'bag', size: 'l', labelKo: '새 가방' }] },
          ] },
      ],
    },
    wordsAdd: [{ en: 'soccer', ko: '축구' }],
  },

  // ============================== g-mid-05 분사 ==============================
  'g-mid-05': {
    scene: {
      id: 'mid05-participles', mode: 'add', titleKo: '무엇이 보여요?', bgKo: '교실과 복도', bg: 'school',
      characters: ['paul', 'teacher'],
      objects: {
        paul: { en: 'Paul', ko: '폴' },
        teacher: { en: 'teacher', enPlural: 'teachers', ko: '선생님' },
        cat: { en: 'cat', enPlural: 'cats', ko: '고양이' },
        window: { en: 'window', enPlural: 'windows', ko: '창문' },
        door: { en: 'door', enPlural: 'doors', ko: '문' },
        ball: { en: 'ball', enPlural: 'balls', ko: '공' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견',
          promptKo: '고양이가 지금 무엇을 하고 있을까요? 고양이를 눌러 보세요.',
          layout: [{ obj: 'cat', action: 'sleep', labelKo: '지금 자고 있어요' }],
          tap: { obj: 'cat', en: 'The sleeping cat is here.', ko: '자고 있는 고양이가 여기 있어.' },
          noteKo: '지금 하고 있는 모습은 동사에 -ing를 붙여 명사 앞에서 꾸며 줘요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '하고 있는 모습과, 이미 그렇게 된 모습을 비교해 보세요.',
          left: { layout: [{ obj: 'cat', action: 'sleep', labelKo: '지금 하고 있어요' }], en: 'The sleeping cat is here.', ko: '자고 있는 고양이가 여기 있어.' },
          right: { view: 'dialogue', layout: [{ obj: 'window', labelKo: '이미 깨졌어요' }, { obj: 'ball', at: 'next to', ref: 'window' }, { obj: 'teacher', labelKo: '선생님' }],
            lines: [{ who: 'teacher', ko: '어제 공에 맞아서 유리창이 깨졌어요.' }],
            en: 'This is a broken window.', ko: '이것은 부서진 창문이야.' },
          explainKo: ['하고 있는 모습은 -ing(sleeping, running)이에요.', '당했거나 된 상태는 -ed 모양(broken, closed)이에요. 둘 다 명사 바로 앞에서 꾸며요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { promptKo: PH, layout: [{ obj: 'cat', action: 'sleep', labelKo: '지금 자고 있어요' }],
              frame: 'The ___ cat is here.', options: ['sleeping', 'sleep'], correct: 0,
              whyKo: '자고 있는 모습이라서 -ing를 붙인 sleeping을 써요.' },
            { promptKo: PH, layout: [{ obj: 'paul', action: 'run', labelKo: '폴' }],
              frame: 'The ___ boy is Paul.', options: ['running', 'run'], correct: 0,
              whyKo: '달리고 있는 모습이라서 running을 boy 바로 앞에 써요.' },
            { promptKo: PH, view: 'dialogue',
              layout: [{ obj: 'window', labelKo: '이미 깨졌어요' }, { obj: 'ball', at: 'next to', ref: 'window' }, { obj: 'teacher', labelKo: '선생님' }],
              lines: [{ who: 'teacher', ko: '어제 공에 맞아서 유리창이 깨졌어요.' }],
              frame: 'This is a ___ window.', options: ['broken', 'breaking', 'break'], correct: 0,
              whyKo: '이미 깨진 상태라서 -ed 모양 broken을 써요.' },
            { promptKo: PH, view: 'dialogue',
              layout: [{ obj: 'door', labelKo: '닫혀 있어요' }, { obj: 'teacher', labelKo: '선생님' }],
              lines: [{ who: 'teacher', ko: '문은 이미 닫혀 있어요.' }],
              frame: 'This is a ___ door.', options: ['closed', 'closing'], correct: 0,
              whyKo: '이미 닫힌 상태라서 -ed 모양 closed를 써요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'The sleeping cat is here.', layout: [{ obj: 'cat', action: 'sleep', labelKo: '지금 자고 있어요' }] },
            { en: 'The running boy is Paul.', layout: [{ obj: 'paul', action: 'run', labelKo: '지금 달리고 있어요' }] },
            { en: 'This is a broken door.', view: 'dialogue', layout: [{ obj: 'door', labelKo: '부서졌어요' }, { obj: 'teacher', labelKo: '선생님' }],
              lines: [{ who: 'teacher', ko: '문이 부서져서 열리지 않아요.' }] },
          ] },
      ],
    },
    wordsAdd: [{ en: 'sleep', ko: '자다' }, { en: 'run', ko: '달리다' }, { en: 'breaking', ko: '부수고 있는' }, { en: 'break', ko: '부수다' }, { en: 'closing', ko: '닫고 있는' }],
  },

  // ============================== g-mid-06 if ==============================
  'g-mid-06': {
    scene: {
      id: 'mid06-if-then', mode: 'add', titleKo: '만약 …라면', bgKo: '거리', bg: 'street',
      characters: ['paul', 'mia'],
      objects: {
        paul: { en: 'Paul', ko: '폴' },
        mia: { en: 'Mia', ko: '미아' },
        umbrella: { en: 'umbrella', enPlural: 'umbrellas', ko: '우산' },
        house: { en: 'house', enPlural: 'houses', ko: '집' },
        ball: { en: 'ball', enPlural: 'balls', ko: '공' },
        medal: { en: 'medal', enPlural: 'medals', ko: '메달' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'timeline',
          promptKo: '왼쪽은 조건, 오른쪽은 결과예요. 비가 오면 어떻게 될까요? 우산을 눌러 보세요.',
          panels: [
            { labelKo: '조건: 비가 와요', layout: [{ obj: 'paul', action: 'wait' }, { obj: 'umbrella', at: 'next to', ref: 'paul' }] },
            { labelKo: '결과: 집에 있어요', layout: stayHome },
          ],
          tap: { obj: 'umbrella', en: 'If it rains, we will stay home.', ko: '비가 오면 우리는 집에 있을 거야.' },
          noteKo: 'If 뒤에는 앞으로의 일이어도 will을 쓰지 않고 rains처럼 현재 모양을 써요. 결과에는 will + 동사 원래 모양을 써요.' },

        { kind: 'compare', stepKo: '비교', view: 'timeline',
          promptKo: '조건이 달라지면 결과도 달라져요. 두 그림을 비교해 보세요.',
          left: { panels: [
            { labelKo: '조건: 비가 와요', layout: [{ obj: 'umbrella' }] },
            { labelKo: '결과: 집에 있어요', layout: stayHome },
          ], en: 'If it rains, we will stay home.', ko: '비가 오면 우리는 집에 있을 거야.' },
          right: { panels: [
            { labelKo: '조건: 맑아요', layout: [{ obj: 'paul' }] },
            { labelKo: '결과: 공놀이를 해요', layout: sunnyPlay },
          ], en: 'If it is sunny, we will play soccer.', ko: '맑으면 우리는 축구를 할 거야.' },
          explainKo: ['If가 이끄는 조건 부분은 현재 모양(rains, is)이에요.', '결과 부분은 will + 동사 원래 모양이에요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { promptKo: PH, view: 'timeline',
              panels: [
                { labelKo: '조건: 비가 와요', layout: [{ obj: 'paul', action: 'wait' }, { obj: 'umbrella', at: 'next to', ref: 'paul' }] },
                { labelKo: '결과: 집에 있어요', layout: stayHome },
              ],
              frame: 'If it ___, we will stay home.', options: ['rains', 'will rain', 'rained'], correct: 0,
              whyKo: 'If 뒤에는 앞으로의 일이어도 현재 모양 rains를 써요.' },
            { promptKo: PH, view: 'timeline',
              panels: [
                { labelKo: '조건: 맑아요', layout: [{ obj: 'paul' }] },
                { labelKo: '결과: 공놀이를 해요', layout: sunnyPlay },
              ],
              frame: 'If it ___ sunny, we will play soccer.', options: ['is', 'will be', 'are'], correct: 0,
              whyKo: 'If 뒤는 현재 모양이에요. it에는 is를 써요.' },
            { promptKo: PH, view: 'timeline',
              panels: [
                { labelKo: '조건: 열심히 공부해요', layout: [{ obj: 'paul', action: 'study' }] },
                { labelKo: '결과: 메달을 받아요', layout: [{ obj: 'paul' }, { obj: 'medal', at: 'next to', ref: 'paul', size: 'l' }] },
              ],
              frame: 'If you ___, you will get a medal.', options: ['study', 'studied', 'will study'], correct: 0,
              whyKo: 'If 뒤에는 will이나 과거가 아니라 현재 모양 study를 써요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'If it rains, we will stay home.', panels: [
              { labelKo: '조건: 비가 와요', layout: [{ obj: 'umbrella' }] },
              { labelKo: '결과: 집에 있어요', layout: stayHome } ] },
            { en: 'If it is sunny, we will play soccer.', panels: [
              { labelKo: '조건: 맑아요', layout: [{ obj: 'paul' }] },
              { labelKo: '결과: 공놀이를 해요', layout: sunnyPlay } ] },
            { en: 'If you study, you will get a medal.', panels: [
              { labelKo: '조건: 열심히 공부해요', layout: [{ obj: 'paul', action: 'study' }] },
              { labelKo: '결과: 메달을 받아요', layout: [{ obj: 'medal', size: 'l' }] } ] },
          ] },
      ],
    },
    wordsAdd: [
      { en: 'will', ko: '~할 것이다' }, { en: 'play', ko: '(운동을) 하다' }, { en: 'soccer', ko: '축구' },
      { en: 'rained', ko: '비가 왔다' }, { en: 'be', ko: '~이다(원래 모양)' }, { en: 'study', ko: '공부하다' },
      { en: 'studied', ko: '공부했다' }, { en: 'get', ko: '받다' },
    ],
  },
}
