import { useState, useEffect, useRef } from 'react'
import { playWordAudio, playRepeating, stopCurrentAudio, playSuccessSound } from '../utils/speech'
import { isSpellingCorrect, spellingHintFor } from '../utils/spelling'
import { getReactionById, pickReaction } from '../utils/paulReactions'
import { spellingComboBonus } from '../hooks/useStudent'
import HeroReaction from './HeroReaction'

// 오답 1~3단계는 폴 선생님 리액션이 정확히 정해져 있음(랜덤 아님) —
// Project Paul 캐릭터 시스템 스펙의 "1번째=Paul Thinking, 2번째=Paul
// Almost, 3번째=Paul Retry" 그대로. 다만 실제 PNG 세트에는 paul_retry.png가
// 없어서(public/assets/paul/ 실제 파일 기준), 3번째는 의미가 가장 가까운
// one_more(paul_one_more.png, "한 번 더 해볼까요?")로 대체함.
const WRONG_PAUL_ID = { 1: 'thinking', 2: 'almost', 3: 'one_more' }

// 초등학생이 발음을 듣고 철자를 떠올릴 수 있을 만큼 천천히, 그러나
// 로봇처럼 부자연스럽게 들리지 않는 속도. 앱 전체 재생 속도 설정
// (SpeedBtn, 다른 모든 화면이 쓰는 getSpeechRate())과는 완전히 분리된
// 값 — 이 상수 하나만 바꿔도 쓰기 모드 외의 화면(퀴즈/말하기/일반 학습)
// 재생 속도에는 전혀 영향 없음. 0.6 -> 0.7(답답함) -> 0.8(여전히 느림
// 피드백, 약 14% 상향) 순으로 조정됨.
const SPELLING_RATE = 0.8
const SPELLING_GAP_MS = 1000 // 반복 사이 약 1초 대기
const UNLOCK_AT = 3 // 이 오답 횟수부터 '발음 듣기' 버튼이 활성화됨

// 쓰기는 받아쓰기가 아니라 "기억 속 철자를 꺼내는 훈련(Active Recall)".
// 그래서 문제를 시작할 때 발음을 자동 재생하지 않고, 문제 텍스트만 보여준
// 상태에서 학생이 순수하게 기억으로 입력하게 함. 오답 단계별 대응:
//   1번째 오답: "❌ 다시 한번 생각해보세요!" — 발음/정답 모두 비공개
//   2번째 오답: "❌ 조금만 더 생각해보세요!" — 여전히 비공개
//   3번째 오답: 그제서야 '발음 듣기' 버튼이 활성화(자동 재생은 아님 —
//               학생이 직접 눌러야만 들림)
//   4번째(+) 오답: 정답 공개 + 발음 1번 자동 재생, 그대로 한 번
//               입력해야 다음 문제로 넘어감(받아쓰기 확인 단계)
const WRONG_MSGS = {
  1: '❌ 다시 한번 생각해보세요!',
  2: '❌ 조금만 더 생각해보세요!',
  3: '❌ 정말 모르겠으면 아래 🔊 버튼을 눌러 들어보세요',
}

// 쓰기 시험 한 문제 — direction으로 어느 방향을 묻는지 결정하는 재사용
// 가능한 컴포넌트(향후 Smart Test도 같은 props 계약으로 재사용할 예정이라
// 방향을 하드코딩하지 않음):
//   'kr2en' (기본값, 기존 v1.5 동작과 100% 동일) — 한글 뜻을 보여주고
//            영어 철자를 입력받음.
//   'en2kr' — 대칭적으로 뒤집음: 영어 단어를 보여주고 한글 뜻을 입력받음.
//   'random' — 문제(=단어)가 바뀔 때마다 이 컴포넌트 내부에서 kr2en/en2kr
//              중 하나를 무작위로 골라 그 문제 동안 고정(아래 useEffect
//              [word, wordAudioUrl] 시점에만 다시 뽑음 — 문제 도중엔 불변).
// 어느 방향이든 오답 단계별 진행(3번까지 발음 잠김 -> 4번째부터 정답
// 공개+발음 자동재생), 힌트 버튼, 오답 리액션 메시지는 완전히 동일하게
// 대칭 적용 — 방향별로 새 UX를 만들지 않는다. 발음(TTS)은 항상 영어 단어
// (word/wordAudioUrl) 기준으로 재생 — en2kr이어도 학생이 듣는 소리는 항상
// 영어 발음(연습 목적 자체가 영어 발음 강화이므로).
//
// '발음 듣기'가 활성화된 뒤에는 언제 탭해도 진행 중이던 재생을 멈추고
// 처음부터 다시 재생 — speech.js의 TTS singleton(claimTtsCall)이 겹쳐
// 들리는 것을 구조적으로 막아줘서 여기서 따로 잠금 처리할 필요 없음.
//
// P3 게임화 props(2026-07-16) — 전부 표시/피드백 전용, 채점·오답노트·
// direction 로직은 한 줄도 안 바뀜. 어느 것도 안 넘기면(기존 호출부
// 그대로) 이전과 100% 동일하게 렌더링됨:
//   combo    — 현재 연속 정답 수(부모가 관리). 2 이상이면 "🔥 n연속!"
//              배지가 뜨고, 정답 화면에서 시각적으로 강조됨.
//   progress — { current, total } 이번 세션 진행 상황. 주어지면 카드
//              상단에 진행 바 + "문제 n/전체 · 남은 문제 k개" 표시.
//   comboStarsEnabled — 콤보 마일스톤(3/5/10) 도달 시 부모가 실제로
//              보너스 별을 지급하는 흐름에서만 true(WordDetail 경유).
//              SpellingReview처럼 별을 안 주는 화면은 끔 — 화면이
//              거짓말로 "+별"을 보여주는 일이 없도록.
// v2.0(2026-07-17) 추가 props:
//   acceptedMeanings — 이 단어의 "추가 인정 뜻" 목록(words.accepted_meanings).
//              en2kr 채점에서만 정답 후보에 합류(영어 철자 채점에는 무관).
//   direction='mixed' — 세션 단위 50:50 배분은 부모(App.jsx)가 assignDirections로
//              단어별 'kr2en'/'en2kr'을 미리 정해 내려보내는 구조라, 이
//              컴포넌트에 'mixed'가 직접 오는 일은 정상 흐름엔 없음. 혹시
//              오면(방어) 문제마다 랜덤과 동일하게 처리.
//   onResult(correct, direction, submitted) — 기존 correct 외에 이 문제의
//              실제 방향과 첫 시도 제출 원문을 추가로 전달(하위호환 —
//              기존 호출부는 첫 인자만 써도 동작 동일). App이 방향별 세션
//              집계와 교사 검토 큐 기록에 사용.
//   isComebackWord — Writing MVP(2026-07-20). 이 단어가 영구 복습
//              대기열(useStudent.spellingReviewQueue — 적어도 하루 전에
//              놓쳤던 단어만 들어있음)에 있는 상태로 이 문제가 시작됐는지를
//              부모가 렌더 시점에 미리 계산해서 넘겨준다. true면 정답
//              화면에서 일반 성공 리액션 대신 "예전에 놓쳤던 단어를 다시
//              맞혔다"는 걸 강조하는 배지를 보여준다(콤보 마일스톤 배지와
//              동일한 시각 언어 재사용 — 새 애셋 없음).
export default function SpellingQuestion({ word, meaning, wordAudioUrl, hintEnabled, direction = 'kr2en', onResult, onDone, combo = 0, progress = null, comboStarsEnabled = false, acceptedMeanings = [], isComebackWord = false }) {
  const pickDirection = () => ((direction === 'random' || direction === 'mixed') ? (Math.random() < 0.5 ? 'kr2en' : 'en2kr') : direction)

  const [phase, setPhase] = useState('answer') // answer | reveal | correct
  const [wrongCount, setWrongCount] = useState(0)
  const [replaying, setReplaying] = useState(false) // 재생 중 표시만 — 이미 입력한 답은 화면에 그대로 유지됨
  const [input, setInput] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [correctPaul, setCorrectPaul] = useState(null)
  // 'random'일 때 이 문제(단어) 동안 고정할 실제 방향.
  const [resolvedDirection, setResolvedDirection] = useState(pickDirection)
  const reportedRef = useRef(false)
  const cancelRef = useRef(null)
  const inputRef = useRef(null)
  // 브라우저 자동완성 프로필 매칭을 깨기 위한 무작위 비표준 name — 마운트당
  // 1회 고정(리렌더마다 바뀌면 일부 브라우저가 필드를 새 필드로 취급해
  // 포커스/IME 조합이 끊길 수 있음).
  const antiFillNameRef = useRef(`sq-${Math.random().toString(36).slice(2, 10)}`)

  const isEn2Kr = resolvedDirection === 'en2kr'
  const promptText = isEn2Kr ? word : meaning // 문제로 보여주는 텍스트
  const targetAnswer = isEn2Kr ? meaning : word // 학생이 입력해서 맞혀야 하는 값
  // 정답이 화면에 "노출되는 순간"(correct/reveal)에만 정답과 함께 병기하는
  // 반대 언어 텍스트 — 단어-뜻 연결을 강화하기 위한 순수 표시용.
  // kr2en이면 영어 정답 밑에 한글 뜻, en2kr이면 한글 정답 밑에 영어 단어.
  // 문제(answer) 화면에는 절대 쓰지 않는다 — 시험이 무의미해짐.
  const pairedText = isEn2Kr ? word : meaning
  const inputPlaceholder = isEn2Kr ? '한글로 뜻을 입력하세요' : '영어로 철자를 입력하세요'

  const playSequence = (onAllDone) => {
    cancelRef.current?.() // 재생 중 다시 터치 -> 기존 재생을 먼저 멈추고 처음부터 다시
    setReplaying(true)
    cancelRef.current = playRepeating(wordAudioUrl, word, {
      times: 3,
      gapMs: SPELLING_GAP_MS,
      rate: SPELLING_RATE,
      source: 'spelling',
      onAllDone: () => { setReplaying(false); onAllDone?.() },
      onError: () => { setReplaying(false); onAllDone?.() },
    })
  }

  const playOnce = (source, onDone) => {
    cancelRef.current?.()
    cancelRef.current = null
    setReplaying(true)
    playWordAudio(wordAudioUrl, word, {
      times: 1,
      rate: SPELLING_RATE,
      source,
      onEnd: () => { setReplaying(false); onDone?.() },
      onError: () => { setReplaying(false); onDone?.() },
    })
  }

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 50)

  // 문제 등장(마운트/단어 변경) — 발음 자동 재생 없음. 문제 텍스트만
  // 보여주고 바로 입력창에 포커스(모바일 키보드도 바로 뜨도록 — iOS
  // Safari는 사용자 제스처 밖 focus()를 무시할 수 있어 100% 보장은
  // 어려움). direction==='random'이면 이 시점에 이 문제 한정으로 방향을
  // 새로 뽑아 고정한다.
  useEffect(() => {
    setPhase('answer')
    setWrongCount(0)
    setInput('')
    setShowHint(false)
    reportedRef.current = false
    setResolvedDirection(pickDirection())
    focusInput()

    return () => { cancelRef.current?.(); stopCurrentAudio() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, wordAudioUrl])

  const playAgain = () => {
    if (wrongCount < UNLOCK_AT || phase === 'correct') return // 잠금 해제 전엔 무시(버튼도 비활성 상태)
    playSequence(focusInput)
  }

  // 정답이면 효과음을 먼저 들려주고, 0.7초 후에 다음 문제로 — 효과음이
  // 잘리지 않고 다 들리도록 onDone을 곧바로 부르지 않음.
  // achievedCombo: 이 정답으로 도달하게 되는 콤보 수(첫 시도 정답일 때만
  // combo+1, 오답 후 재입력 통과는 0) — 콤보 마일스톤(3/5/10)에 딱 도달한
  // 순간엔 일반 success 풀 대신 폴 'levelup' 리액션으로 강조. 효과음은
  // 기존 playSuccessSound 하나만, 반드시 이 이벤트 핸들러 안에서만 재생
  // (speech.js 싱글턴 가드 패턴 — 에코 버그 이력 참고).
  const markCorrect = (achievedCombo = 0) => {
    setPhase('correct')
    const isMilestone = achievedCombo >= 2 && spellingComboBonus(achievedCombo) > 0
    // isComebackWord도 콤보 마일스톤과 같은 'levelup' 리액션을 재사용 —
    // 둘 다 "평소보다 특별한 순간"이라는 같은 톤이라 새 애셋 불필요.
    setCorrectPaul(((isComebackWord || isMilestone) && getReactionById('levelup')) || pickReaction('success'))
    playSuccessSound()
    setTimeout(() => onDone?.(), 700)
  }

  const submitAnswer = () => {
    // Writing MVP(2026-07-20) — 빈 입력으로 확인을 눌렀을 때 예전엔 아무
    // 반응 없이 무시됐다(CED 리뷰 발견: 왜 안 되는지 피드백 없음). 새
    // UI/애니메이션 추가 없이 입력창에 포커스만 다시 줘서 "여기 입력하세요"
    // 신호를 준다.
    if (!input.trim()) { focusInput(); return }
    // acceptedMeanings는 "뜻(한글)"의 추가 표기 목록이므로 정답이 뜻인
    // en2kr에서만 후보에 합류 — 영어 철자(kr2en) 채점은 기존과 완전 동일.
    const correct = isSpellingCorrect(input, targetAnswer, { acceptedMeanings: isEn2Kr ? acceptedMeanings : [] })
    const firstAttempt = !reportedRef.current
    if (firstAttempt) { reportedRef.current = true; onResult?.(correct, resolvedDirection, input.trim()) }
    if (correct) { markCorrect(firstAttempt ? combo + 1 : 0); return }

    setInput('')
    const next = wrongCount + 1
    setWrongCount(next)

    if (next >= 4) {
      // 네 번째(이후) 오답 — 정답 공개 + 발음 1번 자동 재생, 그대로 한 번 입력해야 통과
      setPhase('reveal')
      playOnce('spelling-reveal', focusInput)
    } else {
      // 1~3번째 오답 — 발음/정답 모두 비공개, 스스로 다시 떠올려 입력
      // (3번째부터는 '발음 듣기' 버튼만 활성화되고, 자동 재생은 안 됨)
      focusInput()
    }
  }

  const hint = spellingHintFor(targetAnswer)
  const wrongMsg = WRONG_MSGS[wrongCount]
  const speakerUnlocked = wrongCount >= UNLOCK_AT

  // ── 시험용 입력창 공통 속성 ─────────────────────────────────────────────
  // 실사용 리포트: 삼성 키보드/Gboard에서 "orde"까지 치면 "order"가 추천어로
  // 떠서 시험이 무의미해짐. 웹 속성으로 막을 수 있는 최대치를 조합:
  //  - autoComplete="off": 표준. 단 Android Chrome/삼성 인터넷이 자주 무시.
  //  - name=무작위 비표준 값: 브라우저 자동완성 프로필(저장된 폼 데이터)
  //    매칭을 차단하는 실전 보강책 — autocomplete=off 무시 케이스 대부분이
  //    "필드 이름 기반 프로필 자동완성"이라 이 조합이 실효가 큼.
  //  - autoCapitalize/autoCorrect/spellCheck: 기존 유지(키보드 자동교정 억제).
  //  - onPaste/onDrop 차단: 정답을 복사해 붙여넣는 우회 차단. onCopy도 입력창
  //    한정 차단(문제 텍스트 복사는 그대로 가능). onContextMenu는 안 막음 —
  //    롱프레스 커서 이동/선택까지 막혀 초등학생 UX를 해침. 붙여넣기는
  //    메뉴 경유라도 onPaste가 잡으므로 차단에 구멍 없음.
  // 한계(속성으로 불가능한 영역): 키보드 앱 자체의 "예측 텍스트"(OS 설정)는
  // 웹 속성으로 100% 차단 불가 — handoff에 기록, 운영자 실기기 확인 필요.
  //
  // 방향별 세트 분리: 정답 언어가 한글(en2kr)인 문제는 한글 IME 조합이
  // 정상 동작해야 하므로 IME에 영향 줄 수 있는 힌트(lang)만 다르게 주고,
  // 자동완성/붙여넣기 차단은 동일 적용. type="text" 유지(다른 type은
  // IME/키보드 레이아웃을 깨는 주범이라 금지).
  const blockClipboard = {
    onPaste: (e) => e.preventDefault(),
    onDrop: (e) => e.preventDefault(),
    onCopy: (e) => e.preventDefault(),
  }
  const examInputProps = {
    type: 'text',
    name: antiFillNameRef.current,
    autoComplete: 'off',
    autoCapitalize: 'off',
    autoCorrect: 'off',
    spellCheck: 'false',
    inputMode: 'text',
    lang: isEn2Kr ? 'ko' : 'en',
    ...blockClipboard,
  }

  // P3 게임화 표시값 — 진행 바는 "완료한 문제 수" 기준이라 풀고 있는 동안은
  // current-1, 정답을 맞힌 순간(correct phase) current로 차오름(맞히는
  // 순간 바가 한 칸 전진하는 게임식 피드백).
  const remaining = progress ? Math.max(0, progress.total - progress.current) : 0
  const solvedForBar = progress ? (phase === 'correct' ? progress.current : progress.current - 1) : 0
  const barPct = progress && progress.total > 0
    ? Math.min(100, Math.max(0, Math.round((solvedForBar / progress.total) * 100)))
    : 0
  // 정답 화면에서 combo prop은 부모가 이미 이번 답까지 반영해 올려준 값 —
  // 그 값이 정확히 마일스톤일 때만 보너스 별 문구를 보여줌(실제 지급은
  // useStudent.recordSpellingAnswer가 같은 값으로 이미 처리).
  const comboBonus = phase === 'correct' && comboStarsEnabled ? spellingComboBonus(combo) : 0

  return (
    <div className="bg-white rounded-3xl card-shadow p-6 space-y-4">
      {progress && progress.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
            <span>문제 {Math.min(progress.current, progress.total)} / {progress.total}</span>
            <span>{remaining > 0 ? `남은 문제 ${remaining}개` : '마지막 문제!'}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-teal-400 to-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${barPct}%` }} />
          </div>
        </div>
      )}
      <p className="text-center text-gray-500 font-bold text-sm">✏️ 철자 쓰기</p>
      {combo >= 2 && (
        <p key={combo} className="text-center animate-paul-pop">
          <span className="inline-block bg-gradient-to-r from-orange-400 to-amber-500 text-white text-xs font-black px-3 py-1.5 rounded-full shadow">
            🔥 {combo}연속 정답!
          </span>
        </p>
      )}

      {speakerUnlocked ? (
        <button onClick={playAgain} disabled={phase === 'correct'}
          className="w-full bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl p-6 text-center text-white btn-press">
          <p className={`text-4xl mb-2 ${replaying ? 'animate-pulse' : ''}`}>🔊</p>
          <p className="text-3xl font-black">{promptText}</p>
          <p className="text-teal-100 text-xs mt-2">탭하면 발음을 들려줘요 (3번, 천천히)</p>
        </button>
      ) : (
        <div className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-6 text-center">
          <p className="text-3xl font-black text-gray-700">{promptText}</p>
        </div>
      )}

      {hintEnabled && phase !== 'correct' && (
        <div className="text-center">
          {showHint ? (
            <p className="text-gray-400 font-black tracking-widest text-lg">{hint}</p>
          ) : (
            <button onClick={() => setShowHint(true)} className="py-3 px-4 -my-3 text-xs text-teal-500 font-bold btn-press">💡 힌트 보기</button>
          )}
        </div>
      )}

      {phase === 'answer' && (
        <div className="space-y-3 animate-slide-up">
          {wrongMsg && (
            <HeroReaction image={getReactionById(WRONG_PAUL_ID[wrongCount])?.image} title={wrongMsg} theme="fail" size="md" />
          )}
          <input ref={inputRef} {...examInputProps} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitAnswer()}
            placeholder={inputPlaceholder} autoFocus
            className="w-full border-2 border-teal-200 rounded-xl px-4 py-4 text-xl font-black text-center focus:outline-none focus:border-teal-500" />
          <button onClick={submitAnswer}
            className="w-full bg-teal-500 hover:bg-teal-600 text-white font-black py-4 rounded-2xl btn-press text-lg">
            확인
          </button>
        </div>
      )}

      {phase === 'reveal' && (
        <div className="space-y-3 animate-slide-up">
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 text-center">
            <HeroReaction image={getReactionById('sad')?.image} size="md" />
            <p className="text-red-500 font-bold text-sm mb-1 mt-1">정답은</p>
            <p className="text-red-600 font-black text-2xl tracking-wide break-words">{targetAnswer}</p>
            <p className="text-red-500 font-bold text-sm mt-1">입니다</p>
            {/* 정답 노출 시점의 반대 언어 병기(표시 전용) — 단어 목록과 같은
                위계: 정답 굵게/크게 위, 반대 언어 작게 회색 아래. */}
            <p className="text-gray-500 font-bold text-sm mt-1 break-words">{pairedText}</p>
          </div>
          <p className="text-center text-xs text-gray-400">정답을 보고 똑같이 한 번 입력해봐요</p>
          <input ref={inputRef} {...examInputProps} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitAnswer()}
            placeholder="다시 입력하세요" autoFocus
            className="w-full border-2 border-red-200 rounded-xl px-4 py-4 text-xl font-black text-center focus:outline-none focus:border-red-500" />
          <button onClick={submitAnswer}
            className="w-full bg-red-400 hover:bg-red-500 text-white font-black py-4 rounded-2xl btn-press text-lg">
            확인
          </button>
        </div>
      )}

      {phase === 'correct' && (
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 text-center animate-slide-up">
          {/* playSuccessSound()가 이미 위 markCorrect()에서 재생함 — HeroReaction은
              효과음을 재생하지 않으므로 중복 걱정 없음. */}
          <HeroReaction
            image={correctPaul?.image}
            title={correctPaul?.message}
            message="정답이에요!"
            theme="success"
            size="md"
          >
            {/* 정답 노출 시점의 반대 언어 병기(표시 전용) — 단어 목록과 같은
                위계: 정답 굵게/크게, 바로 아래 반대 언어 작게 회색. */}
            <p className="text-gray-800 font-black text-2xl break-words">{targetAnswer}</p>
            <p className="text-gray-500 font-bold text-sm break-words">{pairedText}</p>
          </HeroReaction>
          {comboBonus > 0 && (
            <p className="mt-2 animate-paul-pop">
              <span className="inline-block bg-yellow-100 border-2 border-yellow-300 text-yellow-700 text-sm font-black px-4 py-1.5 rounded-full">
                ⭐ {combo}콤보 달성! 보너스 별 +{comboBonus}개
              </span>
            </p>
          )}
          {isComebackWord && (
            <p className="mt-2 animate-paul-pop">
              <span className="inline-block bg-teal-100 border-2 border-teal-300 text-teal-700 text-sm font-black px-4 py-1.5 rounded-full">
                🎉 예전에 틀렸던 단어를 완전히 익혔어요!
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
