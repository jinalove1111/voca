// 성장 앨범 + 타임머신(2026-07-22, 애착 시스템) — 학습 여정의 이정표 앨범.
//
// 데이터 원천: record.milestones(append-only 이벤트, useAttachment가 자동
// 감지·기록) + deriveAttachmentStats의 주간 비교(타임머신). 날짜 정직성:
// backfilled(소급 감지) 이벤트는 달성 날짜를 주장하지 않고 "이미 달성!"
// 으로만 보여준다 — milestones.js 헤더의 원칙 그대로.
import { sortMilestonesForAlbum } from '../utils/attachment/milestones'

export default function GrowthAlbum({ milestones, stats, onBack }) {
  const sorted = sortMilestonesForAlbum(milestones)
  const tw = stats.thisWeek
  const lw = stats.lastWeek
  const bothWeeksHaveData = tw.quizTotal >= 5 && lw.quizTotal >= 5
  const twAcc = tw.quizTotal > 0 ? Math.round((tw.quizCorrect / tw.quizTotal) * 100) : null
  const lwAcc = lw.quizTotal > 0 ? Math.round((lw.quizCorrect / lw.quizTotal) * 100) : null

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press hover:text-purple-600">← 홈으로</button>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <div className="bg-gradient-to-br from-sky-400 to-indigo-500 rounded-3xl p-6 text-white text-center card-shadow">
          <div className="text-5xl mb-2">📸</div>
          <h1 className="text-2xl font-black">나의 성장 앨범</h1>
          <p className="text-sky-100 text-sm mt-1">여기까지 온 길을 폴이 다 기록해뒀어요</p>
        </div>

        {/* 타임머신 — 지난주의 나 vs 이번 주의 나(실측 표본이 충분할 때만 비교) */}
        <div className="bg-white rounded-3xl card-shadow p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🕰️</span>
            <h2 className="font-black text-gray-800 text-lg">타임머신</h2>
          </div>
          {bothWeeksHaveData ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-3 bg-gray-50 text-center">
                <p className="text-xs font-bold text-gray-400">지난주의 나</p>
                <p className="font-black text-gray-600 text-xl mt-1">{lwAcc}%</p>
                <p className="text-xs text-gray-400">퀴즈 정답률</p>
                <p className="text-xs text-gray-500 mt-1">공부한 날 {lw.daysStudied}일 · ⭐{lw.starsEarned}</p>
              </div>
              <div className={`rounded-2xl p-3 text-center border-2 ${twAcc >= lwAcc ? 'bg-green-50 border-green-200' : 'bg-sky-50 border-sky-200'}`}>
                <p className="text-xs font-bold text-gray-500">이번 주의 나</p>
                <p className={`font-black text-xl mt-1 ${twAcc >= lwAcc ? 'text-green-600' : 'text-sky-600'}`}>{twAcc}%</p>
                <p className="text-xs text-gray-400">퀴즈 정답률</p>
                <p className="text-xs text-gray-500 mt-1">공부한 날 {tw.daysStudied}일 · ⭐{tw.starsEarned}</p>
              </div>
            </div>
          ) : (
            // 표본 부족 — 비교를 지어내지 않는다(폴의 기억과 동일 원칙)
            <p className="text-sm text-gray-400 text-center py-2">
              두 주 동안 퀴즈를 충분히 풀면 지난주의 나와 비교할 수 있어요!
            </p>
          )}
          {bothWeeksHaveData && twAcc > lwAcc && (
            <p className="text-center text-xs font-bold text-green-600 mt-2">지난주의 나보다 실력이 늘었어요! 📈</p>
          )}
        </div>

        {/* 밀스톤 타임라인 — 기존 카드 문법 그대로 */}
        <div className="bg-white rounded-3xl card-shadow p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🏆</span>
            <h2 className="font-black text-gray-800 text-lg">나의 이정표</h2>
            {sorted.length > 0 && (
              <span className="ml-auto text-xs font-black text-purple-500 bg-purple-50 px-3 py-1 rounded-full">{sorted.length}개 달성</span>
            )}
          </div>
          {sorted.length === 0 ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">🌱</div>
              <p className="font-black text-gray-600">첫 이정표를 향해 가는 중!</p>
              <p className="text-sm text-gray-400 mt-1">공부를 하면 여기에 기록이 쌓여요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-2xl p-3 bg-gray-50">
                  <span className="text-2xl flex-shrink-0">{m.emoji}</span>
                  <div className="min-w-0">
                    <p className="font-black text-gray-800 text-sm">{m.title}</p>
                    <p className="text-xs text-gray-500">{m.desc}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {/* backfilled = 정확한 달성일을 모름 — 날짜를 지어내지 않는다 */}
                      {m.backfilled ? '이미 달성! 🎉' : new Date(m.at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
