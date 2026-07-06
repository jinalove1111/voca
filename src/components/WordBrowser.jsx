import { useState, useMemo } from 'react'

const MODES = [
  { id: 'study',         label: '공부하기', emoji: '📖' },
  { id: 'quiz',          label: '퀴즈',    emoji: '🎮' },
  { id: 'write',         label: '쓰기',    emoji: '✏️' },
  { id: 'comprehensive', label: '종합',    emoji: '🏆' },
]

export default function WordBrowser({ words, cleared, onSelect, onBack, mode, onModeChange }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return words
    return words.filter(w => w.word.toLowerCase().includes(q) || w.meaning.includes(q))
  }, [query, words])

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="flex items-center gap-3 max-w-lg mx-auto mb-4 pt-2">
        <button onClick={onBack} className="text-purple-600 font-bold btn-press">← 홈</button>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-blue-600">📖 단어 공부</h1>
          <p className="text-gray-400 text-xs">{words.length}개 단어 · {cleared.length}개 클리어</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        {onModeChange && (
          <div className="overflow-x-auto mb-4 -mx-1 px-1">
            <div className="grid grid-cols-4 gap-2 min-w-[280px]">
              {MODES.map(m => (
                <button key={m.id} onClick={() => onModeChange(m.id)}
                  className={`rounded-2xl py-3 text-center btn-press transition-all ${
                    mode === m.id ? 'bg-blue-500 text-white card-shadow' : 'bg-white text-gray-500 border-2 border-gray-200'}`}>
                  <div className="text-xl">{m.emoji}</div>
                  <div className="text-xs font-black mt-0.5 whitespace-nowrap">{m.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative mb-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔍</span>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="단어 또는 뜻 검색..."
            className="w-full border-2 border-blue-200 rounded-2xl pl-12 pr-4 py-3 font-bold focus:outline-none focus:border-blue-400 transition-colors" />
          {query && <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>}
        </div>

        <div className="bg-white rounded-2xl card-shadow p-3 mb-4 flex items-center gap-3">
          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all"
              style={{ width: `${(cleared.length / Math.max(words.length, 1)) * 100}%` }} />
          </div>
          <span className="text-sm font-black text-purple-600 whitespace-nowrap">{cleared.length}/{words.length}</span>
        </div>

        <div className="space-y-2 animate-fade-in">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-5xl mb-3">🔍</div>
              <p className="font-bold">검색 결과가 없어요</p>
            </div>
          ) : filtered.map((w, i) => {
            const isCleared = cleared.includes(w.id)
            return (
              <button key={w.id} onClick={() => onSelect(w)}
                className={`w-full flex items-center gap-4 rounded-2xl p-4 text-left btn-press transition-all card-shadow ${isCleared ? 'bg-green-50 border-2 border-green-200' : 'bg-white border-2 border-transparent hover:border-blue-200'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 ${isCleared ? 'bg-green-400 text-white' : 'bg-blue-100 text-blue-600'}`}>
                  {isCleared ? '✓' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-lg text-gray-800">{w.word}</p>
                  <p className="text-gray-500 text-sm">{w.meaning}</p>
                </div>
                <span className="text-gray-300 text-xl flex-shrink-0">›</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
