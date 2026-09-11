// src/utils/town/townMessages.js — Paul Town V1 문구/폴 가이드(순수 도메인,
// 2026-09-11).
//
// import 0 — React/supabase 없음. 여기서 쓰는 reactionId는 전부
// src/utils/paulReactions.js의 PAUL_REACTIONS에 이미 존재하는 id다
// (hello/lets_learn/study/ponder/happy/great/levelup/almost/brand) —
// 존재하지 않는 캐릭터를 가리키지 않는다는 그 파일의 원칙을 그대로
// 따른다. 이 파일 자체는 paulReactions.js를 import하지 않는다(순수성 유지
// — 호출부가 reactionId를 받아 resolveReaction()/getReactionById()에
// 넘기는 배선은 이 파일 밖의 책임).

export const TOWN_PHRASES = {
  welcome: 'Welcome to Paul Town',
  learnEarn: 'Learn · Earn · Build · Dream',
  brighter: 'Every word makes your town brighter.',
  smallSteps: 'Small Steps, Big Dreams.',
  tomorrow: 'Learn Today, A Brighter Tomorrow.',
}

function fill(template, ctx) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (
    ctx && ctx[key] !== undefined && ctx[key] !== null ? String(ctx[key]) : match
  ))
}

const EVENT_TEMPLATES = {
  welcome: { reactionId: 'hello', text: 'Welcome to Paul Town! 오늘도 마을을 키워볼까요?' },
  shop: { reactionId: 'ponder', text: '무엇을 살까요? 별을 모으면 Paul Dollar가 생겨요' },
  purchase_success: { reactionId: 'great', text: 'Great job! {name}을(를) 샀어요!' },
  insufficient: { reactionId: 'almost', text: '조금만 더! {shortfall} Paul Dollar가 더 필요해요' },
  locked: { reactionId: 'study', text: 'Level {level}에서 열려요' },
  unlock: { reactionId: 'levelup', text: 'You unlocked something new! Level {level}!' },
  levelup: { reactionId: 'levelup', text: 'Small Steps, Big Dreams. Level {level}!' },
  tutorial: { reactionId: 'lets_learn', text: "Let's build your town! 상점에서 사고, 마을에 놓아봐요" },
  first_place: { reactionId: 'happy', text: 'Every word makes your town brighter.' },
  // PHASE 4(2026-09-11) — 잔액 0/보유 0일 때 첫 진입 가이드(empty state).
  earn_hint: { reactionId: 'study', text: 'Study today, grow your town! 오늘 공부하면 마을이 자라요' },
  // PHASE 4(2026-09-11) — 마을 레벨 진행 안내(현재 미배선, 문구만 준비).
  level_progress: { reactionId: 'ponder', text: 'Level {next}까지 ⭐{remaining}!' },
}

/**
 * 이벤트 -> { reactionId, text }. 알 수 없는 event는 hello + welcome
 * 문구로 폴백(에러/throw 없음).
 */
export function paulGuide(event, ctx = {}) {
  const tmpl = EVENT_TEMPLATES[event]
  if (!tmpl) return { reactionId: 'hello', text: TOWN_PHRASES.welcome }
  return { reactionId: tmpl.reactionId, text: fill(tmpl.text, ctx || {}) }
}
