// 교과서 예문 프로토타입 — 샘플 커리큘럼 데이터.
//
// 여기 담긴 학년/교과서 이름/단원/예문은 전부 이 프로토타입을 위해 직접
// 새로 쓴 오리지널 콘텐츠다. 실제 특정 출판사 교과서의 본문을 옮겨 쓰지
// 않았다 — `textbook` 값도 "3학년 영어 A"처럼 일반적인 이름만 쓴다.
//
// 순수 데이터 모듈: React/네트워크/DB 의존성 전혀 없음. 관리자 전용
// DebugPage 프로토타입(src/components/prototype/TextbookExamplePrototype.jsx)
// 에서만 쓰인다 — 학생 화면 어디에도 연결되지 않는다.
//
// 각 vocab의 모든 example.en 문장은 반드시 그 word를 (대소문자 무관)
// 포함해야 한다 — makeFillBlank()가 그 단어를 빈칸으로 바꿀 수 있어야
// 하기 때문. scripts/testTextbookExample.mjs가 이 불변조건을 검증한다.

export const TEXTBOOK_CURRICULUM = [
  {
    grade: '초등 3학년',
    textbook: '3학년 영어 A',
    units: [
      {
        id: 'g3a-u1',
        unitNo: 1,
        topic: 'Hello, Friends',
        grammarPoint: 'be동사 현재형 (I am / You are / It is)',
        vocab: [
          {
            word: 'friend',
            meaning: '친구',
            pos: 'noun',
            examples: [
              { en: 'You are my good friend.', ko: '너는 나의 좋은 친구야.' },
              { en: 'My friend is very kind.', ko: '내 친구는 아주 친절해.' },
            ],
          },
          {
            word: 'happy',
            meaning: '행복한',
            pos: 'adjective',
            examples: [
              { en: 'I am happy today.', ko: '나는 오늘 행복해.' },
              { en: 'She is happy at school.', ko: '그녀는 학교에서 행복해.' },
            ],
          },
          {
            word: 'name',
            meaning: '이름',
            pos: 'noun',
            examples: [
              { en: 'My name is Sujin.', ko: '내 이름은 수진이야.' },
              { en: 'What is your name?', ko: '네 이름이 뭐야?' },
            ],
          },
          {
            word: 'nice',
            meaning: '멋진, 친절한',
            pos: 'adjective',
            examples: [
              { en: 'It is a nice day.', ko: '오늘은 멋진 날이야.' },
              { en: 'You are so nice to me.', ko: '너는 나에게 아주 친절해.' },
            ],
          },
          {
            word: 'class',
            meaning: '반, 학급',
            pos: 'noun',
            examples: [
              { en: 'We are in the same class.', ko: '우리는 같은 반이야.' },
              { en: 'This class is fun.', ko: '이 수업은 재미있어.' },
            ],
          },
        ],
      },
      {
        id: 'g3a-u2',
        unitNo: 2,
        topic: 'My Family',
        grammarPoint: '소유격 (my / your / his / her)',
        vocab: [
          {
            word: 'family',
            meaning: '가족',
            pos: 'noun',
            examples: [
              { en: 'This is my family.', ko: '이건 내 가족이야.' },
              { en: 'My family is small.', ko: '내 가족은 단출해.' },
            ],
          },
          {
            word: 'sister',
            meaning: '언니, 누나, 여동생',
            pos: 'noun',
            examples: [
              { en: 'My sister is tall.', ko: '내 언니는 키가 커.' },
              { en: 'Her sister likes music.', ko: '그녀의 여동생은 음악을 좋아해.' },
            ],
          },
          {
            word: 'brother',
            meaning: '형, 오빠, 남동생',
            pos: 'noun',
            examples: [
              { en: 'My brother is a student.', ko: '내 형은 학생이야.' },
              { en: 'His brother plays soccer.', ko: '그의 남동생은 축구를 해.' },
            ],
          },
          {
            word: 'mother',
            meaning: '어머니',
            pos: 'noun',
            examples: [
              { en: 'My mother is a teacher.', ko: '내 어머니는 선생님이야.' },
              { en: 'Her mother cooks well.', ko: '그녀의 어머니는 요리를 잘하셔.' },
            ],
          },
          {
            word: 'father',
            meaning: '아버지',
            pos: 'noun',
            examples: [
              { en: 'My father is tall.', ko: '내 아버지는 키가 크셔.' },
              { en: 'His father likes soccer.', ko: '그의 아버지는 축구를 좋아하셔.' },
            ],
          },
        ],
      },
    ],
  },
  {
    grade: '초등 4학년',
    textbook: '4학년 영어 A',
    units: [
      {
        id: 'g4a-u1',
        unitNo: 1,
        topic: 'What Time Is It?',
        grammarPoint: '시간 표현 (What time is it? / It is ~ o\'clock.)',
        vocab: [
          {
            word: 'time',
            meaning: '시간',
            pos: 'noun',
            examples: [
              { en: 'What time is it now?', ko: '지금 몇 시야?' },
              { en: 'It is time for lunch.', ko: '점심 먹을 시간이야.' },
            ],
          },
          {
            word: 'morning',
            meaning: '아침',
            pos: 'noun',
            examples: [
              { en: 'I read books in the morning.', ko: '나는 아침에 책을 읽어.' },
              { en: 'Good morning, everyone.', ko: '모두 좋은 아침이야.' },
            ],
          },
          {
            word: 'school',
            meaning: '학교',
            pos: 'noun',
            examples: [
              { en: 'I go to school at eight.', ko: '나는 여덟 시에 학교에 가.' },
              { en: 'Our school is very big.', ko: '우리 학교는 아주 커.' },
            ],
          },
          {
            word: 'late',
            meaning: '늦은',
            pos: 'adjective',
            examples: [
              { en: 'I am late for school.', ko: '나는 학교에 늦었어.' },
              { en: 'Do not be late again.', ko: '다시는 늦지 마.' },
            ],
          },
          {
            word: 'clock',
            meaning: '시계',
            pos: 'noun',
            examples: [
              { en: 'The clock is on the wall.', ko: '시계는 벽에 걸려 있어.' },
              { en: 'Look at the clock, please.', ko: '시계를 봐 줘.' },
            ],
          },
        ],
      },
      {
        id: 'g4a-u2',
        unitNo: 2,
        topic: 'I Like Pizza',
        grammarPoint: '좋아하는 것 표현 (I like ~ / Do you like ~?)',
        vocab: [
          {
            word: 'pizza',
            meaning: '피자',
            pos: 'noun',
            examples: [
              { en: 'I like pizza very much.', ko: '나는 피자를 아주 좋아해.' },
              { en: 'Do you like pizza too?', ko: '너도 피자를 좋아하니?' },
            ],
          },
          {
            word: 'apple',
            meaning: '사과',
            pos: 'noun',
            examples: [
              { en: 'I like apple juice.', ko: '나는 사과 주스를 좋아해.' },
              { en: 'This apple is sweet.', ko: '이 사과는 달아.' },
            ],
          },
          {
            word: 'milk',
            meaning: '우유',
            pos: 'noun',
            examples: [
              { en: 'I drink milk every morning.', ko: '나는 매일 아침 우유를 마셔.' },
              { en: 'Do you like milk?', ko: '너는 우유를 좋아하니?' },
            ],
          },
          {
            word: 'favorite',
            meaning: '가장 좋아하는',
            pos: 'adjective',
            examples: [
              { en: 'Pizza is my favorite food.', ko: '피자는 내가 가장 좋아하는 음식이야.' },
              { en: 'What is your favorite color?', ko: '네가 가장 좋아하는 색깔은 뭐야?' },
            ],
          },
          {
            word: 'hungry',
            meaning: '배고픈',
            pos: 'adjective',
            examples: [
              { en: 'I am hungry now.', ko: '나는 지금 배고파.' },
              { en: 'Are you hungry too?', ko: '너도 배고프니?' },
            ],
          },
        ],
      },
    ],
  },
]
