// 시계탑(TimeMachine, Paul Town 월드 2026-07-22) — 실제 이력만 다시 보는 곳.
//
// paulTown.js timeWindows()의 계산 결과만 그린다 — 저장 0, 무작위 0.
// 진실성 원칙: 창(어제/지난주/한 달 전)에 기록이 없으면 "이때의 기록은
// 아직 없어요"라고 정직하게 말하고, "일 년 전 오늘"은 그 달력 날짜의
// 기록이 실존할 때만 창 자체가 나타난다(hideWhenAbsent). 없는 기억을
// 지어내지 않는다 — 극복 단어도 실단어로 해석될 때만 이름을 보여준다.
//
// 시각 언어: 기존 카드 문법(bg-white rounded-3xl card-shadow, 보라
// 그라데이션 헤더) 그대로 — GrowthAlbum의 주간 타임머신 카드와 형제 화면.
import { timeWindows } from '../utils/attachment/paulTown'

const MAX_OVERCOME_WORDS = 3

function WindowCard({ win, wordTextById }) {
  // 극복 단어 — 실단어로 해석 가능한 것만 이름 표시(진실성)
  const overcomeWords = (win.overcomeWordIds || [])
    .map((wid) => wordTextById?.get?.(wid))
    .filter(Boolean)
    .slice(0, MAX_OVERCOME_WORDS)
  return (
    <div className="bg-white rounded-3xl card-shadow p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{win.emoji}</span>
        <h2 className="font-black text-gray-800 text-lg">{win.label}</h2>
        {win.dateLabel && <span className="ml-auto text-xs text-gray-400 font-bold">{win.dateLabel}</span>}
      </div>
      {!win.present ? (
        // 정직한 빈 창 — 숫자/기억을 지어내지 않는다
        <p className="text-sm text-gray-400 text-center py-2">이때의 기록은 아직 없어요</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl p-3 bg-gray-50 text-center">
              <p className="font-black text-gray-700 text-lg">{win.daysStudied}일</p>
              <p className="text-xs text-gray-400">공부한 날</p>
            </div>
            <div className="rounded-2xl p-3 bg-yellow-50 text-center">
              <p className="font-black text-yellow-600 text-lg">⭐ {win.starsEarned}</p>
              <p className="text-xs text-gray-400">모은 별</p>
            </div>
            <div className="rounded-2xl p-3 bg-purple-50 text-center">
              {/* 정답률은 퀴즈 기록이 실존할 때만 — 없으면 '-'로 정직 표시 */}
              <p className="font-black text-purple-600 text-lg">{win.accuracy != null ? `${win.accuracy}%` : '—'}</p>
              <p className="text-xs text-gray-400">퀴즈 정답률</p>
            </div>
          </div>
          {overcomeWords.length > 0 ? (
            <p className="text-xs font-bold text-green-600 mt-3">
              💪 그때 틀렸던 "{overcomeWords.join('", "')}"{win.overcomeWordIds.length > overcomeWords.length ? ` 외 ${win.overcomeWordIds.length - overcomeWords.length}개` : ''} — 지금은 이겨냈어요!
            </p>
          ) : win.overcomeWordIds.length > 0 ? (
            <p className="text-xs font-bold text-green-600 mt-3">
              💪 그때 틀렸던 단어 {win.overcomeWordIds.length}개를 지금은 이겨냈어요!
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

export default function TimeMachine({ stats, wordTextById, onBack }) {
  const windows = timeWindows(stats)
  // "일 년 전 오늘"은 기록이 실존할 때만 — 창 자체를 그리지 않는다
  const visible = windows.filter((w) => !(w.hideWhenAbsent && !w.present))
  const anyPresent = visible.some((w) => w.present)

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press hover:text-purple-600">← 마을로</button>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-3xl p-6 text-white text-center card-shadow">
          <div className="text-5xl mb-2">🕰️</div>
          <h1 className="text-2xl font-black">Paul Town 시계탑</h1>
          <p className="text-purple-200 text-sm mt-1">진짜 있었던 나의 시간만 다시 볼 수 있어요</p>
        </div>

        {visible.map((w) => (
          <WindowCard key={w.id} win={w} wordTextById={wordTextById} />
        ))}

        {!anyPresent && (
          <p className="text-center text-xs text-gray-400">
            공부한 날이 쌓이면 시계탑이 그 시간들을 보여줘요
          </p>
        )}
      </div>
    </div>
  )
}
