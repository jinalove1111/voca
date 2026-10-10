import { isFeatureEnabled } from '../config/features'

// 2026-10-02 학생 홈 개편 — "나의 성장" 허브. 기존 기록 화면으로 가는 링크 +
// 요약 숫자 3개(표시 전용, 저장/조회 없음). 링크 대상 화면들의 onBack은
// 기존대로 'dashboard'라 돌아오면 단어 연습 화면이다(알려진 한계, 의도).
const LINKS = [
  { screen: 'studyCalendar', emoji: '📅', name: '공부 캘린더' },
  { screen: 'growthAlbum', emoji: '📸', name: '성장 앨범', flag: 'attachmentAlbum' },
  { screen: 'hatCollection', emoji: '🎩', name: '모자 컬렉션', flag: 'attachmentHats' },
  { screen: 'wordMuseum', emoji: '🏛️', name: '단어 박물관', flag: 'attachmentMuseum' },
  { screen: 'englishGarden', emoji: '🌱', name: '나의 정원', flag: 'attachmentWorldGarden' },
]

export default function StudentGrowth({ studentData, wallet, starsDisplay, classWords, onBack, onGo, onStartGuided }) {
  const streak = studentData?.streak || 0
  const studyDays = Object.keys(studentData?.history || {}).length
  const empty = studyDays === 0 && streak === 0
  const stars = wallet != null ? wallet.starsEarned : starsDisplay
  const show = (n) => (empty ? '-' : n)
  const hasWords = (classWords || []).length > 0

  const stats = [
    { emoji: '🔥', label: '연속 일수', value: show(streak) },
    { emoji: '⭐', label: '모은 별', value: show(stars) },
    { emoji: '📅', label: '공부한 날', value: show(studyDays) },
  ]

  return (
    <div data-testid="student-growth" className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="pt-2">
          <button onClick={onBack} className="min-h-[44px] py-3 px-2 text-purple-600 text-sm font-bold btn-press">← 홈</button>
        </div>
        <h1 className="text-2xl font-black text-purple-700">나의 성장</h1>

        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-3 text-center card-shadow">
              <div aria-hidden="true">{s.emoji}</div>
              <div className="text-3xl font-black text-purple-700">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        {empty && (
          <div className="bg-white rounded-2xl p-4 text-center space-y-3">
            <p className="text-sm text-gray-600">아직 기록이 없어요. 오늘 단어 연습을 하면 여기에 쌓여요!</p>
            <button onClick={hasWords ? onStartGuided : () => onGo('dashboard')} className="bg-purple-600 text-white font-black py-3 px-5 min-h-[44px] rounded-2xl btn-press">
              단어 연습하러 가기
            </button>
          </div>
        )}

        <h2 className="text-lg font-black text-gray-700">더 보기</h2>
        <div className="space-y-2">
          {LINKS.filter((l) => !l.flag || isFeatureEnabled(l.flag)).map((l) => (
            <button
              key={l.screen}
              data-testid={`student-growth-link-${l.screen}`}
              onClick={() => onGo(l.screen)}
              className="w-full min-h-[64px] bg-white rounded-2xl card-shadow px-4 flex items-center gap-3 text-left btn-press">
              <span className="text-2xl" aria-hidden="true">{l.emoji}</span>
              <span className="flex-1 font-black text-gray-800">{l.name}</span>
              <span className="text-gray-400 text-xl" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
