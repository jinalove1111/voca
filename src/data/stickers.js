// Sticker catalog for the "My English Diary" (다꾸) decorating system.
// Pulled from a gift box on mission completion — see useStudent.js.
// Rarity mirrors a classic gacha spread: Common is plentiful, Legendary rare.
export const RARITY_COLORS = {
  common:    { bg: 'bg-gray-100',   text: 'text-gray-600',   ring: 'border-gray-300',   label: 'Common',    dot: '⚪' },
  rare:      { bg: 'bg-green-100',  text: 'text-green-700',  ring: 'border-green-300',  label: 'Rare',      dot: '🟢' },
  epic:      { bg: 'bg-blue-100',   text: 'text-blue-700',   ring: 'border-blue-300',   label: 'Epic',      dot: '🔵' },
  legendary: { bg: 'bg-purple-100', text: 'text-purple-700', ring: 'border-purple-300', label: 'Legendary', dot: '🟣' },
}

const c = (id, emoji, name) => ({ id, emoji, name, rarity: 'common' })
const r = (id, emoji, name) => ({ id, emoji, name, rarity: 'rare' })
const e = (id, emoji, name) => ({ id, emoji, name, rarity: 'epic' })
const l = (id, emoji, name) => ({ id, emoji, name, rarity: 'legendary' })

export const STICKERS = [
  // ── Common: everyday cute stickers ──
  c('sticker1', '🎀', '리본 스티커'), c('sticker2', '🌸', '벚꽃'), c('sticker3', '⭐', '별'),
  c('sticker4', '☁️', '뭉게구름'), c('sticker5', '🎈', '풍선'), c('sticker6', '💛', '노란 하트'),
  c('sticker7', '🧸', '곰인형'), c('sticker8', '🌷', '튤립'), c('sticker9', '🍬', '사탕'),
  c('sticker10', '🍭', '막대사탕'), c('sticker11', '🌼', '데이지'), c('sticker12', '🫧', '비눗방울'),
  c('sticker13', '✏️', '연필'), c('sticker14', '📎', '클립'), c('sticker15', '🍀', '네잎클로버'),
  c('sticker16', '🐣', '병아리'), c('sticker17', '🍓', '딸기'), c('sticker18', '🧁', '컵케이크'),
  c('sticker19', '🌈', '무지개'), c('sticker20', '☀️', '햇살'), c('sticker21', '🐝', '꿀벌'),
  c('sticker22', '🦋', '나비'), c('sticker23', '🍡', '경단'), c('sticker24', '🎨', '팔레트'),
  c('sticker25', '📌', '압정'), c('sticker26', '💌', '편지'), c('sticker27', '🧦', '양말'),

  // ── Rare: washi tape, animals, treats ──
  r('tape1', '🌈', '무지개 마스킹테이프'), r('tape2', '🌸', '벚꽃 마스킹테이프'), r('tape3', '⭐', '별 마스킹테이프'),
  r('gem1', '💎', '보석'), r('bear1', '🐻', '곰돌이'), r('dog1', '🐶', '강아지'),
  r('cat1', '🐱', '고양이'), r('dessert1', '🍰', '케이크'), r('drink1', '🧋', '버블티'),
  r('heart1', '💖', '반짝 하트'), r('unicorn1', '🦄', '유니콘'), r('rabbit1', '🐰', '토끼'),
  r('duck1', '🦆', '오리'), r('sunflower', '🌻', '해바라기'), r('cherry', '🍒', '체리'),
  r('donut', '🍩', '도넛'), r('icecream', '🍨', '아이스크림'), r('macaron', '🍮', '마카롱'),

  // ── Epic: UK-themed + shiny extras ──
  e('ukflag1', '🇬🇧', '영국 국기'), e('phonebox', '☎️', '빨간 전화박스'), e('bus1', '🚌', '런던 버스'),
  e('crown1', '👑', '왕관'), e('firework1', '🎉', '폭죽'), e('cloud_gold', '☁️✨', '반짝이는 구름'),
  e('star_gold', '🌟', '황금별'), e('teapot', '🫖', '티팟'), e('umbrella1', '☂️', '우산'),
  e('castle1', '🏰', '작은 성'), e('guard1', '💂', '근위병'), e('postbox1', '📮', '빨간 우체통'),

  // ── Legendary: extra special, glossy ──
  l('unicorn_gold', '🦄✨', '황금 유니콘'), l('crown_gem', '👑💎', '보석 왕관'),
  l('rainbow_star', '🌈⭐', '무지개 별'), l('phoenix1', '🔥🐦', '불사조'),
  l('castle_gold', '🏰✨', '반짝이는 성'), l('heart_diamond', '💖💎', '다이아 하트'),
]

export function getRandomSticker() {
  const weights = { common: 55, rare: 28, epic: 12, legendary: 5 }
  const roll = Math.random() * 100
  let acc = 0
  let rarity = 'common'
  for (const [rk, w] of Object.entries(weights)) {
    acc += w
    if (roll < acc) { rarity = rk; break }
  }
  const pool = STICKERS.filter(s => s.rarity === rarity)
  return pool[Math.floor(Math.random() * pool.length)]
}

// Guaranteed-legendary pull for streak milestones (3/7/14/30 days).
export function getMilestoneSticker() {
  const pool = STICKERS.filter(s => s.rarity === 'legendary')
  return pool[Math.floor(Math.random() * pool.length)]
}
