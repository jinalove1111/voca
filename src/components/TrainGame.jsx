import MatchGameShell from './MatchGameShell'

const THEME = {
  id: 'train',
  title: '기차 태우기',
  icon: '🚂',
  bgGradient: 'from-emerald-500 to-teal-700',
  itemEmoji: '🚃',
  itemShape: 'rounded-xl',
  colors: ['bg-emerald-500', 'bg-teal-500', 'bg-lime-500', 'bg-green-600'],
  instructionText: '발음을 듣고 맞는 뜻 기차 칸을 태워보세요!',
  correctFx: { emoji: '🚂💨✨', label: '출발!! 🎉' },
  wrongFx: { emoji: '🚫', label: '다른 칸이에요! 다시 한번!' },
}

export default function TrainGame(props) {
  return <MatchGameShell theme={THEME} {...props} />
}
