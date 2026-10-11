// 그림 단어 연습(249차, 테스터 전용; 251차 카드 한 장 흐름). 단어마다 한 카드에서: 그림+단어+뜻 → 발음 듣기 → 따라 말하기 → 내 목소리 듣기 → 다시 말하기 → 다음.
// 연습(카드) 뒤에 게임·시험을 고르고, 시험은 그림만 보고 맞힌 뒤 틀린 단어를 복습한다.
// 상태는 React state뿐(새로고침하면 사라짐). 저장·네트워크·보상 호출 0. 녹음은 기기 메모리 전용(useLocalRecorder) — 업로드·채점·판정 없음.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LEVELS, learnableWords, shopSets, wordsForLevel } from '../../data/pictureWords/index.js'
import { buildSession, buildQuiz, reviewQueue, reviewNext, startStep, summarise } from '../../utils/pictureWords/practice.js'
import { stopSpeaking } from '../../utils/speech'
import useLocalRecorder from '../../hooks/useLocalRecorder'
import { RecorderControls } from '../SpeakingPracticeItem'
import { BTN, GamePicture, GameStyle, MUTED, PwProgress, T2, T3, W, playEn } from './pictureImg.jsx'
import SfxControl from './SfxControl.jsx'
import { playSfx } from '../../utils/pictureWords/sfx.js'
import { PICTURE_REC_LABELS } from './recLabels.js'

// 게임/가게 선반은 열 때만 받는 추가 청크
const PictureGames = React.lazy(() => import('./PictureGames'))
// PAUL PHONICS(폴 파닉스, 253차 시제품 → 254차 5권 구조)도 별도 lazy 청크 — 테스터가 해당 버튼을 눌러야만 받는다
const PaulPhonics = React.lazy(() => import('../phonics/PaulPhonics'))

const PRIMARY = `${BTN} bg-purple-600 text-white`
const SOFT = `${BTN} bg-sky-100 text-sky-700`
const SESSION_SIZE = 6
const POOL = learnableWords()

const newSeed = () => Date.now() % 2147483647

// 단어를 누르면 "발음 듣기"와 같은 함수로 전체 단어 소리가 난다. hide = 글자 카드(단어가 카드 안에 이미 있음)
const WordBtn = ({ word, className }) => <button type="button" data-testid="pwp-word" onClick={() => playEn(word.en)} className={className}>{word.en}</button>

function WordText({ word, hide }) {
  if (hide && !word.ko) return null
  return (
    <div className="text-center">
      {!hide && <WordBtn word={word} className={`${T3} min-h-[44px]`} />}
      {word.ko && <p data-testid="pwp-ko" className="text-lg text-gray-600 break-words">{word.ko}</p>}
    </div>
  )
}

const ListenBtn = ({ word }) => (
  <button type="button" data-testid="pwp-listen" onClick={() => playEn(word.en)} className={`${SOFT} w-full`}>🔊 발음 듣기</button>
)

// 연습 카드: 단어마다 한 장에 그림·단어·뜻·듣기·녹음(따라 말하기/내 목소리 듣기/다시 말하기)·다음.
// 녹음기는 이 컴포넌트가 단어들 사이에서 하나를 쓴다(마이크는 카드 묶음을 떠날 때 놓는다). 단어를 바꾸면 녹음을 버린다 — 녹음 중에 넘기면 멈춘 뒤 버린다.
// "말해 봤어요" 표시는 판정이 아니다 — 점수·별 없음, 녹음은 기기 밖으로 나가지 않는다.
export function PracticeCards({ words, onDone, single = false, nextLabel = '➡️ 다음 단어' }) {
  const rec = useLocalRecorder()
  const [i, setI] = useState(0)
  const [said, setSaid] = useState(() => new Set())
  const discard = useRef(false)
  const w = words[i]
  const status = rec.st.status

  useEffect(() => { if (status === 'recorded' && !discard.current) setSaid((s) => new Set(s).add(w.id)) }, [status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (discard.current && status !== 'recording' && status !== 'requesting') { discard.current = false; rec.reset('RESET') }
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stopSpeaking, [])

  const leave = (fn) => {
    stopSpeaking()
    if (status === 'recording') { discard.current = true; rec.stop() } else rec.reset('RESET')
    fn()
  }
  const lastOne = i + 1 >= words.length
  return (
    <div data-testid="pwp-card" data-word-index={i} className="space-y-3">
      <PwProgress testid="pwp-progress" n={i + 1} total={words.length} />
      {w.asset ? <GamePicture word={w} testid="pwp-picture" /> : <div data-testid="pwp-text-card" className="pw-card"><div className="pw-pic flex flex-col items-center justify-center gap-2"><span className="pw-card-tag">듣고 따라 말해요</span><WordBtn word={w} className="break-words text-4xl font-black text-gray-900" /></div></div>}
      <WordText word={w} hide={!w.asset} />
      {said.has(w.id) && <p data-testid="pwp-said-mark" className="text-center text-sm font-bold text-emerald-700">말해 봤어요</p>}
      <ListenBtn word={w} />
      <div data-testid="pwp-rec" className="space-y-1">
        {status === 'recording' && <p data-testid="pwp-rec-live" className="text-center text-base font-black text-red-600">녹음 중… {rec.elapsed}초</p>}
        <RecorderControls rec={rec} prefix="pwp-rec" labels={PICTURE_REC_LABELS} idleText="" />
      </div>
      <div className="flex gap-2">
        {!single && <button type="button" data-testid="pwp-prev" onClick={() => leave(() => setI(i - 1))} disabled={i === 0} className={`${BTN} flex-1 bg-gray-200 text-gray-700`}>이전</button>}
        <button type="button" data-testid="pwp-next" onClick={() => (lastOne ? (stopSpeaking(), onDone()) : leave(() => setI(i + 1)))} className={`${PRIMARY} flex-1`}>{single ? nextLabel : '➡️ 다음 단어'}</button>
      </div>
    </div>
  )
}

// 시험 문제 하나. 답하기 전에는 영어 단어·뜻·듣기·녹음기를 DOM에 올리지 않는다(조건부 마운트). 그림 alt도 중립 문구.
function QuizCard({ word, q, onAnswered, onNext, n, total, label = '시험' }) {
  const [picked, setPicked] = useState(null)
  const answered = picked !== null
  const right = answered && picked === q.correctId
  return (
    <div data-testid="pwp-quiz" className="space-y-3">
      <PwProgress testid="pwp-quiz-progress" label={label} n={n} total={total} />
      <GamePicture word={word} testid="pwp-picture" glow={right} />
      <p className="text-center text-base font-bold text-gray-700">그림에 맞는 단어를 골라요</p>
      <div className="grid grid-cols-2 gap-2">
        {q.options.map((o, k) => (
          <button key={o.id} type="button" data-testid={`pwp-opt-${k}`} disabled={answered}
            onClick={() => { if (answered) return; setPicked(o.id); playSfx(o.id === q.correctId ? 'right' : 'wrong'); onAnswered(o.id === q.correctId) }}
            className={`min-h-[56px] px-4 py-3 rounded-2xl font-black text-lg btn-press disabled:opacity-40 break-words border-2 ${answered && o.id === q.correctId ? 'border-green-500 bg-green-100 text-green-800' : answered && o.id === picked ? 'border-amber-400 bg-amber-100 text-amber-800' : 'border-gray-200 bg-white text-gray-800'}`}>
            {o.en}
          </button>
        ))}
      </div>
      {answered && (
        <div data-testid="pwp-feedback" data-result={right ? 'right' : 'wrong'} className={`space-y-2 rounded-2xl p-3 ${right ? 'bg-green-50' : 'bg-amber-50'}`}>
          <p className="text-center text-lg font-black">{right ? '맞았어요!' : '아쉬워요, 다시 봐요'}</p>
          <WordText word={word} />
          <ListenBtn word={word} />
        </div>
      )}
      {answered && <button type="button" data-testid="pwp-next" onClick={() => onNext(right)} className={`${PRIMARY} w-full`}>다음</button>}
    </div>
  )
}

// stage: card(연습 카드) → end(게임/시험/건너뛰기) → quiz → review → summary. 시험으로 바로 시작하면 quiz부터.
function Session({ words: pool, seed, mode, onAgain, onOther, onExit, onGame }) {
  const all = useMemo(() => buildSession(pool, { size: SESSION_SIZE, seed }), [pool, seed])
  const words = useMemo(() => all.filter((x) => x.asset), [all]) // 시험·게임은 그림 있는 단어만
  const quiz = useMemo(() => buildQuiz(words, POOL, seed), [words, seed])
  const [stage, setStage] = useState(startStep(mode))
  const [qi, setQi] = useState(0)
  const [results, setResults] = useState([])
  const [rev, setRev] = useState(null) // { queue:[ids], phase:'card'|'quiz'|'clear', round }
  useEffect(() => stopSpeaking, [])

  const byId = (id) => words.find((x) => x.id === id)
  const answer = (id) => (correct) => setResults((r) => [...r, { id, correct }])
  const startTest = () => { stopSpeaking(); setResults([]); setQi(0); setStage('quiz') }
  const toReview = () => {
    const q = reviewQueue(results)
    setStage('review')
    setRev(q.length ? { queue: q, phase: 'card', round: 0 } : { queue: [], phase: 'clear', round: 0 })
  }
  const afterReviewAnswer = (correct) => setRev((r) => {
    const queue = reviewNext(r.queue, correct)
    return { queue, phase: queue.length ? 'card' : 'clear', round: r.round + 1 }
  })
  const gameBtns = (a, b) => (
    <>
      <button type="button" data-testid="pwp-game-hammer" onClick={() => onGame('hammer', words)} className={`${SOFT} w-full`}>{a}</button>
      <button type="button" data-testid="pwp-game-hidden" onClick={() => onGame('hidden', words)} className={`${SOFT} w-full`}>{b}</button>
    </>
  )

  let body, progress = ''
  if (stage === 'card') {
    body = <PracticeCards words={all} onDone={() => setStage('end')} />
  } else if (stage === 'end') {
    body = (
      <div data-testid="pwp-end" className="space-y-3 text-center">
        <p className={T2}>다음은 게임!</p>
        <p className="text-base text-gray-600">같은 단어로 게임을 하거나 시험을 볼 수 있어요</p>
        {gameBtns('알파벳 망치로', '숨은 글자로')}
        <button type="button" data-testid="pwp-go-test" onClick={startTest} className={`${PRIMARY} w-full`}>시험 보기</button>
        <button type="button" data-testid="pwp-skip" onClick={() => setStage('summary')} className={`${BTN} ${W.gray}`}>건너뛰고 끝내기</button>
      </div>
    )
  } else if (stage === 'quiz') {
    body = <QuizCard key={words[qi].id} n={qi + 1} total={words.length} word={words[qi]} q={quiz[qi]} onAnswered={answer(words[qi].id)} onNext={() => (qi + 1 >= words.length ? toReview() : setQi(qi + 1))} />
  } else if (stage === 'review') {
    progress = '복습'
    if (rev.phase === 'clear') {
      body = (
        <div data-testid="pwp-review-card" data-kind="clear" className="space-y-3 text-center">
          <p className="text-2xl font-black text-green-700">모두 맞혔어요</p>
          <p className="text-gray-600">다시 볼 단어가 없어요</p>
          <button type="button" data-testid="pwp-next" onClick={() => setStage('summary')} className={`${PRIMARY} w-full`}>결과 보기</button>
        </div>
      )
    } else {
      const rw = byId(rev.queue[0])
      body = rev.phase === 'card' ? (
        <div data-testid="pwp-review-card" data-kind="word" className="space-y-3">
          <p className="text-center text-sm font-black text-amber-700">다시 볼 단어 {rev.queue.length}개 남았어요</p>
          <PracticeCards key={`${rw.id}-${rev.round}`} words={[rw]} single nextLabel="➡️ 문제 풀기" onDone={() => setRev({ ...rev, phase: 'quiz' })} />
        </div>
      ) : (
        <QuizCard key={`${rw.id}-${rev.round}`} label="복습" n={1} total={rev.queue.length} word={rw} q={buildQuiz([rw], POOL, seed + 7919 * (rev.round + 1))[0]} onAnswered={answer(rw.id)} onNext={afterReviewAnswer} />
      )
    }
  } else {
    const s = summarise(results)
    body = (
      <div data-testid="pwp-summary" className="space-y-3 text-center">
        <p className={T2}>{s.total ? '시험을 마쳤어요' : '연습을 마쳤어요'}</p>
        {s.total > 0 && <p className="text-lg text-gray-700">처음에 맞힌 단어 <span data-testid="pwp-summary-first-try" className="font-black text-purple-700">{s.firstTryCorrect} / {s.total}</span></p>}
        {s.needsReview.length > 0 && (
          <div className="rounded-2xl bg-amber-50 p-3 text-left text-sm">
            <p className="font-black text-amber-800">복습한 단어</p>
            <ul className="mt-1">{s.needsReview.map((id) => <li key={id} data-testid="pwp-summary-review" className="break-words">{byId(id).en} — {byId(id).ko}</li>)}</ul>
          </div>
        )}
        {gameBtns('이 단어로 알파벳 망치', '이 단어로 숨은 글자')}
        <button type="button" data-testid="pwp-again" onClick={onAgain} className={`${PRIMARY} w-full`}>다시 하기</button>
        <button type="button" data-testid="pwp-other-set" onClick={onOther} className={`${SOFT} w-full`}>다른 묶음</button>
        <button type="button" data-testid="pwp-exit" onClick={onExit} className={`${BTN} ${W.gray}`}>나가기</button>
      </div>
    )
  }
  return (
    <div data-testid="pwp-root" data-step={stage} data-mode={mode} data-index={stage === 'quiz' ? qi : 0} data-seed={seed} className="space-y-3">
      {progress && <p className="text-center text-sm font-black text-purple-700">{progress}</p>}
      {body}
    </div>
  )
}

export default function PictureWordPractice({ onExit, studentId }) {
  const [sel, setSel] = useState(null) // { id, words?, seed, mode } — words가 있으면 그 단어(게임/선반에서 온 것), 없으면 id의 묶음
  const [view, setView] = useState(null) // 게임/선반: { kind:'game', mode, from? } | { kind:'shelf' }
  const [level, setLevel] = useState('phonics')
  const [phx, setPhx] = useState(false) // PAUL PHONICS 열림 — 열려 있는 동안 허브는 계속 마운트(기록·위치 유지), 연습/시험/게임 중에는 숨긴다
  const [fromPhx, setFromPhx] = useState(false) // 지금 연습/시험/게임이 허브에서 시작됐다 → 끝나면 허브로 돌아온다
  // 묶음: 가게 8곳 + 켜진 레벨(Phonics는 길이로만 고른 쉬운 단어 — 소리 순서를 주장하지 않는다). 모두 learnableWords()에서만 온다.
  const sets = useMemo(() => [
    ...shopSets().map((s) => ({ id: s.shop, labelKo: s.labelKo, words: s.words, ready: s.ready })),
    ...LEVELS.filter((l) => l.enabled).map((l) => { const words = wordsForLevel(l.id); return { id: `level-${l.id}`, labelKo: l.labelKo, words, ready: words.length >= 4 } }),
  ], [])
  const words = sel && (sel.words || sets.find((x) => x.id === sel.id)?.words)
  const start = (id, mode) => { setView(null); setSel({ id, seed: newSeed(), mode }) }
  const withWords = (list, mode) => { setView(null); setSel({ id: 'words', words: list, seed: newSeed(), mode }) }
  const game = (mode, from) => { setSel(null); setView({ kind: 'game', mode, from }) }
  const backToHub = () => { setSel(null); setView(null); setFromPhx(false) }
  const fromHub = (fn) => (list) => { setFromPhx(true); fn(list) }
  const leave = fromPhx ? backToHub : onExit
  const menu = fromPhx ? backToHub : () => setView(null)
  let body
  if (phx && !fromPhx) {
    body = null // 허브가 보인다
  } else if (view) {
    body = (
      <React.Suspense fallback={<p className="text-center text-sm text-gray-500">불러오는 중...</p>}>
        <PictureGames key={view.kind + (view.mode || '')} kind={view.kind} mode={view.mode} level={level} from={view.from} onPractice={(l) => withWords(l, 'practice')} onTest={(l) => withWords(l, 'test')} onMenu={menu} onExit={leave} />
      </React.Suspense>
    )
  } else if (words) {
    body = <Session key={`${sel.seed}-${sel.mode}`} words={words} seed={sel.seed} mode={sel.mode} onAgain={() => setSel({ ...sel, seed: newSeed() })} onOther={fromPhx ? backToHub : () => setSel(null)} onExit={leave} onGame={game} />
  } else {
    body = (
      <div data-testid="pwp-root" data-step="pick" data-index={0} className="space-y-2">
        <SfxControl />
        <div className="flex flex-wrap justify-center gap-2">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" data-testid={`pwg-level-${l.id}`} data-active={level === l.id ? 'true' : 'false'} disabled={!l.enabled} onClick={() => setLevel(l.id)}
              className={`min-h-[44px] rounded-full px-3 text-xs font-black btn-press disabled:opacity-40 ${level === l.id ? 'bg-purple-600 text-white' : 'border-2 border-purple-200 bg-white text-purple-700'}`}>{l.labelKo}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" data-testid="pwg-mode-practice" className={`${SOFT} px-1 text-sm`}>단어 연습</button>
          <button type="button" data-testid="pwg-mode-hammer" onClick={() => game('hammer')} className={`${SOFT} px-1 text-sm`}>알파벳 망치</button>
          <button type="button" data-testid="pwg-mode-hidden" onClick={() => game('hidden')} className={`${SOFT} px-1 text-sm`}>숨은 글자</button>
        </div>
        <button type="button" data-testid="pwg-open-phonics" onClick={() => { setSel(null); setView(null); setPhx(true) }} className={`${SOFT} w-full`}>PAUL PHONICS (폴 파닉스)</button>
        <button type="button" data-testid="pwg-mode-shelf" onClick={() => setView({ kind: 'shelf' })} className={`${SOFT} w-full`}>가게 구경</button>
        <p className="text-center text-sm text-gray-600">연습하거나 시험 볼 묶음을 골라요</p>
        <div className="space-y-2">
          {sets.map((s) => (
            <div key={s.id} data-testid={`pwp-set-${s.id}`} data-ready={s.ready ? 'true' : 'false'} className="rounded-2xl border-2 border-purple-200 bg-white p-2">
              <p className="break-words text-center text-base font-black text-purple-700">{s.labelKo}<span className={`ml-2 ${MUTED}`}>{s.ready ? `${s.words.length}개` : '준비 중'}</span></p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button type="button" data-testid={`pwp-start-practice-${s.id}`} disabled={!s.ready} onClick={() => start(s.id, 'practice')} className={`${PRIMARY} text-base`}>연습하기</button>
                <button type="button" data-testid={`pwp-start-test-${s.id}`} disabled={!s.ready} onClick={() => start(s.id, 'test')} className={`${SOFT} text-base`}>시험 보기</button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" data-testid="pwp-exit" onClick={onExit} className={`${BTN} ${W.gray}`}>나가기</button>
      </div>
    )
  }
  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-purple-50 to-sky-50 px-4 py-4 pb-8">
      <div className="mx-auto max-w-lg min-w-0 space-y-3">
        <GameStyle />
        <h1 className="text-center text-xl font-black text-gray-800">그림 단어 연습 <span className="text-xs text-red-600">(테스트)</span></h1>
        {body}
        {phx && (
          <div hidden={fromPhx}>
            <React.Suspense fallback={<p className="text-center text-sm text-gray-500">불러오는 중...</p>}>
              <PaulPhonics studentId={studentId} onExit={() => { setPhx(false); setFromPhx(false) }} onPractice={fromHub((l) => withWords(l, 'practice'))} onTest={fromHub((l) => withWords(l, 'test'))} onGame={(m, l) => { setFromPhx(true); game(m, l) }} />
            </React.Suspense>
          </div>
        )}
      </div>
    </div>
  )
}
