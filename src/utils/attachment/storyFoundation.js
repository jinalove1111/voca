// 책장 + 이어지는 이야기 파운데이션(2026-07-22, 애착 시스템).
//
// v1은 파운데이션만: 데이터 모델 + 서비스 인터페이스 + 결정론 템플릿.
// UI는 attachmentBookshelf/attachmentStory 플래그(기본 OFF) 뒤 —
// 미완성 화면을 학생에게 노출하지 않는다.
//
// 유료 AI API 의존 없음(저장소 헌법 규칙 7): 이야기는 배운 단어를 안전한
// 고정 한국어 템플릿에 끼워 넣는 순수 함수다. 같은 단어 목록 + 같은
// 챕터 번호 → 항상 같은 이야기(무작위 없음). 이후 세대(예: 관리자 승인
// 하의 서버 생성)로 교체할 수 있도록 buildStoryChapter 시그니처를 서비스
// 인터페이스로 삼는다.
//
// 데이터 모델(파생 — 저장 없음):
//   책장(book)  = 완료한 유닛에서 파생 {unitId, unitName, words, coverEmoji}
//   이야기(chapter) = {chapterIndex, templateId, title, text, usedWordIds, insufficient}
// 이야기 "진행"(어디까지 읽었나)을 저장하게 되는 시점이 오면 진행도
// 블롭(record)에 lastStoryChapter 하나를 추가하는 것으로 충분하다 —
// 새 테이블이 필요 없는 구조를 의도적으로 선택(티켓/모자와 같은 판단).

export const STORY_TEMPLATES = [
  {
    id: 'walk',
    title: '폴과 함께 산책',
    // {w1} {w2} {w3}에 배운 단어가 들어간다 — 단어는 영어 원문 그대로
    // 노출해 "내가 아는 단어가 이야기에 나온다"는 애착 고리를 만든다.
    build: (w) => `폴이 모자를 쓰고 산책을 나갔어요. 길에서 "${w[0]}"를 만났대요! ` +
      `폴은 신이 나서 "${w[1] ?? w[0]}"라고 외쳤어요. ` +
      `오늘도 "${w[2] ?? w[0]}"처럼 멋진 하루였답니다.`,
  },
  {
    id: 'picnic',
    title: '폴의 소풍',
    build: (w) => `폴이 소풍 가방을 쌌어요. 가방 안에는 "${w[0]}"가 들어있어요. ` +
      `언덕 위에서 폴은 "${w[1] ?? w[0]}"를 발견하고 활짝 웃었어요. ` +
      `"${w[2] ?? w[0]}"도 함께라서 최고의 소풍이었어요.`,
  },
  {
    id: 'night',
    title: '폴의 밤하늘',
    build: (w) => `밤이 되자 폴은 창밖을 봤어요. 하늘에 "${w[0]}"가 반짝이는 것 같았죠. ` +
      `폴은 조용히 "${w[1] ?? w[0]}"를 떠올렸어요. ` +
      `내일은 "${w[2] ?? w[0]}"를 만나는 꿈을 꾸며 잠들었답니다.`,
  },
]

const MIN_WORDS_FOR_STORY = 3

/**
 * 서비스 인터페이스 — 결정론 이야기 챕터 생성.
 * @param learnedWords [{id, word, meaning}] — 학생이 실제로 배운 단어만 넣을 것
 * @param chapterIndex 0부터 — 템플릿을 순환하며 단어 창(window)을 이동
 */
export function buildStoryChapter(learnedWords, chapterIndex = 0) {
  const words = Array.isArray(learnedWords) ? learnedWords : []
  if (words.length < MIN_WORDS_FOR_STORY) {
    // 단어가 부족하면 이야기를 지어내지 않는다 — 정직한 안내(폴의 기억과 동일 원칙)
    return {
      chapterIndex, templateId: null, title: '아직 준비 중인 이야기',
      text: `단어를 ${MIN_WORDS_FOR_STORY}개 이상 배우면 폴의 이야기가 시작돼요!`,
      usedWordIds: [], insufficient: true,
    }
  }
  const tpl = STORY_TEMPLATES[chapterIndex % STORY_TEMPLATES.length]
  // 챕터마다 다른 단어 창 — 배운 순서대로 3개씩 미끄러진다(결정론)
  const start = (chapterIndex * MIN_WORDS_FOR_STORY) % words.length
  const picked = Array.from({ length: MIN_WORDS_FOR_STORY }, (_, i) => words[(start + i) % words.length])
  return {
    chapterIndex,
    templateId: tpl.id,
    title: `${chapterIndex + 1}화 — ${tpl.title}`,
    text: tpl.build(picked.map((w) => w.word)),
    usedWordIds: picked.map((w) => w.id),
    insufficient: false,
  }
}

const BOOK_COVERS = ['📕', '📗', '📘', '📙', '📔']

/**
 * 서비스 인터페이스 — 책장. 완료 유닛에서 파생(중복 저장 없음).
 * @param wordsByUnit [{unitId, unitName, words}] 학생 반의 유닛들
 * @param completed completedUnits() 결과
 */
export function getBookshelf(wordsByUnit, completed) {
  const completedIds = new Set((completed || []).map((u) => u.unitId))
  return (wordsByUnit || [])
    .filter((u) => completedIds.has(u.unitId))
    .map((u, i) => ({
      unitId: u.unitId,
      unitName: u.unitName,
      wordCount: (u.words || []).length,
      coverEmoji: BOOK_COVERS[i % BOOK_COVERS.length],
    }))
}
