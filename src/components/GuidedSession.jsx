import { useEffect, useMemo, useRef, useState } from 'react'
import WordDetail from './WordDetail'
import HeroReaction from './HeroReaction'
import { getReactionById, pickReaction } from '../utils/paulReactions'
import { planSessionSize, sessionProgressDisplay } from '../utils/dailyRitual'
import { isFeatureEnabled } from '../config/features'
import { fetchPassagesForUnit } from '../utils/readingApi'
import { fetchSentenceProgress } from '../utils/sentenceProgressApi'

// GuidedSession — "3분 데일리 리추얼" 가이드 학습 플로우 (v1, 2026-07-22)
//
// 얇은 오케스트레이터: 오늘의 단어 목록(classWords — 항상 반 전체, App의
// studyScope 필터와 무관)을 dailyRitual.js의 순수 플래너로 3~5분짜리
// 마이크로 세션으로 잘라 한 세션씩 진행하고, 세션마다 명확한 "완료 순간"
// (축하 카드 + 여기까지/계속 선택)을 준다. 단어 하나하나의 실제 학습은
// 전부 기존 WordDetail(mode="comprehensive")에 위임하고, 채점/진행도/별/
// XP도 전부 App이 내려주는 기존 콜백(useStudent 경로)이 담당한다 — 이
// 컴포넌트는 어떤 점수 로직도 재구현하지 않는다.
//
// 세션-로컬 상태만 가진다(스키마 변경 0, 새 localStorage 키 0):
// 현재 세션 슬라이스/위치, 오답 재시도 큐, 세션 카운터, 정답률·페이스
// 집계(다음 세션 크기 계산용). 세션 도중 언마운트되면 이 장부만 사라질
// 뿐, 단어별 진행(본 단어/퀴즈/발음/별/이어하기 위치)은 이미 기존 콜백이
// 저장한 뒤라 잃는 것이 없다(허용된 트레이드오프 — 승인된 스펙 그대로).
//
// 오답 재시도: 본 코스에서 퀴즈를 틀린 단어는 그 세션 끝에 정확히 1회씩
// 퀴즈만(mode="quiz") 다시 풀린다. 재시도에서 또 틀려도 다시 큐에 넣지
// 않고, addMission(레벨업 미션 — 장기 복습 시스템)도 여기서 부르지
// 않는다(그 시스템은 별도 유지 — 운영자 승인 결정).
// Lesson 5 여정 글루(2026-07-23) — studentId/unitId/onStartKeySentence는
// readingStudentUI 플래그(기본 false)가 켜졌을 때만 의미가 있다: 세션 완료
// 카드에서 "이 유닛의 아직 마스터 안 한 핵심 문장"이 있으면 "⭐ 오늘의
// 핵심 문장 도전!" 버튼을 띄우고, 탭하면 App이 SentenceLearningFlow로
// 라우팅한다. 플래그가 꺼져 있으면 조회 자체를 안 하며(fetch 0회) 완료
// 카드는 기존과 픽셀 단위로 동일하다.
export default function GuidedSession({
  classWords,
  resumeIndex,
  studentId,
  unitId,
  onStartKeySentence,
  spellingSettings,
  mixedDirections,
  spellingCombo,
  spellingReviewQueue,
  wordStatus,
  onSpellingAnswer,
  onMarkViewed,
  onMarkExampleHeard,
  onMarkPronunciationOk,
  onMarkQuizSolved,
  onQuizAnswer,
  onPronunciationAttempt,
  onWordKnown,
  onWordUnknown,
  onSetLastWordIndex,
  onDone,
}) {
  const totalWords = classWords.length

  // 이어하기 위치는 마운트 시점에 딱 한 번 읽는다 — 아래에서 진행할 때마다
  // onSetLastWordIndex로 저장하면 App의 resumeIndex prop이 계속 갱신되는데,
  // 그 값이 세션 계획을 중간에 흔들면 안 되기 때문(세션 슬라이스는 계획
  // 시점 고정).
  const [startIndex] = useState(() => {
    const idx = Number.isInteger(resumeIndex) && resumeIndex > 0 ? resumeIndex : 0
    return Math.min(idx, totalWords)
  })

  // 현재 세션 = classWords의 연속 슬라이스 [startAbs, startAbs+words.length).
  // 다음 세션은 항상 직전 세션 끝에서 시작 — dailyRitual.js 불변 조건 1
  // (합집합이 전체를 정확히 덮음)을 구조적으로 보장하는 방식.
  const [session, setSession] = useState(() => {
    const size = planSessionSize({
      totalWords,
      remainingWords: totalWords - startIndex,
      recentAccuracy: null,
      recentPaceMsPerWord: null,
    })
    return { startAbs: startIndex, words: classWords.slice(startIndex, startIndex + size) }
  })
  const [sessionsCompleted, setSessionsCompleted] = useState(0)
  // 'main'(본 코스) → 'retry'(오답 있으면) → 'done'(세션 완료 카드).
  // 단어가 아예 없거나 이어하기 위치가 끝을 지났으면 처음부터 'done'
  // (아래 렌더에서 "전부 완료" 카드로 표시).
  const [phase, setPhase] = useState(() => (totalWords === 0 || startIndex >= totalWords ? 'done' : 'main'))
  const [pos, setPos] = useState(0) // 현재 phase의 단어 목록 안 위치
  const [retryIds, setRetryIds] = useState([]) // 본 코스 퀴즈 오답 wordId(중복 없음)
  // 이번 세션 성적 집계(다음 세션 크기 계산용) — 렌더에 안 쓰므로 ref.
  const statsRef = useRef({ answered: 0, correct: 0, startedAt: Date.now() })
  // 방금 끝난 세션의 측정값 — 완료 카드 표시 + planSessionSize 입력.
  const [lastStats, setLastStats] = useState(null)

  // ── 오늘의 핵심 문장 오퍼(readingStudentUI 플래그 게이팅) ──
  // 완료 카드가 처음 뜰 때 1회만 지연 조회(fire-safe — 두 fetch 모두 절대
  // 던지지 않는 계약이고, 실패/빈 결과면 버튼이 안 뜰 뿐 카드는 그대로).
  // 아직 마스터하지 않은 첫 핵심 문장을 찾으면 버튼을 띄운다.
  const [keyOffer, setKeyOffer] = useState(null) // { sentence, passageTitle, progress }
  const keyFetchedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'done') return undefined
    if (!isFeatureEnabled('readingStudentUI')) return undefined // 플래그 OFF = 조회 0회, 화면 변화 0
    if (!onStartKeySentence || !studentId || !unitId) return undefined
    if (keyFetchedRef.current) return undefined // 세션당 여러 완료 카드가 떠도 조회는 1회
    keyFetchedRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        const passages = await fetchPassagesForUnit(unitId)
        const candidates = passages.flatMap((p) =>
          p.sentences.filter((s) => s.isKeySentence).map((s) => ({ sentence: s, passageTitle: p.title })))
        if (candidates.length === 0 || cancelled) return
        const prog = await fetchSentenceProgress(studentId, candidates.map((c) => c.sentence.id))
        if (cancelled) return
        const target = candidates.find((c) => !prog[c.sentence.id]?.masteredAt)
        if (target) setKeyOffer({ ...target, progress: prog[target.sentence.id] || null })
      } catch { /* fire-safe — 오퍼 없이 기존 완료 카드 그대로 */ }
    })()
    return () => { cancelled = true }
  }, [phase, studentId, unitId, onStartKeySentence])

  const sessionEndAbs = session.startAbs + session.words.length
  // 재시도 단어는 (실시간 갱신될 수 있는 classWords가 아니라) 세션 계획
  // 시점에 고정된 session.words에서 찾는다 — retryIds는 항상 이 슬라이스의
  // 부분집합이므로 조회가 절대 실패하지 않는다(관리자가 세션 도중 단어를
  // 삭제해 classWords가 갱신돼도 이번 세션은 계획대로 끝까지 진행).
  const retryWords = useMemo(
    () => retryIds.map((id) => session.words.find((w) => w.id === id)).filter(Boolean),
    [retryIds, session.words]
  )

  // 진행 헤더 값 — M(오늘 완료 단어)은 이어하기 오프셋을 포함한 "오늘
  // 목록에서의 위치"(예: 60개 중 20번째부터 재개해 5개 하면 25/60).
  // 재시도 단계는 이미 본 코스를 마친 단어들이므로 세션 끝 위치로 고정.
  const wordsCompletedAbs = phase === 'main' ? session.startAbs + pos : sessionEndAbs
  const display = sessionProgressDisplay({
    sessionsCompleted,
    wordsCompleted: wordsCompletedAbs,
    totalWords,
    plannedSessionSize: Math.max(1, session.words.length),
  })

  const finishSession = () => {
    const s = statsRef.current
    const wordCount = session.words.length
    setLastStats({
      accuracy: s.answered > 0 ? s.correct / s.answered : null,
      paceMsPerWord: wordCount > 0 ? (Date.now() - s.startedAt) / wordCount : null,
      wordCount,
    })
    setSessionsCompleted((n) => n + 1)
    setPhase('done')
  }

  // 본 코스에서 한 단어 완료(WordDetail의 onNext) — 다음 단어로, 마지막
  // 단어였으면 재시도 또는 완료 카드로. 이어하기 위치는 기존 wordDetail
  // 흐름(handleNextWord)과 동일하게 "지금 시작하는 단어의 인덱스"로 저장
  // — 세션이 끝나면 세션 끝 인덱스(= 다음에 이어할 위치)로 저장한다.
  const advanceMain = () => {
    const nextPos = pos + 1
    if (nextPos < session.words.length) {
      setPos(nextPos)
      onSetLastWordIndex?.(session.startAbs + nextPos)
      return
    }
    onSetLastWordIndex?.(sessionEndAbs)
    if (retryIds.length > 0) {
      setPhase('retry')
      setPos(0)
    } else {
      finishSession()
    }
  }

  const advanceRetry = () => {
    const nextPos = pos + 1
    if (nextPos < retryWords.length) setPos(nextPos)
    else finishSession()
  }

  // onQuizAnswer 래핑 — 실제 기록(useStudent.recordQuizAnswer)은 항상
  // 그대로 부르고, 그 위에 ①세션 정답률 집계 ②본 코스 오답만 재시도 큐
  // 적재(재시도 중 또 틀린 단어는 재적재 안 함)를 얹는다.
  const handleQuizAnswer = (wordId, correct) => {
    onQuizAnswer?.(wordId, correct)
    statsRef.current.answered += 1
    if (correct) statsRef.current.correct += 1
    if (!correct && phase === 'main') {
      setRetryIds((prev) => (prev.includes(wordId) ? prev : [...prev, wordId]))
    }
  }

  const startNextSession = () => {
    const remaining = totalWords - sessionEndAbs
    if (remaining <= 0) return
    const size = planSessionSize({
      totalWords,
      remainingWords: remaining,
      recentAccuracy: lastStats?.accuracy ?? null,
      recentPaceMsPerWord: lastStats?.paceMsPerWord ?? null,
    })
    setSession({ startAbs: sessionEndAbs, words: classWords.slice(sessionEndAbs, sessionEndAbs + size) })
    setPos(0)
    setRetryIds([])
    statsRef.current = { answered: 0, correct: 0, startedAt: Date.now() }
    setPhase('main')
    onSetLastWordIndex?.(sessionEndAbs)
  }

  // ── 단어가 아예 없는 반 — 크래시 없이 친절한 안내만 ──
  if (totalWords === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="bg-white rounded-3xl card-shadow p-8 max-w-sm w-full text-center animate-slide-up">
          <div className="text-6xl mb-3">📭</div>
          <h1 className="text-2xl font-black text-gray-800 mb-1">단어가 없어요</h1>
          <p className="text-gray-500 text-sm mb-6">선생님이 단어를 추가하면 오늘의 학습을 시작할 수 있어요.</p>
          <button onClick={onDone}
            className="w-full bg-purple-500 hover:bg-purple-600 text-white font-black py-4 rounded-2xl btn-press text-lg">
            🏠 홈으로
          </button>
        </div>
      </div>
    )
  }

  // ── 세션 완료 / 오늘 전부 완료 카드 ──
  if (phase === 'done') {
    const allDone = sessionEndAbs >= totalWords
    const paul = allDone ? getReactionById('levelup') : pickReaction('success')
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-indigo-500 to-purple-600">
        <div className="bg-white rounded-3xl card-shadow p-8 max-w-sm w-full text-center animate-slide-up space-y-4">
          <HeroReaction
            image={paul?.image}
            title={allDone ? '오늘 단어 전부 완료! 🎉' : `세션 ${sessionsCompleted} 완료! 🎉`}
            message={allDone
              ? '오늘 배정된 단어를 전부 끝냈어요. 정말 대단해요!'
              : `이번 세션에서 단어 ${lastStats?.wordCount ?? session.words.length}개를 공부했어요!`}
            theme={allDone ? 'levelup' : 'success'}
            size="lg"
          />
          <p className="font-black text-3xl text-gray-800">
            오늘 {display.wordsCompleted} <span className="text-gray-300">/</span> {display.totalWords} 단어
          </p>
          <div className="space-y-3">
            {/* 오늘의 핵심 문장 오퍼 — readingStudentUI 플래그 ON + 아직
                마스터 안 한 핵심 문장이 있을 때만(위 effect). 이 여정의
                주 행동이라 기존 두 버튼보다 위에, 가장 눈에 띄는 스타일로. */}
            {keyOffer && (
              <button onClick={() => onStartKeySentence?.(keyOffer)}
                className="w-full bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white font-black py-4 rounded-2xl btn-press text-lg animate-fade-in">
                ⭐ 오늘의 핵심 문장 도전!
              </button>
            )}
            <button onClick={onDone}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-black py-4 rounded-2xl btn-press text-lg">
              🏠 오늘은 여기까지
            </button>
            {!allDone && (
              <button onClick={startNextSession}
                className="w-full border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-black py-4 rounded-2xl btn-press text-lg">
                ▶ 다음 세션 계속하기
              </button>
            )}
          </div>
          {!allDone && (
            <p className="text-xs text-gray-400">여기서 멈춰도 오늘 공부한 건 전부 저장돼 있어요!</p>
          )}
        </div>
      </div>
    )
  }

  // ── 학습 중(본 코스/재시도) — 항상 보이는 진행 헤더 + WordDetail ──
  const isRetry = phase === 'retry'
  const word = isRetry ? retryWords[pos] : session.words[pos]
  // 도달 불가능한 방어선(pos는 항상 목록 길이 안에서만 증가, retryWords는
  // session.words의 부분집합) — 만에 하나를 위해 렌더 중 setState 없이
  // 홈으로 나가는 안내만 렌더.
  if (!word) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-pink-50">
        <button onClick={onDone}
          className="bg-purple-500 hover:bg-purple-600 text-white font-black py-4 px-8 rounded-2xl btn-press text-lg">
          🏠 홈으로
        </button>
      </div>
    )
  }
  // mixed 쓰기 방향은 classWords 전체 기준 절대 인덱스로 조회(App의
  // guidedMixedDirections가 classWords 길이로 배정됨).
  const absIdx = isRetry ? classWords.findIndex((w) => w.id === word.id) : session.startAbs + pos
  const directionOverride = mixedDirections ? mixedDirections[absIdx] || 'kr2en' : null

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b-2 border-purple-100 px-4 py-2.5">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2 text-sm font-black">
          <span className="text-purple-600 whitespace-nowrap">📖 세션 {display.sessionNumber} / {display.sessionCount}</span>
          {isRetry && <span className="text-orange-500 text-xs whitespace-nowrap">🔁 틀린 단어 다시 풀기</span>}
          <span className="text-gray-500 whitespace-nowrap">오늘 {display.wordsCompleted} / {display.totalWords} 단어</span>
        </div>
      </div>
      <WordDetail
        // phase/pos 조합 키로 단어 슬롯마다 완전 리마운트 — 본 코스 마지막
        // 단어가 곧바로 재시도 첫 단어로 이어지는 경우 word.id가 안 바뀌어
        // WordDetail 내부 step이 리셋되지 않는 문제를 구조적으로 차단.
        key={`${session.startAbs}-${phase}-${pos}`}
        word={word}
        classWords={classWords}
        mode={isRetry ? 'quiz' : 'comprehensive'}
        spellingSettings={spellingSettings}
        onSpellingAnswer={onSpellingAnswer}
        spellingDirectionOverride={directionOverride}
        spellingCombo={spellingCombo}
        spellingReviewQueue={spellingReviewQueue}
        sessionProgress={null}
        onBack={onDone}
        onNext={isRetry ? advanceRetry : advanceMain}
        onMarkViewed={onMarkViewed}
        onMarkExampleHeard={onMarkExampleHeard}
        onMarkPronunciationOk={onMarkPronunciationOk}
        onMarkQuizSolved={onMarkQuizSolved}
        onQuizAnswer={handleQuizAnswer}
        onPronunciationAttempt={onPronunciationAttempt}
        wordStatus={wordStatus}
        onWordKnown={onWordKnown}
        onWordUnknown={onWordUnknown}
      />
    </div>
  )
}
