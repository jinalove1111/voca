import { useEffect, useMemo, useState } from 'react'
import { speak } from '../utils/speech'
import { fetchPassagesForUnit } from '../utils/readingApi'
import { fetchSentenceProgress } from '../utils/sentenceProgressApi'
import { IMPORTANCE_LABELS, normalizeAnswer } from '../utils/sentenceLearning'
import SentenceLearningFlow from './SentenceLearningFlow'

// SentencesTab — Sentence Learning(v3.4) Phase B: 유닛의 읽기 지문/문장
// 목록(WordBrowser [문장] 탭 콘텐츠). readingStudentUI 플래그(기본 false)
// 뒤에서만 렌더된다 — 게이팅은 WordBrowser가 담당(플래그 꺼짐 = 이
// 컴포넌트는 마운트 자체가 안 됨, 프로덕션 화면 변화 0).
//
// 데이터: fetchPassagesForUnit(절대 안 던짐, [] 폴백 — 테이블/컬럼
// 미실행이어도 안전) + fetchSentenceProgress(절대 안 던짐, {} 폴백 =
// "처음부터"). 학생 식별은 studentId(UUID) — 이름 미사용(규칙 4).
//
// 화면 구성(인지 과부하 금지 — 지문 하나만 펼치는 아코디언, 관리자
// 디렉터리 관례): 지문별 제목/핵심 문장 수/완료 수 헤더 → 펼치면 문장
// 카드(★중요도+라벨, 영어, [뜻 보기] 토글 뒤 한국어, [듣기], 상태 칩).
//   - 핵심 문장만 [학습 시작]/[이어서]/[다시 도전] → SentenceLearningFlow
//     (핵심 문장 1개 풀스크린 6단계). 비핵심 문장은 보기/듣기 전용 —
//     엔진 nextStage가 null을 반환하는 사실과 짝(단계 진입 자체가 없음).
//   - 문장 안에 이 유닛 단어가 있으면 "오늘 배운 단어가 들어 있어요" 칩.
//
// TTS 단일 재생: 소리는 utils/speech.js speak()만 사용 — speak() 내부
// claimTtsCall이 시작 시 항상 기존 재생(mp3/TTS 모두)을 먼저 중단한다.

// sentenceProgressApi 필드(DB형) → 이 화면의 camelCase 진행도 형태.
// SentenceLearningFlow가 onClose로 돌려주는 최신 행을 목록에 반영할 때 사용
// (재조회 없이 결정론 병합 — 오프라인/upsert 스킵 상황에서도 화면 일관).
function rowToCamel(r) {
  return {
    currentStage: r?.current_stage || 'read',
    completedStages: Array.isArray(r?.completed_stages) ? r.completed_stages : [],
    attemptCount: Number(r?.attempt_count) || 0,
    correctCount: Number(r?.correct_count) || 0,
    wrongCount: Number(r?.wrong_count) || 0,
    masteredAt: r?.mastered_at || null,
    lastPracticedAt: r?.last_practiced_at || null,
  }
}

export default function SentencesTab({ studentId, unitId, words = [] }) {
  const [passages, setPassages] = useState([])
  const [progress, setProgress] = useState({}) // { [sentenceId]: camelCase 진행도 }
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null) // 아코디언 — 지문 하나만 펼침
  const [shownKorean, setShownKorean] = useState(() => new Set()) // [뜻 보기] 토글된 문장 id
  const [active, setActive] = useState(null) // 학습 중인 핵심 문장(플로우 오버레이)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      // 두 fetch 모두 절대 던지지 않는 계약(readingApi/sentenceProgressApi)
      // — 여기서는 순서대로 부르기만 한다.
      const list = await fetchPassagesForUnit(unitId)
      if (cancelled) return
      setPassages(list)
      setExpandedId(list[0]?.id ?? null)
      const ids = list.flatMap((p) => p.sentences.map((s) => s.id))
      const prog = await fetchSentenceProgress(studentId, ids)
      if (cancelled) return
      setProgress(prog)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [studentId, unitId])

  // 유닛 단어 원문 목록(엔진 pickBlank 입력용 — 정규화는 엔진이 한다)과,
  // "오늘 배운 단어" 칩 판정용 정규화 집합.
  const unitWordSlugs = useMemo(
    () => words.map((w) => w?.word).filter(Boolean),
    [words],
  )
  const slugSet = useMemo(
    () => new Set(unitWordSlugs.map((w) => normalizeAnswer(w)).filter(Boolean)),
    [unitWordSlugs],
  )
  const containsUnitWord = (english) =>
    String(english || '').split(/\s+/).some((tok) => {
      const n = normalizeAnswer(tok)
      return n && slugSet.has(n)
    })

  const listen = (text) => speak(String(text || ''), { source: 'sentence-listen' })

  const toggleKorean = (id) => {
    setShownKorean((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 플로우 종료 — 최신 진행도 행(DB형)을 목록 상태에 병합.
  const handleFlowClose = (latestRow) => {
    if (active?.id && latestRow) {
      setProgress((prev) => ({ ...prev, [active.id]: rowToCamel(latestRow) }))
    }
    setActive(null)
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-400 animate-fade-in">
        <div className="text-4xl mb-3">📜</div>
        <p className="font-bold">문장을 불러오는 중...</p>
      </div>
    )
  }

  const totalSentences = passages.reduce((n, p) => n + p.sentences.length, 0)
  if (passages.length === 0 || totalSentences === 0) {
    // 정직한 빈 상태 — 지문 미입력/유닛 미해석/마이그레이션 전 모두 여기로
    // 안전 폴백(fetch가 [] 반환).
    return (
      <div className="text-center py-12 text-gray-400 animate-fade-in">
        <div className="text-5xl mb-3">📭</div>
        <p className="font-bold">이 유닛에는 아직 문장이 없어요</p>
        <p className="text-xs mt-1">선생님이 지문을 추가하면 여기서 문장을 공부할 수 있어요.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {passages.map((p) => {
        const keySentences = p.sentences.filter((s) => s.isKeySentence)
        const masteredCount = keySentences.filter((s) => progress[s.id]?.masteredAt).length
        const expanded = expandedId === p.id
        return (
          <div key={p.id} className="bg-white rounded-2xl card-shadow overflow-hidden">
            {/* 지문 헤더(아코디언 토글) */}
            <button onClick={() => setExpandedId(expanded ? null : p.id)}
              className="w-full min-h-[44px] flex items-center justify-between gap-3 p-4 text-left btn-press">
              <div className="min-w-0">
                <p className="font-black text-gray-800 break-words">📜 {p.title}</p>
                <p className="text-xs text-gray-400 font-bold mt-0.5">
                  핵심 문장 {keySentences.length}개
                  {keySentences.length > 0 && ` · 완료 ${masteredCount}/${keySentences.length}`}
                </p>
              </div>
              <span className="text-gray-300 flex-shrink-0">{expanded ? '▲' : '▼'}</span>
            </button>

            {expanded && (
              <div className="px-3 pb-3 space-y-2">
                {p.sentences.map((s) => {
                  const level = Math.min(5, Math.max(1, Number(s.importanceLevel) || 1))
                  const prog = progress[s.id]
                  const started = !!prog && (prog.attemptCount > 0 || (prog.completedStages || []).length > 0)
                  const mastered = !!prog?.masteredAt
                  const startLabel = mastered ? '🔁 다시 도전' : started ? '▶ 이어서' : '▶ 학습 시작'
                  const koreanShown = shownKorean.has(s.id)
                  return (
                    <div key={s.id} className="bg-gray-50 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-yellow-400 text-sm leading-none">{'★'.repeat(level)}</span>
                        <span className="text-[10px] font-bold text-gray-400">{IMPORTANCE_LABELS[level]}</span>
                        {s.isKeySentence && (
                          <span className="text-[10px] font-black text-purple-500 bg-purple-100 rounded-full px-2 py-0.5">핵심 문장</span>
                        )}
                        {mastered && (
                          <span className="text-[10px] font-black text-green-600 bg-green-100 rounded-full px-2 py-0.5">✓ 완료</span>
                        )}
                        {!mastered && started && s.isKeySentence && (
                          <span className="text-[10px] font-black text-blue-500 bg-blue-100 rounded-full px-2 py-0.5">학습 중</span>
                        )}
                        {containsUnitWord(s.english) && (
                          <span className="text-[10px] font-bold text-indigo-500 bg-indigo-100 rounded-full px-2 py-0.5">오늘 배운 단어가 들어 있어요</span>
                        )}
                      </div>
                      <p className="font-black text-base text-gray-800 break-words leading-relaxed">{s.english}</p>
                      {koreanShown && (
                        <p className="text-gray-500 text-sm break-words">{s.korean || '(뜻이 아직 입력되지 않았어요)'}</p>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => listen(s.english)}
                          className="min-h-[44px] px-3 py-2 rounded-xl font-black text-sm bg-blue-50 text-blue-600 btn-press">
                          🔊 듣기
                        </button>
                        <button onClick={() => toggleKorean(s.id)}
                          className="min-h-[44px] px-3 py-2 rounded-xl font-black text-sm bg-white border-2 border-gray-200 text-gray-500 btn-press">
                          {koreanShown ? '뜻 숨기기' : '👀 뜻 보기'}
                        </button>
                        {/* 비핵심 문장은 보기/듣기 전용 — 학습 버튼 자체가 없다 */}
                        {s.isKeySentence && (
                          <button onClick={() => setActive(s)}
                            className="min-h-[44px] px-4 py-2 rounded-xl font-black text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white btn-press">
                            {startLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* 핵심 문장 학습 플로우 — 풀스크린 오버레이(fixed) */}
      {active && (
        <SentenceLearningFlow
          studentId={studentId}
          sentence={active}
          unitWordSlugs={unitWordSlugs}
          initialProgress={progress[active.id] || null}
          onClose={handleFlowClose}
        />
      )}
    </div>
  )
}
