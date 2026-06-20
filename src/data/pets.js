export const PETS = [
  { id: 'puppy',    name: '강아지',       emoji: '🐶', rarity: 'common',    desc: '꼬리를 살랑살랑 흔들어요!' },
  { id: 'kitty',    name: '고양이',       emoji: '🐱', rarity: 'common',    desc: '골골골 소리를 내요!' },
  { id: 'bunny',    name: '토끼',         emoji: '🐰', rarity: 'common',    desc: '폴짝폴짝 잘 뛰어요!' },
  { id: 'chick',    name: '병아리',       emoji: '🐥', rarity: 'common',    desc: '삐약삐약 귀여워요!' },
  { id: 'hamster',  name: '햄스터',       emoji: '🐹', rarity: 'common',    desc: '볼이 빵빵해요!' },
  { id: 'panda',    name: '판다',         emoji: '🐼', rarity: 'common',    desc: '대나무를 좋아해요!' },
  { id: 'penguin',  name: '펭귄',         emoji: '🐧', rarity: 'common',    desc: '뒤뚱뒤뚱 귀여워요!' },
  { id: 'fox',      name: '여우',         emoji: '🦊', rarity: 'rare',      desc: '영리하고 빠른 여우!' },
  { id: 'dragon',   name: '드래곤',       emoji: '🐲', rarity: 'rare',      desc: '불을 뿜어요! 멋져요!' },
  { id: 'owl',      name: '부엉이',       emoji: '🦉', rarity: 'rare',      desc: '책을 읽는 걸 좋아해요!' },
  { id: 'tiger',    name: '호랑이',       emoji: '🐯', rarity: 'rare',      desc: '으르렁! 용감한 친구!' },
  { id: 'alien',    name: '외계인',       emoji: '👽', rarity: 'epic',      desc: '우주에서 왔어요! 희귀해요!' },
  { id: 'robot',    name: '로봇',         emoji: '🤖', rarity: 'epic',      desc: '빵야빵야! 첨단 친구!' },
  { id: 'unicorn',  name: '유니콘',       emoji: '🦄', rarity: 'epic',      desc: '무지개를 타고 달려요!' },
  { id: 'phoenix',  name: '불사조',       emoji: '🔥🐦', rarity: 'legendary', desc: '전설의 새! 엄청 희귀해요!' },
  { id: 'stardrgn', name: '별빛 드래곤',  emoji: '⭐🐲', rarity: 'legendary', desc: '세상에서 가장 강한 드래곤!' },
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
