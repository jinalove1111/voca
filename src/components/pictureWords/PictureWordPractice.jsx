// 그림 단어 연습(249차, 테스터 전용). 보기 → 영국식 발음 듣기 → 따라 말하기 → 그림 보고 맞히기 → 복습.
// 상태는 React state뿐(새로고침하면 사라짐). 저장·네트워크·보상 호출 0. 녹음은 메모리 전용(useLocalRecorder).
import React, { useEffect, useMemo, useState } from 'react'
import { LEVELS, learnableWords, shopSets } from '../../data/pictureWords/index.js'
import { STEPS, buildSession, buildQuiz, reviewQueue, summarise } from '../../utils/pictureWords/practice.js'
import { playWordAudio, stopSpeaking } from '../../utils/speech'
import useLocalRecorder from '../../hooks/useLocalRecorder'
import { RecorderControls, PARTNER_REC_LABELS } from '../SpeakingPracticeItem'
import { imgUrl } from './pictureImg.jsx'

// 게임/가게 선반은 열 때만 받는 추가 청크
const PictureGames = React.lazy(() => import('./PictureGames'))

const BTN = 'min-h-[44px] px-4 py-3 rounded-2xl font-black text-lg btn-press disabled:opacity-40'
const PRIMARY = `${BTN} bg-purple-600 text-white`
const SOFT = `${BTN} bg-sky-100 text-sky-700`
const STEP_KO = { look: '그림 보기', listen: '영국식 발음 듣기', repeat: '따라 말하기', quiz: '그림 보고 단어 맞히기', review: '복습' }
const SESSION_SIZE = 6
const POOL = learnableWords()

const listen = (en) => playWordAudio(null, en, { source: 'pictureWords' })
const newSeed = () => Date.now() % 2147483647

function Picture({ word }) {
  return <img data-testid="pwp-picture" src={imgUrl(word.asset)} alt="그림" draggable={false} className="mx-auto h-44 w-44 max-w-full rounded-2xl bg-white object-contain card-shadow sm:h-56 sm:w-56" />
}

function WordText({ word }) {
  return (
    <div className="text-center">
      <p data-testid="pwp-word" className="text-3xl font-black text-gray-900 break-words">{word.en}</p>
      <p data-testid="pwp-ko" className="text-lg text-gray-600 break-words">{word.ko}</p>
    </div>
  )
}

const ListenBtn = ({ word, onPress }) => (
  <button type="button" data-testid="pwp-listen" onClick={() => { onPress?.(word.id); listen(word.en) }} className={`${SOFT} w-full`}>🔊 듣기</button>
)

function Nav({ i, onPrev, onNext, nextLabel }) {
  return (
    <div className="flex gap-2">
      <button type="button" data-testid="pwp-prev" onClick={onPrev} disabled={i === 0} className={`${BTN} flex-1 bg-gray-200 text-gray-700`}>이전</button>
      <button type="button" data-testid="pwp-next" onClick={onNext} className={`${PRIMARY} flex-1`}>{nextLabel}</button>
    </div>
  )
}

// 문제 하나. 답하기 전에는 영어 단어·뜻·듣기를 DOM에 올리지 않는다(조건부 마운트). 그림 alt도 중립 문구.
function QuizCard({ word, q, onAnswered, onNext }) {
  const [picked, setPicked] = useState(null)
  const answered = picked !== null
  const right = answered && picked === q.correctId
  return (
    <div className="space-y-3">
      <Picture word={word} />
      <p className="text-center text-base font-bold text-gray-700">그림에 맞는 단어를 골라요</p>
      <div className="grid grid-cols-2 gap-2">
        {q.options.map((o, k) => (
          <button key={o.id} type="button" data-testid={`pwp-opt-${k}`} disabled={answered}
            onClick={() => { if (answered) return; setPicked(o.id); onAnswered(o.id === q.correctId) }}
            className={`${BTN} break-words border-2 ${answered && o.id === q.correctId ? 'border-green-500 bg-green-100 text-green-800' : answered && o.id === picked ? 'border-red-400 bg-red-100 text-red-700' : 'border-gray-200 bg-white text-gray-800'}`}>
            {o.en}
          </button>
        ))}
      </div>
      {answered && (
        <div data-testid="pwp-feedback" data-result={right ? 'right' : 'wrong'} className={`space-y-2 rounded-2xl p-3 ${right ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className="text-center text-lg font-black">{right ? '맞았어요!' : '아쉬워요, 다시 봐요'}</p>
          <WordText word={word} />
          <ListenBtn word={word} />
        </div>
      )}
      {answered && <button type="button" data-testid="pwp-next" onClick={() => onNext(right)} className={`${PRIMARY} w-full`}>다음</button>}
    </div>
  )
}

function Session({ set, seed, onAgain, onOther, onExit, onGame }) {
  const words = useMemo(() => buildSession(set.words, { size: SESSION_SIZE, seed }), [set, seed])
  const quiz = useMemo(() => buildQuiz(words, POOL, seed), [words, seed])
  const rec = useLocalRecorder()
  const [step, setStep] = useState('look')
  const [i, setI] = useState(0)
  const [heard, setHeard] = useState(() => new Set())
  const [said, setSaid] = useState(() => new Set())
  const [results, setResults] = useState([])
  const [rev, setRev] = useState(null) // { queue:[ids], phase:'card'|'quiz'|'clear', round }
  const [done, setDone] = useState(false)

  // 단계/단어가 바뀌면 재생 중인 소리와 녹음을 정리한다
  useEffect(() => { stopSpeaking(); rec.reset('RESET') }, [step, i, rev?.phase, rev?.round]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stopSpeaking, [])

  const byId = (id) => words.find((x) => x.id === id)
  const markHeard = (id) => setHeard((s) => new Set(s).add(id))
  const w = words[i]
  const go = (s) => { setStep(s); setI(0) }
  const lastOne = i + 1 >= words.length
  const nav = (nextStep, nextLabel) => ({ i, onPrev: () => setI(i - 1), onNext: () => (lastOne ? go(nextStep) : setI(i + 1)), nextLabel: lastOne ? nextLabel : '다음' })
  const answer = (id) => (correct) => setResults((r) => [...r, { id, correct }])

  const toReview = () => {
    const q = reviewQueue(results)
    setStep('review'); setI(0)
    setRev(q.length ? { queue: q, phase: 'card', round: 0 } : { queue: [], phase: 'clear', round: 0 })
  }
  const afterReviewAnswer = (correct) => setRev((r) => {
    const [head, ...rest] = r.queue
    const queue = correct ? rest : [...rest, head]
    return queue.length ? { queue, phase: 'card', round: r.round + 1 } : { queue, phase: 'clear', round: r.round + 1 }
  })

  let body
  if (done) {
    const s = summarise(results)
    body = (
      <div data-testid="pwp-summary" className="space-y-3 text-center">
        <p className="text-2xl font-black text-gray-900">연습을 마쳤어요</p>
        <p className="text-lg text-gray-700">처음에 맞힌 단어 <span data-testid="pwp-summary-first-try" className="font-black text-purple-700">{s.firstTryCorrect} / {s.total}</span></p>
        {s.needsReview.length > 0 && (
          <div className="rounded-2xl bg-amber-50 p-3 text-left text-sm">
            <p className="font-black text-amber-800">복습한 단어</p>
            <ul className="mt-1">{s.needsReview.map((id) => <li key={id} data-testid="pwp-summary-review" className="break-words">{byId(id).en} — {byId(id).ko}</li>)}</ul>
          </div>
        )}
        <button type="button" data-testid="pwp-game-hammer" onClick={() => onGame('hammer', words)} className={`${SOFT} w-full`}>이 단어로 알파벳 망치</button>
        <button type="button" data-testid="pwp-game-hidden" onClick={() => onGame('hidden', words)} className={`${SOFT} w-full`}>이 단어로 숨은 글자</button>
        <button type="button" data-testid="pwp-again" onClick={onAgain} className={`${PRIMARY} w-full`}>다시 하기</button>
        <button type="button" data-testid="pwp-other-set" onClick={onOther} className={`${SOFT} w-full`}>다른 묶음</button>
        <button type="button" data-testid="pwp-exit" onClick={onExit} className={`${BTN} w-full bg-gray-200 text-gray-700`}>나가기</button>
      </div>
    )
  } else if (step === 'look') {
    body = (<div className="space-y-3"><Picture word={w} /><WordText word={w} /><Nav {...nav('listen', '발음 듣기로')} /></div>)
  } else if (step === 'listen') {
    const unheard = words.filter((x) => !heard.has(x.id))
    body = (
      <div className="space-y-3">
        <Picture word={w} /><WordText word={w} />
        <ListenBtn word={w} onPress={markHeard} />
        <p data-testid="pwp-heard" className="text-center text-sm text-gray-600">{heard.has(w.id) ? '들었어요 ✓' : '아직 안 들었어요'}{unheard.length > 0 ? ` · 아직 안 들은 단어 ${unheard.length}개` : ''}</p>
        <Nav {...nav('repeat', '따라 말하기로')} />
      </div>
    )
  } else if (step === 'repeat') {
    body = (
      <div className="space-y-3">
        <Picture word={w} /><WordText word={w} />
        <ListenBtn word={w} onPress={markHeard} />
        <p className="text-center text-sm text-gray-600">듣고 소리 내어 따라 말해요. 녹음은 안 해도 돼요</p>
        <div data-testid="pwp-rec" className="space-y-1"><RecorderControls rec={rec} prefix="pwp-rec" labels={PARTNER_REC_LABELS} idleText="" /></div>
        <button type="button" data-testid="pwp-said" onClick={() => setSaid((s) => new Set(s).add(w.id))}
          className={`${BTN} w-full border-2 ${said.has(w.id) ? 'border-green-400 bg-green-50 text-green-700' : 'border-purple-300 bg-white text-purple-700'}`}>{said.has(w.id) ? '다 말했어요 ✓' : '다 말했어요'}</button>
        <Nav {...nav('quiz', '단어 맞히기로')} />
      </div>
    )
  } else if (step === 'quiz') {
    body = <QuizCard key={w.id} word={w} q={quiz[i]} onAnswered={answer(w.id)} onNext={() => (lastOne ? toReview() : setI(i + 1))} />
  } else if (rev.phase === 'clear') {
    body = (
      <div data-testid="pwp-review-card" data-kind="clear" className="space-y-3 text-center">
        <p className="text-2xl font-black text-green-700">모두 맞혔어요</p>
        <p className="text-gray-600">다시 볼 단어가 없어요</p>
        <button type="button" data-testid="pwp-next" onClick={() => setDone(true)} className={`${PRIMARY} w-full`}>결과 보기</button>
      </div>
    )
  } else {
    const rw = byId(rev.queue[0])
    body = rev.phase === 'card' ? (
      <div data-testid="pwp-review-card" data-kind="word" className="space-y-3">
        <p className="text-center text-sm font-black text-amber-700">다시 볼 단어 {rev.queue.length}개 남았어요</p>
        <Picture word={rw} /><WordText word={rw} />
        <ListenBtn word={rw} />
        <button type="button" data-testid="pwp-next" onClick={() => setRev({ ...rev, phase: 'quiz' })} className={`${PRIMARY} w-full`}>문제 풀기</button>
      </div>
    ) : (
      <QuizCard key={`${rw.id}-${rev.round}`} word={rw} q={buildQuiz([rw], POOL, seed + 7919 * (rev.round + 1))[0]} onAnswered={answer(rw.id)} onNext={afterReviewAnswer} />
    )
  }

  const counted = !done && step !== 'review'
  return (
    <div data-testid="pwp-root" data-step={done ? 'summary' : step} data-index={i} data-seed={seed} className="space-y-3">
      <p className="text-center text-sm font-black text-purple-700">
        {done ? '결과' : `${STEPS.indexOf(step) + 1} / ${STEPS.length} · ${STEP_KO[step]}`}{counted ? ` · ${i + 1} / ${words.length}` : ''}
      </p>
      {body}
    </div>
  )
}

export default function PictureWordPractice({ onExit }) {
  const [sel, setSel] = useState(null) // 단어 연습: { shop, seed } 또는 { words, seed }
  const [view, setView] = useState(null) // 게임/선반: { kind:'game', mode, from? } | { kind:'shelf' }
  const [level, setLevel] = useState('phonics')
  const sets = useMemo(() => shopSets(), [])
  const set = sel && (sel.words ? { words: sel.words } : sets.find((x) => x.shop === sel.shop))
  const practice = (words) => { setView(null); setSel({ words, seed: newSeed() }) }
  const game = (mode, from) => { setSel(null); setView({ kind: 'game', mode, from }) }
  let body
  if (view) {
    body = (
      <React.Suspense fallback={<p className="text-center text-sm text-gray-500">불러오는 중...</p>}>
        <PictureGames key={view.kind + (view.mode || '')} kind={view.kind} mode={view.mode} level={level} from={view.from} onPractice={practice} onMenu={() => setView(null)} onExit={onExit} />
      </React.Suspense>
    )
  } else if (set) {
    body = <Session key={sel.seed} set={set} seed={sel.seed} onAgain={() => setSel({ ...sel, seed: newSeed() })} onOther={() => setSel(null)} onExit={onExit} onGame={game} />
  } else {
    body = (
      <div data-testid="pwp-root" data-step="pick" data-index={0} className="space-y-2">
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
        <button type="button" data-testid="pwg-mode-shelf" onClick={() => setView({ kind: 'shelf' })} className={`${SOFT} w-full`}>가게 구경</button>
        <p className="text-center text-sm text-gray-600">연습할 묶음을 골라요</p>
        <div className="grid grid-cols-2 gap-2">
          {sets.map((s) => (
            <button key={s.shop} type="button" data-testid={`pwp-set-${s.shop}`} disabled={!s.ready} onClick={() => setSel({ shop: s.shop, seed: newSeed() })}
              className={`${BTN} border-2 border-purple-200 bg-white text-purple-700`}>
              {s.labelKo}<span className="block text-xs font-bold text-gray-500">{s.ready ? `${s.words.length}개` : '준비 중'}</span>
            </button>
          ))}
        </div>
        <button type="button" data-testid="pwp-exit" onClick={onExit} className={`${BTN} w-full bg-gray-200 text-gray-700`}>나가기</button>
      </div>
    )
  }
  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-purple-50 to-sky-50 px-4 py-4 pb-8">
      <div className="mx-auto max-w-lg min-w-0 space-y-3">
        <h1 className="text-center text-xl font-black text-gray-800">그림 단어 연습 <span className="text-xs text-red-600">(테스트)</span></h1>
        {body}
      </div>
    </div>
  )
}
