// 2026-10-10 문법 단원 데이터 + 순수 도우미(저장·네트워크 없음). 스키마는 validateGrammarUnit 참고.
// status 'ready' 9개(Easy 8개 + g-int-01. g-easy-01·02, g-int-01은 기존 시범 Unit 문형 문항을 fromUnitId로 재사용, Easy 03~08은 자체 선택 문항 3개) + 'preparing' 개요 25개(제목·학습 목표만, 화면에서 '준비 중').
// 구현 상태(status)와 교사 검수(reviewStatus)는 별개 — 전부 'unreviewed'. 어휘 규칙은 validateGrammarUnit 참고.
// 교사 확인(콘텐츠 담당 2026-10-10): 03 compare의 Are you…?/I am not은 미리보기일 뿐(연습은 긍정 am/is/are). 04 Mia can jump에 -s 없음(3인칭 -s는 g-int-02), can't·cannot 모두 인정.
// 05 복수 -s와 two는 가볍게만. 06이 don't를 07의 Do보다 먼저 가르침; 06 "I play ball."이 자연스러운지 확인(대안 I play with a ball). 08의 isn't/Is this는 compare에서만.
// 선수 연결: 04←01, 05←02, 06←03, 07←06, 08←03(+01의 my/your).
// 초안은 콘텐츠 담당(2026-10-10), 교사 검수 전.
//
// 배정 근거
// - 빌리기(Easy, 기초): 문항 6개 모두 한 문장 틀(Can I borrow ___?)의 빈칸·어순. 위치 묻기(Easy, 기초): 문항은 각각 한 문장 틀 안에서 고름.
// - 함께 찾기(Intermediate, 발전): 질문에 맞는 대답·되묻기를 짝지어 고르는 문항.
// - 어휘 의존: Easy 두 단원은 자기 vocab만, Intermediate는 Easy-02 어휘 + shelf·box. g-int-01 선수 = g-easy-02.
// - 경계: 빌리기 3번(Could I 다답), 위치 묻기 2번(Where's/Where is 다답)은 한 문장 안 선택이라 기초.
// 교사 확인 메모
// - 순서 배열 문항은 가능한 순서가 하나뿐이라 정답 하나. 다답 인정은 만들기 문항 acceptNoteKo.
// - Easy-01 구조의 "I can borrow"는 어순 비교용이며, 능력의 can은 Easy-04.
// - be동사 단원이 Easy-03이라 Where's(= Where is)가 먼저 나옴 — Easy-02에서 Where's를 덩어리로 가르쳐도 되는지 확인.
import { GRAMMAR_COURSES } from './grammarCourses.js'

const P = (id, courseId, order, titleKo, goalKo, conceptId, prereqIds, extra = {}) => ({
  id, courseId, order, titleKo, goalKo, conceptId, prereqIds, status: 'preparing',
  examples: [], explainKo: [], structure: [], errors: [],
  practice: { choice: [], blank: [], order: [], build: [] }, use: null, sources: [], ...extra,
})
export const SCHOOL_GRAMMAR_NOTE_KO = '학교 문법 — 학년·교육과정 대응 미확인'

const READY_UNITS = [
  {
    id: 'g-easy-01', courseId: 'easy', order: 1,
    titleKo: '부탁하기 Can I …?',
    goalKo: '필요한 물건을 빌려 달라고 말할 수 있어요',
    conceptId: 'request-can-i', prereqIds: [], status: 'ready', reviewStatus: 'unreviewed',
    words: [{ en: 'pencil', ko: '연필' }, { en: 'rubber', ko: '지우개' }, { en: 'ruler', ko: '자' }, { en: 'ball', ko: '공' }, { en: 'borrow', ko: '빌리다' }, { en: 'sure', ko: '그래' }, { en: 'here you are', ko: '여기 있어' }],
    fromUnitId: 'c1-borrow-classroom',
    examples: [
      { en: 'Can I borrow a pencil?', ko: '연필 빌려도 돼?' },
      { en: 'Can I borrow your rubber?', ko: '네 지우개 빌려도 돼?' },
      { en: 'Can I borrow your ruler?', ko: '네 자 빌려도 돼?' },
      { en: 'Sure. Here you are!', ko: '그래. 여기 있어!' },
    ],
    explainKo: [
      'Can I …?는 "…해도 돼?" 하고 부탁하는 말이에요.',
      '앞부분 Can I borrow는 그대로 두고 물건만 바꿔요.',
      '연필 한 자루는 a pencil, 네 물건은 your를 붙여요.',
      '문장 끝에 물음표(?)를 꼭 써요.',
    ],
    structure: [
      { s: 'Can I', v: 'borrow', rest: 'a pencil?', ko: '내가 연필을 빌려도 돼? (질문이라 Can이 맨 앞에 와요)' },
      { s: 'I', v: 'can borrow', rest: 'a pencil', ko: '나는 연필을 빌릴 수 있어 (일반 문장 순서와 비교용)' },
    ],
    // compare 생략: 부탁 표현은 긍정·부정 비교가 이 단원 목표에 필요 없음(인지부하 절감)
    errors: [
      { wrong: 'Can borrow I a pencil?', right: 'Can I borrow a pencil?', whyKo: 'Can 바로 다음에 I가 와요. 순서를 바꾸면 어색해요.' },
      { wrong: 'Can I borrow pencil?', right: 'Can I borrow a pencil?', whyKo: '연필 한 자루를 말할 때는 a를 붙여요.' },
    ],
    practice: {
      choice: [], // fromUnitId 'c1-borrow-classroom'의 grammar.items 6개를 그대로 사용
      blank: [
        { promptKo: '짝에게 지우개를 빌려 달라고 해요.', en: 'Can I ___ your rubber?', options: ['borrow', 'borrowing', 'borrows'], correct: 0, whyKo: 'Can I 뒤에는 borrow를 그대로 써요. → Can I borrow your rubber?' },
        { promptKo: '짝의 자를 빌려 달라고 해요. "네 자"라고 말해요.', en: 'Can I borrow ___ ruler?', options: ['your', 'you', 'yours'], correct: 0, whyKo: '"너의 자"는 your ruler예요. → Can I borrow your ruler?' },
      ],
      order: [
        { promptKo: '단어를 순서대로 놓아 연필을 빌려 달라는 문장을 만들어요.', words: ['borrow', 'Can', 'pencil?', 'I', 'a'], answers: [['Can', 'I', 'borrow', 'a', 'pencil?']], whyKo: 'Can I borrow 순서로 시작해요. 이 단어들로 만들 수 있는 문장은 하나예요.' },
        { promptKo: '단어를 순서대로 놓아 자를 빌려 달라는 문장을 만들어요.', words: ['your', 'Can', 'ruler?', 'I', 'borrow'], answers: [['Can', 'I', 'borrow', 'your', 'ruler?']], whyKo: 'Can I borrow 다음에 물건 말(your ruler)이 와요.' },
      ],
      build: [
        { promptKo: '연필이 없어요. 짝에게 빌려 달라고 말하거나 써 보세요.', exampleEn: 'Can I borrow a pencil?', exampleKo: '연필 빌려도 돼?', acceptNoteKo: 'Can I borrow your pencil? / Could I borrow a pencil?도 맞아요. 이 문장 하나만 정답은 아니에요.' },
        { promptKo: '쉬는 시간에 놀고 싶은데 공이 없어요. 짝에게 부탁해 보세요.', exampleEn: 'Can I borrow your ball?', exampleKo: '네 공 빌려도 돼?', acceptNoteKo: 'Can I borrow a ball? / Could I borrow your ball?도 맞아요. Can I borrow로 시작하고 물건만 바꾸면 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 필요한 물건 하나를 골라 빌려 달라고 말해요. 짝은 "Sure. Here you are!"로 답해요.', exampleEn: 'Can I borrow your ruler?', exampleKo: '네 자 빌려도 돼?' },
    sources: ['own', 'pilot:c1-borrow-classroom'],
  },
  {
    id: 'g-easy-02', courseId: 'easy', order: 2,
    titleKo: "어디 있어? Where's",
    goalKo: '물건이 어디 있는지 묻고 답할 수 있어요',
    conceptId: 'where-is-location', prereqIds: [], status: 'ready', reviewStatus: 'unreviewed',
    words: [{ en: 'bag', ko: '가방' }, { en: 'chair', ko: '의자' }, { en: 'pencil case', ko: '필통' }, { en: 'desk', ko: '책상' }, { en: 'box', ko: '상자' }],
    fromUnitId: 'c1-lost-bag-classroom',
    examples: [
      { en: "Where's my bag?", ko: '내 가방 어디 있어?' },
      { en: "It's under the chair.", ko: '의자 밑에 있어.' },
      { en: "It's in the bag.", ko: '가방 안에 있어.' },
      { en: "Where's my pencil case?", ko: '내 필통 어디 있어?' },
    ],
    explainKo: [
      "Where's …?는 \"…은 어디에 있어?\" 하고 묻는 말이에요.",
      "Where's는 Where is를 줄인 말이에요.",
      "대답은 It's로 시작하고 under·in + 장소를 말해요.",
      'under는 "밑에", in은 "안에"라는 뜻이에요.',
    ],
    structure: [
      { s: 'Where', v: 'is', rest: 'my bag?', ko: '내 가방은 어디에 있어? (질문이라 Where is가 앞에 와요)' },
      { s: 'It', v: "is (It's)", rest: 'under the chair.', ko: '그것은 의자 밑에 있어' },
    ],
    errors: [
      { wrong: 'It in the bag.', right: "It's in the bag.", whyKo: "대답은 It's(= It is)로 시작해요. is가 빠지면 안 돼요." },
      { wrong: 'Where my bag is?', right: "Where's my bag?", whyKo: '묻는 말은 Where is 다음에 물건을 말해요.' },
    ],
    practice: {
      choice: [], // 'c1-lost-bag-classroom' grammar.items 6개 재사용
      blank: [
        { promptKo: '필통이 가방 "안"에 있어요.', en: "It's ___ the bag.", options: ['in', 'under', 'on'], correct: 0, whyKo: '"안에"는 in이에요. → It\'s in the bag.' },
        { promptKo: '가방이 어디 있는지 물어요.', en: 'Where ___ my bag?', options: ['is', 'am', 'it'], correct: 0, whyKo: '가방 하나는 Where is …?예요. → Where is my bag?' },
      ],
      order: [
        { promptKo: '단어를 놓아 가방이 어디 있는지 묻는 문장을 만들어요.', words: ['my', 'Where', 'bag?', 'is'], answers: [['Where', 'is', 'my', 'bag?']], whyKo: 'Where is 다음에 my bag이 와요.' },
        { promptKo: '단어를 놓아 "의자 밑에 있어"라고 대답해요.', words: ['the', "It's", 'chair.', 'under'], answers: [["It's", 'under', 'the', 'chair.']], whyKo: "It's + under + the + 장소 순서예요." },
      ],
      build: [
        { promptKo: '가방이 안 보여요. 짝에게 어디 있는지 물어 보세요.', exampleEn: "Where's my bag?", exampleKo: '내 가방 어디 있어?', acceptNoteKo: "Where is my bag? / Where's my pencil case?도 맞아요. 찾는 물건은 바꿔도 돼요." },
        { promptKo: '짝이 가방을 찾고 있어요. 가방은 의자 밑에 있어요. 알려 주세요.', exampleEn: "It's under the chair.", exampleKo: '의자 밑에 있어.', acceptNoteKo: "It is under the chair. / Under the chair.도 괜찮아요. 상황에 맞는 위치 말(under·in)이면 돼요." },
      ],
    },
    use: { kind: 'speaking', promptKo: "짝이 물건을 숨겨요. \"Where's my …?\"로 묻고, 짝은 \"It's … the …\"로 알려 줘요.", exampleEn: "Where's my pencil case?", exampleKo: '내 필통 어디 있어?' },
    sources: ['own', 'pilot:c1-lost-bag-classroom'],
  },
  {
    id: 'g-easy-03', courseId: 'easy', order: 3,
    titleKo: '나는 …이야 am·is·are', goalKo: '나와 친구가 누구인지 말할 수 있어요',
    conceptId: 'be-am-is-are', prereqIds: [], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'I am Paul.', ko: '나는 폴이야.' },
      { en: 'You are my friend.', ko: '너는 내 친구야.' },
      { en: 'Mia is my friend.', ko: '미아는 내 친구야.' },
      { en: 'We are friends.', ko: '우리는 친구야.' },
    ],
    explainKo: [
      'am·is·are는 "…이다 / …에 있다"를 나타내는 말이에요.',
      'I 뒤에는 am, You·We 뒤에는 are, Mia처럼 한 사람 뒤에는 is를 써요.',
      '아니라고 말할 때는 뒤에 not을 붙여요. (I am not a student.)',
    ],
    structure: [
      { s: 'I', v: 'am', rest: 'Paul.', ko: '나는 폴이야 (I 뒤에는 am)' },
      { s: 'Mia', v: 'is', rest: 'my friend.', ko: '미아는 내 친구야 (한 사람 뒤에는 is)' },
    ],
    compare: {
      aff: { en: 'I am a student.', ko: '나는 학생이야.' },
      neg: { en: 'I am not a student.', ko: '나는 학생이 아니야.' },
      q: { en: 'Are you a student?', ko: '너는 학생이야?' },
    },
    errors: [
      { wrong: 'I is Paul.', right: 'I am Paul.', whyKo: 'I 뒤에는 is가 아니라 am을 써요.' },
      { wrong: 'Mia are my friend.', right: 'Mia is my friend.', whyKo: 'Mia는 한 사람이라 is를 써요. are는 You·We 뒤에 써요.' },
    ],
    practice: {
      choice: [
        { promptKo: '나는 학생이에요. 알맞은 문장은?', options: ['I am a student.', 'I is a student.', 'I are a student.'], correct: 0, whyKo: 'I 뒤에는 am이에요. → I am a student.' },
        { promptKo: '폴과 나, 우리는 친구예요. 알맞은 문장은?', options: ['We are friends.', 'We is friends.', 'We am friends.'], correct: 0, whyKo: 'We 뒤에는 are를 써요. → We are friends.' },
        { promptKo: '나는 학생이 아니에요. 알맞은 문장은?', options: ['I am not a student.', 'I not am a student.', 'I am a not student.'], correct: 0, whyKo: 'am 바로 뒤에 not을 붙여요. → I am not a student.' },
      ],
      blank: [
        { promptKo: '너는 내 친구예요.', en: 'You ___ my friend.', options: ['are', 'am', 'is'], correct: 0, whyKo: 'You 뒤에는 are예요. → You are my friend.' },
        { promptKo: '미아는 학생이에요.', en: 'Mia ___ a student.', options: ['is', 'are', 'am'], correct: 0, whyKo: '미아 한 사람이라 is예요. → Mia is a student.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "나는 폴이야"를 만들어요.', words: ['am', 'I', 'Paul.'], answers: [['I', 'am', 'Paul.']], whyKo: 'I am + 이름 순서예요.' },
        { promptKo: '단어를 놓아 "미아는 내 친구야"를 만들어요.', words: ['my', 'is', 'friend.', 'Mia'], answers: [['Mia', 'is', 'my', 'friend.']], whyKo: 'Mia is + my friend 순서예요.' },
      ],
      build: [
        { promptKo: '짝에게 내 이름을 말해 보세요.', exampleEn: 'I am Paul.', exampleKo: '나는 폴이야.', acceptNoteKo: 'I am Mia. / I am Jina.처럼 내 이름이면 모두 맞아요. I am + 이름 순서면 돼요.' },
        { promptKo: '짝에게 "너는 내 친구야"라고 말해 보세요.', exampleEn: 'You are my friend.', exampleKo: '너는 내 친구야.', acceptNoteKo: 'You are a good friend. / You are my friend, Mia.도 맞아요. You are로 시작하면 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 "I am …"으로 나를 소개하고, "You are my friend."라고 말해요. 짝도 똑같이 해요.', exampleEn: 'I am Paul. You are my friend.', exampleKo: '나는 폴이야. 너는 내 친구야.' },
    words: [{ en: 'friend', ko: '친구' }, { en: 'friends', ko: '친구들' }, { en: 'student', ko: '학생' }],
    sources: ['own'],
  },
  {
    id: 'g-easy-04', courseId: 'easy', order: 4,
    titleKo: '할 수 있어요 can', goalKo: '내가 할 수 있는 것과 없는 것을 말할 수 있어요',
    conceptId: 'can-ability', prereqIds: ['g-easy-01'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'I can run.', ko: '나는 달릴 수 있어.' },
      { en: 'Mia can jump.', ko: '미아는 뛸 수 있어.' },
      { en: 'I can read a book.', ko: '나는 책을 읽을 수 있어.' },
      { en: "I can't swim.", ko: '나는 수영을 못 해.' },
    ],
    explainKo: [
      'Can I …?에서 본 can이 이번에는 "…할 수 있다"는 뜻이에요.',
      'can 뒤에는 run, swim처럼 동작 말을 그대로 써요. (Mia 뒤에도 같아요)',
      "못 할 때는 can't(= cannot)를 써요.",
    ],
    structure: [
      { s: 'I', v: 'can', rest: 'swim.', ko: '나는 수영할 수 있어' },
      { s: 'I', v: "can't", rest: 'swim.', ko: '나는 수영을 못 해 (can + not)' },
    ],
    compare: {
      aff: { en: 'I can swim.', ko: '나는 수영할 수 있어.' },
      neg: { en: "I can't swim.", ko: '나는 수영을 못 해.' },
      q: { en: 'Can you swim?', ko: '너는 수영할 수 있어?' },
    },
    errors: [
      { wrong: 'I can to swim.', right: 'I can swim.', whyKo: 'can 바로 뒤에는 to 없이 동작 말을 써요.' },
      { wrong: 'Mia can jumps.', right: 'Mia can jump.', whyKo: 'can 뒤의 동작 말에는 s를 붙이지 않아요. Mia 뒤에서도 같아요.' },
    ],
    practice: {
      choice: [
        { promptKo: '나는 수영할 수 있어요. 알맞은 문장은?', options: ['I can swim.', 'I can swimming.', 'I can to swim.'], correct: 0, whyKo: 'can 뒤에는 swim을 그대로 써요. → I can swim.' },
        { promptKo: '미아는 뛸 수 있어요. 알맞은 문장은?', options: ['Mia can jump.', 'Mia can jumps.', 'Mia jump can.'], correct: 0, whyKo: 'Mia can jump 순서이고 jump에 s를 붙이지 않아요.' },
        { promptKo: '나는 수영을 못 해요. 알맞은 문장은?', options: ["I can't swim.", "I can't swims.", 'I not can swim.'], correct: 0, whyKo: "못 할 때는 can't + 동작 말이에요. → I can't swim." },
      ],
      blank: [
        { promptKo: '나는 책을 읽을 수 있어요.', en: 'I can ___ a book.', options: ['read', 'reads', 'reading'], correct: 0, whyKo: 'can 뒤에는 read를 그대로 써요. → I can read a book.' },
        { promptKo: '나는 달릴 수 있어요.', en: 'I ___ run.', options: ['can', 'is', 'am'], correct: 0, whyKo: '"…할 수 있다"는 can이에요. → I can run.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "나는 달릴 수 있어"를 만들어요.', words: ['can', 'I', 'run.'], answers: [['I', 'can', 'run.']], whyKo: 'I can + 동작 순서예요.' },
        { promptKo: '단어를 놓아 "미아는 책을 읽을 수 있어"를 만들어요.', words: ['read', 'can', 'a', 'Mia', 'book.'], answers: [['Mia', 'can', 'read', 'a', 'book.']], whyKo: 'Mia can + 동작 + 물건 순서예요.' },
      ],
      build: [
        { promptKo: '내가 할 수 있는 것 하나를 말하거나 써 보세요.', exampleEn: 'I can swim.', exampleKo: '나는 수영할 수 있어.', acceptNoteKo: 'I can run. / I can jump. / I can sing.도 맞아요. I can + 동작이면 돼요.' },
        { promptKo: '내가 못 하는 것 하나를 말하거나 써 보세요.', exampleEn: "I can't swim.", exampleKo: '나는 수영을 못 해.', acceptNoteKo: "I can't jump. / I cannot sing.도 맞아요. can't(cannot) + 동작이면 돼요." },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 "I can …" 하나와 "I can\'t …" 하나를 말해요. 짝은 들은 것을 따라 말해요.', exampleEn: "I can run. I can't swim.", exampleKo: '나는 달릴 수 있어. 수영은 못 해.' },
    words: [{ en: 'run', ko: '달리다' }, { en: 'jump', ko: '뛰다' }, { en: 'swim', ko: '수영하다' }, { en: 'read', ko: '읽다' }, { en: 'sing', ko: '노래하다' }, { en: 'book', ko: '책' }],
    sources: ['own'],
  },
  {
    id: 'g-easy-05', courseId: 'easy', order: 5,
    titleKo: '…이 있어요 There is', goalKo: '방에 무엇이 있는지 말할 수 있어요',
    conceptId: 'there-is-are', prereqIds: ['g-easy-02'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'There is a ball in the box.', ko: '상자 안에 공이 있어.' },
      { en: 'There is a pencil on the desk.', ko: '책상 위에 연필이 있어.' },
      { en: 'There are two books on the shelf.', ko: '선반 위에 책이 두 권 있어.' },
      { en: 'There is a cat under the chair.', ko: '의자 밑에 고양이가 있어.' },
    ],
    explainKo: [
      'There is …는 "…이 있어요" 하고 무엇이 있는지 알려 주는 말이에요.',
      '하나일 때는 There is a …, 둘 이상일 때는 There are two …s예요.',
      '뒤에 in·on·under + 장소를 붙이면 어디에 있는지도 말해요.',
    ],
    structure: [
      { s: 'There', v: 'is', rest: 'a ball in the box.', ko: '상자 안에 공이 하나 있어 (하나면 is)' },
      { s: 'There', v: 'are', rest: 'two books on the shelf.', ko: '선반 위에 책이 두 권 있어 (둘 이상이면 are)' },
    ],
    compare: {
      aff: { en: 'There is a ball in the box.', ko: '상자 안에 공이 있어.' },
      neg: { en: "There isn't a ball in the box.", ko: '상자 안에 공이 없어.' },
      q: { en: 'Is there a ball in the box?', ko: '상자 안에 공이 있어?' },
    },
    errors: [
      { wrong: 'There are a pencil on the desk.', right: 'There is a pencil on the desk.', whyKo: '연필 하나(a pencil)는 are가 아니라 is와 함께 써요.' },
      { wrong: 'There is two books on the shelf.', right: 'There are two books on the shelf.', whyKo: '책이 두 권이면 are를 쓰고 books처럼 s를 붙여요.' },
    ],
    practice: {
      choice: [
        { promptKo: '상자 안에 공이 하나 있어요. 알맞은 문장은?', options: ['There is a ball in the box.', 'There are a ball in the box.', 'There a ball is in the box.'], correct: 0, whyKo: '하나는 There is a …예요. → There is a ball in the box.' },
        { promptKo: '선반 위에 책이 두 권 있어요. 알맞은 문장은?', options: ['There are two books on the shelf.', 'There is two books on the shelf.', 'There are two book on the shelf.'], correct: 0, whyKo: '둘 이상은 There are + 수 + books예요.' },
        { promptKo: '의자 밑에 고양이가 있어요. 알맞은 문장은?', options: ['There is a cat under the chair.', 'There is cat under the chair.', 'There are a cat under the chair.'], correct: 0, whyKo: '고양이 한 마리는 There is a cat이에요.' },
      ],
      blank: [
        { promptKo: '필통 안에 펜이 하나 있어요.', en: 'There ___ a pen in the pencil case.', options: ['is', 'are', 'am'], correct: 0, whyKo: '하나라서 is예요. → There is a pen in the pencil case.' },
        { promptKo: '선반 위에 책이 두 권 있어요.', en: 'There ___ two books on the shelf.', options: ['are', 'is', 'am'], correct: 0, whyKo: '두 권이라 are예요. → There are two books on the shelf.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "의자 밑에 고양이가 있어"를 만들어요.', words: ['There', 'is', 'a', 'cat', 'under', 'the', 'chair.'], answers: [['There', 'is', 'a', 'cat', 'under', 'the', 'chair.']], whyKo: 'There is a + 물건 + 위치 말 + 장소 순서예요.' },
        { promptKo: '단어를 놓아 "상자 안에 펜이 두 개 있어"를 만들어요.', words: ['There', 'are', 'two', 'pens', 'in', 'the', 'box.'], answers: [['There', 'are', 'two', 'pens', 'in', 'the', 'box.']], whyKo: 'There are two + 물건s + 위치 말 + 장소 순서예요.' },
      ],
      build: [
        { promptKo: '책상 위에 연필이 있어요. 짝에게 알려 주세요.', exampleEn: 'There is a pencil on the desk.', exampleKo: '책상 위에 연필이 있어.', acceptNoteKo: 'There is a pen on the desk. / There is a book on the desk.도 맞아요. 물건과 장소는 바꿔도 돼요.' },
        { promptKo: '선반 위에 책이 두 권 있어요. 짝에게 알려 주세요.', exampleEn: 'There are two books on the shelf.', exampleKo: '선반 위에 책이 두 권 있어.', acceptNoteKo: 'There are two pens in the box. 처럼 물건·장소를 바꿔도 맞아요. 둘 이상이면 There are + s예요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '교실을 둘러보고 "There is a …" 또는 "There are two …"로 보이는 것 세 가지를 말해요.', exampleEn: 'There is a ball in the box.', exampleKo: '상자 안에 공이 있어.' },
    words: [{ en: 'book', ko: '책' }, { en: 'books', ko: '책들' }, { en: 'pen', ko: '펜' }, { en: 'pens', ko: '펜들' }, { en: 'cat', ko: '고양이' }, { en: 'two', ko: '둘, 두 개' }, { en: 'shelf', ko: '선반' }],
    sources: ['own'],
  },
  {
    id: 'g-easy-06', courseId: 'easy', order: 6,
    titleKo: '좋아해요 I like', goalKo: '내가 좋아하는 것을 말할 수 있어요',
    conceptId: 'present-simple-like', prereqIds: ['g-easy-03'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'I like apples.', ko: '나는 사과를 좋아해.' },
      { en: 'I have a dog.', ko: '나는 개가 있어.' },
      { en: 'I play ball.', ko: '나는 공놀이를 해.' },
      { en: "I don't like milk.", ko: '나는 우유를 안 좋아해.' },
    ],
    explainKo: [
      'I like …는 "나는 …을 좋아해요" 하고 좋아하는 것을 말해요.',
      'like·have·play처럼 하는 일을 나타내는 말은 I 바로 뒤에 써요. am은 필요 없어요.',
      "좋아하지 않을 때는 I don't like …예요. don't는 do not을 줄인 말이에요.",
    ],
    structure: [
      { s: 'I', v: 'like', rest: 'apples.', ko: '나는 사과를 좋아해' },
      { s: 'I', v: "don't like", rest: 'milk.', ko: '나는 우유를 안 좋아해 (like 앞에 don\'t)' },
    ],
    compare: {
      aff: { en: 'I like milk.', ko: '나는 우유를 좋아해.' },
      neg: { en: "I don't like milk.", ko: '나는 우유를 안 좋아해.' },
      q: { en: 'Do you like milk?', ko: '너는 우유를 좋아해?' },
    },
    errors: [
      { wrong: 'I am like apples.', right: 'I like apples.', whyKo: 'like 앞에는 am을 넣지 않아요. I 바로 뒤에 like를 써요.' },
      { wrong: 'I no like milk.', right: "I don't like milk.", whyKo: "안 좋아할 때는 no가 아니라 don't를 like 앞에 써요." },
    ],
    practice: {
      choice: [
        { promptKo: '나는 사과를 좋아해요. 알맞은 문장은?', options: ['I like apples.', 'I am like apples.', 'I apples like.'], correct: 0, whyKo: 'I like + 좋아하는 것 순서예요.' },
        { promptKo: '나는 우유를 안 좋아해요. 알맞은 문장은?', options: ["I don't like milk.", 'I no like milk.', 'I not like milk.'], correct: 0, whyKo: "I don't like …로 말해요." },
        { promptKo: '나는 개가 있어요. 알맞은 문장은?', options: ['I have a dog.', 'I has a dog.', 'I have dog a.'], correct: 0, whyKo: 'I 뒤에는 have예요. 개 한 마리는 a dog.' },
      ],
      blank: [
        { promptKo: '나는 우유를 좋아해요.', en: 'I ___ milk.', options: ['like', 'am', 'likes'], correct: 0, whyKo: 'I 뒤에는 like예요. → I like milk.' },
        { promptKo: '나는 우유를 안 좋아해요.', en: "I ___ like milk.", options: ["don't", 'no', 'am'], correct: 0, whyKo: "안 좋아할 때는 I don't like …예요." },
      ],
      order: [
        { promptKo: '단어를 놓아 "나는 사과를 좋아해"를 만들어요.', words: ['like', 'I', 'apples.'], answers: [['I', 'like', 'apples.']], whyKo: 'I like + 좋아하는 것 순서예요.' },
        { promptKo: '단어를 놓아 "나는 우유를 안 좋아해"를 만들어요.', words: ["don't", 'I', 'milk.', 'like'], answers: [['I', "don't", 'like', 'milk.']], whyKo: "I don't like + 물건 순서예요." },
      ],
      build: [
        { promptKo: '내가 좋아하는 것 하나를 말하거나 써 보세요.', exampleEn: 'I like apples.', exampleKo: '나는 사과를 좋아해.', acceptNoteKo: 'I like milk. / I like cats. / I like my dog.도 맞아요. I like + 좋아하는 것이면 돼요.' },
        { promptKo: '내가 안 좋아하는 것 하나를 말하거나 써 보세요.', exampleEn: "I don't like milk.", exampleKo: '나는 우유를 안 좋아해.', acceptNoteKo: "I don't like apples. / I don't like cats.도 맞아요. I don't like + 물건이면 돼요." },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 내가 좋아하는 것 둘과 안 좋아하는 것 하나를 말해요. 짝도 똑같이 해요.', exampleEn: "I like apples. I don't like milk.", exampleKo: '나는 사과를 좋아해. 우유는 안 좋아해.' },
    words: [{ en: 'like', ko: '좋아하다' }, { en: 'have', ko: '가지고 있다' }, { en: 'play', ko: '(놀이를) 하다' }, { en: 'apple', ko: '사과' }, { en: 'apples', ko: '사과들' }, { en: 'milk', ko: '우유' }, { en: 'dog', ko: '개' }, { en: 'cat', ko: '고양이' }],
    sources: ['own'],
  },
  {
    id: 'g-easy-07', courseId: 'easy', order: 7,
    titleKo: '…해요? Do you …?', goalKo: '친구에게 Yes/No로 답하는 질문을 할 수 있어요',
    conceptId: 'present-simple-question', prereqIds: ['g-easy-06'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'Do you like apples?', ko: '너는 사과를 좋아해?' },
      { en: 'Yes, I do.', ko: '응, 좋아해.' },
      { en: "No, I don't.", ko: '아니, 안 좋아해.' },
      { en: 'Do you have a pen?', ko: '너 펜 있어?' },
    ],
    explainKo: [
      'Do you …?는 "너는 …해?" 하고 친구에게 묻는 말이에요.',
      'I like apples. 앞에 Do를 붙이고 I를 you로 바꾸면 돼요.',
      "대답은 짧게 Yes, I do. / No, I don't.예요.",
    ],
    structure: [
      { s: 'Do you', v: 'like', rest: 'apples?', ko: '너는 사과를 좋아해? (질문이라 Do가 맨 앞에 와요)' },
      { s: 'I', v: 'like', rest: 'apples.', ko: '나는 사과를 좋아해 (일반 문장 순서)' },
    ],
    compare: {
      aff: { en: 'Yes, I do.', ko: '응, 좋아해.' },
      neg: { en: "No, I don't.", ko: '아니, 안 좋아해.' },
      q: { en: 'Do you like apples?', ko: '너는 사과를 좋아해?' },
    },
    errors: [
      { wrong: 'Like you apples?', right: 'Do you like apples?', whyKo: '질문은 Do you로 시작하고 like는 그 뒤에 써요.' },
      { wrong: "Yes, I don't.", right: 'Yes, I do.', whyKo: "don't(아니야)는 No와 함께 써요. Yes 뒤에는 do를 써요." },
    ],
    practice: {
      choice: [
        { promptKo: '친구에게 사과를 좋아하는지 물어요. 알맞은 문장은?', options: ['Do you like apples?', 'You do like apples?', 'Like you apples?'], correct: 0, whyKo: '질문은 Do you like …? 순서예요.' },
        { promptKo: '친구에게 개가 있는지 물어요. 알맞은 문장은?', options: ['Do you have a dog?', 'Do you has a dog?', 'You have a dog do?'], correct: 0, whyKo: 'Do you 뒤에는 have를 그대로 써요.' },
        { promptKo: '"Do you like milk?" 안 좋아해요. 알맞은 짧은 대답은?', options: ["No, I don't.", 'No, I do.', "No, I'm not."], correct: 0, whyKo: "Do로 물었으니 No, I don't.로 대답해요." },
      ],
      blank: [
        { promptKo: '친구에게 우유를 좋아하는지 물어요.', en: '___ you like milk?', options: ['Do', 'Are', 'Is'], correct: 0, whyKo: 'like가 있는 질문은 Do you로 시작해요. → Do you like milk?' },
        { promptKo: '"Do you like apples?" 좋아해서 짧게 대답해요.', en: 'Yes, I ___.', options: ['do', 'like', 'am'], correct: 0, whyKo: 'Do로 물으면 Yes, I do.로 대답해요.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "너는 사과를 좋아해?"를 만들어요.', words: ['you', 'Do', 'like', 'apples?'], answers: [['Do', 'you', 'like', 'apples?']], whyKo: 'Do you like + 물건 순서예요.' },
        { promptKo: '단어를 놓아 "너 펜 있어?"를 만들어요.', words: ['Do', 'a', 'you', 'have', 'pen?'], answers: [['Do', 'you', 'have', 'a', 'pen?']], whyKo: 'Do you have a + 물건 순서예요.' },
      ],
      build: [
        { promptKo: '짝이 좋아하는 것을 알고 싶어요. Do you로 물어 보세요.', exampleEn: 'Do you like apples?', exampleKo: '너는 사과를 좋아해?', acceptNoteKo: 'Do you like milk? / Do you like dogs? / Do you play ball?도 맞아요. Do you로 시작하면 돼요.' },
        { promptKo: '짝이 "Do you have a pen?" 하고 물었어요. 펜이 있어요. 짧게 대답해 보세요.', exampleEn: 'Yes, I do.', exampleKo: '응, 있어.', acceptNoteKo: 'Yes, I do. I have a pen. / Yes, I do!도 맞아요. 짧게 Yes, I do.면 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 "Do you …?" 질문을 세 개 해요. 짝은 Yes, I do. / No, I don\'t.로만 답해요.', exampleEn: 'Do you like milk?', exampleKo: '너는 우유를 좋아해?' },
    words: [{ en: 'like', ko: '좋아하다' }, { en: 'have', ko: '가지고 있다' }, { en: 'play', ko: '(놀이를) 하다' }, { en: 'apples', ko: '사과들' }, { en: 'milk', ko: '우유' }, { en: 'pen', ko: '펜' }, { en: 'dog', ko: '개' }, { en: 'dogs', ko: '개들' }],
    sources: ['own'],
  },
  {
    id: 'g-easy-08', courseId: 'easy', order: 8,
    titleKo: '이것·저것 This is', goalKo: '가까운 것과 먼 것을 가리켜 말할 수 있어요',
    conceptId: 'this-that', prereqIds: ['g-easy-03'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'This is my pencil.', ko: '이것은 내 연필이야.' },
      { en: 'That is your bag.', ko: '저것은 네 가방이야.' },
      { en: 'This is a pen.', ko: '이것은 펜이야.' },
      { en: 'That is your chair.', ko: '저것은 네 의자야.' },
    ],
    explainKo: [
      'This is …는 가까이 있는 것, That is …는 멀리 있는 것을 가리켜 말해요.',
      'is 뒤에는 a, my, your 같은 말을 물건 앞에 붙여요.',
      '이 단원의 is는 "…이다"를 나타내는 말이에요. 앞에서 배운 am·is·are와 같아요.',
    ],
    structure: [
      { s: 'This', v: 'is', rest: 'my pencil.', ko: '이것은 내 연필이야 (가까이)' },
      { s: 'That', v: 'is', rest: 'your bag.', ko: '저것은 네 가방이야 (멀리)' },
    ],
    compare: {
      aff: { en: 'This is my pen.', ko: '이것은 내 펜이야.' },
      neg: { en: "This isn't my pen.", ko: '이것은 내 펜이 아니야.' },
      q: { en: 'Is this your pen?', ko: '이것은 네 펜이야?' },
    },
    errors: [
      { wrong: 'That are my bag.', right: 'That is my bag.', whyKo: 'This·That 뒤에는 are가 아니라 is를 써요.' },
      { wrong: 'This is pencil.', right: 'This is my pencil.', whyKo: 'pencil 앞에는 a나 my 같은 말이 필요해요.' },
    ],
    practice: {
      choice: [
        { promptKo: '손에 든 연필을 가리켜요. "이것은 내 연필이야." 알맞은 문장은?', options: ['This is my pencil.', 'That is my pencil.', 'This are my pencil.'], correct: 0, whyKo: '가까이 있으면 This is예요.' },
        { promptKo: '저 멀리 있는 가방을 가리켜요. "저것은 네 가방이야." 알맞은 문장은?', options: ['That is your bag.', 'This is your bag.', 'That are your bag.'], correct: 0, whyKo: '멀리 있으면 That is예요.' },
        { promptKo: '가까이 있는 펜을 가리켜요. 알맞은 문장은?', options: ['This is a pen.', 'This a pen is.', 'This am a pen.'], correct: 0, whyKo: 'This is a + 물건 순서예요.' },
      ],
      blank: [
        { promptKo: '가까이 있는 자를 가리켜요.', en: '___ is my ruler.', options: ['This', 'That', 'There'], correct: 0, whyKo: '가까이는 This예요. → This is my ruler.' },
        { promptKo: '멀리 있는 의자를 가리켜요.', en: 'That ___ your chair.', options: ['is', 'are', 'am'], correct: 0, whyKo: 'That 뒤에는 is예요. → That is your chair.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "이것은 내 연필이야"를 만들어요.', words: ['is', 'This', 'pencil.', 'my'], answers: [['This', 'is', 'my', 'pencil.']], whyKo: 'This is + my + 물건 순서예요.' },
        { promptKo: '단어를 놓아 "저것은 네 가방이야"를 만들어요.', words: ['bag.', 'your', 'is', 'That'], answers: [['That', 'is', 'your', 'bag.']], whyKo: 'That is + your + 물건 순서예요.' },
      ],
      build: [
        { promptKo: '가까이 있는 내 물건 하나를 소개해 보세요.', exampleEn: 'This is my pencil.', exampleKo: '이것은 내 연필이야.', acceptNoteKo: 'This is my pen. / This is a book.도 맞아요. This is + 물건이면 돼요.' },
        { promptKo: '멀리 있는 짝의 물건을 가리켜 말해 보세요.', exampleEn: 'That is your bag.', exampleKo: '저것은 네 가방이야.', acceptNoteKo: 'That is your desk. / That is a cat.도 맞아요. That is + 물건이면 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝과 교실을 둘러봐요. 가까운 것은 "This is …", 먼 것은 "That is …"로 세 문장을 말해요.', exampleEn: 'This is my pencil. That is your bag.', exampleKo: '이것은 내 연필이야. 저것은 네 가방이야.' },
    words: [{ en: 'pen', ko: '펜' }, { en: 'book', ko: '책' }, { en: 'cat', ko: '고양이' }],
    sources: ['own'],
  },
  {
    id: 'g-int-01', courseId: 'intermediate', order: 1,
    titleKo: 'Is it …? 대답·되묻기',
    goalKo: '있는지 확인하고 짧게 답한 뒤 되물을 수 있어요',
    conceptId: 'yes-no-question-short-answer', prereqIds: ['g-easy-02'], status: 'ready', reviewStatus: 'unreviewed',
    words: [{ en: 'box', ko: '상자' }, { en: 'bag', ko: '가방' }, { en: 'shelf', ko: '선반' }, { en: 'desk', ko: '책상' }, { en: 'chair', ko: '의자' }, { en: 'pencil case', ko: '필통' }],
    fromUnitId: 'c2-find-together-classroom',
    examples: [
      { en: 'Is it in the box?', ko: '상자 안에 있어?' },
      { en: "No, it isn't.", ko: '아니, 없어.' },
      { en: 'What about the bag?', ko: '가방은?' },
      { en: 'Yes, it is!', ko: '응, 있어!' },
    ],
    explainKo: [
      'Is it …?는 "그거 …에 있어?" 하고 확인하는 말이에요.',
      "대답은 Yes, it is. / No, it isn't.로 짧게 해요.",
      "isn't는 is not을 줄인 말이에요.",
      '아니라고 한 뒤 What about …?으로 다른 곳을 물어요.',
    ],
    structure: [
      { s: 'Is it', v: '(is)', rest: 'on the shelf?', ko: '선반 위에 있어? (질문이라 is가 it 앞으로 나와요: It is → Is it)' },
      { s: 'It', v: 'is', rest: 'on the shelf.', ko: '그것은 선반 위에 있어 (일반 문장 순서)' },
    ],
    compare: {
      aff: { en: 'Yes, it is.', ko: '응, 있어.' },
      neg: { en: "No, it isn't.", ko: '아니, 없어.' },
      q: { en: 'Is it in the box?', ko: '상자 안에 있어?' },
    },
    errors: [
      { wrong: 'It is on the shelf?', right: 'Is it on the shelf?', whyKo: '질문은 Is it 순서로 말해요. It is로 두면 질문이 아니에요.' },
      { wrong: "Yes, it isn't.", right: "No, it isn't.", whyKo: "isn't(아니야)는 No와 함께 써요. Yes와는 뜻이 안 맞아요." },
    ],
    practice: {
      choice: [], // 'c2-find-together-classroom' grammar.items 6개 재사용
      blank: [
        { promptKo: '필통이 상자 "안"에 있는지 물어요.', en: 'Is it ___ the box?', options: ['in', 'under', 'on'], correct: 0, whyKo: '"안에"는 in이에요. → Is it in the box?' },
        { promptKo: '폴이 "가방 안에 있어?"라고 물었어요. 없어요.', en: 'No, it ___.', options: ["isn't", 'is', 'not'], correct: 0, whyKo: "없을 때는 No, it isn't.예요." },
      ],
      order: [
        { promptKo: '단어를 놓아 상자 안에 있는지 묻는 문장을 만들어요.', words: ['it', 'the', 'Is', 'box?', 'in'], answers: [['Is', 'it', 'in', 'the', 'box?']], whyKo: 'Is it로 시작해요. 이 단어들로 만들 수 있는 문장은 하나예요.' },
        { promptKo: '단어를 놓아 가방을 되묻는 문장을 만들어요.', words: ['the', 'What', 'bag?', 'about'], answers: [['What', 'about', 'the', 'bag?']], whyKo: 'What about + the + 장소 순서예요.' },
      ],
      build: [
        { promptKo: '미아가 "책상 밑에 있어?"라고 물었어요. 없어요. 아니라고 하고 다른 곳을 되물어 보세요.', exampleEn: "No, it isn't. What about the bag?", exampleKo: '아니, 없어. 가방은?', acceptNoteKo: "No. What about the shelf? / No, it isn't. Is it in the bag?도 맞아요. 되묻는 장소는 자유예요. 두 문장으로 나누어 써도 돼요." },
        { promptKo: '필통을 찾고 있어요. 선반에 있는지 확인하는 질문을 만들어 보세요.', exampleEn: 'Is it on the shelf?', exampleKo: '선반 위에 있어?', acceptNoteKo: 'Is it in the box? / Is it under the chair?처럼 다른 장소도 맞아요. Is it …?으로 시작하면 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: "짝이 필통을 숨겼어요. Is it …?로 세 번 안에 찾아 보세요. 짝은 Yes, it is. / No, it isn't.로 답해요.", exampleEn: 'Is it in the box?', exampleKo: '상자 안에 있어?' },
    sources: ['own', 'pilot:c2-find-together-classroom'],
  },
]

const OUTLINE_UNITS = [
  // Easy 8개는 모두 READY_UNITS
  // Intermediate (ready g-int-01 + 아래 7 = 8)
  P('g-int-02', 'intermediate', 2, '엄마는 …해요', '가족이나 친구가 하는 일을 말할 수 있어요', 'third-person-s', ['g-easy-06']),
  P('g-int-03', 'intermediate', 3, '무엇을 좋아해?', 'What으로 묻고 What about you?로 되물을 수 있어요', 'wh-question-what', ['g-easy-07', 'g-int-01']),
  P('g-int-04', 'intermediate', 4, 'Can you …? 묻기', '할 수 있는지 묻고 짧게 답할 수 있어요', 'can-question-short-answer', ['g-easy-04', 'g-int-01']),
  P('g-int-05', 'intermediate', 5, '지금 …하고 있어요', '지금 하는 일을 말할 수 있어요', 'present-continuous', ['g-easy-06']),
  P('g-int-06', 'intermediate', 6, '위치 말 늘리기', 'next to·behind로 위치를 더 자세히 말할 수 있어요', 'prepositions-place-more', ['g-easy-02']),
  P('g-int-07', 'intermediate', 7, '어제 있었던 일', '어제 있었던 일을 짧게 말할 수 있어요', 'past-simple', ['g-easy-06']),
  P('g-int-08', 'intermediate', 8, 'Would you like …?', '무엇을 원하는지 묻고 권할 수 있어요', 'would-you-like-some', ['g-easy-07']),
  // Advanced (6)
  P('g-adv-01', 'advanced', 1, '계획 말하기 going to', '앞으로 할 일을 말할 수 있어요', 'going-to-plan', ['g-int-05']),
  P('g-adv-02', 'advanced', 2, '비교하기', '둘을 비교해서 말할 수 있어요', 'comparatives', ['g-int-03']),
  P('g-adv-03', 'advanced', 3, 'because·so 잇기', '이유와 결과를 이어서 말할 수 있어요', 'because-so', ['g-int-07']),
  P('g-adv-04', 'advanced', 4, 'when·if 잇기', '때와 조건을 이어서 말할 수 있어요', 'when-if-clause', ['g-adv-03']),
  P('g-adv-05', 'advanced', 5, 'should·have to', '해야 하는 일과 하면 좋은 일을 말할 수 있어요', 'should-have-to', ['g-easy-04']),
  P('g-adv-06', 'advanced', 6, '해 본 적 있어요', '해 본 경험을 말할 수 있어요', 'present-perfect-experience', ['g-int-07']),
  // Middle School (6) — basicsUnitId = 먼저 볼 Easy/Intermediate 기초 단원
  P('g-mid-01', 'middleSchool', 1, '시제 정리', '현재·과거·미래를 구분해 쓸 수 있어요', 'tense-system', [], { basicsUnitId: 'g-int-07' }),
  P('g-mid-02', 'middleSchool', 2, '조동사 can·may·must', '허락·의무를 나타내는 말을 쓸 수 있어요', 'modal-verbs', ['g-mid-01'], { basicsUnitId: 'g-easy-04' }),
  P('g-mid-03', 'middleSchool', 3, '수동태 기초', '"…당했다"는 문장을 만들 수 있어요', 'passive-voice', ['g-mid-01'], { basicsUnitId: 'g-easy-03' }),
  P('g-mid-04', 'middleSchool', 4, '관계대명사 who·which', '두 문장을 하나로 이어 설명할 수 있어요', 'relative-clause', ['g-mid-01'], { basicsUnitId: 'g-int-03' }),
  P('g-mid-05', 'middleSchool', 5, '분사로 꾸미기', '-ing·-ed로 명사를 꾸밀 수 있어요', 'participle', ['g-mid-01'], { basicsUnitId: 'g-int-05' }),
  P('g-mid-06', 'middleSchool', 6, '조건문 if', '만약의 상황을 말할 수 있어요', 'conditional-if', ['g-mid-01'], { basicsUnitId: 'g-easy-06' }),
  // High School (6)
  P('g-high-01', 'highSchool', 1, '완료 시제', '과거와 지금을 이어서 말할 수 있어요', 'perfect-tense', [], { basicsUnitId: 'g-int-07' }),
  P('g-high-02', 'highSchool', 2, '수동태 심화', '시제·조동사가 있는 수동태를 쓸 수 있어요', 'passive-voice', ['g-high-01'], { basicsUnitId: 'g-easy-03' }),
  P('g-high-03', 'highSchool', 3, '관계사 심화', '긴 문장 속 관계사를 해석하고 쓸 수 있어요', 'relative-clause', ['g-high-01'], { basicsUnitId: 'g-int-03' }),
  P('g-high-04', 'highSchool', 4, '가정법', '사실과 다른 상황을 말할 수 있어요', 'subjunctive-conditional', ['g-high-01'], { basicsUnitId: 'g-easy-06' }),
  P('g-high-05', 'highSchool', 5, '간접화법', '남이 한 말을 전달해 말할 수 있어요', 'reported-speech', ['g-high-01'], { basicsUnitId: 'g-int-07' }),
  P('g-high-06', 'highSchool', 6, '분사구문', '분사로 문장을 짧게 이어 쓸 수 있어요', 'participle', ['g-high-01'], { basicsUnitId: 'g-int-05' }),
]

export const GRAMMAR_UNITS = [...READY_UNITS, ...OUTLINE_UNITS]

export const grammarUnitById = (id) => GRAMMAR_UNITS.find((u) => u.id === id) || null
export const unitsForCourse = (courseId) => GRAMMAR_UNITS.filter((u) => u.courseId === courseId).sort((a, b) => a.order - b.order)
// 단원의 문항 수(선택은 시범 Unit 문항 포함)
export const practiceCounts = (u, pilotUnits) => ({ choice: resolveChoice(u, pilotUnits).length, blank: (u?.practice?.blank || []).length, order: (u?.practice?.order || []).length, build: (u?.practice?.build || []).length })
export const reviewStatusOf = (u) => (u?.reviewStatus === 'reviewed' ? 'reviewed' : 'unreviewed') // 구현 상태(status)와 교사 검수 상태는 별개
export const courseCounts = (courseId) => { const us = unitsForCourse(courseId); return { ready: us.filter((u) => u.status === 'ready').length, reviewed: us.filter((u) => u.status === 'ready' && reviewStatusOf(u) === 'reviewed').length, total: us.length } }

// 선택 연습 = 단원 자체 문항 + (fromUnitId가 있으면) 기존 시범 Unit의 문형 문항. 시범 Unit은 런타임에 units(=pilotUnits)에서 찾는다.
export function resolveChoice(unit, pilotUnits) {
  const own = unit?.practice?.choice || []
  const pilot = unit?.fromUnitId ? (pilotUnits || []).find((p) => p.id === unit.fromUnitId) : null
  return [...own, ...(pilot?.grammar?.items || [])]
}

// 문법어(내용어 아님) — 어휘 목록 없이도 문항에 쓸 수 있다. borrow·like·have·play·명사 등은 반드시 단원 words에 있어야 한다.
export const FUNCTION_WORDS = new Set("a an the my your his her i you he she it we they is am are isn't aren't can can't do don't does doesn't not this that these those there what where who how yes no and or in on under at to here sure about of for with it's where's i'm".split(' '))
// 등장인물 이름(내용어 아님)
export const NAME_WORDS = new Set(['paul', 'mia'])

const tokens = (t) => String(t ?? '').toLowerCase().split(/\s+/).map((w) => w.replace(/^[^a-z]+|[^a-z]+$/g, '')).filter((w) => /[a-z]/.test(w))
const wordSet = (u) => (u?.words || []).flatMap((w) => tokens(w.en))
function allowedTokens(u) {
  const ok = new Set([...FUNCTION_WORDS, ...NAME_WORDS, ...wordSet(u)])
  const seen = new Set()
  const walk = (id) => { if (seen.has(id)) return; seen.add(id); const p = grammarUnitById(id); if (!p) return; wordSet(p).forEach((w) => ok.add(w)); (p.prereqIds || []).forEach(walk) }
  ;(u.prereqIds || []).forEach(walk)
  if (u.courseId === 'easy') ['g-easy-01', 'g-easy-02'].forEach((id) => { if (id !== u.id) wordSet(grammarUnitById(id)).forEach((w) => ok.add(w)) })
  return ok
}
// 단원이 쓰는 영어 문장(오류 예시의 wrong은 제외)
function unitEnglish(u) {
  const p = u.practice || {}
  return [
    ...(u.examples || []).map((e) => e.en),
    ...(u.structure || []).flatMap((r) => [r.s, r.v, r.rest]),
    ...['aff', 'neg', 'q'].map((k) => u.compare?.[k]?.en),
    ...(u.errors || []).map((e) => e.right),
    ...(p.choice || []).map((c) => c.options?.[c.correct]), // 오답 보기는 제외(blank와 같음)
    ...(p.blank || []).flatMap((b) => [b.en, b.options?.[b.correct]]), // 오답 보기는 같은 단어의 틀린 형태(borrowing 등)라 제외
    ...(p.order || []).flatMap((o) => [...(o.words || []), ...(o.answers || []).map((a) => a.join(' '))]),
    ...(p.build || []).map((b) => b.exampleEn),
    u.use?.exampleEn,
  ]
}
const BRAND = /let'?s ?smile|\bunit ?\d|lesson ?\d|\d\s*권/i
export function validateGrammarUnit(u) {
  const errs = []
  const course = GRAMMAR_COURSES.find((c) => c.id === u?.courseId)
  if (!u?.id || typeof u.id !== 'string') errs.push('id')
  if (!course) errs.push('courseId')
  if (!Number.isInteger(u?.order) || u.order < 1) errs.push('order')
  if (!['ready', 'preparing'].includes(u?.status)) errs.push('status')
  if (!u?.titleKo || !u?.goalKo) errs.push('titleKo/goalKo')
  if (!Array.isArray(u?.prereqIds)) errs.push('prereqIds')
  else if (u.prereqIds.some((p) => !grammarUnitById(p))) errs.push('prereqIds 없는 단원')
  if (course?.kind === 'school' && (!u.basicsUnitId || !grammarUnitById(u.basicsUnitId))) errs.push('basicsUnitId')
  if (u?.reviewStatus !== undefined && !['unreviewed', 'reviewed'].includes(u.reviewStatus)) errs.push('reviewStatus')
  if (u?.words !== undefined && (!Array.isArray(u.words) || u.words.some((w) => !w?.en || !w?.ko))) errs.push('words {en, ko}')
  if (u?.status === 'ready') {
    const len = (a) => (Array.isArray(a) ? a.length : 0)
    const p = u.practice || {}
    if (len(u.examples) < 3) errs.push('examples ≥3')
    if (len(u.explainKo) < 2) errs.push('explainKo ≥2')
    if (len(u.structure) < 1) errs.push('structure ≥1')
    if (len(u.errors) < 2) errs.push('errors ≥2')
    if (len(p.blank) < 2) errs.push('practice.blank ≥2')
    if (len(p.order) < 2) errs.push('practice.order ≥2')
    if (len(p.build) < 2) errs.push('practice.build ≥2')
    if (len(p.choice) < 3 && !u.fromUnitId) errs.push('practice.choice ≥3 또는 fromUnitId')
    if ((p.blank || []).some((b) => !b.en?.includes('___') || !Number.isInteger(b.correct) || !b.options?.[b.correct])) errs.push('blank: ___ 또는 correct')
    if ((p.order || []).some((o) => !o.answers?.length || o.answers.some((a) => [...a].sort().join('|') !== [...o.words].sort().join('|')))) errs.push('order: answers가 words와 다름')
    if (!['speaking', 'writing'].includes(u.use?.kind)) errs.push('use.kind')
    if ((u.examples || []).some((e) => !e.en || !e.ko || e.en.trim().split(/\s+/).length > 8)) errs.push('example en ≤8단어')
    if (BRAND.test(JSON.stringify(u))) errs.push('교재 브랜드/단원 번호')
    if (Array.isArray(u.words)) {
      const ok = allowedTokens(u)
      const unknown = [...new Set(unitEnglish(u).flatMap(tokens).filter((w) => !ok.has(w)))]
      if (unknown.length) errs.push(`배우지 않은 단어: ${unknown.join(', ')}`)
    }
  }
  return errs
}

// 완료 = 구현 완료(ready)이고 검증 통과. 교사 검수(reviewStatus)와는 별개.
export const isComplete = (u) => u?.status === 'ready' && validateGrammarUnit(u).length === 0
