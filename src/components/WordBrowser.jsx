import { useState, useMemo } from 'react'
import { getReactionById } from '../utils/paulReactions'
import HeroReaction from './HeroReaction'
import { filterWordsByScope } from '../utils/wordLibrary'
import { isFeatureEnabled } from '../config/features'
import SentencesTab from './SentencesTab'

const MODES = [
  { id: 'study',         label: '공부하기', emoji: '📖' },
  { id: 'quiz',          label: '퀴즈',    emoji: '🎮' },
  { id: 'write',         label: '쓰기',    emoji: '✏️' },
  { id: 'comprehensive', label: '종합',    emoji: '🏆' },
]

// v1.5 Skip 기능 — "어떤 단어를 공부할지" 범위 선택. studyMode(어떻게
// 공부할지)와 별개 축이라 별도 selector로 분리.
const SCOPES = [
  { id: 'all',     label: '전체 단어', emoji: '📚' },
  { id: 'unknown', label: '모르는 단어만', emoji: '😅' },
  { id: 'unseen',  label: '안 본 단어만', emoji: '🆕' },
  { id: 'review',  label: '복습 단어만', emoji: '🔁' },
]

// v3.4 Sentence Learning Phase B — [단어]/[문장] 탭. studentId/unitId는
// 문장 탭(SentencesTab)에만 쓰인다(진행도 조회는 UUID — 규칙 4). 탭 바
// 자체가 readingStudentUI 플래그(기본 false) 뒤에 있어, 플래그가 꺼진
// 프로덕션에서는 탭 바도 문장 탭도 렌더되지 않고 기존 단어 화면이 픽셀
// 단위로 동일하게 유지된다.
const TABS = [
  { id: 'words', label: '📖 단어' },
  { id: 'sentences', label: '📜 문장' },
]

export default function WordBrowser({ words, cleared, onSelect, onBack, mode, onModeChange, scope, onScopeChange, wordStatus = {}, reviewWordIds = new Set(), studentId = null, unitId = null }) {
  const [query, setQuery] = useState('')
  // 기본 탭은 항상 '단어' — 플래그가 꺼져 있으면 이 상태는 바뀔 방법
  // 자체가 없다(탭 바 비렌더).
  const sentencesEnabled = isFeatureEnabled('readingStudentUI')
  const [tab, setTab] = useState('words')

  // 범위별 개수 — selector에 "(3)" 같은 뱃지로 보여줘서 몇 개가 걸리는지
  // 미리 알 수 있게 함.
  const scopeCounts = useMemo(() => Object.fromEntries(
    SCOPES.map((s) => [s.id, filterWordsByScope(words, s.id, wordStatus, reviewWordIds).length])
  ), [words, wordStatus, reviewWordIds])

  const scoped = useMemo(
    () => filterWordsByScope(words, scope, wordStatus, reviewWordIds),
    [words, scope, wordStatus, reviewWordIds]
  )

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return scoped
    return scoped.filter(w => w.word.toLowerCase().includes(q) || w.meaning.includes(q))
  }, [query, scoped])

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="flex items-center gap-3 max-w-lg mx-auto mb-4 pt-2">
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-600 font-bold btn-press">← 홈</button>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-blue-600">📖 단어 공부</h1>
          <p className="text-gray-400 text-xs">{scoped.length}개 단어 · {cleared.length}개 클리어</p>
        </div>
        <HeroReaction image={getReactionById('lets_learn')?.image} size="sm" />
      </div>

      <div className="max-w-lg mx-auto">
        {sentencesEnabled && (
          <div className="grid grid-cols-2 gap-1.5 mb-4 bg-white rounded-2xl p-1.5 card-shadow">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`min-h-[44px] py-2.5 rounded-xl font-black text-sm btn-press transition-all ${
                  tab === t.id ? 'bg-purple-500 text-white' : 'text-gray-400'}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {sentencesEnabled && tab === 'sentences' ? (
          <SentencesTab studentId={studentId} unitId={unitId} words={words} />
        ) : (
        <>
        {onScopeChange && (
          <div className="relative mb-3">
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="grid grid-cols-4 gap-2 min-w-[280px]">
                {SCOPES.map(s => (
                  <button key={s.id} onClick={() => onScopeChange(s.id)}
                    className={`rounded-2xl py-2.5 text-center btn-press transition-all ${
                      scope === s.id ? 'bg-orange-500 text-white card-shadow' : 'bg-white text-gray-500 border-2 border-gray-200'}`}>
                    <div className="text-lg">{s.emoji}</div>
                    <div className="text-[10px] font-black mt-0.5 leading-tight whitespace-nowrap">{s.label}</div>
                    <div className={`text-[10px] font-bold ${scope === s.id ? 'text-orange-100' : 'text-gray-400'}`}>{scopeCounts[s.id]}개</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent" />
          </div>
        )}

        {onModeChange && (
          <div className="relative mb-4">
            <div className="overflow-x-auto -mx-1 px-1">
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
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent" />
          </div>
        )}

        <div className="relative mb-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔍</span>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="단어 또는 뜻 검색..."
            className="w-full border-2 border-blue-200 rounded-2xl pl-12 pr-4 py-3 font-bold focus:outline-none focus:border-blue-400 transition-colors" />
          {query && <button onClick={() => setQuery('')} className="absolute right-1 top-1/2 -translate-y-1/2 p-3 text-gray-400 hover:text-gray-600 btn-press">✕</button>}
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
              <div className="text-5xl mb-3">{scope && scope !== 'all' ? '🎉' : '🔍'}</div>
              <p className="font-bold">
                {scope && scope !== 'all' ? '이 범위에는 단어가 없어요! 다른 범위를 골라보세요.' : '검색 결과가 없어요'}
              </p>
            </div>
          ) : filtered.map((w, i) => {
            const isCleared = cleared.includes(w.id)
            const status = wordStatus[w.dbId]
            return (
              <button key={w.id} onClick={() => onSelect(w)}
                className={`w-full flex items-center gap-4 rounded-2xl p-4 text-left btn-press transition-all card-shadow ${isCleared ? 'bg-green-50 border-2 border-green-200' : 'bg-white border-2 border-transparent hover:border-blue-200'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 ${isCleared ? 'bg-green-400 text-white' : 'bg-blue-100 text-blue-600'}`}>
                  {isCleared ? '✓' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-lg text-gray-800 break-words">{w.word}</p>
                  <p className="text-gray-500 text-sm break-words">{w.meaning}</p>
                </div>
                {status === 'known' && <span className="text-xs font-bold text-green-600 flex-shrink-0">✅ 알아요</span>}
                {status === 'unknown' && <span className="text-xs font-bold text-orange-500 flex-shrink-0">😅 복습필요</span>}
                <span className="text-gray-300 text-xl flex-shrink-0">›</span>
              </button>
            )
          })}
        </div>
        </>
        )}
      </div>
    </div>
  )
}
