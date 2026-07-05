// UK-themed character set (16 total) — swapped in place of the old generic
// animal set so every pull feels tied to learning British-accented English.
export const PETS = [
  { id: 'ukflag',   name: '영국 국기',     emoji: '🇬🇧', rarity: 'common',    desc: '유니언잭! 영국을 상징해요!' },
  { id: 'busred',   name: '런던 버스',     emoji: '🚌', rarity: 'common',    desc: '런던 시내를 달리는 2층 버스!' },
  { id: 'corgi',    name: '코기',         emoji: '🐶', rarity: 'common',    desc: '여왕님이 사랑한 다리 짧은 강아지!' },
  { id: 'telbooth', name: '빨간 전화박스', emoji: '☎️', rarity: 'common',    desc: '런던 거리의 상징이에요!' },
  { id: 'tea',      name: '홍차',         emoji: '🍵', rarity: 'common',    desc: '오후 3시엔 꼭 티타임!' },
  { id: 'football', name: '축구공',       emoji: '⚽', rarity: 'common',    desc: '축구의 고향, 영국!' },
  { id: 'postbox',  name: '빨간 우체통',   emoji: '📮', rarity: 'common',    desc: '영국 거리마다 있는 빨간 우체통!' },
  { id: 'crown',    name: '왕관',         emoji: '👑', rarity: 'rare',      desc: '왕실의 상징, 반짝반짝!' },
  { id: 'paddington', name: '패딩턴',     emoji: '🐻', rarity: 'rare',      desc: '마멀레이드를 좋아하는 곰돌이!' },
  { id: 'gentleman', name: '신사',        emoji: '🎩', rarity: 'rare',      desc: '중절모를 쓴 멋쟁이 신사!' },
  { id: 'umbrella', name: '우산',         emoji: '☂️', rarity: 'rare',      desc: '비 오는 런던엔 우산이 필수!' },
  { id: 'guard',    name: '근위병',       emoji: '💂', rarity: 'epic',      desc: '버킹엄 궁전을 지키는 근위병!' },
  { id: 'castle',   name: '성',           emoji: '🏰', rarity: 'epic',      desc: '영국의 오래된 멋진 성!' },
  { id: 'piepot',   name: '미트파이',     emoji: '🥧', rarity: 'epic',      desc: '따끈따끈 영국식 미트파이!' },
  { id: 'lion',     name: '사자',         emoji: '🦁', rarity: 'legendary', desc: '영국 왕실 문장의 용맹한 사자!' },
  { id: 'blackcab', name: '블랙캡 택시',  emoji: '🚕', rarity: 'legendary', desc: '런던의 상징, 검은 택시!' },
]

export const RARITY_COLORS = {
  common:    { bg: 'bg-gray-100',   text: 'text-gray-600',   label: '일반' },
  rare:      { bg: 'bg-blue-100',   text: 'text-blue-600',   label: '희귀' },
  epic:      { bg: 'bg-purple-100', text: 'text-purple-600', label: '에픽' },
  legendary: { bg: 'bg-yellow-100', text: 'text-yellow-600', label: '전설' },
}

const WEIGHTS = { common: 60, rare: 28, epic: 10, legendary: 2 }

export function getRandomPet() {
  const roll = Math.random() * 100
  let acc = 0
  let rarity = 'common'
  for (const [r, w] of Object.entries(WEIGHTS)) {
    acc += w
    if (roll < acc) { rarity = r; break }
  }
  const pool = PETS.filter(p => p.rarity === rarity)
  return pool[Math.floor(Math.random() * pool.length)]
}
