// 2026-10-04 상황 보고 말하기 — 표현 5개 × 상황 2개(순수 데이터, DOM/이미지 import 없음).
// 장면의 에셋은 키 문자열로만 가리킨다(TOWN_ASSETS 키 / src/assets/paul/index.js export명).
// 임시 그림은 형식·흐름 검증용이다(docs/design/SITUATION_RECALL_DESIGN_2026-10-04.md §3).

// alternatives: 교사용 허용 표현(설계 §6) — 학생 화면에는 표시하지 않는다.
export const SITUATION_EXPRESSIONS = [
  { id: 'hello', en: 'Hello! Nice to meet you.', ko: '안녕! 만나서 반가워.', alternatives: ['Hi!', "Hello, I'm Paul.", 'Hi there!'] },
  { id: 'help', en: 'Can you help me, please?', ko: '나 좀 도와줄래?', alternatives: ['Can you help me?', 'Could you help me, please?', 'Excuse me, can you help?'] },
  { id: 'sorry', en: "I'm sorry.", ko: '미안해.', alternatives: ['Sorry.', "I'm so sorry.", 'Oops, sorry.'] },
  { id: 'thanks', en: 'Thank you so much!', ko: '정말 고마워!', alternatives: ['Thank you!', 'Thanks a lot!', 'Thanks!'] },
  { id: 'play', en: "Let's play together!", ko: '우리 같이 놀자!', alternatives: ["Let's play!", 'Can I play too?', 'Do you want to play?'] },
]

// examAlt: 시험용 — 장면/사람/보이는 사건만(말하기 행위 단어 금지).
// alt는 한국어 상황 묘사만 — 표현 문구(EN)를 노출하지 않는다(§8).
export const SITUATION_SCENES = [
  { id: 'hello-a', exprId: 'hello', backdrop: 'special/english-school', paulSticker: 'paulHello', partner: 'animals/puppy', cue: '👋', alt: '학교 앞에서 폴이 처음 만난 친구에게 손을 흔들며 인사해요', examAlt: '학교 건물 앞. 폴이 가방을 멘 강아지 쪽으로 손을 들고 있어요' },
  { id: 'hello-b', exprId: 'hello', backdrop: 'special/bridge', paulSticker: 'paulHello', partner: 'animals/cat', cue: '👋', alt: '다리 위에서 폴이 처음 보는 친구를 만나 인사해요', examAlt: '다리 위. 폴과 고양이가 마주 서 있어요' },
  { id: 'help-a', exprId: 'help', backdrop: 'buildings/book-shop', paulSticker: 'paulPonder', partner: 'animals/owl', cue: '❓📚', alt: '서점에서 폴이 책을 찾지 못해 곤란해하고 부엉이가 옆에 있어요', examAlt: '서점 안. 폴이 높은 책장을 올려다보고 있고 부엉이가 옆에 있어요' },
  { id: 'help-b', exprId: 'help', backdrop: 'decorations/town-sign', paulSticker: 'paulThinking', partner: 'animals/cat', cue: '❓', alt: '표지판 앞에서 폴이 길을 몰라 곤란해하고 고양이가 지나가요', examAlt: '표지판 앞. 폴이 지도를 들고 있고 고양이가 지나가요' },
  { id: 'sorry-a', exprId: 'sorry', backdrop: 'nature/flower-garden', paulSticker: 'paulSorry', partner: 'animals/cat', cue: '🪴', alt: '화단 화분을 쓰러뜨린 폴이 고양이에게 미안해해요', examAlt: '화단 앞. 화분이 쓰러져 흙이 쏟아졌고 고양이가 그 자리에 있어요' },
  { id: 'sorry-b', exprId: 'sorry', backdrop: 'buildings/cafe', paulSticker: 'paulSorry', partner: 'animals/puppy', cue: '☕💧', alt: '카페에서 컵을 엎지른 폴이 강아지에게 미안해해요', examAlt: '카페 안. 폴 옆 탁자에서 컵이 넘어져 물이 쏟아졌고 강아지가 그 자리에 있어요' },
  { id: 'thanks-a', exprId: 'thanks', backdrop: 'buildings/my-house', paulSticker: 'paulLove', partner: 'animals/owl', cue: '🎁', alt: '부엉이가 폴에게 선물을 건네자 폴이 활짝 웃어요', examAlt: '폴의 집 앞. 부엉이가 포장된 상자를 폴에게 내밀고 있어요' },
  { id: 'thanks-b', exprId: 'thanks', backdrop: 'buildings/cafe', paulSticker: 'paulHappy', partner: 'animals/cat', cue: '🍪', alt: '카페에서 고양이가 폴 앞에 쿠키를 놓아줘요', examAlt: '카페 안. 고양이가 폴 앞에 쿠키 접시를 놓았어요' },
  { id: 'play-a', exprId: 'play', backdrop: 'nature/tree', paulSticker: 'paulHappy', partner: 'animals/puppy', cue: '⚽', alt: '공을 가진 강아지에게 폴이 같이 놀자고 다가가요', examAlt: '큰 나무 아래. 강아지가 공을 가지고 있고 폴이 그쪽으로 다가가요' },
  { id: 'play-b', exprId: 'play', backdrop: 'decorations/stone-fountain', paulSticker: 'paulLetsLearn', partner: 'animals/cat', cue: '⚽', alt: '분수 옆에서 폴이 고양이에게 같이 놀자고 손짓해요', examAlt: '분수 옆. 폴이 고양이 쪽으로 손을 들고 있고 발밑에 공이 있어요' },
]

export const sceneFor = (exprId, which) => SITUATION_SCENES.find((s) => s.id === `${exprId}-${which}`)
