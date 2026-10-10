// Advanced scenes (content draft 2026-10-10, teacher review pending)
const PAUL = { en: 'Paul', ko: '폴' }
const MIA = { en: 'Mia', ko: '미아' }
const ME = { labelKo: '나' }

export default {
  // ───────────── g-adv-01 going to ─────────────
  'g-adv-01': {
    scene: {
      id: 'adv01-festival-plan', mode: 'add', titleKo: '내일 축제 계획', bgKo: '학교 운동장 무대', bg: 'school',
      characters: ['paul', 'mia'],
      objects: { paul: PAUL, mia: MIA },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '미아가 폴에게 내일 계획을 물어요. 폴을 눌러 보세요.',
          layout: [{ obj: 'mia' }, { obj: 'paul', action: 'sing' }],
          lines: [{ who: 'mia', ko: '내일 노래할 거야?', en: 'Are you going to sing?' }, { who: 'paul', ko: '응, 할 거야!', en: 'Yes, I am.' }],
          tap: { obj: 'paul', en: 'I am going to sing tomorrow.', ko: '나는 내일 노래할 거야.' },
          noteKo: '앞으로 할 일은 am·is·are + going to + 동작으로 말해요.' },

        { kind: 'compare', stepKo: '비교', view: 'timeline',
          promptKo: '지금과 내일 그림을 보고, 한 명일 때와 둘일 때를 비교해 보세요.',
          left: { panels: [{ labelKo: '지금', layout: [{ obj: 'mia' }] }, { labelKo: '내일', layout: [{ obj: 'mia', action: 'dance' }] }], en: 'Mia is going to dance tomorrow.', ko: '미아는 내일 춤출 거야.' },
          right: { panels: [{ labelKo: '지금', layout: [{ obj: 'paul' }, { obj: 'mia' }] }, { labelKo: '내일', layout: [{ obj: 'paul', action: 'dance' }, { obj: 'mia', action: 'dance' }] }], en: 'We are going to dance tomorrow.', ko: '우리는 내일 춤출 거야.' },
          explainKo: ['한 사람(Mia)이면 is going to, 우리(We)이면 are going to예요.', '나(I)일 때는 am going to라고 해요.', 'going to 뒤의 동작 말은 그대로 써요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'timeline', promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요. (나 = 폴)',
              panels: [{ labelKo: '지금', layout: [{ obj: 'paul', ...ME }] }, { labelKo: '내일', layout: [{ obj: 'paul', action: 'sing', ...ME }] }],
              frame: 'I ___ going to sing tomorrow.', options: ['am', 'is', 'are'], correct: 0,
              whyKo: '"나(I)" 뒤에는 am을 써요. 내일 할 계획이라 going to예요.' },
            { view: 'timeline', promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요.',
              panels: [{ labelKo: '지금', layout: [{ obj: 'mia', labelKo: '미아' }] }, { labelKo: '내일', layout: [{ obj: 'mia', action: 'dance', labelKo: '미아' }] }],
              frame: 'Mia ___ going to dance tomorrow.', options: ['is', 'are', 'am'], correct: 0,
              whyKo: '미아 한 사람이라 is를 써요.' },
            { view: 'timeline', promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요. (폴과 미아, 우리)',
              panels: [{ labelKo: '지금', layout: [{ obj: 'paul' }, { obj: 'mia' }] }, { labelKo: '내일', layout: [{ obj: 'paul', action: 'sing' }, { obj: 'mia', action: 'sing' }] }],
              frame: 'We ___ going to sing at the festival.', options: ['are', 'is', 'am'], correct: 0,
              whyKo: '"우리(We)" 뒤에는 are를 써요.' },
          ] },

        { kind: 'read', stepKo: '짝 맞추기', view: 'timeline',
          pairs: [
            { en: 'Mia is going to dance tomorrow.', panels: [{ labelKo: '지금', layout: [{ obj: 'mia' }] }, { labelKo: '내일', layout: [{ obj: 'mia', action: 'dance' }] }] },
            { en: 'Paul is going to sing tomorrow.', panels: [{ labelKo: '지금', layout: [{ obj: 'paul' }] }, { labelKo: '내일', layout: [{ obj: 'paul', action: 'sing' }] }] },
            { en: 'We are going to dance tomorrow.', panels: [{ labelKo: '지금', layout: [{ obj: 'paul' }, { obj: 'mia' }] }, { labelKo: '내일', layout: [{ obj: 'paul', action: 'dance' }, { obj: 'mia', action: 'dance' }] }] },
          ] },
      ],
    },
    wordsAdd: [],
  },

  // ───────────── g-adv-02 comparatives ─────────────
  'g-adv-02': {
    scene: {
      id: 'adv02-bigger-taller', mode: 'add', titleKo: '크기 비교', bgKo: '교실 바닥', bg: 'plain',
      characters: ['paul', 'mia'],
      objects: {
        paul: PAUL, mia: MIA,
        ball: { en: 'ball', enPlural: 'balls', ko: '공' }, box: { en: 'box', enPlural: 'boxes', ko: '상자' },
        apple: { en: 'apple', enPlural: 'apples', ko: '사과' }, tree: { en: 'tree', enPlural: 'trees', ko: '나무' },
        dog: { en: 'dog', enPlural: 'dogs', ko: '강아지' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견',
          promptKo: '폴과 미아의 키를 비교해요. 키가 더 큰 친구를 눌러 보세요.',
          layout: [{ obj: 'paul', size: 'l', labelKo: '폴' }, { obj: 'mia', size: 's', labelKo: '미아' }],
          tap: { obj: 'paul', en: 'Paul is taller than Mia.', ko: '폴은 미아보다 키가 커.' },
          noteKo: '키는 tall 뒤에 -er을 붙여 taller, "…보다"는 than이에요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 그림을 비교해 보세요. 어느 쪽이 더 클까요?',
          left: { layout: [{ obj: 'ball', size: 'l' }, { obj: 'apple', size: 's' }], en: 'The ball is bigger than the apple.', ko: '공이 사과보다 커.' },
          right: { layout: [{ obj: 'apple', size: 'l' }, { obj: 'ball', size: 's' }], en: 'The apple is bigger than the ball.', ko: '사과가 공보다 커.' },
          explainKo: ['더 큰 쪽이 앞에 오고, big은 bigger로 바뀌어요.', '"…보다"는 bigger 뒤에 than을 써요.', 'than 뒤에는 비교하는 상대가 와요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요.',
              layout: [{ obj: 'ball', size: 'l' }, { obj: 'apple', size: 's' }],
              frame: 'The ball is ___ than the apple.', options: ['bigger', 'big'], correct: 0,
              whyKo: '둘을 비교할 때는 -er을 붙인 bigger를 써요.' },
            { promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요.',
              layout: [{ obj: 'tree', size: 'l' }, { obj: 'dog', size: 's' }],
              frame: 'The tree is ___ than the dog.', options: ['taller', 'tall'], correct: 0,
              whyKo: '나무가 더 높아서 taller예요. 비교할 때는 -er이 필요해요.' },
            { promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요.',
              layout: [{ obj: 'apple', size: 's' }, { obj: 'box', size: 'l' }],
              frame: 'The apple is ___ than the box.', options: ['smaller', 'small'], correct: 0,
              whyKo: '사과가 더 작아서 smaller예요. 비교할 때는 -er을 붙여요.' },
          ] },

        { kind: 'listen', stepKo: '듣고 고르기',
          items: [
            { en: 'Paul is taller than Mia.',
              options: [
                { layout: [{ obj: 'paul', size: 'l', labelKo: '폴' }, { obj: 'mia', size: 's', labelKo: '미아' }] },
                { layout: [{ obj: 'paul', size: 's', labelKo: '폴' }, { obj: 'mia', size: 'l', labelKo: '미아' }] },
              ], correct: 0, whyKo: 'Paul이 앞에 있고 taller라서 폴이 더 커요.' },
            { en: 'The ball is bigger than the apple.',
              options: [
                { layout: [{ obj: 'ball', size: 'l' }, { obj: 'apple', size: 's' }] },
                { layout: [{ obj: 'apple', size: 'l' }, { obj: 'ball', size: 's' }] },
              ], correct: 0, whyKo: 'ball이 앞에 있고 bigger라서 공이 더 커요.' },
          ] },
      ],
    },
    wordsAdd: [{ en: 'big', ko: '큰' }, { en: 'tall', ko: '키가 큰' }, { en: 'small', ko: '작은' }, { en: 'smaller', ko: '더 작은' }],
  },

  // ───────────── g-adv-03 because / so ─────────────
  'g-adv-03': {
    scene: {
      id: 'adv03-reason-result', mode: 'add', titleKo: '이유와 결과', bgKo: '집 안', bg: 'home',
      characters: ['paul', 'mia'],
      objects: { paul: PAUL, mia: MIA, apple: { en: 'apple', enPlural: 'apples', ko: '사과' }, bed: { en: 'bed', enPlural: 'beds', ko: '침대' } },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '미아가 폴에게 이유를 물어요. 사과를 눌러 보세요.',
          layout: [{ obj: 'mia' }, { obj: 'paul', action: 'eat' }, { obj: 'apple' }],
          lines: [{ who: 'mia', ko: '왜 사과를 먹어?' }, { who: 'paul', ko: '배고파서 먹어!', en: 'I am hungry.' }],
          tap: { obj: 'apple', en: 'I eat an apple because I am hungry.', ko: '나는 배고프기 때문에 사과를 먹어.' },
          noteKo: 'because 뒤에는 이유가 와요.' },

        { kind: 'compare', stepKo: '비교', view: 'timeline',
          promptKo: '같은 그림을 두 가지로 말해요. 밝게 보이는 칸에 집중해 보세요.',
          left: { focus: 1, panels: [{ labelKo: '이유 · 배고파요', layout: [{ obj: 'paul', ...ME }] }, { labelKo: '결과 · 사과를 먹어요', layout: [{ obj: 'paul', action: 'eat', ...ME }, { obj: 'apple' }] }], en: 'I am hungry, so I eat an apple.', ko: '나는 배고파서 사과를 먹어.' },
          right: { focus: 0, panels: [{ labelKo: '이유 · 배고파요', layout: [{ obj: 'paul', ...ME }] }, { labelKo: '결과 · 사과를 먹어요', layout: [{ obj: 'paul', action: 'eat', ...ME }, { obj: 'apple' }] }], en: 'I eat an apple because I am hungry.', ko: '나는 배고프기 때문에 사과를 먹어.' },
          explainKo: ['so 뒤에는 결과(사과를 먹어)가 와요.', 'because 뒤에는 이유(배고파)가 와요.', '뜻은 같고 말하는 순서만 달라요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'timeline', promptKo: '그림을 보고 이유와 결과를 이어 보세요.',
              panels: [{ labelKo: '이유 · 배고파요', layout: [{ obj: 'paul', ...ME }] }, { labelKo: '결과 · 사과를 먹어요', layout: [{ obj: 'paul', action: 'eat', ...ME }, { obj: 'apple' }] }],
              frame: 'I am hungry, ___ I eat an apple.', options: ['so', 'because'], correct: 0,
              whyKo: '배고픈 것이 이유이고 사과를 먹는 것이 결과예요. 결과 앞에는 so를 써요.' },
            { view: 'timeline', promptKo: '그림을 보고 이유와 결과를 이어 보세요.',
              panels: [{ labelKo: '이유 · 배고파요', layout: [{ obj: 'paul', ...ME }] }, { labelKo: '결과 · 사과를 먹어요', layout: [{ obj: 'paul', action: 'eat', ...ME }, { obj: 'apple' }] }],
              frame: 'I eat an apple ___ I am hungry.', options: ['because', 'so'], correct: 0,
              whyKo: '배고픈 것이 이유예요. 이유 앞에는 because를 써요.' },
            { view: 'timeline', promptKo: '그림을 보고 이유와 결과를 이어 보세요.',
              panels: [{ labelKo: '이유 · 피곤해요', layout: [{ obj: 'mia', labelKo: '미아' }] }, { labelKo: '결과 · 침대에 있어요', layout: [{ obj: 'bed' }, { obj: 'mia', at: 'in', ref: 'bed', action: 'sleep', labelKo: '미아' }] }],
              frame: 'Mia is tired, ___ she is in bed.', options: ['so', 'because'], correct: 0,
              whyKo: '피곤한 것이 이유이고 침대에 있는 것이 결과라서 so예요.' },
            { view: 'timeline', promptKo: '그림을 보고 이유와 결과를 이어 보세요.',
              panels: [{ labelKo: '이유 · 피곤해요', layout: [{ obj: 'mia', labelKo: '미아' }] }, { labelKo: '결과 · 침대에 있어요', layout: [{ obj: 'bed' }, { obj: 'mia', at: 'in', ref: 'bed', action: 'sleep', labelKo: '미아' }] }],
              frame: 'Mia is in bed ___ she is tired.', options: ['because', 'so'], correct: 0,
              whyKo: '피곤한 것이 이유라서 그 앞에 because를 써요.' },
          ] },

        { kind: 'read', stepKo: '짝 맞추기', view: 'timeline',
          pairs: [
            { en: 'I am hungry, so I eat an apple.', panels: [{ labelKo: '이유 · 배고파요', layout: [{ obj: 'paul', ...ME }] }, { labelKo: '결과 · 사과를 먹어요', layout: [{ obj: 'paul', action: 'eat', ...ME }, { obj: 'apple' }] }] },
            { en: 'Mia is tired, so she is in bed.', panels: [{ labelKo: '이유 · 피곤해요', layout: [{ obj: 'mia' }] }, { labelKo: '결과 · 침대에 있어요', layout: [{ obj: 'bed' }, { obj: 'mia', at: 'in', ref: 'bed', action: 'sleep' }] }] },
            { en: 'Paul is tired, so he is in bed.', panels: [{ labelKo: '이유 · 피곤해요', layout: [{ obj: 'paul' }] }, { labelKo: '결과 · 침대에 있어요', layout: [{ obj: 'bed' }, { obj: 'paul', at: 'in', ref: 'bed', action: 'sleep' }] }] },
          ] },
      ],
    },
    wordsAdd: [],
  },

  // ───────────── g-adv-04 when / if ─────────────
  'g-adv-04': {
    scene: {
      id: 'adv04-when-if', mode: 'add', titleKo: '때와 조건', bgKo: '집 거실', bg: 'home',
      characters: ['paul', 'mia'],
      objects: {
        paul: PAUL, mia: MIA, umbrella: { en: 'umbrella', enPlural: 'umbrellas', ko: '우산' }, house: { en: 'house', enPlural: 'houses', ko: '집' },
        ball: { en: 'ball', enPlural: 'balls', ko: '공' }, apple: { en: 'apple', enPlural: 'apples', ko: '사과' }, bed: { en: 'bed', enPlural: 'beds', ko: '침대' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '비 오는 날 폴은 뭘 할까요? 우산을 눌러 보세요.',
          layout: [{ obj: 'umbrella' }, { obj: 'house' }, { obj: 'paul', at: 'in', ref: 'house' }],
          lines: [{ who: 'mia', ko: '비 오는 날엔 뭐 해?' }, { who: 'paul', ko: '집에 있어!', en: 'I stay home.' }],
          tap: { obj: 'umbrella', en: 'When it rains, I stay home.', ko: '비가 올 때, 나는 집에 있어.' },
          noteKo: 'When은 "…할 때"예요. When 부분이 앞에 오면 쉼표를 찍어요.' },

        { kind: 'compare', stepKo: '비교', view: 'timeline',
          promptKo: 'When과 If를 비교해 보세요. 어떤 때에 쓸까요?',
          left: { panels: [{ labelKo: '배고플 때', layout: [{ obj: 'paul', ...ME }] }, { labelKo: '그러면', layout: [{ obj: 'paul', action: 'eat', ...ME }, { obj: 'apple' }] }], en: 'When I am hungry, I eat.', ko: '배고플 때, 나는 먹어.' },
          right: { panels: [{ labelKo: '만약 피곤하면', layout: [{ obj: 'mia', labelKo: '너' }] }, { labelKo: '그러면', layout: [{ obj: 'bed' }, { obj: 'mia', at: 'in', ref: 'bed', action: 'sleep', labelKo: '너' }] }], en: 'If you are tired, you can sleep.', ko: '피곤하면 잘 수 있어.' },
          explainKo: ['When은 "…할 때", If는 "만약 …하면"이에요.', '앞 칸이 때나 조건, 뒤 칸이 그 결과예요.', 'When·If 뒤에도 I am, you are 순서를 그대로 써요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'timeline', promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요.',
              panels: [{ labelKo: '비가 올 때', layout: [{ obj: 'umbrella' }] }, { labelKo: '그러면', layout: [{ obj: 'house' }, { obj: 'paul', at: 'in', ref: 'house', ...ME }] }],
              frame: 'When it ___, I stay home.', options: ['rains', 'raining'], correct: 0,
              whyKo: 'When it 뒤에는 rains만 써요. is나 -ing를 더하지 않아요.' },
            { view: 'timeline', promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요.',
              panels: [{ labelKo: '날이 맑으면', layout: [{ obj: 'paul', ...ME }] }, { labelKo: '그러면', layout: [{ obj: 'paul', action: 'play', ...ME }, { obj: 'ball' }] }],
              frame: 'If it is sunny, I ___ ball.', options: ['play', 'plays'], correct: 0,
              whyKo: '"나(I)" 뒤에는 동작 말을 그대로 써서 play예요.' },
            { view: 'timeline', promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요.',
              panels: [{ labelKo: '배고플 때', layout: [{ obj: 'paul', ...ME }] }, { labelKo: '그러면', layout: [{ obj: 'paul', action: 'eat', ...ME }, { obj: 'apple' }] }],
              frame: 'When I ___ hungry, I eat.', options: ['am', 'is'], correct: 0,
              whyKo: 'I 뒤에는 am이에요. When 뒤에서도 똑같아요.' },
          ] },

        { kind: 'listen', stepKo: '듣고 고르기',
          items: [
            { en: 'When it rains, I stay home.',
              options: [
                { layout: [{ obj: 'house' }, { obj: 'paul', at: 'in', ref: 'house' }, { obj: 'umbrella' }] },
                { layout: [{ obj: 'paul', action: 'play' }, { obj: 'ball' }] },
                { layout: [{ obj: 'paul', action: 'eat' }, { obj: 'apple' }] },
              ], correct: 0, whyKo: '비가 오면(우산) 집에 있어요.' },
            { en: 'If you are tired, you can sleep.',
              options: [
                { layout: [{ obj: 'bed' }, { obj: 'mia', at: 'in', ref: 'bed', action: 'sleep' }] },
                { layout: [{ obj: 'mia', action: 'play' }, { obj: 'ball' }] },
                { layout: [{ obj: 'mia', action: 'eat' }, { obj: 'apple' }] },
              ], correct: 0, whyKo: '피곤하면 침대에서 잘 수 있어요.' },
          ] },
      ],
    },
    wordsAdd: [{ en: 'raining', ko: '비가 오는 중' }, { en: 'plays', ko: '(놀이를) 한다' }],
  },

  // ───────────── g-adv-05 should / have to ─────────────
  'g-adv-05': {
    scene: {
      id: 'adv05-school-rules', mode: 'add', titleKo: '학교에서', bgKo: '교실', bg: 'school',
      characters: ['paul', 'mia', 'teacher'],
      objects: {
        paul: PAUL, mia: MIA, teacher: { en: 'teacher', enPlural: 'teachers', ko: '선생님' },
        homework: { en: 'homework', ko: '숙제' }, book: { en: 'book', enPlural: 'books', ko: '책' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '선생님이 숙제를 내셨어요. 숙제를 눌러 보세요.',
          layout: [{ obj: 'teacher', labelKo: '선생님' }, { obj: 'paul' }, { obj: 'homework' }],
          lines: [{ who: 'teacher', ko: '내일까지 숙제를 꼭 하세요!' }, { who: 'paul', ko: '알겠어요!', en: 'Yes, sure.' }],
          tap: { obj: 'homework', en: 'I have to do my homework.', ko: '나는 숙제를 해야 해.' },
          noteKo: '꼭 해야 하는 일은 have to로 말해요.' },

        { kind: 'compare', stepKo: '비교', view: 'dialogue',
          promptKo: 'have to와 should를 비교해 보세요. 누가 말하는 걸까요?',
          left: { layout: [{ obj: 'teacher', labelKo: '선생님' }, { obj: 'paul' }, { obj: 'homework' }], lines: [{ who: 'teacher', ko: '숙제는 꼭 해야 해요!' }], en: 'I have to do my homework.', ko: '나는 숙제를 해야 해.' },
          right: { layout: [{ obj: 'mia', labelKo: '친구' }, { obj: 'paul', action: 'read' }, { obj: 'book' }], lines: [{ who: 'mia', ko: '책을 읽으면 좋을 것 같아.' }], en: 'You should read a book.', ko: '너는 책을 읽는 게 좋아.' },
          explainKo: ['have to는 규칙처럼 꼭 해야 하는 일이에요.', 'should는 친구에게 하는 조언이에요. "…하는 게 좋아".', 'should 뒤에는 to 없이 동작 말을 써요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'dialogue', promptKo: '선생님 말씀을 보고 빈칸에 알맞은 말을 고르세요.',
              layout: [{ obj: 'teacher', labelKo: '선생님' }, { obj: 'mia', action: 'run' }],
              lines: [{ who: 'teacher', ko: '교실에서는 뛰지 마세요!' }],
              frame: 'Mia ___ run in class.', options: ['should', "shouldn't"], correct: 1,
              whyKo: "뛰면 안 된다는 말이라서 shouldn't를 써요." },
            { view: 'dialogue', promptKo: '친구 말을 보고 빈칸에 알맞은 말을 고르세요.',
              layout: [{ obj: 'mia', action: 'read' }, { obj: 'book' }, { obj: 'paul', labelKo: '친구' }],
              lines: [{ who: 'paul', ko: '미아야, 책을 읽으면 좋아!' }],
              frame: 'Mia ___ read a book.', options: ['should', "shouldn't"], correct: 0,
              whyKo: '읽으면 좋다는 조언이라서 should를 써요.' },
            { view: 'dialogue', promptKo: '선생님 말씀을 보고 빈칸에 알맞은 말을 고르세요.',
              layout: [{ obj: 'teacher', labelKo: '선생님' }, { obj: 'paul', ...ME }, { obj: 'homework' }],
              lines: [{ who: 'teacher', ko: '숙제는 꼭 해야 해요!' }],
              frame: 'I ___ do my homework.', options: ['have to', 'should'], correct: 0,
              whyKo: '꼭 해야 하는 일은 have to예요. should는 "…하는 게 좋아"라는 조언이에요.' },
          ] },

        { kind: 'read', stepKo: '짝 맞추기',
          pairs: [
            { en: 'I have to do my homework.', layout: [{ obj: 'teacher', labelKo: '선생님' }, { obj: 'paul', ...ME }, { obj: 'homework' }] },
            { en: "You shouldn't run in class.", layout: [{ obj: 'teacher', labelKo: '선생님' }, { obj: 'mia', action: 'run' }] },
            { en: 'You should read a book.', layout: [{ obj: 'mia', action: 'read' }, { obj: 'book' }] },
          ] },
      ],
    },
    wordsAdd: [],
  },

  // ───────────── g-adv-06 have ever ─────────────
  'g-adv-06': {
    scene: {
      id: 'adv06-have-ever', mode: 'add', titleKo: '해 본 적 있어요', bgKo: '공원', bg: 'park',
      characters: ['paul', 'mia', 'cookie'],
      objects: { paul: PAUL, mia: MIA, ball: { en: 'ball', enPlural: 'balls', ko: '공' }, dog: { en: 'dog', enPlural: 'dogs', ko: '강아지' } },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'timeline',
          promptKo: '폴은 전에 강아지와 놀았어요. 전 그림의 강아지를 눌러 보세요.',
          panels: [{ labelKo: '전에', layout: [{ obj: 'paul', action: 'play', ...ME }, { obj: 'dog' }] }, { labelKo: '지금', layout: [{ obj: 'paul', ...ME }] }],
          tap: { obj: 'dog', en: 'I have played with a dog.', ko: '나는 개와 놀아 본 적 있어.' },
          noteKo: '해 본 적은 have + played처럼 -ed 모양으로 말해요.' },

        { kind: 'compare', stepKo: '비교', view: 'timeline',
          promptKo: '해 본 적이 있을 때와 없을 때를 비교해 보세요.',
          left: { panels: [{ labelKo: '전에', layout: [{ obj: 'paul', action: 'play', ...ME }, { obj: 'ball' }] }, { labelKo: '지금', layout: [{ obj: 'paul', ...ME }] }], en: 'I have played ball.', ko: '나는 공놀이를 해 본 적 있어.' },
          right: { panels: [{ labelKo: '전에 · 한 적 없어요', layout: [{ obj: 'paul', ...ME }, { obj: 'ball' }] }, { labelKo: '지금', layout: [{ obj: 'paul', ...ME }] }], en: 'I have not played ball.', ko: '나는 공놀이를 해 본 적 없어.' },
          explainKo: ['있으면 have + played, 없으면 have not + played예요.', '질문은 Have you ever …?로 시작해요.', '대답은 Yes, I have. / No, I have not.이에요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'timeline', promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요.',
              panels: [{ labelKo: '전에', layout: [{ obj: 'paul', action: 'play', ...ME }, { obj: 'ball' }] }, { labelKo: '지금', layout: [{ obj: 'paul', ...ME }] }],
              frame: 'I have ___ ball.', options: ['played', 'play'], correct: 0,
              whyKo: '해 본 적이 있다는 말은 have 뒤에 -ed 모양(played)을 써요.' },
            { view: 'timeline', promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요.',
              panels: [{ labelKo: '전에', layout: [{ obj: 'mia', action: 'play', labelKo: '너' }, { obj: 'dog' }] }, { labelKo: '지금', layout: [{ obj: 'mia', labelKo: '너' }] }],
              frame: 'Have you ever ___ with a dog?', options: ['played', 'play'], correct: 0,
              whyKo: 'Have you ever 뒤에도 -ed 모양(played)을 써요.' },
            { view: 'dialogue', promptKo: '대화를 보고 빈칸에 알맞은 말을 고르세요.',
              layout: [{ obj: 'mia' }, { obj: 'paul', ...ME }],
              lines: [{ who: 'mia', ko: '동물원에 가 본 적 있어?' }, { who: 'paul', ko: '응, 가 본 적 있어!' }],
              frame: 'I have ___ to the zoo.', options: ['been', 'be'], correct: 0,
              whyKo: '"가 본 적"은 have been to예요.' },
          ] },

        { kind: 'listen', stepKo: '듣고 고르기',
          items: [
            { en: 'I have played with a dog.',
              options: [
                { layout: [{ obj: 'paul', action: 'play' }, { obj: 'dog', at: 'next to', ref: 'paul' }] },
                { layout: [{ obj: 'paul', action: 'play' }, { obj: 'ball' }] },
              ], correct: 0, whyKo: 'dog와 놀았다는 뜻이라서 폴이 강아지와 놀고 있는 그림이에요.' },
            { en: 'I have played ball.',
              options: [
                { layout: [{ obj: 'paul', action: 'play' }, { obj: 'ball' }] },
                { layout: [{ obj: 'paul', action: 'play' }, { obj: 'dog' }] },
              ], correct: 0, whyKo: 'ball을 가지고 논 그림이에요.' },
          ] },
      ],
    },
    wordsAdd: [{ en: 'play', ko: '(놀이를) 하다' }, { en: 'be', ko: '…이다' }],
  },
}
