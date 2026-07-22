// 단어 박물관(2026-07-22, 애착 시스템) — 학생의 단어 수집 전시관.
//
// 데이터 원천(중복 저장 없음): 반/유닛 단어 목록(wordLibrary 캐시) ×
// 기존 진행 데이터(cleared/wordStatus/missions/history 파생 티어·오답
// 횟수) × word_status 테이블의 실제 타임스탬프(last_seen_at/updated_at,
// anon SELECT). 날짜 정직성: word_status 행이 없는 단어는 날짜를 지어내지
// 않고 표시를 생략한다(폴의 기억과 동일 원칙 — 기록 시작 전 학습은 날짜
// 미상). 실버/골드 티어 판정은 attachmentCore.masteryTierFor 하나로 통일.
import { useEffect, useMemo, useState } from 'react'
import { masteryTierFor } from '../utils/attachment/attachmentCore'
import { supabase } from '../utils/supabaseClient'

const TIER_STYLE = {
  gold: { label: '골드', badge: '🥇', card: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-700' },
  silver: { label: '실버', badge: '🥈', card: 'bg-gray-50 border-gray-300', text: 'text-gray-600' },
  none: { label: '미수집', badge: null, card: 'bg-gray-50 border-gray-200 opacity-60', text: 'text-gray-400' },
}

export default function WordMuseum({ studentId, stats, lib, onBack }) {
  // word_status 실측 타임스탬프 — 실패/부재 시 조용히 날짜 생략(크래시 없음)
  const [statusRows, setStatusRows] = useState(null)
  useEffect(() => {
    let cancelled = false
    if (!studentId || !supabase) { setStatusRows(new Map()); return }
    supabase.from('word_status')
      .select('word_id,status,last_seen_at,updated_at')
      .eq('student_id', studentId)
      .then(({ data, error }) => {
        if (cancelled) return
        setStatusRows(new Map(error || !data ? [] : data.map((r) => [r.word_id, r])))
      })
    return () => { cancelled = true }
  }, [studentId])

  const units = useMemo(() => lib.wordsByUnit.map((u) => {
    const items = u.words.map((w) => {
      const tier = masteryTierFor(w, stats)
      const row = w.dbId && statusRows ? statusRows.get(w.dbId) : null
      const mission = stats.missionByWordId.get(w.id)
      return {
        word: w,
        tier,
        lastSeenAt: row?.last_seen_at || null,
        masteredAt: row?.status === 'mastered' ? row.updated_at : null,
        correctCount: mission ? Number(mission.correctCount) || 0 : null,
        missedCount: stats.missedCounts[w.id] || 0,
      }
    })
    const collected = items.filter((i) => i.tier !== 'none').length
    return { ...u, items, collected }
  }), [lib, stats, statusRows])

  const totalWords = units.reduce((n, u) => n + u.items.length, 0)
  const totalCollected = units.reduce((n, u) => n + u.collected, 0)
  const goldCount = units.reduce((n, u) => n + u.items.filter((i) => i.tier === 'gold').length, 0)

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press hover:text-purple-600">← 홈으로</button>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl p-6 text-white text-center card-shadow">
          <div className="text-5xl mb-2">🏛️</div>
          <h1 className="text-2xl font-black">나의 단어 박물관</h1>
          <p className="text-orange-100 text-sm mt-1">{lib.className ? `${lib.className} 전시관` : '전시관'}</p>
          <div className="flex justify-center gap-4 mt-3">
            <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
              <p className="font-black text-xl">{totalCollected}<span className="text-sm font-bold text-orange-100">/{totalWords}</span></p>
              <p className="text-orange-100 text-xs">수집한 단어</p>
            </div>
            <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
              <p className="font-black text-xl">🥇 {goldCount}</p>
              <p className="text-orange-100 text-xs">골드(마스터)</p>
            </div>
          </div>
        </div>

        {units.length === 0 && (
          <div className="bg-white rounded-3xl card-shadow p-6 text-center">
            <div className="text-3xl mb-2">📭</div>
            <p className="font-black text-gray-600">아직 전시할 단어가 없어요</p>
            <p className="text-sm text-gray-400 mt-1">반이 배정되면 박물관이 열려요!</p>
          </div>
        )}

        {units.map((u) => (
          <div key={u.unitId || u.unitName} className="bg-white rounded-3xl card-shadow p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📖</span>
              <h2 className="font-black text-gray-800">{u.unitName}</h2>
              <span className="ml-auto text-xs font-black text-purple-500 bg-purple-50 px-3 py-1 rounded-full">
                {u.collected}/{u.items.length} 수집
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {u.items.map(({ word, tier, lastSeenAt, masteredAt, correctCount, missedCount }) => {
                const s = TIER_STYLE[tier]
                return (
                  <div key={word.id} className={`rounded-2xl p-3 border-2 ${s.card}`}>
                    <div className="flex items-center justify-between">
                      <p className={`font-black text-sm ${tier === 'none' ? 'text-gray-400' : 'text-gray-800'}`}>
                        {tier === 'none' ? '???' : word.word}
                      </p>
                      {s.badge && <span>{s.badge}</span>}
                    </div>
                    <p className={`text-xs ${s.text}`}>{tier === 'none' ? '아직 만나지 않은 단어' : word.meaning}</p>
                    {tier !== 'none' && (
                      <div className="mt-1 space-y-0.5">
                        {/* 날짜는 word_status 실측이 있을 때만 — 없는 날짜를 지어내지 않는다 */}
                        {masteredAt && <p className="text-xs text-yellow-600">✨ {new Date(masteredAt).toLocaleDateString('ko-KR')} 마스터</p>}
                        {!masteredAt && lastSeenAt && <p className="text-xs text-gray-400">최근 학습 {new Date(lastSeenAt).toLocaleDateString('ko-KR')}</p>}
                        {correctCount != null && correctCount > 0 && <p className="text-xs text-green-600">미션 정답 {correctCount}회</p>}
                        {missedCount > 0 && <p className="text-xs text-rose-400">틀린 적 {missedCount}번 — 그래도 여기까지 왔어요!</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <p className="text-center text-xs text-gray-400">
          🥈 실버 = 학습 완료 · 🥇 골드 = 완전히 마스터 — 전시품은 늘어나기만 해요
        </p>
      </div>
    </div>
  )
}
