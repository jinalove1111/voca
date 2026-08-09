import { useMemo, useState } from 'react'
import HeroReaction from './HeroReaction'
import { pickReaction, getReactionById } from '../utils/paulReactions'
import { startSession, submitAttempt, getSessionSummary, REVEAL_AFTER_ATTEMPTS } from '../utils/writing/writingSession'

// Writing Coach — Sentence Writing MVP (2026-08-09, docs/WRITING_COACH.md).
//
// 제품 원칙(운영자 지시):
//   · 학생이 한 문장을 쓰고 → 즉시 검사 → 오류 위치+짧은 힌트만(정답 대필
//     절대 금지) → 학생이 직접 수정 → 재검사. 3회 시도 후에도 남은 오류가
//     있을 때만 [정답 보기]가 열린다.
//   · 학생이 직접 고친 것을 인정한다("시제는 고쳤어요") — 자가 수정 비율이
//     이 기능의 핵심 KPI라서, 세션 상태 머신(writingSession.js, 순수 모듈)이
//     selfCorrectedCount를 결정론적으로 집계한다.
//
// 이 컴포넌트는 DB 접근 0 — 모든 판정은 로컬 순수 모듈(ruleChecks/
// writingSession)이 하고, 완료 시 onComplete(summary)로 결과만 위로 올린다.
// 저장(Supabase writing_submissions — 설계 SQL만 준비됨)은 호출부/후속 작업
// 몫이다. 이렇게 나눈 이유: 검사 로직을 하네스(testWritingCoach.mjs)로
// 검증 가능하게 유지 + SQL 미실행 상태에서도 기능이 완전히 동작(CLAUDE.md
// 규칙 9의 "코드가 먼저 배포돼도 무해" 원칙).
//
// 시각 언어는 기존 학생 화면 문법 그대로 — 흰 카드 rounded-3xl card-shadow,
// font-black, btn-press, 큰 터치 타겟(min-h-[44px]). 완료 축하는 기존
// HeroReaction 재사용(새 연출 시스템 없음).
export default function WritingCoach({ targetWords = [], onComplete, onBack }) {
  const [session, setSession] = useState(() => startSession({ targetWords }))
  const [draft, setDraft] = useState('')
  const [revealShown, setRevealShown] = useState(false)

  // 완료 축하 리액션 — 완료로 바뀌는 순간 한 번만 뽑아 고정(pickReaction은
  // 랜덤이라 리렌더마다 다시 부르면 캐릭터가 깜빡이며 바뀐다 — 기존
  // 화면들의 useMemo 고정 패턴 그대로).
  const reaction = useMemo(
    () => (session.completed ? (pickReaction('success') || getReactionById('happy')) : null),
    [session.completed]
  )

  const handleCheck = () => {
    setSession((prev) => submitAttempt(prev, draft))
  }

  const handleFinish = () => {
    // 요약만 위로 — { attemptCount, selfCorrectedCount, errorTypes, completed }
    onComplete?.(getSessionSummary(session))
  }

  const started = session.attemptCount > 0

  return (
    <div className="min-h-screen p-4 pb-40">
      {/* pb-40: 모바일 키보드가 올라와도 textarea/버튼이 가려지지 않도록
          하단 여백을 넉넉히 — 키보드 회피용 JS(visualViewport 등)는 이번
          범위에서 안 쓴다(단순 여백이 가장 안 깨지는 방식). */}
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="pt-2 flex items-center justify-between">
          <button
            onClick={onBack}
            className="py-3 px-2 -my-3 -mx-2 min-h-[44px] text-purple-400 text-sm font-bold btn-press hover:text-purple-600">
            ← 돌아가기
          </button>
          {started && !session.completed && (
            <span className="text-xs font-black text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full">
              {session.attemptCount}번째 시도
            </span>
          )}
        </div>

        {/* 과제 카드 — 오늘 단어 칩. 사용한 단어에는 ✓(usedTargetWords는
            세션이 매 검사마다 갱신 — whole-word 판정, ruleChecks.js). */}
        <div className="bg-white rounded-3xl card-shadow p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">✍️</span>
            <h2 className="font-black text-gray-800 text-lg">문장 만들기</h2>
          </div>
          <p className="text-sm font-bold text-gray-500">
            {targetWords.length > 0
              ? '오늘 배운 단어로 한 문장을 만들어보세요'
              : '영어로 한 문장을 만들어보세요'}
          </p>
          {targetWords.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {targetWords.map((w) => {
                const used = session.usedTargetWords.find((u) => u.word === w)?.used
                return (
                  <span
                    key={w}
                    className={`px-3 py-1.5 rounded-full text-sm font-black ${
                      used ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-600'
                    }`}>
                    {used ? '✓ ' : ''}{w}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {session.completed ? (
          /* ── 완료 화면 — 기존 HeroReaction 재사용(캐릭터+제목+메시지) ── */
          <div className="bg-white rounded-3xl card-shadow p-6">
            <HeroReaction
              image={reaction?.image}
              title="문장 완성!"
              message={reaction?.message}
              theme="success"
            />
            <div className="mt-3 bg-green-50 rounded-2xl p-4 text-center">
              <p className="text-sm font-black text-green-700">{session.currentAttempt}</p>
              <p className="text-xs font-bold text-green-600 mt-2">
                {session.attemptCount}번 만에 완성
                {session.selfCorrectedCount > 0 && ` · 스스로 고친 곳 ${session.selfCorrectedCount}개 👏`}
              </p>
            </div>
            <button
              onClick={handleFinish}
              className="w-full mt-4 min-h-[44px] bg-gradient-to-r from-green-400 to-emerald-500 hover:opacity-90 text-white font-black py-4 rounded-2xl btn-press text-lg">
              완료 →
            </button>
          </div>
        ) : (
          <>
            {/* ── 입력 + 검사 ── */}
            <div className="bg-white rounded-3xl card-shadow p-5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="예: I went to the park yesterday."
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                /* autoCapitalize/autoCorrect off: 모바일 키보드가 첫 글자를
                   자동 대문자로 바꾸면 대문자 규칙 학습 기회 자체가 사라진다
                   — 학생이 직접 쓰게 둔다. */
                className="w-full border-2 border-purple-200 focus:border-purple-400 outline-none rounded-2xl p-4 text-base font-bold text-gray-700 resize-none"
              />
              <button
                onClick={handleCheck}
                disabled={!draft.trim()}
                className={`w-full mt-3 min-h-[44px] font-black py-4 rounded-2xl btn-press text-lg text-white ${
                  draft.trim()
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90'
                    : 'bg-gray-300'
                }`}>
                🔍 검사하기
              </button>
            </div>

            {/* ── 힌트 카드 — 짧은 문구 최대 3개. 인정 문구(고쳤어요)는 초록,
                남은 힌트는 노랑 계열로 구분(색만으로도 "된 것/남은 것"이
                보이게). ── */}
            {started && session.feedback.length > 0 && (
              <div className="bg-white rounded-3xl card-shadow p-5 space-y-2">
                {session.feedback.map((line, i) => {
                  const isAck = line.endsWith('고쳤어요.')
                  return (
                    <div
                      key={i}
                      className={`rounded-2xl px-4 py-3 text-sm font-bold ${
                        isAck ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                      {isAck ? '✅ ' : '💡 '}{line}
                    </div>
                  )
                })}
                {!session.revealAllowed && session.remainingErrors.length > 0 && (
                  <p className="text-center text-xs text-gray-400 font-bold pt-1">
                    문장을 고쳐서 다시 검사해보세요
                    {session.attemptCount < REVEAL_AFTER_ATTEMPTS &&
                      ` (${REVEAL_AFTER_ATTEMPTS}번 시도하면 정답을 볼 수 있어요)`}
                  </p>
                )}
              </div>
            )}

            {/* ── 정답 보기 — 3회 시도 후 + 남은 오류가 있을 때만(상태 머신의
                revealAllowed 판정 그대로 — UI가 자체 판단하지 않는다). ── */}
            {session.revealAllowed && (
              <div className="bg-white rounded-3xl card-shadow p-5">
                {revealShown ? (
                  <div className="bg-blue-50 rounded-2xl p-4 text-center">
                    <p className="text-xs font-black text-blue-400 mb-1">정답 문장</p>
                    <p className="text-base font-black text-blue-700">{session.revealText}</p>
                    <p className="text-xs font-bold text-blue-500 mt-2">
                      따라 써서 완성해보세요!
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => setRevealShown(true)}
                    className="w-full min-h-[44px] bg-blue-100 hover:bg-blue-200 text-blue-700 font-black py-4 rounded-2xl btn-press">
                    👀 정답 보기
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
