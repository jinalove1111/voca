// 2026-10-10 문법 과정 5개(운영자 지시): 숙련도 3(Easy·Intermediate·Advanced) + 학교 문법 2(Middle School·High School).
// 학교 문법은 학년·교육과정 대응이 확인 전이라 '제안'으로만 표기한다(학년 ≠ 숙련도). 순수 데이터 — 저장·네트워크 없음.
export const GRAMMAR_COURSES = [
  { id: 'easy', titleEn: 'Easy', titleKo: '쉬움', kind: 'proficiency', descKo: '친숙한 단어·짧은 문장으로 문법의 모양 익히기' },
  { id: 'intermediate', titleEn: 'Intermediate', titleKo: '중급', kind: 'proficiency', descKo: '질문·대답·되묻기, 시제와 연결어' },
  { id: 'advanced', titleEn: 'Advanced', titleKo: '고급', kind: 'proficiency', descKo: '이유·조건·비교를 이어 말하기' },
  { id: 'middleSchool', titleEn: 'Middle School', titleKo: '중등 문법', kind: 'school', descKo: '학교 문법 — 학년·교육과정 대응은 확인 전' },
  { id: 'highSchool', titleEn: 'High School', titleKo: '고등 문법', kind: 'school', descKo: '학교 문법 — 학년·교육과정 대응은 확인 전' },
]
