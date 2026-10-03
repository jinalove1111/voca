// 2026-10-04 상황 보고 말하기 — 표현 5개 × 상황 2개(순수 데이터, DOM/이미지 import 없음).
// 장면의 에셋은 키 문자열로만 가리킨다(TOWN_ASSETS 키 / src/assets/paul/index.js export명).
// 임시 그림은 형식·흐름 검증용이다(docs/design/SITUATION_RECALL_DESIGN_2026-10-04.md §3).

export const SITUATION_EXPRESSIONS = [
  { id: 'hello', en: 'Hello! Nice to meet you.', ko: '안녕! 만나서 반가워.' },
  { id: 'help', en: 'Can you help me, please?', ko: '나 좀 도와줄래?' },
  { id: 'sorry', en: "I'm sorry.", ko: '미안해.' },
  { id: 'thanks', en: 'Thank you so much!', ko: '정말 고마워!' },
  { id: 'play', en: "Let's play together!", ko: '우리 같이 놀자!' },
]

// alt는 한국어 상황 묘사만 — 표현 문구(EN)를 노출하지 않는다(§8).
export const SITUATION_SCENES = [
  { id: 'hello-a', exprId: 'hello', backdrop: 'special/english-school', paulSticker: 'paulHello', partner: 'animals/puppy', cue: '👋', alt: '학교 앞에서 폴이 처음 만난 친구에게 손을 흔들며 인사해요' },
  { id: 'hello-b', exprId: 'hello', backdrop: 'special/bridge', paulSticker: 'paulHello', partner: 'animals/cat', cue: '👋', alt: '다리 위에서 폴이 처음 보는 친구를 만나 인사해요' },
  { id: 'help-a', exprId: 'help', backdrop: 'buildings/book-shop', paulSticker: 'paulPonder', partner: 'animals/owl', cue: '❓📚', alt: '서점에서 폴이 책을 찾지 못해 곤란해하고 부엉이가 옆에 있어요' },
  { id: 'help-b', exprId: 'help', backdrop: 'decorations/town-sign', paulSticker: 'paulThinking', partner: 'animals/cat', cue: '❓', alt: '표지판 앞에서 폴이 길을 몰라 곤란해하고 고양이가 지나가요' },
  { id: 'sorry-a', exprId: 'sorry', backdrop: 'nature/flower-garden', paulSticker: 'paulSorry', partner: 'animals/cat', cue: '🪴', alt: '화단 화분을 쓰러뜨린 폴이 고양이에게 미안해해요' },
  { id: 'sorry-b', exprId: 'sorry', backdrop: 'buildings/cafe', paulSticker: 'paulSorry', partner: 'animals/puppy', cue: '☕💧', alt: '카페에서 컵을 엎지른 폴이 강아지에게 미안해해요' },
  { id: 'thanks-a', exprId: 'thanks', backdrop: 'buildings/my-house', paulSticker: 'paulLove', partner: 'animals/owl', cue: '🎁', alt: '부엉이가 폴에게 선물을 건네자 폴이 활짝 웃어요' },
  { id: 'thanks-b', exprId: 'thanks', backdrop: 'buildings/cafe', paulSticker: 'paulHappy', partner: 'animals/cat', cue: '🍪', alt: '카페에서 고양이가 폴 앞에 쿠키를 놓아줘요' },
  { id: 'play-a', exprId: 'play', backdrop: 'nature/tree', paulSticker: 'paulHappy', partner: 'animals/puppy', cue: '⚽', alt: '공을 가진 강아지에게 폴이 같이 놀자고 다가가요' },
  { id: 'play-b', exprId: 'play', backdrop: 'decorations/stone-fountain', paulSticker: 'paulLetsLearn', partner: 'animals/cat', cue: '⚽', alt: '분수 옆에서 폴이 고양이에게 같이 놀자고 손짓해요' },
]

export const MAX_HINT = 3

export const sceneFor = (exprId, which) => SITUATION_SCENES.find((s) => s.id === `${exprId}-${which}`)

// 힌트 1: 첫 단어 + 나머지 단어 수만큼 밑줄(예: "Can ___ ___ ___"), 힌트 2: 영어 전체.
// 힌트 3(한국어 뜻)은 UI가 expr.ko로 보여 준다.
export function hintText(en, level) {
  if (level >= 2) return en
  if (level === 1) {
    const [first, ...rest] = en.split(/\s+/)
    return [first, ...rest.map(() => '___')].join(' ')
  }
  return ''
}
