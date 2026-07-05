// Diary page backgrounds — unlocked by studying (streak-gated), swapped in
// as the canvas backdrop behind placed stickers. Pure CSS gradients, no
// images to fetch, so switching is instant and free.
export const BACKGROUNDS = [
  { id: 'spring',   name: '봄',       emoji: '☀️', unlockStreak: 0,  css: 'linear-gradient(135deg, #fdf6ec 0%, #d9f2e6 100%)' },
  { id: 'sakura',   name: '벚꽃',     emoji: '🌸', unlockStreak: 3,  css: 'linear-gradient(135deg, #ffe4ec 0%, #ffd1dc 50%, #ffe9f0 100%)' },
  { id: 'summer',   name: '여름',     emoji: '🏖️', unlockStreak: 5,  css: 'linear-gradient(135deg, #d6f3ff 0%, #fff6d6 100%)' },
  { id: 'rainbow',  name: '무지개',   emoji: '🌈', unlockStreak: 7,  css: 'linear-gradient(135deg, #ffe0e0, #fff5cc, #e0ffe0, #e0f0ff, #f0e0ff)' },
  { id: 'sky',      name: '하늘',     emoji: '☁️', unlockStreak: 10, css: 'linear-gradient(135deg, #eaf6ff 0%, #cfe9ff 100%)' },
  { id: 'halloween',name: '할로윈',   emoji: '🎃', unlockStreak: 14, css: 'linear-gradient(135deg, #2e1a47 0%, #ff8c42 100%)' },
  { id: 'uk',       name: '영국',     emoji: '🏰', unlockStreak: 20, css: 'linear-gradient(135deg, #d6e4ff 0%, #eef1ff 100%)' },
  { id: 'space',    name: '우주',     emoji: '🌌', unlockStreak: 25, css: 'linear-gradient(135deg, #1b1035 0%, #4b2e83 60%, #7b4fb0 100%)' },
  { id: 'xmas',     name: '크리스마스', emoji: '🎄', unlockStreak: 30, css: 'linear-gradient(135deg, #eafff0 0%, #ffe0e0 100%)' },
]

export function backgroundsUnlockedFor(streak) {
  return BACKGROUNDS.filter(b => streak >= b.unlockStreak)
}
