// 2026-10-10 문법 단원 데이터 + 순수 도우미(저장·네트워크 없음). 스키마는 validateGrammarUnit 참고.
// status 'ready' 3개(g-easy-01·02, g-int-01 — 기존 시범 Unit의 문형 문항을 fromUnitId로 재사용) + 'preparing' 개요 32개(제목·학습 목표만, 화면에서 '준비 중').
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
    conceptId: 'request-can-i', prereqIds: [], status: 'ready',
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
    conceptId: 'where-is-location', prereqIds: [], status: 'ready',
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
    id: 'g-int-01', courseId: 'intermediate', order: 1,
    titleKo: 'Is it …? 대답·되묻기',
    goalKo: '있는지 확인하고 짧게 답한 뒤 되물을 수 있어요',
    conceptId: 'yes-no-question-short-answer', prereqIds: ['g-easy-02'], status: 'ready',
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
  // Easy (ready g-easy-01, 02 + 아래 6 = 8)
  P('g-easy-03', 'easy', 3, '나는 …이야 am·is·are', '나와 친구가 누구인지 말할 수 있어요', 'be-am-is-are', []),
  P('g-easy-04', 'easy', 4, '할 수 있어요 can', '내가 할 수 있는 것과 없는 것을 말할 수 있어요', 'can-ability', ['g-easy-01']),
  P('g-easy-05', 'easy', 5, '…이 있어요 There is', '방에 무엇이 있는지 말할 수 있어요', 'there-is-are', ['g-easy-02']),
  P('g-easy-06', 'easy', 6, '좋아해요 I like', '내가 좋아하는 것을 말할 수 있어요', 'present-simple-like', ['g-easy-03']),
  P('g-easy-07', 'easy', 7, '…해요? Do you …?', '친구에게 Yes/No로 답하는 질문을 할 수 있어요', 'present-simple-question', ['g-easy-06']),
  P('g-easy-08', 'easy', 8, '이것·저것 This is', '가까운 것과 먼 것을 가리켜 말할 수 있어요', 'this-that', ['g-easy-03']),
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
export const courseCounts = (courseId) => { const us = unitsForCourse(courseId); return { ready: us.filter((u) => u.status === 'ready').length, total: us.length } }

// 선택 연습 = 단원 자체 문항 + (fromUnitId가 있으면) 기존 시범 Unit의 문형 문항. 시범 Unit은 런타임에 units(=pilotUnits)에서 찾는다.
export function resolveChoice(unit, pilotUnits) {
  const own = unit?.practice?.choice || []
  const pilot = unit?.fromUnitId ? (pilotUnits || []).find((p) => p.id === unit.fromUnitId) : null
  return [...own, ...(pilot?.grammar?.items || [])]
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
  }
  return errs
}
