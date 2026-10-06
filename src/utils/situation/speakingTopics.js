import { STORY_EPISODES, STORY_ITEMS } from './storyEpisodes.js'

// 2026-10-07(219차) Speaking 주제별 탐색 — 순수 모듈(DOM 없음). 기존 이야기(STORY_EPISODES)·문항(STORY_ITEMS)을
// 복사하지 않고 id로만 가리킨다: 주제 → 회차 id 목록, 회차 → 카드 문구 + 핵심 표현 문항 id.
// 한 회차가 여러 주제에 들어가도 같은 회차·같은 문항·같은 학습 기록(키 = 문항 id)을 쓴다.
// 분류는 실제 문항 내용(func·상황) 기준이며, 억지로 채우지 않는다 — 콘텐츠가 없는 주제는 listTopics()가 내지 않는다.
// 매핑 근거·미분류 목록: docs/design/SPEAKING_UX_V2_2026-10-04.md §20.
export const SPEAKING_TOPICS = [
  { id: 'school', emoji: '🏫', titleKo: '학교생활', descKo: '자기소개, 자리, 빌리기, 단어 묻기', episodes: ['ep01', 'ep02'] },
  { id: 'friends', emoji: '🎉', titleKo: '친구와 놀기', descKo: '취향, 제안, 맞장구, 칭찬, 응원', episodes: ['ep03', 'ep04', 'ep10'] },
  { id: 'food', emoji: '🍪', titleKo: '음식과 간식', descKo: '주문 받기, 값 말하기, 간식 건네기', episodes: ['ep09'] },
  { id: 'shopping', emoji: '🛒', titleKo: '쇼핑', descKo: '가격, 선택, 정해진 돈, 개수, 계산', episodes: ['ep05'] },
  { id: 'finding', emoji: '🔎', titleKo: '물건·장소 찾기', descKo: '어디 있지?, 보았니?, 확인하기', episodes: ['ep06'] },
  { id: 'feelings', emoji: '💬', titleKo: '기분과 문제 해결', descKo: '떨림, 걱정, 사과, 격려', episodes: ['ep04', 'ep06', 'ep08', 'ep10'] },
]
// 미분류(의도): ep07(상상 속 초대장 쓰기 — 어느 주제에도 맞지 않아 '전체 이야기'에서만). 콘텐츠 리뷰 결과는 설계 문서 §20.

// 회차 카드: 짧은 제목(≤12자)·상황 한 줄(≤30자)·오늘 기억할 핵심 표현(기존 문항 id). 1~3화는 keySentence.itemId와 같아야 한다.
export const STORY_CARDS = {
  ep01: { titleKo: '작게 속삭이는 미아', lineKo: '전학 첫날, 앞자리 미아의 목소리가 너무 작아요.', keyItemId: 's01-08' },
  ep02: { titleKo: '필통에 숟가락이?!', lineKo: '미술 시간, 필통을 열었더니 연필이 하나도 없어요.', keyItemId: 's02-03' },
  ep03: { titleKo: '축제 팀 만들기', lineKo: '셋이 공연과 간식 가게를 정해요.', keyItemId: 's03-06' },
  ep04: { titleKo: '엉망진창 첫 연습', lineKo: '춤 연습에서 셋 다 방향이 뒤죽박죽이에요.', keyItemId: 's04-04' },
  ep05: { titleKo: '20파운드로 장보기', lineKo: '정해진 돈으로 리본과 간식 재료를 골라요.', keyItemId: 's05-03' },
  ep06: { titleKo: '쿠키가 가져간 리본', lineKo: '강아지 쿠키가 물고 간 리본을 찾아요.', keyItemId: 's06-03' },
  ep07: { titleKo: '가수에게 쓰는 초대장', lineKo: '상상 속 가수에게 날짜·시간·장소를 써요.', keyItemId: 's07-05' },
  ep08: { titleKo: '축제 전날의 문제', lineKo: '제이미 목이 아프고 내일 비가 와요.', keyItemId: 's08-04' },
  ep09: { titleKo: '간식 가게 열기', lineKo: '손님을 맞고 주문을 받아요.', keyItemId: 's09-02' },
  ep10: { titleKo: '음악이 멈춰도', lineKo: '공연 중에 갑자기 음악이 꺼져요.', keyItemId: 's10-04' },
}

const episodeById = (id) => STORY_EPISODES.find((e) => e.id === id)

// 카드에 보일 회차 정보. 문항이 없는 회차는 null(빈 카드 금지)
export function storyCard(epId) {
  const ep = episodeById(epId)
  const card = STORY_CARDS[epId]
  if (!ep || !card) return null
  const item = STORY_ITEMS.find((i) => i.id === card.keyItemId && i.episode === ep.n)
  if (!item) return null
  return { id: ep.id, n: ep.n, titleKo: card.titleKo, lineKo: card.lineKo, keyEn: item.en, keyKo: item.ko, keyItemId: item.id, hasKeyFlow: !!ep.keySentence }
}

// 실제 카드가 하나 이상인 주제만(콘텐츠 없는 주제는 노출하지 않음)
export function listTopics() {
  return SPEAKING_TOPICS.map((t) => ({ ...t, stories: t.episodes.map(storyCard).filter(Boolean) })).filter((t) => t.stories.length > 0)
}

export const topicById = (id) => listTopics().find((t) => t.id === id) || null

// 어느 주제에도 없는 회차(문서화·검사용)
export const unclassifiedEpisodes = () => STORY_EPISODES.filter((e) => !SPEAKING_TOPICS.some((t) => t.episodes.includes(e.id))).map((e) => e.id)
