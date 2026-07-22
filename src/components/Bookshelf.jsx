// 도서관(Bookshelf, Paul Town 월드 2026-07-22) — 완주가 책이 되는 곳.
//
// 책 = 완주한 교재(두꺼운 책) + 완주한 유닛(책등) — 전부 기존 파생
// (useAttachment의 unitsDone/textbooksDone + storyFoundation getBookshelf/
// getTextbookBooks)에서만 생성. 저장 0, 무작위 0. 클리어는 늘기만 하므로
// 한 번 꽂힌 책은 절대 사라지지 않는다(단조).
//
// 교재 제목은 실제 교재/반 이름만 쓴다 — wordLibrary 동기 캐시의 교재
// 정보(publisherName)가 있으면 "YBM(박준원)" 꼴, 없으면 반 이름 그대로
// (지어내지 않음). 시각 언어는 기존 카드 문법(bg-white rounded-3xl
// card-shadow, 보라 그라데이션 헤더) 그대로 — 판타지 UI 없음.
import { useMemo } from 'react'
import { getBookshelf, getTextbookBooks, formatTextbookTitle } from '../utils/attachment/storyFoundation'
import { getOwnTextbookOfClass } from '../utils/wordLibrary'

// 책등 색 — 인덱스 결정론(같은 책장은 언제 봐도 같은 색)
const SPINE_COLORS = ['bg-rose-400', 'bg-amber-400', 'bg-emerald-400', 'bg-sky-400', 'bg-violet-400']

function BookSpine({ title, wordCount, colorClass, thick = false }) {
  return (
    <div
      className={`${colorClass} ${thick ? 'w-12 h-32' : 'w-9 h-28'} rounded-t-md rounded-b-sm flex flex-col items-center justify-between py-2 shadow-sm flex-shrink-0`}
      title={`${title} · 단어 ${wordCount}개`}
    >
      <span
        className="text-white text-[10px] font-black leading-tight overflow-hidden"
        style={{ writingMode: 'vertical-rl', maxHeight: thick ? '5.5rem' : '4.5rem' }}
      >
        {title}
      </span>
      <span className="text-white/80 text-[9px] font-bold">{wordCount}</span>
    </div>
  )
}

export default function Bookshelf({ lib, unitsDone, textbooksDone, onBack }) {
  // 완주 유닛 책 + 완주 교재 책 — 전부 파생(이 화면은 아무것도 저장하지 않음)
  const unitBooks = useMemo(() => getBookshelf(lib.wordsByUnit, unitsDone), [lib, unitsDone])
  const textbookBooks = useMemo(() => {
    // 교재 실명 제목 — wordLibrary 동기 캐시에서 주입(없으면 반 이름 폴백)
    const titleByClassId = new Map(
      (textbooksDone || []).map((t) => [t.classId, formatTextbookTitle(getOwnTextbookOfClass(t.classId), t.className)]),
    )
    return getTextbookBooks(textbooksDone, lib.wordsByUnit, titleByClassId)
  }, [lib, textbooksDone])
  const totalBooks = textbookBooks.length + unitBooks.length

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press hover:text-purple-600">← 마을로</button>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <div className="bg-gradient-to-br from-indigo-400 to-purple-600 rounded-3xl p-6 text-white text-center card-shadow">
          <div className="text-5xl mb-2">📚</div>
          <h1 className="text-2xl font-black">Paul Town 도서관</h1>
          <p className="text-indigo-100 text-sm mt-1">네가 완주한 공부가 책이 되어 꽂히는 곳</p>
          {totalBooks > 0 && (
            <p className="text-indigo-100 text-xs mt-2">📖 지금까지 꽂힌 책 {totalBooks}권</p>
          )}
        </div>

        {totalBooks === 0 ? (
          // 정직한 빈 책장 — 책을 지어내지 않는다
          <div className="bg-white rounded-3xl card-shadow p-6 text-center">
            <div className="text-3xl mb-2">🪵</div>
            <p className="font-black text-gray-600">아직 책장이 비어 있어요</p>
            <p className="text-sm text-gray-400 mt-1">첫 유닛을 완주하면 첫 책이 꽂혀요</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl card-shadow p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">📖</span>
              <h2 className="font-black text-gray-800 text-lg">나의 책장</h2>
              <span className="ml-auto text-xs font-black text-purple-500 bg-purple-50 px-3 py-1 rounded-full">{totalBooks}권</span>
            </div>
            {/* 책등 선반 — 교재(두꺼운 책)가 앞, 유닛 책이 뒤. 색/순서 전부
                인덱스 결정론(같은 진행이면 언제나 같은 책장). */}
            <div className="flex flex-wrap items-end gap-1.5">
              {textbookBooks.map((b, i) => (
                <BookSpine key={`tb-${b.classId}`} title={b.title} wordCount={b.wordCount}
                  colorClass={SPINE_COLORS[i % SPINE_COLORS.length]} thick />
              ))}
              {unitBooks.map((b, i) => (
                <BookSpine key={`u-${b.unitId}`} title={b.unitName} wordCount={b.wordCount}
                  colorClass={SPINE_COLORS[(textbookBooks.length + i) % SPINE_COLORS.length]} />
              ))}
            </div>
            <div className="h-2 rounded-full bg-amber-100 mt-1" />
            {textbookBooks.length > 0 && (
              <p className="text-xs text-gray-400 mt-3">
                📚 두꺼운 책 = 끝까지 완주한 교재({textbookBooks.map((b) => b.title).join(', ')})
              </p>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          한 번 꽂힌 책은 사라지지 않아요 — 책장은 늘어나기만 해요
        </p>
      </div>
    </div>
  )
}
