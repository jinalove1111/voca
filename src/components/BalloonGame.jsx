import MatchGameShell from './MatchGameShell'

const THEME = {
  id: 'balloon',
  title: '뜻 찾기 풍선 게임',
  icon: '🎈',
  bgGradient: 'from-sky-400 to-indigo-500',
  itemEmoji: '🎈',
  itemShape: 'rounded-full',
  colors: ['bg-red-400', 'bg-blue-400', 'bg-yellow-400', 'bg-green-400'],
  instructionText: '발음을 듣고 맞는 뜻 풍선을 터치하세요!',
  correctFx: { emoji: '🎉🎊✨', label: '야르!! 🎉' },
  wrongFx: { emoji: '😆', label: '다시 한번!' },
}

export default function BalloonGame(props) {
  return <MatchGameShell theme={THEME} {...props} />
}
