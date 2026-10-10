// Intermediate scenes (content draft 2026-10-10, teacher review pending)
const PREP_Q = '그림을 보고 위치를 나타내는 말을 고르세요.'
const catIn = (at, ref) => (at === 'in'
  ? [{ obj: 'cat', at, ref, size: 's' }, { obj: ref, size: 'l' }]
  : [{ obj: 'cat', at, ref }, { obj: ref }])

export default {
  // ───────────── g-int-01 Is it …? ─────────────
  'g-int-01': {
    scene: {
      id: 'int01-box-guess', mode: 'add', titleKo: '고양이 찾기', bgKo: '교실', bg: 'school',
      characters: ['paul', 'mia'],
      objects: {
        cat: { en: 'cat', enPlural: 'cats', ko: '고양이' },
        box: { en: 'box', enPlural: 'boxes', ko: '상자' },
        bag: { en: 'bag', enPlural: 'bags', ko: '가방' },
        desk: { en: 'desk', enPlural: 'desks', ko: '책상' },
        chair: { en: 'chair', enPlural: 'chairs', ko: '의자' },
      },
      steps: [
        { kind: 'compare', stepKo: '비교',
          promptKo: '두 그림을 비교해 보세요. 고양이가 상자 안에 있을까요?',
          left: { view: 'dialogue', layout: catIn('in', 'box'),
            lines: [{ who: 'paul', ko: '고양이가 상자 안에 있어?', en: 'Is it in the box?' }, { who: 'mia', ko: '응, 있어!' }],
            en: 'Yes, it is.', ko: '응, 있어.' },
          right: { view: 'dialogue', layout: catIn('next to', 'box'),
            lines: [{ who: 'paul', ko: '고양이가 상자 안에 있어?', en: 'Is it in the box?' }, { who: 'mia', ko: '아니, 없어!' }],
            en: "No, it isn't.", ko: '아니, 없어.' },
          explainKo: ["있으면 Yes, it is. 없으면 No, it isn't.라고 짧게 답해요.", "isn't는 is not을 줄인 말이에요."] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'dialogue', layout: catIn('in', 'box'), promptKo: '그림을 보고 미아의 대답을 골라요.',
              lines: [{ who: 'paul', ko: '고양이가 상자 안에 있어?' }],
              frame: 'Is it in the box? ___', options: ['Yes, it is.', "No, it isn't."], correct: 0, whyKo: '고양이가 상자 안에 있어요. 있을 때는 Yes, it is.예요.' },
            { view: 'dialogue', layout: catIn('next to', 'box'), promptKo: '그림을 보고 미아의 대답을 골라요.',
              lines: [{ who: 'paul', ko: '고양이가 상자 안에 있어?' }],
              frame: 'Is it in the box? ___', options: ['Yes, it is.', "No, it isn't."], correct: 1, whyKo: "고양이가 상자 옆에 있어요. 안에 없으니 No, it isn't.예요." },
            { view: 'dialogue', layout: [{ obj: 'bag', at: 'next to', ref: 'desk' }, { obj: 'desk' }], promptKo: '그림을 보고 미아의 대답을 골라요.',
              lines: [{ who: 'paul', ko: '가방이 책상 위에 있어?' }],
              frame: 'Is the bag on the desk? ___', options: ['Yes, it is.', "No, it isn't."], correct: 1, whyKo: "가방이 책상 옆에 있어요. 위에 없으니 No, it isn't.예요." },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'It is in the box.', layout: catIn('in', 'box') },
            { en: 'It is on the box.', layout: catIn('on', 'box') },
            { en: 'It is under the box.', layout: catIn('under', 'box') },
          ] },
      ],
    },
    wordsAdd: [],
  },

  // ───────────── g-int-02 엄마는 …해요 ─────────────
  'g-int-02': {
    scene: {
      id: 'int02-family-jobs', mode: 'add', titleKo: '우리 가족이 하는 일', bgKo: '집', bg: 'home',
      characters: ['paul', 'mom', 'dad', 'teacher'],
      objects: {
        paul: { en: 'Paul', ko: '폴' },
        mom: { en: 'mum', ko: '엄마' },
        dad: { en: 'dad', ko: '아빠' },
        teacher: { en: 'teacher', enPlural: 'teachers', ko: '선생님' },
        pizza: { en: 'pizza', enPlural: 'pizzas', ko: '피자' },
        car: { en: 'car', enPlural: 'cars', ko: '자동차' },
        book: { en: 'book', enPlural: 'books', ko: '책' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견',
          promptKo: '엄마는 무엇을 할까요? 엄마를 눌러 보세요.',
          layout: [{ obj: 'mom', action: 'cook' }, { obj: 'pizza' }],
          tap: { obj: 'mom', en: 'My mum cooks pizza.', ko: '우리 엄마는 피자를 만들어.' },
          noteKo: '엄마 한 사람이 하는 일은 cook 끝에 s를 붙여요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '나와 엄마를 비교해 보세요. 동작 말이 어떻게 달라질까요?',
          left: { layout: [{ obj: 'paul', action: 'cook', labelKo: '나' }, { obj: 'pizza' }], en: 'I cook pizza.', ko: '나는 피자를 만들어.' },
          right: { layout: [{ obj: 'mom', action: 'cook' }, { obj: 'pizza' }], en: 'My mum cooks pizza.', ko: '우리 엄마는 피자를 만들어.' },
          explainKo: ['나(I)는 cook 그대로 써요.', '엄마처럼 한 사람이면 cook 끝에 s를 붙여 cooks가 돼요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { layout: [{ obj: 'mom', action: 'cook' }, { obj: 'pizza' }], promptKo: '그림을 보고 알맞은 말을 고르세요.',
              frame: 'My mum ___ pizza.', options: ['cooks', 'cook'], correct: 0, whyKo: '엄마 한 사람이 하는 일이라서 cooks예요.' },
            { layout: [{ obj: 'dad', action: 'drive' }, { obj: 'car' }], promptKo: '그림을 보고 알맞은 말을 고르세요.',
              frame: 'My dad ___ a car.', options: ['drive', 'drives'], correct: 1, whyKo: '아빠 한 사람이 하는 일이라서 drives예요.' },
            { layout: [{ obj: 'teacher', action: 'read' }, { obj: 'book' }], promptKo: '그림을 보고 알맞은 말을 고르세요.',
              frame: 'The teacher ___ a book.', options: ['reads', 'read'], correct: 0, whyKo: '선생님 한 분이 하는 일이라서 reads예요.' },
            { layout: [{ obj: 'paul', action: 'read', labelKo: '나' }, { obj: 'book' }], promptKo: '폴이 "나"의 일을 말해요. 알맞은 말을 고르세요.',
              frame: 'I ___ a book.', options: ['reads', 'read'], correct: 1, whyKo: '나(I)는 s를 붙이지 않고 read를 그대로 써요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'I read a book.', layout: [{ obj: 'paul', action: 'read', labelKo: '나' }, { obj: 'book' }] },
            { en: 'My dad drives a car.', layout: [{ obj: 'dad', action: 'drive' }, { obj: 'car' }] },
            { en: 'The teacher reads a book.', layout: [{ obj: 'teacher', action: 'read' }, { obj: 'book' }] },
          ] },
      ],
    },
    wordsAdd: [
      { en: 'cook', ko: '요리하다' }, { en: 'cooks', ko: '요리해' },
      { en: 'drive', ko: '운전하다' }, { en: 'drives', ko: '운전해' },
      { en: 'read', ko: '읽다' }, { en: 'reads', ko: '읽어' },
    ],
  },

  // ───────────── g-int-03 무엇을 좋아해? ─────────────
  'g-int-03': {
    scene: {
      id: 'int03-what-like', mode: 'add', titleKo: '좋아하는 음식', bgKo: '집 거실', bg: 'home',
      characters: ['paul', 'mia'],
      objects: {
        paul: { en: 'Paul', ko: '폴' },
        mia: { en: 'Mia', ko: '미아' },
        pizza: { en: 'pizza', enPlural: 'pizzas', ko: '피자' },
        apple: { en: 'apple', enPlural: 'apples', ko: '사과' },
        milk: { en: 'milk', ko: '우유' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '폴이 미아에게 물어요. 미아가 좋아하는 것을 눌러 보세요.',
          layout: [{ obj: 'mia' }, { obj: 'pizza' }],
          lines: [{ who: 'paul', ko: '너는 무엇을 좋아해?', en: 'What do you like?' }],
          tap: { obj: 'pizza', en: 'I like pizza.', ko: '나는 피자를 좋아해.' },
          noteKo: '좋아하는 것을 물을 때는 What do you like?라고 해요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 대화를 비교해 보세요. 폴은 무엇을 물을까요?',
          left: { view: 'dialogue', layout: [{ obj: 'mia' }, { obj: 'apple' }],
            lines: [{ who: 'paul', ko: '너는 무엇을 좋아해?' }, { who: 'mia', ko: '나는 사과를 좋아해.' }],
            en: 'What do you like?', ko: '너는 무엇을 좋아해?' },
          right: { view: 'dialogue', layout: [{ obj: 'paul' }, { obj: 'milk' }],
            lines: [{ who: 'mia', ko: '나는 사과를 좋아해. 너는?' }, { who: 'paul', ko: '나는 우유를 좋아해.' }],
            en: 'What about you?', ko: '너는 어때?' },
          explainKo: ['처음 물을 때는 What do you like?예요.', '대답한 뒤 되물을 때는 What about you?라고 해요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'dialogue', layout: [{ obj: 'mia' }, { obj: 'pizza' }], promptKo: '미아가 대답하고 폴에게 되물어요. 알맞은 말을 고르세요.',
              lines: [{ who: 'mia', ko: '나는 피자를 좋아해. 너는 어때?', en: 'I like pizza.' }],
              frame: '___ about you?', options: ['What', 'Do'], correct: 0, whyKo: '되물을 때는 What about you?예요.' },
            { view: 'dialogue', layout: [{ obj: 'paul' }, { obj: 'mia' }, { obj: 'apple' }], promptKo: '폴이 미아가 좋아하는 것을 물어요. 알맞은 말을 고르세요.',
              lines: [{ who: 'paul', ko: '너는 무엇을 좋아해?' }],
              frame: 'What ___ you like?', options: ['do', 'does'], correct: 0, whyKo: 'What 다음에 do you 순서예요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'I like pizza.', layout: [{ obj: 'paul', labelKo: '나' }, { obj: 'pizza' }] },
            { en: 'I like apples.', layout: [{ obj: 'paul', labelKo: '나' }, { obj: 'apple', n: 3 }] },
            { en: 'I like milk.', layout: [{ obj: 'paul', labelKo: '나' }, { obj: 'milk' }] },
          ] },
      ],
    },
    wordsAdd: [{ en: 'like', ko: '좋아하다' }],
  },

  // ───────────── g-int-04 Can you …? ─────────────
  'g-int-04': {
    scene: {
      id: 'int04-can-you', mode: 'add', titleKo: '할 수 있어?', bgKo: '운동장', bg: 'park',
      characters: ['paul', 'mia', 'tom'],
      objects: {
        paul: { en: 'Paul', ko: '폴' },
        mia: { en: 'Mia', ko: '미아' },
        tom: { en: 'Tom', ko: '톰' },
        bike: { en: 'bike', enPlural: 'bikes', ko: '자전거' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '폴이 미아에게 물어요. 미아를 눌러 대답을 들어 보세요.',
          layout: [{ obj: 'mia', action: 'swim' }],
          lines: [{ who: 'paul', ko: '너는 수영할 수 있어?', en: 'Can you swim?' }],
          tap: { obj: 'mia', en: 'Yes, I can.', ko: '응, 할 수 있어.' },
          noteKo: '할 수 있을 때는 Yes, I can.이라고 짧게 답해요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 대화를 비교해 보세요. 대답이 어떻게 다를까요?',
          left: { view: 'dialogue', layout: [{ obj: 'mia', action: 'dance' }],
            lines: [{ who: 'paul', ko: '너는 춤출 수 있어?', en: 'Can you dance?' }, { who: 'mia', ko: '응, 춤출 수 있어!' }],
            en: 'Yes, I can.', ko: '응, 할 수 있어.' },
          right: { view: 'dialogue', layout: [{ obj: 'tom' }, { obj: 'bike' }],
            lines: [{ who: 'paul', ko: '너는 자전거를 탈 수 있어?', en: 'Can you ride a bike?' }, { who: 'tom', ko: '아니, 못 타.' }],
            en: "No, I can't.", ko: '아니, 못 해.' },
          explainKo: ['할 수 있으면 Yes, I can.', "못 하면 No, I can't.라고 해요."] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'dialogue', layout: [{ obj: 'mia', action: 'swim' }], promptKo: '대화를 보고 대답을 영어로 골라요.',
              lines: [{ who: 'paul', ko: '너는 수영할 수 있어?' }, { who: 'mia', ko: '응, 수영할 수 있어!' }],
              frame: 'Can you swim? ___', options: ['Yes, I can.', "No, I can't."], correct: 0, whyKo: '할 수 있다고 했으니까 Yes, I can.이에요.' },
            { view: 'dialogue', layout: [{ obj: 'tom' }, { obj: 'bike' }], promptKo: '대화를 보고 대답을 영어로 골라요.',
              lines: [{ who: 'paul', ko: '너는 자전거를 탈 수 있어?' }, { who: 'tom', ko: '아니, 못 타.' }],
              frame: 'Can you ride a bike? ___', options: ['Yes, I can.', "No, I can't."], correct: 1, whyKo: "못 탄다고 했으니까 No, I can't.예요." },
            { layout: [{ obj: 'mia', action: 'dance' }], promptKo: '폴이 미아에게 춤출 수 있는지 물어요. 알맞은 말을 고르세요.',
              frame: '___ you dance?', options: ['Can', 'Are'], correct: 0, whyKo: '할 수 있는지 물을 때는 Can you …?예요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'Mia can swim.', layout: [{ obj: 'mia', action: 'swim' }] },
            { en: 'Mia can ride a bike.', layout: [{ obj: 'mia', action: 'ride' }, { obj: 'bike' }] },
            { en: 'Paul can dance.', layout: [{ obj: 'paul', action: 'dance' }] },
          ] },
      ],
    },
    wordsAdd: [{ en: 'swim', ko: '수영하다' }],
  },

  // ───────────── g-int-05 지금 …하고 있어요 ─────────────
  'g-int-05': {
    scene: {
      id: 'int05-right-now', mode: 'add', titleKo: '지금 뭐 해?', bgKo: '집 거실', bg: 'home',
      characters: ['paul', 'mia', 'tom'],
      objects: {
        paul: { en: 'Paul', ko: '폴' },
        mia: { en: 'Mia', ko: '미아' },
        tom: { en: 'Tom', ko: '톰' },
        apple: { en: 'apple', enPlural: 'apples', ko: '사과' },
        milk: { en: 'milk', ko: '우유' },
        tv: { en: 'TV', ko: '텔레비전' },
        ball: { en: 'ball', enPlural: 'balls', ko: '공' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '폴이 미아에게 물어요. 미아를 눌러 보세요.',
          layout: [{ obj: 'mia', action: 'drink' }, { obj: 'milk' }],
          lines: [{ who: 'paul', ko: '너는 뭐 하고 있어?', en: 'What are you doing?' }],
          tap: { obj: 'mia', en: 'I am drinking milk.', ko: '나는 우유를 마시고 있어.' },
          noteKo: '지금 하는 일은 am·is·are + 동작 말 ing로 말해요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 그림을 비교해 보세요. am과 is는 언제 쓸까요?',
          left: { layout: [{ obj: 'paul', action: 'eat', labelKo: '나' }, { obj: 'apple' }], en: 'I am eating an apple.', ko: '나는 사과를 먹고 있어.' },
          right: { layout: [{ obj: 'mia', action: 'watch' }, { obj: 'tv' }], en: 'Mia is watching TV.', ko: '미아는 TV를 보고 있어.' },
          explainKo: ['나(I)일 때는 am, 미아처럼 한 사람이면 is를 써요.', '동작 말 끝에는 ing를 붙여요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { layout: [{ obj: 'mia', action: 'watch' }, { obj: 'tv' }], promptKo: '그림을 보고 알맞은 말을 고르세요.',
              frame: 'Mia ___ watching TV.', options: ['is', 'are'], correct: 0, whyKo: '미아 한 사람이라서 is예요.' },
            { layout: [{ obj: 'paul', action: 'eat', labelKo: '나' }, { obj: 'apple' }], promptKo: '폴이 "나"의 일을 말해요. 알맞은 말을 고르세요.',
              frame: 'I ___ eating an apple.', options: ['am', 'is'], correct: 0, whyKo: '나(I)는 am이에요.' },
            { layout: [{ obj: 'mia', action: 'play' }, { obj: 'tom', action: 'play' }, { obj: 'ball' }], promptKo: '그림을 보고 알맞은 말을 고르세요.',
              frame: 'They ___ playing ball.', options: ['are', 'is'], correct: 0, whyKo: '미아와 톰, 두 사람이라서 are예요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'I am eating an apple.', layout: [{ obj: 'paul', action: 'eat', labelKo: '나' }, { obj: 'apple' }] },
            { en: 'Mia is watching TV.', layout: [{ obj: 'mia', action: 'watch' }, { obj: 'tv' }] },
            { en: 'Tom is drinking milk.', layout: [{ obj: 'tom', action: 'drink' }, { obj: 'milk' }] },
            { en: 'Mia is playing with a ball.', layout: [{ obj: 'mia', action: 'play' }, { obj: 'ball' }] },
          ] },
      ],
    },
    wordsAdd: [],
  },

  // ───────────── g-int-06 위치 말 늘리기 ─────────────
  'g-int-06': {
    scene: {
      id: 'int06-where-cat', mode: 'add', titleKo: '어디에 있을까?', bgKo: '마당', bg: 'park',
      characters: ['paul'],
      objects: {
        cat: { en: 'cat', enPlural: 'cats', ko: '고양이' },
        dog: { en: 'dog', enPlural: 'dogs', ko: '강아지' },
        box: { en: 'box', enPlural: 'boxes', ko: '상자' },
        tree: { en: 'tree', enPlural: 'trees', ko: '나무' },
        door: { en: 'door', enPlural: 'doors', ko: '문' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '폴이 고양이를 찾아요. 고양이를 눌러 보세요.',
          layout: catIn('behind', 'box'),
          lines: [{ who: 'paul', ko: '고양이 어디 있어?', en: "Where's the cat?" }],
          tap: { obj: 'cat', en: "It's behind the box.", ko: '상자 뒤에 있어.' },
          noteKo: 'behind는 "~ 뒤에"라는 뜻이에요. behind 다음에는 of 없이 바로 the box를 써요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 그림을 비교해 보세요. 고양이 위치가 어떻게 다를까요?',
          left: { layout: catIn('next to', 'box'), en: 'It is next to the box.', ko: '상자 옆에 있어.' },
          right: { layout: catIn('in front of', 'box'), en: 'It is in front of the box.', ko: '상자 앞에 있어.' },
          explainKo: ['next to는 "옆에", in front of는 "앞에"예요.', 'in front 뒤에는 of를 꼭 붙여요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { layout: catIn('behind', 'tree'), promptKo: PREP_Q, frame: 'It is ___ the tree.', options: ['behind', 'next to', 'in front of'], correct: 0, whyKo: '고양이가 나무 뒤에 숨어 있어요.' },
            { layout: [{ obj: 'dog', at: 'next to', ref: 'box' }, { obj: 'box' }], promptKo: PREP_Q, frame: 'It is ___ the box.', options: ['in front of', 'behind', 'next to'], correct: 2, whyKo: '강아지가 상자 옆에 있어요.' },
            { layout: catIn('in front of', 'door'), promptKo: PREP_Q, frame: 'It is ___ the door.', options: ['next to', 'in front of', 'behind'], correct: 1, whyKo: '고양이가 문 앞에 있어요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'The cat is behind the tree.', layout: catIn('behind', 'tree') },
            { en: 'The dog is next to the box.', layout: [{ obj: 'dog', at: 'next to', ref: 'box' }, { obj: 'box' }] },
            { en: 'The cat is in front of the door.', layout: catIn('in front of', 'door') },
            { en: 'The dog is behind the tree.', layout: [{ obj: 'dog', at: 'behind', ref: 'tree' }, { obj: 'tree' }] },
          ] },
      ],
    },
    wordsAdd: [],
  },

  // ───────────── g-int-07 어제 있었던 일 ─────────────
  'g-int-07': {
    scene: {
      id: 'int07-yesterday', mode: 'add', titleKo: '어제와 오늘', bgKo: '집', bg: 'home',
      characters: ['paul', 'mia'],
      objects: {
        paul: { en: 'Paul', ko: '폴' },
        mia: { en: 'Mia', ko: '미아' },
        dog: { en: 'dog', enPlural: 'dogs', ko: '강아지' },
        tv: { en: 'TV', ko: '텔레비전' },
        house: { en: 'house', enPlural: 'houses', ko: '집' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'timeline', focus: 0,
          promptKo: '어제와 오늘 그림이에요. 어제의 미아를 눌러 보세요.',
          panels: [
            { labelKo: '어제', layout: [{ obj: 'mia', action: 'watch' }, { obj: 'tv' }] },
            { labelKo: '오늘', layout: [{ obj: 'mia' }, { obj: 'tv' }] },
          ],
          tap: { obj: 'mia', en: 'Mia watched TV yesterday.', ko: '미아는 어제 TV를 봤어.' },
          noteKo: '어제 한 일은 동작 말 끝에 ed를 붙여요. watch는 watched가 돼요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '어제 한 일을 비교해 보세요. 동작과 있었던 곳은 어떻게 말할까요?',
          left: { view: 'timeline', focus: 0,
            panels: [{ labelKo: '어제', layout: [{ obj: 'paul', action: 'play', labelKo: '나' }, { obj: 'dog' }] }, { labelKo: '오늘', layout: [{ obj: 'paul', labelKo: '나' }, { obj: 'dog' }] }],
            en: 'I played with my dog yesterday.', ko: '나는 어제 개랑 놀았어.' },
          right: { view: 'timeline', focus: 0,
            panels: [{ labelKo: '어제', layout: [{ obj: 'paul', at: 'in', ref: 'house', labelKo: '나' }, { obj: 'house' }] }, { labelKo: '오늘', layout: [{ obj: 'house' }] }],
            en: 'I was at home yesterday.', ko: '나는 어제 집에 있었어.' },
          explainKo: ['한 일은 play에 ed를 붙여 played라고 해요.', '있었던 일은 am을 was로 바꿔요.', 'Mia and I처럼 둘 이상이면 was가 아니라 were를 써요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'timeline', focus: 0, promptKo: '어제 있었던 일이에요. 알맞은 말을 고르세요.',
              panels: [{ labelKo: '어제', layout: [{ obj: 'mia', action: 'watch' }, { obj: 'tv' }] }, { labelKo: '오늘', layout: [{ obj: 'mia' }, { obj: 'tv' }] }],
              frame: 'Mia ___ TV yesterday.', options: ['watched', 'watch'], correct: 0, whyKo: '어제 한 일이라서 watched예요.' },
            { view: 'timeline', focus: 0, promptKo: '어제 있었던 일이에요. 알맞은 말을 고르세요.',
              panels: [{ labelKo: '어제', layout: [{ obj: 'paul', action: 'play', labelKo: '나' }, { obj: 'dog' }] }, { labelKo: '오늘', layout: [{ obj: 'paul', labelKo: '나' }, { obj: 'dog' }] }],
              frame: 'I ___ with my dog yesterday.', options: ['play', 'played'], correct: 1, whyKo: '어제 한 일이라서 played예요.' },
            { view: 'timeline', focus: 0, promptKo: '어제 폴(나)과 미아가 집에 있었어요. 알맞은 말을 고르세요.',
              panels: [{ labelKo: '어제', layout: [{ obj: 'paul', at: 'in', ref: 'house', labelKo: '나' }, { obj: 'mia', at: 'in front of', ref: 'house' }, { obj: 'house' }] }, { labelKo: '오늘', layout: [{ obj: 'house' }] }],
              frame: 'Mia and I ___ at home yesterday.', options: ['were', 'was'], correct: 0, whyKo: '미아와 나, 두 사람이라서 were예요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'I played with my dog yesterday.', view: 'timeline', focus: 0,
              panels: [{ labelKo: '어제', layout: [{ obj: 'paul', action: 'play', labelKo: '나' }, { obj: 'dog' }] }, { labelKo: '오늘', layout: [{ obj: 'paul', labelKo: '나' }, { obj: 'dog' }] }] },
            { en: 'Mia watched TV yesterday.', view: 'timeline', focus: 0,
              panels: [{ labelKo: '어제', layout: [{ obj: 'mia', action: 'watch' }, { obj: 'tv' }] }, { labelKo: '오늘', layout: [{ obj: 'mia' }, { obj: 'tv' }] }] },
            { en: 'I was at home yesterday.', view: 'timeline', focus: 0,
              panels: [{ labelKo: '어제', layout: [{ obj: 'paul', at: 'in', ref: 'house', labelKo: '나' }, { obj: 'house' }] }, { labelKo: '오늘', layout: [{ obj: 'house' }] }] },
          ] },
      ],
    },
    wordsAdd: [{ en: 'watch', ko: '보다' }, { en: 'play', ko: '놀다' }],
  },

  // ───────────── g-int-08 Would you like …? ─────────────
  'g-int-08': {
    scene: {
      id: 'int08-cafe', mode: 'add', titleKo: '카페에서', bgKo: '카페 앞 거리', bg: 'street',
      characters: ['paul', 'mia'],
      objects: {
        paul: { en: 'Paul', ko: '폴' },
        mia: { en: 'Mia', ko: '미아' },
        cake: { en: 'cake', enPlural: 'cakes', ko: '케이크' },
        pizza: { en: 'pizza', enPlural: 'pizzas', ko: '피자' },
        milk: { en: 'milk', ko: '우유' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '미아가 폴에게 케이크를 권해요. 케이크를 눌러 폴의 대답을 들어 보세요.',
          layout: [{ obj: 'mia' }, { obj: 'cake' }, { obj: 'paul' }],
          lines: [{ who: 'mia', ko: '케이크 좀 먹을래?', en: 'Would you like some cake?' }],
          tap: { obj: 'cake', en: 'Yes, please.', ko: '응, 줘.' },
          noteKo: '받고 싶을 때는 Yes, please.라고 해요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 대화를 비교해 보세요. 권하는 말과 원하는 말은 어떻게 다를까요?',
          left: { view: 'dialogue', layout: [{ obj: 'mia' }, { obj: 'cake' }],
            lines: [{ who: 'mia', ko: '케이크 좀 먹을래?' }],
            en: 'Would you like some cake?', ko: '케이크 좀 먹을래?' },
          right: { view: 'dialogue', layout: [{ obj: 'paul' }, { obj: 'cake' }],
            lines: [{ who: 'paul', ko: '저는 케이크가 먹고 싶어요.' }],
            en: 'I would like some cake, please.', ko: '케이크 좀 주세요.' },
          explainKo: ['권할 때는 Would you like …?라고 물어요.', '내가 원할 때는 I would like …라고 해요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'dialogue', layout: [{ obj: 'mia' }, { obj: 'milk' }], promptKo: '미아가 폴에게 우유를 권해요. 알맞은 말을 고르세요.',
              lines: [{ who: 'mia', ko: '우유 좀 마실래?' }],
              frame: '___ you like some milk?', options: ['Would', 'Are'], correct: 0, whyKo: '정중하게 권할 때는 Would you like …?예요.' },
            { view: 'dialogue', layout: [{ obj: 'mia' }, { obj: 'cake' }, { obj: 'paul' }], promptKo: '대화를 보고 폴의 대답을 골라요.',
              lines: [{ who: 'mia', ko: '케이크 좀 먹을래?' }, { who: 'paul', ko: '응, 주세요!' }],
              frame: 'Would you like some cake? ___', options: ['Yes, please.', 'No, thank you.'], correct: 0, whyKo: '받고 싶다고 했으니까 Yes, please.예요.' },
            { view: 'dialogue', layout: [{ obj: 'paul' }, { obj: 'cake' }], promptKo: '폴이 케이크를 달라고 말해요. 알맞은 말을 고르세요.',
              lines: [{ who: 'paul', ko: '저는 케이크가 먹고 싶어요.' }],
              frame: 'I ___ like some cake, please.', options: ['would', 'am'], correct: 0, whyKo: '내가 원할 때는 I would like …예요.' },
            { view: 'dialogue', layout: [{ obj: 'mia' }, { obj: 'pizza' }, { obj: 'paul' }], promptKo: '대화를 보고 폴의 대답을 골라요.',
              lines: [{ who: 'mia', ko: '피자 좀 먹을래?' }, { who: 'paul', ko: '아니, 괜찮아요.' }],
              frame: 'Would you like some pizza? ___', options: ['Yes, please.', 'No, thank you.'], correct: 1, whyKo: '괜찮다고 했으니까 No, thank you.예요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'Would you like some cake?', layout: [{ obj: 'mia' }, { obj: 'cake' }] },
            { en: 'Would you like some milk?', layout: [{ obj: 'mia' }, { obj: 'milk' }] },
            { en: 'Would you like some pizza?', layout: [{ obj: 'mia' }, { obj: 'pizza' }] },
          ] },
      ],
    },
    wordsAdd: [{ en: 'like', ko: '좋아하다' }],
  },
}
