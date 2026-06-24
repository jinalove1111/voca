import { getStudentClass, getStudentUnit, getClassNames } from '../utils/wordLibrary'

const GOAL = 5

function MissionBar({ label, current, goal, emoji }) {
  const pct = Math.min(100, (current / goal) * 100)
  const done = current >= goal
  return (
    <div className={`rounded-2xl p-3 ${done ? 'bg-green-50 border-2 border-green-200' : 'bg-gray-50'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-gray-600">{emoji} {label}</span>
        <span className={`text-sm font-black ${done ? 'text-green-600' : 'text-purple-600'}`}>
          {done ? '✅ 완료!' : `${current}/${goal}`}
        </span>
      </div>
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-green-400' : 'bg-gradient-to-r from-purple-400 to-pink-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function Dashboard({ student, studentData, onGo, onLogout }) {
  const { stars, pets, activeMissions, dailyProgress, allDailyDone, cleared } = studentData

  const className = getStudentClass(student)
  const unitName = getStudentUnit(student)
  const classDeleted = className && !getClassNames().includes(className)

  return (
    <div className="min-h-screen p-4 pb-8">
      {/* Header */}
      <div className="max-w-lg mx-auto pt-2 mb-4 flex items-center justify-between">
        <button onClick={onLogout} className="text-purple-400 text-sm font-bold btn-press hover:text-purple-600">← 나가기</button>
        <div className="flex items-center gap-2 bg-yellow-100 px-4 py-2 rounded-2xl">
          <span className="text-xl">⭐</span>
          <span className="font-black text-yellow-700 text-lg">{stars}</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        {/* Profile */}
        <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl p-6 text-white text-center card-shadow">
          <div className="text-5xl mb-2">👑</div>
          <h1 className="text-3xl font-black">{student}</h1>
          {className && (
            <p className="text-sm text-purple-200 mt-1">반: {className} · 유닛: {unitName}</p>
          )}
          <div className="flex justify-center gap-4 mt-3">
            <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
              <p className="text-white font-black text-xl">{cleared.length}</p>
              <p className="text-purple-200 text-xs">단어 클리어</p>
            </div>
            <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
              <p className="text-white font-black text-xl">{pets.length}</p>
              <p className="text-purple-200 text-xs">캐릭터</p>
            </div>
            <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
              <p className="text-white font-black text-xl">{activeMissions.length}</p>
              <p className="text-purple-200 text-xs">레벨업 미션</p>
            </div>
          </div>
        </div>

        {/* 반 삭제 경고 배너 */}
        {classDeleted && (
          <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-4 text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <p className="font-black text-orange-700">등록된 반이 없어요</p>
            <p className="text-sm text-orange-500 mt-1">
              &ldquo;{className}&rdquo; 반이 삭제되었습니다.<br/>
              선생님께 문의해주세요.
            </p>
          </div>
        )}

        {/* Daily Mission */}
        <div className="bg-white rounded-3xl card-shadow p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">🎯</span>
            <h2 className="font-black text-gray-800 text-lg">오늘의 미션</h2>
            {allDailyDone && !dailyProgress.done && (
              <span className="ml-auto bg-yellow-100 text-yellow-700 font-black text-xs px-3 py-1 rounded-full animate-pulse">+20⭐ 대기!</span>
            )}
            {dailyProgress.done && (
              <span className="ml-auto bg-green-100 text-green-600 font-black text-xs px-3 py-1 rounded-full">완료! 🎉</span>
            )}
          </div>
          <div className="space-y-2">
            <MissionBar label="단어 5개 보기"       current={dailyProgress.words}          goal={GOAL} emoji="📖" />
            <MissionBar label="예문 5번 듣기"       current={dailyProgress.examples}        goal={GOAL} emoji="🔊" />
            <MissionBar label="퀴즈 5개 풀기"       current={dailyProgress.quizzes}         goal={GOAL} emoji="🎮" />
            <MissionBar label="발음 5개 성공하기"   current={dailyProgress.pronunciations}  goal={GOAL} emoji="🎤" />
          </div>
          {allDailyDone && !dailyProgress.done && (
            <button
              onClick={studentData.completeDailyMission}
              className="w-full mt-3 bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-black py-3 rounded-2xl btn-press"
            >🎉 보상 받기! (+20⭐)</button>
          )}
        </div>

        {/* Nav Grid */}
        <div className="grid grid-cols-2 gap-3">
          <NavBtn emoji="📖" label="단어 공부"    sub="100개 단어"                          color="from-blue-400 to-blue-600"     onClick={() => onGo('wordBrowser')} />
          <NavBtn emoji="🎮" label="퀴즈"          sub="단어 맞히기"                         color="from-yellow-400 to-orange-500" onClick={() => onGo('quiz')} />
          <NavBtn
            emoji="⚔️" label="레벨업 미션"
            sub={activeMissions.length > 0 ? `${activeMissions.length}개 도전 중!` : '없음'}
            color="from-red-400 to-rose-600"
            onClick={() => onGo('levelUpMission')}
            badge={activeMissions.length > 0 ? activeMissions.length : null}
          />
          <NavBtn emoji="🐾" label="내 캐릭터"    sub={`${pets.length}마리 수집`}           color="from-green-400 to-teal-500"    onClick={() => onGo('petCollection')} />
        </div>

        {/* Recent pets */}
        {pets.length > 0 && (
          <div className="bg-white rounded-3xl card-shadow p-4">
            <p className="text-sm font-black text-gray-600 mb-3">🐾 최근 수집한 친구들</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {[...pets].reverse().slice(0, 6).map((p, i) => (
                <div key={i} className="flex-shrink-0 text-center">
                  <div className="text-3xl mb-1">{p.emoji}</div>
                  <p className="text-xs text-gray-500 font-bold">{p.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NavBtn({ emoji, label, sub, color, onClick, badge }) {
  return (
    <button onClick={onClick} className={`relative bg-gradient-to-br ${color} text-white rounded-3xl p-5 text-left btn-press card-shadow hover:opacity-90 transition-all`}>
      {badge && (
        <span className="absolute top-3 right-3 bg-white text-red-500 font-black rounded-full w-6 h-6 flex items-center justify-center text-xs">{badge}</span>
      )}
      <div className="text-3xl mb-2">{emoji}</div>
      <p className="font-black text-base leading-tight">{label}</p>
      <p className="text-white/70 text-xs mt-0.5">{sub}</p>
    </button>
  )
}
