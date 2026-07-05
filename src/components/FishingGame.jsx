import MatchGameShell from './MatchGameShell'

const THEME = {
  id: 'fishing',
  title: '단어 낚시',
  icon: '🎣',
  bgGradient: 'from-cyan-500 to-blue-700',
  itemEmoji: '🐟',
  itemShape: 'rounded-2xl',
  colors: ['bg-teal-400', 'bg-cyan-500', 'bg-blue-400', 'bg-emerald-400'],
  instructionText: '발음을 듣고 맞는 뜻 물고기를 낚아보세요!',
  correctFx: { emoji: '🎣✨🐟', label: '월척이다!! 🎉' },
  wrongFx: { emoji: '💦', label: '놓쳤어요! 다시 한번!' },
}

export default function FishingGame(props) {
  return <MatchGameShell theme={THEME} {...props} />
}
