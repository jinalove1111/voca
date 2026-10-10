// High School scenes (content draft 2026-10-10, teacher review pending)
const PAUL = { en: 'Paul', ko: '폴' }
const MIA = { en: 'Mia', ko: '미아' }
const TEACHER = { en: 'teacher', enPlural: 'teachers', ko: '선생님' }
const KID = { en: 'kid', enPlural: 'kids', ko: '아이' }
const BOOK = { en: 'book', enPlural: 'books', ko: '책' }
const CAKE = { en: 'cake', enPlural: 'cakes', ko: '케이크' }
const DESK = { en: 'desk', enPlural: 'desks', ko: '책상' }
const KEY = { en: 'key', enPlural: 'keys', ko: '열쇠' }
const DOG = { en: 'dog', enPlural: 'dogs', ko: '강아지' }
const MONEY = { en: 'money', ko: '돈' }
const CLOCK = { en: 'clock', enPlural: 'clocks', ko: '시계' }
const SCHOOL = { en: 'school', enPlural: 'schools', ko: '학교' }
const BENCH = { en: 'bench', enPlural: 'benches', ko: '벤치' }
const HOUSE = { en: 'house', enPlural: 'houses', ko: '집' }
const HW = { en: 'homework', ko: '숙제' }

export default {
  'g-high-01': {
    scene: {
      id: 'high01-perfect', mode: 'add', titleKo: '미아의 시간표', bgKo: '동네 집 앞', bg: 'street',
      characters: ['paul', 'mia', 'teacher'],
      objects: { paul: PAUL, mia: MIA, teacher: TEACHER, house: HOUSE, homework: HW },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'timeline',
          promptKo: '미아의 시간표를 보세요. 2020년부터 지금까지 어디에 살았을까요? 미아를 눌러 보세요.',
          panels: [
            { labelKo: '2020년', layout: [{ obj: 'mia' }, { obj: 'house' }] },
            { labelKo: '작년', layout: [{ obj: 'mia' }, { obj: 'house' }] },
            { labelKo: '지금', layout: [{ obj: 'mia' }, { obj: 'house' }] },
          ],
          tap: { obj: 'mia', en: 'Mia has lived here since 2020.', ko: '미아는 2020년부터 여기서 살고 있어.' },
          noteKo: '과거(2020년)에 시작해 지금까지 이어지는 일은 has/have + p.p.로 말해요. 시작 시점은 since, 기간은 for로 나타내요.' },

        { kind: 'compare', stepKo: '비교', view: 'timeline',
          promptKo: '두 시간표를 비교해 보세요. 미아는 지금도 여기 살고 있을까요?',
          left: { view: 'timeline',
            panels: [
              { labelKo: '2020년', layout: [{ obj: 'mia' }, { obj: 'house' }] },
              { labelKo: '지금: 아직 살고 있어요', layout: [{ obj: 'mia' }, { obj: 'house' }] },
            ],
            en: 'Mia has lived here since 2020.', ko: '미아는 2020년부터 지금까지 여기서 살고 있어.' },
          right: { view: 'timeline',
            panels: [
              { labelKo: '2020년', layout: [{ obj: 'mia' }, { obj: 'house' }] },
              { labelKo: '지금: 미아는 이사 갔어요', layout: [{ obj: 'house' }] },
            ],
            en: 'Mia lived here in 2020.', ko: '미아는 2020년에 여기서 살았어. (지금은 아님)' },
          explainKo: [
            '왼쪽은 과거부터 지금까지 이어지는 일이라 has lived(현재완료)를 써요.',
            '오른쪽은 과거에 끝난 일이라 lived(단순과거)만 써요. 지금과의 연결 여부가 기준이에요.',
            '현재완료는 지금과 연결된 일, 단순과거는 그 시점에 끝난 일이라고 기억하세요.',
          ] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'timeline', promptKo: '시간표를 보고 빈칸에 알맞은 말을 고르세요.',
              panels: [
                { labelKo: '2020년', layout: [{ obj: 'mia' }, { obj: 'house' }] },
                { labelKo: '지금: 지금도 여기 살아요', layout: [{ obj: 'mia' }, { obj: 'house' }] },
              ],
              frame: 'Mia ___ here since 2020.', options: ['lived', 'has lived', 'have lived'], correct: 1,
              whyKo: '2020년부터 지금까지 이어지는 일이고, Mia는 한 사람이라 has lived를 써요. since가 있으면 단순과거(lived)는 쓰지 않아요.' },
            { view: 'timeline', promptKo: '두 사람이 알고 지낸 기간을 보고 고르세요.',
              panels: [
                { labelKo: '1년 전: 처음 알게 됐어요', layout: [{ obj: 'paul' }, { obj: 'mia' }] },
                { labelKo: '지금: 지금도 알고 지내요', layout: [{ obj: 'paul' }, { obj: 'mia' }] },
              ],
              frame: 'I ___ Mia for a year.', options: ['know', 'has known', 'have known'], correct: 2,
              whyKo: 'for a year처럼 기간이 이어질 때는 현재완료예요. 주어 I 뒤에는 have를 써요.' },
            { view: 'dialogue', promptKo: '대화를 읽고 빈칸에 알맞은 말을 고르세요.',
              layout: [{ obj: 'teacher' }, { obj: 'mia', labelKo: '숙제를 끝냈어요' }, { obj: 'homework' }],
              lines: [
                { who: 'teacher', ko: '숙제 다 했니?', en: 'Have you finished your homework?' },
                { who: 'mia', ko: '네, 방금 다 끝냈어요.' },
              ],
              frame: 'Mia ___ her homework.', options: ['has finished', 'have finished', 'finish'], correct: 0,
              whyKo: '방금 끝낸 일의 결과가 지금 남아 있어서 현재완료예요. Mia는 한 사람이라 has를 써요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'Mia has lived here since 2020.', view: 'timeline',
              panels: [
                { labelKo: '2020년', layout: [{ obj: 'mia' }, { obj: 'house' }] },
                { labelKo: '지금', layout: [{ obj: 'mia' }, { obj: 'house' }] },
              ] },
            { en: 'I have finished my homework.', view: 'scene',
              layout: [{ obj: 'paul', labelKo: '다 했다!' }, { obj: 'homework' }] },
            { en: 'I have known Mia for a year.', view: 'timeline',
              panels: [
                { labelKo: '1년 전', layout: [{ obj: 'paul' }, { obj: 'mia' }] },
                { labelKo: '지금', layout: [{ obj: 'paul' }, { obj: 'mia' }] },
              ] },
          ] },
      ],
    },
    wordsAdd: [{ en: 'know', ko: '알다' }, { en: 'finish', ko: '끝내다' }],
  },

  'g-high-02': {
    scene: {
      id: 'high02-passive', mode: 'add', titleKo: '누가 언제 했을까?', bgKo: '학교 앞 거리', bg: 'school',
      characters: ['paul', 'mia', 'teacher', 'kid'],
      objects: { mia: MIA, paul: PAUL, teacher: TEACHER, kid: KID, cake: CAKE, desk: DESK, key: KEY },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'timeline',
          promptKo: '어제 미아가 무엇을 했나요? 케이크를 눌러 보세요.',
          panels: [
            { labelKo: '어제', layout: [{ obj: 'mia', action: 'cook' }, { obj: 'cake' }] },
            { labelKo: '지금', layout: [{ obj: 'cake', labelKo: '만들어진 것' }] },
          ],
          tap: { obj: 'cake', en: 'This was made by Mia.', ko: '이것은 미아에 의해 만들어졌어.' },
          noteKo: '수동태는 be + p.p.예요. 일을 한 사람은 by 뒤에 써요. 시제는 be동사(was, will be)가 나타내요.' },

        { kind: 'compare', stepKo: '비교', view: 'timeline',
          promptKo: '두 시간표를 비교해 보세요. 언제 만들어진 걸까요?',
          left: { view: 'timeline',
            panels: [
              { labelKo: '어제', layout: [{ obj: 'mia', action: 'cook' }, { obj: 'cake' }] },
              { labelKo: '지금', layout: [{ obj: 'cake' }] },
            ],
            en: 'This was made by Mia.', ko: '이것은 미아에 의해 (어제) 만들어졌어.' },
          right: { view: 'timeline',
            panels: [
              { labelKo: '지금', layout: [{ obj: 'mia' }] },
              { labelKo: '내일', layout: [{ obj: 'mia', action: 'cook' }, { obj: 'cake' }] },
            ],
            en: 'It will be made by Mia.', ko: '그것은 미아에 의해 (내일) 만들어질 거야.' },
          explainKo: [
            '과거 수동태는 was/were + p.p., 미래 수동태는 will be + p.p.예요.',
            '조동사가 있으면 can be found처럼 조동사 + be + p.p.로 써요. be는 항상 원형이에요.',
            '만든 사람 Mia는 두 문장 모두 by Mia로 뒤에 붙어요.',
          ] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'timeline', promptKo: '시간표에서 표시된 칸을 보고 빈칸을 고르세요.',
              panels: [
                { labelKo: '어제', layout: [{ obj: 'mia', action: 'cook' }, { obj: 'cake', n: 3 }] },
                { labelKo: '오늘', layout: [{ obj: 'cake', n: 3 }] },
              ], focus: 0,
              frame: 'The cakes ___ by Mia.', options: ['was made', 'were made', 'will be made'], correct: 1,
              whyKo: '어제 이미 만든 일이라 과거이고, cakes는 여러 개라 were를 써요.' },
            { view: 'timeline', promptKo: '시간표에서 표시된 칸을 보고 빈칸을 고르세요.',
              panels: [
                { labelKo: '지금', layout: [{ obj: 'mia' }, { obj: 'desk' }] },
                { labelKo: '내일', layout: [{ obj: 'mia', action: 'clean' }, { obj: 'desk' }] },
              ], focus: 1,
              frame: 'The desk ___ by Mia.', options: ['was cleaned', 'were cleaned', 'will be cleaned'], correct: 2,
              whyKo: '내일 할 일이라 미래 수동태 will be + p.p.를 써요.' },
            { view: 'dialogue', promptKo: '대화를 읽고 빈칸에 알맞은 말을 고르세요.',
              layout: [{ obj: 'key', at: 'on', ref: 'desk' }, { obj: 'desk' }, { obj: 'kid' }, { obj: 'teacher' }],
              lines: [
                { who: 'kid', ko: '내 열쇠 어디 있어요?', en: 'Where is my key?' },
                { who: 'teacher', ko: '책상 위에 있어. 여기서 찾을 수 있어.' },
              ],
              frame: 'The key can ___ here.', options: ['be found', 'find', 'found'], correct: 0,
              whyKo: '조동사 can 뒤의 수동태는 be + p.p.예요. 열쇠는 "발견되는" 대상이라 be found를 써요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'It was cleaned by Mia.', view: 'timeline',
              panels: [
                { labelKo: '어제', layout: [{ obj: 'mia', action: 'clean' }, { obj: 'desk' }] },
                { labelKo: '지금', layout: [{ obj: 'desk' }] },
              ] },
            { en: 'It can be found here.', view: 'scene',
              layout: [{ obj: 'key', at: 'on', ref: 'desk' }, { obj: 'desk' }] },
            { en: 'These were made by Mia.', view: 'scene',
              layout: [{ obj: 'mia', action: 'cook' }, { obj: 'cake', n: 3 }] },
          ] },
      ],
    },
    wordsAdd: [{ en: 'will', ko: '~할 것이다' }, { en: 'find', ko: '찾다' }],
  },

  'g-high-03': {
    scene: {
      id: 'high03-relative', mode: 'add', titleKo: '누구? 무엇? 어디?', bgKo: '학교 교실', bg: 'school',
      characters: ['paul', 'mia', 'teacher'],
      objects: { mia: MIA, paul: PAUL, teacher: TEACHER, book: BOOK, school: SCHOOL },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '대화를 읽고, 선생님이 말하는 책을 눌러 보세요.',
          layout: [{ obj: 'teacher' }, { obj: 'mia', labelKo: '읽은 사람' }, { obj: 'book', labelKo: '사물' }],
          lines: [
            { who: 'teacher', ko: '이 책 누가 읽었니?' },
            { who: 'mia', ko: '제가 읽었어요. 정말 재미있어요.' },
          ],
          tap: { obj: 'book', en: 'This is the book which Mia read.', ko: '이것은 미아가 읽은 책이야.' },
          noteKo: '앞에 오는 말이 사물이면 which, 사람이면 who를 써요. 관계사가 뒤 문장의 목적어(…을/를) 역할을 할 때는 생략할 수 있어요.' },

        { kind: 'compare', stepKo: '비교', view: 'scene',
          promptKo: '두 그림을 비교해 보세요. 설명하려는 대상이 무엇인가요?',
          left: { view: 'scene', layout: [{ obj: 'mia', action: 'read', labelKo: '사람(친구)' }, { obj: 'book' }],
            en: 'Mia is the friend who read this.', ko: '미아는 이것을 읽은 친구야.' },
          right: { view: 'scene', layout: [{ obj: 'book', size: 'l', labelKo: '사물(책)' }, { obj: 'mia', size: 's' }],
            en: 'This is the book which Mia read.', ko: '이것은 미아가 읽은 책이야.' },
          explainKo: [
            '사람을 꾸밀 때는 who, 사물을 꾸밀 때는 which예요.',
            '소유를 나타낼 때는 whose(~의), 장소를 꾸밀 때는 where를 써요.',
            '목적어 자리의 which와 who는 생략할 수 있어요. This is the book Mia read.도 맞아요.',
          ] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'scene', promptKo: '그림을 보고 빈칸에 알맞은 관계사를 고르세요.',
              layout: [{ obj: 'mia', action: 'read', labelKo: '친구' }, { obj: 'book' }],
              frame: 'Mia is the friend ___ read this.', options: ['who', 'which', 'where', 'whose'], correct: 0,
              whyKo: '앞에 오는 말 friend가 사람이고 뒤에 동사 read가 바로 이어져요. 그래서 who를 써요.' },
            { view: 'scene', promptKo: '그림을 보고 빈칸에 알맞은 관계사를 고르세요.',
              layout: [{ obj: 'book', labelKo: '책(사물)' }, { obj: 'mia', labelKo: '읽은 사람' }],
              frame: 'This is the book ___ Mia read.', options: ['which', 'who', 'where'], correct: 0,
              whyKo: '앞에 오는 말 book이 사물이라 which를 써요.' },
            { view: 'scene', promptKo: '그림을 보고 빈칸에 알맞은 관계사를 고르세요.',
              layout: [{ obj: 'school', labelKo: '장소' }, { obj: 'paul', action: 'talk' }, { obj: 'mia', action: 'talk' }],
              frame: 'This is the school ___ we talked.', options: ['where', 'which', 'who'], correct: 0,
              whyKo: '앞에 오는 말 school이 장소이고 뒤에 we talked 문장이 완전해서 where를 써요.' },
            { view: 'scene', promptKo: '그림을 보고 빈칸에 알맞은 관계사를 고르세요.',
              layout: [{ obj: 'mia', labelKo: '책 주인' }, { obj: 'book', labelKo: '미아의 책' }],
              frame: 'Mia is the friend ___ book is here.', options: ['whose', 'who', 'which'], correct: 0,
              whyKo: '"그 친구의 책"처럼 소유를 나타내므로 whose를 써요. whose 뒤에는 명사(book)가 바로 와요.' },
          ] },

        { kind: 'listen', stepKo: '듣기',
          items: [
            { en: 'This is the book which Mia read.', view: 'scene',
              options: [
                { layout: [{ obj: 'mia', action: 'read' }, { obj: 'book' }] },
                { layout: [{ obj: 'mia' }, { obj: 'school' }] },
                { layout: [{ obj: 'paul', action: 'talk' }, { obj: 'mia', action: 'talk' }] },
              ], correct: 0,
              whyKo: '미아가 책을 읽은 그림이에요. which는 사물 book을 꾸며요.' },
            { en: 'She is the friend I talked with.', view: 'scene',
              options: [
                { layout: [{ obj: 'mia', action: 'read' }, { obj: 'book' }] },
                { layout: [{ obj: 'paul', action: 'talk' }, { obj: 'mia', action: 'talk', labelKo: '친구' }] },
                { layout: [{ obj: 'school' }, { obj: 'mia' }] },
              ], correct: 1,
              whyKo: '내가 함께 이야기한 친구는 둘이 이야기하는 그림이에요.' },
          ] },
      ],
    },
    wordsAdd: [{ en: 'whose', ko: '~의 (소유)' }],
  },

  'g-high-04': {
    scene: {
      id: 'high04-subjunctive', mode: 'add', titleKo: '현실과 상상', bgKo: '빈 무대', bg: 'plain',
      characters: ['paul', 'mia'],
      objects: { paul: PAUL, mia: MIA, dog: DOG, money: MONEY, clock: CLOCK },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '폴의 상상을 보세요. 폴이 상상하는 강아지를 눌러 보세요.',
          layout: [{ obj: 'paul' }, { obj: 'dog', action: 'play', labelKo: '상상 속 강아지' }],
          lines: [{ who: 'paul', ko: '강아지가 있다면 같이 놀 텐데…' }],
          tap: { obj: 'dog', en: 'If I had a dog, I would play.', ko: '개가 있다면 놀 텐데.' },
          noteKo: '사실과 다른 상상은 If + 과거형, 주절은 would + 동사원형이에요. 과거형이지만 뜻은 "지금"이에요.' },

        { kind: 'compare', stepKo: '비교', view: 'scene',
          promptKo: '현실과 상상을 비교해 보세요.',
          left: { view: 'scene', layout: [{ obj: 'paul', labelKo: '현실: 돈이 없어요' }],
            en: 'I am not rich.', ko: '나는 부자가 아니야. (사실)' },
          right: { view: 'scene', layout: [{ obj: 'paul', labelKo: '상상: 부자라면' }, { obj: 'money', n: 3 }],
            en: 'If I were rich, I would go.', ko: '내가 부자라면 갈 텐데. (가정)' },
          explainKo: [
            '왼쪽은 사실이라 am을 써요. 오른쪽은 사실과 다른 가정이라 were를 써요.',
            '가정법에서는 주어가 I여도 were를 써요. 주절은 would + 동사원형이에요.',
            '가정 문장은 지금 사실과 반대되는 상황을 상상해요. 사실이 "부자가 아니다"면 상상은 "부자라면"이에요.',
          ] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'timeline', promptKo: '현실과 상상 그림을 보고 빈칸을 고르세요.',
              panels: [
                { labelKo: '현실: 돈이 없어요', layout: [{ obj: 'paul' }] },
                { labelKo: '상상: 부자라면', layout: [{ obj: 'paul' }, { obj: 'money', n: 3 }] },
              ], focus: 1,
              frame: 'If I ___ rich, I would go.', options: ['am', 'were', 'are'], correct: 1,
              whyKo: '사실과 다른 상상이라 가정법 과거예요. be동사는 주어와 상관없이 were를 써요.' },
            { view: 'timeline', promptKo: '현실과 상상 그림을 보고 빈칸을 고르세요.',
              panels: [
                { labelKo: '현실: 미아는 없어요', layout: [{ obj: 'paul' }] },
                { labelKo: '상상: 미아가 있다면', layout: [{ obj: 'paul' }, { obj: 'mia' }] },
              ], focus: 1,
              frame: 'If Mia ___ here, I would play.', options: ['is', 'were', 'are'], correct: 1,
              whyKo: '미아가 여기 없는 현실과 반대 상상이라 were를 써요.' },
            { view: 'timeline', promptKo: '현실과 상상 그림을 보고 빈칸을 고르세요.',
              panels: [
                { labelKo: '현실: 시간이 없어요', layout: [{ obj: 'paul' }, { obj: 'clock' }] },
                { labelKo: '상상: 시간이 있다면', layout: [{ obj: 'paul' }, { obj: 'clock' }] },
              ], focus: 1,
              frame: 'If I had time, I ___ go.', options: ['would', 'will', 'do'], correct: 0,
              whyKo: 'if절이 과거형(had)인 가정이라 주절은 would + 동사원형이에요.' },
          ] },

        { kind: 'listen', stepKo: '듣기',
          items: [
            { en: 'If I had a dog, I would play.', view: 'timeline',
              options: [
                { panels: [
                  { labelKo: '현실', layout: [{ obj: 'paul' }] },
                  { labelKo: '상상', layout: [{ obj: 'paul' }, { obj: 'dog', action: 'play' }] } ] },
                { panels: [
                  { labelKo: '현실', layout: [{ obj: 'paul' }] },
                  { labelKo: '상상', layout: [{ obj: 'paul' }, { obj: 'mia' }] } ] },
                { panels: [
                  { labelKo: '현실', layout: [{ obj: 'paul' }] },
                  { labelKo: '상상', layout: [{ obj: 'paul' }, { obj: 'clock' }] } ] },
              ], correct: 0,
              whyKo: 'dog이 들렸으니 상상 칸에 강아지가 있는 그림이에요.' },
          ] },
      ],
    },
    wordsAdd: [{ en: 'rich', ko: '부유한' }, { en: 'have', ko: '가지다' }, { en: 'will', ko: '~할 것이다' }],
  },

  'g-high-05': {
    scene: {
      id: 'high05-reported', mode: 'add', titleKo: '그 말 전해 줘', bgKo: '학교 복도', bg: 'school',
      characters: ['paul', 'mia'],
      objects: { paul: PAUL, mia: MIA },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'dialogue',
          promptKo: '미아가 한 말을 읽고, 미아를 눌러 전달하는 문장을 보세요.',
          layout: [{ obj: 'mia', labelKo: '말하는 사람' }],
          lines: [{ who: 'mia', ko: '"나는 행복해."' }],
          tap: { obj: 'mia', en: 'Mia said that she was happy.', ko: '미아는 행복하다고 말했어.' },
          noteKo: '남의 말을 전할 때는 said that + 문장으로 써요. "나(I)"는 말한 사람(she)으로, 동사는 한 시제 과거(am → was)로 바꿔요.' },

        { kind: 'compare', stepKo: '비교', view: 'dialogue',
          promptKo: '직접 한 말과 전달하는 말을 비교해 보세요.',
          left: { view: 'dialogue', layout: [{ obj: 'mia' }],
            lines: [{ who: 'mia', ko: '"나는 행복해."' }],
            en: 'Mia said, "I am happy."', ko: '미아는 "나는 행복해."라고 말했어. (직접화법)' },
          right: { view: 'dialogue', layout: [{ obj: 'paul' }, { obj: 'mia', labelKo: '전해진 사람' }],
            lines: [{ who: 'paul', ko: '미아가 행복하다고 했어.' }],
            en: 'Mia said that she was happy.', ko: '미아는 행복하다고 말했어. (간접화법)' },
          explainKo: [
            '직접화법은 따옴표 안에 말을 그대로 써요. 간접화법은 that 뒤에 문장을 이어 써요.',
            '간접화법에서는 I가 she로 바뀌고, am이 was로, have finished가 had finished로 바뀌어요.',
            '시제를 한 칸 과거로 미룬다고 기억하세요.',
          ] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'dialogue', promptKo: '말을 읽고 전달하는 문장의 빈칸을 고르세요.',
              layout: [{ obj: 'mia', labelKo: '말한 사람' }],
              lines: [{ who: 'mia', ko: '"나는 행복해."' }],
              frame: 'Mia said that she ___ happy.', options: ['am', 'were', 'was'], correct: 2,
              whyKo: '전달 동사 said가 과거라서 말한 내용도 am → was로 한 시제 과거로 바꿔요.' },
            { view: 'dialogue', promptKo: '말을 읽고 전달하는 문장의 빈칸을 고르세요.',
              layout: [{ obj: 'paul', labelKo: '말한 사람' }],
              lines: [{ who: 'paul', ko: '"나는 피곤해."' }],
              frame: 'Paul said that he ___ tired.', options: ['were', 'was', 'are'], correct: 1,
              whyKo: 'said 뒤에서는 am이 was로 바뀌어요. 말한 사람이 폴이라 I는 he가 돼요.' },
            { view: 'dialogue', promptKo: '말을 읽고 전달하는 문장의 빈칸을 고르세요.',
              layout: [{ obj: 'mia', labelKo: '말한 사람' }],
              lines: [{ who: 'mia', ko: '"나는 숙제를 끝냈어."' }],
              frame: 'Mia said that she ___ finished.', options: ['have', 'had', 'having'], correct: 1,
              whyKo: '현재완료(have finished)는 간접화법에서 과거완료(had finished)로 바뀌어요.' },
            { view: 'dialogue', promptKo: '말을 읽고 알맞은 대명사를 고르세요.',
              layout: [{ obj: 'mia', labelKo: '말한 사람' }],
              lines: [{ who: 'mia', ko: '"나는 피곤해."' }],
              frame: 'Mia said that ___ was tired.', options: ['he', 'we', 'she'], correct: 2,
              whyKo: '말한 사람은 미아예요. 전달할 때 I는 말한 사람인 she로 바뀌어요.' },
          ] },

        { kind: 'read', stepKo: '읽기',
          pairs: [
            { en: 'Mia said that she was happy.', view: 'dialogue',
              layout: [{ obj: 'mia' }], lines: [{ who: 'mia', ko: '"나는 행복해."' }] },
            { en: 'Paul said that he was tired.', view: 'dialogue',
              layout: [{ obj: 'paul' }], lines: [{ who: 'paul', ko: '"나는 피곤해."' }] },
            { en: 'Mia said that she had finished.', view: 'dialogue',
              layout: [{ obj: 'mia' }], lines: [{ who: 'mia', ko: '"나는 끝냈어."' }] },
          ] },
      ],
    },
    wordsAdd: [{ en: 'finished', ko: '끝냈다' }, { en: 'has', ko: 'have의 한 사람용' }, { en: 'have', ko: '가지다 / ~했다(완료)' }, { en: 'having', ko: 'have의 -ing 모양' }, { en: 'were', ko: '~였다(복수/you)' }],
  },

  'g-high-06': {
    scene: {
      id: 'high06-participle', mode: 'add', titleKo: '집에 가는 길', bgKo: '동네 길', bg: 'street',
      characters: ['paul', 'mia'],
      objects: { paul: PAUL, mia: MIA, book: BOOK, bench: BENCH },
      steps: [
        { kind: 'discover', stepKo: '발견', view: 'timeline',
          promptKo: '폴의 하교길을 보세요. 걷는 중에 무슨 일이 있었나요? 폴을 눌러 보세요.',
          panels: [
            { labelKo: '걸어가는 중', layout: [{ obj: 'paul', action: 'walk' }] },
            { labelKo: '걸으면서 미아를 만남', layout: [{ obj: 'paul', action: 'walk' }, { obj: 'mia', action: 'wave' }] },
          ],
          tap: { obj: 'paul', en: 'Walking home, I met Mia.', ko: '집에 걸어가다가 미아를 만났어.' },
          noteKo: '동시에 일어난 두 동작은 한쪽을 -ing로 줄여 쓸 수 있어요. 앞의 -ing 구와 뒤 문장의 주어는 같아요.' },

        { kind: 'compare', stepKo: '비교', view: 'timeline',
          promptKo: '두 문장을 비교해 보세요. 같은 장면을 다르게 말한 거예요.',
          left: { view: 'timeline',
            panels: [
              { labelKo: '걸어가는 중', layout: [{ obj: 'paul', action: 'walk' }] },
              { labelKo: '걸으면서 미아를 만남', layout: [{ obj: 'paul', action: 'walk' }, { obj: 'mia', action: 'wave' }] },
            ],
            en: 'While I walked home, I met Mia.', ko: '집에 걸어가는 동안 미아를 만났어. (접속사 + 주어)' },
          right: { view: 'timeline',
            panels: [
              { labelKo: '걸어가는 중', layout: [{ obj: 'paul', action: 'walk' }] },
              { labelKo: '걸으면서 미아를 만남', layout: [{ obj: 'paul', action: 'walk' }, { obj: 'mia', action: 'wave' }] },
            ],
            en: 'Walking home, I met Mia.', ko: '집에 걸어가다가 미아를 만났어. (분사구문)' },
          explainKo: [
            '분사구문은 While I walked를 Walking으로 줄인 거예요. 접속사와 주어를 지워요.',
            '두 동작의 주어가 같을 때만 줄일 수 있어요. 이 문장에서는 둘 다 I(폴)예요.',
            '뜻을 분명히 하려면 While walking home처럼 접속사를 남겨도 돼요.',
          ] },

        { kind: 'choose', stepKo: '선택',
          items: [
            { view: 'timeline', promptKo: '두 동작을 보고 빈칸에 알맞은 말을 고르세요.',
              panels: [
                { labelKo: '걸어가는 중', layout: [{ obj: 'paul', action: 'walk' }] },
                { labelKo: '걸으면서 미아를 만남', layout: [{ obj: 'paul', action: 'walk' }, { obj: 'mia', action: 'wave' }] },
              ], focus: 0,
              frame: 'While ___ home, I met Mia.', options: ['walking', 'walked', 'walk'], correct: 0,
              whyKo: '주어 I가 같아서 While I walked를 While walking으로 줄여요.' },
            { view: 'scene', promptKo: '그림을 보고 빈칸에 알맞은 말을 고르세요.',
              layout: [{ obj: 'mia', action: 'read', at: 'on', ref: 'bench' }, { obj: 'bench' }, { obj: 'book' }],
              frame: '___ a book, Mia sat here.', options: ['Reading', 'Read', 'Reads'], correct: 0,
              whyKo: '미아가 책을 읽으면서 앉았어요. 동시 동작이고 주어가 같아서 Reading으로 시작해요.' },
            { view: 'timeline', promptKo: '두 동작을 보고 빈칸에 알맞은 말을 고르세요.',
              panels: [
                { labelKo: '걸어가는 중', layout: [{ obj: 'paul', action: 'walk' }] },
                { labelKo: '걸으면서 미아를 만남', layout: [{ obj: 'paul', action: 'walk' }, { obj: 'mia', action: 'wave' }] },
              ], focus: 0,
              frame: 'While I ___ home, I met Mia.', options: ['walked', 'walking', 'walks'], correct: 0,
              whyKo: '접속사 뒤에 주어 I를 남기면 완전한 문장이라 과거 동사 walked를 써요.' },
          ] },

        { kind: 'listen', stepKo: '듣기',
          items: [
            { en: 'Walking home, I met Mia.', view: 'timeline',
              options: [
                { panels: [
                  { labelKo: '걸어가는 중', layout: [{ obj: 'paul', action: 'walk' }] },
                  { labelKo: '걸으면서 미아를 만남', layout: [{ obj: 'paul', action: 'walk' }, { obj: 'mia', action: 'wave' }] } ] },
                { panels: [
                  { labelKo: '앉아서 읽는 중', layout: [{ obj: 'mia', action: 'read' }, { obj: 'bench' }] },
                  { labelKo: '그때 만남', layout: [{ obj: 'mia' }, { obj: 'paul', action: 'wave' }] } ] },
                { panels: [
                  { labelKo: '벤치에 앉아 있음', layout: [{ obj: 'paul', action: 'sit' }, { obj: 'bench' }] },
                  { labelKo: '그때 만남', layout: [{ obj: 'paul' }, { obj: 'mia' }] } ] },
              ], correct: 0,
              whyKo: '걸어가다가(Walking) 미아를 만난 그림이에요.' },
            { en: 'Reading a book, Mia sat here.', view: 'scene',
              options: [
                { layout: [{ obj: 'mia', action: 'read' }, { obj: 'bench' }, { obj: 'book' }] },
                { layout: [{ obj: 'paul', action: 'walk' }] },
                { layout: [{ obj: 'paul' }, { obj: 'mia', action: 'wave' }] },
              ], correct: 0,
              whyKo: '미아가 책을 읽으면서 앉은 그림이에요.' },
          ] },
      ],
    },
    wordsAdd: [{ en: 'walk', ko: '걷다' }, { en: 'walks', ko: '걷는다' }, { en: 'read', ko: '읽다' }, { en: 'reads', ko: '읽는다' }],
  },
}
