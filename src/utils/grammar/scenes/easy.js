// Easy scenes (content draft 2026-10-10, teacher review pending)
const PAUL = { en: 'Paul', ko: '폴' }
const MIA = { en: 'Mia', ko: '미아' }
const P = '그림을 보고 빈칸에 알맞은 말을 고르세요.'

// g-easy-01: Paul asks Mia, the thing sits next to Mia
const ask = (obj) => [{ obj: 'paul', labelKo: '폴' }, { obj: 'mia', labelKo: '미아' }, { obj, ...(obj === 'pencil' ? { size: 'l' } : {}), at: 'next to', ref: 'mia' }]
// g-easy-02: an object in a relation to a reference object
const where = (obj, at, ref) => [{ obj, at, ref }, { obj: ref }]
// g-easy-06: Paul likes (or does not like) the food
const me = (neg, ...rest) => [{ obj: 'paul', action: 'like', ...(neg ? { neg: true } : {}), labelKo: '폴' }, ...rest]
// g-easy-04: one character doing an action (neg = crossed out = can't)
const doer = (obj, action, neg) => [{ obj, action, ...(neg ? { neg: true } : {}), labelKo: obj === 'mia' ? '미아' : '폴' }]
// g-easy-08: book near Paul, bag far away
const BF = [{ obj: 'paul' }, { obj: 'book', dist: 'near' }, { obj: 'bag', dist: 'far' }]

export default {
  // ───────────── g-easy-01 Can I …? ─────────────
  'g-easy-01': {
    scene: {
      id: 'easy01-borrow', mode: 'add', titleKo: '미아에게 빌려요', bgKo: '교실', bg: 'school',
      characters: ['paul', 'mia'],
      objects: {
        paul: PAUL, mia: MIA,
        pencil: { en: 'pencil', enPlural: 'pencils', ko: '연필' },
        ball: { en: 'ball', enPlural: 'balls', ko: '공' },
        book: { en: 'book', enPlural: 'books', ko: '책' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견',
          promptKo: '폴이 미아의 연필을 빌리고 싶어 해요. 연필을 눌러 보세요.',
          layout: ask('pencil'),
          lines: [{ who: 'paul', ko: '미아야, 연필 좀 빌려도 돼?' }],
          tap: { obj: 'pencil', en: 'Can I borrow your pencil?', ko: '네 연필 빌려도 돼?' },
          noteKo: '남의 물건을 빌리고 싶을 때는 Can I borrow …?라고 물어요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 그림을 비교해 보세요. 누가 무슨 말을 할까요?',
          left: { layout: ask('pencil'), en: 'Can I borrow your pencil?', ko: '네 연필 빌려도 돼?' },
          right: { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'paul', labelKo: '폴' }, { obj: 'pencil', size: 'l', at: 'next to', ref: 'paul' }], en: 'Sure. Here you are!', ko: '그래. 여기 있어!' },
          explainKo: ['빌려 달라고 할 때는 Can I borrow …?라고 해요.', '빌려줄 때는 Sure. Here you are!라고 대답해요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { layout: ask('pencil'), promptKo: P, lines: [{ who: 'paul', ko: '연필 좀 빌려도 돼?' }],
              frame: 'Can I ___ your pencil?', options: ['borrows', 'borrow'], correct: 1,
              whyKo: 'Can I 뒤에는 borrow를 그대로 써요. s는 붙이지 않아요.' },
            { layout: ask('book'), promptKo: '폴이 미아의 책을 빌리고 싶어요. 알맞은 말을 고르세요.',
              frame: 'Can I borrow ___ book?', options: ['your', 'you'], correct: 0,
              whyKo: '"네 책"은 your book이에요. you는 "너"라는 뜻이라 book 앞에 쓰지 않아요.' },
            { layout: [{ obj: 'paul', labelKo: '폴' }, { obj: 'mia', labelKo: '미아' }, { obj: 'ball', at: 'next to', ref: 'mia' }],
              promptKo: '폴이 미아의 공을 빌리고 싶어요. 폴은 뭐라고 말할까요?',
              lines: [{ who: 'mia', ko: '이건 내 공이야.' }, { who: 'paul', ko: '그 공 좀 빌려도 돼?' }],
              frame: 'Can I borrow ___ ball?', options: ['my', 'your'], correct: 1,
              whyKo: '공은 미아의 것이에요. 미아의 물건은 your를 붙여요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          promptKo: '문장을 읽고 알맞은 그림과 이어 보세요.',
          pairs: [
            { en: 'Can I borrow your pencil?', layout: ask('pencil') },
            { en: 'Can I borrow your ball?', layout: ask('ball') },
            { en: 'Can I borrow your book?', layout: ask('book') },
          ] },
      ],
    },
    wordsAdd: [{ en: 'borrows', ko: '빌린다' }],
  },

  // ───────────── g-easy-02 Where's …? ─────────────
  'g-easy-02': {
    scene: {
      id: 'easy02-where', mode: 'add', titleKo: '공이 어디 있지?', bgKo: '우리 집', bg: 'home',
      characters: ['paul'],
      objects: {
        paul: PAUL,
        ball: { en: 'ball', enPlural: 'balls', ko: '공' },
        cat: { en: 'cat', enPlural: 'cats', ko: '고양이' },
        box: { en: 'box', enPlural: 'boxes', ko: '상자' },
        chair: { en: 'chair', enPlural: 'chairs', ko: '의자' },
        desk: { en: 'desk', enPlural: 'desks', ko: '책상' },
        bag: { en: 'bag', enPlural: 'bags', ko: '가방' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견',
          promptKo: '폴이 공을 찾고 있어요. 공을 눌러 어디 있는지 확인해요.',
          layout: where('ball', 'in', 'box'),
          lines: [{ who: 'paul', ko: '내 공 어디 있지?', en: "Where's my ball?" }],
          tap: { obj: 'ball', en: "It's in the box.", ko: '상자 안에 있어.' },
          noteKo: "어디 있는지 물으면 It's 다음에 in(안)·on(위)·under(밑)를 말해요." },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 그림을 비교해 보세요. 공이 어디에 있나요?',
          left: { layout: where('ball', 'in', 'box'), en: "It's in the box.", ko: '상자 안에 있어.' },
          right: { layout: where('ball', 'on', 'box'), en: "It's on the box.", ko: '상자 위에 있어.' },
          explainKo: ['in은 "안에", on은 "위에"라는 뜻이에요.', "대답은 It's로 시작해요."] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { layout: where('ball', 'under', 'box'), promptKo: '공이 어디 있나요? 알맞은 말을 고르세요.',
              frame: "It's ___ the box.", options: ['in', 'under', 'on'], correct: 1,
              whyKo: '공이 상자 밑에 있어요. "밑에"는 under예요.' },
            { layout: where('cat', 'on', 'chair'), promptKo: '고양이가 어디 있나요? 알맞은 말을 고르세요.',
              frame: "It's ___ the chair.", options: ['on', 'under'], correct: 0,
              whyKo: '고양이가 의자 위에 있어요. "위에"는 on이에요.' },
            { layout: where('ball', 'in', 'bag'), promptKo: '공이 어디 있나요? 알맞은 말을 고르세요.',
              frame: "It's ___ the bag.", options: ['under', 'on', 'in'], correct: 2,
              whyKo: '공이 가방 안에 있어요. "안에"는 in이에요.' },
            { layout: where('bag', 'under', 'desk'), promptKo: '가방이 어디 있나요? 알맞은 말을 고르세요.',
              frame: "It's ___ the desk.", options: ['in', 'under'], correct: 1,
              whyKo: '가방이 책상 밑에 있어요. under를 써요.' },
          ] },

        { kind: 'build', stepKo: '만들기',
          promptKo: '공을 상자 안·위·밑 중 한 곳에 놓고, 문장을 완성해요.',
          place: { obj: 'ball', ref: 'box', relations: ['in', 'on', 'under'] },
          frameEn: 'The ball is ___ the box.',
          layout: [{ obj: 'box' }],
          whyKo: '공을 놓은 자리에 맞는 말을 골라요. 안은 in, 위는 on, 밑은 under예요.' },
      ],
    },
    wordsAdd: [],
  },

  // ───────────── g-easy-03 am · is · are ─────────────
  'g-easy-03': {
    scene: {
      id: 'easy03-friends', mode: 'add', titleKo: '나와 친구들', bgKo: '공원', bg: 'park',
      characters: ['paul', 'mia'],
      objects: { paul: PAUL, mia: MIA },
      steps: [
        { kind: 'discover', stepKo: '발견',
          promptKo: '폴(나)과 미아가 있어요. 미아를 눌러 보세요.',
          layout: [{ obj: 'paul', labelKo: '나' }, { obj: 'mia', labelKo: '미아' }],
          tap: { obj: 'mia', en: 'Mia is my friend.', ko: '미아는 내 친구야.' },
          noteKo: 'Mia 뒤에는 is를 써요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 그림을 비교해 보세요. 나 혼자일 때와 우리일 때 말이 어떻게 다를까요?',
          left: { layout: [{ obj: 'paul', labelKo: '나' }], en: 'I am Paul.', ko: '나는 폴이야.' },
          right: { layout: [{ obj: 'paul', labelKo: '우리' }, { obj: 'mia', labelKo: '우리' }], en: 'We are friends.', ko: '우리는 친구야.' },
          explainKo: ['나(I) 뒤에는 am을 써요.', '우리(We) 뒤에는 are를 써요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { layout: [{ obj: 'paul', labelKo: '나' }], promptKo: P,
              frame: 'I ___ Paul.', options: ['is', 'are', 'am'], correct: 2,
              whyKo: '나(I) 뒤에는 am이에요.' },
            { layout: [{ obj: 'paul', labelKo: '나' }, { obj: 'mia', labelKo: '미아' }], promptKo: '미아를 소개해요. ' + P,
              frame: 'Mia ___ my friend.', options: ['is', 'are', 'am'], correct: 0,
              whyKo: 'Mia 뒤에는 is를 써요.' },
            { layout: [{ obj: 'paul', labelKo: '우리' }, { obj: 'mia', labelKo: '우리' }], promptKo: P,
              frame: 'We ___ friends.', options: ['am', 'is', 'are'], correct: 2,
              whyKo: 'We 뒤에는 are를 써요.' },
            { layout: [{ obj: 'paul', labelKo: '나' }, { obj: 'mia', labelKo: '너' }], promptKo: '폴이 미아에게 말해요. ' + P,
              lines: [{ who: 'paul', ko: '미아야, 너는 내 친구야.' }],
              frame: 'You ___ my friend.', options: ['are', 'is', 'am'], correct: 0,
              whyKo: '너(You) 뒤에는 are를 써요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          promptKo: '문장을 읽고 알맞은 그림과 이어 보세요.',
          pairs: [
            { en: 'I am Paul.', layout: [{ obj: 'paul', labelKo: '나' }], lines: [{ who: 'paul', ko: '안녕, 나는 폴이야.' }] },
            { en: 'You are my friend.', layout: [{ obj: 'paul', labelKo: '나' }, { obj: 'mia', labelKo: '너' }], lines: [{ who: 'paul', ko: '미아야, 너는 내 친구야.' }] },
            { en: 'Mia is my friend.', layout: [{ obj: 'paul', labelKo: '나' }, { obj: 'mia', labelKo: '미아' }], lines: [{ who: 'paul', ko: '얘는 미아야. 내 친구야.' }] },
            { en: 'We are friends.', layout: [{ obj: 'paul', labelKo: '우리' }, { obj: 'mia', labelKo: '우리' }], lines: [{ who: 'paul', ko: '우리는 친구야.' }] },
          ] },
      ],
    },
    wordsAdd: [],
  },

  // ───────────── g-easy-04 can ─────────────
  'g-easy-04': {
    scene: {
      id: 'easy04-can', mode: 'add', titleKo: '무엇을 할 수 있을까?', bgKo: '공원', bg: 'park',
      characters: ['paul', 'mia'],
      objects: {
        paul: PAUL, mia: MIA,
      },
      steps: [
        { kind: 'discover', stepKo: '발견',
          promptKo: '폴과 미아가 각자 할 수 있는 일을 하고 있어요. 폴을 눌러 보세요.',
          layout: [{ obj: 'paul', action: 'run', labelKo: '폴' }, { obj: 'mia', action: 'jump', labelKo: '미아' }],
          tap: { obj: 'paul', en: 'I can run.', ko: '나는 달릴 수 있어.' },
          noteKo: 'can 뒤에는 run, jump 같은 동작 말을 그대로 써요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 그림을 비교해 보세요. 수영을 할 수 있을까요?',
          left: { layout: doer('paul', 'swim'), en: 'I can swim.', ko: '나는 수영할 수 있어.' },
          right: { layout: doer('paul', 'swim', true), en: "I can't swim.", ko: '나는 수영을 못 해.' },
          explainKo: ["할 수 있으면 can, 못 하면 can't를 써요.", "can't는 can과 not을 합친 말이에요."] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { layout: doer('paul', 'run'), promptKo: P,
              frame: 'I ___ run.', options: ["can't", 'can'], correct: 1,
              whyKo: '그림에서 폴은 달릴 수 있어요. 할 수 있을 때는 can이에요.' },
            { layout: doer('mia', 'swim', true), promptKo: P,
              frame: 'Mia ___ swim.', options: ["can't", 'can'], correct: 0,
              whyKo: "그림에서 미아는 수영을 못 해요. 못 할 때는 can't를 써요." },
            { layout: doer('mia', 'jump'), promptKo: P,
              frame: 'Mia can ___.', options: ['jump', 'jumps'], correct: 0,
              whyKo: 'can 뒤에는 jump를 그대로 써요. s를 붙이지 않아요.' },
            { layout: doer('paul', 'sing', true), promptKo: P,
              frame: 'I ___ sing.', options: ["can't", 'can'], correct: 0,
              whyKo: "그림에서 폴은 노래를 못 해요. 못 할 때는 can't예요." },
          ] },

        { kind: 'listen', stepKo: '듣기',
          items: [
            { en: 'I can swim.',
              options: [{ layout: doer('paul', 'swim') }, { layout: doer('paul', 'run') }, { layout: doer('paul', 'sing') }],
              correct: 0, whyKo: 'swim은 수영하다예요. 수영하는 그림이 맞아요.' },
            { en: "I can't swim.",
              options: [{ layout: doer('paul', 'swim') }, { layout: doer('paul', 'swim', true) }, { layout: doer('paul', 'run') }],
              correct: 1, whyKo: "can't는 못 한다는 뜻이에요. 수영을 못 하는 그림이 맞아요." },
            { en: 'Mia can sing.',
              options: [{ layout: doer('mia', 'run') }, { layout: doer('paul', 'sing') }, { layout: doer('mia', 'sing') }],
              correct: 2, whyKo: 'Mia가 노래(sing)하는 그림이 맞아요.' },
          ] },
      ],
    },
    wordsAdd: [{ en: 'jumps', ko: '뛴다' }],
  },

  // ───────────── g-easy-06 I like ─────────────
  'g-easy-06': {
    scene: {
      id: 'easy06-food', mode: 'add', titleKo: '무엇을 좋아해?', bgKo: '우리 집', bg: 'home',
      characters: ['paul'],
      objects: {
        paul: PAUL,
        apple: { en: 'apple', enPlural: 'apples', ko: '사과' },
        milk: { en: 'milk', ko: '우유' },
        pizza: { en: 'pizza', enPlural: 'pizzas', ko: '피자' },
        cake: { en: 'cake', enPlural: 'cakes', ko: '케이크' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견',
          promptKo: '폴이 사과를 보고 웃어요. 사과를 눌러 보세요.',
          layout: me(false, { obj: 'apple', n: 3 }),
          tap: { obj: 'apple', en: 'I like apples.', ko: '나는 사과를 좋아해.' },
          noteKo: '좋아하는 것은 I like 뒤에 말해요. am은 필요 없어요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 그림을 비교해 보세요. 폴은 우유를 좋아할까요?',
          left: { layout: me(false, { obj: 'milk' }), en: 'I like milk.', ko: '나는 우유를 좋아해.' },
          right: { layout: me(true, { obj: 'milk' }), en: "I don't like milk.", ko: '나는 우유를 안 좋아해.' },
          explainKo: ["좋아하면 I like, 안 좋아하면 I don't like예요.", 'don\'t는 do not을 줄인 말이에요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { layout: me(false, { obj: 'pizza' }), promptKo: P,
              frame: '___ pizza.', options: ['I like', "I don't like"], correct: 0,
              whyKo: '그림에서 폴은 피자를 좋아해요. 좋아할 때는 I like예요.' },
            { layout: me(true, { obj: 'cake' }), promptKo: P,
              frame: '___ cake.', options: ['I like', "I don't like"], correct: 1,
              whyKo: "그림에서 폴은 케이크를 안 좋아해요. 안 좋아할 때는 I don't like예요." },
            { layout: me(false, { obj: 'apple', n: 2 }), promptKo: P,
              frame: 'I like ___.', options: ['apple', 'apples'], correct: 1,
              whyKo: '사과가 두 개예요. 여러 개일 때는 apples라고 해요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          promptKo: '문장을 읽고 알맞은 그림과 이어 보세요.',
          pairs: [
            { en: 'I like milk.', layout: me(false, { obj: 'milk' }) },
            { en: "I don't like milk.", layout: me(true, { obj: 'milk' }) },
            { en: 'I like pizza.', layout: me(false, { obj: 'pizza' }) },
            { en: "I don't like pizza.", layout: me(true, { obj: 'pizza' }) },
          ] },
      ],
    },
    wordsAdd: [],
  },

  // ───────────── g-easy-07 Do you …? ─────────────
  'g-easy-07': {
    scene: {
      id: 'easy07-ask', mode: 'add', titleKo: '미아가 물어봐요', bgKo: '교실', bg: 'school',
      characters: ['paul', 'mia'],
      objects: {
        paul: PAUL, mia: MIA,
        pizza: { en: 'pizza', enPlural: 'pizzas', ko: '피자' },
        milk: { en: 'milk', ko: '우유' },
        apple: { en: 'apple', enPlural: 'apples', ko: '사과' },
        dog: { en: 'dog', enPlural: 'dogs', ko: '강아지' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견',
          promptKo: '미아가 폴에게 물어봐요. 피자를 눌러 미아의 질문을 확인해요.',
          layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'paul', labelKo: '폴' }, { obj: 'pizza' }],
          lines: [{ who: 'mia', ko: '너는 피자를 좋아해?' }],
          tap: { obj: 'pizza', en: 'Do you like pizza?', ko: '너는 피자를 좋아해?' },
          noteKo: '친구에게 "…해?" 하고 물을 때는 Do you …?로 시작해요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 그림을 비교해 보세요. 폴은 어떻게 대답했을까요?',
          left: { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'paul', labelKo: '폴' }, { obj: 'pizza' }], lines: [{ who: 'mia', ko: '피자 좋아해?' }, { who: 'paul', ko: '응, 좋아해!' }], en: 'Yes, I do.', ko: '응, 좋아해.' },
          right: { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'paul', labelKo: '폴' }, { obj: 'pizza' }], lines: [{ who: 'mia', ko: '피자 좋아해?' }, { who: 'paul', ko: '아니, 안 좋아해.' }], en: "No, I don't.", ko: '아니, 안 좋아해.' },
          explainKo: ["좋아하면 Yes, I do. 안 좋아하면 No, I don't.라고 짧게 답해요."] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'paul', labelKo: '폴' }, { obj: 'pizza' }], promptKo: '미아가 피자를 좋아하는지 물어요. ' + P,
              lines: [{ who: 'mia', ko: '너는 피자를 좋아해?' }],
              frame: 'Do you ___ pizza?', options: ['likes', 'like'], correct: 1,
              whyKo: 'Do you 뒤에는 like를 그대로 써요.' },
            { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'paul', labelKo: '폴' }, { obj: 'milk' }], promptKo: '폴은 우유를 좋아해요. 짧게 대답해요.',
              lines: [{ who: 'mia', ko: '우유 좋아해?' }, { who: 'paul', ko: '응, 좋아해!' }],
              frame: 'Yes, I ___.', options: ["don't", 'do'], correct: 1,
              whyKo: "좋아해서 Yes예요. Yes 뒤에는 do, don't는 No와 함께 써요." },
            { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'paul', labelKo: '폴' }, { obj: 'dog' }], promptKo: '폴은 강아지를 안 좋아해요. 짧게 대답해요.',
              lines: [{ who: 'mia', ko: '강아지 좋아해?' }, { who: 'paul', ko: '아니, 안 좋아해.' }],
              frame: 'No, I ___.', options: ['do', "don't"], correct: 1,
              whyKo: "안 좋아해서 No예요. No 뒤에는 don't를 써요." },
            { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'paul', labelKo: '폴' }, { obj: 'dog' }], promptKo: '미아가 폴에게 강아지가 있는지 물어요. ' + P,
              lines: [{ who: 'mia', ko: '너 강아지 있어?' }],
              frame: 'Do you ___ a dog?', options: ['has', 'have'], correct: 1,
              whyKo: 'Do you 뒤에는 have를 그대로 써요.' },
          ] },

        { kind: 'listen', stepKo: '듣기',
          items: [
            { en: 'Do you like milk?',
              options: [
                { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'milk' }], lines: [{ who: 'mia', ko: '우유 좋아해?' }] },
                { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'pizza' }], lines: [{ who: 'mia', ko: '피자 좋아해?' }] },
                { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'apple', n: 2 }], lines: [{ who: 'mia', ko: '사과 좋아해?' }] },
              ], correct: 0, whyKo: 'milk는 우유예요. 우유를 묻는 그림이 맞아요.' },
            { en: 'Do you like apples?',
              options: [
                { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'dog' }], lines: [{ who: 'mia', ko: '강아지 좋아해?' }] },
                { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'milk' }], lines: [{ who: 'mia', ko: '우유 좋아해?' }] },
                { layout: [{ obj: 'mia', labelKo: '미아' }, { obj: 'apple', n: 2 }], lines: [{ who: 'mia', ko: '사과 좋아해?' }] },
              ], correct: 2, whyKo: 'apples는 사과예요. 사과를 묻는 그림이 맞아요.' },
          ] },
      ],
    },
    wordsAdd: [{ en: 'likes', ko: '좋아한다' }, { en: 'has', ko: '가지고 있다' }],
  },

  // ───────────── g-easy-08 This · That ─────────────
  'g-easy-08': {
    scene: {
      id: 'easy08-near-far', mode: 'add', titleKo: '가까운 것, 먼 것', bgKo: '교실', bg: 'school',
      characters: ['paul'],
      objects: {
        paul: PAUL,
        book: { en: 'book', enPlural: 'books', ko: '책' },
        bag: { en: 'bag', enPlural: 'bags', ko: '가방' },
        chair: { en: 'chair', enPlural: 'chairs', ko: '의자' },
        cat: { en: 'cat', enPlural: 'cats', ko: '고양이' },
      },
      steps: [
        { kind: 'discover', stepKo: '발견',
          promptKo: '폴 가까이에 책이, 멀리에 가방이 있어요. 가까운 책을 눌러 보세요.',
          layout: BF,
          tap: { obj: 'book', en: 'This is my book.', ko: '이것은 내 책이야.' },
          noteKo: '가까운 것은 This, 먼 것은 That이에요.' },

        { kind: 'compare', stepKo: '비교',
          promptKo: '두 그림을 비교해 보세요. 책이 어디에 있나요?',
          left: { layout: BF, en: 'This is my book.', ko: '이것은 내 책이야.' },
          right: { layout: [{ obj: 'paul' }, { obj: 'book', dist: 'far' }, { obj: 'bag', dist: 'near' }], en: 'That is my book.', ko: '저것은 내 책이야.' },
          explainKo: ['가까이 있으면 This, 멀리 있으면 That을 써요.', 'This is, That is처럼 is는 그대로 써요.'] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { layout: BF, promptKo: P,
              frame: '___ is my book.', options: ['This', 'That'], correct: 0,
              whyKo: '책이 폴 가까이에 있어요. 가까운 것은 This예요.' },
            { layout: BF, promptKo: P,
              frame: '___ is your bag.', options: ['This', 'That'], correct: 1,
              whyKo: '가방이 멀리 있어요. 먼 것은 That이에요.' },
            { layout: [{ obj: 'paul' }, { obj: 'chair', dist: 'far' }, { obj: 'cat', dist: 'near' }], promptKo: P,
              frame: 'That ___ your chair.', options: ['are', 'is'], correct: 1,
              whyKo: '의자는 하나예요. That 뒤에는 is를 써요.' },
            { layout: [{ obj: 'paul' }, { obj: 'cat', dist: 'near' }, { obj: 'chair', dist: 'far' }], promptKo: P,
              frame: '___ is my cat.', options: ['That', 'This'], correct: 1,
              whyKo: '고양이가 폴 가까이에 있어요. 가까운 것은 This예요.' },
            { layout: [{ obj: 'paul' }, { obj: 'cat', dist: 'far' }, { obj: 'chair', dist: 'near' }], promptKo: P,
              frame: '___ is my cat.', options: ['That', 'This'], correct: 0,
              whyKo: '고양이가 멀리 있어요. 먼 것은 That이에요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          promptKo: '문장을 읽고 알맞은 그림과 이어 보세요.',
          pairs: [
            { en: 'This is my cat.', layout: [{ obj: 'paul' }, { obj: 'cat', dist: 'near' }] },
            { en: 'That is my cat.', layout: [{ obj: 'paul' }, { obj: 'cat', dist: 'far' }] },
            { en: 'This is my book.', layout: [{ obj: 'paul' }, { obj: 'book', dist: 'near' }] },
            { en: 'That is my book.', layout: [{ obj: 'paul' }, { obj: 'book', dist: 'far' }] },
          ] },
      ],
    },
    wordsAdd: [],
  },
}
