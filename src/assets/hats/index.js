// 학생 모자 8종 PNG(256x256, 투명 배경, scripts/hats/buildHatAssets.py가 생성).
// hatSystem.js(순수 모듈)는 건드리지 않고, Vite가 필요한 PNG import는 여기서만 한다.
// 매핑은 색 정체성 기준(A안): id/임계값/colorHex는 그대로이고 그림만 같은 색의 모자로 바뀐다.
import navy from './paul-hat-navy.png'
import green from './paul-hat-green.png'
import pink from './paul-hat-pink.png'
import gold from './paul-hat-gold.png'
import blue from './paul-hat-blue.png'
import purple from './paul-hat-purple.png'
import red from './paul-hat-red.png'
import orange from './paul-hat-orange.png'

export const HAT_IMAGE_BY_COLOR = { navy, green, pink, gold, blue, purple, red, orange }

export const HAT_COLOR_BY_ID = {
  hat_rose: 'pink',
  hat_graduation: 'red',
  hat_chef: 'green',
  hat_explorer: 'blue',
  hat_wizard: 'purple',
  hat_crown: 'gold',
  hat_starter: 'navy',
  hat_scientist: 'orange',
}

export const HAT_IMAGE_BY_ID = Object.fromEntries(
  Object.entries(HAT_COLOR_BY_ID).map(([id, color]) => [id, HAT_IMAGE_BY_COLOR[color]]),
)

export const hatImageFor = (hatId) => HAT_IMAGE_BY_ID[hatId] || null

// 글자 크기(text-3xl 등)를 따라 커지도록 1em 박스 + object-contain.
export const HAT_IMG_CLASS = 'inline-block h-[1em] w-[1em] object-contain align-[-0.12em] select-none'
