import { useEffect, useMemo, useState } from 'react'
import { speak } from '../utils/speech'
import { getReactionById, pickReaction } from '../utils/paulReactions'
import HeroReaction from './HeroReaction'
import {
  STAGES, chunksOf, pickBlank, shuffleDeterministic, checkChunkOrder,
  checkBlank, adaptiveState, encouragementFor, applyStageResult, nextStage,
} from '../utils/sentenceLearning'
import { upsertSentenceProgress } from '../utils/sentenceProgressApi'

// SentenceLearningFlow — Sentence Learning(v3.4) Phase B: 핵심 문장 1개를
// 6단계(read→chunk→puzzle→one_blank→ko_to_en→mastered)로 학습하는 전체
// 화면 플로우(GuidedSession의 풀스크린 인계 패턴 — fixed 오버레이).
//
// 이 컴포넌트는 학습 로직을 하나도 재구현하지 않는다 — 단계 전이/채점/
// 셔플/빈칸/적응 지원/진행도 리듀서는 전부 sentenceLearning.js(Phase A
// 순수 엔진)를 소비만 하고, 저장은 sentenceProgressApi(테이블 부재 시
// 조용히 스킵 — 학습 흐름 불차단)에 위임한다.
//
// 아동 UX 원칙(운영자 승인 스펙):
//   - 한 화면 = 한 활동. 화면당 컨트롤/텍스트 최소 — "이 한 문장만 하면
//     돼"라는 프레임(헤더의 "지금 문장 하나만 마스터하면 돼요!").
//   - 단계 점(dots) 6개를 상단에 항상 표시, 현재 단계 강조.
//   - 매 단계 통과마다 짧은 긍정 피드백(약 2초, 기존 Paul 성공 리액션
//     이미지 재사용 — 새 리소스 없음). 오답은 벌점/질책 없이 ENCOURAGE
//     문구 + 적응 지원(2회 틀리면 전체 문장+음성, 3회 틀리면 답 공개 후
//     한 번 더 직접 해보기)만.
//   - 큰 터치 타겟(주요/조각 버튼 min-h 44px+), 문장 본문 text-2xl.
//   - 보상/재화/게임화 없음 — mastered는 축하 카드 하나로 끝(기존 스타일).
//
// TTS 단일 재생 규칙: 소리는 오직 utils/speech.js speak()로만 낸다 —
// speak()는 내부 claimTtsCall이 시작 시 모든 백엔드(mp3/TTS)를 먼저
// 중단하므로 "항상 현재 재생을 취소한 뒤 재생"이 구조적으로 보장된다.
// 언마운트 시에는 진행 중 발화만 취소한다(새 오디오 서브시스템 없음).
//
// 학생 식별은 studentId(students.id UUID) prop — 이름 문자열 미사용
// (CLAUDE.md 규칙 4).

const STAGE_TITLES = {
  read: '문장 읽기',
  chunk: '끊어 읽기',
  puzzle: '문장 퍼즐',
  one_blank: '빈칸 채우기',
  ko_to_en: '영어로 만들기',
  mastered: '마스터 완료',
}

// 단계 진입 시 긍정 피드백 문구 — "방금 잘했다 + 다음에 뭘 하는지"를 한
// 줄로. mastered는 전용 축하 화면이 있어 여기 없음.
const STAGE_PRAISE = {
  chunk: '좋아! 이번엔 조각으로 나눠 읽어보자',
  puzzle: '잘했어! 이제 퍼즐로 맞춰보자',
  one_blank: '완벽해! 이번엔 빈칸을 채워보자',
  ko_to_en: '좋아! 마지막 단계야 — 영어로 만들어보자',
}

// fetchSentenceProgress의 camelCase 결과 → 엔진 리듀서(applyStageResult)가
// 받는 DB 필드 형태. 진행도 없음(null)이면 처음부터.
function toRow(p) {
  return {
    current_stage: p?.currentStage && STAGES.includes(p.currentStage) ? p.currentStage : 'read',
    completed_stages: Array.isArray(p?.completedStages) ? p.completedStages : [],
    attempt_count: Number(p?.attemptCount) || 0,
    correct_count: Number(p?.correctCount) || 0,
    wrong_count: Number(p?.wrongCount) || 0,
    mastered_at: p?.masteredAt || null,
    last_practiced_at: p?.lastPracticedAt || null,
  }
}

// 청크 순서 맞추기 상호작용(3단계 퍼즐/5단계 한→영 공용) — 탭해서 답안에
// 추가, 답안 조각을 탭하면 제거(드래그 없음 — 버튼이라 키보드 접근 가능).
// selected는 shuffled 배열의 인덱스 목록이라 같은 글자 조각이 두 번
// 나와도 안전하다. 채점(checkChunkOrder)만 하고 적응 지원 표시는 부모
// 책임 — 이 컴포넌트는 상호작용만 안다.
function ChunkPuzzle({ chunks, seed, onCorrect, onWrong, onListen }) {
  const shuffled = useMemo(() => shuffleDeterministic(chunks, seed), [chunks, seed])
  const [selected, setSelected] = useState([])
  const complete = selected.length === chunks.length

  const submit = () => {
    const texts = selected.map((i) => shuffled[i])
    setSelected([]) // 정답/오답 모두 새 시도는 빈 판에서 — 벌점 없음
    if (checkChunkOrder(texts, chunks)) onCorrect()
    else onWrong()
  }

  return (
    <div className="space-y-3">
      <div className="min-h-[64px] bg-purple-50 border-2 border-dashed border-purple-200 rounded-2xl p-2 flex flex-wrap gap-2 items-center">
        {selected.length === 0 && (
          <p className="text-xs font-bold text-purple-300 px-2">아래 조각을 순서대로 눌러보자!</p>
        )}
        {selected.map((i) => (
          <button key={i} onClick={() => setSelected(selected.filter((x) => x !== i))}
            className="min-h-[44px] px-3 py-2 bg-purple-500 text-white font-black rounded-xl btn-press text-base break-words">
            {shuffled[i]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {shuffled.map((c, i) => {
          const used = selected.includes(i)
          return (
            <button key={i} disabled={used}
              onClick={() => { if (!used) setSelected([...selected, i]) }}
              className={`min-h-[44px] px-3 py-2 rounded-xl font-black text-base btn-press border-2 transition-all ${
                used ? 'bg-gray-100 text-gray-300 border-gray-100' : 'bg-white text-gray-800 border-purple-200'}`}>
              {c}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <button onClick={onListen}
          className="min-h-[44px] flex-1 py-3 rounded-2xl font-black bg-blue-50 text-blue-600 btn-press">
          🔊 듣기
        </button>
        <button onClick={() => setSelected([])}
          className="min-h-[44px] flex-1 py-3 rounded-2xl font-black bg-gray-100 text-gray-500 btn-press">
          ↩ 처음부터
        </button>
      </div>
      <button onClick={submit} disabled={!complete}
        className={`w-full min-h-[52px] py-4 rounded-2xl font-black text-lg btn-press transition-all ${
          complete ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : 'bg-gray-100 text-gray-300'}`}>
        ✓ 확인
      </button>
    </div>
  )
}

export default function SentenceLearningFlow({ studentId, sentence, unitWordSlugs = [], initialProgress = null, onClose }) {
  // 진행도 행(DB 필드 형태) — 매 시도마다 applyStageResult(순수)로 갱신,
  // fire-safe upsert. 이어하기: 마운트 시 current_stage에서 재개.
  const [row, setRow] = useState(() => toRow(initialProgress))
  const [stage, setStage] = useState(() => {
    const s = toRow(initialProgress).current_stage
    // 이미 mastered인 문장을 다시 열면 처음부터 복습(mastered_at은 리듀서가
    // 최초 1회만 기록하므로 목록의 ✓ 표시는 유지된다).
    return s === 'mastered' ? 'read' : s
  })
  const [wrongCount, setWrongCount] = useState(0) // 현재 단계의 연속 오답 수(단계 넘어가면 0)
  const [showKorean, setShowKorean] = useState(false)
  const [revealed, setRevealed] = useState(1) // chunk 단계: 보인 조각 수
  const [blankInput, setBlankInput] = useState('')
  const [encourage, setEncourage] = useState(null) // 오답 격려 문구(ENCOURAGE)
  const [praise, setPraise] = useState(null) // 단계 통과 긍정 피드백 { image, msg }

  const chunks = useMemo(() => chunksOf(sentence), [sentence])
  const blank = useMemo(
    () => pickBlank(sentence?.english, unitWordSlugs),
    [sentence?.english, unitWordSlugs],
  )
  const adaptive = adaptiveState(wrongCount)
  const isKey = sentence?.isKeySentence === true

  // 단계 통과 피드백은 약 2초 뒤 스스로 사라진다(다음 활동에 집중).
  useEffect(() => {
    if (!praise) return undefined
    const t = setTimeout(() => setPraise(null), 2000)
    return () => clearTimeout(t)
  }, [praise])

  // 언마운트 시 진행 중 발화만 취소 — speech.js safeCancelSpeech와 같은
  // 조건(뭔가 재생/대기 중일 때만 cancel — Android Chrome 무음 버그 회피).
  useEffect(() => () => {
    try {
      const s = window.speechSynthesis
      if (s && (s.speaking || s.pending)) s.cancel()
    } catch { /* no-op */ }
  }, [])

  const listen = () => speak(String(sentence?.english || ''), { source: 'sentence-flow' })

  // 시도 1회 기록 — 리듀서(순수)가 다음 행을 계산하고, 저장 실패는 학습
  // 흐름을 절대 막지 않는다(sentenceProgressApi가 테이블 부재는 스킵,
  // 그 외 실패도 여기서 경고만).
  const record = (stageName, correct) => {
    const next = applyStageResult(row, stageName, correct)
    setRow(next)
    if (studentId && sentence?.id) {
      Promise.resolve(upsertSentenceProgress(studentId, sentence.id, next))
        .catch((e) => console.warn('[SentenceLearningFlow] 진행도 저장 실패(학습은 계속):', e?.message || e))
    }
    return next
  }

  // 단계 통과 → 다음 단계로. 비핵심 문장은 엔진(nextStage)이 null을
  // 반환하므로 구조적으로 어떤 단계에도 진입/전진하지 않는다.
  const advance = (stageName) => {
    record(stageName, true)
    const adv = nextStage(stageName, isKey)
    if (!adv) return
    if (adv !== 'mastered') {
      setPraise({
        image: pickReaction('success')?.image || null,
        msg: STAGE_PRAISE[adv] || '좋아! 다음으로 가보자',
      })
    }
    setStage(adv)
    setWrongCount(0)
    setEncourage(null)
    setShowKorean(false)
    setRevealed(1)
    setBlankInput('')
  }

  // 오답 — 벌점 없음. ENCOURAGE 격려 + 적응 지원(2회째부터는 전체 문장을
  // 보여주며 음성도 다시 들려준다 — 버튼 탭 핸들러 안이라 iOS 제스처
  // 컨텍스트 유지).
  const wrong = (stageName) => {
    record(stageName, false)
    const n = wrongCount + 1
    setWrongCount(n)
    setEncourage(encouragementFor(n))
    if (adaptiveState(n).showFullSentence) listen()
  }

  const submitBlank = () => {
    if (!blank || !blankInput.trim()) return
    const ok = checkBlank(blankInput, blank.answer)
    setBlankInput('')
    if (ok) advance('one_blank')
    else wrong('one_blank')
  }

  if (!sentence) return null

  const curIdx = STAGES.indexOf(stage)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-br from-purple-50 to-pink-50">
      <div className="min-h-full p-4 pb-8">
        <div className="max-w-lg mx-auto">
          {/* 헤더: 뒤로 + 단계 점 6개(항상 표시, 현재 단계 강조) */}
          <div className="flex items-center gap-2 mb-1 pt-2">
            <button onClick={() => onClose?.(row)}
              className="py-3 px-2 -my-3 -mx-2 text-purple-600 font-bold btn-press whitespace-nowrap">
              ← 목록
            </button>
            <div className="flex-1 flex items-center justify-center gap-1.5">
              {STAGES.map((s, i) => (
                <span key={s}
                  className={`rounded-full transition-all ${
                    s === stage ? 'w-3.5 h-3.5 bg-pink-500'
                      : i < curIdx ? 'w-2.5 h-2.5 bg-purple-400'
                        : 'w-2.5 h-2.5 bg-gray-200'}`} />
              ))}
            </div>
            <span className="text-xs font-black text-gray-500 whitespace-nowrap">{STAGE_TITLES[stage]}</span>
          </div>
          <p className="text-center text-xs font-bold text-purple-400 mb-3">지금 문장 하나만 마스터하면 돼요!</p>

          {/* 단계 통과 긍정 피드백(약 2초) — 기존 Paul 성공 리액션 재사용 */}
          {praise && (
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-3 mb-3 flex items-center gap-3 animate-fade-in">
              <HeroReaction image={praise.image} size="xs" theme="inherit" />
              <p className="font-black text-green-600 text-sm">{praise.msg}</p>
            </div>
          )}

          {/* 오답 격려(ENCOURAGE) — 질책/벌점 언어 없음 */}
          {encourage && (
            <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-3 mb-3 text-center">
              <p className="font-black text-orange-500 text-sm">{encourage}</p>
            </div>
          )}

          <div className="bg-white rounded-3xl card-shadow p-6 space-y-4 animate-slide-up">
            {/* 1단계 읽기 — 큰 영어 문장 + 듣기/뜻 보기/다음 */}
            {stage === 'read' && (
              <>
                <p className="text-center text-sm font-bold text-gray-400">천천히 읽고 들어보자!</p>
                <p className="text-2xl font-black text-gray-800 text-center leading-relaxed break-words">{sentence.english}</p>
                {sentence.grammarPoint && (
                  <p className="text-center text-xs font-bold text-indigo-400">💡 {sentence.grammarPoint}</p>
                )}
                {showKorean && (
                  <p className="text-center text-gray-500 text-base font-bold break-words">
                    {sentence.korean || '(뜻이 아직 입력되지 않았어요)'}
                  </p>
                )}
                <div className="flex gap-2">
                  <button onClick={listen}
                    className="min-h-[52px] flex-1 py-3 rounded-2xl font-black bg-blue-50 text-blue-600 btn-press">
                    🔊 듣기
                  </button>
                  <button onClick={() => setShowKorean((v) => !v)}
                    className="min-h-[52px] flex-1 py-3 rounded-2xl font-black bg-gray-100 text-gray-600 btn-press">
                    {showKorean ? '뜻 숨기기' : '👀 뜻 보기'}
                  </button>
                </div>
                <button onClick={() => advance('read')}
                  className="w-full min-h-[52px] py-4 rounded-2xl font-black text-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white btn-press">
                  다음 →
                </button>
              </>
            )}

            {/* 2단계 끊어 읽기 — 조각을 하나씩 열어 보며 / 로 이어 읽기 */}
            {stage === 'chunk' && (
              <>
                <p className="text-center text-sm font-bold text-gray-400">조각씩 끊어서 읽어보자!</p>
                <p className="text-2xl font-black text-gray-800 text-center leading-relaxed break-words">
                  {chunks.slice(0, revealed).join(' / ')}
                  {revealed < chunks.length && <span className="text-gray-300"> / …</span>}
                </p>
                <button onClick={listen}
                  className="w-full min-h-[52px] py-3 rounded-2xl font-black bg-blue-50 text-blue-600 btn-press">
                  🔊 다시 듣기
                </button>
                {revealed < chunks.length ? (
                  <button onClick={() => setRevealed((n) => n + 1)}
                    className="w-full min-h-[52px] py-4 rounded-2xl font-black text-lg bg-purple-500 text-white btn-press">
                    다음 조각 →
                  </button>
                ) : (
                  <button onClick={() => advance('chunk')}
                    className="w-full min-h-[52px] py-4 rounded-2xl font-black text-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white btn-press">
                    다음 →
                  </button>
                )}
              </>
            )}

            {/* 3단계 퍼즐 — 섞인 조각을 순서대로 탭해서 문장 완성 */}
            {stage === 'puzzle' && (
              <>
                <p className="text-center text-sm font-bold text-gray-400">조각을 순서대로 맞춰 문장을 완성해보자!</p>
                {adaptive.showFullSentence && (
                  <div className="bg-blue-50 rounded-2xl p-3">
                    <p className="text-sm font-black text-blue-600 text-center break-words">{sentence.english}</p>
                  </div>
                )}
                {adaptive.revealAnswer && (
                  <div className="bg-green-50 rounded-2xl p-3">
                    <p className="text-xs font-black text-green-600 mb-1">정답 순서를 보고, 한 번 더 직접 맞춰보자!</p>
                    <ol className="text-sm font-bold text-green-700 space-y-0.5">
                      {chunks.map((c, i) => <li key={i}>{i + 1}. {c}</li>)}
                    </ol>
                  </div>
                )}
                <ChunkPuzzle chunks={chunks} seed={String(sentence.id)}
                  onCorrect={() => advance('puzzle')} onWrong={() => wrong('puzzle')} onListen={listen} />
              </>
            )}

            {/* 4단계 빈칸 — pickBlank 결정론 빈칸 1개 + 입력 채점 */}
            {stage === 'one_blank' && (blank ? (
              <>
                <p className="text-center text-sm font-bold text-gray-400">빈칸에 들어갈 단어를 써보자!</p>
                <p className="text-2xl font-black text-gray-800 text-center leading-relaxed break-words">{blank.display}</p>
                {sentence.korean && (
                  <p className="text-center text-gray-500 text-sm font-bold break-words">{sentence.korean}</p>
                )}
                {adaptive.showFullSentence && (
                  <div className="bg-blue-50 rounded-2xl p-3">
                    <p className="text-sm font-black text-blue-600 text-center break-words">{sentence.english}</p>
                  </div>
                )}
                {adaptive.revealAnswer && (
                  <div className="bg-green-50 rounded-2xl p-3 text-center">
                    <p className="text-xs font-black text-green-600">정답은 <span className="text-base">"{blank.answer}"</span> — 아래에 직접 써보자!</p>
                  </div>
                )}
                <input type="text" value={blankInput}
                  onChange={(e) => setBlankInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitBlank() }}
                  placeholder="빈칸에 들어갈 단어"
                  autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  className="w-full min-h-[52px] border-2 border-purple-200 rounded-2xl px-4 py-3 text-center text-xl font-black focus:outline-none focus:border-purple-400 transition-colors" />
                <div className="flex gap-2">
                  <button onClick={listen}
                    className="min-h-[52px] flex-1 py-3 rounded-2xl font-black bg-blue-50 text-blue-600 btn-press">
                    🔊 듣기
                  </button>
                  <button onClick={submitBlank} disabled={!blankInput.trim()}
                    className={`min-h-[52px] flex-[2] py-3 rounded-2xl font-black text-lg btn-press transition-all ${
                      blankInput.trim() ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : 'bg-gray-100 text-gray-300'}`}>
                    ✓ 확인
                  </button>
                </div>
              </>
            ) : (
              // 빈칸 후보가 없는 문장(엔진 pickBlank가 null) — 정직하게
              // 건너뛰고 다음 단계로(막다른 화면 금지).
              <>
                <p className="text-center text-sm font-bold text-gray-400">이 문장은 빈칸 없이 그대로 한 번 더 읽어보자!</p>
                <p className="text-2xl font-black text-gray-800 text-center leading-relaxed break-words">{sentence.english}</p>
                <button onClick={() => advance('one_blank')}
                  className="w-full min-h-[52px] py-4 rounded-2xl font-black text-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white btn-press">
                  다음 →
                </button>
              </>
            ))}

            {/* 5단계 한→영 — 한국어 뜻을 보고 섞인 조각으로 영어 재조립
                (시드에 'ko'를 붙여 3단계와 다른 순서 — 엔진 시드 결정론) */}
            {stage === 'ko_to_en' && (
              <>
                <p className="text-center text-sm font-bold text-gray-400">한국어 뜻을 보고 영어 문장을 만들어보자!</p>
                <p className="text-xl font-black text-gray-800 text-center leading-relaxed break-words">
                  {sentence.korean || '(뜻이 아직 입력되지 않았어요)'}
                </p>
                {adaptive.showFullSentence && (
                  <div className="bg-blue-50 rounded-2xl p-3">
                    <p className="text-sm font-black text-blue-600 text-center break-words">{sentence.english}</p>
                  </div>
                )}
                {adaptive.revealAnswer && (
                  <div className="bg-green-50 rounded-2xl p-3">
                    <p className="text-xs font-black text-green-600 mb-1">정답 순서를 보고, 한 번 더 직접 맞춰보자!</p>
                    <ol className="text-sm font-bold text-green-700 space-y-0.5">
                      {chunks.map((c, i) => <li key={i}>{i + 1}. {c}</li>)}
                    </ol>
                  </div>
                )}
                <ChunkPuzzle chunks={chunks} seed={`${sentence.id}ko`}
                  onCorrect={() => advance('ko_to_en')} onWrong={() => wrong('ko_to_en')} onListen={listen} />
              </>
            )}

            {/* 6단계 mastered — 축하 카드(기존 스타일, 새 보상/재화 없음) */}
            {stage === 'mastered' && (
              <div className="text-center space-y-3 py-2">
                <HeroReaction
                  image={(getReactionById('levelup') || pickReaction('success'))?.image}
                  title="문장 마스터! 🎉"
                  message="이 한 문장을 끝까지 해냈어요. 정말 잘했어요!"
                  theme="levelup" size="lg" />
                <p className="text-xl font-black text-purple-600 break-words">{sentence.english}</p>
                {sentence.korean && <p className="text-gray-500 text-sm font-bold break-words">{sentence.korean}</p>}
                <button onClick={() => onClose?.(row)}
                  className="w-full min-h-[52px] py-4 rounded-2xl font-black text-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white btn-press">
                  📚 문장 목록으로
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
