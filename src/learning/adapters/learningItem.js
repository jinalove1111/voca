// src/learning/adapters/learningItem.js — Learning Engine 콘텐츠 어댑터
// (docs/CURRICULUM_ENGINE.md §13.2 "① LearningItem — 순수 어댑터").
//
// 순수 함수만 export한다(React/Supabase/네트워크 무의존, curriculumModel.js와
// 같은 순수성 관례). 모드(registry.js)는 이 정규형만 알고, 원본 테이블
// (examples/words/...)이 무엇인지 전혀 모른다 — "모드는 테이블을 모른다"
// (설계 §13.2).
//
// LearningItem 정규형(모든 어댑터 공통 반환 shape):
//   {
//     id,                 // 원본 행의 id(그대로) — seed/키로도 재사용
//     contentType,        // 'example' | 'word' — 어댑터별 상수
//     text,               // 학습 대상 원문(문장 또는 단어)
//     translation,        // 한국어 번역/뜻, 없으면 null
//     targetWord,         // 빈칸/발음 대상 단어
//     audioText,          // TTS 재생 대상 문자열(Phase 0은 text와 동일 —
//                         // 향후 "문장 전체가 아니라 타겟 단어만 강조 재생"
//                         // 같은 분화가 필요해지면 이 필드만 바꾸면 되고
//                         // 계약(다른 필드/모드 쪽)은 그대로 유지된다)
//     distractorPool,     // 객관식용 오답 후보(Phase 0: 항상 빈 배열 —
//                         // multiple_choice 모드는 §11 후속 Phase 범위)
//   }

// fromExample(exampleRow) — exampleRow는 exampleLibrary.js의 toRow() 출력
// (camelCase: id/targetWord/englishSentence/koreanTranslation/...)을 그대로
// 받는다. 학생 노출 = approval_status==='approved' 필터링은 이 함수의 책임이
// 아니다 — 그 하드코딩은 fetchApprovedExamplesForWords(exampleLibrary.js)에
// 이미 있고, 이 어댑터는 "이미 승인된 걸로 걸러진 행"을 정규화만 한다.
export function fromExample(exampleRow) {
  const r = exampleRow || {}
  // 학생 기본 학습은 짧은 연습 예문(practiceSentence, v3_32) 우선 —
  // 없으면 본문 원문(englishSentence) 폴백(2026-08-09 운영자 지시).
  // 원문은 sourceText로 항상 함께 실어 "본문 보기" UI가 표시할 수 있게
  // 한다(원문 무수정 — 표시 분리일 뿐).
  const practice = r.practiceSentence || null
  const text = practice || r.englishSentence || ''
  return {
    id: r.id,
    contentType: 'example',
    text,
    translation: r.koreanTranslation || null,
    targetWord: r.targetWord || '',
    audioText: text,
    sourceText: r.englishSentence || '',
    hasPractice: !!practice,
    distractorPool: [],
  }
}

// fromWord(wordRow) — wordRow는 wordLibrary.js가 이미 쓰는 camelCase 형태
// (word/meaning/exampleText/exampleTranslation/wordAudioUrl/...)를 받는다.
// text = exampleText가 있으면 그 예문, 없으면 단어 자체(설계 지시 그대로) —
// "예문 없는 단어도 learn/listen 모드는 최소 동작"을 보장하기 위함.
export function fromWord(wordRow) {
  const r = wordRow || {}
  const text = r.exampleText || r.word || ''
  return {
    id: r.id,
    contentType: 'word',
    text,
    translation: r.exampleTranslation || r.meaning || null,
    targetWord: r.word || '',
    audioText: text,
    distractorPool: [],
  }
}
