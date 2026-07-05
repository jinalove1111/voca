import MatchGameShell from './MatchGameShell'

const THEME = {
  id: 'pizza',
  title: '피자 만들기',
  icon: '🍕',
  bgGradient: 'from-orange-400 to-red-500',
  itemEmoji: '🧀',
  itemShape: 'rounded-2xl',
  colors: ['bg-yellow-500', 'bg-orange-500', 'bg-red-400', 'bg-amber-500'],
  instructionText: '발음을 듣고 맞는 뜻 토핑을 올려보세요!',
  correctFx: { emoji: '🍕🧀✨', label: '맛있겠다!! 🎉' },
  wrongFx: { emoji: '🫠', label: '이건 아니에요! 다시 한번!' },
}

export default function PizzaGame(props) {
  return <MatchGameShell theme={THEME} {...props} />
}
