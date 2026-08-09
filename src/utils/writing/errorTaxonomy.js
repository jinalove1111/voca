// src/utils/writing/errorTaxonomy.js — Writing Coach 오류 유형 taxonomy (순수 모듈).
//
// import 0개(curriculumModel.js/readingModel.js 관례와 동일) — React/Supabase/
// 네트워크 무의존. scripts/testWritingCoach.mjs가 플레인 Node로 직접 import한다.
//
// 설계 근거(docs/WRITING_COACH.md §4 참고):
//   · 오류 "유형"을 안정적 code(snake_case slug)로 고정하는 이유는
//     grammar_points.code(supabase_v3_13)와 같다 — 한국어 label(표시 문구)은
//     언제든 바뀔 수 있지만 code는 DB 기록(writing_submissions.errors jsonb,
//     설계 SQL 참고)과 통계 집계의 안정적 참조 대상으로 남는다.
//   · hintTemplate은 "정답을 알려주지 않는 짧은 힌트"만 만든다 — 운영자
//     제품 원칙: 오류 위치+힌트만 주고 학생이 직접 고치게 한다(정답 대필
//     절대 금지, 3회 시도 후에만 정답 공개). 그래서 어떤 템플릿도 교정된
//     단어("went"/"the" 같은 답)를 문구에 넣지 않고, "어디를 다시 볼지"만
//     가리킨다.
//   · 이번 MVP의 로컬 규칙 검사기(ruleChecks.js)는 이 중 일부 유형만
//     발화하지만, taxonomy는 향후 AI 검사 단계(2·3단계)가 같은 코드 체계로
//     분류 결과를 반환할 수 있도록 전체 14종을 미리 고정해 둔다 — 기록
//     스키마가 단계 전환에도 안 바뀌게 하기 위함.

// 각 항목: { code, label(한국어 표시명), hintTemplate(ctx) → 학생용 짧은 힌트 }
// hintTemplate의 ctx는 규칙 검사기가 채워 넣는 선택 정보다(없어도 안전한
// 일반 문구로 폴백) — 템플릿이 ctx 부재로 깨지지 않아야 검사기와 taxonomy를
// 독립적으로 진화시킬 수 있다.
export const ERROR_TYPES = [
  {
    code: 'tense',
    label: '시제',
    // 예: "yesterday가 있으니 시제를 확인해보세요." — 시간 표현(단서)을
    // 짚어주되 올바른 동사형은 절대 말하지 않는다.
    hintTemplate: ({ timeWord } = {}) =>
      timeWord ? `${timeWord}가 있으니 시제를 확인해보세요.` : '시제를 확인해보세요.',
  },
  {
    code: 'article',
    label: '관사',
    // 예: "park 앞에 필요한 말이 있을까요?" — "the를 넣으세요"라고 하지 않는다.
    hintTemplate: ({ noun } = {}) =>
      noun ? `${noun} 앞에 필요한 말이 있을까요?` : '명사 앞에 필요한 말이 있는지 확인해보세요.',
  },
  {
    code: 'subject_verb_agreement',
    label: '주어-동사 일치',
    hintTemplate: ({ subject } = {}) =>
      subject
        ? `주어가 ${subject}일 때 동사 모양을 확인해보세요.`
        : '주어와 동사가 어울리는지 확인해보세요.',
  },
  {
    code: 'singular_plural',
    label: '단수/복수',
    hintTemplate: () => '하나인지 여러 개인지 확인해보세요.',
  },
  {
    code: 'preposition',
    label: '전치사',
    hintTemplate: ({ word } = {}) =>
      word ? `${word} 자리에 어울리는 전치사인지 확인해보세요.` : '전치사를 확인해보세요.',
  },
  {
    code: 'word_order',
    label: '어순',
    hintTemplate: () => '단어 순서를 다시 확인해보세요.',
  },
  {
    code: 'spelling',
    label: '철자',
    hintTemplate: ({ word } = {}) =>
      word ? `${word}의 철자를 확인해보세요.` : '철자를 확인해보세요.',
  },
  {
    code: 'punctuation',
    label: '문장 부호',
    // where: 'start'(첫 글자 대문자) | 'end'(끝 문장부호) — 둘 다 punctuation
    // 유형으로 묶는다(운영자 지시의 MVP 규칙 분류 그대로). 통계에서 더 쪼갤
    // 필요가 생기면 그때 code를 늘린다(append-only — 기존 코드 의미 불변).
    hintTemplate: ({ where } = {}) => {
      if (where === 'start') return '문장의 첫 글자를 확인해보세요.'
      if (where === 'end') return '문장이 잘 끝났는지 확인해보세요.'
      return '문장 부호를 확인해보세요.'
    },
  },
  {
    code: 'verb_form',
    label: '동사 형태',
    hintTemplate: () => '동사의 모양을 확인해보세요.',
  },
  {
    code: 'pronoun',
    label: '대명사',
    hintTemplate: () => '대명사가 맞는지 확인해보세요.',
  },
  {
    code: 'comparison',
    label: '비교 표현',
    hintTemplate: () => '비교하는 표현을 확인해보세요.',
  },
  {
    code: 'infinitive_gerund',
    label: 'to부정사/동명사',
    hintTemplate: () => 'to를 쓸지 -ing를 쓸지 확인해보세요.',
  },
  {
    code: 'vocabulary_choice',
    label: '어휘 선택',
    // targetWords 미사용 안내에도 이 유형을 쓴다(ruleChecks.js의
    // usedTargetWords 참고) — 단어 자체는 학생 화면에 칩으로 이미 보이므로
    // 단어 이름을 말하는 것은 "정답 대필"이 아니다.
    hintTemplate: ({ word } = {}) =>
      word ? `오늘 배운 단어 ${word}를 문장에 넣어보세요.` : '단어 선택을 확인해보세요.',
  },
  {
    code: 'unnatural_expression',
    label: '자연스러운 표현',
    hintTemplate: () => '더 자연스러운 표현이 있는지 생각해보세요.',
  },
]

// code → 항목 조회. 못 찾으면 null(throw 아님 — getUnit()과 같은 관례:
// 호출부가 폴백을 선택할 수 있게 한다).
export function errorTypeByCode(code) {
  return ERROR_TYPES.find((t) => t.code === code) || null
}
