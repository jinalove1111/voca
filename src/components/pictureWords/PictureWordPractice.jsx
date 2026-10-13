// 그림 단어 연습(249차, 테스터 전용; 251차 카드 한 장 흐름). 단어마다 한 카드에서: 그림+단어+뜻 → 발음 듣기 → 따라 말하기 → 내 목소리 듣기 → 다시 말하기 → 다음.
// 연습(카드) 뒤에 게임·시험을 고르고, 시험은 그림만 보고 맞힌 뒤 틀린 단어를 복습한다.
// 상태는 React state뿐(새로고침하면 사라짐). 저장·네트워크·보상 호출 0. 녹음은 기기 메모리 전용(useLocalRecorder) — 업로드·채점·판정 없음.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LEVELS, learnableWords, shopSets, wordsForLevel } from '../../data/pictureWords/index.js'
import { buildSession, buildQuiz, reviewQueue, reviewNext, startStep, summarise } from '../../utils/pictureWords/practice.js'
import { stopSpeaking } from '../../utils/speech'
import useLocalRecorder from '../../hooks/useLocalRecorder'
import { BTN, ClassScene, GamePicture, GameStyle, HomeImg, MUTED, MenuPic, PwProgress, ROLE, T2, T3, W, WordStrip, playEn, useWide } from './pictureImg.jsx'
import LessonRecorder from './LessonRecorder.jsx'
import SfxControl from './SfxControl.jsx'
import { playSfx } from '../../utils/pictureWords/sfx.js'

// 게임/가게 선반은 열 때만 받는 추가 청크
const PictureGames = React.lazy(() => import('./PictureGames'))
// PAUL PHONICS(폴 파닉스, 253차 시제품 → 254차 5권 구조)도 별도 lazy 청크 — 테스터가 해당 버튼을 눌러야만 받는다
const PaulPhonics = React.lazy(() => import('../phonics/PaulPhonics'))

const GO = `${BTN} ${ROLE.go.strong}`
const GO_SOFT = `${BTN} ${ROLE.go.soft}`
const PLAY = `${BTN} ${ROLE.play.soft}`
const SETBTN = 'min-h-[44px] rounded-xl text-base font-black btn-press disabled:opacity-40'
const SESSION_SIZE = 6
const POOL = learnableWords()

const newSeed = () => Date.now() % 2147483647
const short = (t) => t.split(' — ').pop() // "Phonics — 짧고 쉬운 단어" → "짧고 쉬운 단어"

// 게임 놀이터 하위 화면의 큰 메뉴 타일: 그림 왼쪽, 글 오른쪽
const Tile = ({ id, role, asset, title, sub, onClick }) => (
  <button type="button" data-testid={id} onClick={onClick} className={`pw-tile-menu pw-tm-${role}`}>
    <span className="flex-none"><MenuPic asset={asset} /></span>
    <span className="min-w-0"><span className="block text-2xl font-black text-gray-900">{title}</span><span className="block text-base text-gray-700">{sub}</span></span>
  </button>
)

// 첫 화면: 승인 그림 속 카드 3장이 진짜 버튼(넓은 화면=전체 그림+투명 버튼, 좁은 화면=조각 재배치). 그림 실패 시 글자 버튼.
const MENU = [['pwg-open-phonics', '파닉스 모험', '소리를 배워요', 'go', 'card-phonics'], ['pwh-open-speak', '말하기', '듣고 따라 말해요', 'say', 'card-speak'], ['pwh-open-play', '게임 놀이터', '놀면서 익혀요', 'play', 'card-play']]
function PhonicsHome({ fns, onExit }) {
  const wide = useWide()
  const [bad, setBad] = useState('') // 실패한 배치('w'|'n') — 배치가 바뀌면 다시 그림을 시도한다
  const L = wide ? 'w' : 'n'
  const fail = bad === L
  const err = () => setBad(L)
  const btn = ([id, t, sub, role, k], i) => (
    <button key={id} type="button" data-testid={id} aria-label={t} onClick={fns[i]} className={fail ? `${BTN} ${ROLE[role].soft} w-full` : undefined}>
      {fail ? <><span className="block text-2xl">{t}</span><span className="block text-base">{sub}</span></> : wide ? <span className="sr-only">{t}</span> : <HomeImg k={k} alt={t} onError={err} />}
    </button>
  )
  return (
    <div className={`space-y-3${wide ? '' : ' pph-n'}`}>
      {fail ? MENU.map(btn) : wide ? <div className="pph-w"><HomeImg k="full" onError={err} />{MENU.map(btn)}</div> : (
        <>
          <HomeImg k="sign" className="pph-s" onError={err} />
          <HomeImg k="teacher" className="pph-t" onError={err} />
          <div className="pph-row">{MENU.map(btn)}</div>
        </>
      )}
      <div className="mx-auto flex max-w-md items-center gap-2"><div className="min-w-0 flex-1"><SfxControl /></div><button type="button" data-testid="pwp-exit" onClick={onExit} className={`${BTN} bg-gray-200 text-gray-700`}>나가기</button></div>
      <span aria-hidden="true" className="pph-chip">(테스트)</span>
    </div>
  )
}

// 단어를 누르면 "발음 듣기"와 같은 함수로 전체 단어 소리가 난다. hide = 글자 카드(단어가 카드 안에 이미 있음)
const WordBtn = ({ word, className, onPlay }) => <button type="button" data-testid="pwp-word" onClick={() => { onPlay?.(); playEn(word.en) }} className={className}>{word.en}</button>

function WordText({ word, hide, onPlay }) {
  if (hide && !word.ko) return null
  return (
    <div className="text-center">
      {!hide && <WordBtn word={word} onPlay={onPlay} className={`${T3} min-h-[44px]`} />}
      {word.ko && <p data-testid="pwp-ko" className="text-lg text-gray-600 break-words">{word.ko}</p>}
    </div>
  )
}

// round: 레슨 카드의 둥근 스피커(글자는 sr-only)
const ListenBtn = ({ word, strong, onPlay, round }) => (
  <button type="button" data-testid="pwp-listen" onClick={() => { onPlay?.(); playEn(word.en) }} className={round ? `pw-spk ml-auto ${ROLE.listen.strong}` : `${BTN} ${strong ? ROLE.listen.strong : ROLE.listen.soft} w-full`}>{round ? <><span aria-hidden="true">🔊</span><span className="sr-only"> 발음 듣기</span></> : '🔊 발음 듣기'}</button>
)

// 연습 카드: 단어마다 한 장에 그림·단어·뜻·듣기·녹음(따라 말하기/내 목소리 듣기/다시 말하기)·다음.
// 녹음기는 이 컴포넌트가 단어들 사이에서 하나를 쓴다(마이크는 카드 묶음을 떠날 때 놓는다). 단어를 바꾸면 녹음을 버린다 — 녹음 중에 넘기면 멈춘 뒤 버린다.
// "말해 봤어요" 표시는 판정이 아니다 — 점수·별 없음, 녹음은 기기 밖으로 나가지 않는다.
export function PracticeCards({ words, onDone, onExit, single = false, nextLabel = '➡️ 다음 단어' }) {
  const rec = useLocalRecorder()
  const [i, setI] = useState(0)
  const [said, setSaid] = useState(() => new Set())
  const [heard, setHeard] = useState(() => new Set()) // 듣기/단어 버튼을 누른 단어 — 지금 단계(듣기→말하기→다음)만 강조한다
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
  const hear = () => setHeard((s) => new Set(s).add(w.id))
  const step = !heard.has(w.id) ? 'listen' : !said.has(w.id) ? 'say' : 'next'
  const line = { listen: '잘 들어 봐요!', say: '따라 말해 볼까요?', next: '좋아요! 다음으로 가요' }[step]
  const jump = (k) => k !== i && leave(() => setI(k))
  return (
    <div data-testid="pwp-card" data-word-index={i} data-step={step} className="pw-cls-card space-y-3">
      <div className="flex items-center justify-between">
        {onExit ? <button type="button" data-testid="pwp-back" aria-label="뒤로" onClick={() => leave(onExit)} className="pw-back btn-press">←</button> : <span />}
        <span className="pw-chip"><PwProgress testid="pwp-progress" n={i + 1} total={words.length} /></span>
      </div>
      <ClassScene line={line} bubble={<button type="button" data-testid="pwp-listen-bubble" aria-label="발음 듣기" onClick={() => { hear(); playEn(w.en) }} className={`pw-spk pw-bub ${ROLE.listen.strong}`} />}>
        <div className="pw-cls-box">
          {w.asset ? <GamePicture word={w} testid="pwp-picture" /> : <div data-testid="pwp-text-card" className="pw-card"><div className="pw-pic flex flex-col items-center justify-center gap-2"><span className="pw-card-tag">듣고 따라 말해요</span><WordBtn word={w} onPlay={hear} className="break-words text-4xl font-black text-gray-900" /></div></div>}
          <div className="mt-1 flex items-center gap-2">
            <div className="min-w-0 flex-1"><WordText word={w} hide={!w.asset} onPlay={hear} /></div>
            <ListenBtn word={w} round onPlay={hear} />
          </div>
          {said.has(w.id) && <p data-testid="pwp-said-mark" className="text-center text-sm font-bold text-emerald-700">말해 봤어요</p>}
        </div>
      </ClassScene>
      <div data-testid="pwp-rec" className={`space-y-1 rounded-2xl p-1${step === 'say' ? ' ring-2 ring-rose-300' : ''}`}>
        {status === 'recording' && <p data-testid="pwp-rec-live" className="text-center text-base font-black text-red-600">녹음 중… {rec.elapsed}초</p>}
        <LessonRecorder rec={rec} />
      </div>
      <div className="flex gap-2">
        {!single && <button type="button" data-testid="pwp-prev" onClick={() => leave(() => setI(i - 1))} disabled={i === 0} className={`${SETBTN} flex-1 bg-gray-200 text-gray-700`}>이전</button>}
        <button type="button" data-testid="pwp-next" onClick={() => (lastOne ? (stopSpeaking(), onDone()) : leave(() => setI(i + 1)))} className={`${SETBTN} flex-1 ${step === 'next' ? 'bg-emerald-300 text-emerald-950' : ROLE.go.soft}`}>{single ? nextLabel : '➡️ 다음 단어'}</button>
      </div>
      {!single && <WordStrip words={words} i={i} said={said} onPick={jump} />}
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
      {answered && <button type="button" data-testid="pwp-next" onClick={() => onNext(right)} className={`${GO} w-full`}>다음</button>}
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
      <button type="button" data-testid="pwp-game-hammer" onClick={() => onGame('hammer', words)} className={`${PLAY} w-full`}>{a}</button>
      <button type="button" data-testid="pwp-game-hidden" onClick={() => onGame('hidden', words)} className={`${PLAY} w-full`}>{b}</button>
    </>
  )

  let body, progress = ''
  if (stage === 'card') {
    body = <PracticeCards words={all} onDone={() => setStage('end')} onExit={onOther} />
  } else if (stage === 'end') {
    body = (
      <div data-testid="pwp-end" className="space-y-3 text-center">
        <p className={T2}>다음은 게임!</p>
        <p className="text-base text-gray-600">같은 단어로 게임을 하거나 시험을 볼 수 있어요</p>
        {gameBtns('알파벳 망치로', '숨은 글자로')}
        <button type="button" data-testid="pwp-go-test" onClick={startTest} className={`${BTN} ${ROLE.review.strong} w-full`}>시험 보기</button>
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
          <button type="button" data-testid="pwp-next" onClick={() => setStage('summary')} className={`${GO} w-full`}>결과 보기</button>
        </div>
      )
    } else {
      const rw = byId(rev.queue[0])
      body = rev.phase === 'card' ? (
        <div data-testid="pwp-review-card" data-kind="word" className="space-y-3">
          <p className="text-center text-sm font-black text-amber-700">다시 볼 단어 {rev.queue.length}개 남았어요</p>
          <PracticeCards key={`${rw.id}-${rev.round}`} words={[rw]} single nextLabel="➡️ 문제 풀기" onExit={onOther} onDone={() => setRev({ ...rev, phase: 'quiz' })} />
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
        <button type="button" data-testid="pwp-again" onClick={onAgain} className={`${GO} w-full`}>다시 하기</button>
        <button type="button" data-testid="pwp-other-set" onClick={onOther} className={`${GO_SOFT} w-full`}>다른 묶음</button>
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
  const [home, setHome] = useState('main') // 첫 화면 | speak | play — 연습/게임이 끝나면 온 하위 화면으로 돌아온다
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
  let body, isMain = false
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
    const root = (h, kids) => <div data-testid="pwp-root" data-step="pick" data-index={0} data-home={h} className="space-y-3">{kids}</div>
    const head = (t, sub, tid) => <div className="text-center"><h2 data-testid={tid} className="text-2xl font-black text-gray-900">{t}</h2><p className="text-base text-gray-600">{sub}</p></div>
    const back = <button type="button" data-testid="pwh-back" onClick={() => setHome('main')} className={`${BTN} ${W.gray}`}>뒤로</button>
    if (home === 'speak') {
      body = root('speak', (
        <>
          {head('말하기', '묶음을 골라요', 'pwg-mode-practice')}
          <div className="grid grid-cols-2 gap-2">
            {[...sets].sort((a, b) => b.id.startsWith('level-') - a.id.startsWith('level-') || b.ready - a.ready).map((s) => (
              <div key={s.id} data-testid={`pwp-set-${s.id}`} data-ready={s.ready ? 'true' : 'false'} className="min-w-0 rounded-2xl border-2 border-rose-200 bg-white p-2 text-center">
                {s.id.startsWith('level-') ? <span className="block text-4xl">{s.id === 'level-phonics' ? '🔤' : '💬'}</span> : s.words[0]?.asset && <MenuPic asset={s.words[0].asset} className="mx-auto h-16 w-16 object-contain" />}
                <p className="break-words text-base font-black leading-tight text-gray-800">{short(s.labelKo)}</p>
                <p className={MUTED}>{s.ready ? `${s.words.length}개` : '준비 중'}</p>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <button type="button" data-testid={`pwp-start-practice-${s.id}`} disabled={!s.ready} onClick={() => start(s.id, 'practice')} className={`${SETBTN} ${ROLE.go.soft}`}>연습</button>
                  <button type="button" data-testid={`pwp-start-test-${s.id}`} disabled={!s.ready} onClick={() => start(s.id, 'test')} className={`${SETBTN} ${ROLE.review.soft}`}>시험</button>
                </div>
              </div>
            ))}
          </div>
          {back}
        </>
      ))
    } else if (home === 'play') {
      body = root('play', (
        <>
          {head('게임 놀이터', '하고 싶은 게임을 골라요')}
          <div className="flex flex-wrap justify-center gap-2">
            {LEVELS.map((l) => (
              <button key={l.id} type="button" data-testid={`pwg-level-${l.id}`} data-active={level === l.id ? 'true' : 'false'} disabled={!l.enabled} onClick={() => setLevel(l.id)}
                className={`min-h-[44px] rounded-full px-3 py-1 text-center text-sm font-black leading-tight btn-press disabled:opacity-40 ${level === l.id ? ROLE.play.strong : 'border-2 border-amber-300 bg-white text-amber-900'}`}>{short(l.labelKo)}</button>
            ))}
          </div>
          <Tile id="pwg-mode-hammer" role="play" asset="pencil" title="알파벳 망치" sub="글자를 순서대로 눌러요" onClick={() => game('hammer')} />
          <Tile id="pwg-mode-hidden" role="play" asset="key" title="숨은 글자" sub="빠진 글자를 찾아요" onClick={() => game('hidden')} />
          <Tile id="pwg-mode-shelf" role="play" asset="basket" title="가게 구경" sub="그림을 구경해요" onClick={() => setView({ kind: 'shelf' })} />
          {back}
        </>
      ))
    } else {
      isMain = true
      body = root('main', <PhonicsHome onExit={onExit} fns={[() => { setSel(null); setView(null); setPhx(true) }, () => setHome('speak'), () => setHome('play')]} />)
    }
  }
  return (
    <div className="pw-page min-h-screen overflow-x-hidden bg-gradient-to-br from-amber-50 to-emerald-50 px-4 py-4 pb-8">
      <div className="pw-wrap mx-auto max-w-lg min-w-0 space-y-3">
        <GameStyle />
        <h1 className={isMain ? 'sr-only' : 'pw-sign'}>PAUL PHONICS <span>(테스트)</span></h1>
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
