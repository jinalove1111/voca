// 2026-10-10 문법 단원 데이터 + 순수 도우미(저장·네트워크 없음). 스키마는 validateGrammarUnit 참고.
// status 'ready' 22개(Easy 8 + Intermediate 8 + Advanced 6; 아래 Easy/int-01 설명 참고. g-easy-01·02, g-int-01은 기존 시범 Unit 문형 문항을 fromUnitId로 재사용, Easy 03~08은 자체 선택 문항 3개) + 'preparing' 개요 12개(제목·학습 목표만, 화면에서 '준비 중').
// 구현 상태(status)와 교사 검수(reviewStatus)는 별개 — 전부 'unreviewed'. 어휘 규칙은 validateGrammarUnit 참고.
// 교사 확인(콘텐츠 담당 2026-10-10): 03 compare의 Are you…?/I am not은 미리보기일 뿐(연습은 긍정 am/is/are). 04 Mia can jump에 -s 없음(3인칭 -s는 g-int-02), can't·cannot 모두 인정.
// 05 복수 -s와 two는 가볍게만. 06이 don't를 07의 Do보다 먼저 가르침; 06 "I play ball."이 자연스러운지 확인(대안 I play with a ball). 08의 isn't/Is this는 compare에서만.
// 교사 확인 Intermediate: int-02 does/doesn't는 compare+선택 1개뿐(easy-06 대비 Does 신규); int-03 "What do you have in your bag?" 자연스러운지(8단어, 예문 아님); int-05 with는 문법어; int-06 explainKo 3행 재작성; int-07 Did/didn't는 미리보기, was/were만 불규칙; int-08 부정 = No, thank you.
// 교사 확인 Advanced: 순서 문항은 정답 하나(절 순서 교체 시 칩 구두점 변동); adv-02 bigger/taller만; adv-03 현재시제만·compare 생략·here/she 문법어; adv-05 have to는 I/We만; adv-06 규칙 분사 played/visited+been(seen 제외), adv-06은 int-07 이후 수업; "I play ball"/"Have you ever played ball?" 자연스러운지.
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
  {
    id: 'g-int-02', courseId: 'intermediate', order: 2,
    titleKo: '엄마는 …해요', goalKo: '가족이나 친구가 하는 일을 말할 수 있어요',
    conceptId: 'third-person-s', prereqIds: ['g-easy-06'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'My mum likes apples.', ko: '우리 엄마는 사과를 좋아해.' },
      { en: 'My dad has a dog.', ko: '우리 아빠는 개가 있어.' },
      { en: 'Mia plays tennis.', ko: '미아는 테니스를 해.' },
      { en: 'My sister likes pizza.', ko: '내 여동생은 피자를 좋아해.' },
    ],
    explainKo: [
      'I·you·we가 아닌 한 사람(엄마, 미아, 폴)이 하는 일을 말할 때는 동작 말 끝에 s를 붙여요.',
      'like는 likes, play는 plays가 돼요. have만 has로 모양이 바뀌어요.',
      "아니라고 할 때는 doesn't를 쓰고, 그 뒤 like는 s 없이 그대로 써요. (doesn't like)",
    ],
    structure: [
      { s: 'My mum', v: 'likes', rest: 'apples.', ko: '우리 엄마는 사과를 좋아해 (한 사람이면 likes)' },
      { s: 'My dad', v: 'has', rest: 'a dog.', ko: '우리 아빠는 개가 있어 (have는 has로 바뀌어요)' },
    ],
    compare: {
      aff: { en: 'My mum likes milk.', ko: '우리 엄마는 우유를 좋아해.' },
      neg: { en: "My mum doesn't like milk.", ko: '우리 엄마는 우유를 안 좋아해.' },
      q: { en: 'Does your mum like milk?', ko: '너희 엄마는 우유를 좋아하셔?' },
    },
    errors: [
      { wrong: 'My mum like apples.', right: 'My mum likes apples.', whyKo: '엄마 한 사람이 하는 일이라 like 끝에 s를 붙여요.' },
      { wrong: 'Mia have a dog.', right: 'Mia has a dog.', whyKo: 'Mia 한 사람 뒤에서는 have가 has로 바뀌어요.' },
    ],
    practice: {
      choice: [
        { promptKo: '우리 엄마는 사과를 좋아해요. 알맞은 문장은?', options: ['My mum likes apples.', 'My mum like apples.', 'My mum apples likes.'], correct: 0, whyKo: '엄마 한 사람이라 likes예요. → My mum likes apples.' },
        { promptKo: '미아는 개가 있어요. 알맞은 문장은?', options: ['Mia has a dog.', 'Mia have a dog.', 'Mia haves a dog.'], correct: 0, whyKo: 'have는 Mia 뒤에서 has가 돼요.' },
        { promptKo: '우리 아빠는 우유를 안 좋아해요. 알맞은 문장은?', options: ["My dad doesn't like milk.", "My dad doesn't likes milk.", "My dad don't like milk."], correct: 0, whyKo: "한 사람이 안 할 때는 doesn't + like(s 없이)예요." },
      ],
      blank: [
        { promptKo: '미아는 테니스를 해요.', en: 'Mia ___ tennis.', options: ['plays', 'play', 'playing'], correct: 0, whyKo: 'Mia 한 사람이라 plays예요. → Mia plays tennis.' },
        { promptKo: '내 여동생은 피자를 좋아해요.', en: 'My sister ___ pizza.', options: ['likes', 'like', 'liking'], correct: 0, whyKo: '한 사람이 좋아하면 likes예요. → My sister likes pizza.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "우리 엄마는 사과를 좋아해"를 만들어요.', words: ['likes', 'My', 'apples.', 'mum'], answers: [['My', 'mum', 'likes', 'apples.']], whyKo: 'My mum likes + 좋아하는 것 순서예요.' },
        { promptKo: '단어를 놓아 "미아는 개가 있어"를 만들어요.', words: ['has', 'Mia', 'a', 'dog.'], answers: [['Mia', 'has', 'a', 'dog.']], whyKo: 'Mia has + a dog 순서예요.' },
      ],
      build: [
        { promptKo: '우리 엄마가 좋아하는 것 하나를 말하거나 써 보세요.', exampleEn: 'My mum likes pizza.', exampleKo: '우리 엄마는 피자를 좋아해.', acceptNoteKo: 'My mum likes apples. / My dad likes milk.도 맞아요. 한 사람 + likes + 좋아하는 것이면 돼요.' },
        { promptKo: '가족이나 친구가 하는 운동 하나를 말하거나 써 보세요.', exampleEn: 'My sister plays tennis.', exampleKo: '내 여동생은 테니스를 해.', acceptNoteKo: 'Mia plays tennis. / My dad plays ball.처럼 사람이 달라도 맞아요. 한 사람 + plays면 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 우리 가족 한 명이 좋아하는 것 둘을 말해요. 짝도 똑같이 해요.', exampleEn: 'My dad likes pizza. My mum likes apples.', exampleKo: '우리 아빠는 피자를 좋아해. 우리 엄마는 사과를 좋아해.' },
    words: [{ en: 'mum', ko: '엄마' }, { en: 'dad', ko: '아빠' }, { en: 'sister', ko: '여동생, 언니, 누나' }, { en: 'pizza', ko: '피자' }, { en: 'tennis', ko: '테니스' }, { en: 'likes', ko: '좋아해' }, { en: 'has', ko: '가지고 있어' }, { en: 'plays', ko: '(놀이를) 해' }],
    sources: ['own'],
  },
  {
    id: 'g-int-03', courseId: 'intermediate', order: 3,
    titleKo: '무엇을 좋아해?', goalKo: 'What으로 묻고 What about you?로 되물을 수 있어요',
    conceptId: 'wh-question-what', prereqIds: ['g-easy-07', 'g-int-01'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'What do you like?', ko: '너는 무엇을 좋아해?' },
      { en: 'I like pizza.', ko: '나는 피자를 좋아해.' },
      { en: 'What about you, Mia?', ko: '너는 어때, 미아?' },
      { en: 'I like music.', ko: '나는 음악을 좋아해.' },
    ],
    explainKo: [
      'What do you like?는 "너는 무엇을 좋아해?" 하고 좋아하는 것을 물어요.',
      'Do you like apples?에서 apples 자리에 What을 쓰고 맨 앞으로 보내요. Do you like는 그대로예요.',
      '대답은 I like 뒤에 좋아하는 것을 넣고, 같은 질문을 돌려줄 때는 What about you?라고 해요.',
    ],
    structure: [
      { s: 'What do you', v: 'like', rest: '?', ko: '너는 무엇을 좋아해? (What이 맨 앞에 와요)' },
      { s: 'I', v: 'like', rest: 'pizza.', ko: '나는 피자를 좋아해 (대답은 일반 문장 순서)' },
    ],
    compare: {
      aff: { en: 'I like pizza.', ko: '나는 피자를 좋아해.' },
      neg: { en: "I don't like pizza.", ko: '나는 피자를 안 좋아해.' },
      q: { en: 'What do you like?', ko: '너는 무엇을 좋아해?' },
    },
    errors: [
      { wrong: 'What you do like?', right: 'What do you like?', whyKo: 'What 바로 다음에 do you 순서로 써요.' },
      { wrong: 'What about your?', right: 'What about you?', whyKo: '"너는?" 하고 되물을 때는 your가 아니라 you예요.' },
    ],
    practice: {
      choice: [
        { promptKo: '친구에게 무엇을 좋아하는지 물어요. 알맞은 문장은?', options: ['What do you like?', 'What you like?', 'What do like you?'], correct: 0, whyKo: 'What do you like? 순서예요.' },
        { promptKo: '친구가 "I like pizza."라고 했어요. 나도 "너는?" 하고 되물어요. 알맞은 문장은?', options: ['What about you?', 'What about your?', 'What is you?'], correct: 0, whyKo: '되물을 때는 What about you?예요.' },
        { promptKo: '친구에게 가방 안에 무엇이 있는지 물어요. 알맞은 문장은?', options: ['What do you have in your bag?', 'What you have in your bag?', 'Do what you have in your bag?'], correct: 0, whyKo: 'What do you have …? 순서로 물어요.' },
      ],
      blank: [
        { promptKo: '친구에게 무엇을 좋아하는지 물어요.', en: 'What ___ you like?', options: ['do', 'are', 'is'], correct: 0, whyKo: 'What 다음에 do you예요. → What do you like?' },
        { promptKo: '나는 주스를 좋아한다고 말하고 친구에게 되물어요.', en: 'I like juice. ___ about you?', options: ['What', 'Do', 'Is'], correct: 0, whyKo: '되물을 때는 What about you?예요.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "너는 무엇을 좋아해?"를 만들어요.', words: ['do', 'What', 'like?', 'you'], answers: [['What', 'do', 'you', 'like?']], whyKo: 'What do you like? 순서예요.' },
        { promptKo: '단어를 놓아 "너는 가방 안에 무엇이 있어?"를 만들어요.', words: ['bag?', 'you', 'What', 'in', 'have', 'the', 'do'], answers: [['What', 'do', 'you', 'have', 'in', 'the', 'bag?']], whyKo: 'What do you have + in the bag? 순서예요.' },
      ],
      build: [
        { promptKo: '짝이 좋아하는 것을 알고 싶어요. 물어 보세요.', exampleEn: 'What do you like?', exampleKo: '너는 무엇을 좋아해?', acceptNoteKo: 'What do you like, Mia?처럼 이름을 붙여도 맞아요. What do you like?로 시작하면 돼요.' },
        { promptKo: '내가 좋아하는 것을 말하고 짝에게 되물어 보세요.', exampleEn: 'I like apples. What about you?', exampleKo: '나는 사과를 좋아해. 너는?', acceptNoteKo: 'I like music. What about you? / I like banana juice. What about you?처럼 좋아하는 것은 자유예요. 두 문장으로 말하면 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 "What do you like?"로 묻고, 짝이 대답하면 "What about you?"로 되물어요. 서로 두 번씩 해요.', exampleEn: 'What do you like? I like pizza. What about you?', exampleKo: '너는 무엇을 좋아해? 나는 피자를 좋아해. 너는?' },
    words: [{ en: 'pizza', ko: '피자' }, { en: 'juice', ko: '주스' }, { en: 'banana', ko: '바나나' }, { en: 'music', ko: '음악' }, { en: 'bag', ko: '가방' }],
    sources: ['own'],
  },
  {
    id: 'g-int-04', courseId: 'intermediate', order: 4,
    titleKo: 'Can you …? 묻기', goalKo: '할 수 있는지 묻고 짧게 답할 수 있어요',
    conceptId: 'can-question-short-answer', prereqIds: ['g-easy-04', 'g-int-01'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'Can you swim?', ko: '너는 수영할 수 있어?' },
      { en: 'Yes, I can.', ko: '응, 할 수 있어.' },
      { en: "No, I can't.", ko: '아니, 못 해.' },
      { en: 'Can you ride a bike?', ko: '너는 자전거를 탈 수 있어?' },
    ],
    explainKo: [
      'Can you …?는 "너는 …할 수 있어?" 하고 할 수 있는지 물어요.',
      'I can swim.에서 can을 맨 앞으로 보내고 I를 you로 바꾸면 돼요.',
      "대답은 짧게 Yes, I can. / No, I can't.예요. 동작 말은 다시 안 써도 돼요.",
    ],
    structure: [
      { s: 'Can you', v: 'ride', rest: 'a bike?', ko: '너는 자전거를 탈 수 있어? (질문이라 Can이 맨 앞에 와요)' },
      { s: 'You', v: 'can ride', rest: 'a bike.', ko: '너는 자전거를 탈 수 있어 (일반 문장 순서)' },
    ],
    compare: {
      aff: { en: 'Yes, I can.', ko: '응, 할 수 있어.' },
      neg: { en: "No, I can't.", ko: '아니, 못 해.' },
      q: { en: 'Can you dance?', ko: '너는 춤출 수 있어?' },
    },
    errors: [
      { wrong: 'You can dance?', right: 'Can you dance?', whyKo: '질문은 Can을 맨 앞에 써요. You can으로 시작하면 질문이 아니에요.' },
      { wrong: "Yes, I can't.", right: 'Yes, I can.', whyKo: "can't(못 해)는 No와 함께 써요. Yes 뒤에는 can을 써요." },
    ],
    practice: {
      choice: [
        { promptKo: '친구가 춤출 수 있는지 물어요. 알맞은 문장은?', options: ['Can you dance?', 'You can dance?', 'Can dance you?'], correct: 0, whyKo: '질문은 Can you + 동작 순서예요.' },
        { promptKo: '"Can you swim?" 수영할 수 있어요. 알맞은 짧은 대답은?', options: ['Yes, I can.', 'Yes, I do.', 'Yes, I am.'], correct: 0, whyKo: 'Can으로 물으면 Yes, I can.으로 답해요.' },
        { promptKo: '"Can you ride a bike?" 못 타요. 알맞은 짧은 대답은?', options: ["No, I can't.", "No, I don't.", 'No, I can.'], correct: 0, whyKo: "Can으로 물으면 No, I can't.로 답해요." },
      ],
      blank: [
        { promptKo: '친구가 자전거를 탈 수 있는지 물어요.', en: 'Can you ___ a bike?', options: ['ride', 'rides', 'riding'], correct: 0, whyKo: 'Can you 뒤에는 ride를 그대로 써요. → Can you ride a bike?' },
        { promptKo: '"Can you run?" 달릴 수 있어서 짧게 대답해요.', en: 'Yes, I ___.', options: ['can', 'am', 'is'], correct: 0, whyKo: 'Can으로 물으면 Yes, I can.이에요.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "너는 자전거를 탈 수 있어?"를 만들어요.', words: ['you', 'ride', 'Can', 'a', 'bike?'], answers: [['Can', 'you', 'ride', 'a', 'bike?']], whyKo: 'Can you + 동작 + 물건 순서예요.' },
        { promptKo: '단어를 놓아 "너는 책을 읽을 수 있어?"를 만들어요.', words: ['read', 'Can', 'book?', 'you', 'a'], answers: [['Can', 'you', 'read', 'a', 'book?']], whyKo: 'Can you read a book? 순서예요.' },
      ],
      build: [
        { promptKo: '짝이 할 수 있는지 궁금한 것 하나를 물어 보세요.', exampleEn: 'Can you dance?', exampleKo: '너는 춤출 수 있어?', acceptNoteKo: 'Can you swim? / Can you sing? / Can you ride a bike?도 맞아요. Can you + 동작이면 돼요.' },
        { promptKo: '짝이 "Can you swim?" 하고 물었어요. 사실대로 짧게 대답해 보세요.', exampleEn: 'Yes, I can.', exampleKo: '응, 할 수 있어.', acceptNoteKo: "No, I can't.도 맞아요. 사실대로 Yes, I can. / No, I can't.로 말하면 돼요. 한 문장만 정답은 아니에요." },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 "Can you …?" 질문을 세 개 해요. 짝은 Yes, I can. / No, I can\'t.로만 답해요.', exampleEn: 'Can you ride a bike?', exampleKo: '너는 자전거를 탈 수 있어?' },
    words: [{ en: 'dance', ko: '춤추다' }, { en: 'ride', ko: '(자전거를) 타다' }, { en: 'bike', ko: '자전거' }],
    sources: ['own'],
  },
  {
    id: 'g-int-05', courseId: 'intermediate', order: 5,
    titleKo: '지금 …하고 있어요', goalKo: '지금 하는 일을 말할 수 있어요',
    conceptId: 'present-continuous', prereqIds: ['g-easy-06'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'I am eating an apple.', ko: '나는 사과를 먹고 있어.' },
      { en: 'Mia is watching TV.', ko: '미아는 TV를 보고 있어.' },
      { en: 'What are you doing?', ko: '너는 뭐 하고 있어?' },
      { en: 'I am drinking milk.', ko: '나는 우유를 마시고 있어.' },
    ],
    explainKo: [
      'I am …ing는 "지금 …하고 있어요" 하고 지금 하는 일을 말해요.',
      'am·is·are를 먼저 쓰고, 동작 말 끝에 ing를 붙여요. (eat은 eating)',
      '지금 뭘 하는지 물을 때는 What are you doing?이라고 해요.',
    ],
    structure: [
      { s: 'I', v: 'am eating', rest: 'an apple.', ko: '나는 사과를 먹고 있어 (am + ing)' },
      { s: 'Mia', v: 'is watching', rest: 'TV.', ko: '미아는 TV를 보고 있어 (한 사람이면 is + ing)' },
    ],
    compare: {
      aff: { en: 'I am eating an apple.', ko: '나는 사과를 먹고 있어.' },
      neg: { en: 'I am not eating an apple.', ko: '나는 사과를 먹고 있지 않아.' },
      q: { en: 'Are you eating an apple?', ko: '너는 사과를 먹고 있어?' },
    },
    errors: [
      { wrong: 'I eating an apple.', right: 'I am eating an apple.', whyKo: 'ing 말 앞에는 am이 필요해요. am이 빠지면 안 돼요.' },
      { wrong: 'Mia are watching TV.', right: 'Mia is watching TV.', whyKo: 'Mia는 한 사람이라 is를 써요. are는 You·We 뒤에 써요.' },
    ],
    practice: {
      choice: [
        { promptKo: '나는 지금 우유를 마시고 있어요. 알맞은 문장은?', options: ['I am drinking milk.', 'I drinking milk.', 'I am drink milk.'], correct: 0, whyKo: 'am + 동작 말 ing 순서예요.' },
        { promptKo: '미아는 지금 TV를 보고 있어요. 알맞은 문장은?', options: ['Mia is watching TV.', 'Mia are watching TV.', 'Mia watching is TV.'], correct: 0, whyKo: 'Mia 뒤에는 is + ing예요.' },
        { promptKo: '친구에게 지금 뭐 하는지 물어요. 알맞은 문장은?', options: ['What are you doing?', 'What you are doing?', 'What are you do?'], correct: 0, whyKo: 'What are you doing? 순서예요.' },
      ],
      blank: [
        { promptKo: '나는 지금 사과를 먹고 있어요.', en: 'I am ___ an apple.', options: ['eating', 'eat', 'eats'], correct: 0, whyKo: 'am 뒤에는 ing 모양이에요. → I am eating an apple.' },
        { promptKo: '미아는 지금 개와 놀고 있어요.', en: 'Mia ___ playing with a dog.', options: ['is', 'are', 'am'], correct: 0, whyKo: 'Mia 한 사람이라 is예요. → Mia is playing with a dog.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "나는 TV를 보고 있어"를 만들어요.', words: ['am', 'I', 'watching', 'TV.'], answers: [['I', 'am', 'watching', 'TV.']], whyKo: 'I am + 동작 말 ing 순서예요.' },
        { promptKo: '단어를 놓아 "너는 뭐 하고 있어?"를 만들어요.', words: ['are', 'What', 'doing?', 'you'], answers: [['What', 'are', 'you', 'doing?']], whyKo: 'What are you doing? 순서예요.' },
      ],
      build: [
        { promptKo: '지금 하고 있는 일 하나를 말하거나 써 보세요.', exampleEn: 'I am drinking milk.', exampleKo: '나는 우유를 마시고 있어.', acceptNoteKo: 'I am eating an apple. / I am watching TV.도 맞아요. 지금 하는 일이면 I am + ing로 말하면 돼요.' },
        { promptKo: '짝이 지금 뭘 하는지 물어 보세요.', exampleEn: 'What are you doing?', exampleKo: '너는 뭐 하고 있어?', acceptNoteKo: 'What are you doing, Mia? / What is Mia doing?도 맞아요. What are(is) … doing?이면 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '몸짓 퀴즈예요. 짝이 먹기·마시기·TV 보기 중 하나를 몸으로 보여 줘요. "What are you doing?"으로 묻고, 짝은 "I am …ing"로 답해요.', exampleEn: 'I am eating an apple.', exampleKo: '나는 사과를 먹고 있어.' },
    words: [{ en: 'eating', ko: '먹고 있는' }, { en: 'drinking', ko: '마시고 있는' }, { en: 'watching', ko: '보고 있는' }, { en: 'playing', ko: '놀고 있는' }, { en: 'doing', ko: '하고 있는' }, { en: 'TV', ko: '텔레비전' }],
    sources: ['own'],
  },
  {
    id: 'g-int-06', courseId: 'intermediate', order: 6,
    titleKo: '위치 말 늘리기', goalKo: 'next to·behind로 위치를 더 자세히 말할 수 있어요',
    conceptId: 'prepositions-place-more', prereqIds: ['g-easy-02'], status: 'ready', reviewStatus: 'unreviewed',
    words: [{ en: 'next to', ko: '~ 옆에' }, { en: 'behind', ko: '~ 뒤에' }, { en: 'in front of', ko: '~ 앞에' }, { en: 'cat', ko: '고양이' }, { en: 'door', ko: '문' }],
    examples: [
      { en: "Where's the cat?", ko: '고양이 어디 있어?' },
      { en: "It's behind the chair.", ko: '의자 뒤에 있어.' },
      { en: 'My bag is next to the desk.', ko: '내 가방은 책상 옆에 있어.' },
      { en: 'Paul is in front of the door.', ko: '폴은 문 앞에 있어.' },
    ],
    explainKo: [
      'in·under 말고도 위치를 말하는 말이 있어요. next to는 "옆에", behind는 "뒤에", in front of는 "앞에"예요.',
      '쓰는 순서는 같아요. It is + 위치 말 + the + 장소. (It is behind the chair.)',
      'behind 뒤에는 of를 붙이지 않고, in front 뒤에는 of를 꼭 붙여요.',
    ],
    structure: [
      { s: 'It', v: 'is', rest: 'behind the chair.', ko: '그것은 의자 뒤에 있어' },
      { s: 'My bag', v: 'is', rest: 'next to the desk.', ko: '내 가방은 책상 옆에 있어' },
    ],
    errors: [
      { wrong: 'It is behind of the chair.', right: 'It is behind the chair.', whyKo: 'behind 바로 뒤에는 of 없이 the chair를 써요.' },
      { wrong: "It's in front the door.", right: "It's in front of the door.", whyKo: '"앞에"는 in front of예요. of가 빠지면 안 돼요.' },
    ],
    practice: {
      choice: [
        { promptKo: '고양이가 의자 뒤에 있어요. 알맞은 문장은?', options: ['The cat is behind the chair.', 'The cat is behind of the chair.', 'The cat behind is the chair.'], correct: 0, whyKo: 'The cat is behind + the chair 순서예요. of는 안 써요.' },
        { promptKo: '가방이 책상 옆에 있어요. 알맞은 문장은?', options: ['My bag is next to the desk.', 'My bag is next the desk.', 'My bag next to is the desk.'], correct: 0, whyKo: '"옆에"는 next to예요. to를 빼지 않아요.' },
        { promptKo: '폴이 문 앞에 있어요. 알맞은 문장은?', options: ['Paul is in front of the door.', 'Paul is in front the door.', 'Paul in front of is the door.'], correct: 0, whyKo: '"앞에"는 in front of예요.' },
      ],
      blank: [
        { promptKo: '고양이가 상자 "뒤에" 있어요.', en: 'The cat is ___ the box.', options: ['behind', 'under', 'at'], correct: 0, whyKo: '"뒤에"는 behind예요. → The cat is behind the box.' },
        { promptKo: '가방이 책상 "옆에" 있어요.', en: 'My bag is next ___ the desk.', options: ['to', 'of', 'at'], correct: 0, whyKo: '"옆에"는 next to예요. → My bag is next to the desk.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "미아는 책상 앞에 있어"를 만들어요.', words: ['Mia', 'is', 'in', 'front', 'of', 'the', 'desk.'], answers: [['Mia', 'is', 'in', 'front', 'of', 'the', 'desk.']], whyKo: 'Mia is + in front of + the desk 순서예요.' },
        { promptKo: '단어를 놓아 "그것은 의자 뒤에 있어"를 만들어요.', words: ['It', 'is', 'behind', 'the', 'chair.'], answers: [['It', 'is', 'behind', 'the', 'chair.']], whyKo: 'It is + behind + the chair 순서예요.' },
      ],
      build: [
        { promptKo: '고양이가 문 뒤에 있어요. 짝에게 알려 주세요.', exampleEn: 'The cat is behind the door.', exampleKo: '고양이는 문 뒤에 있어.', acceptNoteKo: "It's behind the door. / The cat is behind the chair.도 맞아요. behind + 장소면 돼요." },
        { promptKo: '내 필통이 가방 옆에 있어요. 짝에게 알려 주세요.', exampleEn: 'My pencil case is next to the bag.', exampleKo: '내 필통은 가방 옆에 있어.', acceptNoteKo: "It's next to the bag. / My pencil case is next to the box.도 맞아요. next to + 장소면 돼요." },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝과 필통을 책상 위 여러 곳에 놓아 봐요. "Where\'s my pencil case?"로 묻고, 짝은 next to·behind·in front of로 알려 줘요.', exampleEn: 'My pencil case is next to the bag.', exampleKo: '내 필통은 가방 옆에 있어.' },
    sources: ['own'],
  },
  {
    id: 'g-int-07', courseId: 'intermediate', order: 7,
    titleKo: '어제 있었던 일', goalKo: '어제 있었던 일을 짧게 말할 수 있어요',
    conceptId: 'past-simple', prereqIds: ['g-easy-06'], status: 'ready', reviewStatus: 'unreviewed',
    words: [{ en: 'yesterday', ko: '어제' }, { en: 'played', ko: '놀았다' }, { en: 'watched', ko: '봤다' }, { en: 'TV', ko: 'TV' }, { en: 'was', ko: '~이었다, 있었다' }, { en: 'were', ko: '~이었다, 있었다' }, { en: 'home', ko: '집' }, { en: 'did', ko: '했니 (질문에 쓰는 말)' }, { en: "didn't", ko: '안 했어' }],
    examples: [
      { en: 'I played with my dog yesterday.', ko: '나는 어제 개랑 놀았어.' },
      { en: 'Mia watched TV yesterday.', ko: '미아는 어제 TV를 봤어.' },
      { en: 'I was at home yesterday.', ko: '나는 어제 집에 있었어.' },
      { en: 'Mia and I were at home yesterday.', ko: '미아와 나는 어제 집에 있었어.' },
    ],
    explainKo: [
      '어제처럼 지난 일을 말할 때는 동작 말 끝에 -ed를 붙여요. (play → played, watch → watched)',
      'am·is는 was, are는 were로 바꿔요. (I was, Mia was, We were)',
      'yesterday(어제)를 같이 말하면 지난 일이라는 걸 알기 쉬워요. 이 단원은 -ed 동작 말과 was·were만 배워요.',
    ],
    structure: [
      { s: 'I', v: 'played', rest: 'with my dog yesterday.', ko: '나는 어제 개랑 놀았어 (play + ed)' },
      { s: 'We', v: 'were', rest: 'at home yesterday.', ko: '우리는 어제 집에 있었어 (are → were, am·is → was)' },
    ],
    compare: {
      aff: { en: 'I played with my dog.', ko: '나는 개랑 놀았어.' },
      neg: { en: "I didn't play with my dog.", ko: '나는 개랑 안 놀았어.' },
      q: { en: 'Did you play with your dog?', ko: '너는 개랑 놀았어?' },
    },
    errors: [
      { wrong: 'I play with my dog yesterday.', right: 'I played with my dog yesterday.', whyKo: '어제 일이면 play가 아니라 played를 써요.' },
      { wrong: 'We was at home yesterday.', right: 'We were at home yesterday.', whyKo: 'We 뒤에는 was가 아니라 were를 써요.' },
    ],
    practice: {
      choice: [
        { promptKo: '미아는 어제 TV를 봤어요. 알맞은 문장은?', options: ['Mia watched TV yesterday.', 'Mia watch TV yesterday.', 'Mia watching TV yesterday.'], correct: 0, whyKo: '지난 일은 watched예요. → Mia watched TV yesterday.' },
        { promptKo: '나는 어제 집에 있었어요. 알맞은 문장은?', options: ['I was at home yesterday.', 'I am at home yesterday.', 'I were at home yesterday.'], correct: 0, whyKo: 'I의 지난 말은 was예요. → I was at home yesterday.' },
        { promptKo: '나는 어제 친구랑 놀았어요. 알맞은 문장은?', options: ['I played with my friend yesterday.', 'I play with my friend yesterday.', 'I playing with my friend yesterday.'], correct: 0, whyKo: '어제 일은 played예요.' },
      ],
      blank: [
        { promptKo: '미아는 어제 TV를 봤어요.', en: 'Mia ___ TV yesterday.', options: ['watched', 'watch', 'watches'], correct: 0, whyKo: '어제 일이라 watched예요. → Mia watched TV yesterday.' },
        { promptKo: '우리는 어제 집에 있었어요.', en: 'We ___ at home yesterday.', options: ['were', 'was', 'are'], correct: 0, whyKo: 'We의 지난 말은 were예요. → We were at home yesterday.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "나는 어제 개랑 놀았어"를 만들어요.', words: ['I', 'with', 'played', 'my', 'dog', 'yesterday.'], answers: [['I', 'played', 'with', 'my', 'dog', 'yesterday.']], whyKo: 'I played + with my dog + yesterday 순서예요.' },
        { promptKo: '단어를 놓아 "미아는 어제 집에 있었어"를 만들어요.', words: ['Mia', 'was', 'at', 'home', 'yesterday.'], answers: [['Mia', 'was', 'at', 'home', 'yesterday.']], whyKo: 'Mia was + at home + yesterday 순서예요.' },
      ],
      build: [
        { promptKo: '어제 한 일 하나를 말하거나 써 보세요. (TV를 봤거나 놀았어요)', exampleEn: 'I watched TV yesterday.', exampleKo: '나는 어제 TV를 봤어.', acceptNoteKo: 'I played with my dog yesterday. / Mia watched TV.도 맞아요. 지난 일이면 played·watched처럼 -ed를 붙여요.' },
        { promptKo: '어제 어디에 있었는지 말하거나 써 보세요.', exampleEn: 'I was at home yesterday.', exampleKo: '나는 어제 집에 있었어.', acceptNoteKo: 'I was at school. / We were at home.도 맞아요. I는 was, We는 were예요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 어제 한 일 하나와 어디에 있었는지 말해요. 짝도 똑같이 해요.', exampleEn: 'I watched TV yesterday. I was at home.', exampleKo: '나는 어제 TV를 봤어. 집에 있었어.' },
    sources: ['own'],
  },
  {
    id: 'g-int-08', courseId: 'intermediate', order: 8,
    titleKo: 'Would you like …?', goalKo: '무엇을 원하는지 묻고 권할 수 있어요',
    conceptId: 'would-you-like-some', prereqIds: ['g-easy-07'], status: 'ready', reviewStatus: 'unreviewed',
    words: [{ en: 'would', ko: '(정중하게) ~하겠어요?' }, { en: 'some', ko: '조금, 약간' }, { en: 'juice', ko: '주스' }, { en: 'cake', ko: '케이크' }, { en: 'please', ko: '네, 주세요' }, { en: 'thank you', ko: '고마워요' }],
    examples: [
      { en: 'Would you like some juice?', ko: '주스 좀 마실래?' },
      { en: 'Yes, please.', ko: '응, 줘.' },
      { en: 'No, thank you.', ko: '아니, 괜찮아.' },
      { en: 'I would like some cake, please.', ko: '케이크 좀 먹고 싶어요.' },
    ],
    explainKo: [
      'Would you like …?는 "…먹을래요?" 하고 정중하게 권하는 말이에요. Do you like …?(…좋아해?)와는 뜻이 달라요.',
      '먹거나 마실 것 앞에는 some(조금)을 붙여요. (some juice, some cake)',
      '받고 싶으면 Yes, please. 괜찮으면 No, thank you.라고 해요. 내가 원할 때는 I would like …예요.',
    ],
    structure: [
      { s: 'Would you', v: 'like', rest: 'some juice?', ko: '주스 좀 마실래? (권하는 질문이라 Would가 맨 앞)' },
      { s: 'I', v: 'would like', rest: 'some cake.', ko: '나는 케이크를 좀 먹고 싶어요 (일반 문장 순서)' },
    ],
    compare: {
      aff: { en: 'Yes, please.', ko: '응, 줘.' },
      neg: { en: 'No, thank you.', ko: '아니, 괜찮아.' },
      q: { en: 'Would you like some juice?', ko: '주스 좀 마실래?' },
    },
    errors: [
      { wrong: 'You would like some juice?', right: 'Would you like some juice?', whyKo: '권하는 질문은 Would you로 시작해요. 순서를 바꾸면 질문이 되지 않아요.' },
      { wrong: 'No, please.', right: 'No, thank you.', whyKo: '받을 때는 Yes, please. 거절할 때는 No, thank you.예요.' },
    ],
    practice: {
      choice: [
        { promptKo: '친구에게 주스를 권해요. 알맞은 문장은?', options: ['Would you like some juice?', 'You would like some juice?', 'Like you would some juice?'], correct: 0, whyKo: '권하는 질문은 Would you like some …? 순서예요.' },
        { promptKo: '"Would you like some cake?" 케이크를 먹고 싶어요. 알맞은 대답은?', options: ['Yes, please.', 'No, please.', 'Yes, no.'], correct: 0, whyKo: '받고 싶을 때는 Yes, please.예요.' },
        { promptKo: '나는 우유를 좀 마시고 싶어요. 알맞은 문장은?', options: ['I would like some milk.', 'I would like milk some.', 'I like would some milk.'], correct: 0, whyKo: 'I would like some + 음료 순서예요.' },
      ],
      blank: [
        { promptKo: '친구에게 케이크를 권해요.', en: 'Would you ___ some cake?', options: ['like', 'likes', 'to'], correct: 0, whyKo: 'Would you 뒤에는 like를 그대로 써요. → Would you like some cake?' },
        { promptKo: '케이크가 괜찮다고 정중하게 거절해요.', en: 'No, ___ you.', options: ['thank', 'please', 'some'], correct: 0, whyKo: '거절할 때는 No, thank you.예요.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "주스 좀 마실래?"를 만들어요.', words: ['you', 'Would', 'some', 'like', 'juice?'], answers: [['Would', 'you', 'like', 'some', 'juice?']], whyKo: 'Would you like some + 음료 순서예요.' },
        { promptKo: '단어를 놓아 "나는 우유를 좀 마시고 싶어요"를 만들어요.', words: ['milk.', 'would', 'I', 'like', 'some'], answers: [['I', 'would', 'like', 'some', 'milk.']], whyKo: 'I would like some + 음료 순서예요.' },
      ],
      build: [
        { promptKo: '친구에게 주스를 권해 보세요.', exampleEn: 'Would you like some juice?', exampleKo: '주스 좀 마실래?', acceptNoteKo: 'Would you like some cake? / Would you like some milk?도 맞아요. Would you like some + 먹거나 마실 것이면 돼요.' },
        { promptKo: '친구가 "Would you like some cake?" 하고 물었어요. 먹고 싶어요. 대답해 보세요.', exampleEn: 'Yes, please.', exampleKo: '응, 줘.', acceptNoteKo: 'Yes, please. I would like some cake. / Yes, please!도 맞아요. 먹고 싶지 않을 때는 No, thank you.라고 해요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 juice·cake·milk·apples 중 하나를 골라 "Would you like some …?"으로 권해요. 짝은 Yes, please. / No, thank you.로 답해요.', exampleEn: 'Would you like some cake?', exampleKo: '케이크 좀 먹을래?' },
    sources: ['own'],
  },
  {
    id: 'g-adv-01', courseId: 'advanced', order: 1,
    titleKo: '계획 말하기 going to', goalKo: '앞으로 할 일을 말할 수 있어요',
    conceptId: 'going-to-plan', prereqIds: ['g-int-05'], status: 'ready', reviewStatus: 'unreviewed',
    words: [{ en: 'going', ko: '(…할) 예정인' }, { en: 'tomorrow', ko: '내일' }, { en: 'festival', ko: '축제' }, { en: 'sing', ko: '노래하다' }, { en: 'dance', ko: '춤추다' }],
    examples: [
      { en: 'I am going to sing tomorrow.', ko: '나는 내일 노래할 거야.' },
      { en: 'Mia is going to dance at the festival.', ko: '미아는 축제에서 춤출 거야.' },
      { en: 'We are going to sing at the festival.', ko: '우리는 축제에서 노래할 거야.' },
    ],
    explainKo: [
      'am·is·are + going to + 동작 말은 "…할 거야" 하고 앞으로 할 계획을 말해요.',
      'I 뒤에는 am, Mia처럼 한 사람 뒤에는 is, We·You 뒤에는 are를 써요.',
      'going to 뒤의 동작 말(sing, dance)에는 s를 붙이지 않고 그대로 써요.',
    ],
    structure: [
      { s: 'I', v: 'am going to', rest: 'sing tomorrow.', ko: '나는 내일 노래할 거야 (am·is·are + going to + 동작)' },
      { s: 'Mia', v: 'is going to', rest: 'dance at the festival.', ko: '미아는 축제에서 춤출 거야 (한 사람이라 is)' },
    ],
    compare: {
      aff: { en: 'I am going to sing.', ko: '나는 노래할 거야.' },
      neg: { en: 'I am not going to sing.', ko: '나는 노래하지 않을 거야.' },
      q: { en: 'Are you going to sing?', ko: '너는 노래할 거야?' },
    },
    errors: [
      { wrong: 'I going to sing tomorrow.', right: 'I am going to sing tomorrow.', whyKo: 'going 앞에 am·is·are가 꼭 필요해요. I 뒤에는 am이에요.' },
      { wrong: 'Mia is going to dances.', right: 'Mia is going to dance at the festival.', whyKo: 'going to 뒤의 동작 말에는 s를 붙이지 않아요.' },
    ],
    practice: {
      choice: [
        { promptKo: '나는 내일 노래할 거예요. 알맞은 문장은?', options: ['I am going to sing tomorrow.', 'I going to sing tomorrow.', 'I am go to sing tomorrow.'], correct: 0, whyKo: 'I am going to + 동작 순서예요.' },
        { promptKo: '미아는 축제에서 춤출 거예요. 알맞은 문장은?', options: ['Mia is going to dance at the festival.', 'Mia are going to dance at the festival.', 'Mia is going dance at the festival.'], correct: 0, whyKo: '미아 한 사람이라 is, 그리고 going 뒤에 to가 와요.' },
        { promptKo: '우리는 노래할 거예요. 알맞은 문장은?', options: ['We are going to sing.', 'We is going to sing.', 'We are going to sings.'], correct: 0, whyKo: 'We 뒤에는 are이고 동작 말에는 s가 없어요.' },
      ],
      blank: [
        { promptKo: '나는 내일 노래할 거예요.', en: 'I am ___ to sing tomorrow.', options: ['going', 'go', 'goes'], correct: 0, whyKo: 'am going to로 계획을 말해요.' },
        { promptKo: '미아는 내일 춤출 거예요.', en: 'Mia ___ going to dance tomorrow.', options: ['is', 'are', 'am'], correct: 0, whyKo: '미아 한 사람이라 is예요.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "나는 내일 춤출 거야"를 만들어요.', words: ['going', 'I', 'am', 'to', 'dance', 'tomorrow.'], answers: [['I', 'am', 'going', 'to', 'dance', 'tomorrow.']], whyKo: 'I am going to + 동작 + tomorrow 순서예요.' },
        { promptKo: '단어를 놓아 "우리는 축제에서 노래할 거야"를 만들어요.', words: ['at', 'We', 'are', 'to', 'going', 'the', 'sing', 'festival.'], answers: [['We', 'are', 'going', 'to', 'sing', 'at', 'the', 'festival.']], whyKo: 'We are going to + 동작 + 장소 순서예요.' },
      ],
      build: [
        { promptKo: '내일 노래할 계획을 말하거나 써 보세요.', exampleEn: 'I am going to sing tomorrow.', exampleKo: '나는 내일 노래할 거야.', acceptNoteKo: 'I am going to dance tomorrow. 처럼 동작을 바꿔도 맞아요. I am going to + 동작이면 돼요.' },
        { promptKo: '친구들과 축제에서 춤출 계획을 말해 보세요.', exampleEn: 'We are going to dance at the festival.', exampleKo: '우리는 축제에서 춤출 거야.', acceptNoteKo: 'We are going to sing at the festival. 도 맞아요. We are going to로 시작하면 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 내일이나 축제 때 할 계획 둘을 말해요. 짝은 "Are you going to …?"로 되물어요.', exampleEn: 'I am going to sing at the festival.', exampleKo: '나는 축제에서 노래할 거야.' },
    sources: ['own'],
  },
  {
    id: 'g-adv-02', courseId: 'advanced', order: 2,
    titleKo: '비교하기', goalKo: '둘을 비교해서 말할 수 있어요',
    conceptId: 'comparatives', prereqIds: ['g-int-03'], status: 'ready', reviewStatus: 'unreviewed',
    words: [{ en: 'bigger', ko: '더 큰' }, { en: 'taller', ko: '키가 더 큰' }, { en: 'than', ko: '…보다' }, { en: 'ball', ko: '공' }, { en: 'box', ko: '상자' }],
    examples: [
      { en: 'Paul is taller than Mia.', ko: '폴은 미아보다 키가 커.' },
      { en: 'My ball is bigger than your ball.', ko: '내 공이 네 공보다 커.' },
      { en: 'The box is bigger than the ball.', ko: '상자가 공보다 커.' },
      { en: 'Mia is not taller than Paul.', ko: '미아는 폴보다 키가 크지 않아.' },
    ],
    explainKo: [
      '두 가지를 비교할 때는 tall, big 뒤에 -er을 붙여 taller, bigger로 말해요. "더 …한"이라는 뜻이에요.',
      '비교하는 대상 앞에는 than을 써요. than은 "…보다"라는 뜻이에요.',
      'big은 g를 하나 더 써서 bigger가 돼요. (tall은 taller)',
    ],
    structure: [
      { s: 'Paul', v: 'is', rest: 'taller than Mia.', ko: '폴은 미아보다 키가 커 (형용사-er + than)' },
      { s: 'The box', v: 'is', rest: 'bigger than the ball.', ko: '상자가 공보다 커' },
    ],
    compare: {
      aff: { en: 'Paul is taller than Mia.', ko: '폴은 미아보다 키가 커.' },
      neg: { en: 'Mia is not taller than Paul.', ko: '미아는 폴보다 키가 크지 않아.' },
      q: { en: 'Is Paul taller than Mia?', ko: '폴이 미아보다 키가 커?' },
    },
    errors: [
      { wrong: 'Paul is tall than Mia.', right: 'Paul is taller than Mia.', whyKo: '비교할 때는 tall에 -er을 붙여 taller로 써요.' },
      { wrong: 'The box is bigger the ball.', right: 'The box is bigger than the ball.', whyKo: 'bigger 다음에 than이 있어야 "…보다"가 돼요.' },
    ],
    practice: {
      choice: [
        { promptKo: '폴이 미아보다 키가 커요. 알맞은 문장은?', options: ['Paul is taller than Mia.', 'Paul is tall than Mia.', 'Paul is taller Mia.'], correct: 0, whyKo: 'taller + than + 비교 대상 순서예요.' },
        { promptKo: '상자가 공보다 커요. 알맞은 문장은?', options: ['The box is bigger than the ball.', 'The box is biger than the ball.', 'The box is bigger that the ball.'], correct: 0, whyKo: 'big은 g를 하나 더 써서 bigger, 그리고 than이에요.' },
        { promptKo: '내 공이 네 공보다 커요. 알맞은 문장은?', options: ['My ball is bigger than your ball.', 'My ball is big than your ball.', 'My ball bigger is than your ball.'], correct: 0, whyKo: '…is bigger than … 순서예요.' },
      ],
      blank: [
        { promptKo: '그림에서 미아가 폴보다 키가 더 커요.', en: 'Mia is ___ than Paul.', options: ['taller', 'tall', 'tallest'], correct: 0, whyKo: '둘을 비교하니 -er을 붙여 taller예요.' },
        { promptKo: '상자가 공보다 커요.', en: 'The box is bigger ___ the ball.', options: ['than', 'that', 'in'], correct: 0, whyKo: '"…보다"는 than이에요.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "폴은 미아보다 키가 커"를 만들어요.', words: ['is', 'Paul', 'than', 'taller', 'Mia.'], answers: [['Paul', 'is', 'taller', 'than', 'Mia.']], whyKo: 'Paul is taller than + 비교 대상 순서예요.' },
        { promptKo: '단어를 놓아 "상자가 공보다 커"를 만들어요.', words: ['bigger', 'The', 'is', 'than', 'ball.', 'the', 'box'], answers: [['The', 'box', 'is', 'bigger', 'than', 'the', 'ball.']], whyKo: 'The box is bigger than the ball. 순서예요.' },
      ],
      build: [
        { promptKo: '폴과 미아 중 폴이 더 커요. 비교해서 말해 보세요.', exampleEn: 'Paul is taller than Mia.', exampleKo: '폴은 미아보다 키가 커.', acceptNoteKo: 'Mia is not taller than Paul. 도 맞아요. 형용사-er + than을 쓰면 돼요.' },
        { promptKo: '공과 상자 중 상자가 더 커요. 비교해서 말해 보세요.', exampleEn: 'The box is bigger than the ball.', exampleKo: '상자가 공보다 커.', acceptNoteKo: 'The ball is not bigger than the box. 도 맞아요. bigger than을 쓰면 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '교실에서 두 가지를 골라 bigger 또는 taller로 비교해요. 짝은 "Is … bigger than …?"로 되물어요.', exampleEn: 'My ball is bigger than your ball.', exampleKo: '내 공이 네 공보다 커.' },
    sources: ['own'],
  },
  {
    id: 'g-adv-03', courseId: 'advanced', order: 3,
    titleKo: 'because·so 잇기', goalKo: '이유와 결과를 이어서 말할 수 있어요',
    conceptId: 'because-so', prereqIds: ['g-int-07'], status: 'ready', reviewStatus: 'unreviewed',
    words: [{ en: 'because', ko: '…때문에' }, { en: 'so', ko: '그래서' }, { en: 'hungry', ko: '배고픈' }, { en: 'tired', ko: '피곤한' }, { en: 'eat', ko: '먹다' }, { en: 'apple', ko: '사과' }],
    examples: [
      { en: 'I am hungry, so I eat an apple.', ko: '나는 배고파서 사과를 먹어.' },
      { en: 'I eat an apple because I am hungry.', ko: '나는 배고프기 때문에 사과를 먹어.' },
      { en: 'Mia is tired, so she is not here.', ko: '미아는 피곤해서 여기 없어.' },
      { en: 'Mia is not here because she is tired.', ko: '미아는 피곤하기 때문에 여기 없어.' },
    ],
    explainKo: [
      'because는 이유를 말해요. 이유 앞에 붙여서 "…하기 때문에"라는 뜻이에요.',
      'so는 결과를 말해요. 결과 앞에 붙여서 "그래서 …해"라는 뜻이고, so 앞에는 쉼표(,)를 써요.',
      '같은 뜻을 두 가지로 말할 수 있어요. 결과 because 이유 / 이유, so 결과 순서예요.',
    ],
    structure: [
      { s: 'I', v: 'eat', rest: 'an apple because I am hungry.', ko: '나는 배고프기 때문에 사과를 먹어 (because 뒤에 이유)' },
      { s: 'Mia', v: 'is', rest: 'tired, so she is not here.', ko: '미아는 피곤해서 여기 없어 (so 뒤에 결과)' },
    ],
    errors: [
      { wrong: 'I am hungry, because I eat an apple.', right: 'I am hungry, so I eat an apple.', whyKo: '결과(사과를 먹어) 앞에는 so를 써요. because는 이유 앞에 써요.' },
      { wrong: 'I eat an apple so I am hungry.', right: 'I eat an apple because I am hungry.', whyKo: '이유(배고파)는 because 뒤에 와요. 이유와 결과가 바뀌면 뜻이 이상해져요.' },
    ],
    practice: {
      choice: [
        { promptKo: '배고파서 사과를 먹어요. so로 말해요. 알맞은 문장은?', options: ['I am hungry, so I eat an apple.', 'I am hungry, because I eat an apple.', 'I am hungry so because I eat an apple.'], correct: 0, whyKo: '결과 앞에는 so예요.' },
        { promptKo: '배고프기 때문에 사과를 먹어요. because로 말해요. 알맞은 문장은?', options: ['I eat an apple because I am hungry.', 'I eat an apple so I am hungry.', 'I eat an apple because hungry.'], correct: 0, whyKo: 'because 뒤에는 이유 문장(I am hungry)이 와요.' },
        { promptKo: '미아는 피곤해서 여기 없어요. 알맞은 문장은?', options: ['Mia is tired, so she is not here.', 'Mia is tired, because she is not here.', 'Mia is tired, so she not is here.'], correct: 0, whyKo: '피곤한 것이 이유이고 없는 것이 결과라 so로 이어요.' },
      ],
      blank: [
        { promptKo: '피곤해서(이유) 여기 없어요(결과).', en: 'Mia is tired, ___ she is not here.', options: ['so', 'because', 'to'], correct: 0, whyKo: '결과 앞에는 so예요.' },
        { promptKo: '배고프기 때문에 사과를 먹어요.', en: 'I eat an apple ___ I am hungry.', options: ['because', 'so', 'or'], correct: 0, whyKo: '이유 앞에는 because예요.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "미아는 피곤해서 여기 없어"를 만들어요.', words: ['so', 'Mia', 'is', 'not', 'tired,', 'she', 'is', 'here.'], answers: [['Mia', 'is', 'tired,', 'so', 'she', 'is', 'not', 'here.']], whyKo: '이유, so 결과 순서예요.' },
        { promptKo: '단어를 놓아 "나는 배고프기 때문에 사과를 먹어"를 만들어요.', words: ['because', 'I', 'eat', 'I', 'an', 'am', 'apple', 'hungry.'], answers: [['I', 'eat', 'an', 'apple', 'because', 'I', 'am', 'hungry.']], whyKo: '결과 because 이유 순서예요.' },
      ],
      build: [
        { promptKo: '배가 고파서 사과를 먹어요. because를 써서 말하거나 써 보세요.', exampleEn: 'I eat an apple because I am hungry.', exampleKo: '나는 배고프기 때문에 사과를 먹어.', acceptNoteKo: 'Because I am hungry, I eat an apple. / I am hungry, so I eat an apple.도 맞아요. 이유와 결과가 맞으면 돼요.' },
        { promptKo: '미아가 피곤해서 여기 없어요. so를 써서 말하거나 써 보세요.', exampleEn: 'Mia is tired, so she is not here.', exampleKo: '미아는 피곤해서 여기 없어.', acceptNoteKo: 'Mia is not here because she is tired.도 맞아요. so 앞에는 이유, because 뒤에도 이유가 와요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 because 문장 하나와 so 문장 하나를 말해요. 배고픈 일, 피곤한 일을 떠올려 봐요.', exampleEn: 'Mia is not here because she is tired.', exampleKo: '미아는 피곤하기 때문에 여기 없어.' },
    sources: ['own'],
  },
  {
    id: 'g-adv-04', courseId: 'advanced', order: 4,
    titleKo: 'when·if 잇기', goalKo: '때와 조건을 이어서 말할 수 있어요',
    conceptId: 'when-if-clause', prereqIds: ['g-adv-03'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'When it rains, I stay home.', ko: '비가 올 때, 나는 집에 있어.' },
      { en: 'If you are tired, you can sleep.', ko: '피곤하면 잘 수 있어.' },
      { en: 'When I am hungry, I eat.', ko: '배고플 때, 나는 먹어.' },
      { en: 'I play ball if it is sunny.', ko: '날이 맑으면 나는 공놀이를 해.' },
    ],
    explainKo: [
      'When과 If는 두 문장을 이어 주는 말이에요. When은 "…할 때", If는 "…하면(만약)"이라는 뜻이에요.',
      'When·If가 들어간 부분이 앞에 오면 그 뒤에 쉼표(,)를 찍어요. When it rains, I stay home.',
      '뒤에 오면 쉼표 없이 이어 써요. I play ball if it is sunny. 뜻은 같아요.',
    ],
    structure: [
      { s: 'When it', v: 'rains,', rest: 'I stay home.', ko: '비가 올 때, 나는 집에 있어 (When 부분이 앞이면 쉼표)' },
      { s: 'I play ball', v: 'if', rest: 'it is sunny.', ko: '날이 맑으면 나는 공놀이를 해 (If 부분이 뒤면 쉼표 없음)' },
    ],
    errors: [
      { wrong: 'When it is rains, I stay home.', right: 'When it rains, I stay home.', whyKo: 'rains 자체가 "비가 온다"는 뜻이라 is를 더 넣지 않아요.' },
      { wrong: 'If you tired, you can sleep.', right: 'If you are tired, you can sleep.', whyKo: 'tired(피곤한) 앞에는 are가 필요해요. You 뒤에는 are예요.' },
    ],
    practice: {
      choice: [
        { promptKo: '"비가 올 때, 나는 집에 있어요." 알맞은 문장은?', options: ['When it rains, I stay home.', 'When it is rains, I stay home.', 'It rains when, I stay home.'], correct: 0, whyKo: 'When + 때를 말하는 부분, 그 뒤에 쉼표와 하는 일 순서예요.' },
        { promptKo: '"배고플 때, 나는 먹어요." 알맞은 문장은?', options: ['When I am hungry, I eat.', 'When I hungry, I eat.', 'When I am hungry, I am eat.'], correct: 0, whyKo: 'hungry 앞에 am이 필요하고, eat 앞에는 am을 넣지 않아요.' },
        { promptKo: '"날이 맑으면 나는 공놀이를 해요." 알맞은 문장은?', options: ['I play ball if it is sunny.', 'I play ball if is sunny it.', 'I play ball if it sunny.'], correct: 0, whyKo: 'if 뒤에도 it is sunny 순서를 그대로 써요.' },
      ],
      blank: [
        { promptKo: '"만약 피곤하면, 잘 수 있어요."', en: '___ you are tired, you can sleep.', options: ['If', 'Are', 'Not'], correct: 0, whyKo: '"…하면(만약)"은 If예요. → If you are tired, you can sleep.' },
        { promptKo: '"비가 올 때, 나는 집에 있어요."', en: 'When it ___, I stay home.', options: ['rains', 'is rains', 'raining'], correct: 0, whyKo: 'When it 뒤에는 rains만 써요. → When it rains, I stay home.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "비가 올 때, 나는 집에 있어"를 만들어요. (쉼표는 rains, 안에 있어요)', words: ['rains,', 'it', 'I', 'home.', 'stay', 'When'], answers: [['When', 'it', 'rains,', 'I', 'stay', 'home.']], whyKo: 'When it rains, 다음에 I stay home. 순서예요.' },
        { promptKo: '단어를 놓아 "날이 맑으면 나는 공놀이를 해"를 만들어요.', words: ['if', 'sunny.', 'I', 'it', 'ball', 'is', 'play'], answers: [['I', 'play', 'ball', 'if', 'it', 'is', 'sunny.']], whyKo: '하는 일을 먼저 말하고 if 부분을 뒤에 붙여요. 이때는 쉼표가 없어요.' },
      ],
      build: [
        { promptKo: '비 오는 날 내가 하는 일을 When으로 말하거나 써 보세요.', exampleEn: 'When it rains, I stay home.', exampleKo: '비가 올 때, 나는 집에 있어.', acceptNoteKo: 'When it rains, I read a book. / I stay home when it rains.도 맞아요. When으로 때를 말하고 하는 일을 이으면 돼요. When 부분이 앞이면 쉼표를 찍어요.' },
        { promptKo: '날이 맑을 때 하고 싶은 일을 If로 말하거나 써 보세요.', exampleEn: 'If it is sunny, I play ball.', exampleKo: '날이 맑으면 나는 공놀이를 해.', acceptNoteKo: 'I play ball if it is sunny. / If it is sunny, I can swim.도 맞아요. If로 조건을 말하고 하는 일을 이으면 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 "When I am …, I …" 문장 하나와 "If you are …, you can …" 문장 하나를 말해요.', exampleEn: 'When I am hungry, I eat.', exampleKo: '배고플 때, 나는 먹어.' },
    words: [{ en: 'when', ko: '…할 때' }, { en: 'if', ko: '만약 …하면' }, { en: 'rains', ko: '비가 온다' }, { en: 'stay', ko: '머물다' }, { en: 'home', ko: '집' }, { en: 'tired', ko: '피곤한' }, { en: 'sleep', ko: '자다' }, { en: 'hungry', ko: '배고픈' }, { en: 'eat', ko: '먹다' }, { en: 'play', ko: '(놀이를) 하다' }, { en: 'ball', ko: '공' }, { en: 'sunny', ko: '맑은' }],
    sources: ['own'],
  },
  {
    id: 'g-adv-05', courseId: 'advanced', order: 5,
    titleKo: 'should·have to', goalKo: '해야 하는 일과 하면 좋은 일을 말할 수 있어요',
    conceptId: 'should-have-to', prereqIds: ['g-easy-04'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'I have to do my homework.', ko: '나는 숙제를 해야 해.' },
      { en: 'You should brush your teeth.', ko: '너는 이를 닦는 게 좋아.' },
      { en: 'We have to read a book.', ko: '우리는 책을 읽어야 해.' },
      { en: "You shouldn't run in class.", ko: '교실에서 뛰면 안 돼.' },
    ],
    explainKo: [
      'have to는 "꼭 …해야 한다"는 뜻이에요. 해야 하는 일을 말해요. have to는 한 덩어리로 써요.',
      'should는 "…하는 게 좋다"는 뜻이에요. 조언할 때 써요. can처럼 뒤에 동작 말을 그대로 써요.',
      "하지 않는 게 좋을 때는 shouldn't(= should not)를 써요.",
    ],
    structure: [
      { s: 'I', v: 'have to', rest: 'do my homework.', ko: '나는 숙제를 해야 해 (꼭 해야 하는 일)' },
      { s: 'You', v: 'should', rest: 'brush your teeth.', ko: '너는 이를 닦는 게 좋아 (조언)' },
    ],
    compare: {
      aff: { en: 'You should read a book.', ko: '너는 책을 읽는 게 좋아.' },
      neg: { en: "You shouldn't read a book.", ko: '너는 책을 읽지 않는 게 좋아.' },
      q: { en: 'Should I read a book?', ko: '나 책을 읽는 게 좋을까?' },
    },
    errors: [
      { wrong: 'You should to brush your teeth.', right: 'You should brush your teeth.', whyKo: 'should 바로 뒤에는 to 없이 동작 말을 써요. can과 같아요.' },
      { wrong: 'I have do my homework.', right: 'I have to do my homework.', whyKo: '"해야 한다"는 have to예요. to까지 붙여서 써요.' },
    ],
    practice: {
      choice: [
        { promptKo: '"나는 숙제를 해야 해요." 알맞은 문장은?', options: ['I have to do my homework.', 'I have do my homework.', 'I should to do my homework.'], correct: 0, whyKo: '해야 하는 일은 have to + 동작이에요.' },
        { promptKo: '"너는 이를 닦는 게 좋아." 알맞은 문장은?', options: ['You should brush your teeth.', 'You should to brush your teeth.', 'You brush should your teeth.'], correct: 0, whyKo: 'should 바로 뒤에 동작 말이 와요.' },
        { promptKo: '"교실에서 뛰면 안 돼." 알맞은 문장은?', options: ["You shouldn't run in class.", "You shouldn't to run in class.", 'You no should run in class.'], correct: 0, whyKo: "하지 않는 게 좋을 때는 shouldn't + 동작이에요." },
      ],
      blank: [
        { promptKo: '꼭 해야 하는 일이에요. "나는 숙제를 해야 해요."', en: 'I ___ to do my homework.', options: ['have', 'should', 'can'], correct: 0, whyKo: 'have to가 한 덩어리예요. → I have to do my homework.' },
        { promptKo: '이를 닦으라고 조언해요.', en: 'You ___ brush your teeth.', options: ['should', 'to', 'are'], correct: 0, whyKo: '"…하는 게 좋다"는 should예요. → You should brush your teeth.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "나는 숙제를 해야 해"를 만들어요.', words: ['do', 'homework.', 'have', 'my', 'I', 'to'], answers: [['I', 'have', 'to', 'do', 'my', 'homework.']], whyKo: 'I have to + 동작 + 물건 순서예요.' },
        { promptKo: '단어를 놓아 "교실에서 뛰면 안 돼"를 만들어요.', words: ["shouldn't", 'You', 'in', 'run', 'class.'], answers: [['You', "shouldn't", 'run', 'in', 'class.']], whyKo: "You shouldn't + 동작 + 장소 순서예요." },
      ],
      build: [
        { promptKo: '오늘 꼭 해야 하는 일 하나를 have to로 말하거나 써 보세요.', exampleEn: 'I have to do my homework.', exampleKo: '나는 숙제를 해야 해.', acceptNoteKo: 'We have to read a book. / I have to sleep.도 맞아요. have to + 동작이면 돼요.' },
        { promptKo: '친구가 이를 안 닦았어요. should로 조언해 보세요.', exampleEn: 'You should brush your teeth.', exampleKo: '너는 이를 닦는 게 좋아.', acceptNoteKo: 'You should sleep. / You should read a book.처럼 should + 동작이면 모두 맞아요. shouldn\'t로 말려도 돼요.' },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 해야 하는 일 하나(have to)와 조언 하나(should)를 말해요.', exampleEn: 'I have to do my homework. You should sleep.', exampleKo: '나는 숙제를 해야 해. 너는 자는 게 좋아.' },
    words: [{ en: 'should', ko: '…하는 게 좋다' }, { en: "shouldn't", ko: '…하지 않는 게 좋다' }, { en: 'have', ko: '가지고 있다' }, { en: 'homework', ko: '숙제' }, { en: 'brush', ko: '닦다' }, { en: 'teeth', ko: '이, 치아' }, { en: 'class', ko: '교실, 수업' }, { en: 'sleep', ko: '자다' }, { en: 'run', ko: '달리다' }, { en: 'read', ko: '읽다' }, { en: 'book', ko: '책' }],
    sources: ['own'],
  },
  {
    id: 'g-adv-06', courseId: 'advanced', order: 6,
    titleKo: '해 본 적 있어요', goalKo: '해 본 경험을 말할 수 있어요',
    conceptId: 'present-perfect-experience', prereqIds: ['g-int-07'], status: 'ready', reviewStatus: 'unreviewed',
    examples: [
      { en: 'Have you ever been to the zoo?', ko: '너는 동물원에 가 본 적 있어?' },
      { en: 'Yes, I have. I have visited the zoo.', ko: '응, 있어. 동물원에 가 봤어.' },
      { en: 'I have played with a dog.', ko: '나는 개와 놀아 본 적 있어.' },
      { en: 'Have you ever played ball?', ko: '너는 공놀이를 해 본 적 있어?' },
    ],
    explainKo: [
      'Have you ever …?는 "…해 본 적 있어?" 하고 경험을 묻는 말이에요.',
      '"해 본 적 있다"는 I have + 동작의 -ed 모양이에요. play는 played, visit는 visited로 바꿔요.',
      '대답은 Yes, I have. / No, I have not.으로 짧게 해요. "가 본 적"은 I have been to …예요.',
    ],
    structure: [
      { s: 'I', v: 'have played', rest: 'with a dog.', ko: '나는 개와 놀아 본 적 있어 (have + played)' },
      { s: 'Have you ever', v: 'been', rest: 'to the zoo?', ko: '너는 동물원에 가 본 적 있어? (질문이라 Have가 맨 앞에 와요)' },
    ],
    compare: {
      aff: { en: 'I have been to the zoo.', ko: '나는 동물원에 가 본 적 있어.' },
      neg: { en: 'I have not been to the zoo.', ko: '나는 동물원에 가 본 적 없어.' },
      q: { en: 'Have you ever been to the zoo?', ko: '너는 동물원에 가 본 적 있어?' },
    },
    errors: [
      { wrong: 'I have play with a dog.', right: 'I have played with a dog.', whyKo: 'have 뒤에는 동작 말에 -ed를 붙인 모양(played)을 써요.' },
      { wrong: 'Do you ever been to the zoo?', right: 'Have you ever been to the zoo?', whyKo: '경험을 물을 때는 Do가 아니라 Have you ever로 시작해요.' },
    ],
    practice: {
      choice: [
        { promptKo: '동물원에 가 본 적 있는지 물어요. 알맞은 문장은?', options: ['Have you ever been to the zoo?', 'Do you ever been to the zoo?', 'Have you ever be to the zoo?'], correct: 0, whyKo: 'Have you ever + been to + 장소 순서예요.' },
        { promptKo: '"나는 개와 놀아 본 적 있어요." 알맞은 문장은?', options: ['I have played with a dog.', 'I have play with a dog.', 'I played have with a dog.'], correct: 0, whyKo: 'I have + played 순서예요.' },
        { promptKo: '"Have you ever played ball?" 해 본 적이 없어요. 알맞은 짧은 대답은?', options: ['No, I have not.', 'No, I do not.', 'No, I am not.'], correct: 0, whyKo: 'Have로 물었으니 No, I have not.으로 대답해요.' },
      ],
      blank: [
        { promptKo: '"나는 동물원에 가 본 적 있어요."', en: 'I have ___ to the zoo.', options: ['been', 'be', 'was'], correct: 0, whyKo: '"가 본 적"은 have been to예요. → I have been to the zoo.' },
        { promptKo: '"나는 개와 놀아 본 적 있어요."', en: 'I have ___ with a dog.', options: ['played', 'play', 'playing'], correct: 0, whyKo: 'have 뒤에는 -ed 모양이에요. → I have played with a dog.' },
      ],
      order: [
        { promptKo: '단어를 놓아 "너는 동물원에 가 본 적 있어?"를 만들어요.', words: ['you', 'zoo?', 'Have', 'to', 'been', 'the', 'ever'], answers: [['Have', 'you', 'ever', 'been', 'to', 'the', 'zoo?']], whyKo: 'Have you ever + been to + 장소 순서예요.' },
        { promptKo: '단어를 놓아 "나는 동물원에 가 봤어"를 만들어요.', words: ['the', 'visited', 'I', 'zoo.', 'have'], answers: [['I', 'have', 'visited', 'the', 'zoo.']], whyKo: 'I have + visited + 장소 순서예요.' },
      ],
      build: [
        { promptKo: '짝이 공놀이를 해 본 적 있는지 Have you ever로 물어 보세요.', exampleEn: 'Have you ever played ball?', exampleKo: '너는 공놀이를 해 본 적 있어?', acceptNoteKo: 'Have you ever been to the zoo? / Have you ever visited the zoo?도 맞아요. Have you ever로 시작하고 been이나 -ed 모양을 쓰면 돼요.' },
        { promptKo: '개와 놀아 본 적이 있어요. I have로 말하거나 써 보세요.', exampleEn: 'I have played with a dog.', exampleKo: '나는 개와 놀아 본 적 있어.', acceptNoteKo: "I have played ball. / I've played with a dog.도 맞아요. I have + -ed 모양이면 돼요." },
      ],
    },
    use: { kind: 'speaking', promptKo: '짝에게 "Have you ever …?" 질문을 두 번 해요. 짝은 Yes, I have. / No, I have not.으로 답해요.', exampleEn: 'Have you ever played ball?', exampleKo: '너는 공놀이를 해 본 적 있어?' },
    words: [{ en: 'ever', ko: '(지금까지) 한 번이라도' }, { en: 'have', ko: '가지고 있다' }, { en: 'been', ko: '(…에) 가 본' }, { en: 'visited', ko: '방문했다' }, { en: 'played', ko: '놀았다, 했다' }, { en: 'zoo', ko: '동물원' }, { en: 'dog', ko: '개' }, { en: 'ball', ko: '공' }],
    sources: ['own'],
  },
]

const OUTLINE_UNITS = [
  // Easy 8개는 모두 READY_UNITS
  // Intermediate (ready g-int-01 + 아래 7 = 8)
  // Advanced (6)
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
