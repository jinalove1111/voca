// scripts/testComponentCallbackDoubleInvoke.mjs — invariant 7 회귀 가드
// ("중복 콜백이 보상을 중복시키면 안 된다")를 컴포넌트 레이어에서 증명.
// TEST-ONLY: src/ 어떤 파일도 수정하지 않는다. 네트워크/DB/실 브라우저 0.
//
// 기법: scripts/testQuizStepReset.mjs + scripts/testSpeechBtnSpeakingStall.mjs
// 의 방식을 그대로 재사용 — 진짜 컴포넌트 소스를 esbuild로 번들하되 react /
// react/jsx-runtime과 브라우저 전용 import만 가상 모듈로 치환하고, 손으로
// 만든 최소 훅 런타임(mountComponent, 아래)으로 실제 소스 코드를 그대로
// 실행한다. 로직을 손으로 베끼지 않는다.
//
// 대상 4가지(모두 실제 프로덕션 소스, 미수정):
//   1. WordDetail.jsx QuizStep — onQuizAnswer/onMarkQuizSolved
//   2. SpellingQuestion.jsx — onResult
//   3. WordDetail.jsx SpeechBtn — onSuccess/onAttempt
//   4. GuidedSession.jsx handleQuizAnswer(=WordDetail에 내려주는 onQuizAnswer)
//
// 각 시나리오는 "한 번의 실제 사용자 행동이 콜백을 두 번 발화시키는" 상황을
// 재현한다 — 두 번째 클릭이 재렌더 이후에 일어나는 경우(진짜 두 번의 DOM
// 클릭 이벤트를 모사 — 매번 최신 트리에서 핸들러를 다시 조회)와, 완전히
// 동일한 핸들러 인스턴스가 두 번 발화하는 경우(중복 이벤트 바인딩/두 개의
// 독립적 완료 경로가 경합하는 경우 — ref 가드가 실제로 방어하는 대상)를
// 구분해서 각각에 맞는 방식으로 재현한다.
//
// 실행: node scripts/testComponentCallbackDoubleInvoke.mjs
import fs from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'
import { createFakeClock } from './fakeReact.mjs'

let failures = 0
let passes = 0
function check(label, cond, detail) {
  if (cond) { passes++; console.log(`  PASS  ${label}`) }
  else { failures++; console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`) }
}
function section(title) { console.log(`\n${title}`) }

const TMP = path.resolve('scripts/.tmp/callback-double-invoke')
fs.mkdirSync(TMP, { recursive: true })

// ═══════════════════════════════════════════════════════════════════════
// 0. 공용 미니 컴포넌트 호스트 (testQuizStepReset.mjs의 mountComponent와
//    동일한 원리 — useState/useEffect/useRef/useMemo/useCallback) + StrictMode
//    이중 실행 옵션. fakeReact.mjs는 createFakeClock만 읽기 전용으로 재사용
//    (해당 파일은 수정하지 않음 — 다른 세션 소유 파일 아님, 기존 관례 재사용).
// ═══════════════════════════════════════════════════════════════════════
function depsEqual(a, b) {
  if (a === undefined || b === undefined) return false
  if (a.length !== b.length) return false
  return a.every((v, i) => Object.is(v, b[i]))
}

// StrictMode(dev) 이중 호출 모사: React 18은 effect마다 setup → cleanup →
// setup을 커밋 시점에 한 번 더 실행해 "정리 누락"류 버그를 잡아낸다. strict
// 옵션이 켜지면 새로 커밋되는 모든 effect에 대해 이 패턴을 그대로 재현한다.
function mountComponent(fn, initialProps, clock, { strict = false } = {}) {
  const cells = []
  let cursor = 0
  let unmounted = false
  const inst = { tree: null, props: initialProps }

  const api = {
    useState(initial) {
      const i = cursor++
      if (!(i in cells)) cells[i] = { kind: 's', value: typeof initial === 'function' ? initial() : initial }
      const cell = cells[i]
      return [cell.value, (u) => {
        if (unmounted) return
        const next = typeof u === 'function' ? u(cell.value) : u
        if (!Object.is(next, cell.value)) { cell.value = next; render() }
      }]
    },
    useRef(initial) {
      const i = cursor++
      if (!(i in cells)) cells[i] = { kind: 'r', current: initial }
      return cells[i]
    },
    useMemo(factory, deps) {
      const i = cursor++
      const prev = cells[i]
      if (!prev || !depsEqual(prev.deps, deps)) cells[i] = { kind: 'm', value: factory(), deps }
      return cells[i].value
    },
    useCallback(cb, deps) { return api.useMemo(() => cb, deps) },
    useEffect(effectFn, deps) {
      const i = cursor++
      cells[i] = cells[i] || { kind: 'e' }
      cells[i].pending = { effectFn, deps }
    },
  }

  const withHooks = (body) => {
    const prevHooks = globalThis.__FAKE_HOOKS__
    globalThis.__FAKE_HOOKS__ = api
    try { return body() } finally { globalThis.__FAKE_HOOKS__ = prevHooks }
  }

  function commitEffect(cell, effectFn) {
    const first = effectFn() || undefined
    if (strict) {
      if (typeof first === 'function') first()
      cell.cleanup = effectFn() || undefined
    } else {
      cell.cleanup = first
    }
  }

  function render(nextProps) {
    if (nextProps !== undefined) inst.props = nextProps
    withHooks(() => {
      cursor = 0
      inst.tree = fn(inst.props)
      for (const cell of cells) {
        if (!cell || cell.kind !== 'e' || !cell.pending) continue
        const { effectFn, deps } = cell.pending
        cell.pending = null
        if (!('committedDeps' in cell) || !depsEqual(cell.committedDeps, deps)) {
          if (typeof cell.cleanup === 'function') cell.cleanup()
          commitEffect(cell, effectFn)
          cell.committedDeps = deps
        }
      }
    })
  }

  inst.render = render
  inst.unmount = () => {
    unmounted = true
    withHooks(() => {
      for (const cell of cells) if (cell?.kind === 'e' && typeof cell.cleanup === 'function') cell.cleanup()
    })
  }
  render(initialProps)
  return inst
}

// 실행 중인 이벤트 핸들러/effect 안의 setTimeout/clearTimeout을 전부 fake
// clock으로 돌린다 — mountComponent 자체가 아니라 시나리오 블록 전체를
// 감싸서 클릭 핸들러가 직접 부르는 setTimeout(예: SpellingQuestion.markCorrect,
// SpeechBtn.handleClick)까지 결정적으로 만든다.
function patchClock(clock) {
  const st = globalThis.setTimeout, ct = globalThis.clearTimeout
  globalThis.setTimeout = clock.setTimeout
  globalThis.clearTimeout = clock.clearTimeout
  return () => { globalThis.setTimeout = st; globalThis.clearTimeout = ct }
}

// SpeechBtn 시나리오 전용 — 예약된 모든 타이머를 (clearTimeout으로 지워진
// 것까지 포함해) 계속 들고 있어, "타이머가 취소됐어야 하는데도 콜백이 결국
// 실행된" 레이스를 수동으로 재현할 수 있게 한다.
function recordingClock() {
  const clock = createFakeClock()
  const scheduled = []
  return {
    setTimeout(fn, ms) { const id = clock.setTimeout(fn, ms); scheduled.push({ id, fn, ms }); return id },
    clearTimeout(id) { clock.clearTimeout(id) },
    advance(ms) { clock.advance(ms) },
    pendingCount() { return clock.pendingCount() },
    scheduled,
  }
}

const flushMicrotasks = async (n = 30) => { for (let i = 0; i < n; i++) await Promise.resolve() }

// ── 렌더 트리 헬퍼 (testQuizStepReset.mjs와 동일한 원리) ────────────────────
const FRAGMENT = Symbol.for('fake.Fragment')
function walk(node, visit) {
  if (node == null || node === false || node === true) return
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return }
  if (typeof node === 'string' || typeof node === 'number') { visit(node); return }
  if (node.$$el) {
    visit(node)
    if (typeof node.type === 'string' || node.type === FRAGMENT) walk(node.props.children, visit)
  }
}
const textOf = (node) => { let out = ''; walk(node, (n) => { if (typeof n === 'string' || typeof n === 'number') out += n }); return out }
const allButtons = (tree) => { const out = []; walk(tree, (n) => { if (n?.$$el && n.type === 'button') out.push(n) }); return out }
const optionButtons = (tree) => allButtons(tree).filter((b) => 'disabled' in b.props)
const findInput = (tree) => { let el = null; walk(tree, (n) => { if (!el && n?.$$el && n.type === 'input') el = n }); return el }
const findButtonByText = (tree, txt) => allButtons(tree).find((b) => textOf(b).includes(txt))
// GuidedSession이 렌더하는 (가상) WordDetail 엘리먼트 탐지 — onQuizAnswer/
// onNext를 동시에 받는 컴포넌트는 이 화면에서 WordDetail뿐이다.
const findWordDetailEl = (tree) => {
  let el = null
  walk(tree, (n) => {
    if (!el && n?.$$el && typeof n.type === 'function' && typeof n.props?.onQuizAnswer === 'function' && typeof n.props?.onNext === 'function') el = n
  })
  return el
}

const vstub = (contents) => ({ contents, loader: 'js' })
const REACT_STUB = `
export const useState = (...a) => globalThis.__FAKE_HOOKS__.useState(...a)
export const useEffect = (...a) => globalThis.__FAKE_HOOKS__.useEffect(...a)
export const useRef = (...a) => globalThis.__FAKE_HOOKS__.useRef(...a)
export const useMemo = (...a) => globalThis.__FAKE_HOOKS__.useMemo(...a)
export const useCallback = (...a) => globalThis.__FAKE_HOOKS__.useCallback(...a)
export default { useState, useEffect, useRef, useMemo, useCallback }
`
const JSX_RUNTIME_STUB = `
export const Fragment = Symbol.for('fake.Fragment')
export function jsx(type, props, key) { return { $$el: true, type, key: key === undefined ? null : key, props: props || {} } }
export const jsxs = jsx
`

// ═══════════════════════════════════════════════════════════════════════
// 1~3. WordDetail.jsx 번들 — QuizStep/SpeechBtn 추출(실 파일은 esbuild
//      in-memory 로드 시에만 export 한 줄 추가, 디스크 파일은 절대 미수정).
// ═══════════════════════════════════════════════════════════════════════
const wordDetailAbsPath = path.resolve('src/components/WordDetail.jsx').replace(/\\/g, '/')
const wdEntryPath = path.join(TMP, 'wordDetailEntry.jsx')
fs.writeFileSync(wdEntryPath, `export { QuizStep, SpeechBtn } from '${wordDetailAbsPath}'\n`)

await esbuild.build({
  entryPoints: [wdEntryPath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: path.join(TMP, 'wordDetailParts.bundle.mjs'),
  jsx: 'automatic',
  logLevel: 'silent',
  plugins: [{
    name: 'worddetail-parts-stubs',
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'v:react', namespace: 'v' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'v:jsx', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/utils\/speech$/ }, () => ({ path: 'v:speech', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/utils\/wordLibrary$/ }, () => ({ path: 'v:wordlib', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/utils\/browserDetect$/ }, () => ({ path: 'v:browser', namespace: 'v' }))
      build.onResolve({ filter: /^\.\/InAppBrowserNotice$/ }, () => ({ path: 'v:inapp', namespace: 'v' }))
      build.onResolve({ filter: /^\.\/SpellingQuestion$/ }, () => ({ path: 'v:spelling', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/utils\/paulReactions$/ }, () => ({ path: 'v:paul', namespace: 'v' }))
      build.onResolve({ filter: /^\.\/HeroReaction$/ }, () => ({ path: 'v:hero', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/learning\/engine\/LearningEngine$/ }, () => ({ path: 'v:engine', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/learning\/adapters\/learningItem$/ }, () => ({ path: 'v:learnitem', namespace: 'v' }))

      // WordDetail.jsx는 QuizStep/SpeechBtn을 export하지 않는다 — 실 파일은
      // 디스크에서 절대 수정하지 않고, esbuild가 이 경로를 로드하는 순간의
      // in-memory 콘텐츠에만 export 한 줄을 덧붙인다(testSpeechBtnSpeakingStall.mjs와
      // 동일 기법).
      build.onLoad({ filter: /WordDetail\.jsx$/ }, (args) => {
        const src = fs.readFileSync(args.path, 'utf8')
        return { contents: src + '\nexport { QuizStep, SpeechBtn }\n', loader: 'jsx', resolveDir: path.dirname(args.path) }
      })

      build.onLoad({ filter: /^v:react$/, namespace: 'v' }, () => vstub(REACT_STUB))
      build.onLoad({ filter: /^v:jsx$/, namespace: 'v' }, () => vstub(JSX_RUNTIME_STUB))
      build.onLoad({ filter: /^v:speech$/, namespace: 'v' }, () => vstub(`
        export function playWordAudio(url, target, opts = {}) { opts.onEnd?.() }
        export const stopCurrentAudio = () => {}
        export const unlockAudio = () => {}
        export const getMicStream = () => Promise.resolve({})
        export const recordWithAutoStop = () => ({ promise: Promise.resolve(new Blob(['abcdefghij'])), stop() {} })
        export const transcribeViaServerSTT = async () => globalThis.__STT_HEARD__ ?? null
        export const SUCCESS_MSGS = ['ok']
        export const FAIL_MSGS = ['no']
        export const rndMsg = (a) => a[0]
      `))
      build.onLoad({ filter: /^v:wordlib$/, namespace: 'v' }, () => vstub('export const requestAudioGeneration = () => {}'))
      build.onLoad({ filter: /^v:browser$/, namespace: 'v' }, () => vstub('export const isInAppBrowser = () => false'))
      build.onLoad({ filter: /^v:inapp$/, namespace: 'v' }, () => vstub('export default function InAppBrowserNotice() { return null }'))
      build.onLoad({ filter: /^v:spelling$/, namespace: 'v' }, () => vstub('export default function SpellingQuestion() { return null }'))
      build.onLoad({ filter: /^v:paul$/, namespace: 'v' }, () => vstub(`
        export const pickReaction = () => ({ id: 'x', image: '/x.png', message: 'm' })
        export const playReactionSound = () => {}
        export const getReactionById = () => ({ id: 'x', image: '/x.png', message: 'm' })
      `))
      build.onLoad({ filter: /^v:hero$/, namespace: 'v' }, () => vstub('export default function HeroReaction() { return null }'))
      build.onLoad({ filter: /^v:engine$/, namespace: 'v' }, () => vstub('export default function LearningEngine() { return null }'))
      build.onLoad({ filter: /^v:learnitem$/, namespace: 'v' }, () => vstub('export const fromExample = () => null'))
    },
  }],
})
const { QuizStep, SpeechBtn } = await import(pathToFileURL(path.join(TMP, 'wordDetailParts.bundle.mjs')).href)

const classWords = [
  { id: 'w1', word: 'apple', meaning: '사과', wordAudioUrl: null },
  { id: 'w2', word: 'banana', meaning: '바나나', wordAudioUrl: null },
  { id: 'w3', word: 'cherry', meaning: '체리', wordAudioUrl: null },
]
const quizWord = classWords[0]

// ═══════════════════════════════════════════════════════════════════════
// 1. QuizStep — 정답 선택 후 두 번째 클릭(진짜 재렌더 이후의 두 번째 DOM
//    클릭을 모사 — 매번 최신 트리에서 핸들러를 다시 조회) → 1회만
// ═══════════════════════════════════════════════════════════════════════
section('1. WordDetail.jsx QuizStep — 정답 선택 후 연타(재렌더된 최신 버튼을 다시 클릭) → onQuizAnswer/onMarkQuizSolved 1회만')
{
  const clock = createFakeClock()
  const quizAnswerCalls = []
  let quizSolvedCalls = 0
  let doneCalls = 0
  const props = {
    word: quizWord, classWords,
    onDone: () => { doneCalls++ },
    onMarkQuizSolved: () => { quizSolvedCalls++ },
    onQuizAnswer: (id, correct) => quizAnswerCalls.push({ id, correct }),
  }
  const restore = patchClock(clock)
  let inst
  try {
    inst = mountComponent(QuizStep, props, clock)
    const opts1 = optionButtons(inst.tree)
    const correctIdx = opts1.findIndex((b) => textOf(b).slice(1) === quizWord.meaning)
    check('정답 보기를 찾음', correctIdx >= 0)
    opts1[correctIdx].props.onClick() // 1차: 실제 정답 클릭
    const opts2 = optionButtons(inst.tree) // isAnswered=true로 재렌더된 최신 트리
    opts2[(correctIdx + 1) % opts2.length].props.onClick() // 2차: 이미 답한 상태에서 다른 보기 연타
    opts2[correctIdx].props.onClick() // 2차: 정답 버튼 자체도 다시 탭
  } finally { restore() }
  check('onQuizAnswer 정확히 1회 (연타 가드, WordDetail.jsx QuizStep.handleSelect isAnswered 체크)', quizAnswerCalls.length === 1, `실제 ${quizAnswerCalls.length}회`)
  check('onMarkQuizSolved 정확히 1회', quizSolvedCalls === 1, `실제 ${quizSolvedCalls}회`)
  inst.unmount()
}

section('1b. 동일 시나리오를 StrictMode 방식(매 커밋마다 모든 useEffect를 setup→cleanup→setup으로 2회 실행)으로도 재현 — 자동 다음 넘김까지 정확히 1회')
{
  const clock = createFakeClock()
  const quizAnswerCalls = []
  let quizSolvedCalls = 0
  let doneCalls = 0
  const props = {
    word: quizWord, classWords,
    onDone: () => { doneCalls++ },
    onMarkQuizSolved: () => { quizSolvedCalls++ },
    onQuizAnswer: (id, correct) => quizAnswerCalls.push({ id, correct }),
  }
  const restore = patchClock(clock)
  let inst
  try {
    inst = mountComponent(QuizStep, props, clock, { strict: true })
    const opts1 = optionButtons(inst.tree)
    const correctIdx = opts1.findIndex((b) => textOf(b).slice(1) === quizWord.meaning)
    opts1[correctIdx].props.onClick()
    const opts2 = optionButtons(inst.tree)
    opts2[(correctIdx + 1) % opts2.length].props.onClick()
    check('StrictMode 이중 effect 실행에도 pending 타이머 정확히 1개(자동 다음 넘김 타이머 중복 없음)', clock.pendingCount() === 1, `실제 ${clock.pendingCount()}개`)
    clock.advance(1800) // 정답 후 자동 다음 넘김 타이머 발동
  } finally { restore() }
  check('StrictMode: onQuizAnswer 정확히 1회', quizAnswerCalls.length === 1, `실제 ${quizAnswerCalls.length}회`)
  check('StrictMode: onMarkQuizSolved 정확히 1회', quizSolvedCalls === 1, `실제 ${quizSolvedCalls}회`)
  check('StrictMode: 자동 다음 넘김(onDone) 정확히 1회', doneCalls === 1, `실제 ${doneCalls}회`)
  inst.unmount()
}

// ═══════════════════════════════════════════════════════════════════════
// 2. SpellingQuestion — 정답 제출 연타(같은 클릭 핸들러 인스턴스가 두 번
//    발화 — 실기기 더블탭/이벤트 중복 바인딩 재현) → onResult 1회만
//    (reportedRef 가드)
// ═══════════════════════════════════════════════════════════════════════
const sqEntry = 'src/components/SpellingQuestion.jsx'
await esbuild.build({
  entryPoints: [sqEntry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: path.join(TMP, 'SpellingQuestion.bundle.mjs'),
  jsx: 'automatic',
  logLevel: 'silent',
  plugins: [{
    name: 'spellingquestion-stubs',
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'v:react', namespace: 'v' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'v:jsx', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/utils\/speech$/ }, () => ({ path: 'v:speech', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/utils\/spelling$/ }, () => ({ path: 'v:spelling', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/utils\/paulReactions$/ }, () => ({ path: 'v:paul', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/hooks\/useStudent$/ }, () => ({ path: 'v:student', namespace: 'v' }))
      build.onResolve({ filter: /^\.\/HeroReaction$/ }, () => ({ path: 'v:hero', namespace: 'v' }))
      build.onLoad({ filter: /^v:react$/, namespace: 'v' }, () => vstub(REACT_STUB))
      build.onLoad({ filter: /^v:jsx$/, namespace: 'v' }, () => vstub(JSX_RUNTIME_STUB))
      build.onLoad({ filter: /^v:speech$/, namespace: 'v' }, () => vstub(`
        export const playWordAudio = () => {}
        export const playRepeating = () => () => {}
        export const stopCurrentAudio = () => {}
        export const playSuccessSound = () => {}
      `))
      build.onLoad({ filter: /^v:spelling$/, namespace: 'v' }, () => vstub(`
        export const isSpellingCorrect = (input, target) => String(input).trim().toLowerCase() === String(target).trim().toLowerCase()
        export const spellingHintFor = () => '_'
      `))
      build.onLoad({ filter: /^v:paul$/, namespace: 'v' }, () => vstub(`
        export const getReactionById = () => ({ id: 'x', image: '/x.png', message: 'm' })
        export const pickReaction = () => ({ id: 'x', image: '/x.png', message: 'm' })
      `))
      build.onLoad({ filter: /^v:student$/, namespace: 'v' }, () => vstub('export const spellingComboBonus = () => 0'))
      build.onLoad({ filter: /^v:hero$/, namespace: 'v' }, () => vstub('export default function HeroReaction() { return null }'))
    },
  }],
})
const { default: SpellingQuestion } = await import(pathToFileURL(path.join(TMP, 'SpellingQuestion.bundle.mjs')).href)

section('2. SpellingQuestion — 정답 제출 연타(동일 핸들러 두 번 발화) → onResult 1회만 (reportedRef 가드)')
{
  const clock = createFakeClock()
  const onResultCalls = []
  const props = {
    word: 'apple', meaning: '사과', wordAudioUrl: null,
    hintEnabled: false, direction: 'kr2en',
    onResult: (correct, dir, submitted) => onResultCalls.push({ correct, dir, submitted }),
    onDone: () => {},
  }
  const restore = patchClock(clock)
  let inst
  try {
    inst = mountComponent(SpellingQuestion, props, clock)
    const input = findInput(inst.tree)
    check('입력창 탐지됨', !!input)
    input.props.onChange({ target: { value: 'apple' } })
    const confirmBtn = findButtonByText(inst.tree, '확인')
    check('확인 버튼 탐지됨', !!confirmBtn)
    const onClick = confirmBtn.props.onClick // 같은 핸들러 인스턴스를 캡처
    onClick() // 1차 제출(정답)
    onClick() // 2차 제출 — 동일 클릭 이벤트가 중복 발화된 상황 재현
  } finally { restore() }
  check('onResult 정확히 1회', onResultCalls.length === 1, `실제 ${onResultCalls.length}회 (${JSON.stringify(onResultCalls)})`)
  inst.unmount()
}

section('2b. 동일 시나리오 + StrictMode 이중 effect 실행 — onResult 여전히 1회만')
{
  const clock = createFakeClock()
  const onResultCalls = []
  const props = {
    word: 'apple', meaning: '사과', wordAudioUrl: null,
    hintEnabled: false, direction: 'kr2en',
    onResult: (correct, dir, submitted) => onResultCalls.push({ correct, dir, submitted }),
    onDone: () => {},
  }
  const restore = patchClock(clock)
  let inst
  try {
    inst = mountComponent(SpellingQuestion, props, clock, { strict: true })
    const input = findInput(inst.tree)
    input.props.onChange({ target: { value: 'apple' } })
    const confirmBtn = findButtonByText(inst.tree, '확인')
    const onClick = confirmBtn.props.onClick
    onClick()
    onClick()
  } finally { restore() }
  check('StrictMode: onResult 정확히 1회', onResultCalls.length === 1, `실제 ${onResultCalls.length}회`)
  inst.unmount()
}

// ═══════════════════════════════════════════════════════════════════════
// 3. SpeechBtn — 녹음/STT 성공 경로 완주 후, 이미 클리어된 hang timer
//    콜백까지 "레이스로 인해 결국 실행됐다"고 가정하고 강제로 재호출 →
//    onSuccess/onAttempt는 여전히 1회만 (settledRef 가드)
// ═══════════════════════════════════════════════════════════════════════
section('3. WordDetail.jsx SpeechBtn — STT 성공 처리 완료 후 hang timer 콜백이 뒤늦게(레이스로) 또 실행돼도 → onSuccess/onAttempt 1회만 (settledRef 가드)')
{
  const clock = recordingClock()
  const onSuccessCalls = []
  const onAttemptCalls = []
  const onAnyResultCalls = []
  const maxMs = 5000
  const props = { target: 'apple', wordAudioUrl: 'https://x/apple.mp3', maxMs, onSuccess: () => onSuccessCalls.push(1), onAttempt: () => onAttemptCalls.push(1), onAnyResult: () => onAnyResultCalls.push(1) }

  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: () => {} } }, configurable: true })
  globalThis.__STT_HEARD__ = 'apple' // transcribeViaServerSTT 스텁이 이 값을 돌려줌 → target과 일치 → 성공 경로

  const restore = patchClock(clock)
  let inst
  try {
    inst = mountComponent(SpeechBtn, props, clock)
    const btn = () => allButtons(inst.tree)[0]
    check('초기 idle: 버튼 활성화', btn().props.disabled !== true)

    btn().props.onClick() // 재생(우리 speech 스텁은 onEnd를 동기 호출) → startListen() 진입까지 동기적으로 완주
    check("클릭 직후 phase='listening'으로 전이(우리 stub은 TTS를 즉시 끝냄)", btn().props.children === '👂 이제 말해봐요!')

    // getMicStream()/recordWithAutoStop()/transcribeViaServerSTT()는 진짜
    // Promise 체인(전부 이미 resolve된 값) — 마이크로태스크를 흘려보내
    // finish('success', ...)까지 완주시킨다.
    await flushMicrotasks()
  } finally { restore() }

  check('녹음/STT 성공 경로 완주: onSuccess 1회', onSuccessCalls.length === 1, `실제 ${onSuccessCalls.length}회`)
  check('녹음/STT 성공 경로 완주: onAttempt 1회', onAttemptCalls.length === 1, `실제 ${onAttemptCalls.length}회`)
  check('onAnyResult 1회', onAnyResultCalls.length === 1, `실제 ${onAnyResultCalls.length}회`)

  // hang timer(maxMs+4000)는 finish() 안에서 clearTimeout됐어야 하지만,
  // recordingClock은 취소된 타이머의 콜백도 계속 들고 있다 — 실기기에서
  // "타이머가 막 발화하려는 찰나에 clearTimeout이 도착"하는 레이스를
  // 흉내내 그 콜백을 강제로 한 번 더 실행해본다.
  const hangTimer = clock.scheduled.find((t) => t.ms === maxMs + 4000)
  check('hang timer(maxMs+4000)가 실제로 예약됐었음(재현 전제)', !!hangTimer)
  if (hangTimer) hangTimer.fn() // "레이스로 결국 실행된" 중복 finish 시도

  check('중복 finish 시도 이후에도 onSuccess는 여전히 1회 (settledRef 가드)', onSuccessCalls.length === 1, `실제 ${onSuccessCalls.length}회`)
  check('중복 finish 시도 이후에도 onAttempt는 여전히 1회 (settledRef 가드)', onAttemptCalls.length === 1, `실제 ${onAttemptCalls.length}회`)
  inst.unmount()
  delete globalThis.__STT_HEARD__
}

// ═══════════════════════════════════════════════════════════════════════
// 4. GuidedSession.jsx — WordDetail에 내려주는 onQuizAnswer(=handleQuizAnswer)가
//    같은 완료 이벤트에 대해 두 번 호출돼도 실제 보상 경로(부모의
//    onQuizAnswer)는 1회만 전달돼야 한다. GuidedSession은 WordDetail의
//    내부 가드(QuizStep.isAnswered)에 전적으로 의존하고 자체 방어가 없다 —
//    이 시나리오는 "그 내부 가드를 우회해 handleQuizAnswer 자체가 두 번
//    불렸다면 어떻게 되는가"를 컴포넌트 경계에서 직접 확인한다.
// ═══════════════════════════════════════════════════════════════════════
const gsEntry = 'src/components/GuidedSession.jsx'
await esbuild.build({
  entryPoints: [gsEntry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: path.join(TMP, 'GuidedSession.bundle.mjs'),
  jsx: 'automatic',
  logLevel: 'silent',
  plugins: [{
    name: 'guidedsession-stubs',
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'v:react', namespace: 'v' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'v:jsx', namespace: 'v' }))
      build.onResolve({ filter: /^\.\/WordDetail$/ }, () => ({ path: 'v:worddetail', namespace: 'v' }))
      build.onResolve({ filter: /^\.\/HeroReaction$/ }, () => ({ path: 'v:hero', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/utils\/paulReactions$/ }, () => ({ path: 'v:paul', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/utils\/dailyRitual$/ }, () => ({ path: 'v:ritual', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/config\/features$/ }, () => ({ path: 'v:features', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/utils\/readingApi$/ }, () => ({ path: 'v:reading', namespace: 'v' }))
      build.onResolve({ filter: /^\.\.\/utils\/sentenceProgressApi$/ }, () => ({ path: 'v:sentenceprog', namespace: 'v' }))
      build.onLoad({ filter: /^v:react$/, namespace: 'v' }, () => vstub(REACT_STUB))
      build.onLoad({ filter: /^v:jsx$/, namespace: 'v' }, () => vstub(JSX_RUNTIME_STUB))
      build.onLoad({ filter: /^v:worddetail$/, namespace: 'v' }, () => vstub('export default function WordDetail() { return null }'))
      build.onLoad({ filter: /^v:hero$/, namespace: 'v' }, () => vstub('export default function HeroReaction() { return null }'))
      build.onLoad({ filter: /^v:paul$/, namespace: 'v' }, () => vstub(`
        export const getReactionById = () => ({ id: 'x', image: '/x.png', message: 'm' })
        export const pickReaction = () => ({ id: 'x', image: '/x.png', message: 'm' })
      `))
      build.onLoad({ filter: /^v:ritual$/, namespace: 'v' }, () => vstub(`
        export const planSessionSize = () => 999
        export const sessionProgressDisplay = (o) => ({ wordsCompleted: o.wordsCompleted, totalWords: o.totalWords, sessionNumber: (o.sessionsCompleted || 0) + 1, sessionCount: 1 })
      `))
      build.onLoad({ filter: /^v:features$/, namespace: 'v' }, () => vstub('export const isFeatureEnabled = () => false'))
      build.onLoad({ filter: /^v:reading$/, namespace: 'v' }, () => vstub('export const fetchPassagesForUnit = async () => []'))
      build.onLoad({ filter: /^v:sentenceprog$/, namespace: 'v' }, () => vstub('export const fetchSentenceProgress = async () => ({})'))
    },
  }],
})
const { default: GuidedSession } = await import(pathToFileURL(path.join(TMP, 'GuidedSession.bundle.mjs')).href)

section('4. GuidedSession.jsx — WordDetail에 내려주는 onQuizAnswer(handleQuizAnswer)가 같은 단어 완료에 대해 두 번 불려도 실제 보상 콜백은 1회만이어야 함')
{
  const clock = createFakeClock()
  const guidedClassWords = [
    { id: 'w1', word: 'apple', meaning: '사과' },
    { id: 'w2', word: 'banana', meaning: '바나나' },
    { id: 'w3', word: 'cherry', meaning: '체리' },
  ]
  const onQuizAnswerCalls = []
  const props = {
    classWords: guidedClassWords,
    resumeIndex: 0,
    studentId: '11111111-1111-1111-1111-111111111111',
    unitId: null,
    onStartKeySentence: () => {},
    spellingSettings: null,
    mixedDirections: null,
    spellingCombo: 0,
    spellingReviewQueue: [],
    wordStatus: {},
    onSpellingAnswer: () => {},
    onMarkViewed: () => {},
    onMarkExampleHeard: () => {},
    onMarkPronunciationOk: () => {},
    onMarkQuizSolved: () => {},
    onQuizAnswer: (id, correct) => onQuizAnswerCalls.push({ id, correct }),
    onMarkCompleted: () => {},
    onPronunciationAttempt: () => {},
    onWordKnown: () => {},
    onWordUnknown: () => {},
    onSetLastWordIndex: () => {},
    onDone: () => {},
  }
  const restore = patchClock(clock)
  let inst
  try {
    inst = mountComponent(GuidedSession, props, clock)
    const wdEl = findWordDetailEl(inst.tree)
    check('WordDetail 스텁 엘리먼트에서 onQuizAnswer/onNext 배선 확인됨', !!wdEl)
    // 실제 완료 이벤트 하나("이 단어 퀴즈에서 정답")가 어떤 이유로든
    // handleQuizAnswer를 두 번 트리거하는 상황(예: 상위 콜백 참조가 두 곳에
        // 연결되거나, 재구현 중 실수로 동일 이벤트를 두 경로에서 부르는 경우) 재현.
    wdEl.props.onQuizAnswer('w1', true)
    wdEl.props.onQuizAnswer('w1', true)
  } finally { restore() }
  check(
    'handleQuizAnswer: 같은 단어의 같은 완료 이벤트가 중복 호출돼도 실제 onQuizAnswer(보상 경로)는 1회만 전달돼야 함',
    onQuizAnswerCalls.length === 1,
    `실제 ${onQuizAnswerCalls.length}회 — GuidedSession.jsx handleQuizAnswer()(약 208~215행)는 중복 호출을 막는 가드가 전혀 없음(wordId 기준 idempotency 없음). ` +
    `현재는 전적으로 WordDetail/QuizStep의 내부 isAnswered 가드에만 의존 — 그 가드를 우회하는 어떤 경로(더블탭 경합, 부모 재구현 실수 등)로 이 prop이 두 번 불리면 ` +
    `세션 정답률 집계(statsRef)뿐 아니라 실제 useStudent.recordQuizAnswer(별/포인트) 경로까지 그대로 중복 전달된다 — P1 candidate.`
  )
  inst.unmount()
}

console.log(`\n${passes} PASS, ${failures} FAIL`)
console.log(failures === 0
  ? '\n모든 단언 통과 — 컴포넌트 레이어에서 콜백 중복 발화가 보상 중복을 일으키지 않음(invariant 7 유지)'
  : `\n${failures}개 단언 실패 — 위 실패 상세 참고(실제 재현이면 P1 candidate로 보고, 코드 수정은 하지 않음)`)
process.exit(failures > 0 ? 1 : 0)
