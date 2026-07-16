import { useState } from 'react'
import { STICKERS } from '../data/stickers'
import { GAMES } from '../utils/matchGame'

const gameLabel = (id) => GAMES.find(g => g.id === id)

const stickerEmoji = (id) => STICKERS.find(s => s.id === id)?.emoji
// Fallback day-markers when missions were completed but every pull that day
// happened to be a duplicate (converted to stars, so nothing new to show).
const FALLBACK_MARKERS = ['🌸', '⭐', '🎀', '🧋', '🌈', '💖']

// v1.5 버그 수정: 카테고리를 하나도 못 채운 날(단어 몇 개만 보고 끝난 날)도
// history 엔트리는 생기도록 바뀌었다(useStudent.js의 markWordViewed 참고) —
// 예전엔 categoriesCompleted<=0이면 마커 자체가 없어서 "홈엔 기록이 있는데
// 캘린더는 비어보인다"는 불일치로 보였다. 완료 전 활동도 연필 마커로
// 표시하고, 실제 카테고리 완료(스티커 등장 이후)부터 기존 마커 로직을 쓴다.
function markerFor(day, dateKey) {
  if (!day) return null
  if (day.categoriesCompleted <= 0) return '✏️'
  if (day.stickersEarned?.length) return stickerEmoji(day.stickersEarned[day.stickersEarned.length - 1]) || '⭐'
  const idx = Math.abs([...dateKey].reduce((a, c) => a + c.charCodeAt(0), 0)) % FALLBACK_MARKERS.length
  return FALLBACK_MARKERS[idx]
}

// categoriesCompleted is 0-4 (단어/예문/퀴즈/발음 중 완료한 개수) — bigger
// sticker the more of today's 4 categories were finished that day.
function sizeFor(categoriesCompleted) {
  if (categoriesCompleted >= 4) return 'text-3xl'
  if (categoriesCompleted >= 3) return 'text-2xl'
  if (categoriesCompleted >= 2) return 'text-xl'
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
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-amber-600 font-bold btn-press">← 홈</button>
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
            <button onClick={() => changeMonth(-1)} className="text-gray-400 font-black px-4 -mx-2 py-3 -my-3 btn-press">◀</button>
            <p className="font-black text-gray-700">{year}년 {month + 1}월</p>
            <button onClick={() => changeMonth(1)} className="text-gray-400 font-black px-4 -mx-2 py-3 -my-3 btn-press">▶</button>
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
                    <span className={sizeFor(day.categoriesCompleted)}>{marker}</span>
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
                <p className="text-sm">✔ 완료한 미션: <span className="font-bold">{selectedDay.day.categoriesCompleted}/4</span></p>
                <p className="text-sm">✔ 획득한 별: <span className="font-bold text-yellow-600">⭐ {selectedDay.day.starsEarned}</span></p>
                <div className="text-sm">
                  ✔ 획득한 스티커:{' '}
                  {selectedDay.day.stickersEarned?.length
                    ? selectedDay.day.stickersEarned.map(stickerEmoji).join(' ')
                    : '없음'}
                </div>
                <div className="text-sm">
                  ✔ 플레이한 게임:{' '}
                  {selectedDay.day.gamesPlayed && Object.keys(selectedDay.day.gamesPlayed).length
                    ? Object.entries(selectedDay.day.gamesPlayed)
                        .map(([id, count]) => `${gameLabel(id)?.emoji || '🎮'}×${count}`)
                        .join(' ')
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
