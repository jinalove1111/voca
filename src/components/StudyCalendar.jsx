import { useState } from 'react'
import { STICKERS } from '../data/stickers'

const stickerEmoji = (id) => STICKERS.find(s => s.id === id)?.emoji
// Fallback day-markers when missions were completed but every pull that day
// happened to be a duplicate (converted to stars, so nothing new to show).
const FALLBACK_MARKERS = ['🌸', '⭐', '🎀', '🧋', '🌈', '💖']

function markerFor(day, dateKey) {
  if (!day || day.missionsCompleted <= 0) return null
  if (day.stickersEarned?.length) return stickerEmoji(day.stickersEarned[day.stickersEarned.length - 1]) || '⭐'
  const idx = Math.abs([...dateKey].reduce((a, c) => a + c.charCodeAt(0), 0)) % FALLBACK_MARKERS.length
  return FALLBACK_MARKERS[idx]
}

function sizeFor(count) {
  if (count >= 10) return 'text-3xl'
  if (count >= 5) return 'text-2xl'
  if (count >= 3) return 'text-xl'
  return 'text-lg'
}

export default function StudyCalendar({ studentData, onBack }) {
  const { history, streak } = studentData
  const [viewDate, setViewDate] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(null)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayKey = new Date().toDateString()

  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const dateKeyFor = (d) => new Date(year, month, d).toDateString()

  const changeMonth = (delta) => setViewDate(new Date(year, month + delta, 1))

  return (
    <div className="min-h-screen p-4 pb-8 bg-gradient-to-br from-amber-50 to-pink-50">
      <div className="flex items-center justify-between max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="text-amber-600 font-bold btn-press">← 홈</button>
        <h1 className="text-xl font-black text-amber-700">📅 공부 캘린더</h1>
      </div>

      <div className="max-w-lg mx-auto space-y-4">
        <div className="bg-white rounded-3xl card-shadow p-4 text-center">
          <p className="text-4xl mb-1">🔥</p>
          <p className="text-2xl font-black text-orange-500">{streak}일 연속 공부 중!</p>
          <p className="text-gray-400 text-xs mt-1">매일 미션을 완료하면 스트릭이 이어져요</p>
        </div>

        <div className="bg-white rounded-3xl card-shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => changeMonth(-1)} className="text-gray-400 font-black px-2 btn-press">◀</button>
            <p className="font-black text-gray-700">{year}년 {month + 1}월</p>
            <button onClick={() => changeMonth(1)} className="text-gray-400 font-black px-2 btn-press">▶</button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-gray-400 mb-1">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => <div key={d}>{d}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />
              const key = dateKeyFor(d)
              const day = history[key]
              const marker = markerFor(day, key)
              const isToday = key === todayKey
              return (
                <button key={i} onClick={() => setSelectedDay({ key, day, dateNum: d })}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center btn-press ${isToday ? 'ring-2 ring-purple-400' : ''} ${marker ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                  {marker ? (
                    <span className={sizeFor(day.missionsCompleted)}>{marker}</span>
                  ) : (
                    <span className="text-xs text-gray-400">{d}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400">날짜를 눌러서 그날의 기록을 확인해보세요</p>
      </div>

      {selectedDay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDay(null)}>
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center" onClick={e => e.stopPropagation()}>
            <p className="font-black text-gray-800 text-lg mb-3">{month + 1}월 {selectedDay.dateNum}일</p>
            {selectedDay.day ? (
              <div className="space-y-2 text-left">
                <p className="text-sm">✔ 공부 여부: <span className="font-bold text-green-600">공부했어요!</span></p>
                <p className="text-sm">✔ 완료한 미션: <span className="font-bold">{selectedDay.day.missionsCompleted}회</span></p>
                <p className="text-sm">✔ 획득한 별: <span className="font-bold text-yellow-600">⭐ {selectedDay.day.starsEarned}</span></p>
                <div className="text-sm">
                  ✔ 획득한 스티커:{' '}
                  {selectedDay.day.stickersEarned?.length
                    ? selectedDay.day.stickersEarned.map(stickerEmoji).join(' ')
                    : '없음'}
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">이날은 공부하지 않았어요</p>
            )}
            <button onClick={() => setSelectedDay(null)}
              className="w-full mt-5 bg-purple-500 text-white font-black py-3 rounded-2xl btn-press">닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}
